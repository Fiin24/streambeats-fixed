package com.musickuzyy.streambeats;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Login Google untuk APK.
 * Google memblokir halaman login di dalam WebView (error 403 disallowed_useragent), jadi halaman Google
 * dibuka di Chrome (Custom Tab bila tersedia). Setelah login, server mengarahkan kembali ke
 * com.musickuzyy.streambeats://auth?gauth=KODE → Android membuka MainActivity → plugin ini meneruskan URL
 * ke JavaScript (event "result"), yang lalu menukar KODE menjadi sesi.
 */
@CapacitorPlugin(name = "ExternalAuth")
public class ExternalAuthPlugin extends Plugin {

    static final String SCHEME = "com.musickuzyy.streambeats";

    @Override
    public void load() {
        // aplikasi dibuka ulang langsung dari deep link (mis. sempat ditutup sistem saat Chrome terbuka)
        if (getActivity() != null) deliver(getActivity().getIntent());
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        deliver(intent);
    }

    private void deliver(Intent intent) {
        if (intent == null || !Intent.ACTION_VIEW.equals(intent.getAction())) return;
        Uri data = intent.getData();
        if (data != null && SCHEME.equals(data.getScheme()) && "open".equals(data.getHost())) {
            // shortcut ikon aplikasi → diteruskan ke JS (event "shortcut")
            JSObject sc = new JSObject();
            sc.put("path", data.getPath() == null ? "" : data.getPath());
            notifyListeners("shortcut", sc, true);
            intent.setData(null);
            return;
        }
        if (data == null || !SCHEME.equals(data.getScheme()) || !"auth".equals(data.getHost())) return;
        JSObject ret = new JSObject();
        ret.put("url", data.toString());
        // simpan sampai ada listener (JS mungkin belum siap saat cold start)
        notifyListeners("result", ret, true);
        intent.setData(null);
    }

    @PluginMethod
    public void open(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || !url.startsWith("https://")) {
            call.reject("URL tidak valid");
            return;
        }
        try {
            Intent view = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            // tanpa library androidx.browser: extra ini membuat Chrome membukanya sebagai Custom Tab
            Bundle extras = new Bundle();
            extras.putBinder("android.support.customtabs.extra.SESSION", null);
            view.putExtras(extras);
            view.putExtra("android.support.customtabs.extra.TOOLBAR_COLOR", 0xFF000000);
            view.addCategory(Intent.CATEGORY_BROWSABLE);
            getActivity().startActivity(view);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("Tidak ada browser untuk membuka login Google");
        } catch (Exception e) {
            call.reject("Gagal membuka login Google: " + e.getMessage());
        }
    }
}
