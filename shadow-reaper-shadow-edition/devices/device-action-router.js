/**
 * shadow-reaper-v2/devices/device-action-router.js
 * Shadow Reaper V2 — Device Action Router
 *
 * Build: SR-V2-DEVICES-1
 *
 * Exposes: window.SRDeviceActionRouter
 *
 * PURPOSE:
 *   Receives structured device intents from Shadow Reaper (via ShadowReaper.ask())
 *   and routes them to the correct authorized device adapter.
 *
 *   The language model / Shadow Reaper brain does NOT directly execute
 *   operating-system commands.  All actions must pass through this router,
 *   which enforces:
 *     - device is registered and paired
 *     - action is in the device's capability allowlist
 *     - device has sufficient permission level for the action
 *     - high-impact actions require confirmation before execution
 *
 * RESULT CODES:
 *   SUCCESS              — action completed
 *   FAILED               — adapter reported failure
 *   OFFLINE              — device is unreachable
 *   NOT_SUPPORTED        — device does not support this action
 *   NOT_AUTHORIZED       — permission level insufficient
 *   NOT_FOUND            — no device matched the intent
 *   CONFIRMATION_REQUIRED — action needs owner confirmation before execution
 *   PENDING_CONFIRMATION  — waiting for owner to confirm (internal state)
 *   CONFIRMATION_EXPIRED  — confirmation timed out
 *   CONFIRMATION_REJECTED — owner said no
 *
 * CONFIRMATION SYSTEM:
 *   High-impact actions (ELEVATED permission level) require confirmation.
 *   A pending confirmation is stored with a timeout.  It is only resolved
 *   by an explicit "yes" / "confirm" follow-up — never by unrelated conversation.
 *   Confirmations expire after CONFIRMATION_TIMEOUT_MS.
 *
 * ADAPTER REGISTRATION:
 *   Adapters are registered per-device-type via registerAdapter().
 *   Each adapter must implement: execute(device, action, params, callback).
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-V2-DEVICES-2';

  // ── Result codes ──────────────────────────────────────────────────────────
  var RESULT = {
    SUCCESS:               'SUCCESS',
    FAILED:                'FAILED',
    OFFLINE:               'OFFLINE',
    NOT_SUPPORTED:         'NOT_SUPPORTED',
    NOT_AUTHORIZED:        'NOT_AUTHORIZED',
    NOT_FOUND:             'NOT_FOUND',
    CONFIRMATION_REQUIRED: 'CONFIRMATION_REQUIRED',
    PENDING_CONFIRMATION:  'PENDING_CONFIRMATION',
    CONFIRMATION_EXPIRED:  'CONFIRMATION_EXPIRED',
    CONFIRMATION_REJECTED: 'CONFIRMATION_REJECTED',
  };

  // ── Actions that require owner confirmation ──────────────────────────────
  // Any action in this list will pause and ask "Are you sure?" before executing.
  var HIGH_IMPACT_ACTIONS = [
    'shutdown',
    'restart',
    'sleep',     // "sleep" on computer is moderate; still require confirm
    'lock',      // locking a computer is fine but confirm for safety
    'factory_reset',
    'delete_files',
    'uninstall',
  ];

  // Some actions are ALWAYS safe without confirmation
  var SAFE_ACTIONS = [
    'volume_up', 'volume_down', 'volume_set', 'mute', 'unmute',
    'play', 'pause', 'stop', 'next', 'previous',
    'power_on', 'power_off',     // TV/lights power on/off is low-risk
    'brightness_up', 'brightness_down', 'brightness_set',
    'open_application',
    'close_application',
    'media_play', 'media_pause',
    'launch_website',
    'status',
    'battery_status',
    'lock_screen',               // locking screen (not OS lock = shutdown)
  ];

  var CONFIRMATION_TIMEOUT_MS = 30000;  // 30 seconds to confirm

  // ── Internal state ────────────────────────────────────────────────────────
  var _adapters             = {};   // deviceType → adapter object
  var _pendingConfirmation  = null; // { deviceId, action, params, timer, callback, commandId }

  // ─── Adapter registration ─────────────────────────────────────────────────

  /**
   * registerAdapter(deviceType, adapter)
   *
   * adapter must implement:
   *   execute(device, action, params, callback)
   *     → callback({ result: RESULT_CODE, message: string, data: any })
   *
   *   isOnline(device, callback) — optional, for status check
   */
  function registerAdapter(deviceType, adapter) {
    if (!deviceType || !adapter || typeof adapter.execute !== 'function') {
      throw new Error('[SRDeviceActionRouter] registerAdapter: deviceType and adapter.execute() are required.');
    }
    _adapters[deviceType] = adapter;
  }

  function getAdapter(deviceType) {
    return _adapters[deviceType] || null;
  }

  // ─── Action requires confirmation? ───────────────────────────────────────

  function _requiresConfirmation(action) {
    var lower = (action || '').toLowerCase();
    return HIGH_IMPACT_ACTIONS.indexOf(lower) !== -1;
  }

  // ─── Route a device action ────────────────────────────────────────────────

  /**
   * route(intent, callback)
   *
   * intent = {
   *   deviceId:     string  (optional — if known from resolution)
   *   deviceName:   string  (optional — friendly name, used for lookup)
   *   deviceType:   string  (optional — used if deviceId/name not given)
   *   action:       string  (required) — e.g. 'volume_down', 'open_application'
   *   params:       object  (optional) — e.g. { application: 'Spotify' }
   * }
   *
   * callback = fn({ result, message, device, action, data })
   *
   * This is the single enforcement point.  Shadow Reaper brain calls this
   * after extracting device intents from the user message.
   */
  function route(intent, callback) {
    if (!intent || !intent.action) {
      callback({ result: RESULT.FAILED, message: 'No action specified.' });
      return;
    }

    var registry = global.SRDeviceRegistry;
    if (!registry) {
      callback({ result: RESULT.FAILED, message: 'Device registry not available.' });
      return;
    }

    // ── Resolve device ──────────────────────────────────────────────────────
    var device = null;
    if (intent.deviceId) {
      device = registry.getDevice(intent.deviceId);
    } else if (intent.deviceName) {
      device = registry.getDeviceByName(intent.deviceName);
    } else if (intent.deviceType) {
      var byType = registry.getDevicesByType(intent.deviceType);
      if (byType && byType.length === 1) device = byType[0];
    }

    if (!device) {
      callback({
        result:  RESULT.NOT_FOUND,
        message: intent.deviceName
          ? '"' + intent.deviceName + '" is not a paired device.'
          : 'No matching device found.',
      });
      return;
    }

    var action = intent.action.toLowerCase();
    var params = intent.params || {};

    // ── Check capability allowlist ──────────────────────────────────────────
    if (!registry.hasCapability(device.deviceId, action)) {
      callback({
        result:  RESULT.NOT_SUPPORTED,
        message: device.friendlyName + ' does not support: ' + action,
        device:  device,
        action:  action,
      });
      return;
    }

    // ── Check permission level ──────────────────────────────────────────────
    // SAFE_ACTIONS need STANDARD; HIGH_IMPACT needs ELEVATED
    var requiredLevel = _requiresConfirmation(action)
      ? global.SRDeviceRegistry.PERMISSION_LEVELS.ELEVATED
      : global.SRDeviceRegistry.PERMISSION_LEVELS.STANDARD;

    if (!registry.isPermitted(device.deviceId, requiredLevel)) {
      callback({
        result:  RESULT.NOT_AUTHORIZED,
        message: 'Not authorized to perform "' + action + '" on ' + device.friendlyName + '.',
        device:  device,
        action:  action,
      });
      return;
    }

    // ── Check online status ─────────────────────────────────────────────────
    if (device.onlineStatus === global.SRDeviceRegistry.DEVICE_STATUS.OFFLINE) {
      callback({
        result:  RESULT.OFFLINE,
        message: device.friendlyName + ' is currently offline.',
        device:  device,
        action:  action,
      });
      return;
    }

    // ── Replay protection (Stage 9) ─────────────────────────────────────────
    // Generate a command ID for this action. If the same command ID fires
    // twice within the duplicate window, reject it.
    var commandId = null;
    var actionLog = global.SRDeviceActionLog;
    if (actionLog) {
      commandId = actionLog.generateCommandId();
      if (actionLog.isRecentDuplicate(commandId)) {
        callback({
          result:  RESULT.FAILED,
          message: 'Duplicate command detected and rejected.',
          device:  device,
          action:  action,
        });
        return;
      }
    }

    // ── Confirmation gate for high-impact actions ───────────────────────────
    if (_requiresConfirmation(action)) {
      _requestConfirmation(device, action, params, callback, commandId);
      return;
    }

    // ── Execute via adapter ─────────────────────────────────────────────────
    _executeAction(device, action, params, callback, commandId);
  }

  // ─── Confirmation system ─────────────────────────────────────────────────

  function _requestConfirmation(device, action, params, callback, commandId) {
    // Cancel any previous pending confirmation (only one at a time)
    _cancelPendingConfirmation();

    var timer = setTimeout(function () {
      _pendingConfirmation = null;
      callback({
        result:  RESULT.CONFIRMATION_EXPIRED,
        message: 'Confirmation for "' + action + '" on ' + device.friendlyName + ' timed out.',
        device:  device,
        action:  action,
      });
    }, CONFIRMATION_TIMEOUT_MS);

    _pendingConfirmation = {
      deviceId:  device.deviceId,
      device:    device,
      action:    action,
      params:    params,
      timer:     timer,
      callback:  callback,
      commandId: commandId || null,
    };

    callback({
      result:  RESULT.CONFIRMATION_REQUIRED,
      message: 'Do you want me to ' + _describeAction(device, action, params) + '?',
      device:  device,
      action:  action,
      // caller should prompt the user and call confirmAction() or rejectAction()
    });
  }

  /**
   * confirmAction()
   * Called when the user says "yes" / "confirm" after a CONFIRMATION_REQUIRED response.
   * Executes the pending high-impact action.
   */
  function confirmAction(callback) {
    if (!_pendingConfirmation) {
      if (typeof callback === 'function') {
        callback({ result: RESULT.FAILED, message: 'No action is waiting for confirmation.' });
      }
      return;
    }
    var pending = _pendingConfirmation;
    clearTimeout(pending.timer);
    _pendingConfirmation = null;
    _executeAction(pending.device, pending.action, pending.params, pending.callback, pending.commandId);
  }

  /**
   * rejectAction()
   * Called when the user says "no" / "cancel".
   */
  function rejectAction() {
    if (!_pendingConfirmation) return;
    var pending = _pendingConfirmation;
    clearTimeout(pending.timer);
    _pendingConfirmation = null;
    pending.callback({
      result:  RESULT.CONFIRMATION_REJECTED,
      message: 'Action cancelled.',
      device:  pending.device,
      action:  pending.action,
    });
  }

  function _cancelPendingConfirmation() {
    if (_pendingConfirmation) {
      clearTimeout(_pendingConfirmation.timer);
      _pendingConfirmation = null;
    }
  }

  function hasPendingConfirmation() {
    return _pendingConfirmation !== null;
  }

  function getPendingConfirmation() {
    if (!_pendingConfirmation) return null;
    return {
      deviceId: _pendingConfirmation.deviceId,
      device:   _pendingConfirmation.device,
      action:   _pendingConfirmation.action,
      params:   _pendingConfirmation.params,
    };
  }

  // ─── Execute via registered adapter ──────────────────────────────────────

  function _executeAction(device, action, params, callback, commandId) {
    var adapter = _adapters[device.deviceType];
    if (!adapter) {
      callback({
        result:  RESULT.NOT_SUPPORTED,
        message: 'No adapter registered for device type: ' + device.deviceType,
        device:  device,
        action:  action,
      });
      return;
    }

    try {
      adapter.execute(device, action, params, function (adapterResult) {
        // Update online status based on result
        if (global.SRDeviceRegistry) {
          if (adapterResult.result === RESULT.OFFLINE) {
            global.SRDeviceRegistry.updateOnlineStatus(
              device.deviceId,
              global.SRDeviceRegistry.DEVICE_STATUS.OFFLINE
            );
          } else if (adapterResult.result === RESULT.SUCCESS) {
            global.SRDeviceRegistry.updateOnlineStatus(
              device.deviceId,
              global.SRDeviceRegistry.DEVICE_STATUS.ONLINE
            );
          }
        }
        // Record to action log (Stage 8 — action history + idempotency)
        var actionLog = global.SRDeviceActionLog;
        if (actionLog && commandId) {
          actionLog.record({
            commandId:  commandId,
            deviceName: device.friendlyName,
            action:     action,
            result:     adapterResult.result,
            params:     params,
          });
        }
        callback(Object.assign({ device: device, action: action }, adapterResult));
      });
    } catch (e) {
      callback({
        result:  RESULT.FAILED,
        message: 'Adapter error: ' + (e.message || 'unknown'),
        device:  device,
        action:  action,
      });
    }
  }

  // ─── Human-readable action description ───────────────────────────────────

  function _describeAction(device, action, params) {
    var name = device.friendlyName;
    switch (action) {
      case 'shutdown':        return 'shut down ' + name;
      case 'restart':         return 'restart ' + name;
      case 'sleep':           return 'put ' + name + ' to sleep';
      case 'lock':            return 'lock ' + name;
      case 'open_application':
        return 'open ' + ((params && params.application) || 'an application') + ' on ' + name;
      case 'close_application':
        return 'close ' + ((params && params.application) || 'an application') + ' on ' + name;
      default:
        return action + ' on ' + name;
    }
  }

  /**
   * describeResult(routerResult)
   * Converts a router result object into a natural-language Shadow response.
   * This is called by ShadowReaper after routing to compose the response.
   */
  function describeResult(r) {
    if (!r) return 'Something went wrong.';
    var name = r.device ? r.device.friendlyName : 'the device';
    switch (r.result) {
      case RESULT.SUCCESS:
        return r.message || 'Done.';
      case RESULT.FAILED:
        return r.message || 'That didn\'t work.';
      case RESULT.OFFLINE:
        return name + ' is currently offline.';
      case RESULT.NOT_SUPPORTED:
        return name + ' doesn\'t support that.';
      case RESULT.NOT_AUTHORIZED:
        return 'I\'m not authorized to do that on ' + name + '.';
      case RESULT.NOT_FOUND:
        return r.message || 'I couldn\'t find that device.';
      case RESULT.CONFIRMATION_REQUIRED:
        return r.message || 'Please confirm that action.';
      case RESULT.CONFIRMATION_EXPIRED:
        return 'That confirmation timed out. Let me know if you still want to do it.';
      case RESULT.CONFIRMATION_REJECTED:
        return 'Got it. Action cancelled.';
      default:
        return r.message || 'Something went wrong.';
    }
  }

  // ─── Expose ───────────────────────────────────────────────────────────────

  global.SRDeviceActionRouter = {
    build:  BUILD_ID,
    RESULT: RESULT,
    _BUILD: BUILD_ID,

    // Adapter registration
    registerAdapter:         registerAdapter,
    getAdapter:              getAdapter,

    // Action routing
    route:                   route,

    // Confirmation system
    confirmAction:           confirmAction,
    rejectAction:            rejectAction,
    hasPendingConfirmation:  hasPendingConfirmation,
    getPendingConfirmation:  getPendingConfirmation,

    // Helpers
    describeResult:          describeResult,
    _requiresConfirmation:   _requiresConfirmation,
    _HIGH_IMPACT_ACTIONS:    HIGH_IMPACT_ACTIONS,
    _SAFE_ACTIONS:           SAFE_ACTIONS,
    _CONFIRMATION_TIMEOUT_MS: CONFIRMATION_TIMEOUT_MS,
  };

})(typeof window !== 'undefined' ? window : global);
