/**
 * shadow-reaper-v2/language/tokenizer/tokenizer.js
 * Shadow Reaper — Language Tokenizer
 *
 * Build: SR-LANG-TOKENIZER-1
 *
 * Exposes: window.SRTokenizer
 *
 * Responsibilities:
 *   - Split text into meaningful tokens (words, punctuation, numbers, etc.)
 *   - Recognize contractions, hyphenated words, URLs, emails
 *   - Normalize tokens while preserving original text
 *   - Detect sentence boundaries
 *
 * DESIGN:
 *   Stores ORIGINAL text alongside NORMALIZED representation separately.
 *   Never silently mutates the user's message.
 *
 * Zero external calls. Zero hosted AI. Pure deterministic local logic.
 */

(function (global) {
  'use strict';

  var BUILD_ID = 'SR-LANG-TOKENIZER-1';

  // ─── Contraction expansions ────────────────────────────────────────────────
  // Maps contraction → canonical form. Used for normalization only.
  // Original text is always preserved separately.
  var CONTRACTIONS = {
    "i'm":       "i am",
    "i've":      "i have",
    "i'll":      "i will",
    "i'd":       "i would",
    "you're":    "you are",
    "you've":    "you have",
    "you'll":    "you will",
    "you'd":     "you would",
    "he's":      "he is",
    "he'll":     "he will",
    "he'd":      "he would",
    "she's":     "she is",
    "she'll":    "she will",
    "she'd":     "she would",
    "it's":      "it is",
    "it'll":     "it will",
    "we're":     "we are",
    "we've":     "we have",
    "we'll":     "we will",
    "we'd":      "we would",
    "they're":   "they are",
    "they've":   "they have",
    "they'll":   "they will",
    "they'd":    "they would",
    "that's":    "that is",
    "that'll":   "that will",
    "that'd":    "that would",
    "there's":   "there is",
    "there're":  "there are",
    "there'll":  "there will",
    "here's":    "here is",
    "who's":     "who is",
    "who've":    "who have",
    "who'll":    "who will",
    "what's":    "what is",
    "what're":   "what are",
    "what'll":   "what will",
    "when's":    "when is",
    "where's":   "where is",
    "why's":     "why is",
    "how's":     "how is",
    "don't":     "do not",
    "doesn't":   "does not",
    "didn't":    "did not",
    "won't":     "will not",
    "wouldn't":  "would not",
    "can't":     "cannot",
    "cannot":    "cannot",
    "couldn't":  "could not",
    "shouldn't": "should not",
    "isn't":     "is not",
    "aren't":    "are not",
    "wasn't":    "was not",
    "weren't":   "were not",
    "haven't":   "have not",
    "hasn't":    "has not",
    "hadn't":    "had not",
    "let's":     "let us",
    "n't":       "not",
    "gonna":     "going to",
    "wanna":     "want to",
    "gotta":     "got to",
    "kinda":     "kind of",
    "sorta":     "sort of",
    "outta":     "out of",
    "lotsa":     "lots of",
    "hafta":     "have to",
    "oughta":    "ought to",
    "tryna":     "trying to",
    "dunno":     "do not know",
    "gimme":     "give me",
    "lemme":     "let me",
    "y'all":     "you all",
    "ain't":     "is not",
  };

  // ─── Token type patterns ───────────────────────────────────────────────────
  // Applied in order; first match wins for type detection
  var TOKEN_PATTERNS = [
    // URL-like strings
    { type: 'url',    pattern: /^https?:\/\/\S+$/i },
    { type: 'url',    pattern: /^www\.\S+\.\S+$/i },
    // Email-like strings
    { type: 'email',  pattern: /^[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}$/i },
    // Numbers (including decimals, percentages, times)
    { type: 'number', pattern: /^\d+([.,]\d+)?(%|px|em|rem|pt|dp|sp|ms|s|kb|mb|gb)?$/i },
    // Dates (simple patterns)
    { type: 'date',   pattern: /^\d{1,2}[\/\-]\d{1,2}([\/\-]\d{2,4})?$/ },
    // Hyphenated compound words
    { type: 'compound', pattern: /^[a-z][\w]*(-[\w]+)+$/i },
    // Abbreviations / acronyms (2-6 uppercase letters, optionally with dots)
    { type: 'acronym', pattern: /^[A-Z]{2,6}$/ },
    { type: 'acronym', pattern: /^([A-Z]\.){2,6}$/ },
    // Contractions
    { type: 'contraction', pattern: /^[a-z]+'[a-z]+$/i },
    // Normal word
    { type: 'word',   pattern: /^[a-z']+$/i },
    // Punctuation
    { type: 'punctuation', pattern: /^[^\w\s]+$/ },
  ];

  // ─── Sentence boundary detection ──────────────────────────────────────────
  var SENTENCE_END_PATTERN = /[.!?]+$/;
  var QUESTION_PATTERN     = /\?/;
  var EXCLAMATION_PATTERN  = /!/;

  // ─── Internal: classify a single token ───────────────────────────────────
  function _classifyToken(tok) {
    for (var i = 0; i < TOKEN_PATTERNS.length; i++) {
      if (TOKEN_PATTERNS[i].pattern.test(tok)) {
        return TOKEN_PATTERNS[i].type;
      }
    }
    return 'word';
  }

  // ─── Internal: normalize a single token ──────────────────────────────────
  function _normalizeToken(tok) {
    var lower = tok.toLowerCase();
    // Expand contraction if known
    if (CONTRACTIONS[lower]) {
      return CONTRACTIONS[lower];
    }
    // Remove trailing punctuation from words
    var stripped = lower.replace(/^[^\w]+|[^\w]+$/g, '');
    return stripped || lower;
  }

  // ─── Split text into raw tokens ──────────────────────────────────────────
  // Handles contractions, hyphenated words, punctuation, etc.
  function _splitToRaw(text) {
    // Preserve contractions: don't, can't, I'm, etc.
    // Preserve hyphenated words: well-known, state-of-the-art
    // Preserve URLs and emails as single tokens
    // Everything else: split on whitespace/punctuation

    var tokens = [];
    // Regex that keeps contractions, hyphenated words, URLs, emails together
    var re = /https?:\/\/\S+|www\.\S+|[a-z0-9._%+\-]+@[a-z0-9.\-]+\.[a-z]{2,}|[a-zA-Z0-9]+'[a-zA-Z]+|[a-zA-Z]+(?:-[a-zA-Z]+)+|\d+[.,]\d+|\d+%?|[a-zA-Z0-9]+|[^\w\s]/gi;
    var match;
    while ((match = re.exec(text)) !== null) {
      tokens.push(match[0]);
    }
    return tokens;
  }

  // ─── Public: tokenize ─────────────────────────────────────────────────────
  /**
   * tokenize(text)
   *
   * Returns:
   * {
   *   original:   string,            // original input text
   *   tokens:     Token[],           // array of token objects
   *   normalized: string,            // space-joined normalized form
   *   wordCount:  number,
   *   hasQuestion: boolean,
   *   hasExclamation: boolean,
   * }
   *
   * Token:
   * {
   *   raw:        string,  // original token text
   *   normal:     string,  // normalized form
   *   type:       string,  // word|number|url|email|contraction|compound|acronym|punctuation
   *   position:   number,  // 0-based index in token array
   *   isWord:     boolean,
   *   isStop:     boolean, // true for common stop words
   * }
   */
  function tokenize(text) {
    if (!text || typeof text !== 'string') {
      return {
        original: '',
        tokens: [],
        normalized: '',
        wordCount: 0,
        hasQuestion: false,
        hasExclamation: false,
      };
    }

    var original  = text;
    var rawTokens = _splitToRaw(text);
    var tokens    = [];

    for (var i = 0; i < rawTokens.length; i++) {
      var raw    = rawTokens[i];
      var type   = _classifyToken(raw);
      var normal = (type === 'word' || type === 'contraction')
        ? _normalizeToken(raw)
        : raw.toLowerCase();

      tokens.push({
        raw:      raw,
        normal:   normal,
        type:     type,
        position: i,
        isWord:   type === 'word' || type === 'contraction' || type === 'compound',
        isStop:   STOP_WORDS.has(normal),
      });
    }

    var wordCount   = tokens.filter(function (t) { return t.isWord; }).length;
    var normalParts = tokens.map(function (t) { return t.normal; });
    var normalized  = normalParts.join(' ').replace(/\s+([,.:;!?])/g, '$1').trim();

    return {
      original:       original,
      tokens:         tokens,
      normalized:     normalized,
      wordCount:      wordCount,
      hasQuestion:    QUESTION_PATTERN.test(text),
      hasExclamation: EXCLAMATION_PATTERN.test(text),
    };
  }

  // ─── Public: normalize ────────────────────────────────────────────────────
  /**
   * normalize(text)
   * Returns normalized string (contractions expanded, lowercase).
   * DOES NOT modify original text in place.
   */
  function normalize(text) {
    return tokenize(text).normalized;
  }

  // ─── Public: extractWords ─────────────────────────────────────────────────
  /**
   * extractWords(text, options)
   * Returns array of normalized word strings.
   * options.includeStops = true to include stop words (default: false)
   */
  function extractWords(text, options) {
    var opts = options || {};
    var result = tokenize(text);
    return result.tokens
      .filter(function (t) {
        if (!t.isWord) return false;
        if (!opts.includeStops && t.isStop) return false;
        return true;
      })
      .map(function (t) { return t.normal; });
  }

  // ─── Public: getContraction ───────────────────────────────────────────────
  function expandContraction(text) {
    var lower = text.toLowerCase();
    return CONTRACTIONS[lower] || text;
  }

  // ─── Stop words ───────────────────────────────────────────────────────────
  // Common function words with low semantic content
  var STOP_WORDS = new Set([
    'a','an','the','and','but','or','nor','so','yet','for','if','as',
    'at','by','in','of','on','to','up','it','is','be','do','was','are',
    'has','had','did','can','could','may','might','must','shall','will',
    'would','should','been','being','have','me','my','we','us','our','you',
    'your','he','him','his','she','her','they','them','their','that','this',
    'these','those','what','which','who','how','when','where','why','not',
    'no','nor','so','then','than','very','just','also','too','more','some',
    'all','any','both','each','few','many','much','other','only',
    'i','am','were','from','with','about','against','between','into',
    'through','during','before','after','above','below','without',
  ]);

  // ─── Public: isStopWord ───────────────────────────────────────────────────
  function isStopWord(word) {
    return STOP_WORDS.has(word.toLowerCase());
  }

  // ─── Public: detectLanguage (heuristic) ──────────────────────────────────
  /**
   * Basic heuristic language detection.
   * Returns 'en' (English) or 'unknown'.
   * Full multi-language detection belongs in translation engine.
   */
  function detectLanguage(text) {
    if (!text) return 'unknown';
    var lower = text.toLowerCase();
    // Count English-pattern words
    var words = lower.split(/\s+/);
    var engCount = 0;
    for (var i = 0; i < words.length; i++) {
      if (STOP_WORDS.has(words[i])) engCount++;
    }
    if (words.length > 0 && engCount / words.length >= 0.15) return 'en';
    return 'unknown';
  }

  // ─── Public: splitSentences ───────────────────────────────────────────────
  /**
   * Split text into sentences (heuristic).
   */
  function splitSentences(text) {
    if (!text) return [];
    // Split on .!? followed by whitespace and uppercase
    return text
      .replace(/([.!?])\s+([A-Z])/g, '$1\n$2')
      .split('\n')
      .map(function (s) { return s.trim(); })
      .filter(function (s) { return s.length > 0; });
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  global.SRTokenizer = {
    build:            BUILD_ID,
    tokenize:         tokenize,
    normalize:        normalize,
    extractWords:     extractWords,
    expandContraction: expandContraction,
    isStopWord:       isStopWord,
    detectLanguage:   detectLanguage,
    splitSentences:   splitSentences,
    CONTRACTIONS:     CONTRACTIONS,
    STOP_WORDS:       STOP_WORDS,
  };

})(typeof window !== 'undefined' ? window : global);
