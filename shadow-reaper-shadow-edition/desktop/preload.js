/**
 * shadow-desktop-companion/preload.js
 * Shadow Desktop Companion — Preload Script
 *
 * Build: SR-DESKTOP-1
 *
 * Exposes a safe, limited contextBridge API to the renderer.
 * Node.js APIs are NOT exposed directly.
 *
 * contextIsolation: true — the renderer cannot access require() or Node internals.
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// ── Shadow Companion API (exposed to renderer) ────────────────────────────────

contextBridge.exposeInMainWorld('ShadowCompanion', {

  // ── Status ────────────────────────────────────────────────────────────────
  getStatus:        () => ipcRenderer.invoke('get-status'),
  getBattery:       () => ipcRenderer.invoke('get-battery'),
  getNetwork:       () => ipcRenderer.invoke('get-network'),

  // ── Pairing ───────────────────────────────────────────────────────────────
  startPairing:     (name)  => ipcRenderer.invoke('start-pairing', name),
  completePairing:  (opts)  => ipcRenderer.invoke('complete-pairing', opts),
  revokePairing:    ()      => ipcRenderer.invoke('revoke-pairing'),
  getPairingState:  ()      => ipcRenderer.invoke('get-pairing-state'),

  // ── Approved apps/websites ────────────────────────────────────────────────
  getApprovedApps:    ()      => ipcRenderer.invoke('get-approved-apps'),
  addApprovedApp:     (entry) => ipcRenderer.invoke('add-approved-app', entry),
  removeApprovedApp:  (key)   => ipcRenderer.invoke('remove-approved-app', key),

  getApprovedUrls:    ()      => ipcRenderer.invoke('get-approved-urls'),
  addApprovedUrl:     (entry) => ipcRenderer.invoke('add-approved-url', entry),
  removeApprovedUrl:  (url)   => ipcRenderer.invoke('remove-approved-url', url),

  // ── Startup ───────────────────────────────────────────────────────────────
  getStartupStatus:   ()     => ipcRenderer.invoke('get-startup-status'),
  setStartup:         (on)   => ipcRenderer.invoke('set-startup', on),

  // ── Voice ─────────────────────────────────────────────────────────────────
  setVoice:           (on)   => ipcRenderer.invoke('set-voice', on),
  getVoiceState:      ()     => ipcRenderer.invoke('get-voice-state'),

  // ── Actions ───────────────────────────────────────────────────────────────
  executeAction:      (action, params) => ipcRenderer.invoke('execute-action', { action, params }),

  // ── QR Code ───────────────────────────────────────────────────────────────
  generateQR:         (text)   => ipcRenderer.invoke('generate-qr', text),

  // ── Credential store status ───────────────────────────────────────────────
  getCredentialStoreStatus: () => ipcRenderer.invoke('get-credential-store-status'),

  // ── Permissions ───────────────────────────────────────────────────────────
  getPermissions:     ()       => ipcRenderer.invoke('get-permissions'),
  updatePermissions:  (perms)  => ipcRenderer.invoke('update-permissions', perms),

  // ── Events from main process ──────────────────────────────────────────────
  onNavigate:         (cb) => ipcRenderer.on('navigate',          (_, page) => cb(page)),
  onVoiceStateChange: (cb) => ipcRenderer.on('voice-state-change', (_, on)   => cb(on)),
});
