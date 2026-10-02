package com.shadowreaper.standalone;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;
import com.shadowreaper.standalone.plugin.ShadowReaperBridgePlugin;

/**
 * Shadow Reaper — MainActivity
 *
 * Extends BridgeActivity (Capacitor's WebView host).
 * Registers the custom ShadowReaperBridgePlugin which connects the
 * Shadow Reaper JS Device Action Router to Android native APIs.
 *
 * SECURITY:
 *   All device actions go through the allowlisted ShadowReaperBridgePlugin.
 *   No arbitrary code execution is exposed from this bridge.
 *   Every dangerous permission requires explicit user approval via the
 *   Android system permission dialog.
 */
public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Register custom Shadow Reaper native bridge plugin
        registerPlugin(ShadowReaperBridgePlugin.class);

        super.onCreate(savedInstanceState);
    }
}
