"""Движок OKAK: маршрутизирует вопрос к нужному модулю и гарантирует время ответа."""

from __future__ import annotations

import logging
import os
import time
from dataclasses import dataclass
from datetime import datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .knowledge import KnowledgeBase, answer_capital, default_knowledge
from .llm import LLMClient
from .mathsolver import answer_math_question
from .smalltalk import answer_smalltalk
from .timeinfo import DEFAULT_TZ, answer_time_question

log = logging.getLogger("okak.engine")

# Общий бюджет на ответ. Пользователь ждёт меньше 7 секунд, оставляем запас.
TOTAL_BUDGET_S = float(os.environ.get("OKAK_BUDGET", "6.0"))
MAX_MESSAGE_CHARS = 2000

FALLBACK = (
    "Пока не знаю точного ответа на этот вопрос. Попробуйте переформулировать его "
    "или спросите о времени, дате, математике, истории, науке или географии."
)
FALLBACK_LLM_HINT = (
    "\n\nДля ответов на любые вопросы можно включить AI-режим: задайте переменную "
    "окружения OKAK_LLM_API_KEY."
)


@dataclass
class Reply:
    text: str
    intent: str   # smalltalk | time | math | capital | knowledge | llm | fallback
    source: str   # local | llm
    elapsed_ms: int = 0

    def as_dict(self) -> dict:
        return {"reply": self.text, "intent": self.intent, "source": self.source, "elapsed_ms": self.elapsed_ms}


def _now() -> datetime:
    try:
        return datetime.now(ZoneInfo(DEFAULT_TZ))
    except ZoneInfoNotFoundError:
        return datetime.now(ZoneInfo("UTC"))


class Brain:
    def __init__(self, kb: KnowledgeBase | None = None, llm: LLMClient | None = None,
                 budget_s: float = TOTAL_BUDGET_S):
        self.kb = kb or default_knowledge()
        self.llm = llm
        self.budget_s = budget_s

    @property
    def mode(self) -> str:
        return "ai" if self.llm else "local"

    def _safe(self, name: str, fn, message: str):
        try:
            return fn(message)
        except Exception:  # один модуль не должен ломать весь ответ
            log.exception("Ошибка модуля %s", name)
            return None

    def reply(self, message: str, history: list[dict] | None = None) -> Reply:
        started = time.monotonic()
        message = (message or "").strip()[:MAX_MESSAGE_CHARS]
        result = self._route(message, history or [], started)
        result.elapsed_ms = int((time.monotonic() - started) * 1000)
        return result

    def _route(self, message: str, history: list[dict], started: float) -> Reply:
        now = _now()

        # 1. Приветствия, благодарности, помощь — без поиска.
        text = self._safe("smalltalk", lambda m: answer_smalltalk(m, now), message)
        if text:
            return Reply(text, "smalltalk", "local")
        if not message:
            return Reply("Напишите вопрос — я постараюсь помочь.", "smalltalk", "local")

        # 2. Время и дата: всегда точные, берутся из часового пояса сервера.
        text = self._safe("time", answer_time_question, message)
        if text:
            return Reply(text, "time", "local")

        # 3. Математика.
        text = self._safe("math", answer_math_question, message)
        if text:
            return Reply(text, "math", "local")

        # 4. Столицы стран.
        text = self._safe("capital", answer_capital, message)
        if text:
            return Reply(text, "capital", "local")

        # 5. Встроенная база знаний.
        hit = self._safe("knowledge", self.kb.search, message)
        if hit:
            return Reply(hit.answer, "knowledge", "local")

        # 6. AI-режим для всего остального, если включён и есть время.
        if self.llm:
            remaining = self.budget_s - (time.monotonic() - started)
            timeout = min(self.llm.timeout, remaining - 0.2)
            if timeout >= 1.0:
                now_text = now.strftime("%d.%m.%Y, %H:%M") + f" ({DEFAULT_TZ})"
                answer = self.llm.ask(message, history, now_text, timeout)
                if answer:
                    return Reply(answer, "llm", "llm")

        # 7. Честный запасной ответ.
        hint = "" if self.llm else FALLBACK_LLM_HINT
        return Reply(FALLBACK + hint, "fallback", "local")


def build_brain() -> Brain:
    return Brain(llm=LLMClient.from_env())
