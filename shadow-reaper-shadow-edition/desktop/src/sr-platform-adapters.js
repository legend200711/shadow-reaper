/**
 * shadow-desktop-companion/src/sr-platform-adapters.js
 * Shadow Desktop Companion — Cross-Platform Action Adapters
 *
 * Build: SR-DESKTOP-1  (Linux Mint deployment pass)
 *
 * Architecture:
 *   DesktopCompanion
 *       │
 *       ├── WindowsAdapter
 *       ├── MacOSAdapter
 *       └── LinuxAdapter
 *
 * The AI issues the same structured command regardless of OS.
 * Platform-specific logic lives entirely in these adapters.
 *
 * All adapters implement:
 *   execute(action, params, callback(result, message, data))
 *
 * Where result is one of:
 *   SUCCESS | FAILED | NOT_SUPPORTED | PENDING
 *
 * LINUX MINT PHYSICAL VALIDATION STATUS:
 *   Architecture and mocks: IMPLEMENTED
 *   Linux (pactl/xdg-screensaver): RUNTIME-CHECKED
 *   Windows physical test:   PENDING
 *   macOS physical test:     PENDING
 *   Linux physical test:     LINUX MINT BUILD READY — USER PHYSICAL INSTALLATION REQUIRED
 *
 * LINUX AUDIO STACK (runtime detection):
 *   pactl (PulseAudio / PipeWire-pulse): checked at call time via which(1)
 *   playerctl (MPRIS media control):     checked at call time via which(1)
 *   If absent: returns NOT_SUPPORTED with clear dependency message.
 *   Never crashes if the tool is missing.
 *
 * LINUX SCREEN LOCK (runtime detection):
 *   xdg-screensaver lock   — preferred (XDG, works on GNOME/Cinnamon/XFCE/KDE)
 *   loginctl lock-session  — fallback (systemd-logind)
 */

'use strict';

const { spawn, exec }  = require('child_process');
const os               = require('os');

// ── Platform detection ────────────────────────────────────────────────────────

const PLATFORM = process.platform;   // 'win32' | 'darwin' | 'linux'
const IS_WIN   = PLATFORM === 'win32';
const IS_MAC   = PLATFORM === 'darwin';
const IS_LINUX = PLATFORM === 'linux';

// ── Result constants ──────────────────────────────────────────────────────────

const RESULT = {
  SUCCESS:       'SUCCESS',
  FAILED:        'FAILED',
  NOT_SUPPORTED: 'NOT_SUPPORTED',
  PENDING:       'PENDING',
};

// ── Media control implementations ─────────────────────────────────────────────
// These use platform-native mechanisms, not an external process to kill.

// ── Linux audio: check for pactl (PulseAudio / PipeWire-pulse compat) ─────────
// Checked at call time — not assumed present.
// On Linux Mint: pactl is provided by pulseaudio-utils (usually installed by default).
// PipeWire ships a pactl-compatible layer via pipewire-pulse.

function _linuxCheckPactl(cb) {
  exec('which pactl', function (err) {
    if (err) {
      cb(null, false);
    } else {
      cb(null, true);
    }
  });
}

// ── Linux media: check for playerctl (MPRIS D-Bus media control) ──────────────
// playerctl is NOT installed by default on Linux Mint.
// Install: sudo apt install playerctl
// Returns NOT_SUPPORTED with clear message if missing.

function _linuxCheckPlayerctl(cb) {
  exec('which playerctl', function (err) {
    cb(null, !err);
  });
}

// ── Linux lock screen: prefer xdg-screensaver, fall back to loginctl ──────────

function _linuxLockScreen(cb) {
  exec('which xdg-screensaver', function (err) {
    const cmd = err
      ? 'loginctl lock-session'          // fallback: systemd-logind
      : 'xdg-screensaver lock';          // XDG standard (GNOME/Cinnamon/XFCE/KDE)
    exec(cmd, function (lockErr) {
      if (lockErr) {
        // Try the other one if first failed
        const fallback = err ? 'xdg-screensaver lock' : 'loginctl lock-session';
        exec(fallback, function (e2) {
          if (e2) cb(RESULT.FAILED, 'Screen lock failed: ' + (lockErr.message || lockErr));
          else    cb(RESULT.SUCCESS, 'Screen locked.');
        });
      } else {
        cb(RESULT.SUCCESS, 'Screen locked.');
      }
    });
  });
}

// ── Media control ─────────────────────────────────────────────────────────────

function _mediaPlay(cb) {
  if (IS_WIN) {
    exec('nircmd mediaplay', function (err) {
      if (err) cb(RESULT.NOT_SUPPORTED, 'Volume control requires nircmd. Install from https://www.nirsoft.net/utils/nircmd.html');
      else cb(RESULT.SUCCESS, 'Media play/pause toggled.');
    });
  } else if (IS_MAC) {
    exec("osascript -e 'tell application \"Music\" to play'", function (err) {
      if (err) cb(RESULT.FAILED, 'Media play failed: ' + err.message);
      else cb(RESULT.SUCCESS, 'Media play.');
    });
  } else {
    _linuxCheckPlayerctl(function (_, has) {
      if (!has) return cb(RESULT.NOT_SUPPORTED, 'Media control requires playerctl on Linux. Install: sudo apt install playerctl');
      exec('playerctl play', function (err) {
        if (err) cb(RESULT.FAILED, 'Media play failed: ' + err.message);
        else cb(RESULT.SUCCESS, 'Media play.');
      });
    });
  }
}

function _mediaPause(cb) {
  if (IS_WIN) {
    exec('nircmd mediapause', function (err) {
      if (err) cb(RESULT.NOT_SUPPORTED, 'Requires nircmd on Windows.');
      else cb(RESULT.SUCCESS, 'Media paused.');
    });
  } else if (IS_MAC) {
    exec("osascript -e 'tell application \"Music\" to pause'", function (err) {
      if (err) cb(RESULT.FAILED, 'Media pause failed: ' + err.message);
      else cb(RESULT.SUCCESS, 'Media paused.');
    });
  } else {
    _linuxCheckPlayerctl(function (_, has) {
      if (!has) return cb(RESULT.NOT_SUPPORTED, 'Media control requires playerctl on Linux. Install: sudo apt install playerctl');
      exec('playerctl pause', function (err) {
        if (err) cb(RESULT.FAILED, 'Media pause failed: ' + err.message);
        else cb(RESULT.SUCCESS, 'Media paused.');
      });
    });
  }
}

function _mediaNext(cb) {
  if (IS_WIN) {
    exec('nircmd medianext', function (err) {
      if (err) cb(RESULT.NOT_SUPPORTED, 'Requires nircmd on Windows.');
      else cb(RESULT.SUCCESS, 'Next track.');
    });
  } else if (IS_MAC) {
    exec("osascript -e 'tell application \"Music\" to next track'", function (err) {
      if (err) cb(RESULT.FAILED, 'Next track failed: ' + err.message);
      else cb(RESULT.SUCCESS, 'Next track.');
    });
  } else {
    _linuxCheckPlayerctl(function (_, has) {
      if (!has) return cb(RESULT.NOT_SUPPORTED, 'Media control requires playerctl on Linux. Install: sudo apt install playerctl');
      exec('playerctl next', function (err) {
        if (err) cb(RESULT.FAILED, 'Next track failed: ' + err.message);
        else cb(RESULT.SUCCESS, 'Next track.');
      });
    });
  }
}

function _mediaPrevious(cb) {
  if (IS_WIN) {
    exec('nircmd mediaprev', function (err) {
      if (err) cb(RESULT.NOT_SUPPORTED, 'Requires nircmd on Windows.');
      else cb(RESULT.SUCCESS, 'Previous track.');
    });
  } else if (IS_MAC) {
    exec("osascript -e 'tell application \"Music\" to previous track'", function (err) {
      if (err) cb(RESULT.FAILED, 'Previous track failed: ' + err.message);
      else cb(RESULT.SUCCESS, 'Previous track.');
    });
  } else {
    _linuxCheckPlayerctl(function (_, has) {
      if (!has) return cb(RESULT.NOT_SUPPORTED, 'Media control requires playerctl on Linux. Install: sudo apt install playerctl');
      exec('playerctl previous', function (err) {
        if (err) cb(RESULT.FAILED, 'Previous track failed: ' + err.message);
        else cb(RESULT.SUCCESS, 'Previous track.');
      });
    });
  }
}

// ── Volume control ────────────────────────────────────────────────────────────
// Linux: uses pactl (PulseAudio utils / PipeWire-pulse compat layer).
// Checked at runtime — never assumed present.

function _volumeUp(cb) {
  if (IS_WIN) {
    exec('nircmd changesysvolume 3277', function (err) {
      if (err) cb(RESULT.NOT_SUPPORTED, 'Volume control requires nircmd on Windows.');
      else cb(RESULT.SUCCESS, 'Volume up.');
    });
  } else if (IS_MAC) {
    exec("osascript -e 'set volume output volume (output volume of (get volume settings) + 10)'", function (err) {
      if (err) cb(RESULT.FAILED, 'Volume up failed: ' + err.message);
      else cb(RESULT.SUCCESS, 'Volume up.');
    });
  } else {
    _linuxCheckPactl(function (_, has) {
      if (!has) return cb(RESULT.NOT_SUPPORTED, 'Volume control requires pactl on Linux. Install: sudo apt install pulseaudio-utils');
      exec('pactl set-sink-volume @DEFAULT_SINK@ +10%', function (err) {
        if (err) cb(RESULT.FAILED, 'Volume up failed: ' + err.message);
        else cb(RESULT.SUCCESS, 'Volume up.');
      });
    });
  }
}

function _volumeDown(cb) {
  if (IS_WIN) {
    exec('nircmd changesysvolume -3277', function (err) {
      if (err) cb(RESULT.NOT_SUPPORTED, 'Volume control requires nircmd on Windows.');
      else cb(RESULT.SUCCESS, 'Volume down.');
    });
  } else if (IS_MAC) {
    exec("osascript -e 'set volume output volume (output volume of (get volume settings) - 10)'", function (err) {
      if (err) cb(RESULT.FAILED, 'Volume down failed: ' + err.message);
      else cb(RESULT.SUCCESS, 'Volume down.');
    });
  } else {
    _linuxCheckPactl(function (_, has) {
      if (!has) return cb(RESULT.NOT_SUPPORTED, 'Volume control requires pactl on Linux. Install: sudo apt install pulseaudio-utils');
      exec('pactl set-sink-volume @DEFAULT_SINK@ -10%', function (err) {
        if (err) cb(RESULT.FAILED, 'Volume down failed: ' + err.message);
        else cb(RESULT.SUCCESS, 'Volume down.');
      });
    });
  }
}

function _mute(cb) {
  if (IS_WIN) {
    exec('nircmd mutesysvolume 1', function (err) {
      if (err) cb(RESULT.NOT_SUPPORTED, 'Mute requires nircmd on Windows.');
      else cb(RESULT.SUCCESS, 'Muted.');
    });
  } else if (IS_MAC) {
    exec("osascript -e 'set volume with output muted'", function (err) {
      if (err) cb(RESULT.FAILED, 'Mute failed: ' + err.message);
      else cb(RESULT.SUCCESS, 'Muted.');
    });
  } else {
    _linuxCheckPactl(function (_, has) {
      if (!has) return cb(RESULT.NOT_SUPPORTED, 'Mute requires pactl on Linux. Install: sudo apt install pulseaudio-utils');
      exec('pactl set-sink-mute @DEFAULT_SINK@ 1', function (err) {
        if (err) cb(RESULT.FAILED, 'Mute failed: ' + err.message);
        else cb(RESULT.SUCCESS, 'Muted.');
      });
    });
  }
}

function _unmute(cb) {
  if (IS_WIN) {
    exec('nircmd mutesysvolume 0', function (err) {
      if (err) cb(RESULT.NOT_SUPPORTED, 'Unmute requires nircmd on Windows.');
      else cb(RESULT.SUCCESS, 'Unmuted.');
    });
  } else if (IS_MAC) {
    exec("osascript -e 'set volume without output muted'", function (err) {
      if (err) cb(RESULT.FAILED, 'Unmute failed: ' + err.message);
      else cb(RESULT.SUCCESS, 'Unmuted.');
    });
  } else {
    _linuxCheckPactl(function (_, has) {
      if (!has) return cb(RESULT.NOT_SUPPORTED, 'Unmute requires pactl on Linux. Install: sudo apt install pulseaudio-utils');
      exec('pactl set-sink-mute @DEFAULT_SINK@ 0', function (err) {
        if (err) cb(RESULT.FAILED, 'Unmute failed: ' + err.message);
        else cb(RESULT.SUCCESS, 'Unmuted.');
      });
    });
  }
}

// ── Battery status ────────────────────────────────────────────────────────────

function _getBatteryStatus(cb) {
  if (IS_WIN) {
    exec('WMIC PATH Win32_Battery Get EstimatedChargeRemaining,BatteryStatus /format:list', function (err, stdout) {
      if (err) { cb(RESULT.FAILED, 'Battery query failed.', {}); return; }
      const chargeMatch = stdout.match(/EstimatedChargeRemaining=(\d+)/);
      const statusMatch = stdout.match(/BatteryStatus=(\d+)/);
      const battery = chargeMatch ? parseInt(chargeMatch[1], 10) : null;
      const charging = statusMatch ? (parseInt(statusMatch[1], 10) === 2) : null;
      cb(RESULT.SUCCESS, 'Battery status retrieved.', { battery, charging });
    });
  } else if (IS_MAC) {
    exec("pmset -g batt", function (err, stdout) {
      if (err) { cb(RESULT.FAILED, 'Battery query failed.', {}); return; }
      const pctMatch = stdout.match(/(\d+)%/);
      const charging = /charging/.test(stdout);
      const battery = pctMatch ? parseInt(pctMatch[1], 10) : null;
      cb(RESULT.SUCCESS, 'Battery status retrieved.', { battery, charging });
    });
  } else {
    exec("cat /sys/class/power_supply/BAT0/capacity 2>/dev/null || cat /sys/class/power_supply/BAT1/capacity 2>/dev/null", function (err, stdout) {
      if (err || !stdout.trim()) { cb(RESULT.NOT_SUPPORTED, 'Battery info unavailable on this Linux system.', {}); return; }
      const battery = parseInt(stdout.trim(), 10);
      exec("cat /sys/class/power_supply/BAT0/status 2>/dev/null || cat /sys/class/power_supply/BAT1/status 2>/dev/null", function (err2, statusOut) {
        const charging = (statusOut || '').toLowerCase().includes('charging');
        cb(RESULT.SUCCESS, 'Battery status retrieved.', { battery, charging });
      });
    });
  }
}

// ── Network status ────────────────────────────────────────────────────────────

function _getNetworkStatus(cb) {
  const nets = os.networkInterfaces();
  const connected = Object.values(nets).some(ifaces =>
    (ifaces || []).some(iface => !iface.internal && iface.family === 'IPv4')
  );
  cb(RESULT.SUCCESS, 'Network status retrieved.', { connected, interfaces: Object.keys(nets) });
}

// ── Platform adapter (unified) ────────────────────────────────────────────────
//
// The Desktop Agent's action handlers already handle open_application,
// launch_website, lock_screen, sleep (via sr-desktop-agent-server.js).
// This adapter adds the extended actions not in the base agent.

const EXTENDED_ACTIONS = new Set([
  'media_play', 'media_pause', 'media_next', 'media_previous',
  'volume_up', 'volume_down', 'mute', 'unmute',
  'battery_status', 'network_status',
  // Note: lock_screen is handled by sr-desktop-agent-server.js (base agent).
  // On Linux, main.js upgrades the lock command to xdg-screensaver via _linuxLockScreen.
]);

/**
 * execute(action, params, callback(result, message, data))
 * Routes to the correct platform implementation.
 */
function execute(action, params, callback) {
  switch (action) {
    case 'media_play':      return _mediaPlay(callback);
    case 'media_pause':     return _mediaPause(callback);
    case 'media_next':
    case 'next':            return _mediaNext(callback);
    case 'media_previous':
    case 'previous':        return _mediaPrevious(callback);
    case 'volume_up':       return _volumeUp(callback);
    case 'volume_down':     return _volumeDown(callback);
    case 'mute':            return _mute(callback);
    case 'unmute':          return _unmute(callback);
    case 'battery_status':  return _getBatteryStatus(callback);
    case 'network_status':  return _getNetworkStatus(callback);
    default:
      callback(RESULT.NOT_SUPPORTED, 'Action "' + action + '" is not handled by the extended platform adapter.');
  }
}

function handles(action) {
  return EXTENDED_ACTIONS.has(action);
}

// ── System information ────────────────────────────────────────────────────────

function getSystemInfo() {
  return {
    platform:     PLATFORM,
    hostname:     os.hostname(),
    osType:       os.type(),
    osRelease:    os.release(),
    arch:         os.arch(),
    uptime:       os.uptime(),
    totalMemory:  os.totalmem(),
    freeMemory:   os.freemem(),
  };
}

module.exports = {
  PLATFORM,
  IS_WIN,
  IS_MAC,
  IS_LINUX,
  RESULT,
  execute,
  handles,
  getSystemInfo,
  EXTENDED_ACTIONS,
  // Exported for use in main.js for direct lock-screen call
  _linuxLockScreen,
};
