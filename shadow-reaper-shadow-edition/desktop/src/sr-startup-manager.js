/**
 * shadow-desktop-companion/src/sr-startup-manager.js
 * Shadow Desktop Companion — Startup Manager
 *
 * Build: SR-DESKTOP-1
 *
 * Handles "Start Shadow when computer starts" setting.
 *
 * Platform implementations:
 *   Windows  → Registry Run key (HKCU\Software\Microsoft\Windows\CurrentVersion\Run)
 *   macOS    → LaunchAgent plist (~/.config/LaunchAgents/)
 *   Linux    → XDG autostart .desktop file (~/.config/autostart/)
 *
 * IMPORTANT:
 *   - Never silently enables startup without user permission
 *   - User must explicitly toggle the setting
 *   - getStatus() reports actual state, not assumed state
 */

'use strict';

const path   = require('path');
const os     = require('os');
const fs     = require('fs');

const IS_WIN   = process.platform === 'win32';
const IS_MAC   = process.platform === 'darwin';
const IS_LINUX = process.platform === 'linux';

const APP_NAME    = 'ShadowDesktopCompanion';
const APP_EXE_KEY = 'ShadowDesktopCompanion';

// ── Windows startup (registry) ────────────────────────────────────────────────

function _winEnable(exePath) {
  // Use child_process to write registry key (no native deps required)
  const { exec } = require('child_process');
  const safeExe  = '"' + exePath.replace(/"/g, '\\"') + '"';
  const cmd = `reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${APP_EXE_KEY}" /d ${safeExe} /f`;
  return new Promise((resolve, reject) => {
    exec(cmd, (err) => err ? reject(err) : resolve());
  });
}

function _winDisable() {
  const { exec } = require('child_process');
  const cmd = `reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${APP_EXE_KEY}" /f`;
  return new Promise((resolve) => {
    exec(cmd, () => resolve());  // ignore error if key didn't exist
  });
}

function _winGetStatus() {
  const { exec } = require('child_process');
  return new Promise((resolve) => {
    exec(`reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run" /v "${APP_EXE_KEY}"`, (err, stdout) => {
      resolve(!err && stdout.includes(APP_EXE_KEY));
    });
  });
}

// ── macOS startup (LaunchAgent plist) ─────────────────────────────────────────

function _macPlistPath() {
  return path.join(os.homedir(), 'Library', 'LaunchAgents', 'com.shadowedition.desktop.plist');
}

function _macEnable(exePath) {
  const plistPath = _macPlistPath();
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.shadowedition.desktop</string>
  <key>ProgramArguments</key>
  <array>
    <string>${exePath}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <false/>
</dict>
</plist>`;
  return new Promise((resolve, reject) => {
    const dir = path.dirname(plistPath);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(plistPath, plist, 'utf8');
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

function _macDisable() {
  const plistPath = _macPlistPath();
  return new Promise((resolve) => {
    try { if (fs.existsSync(plistPath)) fs.unlinkSync(plistPath); } catch (_) {}
    resolve();
  });
}

function _macGetStatus() {
  return Promise.resolve(fs.existsSync(_macPlistPath()));
}

// ── Linux startup (XDG autostart) ─────────────────────────────────────────────

function _linuxDesktopPath() {
  return path.join(os.homedir(), '.config', 'autostart', 'shadow-desktop-companion.desktop');
}

function _linuxEnable(exePath) {
  const desktopPath = _linuxDesktopPath();
  const content = [
    '[Desktop Entry]',
    'Encoding=UTF-8',
    'Type=Application',
    'Name=Shadow Desktop Companion',
    'Comment=Shadow Edition AI Companion',
    'Exec=' + exePath + ' --no-sandbox',
    'Icon=shadow-desktop-companion',
    'Hidden=false',
    'NoDisplay=false',
    'X-GNOME-Autostart-enabled=true',
    'StartupNotify=false',
    'StartupWMClass=shadow-desktop-companion',
  ].join('\n') + '\n';

  return new Promise((resolve, reject) => {
    const dir = path.dirname(desktopPath);
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(desktopPath, content, 'utf8');
      resolve();
    } catch (err) {
      reject(err);
    }
  });
}

function _linuxDisable() {
  const desktopPath = _linuxDesktopPath();
  return new Promise((resolve) => {
    try { if (fs.existsSync(desktopPath)) fs.unlinkSync(desktopPath); } catch (_) {}
    resolve();
  });
}

function _linuxGetStatus() {
  return Promise.resolve(fs.existsSync(_linuxDesktopPath()));
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * enable(exePath)
 * Registers the app to start with the OS.
 * Requires explicit user action — never called silently.
 */
async function enable(exePath) {
  if (!exePath) throw new Error('exePath is required to enable startup.');
  if (IS_WIN)   return _winEnable(exePath);
  if (IS_MAC)   return _macEnable(exePath);
  if (IS_LINUX) return _linuxEnable(exePath);
  throw new Error('Start with computer is not supported on this platform: ' + process.platform);
}

/**
 * disable()
 * Removes the app from OS startup.
 */
async function disable() {
  if (IS_WIN)   return _winDisable();
  if (IS_MAC)   return _macDisable();
  if (IS_LINUX) return _linuxDisable();
}

/**
 * getStatus()
 * Returns true if startup is currently enabled.
 */
async function getStatus() {
  if (IS_WIN)   return _winGetStatus();
  if (IS_MAC)   return _macGetStatus();
  if (IS_LINUX) return _linuxGetStatus();
  return false;
}

module.exports = { enable, disable, getStatus };
