"""Встроенная база знаний: факты по ключевым словам и словарь столиц."""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from .textutil import normalize, stem_matches, tokens

DATA_FILE = Path(__file__).parent / "data" / "knowledge_ru.json"
MIN_SCORE = 4  # минимальная суммарная длина совпавших основ

# (основы названия страны, название страны, столица)
COUNTRIES: list[tuple[list[str], str, str]] = [
    (["росси"], "России", "Москва"),
    (["франц"], "Франции", "Париж"),
    (["германи"], "Германии", "Берлин"),
    (["итали"], "Италии", "Рим"),
    (["испани"], "Испании", "Мадрид"),
    (["португали"], "Португалии", "Лиссабон"),
    (["великобритани", "англи"], "Великобритании", "Лондон"),
    (["ирланди"], "Ирландии", "Дублин"),
    (["нидерланд", "голланди"], "Нидерландов", "Амстердам"),
    (["бельги"], "Бельгии", "Брюссель"),
    (["швейцари"], "Швейцарии", "Берн"),
    (["австри"], "Австрии", "Вена"),
    (["чехи"], "Чехии", "Прага"),
    (["польш"], "Польши", "Варшава"),
    (["венгри"], "Венгрии", "Будапешт"),
    (["греци"], "Греции", "Афины"),
    (["швеци"], "Швеции", "Стокгольм"),
    (["норвеги"], "Норвегии", "Осло"),
    (["финлянди"], "Финляндии", "Хельсинки"),
    (["дани"], "Дании", "Копенгаген"),
    (["украин"], "Украины", "Киев"),
    (["беларус"], "Беларуси", "Минск"),
    (["литв"], "Литвы", "Вильнюс"),
    (["латви"], "Латвии", "Рига"),
    (["эстони"], "Эстонии", "Таллин"),
    (["молдов"], "Молдовы", "Кишинёв"),
    (["грузи"], "Грузии", "Тбилиси"),
    (["армени"], "Армении", "Ереван"),
    (["азербайджан"], "Азербайджана", "Баку"),
    (["казахстан"], "Казахстана", "Астана"),
    (["монголи"], "Монголии", "Улан-Батор"),
    (["турци"], "Турции", "Анкара"),
    (["иран"], "Ирана", "Тегеран"),
    (["египт"], "Египта", "Каир"),
    (["китай"], "Китая", "Пекин"),
    (["япони"], "Японии", "Токио"),
    (["индии", "инди"], "Индии", "Нью-Дели"),
    (["таиланд"], "Таиланда", "Бангкок"),
    (["вьетнам"], "Вьетнама", "Ханой"),
    (["индонези"], "Индонезии", "Джакарта"),
    (["австрали"], "Австралии", "Канберра"),
    (["канад"], "Канады", "Оттава"),
    (["мексик"], "Мексики", "Мехико"),
    (["бразили"], "Бразилии", "Бразилиа"),
    (["аргентин"], "Аргентины", "Буэнос-Айрес"),
    (["сша", "соединенн штат"], "США", "Вашингтон"),
]


@dataclass
class KnowledgeHit:
    answer: str
    topic: str
    score: int


class KnowledgeBase:
    def __init__(self, entries: list[dict]):
        self.entries = entries

    @classmethod
    def load(cls, path: Path = DATA_FILE) -> "KnowledgeBase":
        return cls(json.loads(path.read_text(encoding="utf-8")))

    @staticmethod
    def _keyword_score(keyword: str, toks: list[str]) -> int:
        """Ключевая фраза засчитывается, если каждое её слово найдено в запросе."""
        words = keyword.split()
        for word in words:
            if not any(stem_matches(word, t) for t in toks):
                return 0
        # Короткие аббревиатуры («днк», «рф», «пи») — точное совпадение считаем сильным сигналом.
        if len(words) == 1 and len(words[0]) < MIN_SCORE:
            return MIN_SCORE
        return sum(len(w) for w in words)

    def search(self, message: str) -> KnowledgeHit | None:
        toks = tokens(message)
        if not toks:
            return None
        best: KnowledgeHit | None = None
        for entry in self.entries:
            score = sum(self._keyword_score(kw, toks) for kw in entry["keywords"])
            if score >= MIN_SCORE and (best is None or score > best.score):
                best = KnowledgeHit(entry["answer"], entry.get("topic", ""), score)
        return best


@lru_cache(maxsize=1)
def default_knowledge() -> KnowledgeBase:
    return KnowledgeBase.load()


def answer_capital(message: str) -> str | None:
    """«Столица Франции?» → «Столица Франции — Париж»."""
    text = normalize(message)
    toks = tokens(text)
    if not any(stem_matches("столиц", t) for t in toks):
        return None
    for stems, country, capital in COUNTRIES:
        if any(stem_matches(s, t) for s in stems for t in toks):
            return f"Столица {country} — {capital}."
    return None
