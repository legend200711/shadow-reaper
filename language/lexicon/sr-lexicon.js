/**
 * shadow-reaper-v2/language/lexicon/sr-lexicon.js
 * Shadow Reaper — Local Lexical Engine (SRLexicon)
 *
 * Build: SR-LEXICON-2
 *
 * Exposes: window.SRLexicon
 *
 * PURPOSE:
 *   Provider-based lexical lookup. Combines the existing curated definitions
 *   (CuratedProvider) with Princeton WordNet 3.1 (WordNetProvider).
 *
 * ARCHITECTURE:
 *
 *   SRLexicon
 *    ├─ CuratedProvider   — ~200 hand-authored definitions (always synchronous)
 *    └─ WordNetProvider   — 147k lemmas / 204k senses (lazy-loaded, async)
 *
 * LOOKUP ORDER:
 *   1. Curated definition (authoritative override)
 *   2. WordNet local data
 *   3. Known word / no definition (known POS from morphology)
 *   4. Unknown word
 *
 * PUBLIC API:
 *
 *   SRLexicon.lookup(word, opts, callback)
 *     opts: { pos, maxSenses, context }
 *     callback(result) where result =
 *     {
 *       word:       string,
 *       lemma:      string,
 *       status:     'KNOWN_WITH_DEFINITION' | 'KNOWN_MULTIPLE_SENSES' |
 *                   'KNOWN_NO_DEFINITION' | 'UNKNOWN_WORD' | 'PROJECT_DEFINED_TERM',
 *       provider:   'curated' | 'wordnet' | 'morphology' | null,
 *       senses:     [{ pos, def, synonyms, id? }],   // ordered by relevance
 *       diagnostics: { ... }
 *     }
 *
 *   SRLexicon.lookupSync(word, opts)
 *     Synchronous lookup — curated only + cached WordNet.
 *     If WordNet not yet loaded, falls back to curated/morphology.
 *
 *   SRLexicon.ensureLoaded(callback)
 *     Trigger WordNet index loading. Safe to call multiple times.
 *
 *   SRLexicon.rankSenses(senses, contextTokens)
 *     Contextual sense ranking — returns senses sorted by relevance score.
 *
 * DIAGNOSTICS:
 *   All results include a diagnostics object with lexical pipeline fields.
 *   Only populated in dev builds (when SRLexicon.DEV_DIAG = true).
 *
 * WordNet attribution:
 *   WordNet 3.1 Copyright 2011 Princeton University.
 *   License: see language/data/WORDNET-LICENSE.txt
 *
 * Zero external calls. Zero hosted AI. Pure deterministic local logic.
 */

(function (global) {
  'use strict';

  var BUILD_ID = 'SR-LEXICON-2';

  // ── Dev diagnostics flag (set true to populate diagnostics object) ──────────
  var DEV_DIAG = true;

  // ══════════════════════════════════════════════════════════════════════════
  // 1. CURATED PROVIDER
  // Mirrors the existing SRWordDefinitions dictionary.
  // Returns single-sense results synchronously.
  // ══════════════════════════════════════════════════════════════════════════

  // The curated definitions from sr-word-definitions.js — kept here so
  // SRLexicon is self-contained. SRWordDefinitions also remains intact for
  // backward compatibility.
  var CURATED = {
    // ── Emotional / physical states ────────────────────────────
    'exhausted':   { pos: 'adj', def: 'Completely drained of energy or strength; extremely tired.', ex: 'She was exhausted after the marathon.' },
    'tired':       { pos: 'adj', def: 'In need of rest or sleep; feeling low energy.', ex: 'He was tired after a long day of work.' },
    'fatigued':    { pos: 'adj', def: 'Extremely weary from sustained exertion; similar to exhausted.', ex: 'The soldiers were fatigued after the march.' },
    'weary':       { pos: 'adj', def: 'Feeling or showing tiredness, especially from long effort.', ex: 'She gave a weary smile.' },
    'drained':     { pos: 'adj', def: 'Having had all energy or resources used up; depleted.', ex: 'I felt completely drained after that meeting.' },
    'happy':       { pos: 'adj', def: 'Feeling or showing pleasure, contentment, or joy.', ex: 'She was happy to hear the news.' },
    'sad':         { pos: 'adj', def: 'Feeling sorrow, unhappiness, or grief.', ex: 'He felt sad when his friend moved away.' },
    'angry':       { pos: 'adj', def: 'Having a strong feeling of displeasure or hostility; annoyed or furious.', ex: 'She was angry about the unfair decision.' },
    'anxious':     { pos: 'adj', def: 'Feeling worried, uneasy, or nervous about something uncertain.', ex: 'He was anxious before the big presentation.' },
    'scared':      { pos: 'adj', def: 'Feeling fear or alarm; frightened.', ex: 'The child was scared of the dark.' },
    'excited':     { pos: 'adj', def: 'Feeling very enthusiastic and eager; stirred up emotionally.', ex: 'She was excited about her new job.' },
    'calm':        { pos: 'adj', def: 'Not showing or feeling nervousness, anger, or other strong emotions; peaceful.', ex: 'He remained calm under pressure.' },
    'bored':       { pos: 'adj', def: 'Feeling weary and uninterested due to lack of stimulation or variety.', ex: 'She was bored with the repetitive tasks.' },
    'confused':    { pos: 'adj', def: 'Unable to think clearly; bewildered or uncertain about something.', ex: 'He was confused by the contradictory instructions.' },
    'frustrated':  { pos: 'adj', def: 'Feeling distressed or annoyed because something is not working or going well.', ex: 'She was frustrated by the constant delays.' },
    'overwhelmed': { pos: 'adj', def: 'Buried or overpowered by too much of something; unable to cope.', ex: 'He felt overwhelmed by the workload.' },
    'lonely':      { pos: 'adj', def: 'Feeling isolated or unhappy because of a lack of company or connection.', ex: 'Moving to a new city, she felt lonely at first.' },
    'hopeful':     { pos: 'adj', def: 'Feeling or inspiring optimism about a future outcome; expecting something good.', ex: 'She was hopeful that things would improve.' },
    'grateful':    { pos: 'adj', def: 'Feeling or showing appreciation for something received; thankful.', ex: 'He was grateful for their support.' },
    'proud':       { pos: 'adj', def: 'Feeling deep pleasure or satisfaction from one\'s achievements or those of someone else.', ex: 'She was proud of her daughter\'s success.' },
    'embarrassed': { pos: 'adj', def: 'Feeling self-conscious, ashamed, or awkward due to a mistake or awkward situation.', ex: 'He was embarrassed when he forgot her name.' },
    'jealous':     { pos: 'adj', def: 'Feeling envy toward someone because of their advantages, success, or possessions.', ex: 'She was jealous of his natural talent.' },
    'nervous':     { pos: 'adj', def: 'Easily agitated or alarmed; feeling apprehension or worry.', ex: 'He was nervous before his first job interview.' },
    'stressed':    { pos: 'adj', def: 'Feeling mental or emotional pressure or tension from demands.', ex: 'She was stressed about the upcoming deadline.' },
    'depressed':   { pos: 'adj', def: 'In a state of general unhappiness or feeling low; clinically, suffering from depression.', ex: 'He felt depressed after losing his job.' },
    'relaxed':     { pos: 'adj', def: 'Free from tension or anxiety; at ease.', ex: 'After the vacation, she felt relaxed and refreshed.' },
    'confident':   { pos: 'adj', def: 'Feeling certain about one\'s abilities or having a strong belief in oneself.', ex: 'She was confident in her presentation skills.' },
    'surprised':   { pos: 'adj', def: 'Feeling or showing shock or astonishment at something unexpected.', ex: 'He was surprised by the party they threw for him.' },
    'disappointed': { pos: 'adj', def: 'Feeling sad or dissatisfied because something did not meet expectations.', ex: 'She was disappointed by the result.' },
    // ── Common adjectives ─────────────────────────────────────
    'big':         { pos: 'adj', def: 'Of considerable size, extent, or intensity; large.', ex: 'It was a big decision.' },
    'small':       { pos: 'adj', def: 'Of limited size; not large; little.', ex: 'They lived in a small apartment.' },
    'fast':        { pos: 'adj', def: 'Moving or capable of moving at high speed; quick.', ex: 'She is a fast runner.' },
    'slow':        { pos: 'adj', def: 'Moving or operating at below normal or desirable speed.', ex: 'The slow traffic frustrated many drivers.' },
    'bright':      { pos: 'adj', def: 'Giving out or reflecting a lot of light; vivid. Also: intelligent or quick-witted.', ex: 'The room was bright and airy.' },
    'dark':        { pos: 'adj', def: 'Having very little or no light; also used figuratively for gloomy or sinister.', ex: 'The sky grew dark before the storm.' },
    'strong':      { pos: 'adj', def: 'Having great physical power or force; robust; also, firmly established.', ex: 'She had a strong grip.' },
    'weak':        { pos: 'adj', def: 'Lacking physical strength or power; fragile or not robust.', ex: 'He felt weak after being sick.' },
    'important':   { pos: 'adj', def: 'Of great significance or value; worthy of attention.', ex: 'This is an important decision.' },
    'interesting': { pos: 'adj', def: 'Arousing curiosity or attention; holding one\'s interest.', ex: 'That\'s an interesting idea.' },
    'difficult':   { pos: 'adj', def: 'Requiring much effort or skill; not easy; hard.', ex: 'The exam was difficult.' },
    'easy':        { pos: 'adj', def: 'Achieved without great effort; not difficult.', ex: 'The first lesson was easy.' },
    'beautiful':   { pos: 'adj', def: 'Pleasing to the senses or mind in an aesthetic way; very attractive.', ex: 'The sunset was beautiful.' },
    'ugly':        { pos: 'adj', def: 'Unpleasant or repulsive to look at; not beautiful.', ex: 'The old building looked ugly next to the new ones.' },
    'smart':       { pos: 'adj', def: 'Having quick intelligence; clever or bright.', ex: 'She\'s a smart problem-solver.' },
    'brave':       { pos: 'adj', def: 'Ready to face and endure danger or pain; courageous.', ex: 'It was brave of him to speak up.' },
    'honest':      { pos: 'adj', def: 'Free of deceit and untruthfulness; truthful and sincere.', ex: 'She gave an honest answer.' },
    'kind':        { pos: 'adj', def: 'Friendly, generous, and considerate; gentle and caring.', ex: 'It was kind of you to help.' },
    'cruel':       { pos: 'adj', def: 'Causing pain or suffering; having no concern for pain in others.', ex: 'It was cruel to leave without saying goodbye.' },
    'funny':       { pos: 'adj', def: 'Causing laughter or amusement; humorous.', ex: 'He told a funny story.' },
    'serious':     { pos: 'adj', def: 'Demanding careful consideration; not light or trivial; earnest.', ex: 'This is a serious matter.' },
    'lazy':        { pos: 'adj', def: 'Unwilling to work or use energy; idle.', ex: 'He was too lazy to clean his room.' },
    'curious':     { pos: 'adj', def: 'Eager to know or learn something; inquisitive.', ex: 'She was curious about how it worked.' },
    'creative':    { pos: 'adj', def: 'Relating to or involving the use of imagination or original ideas; inventive.', ex: 'He came up with a creative solution.' },
    'patient':     { pos: 'adj', def: 'Able to accept or tolerate delays, problems, or suffering without becoming angry.', ex: 'She was patient with the slow learners.' },
    'lucky':       { pos: 'adj', def: 'Having or brought about by good luck; fortunate.', ex: 'He was lucky to find a parking spot.' },
    'friendly':    { pos: 'adj', def: 'Kind and pleasant; showing goodwill toward others.', ex: 'The staff was friendly and helpful.' },
    'rude':        { pos: 'adj', def: 'Offensively impolite or ill-mannered; disrespectful.', ex: 'It was rude to interrupt.' },
    'quiet':       { pos: 'adj', def: 'Making little or no noise; calm and undisturbed.', ex: 'The library was quiet.' },
    'loud':        { pos: 'adj', def: 'Producing much noise; noisy; also used for vivid or showy.', ex: 'The music was too loud.' },
    'clean':       { pos: 'adj', def: 'Free from dirt, marks, or unwanted matter; not dirty.', ex: 'The room was clean and tidy.' },
    'dirty':       { pos: 'adj', def: 'Covered or marked with dirt; not clean.', ex: 'His shoes were dirty from the mud.' },
    'safe':        { pos: 'adj', def: 'Protected from or not exposed to danger or risk; not likely to cause harm.', ex: 'The children were safe at home.' },
    'dangerous':   { pos: 'adj', def: 'Able or likely to cause harm or injury; not safe.', ex: 'The icy road was dangerous.' },
    'free':        { pos: 'adj', def: 'Not under the control of another; able to act at will. Also: not costing money.', ex: 'The tickets were free.' },
    'busy':        { pos: 'adj', def: 'Having a great deal to do; occupied; not free.', ex: 'She was too busy to take a break.' },
    'clear':       { pos: 'adj', def: 'Easy to understand; not confused or ambiguous. Also: transparent.', ex: 'His instructions were clear.' },
    'possible':    { pos: 'adj', def: 'Able to be done or achieved; within the realm of ability or circumstance.', ex: 'Is it possible to finish today?' },
    'perfect':     { pos: 'adj', def: 'Having all the required elements; as good as it is possible to be; flawless.', ex: 'It was a perfect day.' },
    // ── Common verbs ──────────────────────────────────────────
    'run':         { pos: 'verb', def: 'To move quickly on foot by alternating legs faster than a walk. Also: to operate or manage something.', ex: 'She runs every morning.' },
    'write':       { pos: 'verb', def: 'To mark letters or words on a surface; to compose or create text.', ex: 'He writes in his journal daily.' },
    'read':        { pos: 'verb', def: 'To look at and understand the meaning of written or printed words.', ex: 'She loves to read novels.' },
    'think':       { pos: 'verb', def: 'To use one\'s mind actively; to form thoughts, ideas, or opinions.', ex: 'He was thinking about the problem.' },
    'feel':        { pos: 'verb', def: 'To be aware of sensations or emotions; to experience something internally.', ex: 'She felt a wave of relief.' },
    'know':        { pos: 'verb', def: 'To be aware of through observation, inquiry, or information; to have knowledge of.', ex: 'Do you know the answer?' },
    'understand':  { pos: 'verb', def: 'To grasp the meaning of something; to comprehend.', ex: 'I don\'t understand the question.' },
    'learn':       { pos: 'verb', def: 'To acquire knowledge or skill through study, experience, or teaching.', ex: 'She learned to code online.' },
    'help':        { pos: 'verb', def: 'To make it easier for someone to do something; to assist or support.', ex: 'He helped her move the furniture.' },
    'work':        { pos: 'verb', def: 'To perform activity in order to accomplish something; to be employed. Also: to function correctly.', ex: 'Does this plan work?' },
    'make':        { pos: 'verb', def: 'To create, produce, or construct something. Also: to cause something to happen.', ex: 'She made a cake.' },
    'give':        { pos: 'verb', def: 'To transfer the possession of something to someone; to provide or offer.', ex: 'He gave her the keys.' },
    'take':        { pos: 'verb', def: 'To reach out and hold; to carry away; to accept or receive.', ex: 'Take a deep breath.' },
    'come':        { pos: 'verb', def: 'To move toward or arrive at a place; to occur or happen.', ex: 'Come back tomorrow.' },
    'try':         { pos: 'verb', def: 'To make an effort to do or accomplish something; to attempt.', ex: 'Try your best.' },
    'change':      { pos: 'verb', def: 'To make or become different; to alter; to transform.', ex: 'Things change over time.' },
    'build':       { pos: 'verb', def: 'To construct by putting parts or materials together; to create over time.', ex: 'They built a new house.' },
    'start':       { pos: 'verb', def: 'To begin or set in motion; to cause something to begin.', ex: 'Start from the beginning.' },
    'stop':        { pos: 'verb', def: 'To cease moving or doing; to bring to an end.', ex: 'Stop at the red light.' },
    'ask':         { pos: 'verb', def: 'To request information from someone; to put a question to.', ex: 'Ask if you need help.' },
    'answer':      { pos: 'verb', def: 'To respond to a question or call; to provide a reply.', ex: 'She answered every question correctly.' },
    'love':        { pos: 'verb', def: 'To feel deep affection or strong attachment for someone or something.', ex: 'He loves his family deeply.' },
    'hate':        { pos: 'verb', def: 'To feel intense or passionate dislike for someone or something.', ex: 'She hates injustice.' },
    'want':        { pos: 'verb', def: 'To have a desire or wish for something; to need.', ex: 'I want a cup of tea.' },
    'need':        { pos: 'verb', def: 'To require something because it is essential or important.', ex: 'You need to rest.' },
    'forget':      { pos: 'verb', def: 'To fail to remember; to lose the memory of.', ex: 'Don\'t forget to lock the door.' },
    'remember':    { pos: 'verb', def: 'To have or bring back to mind; to not forget.', ex: 'Do you remember her name?' },
    'believe':     { pos: 'verb', def: 'To accept something as true; to have confidence in.', ex: 'I believe in you.' },
    'decide':      { pos: 'verb', def: 'To make a choice or come to a resolution after consideration.', ex: 'She decided to leave early.' },
    'explain':     { pos: 'verb', def: 'To make clear the meaning of something; to give a reason for.', ex: 'Can you explain that again?' },
    'create':      { pos: 'verb', def: 'To bring something into existence; to produce or make.', ex: 'She created a new app.' },
    'find':        { pos: 'verb', def: 'To discover or locate something by searching or by chance.', ex: 'I can\'t find my keys.' },
    'lose':        { pos: 'verb', def: 'To be deprived of or cease to have something; to fail to find.', ex: 'He tends to lose things.' },
    'win':         { pos: 'verb', def: 'To achieve victory in a contest; to gain a reward through effort.', ex: 'She won the championship.' },
    'fail':        { pos: 'verb', def: 'To not succeed in achieving a goal; to be unsuccessful.', ex: 'He failed the driving test twice.' },
    'break':       { pos: 'verb', def: 'To separate into pieces by force; to stop working; to violate a rule.', ex: 'Don\'t break the rules.' },
    'fix':         { pos: 'verb', def: 'To repair something that is broken or not working; to make right.', ex: 'Can you fix the bug?' },
    'use':         { pos: 'verb', def: 'To employ for a purpose; to put into action or service.', ex: 'Use the correct tool.' },
    'grow':        { pos: 'verb', def: 'To increase in size, number, or degree; to develop over time.', ex: 'The company grew quickly.' },
    'improve':     { pos: 'verb', def: 'To make or become better in quality or condition.', ex: 'Practice will improve your skill.' },
    'reduce':      { pos: 'verb', def: 'To make smaller or less in amount, degree, or size.', ex: 'Reduce your screen time.' },
    'increase':    { pos: 'verb', def: 'To become or make greater in size, amount, or degree.', ex: 'Sales increased this quarter.' },
    'protect':     { pos: 'verb', def: 'To keep safe from harm or danger; to guard or defend.', ex: 'Wear sunscreen to protect your skin.' },
    'support':     { pos: 'verb', def: 'To bear the weight of; to provide assistance, backing, or encouragement to.', ex: 'Her family supported her decision.' },
    'connect':     { pos: 'verb', def: 'To join or link two things together; to relate or associate.', ex: 'Connect the cables first.' },
    'communicate': { pos: 'verb', def: 'To share or exchange information, feelings, or ideas with others.', ex: 'It\'s important to communicate clearly.' },
    'achieve':     { pos: 'verb', def: 'To successfully bring about or reach a desired objective through effort.', ex: 'She achieved her goal.' },
    'accept':      { pos: 'verb', def: 'To agree to receive or take something; to consider something valid.', ex: 'He accepted the offer.' },
    'avoid':       { pos: 'verb', def: 'To keep away from; to refrain from doing something.', ex: 'Try to avoid common mistakes.' },
    'allow':       { pos: 'verb', def: 'To permit; to give permission or make it possible for something to happen.', ex: 'Please allow extra time.' },
    'choose':      { pos: 'verb', def: 'To pick out or select from a number of alternatives; to decide on.', ex: 'Choose the option that fits best.' },
    // ── Common nouns ──────────────────────────────────────────
    'love':        { pos: 'noun', def: 'A deep affection and care for another; intense positive feeling.', ex: 'There is a lot of love in their family.' },
    'hate':        { pos: 'noun', def: 'Intense dislike or hostility toward someone or something.', ex: 'Hate is a destructive emotion.' },
    'fear':        { pos: 'noun', def: 'An unpleasant emotion caused by the belief that something is dangerous or threatening.', ex: 'She faced her fear of heights.' },
    'hope':        { pos: 'noun', def: 'A feeling of expectation and desire for a particular positive outcome.', ex: 'There is still hope for a solution.' },
    'idea':        { pos: 'noun', def: 'A thought or suggestion as to a possible course of action; a concept.', ex: 'She had a great idea.' },
    'problem':     { pos: 'noun', def: 'A matter or situation regarded as unwelcome and needing to be dealt with.', ex: 'We need to solve this problem.' },
    'solution':    { pos: 'noun', def: 'A means of solving a problem or dealing with a difficult situation.', ex: 'There must be a solution.' },
    'goal':        { pos: 'noun', def: 'The object of a person\'s ambition or effort; an aim or desired result.', ex: 'Her goal is to run a marathon.' },
    'memory':      { pos: 'noun', def: 'The faculty of the mind for storing and recalling past experiences and information.', ex: 'He has a sharp memory for names.' },
    'truth':       { pos: 'noun', def: 'The quality or state of being in accordance with fact or reality.', ex: 'Tell me the truth.' },
    'courage':     { pos: 'noun', def: 'The ability to do something that frightens one; bravery.', ex: 'It takes courage to speak up.' },
    'patience':    { pos: 'noun', def: 'The capacity to accept or tolerate delay, trouble, or suffering calmly.', ex: 'Learning takes patience.' },
    'intelligence': { pos: 'noun', def: 'The ability to acquire and apply knowledge and skills; mental capacity.', ex: 'Emotional intelligence is just as important as IQ.' },
    'knowledge':   { pos: 'noun', def: 'Facts, information, and skills acquired through experience or education.', ex: 'Knowledge is power.' },
    'wisdom':      { pos: 'noun', def: 'The quality of having experience, knowledge, and good judgment.', ex: 'Age often brings wisdom.' },
    // ── Common adverbs ────────────────────────────────────────
    'quickly':     { pos: 'adv', def: 'At a fast speed; rapidly; without delay.', ex: 'She finished the task quickly.' },
    'slowly':      { pos: 'adv', def: 'At a slow pace; not quickly.', ex: 'Walk slowly on the ice.' },
    'carefully':   { pos: 'adv', def: 'With attention and caution to avoid mistakes or harm.', ex: 'Read the instructions carefully.' },
    'clearly':     { pos: 'adv', def: 'In a clear way; without difficulty in understanding.', ex: 'Speak clearly so everyone can hear.' },
    'really':      { pos: 'adv', def: 'In actual fact; very; truly — used for emphasis.', ex: 'I\'m really tired.' },
    'absolutely':  { pos: 'adv', def: 'With no qualification, restriction, or limitation; completely; totally.', ex: 'I absolutely agree.' },
    'completely':  { pos: 'adv', def: 'Totally; to the full extent; without any part missing.', ex: 'I completely forgot about it.' },
  };

  // ── CuratedProvider.getSenses(lemma) → null | [{pos,def,synonyms,source}] ──
  function _curatedGetSenses(lemma) {
    if (!lemma || !CURATED[lemma]) return null;
    var c = CURATED[lemma];
    return [{ pos: c.pos, def: c.def, synonyms: [], source: 'curated', example: c.ex }];
  }

  // ── CuratedProvider.hasLemma(lemma) ─────────────────────────────────────────
  function _curatedHas(lemma) { return !!CURATED[lemma]; }

  // ══════════════════════════════════════════════════════════════════════════
  // 2. WORDNET PROVIDER
  // Lazy-loads wordnet-index.json and provides multi-sense POS-aware lookup.
  // ══════════════════════════════════════════════════════════════════════════

  var _wnIndex     = null;    // lemma → { noun:[...], verb:[...], adj:[...], adv:[...] }
  var _wnStatus    = 'unloaded';   // unloaded | loading | loaded | failed
  var _wnCallbacks = [];

  function _wnEnsureLoaded(cb) {
    cb = cb || function () {};
    if (_wnStatus === 'loaded')   { cb(null); return; }
    if (_wnStatus === 'loading')  { _wnCallbacks.push(cb); return; }

    _wnStatus = 'loading';
    _wnCallbacks.push(cb);

    function _done(err) {
      _wnStatus = err ? 'failed' : 'loaded';
      var cbs = _wnCallbacks.splice(0);
      cbs.forEach(function (c) { c(err || null); });
    }

    // Node.js
    if (typeof process !== 'undefined' && process.versions && process.versions.node) {
      try {
        var fsMod = require('fs');
        var pathMod = require('path');
        var base = pathMod.resolve(__dirname, '../data');
        if (!fsMod.existsSync(pathMod.join(base, 'wordnet-index.json'))) {
          base = pathMod.resolve(__dirname, '../../language/data');
        }
        _wnIndex = JSON.parse(fsMod.readFileSync(pathMod.join(base, 'wordnet-index.json'), 'utf8'));
        _done(null);
      } catch (e) {
        // WordNet index not available — graceful degradation
        _done(e);
      }
      return;
    }

    // Browser — fetch from static path
    var wnUrl = '/language/data/wordnet-index.json';
    if (typeof fetch !== 'undefined') {
      fetch(wnUrl)
        .then(function (r) { return r.json(); })
        .then(function (data) { _wnIndex = data; _done(null); })
        .catch(function (e) { _done(e); });
    } else {
      _done(new Error('No fetch available'));
    }
  }

  // ── WordNetProvider.getSenses(lemma, posFilter) ──────────────────────────────
  // posFilter: null | 'noun' | 'verb' | 'adj' | 'adv'
  // Returns [{pos, def, synonyms, id, source}] or null
  function _wnGetSenses(lemma, posFilter) {
    if (!_wnIndex || !lemma) return null;
    var entry = _wnIndex[lemma];
    if (!entry) return null;

    var result = [];
    var posList = posFilter ? [posFilter] : ['noun', 'verb', 'adj', 'adv'];
    posList.forEach(function (pos) {
      var senses = entry[pos];
      if (!senses) return;
      senses.forEach(function (s) {
        result.push({
          pos:      pos,
          def:      s.def,
          synonyms: s.syn || [],
          id:       s.id,
          source:   'wordnet',
        });
      });
    });

    return result.length ? result : null;
  }

  // ── WordNetProvider.hasLemma(lemma) ─────────────────────────────────────────
  function _wnHas(lemma) {
    return !!(_wnIndex && _wnIndex[lemma]);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 3. MORPHOLOGY — resolve inflected forms to lemma
  // ══════════════════════════════════════════════════════════════════════════

  var _IRREG = {
    'am':'be','is':'be','are':'be','was':'be','were':'be','been':'be',
    'has':'have','had':'have','does':'do','did':'do','done':'do',
    'went':'go','gone':'go','got':'get','gotten':'get',
    'made':'make','took':'take','taken':'take',
    'came':'come','seen':'see','saw':'see','knew':'know','known':'know',
    'thought':'think','said':'say','gave':'give','given':'give',
    'found':'find','told':'tell','left':'leave','kept':'keep',
    'held':'hold','brought':'bring','wrote':'write','written':'write',
    'sat':'sit','stood':'stand','lost':'lose','paid':'pay','met':'meet',
    'ran':'run','built':'build','fell':'fall','grew':'grow','broke':'break',
    'bought':'buy','sent':'send','won':'win','led':'lead',
    'chose':'choose','chosen':'choose','drove':'drive','driven':'drive',
    'ate':'eat','eaten':'eat','felt':'feel','flew':'fly','flown':'fly',
    'caught':'catch','heard':'hear','shown':'show','wore':'wear','worn':'wear',
    'began':'begin','begun':'begin','fought':'fight',
    'forgot':'forget','forgotten':'forget','understood':'understand',
    'sold':'sell','drew':'draw','drawn':'draw','slept':'sleep',
    'taught':'teach','threw':'throw','thrown':'throw',
    'rode':'ride','ridden':'ride','rose':'rise','risen':'rise',
    'sought':'seek','dealt':'deal','fed':'feed','hid':'hide','hidden':'hide',
    'blew':'blow','blown':'blow','woke':'wake','woken':'wake',
    'hung':'hang','laid':'lay','meant':'mean','shone':'shine',
    'sang':'sing','sung':'sing','stole':'steal','stolen':'steal',
    'swam':'swim','swum':'swim','tore':'tear','torn':'tear',
    'tired':'tire',
  };

  function _fallbackLemma(w) {
    if (_IRREG[w]) return _IRREG[w];
    if (w.endsWith('ied') && w.length > 4)  return w.slice(0,-3) + 'y';
    if (w.endsWith('ies') && w.length > 4)  return w.slice(0,-3) + 'y';
    if (w.endsWith('ing') && w.length > 5) {
      // doubled consonant: running→run, stopping→stop
      if (/([bcdfghjklmnpqrstvwxyz])\1ing$/.test(w)) {
        return w.replace(/([bcdfghjklmnpqrstvwxyz])\1ing$/, '$1');
      }
      return w.slice(0,-3);
    }
    if (w.endsWith('ed') && w.length > 4) {
      // doubled consonant: stopped→stop, planned→plan
      if (/([bcdfghjklmnpqrstvwxyz])\1ed$/.test(w)) {
        return w.replace(/([bcdfghjklmnpqrstvwxyz])\1ed$/, '$1');
      }
      // silent-e: loved→love
      var s2 = w.slice(0,-1);
      if (_curatedHas(s2) || (_wnIndex && _wnIndex[s2])) return s2;
      return w.slice(0,-2);
    }
    if (w.endsWith('er')  && w.length > 4)  return w.slice(0,-2);
    if (w.endsWith('est') && w.length > 5)  return w.slice(0,-3);
    if (w.endsWith('ier') && w.length > 4)  return w.slice(0,-3) + 'y';
    if (w.endsWith('iest')&& w.length > 5)  return w.slice(0,-4) + 'y';
    if (w.endsWith('ily') && w.length > 5)  return w.slice(0,-3) + 'y';
    if (w.endsWith('ly')  && w.length > 4)  return w.slice(0,-2);
    if (w.endsWith('s')   && w.length > 3)  return w.slice(0,-1);
    return w;
  }

  function _resolveLemma(word) {
    var w = word.toLowerCase().trim();

    // 1. SRMorphology if loaded
    var mor = global.SRMorphology;
    if (mor && typeof mor.getLemma === 'function') {
      var ml = mor.getLemma(w);
      if (ml && ml !== w) return { lemma: ml, via: 'morphology' };
    }

    // 2. Irregular table
    if (_IRREG[w]) return { lemma: _IRREG[w], via: 'irregular' };

    // 3. Suffix fallback
    var fb = _fallbackLemma(w);
    if (fb !== w) return { lemma: fb, via: 'suffix' };

    return { lemma: w, via: 'identity' };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. CONTEXTUAL SENSE RANKING
  //
  // Given a list of senses and context tokens, rank senses by relevance.
  // Uses a keyword-domain scoring approach — no hardcoded sentence lists.
  // ══════════════════════════════════════════════════════════════════════════

  // Domain keyword sets for disambiguation
  var _DOMAIN_KEYS = [
    { domain: 'finance',     pos: 'noun', keywords: ['money','deposit','account','loan','credit','financial','bank','interest','investment','savings','payment','transaction','fund','invest','deposit','debit'] },
    { domain: 'geography',   pos: 'noun', keywords: ['river','water','shore','land','slope','edge','stream','creek','embankment','flood','coast','beach','ground'] },
    { domain: 'illumination',pos: 'noun', keywords: ['lamp','light','bulb','illuminate','glow','shine','bright','candle','torch','switch','on','dark','room','sun'] },
    { domain: 'weight',      pos: 'adj',  keywords: ['heavy','bag','carry','lift','load','weight','pound','kilogram','mass','burden','suitcase','pack'] },
    { domain: 'color',       pos: 'adj',  keywords: ['color','shade','pale','dark','hue','tint','blue','white','grey','gray','pink','color','colour'] },
    { domain: 'emotion',     pos: 'adj',  keywords: ['feel','feeling','mood','heart','happy','cheerful','sad','spirit','mental','emotional','psychologically'] },
    { domain: 'speed',       pos: 'adj',  keywords: ['fast','quick','slow','speed','pace','run','move','travel','walk','drive'] },
    { domain: 'locomotion',  pos: 'verb', keywords: ['fast','run','walk','quickly','speed','move','leg','foot','jog','sprint'] },
    { domain: 'operation',   pos: 'verb', keywords: ['machine','computer','software','program','system','engine','device','operate','manage','business'] },
    { domain: 'writing',     pos: 'verb', keywords: ['letter','word','sentence','text','pen','paper','book','compose','note','email','report','write','document'] },
    { domain: 'banking',     pos: 'verb', keywords: ['deposit','account','money','bank','transaction','transfer','pay','fund','invest','savings'] },
  ];

  // Score a single sense against context tokens
  function _scoreSense(sense, ctxTokens) {
    if (!ctxTokens || !ctxTokens.length) return 0;
    var score = 0;
    var defLower = (sense.def || '').toLowerCase();
    var synLower = (sense.synonyms || []).join(' ').toLowerCase();
    var combined = defLower + ' ' + synLower;

    // Token overlap with definition
    ctxTokens.forEach(function (tok) {
      if (tok.length < 3) return;
      if (combined.indexOf(tok) !== -1) score += 2;
    });

    // Domain scoring
    _DOMAIN_KEYS.forEach(function (d) {
      if (d.pos && d.pos !== sense.pos) return;
      var domainMatch = d.keywords.filter(function (k) {
        return ctxTokens.indexOf(k) !== -1;
      }).length;
      if (domainMatch > 0) {
        // Check if this domain's keywords appear in the definition
        var defMatch = d.keywords.filter(function (k) {
          return combined.indexOf(k) !== -1;
        }).length;
        score += domainMatch * defMatch * 3;
      }
    });

    return score;
  }

  function rankSenses(senses, contextTokens) {
    if (!senses || !senses.length) return [];
    if (!contextTokens || !contextTokens.length) return senses.slice();

    var ctx = contextTokens.map(function (t) { return t.toLowerCase().trim(); });
    var scored = senses.map(function (s) {
      return { sense: s, score: _scoreSense(s, ctx) };
    });
    scored.sort(function (a, b) { return b.score - a.score; });
    return scored.map(function (x) { return x.sense; });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. CORE LOOKUP
  // ══════════════════════════════════════════════════════════════════════════

  function _buildResult(word, lemma, lemmaVia, senses, provider, status, opts) {
    var maxSenses = (opts && opts.maxSenses) || 3;
    var ctxTokens = (opts && opts.context) || [];
    var posFilter = (opts && opts.pos)     || null;

    // Filter by POS if requested
    if (posFilter && senses) {
      senses = senses.filter(function (s) { return s.pos === posFilter; });
    }

    // When no POS filter, limit per-POS to avoid one POS dominating the result.
    // Take at most perPosCap senses from each POS type, then merge and rank.
    if (!posFilter && senses && senses.length > maxSenses) {
      var posGroups = {};
      senses.forEach(function (s) {
        if (!posGroups[s.pos]) posGroups[s.pos] = [];
        posGroups[s.pos].push(s);
      });
      var posKeys = Object.keys(posGroups);
      // Number of POS groups that have entries
      var activePOS = posKeys.length;
      // Allow at most 2 per POS type in multi-POS mode (ensures breadth)
      var perPosCap = activePOS > 1 ? 2 : maxSenses;
      var balanced = [];
      posKeys.forEach(function (pos) {
        // Take the best (first) senses per POS up to the cap
        posGroups[pos].slice(0, perPosCap).forEach(function (s) { balanced.push(s); });
      });
      senses = balanced;
    }

    // Contextual ranking
    if (senses && senses.length > 1) {
      senses = rankSenses(senses, ctxTokens);
    }

    // Cap total
    if (senses) {
      senses = senses.slice(0, maxSenses);
    }

    var finalStatus = status;
    if (senses && senses.length > 1) finalStatus = 'KNOWN_MULTIPLE_SENSES';
    else if (senses && senses.length === 1) finalStatus = 'KNOWN_WITH_DEFINITION';

    var diag = {};
    if (DEV_DIAG) {
      diag = {
        LEXICAL_TARGET:         word,
        LEXICAL_LEMMA:          lemma,
        LEXICAL_LEMMA_VIA:      lemmaVia,
        LEXICAL_POS:            posFilter || 'any',
        LEXICAL_STATUS:         finalStatus,
        LEXICAL_PROVIDER:       provider,
        LEXICAL_SENSE_COUNT:    senses ? senses.length : 0,
        LEXICAL_SELECTED_SENSE: senses && senses[0] ? senses[0].def.substring(0, 60) : null,
        LEXICAL_CONFIDENCE:     provider === 'curated' ? 'high' : provider === 'wordnet' ? 'medium' : 'low',
        CONTEXTUAL_SENSE_SELECTION: !!(ctxTokens && ctxTokens.length > 0),
      };
    }

    return {
      word:        word,
      lemma:       lemma,
      status:      finalStatus,
      provider:    provider,
      senses:      senses || [],
      diagnostics: diag,
    };
  }

  // ── lookup(word, opts, callback) ─────────────────────────────────────────
  function lookup(word, opts, callback) {
    if (typeof opts === 'function') { callback = opts; opts = {}; }
    opts = opts || {};
    callback = callback || function () {};

    var w = (word || '').toLowerCase().trim().replace(/[^a-z'-]/g, '');
    if (!w) {
      callback(_buildResult(word, word, 'identity', null, null, 'UNKNOWN_WORD', opts));
      return;
    }

    // Resolve lemma
    var res = _resolveLemma(w);
    var lemma    = res.lemma;
    var lemmaVia = res.via;

    // 1. Curated — exact word or lemma
    var curatedSenses = _curatedGetSenses(w) || _curatedGetSenses(lemma);
    if (curatedSenses) {
      callback(_buildResult(w, lemma, lemmaVia, curatedSenses, 'curated', 'KNOWN_WITH_DEFINITION', opts));
      return;
    }

    // 2. WordNet — async
    _wnEnsureLoaded(function () {
      // Try word first, then lemma
      var wnsenses = _wnGetSenses(w, opts.pos || null) || _wnGetSenses(lemma, opts.pos || null);

      if (wnsenses && wnsenses.length > 0) {
        callback(_buildResult(w, lemma, lemmaVia, wnsenses, 'wordnet', 'KNOWN_WITH_DEFINITION', opts));
        return;
      }

      // 3. Known word (morphology POS) — no definition
      var mor = global.SRMorphology;
      if (mor && typeof mor.getPos === 'function') {
        var pos = mor.getPos(w);
        if (pos && pos !== 'unknown') {
          callback(_buildResult(w, lemma, lemmaVia, null, 'morphology', 'KNOWN_NO_DEFINITION', opts));
          return;
        }
      }

      // 4. Unknown
      callback(_buildResult(w, lemma, lemmaVia, null, null, 'UNKNOWN_WORD', opts));
    });
  }

  // ── lookupSync(word, opts) — curated + cached WordNet ────────────────────
  function lookupSync(word, opts) {
    opts = opts || {};
    var w = (word || '').toLowerCase().trim().replace(/[^a-z'-]/g, '');
    if (!w) return _buildResult(word, word, 'identity', null, null, 'UNKNOWN_WORD', opts);

    var res   = _resolveLemma(w);
    var lemma = res.lemma;
    var via   = res.via;

    // Curated
    var cs = _curatedGetSenses(w) || _curatedGetSenses(lemma);
    if (cs) return _buildResult(w, lemma, via, cs, 'curated', 'KNOWN_WITH_DEFINITION', opts);

    // WordNet (only if loaded)
    if (_wnIndex) {
      var ws = _wnGetSenses(w, opts.pos || null) || _wnGetSenses(lemma, opts.pos || null);
      if (ws && ws.length > 0) return _buildResult(w, lemma, via, ws, 'wordnet', 'KNOWN_WITH_DEFINITION', opts);
    }

    // Unknown
    return _buildResult(w, lemma, via, null, null, _wnIndex ? 'UNKNOWN_WORD' : 'UNKNOWN_WORD', opts);
  }

  // ── listCurated() ────────────────────────────────────────────────────────
  function listCurated() { return Object.keys(CURATED); }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. EXPOSE
  // ══════════════════════════════════════════════════════════════════════════

  global.SRLexicon = {
    build:         BUILD_ID,
    DEV_DIAG:      DEV_DIAG,
    lookup:        lookup,
    lookupSync:    lookupSync,
    ensureLoaded:  _wnEnsureLoaded,
    rankSenses:    rankSenses,
    listCurated:   listCurated,
    // Expose status for diagnostics
    get wnStatus() { return _wnStatus; },
  };

})(typeof window !== 'undefined' ? window : global);
