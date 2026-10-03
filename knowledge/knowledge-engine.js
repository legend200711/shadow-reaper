/**
 * shadow-reaper-v2/knowledge/knowledge-engine.js
 * Shadow Reaper V2 — Knowledge Engine
 *
 * Build: SR-V2-KNOWLEDGE-2
 *
 * Exposes: window.SRKnowledge
 *
 * PURPOSE:
 *   Provides structured, retrievable knowledge about Shadow Nexus Social,
 *   creator public information, and general capabilities.
 *
 * ARCHITECTURE:
 *   - Knowledge is NEVER injected into every conversation.
 *   - Knowledge is retrieved ONLY when the query is relevant.
 *   - SNS knowledge does NOT hijack unrelated conversations.
 *   - Creator knowledge protects all private information.
 *
 * KNOWLEDGE AUTHORITY:
 *   CREATOR entries carry { scope: 'creator', authority: 'verified_creator',
 *   confidence: 1.0, editableByAdaptiveLearning: false }.
 *   Adaptive learning can NEVER promote a fact that contradicts an entry
 *   where editableByAdaptiveLearning === false.
 *
 * MODEL INDEPENDENCE:
 *   Zero external AI calls. Pure deterministic local lookup.
 *
 * PORTABLE:
 *   This module is designed to work standalone — no SNS dependency.
 *   SNS-specific knowledge is isolated in a dedicated category.
 */

(function (global) {
  'use strict';

  var BUILD_ID = 'SR-V2-KNOWLEDGE-2';

  /* ─────────────────────────────────────────────────────────────
     KNOWLEDGE CATEGORIES
   ───────────────────────────────────────────────────────────────*/
  var CATEGORY = {
    SNS:       'SNS',        // Shadow Nexus Social platform
    CREATOR:   'CREATOR',    // Public creator information — VERIFIED, protected
    GENERAL:   'GENERAL',    // General capability info
  };

  /* ─────────────────────────────────────────────────────────────
     VERIFIED CREATOR KNOWLEDGE METADATA
     Entries with this authority tag CANNOT be overwritten by
     adaptive learning or user-supplied contradictions.
   ───────────────────────────────────────────────────────────────*/
  var VERIFIED_CREATOR_META = {
    scope:                    'creator',
    authority:                'verified_creator',
    confidence:               1.0,
    editableByAdaptiveLearning: false,
  };

  /* ─────────────────────────────────────────────────────────────
     KNOWLEDGE BASE
     Each entry: { category, keywords: [], content }
     keywords drive relevance detection — no full-text scan needed.
  ───────────────────────────────────────────────────────────────*/
  var KNOWLEDGE_BASE = [

    /* ── SHADOW NEXUS SOCIAL — PLATFORM ──────────────────────── */
    {
      category: CATEGORY.SNS,
      keywords: ['shadow nexus social', 'sns', 'what is shadow nexus', 'platform overview', 'about shadow nexus', 'shadow nexus'],
      content: 'Shadow Nexus Social is a creative social platform built by Chris (Legend of Shadows). It features Radio, DJ streaming, Live video, TV channels, Feed, Profiles, Friends, Inbox, Notifications, Search, and PWA support.',
    },
    {
      category: CATEGORY.SNS,
      keywords: ['radio', 'listen', 'music stream', 'radio station', 'radio player', 'shadow nexus radio'],
      content: 'Radio on Shadow Nexus Social lets you listen to live music streams. You can tune in, see track info, send requests, and see who else is listening.',
    },
    {
      category: CATEGORY.SNS,
      keywords: ['radio studio', 'dj', 'dj mode', 'broadcast', 'stream music', 'go live radio', 'difference between radio'],
      content: 'The Radio Studio allows DJs and Founders to broadcast live audio streams. DJ mode provides mixing controls. You can start a broadcast, manage tracks, and control the stream from the Studio. Radio Studio is for broadcasting; Radio is for listening.',
    },
    {
      category: CATEGORY.SNS,
      keywords: ['shadow nexus live', 'live video', 'go live', 'live stream', 'live broadcast', 'video call', 'cohost', 'live feature', 'live system', 'what is live', 'live'],
      content: 'Live on Shadow Nexus Social lets creators broadcast live video. You can go live from your account, invite a cohost to join your stream, and viewers can watch and interact in real time.',
    },
    {
      category: CATEGORY.SNS,
      keywords: ['tv studio', 'tv channel', 'shadow tv', 'television studio', '24 hour', 'television', 'shadow nexus tv', 'what is tv studio', 'tv used for', 'run a channel'],
      content: 'Shadow Nexus Social TV allows you to watch and host 24-hour TV channels. Creators can run their own channels. Viewers can tune into different channels in the TV section. TV Studio is where creators manage and broadcast their TV channel.',
    },
    {
      category: CATEGORY.SNS,
      keywords: ['feed', 'timeline', 'posts', 'home feed', 'news feed'],
      content: 'The Feed on Shadow Nexus Social shows posts from people you follow. You can post updates, share content, and interact with your community.',
    },
    {
      category: CATEGORY.SNS,
      keywords: ['profile', 'my profile', 'user profile', 'edit profile', 'profile page'],
      content: 'Your profile on Shadow Nexus Social shows your posts, media, and public information. You can edit your profile, set a profile picture, and customize your page.',
    },
    {
      category: CATEGORY.SNS,
      keywords: ['friends', 'follow', 'followers', 'following', 'friend request', 'connect'],
      content: 'Shadow Nexus Social uses a follow system. You can follow other users, see who follows you, and manage your connections.',
    },
    {
      category: CATEGORY.SNS,
      keywords: ['inbox', 'messages', 'dm', 'direct message', 'messaging', 'chat'],
      content: 'The Inbox on Shadow Nexus Social allows you to send and receive private messages.',
    },
    {
      category: CATEGORY.SNS,
      keywords: ['notifications', 'alerts', 'activity'],
      content: 'Notifications on Shadow Nexus Social keep you updated on activity related to your account — new followers, mentions, replies, and more.',
    },
    {
      category: CATEGORY.SNS,
      keywords: ['search', 'find', 'discover users', 'search people'],
      content: 'Search on Shadow Nexus Social lets you find users, content, and channels.',
    },
    {
      category: CATEGORY.SNS,
      keywords: ['uploads', 'upload', 'post media', 'share files', 'upload music'],
      content: 'You can upload media to Shadow Nexus Social including music, videos, and images.',
    },
    {
      category: CATEGORY.SNS,
      keywords: ['settings', 'account settings', 'preferences', 'account'],
      content: 'Settings on Shadow Nexus Social let you manage your account, privacy, and preferences.',
    },
    {
      category: CATEGORY.SNS,
      keywords: ['privacy', 'privacy settings', 'who can see', 'private'],
      content: 'Privacy settings on Shadow Nexus Social control who can see your content and interact with you.',
    },
    {
      category: CATEGORY.SNS,
      keywords: ['community', 'community guidelines', 'rules', 'report'],
      content: 'Shadow Nexus Social has community guidelines to keep the platform safe and positive. You can report content or users that violate the guidelines.',
    },
    {
      category: CATEGORY.SNS,
      keywords: ['safety', 'block', 'mute', 'report user', 'harassment'],
      content: 'Shadow Nexus Social provides safety tools including the ability to block and mute users, and report harmful content.',
    },
    {
      category: CATEGORY.SNS,
      keywords: ['pwa', 'install app', 'add to home screen', 'offline', 'progressive web app',
                 'install shadow nexus', 'install as an app', 'install as app', 'add to homescreen',
                 'install the website', 'install it as an app', 'install on my phone',
                 'install on device', 'how do i install', 'download the app'],
      content: 'Shadow Nexus Social is a Progressive Web App (PWA). You can install it on your device from your browser — add it to your home screen for an app-like experience on Android and iPhone. On Android: tap the browser menu and select "Add to Home Screen". On iPhone: tap Share then "Add to Home Screen".',
    },

    /* ── CREATOR — VERIFIED IDENTITY ─────────────────────────── */
    {
      category: CATEGORY.CREATOR,
      meta: VERIFIED_CREATOR_META,
      keywords: [
        'chris', 'legend of shadows', 'chris legend of shadows', 'creator', 'who made this',
        'who built this', 'who is chris', 'who created', 'who made shadow nexus',
        'who built shadow nexus', 'who created shadow nexus', 'who created shadow reaper',
        'who built shadow reaper', 'who is the creator', 'who founded', 'founder',
        'who is behind', 'who made you', 'who built you', 'the person behind you',
        'who developed', 'who made shadow reaper',
      ],
      content: 'Chris, known publicly as Chris Legend of Shadows, is the creator and developer behind Shadow Reaper and Shadow Nexus Social. He works across AI development, web development, music, digital projects, and community building. His artist and public name is Chris Legend of Shadows.',
    },
    {
      category: CATEGORY.CREATOR,
      meta: VERIFIED_CREATOR_META,
      keywords: [
        'legend of shadows', 'chris legend of shadows', 'artist name', 'creative identity',
        'who is legend of shadows', 'what does legend of shadows mean',
      ],
      content: 'Legend of Shadows is the public creative identity of Chris — the creator of Shadow Reaper and Shadow Nexus Social. The name reflects themes of survival, growth, darkness, and forging your own identity.',
    },
    {
      category: CATEGORY.CREATOR,
      meta: VERIFIED_CREATOR_META,
      keywords: ['stay legendary', 'legendary', 'motto', 'creator motto', 'slogan'],
      content: '"Stay legendary" is the motto associated with Chris Legend of Shadows.',
    },

    /* ── CREATOR — SHADOW REAPER OWNERSHIP ───────────────────── */
    {
      category: CATEGORY.CREATOR,
      meta: VERIFIED_CREATOR_META,
      keywords: [
        'shadow reaper', 'what is shadow reaper', 'ai assistant', 'who created shadow reaper',
        'who built shadow reaper', 'who made shadow reaper', 'shadow reaper creator',
      ],
      content: 'Shadow Reaper is the AI companion and assistant created by Chris Legend of Shadows. It is designed to be a personal AI companion, a creative thinking partner, and a platform guide. Shadow Reaper and Shadow Nexus Social are separate projects — both created by Chris.',
    },

    /* ── CREATOR — PERSONAL STORY ─────────────────────────────── */
    {
      category: CATEGORY.CREATOR,
      meta: VERIFIED_CREATOR_META,
      keywords: [
        'chris story', 'easy life', 'hard life', 'what has chris been through',
        'chris background', 'chris struggles', 'personal story', 'difficult times',
        'chris difficult', 'chris life', 'what chris went through',
      ],
      content: "Chris has been open about going through difficult periods in his life, including family problems, health struggles, and mental-health struggles. These experiences have deeply influenced his music, creative work, and the projects he builds. His creative identity as Legend of Shadows reflects finding strength in darkness.",
    },
    {
      category: CATEGORY.CREATOR,
      meta: VERIFIED_CREATOR_META,
      keywords: [
        'who helped chris', 'chris support', 'chris sister', 'green heart family',
        'who supported chris', 'helped him through', 'who helped him', 'support system',
        'who helped chris through', 'get through it', 'what helped chris',
      ],
      content: "Chris has described the most important sources of support in his life as his sister, his friends, and the Green Heart Family. His sister has been especially important — a major source of strength through difficult periods. The Green Heart Family represents community, loyalty, and people genuinely being there for each other.",
    },

    /* ── CREATOR — GREEN HEART FAMILY ────────────────────────── */
    {
      category: CATEGORY.CREATOR,
      meta: VERIFIED_CREATOR_META,
      keywords: [
        'green heart family', 'green heart', 'what is green heart', 'what is green heart family',
        'why is green heart family important', 'green heart community',
        'greyhound family',  // regression protection — maps to correct answer
      ],
      content: "The Green Heart Family is a community representing support, loyalty, and people being there for one another. It is an important part of Chris's support system and creative community.",
    },

    /* ── CREATOR — MUSIC ──────────────────────────────────────── */
    {
      category: CATEGORY.CREATOR,
      meta: VERIFIED_CREATOR_META,
      keywords: [
        'chris music', 'does chris make music', 'chris songs', 'chris releases',
        'what music does chris make', 'legend of shadows music', 'chris artist',
        'music artist', 'makes music', 'what name does he release', 'release music under',
        'what does his music talk about', 'music themes', 'what does chris music',
      ],
      content: "Chris makes music under his artist name Chris Legend of Shadows. His music frequently explores themes of personal struggle, mental health, family, loyalty, identity, darkness, hope, survival, support, friendship, not giving up, and personal growth.",
    },
    {
      category: CATEGORY.CREATOR,
      meta: VERIFIED_CREATOR_META,
      keywords: [
        'chris songs titles', 'song names', 'what songs', 'name a song', 'name a couple songs',
        'stay legendary song', 'a man like me', 'afraid of the dark place', 'appreciation anthem',
        'legendary birthday', 'legend family',
      ],
      content: "Songs and creative works associated with Chris Legend of Shadows include: Stay Legendary, A Man Like Me, Afraid of the Dark Place, Appreciation Anthem, Legendary Birthday, and Legend Family. These are known titles from his music and creative work.",
    },
    {
      category: CATEGORY.CREATOR,
      meta: VERIFIED_CREATOR_META,
      keywords: [
        'where can i listen', 'where is his music', 'music platforms', 'spotify chris',
        'apple music chris', 'where to find music', 'listen to chris', 'streaming',
        'find his music', 'where can i find it', 'where can i find his music',
        'listen to his music', 'where to listen', 'find the music',
      ],
      content: "Chris Legend of Shadows's music can be searched for on Spotify, Apple Music, Amazon Music, and YouTube Music. Search for 'Chris Legend of Shadows' on those platforms.",
    },

    /* ── CREATOR — WEBSITES ───────────────────────────────────── */
    {
      category: CATEGORY.CREATOR,
      meta: VERIFIED_CREATOR_META,
      keywords: [
        'chris website', 'does chris have a website', 'legend of shadows website',
        'chrislegendofshadows.com', 'chris web', 'chris official site',
        'what is the legend of shadows website',
      ],
      content: "Chris's official website is chrislegendofshadows.com. It is associated with his artist identity, music, creative work, projects, and community/personal brand.",
    },
    {
      category: CATEGORY.CREATOR,
      meta: VERIFIED_CREATOR_META,
      keywords: [
        'shadow nexus social website', 'shadow nexus social site', 'shadownexussocial.online',
        'where is shadow nexus social', 'shadow nexus social url', 'shadow nexus social link',
        'find shadow nexus social',
      ],
      content: "Shadow Nexus Social's website is shadownexussocial.online. It is a separate project from Shadow Reaper — both were created by Chris Legend of Shadows.",
    },

    /* ── CREATOR — SHADOW NEXUS SOCIAL OWNERSHIP ─────────────── */
    {
      category: CATEGORY.CREATOR,
      meta: VERIFIED_CREATOR_META,
      keywords: [
        'who created shadow nexus social', 'who built shadow nexus social',
        'who made shadow nexus social', 'shadow nexus social creator',
        'shadow nexus social founder', 'who is behind shadow nexus social',
        'who built shadow nexus', 'shadow nexus ownership',
      ],
      content: "Shadow Nexus Social was created and built by Chris Legend of Shadows. It is his own independent platform project, separate from Shadow Reaper.",
    },

    /* ── CREATOR — PROJECT DISTINCTION ───────────────────────── */
    {
      category: CATEGORY.CREATOR,
      meta: VERIFIED_CREATOR_META,
      keywords: [
        'difference between shadow reaper and shadow nexus',
        'shadow reaper vs shadow nexus',
        'are shadow reaper and shadow nexus the same',
        'what is the difference between shadow reaper',
      ],
      content: "Shadow Reaper and Shadow Nexus Social are two different projects, both created by Chris Legend of Shadows. Shadow Reaper is the AI companion/assistant system. Shadow Nexus Social is a separate creative social platform. They are distinct — do not confuse them.",
    },

    /* ── CREATOR — OTHER PROJECTS ─────────────────────────────── */
    {
      category: CATEGORY.CREATOR,
      meta: VERIFIED_CREATOR_META,
      keywords: [
        'what else has chris built', 'chris other projects', 'chris projects',
        'what else did chris make', 'what has chris built',
      ],
      content: "Chris Legend of Shadows continually works on creative and technology projects. Known projects include Shadow Reaper (AI companion system) and Shadow Nexus Social (creative social platform). He works across AI development, web development, music, digital projects, and community building.",
    },

    /* ── GENERAL CAPABILITY ───────────────────────────────────── */
    {
      category: CATEGORY.GENERAL,
      keywords: ['what can you do', 'help me', 'capabilities', 'what are you', 'what do you do'],
      content: 'I can help you with conversation, creative brainstorming, organizing ideas, answering questions, recalling things you have told me, and navigating Shadow Nexus Social. I am Shadow Reaper — a general AI assistant.',
    },
    {
      category: CATEGORY.GENERAL,
      keywords: ['shadow reaper remember', 'remember for me', 'memory', 'what do you remember', 'persistent memory'],
      content: 'I can save things you explicitly tell me to remember — just say "remember that..." and I will store it for future sessions. You can also ask "what do you remember about me?"',
    },
    {
      category: CATEGORY.GENERAL,
      keywords: ['history', 'conversation history', 'previous conversation', 'continue conversation'],
      content: 'I keep a history of our conversations so we can pick up where we left off. Ask "what were we talking about?" or "continue where we left off."',
    },
    {
      category: CATEGORY.GENERAL,
      keywords: ['translate', 'translation', 'language', 'speak spanish', 'speak french', 'what language'],
      content: 'I have a translation layer built in. I can attempt translations and respond in different languages. Ask "translate X to Spanish" or "answer me in French."',
    },
  ];

  /* ─────────────────────────────────────────────────────────────
     RELEVANCE SCORING
     Score a query against a knowledge entry by keyword matching.
     Returns 0 if not relevant.
  ───────────────────────────────────────────────────────────────*/
  function _score(query, entry) {
    var q = query.toLowerCase();
    var score = 0;
    for (var i = 0; i < entry.keywords.length; i++) {
      var kw = entry.keywords[i].toLowerCase();
      if (q.indexOf(kw) !== -1) {
        // Longer keyword match = higher weight
        score += kw.length;
      }
    }
    return score;
  }

  /* ─────────────────────────────────────────────────────────────
     QUERY
     Returns the single most relevant knowledge entry for a query,
     or null if nothing is relevant (score = 0).

     DOES NOT inject SNS knowledge into unrelated conversations.
  ───────────────────────────────────────────────────────────────*/
  function query(text) {
    if (!text || typeof text !== 'string') return null;

    var best = null;
    var bestScore = 0;

    for (var i = 0; i < KNOWLEDGE_BASE.length; i++) {
      var s = _score(text, KNOWLEDGE_BASE[i]);
      if (s > bestScore) {
        bestScore = s;
        best = KNOWLEDGE_BASE[i];
      }
    }

    // Only return if score is meaningful (≥ 3 = at least a 3-char keyword match)
    if (bestScore < 3) return null;
    return best;
  }

  /* ─────────────────────────────────────────────────────────────
     QUERY MULTIPLE
     Returns up to maxResults relevant entries, sorted by score.
  ───────────────────────────────────────────────────────────────*/
  function queryMultiple(text, maxResults) {
    maxResults = maxResults || 3;
    if (!text || typeof text !== 'string') return [];

    var scored = [];
    for (var i = 0; i < KNOWLEDGE_BASE.length; i++) {
      var s = _score(text, KNOWLEDGE_BASE[i]);
      if (s >= 3) {
        scored.push({ entry: KNOWLEDGE_BASE[i], score: s });
      }
    }

    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.slice(0, maxResults).map(function (x) { return x.entry; });
  }

  /* ─────────────────────────────────────────────────────────────
     IS RELEVANT
     Returns true if the query matches any knowledge entry.
     Useful for routing decisions before retrieval.
  ───────────────────────────────────────────────────────────────*/
  function isRelevant(text) {
    if (!text) return false;
    for (var i = 0; i < KNOWLEDGE_BASE.length; i++) {
      if (_score(text, KNOWLEDGE_BASE[i]) >= 3) return true;
    }
    return false;
  }

  /* ─────────────────────────────────────────────────────────────
     GET BY CATEGORY
   ───────────────────────────────────────────────────────────────*/
  function getByCategory(category) {
    return KNOWLEDGE_BASE.filter(function (e) { return e.category === category; });
  }

  /* ─────────────────────────────────────────────────────────────
     IS VERIFIED CREATOR FACT
     Returns true if the given query resolves to a CREATOR entry
     that is protected from adaptive learning overwrite.
     Used by the learning pipeline to prevent fact poisoning.
   ───────────────────────────────────────────────────────────────*/
  function isVerifiedCreatorFact(text) {
    if (!text || typeof text !== 'string') return false;
    var entry = query(text);
    if (!entry) return false;
    return (
      entry.category === CATEGORY.CREATOR &&
      entry.meta &&
      entry.meta.editableByAdaptiveLearning === false
    );
  }

  /* ─────────────────────────────────────────────────────────────
     CAN ADAPTIVE LEARNING OVERWRITE
     Returns false if the text resolves to a protected CREATOR entry.
     Adaptive learning MUST check this before promoting a new fact.
   ───────────────────────────────────────────────────────────────*/
  function canAdaptiveLearningOverwrite(text) {
    return !isVerifiedCreatorFact(text);
  }

  /* ─────────────────────────────────────────────────────────────
     GET VERIFIED CREATOR KNOWLEDGE
     Returns all CREATOR entries marked as verified.
   ───────────────────────────────────────────────────────────────*/
  function getVerifiedCreatorKnowledge() {
    return KNOWLEDGE_BASE.filter(function (e) {
      return e.category === CATEGORY.CREATOR &&
             e.meta &&
             e.meta.authority === 'verified_creator';
    });
  }

  /* ─────────────────────────────────────────────────────────────
     GREEN HEART FAMILY REGRESSION GUARD
     Convenience: always returns the correct community name.
     Prevents any system component from using 'Greyhound Family'.
   ───────────────────────────────────────────────────────────────*/
  function getCreatorCommunityName() {
    return 'Green Heart Family';
  }

  /* ─────────────────────────────────────────────────────────────
     EXPOSE — window.SRKnowledge
   ───────────────────────────────────────────────────────────────*/
  global.SRKnowledge = {
    build:                      BUILD_ID,
    CATEGORY:                   CATEGORY,
    VERIFIED_CREATOR_META:      VERIFIED_CREATOR_META,
    query:                      query,
    queryMultiple:              queryMultiple,
    isRelevant:                 isRelevant,
    getByCategory:              getByCategory,
    isVerifiedCreatorFact:      isVerifiedCreatorFact,
    canAdaptiveLearningOverwrite: canAdaptiveLearningOverwrite,
    getVerifiedCreatorKnowledge: getVerifiedCreatorKnowledge,
    getCreatorCommunityName:    getCreatorCommunityName,
  };

})(typeof window !== 'undefined' ? window : global);
