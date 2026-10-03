/**
 * shadow-reaper-v2/core/sr-conversational-cue.js
 * Shadow Reaper — Conversational Cue Analyzer
 *
 * Build: SR-V2-CONV-CUE-1
 *
 * Exposes: window.SRConversationalCue
 *
 * PURPOSE:
 *   Analyzes HOW the user is communicating, not just WHAT they said.
 *   Produces a per-turn "cue snapshot" that describes the conversational
 *   tone, energy, and likely intent so the personality layer can shape
 *   Shadow's response style naturally.
 *
 * KEY DESIGN RULES:
 *   - These are BEHAVIORAL ESTIMATES — not facts about the user's emotions.
 *   - Context window (recent turns) matters. "I hate this 😂" ≠ "I hate everything."
 *   - A single message never permanently changes user preferences.
 *   - Seriousness override: genuinely serious context reduces sarcasm/humor automatically.
 *   - Voice pipeline uses the same path — no separate personality branch.
 *   - Does NOT create a second brain. Does NOT replace ShadowReaper.ask().
 *
 * CUE SNAPSHOT SHAPE:
 *   {
 *     tone:                 string  — dominant tone ('playful'|'sarcastic'|'frustrated'|
 *                                     'excited'|'serious'|'casual'|'direct'|'sad'|'neutral')
 *     intensity:            float   — 0.0–1.0 strength of detected tone
 *     sarcasmLikelihood:    float   — 0.0–1.0 probability sarcasm is present
 *     frustrationLikelihood:float   — 0.0–1.0 probability of frustration
 *     seriousness:          float   — 0.0–1.0 seriousness level (0=very casual, 1=very serious)
 *     humor:                float   — 0.0–1.0 humor/playfulness signal
 *     excitement:           float   — 0.0–1.0 excitement signal
 *     preferredResponseStyle: string — 'playful'|'banter'|'direct'|'supportive'|'calm'|'focused'
 *     contextConfidence:    float   — 0.0–1.0 confidence after context window analysis
 *     emojiCount:           int     — emoji count in message
 *     shortMessage:         bool    — message is ≤6 words
 *   }
 *
 * VOICE PROSODY METADATA (future TTS):
 *   cueSnapshot also carries:
 *     responseMood:    string — suggested TTS mood hint
 *     energy:          float  — suggested TTS energy level
 *     humorLevel:      float  — humor level hint for TTS
 *
 * ZERO EXTERNAL AI CALLS. ZERO POLLING. ZERO setInterval.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-V2-CONV-CUE-1';

  // ─── Emoji detection ─────────────────────────────────────────────────────────
  // Matches common emoji ranges; good enough for cue analysis without a full
  // unicode library. Does NOT need to be exhaustive.
  var EMOJI_RE = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F02F}\u{FE00}-\u{FE0F}😀-🙏🌀-🗿🚀-🛿🇦-🏿]/gu;

  // ─── Laughing / humor markers ────────────────────────────────────────────────
  var LAUGH_RE = /\b(lol|lmao|lmfao|rofl|haha|hehe|heh|ha|😂|🤣|😄|😆|xd)\b/i;

  // ─── Playful / teasing signals ───────────────────────────────────────────────
  var PLAYFUL_RE = /\b(joking|kidding|jk|just mess|messing with|banter|roast|you had one job|oh come on|gotcha|gotchu|ok smartass|okay smartass|smartass|wiseguy|wiseass|oh please|for real though|seriously though|cmon|c'mon)\b/i;

  // ─── Sarcasm signals ────────────────────────────────────────────────────────
  // Phrases that strongly suggest sarcasm or irony
  var SARCASM_STRONG_RE = /\b(oh yeah sure|oh yeah right|yeah right|oh sure|totally|suuure|riiight|riight|oh brilliant|brilliant move|great job|nice job genius|way to go|that makes sense|makes total sense|obviously|clearly|naturally|good luck with that|best idea ever|oh wow cool|wow thanks|thanks a lot)\b/i;

  // ─── Frustration signals ────────────────────────────────────────────────────
  var FRUSTRATION_RE = /\b(stupid|broken|not working|doesn.?t work|piece of (crap|junk|garbage|trash|shit)|why the hell|wtf|what the|this is dumb|so annoying|pissing me off|getting on my nerves|driving me crazy|fed up|can.?t figure|still not working|keeps (failing|crashing|breaking|doing this)|i.?ve (tried|done) this (multiple|several|so many|too many|a hundred|six|five|four|three|twice|again)|again and again|over and over)\b/i;

  // ─── Excitement / energy signals ─────────────────────────────────────────────
  var EXCITEMENT_RE = /\b(omg|oh my god|oh my gosh|wow|woah|whoa|yesss|yasss|let.?s go|finally|this is amazing|this is crazy|can.?t believe|dude|bro|sis|no way|for real|oh snap|lit|fire|🔥|💯|🎉|🙌)\b/i;

  // ─── "Seriously" / tone-shift signals ───────────────────────────────────────
  var SERIOUS_SHIFT_RE = /\b(i.?m being serious|no seriously|okay seriously|but seriously|for real though|i really need|this is important|i need help|please help|i.?m not joking)\b/i;

  // ─── Casual / social greeting signals ───────────────────────────────────────
  var CASUAL_GREETING_RE = /\b(yo|hey|sup|what.?s good|what.?s up|what up|whaddup|howdy|hiya|heya|aye|wyd|you good|you okay|you there|you behaving)\b/i;

  // ─── Direct / short command energy ───────────────────────────────────────────
  var DIRECT_RE = /^(what|how|when|where|who|why|tell me|show me|find|get|calculate|define|search|look up|what.?s)\b/i;

  // ─── Absolute seriousness (humor suppressed entirely) ────────────────────────
  var ABSOLUTE_SERIOUS_RE = [
    /\b(suicid|kill\s+myself|end\s+my\s+life|self.harm|depressed|depression|anxiety)\b/i,
    /\b(cancer|died|death|funeral|grieving|grief|loss of|passed away|dead)\b/i,
    /\b(abuse|assault|trauma|ptsd|domestic violence|rape|harassed)\b/i,
    /\b(fired|lost my job|got fired|evicted|homeless|bankrupt|court|arrested)\b/i,
    /\b(emergency|urgent|can.?t breathe|panic attack)\b/i,
    /\b(heartbroken|breakup|break up|divorce|cheated on|betrayed)\b/i,
  ];

  // ─── Context window ───────────────────────────────────────────────────────────
  // Keep last 6 cue snapshots for context window analysis
  var _history = [];
  var MAX_HISTORY = 6;

  function _recordCue(cue) {
    _history.push({
      tone:      cue.tone,
      seriousness: cue.seriousness,
      humor:     cue.humor,
      frustration: cue.frustrationLikelihood,
    });
    if (_history.length > MAX_HISTORY) {
      _history = _history.slice(-MAX_HISTORY);
    }
  }

  // ─── Count emojis ─────────────────────────────────────────────────────────────

  function _countEmoji(text) {
    var matches = text.match(EMOJI_RE);
    return matches ? matches.length : 0;
  }

  // ─── Context window analysis ─────────────────────────────────────────────────
  // Returns aggregated signals from recent turns to inform current cue

  function _getContextSignals() {
    if (!_history.length) return { avgSeriousness: 0, recentPlayful: 0, recentFrustration: 0 };
    var recent = _history.slice(-4);
    var totalSerious = 0;
    var playfulCount = 0;
    var frustrationCount = 0;
    recent.forEach(function (h) {
      totalSerious += (h.seriousness || 0);
      if (h.tone === 'playful' || h.tone === 'sarcastic') playfulCount++;
      if (h.frustration >= 0.5) frustrationCount++;
    });
    return {
      avgSeriousness: totalSerious / recent.length,
      recentPlayful:  playfulCount,
      recentFrustration: frustrationCount,
    };
  }

  // ─── Main analysis function ───────────────────────────────────────────────────

  /**
   * analyze(text, understood, recentTurns)
   *
   * text         — raw user message text
   * understood   — object from SRUnderstanding.understand() (intent, tone, etc.)
   * recentTurns  — optional array of recent { role, text } session turns
   *
   * Returns: cueSnapshot object
   */
  function analyze(text, understood, recentTurns) {
    if (!text) text = '';
    var lower = text.toLowerCase();
    var intent = (understood && understood.intent) || 'UNKNOWN';
    var srTone = (understood && understood.tone)   || 'neutral';
    recentTurns = recentTurns || [];

    // ── 1. Absolute seriousness check ──────────────────────────────────────────
    var isAbsolutelySerious = ABSOLUTE_SERIOUS_RE.some(function (p) { return p.test(lower); });
    if (isAbsolutelySerious) {
      var seriousCue = _makeCue({
        tone:                   'serious',
        intensity:              1.0,
        sarcasmLikelihood:      0.0,
        frustrationLikelihood:  0.0,
        seriousness:            1.0,
        humor:                  0.0,
        excitement:             0.0,
        preferredResponseStyle: 'supportive',
        contextConfidence:      1.0,
        emojiCount:             _countEmoji(text),
        shortMessage:           text.trim().split(/\s+/).length <= 6,
      });
      _recordCue(seriousCue);
      return seriousCue;
    }

    // ── 2. Signal detection ─────────────────────────────────────────────────────
    var emojiCount  = _countEmoji(text);
    var wordCount   = text.trim().split(/\s+/).length;
    var shortMsg    = wordCount <= 6;

    var hasLaugh       = LAUGH_RE.test(lower) || emojiCount >= 1;
    var hasPlayful     = PLAYFUL_RE.test(lower);
    var hasSarcasm     = SARCASM_STRONG_RE.test(lower);
    var hasFrustration = FRUSTRATION_RE.test(lower);
    var hasExcitement  = EXCITEMENT_RE.test(lower);
    var hasSeriousShift = SERIOUS_SHIFT_RE.test(lower);
    var hasCasualGreet  = CASUAL_GREETING_RE.test(lower);
    var hasDirectOpener = DIRECT_RE.test(text.trim());

    // Emoji count boosts humor signal but disambiguates with text
    // "I hate this 😂" → laugh emoji indicates it's NOT genuine hatred
    var laughEmojiInFrustration = hasFrustration && (LAUGH_RE.test(lower) || emojiCount >= 1);

    // ── 3. Sarcasm likelihood ────────────────────────────────────────────────────
    // Pure pattern sarcasm + laugh emoji context boost
    var sarcasmScore = 0;
    if (hasSarcasm)  sarcasmScore += 0.55;
    if (hasPlayful)  sarcasmScore += 0.20;
    if (hasLaugh)    sarcasmScore += 0.15;
    // Sarcasm from understanding engine tone
    if (srTone === 'sarcastic') sarcasmScore += 0.30;
    // Capitalization as irony signal: "GREAT job"
    if (/[A-Z]{3,}/.test(text) && hasSarcasm) sarcasmScore += 0.15;
    sarcasmScore = Math.min(1.0, sarcasmScore);

    // ── 4. Frustration likelihood ─────────────────────────────────────────────
    var frustrationScore = 0;
    if (hasFrustration && !laughEmojiInFrustration) frustrationScore += 0.70;
    if (hasFrustration && laughEmojiInFrustration)  frustrationScore += 0.15; // mostly humor
    if (srTone === 'frustrated' || srTone === 'angry') frustrationScore += 0.30;
    // Context window: if previous turns also had frustration, raise confidence
    var ctxSignals = _getContextSignals();
    if (ctxSignals.recentFrustration >= 2) frustrationScore = Math.min(1.0, frustrationScore + 0.20);
    frustrationScore = Math.min(1.0, frustrationScore);

    // ── 5. Humor / playfulness ────────────────────────────────────────────────
    var humorScore = 0;
    if (hasLaugh)    humorScore += 0.45;
    if (hasPlayful)  humorScore += 0.35;
    if (emojiCount >= 2) humorScore += 0.10;
    if (hasCasualGreet)  humorScore += 0.15;
    // laugh emoji in "frustrated" message → mostly humor
    if (laughEmojiInFrustration) humorScore += 0.40;
    if (srTone === 'playful')    humorScore += 0.25;
    humorScore = Math.min(1.0, humorScore);

    // ── 6. Seriousness ────────────────────────────────────────────────────────
    var seriousnessScore = 0;
    if (hasSeriousShift)   seriousnessScore += 0.70;
    if (srTone === 'sad' || srTone === 'anxious')   seriousnessScore += 0.50;
    if (intent === 'USER_CORRECTION')  seriousnessScore += 0.20;
    // Reduce seriousness when laugh/play signals present
    seriousnessScore = Math.max(0, seriousnessScore - humorScore * 0.50);
    // Context window: recent average seriousness lifts current
    seriousnessScore = Math.min(1.0, seriousnessScore + ctxSignals.avgSeriousness * 0.20);

    // ── 7. Excitement ─────────────────────────────────────────────────────────
    var excitementScore = 0;
    if (hasExcitement)       excitementScore += 0.60;
    if (emojiCount >= 3)     excitementScore += 0.15;
    if (text.indexOf('!') !== -1) excitementScore += 0.10;
    if (srTone === 'excited') excitementScore += 0.25;
    excitementScore = Math.min(1.0, excitementScore);

    // ── 8. Dominant tone ──────────────────────────────────────────────────────
    var tone = 'neutral';
    var intensity = 0.3;

    if (seriousnessScore >= 0.60) {
      tone = 'serious'; intensity = seriousnessScore;
    } else if (frustrationScore >= 0.55 && !laughEmojiInFrustration) {
      tone = 'frustrated'; intensity = frustrationScore;
    } else if (sarcasmScore >= 0.50) {
      tone = 'sarcastic'; intensity = sarcasmScore;
    } else if (humorScore >= 0.45) {
      tone = 'playful'; intensity = humorScore;
    } else if (excitementScore >= 0.45) {
      tone = 'excited'; intensity = excitementScore;
    } else if (hasCasualGreet || (shortMsg && emojiCount === 0 && !hasDirectOpener)) {
      tone = 'casual'; intensity = 0.50;
    } else if (hasDirectOpener && !hasCasualGreet) {
      tone = 'direct'; intensity = 0.55;
    } else if (srTone !== 'neutral' && srTone !== 'UNKNOWN') {
      tone = srTone; intensity = 0.45;
    }

    // ── 9. Preferred response style ────────────────────────────────────────────
    var style = _mapToResponseStyle(tone, sarcasmScore, humorScore, frustrationScore, seriousnessScore, ctxSignals);

    // ── 10. Context confidence boost ────────────────────────────────────────────
    var contextConfidence = 0.5;
    if (recentTurns.length >= 3) contextConfidence += 0.20;
    if (ctxSignals.recentPlayful >= 2 && tone === 'playful') contextConfidence += 0.20;
    if (ctxSignals.recentFrustration >= 2 && tone === 'frustrated') contextConfidence += 0.20;
    contextConfidence = Math.min(1.0, contextConfidence);

    var cue = _makeCue({
      tone:                   tone,
      intensity:              Math.round(intensity * 100) / 100,
      sarcasmLikelihood:      Math.round(sarcasmScore * 100) / 100,
      frustrationLikelihood:  Math.round(frustrationScore * 100) / 100,
      seriousness:            Math.round(seriousnessScore * 100) / 100,
      humor:                  Math.round(humorScore * 100) / 100,
      excitement:             Math.round(excitementScore * 100) / 100,
      preferredResponseStyle: style,
      contextConfidence:      Math.round(contextConfidence * 100) / 100,
      emojiCount:             emojiCount,
      shortMessage:           shortMsg,
    });

    _recordCue(cue);
    return cue;
  }

  // ─── Map tone to preferred response style ─────────────────────────────────────

  function _mapToResponseStyle(tone, sarcasm, humor, frustration, seriousness, ctxSignals) {
    // Seriousness override — always wins
    if (seriousness >= 0.60) return 'supportive';

    // Genuine frustration → direct and helpful
    if (tone === 'frustrated' || frustration >= 0.55) return 'direct';

    // Playful/sarcastic context → allow banter
    if (tone === 'sarcastic') return 'banter';
    if (tone === 'playful' || humor >= 0.40) return 'playful';

    // Excited → energetic
    if (tone === 'excited') return 'energetic';

    // Casual greeting → casual
    if (tone === 'casual') return 'casual';

    // Direct questions → direct
    if (tone === 'direct') return 'direct';

    // Multi-turn playful context → stay playful even for neutral messages
    if (ctxSignals.recentPlayful >= 2) return 'playful';

    return 'calm';
  }

  // ─── CUE FACTORY ─────────────────────────────────────────────────────────────

  function _makeCue(fields) {
    var cue = Object.assign({
      tone:                   'neutral',
      intensity:              0.3,
      sarcasmLikelihood:      0.0,
      frustrationLikelihood:  0.0,
      seriousness:            0.0,
      humor:                  0.0,
      excitement:             0.0,
      preferredResponseStyle: 'calm',
      contextConfidence:      0.5,
      emojiCount:             0,
      shortMessage:           false,
    }, fields);

    // Voice prosody metadata (future TTS use)
    cue.responseMood = cue.tone;
    cue.energy       = Math.min(1.0, cue.humor * 0.7 + cue.excitement * 0.3);
    cue.humorLevel   = cue.humor;

    return cue;
  }

  // ─── Reset context window ─────────────────────────────────────────────────────

  function resetHistory() {
    _history = [];
  }

  // ─── Status ───────────────────────────────────────────────────────────────────

  function getStatus() {
    return {
      build:          BUILD_ID,
      historyLength:  _history.length,
      recentHistory:  _history.slice(-3),
    };
  }

  // ─── Expose ───────────────────────────────────────────────────────────────────

  global.SRConversationalCue = {
    build:        BUILD_ID,
    analyze:      analyze,
    resetHistory: resetHistory,
    getStatus:    getStatus,
  };

})(typeof window !== 'undefined' ? window : global);
