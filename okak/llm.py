"""Необязательный AI-режим: клиент OpenAI-совместимого API с жёстким таймаутом.

Включается переменными окружения:
  OKAK_LLM_API_KEY (или OPENAI_API_KEY) — ключ;
  OKAK_LLM_BASE_URL — базовый URL (по умолчанию https://api.openai.com/v1);
  OKAK_LLM_MODEL — модель (по умолчанию gpt-4o-mini);
  OKAK_LLM_TIMEOUT — таймаут в секундах (по умолчанию 5.0).
Без ключа бот работает полностью локально.
"""

from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.request

log = logging.getLogger("okak.llm")

SYSTEM_PROMPT = (
    "Ты — OKAK, умный русскоязычный ассистент. Отвечай по-русски, точно и по делу. "
    "Обычно достаточно 2–5 предложений; формулы пиши понятно. "
    "Если не уверен в факте — честно скажи об этом, не выдумывай. "
    "Текущая дата и время: {now}."
)


class LLMClient:
    def __init__(self, base_url: str, api_key: str, model: str, timeout: float):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.timeout = timeout

    @classmethod
    def from_env(cls) -> "LLMClient | None":
        api_key = os.environ.get("OKAK_LLM_API_KEY") or os.environ.get("OPENAI_API_KEY")
        if not api_key:
            return None
        return cls(
            base_url=os.environ.get("OKAK_LLM_BASE_URL", "https://api.openai.com/v1"),
            api_key=api_key,
            model=os.environ.get("OKAK_LLM_MODEL", "gpt-4o-mini"),
            timeout=float(os.environ.get("OKAK_LLM_TIMEOUT", "5.0")),
        )

    def ask(self, question: str, history: list[dict], now_text: str, timeout: float) -> str | None:
        """Возвращает ответ модели или None при ошибке/таймауте. Никогда не бросает исключений."""
        messages = [{"role": "system", "content": SYSTEM_PROMPT.format(now=now_text)}]
        for item in history[-6:]:
            role = item.get("role")
            content = str(item.get("content", ""))[:1000]
            if role in ("user", "assistant") and content:
                messages.append({"role": role, "content": content})
        messages.append({"role": "user", "content": question[:2000]})

        body = json.dumps({
            "model": self.model,
            "messages": messages,
            "max_tokens": 350,
            "temperature": 0.4,
        }).encode("utf-8")
        request = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(request, timeout=max(0.5, timeout)) as resp:
                data = json.loads(resp.read().decode("utf-8"))
            content = data["choices"][0]["message"]["content"]
            return content.strip() or None
        except (urllib.error.URLError, TimeoutError, OSError, ValueError, KeyError, IndexError) as exc:
            log.warning("LLM недоступна: %s", exc)
            return None
