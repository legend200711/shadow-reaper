# Shadow Reaper Cloud API

**Build:** SR-CLOUD-API-1  
**Status:** READY FOR DEPLOYMENT (secrets configuration required)

---

## Architecture

```
Shadow Reaper (local intelligence — always available)
    ↓  (optional, when online)
sr-cloud-api.js  (browser client + offline queue)
    ↓
Cloudflare Worker: cloud-api.js
    ↓
Firebase / Firestore  (users/{uid}/...)
```

**Shadow Reaper is LOCAL-FIRST.** The cloud API handles data synchronization only.
Shadow's intelligence, conversation engine, local memory, and personality all work without
the cloud API. If the API is offline, Shadow continues working normally.

---

## Files

### Worker (Cloudflare)
| File | Purpose |
|------|---------|
| `cloudflare/worker/cloud-api.js` | Main Worker entry point (CORS, routing) |
| `cloudflare/worker/cloud-router.js` | Request dispatch, auth, rate limiting |
| `cloudflare/worker/lib/firebase-admin.js` | Firebase Admin REST client (no Node SDK) |
| `cloudflare/worker/lib/cloud-auth.js` | Firebase ID token verification (RS256) |
| `cloudflare/worker/lib/cloud-errors.js` | Standardized error format |
| `cloudflare/worker/lib/cloud-rate-limiter.js` | Per-UID rate limiting |
| `cloudflare/worker/lib/cloud-validator.js` | Request validation |
| `cloudflare/worker/lib/cloud-logger.js` | Safe structured logging |
| `cloudflare/worker/routes/cloud-health.js` | GET /api/v1/health |
| `cloudflare/worker/routes/cloud-memory.js` | Memory CRUD |
| `cloudflare/worker/routes/cloud-conversations.js` | Conversations CRUD |
| `cloudflare/worker/routes/cloud-projects.js` | Projects CRUD |
| `cloudflare/worker/routes/cloud-settings.js` | Settings sync |
| `cloudflare/worker/routes/cloud-adaptive-profile.js` | Adaptive profile sync |
| `cloudflare/worker/routes/cloud-sync.js` | Sync endpoint |
| `cloudflare/wrangler-cloud.toml` | Worker deployment configuration |

### Client (browser / PWA / APK)
| File | Purpose |
|------|---------|
| `sr-cloud-api.js` | Browser cloud API client + offline queue |

### Tests
| File | Purpose |
|------|---------|
| `tests/cloud-api.test.js` | 61 cloud API tests |

---

## Endpoints

### Public (no auth required)

#### `GET /api/v1/health`
Returns API and Firebase status.

**Response:**
```json
{
  "ok": true,
  "data": {
    "service": "shadow-reaper-cloud-api",
    "apiVersion": "v1",
    "status": "ok",
    "firebase": "connected",
    "timestamp": "2025-07-04T00:00:00.000Z"
  },
  "requestId": "src_..."
}
```

---

### Protected (requires `Authorization: Bearer <firebase-id-token>`)

All protected endpoints return `401` if the token is missing or invalid,
and `503` if Firebase is unavailable.

#### Memory

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/memory` | List all memories for this installation |
| POST | `/api/v1/memory` | Create a memory |
| GET | `/api/v1/memory/:id` | Get a specific memory |
| PATCH | `/api/v1/memory/:id` | Update a memory |
| DELETE | `/api/v1/memory/:id` | Delete a memory |

**POST body:**
```json
{ "content": "Remember that I prefer dark mode", "category": "preference" }
```

**PATCH body:**
```json
{ "content": "Updated memory content" }
```

#### Conversations

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/conversations` | List conversations |
| POST | `/api/v1/conversations` | Create a conversation |
| GET | `/api/v1/conversations/:id` | Get a conversation |
| PATCH | `/api/v1/conversations/:id` | Update (e.g. add turns) |
| DELETE | `/api/v1/conversations/:id` | Delete a conversation |

**POST body:**
```json
{
  "title": "Evening discussion",
  "turns": [
    { "role": "user", "text": "Hello Shadow" },
    { "role": "assistant", "text": "Hey! What's up?" }
  ]
}
```

#### Projects

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/projects` | List projects |
| POST | `/api/v1/projects` | Create a project |
| GET | `/api/v1/projects/:id` | Get a project |
| PATCH | `/api/v1/projects/:id` | Update a project |
| DELETE | `/api/v1/projects/:id` | Delete a project |

**POST body:**
```json
{ "name": "Shadow Reaper Android", "description": "Mobile app project", "status": "active" }
```

#### Settings

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/settings` | Get settings for this installation |
| PUT | `/api/v1/settings` | Replace settings |

**PUT body:**
```json
{
  "assistantName": "Shadow",
  "theme": "dark",
  "voiceEnabled": true,
  "memoryEnabled": true,
  "wakeName": "Shadow",
  "wakeListening": false
}
```

Forbidden settings keys (rejected): `apiKey`, `token`, `password`, `secret`,
`firebaseConfig`, `_systemRule`, `uid`, `serviceAccount`

#### Adaptive Profile

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/adaptive-profile` | Get adaptive profile |
| PUT | `/api/v1/adaptive-profile` | Replace adaptive profile |

**PUT body:**
```json
{
  "casualness": 0.7,
  "directness": 0.8,
  "humorPreference": 0.5,
  "sarcasmTolerance": 0.3,
  "verbosity": 0.6,
  "formality": 0.4
}
```

**Note:** Shadow Reaper makes all learning decisions locally. This endpoint
stores only the exported numeric profile for cloud sync — not learning logic.

#### Sync

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/v1/sync` | Controlled synchronization |

**POST body:**
```json
{
  "type": "memory",
  "direction": "push",
  "items": [
    { "id": "existing-id", "content": "Updated content", "updatedAt": "2025-07-04T12:00:00Z" },
    { "content": "New memory", "category": "general" }
  ]
}
```

Valid `type` values: `memory`, `conversations`, `projects`, `settings`, `adaptive-profile`, `full`

Valid `direction` values: `push`, `pull` (default: `push`)

**Pull response:**
```json
{
  "ok": true,
  "data": {
    "type": "memory",
    "direction": "pull",
    "items": [...],
    "pulled": 5,
    "timestamp": "2025-07-04T12:00:00Z"
  }
}
```

**Conflict strategy:** If a cloud item has `updatedAt` newer than the incoming local item,
the cloud item is not overwritten. The response includes `conflicts: N`. The caller
is responsible for merging conflicts locally.

---

## Response Format

All responses use a consistent format.

**Success:**
```json
{ "ok": true, "data": { ... }, "requestId": "src_..." }
```

**Error:**
```json
{ "ok": false, "error": { "code": "ERROR_CODE", "message": "Human-readable message." }, "requestId": "src_..." }
```

**Error codes:**
| Code | HTTP Status | When |
|------|------------|------|
| `UNAUTHORIZED` | 401 | Missing or invalid Firebase ID token |
| `FORBIDDEN` | 403 | Token valid but insufficient permissions |
| `NOT_FOUND` | 404 | Resource does not exist |
| `INVALID_REQUEST` | 400 | Malformed body, missing required fields, dangerous keys |
| `PAYLOAD_TOO_LARGE` | 413 | Request body exceeds 64KB |
| `RATE_LIMITED` | 429 | Per-installation rate limit exceeded |
| `FIREBASE_UNAVAILABLE` | 503 | Firestore unreachable |
| `SERVICE_UNAVAILABLE` | 503 | Worker not configured |
| `INTERNAL_ERROR` | 500 | Unexpected Worker error |
| `ENDPOINT_NOT_FOUND` | 404 | Unknown path |

---

## Authentication / Identity

### How it works
1. Shadow starts and calls `SRAuthUI.init()` — no login screen shown.
2. `SRAuthUI` calls `firebase.auth().signInAnonymously()` silently.
3. Firebase creates a stable anonymous UID (persisted in IndexedDB across sessions).
4. `sr-cloud-api.js` automatically calls `firebase.auth().currentUser.getIdToken()` before each request.
5. The ID token is sent as `Authorization: Bearer <token>`.
6. The Worker verifies the ID token cryptographically (RS256, Google public keys).
7. The verified `uid` from the token is used for all Firestore path construction.

### No trust from request body
The Worker **never** uses a `uid` from the request body, query string, or URL path
for authorization. The `uid` is derived exclusively from the verified Firebase ID token.

### Cross-installation isolation
- Each installation has a unique anonymous UID.
- All Firestore paths are scoped to `users/{uid}/`.
- Installation A cannot read or write Installation B's data.
- The Firestore security rules enforce `isOwner(uid)` for all private collections.
- The Worker additionally scopes all queries to the authenticated `uid`.

---

## Firestore Schema

```
users/
  {uid}/
    shadowReaperMemory/
      {memId}/
        content:   string        # Memory content (max 4096 chars)
        category:  string        # Category label
        uid:       string        # Owner uid (redundant guard)
        savedAt:   ISO timestamp
        updatedAt: ISO timestamp

    shadowReaperConversations/
      {convId}/
        title:     string        # Conversation title
        turns:     array         # [{role, text}, ...]
        uid:       string
        createdAt: ISO timestamp
        updatedAt: ISO timestamp

    shadowReaperProjects/
      {projectId}/
        name:        string      # Project name (required)
        description: string
        status:      string      # 'active' | 'paused' | 'completed'
        tags:        array
        uid:         string
        createdAt:   ISO timestamp
        updatedAt:   ISO timestamp

    shadowReaperPreferences/
      settings/
        assistantName:           string
        theme:                   string
        voiceEnabled:            boolean
        memoryEnabled:           boolean
        adaptiveEnabled:         boolean
        ttsEnabled:              boolean
        wakeName:                string
        wakeListening:           boolean
        uid:                     string
        updatedAt:               ISO timestamp

      adaptiveProfile/
        casualness:              number 0–1
        directness:              number 0–1
        humorPreference:         number 0–1
        sarcasmTolerance:        number 0–1
        verbosity:               number 0–1
        formality:               number 0–1
        uid:                     string
        updatedAt:               ISO timestamp

      assistant/          (existing — managed by sr-auth-ui.js)
        wakeName:         string
        wakeListening:    boolean

sharedKnowledge/          (existing — Founder writes only)
globalLearning/            (existing — Founder writes only)
shadowReaperConfig/        (existing — Founder writes only)
```

---

## Worker Secrets

Set via `wrangler secret put` — **never** hardcode in source files or `wrangler.toml`.

| Secret | Description |
|--------|-------------|
| `FIREBASE_SERVICE_ACCOUNT` | Full service account JSON key (paste entire JSON content) |
| `FIREBASE_PROJECT_ID` | Firebase project ID (e.g. `ffr3r3223`) |
| `SR_ALLOWED_ORIGINS` | JSON array of allowed CORS origins, e.g. `["https://your-domain.com"]` |

**Getting a service account key:**
1. Firebase Console → Project Settings → Service Accounts
2. Click "Generate new private key"
3. Download the JSON file
4. `wrangler secret put FIREBASE_SERVICE_ACCOUNT` → paste the entire JSON content

**Never:**
- Put the service account JSON in `wrangler.toml` `[vars]` section
- Commit the service account JSON to git
- Return the service account in any API response
- Put it in `localStorage`, `sessionStorage`, or client JavaScript

---

## Local Development

### Worker local dev
```bash
# Install wrangler if not already installed
npm install -g wrangler

# Start Worker locally (requires secrets to be configured)
npm run cloud:dev
# or:
npx wrangler dev --config cloudflare/wrangler-cloud.toml
```

The Worker will be available at `http://localhost:8787/api/v1/`.

For local dev without real Firebase, set `SR_ENV=development` in the toml and
use the `http://localhost:*` origins bypass.

### Client-side integration
```html
<!-- Load after firebase SDK and sr-auth-ui.js -->
<script src="sr-cloud-api.js"></script>
<script>
  SRCloudAPI.configure({
    workerUrl: 'http://localhost:8787'  // local dev
    // workerUrl: 'https://sr-cloud-api.your-subdomain.workers.dev'  // production
  });

  // Shadow still works even if SRCloudAPI is not configured
  // SRCloudAPI.isConfigured() === false → all calls return { ok: false, error: 'NOT_CONFIGURED' }
</script>
```

---

## Deployment

### 1. Prerequisites
- Cloudflare account
- Firebase project `ffr3r3223` (already configured)
- Firebase Anonymous Authentication enabled

### 2. One-time setup
```bash
# Log in to Cloudflare
npx wrangler login

# Set your account_id and name in cloudflare/wrangler-cloud.toml
# (uncomment and fill in the name and account_id lines)
```

### 3. Set secrets
```bash
npm run cloud:secret:firebase-sa
# (paste full service account JSON when prompted)

npm run cloud:secret:project-id
# (type: ffr3r3223)

npm run cloud:secret:origins
# (type: ["https://your-domain.com"])
```

### 4. Deploy
```bash
npm run cloud:deploy
```

### 5. Configure client
Update `sr-cloud-api.js` configuration (or `cloudflare/cloudflare-config.js`) with
the deployed Worker URL.

### 6. Update Firestore security rules
```bash
firebase deploy --only firestore:rules
```

---

## Security

### What the Worker enforces
- **ID token verification:** every request (except health) requires a valid Firebase Anonymous Auth ID token, verified via RS256 against Google's public keys
- **Ownership scoping:** all Firestore paths are constructed using only the verified `uid`
- **Input validation:** malformed JSON, dangerous keys (`__proto__`, `constructor`, `prototype`), oversized payloads, invalid IDs are all rejected
- **No sensitive field storage:** `apiKey`, `token`, `password`, `secret`, `uid` (body), `_systemRule` are blocked from settings and adaptive profile
- **Rate limiting:** per-UID sliding window limits on all write operations
- **Restrictive CORS:** only configured origins in `SR_ALLOWED_ORIGINS` are allowed
- **No secrets in responses:** service account, tokens, and credentials never appear in API responses
- **No stack traces:** internal errors return generic messages only

### What Firestore rules enforce
- `isOwner(uid)` for all `users/{uid}/...` paths
- `noForbiddenFields()` guard on all writes
- Completely deny all unauthenticated access
- Deny everything not explicitly allowed

### What is intentionally NOT done
- Firebase client config (`apiKey`, `projectId` etc.) in the frontend is normal Firebase practice — it is NOT a secret; authorization is enforced by Firestore rules and the Worker, not by hiding these values
- The anonymous UID is stable per installation — this is intentional for data continuity

---

## CORS

The Worker uses `SR_ALLOWED_ORIGINS` (a JSON array stored as a Worker secret) to
restrict cross-origin access. Only listed origins receive the appropriate
`Access-Control-Allow-Origin` header.

In `SR_ENV=development` mode, localhost origins are also permitted automatically.

The `Vary: Origin` header is set to prevent incorrect CORS responses being cached.

---

## Rate Limits

| Operation | Limit |
|-----------|-------|
| GET (reads) | 60 / minute / installation |
| Memory writes | 20 / minute / installation |
| Conversation writes | 20 / minute / installation |
| Project writes | 15 / minute / installation |
| Settings | 10 / minute / installation |
| Adaptive Profile | 10 / minute / installation |
| Sync | 10 / minute / installation |
| Health | 120 / minute (unauthenticated) |

When rate limited, the response includes `Retry-After` (seconds) in the headers
and `retryAfterMs` in the body.

---

## Offline Queue

When the network is unavailable, write operations are queued in `localStorage`
under key `sr_cloud_queue_v1`.

- Max queue size: **200 items** (bounded — oldest dropped if full)
- Retry strategy: bounded exponential backoff: 5s → 15s → 30s → 60s → 120s
- Max retries per item: **5** (item dropped after 5 failures)
- Queue drains automatically when `online` event fires
- Reads (GET) are NOT queued — they fail immediately when offline

Shadow Reaper's conversation ability is completely unaffected by queue state.

---

## Testing

```bash
# Run cloud API tests (no live Firebase required)
npm run test:cloud-api

# Run all tests
npm test
```

**Test coverage:**
1. API health endpoint structure and safety
2. Anonymous identity (no login required)
3. Memory CRUD operations
4. Conversations CRUD
5. Projects CRUD
6. Settings GET + PUT (including forbidden key rejection)
7. Adaptive profile GET + PUT
8. Sync: push, pull, conflict detection
9. Offline queue: enqueue, max size, bounded backoff, max retries
10. Reconnect sync / queue drain
11. Unauthorized access (missing/invalid token → 401)
12. Cross-installation isolation (A cannot read B's data)
13. Malformed request rejection (bad JSON, array body, null body)
14. Oversized request rejection (content size, payload size, raw body)
15. Rate limiting (per-UID, per-tier, independent buckets)
16. Firebase unavailable (503 graceful degradation)
17. Cloudflare API unavailable (Shadow still works)
18. Shadow works offline (no cloud dependency)
19. No secrets in responses (service account, tokens, stack traces)
20. Validation edge cases (dangerous keys, path traversal, invalid IDs)

---

## Troubleshooting

### `FIREBASE_SERVICE_ACCOUNT secret not set`
The Worker secret was not configured. Run:
```bash
npx wrangler secret put FIREBASE_SERVICE_ACCOUNT --config cloudflare/wrangler-cloud.toml
```

### `401 UNAUTHORIZED` on all protected requests
- Check that `SRAuthUI.init()` was called before `SRCloudAPI` makes requests
- Ensure Firebase Anonymous Authentication is enabled in the Firebase Console
- The anonymous sign-in may have failed silently — check browser console for `[SRAuthUI]` messages

### `503 FIREBASE_UNAVAILABLE`
- The Worker could not reach Firestore
- Check the service account has `Cloud Datastore User` role in GCP IAM
- Check the Firebase project ID is correct in the `FIREBASE_PROJECT_ID` secret

### CORS errors in browser
- Add your domain to `SR_ALLOWED_ORIGINS` and redeploy
- Format: `["https://your-domain.com"]` (JSON array as string)

### Offline queue not draining
- Check `SRCloudAPI.getQueueLength()` > 0
- Check `SRCloudAPI.isOnline()` returns true
- Call `SRCloudAPI.retryQueue()` manually to trigger a drain attempt
- Check browser console for `[SRCloudAPI]` messages
- If items exceed max retries, they are dropped — call `SRCloudAPI.clearQueue()` to reset

---

## Limitations

1. **Worker cold start:** The first request to an idle Worker may have a cold-start delay (~50ms). Subsequent requests in the same isolate lifetime are faster.

2. **Token cache:** Google public keys for ID token verification are cached in Worker module memory. Cache is reset on Worker restart.

3. **Rate limiter state:** The in-Worker rate limiter is in module-level memory. State is not shared across Cloudflare's edge locations or between isolate restarts. For stricter rate limiting, configure Cloudflare Zone-level Rate Limiting rules.

4. **Firestore REST API:** The Worker uses Firestore's REST API (not the Admin SDK). Complex queries (orderBy, where) are not implemented — clients receive the full collection and filter locally.

5. **No batch/transaction support:** The sync endpoint processes items sequentially. Large sync operations may be slow.

6. **Firebase Admin token lifetime:** Service account OAuth2 access tokens are 1-hour lifetime. The Worker fetches a new token on each invocation (no persistent storage). This adds ~100–200ms to cold starts.

7. **Offline queue storage:** The queue is stored in `localStorage`. If the user clears browser storage, queued operations are lost. For critical data, always confirm cloud sync completed before considering an operation durable.
