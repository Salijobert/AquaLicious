package com.aqualicious.pos;

import android.os.Bundle;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ReceiptPrinterPlugin.class);
        super.onCreate(savedInstanceState);

        // Forward native status bar and display cutout insets into the WebView
        if (getBridge() != null && getBridge().getWebView() != null) {
            ViewCompat.setOnApplyWindowInsetsListener(getBridge().getWebView(), (v, windowInsets) -> {
                Insets insets = windowInsets.getInsets(
                    WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
                );
                float density = getResources().getDisplayMetrics().density;
                if (density > 0) {
                    float topDp = insets.top / density;
                    float bottomDp = insets.bottom / density;
                    float leftDp = insets.left / density;
                    float rightDp = insets.right / density;

                    String js = String.format(
                        java.util.Locale.US,
                        "window.__AQUALICIOUS_NATIVE_INSETS__ = { top: %.2f, bottom: %.2f, left: %.2f, right: %.2f };" +
                        "if (typeof window.__applyAquaLiciousInsets__ === 'function') { window.__applyAquaLiciousInsets__(window.__AQUALICIOUS_NATIVE_INSETS__); }",
                        topDp, bottomDp, leftDp, rightDp
                    );
                    getBridge().getWebView().evaluateJavascript(js, null);
                }
                return windowInsets;
            });
        }
    }
}
