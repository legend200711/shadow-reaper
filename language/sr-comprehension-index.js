/**
 * shadow-reaper-v2/language/sr-comprehension-index.js
 * Shadow Reaper — Language Comprehension Index
 *
 * Build: SR-COMPREHENSION-1
 *
 * Exposes: window.SRComprehension
 *
 * PURPOSE:
 *   Bridge between the raw Language Foundation (vocab-index.json) and the
 *   ShadowReaper.ask() pipeline.  This is LANGUAGE INFRASTRUCTURE — not
 *   a second AI and not a second brain.
 *
 *   It organises existing Language Foundation data into structures that
 *   ShadowReaper can query efficiently at conversation time:
 *
 *   Language Foundation
 *        ↓
 *   SRComprehension  (this module)
 *        ↓
 *   ShadowReaper.ask()
 *
 * CAPABILITIES:
 *   1. Word-sense disambiguation using surrounding context
 *   2. Sentence structure extraction (Actor/Action/Object/Modifier/Recipient/Time)
 *   3. Phrase comprehension (multi-word idiom detection)
 *   4. Contextual sense scoring (confidence-rated)
 *   5. Number-type context classification
 *   6. Question type → expected answer type
 *   7. Unknown word best-effort interpretation
 *   8. Adaptive sense learning (user-specific corrections)
 *
 * INTEGRATION:
 *   SRComprehension.analyze(text, langAnalysis, context)
 *   Returns: ComprehensionResult attached to the message pipeline.
 *
 *   SRLanguage.analyze() ALREADY runs; SRComprehension.analyze() is called
 *   AFTER it, enriching the result — not replacing it.
 *
 * ARCHITECTURE RULE:
 *   One AI: ShadowReaper.
 *   This module is pure language infrastructure.
 *   No hosted AI. No external calls. Offline first.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-COMPREHENSION-1';

  // ─── Dependency accessors ─────────────────────────────────────────────────
  function _mor()   { return global.SRMorphology;    }
  function _tok()   { return global.SRTokenizer;     }
  function _rel()   { return global.SRRelationships; }
  function _phr()   { return global.SRPhrases;       }
  function _sense() { return global.SRSenseIndex;    }
  function _num()   { return global.SRNumberIntelligence; }

  // ─── Question type → expected answer type ────────────────────────────────
  var QUESTION_TYPES = {
    WHAT:    { pattern: /^what\b/i,          answerType: 'definition_or_fact' },
    WHO:     { pattern: /^who\b/i,           answerType: 'person_or_entity' },
    WHERE:   { pattern: /^where\b/i,         answerType: 'location' },
    WHEN:    { pattern: /^when\b/i,          answerType: 'time_or_date' },
    WHY:     { pattern: /^why\b/i,           answerType: 'reason_or_cause' },
    HOW:     { pattern: /^how\b/i,           answerType: 'method_or_quantity' },
    WHICH:   { pattern: /^which\b/i,         answerType: 'selection' },
    CAN:     { pattern: /^can\b/i,           answerType: 'capability_yesno' },
    SHOULD:  { pattern: /^should\b/i,        answerType: 'recommendation_yesno' },
    IS_ARE:  { pattern: /^(is|are)\b/i,      answerType: 'factual_yesno' },
    DO_DOES: { pattern: /^(do|does|did)\b/i, answerType: 'factual_yesno' },
    WILL:    { pattern: /^(will|would)\b/i,  answerType: 'future_or_conditional' },
  };

  // ─── Idiom / phrase comprehension table ──────────────────────────────────
  // Multi-word phrases whose meaning cannot be inferred from individual words.
  // label = internal semantic label (NOT a response — used for inference only)
  var IDIOMS = [
    // Time / schedule
    { phrase:'running late',     label:'behind_schedule',    domain:'time' },
    { phrase:'running behind',   label:'behind_schedule',    domain:'time' },
    { phrase:'short on time',    label:'time_pressure',      domain:'time' },
    { phrase:'out of time',      label:'no_time_remaining',  domain:'time' },
    { phrase:'in time',          label:'on_schedule',        domain:'time' },
    { phrase:'ahead of time',    label:'early',              domain:'time' },
    { phrase:'on time',          label:'punctual',           domain:'time' },
    { phrase:'at the same time', label:'simultaneously',     domain:'time' },

    // Status / state
    { phrase:'out of order',     label:'not_functioning',    domain:'state' },
    { phrase:'out of service',   label:'not_functioning',    domain:'state' },
    { phrase:'up and running',   label:'operational',        domain:'state' },
    { phrase:'break down',       label:'cease_functioning',  domain:'state' },
    { phrase:'broke down',       label:'ceased_functioning', domain:'state' },
    { phrase:'breaking down',    label:'ceasing_to_function',domain:'state' },
    { phrase:'died on me',       label:'ceased_functioning', domain:'state' },
    { phrase:'gave out',         label:'ceased_functioning', domain:'state' },
    { phrase:'bit the dust',     label:'ceased_functioning', domain:'state' },
    { phrase:'kicked the bucket',label:'died',               domain:'state' },
    { phrase:'acting up',        label:'malfunctioning',     domain:'state' },

    // Comprehension / understanding
    { phrase:'figure out',       label:'determine_or_solve', domain:'cognitive' },
    { phrase:'figured out',      label:'determined_or_solved',domain:'cognitive' },
    { phrase:'make sense',       label:'be_comprehensible',  domain:'cognitive' },
    { phrase:'makes sense',      label:'is_comprehensible',  domain:'cognitive' },
    { phrase:'lose track',       label:'forget_or_miss',     domain:'cognitive' },
    { phrase:'lost track',       label:'forgot_or_missed',   domain:'cognitive' },
    { phrase:'keep track',       label:'monitor_or_remember',domain:'cognitive' },
    { phrase:'come up with',     label:'invent_or_produce',  domain:'cognitive' },

    // Communication
    { phrase:'get back to',      label:'respond_later',      domain:'communication' },
    { phrase:'get back to you',  label:'respond_later',      domain:'communication' },
    { phrase:'look into',        label:'investigate',        domain:'communication' },
    { phrase:'look it up',       label:'search_for_info',    domain:'communication' },
    { phrase:'look up',          label:'search_for_info',    domain:'communication' },
    { phrase:'bring up',         label:'mention_topic',      domain:'communication' },
    { phrase:'point out',        label:'highlight_fact',     domain:'communication' },
    { phrase:'turn out',         label:'ultimately_be',      domain:'communication' },

    // Direction / action
    { phrase:'give up',          label:'stop_trying',        domain:'action' },
    { phrase:'gave up',          label:'stopped_trying',     domain:'action' },
    { phrase:'giving up',        label:'stopping_trying',    domain:'action' },
    { phrase:'pick up',          label:'collect_or_resume',  domain:'action' },
    { phrase:'hang on',          label:'wait_or_hold',       domain:'action' },
    { phrase:'hold on',          label:'wait_or_hold',       domain:'action' },
    { phrase:'take care',        label:'farewell_or_manage', domain:'action' },
    { phrase:'take care of',     label:'handle_or_manage',   domain:'action' },
    { phrase:'set up',           label:'configure_or_arrange',domain:'action' },
    { phrase:'shut down',        label:'stop_or_close',      domain:'tech_action' },
    { phrase:'turn on',          label:'activate',           domain:'tech_action' },
    { phrase:'turn off',         label:'deactivate',         domain:'tech_action' },
    { phrase:'log in',           label:'authenticate',       domain:'tech_action' },
    { phrase:'log out',          label:'end_session',        domain:'tech_action' },
    { phrase:'sign in',          label:'authenticate',       domain:'tech_action' },
    { phrase:'sign out',         label:'end_session',        domain:'tech_action' },
    { phrase:'sign up',          label:'register',           domain:'tech_action' },
    { phrase:'back up',          label:'create_backup',      domain:'tech_action' },

    // Emotional
    { phrase:'stressed out',     label:'highly_stressed',    domain:'emotion' },
    { phrase:'worn out',         label:'exhausted',          domain:'emotion' },
    { phrase:'burned out',       label:'severely_exhausted', domain:'emotion' },
    { phrase:'fed up',           label:'exasperated',        domain:'emotion' },
    { phrase:'freaking out',     label:'panicking',          domain:'emotion' },
    { phrase:'losing it',        label:'losing_composure',   domain:'emotion' },
  ];

  // Build idiom index by first word for O(1) lookup
  var _idiomsByFirst = {};
  IDIOMS.forEach(function (idiom) {
    var first = idiom.phrase.split(' ')[0];
    if (!_idiomsByFirst[first]) _idiomsByFirst[first] = [];
    _idiomsByFirst[first].push(idiom);
  });

  // ─── Sentence structure patterns ──────────────────────────────────────────
  // Used to extract Actor/Action/Object from simple sentences.
  // Not a full grammar parser — supplements the pipeline structurally.
  var STRUCT_PATTERNS = [
    // "X gave/sent/showed Y to/for Z"
    { re: /^([A-Za-z]+)\s+(gave|sent|showed|gave|passed|handed)\s+(?:the\s+)?([A-Za-z\s]+?)\s+to\s+([A-Za-z]+)/i,
      roles: ['actor','action','object','recipient'] },
    // "X verb-ed the Y"
    { re: /^([A-Za-z]+)\s+([a-z]+ed|[a-z]+s)\s+(?:a|an|the)?\s*([A-Za-z\s]+)/i,
      roles: ['actor','action','object'] },
    // "The Y of X" — possessive/relationship
    { re: /^(?:the\s+)?([A-Za-z]+)\s+of\s+([A-Za-z\s]+)/i,
      roles: ['attribute','owner'] },
  ];

  // ─── Detect idioms in text ─────────────────────────────────────────────────
  /**
   * detectIdioms(text)
   * Returns array of { phrase, label, domain, position } for each idiom found.
   */
  function detectIdioms(text) {
    if (!text) return [];
    var lower   = text.toLowerCase();
    var words   = lower.split(/\s+/);
    var results = [];
    var seen    = new Set();

    words.forEach(function (word) {
      var candidates = _idiomsByFirst[word] || [];
      candidates.forEach(function (idiom) {
        if (!seen.has(idiom.phrase) && lower.indexOf(idiom.phrase) !== -1) {
          seen.add(idiom.phrase);
          results.push({
            phrase:   idiom.phrase,
            label:    idiom.label,
            domain:   idiom.domain,
            position: lower.indexOf(idiom.phrase),
          });
        }
      });
    });

    // Sort by position in text
    results.sort(function (a, b) { return a.position - b.position; });
    return results;
  }

  // ─── Detect question type ─────────────────────────────────────────────────
  /**
   * classifyQuestion(text)
   * Returns { type, answerType } or null if not a question.
   */
  function classifyQuestion(text) {
    if (!text) return null;
    var t = text.trim();
    if (!/\?$/.test(t) && !/^(what|who|where|when|why|how|which|can|should|is|are|do|does|did|will|would)\b/i.test(t)) {
      return null;
    }
    var lower = t.toLowerCase();
    var qtypes = Object.keys(QUESTION_TYPES);
    for (var i = 0; i < qtypes.length; i++) {
      var qt = QUESTION_TYPES[qtypes[i]];
      if (qt.pattern.test(lower)) {
        return { type: qtypes[i], answerType: qt.answerType };
      }
    }
    return { type: 'UNKNOWN', answerType: 'general' };
  }

  // ─── Extract sentence structure ───────────────────────────────────────────
  /**
   * extractStructure(text)
   * Attempt to extract Actor/Action/Object/Modifiers from a sentence.
   * Not perfect — used as additional context, never blocks a response.
   *
   * Returns { actor, action, object, recipient, modifiers, time } (all nullable)
   */
  function extractStructure(text) {
    if (!text) return {};
    var result = { actor:null, action:null, object:null, recipient:null, modifiers:[], time:null };

    var t = text.trim();

    // Time extraction (simple)
    var timeMatch = t.match(
      /\b(yesterday|today|tomorrow|last\s+\w+|next\s+\w+|this\s+\w+|\d{1,2}[:/]\d{2}|\d{1,2}\s+(?:am|pm)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|morning|afternoon|evening|night|recently|earlier|later)\b/i
    );
    if (timeMatch) result.time = timeMatch[1].toLowerCase();

    // Modifier extraction (adjectives before nouns)
    var modifiers = [];
    var adjectiveMatch = t.match(/\b(blue|red|green|black|white|dark|light|big|small|fast|slow|new|old|broken|working|good|bad|main|old|large|small|old|broken|dead|fast)\b/gi);
    if (adjectiveMatch) result.modifiers = adjectiveMatch.map(function(m){ return m.toLowerCase(); });

    // Try structural patterns
    for (var i = 0; i < STRUCT_PATTERNS.length; i++) {
      var p = STRUCT_PATTERNS[i];
      var m = t.match(p.re);
      if (m) {
        p.roles.forEach(function (role, idx) {
          if (m[idx + 1]) result[role] = m[idx + 1].trim().toLowerCase();
        });
        return result;
      }
    }

    // Heuristic: subject-verb-object from first few content words
    var mor = _mor();
    var tok = _tok();
    if (tok && mor) {
      var tokens = tok.tokenize(t);
      var contentWords = tokens.tokens.filter(function (tk) {
        return tk.isWord && !tk.isStop && tk.normal.length >= 2;
      });
      if (contentWords.length >= 2) {
        var firstPos = mor.getPos(contentWords[0].normal);
        var secondPos = mor.getPos(contentWords[1] ? contentWords[1].normal : '');
        // If first word looks like a proper noun (capitalized, position 0), it's likely actor
        if (/^[A-Z]/.test(tokens.tokens[0] ? tokens.tokens[0].raw : '')) {
          result.actor = contentWords[0].normal;
          if (contentWords[1] && (secondPos === 'verb' || firstPos === 'verb')) {
            result.action = contentWords[1].normal;
            if (contentWords[2]) result.object = contentWords[2].normal;
          }
        } else if (firstPos === 'verb') {
          result.action = contentWords[0].normal;
          if (contentWords[1]) result.object = contentWords[1].normal;
        }
      }
    }

    return result;
  }

  // ─── Word sense disambiguation ────────────────────────────────────────────
  /**
   * disambiguateWord(word, contextTokens, posHint)
   *
   * Given a word and surrounding context tokens, determine the most
   * likely meaning.
   *
   * Returns null if the word is not ambiguous.
   * Returns { sense, confidence, isAmbiguous, alternatives } if ambiguous.
   */
  function disambiguateWord(word, contextTokens, posHint) {
    var si = _sense();
    if (!si) return null;
    return si.topSense(word, contextTokens, posHint ? { pos: posHint } : undefined);
  }

  // ─── Disambiguate all known-ambiguous words in a sentence ─────────────────
  /**
   * disambiguateSentence(text, contextTokens)
   *
   * Scans every content token in text, disambiguates those that are in
   * the sense index.
   *
   * Returns { disambiguated: { [word]: senseResult }, confidence: number }
   */
  function disambiguateSentence(text, contextTokens) {
    var si = _si();
    if (!si) si = _sense();
    if (!si) return { disambiguated: {}, confidence: 0 };

    var mor = _mor();
    var tok = _tok();
    if (!tok) return { disambiguated: {}, confidence: 0 };

    var tokenResult = tok.tokenize(text);
    var ctx = contextTokens || tokenResult.tokens.map(function(t){ return t.normal; });

    var disambiguated = {};
    var totalConf = 0;
    var count = 0;

    tokenResult.tokens.forEach(function (t) {
      if (!t.isWord || t.isStop) return;
      var w = t.normal;
      var lemma = mor ? mor.getLemma(w) : w;

      // Try lemma first, then surface form
      var result = si.topSense(lemma, ctx) || si.topSense(w, ctx);
      if (result) {
        disambiguated[w] = result;
        totalConf += result.confidence;
        count++;
      }
    });

    return {
      disambiguated: disambiguated,
      confidence:    count > 0 ? totalConf / count : 0,
    };
  }

  // internal alias helper to avoid undefined reference
  function _si() { return global.SRSenseIndex; }

  // ─── Number context classification ────────────────────────────────────────
  /**
   * classifyNumberContext(text, numAnalysis)
   *
   * Numbers found in text are annotated with their contextual role.
   * Prevents "HTML5" from becoming arithmetic "HTML + 5".
   *
   * Returns { numbers: [{value, type, contextRole, raw}], hasTechnical }
   */
  function classifyNumberContext(text, numAnalysis) {
    var numInt = _num();
    var analysis = numAnalysis || (numInt ? numInt.analyze(text) : { numbers: [] });

    var hasTechnical = false;
    var enriched = (analysis.numbers || []).map(function (n) {
      var role = 'quantity';
      if (n.type === 'TECHNICAL' || n.type === 'VERSION' || n.type === 'IP_ADDRESS' || n.type === 'HTTP_CODE') {
        role = 'identifier';
        hasTechnical = true;
      } else if (n.type === 'DATE') {
        role = 'date';
      } else if (n.type === 'TIME') {
        role = 'time';
      } else if (n.type === 'MEASUREMENT') {
        role = 'measurement';
      } else if (n.type === 'PERCENTAGE') {
        role = 'percentage';
      } else if (n.type === 'CURRENCY') {
        role = 'currency';
      } else if (n.type === 'ORDINAL') {
        role = 'ordinal';
      }
      return Object.assign({}, n, { contextRole: role });
    });

    return { numbers: enriched, hasTechnical: hasTechnical, calculation: analysis.calculation || null };
  }

  // ─── Unknown word interpreter ─────────────────────────────────────────────
  /**
   * interpretUnknown(word, contextTokens)
   *
   * For words not in the vocabulary, attempt best-effort interpretation.
   * Uses morphology, context, and pattern recognition.
   *
   * Returns { word, bestGuess, confidence, method, askUser }
   */
  function interpretUnknown(word, contextTokens) {
    if (!word) return null;

    var mor = _mor();
    var rel = _rel();

    // 1. Morphological analysis
    var morphResult = mor ? mor.analyzeUnknownWord(word) : { type: 'unknown', confidence: 0 };

    // Already a named entity with high confidence
    if (morphResult.type === 'named_entity' && morphResult.confidence >= 0.7) {
      return {
        word:       word,
        bestGuess:  'named entity (proper noun)',
        confidence: morphResult.confidence,
        method:     'morphology',
        askUser:    false,
      };
    }

    // 2. Context-based guess — look at nearby known concepts
    var ctx = contextTokens || [];
    var contextClues = ctx.filter(function (t) { return t.length >= 3; });

    if (contextClues.length >= 2 && rel) {
      // Find the most connected domain from context
      var domainCounts = {};
      contextClues.forEach(function (clue) {
        var rels = rel.getRelated(clue, 0.7);
        rels.forEach(function (r) {
          var domain = r.to;
          domainCounts[domain] = (domainCounts[domain] || 0) + r.confidence;
        });
      });
      var topDomain = Object.keys(domainCounts).sort(function (a, b) {
        return domainCounts[b] - domainCounts[a];
      })[0];
      if (topDomain && domainCounts[topDomain] >= 0.7) {
        return {
          word:       word,
          bestGuess:  'unknown word related to ' + topDomain,
          confidence: 0.4,
          method:     'context_inference',
          askUser:    false,
        };
      }
    }

    // 3. Low confidence — should ask if important
    return {
      word:       word,
      bestGuess:  null,
      confidence: 0.1,
      method:     'unknown',
      askUser:    morphResult.type === 'unknown',
    };
  }

  // ─── Negation scope analysis ──────────────────────────────────────────────
  /**
   * analyzeNegation(text)
   *
   * More precise negation scope than the basic detectNegation.
   * Returns {
   *   negated: bool,
   *   negationWords: string[],
   *   scope: 'full' | 'partial' | 'none',
   *   negatedConcepts: string[],
   * }
   */
  function analyzeNegation(text) {
    if (!text) return { negated:false, negationWords:[], scope:'none', negatedConcepts:[] };

    var lower = text.toLowerCase();
    var negWords = [];
    var negatedConcepts = [];

    var NEG_TOKENS = ['not','no','never','neither','nor','none','nobody','nothing',
                      'nowhere','hardly','barely','scarcely'];
    var NEG_CONTRACTIONS = ["don't","doesn't","didn't","won't","wouldn't","can't",
                            "cannot","couldn't","shouldn't","isn't","aren't","wasn't",
                            "weren't","haven't","hasn't","hadn't","needn't","mustn't"];

    var allNeg = NEG_TOKENS.concat(NEG_CONTRACTIONS);
    var words  = lower.replace(/[^\w\s']/g,' ').split(/\s+/);

    words.forEach(function (w) {
      if (allNeg.indexOf(w) !== -1) negWords.push(w);
    });

    if (!negWords.length) {
      return { negated:false, negationWords:[], scope:'none', negatedConcepts:[] };
    }

    // Find what concepts follow the negation word
    var tok = _tok();
    if (tok) {
      var result = tok.tokenize(lower);
      var tokens = result.tokens;
      tokens.forEach(function (t, idx) {
        if (allNeg.indexOf(t.normal) !== -1) {
          // Collect next 3 content words as negated
          for (var j = idx + 1; j < Math.min(idx + 4, tokens.length); j++) {
            if (tokens[j].isWord && !tokens[j].isStop) {
              negatedConcepts.push(tokens[j].normal);
            }
          }
        }
      });
    }

    // Scope determination
    // "I never..." / "I don't..." = full scope for those concepts
    // "I like X but not Y" = partial scope
    var scope = 'full';
    if (/\bbut\s+not\b/i.test(text) || /\bnot\s+(?:quite|exactly|really)\b/i.test(text)) {
      scope = 'partial';
    }

    return {
      negated:          true,
      negationWords:    negWords,
      scope:            scope,
      negatedConcepts:  negatedConcepts,
    };
  }

  // ─── Full comprehension analysis ──────────────────────────────────────────
  /**
   * analyze(text, langAnalysis, context)
   *
   * Main entry point.
   * text:        raw user message
   * langAnalysis: result from SRLanguage.analyze() (may be null if not loaded)
   * context:     session context snapshot
   *
   * Returns ComprehensionResult:
   * {
   *   idioms:          [{phrase, label, domain}]    — recognized multi-word phrases
   *   questionType:    { type, answerType } | null  — question classification
   *   sentenceStruct:  { actor, action, object, ... } — structural extraction
   *   wordSenses:      { [word]: senseResult }      — disambiguated words
   *   negation:        { negated, scope, negatedConcepts } — negation analysis
   *   numbers:         { numbers, hasTechnical, calculation } — numeric context
   *   unknownWords:    [{ word, bestGuess, confidence, askUser }]
   *   confidence:      number  — overall comprehension confidence
   * }
   */
  function analyze(text, langAnalysis, context) {
    if (!text || typeof text !== 'string') {
      return _emptyResult();
    }

    var la  = langAnalysis || {};
    var ctx = context      || {};

    // Context tokens = normalized tokens from current sentence +
    // top concepts from recent conversation context
    var contextTokens = (la.tokens || [])
      .filter(function(t){ return t.isWord && !t.isStop; })
      .map(function(t){ return t.normal || t.raw.toLowerCase(); });

    // Add any concepts from context (recent subjects, topic)
    if (ctx.recentSubjects) {
      ctx.recentSubjects.forEach(function (s) {
        if (s) contextTokens.push(s.toLowerCase());
      });
    }

    // 1. Idiom/phrase detection
    var idioms = detectIdioms(text);

    // 2. Question classification
    var questionType = classifyQuestion(text);

    // 3. Sentence structure
    var sentenceStruct = extractStructure(text);

    // 4. Word sense disambiguation
    var wordSenses = {};
    var senseConf = 0;
    var senseCount = 0;
    var si = _sense();
    if (si) {
      var contentTokens = (la.tokens || []).filter(function(t){ return t.isWord && !t.isStop; });
      contentTokens.forEach(function (t) {
        var w = t.normal || t.raw.toLowerCase();
        var lemma = _mor() ? _mor().getLemma(w) : w;
        var result = si.topSense(lemma, contextTokens) || si.topSense(w, contextTokens);
        if (result) {
          wordSenses[w] = result;
          senseConf += result.confidence;
          senseCount++;
        }
      });
    }

    // 5. Negation analysis
    var negation = analyzeNegation(text);

    // 6. Number context classification
    var numbers = classifyNumberContext(text, la._numAnalysis);

    // 7. Unknown word interpretation
    var unknownWordResults = [];
    if (la.unknownWords && la.unknownWords.length > 0) {
      la.unknownWords.forEach(function (u) {
        var interpretation = interpretUnknown(u.word || u.raw, contextTokens);
        if (interpretation) {
          unknownWordResults.push(interpretation);
        }
      });
    }

    // 8. Overall comprehension confidence
    var conf = 0.7; // baseline
    if (idioms.length > 0) conf = Math.min(conf + 0.1, 1.0);
    if (senseCount > 0) conf = Math.min(conf + (senseConf / senseCount) * 0.1, 1.0);
    if (unknownWordResults.some(function(u){ return u.askUser; })) conf -= 0.1;
    conf = Math.max(0, conf);

    return {
      idioms:         idioms,
      questionType:   questionType,
      sentenceStruct: sentenceStruct,
      wordSenses:     wordSenses,
      negation:       negation,
      numbers:        numbers,
      unknownWords:   unknownWordResults,
      confidence:     conf,
    };
  }

  // ─── Empty result ─────────────────────────────────────────────────────────
  function _emptyResult() {
    return {
      idioms: [], questionType: null, sentenceStruct: {},
      wordSenses: {}, negation: { negated:false, negationWords:[], scope:'none', negatedConcepts:[] },
      numbers: { numbers:[], hasTechnical:false, calculation:null },
      unknownWords: [], confidence: 0,
    };
  }

  // ─── Adaptive sense learning ──────────────────────────────────────────────
  /**
   * learnSenseCorrection(word, correctSenseId, context)
   *
   * User-specific correction: "by server I mean my Discord server".
   * Stored as a session-scoped preference.
   * Does NOT rewrite global sense definitions.
   */
  var _userSensePrefs = {};  // word → preferred sense id (session-scoped)

  function learnSenseCorrection(word, correctSenseId, context) {
    if (!word || !correctSenseId) return false;
    var w = word.toLowerCase().trim();
    _userSensePrefs[w] = {
      senseId:    correctSenseId,
      confidence: 0.85,
      source:     'user_correction',
      learnedAt:  Date.now(),
      context:    context || null,
    };

    // Also register with adaptive brain for persistence
    var brain = global.SRAdaptiveBrain;
    if (brain && brain.store) {
      try {
        brain.store({
          conceptKey: 'sense_pref:' + w,
          type:       'language_sense_preference',
          value:      correctSenseId,
          confidence: 0.85,
          source:     'user_correction',
        });
      } catch (_) {}
    }
    return true;
  }

  // ─── Get stats ────────────────────────────────────────────────────────────
  function getStats() {
    var si = _sense();
    return {
      build:              BUILD_ID,
      idiomPatterns:      IDIOMS.length,
      questionTypes:      Object.keys(QUESTION_TYPES).length,
      structurePatterns:  STRUCT_PATTERNS.length,
      senseIndex:         si ? si.getStats() : { ambiguousWords: 0, totalSenses: 0 },
      userSensePrefs:     Object.keys(_userSensePrefs).length,
      subsystems: {
        morphology:     !!_mor(),
        tokenizer:      !!_tok(),
        relationships:  !!_rel(),
        phrases:        !!_phr(),
        senseIndex:     !!si,
        numbers:        !!_num(),
      },
    };
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  global.SRComprehension = {
    build:                  BUILD_ID,

    // Main analysis
    analyze:                analyze,

    // Individual capabilities
    detectIdioms:           detectIdioms,
    classifyQuestion:       classifyQuestion,
    extractStructure:       extractStructure,
    disambiguateWord:       disambiguateWord,
    disambiguateSentence:   disambiguateSentence,
    analyzeNegation:        analyzeNegation,
    classifyNumberContext:  classifyNumberContext,
    interpretUnknown:       interpretUnknown,

    // Learning
    learnSenseCorrection:   learnSenseCorrection,

    // Status
    getStats:               getStats,
  };

})(typeof window !== 'undefined' ? window : global);
