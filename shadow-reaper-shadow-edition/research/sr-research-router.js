/**
 * shadow-reaper-shadow-edition/research/sr-research-router.js
 * Shadow Reaper — Research Router
 *
 * Build: SR-RESEARCH-ROUTER-1
 *
 * Exposes: window.SRResearchRouter
 *
 * PURPOSE:
 *   Classifies incoming queries and routes them to the correct data source.
 *   This is a ROUTING layer — not a brain. All results feed into Shadow Reaper.
 *
 * ROUTING OUTCOMES:
 *   LOCAL_KNOWLEDGE   — Answer from Shadow Reaper's own knowledge base
 *   CALCULATION       — Numeric/math: route to SRNumberIntelligence
 *   WEATHER           — Weather query: route to SRWeather
 *   INTERNET_RESEARCH — Fresh factual info: route to SRWebResearch
 *   NOT_ALLOWED       — Blocked category (political/electoral)
 *   NOT_NEEDED        — Casual conversation; no lookup required
 *
 * POLITICAL EXCLUSION (NON-NEGOTIABLE):
 *   Elections, voting, candidates, political parties, campaigns, ballot
 *   measures, poll data, and electoral predictions are NOT_ALLOWED.
 *   Shadow Reaper does not provide political research.
 *
 * SECURITY CONTRACT:
 *   - Research results are ALWAYS labelled UNTRUSTED
 *   - This router NEVER modifies the results; it only routes
 *   - Political exclusion is enforced before any external call
 *   - Sensitive data (passwords, API keys) is never forwarded
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-RESEARCH-ROUTER-1';

  // ─── Route types ─────────────────────────────────────────────────────────────
  var ROUTE = {
    LOCAL_KNOWLEDGE:   'LOCAL_KNOWLEDGE',
    CALCULATION:       'CALCULATION',
    WEATHER:           'WEATHER',
    INTERNET_RESEARCH: 'INTERNET_RESEARCH',
    NOT_ALLOWED:       'NOT_ALLOWED',
    NOT_NEEDED:        'NOT_NEEDED',
  };

  // ─── Political / electoral exclusion patterns ─────────────────────────────────
  // These queries are explicitly excluded. Shadow Reaper does not perform
  // political research, provide electoral predictions, or take political positions.
  var _POLITICAL_PATTERNS = [
    /\b(elect(?:ion|oral|ed)|vote[sd]?|voting|caucus|caucuses)\b/i,
    /\b(ballot|ballots|mail.in\s+ballot|absentee\s+ballot)\b/i,
    /\b(democrat|republican|conservative|liberal|labour|tory|gop)\b/i,
    /\b(candidate|candidates)\b.{0,40}\b(senate|house|congress|president|governor|mayor|office)\b/i,
    /\b(senate|house|congress|president|governor|mayor)\b.{0,40}\b(candidate|campaign|race|poll|primary)\b/i,
    /\b(campaign|campaigns|campaigning)\b.{0,30}\b(senate|house|president|governor|mayor|office)\b/i,
    /\bpolling\s+numbers\b/i,
    /\b(poll\s*(?:ing)?)\b.{0,20}\b(candidate|race|election|political|party)\b/i,
    /\bwho\s+(is\s+)?(winning|ahead|leading).{0,20}\b(election|race|poll|vote)\b/i,
    /\b(swing\s+state|electoral\s+college|voter\s+fraud)\b/i,
    /\b(political\s+party|third\s+party|independent\s+candidate)\b/i,
    /\bshould\s+i\s+vote\b/i,
    /\bprimary\s+election\b/i,
    /\bvoting\s+results?\b/i,
  ];

  // ─── Calculation detection patterns ──────────────────────────────────────────
  var _CALC_PATTERNS = [
    /\b\d+\s*[\+\-\*\/\^]\s*\d+/,                               // 5 + 3, 10 * 4
    /\bwhat\s+is\s+\d[\d,\.]*\s*(plus|minus|times|divided|multiplied)\b/i,
    /\bcalculate\b/i,
    /\bcompute\b/i,
    /\b\d+\s*%\s+of\s+\d/,                                      // 15% of 200
    /\bhow\s+much\s+is\s+\d/i,
    /\bwhat('s|s|\s+is)\s+\d[\d,\.]*\s*(percent|%)\s+of\b/i,
    /\bsquare\s+root\s+of\b/i,
    /\b\d+\s+to\s+the\s+(power|squared|cubed)\b/i,
    /\bconvert\s+\d/i,                                           // "convert 5 miles to km"
  ];

  // ─── Weather detection patterns ───────────────────────────────────────────────
  var _WEATHER_PATTERNS = [
    /\bweather\b/i,
    /\btemperature\b.{0,25}\b(outside|today|now|current|forecast)\b/i,
    /\b(current|today('s)?|tonight('s)?|tomorrow('s)?|this\s+week('s)?)\s+(forecast|weather)\b/i,
    /\bwill\s+it\s+(rain|snow|storm|be\s+hot|be\s+cold|be\s+sunny)\b/i,
    /\bis\s+it\s+(raining|snowing|sunny|cloudy|hot|cold)\b/i,
    /\bforecast\b/i,
    /\bhumidity\b/i,
    /\bwind\s+(speed|chill|conditions)\b/i,
    /\bchance\s+of\s+(rain|snow|storms?)\b/i,
  ];

  // ─── Internet research detection patterns ────────────────────────────────────
  // These patterns identify queries that likely need fresh external information.
  var _RESEARCH_PATTERNS = [
    // Current / real-time queries
    /\b(latest|recent|current|live|breaking|this\s+week|this\s+month|this\s+year|right\s+now)\b/i,
    /\b(news|headline|announcement|just\s+released|just\s+happened)\b/i,
    /\bstock\s+(price|market|ticker)\b/i,
    /\b(crypto|bitcoin|ethereum)\s+(price|value|rate)\b/i,
    /\bexchange\s+rate\b/i,
    /\b(open|closed|hours)\b.{0,20}\b(now|today)\b/i,
    // Factual lookups that may need verification
    /\b(who\s+is|who\s+was|who\s+are)\b/i,
    /\bwhat\s+(is|was|are|were)\b.{0,30}\b(ceo|founder|president|prime\s+minister|director|head)\b/i,
    /\b(how\s+many|how\s+much|how\s+tall|how\s+far|how\s+big|how\s+old)\b/i,
    /\bwhen\s+(was|did|is|will)\b/i,
    /\bwhere\s+(is|was|are|were)\s+\w+\s+located\b/i,
    /\bwhat\s+year\s+(did|was|is)\b/i,
    /\bdefine\b|\bdefinition\s+of\b/i,
    /\blook\s+up\b|\bsearch\s+for\b|\bfind\s+(out|me|information)\b/i,
  ];

  // ─── Conversational / no-lookup patterns ─────────────────────────────────────
  // These are clearly conversational and do not need any data source.
  var _CONVERSATIONAL_PATTERNS = [
    /^(hi|hey|hello|yo|sup|what'?s up|howdy|greetings)[\s!?.,]*$/i,
    /^(how are you|how's it going|how do you do|what('s|s) new)[\s?.,!]*$/i,
    /^(thanks?|thank you|thx|ty|cool|ok|okay|great|nice|awesome|sure|yep|nope|yes|no)[\s!.,]*$/i,
    /^(lol|lmao|haha|hehe|xd)[\s!.,]*$/i,
    /^(good\s+(morning|afternoon|evening|night))[\s!.,]*$/i,
    /^(bye|goodbye|later|see\s+ya|cya)[\s!.,]*$/i,
    /\bcan\s+you\s+help\s+(me\s+)?(with|to)\b/i,
    /\bhelp\s+me\s+(write|draft|create|think)\b/i,
    /\bwrite\s+(me\s+)?(a\s+)?(story|poem|letter|email|code|script|essay|song)\b/i,
    /\blet'?s\s+talk\b/i,
    /\bwhat\s+(do\s+you\s+think|is\s+your\s+opinion|would\s+you\s+say)\b/i,
    /\btell\s+me\s+about\s+(yourself|your)\b/i,
  ];

  // ─── Helpers ──────────────────────────────────────────────────────────────────
  function _numIntl() { return global.SRNumberIntelligence || null; }
  function _weather() { return global.SRWeather            || null; }
  function _web()     { return global.SRWebResearch         || null; }

  // ─── Political check ──────────────────────────────────────────────────────────
  function _isPolitical(text) {
    return _POLITICAL_PATTERNS.some(function (p) { return p.test(text); });
  }

  // ─── Sensitive data check ─────────────────────────────────────────────────────
  function _hasSensitiveData(text) {
    var sec = global.SRSecurity;
    if (sec && sec.containsSensitiveData) {
      return !!sec.containsSensitiveData(text);
    }
    // Fallback
    return /my\s+password\s+is|api[\s_-]*key[\s:=]|secret[\s:=]/i.test(text);
  }

  // ─── Classification ───────────────────────────────────────────────────────────
  /**
   * classify(text)
   * Returns { route, reason } where route is one of the ROUTE values.
   */
  function classify(text) {
    if (!text || typeof text !== 'string' || !text.trim()) {
      return { route: ROUTE.NOT_NEEDED, reason: 'empty_query' };
    }
    var t = text.trim();

    // 1. Sensitive data: never route externally
    if (_hasSensitiveData(t)) {
      return { route: ROUTE.NOT_NEEDED, reason: 'sensitive_data' };
    }

    // 2. Political exclusion (checked before any external routing)
    if (_isPolitical(t)) {
      return { route: ROUTE.NOT_ALLOWED, reason: 'political_exclusion' };
    }

    // 3. Conversational — no lookup needed
    if (_CONVERSATIONAL_PATTERNS.some(function (p) { return p.test(t); })) {
      return { route: ROUTE.NOT_NEEDED, reason: 'conversational' };
    }

    // 4. Calculation
    var numIntl = _numIntl();
    if (numIntl && numIntl.detectCalculation) {
      var calcCheck = numIntl.detectCalculation(t);
      if (calcCheck && calcCheck.isCalc) {
        return { route: ROUTE.CALCULATION, reason: 'math_detected' };
      }
    }
    if (_CALC_PATTERNS.some(function (p) { return p.test(t); })) {
      return { route: ROUTE.CALCULATION, reason: 'calc_pattern' };
    }

    // 5. Weather
    if (_WEATHER_PATTERNS.some(function (p) { return p.test(t); })) {
      return { route: ROUTE.WEATHER, reason: 'weather_pattern' };
    }

    // 6. Internet research (only when WebResearch module is configured)
    if (_RESEARCH_PATTERNS.some(function (p) { return p.test(t); })) {
      var web = _web();
      if (web && web.isReady && web.isReady()) {
        return { route: ROUTE.INTERNET_RESEARCH, reason: 'research_pattern' };
      }
      // Research module not configured — fall through to local knowledge
      return { route: ROUTE.LOCAL_KNOWLEDGE, reason: 'research_not_configured' };
    }

    // 7. Default: local knowledge / Shadow Reaper's own answer
    return { route: ROUTE.LOCAL_KNOWLEDGE, reason: 'default' };
  }

  // ─── Dispatch ─────────────────────────────────────────────────────────────────
  /**
   * dispatch(text, knowledgeResult, callback)
   *
   * Routes the query to the appropriate data source and returns a result object.
   *
   * knowledgeResult: the result from SRKnowledge.query() or null
   *   (if local knowledge is already available, research is skipped)
   *
   * callback(result):
   *   result.route:       string (which route was taken)
   *   result.ok:          boolean
   *   result.data:        the retrieved data (calculation result, weather, research, etc.)
   *   result.reason:      string
   *   result.trusted:     boolean (false for web research; true for local)
   *   result.notAllowed:  boolean (true if political exclusion applied)
   */
  function dispatch(text, knowledgeResult, callback) {
    if (typeof knowledgeResult === 'function') {
      callback = knowledgeResult;
      knowledgeResult = null;
    }
    callback = callback || function () {};

    var classification = classify(text);
    var route = classification.route;

    // If local knowledge is already available, prefer it over internet research
    if (knowledgeResult && knowledgeResult.content && route === ROUTE.INTERNET_RESEARCH) {
      route = ROUTE.LOCAL_KNOWLEDGE;
      classification = { route: ROUTE.LOCAL_KNOWLEDGE, reason: 'knowledge_available' };
    }

    // ── NOT_ALLOWED ──────────────────────────────────────────────────────────
    if (route === ROUTE.NOT_ALLOWED) {
      callback({
        route:      ROUTE.NOT_ALLOWED,
        ok:         false,
        data:       null,
        reason:     'political_exclusion',
        trusted:    true,
        notAllowed: true,
        message:    'Shadow Reaper does not provide political or electoral research.',
      });
      return;
    }

    // ── NOT_NEEDED / LOCAL_KNOWLEDGE ─────────────────────────────────────────
    if (route === ROUTE.NOT_NEEDED || route === ROUTE.LOCAL_KNOWLEDGE) {
      callback({
        route:   route,
        ok:      true,
        data:    knowledgeResult || null,
        reason:  classification.reason,
        trusted: true,
      });
      return;
    }

    // ── CALCULATION ──────────────────────────────────────────────────────────
    if (route === ROUTE.CALCULATION) {
      var numIntl = _numIntl();
      if (numIntl) {
        var calcResult = numIntl.calculate(text);
        if (calcResult && calcResult.ok) {
          callback({
            route:   ROUTE.CALCULATION,
            ok:      true,
            data:    calcResult,
            reason:  'calculated',
            trusted: true,
          });
          return;
        }
        // Calculation failed — fall through to normal pipeline
        callback({
          route:   ROUTE.CALCULATION,
          ok:      false,
          data:    null,
          reason:  'calculation_failed',
          trusted: true,
        });
      } else {
        callback({
          route:   ROUTE.CALCULATION,
          ok:      false,
          data:    null,
          reason:  'number_intelligence_unavailable',
          trusted: true,
        });
      }
      return;
    }

    // ── WEATHER ──────────────────────────────────────────────────────────────
    if (route === ROUTE.WEATHER) {
      var wx = _weather();
      if (wx && wx.query) {
        wx.query(text, function (result) {
          callback({
            route:   ROUTE.WEATHER,
            ok:      !!(result && result.ok),
            data:    result || null,
            reason:  result ? (result.reason || 'weather_result') : 'weather_failed',
            trusted: true,   // Weather data from a known source (Open-Meteo)
          });
        });
      } else {
        callback({
          route:   ROUTE.WEATHER,
          ok:      false,
          data:    null,
          reason:  'weather_module_unavailable',
          trusted: true,
        });
      }
      return;
    }

    // ── INTERNET_RESEARCH ─────────────────────────────────────────────────────
    if (route === ROUTE.INTERNET_RESEARCH) {
      var web = _web();
      if (web && web.isReady && web.isReady()) {
        // Use SRWebResearch's needsResearch guard as a double-check
        if (web.needsResearch && !web.needsResearch(text, knowledgeResult)) {
          callback({
            route:   ROUTE.LOCAL_KNOWLEDGE,
            ok:      true,
            data:    knowledgeResult || null,
            reason:  'local_knowledge_sufficient',
            trusted: true,
          });
          return;
        }
        web.query(text, { maxResults: 3 }, function (result) {
          callback({
            route:   ROUTE.INTERNET_RESEARCH,
            ok:      !!(result && result.ok),
            data:    result || null,
            reason:  result ? (result.reason || 'research_result') : 'research_failed',
            trusted: false,   // ALWAYS false for web content
          });
        });
      } else {
        callback({
          route:   ROUTE.LOCAL_KNOWLEDGE,
          ok:      true,
          data:    knowledgeResult || null,
          reason:  'research_not_configured',
          trusted: true,
        });
      }
      return;
    }

    // Fallback (should not reach here)
    callback({ route: ROUTE.NOT_NEEDED, ok: true, data: null, reason: 'fallback', trusted: true });
  }

  // ─── Format result for context injection ──────────────────────────────────────
  /**
   * formatForContext(dispatchResult)
   * Formats a dispatch result as context text for injection into the AI pipeline.
   * Returns a string or null.
   */
  function formatForContext(result) {
    if (!result || !result.ok) return null;

    if (result.route === ROUTE.CALCULATION && result.data) {
      var d = result.data;
      return '[CALCULATION RESULT]\n' + (d.expression || '') + ' = ' + (d.result !== undefined ? d.result : '') +
             (d.formatted ? ' (' + d.formatted + ')' : '');
    }

    if (result.route === ROUTE.WEATHER && result.data && result.data.formatted) {
      return '[WEATHER DATA — trusted source]\n' + result.data.formatted;
    }

    if (result.route === ROUTE.INTERNET_RESEARCH && result.data) {
      var web = _web();
      if (web && web.formatForContext) {
        return web.formatForContext(result.data);
      }
      return null;
    }

    return null;
  }

  // ─── Status ───────────────────────────────────────────────────────────────────
  function getStatus() {
    return {
      build:              BUILD_ID,
      weatherAvailable:   !!(_weather() && _weather().isReady && _weather().isReady()),
      researchAvailable:  !!(_web()     && _web().isReady     && _web().isReady()),
      calculationAvailable: !!(_numIntl() && _numIntl().calculate),
    };
  }

  // ─── Expose ───────────────────────────────────────────────────────────────────
  global.SRResearchRouter = {
    build: BUILD_ID,

    ROUTE:           ROUTE,
    classify:        classify,
    dispatch:        dispatch,
    formatForContext: formatForContext,
    getStatus:       getStatus,

    // Exposed for testing
    _isPolitical:    _isPolitical,
  };

})(typeof window !== 'undefined' ? window : global);
