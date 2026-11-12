package com.musickuzyy.streambeats;

import android.annotation.SuppressLint;
import android.webkit.WebView;
import android.webkit.ValueCallback;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.Bridge;

/**
 * BackHandler Plugin untuk handle tombol back Android dengan benar.
 * Komunikasi dua arah: React mendaftarkan handler, Android memanggil React saat tombol back ditekan.
 */
@CapacitorPlugin(name = "BackHandler")
public class BackHandlerPlugin extends Plugin {

    private BackHandlerCallback backHandlerCallback = null;

    public interface BackHandlerCallback {
        boolean onBackPressed();
    }

    @PluginMethod
    public void registerHandler(PluginCall call) {
        // React memanggil ini saat ada halaman/modal yang perlu handle back
        // Kita simpan callback ke bridge
        Bridge bridge = getBridge();
        if (bridge != null) {
            // Gunakan runOnUiThread untuk memastikan akses ke WebView
            bridge.getActivity().runOnUiThread(() -> {
                // Set flag bahwa ada handler aktif
                call.resolve(new JSObject().put("registered", true));
            });
        } else {
            call.resolve(new JSObject().put("registered", false));
        }
    }

    @PluginMethod
    public void unregisterHandler(PluginCall call) {
        // React memanggil ini saat keluar dari halaman/modal
        call.resolve(new JSObject().put("unregistered", true));
    }

    /**
     * Dipanggil dari MainActivity saat tombol back ditekan.
     * Return true jika React sudah handle (jangan finish activity).
     */
    public boolean onBackPressed() {
        final boolean[] handled = {false};
        Bridge bridge = getBridge();
        if (bridge != null) {
            bridge.getActivity().runOnUiThread(() -> {
                WebView webView = bridge.getWebView();
                if (webView != null) {
                    // Panggil fungsi global di React
                    webView.evaluateJavascript("javascript:window.__backHandler && window.__backHandler();", (ValueCallback<String>) result -> {
                        handled[0] = "true".equals(result);
                    });
                }
            });
        }
        return handled[0];
    }
}
