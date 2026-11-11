package com.musickuzyy.streambeats;

import android.content.Intent;
import android.net.Uri;
import android.util.Base64;
import androidx.core.content.FileProvider;
import java.io.File;
import java.io.FileOutputStream;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Membuka lembar "Berbagi link" bawaan Android (Quick Share, WhatsApp, Chrome, Discord, kontak, …).
 * WebView Android tidak punya navigator.share, jadi tombol Bagikan memanggil plugin ini.
 * Bila EXTRA_TEXT hanya berisi URL, Android 10+ menampilkan pratinjau link + tombol salin.
 */
@CapacitorPlugin(name = "NativeShare")
public class NativeSharePlugin extends Plugin {

    @PluginMethod
    public void share(PluginCall call) {
        String url = call.getString("url", "");
        String text = call.getString("text", "");
        String title = call.getString("title", "");
        String body = (text == null || text.isEmpty()) ? url : (url == null || url.isEmpty() ? text : text + "\n" + url);
        if (body == null || body.isEmpty()) {
            call.reject("Tidak ada yang dibagikan");
            return;
        }
        try {
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("text/plain");
            send.putExtra(Intent.EXTRA_TEXT, body);
            if (title != null && !title.isEmpty()) send.putExtra(Intent.EXTRA_SUBJECT, title);
            Intent chooser = Intent.createChooser(send, null);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("Gagal membuka menu bagikan: " + e.getMessage());
        }
    }

    /** Bagikan gambar PNG (base64) — dipakai "Bagikan lirik sebagai gambar" */
    @PluginMethod
    public void shareImage(PluginCall call) {
        String data = call.getString("data", "");
        String name = call.getString("name", "stream-beats.png");
        if (data == null || data.isEmpty()) {
            call.reject("Gambar kosong");
            return;
        }
        try {
            File dir = new File(getContext().getCacheDir(), "share");
            if (!dir.exists() && !dir.mkdirs()) throw new Exception("folder cache tidak bisa dibuat");
            File f = new File(dir, name.replaceAll("[^A-Za-z0-9._-]", "_"));
            try (FileOutputStream out = new FileOutputStream(f)) {
                out.write(Base64.decode(data, Base64.DEFAULT));
            }
            Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", f);
            Intent send = new Intent(Intent.ACTION_SEND);
            send.setType("image/png");
            send.putExtra(Intent.EXTRA_STREAM, uri);
            send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            Intent chooser = Intent.createChooser(send, null);
            chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            getActivity().startActivity(chooser);
            call.resolve();
        } catch (Exception e) {
            call.reject("Gagal membagikan gambar: " + e.getMessage());
        }
    }
}
