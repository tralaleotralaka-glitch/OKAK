"""SMS-провайдеры «Шёпота».

demo  — SMS не отправляется по-настоящему: сообщение попадает в симулятор
        «телефона получателя» (вкладка в веб-интерфейсе).
twilio — реальная отправка через Twilio API (TWILIO_* в .env).
smsru  — реальная отправка через SMS.ru (SMSRU_API_ID в .env).

Всё, что видит получатель — обычное SMS с номера/имени отправителя сервиса.
Ваш номер и личность получателю недоступны.
"""
import base64
import json
import random
import urllib.parse
import urllib.request

from config import config
import store


class SMSError(Exception):
    """Ошибка отправки SMS (настройки провайдера, сеть, отказ провайдера)."""


def send(phone: str, body: str) -> dict:
    """Отправляет SMS. Возвращает {'status', 'provider', 'id'} или бросает SMSError."""
    full_body = (body + (" " + config.SIGNATURE if config.SIGNATURE else "")).strip()
    provider = config.SMS_PROVIDER
    if provider == "twilio":
        return _twilio(phone, full_body)
    if provider == "smsru":
        return _smsru(phone, full_body)
    if provider == "demo":
        return _demo(phone, full_body)
    raise SMSError("Неизвестный провайдер: %s (доступны demo, twilio, smsru)" % provider)


# --- Провайдеры -------------------------------------------------------------

def _demo(phone: str, body: str) -> dict:
    store.demo_add(phone, body)
    return {
        "status": "delivered",
        "provider": "demo",
        "id": "demo-%08x" % random.getrandbits(32),
    }


def _twilio(phone: str, body: str) -> dict:
    if not (config.TWILIO_SID and config.TWILIO_TOKEN and config.TWILIO_FROM):
        raise SMSError("Twilio не настроен: заполните TWILIO_ACCOUNT_SID, "
                       "TWILIO_AUTH_TOKEN и TWILIO_FROM в файле .env")
    url = "https://api.twilio.com/2010-04-01/Accounts/%s/Messages.json" % config.TWILIO_SID
    data = urllib.parse.urlencode({"To": phone, "From": config.TWILIO_FROM, "Body": body}).encode()
    req = urllib.request.Request(url, data=data, method="POST")
    token = base64.b64encode(("%s:%s" % (config.TWILIO_SID, config.TWILIO_TOKEN)).encode()).decode()
    req.add_header("Authorization", "Basic " + token)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            res = json.loads(r.read().decode())
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read().decode()).get("message", "")
        except Exception:
            detail = str(e)
        raise SMSError("Twilio: %s" % detail)
    except Exception as e:
        raise SMSError("Twilio: сеть недоступна (%s)" % e)
    return {"status": "sent", "provider": "twilio", "id": str(res.get("sid", ""))}


def _smsru(phone: str, body: str) -> dict:
    if not config.SMSRU_API_ID:
        raise SMSError("SMS.ru не настроен: заполните SMSRU_API_ID в файле .env")
    query = urllib.parse.urlencode({
        "api_id": config.SMSRU_API_ID,
        "to": phone.lstrip("+"),
        "msg": body,
        "json": 1,
        "test": config.SMSRU_TEST,
    })
    try:
        with urllib.request.urlopen("https://sms.ru/sms/send?" + query, timeout=15) as r:
            res = json.loads(r.read().decode())
    except Exception as e:
        raise SMSError("SMS.ru: сеть недоступна (%s)" % e)
    if str(res.get("status_code")) == "100":
        return {"status": "sent", "provider": "smsru", "id": str(res.get("sms_id", ""))}
    raise SMSError("SMS.ru: %s (код %s)" % (res.get("status_text", "ошибка"),
                                            res.get("status_code")))
