# Founder Enrollment Guide — Shadow Reaper Standalone

## ⏳ FOUNDER ENROLLMENT PENDING

The Founder account for Shadow Reaper Standalone has not yet been enrolled.

**Target Founder email:** `christijerina46@gmail.com`

---

## Why enrollment is pending

The Firebase project credentials are not yet configured in `firebase/firebase-config.js`.
A real Firebase UID cannot be obtained until the project exists and the account
has been created and authenticated.

> ⚠️ **No credentials have been invented, faked, or guessed.**
> Enrollment waits for the real authenticated account.

---

## Security Architecture

```
Founder email
  → verified Firebase Authentication (real sign-in)
  → Firebase UID (real, from Firebase — never invented)
  → Admin SDK sets custom claim { role: "founder" } (server-side only)
  → Firestore Security Rules enforce: request.auth.token.role == "founder"
  → SRFounderSecurity.verifyFounderAccess() checks claim from ID token
  → Founder Control Center
```

**The email address identifies the target account — it is NOT the security boundary.**

The real security boundary is:
- Authenticated Firebase UID
- Server-side custom claim `role: "founder"` (set by Admin SDK only)
- Firestore rules that enforce the claim on every privileged operation

---

## Step-by-Step Enrollment

### Step 1 — Configure Firebase Project

Complete `firebase/SETUP.md`:
1. Create a new Firebase project at https://console.firebase.google.com/
2. Enable Email/Password Authentication
3. Create Firestore database in **production mode**
4. Register a web app and copy the config object
5. Fill in `firebase/firebase-config.js` with real values
6. Deploy Firestore Security Rules: `firebase deploy --only firestore:rules`

---

### Step 2 — Create the Founder Auth Account

In the Firebase console:
1. Go to **Authentication → Users → Add user**
2. Email: `christijerina46@gmail.com`
3. Set a strong password
4. Note the **UID** shown in the console — you will need it in Step 3

---

### Step 3 — Set the Founder Custom Claim (Admin SDK only)

**⚠️ This MUST be done server-side. Never from browser JavaScript.**

**Option A — Cloudflare Worker (recommended)**

Use the provided script at `cloudflare/worker/set-founder-claim.js`.
Deploy it once to set the claim, then remove or disable it.

The script uses the Firebase Admin SDK with a service account key.

```bash
# Set the claim for the real Founder UID
node cloudflare/worker/set-founder-claim.js --uid <REAL_UID_FROM_FIREBASE>
```

**Option B — Firebase Cloud Function**

Create a one-time Cloud Function:
```js
const admin = require('firebase-admin');
admin.initializeApp();

// Run once, then delete/disable the function
admin.auth().setCustomUserClaims('<REAL_UID_FROM_FIREBASE>', { role: 'founder' });
```

**Option C — Firebase Admin SDK locally (for initial setup)**

```js
const admin = require('firebase-admin');
const serviceAccount = require('./serviceAccountKey.json'); // DO NOT COMMIT

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: '<your-project-id>',
});

admin.auth().setCustomUserClaims('<REAL_UID_FROM_FIREBASE>', { role: 'founder' })
  .then(() => console.log('Founder claim set successfully'))
  .catch(console.error);
```

> 🔐 Never commit `serviceAccountKey.json` to GitHub — it is already in `.gitignore`.

---

### Step 4 — Verify Enrollment

Sign in to Shadow Reaper Standalone as the Founder account, then call:

```js
SRFounderEnrollment.verifyEnrollmentStatus(function(result) {
  console.log(result.status);    // Should be: FOUNDER_ENROLLED
  console.log(result.uid);       // Real Firebase UID
  console.log(result.hasFounderClaim); // true
});
```

Expected result:
```json
{
  "status": "FOUNDER_ENROLLED",
  "uid": "<real-uid>",
  "hasFounderClaim": true,
  "message": "Founder account enrolled.",
  "nextStep": "NONE"
}
```

---

### Step 5 — Enroll Trusted Device

From the Founder's trusted browser/device, while authenticated:

```js
SRFounderSecurity.enrollDevice(function(result) {
  console.log(result); // { ok: true, deviceId: "device_..." }
});
```

---

## Security Reminders

- Hidden Founder UI is NOT security — any authenticated user who discovers
  a Founder route/API still receives `ACCESS DENIED` from Firestore rules.
- Founder status does NOT grant access to any other user's:
  - Conversations, History, Personal Memory, Adaptive Learning,
    Projects, Device Commands, or private preferences.
- Founder administration and user-private AI data are separate security boundaries.
- Enable MFA on the Founder Firebase account as soon as the project is live.

---

## Current Status

| Step | Status |
|------|--------|
| Firebase project created | ⏳ Pending |
| Founder Auth account created | ⏳ Pending |
| Founder custom claim set (Admin SDK) | ⏳ Pending |
| Enrollment verified | ⏳ Pending |
| Trusted device enrolled | ⏳ Pending |
| MFA enabled | ⏳ Pending |
