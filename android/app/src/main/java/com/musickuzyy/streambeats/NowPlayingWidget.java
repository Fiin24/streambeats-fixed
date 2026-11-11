package com.musickuzyy.streambeats;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.view.View;
import android.widget.RemoteViews;
import androidx.annotation.Nullable;

/** Widget layar utama & layar kunci: sampul, judul, suka, sebelumnya / putar-jeda / berikutnya, acak */
public class NowPlayingWidget extends AppWidgetProvider {

    private static final int ART_PX = 192; // kecilkan bitmap agar tidak melebihi batas IPC RemoteViews

    @Override
    public void onUpdate(Context context, AppWidgetManager mgr, int[] ids) {
        PlaybackService s = PlaybackService.instance;
        render(context, mgr, ids, s != null ? s.nowPlaying() : null, s != null ? s.artwork() : null);
    }

    /** Dipanggil oleh PlaybackService setiap status berubah (np = null → pemutar berhenti) */
    static void push(Context context, @Nullable PlaybackService.NowPlaying np, @Nullable Bitmap art) {
        AppWidgetManager mgr = AppWidgetManager.getInstance(context);
        int[] ids = mgr.getAppWidgetIds(new ComponentName(context, NowPlayingWidget.class));
        if (ids == null || ids.length == 0) return;
        render(context, mgr, ids, np, art);
    }

    private static void render(Context context, AppWidgetManager mgr, int[] ids, @Nullable PlaybackService.NowPlaying np, @Nullable Bitmap art) {
        RemoteViews v = new RemoteViews(context.getPackageName(), R.layout.widget_now_playing);
        boolean active = np != null && np.title != null && !np.title.isEmpty();
        PendingIntent open = PendingIntent.getActivity(context, 100,
            new Intent(context, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP),
            PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
        v.setOnClickPendingIntent(R.id.widget_root, open);

        v.setTextViewText(R.id.widget_title, active ? np.title : context.getString(R.string.widget_idle_title));
        v.setTextViewText(R.id.widget_artist, active ? np.artist : context.getString(R.string.widget_idle_subtitle));
        if (active && art != null) v.setImageViewBitmap(R.id.widget_art, scale(art));
        else v.setImageViewResource(R.id.widget_art, R.mipmap.ic_launcher);
        v.setImageViewResource(R.id.widget_play, active && np.playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play);
        v.setContentDescription(R.id.widget_play, active && np.playing ? "Jeda" : "Putar");
        v.setImageViewResource(R.id.widget_like, active && np.liked ? R.drawable.ic_widget_heart_on : R.drawable.ic_widget_heart);
        v.setContentDescription(R.id.widget_like, active && np.liked ? "Batal suka" : "Suka");
        v.setImageViewResource(R.id.widget_shuffle, active && np.shuffle ? R.drawable.ic_widget_shuffle_on : R.drawable.ic_widget_shuffle);
        v.setContentDescription(R.id.widget_shuffle, active && np.shuffle ? "Acak aktif" : "Acak mati");

        if (active && PlaybackService.instance != null) {
            v.setOnClickPendingIntent(R.id.widget_prev, cmd(context, "prev", 101));
            v.setOnClickPendingIntent(R.id.widget_play, cmd(context, np.playing ? "pause" : "play", 102));
            v.setOnClickPendingIntent(R.id.widget_next, cmd(context, "next", 103));
            v.setOnClickPendingIntent(R.id.widget_like, cmd(context, "like", 104));
            v.setOnClickPendingIntent(R.id.widget_shuffle, cmd(context, "shuffle", 105));
            v.setViewVisibility(R.id.widget_prev, View.VISIBLE);
            v.setViewVisibility(R.id.widget_next, View.VISIBLE);
            v.setViewVisibility(R.id.widget_like, View.VISIBLE);
            v.setViewVisibility(R.id.widget_shuffle, View.VISIBLE);
        } else {
            // aplikasi tidak berjalan → tombol putar membuka aplikasi
            v.setOnClickPendingIntent(R.id.widget_play, open);
            v.setViewVisibility(R.id.widget_prev, View.GONE);
            v.setViewVisibility(R.id.widget_next, View.GONE);
            v.setViewVisibility(R.id.widget_like, View.GONE);
            v.setViewVisibility(R.id.widget_shuffle, View.GONE);
        }
        mgr.updateAppWidget(ids, v);
    }

    private static PendingIntent cmd(Context context, String c, int req) {
        Intent i = new Intent(context, PlaybackService.class).setAction(PlaybackService.ACTION_CMD).putExtra(PlaybackService.EXTRA_CMD, c);
        return PendingIntent.getService(context, req, i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT);
    }

    private static Bitmap scale(Bitmap b) {
        int w = b.getWidth(), h = b.getHeight();
        if (w <= ART_PX && h <= ART_PX) return b;
        float r = Math.min((float) ART_PX / w, (float) ART_PX / h);
        return Bitmap.createScaledBitmap(b, Math.max(1, Math.round(w * r)), Math.max(1, Math.round(h * r)), true);
    }
}
