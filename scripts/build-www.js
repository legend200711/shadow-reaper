/**
 * scripts/build-www.js
 * Shadow Reaper — Android Build Preparation Script
 *
 * Copies the web application source files into the www/ directory
 * that Capacitor uses as the WebView bundle.
 *
 * Run: node scripts/build-www.js
 * Then: npx cap sync android
 *
 * NOTE: The www/ directory is not the "deployed" web app — it is the
 * web asset bundle that lives inside the native APK.
 * The GitHub Pages PWA and the Android native APK are separate artifacts.
 */

'use strict';

var fs   = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var WWW  = path.join(ROOT, 'www');

// ── Files and directories to copy into www/ ───────────────────────────────
var COPY_FILES = [
  'index.html',
  'manifest.json',
  'sw.js',
  'shadow-reaper.js',
  'snx-shadow-adaptive.js',
  'snx-shadow-conv-history.js',
  'snx-shadow-memory.js',
  'sr-auth-ui.js',
  'sr-feature-registry.js',
  'sr-pwa-state.js',
];

var COPY_DIRS = [
  'platform',
  'adapters',
  'core',
  'voice',
  'knowledge',
  'translation',
  'memory',
  'history',
  'security',
  'firebase',
  'config',
  'icons',
  'global-learning',
  'research',
  'language',
];

// ── Utilities ─────────────────────────────────────────────────────────────
function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyFileSync(src, dest) {
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function copyDirSync(src, dest) {
  if (!fs.existsSync(src)) return;
  ensureDir(dest);
  var entries = fs.readdirSync(src, { withFileTypes: true });
  for (var i = 0; i < entries.length; i++) {
    var entry  = entries[i];
    var srcPath  = path.join(src, entry.name);
    var destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      // Skip node_modules and android directories inside www
      if (entry.name === 'node_modules' || entry.name === 'android' || entry.name === 'www') continue;
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────
ensureDir(WWW);

// Copy individual files
COPY_FILES.forEach(function (file) {
  var src  = path.join(ROOT, file);
  var dest = path.join(WWW, file);
  if (fs.existsSync(src)) {
    copyFileSync(src, dest);
    console.log('  copied: ' + file);
  } else {
    console.warn('  WARN: not found: ' + file);
  }
});

// Copy directories
COPY_DIRS.forEach(function (dir) {
  var src  = path.join(ROOT, dir);
  var dest = path.join(WWW, dir);
  if (fs.existsSync(src)) {
    copyDirSync(src, dest);
    console.log('  copied dir: ' + dir + '/');
  } else {
    console.warn('  WARN: dir not found: ' + dir);
  }
});

console.log('\nwww/ build complete. Run: npx cap sync android');
