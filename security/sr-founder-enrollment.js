/**
 * shadow-reaper-standalone/security/sr-founder-enrollment.js
 * Shadow Reaper Standalone — Founder Enrollment Architecture
 *
 * Build: SR-STANDALONE-FOUNDER-ENROLLMENT-1
 *
 * Exposes: window.SRFounderEnrollment
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * FOUNDER EMAIL:  christijerina46@gmail.com
 *
 * ENROLLMENT STATUS:  ⏳  FOUNDER ENROLLMENT PENDING
 *
 * The Firebase project credentials are not yet configured.
 * A real authenticated Firebase UID cannot be obtained until:
 *   1. The Firebase project is created and credentials filled in
 *      (firebase/firebase-config.js + firebase/SETUP.md)
 *   2. The Founder account is created via Firebase Authentication
 *   3. The Admin SDK script (cloudflare/worker/set-founder-claim.js or
 *      equivalent Cloud Function) is run with the real authenticated UID
 *      to set the custom claim: { role: "founder" }
 *   4. The claim is verified by calling verifyEnrollmentStatus()
 *
 * See: FOUNDER-ENROLLMENT-GUIDE.md for the step-by-step checklist.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * SECURITY CONTRACT:
 *   - The email address identifies which account to enroll — it is NOT the
 *     security boundary.
 *   - Actual Founder authorization is based on the authenticated Firebase UID
 *     plus the server-side custom claim { role: "founder" }.
 *   - The claim is set ONLY by the Admin SDK (server-side) — never by client JS.
 *   - Firestore Security Rules enforce: request.auth.token.role == 'founder'
 *     for every privileged write — the server is the authoritative gatekeeper.
 *   - Client-side checks in this module are defense-in-depth + UX guidance only.
 *
 * ⚠️  DO NOT add client-side logic such as:
 *     if (email === "christijerina46@gmail.com") { allowFounderAccess(); }
 *
 * ⚠️  DO NOT invent a UID. DO NOT create fake credentials.
 *     The real UID comes only from a live authenticated Firebase session.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-STANDALONE-FOUNDER-ENROLLMENT-1';

  // ─── Enrollment state ─────────────────────────────────────────────────────
  var ENROLLMENT_STATUS = {
    PENDING:   'FOUNDER_ENROLLMENT_PENDING',   // Firebase project not configured yet
    ENROLLED:  'FOUNDER_ENROLLED',             // Custom claim confirmed server-side
    UNVERIFIED:'FOUNDER_CLAIM_UNVERIFIED',     // Auth exists but claim not yet set
    BLOCKED:   'FOUNDER_ENROLLMENT_BLOCKED',   // Security anomaly detected
  };

  // ─── Target account (for enrollment UI guidance only — NOT authorization) ─
  // This constant is used ONLY to:
  //   (a) display enrollment status in the admin setup UI
  //   (b) remind the administrator which account needs the claim set
  // It grants ZERO access on its own. Authorization requires the live
  // authenticated UID + the server-side custom claim.
  var FOUNDER_TARGET_EMAIL = 'christijerina46@gmail.com';

  // ─── Helpers ──────────────────────────────────────────────────────────────
  function _fb()   { return global.SRFirebaseAdapter || null; }
  function _uid()  { var fb = _fb(); return fb ? fb.getUID() : null; }

  function _isFirebaseConfigured() {
    return typeof global.SR_FIREBASE_CONFIGURED !== 'undefined' && global.SR_FIREBASE_CONFIGURED;
  }

  // ─── Check enrollment status (async, server-based) ────────────────────────
  /**
   * verifyEnrollmentStatus(callback)
   *
   * Checks whether the currently authenticated user holds the server-side
   * Founder custom claim.  Does NOT check email — checks the Firebase ID
   * token claim which can only be set via the Admin SDK.
   *
   * callback(result):
   *   result.status:      one of ENROLLMENT_STATUS
   *   result.uid:         authenticated UID (if available)
   *   result.hasFounderClaim: boolean
   *   result.message:     human-readable description
   *   result.nextStep:    what to do next (for setup UI)
   */
  function verifyEnrollmentStatus(callback) {
    callback = callback || function () {};

    // Step 1: Firebase project configured?
    if (!_isFirebaseConfigured()) {
      callback({
        status:          ENROLLMENT_STATUS.PENDING,
        uid:             null,
        hasFounderClaim: false,
        message:         'Firebase credentials not configured. ' +
                         'Complete firebase/SETUP.md before enrolling the Founder account.',
        nextStep:        'CONFIGURE_FIREBASE_PROJECT',
      });
      return;
    }

    // Step 2: Firebase adapter available?
    var fb = _fb();
    if (!fb || !fb.isAuthenticated()) {
      callback({
        status:          ENROLLMENT_STATUS.PENDING,
        uid:             null,
        hasFounderClaim: false,
        message:         'No authenticated session. ' +
                         'The Founder must sign in with ' + FOUNDER_TARGET_EMAIL + ' first.',
        nextStep:        'SIGN_IN_AS_FOUNDER',
      });
      return;
    }

    // Step 3: Get live Firebase ID token and inspect claim
    var user = fb.getCurrentUser ? fb.getCurrentUser() : null;
    if (!user) {
      callback({
        status:          ENROLLMENT_STATUS.PENDING,
        uid:             null,
        hasFounderClaim: false,
        message:         'Auth session exists but user object unavailable.',
        nextStep:        'REFRESH_AUTH_SESSION',
      });
      return;
    }

    if (typeof user.getIdTokenResult === 'function') {
      user.getIdTokenResult(/* forceRefresh */ true).then(function (tokenResult) {
        var hasFounderClaim = !!(
          tokenResult.claims && tokenResult.claims.role === 'founder'
        );

        if (hasFounderClaim) {
          callback({
            status:          ENROLLMENT_STATUS.ENROLLED,
            uid:             user.uid,
            hasFounderClaim: true,
            message:         'Founder account enrolled. UID: ' + user.uid,
            nextStep:        'NONE',
          });
        } else {
          callback({
            status:          ENROLLMENT_STATUS.UNVERIFIED,
            uid:             user.uid,
            hasFounderClaim: false,
            message:         'Authenticated as ' + (user.email || '(unknown email)') +
                             ' (UID: ' + user.uid + ') but Founder custom claim is NOT set. ' +
                             'Run the Admin SDK enrollment script with this UID to grant the role.',
            nextStep:        'RUN_ADMIN_SDK_CLAIM_SCRIPT',
            enrollmentGuide: 'See FOUNDER-ENROLLMENT-GUIDE.md → Step 3',
          });
        }
      }).catch(function (err) {
        callback({
          status:          ENROLLMENT_STATUS.PENDING,
          uid:             user.uid,
          hasFounderClaim: false,
          message:         'ID token check failed: ' + (err.message || 'unknown error'),
          nextStep:        'RETRY_OR_CHECK_NETWORK',
        });
      });

    } else {
      // Fallback: no getIdTokenResult — cannot verify claim asynchronously
      callback({
        status:          ENROLLMENT_STATUS.UNVERIFIED,
        uid:             user.uid,
        hasFounderClaim: false,
        message:         'Cannot verify Founder claim without getIdTokenResult. ' +
                         'Ensure the full Firebase Auth SDK is loaded.',
        nextStep:        'LOAD_FULL_FIREBASE_SDK',
      });
    }
  }

  // ─── Get enrollment guidance for setup UI ─────────────────────────────────
  /**
   * getEnrollmentChecklist()
   * Returns a structured checklist for the administrator to follow when
   * enrolling the Founder account for the first time.
   * This is informational only — it grants no access.
   */
  function getEnrollmentChecklist() {
    return {
      founderEmail: FOUNDER_TARGET_EMAIL,
      steps: [
        {
          step: 1,
          id:   'CREATE_FIREBASE_PROJECT',
          title:'Create Firebase Project',
          detail:'Follow firebase/SETUP.md to create a dedicated Shadow Reaper Standalone Firebase project.',
          done: _isFirebaseConfigured(),
        },
        {
          step: 2,
          id:   'CREATE_FOUNDER_ACCOUNT',
          title:'Create Founder Firebase Auth Account',
          detail:'In the Firebase console → Authentication → Add user: ' + FOUNDER_TARGET_EMAIL,
          done: null, // Cannot determine without live Admin SDK check
        },
        {
          step: 3,
          id:   'SET_FOUNDER_CUSTOM_CLAIM',
          title:'Set Founder Custom Claim via Admin SDK',
          detail:'Run the Admin SDK script: cloudflare/worker/set-founder-claim.js ' +
                 'OR Firebase Cloud Function. ' +
                 'Pass the real authenticated UID. ' +
                 'This sets: { role: "founder" } on the Firebase ID token. ' +
                 'NEVER invent or guess the UID — obtain it from the Firebase console ' +
                 'or from the authenticated session.',
          done: null,
          warning:'DO NOT set this claim from browser JavaScript. ' +
                  'Admin SDK (service account) only.',
        },
        {
          step: 4,
          id:   'VERIFY_CLAIM',
          title:'Verify Enrollment',
          detail:'Call SRFounderEnrollment.verifyEnrollmentStatus() while signed in ' +
                 'as the Founder account. Status must return FOUNDER_ENROLLED.',
          done: null,
        },
        {
          step: 5,
          id:   'ENROLL_TRUSTED_DEVICE',
          title:'Enroll Trusted Device',
          detail:'After claim is verified, call SRFounderSecurity.enrollDevice() ' +
                 'from the Founder\'s trusted device.',
          done: null,
        },
      ],
    };
  }

  // ─── Expose ───────────────────────────────────────────────────────────────
  global.SRFounderEnrollment = {
    build:                  BUILD_ID,
    ENROLLMENT_STATUS:      ENROLLMENT_STATUS,
    FOUNDER_TARGET_EMAIL:   FOUNDER_TARGET_EMAIL,
    verifyEnrollmentStatus: verifyEnrollmentStatus,
    getEnrollmentChecklist: getEnrollmentChecklist,
  };

})(typeof window !== 'undefined' ? window : global);
