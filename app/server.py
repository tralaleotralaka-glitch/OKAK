#!/usr/bin/env python3
"""«Шёпот» — анонимный SMS-мессенджер.

HTTP-сервер на чистом stdlib Python: API + статика + вебхуки входящих SMS.
Запуск: python3 server.py  (или ./run.sh из корня репозитория)
"""
import json
import os
import re
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

from config import config
import sms as smsmod
import store
from sms import SMSError

STATIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
MAX_BODY = 64 * 1024  # 64 КБ на запрос

CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "application/javascript; charset=utf-8",
    ".svg": "image/svg+xml",
    ".png": "image/png",
    ".ico": "image/x-icon",
}


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "Shepot/1.0"

    # --- утилиты -----------------------------------------------------------

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (time.strftime("%H:%M:%S"), fmt % args))

    def _json(self, obj, code=200):
        data = json.dumps(obj, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(data)

    def _error(self, message, code=400):
        self._json({"error": message}, code)

    def _body(self):
        """Читает тело запроса и парсит JSON или form-urlencoded."""
        length = int(self.headers.get("Content-Length") or 0)
        if length <= 0 or length > MAX_BODY:
            return {}
        raw = self.rfile.read(length)
        ctype = (self.headers.get("Content-Type") or "").lower()
        if "application/x-www-form-urlencoded" in ctype:
            return {k: v[0] for k, v in parse_qs(raw.decode("utf-8", "replace")).items()}
        try:
            obj = json.loads(raw.decode("utf-8", "replace"))
            return obj if isinstance(obj, dict) else {}
        except Exception:
            return {}

    @property
    def _client_ip(self) -> str:
        fwd = self.headers.get("X-Forwarded-For", "")
        if fwd:
            return fwd.split(",")[0].strip()
        return self.client_address[0]

    # --- статика -------------------------------------------------------------

    def _static(self, rel_path: str):
        path = os.path.normpath(os.path.join(STATIC_DIR, rel_path.lstrip("/")))
        if not path.startswith(STATIC_DIR) or not os.path.isfile(path):
            self._error("Не найдено", 404)
            return
        ext = os.path.splitext(path)[1].lower()
        with open(path, "rb") as f:
            data = f.read()
        self.send_response(200)
        self.send_header("Content-Type", CONTENT_TYPES.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.end_headers()
        self.wfile.write(data)

    # --- обработка запросов ----------------------------------------------------

    def do_GET(self):
        self._route("GET")

    def do_POST(self):
        self._route("POST")

    def _route(self, method: str):
        try:
            url = urlparse(self.path)
            path = unquote(url.path)
            query = {k: v[0] for k, v in parse_qs(url.query).items()}

            # статика
            if method == "GET":
                if path in ("/", "/index.html"):
                    return self._static("index.html")
                if path.startswith("/static/"):
                    return self._static(path[len("/static/"):])

            # --- API ---
            if path == "/api/health":
                return self._json({"ok": True, "time": int(time.time())})

            if path == "/api/config":
                return self._json({
                    "provider": config.SMS_PROVIDER,
                    "demo": config.is_demo,
                    "signature": config.SIGNATURE,
                    "max_len": config.MAX_LEN,
                })

            if method == "GET" and path == "/api/threads":
                return self._json({"threads": store.list_threads()})

            if method == "POST" and path == "/api/threads":
                data = self._body()
                phone = store.normalize_phone(data.get("phone", ""))
                if not phone:
                    return self._error("Некорректный номер. Пример: +7 999 123-45-67")
                thread = store.get_or_create_thread(phone)
                return self._json({"thread": _thread_view(thread)})

            m = re.fullmatch(r"/api/threads/(\d+)/messages", path)
            if m:
                thread = store.get_thread(int(m.group(1)))
                if not thread:
                    return self._error("Диалог не найден", 404)
                if method == "GET":
                    after = int(query.get("after", 0) or 0)
                    return self._json({"messages": store.list_messages(thread["id"], after)})
                if method == "POST":
                    return self._send_message(thread)

            if method == "GET" and path == "/api/demo/inbox":
                phone = store.normalize_phone(query.get("phone", ""))
                if not phone:
                    return self._error("Некорректный номер")
                msgs = store.demo_list(phone)
                return self._json({"phone": phone, "messages": msgs})

            if method == "POST" and path == "/api/demo/reply":
                data = self._body()
                phone = store.normalize_phone(data.get("phone", ""))
                body = str(data.get("body", "")).strip()[:config.MAX_LEN]
                if not phone or not body:
                    return self._error("Укажите номер и текст")
                thread = store.find_thread_by_phone(phone)
                if not thread:
                    return self._error("Диалог с этим номером ещё не создан", 404)
                store.add_message(thread["id"], "in", body, "received", "demo")
                return self._json({"ok": True})

            # --- Вебхуки входящих SMS ---
            if path in ("/webhook/twilio", "/webhook/smsru"):
                if config.WEBHOOK_KEY and query.get("key") != config.WEBHOOK_KEY:
                    return self._error("Неверный ключ вебхука", 403)
                return self._webhook_inbound(path, query)

            self._error("Не найдено", 404)
        except BrokenPipeError:
            pass
        except Exception as e:  # не роняем поток
            sys.stderr.write("ERROR %s: %r\n" % (self.path, e))
            try:
                self._error("Внутренняя ошибка сервера", 500)
            except Exception:
                pass

    # --- бизнес-логика -------------------------------------------------------

    def _send_message(self, thread: dict):
        data = self._body()
        body = str(data.get("body", "")).strip()
        if not body:
            return self._error("Сообщение пустое")
        if len(body) > config.MAX_LEN:
            return self._error("Максимум %d символов" % config.MAX_LEN)

        # антиспам: на номер получателя и на IP
        if not store.rate_ok("phone", thread["phone"]):
            return self._error(
                "Слишком много сообщений на этот номер. Лимит: %d в час."
                % config.RATE_PHONE, 429)
        ip = self._client_ip
        if not store.rate_ok("ip", ip):
            return self._error(
                "Слишком много сообщений с вашего адреса. Попробуйте позже.", 429)

        try:
            res = smsmod.send(thread["phone"], body)
        except SMSError as e:
            msg_id = store.add_message(thread["id"], "out", body, "failed")
            return self._json(
                {"error": str(e), "message_id": msg_id, "status": "failed"}, 502)

        msg_id = store.add_message(
            thread["id"], "out", body, res["status"], res["provider"], res["id"])
        return self._json({"ok": True, "message_id": msg_id, "status": res["status"]})

    def _webhook_inbound(self, path: str, query: dict):
        """Приём входящих SMS от провайдера -> в диалог (веб-клиент увидит ответ)."""
        items = []
        if path == "/webhook/twilio":
            form = self._body() if self.command == "POST" else query
            if form.get("From") and form.get("Body") is not None:
                items.append({"phone": form["From"], "body": form["Body"]})
        else:  # smsru: data=[{"phone":"7...","message":"..."}]
            raw = query.get("data", "")
            if not raw and self.command == "POST":
                form = self._body()
                raw = form.get("data", "")
            try:
                parsed = json.loads(raw)
                if isinstance(parsed, dict):
                    parsed = parsed.get("list", [parsed])
                for it in parsed or []:
                    items.append({"phone": it.get("phone", ""), "body": it.get("message", "")})
            except Exception:
                pass

        accepted = 0
        for it in items:
            phone = store.normalize_phone(it.get("phone", ""))
            body = str(it.get("body", "")).strip()
            if not phone or not body:
                continue
            thread = store.find_thread_by_phone(phone)
            if thread:
                store.add_message(thread["id"], "in", body, "received")
                accepted += 1
        if path.endswith("twilio"):
            payload = b"<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response/>"
            self.send_response(200)
            self.send_header("Content-Type", "text/xml; charset=utf-8")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        else:
            self._json({"ok": True, "accepted": accepted})


def _thread_view(t: dict) -> dict:
    t = dict(t)
    t["phone_pretty"] = store.format_phone(t["phone"])
    return t


def main():
    store.init_db()
    server = ThreadingHTTPServer((config.HOST, config.PORT), Handler)
    server.daemon_threads = True
    print("«Шёпот» запущен: http://%s:%d  (провайдер: %s)"
          % (config.HOST, config.PORT, config.SMS_PROVIDER))
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nОстановлено.")


if __name__ == "__main__":
    main()
