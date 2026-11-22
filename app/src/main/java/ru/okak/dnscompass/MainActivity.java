package ru.okak.dnscompass;

import android.app.Activity;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.Gravity;
import android.view.View;
import android.view.inputmethod.InputMethodManager;
import android.content.Context;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final int BG = Color.rgb(16, 26, 37);
    private static final int PANEL = Color.rgb(27, 41, 56);
    private static final int MINT = Color.rgb(121, 226, 192);
    private static final int WHITE = Color.rgb(239, 245, 250);
    private static final int MUTED = Color.rgb(166, 182, 198);

    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private final ExecutorService workers = Executors.newFixedThreadPool(5);
    private final List<Resolver> resolvers = List.of(
            new Resolver("Cloudflare", "1.1.1.1 · быстрый публичный DNS", "https://cloudflare-dns.com/dns-query"),
            new Resolver("Google Public DNS", "8.8.8.8 · глобальная сеть", "https://dns.google/resolve"),
            new Resolver("Quad9", "9.9.9.9 · защита от вредоносных доменов", "https://dns.quad9.net/dns-query"),
            new Resolver("AdGuard DNS", "94.140.14.14 · фильтрация рекламы", "https://dns.adguard-dns.com/resolve"),
            new Resolver("Mullvad DNS", "Альтернативный публичный DoH", "https://doh.mullvad.net/dns-query")
    );

    private LinearLayout cards;
    private EditText domainInput;
    private Button testButton;
    private int completed;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(BG);
        getWindow().setNavigationBarColor(BG);
        buildScreen();
    }

    private void buildScreen() {
        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        scroll.setBackgroundColor(BG);
        LinearLayout page = new LinearLayout(this);
        page.setOrientation(LinearLayout.VERTICAL);
        page.setPadding(dp(22), dp(28), dp(22), dp(30));
        scroll.addView(page);

        TextView eyebrow = label("СЕТЕВАЯ ДИАГНОСТИКА", 12, MINT, true);
        page.addView(eyebrow);
        TextView title = label("DNS Compass", 32, WHITE, true);
        LinearLayout.LayoutParams titleParams = params(-1, -2);
        titleParams.topMargin = dp(8);
        page.addView(title, titleParams);
        TextView intro = label("Сравните время ответа публичных DNS-over-HTTPS резолверов для выбранного домена.", 15, MUTED, false);
        LinearLayout.LayoutParams introParams = params(-1, -2);
        introParams.topMargin = dp(9);
        page.addView(intro, introParams);

        LinearLayout form = panel();
        LinearLayout.LayoutParams formParams = params(-1, -2);
        formParams.topMargin = dp(22);
        page.addView(form, formParams);
        TextView domainLabel = label("ДОМЕН ДЛЯ ПРОВЕРКИ", 11, MUTED, true);
        form.addView(domainLabel);
        domainInput = new EditText(this);
        domainInput.setSingleLine(true);
        domainInput.setText("youtube.com");
        domainInput.setTextColor(WHITE);
        domainInput.setHintTextColor(MUTED);
        domainInput.setTextSize(16);
        domainInput.setSelectAllOnFocus(true);
        domainInput.setPadding(dp(13), dp(11), dp(13), dp(11));
        domainInput.setBackground(rounded(Color.rgb(37, 53, 70), dp(12)));
        LinearLayout.LayoutParams inputParams = params(-1, dp(50));
        inputParams.topMargin = dp(10);
        form.addView(domainInput, inputParams);

        testButton = new Button(this);
        testButton.setText("Проверить DNS-серверы");
        testButton.setTransformationMethod(null);
        testButton.setTextSize(15);
        testButton.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        testButton.setTextColor(BG);
        testButton.setBackground(rounded(MINT, dp(14)));
        LinearLayout.LayoutParams buttonParams = params(-1, dp(52));
        buttonParams.topMargin = dp(13);
        form.addView(testButton, buttonParams);
        testButton.setOnClickListener(v -> runTests());

        TextView section = label("ПУБЛИЧНЫЕ РЕЗОЛВЕРЫ", 12, MUTED, true);
        LinearLayout.LayoutParams sectionParams = params(-1, -2);
        sectionParams.topMargin = dp(26);
        sectionParams.bottomMargin = dp(11);
        page.addView(section, sectionParams);
        cards = new LinearLayout(this);
        cards.setOrientation(LinearLayout.VERTICAL);
        page.addView(cards);
        for (Resolver resolver : resolvers) cards.addView(makeResolverCard(resolver));

        TextView note = label("Важно: приложение только проверяет DNS-ответ и задержку запроса. Оно не меняет настройки устройства, не маршрутизирует трафик и не измеряет скорость видео. DNS не гарантирует доступность сайта или обход сетевых ограничений; качество YouTube зависит также от сети и сервиса.", 13, MUTED, false);
        LinearLayout.LayoutParams noteParams = params(-1, -2);
        noteParams.topMargin = dp(18);
        page.addView(note, noteParams);
        setContentView(scroll);
    }

    private View makeResolverCard(Resolver resolver) {
        LinearLayout card = panel();
        LinearLayout.LayoutParams cardParams = params(-1, -2);
        cardParams.bottomMargin = dp(10);
        card.setLayoutParams(cardParams);
        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER_VERTICAL);
        row.setOrientation(LinearLayout.HORIZONTAL);
        card.addView(row);

        LinearLayout textColumn = new LinearLayout(this);
        textColumn.setOrientation(LinearLayout.VERTICAL);
        row.addView(textColumn, new LinearLayout.LayoutParams(0, -2, 1));
        textColumn.addView(label(resolver.name, 16, WHITE, true));
        TextView endpoint = label(resolver.description, 12, MUTED, false);
        LinearLayout.LayoutParams endpointParams = params(-1, -2);
        endpointParams.topMargin = dp(5);
        textColumn.addView(endpoint, endpointParams);

        TextView result = label("Не проверен", 12, MUTED, true);
        result.setGravity(Gravity.RIGHT | Gravity.CENTER_VERTICAL);
        result.setMinWidth(dp(84));
        row.addView(result);
        resolver.resultView = result;
        return card;
    }

    private void runTests() {
        String domain = domainInput.getText().toString().trim().toLowerCase();
        if (!isValidDomain(domain)) {
            domainInput.setError("Введите доменное имя, например example.com");
            return;
        }
        ((InputMethodManager) getSystemService(Context.INPUT_METHOD_SERVICE))
                .hideSoftInputFromWindow(domainInput.getWindowToken(), 0);
        testButton.setEnabled(false);
        testButton.setText("Проверяем…");
        completed = 0;
        for (Resolver resolver : resolvers) {
            resolver.resultView.setText("…");
            resolver.resultView.setTextColor(MUTED);
            workers.execute(() -> {
                CheckResult result = check(resolver, domain);
                mainHandler.post(() -> {
                    resolver.resultView.setText(result.label);
                    resolver.resultView.setTextColor(result.ok ? MINT : Color.rgb(255, 142, 142));
                    completed++;
                    if (completed == resolvers.size()) {
                        testButton.setEnabled(true);
                        testButton.setText("Проверить DNS-серверы");
                    }
                });
            });
        }
    }

    private CheckResult check(Resolver resolver, String domain) {
        HttpURLConnection connection = null;
        long started = System.nanoTime();
        try {
            String encoded = URLEncoder.encode(domain, StandardCharsets.UTF_8.name());
            URL url = new URL(resolver.url + "?name=" + encoded + "&type=A");
            connection = (HttpURLConnection) url.openConnection();
            connection.setRequestMethod("GET");
            connection.setConnectTimeout(5000);
            connection.setReadTimeout(5000);
            connection.setRequestProperty("Accept", "application/dns-json, application/json");
            connection.setRequestProperty("User-Agent", "DNS-Compass/1.0");
            int status = connection.getResponseCode();
            if (status < 200 || status >= 300) return new CheckResult("Ошибка " + status, false);
            StringBuilder body = new StringBuilder();
            try (InputStream stream = connection.getInputStream();
                 BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null && body.length() < 100_000) body.append(line);
            }
            JSONObject json = new JSONObject(body.toString());
            int responseCode = json.optInt("Status", 0);
            if (responseCode != 0) return new CheckResult("DNS " + responseCode, false);
            JSONArray answers = json.optJSONArray("Answer");
            String answer = "Ответ получен";
            if (answers != null && answers.length() > 0) {
                List<String> addresses = new ArrayList<>();
                for (int i = 0; i < answers.length() && i < 2; i++) {
                    String data = answers.optJSONObject(i) == null ? null : answers.optJSONObject(i).optString("data", "");
                    if (!data.isEmpty()) addresses.add(data);
                }
                if (!addresses.isEmpty()) answer = String.join(", ", addresses);
            }
            long elapsed = (System.nanoTime() - started) / 1_000_000;
            return new CheckResult(elapsed + " мс\n" + answer, true);
        } catch (Exception e) {
            return new CheckResult("Нет ответа", false);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private boolean isValidDomain(String domain) {
        if (domain.length() < 3 || domain.length() > 253 || domain.contains(" ")) return false;
        return domain.matches("(?i)[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\\.[a-z]{2,63}")
                && !domain.contains("..") && !domain.contains("--.");
    }

    private LinearLayout panel() {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setPadding(dp(16), dp(15), dp(16), dp(15));
        box.setBackground(rounded(PANEL, dp(17)));
        return box;
    }

    private TextView label(String text, int size, int color, boolean bold) {
        TextView view = new TextView(this);
        view.setText(text);
        view.setTextSize(size);
        view.setTextColor(color);
        if (bold) view.setTypeface(Typeface.DEFAULT, Typeface.BOLD);
        return view;
    }

    private GradientDrawable rounded(int color, int radius) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(color);
        drawable.setCornerRadius(radius);
        return drawable;
    }

    private LinearLayout.LayoutParams params(int width, int height) {
        return new LinearLayout.LayoutParams(width, height);
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    @Override
    protected void onDestroy() {
        workers.shutdownNow();
        super.onDestroy();
    }

    private static final class Resolver {
        final String name;
        final String description;
        final String url;
        TextView resultView;
        Resolver(String name, String description, String url) {
            this.name = name;
            this.description = description;
            this.url = url;
        }
    }

    private static final class CheckResult {
        final String label;
        final boolean ok;
        CheckResult(String label, boolean ok) {
            this.label = label;
            this.ok = ok;
        }
    }
}
