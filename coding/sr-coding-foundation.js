/**
 * shadow-reaper-v2/coding/sr-coding-foundation.js
 * Shadow Reaper — Coding Foundation
 *
 * Build: SR-CODING-FOUNDATION-1
 *
 * Exposes: window.SRCodingFoundation
 *
 * PURPOSE:
 *   First-class software development knowledge for Shadow.
 *   Shadow understands programming CONCEPTUALLY — not as canned per-error answers.
 *
 * KNOWLEDGE STRUCTURE:
 *   - Language constructs (per language)
 *   - Core concepts (variables, functions, async, promises, DOM, etc.)
 *   - Common error patterns → diagnosis reasoning
 *   - Architecture patterns (REST, service workers, PWA, auth, caching, etc.)
 *   - Debugging approaches
 *   - Code explanation (trace, identify bugs, suggest patches)
 *   - Project structure awareness (FILES → MODULES → FUNCTIONS → ROUTES → DATA)
 *
 * LANGUAGES SUPPORTED:
 *   HTML, CSS, JavaScript, JSON, HTTP/REST, Git, GitHub, Firebase,
 *   Cloudflare Workers, Service Workers, PWAs, Node.js, SQL basics, Python basics
 *
 * DESIGN RULES:
 *   - Zero canned per-question answers.
 *   - Knowledge is STRUCTURED and COMPOSITIONAL — not a if/else chain.
 *   - explain() builds answers from concepts, not from stored sentences.
 *   - Zero external AI calls.
 *   - No hard-coded answers for specific error messages.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-CODING-FOUNDATION-1';

  // ─── Language knowledge bank ──────────────────────────────────────────────
  // Each entry: { name, paradigm, paradigm_description, key_concepts, common_uses, ecosystem, notes }
  // Deliberately concept-level, not syntax-reference.

  var LANGUAGES = {
    javascript: {
      name: 'JavaScript',
      paradigm: 'multi-paradigm',
      paradigm_description: 'Supports object-oriented, functional, and event-driven styles.',
      key_concepts: ['variables', 'functions', 'objects', 'arrays', 'closures', 'prototypes',
                     'async/await', 'promises', 'events', 'DOM manipulation', 'modules',
                     'error handling', 'scope', 'hoisting', 'this binding'],
      common_uses: ['web frontend', 'Node.js backend', 'service workers', 'PWAs', 'automation'],
      ecosystem: 'npm, Node.js, Webpack, Vite, React, Vue, Express',
      notes: 'Single-threaded event loop. Asynchronous operations via callbacks, promises, or async/await.',
    },
    html: {
      name: 'HTML',
      paradigm: 'markup',
      paradigm_description: 'Describes the structure and content of web pages.',
      key_concepts: ['elements', 'attributes', 'semantic markup', 'forms', 'accessibility',
                     'DOM tree', 'meta tags', 'script/link tags', 'head vs body'],
      common_uses: ['web page structure', 'forms', 'accessibility', 'SEO structure'],
      ecosystem: 'CSS, JavaScript, browser engines',
      notes: 'HTML5 introduced semantic elements (header, nav, article, section, aside, footer). Always use semantic markup for accessibility.',
    },
    css: {
      name: 'CSS',
      paradigm: 'stylesheet',
      paradigm_description: 'Controls the visual presentation of HTML elements.',
      key_concepts: ['selectors', 'specificity', 'box model', 'flexbox', 'grid', 'positioning',
                     'media queries', 'custom properties (variables)', 'animations', 'transforms',
                     'cascade', 'inheritance', 'pseudo-classes', 'pseudo-elements'],
      common_uses: ['layout', 'responsive design', 'animations', 'theming'],
      ecosystem: 'Sass, PostCSS, Tailwind, CSS Modules',
      notes: 'Specificity order: inline > id > class > element. Flexbox for 1D layouts; Grid for 2D layouts.',
    },
    python: {
      name: 'Python',
      paradigm: 'multi-paradigm',
      paradigm_description: 'Strong readability focus. Object-oriented, functional, and procedural styles.',
      key_concepts: ['indentation-based blocks', 'list comprehensions', 'generators', 'decorators',
                     'context managers', 'type hints', 'exceptions', 'modules', 'packages',
                     'dataclasses', 'async/await (asyncio)', 'duck typing'],
      common_uses: ['scripting', 'data science', 'machine learning', 'web backend (Flask/Django)', 'automation'],
      ecosystem: 'pip, virtualenv, conda, NumPy, Pandas, Flask, FastAPI, Django',
      notes: 'Python uses indentation for block scope. No semicolons. White-space significant.',
    },
    nodejs: {
      name: 'Node.js',
      paradigm: 'server-side JavaScript runtime',
      paradigm_description: 'Runs JavaScript on the server using the V8 engine with a non-blocking I/O model.',
      key_concepts: ['event loop', 'CommonJS modules (require/exports)', 'ES modules (import/export)',
                     'streams', 'buffers', 'child processes', 'HTTP server', 'file system (fs)',
                     'environment variables', 'package.json', 'npm scripts'],
      common_uses: ['REST APIs', 'real-time apps', 'CLI tools', 'build tools', 'serverless functions'],
      ecosystem: 'npm, Express, Fastify, NestJS, socket.io, Prisma',
      notes: 'Non-blocking I/O means many concurrent connections can be handled without threads. Event emitter pattern is central.',
    },
    git: {
      name: 'Git',
      paradigm: 'version control system',
      paradigm_description: 'Distributed version control — every clone is a full repository.',
      key_concepts: ['commit', 'branch', 'merge', 'rebase', 'remote', 'clone', 'push', 'pull',
                     'fetch', 'stash', 'cherry-pick', 'staging area (index)', 'HEAD', 'detached HEAD',
                     'conflict resolution', '.gitignore'],
      common_uses: ['source code tracking', 'collaboration', 'CI/CD pipelines', 'code review'],
      ecosystem: 'GitHub, GitLab, Bitbucket, git hooks',
      notes: 'Never force-push to shared branches. Commit messages should be imperative mood and descriptive.',
    },
    http: {
      name: 'HTTP / REST',
      paradigm: 'application protocol / architectural style',
      paradigm_description: 'HTTP is the transfer protocol; REST defines how resources are accessed via HTTP.',
      key_concepts: ['methods (GET, POST, PUT, PATCH, DELETE)', 'status codes', 'headers',
                     'request body', 'response body', 'JSON API', 'authentication (Bearer, cookies)',
                     'CORS', 'rate limiting', 'caching (ETag, Cache-Control)', 'idempotency'],
      common_uses: ['web APIs', 'microservices', 'frontend-backend communication'],
      ecosystem: 'fetch, axios, Express, FastAPI, Cloudflare Workers',
      notes: '2xx = success, 3xx = redirect, 4xx = client error, 5xx = server error. REST state should be in resources, not the server.',
    },
    firebase: {
      name: 'Firebase',
      paradigm: 'BaaS (Backend as a Service)',
      paradigm_description: 'Google platform providing database, auth, hosting, storage, and cloud functions.',
      key_concepts: ['Firestore (NoSQL document DB)', 'Realtime Database', 'Authentication',
                     'Cloud Storage', 'Cloud Functions', 'security rules', 'onSnapshot listeners',
                     'batch writes', 'transactions', 'uid-scoped data access'],
      common_uses: ['real-time apps', 'user auth', 'serverless backend', 'mobile + web apps'],
      ecosystem: 'Firebase SDK, Firebase Admin SDK, Firestore, Firebase Hosting',
      notes: 'Firestore charges per read/write/delete — design data models to minimize operations. Security rules are evaluated server-side.',
    },
    cloudflare_workers: {
      name: 'Cloudflare Workers',
      paradigm: 'edge serverless runtime',
      paradigm_description: 'JavaScript/WASM functions running at Cloudflare edge locations globally.',
      key_concepts: ['fetch event handler', 'Request / Response API', 'KV (key-value store)',
                     'Durable Objects', 'R2 (object storage)', 'environment variables (env)',
                     'wrangler.toml configuration', 'routes', 'CORS headers', 'AI binding (env.AI)'],
      common_uses: ['API gateway', 'authentication proxy', 'edge caching', 'CDN customization', 'AI inference'],
      ecosystem: 'wrangler CLI, Miniflare, Cloudflare Pages',
      notes: 'Workers run in a V8 isolate — no Node.js APIs. Use env.AI for Workers AI inference. Wrangler deploys to edge.',
    },
    service_workers: {
      name: 'Service Workers',
      paradigm: 'browser background script',
      paradigm_description: 'JavaScript running in the background, separate from the web page.',
      key_concepts: ['install event', 'activate event', 'fetch event', 'cache API',
                     'cache-first strategy', 'network-first strategy', 'stale-while-revalidate',
                     'push notifications', 'background sync', 'skipWaiting', 'clients.claim'],
      common_uses: ['PWA offline support', 'caching strategies', 'push notifications', 'background sync'],
      ecosystem: 'Workbox, PWA Builder',
      notes: 'Service worker serves OLD cache until user closes ALL tabs. Call skipWaiting() + clients.claim() to activate immediately. Always version your cache names.',
    },
    sql: {
      name: 'SQL (basics)',
      paradigm: 'structured query language',
      paradigm_description: 'Declarative language for relational databases.',
      key_concepts: ['SELECT', 'FROM', 'WHERE', 'JOIN (INNER, LEFT, RIGHT)', 'GROUP BY',
                     'ORDER BY', 'INSERT', 'UPDATE', 'DELETE', 'indexes', 'primary key',
                     'foreign key', 'transactions', 'ACID properties'],
      common_uses: ['data queries', 'reporting', 'relational data modeling'],
      ecosystem: 'SQLite, PostgreSQL, MySQL, D1 (Cloudflare), Prisma',
      notes: 'Always use parameterized queries to prevent SQL injection. Index columns used in WHERE clauses frequently.',
    },
  };

  // ─── Core concept bank ────────────────────────────────────────────────────
  // Concept-level explanations used by explain() and the reasoning core.

  var CONCEPTS = {
    'async/await': {
      summary: 'Syntax for handling asynchronous operations in JavaScript that makes async code read like synchronous code.',
      how_it_works: 'async functions always return a Promise. await pauses execution of the async function until the Promise resolves, without blocking the event loop.',
      common_pitfalls: [
        'Forgetting to add await before a Promise expression silently drops the result.',
        'Using await inside forEach() does not work as expected — use for...of instead.',
        'Unhandled promise rejections: always use try/catch inside async functions.',
        'Parallel operations: use Promise.all() instead of sequential awaits for independent tasks.',
      ],
      example_pattern: 'async function fetchData() { try { const res = await fetch(url); const data = await res.json(); return data; } catch(err) { console.error(err); } }',
    },
    'promises': {
      summary: 'A Promise represents an eventual result (or failure) of an async operation. Has three states: pending, fulfilled, rejected.',
      how_it_works: 'Created with new Promise((resolve, reject) => {...}). Consumed with .then()/.catch()/.finally() or async/await.',
      common_pitfalls: [
        'Promise chaining: .then() returns a new Promise — chain is not re-entrant.',
        'Error swallowing: not adding .catch() means rejections are silently lost.',
        'Mixed sync/async: throwing inside a .then() is caught by the chain; throwing in a callback is not.',
      ],
    },
    'closures': {
      summary: 'A closure is a function that retains access to variables from its enclosing scope even after that scope has finished executing.',
      how_it_works: 'When a function is defined inside another function, the inner function captures a reference to the outer function\'s variables.',
      common_pitfalls: [
        'Loop closures: using var in a for loop creates one shared variable — use let or IIFE to capture per-iteration values.',
        'Memory leaks: closures holding large objects prevent garbage collection.',
      ],
    },
    'this binding': {
      summary: 'In JavaScript, the value of "this" depends on how a function is called, not where it is defined.',
      how_it_works: 'Arrow functions inherit "this" from their enclosing scope. Regular functions get "this" from the call site. bind(), call(), apply() set "this" explicitly.',
      common_pitfalls: [
        'Passing a method as a callback loses its "this" binding — bind it or use an arrow function.',
        'Arrow functions cannot be used as constructors (no "new").',
      ],
    },
    'event loop': {
      summary: 'JavaScript is single-threaded. The event loop allows async I/O by delegating I/O to the runtime and processing callbacks when the stack is empty.',
      how_it_works: 'Call stack → Web APIs → Callback queue → Microtask queue. Microtasks (Promises) are processed before the next macro-task (setTimeout, I/O).',
      common_pitfalls: [
        'Long synchronous operations block the event loop and freeze the UI.',
        'setTimeout(fn, 0) runs after all pending microtasks (Promises), not immediately.',
      ],
    },
    'dom': {
      summary: 'The Document Object Model is the browser\'s representation of the page as a tree of objects that JavaScript can read and modify.',
      how_it_works: 'document.getElementById/querySelector selects elements. .textContent/.innerHTML set content. .style sets CSS. addEventListener attaches events.',
      common_pitfalls: [
        'Accessing DOM before it is loaded: wait for DOMContentLoaded event or place scripts at bottom of body.',
        'innerHTML with untrusted input is an XSS vulnerability.',
        'Reflow/repaint: repeated DOM mutations in a loop are slow — batch them.',
      ],
    },
    'scope': {
      summary: 'Scope determines where variables are accessible. JavaScript has global, function, and block scope.',
      how_it_works: 'var is function-scoped (or global). let and const are block-scoped. Variables are looked up by walking up the scope chain.',
      common_pitfalls: [
        'Hoisting: var declarations are hoisted (moved to top of function), but not their values — accessing before assignment gives undefined.',
        'let/const are hoisted to the block but in a temporal dead zone — accessing before declaration throws ReferenceError.',
      ],
    },
    'service worker caching': {
      summary: 'Service workers intercept network requests and can serve cached responses — enabling offline functionality.',
      how_it_works: 'During install, pre-cache key assets. In the fetch event, check cache first (cache-first) or network first (network-first).',
      common_pitfalls: [
        'Serving stale JS: old cache continues to serve even after deployment unless the service worker is updated and activates.',
        'Version your cache names (e.g. cache-v2) and delete old caches in the activate event.',
        'Opaque responses (cross-origin fetches without CORS) use more quota and can cause issues.',
      ],
    },
    'cors': {
      summary: 'Cross-Origin Resource Sharing — browser security mechanism that restricts cross-origin HTTP requests.',
      how_it_works: 'Browsers block cross-origin requests unless the server sends appropriate Access-Control-Allow-Origin headers. Preflight OPTIONS requests check permissions for non-simple requests.',
      common_pitfalls: [
        'CORS is enforced by the BROWSER — server-to-server requests are not affected.',
        'Wildcard Access-Control-Allow-Origin (*) cannot be used with credentials.',
        'Always handle OPTIONS preflight responses on the server.',
      ],
    },
    'null vs undefined': {
      summary: 'undefined means a variable was declared but never assigned a value. null is an explicit assignment meaning "no value".',
      how_it_works: 'typeof undefined === "undefined". typeof null === "object" (historical quirk). Use === to distinguish them.',
      common_pitfalls: [
        'Checking for null with == catches both null and undefined (loose equality).',
        'Optional chaining (obj?.prop) safely accesses properties that might be null/undefined without throwing.',
      ],
    },
    'rest api': {
      summary: 'REST (Representational State Transfer) is an architectural style for designing networked applications using standard HTTP methods.',
      how_it_works: 'Resources are identified by URIs. GET retrieves, POST creates, PUT/PATCH updates, DELETE removes. Stateless — server holds no session state.',
      common_pitfalls: [
        'Using GET for operations that modify data violates REST semantics.',
        'Not returning appropriate HTTP status codes (200, 201, 400, 401, 403, 404, 409, 422, 500).',
        'Versioning: /api/v1/ prefix prevents breaking changes.',
      ],
    },
    'git branching': {
      summary: 'Git branches allow parallel lines of development. main/master holds production code; feature branches isolate changes.',
      how_it_works: 'git checkout -b feature/name creates a branch. git merge or git rebase integrates changes. git push origin branch-name pushes upstream.',
      common_pitfalls: [
        'Never force-push (--force) to shared branches — it rewrites history others have pulled.',
        'Long-lived branches diverge and produce large, risky merges — keep branches short-lived.',
        'Always pull before pushing to avoid conflicts.',
      ],
    },
    'authentication': {
      summary: 'Authentication verifies who a user is. Authorization determines what they can do.',
      how_it_works: 'Common patterns: session cookies (server stores session), JWT Bearer tokens (stateless, signed claims), OAuth (delegated auth via third party).',
      common_pitfalls: [
        'Storing tokens in localStorage exposes them to XSS attacks — httpOnly cookies are safer for session tokens.',
        'JWTs are signed but NOT encrypted by default — do not put sensitive data in the payload.',
        'Always validate tokens server-side — never trust the client.',
      ],
    },
  };

  // ─── Error pattern bank ───────────────────────────────────────────────────
  // Patterns: regex to match error text → diagnostic information.
  // This is a REASONING aid, not a lookup table of specific answers.

  var ERROR_PATTERNS = [
    {
      pattern: /cannot read prop(?:ert(?:y|ies))?(?:\s+['"`]?\w+['"`]?\s+of\s+(?:null|undefined)|\s+of\s+(?:null|undefined)|s\s+of\s+(?:null|undefined))/i,
      type: 'NullReferenceError',
      diagnosis: 'Attempting to access a property on a value that is null or undefined.',
      likely_causes: ['Variable not initialized', 'Async data not yet loaded', 'Missing null check before access', 'API returned null/undefined unexpectedly'],
      fix_approach: 'Add a null check (if (obj && obj.prop)) or use optional chaining (obj?.prop). Check where the value is set — it may be set asynchronously.',
    },
    {
      pattern: /(\w+) is not a function/i,
      type: 'TypeError: not a function',
      diagnosis: 'Attempting to call something as a function that is not actually a function.',
      likely_causes: ['Wrong variable name (typo)', 'Not imported correctly', '"this" binding lost', 'Overwritten by another variable', 'async function returning a non-function'],
      fix_approach: 'Log the value before calling it to confirm its type. Check import/export statements. Verify "this" binding if it is a method call.',
    },
    {
      pattern: /\w+ is not defined/i,
      type: 'ReferenceError',
      diagnosis: 'Referencing a variable or identifier that does not exist in the current scope.',
      likely_causes: ['Typo in variable name', 'Variable declared in a different scope', 'Missing import', 'Script loaded out of order', 'Using before declaration (temporal dead zone)'],
      fix_approach: 'Check spelling. Verify the import or require statement. Check that scripts load in the right order.',
    },
    {
      pattern: /unexpected token/i,
      type: 'SyntaxError',
      diagnosis: 'JavaScript parser encountered a token it did not expect — the code is not valid syntax.',
      likely_causes: ['Missing closing bracket/brace/paren', 'Extra comma', 'Using reserved word as identifier', 'Incorrect JSON format', 'Template literal not closed'],
      fix_approach: 'Check line number in the error. Look for mismatched brackets/braces/parens. Validate JSON with a linter.',
    },
    {
      pattern: /cors|cross.origin|access.control/i,
      type: 'CORS Error',
      diagnosis: 'Browser blocked a cross-origin request because the server did not include the required CORS headers.',
      likely_causes: ['Missing Access-Control-Allow-Origin header on server', 'Credentials sent without Access-Control-Allow-Credentials', 'OPTIONS preflight not handled'],
      fix_approach: 'Add CORS headers on the server for the requesting origin. Handle OPTIONS method. If using credentials, do not use wildcard (*) origin.',
    },
    {
      pattern: /maximum call stack/i,
      type: 'RangeError: Maximum call stack exceeded',
      diagnosis: 'Infinite recursion or an extremely deep call chain exhausted the call stack.',
      likely_causes: ['Function calling itself without a base case', 'Circular event listener chain', 'Accidentally recursive getter/setter'],
      fix_approach: 'Find the recursive function and add or fix the termination condition. Use a stack trace to identify the cycle.',
    },
    {
      pattern: /net::err_connection|fetch.*failed|network\s+error/i,
      type: 'Network Error',
      diagnosis: 'The fetch or network request could not be completed.',
      likely_causes: ['Server offline or wrong URL', 'CORS block', 'No internet connection', 'Firewall or proxy', 'HTTPS required but HTTP used'],
      fix_approach: 'Check the URL. Test the endpoint directly. Check browser network tab for more details. Verify HTTPS is used if required.',
    },
    {
      pattern: /promise rejection|unhandledpromiserejection/i,
      type: 'UnhandledPromiseRejection',
      diagnosis: 'A Promise was rejected but no .catch() handler or try/catch was present to handle it.',
      likely_causes: ['Missing try/catch inside async function', 'Missing .catch() on Promise chain', 'Error thrown in .then() not caught'],
      fix_approach: 'Add try/catch around await expressions. Add .catch() to all Promise chains. Consider a global unhandledRejection handler for diagnostics.',
    },
  ];

  // ─── Architecture patterns ────────────────────────────────────────────────

  var ARCHITECTURE_PATTERNS = {
    pwa: {
      name: 'Progressive Web App (PWA)',
      components: ['manifest.json', 'service worker', 'HTTPS', 'responsive design', 'offline support'],
      description: 'A web app that can be installed, works offline, and behaves like a native app.',
      key_decisions: ['Cache strategy (cache-first vs network-first)', 'What to cache (shell vs data)', 'Push notification strategy'],
    },
    rest_api: {
      name: 'REST API',
      components: ['routes', 'middleware', 'authentication', 'validation', 'error handling', 'database layer'],
      description: 'Stateless HTTP API where resources are addressed by URL and manipulated with HTTP methods.',
      key_decisions: ['Authentication method (JWT, session, API key)', 'Versioning (/v1/)', 'Rate limiting', 'Response format'],
    },
    auth_flow: {
      name: 'Authentication Flow',
      components: ['login UI', 'token issuance', 'token storage', 'refresh mechanism', 'logout / revocation'],
      description: 'End-to-end identity verification and session management.',
      key_decisions: ['Token storage location (httpOnly cookie vs localStorage vs memory)', 'Refresh token rotation', 'Session vs JWT'],
    },
    caching: {
      name: 'Caching Architecture',
      components: ['browser cache', 'service worker cache', 'CDN cache', 'server-side cache', 'database cache'],
      description: 'Multi-layer caching to reduce latency and server load.',
      key_decisions: ['Cache invalidation strategy', 'Cache-Control headers', 'Stale-while-revalidate usage'],
    },
  };

  // ─── Utility helpers ──────────────────────────────────────────────────────

  function _lower(str) { return typeof str === 'string' ? str.toLowerCase() : ''; }

  function _hasAny(text, words) {
    var lt = _lower(text);
    for (var i = 0; i < words.length; i++) {
      if (lt.indexOf(words[i]) !== -1) return true;
    }
    return false;
  }

  // ─── detectLanguage() ────────────────────────────────────────────────────
  /**
   * Detect which language(s) the query is about.
   * Returns array of language keys.
   */
  function detectLanguage(message) {
    var lower = _lower(message);
    var detected = [];

    var signals = {
      javascript: ['javascript', 'js', 'node', 'nodejs', 'async', 'await', 'promise', 'arrow function', 'let ', 'const ', 'var '],
      python:     ['python', 'py', 'def ', 'import ', 'print(', 'pip ', 'django', 'flask', 'pandas'],
      html:       ['html', '<div', '<p>', '<form', '<head', '<body', '<span', 'element', 'tag'],
      css:        ['css', 'stylesheet', 'selector', 'flexbox', 'grid', 'padding', 'margin', 'class="', 'id="'],
      git:        ['git', 'commit', 'branch', 'push', 'pull', 'merge', 'rebase', 'github'],
      http:       ['http', 'rest api', 'api', 'get request', 'post request', 'status code', 'cors', 'fetch'],
      firebase:   ['firebase', 'firestore', 'cloud functions', 'authentication', 'firebase sdk'],
      cloudflare_workers: ['cloudflare worker', 'wrangler', 'worker', 'kv storage', 'durable object'],
      service_workers: ['service worker', 'sw.js', 'cache api', 'offline', 'pwa'],
      nodejs:     ['node.js', 'nodejs', 'require(', 'module.exports', 'express', 'npm'],
      sql:        ['sql', 'select ', 'where ', 'join ', 'database', 'query', 'table'],
    };

    var keys = Object.keys(signals);
    for (var i = 0; i < keys.length; i++) {
      var lang = keys[i];
      if (_hasAny(lower, signals[lang])) detected.push(lang);
    }

    return detected;
  }

  // ─── detectConcept() ────────────────────────────────────────────────────
  /**
   * Detect which core concept(s) the query is about.
   * Returns array of concept keys.
   */
  function detectConcept(message) {
    var lower = _lower(message);
    var detected = [];

    var conceptSignals = {
      'async/await':          ['async', 'await', 'asynchronous'],
      'promises':             ['promise', '.then(', '.catch(', 'reject', 'resolve'],
      'closures':             ['closure', 'lexical scope', 'inner function'],
      'this binding':         ['"this"', "'this'", 'this keyword', 'bind(', 'arrow function this'],
      'event loop':           ['event loop', 'call stack', 'macrotask', 'microtask', 'settimeout 0'],
      'dom':                  ['dom', 'document.', 'query selector', 'inner html', 'addevent'],
      'scope':                ['scope', 'hoisting', 'temporal dead zone', 'let vs var', 'block scope'],
      'service worker caching': ['service worker', 'cache api', 'stale', 'old javascript', 'cache version'],
      'cors':                 ['cors', 'cross-origin', 'access-control', 'preflight'],
      'null vs undefined':    ['null', 'undefined', 'optional chaining', 'nullish'],
      'rest api':             ['rest', 'restful', 'api design', 'status code', 'http method'],
      'git branching':        ['branch', 'merge', 'rebase', 'git flow', 'force push'],
      'authentication':       ['authentication', 'jwt', 'bearer token', 'session', 'oauth', 'login'],
    };

    var keys = Object.keys(conceptSignals);
    for (var i = 0; i < keys.length; i++) {
      var c = keys[i];
      if (_hasAny(lower, conceptSignals[c])) detected.push(c);
    }

    return detected;
  }

  // ─── matchErrorPattern() ─────────────────────────────────────────────────
  /**
   * Match an error string against known error patterns.
   * Returns { matched: true, diagnosis } or { matched: false }
   */
  function matchErrorPattern(errorText) {
    for (var i = 0; i < ERROR_PATTERNS.length; i++) {
      var ep = ERROR_PATTERNS[i];
      if (ep.pattern.test(errorText)) {
        return {
          matched:       true,
          errorType:     ep.type,
          diagnosis:     ep.diagnosis,
          likelyCauses:  ep.likely_causes,
          fixApproach:   ep.fix_approach,
        };
      }
    }
    return { matched: false };
  }

  // ─── explain() ───────────────────────────────────────────────────────────
  /**
   * Build an explanation for a coding query.
   * Returns a structured explanation object (not raw text — caller composes final answer).
   *
   * @param  {string} message  — user's question
   * @returns {ExplanationResult}
   *   {
   *     languages, concepts, errorMatch,
   *     conceptSummaries, languageNotes, pitfalls,
   *     architecturePattern, confidence
   *   }
   */
  function explain(message) {
    var languages       = detectLanguage(message);
    var detectedConcepts = detectConcept(message);
    var lower           = _lower(message);

    // Error diagnosis path
    var errorMatch = null;
    if (/error|exception|failed|stack trace|undefined|cannot read|not a function|not defined/i.test(lower)) {
      errorMatch = matchErrorPattern(message);
    }

    // Gather concept summaries
    var conceptSummaries = [];
    var pitfalls = [];
    detectedConcepts.forEach(function (ck) {
      var c = CONCEPTS[ck];
      if (c) {
        conceptSummaries.push({ concept: ck, summary: c.summary, howItWorks: c.how_it_works || null });
        if (c.common_pitfalls) c.common_pitfalls.forEach(function (p) { pitfalls.push(p); });
      }
    });

    // Gather language notes
    var languageNotes = [];
    languages.forEach(function (lk) {
      var l = LANGUAGES[lk];
      if (l) languageNotes.push({ language: lk, name: l.name, notes: l.notes, paradigm_description: l.paradigm_description });
    });

    // Architecture pattern detection
    var architecturePattern = null;
    if (/pwa|progressive web app|offline first/i.test(lower)) architecturePattern = ARCHITECTURE_PATTERNS.pwa;
    else if (/rest api|api route|endpoint design/i.test(lower)) architecturePattern = ARCHITECTURE_PATTERNS.rest_api;
    else if (/auth|login|session|jwt|token/i.test(lower)) architecturePattern = ARCHITECTURE_PATTERNS.auth_flow;
    else if (/cache|caching|stale|cdn/i.test(lower)) architecturePattern = ARCHITECTURE_PATTERNS.caching;

    // Confidence based on how much was matched
    var confidence = 0.3;
    if (languages.length > 0)       confidence += 0.2;
    if (detectedConcepts.length > 0) confidence += 0.25;
    if (errorMatch && errorMatch.matched) confidence += 0.3;
    if (architecturePattern)        confidence += 0.1;
    confidence = Math.min(1.0, confidence);

    return {
      languages:          languages,
      detectedConcepts:   detectedConcepts,
      errorMatch:         errorMatch,
      conceptSummaries:   conceptSummaries,
      languageNotes:      languageNotes,
      pitfalls:           pitfalls,
      architecturePattern: architecturePattern,
      confidence:         confidence,
    };
  }

  // ─── composeExplanationContext() ─────────────────────────────────────────
  /**
   * Turns an explain() result into a concise context string for the model.
   * Provides structured knowledge without being a canned answer.
   */
  function composeExplanationContext(explanationResult) {
    if (!explanationResult) return null;
    var e = explanationResult;
    var parts = [];

    // Error diagnosis context
    if (e.errorMatch && e.errorMatch.matched) {
      parts.push(
        'Error type: ' + e.errorMatch.errorType + '. ' +
        'Diagnosis: ' + e.errorMatch.diagnosis + ' ' +
        'Likely causes: ' + (e.errorMatch.likelyCauses || []).slice(0, 3).join('; ') + '. ' +
        'Fix approach: ' + e.errorMatch.fixApproach
      );
    }

    // Concept context
    e.conceptSummaries.slice(0, 2).forEach(function (cs) {
      parts.push(cs.concept + ': ' + cs.summary);
      if (cs.howItWorks) parts.push('How: ' + cs.howItWorks);
    });

    // Top pitfalls
    if (e.pitfalls.length > 0) {
      parts.push('Key pitfalls: ' + e.pitfalls.slice(0, 2).join('; '));
    }

    // Language notes
    if (e.languageNotes.length > 0) {
      parts.push(e.languageNotes[0].name + ': ' + e.languageNotes[0].notes);
    }

    // Architecture pattern
    if (e.architecturePattern) {
      parts.push(
        e.architecturePattern.name + ' components: ' +
        e.architecturePattern.components.join(', ')
      );
    }

    return parts.length > 0 ? parts.join('\n') : null;
  }

  // ─── isCodeQuery() ───────────────────────────────────────────────────────
  /**
   * Quick check: is this message a coding/programming query?
   */
  function isCodeQuery(message) {
    return detectLanguage(message).length > 0 || detectConcept(message).length > 0;
  }

  // ─── lookupLanguage() ────────────────────────────────────────────────────
  function lookupLanguage(langKey) {
    return LANGUAGES[langKey] || null;
  }

  // ─── lookupConcept() ────────────────────────────────────────────────────
  function lookupConcept(conceptKey) {
    return CONCEPTS[conceptKey] || null;
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  global.SRCodingFoundation = {
    BUILD_ID: BUILD_ID,

    // Detection
    detectLanguage:              detectLanguage,
    detectConcept:               detectConcept,
    isCodeQuery:                 isCodeQuery,

    // Explanation
    explain:                     explain,
    composeExplanationContext:   composeExplanationContext,
    matchErrorPattern:           matchErrorPattern,

    // Direct knowledge access
    lookupLanguage:              lookupLanguage,
    lookupConcept:               lookupConcept,

    // Data references (read-only)
    LANGUAGES:                   LANGUAGES,
    CONCEPTS:                    CONCEPTS,
    ERROR_PATTERNS:              ERROR_PATTERNS,
    ARCHITECTURE_PATTERNS:       ARCHITECTURE_PATTERNS,
  };

})(typeof window !== 'undefined' ? window : global);
