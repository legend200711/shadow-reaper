/**
 * shadow-reaper-v2/devices/adapters/desktop-agent-adapter.js
 * Shadow Reaper V2 — Desktop Agent Adapter
 *
 * Build: SR-V2-DEVICES-1
 *
 * Exposes: window.SRDesktopAgentAdapter
 *
 * PURPOSE:
 *   Interface between the Device Action Router and a paired Shadow Desktop Agent
 *   running on Windows, Linux, or macOS.
 *
 *   The Desktop Agent runs as a local application on the computer.
 *   It maintains an authenticated outbound WebSocket (or HTTP long-poll)
 *   connection to the Shadow Edition backend.
 *
 *   This adapter handles both:
 *     LOCAL MODE   — same Wi-Fi/LAN: send commands directly to agent's local port
 *     REMOTE MODE  — different network: relay commands through the Shadow backend
 *
 * CONTRACT (Desktop Agent must implement these on the other end):
 *   Receives: { agentId, action, params, requestId, timestamp }
 *   Responds: { requestId, result, message, data }
 *
 * SECURITY:
 *   - Agent is identified by a unique agentId set during pairing
 *   - All communication is authenticated (token set at pairing, never stored in frontend)
 *   - No unrestricted shell access — action is always from the allowlist
 *   - Higher-risk actions already gated by DeviceActionRouter confirmation system
 *
 * STATUS:
 *   FOUNDATION — the interface and mock adapter are complete.
 *   Real agent connection requires the Shadow Desktop Agent application.
 *
 * CAPABILITIES (declared — adapter reports what the real agent supports):
 *   open_application    — open an approved application by name
 *   close_application   — close an approved application
 *   media_play          — media play
 *   media_pause         — media pause
 *   next                — next track
 *   previous            — previous track
 *   volume_up           — volume up
 *   volume_down         — volume down
 *   volume_set          — set volume to specific level
 *   mute                — mute
 *   unmute              — unmute
 *   lock                — lock the computer screen
 *   sleep               — put computer to sleep
 *   shutdown            — shut down (requires confirmation)
 *   restart             — restart (requires confirmation)
 *   status              — report battery/status
 *   battery_status      — battery level and charging state
 *   launch_website      — open a specific approved website
 *   lock_screen         — lock screen (OS-level)
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-V2-DEVICES-1';

  // ── Agent connection state ────────────────────────────────────────────────
  var CONNECTION_STATE = {
    DISCONNECTED: 'DISCONNECTED',
    CONNECTING:   'CONNECTING',
    CONNECTED:    'CONNECTED',
    PAIRED:       'PAIRED',
    ERROR:        'ERROR',
  };

  var _connectionState  = CONNECTION_STATE.DISCONNECTED;
  var _agentId          = null;
  var _pendingRequests  = {};   // requestId → { callback, timer }

  var REQUEST_TIMEOUT_MS = 10000;  // 10s timeout for agent responses

  // ─── Capability list ──────────────────────────────────────────────────────

  var DESKTOP_CAPABILITIES = [
    'open_application',
    'close_application',
    'media_play',
    'media_pause',
    'next',
    'previous',
    'volume_up',
    'volume_down',
    'volume_set',
    'mute',
    'unmute',
    'lock',
    'sleep',
    'shutdown',
    'restart',
    'status',
    'battery_status',
    'launch_website',
    'lock_screen',
  ];

  // ─── Agent communication (abstract transport) ─────────────────────────────
  //
  // The actual transport (WebSocket / HTTP relay) is provided by registering a
  // transport handler.  Until the real Desktop Agent app is running, we use
  // a mock transport that simulates responses.

  var _transport = null;   // { send: fn(message) }

  function registerTransport(transport) {
    if (!transport || typeof transport.send !== 'function') {
      throw new Error('[SRDesktopAgentAdapter] registerTransport: transport must have a send() method.');
    }
    _transport = transport;
  }

  /**
   * Called by the transport layer when a response arrives from the Desktop Agent.
   * Resolves the pending request callback.
   */
  function onAgentResponse(response) {
    if (!response || !response.requestId) return;
    var pending = _pendingRequests[response.requestId];
    if (!pending) return;
    clearTimeout(pending.timer);
    delete _pendingRequests[response.requestId];
    pending.callback(response);
  }

  // ─── Execute an action on the Desktop Agent ───────────────────────────────

  /**
   * execute(device, action, params, callback)
   * Required by SRDeviceActionRouter adapter contract.
   */
  function execute(device, action, params, callback) {
    var RESULT = global.SRDeviceActionRouter
      ? global.SRDeviceActionRouter.RESULT
      : { SUCCESS: 'SUCCESS', FAILED: 'FAILED', OFFLINE: 'OFFLINE', NOT_SUPPORTED: 'NOT_SUPPORTED' };

    // If no real transport is registered, report NOT_FOUND (agent not connected)
    if (!_transport) {
      callback({
        result:  RESULT.OFFLINE,
        message: device.friendlyName + ' — Shadow Desktop Agent is not connected. ' +
                 'Install and run the Desktop Agent on your computer.',
      });
      return;
    }

    var requestId = 'req_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    var message = {
      agentId:   device.metadata.agentId || _agentId,
      requestId: requestId,
      action:    action,
      params:    params || {},
      timestamp: Date.now(),
    };

    // Timeout if agent doesn't respond
    var timer = setTimeout(function () {
      delete _pendingRequests[requestId];
      callback({
        result:  RESULT.OFFLINE,
        message: device.friendlyName + ' did not respond in time.',
      });
    }, REQUEST_TIMEOUT_MS);

    _pendingRequests[requestId] = { callback: callback, timer: timer };

    try {
      _transport.send(message);
    } catch (e) {
      clearTimeout(timer);
      delete _pendingRequests[requestId];
      callback({
        result:  RESULT.FAILED,
        message: 'Failed to send command to ' + device.friendlyName + ': ' + (e.message || 'unknown'),
      });
    }
  }

  // ─── Pairing helpers ──────────────────────────────────────────────────────

  /**
   * createPairingRecord(friendlyName)
   * Returns a device record for SRDeviceRegistry.registerDevice().
   * The agentId in metadata identifies this specific agent instance.
   */
  function createPairingRecord(friendlyName, agentId) {
    return {
      friendlyName:   friendlyName || 'My Computer',
      deviceType:     'COMPUTER',
      connectionType: 'REMOTE_AGENT',
      capabilities:   DESKTOP_CAPABILITIES.slice(),
      permissionLevel: 'ELEVATED',   // computer control needs elevated permission
      metadata: {
        agentId:       agentId || null,
        agentVersion:  null,
        platform:      null,   // populated when agent first connects
      },
    };
  }

  // ─── Mock transport for testing ───────────────────────────────────────────
  //
  // Used for architecture validation tests.
  // Returns simulated SUCCESS responses for safe actions.
  // Does NOT control any real computer.

  var MOCK_TRANSPORT = {
    send: function (message) {
      // Simulate an async response
      setTimeout(function () {
        var RESULT = global.SRDeviceActionRouter
          ? global.SRDeviceActionRouter.RESULT
          : { SUCCESS: 'SUCCESS' };

        onAgentResponse({
          requestId: message.requestId,
          result:    RESULT.SUCCESS,
          message:   '[MOCK] ' + message.action + ' acknowledged.',
          data:      { mock: true, action: message.action, params: message.params },
        });
      }, 50);
    },
  };

  function useMockTransport() {
    _transport = MOCK_TRANSPORT;
  }

  // ─── Expose ───────────────────────────────────────────────────────────────

  global.SRDesktopAgentAdapter = {
    build:              BUILD_ID,
    CONNECTION_STATE:   CONNECTION_STATE,
    DESKTOP_CAPABILITIES: DESKTOP_CAPABILITIES,

    // Adapter contract (required by SRDeviceActionRouter)
    execute:            execute,

    // Transport
    registerTransport:  registerTransport,
    onAgentResponse:    onAgentResponse,
    useMockTransport:   useMockTransport,

    // Pairing
    createPairingRecord: createPairingRecord,

    // State
    getConnectionState: function () { return _connectionState; },
    isConnected: function () { return _connectionState === CONNECTION_STATE.CONNECTED || _connectionState === CONNECTION_STATE.PAIRED; },
  };

})(typeof window !== 'undefined' ? window : global);
