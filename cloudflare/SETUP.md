# Cloudflare Setup — Shadow Reaper Cloud API

## Status: ✅ LIVE — DEPLOYED AND OPERATIONAL

Shadow Reaper Cloud API (`sr-cloud-api`) is deployed to Cloudflare Workers.
Workers AI binding is active — hosted inference is LIVE.

**Production endpoint:** `https://sr-cloud-api.nthntjrn.workers.dev`

| Component | Status |
|-----------|--------|
| Worker deployed | ✅ LIVE |
| Firebase auth | ✅ CONNECTED |
| Firestore sync | ✅ CONNECTED |
| Workers AI binding (env.AI) | ✅ BOUND |
| Hosted inference `/api/v1/inference` | ✅ LIVE — REAL GENERATION |
| Default model | @cf/meta/llama-3-8b-instruct (fallback: @cf/mistral/mistral-7b-instruct-v0.1) |
| Health endpoint | ✅ Returns `inference: true` |

---

## What Cloudflare will be used for

| Purpose | Service |
|---------|---------|
| Hosting / infrastructure | Cloudflare Pages or Workers Sites |
| Backend API gateway | Cloudflare Workers |
| Web Research Engine | Cloudflare Workers (future) |
| Rate limiting | Cloudflare Rate Limiting rules |
| Caching | Cloudflare Cache API |
| Shared knowledge services | Cloudflare Workers + KV (future) |
| Security gateway | Cloudflare Access (future) |

---

## ⚠️ What Cloudflare will NOT be used for

- **Cloudflare Workers AI** — Shadow Reaper's intelligence does NOT depend on Cloudflare AI
- Shadow Nexus Social resources — entirely separate

---

## Information I need from you

Before any Cloudflare integration can be set up, provide:

### Account-level
| Value | Description |
|-------|-------------|
| `CLOUDFLARE_ACCOUNT_ID` | Your Cloudflare account ID (found in Dashboard → right sidebar) |
| `CLOUDFLARE_API_TOKEN` | A scoped API token (see token scope guidance below) |

### Per-resource (create as needed)
| Value | Description |
|-------|-------------|
| Worker name | Name for the Shadow Reaper Standalone Worker (e.g. `sr-standalone-api`) |
| KV namespace name | For future shared knowledge storage (e.g. `SR_SHARED_KNOWLEDGE`) |
| R2 bucket name | Only if file storage is needed (e.g. `sr-standalone-assets`) |
| Pages project name | If using Cloudflare Pages for hosting |

---

## Recommended API Token Scopes (least-privilege)

Create a token at https://dash.cloudflare.com/profile/api-tokens with:

```
Account: Cloudflare Workers Scripts: Edit
Account: Workers KV Storage: Edit     (if KV is used)
Account: Cloudflare Pages: Edit       (if Pages hosting is used)
Zone: Cache Purge: Purge              (if cache purging is needed)
```

Do NOT use a Global API Key — use a scoped token.

---

## Environment Variables (future Workers)

When Workers are created, these secrets must be set via Wrangler or the Dashboard:

```
# Set via: wrangler secret put SECRET_NAME
FIREBASE_SERVICE_ACCOUNT   # only if server-side Firebase Admin SDK is used
SR_INTERNAL_API_KEY        # internal authentication between components
```

**Never commit secrets to GitHub. Never hardcode in source files.**

---

## wrangler.toml (skeleton — fill in after account details are provided)

```toml
# cloudflare/wrangler.toml — Shadow Reaper Standalone Worker

name = "sr-standalone-api"         # PLACEHOLDER — replace with actual name
main = "cloudflare/worker/index.js"
compatibility_date = "2025-01-01"

# account_id = "YOUR_ACCOUNT_ID"   # PLACEHOLDER — add after account setup
# Do NOT commit the real account ID to public repos

[vars]
SR_PROJECT = "shadow-reaper-standalone"
SR_ENV     = "development"

# Workers AI is intentionally NOT configured
# [ai]
# binding = "AI"   ← disabled by design
```
