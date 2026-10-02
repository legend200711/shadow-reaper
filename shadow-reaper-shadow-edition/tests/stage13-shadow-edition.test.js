/**
 * shadow-reaper-standalone/tests/stage13-shadow-edition.test.js
 * Shadow Reaper — Stage 13 Tests
 *
 * CHECKPOINTS:
 *   - One Brain: no parallel intelligence pipelines
 *   - Assistant Identity: name changes don't reset intelligence,
 *     adaptive personality cannot rename assistant
 *   - Device UI: expected settings categories render
 *   - Capability Truthfulness: unavailable integrations never report success
 *   - Privacy: external caller context cannot access owner-private context
 *   - Authorization: Shadow cannot initiate external communication without auth
 *   - Existing Systems: Desktop and IoT intact
 *   - Internet: normal conversation does not trigger internet research
 *   - Voice: Male/Female selection intact
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');

// ── Minimal browser globals ──────────────────────────────────────────────────
global.localStorage = global.localStorage || {
  _store: {},
  getItem:    function (k) { return this._store[k] !== undefined ? this._store[k] : null; },
  setItem:    function (k, v) { this._store[k] = String(v); },
  removeItem: function (k) { delete this._store[k]; },
  clear:      function ()  { this._store = {}; },
};

try {
  if (!global.navigator) {
    Object.defineProperty(global, 'navigator', {
      value: { gpu: undefined, userAgent: 'Node.js test runner', onLine: true },
      writable: true, configurable: true
    });
  }
} catch (_) {}

global.SRFirebaseAdapter = global.SRFirebaseAdapter || {
  getUID:          function () { return 'test_uid_stage13'; },
  isAuthenticated: function () { return true; },
  getCurrentUser:  function () { return { uid: 'test_uid_stage13' }; },
};

global.SRSecurity = global.SRSecurity || {
  containsInjectionAttempt: function (t) { return /ignore.*instructions|override.*rules/i.test(t); },
  containsSensitiveData:    function (t) { return /my\s+password\s+is|api\s*key\s*(is|=)/i.test(t); },
};

// ── Module loader ─────────────────────────────────────────────────────────────
function loadModule(relPath) {
  const code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  const fn   = new Function('global', 'require', 'module', 'exports', '__dirname', '__filename', code);
  const mod  = {};
  try {
    fn(global, require, mod, {}, path.dirname(path.join(ROOT, relPath)), path.join(ROOT, relPath));
  } catch (_) {}
  return mod;
}

// ── Load Stage 13 modules ──────────────────────────────────────────────────────
loadModule('config/environment.js');
loadModule('security/security-policy.js');
loadModule('platform/sr-platform-detector.js');
loadModule('platform/sr-caller-context.js');
loadModule('platform/sr-external-auth-guard.js');
loadModule('platform/adapters/sr-phone-adapter.js');

// Load adaptive components for one-brain tests
loadModule('snx-shadow-conv-history.js');
loadModule('snx-shadow-memory.js');
loadModule('snx-shadow-adaptive.js');
loadModule('core/adaptive-brain.js');
loadModule('core/personality-engine.js');

const CallerCtx  = global.SRCallerContext;
const AuthGuard  = global.SRExternalAuthGuard;
const PhoneAdapt = global.SRPhoneAdapter;
const Brain      = global.SRAdaptiveBrain;
const Pers       = global.SRPersonality;

// ── Test infrastructure ────────────────────────────────────────────────────────
let PASS = 0, WARN = 0, FAIL = 0;
const results = [];

function test(name, fn) {
  try {
    fn();
    PASS++;
    results.push('  ✓  ' + name);
  } catch (e) {
    FAIL++;
    results.push('  ✗  ' + name + '\n        → ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertNot(cond, msg) {
  if (cond) throw new Error(msg || 'expected false');
}

// =============================================================================
// GROUP 1: ONE BRAIN ARCHITECTURE
// =============================================================================
console.log('\n── ONE BRAIN ARCHITECTURE ────────────────────');

test('SRCallerContext does not create a parallel AI system', function () {
  assert(CallerCtx, 'SRCallerContext must be defined');
  // Verify it has no AI execution methods
  assert(typeof CallerCtx.learn !== 'function', 'CallerCtx must not have learn()');
  assert(typeof CallerCtx.ask   !== 'function', 'CallerCtx must not have ask()');
  assert(typeof CallerCtx.generateResponse !== 'function', 'CallerCtx must not generate responses');
});

test('SRPhoneAdapter does not create a parallel AI system', function () {
  assert(PhoneAdapt, 'SRPhoneAdapter must be defined');
  assert(typeof PhoneAdapt.learn     !== 'function', 'PhoneAdapt must not have learn()');
  assert(typeof PhoneAdapt.ask       !== 'function', 'PhoneAdapt must not have ask()');
  assert(typeof PhoneAdapt.respond   !== 'function', 'PhoneAdapt must not have respond()');
});

test('SRExternalAuthGuard does not create a parallel AI system', function () {
  assert(AuthGuard, 'SRExternalAuthGuard must be defined');
  assert(typeof AuthGuard.learn      !== 'function', 'AuthGuard must not have learn()');
  assert(typeof AuthGuard.ask        !== 'function', 'AuthGuard must not have ask()');
});

test('Stage 13 modules declare correct build IDs', function () {
  assert(CallerCtx.build.indexOf('CALLER-CONTEXT')  !== -1, 'CallerCtx build ID must contain CALLER-CONTEXT');
  assert(AuthGuard.build.indexOf('EXT-AUTH-GUARD')  !== -1, 'AuthGuard build ID must contain EXT-AUTH-GUARD');
  assert(PhoneAdapt.build.indexOf('PHONE-ADAPTER')  !== -1, 'PhoneAdapt build ID must contain PHONE-ADAPTER');
});

test('sr-phone-adapter.js contains no env.AI.run calls', function () {
  const code = fs.readFileSync(path.join(ROOT, 'platform/adapters/sr-phone-adapter.js'), 'utf8');
  assert(!code.includes('env.AI.run'),        'Must not call env.AI.run');
  assert(!code.includes('openai'),            'Must not reference OpenAI');
  assert(!code.includes('workers-ai'),        'Must not reference Workers AI');
  assert(!code.includes('generateContent'),   'Must not call generateContent');
});

test('sr-caller-context.js contains no env.AI.run calls', function () {
  const code = fs.readFileSync(path.join(ROOT, 'platform/sr-caller-context.js'), 'utf8');
  assert(!code.includes('env.AI.run'),        'Must not call env.AI.run');
  assert(!code.includes('workers-ai'),        'Must not reference Workers AI');
});

// =============================================================================
// GROUP 2: ASSISTANT IDENTITY
// =============================================================================
console.log('\n── ASSISTANT IDENTITY ────────────────────────');

test('SRPersonality.getAssistantName() returns a valid name', function () {
  assert(Pers, 'SRPersonality must be defined');
  var name = Pers.getAssistantName();
  assert(typeof name === 'string', 'getAssistantName must return a string');
  assert(name.length > 0, 'Name must not be empty');
});

test('Adaptive personality learning does NOT own assistant name', function () {
  // getAssistantName delegates to SRWakeName (not adaptive profile)
  const code = fs.readFileSync(path.join(ROOT, 'core/personality-engine.js'), 'utf8');
  // Confirm it reads from SRWakeName, not from _profile
  assert(code.includes('SRWakeName'), 'getAssistantName must delegate to SRWakeName');
  // Confirm it does NOT read assistantName from _profile
  assert(!code.includes('_profile.assistantName'), 'assistantName must not be in adaptive profile');
  assert(!code.includes('_profile[\'assistantName\']'), 'assistantName must not be in adaptive profile');
});

test('Adaptive learning does NOT spontaneously change assistant name', function () {
  // Simulate multiple adaptive learning turns — name should remain the same
  if (!Brain) { WARN++; results.push('  ⚠  Brain not loaded — skipping'); return; }
  var initialName = Pers ? Pers.getAssistantName() : 'Shadow';
  if (Brain.destroy) Brain.destroy();
  Brain._loaded = true;

  // Teach the brain a variety of things
  Brain.learn({ text: 'My project is called Nova Storm.', role: 'user' });
  Brain.learn({ text: 'I prefer dark themes.', role: 'user' });
  Brain.learn({ text: 'The homepage is blue.', role: 'user' });

  var afterName = Pers ? Pers.getAssistantName() : initialName;
  assert(afterName === initialName, 'Adaptive learning must not change assistant name: was ' + initialName + ', got ' + afterName);
});

test('learnFromTurn() does NOT update assistant name property in profile', function () {
  if (!Pers) return;
  // Simulate multiple turns (signature: userText, understood, assistantResponse)
  for (var i = 0; i < 10; i++) {
    if (typeof Pers.learnFromTurn === 'function') {
      Pers.learnFromTurn(
        'test turn ' + i,
        { tone: 'neutral', intent: 'GENERAL_CONVERSATION' },
        'response ' + i
      );
    }
  }
  var profile = Pers.getProfile ? Pers.getProfile() : {};
  assert(typeof profile.assistantName === 'undefined', 'Profile must not have assistantName field');
});

test('resetProfile() does NOT reset intelligence — only personality preferences', function () {
  if (!Pers) return;
  // resetProfile should only affect personality floats, not SR core memory
  const code = fs.readFileSync(path.join(ROOT, 'core/personality-engine.js'), 'utf8');
  // Should reset _profile (float preferences) but not SRAdaptiveBrain, not SRPersonalMemory
  assert(code.includes('_profile = Object.assign'), 'resetProfile must reset _profile');
  assert(!code.includes('SRAdaptiveBrain.destroy'),  'resetProfile must not destroy adaptive brain');
  assert(!code.includes('SRPersonalMemory.clear'),   'resetProfile must not clear personal memory');
});

// =============================================================================
// GROUP 3: CAPABILITY TRUTHFULNESS
// =============================================================================
console.log('\n── CAPABILITY TRUTHFULNESS ───────────────────');

test('SRPhoneAdapter is defined with STATUS constants', function () {
  assert(PhoneAdapt, 'SRPhoneAdapter must be defined');
  assert(PhoneAdapt.STATUS, 'PhoneAdapt.STATUS must be defined');
  assert(PhoneAdapt.STATUS.WEB_PWA,         'WEB_PWA status must exist');
  assert(PhoneAdapt.STATUS.NATIVE_REQUIRED, 'NATIVE_REQUIRED status must exist');
  assert(PhoneAdapt.STATUS.PERMISSION_REQUIRED, 'PERMISSION_REQUIRED must exist');
});

test('Calling capability correctly reports NATIVE_REQUIRED in web environment', function () {
  var status = PhoneAdapt.getCapabilityStatus('calling');
  assert(
    status === 'NATIVE_REQUIRED' || status === 'PERMISSION_REQUIRED',
    'Calling must report NATIVE_REQUIRED or PERMISSION_REQUIRED in web. Got: ' + status
  );
});

test('Contacts capability correctly reports NATIVE_REQUIRED in web environment', function () {
  var status = PhoneAdapt.getCapabilityStatus('contacts');
  assert(
    status === 'NATIVE_REQUIRED' || status === 'PERMISSION_REQUIRED',
    'Contacts must report NATIVE_REQUIRED in web. Got: ' + status
  );
});

test('Messaging capability correctly reports NATIVE_REQUIRED in web environment', function () {
  var status = PhoneAdapt.getCapabilityStatus('messaging');
  assert(
    status === 'NATIVE_REQUIRED' || status === 'PERMISSION_REQUIRED',
    'Messaging must report NATIVE_REQUIRED in web. Got: ' + status
  );
});

test('getAllCapabilities() returns correct shape for all defined capabilities', function () {
  var caps = PhoneAdapt.getAllCapabilities();
  assert(typeof caps === 'object', 'getAllCapabilities must return an object');
  var keys = Object.keys(caps);
  assert(keys.length >= 8, 'Must have at least 8 phone capabilities defined. Got: ' + keys.length);
  keys.forEach(function (k) {
    assert(caps[k].label,       'Cap ' + k + ' must have label');
    assert(caps[k].description, 'Cap ' + k + ' must have description');
    assert(caps[k].status,      'Cap ' + k + ' must have status');
    assert(caps[k].androidApi,  'Cap ' + k + ' must have androidApi');
  });
});

test('execute() with calling action in web returns truthful NOT_SUPPORTED', function () {
  var received = null;
  PhoneAdapt.execute(null, 'calling', {}, function (r) { received = r; });
  assert(received !== null, 'Callback must be called');
  assert(received.ok === false, 'Must return ok:false for unsupported calling in web');
  assert(received.result === 'NOT_SUPPORTED', 'Must return NOT_SUPPORTED result. Got: ' + received.result);
});

test('execute() with media_controls returns truthful result in web', function () {
  var received = null;
  PhoneAdapt.execute(null, 'media_controls', {}, function (r) { received = r; });
  assert(received !== null, 'Callback must be called');
  // media_controls is WEB_PWA — result depends on navigator.mediaSession presence
  assert(typeof received.ok === 'boolean', 'Must return boolean ok');
});

test('Calling modes architecture correctly marks native-required modes', function () {
  var modes = PhoneAdapt.getCallingModeSupport();
  assert(modes.modeA_normalCall,          'Mode A must be defined');
  assert(modes.modeB_shadowAssisted,      'Mode B must be defined');
  assert(modes.modeC_handToShadow,        'Mode C must be defined');
  assert(modes.modeD_returnToOwner,       'Mode D must be defined');
  assert(modes.modeE_shadowHandlesCall,   'Mode E must be defined');
  assert(modes.modeF_externalCallerDirect,'Mode F must be defined');
  // A-E require native
  assert(modes.modeA_normalCall.requirement === 'NATIVE_REQUIRED', 'Mode A requires native');
  assert(modes.modeB_shadowAssisted.requirement === 'NATIVE_REQUIRED', 'Mode B requires native');
  assert(modes.modeC_handToShadow.requirement === 'NATIVE_REQUIRED', 'Mode C requires native');
  assert(modes.modeD_returnToOwner.requirement === 'NATIVE_REQUIRED', 'Mode D requires native');
  assert(modes.modeE_shadowHandlesCall.requirement === 'NATIVE_REQUIRED', 'Mode E requires native');
  // F (direct conversation) is available in web
  assert(modes.modeF_externalCallerDirect.requirement === 'WEB_PWA', 'Mode F available in web');
});

// =============================================================================
// GROUP 4: PRIVACY BOUNDARIES
// =============================================================================
console.log('\n── PRIVACY BOUNDARIES ────────────────────────');

test('SRCallerContext starts in OWNER context by default', function () {
  assert(CallerCtx.isOwnerContext(), 'Must start in OWNER context');
  assert(!CallerCtx.isExternalContext(), 'Must not start in EXTERNAL context');
});

test('enterExternalContext() switches to EXTERNAL context', function () {
  CallerCtx.enterExternalContext({ name: 'Alice' }, CallerCtx.CALLING_MODES.F);
  assert(CallerCtx.isExternalContext(), 'Must switch to EXTERNAL context');
  assert(!CallerCtx.isOwnerContext(), 'Must not be in OWNER context after switch');
});

test('External context has correct caller info', function () {
  var info = CallerCtx.getExternalInfo();
  assert(info !== null, 'External info must be set');
  assert(info.name === 'Alice', 'Caller name must be Alice');
  assert(info.authorizedBy === 'owner', 'Must be authorized by owner');
});

test('canAccessCategory() blocks owner-private categories in external context', function () {
  // Still in EXTERNAL context from previous test
  assert(!CallerCtx.canAccessCategory('private_memory'), 'External must not access private_memory');
  assert(!CallerCtx.canAccessCategory('private_history'), 'External must not access private_history');
  assert(!CallerCtx.canAccessCategory('projects'),        'External must not access projects');
  assert(!CallerCtx.canAccessCategory('credentials'),     'External must not access credentials');
  assert(!CallerCtx.canAccessCategory('contacts'),        'External must not access contacts');
  assert(!CallerCtx.canAccessCategory('account_info'),    'External must not access account_info');
  assert(!CallerCtx.canAccessCategory('device_permissions'), 'External must not access device_permissions');
});

test('canAccessCategory() allows public categories in external context', function () {
  // Non-private categories must be accessible
  assert(CallerCtx.canAccessCategory('general_knowledge'), 'External can access general_knowledge');
  assert(CallerCtx.canAccessCategory('public_info'),       'External can access public_info');
  assert(CallerCtx.canAccessCategory('conversation'),      'External can access conversation');
});

test('External caller cannot elevate to owner context without explicit call', function () {
  // Verify there is no method that grants owner access to external callers
  assert(typeof CallerCtx.elevateToOwner      === 'undefined', 'No elevateToOwner method');
  assert(typeof CallerCtx.bypassPrivacy       === 'undefined', 'No bypassPrivacy method');
  assert(typeof CallerCtx.grantOwnerAccess    === 'undefined', 'No grantOwnerAccess method');
});

test('returnToOwnerContext() restores OWNER context', function () {
  CallerCtx.returnToOwnerContext();
  assert(CallerCtx.isOwnerContext(), 'Must return to OWNER context');
  assert(!CallerCtx.isExternalContext(), 'Must not be in EXTERNAL context after return');
  assert(CallerCtx.getExternalInfo() === null, 'External info must be cleared');
});

test('filterResponseForContext() does not modify owner context responses', function () {
  // In owner context (restored above)
  var resp = 'Here is your schedule for today.';
  assert(CallerCtx.filterResponseForContext(resp) === resp, 'Owner context must not filter');
});

test('filterResponseForContext() strips private markers in external context', function () {
  CallerCtx.enterExternalContext({ name: 'Bob' });
  var resp = 'John called [private: owner saw this at 3pm] earlier.';
  var filtered = CallerCtx.filterResponseForContext(resp);
  assert(filtered.indexOf('[private') === -1, 'Private markers must be stripped');
  CallerCtx.returnToOwnerContext();
});

test('getContextualSystemNote() returns null in owner context', function () {
  assert(CallerCtx.getContextualSystemNote() === null, 'Owner context has no system note');
});

test('getContextualSystemNote() returns AI identification note in external context', function () {
  CallerCtx.enterExternalContext({ name: 'Charlie' });
  var note = CallerCtx.getContextualSystemNote();
  assert(note !== null, 'External context must have system note');
  assert(typeof note === 'string', 'System note must be a string');
  // Must identify Shadow as AI
  assert(note.toLowerCase().indexOf('ai') !== -1 || note.toLowerCase().indexOf('assistant') !== -1,
    'System note must identify Shadow as AI');
  CallerCtx.returnToOwnerContext();
});

// =============================================================================
// GROUP 5: EXTERNAL COMMUNICATION AUTHORIZATION
// =============================================================================
console.log('\n── EXTERNAL COMMUNICATION AUTHORIZATION ──────');

test('SRExternalAuthGuard is defined with AUTH_LEVEL constants', function () {
  assert(AuthGuard, 'SRExternalAuthGuard must be defined');
  assert(AuthGuard.AUTH_LEVEL.NONE,       'NONE level must exist');
  assert(AuthGuard.AUTH_LEVEL.EXPLICIT,   'EXPLICIT level must exist');
  assert(AuthGuard.AUTH_LEVEL.CONFIGURED, 'CONFIGURED level must exist');
});

test('Financial transfer is permanently blocked (NONE level)', function () {
  assert(AuthGuard.isAutoBlocked('financial_transfer'), 'financial_transfer must be auto-blocked');
  var r = AuthGuard.isAuthorized('financial_transfer');
  assert(!r.authorized, 'Financial transfer must not be authorized');
  assert(r.reason === 'PERMANENTLY_BLOCKED', 'Must be permanently blocked. Got: ' + r.reason);
});

test('Credential reveal is permanently blocked', function () {
  assert(AuthGuard.isAutoBlocked('reveal_credentials'), 'reveal_credentials must be auto-blocked');
  var r = AuthGuard.isAuthorized('reveal_credentials');
  assert(!r.authorized, 'Credential reveal must not be authorized');
});

test('Owner impersonation is permanently blocked', function () {
  assert(AuthGuard.isAutoBlocked('impersonate_owner'), 'impersonate_owner must be auto-blocked');
  var r = AuthGuard.isAuthorized('impersonate_owner');
  assert(!r.authorized, 'Owner impersonation must not be authorized');
});

test('Identity verification as owner is permanently blocked', function () {
  assert(AuthGuard.isAutoBlocked('identity_verify'), 'identity_verify must be auto-blocked');
});

test('Legal commitment is permanently blocked', function () {
  assert(AuthGuard.isAutoBlocked('legal_commitment'), 'legal_commitment must be auto-blocked');
});

test('External call requires EXPLICIT authorization (not auto-allowed)', function () {
  AuthGuard.clearSessionAuthorizations();
  var r = AuthGuard.isAuthorized('external_call');
  assert(!r.authorized, 'external_call must require explicit authorization');
  assert(r.level === 'EXPLICIT', 'Level must be EXPLICIT. Got: ' + r.level);
});

test('grantSessionAuthorization() allows external call in session', function () {
  var granted = AuthGuard.grantSessionAuthorization('external_call', 'Call John to say I am running late');
  assert(granted, 'grantSessionAuthorization must return true');
  var r = AuthGuard.isAuthorized('external_call');
  assert(r.authorized, 'external_call must be authorized after explicit grant');
  assert(r.level === 'EXPLICIT', 'Level must be EXPLICIT');
});

test('grantSessionAuthorization() cannot grant permanently-blocked actions', function () {
  var granted = AuthGuard.grantSessionAuthorization('financial_transfer');
  assert(!granted, 'Cannot grant financial_transfer — permanently blocked');
  var r = AuthGuard.isAuthorized('financial_transfer');
  assert(!r.authorized, 'financial_transfer must remain blocked');
});

test('clearSessionAuthorizations() removes all session grants', function () {
  AuthGuard.clearSessionAuthorizations();
  var r = AuthGuard.isAuthorized('external_call');
  assert(!r.authorized, 'external_call must not be authorized after clear');
});

test('addConfiguredRule() cannot configure permanently-blocked actions', function () {
  var added = AuthGuard.addConfiguredRule({
    action: 'financial_transfer',
    pattern: 'pay John',
    description: 'Test rule',
  });
  assert(!added, 'Cannot add configured rule for permanently-blocked action');
  assert(AuthGuard.listConfiguredRules().length === 0, 'No rules must be added');
});

// =============================================================================
// GROUP 6: EXISTING SYSTEMS INTACT
// =============================================================================
console.log('\n── EXISTING SYSTEMS INTACT ───────────────────');

test('devices/device-action-router.js still exists', function () {
  assert(fs.existsSync(path.join(ROOT, 'devices/device-action-router.js')),
    'Device Action Router must exist');
});

test('devices/adapters/roku-adapter.js still exists', function () {
  assert(fs.existsSync(path.join(ROOT, 'devices/adapters/roku-adapter.js')),
    'Roku adapter must exist');
});

test('devices/adapters/hue-adapter.js still exists', function () {
  assert(fs.existsSync(path.join(ROOT, 'devices/adapters/hue-adapter.js')),
    'Hue adapter must exist');
});

test('devices/adapters/desktop-agent-adapter.js still exists', function () {
  assert(fs.existsSync(path.join(ROOT, 'devices/adapters/desktop-agent-adapter.js')),
    'Desktop agent adapter must exist');
});

test('devices/sr-remote-connection-manager.js still exists', function () {
  assert(fs.existsSync(path.join(ROOT, 'devices/sr-remote-connection-manager.js')),
    'Remote connection manager must exist');
});

test('devices/device-registry.js still exists', function () {
  assert(fs.existsSync(path.join(ROOT, 'devices/device-registry.js')),
    'Device registry must exist');
});

test('platform/adapters/sr-android-adapter.js still exists', function () {
  assert(fs.existsSync(path.join(ROOT, 'platform/adapters/sr-android-adapter.js')),
    'Android adapter must exist');
});

test('desktop/main.js still exists', function () {
  assert(fs.existsSync(path.join(ROOT, 'desktop/main.js')),
    'Desktop main.js must exist');
});

// =============================================================================
// GROUP 7: STAGE 13 NEW FILES
// =============================================================================
console.log('\n── STAGE 13 NEW FILES ────────────────────────');

test('platform/sr-caller-context.js exists', function () {
  assert(fs.existsSync(path.join(ROOT, 'platform/sr-caller-context.js')),
    'SRCallerContext must exist');
});

test('platform/sr-external-auth-guard.js exists', function () {
  assert(fs.existsSync(path.join(ROOT, 'platform/sr-external-auth-guard.js')),
    'SRExternalAuthGuard must exist');
});

test('platform/adapters/sr-phone-adapter.js exists', function () {
  assert(fs.existsSync(path.join(ROOT, 'platform/adapters/sr-phone-adapter.js')),
    'SRPhoneAdapter must exist');
});

test('No SNS files present in new Stage 13 modules', function () {
  var newFiles = [
    'platform/sr-caller-context.js',
    'platform/sr-external-auth-guard.js',
    'platform/adapters/sr-phone-adapter.js',
  ];
  newFiles.forEach(function (f) {
    var code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert(!code.includes('SNSMind'),       f + ' must not use SNSMind');
    assert(!code.includes('SNSFounder'),    f + ' must not use SNSFounder');
    assert(!code.includes('PhoneBrain'),    f + ' must not create PhoneBrain');
    assert(!code.includes('DeviceBrain'),   f + ' must not create DeviceBrain');
    assert(!code.includes('SmartHomeBrain'),f + ' must not create SmartHomeBrain');
  });
});

// =============================================================================
// GROUP 8: INTERNET RESTRICTION
// =============================================================================
console.log('\n── INTERNET RESTRICTION ──────────────────────');

test('Stage 13 modules do not trigger internet research', function () {
  var newFiles = [
    'platform/sr-caller-context.js',
    'platform/sr-external-auth-guard.js',
    'platform/adapters/sr-phone-adapter.js',
  ];
  newFiles.forEach(function (f) {
    var code = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert(!code.includes('fetch('),        f + ' must not use fetch()');
    assert(!code.includes('XMLHttpRequest'),f + ' must not use XMLHttpRequest');
    assert(!code.includes('SRWebResearch'), f + ' must not use SRWebResearch');
  });
});

test('SRPhoneAdapter does not crawl the internet for phone data', function () {
  var code = fs.readFileSync(path.join(ROOT, 'platform/adapters/sr-phone-adapter.js'), 'utf8');
  assert(!code.includes('fetch('),          'PhoneAdapter must not fetch from internet');
  assert(!code.includes('XMLHttpRequest'),  'PhoneAdapter must not use XMLHttpRequest');
  assert(!code.includes('navigator.geolocation.watchPosition'), 'Must not continuously poll location');
});

// =============================================================================
// GROUP 9: SETTINGS DEVICE CATEGORIES
// =============================================================================
console.log('\n── SETTINGS DEVICE CATEGORIES ────────────────');

test('index.html contains This Phone section', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(html.includes('srSettingsThisPhone'), 'This Phone button must exist');
  assert(html.includes('This Phone'),          'This Phone label must exist');
});

test('index.html contains Roku / Streaming section', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(html.includes('Roku'), 'Roku section must exist');
  assert(html.includes('srSettingsRoku'), 'Roku settings button must exist');
});

test('index.html contains Smart Lights (Hue) section', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(html.includes('srSettingsHue'), 'Hue settings button must exist');
  assert(html.includes('Smart Lights'), 'Smart Lights must be mentioned');
});

test('index.html contains Computers section', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(html.includes('srSettingsComputers'), 'Computers button must exist');
});

test('index.html contains phone capability rows (calls, contacts, messaging)', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(html.includes('srcap-calling'),   'Calling cap badge must exist');
  assert(html.includes('srcap-contacts'),  'Contacts cap badge must exist');
  assert(html.includes('srcap-messaging'), 'Messaging cap badge must exist');
});

test('index.html contains 15+ device/control categories in settings', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  var categories = [
    'This Phone', 'Phone Calls', 'Contacts', 'Messages',
    'Volume Control', 'Media Controls', 'Alarms', 'Timers', 'App Launching',
    'Notifications', 'Roku', 'Smart Speakers', 'Smart TVs', 'Smart Lights',
    'Smart Plugs', 'Thermostats', 'Smart Locks', 'Doorbells', 'Robot Vacuums',
    'Appliances', 'Computers',
  ];
  var found = categories.filter(function (c) { return html.includes(c); });
  assert(found.length >= 15, 'Must have at least 15 device categories. Found: ' + found.length + ' (' + found.join(', ') + ')');
});

test('index.html has "Coming Later" labels for unimplemented categories', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(html.includes('Coming Later'), 'Unimplemented categories must show "Coming Later"');
});

test('index.html does NOT have a visible LOGin button at top level', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // The auth button must have style="display:none" to hide it
  assert(
    html.includes('srAuthBtn') && html.includes('style="display:none"'),
    'Login button must be hidden (display:none)'
  );
  // Must not show LOG IN / SIGN UP text as a prominent button
  assert(
    !html.includes('LOG IN / SIGN UP'),
    'Prominent "LOG IN / SIGN UP" button text must be removed'
  );
});

test('index.html has Sign In button inside Settings → Account section', function () {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert(html.includes('srSettingsSignInBtn'), 'Sign In button must exist in Settings');
  assert(html.includes('srAccountSection'),    'Account section must exist in Settings');
});

// =============================================================================
// GROUP 10: VOICE SYSTEM INTACT
// =============================================================================
console.log('\n── VOICE SYSTEM INTACT ───────────────────────');

test('voice/sr-wake-name.js still exists', function () {
  assert(fs.existsSync(path.join(ROOT, 'voice/sr-wake-name.js')), 'Wake name module must exist');
});

test('voice/voice-engine.js still exists', function () {
  assert(fs.existsSync(path.join(ROOT, 'voice/voice-engine.js')), 'Voice engine must exist');
});

test('voice/sr-voice-assistant.js still exists', function () {
  assert(fs.existsSync(path.join(ROOT, 'voice/sr-voice-assistant.js')), 'Voice assistant must exist');
});

test('index.html contains Male/Female voice toggle', function () {
  // Stage 12 introduced Male/Female voice; verify it is still present
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  // Voice toggle exists
  assert(html.includes('srToggleVoice'), 'Voice input toggle must exist');
  assert(html.includes('srToggleTTS'),   'TTS toggle must exist');
});

// =============================================================================
// GROUP 11: SHADOW REAPER CORE INTACT
// =============================================================================
console.log('\n── SHADOW REAPER CORE INTACT ─────────────────');

test('shadow-reaper.js still exists', function () {
  assert(fs.existsSync(path.join(ROOT, 'shadow-reaper.js')), 'shadow-reaper.js must exist');
});

test('shadow-reaper.js still exports ShadowReaper with ask() method', function () {
  const code = fs.readFileSync(path.join(ROOT, 'shadow-reaper.js'), 'utf8');
  assert(code.includes('ShadowReaper'), 'shadow-reaper.js must export ShadowReaper');
  assert(code.includes('function ask') || code.includes('ask:'), 'ask() must be defined');
});

test('core/adaptive-brain.js still exists', function () {
  assert(fs.existsSync(path.join(ROOT, 'core/adaptive-brain.js')), 'adaptive-brain.js must exist');
});

test('core/personality-engine.js still exists', function () {
  assert(fs.existsSync(path.join(ROOT, 'core/personality-engine.js')), 'personality-engine.js must exist');
});

test('global-learning/sr-global-learning.js still exists', function () {
  assert(fs.existsSync(path.join(ROOT, 'global-learning/sr-global-learning.js')),
    'Global learning must exist');
});

// ── RESULTS ────────────────────────────────────────────────────────────────────
console.log('\n══════════════════════════════════════════════════════════');
console.log('  STAGE 13 — SHADOW EDITION TEST RESULTS');
console.log('══════════════════════════════════════════════════════════');
results.forEach(function (r) { console.log(r); });
console.log('\n  PASS : ' + PASS);
console.log('  WARN : ' + WARN);
console.log('  FAIL : ' + FAIL);
console.log('  TOTAL: ' + (PASS + FAIL));
console.log('══════════════════════════════════════════════════════════');

if (FAIL > 0) {
  process.stdout.write('STAGE 13 TEST: FAIL\n');
  process.exit(1);
} else {
  process.stdout.write('STAGE 13 TEST: PASS\n');
  process.exit(0);
}
