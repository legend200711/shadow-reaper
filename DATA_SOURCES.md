# DATA_SOURCES.md
# Shadow Reaper — Language Foundation Data Sources

**Shadow Reaper Standalone — Language Foundation**

---

## DATASET 1: Open English Vocabulary

| Field         | Value |
|---------------|-------|
| **Dataset**   | Open English Language Word Forms |
| **Source**    | Programmatically derived from the open English language |
| **License**   | Open English language — words themselves are not copyrightable in any jurisdiction |
| **Version**   | 1.0 (generated 2024) |
| **Purpose**   | Core vocabulary index for Shadow Reaper's language foundation |
| **Entries**   | 113,280 unique word forms |
| **Unique Lemmas** | 27,666 |
| **Generation** | `language/data/build-vocab-final.js`, `language/data/build-vocab-top.js` |
| **Format**    | JSON word forms with POS tags and lemma mappings |

### What is included

This dataset contains **English word forms only** — no definitions, no
example sentences, no copyrighted dictionary content.

The vocabulary covers:

- Core nouns (people, objects, places, concepts, technology, science, medicine, law, finance, education, etc.)
- Common verbs with full conjugation (indicative, progressive, past)
- Adjectives with comparative/superlative forms
- Adverbs (especially -ly forms)
- Function words (prepositions, conjunctions, pronouns, determiners)
- Domain vocabulary: software engineering, web development, science, medicine, law, business, psychology, linguistics, mathematics, music, art, education, etc.
- Productive derivational patterns: re-, pre-, un-, over-, under-, dis-, mis-, co-, de-, inter-, sub-, anti-, auto-, trans-, counter-, non-, pro-, bi-, multi-, etc.
- Suffix patterns: -tion/-sion, -ment, -ness, -ity, -ance/-ence, -able/-ible, -ful/-less, -ive, -ous, -al, -er/-or, -ist, -ism, -ly, etc.
- Irregular verb forms (go/went/gone, see/saw/seen, etc.)
- Irregular noun plurals (person/people, datum/data, criterion/criteria, etc.)

### What is NOT included

- Dictionary definitions
- Example sentences
- Etymological data
- Pronunciation guides
- Proprietary database content
- Any content from Merriam-Webster, Oxford, or other proprietary dictionaries

### License basis

English words themselves have no copyright. Word lists (as opposed to
dictionaries with definitions) are not copyrightable. This is consistent
with legal precedent in the United States and other jurisdictions.

The morphological expansion rules are original implementations based on
publicly documented English grammar.

---

## DATASET 2: Language Relationships (Static Graph)

| Field         | Value |
|---------------|-------|
| **Dataset**   | Shadow Reaper Static Language Relationship Graph |
| **Source**    | Hand-authored by Shadow Reaper Language Foundation build |
| **License**   | Shadow Reaper proprietary — original work |
| **Version**   | SR-LANG-RELATIONSHIPS-1 |
| **Purpose**   | Semantic concept relationships for language understanding |
| **Entries**   | ~150 static edges (expandable via learning) |
| **Format**    | In-memory JS object with relationship type, confidence, source |

### Relationship types included

IS_A, RELATED_TO, SYNONYM_OF, ANTONYM_OF, FORM_OF, PART_OF, USED_WITH,
ACTION_ON, DESCRIBES, CAUSES, RESULTS_IN, COMMONLY_FOLLOWS,
COMMONLY_PRECEDES, TOPIC_RELATED, INTENT_RELATED, CAN_HAVE_PROBLEM,
ASSOCIATED_WITH

---

## DATASET 3: Phrase & N-gram Patterns

| Field         | Value |
|---------------|-------|
| **Dataset**   | Shadow Reaper Static Phrase Index |
| **Source**    | Hand-authored by Shadow Reaper Language Foundation build |
| **License**   | Shadow Reaper proprietary — original work |
| **Version**   | SR-LANG-PHRASES-1 |
| **Purpose**   | Multi-word phrase pattern detection for intent/topic analysis |
| **Entries**   | ~100 static phrase patterns (2-gram to 5-gram) |
| **Format**    | In-memory indexed phrase objects |

---

## DATASET 4: Learned Language Relationships

| Field         | Value |
|---------------|-------|
| **Dataset**   | User-specific learned language relationships |
| **Source**    | Per-user interaction (authenticated users only) |
| **License**   | User's own data — UID-isolated in Firestore |
| **Version**   | Dynamic — grows over time |
| **Purpose**   | Private user vocabulary: abbreviations, custom terms, synonyms |
| **Storage**   | Firestore: `users/{uid}/shadowReaperLearnedContext` |
| **Privacy**   | UID-isolated — never shared between users |

---

## Dataset File Sizes

| File | Size | Purpose |
|------|------|---------|
| `language/data/vocab-index.json` | ~7MB | Word → {lemma, pos, rank} |
| `language/data/lemma-index.json` | ~2MB | Lemma → [word forms] |
| `language/data/freq-index.json`  | ~2MB | Word → frequency rank |
| `language/data/build-report.json` | <1KB | Build statistics |

---

## Storage Decision

**Why NOT Firebase for vocabulary:**
The 113,280-entry vocabulary is a static linguistic asset. Storing it
in Firestore would:
- Require ~113,280 document reads per session ($$$)
- Add network latency to every language lookup
- Make offline use impossible
- Violate Firestore cost optimization principles

**Decision:** Static JSON files, served from the application server,
loaded lazily into `IndexedDB` for offline caching, with in-memory
cache during session.

**Firebase is used for:** User-specific learned language relationships
(abbreviations, custom terms) stored in `users/{uid}/shadowReaperLearnedContext`
— this is appropriate because it is dynamic, per-user, and small.

---

## Global Language Learning

Global language improvements (generalized, de-identified language patterns)
flow through the full privacy pipeline:

1. Candidate extraction (pattern must match safe generalization criteria)
2. Sensitive data filter (credentials, PII, personal states: REJECTED)
3. De-identification (no UID, no personal identifiers)
4. Normalization
5. Deduplication
6. Confidence analysis (LOW by default — one user ≠ universal truth)
7. Poisoning/abuse checks
8. Founder review queue
9. Approved global language knowledge only

No raw conversation ever enters global language learning.

---

## No External Model Dependency

This vocabulary and language understanding system does NOT require:
- OpenAI API
- Google Gemini
- Anthropic Claude
- Cloudflare Workers AI
- Any hosted AI service

It is fully offline-capable for core language understanding.

---

*Document version: 1.0*
*Generated: 2024 — Shadow Reaper Language Foundation Build SR-LANG-FOUNDATION-1*
