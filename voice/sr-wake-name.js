/**
 * shadow-reaper-standalone/voice/sr-wake-name.js
 * Shadow Reaper Standalone — Wake Name System
 *
 * Build: SR-STANDALONE-WAKE-NAME-1
 *
 * Exposes: window.SRWakeName
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PURPOSE:
 *   Per-user selectable wake name for Shadow Reaper voice activation.
 *   The wake name activates and routes the request — it does NOT replace the
 *   Shadow Reaper intent pipeline, TTS engine, or Device Action Router.
 *
 * WAKE NAMES (exact set — do not add/remove without authorization):
 *   Shadow | Ace | Atlas | Aurora | Echo | Elsa | Ember | Ghost | Legend |
 *   Luna | Midnight | Nova | Onyx | Pepper | Phoenix | Rambo | Raven |
 *   Salem | Simba | Storm
 *
 * ARCHITECTURE:
 *   Wake phrase detected in transcript
 *   → normalizeTranscript(transcript) strips the wake phrase
 *   → clean command text
 *   → Shadow Reaper intent engine (unchanged)
 *   → Device Action Router (unchanged)
 *   → permission / capability checks (unchanged)
 *   → execution
 *
 *   The wake name does NOT hardcode any commands.
 *   The wake name does NOT bypass authentication, permissions, or device checks.
 *   "Hey Salem, open YouTube" → normalize → "open YouTube" → intent pipeline.
 *
 * PREFERENCE STORAGE:
 *   Per-user, isolated by Firebase UID.
 *   Firestore path:  users/{uid}/shadowReaperPreferences/assistant
 *   Local fallback:  localStorage key "srAssistantPrefs_{uid}"
 *   Guest fallback:  localStorage key "srAssistantPrefs_guest"
 *
 * PRIVACY:
 *   - Wake listening is OPTIONAL. Default: OFF (safest default).
 *   - Wake listening NEVER activates the microphone silently.
 *   - Explicit user activation via SRVoice.startListening() is always required.
 *   - Users can disable wake listening at any time.
 *   - Preference is per-user — User A's wake name does not affect User B.
 *
 * PLATFORM NOTES:
 *   - Web (desktop + mobile): uses Web Speech API (browser SpeechRecognition).
 *     Requires explicit user microphone permission.
 *     NOT background listening — tab must be active.
 *   - Android/iOS native: native microphone permissions apply.
 *     Background wake detection depends on the native container capabilities.
 *   - If always-on background wake detection is not supported on the current
 *     platform, it is NOT claimed — the UI degrades gracefully.
 *
 * ZERO EXTERNAL AI CALLS. ZERO HARDCODED PHRASE→ACTION MAPPINGS.
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-WAKE-NAME-2';

  // ─── Available wake names (exact list — server of truth) ─────────────────
  // Order: Shadow first (default), then remaining 19 in alphabetical order
  var WAKE_NAMES = [
    'Shadow', 'Ace', 'Atlas', 'Aurora', 'Echo', 'Elsa', 'Ember',
    'Ghost', 'Legend', 'Luna', 'Midnight', 'Nova', 'Onyx',
    'Pepper', 'Phoenix', 'Rambo', 'Raven', 'Salem', 'Simba', 'Storm',
  ];

  // ─── Valid voice genders ──────────────────────────────────────────────────
  var VOICE_GENDERS = ['female', 'male'];

  // ─── Default settings ─────────────────────────────────────────────────────
  var DEFAULT_WAKE_NAME      = 'Shadow';
  var DEFAULT_WAKE_LISTENING = false;   // Safest default: OFF until user explicitly enables
  var DEFAULT_VOICE_GENDER   = 'female';

  // ─── In-memory state ──────────────────────────────────────────────────────
  var _wakeName      = DEFAULT_WAKE_NAME;
  var _wakeListening = DEFAULT_WAKE_LISTENING;
  var _voiceGender   = DEFAULT_VOICE_GENDER;
  var _loaded        = false;
  var _onChangeCallbacks = [];

  // ─── Firebase + UID helpers ───────────────────────────────────────────────
  function _fa()  { return global.SRFirebaseAdapter || null; }

  function _uid() {
    var fa = _fa();
    return (fa && typeof fa.getUID === 'function') ? fa.getUID() : null;
  }

  // Firestore ref for the per-user assistant preferences document
  // Path: users/{uid}/shadowReaperPreferences/assistant
  function _assistantPrefRef() {
    var fa  = _fa();
    var uid = _uid();
    if (!fa || !uid || typeof fa._db === 'undefined') return null;

    // Use the internal Firestore _doc helper exposed on the adapter
    // Adapters expose _db indirectly — reach through the known helper surface
    try {
      // The adapter exposes a userPreferencesDoc() helper for 'settings'.
      // For 'assistant' we use the same pattern but the 'assistant' subdoc.
      if (fa._db && typeof fa._db.doc === 'function') {
        return fa._db.doc('users/' + uid + '/shadowReaperPreferences/assistant');
      }
    } catch (_) {}
    return null;
  }

  // ─── Local-storage fallback key (per UID for isolation) ───────────────────
  function _localKey() {
    var uid = _uid();
    return uid ? ('srAssistantPrefs_' + uid) : 'srAssistantPrefs_guest';
  }

  // ─── Read preference from localStorage ───────────────────────────────────
  function _readLocal() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(_localKey());
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) {
      return null;
    }
  }

  // ─── Write preference to localStorage ────────────────────────────────────
  function _writeLocal(prefs) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(_localKey(), JSON.stringify(prefs));
      }
    } catch (_) {}
  }

  // ─── Validate wake name ───────────────────────────────────────────────────
  function _isValidWakeName(name) {
    return WAKE_NAMES.indexOf(name) !== -1;
  }

  // ─── Load preferences (async — tries Firestore first, falls back to local) ─
  /**
   * load(callback)
   * Loads wake preferences for the current authenticated user.
   * If offline or not yet configured, falls back to localStorage.
   * callback(err, prefs) — prefs: { wakeName, wakeListening }
   */
  function load(callback) {
    callback = callback || function () {};

    // Try local first for fast read
    var local = _readLocal();
    if (local) {
      _applyPrefs(local);
    }

    var ref = _assistantPrefRef();
    if (!ref) {
      // No Firestore — use local/defaults
      _loaded = true;
      callback(null, _getPrefs());
      return;
    }

    ref.get().then(function (doc) {
      if (doc && doc.exists) {
        var data = doc.data() || {};
        _applyPrefs(data);
        _writeLocal(_getPrefs()); // sync to local
      }
      _loaded = true;
      callback(null, _getPrefs());
    }).catch(function (err) {
      // Firestore unavailable — use local/defaults
      _loaded = true;
      callback(err, _getPrefs());
    });
  }

  function _applyPrefs(data) {
    if (data.wakeName && _isValidWakeName(data.wakeName)) {
      _wakeName = data.wakeName;
    }
    if (typeof data.wakeListening === 'boolean') {
      _wakeListening = data.wakeListening;
    }
    if (data.voiceGender && VOICE_GENDERS.indexOf(data.voiceGender) !== -1) {
      _voiceGender = data.voiceGender;
    }
  }

  function _getPrefs() {
    return { wakeName: _wakeName, wakeListening: _wakeListening, voiceGender: _voiceGender };
  }

  // ─── Save preferences (Firestore + localStorage) ──────────────────────────
  /**
   * save(updates, callback)
   * Persists wake preferences for the authenticated user.
   * updates: { wakeName?, wakeListening? }
   */
  function save(updates, callback) {
    callback = callback || function () {};

    if (updates.hasOwnProperty('wakeName')) {
      if (!_isValidWakeName(updates.wakeName)) {
        callback(new Error('Invalid wake name: ' + updates.wakeName +
                           '. Valid names: ' + WAKE_NAMES.join(', ')));
        return;
      }
      _wakeName = updates.wakeName;
    }

    if (updates.hasOwnProperty('wakeListening')) {
      _wakeListening = !!updates.wakeListening;
    }

    if (updates.hasOwnProperty('voiceGender')) {
      // Silently ignore invalid values per spec (AP-08)
      if (VOICE_GENDERS.indexOf(updates.voiceGender) !== -1) {
        _voiceGender = updates.voiceGender;
      }
    }

    var prefs = _getPrefs();
    _writeLocal(prefs);  // always persist locally first

    _notifyChange(prefs);

    var ref = _assistantPrefRef();
    if (!ref) {
      callback(null, prefs);
      return;
    }

    ref.set(prefs, { merge: true }).then(function () {
      callback(null, prefs);
    }).catch(function (err) {
      // Firestore write failed — local is already saved
      callback(err, prefs);
    });
  }

  // ─── Normalize transcript (strip wake phrase) ─────────────────────────────
  /**
   * normalizeTranscript(rawTranscript)
   *
   * Detects whether the transcript begins with a wake phrase for the current
   * user's selected wake name, strips it, and returns:
   *   { wakeDetected: boolean, command: string, rawTranscript: string }
   *
   * Examples with wakeName = "Salem":
   *   "Hey Salem, open YouTube"   → { wakeDetected: true,  command: "open YouTube" }
   *   "Salem open YouTube"        → { wakeDetected: true,  command: "open YouTube" }
   *   "hey salem remind me at 7"  → { wakeDetected: true,  command: "remind me at 7" }
   *   "open YouTube"              → { wakeDetected: false, command: "open YouTube" }
   *
   * The command is passed as-is to the Shadow Reaper intent pipeline.
   * There are NO hardcoded command→action mappings here.
   */
  function normalizeTranscript(rawTranscript) {
    if (!rawTranscript || typeof rawTranscript !== 'string') {
      return { wakeDetected: false, command: '', rawTranscript: rawTranscript || '' };
    }

    var lower   = rawTranscript.trim().toLowerCase();
    var wakeLow = _wakeName.toLowerCase();

    // Match patterns (case-insensitive):
    //   "Hey <name>,"?  or  "<name>,"?  at start of utterance
    //   Followed by optional whitespace and the actual command
    var patterns = [
      new RegExp('^hey\\s+' + _escapeRegex(wakeLow) + '[,\\s]+', 'i'),
      new RegExp('^'        + _escapeRegex(wakeLow) + '[,\\s]+',  'i'),
    ];

    for (var i = 0; i < patterns.length; i++) {
      var m = rawTranscript.trim().match(patterns[i]);
      if (m) {
        var command = rawTranscript.trim().slice(m[0].length).trim();
        return { wakeDetected: true, command: command, rawTranscript: rawTranscript };
      }
    }

    return { wakeDetected: false, command: rawTranscript.trim(), rawTranscript: rawTranscript };
  }

  function _escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ─── Process a voice transcript through wake + intent pipeline ────────────
  /**
   * processTranscript(rawTranscript, intentCallback)
   *
   * If wake listening is OFF:  passes the transcript directly to intentCallback
   *                            as a normal conversation input (no wake detection).
   * If wake listening is ON:   normalizes the transcript (strips wake phrase if
   *                            present), then passes the command to intentCallback.
   *
   * intentCallback(result):
   *   result.command:       string — cleaned command text
   *   result.wakeDetected:  boolean
   *   result.rawTranscript: string
   *   result.wakeListening: boolean
   *   result.mode:          'wake_activated' | 'direct_input'
   *
   * The intentCallback is responsible for passing result.command to the
   * Shadow Reaper understanding/intent engine.  This module does NOT
   * perform intent resolution or action dispatch.
   */
  function processTranscript(rawTranscript, intentCallback) {
    intentCallback = intentCallback || function () {};

    if (!_wakeListening) {
      // Wake detection is OFF — treat everything as direct input
      intentCallback({
        command:       rawTranscript ? rawTranscript.trim() : '',
        wakeDetected:  false,
        rawTranscript: rawTranscript || '',
        wakeListening: false,
        mode:          'direct_input',
      });
      return;
    }

    var normalized = normalizeTranscript(rawTranscript);
    intentCallback({
      command:       normalized.command,
      wakeDetected:  normalized.wakeDetected,
      rawTranscript: normalized.rawTranscript,
      wakeListening: true,
      mode:          normalized.wakeDetected ? 'wake_activated' : 'direct_input',
    });
  }

  // ─── Getters ──────────────────────────────────────────────────────────────
  function getWakeName()      { return _wakeName; }
  function isWakeListening()  { return _wakeListening; }
  function getWakeNames()     { return WAKE_NAMES.slice(); }
  function getVoiceGender()   { return _voiceGender; }
  function isLoaded()         { return _loaded; }
  function getStatus() {
    return {
      build:          BUILD_ID,
      wakeName:       _wakeName,
      wakeListening:  _wakeListening,
      voiceGender:    _voiceGender,
      availableNames: WAKE_NAMES.slice(),
      loaded:         _loaded,
    };
  }

  // ─── Setters (convenience wrappers — persist to Firestore + local) ─────────
  function setWakeName(name, callback) {
    save({ wakeName: name }, callback);
  }

  function setWakeListening(enabled, callback) {
    save({ wakeListening: !!enabled }, callback);
  }

  function setVoiceGender(gender, callback) {
    save({ voiceGender: gender }, callback);
  }

  // ─── Change notification ──────────────────────────────────────────────────
  function onChange(cb) {
    if (typeof cb === 'function') _onChangeCallbacks.push(cb);
    return function () {
      _onChangeCallbacks = _onChangeCallbacks.filter(function (x) { return x !== cb; });
    };
  }

  function _notifyChange(prefs) {
    _onChangeCallbacks.forEach(function (cb) {
      try { cb(prefs); } catch (_) {}
    });
  }

  // ─── Platform capability check ────────────────────────────────────────────
  /**
   * getWakePlatformInfo()
   * Returns an honest description of wake detection capabilities on the
   * current platform.  Does NOT promise capabilities that don't exist.
   */
  function getWakePlatformInfo() {
    var detector = global.SRPlatformDetector;
    var runtime  = detector ? detector.getRuntime() : 'UNKNOWN';

    var speechSupported = !!(
      (global.SpeechRecognition || global.webkitSpeechRecognition) &&
      global.speechSynthesis
    );

    var info = {
      runtime:         runtime,
      speechApiSupported: speechSupported,
      wakeAvailability: '',
      backgroundWake:   '',
      note:             '',
    };

    if (!speechSupported) {
      info.wakeAvailability = 'NOT_SUPPORTED';
      info.backgroundWake   = 'NOT_SUPPORTED';
      info.note             = 'Speech recognition is not supported in this browser/environment.';
      return info;
    }

    switch (runtime) {
      case 'ANDROID_NATIVE':
        info.wakeAvailability = 'AVAILABLE_WHILE_ACTIVE';
        info.backgroundWake   = 'PLATFORM_DEPENDENT';
        info.note             = 'WAKE WORD: Available while Shadow Reaper is active. ' +
                                'Background wake detection depends on native container capabilities ' +
                                'and Android background execution restrictions.';
        break;

      case 'IOS_NATIVE':
        info.wakeAvailability = 'AVAILABLE_WHILE_ACTIVE';
        info.backgroundWake   = 'RESTRICTED';
        info.note             = 'WAKE WORD: Available while Shadow Reaper is active. ' +
                                'BACKGROUND WAKE WORD: Restricted by iOS background execution policies. ' +
                                'The app cannot claim continuous background listening.';
        break;

      case 'WEB_MOBILE':
        info.wakeAvailability = 'AVAILABLE_WHILE_ACTIVE';
        info.backgroundWake   = 'NOT_SUPPORTED';
        info.note             = 'WAKE WORD: Available while Shadow Reaper is active in the browser tab. ' +
                                'BACKGROUND WAKE WORD: Not supported. Browser tabs do not have ' +
                                'unrestricted background microphone access.';
        break;

      case 'WEB_DESKTOP':
      default:
        info.wakeAvailability = 'AVAILABLE_WHILE_ACTIVE';
        info.backgroundWake   = 'NOT_SUPPORTED';
        info.note             = 'WAKE WORD: Available while Shadow Reaper is active in the browser. ' +
                                'BACKGROUND WAKE WORD: Not supported on the web platform. ' +
                                'Future Desktop Agent integration may provide this capability.';
        break;
    }

    return info;
  }

  // ─── Reset to defaults (for the current user) ────────────────────────────
  function resetDefaults(callback) {
    // Reset in-memory state directly so getWakeName() returns default immediately
    _wakeName      = DEFAULT_WAKE_NAME;
    _wakeListening = DEFAULT_WAKE_LISTENING;
    _voiceGender   = DEFAULT_VOICE_GENDER;
    save({ wakeName: DEFAULT_WAKE_NAME, wakeListening: DEFAULT_WAKE_LISTENING,
           voiceGender: DEFAULT_VOICE_GENDER }, callback);
  }

  // ─── Expose — window.SRWakeName ───────────────────────────────────────────
  global.SRWakeName = {
    build:            BUILD_ID,
    WAKE_NAMES:       WAKE_NAMES,

    load:             load,
    save:             save,
    setWakeName:      setWakeName,
    setWakeListening: setWakeListening,
    setVoiceGender:   setVoiceGender,
    resetDefaults:    resetDefaults,
    onChange:         onChange,

    getWakeName:      getWakeName,
    isWakeListening:  isWakeListening,
    getWakeNames:     getWakeNames,
    getVoiceGender:   getVoiceGender,
    isLoaded:         isLoaded,
    getStatus:        getStatus,

    normalizeTranscript: normalizeTranscript,
    processTranscript:   processTranscript,

    getWakePlatformInfo: getWakePlatformInfo,
  };

})(typeof window !== 'undefined' ? window : global);
