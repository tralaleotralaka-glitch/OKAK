"""Запуск веб-сервера OKAK: python3 app.py  (по умолчанию http://0.0.0.0:8000)."""

from __future__ import annotations

import json
import logging
import mimetypes
import os
import sys
from datetime import datetime
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

sys.path.insert(0, str(Path(__file__).parent))

from okak import __version__  # noqa: E402
from okak.engine import build_brain  # noqa: E402
from okak.timeinfo import DEFAULT_TZ  # noqa: E402

STATIC_DIR = Path(__file__).parent / "static"
MAX_BODY = 32 * 1024

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("okak.server")
BRAIN = build_brain()


def _now_iso() -> dict:
    try:
        now = datetime.now(ZoneInfo(DEFAULT_TZ))
    except ZoneInfoNotFoundError:
        now = datetime.now()
    return {"iso": now.isoformat(timespec="seconds"), "tz": DEFAULT_TZ}


class Handler(BaseHTTPRequestHandler):
    server_version = f"OKAK/{__version__}"

    # ------------------------------------------------------------ helpers
    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _send_file(self, path: Path) -> None:
        if not path.is_file():
            self._send_json(404, {"error": "not found"})
            return
        data = path.read_bytes()
        ctype = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        self.wfile.write(data)

    def log_message(self, fmt, *args):  # тише стандартного лога
        log.debug("%s - %s", self.address_string(), fmt % args)

    # ------------------------------------------------------------ routes
    def do_GET(self):  # noqa: N802
        path = urlparse(self.path).path
        if path == "/api/health":
            return self._send_json(200, {"status": "ok", "version": __version__,
                                         "mode": BRAIN.mode, "time": _now_iso()})
        if path == "/api/time":
            return self._send_json(200, _now_iso())
        if path in ("/", ""):
            return self._send_file(STATIC_DIR / "index.html")
        if path.startswith("/static/"):
            target = (STATIC_DIR / path[len("/static/"):]).resolve()
            if STATIC_DIR.resolve() not in target.parents:  # защита от ../
                return self._send_json(403, {"error": "forbidden"})
            return self._send_file(target)
        return self._send_json(404, {"error": "not found"})

    def do_POST(self):  # noqa: N802
        if urlparse(self.path).path != "/api/chat":
            return self._send_json(404, {"error": "not found"})
        try:
            length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            return self._send_json(400, {"error": "bad length"})
        if length <= 0 or length > MAX_BODY:
            return self._send_json(413 if length > MAX_BODY else 400, {"error": "bad body size"})
        try:
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeDecodeError):
            return self._send_json(400, {"error": "invalid json"})

        message = payload.get("message", "")
        history = payload.get("history", [])
        if not isinstance(message, str) or not isinstance(history, list):
            return self._send_json(400, {"error": "invalid fields"})
        history = [h for h in history if isinstance(h, dict)][-8:]

        reply = BRAIN.reply(message, history)
        return self._send_json(200, reply.as_dict())


def main() -> None:
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "8000"))
    server = ThreadingHTTPServer((host, port), Handler)
    server.daemon_threads = True
    log.info("OKAK запущен на http://%s:%s (режим: %s)", host, port, BRAIN.mode)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
