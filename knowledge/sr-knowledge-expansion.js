/**
 * shadow-reaper-v2/knowledge/sr-knowledge-expansion.js
 * Shadow Reaper — Knowledge Expansion System
 *
 * Build: SR-KNOWLEDGE-EXPANSION-1
 *
 * Exposes: window.SRKnowledgeExpansion
 *
 * PURPOSE:
 *   Scalable, category-based knowledge retrieval system that does NOT depend
 *   on a hosted AI model for facts.
 *
 *   Provides:
 *     - Knowledge category management (FOUNDATIONAL, GENERAL, CREATOR, PERSONAL,
 *       PROJECT, LEARNED, LIVE)
 *     - Confidence / metadata on each knowledge item
 *     - Privacy isolation (personal items NEVER migrate to general)
 *     - Learning pipeline classification (new info → category + confidence + validation)
 *     - Query with relevance ranking
 *
 * KNOWLEDGE CATEGORIES (must NOT be mixed):
 *   FOUNDATIONAL_LANGUAGE  — language understanding (Shadow's own vocabulary/grammar)
 *   GENERAL                — reusable factual knowledge (computing, science, tech)
 *   CREATOR                — public creator / platform facts (Shadow Nexus Social, Chris)
 *   PERSONAL_MEMORY        — user-specific private data (never shared)
 *   PROJECT                — user's project-specific knowledge (never shared)
 *   LEARNED_GENERAL        — validated general claims learned from conversation
 *   LIVE_EXTERNAL          — weather, search results (ephemeral, not stored)
 *
 * CONFIDENCE LEVELS:
 *   VERIFIED   — from curated built-in sources
 *   HIGH       — consistent across multiple sources or turns
 *   MEDIUM     — single uncontradicted claim
 *   LOW        — single claim, not confirmed
 *   SPECULATIVE— inferred, not stated directly
 *
 * PRIVACY GUARANTEE:
 *   Personal information (PERSONAL_MEMORY, PROJECT categories) is NEVER
 *   promoted to GENERAL or LEARNED_GENERAL. The learning pipeline enforces this.
 *
 * Zero external AI calls. Zero Workers AI. Zero polling.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-KNOWLEDGE-EXPANSION-1';

  // ─── Category constants ───────────────────────────────────────────────────
  var CATEGORY = {
    FOUNDATIONAL_LANGUAGE: 'FOUNDATIONAL_LANGUAGE',
    GENERAL:               'GENERAL',
    CREATOR:               'CREATOR',
    PERSONAL_MEMORY:       'PERSONAL_MEMORY',
    PROJECT:               'PROJECT',
    LEARNED_GENERAL:       'LEARNED_GENERAL',
    LIVE_EXTERNAL:         'LIVE_EXTERNAL',
  };

  // ─── Confidence constants ─────────────────────────────────────────────────
  var CONFIDENCE = {
    VERIFIED:    1.0,
    HIGH:        0.8,
    MEDIUM:      0.6,
    LOW:         0.4,
    SPECULATIVE: 0.2,
  };

  // ─── Sensitive-data patterns — never store these ──────────────────────────
  var SENSITIVE_PATTERNS = [
    /password/i, /api[\s_-]*key/i, /secret[\s_-]*key/i, /private[\s_-]*key/i,
    /auth[\s_-]*token/i, /bearer /i, /credit[\s_-]*card/i, /ssn/i,
    /social[\s_-]*security/i, /\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/,
    /\b\d{3}[\s-]?\d{2}[\s-]?\d{4}\b/,  // SSN pattern
  ];

  // ─── GENERAL knowledge base ───────────────────────────────────────────────
  // Category: GENERAL — computing, science, technology reference facts.
  // These are NEVER mixed with personal data.

  var GENERAL_KNOWLEDGE = [
    {
      id: 'gk_web_browser',
      category: CATEGORY.GENERAL,
      keywords: ['web browser', 'browser', 'chrome', 'firefox', 'safari', 'rendering engine'],
      content: 'Web browsers parse HTML/CSS/JavaScript and render web pages. They include a rendering engine (Blink, Gecko, WebKit), a JavaScript engine (V8, SpiderMonkey), and networking layers.',
      confidence: CONFIDENCE.VERIFIED,
      source: 'built-in',
      lastUpdated: '2024-01',
    },
    {
      id: 'gk_cpu',
      category: CATEGORY.GENERAL,
      keywords: ['cpu', 'processor', 'central processing unit', 'core', 'thread', 'clock speed', 'ghz'],
      content: 'A CPU (Central Processing Unit) is the primary component that executes program instructions. Modern CPUs have multiple cores (physical processing units) and threads (virtual processing units via hyper-threading/SMT). Clock speed (GHz) measures cycles per second.',
      confidence: CONFIDENCE.VERIFIED,
      source: 'built-in',
      lastUpdated: '2024-01',
    },
    {
      id: 'gk_ram',
      category: CATEGORY.GENERAL,
      keywords: ['ram', 'memory', 'random access memory', 'ddr', 'dram'],
      content: 'RAM (Random Access Memory) is volatile working memory used by the CPU to store active program data. More RAM allows more applications and data to be held simultaneously. RAM data is lost when power is removed.',
      confidence: CONFIDENCE.VERIFIED,
      source: 'built-in',
      lastUpdated: '2024-01',
    },
    {
      id: 'gk_gpu',
      category: CATEGORY.GENERAL,
      keywords: ['gpu', 'graphics card', 'graphics processing unit', 'vram', 'rendering'],
      content: 'A GPU (Graphics Processing Unit) is specialized for parallel computation. Originally for graphics rendering, GPUs are now used for machine learning, scientific computing, and image processing due to their massive parallelism.',
      confidence: CONFIDENCE.VERIFIED,
      source: 'built-in',
      lastUpdated: '2024-01',
    },
    {
      id: 'gk_ssd_hdd',
      category: CATEGORY.GENERAL,
      keywords: ['ssd', 'hard drive', 'hdd', 'storage', 'solid state', 'nvme'],
      content: 'SSDs (Solid State Drives) store data on flash memory chips — no moving parts, much faster than HDDs. HDDs (Hard Disk Drives) use spinning magnetic platters — slower but more cost-effective for large capacities. NVMe SSDs connect via PCIe and are faster than SATA SSDs.',
      confidence: CONFIDENCE.VERIFIED,
      source: 'built-in',
      lastUpdated: '2024-01',
    },
    {
      id: 'gk_api',
      category: CATEGORY.GENERAL,
      keywords: ['api', 'application programming interface', 'endpoint', 'web api'],
      content: 'An API (Application Programming Interface) defines how software components communicate. Web APIs expose endpoints over HTTP that other programs can call to retrieve or manipulate data. REST and GraphQL are common web API styles.',
      confidence: CONFIDENCE.VERIFIED,
      source: 'built-in',
      lastUpdated: '2024-01',
    },
    {
      id: 'gk_cloud_computing',
      category: CATEGORY.GENERAL,
      keywords: ['cloud', 'cloud computing', 'saas', 'paas', 'iaas', 'aws', 'azure', 'gcp'],
      content: 'Cloud computing delivers computing resources (servers, storage, databases, networking, software) over the internet. IaaS = infrastructure, PaaS = platform, SaaS = software. Major providers: AWS, Azure, Google Cloud, Cloudflare.',
      confidence: CONFIDENCE.VERIFIED,
      source: 'built-in',
      lastUpdated: '2024-01',
    },
    {
      id: 'gk_ip_address',
      category: CATEGORY.GENERAL,
      keywords: ['ip address', 'ipv4', 'ipv6', 'subnet', 'dns', 'domain name'],
      content: 'An IP address uniquely identifies a device on a network. IPv4 uses 32-bit addresses (e.g. 192.168.1.1). IPv6 uses 128-bit addresses. DNS (Domain Name System) translates human-readable domain names to IP addresses.',
      confidence: CONFIDENCE.VERIFIED,
      source: 'built-in',
      lastUpdated: '2024-01',
    },
    {
      id: 'gk_encryption',
      category: CATEGORY.GENERAL,
      keywords: ['encryption', 'tls', 'ssl', 'https', 'aes', 'rsa', 'public key', 'certificate'],
      content: 'Encryption transforms data so only authorized parties can read it. HTTPS uses TLS to encrypt web traffic. Symmetric encryption (AES) uses one key. Asymmetric encryption (RSA) uses a public/private key pair. TLS certificates are issued by Certificate Authorities.',
      confidence: CONFIDENCE.VERIFIED,
      source: 'built-in',
      lastUpdated: '2024-01',
    },
    {
      id: 'gk_machine_learning',
      category: CATEGORY.GENERAL,
      keywords: ['machine learning', 'ml', 'ai', 'neural network', 'deep learning', 'training', 'model', 'inference'],
      content: 'Machine learning trains models on data to recognize patterns and make predictions. Deep learning uses neural networks with many layers. Training adjusts model weights using labeled data. Inference applies the trained model to new inputs. LLMs (Large Language Models) are trained on massive text corpora.',
      confidence: CONFIDENCE.VERIFIED,
      source: 'built-in',
      lastUpdated: '2024-01',
    },
    {
      id: 'gk_git',
      category: CATEGORY.GENERAL,
      keywords: ['git', 'version control', 'repository', 'commit history', 'merge conflict'],
      content: 'Git is a distributed version control system. Every repository is a full history. Branches allow parallel development. Commits are snapshots. Merging and rebasing integrate branches. GitHub/GitLab host remote repositories.',
      confidence: CONFIDENCE.VERIFIED,
      source: 'built-in',
      lastUpdated: '2024-01',
    },
    {
      id: 'gk_linux',
      category: CATEGORY.GENERAL,
      keywords: ['linux', 'unix', 'terminal', 'bash', 'shell', 'command line', 'kernel'],
      content: 'Linux is an open-source operating system kernel. Common distributions: Ubuntu, Debian, Fedora, Arch. The shell (bash/zsh) is the command-line interface. Key commands: ls, cd, mkdir, cp, mv, rm, grep, chmod, sudo, apt/dnf/pacman.',
      confidence: CONFIDENCE.VERIFIED,
      source: 'built-in',
      lastUpdated: '2024-01',
    },
    {
      id: 'gk_database_types',
      category: CATEGORY.GENERAL,
      keywords: ['database', 'relational', 'nosql', 'sql', 'mongodb', 'postgresql', 'mysql', 'firestore'],
      content: 'Relational databases (PostgreSQL, MySQL, SQLite) store data in tables with schemas and support SQL queries. NoSQL databases (MongoDB, Firestore, Redis) use flexible document, key-value, or graph models suited for unstructured data or scalable reads.',
      confidence: CONFIDENCE.VERIFIED,
      source: 'built-in',
      lastUpdated: '2024-01',
    },
    {
      id: 'gk_web_performance',
      category: CATEGORY.GENERAL,
      keywords: ['web performance', 'page speed', 'core web vitals', 'lcp', 'fid', 'cls', 'lighthouse', 'lazy load'],
      content: 'Web performance is measured by Core Web Vitals: LCP (Largest Contentful Paint), FID (First Input Delay / INP), CLS (Cumulative Layout Shift). Tools: Lighthouse, WebPageTest. Techniques: lazy loading, code splitting, CDN, caching, compression.',
      confidence: CONFIDENCE.VERIFIED,
      source: 'built-in',
      lastUpdated: '2024-01',
    },
    {
      id: 'gk_docker',
      category: CATEGORY.GENERAL,
      keywords: ['docker', 'container', 'image', 'dockerfile', 'kubernetes', 'k8s', 'containerization'],
      content: 'Docker packages applications and dependencies into containers — portable, isolated environments that run consistently across machines. Images are templates; containers are running instances. Kubernetes (k8s) orchestrates clusters of containers.',
      confidence: CONFIDENCE.VERIFIED,
      source: 'built-in',
      lastUpdated: '2024-01',
    },
  ];

  // ─── In-memory learned knowledge store ───────────────────────────────────
  // Only LEARNED_GENERAL items go here. Personal items go to Firebase via SRAdaptiveBrain.

  var _learnedItems = [];
  var _learnedMaxItems = 200;

  // ─── Sensitive data filter ────────────────────────────────────────────────

  function _isSensitive(text) {
    return SENSITIVE_PATTERNS.some(function (p) { return p.test(text); });
  }

  // ─── Personal claim detection ─────────────────────────────────────────────
  // Returns true if the text is clearly personal (should NEVER go to LEARNED_GENERAL).

  function _isPersonalClaim(text) {
    return /\b(my |i |i'm |i am |i have |my name is |i live |i work |my address |my email |my phone )/i.test(text);
  }

  // ─── classifyClaim() ─────────────────────────────────────────────────────
  /**
   * Classify a piece of new information into a knowledge category.
   * Returns { category, confidence, isPrivate, validated }
   */
  function classifyClaim(text, context) {
    context = context || {};

    if (_isSensitive(text)) {
      return { category: null, confidence: 0, isPrivate: true, validated: false, reason: 'SENSITIVE' };
    }

    // Project claims must be checked BEFORE generic personal (both start with "My")
    if (/\bmy (project|app|game|site|website|application)\b/i.test(text)) {
      return { category: CATEGORY.PROJECT, confidence: CONFIDENCE.MEDIUM, isPrivate: true, validated: false, reason: 'PROJECT' };
    }

    // Personal claims always stay personal
    if (_isPersonalClaim(text)) {
      return { category: CATEGORY.PERSONAL_MEMORY, confidence: CONFIDENCE.MEDIUM, isPrivate: true, validated: false, reason: 'PERSONAL' };
    }

    // Creator/platform facts
    if (/shadow nexus|sns|chris.*built|legend of shadows/i.test(text)) {
      return { category: CATEGORY.CREATOR, confidence: CONFIDENCE.HIGH, isPrivate: false, validated: true, reason: 'CREATOR' };
    }

    // General factual claim patterns: "X is Y", "X means Y", "X stands for Y"
    if (/\bis\b|\bmeans\b|\bstands for\b|\brefers to\b|\bdefined as\b/i.test(text) && !_isPersonalClaim(text)) {
      return {
        category:   CATEGORY.LEARNED_GENERAL,
        confidence: CONFIDENCE.LOW,      // starts low; increases with reinforcement
        isPrivate:  false,
        validated:  false,
        reason:     'GENERAL_CLAIM',
      };
    }

    // Default: treat as general
    return {
      category:   CATEGORY.LEARNED_GENERAL,
      confidence: CONFIDENCE.SPECULATIVE,
      isPrivate:  false,
      validated:  false,
      reason:     'DEFAULT_GENERAL',
    };
  }

  // ─── learnFact() ─────────────────────────────────────────────────────────
  /**
   * Process new information through the learning pipeline.
   * Personal/project items are NOT stored here — they go to SRAdaptiveBrain/SRPersonalMemory.
   * Only LEARNED_GENERAL items are stored in the local expansion store.
   *
   * Returns { stored: bool, category, reason }
   */
  function learnFact(text, context) {
    if (!text || typeof text !== 'string' || text.trim().length < 5) {
      return { stored: false, reason: 'TOO_SHORT' };
    }

    var classification = classifyClaim(text, context);

    // Never store personal/project/sensitive items in expansion store
    if (classification.isPrivate || !classification.category) {
      return { stored: false, category: classification.category, reason: classification.reason || 'PRIVATE' };
    }

    if (classification.category !== CATEGORY.LEARNED_GENERAL) {
      return { stored: false, category: classification.category, reason: 'NOT_LEARNED_GENERAL' };
    }

    // Deduplicate
    var lowerText = text.toLowerCase().trim();
    var exists = _learnedItems.some(function (item) {
      return item.text.toLowerCase().trim() === lowerText;
    });

    if (exists) {
      // Reinforce confidence on duplicate
      _learnedItems = _learnedItems.map(function (item) {
        if (item.text.toLowerCase().trim() === lowerText) {
          return Object.assign({}, item, {
            confidence: Math.min(CONFIDENCE.HIGH, item.confidence + 0.1),
            reinforced: (item.reinforced || 0) + 1,
          });
        }
        return item;
      });
      return { stored: true, category: CATEGORY.LEARNED_GENERAL, reason: 'REINFORCED' };
    }

    // Add new item
    var item = {
      id:          'lrn_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      category:    CATEGORY.LEARNED_GENERAL,
      text:        text.trim(),
      confidence:  classification.confidence,
      source:      'learned',
      learnedAt:   new Date().toISOString(),
      reinforced:  0,
      validated:   false,
    };

    _learnedItems.push(item);

    // Cap store size
    if (_learnedItems.length > _learnedMaxItems) {
      // Remove oldest, lowest-confidence items
      _learnedItems.sort(function (a, b) {
        return (b.confidence + (b.reinforced || 0) * 0.05) - (a.confidence + (a.reinforced || 0) * 0.05);
      });
      _learnedItems = _learnedItems.slice(0, _learnedMaxItems);
    }

    return { stored: true, category: CATEGORY.LEARNED_GENERAL, reason: 'NEW_ITEM' };
  }

  // ─── query() ─────────────────────────────────────────────────────────────
  /**
   * Query across the full knowledge base (built-in GENERAL + LEARNED_GENERAL).
   * Returns up to maxResults items sorted by relevance score.
   *
   * @param  {string}  message    — user query
   * @param  {string[]} categories — which categories to search (default: all non-private)
   * @param  {number}  maxResults
   * @returns {KnowledgeItem[]}
   */
  function query(message, categories, maxResults) {
    maxResults = maxResults || 3;
    categories = categories || [CATEGORY.GENERAL, CATEGORY.CREATOR, CATEGORY.LEARNED_GENERAL];

    var lower = message.toLowerCase();
    var queryTokens = lower.replace(/[^\w\s]/g, ' ').split(/\s+/).filter(function (t) { return t.length >= 3; });

    // Combine all searchable knowledge
    var allItems = [];

    if (categories.indexOf(CATEGORY.GENERAL) !== -1) {
      GENERAL_KNOWLEDGE.forEach(function (item) { allItems.push(item); });
    }

    if (categories.indexOf(CATEGORY.LEARNED_GENERAL) !== -1) {
      _learnedItems.filter(function (item) { return item.confidence >= CONFIDENCE.LOW; })
        .forEach(function (item) { allItems.push(item); });
    }

    // Score each item
    var scored = allItems.map(function (item) {
      var score = 0;

      // Keyword matching (built-in items have explicit keywords)
      if (item.keywords) {
        item.keywords.forEach(function (kw) {
          if (lower.indexOf(kw.toLowerCase()) !== -1) {
            score += kw.length / 5;  // longer keyword match = higher weight
          }
        });
      }

      // Text content matching (for learned items)
      if (item.text) {
        queryTokens.forEach(function (tok) {
          if (item.text.toLowerCase().indexOf(tok) !== -1) score += 0.5;
        });
        if (item.text.toLowerCase().indexOf(lower.substring(0, 30)) !== -1) score += 1.0;
      }

      // Content matching for built-in general items
      if (item.content) {
        queryTokens.forEach(function (tok) {
          if (item.content.toLowerCase().indexOf(tok) !== -1) score += 0.3;
        });
      }

      // Confidence bonus
      score *= (item.confidence || CONFIDENCE.MEDIUM);

      return { item: item, score: score };
    });

    // Filter and sort
    return scored
      .filter(function (s) { return s.score > 0.5; })
      .sort(function (a, b) { return b.score - a.score; })
      .slice(0, maxResults)
      .map(function (s) { return s.item; });
  }

  // ─── queryAsContext() ────────────────────────────────────────────────────
  /**
   * Query and return as a formatted context string for model injection.
   * Only items with confidence >= MEDIUM are surfaced.
   */
  function queryAsContext(message) {
    var results = query(message, [CATEGORY.GENERAL, CATEGORY.LEARNED_GENERAL], 2);

    if (!results.length) return null;

    var parts = results.map(function (item) {
      var text = item.content || item.text || '';
      var conf = item.confidence >= CONFIDENCE.HIGH ? '' : ' [unverified]';
      return text + conf;
    });

    return parts.join('\n\n');
  }

  // ─── getStats() ──────────────────────────────────────────────────────────
  function getStats() {
    return {
      generalBuiltIn:  GENERAL_KNOWLEDGE.length,
      learnedGeneral:  _learnedItems.length,
      total:           GENERAL_KNOWLEDGE.length + _learnedItems.length,
    };
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  global.SRKnowledgeExpansion = {
    BUILD_ID:       BUILD_ID,
    CATEGORY:       CATEGORY,
    CONFIDENCE:     CONFIDENCE,

    // Core API
    classifyClaim:  classifyClaim,
    learnFact:      learnFact,
    query:          query,
    queryAsContext: queryAsContext,
    getStats:       getStats,
  };

})(typeof window !== 'undefined' ? window : global);
