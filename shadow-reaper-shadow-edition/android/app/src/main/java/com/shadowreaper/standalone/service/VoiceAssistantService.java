package com.shadowreaper.standalone.service;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.shadowreaper.standalone.MainActivity;
import com.shadowreaper.standalone.R;

/**
 * VoiceAssistantService
 *
 * Android foreground service that keeps Shadow Reaper available for voice
 * activation while the main UI is not on screen.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE:
 *   This service is an Android-layer AVAILABILITY SHIM only.
 *   It keeps the Capacitor WebView process alive (within Android's rules)
 *   so that JavaScript-based wake-word detection and the Shadow Reaper brain
 *   remain reachable while the user has other apps in the foreground.
 *
 *   The actual wake-word detection, speech recognition, and Shadow Reaper
 *   conversation pipeline all remain inside the WebView (JavaScript layer).
 *   This service does NOT contain a second AI, a second memory system, or
 *   a second knowledge engine.
 *
 * WHY A FOREGROUND SERVICE:
 *   Android aggressively kills background processes.  A foreground service
 *   with a persistent notification is the supported, documented way to
 *   request that Android keep the process alive for user-facing tasks.
 *   Reference: https://developer.android.com/guide/components/foreground-services
 *
 * WHAT THIS SERVICE DOES:
 *   1. Starts as a foreground service with a persistent "Shadow • Standby"
 *      notification (user can see it and dismiss it by disabling the feature).
 *   2. Keeps the Capacitor/WebView process alive so JS speech recognition
 *      can continue operating.
 *   3. Exposes a Binder so MainActivity can start/stop it on user command.
 *   4. Stops itself when the user disables Background Availability.
 *
 * WHAT THIS SERVICE DOES NOT DO:
 *   - Does NOT bypass Android permission controls.
 *   - Does NOT secretly activate the microphone.
 *   - Does NOT scrape notifications from other apps.
 *   - Does NOT read SMS, contacts, or call logs.
 *   - Does NOT install accessibility services.
 *   - Does NOT hide its presence (the notification is always visible).
 *   - Does NOT add phone-control, SMS, or call capabilities.
 *
 * ANDROID REALITY:
 *   The microphone access for speech recognition still requires a user gesture
 *   in the WebView (browser SpeechRecognition API constraint).  This service
 *   extends process lifetime; it does NOT provide native always-on wake-word
 *   detection.  For fully native always-on wake detection, a dedicated native
 *   wake-word engine library (e.g., Picovoice Porcupine, Snowboy) would be
 *   required — which is NOT present in this build.
 *
 *   Background wake capability status: PARTIAL
 *   (Foreground service keeps process alive; native wake engine: NOT PRESENT)
 *
 * PERMISSION REQUIRED (AndroidManifest.xml):
 *   <uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
 *   <uses-permission android:name="android.permission.FOREGROUND_SERVICE_MICROPHONE" /> (API 34+)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 */
public class VoiceAssistantService extends Service {

    // ── Notification constants ────────────────────────────────────────────────
    private static final String CHANNEL_ID       = "sr_voice_assistant";
    private static final String CHANNEL_NAME     = "Shadow Voice Assistant";
    private static final int    NOTIF_ID         = 4242;

    // ── Service state ─────────────────────────────────────────────────────────
    private boolean _running = false;

    // ── Binder (for MainActivity communication) ───────────────────────────────
    private final IBinder _binder = new LocalBinder();

    public class LocalBinder extends Binder {
        public VoiceAssistantService getService() {
            return VoiceAssistantService.this;
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return _binder;
    }

    // ── Service lifecycle ─────────────────────────────────────────────────────

    @Override
    public void onCreate() {
        super.onCreate();
        _createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (!_running) {
            _running = true;
            Notification notification = _buildNotification("Shadow • Standby");
            startForeground(NOTIF_ID, notification);
        }

        // START_NOT_STICKY: if the service is killed by Android, it will NOT
        // automatically restart. The user must re-enable Background Availability.
        // This is the honest, battery-respectful choice.
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        _running = false;
        stopForeground(true);
        super.onDestroy();
    }

    // ── Public methods (called from Capacitor plugin) ─────────────────────────

    /**
     * Update the persistent notification text to reflect current voice state.
     * Called by ShadowReaperBridgePlugin when the JS voice state changes.
     *
     * @param statusText  e.g. "Shadow • Standby", "Shadow • Listening"
     */
    public void updateStatus(String statusText) {
        if (!_running) return;
        Notification notification = _buildNotification(statusText);
        NotificationManager nm = (NotificationManager)
            getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm != null) {
            nm.notify(NOTIF_ID, notification);
        }
    }

    /**
     * Stop the foreground service cleanly.
     * Called when the user disables Background Availability.
     */
    public void stopSelf_clean() {
        _running = false;
        stopForeground(true);
        stopSelf();
    }

    public boolean isRunning() {
        return _running;
    }

    // ── Notification helpers ──────────────────────────────────────────────────

    private void _createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                CHANNEL_NAME,
                NotificationManager.IMPORTANCE_LOW   // LOW = silent, no vibrate
            );
            channel.setDescription("Shadow Reaper voice assistant availability");
            channel.setShowBadge(false);
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (nm != null) nm.createNotificationChannel(channel);
        }
    }

    private Notification _buildNotification(String contentText) {
        // Tapping the notification returns to Shadow Reaper
        Intent tapIntent = new Intent(this, MainActivity.class);
        tapIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent pendingIntent = PendingIntent.getActivity(this, 0, tapIntent, flags);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setContentTitle("Shadow Reaper")
            .setContentText(contentText != null ? contentText : "Shadow • Standby")
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)  // built-in mic icon
            .setContentIntent(pendingIntent)
            .setOngoing(true)           // cannot be dismissed by swipe
            .setSilent(true)            // no sound on update
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
    }
}
