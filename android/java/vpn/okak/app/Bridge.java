package vpn.okak.app;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.webkit.JavascriptInterface;
import android.widget.Toast;

/**
 * JavaScript Bridge for Android APK
 * Allows WebView to copy configs, open VPN apps, and show toasts.
 */
public class Bridge {
    private final MainActivity act;

    public Bridge(MainActivity act) {
        this.act = act;
    }

    @JavascriptInterface
    public void copyToClipboard(String text) {
        act.runOnUiThread(() -> {
            ClipboardManager cm = (ClipboardManager) act.getSystemService(Context.CLIPBOARD_SERVICE);
            if (cm != null) {
                cm.setPrimaryClip(ClipData.newPlainText("VPN Config", text));
            }
            Toast.makeText(act, "Скопировано в буфер обмена!", Toast.LENGTH_SHORT).show();
        });
    }

    @JavascriptInterface
    public void openVpnLink(String uri) {
        act.runOnUiThread(() -> {
            try {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(uri));
                act.startActivity(intent);
            } catch (Exception e) {
                copyToClipboard(uri);
                Toast.makeText(act, "Ссылка скопирована! Вставьте её в v2rayNG или Streisand", Toast.LENGTH_LONG).show();
            }
        });
    }

    @JavascriptInterface
    public void showToast(String msg) {
        act.runOnUiThread(() -> Toast.makeText(act, msg, Toast.LENGTH_SHORT).show());
    }

    @JavascriptInterface
    public boolean isNativeApp() {
        return true;
    }
}
