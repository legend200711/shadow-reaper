/**
 * shadow-reaper-standalone/sr-feature-registry.js
 * Shadow Reaper Standalone — Feature Registry
 *
 * Build: SR-STANDALONE-FEATURE-REGISTRY-1
 *
 * Exposes: window.SRFeatureRegistry
 *
 * PURPOSE:
 *   Single source of truth for every Shadow Reaper feature's implementation
 *   status. Prevents the UI from advertising features that do not actually
 *   exist. Consumed by diagnostics tools and UI guards.
 *
 * FIELDS per entry:
 *   feature          — feature name
 *   implemented      — true if backend/logic exists
 *   connected        — true if wired to the UI in index.html
 *   authRequired     — true if requires Firebase auth
 *   platformLimit    — string describing any platform restriction, or null
 *   permRequired     — true if OS permission required
 *   status           — CONNECTED | PARTIAL | PENDING | NOT_IMPLEMENTED
 *   notes            — brief explanation
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-FEATURE-REGISTRY-1';

  var REGISTRY = [
    {
      feature: 'Authentication',
      implemented: true, connected: true, authRequired: false,
      platformLimit: null, permRequired: false,
      status: 'CONNECTED',
      notes: 'Firebase email/password auth via SRAuthUI + SRFirebaseAdapter. State drives all auth-gated UI.'
    },
    {
      feature: 'Conversation (AI)',
      implemented: true, connected: true, authRequired: false,
      platformLimit: null, permRequired: false,
      status: 'CONNECTED',
      notes: 'ShadowReaper.ask() → understanding → context → response pipeline. Works signed out and signed in.'
    },
    {
      feature: 'New Conversation',
      implemented: true, connected: true, authRequired: false,
      platformLimit: null, permRequired: false,
      status: 'CONNECTED',
      notes: 'ShadowReaper.newConversation() — clears session state without deleting stored history.'
    },
    {
      feature: 'Recent Conversations',
      implemented: true, connected: true, authRequired: true,
      platformLimit: null, permRequired: false,
      status: 'CONNECTED',
      notes: 'SNXShadowConvHistory.listRecent() + loadConversation(). Firestore users/{uid}/shadowReaperConversations.'
    },
    {
      feature: 'Projects',
      implemented: true, connected: true, authRequired: true,
      platformLimit: null, permRequired: false,
      status: 'CONNECTED',
      notes: 'Connected to context engine (projectName), SNXShadowAdaptive (PROJECT category), SRAdaptiveBrain, and Firestore. UI panel in index.html. Natural language: "my project is called X".'
    },
    {
      feature: 'Personal Memory',
      implemented: true, connected: true, authRequired: true,
      platformLimit: null, permRequired: false,
      status: 'CONNECTED',
      notes: 'SNXShadowMemory — explicit "remember…" commands. Toggle in Settings. Firestore users/{uid}/shadowReaperMemory.'
    },
    {
      feature: 'Adaptive Learning',
      implemented: true, connected: true, authRequired: false,
      platformLimit: null, permRequired: false,
      status: 'CONNECTED',
      notes: 'SNXShadowAdaptive + SRAdaptiveBrain. Toggle in Settings. Concept extraction runs on every turn. Session-only for guests.'
    },
    {
      feature: 'Conversation History',
      implemented: true, connected: true, authRequired: true,
      platformLimit: null, permRequired: false,
      status: 'CONNECTED',
      notes: 'SNXShadowConvHistory. Toggle in Settings. Continuity intent detected automatically. Firestore users/{uid}/shadowReaperConversations.'
    },
    {
      feature: 'Knowledge Engine',
      implemented: true, connected: true, authRequired: false,
      platformLimit: null, permRequired: false,
      status: 'CONNECTED',
      notes: 'SRKnowledge — static knowledge retrieval injected when relevant. SRKnowledgeLearner processes every turn.'
    },
    {
      feature: 'Translation',
      implemented: true, connected: true, authRequired: false,
      platformLimit: null, permRequired: false,
      status: 'CONNECTED',
      notes: 'SRTranslation — local dictionary. parseTranslationRequest() intercepts translation intents in pipeline. Honest about unsupported languages.'
    },
    {
      feature: 'Voice Input',
      implemented: true, connected: true, authRequired: false,
      platformLimit: 'Web Speech API (Chrome/Edge/Safari only)', permRequired: true,
      status: 'CONNECTED',
      notes: 'SRVoice.startListening(). Microphone permission required. Transcript routes through SRWakeName.processTranscript() then SR pipeline.'
    },
    {
      feature: 'TTS (Voice Response)',
      implemented: true, connected: true, authRequired: false,
      platformLimit: 'SpeechSynthesis API required', permRequired: false,
      status: 'CONNECTED',
      notes: 'SRVoice.speak(). Toggle in Settings. Speaks SR response if TTS enabled.'
    },
    {
      feature: 'Wake Name',
      implemented: true, connected: true, authRequired: true,
      platformLimit: 'Web: active-tab only. No background listening on web.', permRequired: true,
      status: 'CONNECTED',
      notes: 'SRWakeName. Names: Salem/Shadow/Elsa/Luna/Pepper/Simba/Rambo/Legend. Preference saved per UID to Firestore. Transcript normalization strips wake phrase before SR pipeline.'
    },
    {
      feature: 'Device Controls',
      implemented: true, connected: true, authRequired: true,
      platformLimit: 'Mobile web / native only. Desktop hides mobile-only controls.', permRequired: true,
      status: 'CONNECTED',
      notes: 'SRCapabilityManager + SRWebAdapter.getDeviceControlsInfo(). Shows real capability states. Device Actions go through SRDeviceActionRouter.'
    },
    {
      feature: 'Global Learning',
      implemented: false, connected: false, authRequired: true,
      platformLimit: null, permRequired: false,
      status: 'NOT_IMPLEMENTED',
      notes: 'Architecture skeleton (sr-global-learning.js) exists but requires server deployment + Founder review queue. NOT connected to UI.'
    },
    {
      feature: 'Internet Research',
      implemented: false, connected: false, authRequired: false,
      platformLimit: null, permRequired: false,
      status: 'NOT_IMPLEMENTED',
      notes: 'Architecture and security guards exist (sr-web-research.js, web-research-guard.js) but Cloudflare Worker must be deployed. Not yet wired to SR pipeline.'
    },
    {
      feature: 'Language Foundation',
      implemented: true, connected: true, authRequired: false,
      platformLimit: null, permRequired: false,
      status: 'CONNECTED',
      notes: 'SRLanguage + tokenizer/morphology/phrases/semantics subsystems. 113K+ vocabulary. Loaded in index.html. Enriches SRUnderstanding on every turn in shadow-reaper.js.'
    },
    {
      feature: 'Desktop Agent',
      implemented: false, connected: false, authRequired: true,
      platformLimit: 'Desktop native only', permRequired: true,
      status: 'NOT_IMPLEMENTED',
      notes: 'FUTURE STAGE. Not built. No UI presented.'
    },
    {
      feature: 'Smart Device Control (TV/lights/etc.)',
      implemented: false, connected: false, authRequired: true,
      platformLimit: null, permRequired: true,
      status: 'NOT_IMPLEMENTED',
      notes: 'FUTURE STAGE. Not built. No UI presented.'
    },
    {
      feature: 'PWA / Install',
      implemented: true, connected: true, authRequired: false,
      platformLimit: null, permRequired: false,
      status: 'CONNECTED',
      notes: 'manifest.json, sw.js, beforeinstallprompt capture, iOS guide. Install button shown only when browser confirms installability.'
    },
    {
      feature: 'Founder Controls',
      implemented: true, connected: true, authRequired: true,
      platformLimit: null, permRequired: false,
      status: 'CONNECTED',
      notes: 'SRFounderControls + SRFounderSecurity. Server-side role claim required (role=founder). Invisible to normal users. Controls global capability toggles only — no access to private user data.'
    },
  ];

  function getAll() { return REGISTRY.slice(); }

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

  global.SRFeatureRegistry = {
    build:       BUILD_ID,
    getAll:      getAll,
    get:         get,
    getByStatus: getByStatus,
    isConnected: isConnected,
  };

})(typeof window !== 'undefined' ? window : global);
