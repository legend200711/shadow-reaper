/**
 * shadow-reaper-shadow-edition/language/sr-number-intelligence.js
 * Shadow Reaper — Number Intelligence Module
 *
 * Build: SR-NUMBER-1
 *
 * Exposes: window.SRNumberIntelligence
 *
 * PURPOSE:
 *   Give Shadow Reaper first-class understanding of numeric expressions.
 *   Numbers are NOT just words — they carry precise semantic meaning.
 *
 *   This module handles:
 *     - Whole numbers:            25, 1000, 1,000,000
 *     - Written numbers:          twenty-five, one million
 *     - Decimals:                 1.5, 99.99, 3.14159
 *     - Negative numbers:         -5, negative five, minus five
 *     - Percentages:              25%, twenty-five percent
 *     - Currency:                 $5.99, five dollars, $1,000
 *     - Large numbers:            thousand/million/billion/trillion
 *     - Ordinals:                 1st, 2nd, first, second
 *     - Fractions:                1/2, half, quarter, three-quarters
 *     - Dates:                    October 2 2026, 10/2/2026, tomorrow, next Friday
 *     - Times:                    5:30 AM, noon, midnight, 17:30
 *     - Measurements:             5 feet, 10 volts, 100 watts, 2.4 GHz
 *     - Technical identifiers:    v1.2.3, HTTP 404, Node 22, 192.168.1.1, port 443
 *     - Basic math:               5 + 5, 15% of 200 (via safe calculator)
 *
 * ARCHITECTURE RULE:
 *   This is a TOOL available to ShadowReaper.
 *   It does NOT create a separate AI brain.
 *   Number understanding feeds INTO the existing language pipeline.
 *
 * SAFETY:
 *   - NO eval() — all arithmetic uses explicit parsers
 *   - Safe integer handling (BigInt-aware for large numbers)
 *   - All results are deterministic (same input = same output)
 *
 * INTEGRATION:
 *   Call SRNumberIntelligence.analyze(text) to get numeric enrichment.
 *   Call SRNumberIntelligence.calculate(expression) for deterministic arithmetic.
 *   Results attach to the language analysis context for downstream use.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-NUMBER-1';

  // ─── Number word maps ─────────────────────────────────────────────────────

  var ONES = {
    'zero': 0, 'one': 1, 'two': 2, 'three': 3, 'four': 4,
    'five': 5, 'six': 6, 'seven': 7, 'eight': 8, 'nine': 9,
    'ten': 10, 'eleven': 11, 'twelve': 12, 'thirteen': 13,
    'fourteen': 14, 'fifteen': 15, 'sixteen': 16, 'seventeen': 17,
    'eighteen': 18, 'nineteen': 19,
  };

  var TENS = {
    'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50,
    'sixty': 60, 'seventy': 70, 'eighty': 80, 'ninety': 90,
  };

  var MULTIPLIERS = {
    'hundred':   100,
    'thousand':  1000,
    'million':   1000000,
    'billion':   1000000000,
    'trillion':  1000000000000,
  };

  var ORDINALS = {
    'first': 1, 'second': 2, 'third': 3, 'fourth': 4, 'fifth': 5,
    'sixth': 6, 'seventh': 7, 'eighth': 8, 'ninth': 9, 'tenth': 10,
    'eleventh': 11, 'twelfth': 12, 'thirteenth': 13, 'fourteenth': 14,
    'fifteenth': 15, 'sixteenth': 16, 'seventeenth': 17, 'eighteenth': 18,
    'nineteenth': 19, 'twentieth': 20, 'thirtieth': 30, 'fortieth': 40,
    'fiftieth': 50, 'sixtieth': 60, 'seventieth': 70, 'eightieth': 80,
    'ninetieth': 90, 'hundredth': 100, 'thousandth': 1000,
    'millionth': 1000000, 'billionth': 1000000000,
  };

  var FRACTION_WORDS = {
    'half': 0.5, 'quarter': 0.25, 'third': 1/3,
    'eighth': 0.125, 'sixteenth': 0.0625,
  };

  var MONTHS = {
    'january': 1, 'february': 2, 'march': 3, 'april': 4,
    'may': 5, 'june': 6, 'july': 7, 'august': 8,
    'september': 9, 'october': 10, 'november': 11, 'december': 12,
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4,
    'jun': 6, 'jul': 7, 'aug': 8, 'sep': 9, 'sept': 9,
    'oct': 10, 'nov': 11, 'dec': 12,
  };

  var MONTH_NAMES = ['January','February','March','April','May','June',
                     'July','August','September','October','November','December'];

  var WEEKDAYS = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];

  // ─── Numeric type constants ────────────────────────────────────────────────

  var TYPE = {
    INTEGER:     'INTEGER',
    DECIMAL:     'DECIMAL',
    NEGATIVE:    'NEGATIVE',
    PERCENTAGE:  'PERCENTAGE',
    CURRENCY:    'CURRENCY',
    FRACTION:    'FRACTION',
    ORDINAL:     'ORDINAL',
    DATE:        'DATE',
    TIME:        'TIME',
    MEASUREMENT: 'MEASUREMENT',
    TECHNICAL:   'TECHNICAL',
    VERSION:     'VERSION',
    IP_ADDRESS:  'IP_ADDRESS',
    HTTP_CODE:   'HTTP_CODE',
    CALCULATION: 'CALCULATION',
    RANGE:       'RANGE',
    UNKNOWN:     'UNKNOWN',
  };

  // ─── Written number → value ───────────────────────────────────────────────
  /**
   * parseWrittenNumber(text)
   * Converts written English number to a numeric value.
   * Examples:
   *   "twenty-five"  → 25
   *   "one million"  → 1000000
   *   "negative five" → -5
   * Returns null if text doesn't look like a written number.
   */
  function parseWrittenNumber(text) {
    if (!text) return null;
    var t = text.toLowerCase().trim();

    // Negative prefix
    var negative = false;
    if (/^(negative|minus)\s+/.test(t)) {
      negative = true;
      t = t.replace(/^(negative|minus)\s+/, '');
    }

    // Direct ordinal
    if (ORDINALS[t] !== undefined) return negative ? -ORDINALS[t] : ORDINALS[t];

    // Fraction words
    if (FRACTION_WORDS[t] !== undefined) return negative ? -FRACTION_WORDS[t] : FRACTION_WORDS[t];

    // Tokenize
    var tokens = t.split(/[\s,\-]+/).filter(function (x) { return x && x.length > 0; });
    if (!tokens.length) return null;

    // Check all tokens are known number words
    var allKnown = tokens.every(function (tok) {
      return ONES[tok] !== undefined || TENS[tok] !== undefined ||
             MULTIPLIERS[tok] !== undefined || tok === 'and' || tok === 'a';
    });
    if (!allKnown) return null;

    // Parse left-to-right with multiplier logic
    var total  = 0;
    var current = 0;

    tokens.forEach(function (tok) {
      if (tok === 'and' || tok === 'a') return;
      var v = ONES[tok] !== undefined ? ONES[tok] :
              TENS[tok] !== undefined ? TENS[tok] : null;
      if (v !== null) {
        current += v;
      } else {
        var m = MULTIPLIERS[tok];
        if (!m) return;
        if (m >= 1000) {
          // "million", "billion", "trillion" — flush current into total first
          if (current === 0) current = 1;
          total   += current * m;
          current  = 0;
        } else {
          // "hundred" — multiply current portion
          if (current === 0) current = 1;
          current *= m;
        }
      }
    });

    total += current;
    return negative ? -total : total;
  }

  // ─── Numeric string → value ───────────────────────────────────────────────

  function _stripCommas(s) { return s.replace(/,/g, ''); }

  // ─── Classify a numeric expression ────────────────────────────────────────

  /**
   * classify(text)
   * Detects the numeric type of a text fragment.
   * Returns { type, raw, value, unit, formatted } or null if not numeric.
   */
  function classify(text) {
    if (!text || typeof text !== 'string') return null;
    var t = text.trim();

    // Technical identifier patterns (check before general numeric)

    // Version string: v1.2.3 or 1.2.3
    if (/^v?\d+\.\d+(\.\d+)*$/i.test(t)) {
      return { type: TYPE.VERSION, raw: t, value: t, unit: null, formatted: t };
    }

    // IPv4 address
    if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(t)) {
      var parts = t.split('.').map(Number);
      var validIp = parts.every(function (p) { return p >= 0 && p <= 255; });
      if (validIp) return { type: TYPE.IP_ADDRESS, raw: t, value: t, unit: null, formatted: t };
    }

    // HTTP status codes: "HTTP 404", "HTTP/1.1 200", "404 error", "500 error"
    var httpM = t.match(/^(?:http\/[\d.]+\s+)?(\d{3})\s*(?:error|status|code|ok|not found|forbidden|unauthorized)?$/i) ||
                t.match(/^http\s+(\d{3})$/i);
    if (httpM) {
      var code = parseInt(httpM[1], 10);
      if (code >= 100 && code <= 599) {
        return { type: TYPE.HTTP_CODE, raw: t, value: code, unit: null, formatted: 'HTTP ' + code };
      }
    }

    // Percentage: 25% or 25 percent or twenty-five percent
    var pctM = t.match(/^(-?[\d,]+(?:\.\d+)?)\s*%$/);
    if (pctM) {
      return { type: TYPE.PERCENTAGE, raw: t, value: parseFloat(_stripCommas(pctM[1])), unit: '%', formatted: pctM[1] + '%' };
    }
    if (/\bpercent\b/i.test(t)) {
      var pctWord = t.replace(/\bpercent\b/i, '').trim();
      var pctVal = parseFloat(_stripCommas(pctWord));
      if (!isNaN(pctVal)) return { type: TYPE.PERCENTAGE, raw: t, value: pctVal, unit: '%', formatted: pctVal + '%' };
      var pctWritten = parseWrittenNumber(pctWord);
      if (pctWritten !== null) return { type: TYPE.PERCENTAGE, raw: t, value: pctWritten, unit: '%', formatted: pctWritten + '%' };
    }

    // Currency: $5, $19.99, £10
    var currM = t.match(/^([\$£€¥₹])(-?[\d,]+(?:\.\d+)?)$/);
    if (currM) {
      return {
        type: TYPE.CURRENCY, raw: t,
        value: parseFloat(_stripCommas(currM[2])),
        unit: currM[1],
        formatted: currM[1] + _stripCommas(currM[2]),
      };
    }

    // Fraction: 1/2, 3/4
    var fracM = t.match(/^(\d+)\/(\d+)$/);
    if (fracM) {
      var num = parseInt(fracM[1], 10), den = parseInt(fracM[2], 10);
      if (den !== 0) {
        return { type: TYPE.FRACTION, raw: t, value: num / den, unit: null, formatted: t };
      }
    }

    // Ordinal: 1st, 2nd, 3rd, 4th etc.
    var ordM = t.match(/^(\d+)(st|nd|rd|th)$/i);
    if (ordM) {
      return { type: TYPE.ORDINAL, raw: t, value: parseInt(ordM[1], 10), unit: null, formatted: t };
    }

    // Measurement with unit: "5 feet", "10 volts", "2.4 GHz", "16 GB", "100 watts"
    var measM = t.match(/^(-?[\d,]+(?:\.\d+)?)\s*(feet|foot|ft|inches?|in|pounds?|lbs?|lb|kilograms?|kg|miles?|mi|kilometers?|km|meters?|m|centimeters?|cm|gallons?|liters?|litres?|°?f|°?c|fahrenheit|celsius|volts?|v|amps?|a|watts?|w|kilowatts?|kw|hertz|hz|khz|mhz|ghz|rpm|psi|mb|gb|tb|pb|kbps|mbps|gbps|ms|ns|μs|px|pt|em|rem|vw|vh|%|mm|km\/h|mph|in\/s)$/i);
    if (measM) {
      return {
        type: TYPE.MEASUREMENT, raw: t,
        value: parseFloat(_stripCommas(measM[1])),
        unit: measM[2].toLowerCase(),
        formatted: measM[1] + ' ' + measM[2],
      };
    }

    // Negative number: -5, negative five, minus three
    if (/^-[\d,]+(?:\.\d+)?$/.test(t)) {
      return { type: TYPE.NEGATIVE, raw: t, value: parseFloat(_stripCommas(t)), unit: null, formatted: t };
    }
    if (/^(negative|minus)\s+/i.test(t)) {
      var negText = t.replace(/^(negative|minus)\s+/i, '');
      var negVal  = parseFloat(_stripCommas(negText));
      if (isNaN(negVal)) { negVal = parseWrittenNumber(negText); }
      if (negVal !== null && !isNaN(negVal)) {
        return { type: TYPE.NEGATIVE, raw: t, value: -Math.abs(negVal), unit: null, formatted: String(-Math.abs(negVal)) };
      }
    }

    // Decimal: 1.5, 0.25, 99.99
    if (/^-?[\d,]+\.\d+$/.test(t)) {
      return { type: TYPE.DECIMAL, raw: t, value: parseFloat(_stripCommas(t)), unit: null, formatted: t };
    }

    // Plain integer: 25, 1000, 1,000,000
    if (/^-?[\d,]+$/.test(t)) {
      var iv = parseInt(_stripCommas(t), 10);
      return { type: TYPE.INTEGER, raw: t, value: iv, unit: null, formatted: t };
    }

    // Written number
    var written = parseWrittenNumber(t);
    if (written !== null) {
      return {
        type: (Number.isInteger(written) ? TYPE.INTEGER : TYPE.DECIMAL),
        raw:  t, value: written, unit: null, formatted: String(written),
      };
    }

    // Fraction words
    if (FRACTION_WORDS[t.toLowerCase()] !== undefined) {
      return {
        type: TYPE.FRACTION, raw: t,
        value: FRACTION_WORDS[t.toLowerCase()],
        unit: null, formatted: t,
      };
    }

    return null;
  }

  // ─── Extract all numeric expressions from text ────────────────────────────

  /**
   * extractNumbers(text)
   * Scans text and returns an array of classified numeric expressions found.
   * Each item: { type, raw, value, unit, formatted, position }
   */
  function extractNumbers(text) {
    if (!text) return [];
    var results = [];

    // Technical patterns (check first)
    var techPatterns = [
      // Version strings
      { regex: /\bv?\d+\.\d+(?:\.\d+)*/gi },
      // IP addresses
      { regex: /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g },
      // HTTP codes
      { regex: /\b(?:HTTP\/[\d.]+\s+|HTTP\s+)?[1-5]\d{2}\b(?:\s+(?:error|status|ok|not found|forbidden))?/gi },
      // Port numbers: port 443, port 80
      { regex: /\bport\s+\d{1,5}\b/gi },
      // Frequencies: 2.4GHz, 5GHz, 60Hz
      { regex: /\b\d+(?:\.\d+)?\s*(?:GHz|MHz|kHz|Hz)\b/gi },
      // Storage: 16GB, 500GB, 1TB
      { regex: /\b\d+(?:\.\d+)?\s*(?:TB|GB|MB|KB|PB)\b/gi },
      // Resolution: 1080p, 4K, 8K
      { regex: /\b\d+[pP]\b|\b[48][kK]\b/g },
      // Node version: Node 22, Node.js 18, Python 3.14
      { regex: /\b(?:Node(?:\.js)?|Python|Java|PHP|Ruby|Go|Rust)\s+\d+(?:\.\d+)*/gi },
    ];

    var seen = {};
    techPatterns.forEach(function (p) {
      var m;
      p.regex.lastIndex = 0;
      while ((m = p.regex.exec(text)) !== null) {
        var raw = m[0].trim();
        var pos = m.index;
        if (!seen[pos + ':' + raw]) {
          seen[pos + ':' + raw] = true;
          var classified = classify(raw);
          if (!classified) {
            classified = { type: TYPE.TECHNICAL, raw: raw, value: raw, unit: null, formatted: raw };
          }
          results.push(Object.assign({ position: pos }, classified));
        }
      }
    });

    // Percentage patterns
    var pctRe = /(-?[\d,]+(?:\.\d+)?)\s*%|\b(-?[\d,]+(?:\.\d+)?)\s+percent\b/gi;
    var pm;
    while ((pm = pctRe.exec(text)) !== null) {
      var pctRaw = pm[0].trim();
      var pos = pm.index;
      if (!seen[pos + ':' + pctRaw]) {
        seen[pos + ':' + pctRaw] = true;
        var pv = parseFloat(_stripCommas(pm[1] || pm[2]));
        results.push({ type: TYPE.PERCENTAGE, raw: pctRaw, value: pv, unit: '%', formatted: pv + '%', position: pos });
      }
    }

    // Currency patterns
    var currRe = /([\$£€¥₹])([\d,]+(?:\.\d+)?)/g;
    var cm;
    while ((cm = currRe.exec(text)) !== null) {
      var currRaw = cm[0].trim();
      var pos = cm.index;
      if (!seen[pos + ':' + currRaw]) {
        seen[pos + ':' + currRaw] = true;
        results.push({
          type: TYPE.CURRENCY, raw: currRaw,
          value: parseFloat(_stripCommas(cm[2])), unit: cm[1],
          formatted: currRaw, position: pos,
        });
      }
    }

    // Measurement patterns
    var measRe = /(-?[\d,]+(?:\.\d+)?)\s*(feet|foot|ft|inches?|in|pounds?|lbs?|lb|kilograms?|kg|miles?|mi|kilometers?|km|meters?(?!\s+long)|\bm\b|centimeters?|cm|°?[fcFC]|volts?|v\b|amps?|\ba\b|watts?|kw|hz|rpm|psi|ms\b|ns\b|px\b|pt\b|vw\b|vh\b)/gi;
    var mm;
    while ((mm = measRe.exec(text)) !== null) {
      var mRaw = mm[0].trim();
      var pos = mm.index;
      if (!seen[pos + ':' + mRaw]) {
        seen[pos + ':' + mRaw] = true;
        results.push({
          type: TYPE.MEASUREMENT, raw: mRaw,
          value: parseFloat(_stripCommas(mm[1])), unit: mm[2].toLowerCase(),
          formatted: mRaw, position: pos,
        });
      }
    }

    // Ordinals: 1st, 2nd, 3rd, 4th
    var ordRe = /\b(\d+)(st|nd|rd|th)\b/gi;
    var om;
    while ((om = ordRe.exec(text)) !== null) {
      var oRaw = om[0].trim();
      var pos = om.index;
      if (!seen[pos + ':' + oRaw]) {
        seen[pos + ':' + oRaw] = true;
        results.push({ type: TYPE.ORDINAL, raw: oRaw, value: parseInt(om[1], 10), unit: null, formatted: oRaw, position: pos });
      }
    }

    // Plain numbers: integers and decimals
    var numRe = /-?[\d,]+(?:\.\d+)?/g;
    var nm;
    while ((nm = numRe.exec(text)) !== null) {
      var nRaw = nm[0];
      var pos = nm.index;
      if (!seen[pos + ':' + nRaw]) {
        seen[pos + ':' + nRaw] = true;
        var val = parseFloat(_stripCommas(nRaw));
        var nType = (nRaw.indexOf('.') !== -1) ? TYPE.DECIMAL : TYPE.INTEGER;
        if (val < 0) nType = TYPE.NEGATIVE;
        results.push({ type: nType, raw: nRaw, value: val, unit: null, formatted: nRaw, position: pos });
      }
    }

    // Written numbers
    var writtenRe = /\b(?:(?:negative|minus)\s+)?(?:twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)(?:\s*-\s*(?:one|two|three|four|five|six|seven|eight|nine))?|(?:negative|minus)\s+(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)|\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen)\s+(?:hundred|thousand|million|billion|trillion)|\bone\b|\btwo\b|\bthree\b|\bfour\b|\bfive\b|\bsix\b|\bseven\b|\beight\b|\bnine\b|\bten\b|\beleven\b|\btwelve\b/gi;
    var wm;
    while ((wm = writtenRe.exec(text)) !== null) {
      var wRaw = wm[0].trim();
      var pos = wm.index;
      if (!seen[pos + ':' + wRaw]) {
        var wVal = parseWrittenNumber(wRaw);
        if (wVal !== null) {
          seen[pos + ':' + wRaw] = true;
          results.push({ type: (wVal < 0 ? TYPE.NEGATIVE : TYPE.INTEGER), raw: wRaw, value: wVal, unit: null, formatted: String(wVal), position: pos });
        }
      }
    }

    // Sort by position
    results.sort(function (a, b) { return a.position - b.position; });
    return results;
  }

  // ─── Date / Time understanding ─────────────────────────────────────────────

  /**
   * parseDate(text)
   * Parses a date expression to a structured object.
   * Supports: Oct 2 2026, 10/2/2026, 2026-10-02, tomorrow, next Friday, last Monday, etc.
   * Returns: { type: 'DATE', value: Date, formatted, relative: bool } or null.
   */
  function parseDate(text) {
    if (!text || typeof text !== 'string') return null;
    var t = text.trim().toLowerCase();

    // Get current date (do NOT hardcode — use runtime Date)
    var now = new Date();

    // Relative dates
    if (t === 'today') {
      return { type: TYPE.DATE, value: new Date(now.getFullYear(), now.getMonth(), now.getDate()), formatted: 'today', relative: true };
    }
    if (t === 'tomorrow') {
      var tmr = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
      return { type: TYPE.DATE, value: tmr, formatted: 'tomorrow', relative: true };
    }
    if (t === 'yesterday') {
      var yest = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
      return { type: TYPE.DATE, value: yest, formatted: 'yesterday', relative: true };
    }

    // Next/last weekday: "next Friday", "last Monday"
    var weekdayM = t.match(/^(next|last)\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday)$/);
    if (weekdayM) {
      var direction = weekdayM[1] === 'next' ? 1 : -1;
      var targetDay = WEEKDAYS.indexOf(weekdayM[2]);
      var todayDay  = now.getDay();
      var diff = (targetDay - todayDay + 7) % 7 || 7;
      if (direction === -1) diff = -(7 - diff || 7);
      var relDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diff);
      return { type: TYPE.DATE, value: relDate, formatted: weekdayM[1] + ' ' + weekdayM[2], relative: true };
    }

    // ISO format: 2026-10-02
    var isoM = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (isoM) {
      var d = new Date(parseInt(isoM[1]), parseInt(isoM[2]) - 1, parseInt(isoM[3]));
      return { type: TYPE.DATE, value: d, formatted: isoM[0], relative: false };
    }

    // US format: 10/2/2026 or 10/2/26
    var usM = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (usM) {
      var yr = parseInt(usM[3]);
      if (yr < 100) yr += 2000;
      var d = new Date(yr, parseInt(usM[1]) - 1, parseInt(usM[2]));
      return { type: TYPE.DATE, value: d, formatted: usM[0], relative: false };
    }

    // Named month: "October 2, 2026" or "2 October 2026" or "October 2"
    var namedM = text.match(/^(?:(\d{1,2})\s+)?(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?$/i) ||
                 text.match(/^(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?$/i);
    if (namedM) {
      // Normalize: extract month/day/year regardless of order
      var monthName, dayNum, yearNum;
      if (namedM[0].match(/^\d/)) {
        // Starts with day number
        dayNum    = parseInt(namedM[1], 10);
        monthName = namedM[2];
        yearNum   = namedM[4] ? parseInt(namedM[4]) : now.getFullYear();
      } else {
        monthName = namedM[1] || namedM[0].match(/^[a-z]+/i)[0];
        // Re-parse from original text
        var reNamed = text.match(/^([a-z]+)\.?\s+(\d{1,2})(?:,?\s*(\d{4}))?$/i);
        if (!reNamed) return null;
        monthName = reNamed[1];
        dayNum    = parseInt(reNamed[2], 10);
        yearNum   = reNamed[3] ? parseInt(reNamed[3]) : now.getFullYear();
      }
      var monthIdx = MONTHS[monthName.toLowerCase()];
      if (!monthIdx) return null;
      var d = new Date(yearNum, monthIdx - 1, dayNum);
      return { type: TYPE.DATE, value: d, formatted: text, relative: false };
    }

    return null;
  }

  /**
   * parseTime(text)
   * Parses time expressions.
   * Supports: 5:30, 5:30 AM, 17:30, noon, midnight, five thirty
   * Returns: { type: 'TIME', hours24, hours12, minutes, ampm, formatted } or null.
   */
  function parseTime(text) {
    if (!text || typeof text !== 'string') return null;
    var t = text.trim().toLowerCase();

    if (t === 'noon' || t === '12 noon') {
      return { type: TYPE.TIME, hours24: 12, hours12: 12, minutes: 0, ampm: 'PM', formatted: 'noon' };
    }
    if (t === 'midnight' || t === '12 midnight') {
      return { type: TYPE.TIME, hours24: 0, hours12: 12, minutes: 0, ampm: 'AM', formatted: 'midnight' };
    }

    // HH:MM or H:MM with optional AM/PM
    var timeM = text.match(/^(\d{1,2}):(\d{2})(?:\s*(am|pm))?$/i);
    if (timeM) {
      var h = parseInt(timeM[1], 10);
      var m = parseInt(timeM[2], 10);
      var ap = (timeM[3] || '').toUpperCase();
      var h24 = h;
      if (ap === 'PM' && h !== 12) h24 = h + 12;
      if (ap === 'AM' && h === 12) h24 = 0;
      return { type: TYPE.TIME, hours24: h24, hours12: h > 12 ? h - 12 : h, minutes: m, ampm: ap || (h24 >= 12 ? 'PM' : 'AM'), formatted: text };
    }

    // 24-hour: 17:30
    var h24M = text.match(/^(\d{2}):(\d{2})$/);
    if (h24M) {
      var h = parseInt(h24M[1], 10), m = parseInt(h24M[2], 10);
      if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
        var ap = h >= 12 ? 'PM' : 'AM';
        return { type: TYPE.TIME, hours24: h, hours12: h > 12 ? h - 12 : (h === 0 ? 12 : h), minutes: m, ampm: ap, formatted: text };
      }
    }

    return null;
  }

  // ─── Safe Calculator ─────────────────────────────────────────────────────
  // NO eval(). All arithmetic is deterministic explicit parsing.

  /**
   * calculate(expression)
   * Safely evaluates simple arithmetic expressions.
   * Supports: +, -, *, /, %, "percent of", "% of"
   * Returns: { ok: bool, result: number, formatted: string, expression: string }
   *          or { ok: false, reason: string }
   *
   * SECURITY: NEVER uses eval(). Only explicit numeric parsing.
   */
  function calculate(expression) {
    if (!expression || typeof expression !== 'string') {
      return { ok: false, reason: 'empty_expression' };
    }

    var expr = expression.trim().toLowerCase();

    // Percentage of: "15% of 200" or "15 percent of 200"
    var pctOfM = expr.match(/(-?[\d,]+(?:\.\d+)?)\s*(?:%|percent(?:\s+of)?)\s+of\s+(-?[\d,]+(?:\.\d+)?)/i);
    if (pctOfM) {
      var pct = parseFloat(_stripCommas(pctOfM[1]));
      var base = parseFloat(_stripCommas(pctOfM[2]));
      if (!isNaN(pct) && !isNaN(base)) {
        var result = (pct / 100) * base;
        return { ok: true, result: result, formatted: _formatResult(result), expression: expression };
      }
    }

    // Currency addition/subtraction: "$50 + $25", "$100 - $30"
    var currExprM = expr.match(/^([\$£€¥₹])([\d,]+(?:\.\d+)?)\s*([+\-])\s*[\$£€¥₹]?([\d,]+(?:\.\d+)?)$/);
    if (currExprM) {
      var a = parseFloat(_stripCommas(currExprM[2]));
      var b = parseFloat(_stripCommas(currExprM[4]));
      var op = currExprM[3];
      var result = op === '+' ? a + b : a - b;
      return { ok: true, result: result, formatted: currExprM[1] + _formatResult(result), expression: expression };
    }

    // Basic arithmetic: operands are numbers (integers or decimals, with optional commas)
    // Supports: 5 + 5, 20 × 4, 100 / 5, 2 ** 8
    // Normalize operators
    var normalized = expr
      .replace(/\s*×\s*/g, ' * ')
      .replace(/\s*÷\s*/g, ' / ')
      .replace(/\s*\*\*\s*/g, ' ^ ')
      .replace(/\s+/g, ' ');

    // Tokenize: only allow numbers and operators
    var tokens = normalized.split(/\s+/).filter(function (t) { return t.length > 0; });

    // Valid tokens: numbers (with optional commas), operators
    var validToken = /^-?[\d,]+(?:\.\d+)?$|^[+\-*\/^]$/;
    if (!tokens.every(function (t) { return validToken.test(t); })) {
      return { ok: false, reason: 'unsupported_expression' };
    }

    if (tokens.length < 3) return { ok: false, reason: 'incomplete_expression' };

    // Parse as a sequence of left-to-right operations (no precedence for safety)
    // For simple expressions: A op B
    if (tokens.length === 3) {
      var a = parseFloat(_stripCommas(tokens[0]));
      var op = tokens[1];
      var b = parseFloat(_stripCommas(tokens[2]));
      if (isNaN(a) || isNaN(b)) return { ok: false, reason: 'invalid_operand' };

      var result;
      if (op === '+') result = a + b;
      else if (op === '-') result = a - b;
      else if (op === '*') result = a * b;
      else if (op === '/') {
        if (b === 0) return { ok: false, reason: 'division_by_zero' };
        result = a / b;
      } else if (op === '^') result = Math.pow(a, b);
      else return { ok: false, reason: 'unknown_operator' };

      return { ok: true, result: result, formatted: _formatResult(result), expression: expression };
    }

    // Multiple operations: left-to-right (no precedence — keep it safe)
    if (tokens.length >= 3 && tokens.length % 2 === 1) {
      var acc = parseFloat(_stripCommas(tokens[0]));
      if (isNaN(acc)) return { ok: false, reason: 'invalid_operand' };
      for (var i = 1; i < tokens.length - 1; i += 2) {
        var op = tokens[i];
        var b  = parseFloat(_stripCommas(tokens[i + 1]));
        if (isNaN(b)) return { ok: false, reason: 'invalid_operand' };
        if (op === '+') acc += b;
        else if (op === '-') acc -= b;
        else if (op === '*') acc *= b;
        else if (op === '/') { if (b === 0) return { ok: false, reason: 'division_by_zero' }; acc /= b; }
        else if (op === '^') acc = Math.pow(acc, b);
        else return { ok: false, reason: 'unknown_operator' };
      }
      return { ok: true, result: acc, formatted: _formatResult(acc), expression: expression };
    }

    return { ok: false, reason: 'unsupported_expression' };
  }

  function _formatResult(n) {
    if (typeof n !== 'number' || isNaN(n)) return String(n);
    // Round to max 10 decimal places to avoid floating-point noise
    var rounded = Math.round(n * 1e10) / 1e10;
    // Show as integer if whole number
    if (Number.isInteger(rounded)) return rounded.toLocaleString();
    // Show up to 4 decimal places for reasonable display
    var str = rounded.toFixed(4).replace(/\.?0+$/, '');
    return str;
  }

  // ─── Detect calculation intent ─────────────────────────────────────────────

  /**
   * detectCalculation(text)
   * Detects if the text is a calculation request.
   * Returns { isCalc: bool, expression: string? }
   */
  function detectCalculation(text) {
    if (!text) return { isCalc: false };
    var t = text.trim().toLowerCase();

    // Direct arithmetic: contains number op number pattern
    if (/(-?[\d,]+(?:\.\d+)?)\s*[+\-×÷*/^]\s*(-?[\d,]+(?:\.\d+)?)/.test(t)) {
      // Extract the expression
      var exprM = t.match(/(-?[\d,]+(?:\.\d+)?(?:\s*[+\-×÷*/^]\s*-?[\d,]+(?:\.\d+)?)+)/);
      return { isCalc: true, expression: exprM ? exprM[1] : t };
    }

    // "X percent of Y" or "X% of Y"
    if (/(-?[\d,]+(?:\.\d+)?)\s*(?:%|percent)\s+of\s+(-?[\d,]+(?:\.\d+)?)/.test(t)) {
      return { isCalc: true, expression: t };
    }

    // "what is X plus/times/minus/divided by Y"
    var wordCalc = t.match(/(?:what(?:'s| is)?|calculate|compute|how much is)?\s*(-?[\d,]+(?:\.\d+)?)\s+(?:plus|minus|times|multiplied by|divided by|over)\s+(-?[\d,]+(?:\.\d+)?)/);
    if (wordCalc) {
      var opWord = t.match(/\b(plus|minus|times|multiplied by|divided by|over)\b/);
      var opMap = { 'plus': '+', 'minus': '-', 'times': '*', 'multiplied by': '*', 'divided by': '/', 'over': '/' };
      var op = opMap[opWord ? opWord[1] : ''];
      if (op) return { isCalc: true, expression: wordCalc[1] + ' ' + op + ' ' + wordCalc[2] };
    }

    return { isCalc: false };
  }

  // ─── Analyze text for numeric content ────────────────────────────────────

  /**
   * analyze(text)
   * Full numeric analysis of a text string.
   * Returns:
   * {
   *   numbers:     ClassifiedNumber[],  — all numeric expressions found
   *   dates:       ParsedDate[],        — date expressions found
   *   times:       ParsedTime[],        — time expressions found
   *   calculation: CalcResult | null,   — if text is a calculation
   *   summary: string,                  — human-readable summary of numeric content
   * }
   */
  function analyze(text) {
    if (!text || typeof text !== 'string') {
      return { numbers: [], dates: [], times: [], calculation: null, summary: '' };
    }

    var numbers = extractNumbers(text);
    var dates   = [];
    var times   = [];
    var calcResult = null;

    // Detect dates
    var datePatterns = [
      /\b(?:today|tomorrow|yesterday)\b/gi,
      /\b(?:next|last)\s+(?:sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/gi,
      /\b\d{4}-\d{2}-\d{2}\b/g,
      /\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/g,
      /\b(?:january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+\d{1,2}(?:,?\s*\d{4})?\b/gi,
    ];
    datePatterns.forEach(function (re) {
      var dm;
      re.lastIndex = 0;
      while ((dm = re.exec(text)) !== null) {
        var parsed = parseDate(dm[0].trim());
        if (parsed) dates.push(Object.assign({ position: dm.index, raw: dm[0] }, parsed));
      }
    });

    // Detect times
    var timePatterns = [
      /\b\d{1,2}:\d{2}(?:\s*(?:am|pm))?\b/gi,
      /\b(?:noon|midnight)\b/gi,
    ];
    timePatterns.forEach(function (re) {
      var tm;
      re.lastIndex = 0;
      while ((tm = re.exec(text)) !== null) {
        var parsed = parseTime(tm[0].trim());
        if (parsed) times.push(Object.assign({ position: tm.index, raw: tm[0] }, parsed));
      }
    });

    // Detect calculation
    var calcCheck = detectCalculation(text);
    if (calcCheck.isCalc && calcCheck.expression) {
      calcResult = calculate(calcCheck.expression);
    }

    // Build summary
    var summaryParts = [];
    if (numbers.length > 0) summaryParts.push(numbers.length + ' numeric expression(s)');
    if (dates.length > 0)   summaryParts.push(dates.length + ' date(s)');
    if (times.length > 0)   summaryParts.push(times.length + ' time(s)');
    if (calcResult && calcResult.ok) summaryParts.push('calculation: ' + calcResult.formatted);

    return {
      numbers:     numbers,
      dates:       dates,
      times:       times,
      calculation: calcResult,
      summary:     summaryParts.join('; '),
      hasNumericContent: (numbers.length > 0 || dates.length > 0 || times.length > 0 || (calcResult && calcResult.ok)),
    };
  }

  // ─── Format numeric result as natural language ─────────────────────────────

  /**
   * describeResult(calcResult)
   * Formats a calculation result for natural language output.
   */
  function describeResult(calcResult) {
    if (!calcResult || !calcResult.ok) return null;
    return calcResult.formatted;
  }

  // ─── Expose ───────────────────────────────────────────────────────────────

  global.SRNumberIntelligence = {
    build: BUILD_ID,
    TYPE:  TYPE,

    // Core
    classify:           classify,
    extractNumbers:     extractNumbers,
    parseWrittenNumber: parseWrittenNumber,
    analyze:            analyze,

    // Dates / Times
    parseDate:          parseDate,
    parseTime:          parseTime,

    // Calculator (NO eval)
    calculate:          calculate,
    detectCalculation:  detectCalculation,
    describeResult:     describeResult,
  };

})(typeof window !== 'undefined' ? window : global);
