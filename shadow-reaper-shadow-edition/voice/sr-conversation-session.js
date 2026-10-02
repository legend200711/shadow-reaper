/**
 * shadow-reaper-v2/voice/sr-conversation-session.js
 * Shadow Reaper — Conversation Session Manager
 *
 * Build: SR-V2-CONV-SESSION-1
 *
 * Exposes: window.SRConvSession
 *
 * PURPOSE:
 *   Manages the voice conversation session lifecycle.
 *   When the wake name is detected, Shadow enters an ACTIVE session.
 *   While the session is active, the user does NOT need to say the wake
 *   name again before each sentence.
 *
 * SESSION STATE MACHINE:
 *   IDLE
 *     → WAKE_DETECTED    (wake name heard or tap-to-talk pressed)
 *   WAKE_DETECTED
 *     → LISTENING        (mic open, waiting for speech)
 *   LISTENING
 *     → THINKING         (speech recognition complete, pipeline running)
 *   THINKING
 *     → SPEAKING         (response TTS playing)
 *   SPEAKING
 *     → LISTENING        (TTS finished — continue listening in session)
 *     → INTERRUPTED      (user spoke mid-TTS)
 *   INTERRUPTED
 *     → THINKING         (interrupted speech recognized)
 *   LISTENING / SPEAKING
 *     → IDLE             (inactivity timeout OR explicit end command)
 *
 * INACTIVITY TIMEOUT:
 *   After INACTIVITY_TIMEOUT_MS of silence (no user speech), the session
 *   ends automatically and Shadow returns to IDLE.
 *   Default: 60 000 ms (1 minute). Configurable via setInactivityTimeout().
 *
 * END COMMANDS:
 *   Phrases like "goodbye Shadow", "bye Shadow", "stop", "that's all" etc.
 *   trigger a graceful session end.
 *
 * INTERRUPT HANDLING:
 *   When the user speaks while Shadow is speaking (SPEAKING state),
 *   SRConvSession signals the voice engine to cancel TTS and listen.
 *   The new speech is processed through ShadowReaper.ask() as a continuation
 *   of the SAME conversation (not a new conversation).
 *
 * ECHO PROTECTION:
 *   When TTS is active, voice recognition results that closely match the
 *   last TTS text are suppressed (they are Shadow's own voice, not the user).
 *
 * ZERO EXTERNAL AI CALLS. ZERO POLLING (uses setTimeout only for inactivity).
 * ZERO SETINTERVAL.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-V2-CONV-SESSION-1';

  // ─── Session states ───────────────────────────────────────────────────────

  var STATE = {
    IDLE:          'IDLE',
    WAKE_DETECTED: 'WAKE_DETECTED',
    LISTENING:     'LISTENING',
    THINKING:      'THINKING',
    SPEAKING:      'SPEAKING',
    INTERRUPTED:   'INTERRUPTED',
  };

  // ─── Configuration ────────────────────────────────────────────────────────

  var DEFAULT_INACTIVITY_MS = 60000;  // 60 seconds
  var ECHO_SIMILARITY_THRESHOLD = 0.60;  // if 60%+ token overlap → echo
  var MAX_ECHO_COMPARE_LEN = 80;  // chars of TTS text to check

  // ─── End-of-session phrases ───────────────────────────────────────────────

  var END_SESSION_PATTERNS = [
    /\b(goodbye|bye|good night|goodnight|that.?s all|i.?m done|end session|stop listening|go to sleep|thanks that.?s (all|it))\b/i,
    /\b(talk (to you|later)|see you|later shadow|later pepper|later luna|later elsa|later simba|later salem|later rambo|later legend)\b/i,
  ];

  // ─── State ────────────────────────────────────────────────────────────────

  var _state              = STATE.IDLE;
  var _inactivityMs       = DEFAULT_INACTIVITY_MS;
  var _inactivityTimer    = null;
  var _lastTTSText        = '';
  var _lastTTSTokens      = [];
  var _stateCallbacks     = [];  // fn(newState, oldState)
  var _endCallbacks       = [];  // fn() — called when session ends
  var _sessionActive      = false;

  // ─── State helpers ────────────────────────────────────────────────────────

  function _setState(newState) {
    var old = _state;
    if (old === newState) return;
    _state = newState;
    _stateCallbacks.forEach(function (cb) {
      try { cb(newState, old); } catch (_) {}
    });
  }

  function getState()       { return _state; }
  function isActive()       { return _sessionActive; }
  function isListening()    { return _state === STATE.LISTENING; }
  function isSpeaking()     { return _state === STATE.SPEAKING; }
  function isThinking()     { return _state === STATE.THINKING; }

  // ─── Session lifecycle ────────────────────────────────────────────────────

  /**
   * startSession()
   * Called when wake name is detected or tap-to-talk initiated.
   * Transitions: IDLE → WAKE_DETECTED → LISTENING
   */
  function startSession() {
    if (_sessionActive) return; // Already in session
    _sessionActive = true;
    _setState(STATE.WAKE_DETECTED);
    _resetInactivityTimer();
    // Move to LISTENING immediately (the voice engine will open the mic)
    setTimeout(function () {
      if (_sessionActive) _setState(STATE.LISTENING);
    }, 80);
  }

  /**
   * endSession(reason)
   * Gracefully ends the conversation session.
   */
  function endSession(reason) {
    if (!_sessionActive && _state === STATE.IDLE) return;
    _clearInactivityTimer();
    _sessionActive = false;
    _setState(STATE.IDLE);
    _lastTTSText   = '';
    _lastTTSTokens = [];
    _endCallbacks.forEach(function (cb) {
      try { cb(reason || 'ended'); } catch (_) {}
    });
    console.log('[SRConvSession] Session ended. Reason:', reason || 'ended');
  }

  /**
   * onUserSpeechStart()
   * Called when speech recognition detects the user has started speaking.
   * If Shadow is currently speaking (SPEAKING state), this is an interrupt.
   */
  function onUserSpeechStart() {
    _resetInactivityTimer();
    if (_state === STATE.SPEAKING) {
      // User interrupted Shadow — cancel TTS
      _setState(STATE.INTERRUPTED);
      var voice = global.SRVoice;
      if (voice && typeof voice.stopSpeaking === 'function') {
        voice.stopSpeaking();
      }
      console.log('[SRConvSession] User interrupted Shadow. TTS cancelled.');
    }
  }

  /**
   * onSpeechResult(text)
   * Called when speech recognition returns a result.
   * Returns: { process: boolean, text: string }
   *   process=false if this looks like an echo of Shadow's own TTS.
   */
  function onSpeechResult(text) {
    _resetInactivityTimer();

    if (!text || !text.trim()) {
      return { process: false, text: '' };
    }

    // ── Echo protection ───────────────────────────────────────────────────
    if (_isEcho(text)) {
      console.log('[SRConvSession] Echo suppressed:', text.substring(0, 40));
      return { process: false, text: text };
    }

    // ── End-of-session detection ──────────────────────────────────────────
    if (_isEndCommand(text)) {
      endSession('user_ended');
      return { process: false, text: text, sessionEnded: true };
    }

    // ── Transition to THINKING ────────────────────────────────────────────
    _setState(STATE.THINKING);

    return { process: true, text: text };
  }

  /**
   * onThinkingStart()
   * Called when ShadowReaper.ask() begins processing.
   */
  function onThinkingStart() {
    _setState(STATE.THINKING);
    _resetInactivityTimer();
  }

  /**
   * onSpeakingStart(ttsText)
   * Called when Shadow starts speaking (TTS begins).
   * Stores the TTS text for echo detection.
   */
  function onSpeakingStart(ttsText) {
    _setState(STATE.SPEAKING);
    _clearInactivityTimer(); // Don't time out while Shadow is speaking
    _lastTTSText   = (ttsText || '').substring(0, MAX_ECHO_COMPARE_LEN);
    _lastTTSTokens = _tokenize(_lastTTSText);
  }

  /**
   * onSpeakingEnd()
   * Called when TTS finishes. Transitions back to LISTENING if session is active.
   */
  function onSpeakingEnd() {
    if (!_sessionActive) {
      _setState(STATE.IDLE);
      return;
    }
    _setState(STATE.LISTENING);
    _resetInactivityTimer();
  }

  /**
   * onSpeakingError()
   * TTS failed. Continue session but don't stay stuck in SPEAKING.
   */
  function onSpeakingError() {
    if (_sessionActive) {
      _setState(STATE.LISTENING);
      _resetInactivityTimer();
    } else {
      _setState(STATE.IDLE);
    }
  }

  /**
   * onRecognitionError(errorCode)
   * Speech recognition encountered an error. Handle gracefully.
   */
  function onRecognitionError(errorCode) {
    // 'no-speech' is normal (user paused) — reset timer, stay in LISTENING
    if (errorCode === 'no-speech' || errorCode === 'aborted') {
      if (_sessionActive) {
        _setState(STATE.LISTENING);
        _resetInactivityTimer();
      }
      return;
    }
    // Other errors — stay in session but surface state
    if (_sessionActive) {
      _setState(STATE.LISTENING); // Attempt to continue
    } else {
      _setState(STATE.IDLE);
    }
  }

  // ─── Inactivity timer ─────────────────────────────────────────────────────

  function _resetInactivityTimer() {
    _clearInactivityTimer();
    if (_sessionActive && _inactivityMs > 0) {
      _inactivityTimer = setTimeout(function () {
        console.log('[SRConvSession] Inactivity timeout — ending session.');
        endSession('inactivity_timeout');
      }, _inactivityMs);
    }
  }

  function _clearInactivityTimer() {
    if (_inactivityTimer) {
      clearTimeout(_inactivityTimer);
      _inactivityTimer = null;
    }
  }

  // ─── Echo protection ──────────────────────────────────────────────────────

  function _tokenize(text) {
    return (text || '').toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(Boolean);
  }

  function _isEcho(recognizedText) {
    if (!_lastTTSText || !_lastTTSTokens.length) return false;
    if (!recognizedText) return false;

    var recTokens = _tokenize(recognizedText);
    if (!recTokens.length) return false;

    // Count tokens from recognized text that also appear in last TTS
    var ttsSet = {};
    _lastTTSTokens.forEach(function (t) { ttsSet[t] = true; });

    var matchCount = 0;
    recTokens.forEach(function (t) {
      if (ttsSet[t]) matchCount++;
    });

    var similarity = matchCount / Math.max(recTokens.length, 1);
    return similarity >= ECHO_SIMILARITY_THRESHOLD;
  }

  // ─── End-command detection ────────────────────────────────────────────────

  function _isEndCommand(text) {
    return END_SESSION_PATTERNS.some(function (p) { return p.test(text); });
  }

  // ─── Configuration ────────────────────────────────────────────────────────

  function setInactivityTimeout(ms) {
    _inactivityMs = (typeof ms === 'number' && ms >= 0) ? ms : DEFAULT_INACTIVITY_MS;
  }

  function getInactivityTimeout() {
    return _inactivityMs;
  }

  // ─── Callbacks ────────────────────────────────────────────────────────────

  function onStateChange(cb) {
    if (typeof cb === 'function') _stateCallbacks.push(cb);
    return function () {
      _stateCallbacks = _stateCallbacks.filter(function (x) { return x !== cb; });
    };
  }

  function onSessionEnd(cb) {
    if (typeof cb === 'function') _endCallbacks.push(cb);
    return function () {
      _endCallbacks = _endCallbacks.filter(function (x) { return x !== cb; });
    };
  }

  // ─── Status ───────────────────────────────────────────────────────────────

  function getStatus() {
    return {
      build:           BUILD_ID,
      state:           _state,
      sessionActive:   _sessionActive,
      inactivityMs:    _inactivityMs,
      lastTTSText:     _lastTTSText.substring(0, 30) + (_lastTTSText.length > 30 ? '…' : ''),
      STATE:           STATE,
    };
  }

  // ─── Expose ───────────────────────────────────────────────────────────────

  global.SRConvSession = {
    build:                  BUILD_ID,
    STATE:                  STATE,

    // Lifecycle
    startSession:           startSession,
    endSession:             endSession,

    // Event hooks (called by the voice integration layer)
    onUserSpeechStart:      onUserSpeechStart,
    onSpeechResult:         onSpeechResult,
    onThinkingStart:        onThinkingStart,
    onSpeakingStart:        onSpeakingStart,
    onSpeakingEnd:          onSpeakingEnd,
    onSpeakingError:        onSpeakingError,
    onRecognitionError:     onRecognitionError,

    // Queries
    getState:               getState,
    isActive:               isActive,
    isListening:            isListening,
    isSpeaking:             isSpeaking,
    isThinking:             isThinking,

    // Configuration
    setInactivityTimeout:   setInactivityTimeout,
    getInactivityTimeout:   getInactivityTimeout,

    // Callbacks
    onStateChange:          onStateChange,
    onSessionEnd:           onSessionEnd,

    // Status
    getStatus:              getStatus,
  };

})(typeof window !== 'undefined' ? window : global);
