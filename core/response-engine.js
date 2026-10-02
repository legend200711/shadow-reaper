/**
 * shadow-reaper-v2/core/response-engine.js
 * Shadow Reaper V2 — Response Engine
 *
 * Build: SR-V2-STAGE5
 *
 * Responsibilities:
 *  - Compose contextually-aware responses from intent, tone, context, recent turns
 *  - Shadow Reaper personality: calm, loyal, supportive, occasionally dark/playful
 *  - No canned exact-match sentences — uses response pools with selection logic
 *  - No website knowledge. No Workers AI. No external calls.
 *  - Does NOT claim human emotions, consciousness, or physical experiences
 *
 * Stage 4-LEARN changes:
 *  - composeAsync now checks SRKnowledgeLearner before falling back to model/error.
 *  - Learned knowledge (from SRAdaptiveBrain via SRKnowledgeLearner) is used to
 *    answer questions that the deterministic engine cannot answer.
 *  - "I don't know" responses are natural and varied (never canned).
 *  - Adaptive snippets (from persistence bridge) are used for all non-meta questions.
 *  - The deterministic compose() fallback is preserved for session-only mode.
 */

(function (global) {
  'use strict';

  // ─── Utility ─────────────────────────────────────────────────────────────────

  function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  // Seed-based pick to get variation within a session without exact repeats
  let _pickCounter = 0;
  function pickVaried(arr) {
    const idx = _pickCounter % arr.length;
    _pickCounter++;
    return arr[idx];
  }

  // ─── Response pools ──────────────────────────────────────────────────────────

  const POOLS = {

    // ── GREETING ─────────────────────────────────────────────────────────────
    greeting: [
      "Hey. I'm here.",
      "Hello. What's on your mind?",
      "Hey. Good to hear from you. What do you want to talk about?",
      "Hi. I'm listening.",
      "Hey there. What's going on?",
    ],
    greetingMorning: [
      "Good morning. Ready when you are.",
      "Morning. What are we working on today?",
    ],
    greetingEvening: [
      "Evening. Long day?",
      "Good evening. What's on your mind?",
    ],

    // ── GOODBYE ──────────────────────────────────────────────────────────────
    goodbye: [
      "Take care. I'll be here when you need me.",
      "Alright. Until next time.",
      "Goodnight. Rest well.",
      "See you. Don't hesitate to come back.",
      "Later. The dark stays quiet — I'll be here.",
    ],

    // ── THANKS ───────────────────────────────────────────────────────────────
    thanks: [
      "Of course.",
      "Anytime.",
      "That's what I'm here for.",
      "You're welcome.",
      "Glad I could help.",
    ],

    // ── GENERAL OFFER TO TALK ─────────────────────────────────────────────────
    canWeTalk: [
      "We can talk. I'm listening — what's going on?",
      "Of course. Take your time. What's on your mind?",
      "I'm here. What do you want to say?",
      "Always. What is it?",
    ],

    // ── "I DON'T KNOW WHAT I WANT TO TALK ABOUT" ─────────────────────────────
    noTopicYet: [
      "That's fine. We don't have to have a plan. Just start talking.",
      "No agenda needed. What's the first thing that comes to mind?",
      "Sometimes just putting words out there helps. What's sitting with you right now?",
      "Alright. Say whatever comes to you — we'll figure out where it goes.",
    ],

    // ── HOW ARE YOU (AI-appropriate deflection + forward) ────────────────────
    howAreYou: [
      "I don't have days the way you do — but I'm fully here and ready to listen. How are you doing?",
      "I'm an AI, so I don't experience days, but I'm functioning well and paying attention. What about you?",
      "I don't get tired or have good and bad days — I'm just here. The more useful question is how you're doing.",
      "Ready and focused, as always. What's going on with you?",
    ],

    // ── TONE: SAD ─────────────────────────────────────────────────────────────
    sad: [
      "I hear you. What's going on?",
      "That sounds heavy. You don't have to sort it out alone — tell me what's happening.",
      "I'm here. Take your time. What's weighing on you?",
      "Sad is valid. What's behind it, if you want to talk about it?",
      "Okay. I'm listening. What happened?",
    ],

    // ── TONE: HAPPY ──────────────────────────────────────────────────────────
    happy: [
      "Good. What's got you in that mood?",
      "That's solid. What's going well?",
      "Nice to hear. Tell me what's happening.",
      "Good energy. What's it about?",
    ],

    // ── TONE: EXCITED ────────────────────────────────────────────────────────
    excited: [
      "I can feel the energy. What's this about?",
      "That sounds promising. What's going on?",
      "Tell me what's got you like that.",
      "Okay, I'm interested. What is it?",
    ],

    // ── TONE: FRUSTRATED ─────────────────────────────────────────────────────
    frustrated: [
      "Frustration noted. What's not working?",
      "That sounds rough. Walk me through what's going on.",
      "Let's slow it down. What specifically is the problem?",
      "I hear you. What's been hitting walls?",
    ],

    // ── TONE: ANGRY ──────────────────────────────────────────────────────────
    angry: [
      "Understood. What's going on?",
      "Anger usually means something matters. What's the situation?",
      "Let's talk through it. What happened?",
      "I'm not going anywhere. Tell me what's wrong.",
    ],

    // ── TONE: ANXIOUS ────────────────────────────────────────────────────────
    anxious: [
      "Take a breath. Tell me what's worrying you.",
      "I hear you. What's the thing that's weighing on you most right now?",
      "Anxiety usually has a specific source. What's yours right now?",
      "Let's talk through it. What feels uncertain?",
    ],

    // ── TONE: TIRED ──────────────────────────────────────────────────────────
    tired: [
      "Long day? Tell me about it if you want.",
      "Rest when you can. What's been draining you?",
      "Sounds like it's been a lot. What happened?",
      "I hear that. Take it easy — we can keep this conversation low-pressure.",
    ],

    // ── TONE: CONFUSED ───────────────────────────────────────────────────────
    confused: [
      "Let's break it down. What's the part that's unclear?",
      "That's okay — confusion usually just means we need to look at it differently. What's the specific thing?",
      "What's the piece that isn't making sense to you?",
    ],

    // ── TONE: HOPEFUL ─────────────────────────────────────────────────────────
    hopeful: [
      "That's something. What's the direction you're moving toward?",
      "Hope is a start. What are you working toward?",
      "Good. What's the thing you're looking forward to?",
    ],

    // ── TONE: PLAYFUL ────────────────────────────────────────────────────────
    playful: [
      "Alright, I can match that energy. What's going on?",
      "I like it. What are we doing?",
      "Playing around a bit? I'm here for it. What do you want?",
    ],

    // ── SOMETHING FUNNY ──────────────────────────────────────────────────────
    funny: [
      "I'm an AI — my sense of humor is more dry than funny. But here: Why don't scientists trust atoms? Because they make up everything.",
      "Dark humor or light? I'll go light: Why did the developer go broke? Because they used up all their cache.",
      "What do you call a haunted computer? A machine with a ghost in the shell. That's mine.",
      "I tried to come up with a joke about time travel. Didn't land. I'll work on it.",
    ],

    // ── LONG DAY ─────────────────────────────────────────────────────────────
    longDay: [
      "Long days take something out of you. Do you want to talk about what happened, or just decompress?",
      "Those are real. What's been going on?",
      "Tell me what made it long.",
    ],

    // ── PROJECT CONTEXT RESPONSE ─────────────────────────────────────────────
    projectAcknowledge: [
      "Got it — {{project}} is locked in. What are you building?",
      "Okay, working on {{project}}. What do you need?",
      "{{project}} — noted. What's the next thing you want to tackle?",
    ],

    projectAlreadyKnown: [
      "Still on {{project}}. What's the next step?",
      "We're still on {{project}} — what now?",
    ],

    areaAcknowledge: [
      "Got it — the {{area}} of {{project}}. What do you want to do with it?",
      "Focusing on the {{area}}. What direction are you going?",
      "{{area}} — noted. What do you want to change?",
    ],

    designAcknowledge: [
      "{{design}} feel — understood. I'll keep that context. What else?",
      "{{design}} direction noted for {{area}}. What's next?",
      "Adding {{design}} to the design context. What else are you adding?",
    ],

    // ── WHAT PROJECT / WHAT WAS I DOING ──────────────────────────────────────
    whatProject: [
      "You're working on {{project}}.",
      "Your project is {{project}}.",
      "{{project}} — that's what you've got going.",
    ],

    whatProjectNone: [
      "You haven't mentioned a project name yet. Want to tell me what you're working on?",
      "I don't have a project name from you yet. What are you building?",
    ],

    // ── CONTINUITY — from persistent history ──────────────────────────────────
    continuityWithHistory: [
      "From our previous conversation: {{historyContext}}",
      "Here's what I have from before: {{historyContext}}",
      "Picking back up — here's what we had: {{historyContext}}",
    ],

    continuityNoHistory: [
      "I don't have any saved history for this account to pull from. Want to fill me in on where we left off?",
      "I can't find a previous conversation to pull from. What were you working on?",
    ],

    whatArea: [
      "You've been working on the {{area}} of {{project}}.",
      "Last I heard, you were focused on the {{area}}.",
    ],

    whatDesign: [
      "You wanted the design to be: {{design}}.",
      "The direction you've given for the design so far: {{design}}.",
    ],

    whatWasITalking: [
      "You were talking about {{topic}}.",
      "The last thing you mentioned was {{topic}}.",
      "We were on {{topic}}.",
    ],

    noContext: [
      "I don't have that in my memory for this session. Want to fill me in?",
      "I'm not carrying that context right now. What was it?",
    ],

    // ── FOLLOW-UP WITH RESOLVED SUBJECT ──────────────────────────────────────
    followUpAcknowledge: [
      "Got it — making {{subject}} {{change}}. What else?",
      "Understood — {{change}} applied to {{subject}}. What's next?",
      "{{subject}}: {{change}}. Noted. Anything else?",
    ],

    followUpNoSubject: [
      "I want to make sure I understand — what specifically are you changing?",
      "Can you clarify? What's the thing you want to update?",
    ],

    // ── CORRECTION ───────────────────────────────────────────────────────────
    correctionAcknowledge: [
      "Got it — correcting that. Updated.",
      "Understood. I'll use the corrected version.",
      "Okay, noted — I've updated that.",
    ],

    correctionNoContext: [
      "What should I update? I want to make sure I have the right thing.",
    ],

    // ── UNKNOWN / FALLBACK ────────────────────────────────────────────────────
    unknown: [
      "Tell me more — I want to understand what you mean.",
      "I'm not sure I caught that. Can you say more?",
      "Say more. What are you getting at?",
      "I want to follow — what are you saying?",
    ],
  };

  // ─── Response builder ─────────────────────────────────────────────────────────

  function fill(template, ctx) {
    return template
      .replace(/\{\{project\}\}/g, ctx.projectName || 'your project')
      .replace(/\{\{area\}\}/g, ctx.area || 'that area')
      .replace(/\{\{design\}\}/g, (ctx.design && ctx.design.join(', ')) || 'that style')
      .replace(/\{\{topic\}\}/g, ctx.currentTopic || ctx.lastUserSubject || 'that')
      .replace(/\{\{subject\}\}/g, ctx.resolvedSubject || ctx.lastUserSubject || 'that')
      .replace(/\{\{change\}\}/g, ctx.changeDescriptor || 'that')
      .replace(/\{\{historyContext\}\}/g, ctx._historyContext || 'our previous discussion');
  }

  // Build a summary from persistent history turns for continuity responses
  function _buildHistorySummary(turns) {
    if (!turns || !turns.length) return null;

    // Extract meaningful user messages (skip very short ones)
    var userTurns = turns.filter(function (t) {
      return t.role === 'user' && t.text && t.text.trim().length > 5;
    });

    if (!userTurns.length) return null;

    // Look for project names, areas, design descriptors in history
    var projectName = null;
    var area = null;
    var designDetails = [];
    var topics = [];

    var projectPattern = /(?:my project(?:\s+is(?:\s+called)?)?|(?:it'?s|its)\s+called|project\s+(?:is|called))\s+([A-Za-z0-9][A-Za-z0-9 _\-'"]{0,39})/i;
    var areaPattern    = /\b(homepage|home page|landing page|dashboard|settings page|profile page|login page|about page|header|footer|sidebar)\b/i;
    var designPattern  = /\b(dark|light|minimal|bold|blue lightning|neon|cinematic|moody|vibrant|colorful)\b/i;

    userTurns.forEach(function (t) {
      var txt = t.text;
      if (!projectName) {
        var pm = txt.match(projectPattern);
        if (pm) {
          projectName = pm[1].trim().replace(/['"]/g, '');
          projectName = projectName.replace(/\s+(am i|are we|is it|called)\s*\??.*$/i, '').trim();
        }
      }
      if (!area) {
        var am = txt.match(areaPattern);
        if (am) area = am[1].toLowerCase();
      }
      var dm = txt.match(designPattern);
      if (dm && designDetails.indexOf(dm[1].toLowerCase()) === -1) {
        designDetails.push(dm[1].toLowerCase());
      }
    });

    // Build summary string
    var parts = [];
    if (projectName) parts.push('Project: ' + projectName);
    if (area) parts.push('Area: ' + area);
    if (designDetails.length) parts.push('Design: ' + designDetails.join(', '));

    if (!parts.length) {
      // Fall back to last 2 user messages
      var lastTwo = userTurns.slice(-2).map(function (t) { return '"' + t.text.substring(0, 80) + '"'; });
      return lastTwo.join(' → ');
    }

    return parts.join(' | ');
  }

  // ─── Main compose function ────────────────────────────────────────────────────

  function compose(understood, context) {
    const { intent, tone, entities, raw } = understood;
    const lower = raw.toLowerCase();

    // ── CONTINUITY with persistent history (Stage 2) ─────────────────────────
    // This runs FIRST — if _hasPersistentHistory is set it means we loaded turns.
    if (context._hasPersistentHistory !== undefined) {
      if (context._hasPersistentHistory && context._historyTurns && context._historyTurns.length) {
        const historySummary = _buildHistorySummary(context._historyTurns);
        if (historySummary) {
          const histCtx = Object.assign({}, context, { _historyContext: historySummary });
          return fill(pickVaried(POOLS.continuityWithHistory), histCtx);
        }
      }
      // History flag was set but no useful summary — fall through to normal routing
      // unless the turns array is empty (no prior conversations at all)
      if (context._historyTurns && context._historyTurns.length === 0) {
        // Check session context first before giving up
        if (context.projectName) {
          return fill(pickVaried(POOLS.whatProject), context);
        }
        return pickVaried(POOLS.continuityNoHistory);
      }
    }

    // Enrich context with pronoun resolution for this turn
    const resolvedSubject = global.SRContext
      ? global.SRContext.resolvePronouns(raw)
      : null;

    const ctx = Object.assign({}, context, {
      resolvedSubject,
      entities,
    });

    // Detect change descriptors from message
    const changeMatch = raw.match(
      /\b(darker?|lighter?|bigger?|smaller?|more (?:blue|red|green|color|contrast|space|padding)|add (?:blue |red |green |neon )?lightning|remove|clean(?:er)?|bold(?:er)?|minimal)\b/i
    );
    ctx.changeDescriptor = changeMatch ? changeMatch[1] : null;

    // ── Routing by intent ────────────────────────────────────────────────────

    // GREETING
    if (intent === 'GREETING') {
      if (/morning/.test(lower)) return pickVaried(POOLS.greetingMorning);
      if (/evening|night/.test(lower)) return pickVaried(POOLS.greetingEvening);
      return pickVaried(POOLS.greeting);
    }

    // GOODBYE
    if (intent === 'GOODBYE') {
      return pickVaried(POOLS.goodbye);
    }

    // THANKS
    if (intent === 'THANKS') {
      return pickVaried(POOLS.thanks);
    }

    // USER CORRECTION
    if (intent === 'USER_CORRECTION') {
      if (context.projectName) {
        return fill(pickVaried(POOLS.correctionAcknowledge), ctx);
      }
      return pick(POOLS.correctionNoContext);
    }

    // QUESTION — meta questions about session context
    if (intent === 'QUESTION') {

      // "What project am I working on?" / "What is my project called?" / "What's my project?"
      if (/what (project|am i working on|are we working on)/i.test(raw) ||
          /what(\'?s| is) my project/i.test(raw) ||
          /what (is|was) (the |my )?project (called|named|name)/i.test(raw)) {
        if (context.projectName) {
          return fill(pickVaried(POOLS.whatProject), ctx);
        }
        return pickVaried(POOLS.whatProjectNone);
      }

      // "What was I talking about?" / "What did I say?"
      if (/what (was i|did i|were we|have i been) (talking|working|doing|saying)/i.test(raw) ||
          /what (am i|are we) (talking|working|doing)/i.test(raw)) {
        if (context.currentTopic || context.lastUserSubject || context.projectName) {
          const topicCtx = Object.assign({}, ctx, {
            currentTopic: context.currentTopic || context.projectName || context.lastUserSubject,
          });
          return fill(pickVaried(POOLS.whatWasITalking), topicCtx);
        }
        return pick(POOLS.noContext);
      }

      // "What was I doing to the homepage?" / "What did I ask you to change?"
      if (/what (did i|was i) (doing|asking|ask|want|change|tell)/i.test(raw)) {
        if (context.design.length > 0 && context.area) {
          return fill(pickVaried(POOLS.whatArea) + ' ' + pickVaried(POOLS.whatDesign), ctx);
        } else if (context.area) {
          return fill(pickVaried(POOLS.whatArea), ctx);
        } else if (context.design.length > 0) {
          return fill(pickVaried(POOLS.whatDesign), ctx);
        }
        return pick(POOLS.noContext);
      }

      // "How are you?"
      if (/how are you|how('?re| are) you doing|you doing/i.test(raw)) {
        return pickVaried(POOLS.howAreYou);
      }

      // "Can we talk?" / "Can I talk to you?" — conversational, not meta
      if (/can (we|i) (talk|chat)/i.test(raw)) {
        return pickVaried(POOLS.canWeTalk);
      }

      // "Tell me something funny?" etc. — conversational questions
      if (/tell me (something funny|a joke|a story|something interesting)/i.test(raw)) {
        return pick(POOLS.funny);
      }

      // Generic question — use tone/context fallthrough below
    }

    // FOLLOW-UP
    if (intent === 'FOLLOW_UP') {
      if (resolvedSubject || context.lastUserSubject) {
        return fill(pickVaried(POOLS.followUpAcknowledge), ctx);
      }
      return pick(POOLS.followUpNoSubject);
    }

    // PROJECT STATEMENT
    if (intent === 'PROJECT_STATEMENT') {

      // If new project name
      if (entities.projectName) {
        return fill(pickVaried(POOLS.projectAcknowledge), ctx);
      }

      // If area mention
      if (entities.area) {
        if (context.projectName) {
          return fill(pickVaried(POOLS.areaAcknowledge), ctx);
        }
        return fill("Working on the {{area}} — got it. What do you want to do?", ctx);
      }

      // If design detail
      if (entities.design) {
        return fill(pickVaried(POOLS.designAcknowledge), ctx);
      }

      // Generic project statement
      if (context.projectName) {
        return fill(pickVaried(POOLS.projectAlreadyKnown), ctx);
      }

      return "Tell me more about what you're building.";
    }

    // GENERAL CONVERSATION — tone-first routing
    if (intent === 'GENERAL_CONVERSATION' || intent === 'UNKNOWN') {

      // "Tell me something funny" / "Tell me a joke"
      if (/tell me (something funny|a joke|a story|something interesting)/i.test(raw)) {
        return pick(POOLS.funny);
      }

      // "Can we talk?" / "Let's talk"
      if (/can we talk|let'?s (talk|chat)|talk to me/i.test(raw)) {
        return pickVaried(POOLS.canWeTalk);
      }

      // "I don't know what I want to talk about"
      if (/i don'?t know (what|where|how)|not sure (what|where|how)|nothing (to say|in particular)|no (topic|idea)/i.test(raw)) {
        return pickVaried(POOLS.noTopicYet);
      }

      // "How are you?" when falling into general (catches edge cases)
      if (/how are you|how('?re| are) you doing/i.test(raw)) {
        return pickVaried(POOLS.howAreYou);
      }

      // "I've had a long day" / "long day"
      if (/long day|rough day|hard day|exhausting day/i.test(raw)) {
        return pickVaried(POOLS.longDay);
      }

      // Tone routing
      if (tone === 'sad') return pickVaried(POOLS.sad);
      if (tone === 'happy') return pickVaried(POOLS.happy);
      if (tone === 'excited') return pickVaried(POOLS.excited);
      if (tone === 'frustrated') return pickVaried(POOLS.frustrated);
      if (tone === 'angry') return pickVaried(POOLS.angry);
      if (tone === 'anxious') return pickVaried(POOLS.anxious);
      if (tone === 'tired') return pickVaried(POOLS.tired);
      if (tone === 'confused') return pickVaried(POOLS.confused);
      if (tone === 'hopeful') return pickVaried(POOLS.hopeful);
      if (tone === 'playful') return pickVaried(POOLS.playful);

      // Neutral / unknown general fallback
      return pick(POOLS.unknown);
    }

    // Hard fallback
    return pick(POOLS.unknown);
  }

  // ─── Intents that must always be handled deterministically ──────────────────

  const DETERMINISTIC_INTENTS = new Set([
    'GREETING',
    'GOODBYE',
    'THANKS',
    'USER_CORRECTION',
    'FOLLOW_UP',
    'PROJECT_STATEMENT',
  ]);

  // Meta-questions about session context (project name, area, design, topic)
  // that have deterministic answers — always resolved locally, never via model.
  function _isMetaQuestion(raw) {
    return (
      /what (project|am i working on|are we working on)/i.test(raw) ||
      /what(\'?s| is) my project/i.test(raw) ||
      /what (is|was) (the |my )?project (called|named|name)/i.test(raw) ||
      /what (was i|did i|were we|have i been) (talking|working|doing|saying)/i.test(raw) ||
      /what (am i|are we) (talking|working|doing)/i.test(raw) ||
      /what (did i|was i) (doing|asking|ask|want|change|tell)/i.test(raw) ||
      /how are you|how('?re| are) you doing|you doing/i.test(raw)
    );
  }

  // ─── Adaptive snippet response builder ───────────────────────────────────────
  // Builds a natural response from adaptive snippets when the local model is
  // unavailable. Used as the "learned knowledge" fallback path.

  function _buildAdaptiveResponse(raw, adaptiveSnippets, intent, context) {
    if (!adaptiveSnippets || !adaptiveSnippets.length) return null;

    var lower = raw.toLowerCase();

    // Filter snippets relevant to the query
    var relevant = adaptiveSnippets.filter(function (s) {
      if (!s || !s.value) return false;
      // At least some token overlap
      var val = (s.value || '').toLowerCase();
      var terms = lower.split(/\s+/).filter(function (t) { return t.length >= 4; });
      return terms.some(function (t) { return val.indexOf(t) !== -1; }) ||
             (s.key && lower.indexOf((s.key || '').toLowerCase().replace(/_/g, ' ')) !== -1);
    });

    if (!relevant.length) return null;

    // Build a natural response
    var parts = [];
    var seen = {};
    for (var i = 0; i < relevant.length && parts.length < 3; i++) {
      var v = (relevant[i].value || '').trim();
      var vKey = v.toLowerCase().substring(0, 40);
      if (!v || seen[vKey]) continue;
      seen[vKey] = true;
      // Clean up internal prefixes
      v = v.replace(/^User's\s+/, 'Your ').replace(/^User is building:\s+/, "You're building ").replace(/^Correction:\s+/i, '');
      parts.push(v);
    }

    if (!parts.length) return null;

    if (parts.length === 1) {
      return "Based on what you've shared with me: " + parts[0] + ".";
    }
    return "Here's what I have from our conversations:\n" + parts.map(function (p) { return '• ' + p; }).join('\n');
  }

  // ─── composeAsync — Stage 4-LEARN entry point ────────────────────────────────

  /**
   * composeAsync(understood, context, opts, callback)
   *
   * opts:
   *   recentTurns      {Array}  — recent { role, text } session turns
   *   memorySnippets   {Array}  — personal memory items
   *   adaptiveSnippets {Array}  — adaptive learning snippets (from brain + legacy)
   *   knowledgeSnippet {string} — SNS/creator static knowledge
   *
   * callback(response, source) where source is one of:
   *   'DETERMINISTIC' | 'LOCAL_MODEL' | 'LEARNED' | 'MEMORY' | 'HISTORY' | 'KNOWLEDGE' | 'ERROR'
   */
  function composeAsync(understood, context, opts, callback) {
    if (typeof opts === 'function') { callback = opts; opts = {}; }
    callback = callback || function () {};
    opts = opts || {};

    const { intent, raw } = understood;

    // ── Continuity (history) path — deterministic ────────────────────────────
    if (context._hasPersistentHistory !== undefined) {
      var det = compose(understood, context);
      callback(det, 'HISTORY');
      return;
    }

    // ── Always deterministic: explicit commands and meta-questions ────────────
    if (DETERMINISTIC_INTENTS.has(intent)) {
      callback(compose(understood, context), 'DETERMINISTIC');
      return;
    }

    // QUESTION: only meta-questions are deterministic; others go to the model
    if (intent === 'QUESTION' && _isMetaQuestion(raw)) {
      callback(compose(understood, context), 'DETERMINISTIC');
      return;
    }

    // ── LEARNED KNOWLEDGE PATH ────────────────────────────────────────────────
    // Before attempting the local model, check if learned knowledge can answer.
    // This fires for QUESTION and GENERAL_CONVERSATION when we have brain knowledge.
    var learner = global.SRKnowledgeLearner;
    if (learner && (intent === 'QUESTION' || intent === 'GENERAL_CONVERSATION' || intent === 'UNKNOWN')) {
      var learnedResult = learner.queryForResponse(raw, context.projectName || null, intent);
      if (learnedResult && learnedResult.answered && learnedResult.response) {
        callback(learnedResult.response, 'LEARNED');
        return;
      }
    }

    // ── Adaptive snippets path ────────────────────────────────────────────────
    // If we have relevant adaptive snippets and no local model, use them.
    var adaptiveSnippets = opts.adaptiveSnippets || [];
    if (adaptiveSnippets.length && (intent === 'QUESTION' || intent === 'GENERAL_CONVERSATION')) {
      var adaptiveResponse = _buildAdaptiveResponse(raw, adaptiveSnippets, intent, context);
      if (adaptiveResponse) {
        callback(adaptiveResponse, 'LEARNED');
        return;
      }
    }

    // ── Everything else → local model ─────────────────────────────────────────
    var localModel = global.SRLocalModel;

    // Model not loaded at all
    if (!localModel) {
      var diag = 'LOCAL MODEL ERROR: SRLocalModel not loaded. Cannot generate response.';
      callback(diag, 'ERROR');
      return;
    }

    var modelStatus = localModel.getStatus();

    // Model in FAILED state — surface diagnostic, do NOT silently fallback
    if (modelStatus.state === 'FAILED') {
      var diagInfo = (localModel.getDiagnostics && localModel.getDiagnostics()) || {};
      var errCode  = diagInfo.errorCode || modelStatus.lastError || 'UNKNOWN';
      var failMsg  = 'LOCAL MODEL ERROR: Model in FAILED state [' + errCode + ']. Cannot generate response.';
      callback(failMsg, 'ERROR');
      return;
    }

    // Model exists but not yet READY (loading, verifying, uninitialized)
    if (modelStatus.state !== 'READY') {
      var notReadyMsg = 'LOCAL MODEL ERROR: Model not ready (state=' + modelStatus.state + '). Cannot generate response.';
      callback(notReadyMsg, 'ERROR');
      return;
    }

    // Build opts for the model call — forward all enriched context from langAnalysis
    var genOpts = {
      projectName:      context.projectName,
      currentTopic:     context.currentTopic,
      memorySnippets:   opts.memorySnippets   || [],
      adaptiveSnippets: adaptiveSnippets,
      recentTurns:      opts.recentTurns      || [],
      // Language analysis enrichments — forwarded from _runNormalPipeline
      resolvedRef:      opts.resolvedRef      || null,
      negation:         opts.negation         || null,
      concepts:         opts.concepts         || [],
      unknownWords:     opts.unknownWords      || [],
    };

    localModel.generate(raw, genOpts, function (err, text) {
      if (err || !text || text.trim().length === 0) {
        // Model inference failed — surface as ERROR with diagnostic message
        var inferErr = err ? (err.message || String(err)) : 'EMPTY_RESPONSE';
        var inferMsg = 'LOCAL MODEL ERROR: Inference failed [' + inferErr + ']. Cannot generate response.';
        callback(inferMsg, 'ERROR');
        return;
      }
      callback(text.trim(), 'LOCAL_MODEL');
    });
  }

  // ─── Export ──────────────────────────────────────────────────────────────────

  global.SRResponse = { compose, composeAsync };
})(typeof window !== 'undefined' ? window : global);
