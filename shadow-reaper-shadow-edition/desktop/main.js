/**
 * shadow-desktop-companion/main.js
 * Shadow Desktop Companion — Electron Main Process
 *
 * Build: SR-DESKTOP-2
 *
 * PACKAGING FIX (SR-DESKTOP-2):
 *   - Replaced require('../devices/...') with require('./src/devices/...')
 *     so the path resolves correctly inside the packaged app.asar.
 *   - Added asarUnpack for keytar.node (native binary must be outside asar).
 *   - Added process.on('uncaughtException') and process.on('unhandledRejection')
 *     so startup crashes are logged instead of silently swallowed.
 *   - Added persistent startup log to userData/logs/startup.log.
 *   - Made tray, agent, and credential-store init non-fatal:
 *     window opens regardless of component failures.
 *   - Added graceful icon-path fallback.
 *   - Added renderer 'did-fail-load' and 'crashed' handlers.
 *
 * Architecture:
 *   main.js (this file)
 *     │
 *     ├── BrowserWindow → renderer/ (Shadow Companion UI)
 *     ├── Tray / Menu bar
 *     ├── IPC handlers (ipcMain)
 *     ├── src/devices/sr-desktop-agent-server.js  (Stage 10 agent — packaged copy)
 *     ├── src/sr-platform-adapters.js     (extended actions)
 *     ├── src/sr-pairing-manager.js       (pairing lifecycle)
 *     ├── src/sr-startup-manager.js       (start with computer)
 *     └── src/sr-approved-registry.js     (apps/URLs allowlists)
 */

'use strict';

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, dialog } = require('electron');
const path   = require('path');
const os     = require('os');
const fs     = require('fs');

// ── Startup log ───────────────────────────────────────────────────────────────
// Written to: userData/logs/startup.log
// Credentials / secrets MUST NEVER be written here.

let _logPath = null;

function _initLog() {
  try {
    const logDir = path.join(app.getPath('userData'), 'logs');
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    _logPath = path.join(logDir, 'startup.log');
    // Keep only last 500 KB of log
    try {
      const stat = fs.statSync(_logPath);
      if (stat.size > 500 * 1024) {
        fs.writeFileSync(_logPath, '');  // rotate
      }
    } catch (_) {}
  } catch (e) {
    process.stderr.write('[ShadowDesktop] Could not init log: ' + e.message + '\n');
  }
}

function _log(msg) {
  const line = '[' + new Date().toISOString() + '] ' + msg;
  process.stdout.write(line + '\n');
  if (_logPath) {
    try { fs.appendFileSync(_logPath, line + '\n'); } catch (_) {}
  }
}

// ── Global error capture (before anything else) ───────────────────────────────
// These catch startup crashes that would otherwise silently kill the process.

process.on('uncaughtException', (err) => {
  const msg = '[FATAL uncaughtException] ' + (err && err.stack ? err.stack : String(err));
  process.stderr.write(msg + '\n');
  _log(msg);
  // Don't exit — let the app try to continue unless it cannot
});

process.on('unhandledRejection', (reason) => {
  const msg = '[WARN unhandledRejection] ' + (reason instanceof Error ? reason.stack : String(reason));
  _log(msg);
});

// ── Internal modules ──────────────────────────────────────────────────────────

const pairingMgr   = require('./src/sr-pairing-manager');
const platformAdpt = require('./src/sr-platform-adapters');
const startupMgr   = require('./src/sr-startup-manager');
const approvedReg  = require('./src/sr-approved-registry');

// ── Desktop Agent (Stage 10 — packaged copy at src/devices/) ─────────────────
//
// ROOT CAUSE FIX (SR-DESKTOP-2):
//   The original code used:  require('../devices/sr-desktop-agent-server')
//   Inside app.asar, __dirname resolves to the asar root, and '../' goes
//   OUTSIDE the asar to a path that doesn't exist on the installed system.
//
//   Solution: electron-builder copies the devices/ files into src/devices/
//   (see package.json build.files). We require from there instead.
//
// If the packaged copy is missing, fall back gracefully (agent = null).

let SRDesktopAgent = null;
try {
  SRDesktopAgent = require('./src/devices/sr-desktop-agent-server');
  _log('[OK] sr-desktop-agent-server loaded');
} catch (e) {
  _log('[WARN] sr-desktop-agent-server failed to load: ' + e.message + ' — agent will be unavailable');
}

// ── App state ─────────────────────────────────────────────────────────────────

let mainWindow   = null;
let tray         = null;
let voiceOn      = true;
let agentRunning = false;

const BUILD_ID    = 'SR-DESKTOP-2';
const APP_VERSION = '1.0.0';

// ── Single-instance lock ──────────────────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  _log('[INFO] Second instance — focusing existing window and exiting');
  app.quit();
  process.exit(0);
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  }
});

// ── Create main window ────────────────────────────────────────────────────────

function createWindow() {
  _log('[STARTUP] Creating BrowserWindow');

  // Resolve icon path — graceful fallback if file missing
  let iconPath;
  const candidateIcon = path.join(__dirname, 'assets', 'icon.png');
  try {
    if (fs.existsSync(candidateIcon)) {
      iconPath = candidateIcon;
    } else {
      _log('[WARN] icon.png not found at: ' + candidateIcon + ' — using no icon');
    }
  } catch (_) {}

  const winOpts = {
    width:           820,
    height:          640,
    minWidth:        600,
    minHeight:       480,
    backgroundColor: '#0d0f13',
    title:           'Shadow Desktop Companion',
    frame:           true,
    titleBarStyle:   process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload:             path.join(__dirname, 'preload.js'),
      contextIsolation:    true,
      nodeIntegration:     false,
      sandbox:             false,
    },
  };

  if (iconPath) winOpts.icon = iconPath;

  mainWindow = new BrowserWindow(winOpts);

  // Renderer load diagnostics
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDesc, validatedURL) => {
    _log('[ERROR] Renderer did-fail-load: code=' + errorCode + ' desc=' + errorDesc + ' url=' + validatedURL);
  });

  mainWindow.webContents.on('render-process-gone', (event, details) => {
    _log('[ERROR] render-process-gone: reason=' + details.reason + ' exitCode=' + details.exitCode);
  });

  mainWindow.webContents.on('did-finish-load', () => {
    _log('[OK] Renderer did-finish-load');
  });

  mainWindow.webContents.on('dom-ready', () => {
    _log('[OK] Renderer DOM ready');
  });

  const rendererPath = path.join(__dirname, 'renderer', 'index.html');
  _log('[STARTUP] Loading renderer: ' + rendererPath);
  mainWindow.loadFile(rendererPath);

  // Minimize to tray instead of closing
  mainWindow.on('close', (event) => {
    if (tray && !app._quitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
    _log('[INFO] Main window closed');
  });

  _log('[STARTUP] BrowserWindow created');
}

// ── Tray / Menu Bar ───────────────────────────────────────────────────────────
// SAFE: tray failure must NOT prevent the window from opening.

function createTray() {
  try {
    // Load tray icon — use empty nativeImage if file missing (prevents crash)
    let trayIcon = nativeImage.createEmpty();
    try {
      const trayIconPath = path.join(__dirname, 'assets', 'tray-icon.png');
      if (fs.existsSync(trayIconPath)) {
        trayIcon = nativeImage.createFromPath(trayIconPath);
      } else {
        _log('[WARN] tray-icon.png not found — using empty icon');
      }
    } catch (iconErr) {
      _log('[WARN] Could not load tray icon: ' + iconErr.message);
    }

    trayIcon = trayIcon.resize({ width: 16, height: 16 });
    tray = new Tray(trayIcon);
    tray.setToolTip('Shadow Desktop Companion');
    _rebuildTrayMenu();

    tray.on('click', () => {
      if (mainWindow) {
        mainWindow.isVisible() ? mainWindow.focus() : mainWindow.show();
      }
    });

    _log('[OK] Tray created');
  } catch (e) {
    _log('[WARN] Tray creation failed (non-fatal): ' + e.message);
    tray = null;
    // Window continues to work without tray
  }
}

function _rebuildTrayMenu() {
  if (!tray) return;
  try {
    const pairingState = pairingMgr.getState();

    const menu = Menu.buildFromTemplate([
      {
        label:   'Open Shadow',
        click:   () => { if (mainWindow) mainWindow.show(); }
      },
      { type: 'separator' },
      {
        label:   pairingState.paired
          ? '● ' + (pairingState.computerName || 'This Computer') + ' — PAIRED'
          : '○ Not Paired',
        enabled: false,
      },
      { type: 'separator' },
      {
        label:   'Shadow Voice: ' + (voiceOn ? 'ON' : 'OFF'),
        type:    'checkbox',
        checked: voiceOn,
        click:   () => {
          voiceOn = !voiceOn;
          if (mainWindow) mainWindow.webContents.send('voice-state-change', voiceOn);
          _rebuildTrayMenu();
        },
      },
      {
        label:   'Remote Control: ' + (pairingState.paired ? 'ENABLED' : 'NOT PAIRED'),
        enabled: false,
      },
      { type: 'separator' },
      {
        label: 'Devices',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.webContents.send('navigate', 'devices');
          }
        },
      },
      {
        label: 'Settings',
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.webContents.send('navigate', 'settings');
          }
        },
      },
      { type: 'separator' },
      {
        label: 'Quit Shadow',
        click: () => {
          app._quitting = true;
          app.quit();
        },
      },
    ]);

    tray.setContextMenu(menu);
  } catch (e) {
    _log('[WARN] _rebuildTrayMenu failed: ' + e.message);
  }
}

// ── Agent startup ─────────────────────────────────────────────────────────────
// SAFE: agent failure must NOT prevent window from opening.

async function _startAgent() {
  if (!SRDesktopAgent) {
    _log('[WARN] Desktop agent not loaded — skipping agent start');
    agentRunning = false;
    return { started: false, reason: 'AGENT_NOT_LOADED' };
  }

  const creds = pairingMgr.getPairingCredentials();
  if (!creds.agentId || !creds.pairingToken || !creds.relayUrl) {
    agentRunning = false;
    _log('[INFO] Desktop agent not started: NOT_PAIRED');
    return { started: false, reason: 'NOT_PAIRED' };
  }

  // Inject user-managed approved apps/urls into the existing agent
  try {
    const approvedApps = approvedReg.buildAgentApprovedApps();
    const approvedUrls = approvedReg.buildAgentApprovedUrls();

    // Register extended platform actions
    platformAdpt.EXTENDED_ACTIONS.forEach((action) => {
      SRDesktopAgent.registerHandler(action, function (params, cb) {
        platformAdpt.execute(action, params, cb);
      });
    });
  } catch (e) {
    _log('[WARN] Agent action registration failed (non-fatal): ' + e.message);
  }

  try {
    SRDesktopAgent.start({
      agentId:      creds.agentId,
      pairingToken: creds.pairingToken,
      relayUrl:     creds.relayUrl,
    });
    agentRunning = true;
    _log('[OK] Desktop agent started');
    return { started: true };
  } catch (e) {
    agentRunning = false;
    _log('[WARN] Desktop agent failed to start (non-fatal): ' + e.message);
    return { started: false, reason: e.message };
  }
}

// ── IPC handlers — called from renderer via contextBridge ────────────────────

function _registerIPC() {

  // ── Status ────────────────────────────────────────────────────────────────

  ipcMain.handle('get-status', async () => {
    try {
      const pairingState = pairingMgr.getState();
      const sysInfo      = platformAdpt.getSystemInfo();
      const startupOn    = await startupMgr.getStatus().catch(() => false);

      return {
        build:         BUILD_ID,
        version:       APP_VERSION,
        platform:      sysInfo.platform,
        hostname:      sysInfo.hostname,
        osType:        sysInfo.osType,
        osRelease:     sysInfo.osRelease,
        uptime:        sysInfo.uptime,
        agentRunning,
        voiceOn,
        startupOn,
        pairing:       pairingState,
      };
    } catch (e) {
      _log('[ERROR] get-status IPC failed: ' + e.message);
      return { build: BUILD_ID, version: APP_VERSION, error: e.message };
    }
  });

  // ── Pairing ────────────────────────────────────────────────────────────────

  ipcMain.handle('start-pairing', async (_, computerName) => {
    try { return pairingMgr.startPairing(computerName); }
    catch (e) { return { ok: false, error: e.message }; }
  });

  ipcMain.handle('complete-pairing', async (_, opts) => {
    try {
      const result = await pairingMgr.completePairing(opts);
      if (result.ok) {
        _startAgent();
        _rebuildTrayMenu();
      }
      return result;
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('revoke-pairing', async () => {
    try {
      await pairingMgr.revokePairing();
      agentRunning = false;
      _rebuildTrayMenu();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  ipcMain.handle('get-pairing-state', async () => {
    try { return pairingMgr.getState(); }
    catch (e) { return { paired: false, error: e.message }; }
  });

  // ── Approved apps/urls ────────────────────────────────────────────────────

  ipcMain.handle('get-approved-apps',   async ()        => approvedReg.getApps());
  ipcMain.handle('add-approved-app',    async (_, entry) => approvedReg.addApp(entry));
  ipcMain.handle('remove-approved-app', async (_, key)  => { approvedReg.removeApp(key); return { ok: true }; });

  ipcMain.handle('get-approved-urls',   async ()        => approvedReg.getUrls());
  ipcMain.handle('add-approved-url',    async (_, entry) => approvedReg.addUrl(entry));
  ipcMain.handle('remove-approved-url', async (_, url)  => { approvedReg.removeUrl(url); return { ok: true }; });

  // ── Startup ────────────────────────────────────────────────────────────────

  ipcMain.handle('get-startup-status', async () => startupMgr.getStatus().catch(() => false));

  ipcMain.handle('set-startup', async (_, enable) => {
    try {
      if (enable) {
        const exePath = process.execPath;
        await startupMgr.enable(exePath);
      } else {
        await startupMgr.disable();
      }
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── Voice toggle ──────────────────────────────────────────────────────────

  ipcMain.handle('set-voice', async (_, on) => {
    voiceOn = !!on;
    _rebuildTrayMenu();
    return { voiceOn };
  });

  ipcMain.handle('get-voice-state', async () => ({ voiceOn }));

  // ── Device action (via existing agent) ───────────────────────────────────

  ipcMain.handle('execute-action', async (_, { action, params }) => {
    return new Promise((resolve) => {
      try {
        // On Linux, upgrade lock_screen / lock to use xdg-screensaver
        if (platformAdpt.IS_LINUX && (action === 'lock_screen' || action === 'lock')) {
          platformAdpt._linuxLockScreen((result, message) => {
            resolve({ result, message, data: {} });
          });
          return;
        }

        // Try extended platform adapter first
        if (platformAdpt.handles(action)) {
          platformAdpt.execute(action, params || {}, (result, message, data) => {
            resolve({ result, message, data: data || {} });
          });
          return;
        }

        // Fall back to desktop agent handler
        if (!SRDesktopAgent) {
          resolve({ result: 'NOT_SUPPORTED', message: 'Desktop agent not available.' });
          return;
        }

        const handler = SRDesktopAgent._actionHandlers && SRDesktopAgent._actionHandlers[action];
        if (!handler) {
          resolve({ result: 'NOT_SUPPORTED', message: 'Action "' + action + '" is not supported.' });
          return;
        }

        handler(params || {}, (result, message, data) => {
          resolve({ result, message, data: data || {} });
        });
      } catch (e) {
        resolve({ result: 'FAILED', message: e.message });
      }
    });
  });

  // ── Battery / system info ─────────────────────────────────────────────────

  ipcMain.handle('get-battery', async () => {
    return new Promise((resolve) => {
      try {
        platformAdpt.execute('battery_status', {}, (result, message, data) => {
          resolve({ result, message, data: data || {} });
        });
      } catch (e) {
        resolve({ result: 'FAILED', message: e.message, data: {} });
      }
    });
  });

  ipcMain.handle('get-network', async () => {
    return new Promise((resolve) => {
      try {
        platformAdpt.execute('network_status', {}, (result, message, data) => {
          resolve({ result, message, data: data || {} });
        });
      } catch (e) {
        resolve({ result: 'FAILED', message: e.message, data: {} });
      }
    });
  });

  // ── QR Code generation ────────────────────────────────────────────────────

  ipcMain.handle('generate-qr', async (_, text) => {
    try {
      const qrcode = require('qrcode');
      const dataUrl = await qrcode.toDataURL(String(text), { width: 200, margin: 2 });
      return { ok: true, dataUrl };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });

  // ── Credential store status ───────────────────────────────────────────────

  ipcMain.handle('get-credential-store-status', async () => {
    try {
      const credStore = require('./src/sr-credential-store');
      return {
        available: credStore.isSecureStoreAvailable(),
        unavailableReason: credStore.getUnavailableReason(),
      };
    } catch (e) {
      return { available: false, unavailableReason: e.message };
    }
  });

  // ── Permissions ───────────────────────────────────────────────────────────

  ipcMain.handle('get-permissions', async () => {
    try { return pairingMgr.getState().permissions || {}; }
    catch (e) { return {}; }
  });

  ipcMain.handle('update-permissions', async (_, newPerms) => {
    try {
      pairingMgr.updatePermissions(newPerms);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  // Init log first (app.getPath now available)
  _initLog();

  _log('═══════════════════════════════════════════');
  _log('Shadow Desktop Companion ' + APP_VERSION + ' (Build: ' + BUILD_ID + ')');
  _log('Electron:   ' + process.versions.electron);
  _log('Node:       ' + process.versions.node);
  _log('Platform:   ' + process.platform + ' ' + process.arch);
  _log('Started:    ' + new Date().toISOString());
  _log('userData:   ' + app.getPath('userData'));
  _log('appPath:    ' + app.getAppPath());
  _log('execPath:   ' + process.execPath);
  _log('═══════════════════════════════════════════');

  // Initialize pairing state (loads from OS credential store)
  // SAFE: failure here must not prevent window from opening
  try {
    await pairingMgr.init();
    _log('[OK] Pairing manager initialized');
  } catch (e) {
    _log('[WARN] Pairing manager init failed (non-fatal): ' + e.message);
  }

  // Register all IPC handlers
  _registerIPC();
  _log('[OK] IPC handlers registered');

  // Create the main window — this MUST succeed
  createWindow();

  // Create system tray / menu bar (non-fatal if tray fails)
  createTray();

  // Auto-start agent if already paired (non-fatal)
  try {
    if (pairingMgr.isPaired()) {
      const agentResult = await _startAgent();
      _log('[INFO] Agent auto-start: ' + JSON.stringify(agentResult));
    } else {
      _log('[INFO] Not paired — agent not started');
    }
  } catch (e) {
    _log('[WARN] Agent auto-start failed (non-fatal): ' + e.message);
  }

  // macOS: re-create window when dock icon is clicked
  app.on('activate', () => {
    if (!mainWindow) createWindow();
    else mainWindow.show();
  });

  _rebuildTrayMenu();
  _log('[STARTUP] Ready');

}).catch((err) => {
  // Catch any synchronous error in the whenReady chain
  const msg = '[FATAL] app.whenReady rejected: ' + (err && err.stack ? err.stack : String(err));
  process.stderr.write(msg + '\n');
  if (_logPath) { try { fs.appendFileSync(_logPath, msg + '\n'); } catch (_) {} }
});

// Intercept window-all-closed — don't quit when last window closes (stays in tray)
app.on('window-all-closed', () => {
  // On Windows/Linux, keep running in tray
  // (Quit Shadow menu item sets app._quitting = true)
  if (process.platform === 'darwin') {
    // macOS: handled by 'activate' event above
  }
});

app.on('before-quit', () => {
  app._quitting = true;
  _log('[INFO] Application quitting');
});
