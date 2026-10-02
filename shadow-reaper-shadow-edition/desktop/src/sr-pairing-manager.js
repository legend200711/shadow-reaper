/**
 * shadow-desktop-companion/src/sr-pairing-manager.js
 * Shadow Desktop Companion — Pairing Manager
 *
 * Build: SR-DESKTOP-1
 *
 * Manages the pairing lifecycle for this computer:
 *   1. Generate device ID + pairing code
 *   2. Display pairing code / QR to user
 *   3. Wait for phone approval
 *   4. Receive confirmation with granted permissions
 *   5. Store pairing state via credential store
 *   6. Allow revocation at any time
 *
 * Each computer instance has:
 *   - deviceId     — unique UUID for this installation
 *   - pairingToken — secret, stored in OS credential store
 *   - permissions  — granted by the user on their phone
 *
 * SECURITY:
 *   - deviceId is non-secret, shareable
 *   - pairingToken is secret, never logged
 *   - Pairing codes are 6-digit, time-limited (10 minutes)
 *   - Universal credentials are NEVER used
 *   - Each computer has its own isolated identity
 */

'use strict';

const os               = require('os');
const crypto           = require('crypto');
const credStore        = require('./sr-credential-store');

// ── Storage keys ──────────────────────────────────────────────────────────────

const KEY_DEVICE_ID     = 'deviceId';
const KEY_AGENT_ID      = 'agentId';
const KEY_PAIRING_TOKEN = 'pairingToken';
const KEY_RELAY_URL     = 'relayUrl';
const KEY_PERMISSIONS   = 'grantedPermissions';
const KEY_COMPUTER_NAME = 'computerName';

// ── Pairing code config ───────────────────────────────────────────────────────

const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;  // 10 minutes

// ── In-memory state ───────────────────────────────────────────────────────────

let _deviceId       = null;
let _agentId        = null;
let _pairingToken   = null;
let _relayUrl       = null;
let _permissions    = null;
let _computerName   = null;
let _paired         = false;

let _activePairingCode       = null;
let _activePairingCodeExpiry = null;
let _pairingCodeTimer        = null;

// ── Event callbacks ───────────────────────────────────────────────────────────

let _onPairingComplete = null;   // cb(pairingResult)
let _onPairingRevoked  = null;   // cb()

// ── Device ID generation ──────────────────────────────────────────────────────

function _generateDeviceId() {
  return 'srd_' + crypto.randomBytes(12).toString('hex');
}

function _generatePairingCode() {
  const n = Math.floor(100000 + Math.random() * 900000);
  return String(n).slice(0, 3) + ' ' + String(n).slice(3);
}

// ── Initialize (load stored identity) ────────────────────────────────────────

async function init() {
  _deviceId     = await credStore.load(KEY_DEVICE_ID);
  _agentId      = await credStore.load(KEY_AGENT_ID);
  _pairingToken = await credStore.load(KEY_PAIRING_TOKEN);
  _relayUrl     = await credStore.load(KEY_RELAY_URL);
  _computerName = await credStore.load(KEY_COMPUTER_NAME) || os.hostname();

  const permRaw = await credStore.load(KEY_PERMISSIONS);
  if (permRaw) {
    try { _permissions = JSON.parse(permRaw); } catch (_) { _permissions = null; }
  }

  if (!_deviceId) {
    _deviceId = _generateDeviceId();
    await credStore.save(KEY_DEVICE_ID, _deviceId);
  }

  _paired = !!(_pairingToken && _agentId);
  return getState();
}

// ── Start pairing (generate code + QR) ───────────────────────────────────────

/**
 * startPairing(computerName)
 * Generates a pairing code and returns it for display.
 * Returns: { deviceId, computerName, pairingCode, expiresAt, platform }
 */
async function startPairing(computerName) {
  if (computerName) {
    _computerName = computerName;
    await credStore.save(KEY_COMPUTER_NAME, computerName);
  } else {
    _computerName = _computerName || os.hostname();
  }

  // Clear any existing pairing code timer
  if (_pairingCodeTimer) {
    clearTimeout(_pairingCodeTimer);
    _pairingCodeTimer = null;
  }

  _activePairingCode       = _generatePairingCode();
  _activePairingCodeExpiry = Date.now() + PAIRING_CODE_TTL_MS;

  // Auto-expire
  _pairingCodeTimer = setTimeout(function () {
    _activePairingCode       = null;
    _activePairingCodeExpiry = null;
    _pairingCodeTimer        = null;
  }, PAIRING_CODE_TTL_MS);

  return {
    deviceId:     _deviceId,
    computerName: _computerName,
    pairingCode:  _activePairingCode,
    expiresAt:    _activePairingCodeExpiry,
    platform:     process.platform,
  };
}

// ── Complete pairing (called by backend when phone approves) ──────────────────

/**
 * completePairing(opts)
 * opts = {
 *   agentId:       string  — assigned by backend
 *   pairingToken:  string  — secret token (never logged)
 *   relayUrl:      string  — WSS relay URL
 *   permissions:   object  — granted permission set
 * }
 */
async function completePairing(opts) {
  if (!opts || !opts.agentId || !opts.pairingToken || !opts.relayUrl) {
    return { ok: false, error: 'Missing required pairing fields.' };
  }

  _agentId      = opts.agentId;
  _pairingToken = opts.pairingToken;
  _relayUrl     = opts.relayUrl;
  _permissions  = opts.permissions || {};
  _paired       = true;

  // Store secrets in OS credential vault — never in plaintext config
  await credStore.save(KEY_AGENT_ID,      _agentId);
  await credStore.save(KEY_PAIRING_TOKEN, _pairingToken);
  await credStore.save(KEY_RELAY_URL,     _relayUrl);
  await credStore.save(KEY_PERMISSIONS,   JSON.stringify(_permissions));

  // Clear pairing code — single use
  _activePairingCode       = null;
  _activePairingCodeExpiry = null;
  if (_pairingCodeTimer) {
    clearTimeout(_pairingCodeTimer);
    _pairingCodeTimer = null;
  }

  if (typeof _onPairingComplete === 'function') {
    _onPairingComplete(getState());
  }

  return { ok: true, state: getState() };
}

// ── Revoke pairing ────────────────────────────────────────────────────────────

async function revokePairing() {
  _agentId      = null;
  _pairingToken = null;
  _relayUrl     = null;
  _permissions  = null;
  _paired       = false;

  await credStore.remove(KEY_AGENT_ID);
  await credStore.remove(KEY_PAIRING_TOKEN);
  await credStore.remove(KEY_RELAY_URL);
  await credStore.remove(KEY_PERMISSIONS);

  if (typeof _onPairingRevoked === 'function') {
    _onPairingRevoked();
  }
}

// ── Validate pairing code ─────────────────────────────────────────────────────

function validatePairingCode(code) {
  if (!_activePairingCode || !_activePairingCodeExpiry) return false;
  if (Date.now() > _activePairingCodeExpiry) return false;
  const normalized = (code || '').replace(/\s+/g, ' ').trim();
  return normalized === _activePairingCode;
}

// ── State ─────────────────────────────────────────────────────────────────────

function getState() {
  return {
    paired:       _paired,
    deviceId:     _deviceId,
    agentId:      _agentId,          // non-sensitive
    relayUrl:     _relayUrl,         // non-sensitive URL
    computerName: _computerName,
    platform:     process.platform,
    permissions:  _permissions,
    // pairingToken intentionally NOT included — never in UI state
  };
}

function getPairingCredentials() {
  // Only for internal agent startup — never exposed to UI
  return {
    agentId:      _agentId,
    pairingToken: _pairingToken,
    relayUrl:     _relayUrl,
  };
}

function isPaired() {
  return _paired;
}

// ── Permission helpers ────────────────────────────────────────────────────────

const PERMISSION_CATEGORIES = {
  applications:   'Allow Shadow to open approved applications.',
  media:          'Allow play/pause/next/previous control.',
  audio:          'Allow volume and mute control.',
  system:         'Allow system status queries.',
  lock:           'Allow locking the computer screen.',
  sleep:          'Allow putting the computer to sleep.',
  websites:       'Allow opening approved URLs in the browser.',
  remoteControl:  'Allow commands from paired Shadow Edition devices.',
};

function hasPermission(category) {
  if (!_paired || !_permissions) return false;
  return !!_permissions[category];
}

function updatePermissions(newPerms) {
  _permissions = Object.assign({}, _permissions || {}, newPerms);
  credStore.save(KEY_PERMISSIONS, JSON.stringify(_permissions));
}

// ── Event hooks ───────────────────────────────────────────────────────────────

function onPairingComplete(cb)  { _onPairingComplete = cb; }
function onPairingRevoked(cb)   { _onPairingRevoked  = cb; }

module.exports = {
  init,
  startPairing,
  completePairing,
  revokePairing,
  validatePairingCode,
  getState,
  getPairingCredentials,
  isPaired,
  hasPermission,
  updatePermissions,
  onPairingComplete,
  onPairingRevoked,
  PERMISSION_CATEGORIES,
  PAIRING_CODE_TTL_MS,
};
