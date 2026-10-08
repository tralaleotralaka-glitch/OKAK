package ru.shepot.app;

import android.content.Context;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.File;
import java.io.FileInputStream;
import java.io.FileWriter;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

/**
 * Локальное хранилище приложения: диалоги, сообщения, демо-«телефон получателя»,
 * лимиты и настройки. Всё в одном JSON-файле в приватной папке приложения.
 * Структуры зеркалят схему серверной версии (app/store.py).
 */
public class Store {
    private final File file;
    public final JSONObject state;

    public Store(Context ctx) {
        file = new File(ctx.getFilesDir(), "store.json");
        state = load();
    }

    private JSONObject load() {
        try {
            if (file.exists()) return new JSONObject(readFile());
        } catch (Exception ignored) {
        }
        JSONObject s = new JSONObject();
        try {
            s.put("seq", 1);
            s.put("threads", new JSONArray());
            s.put("messages", new JSONArray());
            s.put("demo", new JSONArray());
            s.put("ratePhone", new JSONObject());
        } catch (JSONException e) {
            throw new RuntimeException(e);
        }
        return s;
    }

    private String readFile() throws IOException {
        InputStream in = new FileInputStream(file);
        java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
        byte[] chunk = new byte[8192];
        int n;
        while ((n = in.read(chunk)) > 0) buf.write(chunk, 0, n);
        in.close();
        return new String(buf.toByteArray(), StandardCharsets.UTF_8);
    }

    public synchronized void save() {
        try {
            FileWriter w = new FileWriter(file);
            w.write(state.toString());
            w.close();
        } catch (IOException ignored) {
        }
    }

    // --- потоки данных -----------------------------------------------------

    private JSONArray arr(String key) {
        JSONArray a = state.optJSONArray(key);
        if (a == null) {
            a = new JSONArray();
            try {
                state.put(key, a);
            } catch (JSONException ignored) {
            }
        }
        return a;
    }

    private JSONObject map(String key) {
        JSONObject m = state.optJSONObject(key);
        if (m == null) {
            m = new JSONObject();
            try {
                state.put(key, m);
            } catch (JSONException ignored) {
            }
        }
        return m;
    }

    public synchronized JSONObject settings() {
        JSONObject s = state.optJSONObject("settings");
        return s == null ? new JSONObject() : s;
    }

    public synchronized void putSettings(JSONObject s) {
        try {
            state.put("settings", s);
        } catch (JSONException ignored) {
        }
        save();
    }

    // --- диалоги -------------------------------------------------------------

    public synchronized JSONObject threadById(int id) {
        JSONArray ts = arr("threads");
        for (int i = 0; i < ts.length(); i++) {
            JSONObject t = ts.optJSONObject(i);
            if (t != null && t.optInt("id") == id) return t;
        }
        return null;
    }

    public synchronized JSONObject findThreadByPhone(String phone) {
        JSONArray ts = arr("threads");
        for (int i = 0; i < ts.length(); i++) {
            JSONObject t = ts.optJSONObject(i);
            if (t != null && phone.equals(t.optString("phone"))) return t;
        }
        return null;
    }

    public synchronized JSONObject createThread(String phone) throws JSONException {
        JSONObject t = new JSONObject();
        t.put("id", nextSeq());
        t.put("phone", phone);
        t.put("created_at", now());
        arr("threads").put(t);
        save();
        return t;
    }

    /** Список диалогов с последним сообщением, как в серверном /api/threads. */
    public synchronized JSONArray listThreads() {
        JSONArray out = new JSONArray();
        JSONArray ts = arr("threads");
        for (int i = 0; i < ts.length(); i++) {
            JSONObject t = ts.optJSONObject(i);
            if (t == null) continue;
            try {
                JSONObject copy = new JSONObject(t.toString());
                copy.put("phone_pretty", Phone.pretty(t.optString("phone")));
                JSONObject last = lastMessage(t.optInt("id"));
                if (last != null) {
                    copy.put("last_body", last.optString("body"));
                    copy.put("last_direction", last.optString("direction"));
                    copy.put("last_at", last.optLong("created_at"));
                }
                out.put(copy);
            } catch (JSONException ignored) {
            }
        }
        // новые сверху
        JSONArray sorted = new JSONArray();
        java.util.TreeSet<Long> keys = new java.util.TreeSet<>(java.util.Collections.reverseOrder());
        java.util.Map<Long, JSONObject> byKey = new java.util.HashMap<>();
        for (int i = 0; i < out.length(); i++) {
            JSONObject t = out.optJSONObject(i);
            if (t == null) continue;
            long key = t.has("last_at") ? t.optLong("last_at") * 10000L - t.optInt("id") : t.optLong("created_at") * 10000L;
            keys.add(key);
            byKey.put(key, t);
        }
        for (Long k : keys) {
            JSONObject t = byKey.get(k);
            if (t != null) sorted.put(t);
        }
        return sorted;
    }

    // --- сообщения -----------------------------------------------------------

    public synchronized JSONArray messagesOf(int threadId) {
        JSONArray out = new JSONArray();
        JSONArray ms = arr("messages");
        for (int i = 0; i < ms.length(); i++) {
            JSONObject m = ms.optJSONObject(i);
            if (m != null && m.optInt("thread_id") == threadId) out.put(m);
        }
        return out;
    }

    private JSONObject lastMessage(int threadId) {
        JSONObject last = null;
        JSONArray ms = arr("messages");
        for (int i = 0; i < ms.length(); i++) {
            JSONObject m = ms.optJSONObject(i);
            if (m != null && m.optInt("thread_id") == threadId) last = m;
        }
        return last;
    }

    public synchronized int addMessage(int threadId, String direction, String body,
                                       String status, String provider, String providerMsgId) {
        try {
            JSONObject m = new JSONObject();
            m.put("id", nextSeq());
            m.put("thread_id", threadId);
            m.put("direction", direction);
            m.put("body", body);
            m.put("status", status);
            m.put("provider", provider);
            m.put("provider_msg_id", providerMsgId);
            m.put("created_at", now());
            arr("messages").put(m);
            save();
            return m.getInt("id");
        } catch (JSONException e) {
            return -1;
        }
    }

    // --- демо-режим: «телефон получателя» --------------------------------------

    public synchronized void demoAdd(String phone, String body) {
        try {
            JSONObject m = new JSONObject();
            m.put("id", nextSeq());
            m.put("phone", phone);
            m.put("body", body);
            m.put("created_at", now());
            arr("demo").put(m);
            save();
        } catch (JSONException ignored) {
        }
    }

    public synchronized JSONArray demoList(String phone) {
        JSONArray out = new JSONArray();
        JSONArray all = arr("demo");
        for (int i = 0; i < all.length(); i++) {
            JSONObject m = all.optJSONObject(i);
            if (m != null && phone.equals(m.optString("phone"))) out.put(m);
        }
        return out;
    }

    // --- антиспам ---------------------------------------------------------------

    public synchronized boolean rateOk(String key, int limit, int windowSec) {
        JSONObject m = map("ratePhone");
        JSONArray ts = m.optJSONArray(key);
        if (ts == null) {
            ts = new JSONArray();
            try {
                m.put(key, ts);
            } catch (JSONException ignored) {
            }
        }
        long now = now();
        JSONArray fresh = new JSONArray();
        for (int i = 0; i < ts.length(); i++) {
            long t = ts.optLong(i);
            if (t > now - windowSec) fresh.put(t);
        }
        if (fresh.length() >= limit) {
            return false;
        }
        fresh.put(now);
        try {
            m.put(key, fresh);
        } catch (JSONException ignored) {
        }
        save();
        return true;
    }

    // --- мелочи ------------------------------------------------------------------

    private int nextSeq() {
        int seq = state.optInt("seq", 1);
        try {
            state.put("seq", seq + 1);
        } catch (JSONException ignored) {
        }
        return seq;
    }

    private static long now() {
        return System.currentTimeMillis() / 1000L;
    }
}
