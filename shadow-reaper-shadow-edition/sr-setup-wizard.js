/**
 * shadow-reaper-v2/sr-setup-wizard.js
 * Shadow Reaper — First-Use Setup Wizard
 *
 * Build: SR-V2-SETUP-WIZARD-1
 *
 * Exposes: window.SRSetupWizard
 *
 * PURPOSE:
 *   Manages the first-use setup flow (runs ONCE, then never shows again).
 *   Persists setup completion to localStorage.
 *   Does NOT block normal app use — the wizard is a polite welcome overlay.
 *
 *   Setup steps:
 *     1. Welcome
 *     2. Choose Assistant Name (wake name)
 *     3. Choose Voice (Male/Female TTS)
 *     4. Microphone permission
 *     5. Notification permission (where supported)
 *     6. Memory/Privacy preference
 *     7. Finish → Talk to Shadow
 *
 * SECURITY:
 *   No credentials, no Firebase writes here.
 *   Preferences are stored in localStorage only.
 *   Firebase sync happens via the normal SRWakeName / SRVoice modules.
 *
 * ZERO EXTERNAL AI CALLS.
 * ZERO POLLING.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-V2-SETUP-WIZARD-1';
  var SETUP_KEY = 'srSetupComplete_v1';

  var WAKE_NAMES = ['Shadow', 'Pepper', 'Luna', 'Elsa', 'Simba', 'Salem', 'Rambo', 'Legend'];

  // ─── State ────────────────────────────────────────────────────────────────
  var _step        = 0;
  var _totalSteps  = 6;
  var _overlay     = null;
  var _onComplete  = null;
  var _prefs       = {
    wakeName:      'Shadow',
    voiceGender:   'female',   // 'male' | 'female'
    micEnabled:    true,
    memoryEnabled: true,
  };

  // ─── Public: check if setup is needed ─────────────────────────────────────
  function isComplete() {
    try {
      return !!localStorage.getItem(SETUP_KEY);
    } catch (e) { return true; } // fail safe: don't show wizard if localStorage errors
  }

  function markComplete() {
    try { localStorage.setItem(SETUP_KEY, '1'); } catch (e) {}
  }

  function reset() {
    try { localStorage.removeItem(SETUP_KEY); } catch (e) {}
  }

  // ─── Show the wizard ──────────────────────────────────────────────────────
  function show(onComplete) {
    if (typeof onComplete === 'function') _onComplete = onComplete;
    _step = 0;
    _buildOverlay();
    _renderStep();
    document.body.appendChild(_overlay);
    // Animate in
    requestAnimationFrame(function () {
      if (_overlay) _overlay.style.opacity = '1';
    });
  }

  // ─── Build the overlay container ──────────────────────────────────────────
  function _buildOverlay() {
    if (_overlay) { try { _overlay.remove(); } catch (e) {} }
    _overlay = document.createElement('div');
    _overlay.id = 'srSetupWizard';
    _overlay.setAttribute('role', 'dialog');
    _overlay.setAttribute('aria-label', 'Shadow Reaper Setup');
    _overlay.style.cssText = [
      'position:fixed;inset:0;z-index:200;',
      'display:flex;align-items:center;justify-content:center;',
      'background:rgba(5,8,17,0.97);',
      'padding:20px;',
      'opacity:0;transition:opacity 0.3s ease;',
      'overflow-y:auto;',
    ].join('');
  }

  // ─── Render step ──────────────────────────────────────────────────────────
  function _renderStep() {
    if (!_overlay) return;
    _overlay.innerHTML = '';

    var card = document.createElement('div');
    card.style.cssText = [
      'background:#0d1220;border:1px solid rgba(30,144,255,0.25);border-radius:20px;',
      'padding:32px 28px 24px;max-width:440px;width:100%;',
      'display:flex;flex-direction:column;gap:0;',
    ].join('');
    _overlay.appendChild(card);

    // Progress dots
    var prog = document.createElement('div');
    prog.style.cssText = 'display:flex;gap:6px;justify-content:center;margin-bottom:28px;';
    for (var i = 0; i < _totalSteps; i++) {
      var dot = document.createElement('div');
      dot.style.cssText = 'width:7px;height:7px;border-radius:50%;transition:background 0.2s;background:' +
        (i === _step ? '#1e90ff' : (i < _step ? 'rgba(30,144,255,0.6)' : 'rgba(30,144,255,0.15)')) + ';';
      prog.appendChild(dot);
    }
    card.appendChild(prog);

    // Step content
    var steps = [_step0, _step1, _step2, _step3, _step4, _step5];
    if (steps[_step]) steps[_step](card);
  }

  // ─── Step 0: Welcome ──────────────────────────────────────────────────────
  function _step0(card) {
    _title(card, '&#9760;', 'Welcome to Shadow Reaper', 'Shadow Edition');
    _body(card, 'Your personal AI assistant. Let\'s get you set up in about a minute.');
    _buttons(card, null, 'Get Started', function () { _step = 1; _renderStep(); });
  }

  // ─── Step 1: Choose Assistant Name ────────────────────────────────────────
  function _step1(card) {
    _title(card, '&#129302;', 'Choose Your Assistant', 'Pick the name you\'ll use to activate Shadow');

    var grid = document.createElement('div');
    grid.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin:16px 0;';
    WAKE_NAMES.forEach(function (name) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = name;
      btn.style.cssText = [
        'padding:8px 18px;border-radius:20px;font-size:14px;font-family:inherit;cursor:pointer;',
        'transition:all 0.15s;letter-spacing:0.02em;',
        _prefs.wakeName === name
          ? 'background:rgba(30,144,255,0.2);border:1.5px solid #1e90ff;color:#1e90ff;font-weight:700;'
          : 'background:#111826;border:1.5px solid rgba(30,144,255,0.2);color:#94a3b8;',
      ].join('');
      btn.addEventListener('click', function () {
        _prefs.wakeName = name;
        _applyWakeName(name);
        _renderStep();
      });
      grid.appendChild(btn);
    });
    card.appendChild(grid);

    var note = document.createElement('div');
    note.style.cssText = 'font-size:11px;color:#5a6880;line-height:1.5;margin-bottom:16px;';
    note.textContent = 'All identities share the same Shadow Reaper intelligence. Changing names never resets memory or learning.';
    card.appendChild(note);

    _buttons(card, function () { _step = 0; _renderStep(); }, 'Continue',
      function () { _step = 2; _renderStep(); });
  }

  // ─── Step 2: Voice Gender ─────────────────────────────────────────────────
  function _step2(card) {
    _title(card, '&#128264;', 'Choose Voice', 'How should ' + _prefs.wakeName + ' sound?');

    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:12px;margin:20px 0;';

    ['female', 'male'].forEach(function (gender) {
      var btn = document.createElement('button');
      btn.type = 'button';
      var icon = gender === 'female' ? '&#9792;' : '&#9794;';
      var label = gender === 'female' ? 'Female Voice' : 'Male Voice';
      btn.innerHTML = '<span style="font-size:22px;display:block;margin-bottom:6px;">' + icon + '</span>' +
        '<span style="font-size:13px;font-weight:700;">' + label + '</span>';
      btn.style.cssText = [
        'flex:1;padding:16px 12px;border-radius:14px;font-family:inherit;cursor:pointer;text-align:center;',
        'transition:all 0.15s;',
        _prefs.voiceGender === gender
          ? 'background:rgba(30,144,255,0.15);border:1.5px solid #1e90ff;color:#1e90ff;'
          : 'background:#111826;border:1.5px solid rgba(30,144,255,0.2);color:#94a3b8;',
      ].join('');
      btn.addEventListener('click', function () {
        _prefs.voiceGender = gender;
        _applyVoiceGender(gender);
        _renderStep();
      });
      row.appendChild(btn);
    });
    card.appendChild(row);

    _buttons(card, function () { _step = 1; _renderStep(); }, 'Continue',
      function () { _step = 3; _renderStep(); });
  }

  // ─── Step 3: Microphone Permission ────────────────────────────────────────
  function _step3(card) {
    _title(card, '&#127908;', 'Microphone Access', 'Talk to ' + _prefs.wakeName + ' hands-free');
    _body(card, 'Shadow can listen for your voice to activate hands-free conversation. You can always toggle this in Settings.');

    var permBtn = document.createElement('button');
    permBtn.type = 'button';
    permBtn.style.cssText = [
      'width:100%;padding:12px 16px;border-radius:12px;font-size:14px;font-family:inherit;cursor:pointer;',
      'background:rgba(30,144,255,0.12);border:1.5px solid rgba(30,144,255,0.4);color:#1e90ff;',
      'font-weight:700;letter-spacing:0.04em;margin:16px 0 8px;transition:background 0.15s;',
    ].join('');
    permBtn.innerHTML = '&#127908; Allow Microphone';
    permBtn.addEventListener('click', function () {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ audio: true })
          .then(function (stream) {
            // Release immediately — we only want permission
            stream.getTracks().forEach(function (t) { t.stop(); });
            _prefs.micEnabled = true;
            permBtn.innerHTML = '&#10003; Microphone Allowed';
            permBtn.style.background = 'rgba(34,197,94,0.12)';
            permBtn.style.borderColor = 'rgba(34,197,94,0.4)';
            permBtn.style.color = '#22c55e';
          })
          .catch(function () {
            _prefs.micEnabled = false;
            permBtn.innerHTML = '&#9888; Permission Denied — use text input';
            permBtn.style.background = 'rgba(239,68,68,0.1)';
            permBtn.style.borderColor = 'rgba(239,68,68,0.3)';
            permBtn.style.color = '#ef4444';
          });
      } else {
        permBtn.innerHTML = '&#9888; Microphone not supported';
        permBtn.style.color = '#5a6880';
      }
    });
    card.appendChild(permBtn);

    var skip = document.createElement('div');
    skip.style.cssText = 'font-size:11px;color:#5a6880;text-align:center;margin-bottom:16px;';
    skip.textContent = 'You can use text input if you prefer not to enable the microphone.';
    card.appendChild(skip);

    _buttons(card, function () { _step = 2; _renderStep(); }, 'Continue',
      function () { _step = 4; _renderStep(); });
  }

  // ─── Step 4: Memory / Privacy ─────────────────────────────────────────────
  function _step4(card) {
    _title(card, '&#129504;', 'Memory & Privacy', 'How much should ' + _prefs.wakeName + ' remember?');

    var opts = [
      {
        id:    'mem-full',
        label: 'Full Memory',
        desc:  'Remember conversations, learn your preferences, and improve over time.',
        value: 'full',
      },
      {
        id:    'mem-session',
        label: 'Session Only',
        desc:  'Remember context within each conversation but clear on close.',
        value: 'session',
      },
    ];

    var sel = _prefs.memoryEnabled ? 'full' : 'session';
    opts.forEach(function (opt) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.style.cssText = [
        'display:flex;align-items:flex-start;gap:12px;width:100%;',
        'padding:14px 14px;border-radius:12px;font-family:inherit;cursor:pointer;text-align:left;',
        'margin-bottom:8px;transition:all 0.15s;',
        sel === opt.value
          ? 'background:rgba(30,144,255,0.12);border:1.5px solid #1e90ff;'
          : 'background:#111826;border:1.5px solid rgba(30,144,255,0.2);',
      ].join('');

      var radio = document.createElement('div');
      radio.style.cssText = [
        'width:16px;height:16px;border-radius:50%;flex:0 0 16px;margin-top:2px;',
        sel === opt.value
          ? 'background:#1e90ff;border:2px solid #1e90ff;'
          : 'background:transparent;border:2px solid rgba(30,144,255,0.4);',
      ].join('');

      var text = document.createElement('div');
      var lbl = document.createElement('div');
      lbl.style.cssText = 'font-size:13px;font-weight:700;color:#e8edf5;margin-bottom:3px;';
      lbl.textContent = opt.label;
      var desc = document.createElement('div');
      desc.style.cssText = 'font-size:11px;color:#5a6880;line-height:1.5;';
      desc.textContent = opt.desc;
      text.appendChild(lbl);
      text.appendChild(desc);

      btn.appendChild(radio);
      btn.appendChild(text);
      btn.addEventListener('click', function () {
        _prefs.memoryEnabled = opt.value === 'full';
        _renderStep();
      });
      card.appendChild(btn);
    });

    _buttons(card, function () { _step = 3; _renderStep(); }, 'Continue',
      function () { _step = 5; _renderStep(); });
  }

  // ─── Step 5: Finish ───────────────────────────────────────────────────────
  function _step5(card) {
    _title(card, '&#10024;', 'You\'re All Set!', 'Everything is configured. You can change any preference in Settings.');

    var summary = document.createElement('div');
    summary.style.cssText = 'background:#111826;border:1px solid rgba(30,144,255,0.15);border-radius:12px;padding:14px 16px;margin:16px 0;';
    var rows = [
      ['Assistant', _prefs.wakeName],
      ['Voice', _prefs.voiceGender === 'female' ? 'Female' : 'Male'],
      ['Microphone', _prefs.micEnabled ? 'Enabled' : 'Disabled (text input)'],
      ['Memory', _prefs.memoryEnabled ? 'Full Memory' : 'Session Only'],
    ];
    rows.forEach(function (r) {
      var row = document.createElement('div');
      row.style.cssText = 'display:flex;justify-content:space-between;padding:5px 0;font-size:12px;border-bottom:1px solid rgba(30,144,255,0.08);';
      var lbl = document.createElement('span');
      lbl.style.color = '#5a6880';
      lbl.textContent = r[0];
      var val = document.createElement('span');
      val.style.cssText = 'color:#e8edf5;font-weight:600;';
      val.textContent = r[1];
      row.appendChild(lbl);
      row.appendChild(val);
      summary.appendChild(row);
    });
    card.appendChild(summary);

    var goBtn = document.createElement('button');
    goBtn.type = 'button';
    goBtn.style.cssText = [
      'width:100%;padding:14px 20px;border-radius:14px;font-size:15px;font-family:inherit;',
      'font-weight:800;letter-spacing:0.06em;cursor:pointer;',
      'background:#1e90ff;border:none;color:#fff;',
      'transition:background 0.15s;margin-top:8px;',
    ].join('');
    goBtn.innerHTML = 'Talk to ' + _prefs.wakeName + ' &#8594;';
    goBtn.addEventListener('click', function () {
      _applyAllPrefs();
      markComplete();
      _dismiss();
    });
    card.appendChild(goBtn);
  }

  // ─── Helper builders ──────────────────────────────────────────────────────
  function _title(card, glyph, title, sub) {
    var wrap = document.createElement('div');
    wrap.style.cssText = 'text-align:center;margin-bottom:8px;';
    var g = document.createElement('div');
    g.style.cssText = 'font-size:44px;margin-bottom:10px;filter:drop-shadow(0 0 14px rgba(30,144,255,0.45));';
    g.innerHTML = glyph;
    var t = document.createElement('h2');
    t.style.cssText = 'font-size:22px;font-weight:800;color:#e8edf5;letter-spacing:0.03em;margin-bottom:6px;';
    t.textContent = title;
    var s = document.createElement('div');
    s.style.cssText = 'font-size:13px;color:#5a6880;';
    s.textContent = sub;
    wrap.appendChild(g);
    wrap.appendChild(t);
    wrap.appendChild(s);
    card.appendChild(wrap);
  }

  function _body(card, text) {
    var p = document.createElement('p');
    p.style.cssText = 'font-size:13px;color:#94a3b8;line-height:1.65;margin:14px 0;text-align:center;';
    p.textContent = text;
    card.appendChild(p);
  }

  function _buttons(card, backFn, nextLabel, nextFn) {
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;margin-top:20px;';
    if (backFn) {
      var back = document.createElement('button');
      back.type = 'button';
      back.textContent = '← Back';
      back.style.cssText = [
        'flex:0 0 auto;padding:11px 18px;border-radius:12px;font-size:13px;font-family:inherit;cursor:pointer;',
        'background:transparent;border:1px solid rgba(30,144,255,0.2);color:#5a6880;transition:all 0.15s;',
      ].join('');
      back.addEventListener('click', backFn);
      row.appendChild(back);
    }
    var next = document.createElement('button');
    next.type = 'button';
    next.textContent = nextLabel || 'Next';
    next.style.cssText = [
      'flex:1;padding:12px 20px;border-radius:12px;font-size:14px;font-weight:700;font-family:inherit;cursor:pointer;',
      'background:#1e90ff;border:none;color:#fff;letter-spacing:0.04em;transition:background 0.15s;',
    ].join('');
    next.addEventListener('click', nextFn);
    row.appendChild(next);
    card.appendChild(row);
  }

  // ─── Apply preferences to modules ────────────────────────────────────────
  function _applyWakeName(name) {
    var wn = global.SRWakeName;
    if (wn && typeof wn.setWakeName === 'function') {
      wn.setWakeName(name, function () {});
    }
  }

  function _applyVoiceGender(gender) {
    var voices = global.SRVoice;
    if (voices && typeof voices.setVoiceGender === 'function') {
      voices.setVoiceGender(gender);
    }
    // Store as preference for use by voice engine
    try { localStorage.setItem('srVoiceGender', gender); } catch (e) {}
  }

  function _applyAllPrefs() {
    _applyWakeName(_prefs.wakeName);
    _applyVoiceGender(_prefs.voiceGender);

    // Apply memory preference to Shadow Reaper
    var sr = global.ShadowReaper;
    if (sr) {
      if (typeof sr.setMemoryEnabled === 'function')   sr.setMemoryEnabled(_prefs.memoryEnabled);
      if (typeof sr.setHistoryEnabled === 'function')  sr.setHistoryEnabled(_prefs.memoryEnabled);
      if (typeof sr.setAdaptiveEnabled === 'function') sr.setAdaptiveEnabled(_prefs.memoryEnabled);
    }

    try { localStorage.setItem('srSetupPrefs', JSON.stringify(_prefs)); } catch (e) {}
  }

  // ─── Dismiss ─────────────────────────────────────────────────────────────
  function _dismiss() {
    if (!_overlay) return;
    _overlay.style.opacity = '0';
    var el = _overlay;
    setTimeout(function () {
      try { el.remove(); } catch (e) {}
      _overlay = null;
    }, 300);
    if (_onComplete) {
      try { _onComplete(_prefs); } catch (e) {}
    }
  }

  // ─── Public API ───────────────────────────────────────────────────────────
  global.SRSetupWizard = {
    BUILD_ID:   BUILD_ID,
    isComplete: isComplete,
    show:       show,
    reset:      reset,
    markComplete: markComplete,
    getPrefs:   function () { return JSON.parse(JSON.stringify(_prefs)); },
  };

}(typeof window !== 'undefined' ? window : global));
