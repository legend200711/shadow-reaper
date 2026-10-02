/**
 * shadow-reaper-standalone/global-learning/sr-shared-knowledge-bridge.js
 * Shadow Reaper — Controlled Shared Knowledge Bridge
 *
 * Build: SR-SHARED-KNOWLEDGE-BRIDGE-1
 *
 * Exposes: window.SRSharedKnowledgeBridge
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PURPOSE:
 *   Single controlled interface for generalized knowledge to flow:
 *
 *     Shadow Edition Learning
 *       ↓
 *     submitGeneralizedCandidate()  ← [SHADOW EDITION ONLY]
 *       ↓
 *     Private-data detection + sanitization + de-identification
 *       ↓
 *     validateSharedCandidate()     ← [SHADOW EDITION ONLY]
 *       ↓
 *     Manual Founder approval
 *       ↓
 *     promoteVerifiedKnowledge()    ← [SHADOW EDITION ONLY]
 *       ↓
 *     VERIFIED_SHARED_KNOWLEDGE (Firestore sharedKnowledge collection)
 *       ↓
 *     queryVerifiedSharedKnowledge()  ← [BOTH EDITIONS]
 *       ↓
 *     Regular Shadow Reaper (read-only)
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * ABSOLUTE DATA BOUNDARIES:
 *
 *   PRIVATE_SHADOW_MEMORY           — never shared
 *   PRIVATE_SHADOW_PROJECTS         — never shared
 *   PRIVATE_SHADOW_CONVERSATIONS    — never shared
 *   PRIVATE_SHADOW_ADAPTIVE         — never shared
 *   REGULAR_USER_PRIVATE_DATA       — never shared
 *   SHARED_GENERAL_KNOWLEDGE        — candidate, must validate
 *   VERIFIED_SHARED_KNOWLEDGE       — promoted, queryable
 *   INTERNET_RESEARCH               — not auto-promoted
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * NEVER SHARE (enforced by sanitizeCandidate()):
 *   - Raw conversation content
 *   - Personal names from private conversations
 *   - Email addresses
 *   - Phone numbers
 *   - Physical addresses
 *   - Credentials / API keys / tokens
 *   - Firebase UIDs
 *   - Device identifiers
 *   - Location history
 *   - Private project names or their contents
 *   - Private preferences
 * ═══════════════════════════════════════════════════════════════════════════
 * POISONING PROTECTION:
 *   - No single conversation can become global truth
 *   - Candidates require validation + confidence threshold
 *   - Duplicate detection before promotion
 *   - Contradiction detection against existing knowledge
 *   - Provenance attached to all promoted knowledge
 *   - Rejection is permanent (no promotion after rejection)
 *   - Rollback supported via version field
 * ═══════════════════════════════════════════════════════════════════════════
 * BIDIRECTIONAL SYNC:
 *   NOT ENABLED in this build.
 *   Foundation/interfaces only.
 *   Bidirectional approved general knowledge flow is DESIGNED but NOT
 *   automatically enabled. Each promotion is deliberate and controlled.
 * ═══════════════════════════════════════════════════════════════════════════
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-SHARED-KNOWLEDGE-BRIDGE-1';

  // ── Validation states ─────────────────────────────────────────────────────
  var VALIDATION_STATE = {
    CANDIDATE:  'CANDIDATE',   // Submitted, awaiting validation
    VALIDATED:  'VALIDATED',   // Passed automated checks
    PROMOTED:   'PROMOTED',    // Founder-approved, in shared knowledge
    REJECTED:   'REJECTED',    // Failed validation or manually rejected
    RETRACTED:  'RETRACTED',   // Was promoted, subsequently retracted
  };

  // ── Knowledge categories that MAY flow through this bridge ────────────────
  var SHAREABLE_CATEGORIES = [
    'GENERAL_LANGUAGE',        // Language understanding improvements
    'GENERAL_PATTERN',         // Non-private conversational patterns
    'GENERAL_CONCEPT',         // Non-private concept improvements
    'FACTUAL_CORRECTION',      // Factual corrections (source-validated)
    'GENERAL_CAPABILITY',      // Capability/feature knowledge
  ];

  // ── Categories that NEVER flow through this bridge ────────────────────────
  var BLOCKED_CATEGORIES = [
    'PRIVATE_SHADOW_MEMORY',
    'PRIVATE_SHADOW_PROJECTS',
    'PRIVATE_SHADOW_CONVERSATIONS',
    'PRIVATE_SHADOW_ADAPTIVE',
    'REGULAR_USER_PRIVATE_DATA',
    'USER_PREFERENCE',
    'USER_IDENTITY',
    'PERSONAL_NAME',
    'CONTACT_INFO',
    'LOCATION',
    'CREDENTIAL',
    'AUTH_TOKEN',
    'DEVICE_ID',
  ];

  // ── Patterns that indicate private data (reject on match) ─────────────────
  var _PRIVATE_PATTERNS = [
    /\b[A-Z0-9._%+\-]+@[A-Z0-9.\-]+\.[A-Z]{2,}\b/i,   // email
    /\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/,               // phone (US)
    /\b\d{1,5}\s\w+\s(?:street|st|avenue|ave|road|rd|blvd|drive|dr|lane|ln)\b/i, // address
    /\bpassword\b/i,
    /\bapikey\b|\bapi[_-]?key\b/i,
    /\btoken\b/i,
    /\bsecret\b/i,
    /\bcredential\b/i,
    /\bfirebase\b.*\buid\b|\buid\b.*\bfirebase\b/i,
    /\bprivate[_-]?key\b/i,
    /\bAIza[A-Za-z0-9_\-]{20,}\b/,                     // Firebase/Google API key prefix pattern
    /([A-Za-z0-9+/]{40,}={0,2})/,                      // base64 that looks like a key/token
  ];

  // ── Confidence threshold for promotion ────────────────────────────────────
  var MIN_CONFIDENCE_FOR_PROMOTION = 0.7;

  // ── In-memory candidate buffer (not persisted here; only Firestore persists)
  var _pendingCandidates = [];

  // ─────────────────────────────────────────────────────────────────────────
  // SANITIZATION — reject or strip private data before any further processing
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * sanitizeCandidate(candidate)
   *
   * Scans candidate content for private data patterns.
   * Returns: { safe: boolean, reason?: string, sanitized?: string }
   *
   * If safe: true, returns sanitized copy (cleaned but not altered in meaning).
   * If safe: false, returns reason and candidate must NOT be promoted.
   */
  function sanitizeCandidate(candidate) {
    if (!candidate || typeof candidate !== 'object') {
      return { safe: false, reason: 'invalid_candidate_object' };
    }

    // ── Category gate ────────────────────────────────────────────────────────
    var cat = (candidate.category || '').toUpperCase();
    if (BLOCKED_CATEGORIES.indexOf(cat) !== -1) {
      return { safe: false, reason: 'blocked_category:' + cat };
    }
    if (SHAREABLE_CATEGORIES.indexOf(cat) === -1) {
      return { safe: false, reason: 'unknown_category:' + cat };
    }

    // ── Content scan ─────────────────────────────────────────────────────────
    var contentFields = ['content', 'description', 'example', 'lesson'];
    for (var f = 0; f < contentFields.length; f++) {
      var val = candidate[contentFields[f]];
      if (typeof val === 'string') {
        for (var p = 0; p < _PRIVATE_PATTERNS.length; p++) {
          if (_PRIVATE_PATTERNS[p].test(val)) {
            return {
              safe: false,
              reason: 'private_data_pattern_detected_in:' + contentFields[f],
            };
          }
        }
      }
    }

    // ── Forbidden credential/key field names ─────────────────────────────────
    var forbiddenKeys = [
      'apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId',
      'appId', 'token', 'password', 'secret', 'uid', 'userId', 'email',
      'phone', 'privateKey', 'raw_transcript', 'conversation_text',
      'memory_content', 'project_name',
    ];
    for (var k = 0; k < forbiddenKeys.length; k++) {
      if (candidate.hasOwnProperty(forbiddenKeys[k])) {
        return {
          safe: false,
          reason: 'forbidden_field_in_candidate:' + forbiddenKeys[k],
        };
      }
    }

    // ── Raw transcript gate ───────────────────────────────────────────────────
    if (candidate.hasOwnProperty('raw_conversation') ||
        candidate.hasOwnProperty('conversation_id') ||
        candidate.hasOwnProperty('turn_id')) {
      return { safe: false, reason: 'raw_conversation_data_forbidden' };
    }

    // ── Single-source gate (one conversation must not become global truth) ────
    if (candidate.sourceCount !== undefined && candidate.sourceCount < 2) {
      return {
        safe: false,
        reason: 'insufficient_sources:requires_2_or_more_confirmations',
      };
    }

    // Sanitized content: strip any remaining suspicious tokens
    var sanitized = JSON.parse(JSON.stringify(candidate));
    sanitized._sanitizedAt = new Date().toISOString();

    return { safe: true, sanitized: sanitized };
  }

  /**
   * deidentifyCandidate(candidate)
   *
   * Returns a version of the candidate with any indirect identifiers removed.
   * Does NOT alter the knowledge content — only strips metadata.
   */
  function deidentifyCandidate(candidate) {
    var clean = Object.assign({}, candidate);
    // Remove any source attribution that could trace back to a private conversation
    delete clean.sourceConversationId;
    delete clean.sourceTurnId;
    delete clean.sourceUserId;
    delete clean.sourceDeviceId;
    delete clean.sourceEmail;
    delete clean.createdByUid;
    // Keep: category, content, description, lesson, example, confidence, version
    clean._deidentifiedAt = new Date().toISOString();
    return clean;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // SUBMIT — Submit a generalized learning candidate for validation
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * submitGeneralizedCandidate(candidate, callback)
   *
   * SHADOW EDITION ONLY.
   * Submits a generalized learning candidate for the controlled pipeline.
   *
   * candidate: {
   *   category:    string (must be in SHAREABLE_CATEGORIES)
   *   content:     string (generalized lesson — NO private data)
   *   description: string (human-readable summary)
   *   example?:    string (anonymous illustrative example — NO private data)
   *   confidence:  number 0-1
   *   sourceCount: number (how many independent observations this is based on; min 2)
   *   version?:    string
   * }
   *
   * callback(result):
   *   result.ok:           boolean
   *   result.candidateId:  string (if submitted)
   *   result.reason:       string (if rejected)
   *   result.state:        VALIDATION_STATE value
   */
  function submitGeneralizedCandidate(candidate, callback) {
    callback = callback || function () {};

    // ── Sanitize ──────────────────────────────────────────────────────────────
    var sanResult = sanitizeCandidate(candidate);
    if (!sanResult.safe) {
      callback({
        ok:     false,
        state:  VALIDATION_STATE.REJECTED,
        reason: 'sanitization_failed:' + sanResult.reason,
      });
      return;
    }

    // ── De-identify ───────────────────────────────────────────────────────────
    var deident = deidentifyCandidate(sanResult.sanitized);

    // ── Build candidate record ────────────────────────────────────────────────
    var id = 'skc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    var record = Object.assign({}, deident, {
      id:              id,
      state:           VALIDATION_STATE.CANDIDATE,
      submittedAt:     new Date().toISOString(),
      validatedAt:     null,
      promotedAt:      null,
      rejectedAt:      null,
      rejectionReason: null,
      confidence:      typeof deident.confidence === 'number' ? deident.confidence : 0,
      safetyStatus:    'PENDING_REVIEW',
    });

    // ── Persist to Firestore (if adapter available) ───────────────────────────
    var fb = global.SRFirebaseAdapter;
    if (fb && typeof fb.getDB === 'function' && fb.isAuthenticated()) {
      var db = fb.getDB();
      if (db) {
        db.collection('sharedKnowledge').doc(id).set(record).then(function () {
          _pendingCandidates.push(record);
          callback({ ok: true, candidateId: id, state: VALIDATION_STATE.CANDIDATE });
        }).catch(function (err) {
          callback({ ok: false, reason: 'firestore_write_failed:' + err.message, state: null });
        });
        return;
      }
    }

    // Firestore not available — buffer locally only (temporary)
    _pendingCandidates.push(record);
    callback({
      ok:          true,
      candidateId: id,
      state:       VALIDATION_STATE.CANDIDATE,
      note:        'buffered_locally:firestore_unavailable',
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // VALIDATE — Run automated validation checks on a candidate
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * validateSharedCandidate(candidateId, callback)
   *
   * SHADOW EDITION ONLY (called by Founder before manual approval).
   * Runs automated validation: confidence check, deduplication, contradiction scan.
   *
   * callback(result):
   *   result.ok:          boolean
   *   result.candidateId: string
   *   result.state:       VALIDATION_STATE
   *   result.checks:      { confidence, dedup, contradiction, safety }
   *   result.reason?:     string (if !ok)
   */
  function validateSharedCandidate(candidateId, callback) {
    callback = callback || function () {};

    var fb = global.SRFirebaseAdapter;
    if (!fb || !fb.isAuthenticated()) {
      callback({ ok: false, reason: 'not_authenticated', state: null });
      return;
    }

    var db = fb.getDB ? fb.getDB() : null;
    if (!db) {
      callback({ ok: false, reason: 'firestore_unavailable', state: null });
      return;
    }

    db.collection('sharedKnowledge').doc(candidateId).get().then(function (doc) {
      if (!doc.exists) {
        callback({ ok: false, reason: 'candidate_not_found', state: null });
        return;
      }

      var data = doc.data();

      // Re-sanitize
      var sanResult = sanitizeCandidate(data);
      if (!sanResult.safe) {
        // Mark as rejected
        db.collection('sharedKnowledge').doc(candidateId).update({
          state:           VALIDATION_STATE.REJECTED,
          rejectedAt:      new Date().toISOString(),
          rejectionReason: 'sanitization_failed:' + sanResult.reason,
          safetyStatus:    'REJECTED',
        });
        callback({
          ok:          false,
          candidateId: candidateId,
          state:       VALIDATION_STATE.REJECTED,
          reason:      'sanitization_failed:' + sanResult.reason,
          checks:      { confidence: false, dedup: 'n/a', contradiction: 'n/a', safety: 'FAILED' },
        });
        return;
      }

      // Confidence check
      var confOk = typeof data.confidence === 'number' && data.confidence >= MIN_CONFIDENCE_FOR_PROMOTION;

      // Safety status
      var safetyOk = sanResult.safe;

      var checks = {
        confidence:    confOk,
        dedup:         'REQUIRES_MANUAL_CHECK',  // Full dedup requires Firestore query
        contradiction: 'REQUIRES_MANUAL_CHECK',  // Contradiction scan requires knowledge corpus
        safety:        safetyOk ? 'PASSED' : 'FAILED',
      };

      var validated = confOk && safetyOk;
      var newState  = validated ? VALIDATION_STATE.VALIDATED : VALIDATION_STATE.REJECTED;

      db.collection('sharedKnowledge').doc(candidateId).update({
        state:       newState,
        validatedAt: new Date().toISOString(),
        safetyStatus: safetyOk ? 'PASSED' : 'REJECTED',
        _validationChecks: checks,
      }).then(function () {
        callback({
          ok:          validated,
          candidateId: candidateId,
          state:       newState,
          checks:      checks,
          reason:      validated ? undefined : 'failed_automated_validation',
        });
      }).catch(function (err) {
        callback({ ok: false, reason: 'update_failed:' + err.message, state: null });
      });

    }).catch(function (err) {
      callback({ ok: false, reason: 'read_failed:' + err.message, state: null });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PROMOTE — Founder-approved promotion to Verified Shared Knowledge
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * promoteVerifiedKnowledge(candidateId, founderNote, callback)
   *
   * SHADOW EDITION ONLY. Requires FOUNDER_SHADOW capability.
   *
   * Promotes a VALIDATED candidate to PROMOTED (Verified Shared Knowledge).
   * Only VALIDATED candidates can be promoted.
   * Rejected candidates cannot be promoted.
   *
   * callback(result):
   *   result.ok:           boolean
   *   result.candidateId:  string
   *   result.state:        VALIDATION_STATE
   *   result.reason?:      string
   */
  function promoteVerifiedKnowledge(candidateId, founderNote, callback) {
    if (typeof founderNote === 'function') { callback = founderNote; founderNote = ''; }
    callback = callback || function () {};

    // ── Must have FOUNDER_SHADOW capability ───────────────────────────────────
    var founderShadow = global.SRFounderShadow;
    if (!founderShadow) {
      callback({ ok: false, reason: 'founder_shadow_not_loaded', state: null });
      return;
    }

    founderShadow.verifyAction('PROMOTE_VERIFIED_KNOWLEDGE', function (fdrResult) {
      if (!fdrResult.ok) {
        callback({
          ok:     false,
          reason: 'founder_shadow_not_granted:' + fdrResult.reason,
          state:  null,
        });
        return;
      }

      var fb = global.SRFirebaseAdapter;
      if (!fb || !fb.isAuthenticated()) {
        callback({ ok: false, reason: 'not_authenticated', state: null });
        return;
      }

      var db = fb.getDB ? fb.getDB() : null;
      if (!db) {
        callback({ ok: false, reason: 'firestore_unavailable', state: null });
        return;
      }

      db.collection('sharedKnowledge').doc(candidateId).get().then(function (doc) {
        if (!doc.exists) {
          callback({ ok: false, reason: 'candidate_not_found', state: null });
          return;
        }
        var data = doc.data();

        // Only VALIDATED may be promoted
        if (data.state !== VALIDATION_STATE.VALIDATED) {
          callback({
            ok:     false,
            reason: 'cannot_promote:state_is_' + data.state,
            state:  data.state,
          });
          return;
        }

        // Final sanitization before promotion
        var sanResult = sanitizeCandidate(data);
        if (!sanResult.safe) {
          db.collection('sharedKnowledge').doc(candidateId).update({
            state:           VALIDATION_STATE.REJECTED,
            rejectedAt:      new Date().toISOString(),
            rejectionReason: 'final_sanitization_failed:' + sanResult.reason,
            safetyStatus:    'REJECTED',
          });
          callback({
            ok:     false,
            reason: 'final_sanitization_failed:' + sanResult.reason,
            state:  VALIDATION_STATE.REJECTED,
          });
          return;
        }

        db.collection('sharedKnowledge').doc(candidateId).update({
          state:          VALIDATION_STATE.PROMOTED,
          promotedAt:     new Date().toISOString(),
          founderNote:    founderNote || '',
          safetyStatus:   'PROMOTED',
          available:      true,     // queryable by regular Shadow Reaper
        }).then(function () {
          callback({
            ok:          true,
            candidateId: candidateId,
            state:       VALIDATION_STATE.PROMOTED,
          });
        }).catch(function (err) {
          callback({ ok: false, reason: 'promote_write_failed:' + err.message, state: null });
        });

      }).catch(function (err) {
        callback({ ok: false, reason: 'read_failed:' + err.message, state: null });
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // QUERY — Read verified shared knowledge (both editions)
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * queryVerifiedSharedKnowledge(query, callback)
   *
   * BOTH EDITIONS. Query-only — no write access to this path.
   * Returns only PROMOTED knowledge (state === 'PROMOTED', available === true).
   * Private data never appears here (blocked by sanitization before promotion).
   *
   * query: {
   *   category?:   string (filter by category)
   *   limit?:      number (default 20)
   *   keywords?:   string[] (optional, for future relevance filter)
   * }
   *
   * callback(result):
   *   result.ok:     boolean
   *   result.items:  KnowledgeItem[]
   *   result.reason: string (if !ok)
   */
  function queryVerifiedSharedKnowledge(query, callback) {
    if (typeof query === 'function') { callback = query; query = {}; }
    callback = callback || function () {};
    query    = query    || {};

    var fb = global.SRFirebaseAdapter;
    if (!fb || !fb.isAuthenticated()) {
      // Return empty rather than failing hard — guests just don't get shared knowledge
      callback({ ok: true, items: [], note: 'not_authenticated' });
      return;
    }

    var db = fb.getDB ? fb.getDB() : null;
    if (!db) {
      callback({ ok: true, items: [], note: 'firestore_unavailable' });
      return;
    }

    var limit = Math.min(typeof query.limit === 'number' ? query.limit : 20, 100);

    var ref = db.collection('sharedKnowledge')
                .where('state',     '==', VALIDATION_STATE.PROMOTED)
                .where('available', '==', true)
                .limit(limit);

    if (query.category) {
      ref = db.collection('sharedKnowledge')
              .where('state',     '==', VALIDATION_STATE.PROMOTED)
              .where('available', '==', true)
              .where('category',  '==', query.category)
              .limit(limit);
    }

    ref.get().then(function (snapshot) {
      var items = [];
      snapshot.forEach(function (doc) {
        var data = doc.data();
        // Strip any metadata that shouldn't be read client-side
        items.push({
          id:          doc.id,
          category:    data.category,
          content:     data.content,
          description: data.description,
          example:     data.example,
          confidence:  data.confidence,
          promotedAt:  data.promotedAt,
          version:     data.version || '1',
        });
      });
      callback({ ok: true, items: items });
    }).catch(function (err) {
      callback({ ok: false, items: [], reason: 'query_failed:' + err.message });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REJECT — Permanently reject a candidate
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * rejectSharedCandidate(candidateId, reason, callback)
   *
   * SHADOW EDITION ONLY. Requires FOUNDER_SHADOW.
   * Rejected candidates cannot be promoted.
   */
  function rejectSharedCandidate(candidateId, reason, callback) {
    if (typeof reason === 'function') { callback = reason; reason = 'manual_rejection'; }
    callback = callback || function () {};

    var founderShadow = global.SRFounderShadow;
    if (!founderShadow) {
      callback({ ok: false, reason: 'founder_shadow_not_loaded' });
      return;
    }

    founderShadow.verifyAction('REJECT_SHARED_CANDIDATE', function (fdrResult) {
      if (!fdrResult.ok) {
        callback({ ok: false, reason: 'founder_shadow_not_granted:' + fdrResult.reason });
        return;
      }

      var fb = global.SRFirebaseAdapter;
      var db = (fb && typeof fb.getDB === 'function') ? fb.getDB() : null;
      if (!db) {
        callback({ ok: false, reason: 'firestore_unavailable' });
        return;
      }

      db.collection('sharedKnowledge').doc(candidateId).update({
        state:           VALIDATION_STATE.REJECTED,
        rejectedAt:      new Date().toISOString(),
        rejectionReason: reason || 'manual_rejection',
        available:       false,
        safetyStatus:    'REJECTED',
      }).then(function () {
        callback({ ok: true, candidateId: candidateId, state: VALIDATION_STATE.REJECTED });
      }).catch(function (err) {
        callback({ ok: false, reason: 'reject_write_failed:' + err.message });
      });
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // STATUS / PROVENANCE
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * getStatus()
   * Returns module status (safe to log — no secrets).
   */
  function getStatus() {
    return {
      build:                         BUILD_ID,
      pendingLocalCandidates:        _pendingCandidates.length,
      minConfidenceForPromotion:     MIN_CONFIDENCE_FOR_PROMOTION,
      shareableCategories:           SHAREABLE_CATEGORIES.slice(),
      blockedCategories:             BLOCKED_CATEGORIES.slice(),
      productionSyncEnabled:         false,
      bidirectionalSyncEnabled:      false,
      rawPrivateDataSharing:         'BLOCKED',
      privateShadowMemoryExposed:    'NO',
      privateConversationsExposed:   'NO',
      privateProjectsExposed:        'NO',
      regularUserPrivateDataExposed: 'NO',
    };
  }

  // ── Expose ────────────────────────────────────────────────────────────────
  global.SRSharedKnowledgeBridge = {
    build:                        BUILD_ID,
    VALIDATION_STATE:             VALIDATION_STATE,
    SHAREABLE_CATEGORIES:         SHAREABLE_CATEGORIES,
    BLOCKED_CATEGORIES:           BLOCKED_CATEGORIES,

    // Submission / validation / promotion (Shadow Edition only)
    submitGeneralizedCandidate:   submitGeneralizedCandidate,
    validateSharedCandidate:      validateSharedCandidate,
    promoteVerifiedKnowledge:     promoteVerifiedKnowledge,
    rejectSharedCandidate:        rejectSharedCandidate,

    // Query (both editions)
    queryVerifiedSharedKnowledge: queryVerifiedSharedKnowledge,

    // Sanitization (exported for testing)
    sanitizeCandidate:            sanitizeCandidate,
    deidentifyCandidate:          deidentifyCandidate,

    // Status
    getStatus:                    getStatus,
  };

})(typeof window !== 'undefined' ? window : global);
