package com.musickuzyy.streambeats;

import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.media.MediaScannerConnection;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.OutputStream;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;

/**
 * Menyimpan file audio unduhan ke penyimpanan HP (Music/Stream Beats).
 * WebView Android tidak mendukung <a download> untuk URL blob:, jadi file dikirim dari JS
 * per potongan base64 (open → write … → close).
 *  - Android 10+ : MediaStore (tanpa izin tambahan), langsung terlihat di aplikasi musik.
 *  - Android 7–9 : folder Music milik aplikasi (Android/data/…/files/Music/Stream Beats), tanpa izin.
 *  - Android 14+ : MediaStore dengan handling yang lebih ketat untuk scoped storage.
 */
@CapacitorPlugin(name = "FileSaver")
public class FileSaverPlugin extends Plugin {

    private static final String TAG = "FileSaverPlugin";
    private static final String FOLDER = "Stream Beats";

    private static class Target {
        OutputStream out;
        Uri uri;
        File file;
        String location;
    }

    private final Map<String, Target> targets = new HashMap<>();

    private static String clean(String name) {
        String n = name == null ? "" : name.replaceAll("[\\\\/:*?\"<>|]+", " ").trim();
        if (n.isEmpty()) n = "Stream Beats.m4a";
        if (n.length() > 180) n = n.substring(0, 180);
        return n;
    }

    @PluginMethod
    public void open(PluginCall call) {
        String name = clean(call.getString("name", "audio.m4a"));
        String mime = call.getString("mime", "audio/mp4");
        if (mime == null || !mime.startsWith("audio/")) mime = "audio/mp4";
        Target t = new Target();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentResolver resolver = getContext().getContentResolver();
                ContentValues values = new ContentValues();
                values.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
                values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                
                // Android 14+ (API 34) requires specific handling
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) { // API 34
                    // Use MediaStore.Audio.Media.getContentUri with proper volume
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_MUSIC + "/" + FOLDER);
                    values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    // Add title and artist for better media library integration
                    values.put(MediaStore.Audio.Media.TITLE, name.replaceFirst("[.][^.]+$", ""));
                    values.put(MediaStore.Audio.Media.IS_MUSIC, true);
                } else {
                    // Android 10-13
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, Environment.DIRECTORY_MUSIC + "/" + FOLDER);
                    values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                }
                
                Uri collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                Uri uri = resolver.insert(collection, values);
                if (uri == null) {
                    // Fallback: try without VOLUME_EXTERNAL_PRIMARY
                    collection = MediaStore.Audio.Media.getContentUri(MediaStore.VOLUME_EXTERNAL);
                    uri = resolver.insert(collection, values);
                    if (uri == null) throw new IOException("Tidak bisa membuat file di folder Music");
                }
                OutputStream out = resolver.openOutputStream(uri);
                if (out == null) throw new IOException("Tidak bisa membuka file");
                t.uri = uri;
                t.out = out;
                t.location = "Music/" + FOLDER;
                Log.d(TAG, "Created MediaStore entry: " + uri.toString());
            } else {
                // Android 7-9: use app-specific directory
                File base = getContext().getExternalFilesDir(Environment.DIRECTORY_MUSIC);
                if (base == null) base = new File(getContext().getFilesDir(), "Music");
                File dir = new File(base, FOLDER);
                if (!dir.exists() && !dir.mkdirs()) throw new IOException("Tidak bisa membuat folder");
                File f = new File(dir, name);
                t.file = f;
                t.out = new FileOutputStream(f);
                t.location = f.getAbsolutePath();
                Log.d(TAG, "Created file in app directory: " + f.getAbsolutePath());
            }
            String id = UUID.randomUUID().toString();
            synchronized (targets) {
                targets.put(id, t);
            }
            JSObject ret = new JSObject();
            ret.put("id", id);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error creating file", e);
            call.reject(e.getMessage() != null ? e.getMessage() : "Gagal membuat file");
        }
    }

    @PluginMethod
    public void write(PluginCall call) {
        Target t;
        synchronized (targets) {
            t = targets.get(call.getString("id", ""));
        }
        if (t == null) {
            call.reject("File tidak ditemukan");
            return;
        }
        try {
            String data = call.getString("data", "");
            byte[] bytes = Base64.decode(data, Base64.DEFAULT);
            t.out.write(bytes);
            call.resolve();
        } catch (Exception e) {
            call.reject(e.getMessage() != null ? e.getMessage() : "Gagal menulis file");
        }
    }

    @PluginMethod
    public void close(PluginCall call) {
        String id = call.getString("id", "");
        Target t;
        synchronized (targets) {
            t = targets.remove(id);
        }
        if (t == null) {
            call.reject("File tidak ditemukan");
            return;
        }
        try {
            t.out.flush();
            t.out.close();
            if (t.uri != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ContentValues done = new ContentValues();
                done.put(MediaStore.MediaColumns.IS_PENDING, 0);
                // On Android 14+, also update the date_added
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
                    done.put(MediaStore.MediaColumns.DATE_ADDED, System.currentTimeMillis() / 1000);
                }
                int updated = getContext().getContentResolver().update(t.uri, done, null, null);
                if (updated == 0) {
                    Log.w(TAG, "Failed to mark MediaStore entry as done, URI: " + t.uri.toString());
                }
            } else if (t.file != null) {
                MediaScannerConnection.scanFile(getContext(), new String[] { t.file.getAbsolutePath() }, null, null);
            }
            JSObject ret = new JSObject();
            ret.put("location", t.location);
            call.resolve(ret);
        } catch (Exception e) {
            Log.e(TAG, "Error closing file", e);
            cleanup(t);
            call.reject(e.getMessage() != null ? e.getMessage() : "Gagal menyimpan file");
        }
    }

    @PluginMethod
    public void abort(PluginCall call) {
        Target t;
        synchronized (targets) {
            t = targets.remove(call.getString("id", ""));
        }
        if (t != null) cleanup(t);
        call.resolve();
    }

    private void cleanup(Target t) {
        try {
            t.out.close();
        } catch (Exception ignored) {
        }
        try {
            if (t.uri != null) {
                // Try to delete the pending entry
                getContext().getContentResolver().delete(t.uri, null, null);
            }
            if (t.file != null && t.file.exists()) {
                //noinspection ResultOfMethodCallIgnored
                t.file.delete();
            }
        } catch (Exception ignored) {
        }
    }
    
    /** Check if we can write to MediaStore (Android 10+) */
    @PluginMethod
    public void canSaveToMediaStore(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            JSObject ret = new JSObject();
            ret.put("available", true);
            call.resolve(ret);
        } else {
            JSObject ret = new JSObject();
            ret.put("available", false);
            call.resolve(ret);
        }
    }
}
