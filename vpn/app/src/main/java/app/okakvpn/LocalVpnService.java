package app.okakvpn;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Intent;
import android.net.VpnService;
import android.os.Build;
import android.os.ParcelFileDescriptor;

import java.io.FileInputStream;
import java.io.InputStream;

/**
 * Реальный системный VPN через android.net.VpnService.
 *
 * ВАЖНО (честность): сервис поднимает VPN-интерфейс и читает пакеты, но по умолчанию
 * НЕ имеет внешнего сервера, поэтому трафик никуда не пересылается (см. TODO в run()).
 * Это каркас: точка подключения сервера помечена. Пока FORWARD_ALL = false, маршрут
 * 0.0.0.0/0 не добавляется и устройство остаётся в сети — VPN-интерфейс существует,
 * счётчик и статус работают.
 */
public class LocalVpnService extends VpnService {

    /** Включить, когда появится реальный апстрим: добавит маршрут всего трафика. */
    private static final boolean FORWARD_ALL = false;

    private static final int NOTIF_ID = 1;
    private static final String CHANNEL = "vpn_session";

    public interface StatusListener {
        void onStarted();
        void onStopped();
        void onBytes(long total);
    }

    public static volatile StatusListener listener;
    public static volatile long startTime;

    private ParcelFileDescriptor fd;
    private Thread thread;
    private volatile boolean running;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        startForeground(NOTIF_ID, buildNotification());
        start();
        return START_STICKY;
    }

    private void start() {
        if (running) return;
        running = true;
        startTime = System.currentTimeMillis();
        thread = new Thread(this::run, "okak-vpn-tun");
        thread.start();
        if (listener != null) listener.onStarted();
    }

    private void run() {
        try {
            android.content.SharedPreferences prefs =
                    getSharedPreferences(MainActivity.PREFS, MODE_PRIVATE);
            Builder b = new Builder();
            String[] locs = getResources().getStringArray(R.array.vpn_locations);
            int sIdx = prefs.getInt(MainActivity.KEY_SERVER, 0);
            if (sIdx < 0 || sIdx >= locs.length) sIdx = 0;
            b.setSession(locs[sIdx]);
            b.setMtu(1500);
            b.addAddress("10.8.0.2", 32);
            // DNS берётся из настроек (список «все DNS»); резерв — Cloudflare.
            String[] dns = getResources().getStringArray(R.array.dns_values);
            int idx = prefs.getInt(MainActivity.KEY_DNS, 0);
            if (idx < 0 || idx >= dns.length) idx = 0;
            b.addDnsServer(dns[idx]);
            if (!"1.1.1.1".equals(dns[idx])) b.addDnsServer("1.1.1.1");
            if (FORWARD_ALL) {
                b.addRoute("0.0.0.0", 0); // весь трафик — только когда есть апстрим
            }
            fd = b.establish();
            if (fd == null) return;

            InputStream in = new FileInputStream(fd.getFileDescriptor());
            byte[] buf = new byte[32767];
            long total = 0;
            // TODO: здесь пакеты передаются в настоящий туннель/сервер
            // (WireGuard / SOCKS / HTTPS-connect). Сейчас мы их только считаем и
            // опускаем — внешнего сервера у каркаса нет.
            while (running) {
                int n = in.read(buf);
                if (n > 0) {
                    total += n;
                    if (listener != null) listener.onBytes(total);
                } else {
                    Thread.sleep(50);
                }
            }
        } catch (Exception e) {
            // сервис останавливается — UI узнает через onStopped
        }
    }

    @Override
    public void onDestroy() {
        running = false;
        if (thread != null) thread.interrupt();
        try {
            if (fd != null) fd.close();
        } catch (Exception ignored) {
        }
        if (listener != null) listener.onStopped();
        super.onDestroy();
    }

    private Notification buildNotification() {
        NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel ch = new NotificationChannel(
                    CHANNEL, getString(R.string.vpn_channel), NotificationManager.IMPORTANCE_LOW);
            nm.createNotificationChannel(ch);
        }
        Intent ui = new Intent(this, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(this, 0, ui, PendingIntent.FLAG_IMMUTABLE);
        Notification.Builder nb = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                ? new Notification.Builder(this, CHANNEL)
                : new Notification.Builder(this);
        return nb.setContentTitle(getString(R.string.vpn_notification))
                .setSmallIcon(R.drawable.ic_vpn)
                .setContentIntent(pi)
                .setOngoing(true)
                .build();
    }
}
