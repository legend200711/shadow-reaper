# Shadow Reaper — Shadow Edition
## Cloud Resource Setup Guide (Manual — DO NOT DEPLOY FROM THIS FILE)

---

## STATUS: NOT DEPLOYED — MANUAL SETUP REQUIRED

Shadow Edition requires its **own, separate** cloud resources.
It must NEVER share Firebase or Cloudflare resources with:
- Regular Shadow Reaper (ffr3r3223)
- Shadow Nexus Social

---

## PRODUCT IDENTITY

| Property         | Value                                       |
|-----------------|---------------------------------------------|
| Product Name     | Shadow Reaper — Shadow Edition              |
| Internal ID      | shadow-reaper-shadow-edition                |
| PWA Scope        | /shadow-reaper-edition/                     |
| App ID (Android) | com.shadowreaper.shadowedition              |
| Cache Namespace  | sre-shell-v1                               |
| Local Storage NS | sre* prefix (sreAssistantPrefs, sreFounder…)|

---

## FIREBASE PROJECT (NOT YET CREATED)

**Action required: Create a NEW Firebase project — do not reuse ffr3r3223.**

Steps:
1. Go to https://console.firebase.google.com
2. Create project: `shadow-reaper-shadow-edition`  (or preferred name)
3. Enable Firebase Authentication (Email/Password + Google as desired)
4. Enable Firestore — start in **locked mode**
5. Update `firebase/firebase-config.js` with the new project credentials
6. Update `.firebaserc` with the new project ID
7. Deploy Firestore security rules from `firebase/firestore.rules`

**Founder enrollment (PENDING):**
After Firebase project is created:
1. Sign in with founder account (christijerina46@gmail.com) in the Shadow Edition app
2. Get the authenticated UID from Firebase console
3. Run `cloudflare/worker/set-founder-claim.js` using the Admin SDK with the real UID
4. Verify: `SRFounderShadow.resolveCapability()` returns `FOUNDER_SHADOW_GRANTED`

See `FOUNDER-ENROLLMENT-GUIDE.md` for complete step-by-step instructions.

---

## FIRESTORE COLLECTIONS (Shadow Edition uses distinct namespaces)

| Collection                              | Purpose                          |
|----------------------------------------|----------------------------------|
| users/{uid}/shadowReaperEditionConversations | Conversation history       |
| users/{uid}/shadowReaperEditionMemory        | Personal memory            |
| users/{uid}/shadowReaperEditionLearnedContext| Adaptive learning          |
| users/{uid}/shadowReaperEditionPreferences   | User preferences           |
| shadowEditionSharedKnowledge                 | Shared generalized knowledge |
| shadowEditionGlobalLearning                  | Global learning candidates |
| shadowReaperEditionConfig/globalSettings     | Founder global settings    |

---

## CLOUDFLARE WORKERS (NOT YET DEPLOYED)

**Action required: Create a NEW Cloudflare Worker — do not share with Regular Shadow Reaper.**

Steps:
1. Update `cloudflare/wrangler.toml` with Shadow Edition worker name
2. Set Cloudflare secrets via `wrangler secret put`
3. Deploy: `wrangler deploy` (NOT during this task — authorized deploy only)

---

## ENVIRONMENT CONFIGURATION

Copy `.env.example` to `.env.local` and populate with Shadow Edition Firebase credentials:
- FIREBASE_API_KEY
- FIREBASE_AUTH_DOMAIN
- FIREBASE_PROJECT_ID
- FIREBASE_STORAGE_BUCKET
- FIREBASE_MESSAGING_SENDER_ID
- FIREBASE_APP_ID

DO NOT use Regular Shadow Reaper or Shadow Nexus Social credentials here.
DO NOT commit `.env.local` to version control.

---

## DATA ISOLATION GUARANTEE

Shadow Edition data NEVER flows to Regular Shadow Reaper automatically.
The controlled Shared Knowledge bridge (sr-shared-knowledge-bridge.js) is the
ONLY permitted channel, and it requires:
- Explicit promotion by Founder
- Privacy sanitization / de-identification pass
- Validation and confidence check
- No raw conversations, memories, names, or credentials

---

## OWNER-ONLY ACCESS

Shadow Edition is PRIVATE — owner only.

The authorization chain is:
  Firebase Authentication (Email login)
       ↓
  Authenticated UID (server-verified)
       ↓
  Firebase ID Token with custom claim: role === "founder"
  (set by Admin SDK only — NEVER by client code)
       ↓
  SRFounderShadow.resolveCapability() → FOUNDER_SHADOW_GRANTED
       ↓
  Shadow Edition personal-assistant features enabled

WITHOUT the founder claim, the app FAILS CLOSED — no Shadow Edition features.

---

## WHAT NOT TO DO

- DO NOT share this Firebase project with Shadow Nexus Social
- DO NOT share this Firebase project with Regular Shadow Reaper  
- DO NOT copy production secrets from either existing project
- DO NOT deploy Cloudflare Worker without authorization
- DO NOT push to GitHub without authorization
- DO NOT set localStorage "isFounder=true" — this is NOT the auth gate
