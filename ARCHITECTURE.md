# Shadow Reaper Standalone — Architecture

## Overview

Shadow Reaper Standalone is a completely independent product with its own
Firebase and Cloudflare infrastructure. It shares no configuration, credentials,
or data with Shadow Nexus Social.

---

## Directory Structure

```
shadow-reaper-v2/
│
├── core/                          ← Shadow Reaper brain (model-agnostic)
│   ├── adaptive-brain.js          ← Persistent concept learning
│   ├── context-engine.js          ← Session context tracking
│   ├── conversation-engine.js     ← Conversation flow
│   ├── local-model.js             ← Local AI model interface
│   ├── persistence-bridge.js      ← Wire layer: core ↔ storage adapters
│   ├── response-engine.js         ← Response composition
│   └── understanding-engine.js    ← Intent / entity / tone extraction
│
├── history/                       ← Private conversation history (standalone)
│   └── sr-conversation-history.js ← Uses SRFirebaseAdapter (NOT SNS globals)
│
├── memory/                        ← Private personal memory (standalone)
│   └── sr-personal-memory.js      ← Explicit-only, UID-isolated
│
├── knowledge/                     ← Static knowledge engine
│   ├── knowledge-engine.js
│   └── sr-knowledge-learner.js
│
├── global-learning/               ← Future opt-in global learning
│   └── sr-global-learning.js      ← SKELETON — disabled until consent + infra ready
│
├── research/                      ← Future web research engine
│   └── sr-web-research.js         ← SKELETON — untrusted data contract enforced
│
├── translation/                   ← Language translation
│   └── translation-engine.js
│
├── voice/                         ← Voice / TTS
│   └── voice-engine.js
│
├── security/                      ← Security policy enforcement
│   ├── security-policy.js         ← Input validation, sensitive data, injection guard
│   └── web-research-guard.js      ← Untrusted data containment for web results
│
├── adapters/                      ← Platform-specific integrations (ISOLATED)
│   ├── firebase-adapter.js        ← Standalone Firebase integration (NOT SNS)
│   ├── cloudflare-adapter.js      ← Cloudflare infrastructure adapter
│   └── founder-controls.js        ← Admin capability controls
│
├── config/                        ← Environment configuration
│   └── environment.js             ← Dev vs prod, feature flags
│
├── firebase/                      ← Firebase project configuration
│   ├── firebase-config.js         ← ⚠️ PLACEHOLDER — fill in credentials
│   ├── firestore.rules            ← Security rules (deploy before launch)
│   ├── firestore.indexes.json
│   ├── firebase.json
│   ├── firestore-architecture.md  ← Database design documentation
│   └── SETUP.md                   ← Step-by-step setup guide
│
├── cloudflare/                    ← Cloudflare infrastructure
│   ├── wrangler.toml              ← ⚠️ PLACEHOLDER — fill in account details
│   ├── worker/
│   │   └── index.js               ← Worker skeleton (NOT DEPLOYED)
│   └── SETUP.md                   ← Step-by-step setup guide
│
├── tests/                         ← Test suite
├── shadow-reaper.js               ← Main entry point (window.ShadowReaper)
├── ui.html                        ← Main UI
├── dev-test.html                  ← Development test harness
├── .env.example                   ← Environment variable template (safe to commit)
├── .gitignore                     ← Protects secrets from GitHub
└── ARCHITECTURE.md                ← This file
```

---

## Portability Design

Shadow Reaper's core intelligence modules (`core/`) are **platform-agnostic**.
They do not reference Firebase, Cloudflare, or any SNS globals.

Platform integrations are isolated in `adapters/`:
- `firebase-adapter.js` — the only file that may reference Firebase SDK
- `cloudflare-adapter.js` — the only file that may reference Cloudflare endpoints

To move Shadow Reaper to a different storage backend, only `adapters/` needs to change.

---

## Firebase Architecture

| Collection | Access |
|---|---|
| `users/{uid}/shadowReaperConversations` | Owner UID only |
| `users/{uid}/shadowReaperMemory` | Owner UID only |
| `users/{uid}/shadowReaperLearnedContext` | Owner UID only |
| `users/{uid}/shadowReaperPreferences` | Owner UID only |
| `sharedKnowledge` | Read: authenticated users; Write: Founders only |
| `globalLearning` | Read: authenticated users; Write: Founders only (via server) |
| `shadowReaperConfig` | Read: authenticated users; Write: Founders only |
| `webResearchCache` | Read: authenticated users; Write: Founders only (future) |

---

## Script Load Order

```
1.  firebase/firebase-config.js          → SR_FIREBASE_CONFIG
2.  config/environment.js                → window.SREnvironment
3.  security/security-policy.js          → window.SRSecurity
4.  security/web-research-guard.js       → window.SRResearchGuard
5.  adapters/firebase-adapter.js         → window.SRFirebaseAdapter
6.  adapters/cloudflare-adapter.js       → window.SRCloudflareAdapter
7.  history/sr-conversation-history.js   → window.SRConversationHistory
8.  memory/sr-personal-memory.js         → window.SRPersonalMemory
9.  global-learning/sr-global-learning.js→ window.SRGlobalLearning
10. research/sr-web-research.js          → window.SRWebResearch
11. core/adaptive-brain.js               → window.SRAdaptiveBrain
12. core/understanding-engine.js         → window.SRUnderstanding
13. core/context-engine.js               → window.SRContext
14. core/conversation-engine.js          → window.SRConversation
15. core/response-engine.js              → window.SRResponse
16. core/persistence-bridge.js           → window.SRPersistence
17. core/local-model.js                  → window.SRLocalModel
18. knowledge/knowledge-engine.js        → window.SRKnowledge
19. translation/translation-engine.js    → window.SRTranslation
20. voice/voice-engine.js                → window.SRVoice
21. adapters/founder-controls.js         → window.SRFounderControls
22. shadow-reaper.js                     → window.ShadowReaper
```

---

## SNS Isolation Confirmation

This project does **not** reference:
- `_snxDbCompat`
- `_snxAuth`
- `_snxCurrentUser`
- `SNXShadowConvHistory`
- `SNXShadowMemory`
- `SNXShadowAdaptive`
- Firebase project `horr-a08f4`
- Any SNS Cloudflare Worker or KV namespace

The existing `core/persistence-bridge.js` still references SNS module names
(`SNXShadowConvHistory`, etc.) for backward compatibility with the SNS product.
The new standalone persistence path uses `SRConversationHistory`, `SRPersonalMemory`,
and `SRAdaptiveBrain` via `SRFirebaseAdapter` only.
