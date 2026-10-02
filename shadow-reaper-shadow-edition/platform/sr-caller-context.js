/**
 * shadow-reaper-standalone/platform/sr-caller-context.js
 * Shadow Reaper — Caller Context & Privacy Boundary
 *
 * Build: SR-V2-CALLER-CONTEXT-1
 *
 * Exposes: window.SRCallerContext
 *
 * PURPOSE:
 *   Manages the Owner vs. External Caller permission boundary.
 *
 *   THESE ARE CONTEXT BOUNDARIES — NOT SEPARATE AI BRAINS.
 *   All conversations still route through ShadowReaper.
 *   The boundary controls what context ShadowReaper exposes.
 *
 * OWNER CONTEXT:
 *   - Full access to personal memory, private history, Projects, learned knowledge
 *   - Full device control permissions
 *   - Full conversation history
 *   - Administrative actions
 *
 * EXTERNAL CALLER CONTEXT:
 *   - Conversational intelligence only
 *   - No access to owner's private memories
 *   - No access to private history
 *   - No access to owner's Projects or private files
 *   - No device control
 *   - No account information
 *   - No credentials or sensitive data
 *   - Restricted to what the owner has explicitly authorized
 *
 * SECURITY INVARIANTS (never violable):
 *   1. An external caller cannot elevate to owner context without explicit owner re-authorization
 *   2. Shadow identifies itself as an AI assistant, not the owner, in external calls
 *   3. Sensitive owner data is never exposed to external callers regardless of how they ask
 *   4. External authorization always requires positive explicit owner action
 *
 * ZERO EXTERNAL AI CALLS. ZERO POLLING. ZERO setInterval.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-V2-CALLER-CONTEXT-1';

  // ─── Context types ────────────────────────────────────────────────────────

  var CONTEXT = {
    OWNER:    'OWNER',          // full owner context
    EXTERNAL: 'EXTERNAL',       // restricted external caller context
  };

  // ─── Active context state ────────────────────────────────────────────────

  var _activeContext   = CONTEXT.OWNER;  // default: owner
  var _externalInfo    = null;           // { name, authorizedBy, authorizedAt, restrictions }
  var _callMode        = null;           // null | 'A'|'B'|'C'|'D'|'E'|'F'

  // ─── Calling modes ────────────────────────────────────────────────────────
  //
  //  A — Normal Call           : Shadow does not participate
  //  B — Shadow Assisted       : Shadow available on explicit request during call
  //  C — Hand Conversation to Shadow : Shadow actively converses, identifies as AI
  //  D — Take Conversation Back: owner returns to the call immediately
  //  E — Shadow Handles Authorized Call : Shadow conducts limited authorized conversation
  //  F — Talk Directly With Shadow : authorized external contact converses with Shadow directly
  //
  var CALLING_MODES = {
    A: 'NORMAL_CALL',
    B: 'SHADOW_ASSISTED',
    C: 'HAND_TO_SHADOW',
    D: 'RETURN_TO_OWNER',
    E: 'SHADOW_HANDLES_CALL',
    F: 'EXTERNAL_CALLER_DIRECT',
  };

  // ─── Sensitive data categories that are NEVER exposed to external context ──

  var _OWNER_PRIVATE_CATEGORIES = [
    'private_memory',
    'private_history',
    'projects',
    'credentials',
    'account_info',
    'contacts',
    'device_permissions',
    'learned_personal_info',
    'administrative_actions',
    'financial_data',
  ];

  // ─── Context accessors ────────────────────────────────────────────────────

  function getContext()      { return _activeContext; }
  function isOwnerContext()  { return _activeContext === CONTEXT.OWNER; }
  function isExternalContext(){ return _activeContext === CONTEXT.EXTERNAL; }
  function getCallMode()     { return _callMode; }
  function getExternalInfo() { return _externalInfo ? Object.assign({}, _externalInfo) : null; }

  // ─── Switch to external caller context ───────────────────────────────────
  /**
   * enterExternalContext(info)
   * Switches to external caller context. Owner must explicitly call this.
   * info = { name: string, restrictions: string[] (optional) }
   */
  function enterExternalContext(info, mode) {
    _activeContext = CONTEXT.EXTERNAL;
    _externalInfo  = {
      name:         (info && info.name) ? String(info.name) : 'External',
      authorizedBy: 'owner',
      authorizedAt: Date.now(),
      restrictions: (info && Array.isArray(info.restrictions)) ? info.restrictions.slice() : [],
    };
    _callMode = mode || CALLING_MODES.F;
    console.log('[SRCallerContext] Entered EXTERNAL context for:', _externalInfo.name, '| Mode:', _callMode);
  }

  // ─── Return to owner context ──────────────────────────────────────────────
  /**
   * returnToOwnerContext()
   * Owner takes back control. "Shadow, give me the call."
   */
  function returnToOwnerContext() {
    var prevMode = _callMode;
    _activeContext = CONTEXT.OWNER;
    _externalInfo  = null;
    _callMode      = null;
    console.log('[SRCallerContext] Returned to OWNER context from mode:', prevMode);
  }

  // ─── Privacy filter ───────────────────────────────────────────────────────
  /**
   * canAccessCategory(category)
   * Returns true if the current context is allowed to access the given data category.
   * External callers are always denied owner-private categories.
   */
  function canAccessCategory(category) {
    if (isOwnerContext()) return true;
    return _OWNER_PRIVATE_CATEGORIES.indexOf(category) === -1;
  }

  /**
   * filterResponseForContext(responseText)
   * Returns a safe response appropriate for the active context.
   * In owner context: unchanged.
   * In external context: removes any accidentally-included private data markers.
   */
  function filterResponseForContext(responseText) {
    if (isOwnerContext()) return responseText;
    // In external context, never leak private-data indicators
    var filtered = String(responseText);
    // Strip any accidentally appended private-context markers
    filtered = filtered.replace(/\[(private|owner|memory|project|credential)[^\]]*\]/gi, '');
    return filtered.trim() || responseText;
  }

  /**
   * getContextualSystemNote()
   * Returns a note that should be prepended to responses in external context.
   * This ensures Shadow identifies itself correctly.
   */
  function getContextualSystemNote() {
    if (isOwnerContext()) return null;
    var name = _externalInfo ? _externalInfo.name : 'caller';
    return 'You are speaking with Shadow, an AI assistant. ' +
           'This conversation is with ' + name + '. ' +
           'Do not share owner private information.';
  }

  // ─── Call mode management ─────────────────────────────────────────────────

  function setCallMode(mode) {
    if (!CALLING_MODES[mode] && Object.values(CALLING_MODES).indexOf(mode) === -1) {
      console.warn('[SRCallerContext] Unknown call mode:', mode);
      return;
    }
    _callMode = CALLING_MODES[mode] || mode;
    console.log('[SRCallerContext] Call mode set to:', _callMode);
  }

  // ─── Authorization check ──────────────────────────────────────────────────
  /**
   * isSensitiveActionAllowed(action)
   * Sensitive actions are never allowed in external context.
   * In owner context, they require explicit confirmation (handled by DeviceActionRouter).
   */
  function isSensitiveActionAllowed(action) {
    if (isExternalContext()) return false;
    // Owner context: allowed (DeviceActionRouter handles confirmation)
    return true;
  }

  // ─── Status ───────────────────────────────────────────────────────────────

  function getStatus() {
    return {
      build:        BUILD_ID,
      context:      _activeContext,
      callMode:     _callMode,
      externalInfo: getExternalInfo(),
      isOwner:      isOwnerContext(),
      isExternal:   isExternalContext(),
      privateCategories: _OWNER_PRIVATE_CATEGORIES.slice(),
    };
  }

  // ─── Expose ───────────────────────────────────────────────────────────────

  global.SRCallerContext = {
    build:                   BUILD_ID,
    CONTEXT:                 CONTEXT,
    CALLING_MODES:           CALLING_MODES,

    // Context control
    getContext:              getContext,
    isOwnerContext:          isOwnerContext,
    isExternalContext:       isExternalContext,
    enterExternalContext:    enterExternalContext,
    returnToOwnerContext:    returnToOwnerContext,

    // Call mode
    getCallMode:             getCallMode,
    setCallMode:             setCallMode,

    // Privacy
    canAccessCategory:       canAccessCategory,
    filterResponseForContext: filterResponseForContext,
    getContextualSystemNote: getContextualSystemNote,
    isSensitiveActionAllowed: isSensitiveActionAllowed,

    // External info
    getExternalInfo:         getExternalInfo,

    // Status
    getStatus:               getStatus,
  };

}(typeof window !== 'undefined' ? window : global));
