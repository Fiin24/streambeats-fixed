package com.musickuzyy.streambeats;

import android.app.Activity;
import android.content.Intent;
import android.speech.RecognizerIntent;
import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;

/** Pencarian suara: membuka dialog pengenalan suara bawaan Android (Google) — tanpa izin mikrofon di aplikasi */
@CapacitorPlugin(name = "VoiceSearch")
public class VoiceSearchPlugin extends Plugin {

    private Intent buildIntent(String prompt, String lang) {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        i.putExtra(RecognizerIntent.EXTRA_PROMPT, prompt);
        return i;
    }

    @PluginMethod
    public void available(PluginCall call) {
        boolean ok = buildIntent("", "id-ID").resolveActivity(getContext().getPackageManager()) != null;
        JSObject ret = new JSObject();
        ret.put("available", ok);
        call.resolve(ret);
    }

    @PluginMethod
    public void listen(PluginCall call) {
        Intent i = buildIntent(call.getString("prompt", ""), call.getString("lang", "id-ID"));
        if (i.resolveActivity(getContext().getPackageManager()) == null) {
            call.reject("Pencarian suara tidak tersedia di perangkat ini");
            return;
        }
        startActivityForResult(call, i, "onResult");
    }

    @ActivityCallback
    private void onResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        JSObject ret = new JSObject();
        String text = "";
        if (result.getResultCode() == Activity.RESULT_OK && result.getData() != null) {
            ArrayList<String> list = result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);
            if (list != null && !list.isEmpty()) text = list.get(0);
        }
        ret.put("text", text);
        call.resolve(ret);
    }
}
