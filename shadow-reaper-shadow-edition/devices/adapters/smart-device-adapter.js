/**
 * shadow-reaper-v2/devices/adapters/smart-device-adapter.js
 * Shadow Reaper V2 — Smart Device Adapter Base
 *
 * Build: SR-V2-DEVICES-1
 *
 * Exposes: window.SRSmartDeviceAdapter
 *
 * PURPOSE:
 *   Base adapter interface for smart home devices:
 *     Smart TVs (Roku, Android TV, etc.)
 *     Smart lights (Hue, LIFX, etc.)
 *     Smart plugs
 *     Smart speakers
 *     Thermostats / HVAC
 *     Other smart appliances
 *
 *   Each device type can have its own integration module.
 *   This file provides:
 *     1. The base adapter interface contract
 *     2. A local-network (same Wi-Fi) adapter for LAN-compatible devices
 *     3. A cloud-API adapter stub for devices requiring manufacturer integration
 *     4. A mock adapter for architecture testing
 *
 * TWO TRANSPORT PATHS:
 *   LOCAL MODE   — same Wi-Fi: HTTP to device's local IP
 *   CLOUD MODE   — any network: manufacturer cloud API (requires OAuth/token)
 *
 * NOT every device supports both.  Each adapter reports what it actually supports.
 *
 * STATUS:
 *   FOUNDATION — interfaces and mock adapter complete.
 *   Real device control requires per-manufacturer integration modules.
 *
 * CAPABILITIES (example set — actual set varies by device/manufacturer):
 *   Smart TV:      power_on, power_off, volume_up, volume_down, mute, unmute,
 *                  play, pause, next, previous, launch_app, input_select, status
 *   Smart Light:   power_on, power_off, brightness_up, brightness_down,
 *                  brightness_set, color_set, status
 *   Smart Plug:    power_on, power_off, status
 *   Smart Speaker: play, pause, volume_up, volume_down, mute, unmute, status
 *   Thermostat:    temperature_set, mode_set, status
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-V2-DEVICES-1';

  // ── Capability sets by device type ────────────────────────────────────────

  var CAPABILITIES_BY_TYPE = {
    SMART_TV: [
      'power_on', 'power_off',
      'volume_up', 'volume_down', 'volume_set', 'mute', 'unmute',
      'play', 'pause', 'stop', 'next', 'previous',
      'launch_app', 'input_select',
      'status',
    ],
    SMART_LIGHT: [
      'power_on', 'power_off',
      'brightness_up', 'brightness_down', 'brightness_set',
      'color_set',
      'status',
    ],
    SMART_PLUG: [
      'power_on', 'power_off',
      'status',
    ],
    SMART_SPEAKER: [
      'play', 'pause', 'stop',
      'volume_up', 'volume_down', 'volume_set', 'mute', 'unmute',
      'next', 'previous',
      'status',
    ],
    THERMOSTAT: [
      'temperature_set',
      'mode_set',
      'status',
    ],
    MEDIA_PLAYER: [
      'play', 'pause', 'stop', 'next', 'previous',
      'volume_up', 'volume_down', 'mute', 'unmute',
      'status',
    ],
    GENERIC_SMART: [
      'power_on', 'power_off',
      'status',
    ],
  };

  // ─── Base adapter factory ─────────────────────────────────────────────────

  /**
   * createLocalNetworkAdapter(opts)
   * Returns an adapter that sends HTTP commands to the device on the local network.
   *
   * opts = {
   *   deviceType:  string    (required)
   *   localUrl:    string    (required) — base URL on LAN, e.g. http://192.168.1.42
   *   authHeader:  string    (optional) — e.g. 'Bearer <token>' (stored securely, not in JS)
   *   commandMap:  object    (optional) — action → { path, method, body }
   * }
   *
   * NOTE: In a browser context, same-origin or CORS must allow this request.
   * In the native Android app context, the Capacitor bridge makes the HTTP call.
   */
  function createLocalNetworkAdapter(opts) {
    var RESULT = function () {
      return global.SRDeviceActionRouter
        ? global.SRDeviceActionRouter.RESULT
        : { SUCCESS: 'SUCCESS', FAILED: 'FAILED', OFFLINE: 'OFFLINE', NOT_SUPPORTED: 'NOT_SUPPORTED' };
    };

    return {
      type: 'LOCAL_NETWORK',
      deviceType: opts.deviceType,

      execute: function (device, action, params, callback) {
        var R = RESULT();
        var commandMap = opts.commandMap || {};
        var cmd = commandMap[action];
        if (!cmd) {
          callback({ result: R.NOT_SUPPORTED, message: 'No local command mapping for: ' + action });
          return;
        }

        var url = (opts.localUrl || '') + (cmd.path || '/' + action);

        // Use fetch if available (PWA), or delegate to native bridge
        var fetchFn = global.fetch;
        if (!fetchFn) {
          callback({ result: R.NOT_SUPPORTED, message: 'HTTP client not available in this environment.' });
          return;
        }

        var fetchOpts = {
          method:  cmd.method || 'POST',
          headers: Object.assign(
            { 'Content-Type': 'application/json' },
            opts.authHeader ? { 'Authorization': opts.authHeader } : {}
          ),
        };

        if (cmd.body || (cmd.method !== 'GET' && params && Object.keys(params).length)) {
          fetchOpts.body = JSON.stringify(cmd.body || params);
        }

        var timeoutId = setTimeout(function () {
          callback({ result: R.OFFLINE, message: device.friendlyName + ' did not respond on local network.' });
        }, 8000);

        fetchFn(url, fetchOpts)
          .then(function (resp) {
            clearTimeout(timeoutId);
            if (resp.ok) {
              callback({ result: R.SUCCESS, message: 'Done.' });
            } else {
              callback({ result: R.FAILED, message: 'Device returned HTTP ' + resp.status });
            }
          })
          .catch(function (e) {
            clearTimeout(timeoutId);
            callback({ result: R.OFFLINE, message: device.friendlyName + ' is unreachable on local network.' });
          });
      },
    };
  }

  /**
   * createCloudApiAdapter(opts)
   * Returns an adapter that sends commands via a manufacturer cloud API.
   * Requires a valid OAuth token stored securely (not in frontend code).
   *
   * opts = {
   *   deviceType:  string    (required)
   *   apiBase:     string    (required) — cloud API base URL
   *   getToken:    function  (required) — fn() → string token (from secure storage)
   *   commandMap:  object    (optional)
   * }
   */
  function createCloudApiAdapter(opts) {
    var RESULT = function () {
      return global.SRDeviceActionRouter
        ? global.SRDeviceActionRouter.RESULT
        : { SUCCESS: 'SUCCESS', FAILED: 'FAILED', OFFLINE: 'OFFLINE', NOT_SUPPORTED: 'NOT_SUPPORTED', NOT_AUTHORIZED: 'NOT_AUTHORIZED' };
    };

    return {
      type: 'CLOUD_API',
      deviceType: opts.deviceType,

      execute: function (device, action, params, callback) {
        var R = RESULT();
        if (!opts.getToken || typeof opts.getToken !== 'function') {
          callback({ result: R.NOT_AUTHORIZED, message: 'No token provider registered for cloud API.' });
          return;
        }
        var token = opts.getToken();
        if (!token) {
          callback({ result: R.NOT_AUTHORIZED, message: 'Not authenticated with cloud API.' });
          return;
        }

        var commandMap = opts.commandMap || {};
        var cmd = commandMap[action];
        if (!cmd) {
          callback({ result: R.NOT_SUPPORTED, message: 'No cloud command mapping for: ' + action });
          return;
        }

        var fetchFn = global.fetch;
        if (!fetchFn) {
          callback({ result: R.NOT_SUPPORTED, message: 'HTTP client not available.' });
          return;
        }

        var url = (opts.apiBase || '') + (cmd.path || '/' + action);

        var timeoutId = setTimeout(function () {
          callback({ result: R.OFFLINE, message: 'Cloud API did not respond for ' + device.friendlyName + '.' });
        }, 12000);

        fetchFn(url, {
          method: cmd.method || 'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': 'Bearer ' + token,
          },
          body: JSON.stringify(Object.assign({ deviceId: device.metadata.cloudDeviceId }, params)),
        })
          .then(function (resp) {
            clearTimeout(timeoutId);
            if (resp.ok) {
              callback({ result: R.SUCCESS, message: 'Done.' });
            } else if (resp.status === 401 || resp.status === 403) {
              callback({ result: R.NOT_AUTHORIZED, message: 'Cloud API authentication failed.' });
            } else {
              callback({ result: R.FAILED, message: 'Cloud API returned HTTP ' + resp.status });
            }
          })
          .catch(function () {
            clearTimeout(timeoutId);
            callback({ result: R.OFFLINE, message: device.friendlyName + ' cloud API is unreachable.' });
          });
      },
    };
  }

  // ─── Mock adapter for architecture testing ────────────────────────────────
  //
  // Returns simulated SUCCESS for all supported actions.
  // Does NOT control any real device.

  var MOCK_ADAPTER = {
    type: 'MOCK',

    execute: function (device, action, params, callback) {
      var RESULT = global.SRDeviceActionRouter
        ? global.SRDeviceActionRouter.RESULT
        : { SUCCESS: 'SUCCESS', NOT_SUPPORTED: 'NOT_SUPPORTED' };

      var caps = CAPABILITIES_BY_TYPE[device.deviceType] || [];
      if (caps.indexOf(action) === -1) {
        callback({ result: RESULT.NOT_SUPPORTED, message: '[MOCK] ' + device.friendlyName + ' does not support: ' + action });
        return;
      }

      setTimeout(function () {
        callback({
          result:  RESULT.SUCCESS,
          message: '[MOCK] ' + action + ' on ' + device.friendlyName + ' — simulated success.',
          data:    { mock: true, action: action, params: params },
        });
      }, 30);
    },
  };

  /**
   * createPairingRecord(friendlyName, deviceType, connectionType, metadata)
   * Returns a device record for SRDeviceRegistry.registerDevice().
   */
  function createPairingRecord(friendlyName, deviceType, connectionType, metadata) {
    var caps = CAPABILITIES_BY_TYPE[deviceType] || CAPABILITIES_BY_TYPE.GENERIC_SMART;
    return {
      friendlyName:   friendlyName,
      deviceType:     deviceType,
      connectionType: connectionType || 'LOCAL_NETWORK',
      capabilities:   caps.slice(),
      permissionLevel: 'STANDARD',
      metadata:       metadata || {},
    };
  }

  // ─── Expose ───────────────────────────────────────────────────────────────

  global.SRSmartDeviceAdapter = {
    build:             BUILD_ID,
    CAPABILITIES_BY_TYPE: CAPABILITIES_BY_TYPE,

    createLocalNetworkAdapter: createLocalNetworkAdapter,
    createCloudApiAdapter:     createCloudApiAdapter,
    createPairingRecord:       createPairingRecord,

    // Testing
    MOCK_ADAPTER: MOCK_ADAPTER,
  };

})(typeof window !== 'undefined' ? window : global);
