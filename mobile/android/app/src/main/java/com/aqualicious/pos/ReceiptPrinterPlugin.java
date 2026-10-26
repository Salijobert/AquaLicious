package com.aqualicious.pos;

import android.content.Context;
import android.print.PrintAttributes;
import android.print.PrintManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "ReceiptPrinter")
public class ReceiptPrinterPlugin extends Plugin {
    @PluginMethod
    public void print(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                PrintManager manager = (PrintManager) getActivity().getSystemService(Context.PRINT_SERVICE);
                if (manager == null) { call.reject("Android print service is unavailable"); return; }
                manager.print("AquaLicious Receipt", getBridge().getWebView().createPrintDocumentAdapter("AquaLicious Receipt"), new PrintAttributes.Builder().build());
                call.resolve();
            } catch (Exception error) {
                call.reject("Unable to open Android print service", error);
            }
        });
    }
}
