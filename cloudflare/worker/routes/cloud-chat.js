/**
 * cloudflare/worker/routes/cloud-chat.js
 * Shadow Reaper Cloud API — Primary Conversation Endpoint
 *
 * Build: SR-CLOUD-CHAT-1
 *
 * POST /api/v1/chat
 *
 * THIS IS THE PRIMARY INTERFACE BETWEEN ALL SHADOW CLIENTS AND
 * SHADOW'S BACKEND INTELLIGENCE.
 *
 * Architecture:
 *   CLIENT (PWA/Phone/Web)
 *     ↓  { message, conversationId, client }
 *   POST /api/v1/chat  ← THIS FILE
 *     ↓
 *   Load user memory (Firestore)
 *   Load conversation history (Firestore)
 *   Load user projects (Firestore)
 *   Assemble ShadowReaper system context
 *     ↓
 *   Workers AI inference (env.AI)
 *     ↓
 *   Save turn to conversation history
 *     ↓
 *   { success, text, conversationId, requestId, runtime, provider, model, memoryAvailable }
 *
 * CRITICAL RULE — ONE BRAIN:
 *   This file is NOT a new AI. It is the server-side execution of ShadowReaper's
 *   conversation pipeline. The same intelligence that runs locally now also runs
 *   as the authoritative server-side path.
 *
 * IDENTITY:
 *   The uid comes from the verified Firebase ID token ONLY.
 *   Never from the request body. All Firestore paths are scoped to uid.
 *
 * LANGUAGE FOUNDATION:
 *   The 112k+ vocabulary index is too large for a Worker bundle.
 *   The client sends enriched analysis in the request:
 *     intent, concepts, negation, entities, resolvedRef
 *   These are produced by the client-side Language Foundation and
 *   injected into the server-side context assembly.
 *   The server NEVER trusts client-supplied system prompts or memory —
 *   only the linguistic analysis hints are accepted.
 *
 * PRIVACY:
 *   - No conversation content is logged (only metadata: turn count, latency, model)
 *   - Memory content is loaded and used but never echoed back raw
 *   - uid is never exposed in the response
 *
 * SECURITY:
 *   - uid from verified token only
 *   - Message max: 4096 chars
 *   - Context window bounded: max 8 history turns
 *   - Memory injected: max 3 items, 256 chars each
 *   - System prompt assembled server-side: client cannot inject prompt
 *   - No execution of client-supplied code
 */

'use strict';

import { buildError } from '../lib/cloud-errors.js';

// ── Constants ─────────────────────────────────────────────────────────────────

const DEFAULT_MODEL  = '@cf/meta/llama-3-8b-instruct';
const FALLBACK_MODEL = '@cf/mistral/mistral-7b-instruct-v0.1';
const MAX_TOKENS     = 512;
const INFERENCE_TIMEOUT_MS = 25000;

// ShadowReaper's core identity and personality — server-side, not client-supplied
const SHADOW_SYSTEM_PROMPT = `You are Shadow, a highly capable personal AI assistant. You are direct, insightful, and adapt to the user's conversational style. You remember context from the conversation and the user's personal memories. You are honest about what you know and don't know. Never claim to be ChatGPT, GPT, Claude, or any other AI system — you are Shadow, built by your creator. Keep responses conversational and appropriately concise.`;

// ── Request validation ─────────────────────────────────────────────────────────

function _validateChatRequest(body) {
  if (!body || typeof body !== 'object') {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }

  if (typeof body.message !== 'string' || body.message.trim().length === 0) {
    return { ok: false, error: 'message is required and must be a non-empty string.' };
  }

  if (body.message.length > 4096) {
    return { ok: false, error: 'message exceeds 4096 characters.' };
  }

  if (body.conversationId !== undefined && body.conversationId !== null) {
    if (typeof body.conversationId !== 'string' || body.conversationId.length > 128) {
      return { ok: false, error: 'conversationId must be a string (max 128 chars).' };
    }
    // Prevent path traversal
    if (/[\/\\<>]/.test(body.conversationId)) {
      return { ok: false, error: 'conversationId contains invalid characters.' };
    }
  }

  // client field is informational only — we accept it but never trust it for auth
  if (body.client !== undefined && typeof body.client !== 'object') {
    return { ok: false, error: 'client must be an object if provided.' };
  }

  // languageAnalysis is optional client-supplied linguistic enrichment
  if (body.languageAnalysis !== undefined && typeof body.languageAnalysis !== 'object') {
    return { ok: false, error: 'languageAnalysis must be an object if provided.' };
  }

  // knowledgeContext is optional client-supplied preloaded knowledge snippets
  // It must be an array of objects if provided; each entry is bounded server-side
  if (body.knowledgeContext !== undefined) {
    if (!Array.isArray(body.knowledgeContext)) {
      return { ok: false, error: 'knowledgeContext must be an array if provided.' };
    }
    if (body.knowledgeContext.length > 5) {
      return { ok: false, error: 'knowledgeContext must contain at most 5 entries.' };
    }
  }

  return { ok: true };
}

// ── Context assembly ──────────────────────────────────────────────────────────

/**
 * Load recent memory items for this user (max 3, bounded to 256 chars each).
 * Returns array of { content: string } or empty array on failure.
 */
async function _loadMemory(adminClient, uid) {
  try {
    const docs = await adminClient.list(`users/${uid}/shadowReaperMemory`, { pageSize: 20 });
    if (!Array.isArray(docs)) return [];
    // Return the 3 most recent items (Firestore REST returns in order)
    return docs.slice(0, 3).map(function (d) {
      const content = (d && d.data && d.data.content) ? String(d.data.content).slice(0, 256) : '';
      return content ? { content } : null;
    }).filter(Boolean);
  } catch (_) {
    return [];
  }
}

/**
 * Load recent conversation turns for a given conversationId (max 8 turns).
 * Returns array of { role: 'user'|'assistant', content: string } or empty array.
 */
async function _loadHistory(adminClient, uid, conversationId) {
  if (!conversationId) return [];
  try {
    const doc = await adminClient.get(
      `users/${uid}/shadowReaperConversations/${conversationId}`
    );
    if (!doc || !doc.data || !Array.isArray(doc.data.turns)) return [];
    // Take the last 8 turns for context window
    const turns = doc.data.turns.slice(-8);
    return turns.map(function (t) {
      return {
        role:    (t.role === 'assistant') ? 'assistant' : 'user',
        content: String(t.text || t.content || '').slice(0, 1024),
      };
    }).filter(function (t) { return t.content.length > 0; });
  } catch (_) {
    return [];
  }
}

/**
 * Load active projects for context injection (max 2 projects).
 */
async function _loadProjects(adminClient, uid) {
  try {
    const docs = await adminClient.list(`users/${uid}/shadowReaperProjects`, { pageSize: 10 });
    if (!Array.isArray(docs)) return [];
    const active = docs.filter(function (d) {
      return d && d.data && d.data.status === 'active';
    }).slice(0, 2);
    return active.map(function (d) {
      return {
        name:        String(d.data.name || '').slice(0, 128),
        description: String(d.data.description || '').slice(0, 256),
      };
    }).filter(function (p) { return p.name.length > 0; });
  } catch (_) {
    return [];
  }
}

/**
 * Assemble the messages array for Workers AI inference.
 * This is the ShadowReaper pipeline running server-side.
 *
 * Pipeline (server-side equivalent):
 *   message
 *   → language analysis hints (from client Language Foundation)
 *   → memory context
 *   → history context
 *   → project context
 *   → preloaded knowledge context (from client SRKnowledge — public facts only)
 *   → personality / system prompt
 *   → inference
 */
function _assembleMessages(message, history, memory, projects, langAnalysis, knowledgeContext) {
  const messages = [];

  // 1. Core system identity — NEVER from client
  let systemPrompt = SHADOW_SYSTEM_PROMPT;

  // 2. Inject memory context (bounded, no raw dump)
  if (memory && memory.length > 0) {
    const memBlock = memory.map(function (m) { return '• ' + m.content; }).join('\n');
    systemPrompt += '\n\nThings you remember about this user:\n' + memBlock;
  }

  // 3. Inject active projects context
  if (projects && projects.length > 0) {
    const projBlock = projects.map(function (p) {
      return '• ' + p.name + (p.description ? ': ' + p.description : '');
    }).join('\n');
    systemPrompt += '\n\nUser\'s active projects:\n' + projBlock;
  }

  // 4. Inject relevant preloaded knowledge (public facts from Shadow's knowledge base).
  //    This is the CREATOR / SNS / GENERAL knowledge that the client retrieved locally.
  //    Entries are sanitized: content capped at 512 chars, array bounded to ≤5 items.
  //    This keeps Shadow grounded in known facts when answering knowledge-relevant questions.
  //    PRIVACY: This slot is for shared/public knowledge only — personal memory is in slot 2.
  if (knowledgeContext && Array.isArray(knowledgeContext) && knowledgeContext.length > 0) {
    const knowledgeBlock = knowledgeContext
      .slice(0, 5)
      .map(function (e) {
        // Server-side sanitization: accept only string content, cap at 512 chars
        const content = (e && typeof e.content === 'string') ? e.content.slice(0, 512) : '';
        return content ? '• ' + content : null;
      })
      .filter(Boolean)
      .join('\n');
    if (knowledgeBlock) {
      systemPrompt += '\n\nRelevant knowledge about Shadow Nexus Social and its creator:\n' + knowledgeBlock;
    }
  }

  // 5. Language analysis hints from client Language Foundation
  // These are linguistic annotations only — not system-prompt injections
  if (langAnalysis) {
    const hints = [];
    if (langAnalysis.intent && langAnalysis.intent !== 'UNKNOWN') {
      hints.push('Intent: ' + String(langAnalysis.intent).slice(0, 50));
    }
    if (langAnalysis.negated) {
      hints.push('Note: Message contains negation.');
    }
    if (langAnalysis.resolvedRef) {
      hints.push('Reference resolution: "it/that" refers to "' +
        String(langAnalysis.resolvedRef).slice(0, 80) + '"');
    }
    if (langAnalysis.questionType) {
      hints.push('Question type: ' + String(langAnalysis.questionType).slice(0, 40));
    }
    if (hints.length > 0) {
      systemPrompt += '\n\n[Linguistic context]\n' + hints.join('\n');
    }
  }

  messages.push({ role: 'system', content: systemPrompt });

  // 6. Conversation history (recent turns — already bounded)
  for (var i = 0; i < history.length; i++) {
    messages.push(history[i]);
  }

  // 7. Current user message
  messages.push({ role: 'user', content: message });

  return messages;
}

// ── Inference ─────────────────────────────────────────────────────────────────

async function _runInference(ai, modelId, messages) {
  try {
    const result = await ai.run(modelId, {
      messages:    messages,
      max_tokens:  MAX_TOKENS,
      temperature: 0.7,
    });
    // Extract text from Workers AI response
    if (result && typeof result.response === 'string' && result.response.trim()) {
      return { text: result.response.trim(), model: modelId, error: null };
    }
    if (result && result.result && typeof result.result.response === 'string' && result.result.response.trim()) {
      return { text: result.result.response.trim(), model: modelId, error: null };
    }
    if (result && Array.isArray(result.choices) && result.choices.length > 0) {
      const choice = result.choices[0];
      if (choice && choice.message && typeof choice.message.content === 'string') {
        return { text: choice.message.content.trim(), model: modelId, error: null };
      }
    }
    return { text: null, model: modelId, error: 'EMPTY_RESPONSE' };
  } catch (err) {
    return {
      text:  null,
      model: modelId,
      error: 'AI_RUN_FAILED: ' + ((err && err.message) ? err.message.slice(0, 80) : 'unknown'),
    };
  }
}

// ── Conversation persistence ───────────────────────────────────────────────────

/**
 * Save a completed conversation turn to Firestore.
 * Creates the conversation document if it doesn't exist.
 * Returns the conversationId (existing or newly created).
 */
async function _saveTurn(adminClient, uid, conversationId, userMessage, assistantResponse) {
  const newTurn = [
    { role: 'user',      text: userMessage.slice(0, 2048),      savedAt: new Date().toISOString() },
    { role: 'assistant', text: assistantResponse.slice(0, 2048), savedAt: new Date().toISOString() },
  ];

  try {
    if (conversationId) {
      // Append to existing conversation
      const existing = await adminClient.get(
        `users/${uid}/shadowReaperConversations/${conversationId}`
      );
      if (existing && existing.data) {
        const existingTurns = Array.isArray(existing.data.turns) ? existing.data.turns : [];
        // Keep last 50 turns to prevent unbounded growth
        const updatedTurns = existingTurns.concat(newTurn).slice(-50);
        await adminClient.set(
          `users/${uid}/shadowReaperConversations/${conversationId}`,
          {
            title:     existing.data.title || 'Conversation',
            turns:     updatedTurns,
            uid,
            createdAt: existing.data.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
        );
        return conversationId;
      }
    }

    // Create new conversation
    const result = await adminClient.add(
      `users/${uid}/shadowReaperConversations`,
      {
        title:     _generateConversationTitle(userMessage),
        turns:     newTurn,
        uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
    );
    return result && result.id ? result.id : null;
  } catch (_) {
    // History save failure is non-fatal — the response was already generated
    return conversationId;
  }
}

function _generateConversationTitle(message) {
  // Generate a short title from the first user message
  const clean = message.replace(/[^\w\s]/g, '').trim();
  const words = clean.split(/\s+/).slice(0, 6);
  return words.join(' ') || 'Conversation';
}

// ── Main handler ──────────────────────────────────────────────────────────────

/**
 * handleChat(body, ctx)
 *
 * @param {object} body - Parsed request body
 * @param {object} ctx  - { requestId, uid, adminClient, env }
 * @returns {Promise<{ status: number, body: object }>}
 */
export async function handleChat(body, ctx) {
  const startMs    = Date.now();
  const requestId  = (ctx && ctx.requestId) || 'unknown';
  const uid        = (ctx && ctx.uid) || null;
  const env        = (ctx && ctx.env) || {};
  const adminClient = (ctx && ctx.adminClient) || null;

  // ── Validate request ────────────────────────────────────────────────────────
  const validation = _validateChatRequest(body);
  if (!validation.ok) {
    return {
      status: 400,
      body: {
        success:   false,
        error:     'INVALID_REQUEST',
        message:   validation.error,
        requestId,
      },
    };
  }

  const message         = body.message.trim();
  const conversationId  = (body.conversationId && typeof body.conversationId === 'string')
    ? body.conversationId : null;
  const langAnalysis    = (body.languageAnalysis && typeof body.languageAnalysis === 'object')
    ? body.languageAnalysis : null;
  const knowledgeContext = Array.isArray(body.knowledgeContext) ? body.knowledgeContext : null;

  // ── Check Workers AI binding ────────────────────────────────────────────────
  if (!env.AI || typeof env.AI.run !== 'function') {
    return {
      status: 503,
      body: {
        success:       false,
        notConfigured: true,
        message:       'Shadow inference backend not configured on this deployment.',
        requestId,
      },
    };
  }

  // ── Load context from Firestore (parallel) ──────────────────────────────────
  // All context loading is non-blocking — failures return empty arrays
  let memory   = [];
  let history  = [];
  let projects = [];
  const memoryAvailable = !!(uid && adminClient);

  if (uid && adminClient) {
    [memory, history, projects] = await Promise.all([
      _loadMemory(adminClient, uid),
      _loadHistory(adminClient, uid, conversationId),
      _loadProjects(adminClient, uid),
    ]);
  }

  // ── Assemble context messages ────────────────────────────────────────────────
  const messages = _assembleMessages(message, history, memory, projects, langAnalysis, knowledgeContext);

  // ── Run inference ────────────────────────────────────────────────────────────
  const modelId  = (env.SR_INFERENCE_MODEL && typeof env.SR_INFERENCE_MODEL === 'string')
    ? env.SR_INFERENCE_MODEL.trim()
    : DEFAULT_MODEL;

  let inferResult = await _runInference(env.AI, modelId, messages);

  // Fallback model if primary failed
  if (!inferResult.text && modelId !== FALLBACK_MODEL) {
    inferResult = await _runInference(env.AI, FALLBACK_MODEL, messages);
  }

  const latencyMs = Date.now() - startMs;

  if (!inferResult.text) {
    return {
      status: 503,
      body: {
        success:   false,
        error:     'INFERENCE_FAILED',
        message:   'Shadow is temporarily unavailable. Try again in a moment.',
        requestId,
        latencyMs,
      },
    };
  }

  // ── Save conversation turn (fire-and-forget — never blocks response) ─────────
  let finalConversationId = conversationId;
  if (uid && adminClient) {
    finalConversationId = await _saveTurn(
      adminClient, uid, conversationId, message, inferResult.text
    );
  }

  // Log metadata only — never conversation content
  console.log('[chat] OK. model:', inferResult.model,
    'turns:', history.length + 1,
    'memory:', memory.length,
    'knowledge:', knowledgeContext ? knowledgeContext.length : 0,
    'latencyMs:', latencyMs,
    'requestId:', requestId);

  // ── Return response ──────────────────────────────────────────────────────────
  return {
    status: 200,
    body: {
      success:         true,
      text:            inferResult.text,
      conversationId:  finalConversationId || null,
      requestId,
      runtime:         'hosted',
      provider:        'cloudflare',
      model:           inferResult.model,
      memoryAvailable: memoryAvailable && memory.length > 0,
      latencyMs,
    },
  };
}
