/**
 * cloudflare/worker/routes/cloud-sync.js
 * Shadow Reaper Cloud API — Sync Endpoint
 *
 * Build: SR-CLOUD-API-1
 *
 * Endpoint:
 *   POST /api/v1/sync
 *
 * Handles controlled synchronization requests.
 *
 * Request body:
 *   {
 *     type:      'memory' | 'conversations' | 'projects' | 'settings' | 'adaptive-profile' | 'full'
 *     direction: 'push' | 'pull'   (default: 'push')
 *     items:     [...] optional array of items to push (for 'push' operations)
 *     since:     ISO timestamp     (for pull: fetch changes since this time)
 *   }
 *
 * Response:
 *   {
 *     ok:         true,
 *     data: {
 *       type:      'memory',
 *       direction: 'pull',
 *       items:     [...],   (for pulls)
 *       synced:    N,       (for pushes)
 *       conflicts: N,       (for conflicts detected)
 *       timestamp: ISO      (server timestamp of sync)
 *     }
 *   }
 *
 * CONFLICT STRATEGY:
 *   For push: if the cloud item has updatedAt NEWER than the local item,
 *   it is skipped and reported as a conflict. Callers must handle conflicts.
 *   For pull: returns all items updated since `since`, caller merges locally.
 *
 * LOCAL-FIRST RULE:
 *   This endpoint does not do thinking or AI processing.
 *   It stores and retrieves data. Shadow Reaper's intelligence is never here.
 */

'use strict';

import { buildSuccess, buildError } from '../lib/cloud-errors.js';
import { validateSyncRequest } from '../lib/cloud-validator.js';

const COLLECTION_MAP = {
  'memory':           (uid) => `users/${uid}/shadowReaperMemory`,
  'conversations':    (uid) => `users/${uid}/shadowReaperConversations`,
  'projects':         (uid) => `users/${uid}/shadowReaperProjects`,
};

const SINGLETON_MAP = {
  'settings':         (uid) => `users/${uid}/shadowReaperPreferences/settings`,
  'adaptive-profile': (uid) => `users/${uid}/shadowReaperPreferences/adaptiveProfile`,
};

async function handleSync(ctx, body) {
  const { requestId, uid, adminClient } = ctx;
  const v = validateSyncRequest(body);
  if (!v.ok) return { status: 400, body: buildError('INVALID_REQUEST', requestId, v.reason) };

  const type      = body.type;
  const direction = body.direction || 'push';
  const since     = body.since || null;
  const now       = new Date().toISOString();

  // ── FULL sync: dispatch to each sub-type ─────────────────────────────────
  if (type === 'full') {
    const results = {};
    const subTypes = ['memory', 'conversations', 'projects', 'settings', 'adaptive-profile'];
    for (const sub of subTypes) {
      try {
        const subResult = await _syncType(uid, adminClient, sub, direction, since, body.items);
        results[sub] = subResult;
      } catch (e) {
        results[sub] = { error: 'firebase_unavailable' };
      }
    }
    return { status: 200, body: buildSuccess({ type: 'full', direction, results, timestamp: now }, requestId) };
  }

  // ── Single-type sync ──────────────────────────────────────────────────────
  try {
    const result = await _syncType(uid, adminClient, type, direction, since, body.items);
    return { status: 200, body: buildSuccess({ type, direction, timestamp: now, ...result }, requestId) };
  } catch (e) {
    return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId) };
  }
}

async function _syncType(uid, adminClient, type, direction, since, items) {
  // Settings and adaptive-profile are singletons
  if (SINGLETON_MAP[type]) {
    const docPath = SINGLETON_MAP[type](uid);
    if (direction === 'pull') {
      const doc = await adminClient.get(docPath);
      const data = doc ? doc.data : {};
      // If since filter: return only if updatedAt > since
      if (since && data.updatedAt && data.updatedAt <= since) {
        return { items: [], pulled: 0 };
      }
      return { items: [data], pulled: 1 };
    } else {
      // Push: items[0] is the data to store
      if (!Array.isArray(items) || items.length === 0) return { synced: 0, conflicts: 0 };
      const incoming = items[0];
      const existing = await adminClient.get(docPath);
      // Conflict check: don't overwrite newer cloud data
      if (existing && existing.data.updatedAt && incoming.updatedAt &&
          existing.data.updatedAt > incoming.updatedAt) {
        return { synced: 0, conflicts: 1 };
      }
      await adminClient.set(docPath, Object.assign({}, incoming, { uid, updatedAt: new Date().toISOString() }));
      return { synced: 1, conflicts: 0 };
    }
  }

  // Collection-based sync
  const colPath = COLLECTION_MAP[type](uid);
  if (direction === 'pull') {
    const docs = await adminClient.list(colPath, { pageSize: 100 });
    // Filter by since if provided
    const filtered = since
      ? docs.filter(d => d.data.updatedAt && d.data.updatedAt > since)
      : docs;
    return { items: filtered, pulled: filtered.length };
  } else {
    // Push array of items
    if (!Array.isArray(items) || items.length === 0) return { synced: 0, conflicts: 0 };
    let synced = 0, conflicts = 0;
    for (const item of items) {
      if (!item) continue;
      const itemId = item.id || item._id;
      if (itemId) {
        // Update existing
        const docPath = colPath + '/' + itemId;
        let existing = null;
        try { existing = await adminClient.get(docPath); } catch (e) {}
        // Conflict: cloud is newer
        if (existing && existing.data.updatedAt && item.updatedAt &&
            existing.data.updatedAt > item.updatedAt) {
          conflicts++;
          continue;
        }
        const data = Object.assign({}, item, { uid, updatedAt: new Date().toISOString() });
        delete data.id; delete data._id;
        await adminClient.set(docPath, data);
      } else {
        // New item
        const data = Object.assign({}, item, { uid, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
        await adminClient.add(colPath, data);
      }
      synced++;
    }
    return { synced, conflicts };
  }
}

export { handleSync };
