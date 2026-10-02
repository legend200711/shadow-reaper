/**
 * shadow-reaper-v2/voice/sr-voice-assistant.js
 * Shadow Reaper V2 — Shadow Voice Assistant Orchestrator
 *
 * Build: SR-V2-VOICE-ASST-2
 *
 * Exposes: window.SRVoiceAssistant
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ARCHITECTURE RULE — ONE BRAIN:
 *   Voice input and text input converge at ShadowReaper.ask().
 *   This module is an INPUT/OUTPUT layer ONLY.
 *   It does NOT contain:
 *     - a second AI / conversation engine
 *     - a second memory system
 *     - a second knowledge engine
 *     - canned voice-specific responses (except the one-word activation ack)
 *
 * WAKE NAME:
 *   "Shadow" — the spoken activation name for Shadow Reaper.
 *   Shadow is NOT a new AI.  It is the wake/activation name.
 *
 * STATE MACHINE:
 *   OFF           — voice assistant disabled; microphone never activates
 *   STANDBY       — enabled, watching for wake word in each utterance
 *   WAKE_DETECTED — wake word found in transcript; about to begin listening
 *   LISTENING     — microphone active, capturing user command
 *   PROCESSING    — transcript sent to ShadowReaper.ask(), awaiting response
 *   SPEAKING      — TTS reading response aloud
 *   CONVERSATION  — inside active session; follow-up utterances go straight to brain
 *   ERROR         — non-fatal error; returns to STANDBY
 *
 * CONTINUOUS CONVERSATION:
 *   After activation, the user may speak follow-up questions without saying
 *   "Shadow" again.  The session remains open until:
 *     a) conversationTimeoutMs of silence elapses, or
 *     b) the user says "Shadow stop" / "stop" / "stop listening" / "standby"
 *
 * ECHO PROTECTION:
 *   While Shadow is SPEAKING, wake-word recognition is suppressed.
 *   A post-speech suppression window prevents the mic from hearing TTS output.
 *
 * STOP COMMANDS:
 *   "shadow stop", "stop listening", "stop talking", "go to standby",
 *   "stop shadow"   → end session, return to STANDBY
 *
 * RESOURCE POLICY:
 *   Zero polling loops, zero setInterval, zero duplicate recognizers.
 *   Each listen cycle uses one SpeechRecognition instance.
 *   The recognizer is created fresh and destroyed after each result or error.
 *
 * PRIVACY:
 *   Voice Assistant is OFF by default.
 *   The microphone is NEVER activated without user permission and explicit enable.
 *   Raw audio is NEVER stored or uploaded.
 *
 * DEPENDENCIES (soft — each checked at call time):
 *   window.ShadowReaper   — canonical brain entry point  (ShadowReaper.ask)
 *   window.SRVoice        — TTS (speak / stopSpeaking)
 *   window.SRWakeName     — wake name config (getWakeName / setWakeName)
 *   window.SRPlatformDetector — platform runtime info (optional)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ZERO EXTERNAL AI CALLS.
 * ZERO POLLING. ZERO RAF. ZERO setInterval IN STANDBY.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-V2-VOICE-ASST-2';

  // ── Storage keys ──────────────────────────────────────────────────────────
  var PREF_ENABLED         = 'srVoiceAsstEnabled';
  var PREF_CONTINUOUS      = 'srVoiceAsstContinuous';
  var PREF_TIMEOUT_MS      = 'srVoiceAsstTimeoutMs';
  var PREF_BACKGROUND      = 'srVoiceAsstBackground';

  // ── Defaults ──────────────────────────────────────────────────────────────
  var DEFAULT_WAKE_NAME       = 'Shadow';
  var DEFAULT_TIMEOUT_MS      = 15000;  // 15 s of silence → standby
  var DEFAULT_CONTINUOUS      = true;
  var ACTIVATION_ACK          = 'Yeah?';
  var WAKE_DEBOUNCE_MS        = 1200;   // min ms between wake detections
  var POST_SPEECH_SUPPRESS_MS = 800;    // ms after TTS ends before re-listening

  // ── Permission / mic error constants ──────────────────────────────────────
  // Errors that indicate permanent denial — do NOT auto-retry after these.
  var MIC_DENIED_ERRORS  = ['not-allowed', 'permission-denied'];
  // Errors that indicate the hardware is missing or unavailable.
  var MIC_ABSENT_ERRORS  = ['audio-capture', 'no-microphone', 'device-not-found'];
  // Errors that are transient and safe to retry after a short delay.
  var MIC_TRANSIENT_ERRORS = ['network', 'service-not-allowed', 'bad-grammar', 'language-not-supported'];

  // Only show the mic-denied message once per session to avoid spam.
  var _micPermDenied       = false;   // true once 'not-allowed' received
  var _micDeniedShownCount = 0;       // number of times message displayed this session
  var MIC_DENIED_MSG_LIMIT = 1;       // display at most once per enable() call

  // ── State machine ─────────────────────────────────────────────────────────
  var STATES = {
    OFF:                'OFF',
    STANDBY:            'STANDBY',
    WAKE_DETECTED:      'WAKE_DETECTED',
    LISTENING:          'LISTENING',
    PROCESSING:         'PROCESSING',
    SPEAKING:           'SPEAKING',
    CONVERSATION:       'CONVERSATION',
    ERROR:              'ERROR',
    PERMISSION_DENIED:  'PERMISSION_DENIED',   // mic permission denied — stops voice, typed chat still works
    OFFLINE:            'OFFLINE',             // network unavailable — typed chat still works
  };

  // ── Internal state ────────────────────────────────────────────────────────
  var _state              = STATES.OFF;
  var _enabled            = _readPref(PREF_ENABLED, false);      // OPT-IN: default OFF
  var _continuousConvo    = _readPref(PREF_CONTINUOUS, DEFAULT_CONTINUOUS);
  var _timeoutMs          = _readPrefInt(PREF_TIMEOUT_MS, DEFAULT_TIMEOUT_MS);
  var _backgroundEnabled  = _readPref(PREF_BACKGROUND, false);

  var _recognition        = null;         // current SpeechRecognition instance
  var _conversationTimer  = null;         // timeout handle → return to STANDBY
  var _lastWakeTime       = 0;            // debounce: timestamp of last wake
  var _speakingSuppressed = false;        // echo protection: suppress while TTS playing
  var _postSpeechTimer    = null;         // echo protection: post-speech suppression timer
  var _sessionActive      = false;        // true while inside a CONVERSATION session
  var _offlineMode        = false;        // true when SRConnectionMonitor says offline

  // ── Callbacks ─────────────────────────────────────────────────────────────
  var _onStateChangeCbs   = [];
  var _onStatusCbs        = [];
  var _onMicErrorCbs      = [];           // fn(message) — called once on mic permission failure

  // ─── Preference helpers ───────────────────────────────────────────────────
  function _readPref(key, def) {
    try {
      var v = global.localStorage && global.localStorage.getItem(key);
      if (v === null || v === undefined) return def;
      return v !== 'false';
    } catch (_) { return def; }
  }

  function _readPrefInt(key, def) {
    try {
      var v = global.localStorage && global.localStorage.getItem(key);
      if (!v) return def;
      var n = parseInt(v, 10);
      return isNaN(n) ? def : n;
    } catch (_) { return def; }
  }

  function _savePref(key, val) {
    try { if (global.localStorage) global.localStorage.setItem(key, String(val)); } catch (_) {}
  }

  // ─── Module accessors (checked at call time) ──────────────────────────────
  function _brain()    { return global.ShadowReaper  || null; }
  function _voice()    { return global.SRVoice       || null; }
  function _wakeMod()  { return global.SRWakeName    || null; }

  function _getWakeName() {
    var wm = _wakeMod();
    if (wm && typeof wm.getWakeName === 'function') return wm.getWakeName();
    return DEFAULT_WAKE_NAME;
  }

  // ─── Microphone / permission error helpers ───────────────────────────────

  /** Returns true for errors that mean the user has permanently blocked the mic */
  function _isMicDeniedError(err) {
    return MIC_DENIED_ERRORS.indexOf(err) !== -1;
  }

  /** Returns true for errors that mean no microphone hardware is available */
  function _isMicAbsentError(err) {
    return MIC_ABSENT_ERRORS.indexOf(err) !== -1;
  }

  /**
   * Called once when mic permission is denied (permanently blocked or absent).
   * Sets state to PERMISSION_DENIED, stops all recognition, and notifies UI
   * without spamming.  Typed conversation continues working.
   */
  function _handleMicPermissionDenied(err) {
    _destroyRecognizer();
    _clearConversationTimer();
    _sessionActive = false;
    _micPermDenied = true;

    // Switch to PERMISSION_DENIED — voice stops, typed chat is unaffected
    _setState(STATES.PERMISSION_DENIED);

    // Build the user-facing message
    var msg;
    if (_isMicAbsentError(err)) {
      msg = "Shadow can't find a microphone. Please connect one and re-enable voice.";
    } else {
      msg = "Shadow can't access the microphone. Check microphone permission in your device settings.";
    }

    // Show the message at most MIC_DENIED_MSG_LIMIT times per session
    if (_micDeniedShownCount < MIC_DENIED_MSG_LIMIT) {
      _micDeniedShownCount++;
      _onMicErrorCbs.forEach(function (cb) {
        try { cb(msg); } catch (_) {}
      });
    }
  }

  /**
   * Reset permission-denied state when the user explicitly re-enables voice.
   * This allows recovery if they have since granted the permission in settings.
   */
  function _resetMicPermissionState() {
    _micPermDenied = false;
    _micDeniedShownCount = 0;
  }

  // ─── State management ─────────────────────────────────────────────────────
  function _setState(newState) {
    var prev = _state;
    _state = newState;
    if (prev !== newState) {
      _onStateChangeCbs.forEach(function (cb) {
        try { cb(newState, prev); } catch (_) {}
      });
    }
  }

  // ─── Stop commands (local voice controls) ─────────────────────────────────
  var STOP_PHRASES = [
    'shadow stop',
    'stop shadow',
    'stop listening',
    'stop talking',
    'go to standby',
    'standby',
  ];

  function _isStopCommand(text) {
    if (!text) return false;
    var lower = text.trim().toLowerCase();
    for (var i = 0; i < STOP_PHRASES.length; i++) {
      if (lower === STOP_PHRASES[i] || lower.startsWith(STOP_PHRASES[i])) return true;
    }
    return false;
  }

  // ─── Wake word detection in transcript ───────────────────────────────────
  /**
   * Checks whether the transcript contains the wake word as an isolated token.
   * Requires the wake word to appear at a word boundary — not as a substring
   * of another word — to reduce false positives.
   *
   * Returns { detected: boolean, command: string }
   */
  function _checkWakeWord(rawTranscript) {
    if (!rawTranscript) return { detected: false, command: '' };

    // Use SRWakeName normalizer if available (handles "Hey Shadow,", "Shadow," etc.)
    var wm = _wakeMod();
    if (wm && typeof wm.normalizeTranscript === 'function') {
      var normalized = wm.normalizeTranscript(rawTranscript);
      return { detected: normalized.wakeDetected, command: normalized.command };
    }

    // Fallback: manual word-boundary check
    var wakeName = _getWakeName().toLowerCase();
    var lower = rawTranscript.trim().toLowerCase();
    // Match wake name at start of utterance, at a word boundary, optionally with "hey"
    var pattern = new RegExp(
      '^(?:hey\\s+)?' + _escapeRegex(wakeName) + '(?:[,!.\\s]|$)',
      'i'
    );
    var m = rawTranscript.trim().match(pattern);
    if (m) {
      var command = rawTranscript.trim().slice(m[0].length).trim();
      return { detected: true, command: command };
    }
    return { detected: false, command: rawTranscript.trim() };
  }

  function _escapeRegex(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // ─── Debounce check ───────────────────────────────────────────────────────
  function _wakeDebounceOk() {
    var now = Date.now();
    if (now - _lastWakeTime < WAKE_DEBOUNCE_MS) return false;
    _lastWakeTime = now;
    return true;
  }

  // ─── Conversation timeout ─────────────────────────────────────────────────
  function _resetConversationTimer() {
    _clearConversationTimer();
    if (_sessionActive && _timeoutMs > 0) {
      _conversationTimer = setTimeout(function () {
        _endSession('timeout');
      }, _timeoutMs);
    }
  }

  function _clearConversationTimer() {
    if (_conversationTimer) {
      clearTimeout(_conversationTimer);
      _conversationTimer = null;
    }
  }

  // ─── End active conversation session → return to STANDBY ─────────────────
  function _endSession(reason) {
    _clearConversationTimer();
    _sessionActive = false;
    if (_state !== STATES.OFF) {
      _setState(STATES.STANDBY);
      if (reason !== 'disabled') {
        _listenForWake();
      }
    }
  }

  // ─── Echo protection ──────────────────────────────────────────────────────
  function _suppressForSpeaking() {
    _speakingSuppressed = true;
    if (_postSpeechTimer) {
      clearTimeout(_postSpeechTimer);
      _postSpeechTimer = null;
    }
  }

  function _unsuppressAfterSpeaking() {
    if (_postSpeechTimer) clearTimeout(_postSpeechTimer);
    _postSpeechTimer = setTimeout(function () {
      _speakingSuppressed = false;
      _postSpeechTimer = null;
      // Resume appropriate listening after speech ends
      if (_state !== STATES.OFF) {
        if (_sessionActive) {
          _setState(STATES.CONVERSATION);
          _listenForFollowUp();
        } else {
          _setState(STATES.STANDBY);
          _listenForWake();
        }
      }
    }, POST_SPEECH_SUPPRESS_MS);
  }

  // ─── Speak response via SRVoice ──────────────────────────────────────────
  function _speak(text, onDone) {
    var v = _voice();
    if (!v || !v.isTTSEnabled || !v.isTTSEnabled()) {
      if (typeof onDone === 'function') onDone();
      return;
    }
    _setState(STATES.SPEAKING);
    _suppressForSpeaking();

    v.speak(text, function () {
      _unsuppressAfterSpeaking();
      if (typeof onDone === 'function') onDone();
    });
  }

  // ─── Speech recognition factory ───────────────────────────────────────────
  function _isRecognitionSupported() {
    return !!(global.SpeechRecognition || global.webkitSpeechRecognition);
  }

  function _createRecognizer(continuous) {
    var SpeechRec = global.SpeechRecognition || global.webkitSpeechRecognition;
    if (!SpeechRec) return null;
    var rec = new SpeechRec();
    rec.lang = 'en-US';
    rec.continuous = !!continuous;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    return rec;
  }

  function _destroyRecognizer() {
    if (_recognition) {
      try { _recognition.onstart   = null; } catch (_) {}
      try { _recognition.onresult  = null; } catch (_) {}
      try { _recognition.onerror   = null; } catch (_) {}
      try { _recognition.onend     = null; } catch (_) {}
      try { _recognition.stop();           } catch (_) {}
      _recognition = null;
    }
  }

  // ─── STANDBY: listen for a single utterance, check for wake word ──────────
  /**
   * Starts one recognition cycle to listen for the wake word.
   * This is the low-resource standby loop — one utterance at a time,
   * no persistent open microphone.
   */
  function _listenForWake() {
    if (_state === STATES.OFF || !_enabled) return;
    if (_state === STATES.PERMISSION_DENIED) return;   // do NOT retry after denial
    if (_speakingSuppressed) return;
    if (_recognition) return;  // already listening — prevent duplicate

    if (!_isRecognitionSupported()) {
      _setState(STATES.ERROR);
      return;
    }

    _setState(STATES.STANDBY);

    var rec = _createRecognizer(false);
    if (!rec) { _setState(STATES.ERROR); return; }
    _recognition = rec;

    rec.onstart = function () {
      // State stays STANDBY during wake-word listening
    };

    rec.onresult = function (event) {
      _destroyRecognizer();

      if (_speakingSuppressed) {
        // Echo protection — shadow heard its own TTS — restart standby
        if (_state !== STATES.OFF) _listenForWake();
        return;
      }

      var rawTranscript = event.results[0][0].transcript || '';

      // Stop commands always take priority
      if (_isStopCommand(rawTranscript)) {
        _endSession('stop_command');
        return;
      }

      var wakeResult = _checkWakeWord(rawTranscript);

      if (!wakeResult.detected) {
        // Not a wake word and not in session — restart standby quietly
        if (_state !== STATES.OFF) _listenForWake();
        return;
      }

      // Wake word detected
      if (!_wakeDebounceOk()) {
        if (_state !== STATES.OFF) _listenForWake();
        return;
      }

      _setState(STATES.WAKE_DETECTED);

      var command = wakeResult.command.trim();

      if (command.length > 0) {
        // Wake word + inline command (e.g. "Shadow what time is it")
        _processCommand(command);
      } else {
        // Just the wake word — give activation acknowledgment, then listen
        _activateSession();
      }
    };

    rec.onerror = function (event) {
      _destroyRecognizer();
      var err = event.error || 'unknown';

      // Permission denied or hardware absent — do NOT retry, do NOT spam
      if (_isMicDeniedError(err) || _isMicAbsentError(err)) {
        _handleMicPermissionDenied(err);
        return;
      }

      // "no-speech" and "aborted" are normal — restart standby quietly
      if (err === 'no-speech' || err === 'aborted') {
        if (_state !== STATES.OFF) _listenForWake();
        return;
      }

      _setState(STATES.ERROR);
      // On transient errors, retry once after a short delay
      setTimeout(function () {
        if (_state !== STATES.OFF && _state !== STATES.PERMISSION_DENIED) {
          _setState(STATES.STANDBY);
          _listenForWake();
        }
      }, 2000);
    };

    rec.onend = function () {
      // If no result was fired and we're still in standby, restart
      if (_recognition === null && _state === STATES.STANDBY) {
        _listenForWake();
      }
    };

    try {
      rec.start();
    } catch (e) {
      _destroyRecognizer();
      // NotAllowedError thrown synchronously in some browsers = permission denied
      var eMsg = (e && e.name) ? e.name.toLowerCase() : '';
      if (eMsg === 'notallowederror' || eMsg === 'securityerror') {
        _handleMicPermissionDenied('not-allowed');
      } else {
        _setState(STATES.ERROR);
      }
    }
  }

  // ─── Activate session (just wake word, no inline command) ─────────────────
  function _activateSession() {
    _sessionActive = true;

    // Give optional acknowledgment via TTS, then listen for the command
    var v = _voice();
    if (v && v.isTTSEnabled && v.isTTSEnabled()) {
      _speak(ACTIVATION_ACK, function () {
        _setState(STATES.LISTENING);
        _listenForFollowUp();
      });
    } else {
      _setState(STATES.LISTENING);
      _listenForFollowUp();
    }
  }

  // ─── CONVERSATION: listen for follow-up utterance ─────────────────────────
  function _listenForFollowUp() {
    if (_state === STATES.OFF || !_enabled) return;
    if (_speakingSuppressed) return;
    if (_recognition) return;  // prevent duplicate recognizer

    if (!_isRecognitionSupported()) {
      _endSession('unsupported');
      return;
    }

    _setState(_sessionActive ? STATES.CONVERSATION : STATES.LISTENING);

    var rec = _createRecognizer(false);
    if (!rec) { _endSession('error'); return; }
    _recognition = rec;

    rec.onstart = function () {};

    rec.onresult = function (event) {
      _destroyRecognizer();
      _clearConversationTimer();

      if (_speakingSuppressed) {
        _resetConversationTimer();
        if (_sessionActive) _listenForFollowUp();
        return;
      }

      var rawTranscript = event.results[0][0].transcript || '';

      // Stop commands
      if (_isStopCommand(rawTranscript)) {
        _endSession('stop_command');
        return;
      }

      // In conversation, check if user also said "Shadow" again (re-activation — just strip it)
      var wakeCheck = _checkWakeWord(rawTranscript);
      var command = wakeCheck.detected ? wakeCheck.command : rawTranscript.trim();

      if (!command) {
        // Empty command — restart follow-up listening
        _resetConversationTimer();
        _listenForFollowUp();
        return;
      }

      _processCommand(command);
    };

    rec.onerror = function (event) {
      _destroyRecognizer();
      var err = event.error || 'unknown';

      // Permission denied or hardware absent — do NOT retry
      if (_isMicDeniedError(err) || _isMicAbsentError(err)) {
        _handleMicPermissionDenied(err);
        return;
      }

      if (err === 'no-speech' || err === 'aborted') {
        // Silence — if in session, reset timer and keep listening
        if (_sessionActive && _continuousConvo) {
          _resetConversationTimer();
          if (_state !== STATES.OFF && _state !== STATES.PERMISSION_DENIED) _listenForFollowUp();
          return;
        }
        _endSession('silence');
        return;
      }

      _setState(STATES.ERROR);
      setTimeout(function () {
        if (_state === STATES.PERMISSION_DENIED || _state === STATES.OFF) return;
        if (_sessionActive) {
          _setState(STATES.CONVERSATION);
          _listenForFollowUp();
        } else {
          _endSession('error');
        }
      }, 1500);
    };

    rec.onend = function () {
      // If no result was fired, treat as silence
      if (_recognition === null && (_state === STATES.CONVERSATION || _state === STATES.LISTENING)) {
        if (_sessionActive && _continuousConvo) {
          _resetConversationTimer();
          _listenForFollowUp();
        } else {
          _endSession('silence');
        }
      }
    };

    _resetConversationTimer();

    try {
      rec.start();
    } catch (e) {
      _destroyRecognizer();
      var eMsg2 = (e && e.name) ? e.name.toLowerCase() : '';
      if (eMsg2 === 'notallowederror' || eMsg2 === 'securityerror') {
        _handleMicPermissionDenied('not-allowed');
      } else {
        _endSession('error');
      }
    }
  }

  // ─── Process command through the ONE Shadow Reaper brain ──────────────────
  /**
   * CRITICAL ARCHITECTURE:
   * Voice commands go through ShadowReaper.ask() — the identical canonical
   * entry point used by the text UI.  There is no separate voice brain.
   */
  function _processCommand(commandText) {
    if (!commandText || !commandText.trim()) {
      if (_sessionActive) {
        _resetConversationTimer();
        _listenForFollowUp();
      } else {
        _endSession('empty_command');
      }
      return;
    }

    var brain = _brain();
    if (!brain || typeof brain.ask !== 'function') {
      _setState(STATES.ERROR);
      _endSession('brain_unavailable');
      return;
    }

    if (!brain._initialized) {
      _setState(STATES.ERROR);
      _endSession('brain_uninitialized');
      return;
    }

    _setState(STATES.PROCESSING);
    _sessionActive = true;

    // ── THE SINGLE ENTRY POINT ────────────────────────────────────────────
    // ShadowReaper.ask() — the exact same method used by the text UI.
    // No duplicate pipeline. No separate voice responses.
    // ─────────────────────────────────────────────────────────────────────
    brain.ask(commandText, function (response) {
      if (!response || !response.trim()) {
        // No response — keep session alive if continuous
        if (_sessionActive && _continuousConvo && _state !== STATES.OFF) {
          _resetConversationTimer();
          _setState(STATES.CONVERSATION);
          _listenForFollowUp();
        } else {
          _endSession('empty_response');
        }
        return;
      }

      // Speak the response via TTS, then continue session
      _speak(response, function () {
        if (_state === STATES.OFF) return;
        if (_continuousConvo && _sessionActive) {
          _resetConversationTimer();
          _setState(STATES.CONVERSATION);
          // _listenForFollowUp called from _unsuppressAfterSpeaking
        } else {
          _endSession('response_complete');
        }
      });
    });
  }

  // ─── PUBLIC API ───────────────────────────────────────────────────────────

  /**
   * enable()
   * Enables the voice assistant (opt-in).
   * Starts listening for the wake word in STANDBY mode.
   * Does NOT activate the microphone until a wake word is spoken.
   */
  function enable() {
    _enabled = true;
    _savePref(PREF_ENABLED, true);
    // User is re-enabling — reset permission-denied state so they can retry
    // after granting the mic permission in device settings.
    _resetMicPermissionState();
    if (_state === STATES.OFF || _state === STATES.PERMISSION_DENIED) {
      _setState(STATES.STANDBY);
      _listenForWake();
    }
  }

  /**
   * disable()
   * Disables the voice assistant entirely.
   * Stops all recognition, clears session, stops TTS.
   * Microphone is fully released.
   */
  function disable() {
    _enabled = false;
    _savePref(PREF_ENABLED, false);
    _destroyRecognizer();
    _clearConversationTimer();
    if (_postSpeechTimer) { clearTimeout(_postSpeechTimer); _postSpeechTimer = null; }
    _sessionActive = false;
    _speakingSuppressed = false;
    var v = _voice();
    if (v && v.stopSpeaking) v.stopSpeaking();
    _setState(STATES.OFF);
  }

  /**
   * stopSession()
   * End the current conversation session and return to STANDBY.
   * Equivalent to saying "Shadow stop".
   */
  function stopSession() {
    _destroyRecognizer();
    _clearConversationTimer();
    _speakingSuppressed = false;
    var v = _voice();
    if (v && v.stopSpeaking) v.stopSpeaking();
    _endSession('manual_stop');
  }

  /**
   * forceActivate()
   * Manually trigger wake activation (e.g. from a UI button press).
   * Still requires voice assistant to be enabled.
   */
  function forceActivate() {
    if (!_enabled || _state === STATES.OFF) return;
    if (_state === STATES.SPEAKING || _state === STATES.PROCESSING) return;
    _destroyRecognizer();
    _clearConversationTimer();
    _activateSession();
  }

  /** Set voice assistant enabled/disabled (persisted) */
  function setEnabled(val) {
    if (val) { enable(); } else { disable(); }
  }

  /** Configure continuous conversation (persist follow-up session after response) */
  function setContinuousConversation(val) {
    _continuousConvo = !!val;
    _savePref(PREF_CONTINUOUS, _continuousConvo);
  }

  /** Set conversation session timeout in milliseconds */
  function setConversationTimeout(ms) {
    var n = parseInt(ms, 10);
    if (!isNaN(n) && n > 0) {
      _timeoutMs = n;
      _savePref(PREF_TIMEOUT_MS, n);
    }
  }

  /** Set background availability preference (Android only — informational) */
  function setBackgroundEnabled(val) {
    _backgroundEnabled = !!val;
    _savePref(PREF_BACKGROUND, _backgroundEnabled);
  }

  function isEnabled()            { return _enabled; }
  function getState()             { return _state; }
  function isSessionActive()      { return _sessionActive; }
  function isContinuousConvo()    { return _continuousConvo; }
  function getConversationTimeout(){ return _timeoutMs; }
  function isBackgroundEnabled()  { return _backgroundEnabled; }

  /** Human-readable status label for UI display */
  function getStatusLabel() {
    var wn = _getWakeName();
    switch (_state) {
      case STATES.OFF:               return wn + ' • Off';
      case STATES.STANDBY:           return wn + ' • Standby';
      case STATES.WAKE_DETECTED:     return wn + ' • Activated';
      case STATES.LISTENING:         return wn + ' • Listening';
      case STATES.PROCESSING:        return wn + ' • Thinking';
      case STATES.SPEAKING:          return wn + ' • Speaking';
      case STATES.CONVERSATION:      return wn + ' • Listening';
      case STATES.ERROR:             return wn + ' • Error';
      case STATES.PERMISSION_DENIED: return wn + ' • Mic unavailable';
      case STATES.OFFLINE:           return wn + ' • Offline';
      default:                       return wn;
    }
  }

  /** Register a state-change callback: fn(newState, prevState) */
  function onStateChange(cb) {
    if (typeof cb === 'function') _onStateChangeCbs.push(cb);
    return function () {
      _onStateChangeCbs = _onStateChangeCbs.filter(function (x) { return x !== cb; });
    };
  }

  /** Diagnostics — safe, no private data exposed */
  function getDiagnostics() {
    var brain = _brain();
    var v     = _voice();
    var wm    = _wakeMod();
    var plat  = global.SRPlatformDetector;
    var runtime = plat ? plat.getRuntime() : 'UNKNOWN';

    var bgSupported = false;
    // Background wake is only realistic on ANDROID_NATIVE with foreground service
    if (runtime === 'ANDROID_NATIVE') bgSupported = true;

    return {
      build:                    BUILD_ID,
      wakeName:                 _getWakeName(),
      runtime:                  runtime,
      voiceAssistantEnabled:    _enabled,
      voiceState:               _state,
      statusLabel:              getStatusLabel(),
      microphoneAvailable:      _isRecognitionSupported(),
      speechRecognitionAvailable: _isRecognitionSupported(),
      micPermissionDenied:      _micPermDenied,   // true if mic was blocked this session
      offlineMode:              _offlineMode,      // true when network is unavailable
      textToSpeechAvailable:    !!(v && v.isSupported && v.isSupported()),
      continuousConversation:   _continuousConvo,
      conversationTimeoutMs:    _timeoutMs,
      sessionActive:            _sessionActive,
      backgroundAvailabilitySupported: bgSupported,
      backgroundEnabled:        _backgroundEnabled,
      brainEntryPoint:          'ShadowReaper.ask',
      brainInitialized:         !!(brain && brain._initialized),
      nativeWakeSupported:      false,   // Web Speech API only — no native wake engine loaded
      echoProtectionActive:     _speakingSuppressed,
      wakeDebounceMs:           WAKE_DEBOUNCE_MS,
      postSpeechSuppressMs:     POST_SPEECH_SUPPRESS_MS,
      // Safe diagnostics from brain (no private content)
      brainTurnCount:           (brain && brain._initialized && global.SRConversation)
                                  ? global.SRConversation.getTurnCount() : 0,
      // Deliberately excluded: conversation contents, UIDs, memory contents
    };
  }

  /** Full status object for platform/capability checks */
  function getStatus() {
    return getDiagnostics();
  }

  /**
   * Register a callback for microphone permission / hardware errors.
   * fn(message) — called once when mic is blocked or absent.
   * This is how the UI learns to show the "check mic permission" message.
   * Returns an unsubscribe function.
   */
  function onMicError(fn) {
    if (typeof fn === 'function') _onMicErrorCbs.push(fn);
    return function () {
      _onMicErrorCbs = _onMicErrorCbs.filter(function (x) { return x !== fn; });
    };
  }

  /**
   * notifyOffline() / notifyOnline()
   * Called by SRConnectionMonitor when the connection state changes.
   * Updates _offlineMode and transitions state if needed.
   *
   * Voice recognition requires an internet connection on most browsers
   * (the audio is processed by Google/platform servers).
   * When offline: stop recognition safely and set OFFLINE state.
   * When back online: attempt to resume from STANDBY.
   */
  function notifyOffline() {
    if (_offlineMode) return;  // already in offline mode
    _offlineMode = true;
    _destroyRecognizer();
    _clearConversationTimer();
    if (_state !== STATES.OFF) {
      _setState(STATES.OFFLINE);
    }
  }

  function notifyOnline() {
    if (!_offlineMode) return;  // was not offline
    _offlineMode = false;
    if (_enabled && _state === STATES.OFFLINE) {
      // Restore to STANDBY and restart wake listening
      _setState(STATES.STANDBY);
      _listenForWake();
    }
  }

  /** Destroy — release all resources */
  function destroy() {
    disable();
    _onStateChangeCbs = [];
    _onStatusCbs      = [];
    _onMicErrorCbs    = [];
  }

  // ─── Auto-restore on load ─────────────────────────────────────────────────
  // If voice assistant was enabled when the page was last closed,
  // restore to STANDBY (do not auto-activate the mic — just set state).
  // The microphone only activates when _listenForWake() starts a cycle,
  // which requires user interaction on most browsers (handled by browser policy).
  (function _autoRestore() {
    if (_enabled) {
      // Defer to allow brain + SRVoice to finish loading
      _setState(STATES.STANDBY);
      // Note: _listenForWake() is NOT called here on purpose.
      // The browser requires a user gesture before autoplay/mic access.
      // The UI layer calls enable() after user interaction.
    }
  })();

  // ─── Expose window.SRVoiceAssistant ───────────────────────────────────────
  global.SRVoiceAssistant = {
    build:   BUILD_ID,
    STATES:  STATES,

    // Lifecycle
    enable:   enable,
    disable:  disable,
    destroy:  destroy,

    // Session control
    stopSession:    stopSession,
    forceActivate:  forceActivate,

    // Settings
    setEnabled:               setEnabled,
    setContinuousConversation: setContinuousConversation,
    setConversationTimeout:   setConversationTimeout,
    setBackgroundEnabled:     setBackgroundEnabled,

    // State queries
    isEnabled:             isEnabled,
    getState:              getState,
    isSessionActive:       isSessionActive,
    isContinuousConvo:     isContinuousConvo,
    getConversationTimeout:getConversationTimeout,
    isBackgroundEnabled:   isBackgroundEnabled,
    getStatusLabel:        getStatusLabel,

    // Diagnostics
    getDiagnostics: getDiagnostics,
    getStatus:      getStatus,

    // Events
    onStateChange:  onStateChange,
    onMicError:     onMicError,

    // Connection notification (called by SRConnectionMonitor)
    notifyOffline:  notifyOffline,
    notifyOnline:   notifyOnline,

    // Internal (testable)
    _checkWakeWord:           _checkWakeWord,
    _isStopCommand:           _isStopCommand,
    _wakeDebounceOk:          _wakeDebounceOk,
    _STOP_PHRASES:            STOP_PHRASES,
    _WAKE_DEBOUNCE_MS:        WAKE_DEBOUNCE_MS,
    _MIC_DENIED_ERRORS:       MIC_DENIED_ERRORS,
    _MIC_ABSENT_ERRORS:       MIC_ABSENT_ERRORS,
    _isMicDeniedError:        _isMicDeniedError,
    _isMicAbsentError:        _isMicAbsentError,
  };

})(typeof window !== 'undefined' ? window : global);
