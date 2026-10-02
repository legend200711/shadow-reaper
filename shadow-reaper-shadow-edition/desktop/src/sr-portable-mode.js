/**
 * shadow-desktop-companion/src/sr-portable-mode.js
 * Shadow Desktop Companion — Portable Mode Architecture
 *
 * Build: SR-DESKTOP-1
 *
 * Documents portable mode limitations.
 * Does NOT compromise the normal installed version.
 *
 * PORTABLE MODE LIMITATIONS:
 *   - Background services: NOT AVAILABLE (requires OS service registration)
 *   - Start with computer: NOT AVAILABLE (requires system startup mechanism)
 *   - OS permissions (mic, accessibility): MAY be limited without installation
 *   - Secure credential storage: FALLS BACK to session-only memory
 *     (keytar requires OS credential vault, not available from USB)
 *   - Auto-update: NOT AVAILABLE (no installation directory to update)
 *   - System tray on some Linux: MAY require desktop environment libraries
 *
 * WHAT WORKS IN PORTABLE MODE:
 *   - Full conversation UI (text + voice where browser supports)
 *   - Desktop agent connection (if relay URL known)
 *   - Device action routing
 *   - Approved apps/websites management (stored in portable data directory)
 *   - Action history (session only, not persisted without installation)
 *
 * IMPLEMENTATION STATUS:
 *   Architecture designed — PORTABLE BUILDS NOT YET PRODUCED
 *   Normal installed version is complete and is the primary target.
 */

'use strict';

const path = require('path');
const os   = require('os');
const fs   = require('fs');

const IS_PORTABLE_KEY = 'SHADOW_PORTABLE';

/**
 * isPortable()
 * Returns true if running in portable mode.
 * Detected by presence of SHADOW_PORTABLE=1 environment variable
 * or a .portable marker file next to the executable.
 */
function isPortable() {
  if (process.env[IS_PORTABLE_KEY] === '1') return true;
  try {
    const markerPath = path.join(path.dirname(process.execPath), '.portable');
    return fs.existsSync(markerPath);
  } catch (_) {
    return false;
  }
}

/**
 * getDataDir()
 * Returns the data directory for the current mode.
 * Portable: next to the executable
 * Installed: OS standard user data directory
 */
function getDataDir() {
  if (isPortable()) {
    return path.join(path.dirname(process.execPath), 'data');
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'ShadowDesktopCompanion');
  } else if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'ShadowDesktopCompanion');
  } else {
    return path.join(os.homedir(), '.config', 'shadow-desktop-companion');
  }
}

/**
 * getPortableCapabilities()
 * Returns which features are available in the current mode.
 */
function getPortableCapabilities() {
  const portable = isPortable();
  return {
    backgroundService:    !portable,
    startWithComputer:    !portable,
    secureCredentialStore: !portable,
    systemTray:           true,   // Available in both modes
    conversationUI:       true,
    voiceInput:           true,
    desktopAgent:         true,
    deviceControl:        true,
    persistentHistory:    !portable,
  };
}

module.exports = {
  isPortable,
  getDataDir,
  getPortableCapabilities,
  IS_PORTABLE_KEY,
};
