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
├── language/                      ← Language Foundation (SR-LANG-FOUNDATION-1)
│   ├── sr-language.js             ← Main API facade (window.SRLanguage)
│   ├── tokenizer/
│   │   └── tokenizer.js           ← Tokenizer + normalization (window.SRTokenizer)
│   ├── morphology/
│   │   └── morphology.js          ← Lemmatization + POS (window.SRMorphology)
│   ├── relationships/
│   │   └── relationships.js       ← Language Relationship Graph (window.SRRelationships)
│   ├── phrases/
│   │   └── phrases.js             ← N-gram phrase patterns (window.SRPhrases)
│   ├── semantics/
│   │   └── semantics.js           ← Semantic analysis + similarity (window.SRSemantics)
│   ├── context/
│   │   └── context-resolver.js    ← Multi-turn reference resolution (window.SRContextResolver)
│   ├── learning/
│   │   └── language-learning.js   ← Private language learning (window.SRLanguageLearning)
│   └── data/
│       ├── vocab-index.json       ← 113,542 English vocabulary entries (7MB, lazy-loaded)
│       ├── lemma-index.json       ← Lemma → word forms index (~2MB)
│       ├── freq-index.json        ← Word frequency rank index
│       ├── build-report.json      ← Vocabulary build statistics
│       ├── patch-missing-words.js ← Essential word patcher (run once after build)
│       └── corpus/                ← Base word stems used during vocab build
│           ├── nouns.json
│           ├── verbs.json
│           ├── adjectives.json
│           ├── adverbs.json
│           └── other.json
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
│   ├── language.test.js           ← Language Foundation tests (106 tests)
│   └── master.test.js             ← Existing regression suite (101 tests)
├── DATA_SOURCES.md                ← Dataset provenance + license documentation
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

Language Foundation modules must be loaded BEFORE `shadow-reaper.js`.
The vocab index (~7MB) is loaded lazily and does NOT block startup.

```
── LANGUAGE FOUNDATION (load before core) ──────────────────────────────
1.  language/tokenizer/tokenizer.js      → window.SRTokenizer
2.  language/morphology/morphology.js    → window.SRMorphology  (auto-loads vocab)
3.  language/relationships/relationships.js → window.SRRelationships
4.  language/phrases/phrases.js          → window.SRPhrases
5.  language/semantics/semantics.js      → window.SRSemantics
6.  language/context/context-resolver.js → window.SRContextResolver
7.  language/learning/language-learning.js → window.SRLanguageLearning
8.  language/sr-language.js              → window.SRLanguage

── CORE (existing, unchanged) ──────────────────────────────────────────
9.  firebase/firebase-config.js          → SR_FIREBASE_CONFIG
10. config/environment.js                → window.SREnvironment
11. security/security-policy.js          → window.SRSecurity
12. security/web-research-guard.js       → window.SRResearchGuard
13. adapters/firebase-adapter.js         → window.SRFirebaseAdapter
14. adapters/cloudflare-adapter.js       → window.SRCloudflareAdapter
15. history/sr-conversation-history.js   → window.SRConversationHistory
16. memory/sr-personal-memory.js         → window.SRPersonalMemory
17. global-learning/sr-global-learning.js→ window.SRGlobalLearning
18. research/sr-web-research.js          → window.SRWebResearch
19. core/adaptive-brain.js               → window.SRAdaptiveBrain
20. core/understanding-engine.js         → window.SRUnderstanding
21. core/context-engine.js               → window.SRContext
22. core/conversation-engine.js          → window.SRConversation
23. core/response-engine.js              → window.SRResponse
24. core/persistence-bridge.js           → window.SRPersistence
25. core/local-model.js                  → window.SRLocalModel
26. knowledge/knowledge-engine.js        → window.SRKnowledge
27. translation/translation-engine.js    → window.SRTranslation
28. voice/voice-engine.js                → window.SRVoice
29. adapters/founder-controls.js         → window.SRFounderControls
30. shadow-reaper.js                     → window.ShadowReaper (calls SRLanguage.analyze)
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
