package ru.shepot.app;

import android.util.Base64;

import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;

/**
 * Отправка SMS через провайдеров. Аналог app/sms.py.
 * Получателю SMS приходит с номера/имени сервиса — отправитель анонимен.
 */
public final class Providers {
    private Providers() {
    }

    public static class Result {
        public final String status;
        public final String provider;
        public final String id;

        public Result(String status, String provider, String id) {
            this.status = status;
            this.provider = provider;
            this.id = id;
        }
    }

    public static Result send(String provider, String phone, String body, JSONObject s) throws Exception {
        if ("twilio".equals(provider)) return twilio(phone, body, s);
        if ("smsru".equals(provider)) return smsru(phone, body, s);
        if ("demo".equals(provider)) {
            return new Result("delivered", "demo", "local");
        }
        throw new Exception("Неизвестный провайдер: " + provider);
    }

    // --- Twilio -----------------------------------------------------------------

    private static Result twilio(String phone, String body, JSONObject s) throws Exception {
        String sid = s.optString("twilio_sid", "").trim();
        String token = s.optString("twilio_token", "").trim();
        String from = s.optString("twilio_from", "").trim();
        if (sid.isEmpty() || token.isEmpty() || from.isEmpty()) {
            throw new Exception("Twilio не настроен: заполните SID, токен и номер отправителя в настройках");
        }
        String form = "To=" + enc(phone) + "&From=" + enc(from) + "&Body=" + enc(body);
        String auth = Base64.encodeToString((sid + ":" + token).getBytes(StandardCharsets.UTF_8), Base64.NO_WRAP);
        HttpURLConnection c = (HttpURLConnection) new URL(
                "https://api.twilio.com/2010-04-01/Accounts/" + sid + "/Messages.json").openConnection();
        try {
            c.setRequestMethod("POST");
            c.setDoOutput(true);
            c.setConnectTimeout(15000);
            c.setReadTimeout(15000);
            c.setRequestProperty("Authorization", "Basic " + auth);
            c.setRequestProperty("Content-Type", "application/x-www-form-urlencoded");
            c.getOutputStream().write(form.getBytes(StandardCharsets.UTF_8));
            c.getOutputStream().close();
            int code = c.getResponseCode();
            String resp = read(c);
            if (code >= 200 && code < 300) {
                String msgSid = new JSONObject(resp).optString("sid", "");
                return new Result("sent", "twilio", msgSid);
            }
            String msg;
            try {
                msg = new JSONObject(resp).optString("message", "");
            } catch (Exception e) {
                msg = resp;
            }
            throw new Exception("Twilio: " + (msg.isEmpty() ? ("HTTP " + code) : msg));
        } finally {
            c.disconnect();
        }
    }

    // --- SMS.ru -------------------------------------------------------------------

    private static Result smsru(String phone, String body, JSONObject s) throws Exception {
        String apiId = s.optString("smsru_api_id", "").trim();
        if (apiId.isEmpty()) {
            throw new Exception("SMS.ru не настроен: заполните API_ID в настройках");
        }
        String test = s.optBoolean("smsru_test", false) ? "1" : "0";
        String to = phone.startsWith("+") ? phone.substring(1) : phone;
        String url = "https://sms.ru/sms/send?api_id=" + enc(apiId)
                + "&to=" + enc(to)
                + "&msg=" + enc(body)
                + "&json=1&test=" + test;
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        try {
            c.setConnectTimeout(15000);
            c.setReadTimeout(15000);
            int code = c.getResponseCode();
            String resp = read(c);
            if (code >= 200 && code < 300) {
                JSONObject json = new JSONObject(resp);
                if ("100".equals(json.optString("status_code"))) {
                    return new Result("sent", "smsru", json.optString("sms_id", ""));
                }
                throw new Exception("SMS.ru: " + json.optString("status_text", "ошибка")
                        + " (код " + json.optString("status_code") + ")");
            }
            throw new Exception("SMS.ru: HTTP " + code);
        } finally {
            c.disconnect();
        }
    }

    // --- утилиты ---------------------------------------------------------------------

    private static String enc(String v) throws Exception {
        return URLEncoder.encode(v, "UTF-8");
    }

    private static String read(HttpURLConnection c) throws Exception {
        InputStream in = null;
        try {
            in = c.getInputStream();
        } catch (Exception e) {
            in = c.getErrorStream();
        }
        if (in == null) return "";
        ByteArrayOutputStream buf = new ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int n;
        while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
        in.close();
        return new String(buf.toByteArray(), StandardCharsets.UTF_8);
    }
}
