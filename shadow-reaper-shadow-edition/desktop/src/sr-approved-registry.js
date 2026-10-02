/**
 * shadow-desktop-companion/src/sr-approved-registry.js
 * Shadow Desktop Companion — Approved Apps & Websites Manager
 *
 * Build: SR-DESKTOP-1
 *
 * Manages user-controlled allowlists for:
 *   - Applications Shadow is permitted to launch
 *   - Websites Shadow is permitted to open
 *
 * Wraps and extends the approved registries in sr-desktop-agent-server.js.
 * Changes here are persisted to a local config file (NOT credentials — not secret).
 * No auth tokens or secrets are stored here.
 *
 * The Desktop Agent's APPROVED_APPS and APPROVED_URLS are extended at runtime
 * with user-added entries via registerHandler overrides.
 */

'use strict';

const path    = require('path');
const os      = require('os');
const fs      = require('fs');

// ── Storage location ──────────────────────────────────────────────────────────
// Configuration (not secrets) — stored in user data directory

function _getConfigDir() {
  // Use standard per-OS user data location
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || os.homedir(), 'ShadowDesktopCompanion');
  } else if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'ShadowDesktopCompanion');
  } else {
    return path.join(os.homedir(), '.config', 'shadow-desktop-companion');
  }
}

function _getAppsPath()  { return path.join(_getConfigDir(), 'approved-apps.json'); }
function _getUrlsPath()  { return path.join(_getConfigDir(), 'approved-urls.json'); }

// ── Default apps (mirrored from sr-desktop-agent-server.js) ──────────────────

const DEFAULT_APPS = [
  { name: 'Spotify',             key: 'spotify',    win32: 'spotify.exe',  darwin: 'Spotify',             linux: 'spotify' },
  { name: 'Google Chrome',       key: 'chrome',     win32: 'chrome.exe',   darwin: 'Google Chrome',       linux: 'google-chrome' },
  { name: 'Firefox',             key: 'firefox',    win32: 'firefox.exe',  darwin: 'Firefox',             linux: 'firefox' },
  { name: 'VS Code',             key: 'vscode',     win32: 'code.exe',     darwin: 'Visual Studio Code',  linux: 'code' },
  { name: 'Discord',             key: 'discord',    win32: 'Discord.exe',  darwin: 'Discord',             linux: 'discord' },
  { name: 'Slack',               key: 'slack',      win32: 'slack.exe',    darwin: 'Slack',               linux: 'slack' },
  { name: 'Zoom',                key: 'zoom',       win32: 'Zoom.exe',     darwin: 'zoom.us',             linux: 'zoom' },
  { name: 'Calculator',          key: 'calculator', win32: 'calc.exe',     darwin: 'Calculator',          linux: 'gnome-calculator' },
  { name: 'Terminal',            key: 'terminal',   win32: 'cmd.exe',      darwin: 'Terminal',            linux: 'gnome-terminal' },
  { name: 'Notepad',             key: 'notepad',    win32: 'notepad.exe',  darwin: null,                  linux: null },
  { name: 'TextEdit',            key: 'textedit',   win32: null,           darwin: 'TextEdit',            linux: null },
  // Linux Mint common applications
  { name: 'VLC',                 key: 'vlc',        win32: null,           darwin: 'VLC',                 linux: 'vlc' },
  { name: 'Thunar',              key: 'thunar',     win32: null,           darwin: null,                  linux: 'thunar' },
  { name: 'Mousepad',            key: 'mousepad',   win32: null,           darwin: null,                  linux: 'mousepad' },
  { name: 'Files',               key: 'files',      win32: null,           darwin: null,                  linux: 'nemo' },
  { name: 'Nemo',                key: 'nemo',       win32: null,           darwin: null,                  linux: 'nemo' },
];

// ── Default URLs (mirrored from sr-desktop-agent-server.js) ──────────────────

const DEFAULT_URLS = [
  { name: 'YouTube',  url: 'https://www.youtube.com' },
  { name: 'Netflix',  url: 'https://www.netflix.com' },
  { name: 'Spotify',  url: 'https://www.spotify.com' },
  { name: 'GitHub',   url: 'https://www.github.com' },
];

// ── In-memory state ───────────────────────────────────────────────────────────

let _apps = null;
let _urls = null;

// ── Load ──────────────────────────────────────────────────────────────────────

function _ensureDir() {
  const dir = _getConfigDir();
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function _loadApps() {
  if (_apps) return _apps;
  try {
    const p = _getAppsPath();
    if (fs.existsSync(p)) {
      _apps = JSON.parse(fs.readFileSync(p, 'utf8'));
    } else {
      _apps = DEFAULT_APPS.slice();
    }
  } catch (_) {
    _apps = DEFAULT_APPS.slice();
  }
  return _apps;
}

function _loadUrls() {
  if (_urls) return _urls;
  try {
    const p = _getUrlsPath();
    if (fs.existsSync(p)) {
      _urls = JSON.parse(fs.readFileSync(p, 'utf8'));
    } else {
      _urls = DEFAULT_URLS.slice();
    }
  } catch (_) {
    _urls = DEFAULT_URLS.slice();
  }
  return _urls;
}

// ── Save ──────────────────────────────────────────────────────────────────────

function _saveApps() {
  try { _ensureDir(); fs.writeFileSync(_getAppsPath(), JSON.stringify(_apps, null, 2), 'utf8'); } catch (_) {}
}

function _saveUrls() {
  try { _ensureDir(); fs.writeFileSync(_getUrlsPath(), JSON.stringify(_urls, null, 2), 'utf8'); } catch (_) {}
}

// ── Apps API ──────────────────────────────────────────────────────────────────

function getApps() {
  return _loadApps().slice();
}

/**
 * addApp(entry)
 * entry = { name, key, win32, darwin, linux }
 * 'key' is the lowercase lookup key Shadow uses.
 */
function addApp(entry) {
  if (!entry || !entry.name || !entry.key) return { ok: false, error: 'name and key are required.' };
  const apps = _loadApps();
  const existing = apps.findIndex(a => a.key === entry.key.toLowerCase());
  const normalized = {
    name:   entry.name,
    key:    entry.key.toLowerCase().trim(),
    win32:  entry.win32  || null,
    darwin: entry.darwin || null,
    linux:  entry.linux  || null,
  };
  if (existing >= 0) {
    apps[existing] = normalized;
  } else {
    apps.push(normalized);
  }
  _apps = apps;
  _saveApps();
  return { ok: true };
}

function removeApp(key) {
  const apps = _loadApps();
  _apps = apps.filter(a => a.key !== key);
  _saveApps();
}

// ── URLs API ──────────────────────────────────────────────────────────────────

function getUrls() {
  return _loadUrls().slice();
}

/**
 * addUrl(entry)
 * entry = { name, url }
 * url must start with https://
 */
function addUrl(entry) {
  if (!entry || !entry.name || !entry.url) return { ok: false, error: 'name and url are required.' };
  if (!entry.url.startsWith('https://')) return { ok: false, error: 'Only https:// URLs are permitted.' };
  const urls = _loadUrls();
  const existing = urls.findIndex(u => u.url === entry.url);
  const normalized = { name: entry.name, url: entry.url };
  if (existing >= 0) {
    urls[existing] = normalized;
  } else {
    urls.push(normalized);
  }
  _urls = urls;
  _saveUrls();
  return { ok: true };
}

function removeUrl(url) {
  const urls = _loadUrls();
  _urls = urls.filter(u => u.url !== url);
  _saveUrls();
}

/**
 * isUrlApproved(url)
 * Returns true if the URL starts with any approved URL prefix.
 */
function isUrlApproved(url) {
  return _loadUrls().some(u => url.startsWith(u.url));
}

/**
 * buildAgentApprovedApps()
 * Returns a map compatible with sr-desktop-agent-server.js APPROVED_APPS format.
 */
function buildAgentApprovedApps() {
  const map = {};
  _loadApps().forEach(app => {
    map[app.key] = {
      win32:  app.win32  || null,
      darwin: app.darwin || null,
      linux:  app.linux  || null,
    };
  });
  return map;
}

/**
 * buildAgentApprovedUrls()
 * Returns array of URL strings for sr-desktop-agent-server.js APPROVED_URLS.
 */
function buildAgentApprovedUrls() {
  return _loadUrls().map(u => u.url);
}

module.exports = {
  getApps, addApp, removeApp,
  getUrls, addUrl, removeUrl, isUrlApproved,
  buildAgentApprovedApps, buildAgentApprovedUrls,
  DEFAULT_APPS, DEFAULT_URLS,
};
