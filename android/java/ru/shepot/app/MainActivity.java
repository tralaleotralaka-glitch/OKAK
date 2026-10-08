package ru.shepot.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.os.Bundle;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * «Шёпот» — Android-приложение. Внутри — тот же веб-интерфейс, что и на сервере,
 * но вся логика (диалоги, лимиты, отправка через Twilio/SMS.ru) выполняется локально.
 */
public class MainActivity extends Activity {
    public WebView webView;
    private Bridge bridge;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        webView = new WebView(this);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);

        bridge = new Bridge(this);
        webView.addJavascriptInterface(bridge, "ShepotBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return Assets.serve(MainActivity.this, request.getUrl().toString());
            }
        });

        setContentView(webView);
        webView.loadUrl("https://" + Assets.HOST + "/index.html");
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
