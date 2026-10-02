#!/usr/bin/env node
/**
 * shadow-reaper-v2/scripts/dev-server.js
 * Shadow Reaper — Local Development Server with COOP/COEP Headers
 *
 * Build: SR-DEV-SERVER-1
 *
 * PURPOSE:
 *   Serves the Shadow Reaper PWA locally with the Cross-Origin headers required
 *   for SharedArrayBuffer and WebLLM threading to work in Chrome/Firefox.
 *
 *   Required headers:
 *     Cross-Origin-Opener-Policy:   same-origin
 *     Cross-Origin-Embedder-Policy: require-corp
 *
 *   These headers cause window.crossOriginIsolated = true, which:
 *     1. Enables SharedArrayBuffer (required by WebLLM threading)
 *     2. Enables Atomics.wait() in Web Workers
 *
 * USAGE:
 *   node scripts/dev-server.js
 *   node scripts/dev-server.js --port 8080
 *   node scripts/dev-server.js --port 8080 --no-coop
 *
 * ACCESS:
 *   http://localhost:3000
 *   http://localhost:3000/diag-probe.html    — Hybrid inference diagnostics
 *   http://localhost:3000/index.html         — Main UI
 *
 * NOTE ON COEP COMPATIBILITY:
 *   COEP require-corp restricts cross-origin resources. This means:
 *   - CDN imports (esm.run, jsdelivr, etc.) must serve CORP: cross-origin headers
 *   - OR must be loaded via no-cors mode
 *
 *   esm.run and jsdelivr.net BOTH serve Cross-Origin-Resource-Policy: cross-origin
 *   headers, making them compatible with COEP require-corp. (Verified June 2025.)
 *
 *   If a CDN resource causes a COEP violation, the symptom is a network error
 *   in the browser console — the resource will be blocked. In that case, either:
 *   a) Use --no-coop to disable COOP/COEP (SharedArrayBuffer unavailable)
 *   b) Self-host the resource
 *
 * WHY NOT python3 -m http.server?
 *   The Python built-in server does not support custom response headers.
 *   It cannot serve COOP/COEP headers. This Node.js server can.
 *
 * ALTERNATIVE:
 *   npx serve --cors --headers '{"Cross-Origin-Opener-Policy":"same-origin",...}'
 *   works if `serve` supports per-header configuration. This server is simpler
 *   and has zero external dependencies beyond Node.js.
 */

'use strict';

var http = require('http');
var fs   = require('fs');
var path = require('path');
var url  = require('url');

// ─── Parse CLI arguments ─────────────────────────────────────────────────────

var PORT = 3000;
var ENABLE_COOP = true;

var args = process.argv.slice(2);
for (var i = 0; i < args.length; i++) {
  if (args[i] === '--port' && args[i + 1]) {
    PORT = parseInt(args[i + 1], 10);
    i++;
  }
  if (args[i] === '--no-coop') {
    ENABLE_COOP = false;
  }
}

// ─── MIME types ───────────────────────────────────────────────────────────────

var MIME = {
  '.html':  'text/html; charset=utf-8',
  '.js':    'application/javascript; charset=utf-8',
  '.mjs':   'application/javascript; charset=utf-8',
  '.css':   'text/css; charset=utf-8',
  '.json':  'application/json; charset=utf-8',
  '.png':   'image/png',
  '.jpg':   'image/jpeg',
  '.jpeg':  'image/jpeg',
  '.svg':   'image/svg+xml',
  '.ico':   'image/x-icon',
  '.wasm':  'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.txt':   'text/plain',
  '.map':   'application/json',
};

// ─── Serve ───────────────────────────────────────────────────────────────────

var ROOT = path.join(__dirname, '..');

function serveFile(res, filePath, headers) {
  fs.readFile(filePath, function (err, data) {
    if (err) {
      res.writeHead(404, headers);
      res.end('Not Found: ' + filePath);
      return;
    }
    var ext  = path.extname(filePath).toLowerCase();
    var mime = MIME[ext] || 'application/octet-stream';
    var respHeaders = Object.assign({}, headers, {
      'Content-Type':   mime,
      'Content-Length': data.length,
    });
    res.writeHead(200, respHeaders);
    res.end(data);
  });
}

var server = http.createServer(function (req, res) {
  // ── COOP/COEP headers ──────────────────────────────────────────────────────
  var headers = {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Headers': '*',
  };

  if (ENABLE_COOP) {
    // Required for SharedArrayBuffer / WebLLM threading
    headers['Cross-Origin-Opener-Policy']   = 'same-origin';
    headers['Cross-Origin-Embedder-Policy'] = 'require-corp';
  }

  // ── CORS preflight ─────────────────────────────────────────────────────────
  if (req.method === 'OPTIONS') {
    res.writeHead(204, headers);
    res.end();
    return;
  }

  // ── Parse path ─────────────────────────────────────────────────────────────
  var parsed   = url.parse(req.url);
  var pathname = decodeURIComponent(parsed.pathname || '/');

  // Default to index.html for root
  if (pathname === '/' || pathname === '') {
    pathname = '/index.html';
  }

  // Security: prevent path traversal
  var fullPath = path.join(ROOT, pathname);
  if (!fullPath.startsWith(ROOT)) {
    res.writeHead(403, headers);
    res.end('Forbidden');
    return;
  }

  // If path is a directory, serve index.html inside it
  fs.stat(fullPath, function (err, stat) {
    if (!err && stat && stat.isDirectory()) {
      serveFile(res, path.join(fullPath, 'index.html'), headers);
      return;
    }
    serveFile(res, fullPath, headers);
  });
});

server.listen(PORT, function () {
  console.log('');
  console.log('  Shadow Reaper Dev Server');
  console.log('  ─────────────────────────────────────────────────────');
  console.log('  URL:  http://localhost:' + PORT);
  console.log('  Root: ' + ROOT);
  console.log('');
  if (ENABLE_COOP) {
    console.log('  ✓ COOP/COEP headers ENABLED');
    console.log('    Cross-Origin-Opener-Policy:   same-origin');
    console.log('    Cross-Origin-Embedder-Policy: require-corp');
    console.log('    → window.crossOriginIsolated = true');
    console.log('    → SharedArrayBuffer AVAILABLE');
    console.log('    → WebLLM threading ENABLED');
  } else {
    console.log('  ⚠ COOP/COEP headers DISABLED (--no-coop)');
    console.log('    → window.crossOriginIsolated = false');
    console.log('    → SharedArrayBuffer may be UNAVAILABLE');
    console.log('    → WebLLM threading may fail');
  }
  console.log('');
  console.log('  Pages:');
  console.log('    http://localhost:' + PORT + '/index.html         — Main UI');
  console.log('    http://localhost:' + PORT + '/diag-probe.html    — Diagnostics');
  console.log('    http://localhost:' + PORT + '/dev-test.html      — Dev test');
  console.log('');
  console.log('  NOTE: CDN resources (esm.run, jsdelivr) must serve CORP headers.');
  console.log('  If you see COEP violations, run with --no-coop to disable.');
  console.log('');
  console.log('  Stop: Ctrl+C');
  console.log('');
});

server.on('error', function (err) {
  if (err.code === 'EADDRINUSE') {
    console.error('  ✗ Port ' + PORT + ' is already in use. Try: node scripts/dev-server.js --port 8080');
  } else {
    console.error('  ✗ Server error:', err.message);
  }
  process.exit(1);
});
