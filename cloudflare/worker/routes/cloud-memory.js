/**
 * cloudflare/worker/routes/cloud-memory.js
 * Shadow Reaper Cloud API — Memory CRUD
 *
 * Build: SR-CLOUD-API-1
 *
 * Endpoints:
 *   GET    /api/v1/memory           — list memories for this installation
 *   POST   /api/v1/memory           — create a new memory
 *   GET    /api/v1/memory/:id       — get a specific memory
 *   PATCH  /api/v1/memory/:id       — update a memory
 *   DELETE /api/v1/memory/:id       — delete a memory
 *
 * Firestore path: users/{uid}/shadowReaperMemory/{memId}
 *
 * SECURITY:
 *   - uid comes from the verified Firebase ID token only
 *   - No uid from request body is trusted
 *   - All reads/writes are scoped to the authenticated uid
 */

'use strict';

import { buildSuccess, buildError } from '../lib/cloud-errors.js';
import { validateMemoryCreate, validateMemoryPatch, validateId } from '../lib/cloud-validator.js';

const COL = (uid) => `users/${uid}/shadowReaperMemory`;
const DOC = (uid, id) => `users/${uid}/shadowReaperMemory/${id}`;

// ─── GET /api/v1/memory ───────────────────────────────────────────────────────

async function listMemory(ctx) {
  const { requestId, uid, adminClient } = ctx;
  try {
    const docs = await adminClient.list(COL(uid), { pageSize: 100 });
    return { status: 200, body: buildSuccess(docs, requestId) };
  } catch (e) {
    return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId) };
  }
}

// ─── POST /api/v1/memory ──────────────────────────────────────────────────────

async function createMemory(ctx, body) {
  const { requestId, uid, adminClient } = ctx;
  const v = validateMemoryCreate(body);
  if (!v.ok) return { status: 400, body: buildError('INVALID_REQUEST', requestId, v.reason) };

  const data = {
    content:   body.content,
    category:  body.category || 'general',
    uid,
    savedAt:   new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  try {
    const result = await adminClient.add(COL(uid), data);
    return { status: 201, body: buildSuccess(result, requestId) };
  } catch (e) {
    return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId) };
  }
}

// ─── GET /api/v1/memory/:id ───────────────────────────────────────────────────

async function getMemory(ctx, id) {
  const { requestId, uid, adminClient } = ctx;
  if (!validateId(id)) return { status: 400, body: buildError('INVALID_REQUEST', requestId, 'Invalid ID format.') };

  try {
    const doc = await adminClient.get(DOC(uid, id));
    if (!doc) return { status: 404, body: buildError('NOT_FOUND', requestId) };
    return { status: 200, body: buildSuccess(doc, requestId) };
  } catch (e) {
    return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId) };
  }
}

// ─── PATCH /api/v1/memory/:id ─────────────────────────────────────────────────

async function patchMemory(ctx, id, body) {
  const { requestId, uid, adminClient } = ctx;
  if (!validateId(id)) return { status: 400, body: buildError('INVALID_REQUEST', requestId, 'Invalid ID format.') };
  const v = validateMemoryPatch(body);
  if (!v.ok) return { status: 400, body: buildError('INVALID_REQUEST', requestId, v.reason) };

  // Verify ownership: the doc must exist under this uid's collection
  let existing;
  try {
    existing = await adminClient.get(DOC(uid, id));
  } catch (e) {
    return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId) };
  }
  if (!existing) return { status: 404, body: buildError('NOT_FOUND', requestId) };

  const updates = { updatedAt: new Date().toISOString() };
  if (body.content  !== undefined) updates.content  = body.content;
  if (body.category !== undefined) updates.category = body.category;

  try {
    await adminClient.patch(DOC(uid, id), updates);
    return { status: 200, body: buildSuccess({ id, ...updates }, requestId) };
  } catch (e) {
    return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId) };
  }
}

// ─── DELETE /api/v1/memory/:id ────────────────────────────────────────────────

async function deleteMemory(ctx, id) {
  const { requestId, uid, adminClient } = ctx;
  if (!validateId(id)) return { status: 400, body: buildError('INVALID_REQUEST', requestId, 'Invalid ID format.') };

  // Verify ownership before delete
  let existing;
  try {
    existing = await adminClient.get(DOC(uid, id));
  } catch (e) {
    return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId) };
  }
  if (!existing) return { status: 404, body: buildError('NOT_FOUND', requestId) };

  try {
    await adminClient.delete(DOC(uid, id));
    return { status: 200, body: buildSuccess({ id, deleted: true }, requestId) };
  } catch (e) {
    return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId) };
  }
}

export { listMemory, createMemory, getMemory, patchMemory, deleteMemory };
