/**
 * shadow-reaper-v2/devices/adapters/roku-adapter.js
 * Shadow Reaper V2 — Roku Device Adapter
 *
 * Build: SR-V2-DEVICES-2
 *
 * Exposes: window.SRRokuAdapter
 *
 * PURPOSE — STAGE 11:
 *   Adapter for Roku streaming devices using the Roku External Control Protocol (ECP).
 *   ECP is Roku's official, documented local-network HTTP control API.
 *   No third-party credentials required for basic device control.
 *
 *   ECP Base URL:  http://<roku-ip>:8060/
 *
 *   All communication is LOCAL NETWORK ONLY.
 *   Roku does not currently offer an authenticated remote cloud control API
 *   for third-party apps — this adapter reports REMOTE transport as NOT_SUPPORTED.
 *
 * PAIRING:
 *   1. User adds Roku device in Shadow Edition
 *   2. User enters the Roku's local IP address
 *   3. Shadow Edition sends a test command to verify connectivity
 *   4. Device is registered in SRDeviceRegistry with localUrl in metadata
 *
 * SUPPORTED CAPABILITIES (ECP):
 *   power_on, power_off, volume_up, volume_down, mute, unmute,
 *   play, pause, next, previous, status, launch_app
 *
 * REAL DEVICE STATUS:
 *   ARCHITECTURE COMPLETE.  Integration is real (uses actual Roku ECP endpoints).
 *   Requires: same Wi-Fi network and device localUrl in metadata.
 *   Physical device required for full end-to-end test.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-V2-DEVICES-2';

  // ── Roku ECP command map ──────────────────────────────────────────────────
  // Maps Shadow action → Roku ECP endpoint
  var ECP_COMMANDS = {
    power_on:     { method: 'POST', path: '/keypress/Power' },
    power_off:    { method: 'POST', path: '/keypress/Power' },
    volume_up:    { method: 'POST', path: '/keypress/VolumeUp' },
    volume_down:  { method: 'POST', path: '/keypress/VolumeDown' },
    mute:         { method: 'POST', path: '/keypress/VolumeMute' },
    unmute:       { method: 'POST', path: '/keypress/VolumeMute' },
    play:         { method: 'POST', path: '/keypress/Play' },
    pause:        { method: 'POST', path: '/keypress/Play' },  // ECP uses Play as toggle
    stop:         { method: 'POST', path: '/keypress/Back' },
    next:         { method: 'POST', path: '/keypress/Fwd' },
    previous:     { method: 'POST', path: '/keypress/Rev' },
    status:       { method: 'GET',  path: '/query/device-info' },
  };

  // ── Roku channel IDs for launch_app ───────────────────────────────────────
  var ROKU_CHANNEL_IDS = {
    netflix:   '12',
    youtube:   '2285',
    spotify:   '22297',
    hulu:      '2285',  // example
    amazon:    '13',
    disney:    '291097',
    twitch:    '67111',
    plex:      '13535',
    hbo:       '61322',
    peacock:   '593099',
  };

  // ── Capabilities advertised by this adapter ───────────────────────────────
  var ROKU_CAPABILITIES = [
    'power_on', 'power_off',
    'volume_up', 'volume_down', 'mute', 'unmute',
    'play', 'pause', 'stop', 'next', 'previous',
    'launch_app',
    'status',
  ];

  // ── Execute action ────────────────────────────────────────────────────────

  /**
   * execute(device, action, params, callback)
   * Required by SRDeviceActionRouter adapter contract.
   *
   * device.metadata.localUrl must be set (e.g. 'http://192.168.1.55:8060')
   */
  function execute(device, action, params, callback) {
    var RESULT = global.SRDeviceActionRouter
      ? global.SRDeviceActionRouter.RESULT
      : { SUCCESS: 'SUCCESS', FAILED: 'FAILED', OFFLINE: 'OFFLINE', NOT_SUPPORTED: 'NOT_SUPPORTED' };

    var localUrl = device.metadata && device.metadata.localUrl;
    if (!localUrl) {
      callback({
        result:  RESULT.NOT_SUPPORTED,
        message: device.friendlyName + ' — no local IP configured. Please edit the device and add the Roku IP address.',
      });
      return;
    }

    // launch_app: special handling
    if (action === 'launch_app') {
      var appName = (params.application || '').toLowerCase();
      var channelId = ROKU_CHANNEL_IDS[appName];
      if (!channelId) {
        callback({
          result:  RESULT.NOT_SUPPORTED,
          message: '"' + params.application + '" is not in the known Roku channel list.',
        });
        return;
      }
      _ecpRequest(localUrl, 'POST', '/launch/' + channelId, device, callback, RESULT);
      return;
    }

    var cmd = ECP_COMMANDS[action];
    if (!cmd) {
      callback({ result: RESULT.NOT_SUPPORTED, message: 'Roku does not support: ' + action });
      return;
    }

    _ecpRequest(localUrl, cmd.method, cmd.path, device, callback, RESULT);
  }

  function _ecpRequest(localUrl, method, path, device, callback, RESULT) {
    var fetchFn = global.fetch;
    if (!fetchFn) {
      callback({ result: RESULT.NOT_SUPPORTED, message: 'HTTP client not available.' });
      return;
    }

    var url = localUrl.replace(/\/$/, '') + path;

    var timeoutId = setTimeout(function () {
      callback({
        result:  RESULT.OFFLINE,
        message: device.friendlyName + ' did not respond. Check that the Roku is on the same Wi-Fi.',
      });
    }, 6000);

    fetchFn(url, {
      method: method,
      headers: method === 'POST' ? { 'Content-Length': '0' } : {},
    })
      .then(function (resp) {
        clearTimeout(timeoutId);
        if (resp.ok || resp.status === 200 || resp.status === 204) {
          callback({ result: RESULT.SUCCESS, message: 'Done.' });
        } else {
          callback({ result: RESULT.FAILED, message: 'Roku returned HTTP ' + resp.status });
        }
      })
      .catch(function () {
        clearTimeout(timeoutId);
        callback({
          result:  RESULT.OFFLINE,
          message: device.friendlyName + ' is not reachable. Ensure it is on the same Wi-Fi.',
        });
      });
  }

  // ── Pairing helper ────────────────────────────────────────────────────────

  /**
   * createPairingRecord(friendlyName, localIp)
   * Returns a device record for SRDeviceRegistry.registerDevice().
   *
   * localIp: e.g. '192.168.1.55' (user provides this)
   */
  function createPairingRecord(friendlyName, localIp) {
    return {
      friendlyName:   friendlyName || 'Roku',
      deviceType:     'MEDIA_PLAYER',
      connectionType: 'LOCAL_NETWORK',
      capabilities:   ROKU_CAPABILITIES.slice(),
      permissionLevel: 'STANDARD',
      metadata: {
        localUrl:       localIp ? 'http://' + localIp + ':8060' : null,
        adapterType:    'ROKU_ECP',
        remoteSupport:  false,   // Roku ECP is local-network only
      },
    };
  }

  // ── Mock adapter for testing ──────────────────────────────────────────────

  var MOCK_ADAPTER = {
    type: 'MOCK_ROKU',
    execute: function (device, action, params, callback) {
      var RESULT = global.SRDeviceActionRouter
        ? global.SRDeviceActionRouter.RESULT
        : { SUCCESS: 'SUCCESS', NOT_SUPPORTED: 'NOT_SUPPORTED' };

      if (ROKU_CAPABILITIES.indexOf(action) === -1) {
        callback({ result: RESULT.NOT_SUPPORTED, message: '[MOCK Roku] Unsupported: ' + action });
        return;
      }
      setTimeout(function () {
        callback({
          result:  RESULT.SUCCESS,
          message: '[MOCK Roku] ' + action + ' on ' + device.friendlyName + ' — simulated.',
          data:    { mock: true },
        });
      }, 30);
    },
  };

  // ── Expose ────────────────────────────────────────────────────────────────

  global.SRRokuAdapter = {
    build:             BUILD_ID,
    ROKU_CAPABILITIES: ROKU_CAPABILITIES,
    ECP_COMMANDS:      ECP_COMMANDS,
    ROKU_CHANNEL_IDS:  ROKU_CHANNEL_IDS,

    // Adapter contract
    execute:           execute,

    // Pairing
    createPairingRecord: createPairingRecord,

    // Testing
    MOCK_ADAPTER: MOCK_ADAPTER,
  };

})(typeof window !== 'undefined' ? window : global);
