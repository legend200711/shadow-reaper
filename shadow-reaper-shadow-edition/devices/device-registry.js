/**
 * shadow-reaper-v2/devices/device-registry.js
 * Shadow Reaper V2 — Device Registry
 *
 * Build: SR-V2-DEVICES-1
 *
 * Exposes: window.SRDeviceRegistry
 *
 * PURPOSE:
 *   Maintains the list of devices that have been explicitly paired and
 *   authorized by the owner.  No device is controllable until:
 *     DISCOVER → SELECT → PAIR → AUTHORIZE CAPABILITIES → REGISTER
 *
 * SECURITY:
 *   - No plaintext credentials stored
 *   - No authentication tokens in frontend code
 *   - Each device has a unique ID and a capability allowlist
 *   - Pairing requires explicit owner action
 *   - Per-device permission levels
 *
 * STORAGE:
 *   Devices are persisted in localStorage under a namespaced key.
 *   Sensitive credentials (tokens, secrets) are NEVER stored here;
 *   they belong in the Shadow Desktop Agent or secure server-side storage.
 *
 * DEVICE TYPES:
 *   COMPUTER        — Shadow Desktop Agent (Windows/Linux/macOS)
 *   SMART_TV        — Smart TV (Roku, Android TV, etc.)
 *   SMART_LIGHT     — Smart lights / bulbs
 *   SMART_PLUG      — Smart power outlets
 *   SMART_SPEAKER   — Smart speakers
 *   THERMOSTAT      — Thermostats / HVAC
 *   MEDIA_PLAYER    — Standalone media players
 *   GENERIC_SMART   — Any other supported smart device
 *
 * CONNECTION TYPES:
 *   LOCAL_NETWORK   — Controlled via same Wi-Fi / LAN (no cloud needed)
 *   REMOTE_AGENT    — Controlled via authenticated Shadow Desktop Agent
 *   CLOUD_API       — Controlled via manufacturer cloud API + OAuth
 *
 * PERMISSION LEVELS:
 *   READ_ONLY       — status queries only
 *   STANDARD        — normal commands (volume, play/pause, lights, etc.)
 *   ELEVATED        — higher-impact commands (shutdown, restart)
 *   ALL             — full capability set (requires explicit grant)
 */

'use strict';

(function (global) {

  var BUILD_ID   = 'SR-V2-DEVICES-1';
  var STORAGE_KEY = 'srDeviceRegistry';

  // ── Device types ────────────────────────────────────────────────────────
  var DEVICE_TYPES = {
    COMPUTER:      'COMPUTER',
    SMART_TV:      'SMART_TV',
    SMART_LIGHT:   'SMART_LIGHT',
    SMART_PLUG:    'SMART_PLUG',
    SMART_SPEAKER: 'SMART_SPEAKER',
    THERMOSTAT:    'THERMOSTAT',
    MEDIA_PLAYER:  'MEDIA_PLAYER',
    GENERIC_SMART: 'GENERIC_SMART',
  };

  // ── Connection types ─────────────────────────────────────────────────────
  var CONN_TYPES = {
    LOCAL_NETWORK: 'LOCAL_NETWORK',
    REMOTE_AGENT:  'REMOTE_AGENT',
    CLOUD_API:     'CLOUD_API',
  };

  // ── Permission levels (ordered: higher index = more access) ─────────────
  var PERMISSION_LEVELS = {
    READ_ONLY: 'READ_ONLY',
    STANDARD:  'STANDARD',
    ELEVATED:  'ELEVATED',
    ALL:       'ALL',
  };

  // ── Device status ────────────────────────────────────────────────────────
  var DEVICE_STATUS = {
    ONLINE:    'ONLINE',
    OFFLINE:   'OFFLINE',
    UNKNOWN:   'UNKNOWN',
    PAIRED:    'PAIRED',
    UNPAIRED:  'UNPAIRED',
  };

  // ── Registry state ───────────────────────────────────────────────────────
  var _devices = {};   // deviceId → device record

  // ─── Persistence helpers ──────────────────────────────────────────────────

  function _load() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          _devices = parsed;
        }
      }
    } catch (_) {
      _devices = {};
    }
  }

  function _save() {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(STORAGE_KEY, JSON.stringify(_devices));
      }
    } catch (_) {}
  }

  // ─── ID generation ─────────────────────────────────────────────────────

  function _generateId() {
    // Simple collision-resistant ID (no crypto required for a device ID)
    var ts   = Date.now().toString(36);
    var rand = Math.random().toString(36).slice(2, 8);
    return 'dev_' + ts + '_' + rand;
  }

  // ─── Register a new device ────────────────────────────────────────────────

  /**
   * registerDevice(opts) — add a device to the registry.
   *
   * opts = {
   *   friendlyName:   string   (required) — e.g. "My Computer", "Bedroom TV"
   *   deviceType:     string   (required) — DEVICE_TYPES value
   *   connectionType: string   (required) — CONN_TYPES value
   *   capabilities:   string[] (required) — allowlisted capability names
   *   permissionLevel: string  (optional, default STANDARD)
   *   deviceId:       string   (optional, auto-generated)
   *   metadata:       object   (optional) — non-sensitive extra info
   * }
   *
   * Returns the registered device record.
   */
  function registerDevice(opts) {
    if (!opts || !opts.friendlyName || !opts.deviceType || !opts.connectionType) {
      throw new Error('[SRDeviceRegistry] registerDevice: friendlyName, deviceType, and connectionType are required.');
    }

    var id = opts.deviceId || _generateId();
    if (_devices[id]) {
      throw new Error('[SRDeviceRegistry] Device ID already registered: ' + id);
    }

    var device = {
      deviceId:       id,
      friendlyName:   String(opts.friendlyName),
      deviceType:     opts.deviceType,
      connectionType: opts.connectionType,
      capabilities:   Array.isArray(opts.capabilities) ? opts.capabilities.slice() : [],
      permissionLevel: opts.permissionLevel || PERMISSION_LEVELS.STANDARD,
      pairingStatus:  DEVICE_STATUS.PAIRED,
      onlineStatus:   DEVICE_STATUS.UNKNOWN,
      lastSeen:       null,
      metadata:       opts.metadata || {},
      registeredAt:   new Date().toISOString(),
    };

    _devices[id] = device;
    _save();
    return _cloneDevice(device);
  }

  // ─── Unregister (unpair) a device ────────────────────────────────────────

  function unregisterDevice(deviceId) {
    if (!_devices[deviceId]) return false;
    delete _devices[deviceId];
    _save();
    return true;
  }

  // ─── Get device(s) ───────────────────────────────────────────────────────

  function getDevice(deviceId) {
    var d = _devices[deviceId];
    return d ? _cloneDevice(d) : null;
  }

  function getAllDevices() {
    return Object.keys(_devices).map(function (id) {
      return _cloneDevice(_devices[id]);
    });
  }

  function getDeviceByName(friendlyName) {
    var lower = (friendlyName || '').toLowerCase().trim();
    var found = null;
    Object.keys(_devices).forEach(function (id) {
      if (_devices[id].friendlyName.toLowerCase() === lower) {
        found = _cloneDevice(_devices[id]);
      }
    });
    return found;
  }

  function getDevicesByType(deviceType) {
    return Object.keys(_devices)
      .filter(function (id) { return _devices[id].deviceType === deviceType; })
      .map(function (id) { return _cloneDevice(_devices[id]); });
  }

  // ─── Update device status ─────────────────────────────────────────────────

  function updateOnlineStatus(deviceId, status) {
    if (!_devices[deviceId]) return false;
    _devices[deviceId].onlineStatus = status;
    if (status === DEVICE_STATUS.ONLINE) {
      _devices[deviceId].lastSeen = new Date().toISOString();
    }
    _save();
    return true;
  }

  // ─── Capability check ─────────────────────────────────────────────────────

  /**
   * hasCapability(deviceId, capability)
   * Returns true if the device has the given capability in its allowlist.
   */
  function hasCapability(deviceId, capability) {
    var d = _devices[deviceId];
    if (!d) return false;
    return d.capabilities.indexOf(capability) !== -1;
  }

  /**
   * isPermitted(deviceId, requiredLevel)
   * Returns true if the device's permissionLevel is at least requiredLevel.
   */
  var _permOrder = [
    PERMISSION_LEVELS.READ_ONLY,
    PERMISSION_LEVELS.STANDARD,
    PERMISSION_LEVELS.ELEVATED,
    PERMISSION_LEVELS.ALL,
  ];

  function isPermitted(deviceId, requiredLevel) {
    var d = _devices[deviceId];
    if (!d) return false;
    var deviceIdx   = _permOrder.indexOf(d.permissionLevel);
    var requiredIdx = _permOrder.indexOf(requiredLevel);
    if (deviceIdx === -1 || requiredIdx === -1) return false;
    return deviceIdx >= requiredIdx;
  }

  // ─── Shallow clone (prevent external mutation) ────────────────────────────

  function _cloneDevice(d) {
    return {
      deviceId:       d.deviceId,
      friendlyName:   d.friendlyName,
      deviceType:     d.deviceType,
      connectionType: d.connectionType,
      capabilities:   d.capabilities.slice(),
      permissionLevel: d.permissionLevel,
      pairingStatus:  d.pairingStatus,
      onlineStatus:   d.onlineStatus,
      lastSeen:       d.lastSeen,
      metadata:       Object.assign({}, d.metadata),
      registeredAt:   d.registeredAt,
    };
  }

  // ─── Initialize ───────────────────────────────────────────────────────────

  function init() {
    _load();
  }

  // ─── Expose ───────────────────────────────────────────────────────────────

  global.SRDeviceRegistry = {
    build:          BUILD_ID,
    DEVICE_TYPES:   DEVICE_TYPES,
    CONN_TYPES:     CONN_TYPES,
    PERMISSION_LEVELS: PERMISSION_LEVELS,
    DEVICE_STATUS:  DEVICE_STATUS,

    init:               init,
    registerDevice:     registerDevice,
    unregisterDevice:   unregisterDevice,
    getDevice:          getDevice,
    getAllDevices:       getAllDevices,
    getDeviceByName:    getDeviceByName,
    getDevicesByType:   getDevicesByType,
    updateOnlineStatus: updateOnlineStatus,
    hasCapability:      hasCapability,
    isPermitted:        isPermitted,
  };

})(typeof window !== 'undefined' ? window : global);
