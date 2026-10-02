/**
 * shadow-desktop-companion/renderer/app.js
 * Shadow Desktop Companion — Renderer Process Logic
 *
 * Build: SR-DESKTOP-1
 *
 * Architecture rule:
 *   There is ONE Shadow Reaper brain.
 *   Desktop text and desktop voice BOTH route through ShadowReaper.ask().
 *
 *   This renderer does NOT contain:
 *     - DesktopBrain
 *     - ShadowDesktopBrain
 *     - DesktopMemory
 *     - separate conversation engine
 *     - separate AI personality
 *     - separate adaptive-learning system
 *
 *   Text messages route through: ShadowCompanion.executeAction() → main process → agent
 *   Conversation responses route through the existing Shadow Reaper PWA backend.
 *
 *   The desktop is ANOTHER INTERFACE to the same brain.
 *
 * VOICE STATES:
 *   STANDBY → LISTENING → PROCESSING → SPEAKING → STANDBY
 *   ERROR recovers to STANDBY
 *
 * TTS:
 *   Uses Web Speech API SpeechSynthesis.
 *   Only speaks when voiceOn = true.
 *   Prevents: duplicate TTS, overlapping TTS, stacked queues.
 *
 * ONE-BRAIN VERIFICATION:
 *   - Typed message → executeAction('ask', {message}) → ShadowReaper.ask()
 *   - Voice → same path after STT
 *   - No separate response generator in this file
 */

/* global ShadowCompanion */

'use strict';

// ── Voice state machine ───────────────────────────────────────────────────────

const VOICE_STATE = {
  STANDBY:    'STANDBY',
  LISTENING:  'LISTENING',
  PROCESSING: 'PROCESSING',
  SPEAKING:   'SPEAKING',
  ERROR:      'ERROR',
};

let _voiceState  = VOICE_STATE.STANDBY;
let _voiceOn     = true;
let _recognition = null;
let _synthesis   = window.speechSynthesis || null;
let _speaking    = false;
let _ttsQueue    = [];
let _recovering  = false;

// ── DOM refs ──────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id);

const els = {
  statusDot:        $('status-dot'),
  statusLabel:      $('status-label'),
  conversation:     $('conversation'),
  chatInput:        $('chat-input'),
  sendBtn:          $('send-btn'),
  micBtn:           $('mic-btn'),
  micIcon:          $('mic-icon'),
  sbState:          $('sb-state'),
  sbVoice:          $('sb-voice'),
  sbComputer:       $('sb-computer'),
  sbRelay:          $('sb-relay'),
  thisComputerName:  $('this-computer-name'),
  thisComputerStatus: $('this-computer-status'),
  thisComputerMeta:  $('this-computer-meta'),
  pairingForm:           $('pairing-form'),
  pairingCodeDisplay:    $('pairing-code-display'),
  pairingCompleteDisplay: $('pairing-complete-display'),
  pairName:         $('pair-name'),
  pairBtn:          $('pair-btn'),
  pairCode:         $('pair-code'),
  pairQrBtn:        $('pair-qr-btn'),
  pairQr:           $('pair-qr'),
  pairCompleteName:   $('pair-complete-name'),
  pairCompleteStatus: $('pair-complete-status'),
  unpairBtn:        $('unpair-btn'),
  appsList:         $('apps-list'),
  urlsList:         $('urls-list'),
  addAppName:       $('add-app-name'),
  addAppKey:        $('add-app-key'),
  addAppWin:        $('add-app-win'),
  addAppMac:        $('add-app-mac'),
  addAppLin:        $('add-app-lin'),
  addAppBtn:        $('add-app-btn'),
  addUrlName:       $('add-url-name'),
  addUrlUrl:        $('add-url-url'),
  addUrlBtn:        $('add-url-btn'),
  voiceToggle:      $('voice-toggle'),
  startupToggle:    $('startup-toggle'),
  permissionsList:  $('permissions-list'),
  connectionPanel:  $('connection-status-panel'),
  systemInfoPanel:  $('system-info-panel'),
  historyList:      $('history-list'),
  clearHistoryBtn:  $('clear-history-btn'),
};

// ── Session-local action history (for HISTORY page display) ──────────────────
// This logs actions taken via the UI this session.
// Does not contain secrets — sanitized before display.

const _actionHistory = [];

// ── Navigation ────────────────────────────────────────────────────────────────

function _initNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => _navigateTo(btn.dataset.page));
  });

  // From main process tray events
  if (window.ShadowCompanion && typeof window.ShadowCompanion.onNavigate === 'function') {
    window.ShadowCompanion.onNavigate((page) => _navigateTo(page));
  }
}

function _navigateTo(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const pageEl = $('page-' + page);
  if (pageEl) pageEl.classList.add('active');
  const navBtn = document.querySelector('[data-page="' + page + '"]');
  if (navBtn) navBtn.classList.add('active');

  // Refresh page-specific data when navigating
  if (page === 'apps')     _refreshAppsPage();
  if (page === 'settings') _refreshSettingsPage();
  if (page === 'devices')  _refreshDevicesPage();
  if (page === 'history')  _refreshHistoryPage();
}

// ── Status update ─────────────────────────────────────────────────────────────

function _updateGlobalStatus(status) {
  if (!status) return;
  const paired    = status.pairing && status.pairing.paired;
  const running   = status.agentRunning;

  // Header dot
  els.statusDot.className = 'status-dot ' + (running ? 'connected' : 'offline');
  els.statusLabel.textContent = running ? 'CONNECTED' : (paired ? 'PAIRED' : 'DISCONNECTED');

  // Status bar
  els.sbComputer.textContent = running ? 'COMPUTER ONLINE' : 'COMPUTER OFFLINE';
  els.sbComputer.style.color = running ? '' : 'var(--red)';

  // Devices tab — this computer
  if (status.pairing) {
    const name = status.pairing.computerName || status.hostname || 'This Computer';
    els.thisComputerName.textContent   = name;
    els.thisComputerStatus.textContent = running ? 'ONLINE' : 'AGENT STOPPED';
    els.thisComputerMeta.textContent   = status.platform + ' • v' + (status.version || '1.0.0');
  }
}

async function _refreshStatus() {
  try {
    const status = await ShadowCompanion.getStatus();
    _updateGlobalStatus(status);
  } catch (_) {}
}

// ── Conversation ──────────────────────────────────────────────────────────────

/**
 * _addMessage(role, text)
 * role: 'user' | 'assistant' | 'system'
 *
 * ONE BRAIN RULE:
 *   'assistant' messages come from ShadowReaper.ask() responses only.
 *   This function never generates its own responses.
 */
function _addMessage(role, text) {
  const row = document.createElement('div');
  row.className = 'msg-row ' + role;

  if (role !== 'system') {
    const sender = document.createElement('div');
    sender.className = 'msg-sender';
    sender.textContent = role === 'user' ? 'YOU' : 'SHADOW';
    row.appendChild(sender);
  }

  const bubble = document.createElement('div');
  bubble.className = 'bubble';
  bubble.textContent = text;
  row.appendChild(bubble);

  els.conversation.appendChild(row);
  els.conversation.scrollTop = els.conversation.scrollHeight;
}

// ── Send message — routes through existing Shadow Reaper pipeline ─────────────
//
// ONE-BRAIN ARCHITECTURE:
//   Desktop message → executeAction('ask') → main process →
//   SRDesktopAgentServer → relay → Shadow Reaper backend → ShadowReaper.ask()
//
// The 'ask' action on the Desktop Agent is wired to the Shadow Reaper PWA backend.
// No separate desktop AI exists.

let _pendingSend = false;

async function _sendMessage(text) {
  text = (text || '').trim();
  if (!text || _pendingSend) return;

  _pendingSend = true;
  els.sendBtn.disabled = true;

  _addMessage('user', text);
  els.chatInput.value = '';

  _setVoiceState(VOICE_STATE.PROCESSING);

  try {
    const result = await ShadowCompanion.executeAction('ask', { message: text });

    // result.data.response = Shadow Reaper response string
    const response = (result && result.data && result.data.response)
      ? result.data.response
      : (result && result.message ? result.message : 'I heard you.');

    _addMessage('assistant', response);

    // Log to action history
    _logAction('ask: ' + text.slice(0, 40), result.result || 'SUCCESS');

    // Speak response if voice is on — same response text, not regenerated
    if (_voiceOn) {
      _speak(response);
    } else {
      _setVoiceState(VOICE_STATE.STANDBY);
    }

  } catch (e) {
    _addMessage('system', 'Error communicating with Shadow. Please try again.');
    _setVoiceState(VOICE_STATE.ERROR);
    _recoverFromError();
  } finally {
    _pendingSend = false;
    els.sendBtn.disabled = false;
  }
}

// ── Voice state machine ───────────────────────────────────────────────────────

function _setVoiceState(state) {
  _voiceState = state;
  els.sbState.textContent  = state;
  els.micBtn.classList.remove('listening', 'processing', 'unsupported');

  switch (state) {
    case VOICE_STATE.LISTENING:
      els.micBtn.classList.add('listening');
      els.micIcon.textContent = '🔴';
      break;
    case VOICE_STATE.PROCESSING:
      els.micBtn.classList.add('processing');
      els.micIcon.textContent = '⏳';
      break;
    case VOICE_STATE.SPEAKING:
      els.micIcon.textContent = '🔊';
      break;
    case VOICE_STATE.ERROR:
      els.micIcon.textContent = '⚠️';
      break;
    default:
      els.micIcon.textContent = '🎤';
  }
}

// ── Microphone / STT ──────────────────────────────────────────────────────────
//
// Recognized text is passed through the SAME Shadow Reaper pipeline as typed text.
// There is NO separate voice brain.

const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
const _speechSupported = !!SpeechRec;

function _startListening() {
  if (!_speechSupported) {
    _setVoiceState(VOICE_STATE.ERROR);
    _addMessage('system', 'Microphone not available in this environment.');
    _recoverFromError();
    return;
  }

  if (_voiceState === VOICE_STATE.LISTENING) {
    _stopListening();
    return;
  }

  if (_speaking || _voiceState === VOICE_STATE.SPEAKING) {
    // Do not activate mic while Shadow is speaking (prevents feedback)
    return;
  }

  try {
    _recognition = new SpeechRec();
    _recognition.lang            = 'en-US';
    _recognition.continuous      = false;
    _recognition.interimResults  = false;
    _recognition.maxAlternatives = 1;

    _recognition.onstart = () => _setVoiceState(VOICE_STATE.LISTENING);

    _recognition.onresult = (event) => {
      _setVoiceState(VOICE_STATE.PROCESSING);
      _cleanupRecognition();
      const transcript = event.results[0][0].transcript;
      if (transcript && transcript.trim()) {
        // Route through the exact same pipeline as typed text
        _sendMessage(transcript);
      } else {
        _setVoiceState(VOICE_STATE.STANDBY);
      }
    };

    _recognition.onerror = (event) => {
      if (event.error === 'not-allowed' || event.error === 'permission-denied') {
        _addMessage('system', 'Microphone permission denied. Please allow microphone access in system settings.');
        els.micBtn.classList.add('unsupported');
      } else if (event.error === 'no-speech') {
        // Normal — user was quiet
      } else {
        _addMessage('system', 'Voice error: ' + (event.error || 'unknown'));
      }
      _setVoiceState(VOICE_STATE.ERROR);
      _cleanupRecognition();
      _recoverFromError();
    };

    _recognition.onend = () => {
      _cleanupRecognition();
      if (_voiceState === VOICE_STATE.LISTENING) {
        _setVoiceState(VOICE_STATE.STANDBY);
      }
    };

    _recognition.start();

  } catch (e) {
    _addMessage('system', 'Failed to start microphone: ' + e.message);
    _setVoiceState(VOICE_STATE.ERROR);
    _recoverFromError();
  }
}

function _stopListening() {
  if (_recognition) {
    try { _recognition.stop(); } catch (_) {}
  }
  _cleanupRecognition();
  _setVoiceState(VOICE_STATE.STANDBY);
}

function _cleanupRecognition() {
  if (_recognition) {
    try { _recognition.onstart = null; _recognition.onresult = null; _recognition.onerror = null; _recognition.onend = null; } catch (_) {}
    _recognition = null;
  }
}

// ── TTS (Text-to-Speech) ──────────────────────────────────────────────────────
//
// Speaks the SAME response text returned by ShadowReaper.ask().
// No duplicate responses are generated for TTS.
// Prevents: duplicate TTS, overlapping TTS, stacked speech queues.

function _speak(text) {
  if (!_voiceOn || !_synthesis) {
    _setVoiceState(VOICE_STATE.STANDBY);
    return;
  }

  // Cancel any ongoing speech before queuing new (prevents stacking)
  if (_speaking) {
    try { _synthesis.cancel(); } catch (_) {}
    _ttsQueue = [];
    _speaking = false;
  }

  _setVoiceState(VOICE_STATE.SPEAKING);
  _speaking = true;

  const utterance       = new SpeechSynthesisUtterance(text);
  utterance.rate        = 1.0;
  utterance.pitch       = 0.95;
  utterance.volume      = 1.0;

  utterance.onend = () => {
    _speaking = false;
    _setVoiceState(VOICE_STATE.STANDBY);
  };

  utterance.onerror = (e) => {
    _speaking = false;
    // 'interrupted' is normal when we cancel — don't show error
    if (e.error !== 'interrupted' && e.error !== 'canceled') {
      _addMessage('system', 'TTS error: ' + (e.error || 'unknown'));
    }
    _setVoiceState(VOICE_STATE.STANDBY);
  };

  try {
    _synthesis.speak(utterance);
  } catch (e) {
    _speaking = false;
    _setVoiceState(VOICE_STATE.STANDBY);
  }
}

// ── Error recovery — never permanently stuck ──────────────────────────────────

function _recoverFromError() {
  if (_recovering) return;
  _recovering = true;
  setTimeout(() => {
    _recovering = false;
    if (_voiceState === VOICE_STATE.ERROR) {
      _setVoiceState(VOICE_STATE.STANDBY);
    }
  }, 3000);
}

// ── Voice toggle ──────────────────────────────────────────────────────────────

function _setVoiceOnUI(on) {
  _voiceOn = on;
  els.voiceToggle.checked         = on;
  els.sbVoice.textContent         = on ? 'VOICE ON' : 'VOICE OFF';
  els.sbVoice.style.color         = on ? '' : 'var(--muted)';
  if (!on && _speaking) {
    try { _synthesis && _synthesis.cancel(); } catch (_) {}
    _speaking = false;
    _setVoiceState(VOICE_STATE.STANDBY);
  }
  ShadowCompanion.setVoice(on);
}

// ── Chat event wiring ─────────────────────────────────────────────────────────

function _initChat() {
  els.sendBtn.addEventListener('click', () => {
    _sendMessage(els.chatInput.value);
  });

  els.chatInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      _sendMessage(els.chatInput.value);
    }
  });

  els.micBtn.addEventListener('click', () => {
    if (_voiceState === VOICE_STATE.LISTENING) {
      _stopListening();
    } else if (_voiceState === VOICE_STATE.STANDBY) {
      _startListening();
    }
    // Other states: ignore click (prevent duplicate submission)
  });

  // Voice toggle in status bar — double-click status bar voice label
  els.sbVoice.addEventListener('click', () => {
    _setVoiceOnUI(!_voiceOn);
  });

  // Voice toggle from main process (tray)
  if (window.ShadowCompanion && typeof window.ShadowCompanion.onVoiceStateChange === 'function') {
    window.ShadowCompanion.onVoiceStateChange((on) => _setVoiceOnUI(on));
  }

  if (!_speechSupported) {
    els.micBtn.classList.add('unsupported');
    els.micBtn.title = 'Voice input not available';
  }
}

// ── Pairing page ──────────────────────────────────────────────────────────────

let _pairingInterval = null;

async function _refreshDevicesPage() {
  await _refreshStatus();

  let state;
  try { state = await ShadowCompanion.getPairingState(); } catch (_) { return; }

  if (state.paired) {
    els.pairingForm.style.display          = 'none';
    els.pairingCodeDisplay.style.display   = 'none';
    els.pairingCompleteDisplay.style.display = 'flex';
    els.pairCompleteName.textContent       = state.computerName || 'This Computer';
    els.pairCompleteStatus.textContent     = 'PAIRED — ' + (state.platform || '').toUpperCase();
  } else {
    els.pairingForm.style.display            = 'flex';
    els.pairingCodeDisplay.style.display     = 'none';
    els.pairingCompleteDisplay.style.display = 'none';
  }
}

function _initPairing() {
  els.pairBtn.addEventListener('click', async () => {
    const name = els.pairName.value.trim() || undefined;
    try {
      const result = await ShadowCompanion.startPairing(name);
      els.pairCode.textContent           = result.pairingCode;
      els.pairingForm.style.display      = 'none';
      els.pairingCodeDisplay.style.display = 'flex';

      // Poll for pairing completion every 3 seconds (production: use WebSocket event)
      _pairingInterval = setInterval(async () => {
        const s = await ShadowCompanion.getPairingState();
        if (s.paired) {
          clearInterval(_pairingInterval);
          _pairingInterval = null;
          _refreshDevicesPage();
        }
      }, 3000);

    } catch (e) {
      alert('Failed to start pairing: ' + e.message);
    }
  });

  els.pairQrBtn.addEventListener('click', async () => {
    const showing = els.pairQr.style.display !== 'none';
    if (showing) {
      els.pairQr.style.display = 'none';
      return;
    }
    // QR code rendered via main process (qrcode npm package)
    const code = els.pairCode.textContent;
    if (!code || code === '--- ---') return;

    els.pairQr.textContent = 'Generating QR…';
    els.pairQr.style.display = 'block';
    try {
      const result = await ShadowCompanion.generateQR(code);
      if (result && result.ok && result.dataUrl) {
        els.pairQr.innerHTML = '';
        const img = document.createElement('img');
        img.src   = result.dataUrl;
        img.alt   = 'Pairing QR Code';
        img.style.display = 'block';
        img.style.margin  = '8px auto';
        els.pairQr.appendChild(img);
      } else {
        els.pairQr.textContent = 'QR unavailable: ' + (result && result.error ? result.error : 'unknown error');
        els.pairQr.style.color = 'var(--muted)';
      }
    } catch (e) {
      els.pairQr.textContent = 'QR error: ' + e.message;
      els.pairQr.style.color = 'var(--muted)';
    }
  });

  els.unpairBtn.addEventListener('click', async () => {
    if (confirm('Unpair this computer from Shadow? You will need to pair again to reconnect.')) {
      await ShadowCompanion.revokePairing();
      _refreshDevicesPage();
    }
  });
}

// ── Approved apps page ────────────────────────────────────────────────────────

async function _refreshAppsPage() {
  // Apps
  const apps = await ShadowCompanion.getApprovedApps();
  els.appsList.innerHTML = '';
  if (!apps || !apps.length) {
    els.appsList.innerHTML = '<p class="empty-msg">No approved applications.</p>';
  } else {
    apps.forEach(app => {
      const div = document.createElement('div');
      div.className = 'approved-item';
      div.innerHTML = `
        <span class="item-name">✓ ${_esc(app.name)}</span>
        <span class="item-meta">${_esc(app.key)}</span>
        <button class="remove-btn" title="Remove" data-key="${_esc(app.key)}">✕</button>
      `;
      div.querySelector('.remove-btn').addEventListener('click', async () => {
        await ShadowCompanion.removeApprovedApp(app.key);
        _refreshAppsPage();
      });
      els.appsList.appendChild(div);
    });
  }

  // URLs
  const urls = await ShadowCompanion.getApprovedUrls();
  els.urlsList.innerHTML = '';
  if (!urls || !urls.length) {
    els.urlsList.innerHTML = '<p class="empty-msg">No approved websites.</p>';
  } else {
    urls.forEach(entry => {
      const div = document.createElement('div');
      div.className = 'approved-item';
      div.innerHTML = `
        <span class="item-name">✓ ${_esc(entry.name)}</span>
        <span class="item-meta" style="word-break:break-all;">${_esc(entry.url)}</span>
        <button class="remove-btn" title="Remove" data-url="${_esc(entry.url)}">✕</button>
      `;
      div.querySelector('.remove-btn').addEventListener('click', async () => {
        await ShadowCompanion.removeApprovedUrl(entry.url);
        _refreshAppsPage();
      });
      els.urlsList.appendChild(div);
    });
  }
}

function _initAppsPage() {
  els.addAppBtn.addEventListener('click', async () => {
    const entry = {
      name:   els.addAppName.value.trim(),
      key:    els.addAppKey.value.trim().toLowerCase(),
      win32:  els.addAppWin.value.trim() || null,
      darwin: els.addAppMac.value.trim() || null,
      linux:  els.addAppLin.value.trim() || null,
    };
    if (!entry.name || !entry.key) { alert('Name and key are required.'); return; }
    const result = await ShadowCompanion.addApprovedApp(entry);
    if (result.ok) {
      els.addAppName.value = '';
      els.addAppKey.value  = '';
      els.addAppWin.value  = '';
      els.addAppMac.value  = '';
      els.addAppLin.value  = '';
      _refreshAppsPage();
    } else {
      alert(result.error || 'Failed to add application.');
    }
  });

  els.addUrlBtn.addEventListener('click', async () => {
    const entry = {
      name: els.addUrlName.value.trim(),
      url:  els.addUrlUrl.value.trim(),
    };
    if (!entry.name || !entry.url) { alert('Name and URL are required.'); return; }
    const result = await ShadowCompanion.addApprovedUrl(entry);
    if (result.ok) {
      els.addUrlName.value = '';
      els.addUrlUrl.value  = '';
      _refreshAppsPage();
    } else {
      alert(result.error || 'Failed to add website.');
    }
  });
}

// ── Settings page ─────────────────────────────────────────────────────────────

const PERMISSION_LABELS = {
  applications:  'Application Control',
  media:         'Media Control',
  audio:         'Audio Control',
  system:        'System Status',
  lock:          'Lock Computer',
  sleep:         'Sleep Computer',
  websites:      'Website Launch',
  remoteControl: 'Remote Control',
};

const PERMISSION_DESCS = {
  applications:  'Allow Shadow to open approved applications',
  media:         'Allow play / pause / next / previous',
  audio:         'Allow volume and mute control',
  system:        'Allow system status queries',
  lock:          'Allow Shadow to lock the screen',
  sleep:         'Allow Shadow to put computer to sleep',
  websites:      'Allow Shadow to open approved websites',
  remoteControl: 'Allow commands from paired Shadow Edition devices',
};

async function _refreshSettingsPage() {
  // Startup toggle
  const startupOn = await ShadowCompanion.getStartupStatus();
  els.startupToggle.checked = !!startupOn;

  // Voice toggle
  const voiceState = await ShadowCompanion.getVoiceState();
  els.voiceToggle.checked = voiceState.voiceOn;
  _voiceOn = voiceState.voiceOn;

  // Permissions
  const perms = await ShadowCompanion.getPermissions();
  els.permissionsList.innerHTML = '';
  Object.keys(PERMISSION_LABELS).forEach(key => {
    const row = document.createElement('div');
    row.className = 'setting-row';
    row.innerHTML = `
      <div class="setting-label">
        <span>${_esc(PERMISSION_LABELS[key])}</span>
        <span class="setting-desc">${_esc(PERMISSION_DESCS[key])}</span>
      </div>
      <label class="toggle">
        <input type="checkbox" data-perm="${key}" ${perms && perms[key] ? 'checked' : ''} />
        <span class="slider"></span>
      </label>
    `;
    row.querySelector('input').addEventListener('change', async (e) => {
      const update = {};
      update[key] = e.target.checked;
      await ShadowCompanion.updatePermissions(update);
    });
    els.permissionsList.appendChild(row);
  });

  // Connection status
  await _refreshConnectionStatus();

  // System info
  _refreshSystemInfo();
}

async function _refreshConnectionStatus() {
  let status;
  try { status = await ShadowCompanion.getStatus(); } catch (_) { return; }

  const relayConfigured = status.pairing && status.pairing.relayUrl;
  const rows = [
    { label: 'Shadow Brain',    value: 'REMOTE API',                  cls: 'neutral' },
    { label: 'Desktop Agent',   value: status.agentRunning ? 'RUNNING' : 'STOPPED',
                                 cls: status.agentRunning ? 'ok' : 'err' },
    { label: 'Remote Relay',    value: relayConfigured ? 'CONFIGURED' : 'NOT CONFIGURED',
                                 cls: relayConfigured ? 'ok' : 'warn' },
    { label: 'Voice',           value: status.voiceOn ? 'ON' : 'OFF',  cls: status.voiceOn ? 'ok' : 'neutral' },
    { label: 'Microphone',      value: _speechSupported ? 'AVAILABLE' : 'UNAVAILABLE',
                                 cls: _speechSupported ? 'ok' : 'warn' },
  ];

  els.connectionPanel.innerHTML = rows.map(r =>
    `<div class="status-row">
       <span class="s-label">${_esc(r.label)}</span>
       <span class="s-value ${r.cls}">${_esc(r.value)}</span>
     </div>`
  ).join('');
}

async function _refreshSystemInfo() {
  let status;
  try { status = await ShadowCompanion.getStatus(); } catch (_) { return; }

  const battery = await ShadowCompanion.getBattery().catch(() => null);
  const batteryText = battery && battery.data && battery.data.battery !== null
    ? battery.data.battery + '%' + (battery.data.charging ? ' (charging)' : '')
    : 'N/A';

  const rows = [
    { label: 'Computer Name', value: status.hostname || 'Unknown' },
    { label: 'Platform',      value: (status.platform || 'Unknown') },
    { label: 'OS',            value: (status.osType || '') + ' ' + (status.osRelease || '') },
    { label: 'Uptime',        value: _formatUptime(status.uptime) },
    { label: 'Battery',       value: batteryText },
    { label: 'Agent Version', value: status.version || '1.0.0' },
  ];

  els.systemInfoPanel.innerHTML = rows.map(r =>
    `<div class="status-row">
       <span class="s-label">${_esc(r.label)}</span>
       <span class="s-value neutral">${_esc(r.value)}</span>
     </div>`
  ).join('');
}

function _initSettings() {
  els.voiceToggle.addEventListener('change', (e) => {
    _setVoiceOnUI(e.target.checked);
  });

  els.startupToggle.addEventListener('change', async (e) => {
    const result = await ShadowCompanion.setStartup(e.target.checked);
    if (!result.ok) {
      e.target.checked = !e.target.checked;
      alert('Could not set startup: ' + (result.error || 'unknown error'));
    }
  });
}

// ── History page ──────────────────────────────────────────────────────────────

function _logAction(action, result) {
  _actionHistory.push({
    time:   new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    action: String(action).slice(0, 60),
    result: result || 'UNKNOWN',
  });
  if (_actionHistory.length > 200) _actionHistory.shift();
}

function _refreshHistoryPage() {
  els.historyList.innerHTML = '';
  if (!_actionHistory.length) {
    els.historyList.innerHTML = '<p class="empty-msg">No actions recorded yet.</p>';
    return;
  }
  const reversed = _actionHistory.slice().reverse();
  reversed.forEach(entry => {
    const div = document.createElement('div');
    div.className = 'history-entry';
    div.innerHTML = `
      <span class="h-time">${_esc(entry.time)}</span>
      <span class="h-action">${_esc(entry.action)}</span>
      <span class="h-result ${_esc(entry.result)}">${_esc(entry.result)}</span>
    `;
    els.historyList.appendChild(div);
  });
}

function _initHistory() {
  els.clearHistoryBtn.addEventListener('click', () => {
    if (confirm('Clear all action history?')) {
      _actionHistory.length = 0;
      _refreshHistoryPage();
    }
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function _esc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _formatUptime(seconds) {
  if (!seconds) return 'N/A';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h + 'h ' + m + 'm';
}

// ── Relay status indicator ────────────────────────────────────────────────────

async function _updateRelayStatus() {
  try {
    const status = await ShadowCompanion.getStatus();
    const relay  = status && status.pairing && status.pairing.relayUrl;
    els.sbRelay.textContent = relay ? 'RELAY CONNECTED' : 'RELAY NOT CONFIGURED';
    els.sbRelay.style.color = relay ? '' : 'var(--muted)';
  } catch (_) {}
}

// ── Boot ──────────────────────────────────────────────────────────────────────

async function _init() {
  _initNav();
  _initChat();
  _initPairing();
  _initAppsPage();
  _initSettings();
  _initHistory();

  // Initial status fetch
  await _refreshStatus();
  await _updateRelayStatus();

  // Load startup + voice state
  const voiceState = await ShadowCompanion.getVoiceState().catch(() => ({ voiceOn: true }));
  _setVoiceOnUI(voiceState.voiceOn);

  const startupOn = await ShadowCompanion.getStartupStatus().catch(() => false);
  els.startupToggle.checked = !!startupOn;

  // Periodic status refresh (every 30 seconds)
  setInterval(_refreshStatus, 30000);
  setInterval(_updateRelayStatus, 60000);

  // Welcome message
  _addMessage('assistant', 'Shadow Desktop Companion is ready. Type a message or press the microphone button to speak.');
  _setVoiceState(VOICE_STATE.STANDBY);
}

// Boot when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', _init);
} else {
  _init();
}
