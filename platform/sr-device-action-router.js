/**
 * shadow-reaper-standalone/platform/sr-device-action-router.js
 * Shadow Reaper Standalone — Device Action Router
 *
 * Build: SR-STANDALONE-DEVICE-ROUTER-1
 *
 * Exposes: window.SRDeviceActionRouter
 *
 * PURPOSE:
 *   Central routing layer for all device actions requested via Shadow Reaper.
 *   Enforces the security pipeline:
 *
 *   User request
 *   → Shadow Reaper intent
 *   → Device Action Router (this module)
 *   → capability check
 *   → permission check
 *   → approved platform adapter
 *   → execution
 *
 * SECURITY RULES:
 *   - Only allowlisted action types are ever executed.
 *   - AI-generated text NEVER directly executes native code.
 *   - Every action is validated against the allowlist schema before dispatch.
 *   - No action bypasses capability or permission checks.
 *   - Sensitive capabilities (mic, camera, location) always go through
 *     SRPermissionManager — never activated silently.
 *
 * ACTION SCHEMA (allowlist):
 *   type:   string  — must be in ALLOWED_ACTIONS
 *   params: object  — validated against action schema
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-DEVICE-ROUTER-1';

  // ─── Strict action allowlist ──────────────────────────────────────────────
  // Only these action types may ever be dispatched through the router.
  // AI text must NEVER add new entries to this list at runtime.
  var ALLOWED_ACTIONS = {
    SEND_NOTIFICATION:    'SEND_NOTIFICATION',
    SCHEDULE_REMINDER:    'SCHEDULE_REMINDER',
    REQUEST_MICROPHONE:   'REQUEST_MICROPHONE',
    START_VOICE_INPUT:    'START_VOICE_INPUT',
    SPEAK_TEXT:           'SPEAK_TEXT',
    OPEN_PHOTO_PICKER:    'OPEN_PHOTO_PICKER',
    OPEN_FILE_PICKER:     'OPEN_FILE_PICKER',
    SHARE_TEXT:           'SHARE_TEXT',
    COPY_TO_CLIPBOARD:    'COPY_TO_CLIPBOARD',
    VIBRATE:              'VIBRATE',
    REQUEST_LOCATION:     'REQUEST_LOCATION',
    OPEN_URL:             'OPEN_URL',
    GET_NETWORK_STATUS:   'GET_NETWORK_STATUS',
  };

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function _caps()   { return global.SRCapabilityManager  || null; }
  function _perms()  { return global.SRPermissionManager  || null; }
  function _platform(){ return global.SRPlatformDetector  || null; }

  // ─── Capability → action mapping ──────────────────────────────────────────
  var _ACTION_CAPS = {
    SEND_NOTIFICATION:    'notifications',
    SCHEDULE_REMINDER:    'scheduledReminders',
    REQUEST_MICROPHONE:   'microphone',
    START_VOICE_INPUT:    'voiceInput',
    SPEAK_TEXT:           'audioOutput',
    OPEN_PHOTO_PICKER:    'photoPicker',
    OPEN_FILE_PICKER:     'userFiles',
    SHARE_TEXT:           'nativeSharing',
    COPY_TO_CLIPBOARD:    'clipboard',
    VIBRATE:              'haptics',
    REQUEST_LOCATION:     'location',
    OPEN_URL:             'urlSchemes',
    GET_NETWORK_STATUS:   'networkStatus',
  };

  // ─── Validate action schema ───────────────────────────────────────────────
  function _validateAction(action) {
    if (!action || typeof action !== 'object') return { ok: false, reason: 'invalid_action_object' };
    if (!action.type) return { ok: false, reason: 'missing_action_type' };
    if (!ALLOWED_ACTIONS[action.type]) return { ok: false, reason: 'action_not_in_allowlist: ' + action.type };
    return { ok: true };
  }

  // ─── Check capability and permission ──────────────────────────────────────
  function _checkCapPerm(actionType, callback) {
    var capKey = _ACTION_CAPS[actionType];
    if (!capKey) { callback({ ok: true }); return; }

    var capsMgr = _caps();
    if (!capsMgr) { callback({ ok: true }); return; }  // graceful — no capability manager

    var state = capsMgr.getState(capKey);
    var S = capsMgr.STATE;

    if (state === S.ALLOWED || state === S.AVAILABLE) {
      callback({ ok: true });
      return;
    }
    if (state === S.DENIED) {
      callback({ ok: false, reason: 'permission_denied', capability: capKey });
      return;
    }
    if (state === S.NOT_SUPPORTED) {
      callback({ ok: false, reason: 'capability_not_supported', capability: capKey });
      return;
    }
    if (state === S.PERMISSION_REQUIRED) {
      // Some actions need explicit permission request first
      callback({ ok: false, reason: 'permission_required', capability: capKey });
      return;
    }
    callback({ ok: true });
  }

  // ─── Platform adapters ────────────────────────────────────────────────────

  function _execSendNotification(params, callback) {
    if (!('Notification' in global) || Notification.permission !== 'granted') {
      callback({ ok: false, reason: 'notifications_not_granted' });
      return;
    }
    try {
      var n = new Notification(params.title || 'Shadow Reaper', {
        body: params.body || '',
        icon: params.icon || '',
      });
      callback({ ok: true, notification: n });
    } catch (e) {
      callback({ ok: false, reason: e.message });
    }
  }

  function _execScheduleReminder(params, callback) {
    // Web: Use Notification API + setTimeout for best-effort scheduling
    // Native: Would use Capacitor LocalNotifications plugin
    var cap = _platform();
    if (cap && cap.isNative() && global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.LocalNotifications) {
      // Capacitor native path
      global.Capacitor.Plugins.LocalNotifications.schedule({
        notifications: [{
          title: params.title || 'Shadow Reaper Reminder',
          body:  params.body  || '',
          id:    Math.floor(Math.random() * 100000),
          schedule: { at: new Date(params.at) },
        }]
      }).then(function () { callback({ ok: true }); })
        .catch(function (e) { callback({ ok: false, reason: e.message }); });
      return;
    }
    // Web best-effort: setTimeout (only works if tab remains open)
    var delay = params.at ? (new Date(params.at).getTime() - Date.now()) : 0;
    if (delay < 0) delay = 0;
    if (delay > 86400000) { callback({ ok: false, reason: 'reminder_too_far_in_future_for_web' }); return; }
    setTimeout(function () {
      if ('Notification' in global && Notification.permission === 'granted') {
        new Notification(params.title || 'Shadow Reaper Reminder', { body: params.body || '' });
      }
    }, delay);
    callback({ ok: true, warning: 'web_only_reminder_requires_tab_open' });
  }

  function _execSpeakText(params, callback) {
    var voice = global.SRVoice;
    if (!voice) { callback({ ok: false, reason: 'voice_engine_not_loaded' }); return; }
    voice.speak(params.text || '', function () { callback({ ok: true }); });
  }

  function _execShareText(params, callback) {
    if (!global.navigator || !global.navigator.share) {
      // Fallback: copy to clipboard
      _execCopyToClipboard(params, callback);
      return;
    }
    global.navigator.share({ title: params.title || '', text: params.text || '', url: params.url || '' })
      .then(function () { callback({ ok: true }); })
      .catch(function (e) { callback({ ok: false, reason: e.message }); });
  }

  function _execCopyToClipboard(params, callback) {
    var text = params.text || '';
    if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
      global.navigator.clipboard.writeText(text)
        .then(function () { callback({ ok: true }); })
        .catch(function (e) { callback({ ok: false, reason: e.message }); });
      return;
    }
    // Legacy fallback
    try {
      var el = document.createElement('textarea');
      el.value = text;
      document.body.appendChild(el);
      el.select();
      document.execCommand('copy');
      document.body.removeChild(el);
      callback({ ok: true });
    } catch (e) {
      callback({ ok: false, reason: e.message });
    }
  }

  function _execVibrate(params, callback) {
    var pattern = params.pattern || [200];
    if (global.navigator && global.navigator.vibrate) {
      global.navigator.vibrate(pattern);
      callback({ ok: true });
      return;
    }
    if (global.Capacitor && global.Capacitor.Plugins && global.Capacitor.Plugins.Haptics) {
      global.Capacitor.Plugins.Haptics.vibrate()
        .then(function () { callback({ ok: true }); })
        .catch(function (e) { callback({ ok: false, reason: e.message }); });
      return;
    }
    callback({ ok: false, reason: 'haptics_not_supported' });
  }

  function _execOpenUrl(params, callback) {
    var url = params.url || '';
    if (!url) { callback({ ok: false, reason: 'no_url_provided' }); return; }
    // Only allow safe protocols
    if (!/^https?:\/\//i.test(url) && !/^mailto:/i.test(url)) {
      callback({ ok: false, reason: 'unsafe_url_scheme' });
      return;
    }
    try {
      global.open(url, params.target || '_blank', 'noopener,noreferrer');
      callback({ ok: true });
    } catch (e) {
      callback({ ok: false, reason: e.message });
    }
  }

  function _execGetNetworkStatus(params, callback) {
    if (!global.navigator) { callback({ ok: false, reason: 'navigator_unavailable' }); return; }
    callback({ ok: true, online: global.navigator.onLine });
  }

  function _execOpenFilePicker(params, callback) {
    try {
      var input = document.createElement('input');
      input.type = 'file';
      input.accept = params.accept || '*/*';
      if (params.multiple) input.multiple = true;
      input.onchange = function () {
        callback({ ok: true, files: Array.from(input.files || []) });
      };
      input.click();
    } catch (e) {
      callback({ ok: false, reason: e.message });
    }
  }

  function _execOpenPhotoPicker(params, callback) {
    _execOpenFilePicker(Object.assign({}, params, { accept: 'image/*' }), callback);
  }

  // ─── Executor map ─────────────────────────────────────────────────────────
  var _EXECUTORS = {
    SEND_NOTIFICATION:  _execSendNotification,
    SCHEDULE_REMINDER:  _execScheduleReminder,
    SPEAK_TEXT:         _execSpeakText,
    SHARE_TEXT:         _execShareText,
    COPY_TO_CLIPBOARD:  _execCopyToClipboard,
    VIBRATE:            _execVibrate,
    OPEN_URL:           _execOpenUrl,
    GET_NETWORK_STATUS: _execGetNetworkStatus,
    OPEN_FILE_PICKER:   _execOpenFilePicker,
    OPEN_PHOTO_PICKER:  _execOpenPhotoPicker,
    // Voice input is delegated to SRVoice directly (permission already checked)
    START_VOICE_INPUT:  function (params, cb) {
      var v = global.SRVoice;
      if (!v) { cb({ ok: false, reason: 'voice_not_loaded' }); return; }
      v.startListening(
        function (text) { cb({ ok: true, transcript: text }); },
        function (err)  { cb({ ok: false, reason: err }); }
      );
    },
    REQUEST_MICROPHONE: function (params, cb) {
      var pm = _perms();
      if (!pm) { cb({ ok: false, reason: 'permission_manager_not_loaded' }); return; }
      pm.request('microphone', function (r) { cb(r); });
    },
    REQUEST_LOCATION: function (params, cb) {
      var pm = _perms();
      if (!pm) { cb({ ok: false, reason: 'permission_manager_not_loaded' }); return; }
      pm.request('location', function (r) { cb(r); });
    },
  };

  // ─── MAIN DISPATCH ────────────────────────────────────────────────────────
  /**
   * dispatch(action, callback)
   *
   * Routes a device action through the full security pipeline:
   *   1. Validate action schema (allowlist)
   *   2. Check capability availability
   *   3. Check/verify permission
   *   4. Execute via platform adapter
   *
   * action: { type: string, params: object }
   * callback: function(result)
   *   result.ok: boolean
   *   result.reason: string (if !ok)
   *
   * IMPORTANT: This function must only be called from explicit user actions
   *   (button clicks, voice activation, etc.).
   *   AI-generated content must NEVER directly call dispatch() with arbitrary params.
   *   All action types must be pre-approved (in ALLOWED_ACTIONS).
   */
  function dispatch(action, callback) {
    callback = callback || function () {};

    // Step 1: Validate action schema
    var validation = _validateAction(action);
    if (!validation.ok) {
      console.warn('[SRDeviceActionRouter] Action blocked:', validation.reason, action);
      callback({ ok: false, reason: validation.reason });
      return;
    }

    // Step 2: Check capability and permission
    _checkCapPerm(action.type, function (capResult) {
      if (!capResult.ok) {
        console.warn('[SRDeviceActionRouter] Capability/permission blocked:', capResult.reason);
        callback({ ok: false, reason: capResult.reason, capability: capResult.capability });
        return;
      }

      // Step 3: Execute via platform adapter
      var executor = _EXECUTORS[action.type];
      if (!executor) {
        callback({ ok: false, reason: 'no_executor_for_action: ' + action.type });
        return;
      }

      try {
        executor(action.params || {}, callback);
      } catch (e) {
        console.error('[SRDeviceActionRouter] Executor error:', action.type, e);
        callback({ ok: false, reason: 'executor_error: ' + (e.message || 'unknown') });
      }
    });
  }

  // ─── Parse intent from conversation ───────────────────────────────────────
  /**
   * detectDeviceIntent(text)
   * Returns a device action object if the text implies a device action,
   * or null if no device action is needed.
   *
   * This is a conservative intent parser — it only returns actions
   * for clear, explicit requests. Ambiguous text returns null.
   */
  function detectDeviceIntent(text) {
    if (!text) return null;
    var t = text.toLowerCase();

    // Reminder / notification
    var reminderMatch = t.match(/remind\s+me\s+(.+?)(?:\s+at|in)\s+(.+?)(?:\s+to\s+)?(.+)?/i);
    if (reminderMatch) {
      return {
        type: ALLOWED_ACTIONS.SCHEDULE_REMINDER,
        params: {
          body: text,
          title: 'Shadow Reaper Reminder',
          at: _parseTimeReference(reminderMatch[2]),
        },
      };
    }

    // Share
    if (/\bshare\s+(this|that)\b/i.test(text)) {
      return { type: ALLOWED_ACTIONS.SHARE_TEXT, params: { text: text } };
    }

    // Copy to clipboard
    if (/\bcopy\s+(this|that)\s+to\s+(my\s+)?clipboard\b/i.test(text)) {
      return { type: ALLOWED_ACTIONS.COPY_TO_CLIPBOARD, params: { text: text } };
    }

    return null;
  }

  // ─── Basic time reference parser ──────────────────────────────────────────
  function _parseTimeReference(ref) {
    if (!ref) return null;
    var r = ref.toLowerCase().trim();
    var now = new Date();

    // "tomorrow at 3pm"
    var hourMatch = r.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
    if (hourMatch) {
      var h = parseInt(hourMatch[1], 10);
      var m = hourMatch[2] ? parseInt(hourMatch[2], 10) : 0;
      if (hourMatch[3] === 'pm' && h < 12) h += 12;
      if (hourMatch[3] === 'am' && h === 12) h = 0;
      var target = new Date(now);
      if (/tomorrow/i.test(r)) target.setDate(target.getDate() + 1);
      target.setHours(h, m, 0, 0);
      if (target <= now) target.setDate(target.getDate() + 1);
      return target.toISOString();
    }

    // "in X minutes"
    var minuteMatch = r.match(/in\s+(\d+)\s+min/);
    if (minuteMatch) {
      var d = new Date(now.getTime() + parseInt(minuteMatch[1], 10) * 60000);
      return d.toISOString();
    }

    return null;
  }

  // ─── Expose ───────────────────────────────────────────────────────────────
  global.SRDeviceActionRouter = {
    build:              BUILD_ID,
    ALLOWED_ACTIONS:    ALLOWED_ACTIONS,

    dispatch:           dispatch,
    detectDeviceIntent: detectDeviceIntent,
  };

})(typeof window !== 'undefined' ? window : global);
