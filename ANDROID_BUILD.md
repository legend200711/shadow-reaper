# Shadow Reaper — Android Build Guide

## Prerequisites

To build a real Shadow Reaper APK/AAB you need:

| Requirement | Version | Notes |
|---|---|---|
| Node.js | 18+ | For Capacitor CLI + build scripts |
| Java JDK | **21** (required) | Capacitor 8 plugins require Java 21 |
| Android Studio | 2024.2+ | Recommended — installs SDK automatically |
| Android SDK | API 36 (compileSdk) | Must be installed via SDK Manager |
| Android SDK Build Tools | 36.x.x | Required for APK compilation |
| Android SDK Platforms | android-36 | Required target platform |
| Gradle | 8.14+ | Downloaded automatically by `./gradlew` |

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy web app into www/ and sync with Android project
npm run build:android
# Or manually:
node scripts/build-www.js
npx cap sync android

# 3. Open in Android Studio (recommended for APK build)
npm run open:android
# Or: npx cap open android
```

---

## Build Steps (Android Studio)

1. Run `npm run build:android` (syncs web assets + plugins)
2. Open Android Studio: `npm run open:android`
3. Wait for Gradle sync to complete
4. Select **Build > Build App Bundle(s) / APK(s) > Build APK(s)**
5. Find APK at: `android/app/build/outputs/apk/debug/app-debug.apk`

---

## Build Steps (Command Line — requires full SDK)

```bash
cd android

# Debug APK
./gradlew assembleDebug
# → android/app/build/outputs/apk/debug/app-debug.apk

# Release APK (requires signing keystore)
./gradlew assembleRelease
# → android/app/build/outputs/apk/release/app-release-unsigned.apk

# Release AAB (for Play Store)
./gradlew bundleRelease
# → android/app/build/outputs/bundle/release/app-release.aab
```

---

## After Every Web Change

When you modify any web application file (index.html, platform/*.js, etc.),
you must re-sync before building:

```bash
npm run build:android   # copies www/ + npx cap sync android
```

---

## Android Project Details

| Item | Value |
|---|---|
| Package ID | `com.shadowreaper.standalone` |
| Min SDK | API 24 (Android 7.0) |
| Target SDK | API 36 (Android 16) |
| Compile SDK | API 36 |
| Architecture | Capacitor 8 (WebView bridge) |

---

## Capacitor Plugins Included

| Plugin | Purpose |
|---|---|
| `@capacitor/local-notifications` | Scheduled reminders (fires when app closed) |
| `@capacitor/haptics` | Haptic feedback |
| `@capacitor/geolocation` | GPS/location |
| `@capacitor/share` | Native Android share sheet |
| `@capacitor/clipboard` | Read/write clipboard |
| `@capacitor/camera` | Camera + photo picker |
| `@capacitor/filesystem` | User-selected file access |
| `ShadowReaperBridgePlugin` (custom) | openApp, openUrl, vibrate, permissions |

---

## Custom Plugin

`android/app/src/main/java/com/shadowreaper/standalone/plugin/ShadowReaperBridgePlugin.java`

Allowed actions (allowlist — no arbitrary execution):
- `openApp` — launch installed app by package name
- `openUrl` — open URL via system intent (https/http/mailto only)
- `vibrate` — haptic vibration with pattern
- `getNetworkStatus` — connectivity info
- `requestPermission` — request camera/mic/location/notifications
- `checkPermission` — query permission state

---

## Android Permissions Declared

All permissions are declared in `AndroidManifest.xml`.
Dangerous permissions require explicit user approval at runtime.

| Permission | Dangerous? | Required For |
|---|---|---|
| INTERNET | No | Firebase, AI, sync |
| ACCESS_NETWORK_STATE | No | Network status |
| VIBRATE | No | Haptics |
| CAMERA | YES | Camera capability |
| RECORD_AUDIO | YES | Microphone / voice input |
| ACCESS_FINE_LOCATION | YES | Location |
| ACCESS_COARSE_LOCATION | YES | Location |
| POST_NOTIFICATIONS | YES (API 33+) | Notifications |
| READ_MEDIA_IMAGES | YES (API 33+) | Photo picker |
| READ_EXTERNAL_STORAGE | YES (≤API 32) | Photo picker (legacy) |
| SCHEDULE_EXACT_ALARM | YES (API 31+) | Scheduled reminders |
| RECEIVE_BOOT_COMPLETED | No | Reschedule reminders after reboot |
| WAKE_LOCK | No | Notification delivery |

---

## Security Contract

- AI-generated text NEVER directly calls native APIs
- All device actions go through `SRDeviceActionRouter` → allowlist check → `ShadowReaperBridgePlugin`
- Permissions are NEVER requested silently — always via Android system dialog
- The native bridge does NOT expose shell execution, file system access, or arbitrary intents
- Authentication, UID isolation, Founder security, and private memory are preserved

---

## Physical Testing

Physical device testing requires APK installation.

Tests that require a real device:
- Launch Shadow Reaper native
- Login / Firebase auth
- Microphone permission dialog
- Camera permission dialog  
- Notification permission dialog
- Location permission dialog
- Photo picker (native camera roll)
- File picker
- Native share sheet
- Clipboard write
- Haptics / vibration
- Open URL (browser/YouTube/etc.)
- Open installed app by package name
- Voice → intent → Device Action Router → Android action

**PHYSICAL TEST REQUIRED** — none of the above can be verified without APK installation on a real device.

---

## Known Limitations

1. **Voice Input (SpeechRecognition API)** — Chrome on Android supports `webkitSpeechRecognition` in a WebView, but it may require a user gesture and will not work in the background.

2. **Geofencing** — Not currently implemented. Requires background location + `android.permission.ACCESS_BACKGROUND_LOCATION` (restricted in Play Store). Marked `NATIVE_APP_REQUIRED`.

3. **Background Tasks** — True background work beyond notifications is not implemented. Service Worker handles PWA background sync.

4. **Play Store distribution** — APK is unsigned debug build. For Play Store, create a signing keystore and use `assembleRelease` / `bundleRelease`.

5. **Web Speech in WebView** — `webkitSpeechRecognition` availability in Capacitor WebView varies by Android version and Chrome WebView version.

---

## Files Created / Modified

**New files:**
- `package.json` — npm project configuration
- `capacitor.config.json` — Capacitor configuration
- `scripts/build-www.js` — web asset build script
- `android/` — full Android native project (Capacitor-generated + customized)
- `android/app/src/main/AndroidManifest.xml` — permissions + manifest
- `android/app/src/main/java/com/shadowreaper/standalone/MainActivity.java` — registers custom plugin
- `android/app/src/main/java/com/shadowreaper/standalone/plugin/ShadowReaperBridgePlugin.java` — custom native bridge
- `android/app/src/main/res/xml/network_security_config.xml` — HTTPS-only config
- `www/` — web app copy for Capacitor bundle

**Modified files:**
- `platform/sr-capability-manager.js` — added `NATIVE_APP_REQUIRED`, `WEB_AVAILABLE` states
- `platform/sr-device-action-router.js` — added `OPEN_APP`, `REQUEST_CAMERA`, native Capacitor bridge connections
- `platform/adapters/sr-android-adapter.js` — full native plugin bridge with all capabilities
- `index.html` — updated Device Controls UI to show new status types
