/**
 * shadow-reaper-standalone/sr-feature-registry.js
 * Shadow Reaper Standalone — Feature Registry
 *
 * Build: SR-STANDALONE-FEATURE-REGISTRY-2
 *
 * Exposes: window.SRFeatureRegistry
 *
 * PURPOSE:
 *   Single source of truth for every Shadow Reaper feature's implementation
 *   status per runtime platform. Prevents the UI from advertising features
 *   that do not actually exist or do not work in the current runtime.
 *
 * FIELDS per entry:
 *   feature          — feature name
 *   web              — works in WEB_DESKTOP / WEB_MOBILE browser
 *   pwa              — works in PWA_DESKTOP / PWA_MOBILE (installed web app)
 *   androidNative    — works in ANDROID_NATIVE (Capacitor APK)
 *   iosNative        — works in IOS_NATIVE (future Capacitor iOS app)
 *   implemented      — true if backend/logic is actually built
 *   connected        — true if wired to the UI in index.html
 *   authRequired     — true if requires Firebase auth
 *   permRequired     — true if OS permission required
 *   status           — CONNECTED | PARTIAL | PENDING | NOT_IMPLEMENTED | FUTURE
 *   notes            — brief explanation
 *
 * PLATFORM STATUSES per column:
 *   YES       — fully functional on this platform
 *   PARTIAL   — limited version available
 *   NO        — not available / intentionally hidden
 *   FUTURE    — planned but not built yet
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-FEATURE-REGISTRY-2';

  var REGISTRY = [
    {
      feature: 'Authentication',
      web: 'YES', pwa: 'YES', androidNative: 'YES', iosNative: 'YES',
      implemented: true, connected: true, authRequired: false,
      permRequired: false, status: 'CONNECTED',
      notes: 'Firebase email/password auth. Same account across all platforms. SRAuthUI + SRFirebaseAdapter.'
    },
    {
      feature: 'AI Conversation',
      web: 'YES', pwa: 'YES', androidNative: 'YES', iosNative: 'YES',
      implemented: true, connected: true, authRequired: false,
      permRequired: false, status: 'CONNECTED',
      notes: 'ShadowReaper.ask() pipeline. Works signed out (session) and signed in (persistent).'
    },
    {
      feature: 'Recent Conversations',
      web: 'YES', pwa: 'YES', androidNative: 'YES', iosNative: 'YES',
      implemented: true, connected: true, authRequired: true,
      permRequired: false, status: 'CONNECTED',
      notes: 'SNXShadowConvHistory. Firestore users/{uid}/shadowReaperConversations.'
    },
    {
      feature: 'Projects',
      web: 'YES', pwa: 'YES', androidNative: 'YES', iosNative: 'YES',
      implemented: true, connected: true, authRequired: true,
      permRequired: false, status: 'CONNECTED',
      notes: 'SNXShadowAdaptive PROJECT category + context engine. UI panel in index.html.'
    },
    {
      feature: 'Personal Memory',
      web: 'YES', pwa: 'YES', androidNative: 'YES', iosNative: 'YES',
      implemented: true, connected: true, authRequired: true,
      permRequired: false, status: 'CONNECTED',
      notes: 'SNXShadowMemory. "remember…" commands. Firestore users/{uid}/shadowReaperMemory.'
    },
    {
      feature: 'Adaptive Learning',
      web: 'YES', pwa: 'YES', androidNative: 'YES', iosNative: 'YES',
      implemented: true, connected: true, authRequired: false,
      permRequired: false, status: 'CONNECTED',
      notes: 'SNXShadowAdaptive + SRAdaptiveBrain. Session-only for guests.'
    },
    {
      feature: 'Conversation History',
      web: 'YES', pwa: 'YES', androidNative: 'YES', iosNative: 'YES',
      implemented: true, connected: true, authRequired: true,
      permRequired: false, status: 'CONNECTED',
      notes: 'SNXShadowConvHistory. Toggle in Settings.'
    },
    {
      feature: 'Knowledge Engine',
      web: 'YES', pwa: 'YES', androidNative: 'YES', iosNative: 'YES',
      implemented: true, connected: true, authRequired: false,
      permRequired: false, status: 'CONNECTED',
      notes: 'SRKnowledge — static knowledge retrieval. SRKnowledgeLearner on every turn.'
    },
    {
      feature: 'Translation',
      web: 'YES', pwa: 'YES', androidNative: 'YES', iosNative: 'YES',
      implemented: true, connected: true, authRequired: false,
      permRequired: false, status: 'CONNECTED',
      notes: 'SRTranslation local dictionary. parseTranslationRequest() in pipeline.'
    },
    {
      feature: 'Language Foundation',
      web: 'YES', pwa: 'YES', androidNative: 'YES', iosNative: 'YES',
      implemented: true, connected: true, authRequired: false,
      permRequired: false, status: 'CONNECTED',
      notes: 'SRLanguage + tokenizer/morphology/semantics. 113K+ vocabulary.'
    },
    {
      feature: 'Voice Input',
      web: 'PARTIAL', pwa: 'PARTIAL', androidNative: 'PARTIAL', iosNative: 'FUTURE',
      implemented: true, connected: true, authRequired: false,
      permRequired: true, status: 'CONNECTED',
      notes: 'SRVoice.startListening(). Web Speech API (Chrome/Edge/Safari only). Microphone permission required. WebView support varies by Android version.'
    },
    {
      feature: 'TTS (Voice Response)',
      web: 'YES', pwa: 'YES', androidNative: 'YES', iosNative: 'YES',
      implemented: true, connected: true, authRequired: false,
      permRequired: false, status: 'CONNECTED',
      notes: 'SRVoice.speak(). SpeechSynthesis API. Toggle in Settings.'
    },
    {
      feature: 'Wake Name',
      web: 'PARTIAL', pwa: 'PARTIAL', androidNative: 'PARTIAL', iosNative: 'FUTURE',
      implemented: true, connected: true, authRequired: true,
      permRequired: true, status: 'CONNECTED',
      notes: 'SRWakeName. Active-tab only on web — no background listening. Names: Salem/Shadow/etc.'
    },
    // ── Device Controls — Phone (THIS PHONE) ──────────────────────────────
    {
      feature: 'Control This Android Phone',
      web: 'NO', pwa: 'NO', androidNative: 'YES', iosNative: 'NO',
      implemented: true, connected: true, authRequired: true,
      permRequired: true, status: 'CONNECTED',
      notes: 'Requires ANDROID_NATIVE runtime (Capacitor APK). Web/PWA cannot access phone controls. Capabilities: mic, camera, notifications, haptics, location, share, clipboard, openApp, file/photo picker.'
    },
    {
      feature: 'Control This iPhone',
      web: 'NO', pwa: 'NO', androidNative: 'NO', iosNative: 'YES',
      implemented: false, connected: false, authRequired: true,
      permRequired: true, status: 'NOT_IMPLEMENTED',
      notes: 'FUTURE: requires iOS native app. Not yet built.'
    },
    {
      feature: 'Notifications (Web)',
      web: 'YES', pwa: 'YES', androidNative: 'YES', iosNative: 'YES',
      implemented: true, connected: true, authRequired: true,
      permRequired: true, status: 'CONNECTED',
      notes: 'Browser Notification API (web/PWA). Capacitor LocalNotifications (native). User permission required.'
    },
    {
      feature: 'Scheduled Reminders (Native)',
      web: 'PARTIAL', pwa: 'PARTIAL', androidNative: 'YES', iosNative: 'FUTURE',
      implemented: true, connected: true, authRequired: true,
      permRequired: true, status: 'CONNECTED',
      notes: 'Native: fires when app closed (@capacitor/local-notifications). Web: setTimeout only while tab is open.'
    },
    // ── Device Controls — Other Devices ───────────────────────────────────
    {
      feature: 'Paired Computer Control',
      web: 'FUTURE', pwa: 'FUTURE', androidNative: 'FUTURE', iosNative: 'FUTURE',
      implemented: false, connected: false, authRequired: true,
      permRequired: false, status: 'NOT_IMPLEMENTED',
      notes: 'FUTURE STAGE. Requires Desktop Agent deployment + secure backend pairing. Not native-only — will work from any client once built.'
    },
    {
      feature: 'Smart Device Control (TV/lights/etc.)',
      web: 'FUTURE', pwa: 'FUTURE', androidNative: 'FUTURE', iosNative: 'FUTURE',
      implemented: false, connected: false, authRequired: true,
      permRequired: false, status: 'NOT_IMPLEMENTED',
      notes: 'FUTURE STAGE. Not native-only — will route through secure backend to authorized device integration.'
    },
    // ── Distribution ──────────────────────────────────────────────────────
    {
      feature: 'PWA Install',
      web: 'YES', pwa: 'YES', androidNative: 'NO', iosNative: 'NO',
      implemented: true, connected: true, authRequired: false,
      permRequired: false, status: 'CONNECTED',
      notes: 'manifest.json, sw.js, beforeinstallprompt. Provides lightweight installable web experience.'
    },
    {
      feature: 'Android Native App Download',
      web: 'YES', pwa: 'YES', androidNative: 'NO', iosNative: 'NO',
      implemented: true, connected: true, authRequired: false,
      permRequired: false, status: 'CONNECTED',
      notes: 'downloads/ShadowReaper.apk — release-signed. Download button shown on Android and general download area.'
    },
    {
      feature: 'iOS Native App Download',
      web: 'FUTURE', pwa: 'FUTURE', androidNative: 'NO', iosNative: 'NO',
      implemented: false, connected: false, authRequired: false,
      permRequired: false, status: 'NOT_IMPLEMENTED',
      notes: 'FUTURE STAGE. iOS native app not yet built.'
    },
    // ── Other ─────────────────────────────────────────────────────────────
    {
      feature: 'Global Learning',
      web: 'NO', pwa: 'NO', androidNative: 'NO', iosNative: 'NO',
      implemented: false, connected: false, authRequired: true,
      permRequired: false, status: 'NOT_IMPLEMENTED',
      notes: 'Architecture skeleton exists but requires server deployment + Founder review queue.'
    },
    {
      feature: 'Internet Research',
      web: 'NO', pwa: 'NO', androidNative: 'NO', iosNative: 'NO',
      implemented: false, connected: false, authRequired: false,
      permRequired: false, status: 'NOT_IMPLEMENTED',
      notes: 'Security guards exist. Cloudflare Worker must be deployed first.'
    },
    {
      feature: 'Desktop Agent',
      web: 'NO', pwa: 'NO', androidNative: 'NO', iosNative: 'NO',
      implemented: false, connected: false, authRequired: true,
      permRequired: false, status: 'NOT_IMPLEMENTED',
      notes: 'FUTURE STAGE. Not native-only — will be a separate desktop application once built.'
    },
    {
      feature: 'Founder Controls',
      web: 'YES', pwa: 'YES', androidNative: 'YES', iosNative: 'YES',
      implemented: true, connected: true, authRequired: true,
      permRequired: false, status: 'CONNECTED',
      notes: 'SRFounderControls + SRFounderSecurity. Server-side role claim required. Invisible to normal users.'
    },
  ];

  function getAll()           { return REGISTRY.slice(); }
  function get(featureName) {
    var lower = featureName.toLowerCase();
    for (var i = 0; i < REGISTRY.length; i++) {
      if (REGISTRY[i].feature.toLowerCase() === lower) return REGISTRY[i];
    }
    return null;
  }
  function getByStatus(status) {
    return REGISTRY.filter(function (r) { return r.status === status; });
  }
  function isConnected(featureName) {
    var entry = get(featureName);
    return entry ? entry.connected : false;
  }

  // Returns features available on a given platform string:
  // 'web' | 'pwa' | 'androidNative' | 'iosNative'
  function getForPlatform(platformKey) {
    return REGISTRY.filter(function (r) {
      return r[platformKey] === 'YES' || r[platformKey] === 'PARTIAL';
    });
  }

  global.SRFeatureRegistry = {
    build:          BUILD_ID,
    getAll:         getAll,
    get:            get,
    getByStatus:    getByStatus,
    isConnected:    isConnected,
    getForPlatform: getForPlatform,
  };

})(typeof window !== 'undefined' ? window : global);
