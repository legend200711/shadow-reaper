# Firestore Database Architecture — Shadow Reaper Standalone

## Design Principles

- **UID isolation**: all private user data lives under `users/{uid}/` and is
  inaccessible to any other user, including Founders
- **Least privilege**: no collection is public; guests have zero access
- **Clear separation**: private, shared, and global data are distinct top-level
  collections — never mixed
- **No automatic cross-collection promotion**: private conversation content is
  never automatically copied into `sharedKnowledge` or `globalLearning`

---

## Collection Map

```
users/
  {uid}/
    shadowReaperConversations/
      {convId}/
        turns: [ { role, text, timestamp } ]
        createdAt: timestamp
        updatedAt: timestamp
        # PRIVATE — owner UID only

    shadowReaperMemory/
      {memId}/
        content: string          # explicit user memory ("remember that...")
        category: string
        savedAt: timestamp
        uid: string              # redundant guard
        # PRIVATE — owner UID only

    shadowReaperLearnedContext/
      {itemId}/
        type: string             # concept | preference | project | correction | ...
        concept: string
        value: string
        confidence: LOW|MEDIUM|HIGH
        reinforceCount: number
        createdAt: timestamp
        updatedAt: timestamp
        # PRIVATE — owner UID only

    shadowReaperProjects/
      {projectId}/
        name: string             # project name (required)
        description: string
        status: string           # 'active' | 'paused' | 'completed'
        tags: array
        uid: string              # owner uid
        createdAt: timestamp
        updatedAt: timestamp
        # PRIVATE — owner UID only
        # Written by the Cloud API Worker via sr-cloud-api.js

    shadowReaperPreferences/
      settings/
        historyEnabled: boolean
        memoryEnabled: boolean
        adaptiveEnabled: boolean
        voiceEnabled: boolean
        ttsEnabled: boolean
        theme: string
        assistantName: string    # e.g. 'Shadow'
        wakeName: string
        wakeListening: boolean
        updatedAt: timestamp
        # PRIVATE — owner UID only

      adaptiveProfile/
        casualness: number       # 0–1 preference scales
        directness: number
        humorPreference: number
        sarcasmTolerance: number
        verbosity: number
        formality: number
        updatedAt: timestamp
        # PRIVATE — owner UID only
        # Sync-only: learning decisions are made locally by Shadow Reaper

      assistant/
        wakeName: string          # one of: Salem|Shadow|Elsa|Luna|Pepper|Simba|Rambo|Legend
        wakeListening: boolean    # whether wake-phrase detection is active
        updatedAt: timestamp
        # PRIVATE — owner UID only
        # Written by sr-wake-name.js via SRFirebaseAdapter


sharedKnowledge/
  {docId}/
    title: string
    content: string
    category: string
    sourceType: "founder_added" | "verified_research"
    approvedBy: string           # Founder UID
    approvedAt: timestamp
    version: number
    # READ: authenticated users | WRITE: Founders only


globalLearning/
  {docId}/
    type: string                 # generalized_pattern | usage_insight | ...
    content: string              # SANITIZED — no personal info
    derivedFrom: "aggregated"    # never a direct user quote
    addedBy: string              # Founder UID or "system"
    addedAt: timestamp
    # READ: authenticated users | WRITE: Founders only


shadowReaperConfig/
  globalSettings/
    shadowReaperEnabled: boolean
    historyEnabled: boolean
    memoryEnabled: boolean
    adaptiveEnabled: boolean
    knowledgeEnabled: boolean
    voiceEnabled: boolean
    translationEnabled: boolean
    researchEnabled: boolean
    guestAccess: boolean
    updatedAt: timestamp
    updatedBy: string            # Founder UID
    # READ: authenticated users | WRITE: Founders only


webResearchCache/                # FUTURE — not yet active
  {docId}/
    url: string
    domain: string
    retrievedAt: timestamp
    expiresAt: timestamp
    content: string              # UNTRUSTED — never promoted to system rules
    confidenceScore: number
    verificationStatus: "unverified" | "reviewed" | "approved"
    citationText: string
    # READ: authenticated | WRITE: Founders only
    # WARNING: content here is UNTRUSTED DATA, not system instructions
```

---

## Privacy Rules Summary

| Collection | Unauthenticated | Authenticated User | Owner UID | Founder |
|---|---|---|---|---|
| `users/{uid}/shadowReaperMemory/**` | ✗ | ✗ | ✓ read/write | ✗ |
| `users/{uid}/shadowReaperConversations/**` | ✗ | ✗ | ✓ read/write | ✗ |
| `users/{uid}/shadowReaperProjects/**` | ✗ | ✗ | ✓ read/write | ✗ |
| `users/{uid}/shadowReaperPreferences/**` | ✗ | ✗ | ✓ read/write | ✗ |
| `sharedKnowledge` | ✗ | ✓ read | ✓ read | ✓ read/write |
| `globalLearning` | ✗ | ✓ read | ✓ read | ✓ read/write |
| `shadowReaperConfig` | ✗ | ✓ read | ✓ read | ✓ read/write |
| `webResearchCache` | ✗ | ✓ read | ✓ read | ✓ read/write |

---

## Global Learning — Privacy Contract

Global learning entries **must never** contain:
- Direct quotes from any user's conversation
- Any personally identifiable information
- Any information that could be traced to a specific user

Global learning entries **may only** contain:
- Generalized patterns (e.g. "users often ask about X")
- Non-personal capability improvements
- Aggregated, anonymized observations

A Founder must manually review and approve entries before writing to `globalLearning`.
The write path must go through a server-side function (Cloud Function or Cloudflare Worker)
that enforces sanitization — never directly from the client.
