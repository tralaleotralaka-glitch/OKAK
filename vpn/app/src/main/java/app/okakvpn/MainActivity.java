package app.okakvpn;

import android.Manifest;
import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.net.VpnService;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.View;
import android.widget.AdapterView;
import android.widget.ArrayAdapter;
import android.widget.ImageButton;
import android.widget.Spinner;
import android.widget.Switch;
import android.widget.TextView;

import java.util.Locale;

public class MainActivity extends Activity {

    static final String PREFS = "propysk";
    static final String KEY_THEME = "dark";
    static final String KEY_DNS = "dns_index";
    private static final int REQ_PREPARE = 100;

    private ImageButton power;
    private TextView status;
    private TextView timer;
    private TextView bytes;
    private View card;
    private Switch themeSwitch;
    private Spinner dnsSpinner;

    private boolean connected;
    private boolean isDark;
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
        SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        isDark = prefs.getBoolean(KEY_THEME, true);
        setTheme(isDark ? R.style.AppTheme : R.style.AppTheme_Light);
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);

        power = findViewById(R.id.power);
        status = findViewById(R.id.status);
        timer = findViewById(R.id.timer);
        bytes = findViewById(R.id.bytes);
        card = findViewById(R.id.card);
        themeSwitch = findViewById(R.id.theme);
        dnsSpinner = findViewById(R.id.dns);

        card.getBackground().setTint(getColor(isDark ? R.color.surface : R.color.surface_light));

        themeSwitch.setChecked(isDark);
        themeSwitch.setOnCheckedChangeListener((btn, checked) -> {
            if (checked != isDark) {
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(KEY_THEME, checked).apply();
                recreate();
            }
        });

        ArrayAdapter<CharSequence> adapter = ArrayAdapter.createFromResource(
                this, R.array.dns_entries, android.R.layout.simple_spinner_item);
        adapter.setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item);
        dnsSpinner.setAdapter(adapter);
        int savedDns = prefs.getInt(KEY_DNS, 0);
        dnsSpinner.setSelection(savedDns);
        dnsSpinner.setOnItemSelectedListener(new AdapterView.OnItemSelectedListener() {
            @Override
            public void onItemSelected(AdapterView<?> p, View v, int pos, long id) {
                getSharedPreferences(PREFS, MODE_PRIVATE).edit().putInt(KEY_DNS, pos).apply();
            }

            @Override
            public void onNothingSelected(AdapterView<?> p) {
            }
        });

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
        status.setTextColor(getColor(on ? R.color.on : (isDark ? R.color.muted : R.color.muted_light)));
        power.getBackground().setTint(getColor(on ? R.color.on : (isDark ? R.color.off : R.color.off_light)));
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
