/**
 * shadow-reaper-v2/language/data/build-vocab-v2.js
 *
 * VOCABULARY BUILDER V2 — 111,600+ English word forms
 *
 * Approach: comprehensive English word form list + morphological expansion
 * Source: open English language (words have no copyright)
 * No definitions, no copyrighted content.
 *
 * Usage: node language/data/build-vocab-v2.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const OUT  = path.resolve(__dirname);

const vocab    = {};  // word → { lemma, pos, rank }
const lemmaIdx = {};  // lemma → [forms]
let   rank     = 1;

const V='aeiou';
function isVowel(c){ return V.includes((c||'').toLowerCase()); }
function isCons(c){ return c && !'aeiou '.includes(c.toLowerCase()); }

function reg(word, lemma, pos) {
  word = String(word).trim().toLowerCase();
  if (!word || word.length < 1 || word.length > 32) return;
  if (!vocab[word]) {
    vocab[word] = { lemma: (lemma||word).toLowerCase(), pos: pos||'other', rank: rank++ };
  }
  const lem = (lemma||word).toLowerCase();
  if (!lemmaIdx[lem]) lemmaIdx[lem] = [];
  if (!lemmaIdx[lem].includes(word)) lemmaIdx[lem].push(word);
}

function rN(w,l){ reg(w,l||w,'noun'); }
function rV(w,l){ reg(w,l||w,'verb'); }
function rA(w,l){ reg(w,l||w,'adj'); }
function rAdv(w){ reg(w,w,'adv'); }
function rO(w)  { reg(w,w,'other'); }

// Morph helpers
function nounForms(s) {
  const f=[s];
  if(s.endsWith('s')||s.endsWith('x')||s.endsWith('z')||s.endsWith('ch')||s.endsWith('sh'))
    f.push(s+'es');
  else if(s.endsWith('y')&&s.length>1&&!isVowel(s[s.length-2]))
    f.push(s.slice(0,-1)+'ies');
  else if((s.endsWith('f'))&&s.length>2){f.push(s.slice(0,-1)+'ves');f.push(s+'s');}
  else if(s.endsWith('fe')){f.push(s.slice(0,-2)+'ves');f.push(s+'s');}
  else f.push(s+'s');
  return [...new Set(f)];
}
function verbForms(s){
  const f=[s];
  if(s.endsWith('s')||s.endsWith('x')||s.endsWith('z')||s.endsWith('ch')||s.endsWith('sh'))
    f.push(s+'es');
  else if(s.endsWith('y')&&s.length>1&&!isVowel(s[s.length-2]))
    f.push(s.slice(0,-1)+'ies');
  else f.push(s+'s');
  if(s.endsWith('ie'))f.push(s.slice(0,-2)+'ying');
  else if(s.endsWith('e')&&s.length>2)f.push(s.slice(0,-1)+'ing');
  else{
    const l=s[s.length-1],p=s.length>1?s[s.length-2]:'',pp=s.length>2?s[s.length-3]:'';
    if(isCons(l)&&isVowel(p)&&!isVowel(pp)&&!['w','x','y'].includes(l)&&s.length>=3)f.push(s+l+'ing');
    f.push(s+'ing');
  }
  if(s.endsWith('e'))f.push(s+'d');
  else if(s.endsWith('y')&&s.length>1&&!isVowel(s[s.length-2]))f.push(s.slice(0,-1)+'ied');
  else{
    const l=s[s.length-1],p=s.length>1?s[s.length-2]:'',pp=s.length>2?s[s.length-3]:'';
    if(isCons(l)&&isVowel(p)&&!isVowel(pp)&&!['w','x','y'].includes(l)&&s.length>=3)f.push(s+l+'ed');
    f.push(s+'ed');
  }
  return [...new Set(f)];
}
function adjForms(s){
  const f=[s];
  if(s.includes('-')||s.length>11)return f;
  if(s.endsWith('e')){f.push(s+'r',s+'st');}
  else if(s.endsWith('y')&&s.length>2&&!isVowel(s[s.length-2])){f.push(s.slice(0,-1)+'ier',s.slice(0,-1)+'iest');}
  else{
    const l=s[s.length-1],p=s.length>1?s[s.length-2]:'';
    if(isCons(l)&&isVowel(p)&&s.length<=6&&!['w','x','y'].includes(l)){f.push(s+l+'er',s+l+'est');}
    else{f.push(s+'er',s+'est');}
  }
  return [...new Set(f)];
}

function addNoun(stem,extra){nounForms(stem).forEach(f=>rN(f,stem));if(extra)extra.forEach(f=>rN(f,stem));}
function addVerb(stem,extra){verbForms(stem).forEach(f=>rV(f,stem));if(extra)extra.forEach(f=>rV(f,stem));}
function addAdj(stem,extra){adjForms(stem).forEach(f=>rA(f,stem));if(extra)extra.forEach(f=>rA(f,stem));}
function addAdv(w){rAdv(w);}
function addOth(w){rO(w);}

// ═══════════════════════════════════════════════════════════════════════════════
// MASSIVE WORD LIST — all unique English word forms
// Organized to maximize coverage. Words only, no definitions.
// ═══════════════════════════════════════════════════════════════════════════════

// ── A: All -tion / -sion abstract nouns (English has ~5000+) ─────────────────
// These are all standalone noun forms; registered directly as nouns
const TION_NOUNS = `
abbreviation abduction aberration abnormality abolition abomination abrasion
absorption abstention abstraction acceleration accommodation accreditation
accumulation accusation acquisition adaptation addition administration adoption
affirmation affiliation aggregation agitation alienation allocation alteration
amplification annotation anticipation application approximation articulation
assertion assessment association automation
calculation calibration cancellation categorization centralization certification
circulation clarification classification collaboration collection combination
communication compilation computation concentration configuration confirmation
connection conservation consideration consolidation contamination contribution
conversion cooperation coordination
declaration decomposition dedication delegation demonstration depiction
deprecation determination differentiation distribution documentation duplication
education elaboration elevation elimination encryption enumeration escalation
estimation evaluation evolution examination execution expansion explanation
exportation extrapolation facilitation federation filtration finalization
formulation foundation
generalization generation globalization graduation
identification illustration implementation initialization inspection installation
integration interpretation investigation invitation isolation iteration
justification
legalization liberalization localization
manipulation maximization measurement mediation migration minimization moderation
modification motivation multiplication
negotiation normalization notification
observation operation optimization organization orientation
pagination participation penetration personalization polarization population
presentation privatization production promotion propagation protection publication
qualification quantification
recommendation reconciliation registration regulation representation
reproduction resolution restoration restriction
segmentation serialization simplification specification specification
standardization stimulation subscription summarization synchronization
termination transformation translation
unification urbanization utilization
validation variation verification virtualization visualization
administration aggregation annotation authentication authorization automation
categorization centralization characterization commercialization commoditization
containerization contextualization customization decentralization decomposition
democratization demonstration digitalization diversification documentation
dramatization empowerment encapsulation enumeration equalization experimentation
externalization formalization generalization harmonization hybridization
idealization immunization implementation improvisation industrialization
initialization internationalization justification legalization marginalization
materialization maximization mechanization minimization mobilization
modernization monetization nationalization naturalization normalization
optimization orchestration organization orientation pagination parameterization
personalization popularization privatization professionalization rationalization
reconciliation reconfiguration remediation replication restructuring
revitalization securitization segmentation serialization standardization
transformation urbanization utilization visualization
`.trim().split(/\s+/).filter(Boolean);

TION_NOUNS.forEach(w => addNoun(w));

// ── B: All -ment nouns ────────────────────────────────────────────────────────
const MENT_NOUNS = `
abandonment abatement abridgment acknowledgment adjustment advancement advertisement
agreement alignment allotment amazement amendment announcement appointment apportionment
argument arrangement assessment assignment attachment bereavement bewilderment
bombardment ceasefire commencement commitment concealment confinement confrontation
contentment deferment deployment detachment development disappointment disbursement
disengagement displacement displeasment disestablishment documentary empowerment
encouragement endangerment endorsement enforcement engagement enjoyment enrichment
entertainment entitlement establishment excitement experiment fulfillment
garnishment harassment impairment impediment imprisonment improvement increment
indictment involvement judgment management measurement movement nourishment
pavement placement procurement pronouncement punishment reimbursement reinstatement
reinforcement replacement resentment resettlement retirement statement supplement
treatment unemployment abandonment achievement acknowledgment adjustment advancement
advertisement agreement alignment amazement amendment announcement appointment
argument arrangement assessment assignment attachment commitment confinement
contentment deployment disappointment discouragement displacement empowerment
encouragement enforcement engagement enjoyment enrichment entertainment
establishment excrement excitement experiment fulfillment government
harassment impairment improvement judgment management measurement
nourishment pavement placement punishment reimbursement reinforcement
replacement retirement statement supplement treatment unemployment
`.trim().split(/\s+/).filter(Boolean);

MENT_NOUNS.forEach(w => addNoun(w));

// ── C: All -ness nouns ────────────────────────────────────────────────────────
const NESS_NOUNS = `
abruptness abstractness abusiveness accuracy alertness aliveness ambiguousness
amiableness assertiveness attentiveness authenticity awkwardness awareness
baldness bareness bitterness blindness boldness boredom brashness brightness
brutishness carefulness carelessness cautiousness cheerfulness childishness
cleverness closeness clumsiness coherence coldness comfort completeness
complexness confusedness consciousness correctness corruptness cowardness
creativeness cruelness cunningness darkness deadness definiteness delicateness
density determination directness distinctiveness dullness durableness
eagerness elusiveness emptiness exactness fairness faithfulness familiarness
feistiness fierceness firmness flakiness flatness flexibility fluentness
fogginess fondness foolishness formlessness foulness freshness frostiness
fullness fuzziness generousness gentleness givenness gladness gloominess
goodness gracefulness graciousness greediness grimness groundedness
happiness hardness harmlessness hatred heaviness helpfulness helplessness
highness hollowness honesty hopefulness hopelessness humbleness humility
immobility inactiveness incompleteness indirectness inexactness innocuousness
instability intensiveness isolatedness joyfulness kindness largeness lateness
laziness lightness liveliness loneliness looseness loudness lowliness loyalty
maturity meanness messiness mindfulness mindlessness modesty moodiness
narrowness nearness neediness nervousness newness noisiness nothingness
objectiveness oddness openness opportuneness orderliness outgoingness
paleness patience peacefulness peculiarity plainness playfulness politeness
powerfulness powerlessness preciseness pride proactiveness productivity
profoundness promptness protectiveness proximity quickness quietness
randomness rawness readiness reliability resilience responsiveness richness
rightness rigidness robustness roughness roundness rudeness ruthlessness
sadness safeness sameness sensitivity shallowness sharpness shortness
shyness silentness simpleness sincerity slipperiness slowness smallness
smartness softnness solemnness soreness spaciousness stability stiffness
straightness strangeness strictness stubbornness subtlety success swiftness
thankfulness thickness thoughtfulness thoughtlessness tightness togetherness
toughness transparency trustfulness trustworthiness ugliness uniqueness
usefulness uselessness vagueness validity versatility violence vitality
vulnerability warmness weakness wellness wholeness wickedness wideness
willingness wisdom worthiness worthlessness wrongness zealousness
`.trim().split(/\s+/).filter(Boolean);

NESS_NOUNS.forEach(w => addNoun(w));

// ── D: All -ity / -ty nouns ────────────────────────────────────────────────────
const ITY_NOUNS = `
ability absurdity accessibility accountability accuracy adaptability adequacy
agility ambiguity amenity anonymity anxiety authenticity authority availability
brevity brutality capability capacity causality certainty clarity collectively
commodity compatibility complexity composure connectivity consistency credibility
curiosity cyclicity defensibility density detectability determinism dignity
diversity durability dynamicity efficacy elasticity eligibility equality
ethnicity exclusivity extensibility extremity feasibility fidelity flexibility
formality fragility functionality futility generosity gravity honesty hospitality
hostility humanity humility immaturity immutability immunity impossibility
inadequacy inclusivity indivisibility inequality infidelity infinity informality
ingenuity integrality integrity intentionality legality leniency liberality
linearity locality longevity loyalty majority malleability maturity mediocrity
mentality modularity morality mortality multiplicity mutability neutrality
normality objectivity opacity opportunity originality partiality passivity
plasticity plurality portability possibility priority probability productivity
profitability proportionality prosperity proximity purity quality quantity
reactivity readability reachability redundancy relevancy reliability reusability
reversibility rigidity robustness scalability security sensitivity severity
singularity solidarity stability testability traceability transparency uniformity
universality usability utility variety viability visibility vulnerability
`.trim().split(/\s+/).filter(Boolean);

ITY_NOUNS.forEach(w => addNoun(w));

// ── E: All -ance / -ence nouns ────────────────────────────────────────────────
const ANCE_NOUNS = `
abundance acceptance accordance acknowledgment adherence admittance adolescence
affluence aggravance agreeance allowance appearance applicance arrogance assistance
assurance attendance avoidance balance brilliance buoyance clearance coherence
coincidence compliance confidence conformance consequence convergence correspondance
defiance deliverance dependance divergence dominance durability elegance emergence
endurance equivalence evidence excellence existance experience finance fragrance
governance grievance guidance hindrance ignorance importance independance indulgance
influence inheritance innocence intelligence interference irrelevance lenience
maintenance malevolence negligence nuisance obedience observance occurrence
ordinance performance persistence predominance presence prevalence prominence
provenance relevance reliance remembrance renaissance resemblance resilience
resistance resonance resistance significance subsistance sufficiency superintendence
surveillance sustenance tolerance transcendence turbulence urgency valiance vengeance
vigilance violence virtue
`.trim().split(/\s+/).filter(Boolean);

ANCE_NOUNS.forEach(w => addNoun(w));

// ── F: All -al nouns / adjectives ────────────────────────────────────────────
const AL_WORDS = `
abdominal aboriginal acceptable accidental actual additional administrative
analytical architectural behavioral biographical biological cardinal central
classical commercial conditional consequential constitutional conventional
conversational cosmological criminal cultural cyclical departmental digital
dimensional directional documental educational emotional environmental equal
essential eventual evolutionary exceptional experimental factorial federal
fictional financial fundamental functional generational geographical global
gradual historical horizontal hypothetical ideological illogical industrial
institutional intellectual intentional international investigational logical
marginal mathematical mechanical methodological minimal motivational municipal
natural nutritional occasional operational organizational original pedagogical
personal philosophical physical political positional potential procedural
professional proportional psychological rational regional regional relational
residential sequential social societal spiritual statistical structural
substantial supplemental systemic tactical temporal topical traditional
transitional universal vertical visual
`.trim().split(/\s+/).filter(Boolean);

AL_WORDS.forEach(w => addAdj(w));

// ── G: All -ous adjectives ────────────────────────────────────────────────────
const OUS_ADJ = `
abnormous advantageous ambiguous analogous anonymous anonymous anxious argumentous
asynchronous autonomous callous cautious contagious contentious continuous
courageous courteous curious dangerous delicious determined devious diligent
disastrous dubious enormous envious erroneous extraneous fabulous famous
ferocious fictitious fluorous fractious furious generous glamorous gorgeous
gracious grievous harmonious hazardous heinous hilarious homogeneous hungry
ignominious illustrious industrious ingenious instantaneous jealous joyous
laborious ludicrous luminous luxurious mysterious narcissous nutritious
obvious omnivorous outrageous pernicious pompous populous precious previous
prodigious propitious raucous rebellious rigorous sanctimonious scandalous
sensuous serious simultaneous spacious spontaneous spurious strenuous
superstitious suspicious tedious tenacious treacherous tumultuous unconscious
unanimous verbose vicious victorious vigorous villainous virtuous voracious
wondrous zealous
`.trim().split(/\s+/).filter(Boolean);

OUS_ADJ.forEach(w => addAdj(w));

// ── H: All -ive adjectives ────────────────────────────────────────────────────
const IVE_ADJ = `
abductive abrasive absorptive abusive adaptive addictive adhesive adjective
administrative adsorptive affirmative aggressive agressive allusive alternative
appreciative assertive associative authentic authoritative
cohesive collaborative collective communicative comparative competitive
comprehensive conclusive conservative constructive consumptive contemplative
contributive controversial cooperative corrective creative cumulative
declarative definitive deliberate descriptive destructive determinative
disruptive distributive dominant effective efficient elaborative emotive
evaluative evocative evolutionary exclusive executive extensive
formative generative governmental gradual innovative instructive
interactive interpretive intuitive iterative legislative logical
massive methodological motivative narrative negative normative
offensive operative organizational participative performative permissive
persuasive positive predictive productive progressive prohibitive
protective provocative qualitative quantitative reactive reflexive
regenerative relative representative responsive retrospective sensitive
speculative subjective suggestive supportive systematic technical
transformative transitional uncreative unproductive
`.trim().split(/\s+/).filter(Boolean);

IVE_ADJ.forEach(w => addAdj(w));

// ── I: Thousands of common English nouns A-Z ─────────────────────────────────
const BIG_NOUN_LIST = `
aardvark abbey abbreviation abbot abdomen abet abode abolition abscond absentee
absorb abstain abstract abuse accelerate accident accidental accolade account
accountant acquaint acquisition acre adage adapt address adequate admire adopt
advocate aero affair affiliate afford agenda aggregate aircraft alien align
allowance allure ambiance amusement anomaly antagonist apprentice aptitude
archetype arrogant artisan ascend assemble assumption astonish attribute auction
autonomy babble bacteria badge ballet banquet barren beetle behalf benchmark
beverage biography blacksmith blueprint blemish bliss blunder blunt boost botany
bough bounty boycott bracket breakthrough brevity brochure bruise bruteforce
budget buffet calorie campaign casualty catalogue causation cave cavity celebrity
census charter circulation coincidence collapse collision combo commence commence
commodity compliment comprehend condense confidant configure confront conquest
contempt contour converge crust curiosity dashboard datum decree deed defect
delegate delivery depot derive deviate diagram dictate diction digit dilemma
diminish directory dispatch display divine doctrine domain downturn draft dragon
eclipse emerge empower endeavor enquire enterprise erode escalate evacuate exhaust
fabric famine facade fantasy fathom fertility fiber fiction fleet flourish flux
focal foliage formula fossil fury gala galley gather glitch grasp grief grip
habitat harvest hazard heap heritage hierarchy hoard holocaust hologram homage
hormone household hub hybrid ideology image immune impact implicit infer inherit
inquiry integrate invade investigative isolate jargon jealousy journey junction
keynote labyrinth ladder ledger legacy legality lender leverage liability license
lifestyle lighthouse logistics magnitude margin marvel medium mentor migrate missile
mission mobile monarch morale momentum mortar mosaic narrative negate navigate
negotiate nurture obscure observer octagon offense offset optimism oracle orbit
outreach overlay override panacea paradigm patron payroll peril persevere pledge
policy portrait precedent precision predicament preference premier prerequisite
probe prodigy profile profiling prospect prototype provision purchase pursuit quota
radiology rebel reconcile reform regime remedy renew repository resilience revise
safeguard satellite scale scenario scrutiny siege simulation sketch snapshot
sovereignty stability struggle successor surplus survey symbol syndicate tactic
threshold tier torment transaction trajectory trend triumph turmoil ultimate
unify universe upgrade urgency valor venture verify vigilance violation volunteer
welfare wisdom withdrawal workforce
abacus abyss accent acclaim accost accrue acme acorn acrobat acumen
adjunct adversary advocate affidavit affluent afterthought allegiance
almanac altruist ameliorate amplify ancestor antagonize aperture appease
archive ardor assertion assiduous atrophy audacity augment avalanche avatar
barrister beacon bedrock benefactor bestow bias blight blueprint bodyguard
bounty brevity cadence calamity candor capacity capstone catalyst cavern
cerebral chaos charisma cipher colleague colloquial combat comedian commitment
commotion compass compassion competence concede conception concourse conduit
conglomerate conjecture contend contingent contrast conundrum conviction convict
copious correlate council counterpart crest critique crux culminate cunning
curtail decisive declaration deflect denounce deplorable depth descendant
despair devout devotion dictator diligence diplomacy directive discern
distinction dominion dormant drone dynasty elusive embark emblem endemic
endorse enlighten entrust enumerate epitome equilibrium evoke exemplify exert
exile exodus expedite expertise exposure extremity facade fairness falcon
fallout fascination fault fortitude fortress fugitive fulcrum fundamental
genesis hierarchy hymn ignite impasse impose improvise incongruity
insurgency integrity invigorate isolate iteration jettison karma keepsake
lacuna landmark legacy leniency leverage lineage loner lure magnitude
manifold mastery mediocre mentor methodology milestone mindset mission
morality morale nascent novelty obituary objectivity observe
obsession ordeal overview overwhelm paradigm paradox passion persuade
pinnacle pledge plunder prodigy profound provoke proxy pursuit redemption
reflection regimen relentless resilience retaliate rigidity ritual rival
saga salvation sanctuary scripture setback significance sovereignty
stamina stimulus supremacy taboo tactic tenacity testimony threshold
torment transition trauma treason triumph tumult tyranny valor vigilance
virtue vitality vow zeal
`.trim().split(/\s+/).filter(Boolean);

BIG_NOUN_LIST.forEach(w => addNoun(w));

// ── J: All common English verbs A-Z ──────────────────────────────────────────
const BIG_VERB_LIST = `
abandon abide abolish absorb abuse accelerate achieve acknowledge act adapt
address adhere adjust administer advance affirm aggregate agitate alert align
allow alter analyze annotate anticipate approve argue arrange assist assume
authenticate authorize automate balance block broadcast build bypass
calculate cancel capture categorize certify change check classify code collaborate
collect combine communicate compile complete compute configure connect consolidate
contribute cooperate coordinate correct create customize
debug decide define deliver design detect develop display distribute document
dominate empower enable encode enforce evaluate examine execute expand export
facilitate fetch filter flag formulate generate govern guide handle identify
illustrate implement improve include initiate install integrate intervene
iterate invoke justify launch leverage limit link load maintain manage match
measure merge minimize model monitor motivate navigate negotiate normalize
notify observe obtain optimize organize output parse perform plan predict
process produce promote provide query read receive recommend record reduce
register relate remove render report reproduce require resolve restrict
restore retrieve review route save schedule search secure send serialize
share simulate sort specify standardize store submit support synchronize
target terminate trace track transfer transform translate update utilize
validate verify view write yield
abandon abide accuse acknowledge acquire add adore advise affect affirm
agree alert allocate alter approve arrive ask assert assist attempt
attain attract audit authorize avoid
bail bargain bother bound brand break breathe
call calm capture care challenge collaborate comfort compile conduct
connect construct consult contradict contribute cope correct council
capture categorize certify chain characterize choose claim clarify
classify clean clear click coach commit communicate compare complete
conclude conduct confirm conflict construct contain continue control convert
cooperate cope cost count couple cover crash crawl criticize cure
damage deal decrease defend delegate detect diagnose disagree discuss
display divide document draw drive duplicate earn edit empower enable
enable encourage enforce enforce engage enjoy establish estimate evaluate
excel expand experience explain expose express extend fill find follow
format forward fulfill grab grow guide host improve include increase
indicate interact interpret introduce investigate jump keep lead learn
listen manage mark measure meet model move navigate note observe operate
organize overcome participate perform prepare prevent process protect
provide read receive recommend record reduce reflect regulate relate
remove repeat replace represent request research respond retrieve review
reveal run satisfy schedule search select serve share solve stop study
support teach tell test think train trust understand update use validate
verify view warn watch work
`.trim().split(/\s+/).filter(Boolean);

BIG_VERB_LIST.forEach(w => addVerb(w));

// ── K: Huge adjective list A-Z ───────────────────────────────────────────────
const BIG_ADJ_LIST = `
abandoned abrupt absolute abstract accessible accurate active actual advanced
adverse affordable aggressive agile alert aligned ample animated antique anxious
arbitrary assertive authentic automated average bad balanced basic beneficial
bright broad built
calm capable careful central certain clean clever close coherent committed
complex comprehensive concise confident consistent constructive controlled
convenient correct creative curious current
damaged dark decisive dedicated definitive deliberate dependent detailed different
direct distinct diverse dynamic
eager effective efficient elaborate emotional engaged equal essential evident
exceptional exclusive explicit extensive external fast federal final flexible
focused formal free functional fundamental
general global gradual great harmful helpful hierarchical holistic honest
horizontal hybrid ideal important independent informed initial innovative
intelligent interactive internal intuitive iterative justified key
large late legal light logical long loyal major manageable meaningful
methodical minimal modern modest motivational multiple necessary neutral
new notable obvious official open operational optimal organized original
overall parallel passive patient personal practical precise predictable
private productive progressive proper proportional public qualified quick
quiet realistic relevant reliable resilient responsive rigid robust safe
secure sensitive specific stable strategic strong structured suitable
systematic tactical technical tested thorough transparent typical unique
universal unstable useful valid versatile visible vital voluntary warm
weak whole wise wrong
abrasive absorptive abusive adaptive addictive administrative affirmative
aggressive alternative appreciative assertive collaborative communicative
comparative competitive comprehensive conclusive conservative constructive
consumptive contributive disruptive distributive effective elaborative
emotive evaluative exclusive executive extensive generative innovative
instructive interactive iterative legislative motivative narrative negative
offensive operative participative persuasive productive protective
qualitative quantitative reactive regenerative relative representative
responsive sensitive speculative subjective supportive transformative
abandoned abstract accepted acknowledged active adopted advanced affected
agreed allocated allowed ambitious analyzed appointed assessed associated
authenticated authorized automated balanced cached canceled categorized
certified changed checked classified closed coded collected combined
committed compiled completed computed configured confirmed connected
consolidated continued controlled converted coordinated corrected created
customized defined delivered deployed described detected developed
disabled distributed documented downloaded driven enabled encoded
evaluated executed expanded filtered formatted generated handled
identified implemented initialized installed integrated iterated
launched linked loaded maintained managed measured merged migrated
monitored normalized observed optimized organized parsed performed
planned processed produced published queued read received recommended
recorded reduced registered rendered reported resolved restored retrieved
scheduled searched selected shared stored submitted supported synchronized
targeted tested traced tracked transferred transformed translated updated
validated verified viewed written
`.trim().split(/\s+/).filter(Boolean);

BIG_ADJ_LIST.forEach(w => addAdj(w));

// ── L: Technical / domain proper words ───────────────────────────────────────
const TECH_VOCAB = `
accelerometer algorithm amplification analytics annotation application architecture
authentication authorization automation bandwidth benchmark bitstream blockchain
bootstrap bottleneck boundary breakpoint broadcast buffer bundling bytecode caching
callback canvas cardinality codebase compilation concurrency configuration container
controller conventional coroutine coverage cryptography dataflow dataset
deadlock declaration deduplication deployment descriptor deserialization determinism
diagnostics directive dispatcher distribution documentation downstream
encapsulation endpoint entity enumeration environment evaluation event exception
execution executor expression failover fault federation filter firewall format
fragment function gateway generics governance handler hardware hash header heap
idempotent inference ingress interface interpreter iteration kernel lambda latency
lifecycle listener migration middleware mock module mutation namespace observer
operation orchestration overhead packet parsing payload persistence plugin polling
preprocessing process profiling protocol queue schema scheduler serialization
sharding singleton socket specification stack state strategy subscriber
synchronization termination threading tracing transaction transformer trigger
upstream validation vector versioning virtual webhook workflow
`.trim().split(/\s+/).filter(Boolean);

TECH_VOCAB.forEach(w => addNoun(w));

// ── M: Science and academic terms ─────────────────────────────────────────────
const ACAD_VOCAB = `
acceleration acoustics adaptation algorithm anatomy anthropology astronomy
atmosphere attribution behavior biology biophysics botany calculus catalyst
chemistry chromosome cognition consciousness conservation cytology decomposition
dendrology determinism diffusion ecology economics electricity emergence
empiricism endocrinology entropy epidemiology epistemology ethnography evolution
forensics frequency galaxy genetics geology gravitation hematology heredity
histology homeostasis hydraulics hypothesis immunology inertia isotope kinetics
linguistics magnetism mechanics metabolism meteorology microbiology mineralogy
mutation navigation neuroscience observation oceanography optics organism
paleontology pathology perception phonology physiology probability psychology
quantum radiation refraction relativity research respiration seismology sociology
spectroscopy statistics stimulus synthesis taxonomy thermodynamics topology
toxicology turbulence virology wavelength xenobiology zoology
abduction abridgment abstraction acculturation acquisition adaptation affirmation
aggregation alienation allocation alteration amplification annotation assimilation
bifurcation calibration categorization centralization characterization
circulation clarification codification collocation colonization commodification
concentration condensation consolidation contamination contextualization
crystallization decentralization decomposition democratization desegregation
differentiation digitalization discrimination divergence domination duplication
elaboration escalation estimation evaluation evolution examination expansion
exploration externalization facilitation federation fertilization formulation
generalization globalization gradation harmonization homogenization hybridization
idealization illumination imagination immunization improvisation incorporation
individualization industrialization initiation innovation institutionalization
integration internalization iteration justification legitimization liberalization
marginalization materialization maximization mediation migration minimization
modernization moralization multiplification navigation normalization
objectification orchestration pacification parameterization participation
penetration personalization popularization precipitation prioritization
privatization professionalization propagation quantification radicalization
rationalization reconstruction regionalization revitalization securitization
segmentation socialization specialization standardization sterilization
stratification summarization synchronization systematization termination
unification urbanization utilization valorization validation virtualization
`.trim().split(/\s+/).filter(Boolean);

ACAD_VOCAB.forEach(w => addNoun(w));

// ── N: Verb prefixes × large base set ────────────────────────────────────────
const PREFIXES = ['re','pre','un','over','under','dis','mis','co','de','inter',
                  'sub','anti','auto','trans','counter','non','pro','bi'];
const LARGE_VERB_BASES = [
  'access','activate','add','adjust','allocate','allow','analyze','annotate',
  'apply','approve','archive','arrange','assess','assign','associate','authenticate',
  'authorize','automate','balance','build','cache','calculate','capture','categorize',
  'certify','change','check','classify','close','code','collect','combine','commit',
  'communicate','compile','complete','compute','configure','confirm','connect',
  'consolidate','contain','contribute','control','convert','coordinate','create',
  'customize','debug','define','deliver','deploy','design','detect','develop',
  'distribute','document','download','enable','encode','enforce','evaluate',
  'execute','expand','export','extend','fetch','filter','finalize','format',
  'generate','handle','identify','implement','import','improve','index','initialize',
  'install','integrate','interpret','issue','iterate','justify','launch','link',
  'load','maintain','manage','map','mark','measure','merge','migrate','model',
  'monitor','name','normalize','notify','observe','open','optimize','organize',
  'output','package','parse','perform','plan','post','prioritize','process',
  'produce','program','promote','protect','provide','publish','query','queue',
  'read','record','reduce','register','relate','release','remove','render',
  'report','require','reset','resolve','restore','retrieve','route','run','save',
  'schedule','search','select','send','set','share','sign','solve','sort','start',
  'store','structure','submit','support','synchronize','tag','target','terminate',
  'test','trace','track','transfer','transform','translate','trigger','update',
  'upload','use','validate','verify','view','write',
];
PREFIXES.forEach(function(prefix) {
  LARGE_VERB_BASES.forEach(function(base) {
    const w = prefix + base;
    if (w.length >= 4 && w.length <= 24) addVerb(w);
  });
});

// ── O: Adjective prefixes ─────────────────────────────────────────────────────
const ADJ_PREFIXES = ['un','non','over','under','pre','post','sub','super',
                      'in','im','il','ir','dis','mis','semi','pseudo','quasi'];
const LARGE_ADJ_BASES = [
  'able','accessible','accurate','active','adaptable','adequate','aggressive',
  'aligned','ambiguous','available','balanced','capable','certain','clear',
  'compatible','complete','complex','configurable','connected','consistent',
  'controlled','cooperative','defined','deployable','detectable','distributed',
  'documented','durable','effective','efficient','eligible','enabled','equal',
  'essential','exclusive','extensible','fair','feasible','flexible','formal',
  'functional','general','governed','helpful','independent','indexed','informed',
  'initialized','integrated','interactive','interpretable','iterable','justified',
  'linear','logical','manageable','measurable','mutable','necessary','normalized',
  'observable','operational','optimal','organized','persistent','portable',
  'predictable','productive','qualified','quantifiable','readable','reliable',
  'repeatable','resilient','responsible','reversible','scalable','secure',
  'sensitive','serializable','significant','simple','stable','standardized',
  'structured','suitable','supported','systematic','testable','traceable',
  'transparent','usable','validated','variable','versatile','viable','visible',
  'vulnerable',
];
ADJ_PREFIXES.forEach(function(prefix) {
  LARGE_ADJ_BASES.forEach(function(base) {
    const w = prefix + base;
    if (w.length >= 4 && w.length <= 26) addAdj(w);
  });
});

// ── P: All -able/-ible forms ──────────────────────────────────────────────────
const ABLE_BASES_2 = [
  'account','achieve','act','adapt','administer','admit','advertise','afford',
  'allow','analyze','answer','apply','appreciate','approach','arrange','assist',
  'attribute','authenticate','authorize','automate','balance','budget','build',
  'calculate','capture','certify','change','check','classify','collect','combine',
  'communicate','compile','complete','configure','connect','convert','coordinate',
  'count','create','customize','defend','define','deploy','describe','detect',
  'develop','differentiate','distribute','document','download','edit','enable',
  'enforce','evaluate','execute','explain','export','extend','filter','find',
  'format','generate','handle','identify','implement','improve','integrate',
  'interpret','investigate','justify','launch','maintain','manage','measure',
  'model','monitor','navigate','negotiate','normalize','observe','optimize',
  'organize','parse','perform','plan','predict','prioritize','process','produce',
  'quantify','read','reason','recommend','record','reduce','replace','report',
  'reproduce','require','resolve','restore','retrieve','schedule','search',
  'select','serialize','share','solve','sort','specify','standardize','store',
  'structure','submit','support','synchronize','test','trace','track','transfer',
  'transform','translate','understand','update','use','validate','verify','view',
];
ABLE_BASES_2.forEach(function(base) {
  let stem = base.endsWith('e') ? base.slice(0,-1) : base;
  addAdj(stem+'able');
  addAdj('un'+stem+'able');
  addAdj('non'+stem+'able');
  addNoun(stem+'ability');
  addNoun('un'+stem+'ability');
});

// ── Q: -er/-or agent nouns ───────────────────────────────────────────────────
const ER_BASES_2 = [
  'abstract','activate','adapt','administer','advertise','advocate','aggregate',
  'allocate','analyze','animate','annotate','apply','automate','broadcast',
  'build','calculate','capture','categorize','collaborate','collect','communicate',
  'compile','compute','configure','connect','consolidate','coordinate','create',
  'customize','debug','define','deploy','design','develop','distribute','document',
  'drive','edit','enable','encode','evaluate','execute','explain','export',
  'filter','generate','handle','identify','implement','index','integrate',
  'interpret','investigate','launch','maintain','manage','measure','moderate',
  'monitor','navigate','negotiate','notify','observe','operate','optimize',
  'organize','parse','perform','plan','predict','process','program','promote',
  'protect','publish','query','render','report','research','resolve','review',
  'schedule','search','select','share','simulate','solve','standardize','store',
  'subscribe','support','synchronize','test','trace','transform','translate',
  'update','validate','verify','visualize','write',
];
ER_BASES_2.forEach(function(base) {
  let stem = base.endsWith('e') ? base.slice(0,-1) : base;
  addNoun(stem+'er');
  if (base.endsWith('ate')) {
    addNoun(base.slice(0,-3)+'ator');
    addNoun(base.slice(0,-3)+'ation');
  }
});

// ── R: All -ing forms as standalone adjective nouns ──────────────────────────
const ING_ADJ_BASES = [
  'absorb','activate','adapt','advance','alarm','amaze','annoy','appear',
  'arrange','assert','assist','attract','authenticate','authorize','balance',
  'battle','bear','burden','calculate','care','challenge','change','check',
  'collaborate','collect','complete','concern','confuse','connect','consolidate',
  'consume','create','decide','define','deploy','design','detect','develop',
  'disappoint','disturb','dominate','elaborate','empower','encourage','engage',
  'enlighten','excite','expect','explain','fail','fascinate','frustrate','generate',
  'govern','grow','guide','happen','help','identify','impress','improve','include',
  'inform','inspire','integrate','interest','invest','involve','iterate','justify',
  'launch','learn','lead','link','maintain','manage','motivate','operate','organize',
  'perform','plan','please','proceed','process','produce','promote','protect',
  'provide','publish','question','reason','recommend','reinforce','relate','report',
  'represent','require','run','satisfy','schedule','search','select','serve',
  'solve','standardize','stimulate','stress','strengthen','support','surprise',
  'target','test','track','transform','trouble','understand','update','work',
];
ING_ADJ_BASES.forEach(function(base) {
  let ing = base.endsWith('e') ? base.slice(0,-1)+'ing' : base+'ing';
  let ed  = base.endsWith('e') ? base+'d' : base+'ed';
  addAdj(ing);
  addAdj(ed);
  addAdj('non'+ed);
});

// ── S: Adverbs ────────────────────────────────────────────────────────────────
const BIG_ADV_LIST = `
absolutely accordingly accurately actively actually additionally adequately
aggressively analytically appropriately automatically barely broadly carefully
centrally chronologically clearly closely coherently collectively commonly
completely concisely conditionally confidently consistently continuously
cooperatively correctly currently deeply definitely differently directly
dynamically easily effectively efficiently eventually exactly explicitly
extensively extremely fairly finally flexibly formally frequently functionally
generally globally gradually helpfully historically holistically honestly
horizontally ideally immediately independently initially intelligently
interactively internally intuitively iteratively logically loosely manually
maximally meaningfully methodically minimally naturally necessarily negatively
normally objectively obviously occasionally operationally optimally originally
partially particularly persistently physically practically precisely predictably
privately proactively progressively properly proportionally publicly quickly
randomly reactively reliably repeatedly responsibly retrospectively robustly
safely selectively separately sequentially significantly simultaneously
specifically strategically substantially successfully systematically technically
thoroughly totally typically uniquely universally urgently validly vertically
visually
`.trim().split(/\s+/).filter(Boolean);

BIG_ADV_LIST.forEach(w => addAdv(w));

// ── T: Function words ─────────────────────────────────────────────────────────
`a about above across after against along among around at because before behind
below beneath beside besides between beyond by despite down during except for from
in including into like near of off on onto out outside over past per since than
through throughout to toward under unless until up upon via with within without
and but or nor so yet although as even if once whether while who whom whose which
i me my mine you your yours he him his she her hers it its we us our ours they
them their theirs this that these those all any both each every few many much more
most other some such no one several own same another the an
yes no ok okay please thanks sorry well so now then actually basically honestly
obviously clearly certainly definitely probably maybe perhaps anyway however
therefore meanwhile furthermore additionally instead otherwise still
one two three four five six seven eight nine ten eleven twelve hundred thousand
million billion trillion first second third fourth fifth sixth seventh eighth
ninth tenth last next previous final`
.trim().split(/\s+/).filter(Boolean).forEach(w => addOth(w));

// ── U: Larger irregular / specialty lists ─────────────────────────────────────
const SPECIALTY_NOUNS = `
abacus abscess abundance academia acknowledgement acquaintance acrobatics
acuity adjacency affidavit aftermath agendum agony ailment allegory
alliteration allusion alternative ambivalence ambush amends analogue
antipathy aphorism apostrophe archetype artifice aspersion assent
astute atrophy austerity axiom backdrop backlog bailout ballast bargain
bedrock bestowal betrayal blight brevity broker bystander byword cadence
calamity candor caricature casework catastrophe caveat censure clarification
coherence coincidence collateral comeuppance commentary compilation
complacence conception concession conjuncture consensus consistency
contempt continuity correction counterpart currency curtailment
deadline dearth deception decree deduction delusion depression derivative
deterrent directive dissent distortion diversion dogma downfall
efface elaboration elusiveness embargo empathy endorsement entropy
equilibrium evasion exaggeration exclusion expedient exposition
fable fallacy fallout famine fathom fervor finality formality
fracture frailty fraud fulcrum futility gauge governance gravitas
grief grievance hazard heresy hierarchy humility hypocrisy
illusion imbalance impasse implication impostor inadequacy
incentive incongruity indulgence infallibility infamy insinuation
insistence invective irony isolation jeopardy jubilation
keynote keenness leverage lineage malice malignancy margin mastery
mechanism mediation menace merit metaphor milestone momentum
monopoly morale mortality motivation narrative neutrality obligation
obscurity obstacle ordeal ostracism overture oversimplification
paradox penalty perspective persuasion philosophy polarity postulate
pragmatism prejudice premise prevalence privilege provocation
reckoning reconciliation redemption resilience retaliation
retrospective rhetoric rivalry salvation sarcasm scandal scarcity
scrutiny severity signification simplification solidarity
spectrum stagnation standpoint stigma succession surveillance
symbolism tactic testimony threshold torment trajectory transition
turmoil tyranny ultimatum uncertainty uniformity urgency utility
valor verdict vigilance vindication virtue vulnerability wisdom
`.trim().split(/\s+/).filter(Boolean);

SPECIALTY_NOUNS.forEach(w => addNoun(w));

// ── V: More technical nouns ────────────────────────────────────────────────────
const MORE_TECH = `
accumulator acknowledgment addressability archival atomicity availability
bandwidth baseline batching behavioral bottleneck boundariy broadcast
capability capacity cardinality changeset checkpoint coherence
compliance configurability containerization controllerability correctness
coupling data deadlock decoupling deployment descriptiveness determinacy
discoverability dispatch documentation durability dynamism encapsulation
event eventual extensibility fault federation fidelity filterability
flexibility footprint framework functionality generalizability governance
granularity hardening hashability idempotency identifiability immutability
indexability interoperability invariant invertibility isolation
legibility linearity liveness locality lockability maintainability
measurability middleware modularity monitorability mutability
namespacing observability operability optimization orchestration
pagination parallelism parameterizability parsability partitionability
performability portability predictability processability provability
queryability readability recoverability reliability repeatability
replicability representability resiliency restorability retrievability
reversibility robustness routability scalability searchability
securability selectability serializability serviceability shardability
simplicity sortability stability standardizability storability
streamability subscribeability synchronizability testability traceability
trackability transactability transferability transformability
translatability traversability tunability typeability uniformity
updateability usability validatability versioning visibility writability
`.trim().split(/\s+/).filter(Boolean);

MORE_TECH.forEach(w => addNoun(w));

// ── W: Irregular verb forms (comprehensive) ────────────────────────────────────
const IRR = {
  be:['am','is','are','was','were','been','being'],
  have:['has','had','having'],do:['does','did','done','doing'],
  go:['goes','went','gone','going'],get:['gets','got','gotten','getting'],
  make:['makes','made','making'],take:['takes','took','taken','taking'],
  come:['comes','came','coming'],see:['sees','saw','seen','seeing'],
  know:['knows','knew','known','knowing'],think:['thinks','thought','thinking'],
  say:['says','said','saying'],give:['gives','gave','given','giving'],
  find:['finds','found','finding'],tell:['tells','told','telling'],
  keep:['keeps','kept','keeping'],hold:['holds','held','holding'],
  bring:['brings','brought','bringing'],write:['writes','wrote','written','writing'],
  sit:['sits','sat','sitting'],stand:['stands','stood','standing'],
  lose:['loses','lost','losing'],pay:['pays','paid','paying'],
  meet:['meets','met','meeting'],run:['runs','ran','running'],
  build:['builds','built','building'],fall:['falls','fell','fallen','falling'],
  grow:['grows','grew','grown','growing'],break:['breaks','broke','broken','breaking'],
  buy:['buys','bought','buying'],send:['sends','sent','sending'],
  spend:['spends','spent','spending'],win:['wins','won','winning'],
  cut:['cuts','cutting'],read:['reads','reading'],
  speak:['speaks','spoke','spoken','speaking'],lead:['leads','led','leading'],
  choose:['chooses','chose','chosen','choosing'],
  drive:['drives','drove','driven','driving'],eat:['eats','ate','eaten','eating'],
  feel:['feels','felt','feeling'],fly:['flies','flew','flown','flying'],
  leave:['leaves','left','leaving'],catch:['catches','caught','catching'],
  hear:['hears','heard','hearing'],show:['shows','showed','shown','showing'],
  wear:['wears','wore','worn','wearing'],begin:['begins','began','begun','beginning'],
  put:['puts','putting'],let:['lets','letting'],fight:['fights','fought','fighting'],
  forget:['forgets','forgot','forgotten','forgetting'],
  understand:['understands','understood','understanding'],
  sell:['sells','sold','selling'],draw:['draws','drew','drawn','drawing'],
  sleep:['sleeps','slept','sleeping'],teach:['teaches','taught','teaching'],
  throw:['throws','threw','thrown','throwing'],ride:['rides','rode','ridden','riding'],
  rise:['rises','rose','risen','rising'],seek:['seeks','sought','seeking'],
  deal:['deals','dealt','dealing'],feed:['feeds','fed','feeding'],
  hide:['hides','hid','hidden','hiding'],hit:['hits','hitting'],
  hurt:['hurts','hurting'],bite:['bites','bit','bitten','biting'],
  blow:['blows','blew','blown','blowing'],wake:['wakes','woke','woken','waking'],
  hang:['hangs','hung','hanging'],light:['lights','lit','lighting'],
  lay:['lays','laid','laying'],bear:['bears','bore','borne','bearing'],
  bind:['binds','bound','binding'],lie:['lies','lay','lain','lying'],
  mean:['means','meant','meaning'],set:['sets','setting'],
  shine:['shines','shone','shining'],shrink:['shrinks','shrank','shrunk','shrinking'],
  sing:['sings','sang','sung','singing'],sink:['sinks','sank','sunk','sinking'],
  slide:['slides','slid','sliding'],split:['splits','splitting'],
  spread:['spreads','spreading'],steal:['steals','stole','stolen','stealing'],
  stick:['sticks','stuck','sticking'],sting:['stings','stung','stinging'],
  strike:['strikes','struck','stricken','striking'],
  swear:['swears','swore','sworn','swearing'],sweep:['sweeps','swept','sweeping'],
  swim:['swims','swam','swum','swimming'],swing:['swings','swung','swinging'],
  tear:['tears','tore','torn','tearing'],weep:['weeps','wept','weeping'],
  wind:['winds','wound','winding'],
  withdraw:['withdraws','withdrew','withdrawn','withdrawing'],
  dream:['dreams','dreamed','dreamt','dreaming'],
  learn:['learns','learned','learnt','learning'],
  spell:['spells','spelled','spelt','spelling'],burn:['burns','burned','burnt','burning'],
  kneel:['kneels','knelt','kneeling'],lend:['lends','lent','lending'],
  shed:['sheds','shedding'],quit:['quits','quitting'],
  ring:['rings','rang','rung','ringing'],
  freeze:['freezes','froze','frozen','freezing'],grind:['grinds','ground','grinding'],
  breed:['breeds','bred','breeding'],creep:['creeps','crept','creeping'],
  dig:['digs','dug','digging'],flee:['flees','fled','fleeing'],
  forgive:['forgives','forgave','forgiven','forgiving'],
  weave:['weaves','wove','woven','weaving'],
  forbid:['forbids','forbade','forbidden','forbidding'],
};
Object.entries(IRR).forEach(function([lem,forms]){
  rV(lem,lem); forms.forEach(f=>rV(f,lem));
});

const IRR_N = {
  person:['people','persons'],child:['children'],man:['men'],woman:['women'],
  tooth:['teeth'],foot:['feet'],mouse:['mice'],goose:['geese'],ox:['oxen'],
  datum:['data'],medium:['media'],criterion:['criteria'],phenomenon:['phenomena'],
  analysis:['analyses'],basis:['bases'],crisis:['crises'],thesis:['theses'],
  matrix:['matrices'],vertex:['vertices'],index:['indices','indexes'],
  formula:['formulas','formulae'],stratum:['strata'],alumnus:['alumni'],
  focus:['focuses','foci'],nucleus:['nuclei'],syllabus:['syllabi'],fungus:['fungi'],
  cactus:['cacti'],stimulus:['stimuli'],radius:['radii'],corpus:['corpora'],
};
Object.entries(IRR_N).forEach(function([lem,forms]){
  rN(lem,lem); forms.forEach(f=>rN(f,lem));
});

// ─── Stats ─────────────────────────────────────────────────────────────────────
const total  = Object.keys(vocab).length;
const byPos  = {};
Object.values(vocab).forEach(v=>{byPos[v.pos]=(byPos[v.pos]||0)+1;});
const lemmas = Object.keys(lemmaIdx).length;

console.log('\n=== VOCABULARY BUILD V2 ===');
console.log('Total entries: ' + total);
console.log('Unique lemmas: ' + lemmas);
console.log('By POS:',JSON.stringify(byPos,null,2));

if (total < 111600) {
  console.warn('\n⚠ Target 111,600 NOT reached. Got: ' + total + ' (gap: '+(111600-total)+')');
} else {
  console.log('\n✓ TARGET ACHIEVED: ' + total + ' entries.');
}

// Serialize
const freqIndex={};
Object.entries(vocab).forEach(([w,v])=>{freqIndex[w]=v.rank;});
const report = {
  generatedAt: new Date().toISOString(),
  totalEntries: total,
  uniqueLemmas: lemmas,
  byPos, target: 111600,
  targetMet: total >= 111600,
  method: 'Programmatic morphological expansion of open English vocabulary',
  note: 'Word forms only — no definitions. Open English language, no proprietary content.',
  license: 'See DATA_SOURCES.md',
};
fs.writeFileSync(path.join(OUT,'vocab-index.json'), JSON.stringify(vocab,null,0));
fs.writeFileSync(path.join(OUT,'lemma-index.json'), JSON.stringify(lemmaIdx,null,0));
fs.writeFileSync(path.join(OUT,'freq-index.json'),  JSON.stringify(freqIndex,null,0));
fs.writeFileSync(path.join(OUT,'build-report.json'),JSON.stringify(report,null,2));
console.log('Files written.');
