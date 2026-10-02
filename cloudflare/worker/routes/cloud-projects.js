/**
 * cloudflare/worker/routes/cloud-projects.js
 * Shadow Reaper Cloud API — Projects CRUD
 *
 * Build: SR-CLOUD-API-1
 *
 * Endpoints:
 *   GET    /api/v1/projects          — list
 *   POST   /api/v1/projects          — create
 *   GET    /api/v1/projects/:id      — get
 *   PATCH  /api/v1/projects/:id      — update
 *   DELETE /api/v1/projects/:id      — delete
 *
 * Firestore path: users/{uid}/shadowReaperProjects/{projectId}
 */

'use strict';

import { buildSuccess, buildError } from '../lib/cloud-errors.js';
import { validateProjectCreate, validateProjectPatch, validateId } from '../lib/cloud-validator.js';

const COL = (uid) => `users/${uid}/shadowReaperProjects`;
const DOC = (uid, id) => `users/${uid}/shadowReaperProjects/${id}`;

async function listProjects(ctx) {
  const { requestId, uid, adminClient } = ctx;
  try {
    const docs = await adminClient.list(COL(uid), { pageSize: 100 });
    return { status: 200, body: buildSuccess(docs, requestId) };
  } catch (e) {
    return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId) };
  }
}

async function createProject(ctx, body) {
  const { requestId, uid, adminClient } = ctx;
  const v = validateProjectCreate(body);
  if (!v.ok) return { status: 400, body: buildError('INVALID_REQUEST', requestId, v.reason) };

  const data = {
    name:        body.name,
    description: body.description || '',
    status:      body.status || 'active',
    tags:        Array.isArray(body.tags) ? body.tags : [],
    uid,
    createdAt:   new Date().toISOString(),
    updatedAt:   new Date().toISOString(),
  };
  try {
    const result = await adminClient.add(COL(uid), data);
    return { status: 201, body: buildSuccess(result, requestId) };
  } catch (e) {
    return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId) };
  }
}

async function getProject(ctx, id) {
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

async function patchProject(ctx, id, body) {
  const { requestId, uid, adminClient } = ctx;
  if (!validateId(id)) return { status: 400, body: buildError('INVALID_REQUEST', requestId, 'Invalid ID format.') };
  const v = validateProjectPatch(body);
  if (!v.ok) return { status: 400, body: buildError('INVALID_REQUEST', requestId, v.reason) };

  let existing;
  try {
    existing = await adminClient.get(DOC(uid, id));
  } catch (e) {
    return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId) };
  }
  if (!existing) return { status: 404, body: buildError('NOT_FOUND', requestId) };

  const updates = { updatedAt: new Date().toISOString() };
  if (body.name        !== undefined) updates.name        = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.status      !== undefined) updates.status      = body.status;
  if (body.tags        !== undefined && Array.isArray(body.tags)) updates.tags = body.tags;

  try {
    await adminClient.patch(DOC(uid, id), updates);
    return { status: 200, body: buildSuccess({ id, ...updates }, requestId) };
  } catch (e) {
    return { status: 503, body: buildError('FIREBASE_UNAVAILABLE', requestId) };
  }
}

async function deleteProject(ctx, id) {
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

export { listProjects, createProject, getProject, patchProject, deleteProject };
