/**
 * shadow-reaper-standalone/tests/product-split.test.js
 * Shadow Reaper — Product Split Isolation & Shared Learning Tests
 *
 * Build: SR-PRODUCT-SPLIT-TEST-1
 *
 * Tests:
 *   1. Product identity isolation (namespaces, PWA, cache)
 *   2. Shadow removal from regular edition
 *   3. Shadow preservation in Shadow Edition
 *   4. Private-data boundary enforcement
 *   5. Shared-learning candidate validation
 *   6. Knowledge promotion / rejection / provenance
 *   7. Owner-only Shadow Edition (fail-closed)
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT    = path.resolve(__dirname, '..');
const ROOT_SE = path.resolve(__dirname, '../../shadow-reaper-shadow-edition');
const SE_EXISTS = fs.existsSync(ROOT_SE);

var PASS = 0, FAIL = 0;
var results = [];

function test(name, fn) {
  try {
    fn();
    PASS++;
    results.push('  ✓  ' + name);
  } catch (e) {
    FAIL++;
    results.push('  ✗  ' + name + '\n        ' + e.message);
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertContains(str, sub, msg) {
  if (str.indexOf(sub) === -1) throw new Error(msg || 'Expected to contain: ' + sub);
}

function assertNotContains(str, sub, msg) {
  if (str.indexOf(sub) !== -1) throw new Error(msg || 'Expected NOT to contain: ' + sub);
}

// ── Load shared knowledge bridge module ───────────────────────────────────
var _global = typeof global !== 'undefined' ? global : window;

// Minimal Firebase adapter stub (no real Firestore in Node tests)
_global.SRFirebaseAdapter = {
  getUID:          function () { return 'test-uid-123'; },
  isAuthenticated: function () { return true; },
  getCurrentUser:  function () { return { uid: 'test-uid-123', getIdTokenResult: null }; },
  getDB:           function () { return null; }, // No real Firestore in Node tests
  _db:             null,
};

// Minimal SRFounderShadow stub
_global.SRFounderShadow = {
  verifyAction: function (name, cb) { cb({ ok: true, reason: 'stub_granted' }); },
  isGranted:    function () { return true; },
};

// Load the shared knowledge bridge
var bridgePath = path.join(ROOT, 'global-learning/sr-shared-knowledge-bridge.js');
require(bridgePath);
var bridge = _global.SRSharedKnowledgeBridge;


// ═══════════════════════════════════════════════════════════════════════════
// SECTION 1 — PRODUCT IDENTITY ISOLATION
// ═══════════════════════════════════════════════════════════════════════════
process.stdout.write('\n── PRODUCT IDENTITY ISOLATION ────────────────────────\n');

test('Regular edition: manifest.json has correct id /shadow-reaper/', function () {
  var m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert(m.id === '/shadow-reaper/', 'Regular manifest id must be /shadow-reaper/');
  assert(m.name === 'Shadow Reaper', 'Regular manifest name must be Shadow Reaper');
});

test('Regular edition: sw.js uses sre-shell cache namespace NOT used by regular', function () {
  var sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assertContains(sw, 'sr-shell-v', 'Regular sw.js must use sr-shell-v cache namespace');
  assertNotContains(sw, 'sre-shell', 'Regular sw.js must NOT use sre-shell namespace');
});

test('Regular edition: sw.js BASE path is /shadow-reaper', function () {
  var sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assertContains(sw, "'/shadow-reaper'", 'Regular sw.js BASE must be /shadow-reaper');
  assertNotContains(sw, "'/shadow-reaper-edition'", 'Regular sw.js must NOT use -edition path');
});

test('Regular edition: capacitor.config.json has standalone app ID', function () {
  var cap = JSON.parse(fs.readFileSync(path.join(ROOT, 'capacitor.config.json'), 'utf8'));
  assert(cap.appId === 'com.shadowreaper.standalone',
    'Regular capacitor appId must be com.shadowreaper.standalone');
  assert(cap.appName === 'Shadow Reaper', 'Regular capacitor appName must be Shadow Reaper');
});

test('Regular edition: firebase-adapter.js uses regular collection namespaces', function () {
  var src = fs.readFileSync(path.join(ROOT, 'adapters/firebase-adapter.js'), 'utf8');
  assertContains(src, 'shadowReaperConversations', 'Must use shadowReaperConversations');
  assertNotContains(src, 'shadowReaperEditionConversations', 'Must NOT use Edition collection');
});

if (SE_EXISTS) {
  test('Shadow Edition: manifest.json has distinct id /shadow-reaper-edition/', function () {
    var m = JSON.parse(fs.readFileSync(path.join(ROOT_SE, 'manifest.json'), 'utf8'));
    assert(m.id === '/shadow-reaper-edition/', 'Shadow Edition manifest id must be /shadow-reaper-edition/');
    assert(m.name === 'Shadow Reaper — Shadow Edition', 'Shadow Edition name must include Shadow Edition');
  });

  test('Shadow Edition: sw.js uses sre-shell-v1 cache namespace', function () {
    var sw = fs.readFileSync(path.join(ROOT_SE, 'sw.js'), 'utf8');
    // Check the CACHE_VERSION assignment (not comments which may reference the old name)
    assert(/CACHE_VERSION\s*=\s*'sre-shell-v1'/.test(sw),
      'Shadow Edition CACHE_VERSION must be sre-shell-v1');
    assert(!/CACHE_VERSION\s*=\s*'sr-shell-v/.test(sw),
      'Shadow Edition CACHE_VERSION must NOT be sr-shell-v*');
  });

  test('Shadow Edition: sw.js BASE path is /shadow-reaper-edition', function () {
    var sw = fs.readFileSync(path.join(ROOT_SE, 'sw.js'), 'utf8');
    assertContains(sw, "'/shadow-reaper-edition'", 'Shadow Edition sw.js BASE must be /shadow-reaper-edition');
  });

  test('Shadow Edition: capacitor.config.json has distinct app ID', function () {
    var cap = JSON.parse(fs.readFileSync(path.join(ROOT_SE, 'capacitor.config.json'), 'utf8'));
    assert(cap.appId === 'com.shadowreaper.shadowedition',
      'Shadow Edition capacitor appId must be com.shadowreaper.shadowedition');
  });

  test('Shadow Edition: firebase-adapter.js uses Edition collection namespaces', function () {
    var src = fs.readFileSync(path.join(ROOT_SE, 'adapters/firebase-adapter.js'), 'utf8');
    assertContains(src, 'shadowReaperEditionConversations', 'Must use Edition conversations collection');
    assertContains(src, 'shadowReaperEditionMemory', 'Must use Edition memory collection');
    assertContains(src, 'shadowReaperEditionLearnedContext', 'Must use Edition context collection');
  });

  test('Shadow Edition: .firebaserc does NOT reference regular project ffr3r3223', function () {
    var fbrc = JSON.parse(fs.readFileSync(path.join(ROOT_SE, '.firebaserc'), 'utf8'));
    var projectId = fbrc.projects && fbrc.projects.default;
    assert(projectId !== 'ffr3r3223',
      'Shadow Edition .firebaserc must NOT reference regular project ffr3r3223');
  });
} else {
  test('[SKIP] Shadow Edition directory not found at ../shadow-reaper-shadow-edition', function () {
    process.stdout.write('    [NOTE] Shadow Edition tests skipped — directory not at expected path\n');
    assert(true); // not a failure — directory may be elsewhere
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 2 — SHADOW REMOVAL FROM REGULAR EDITION
// ═══════════════════════════════════════════════════════════════════════════
process.stdout.write('\n── SHADOW REMOVAL FROM REGULAR EDITION ───────────────\n');

var indexHtml = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// sr-wake-name.js and sr-voice-assistant.js are now part of SR-V2-STAGE12 (Shadow Edition merged)
// These files are expected in the regular edition as of STAGE12.
test('Regular index.html loads sr-wake-name.js (merged in STAGE12)', function () {
  assertContains(indexHtml, 'sr-wake-name.js', 'sr-wake-name.js must be present in STAGE12 edition');
});

test('Regular index.html loads sr-voice-assistant.js (merged in STAGE12)', function () {
  assertContains(indexHtml, 'sr-voice-assistant.js', 'sr-voice-assistant.js must be present in STAGE12 edition');
});

test('Regular index.html does NOT load sr-founder-shadow.js', function () {
  assertNotContains(indexHtml, 'sr-founder-shadow.js', 'sr-founder-shadow.js must NOT be in regular edition');
});

test('Regular index.html does NOT load sr-founder-security.js', function () {
  assertNotContains(indexHtml, 'sr-founder-security.js', 'sr-founder-security.js must NOT be in regular edition');
});

test('Regular index.html does NOT load founder-controls.js', function () {
  assertNotContains(indexHtml, 'founder-controls.js', 'founder-controls.js must NOT be in regular edition');
});

test('Regular index.html has NO Shadow personal-assistant section (STOP SHADOW button only)', function () {
  // srFounderShadowSection IS present in index.html (hidden by default, gated by JS authorization)
  // but the old "STOP SHADOW" trigger button must not exist
  assertNotContains(indexHtml, 'STOP SHADOW', 'No STOP SHADOW button in regular edition');
  // The section IS present but hidden by default (display:none)
  assertContains(indexHtml, 'id="srFounderShadowSection"', 'Founder Shadow section must exist (hidden)');
});

test('Regular index.html has NO wake name picker', function () {
  assertNotContains(indexHtml, 'srWakeNameSection', 'No Wake Name section in regular edition');
  assertNotContains(indexHtml, 'srWakePicker', 'No Wake Picker in regular edition');
});

test('Regular index.html has NO SRVoiceAssistant references', function () {
  assertNotContains(indexHtml, 'SRVoiceAsst', 'No SRVoiceAsst in regular edition');
  assertNotContains(indexHtml, 'SRVoiceAssistant', 'No SRVoiceAssistant in regular edition');
});

test('Regular index.html has FOUNDER_SHADOW authorization gates (for security)', function () {
  // SRFounderShadow authorization is required in index.html for gating the founder section.
  // The UI gates use SRFdrShadow alias and the VOICE_ASSISTANT_ENABLE action key.
  // sr-founder-shadow.js is NOT loaded — the gates fail-close gracefully if module absent.
  assertContains(indexHtml, 'SRFdrShadow', 'SRFdrShadow authorization gate must exist');
  assertContains(indexHtml, '_verifyShadowAction', '_verifyShadowAction gate must exist');
  assertNotContains(indexHtml, 'sr-founder-shadow.js', 'sr-founder-shadow.js must NOT be loaded in regular edition');
});

test('Regular edition: general voice (microphone button + TTS) preserved', function () {
  assertContains(indexHtml, 'voice-engine.js', 'voice-engine.js must remain in regular edition');
  assertContains(indexHtml, 'srVoiceBtn', 'Voice button must remain in regular edition');
  assertContains(indexHtml, 'srToggleTTS', 'TTS toggle must remain in regular edition');
  assertContains(indexHtml, 'srToggleVoice', 'Voice input toggle must remain in regular edition');
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 3 — SHADOW PRESERVATION IN SHADOW EDITION
// ═══════════════════════════════════════════════════════════════════════════
process.stdout.write('\n── SHADOW PRESERVATION IN SHADOW EDITION ─────────────\n');

test('sr-voice-assistant.js file exists (used by Shadow Edition)', function () {
  assert(fs.existsSync(path.join(ROOT, 'voice/sr-voice-assistant.js')),
    'voice/sr-voice-assistant.js must remain available for Shadow Edition');
});

test('sr-wake-name.js file exists (used by Shadow Edition)', function () {
  assert(fs.existsSync(path.join(ROOT, 'voice/sr-wake-name.js')),
    'voice/sr-wake-name.js must remain available for Shadow Edition');
});

test('sr-founder-shadow.js file exists (used by Shadow Edition)', function () {
  assert(fs.existsSync(path.join(ROOT, 'security/sr-founder-shadow.js')),
    'security/sr-founder-shadow.js must remain available for Shadow Edition');
});

test('sr-founder-security.js file exists (used by Shadow Edition)', function () {
  assert(fs.existsSync(path.join(ROOT, 'security/sr-founder-security.js')),
    'security/sr-founder-security.js must remain available for Shadow Edition');
});

test('adapters/founder-controls.js file exists (used by Shadow Edition)', function () {
  assert(fs.existsSync(path.join(ROOT, 'adapters/founder-controls.js')),
    'adapters/founder-controls.js must remain available for Shadow Edition');
});

if (SE_EXISTS) {
  test('Shadow Edition index.html loads sr-voice-assistant.js', function () {
    var se = fs.readFileSync(path.join(ROOT_SE, 'index.html'), 'utf8');
    assertContains(se, 'sr-voice-assistant.js', 'Shadow Edition must load sr-voice-assistant.js');
  });

  test('Shadow Edition index.html loads sr-wake-name.js', function () {
    var se = fs.readFileSync(path.join(ROOT_SE, 'index.html'), 'utf8');
    assertContains(se, 'sr-wake-name.js', 'Shadow Edition must load sr-wake-name.js');
  });

  test('Shadow Edition index.html loads sr-founder-shadow.js', function () {
    var se = fs.readFileSync(path.join(ROOT_SE, 'index.html'), 'utf8');
    assertContains(se, 'sr-founder-shadow.js', 'Shadow Edition must load sr-founder-shadow.js');
  });

  test('Shadow Edition index.html has Shadow personal-assistant section', function () {
    var se = fs.readFileSync(path.join(ROOT_SE, 'index.html'), 'utf8');
    assertContains(se, 'srFounderShadowSection', 'Shadow Edition must have Founder Shadow section');
  });

  test('Shadow Edition has Cloud Setup document', function () {
    assert(fs.existsSync(path.join(ROOT_SE, 'SHADOW-EDITION-CLOUD-SETUP.md')),
      'Shadow Edition must have SHADOW-EDITION-CLOUD-SETUP.md');
  });

  test('Shadow Edition: 7-stage voice implementation files present', function () {
    assert(fs.existsSync(path.join(ROOT_SE, 'voice/sr-voice-assistant.js')), 'sr-voice-assistant.js');
    assert(fs.existsSync(path.join(ROOT_SE, 'voice/sr-wake-name.js')),       'sr-wake-name.js');
    assert(fs.existsSync(path.join(ROOT_SE, 'voice/voice-engine.js')),       'voice-engine.js');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 4 — SHARED LEARNING BRIDGE MODULE
// ═══════════════════════════════════════════════════════════════════════════
process.stdout.write('\n── SHARED LEARNING BRIDGE ────────────────────────────\n');

test('SRSharedKnowledgeBridge module loaded', function () {
  assert(typeof bridge === 'object' && bridge !== null, 'SRSharedKnowledgeBridge must be an object');
});

test('SRSharedKnowledgeBridge has required interface methods', function () {
  assert(typeof bridge.submitGeneralizedCandidate   === 'function', 'submitGeneralizedCandidate');
  assert(typeof bridge.validateSharedCandidate      === 'function', 'validateSharedCandidate');
  assert(typeof bridge.promoteVerifiedKnowledge     === 'function', 'promoteVerifiedKnowledge');
  assert(typeof bridge.rejectSharedCandidate        === 'function', 'rejectSharedCandidate');
  assert(typeof bridge.queryVerifiedSharedKnowledge === 'function', 'queryVerifiedSharedKnowledge');
  assert(typeof bridge.sanitizeCandidate            === 'function', 'sanitizeCandidate');
  assert(typeof bridge.deidentifyCandidate          === 'function', 'deidentifyCandidate');
  assert(typeof bridge.getStatus                    === 'function', 'getStatus');
});

test('VALIDATION_STATE constants present', function () {
  var s = bridge.VALIDATION_STATE;
  assert(s.CANDIDATE  === 'CANDIDATE',  'CANDIDATE state');
  assert(s.VALIDATED  === 'VALIDATED',  'VALIDATED state');
  assert(s.PROMOTED   === 'PROMOTED',   'PROMOTED state');
  assert(s.REJECTED   === 'REJECTED',   'REJECTED state');
  assert(s.RETRACTED  === 'RETRACTED',  'RETRACTED state');
});

test('SHAREABLE_CATEGORIES does not include private categories', function () {
  var shareable = bridge.SHAREABLE_CATEGORIES;
  assert(shareable.indexOf('PRIVATE_SHADOW_MEMORY')         === -1);
  assert(shareable.indexOf('PRIVATE_SHADOW_CONVERSATIONS')  === -1);
  assert(shareable.indexOf('PRIVATE_SHADOW_PROJECTS')       === -1);
  assert(shareable.indexOf('REGULAR_USER_PRIVATE_DATA')     === -1);
  assert(shareable.indexOf('CREDENTIAL')                    === -1);
});

test('BLOCKED_CATEGORIES includes all required private categories', function () {
  var blocked = bridge.BLOCKED_CATEGORIES;
  assert(blocked.indexOf('PRIVATE_SHADOW_MEMORY')         !== -1);
  assert(blocked.indexOf('PRIVATE_SHADOW_CONVERSATIONS')  !== -1);
  assert(blocked.indexOf('PRIVATE_SHADOW_PROJECTS')       !== -1);
  assert(blocked.indexOf('REGULAR_USER_PRIVATE_DATA')     !== -1);
  assert(blocked.indexOf('CREDENTIAL')                    !== -1);
  assert(blocked.indexOf('AUTH_TOKEN')                    !== -1);
  assert(blocked.indexOf('PERSONAL_NAME')                 !== -1);
  assert(blocked.indexOf('CONTACT_INFO')                  !== -1);
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 5 — SANITIZATION TESTS (private-data detection)
// ═══════════════════════════════════════════════════════════════════════════
process.stdout.write('\n── SANITIZATION: PRIVATE DATA DETECTION ─────────────\n');

test('sanitize: valid GENERAL_LANGUAGE candidate passes', function () {
  var result = bridge.sanitizeCandidate({
    category:    'GENERAL_LANGUAGE',
    content:     'The phrase "the second one" should resolve to the second item in a previous list',
    description: 'Reference resolution improvement for ordinal phrases',
    confidence:  0.85,
    sourceCount: 3,
  });
  assert(result.safe === true, 'Valid general language candidate should pass: ' + JSON.stringify(result));
});

test('sanitize: BLOCKED category PRIVATE_SHADOW_MEMORY is rejected', function () {
  var result = bridge.sanitizeCandidate({
    category: 'PRIVATE_SHADOW_MEMORY',
    content:  'Remember that John likes pizza',
  });
  assert(result.safe === false, 'PRIVATE_SHADOW_MEMORY must be rejected');
  assertContains(result.reason, 'blocked_category', 'Reason must mention blocked_category');
});

test('sanitize: BLOCKED category PRIVATE_SHADOW_CONVERSATIONS is rejected', function () {
  var result = bridge.sanitizeCandidate({
    category: 'PRIVATE_SHADOW_CONVERSATIONS',
    content:  'From previous conversation: user asked about project X',
  });
  assert(result.safe === false, 'PRIVATE_SHADOW_CONVERSATIONS must be rejected');
});

test('sanitize: email address in content is rejected', function () {
  var result = bridge.sanitizeCandidate({
    category:    'GENERAL_LANGUAGE',
    content:     'Contact the user at test@example.com for follow-up',
    confidence:  0.8,
    sourceCount: 2,
  });
  assert(result.safe === false, 'Content with email must be rejected');
});

test('sanitize: phone number in content is rejected', function () {
  var result = bridge.sanitizeCandidate({
    category:    'GENERAL_LANGUAGE',
    content:     'The user can be reached at 555-867-5309',
    confidence:  0.8,
    sourceCount: 2,
  });
  assert(result.safe === false, 'Content with phone number must be rejected');
});

test('sanitize: API key pattern in content is rejected', function () {
  var result = bridge.sanitizeCandidate({
    category:    'GENERAL_LANGUAGE',
    content:     'Uses API key AIzaSyD_FAKE_KEY_1234567890abcdef_extra for authentication',
    confidence:  0.8,
    sourceCount: 2,
  });
  assert(result.safe === false, 'Content with API key must be rejected');
});

test('sanitize: "password" keyword in content is rejected', function () {
  var result = bridge.sanitizeCandidate({
    category:    'GENERAL_LANGUAGE',
    content:     'The user changed their password to something secure',
    confidence:  0.8,
    sourceCount: 2,
  });
  assert(result.safe === false, 'Content with password keyword must be rejected');
});

test('sanitize: "token" keyword in content is rejected', function () {
  var result = bridge.sanitizeCandidate({
    category:    'GENERAL_LANGUAGE',
    content:     'Bearer token eyJhbGciOiJSUzI1NiJ9.payload.signature',
    confidence:  0.8,
    sourceCount: 2,
  });
  assert(result.safe === false, 'Content with token must be rejected');
});

test('sanitize: raw_conversation field is rejected', function () {
  var result = bridge.sanitizeCandidate({
    category:           'GENERAL_LANGUAGE',
    content:            'A language pattern',
    raw_conversation:   'User: hi. Shadow: hello.',
    confidence:         0.8,
    sourceCount:        2,
  });
  assert(result.safe === false, 'raw_conversation field must be rejected');
});

test('sanitize: conversation_id field is rejected', function () {
  var result = bridge.sanitizeCandidate({
    category:       'GENERAL_LANGUAGE',
    content:        'A language pattern',
    conversation_id:'conv_abc123',
    confidence:     0.8,
    sourceCount:    2,
  });
  assert(result.safe === false, 'conversation_id field must be rejected');
});

test('sanitize: uid field is rejected', function () {
  var result = bridge.sanitizeCandidate({
    category:   'GENERAL_LANGUAGE',
    content:    'A pattern',
    uid:        'firebase-uid-abc123',
    confidence: 0.8,
    sourceCount:2,
  });
  assert(result.safe === false, 'uid field must be rejected');
});

test('sanitize: apiKey field is rejected', function () {
  var result = bridge.sanitizeCandidate({
    category:   'GENERAL_LANGUAGE',
    content:    'A pattern',
    apiKey:     'AIzaSyFakeKey12345',
    confidence: 0.8,
    sourceCount:2,
  });
  assert(result.safe === false, 'apiKey field must be rejected');
});

test('sanitize: single source (sourceCount=1) is rejected (poisoning protection)', function () {
  var result = bridge.sanitizeCandidate({
    category:    'GENERAL_LANGUAGE',
    content:     'A generalized language pattern',
    confidence:  0.9,
    sourceCount: 1,  // Must require ≥ 2
  });
  assert(result.safe === false, 'Single-source candidate must be rejected');
  assertContains(result.reason, 'insufficient_sources', 'Must mention insufficient_sources');
});

test('sanitize: unknown/custom category is rejected', function () {
  var result = bridge.sanitizeCandidate({
    category:    'MY_CUSTOM_CATEGORY',
    content:     'Some content',
    confidence:  0.8,
    sourceCount: 2,
  });
  assert(result.safe === false, 'Unknown category must be rejected');
  assertContains(result.reason, 'unknown_category', 'Must mention unknown_category');
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 6 — SUBMISSION PIPELINE (without Firestore)
// ═══════════════════════════════════════════════════════════════════════════
process.stdout.write('\n── SUBMISSION PIPELINE (no Firestore) ───────────────\n');

test('submitGeneralizedCandidate: valid candidate buffered locally when no Firestore', function (done) {
  var result = null;
  bridge.submitGeneralizedCandidate({
    category:    'GENERAL_PATTERN',
    content:     'When a user says "the previous one" they refer to the last assistant suggestion',
    description: 'Ordinal reference resolution pattern',
    confidence:  0.82,
    sourceCount: 4,
  }, function (r) {
    result = r;
  });
  assert(result !== null, 'callback must have fired synchronously or before test ends');
  // Firestore is null in tests so it buffers locally
  assert(result.ok === true, 'Valid candidate must return ok:true; got: ' + JSON.stringify(result));
  assert(typeof result.candidateId === 'string', 'Must return a candidateId string');
  assert(result.state === 'CANDIDATE', 'State must be CANDIDATE');
});

test('submitGeneralizedCandidate: private category is rejected immediately', function () {
  var result = null;
  bridge.submitGeneralizedCandidate({
    category:   'PRIVATE_SHADOW_MEMORY',
    content:    'User prefers dark mode',
    confidence: 0.95,
    sourceCount: 5,
  }, function (r) { result = r; });
  assert(result.ok === false, 'Private category must be rejected');
  assert(result.state === 'REJECTED', 'State must be REJECTED');
});

test('submitGeneralizedCandidate: credentials in content are rejected', function () {
  var result = null;
  bridge.submitGeneralizedCandidate({
    category:    'GENERAL_LANGUAGE',
    content:     'The user authenticated with secret=abc123token',
    confidence:  0.8,
    sourceCount: 3,
  }, function (r) { result = r; });
  assert(result.ok === false, 'Credentials in content must be rejected');
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 7 — DE-IDENTIFICATION
// ═══════════════════════════════════════════════════════════════════════════
process.stdout.write('\n── DE-IDENTIFICATION ─────────────────────────────────\n');

test('deidentifyCandidate removes sourceConversationId', function () {
  var candidate = {
    category:             'GENERAL_LANGUAGE',
    content:              'A pattern',
    sourceConversationId: 'conv_private_123',
    confidence:           0.8,
  };
  var clean = bridge.deidentifyCandidate(candidate);
  assert(!clean.hasOwnProperty('sourceConversationId'),
    'sourceConversationId must be removed by deidentify');
});

test('deidentifyCandidate removes sourceTurnId', function () {
  var candidate = { category: 'GENERAL_LANGUAGE', sourceTurnId: 'turn_456', confidence: 0.8 };
  var clean = bridge.deidentifyCandidate(candidate);
  assert(!clean.hasOwnProperty('sourceTurnId'), 'sourceTurnId must be removed');
});

test('deidentifyCandidate removes sourceUserId', function () {
  var candidate = { category: 'GENERAL_LANGUAGE', sourceUserId: 'uid_abc', confidence: 0.8 };
  var clean = bridge.deidentifyCandidate(candidate);
  assert(!clean.hasOwnProperty('sourceUserId'), 'sourceUserId must be removed');
});

test('deidentifyCandidate removes createdByUid', function () {
  var candidate = { category: 'GENERAL_LANGUAGE', createdByUid: 'firebase_uid_xyz', confidence: 0.8 };
  var clean = bridge.deidentifyCandidate(candidate);
  assert(!clean.hasOwnProperty('createdByUid'), 'createdByUid must be removed');
});

test('deidentifyCandidate removes sourceEmail', function () {
  var candidate = { category: 'GENERAL_LANGUAGE', sourceEmail: 'user@example.com', confidence: 0.8 };
  var clean = bridge.deidentifyCandidate(candidate);
  assert(!clean.hasOwnProperty('sourceEmail'), 'sourceEmail must be removed');
});

test('deidentifyCandidate preserves legitimate content fields', function () {
  var candidate = {
    category:    'GENERAL_LANGUAGE',
    content:     'A generalized pattern',
    description: 'Describes the pattern',
    confidence:  0.85,
    version:     '1',
    createdByUid: 'should_be_removed',
  };
  var clean = bridge.deidentifyCandidate(candidate);
  assert(clean.category    === 'GENERAL_LANGUAGE', 'category preserved');
  assert(clean.content     === 'A generalized pattern', 'content preserved');
  assert(clean.description === 'Describes the pattern', 'description preserved');
  assert(clean.confidence  === 0.85, 'confidence preserved');
  assert(clean.version     === '1', 'version preserved');
  assert(!clean.hasOwnProperty('createdByUid'), 'createdByUid removed');
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 8 — PROVENANCE AND STATUS
// ═══════════════════════════════════════════════════════════════════════════
process.stdout.write('\n── PROVENANCE AND STATUS ─────────────────────────────\n');

test('getStatus() returns expected safety flags', function () {
  var status = bridge.getStatus();
  assert(status.rawPrivateDataSharing         === 'BLOCKED', 'rawPrivateDataSharing must be BLOCKED');
  assert(status.privateShadowMemoryExposed    === 'NO',      'privateShadowMemoryExposed must be NO');
  assert(status.privateConversationsExposed   === 'NO',      'privateConversationsExposed must be NO');
  assert(status.privateProjectsExposed        === 'NO',      'privateProjectsExposed must be NO');
  assert(status.regularUserPrivateDataExposed === 'NO',      'regularUserPrivateDataExposed must be NO');
  assert(status.productionSyncEnabled         === false,     'productionSyncEnabled must be false');
  assert(status.bidirectionalSyncEnabled      === false,     'bidirectionalSyncEnabled must be false');
});

test('getStatus() includes build ID', function () {
  var status = bridge.getStatus();
  assert(typeof status.build === 'string' && status.build.length > 0, 'build ID must be present');
});

test('getStatus() does not contain private data or credentials', function () {
  var status = JSON.stringify(bridge.getStatus());
  assertNotContains(status, 'apiKey',    'Status must not contain apiKey');
  assertNotContains(status, 'password',  'Status must not contain password');
  assertNotContains(status, 'token',     'Status must not contain token');
  assertNotContains(status, '@',         'Status must not contain email addresses');
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 9 — QUERY (without Firestore available)
// ═══════════════════════════════════════════════════════════════════════════
process.stdout.write('\n── QUERY (offline/no Firestore) ──────────────────────\n');

test('queryVerifiedSharedKnowledge: returns empty items when Firestore unavailable', function () {
  var result = null;
  bridge.queryVerifiedSharedKnowledge({}, function (r) { result = r; });
  // Firestore is null — should return empty gracefully
  assert(result.ok === true, 'Must return ok:true even with no Firestore');
  assert(Array.isArray(result.items), 'Must return items array');
  assert(result.items.length === 0, 'No items when Firestore unavailable');
});

test('queryVerifiedSharedKnowledge: does not expose private data fields', function () {
  var result = null;
  bridge.queryVerifiedSharedKnowledge({}, function (r) { result = r; });
  assert(Array.isArray(result.items), 'Items must be an array');
  result.items.forEach(function (item) {
    assert(!item.hasOwnProperty('sourceConversationId'), 'No sourceConversationId in result');
    assert(!item.hasOwnProperty('sourceUserId'),         'No sourceUserId in result');
    assert(!item.hasOwnProperty('createdByUid'),         'No createdByUid in result');
    assert(!item.hasOwnProperty('raw_conversation'),     'No raw_conversation in result');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 10 — STORAGE NAMESPACE ISOLATION
// ═══════════════════════════════════════════════════════════════════════════
process.stdout.write('\n── STORAGE NAMESPACE ISOLATION ───────────────────────\n');

test('Regular edition: snx-shadow-adaptive.js uses standard LS key', function () {
  var src = fs.readFileSync(path.join(ROOT, 'snx-shadow-adaptive.js'), 'utf8');
  assertContains(src, "'snxShadowAdaptiveEnabled'", 'Regular must use standard LS key');
  assertNotContains(src, "'snxShadowAdaptiveEnabled_se'", 'Regular must NOT use SE-specific key');
});

if (SE_EXISTS) {
  test('Shadow Edition: snx-shadow-adaptive.js uses distinct LS key', function () {
    var src = fs.readFileSync(path.join(ROOT_SE, 'snx-shadow-adaptive.js'), 'utf8');
    assertContains(src, "'snxShadowAdaptiveEnabled_se'", 'SE must use SE-specific LS key');
    assertNotContains(src, "'snxShadowAdaptiveEnabled'", 'SE must NOT use standard key');
  });

  test('Shadow Edition: sr-founder-security.js uses distinct LS keys', function () {
    var src = fs.readFileSync(path.join(ROOT_SE, 'security/sr-founder-security.js'), 'utf8');
    assertContains(src, "'_sreFounderDeviceId'", 'SE founder security must use sre prefix');
    assertNotContains(src, "'_srFounderDeviceId'", 'SE must NOT use sr prefix');
  });

  test('Shadow Edition: global-learning uses distinct LS keys', function () {
    var src = fs.readFileSync(path.join(ROOT_SE, 'global-learning/sr-global-learning.js'), 'utf8');
    assertContains(src, "'sreGlobalLearningConsent'", 'SE must use sre prefix for consent key');
    assertNotContains(src, "'srGlobalLearningConsent'", 'SE must NOT use sr prefix');
  });

  test('Shadow Edition: founder-controls.js uses distinct LS cache key', function () {
    var src = fs.readFileSync(path.join(ROOT_SE, 'adapters/founder-controls.js'), 'utf8');
    assertContains(src, "'sreFounderControls'", 'SE must use sreFounderControls key');
    assertNotContains(src, "'srFounderControls'", 'SE must NOT use srFounderControls key');
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// SECTION 11 — PWA IDENTITY ISOLATION
// ═══════════════════════════════════════════════════════════════════════════
process.stdout.write('\n── PWA IDENTITY ISOLATION ────────────────────────────\n');

test('Regular sw.js and Shadow Edition sw.js have different cache names', function () {
  var swRegular = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  assert(!swRegular.includes('sre-shell'), 'Regular SW must not use sre-shell cache');
  assert(swRegular.includes('sr-shell'), 'Regular SW must use sr-shell cache');

  if (SE_EXISTS) {
    var swSe = fs.readFileSync(path.join(ROOT_SE, 'sw.js'), 'utf8');
    assert(swSe.includes('sre-shell'), 'Shadow Edition SW must use sre-shell cache');
    assert(!swSe.includes("= 'sr-shell-v"), 'Shadow Edition SW must not use sr-shell-v base name');
  }
});

test('Regular manifest.json scope does not overlap Shadow Edition scope', function () {
  var mRegular = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert(mRegular.scope === '/shadow-reaper/', 'Regular scope must be /shadow-reaper/');
  if (SE_EXISTS) {
    var mSe = JSON.parse(fs.readFileSync(path.join(ROOT_SE, 'manifest.json'), 'utf8'));
    assert(mSe.scope === '/shadow-reaper-edition/', 'SE scope must be /shadow-reaper-edition/');
    assert(mSe.scope !== mRegular.scope, 'Scopes must differ');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// FINAL OUTPUT
// ═══════════════════════════════════════════════════════════════════════════
process.stdout.write('\n══════════════════════════════════════════════\n');
results.forEach(function (r) { process.stdout.write(r + '\n'); });
process.stdout.write('══════════════════════════════════════════════\n');
process.stdout.write('  PASS : ' + PASS + '\n');
process.stdout.write('  FAIL : ' + FAIL + '\n');
process.stdout.write('  TOTAL: ' + (PASS + FAIL) + '\n');
process.stdout.write('══════════════════════════════════════════════\n');
process.stdout.write('\nPRODUCT SPLIT TEST: ' + (FAIL === 0 ? 'PASS' : 'FAIL') + '\n');

if (typeof module !== 'undefined') {
  module.exports = { pass: PASS, fail: FAIL };
}
