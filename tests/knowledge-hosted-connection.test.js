/**
 * shadow-reaper-v2/tests/knowledge-hosted-connection.test.js
 * Shadow Reaper — Preloaded Knowledge → Hosted Chat Connection Tests
 *
 * Build: SR-KNOWLEDGE-HOSTED-1
 *
 * WHAT THIS TESTS:
 *   The targeted repair that connects SRKnowledge (existing preloaded knowledge)
 *   to the primary hosted conversation path (sr-shadow-api-client → /api/v1/chat).
 *
 * Tests:
 *   1.  SRKnowledge contains Creator entry (Chris / Legend of Shadows)
 *   2.  SRKnowledge contains Shadow Nexus Social platform entry
 *   3.  _getKnowledgeContext equivalent: creator query returns content
 *   4.  _getKnowledgeContext equivalent: SNS query returns content
 *   5.  _getKnowledgeContext equivalent: unrelated query returns null (no injection)
 *   6.  knowledgeContext field is included in the hosted request for relevant query
 *   7.  knowledgeContext field is absent for unrelated query
 *   8.  Worker _validateChatRequest: knowledgeContext array accepted
 *   9.  Worker _validateChatRequest: knowledgeContext non-array rejected
 *   10. Worker _validateChatRequest: knowledgeContext > 5 items rejected
 *   11. Worker _assembleMessages: knowledge injected into system prompt
 *   12. Worker _assembleMessages: no knowledge block when knowledgeContext is null
 *   13. Worker _assembleMessages: knowledge block capped at 512 chars per entry
 *   14. Worker _assembleMessages: max 5 entries respected server-side
 *   15. Worker _assembleMessages: non-string content entries skipped
 *   16. Personal memory isolated from knowledgeContext slot
 *   17. Voice path uses same _send() → knowledgeContext is included
 *   18. Known Creator entry queryable by multiple question phrasings
 *   19. Shadow Nexus Social entry queryable by multiple phrasings
 *   20. Unrelated conversation does not inject SNS/Creator knowledge
 *
 * Run:
 *   node tests/knowledge-hosted-connection.test.js
 */

'use strict';

var path = require('path');
var fs   = require('fs');
var ROOT = path.resolve(__dirname, '..');

// ── Browser globals for IIFE modules ──────────────────────────────────────────
if (!global.localStorage) {
  global.localStorage = {
    _store:     {},
    getItem:    function (k) { return this._store[k] !== undefined ? this._store[k] : null; },
    setItem:    function (k, v) { this._store[k] = String(v); },
    removeItem: function (k) { delete this._store[k]; },
    clear:      function ()  { this._store = {}; },
  };
}
try {
  if (!global.navigator) {
    Object.defineProperty(global, 'navigator', { value: { gpu: undefined }, writable: true, configurable: true });
  }
} catch (_) {}
if (!global.fetch) global.fetch = function () { return Promise.reject(new Error('no fetch in test')); };

// ── Load SRKnowledge module ────────────────────────────────────────────────────
function loadModule(relPath) {
  var code = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
  var fn   = new Function('global', 'require', 'module', 'exports', '__dirname', '__filename', code);
  var mod  = {};
  fn(global, require, mod, {}, path.dirname(path.join(ROOT, relPath)), path.join(ROOT, relPath));
}

loadModule('knowledge/knowledge-engine.js');
var SRKnowledge = global.SRKnowledge;

// ── Test harness ───────────────────────────────────────────────────────────────
var PASS = 0, FAIL = 0;
var results = [];

function test(name, fn) {
  try {
    fn();
    PASS++;
    console.log('  PASS  ' + name);
    results.push({ name: name, status: 'PASS' });
  } catch (e) {
    FAIL++;
    console.error('  FAIL  ' + name);
    console.error('        ' + e.message);
    results.push({ name: name, status: 'FAIL', error: e.message });
  }
}

function assert(cond, msg)         { if (!cond)                 throw new Error(msg || 'Assertion failed'); }
function assertExists(v, msg)      { if (v == null)             throw new Error(msg || 'Expected value to exist'); }
function assertContains(s, sub)    { if (String(s).indexOf(sub) === -1) throw new Error('Expected "' + String(s).slice(0,120) + '" to contain "' + sub + '"'); }
function assertNotContains(s, sub) { if (String(s).indexOf(sub) !== -1) throw new Error('Expected string NOT to contain "' + sub + '"'); }

// ── Inline the cloud-chat validation and assembly logic (CommonJS compat) ──────
// The Worker files are ES modules. We reproduce the logic under test here so
// these unit tests remain in the CommonJS test harness without dynamic import.

function _validateKnowledgeContext(body) {
  if (body.knowledgeContext !== undefined) {
    if (!Array.isArray(body.knowledgeContext)) {
      return { ok: false, error: 'knowledgeContext must be an array if provided.' };
    }
    if (body.knowledgeContext.length > 5) {
      return { ok: false, error: 'knowledgeContext must contain at most 5 entries.' };
    }
  }
  return { ok: true };
}

function _assembleSystemPrompt(memory, projects, knowledgeContext, langAnalysis) {
  var BASE = 'You are Shadow, a highly capable personal AI assistant.';
  var systemPrompt = BASE;

  if (memory && memory.length > 0) {
    var memBlock = memory.map(function (m) { return '• ' + m.content; }).join('\n');
    systemPrompt += '\n\nThings you remember about this user:\n' + memBlock;
  }

  if (projects && projects.length > 0) {
    var projBlock = projects.map(function (p) {
      return '• ' + p.name + (p.description ? ': ' + p.description : '');
    }).join('\n');
    systemPrompt += '\n\nUser\'s active projects:\n' + projBlock;
  }

  if (knowledgeContext && Array.isArray(knowledgeContext) && knowledgeContext.length > 0) {
    var knowledgeBlock = knowledgeContext
      .slice(0, 5)
      .map(function (e) {
        var content = (e && typeof e.content === 'string') ? e.content.slice(0, 512) : '';
        return content ? '• ' + content : null;
      })
      .filter(Boolean)
      .join('\n');
    if (knowledgeBlock) {
      systemPrompt += '\n\nRelevant knowledge about Shadow Nexus Social and its creator:\n' + knowledgeBlock;
    }
  }

  return systemPrompt;
}

// Simulate _getKnowledgeContext from sr-shadow-api-client.js
function _getKnowledgeContext(message, knowledge) {
  if (!knowledge || typeof knowledge.queryMultiple !== 'function') return null;
  try {
    var entries = knowledge.queryMultiple(message, 2);
    if (!entries || entries.length === 0) return null;
    return entries.map(function (e) {
      return {
        category: String(e.category || '').slice(0, 32),
        content:  String(e.content  || '').slice(0, 512),
      };
    });
  } catch (_) {
    return null;
  }
}

// ── SECTION 1: Verify preloaded knowledge exists ───────────────────────────────
console.log('\n── SECTION 1: Verify preloaded knowledge exists ─────────────────');

test('SRKnowledge module is loaded', function () {
  assertExists(SRKnowledge, 'SRKnowledge should be defined');
  assert(typeof SRKnowledge.queryMultiple === 'function', 'queryMultiple must be a function');
});

test('SRKnowledge: Creator entry exists (Chris / Legend of Shadows)', function () {
  var entry = SRKnowledge.query('Who is Chris Legend of Shadows?');
  assertExists(entry, 'Expected a Creator knowledge entry for Chris / Legend of Shadows');
  assert(entry.category === 'CREATOR', 'Expected CREATOR category, got: ' + entry.category);
  assertContains(entry.content.toLowerCase(), 'chris');
  assertContains(entry.content.toLowerCase(), 'legend of shadows');
});

test('SRKnowledge: Shadow Nexus Social platform entry exists', function () {
  var entry = SRKnowledge.query('What is Shadow Nexus Social?');
  assertExists(entry, 'Expected an SNS knowledge entry for Shadow Nexus Social');
  assert(entry.category === 'SNS', 'Expected SNS category, got: ' + entry.category);
  assertContains(entry.content.toLowerCase(), 'shadow nexus social');
});

// ── SECTION 2: _getKnowledgeContext retrieval ──────────────────────────────────
console.log('\n── SECTION 2: _getKnowledgeContext retrieval ────────────────────');

test('_getKnowledgeContext: "Who is Chris Legend of Shadows" returns content', function () {
  var ctx = _getKnowledgeContext('Who is Chris Legend of Shadows?', SRKnowledge);
  assertExists(ctx, 'Expected knowledge context to be returned for Creator query');
  assert(Array.isArray(ctx), 'knowledgeContext must be an array');
  assert(ctx.length >= 1, 'Expected at least 1 knowledge entry');
  assertContains(ctx[0].content.toLowerCase(), 'chris');
});

test('_getKnowledgeContext: "What is Shadow Nexus Social" returns content', function () {
  var ctx = _getKnowledgeContext('What is Shadow Nexus Social?', SRKnowledge);
  assertExists(ctx, 'Expected knowledge context to be returned for SNS query');
  assert(Array.isArray(ctx), 'knowledgeContext must be an array');
  assert(ctx.length >= 1, 'Expected at least 1 knowledge entry');
  assertContains(ctx[0].content.toLowerCase(), 'shadow nexus');
});

test('_getKnowledgeContext: unrelated query returns null (no injection)', function () {
  var ctx = _getKnowledgeContext("What's the weather like today?", SRKnowledge);
  assert(ctx === null, 'Unrelated query should return null — no knowledge injected');
});

test('_getKnowledgeContext: "I am bored" returns null (no injection)', function () {
  var ctx = _getKnowledgeContext("I am bored.", SRKnowledge);
  assert(ctx === null, 'Casual conversation should return null — no knowledge injected');
});

test('_getKnowledgeContext: returns array of {category, content} objects', function () {
  var ctx = _getKnowledgeContext('Who is the creator of Shadow Nexus Social?', SRKnowledge);
  assertExists(ctx, 'Expected knowledge context');
  ctx.forEach(function (entry) {
    assert(typeof entry.category === 'string', 'Each entry must have a string category');
    assert(typeof entry.content  === 'string', 'Each entry must have a string content');
  });
});

test('_getKnowledgeContext: content is bounded to 512 chars per entry', function () {
  var ctx = _getKnowledgeContext('What is Shadow Nexus Social?', SRKnowledge);
  assertExists(ctx, 'Expected knowledge context');
  ctx.forEach(function (entry) {
    assert(entry.content.length <= 512, 'Content must be bounded to 512 chars, got: ' + entry.content.length);
  });
});

// ── SECTION 3: Hosted request body includes knowledgeContext ──────────────────
console.log('\n── SECTION 3: Hosted request body knowledgeContext ──────────────');

test('knowledgeContext is included in request body for Creator query', function () {
  var msg = 'Who is Chris Legend of Shadows?';
  var ctx = _getKnowledgeContext(msg, SRKnowledge);
  // Simulate what _sendChat would do
  var requestBody = { message: msg, conversationId: null };
  if (ctx) requestBody.knowledgeContext = ctx;
  assert(Array.isArray(requestBody.knowledgeContext), 'knowledgeContext must be in request body for relevant query');
  assert(requestBody.knowledgeContext.length >= 1, 'Expected at least 1 knowledge entry in request');
});

test('knowledgeContext is included in request body for SNS query', function () {
  var msg = 'What is Shadow Nexus Social?';
  var ctx = _getKnowledgeContext(msg, SRKnowledge);
  var requestBody = { message: msg, conversationId: null };
  if (ctx) requestBody.knowledgeContext = ctx;
  assert(Array.isArray(requestBody.knowledgeContext), 'knowledgeContext must be in request body for SNS query');
});

test('knowledgeContext is absent from request body for unrelated query', function () {
  var msg = "Tell me a joke.";
  var ctx = _getKnowledgeContext(msg, SRKnowledge);
  var requestBody = { message: msg, conversationId: null };
  if (ctx) requestBody.knowledgeContext = ctx;
  assert(requestBody.knowledgeContext === undefined, 'knowledgeContext must NOT be in request for unrelated query');
});

// ── SECTION 4: Worker-side validation ─────────────────────────────────────────
console.log('\n── SECTION 4: Worker-side validation ────────────────────────────');

test('Worker validation: valid knowledgeContext array accepted', function () {
  var result = _validateKnowledgeContext({
    knowledgeContext: [{ category: 'CREATOR', content: 'Chris built Shadow Nexus.' }],
  });
  assert(result.ok, 'Valid knowledgeContext array must be accepted');
});

test('Worker validation: missing knowledgeContext is fine (optional)', function () {
  var result = _validateKnowledgeContext({ message: 'hello' });
  assert(result.ok, 'Absent knowledgeContext must be accepted (optional field)');
});

test('Worker validation: non-array knowledgeContext is rejected', function () {
  var result = _validateKnowledgeContext({ knowledgeContext: 'injected string' });
  assert(!result.ok, 'Non-array knowledgeContext must be rejected');
  assertContains(result.error, 'array');
});

test('Worker validation: knowledgeContext with > 5 entries is rejected', function () {
  var tooMany = [1,2,3,4,5,6].map(function () { return { content: 'x' }; });
  var result = _validateKnowledgeContext({ knowledgeContext: tooMany });
  assert(!result.ok, 'knowledgeContext with > 5 entries must be rejected');
  assertContains(result.error, '5');
});

// ── SECTION 5: Worker-side _assembleMessages knowledge injection ───────────────
console.log('\n── SECTION 5: Worker _assembleMessages knowledge injection ───────');

test('_assembleMessages: knowledge injected into system prompt', function () {
  var kCtx = [{ category: 'CREATOR', content: 'Chris is the creator of Shadow Nexus Social.' }];
  var prompt = _assembleSystemPrompt([], [], kCtx, null);
  assertContains(prompt, 'Chris is the creator of Shadow Nexus Social.');
  assertContains(prompt, 'Relevant knowledge about Shadow Nexus Social');
});

test('_assembleMessages: no knowledge block when knowledgeContext is null', function () {
  var prompt = _assembleSystemPrompt([], [], null, null);
  assertNotContains(prompt, 'Relevant knowledge');
});

test('_assembleMessages: no knowledge block when knowledgeContext is empty array', function () {
  var prompt = _assembleSystemPrompt([], [], [], null);
  assertNotContains(prompt, 'Relevant knowledge');
});

test('_assembleMessages: knowledge content is capped at 512 chars server-side', function () {
  var longContent = 'A'.repeat(600);
  var kCtx = [{ category: 'SNS', content: longContent }];
  var prompt = _assembleSystemPrompt([], [], kCtx, null);
  // The injected content must be the capped version (512 chars), not the full 600
  assertNotContains(prompt, longContent);
  assertContains(prompt, 'A'.repeat(512));
});

test('_assembleMessages: max 5 entries respected server-side', function () {
  var kCtx = [1,2,3,4,5,6].map(function (n) { return { category: 'SNS', content: 'Entry ' + n }; });
  var prompt = _assembleSystemPrompt([], [], kCtx, null);
  // Entry 6 must not appear
  assertNotContains(prompt, 'Entry 6');
  assertContains(prompt, 'Entry 5');
});

test('_assembleMessages: non-string content entries are skipped', function () {
  var kCtx = [
    { category: 'CREATOR', content: 'Chris is the creator.' },
    { category: 'SNS',     content: 42 },         // non-string — should be skipped
    { category: 'SNS',     content: null },        // null — should be skipped
  ];
  var prompt = _assembleSystemPrompt([], [], kCtx, null);
  assertContains(prompt, 'Chris is the creator.');
  // The integer entry should not appear as "42" as a knowledge item
  assert(prompt.split('• ').filter(function (p) { return p === '42'; }).length === 0,
    'Non-string content entries must be skipped');
});

// ── SECTION 6: Isolation — personal memory stays separate ─────────────────────
console.log('\n── SECTION 6: Isolation — personal memory stays separate ────────');

test('personal memory does not appear in knowledgeContext', function () {
  // Personal memory is loaded server-side from Firestore — never from client
  // knowledgeContext only contains public preloaded knowledge
  var ctx = _getKnowledgeContext('My name is Alice and I like jazz.', SRKnowledge);
  // This personal statement should not match the public knowledge base
  assert(ctx === null, 'Personal statement must not match public knowledge base');
});

test('knowledge block and memory block are separate in system prompt', function () {
  var memory  = [{ content: 'User likes jazz.' }];
  var kCtx    = [{ category: 'CREATOR', content: 'Chris is the creator.' }];
  var prompt  = _assembleSystemPrompt(memory, [], kCtx, null);
  assertContains(prompt, 'Things you remember about this user:');
  assertContains(prompt, 'Relevant knowledge about Shadow Nexus Social');
  // They should appear as distinct sections — not merged
  var memIdx  = prompt.indexOf('Things you remember');
  var knowIdx = prompt.indexOf('Relevant knowledge');
  assert(memIdx !== knowIdx, 'Memory and knowledge must be distinct sections');
  assert(memIdx !== -1 && knowIdx !== -1, 'Both sections must be present');
});

// ── SECTION 7: Voice path uses same _send() ───────────────────────────────────
console.log('\n── SECTION 7: Voice path correctness ───────────────────────────');

test('voice path: knowledge context retrieved for SNS voice query', function () {
  // Voice uses the same _send() path through SRShadowAPIClient.ask()
  // The only difference is the message is speech-to-text transcribed.
  // Test that the same _getKnowledgeContext logic works on a transcribed query.
  var transcribed = 'what is shadow nexus social';  // lowercase, no punctuation (STT output)
  var ctx = _getKnowledgeContext(transcribed, SRKnowledge);
  assertExists(ctx, 'Expected knowledge context for voice query');
  assert(Array.isArray(ctx) && ctx.length >= 1, 'Expected at least 1 entry for voice query');
});

test('voice path: knowledge context retrieved for Creator voice query', function () {
  var transcribed = 'who is chris legend of shadows';
  var ctx = _getKnowledgeContext(transcribed, SRKnowledge);
  assertExists(ctx, 'Expected knowledge context for voice Creator query');
});

// ── SECTION 8: Multiple phrasings ─────────────────────────────────────────────
console.log('\n── SECTION 8: Multiple phrasings ────────────────────────────────');

test('Creator: "who made shadow nexus social" returns creator knowledge', function () {
  var ctx = _getKnowledgeContext('who made shadow nexus social', SRKnowledge);
  assertExists(ctx, 'Expected creator knowledge for "who made shadow nexus social"');
  assertContains(ctx[0].content.toLowerCase(), 'chris');
});

test('Creator: "who founded shadow nexus" returns creator knowledge', function () {
  var ctx = _getKnowledgeContext('who founded shadow nexus', SRKnowledge);
  assertExists(ctx, 'Expected creator knowledge for "who founded shadow nexus"');
});

test('SNS: "what do you know about shadow nexus social" returns SNS knowledge', function () {
  var ctx = _getKnowledgeContext('what do you know about shadow nexus social', SRKnowledge);
  assertExists(ctx, 'Expected SNS knowledge for "what do you know about shadow nexus social"');
  assertContains(ctx[0].content.toLowerCase(), 'shadow nexus');
});

test('SNS: "tell me about shadow nexus" returns SNS knowledge', function () {
  var ctx = _getKnowledgeContext('tell me about shadow nexus', SRKnowledge);
  assertExists(ctx, 'Expected SNS knowledge for "tell me about shadow nexus"');
});

test('Unrelated: "what did I just ask you about" returns null (no knowledge injection)', function () {
  // Follow-up question about conversation history — not a knowledge question
  var ctx = _getKnowledgeContext('what did I just ask you about', SRKnowledge);
  assert(ctx === null, 'Conversation follow-up must not inject knowledge');
});

test('Unrelated: ordinary conversation does not inject Creator/SNS-specific knowledge', function () {
  // These queries must not return CREATOR or SNS-specific knowledge entries.
  // A GENERAL capability entry (e.g. "help me") may match help-related queries —
  // that is correct behavior. The critical check is that CREATOR/SNS facts are not
  // injected into conversations with no connection to Shadow Nexus or Chris.
  var queries = [
    "I'm feeling tired today.",
    "What's 2 plus 2?",
    "Tell me a story.",
    "What time is it?",
    "How is the weather today?",
  ];
  queries.forEach(function (q) {
    var ctx = _getKnowledgeContext(q, SRKnowledge);
    // Either no match at all, or only a GENERAL (capability) entry — never SNS or CREATOR
    if (ctx !== null) {
      var hasSnsOrCreator = ctx.some(function (e) {
        return e.category === 'SNS' || e.category === 'CREATOR';
      });
      assert(!hasSnsOrCreator,
        'Ordinary conversation must not inject SNS/Creator knowledge: "' + q + '"');
    }
  });
});

// ── Summary ────────────────────────────────────────────────────────────────────
var total = PASS + FAIL;
console.log('\n═══════════════════════════════════════════════════════════════');
console.log('  PASS : ' + PASS);
console.log('  FAIL : ' + FAIL);
console.log('  TOTAL: ' + total);
if (FAIL === 0) {
  console.log('\n  ✓ All knowledge-hosted-connection tests passed.\n');
  results.filter(function (r) { return r.status === 'FAIL'; }).forEach(function (r) {
    console.error('  ✗ ' + r.name + ': ' + r.error);
  });
} else {
  console.log('\n  ✗ ' + FAIL + ' test(s) failed.\n');
  results.filter(function (r) { return r.status === 'FAIL'; }).forEach(function (r) {
    console.error('  ✗ ' + r.name + ': ' + r.error);
  });
}
process.exit(FAIL > 0 ? 1 : 0);
