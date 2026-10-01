/**
 * shadow-reaper-v2/voice/voice-engine.js
 * Shadow Reaper V2 — Voice Engine
 *
 * Build: SR-V2-VOICE-1
 *
 * Exposes: window.SRVoice
 *
 * ARCHITECTURE:
 *   - Uses browser Web Speech API (SpeechRecognition + SpeechSynthesis).
 *   - Recognized text is passed through the SAME Shadow Reaper V2 pipeline.
 *   - There is NO separate voice brain.
 *   - Microphone must be EXPLICITLY activated by the user.
 *   - Raw audio is NEVER stored.
 *   - Voice must NOT interfere with SNS Live, DJ, Cohost, or camera.
 *   - Resources are cleaned up when voice is stopped/destroyed.
 *
 * STATES: IDLE | LISTENING | PROCESSING | SPEAKING | UNSUPPORTED | ERROR
 *
 * ZERO EXTERNAL AI CALLS.
 * ZERO POLLING. ZERO RAF. ZERO setInterval.
 */

(function (global) {
  'use strict';

  var BUILD_ID = 'SR-V2-VOICE-1';
  var VOICE_ENABLED_KEY = 'srVoiceEnabled';
  var TTS_ENABLED_KEY   = 'srTTSEnabled';

  // ── Wake Name helper ─────────────────────────────────────────────────────
  // SRWakeName is loaded independently (voice/sr-wake-name.js).
  // These helpers are no-ops when SRWakeName is not loaded.
  function _wakeModule() { return global.SRWakeName || null; }

  /* ─────────────────────────────────────────────────────────────
     STATE
  ───────────────────────────────────────────────────────────────*/
  var STATE = {
    IDLE:        'IDLE',
    LISTENING:   'LISTENING',
    PROCESSING:  'PROCESSING',
    SPEAKING:    'SPEAKING',
    UNSUPPORTED: 'UNSUPPORTED',
    ERROR:       'ERROR',
  };

  var _state         = STATE.IDLE;
  var _recognition   = null;
  var _synthesis     = global.speechSynthesis || null;
  var _onResultCb    = null;   // called with recognized text
  var _onStateCb     = null;   // called when state changes
  var _onErrorCb     = null;   // called on error
  var _voiceEnabled  = _readPref(VOICE_ENABLED_KEY, true);
  var _ttsEnabled    = _readPref(TTS_ENABLED_KEY, true);
  var _isSupported   = !!(
    (global.SpeechRecognition || global.webkitSpeechRecognition) &&
    global.speechSynthesis
  );

  function _readPref(key, defaultVal) {
    try {
      var v = global.localStorage && global.localStorage.getItem(key);
      if (v === null || v === undefined) return defaultVal;
      return v !== 'false';
    } catch (_) {
      return defaultVal;
    }
  }

  function _savePref(key, val) {
    try {
      if (global.localStorage) global.localStorage.setItem(key, val ? 'true' : 'false');
    } catch (_) {}
  }

  /* ─────────────────────────────────────────────────────────────
     STATE MANAGEMENT
  ───────────────────────────────────────────────────────────────*/
  function _setState(newState) {
    _state = newState;
    if (typeof _onStateCb === 'function') {
      try { _onStateCb(newState); } catch (_) {}
    }
  }

  /* ─────────────────────────────────────────────────────────────
     START LISTENING
     Explicit user activation only — never called automatically.
  ───────────────────────────────────────────────────────────────*/
  function startListening(onResult, onError) {
    if (!_isSupported) {
      _setState(STATE.UNSUPPORTED);
      var msg = 'Speech recognition is not supported in this browser.';
      if (typeof onError === 'function') onError(msg);
      return false;
    }

    if (!_voiceEnabled) {
      var disabled = 'Voice is currently disabled.';
      if (typeof onError === 'function') onError(disabled);
      return false;
    }

    if (_state === STATE.LISTENING) {
      return true; // Already listening
    }

    try {
      var SpeechRec = global.SpeechRecognition || global.webkitSpeechRecognition;
      _recognition = new SpeechRec();
      _recognition.lang = 'en-US';
      _recognition.continuous = false;
      _recognition.interimResults = false;
      _recognition.maxAlternatives = 1;

      _onResultCb = onResult;
      _onErrorCb  = onError;

      _recognition.onstart = function () {
        _setState(STATE.LISTENING);
      };

      _recognition.onresult = function (event) {
        _setState(STATE.PROCESSING);
        try {
          var rawTranscript = event.results[0][0].transcript;

          // Route through SRWakeName pipeline (if loaded).
          // processTranscript strips the wake phrase (if present) and returns
          // the cleaned command text.  If SRWakeName is not loaded, pass through.
          var wm = _wakeModule();
          if (wm && typeof wm.processTranscript === 'function') {
            wm.processTranscript(rawTranscript, function (normalized) {
              if (typeof _onResultCb === 'function') {
                // Pass the cleaned command to the intent pipeline.
                // The normalized object also carries wakeDetected + mode for
                // callers that want to react differently to wake-activated input.
                _onResultCb(normalized.command, normalized);
              }
            });
          } else {
            if (typeof _onResultCb === 'function') {
              _onResultCb(rawTranscript);
            }
          }
        } catch (e) {
          _setState(STATE.ERROR);
          if (typeof _onErrorCb === 'function') _onErrorCb('Voice recognition error: ' + (e.message || 'unknown'));
        }
        _cleanupRecognition();
        _setState(STATE.IDLE);
      };

      _recognition.onerror = function (event) {
        var msg = 'Voice error: ' + (event.error || 'unknown');
        _setState(STATE.ERROR);
        if (typeof _onErrorCb === 'function') _onErrorCb(msg);
        _cleanupRecognition();
        _setState(STATE.IDLE);
      };

      _recognition.onend = function () {
        if (_state === STATE.LISTENING) {
          _setState(STATE.IDLE);
        }
        _cleanupRecognition();
      };

      _recognition.start();
      return true;

    } catch (e) {
      _setState(STATE.ERROR);
      if (typeof onError === 'function') onError('Failed to start speech recognition: ' + (e.message || 'unknown'));
      return false;
    }
  }

  /* ─────────────────────────────────────────────────────────────
     STOP LISTENING
  ───────────────────────────────────────────────────────────────*/
  function stopListening() {
    if (_recognition) {
      try { _recognition.stop(); } catch (_) {}
    }
    _cleanupRecognition();
    _setState(STATE.IDLE);
  }

  /* ─────────────────────────────────────────────────────────────
     SPEAK (Text-to-Speech)
     Optional — only if TTS is enabled and supported.
     NEVER stores raw audio. Only uses synthesis API.
  ───────────────────────────────────────────────────────────────*/
  function speak(text, onEnd) {
    if (!_ttsEnabled || !_synthesis) {
      if (typeof onEnd === 'function') onEnd();
      return;
    }

    try {
      // Cancel any current speech
      _synthesis.cancel();

      var utterance = new global.SpeechSynthesisUtterance(text);
      utterance.rate  = 0.95;
      utterance.pitch = 0.85;
      utterance.volume = 1.0;

      utterance.onstart = function () { _setState(STATE.SPEAKING); };

      utterance.onend = function () {
        _setState(STATE.IDLE);
        if (typeof onEnd === 'function') onEnd();
      };

      utterance.onerror = function () {
        _setState(STATE.IDLE);
        if (typeof onEnd === 'function') onEnd();
      };

      _synthesis.speak(utterance);

    } catch (e) {
      _setState(STATE.IDLE);
      if (typeof onEnd === 'function') onEnd();
    }
  }

  /* ─────────────────────────────────────────────────────────────
     STOP SPEAKING
  ───────────────────────────────────────────────────────────────*/
  function stopSpeaking() {
    if (_synthesis) {
      try { _synthesis.cancel(); } catch (_) {}
    }
    _setState(STATE.IDLE);
  }

  /* ─────────────────────────────────────────────────────────────
     CLEANUP
  ───────────────────────────────────────────────────────────────*/
  function _cleanupRecognition() {
    if (_recognition) {
      try { _recognition.onstart   = null; } catch (_) {}
      try { _recognition.onresult  = null; } catch (_) {}
      try { _recognition.onerror   = null; } catch (_) {}
      try { _recognition.onend     = null; } catch (_) {}
      _recognition = null;
    }
  }

  function destroy() {
    stopListening();
    stopSpeaking();
    _onResultCb  = null;
    _onStateCb   = null;
    _onErrorCb   = null;
    _setState(STATE.IDLE);
  }

  /* ─────────────────────────────────────────────────────────────
     SETTINGS
  ───────────────────────────────────────────────────────────────*/
  function setVoiceEnabled(val) {
    _voiceEnabled = !!val;
    _savePref(VOICE_ENABLED_KEY, _voiceEnabled);
    if (!_voiceEnabled) stopListening();
  }

  function setTTSEnabled(val) {
    _ttsEnabled = !!val;
    _savePref(TTS_ENABLED_KEY, _ttsEnabled);
    if (!_ttsEnabled) stopSpeaking();
  }

  function isVoiceEnabled()    { return _voiceEnabled; }
  function isTTSEnabled()      { return _ttsEnabled; }
  function isSupported()       { return _isSupported; }
  function getState()          { return _state; }

  function onStateChange(cb)   { _onStateCb = cb; }

  function getStatus() {
    var wm = _wakeModule();
    return {
      supported:    _isSupported,
      state:        _state,
      voiceEnabled: _voiceEnabled,
      ttsEnabled:   _ttsEnabled,
      isListening:  _state === STATE.LISTENING,
      isSpeaking:   _state === STATE.SPEAKING,
      // Wake Name status (from SRWakeName if loaded)
      wakeName:      wm ? wm.getWakeName()     : null,
      wakeListening: wm ? wm.isWakeListening()  : null,
      wakeAvailable: !!wm,
    };
  }

  /* ─────────────────────────────────────────────────────────────
     EXPOSE — window.SRVoice
  ───────────────────────────────────────────────────────────────*/
  global.SRVoice = {
    build:          BUILD_ID,
    STATE:          STATE,
    startListening: startListening,
    stopListening:  stopListening,
    speak:          speak,
    stopSpeaking:   stopSpeaking,
    destroy:        destroy,
    setVoiceEnabled: setVoiceEnabled,
    setTTSEnabled:  setTTSEnabled,
    isVoiceEnabled: isVoiceEnabled,
    isTTSEnabled:   isTTSEnabled,
    isSupported:    isSupported,
    getState:       getState,
    getStatus:      getStatus,
    onStateChange:  onStateChange,
    // Wake Name convenience accessors (delegates to SRWakeName)
    getWakeName:     function () { var wm = _wakeModule(); return wm ? wm.getWakeName() : null; },
    isWakeListening: function () { var wm = _wakeModule(); return wm ? wm.isWakeListening() : false; },
  };

})(typeof window !== 'undefined' ? window : global);
