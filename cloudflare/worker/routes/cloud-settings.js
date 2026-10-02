/**
 * cloudflare/worker/routes/cloud-settings.js
 * Shadow Reaper Cloud API — Settings Sync
 *
 * Build: SR-CLOUD-API-1
 *
 * Endpoints:
 *   GET /api/v1/settings   — get settings for this installation
 *   PUT /api/v1/settings   — replace/update settings
 *
 * Firestore path: users/{uid}/shadowReaperPreferences/settings
 *
 * Syncs non-secret settings only. Secrets are never stored here.
 */

'use strict';

import { buildSuccess, buildError } from '../lib/cloud-errors.js';
import { validateSettingsPut } from '../lib/cloud-validator.js';

const DOC = (uid) => `users/${uid}/shadowReaperPreferences/settings`;

async function getSettings(ctx) {
  const { requestId, uid, adminClient } = ctx;
  try {
    const doc = await adminClient.get(DOC(uid));
    return { status: 200, body: buildSuccess(doc ? doc.data : {}, requestId) };
  } catch (e) {
    return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId) };
  }
}

async function putSettings(ctx, body) {
  const { requestId, uid, adminClient } = ctx;
  const v = validateSettingsPut(body);
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

export { getSettings, putSettings };
