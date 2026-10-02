/**
 * shadow-reaper-v2/api/v1/lib/command-schema.js
 * Shadow Reaper API v1 — Engine Command Allowlist & Schema
 *
 * Build: SR-API-V1-1
 * Schema Version: 1.0
 *
 * CRITICAL RULES:
 *   1. Shadow Reaper INTERPRETS commands. It does NOT execute them.
 *   2. The 24-Hour Engine is the sole executor.
 *   3. This file defines INTENT NAMES only — not execution logic.
 *   4. The API must NEVER return shell commands, FFmpeg strings,
 *      arbitrary JavaScript, Python, SQL, or terminal commands.
 *   5. Only allowlisted intents may appear in EngineCommandResponse.
 *
 * VERSIONING:
 *   This file is versioned (SCHEMA_VERSION).
 *   When the 24-Hour Engine adapter is built, pin it to a version.
 *   Bump SCHEMA_VERSION for breaking changes.
 *   Add new intents without breaking existing ones.
 */

'use strict';

var SCHEMA_VERSION = '1.0';

// ── Allowlisted engine intent names ─────────────────────────────────────────

var ALLOWED_INTENTS = [
  // ── Playback control ──────────────────────────────────────────────────────
  'PLAY_MEDIA',
  'PAUSE_MEDIA',
  'RESUME_MEDIA',
  'STOP_MEDIA',
  'NEXT_ITEM',
  'PREVIOUS_ITEM',
  'RESTART_ITEM',

  // ── Queue management ──────────────────────────────────────────────────────
  'QUEUE_MEDIA',
  'REMOVE_QUEUE_ITEM',
  'MOVE_QUEUE_ITEM',
  'QUEUE_PLAYLIST',
  'START_PLAYLIST',

  // ── Status / information retrieval ────────────────────────────────────────
  'GET_NOW_PLAYING',
  'GET_QUEUE',
  'GET_SCHEDULE',
  'GET_STATUS',

  // ── Schedule management ───────────────────────────────────────────────────
  'SCHEDULE_PROGRAM',
  'UPDATE_PROGRAM',
  'REMOVE_PROGRAM',
];

var ALLOWED_INTENTS_SET = new Set(ALLOWED_INTENTS);

// ── Timing / position values ─────────────────────────────────────────────────

var TIMING_VALUES = new Set([
  'NOW',
  'NEXT',
  'AFTER_CURRENT',
  'AFTER_CURRENT_PROGRAM',
  'AT_END_OF_QUEUE',
  'SCHEDULED',
]);

// ── Confidence thresholds ────────────────────────────────────────────────────

var CONFIDENCE = {
  HIGH:                  0.80,   // Structured command returned
  REQUIRES_CLARIFICATION: 0.50,  // Likely intent, ask for clarification
  REJECT:                 0.00,  // Below this → UNKNOWN_INTENT
};

/**
 * Check if an intent name is in the allowlist.
 * @param {string} intent
 * @returns {boolean}
 */
function isAllowedIntent(intent) {
  return ALLOWED_INTENTS_SET.has(intent);
}

/**
 * Validate a proposed EngineCommandResponse before it leaves the API.
 *
 * Rejects:
 *   - Non-allowlisted intents
 *   - Shell command strings in parameters
 *   - Executable code in any string field
 *
 * @param {{ intent, parameters?, confidence, requiresClarification }} result
 * @returns {{ ok: boolean, reason?: string }}
 */
function validateCommandResult(result) {
  if (!result || typeof result !== 'object') {
    return { ok: false, reason: 'Command result must be an object.' };
  }

  if (!isAllowedIntent(result.intent)) {
    // Intent may be UNKNOWN_INTENT (for low confidence / unrecognized)
    if (result.intent !== 'UNKNOWN_INTENT') {
      return { ok: false, reason: 'Intent "' + result.intent + '" is not in the allowlist.' };
    }
  }

  // Check parameters for dangerous content
  if (result.parameters && typeof result.parameters === 'object') {
    var paramJson = JSON.stringify(result.parameters);
    if (_containsExecutablePattern(paramJson)) {
      return { ok: false, reason: 'Parameters contain potentially executable content.' };
    }
  }

  // Ensure confidence is a number between 0 and 1
  if (typeof result.confidence !== 'number' || result.confidence < 0 || result.confidence > 1) {
    return { ok: false, reason: 'Confidence must be a number between 0 and 1.' };
  }

  return { ok: true };
}

/**
 * Detect patterns that suggest shell commands / arbitrary executable content
 * in a string. Used to guard parameters before returning them.
 *
 * @param {string} s
 * @returns {boolean}
 */
function _containsExecutablePattern(s) {
  if (typeof s !== 'string') return false;
  // Shell command indicators
  if (/ffmpeg\s+/i.test(s))       return true;
  if (/;\s*(rm|ls|cat|echo|sudo|chmod|chown)\b/i.test(s)) return true;
  if (/`[^`]+`/.test(s))          return true;   // backtick execution
  if (/\$\([^)]+\)/.test(s))      return true;   // $(command)
  if (/eval\s*\(/.test(s))        return true;
  if (/new\s+Function\s*\(/.test(s)) return true;
  if (/require\s*\(\s*['"]child_process/.test(s)) return true;
  return false;
}

module.exports = {
  SCHEMA_VERSION:       SCHEMA_VERSION,
  ALLOWED_INTENTS:      ALLOWED_INTENTS,
  TIMING_VALUES:        TIMING_VALUES,
  CONFIDENCE:           CONFIDENCE,
  isAllowedIntent:      isAllowedIntent,
  validateCommandResult: validateCommandResult,
};
