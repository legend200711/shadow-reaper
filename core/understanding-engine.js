/**
 * shadow-reaper-v2/core/understanding-engine.js
 * Shadow Reaper V2 — Understanding Engine
 *
 * Build: SR-V2-STAGE3
 *
 * Responsibilities:
 *  - Classify user message intent
 *  - Detect conversational tone
 *  - Extract named entities (project names, topics, pronouns)
 *
 * Zero external calls. Zero Workers AI. Pure deterministic local logic.
 *
 * Stage 3 changes:
 *  - GREETING pattern uses whole-word token matching to prevent false positives.
 *    "your", "young", "history", "project", etc. must NOT match as greetings.
 *    Only the exact token "yo" (or other valid greeting words) at the start of
 *    the normalized message matches.
 */

(function (global) {
  'use strict';

  // ─── Token normaliser ────────────────────────────────────────────────────────
  // Splits a trimmed string into lowercase tokens, returning the first token.
  function _firstToken(text) {
    return text.trim().toLowerCase().split(/\s+/)[0] || '';
  }

  // ─── Exact greeting token set ────────────────────────────────────────────────
  // Only these whole first-word values are unambiguous greetings.
  const GREETING_TOKENS = new Set([
    'hey', 'hi', 'hello', 'howdy', 'sup', 'yo', 'hiya', 'hola', 'greetings',
    'morning', 'evening', 'afternoon',
  ]);

  // Multi-word greeting phrases requiring more than a single token.
  const GREETING_PHRASE_PATTERNS = [
    /^(hey shadow|hello shadow|hi shadow|hey there|what'?s up)\b/i,
    /^good (morning|afternoon|evening|night)\b/i,
  ];

  function _isGreeting(text) {
    // Strip leading/trailing punctuation from first token to handle "Hey!" → "hey"
    const first = _firstToken(text).replace(/[^\w]/g, '');
    if (GREETING_TOKENS.has(first)) return true;
    return GREETING_PHRASE_PATTERNS.some(function (p) { return p.test(text); });
  }

  // ─── Intent patterns ────────────────────────────────────────────────────────

  const INTENT_PATTERNS = [
    {
      intent: 'GREETING',
      // Custom function — not a regex array — prevents substring false-positives.
      _test: _isGreeting,
      patterns: [],
    },
    {
      intent: 'GOODBYE',
      patterns: [
        /\b(bye|goodbye|good night|goodnight|see you|see ya|take care|later|cya|ttyl|farewell|until next time)\b/i,
      ],
    },
    {
      intent: 'THANKS',
      patterns: [
        /\b(thank(s| you)|thx|ty|cheers|appreciate it|much appreciated|that('s| is) helpful)\b/i,
      ],
    },
    {
      intent: 'USER_CORRECTION',
      patterns: [
        /^(no[,.]?|wait[,.]?|actually[,.]?|i meant|i mean|not (that|exactly)|correction:?|i said|wrong[,.]?)\b/i,
        /\bno[,.]?\s+i (meant|said|mean)/i,
      ],
    },
    {
      intent: 'QUESTION',
      patterns: [
        /^(what|where|when|who|why|how|which|whose|whom|is|are|was|were|do|does|did|can|could|would|should|will|have|has|had)\b/i,
        /\?$/,
      ],
    },
    {
      intent: 'FOLLOW_UP',
      patterns: [
        /\b(it|that|this|they|them|those|these)\b.*\b(needs?|should|could|make|change|add|remove|fix|update|what about|more|darker?|lighter?|bigger?|smaller?)\b/i,
        /^(make|add|remove|change|update|fix|adjust|set)\s+(it|that|this|them)\b/i,
        /^(more|less|bigger|smaller|darker|lighter|faster|slower)\b/i,
      ],
    },
    {
      intent: 'PROJECT_STATEMENT',
      patterns: [
        /\b(my project|project is|called|working on|building|creating|designing|developing|my (app|site|website|page|feature|design))\b/i,
        /\b(project name|it'?s called|the project|homepage|landing page|dashboard)\b/i,
      ],
    },
    {
      intent: 'GENERAL_CONVERSATION',
      patterns: [
        /\b(i'?m (sad|happy|excited|tired|angry|frustrated|anxious|confused|hopeful|great|okay|fine|stressed|nervous|scared|bored|lonely|overwhelmed))\b/i,
        /\b(i feel|i am feeling|feeling|had a (long|great|bad|rough|good|weird) day|long day|rough day|can we talk|tell me (something|a joke|a story|something funny))\b/i,
        /\b(let'?s (talk|chat)|talk to me|what (do you think|should i|can we))\b/i,
        /\b(i don'?t know (what|where|how)|not sure (what|where|how))\b/i,
      ],
    },
  ];

  // ─── Tone patterns ───────────────────────────────────────────────────────────

  const TONE_PATTERNS = [
    {
      tone: 'happy',
      patterns: [
        /\b(happy|great|amazing|wonderful|fantastic|awesome|joyful|ecstatic|thrilled|delighted|love|loving|blessed|grateful)\b/i,
        /\b(i'?m (great|doing great|so happy|so good|feeling good|really good))\b/i,
        /!{2,}/,
      ],
    },
    {
      tone: 'excited',
      patterns: [
        /\b(excited|excited about|can'?t wait|pumped|stoked|hyped|thrilled|overjoyed|woohoo|yay|yes!)\b/i,
      ],
    },
    {
      tone: 'sad',
      patterns: [
        /\b(sad|upset|down|depressed|heartbroken|crying|unhappy|miserable|gloomy|blue|low|lonely|hurt|lost|broken)\b/i,
        /\b(i'?m (sad|not okay|not doing (well|great)|struggling|really down|really sad))\b/i,
      ],
    },
    {
      tone: 'frustrated',
      patterns: [
        /\b(frustrated|annoyed|irritated|fed up|done with|over it|sick of|can'?t stand|pissed|uggh?|ugh)\b/i,
        /\b(nothing (is|seems) working|this (is|isn'?t) working|why (won'?t|doesn'?t) it)\b/i,
      ],
    },
    {
      tone: 'angry',
      patterns: [
        /\b(angry|furious|mad|rage|livid|hate|infuriated|enraged)\b/i,
        /\b(i'?m (so angry|so mad|really angry|really mad|pissed))\b/i,
      ],
    },
    {
      tone: 'anxious',
      patterns: [
        /\b(anxious|worried|nervous|scared|afraid|terrified|panic|stress|stressed|overwhelming|overwhelmed)\b/i,
        /\b(what if|i'?m (not sure|afraid|really nervous|really anxious|stressed out))\b/i,
      ],
    },
    {
      tone: 'confused',
      patterns: [
        /\b(confused|confusing|don'?t understand|not sure|lost|unclear|what does|what do you mean|huh|wait what)\b/i,
      ],
    },
    {
      tone: 'tired',
      patterns: [
        /\b(tired|exhausted|drained|worn out|sleepy|long day|rough day|dead tired|wiped out|running on empty)\b/i,
        /\b(i'?m (tired|exhausted|drained|so tired|really tired|so exhausted))\b/i,
      ],
    },
    {
      tone: 'hopeful',
      patterns: [
        /\b(hopeful|optimistic|looking forward|can'?t wait|excited about (the future|tomorrow|what'?s next)|things (are|will) get better)\b/i,
      ],
    },
    {
      tone: 'playful',
      patterns: [
        /\b(haha|lol|lmao|rofl|😂|😄|😁|tell me (a joke|something funny)|joking|just kidding|jk)\b/i,
      ],
    },
  ];

  // ─── Entity extraction ───────────────────────────────────────────────────────

  function extractEntities(text) {
    const entities = {};

    // Project name: "my project is X" / "it's called X" / "project called X"
    const projectMatch = text.match(
      /(?:my project(?:\s+is(?:\s+called)?)?|(?:app|site|website|game|tool)(?:\s+is(?:\s+called)?)?|(?:it'?s|its)\s+called|project\s+is(?:\s+called)?)\s+(?!am\b|is\b|are\b|what\b|called\?|working\b)([A-Za-z0-9][A-Za-z0-9 _\-'"]{0,39})/i
    );
    if (projectMatch) {
      let name = projectMatch[1].trim().replace(/['"]/g, '');
      name = name.replace(/\s+(am i|are we|is it|called)\s*\??.*$/i, '').trim();
      if (name.length > 0) {
        entities.projectName = name;
      }
    }

    // Area: homepage, dashboard, landing page, etc.
    const areaMatch = text.match(
      /\b(homepage|home page|landing page|dashboard|settings page|profile page|login page|signup page|about page|header|footer|sidebar|nav(?:bar)?|mobile view|desktop view)\b/i
    );
    if (areaMatch) {
      entities.area = areaMatch[1].toLowerCase();
    }

    // Design descriptors
    const designMatch = text.match(
      /\b(dark(er)?|light(er)?|minimal|bold|clean|colorful|animated|flat|glassmorphism|neon|cinematic|moody|vibrant)\b/i
    );
    if (designMatch) {
      entities.design = designMatch[1].toLowerCase();
    }

    // Topic extraction — loose
    const topicMatch = text.match(
      /(?:talking about|working on|thinking about|dealing with|my)\s+([a-zA-Z][a-zA-Z0-9 ]{2,30})/i
    );
    if (topicMatch) {
      entities.topic = topicMatch[1].trim();
    }

    return entities;
  }

  // ─── Public API ──────────────────────────────────────────────────────────────

  function understand(text) {
    if (!text || typeof text !== 'string') {
      return { intent: 'UNKNOWN', tone: 'neutral', entities: {}, raw: '' };
    }

    const trimmed = text.trim();

    // Intent detection — first match wins
    let intent = 'UNKNOWN';
    for (const entry of INTENT_PATTERNS) {
      // Support both custom _test functions and pattern arrays
      const matched = entry._test
        ? entry._test(trimmed)
        : entry.patterns.some((p) => p.test(trimmed));
      if (matched) {
        intent = entry.intent;
        break;
      }
    }

    // If still UNKNOWN and message is non-empty, treat as general conversation
    if (intent === 'UNKNOWN' && trimmed.length > 0) {
      intent = 'GENERAL_CONVERSATION';
    }

    // Tone detection — first match wins
    let tone = 'neutral';
    for (const { tone: t, patterns } of TONE_PATTERNS) {
      if (patterns.some((p) => p.test(trimmed))) {
        tone = t;
        break;
      }
    }

    const entities = extractEntities(trimmed);

    return { intent, tone, entities, raw: trimmed };
  }

  // ─── Export ──────────────────────────────────────────────────────────────────

  global.SRUnderstanding = { understand };
})(typeof window !== 'undefined' ? window : global);
