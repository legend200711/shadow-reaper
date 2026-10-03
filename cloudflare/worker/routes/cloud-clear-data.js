/**
 * cloudflare/worker/routes/cloud-clear-data.js
 * Shadow Reaper Cloud API — Clear My Shadow Data
 *
 * Build: SR-CLOUD-CLEAR-1
 *
 * POST /api/v1/clear-data
 *
 * PURPOSE:
 *   Secure, explicit deletion of a user's personal Shadow data.
 *   Clears ONLY the authenticated user's own data — never affects:
 *     - Language Foundation
 *     - Shared / general knowledge
 *     - Other users
 *     - System configuration
 *
 * REQUEST:
 *   { confirm: "CLEAR MY SHADOW DATA" }
 *
 *   The confirmation string is required to prevent accidental deletion.
 *
 * RESPONSE:
 *   { success: true, cleared: { memory: N, conversations: N, projects: N, settings: boolean, adaptiveProfile: boolean } }
 *
 * SECURITY:
 *   - Requires valid session (uid from auth)
 *   - Requires explicit confirmation string
 *   - Scoped to own uid only — cannot clear another user's data
 *   - Non-reversible — logs only counts, never content
 */

'use strict';

import { buildSuccess, buildError } from '../lib/cloud-errors.js';

const CONFIRMATION_STRING = 'CLEAR MY SHADOW DATA';

// ── Delete all documents in a collection for a user ─────────────────────────────

async function _deleteCollection(adminClient, uid, collectionName) {
  let count = 0;
  try {
    const docs = await adminClient.list(`users/${uid}/${collectionName}`, { pageSize: 100 });
    if (Array.isArray(docs)) {
      for (const doc of docs) {
        try {
          await adminClient.delete(`users/${uid}/${collectionName}/${doc.id}`);
          count++;
        } catch (_) {}
      }
    }
  } catch (_) {}
  return count;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export async function handleClearData(body, ctx) {
  const requestId   = (ctx && ctx.requestId) || 'unknown';
  const uid         = (ctx && ctx.uid) || null;
  const adminClient = (ctx && ctx.adminClient) || null;

  if (!uid || !adminClient) {
    return { status: 401, body: buildError('UNAUTHORIZED', requestId) };
  }

  // Require explicit confirmation string
  if (!body || body.confirm !== CONFIRMATION_STRING) {
    return {
      status: 400,
      body: buildError('INVALID_REQUEST', requestId,
        'Confirmation required: set confirm to "CLEAR MY SHADOW DATA".'),
    };
  }

  // Delete all personal data collections in parallel
  const [memoryCount, conversationCount, projectCount] = await Promise.all([
    _deleteCollection(adminClient, uid, 'shadowReaperMemory'),
    _deleteCollection(adminClient, uid, 'shadowReaperConversations'),
    _deleteCollection(adminClient, uid, 'shadowReaperProjects'),
  ]);

  // Clear preferences (settings + adaptive profile)
  let settingsCleared = false;
  let adaptiveCleared = false;
  try {
    await adminClient.delete(`users/${uid}/shadowReaperPreferences/settings`);
    settingsCleared = true;
  } catch (_) {}
  try {
    await adminClient.delete(`users/${uid}/shadowReaperPreferences/adaptiveProfile`);
    adaptiveCleared = true;
  } catch (_) {}

  // Log counts only — never content
  console.log('[clear-data] Cleared uid prefix:', uid.slice(0, 6),
    'memory:', memoryCount,
    'conversations:', conversationCount,
    'projects:', projectCount,
    'requestId:', requestId);

  return {
    status: 200,
    body: buildSuccess({
      cleared: {
        memory:        memoryCount,
        conversations: conversationCount,
        projects:      projectCount,
        settings:      settingsCleared,
        adaptiveProfile: adaptiveCleared,
      },
      message: 'Your Shadow data has been cleared.',
    }, requestId),
  };
}
