/**
 * shadow-reaper-v2/language/lexicon/sr-word-definitions.js
 * Shadow Reaper — Local Lexical Definition Layer
 *
 * Build: SR-LEXICON-1
 *
 * Exposes: window.SRWordDefinitions
 *
 * PURPOSE:
 *   Provide actual English word meanings for WORD_DEFINITION intent responses.
 *   The vocab-index.json has lemma/POS/rank but no definitions.
 *   This module holds a curated, extensible definitions dictionary covering
 *   the most frequently asked-about words, especially emotional/descriptive
 *   adjectives and common verbs.
 *
 * ARCHITECTURE:
 *   define(word)       → { word, lemma, pos, definition, examples? } | null
 *   lookupLemma(word)  → string (lemma of word, using morphology + fallbacks)
 *
 * LOOKUP CHAIN:
 *   1. Exact match in DEFINITIONS
 *   2. Morphological lemma → lookup lemma in DEFINITIONS
 *   3. Vocab-index lemma → lookup lemma in DEFINITIONS
 *   4. Suffix-strip fallback → lookup candidate in DEFINITIONS
 *   5. null — word not found locally
 *
 * Zero external calls. Zero hosted AI. Pure deterministic local logic.
 */

(function (global) {
  'use strict';

  var BUILD_ID = 'SR-LEXICON-1';

  /* ─────────────────────────────────────────────────────────────
     DEFINITIONS DICTIONARY
     Keyed by BASE/LEMMA form only.
     Covers: emotions, states, common verbs, common adjectives,
     adverbs, and frequently asked-about words.
  ───────────────────────────────────────────────────────────────*/
  var DEFINITIONS = {

    // ── Emotional / physical states ────────────────────────────
    'exhausted':   { pos: 'adj', definition: 'Completely drained of energy or strength; extremely tired.', example: 'She was exhausted after the marathon.' },
    'tired':       { pos: 'adj', definition: 'In need of rest or sleep; feeling low energy.', example: 'He was tired after a long day of work.' },
    'fatigued':    { pos: 'adj', definition: 'Extremely weary from sustained exertion; similar to exhausted.', example: 'The soldiers were fatigued after the march.' },
    'weary':       { pos: 'adj', definition: 'Feeling or showing tiredness, especially from long effort.', example: 'She gave a weary smile.' },
    'drained':     { pos: 'adj', definition: 'Having had all energy or resources used up; depleted.', example: 'I felt completely drained after that meeting.' },
    'happy':       { pos: 'adj', definition: 'Feeling or showing pleasure, contentment, or joy.', example: 'She was happy to hear the news.' },
    'sad':         { pos: 'adj', definition: 'Feeling sorrow, unhappiness, or grief.', example: 'He felt sad when his friend moved away.' },
    'angry':       { pos: 'adj', definition: 'Having a strong feeling of displeasure or hostility; annoyed or furious.', example: 'She was angry about the unfair decision.' },
    'anxious':     { pos: 'adj', definition: 'Feeling worried, uneasy, or nervous about something uncertain.', example: 'He was anxious before the big presentation.' },
    'scared':      { pos: 'adj', definition: 'Feeling fear or alarm; frightened.', example: 'The child was scared of the dark.' },
    'excited':     { pos: 'adj', definition: 'Feeling very enthusiastic and eager; stirred up emotionally.', example: 'She was excited about her new job.' },
    'calm':        { pos: 'adj', definition: 'Not showing or feeling nervousness, anger, or other strong emotions; peaceful.', example: 'He remained calm under pressure.' },
    'bored':       { pos: 'adj', definition: 'Feeling weary and uninterested due to lack of stimulation or variety.', example: 'She was bored with the repetitive tasks.' },
    'confused':    { pos: 'adj', definition: 'Unable to think clearly; bewildered or uncertain about something.', example: 'He was confused by the contradictory instructions.' },
    'frustrated':  { pos: 'adj', definition: 'Feeling distressed or annoyed because something is not working or going well.', example: 'She was frustrated by the constant delays.' },
    'overwhelmed': { pos: 'adj', definition: 'Buried or overpowered by too much of something; unable to cope.', example: 'He felt overwhelmed by the workload.' },
    'lonely':      { pos: 'adj', definition: 'Feeling isolated or unhappy because of a lack of company or connection.', example: 'Moving to a new city, she felt lonely at first.' },
    'hopeful':     { pos: 'adj', definition: 'Feeling or inspiring optimism about a future outcome; expecting something good.', example: 'She was hopeful that things would improve.' },
    'grateful':    { pos: 'adj', definition: 'Feeling or showing appreciation for something received; thankful.', example: 'He was grateful for their support.' },
    'proud':       { pos: 'adj', definition: 'Feeling deep pleasure or satisfaction from one\'s achievements or those of someone else.', example: 'She was proud of her daughter\'s success.' },
    'embarrassed': { pos: 'adj', definition: 'Feeling self-conscious, ashamed, or awkward due to a mistake or awkward situation.', example: 'He was embarrassed when he forgot her name.' },
    'jealous':     { pos: 'adj', definition: 'Feeling envy toward someone because of their advantages, success, or possessions.', example: 'She was jealous of his natural talent.' },
    'nervous':     { pos: 'adj', definition: 'Easily agitated or alarmed; feeling apprehension or worry.', example: 'He was nervous before his first job interview.' },
    'stressed':    { pos: 'adj', definition: 'Feeling mental or emotional pressure or tension from demands.', example: 'She was stressed about the upcoming deadline.' },
    'depressed':   { pos: 'adj', definition: 'In a state of general unhappiness or feeling low; clinically, suffering from depression.', example: 'He felt depressed after losing his job.' },
    'relaxed':     { pos: 'adj', definition: 'Free from tension or anxiety; at ease.', example: 'After the vacation, she felt relaxed and refreshed.' },
    'confident':   { pos: 'adj', definition: 'Feeling certain about one\'s abilities or having a strong belief in oneself.', example: 'She was confident in her presentation skills.' },
    'surprised':   { pos: 'adj', definition: 'Feeling or showing shock or astonishment at something unexpected.', example: 'He was surprised by the party they threw for him.' },
    'disappointed': { pos: 'adj', definition: 'Feeling sad or dissatisfied because something did not meet expectations.', example: 'She was disappointed by the result.' },

    // ── Common adjectives ─────────────────────────────────────
    'big':         { pos: 'adj', definition: 'Of considerable size, extent, or intensity; large.', example: 'It was a big decision.' },
    'small':       { pos: 'adj', definition: 'Of limited size; not large; little.', example: 'They lived in a small apartment.' },
    'fast':        { pos: 'adj', definition: 'Moving or capable of moving at high speed; quick.', example: 'She is a fast runner.' },
    'slow':        { pos: 'adj', definition: 'Moving or operating at below normal or desirable speed.', example: 'The slow traffic frustrated many drivers.' },
    'bright':      { pos: 'adj', definition: 'Giving out or reflecting a lot of light; vivid. Also: intelligent or quick-witted.', example: 'The room was bright and airy.' },
    'dark':        { pos: 'adj', definition: 'Having very little or no light; also used figuratively for gloomy or sinister.', example: 'The sky grew dark before the storm.' },
    'strong':      { pos: 'adj', definition: 'Having great physical power or force; robust; also, firmly established.', example: 'She had a strong grip.' },
    'weak':        { pos: 'adj', definition: 'Lacking physical strength or power; fragile or not robust.', example: 'He felt weak after being sick.' },
    'important':   { pos: 'adj', definition: 'Of great significance or value; worthy of attention.', example: 'This is an important decision.' },
    'interesting': { pos: 'adj', definition: 'Arousing curiosity or attention; holding one\'s interest.', example: 'That\'s an interesting idea.' },
    'difficult':   { pos: 'adj', definition: 'Requiring much effort or skill; not easy; hard.', example: 'The exam was difficult.' },
    'easy':        { pos: 'adj', definition: 'Achieved without great effort; not difficult.', example: 'The first lesson was easy.' },
    'beautiful':   { pos: 'adj', definition: 'Pleasing to the senses or mind in an aesthetic way; very attractive.', example: 'The sunset was beautiful.' },
    'ugly':        { pos: 'adj', definition: 'Unpleasant or repulsive to look at; not beautiful.', example: 'The old building looked ugly next to the new ones.' },
    'smart':       { pos: 'adj', definition: 'Having quick intelligence; clever or bright.', example: 'She\'s a smart problem-solver.' },
    'brave':       { pos: 'adj', definition: 'Ready to face and endure danger or pain; courageous.', example: 'It was brave of him to speak up.' },
    'honest':      { pos: 'adj', definition: 'Free of deceit and untruthfulness; truthful and sincere.', example: 'She gave an honest answer.' },
    'kind':        { pos: 'adj', definition: 'Friendly, generous, and considerate; gentle and caring.', example: 'It was kind of you to help.' },
    'cruel':       { pos: 'adj', definition: 'Causing pain or suffering; having no concern for pain in others.', example: 'It was cruel to leave without saying goodbye.' },
    'funny':       { pos: 'adj', definition: 'Causing laughter or amusement; humorous.', example: 'He told a funny story.' },
    'serious':     { pos: 'adj', definition: 'Demanding careful consideration; not light or trivial; earnest.', example: 'This is a serious matter.' },
    'lazy':        { pos: 'adj', definition: 'Unwilling to work or use energy; idle.', example: 'He was too lazy to clean his room.' },
    'curious':     { pos: 'adj', definition: 'Eager to know or learn something; inquisitive.', example: 'She was curious about how it worked.' },
    'creative':    { pos: 'adj', definition: 'Relating to or involving the use of imagination or original ideas; inventive.', example: 'He came up with a creative solution.' },
    'patient':     { pos: 'adj', definition: 'Able to accept or tolerate delays, problems, or suffering without becoming angry.', example: 'She was patient with the slow learners.' },
    'lucky':       { pos: 'adj', definition: 'Having or brought about by good luck; fortunate.', example: 'He was lucky to find a parking spot.' },
    'friendly':    { pos: 'adj', definition: 'Kind and pleasant; showing goodwill toward others.', example: 'The staff was friendly and helpful.' },
    'rude':        { pos: 'adj', definition: 'Offensively impolite or ill-mannered; disrespectful.', example: 'It was rude to interrupt.' },
    'quiet':       { pos: 'adj', definition: 'Making little or no noise; calm and undisturbed.', example: 'The library was quiet.' },
    'loud':        { pos: 'adj', definition: 'Producing much noise; noisy; also used for vivid or showy.', example: 'The music was too loud.' },
    'clean':       { pos: 'adj', definition: 'Free from dirt, marks, or unwanted matter; not dirty.', example: 'The room was clean and tidy.' },
    'dirty':       { pos: 'adj', definition: 'Covered or marked with dirt; not clean.', example: 'His shoes were dirty from the mud.' },
    'safe':        { pos: 'adj', definition: 'Protected from or not exposed to danger or risk; not likely to cause harm.', example: 'The children were safe at home.' },
    'dangerous':   { pos: 'adj', definition: 'Able or likely to cause harm or injury; not safe.', example: 'The icy road was dangerous.' },
    'free':        { pos: 'adj', definition: 'Not under the control of another; able to act at will. Also: not costing money.', example: 'The tickets were free.' },
    'busy':        { pos: 'adj', definition: 'Having a great deal to do; occupied; not free.', example: 'She was too busy to take a break.' },
    'clear':       { pos: 'adj', definition: 'Easy to understand; not confused or ambiguous. Also: transparent.', example: 'His instructions were clear.' },
    'possible':    { pos: 'adj', definition: 'Able to be done or achieved; within the realm of ability or circumstance.', example: 'Is it possible to finish today?' },
    'perfect':     { pos: 'adj', definition: 'Having all the required elements; as good as it is possible to be; flawless.', example: 'It was a perfect day.' },

    // ── Common verbs (base/lemma form) ────────────────────────
    'run':         { pos: 'verb', definition: 'To move quickly on foot by alternating legs faster than a walk. Also: to operate or manage something.', example: 'She runs every morning.' },
    'write':       { pos: 'verb', definition: 'To mark letters or words on a surface; to compose or create text.', example: 'He writes in his journal daily.' },
    'read':        { pos: 'verb', definition: 'To look at and understand the meaning of written or printed words.', example: 'She loves to read novels.' },
    'think':       { pos: 'verb', definition: 'To use one\'s mind actively; to form thoughts, ideas, or opinions.', example: 'He was thinking about the problem.' },
    'feel':        { pos: 'verb', definition: 'To be aware of sensations or emotions; to experience something internally.', example: 'She felt a wave of relief.' },
    'know':        { pos: 'verb', definition: 'To be aware of through observation, inquiry, or information; to have knowledge of.', example: 'Do you know the answer?' },
    'understand':  { pos: 'verb', definition: 'To grasp the meaning of something; to comprehend.', example: 'I don\'t understand the question.' },
    'learn':       { pos: 'verb', definition: 'To acquire knowledge or skill through study, experience, or teaching.', example: 'She learned to code online.' },
    'help':        { pos: 'verb', definition: 'To make it easier for someone to do something; to assist or support.', example: 'He helped her move the furniture.' },
    'work':        { pos: 'verb', definition: 'To perform activity in order to accomplish something; to be employed. Also: to function correctly.', example: 'Does this plan work?' },
    'make':        { pos: 'verb', definition: 'To create, produce, or construct something. Also: to cause something to happen.', example: 'She made a cake.' },
    'give':        { pos: 'verb', definition: 'To transfer the possession of something to someone; to provide or offer.', example: 'He gave her the keys.' },
    'take':        { pos: 'verb', definition: 'To reach out and hold; to carry away; to accept or receive.', example: 'Take a deep breath.' },
    'come':        { pos: 'verb', definition: 'To move toward or arrive at a place; to occur or happen.', example: 'Come back tomorrow.' },
    'try':         { pos: 'verb', definition: 'To make an effort to do or accomplish something; to attempt.', example: 'Try your best.' },
    'change':      { pos: 'verb', definition: 'To make or become different; to alter; to transform.', example: 'Things change over time.' },
    'build':       { pos: 'verb', definition: 'To construct by putting parts or materials together; to create over time.', example: 'They built a new house.' },
    'start':       { pos: 'verb', definition: 'To begin or set in motion; to cause something to begin.', example: 'Start from the beginning.' },
    'stop':        { pos: 'verb', definition: 'To cease moving or doing; to bring to an end.', example: 'Stop at the red light.' },
    'ask':         { pos: 'verb', definition: 'To request information from someone; to put a question to.', example: 'Ask if you need help.' },
    'answer':      { pos: 'verb', definition: 'To respond to a question or call; to provide a reply.', example: 'She answered every question correctly.' },
    'love':        { pos: 'verb', definition: 'To feel deep affection or strong attachment for someone or something.', example: 'He loves his family deeply.' },
    'hate':        { pos: 'verb', definition: 'To feel intense or passionate dislike for someone or something.', example: 'She hates injustice.' },
    'want':        { pos: 'verb', definition: 'To have a desire or wish for something; to need.', example: 'I want a cup of tea.' },
    'need':        { pos: 'verb', definition: 'To require something because it is essential or important.', example: 'You need to rest.' },
    'forget':      { pos: 'verb', definition: 'To fail to remember; to lose the memory of.', example: 'Don\'t forget to lock the door.' },
    'remember':    { pos: 'verb', definition: 'To have or bring back to mind; to not forget.', example: 'Do you remember her name?' },
    'believe':     { pos: 'verb', definition: 'To accept something as true; to have confidence in.', example: 'I believe in you.' },
    'decide':      { pos: 'verb', definition: 'To make a choice or come to a resolution after consideration.', example: 'She decided to leave early.' },
    'explain':     { pos: 'verb', definition: 'To make clear the meaning of something; to give a reason for.', example: 'Can you explain that again?' },
    'create':      { pos: 'verb', definition: 'To bring something into existence; to produce or make.', example: 'She created a new app.' },
    'find':        { pos: 'verb', definition: 'To discover or locate something by searching or by chance.', example: 'I can\'t find my keys.' },
    'lose':        { pos: 'verb', definition: 'To be deprived of or cease to have something; to fail to find.', example: 'He tends to lose things.' },
    'win':         { pos: 'verb', definition: 'To achieve victory in a contest; to gain a reward through effort.', example: 'She won the championship.' },
    'fail':        { pos: 'verb', definition: 'To not succeed in achieving a goal; to be unsuccessful.', example: 'He failed the driving test twice.' },
    'break':       { pos: 'verb', definition: 'To separate into pieces by force; to stop working; to violate a rule.', example: 'Don\'t break the rules.' },
    'fix':         { pos: 'verb', definition: 'To repair something that is broken or not working; to make right.', example: 'Can you fix the bug?' },
    'use':         { pos: 'verb', definition: 'To employ for a purpose; to put into action or service.', example: 'Use the correct tool.' },
    'grow':        { pos: 'verb', definition: 'To increase in size, number, or degree; to develop over time.', example: 'The company grew quickly.' },
    'improve':     { pos: 'verb', definition: 'To make or become better in quality or condition.', example: 'Practice will improve your skill.' },
    'reduce':      { pos: 'verb', definition: 'To make smaller or less in amount, degree, or size.', example: 'Reduce your screen time.' },
    'increase':    { pos: 'verb', definition: 'To become or make greater in size, amount, or degree.', example: 'Sales increased this quarter.' },
    'protect':     { pos: 'verb', definition: 'To keep safe from harm or danger; to guard or defend.', example: 'Wear sunscreen to protect your skin.' },
    'support':     { pos: 'verb', definition: 'To bear the weight of; to provide assistance, backing, or encouragement to.', example: 'Her family supported her decision.' },
    'connect':     { pos: 'verb', definition: 'To join or link two things together; to relate or associate.', example: 'Connect the cables first.' },
    'communicate': { pos: 'verb', definition: 'To share or exchange information, feelings, or ideas with others.', example: 'It\'s important to communicate clearly.' },
    'achieve':     { pos: 'verb', definition: 'To successfully bring about or reach a desired objective through effort.', example: 'She achieved her goal.' },
    'accept':      { pos: 'verb', definition: 'To agree to receive or take something; to consider something valid.', example: 'He accepted the offer.' },
    'avoid':       { pos: 'verb', definition: 'To keep away from; to refrain from doing something.', example: 'Try to avoid common mistakes.' },
    'allow':       { pos: 'verb', definition: 'To permit; to give permission or make it possible for something to happen.', example: 'Please allow extra time.' },
    'choose':      { pos: 'verb', definition: 'To pick out or select from a number of alternatives; to decide on.', example: 'Choose the option that fits best.' },

    // ── Common nouns ──────────────────────────────────────────
    'love':        { pos: 'noun', definition: 'A deep affection and care for another; intense positive feeling.', example: 'There is a lot of love in their family.' },
    'hate':        { pos: 'noun', definition: 'Intense dislike or hostility toward someone or something.', example: 'Hate is a destructive emotion.' },
    'fear':        { pos: 'noun', definition: 'An unpleasant emotion caused by the belief that something is dangerous or threatening.', example: 'She faced her fear of heights.' },
    'hope':        { pos: 'noun', definition: 'A feeling of expectation and desire for a particular positive outcome.', example: 'There is still hope for a solution.' },
    'idea':        { pos: 'noun', definition: 'A thought or suggestion as to a possible course of action; a concept.', example: 'She had a great idea.' },
    'problem':     { pos: 'noun', definition: 'A matter or situation regarded as unwelcome and needing to be dealt with.', example: 'We need to solve this problem.' },
    'solution':    { pos: 'noun', definition: 'A means of solving a problem or dealing with a difficult situation.', example: 'There must be a solution.' },
    'goal':        { pos: 'noun', definition: 'The object of a person\'s ambition or effort; an aim or desired result.', example: 'Her goal is to run a marathon.' },
    'memory':      { pos: 'noun', definition: 'The faculty of the mind for storing and recalling past experiences and information.', example: 'He has a sharp memory for names.' },
    'truth':       { pos: 'noun', definition: 'The quality or state of being in accordance with fact or reality.', example: 'Tell me the truth.' },
    'courage':     { pos: 'noun', definition: 'The ability to do something that frightens one; bravery.', example: 'It takes courage to speak up.' },
    'patience':    { pos: 'noun', definition: 'The capacity to accept or tolerate delay, trouble, or suffering calmly.', example: 'Learning takes patience.' },
    'intelligence': { pos: 'noun', definition: 'The ability to acquire and apply knowledge and skills; mental capacity.', example: 'Emotional intelligence is just as important as IQ.' },
    'knowledge':   { pos: 'noun', definition: 'Facts, information, and skills acquired through experience or education.', example: 'Knowledge is power.' },
    'wisdom':      { pos: 'noun', definition: 'The quality of having experience, knowledge, and good judgment.', example: 'Age often brings wisdom.' },

    // ── Common adverbs ────────────────────────────────────────
    'quickly':     { pos: 'adv', definition: 'At a fast speed; rapidly; without delay.', example: 'She finished the task quickly.' },
    'slowly':      { pos: 'adv', definition: 'At a slow pace; not quickly.', example: 'Walk slowly on the ice.' },
    'carefully':   { pos: 'adv', definition: 'With attention and caution to avoid mistakes or harm.', example: 'Read the instructions carefully.' },
    'clearly':     { pos: 'adv', definition: 'In a clear way; without difficulty in understanding.', example: 'Speak clearly so everyone can hear.' },
    'really':      { pos: 'adv', definition: 'In actual fact; very; truly — used for emphasis.', example: 'I\'m really tired.' },
    'absolutely':  { pos: 'adv', definition: 'With no qualification, restriction, or limitation; completely; totally.', example: 'I absolutely agree.' },
    'completely':  { pos: 'adv', definition: 'Totally; to the full extent; without any part missing.', example: 'I completely forgot about it.' },
  };

  /* ─────────────────────────────────────────────────────────────
     SUFFIX FALLBACK — minimal inline lemmatizer
     Used when SRMorphology is unavailable.
  ───────────────────────────────────────────────────────────────*/
  var _IRREGULAR = {
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
    'tired':'tire','exhausted':'exhaust',
  };

  function _lemmaFallback(word) {
    var w = word.toLowerCase().trim();
    if (_IRREGULAR[w]) return _IRREGULAR[w];
    // -ed → stem, -ing → stem, -er/-est for adjectives
    if (w.endsWith('ied') && w.length > 4)  return w.slice(0,-3) + 'y';
    if (w.endsWith('ies') && w.length > 4)  return w.slice(0,-3) + 'y';
    if (w.endsWith('ing') && w.length > 5)  { var s = w.slice(0,-3); return s; }
    if (w.endsWith('ed')  && w.length > 4)  { var s2 = w.slice(0,-2); return DEFINITIONS[s2] ? s2 : w.slice(0,-1); }
    if (w.endsWith('er')  && w.length > 4)  return w.slice(0,-2);
    if (w.endsWith('est') && w.length > 5)  return w.slice(0,-3);
    if (w.endsWith('ier') && w.length > 4)  return w.slice(0,-3) + 'y';
    if (w.endsWith('iest')&& w.length > 5)  return w.slice(0,-4) + 'y';
    if (w.endsWith('ly')  && w.length > 4)  return w.slice(0,-2);
    if (w.endsWith('ily') && w.length > 5)  return w.slice(0,-3) + 'y';
    if (w.endsWith('s')   && w.length > 3)  return w.slice(0,-1);
    return w;
  }

  /* ─────────────────────────────────────────────────────────────
     lookupLemma — get lemma for a word form
  ───────────────────────────────────────────────────────────────*/
  function lookupLemma(word) {
    if (!word) return word;
    var w = word.toLowerCase().trim();

    // 1. Exact in definitions
    if (DEFINITIONS[w]) return w;

    // 2. SRMorphology if available
    var mor = global.SRMorphology;
    if (mor) {
      var lemma = mor.getLemma(w);
      if (lemma && lemma !== w && DEFINITIONS[lemma]) return lemma;
    }

    // 3. SRVocabIndex if available via morphology's internal — fall through to suffix strip
    // 4. Suffix fallback
    var candidate = _lemmaFallback(w);
    if (candidate !== w && DEFINITIONS[candidate]) return candidate;

    // 5. Try stripping doubled consonant (running → run, stopped → stop)
    if (w.length > 4 && /([bcdfghjklmnpqrstvwxyz])\1(ing|ed)$/.test(w)) {
      var doubled = w.replace(/([bcdfghjklmnpqrstvwxyz])\1(ing|ed)$/, '$2' === 'ing' ? '' : '');
      var dc = w.replace(/([bcdfghjklmnpqrstvwxyz])\1(ing|ed)$/, function(m,c,s){ return s === 'ing' ? c : c; });
      if (DEFINITIONS[dc]) return dc;
    }

    return w; // return as-is; define() will return null
  }

  /* ─────────────────────────────────────────────────────────────
     define — primary public API
     Returns { word, lemma, pos, definition, example } or null.
  ───────────────────────────────────────────────────────────────*/
  function define(word) {
    if (!word || typeof word !== 'string') return null;
    var w = word.toLowerCase().trim().replace(/[^a-z'-]/g, '');
    if (!w) return null;

    // Direct lookup
    if (DEFINITIONS[w]) {
      return Object.assign({ word: w, lemma: w }, DEFINITIONS[w]);
    }

    // Via lemma resolution
    var lemma = lookupLemma(w);
    if (lemma !== w && DEFINITIONS[lemma]) {
      return Object.assign({ word: w, lemma: lemma }, DEFINITIONS[lemma]);
    }

    return null;
  }

  /* ─────────────────────────────────────────────────────────────
     hasDefinition — quick existence check
  ───────────────────────────────────────────────────────────────*/
  function hasDefinition(word) {
    return define(word) !== null;
  }

  /* ─────────────────────────────────────────────────────────────
     listAll — expose keys for testing
  ───────────────────────────────────────────────────────────────*/
  function listAll() {
    return Object.keys(DEFINITIONS);
  }

  /* ─────────────────────────────────────────────────────────────
     EXPOSE — window.SRWordDefinitions
  ───────────────────────────────────────────────────────────────*/
  global.SRWordDefinitions = {
    build:           BUILD_ID,
    define:          define,
    lookupLemma:     lookupLemma,
    hasDefinition:   hasDefinition,
    listAll:         listAll,
  };

})(typeof window !== 'undefined' ? window : global);
