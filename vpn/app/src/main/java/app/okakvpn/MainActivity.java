package app.okakvpn;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.net.VpnService;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.widget.ImageButton;
import android.widget.TextView;

import java.util.Locale;

public class MainActivity extends Activity {

    private static final int REQ_PREPARE = 100;

    private ImageButton power;
    private TextView status;
    private TextView timer;
    private TextView bytes;

    private boolean connected;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final Runnable ticker = new Runnable() {
        @Override
        public void run() {
            if (connected) {
                long s = (System.currentTimeMillis() - LocalVpnService.startTime) / 1000;
                timer.setText(String.format(Locale.getDefault(), "%02d:%02d", s / 60, s % 60));
                handler.postDelayed(this, 1000);
            }
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        power = findViewById(R.id.power);
        status = findViewById(R.id.status);
        timer = findViewById(R.id.timer);
        bytes = findViewById(R.id.bytes);

        LocalVpnService.listener = new LocalVpnService.StatusListener() {
            @Override
            public void onStarted() {
                runOnUiThread(() -> setConnected(true));
            }

            @Override
            public void onStopped() {
                runOnUiThread(() -> setConnected(false));
            }

            @Override
            public void onBytes(final long total) {
                runOnUiThread(() -> bytes.setText("↓ " + human(total)));
            }
        };

        power.setOnClickListener(v -> toggle());
        setConnected(false);
    }

    private void toggle() {
        if (connected) {
            stopService(new Intent(this, LocalVpnService.class));
            setConnected(false);
        } else {
            Intent prepare = VpnService.prepare(this);
            if (prepare != null) {
                startActivityForResult(prepare, REQ_PREPARE);
            } else {
                startVpn();
            }
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_PREPARE && resultCode == RESULT_OK) {
            startVpn();
        }
    }

    private void startVpn() {
        if (Build.VERSION.SDK_INT >= 33) {
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 2);
        }
        status.setText(R.string.status_connecting);
        startForegroundService(new Intent(this, LocalVpnService.class));
    }

    private void setConnected(boolean on) {
        connected = on;
        status.setText(on ? R.string.status_on : R.string.status_off);
        status.setTextColor(getColor(on ? R.color.on : R.color.muted));
        power.getBackground().setTint(getColor(on ? R.color.on : R.color.off));
        if (on) {
            timer.setText("00:00");
            handler.post(ticker);
        } else {
            timer.setText("00:00");
            bytes.setText("↓ 0 Б");
        }
    }

    private static String human(long b) {
        if (b < 1024) return b + " Б";
        if (b < 1024 * 1024) return String.format(Locale.getDefault(), "%.1f КБ", b / 1024.0);
        return String.format(Locale.getDefault(), "%.1f МБ", b / 1048576.0);
    }

    @Override
    protected void onDestroy() {
        handler.removeCallbacks(ticker);
        super.onDestroy();
    }
}
