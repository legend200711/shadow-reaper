/**
 * shadow-reaper-v2/api/v1/server.js
 * Shadow Reaper API v1 — Local Development HTTP Server
 *
 * Build: SR-API-V1-1
 *
 * Usage:
 *   node api/v1/server.js
 *   SR_API_TEST_MODE=true node api/v1/server.js
 *
 * Runs on http://localhost:4200 by default.
 * Environment variable: SR_API_PORT (override port)
 *
 * This is a thin Node.js http wrapper around the framework-agnostic router.
 * The same router.js is used by the Cloudflare Worker adapter.
 *
 * SECURITY:
 *   - Local dev only; never deploy this server directly to production.
 *   - Use the Cloudflare Worker (cloudflare/worker/index.js) for production.
 *
 * DO NOT DEPLOY THIS FILE.
 */

'use strict';

var http   = require('http');
var router = require('./router');

var PORT = parseInt(process.env.SR_API_PORT || '4200', 10);

var CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-SR-Client',
};

var server = http.createServer(function (req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, CORS_HEADERS);
    res.end();
    return;
  }

  var chunks = [];
  req.on('data', function (chunk) { chunks.push(chunk); });
  req.on('end', async function () {
    var rawBody = Buffer.concat(chunks).toString('utf8');
    var parsed  = null;

    // Parse JSON body for POST requests
    if (req.method === 'POST' && rawBody.trim().length > 0) {
      // Pre-parse dangerous key scan (catches __proto__ etc. before JSON.parse drops them)
      var schemas = require('./lib/schemas');
      var rawCheck = schemas.validateRawJson(rawBody);
      if (!rawCheck.ok) {
        var rawErrBody = JSON.stringify({
          ok: false,
          error: { code: 'INVALID_REQUEST', message: rawCheck.reason || 'Dangerous content in request.' },
        });
        res.writeHead(400, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
        res.end(rawErrBody);
        return;
      }
      try {
        parsed = JSON.parse(rawBody);
      } catch (e) {
        var errBody = JSON.stringify({
          ok: false,
          error: { code: 'INVALID_REQUEST', message: 'Malformed JSON in request body.' },
        });
        res.writeHead(400, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
        res.end(errBody);
        return;
      }
    }

    // Normalize headers to lowercase
    var headers = {};
    Object.keys(req.headers).forEach(function (k) {
      headers[k.toLowerCase()] = req.headers[k];
    });

    var apiReq = {
      method:  req.method,
      path:    req.url.split('?')[0],
      headers: headers,
      body:    parsed,
      env:     {
        SR_SERVICE_TOKENS: process.env.SR_SERVICE_TOKENS || null,
        SR_API_TEST_MODE:  process.env.SR_API_TEST_MODE  || null,
      },
    };

    try {
      var result = await router.dispatch(apiReq);
      var body   = result.body === null ? '' : JSON.stringify(result.body);
      res.writeHead(result.status, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
      res.end(body);
    } catch (e) {
      res.writeHead(500, Object.assign({ 'Content-Type': 'application/json' }, CORS_HEADERS));
      res.end(JSON.stringify({ ok: false, error: { code: 'INTERNAL_ERROR', message: 'Unexpected server error.' } }));
    }
  });
});

server.listen(PORT, function () {
  console.log('');
  console.log('══════════════════════════════════════════════');
  console.log('  Shadow Reaper API v1 — Local Dev Server');
  console.log('══════════════════════════════════════════════');
  console.log('  URL:  http://localhost:' + PORT + '/api/v1/');
  console.log('  Mode: ' + (process.env.SR_API_TEST_MODE === 'true' ? 'TEST (test tokens active)' : 'NORMAL'));
  console.log('');
  console.log('  Endpoints:');
  console.log('    GET  /api/v1/health');
  console.log('    GET  /api/v1/capabilities');
  console.log('    POST /api/v1/chat');
  console.log('    POST /api/v1/understand');
  console.log('    POST /api/v1/knowledge/query');
  console.log('    POST /api/v1/engine/command');
  console.log('    POST /api/v1/engine/context');
  console.log('');
  console.log('  DO NOT deploy this server. Use the Cloudflare Worker for production.');
  console.log('══════════════════════════════════════════════');
  console.log('');
});

module.exports = server;   // for testing
