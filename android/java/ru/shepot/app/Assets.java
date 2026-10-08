package ru.shepot.app;

import android.content.Context;
import android.webkit.WebResourceResponse;

import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/** Раздача веб-интерфейса из assets/www вместо сети (origin https://appassets.local). */
public final class Assets {
    public static final String HOST = "appassets.local";

    private static final Map<String, String> MIME = new HashMap<>();

    static {
        MIME.put("html", "text/html");
        MIME.put("css", "text/css");
        MIME.put("js", "application/javascript");
        MIME.put("svg", "image/svg+xml");
        MIME.put("png", "image/png");
        MIME.put("ico", "image/x-icon");
        MIME.put("json", "application/json");
    }

    private Assets() {
    }

    /** Возвращает ответ из ассетов либо null (пусть WebView обрабатывает сам). */
    public static WebResourceResponse serve(Context ctx, String url) {
        if (url == null || !url.contains(HOST)) return null;
        String path = url;
        int scheme = path.indexOf("://");
        if (scheme >= 0) {
            String rest = path.substring(scheme + 3);
            int slash = rest.indexOf('/');
            path = slash >= 0 ? rest.substring(slash) : "/";
        }
        int q = path.indexOf('?');
        if (q >= 0) path = path.substring(0, q);
        int hash = path.indexOf('#');
        if (hash >= 0) path = path.substring(0, hash);
        if (path.isEmpty() || path.equals("/")) path = "/index.html";
        if (path.contains("..")) return null;

        String asset = "www" + path;
        String ext = "";
        int dot = path.lastIndexOf('.');
        if (dot >= 0) ext = path.substring(dot + 1).toLowerCase();
        String mime = MIME.get(ext);
        if (mime == null) return null;

        try {
            InputStream in = ctx.getAssets().open(asset);
            WebResourceResponse resp = new WebResourceResponse(mime,
                    mime.startsWith("text/") || mime.contains("javascript") ? "utf-8" : null, in);
            return resp;
        } catch (IOException e) {
            return null;
        }
    }
}
