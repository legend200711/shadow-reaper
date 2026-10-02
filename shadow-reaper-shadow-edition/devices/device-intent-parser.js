/**
 * shadow-reaper-v2/devices/device-intent-parser.js
 * Shadow Reaper V2 — Device Intent Parser
 *
 * Build: SR-V2-DEVICES-1
 *
 * Exposes: window.SRDeviceIntentParser
 *
 * PURPOSE:
 *   Extracts device control intents from user messages, so ShadowReaper.ask()
 *   can route them to SRDeviceActionRouter.
 *
 *   This is NOT a separate AI.  It is a pattern-matching layer that runs
 *   WITHIN the existing ShadowReaper.ask() pipeline (before the response engine).
 *   The Shadow Reaper brain remains the single entry point.
 *
 *   If a device intent is detected:
 *     → route to SRDeviceActionRouter
 *     → SRDeviceActionRouter.describeResult() produces the natural response
 *     → response returned to the user through the normal ShadowReaper pipeline
 *
 *   If NOT a device intent:
 *     → continue through the normal Shadow Reaper pipeline
 *
 * PATTERN APPROACH:
 *   Keyword + action pattern matching (no external model).
 *   This is SUPPLEMENTED by the full language foundation analysis where available.
 *   Matched intents include device type hints and action keywords.
 *
 * EXAMPLES HANDLED:
 *   "turn the TV down"        → { deviceType: SMART_TV, action: volume_down }
 *   "pause the TV"            → { deviceType: SMART_TV, action: pause }
 *   "open Spotify on my computer" → { deviceType: COMPUTER, action: open_application, params: { application: 'Spotify' } }
 *   "lock my computer"        → { deviceType: COMPUTER, action: lock }
 *   "is my computer online?"  → { deviceType: COMPUTER, action: status }
 *   "turn off the bedroom light" → { deviceName: 'bedroom light', action: power_off }
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-V2-DEVICES-1';

  // ── Device keyword patterns ───────────────────────────────────────────────

  var DEVICE_PATTERNS = [
    { type: 'COMPUTER', keywords: ['computer', 'pc', 'laptop', 'desktop', 'mac', 'my computer', 'the computer'] },
    { type: 'SMART_TV',    keywords: ['tv', 'television', 'the tv', 'living room tv', 'bedroom tv'] },
    { type: 'SMART_LIGHT', keywords: ['light', 'lights', 'lamp', 'bulb', 'bedroom light', 'living room light', 'kitchen light'] },
    { type: 'SMART_PLUG',  keywords: ['plug', 'outlet', 'socket'] },
    { type: 'SMART_SPEAKER', keywords: ['speaker', 'alexa', 'google home', 'smart speaker'] },
    { type: 'THERMOSTAT',  keywords: ['thermostat', 'temperature', 'ac', 'heat', 'hvac'] },
    { type: 'MEDIA_PLAYER', keywords: ['player', 'roku', 'chromecast', 'fire stick', 'firestick'] },
  ];

  // ── Action keyword patterns ───────────────────────────────────────────────

  var ACTION_PATTERNS = [
    // Media
    { action: 'play',           keywords: ['play', 'start playing', 'resume', 'unpause'] },
    { action: 'pause',          keywords: ['pause', 'stop playing', 'hold on'] },
    { action: 'stop',           keywords: ['stop'] },
    { action: 'next',           keywords: ['next', 'skip', 'next track', 'next song', 'next episode'] },
    { action: 'previous',       keywords: ['previous', 'prev', 'go back', 'last track', 'last song'] },
    // Volume
    { action: 'volume_up',      keywords: ['volume up', 'louder', 'turn up', 'raise volume', 'increase volume'] },
    { action: 'volume_down',    keywords: ['volume down', 'quieter', 'turn down', 'lower volume', 'decrease volume', 'down', 'a little more'] },
    { action: 'mute',           keywords: ['mute', 'silence', 'shut up', 'be quiet'] },
    { action: 'unmute',         keywords: ['unmute', 'turn sound on'] },
    // Power
    { action: 'power_on',       keywords: ['turn on', 'switch on', 'power on', 'wake up'] },
    { action: 'power_off',      keywords: ['turn off', 'switch off', 'power off', 'shut off'] },
    // Light
    { action: 'brightness_up',  keywords: ['brighter', 'brightness up', 'more light'] },
    { action: 'brightness_down',keywords: ['dimmer', 'dim', 'brightness down', 'less light'] },
    // Computer-specific
    { action: 'open_application',  keywords: ['open', 'launch', 'start', 'run'] },
    { action: 'close_application', keywords: ['close', 'quit', 'exit'] },
    { action: 'lock',           keywords: ['lock', 'lock the'] },
    { action: 'lock_screen',    keywords: ['lock screen'] },
    { action: 'sleep',          keywords: ['sleep', 'put to sleep', 'go to sleep'] },
    { action: 'shutdown',       keywords: ['shut down', 'shutdown', 'turn off'] },
    { action: 'restart',        keywords: ['restart', 'reboot'] },
    // Status
    { action: 'status',         keywords: ['online', 'status', 'battery', 'how is', 'is it on', 'is it off', 'is my', 'is the'] },
    { action: 'battery_status', keywords: ['battery', 'battery level', 'how much battery'] },
    // App/website
    { action: 'launch_website', keywords: ['open youtube', 'open browser', 'go to', 'navigate to'] },
  ];

  // ── Common application name extraction ───────────────────────────────────

  var KNOWN_APPS = [
    'spotify', 'netflix', 'youtube', 'chrome', 'firefox', 'safari',
    'discord', 'slack', 'zoom', 'teams', 'vscode', 'code', 'notepad',
    'word', 'excel', 'powerpoint', 'outlook', 'mail', 'calendar',
    'vlc', 'obs', 'steam', 'photoshop', 'illustrator',
  ];

  function _extractApplication(text) {
    var lower = text.toLowerCase();
    for (var i = 0; i < KNOWN_APPS.length; i++) {
      if (lower.indexOf(KNOWN_APPS[i]) !== -1) {
        // Title-case the app name
        return KNOWN_APPS[i].charAt(0).toUpperCase() + KNOWN_APPS[i].slice(1);
      }
    }
    // Try "open X on" or "launch X on" pattern
    var m = lower.match(/(?:open|launch|start|run)\s+([a-zA-Z0-9\s]+?)(?:\s+on|\s+for|$)/i);
    if (m && m[1]) {
      var app = m[1].trim();
      // Filter out device words
      var isDevice = DEVICE_PATTERNS.some(function (d) {
        return d.keywords.some(function (k) { return app.indexOf(k) !== -1; });
      });
      if (!isDevice && app.length > 1 && app.length < 40) {
        return app.charAt(0).toUpperCase() + app.slice(1);
      }
    }
    return null;
  }

  // ── Main parse function ───────────────────────────────────────────────────

  /**
   * parse(message)
   * Returns a device intent object, or null if no device intent detected.
   *
   * Returns {
   *   deviceType:  string   (DEVICE_TYPES value, may be null if only name found)
   *   deviceName:  string   (friendly name from message, e.g. "bedroom TV")
   *   action:      string   (action identifier)
   *   params:      object   (additional params, e.g. { application: 'Spotify' })
   *   confidence:  number   (0–1)
   *   raw:         string   (matched text)
   * }
   */
  function parse(message) {
    if (!message) return null;
    var lower = message.toLowerCase().trim();

    // ── Detect device type from keywords ─────────────────────────────────────
    var detectedDeviceType = null;
    var detectedDeviceName = null;
    for (var di = 0; di < DEVICE_PATTERNS.length; di++) {
      var dp = DEVICE_PATTERNS[di];
      for (var ki = 0; ki < dp.keywords.length; ki++) {
        if (lower.indexOf(dp.keywords[ki]) !== -1) {
          detectedDeviceType = dp.type;
          detectedDeviceName = dp.keywords[ki];
          break;
        }
      }
      if (detectedDeviceType) break;
    }

    // ── Detect action ─────────────────────────────────────────────────────────
    var detectedAction = null;
    var actionConfidence = 0;
    for (var ai = 0; ai < ACTION_PATTERNS.length; ai++) {
      var ap = ACTION_PATTERNS[ai];
      for (var aki = 0; aki < ap.keywords.length; aki++) {
        if (lower.indexOf(ap.keywords[aki]) !== -1) {
          // Longer keyword match = higher confidence
          var conf = Math.min(1, 0.5 + ap.keywords[aki].length / 20);
          if (conf > actionConfidence) {
            detectedAction = ap.action;
            actionConfidence = conf;
          }
          break;
        }
      }
    }

    // ── Require both device and action to proceed ─────────────────────────────
    if (!detectedDeviceType || !detectedAction) return null;

    var params = {};

    // Extract application name for open/close actions
    if (detectedAction === 'open_application' || detectedAction === 'close_application') {
      var app = _extractApplication(message);
      if (app) params.application = app;
    }

    return {
      deviceType:  detectedDeviceType,
      deviceName:  detectedDeviceName,
      action:      detectedAction,
      params:      params,
      confidence:  actionConfidence,
      raw:         message,
    };
  }

  /**
   * isConfirmationResponse(message)
   * Returns true if the message looks like a confirmation ("yes", "yep", "do it")
   * or rejection ("no", "cancel", "never mind").
   */
  function isConfirmationResponse(message) {
    if (!message) return { isConfirm: false, isReject: false };
    var lower = message.toLowerCase().trim();
    var confirmWords = ['yes', 'yep', 'yeah', 'do it', 'confirm', 'sure', 'go ahead', 'okay', 'ok', 'proceed'];
    var rejectWords  = ['no', 'nope', 'cancel', 'stop', 'never mind', 'nevermind', 'abort', 'dont', "don't"];
    var isConfirm = confirmWords.some(function (w) { return lower === w || lower.indexOf(w) !== -1; });
    var isReject  = rejectWords.some(function (w)  { return lower === w || lower.indexOf(w) !== -1; });
    return { isConfirm: isConfirm, isReject: isReject };
  }

  // ─── Expose ───────────────────────────────────────────────────────────────

  global.SRDeviceIntentParser = {
    build:   BUILD_ID,
    parse:   parse,
    isConfirmationResponse: isConfirmationResponse,
    DEVICE_PATTERNS:  DEVICE_PATTERNS,
    ACTION_PATTERNS:  ACTION_PATTERNS,
    _extractApplication: _extractApplication,
  };

})(typeof window !== 'undefined' ? window : global);
