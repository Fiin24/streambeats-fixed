package com.musickuzyy.streambeats;

import android.annotation.SuppressLint;
import android.content.Intent;
import android.os.Bundle;
import android.view.KeyEvent;
import androidx.annotation.Nullable;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Plugin lokal untuk pemutaran latar belakang (foreground service + notifikasi media)
        registerPlugin(BackgroundPlaybackPlugin.class);
        // Plugin lokal untuk menyimpan file unduhan ke folder Music/Stream Beats
        registerPlugin(FileSaverPlugin.class);
        // Plugin lokal untuk lembar "Berbagi link" bawaan Android
        registerPlugin(NativeSharePlugin.class);
        // Plugin lokal untuk login Google (buka Chrome + terima deep link com.musickuzyy.streambeats://auth)
        registerPlugin(ExternalAuthPlugin.class);
        // Plugin lokal untuk pencarian suara (dialog pengenalan suara Android)
        registerPlugin(VoiceSearchPlugin.class);
        // Plugin untuk handle tombol back Android dengan benar
        registerPlugin(BackHandlerPlugin.class);
        super.onCreate(savedInstanceState);
    }

    static final String EXTRA_OPEN = "open";

    /** true bila intent berasal dari ketukan dynamic island / pemutar media sistem (lalu ditandai sudah dipakai) */
    static boolean consumeOpenLyrics(@Nullable Intent i) {
        if (i == null || !"lyrics".equals(i.getStringExtra(EXTRA_OPEN))) return false;
        i.removeExtra(EXTRA_OPEN);
        return true;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (!consumeOpenLyrics(intent) || getBridge() == null) return;
        PluginHandle h = getBridge().getPlugin("BackgroundPlayback");
        if (h != null && h.getInstance() instanceof BackgroundPlaybackPlugin) ((BackgroundPlaybackPlugin) h.getInstance()).openLyrics();
    }

    /**
     * Tombol back HP: kembalikan ke halaman/menu sebelumnya di dalam aplikasi.
     * Delegasikan ke BackHandlerPlugin yang akan komunikasi dengan React layer.
     */
    @SuppressLint("UselessOverridingMethod")
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK && event.getAction() == KeyEvent.ACTION_DOWN) {
            // Delegasikan ke BackHandlerPlugin
            PluginHandle handle = getBridge() != null ? getBridge().getPlugin("BackHandler") : null;
            if (handle != null && handle.getInstance() instanceof BackHandlerPlugin) {
                BackHandlerPlugin plugin = (BackHandlerPlugin) handle.getInstance();
                if (plugin.onBackPressed()) {
                    return true; // React sudah handle back
                }
            }
            // Fallback: coba history.back() jika plugin tidak handle
            if (getBridge() != null && getBridge().getWebView() != null) {
                getBridge().getWebView().evaluateJavascript("window.history.back();", null);
                return true;
            }
        }
        return super.onKeyDown(keyCode, event);
    }

    /**
     * Android 14+ (API 34): sistem memakai OnBackPressedCallback, tetapi
     * onKeyDown masih jalan di semua versi. Tidak perlu onRestart khusus.
     */
}
