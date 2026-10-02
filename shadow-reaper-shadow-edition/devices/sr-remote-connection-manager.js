/**
 * shadow-reaper-v2/devices/sr-remote-connection-manager.js
 * Shadow Reaper V2 — Remote Connection Manager
 *
 * Build: SR-V2-DEVICES-2
 *
 * Exposes: window.SRRemoteConnectionManager
 *
 * PURPOSE — STAGE 9:
 *   Manages the two transport paths for device control:
 *
 *   LOCAL PATH:
 *     Phone is on the same Wi-Fi as the target device.
 *     Commands are sent directly to the device's local IP via HTTP/WebSocket.
 *     No cloud relay needed.  Lower latency.
 *
 *   REMOTE PATH:
 *     Phone is on 5G or a different Wi-Fi.
 *     Commands are relayed through the authenticated Shadow backend relay.
 *     The Desktop Agent makes an outbound AUTHENTICATED connection to the relay.
 *     Phone → relay ↔ Desktop Agent → computer.
 *     No inbound ports required on the user's computer.
 *
 * SECURITY:
 *   - Device identity verified via pairingToken (set at pairing, never stored in frontend)
 *   - All relay traffic is over HTTPS/WSS
 *   - Short-lived session tokens, not long-term credentials in JS
 *   - Revocable: unregistering a device invalidates its relay slot
 *   - Replay protection via command IDs (see SRDeviceActionLog)
 *   - No public unauthenticated relay endpoints
 *
 * CONNECTION STATES (per device):
 *   ONLINE_LOCAL   — reachable on same LAN
 *   ONLINE_REMOTE  — reachable via secure relay
 *   CONNECTING     — establishing connection
 *   OFFLINE        — unreachable
 *   ERROR          — connection failed with error
 *   UNKNOWN        — not yet checked
 *
 * NOTE ON REAL TRANSPORT:
 *   This module manages connection state and provides the architecture.
 *   The actual WebSocket relay server is a server-side component
 *   (Shadow Backend Relay — separate deployment).
 *   Until that is deployed, the relay path uses a simulation stub that
 *   reports OFFLINE/NOT_AVAILABLE honestly.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-V2-DEVICES-2';

  // ── Connection states ──────────────────────────────────────────────────────
  var CONN_STATE = {
    ONLINE_LOCAL:  'ONLINE_LOCAL',
    ONLINE_REMOTE: 'ONLINE_REMOTE',
    CONNECTING:    'CONNECTING',
    OFFLINE:       'OFFLINE',
    ERROR:         'ERROR',
    UNKNOWN:       'UNKNOWN',
  };

  // ── Transport types ────────────────────────────────────────────────────────
  var TRANSPORT = {
    LOCAL:  'LOCAL',
    REMOTE: 'REMOTE',
  };

  // ── Per-device connection state ───────────────────────────────────────────
  // deviceId → { state, transport, lastChecked, error }
  var _deviceStates = {};

  // ── Registered relay endpoint ─────────────────────────────────────────────
  // Set via configure() — the URL of the Shadow backend relay service.
  // Never hardcoded. Empty until operator configures.
  var _relayEndpoint = null;   // e.g. 'wss://relay.shadow-edition.example.com'
  var _relayToken    = null;   // Session token (set by auth layer, not stored in source)

  // ── Local network probe timeout ───────────────────────────────────────────
  var LOCAL_PROBE_TIMEOUT_MS = 3000;
  var RELAY_CONNECT_TIMEOUT_MS = 8000;

  // ── Configure relay ───────────────────────────────────────────────────────

  /**
   * configure(opts)
   * opts = {
   *   relayEndpoint: string  (WSS or HTTPS relay URL)
   *   relayToken:    string  (session token from auth layer — NOT stored in source)
   * }
   * Called after the user authenticates; tokens come from the auth system,
   * never hardcoded.
   */
  function configure(opts) {
    if (!opts) return;
    if (opts.relayEndpoint) _relayEndpoint = opts.relayEndpoint;
    if (opts.relayToken)    _relayToken    = opts.relayToken;
  }

  function clearCredentials() {
    _relayToken    = null;
    _relayEndpoint = null;
  }

  // ── Device state management ───────────────────────────────────────────────

  function getDeviceConnectionState(deviceId) {
    return (_deviceStates[deviceId] && _deviceStates[deviceId].state) || CONN_STATE.UNKNOWN;
  }

  function _setDeviceState(deviceId, state, transport, errorMsg) {
    _deviceStates[deviceId] = {
      state:       state,
      transport:   transport || null,
      lastChecked: new Date().toISOString(),
      error:       errorMsg || null,
    };
  }

  // ── Determine best transport for a device ─────────────────────────────────

  /**
   * getBestTransport(device)
   * Returns TRANSPORT.LOCAL or TRANSPORT.REMOTE based on:
   *   1. Device's connectionType preference
   *   2. Whether relay is configured
   *   3. Current known state
   *
   * For LOCAL_NETWORK devices: prefer LOCAL, fall back to REMOTE if relay configured
   * For REMOTE_AGENT devices: always REMOTE (agent maintains outbound connection)
   * For CLOUD_API devices: always REMOTE (goes through manufacturer cloud)
   */
  function getBestTransport(device) {
    if (!device) return null;
    if (device.connectionType === 'REMOTE_AGENT') return TRANSPORT.REMOTE;
    if (device.connectionType === 'CLOUD_API')    return TRANSPORT.REMOTE;
    // LOCAL_NETWORK — use local if we haven't confirmed offline
    var state = getDeviceConnectionState(device.deviceId);
    if (state === CONN_STATE.ONLINE_LOCAL) return TRANSPORT.LOCAL;
    if (state === CONN_STATE.ONLINE_REMOTE && _relayEndpoint) return TRANSPORT.REMOTE;
    // Default: try local first
    return TRANSPORT.LOCAL;
  }

  // ── Local network probe ───────────────────────────────────────────────────

  /**
   * probeLocal(device, callback)
   * Sends a lightweight HTTP GET to the device's local IP to check reachability.
   * callback(reachable: boolean)
   *
   * Requires device.metadata.localUrl to be set.
   */
  function probeLocal(device, callback) {
    if (!device || !device.metadata || !device.metadata.localUrl) {
      callback(false);
      return;
    }

    var fetchFn = global.fetch;
    if (!fetchFn) {
      // No fetch in environment (test/Node) — can't probe
      callback(false);
      return;
    }

    var url = device.metadata.localUrl + '/shadow-ping';
    var timeoutId = setTimeout(function () {
      _setDeviceState(device.deviceId, CONN_STATE.OFFLINE, TRANSPORT.LOCAL);
      callback(false);
    }, LOCAL_PROBE_TIMEOUT_MS);

    fetchFn(url, { method: 'GET', cache: 'no-store' })
      .then(function (resp) {
        clearTimeout(timeoutId);
        if (resp.ok) {
          _setDeviceState(device.deviceId, CONN_STATE.ONLINE_LOCAL, TRANSPORT.LOCAL);
          callback(true);
        } else {
          _setDeviceState(device.deviceId, CONN_STATE.OFFLINE, TRANSPORT.LOCAL, 'HTTP ' + resp.status);
          callback(false);
        }
      })
      .catch(function () {
        clearTimeout(timeoutId);
        _setDeviceState(device.deviceId, CONN_STATE.OFFLINE, TRANSPORT.LOCAL);
        callback(false);
      });
  }

  // ── Relay connection ──────────────────────────────────────────────────────

  /**
   * sendViaRelay(device, message, callback)
   * Sends an authenticated command through the Shadow backend relay.
   *
   * message = { requestId, action, params, timestamp }
   * callback({ result, message, data })
   *
   * Security properties:
   *   - Requires _relayEndpoint and _relayToken (set by auth, not hardcoded)
   *   - message includes requestId for replay detection
   *   - Connection is WSS / HTTPS only
   *   - If token is missing, returns NOT_AUTHORIZED (no fallback to anonymous)
   */
  function sendViaRelay(device, message, callback) {
    var RESULT = global.SRDeviceActionRouter
      ? global.SRDeviceActionRouter.RESULT
      : { OFFLINE: 'OFFLINE', NOT_AUTHORIZED: 'NOT_AUTHORIZED', FAILED: 'FAILED' };

    // Relay requires authentication
    if (!_relayToken) {
      callback({
        result:  RESULT.NOT_AUTHORIZED,
        message: 'Remote relay requires authentication. Please sign in.',
      });
      return;
    }

    if (!_relayEndpoint) {
      callback({
        result:  RESULT.OFFLINE,
        message: 'No remote relay configured. ' + device.friendlyName + ' can only be reached on local network.',
      });
      return;
    }

    // Build authenticated relay request
    // In production: this POSTs to the relay with the device agentId and session token.
    // The relay verifies the token, looks up the agent's outbound WebSocket connection,
    // and forwards the command.
    var fetchFn = global.fetch;
    if (!fetchFn) {
      callback({
        result:  RESULT.OFFLINE,
        message: 'HTTP client not available in this environment.',
      });
      return;
    }

    _setDeviceState(device.deviceId, CONN_STATE.CONNECTING, TRANSPORT.REMOTE);

    var timeoutId = setTimeout(function () {
      _setDeviceState(device.deviceId, CONN_STATE.OFFLINE, TRANSPORT.REMOTE, 'relay timeout');
      callback({
        result:  RESULT.OFFLINE,
        message: device.friendlyName + ' relay connection timed out.',
      });
    }, RELAY_CONNECT_TIMEOUT_MS);

    var relayUrl = _relayEndpoint + '/relay/command';

    fetchFn(relayUrl, {
      method:  'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': 'Bearer ' + _relayToken,
      },
      body: JSON.stringify({
        agentId:   device.metadata && device.metadata.agentId,
        requestId: message.requestId,
        action:    message.action,
        params:    message.params || {},
        timestamp: message.timestamp || Date.now(),
      }),
    })
      .then(function (resp) {
        clearTimeout(timeoutId);
        if (resp.ok) {
          return resp.json().then(function (data) {
            _setDeviceState(device.deviceId, CONN_STATE.ONLINE_REMOTE, TRANSPORT.REMOTE);
            callback({
              result:  data.result || 'SUCCESS',
              message: data.message || 'Done.',
              data:    data,
            });
          });
        } else if (resp.status === 401 || resp.status === 403) {
          _setDeviceState(device.deviceId, CONN_STATE.ERROR, TRANSPORT.REMOTE, 'auth failed');
          callback({ result: RESULT.NOT_AUTHORIZED, message: 'Relay authentication failed.' });
        } else if (resp.status === 404) {
          _setDeviceState(device.deviceId, CONN_STATE.OFFLINE, TRANSPORT.REMOTE, 'agent not connected');
          callback({
            result:  RESULT.OFFLINE,
            message: device.friendlyName + ' Desktop Agent is not connected to the relay.',
          });
        } else {
          _setDeviceState(device.deviceId, CONN_STATE.ERROR, TRANSPORT.REMOTE, 'HTTP ' + resp.status);
          callback({ result: RESULT.FAILED, message: 'Relay returned HTTP ' + resp.status });
        }
      })
      .catch(function (e) {
        clearTimeout(timeoutId);
        _setDeviceState(device.deviceId, CONN_STATE.OFFLINE, TRANSPORT.REMOTE, e.message);
        callback({ result: RESULT.OFFLINE, message: 'Relay is unreachable.' });
      });
  }

  // ── Force device offline / mark reconnected ───────────────────────────────

  function markOffline(deviceId, reason) {
    _setDeviceState(deviceId, CONN_STATE.OFFLINE, null, reason || 'manual');
  }

  function markOnlineLocal(deviceId) {
    _setDeviceState(deviceId, CONN_STATE.ONLINE_LOCAL, TRANSPORT.LOCAL);
  }

  function markOnlineRemote(deviceId) {
    _setDeviceState(deviceId, CONN_STATE.ONLINE_REMOTE, TRANSPORT.REMOTE);
  }

  // ── Is relay configured? ──────────────────────────────────────────────────

  function isRelayConfigured() {
    return !!(_relayEndpoint && _relayToken);
  }

  // ── Reset all state ───────────────────────────────────────────────────────

  function reset() {
    _deviceStates = {};
  }

  // ── Expose ────────────────────────────────────────────────────────────────

  global.SRRemoteConnectionManager = {
    build:          BUILD_ID,
    CONN_STATE:     CONN_STATE,
    TRANSPORT:      TRANSPORT,

    configure:                configure,
    clearCredentials:         clearCredentials,
    isRelayConfigured:        isRelayConfigured,

    getDeviceConnectionState: getDeviceConnectionState,
    getBestTransport:         getBestTransport,

    probeLocal:               probeLocal,
    sendViaRelay:             sendViaRelay,

    markOffline:              markOffline,
    markOnlineLocal:          markOnlineLocal,
    markOnlineRemote:         markOnlineRemote,

    reset:                    reset,
  };

})(typeof window !== 'undefined' ? window : global);
