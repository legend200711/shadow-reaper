/**
 * shadow-desktop-companion/src/sr-credential-store.js
 * Shadow Desktop Companion — Secure Credential Store
 *
 * Build: SR-DESKTOP-1  (Linux Mint deployment pass)
 *
 * Wraps OS credential storage:
 *   Windows  → Credential Manager (via keytar)
 *   macOS    → Keychain (via keytar)
 *   Linux    → Secret Service / libsecret (via keytar)
 *
 * LINUX REQUIREMENTS (libsecret keytar binding):
 *   Runtime: libsecret-1-0 (libsecret-1.so.0) — present on most GNOME/Cinnamon DEs
 *   Build:   libsecret-1-dev + libgnome-keyring-dev  (for npm install / native rebuild)
 *   Keyring: gnome-keyring (or any Secret Service provider) must be running
 *
 *   Install if missing:
 *     sudo apt install libsecret-1-dev libgnome-keyring-dev
 *     (then: npm install inside desktop/)
 *
 * FALLBACK BEHAVIOUR (keytar unavailable):
 *   Credentials are held in memory ONLY for the current session.
 *   They ARE NOT written to disk in plaintext.
 *   Shadow will NOT persist the pairing across restarts in this state.
 *   A clear warning is emitted to stderr — never silently degraded.
 *
 * NEVER logs:
 *   - passwords
 *   - pairing tokens
 *   - API keys
 *   - bearer tokens
 */

'use strict';

const SERVICE_NAME = 'ShadowDesktopCompanion';

// ── keytar load — with explicit Linux missing-dep diagnostics ─────────────────
// keytar uses native bindings (libsecret on Linux).
// It may fail if libsecret-1-dev was not installed at npm install time,
// or if the Secret Service daemon is not running.
// We NEVER silently fall back to plaintext storage.

let _keytar = null;
let _keytarUnavailableReason = null;

try {
  _keytar = require('keytar');
} catch (e) {
  _keytarUnavailableReason = e.message || 'unknown error';
  if (process.platform === 'linux') {
    process.stderr.write(
      '[ShadowCredentialStore] WARNING: keytar unavailable on Linux — ' + _keytarUnavailableReason + '\n' +
      '[ShadowCredentialStore] Credentials will NOT persist across restarts.\n' +
      '[ShadowCredentialStore] To enable persistent secure storage:\n' +
      '[ShadowCredentialStore]   sudo apt install libsecret-1-dev libgnome-keyring-dev\n' +
      '[ShadowCredentialStore]   cd desktop && npm install\n'
    );
  } else {
    process.stderr.write(
      '[ShadowCredentialStore] WARNING: keytar unavailable — credentials session-only. Reason: ' + _keytarUnavailableReason + '\n'
    );
  }
}

// ── In-memory cache (never written to disk in plaintext) ──────────────────────
const _cache = {};

// ── Save a credential ─────────────────────────────────────────────────────────

/**
 * save(key, value)
 * Stores a secret under SERVICE_NAME/key in OS credential store.
 * key   — non-sensitive label (e.g. 'agentId', 'pairingToken')
 * value — secret to store
 */
async function save(key, value) {
  if (!key || value === undefined || value === null) return;
  _cache[key] = value;
  if (_keytar) {
    try {
      await _keytar.setPassword(SERVICE_NAME, key, String(value));
      return true;
    } catch (_) {
      // keytar save failed; value only in memory for session
      return false;
    }
  }
  // No secure store available — value lives in memory only for this session.
  // Caller should be aware credentials won't persist across restarts.
  return false;
}

// ── Load a credential ─────────────────────────────────────────────────────────

/**
 * load(key)
 * Returns stored credential or null.
 */
async function load(key) {
  if (!key) return null;
  if (_cache[key] !== undefined) return _cache[key];
  if (_keytar) {
    try {
      const val = await _keytar.getPassword(SERVICE_NAME, key);
      if (val !== null && val !== undefined) {
        _cache[key] = val;
      }
      return val || null;
    } catch (_) {
      return null;
    }
  }
  return null;
}

// ── Delete a credential ───────────────────────────────────────────────────────

async function remove(key) {
  if (!key) return;
  delete _cache[key];
  if (_keytar) {
    try {
      await _keytar.deletePassword(SERVICE_NAME, key);
    } catch (_) {}
  }
}

// ── Clear all Shadow credentials ──────────────────────────────────────────────

async function clearAll() {
  for (const key of Object.keys(_cache)) {
    delete _cache[key];
  }
  if (_keytar) {
    try {
      const creds = await _keytar.findCredentials(SERVICE_NAME);
      for (const c of (creds || [])) {
        await _keytar.deletePassword(SERVICE_NAME, c.account);
      }
    } catch (_) {}
  }
}

// ── Availability check ────────────────────────────────────────────────────────

function isSecureStoreAvailable() {
  return !!_keytar;
}

/**
 * getUnavailableReason()
 * Returns the error message from the failed keytar load, or null if available.
 * Used by the UI to surface a clear warning to the user.
 */
function getUnavailableReason() {
  return _keytarUnavailableReason;
}

module.exports = {
  save,
  load,
  remove,
  clearAll,
  isSecureStoreAvailable,
  getUnavailableReason,
};
