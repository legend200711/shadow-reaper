/**
 * shadow-reaper-v2/core/sr-reasoning-core.js
 * Shadow Reaper — Structured Reasoning Core
 *
 * Build: SR-REASONING-CORE-1
 *
 * Exposes: window.SRReasoningCore
 *
 * PURPOSE:
 *   Gives Shadow its own structured reasoning layer — not a giant LLM and
 *   NOT thousands of if-then canned answers.
 *
 *   This module provides compositional reasoning capabilities that work from
 *   Shadow's existing understanding + language analysis output.
 *
 * CAPABILITIES:
 *   - Intent decomposition (multi-step request analysis)
 *   - Task planning (ordered steps from a goal)
 *   - Question decomposition (break a complex question into sub-questions)
 *   - Context resolution (what is this conversation actually about?)
 *   - Cause / effect reasoning (X is happening, what are the possible causes?)
 *   - Comparison reasoning (compare A vs B across dimensions)
 *   - Constraint handling (what cannot / must be done)
 *   - Step ordering (what must happen before what)
 *   - Fact retrieval integration (delegate to SRKnowledge / SRKnowledgeLearner)
 *   - Tool selection (which Shadow capability should handle this query)
 *   - Confidence estimation (how certain is Shadow about a conclusion)
 *   - Uncertainty / clarification decisions (should Shadow ask a follow-up?)
 *
 * REASONING OBJECT (internal, never shown to user):
 *   {
 *     taskType:          string,   // 'diagnosis' | 'comparison' | 'explanation' | ...
 *     subject:           string,
 *     observations:      string[],
 *     constraints:       string[],
 *     relevantKnowledge: string[],
 *     toolsNeeded:       string[],
 *     steps:             string[],
 *     confidence:        number,  // 0–1
 *     needsClarification: boolean,
 *     clarificationHint: string | null,
 *   }
 *
 * DESIGN RULES:
 *   - Zero external AI calls.
 *   - No canned per-prompt answers.
 *   - All reasoning is compositional from semantic structures.
 *   - Internal reasoning object is NEVER exposed to users in raw form.
 *   - Only the conclusion / summary / steps are surfaced.
 *
 * Zero polling. Zero RAF. Zero setInterval.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-REASONING-CORE-1';

  // ─── Task type registry ───────────────────────────────────────────────────
  var TASK_TYPE = {
    DIAGNOSIS:    'diagnosis',
    EXPLANATION:  'explanation',
    COMPARISON:   'comparison',
    HOW_TO:       'how_to',
    PLANNING:     'planning',
    EVALUATION:   'evaluation',
    RETRIEVAL:    'retrieval',
    CONVERSATION: 'conversation',
    CALCULATION:  'calculation',
    UNKNOWN:      'unknown',
  };

  // ─── Tool identifiers (for tool selection output) ─────────────────────────
  var TOOL = {
    KNOWLEDGE:    'KNOWLEDGE',
    MEMORY:       'MEMORY',
    WEATHER:      'WEATHER',
    ELECTRONICS:  'ELECTRONICS',
    CODING:       'CODING',
    CALCULATION:  'CALCULATION',
    LANGUAGE:     'LANGUAGE',
    CONVERSATION: 'CONVERSATION',
  };

  // ─── Domain keyword banks ─────────────────────────────────────────────────
  // Each domain: list of signal words that indicate relevance.
  // These are deliberately broad semantic clusters, not exact phrases.

  var DOMAIN_SIGNALS = {
    hardware: [
      'computer','pc','laptop','desktop','motherboard','gpu','cpu','ram','memory',
      'ssd','hard drive','hdd','display','monitor','screen','keyboard','mouse',
      'power supply','psu','usb','hdmi','fan','heat','boot','bios','uefi','post',
      'beep','no display','black screen','won\'t turn on','turns on','powers on',
      'device','port','cable','charging','battery',
    ],
    software: [
      'app','application','program','software','install','crash','update','driver',
      'browser','windows','linux','mac','os','operating system','error','bug',
      'freeze','slow','lag','restart','reboot','unresponsive',
    ],
    network: [
      'wifi','wi-fi','internet','network','connection','disconnect','router',
      'dns','ip','vpn','ping','speed','bandwidth','latency','packet','firewall',
    ],
    code: [
      'code','function','variable','loop','array','object','class','async','await',
      'promise','api','rest','fetch','http','json','html','css','javascript','js',
      'python','node','npm','git','github','error','exception','stack trace',
      'undefined','null','bug','debug','syntax','import','export','module',
    ],
    electronics: [
      'circuit','resistor','capacitor','transistor','diode','voltage','current',
      'ohm','amp','watt','led','arduino','raspberry','solder','pcb','schematic',
      'breadboard','multimeter','oscilloscope','component','short circuit','ground',
    ],
  };

  // ─── Cause/effect knowledge banks ────────────────────────────────────────
  // Key = observation/symptom, Value = array of likely cause categories.
  // This is STRUCTURED reasoning, not a lookup table of pre-written answers.

  var CAUSE_EFFECT_MAP = {
    'no display':    ['GPU/video output', 'RAM seating', 'POST failure', 'monitor/cable', 'motherboard', 'power delivery'],
    'won\'t boot':   ['power supply', 'boot device', 'corrupted OS', 'RAM', 'BIOS settings', 'hardware failure'],
    'overheating':   ['thermal paste', 'fan failure', 'dust/airflow', 'workload spike', 'inadequate cooling'],
    'slow':          ['background processes', 'storage health', 'RAM saturation', 'thermal throttling', 'fragmentation', 'malware'],
    'crash':         ['driver conflict', 'memory error', 'overheating', 'corrupted file', 'power issue', 'software bug'],
    'no internet':   ['DNS misconfiguration', 'router issue', 'ISP outage', 'firewall rule', 'adapter driver', 'IP conflict'],
    'undefined':     ['variable not declared', 'scope error', 'async timing', 'missing import', 'typo in name'],
    'null pointer':  ['uninitialized variable', 'missing null check', 'async race condition', 'deleted object reference'],
    'not rendering': ['DOM error', 'CSS conflict', 'JS exception blocking render', 'wrong selector', 'z-index', 'display:none'],
  };

  // ─── Comparison dimension banks ───────────────────────────────────────────
  // When asked to compare X vs Y, which dimensions apply for which domain?

  var COMPARISON_DIMENSIONS = {
    code:        ['syntax', 'performance', 'readability', 'ecosystem', 'use case', 'learning curve'],
    hardware:    ['performance', 'price', 'compatibility', 'power consumption', 'reliability', 'form factor'],
    software:    ['features', 'performance', 'UI/UX', 'cost', 'platform support', 'community'],
    electronics: ['voltage range', 'current capacity', 'package size', 'cost', 'availability', 'specifications'],
    general:     ['purpose', 'advantages', 'disadvantages', 'use cases', 'cost', 'complexity'],
  };

  // ─── Helper utilities ─────────────────────────────────────────────────────

  function _lower(str) {
    return typeof str === 'string' ? str.toLowerCase() : '';
  }

  function _tokenize(text) {
    return _lower(text).replace(/[^\w\s]/g, ' ').split(/\s+/).filter(function (t) { return t.length > 1; });
  }

  function _hasAny(tokens, wordList) {
    for (var i = 0; i < wordList.length; i++) {
      var w = wordList[i];
      if (w.indexOf(' ') !== -1) {
        if (_lower(tokens.join(' ')).indexOf(w) !== -1) return true;
      } else {
        if (tokens.indexOf(w) !== -1) return true;
      }
    }
    return false;
  }

  // Detect which domain(s) are relevant to this message
  function _detectDomains(tokens) {
    var found = [];
    var domainKeys = Object.keys(DOMAIN_SIGNALS);
    for (var i = 0; i < domainKeys.length; i++) {
      var d = domainKeys[i];
      if (_hasAny(tokens, DOMAIN_SIGNALS[d])) found.push(d);
    }
    return found;
  }

  // Detect diagnostic/troubleshooting signals
  function _isDiagnosticQuery(lower) {
    return /\b(why|why does|why is|why won'?t|why can'?t|what'?s wrong|not working|doesn'?t work|won'?t|can'?t|broken|failing|fail|error|issue|problem|trouble|no display|black screen|won'?t boot|won'?t start|keeps crashing|not responding|not turning|wont turn|won'?t turn|crash|crashes|crashing|won'?t open|not open|won'?t load|not load|overheat|overheating|too hot|getting hot|running hot|disconnecting|disconnects)\b/i.test(lower);
  }

  // Detect "how to" / procedural signals
  function _isHowTo(lower) {
    return /\b(how (do|can|to|should)|how do i|how to|steps to|what are the steps|walk me through)\b/i.test(lower);
  }

  // Detect comparison signals
  function _isComparison(lower) {
    return /\b(vs|versus|compare|difference between|which is better|what'?s the difference|pros and cons|advantages|disadvantages)\b/i.test(lower);
  }

  // Detect explanation signals
  function _isExplanation(lower) {
    return /\b(explain|what is|what does|what are|describe|tell me about|how does|how do)\b/i.test(lower);
  }

  // Detect planning signals
  function _isPlanning(lower) {
    return /\b(plan|build|create|make|set up|design|implement|develop|write|start|begin)\b/i.test(lower);
  }

  // Find matching cause-effect entries for a set of tokens
  function _matchCauseEffect(tokens) {
    var text = tokens.join(' ');
    var matched = [];
    var keys = Object.keys(CAUSE_EFFECT_MAP);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (text.indexOf(k) !== -1 || _hasAny(tokens, k.split(' '))) {
        CAUSE_EFFECT_MAP[k].forEach(function (cause) {
          if (matched.indexOf(cause) === -1) matched.push(cause);
        });
      }
    }
    return matched;
  }

  // Extract subjects (nouns or noun phrases) from tokens — simplified heuristic
  function _extractSubject(text) {
    // Extract the most prominent noun phrase candidate
    var m = text.match(
      /(?:my|the|a|an|this|that)?\s*([a-z][a-z0-9\-_/]+(?:\s+[a-z][a-z0-9\-_/]+){0,2})/i
    );
    return m ? m[1].trim() : '';
  }

  // ─── classify() ───────────────────────────────────────────────────────────
  /**
   * Classify a user message into a task type.
   * Returns { taskType, domains, isDiagnostic, isComparison, isHowTo, isPlanning }
   */
  function classify(message) {
    var lower = _lower(message);
    var tokens = _tokenize(message);
    var domains = _detectDomains(tokens);

    var isDiagnostic  = _isDiagnosticQuery(lower);
    var isHowTo       = _isHowTo(lower);
    var isComparison  = _isComparison(lower);
    var isExplanation = _isExplanation(lower);
    var isPlanning    = _isPlanning(lower);

    var taskType;
    if (isDiagnostic)       taskType = TASK_TYPE.DIAGNOSIS;
    else if (isHowTo)       taskType = TASK_TYPE.HOW_TO;
    else if (isComparison)  taskType = TASK_TYPE.COMPARISON;
    else if (isExplanation) taskType = TASK_TYPE.EXPLANATION;
    else if (isPlanning)    taskType = TASK_TYPE.PLANNING;
    else                    taskType = TASK_TYPE.CONVERSATION;

    // Coding domain overrides to EXPLANATION/HOW_TO if relevant
    if (domains.indexOf('code') !== -1 && taskType === TASK_TYPE.CONVERSATION) {
      taskType = TASK_TYPE.EXPLANATION;
    }

    return {
      taskType:     taskType,
      domains:      domains,
      isDiagnostic: isDiagnostic,
      isComparison: isComparison,
      isHowTo:      isHowTo,
      isExplanation: isExplanation,
      isPlanning:   isPlanning,
    };
  }

  // ─── reason() ─────────────────────────────────────────────────────────────
  /**
   * Main reasoning entry point.
   *
   * @param  {string} message     — the user's raw message
   * @param  {object} understood  — output of SRUnderstanding.understand()
   * @param  {object} context     — output of SRContext.update()
   * @param  {object} [opts]      — { langAnalysis, knowledgeSnippet, memorySnippets, recentTurns }
   * @returns {ReasoningResult}
   *
   * ReasoningResult:
   *   {
   *     taskType, subject, observations, constraints,
   *     possibleCauses, comparisonDimensions, steps,
   *     toolsNeeded, confidence, needsClarification,
   *     clarificationHint, domains, summary
   *   }
   */
  function reason(message, understood, context, opts) {
    opts = opts || {};
    var lower = _lower(message);
    var tokens = _tokenize(message);

    var classification = classify(message);
    var taskType = classification.taskType;
    var domains  = classification.domains;

    // ── Subject extraction ──────────────────────────────────────────────────
    var subject = '';
    if (understood && understood.entities) {
      subject = understood.entities.projectName
             || understood.entities.topic
             || understood.entities.subject
             || '';
    }
    if (!subject) subject = _extractSubject(message);

    // ── Observation collection ──────────────────────────────────────────────
    var observations = [];
    // Collect explicit symptom words from message
    ['error','crash','freeze','slow','not working','no display','black screen',
     'won\'t boot','won\'t start','overheating','disconnect','undefined','null']
      .forEach(function (sym) {
        if (lower.indexOf(sym) !== -1) observations.push(sym);
      });

    // Add recent-turn context signals
    if (opts.recentTurns) {
      opts.recentTurns.slice(-3).forEach(function (t) {
        if (t.role === 'user' && t.text) {
          var tl = _lower(t.text);
          if (tl.indexOf('error') !== -1 || tl.indexOf('not working') !== -1) {
            observations.push('previous: ' + t.text.substring(0, 60));
          }
        }
      });
    }

    // ── Constraint extraction ───────────────────────────────────────────────
    var constraints = [];
    if (/don'?t|do not|never|without|no budget|budget|only|must not|can'?t use/i.test(lower)) {
      var cm = message.match(/(don'?t|do not|never|without|no|must not|can'?t use)[^,.]+/gi);
      if (cm) cm.slice(0, 3).forEach(function (c) { constraints.push(c.trim()); });
    }

    // ── Possible causes (for diagnostic task type) ──────────────────────────
    var possibleCauses = [];
    if (taskType === TASK_TYPE.DIAGNOSIS) {
      possibleCauses = _matchCauseEffect(tokens);
      // Supplement with domain-specific causes
      if (domains.indexOf('hardware') !== -1 && possibleCauses.length === 0) {
        possibleCauses = ['hardware component failure', 'connection/cable issue', 'driver problem', 'power supply', 'configuration'];
      }
      if (domains.indexOf('software') !== -1 && possibleCauses.length === 0) {
        possibleCauses = ['software bug', 'driver conflict', 'corrupted installation', 'missing dependency', 'permission issue'];
      }
      if (domains.indexOf('code') !== -1 && possibleCauses.length === 0) {
        possibleCauses = ['logic error', 'uninitialized variable', 'async race condition', 'wrong scope', 'missing null check', 'typo'];
      }
      if (domains.indexOf('network') !== -1 && possibleCauses.length === 0) {
        possibleCauses = ['DNS issue', 'router/gateway', 'ISP', 'firewall', 'IP conflict', 'adapter driver'];
      }
    }

    // ── Comparison dimensions ───────────────────────────────────────────────
    var comparisonDimensions = [];
    if (taskType === TASK_TYPE.COMPARISON) {
      var domainForComp = domains.length > 0 ? domains[0] : 'general';
      comparisonDimensions = COMPARISON_DIMENSIONS[domainForComp] || COMPARISON_DIMENSIONS.general;
    }

    // ── Step generation (how-to / planning) ────────────────────────────────
    var steps = [];
    if (taskType === TASK_TYPE.HOW_TO || taskType === TASK_TYPE.PLANNING) {
      // Generic problem-solving steps adjusted by domain
      if (domains.indexOf('code') !== -1) {
        steps = [
          'Understand the requirement',
          'Plan the data structures and function signatures',
          'Write the core logic',
          'Handle edge cases and errors',
          'Test with representative inputs',
          'Refactor for clarity',
        ];
      } else if (domains.indexOf('hardware') !== -1) {
        steps = [
          'Identify the component to work with',
          'Check compatibility requirements',
          'Gather necessary tools',
          'Follow safety precautions (power off, ESD)',
          'Perform the operation step by step',
          'Test and verify the result',
        ];
      } else if (domains.indexOf('electronics') !== -1) {
        steps = [
          'Review the schematic/circuit',
          'Verify component values and ratings',
          'Prepare the breadboard or PCB',
          'Place and wire components',
          'Apply power and measure outputs',
          'Debug any discrepancies',
        ];
      } else {
        steps = [
          'Define the goal clearly',
          'Identify the required resources or information',
          'Break the problem into sub-tasks',
          'Execute sub-tasks in order',
          'Verify the outcome',
          'Adjust if needed',
        ];
      }
    }

    // ── Tool selection ──────────────────────────────────────────────────────
    var toolsNeeded = [];
    if (domains.indexOf('code') !== -1)        toolsNeeded.push(TOOL.CODING);
    if (domains.indexOf('electronics') !== -1)  toolsNeeded.push(TOOL.ELECTRONICS);
    if (/weather|temperature|forecast|rain|snow|wind/i.test(lower)) toolsNeeded.push(TOOL.WEATHER);
    if (/calculator|\bmath\b|calculate|equation|\d+\s*[+\-*/]\s*\d+/i.test(lower)) toolsNeeded.push(TOOL.CALCULATION);
    if (taskType === TASK_TYPE.CONVERSATION && toolsNeeded.length === 0) toolsNeeded.push(TOOL.CONVERSATION);
    if (toolsNeeded.length === 0) toolsNeeded.push(TOOL.KNOWLEDGE);

    // ── Confidence estimation ───────────────────────────────────────────────
    // Higher when: domains are identified, causes/steps found, knowledge available.
    // Lower when: subject is ambiguous, message is very short.
    var confidence = 0.5;
    if (domains.length > 0)          confidence += 0.15;
    if (possibleCauses.length > 0)   confidence += 0.15;
    if (steps.length > 0)            confidence += 0.10;
    if (opts.knowledgeSnippet)       confidence += 0.10;
    if (message.length < 10)         confidence -= 0.15;
    if (subject.length < 2)          confidence -= 0.05;
    confidence = Math.max(0.1, Math.min(1.0, confidence));

    // ── Clarification decision ──────────────────────────────────────────────
    var needsClarification = false;
    var clarificationHint  = null;
    if (confidence < 0.35 || (taskType === TASK_TYPE.DIAGNOSIS && observations.length === 0)) {
      needsClarification = true;
      if (taskType === TASK_TYPE.DIAGNOSIS) {
        clarificationHint = 'Can you describe exactly what symptom you\'re seeing?';
      } else if (subject.length < 2) {
        clarificationHint = 'What specifically are you referring to?';
      } else {
        clarificationHint = 'Can you give me more detail?';
      }
    }

    // ── Relevant knowledge integration ─────────────────────────────────────
    var relevantKnowledge = [];
    if (opts.knowledgeSnippet) relevantKnowledge.push(opts.knowledgeSnippet.substring(0, 200));
    if (opts.memorySnippets && opts.memorySnippets.length) {
      opts.memorySnippets.slice(0, 2).forEach(function (m) {
        var c = m && (m.content || m.text || m);
        if (typeof c === 'string') relevantKnowledge.push(c.substring(0, 100));
      });
    }

    // ── Summary (internal only — not exposed to user directly) ─────────────
    var summary = [
      'Task: ' + taskType,
      subject ? 'Subject: ' + subject : null,
      domains.length ? 'Domain: ' + domains.join(', ') : null,
      possibleCauses.length ? 'Possible causes: ' + possibleCauses.slice(0,4).join('; ') : null,
      steps.length ? 'Steps: ' + steps.length + ' identified' : null,
      'Confidence: ' + Math.round(confidence * 100) + '%',
    ].filter(Boolean).join(' | ');

    return {
      taskType:              taskType,
      subject:               subject,
      observations:          observations,
      constraints:           constraints,
      possibleCauses:        possibleCauses,
      comparisonDimensions:  comparisonDimensions,
      steps:                 steps,
      relevantKnowledge:     relevantKnowledge,
      toolsNeeded:           toolsNeeded,
      confidence:            confidence,
      needsClarification:    needsClarification,
      clarificationHint:     clarificationHint,
      domains:               domains,
      summary:               summary,
      _classification:       classification,
    };
  }

  // ─── composeReasoningContext() ────────────────────────────────────────────
  /**
   * Converts a reasoning result into a concise context string that can be
   * injected into the model's system context to guide response generation.
   *
   * NEVER contains internal trace data — only informative guidance.
   */
  function composeReasoningContext(reasoningResult) {
    if (!reasoningResult) return null;

    var parts = [];
    var r = reasoningResult;

    if (r.taskType === TASK_TYPE.DIAGNOSIS && r.possibleCauses.length > 0) {
      parts.push('Consider these likely cause categories: ' + r.possibleCauses.slice(0,4).join(', ') + '.');
    }

    if (r.taskType === TASK_TYPE.COMPARISON && r.comparisonDimensions.length > 0) {
      parts.push('Compare across: ' + r.comparisonDimensions.slice(0,4).join(', ') + '.');
    }

    if ((r.taskType === TASK_TYPE.HOW_TO || r.taskType === TASK_TYPE.PLANNING) && r.steps.length > 0) {
      parts.push('Approach with these phases: ' + r.steps.slice(0,4).join(' → ') + '.');
    }

    if (r.constraints.length > 0) {
      parts.push('Constraints noted: ' + r.constraints.slice(0,2).join('; ') + '.');
    }

    if (r.needsClarification) {
      parts.push('May need to ask: ' + r.clarificationHint);
    }

    return parts.length > 0 ? parts.join(' ') : null;
  }

  // ─── decomposeQuestion() ──────────────────────────────────────────────────
  /**
   * Breaks a complex question into simpler sub-questions Shadow can answer.
   * Used to guide multi-step responses for complex queries.
   */
  function decomposeQuestion(message) {
    var lower = _lower(message);
    var tokens = _tokenize(message);
    var subQuestions = [];

    // Check for multi-part questions
    var parts = message.split(/(?:\band\b|\balso\b|\bplus\b|,|\?)/gi).filter(function (p) {
      return p.trim().length > 8;
    });

    if (parts.length >= 2) {
      parts.forEach(function (p) {
        var trimmed = p.trim();
        if (trimmed.length > 8) subQuestions.push(trimmed);
      });
    }

    // Detect implicit decomposition needs
    var classification = classify(message);
    if (classification.isDiagnostic) {
      if (subQuestions.length === 0) {
        subQuestions.push('What is the observed symptom?');
        subQuestions.push('What are the likely causes?');
        subQuestions.push('What diagnostic steps should be taken?');
      }
    }

    return {
      original:     message,
      subQuestions: subQuestions,
      isComplex:    subQuestions.length > 1,
      domains:      classification.domains,
    };
  }

  // ─── selectTool() ────────────────────────────────────────────────────────
  /**
   * Quickly selects which Shadow tool(s) are best suited to a query.
   * Returns array of TOOL constants in priority order.
   */
  function selectTool(message) {
    var lower = _lower(message);
    var tools = [];

    if (/weather|forecast|temperature|rain|snow|wind speed|humidity/i.test(lower)) {
      tools.push(TOOL.WEATHER);
    }
    if (/resistor|capacitor|transistor|voltage|circuit|schematic|ohm|watt|amp|pcb|solder|arduino/i.test(lower)) {
      tools.push(TOOL.ELECTRONICS);
    }
    if (/code|function|async|await|promise|javascript|python|html|css|bug|error|syntax|api route|service worker/i.test(lower)) {
      tools.push(TOOL.CODING);
    }
    if (/\d+\s*[+\-*/]\s*\d+|calculate|what is \d+|how many|percent of|\bmath\b/i.test(lower)) {
      tools.push(TOOL.CALCULATION);
    }
    if (/remember|my name|my project|what did i say|tell me about my/i.test(lower)) {
      tools.push(TOOL.MEMORY);
    }
    if (/shadow nexus|sns|creator|chris|founder/i.test(lower)) {
      tools.push(TOOL.KNOWLEDGE);
    }
    if (tools.length === 0) tools.push(TOOL.CONVERSATION);
    return tools;
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  global.SRReasoningCore = {
    BUILD_ID:               BUILD_ID,
    TASK_TYPE:              TASK_TYPE,
    TOOL:                   TOOL,

    // Core API
    classify:               classify,
    reason:                 reason,
    composeReasoningContext: composeReasoningContext,
    decomposeQuestion:      decomposeQuestion,
    selectTool:             selectTool,
  };

})(typeof window !== 'undefined' ? window : global);
