package com.shadowreaper.standalone.plugin;

import android.Manifest;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.ServiceConnection;
import android.content.pm.PackageManager;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Build;
import android.os.IBinder;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.shadowreaper.standalone.service.VoiceAssistantService;

import org.json.JSONArray;

/**
 * ShadowReaperBridgePlugin
 *
 * Custom Capacitor plugin for Shadow Reaper native Android capabilities.
 *
 * SECURITY CONTRACT:
 *   - Only allowlisted actions from this plugin are callable from JavaScript.
 *   - All device actions go through SRDeviceActionRouter before reaching this plugin.
 *   - The plugin never exposes arbitrary code execution.
 *   - Every dangerous capability requires Android runtime permission.
 *   - The user is always presented the Android system permission dialog.
 *   - This plugin NEVER bypasses Android permission or security controls.
 *
 * ALLOWED ACTIONS (via @PluginMethod):
 *   openApp        — launch another installed app by package name or URL
 *   openUrl        — open a URL in the system browser or appropriate handler
 *   vibrate        — haptic feedback (pattern-based)
 *   getNetworkStatus — check connectivity without permission
 *   requestPermission — request a named dangerous permission (mic/camera/location)
 *   checkPermission   — query current permission state without requesting
 *   startVoiceService  — start VoiceAssistantService foreground service
 *   stopVoiceService   — stop VoiceAssistantService foreground service
 *   updateVoiceStatus  — update persistent notification text (called from JS voice state)
 *   getVoiceServiceState — query whether foreground service is running
 *
 * NOT IMPLEMENTED (intentionally absent):
 *   executeShell, runCommand, readArbitraryFile, bypassPermission,
 *   SMS control, phone call control, contacts access, notification scraping,
 *   accessibility-service automation, screen scraping
 */
@CapacitorPlugin(
    name = "ShadowReaperBridge",
    permissions = {
        @Permission(
            alias = "camera",
            strings = { Manifest.permission.CAMERA }
        ),
        @Permission(
            alias = "microphone",
            strings = { Manifest.permission.RECORD_AUDIO }
        ),
        @Permission(
            alias = "location",
            strings = {
                Manifest.permission.ACCESS_FINE_LOCATION,
                Manifest.permission.ACCESS_COARSE_LOCATION
            }
        ),
        @Permission(
            alias = "notifications",
            strings = { "android.permission.POST_NOTIFICATIONS" }
        )
    }
)
public class ShadowReaperBridgePlugin extends Plugin {

    // ── Voice Assistant Service state ─────────────────────────────────────────
    private VoiceAssistantService _voiceService     = null;
    private boolean               _voiceServiceBound = false;

    private final ServiceConnection _voiceServiceConn = new ServiceConnection() {
        @Override
        public void onServiceConnected(ComponentName name, IBinder service) {
            VoiceAssistantService.LocalBinder binder =
                (VoiceAssistantService.LocalBinder) service;
            _voiceService      = binder.getService();
            _voiceServiceBound = true;
        }
        @Override
        public void onServiceDisconnected(ComponentName name) {
            _voiceService      = null;
            _voiceServiceBound = false;
        }
    };

    // ── startVoiceService ─────────────────────────────────────────────────────
    /**
     * startVoiceService()
     *
     * Starts VoiceAssistantService as a foreground service.
     * Requires FOREGROUND_SERVICE permission (declared in manifest).
     * The service shows a persistent notification so the user is always aware.
     *
     * Called from JS: window.SRVoiceAssistant (when background availability enabled).
     */
    @PluginMethod
    public void startVoiceService(PluginCall call) {
        try {
            Intent intent = new Intent(getContext(), VoiceAssistantService.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                getContext().startForegroundService(intent);
            } else {
                getContext().startService(intent);
            }
            // Also bind so we can send status updates
            getContext().bindService(intent, _voiceServiceConn, Context.BIND_AUTO_CREATE);

            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("started", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to start voice service: " + e.getMessage(), "SERVICE_START_FAILED");
        }
    }

    // ── stopVoiceService ──────────────────────────────────────────────────────
    /**
     * stopVoiceService()
     *
     * Stops the VoiceAssistantService foreground service.
     * Called when the user disables Background Availability.
     */
    @PluginMethod
    public void stopVoiceService(PluginCall call) {
        try {
            if (_voiceServiceBound && _voiceService != null) {
                getContext().unbindService(_voiceServiceConn);
                _voiceServiceBound = false;
                _voiceService = null;
            }
            Intent intent = new Intent(getContext(), VoiceAssistantService.class);
            getContext().stopService(intent);

            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("stopped", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to stop voice service: " + e.getMessage(), "SERVICE_STOP_FAILED");
        }
    }

    // ── updateVoiceStatus ─────────────────────────────────────────────────────
    /**
     * updateVoiceStatus({ status: string })
     *
     * Updates the persistent notification text to reflect the current voice state.
     * Called from JS SRVoiceAssistant.onStateChange().
     * Examples: "Shadow • Standby", "Shadow • Listening", "Shadow • Thinking"
     */
    @PluginMethod
    public void updateVoiceStatus(PluginCall call) {
        String status = call.getString("status", "Shadow • Standby");
        if (_voiceServiceBound && _voiceService != null) {
            _voiceService.updateStatus(status);
        }
        JSObject result = new JSObject();
        result.put("ok", true);
        call.resolve(result);
    }

    // ── getVoiceServiceState ──────────────────────────────────────────────────
    /**
     * getVoiceServiceState()
     *
     * Returns whether the foreground service is currently running.
     */
    @PluginMethod
    public void getVoiceServiceState(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("running", _voiceServiceBound && _voiceService != null && _voiceService.isRunning());
        call.resolve(result);
    }

    // ── openApp ───────────────────────────────────────────────────────────────
    /**
     * openApp({ packageName?: string, url?: string })
     *
     * Opens another installed app by package name, or falls back to a URL.
     * If packageName is provided, tries to launch it via Intent. If the app
     * is not installed, opens the Play Store listing if available.
     * If only url is provided, opens it via the system URL handler.
     *
     * The user will see the Android system app-chooser or app launch as normal.
     * This plugin does NOT force a specific app; Android decides the handler.
     */
    @PluginMethod
    public void openApp(PluginCall call) {
        String packageName = call.getString("packageName", "");
        String url         = call.getString("url", "");

        if (packageName != null && !packageName.isEmpty()) {
            // Try to launch by package name
            PackageManager pm = getContext().getPackageManager();
            Intent launchIntent = pm.getLaunchIntentForPackage(packageName);
            if (launchIntent != null) {
                launchIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    getContext().startActivity(launchIntent);
                    JSObject result = new JSObject();
                    result.put("ok", true);
                    result.put("launched", packageName);
                    call.resolve(result);
                } catch (Exception e) {
                    call.reject("Failed to launch app: " + e.getMessage(), "LAUNCH_FAILED");
                }
                return;
            }
            // App not installed — open Play Store
            try {
                Intent playIntent = new Intent(Intent.ACTION_VIEW,
                    Uri.parse("market://details?id=" + packageName));
                playIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                getContext().startActivity(playIntent);
                JSObject result = new JSObject();
                result.put("ok", true);
                result.put("redirected", "play_store");
                call.resolve(result);
            } catch (Exception e) {
                // Play Store not available — fall through to URL if provided
                if (url == null || url.isEmpty()) {
                    call.reject("App not installed and Play Store unavailable", "APP_NOT_FOUND");
                    return;
                }
                // Fall through to URL handling below
            }
        }

        if (url != null && !url.isEmpty()) {
            _openUrl(call, url);
        } else if (packageName == null || packageName.isEmpty()) {
            call.reject("Neither packageName nor url provided", "INVALID_PARAMS");
        }
    }

    // ── openUrl ───────────────────────────────────────────────────────────────
    /**
     * openUrl({ url: string })
     *
     * Opens a URL using the Android system Intent mechanism. The OS decides
     * which app handles it (browser, YouTube app, Maps, etc.).
     * Only http:// and https:// schemes are permitted.
     */
    @PluginMethod
    public void openUrl(PluginCall call) {
        String url = call.getString("url", "");
        if (url == null || url.isEmpty()) {
            call.reject("No URL provided", "INVALID_PARAMS");
            return;
        }
        _openUrl(call, url);
    }

    private void _openUrl(PluginCall call, String url) {
        // Only allow http/https schemes for safety
        if (!url.startsWith("https://") && !url.startsWith("http://") && !url.startsWith("mailto:")) {
            call.reject("Unsafe URL scheme — only https://, http://, and mailto: are allowed", "UNSAFE_SCHEME");
            return;
        }
        try {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject result = new JSObject();
            result.put("ok", true);
            result.put("url", url);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to open URL: " + e.getMessage(), "OPEN_FAILED");
        }
    }

    // ── vibrate ───────────────────────────────────────────────────────────────
    /**
     * vibrate({ pattern?: number[] })
     *
     * Triggers haptic vibration using the Android Vibrator service.
     * Pattern is an array of milliseconds [on, off, on, off...].
     * Defaults to [200] (single 200ms pulse).
     * Requires VIBRATE permission (normal, no runtime dialog needed).
     */
    @PluginMethod
    public void vibrate(PluginCall call) {
        JSArray pattern = call.getArray("pattern");
        long[] vibratePattern;

        if (pattern != null && pattern.length() > 0) {
            // JSArray extends JSONArray, so cast directly — no checked exception
            JSONArray arr = (JSONArray) pattern;
            vibratePattern = new long[arr.length()];
            for (int i = 0; i < arr.length(); i++) {
                vibratePattern[i] = arr.optLong(i, 200);
            }
        } else {
            vibratePattern = new long[]{ 200 };
        }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getContext().getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                if (vm != null) {
                    Vibrator v = vm.getDefaultVibrator();
                    v.vibrate(VibrationEffect.createWaveform(vibratePattern, -1));
                }
            } else {
                Vibrator v = (Vibrator) getContext().getSystemService(Context.VIBRATOR_SERVICE);
                if (v != null) {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        v.vibrate(VibrationEffect.createWaveform(vibratePattern, -1));
                    } else {
                        v.vibrate(vibratePattern, -1);
                    }
                }
            }
            JSObject result = new JSObject();
            result.put("ok", true);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Vibration failed: " + e.getMessage(), "VIBRATE_FAILED");
        }
    }

    // ── getNetworkStatus ──────────────────────────────────────────────────────
    /**
     * getNetworkStatus()
     *
     * Returns current network connectivity state.
     * No permission required.
     * Returns { ok: true, connected: boolean, connectionType: string }
     */
    @PluginMethod
    public void getNetworkStatus(PluginCall call) {
        ConnectivityManager cm = (ConnectivityManager)
            getContext().getSystemService(Context.CONNECTIVITY_SERVICE);

        boolean connected = false;
        String connectionType = "none";

        if (cm != null) {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                android.net.Network network = cm.getActiveNetwork();
                if (network != null) {
                    NetworkCapabilities caps = cm.getNetworkCapabilities(network);
                    if (caps != null) {
                        connected = true;
                        if (caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)) {
                            connectionType = "wifi";
                        } else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR)) {
                            connectionType = "cellular";
                        } else if (caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET)) {
                            connectionType = "ethernet";
                        } else {
                            connectionType = "unknown";
                        }
                    }
                }
            }
        }

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("connected", connected);
        result.put("connectionType", connectionType);
        call.resolve(result);
    }

    // ── requestPermission ─────────────────────────────────────────────────────
    /**
     * requestPermission({ permission: "camera"|"microphone"|"location"|"notifications" })
     *
     * Requests a dangerous Android permission by showing the system dialog.
     * NEVER silently grants permissions.
     * NEVER bypasses Android security.
     * Returns { ok: boolean, state: "granted"|"denied"|"prompt" }
     */
    @PluginMethod
    public void requestPermission(PluginCall call) {
        String permName = call.getString("permission", "");
        if (permName == null || permName.isEmpty()) {
            call.reject("No permission name provided", "INVALID_PARAMS");
            return;
        }

        switch (permName) {
            case "camera":
                requestPermissionForAlias("camera", call, "cameraPermissionCallback");
                break;
            case "microphone":
                requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
                break;
            case "location":
                requestPermissionForAlias("location", call, "locationPermissionCallback");
                break;
            case "notifications":
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    requestPermissionForAlias("notifications", call, "notificationsPermissionCallback");
                } else {
                    // Pre-Android 13: notifications don't need runtime permission
                    JSObject result = new JSObject();
                    result.put("ok", true);
                    result.put("state", "granted");
                    result.put("reason", "pre_android_13_always_granted");
                    call.resolve(result);
                }
                break;
            default:
                call.reject("Unknown permission: " + permName, "UNKNOWN_PERMISSION");
        }
    }

    @PermissionCallback
    private void cameraPermissionCallback(PluginCall call) {
        _resolvePermissionResult(call, "camera");
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        _resolvePermissionResult(call, "microphone");
    }

    @PermissionCallback
    private void locationPermissionCallback(PluginCall call) {
        _resolvePermissionResult(call, "location");
    }

    @PermissionCallback
    private void notificationsPermissionCallback(PluginCall call) {
        _resolvePermissionResult(call, "notifications");
    }

    private void _resolvePermissionResult(PluginCall call, String alias) {
        String state = getPermissionState(alias).toString().toLowerCase();
        JSObject result = new JSObject();
        result.put("ok", "granted".equals(state));
        result.put("state", state);
        result.put("permission", alias);
        call.resolve(result);
    }

    // ── checkPermission ───────────────────────────────────────────────────────
    /**
     * checkPermission({ permission: string })
     *
     * Returns current state of a permission without requesting it.
     * Returns { ok: true, state: "granted"|"denied"|"prompt" }
     */
    @PluginMethod
    public void checkPermission(PluginCall call) {
        String permName = call.getString("permission", "");
        if (permName == null || permName.isEmpty()) {
            call.reject("No permission name provided", "INVALID_PARAMS");
            return;
        }

        // Map SR permission names to Android permission strings
        String androidPermission;
        switch (permName) {
            case "camera":
                androidPermission = Manifest.permission.CAMERA;
                break;
            case "microphone":
                androidPermission = Manifest.permission.RECORD_AUDIO;
                break;
            case "location":
                androidPermission = Manifest.permission.ACCESS_FINE_LOCATION;
                break;
            case "notifications":
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
                    JSObject result = new JSObject();
                    result.put("ok", true);
                    result.put("state", "granted");
                    result.put("reason", "pre_android_13_always_granted");
                    call.resolve(result);
                    return;
                }
                androidPermission = "android.permission.POST_NOTIFICATIONS";
                break;
            default:
                call.reject("Unknown permission: " + permName, "UNKNOWN_PERMISSION");
                return;
        }

        int checkResult = getContext().checkSelfPermission(androidPermission);
        String state = (checkResult == PackageManager.PERMISSION_GRANTED) ? "granted" : "denied";

        JSObject result = new JSObject();
        result.put("ok", true);
        result.put("state", state);
        result.put("permission", permName);
        call.resolve(result);
    }
}
