"""SQLite-хранилище «Шёпота»: диалоги, сообщения, лимиты, демо-входящие."""
import os
import re
import sqlite3
import time

from config import config


_SCHEMA = """
CREATE TABLE IF NOT EXISTS threads(
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    phone       TEXT NOT NULL UNIQUE,
    created_at  INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages(
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    thread_id        INTEGER NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    direction        TEXT NOT NULL CHECK(direction IN ('out','in')),
    body             TEXT NOT NULL,
    status           TEXT NOT NULL DEFAULT 'queued',
    provider         TEXT NOT NULL DEFAULT '',
    provider_msg_id  TEXT NOT NULL DEFAULT '',
    created_at       INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id, id);
CREATE TABLE IF NOT EXISTS rate_events(
    id   INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL,
    key  TEXT NOT NULL,
    ts   INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_rate ON rate_events(kind, key, ts);
CREATE TABLE IF NOT EXISTS demo_inbox(
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    phone      TEXT NOT NULL,
    body       TEXT NOT NULL,
    created_at INTEGER NOT NULL
);
"""

def _conn() -> sqlite3.Connection:
    os.makedirs(os.path.dirname(config.DB_PATH), exist_ok=True)
    c = sqlite3.connect(config.DB_PATH, timeout=10)
    c.row_factory = sqlite3.Row
    c.execute("PRAGMA journal_mode=WAL")
    c.execute("PRAGMA foreign_keys=ON")
    # база могла быть удалена/заменена под живым сервером — проверяем наличие схемы
    row = c.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='threads'"
    ).fetchone()
    if not row:
        c.executescript(_SCHEMA)
    return c


def init_db() -> None:
    with _conn() as c:
        c.executescript(_SCHEMA)


# --- Телефоны -------------------------------------------------------------

def normalize_phone(raw: str):
    """Приводит ввод к E.164-ish виду +<7..15 цифр>. 8-ка в начале (РФ) -> 7."""
    if raw is None:
        return None
    digits = re.sub(r"\D", "", str(raw))
    if digits.startswith("8") and len(digits) == 11:
        digits = "7" + digits[1:]
    if not (7 <= len(digits) <= 15):
        return None
    return "+" + digits


def format_phone(phone: str) -> str:
    d = re.sub(r"\D", "", phone)
    if len(d) == 11 and d.startswith("7"):
        return "+7 ({}) {}-{}-{}".format(d[1:4], d[4:7], d[7:9], d[9:11])
    return phone


# --- Диалоги и сообщения ---------------------------------------------------

def get_or_create_thread(phone: str):
    with _conn() as c:
        row = c.execute("SELECT * FROM threads WHERE phone = ?", (phone,)).fetchone()
        if row:
            return dict(row)
        cur = c.execute(
            "INSERT INTO threads(phone, created_at) VALUES(?, ?)", (phone, int(time.time()))
        )
        row = c.execute("SELECT * FROM threads WHERE id = ?", (cur.lastrowid,)).fetchone()
        return dict(row)


def get_thread(thread_id: int):
    with _conn() as c:
        row = c.execute("SELECT * FROM threads WHERE id = ?", (thread_id,)).fetchone()
        return dict(row) if row else None


def find_thread_by_phone(phone: str):
    with _conn() as c:
        row = c.execute("SELECT * FROM threads WHERE phone = ?", (phone,)).fetchone()
        return dict(row) if row else None


def list_threads():
    with _conn() as c:
        rows = c.execute(
            """
            SELECT t.id, t.phone, t.created_at,
                   (SELECT body FROM messages m WHERE m.thread_id = t.id
                     ORDER BY m.id DESC LIMIT 1) AS last_body,
                   (SELECT direction FROM messages m WHERE m.thread_id = t.id
                     ORDER BY m.id DESC LIMIT 1) AS last_direction,
                   (SELECT created_at FROM messages m WHERE m.thread_id = t.id
                     ORDER BY m.id DESC LIMIT 1) AS last_at
            FROM threads t
            ORDER BY COALESCE(last_at, t.created_at) DESC, t.id DESC
            """
        ).fetchall()
        return [dict(r) for r in rows]


def add_message(thread_id: int, direction: str, body: str, status: str,
                provider: str = "", provider_msg_id: str = "") -> int:
    with _conn() as c:
        cur = c.execute(
            "INSERT INTO messages(thread_id, direction, body, status, provider,"
            " provider_msg_id, created_at) VALUES(?,?,?,?,?,?,?)",
            (thread_id, direction, body, status, provider, provider_msg_id, int(time.time())),
        )
        return cur.lastrowid


def list_messages(thread_id: int, after: int = 0):
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM messages WHERE thread_id = ? AND id > ? ORDER BY id",
            (thread_id, after),
        ).fetchall()
        return [dict(r) for r in rows]


def update_message_status(message_id: int, status: str) -> None:
    with _conn() as c:
        c.execute("UPDATE messages SET status = ? WHERE id = ?", (status, message_id))


# --- Антиспам --------------------------------------------------------------

def rate_ok(kind: str, key: str) -> bool:
    """Проверяет лимит сообщений для ключа (номер получателя или IP)."""
    now = int(time.time())
    limit = config.RATE_PHONE if kind == "phone" else config.RATE_IP
    with _conn() as c:
        cnt = c.execute(
            "SELECT COUNT(*) AS n FROM rate_events WHERE kind=? AND key=? AND ts > ?",
            (kind, key, now - config.RATE_WINDOW),
        ).fetchone()["n"]
        if cnt >= limit:
            return False
        c.execute(
            "INSERT INTO rate_events(kind, key, ts) VALUES(?,?,?)", (kind, key, now)
        )
        # подчищаем старые события
        c.execute("DELETE FROM rate_events WHERE ts <= ?", (now - config.RATE_WINDOW,))
        return True


# --- Демо-режим: «телефон получателя» ---------------------------------------

def demo_add(phone: str, body: str) -> int:
    with _conn() as c:
        cur = c.execute(
            "INSERT INTO demo_inbox(phone, body, created_at) VALUES(?,?,?)",
            (phone, body, int(time.time())),
        )
        return cur.lastrowid


def demo_list(phone: str):
    with _conn() as c:
        rows = c.execute(
            "SELECT * FROM demo_inbox WHERE phone = ? ORDER BY id", (phone,)
        ).fetchall()
        return [dict(r) for r in rows]
