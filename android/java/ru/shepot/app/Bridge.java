package ru.shepot.app;

import android.webkit.JavascriptInterface;

import org.json.JSONObject;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Мост JavaScript -> Java. Веб-интерфейс вызывает window.ShepotBridge.call(...),
 * ответ приходит в window._shepotCb(id, status, json).
 */
public class Bridge {
    private final MainActivity act;
    private final Store store;
    private final ExecutorService exec = Executors.newSingleThreadExecutor();

    public Bridge(MainActivity act) {
        this.act = act;
        this.store = new Store(act);
    }

    @JavascriptInterface
    public void call(String id, String path, String body, String method) {
        final String fId = id == null ? "0" : id;
        final String fPath = path == null ? "" : path;
        final String fBody = body == null ? "" : body;
        final String fMethod = (method == null || method.isEmpty())
                ? (fBody.isEmpty() ? "GET" : "POST") : method;

        exec.execute(() -> {
            Router.Res r;
            try {
                r = Router.handle(store, fMethod, fPath, fBody);
            } catch (Throwable e) {
                r = new Router.Res(500, "{\"error\":"
                        + JSONObject.quote("Внутренняя ошибка: " + e) + "}");
            }
            final Router.Res fr = r;
            final int cbId;
            try {
                cbId = Integer.parseInt(fId);
            } catch (NumberFormatException e) {
                return;
            }
            act.runOnUiThread(() -> {
                if (act.webView != null) {
                    act.webView.evaluateJavascript(
                            "window._shepotCb(" + cbId + "," + fr.code + ","
                                    + JSONObject.quote(fr.json) + ");", null);
                }
            });
        });
    }
}
