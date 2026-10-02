/**
 * shadow-reaper-v2/devices/adapters/hue-adapter.js
 * Shadow Reaper V2 — Philips Hue Light Adapter
 *
 * Build: SR-V2-DEVICES-2
 *
 * Exposes: window.SRHueAdapter
 *
 * PURPOSE — STAGE 11:
 *   Adapter for Philips Hue smart lights using the official Hue Bridge local API (v2).
 *   Communicates with the Hue Bridge on the local network.
 *   NO plaintext credentials in source code.
 *
 * API:
 *   The Hue Bridge exposes a local HTTPS REST API.
 *   Authentication: API key (called "username" in Hue API) is generated at pairing
 *   and stored in device metadata (encrypted at rest by the app, NOT in source).
 *
 * LOCAL ONLY:
 *   Local Hue API v2 is available only on the same Wi-Fi as the bridge.
 *   Philips Hue also offers a Remote API via Hue Entertainment Cloud.
 *   Remote API requires OAuth — not implemented in this release; reports NOT_SUPPORTED.
 *
 * PAIRING FLOW:
 *   1. User adds Hue device in Shadow Edition
 *   2. User presses the physical Link button on the Hue Bridge
 *   3. Shadow Edition calls /api with devicetype to get an API key
 *   4. API key stored in device metadata (not in source or frontend JS)
 *   5. Device registered in SRDeviceRegistry
 *
 * REAL DEVICE STATUS:
 *   ARCHITECTURE COMPLETE. Uses real Hue Bridge local API endpoints.
 *   Requires: physical Hue Bridge, API key from pairing, same Wi-Fi.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-V2-DEVICES-2';

  // ── Hue capabilities ──────────────────────────────────────────────────────
  var HUE_CAPABILITIES = [
    'power_on', 'power_off',
    'brightness_up', 'brightness_down', 'brightness_set',
    'color_set',
    'status',
  ];

  // ── Execute action ────────────────────────────────────────────────────────

  /**
   * execute(device, action, params, callback)
   * Required by SRDeviceActionRouter adapter contract.
   *
   * device.metadata must contain:
   *   localUrl:   'https://192.168.1.x'  (Hue Bridge IP)
   *   apiKey:     string (generated at pairing — NOT stored in source)
   *   lightId:    string (Hue light resource ID)
   */
  function execute(device, action, params, callback) {
    var RESULT = global.SRDeviceActionRouter
      ? global.SRDeviceActionRouter.RESULT
      : { SUCCESS: 'SUCCESS', FAILED: 'FAILED', OFFLINE: 'OFFLINE',
          NOT_SUPPORTED: 'NOT_SUPPORTED', NOT_AUTHORIZED: 'NOT_AUTHORIZED' };

    var meta = device.metadata || {};
    if (!meta.localUrl || !meta.apiKey || !meta.lightId) {
      callback({
        result:  RESULT.NOT_SUPPORTED,
        message: device.friendlyName + ' — missing Hue Bridge configuration. ' +
                 'Provide localUrl, apiKey, and lightId in device metadata.',
      });
      return;
    }

    var baseUrl = meta.localUrl.replace(/\/$/, '');
    var apiKey  = meta.apiKey;
    var lightId = meta.lightId;
    var apiBase = baseUrl + '/api/' + apiKey + '/lights/' + lightId;

    switch (action) {
      case 'power_on':
        _hueSet(apiBase + '/state', { on: true }, device, RESULT, callback);
        break;

      case 'power_off':
        _hueSet(apiBase + '/state', { on: false }, device, RESULT, callback);
        break;

      case 'brightness_up':
        // Hue bri: 0-254; step up by 30 (use relative increase in v2 API)
        _hueSet(apiBase + '/state', { on: true, bri_inc: 30 }, device, RESULT, callback);
        break;

      case 'brightness_down':
        _hueSet(apiBase + '/state', { bri_inc: -30 }, device, RESULT, callback);
        break;

      case 'brightness_set':
        // params.brightness: 0-100 (mapped to 0-254)
        var bri = Math.round((Math.min(100, Math.max(0, params.brightness || 50)) / 100) * 254);
        _hueSet(apiBase + '/state', { on: true, bri: bri }, device, RESULT, callback);
        break;

      case 'color_set':
        // params.color: 'red', 'blue', 'warm', 'cool', or hue:0-65535
        var hueVal = _colorToHue(params.color || 'white');
        if (hueVal === null) {
          callback({ result: RESULT.NOT_SUPPORTED, message: 'Unknown color: ' + params.color });
          return;
        }
        _hueSet(apiBase + '/state', { on: true, hue: hueVal, sat: 200, bri: 200 }, device, RESULT, callback);
        break;

      case 'status':
        _hueGet(apiBase, device, RESULT, callback);
        break;

      default:
        callback({ result: RESULT.NOT_SUPPORTED, message: 'Hue does not support: ' + action });
    }
  }

  function _colorToHue(colorName) {
    var map = {
      red:     0,
      orange:  6000,
      yellow:  12750,
      green:   25500,
      cyan:    35000,
      blue:    46920,
      purple:  56100,
      magenta: 60000,
      pink:    58000,
      white:   null,  // white = no hue saturation
      warm:    null,
      cool:    null,
    };
    return colorName in map ? map[colorName] : null;
  }

  function _hueSet(url, body, device, RESULT, callback) {
    var fetchFn = global.fetch;
    if (!fetchFn) {
      callback({ result: RESULT.NOT_SUPPORTED, message: 'HTTP client not available.' });
      return;
    }

    var timeoutId = setTimeout(function () {
      callback({ result: RESULT.OFFLINE, message: device.friendlyName + ' Hue Bridge did not respond.' });
    }, 6000);

    fetchFn(url, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify(body),
    })
      .then(function (resp) {
        clearTimeout(timeoutId);
        return resp.json().then(function (data) {
          // Hue returns an array of success/error objects
          if (Array.isArray(data) && data[0] && data[0].success) {
            callback({ result: RESULT.SUCCESS, message: 'Done.' });
          } else if (Array.isArray(data) && data[0] && data[0].error) {
            var err = data[0].error;
            if (err.type === 1) {
              callback({ result: RESULT.NOT_AUTHORIZED, message: 'Hue API key is invalid.' });
            } else {
              callback({ result: RESULT.FAILED, message: 'Hue error: ' + (err.description || 'unknown') });
            }
          } else {
            callback({ result: RESULT.SUCCESS, message: 'Done.' });
          }
        });
      })
      .catch(function () {
        clearTimeout(timeoutId);
        callback({ result: RESULT.OFFLINE, message: device.friendlyName + ' Hue Bridge is unreachable.' });
      });
  }

  function _hueGet(url, device, RESULT, callback) {
    var fetchFn = global.fetch;
    if (!fetchFn) {
      callback({ result: RESULT.NOT_SUPPORTED, message: 'HTTP client not available.' });
      return;
    }

    var timeoutId = setTimeout(function () {
      callback({ result: RESULT.OFFLINE, message: device.friendlyName + ' Hue Bridge did not respond.' });
    }, 6000);

    fetchFn(url, { method: 'GET' })
      .then(function (resp) {
        clearTimeout(timeoutId);
        return resp.json().then(function (data) {
          callback({
            result:  RESULT.SUCCESS,
            message: 'Light status retrieved.',
            data: {
              on:         data.state && data.state.on,
              brightness: data.state && Math.round((data.state.bri / 254) * 100),
              reachable:  data.state && data.state.reachable,
              name:       data.name,
            },
          });
        });
      })
      .catch(function () {
        clearTimeout(timeoutId);
        callback({ result: RESULT.OFFLINE, message: device.friendlyName + ' Hue Bridge is unreachable.' });
      });
  }

  // ── Pairing helper ────────────────────────────────────────────────────────

  /**
   * createPairingRecord(friendlyName, bridgeIp, apiKey, lightId)
   * bridgeIp: '192.168.1.x'
   * apiKey:   generated by pressing the Bridge link button (NOT in source)
   * lightId:  '1', '2', etc. from /api/<key>/lights
   */
  function createPairingRecord(friendlyName, bridgeIp, apiKey, lightId) {
    return {
      friendlyName:   friendlyName || 'Hue Light',
      deviceType:     'SMART_LIGHT',
      connectionType: 'LOCAL_NETWORK',
      capabilities:   HUE_CAPABILITIES.slice(),
      permissionLevel: 'STANDARD',
      metadata: {
        localUrl:      bridgeIp ? 'https://' + bridgeIp : null,
        apiKey:        apiKey || null,   // From Hue pairing — NOT a plaintext password
        lightId:       lightId || null,
        adapterType:   'PHILIPS_HUE',
        remoteSupport: false,            // Local only in this release
      },
    };
  }

  // ── Mock adapter for testing ──────────────────────────────────────────────

  var MOCK_ADAPTER = {
    type: 'MOCK_HUE',
    execute: function (device, action, params, callback) {
      var RESULT = global.SRDeviceActionRouter
        ? global.SRDeviceActionRouter.RESULT
        : { SUCCESS: 'SUCCESS', NOT_SUPPORTED: 'NOT_SUPPORTED' };

      if (HUE_CAPABILITIES.indexOf(action) === -1) {
        callback({ result: RESULT.NOT_SUPPORTED, message: '[MOCK Hue] Unsupported: ' + action });
        return;
      }
      setTimeout(function () {
        callback({
          result:  RESULT.SUCCESS,
          message: '[MOCK Hue] ' + action + ' on ' + device.friendlyName + ' — simulated.',
          data:    { mock: true },
        });
      }, 30);
    },
  };

  // ── Expose ────────────────────────────────────────────────────────────────

  global.SRHueAdapter = {
    build:            BUILD_ID,
    HUE_CAPABILITIES: HUE_CAPABILITIES,

    // Adapter contract
    execute:          execute,

    // Pairing
    createPairingRecord: createPairingRecord,

    // Testing
    MOCK_ADAPTER: MOCK_ADAPTER,
  };

})(typeof window !== 'undefined' ? window : global);
