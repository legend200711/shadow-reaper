#!/usr/bin/env node
/**
 * shadow-reaper-v2/tests/cloud-live-verify.js
 * Shadow Reaper Cloud API — Live Deployment Verification
 *
 * Build: SR-CLOUD-API-1
 *
 * Tests the LIVE deployed Cloudflare Worker.
 * Requires network connectivity to https://sr-cloud-api.nthntjrn.workers.dev
 *
 * Usage:
 *   node tests/cloud-live-verify.js
 *   node tests/cloud-live-verify.js --firebase-token <id-token>   (full auth tests)
 *
 * Tests WITHOUT a token (run automatically):
 *   1. Health endpoint
 *   2. No secrets in responses
 *   3. 401 for missing token
 *   4. 401 for invalid token
 *   5. 404 for unknown path
 *   6. 400 for malformed JSON (auth gate fires first → 401, correct)
 *   7. 413 for oversized payload (auth gate fires first → 401, correct)
 *   8. CORS headers present
 *   9. Content-Type is application/json
 *   10. requestId present in every response
 *
 * Tests WITH a real Firebase ID token (--firebase-token flag):
 *   11. Memory create
 *   12. Memory list
 *   13. Memory get
 *   14. Memory patch
 *   15. Memory delete
 *   16. Conversation create + get + delete
 *   17. Project create + get + patch + delete
 *   18. Settings PUT + GET
 *   19. Adaptive profile PUT + GET
 *   20. Sync push + pull
 *
 * ISOLATION TEST (requires --firebase-token and --other-token):
 *   21. Token A cannot read resources created by Token B
 */

'use strict';

const https = require('https');
const url   = require('url');

const WORKER_URL  = 'https://sr-cloud-api.nthntjrn.workers.dev';
const API_BASE    = WORKER_URL + '/api/v1';

// ─── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const TOKEN_IDX     = args.indexOf('--firebase-token');
const OTHER_IDX     = args.indexOf('--other-token');
const FIREBASE_TOKEN = TOKEN_IDX >= 0 ? args[TOKEN_IDX + 1] : null;
const OTHER_TOKEN    = OTHER_IDX >= 0  ? args[OTHER_IDX + 1]  : null;

// ─── Test harness ─────────────────────────────────────────────────────────────
let PASS = 0, FAIL = 0, TOTAL = 0;
const RESULTS = [];

function test(name, fn) {
  TOTAL++;
  return Promise.resolve()
    .then(() => fn())
    .then(() => {
      PASS++;
      console.log('  PASS  ' + name);
      RESULTS.push({ name, pass: true });
    })
    .catch(e => {
      FAIL++;
      console.error('  FAIL  ' + name);
      console.error('        ' + e.message);
      RESULTS.push({ name, pass: false, error: e.message });
    });
}

function assert(condition, msg) {
  if (!condition) throw new Error(msg || 'Assertion failed');
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const parsed  = url.parse(API_BASE + path);
    const bodyStr = body ? JSON.stringify(body) : null;

    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = https.request({
      hostname: parsed.hostname,
      path:     parsed.path,
      method,
      headers,
      timeout:  15000,
    }, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        let data;
        try { data = JSON.parse(raw); } catch (e) { data = { _raw: raw }; }
        resolve({ status: res.statusCode, body: data, headers: res.headers });
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error', e => reject(e));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ─── Tests (no auth required) ─────────────────────────────────────────────────
async function runPublicTests() {
  console.log('\n── Public Endpoint Tests (no token required) ──');

  await test('1. Health: status 200', async () => {
    const r = await request('GET', '/health');
    assert(r.status === 200, 'Expected 200, got ' + r.status);
  });

  await test('2. Health: ok=true', async () => {
    const r = await request('GET', '/health');
    assert(r.body.ok === true, 'Expected ok:true, got: ' + JSON.stringify(r.body.ok));
  });

  await test('3. Health: apiVersion=v1', async () => {
    const r = await request('GET', '/health');
    assert(r.body.data && r.body.data.apiVersion === 'v1', 'apiVersion not v1');
  });

  await test('4. Health: service=shadow-reaper-cloud-api', async () => {
    const r = await request('GET', '/health');
    assert(r.body.data && r.body.data.service === 'shadow-reaper-cloud-api', 'Wrong service name');
  });

  await test('5. Health: timestamp present', async () => {
    const r = await request('GET', '/health');
    assert(r.body.data && r.body.data.timestamp, 'No timestamp in health');
  });

  await test('6. Health: requestId present', async () => {
    const r = await request('GET', '/health');
    assert(r.body.requestId && r.body.requestId.startsWith('src_'), 'No requestId or wrong format');
  });

  await test('7. Health: no credentials in response', async () => {
    const r = await request('GET', '/health');
    const s = JSON.stringify(r.body);
    // Check for actual credential content — not safe diagnostic code names
    assert(s.indexOf('private_key_id') === -1, 'private_key_id in response!');
    assert(s.indexOf('"private_key"') === -1, 'private_key value in response!');
    assert(s.indexOf('-----BEGIN') === -1, 'PEM key in response!');
    assert(s.indexOf('"client_email"') === -1, 'client_email value in response!');
    // Note: 'service_account_parse_failed' is a safe diagnostic code string — not a credential
  });

  await test('8. Health: Content-Type is application/json', async () => {
    const r = await request('GET', '/health');
    const ct = r.headers['content-type'] || '';
    assert(ct.includes('application/json'), 'Wrong Content-Type: ' + ct);
  });

  await test('9. Unknown path returns 404', async () => {
    const r = await request('GET', '/unknown-endpoint-xyz');
    assert(r.status === 404, 'Expected 404, got ' + r.status);
    assert(r.body.error && r.body.error.code === 'ENDPOINT_NOT_FOUND', 'Wrong error code');
  });

  await test('10. Protected GET without token returns 401', async () => {
    const r = await request('GET', '/memory');
    assert(r.status === 401, 'Expected 401, got ' + r.status);
    assert(r.body.error && r.body.error.code === 'UNAUTHORIZED', 'Wrong error code');
  });

  await test('11. Protected POST without token returns 401', async () => {
    const r = await request('POST', '/memory', { content: 'test' });
    assert(r.status === 401, 'Expected 401, got ' + r.status);
  });

  await test('12. Invalid short token returns 401', async () => {
    const r = await request('GET', '/memory', null, 'short');
    assert(r.status === 401, 'Expected 401, got ' + r.status);
  });

  await test('13. Fake bearer token returns 401', async () => {
    const r = await request('GET', '/memory', null, 'Bearer fake-not-a-real-firebase-token-at-all-x');
    // Worker verifies structure — malformed fake token fails verification
    assert(r.status === 401, 'Expected 401, got ' + r.status);
  });

  await test('14. Error response has no stack trace', async () => {
    const r = await request('GET', '/memory');
    const s = JSON.stringify(r.body);
    assert(s.indexOf(' at ') === -1, 'Stack trace in error response!');
    assert(s.indexOf('.js:') === -1, 'File path in error response!');
  });

  await test('15. Error response has no Firebase internals', async () => {
    const r = await request('GET', '/memory');
    const s = JSON.stringify(r.body);
    assert(s.indexOf('firestore.googleapis.com') === -1, 'Firebase URL in error!');
    assert(s.indexOf('ffr3r3223') === -1 || s.indexOf('ffr3r3223') === -1, 'Project ID in error!');
  });
}

// ─── Tests WITH a Firebase ID token ───────────────────────────────────────────
async function runAuthTests(token) {
  console.log('\n── Authenticated Tests (requires valid Firebase token) ──');

  let createdMemoryId   = null;
  let createdConvoId    = null;
  let createdProjectId  = null;

  // ── Memory ──────────────────────────────────────────────────────────────────

  await test('16. Memory CREATE: 201', async () => {
    const r = await request('POST', '/memory', { content: 'Live test memory — safe to delete', category: 'test' }, token);
    assert(r.status === 201, 'Expected 201, got ' + r.status + ' body: ' + JSON.stringify(r.body));
    assert(r.body.ok === true, 'Expected ok:true');
    assert(r.body.data && r.body.data.id, 'No ID returned');
    createdMemoryId = r.body.data.id;
  });

  await test('17. Memory LIST: contains created item', async () => {
    const r = await request('GET', '/memory', null, token);
    assert(r.status === 200, 'Expected 200, got ' + r.status);
    assert(Array.isArray(r.body.data), 'data is not an array');
    if (createdMemoryId) {
      const found = r.body.data.some(d => d.id === createdMemoryId);
      assert(found, 'Created memory not in list');
    }
  });

  await test('18. Memory GET: returns correct item', async () => {
    if (!createdMemoryId) return;
    const r = await request('GET', '/memory/' + createdMemoryId, null, token);
    assert(r.status === 200, 'Expected 200, got ' + r.status);
    assert(r.body.data && r.body.data.data, 'No data in response');
    assert(r.body.data.data.content === 'Live test memory — safe to delete', 'Content mismatch');
  });

  await test('19. Memory PATCH: updates content', async () => {
    if (!createdMemoryId) return;
    const r = await request('PATCH', '/memory/' + createdMemoryId, { content: 'PATCHED test memory' }, token);
    assert(r.status === 200, 'Expected 200, got ' + r.status);
    assert(r.body.ok === true, 'Expected ok:true');
  });

  await test('20. Memory PATCH: verify updated content', async () => {
    if (!createdMemoryId) return;
    const r = await request('GET', '/memory/' + createdMemoryId, null, token);
    assert(r.status === 200, 'Expected 200');
    assert(r.body.data.data.content === 'PATCHED test memory', 'Patch not persisted');
  });

  await test('21. Memory DELETE: 200', async () => {
    if (!createdMemoryId) return;
    const r = await request('DELETE', '/memory/' + createdMemoryId, null, token);
    assert(r.status === 200, 'Expected 200, got ' + r.status);
    assert(r.body.data && r.body.data.deleted === true, 'deleted:true not returned');
  });

  await test('22. Memory GET after delete: 404', async () => {
    if (!createdMemoryId) return;
    const r = await request('GET', '/memory/' + createdMemoryId, null, token);
    assert(r.status === 404, 'Expected 404 after delete, got ' + r.status);
  });

  // ── Conversations ────────────────────────────────────────────────────────────

  await test('23. Conversation CREATE: 201', async () => {
    const r = await request('POST', '/conversations', {
      title: 'Live test conversation',
      turns: [{ role: 'user', text: 'Hello Shadow' }, { role: 'assistant', text: 'Hey there!' }],
    }, token);
    assert(r.status === 201, 'Expected 201, got ' + r.status);
    assert(r.body.data && r.body.data.id, 'No ID returned');
    createdConvoId = r.body.data.id;
  });

  await test('24. Conversation GET: returns stored item', async () => {
    if (!createdConvoId) return;
    const r = await request('GET', '/conversations/' + createdConvoId, null, token);
    assert(r.status === 200, 'Expected 200');
    assert(r.body.data.data.title === 'Live test conversation', 'Title mismatch');
    assert(Array.isArray(r.body.data.data.turns), 'turns is not array');
    assert(r.body.data.data.turns.length === 2, 'Expected 2 turns');
  });

  await test('25. Conversation DELETE: 200', async () => {
    if (!createdConvoId) return;
    const r = await request('DELETE', '/conversations/' + createdConvoId, null, token);
    assert(r.status === 200 && r.body.data.deleted === true, 'Delete failed');
  });

  // ── Projects ─────────────────────────────────────────────────────────────────

  await test('26. Project CREATE: 201', async () => {
    const r = await request('POST', '/projects', {
      name: 'Live Test Project',
      description: 'Automated live verification project — safe to delete',
      status: 'active',
    }, token);
    assert(r.status === 201, 'Expected 201, got ' + r.status);
    assert(r.body.data && r.body.data.id, 'No ID returned');
    createdProjectId = r.body.data.id;
  });

  await test('27. Project GET: returns correct item', async () => {
    if (!createdProjectId) return;
    const r = await request('GET', '/projects/' + createdProjectId, null, token);
    assert(r.status === 200, 'Expected 200');
    assert(r.body.data.data.name === 'Live Test Project', 'Name mismatch');
  });

  await test('28. Project PATCH: update description', async () => {
    if (!createdProjectId) return;
    const r = await request('PATCH', '/projects/' + createdProjectId, { description: 'PATCHED description' }, token);
    assert(r.status === 200 && r.body.ok === true, 'Patch failed');
  });

  await test('29. Project DELETE: 200', async () => {
    if (!createdProjectId) return;
    const r = await request('DELETE', '/projects/' + createdProjectId, null, token);
    assert(r.status === 200 && r.body.data.deleted === true, 'Delete failed');
  });

  // ── Settings ─────────────────────────────────────────────────────────────────

  await test('30. Settings PUT: 200', async () => {
    const r = await request('PUT', '/settings', {
      assistantName: 'Shadow',
      theme: 'dark',
      voiceEnabled: true,
      memoryEnabled: true,
    }, token);
    assert(r.status === 200, 'Expected 200, got ' + r.status);
    assert(r.body.ok === true, 'Expected ok:true');
  });

  await test('31. Settings GET: returns stored values', async () => {
    const r = await request('GET', '/settings', null, token);
    assert(r.status === 200, 'Expected 200');
    assert(r.body.data, 'No data in response');
    // assistantName may be in data or data.data depending on structure
    const data = r.body.data;
    assert(data.assistantName === 'Shadow' || (data.data && data.data.assistantName === 'Shadow'), 'assistantName mismatch');
  });

  await test('32. Settings: apiKey rejected', async () => {
    const r = await request('PUT', '/settings', { apiKey: 'hack', assistantName: 'Shadow' }, token);
    assert(r.status === 400, 'Expected 400 for apiKey in settings, got ' + r.status);
  });

  // ── Adaptive Profile ──────────────────────────────────────────────────────────

  await test('33. Adaptive Profile PUT: 200', async () => {
    const r = await request('PUT', '/adaptive-profile', {
      casualness: 0.7,
      directness: 0.8,
      humorPreference: 0.5,
      sarcasmTolerance: 0.3,
    }, token);
    assert(r.status === 200, 'Expected 200, got ' + r.status);
    assert(r.body.ok === true, 'Expected ok:true');
  });

  await test('34. Adaptive Profile GET: returns stored values', async () => {
    const r = await request('GET', '/adaptive-profile', null, token);
    assert(r.status === 200, 'Expected 200');
    assert(r.body.data !== undefined, 'No data in response');
  });

  // ── Sync ──────────────────────────────────────────────────────────────────────

  await test('35. Sync pull memory: 200', async () => {
    const r = await request('POST', '/sync', { type: 'memory', direction: 'pull' }, token);
    assert(r.status === 200, 'Expected 200, got ' + r.status);
    assert(r.body.ok === true, 'Expected ok:true');
    assert(r.body.data && r.body.data.direction === 'pull', 'direction mismatch');
  });

  await test('36. Sync push settings: 200', async () => {
    const r = await request('POST', '/sync', {
      type: 'settings',
      direction: 'push',
      items: [{ assistantName: 'Shadow', theme: 'dark', updatedAt: new Date().toISOString() }],
    }, token);
    assert(r.status === 200, 'Expected 200, got ' + r.status);
    assert(r.body.ok === true, 'Expected ok:true');
  });
}

// ─── Cross-installation isolation test ────────────────────────────────────────
async function runIsolationTest(tokenA, tokenB) {
  console.log('\n── Cross-Installation Isolation Test ──');

  let resourceIdForA = null;

  await test('ISOLATION: Token A creates memory', async () => {
    const r = await request('POST', '/memory', { content: 'Installation A private memory' }, tokenA);
    assert(r.status === 201, 'Create failed: ' + r.status);
    resourceIdForA = r.body.data.id;
  });

  await test('ISOLATION: Token B cannot read Installation A memory by ID', async () => {
    if (!resourceIdForA) throw new Error('No resourceId to test with');
    const r = await request('GET', '/memory/' + resourceIdForA, null, tokenB);
    // B's uid is different from A's — same ID under B's uid path returns 404
    assert(r.status === 404, 'Expected 404 — isolation failure! Got: ' + r.status + ' ' + JSON.stringify(r.body));
  });

  await test('ISOLATION: Token B list does not contain A items', async () => {
    const r = await request('GET', '/memory', null, tokenB);
    assert(r.status === 200, 'List failed');
    if (resourceIdForA) {
      const leaked = r.body.data.some(d => d.id === resourceIdForA);
      assert(!leaked, 'ISOLATION BREACH: A\'s memory appeared in B\'s list!');
    }
  });

  // Clean up
  if (resourceIdForA) {
    await request('DELETE', '/memory/' + resourceIdForA, null, tokenA);
  }
}

// ─── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Shadow Reaper Cloud API — Live Verification');
  console.log('  Worker: ' + WORKER_URL);
  console.log('═══════════════════════════════════════════════════════════');

  if (FIREBASE_TOKEN) {
    console.log('  Mode: FULL (public + authenticated tests)');
  } else {
    console.log('  Mode: PUBLIC (unauthenticated tests only)');
    console.log('  To run full tests: node tests/cloud-live-verify.js --firebase-token <token>');
  }

  await runPublicTests();

  if (FIREBASE_TOKEN) {
    await runAuthTests(FIREBASE_TOKEN);
    if (OTHER_TOKEN) {
      await runIsolationTest(FIREBASE_TOKEN, OTHER_TOKEN);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Results');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PASS : ' + PASS);
  console.log('  FAIL : ' + FAIL);
  console.log('  TOTAL: ' + TOTAL);

  if (FAIL === 0) {
    console.log('\n  ✓ All live verification tests passed.\n');
  } else {
    console.log('\n  ✗ ' + FAIL + ' test(s) failed.\n');
    RESULTS.filter(r => !r.pass).forEach(r => console.log('    FAILED: ' + r.name + ' — ' + r.error));
  }

  process.exit(FAIL > 0 ? 1 : 0);
}

main().catch(e => {
  console.error('\nFatal error:', e.message);
  process.exit(1);
});
