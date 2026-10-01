# Firebase Setup — Shadow Reaper Standalone

## Status: ✅ CONFIGURED — Project: ffr3r3223

Firebase credentials are live in `firebase/firebase-config.js`.

---

## Step 1 — Create a new Firebase project

1. Go to https://console.firebase.google.com/
2. Click **Add project**
3. Name it something like `shadow-reaper-standalone` (or your preferred name)
4. **Do NOT reuse `horr-a08f4` (Shadow Nexus Social)**
5. Enable Google Analytics if desired (optional)

---

## Step 2 — Enable services

In the new project console, enable:

- **Authentication** → Sign-in method → Email/Password (and any others you want)
- **Firestore Database** → Create database → Start in **production mode**
- **App Check** (when ready for production) → register your web app domain

---

## Step 3 — Register a Web App

1. Project Settings → Your apps → Add app → Web
2. Give it a nickname: `Shadow Reaper Standalone`
3. Copy the **firebaseConfig object** — you'll paste its values below

---

## Step 4 — Values I need from you

Paste the following values from your new Firebase project into `firebase/firebase-config.js`:

| Key | Where to find it |
|-----|-----------------|
| `apiKey` | Project Settings → Your apps → SDK setup |
| `authDomain` | Same location (format: `<project-id>.firebaseapp.com`) |
| `projectId` | Project Settings → General |
| `storageBucket` | Same location (format: `<project-id>.appspot.com`) |
| `messagingSenderId` | Same location |
| `appId` | Same location |
| `measurementId` | Same location (only if Analytics enabled) |

---

## Step 5 — Deploy Firestore Security Rules

After credentials are set, deploy the rules from `firebase/firestore.rules`:

```bash
firebase use --add          # add the new project alias
firebase deploy --only firestore:rules
```

---

## ⚠️ Security Reminder

- **Never commit** real credentials to GitHub
- Use environment variables or a `.env` file (already in `.gitignore`)
- In production, use Firebase App Check to prevent abuse
