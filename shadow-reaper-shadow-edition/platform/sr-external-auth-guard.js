/**
 * shadow-reaper-standalone/platform/sr-external-auth-guard.js
 * Shadow Reaper — External Communication Authorization Guard
 *
 * Build: SR-V2-EXT-AUTH-GUARD-1
 *
 * Exposes: window.SRExternalAuthGuard
 *
 * PURPOSE:
 *   Prevents Shadow from autonomously initiating external communications
 *   or performing sensitive actions without explicit owner authorization.
 *
 *   Shadow's adaptive learning MUST NOT independently decide that Shadow
 *   should contact somebody. External actions require explicit authorization
 *   or deliberately configured rules.
 *
 * PROTECTED ACTIONS (never auto-initiated):
 *   - External calls or messages to contacts
 *   - Financial transactions or money transfer instructions
 *   - Revealing passwords, credentials, or private info
 *   - Making legal commitments
 *   - Impersonating the owner
 *   - Performing identity verification as the owner
 *   - Disclosing credentials to external parties
 *
 * AUTHORIZATION LEVELS:
 *   NONE        — action blocked, no path to authorization
 *   EXPLICIT    — requires active owner confirmation in this session
 *   CONFIGURED  — owner has pre-authorized this specific pattern (persisted rule)
 *
 * ZERO EXTERNAL AI CALLS. ZERO POLLING. ZERO setInterval.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-V2-EXT-AUTH-GUARD-1';

  // ─── Authorization level codes ────────────────────────────────────────────

  var AUTH_LEVEL = {
    NONE:       'NONE',
    EXPLICIT:   'EXPLICIT',
    CONFIGURED: 'CONFIGURED',
  };

  // ─── Sensitive action categories ─────────────────────────────────────────
  //
  // These actions require explicit owner authorization before Shadow executes them.
  // The guard checks these before allowing any external-facing action.

  var SENSITIVE_CATEGORIES = {
    // Communications
    external_call:      { level: AUTH_LEVEL.EXPLICIT,   description: 'Initiate or conduct a phone call' },
    external_message:   { level: AUTH_LEVEL.EXPLICIT,   description: 'Send a message to a contact' },
    external_email:     { level: AUTH_LEVEL.EXPLICIT,   description: 'Send an email' },

    // Financial
    financial_transfer: { level: AUTH_LEVEL.NONE,        description: 'Transfer money or financial instruction' },
    financial_commit:   { level: AUTH_LEVEL.NONE,        description: 'Make financial commitment or purchase' },

    // Private data
    reveal_credentials: { level: AUTH_LEVEL.NONE,        description: 'Reveal passwords or credentials' },
    reveal_private_info:{ level: AUTH_LEVEL.NONE,        description: 'Reveal owner private information' },
    reveal_contacts:    { level: AUTH_LEVEL.EXPLICIT,   description: 'Share contact details with external party' },

    // Identity
    impersonate_owner:  { level: AUTH_LEVEL.NONE,        description: 'Claim to be the owner or act as them' },
    identity_verify:    { level: AUTH_LEVEL.NONE,        description: 'Perform identity verification as the owner' },
    legal_commitment:   { level: AUTH_LEVEL.NONE,        description: 'Make legal commitments or agreements' },

    // Device
    device_action_external: { level: AUTH_LEVEL.EXPLICIT, description: 'Execute device action on behalf of external caller' },
  };

  // ─── Session-scoped explicit authorizations ───────────────────────────────
  // Owner grants these in the current session. They expire when the session ends.

  var _sessionAuthorizations = {};  // { action_key: { grantedAt, context } }

  // ─── Configured rules (persisted) ────────────────────────────────────────
  // Pre-authorized recurring patterns. Owner must deliberately configure these.
  // Example: "Call John when I say I'm running late"

  var _configuredRules = [];  // [{ id, description, pattern, action, authorizedAt }]

  // ─── Check if action is auto-allowed ─────────────────────────────────────

  function isAutoBlocked(category) {
    var cat = SENSITIVE_CATEGORIES[category];
    if (!cat) return false;
    return cat.level === AUTH_LEVEL.NONE;
  }

  // ─── Check authorization ──────────────────────────────────────────────────

  function isAuthorized(category, context) {
    var cat = SENSITIVE_CATEGORIES[category];
    if (!cat) {
      // Unknown category — allow (not a sensitive action)
      return { authorized: true, level: 'UNKNOWN_CATEGORY' };
    }

    if (cat.level === AUTH_LEVEL.NONE) {
      return {
        authorized: false,
        level:      AUTH_LEVEL.NONE,
        reason:     'PERMANENTLY_BLOCKED',
        message:    'This action is permanently protected: ' + cat.description,
      };
    }

    // Check session authorization
    if (_sessionAuthorizations[category]) {
      return {
        authorized: true,
        level:      AUTH_LEVEL.EXPLICIT,
        grantedAt:  _sessionAuthorizations[category].grantedAt,
      };
    }

    // Check configured rules
    if (cat.level === AUTH_LEVEL.CONFIGURED) {
      var matchingRule = _findMatchingRule(category, context);
      if (matchingRule) {
        return {
          authorized: true,
          level:      AUTH_LEVEL.CONFIGURED,
          ruleId:     matchingRule.id,
        };
      }
    }

    return {
      authorized: false,
      level:      cat.level,
      reason:     'EXPLICIT_AUTHORIZATION_REQUIRED',
      message:    'Owner must explicitly authorize: ' + cat.description,
    };
  }

  function _findMatchingRule(category, context) {
    for (var i = 0; i < _configuredRules.length; i++) {
      var rule = _configuredRules[i];
      if (rule.action === category && _ruleMatches(rule, context)) {
        return rule;
      }
    }
    return null;
  }

  function _ruleMatches(rule, context) {
    if (!rule.pattern || !context) return false;
    // Simple pattern matching — context is a plain text description
    var pattern = rule.pattern.toLowerCase();
    var ctx = String(context).toLowerCase();
    return ctx.indexOf(pattern) !== -1;
  }

  // ─── Grant session authorization ──────────────────────────────────────────
  // Owner explicitly says "yes, do this now"

  function grantSessionAuthorization(category, context) {
    if (isAutoBlocked(category)) {
      console.warn('[SRExternalAuthGuard] Cannot grant authorization for permanently blocked category:', category);
      return false;
    }
    _sessionAuthorizations[category] = {
      grantedAt: Date.now(),
      context:   context || null,
    };
    console.log('[SRExternalAuthGuard] Session authorization granted for:', category);
    return true;
  }

  // ─── Revoke session authorization ─────────────────────────────────────────

  function revokeSessionAuthorization(category) {
    delete _sessionAuthorizations[category];
  }

  function clearSessionAuthorizations() {
    _sessionAuthorizations = {};
  }

  // ─── Configure persistent rule ────────────────────────────────────────────

  function addConfiguredRule(rule) {
    if (!rule || !rule.action || !rule.pattern) return false;
    var existing = SENSITIVE_CATEGORIES[rule.action];
    if (!existing || existing.level === AUTH_LEVEL.NONE) {
      console.warn('[SRExternalAuthGuard] Cannot configure rule for protected/unknown action:', rule.action);
      return false;
    }
    _configuredRules.push({
      id:           'rule_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      description:  rule.description || rule.pattern,
      pattern:      rule.pattern,
      action:       rule.action,
      authorizedAt: Date.now(),
    });
    return true;
  }

  function removeConfiguredRule(ruleId) {
    _configuredRules = _configuredRules.filter(function (r) { return r.id !== ruleId; });
  }

  function listConfiguredRules() {
    return _configuredRules.slice();
  }

  // ─── Status ───────────────────────────────────────────────────────────────

  function getStatus() {
    return {
      build:                 BUILD_ID,
      sensitiveCategories:   Object.keys(SENSITIVE_CATEGORIES),
      sessionAuthorizations: Object.keys(_sessionAuthorizations),
      configuredRuleCount:   _configuredRules.length,
    };
  }

  // ─── Expose ───────────────────────────────────────────────────────────────

  global.SRExternalAuthGuard = {
    build:                   BUILD_ID,
    AUTH_LEVEL:              AUTH_LEVEL,
    SENSITIVE_CATEGORIES:    SENSITIVE_CATEGORIES,

    // Authorization checks
    isAutoBlocked:           isAutoBlocked,
    isAuthorized:            isAuthorized,

    // Session authorization
    grantSessionAuthorization:  grantSessionAuthorization,
    revokeSessionAuthorization: revokeSessionAuthorization,
    clearSessionAuthorizations: clearSessionAuthorizations,

    // Configured rules
    addConfiguredRule:       addConfiguredRule,
    removeConfiguredRule:    removeConfiguredRule,
    listConfiguredRules:     listConfiguredRules,

    // Status
    getStatus:               getStatus,
  };

}(typeof window !== 'undefined' ? window : global));
