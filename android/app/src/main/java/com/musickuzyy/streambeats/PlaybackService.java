package com.musickuzyy.streambeats;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.wifi.WifiManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Foreground service "mediaPlayback": menjaga proses aplikasi (dan WebView yang memutar musik) tetap hidup saat
 * aplikasi diminimalkan atau layar dikunci, plus notifikasi media & kontrol lock screen / headset.
 */
public class PlaybackService extends Service {

    public interface Listener {
        void onAction(String action, @Nullable Long positionMs);
    }

    public static class NowPlaying {
        public String title = "";
        public String artist = "";
        public String album = "";
        public String artwork;
        public boolean playing;
        public long durationMs;
        public long positionMs;
        public boolean liked;
        public boolean shuffle;
        /** baris lirik saat ini (kosong = tampilkan nama artis) */
        public String lyric = "";
    }

    static final String CA_LIKE = "like";
    static final String CA_LYRICS = "lyrics";

    static final String CHANNEL_ID = "playback";
    static final int NOTIFICATION_ID = 7301;
    static final String ACTION_CMD = "com.musickuzyy.streambeats.PLAYBACK_CMD";
    static final String EXTRA_CMD = "cmd";

    @Nullable public static volatile PlaybackService instance;
    @Nullable public static volatile Listener listener;
    @Nullable public static volatile NowPlaying pending;

    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private MediaSessionCompat session;
    private PowerManager.WakeLock wakeLock;
    private WifiManager.WifiLock wifiLock;
    private NowPlaying np = new NowPlaying();
    @Nullable private Bitmap art;
    @Nullable private String artUrl;
    private boolean foreground;

    @Override
    public void onCreate() {
        super.onCreate();
        instance = this;
        createChannel();
        session = new MediaSessionCompat(this, "StreamBeats");
        session.setFlags(MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS | MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS);
        session.setCallback(new MediaSessionCompat.Callback() {
            @Override public void onPlay() { emit("play", null); }
            @Override public void onPause() { emit("pause", null); }
            @Override public void onSkipToNext() { emit("next", null); }
            @Override public void onSkipToPrevious() { emit("prev", null); }
            @Override public void onStop() { emit("stop", null); }
            @Override public void onSeekTo(long pos) { emit("seek", pos); }
            @Override public void onSetShuffleMode(int mode) {
                emit(mode == PlaybackStateCompat.SHUFFLE_MODE_NONE ? "shuffle_off" : "shuffle_on", null);
            }
            @Override public void onCustomAction(String action, Bundle extras) {
                if (CA_LIKE.equals(action)) emit("like", null);
                else if (CA_LYRICS.equals(action)) openLyrics();
            }
        });
        session.setSessionActivity(openIntent());
        session.setActive(true);

        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "StreamBeats:playback");
        wakeLock.setReferenceCounted(false);
        WifiManager wm = (WifiManager) getApplicationContext().getSystemService(Context.WIFI_SERVICE);
        if (wm != null) {
            int mode = Build.VERSION.SDK_INT >= 29 ? WifiManager.WIFI_MODE_FULL_LOW_LATENCY : WifiManager.WIFI_MODE_FULL_HIGH_PERF;
            wifiLock = wm.createWifiLock(mode, "StreamBeats:playback");
            wifiLock.setReferenceCounted(false);
        }
    }

    @Override
    public int onStartCommand(@Nullable Intent intent, int flags, int startId) {
        if (intent != null && ACTION_CMD.equals(intent.getAction())) {
            String cmd = intent.getStringExtra(EXTRA_CMD);
            if (cmd != null) emit(cmd, null);
            if (!foreground) goForeground(); // wajib dalam 5 detik bila dimulai sebagai foreground service
            return START_NOT_STICKY;
        }
        NowPlaying p = pending;
        pending = null;
        apply(p != null ? p : np);
        return START_NOT_STICKY;
    }

    /** Perbarui metadata, status, notifikasi, dan kunci daya */
    public void apply(NowPlaying p) {
        if (Looper.myLooper() != Looper.getMainLooper()) {
            main.post(() -> apply(p));
            return;
        }
        np = p;
        session.setMetadata(buildMetadata());
        // ketuk dynamic island saat lirik tampil → langsung ke layar lirik
        session.setSessionActivity(hasLyric() ? lyricsIntent() : openIntent());
        long actions = PlaybackStateCompat.ACTION_PLAY | PlaybackStateCompat.ACTION_PAUSE | PlaybackStateCompat.ACTION_PLAY_PAUSE
            | PlaybackStateCompat.ACTION_SKIP_TO_NEXT | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
            | PlaybackStateCompat.ACTION_SEEK_TO | PlaybackStateCompat.ACTION_STOP;
        actions |= PlaybackStateCompat.ACTION_SET_SHUFFLE_MODE;
        session.setShuffleMode(p.shuffle ? PlaybackStateCompat.SHUFFLE_MODE_ALL : PlaybackStateCompat.SHUFFLE_MODE_NONE);
        session.setPlaybackState(new PlaybackStateCompat.Builder()
            .setActions(actions)
            .setState(p.playing ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED, p.positionMs, p.playing ? 1f : 0f)
            .addCustomAction(new PlaybackStateCompat.CustomAction.Builder(CA_LIKE, p.liked ? "Batal suka" : "Suka",
                p.liked ? R.drawable.ic_widget_heart_on : R.drawable.ic_widget_heart).build())
            .addCustomAction(new PlaybackStateCompat.CustomAction.Builder(CA_LYRICS, "Lirik", R.drawable.ic_stat_music).build())
            .build());

        if (p.playing) {
            if (!wakeLock.isHeld()) wakeLock.acquire(6 * 60 * 60 * 1000L); // maks 6 jam, diperbarui tiap update
            if (wifiLock != null && !wifiLock.isHeld()) wifiLock.acquire();
        } else {
            if (wakeLock.isHeld()) wakeLock.release();
            if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        }
        goForeground();
        loadArtwork(p.artwork);
        NowPlayingWidget.push(this, np, art);
    }

    NowPlaying nowPlaying() { return np; }
    @Nullable Bitmap artwork() { return art; }

    private void goForeground() {
        Notification n = buildNotification();
        int type = Build.VERSION.SDK_INT >= 29 ? ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK : 0;
        try {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, n, type);
            foreground = true;
        } catch (Exception e) {
            // mis. Android 12+ menolak memulai foreground dari latar belakang → tampilkan notifikasi biasa
            NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
            if (nm != null) nm.notify(NOTIFICATION_ID, n);
        }
    }

    private boolean hasLyric() { return np.lyric != null && !np.lyric.isEmpty(); }

    /** Baris kedua di notifikasi / dynamic island: lirik saat ini bila ada, selain itu nama artis */
    private String subtitle() { return hasLyric() ? np.lyric : np.artist; }

    private PendingIntent openIntent() {
        Intent open = new Intent(this, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        return PendingIntent.getActivity(this, 0, open, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private PendingIntent lyricsIntent() {
        Intent i = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_NEW_TASK)
            .putExtra(MainActivity.EXTRA_OPEN, "lyrics");
        return PendingIntent.getActivity(this, 9, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void openLyrics() {
        emit("lyrics", null);
        try {
            lyricsIntent().send();
        } catch (PendingIntent.CanceledException ignored) {
            // aplikasi tetap menerima event "lyrics" saat dibuka berikutnya
        }
    }

    private MediaMetadataCompat buildMetadata() {
        MediaMetadataCompat.Builder b = new MediaMetadataCompat.Builder()
            .putString(MediaMetadataCompat.METADATA_KEY_TITLE, np.title)
            .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, subtitle())
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM_ARTIST, np.artist)
            .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_TITLE, np.title)
            .putString(MediaMetadataCompat.METADATA_KEY_DISPLAY_SUBTITLE, subtitle())
            .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, np.album)
            .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, np.durationMs > 0 ? np.durationMs : -1);
        if (art != null) b.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, art);
        return b.build();
    }

    private Notification buildNotification() {
        PendingIntent content = hasLyric() ? lyricsIntent() : openIntent();
        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_music)
            .setContentTitle(np.title)
            .setContentText(subtitle())
            .setSubText(hasLyric() ? np.artist : np.album)
            .setLargeIcon(art)
            .setContentIntent(content)
            .setDeleteIntent(cmd("stop", 4))
            .setOngoing(np.playing)
            .setOnlyAlertOnce(true)
            .setShowWhen(false)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setCategory(NotificationCompat.CATEGORY_TRANSPORT)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .addAction(android.R.drawable.ic_media_previous, "Sebelumnya", cmd("prev", 1))
            .addAction(np.playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play,
                np.playing ? "Jeda" : "Putar", cmd(np.playing ? "pause" : "play", 2))
            .addAction(android.R.drawable.ic_media_next, "Berikutnya", cmd("next", 3))
            .addAction(np.liked ? R.drawable.ic_widget_heart_on : R.drawable.ic_widget_heart,
                np.liked ? "Batal suka" : "Suka", cmd("like", 5))
            .setStyle(new androidx.media.app.NotificationCompat.MediaStyle()
                .setMediaSession(session.getSessionToken())
                .setShowActionsInCompactView(0, 1, 2));
        return b.build();
    }

    private PendingIntent cmd(String c, int req) {
        Intent i = new Intent(this, PlaybackService.class).setAction(ACTION_CMD).putExtra(EXTRA_CMD, c);
        return PendingIntent.getService(this, req, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private void loadArtwork(@Nullable String url) {
        if (url == null || url.isEmpty() || url.equals(artUrl)) return;
        artUrl = url;
        io.execute(() -> {
            Bitmap bmp = null;
            try {
                HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
                c.setConnectTimeout(8000);
                c.setReadTimeout(8000);
                try (InputStream in = c.getInputStream()) {
                    bmp = BitmapFactory.decodeStream(in);
                }
                c.disconnect();
            } catch (Exception ignored) {
                // tanpa sampul tidak masalah
            }
            final Bitmap result = bmp;
            main.post(() -> {
                if (!url.equals(artUrl)) return;
                art = result;
                session.setMetadata(buildMetadata());
                NotificationManager nm = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                if (nm != null && foreground) nm.notify(NOTIFICATION_ID, buildNotification());
                NowPlayingWidget.push(this, np, art);
            });
        });
    }

    private void emit(String action, @Nullable Long positionMs) {
        Listener l = listener;
        if (l != null) main.post(() -> l.onAction(action, positionMs));
        if ("stop".equals(action)) {
            main.post(this::stopSelf);
        }
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationChannel ch = new NotificationChannel(CHANNEL_ID, "Pemutar musik", NotificationManager.IMPORTANCE_LOW);
        ch.setDescription("Kontrol lagu yang sedang diputar");
        ch.setShowBadge(false);
        ch.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm != null) nm.createNotificationChannel(ch);
    }

    @Override
    public void onTaskRemoved(Intent rootIntent) {
        // aplikasi ditutup dari daftar recent → WebView ikut mati, hentikan service
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }

    @Override
    public void onDestroy() {
        instance = null;
        NowPlayingWidget.push(this, null, null);
        if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        if (wifiLock != null && wifiLock.isHeld()) wifiLock.release();
        if (session != null) {
            session.setActive(false);
            session.release();
        }
        io.shutdownNow();
        ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE);
        super.onDestroy();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
