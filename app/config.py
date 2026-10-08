"""Конфигурация «Шёпота»: читает переменные окружения и .env в корне репозитория."""
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ROOT_DIR = os.path.dirname(BASE_DIR)


def load_dotenv(path: str) -> None:
    """Простейший парсер .env: KEY=VALUE, # — комментарии. Не переопределяет уже заданные переменные."""
    if not os.path.exists(path):
        return
    with open(path, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.split(" #")[0].strip().strip('"').strip("'")
            if key:
                os.environ.setdefault(key, value)


load_dotenv(os.path.join(ROOT_DIR, ".env"))


def _int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, "").strip() or default)
    except ValueError:
        return default


class Config:
    # --- Сервер ---------------------------------------------------------
    HOST = os.environ.get("HOST", "0.0.0.0")
    PORT = _int("PORT", 8000)
    DB_PATH = os.environ.get("DB_PATH", os.path.join(ROOT_DIR, "var", "data.db"))

    # --- SMS-провайдер: demo | twilio | smsru ---------------------------
    SMS_PROVIDER = os.environ.get("SMS_PROVIDER", "demo").strip().lower()

    # Twilio
    TWILIO_SID = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
    TWILIO_TOKEN = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
    TWILIO_FROM = os.environ.get("TWILIO_FROM", "").strip()

    # SMS.ru
    SMSRU_API_ID = os.environ.get("SMSRU_API_ID", "").strip()
    SMSRU_TEST = "1" if os.environ.get("SMSRU_TEST", "0").strip() == "1" else "0"

    # Подпись, дописываемая в конец каждого SMS (пусто — без подписи)
    SIGNATURE = os.environ.get("SIGNATURE", "").strip()

    # Секрет для вебхуков входящих SMS: если задан, вебхук требует ?key=...
    WEBHOOK_KEY = os.environ.get("WEBHOOK_KEY", "").strip()

    # --- Ограничения ----------------------------------------------------
    MAX_LEN = _int("MAX_LEN", 1000)        # максимум символов в сообщении
    RATE_PHONE = _int("RATE_PHONE", 5)     # сообщений на один номер получателя в час
    RATE_IP = _int("RATE_IP", 30)          # сообщений с одного IP в час
    RATE_WINDOW = _int("RATE_WINDOW", 3600)  # окно, сек

    @property
    def is_demo(self) -> bool:
        return self.SMS_PROVIDER == "demo"


config = Config()
