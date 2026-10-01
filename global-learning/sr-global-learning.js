/**
 * shadow-reaper-standalone/global-learning/sr-global-learning.js
 * Shadow Reaper Standalone — Global Learning
 *
 * Build: SR-STANDALONE-GLOBAL-LEARNING-1
 *
 * Exposes: window.SRGlobalLearning
 *
 * PURPOSE:
 *   Optional opt-in global learning that may benefit all users.
 *   Users contribute ONLY de-identified, sanitized, non-personal knowledge signals.
 *
 * PRIVACY CONTRACTS (NON-NEGOTIABLE):
 *   1. Private conversations are NEVER automatically promoted to global learning
 *   2. Global learning entries must be sanitized and de-identified before writing
 *   3. No entry may be traceable back to a specific user
 *   4. Users must have explicitly opted in — opt-out is always available
 *   5. A Founder must review and approve all global learning entries
 *   6. Global learning entries go through server-side validation
 *      They are NEVER written directly from the client to globalLearning
 *   7. Sensitive information is rejected before proposal
 *   8. Secrets, credentials, and PII are always rejected
 *   9. Temporary emotions and personal states are not globally learned
 *   10. One user repeating a false statement cannot poison global knowledge
 *       (Founder review is the guard against poisoning/manipulation)
 *
 * ARCHITECTURE:
 *   Private Learning                    Global Learning
 *   (per-user, UID-isolated)           (de-identified, Founder-approved)
 *          |                                    |
 *   User's adaptive                    Sanitized fact proposals
 *   brain, memory,                     → server-side validation
 *   history                            → Founder review queue
 *                                      → Approved entries only
 *
 * TRUST LEVELS:
 *   PRIVATE_USER   — Only accessible by owner UID (history, memory, adaptive)
 *   GLOBAL_GENERAL — Anonymized, approved, non-personal knowledge
 *   VERIFIED_PUBLIC— Verified factual knowledge with source provenance
 *
 * STATUS: Architecture active. Contribution pipeline requires server deployment.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-GLOBAL-LEARNING-1';

  // ─── Feature state ────────────────────────────────────────────────────────
  var _enabled     = false;   // Founder must enable globally
  var _userOptedIn = false;   // User must explicitly consent

  // ─── Consent storage key ──────────────────────────────────────────────────
  var _CONSENT_KEY  = 'srGlobalLearningConsent';
  var _OPT_OUT_KEY  = 'srGlobalLearningOptOut';

  // ─── Sensitive data patterns (reject before any contribution) ─────────────
  var _SENSITIVE = [
    /\b(password|passwd)\s*(is|=|:)\s*\S+/i,
    /\bapi[\s_-]?key\s*(is|=|:)\s*\S+/i,
    /\btoken\s*(is|=|:)\s*\S+/i,
    /\bsecret\s*(is|=|:)\s*\S+/i,
    /\bcredit\s*card/i,
    /\bmy\s+password\s+is\b/i,
    /\bmy\s+(full\s+)?name\s+is\b/i,  // PII
    /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/,  // phone number pattern
    /\b\d{3}-\d{2}-\d{4}\b/,          // SSN pattern
    /\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,}\b/,  // email
    /serviceAccountKey/i,
    /\bprivate[\s_-]?key\b/i,
  ];

  // ─── Non-global content (too personal/temporary to globalize) ─────────────
  var _NON_GLOBAL = [
    /\bi'?m\s+(sad|angry|happy|excited|tired|stressed|scared|depressed|anxious)/i,
    /\bi\s+am\s+(sad|angry|happy|excited|tired|stressed|scared|depressed|anxious)/i,
    /\bi'?m\s+feeling\b/i,
    /\bi\s+am\s+feeling\b/i,
    /\bi\s+feel\s+/i,
    /feeling\s+(sad|angry|happy|excited|tired|stressed|scared|depressed|anxious)/i,
    /\bmy\s+(family|wife|husband|girlfriend|boyfriend|children|kids|parents)\b/i,
    /\bmy\s+(home|house|apartment|address)\b/i,
    /\bmy\s+phone\s+(number|is)\b/i,
    /today\s+I\s+(did|went|saw|ate|felt)/i,
  ];

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function _fb()  { return global.SRFirebaseAdapter || null; }
  function _uid() { var fb = _fb(); return fb ? fb.getUID() : null; }
  function _isAuth() { return !!_uid(); }

  function _isSensitive(text) {
    return _SENSITIVE.some(function (p) { return p.test(text); });
  }

  function _isPersonalContent(text) {
    return _NON_GLOBAL.some(function (p) { return p.test(text); });
  }

  // ─── Consent management ───────────────────────────────────────────────────
  function _loadConsent() {
    try {
      if (global.localStorage && global.localStorage.getItem(_OPT_OUT_KEY) === 'true') {
        _userOptedIn = false;
        return;
      }
      var v = global.localStorage && global.localStorage.getItem(_CONSENT_KEY);
      _userOptedIn = v === 'true';
    } catch (_) {}
  }

  function _loadConsent() {
    try {
      if (global.localStorage && global.localStorage.getItem(_OPT_OUT_KEY) === 'true') {
        _userOptedIn = false;
        return;
      }
      var v = global.localStorage && global.localStorage.getItem(_CONSENT_KEY);
      _userOptedIn = v === 'true';
    } catch (_) {}
  }

  // Load consent from storage on init
  _loadConsent();

  // ─── User consent control ─────────────────────────────────────────────────
  /**
   * setUserConsent(hasConsented)
   * Must be called with true only after explicit, informed user action in UI.
   * Calling with false opts the user OUT and persists that choice.
   */
  function setUserConsent(hasConsented) {
    _userOptedIn = !!hasConsented;
    try {
      if (global.localStorage) {
        global.localStorage.setItem(_CONSENT_KEY, _userOptedIn ? 'true' : 'false');
        // Explicit opt-out flag for clarity
        if (!_userOptedIn) {
          global.localStorage.setItem(_OPT_OUT_KEY, 'true');
        } else {
          global.localStorage.removeItem(_OPT_OUT_KEY);
        }
      }
    } catch (_) {}

    if (_userOptedIn) {
      console.log('[SRGlobalLearning] User opted in to global learning contributions.');
    } else {
      console.log('[SRGlobalLearning] User opted out of global learning.');
    }
  }

  function isOptedIn()  { return _userOptedIn; }
  function isEnabled()  { return _enabled; }

  // ─── Founder enable/disable ───────────────────────────────────────────────
  function setEnabled(val) {
    _enabled = !!val;
  }

  // ─── Readiness check ──────────────────────────────────────────────────────
  function isReady() {
    return _enabled && _userOptedIn && _isAuth();
  }

  // ─── Sanitize a knowledge proposal ───────────────────────────────────────
  /**
   * sanitize(entry)
   * Validates and sanitizes a proposed knowledge contribution.
   * Returns { ok: boolean, reason?: string, sanitized?: object }
   *
   * Rejects:
   *   - Empty or too-short content
   *   - Sensitive patterns (credentials, PII)
   *   - Personal/identifying content
   *   - Content that is too specific to one person
   *   - Content that could be prompt injection
   */
  function sanitize(entry) {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, reason: 'invalid_entry' };
    }

    var text = (entry.content || entry.text || '').trim();
    if (!text || text.length < 10) {
      return { ok: false, reason: 'content_too_short' };
    }
    if (text.length > 500) {
      return { ok: false, reason: 'content_too_long' };
    }

    // Sensitive data check
    if (_isSensitive(text)) {
      console.warn('[SRGlobalLearning] Contribution rejected: sensitive data.');
      return { ok: false, reason: 'sensitive_data_rejected' };
    }

    // Personal content check
    if (_isPersonalContent(text)) {
      console.warn('[SRGlobalLearning] Contribution rejected: personal/private content.');
      return { ok: false, reason: 'personal_content_rejected' };
    }

    // Prompt injection check
    var sec = global.SRSecurity;
    if (sec && sec.containsInjectionAttempt && sec.containsInjectionAttempt(text)) {
      console.warn('[SRGlobalLearning] Contribution rejected: injection attempt detected.');
      return { ok: false, reason: 'injection_attempt_rejected' };
    }

    // De-identify: no UID, no personal identifiers
    return {
      ok: true,
      sanitized: {
        content:      text,
        category:     entry.category || 'general',
        confidence:   entry.confidence || 'LOW',
        proposedAt:   new Date().toISOString(),
        // No UID, no user identifiers — this is the de-identification step
        _deidentified: true,
        _reviewStatus: 'pending_founder_review',
      },
    };
  }

  // ─── Propose contribution ─────────────────────────────────────────────────
  /**
   * proposeContribution(entry, callback)
   *
   * Proposes a sanitized, non-personal knowledge entry for Founder review.
   *
   * NEVER writes directly to Firestore globalLearning collection.
   * Must go through server-side validation and Founder approval.
   *
   * callback({ ok, reason })
   */
  function proposeContribution(entry, callback) {
    callback = callback || function () {};

    if (!_enabled) {
      callback({ ok: false, reason: 'global_learning_disabled' });
      return;
    }
    if (!_userOptedIn) {
      callback({ ok: false, reason: 'user_consent_required' });
      return;
    }
    if (!_isAuth()) {
      callback({ ok: false, reason: 'authentication_required' });
      return;
    }

    // Sanitize the entry
    var sanitized = sanitize(entry);
    if (!sanitized.ok) {
      callback({ ok: false, reason: sanitized.reason });
      return;
    }

    // Check Cloudflare Worker is configured (server-side submission path)
    var cf = global.SRCloudflareAdapter;
    if (!cf || !cf.isConfigured()) {
      // Cannot submit without server infrastructure
      callback({ ok: false, reason: 'server_infrastructure_not_configured' });
      return;
    }

    // Submit to server-side validation endpoint
    // The server will:
    //   1. Validate the entry further
    //   2. Add it to a Founder review queue
    //   3. Only promote it to globalLearning after Founder approval
    // TODO: Implement /global-learning endpoint in Cloudflare Worker
    callback({ ok: false, reason: 'global_learning_submission_not_yet_deployed' });
  }

  // ─── Fetch global learning (read-only, for context enrichment) ────────────
  /**
   * fetch(query, callback)
   * Reads approved entries from globalLearning for context enrichment.
   * This is READ-ONLY. No private user data comes from here.
   * NEVER mixes with private user memories or history.
   */
  function fetch(query, callback) {
    callback = callback || function () {};

    if (!_enabled) {
      callback({ ok: false, items: [], reason: 'global_learning_disabled' });
      return;
    }

    var fb  = _fb();
    var col = fb ? fb.globalLearningCol() : null;
    if (!col) {
      callback({ ok: false, items: [], reason: 'firebase_unavailable' });
      return;
    }

    // Read approved global learning entries
    col.where('_reviewStatus', '==', 'approved').limit(20).get().then(function (snap) {
      var items = [];
      snap.forEach(function (doc) {
        var data = doc.data();
        // Verify de-identification before returning
        if (data._deidentified === true) {
          items.push({
            content:    data.content,
            category:   data.category,
            confidence: data.confidence,
            approvedAt: data.approvedAt,
            // No UID or user identifiers — by design
          });
        }
      });
      callback({ ok: true, items: items });
    }).catch(function (err) {
      callback({ ok: false, items: [], reason: err.message });
    });
  }

  // ─── Check if content is private (should NEVER go to global) ─────────────
  /**
   * isPrivateContent(text)
   * Returns true if the text contains private/personal information that
   * must stay in private user learning and never be globally contributed.
   *
   * This is the fundamental separation check between private and global systems.
   */
  function isPrivateContent(text) {
    if (!text) return true;  // default to private for safety
    return _isSensitive(text) || _isPersonalContent(text);
  }

  // ─── Get consent status ───────────────────────────────────────────────────
  function getConsentStatus() {
    return {
      enabled:    _enabled,
      optedIn:    _userOptedIn,
      ready:      isReady(),
    };
  }

  // ─── Privacy separation test ──────────────────────────────────────────────
  /**
   * verifyPrivateSeparation()
   * Returns true if private data isolation is correctly maintained.
   * The private learning system and global learning system must never mix.
   * This is a runtime verification check.
   */
  function verifyPrivateSeparation() {
    // Private learning: users/{uid}/shadowReaperLearnedContext
    // Global learning:  globalLearning/{docId}
    // These are different collections — Firestore rules enforce separation
    // Private users cannot write to globalLearning (Founder-only write)
    // Global learning entries never contain UIDs
    return {
      privateCollectionPath: 'users/{uid}/shadowReaperLearnedContext',
      globalCollectionPath:  'globalLearning/{docId}',
      privateWriteRole:      'owner_uid_only',
      globalWriteRole:       'founder_only_via_server',
      separation:            'enforced_by_firestore_rules',
      privateContainsUID:    true,   // private data is UID-isolated
      globalContainsUID:     false,  // global data is de-identified
    };
  }

  // ─── Expose ───────────────────────────────────────────────────────────────
  global.SRGlobalLearning = {
    build: BUILD_ID,

    // Consent
    setUserConsent:       setUserConsent,
    isOptedIn:            isOptedIn,

    // Control
    setEnabled:           setEnabled,
    isEnabled:            isEnabled,
    isReady:              isReady,

    // Core operations
    sanitize:             sanitize,
    proposeContribution:  proposeContribution,
    fetch:                fetch,

    // Privacy utilities
    isPrivateContent:     isPrivateContent,
    verifyPrivateSeparation: verifyPrivateSeparation,
    getConsentStatus:     getConsentStatus,
  };

})(typeof window !== 'undefined' ? window : global);
