/**
 * shadow-reaper-v2/core/personality-engine.js
 * Shadow Reaper — Personality Engine
 *
 * Build: SR-V2-PERSONALITY-2
 *
 * Exposes: window.SRPersonality
 *
 * PURPOSE:
 *   Persistent Shadow Reaper personality layer.
 *   Adapts response tone, humor, formality, and style to the user
 *   through actual conversation — NOT a canned personality database.
 *
 * WHAT THIS MODULE DOES:
 *   - Maintains a lightweight "conversational preference profile" for each user.
 *   - Signals the appropriate response personality mode per-turn.
 *   - Tracks and adapts to: humor frequency, sarcasm tolerance, response length
 *     preference, formality level, casual language, correction patterns,
 *     playfulness, and topic-specific tone.
 *   - Detects when humor is appropriate or inappropriate given context.
 *   - Provides a per-turn "personality context" object that the response/model
 *     layer can use to shape responses naturally.
 *   - Integrates conversational cue data from SRConversationalCue.
 *   - Exposes Shadow's baseline personality traits to the generation layer.
 *   - Implements sarcasm scale (0–3): none / occasional / playful / strong.
 *   - Implements attitude matching: friendly→friendly, playful→playful, etc.
 *
 * PERSONALITY PROFILE FIELDS:
 *   humorFrequency      float 0-1  — how often humor is appropriate
 *   sarcasmTolerance    float 0-1  — willingness to use sarcasm
 *   casualness          float 0-1  — casual vs formal register
 *   preferredLength     'short'|'medium'|'long'
 *   playfulness         float 0-1
 *   directness          float 0-1  — direct vs elaborate answers
 *   technicalDepth      float 0-1  — surface vs deep technical detail
 *   correctionCount     int        — how many times user corrected Shadow
 *   jokeCount           int        — times user engaged positively with humor
 *   seriousTurnCount    int        — recent serious turns (suppress humor)
 *   conversationEnergy  float 0-1  — user's conversational energy level
 *   sarcasmPreference   int 0-3    — user sarcasm preference scale
 *   humorPreference     int 0-3    — user humor preference scale
 *   responseDirectness  float 0-1  — how direct the user wants answers
 *
 * STORAGE:
 *   Firestore: users/{uid}/shadowReaperPreferences/personality
 *   localStorage fallback: srPersonalityPrefs_{uid}
 *   Guest fallback: srPersonalityPrefs_guest
 *
 * One-brain rule: always ONE Shadow Reaper. This module is a pure
 * signal/preference layer — it never routes to a different AI.
 *
 * ZERO EXTERNAL AI CALLS. ZERO POLLING. ZERO setInterval.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-V2-PERSONALITY-2';

  // ─── Default profile ──────────────────────────────────────────────────────

  var DEFAULT_PROFILE = {
    humorFrequency:   0.35,   // moderate humor by default
    sarcasmTolerance: 0.25,   // light sarcasm only initially
    casualness:       0.60,   // conversational, not stiff
    playfulness:      0.30,
    directness:       0.65,   // lean direct but not blunt
    technicalDepth:   0.50,   // balanced
    preferredLength:  'medium',
    correctionCount:  0,
    jokeCount:        0,
    seriousTurnCount: 0,
    totalTurns:       0,
    // Stage 2 extensions
    conversationEnergy: 0.50, // user's typical energy level
    sarcasmPreference:  1,    // 0=none 1=occasional 2=playful 3=strong
    humorPreference:    1,    // 0=none 1=occasional 2=playful 3=strong
    responseDirectness: 0.65, // mirrors directness for explicit user-visible setting
  };

  // ─── Shadow's baseline personality traits ─────────────────────────────────
  // These describe WHO Shadow is at its core. They influence generation
  // but are NOT rigid rules — they shape the response naturally.
  // They do NOT change per user.
  var SHADOW_BASELINE_TRAITS = {
    confident:           true,
    loyal:               true,
    witty:               true,
    slightlySarcastic:   true,   // context-gated by seriousness
    curious:             true,
    direct:              true,
    protective:          true,
    conversational:      true,
    occasionallyMischievous: true,
  };

  // ─── Sarcasm scale mapping ─────────────────────────────────────────────────
  // Maps sarcasmPreference (0–3) to prompt instruction
  var SARCASM_SCALE = {
    0: 'No sarcasm — be direct and sincere.',
    1: 'Occasional light sarcasm when the moment genuinely calls for it.',
    2: 'Playful sarcasm and banter are welcome.',
    3: 'Strong wit and sarcasm — match the user\'s irreverent energy.',
  };

  // ─── Humor scale mapping ───────────────────────────────────────────────────
  var HUMOR_SCALE = {
    0: 'Avoid humor — keep it straight.',
    1: 'Light humor when it fits naturally.',
    2: 'A good dose of humor, dry wit welcome.',
    3: 'High humor — dry jokes, roasting, banter are all fair game.',
  };

  // ─── Humor suppression thresholds ────────────────────────────────────────
  var SERIOUS_TURN_SUPPRESS_THRESHOLD = 2;
  var HUMOR_DECAY_THRESHOLD = 5;

  // ─── Sensitivity patterns — topics where humor is NEVER appropriate ───────
  var SERIOUS_TOPIC_PATTERNS = [
    /\b(suicid|kill\s+myself|end\s+my\s+life|self.harm|depressed|depression|anxiety)\b/i,
    /\b(cancer|died|death|funeral|grieving|grief|loss of|passed away|dead)\b/i,
    /\b(abuse|assault|trauma|ptsd|domestic violence|rape|harassed)\b/i,
    /\b(fired|lost my job|got fired|evicted|homeless|bankrupt|court|arrested)\b/i,
    /\b(emergency|urgent|help me|need help|can.?t breathe|panic attack)\b/i,
    /\b(heartbroken|breakup|break up|divorce|cheated on|betrayed)\b/i,
  ];

  // Frustration signals — reduce humor but do NOT suppress entirely
  var FRUSTRATION_PATTERNS = [
    /\b(stupid|broken|not working|doesn.?t work|piece of|why the hell|wtf|what the)\b/i,
    /\b(frustrated|annoying|annoyed|pissed|fed up|giving up|stuck|can.?t figure)\b/i,
    /\b(crashed|error|bug|broke|failing|keeps failing|still not|again)\b/i,
  ];

  // Playful/casual signals — increase humor signal
  var PLAYFUL_PATTERNS = [
    /\b(lol|lmao|haha|hehe|funny|hilarious|that.?s great|nice one|good one)\b/i,
    /\b(joking|kidding|just messing|jk|sarcasm|sarcastic|banter|roast)\b/i,
    /\b(smartass|wise(ass|guy)|oh come on|seriously though|for real|come on now)\b/i,
  ];

  // Technical/focused signals — reduce humor, increase directness
  var TECHNICAL_PATTERNS = [
    /\b(error|exception|stack trace|undefined|null pointer|console|terminal|deploy|build)\b/i,
    /\b(firebase|react|node|python|javascript|typescript|css|html|api|endpoint|database)\b/i,
    /\b(circuit|resistor|capacitor|voltage|microcontroller|arduino|raspberry|gpio|solder)\b/i,
    /\b(code|function|variable|class|import|export|module|package|library|framework)\b/i,
  ];

  // ─── State ────────────────────────────────────────────────────────────────

  var _profile = Object.assign({}, DEFAULT_PROFILE);
  var _loaded  = false;

  // Track recent turn tones for humor context
  var _recentTones = [];  // last 6 turn tones
  var MAX_RECENT_TONES = 6;

  // ─── Firebase / storage helpers ───────────────────────────────────────────

  function _fa()  { return global.SRFirebaseAdapter || null; }

  function _uid() {
    var fa = _fa();
    return (fa && typeof fa.getUID === 'function') ? fa.getUID() : null;
  }

  function _localKey() {
    var uid = _uid();
    return uid ? ('srPersonalityPrefs_' + uid) : 'srPersonalityPrefs_guest';
  }

  function _readLocal() {
    try {
      var raw = global.localStorage && global.localStorage.getItem(_localKey());
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (_) { return null; }
  }

  function _writeLocal(prefs) {
    try {
      if (global.localStorage) {
        global.localStorage.setItem(_localKey(), JSON.stringify(prefs));
      }
    } catch (_) {}
  }

  function _firestoreRef() {
    var fa = _fa();
    var uid = _uid();
    if (!fa || !uid) return null;
    try {
      if (fa._db && typeof fa._db.doc === 'function') {
        return fa._db.doc('users/' + uid + '/shadowReaperPreferences/personality');
      }
    } catch (_) {}
    return null;
  }

  // ─── Load ─────────────────────────────────────────────────────────────────

  function load(callback) {
    callback = callback || function () {};

    // OFFLINE-FIRST: always apply local profile immediately.
    var local = _readLocal();
    if (local) _applyProfile(local);

    _loaded = true;

    var offState = global.SROfflineState;
    if (offState && typeof offState.setPersonalityLoaded === 'function') {
      try { offState.setPersonalityLoaded(true); } catch (_) {}
    }

    var ref = _firestoreRef();
    if (!ref) {
      callback(null, _getProfile());
      return;
    }

    ref.get().then(function (doc) {
      if (doc && doc.exists) {
        _applyProfile(doc.data() || {});
        _writeLocal(_getProfile());
      }
      callback(null, _getProfile());
    }).catch(function () {
      callback(null, _getProfile());
    });
  }

  function _applyProfile(data) {
    if (!data || typeof data !== 'object') return;
    var keys = Object.keys(DEFAULT_PROFILE);
    keys.forEach(function (k) {
      if (data[k] !== undefined && data[k] !== null) {
        _profile[k] = data[k];
      }
    });
  }

  function _getProfile() {
    return Object.assign({}, _profile);
  }

  // ─── Save ─────────────────────────────────────────────────────────────────

  function _save() {
    var prefs = _getProfile();
    _writeLocal(prefs);

    var ref = _firestoreRef();
    if (ref) {
      ref.set(prefs, { merge: true }).catch(function () {});
    }
  }

  // ─── Analyze turn for personality signals ─────────────────────────────────
  /**
   * analyzeTurn(text, understood, cue)
   *
   * Classifies the turn for personality context signals.
   * Optionally accepts a pre-computed conversational cue from SRConversationalCue.
   * Returns a personality context object for use by the response layer.
   *
   * Returns:
   *   {
   *     humorAppropriate:       boolean
   *     sarcasmAppropriate:     boolean
   *     playfulMode:            boolean
   *     seriousMode:            boolean
   *     technicalMode:          boolean
   *     frustratedMode:         boolean
   *     attitudeStyle:          string  — dominant attitude to match
   *     sarcasmLevel:           int 0-3 — current sarcasm level for this turn
   *     preferredLength:        'short'|'medium'|'long'
   *     directness:             float
   *     humorLevel:             float
   *     casualness:             float
   *     conversationalCue:      object  — full cue snapshot (may be null)
   *     shadowTraits:           object  — baseline Shadow personality traits
   *   }
   */
  function analyzeTurn(text, understood, cue) {
    if (!text) text = '';
    var lower = text.toLowerCase();
    var intent = (understood && understood.intent) || 'UNKNOWN';
    var tone   = (understood && understood.tone)   || 'neutral';

    // ── Absolute suppression check ────────────────────────────────────────
    var isAbsolutelySerious = SERIOUS_TOPIC_PATTERNS.some(function (p) { return p.test(lower); });
    if (isAbsolutelySerious) {
      _recordTone('serious');
      return _buildContext({
        seriousMode:        true,
        humorAppropriate:   false,
        sarcasmAppropriate: false,
        sarcasmLevel:       0,
        attitudeStyle:      'supportive',
        conversationalCue:  cue || null,
      });
    }

    // ── Signal detection ──────────────────────────────────────────────────
    var isFrustrated = FRUSTRATION_PATTERNS.some(function (p) { return p.test(lower); }) ||
                       tone === 'frustrated' || tone === 'angry';
    var isPlayful    = PLAYFUL_PATTERNS.some(function (p) { return p.test(lower); }) ||
                       tone === 'playful';
    var isTechnical  = TECHNICAL_PATTERNS.some(function (p) { return p.test(lower); });

    // Integrate conversational cue if available
    var cuePlayful     = cue && cue.tone === 'playful';
    var cueSarcastic   = cue && cue.tone === 'sarcastic';
    var cueFrustrated  = cue && cue.frustrationLikelihood >= 0.55;
    var cueExcited     = cue && cue.tone === 'excited';
    var cueSeriousShift = cue && cue.seriousness >= 0.60;

    // Merge cue signals
    if (cuePlayful || cueSarcastic) isPlayful = true;
    if (cueFrustrated) isFrustrated = true;

    // Intent-based seriousness
    var isIntentSerious = (intent === 'USER_CORRECTION' || tone === 'sad' ||
                           tone === 'anxious' || tone === 'angry' || cueSeriousShift);

    // Track tone for context window
    if (isPlayful || cueSarcastic) {
      _recordTone('playful');
    } else if (isFrustrated || isTechnical) {
      _recordTone('focused');
    } else if (isIntentSerious) {
      _recordTone('serious');
    } else {
      _recordTone(tone || 'neutral');
    }

    // Count recent serious turns from tone window
    var recentSeriousCount = _recentTones.slice(-4).filter(function (t) {
      return t === 'serious' || t === 'sad' || t === 'anxious' || t === 'angry';
    }).length;

    // ── Humor logic ───────────────────────────────────────────────────────
    var humorThreshold = isTechnical ? 0.60 : (isFrustrated ? 0.75 : 0.25);
    var humorSuppressed = (recentSeriousCount >= SERIOUS_TURN_SUPPRESS_THRESHOLD) ||
                          isIntentSerious;
    var humorAppropriate = !humorSuppressed &&
                           (_profile.humorFrequency >= humorThreshold) &&
                           !isFrustrated;

    if ((isPlayful || cuePlayful) && !humorSuppressed) {
      humorAppropriate = true;
    }

    // ── Sarcasm logic ─────────────────────────────────────────────────────
    // Sarcasm scale: consider both user profile preference and current cue
    var sarcasmAppropriate = humorAppropriate &&
                             _profile.sarcasmTolerance >= 0.30 &&
                             (isPlayful || cueSarcastic);

    // Compute current sarcasm level (0–3) for this turn
    var sarcasmLevel = 0;
    if (sarcasmAppropriate) {
      var sp = _profile.sarcasmPreference;
      // If cue shows high sarcasm likelihood, raise level by 1
      var cueBoost = (cue && cue.sarcasmLikelihood >= 0.50) ? 1 : 0;
      sarcasmLevel = Math.min(3, sp + cueBoost);
      // Never go above 2 unless user profile explicitly says 3
      if (sp < 3) sarcasmLevel = Math.min(2, sarcasmLevel);
    }
    // Seriousness override: hard limit sarcasm level
    if (recentSeriousCount >= SERIOUS_TURN_SUPPRESS_THRESHOLD) sarcasmLevel = 0;

    // ── Attitude matching ─────────────────────────────────────────────────
    // Maps the user's current tone to Shadow's response attitude.
    // Hostile input → confident/calm (never mirror hostility directly).
    // Genuine frustration → direct/helpful.
    var attitudeStyle = _mapAttitude(cue, tone, isPlayful, cueSarcastic,
                                     isFrustrated, cueExcited, isIntentSerious);

    return _buildContext({
      humorAppropriate:   humorAppropriate,
      sarcasmAppropriate: sarcasmAppropriate,
      sarcasmLevel:       sarcasmLevel,
      playfulMode:        isPlayful || cuePlayful,
      seriousMode:        isIntentSerious || recentSeriousCount >= SERIOUS_TURN_SUPPRESS_THRESHOLD,
      technicalMode:      isTechnical,
      frustratedMode:     isFrustrated,
      attitudeStyle:      attitudeStyle,
      conversationalCue:  cue || null,
    });
  }

  // ─── Attitude matching logic ──────────────────────────────────────────────
  // Returns one of: 'playful' | 'banter' | 'direct' | 'supportive' | 'energetic' | 'calm' | 'focused'

  function _mapAttitude(cue, srTone, isPlayful, cueSarcastic, isFrustrated, cueExcited, isIntentSerious) {
    // Seriousness overrides everything
    if (isIntentSerious) return 'supportive';
    if (cue && cue.seriousness >= 0.60) return 'supportive';

    // Genuine frustration → direct and helpful (not jokey)
    if (isFrustrated && !(cue && cue.humor >= 0.40)) return 'direct';

    // Banter / sarcastic → banter back (within reason)
    if (cueSarcastic || (cue && cue.sarcasmLikelihood >= 0.50)) return 'banter';

    // Playful → playful
    if (isPlayful || (cue && cue.tone === 'playful')) return 'playful';

    // Excited → energetic
    if (cueExcited || srTone === 'excited') return 'energetic';

    // Casual greeting → casual
    if (cue && cue.tone === 'casual') return 'casual';

    // Technical → focused
    if (srTone === 'technical') return 'focused';

    return 'calm';
  }

  // ─── Build context object ─────────────────────────────────────────────────

  function _buildContext(overrides) {
    var ctx = {
      humorAppropriate:   false,
      sarcasmAppropriate: false,
      sarcasmLevel:       0,
      playfulMode:        false,
      seriousMode:        false,
      technicalMode:      false,
      frustratedMode:     false,
      attitudeStyle:      'calm',
      preferredLength:    _profile.preferredLength,
      directness:         _profile.directness,
      humorLevel:         _profile.humorFrequency,
      casualness:         _profile.casualness,
      conversationalCue:  null,
      shadowTraits:       SHADOW_BASELINE_TRAITS,
      sarcasmPreference:  _profile.sarcasmPreference,
      humorPreference:    _profile.humorPreference,
      conversationEnergy: _profile.conversationEnergy,
    };
    return Object.assign(ctx, overrides);
  }

  function _recordTone(tone) {
    _recentTones.push(tone);
    if (_recentTones.length > MAX_RECENT_TONES) {
      _recentTones = _recentTones.slice(-MAX_RECENT_TONES);
    }
  }

  // ─── Learn from turn outcome ──────────────────────────────────────────────
  /**
   * learnFromTurn(userText, understood, assistantResponse)
   *
   * Called after each completed turn to adaptively update the personality profile.
   * Uses gradual confidence: one playful message does NOT permanently change profile.
   * Repeated patterns build confidence.
   *
   * LONG-TERM vs SHORT-TERM:
   *   Short-term: _recentTones (session only, cleared on new conversation)
   *   Long-term:  _profile (persisted per user, updated gradually)
   */
  function learnFromTurn(userText, understood, assistantResponse) {
    if (!userText) return;
    var lower = userText.toLowerCase();
    var intent = (understood && understood.intent) || 'UNKNOWN';
    var tone   = (understood && understood.tone)   || 'neutral';

    _profile.totalTurns++;

    // ── Humor engagement ──────────────────────────────────────────────────
    if (PLAYFUL_PATTERNS.some(function (p) { return p.test(lower); })) {
      _profile.jokeCount++;
      if (_profile.humorFrequency < 0.80) {
        _profile.humorFrequency = Math.min(0.80, _profile.humorFrequency + 0.04);
      }
      // Gradually raise humor preference level
      if (_profile.jokeCount >= 3 && _profile.humorPreference < 2) {
        _profile.humorPreference = Math.min(3, _profile.humorPreference + 1);
      }
    }

    // ── Sarcasm tolerance ─────────────────────────────────────────────────
    if (/\b(smartass|wise(ass|guy)|oh come on|sarcasm|sarcastic|banter)\b/i.test(lower)) {
      if (_profile.sarcasmTolerance < 0.80) {
        _profile.sarcasmTolerance = Math.min(0.80, _profile.sarcasmTolerance + 0.05);
      }
      // Raise sarcasmPreference level after repeated engagement
      if (_profile.sarcasmTolerance >= 0.50 && _profile.sarcasmPreference < 2) {
        _profile.sarcasmPreference = Math.min(3, _profile.sarcasmPreference + 1);
      }
    }

    // ── Correction → directness signal ───────────────────────────────────
    if (intent === 'USER_CORRECTION' ||
        /\b(no[,.]?\s*(i meant|that.?s not|that wasn.?t)|actually[,.]|correction[:]?|wait[,.]?\s+i meant)\b/i.test(lower)) {
      _profile.correctionCount++;
      if (_profile.directness < 0.90) {
        _profile.directness = Math.min(0.90, _profile.directness + 0.03);
      }
      _profile.responseDirectness = _profile.directness;
    }

    // ── Response length preference ────────────────────────────────────────
    var wordCount = userText.trim().split(/\s+/).length;
    if (wordCount <= 4 && _profile.totalTurns > 10) {
      var shortSignals = _recentTones.filter(function (t) { return t; }).length;
      if (shortSignals >= 4) {
        _profile.preferredLength = 'short';
      }
    } else if (wordCount >= 20 && _profile.preferredLength === 'short') {
      _profile.preferredLength = 'medium';
    }

    // ── Casual language ───────────────────────────────────────────────────
    if (/\b(gonna|wanna|gotta|ain.?t|kinda|sorta|ya|yep|nah|nope)\b/i.test(lower)) {
      if (_profile.casualness < 0.90) {
        _profile.casualness = Math.min(0.90, _profile.casualness + 0.02);
      }
    }

    // ── Technical depth ───────────────────────────────────────────────────
    if (TECHNICAL_PATTERNS.some(function (p) { return p.test(lower); })) {
      if (_profile.technicalDepth < 0.90) {
        _profile.technicalDepth = Math.min(0.90, _profile.technicalDepth + 0.02);
      }
    }

    // ── Conversation energy ────────────────────────────────────────────────
    // Short, punchy messages raise energy; long thoughtful ones lower it slightly
    if (wordCount <= 5) {
      _profile.conversationEnergy = Math.min(1.0, _profile.conversationEnergy + 0.02);
    } else if (wordCount >= 30) {
      _profile.conversationEnergy = Math.max(0.1, _profile.conversationEnergy - 0.01);
    }

    // ── Serious-mode tracking ─────────────────────────────────────────────
    if (tone === 'sad' || tone === 'anxious' || SERIOUS_TOPIC_PATTERNS.some(function (p) { return p.test(lower); })) {
      _profile.seriousTurnCount++;
    }

    // Save periodically — every 5 turns to avoid excessive writes
    if (_profile.totalTurns % 5 === 0) {
      _save();
    }
  }

  // ─── Build system prompt personality addendum ────────────────────────────
  /**
   * getPersonalityPromptAddendum(personalityCtx)
   *
   * Returns instruction string to inject into the generation system prompt.
   * Includes: Shadow baseline traits, sarcasm scale, attitude matching,
   * humor level, casualness, length preference, and seriousness override.
   *
   * This is specifically for the hosted/local model path.
   */
  function getPersonalityPromptAddendum(personalityCtx) {
    if (!personalityCtx) return '';

    var parts = [];

    // ── Shadow baseline personality ───────────────────────────────────────
    parts.push(
      'You are Shadow — confident, loyal, direct, witty, occasionally mischievous, and protective. ' +
      'You do not sound like customer support or a corporate chatbot. ' +
      'You speak naturally, with personality. ' +
      'You are an AI that speaks human-like — but you do not claim to be human.'
    );

    // ── Seriousness override — ALWAYS first, hardest constraint ──────────
    if (personalityCtx.seriousMode) {
      parts.push('The conversation has turned serious. Remove all sarcasm, jokes, and banter immediately. Be direct, warm, and supportive.');
      return parts.join(' ');
    }

    // ── Attitude / response style matching ────────────────────────────────
    var style = personalityCtx.attitudeStyle || 'calm';
    switch (style) {
      case 'playful':
        parts.push('The user is in a playful mood. Match that energy — be light, fun, and natural.');
        break;
      case 'banter':
        parts.push('The user is giving banter. You can give it back — smart, witty, slightly sarcastic. Stay warm underneath.');
        break;
      case 'energetic':
        parts.push('The user is excited and energetic. Match that vibe — be upbeat and engaged.');
        break;
      case 'direct':
        parts.push('The user is being direct or task-focused. Be equally direct. Skip the fluff.');
        break;
      case 'supportive':
        parts.push('The user may need support. Be genuine and direct. Skip humor.');
        break;
      case 'casual':
        parts.push('This is a casual, conversational exchange. Be natural and relaxed.');
        break;
      case 'focused':
        parts.push('The user is in focused/technical mode. Stay on-topic and precise.');
        break;
      default:
        parts.push('Conversational, direct, and real — not robotic.');
    }

    // ── Frustrated mode ───────────────────────────────────────────────────
    if (personalityCtx.frustratedMode) {
      parts.push('The user is frustrated. Acknowledge it briefly, then focus on actually solving the problem. Light humor only if it naturally reduces tension.');
    }

    // ── Technical mode ────────────────────────────────────────────────────
    if (personalityCtx.technicalMode) {
      parts.push('Focus on the technical topic. Be clear and precise.');
    }

    // ── Sarcasm level ─────────────────────────────────────────────────────
    var sarcasmLevel = personalityCtx.sarcasmLevel || 0;
    var sarcasmInstr = SARCASM_SCALE[sarcasmLevel];
    if (sarcasmInstr) parts.push(sarcasmInstr);

    // ── Humor ─────────────────────────────────────────────────────────────
    if (personalityCtx.humorAppropriate && !personalityCtx.seriousMode) {
      var humorPref = personalityCtx.humorPreference || 1;
      var humorInstr = HUMOR_SCALE[humorPref];
      if (humorInstr) parts.push(humorInstr);
    }

    // ── Length preference ─────────────────────────────────────────────────
    if (personalityCtx.preferredLength === 'short') {
      parts.push('Keep the response concise.');
    } else if (personalityCtx.preferredLength === 'long' || personalityCtx.technicalMode) {
      parts.push('Provide enough detail to actually be useful.');
    }

    // ── Casualness ────────────────────────────────────────────────────────
    if (personalityCtx.casualness >= 0.70) {
      parts.push('The user communicates casually — match that register.');
    }

    return parts.join(' ');
  }

  // ─── Get assistant display name for current session ───────────────────────

  function getAssistantName() {
    var wm = global.SRWakeName;
    if (wm && typeof wm.getWakeName === 'function') {
      return wm.getWakeName();
    }
    return 'Shadow';
  }

  // ─── User-facing preference setters ──────────────────────────────────────
  // These allow settings UI to set simple explicit preferences.
  // They take effect immediately and persist to storage.

  function setSarcasmPreference(level) {
    level = parseInt(level, 10);
    if (isNaN(level) || level < 0 || level > 3) return false;
    _profile.sarcasmPreference = level;
    // Sync to underlying sarcasmTolerance
    _profile.sarcasmTolerance = level === 0 ? 0.0 :
                                level === 1 ? 0.25 :
                                level === 2 ? 0.55 : 0.80;
    _save();
    return true;
  }

  function setHumorPreference(level) {
    level = parseInt(level, 10);
    if (isNaN(level) || level < 0 || level > 3) return false;
    _profile.humorPreference = level;
    _profile.humorFrequency = level === 0 ? 0.05 :
                              level === 1 ? 0.35 :
                              level === 2 ? 0.60 : 0.80;
    _save();
    return true;
  }

  function setAdaptiveEnabled(enabled) {
    // Stub for settings bridge — SRPersonality itself is always adaptive.
    // This allows a UI toggle to be wired without crashing.
    return true;
  }

  // ─── Reset profile ────────────────────────────────────────────────────────

  function resetProfile(callback) {
    _profile = Object.assign({}, DEFAULT_PROFILE);
    _recentTones = [];
    _writeLocal(_profile);
    var ref = _firestoreRef();
    if (ref) {
      ref.set(_profile, { merge: false }).then(function () {
        if (callback) callback(null);
      }).catch(function (err) {
        if (callback) callback(err);
      });
    } else {
      if (callback) callback(null);
    }
  }

  // ─── Status ───────────────────────────────────────────────────────────────

  function getStatus() {
    return {
      build:              BUILD_ID,
      loaded:             _loaded,
      profile:            _getProfile(),
      recentTones:        _recentTones.slice(),
      assistantName:      getAssistantName(),
      shadowTraits:       SHADOW_BASELINE_TRAITS,
      sarcasmScale:       SARCASM_SCALE,
    };
  }

  // ─── Expose ───────────────────────────────────────────────────────────────

  global.SRPersonality = {
    build:                      BUILD_ID,
    load:                       load,
    analyzeTurn:                analyzeTurn,
    learnFromTurn:              learnFromTurn,
    getPersonalityPromptAddendum: getPersonalityPromptAddendum,
    getAssistantName:           getAssistantName,
    getProfile:                 _getProfile,
    resetProfile:               resetProfile,
    getStatus:                  getStatus,
    setSarcasmPreference:       setSarcasmPreference,
    setHumorPreference:         setHumorPreference,
    setAdaptiveEnabled:         setAdaptiveEnabled,
    shadowTraits:               SHADOW_BASELINE_TRAITS,
  };

})(typeof window !== 'undefined' ? window : global);
