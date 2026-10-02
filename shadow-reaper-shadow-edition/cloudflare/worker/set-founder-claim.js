/**
 * shadow-reaper-standalone/cloudflare/worker/set-founder-claim.js
 *
 * Shadow Reaper Standalone — Founder Custom Claim Enrollment Script
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * PURPOSE:
 *   One-time Admin SDK script to set the Founder custom claim on a
 *   specific Firebase Auth user account.
 *
 *   Sets: { role: "founder" } on the Firebase ID token for the given UID.
 *
 * SECURITY:
 *   - Requires Firebase Admin SDK service account credentials.
 *   - NEVER run from browser JavaScript.
 *   - NEVER commit serviceAccountKey.json to GitHub.
 *   - Run once to enroll the Founder, then revoke/rotate the service account key.
 *
 * USAGE:
 *   node set-founder-claim.js --uid <REAL_UID_FROM_FIREBASE>
 *
 *   The UID must be the REAL authenticated Firebase UID for the account:
 *     christijerina46@gmail.com
 *
 *   Obtain the real UID from:
 *     - Firebase console → Authentication → Users → click the account row
 *     - OR: sign in and call firebase.auth().currentUser.uid in the browser console
 *
 * PREREQUISITES:
 *   npm install firebase-admin
 *   Download serviceAccountKey.json from:
 *     Firebase console → Project Settings → Service Accounts → Generate new private key
 *   Place serviceAccountKey.json in this directory (it is .gitignored).
 *
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠️  DO NOT INVENT A UID.
 * ⚠️  DO NOT RUN THIS WITH A PLACEHOLDER UID.
 * ⚠️  DO NOT COMMIT serviceAccountKey.json.
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ── Parse --uid argument ────────────────────────────────────────────────────
const args = process.argv.slice(2);
const uidIndex = args.indexOf('--uid');
const FOUNDER_UID = uidIndex !== -1 ? args[uidIndex + 1] : null;

if (!FOUNDER_UID || FOUNDER_UID.trim() === '') {
  console.error('\n[set-founder-claim] ERROR: No UID provided.\n');
  console.error('Usage:  node set-founder-claim.js --uid <REAL_UID_FROM_FIREBASE>\n');
  console.error('Obtain the real UID from the Firebase console:\n' +
                '  Authentication → Users → click the christijerina46@gmail.com row\n');
  process.exit(1);
}

// Sanity guard: reject obvious placeholder strings
const PLACEHOLDER_PATTERNS = [
  'placeholder', 'example', 'fake', 'test-uid', 'YOUR_UID', 'UID_HERE', '<', '>',
];
if (PLACEHOLDER_PATTERNS.some(function (p) { return FOUNDER_UID.includes(p); })) {
  console.error('\n[set-founder-claim] ERROR: UID looks like a placeholder: ' + FOUNDER_UID);
  console.error('Provide the REAL Firebase UID for christijerina46@gmail.com\n');
  process.exit(1);
}

// ── Load service account ────────────────────────────────────────────────────
const SERVICE_ACCOUNT_PATH = path.join(__dirname, 'serviceAccountKey.json');

if (!fs.existsSync(SERVICE_ACCOUNT_PATH)) {
  console.error('\n[set-founder-claim] ERROR: serviceAccountKey.json not found at:\n  ' +
                SERVICE_ACCOUNT_PATH);
  console.error('\nTo obtain it:');
  console.error('  Firebase console → Project Settings → Service Accounts → Generate new private key\n');
  process.exit(1);
}

let serviceAccount;
try {
  serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));
} catch (e) {
  console.error('\n[set-founder-claim] ERROR: Could not parse serviceAccountKey.json:', e.message, '\n');
  process.exit(1);
}

// ── Initialize Firebase Admin ───────────────────────────────────────────────
let admin;
try {
  admin = require('firebase-admin');
} catch (e) {
  console.error('\n[set-founder-claim] ERROR: firebase-admin not installed.');
  console.error('Run: npm install firebase-admin\n');
  process.exit(1);
}

const projectId = serviceAccount.project_id;
if (!projectId) {
  console.error('\n[set-founder-claim] ERROR: serviceAccountKey.json missing project_id\n');
  process.exit(1);
}

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    projectId:  projectId,
  });
}

// ── Verify the account exists and email matches expectation ─────────────────
const EXPECTED_EMAIL = 'christijerina46@gmail.com';

console.log('\n[set-founder-claim] Looking up UID:', FOUNDER_UID);

admin.auth().getUser(FOUNDER_UID).then(function (userRecord) {

  console.log('[set-founder-claim] Found account:');
  console.log('  UID:   ', userRecord.uid);
  console.log('  Email: ', userRecord.email || '(no email)');

  if (userRecord.email && userRecord.email.toLowerCase() !== EXPECTED_EMAIL.toLowerCase()) {
    console.error('\n[set-founder-claim] ⚠️  WARNING: The UID provided belongs to:');
    console.error('  ' + userRecord.email);
    console.error('  Expected: ' + EXPECTED_EMAIL);
    console.error('  Aborting — verify you have the correct UID.\n');
    process.exit(1);
  }

  // ── Set the custom claim ─────────────────────────────────────────────────
  return admin.auth().setCustomUserClaims(FOUNDER_UID, { role: 'founder' });

}).then(function () {

  console.log('\n[set-founder-claim] ✅  Founder custom claim set successfully.');
  console.log('  UID:   ', FOUNDER_UID);
  console.log('  Claim: { role: "founder" }');
  console.log('\n  Next steps:');
  console.log('  1. Sign in as christijerina46@gmail.com in Shadow Reaper Standalone.');
  console.log('  2. Call SRFounderEnrollment.verifyEnrollmentStatus() to confirm.');
  console.log('  3. Call SRFounderSecurity.enrollDevice() from the trusted device.');
  console.log('  4. Revoke or rotate the service account key used here.\n');
  process.exit(0);

}).catch(function (error) {
  console.error('\n[set-founder-claim] ERROR:', error.message);
  if (error.code === 'auth/user-not-found') {
    console.error('  The UID does not exist in this Firebase project.');
    console.error('  Create the account first in Firebase console → Authentication → Add user');
  }
  console.error('');
  process.exit(1);
});
