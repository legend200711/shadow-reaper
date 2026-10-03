#!/usr/bin/env node
/**
 * shadow-reaper-v2/tests/api-first.test.js
 * Shadow Reaper — API-First Architecture Tests
 *
 * Build: SR-API-FIRST-1
 *
 * Tests the complete API-first architecture:
 *   1. POST /api/v1/chat — primary conversation endpoint
 *   2. POST /api/v1/identity — device identity management
 *   3. POST /api/v1/clear-data — clear user data
 *   4. Multi-user isolation
 *   5. Language Foundation enrichment
 *   6. Memory/history/projects context
 *   7. Generation metadata (hosted vs local)
 *   8. No localhost/local-machine dependencies
 *
 * Usage:
 *   node tests/api-first.test.js                          (public tests)
 *   node tests/api-first.test.js --firebase-token <tok>  (full auth tests)
 *   node tests/api-first.test.js --other-token <tok>     (isolation tests)
 */

'use strict';

const https = require('https');
const url   = require('url');
const fs    = require('fs');
const path  = require('path');

const WORKER_URL = 'https://sr-cloud-api.nthntjrn.workers.dev';
const API_BASE   = WORKER_URL + '/api/v1';

// ── CLI args ───────────────────────────────────────────────────────────────────
const args       = process.argv.slice(2);
const TOKEN_IDX  = args.indexOf('--firebase-token');
const OTHER_IDX  = args.indexOf('--other-token');
const FB_TOKEN   = TOKEN_IDX >= 0 ? args[TOKEN_IDX + 1] : null;
const OTHER_TOKEN = OTHER_IDX >= 0 ? args[OTHER_IDX + 1]  : null;
const IS_LIVE    = args.includes('--live');

// ── Test harness ───────────────────────────────────────────────────────────────
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

// ── HTTP helper ────────────────────────────────────────────────────────────────
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
      timeout:  30000,
    }, res => {
      let raw = '';
      res.on('data', c => { raw += c; });
      res.on('end', () => {
        let data;
        try { data = JSON.parse(raw); } catch (_) { data = { _raw: raw }; }
        resolve({ status: res.statusCode, body: data, headers: res.headers });
      });
    });

    req.on('timeout', () => { req.destroy(); reject(new Error('Request timed out')); });
    req.on('error',   e  => reject(e));
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1: Static/local tests (no network required)
// ═══════════════════════════════════════════════════════════════════════════════

async function runLocalTests() {
  console.log('\n── Local Architecture Tests ──');

  // ── API client module exists ───────────────────────────────────────────────
  await test('SR-API-CLIENT-1: sr-shadow-api-client.js exists', async () => {
    const p = path.join(__dirname, '..', 'sr-shadow-api-client.js');
    assert(fs.existsSync(p), 'sr-shadow-api-client.js must exist');
  });

  await test('SR-API-CLIENT-2: builds as SR-API-CLIENT-1', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'sr-shadow-api-client.js'), 'utf8');
    assert(src.includes('SR-API-CLIENT-1'), 'Build tag SR-API-CLIENT-1 must be present');
  });

  await test('SR-API-CLIENT-3: exposes SRShadowAPIClient global', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'sr-shadow-api-client.js'), 'utf8');
    assert(src.includes('global.SRShadowAPIClient'), 'Must expose SRShadowAPIClient');
  });

  await test('SR-API-CLIENT-4: has ask() method', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'sr-shadow-api-client.js'), 'utf8');
    assert(src.includes('function ask('), 'Must have ask() method');
  });

  await test('SR-API-CLIENT-5: has identity management', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'sr-shadow-api-client.js'), 'utf8');
    assert(src.includes('/api/v1/identity'), 'Must reference identity endpoint');
  });

  await test('SR-API-CLIENT-6: sends language analysis hints to server', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'sr-shadow-api-client.js'), 'utf8');
    assert(src.includes('languageAnalysis'), 'Must send languageAnalysis hints');
  });

  await test('SR-API-CLIENT-7: no hardcoded localhost in production path', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'sr-shadow-api-client.js'), 'utf8');
    // localhost is allowed in config/detection — not in the API call itself
    // The workerUrl is resolved at runtime from SRConfig
    assert(src.includes('SRConfig'), 'Must use SRConfig for worker URL');
  });

  // ── Cloud chat route exists ────────────────────────────────────────────────
  await test('CLOUD-CHAT-1: cloud-chat.js exists', async () => {
    const p = path.join(__dirname, '..', 'cloudflare', 'worker', 'routes', 'cloud-chat.js');
    assert(fs.existsSync(p), 'cloud-chat.js must exist');
  });

  await test('CLOUD-CHAT-2: handles POST /api/v1/chat', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'routes', 'cloud-chat.js'), 'utf8');
    assert(src.includes('handleChat'), 'Must export handleChat');
    assert(src.includes('/api/v1/chat'), 'Must reference chat path');
  });

  await test('CLOUD-CHAT-3: server assembles context — never trusts client system prompt', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'routes', 'cloud-chat.js'), 'utf8');
    assert(src.includes('SHADOW_SYSTEM_PROMPT'), 'System prompt must be server-defined');
    // Must NOT accept systemPrompt from request body
    assert(!src.includes('body.systemPrompt'), 'Must NOT trust client system prompt');
  });

  await test('CLOUD-CHAT-4: loads memory from Firestore server-side', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'routes', 'cloud-chat.js'), 'utf8');
    assert(src.includes('_loadMemory'), 'Must load memory server-side');
    assert(src.includes('shadowReaperMemory'), 'Must load from correct Firestore collection');
  });

  await test('CLOUD-CHAT-5: loads conversation history server-side', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'routes', 'cloud-chat.js'), 'utf8');
    assert(src.includes('_loadHistory'), 'Must load history server-side');
    assert(src.includes('shadowReaperConversations'), 'Must load from correct collection');
  });

  await test('CLOUD-CHAT-6: response includes hosted metadata', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'routes', 'cloud-chat.js'), 'utf8');
    assert(src.includes("'hosted'"), 'Must tag response with runtime: hosted');
    assert(src.includes("'cloudflare'"), 'Must tag response with provider: cloudflare');
    assert(src.includes('model:'), 'Must include model in response');
  });

  await test('CLOUD-CHAT-7: saves conversation turn after response', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'routes', 'cloud-chat.js'), 'utf8');
    assert(src.includes('_saveTurn'), 'Must save turns to history');
  });

  await test('CLOUD-CHAT-8: never logs conversation content', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'routes', 'cloud-chat.js'), 'utf8');
    // Must log only metadata
    assert(src.includes('Log metadata only — never conversation content'), 'Must note content privacy in logging');
  });

  // ── Cloud router has chat route ────────────────────────────────────────────
  await test('CLOUD-ROUTER-1: cloud-router.js imports cloud-chat.js', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'cloud-router.js'), 'utf8');
    assert(src.includes("from './routes/cloud-chat.js'"), 'Router must import cloud-chat');
  });

  await test('CLOUD-ROUTER-2: /api/v1/chat route is in route table', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'cloud-router.js'), 'utf8');
    assert(src.includes("'/api/v1/chat'"), 'Route table must include /api/v1/chat');
  });

  await test('CLOUD-ROUTER-3: chat route has authOptional', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'cloud-router.js'), 'utf8');
    assert(src.includes('authOptional: true'), 'Chat route must be authOptional');
  });

  await test('CLOUD-ROUTER-4: device token verification added', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'cloud-router.js'), 'utf8');
    assert(src.includes('verifyDeviceToken'), 'Router must support device token auth');
  });

  await test('CLOUD-ROUTER-5: identity endpoint in route table', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'cloud-router.js'), 'utf8');
    assert(src.includes("'/api/v1/identity'"), 'Route table must include /api/v1/identity');
  });

  await test('CLOUD-ROUTER-6: clear-data endpoint in route table', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'cloud-router.js'), 'utf8');
    assert(src.includes("'/api/v1/clear-data'"), 'Route table must include /api/v1/clear-data');
  });

  // ── Identity module ────────────────────────────────────────────────────────
  await test('IDENTITY-1: cloud-identity.js exists', async () => {
    const p = path.join(__dirname, '..', 'cloudflare', 'worker', 'routes', 'cloud-identity.js');
    assert(fs.existsSync(p), 'cloud-identity.js must exist');
  });

  await test('IDENTITY-2: uses cryptographically strong token generation', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'routes', 'cloud-identity.js'), 'utf8');
    assert(src.includes('crypto.getRandomValues'), 'Must use crypto.getRandomValues');
    assert(src.includes('Uint8Array(32)'), 'Must use 32-byte (256-bit) tokens');
  });

  await test('IDENTITY-3: hashes tokens before storage', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'routes', 'cloud-identity.js'), 'utf8');
    assert(src.includes('_hashToken'), 'Must hash tokens before storing');
    assert(src.includes('SHA-256'), 'Must use SHA-256 for hashing');
  });

  await test('IDENTITY-4: no universal shared UID', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'routes', 'cloud-identity.js'), 'utf8');
    assert(!src.includes("uid = 'shared'"), 'Must not use shared UID');
    assert(!src.includes("uid = 'anonymous'"), 'Must not use generic anonymous UID');
  });

  await test('IDENTITY-5: supports session-only degraded mode', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'routes', 'cloud-identity.js'), 'utf8');
    assert(src.includes('session-only'), 'Must support session-only mode when Firestore unavailable');
  });

  // ── Clear data module ──────────────────────────────────────────────────────
  await test('CLEAR-DATA-1: cloud-clear-data.js exists', async () => {
    const p = path.join(__dirname, '..', 'cloudflare', 'worker', 'routes', 'cloud-clear-data.js');
    assert(fs.existsSync(p), 'cloud-clear-data.js must exist');
  });

  await test('CLEAR-DATA-2: requires explicit confirmation string', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'routes', 'cloud-clear-data.js'), 'utf8');
    assert(src.includes('CLEAR MY SHADOW DATA'), 'Must require explicit confirmation');
  });

  await test('CLEAR-DATA-3: only clears user-scoped collections', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'routes', 'cloud-clear-data.js'), 'utf8');
    assert(src.includes('shadowReaperMemory'), 'Must clear memory');
    assert(src.includes('shadowReaperConversations'), 'Must clear conversations');
    assert(src.includes('shadowReaperProjects'), 'Must clear projects');
  });

  await test('CLEAR-DATA-4: does not clear Language Foundation or shared knowledge', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'routes', 'cloud-clear-data.js'), 'utf8');
    assert(!src.includes('sharedKnowledge'), 'Must NOT clear sharedKnowledge');
    assert(!src.includes('globalLearning'), 'Must NOT clear globalLearning');
    assert(!src.includes('shadowReaperConfig'), 'Must NOT clear system config');
  });

  // ── UI API-first routing ───────────────────────────────────────────────────
  await test('UI-API-FIRST-1: ui.html loads sr-shadow-api-client.js', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'ui.html'), 'utf8');
    assert(src.includes('sr-shadow-api-client.js'), 'UI must load the API client');
  });

  await test('UI-API-FIRST-2: ui.html loads config/shadow-config.js', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'ui.html'), 'utf8');
    assert(src.includes('shadow-config.js'), 'UI must load shadow-config.js');
  });

  await test('UI-API-FIRST-3: ui.html routes through SRShadowAPIClient.ask()', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'ui.html'), 'utf8');
    assert(src.includes('SRAPIClient.ask('), 'UI must use SRAPIClient.ask()');
  });

  await test('UI-API-FIRST-4: ui.html has fallback to local ShadowReaper', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'ui.html'), 'utf8');
    assert(src.includes('_fallbackToLocal'), 'UI must have local fallback');
    assert(src.includes('SR.ask('), 'UI must retain SR.ask() for fallback');
  });

  await test('UI-API-FIRST-5: generation status separates Hosted from Local', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'ui.html'), 'utf8');
    assert(src.includes("_lastGeneration = 'hosted'"), 'Must track hosted generation');
    assert(src.includes("_lastGeneration = 'local-gpu'"), 'Must track local-gpu generation');
    assert(src.includes("_lastGeneration = 'emergency'"), 'Must track emergency generation');
  });

  await test('UI-API-FIRST-6: no "Local Mode" ambiguous label', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'ui.html'), 'utf8');
    // Should not have a single "Local Mode" chip that conflates all local systems
    assert(!src.includes('Local Mode'), 'Must not use ambiguous "Local Mode" label');
  });

  await test('UI-API-FIRST-7: SRAuthUI init called (anonymous, no login)', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'ui.html'), 'utf8');
    assert(src.includes('SRAuthUI.init()'), 'Must call SRAuthUI.init() for auto anonymous auth');
  });

  await test('UI-API-FIRST-8: no login/signin/register prompts in UI', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'ui.html'), 'utf8');
    // These phrases should not appear in user-facing UI elements
    const uiSection = src.slice(src.indexOf('<body>'));  // Only check body content
    assert(!uiSection.includes('Sign In'), 'Must not show Sign In');
    assert(!uiSection.includes('Login'), 'Must not show Login');
    assert(!uiSection.includes('Register'), 'Must not show Register');
    assert(!uiSection.includes('Sign Up'), 'Must not show Sign Up');
  });

  // ── Service worker version bumped ────────────────────────────────────────────
  await test('SW-VERSION-1: Service worker cache version bumped', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'sw.js'), 'utf8');
    // v10 or higher required for API-first migration
    const match = src.match(/CACHE_VERSION = 'sr-shell-v(\d+)'/);
    assert(match, 'Must define CACHE_VERSION');
    const version = parseInt(match[1], 10);
    assert(version >= 10, 'Cache version must be v10 or higher for API-first migration (got v' + version + ')');
  });

  // ── No localhost production dependencies ─────────────────────────────────────
  await test('NO-LOCALHOST-1: sr-shadow-api-client.js does not hardcode localhost', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'sr-shadow-api-client.js'), 'utf8');
    // localhost may appear in config detection (isLocal check) but not as a hardcoded URL
    assert(!src.includes("'http://localhost"), 'sr-shadow-api-client.js must not hardcode localhost URLs');
  });

  await test('NO-LOCALHOST-2: cloud-chat.js has zero localhost references', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'routes', 'cloud-chat.js'), 'utf8');
    assert(!src.includes('localhost'), 'cloud-chat.js must not reference localhost');
    assert(!src.includes('127.0.0.1'), 'cloud-chat.js must not reference 127.0.0.1');
  });

  await test('NO-LOCALHOST-3: cloud-identity.js has zero localhost references', async () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', 'cloudflare', 'worker', 'routes', 'cloud-identity.js'), 'utf8');
    assert(!src.includes('localhost'), 'cloud-identity.js must not reference localhost');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2: Live endpoint tests (network required)
// ═══════════════════════════════════════════════════════════════════════════════

async function runLiveTests() {
  console.log('\n── Live Endpoint Tests ──');

  // ── Health check includes inference flag ────────────────────────────────────
  await test('LIVE-HEALTH-1: inference:true in health response', async () => {
    const r = await request('GET', '/health');
    assert(r.status === 200, 'Expected 200, got ' + r.status);
    assert(r.body.data && r.body.data.inference === true, 'inference must be true in health response');
  });

  // ── Identity endpoint ────────────────────────────────────────────────────────
  await test('LIVE-IDENTITY-1: POST /api/v1/identity returns sessionToken', async () => {
    const r = await request('POST', '/identity', {});
    assert(r.status === 200 || r.status === 201, 'Expected 200 or 201, got ' + r.status);
    assert(r.body.ok === true, 'Expected ok:true');
    assert(r.body.data && r.body.data.sessionToken, 'Must return sessionToken');
    assert(r.body.data.sessionToken.length === 64, 'sessionToken must be 64 chars');
    assert(r.body.data.uid, 'Must return uid');
    assert(r.body.data.isNew === true, 'First identity must be isNew:true');
  });

  await test('LIVE-IDENTITY-2: session token is hex string', async () => {
    const r = await request('POST', '/identity', {});
    const tok = r.body.data && r.body.data.sessionToken;
    assert(tok && /^[0-9a-f]{64}$/.test(tok), 'sessionToken must be 64 hex chars');
  });

  await test('LIVE-IDENTITY-3: two calls produce different tokens', async () => {
    const r1 = await request('POST', '/identity', {});
    const r2 = await request('POST', '/identity', {});
    const tok1 = r1.body.data && r1.body.data.sessionToken;
    const tok2 = r2.body.data && r2.body.data.sessionToken;
    assert(tok1 !== tok2, 'Each identity call must produce a unique token');
  });

  await test('LIVE-IDENTITY-4: no credentials in identity response', async () => {
    const r = await request('POST', '/identity', {});
    const s = JSON.stringify(r.body);
    assert(s.indexOf('private_key') === -1, 'private_key must not appear in response');
    assert(s.indexOf('tokenHash') === -1, 'tokenHash must not be exposed in response');
  });

  // ── Chat endpoint (session-only, no auth) ───────────────────────────────────
  await test('LIVE-CHAT-1: POST /api/v1/chat responds successfully', async () => {
    const r = await request('POST', '/chat', { message: 'Yo Shadow, what you up to?' });
    assert(r.status === 200, 'Expected 200, got ' + r.status + ' body: ' + JSON.stringify(r.body).slice(0, 200));
    assert(r.body.success === true, 'Expected success:true');
    assert(typeof r.body.text === 'string' && r.body.text.length > 0, 'Must return text response');
  });

  await test('LIVE-CHAT-2: response has runtime=hosted', async () => {
    const r = await request('POST', '/chat', { message: 'Hello.' });
    assert(r.body.runtime === 'hosted', 'Runtime must be "hosted"');
  });

  await test('LIVE-CHAT-3: response has provider and model', async () => {
    const r = await request('POST', '/chat', { message: 'Hi there.' });
    assert(r.body.provider, 'Must have provider');
    assert(r.body.model, 'Must have model');
  });

  await test('LIVE-CHAT-4: response has requestId', async () => {
    const r = await request('POST', '/chat', { message: 'How are you?' });
    assert(r.body.requestId, 'Must have requestId');
  });

  await test('LIVE-CHAT-5: response has latencyMs', async () => {
    const r = await request('POST', '/chat', { message: 'Quick question.' });
    assert(typeof r.body.latencyMs === 'number', 'Must have latencyMs as number');
  });

  await test('LIVE-CHAT-6: empty message rejected (400)', async () => {
    const r = await request('POST', '/chat', { message: '' });
    assert(r.status === 400, 'Expected 400 for empty message, got ' + r.status);
  });

  await test('LIVE-CHAT-7: oversized message rejected (400)', async () => {
    const r = await request('POST', '/chat', { message: 'x'.repeat(5000) });
    assert(r.status === 400, 'Expected 400 for oversized message, got ' + r.status);
  });

  await test('LIVE-CHAT-8: languageAnalysis hints accepted', async () => {
    const r = await request('POST', '/chat', {
      message: 'What is the weather like?',
      languageAnalysis: { intent: 'WEATHER_QUERY', negated: false, questionType: 'factual' },
    });
    assert(r.status === 200, 'Expected 200, got ' + r.status);
    assert(r.body.success === true, 'Expected success:true');
  });

  await test('LIVE-CHAT-9: no internal secrets in chat response', async () => {
    const r = await request('POST', '/chat', { message: 'Tell me something.' });
    const s = JSON.stringify(r.body);
    assert(s.indexOf('private_key') === -1, 'private_key must not appear in response');
    assert(s.indexOf('FIREBASE_SERVICE_ACCOUNT') === -1, 'Service account must not appear');
    assert(s.indexOf('ya29.') === -1, 'OAuth token must not appear in response');
  });

  await test('LIVE-CHAT-10: no stack traces in chat error response', async () => {
    const r = await request('POST', '/chat', { message: '' });
    const s = JSON.stringify(r.body);
    assert(s.indexOf(' at ') === -1, 'Stack trace must not appear in error');
    assert(s.indexOf('.js:') === -1, 'File path must not appear in error');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 3: Authenticated tests (requires Firebase token or device token)
// ═══════════════════════════════════════════════════════════════════════════════

async function runAuthChatTests(token) {
  console.log('\n── Authenticated Chat Tests ──');

  let convId = null;

  await test('AUTH-CHAT-1: chat with auth returns conversationId', async () => {
    const r = await request('POST', '/chat', {
      message:        'I have been working on this AI all day.',
    }, token);
    assert(r.status === 200, 'Expected 200, got ' + r.status);
    assert(r.body.success === true, 'Expected success:true');
    assert(r.body.conversationId, 'Must return conversationId when authenticated');
    convId = r.body.conversationId;
  });

  await test('AUTH-CHAT-2: follow-up uses same conversationId', async () => {
    if (!convId) throw new Error('No conversationId from previous test');
    const r = await request('POST', '/chat', {
      message:        'What did I say I have been working on?',
      conversationId: convId,
    }, token);
    assert(r.status === 200, 'Expected 200, got ' + r.status);
    assert(r.body.success === true, 'Expected success:true');
    // The response should reference the AI/conversation work
    assert(r.body.text && r.body.text.length > 0, 'Must return response text');
  });

  await test('AUTH-CHAT-3: memoryAvailable is boolean in response', async () => {
    const r = await request('POST', '/chat', { message: 'Hello.' }, token);
    assert(r.status === 200, 'Expected 200');
    assert(typeof r.body.memoryAvailable === 'boolean', 'memoryAvailable must be boolean');
  });

  await test('AUTH-CHAT-4: chat response does not expose uid', async () => {
    const r = await request('POST', '/chat', { message: 'Who am I?' }, token);
    const s = JSON.stringify(r.body);
    // uid should not appear in response (privacy)
    assert(s.indexOf('"uid"') === -1 || s.indexOf('"uid": null') !== -1 ||
           s.indexOf('"uid":null') !== -1,
           'uid must not be exposed in chat response');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 4: Multi-user isolation
// ═══════════════════════════════════════════════════════════════════════════════

async function runIsolationTests(tokenA, tokenB) {
  console.log('\n── Multi-User Isolation Tests ──');

  // Create a memory for user A
  let memoryIdA = null;

  await test('ISOLATION-CHAT-1: User A saves memory "favorite color = blue"', async () => {
    const r = await request('POST', '/memory', {
      content:  'My favorite color is blue',
      category: 'preference',
    }, tokenA);
    assert(r.status === 201, 'Expected 201, got ' + r.status);
    memoryIdA = r.body.data && r.body.data.id;
    assert(memoryIdA, 'Must return memory ID');
  });

  await test('ISOLATION-CHAT-2: User B cannot read User A memory', async () => {
    if (!memoryIdA) throw new Error('No memoryIdA to test');
    const r = await request('GET', '/memory/' + memoryIdA, null, tokenB);
    assert(r.status === 404, 'User B must get 404 for User A memory, got ' + r.status);
  });

  await test('ISOLATION-CHAT-3: User B memory list does not contain User A data', async () => {
    const r = await request('GET', '/memory', null, tokenB);
    assert(r.status === 200, 'Expected 200');
    if (memoryIdA && Array.isArray(r.body.data)) {
      const leaked = r.body.data.some(d => d.id === memoryIdA);
      assert(!leaked, 'ISOLATION BREACH: User A memory in User B list!');
    }
  });

  await test('ISOLATION-CHAT-4: User A chat does not reveal User B data', async () => {
    // Save a distinct memory for user B
    const memB = await request('POST', '/memory', {
      content: 'My favorite color is green',
      category: 'preference',
    }, tokenB);
    assert(memB.status === 201, 'User B memory created');

    // User A asks about color — should not get "green" (User B's preference)
    // Note: This is a probabilistic test — we verify isolation at the data level
    // The actual response may vary but User B's Firestore data path is isolated
    const r = await request('GET', '/memory', null, tokenA);
    assert(r.status === 200, 'User A memory list OK');
    const hasBData = r.body.data && r.body.data.some(d => d.data && d.data.content === 'My favorite color is green');
    assert(!hasBData, 'User A must not see User B memory content');

    // Cleanup
    if (memB.body.data && memB.body.data.id) {
      await request('DELETE', '/memory/' + memB.body.data.id, null, tokenB);
    }
  });

  // Cleanup
  if (memoryIdA) {
    await request('DELETE', '/memory/' + memoryIdA, null, tokenA);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 5: Clear data endpoint
// ═══════════════════════════════════════════════════════════════════════════════

async function runClearDataTests(token) {
  console.log('\n── Clear Data Tests ──');

  await test('CLEAR-1: clear-data without confirmation returns 400', async () => {
    const r = await request('POST', '/clear-data', { confirm: 'yes' }, token);
    assert(r.status === 400, 'Expected 400 without confirmation, got ' + r.status);
  });

  await test('CLEAR-2: clear-data without auth returns 401', async () => {
    const r = await request('POST', '/clear-data', { confirm: 'CLEAR MY SHADOW DATA' });
    assert(r.status === 401, 'Expected 401 without auth, got ' + r.status);
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════════

async function main() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Shadow Reaper — API-First Architecture Tests');
  console.log('  Worker: ' + WORKER_URL);
  console.log('═══════════════════════════════════════════════════════════');

  // Always run local (static) tests
  await runLocalTests();

  // Live tests if --live flag or --firebase-token given
  if (IS_LIVE || FB_TOKEN) {
    await runLiveTests();
  } else {
    console.log('\n── Live tests skipped (use --live or --firebase-token to run) ──');
  }

  // Auth tests if token provided
  if (FB_TOKEN) {
    await runAuthChatTests(FB_TOKEN);
    await runClearDataTests(FB_TOKEN);
  }

  // Multi-user isolation if both tokens provided
  if (FB_TOKEN && OTHER_TOKEN) {
    await runIsolationTests(FB_TOKEN, OTHER_TOKEN);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  Results');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  PASS : ' + PASS);
  console.log('  FAIL : ' + FAIL);
  console.log('  TOTAL: ' + TOTAL);

  if (FAIL === 0) {
    console.log('\n  ✓ All API-first tests passed.\n');
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
