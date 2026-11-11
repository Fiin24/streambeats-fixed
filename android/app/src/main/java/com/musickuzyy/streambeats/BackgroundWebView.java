package com.musickuzyy.streambeats;

import android.content.Context;
import android.util.AttributeSet;
import android.view.View;
import com.getcapacitor.CapacitorWebView;

/**
 * WebView yang selalu melapor "terlihat" ke Chromium.
 *
 * Saat aplikasi diminimalkan / layar dikunci, Android memberi tahu WebView bahwa jendelanya tidak terlihat.
 * Halaman lalu menerima visibilitychange=hidden dan pemutar YouTube menjeda musik. Dengan tetap melaporkan
 * VISIBLE, halaman terus berjalan sehingga lagu tidak berhenti (dipasang lewat res/layout/capacitor_bridge_layout_main.xml).
 */
public class BackgroundWebView extends CapacitorWebView {

    public BackgroundWebView(Context context, AttributeSet attrs) {
        super(context, attrs);
    }

    @Override
    protected void onWindowVisibilityChanged(int visibility) {
        super.onWindowVisibilityChanged(View.VISIBLE);
    }

    @Override
    protected void onVisibilityChanged(View changedView, int visibility) {
        super.onVisibilityChanged(changedView, View.VISIBLE);
    }
}
