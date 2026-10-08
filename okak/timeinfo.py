"""Время, дата, дни до события и дни недели на русском языке."""

from __future__ import annotations

import os
import re
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from .textutil import normalize

DEFAULT_TZ = os.environ.get("OKAK_TZ", "Europe/Moscow")

WEEKDAYS = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"]
MONTHS_GEN = [
    "января", "февраля", "марта", "апреля", "мая", "июня",
    "июля", "августа", "сентября", "октября", "ноября", "декабря",
]
# Первые три буквы названия месяца -> номер месяца.
MONTH_PREFIX = {
    "янв": 1, "фев": 2, "мар": 3, "апр": 4, "мая": 5, "май": 5, "июн": 6,
    "июл": 7, "авг": 8, "сен": 9, "окт": 10, "ноя": 11, "дек": 12,
}

# Город (основа) -> IANA-часовой пояс и отображаемое имя.
CITIES: dict[str, tuple[str, str]] = {
    "москв": ("Europe/Moscow", "Москве"),
    "питер": ("Europe/Moscow", "Санкт-Петербурге"),
    "петербург": ("Europe/Moscow", "Санкт-Петербурге"),
    "новосибирск": ("Asia/Novosibirsk", "Новосибирске"),
    "екатеринбург": ("Asia/Yekaterinburg", "Екатеринбурге"),
    "владивосток": ("Asia/Vladivostok", "Владивостоке"),
    "калининград": ("Europe/Kaliningrad", "Калининграде"),
    "камчатк": ("Asia/Kamchatka", "Камчатке"),
    "иркутск": ("Asia/Irkutsk", "Иркутске"),
    "омск": ("Asia/Omsk", "Омске"),
    "минск": ("Europe/Minsk", "Минске"),
    "киев": ("Europe/Kyiv", "Киеве"),
    "алматы": ("Asia/Almaty", "Алматы"),
    "астан": ("Asia/Almaty", "Астане"),
    "лондон": ("Europe/London", "Лондоне"),
    "париж": ("Europe/Paris", "Париже"),
    "берлин": ("Europe/Berlin", "Берлине"),
    "рим": ("Europe/Rome", "Риме"),
    "мадрид": ("Europe/Madrid", "Мадриде"),
    "стамбул": ("Europe/Istanbul", "Стамбуле"),
    "дубай": ("Asia/Dubai", "Дубае"),
    "пекин": ("Asia/Shanghai", "Пекине"),
    "токио": ("Asia/Tokyo", "Токио"),
    "сеул": ("Asia/Seoul", "Сеуле"),
    "дели": ("Asia/Kolkata", "Дели"),
    "сингапур": ("Asia/Singapore", "Сингапуре"),
    "нью-йорк": ("America/New_York", "Нью-Йорке"),
    "нью йорк": ("America/New_York", "Нью-Йорке"),
    "лос-анджелес": ("America/Los_Angeles", "Лос-Анджелесе"),
    "сидне": ("Australia/Sydney", "Сиднее"),
    "каир": ("Africa/Cairo", "Каире"),
    "utc": ("UTC", "UTC"),
    "гринвич": ("UTC", "Гринвиче"),
}

# Праздники и памятные даты, которые можно считать «до» (месяц, день).
HOLIDAYS: dict[str, tuple[int, int, str]] = {
    "нового года": (1, 1, "Нового года"),
    "новый год": (1, 1, "Нового года"),
    "рождеств": (1, 7, "Рождества"),
    "8 марта": (3, 8, "8 марта"),
    "дня победы": (5, 9, "Дня Победы"),
    "9 мая": (5, 9, "9 мая"),
    "дня России": (6, 12, "Дня России"),
    "дня знаний": (9, 1, "Дня знаний"),
    "хэллоуин": (10, 31, "Хэллоуина"),
    "хеллоуин": (10, 31, "Хэллоуина"),
}

_TIME_RE = re.compile(
    r"(который час|текущее время|время сейчас|точное время|"
    r"сколько (?:сейчас )?времени\??$|какое (?:сейчас )?время\??$|^время$)"
)
_DATE_RE = re.compile(
    r"(какое (?:сегодня |сейчас )?число|какая (?:сегодня |сейчас )?дата|"
    r"какой (?:сегодня |сейчас )?день\??$|что за день|сегодняшн\w* (?:дата|число|день)|"
    r"дата сегодня|число сегодня|сегодня (?:какое )?число|какой день недели|текущая дата|"
    r"сегодняшняя дата|какое сегодня|какое сейчас число|"
    r"(?:какой|какого) (?:сейчас |сегодня )?год(?: сейчас| сегодня| на дворе)?\??$|текущий год)"
)
_CITY_TIME_RE = re.compile(r"(?:время|час|сколько времени|который час)\s+(?:в|во|на)\s+([а-я\- ]+)")
_DATE_IN_TEXT_RE = re.compile(
    r"(\d{1,2})\s+(янв|фев|мар|апр|мая|май|июн|июл|авг|сен|окт|ноя|дек)[а-я]*(?:\s+(\d{4}))?"
)
_DOTTED_DATE_RE = re.compile(r"(\d{1,2})[./](\d{1,2})[./](\d{4})")


def _now(tz_name: str | None = None) -> datetime:
    try:
        tz = ZoneInfo(tz_name or DEFAULT_TZ)
    except ZoneInfoNotFoundError:
        tz = ZoneInfo("UTC")
    return datetime.now(tz)


def _fmt_date(d: date) -> str:
    return f"{d.day} {MONTHS_GEN[d.month - 1]} {d.year} года"


def _fmt_time(dt: datetime) -> str:
    return dt.strftime("%H:%M:%S")


def _weekday(d: date) -> str:
    return WEEKDAYS[d.weekday()].capitalize()


def _tz_label(dt: datetime) -> str:
    offset = dt.utcoffset() or timedelta(0)
    total = int(offset.total_seconds() // 60)
    sign = "+" if total >= 0 else "-"
    hours, minutes = divmod(abs(total), 60)
    return f"UTC{sign}{hours:02d}:{minutes:02d}"


def _parse_date(text: str, today: date) -> date | None:
    """Пытается извлечь дату из текста: «1 января 2027», «25.12.2026», «8 марта» и т.п."""
    m = _DOTTED_DATE_RE.search(text)
    if m:
        try:
            return date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
    m = _DATE_IN_TEXT_RE.search(text)
    if m:
        day = int(m.group(1))
        month = MONTH_PREFIX.get(m.group(2))
        if month is None:
            return None
        year = int(m.group(3)) if m.group(3) else today.year
        try:
            candidate = date(year, month, day)
        except ValueError:
            return None
        if not m.group(3) and candidate < today:
            candidate = date(year + 1, month, day)
        return candidate
    for key, (month, day, _label) in HOLIDAYS.items():
        if month and key in text:
            candidate = date(today.year, month, day)
            if candidate < today:
                candidate = date(today.year + 1, month, day)
            return candidate
    return None


def _find_city(text: str) -> tuple[str, str] | None:
    for stem, value in CITIES.items():
        if stem in text:
            return value
    return None


def answer_time_question(message: str) -> str | None:
    """Возвращает ответ про время/дату, либо None, если вопрос не про это."""
    text = normalize(message).rstrip("?!. ")

    # Время в другом городе.
    m = _CITY_TIME_RE.search(text)
    if m:
        city = _find_city(m.group(1))
        if city:
            tz_name, label = city
            now = _now(tz_name)
            return (
                f"В {label} сейчас {_fmt_time(now)}, {_weekday(now.date()).lower()}, "
                f"{_fmt_date(now.date())} ({_tz_label(now)})."
            )

    # Дни до события / дата события.
    if re.search(r"сколько (?:дней|осталось)", text) or re.search(r"\bдо\b.*\d{4}", text):
        now = _now()
        today = now.date()
        target = _parse_date(text, today)
        if target is not None:
            return _days_until_answer(target, text, today)

    # День недели для конкретной даты.
    if "день недели" in text or re.search(r"какой день\b", text):
        target = _parse_date(text, _now().date())
        if target is not None:
            return f"{_fmt_date(target).capitalize()} — это {WEEKDAYS[target.weekday()]}."

    if _TIME_RE.search(text):
        now = _now()
        return (
            f"Сейчас {_fmt_time(now)} ({_tz_label(now)}, часовой пояс {DEFAULT_TZ}). "
            f"Сегодня {_weekday(now.date()).lower()}, {_fmt_date(now.date())}."
        )

    if _DATE_RE.search(text):
        now = _now()
        today = now.date()
        if re.search(r"год(?: сейчас| сегодня| на дворе)?\??$", text) and "число" not in text and "дата" not in text:
            return f"Сейчас {today.year} год."
        return (
            f"Сегодня {_weekday(today).lower()}, {_fmt_date(today)}. "
            f"Сейчас {_fmt_time(now)} ({_tz_label(now)})."
        )
    return None


def _days_until_answer(target: date, text: str, today: date) -> str:
    delta = (target - today).days
    label = next((lbl for key, (mo, _d, lbl) in HOLIDAYS.items()
                  if mo and key in text and not any(ch.isdigit() for ch in key)), None)
    label = f"{label} ({_fmt_date(target)})" if label else _fmt_date(target)
    if delta > 0:
        return f"До {label} осталось {delta} {_days_word(delta)}."
    if delta == 0:
        return f"Сегодня — {label}! 🎉"
    return f"{label[0].upper() + label[1:]} уже прошло {-delta} {_days_word(-delta)}."


def _days_word(n: int) -> str:
    n = abs(n)
    if n % 10 == 1 and n % 100 != 11:
        return "день"
    if 2 <= n % 10 <= 4 and not 12 <= n % 100 <= 14:
        return "дня"
    return "дней"
