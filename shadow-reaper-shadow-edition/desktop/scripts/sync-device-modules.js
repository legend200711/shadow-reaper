/**
 * desktop/scripts/sync-device-modules.js
 * Shadow Desktop Companion — Device Module Sync Script
 *
 * Run before building: npm run sync-devices && npm run build:linux
 *
 * Copies device modules from the project root into desktop/src/devices/
 * so they are included in the packaged app.asar under src/devices/.
 *
 * This is necessary because:
 *   - require('../devices/...') does NOT work inside a packaged app.asar
 *   - require('./src/devices/...') is the correct packaged path
 *   - electron-builder cannot include files from outside the desktop/ directory
 *     into the files[] array without a full path specification
 *
 * Device files are NOT modified here — they are copied verbatim.
 * The source of truth remains in the project root devices/ directory.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

const DESKTOP_ROOT  = path.join(__dirname, '..');
const PROJECT_ROOT  = path.join(DESKTOP_ROOT, '..');
const DEVICES_SRC   = path.join(PROJECT_ROOT, 'devices');
const DEVICES_DEST  = path.join(DESKTOP_ROOT, 'src', 'devices');

const FILES_TO_COPY = [
  { src: 'sr-desktop-agent-server.js',      dest: 'sr-desktop-agent-server.js' },
  { src: 'sr-device-action-log.js',         dest: 'sr-device-action-log.js'    },
  { src: 'sr-remote-connection-manager.js', dest: 'sr-remote-connection-manager.js' },
  { src: path.join('adapters', 'desktop-agent-adapter.js'), dest: path.join('adapters', 'desktop-agent-adapter.js') },
];

function ensureDir(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log('  Created: ' + dirPath);
  }
}

function copyFile(srcPath, destPath) {
  const content = fs.readFileSync(srcPath, 'utf8');
  ensureDir(path.dirname(destPath));
  fs.writeFileSync(destPath, content, 'utf8');
  console.log('  Copied:  ' + path.relative(PROJECT_ROOT, destPath));
}

console.log('Shadow Desktop Companion — Syncing device modules...');
console.log('  Source:  ' + DEVICES_SRC);
console.log('  Dest:    ' + DEVICES_DEST);
console.log('');

ensureDir(DEVICES_DEST);

let ok = 0, failed = 0;
FILES_TO_COPY.forEach(function (entry) {
  const srcPath  = path.join(DEVICES_SRC, entry.src);
  const destPath = path.join(DEVICES_DEST, entry.dest);
  try {
    copyFile(srcPath, destPath);
    ok++;
  } catch (e) {
    console.error('  ERROR:   ' + entry.src + ' — ' + e.message);
    failed++;
  }
});

console.log('');
if (failed === 0) {
  console.log('✓ ' + ok + ' device modules synced successfully.');
  console.log('');
  console.log('Now run: npm run build:linux');
} else {
  console.error('✗ ' + failed + ' file(s) failed to copy. Check paths above.');
  process.exit(1);
}
