"""Утилиты для нормализации русского текста."""

import re

_TOKEN_RE = re.compile(r"[a-zа-я0-9]+")


def normalize(text: str) -> str:
    """Приводит текст к нижнему регистру, заменяет ё на е и схлопывает пробелы."""
    text = text.strip().lower().replace("ё", "е")
    text = re.sub(r"[«»“”„]", '"', text)
    text = re.sub(r"\s+", " ", text)
    return text


def tokens(text: str) -> list[str]:
    """Разбивает нормализованный текст на слова (буквы и цифры)."""
    return _TOKEN_RE.findall(normalize(text))


def stem_matches(stem: str, token: str) -> bool:
    """Грубое сопоставление основы слова с токеном.

    Короткие основы (до 3 символов) требуют точного совпадения, чтобы
    например «пи» не находило «писать». Длинные — совпадают по префиксу,
    что покрывает падежи: «столиц» → «столицы», «столицу», «столице».
    """
    if len(stem) <= 3:
        return token == stem
    return token.startswith(stem)


def format_number(value: float | int) -> str:
    """Форматирует число для ответа: без хвостов и с запятой как разделителем."""
    if isinstance(value, bool):
        value = int(value)
    if isinstance(value, int) or (isinstance(value, float) and value.is_integer() and abs(value) < 1e15):
        return f"{int(value):,}".replace(",", " ")
    text = f"{value:.10g}"
    if "e" in text or "E" in text:
        return text.replace(".", ",")
    integer, _, frac = text.partition(".")
    integer = f"{int(integer):,}".replace(",", " ")
    return f"{integer},{frac}" if frac else integer
