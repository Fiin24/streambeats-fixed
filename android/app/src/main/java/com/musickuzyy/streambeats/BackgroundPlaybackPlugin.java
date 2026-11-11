package com.musickuzyy.streambeats;

import android.Manifest;
import android.content.Intent;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;

/**
 * Jembatan JS ↔ PlaybackService. Dipakai oleh src/lib/background.ts:
 *  - update({title, artist, album, artwork, playing, duration, position, liked, shuffle, lyric}) → mulai/perbarui notifikasi media
 *  - stop() → hentikan service
 *  - event "action" ← tombol notifikasi / lock screen / headset (play, pause, next, prev, seek, stop, like, shuffle, shuffle_on/off, lyrics)
 *  - event "lifecycle" ← aplikasi masuk/keluar latar belakang
 */
@CapacitorPlugin(
    name = "BackgroundPlayback",
    permissions = { @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications") }
)
public class BackgroundPlaybackPlugin extends Plugin {

    @Override
    public void load() {
        PlaybackService.listener = (action, positionMs) -> {
            JSObject data = new JSObject();
            data.put("action", action);
            if (positionMs != null) data.put("position", positionMs / 1000.0);
            notifyListeners("action", data);
        };
        if (MainActivity.consumeOpenLyrics(getActivity() != null ? getActivity().getIntent() : null)) openLyrics();
    }

    /** Dipanggil saat pengguna mengetuk dynamic island / pemutar media sistem → buka layar lirik */
    void openLyrics() {
        JSObject data = new JSObject();
        data.put("action", "lyrics");
        notifyListeners("action", data, true);
    }

    @PluginMethod
    public void update(PluginCall call) {
        PlaybackService.NowPlaying np = new PlaybackService.NowPlaying();
        np.title = call.getString("title", "");
        np.artist = call.getString("artist", "");
        np.album = call.getString("album", "");
        np.artwork = call.getString("artwork", null);
        np.playing = Boolean.TRUE.equals(call.getBoolean("playing", false));
        np.liked = Boolean.TRUE.equals(call.getBoolean("liked", false));
        np.shuffle = Boolean.TRUE.equals(call.getBoolean("shuffle", false));
        np.lyric = call.getString("lyric", "");
        Double duration = call.getDouble("duration", 0.0);
        Double position = call.getDouble("position", 0.0);
        np.durationMs = duration == null ? 0 : (long) (duration * 1000);
        np.positionMs = position == null ? 0 : (long) (position * 1000);

        PlaybackService running = PlaybackService.instance;
        if (running != null) {
            // service sudah berjalan (bisa saat aplikasi di latar) → perbarui langsung
            running.apply(np);
            call.resolve();
            return;
        }
        try {
            PlaybackService.pending = np;
            Intent i = new Intent(getContext(), PlaybackService.class);
            ContextCompat.startForegroundService(getContext(), i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Tidak bisa memulai pemutaran latar: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getContext().stopService(new Intent(getContext(), PlaybackService.class));
        call.resolve();
    }

    @Override
    protected void handleOnStop() {
        JSObject d = new JSObject();
        d.put("background", true);
        notifyListeners("lifecycle", d);
    }

    @Override
    protected void handleOnStart() {
        JSObject d = new JSObject();
        d.put("background", false);
        notifyListeners("lifecycle", d);
    }

    @Override
    protected void handleOnDestroy() {
        PlaybackService.listener = null;
        getContext().stopService(new Intent(getContext(), PlaybackService.class));
    }
}
