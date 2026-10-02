/**
 * cloudflare/worker/routes/cloud-conversations.js
 * Shadow Reaper Cloud API — Conversations CRUD
 *
 * Build: SR-CLOUD-API-1
 *
 * Endpoints:
 *   GET    /api/v1/conversations          — list
 *   POST   /api/v1/conversations          — create
 *   GET    /api/v1/conversations/:id      — get
 *   PATCH  /api/v1/conversations/:id      — update
 *   DELETE /api/v1/conversations/:id      — delete
 *
 * Firestore path: users/{uid}/shadowReaperConversations/{convId}
 *
 * Only stores intentional conversation persistence data.
 * Internal processing/reasoning is never stored here.
 */

'use strict';

import { buildSuccess, buildError } from '../lib/cloud-errors.js';
import { validateConversationCreate, validateConversationPatch, validateId } from '../lib/cloud-validator.js';

const COL = (uid) => `users/${uid}/shadowReaperConversations`;
const DOC = (uid, id) => `users/${uid}/shadowReaperConversations/${id}`;

async function listConversations(ctx) {
  const { requestId, uid, adminClient } = ctx;
  try {
    const docs = await adminClient.list(COL(uid), { pageSize: 50 });
    return { status: 200, body: buildSuccess(docs, requestId) };
  } catch (e) {
    return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId) };
  }
}

async function createConversation(ctx, body) {
  const { requestId, uid, adminClient } = ctx;
  const v = validateConversationCreate(body);
  if (!v.ok) return { status: 400, body: buildError('INVALID_REQUEST', requestId, v.reason) };

  const data = {
    title:     body.title || 'Conversation',
    turns:     body.turns || [],
    uid,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  try {
    const result = await adminClient.add(COL(uid), data);
    return { status: 201, body: buildSuccess(result, requestId) };
  } catch (e) {
    return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId) };
  }
}

async function getConversation(ctx, id) {
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

async function patchConversation(ctx, id, body) {
  const { requestId, uid, adminClient } = ctx;
  if (!validateId(id)) return { status: 400, body: buildError('INVALID_REQUEST', requestId, 'Invalid ID format.') };
  const v = validateConversationPatch(body);
  if (!v.ok) return { status: 400, body: buildError('INVALID_REQUEST', requestId, v.reason) };

  let existing;
  try {
    existing = await adminClient.get(DOC(uid, id));
  } catch (e) {
    return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId) };
  }
  if (!existing) return { status: 404, body: buildError('NOT_FOUND', requestId) };

  const updates = { updatedAt: new Date().toISOString() };
  if (body.title !== undefined) updates.title = body.title;
  if (body.turns !== undefined) updates.turns = body.turns;

  try {
    await adminClient.patch(DOC(uid, id), updates);
    return { status: 200, body: buildSuccess({ id, ...updates }, requestId) };
  } catch (e) {
    return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId) };
  }
}

async function deleteConversation(ctx, id) {
  const { requestId, uid, adminClient } = ctx;
  if (!validateId(id)) return { status: 400, body: buildError('INVALID_REQUEST', requestId, 'Invalid ID format.') };

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

export { listConversations, createConversation, getConversation, patchConversation, deleteConversation };
