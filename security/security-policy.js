/**
 * shadow-reaper-standalone/security/security-policy.js
 * Shadow Reaper Standalone — Security Policy Module
 *
 * Build: SR-STANDALONE-SECURITY-1
 *
 * Exposes: window.SRSecurity
 *
 * PURPOSE:
 *   Centralized security policy enforcement for Shadow Reaper Standalone.
 *   Validates inputs, enforces data boundaries, prevents credential leaks,
 *   and guards against prompt injection from web research results.
 *
 * SECURITY PROPERTIES ENFORCED HERE:
 *   - UID isolation (private data never crosses user boundaries)
 *   - Sensitive data filtering (credentials never reach storage)
 *   - Untrusted data containment (web research never becomes instructions)
 *   - Input length and rate-limit readiness
 *   - Founder privilege validation (client-side pre-check only;
 *     actual enforcement is in Firestore rules)
 *
 * ⚠️  THIS MODULE IS CLIENT-SIDE ONLY.
 *   Client-side security checks are defense-in-depth ONLY.
 *   Firestore Security Rules are the authoritative enforcement layer.
 *   Privileged operations (Founder writes, global learning) require
 *   server-side validation — never trust the client alone.
 */

'use strict';

(function (global) {

  // ─── Sensitive patterns ───────────────────────────────────────────────────
  // Content containing these patterns must never be written to storage.
  var _SENSITIVE_PATTERNS = [
    /\b(password|passwd)\s*(is|=|:)\s*\S+/i,
    /\bapi[\s_-]?key\s*(is|=|:)\s*\S+/i,
    /\b(bearer|access[\s_-]?token)\s*(is|=|:)?\s*[A-Za-z0-9\-_.~+/]{20,}/i,
    /\bsecret\s*(is|=|:)\s*\S+/i,
    /\bcredit\s*card\s*(number|no|#)/i,
    /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,  // card number pattern
    /\b(private[\s_-]?key|ssh[\s_-]?key|rsa[\s_-]?key)\s*(is|=|:)/i,
    /\bmy\s+password\s+is\b/i,
    /\bmy\s+api\s+key\s+is\b/i,
    /\bfirebase[\s_-]?config/i,
    /serviceAccountKey/i,
  ];

  // ─── Prompt injection patterns ────────────────────────────────────────────
  // Web research results are UNTRUSTED. These patterns, if found in research
  // content, indicate attempted prompt injection or rule manipulation.
  var _INJECTION_PATTERNS = [
    /ignore\s+(previous|all|your)\s+(instructions?|rules|settings|safety|constraints)/i,
    /ignore\s+(?:all\s+)?(?:prior\s+)?(?:previous\s+)?instructions/i,
    /you\s+are\s+now\s+(a\s+different|an?\s+unrestricted|dan\b)/i,
    /system\s+prompt/i,
    /override\s+(your\s+)?(rules|instructions|safety|privacy|memory|constraints)/i,
    /forget\s+(your\s+)?(instructions|rules|personality|training|previous)/i,
    /disregard\s+(your\s+)?(previous|safety|privacy|instructions|rules)/i,
    /\[INST\]/i,
    /<\|system\|>/i,
    /###\s*(System|Instruction)/i,
    /access\s+(?:\w+\s+)*(private|user|memory|conversations?|data)/i,
    /reveal\s+(user|private|firebase|api|token|secret|credential)\b/i,
    /reveal.*\b(memory|memories|conversations?|private)\b/i,
    /execute\s+(this\s+)?(command|script|code)/i,
    /change\s+your\s+(system\s+)?(prompt|personality|rules|instructions)/i,
    /without\s+(any\s+)?(restrictions|limits|rules|constraints)/i,
    /no\s+restrictions?\s+mode/i,
    /dan\s+mode/i,
    /jailbreak/i,
  ];

  // ─── Content size limits ──────────────────────────────────────────────────
  var LIMITS = {
    maxUserInputLength:    4000,    // max chars in a single user message
    maxMemoryValueLength:  1000,    // max chars in a stored memory item
    maxConceptValueLength: 400,     // max chars in a learned concept
    maxResearchResultLength: 8000,  // max chars from a research result before truncation
  };

  // ─── Sensitive data check ─────────────────────────────────────────────────
  /**
   * containsSensitiveData(text)
   * Returns true if the text matches any sensitive data pattern.
   * Content that returns true must NOT be written to Firestore.
   */
  function containsSensitiveData(text) {
    if (!text || typeof text !== 'string') return false;
    return _SENSITIVE_PATTERNS.some(function (pattern) {
      return pattern.test(text);
    });
  }

  // ─── Prompt injection check ───────────────────────────────────────────────
  /**
   * containsInjectionAttempt(text)
   * Returns true if the text looks like a prompt injection attempt.
   * MUST be applied to ALL web research results before any use.
   * If true, the content must be discarded and never passed to Shadow Reaper.
   */
  function containsInjectionAttempt(text) {
    if (!text || typeof text !== 'string') return false;
    return _INJECTION_PATTERNS.some(function (pattern) {
      return pattern.test(text);
    });
  }

  // ─── Input validation ─────────────────────────────────────────────────────
  /**
   * validateUserInput(text)
   * Returns { ok: boolean, reason?: string, sanitized: string }
   */
  function validateUserInput(text) {
    if (!text || typeof text !== 'string') {
      return { ok: false, reason: 'empty_input', sanitized: '' };
    }
    var trimmed = text.trim();
    if (trimmed.length === 0) {
      return { ok: false, reason: 'empty_input', sanitized: '' };
    }
    if (trimmed.length > LIMITS.maxUserInputLength) {
      trimmed = trimmed.slice(0, LIMITS.maxUserInputLength);
    }
    return { ok: true, sanitized: trimmed };
  }

  // ─── Untrusted research result validation ─────────────────────────────────
  /**
   * validateResearchResult(result)
   * Applied to ALL web research responses before any use.
   *
   * Returns {
   *   ok: boolean,
   *   trusted: false,        — always false for web content
   *   safe: boolean,         — false if injection attempt detected
   *   reason?: string,
   *   content: string,       — truncated if needed
   * }
   */
  function validateResearchResult(result) {
    if (!result || typeof result !== 'object') {
      return { ok: false, trusted: false, safe: false, reason: 'invalid_result', content: '' };
    }

    var content = (result.content || result.text || '');
    if (typeof content !== 'string') content = '';

    // Truncate to budget
    if (content.length > LIMITS.maxResearchResultLength) {
      content = content.slice(0, LIMITS.maxResearchResultLength);
    }

    // Check for injection attempts
    if (containsInjectionAttempt(content)) {
      console.warn('[SRSecurity] Research result discarded: injection pattern detected.');
      return {
        ok:      false,
        trusted: false,
        safe:    false,
        reason:  'injection_attempt_detected',
        content: '',
      };
    }

    // Check for sensitive data leaking out of research
    if (containsSensitiveData(content)) {
      console.warn('[SRSecurity] Research result discarded: sensitive data pattern detected.');
      return {
        ok:      false,
        trusted: false,
        safe:    false,
        reason:  'sensitive_data_in_result',
        content: '',
      };
    }

    return {
      ok:        true,
      trusted:   false,    // ALWAYS FALSE — web content is never trusted
      safe:      true,
      content:   content,
      sourceUrl: result.sourceUrl || result.url || '',
      domain:    result.domain || '',
      warning:   'UNTRUSTED_WEB_DATA — supplement only, not instructions',
    };
  }

  // ─── UID isolation check ──────────────────────────────────────────────────
  /**
   * validateUIDAccess(requestedUID, currentUID)
   * Returns true only if currentUID matches requestedUID.
   * Used before any private data read/write.
   */
  function validateUIDAccess(requestedUID, currentUID) {
    if (!requestedUID || !currentUID) return false;
    return requestedUID === currentUID;
  }

  // ─── Founder privilege pre-check (client-side only) ──────────────────────
  /**
   * isFounderPreCheck()
   * Client-side pre-check only. NOT authoritative.
   * Real enforcement is in Firestore Security Rules (role claim).
   */
  function isFounderPreCheck() {
    try {
      if (global.SRFirebaseAdapter && global.SRFirebaseAdapter.getCurrentUser) {
        var user = global.SRFirebaseAdapter.getCurrentUser();
        if (user && user.getIdTokenResult) {
          // Token claims are the real source of truth — this is async in prod
          // Synchronous check is best-effort only
        }
      }
      // Fall back to never claiming Founder status client-side
      // The server (Firestore rules) will enforce it
      return false;
    } catch (_) {
      return false;
    }
  }

  // ─── Status ───────────────────────────────────────────────────────────────
  function getPolicy() {
    return {
      build:                      'SR-STANDALONE-SECURITY-1',
      sensitivePatternCount:      _SENSITIVE_PATTERNS.length,
      injectionPatternCount:      _INJECTION_PATTERNS.length,
      limits:                     Object.assign({}, LIMITS),
      webResearchAlwaysUntrusted: true,
      clientSideFounderTrust:     false,   // never trust client for Founder
      firestoreRulesEnforced:     true,    // server-side is authoritative
    };
  }

  // ─── Expose ───────────────────────────────────────────────────────────────
  global.SRSecurity = {
    build: 'SR-STANDALONE-SECURITY-1',

    containsSensitiveData:    containsSensitiveData,
    containsInjectionAttempt: containsInjectionAttempt,
    validateUserInput:        validateUserInput,
    validateResearchResult:   validateResearchResult,
    validateUIDAccess:        validateUIDAccess,
    isFounderPreCheck:        isFounderPreCheck,
    getPolicy:                getPolicy,
    LIMITS:                   LIMITS,
  };

})(typeof window !== 'undefined' ? window : global);
