/**
 * shadow-reaper-standalone/snx-shadow-adaptive.js
 * Shadow Reaper Standalone — Adaptive Learning
 *
 * Build: SR-STANDALONE-ADAPTIVE-1
 *
 * Exposes: window.SNXShadowAdaptive
 *
 * DROP-IN REPLACEMENT for the SNS snx-shadow-adaptive.js.
 * Preserves the exact same public API so that:
 *   - core/persistence-bridge.js works unchanged
 *   - core/adaptive-brain.js works unchanged (delegates isEnabled() here)
 *   - tests/master.test.js works unchanged
 *   - ui.html / dev-test.html load order is unchanged
 *
 * WHAT CHANGED vs SNS version:
 *   - Firebase access uses SRFirebaseAdapter (NOT _snxDbCompat / _snxAuth)
 *   - No dependency on _snxCurrentUser
 *   - No dependency on any SNS global
 *
 * PUBLIC API (unchanged):
 *   init()
 *   ensureLoaded()
 *   processTurn(userText, convId)
 *   retrieveRelevant(userText)     → [{category, key, value, confidence}]
 *   listAll()                      → [{category, key, value, confidence}]
 *   clearAll(callback)
 *   detectIntent(text)             → 'ADAPTIVE_LIST'|'ADAPTIVE_CLEAR'|'ADAPTIVE_FORGET_ONE'|null
 *   setEnabled(bool)
 *   isEnabled()                    → boolean
 *   destroy()
 *
 * FIRESTORE PATH:
 *   users/{uid}/shadowReaperLearnedContext/{itemId}
 *   (same collection as SRAdaptiveBrain — no duplication; brain records
 *    are distinguished by the brainRecord=true field)
 *
 * PRIVACY:
 *   UID-isolated. Sensitive data never stored.
 */

(function (global) {
  'use strict';

  var BUILD_ID = 'SR-STANDALONE-ADAPTIVE-1';

  /* ── Constants ───────────────────────────────────────────────────────────── */
  var MAX_ITEMS        = 120;
  var MAX_VALUE_LEN    = 400;
  var MAX_RETRIEVE     = 5;
  var CONF_HIGH        = 4;
  var CONF_MED         = 2;
  var LS_ENABLED_KEY   = 'snxShadowAdaptiveEnabled';  /* kept for test compatibility */

  /* ── Sensitive data filter ───────────────────────────────────────────────── */
  var _SENSITIVE = [
    /\b(password|passwd)\s*(is|=|:)\s*\S+/i,
    /\bapi[\s_-]?key\s*(is|=|:)\s*\S+/i,
    /\btoken\s*(is|=|:)\s*\S+/i,
    /\bsecret\s*(is|=|:)\s*\S+/i,
    /\bcredit\s*card/i,
    /\b(private[\s_-]?key|ssh[\s_-]?key)\s*(is|=|:)/i,
    /\bmy\s+password\s+is\b/i,
    /\bmy\s+api\s+key\s+is\b/i,
    /\bserviceAccountKey/i,
  ];

  function _isSensitive(text) {
    return _SENSITIVE.some(function (p) { return p.test(text); });
  }

  /* ── In-memory cache ─────────────────────────────────────────────────────── */
  var _cache      = [];   // [{ id, category, key, value, confidence, count }]
  var _loaded     = false;
  var _enabled    = true;

  /* ── Helpers ─────────────────────────────────────────────────────────────── */
  function _fb()  { return global.SRFirebaseAdapter || null; }

  function _uid() {
    var fb = _fb();
    if (fb && typeof fb.getUID === 'function') return fb.getUID();
    return null;
  }

  function _isGuest() { return !_uid(); }

  function _contextCol() {
    var fb = _fb();
    if (!fb || typeof fb.userLearnedContextCol !== 'function') return null;
    return fb.userLearnedContextCol();
  }

  function _conf(count) {
    if (count >= CONF_HIGH) return 'HIGH';
    if (count >= CONF_MED)  return 'MEDIUM';
    return 'LOW';
  }

  /* ── ENABLED STATE ───────────────────────────────────────────────────────── */
  function _readEnabled() {
    try {
      var val = global.localStorage ? global.localStorage.getItem(LS_ENABLED_KEY) : null;
      return val !== 'false';
    } catch (_) { return true; }
  }

  function isEnabled() { return _enabled && _readEnabled(); }

  function setEnabled(val) {
    _enabled = !!val;
    try {
      if (global.localStorage) {
        global.localStorage.setItem(LS_ENABLED_KEY, String(!!val));
      }
    } catch (_) {}
  }

  /* ── CONCEPT EXTRACTION ──────────────────────────────────────────────────── */
  /* Lightweight pattern-based extraction — no model inference */
  var _EXTRACT = [
    { cat: 'PROJECT',    re: /\b(?:my\s+)?project\s+(?:is\s+called?|named?)\s+["']?([A-Za-z0-9 _-]{2,40})["']?/i },
    { cat: 'PROJECT',    re: /\bworking\s+on\s+["']?([A-Za-z0-9 _-]{2,40})["']?/i },
    { cat: 'LANGUAGE',   re: /\b(?:using|writing\s+in|prefer)\s+(JavaScript|TypeScript|Python|Rust|Go|Java|Swift|Kotlin|C\+\+|Ruby|PHP|Dart)\b/i },
    { cat: 'FRAMEWORK',  re: /\b(?:using|working\s+with)\s+(React|Vue|Angular|Next\.?js|Nuxt|Svelte|Django|Flask|Express|Rails|Laravel|Flutter)\b/i },
    { cat: 'PREFERENCE', re: /\bI\s+prefer\s+([^.!?]{3,60})/i },
    { cat: 'PREFERENCE', re: /\bI\s+like\s+([^.!?]{3,60})/i },
    { cat: 'PREFERENCE', re: /\bI\s+(?:always|usually|typically)\s+([^.!?]{3,60})/i },
    { cat: 'NAME',       re: /\bmy\s+name\s+is\s+([A-Za-z]{2,40})\b/i },
    { cat: 'ROLE',       re: /\bI(?:'m|\s+am)\s+a(?:n)?\s+([A-Za-z ]{3,40})/i },
  ];

  function _extract(text) {
    if (!text) return [];
    var results = [];
    _EXTRACT.forEach(function (rule) {
      var m = text.match(rule.re);
      if (m && m[1]) {
        var val = m[1].trim().slice(0, MAX_VALUE_LEN);
        if (!_isSensitive(val)) {
          results.push({ category: rule.cat, key: rule.cat + ':' + val.toLowerCase(), value: val });
        }
      }
    });
    return results;
  }

  /* ── LOAD FROM FIRESTORE ─────────────────────────────────────────────────── */
  function _loadFromDB(callback) {
    callback = callback || function () {};
    if (_loaded || _isGuest()) { _loaded = true; callback(); return; }

    var col = _contextCol();
    if (!col) { _loaded = true; callback(); return; }

    /* Load only non-brain records (brainRecord != true) */
    col.where('brainRecord', '==', false).limit(MAX_ITEMS).get()
      .then(function (snap) {
        _cache = [];
        snap.forEach(function (d) {
          var data = d.data();
          _cache.push({
            id:         d.id,
            category:   data.category || 'general',
            key:        data.key      || '',
            value:      data.value    || '',
            confidence: data.confidence || 'LOW',
            count:      data.count    || 1,
          });
        });
        _loaded = true;
        callback();
      })
      .catch(function () {
        _loaded = true;
        callback();
      });
  }

  /* ── SAVE ITEM ───────────────────────────────────────────────────────────── */
  function _saveItem(item) {
    var col = _contextCol();
    if (!col) return;

    var fb = _fb();
    var record = {
      category:   item.category,
      key:        item.key,
      value:      item.value,
      confidence: item.confidence,
      count:      item.count,
      updatedAt:  new Date().toISOString(),
      brainRecord: false,  /* distinguishes from SRAdaptiveBrain records */
    };

    if (item.id) {
      col.doc(item.id).set(record, { merge: true }).catch(function () {});
    } else {
      (fb && fb.safeAdd ? fb.safeAdd(col, record) : col.add(record))
        .then(function (ref) {
          if (ref && ref.id) item.id = ref.id;
        })
        .catch(function () {});
    }
  }

  /* ── PROCESS TURN ────────────────────────────────────────────────────────── */
  function processTurn(userText, convId) {
    if (!isEnabled()) return;
    if (!userText) return;
    if (_isSensitive(userText)) return;

    function _doProcess() {
      var extracted = _extract(userText);
      extracted.forEach(function (ext) {
        var existing = null;
        for (var i = 0; i < _cache.length; i++) {
          if (_cache[i].key === ext.key) { existing = _cache[i]; break; }
        }
        if (existing) {
          existing.count++;
          existing.confidence = _conf(existing.count);
          _saveItem(existing);
        } else {
          if (_cache.length >= MAX_ITEMS) return;
          var newItem = {
            id:         null,
            category:   ext.category,
            key:        ext.key,
            value:      ext.value,
            confidence: 'LOW',
            count:      1,
          };
          _cache.push(newItem);
          _saveItem(newItem);
        }
      });
    }

    if (!_loaded) {
      _loadFromDB(_doProcess);
    } else {
      _doProcess();
    }
  }

  /* ── RETRIEVE RELEVANT ───────────────────────────────────────────────────── */
  function retrieveRelevant(userText) {
    if (!isEnabled() || !_loaded) return [];
    if (!userText) return _cache.slice(0, MAX_RETRIEVE);

    var lower = userText.toLowerCase();
    var scored = _cache
      .filter(function (it) { return it.value && it.value.length > 0; })
      .map(function (it) {
        var score = 0;
        if (lower.includes(it.value.toLowerCase())) score += 10;
        if (lower.includes(it.category.toLowerCase())) score += 3;
        if (it.confidence === 'HIGH')   score += 2;
        if (it.confidence === 'MEDIUM') score += 1;
        return { item: it, score: score };
      })
      .filter(function (s) { return s.score > 0; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, MAX_RETRIEVE)
      .map(function (s) { return s.item; });

    return scored;
  }

  /* ── LIST ALL ────────────────────────────────────────────────────────────── */
  function listAll() {
    return _cache.slice();
  }

  /* ── CLEAR ALL ───────────────────────────────────────────────────────────── */
  function clearAll(callback) {
    callback = callback || function () {};
    _cache = [];

    if (_isGuest()) { callback({ success: true }); return; }

    var col = _contextCol();
    if (!col) { callback({ success: true }); return; }

    /* Only delete non-brain records */
    col.where('brainRecord', '==', false).limit(500).get().then(function (snap) {
      var deletes = [];
      snap.forEach(function (d) { deletes.push(d.ref.delete()); });
      return Promise.all(deletes);
    }).then(function () {
      callback({ success: true });
    }).catch(function () {
      callback({ success: false });
    });
  }

  /* ── DETECT INTENT ───────────────────────────────────────────────────────── */
  var _INTENT_PATTERNS = {
    ADAPTIVE_LIST:       [/\bwhat\s+have\s+you\s+learned\b/i, /\bshow.*learned\s+context\b/i, /\blist.*adaptive\b/i],
    ADAPTIVE_CLEAR:      [/\bclear.*learned\b/i, /\bforget.*learned\s+context\b/i, /\breset.*adaptive\b/i],
    ADAPTIVE_FORGET_ONE: [/\bforget\s+that\s+I\b/i, /\bremove.*from.*learned\b/i],
  };

  function detectIntent(text) {
    if (!text) return null;
    for (var intent in _INTENT_PATTERNS) {
      if (_INTENT_PATTERNS[intent].some(function (p) { return p.test(text); })) {
        return intent;
      }
    }
    return null;
  }

  /* ── INIT / ENSURE LOADED ────────────────────────────────────────────────── */
  function init() {
    if (_isGuest()) return;
  }

  function ensureLoaded() {
    if (!_loaded && !_isGuest()) {
      _loadFromDB(function () {});
    }
  }

  function destroy() {
    _cache  = [];
    _loaded = false;
  }

  /* ── EXPOSE ──────────────────────────────────────────────────────────────── */
  global.SNXShadowAdaptive = {
    build: BUILD_ID,

    init:             init,
    ensureLoaded:     ensureLoaded,
    processTurn:      processTurn,
    retrieveRelevant: retrieveRelevant,
    listAll:          listAll,
    clearAll:         clearAll,
    detectIntent:     detectIntent,
    isEnabled:        isEnabled,
    setEnabled:       setEnabled,
    destroy:          destroy,
  };

})(typeof window !== 'undefined' ? window : global);
