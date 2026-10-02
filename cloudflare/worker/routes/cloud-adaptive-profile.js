/**
 * cloudflare/worker/routes/cloud-adaptive-profile.js
 * Shadow Reaper Cloud API — Adaptive Profile Sync
 *
 * Build: SR-CLOUD-API-1
 *
 * Endpoints:
 *   GET /api/v1/adaptive-profile   — get adaptive profile for this installation
 *   PUT /api/v1/adaptive-profile   — replace/update adaptive profile
 *
 * Firestore path: users/{uid}/shadowReaperPreferences/adaptiveProfile
 *
 * Stores only the approved adaptive profile export.
 * Learning decisions are made locally by Shadow Reaper — this is sync only.
 *
 * Allowed fields:
 *   preferredResponseLength  — 'short' | 'medium' | 'long'
 *   casualness               — number 0–1
 *   directness               — number 0–1
 *   humorPreference          — number 0–1
 *   sarcasmTolerance         — number 0–1
 *   verbosity                — number 0–1
 *   formality                — number 0–1
 */

'use strict';

import { buildSuccess, buildError } from '../lib/cloud-errors.js';
import { validateAdaptivePut } from '../lib/cloud-validator.js';

const DOC = (uid) => `users/${uid}/shadowReaperPreferences/adaptiveProfile`;

async function getAdaptiveProfile(ctx) {
  const { requestId, uid, adminClient } = ctx;
  try {
    const doc = await adminClient.get(DOC(uid));
    return { status: 200, body: buildSuccess(doc ? doc.data : {}, requestId) };
  } catch (e) {
    return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId) };
  }
}

async function putAdaptiveProfile(ctx, body) {
  const { requestId, uid, adminClient } = ctx;
  const v = validateAdaptivePut(body);
  if (!v.ok) return { status: 400, body: buildError('INVALID_REQUEST', requestId, v.reason) };

  const data = Object.assign({}, body, {
    uid,
    updatedAt: new Date().toISOString(),
  });

  try {
    await adminClient.set(DOC(uid), data);
    return { status: 200, body: buildSuccess({ updated: true, updatedAt: data.updatedAt }, requestId) };
  } catch (e) {
    return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId) };
  }
}

export { getAdaptiveProfile, putAdaptiveProfile };
