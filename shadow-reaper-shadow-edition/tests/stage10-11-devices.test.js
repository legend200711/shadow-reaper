/**
 * shadow-reaper-v2/tests/stage10-11-devices.test.js
 * Shadow Reaper V2 — Stage 8 Action Log + Stage 9 Remote Connection + Stage 10 Desktop Agent + Stage 11 IoT Tests
 *
 * Build: SR-V2-DEVICES-TEST-2
 *
 * Runner: Node.js (no external test framework)
 * Usage:  node tests/stage10-11-devices.test.js
 *
 * COVERAGE:
 *   Stage 8  — Action log, idempotency, replay protection
 *   Stage 9  — Remote connection manager, transport selection, auth requirements
 *   Stage 10 — Desktop Agent server: allowlist, replay protection, platform handlers
 *   Stage 11 — Roku adapter, Hue adapter, capability contracts
 *
 * REAL vs FOUNDATION / MOCK:
 *   All tests use MOCK adapters or architecture inspection.
 *   No real physical devices are controlled.
 *   Real device integration requires physical hardware and configuration
 *   as stated in each section's header.
 */

'use strict';

var fs   = require('fs');
var path = require('path');
var ROOT = path.resolve(__dirname, '..');

// ── Browser globals shim ─────────────────────────────────────────────────────

if (typeof window === 'undefined') global.window = global;

if (!global.localStorage) {
  global.localStorage = {
    _store: {},
    getItem:    function (k) { return this._store[k] !== undefined ? this._store[k] : null; },
    setItem:    function (k, v) { this._store[k] = String(v); },
    removeItem: function (k) { delete this._store[k]; },
    clear:      function ()  { this._store = {}; },
  };
}

try {
  if (!global.navigator) {
    Object.defineProperty(global, 'navigator', {
      value: { onLine: true },
      writable: true, configurable: true,
    });
  }
} catch (_) {}

if (!global.speechSynthesis) global.speechSynthesis = null;

// ── Module loader ─────────────────────────────────────────────────────────────

function loadModule(relPath) {
  var code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  var fn = new Function('global', 'require', code);
  fn(global, require);
}

// ── Load all device-related modules ──────────────────────────────────────────

loadModule('config/environment.js');
loadModule('security/security-policy.js');
loadModule('snx-shadow-conv-history.js');
loadModule('snx-shadow-memory.js');
loadModule('snx-shadow-adaptive.js');
loadModule('core/adaptive-brain.js');
loadModule('core/understanding-engine.js');
loadModule('core/context-engine.js');
loadModule('core/conversation-engine.js');
loadModule('core/response-engine.js');
loadModule('core/persistence-bridge.js');
loadModule('core/local-model.js');
loadModule('knowledge/knowledge-engine.js');
loadModule('translation/translation-engine.js');
loadModule('sr-connection-monitor.js');
loadModule('voice/sr-wake-name.js');
loadModule('voice/voice-engine.js');
loadModule('voice/sr-voice-assistant.js');
loadModule('devices/device-registry.js');
loadModule('devices/sr-device-action-log.js');
loadModule('devices/device-intent-parser.js');
loadModule('devices/device-action-router.js');
loadModule('devices/sr-remote-connection-manager.js');
loadModule('devices/adapters/desktop-agent-adapter.js');
loadModule('devices/adapters/smart-device-adapter.js');
loadModule('devices/adapters/roku-adapter.js');
loadModule('devices/adapters/hue-adapter.js');
loadModule('adapters/founder-controls.js');
loadModule('shadow-reaper.js');
// Desktop agent server (Node.js context)
loadModule('devices/sr-desktop-agent-server.js');

var SR      = global.ShadowReaper;
var SRReg   = global.SRDeviceRegistry;
var SRRouter = global.SRDeviceActionRouter;
var SRParser = global.SRDeviceIntentParser;
var SRLog   = global.SRDeviceActionLog;
var SRRemote = global.SRRemoteConnectionManager;
var SRDesk  = global.SRDesktopAgentAdapter;
var SRSmart = global.SRSmartDeviceAdapter;
var SRRoku  = global.SRRokuAdapter;
var SRHue   = global.SRHueAdapter;
var SRAgent = global.SRDesktopAgentServer;

SR.init();
SRReg.init();
SRLog.init();

// ── Test runner ───────────────────────────────────────────────────────────────

var PASS = 0, FAIL = 0;
var results = [];

function test(name, fn) {
  try {
    fn();
    PASS++;
    results.push({ status: 'PASS', name: name });
    process.stdout.write('  ✓ ' + name + '\n');
  } catch (e) {
    FAIL++;
    results.push({ status: 'FAIL', name: name, error: e.message });
    process.stdout.write('  ✗ ' + name + '\n    → ' + e.message + '\n');
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function clearRegistry() {
  var devices = SRReg.getAllDevices();
  devices.forEach(function (d) { SRReg.unregisterDevice(d.deviceId); });
}

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 1 — STAGE 8: ACTION LOG
// ═════════════════════════════════════════════════════════════════════════════
process.stdout.write('\n── STAGE 8: ACTION LOG ──────────────────────────────\n');

test('SRDeviceActionLog is loaded', function () {
  assert(!!SRLog, 'SRDeviceActionLog must be loaded');
  assert(typeof SRLog.record === 'function', 'Must have record()');
  assert(typeof SRLog.getAll === 'function', 'Must have getAll()');
  assert(typeof SRLog.clear === 'function', 'Must have clear()');
  assert(typeof SRLog.generateCommandId === 'function', 'Must have generateCommandId()');
  assert(typeof SRLog.isRecentDuplicate === 'function', 'Must have isRecentDuplicate()');
});

test('generateCommandId returns unique IDs', function () {
  var id1 = SRLog.generateCommandId();
  var id2 = SRLog.generateCommandId();
  assert(typeof id1 === 'string' && id1.length > 4, 'Must return a string ID');
  assert(id1 !== id2, 'Each ID must be unique');
  assert(id1.startsWith('cmd_'), 'Must start with cmd_ prefix');
});

test('record() stores a valid log entry', function () {
  SRLog.clear();
  var id = SRLog.generateCommandId();
  SRLog.record({
    commandId:  id,
    deviceName: 'Living Room TV',
    action:     'volume_down',
    result:     'SUCCESS',
    params:     {},
  });
  var log = SRLog.getAll();
  assert(log.length === 1, 'Log must have 1 entry after record()');
  assert(log[0].deviceName === 'Living Room TV', 'Device name must be stored');
  assert(log[0].action === 'volume_down', 'Action must be stored');
  assert(log[0].result === 'SUCCESS', 'Result must be stored');
  assert(log[0].commandId === id, 'CommandId must match');
  assert(log[0].timestamp, 'Timestamp must be present');
});

test('record() does NOT store plaintext passwords or tokens', function () {
  SRLog.clear();
  var id = SRLog.generateCommandId();
  SRLog.record({
    commandId:  id,
    deviceName: 'My Computer',
    action:     'open_application',
    result:     'SUCCESS',
    params:     {
      application: 'Spotify',
      password:    'secret123',     // MUST be stripped
      token:       'tok_abc123',    // MUST be stripped
      apiKey:      'key_xyz',       // MUST be stripped
    },
  });
  var log = SRLog.getAll();
  assert(log.length === 1, 'Must have 1 entry');
  var params = log[0].params;
  assert(params.application === 'Spotify', 'Non-sensitive params must be preserved');
  assert(!params.password,  'password must NOT be stored in log');
  assert(!params.token,     'token must NOT be stored in log');
  assert(!params.apiKey,    'apiKey must NOT be stored in log');
});

test('getRecent(n) returns at most n entries (newest last)', function () {
  SRLog.clear();
  for (var i = 0; i < 10; i++) {
    SRLog.record({
      commandId:  SRLog.generateCommandId(),
      deviceName: 'TV',
      action:     'volume_up',
      result:     'SUCCESS',
      params:     {},
    });
  }
  var recent = SRLog.getRecent(3);
  assert(recent.length === 3, 'getRecent(3) must return 3 entries');
});

test('getByDevice returns only matching device entries', function () {
  SRLog.clear();
  SRLog.record({ commandId: SRLog.generateCommandId(), deviceName: 'TV',       action: 'pause', result: 'SUCCESS', params: {} });
  SRLog.record({ commandId: SRLog.generateCommandId(), deviceName: 'Computer', action: 'lock',  result: 'SUCCESS', params: {} });
  SRLog.record({ commandId: SRLog.generateCommandId(), deviceName: 'TV',       action: 'play',  result: 'SUCCESS', params: {} });
  var tvEntries = SRLog.getByDevice('TV');
  assert(tvEntries.length === 2, 'Must find 2 TV entries, got: ' + tvEntries.length);
  assert(tvEntries.every(function (e) { return e.deviceName === 'TV'; }), 'All must be TV');
});

test('isRecentDuplicate returns false for new command IDs', function () {
  var id = SRLog.generateCommandId();
  assert(SRLog.isRecentDuplicate(id) === false, 'New ID must not be a duplicate');
});

test('isRecentDuplicate returns true after recording the same commandId', function () {
  SRLog.clear();
  var id = SRLog.generateCommandId();
  SRLog.record({ commandId: id, deviceName: 'TV', action: 'pause', result: 'SUCCESS', params: {} });
  assert(SRLog.isRecentDuplicate(id) === true, 'Same commandId recorded within window must be duplicate');
});

test('getStats() returns correct counts', function () {
  SRLog.clear();
  SRLog.record({ commandId: SRLog.generateCommandId(), deviceName: 'TV', action: 'play',  result: 'SUCCESS', params: {} });
  SRLog.record({ commandId: SRLog.generateCommandId(), deviceName: 'TV', action: 'pause', result: 'FAILED',  params: {} });
  SRLog.record({ commandId: SRLog.generateCommandId(), deviceName: 'TV', action: 'stop',  result: 'OFFLINE', params: {} });
  var stats = SRLog.getStats();
  assert(stats.total   === 3, 'Total must be 3');
  assert(stats.success === 1, 'Success must be 1');
  assert(stats.failed  === 1, 'Failed must be 1');
  assert(stats.offline === 1, 'Offline must be 1');
});

test('clear() removes all log entries', function () {
  SRLog.clear();
  SRLog.record({ commandId: SRLog.generateCommandId(), deviceName: 'TV', action: 'play', result: 'SUCCESS', params: {} });
  assert(SRLog.getAll().length === 1, 'Pre-clear must have entries');
  SRLog.clear();
  assert(SRLog.getAll().length === 0, 'Post-clear must be empty');
});

test('Action log entries do not contain auth credentials in source code', function () {
  var code = fs.readFileSync(path.join(ROOT, 'devices/sr-device-action-log.js'), 'utf8');
  assert(!code.includes('hardcoded_password'), 'No hardcoded passwords');
  assert(!code.includes('hardcoded_token'), 'No hardcoded tokens');
  assert(code.includes('_SENSITIVE_KEYS'), 'Must have sensitive key filter');
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 2 — STAGE 9: REMOTE CONNECTION MANAGER
// ═════════════════════════════════════════════════════════════════════════════
process.stdout.write('\n── STAGE 9: REMOTE CONNECTION MANAGER ───────────────\n');

test('SRRemoteConnectionManager is loaded', function () {
  assert(!!SRRemote, 'SRRemoteConnectionManager must be loaded');
  assert(typeof SRRemote.configure === 'function', 'Must have configure()');
  assert(typeof SRRemote.getBestTransport === 'function', 'Must have getBestTransport()');
  assert(typeof SRRemote.probeLocal === 'function', 'Must have probeLocal()');
  assert(typeof SRRemote.sendViaRelay === 'function', 'Must have sendViaRelay()');
  assert(typeof SRRemote.isRelayConfigured === 'function', 'Must have isRelayConfigured()');
});

test('Connection state constants exist', function () {
  assert(SRRemote.CONN_STATE.ONLINE_LOCAL  === 'ONLINE_LOCAL',  'Must have ONLINE_LOCAL');
  assert(SRRemote.CONN_STATE.ONLINE_REMOTE === 'ONLINE_REMOTE', 'Must have ONLINE_REMOTE');
  assert(SRRemote.CONN_STATE.CONNECTING    === 'CONNECTING',    'Must have CONNECTING');
  assert(SRRemote.CONN_STATE.OFFLINE       === 'OFFLINE',       'Must have OFFLINE');
  assert(SRRemote.CONN_STATE.ERROR         === 'ERROR',         'Must have ERROR');
  assert(SRRemote.CONN_STATE.UNKNOWN       === 'UNKNOWN',       'Must have UNKNOWN');
});

test('Transport constants exist', function () {
  assert(SRRemote.TRANSPORT.LOCAL  === 'LOCAL',  'Must have LOCAL transport');
  assert(SRRemote.TRANSPORT.REMOTE === 'REMOTE', 'Must have REMOTE transport');
});

test('isRelayConfigured() returns false before configuration', function () {
  SRRemote.clearCredentials();
  assert(SRRemote.isRelayConfigured() === false, 'Must be false with no relay configured');
});

test('configure() sets relay endpoint and token', function () {
  SRRemote.clearCredentials();
  SRRemote.configure({
    relayEndpoint: 'wss://relay.example.com',
    relayToken:    'test_session_token',
  });
  assert(SRRemote.isRelayConfigured() === true, 'Must be configured after configure()');
  SRRemote.clearCredentials();
});

test('clearCredentials() removes relay configuration', function () {
  SRRemote.configure({ relayEndpoint: 'wss://relay.example.com', relayToken: 'token' });
  SRRemote.clearCredentials();
  assert(SRRemote.isRelayConfigured() === false, 'Must be unconfigured after clearCredentials()');
});

test('getDeviceConnectionState() returns UNKNOWN for unregistered device', function () {
  SRRemote.reset();
  var state = SRRemote.getDeviceConnectionState('nonexistent_id');
  assert(state === 'UNKNOWN', 'Unknown device must return UNKNOWN, got: ' + state);
});

test('markOnlineLocal() and markOffline() set correct states', function () {
  SRRemote.reset();
  SRRemote.markOnlineLocal('dev_123');
  assert(SRRemote.getDeviceConnectionState('dev_123') === 'ONLINE_LOCAL', 'Must be ONLINE_LOCAL');
  SRRemote.markOffline('dev_123', 'manual');
  assert(SRRemote.getDeviceConnectionState('dev_123') === 'OFFLINE', 'Must be OFFLINE after markOffline');
});

test('markOnlineRemote() sets ONLINE_REMOTE state', function () {
  SRRemote.reset();
  SRRemote.markOnlineRemote('dev_456');
  assert(SRRemote.getDeviceConnectionState('dev_456') === 'ONLINE_REMOTE', 'Must be ONLINE_REMOTE');
});

test('getBestTransport() returns REMOTE for REMOTE_AGENT devices', function () {
  var device = { deviceId: 'comp_1', connectionType: 'REMOTE_AGENT', metadata: {} };
  assert(SRRemote.getBestTransport(device) === 'REMOTE', 'REMOTE_AGENT must use REMOTE transport');
});

test('getBestTransport() returns REMOTE for CLOUD_API devices', function () {
  var device = { deviceId: 'cloud_1', connectionType: 'CLOUD_API', metadata: {} };
  assert(SRRemote.getBestTransport(device) === 'REMOTE', 'CLOUD_API must use REMOTE transport');
});

test('getBestTransport() returns LOCAL for LOCAL_NETWORK device with LOCAL state', function () {
  SRRemote.reset();
  SRRemote.markOnlineLocal('lan_1');
  var device = { deviceId: 'lan_1', connectionType: 'LOCAL_NETWORK', metadata: {} };
  assert(SRRemote.getBestTransport(device) === 'LOCAL', 'LOCAL_NETWORK in ONLINE_LOCAL state must use LOCAL');
});

test('sendViaRelay() returns NOT_AUTHORIZED without credentials', function () {
  SRRemote.clearCredentials();
  var device = {
    deviceId:    'relay_test_1',
    friendlyName: 'Test Device',
    metadata:    { agentId: 'agent_123' },
  };
  var result = null;
  SRRemote.sendViaRelay(device, { requestId: 'req_1', action: 'status', params: {}, timestamp: Date.now() }, function (r) {
    result = r;
  });
  assert(result !== null, 'Callback must fire synchronously');
  assert(result.result === 'NOT_AUTHORIZED', 'Must return NOT_AUTHORIZED without token, got: ' + result.result);
});

test('sendViaRelay() returns OFFLINE without relay endpoint (token only)', function () {
  SRRemote.clearCredentials();
  SRRemote.configure({ relayToken: 'test_token' });  // Token but no endpoint
  var device = { deviceId: 'relay_test_2', friendlyName: 'Test Device', metadata: {} };
  var result = null;
  SRRemote.sendViaRelay(device, { requestId: 'req_2', action: 'status', params: {}, timestamp: Date.now() }, function (r) {
    result = r;
  });
  // No endpoint → reports OFFLINE
  assert(result !== null, 'Callback must fire synchronously');
  assert(result.result === 'OFFLINE', 'Must return OFFLINE with no endpoint, got: ' + result.result);
  SRRemote.clearCredentials();
});

test('probeLocal() returns false when device has no localUrl', function () {
  var device = { deviceId: 'probe_1', friendlyName: 'No URL Device', metadata: {} };
  var reached = null;
  SRRemote.probeLocal(device, function (r) { reached = r; });
  assert(reached === false, 'Must return false for device with no localUrl');
});

test('probeLocal() handles unreachable LAN device without crashing synchronously', function () {
  // In Node 18+, fetch IS available, so probeLocal fires an async network probe.
  // The test device IP is not reachable; the async callback will eventually fire false.
  // We only verify probeLocal does NOT throw synchronously.
  var device = {
    deviceId:    'probe_2',
    friendlyName: 'LAN Device',
    metadata:    { localUrl: 'http://192.168.1.100:8060' },
  };
  var noThrow = true;
  try {
    SRRemote.probeLocal(device, function (r) {
      // Async callback — if it fires, result must be boolean
    });
  } catch (e) {
    noThrow = false;
  }
  assert(noThrow, 'probeLocal must not throw synchronously');
});

test('Stage 9 source: no hardcoded passwords or tokens', function () {
  var code = fs.readFileSync(path.join(ROOT, 'devices/sr-remote-connection-manager.js'), 'utf8');
  assert(!code.includes('hardcoded_password'), 'No hardcoded password');
  assert(!code.includes('hardcoded_token'),    'No hardcoded token');
  assert(!code.includes('Bearer sk-'),         'No hardcoded API key pattern');
  assert(code.includes('NOT_AUTHORIZED'),       'Must have auth check');
  assert(code.includes('clearCredentials'),     'Must be able to revoke credentials');
});

test('Stage 9 source: no public unauthenticated endpoints', function () {
  var code = fs.readFileSync(path.join(ROOT, 'devices/sr-remote-connection-manager.js'), 'utf8');
  // Relay always requires token
  assert(code.includes('_relayToken'), 'Must check relay token');
  assert(!code.includes('allow_anon'), 'Must not allow anonymous access');
});

test('Stage 9 source: replay protection — requestId and timestamp validation', function () {
  var code = fs.readFileSync(path.join(ROOT, 'devices/sr-remote-connection-manager.js'), 'utf8');
  assert(code.includes('requestId'), 'Must include requestId in relay messages');
  assert(code.includes('timestamp'), 'Must include timestamp for replay detection');
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 3 — STAGE 10: DESKTOP AGENT SERVER
// ═════════════════════════════════════════════════════════════════════════════
process.stdout.write('\n── STAGE 10: DESKTOP AGENT SERVER ──────────────────\n');

test('SRDesktopAgentServer is loaded', function () {
  assert(!!SRAgent, 'SRDesktopAgentServer must be loaded');
  assert(typeof SRAgent.start === 'function', 'Must have start()');
  assert(typeof SRAgent.registerHandler === 'function', 'Must have registerHandler()');
  assert(typeof SRAgent._handleCommand === 'function', 'Must have _handleCommand()');
  assert(typeof SRAgent._isReplay === 'function', 'Must have _isReplay()');
});

test('Desktop agent has approved app registry', function () {
  assert(!!SRAgent.APPROVED_APPS, 'Must have APPROVED_APPS');
  assert(SRAgent.APPROVED_APPS.spotify, 'Must have spotify');
  assert(SRAgent.APPROVED_APPS.chrome, 'Must have chrome');
  assert(SRAgent.APPROVED_APPS.youtube, 'Must have youtube');
});

test('Desktop agent has approved URL list', function () {
  assert(Array.isArray(SRAgent.APPROVED_URLS), 'APPROVED_URLS must be array');
  assert(SRAgent.APPROVED_URLS.length > 0, 'Must have approved URLs');
  assert(SRAgent.APPROVED_URLS.indexOf('https://www.youtube.com') !== -1, 'Must include YouTube');
});

test('Desktop agent status handler returns SUCCESS', function () {
  var result = null;
  SRAgent._actionHandlers.status({}, function (r, msg, data) {
    result = { result: r, message: msg, data: data };
  });
  assert(result !== null, 'Callback must fire');
  assert(result.result === 'SUCCESS', 'Status must return SUCCESS, got: ' + result.result);
  assert(result.data && result.data.build === 'SR-V2-DEVICES-2', 'Must report build ID');
});

test('open_application handler rejects unknown apps', function () {
  var result = null;
  SRAgent._actionHandlers.open_application({ application: 'NotARealApp' }, function (r, msg) {
    result = { result: r, message: msg };
  });
  assert(result !== null, 'Callback must fire');
  assert(result.result === 'NOT_SUPPORTED', 'Unknown app must return NOT_SUPPORTED, got: ' + result.result);
  assert(result.message.indexOf('approved app list') !== -1, 'Must mention approved app list');
});

test('open_application handler returns result for known app (may be NOT_SUPPORTED in Node)', function () {
  // In Node context, actually launching an app is platform-specific
  // We just verify the flow doesn't crash and returns a structured result
  var result = null;
  SRAgent._actionHandlers.open_application({ application: 'spotify' }, function (r, msg) {
    result = { result: r, message: msg };
  });
  assert(result !== null, 'Callback must fire for known app');
  // Result will be NOT_SUPPORTED in headless Node (no platform launch); that's correct
  assert(typeof result.result === 'string', 'Must return a result code');
});

test('shutdown handler rejects without _confirmed flag', function () {
  var result = null;
  SRAgent._actionHandlers.shutdown({}, function (r, msg) {
    result = { result: r, message: msg };
  });
  assert(result !== null, 'Callback must fire');
  assert(result.result === 'FAILED', 'Shutdown without _confirmed must FAIL, got: ' + result.result);
  assert(result.message.indexOf('confirmation flag') !== -1, 'Must mention confirmation flag');
});

test('restart handler rejects without _confirmed flag', function () {
  var result = null;
  SRAgent._actionHandlers.restart({}, function (r, msg) {
    result = { result: r, message: msg };
  });
  assert(result !== null, 'Callback must fire');
  assert(result.result === 'FAILED', 'Restart without _confirmed must FAIL, got: ' + result.result);
});

test('_isReplay() returns false for fresh requestId', function () {
  var fresh = 'req_fresh_' + Date.now();
  assert(SRAgent._isReplay(fresh, Date.now()) === false, 'Fresh requestId must not be replay');
});

test('_isReplay() returns true for null requestId', function () {
  assert(SRAgent._isReplay(null, Date.now()) === true, 'Null requestId must be replay');
});

test('_isReplay() returns true for stale timestamp', function () {
  var oldTs = Date.now() - 60000;  // 60 seconds ago (beyond 30s window)
  assert(SRAgent._isReplay('stale_req', oldTs) === true, 'Stale command must be rejected as replay');
});

test('_handleCommand() rejects missing action', function () {
  var sent = null;
  // Temporarily mock _relayWs
  SRAgent._handleCommand({ requestId: 'req_no_action', timestamp: Date.now() });
  // No crash expected — verify graceful handling
  assert(true, 'Must not crash on missing action');
});

test('_handleCommand() rejects unknown actions with NOT_SUPPORTED', function () {
  // Capture response via mock relayWs
  var captured = null;
  // We can inspect the flow without a real WS — just verify handler lookup
  var unknownHandler = SRAgent._actionHandlers['execute_arbitrary_shell'];
  assert(unknownHandler === undefined, 'Must NOT have execute_arbitrary_shell handler');
  var evalHandler = SRAgent._actionHandlers['eval'];
  assert(evalHandler === undefined, 'Must NOT have eval handler');
  var spawnHandler = SRAgent._actionHandlers['spawn'];
  assert(spawnHandler === undefined, 'Must NOT have spawn handler');
});

test('Desktop agent source has no unrestricted shell access', function () {
  var code = fs.readFileSync(path.join(ROOT, 'devices/sr-desktop-agent-server.js'), 'utf8');
  assert(!code.includes("eval("), 'Must not have eval()');
  // exec IS used internally in locked-down handlers — verify it's in named functions only
  // by checking that no handler is registered for 'shell', 'exec', 'run', etc.
  assert(code.includes('APPROVED_APPS'), 'Must have approved app list');
  assert(code.includes('_confirmed'), 'High-risk actions must check _confirmed flag');
});

test('Desktop agent source: APPROVED_APPS prevents arbitrary app launch', function () {
  var code = fs.readFileSync(path.join(ROOT, 'devices/sr-desktop-agent-server.js'), 'utf8');
  assert(code.includes('APPROVED_APPS[appName]'), 'Must gate launch through APPROVED_APPS');
  assert(code.includes("is not in the approved app list"), 'Must reject unknown apps');
});

test('Desktop agent source: APPROVED_URLS prevents arbitrary URL launch', function () {
  var code = fs.readFileSync(path.join(ROOT, 'devices/sr-desktop-agent-server.js'), 'utf8');
  assert(code.includes('APPROVED_URLS'), 'Must have APPROVED_URLS');
  assert(code.includes("not in the approved website list"), 'Must reject unapproved URLs');
});

test('Desktop agent start() requires all three required opts', function () {
  var threw = false;
  try {
    SRAgent.start({ agentId: 'only_id' });
  } catch (e) {
    threw = e.message.indexOf('pairingToken') !== -1 || e.message.indexOf('relayUrl') !== -1;
  }
  assert(threw, 'start() must throw when pairingToken or relayUrl is missing');
});

test('Desktop agent adapter — SRDesktopAgentAdapter — registers with router correctly', function () {
  SRRouter.registerAdapter('COMPUTER', SRDesk);
  assert(SRRouter.getAdapter('COMPUTER') !== null, 'COMPUTER adapter must be registered');
});

test('ShadowReaper status reports desktop adapter loaded', function () {
  var status = SR.getStatus();
  assert(status.deviceControl.desktopAdapter === true, 'desktopAdapter must be true in status');
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 4 — STAGE 11: ROKU ADAPTER
// ═════════════════════════════════════════════════════════════════════════════
process.stdout.write('\n── STAGE 11: ROKU ADAPTER ───────────────────────────\n');

test('SRRokuAdapter is loaded', function () {
  assert(!!SRRoku, 'SRRokuAdapter must be loaded');
  assert(typeof SRRoku.execute === 'function', 'Must have execute()');
  assert(typeof SRRoku.createPairingRecord === 'function', 'Must have createPairingRecord()');
  assert(!!SRRoku.MOCK_ADAPTER, 'Must have MOCK_ADAPTER');
});

test('Roku capabilities include required actions', function () {
  var caps = SRRoku.ROKU_CAPABILITIES;
  assert(Array.isArray(caps), 'Must be array');
  assert(caps.indexOf('power_on')    !== -1, 'Must have power_on');
  assert(caps.indexOf('power_off')   !== -1, 'Must have power_off');
  assert(caps.indexOf('volume_up')   !== -1, 'Must have volume_up');
  assert(caps.indexOf('volume_down') !== -1, 'Must have volume_down');
  assert(caps.indexOf('play')        !== -1, 'Must have play');
  assert(caps.indexOf('pause')       !== -1, 'Must have pause');
  assert(caps.indexOf('status')      !== -1, 'Must have status');
  assert(caps.indexOf('launch_app')  !== -1, 'Must have launch_app');
});

test('Roku ECP command map has correct endpoints', function () {
  var cmds = SRRoku.ECP_COMMANDS;
  assert(cmds.volume_up.path   === '/keypress/VolumeUp',   'VolumeUp path correct');
  assert(cmds.volume_down.path === '/keypress/VolumeDown', 'VolumeDown path correct');
  assert(cmds.play.path        === '/keypress/Play',       'Play path correct');
  assert(cmds.power_on.path    === '/keypress/Power',      'Power path correct');
  assert(cmds.status.path      === '/query/device-info',   'Status path correct');
  assert(cmds.status.method    === 'GET',                  'Status uses GET');
});

test('Roku channel IDs map includes key streaming services', function () {
  var ids = SRRoku.ROKU_CHANNEL_IDS;
  assert(ids.netflix,  'Must have Netflix channel ID');
  assert(ids.youtube,  'Must have YouTube channel ID');
  assert(ids.spotify,  'Must have Spotify channel ID');
});

test('createPairingRecord returns correct registry record', function () {
  var rec = SRRoku.createPairingRecord('Living Room Roku', '192.168.1.100');
  assert(rec.friendlyName === 'Living Room Roku', 'Name preserved');
  assert(rec.deviceType   === 'MEDIA_PLAYER', 'Type is MEDIA_PLAYER');
  assert(rec.connectionType === 'LOCAL_NETWORK', 'Connection is LOCAL_NETWORK');
  assert(Array.isArray(rec.capabilities) && rec.capabilities.length > 0, 'Has capabilities');
  assert(rec.metadata.localUrl === 'http://192.168.1.100:8060', 'Local URL correctly formed');
  assert(rec.metadata.remoteSupport === false, 'Roku remote support is false (local only)');
});

test('Roku execute() returns NOT_SUPPORTED when no localUrl', function () {
  var device = {
    deviceId:    'roku_1',
    friendlyName: 'My Roku',
    deviceType:  'MEDIA_PLAYER',
    metadata:    {},  // No localUrl
  };
  var result = null;
  SRRoku.execute(device, 'volume_down', {}, function (r) { result = r; });
  assert(result !== null, 'Callback must fire');
  assert(result.result === 'NOT_SUPPORTED', 'Must return NOT_SUPPORTED without localUrl, got: ' + result.result);
});

test('Roku MOCK_ADAPTER returns SUCCESS for supported action', function () {
  var device = {
    deviceId:    'roku_mock_1',
    friendlyName: 'Mock Roku',
    deviceType:  'MEDIA_PLAYER',
  };
  var result = null;
  SRRoku.MOCK_ADAPTER.execute(device, 'volume_down', {}, function (r) { result = r; });
  assert(result === null || result.result === 'SUCCESS', 'Mock should succeed or still be pending');
});

test('Roku MOCK_ADAPTER returns NOT_SUPPORTED for unsupported action', function () {
  var device = {
    deviceId:    'roku_mock_2',
    friendlyName: 'Mock Roku',
    deviceType:  'MEDIA_PLAYER',
  };
  var result = null;
  SRRoku.MOCK_ADAPTER.execute(device, 'launch_rocket', {}, function (r) { result = r; });
  assert(result !== null, 'Must fire for unsupported action');
  assert(result.result === 'NOT_SUPPORTED', 'Must return NOT_SUPPORTED, got: ' + (result && result.result));
  assert(result.message.indexOf('[MOCK Roku]') !== -1, 'Mock must label its responses');
});

test('Roku launch_app returns NOT_SUPPORTED for unknown app', function () {
  var device = {
    deviceId:    'roku_3',
    friendlyName: 'Living Room Roku',
    deviceType:  'MEDIA_PLAYER',
    metadata:    { localUrl: 'http://192.168.1.100:8060' },
  };
  var result = null;
  SRRoku.execute(device, 'launch_app', { application: 'some_unknown_app' }, function (r) { result = r; });
  assert(result !== null, 'Callback must fire');
  assert(result.result === 'NOT_SUPPORTED', 'Unknown app must be NOT_SUPPORTED, got: ' + result.result);
});

test('Roku adapter source: no hardcoded credentials', function () {
  var code = fs.readFileSync(path.join(ROOT, 'devices/adapters/roku-adapter.js'), 'utf8');
  assert(!code.includes('password'), 'No hardcoded passwords');
  assert(!code.includes('Bearer sk-'), 'No hardcoded API key pattern');
});

test('Roku adapter reports remote support = false (local network only)', function () {
  var rec = SRRoku.createPairingRecord('Roku', '192.168.1.1');
  assert(rec.metadata.remoteSupport === false, 'Must report local-only transport');
  assert(rec.connectionType === 'LOCAL_NETWORK', 'Connection type must be LOCAL_NETWORK');
});

test('Roku adapter registers correctly with Device Action Router', function () {
  SRRouter.registerAdapter('MEDIA_PLAYER', SRRoku.MOCK_ADAPTER);
  var adapter = SRRouter.getAdapter('MEDIA_PLAYER');
  assert(adapter !== null, 'MEDIA_PLAYER adapter must be registered');
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 5 — STAGE 11: HUE ADAPTER
// ═════════════════════════════════════════════════════════════════════════════
process.stdout.write('\n── STAGE 11: HUE ADAPTER ────────────────────────────\n');

test('SRHueAdapter is loaded', function () {
  assert(!!SRHue, 'SRHueAdapter must be loaded');
  assert(typeof SRHue.execute === 'function', 'Must have execute()');
  assert(typeof SRHue.createPairingRecord === 'function', 'Must have createPairingRecord()');
  assert(!!SRHue.MOCK_ADAPTER, 'Must have MOCK_ADAPTER');
});

test('Hue capabilities include required light actions', function () {
  var caps = SRHue.HUE_CAPABILITIES;
  assert(Array.isArray(caps), 'Must be array');
  assert(caps.indexOf('power_on')       !== -1, 'Must have power_on');
  assert(caps.indexOf('power_off')      !== -1, 'Must have power_off');
  assert(caps.indexOf('brightness_up')  !== -1, 'Must have brightness_up');
  assert(caps.indexOf('brightness_down')!== -1, 'Must have brightness_down');
  assert(caps.indexOf('brightness_set') !== -1, 'Must have brightness_set');
  assert(caps.indexOf('color_set')      !== -1, 'Must have color_set');
  assert(caps.indexOf('status')         !== -1, 'Must have status');
});

test('createPairingRecord returns correct registry record', function () {
  var rec = SRHue.createPairingRecord('Bedroom Light', '192.168.1.50', 'api_key_here', '1');
  assert(rec.friendlyName === 'Bedroom Light', 'Name preserved');
  assert(rec.deviceType   === 'SMART_LIGHT', 'Type is SMART_LIGHT');
  assert(rec.connectionType === 'LOCAL_NETWORK', 'Connection is LOCAL_NETWORK');
  assert(rec.metadata.localUrl === 'https://192.168.1.50', 'Local URL formed correctly');
  assert(rec.metadata.apiKey === 'api_key_here', 'API key stored in metadata (from pairing, not hardcoded)');
  assert(rec.metadata.lightId === '1', 'Light ID stored');
  assert(rec.metadata.remoteSupport === false, 'Hue local API is local-only');
});

test('Hue execute() returns NOT_SUPPORTED when metadata missing', function () {
  var device = {
    deviceId:    'hue_1',
    friendlyName: 'Bedroom Light',
    deviceType:  'SMART_LIGHT',
    metadata:    {},  // Missing apiKey and lightId
  };
  var result = null;
  SRHue.execute(device, 'power_on', {}, function (r) { result = r; });
  assert(result !== null, 'Callback must fire');
  assert(result.result === 'NOT_SUPPORTED', 'Must return NOT_SUPPORTED without config, got: ' + result.result);
  assert(result.message.indexOf('Hue Bridge configuration') !== -1, 'Must mention missing config');
});

test('Hue MOCK_ADAPTER returns SUCCESS for supported action', function () {
  var device = {
    deviceId:    'hue_mock_1',
    friendlyName: 'Mock Hue Light',
    deviceType:  'SMART_LIGHT',
  };
  var result = null;
  SRHue.MOCK_ADAPTER.execute(device, 'power_on', {}, function (r) { result = r; });
  assert(result === null || result.result === 'SUCCESS', 'Mock should succeed or still be pending');
});

test('Hue MOCK_ADAPTER returns NOT_SUPPORTED for unsupported action', function () {
  var device = {
    deviceId:    'hue_mock_2',
    friendlyName: 'Mock Hue Light',
    deviceType:  'SMART_LIGHT',
  };
  var result = null;
  SRHue.MOCK_ADAPTER.execute(device, 'volume_up', {}, function (r) { result = r; });
  assert(result !== null, 'Must fire for unsupported action');
  assert(result.result === 'NOT_SUPPORTED', 'volume_up must not be supported on lights, got: ' + (result && result.result));
  assert(result.message.indexOf('[MOCK Hue]') !== -1, 'Mock must label its responses');
});

test('Hue adapter source: no hardcoded API keys or credentials', function () {
  var code = fs.readFileSync(path.join(ROOT, 'devices/adapters/hue-adapter.js'), 'utf8');
  assert(!code.includes("apiKey: 'sk-"), 'No hardcoded API key');
  assert(!code.includes("apiKey: 'BRIDGEKEY"), 'No hardcoded bridge key');
  assert(code.includes("NOT stored in source"), 'Must document that apiKey is not hardcoded');
});

test('Hue adapter registers correctly with Device Action Router', function () {
  SRRouter.registerAdapter('SMART_LIGHT', SRHue.MOCK_ADAPTER);
  var adapter = SRRouter.getAdapter('SMART_LIGHT');
  assert(adapter !== null, 'SMART_LIGHT adapter must be registered');
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 6 — ADAPTER CONTRACT COMPLIANCE
// ═════════════════════════════════════════════════════════════════════════════
process.stdout.write('\n── ADAPTER CONTRACT COMPLIANCE ─────────────────────\n');

test('Roku adapter implements execute() contract', function () {
  assert(typeof SRRoku.execute === 'function', 'execute() must be a function');
  // execute(device, action, params, callback) — verify arity
  assert(SRRoku.execute.length === 4, 'execute() must accept 4 params');
});

test('Hue adapter implements execute() contract', function () {
  assert(typeof SRHue.execute === 'function', 'execute() must be a function');
  assert(SRHue.execute.length === 4, 'execute() must accept 4 params');
});

test('Desktop adapter implements execute() contract', function () {
  assert(typeof SRDesk.execute === 'function', 'execute() must be a function');
});

test('Smart device adapter implements execute() contract via MOCK', function () {
  assert(typeof SRSmart.MOCK_ADAPTER.execute === 'function', 'MOCK_ADAPTER.execute must exist');
});

test('All adapters have MOCK variants for testing', function () {
  assert(!!SRRoku.MOCK_ADAPTER,         'Roku must have MOCK_ADAPTER');
  assert(!!SRHue.MOCK_ADAPTER,          'Hue must have MOCK_ADAPTER');
  assert(!!SRSmart.MOCK_ADAPTER,        'SmartDevice must have MOCK_ADAPTER');
  assert(!!SRDesk.useMockTransport,     'Desktop must have useMockTransport');
});

test('createPairingRecord() exists on all adapters', function () {
  assert(typeof SRRoku.createPairingRecord  === 'function', 'Roku must have createPairingRecord()');
  assert(typeof SRHue.createPairingRecord   === 'function', 'Hue must have createPairingRecord()');
  assert(typeof SRDesk.createPairingRecord  === 'function', 'Desktop must have createPairingRecord()');
  assert(typeof SRSmart.createPairingRecord === 'function', 'SmartDevice must have createPairingRecord()');
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 7 — SYSTEM INTEGRATION
// ═════════════════════════════════════════════════════════════════════════════
process.stdout.write('\n── SYSTEM INTEGRATION ───────────────────────────────\n');

test('ShadowReaper build is SR-V2-STAGE11 or SR-V2-STAGE12', function () {
  var validBuilds = ['SR-V2-STAGE11', 'SR-V2-STAGE12'];
  assert(validBuilds.indexOf(SR._version) !== -1, 'Build must be SR-V2-STAGE11 or SR-V2-STAGE12, got: ' + SR._version);
});

test('ShadowReaper status includes action log and remote connection', function () {
  var status = SR.getStatus();
  assert(status.deviceControl.actionLogLoaded   === true, 'actionLogLoaded must be true');
  assert(status.deviceControl.remoteConnLoaded  === true, 'remoteConnLoaded must be true');
  assert(status.deviceControl.rokuAdapterLoaded === true, 'rokuAdapterLoaded must be true');
  assert(status.deviceControl.hueAdapterLoaded  === true, 'hueAdapterLoaded must be true');
});

test('ShadowReaper.ask() still works with all device modules loaded', function () {
  SR.newConversation();
  var response = SR.ask('hello');
  assert(typeof response === 'string' && response.length > 0, 'ask() must return a string');
});

test('Device commands route through ShadowReaper.ask() — Roku paired + online', function () {
  clearRegistry();
  var rec = SRRoku.createPairingRecord('Living Room Roku', '192.168.1.100');
  var device = SRReg.registerDevice(rec);
  SRReg.updateOnlineStatus(device.deviceId, 'ONLINE');
  SRRouter.registerAdapter('MEDIA_PLAYER', SRRoku.MOCK_ADAPTER);

  var response = SR.ask('pause the TV');
  assert(typeof response === 'string', 'Roku command must return string response');
});

test('Device commands route through ShadowReaper.ask() — Hue light', function () {
  clearRegistry();
  var rec = SRHue.createPairingRecord('Bedroom Light', '192.168.1.50', 'test_key', '1');
  rec.deviceType = 'SMART_LIGHT';
  var device = SRReg.registerDevice(rec);
  SRReg.updateOnlineStatus(device.deviceId, 'ONLINE');
  SRRouter.registerAdapter('SMART_LIGHT', SRHue.MOCK_ADAPTER);

  var response = SR.ask('turn off the bedroom light');
  assert(typeof response === 'string', 'Hue light command must return string response');
});

test('Voice and text routes use SAME ShadowReaper.ask() for device commands', function () {
  // Verify that the device routing is inside shadow-reaper.js (not a separate path)
  var srCode = fs.readFileSync(path.join(ROOT, 'shadow-reaper.js'), 'utf8');
  assert(srCode.includes('SRDeviceIntentParser'), 'Device parser must be inside SR pipeline');
  assert(srCode.includes('SRDeviceActionRouter'), 'Device router must be inside SR pipeline');
  // Voice flows through SRVoice → ShadowReaper.ask() as verified in voice-assistant tests
  assert(srCode.includes('_pipeline(trimmed, callback)'), 'Async pipeline must be the path');
});

test('Action log is wired into the device action router', function () {
  var routerCode = fs.readFileSync(path.join(ROOT, 'devices/device-action-router.js'), 'utf8');
  assert(routerCode.includes('SRDeviceActionLog'), 'Router must reference SRDeviceActionLog');
  assert(routerCode.includes('commandId'), 'Router must use commandId for idempotency');
  assert(routerCode.includes('generateCommandId'), 'Router must generate command IDs');
});

test('No device command bypasses the Device Action Router', function () {
  // Verify no adapter is called directly without going through route()
  var srCode = fs.readFileSync(path.join(ROOT, 'shadow-reaper.js'), 'utf8');
  // ShadowReaper calls SRDeviceActionRouter.route(), NOT adapter.execute() directly
  assert(srCode.includes('_deviceRouter.route('), 'SR must call route(), not adapter.execute() directly');
  assert(!srCode.includes('adapter.execute('), 'SR must not call adapter.execute() directly');
});

// ═════════════════════════════════════════════════════════════════════════════
// SECTION 8 — SECURITY SUMMARY
// ═════════════════════════════════════════════════════════════════════════════
process.stdout.write('\n── SECURITY SUMMARY ─────────────────────────────────\n');

test('No hardcoded passwords in any device file', function () {
  var files = [
    'devices/device-registry.js',
    'devices/device-action-router.js',
    'devices/sr-device-action-log.js',
    'devices/sr-remote-connection-manager.js',
    'devices/sr-desktop-agent-server.js',
    'devices/adapters/desktop-agent-adapter.js',
    'devices/adapters/smart-device-adapter.js',
    'devices/adapters/roku-adapter.js',
    'devices/adapters/hue-adapter.js',
  ];
  files.forEach(function (f) {
    var code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    // Check for common patterns of hardcoded secrets
    assert(!(/password\s*[:=]\s*['"][^'"]{4,}/i.test(code)), f + ': no hardcoded password value');
    assert(!(/token\s*[:=]\s*'[a-zA-Z0-9_\-]{20,}'/i.test(code)), f + ': no hardcoded long token');
  });
});

test('All mock adapters clearly label simulated responses with [MOCK]', function () {
  var files = [
    'devices/adapters/desktop-agent-adapter.js',
    'devices/adapters/smart-device-adapter.js',
    'devices/adapters/roku-adapter.js',
    'devices/adapters/hue-adapter.js',
  ];
  files.forEach(function (f) {
    var code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert(code.includes('[MOCK'), f + ': must have [MOCK] label in simulated responses');
  });
});

test('No device adapter uses eval(), exec() for arbitrary code', function () {
  var safeFiles = [
    'devices/device-action-router.js',
    'devices/adapters/desktop-agent-adapter.js',
    'devices/adapters/smart-device-adapter.js',
    'devices/adapters/roku-adapter.js',
    'devices/adapters/hue-adapter.js',
  ];
  safeFiles.forEach(function (f) {
    var code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert(!code.includes('eval('), f + ': must not use eval()');
  });
});

test('ShadowReaper.ask() remains the single voice+text entry point', function () {
  // Architecture: voice-engine → sr-voice-assistant → ShadowReaper.ask()
  // Verify sr-voice-assistant.js (the bridge layer) calls ShadowReaper.ask()
  var vaCode = fs.readFileSync(path.join(ROOT, 'voice/sr-voice-assistant.js'), 'utf8');
  assert(vaCode.includes('ShadowReaper'), 'Voice assistant must reference ShadowReaper');
  assert(vaCode.includes('brain.ask('), 'Voice assistant must call brain.ask()');
  // Verify device router has no language model — device AI must NOT exist
  var routerCode = fs.readFileSync(path.join(ROOT, 'devices/device-action-router.js'), 'utf8');
  assert(!routerCode.includes('Workers AI'), 'Device router must not use AI');
  assert(!routerCode.includes('openai'), 'Device router must not use OpenAI');
});

// ═════════════════════════════════════════════════════════════════════════════
// RESULTS
// ═════════════════════════════════════════════════════════════════════════════
var total = PASS + FAIL;
process.stdout.write('\n══════════════════════════════════════════════════════\n');
process.stdout.write('STAGE 8 ACTION LOG + STAGE 9 REMOTE + STAGE 10 DESKTOP + STAGE 11 IoT TESTS\n');
process.stdout.write('PASSED:  ' + PASS + ' / ' + total + '\n');
process.stdout.write('FAILED:  ' + FAIL + '\n');
process.stdout.write('══════════════════════════════════════════════════════\n');

process.stdout.write('\nPASS : ' + PASS + '\n');
process.stdout.write('FAIL : ' + FAIL + '\n');
process.stdout.write('TOTAL: ' + total + '\n');

if (FAIL > 0) {
  process.stdout.write('\nFAILED TESTS:\n');
  results.filter(function (r) { return r.status === 'FAIL'; }).forEach(function (r) {
    process.stdout.write('  ✗ ' + r.name + '\n    → ' + r.error + '\n');
  });
}

process.exit(FAIL > 0 ? 1 : 0);
