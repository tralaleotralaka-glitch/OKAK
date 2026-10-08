package ru.shepot.app;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.net.URLDecoder;
import java.util.HashMap;
import java.util.Map;

/**
 * Маршрутизация «API» внутри приложения. Точно повторяет эндпоинты сервера
 * (app/server.py), поэтому веб-интерфейс работает без изменений —
 * и с сервером по fetch, и в Android через мост ShepotBridge.
 */
public final class Router {
    static final int MAX_LEN = 1000;
    static final int RATE_PHONE = 5;      // сообщений на номер получателя в час
    static final int RATE_WINDOW = 3600;  // окно, сек

    public static class Res {
        public final int code;
        public final String json;

        public Res(int code, String json) {
            this.code = code;
            this.json = json;
        }
    }

    private Router() {
    }

    public static Res handle(Store store, String method, String rawPath, String bodyStr) {
        try {
            String path = rawPath == null ? "" : rawPath;
            int q = path.indexOf('?');
            Map<String, String> query = queryOf(rawPath);
            if (q >= 0) path = path.substring(0, q);

            JSONObject body = new JSONObject();
            if (bodyStr != null && !bodyStr.trim().isEmpty()) {
                try {
                    body = new JSONObject(bodyStr);
                } catch (Exception ignored) {
                }
            }

            if (path.equals("/api/health")) return ok("{\"ok\":true}");

            if (path.equals("/api/config")) return ok(configJson(store));

            if (path.equals("/api/settings") && "POST".equals(method)) {
                store.putSettings(body);
                return ok("{\"ok\":true}");
            }

            if (path.equals("/api/threads")) {
                if ("POST".equals(method)) {
                    String phone = Phone.normalize(body.optString("phone", ""));
                    if (phone == null) {
                        return err(400, "Некорректный номер. Пример: +7 999 123-45-67");
                    }
                    JSONObject t = store.findThreadByPhone(phone);
                    if (t == null) t = store.createThread(phone);
                    JSONObject out = new JSONObject(t.toString());
                    out.put("phone_pretty", Phone.pretty(phone));
                    return ok(new JSONObject().put("thread", out).toString());
                }
                return ok(new JSONObject().put("threads", store.listThreads()).toString());
            }

            if (path.startsWith("/api/threads/") && path.endsWith("/messages")) {
                String[] parts = path.split("/");
                int tid;
                try {
                    tid = Integer.parseInt(parts[3]);
                } catch (Exception e) {
                    return err(404, "Диалог не найден");
                }
                JSONObject t = store.threadById(tid);
                if (t == null) return err(404, "Диалог не найден");
                if ("POST".equals(method)) return sendMessage(store, t, body);
                return ok(new JSONObject().put("messages", store.messagesOf(tid)).toString());
            }

            if (path.equals("/api/demo/inbox")) {
                String phone = Phone.normalize(query.get("phone"));
                if (phone == null) return err(400, "Некорректный номер");
                return ok(new JSONObject()
                        .put("phone", phone)
                        .put("messages", store.demoList(phone)).toString());
            }

            if (path.equals("/api/demo/reply") && "POST".equals(method)) {
                String phone = Phone.normalize(body.optString("phone", ""));
                String text = body.optString("body", "").trim();
                if (phone == null || text.isEmpty()) return err(400, "Укажите номер и текст");
                if (text.length() > MAX_LEN) text = text.substring(0, MAX_LEN);
                JSONObject t = store.findThreadByPhone(phone);
                if (t == null) return err(404, "Диалог с этим номером ещё не создан");
                store.addMessage(t.optInt("id"), "in", text, "received", "demo", "");
                return ok("{\"ok\":true}");
            }

            return err(404, "Не найдено");
        } catch (Throwable e) {
            return new Res(500, "{\"error\":" + quote("Внутренняя ошибка: " + e) + "}");
        }
    }

    // --- отправка сообщения (аналог server._send_message) -----------------------

    private static Res sendMessage(Store store, JSONObject t, JSONObject body) {
        String text = body.optString("body", "").trim();
        if (text.isEmpty()) return err(400, "Сообщение пустое");
        if (text.length() > MAX_LEN) return err(400, "Максимум " + MAX_LEN + " символов");

        String phone = t.optString("phone");
        if (!store.rateOk(phone, RATE_PHONE, RATE_WINDOW)) {
            return err(429, "Слишком много сообщений на этот номер. Лимит: "
                    + RATE_PHONE + " в час.");
        }

        JSONObject s = store.settings();
        String provider = s.optString("provider", "demo").trim().toLowerCase();
        String signature = s.optString("signature", "").trim();
        String fullBody = signature.isEmpty() ? text : (text + " " + signature);

        String status;
        String prov;
        String pid = "";
        try {
            Providers.Result r = Providers.send(provider, phone, fullBody, s);
            status = r.status;
            prov = r.provider;
            pid = r.id;
        } catch (Exception e) {
            int mid = store.addMessage(t.optInt("id"), "out", text, "failed", provider, "");
            try {
                return new Res(502, new JSONObject()
                        .put("error", String.valueOf(e.getMessage()))
                        .put("message_id", mid)
                        .put("status", "failed").toString());
            } catch (JSONException je) {
                return err(502, "Ошибка отправки");
            }
        }

        if ("demo".equals(provider)) store.demoAdd(phone, fullBody);
        int mid = store.addMessage(t.optInt("id"), "out", text, status, prov, pid);
        return ok("{\"ok\":true,\"message_id\":" + mid + ",\"status\":\"" + status + "\"}");
    }

    private static String configJson(Store store) throws JSONException {
        JSONObject s = store.settings();
        String provider = s.optString("provider", "demo");
        JSONObject out = new JSONObject();
        out.put("provider", provider);
        out.put("demo", "demo".equals(provider));
        out.put("signature", s.optString("signature", ""));
        out.put("max_len", MAX_LEN);
        out.put("native", true);
        out.put("settings", s);
        return out.toString();
    }

    // --- утилиты -----------------------------------------------------------------

    private static Res ok(String json) {
        return new Res(200, json);
    }

    private static Res err(int code, String message) {
        return new Res(code, "{\"error\":" + quote(message) + "}");
    }

    private static String quote(String s) {
        return JSONObject.quote(s == null ? "" : s);
    }

    private static Map<String, String> queryOf(String path) {
        Map<String, String> m = new HashMap<>();
        if (path == null) return m;
        int q = path.indexOf('?');
        if (q < 0) return m;
        for (String p : path.substring(q + 1).split("&")) {
            try {
                int eq = p.indexOf('=');
                if (eq < 0) {
                    m.put(URLDecoder.decode(p, "UTF-8"), "");
                } else {
                    m.put(URLDecoder.decode(p.substring(0, eq), "UTF-8"),
                            URLDecoder.decode(p.substring(eq + 1), "UTF-8"));
                }
            } catch (Exception ignored) {
            }
        }
        return m;
    }
}
