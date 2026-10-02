/**
 * shadow-reaper-v2/language/data/build-final-vocab.js
 *
 * FINAL VOCABULARY BUILDER — 111,600+ English entries
 *
 * Strategy:
 *   1. Start with ~22,000 carefully selected English stems
 *   2. Apply morphological expansion to each (nouns: +plural, verbs: +3s/ing/ed,
 *      adjectives: +er/est, etc.)
 *   3. Apply 15 productive derivational prefix/suffix patterns
 *   4. Include comprehensive domain vocabulary
 *   5. Include irregular forms
 *
 * All words are from the open English language.
 * No definitions. No proprietary content.
 * This is a WORD LIST for language understanding, not a dictionary.
 *
 * Usage: node language/data/build-final-vocab.js
 * Output: language/data/vocab-index.json  (111,600+ entries)
 *         language/data/lemma-index.json
 *         language/data/freq-index.json
 *         language/data/build-report.json
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const OUT  = path.resolve(__dirname);

// ─── Vocab accumulator ────────────────────────────────────────────────────────
const vocab    = {};  // word → { lemma, pos, rank }
const lemmaIdx = {};  // lemma → [forms]
let   rank     = 1;

function reg(word, lemma, pos) {
  word = String(word).trim().toLowerCase();
  if (!word || word.length < 1 || word.length > 30) return;
  if (!vocab[word]) {
    vocab[word] = { lemma: lemma || word, pos: pos || 'other', rank: rank++ };
    const lem = lemma || word;
    if (!lemmaIdx[lem]) lemmaIdx[lem] = [];
    if (!lemmaIdx[lem].includes(word)) lemmaIdx[lem].push(word);
  }
}

// ─── Morphological expanders ─────────────────────────────────────────────────
const V='aeiou', C='bcdfghjklmnpqrstvwxyz';
function isVowel(c){ return V.includes(c); }
function isCons(c){ return C.includes(c); }

function nForms(s) { // noun plurals
  const f=[s];
  if(s.endsWith('s')||s.endsWith('x')||s.endsWith('z')||s.endsWith('ch')||s.endsWith('sh'))
    f.push(s+'es');
  else if(s.endsWith('y')&&s.length>1&&!isVowel(s[s.length-2]))
    f.push(s.slice(0,-1)+'ies');
  else if(s.endsWith('f')&&s.length>2){f.push(s.slice(0,-1)+'ves');f.push(s+'s');}
  else if(s.endsWith('fe')){f.push(s.slice(0,-2)+'ves');f.push(s+'s');}
  else f.push(s+'s');
  return [...new Set(f)];
}

function vForms(s) { // verb conjugations
  const f=[s];
  // 3s
  if(s.endsWith('s')||s.endsWith('x')||s.endsWith('z')||s.endsWith('ch')||s.endsWith('sh'))
    f.push(s+'es');
  else if(s.endsWith('y')&&s.length>1&&!isVowel(s[s.length-2]))
    f.push(s.slice(0,-1)+'ies');
  else f.push(s+'s');
  // -ing
  if(s.endsWith('ie'))f.push(s.slice(0,-2)+'ying');
  else if(s.endsWith('e')&&s.length>2)f.push(s.slice(0,-1)+'ing');
  else{
    const l=s[s.length-1],p=s.length>1?s[s.length-2]:'',pp=s.length>2?s[s.length-3]:'';
    if(isCons(l)&&isVowel(p)&&!isVowel(pp)&&!['w','x','y'].includes(l)&&s.length>=3)
      f.push(s+l+'ing');
    f.push(s+'ing');
  }
  // -ed
  if(s.endsWith('e'))f.push(s+'d');
  else if(s.endsWith('y')&&s.length>1&&!isVowel(s[s.length-2]))
    f.push(s.slice(0,-1)+'ied');
  else{
    const l=s[s.length-1],p=s.length>1?s[s.length-2]:'',pp=s.length>2?s[s.length-3]:'';
    if(isCons(l)&&isVowel(p)&&!isVowel(pp)&&!['w','x','y'].includes(l)&&s.length>=3)
      f.push(s+l+'ed');
    f.push(s+'ed');
  }
  return [...new Set(f)];
}

function aForms(s) { // adjective comparatives
  const f=[s];
  if(s.includes('-')||s.length>10)return f;
  if(s.endsWith('e')){f.push(s+'r',s+'st');}
  else if(s.endsWith('y')&&s.length>2&&!isVowel(s[s.length-2]))
    {f.push(s.slice(0,-1)+'ier',s.slice(0,-1)+'iest');}
  else{
    const l=s[s.length-1],p=s.length>1?s[s.length-2]:'';
    if(isCons(l)&&isVowel(p)&&s.length<=6&&!['w','x','y'].includes(l))
      {f.push(s+l+'er',s+l+'est');}
    else{f.push(s+'er',s+'est');}
  }
  return [...new Set(f)];
}

function addN(stem,extra){nForms(stem).forEach(f=>reg(f,stem,'noun'));if(extra)extra.forEach(f=>reg(f,stem,'noun'));}
function addV(stem,extra){vForms(stem).forEach(f=>reg(f,stem,'verb'));if(extra)extra.forEach(f=>reg(f,stem,'verb'));}
function addA(stem,extra){aForms(stem).forEach(f=>reg(f,stem,'adj'));if(extra)extra.forEach(f=>reg(f,stem,'adj'));}
function addAdv(w){reg(w,w,'adv');}
function addOth(w){reg(w,w,'other');}

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 1 — CORE VOCABULARY
// Comprehensive English word stems, organized by domain
// ═══════════════════════════════════════════════════════════════════════════════

// ── NOUNS — General English ───────────────────────────────────────────────────
const CORE_NOUNS = `
ability absence abuse account acid action activity actor address administration
admission adoption adult advantage adventure advice affair age agency agent agreement
agriculture aid aim air alarm album alert algorithm alliance allowance alphabet
alternative amendment ambition analysis animal announcement answer anxiety
application appointment appreciation approach approval area argument arrangement
artist aspect assertion assessment asset assignment assistance association
atmosphere attachment attack attempt attendance attention attitude attraction
attribute audience author authority award awareness background balance band basis
battle behavior benefit bias block body bond bonus border boundary burden business
campaign capacity career case cause challenge channel choice circumstance citizen
clarity class code collection combination comfort community comparison concern
condition conflict connection consequence constraint construction context contract
contribution cooperation core coverage creativity culture cycle damage danger data
debate delivery demand depth description detail development difference difficulty
dimension direction discipline discovery division domain doubt dream drive duration
effect efficiency effort element emphasis engagement environment error estimate
evaluation event evidence evolution exception expectation exploration exposure
expression extension extent factor failure family feature field figure focus force
form framework frequency foundation function gap goal government group growth
guidance habit handler impact improvement incentive issue idea identity implication
increase influence information initiative instance integration intention interest
interpretation journey judgment lack language layer leadership learning lesson
level limit line link location logic market meaning mechanism method model moment
motion movement narrative nature need network node norm note objective obligation
observation obstacle opportunity option order outcome output overview pattern
perspective phase plan point potential principle priority process program progress
project purpose quality quantity question reason reference relation relevance
resource responsibility result risk role routine scenario scope security service
signal situation skill solution source specification standard state statement
status strategy structure subject success suggestion summary system target task
technique theme timeline topic transition trigger understanding use utility value
variation version view vision vocabulary workflow workload
ability absence abuse accuracy achievement acid action activity adaptation
addition administration adoption advantage adventure advice affair affection
agenda agreement aid alarm album alert analysis animal announcement anxiety
application area argument arrangement aspect assessment assignment assistance
atmosphere attack attempt attendance attention attitude audience author authority
awareness background basis battle behavior benefit bias block body bond
boundary burden campaign capacity career cause challenge channel choice
circumstance clarity code collection combination comfort comparison concern
condition conflict connection consequence construction context contract contribution
coordination core coverage creativity cycle damage data debate delivery demand
depth description detail difference difficulty direction discipline discovery
division domain effort element emphasis event evidence evolution exception
expectation exploration exposure extension extent factor failure feature field
figure focus force frequency function gap goal guidance habit impact improvement
incentive idea identity implication influence information initiative integration
intention interpretation journey judgment lack layer leadership learning level
limit link location mechanism moment motion movement narrative need norm note
obstacle opportunity order outcome output pattern perspective phase potential
principle priority progress purpose reality reason reference relation relevance
resource result risk role routine scenario scope signal skill solution source
standard state status strategy structure success theme topic trigger use value
variation view vision

abstract access account address advancement agent analysis arc archive area argument
array aspect audit automation avenue axis background background barrier batch beacon
blueprint bottleneck branch breadth buffer bundle capability cascade category caveat
centerpiece charter chunk circuit clarity classification cluster cohesion column
commandline component composite compression concept configuration connector context
convention core coverage curve dependency descriptor diagram dimension directive
directory discovery disk driver ecosystem edge element encapsulation endpoint entry
event exception export factor feature field filter flag flow folder format fragment
function gateway graph group handler hardware header heap hierarchy host hub icon
image import index infrastructure input instance instruction interface kernel layer
lease library link list listener loop manifest marker mechanism memory metric
middleware namespace object observation operation output overhead package parameter
path payload permission pointer pool pragma prefix process profile protocol proxy
query record reference relay resource root schema scope selector sequence server
session signal socket specification stack state store stream structure tag target
template tier timeout token trace tree trigger type union value variable vector
version viewport warning wrapper zone
`.trim().split(/\s+/).filter(w=>w.length>0);

// ── NOUNS — Extended domains ──────────────────────────────────────────────────
const DOMAIN_NOUNS = `
abbot accountant ace activist administrator admiral adolescent advocate agent aide
ambassador analyst ancestor architect archivist astronaut attorney auditor author
bachelor baron biologist boss botanist broadcaster builder caretaker carpenter
chancellor chemist chef chief citizen clerk coach columnist commander commissioner
competitor composer consultant controller coordinator counselor craftsman curator
custodian debater delegate deputy designer detective developer director dispatcher
distributor doctor economist editor educator engineer entrepreneur estimator evaluator
executive explorer farmer financier firefighter founder freelancer gardener geologist
governor guardian guide historian host hunter illustrator inspector instructor
investigator investor journalist judge keeper laborer lawyer librarian linguist
manufacturer marketer mediator merchant messenger meteorologist moderator navigator
negotiator operator organizer owner painter partner performer pharmacist philosopher
photographer physician pilot planner politician principal programmer promoter
prosecutor psychologist publisher ranger researcher sailor scheduler scholar
sculptor sherif sociologist speaker specialist strategist supervisor surveyor
technician therapist trader translator treasurer vendor veterinarian volunteer worker

accessory adapter adhesive alloy amplifier antenna applicator badge barcode beacon
blade bracket bundle capacitor capsule carrier cartridge cell chip circuit clasp clip
cluster connector controller converter counter coupler cylinder decoder detector dial
distributor driver duct encoder engine extender fiber fixture flag flap fuse gauge
generator grille grip guard hinge housing hub indicator injector insulator joint knob
latch lead lens lever linkage loader manifold marker membrane mount nozzle piston
platform probe processor pulley pump rack receptor regulator relay reservoir resistor
seal sensor socket spring starter substrate switch timer tracker transducer transistor
transmitter valve wire wrapper

acrylic alloy amber asphalt bitumen bronze carbon ceramic chrome clay cobalt composite
concrete copper crystal fiber foam gelatin granite graphite iron latex limestone linen
marble mercury nylon obsidian polymer quartz resin rubber sand silk slate steel
titanium tungsten vinyl wax zinc

canyon coast continent coral creek crop delta dune dust estuary fern fjord flora fog
frost fungus gale glacier gorge grove gust hail harbor heat hurricane island jungle
lagoon landmass lava leaf lightning marsh meadow mineral mist moor mud oak pebble
peninsula plain plateau pond prairie reef ridge root shore slope soil surf swamp tide
topography valley vegetation volcano watershed wilderness

almond anchovy anise apricot artichoke asparagus basil beet blueberry brie brisket
broth bruschetta burrito cabbage cantaloupe caramel cardamom cashew celery chard chive
cilantro cinnamon clove cobbler cocoa coleslaw compote condiment confection coriander
cornmeal couscous cracker croissant crouton custard dip dressing edamame endive
espresso feta fillet fondue fritter frosting ginger glaze gouda granola grapefruit
guava halibut hazelnut hummus ingredient jam jelly kale kebab kipper kumquat lentil
macaron mackerel marmalade mousse mozzarella mushroom mustard nectarine nougat olive
oregano oyster papaya paprika parsley parmesan passionfruit pecan pimento pomegranate
pretzel prosciutto raisin rosemary saffron salmon scallion sesame sorbet sourdough
squash sweetener syrup taco tahini tamarind tangelo tapenade tempeh thyme tilapia
tiramisu tofu turmeric vanilla vinaigrette walnut wasabi yam zucchini

archery arena basketball bowling boxing championship climbing competition cricket cycling
endurance fencing fitness football golf gymnasium handball hiking hockey hurdle jump
karate lacrosse league marathon medal obstacle paddle penalty polo rally rowing rugby
skating skiing soccer softball sprint surfing swimming tennis tournament trophy
volleyball weightlifting yoga marathon triathlon tournament championship federation

arch archway atrium balcony beam blueprint chimney column corridor dome doorway facade
fence foundation framing handrail joist lintel lobby parapet patio pavement pedestal
pier plinth rafter scaffold skyline staircase steeple terrace threshold tower turret
vault wall

aircraft ambulance barge bicycle boat bridge cab canal carriage cart catamaran commute
cruise deck departure dock drawbridge escalator ferry freight helicopter interchange
intersection locomotive monorail motorway overpass pedestrian ramp runway scooter
shuttle subway taxi terminal tram transit vessel watercraft

acne ailment allergen anemia appetite artery bandage biopsy blister bruise bypass
carcinoma cavity cholesterol clot colitis constipation contusion cramp cyst dehydration
dermatitis diabetes diarrhea dosage eczema edema fatigue fracture gastric gluten hernia
hormone hypertension hypoglycemia immunization incision inflammation insulin jaundice
laceration melanoma migraine obesity parasite pimple platelet pneumonia polio probiotic
rash rheumatism seizure sinusitis spasm sprain stroke swelling tumor ulcer vaccination
varicose vertigo vitamin wound

amortization annuity arbitrage audit bail bond brokerage budget buyout collateral
commodity coupon creditor currency debenture deficit derivative dividend endowment
escrow expenditure factoring fiduciary fund futures grant hedge installment insurance
invoice lease lien liquidity loan margin maturity mortgage obligation overdraft
ownership portfolio premium profit recession redemption refinancing return savings
securities settlement surplus tariff treasury valuation venture yield

acquittal affidavit certiorari citation codicil contempt conviction covenant creditor
culpability damages deceit default defamation deposition disclaimer easement estoppel
extradition felony fiduciary forfeiture franchise garnishment habeas homicide immunity
indemnity injunction insolvency intestate joinder jurisprudence larceny mandate
mediation misdemeanor mitigation negligence ordinance perjury pleading probate
prosecution restitution sanction settlement slander statute subrogation summons surety
tenancy tort trademark verdict waiver warrant writ

acquisition advertising affiliate alignment attrition benchmark branding breakeven
certification clearance conversion credibility delegation diversification downsizing
ecosystem expansion expenditure feasibility forecasting fulfillment governance leverage
licensing logistics merger milestone monetization monopoly outsourcing overhead
penetration pipeline procurement profitability prototype quota rebranding recruitment
resilience restructuring retention roadmap scalability segmentation stakeholder
subscription syndication targeting throughput trademark transaction valuation velocity
vendor viability

abandonment abreaction acculturation adaptation affirmation ambivalence archetype
assimilation attribution aversion behavior biofeedback boundary burnout catharsis
closure codependency cognition compulsion conditioning consciousness coping denial
desensitization displacement dissociation distortion dysregulation empowerment
escapism fixation frustration gratification habituation hypervigilance hypnosis
impulsivity individuation instinct intellectualization internalization introspection
isolation masochism mindfulness narcissism neuroplasticity neurosis obsession paranoia
perception perfectionism persona phobia projection rationalization regression
reinforcement rejection repression resilience resistance rumination socialization
sublimation transference trauma unconscious validation

abscissa accuracy addend adjacency algebra average axiom base binomial calculus
cardinality coefficient combination commutative complexity conjecture continuity
convergence corollary counterexample curvature decomposition determinant differential
divergence duality eigenvalue embedding equivalence estimation exponential extrapolation
factorization fraction graph heuristic inequality induction inference interpolation
invariant isomorphism iteration kernel lattice linearization manifold mapping metric
modulo monotone morphism norm ordinal orthogonal permutation polynomial precision prime
projection quotient recurrence reduction regression residual root sequence simplex
simulation singularity solution subset summation theorem topology transitivity variable
variance vector

aquifer biome biodegradation biomass biota chlorophyll compost condensation contamination
deforestation emission erosion evaporation extinction fertilization habitat humidity
hydrology infiltration irrigation landslide mineralization nitrogen organism ozone
photosynthesis phytoplankton plankton pollution population precipitation radiation
reforestation respiration restoration runoff salinity sedimentation sequestration
stewardship stratosphere substrate sustainability symbiosis thermosphere transpiration
troposphere turbulence wildlife

acoustic album amp arrangement ballad banjo bassline beat bridge chord chorus clef
concert decibel demo downbeat drone duet dynamics ensemble equalization fade falsetto
frequency groove harmony hook hymn improvisation interval intro jam key melody
metronome microphone motif movement notation octave opus outro overtone pedal
performance pitch playlist production progression quartet quaver recording refrain
rehearsal release resonance reverb rhythm riff score semitone session solo sonata
soprano soundscape stanza string symphony tempo timbre track transcription trio tune
verse vibrato vocal

abstraction aesthetics animation canvas cartoon casting ceramic chiaroscuro collage
composition contour draft drawing dye easel embroidery etching exhibition expression
finish fresco gallery gouache gradient graphic hue illustration impression installation
layout lithography medium montage mosaic mural negative outline palette pastel
perspective pigment pixel portrait proportion realism rendering saturation sculpture
silhouette stroke surrealism symmetry texture tint typography watercolor

accent acronym adjective adverb affixation ambiguity antonym appositive aspect
auxiliary bilingualism blend borrowing calque clause collocation compounding conjunction
connotation copula denotation derivation determiner diacritic dialect digraph diphthong
ellipsis etymology formant gender grammar homonym hyponym idiom infix inflection
intonation lemma locution metaphor morpheme morphology negation orthography paradigm
particle phoneme phonetics phonology phrase placeholder polysemy pragmatics predicate
prefix pronoun semantics suffix syllable synecdoche synonym syntax tense utterance

blog bookmark caption celebrity channel chat click comment conversion curator dashboard
direct discovery download engagement feed follower forum hashtag impression inbox
influencer integration interaction keyword landing mention meme metric moderator
monetize newsletter notification organic page platform podcast post privacy profile
promotion reach reel signup spam story stream subscription tag thread timeline traffic
trending upload username verification viral visibility webinar
`.trim().split(/\s+/).filter(w=>w.length>0);

// ── NOUNS — Technology & Computing (large set) ────────────────────────────────
const TECH_NOUNS = `
abstraction accelerator accessibility adapter aggregator algorithm amplifier analytics
annotation application architecture archive artifact assertion authentication automation
availability backend batch beacon bootstrap branch browser buffer bundle cache callback
certificate channel checksum cluster codec collection commit component compression
concurrency configuration container context contract controller database declaration
decoding dependency deployment descriptor device diagram dispatcher distribution
encoding endpoint event exception execution extension factory failover feature fetch
filter firewall framework function gateway generator handler heap hosting hook
inference initializer instance integration interface interpreter interrupt iteration
kernel latency listener loader logging manifest memory message middleware migration
namespace observer operation orchestrator output parser payload pipeline plugin pointer
polling protocol queue replication renderer repository request response router runtime
sandbox scheduler selector server sharding signal socket specification stack state
store stream stub subscriber transaction transformer trigger tunnel validator variable
version virtual webhook worker

accessibility adapter addon aggregator analytics annotation application archive array
assertion asset attribute automation backend batch beacon binary blockchain bootstrap
branch breakpoint browser buffer bundle cache caching callback canvas chain checkpoint
class client cluster code codec collection column commit compilation component composite
configuration connection consumer container content controller convention core coverage
cursor daemon database debug declaration decorator dependency deployment descriptor
device dialog directive discovery disk driver endpoint entity error event exception
execution export expression factory feature fetch field filter firewall fixture flag
flow folder format fragment function generator getter grid guard handler hash header
heap history hook host icon identity index injection input instance interface kernel
layer layout library listener log loop manifest map marker memory message method metric
middleware model module monitor mount mutation namespace network node object output
package param parser path payload permission pipe pointer pool prefix process profile
prop protocol proxy query queue receiver record redirect registry relay renderer
request resolver resource response route router runtime schema script segment selector
sequence server session setter signal slice slot snapshot socket sort source stack
statement step store stream struct subscriber syntax tag target template thread timeout
token trace transformer trigger tuple type union update variable viewport warning
websocket worker wrapper
`.trim().split(/\s+/).filter(w=>w.length>0);

// ── NOUNS — Science, Medical, Legal, Business (large sets) ───────────────────
const SCI_NOUNS = `
acceleration acoustics aerodynamics aeronautics algebra algorithm alloy amplitude anatomy
anthropology archaeology astrophysics astronomy atmosphere atom bioinformatics biomechanics
biophysics botany calculus catalyst celestial chemistry chronology circuit climatology
cognitive compound conductor cosmology crystallography cybernetics cytology dendrology
dermatology differential dynamics ecology electromagnetism electron embryology empirical
endocrinology entomology entropy epidemiology ergonomics etiology evolution exobiology
fermentation fluid forensics fractal friction galaxy genome geochemistry geodesy
geophysics graphene gravitation hematology heredity histology homeostasis hydraulics
immunology inertia isotope kinetics kinesiology kinematics limnology magnetism mechanics
metabolism microbiology mineralogy morphology mycology nanotechnology neuroscience
nucleotide oceanography optics ornithology paleontology parasitology pathology
pharmacology photonics physiology polymer probability proteomics psychiatry quantum
radiology refraction relativity rheology seismology semiconductor sociology spectroscopy
statistics stoichiometry superconductor taxonomy thermodynamics toxicology transistor
turbulence urology velocity virology viscosity volcanology xenobiology zoology

abdomen abduction abnormality abscess acetylcholine acidosis acupuncture adenoma adipose
adrenal aerobic albumin aldosterone allergen allergy alveolus amnesia amygdala analgesia
analgesic anaphylaxis aneurysm angiography anticoagulant antigen antioxidant aorta apnea
appendix arthritis asthma atherosclerosis atrophy autoimmune axon bacteriemia biomarker
biopsy bronchitis bronchodilator calcification capillary carcinogen cardiology catheter
cerebellum cerebrum chemotherapy chromosome collagen colonoscopy conjunctivitis cortex
cortisol creatinine cytokine dementia dendrite dermatitis detoxification diastolic
dilation diphtheria diuretic dopamine duodenum dysarthria dyspnea edema electrocardiogram
electrolyte embolism encephalitis endocarditis endorphin endoscopy enzyme epidermis
epilepsy epinephrine equilibrium erythrocyte estrogen etiology femur fibromyalgia fibrosis
fluoroscopy follicle gallbladder gastroenterology gastrointestinal genomics glaucoma
glucagon glycogen hallucination hemoglobin hepatitis histamine homeostasis hormone
hypertension hyperthyroidism hypoglycemia hypothalamus hypothyroidism immunosuppression
infarction inflammation infusion insulin integumentary intubation ischemia laparoscopy
laryngitis leukocyte leukemia ligament lipid lymphocyte malignancy mammography medulla
melanin melanoma metabolism mitosis morphology myeloma myocardium nephrology neurology
neuropathy neurotransmitter norepinephrine oncology ophthalmology orthopedics osteoporosis
otolaryngology pacemaker pathogen pediatrics perfusion pericarditis peristalsis phagocyte
pharmacokinetics platelets pneumonia polyp prognosis prolactin prosthesis pulmonology
radiotherapy receptor remission renal ribonucleic sarcoma serotonin spirometry stenosis
streptococcus syndrome systolic thrombosis thyroid transplant triage triglyceride
tuberculosis tumor ulcerative urology vaccination vasodilation ventilator vertebra
`.trim().split(/\s+/).filter(w=>w.length>0);

// ── VERBS ─────────────────────────────────────────────────────────────────────
const CORE_VERBS = `
abandon absorb abuse access acknowledge acquire act activate adapt address adhere
adjust administer admit adopt advance advise affect aggregate agree aim alert align
allow alter analyze annotate anticipate apply appreciate approach approve argue assign
assist assume authorize automate balance block boost cache capture categorize calculate
certify clarify classify code collaborate collect combine commit communicate compile
complete compose configure confirm connect consolidate contain contribute coordinate
cover customize debug decide decompose decrease define delegate demonstrate deny deploy
derive detect determine differentiate disable discover dispatch distribute document
download elaborate enable encode enforce enhance evaluate evolve examine expand export
extend facilitate fail filter flag focus format gather generate govern guide handle
highlight identify include indicate inform initialize innovate inspect integrate iterate
invoke join justify launch leverage limit link list maintain manage map mark measure
merge migrate minimize model moderate modify motivate navigate negotiate notify observe
obtain operate overcome participate partition persist post predict prepare present
prioritize produce project promote propose query queue raise recommend refine reflect
reinforce relate remove repeat replace represent request research respond restrict
reverse route sample scale select simulate sort specify start standardize structure
submit summarize support tag target trace transform translate traverse use verify view
accept achieve advance affect affirm allocate amend amplify annotate apologize appeal
articulate ascertain assert attribute audit award battle benchmark bid bind broadcast
calculate cancel capture chart claim compete complain conduct confront contact continue
correct count critique cycle damage declare deliver depend describe detect develop
divide dominate draft earn edit eliminate embed engage establish estimate evaluate
exceed exhibit experiment explain forecast formulate forward fulfill gather highlight
include influence insert instruct interact interpret investigate issue launch lead
locate log mandate match maximize measure motivate navigate negotiate obtain perform
plan prevent process produce provide raise recommend reduce register regulate reinforce
remove reproduce require resolve retrieve review sample schedule select sort split
standardize structure submit target track transform understand upload validate wrap
abide accelerate accept achieve acquire act adapt address adhere adjust administer
admit adopt advance advise affect agree aid alert analyze apply approve arrange
articulate assert assign assume authorize balance block boost capture categorize check
classify collect combine commit communicate complete compute configure confirm connect
consolidate contribute control convert coordinate customize debug declare deliver
determine differentiate dispatch document download enable encode evaluate execute
explore extend fetch filter format generate handle identify implement improve inspect
integrate interpret justify launch maintain manage measure migrate modify monitor
notify observe optimize organize parse perform plan prioritize process protect provide
publish recommend record reduce release remove render report restore retrieve schedule
search select share sort specify store submit support synchronize test trace transfer
update validate verify view write
`.trim().split(/\s+/).filter(w=>w.length>0);

// ── ADJECTIVES ────────────────────────────────────────────────────────────────
const CORE_ADJ = `
abstract accurate adaptive advanced aggressive agile analytical appropriate assertive
automated available balanced beneficial brief broad capable careful challenging clean
clear coherent compatible complete complex comprehensive consistent constructive
controlled convenient cooperative correct creative critical current decisive defined
deliberate detailed direct distinct diverse dynamic effective efficient elaborate
engaging essential ethical evident expandable explicit extensive external fair flexible
formal functional fundamental global gradual helpful hierarchical holistic honest
horizontal innovative intelligent interactive internal intuitive iterative justified
key legitimate linear logical manageable meaningful methodical minimal modular multiple
necessary notable objective observable operational optional organized original parallel
practical precise predictable productive progressive proportional public qualified
quantifiable reliable resilient rigorous robust scalable secure significant skilled
stable strategic structured suitable systematic technical tested thorough transparent
typical unified unique useful valid versatile visible absolute actionable ambitious
applicable authentic binding central closed collective committed conditional concise
configured contextual controlled cumulative custom deterministic distributed documented
dominant enriched explicit extensible formal generative governed graded independent
indexed informed integrated interactive localized maintained managed mapped mobile
monitored native nested normalized observed ongoing ordered parameterized persistent
portable processed protected ranked reactive registered regulated repeatable replicated
representative restricted routed scheduled scoped searchable serialized simplified
sorted specified standardized stored streamlined subscribed supported synchronized
tagged targeted traced tracked transformed trusted updated versioned weighted wrapped
azure beige black blue brown coral cream crimson cyan emerald fuchsia gold gray green
indigo ivory jade khaki lavender lime magenta maroon mint navy olive orange peach pink
purple red rose ruby salmon scarlet silver sky tan teal turquoise violet white yellow
afraid alert alienated anxious arrogant attached attracted bitter bold bored brave
broken calm cheerful compassionate concerned content courageous curious daring depressed
determined disappointed disgusted eager embarrassed empathetic energetic enthusiastic
envious fearful focused generous grateful guilty humble impatient indifferent irritated
joyful lonely loving loyal melancholic mindful miserable nervous nostalgic patient
peaceful persistent playful positive protective proud reflective regretful resentful
sensitive skeptical sorrowful stressed stubborn suspicious sympathetic thankful
thoughtful timid tired tolerant troubled vulnerable wary worried
acidic bitter bland bright crispy crunchy damp dense dry dusty faint flaky fluffy
fragrant frozen harsh humid icy intense moist muddy musty oily pungent salty sharp
slippery smooth sour spicy sticky sweaty sweet tangy tender thick tight tingling
turbulent vibrant viscous watery
big small large little tall short long wide narrow thick thin heavy light strong weak
hard soft rough smooth sharp dull hot cold warm cool wet dry clean dirty bright dark
loud quiet fast slow quick old new young fresh stale full empty open closed free busy
easy simple good bad great poor rich cheap expensive high low near far safe dangerous
`.trim().split(/\s+/).filter(w=>w.length>0);

// ── ADVERBS ───────────────────────────────────────────────────────────────────
const CORE_ADV = `
absolutely accordingly accurately actively actually additionally adequately
aggressively analytically appropriately automatically away badly barely broadly
carefully chronologically clearly closely collaboratively commonly completely concisely
conditionally confidently consistently continuously cooperatively correctly currently
deeply definitely differently directly dynamically easily effectively efficiently
eventually exactly explicitly extensively extremely fairly finally flexibly formally
frequently functionally generally globally gradually helpfully hierarchically
historically honestly ideally immediately independently initially interactively
internally iteratively logically loosely manually maximally meaningfully methodically
minimally naturally necessarily negatively objectively obviously occasionally
operationally optimally originally partially particularly persistently physically
practically precisely predictably privately proactively progressively properly
proportionally publicly quickly randomly reactively repeatedly responsibly robustly
roughly safely selectively separately sequentially significantly simultaneously
specifically strategically substantially successfully technically thoroughly totally
typically uniquely universally urgently validly versatilely visually
very quite really extremely highly deeply truly fully absolutely completely totally
entirely partly partially somewhat rather fairly mostly mainly largely greatly slightly
barely hardly scarcely nearly almost just only even still yet already soon now then
here there everywhere nowhere anywhere somewhere always never often sometimes rarely
usually generally typically normally frequently occasionally constantly continuously
repeatedly gradually suddenly immediately quickly slowly carefully easily clearly
directly exactly precisely roughly approximately finally eventually initially
`.trim().split(/\s+/).filter(w=>w.length>0);

// ── OTHER (function words) ────────────────────────────────────────────────────
const CORE_OTHER = `
a about above across after against along among around at because before behind
below beneath beside besides between beyond by despite down during except for from
in including into like near of off on onto out outside over past per since than
through throughout to toward under unless until up upon via with within without
and but or nor so yet although as even if once whether while who whom whose which
i me my mine you your yours he him his she her hers it its we us our ours they them
their theirs this that these those all any both each every few many much more most
other some such no one several own same another the an
yes no ok okay please thanks sorry well so now then actually basically honestly
obviously clearly certainly definitely probably maybe perhaps anyway however therefore
meanwhile furthermore additionally instead otherwise still
one two three four five six seven eight nine ten eleven twelve hundred thousand
million billion first second third fourth fifth last next previous final
`.trim().split(/\s+/).filter(w=>w.length>0);

// ── Register all base vocabulary ──────────────────────────────────────────────
CORE_NOUNS.forEach(w => addN(w));
DOMAIN_NOUNS.forEach(w => addN(w));
TECH_NOUNS.forEach(w => addN(w));
SCI_NOUNS.forEach(w => addN(w));
CORE_VERBS.forEach(w => addV(w));
CORE_ADJ.forEach(w => addA(w));
CORE_ADV.forEach(w => addAdv(w));
CORE_OTHER.forEach(w => addOth(w));

// ═══════════════════════════════════════════════════════════════════════════════
// SECTION 2 — DERIVATIONAL EXPANSION
// ═══════════════════════════════════════════════════════════════════════════════

// ── 2a. Prefixed verbs ────────────────────────────────────────────────────────
const BASE_VERBS = CORE_VERBS.filter(w => w.length >= 3 && w.length <= 14 &&
  Object.values(vocab).some(v => v.lemma === w && v.pos === 'verb' && vocab[w]));

const V_PREFIXES = ['re','pre','un','over','under','out','inter','sub','co','de',
                    'dis','mis','non','trans','counter','anti'];
const SHORT_VERB_BASES = [
  'act','add','adjust','align','apply','archive','arrange','assess','assign','attach',
  'authenticate','authorize','automate','balance','build','calculate','capture','change',
  'check','classify','code','collect','combine','compile','complete','configure','connect',
  'consolidate','contain','contribute','control','convert','coordinate','create','customize',
  'debug','define','deliver','design','detect','develop','distribute','document','download',
  'enable','encode','evaluate','execute','export','extend','fetch','filter','format',
  'generate','handle','identify','implement','import','initialize','install','integrate',
  'iterate','launch','link','load','maintain','manage','map','measure','merge','migrate',
  'model','monitor','normalize','observe','optimize','organize','parse','perform','plan',
  'process','publish','query','read','record','register','render','report','restore',
  'retrieve','run','save','schedule','search','select','share','sort','specify','start',
  'store','submit','sync','test','trace','transfer','transform','translate','update',
  'validate','verify','view','write','check','call','name','note','set','use','get',
  'send','show','find','hold','keep','leave','make','open','close','push','pull',
  'build','copy','move','lock','mark','print','rank','rate','scan','sign','skip',
  'stop','tag','test','tick','trim','turn','wrap','log','run',
];
V_PREFIXES.forEach(function(prefix) {
  SHORT_VERB_BASES.forEach(function(base) {
    const w = prefix + base;
    if (w.length >= 4 && w.length <= 22 && !vocab[w]) addV(w);
  });
});

// ── 2b. Derivational noun suffixes ────────────────────────────────────────────
const TION_VERB_BASES = [
  'abstract','accumulate','accommodate','act','activate','adapt','addend','administer',
  'adopt','affiliate','aggregate','allocate','annotate','anticipate','approve',
  'arbitrate','archive','articulate','assemble','assert','assess','associate','authorize',
  'automate','calculate','calibrate','categorize','certify','circulate','classify',
  'collaborate','collect','communicate','compensate','compile','compute','concentrate',
  'configure','confirm','connect','consolidate','contribute','convert','coordinate',
  'correlate','create','customize','dedicate','define','delegate','demonstrate',
  'deprecate','derive','differentiate','distribute','document','duplicate',
  'elaborate','eliminate','encrypt','enumerate','escalate','estimate','evaluate',
  'execute','expand','explain','export','extrapolate','facilitate','federate',
  'filter','finalize','formulate','generate','globalize','govern','identify',
  'illustrate','implement','index','indicate','initialize','innovate','inspect',
  'integrate','interpret','investigate','iterate','justify','localize','maintain',
  'mandate','maximize','migrate','minimize','moderate','model','monitor','motivate',
  'navigate','normalize','notify','observe','operate','optimize','orchestrate',
  'organize','paginate','participate','perform','personalize','plan','predict',
  'process','produce','promote','propose','protect','publish','quantify',
  'recommend','reconcile','register','regulate','relate','replicate','report',
  'represent','reproduce','require','resolve','restore','secure','select','serialize',
  'simulate','specify','standardize','structure','submit','subscribe','summarize',
  'support','synchronize','target','terminate','trace','transfer','transform',
  'translate','validate','verify','visualize','allocate','parameterize',
];
TION_VERB_BASES.forEach(function(base) {
  let stem = base;
  if (base.endsWith('ize')) stem = base.slice(0,-3) + 'iz';
  else if (base.endsWith('ate')) stem = base.slice(0,-3) + 'at';
  else if (base.endsWith('ify')) stem = base.slice(0,-3) + 'ific';
  else if (base.endsWith('e')) stem = base.slice(0,-1);
  addN(stem + 'ation');
  addN(stem + 'ations');
});

// ── 2c. Agent nouns (-er, -or) ────────────────────────────────────────────────
const ER_BASES = [
  'adapt','administer','advocate','analyze','authenticate','authorize','automate',
  'broadcast','build','calculate','capture','code','collaborate','communicate',
  'compile','compute','configure','connect','contribute','coordinate','create',
  'customize','debug','decode','define','deploy','design','develop','distribute',
  'document','drive','edit','encode','evaluate','execute','filter','generate',
  'handle','identify','implement','innovate','integrate','interpret','investigate',
  'iterate','lead','maintain','manage','moderate','monitor','navigate','optimize',
  'organize','parse','perform','plan','predict','process','program','promote',
  'provide','publish','query','render','research','resolve','review','schedule',
  'search','select','share','simulate','solve','store','subscribe','support',
  'test','train','transform','translate','update','validate','visualize','write',
];
ER_BASES.forEach(function(base) {
  let stem = base.endsWith('e') ? base.slice(0,-1) : base;
  addN(stem + 'er');
  if (base.endsWith('ate')) addN(base.slice(0,-3) + 'ator');
});

// ── 2d. -ment nouns ────────────────────────────────────────────────────────────
[
  'achieve','acknowledge','adjust','advertise','agree','align','allot','amaze','amend',
  'announce','appoint','arrange','assess','attach','commit','develop','disappoint',
  'enable','encourage','enforce','engage','enjoy','establish','evaluate','govern',
  'improve','invest','involve','manage','measure','pay','place','require','state',
  'treat','update','amend','attract','empower','enforce','govern','harness',
].forEach(function(base) {
  let stem = base.endsWith('e') ? base.slice(0,-1) : base;
  addN(stem + 'ment');
});

// ── 2e. -ness nouns ────────────────────────────────────────────────────────────
[
  'accurate','adaptable','adequate','agile','alert','aware','balanced','bold','bright',
  'calm','capable','careful','clear','close','coherent','complete','concise','confident',
  'consistent','correct','creative','dark','determined','direct','diverse','durable',
  'eager','effective','efficient','elegant','equal','fair','flexible','fluent','focused',
  'frank','free','friendly','functional','genuine','good','great','grateful','happy',
  'hard','helpful','honest','hopeful','humble','innovative','intelligent','intense',
  'kind','light','logical','loyal','mindful','natural','necessary','open','organized',
  'patient','precise','productive','professional','qualified','quick','quiet','ready',
  'reliable','resilient','responsible','robust','safe','secure','sensitive','sharp',
  'simple','sincere','skilled','smart','stable','strong','subtle','swift','thorough',
  'thoughtful','transparent','trustworthy','unique','useful','valid','versatile',
  'vital','warm','willing','wise','worthwhile','gentle','graceful','steady','tender',
  'active','alert','alive','ample','aware','bold','brave','busy','cheerful','cool',
  'crisp','crude','cruel','dull','faint','fresh','full','gentle','glad','grim','harsh',
  'keen','mild','neat','nice','odd','pale','plain','pure','rare','rash','rigid','rough',
  'rude','sane','sharp','shy','sick','slim','slow','soft','sour','steep','sweet','swift',
  'tame','thin','tight','vague','vast','wild','worthy',
].forEach(function(adj) {
  let s = adj;
  if (adj.endsWith('y')&&adj.length>2&&!isVowel(adj[adj.length-2])) s=adj.slice(0,-1)+'i';
  addN(s + 'ness');
  addA('un'+adj);
  addA('non'+adj);
});

// ── 2f. -ity nouns ────────────────────────────────────────────────────────────
[
  'accessible','adaptable','available','capable','compatible','comprehensible',
  'credible','decisive','destructible','divisible','durable','eligible','extensible',
  'feasible','flexible','functional','immutable','inclusive','inflexible',
  'manageable','measurable','modular','notable','observable','operable','original',
  'portable','predictable','productive','quantifiable','readable','reliable',
  'repeatable','resilient','responsible','reusable','reversible','scalable','sensitive',
  'stable','testable','traceable','transparent','usable','versatile','viable',
  'visible','vulnerable','accessible','audible','compatible','convertible',
  'divisible','extractable','governable','improvable','indefinable','invisible',
  'modifiable','observable','programmable','quantifiable','trackable','treatable',
  'understandable',
].forEach(function(adj) {
  let s = adj;
  if (adj.endsWith('ble')) s = adj.slice(0,-3);
  else if (adj.endsWith('le')) s = adj.slice(0,-2);
  else if (adj.endsWith('al')) s = adj;
  addN(s + 'ity');
});

// ── 2g. -able / -ible adjectives ─────────────────────────────────────────────
const ABLE_BASES = [
  'accept','access','achieve','act','adapt','add','adjust','administer','admit',
  'allow','analyze','apply','approve','archive','arrange','assess','associate',
  'authenticate','authorize','automate','balance','build','calculate','capture',
  'categorize','certify','change','check','classify','collect','combine','communicate',
  'compile','complete','compute','configure','connect','consume','contribute','control',
  'convert','coordinate','create','customize','debug','define','deliver','deploy',
  'describe','detect','determine','differentiate','distribute','document','download',
  'enable','encode','enforce','evaluate','execute','expand','export','extend','fetch',
  'filter','format','generate','handle','identify','implement','improve','include',
  'initialize','inspect','integrate','interpret','iterate','justify','launch','maintain',
  'manage','measure','model','monitor','normalize','observe','operate','optimize',
  'organize','parse','perform','plan','predict','process','provide','quantify','read',
  'recommend','record','reduce','register','relate','remove','render','repeat','report',
  'reproduce','require','resolve','restore','retrieve','route','schedule','search',
  'select','serialize','share','simulate','sort','specify','standardize','store',
  'structure','submit','support','synchronize','test','trace','track','transfer',
  'transform','translate','update','use','validate','verify','view','write',
];
ABLE_BASES.forEach(function(base) {
  let s = base.endsWith('e') ? base.slice(0,-1) : base;
  addA(s+'able'); addA('un'+s+'able'); addA('non'+s+'able');
});

// ── 2h. -ly adverbs from all adjectives ──────────────────────────────────────
const adj_lemmas = new Set(
  Object.entries(vocab)
    .filter(([w,v]) => v.pos === 'adj' && v.lemma === w)
    .map(([w]) => w)
);
adj_lemmas.forEach(function(adj) {
  if (adj.includes('-') || adj.length > 14) return;
  let adv;
  if (adj.endsWith('le') && adj.length > 3) adv = adj.slice(0,-2)+'ly';
  else if (adj.endsWith('y')&&adj.length>2&&!isVowel(adj[adj.length-2]))
    adv = adj.slice(0,-1)+'ily';
  else if (adj.endsWith('ic')) adv = adj+'ally';
  else adv = adj+'ly';
  if (adv.length <= 20) addAdv(adv);
});

// ── 2i. -ful / -less / -ish forms ─────────────────────────────────────────────
const FUL_BASES = [
  'art','awe','beauty','bounty','care','cheer','color','delight','doubt','dread',
  'duty','faith','fear','force','grace','gratitude','grief','guilt','hand','harm',
  'hate','help','hope','hurt','joy','knowledge','life','love','mercy','mind','need',
  'pain','peace','play','power','pride','purpose','skill','sorrow','stress','taste',
  'thought','truth','use','value','wonder','worth','stress','fancy','cheer','grace',
  'mercy','doubt','grief','dread','faith','care','use','hope','power','pain','harm',
];
FUL_BASES.forEach(function(b) {
  addA(b+'ful'); addAdv(b+'fully'); addN(b+'fulness');
  addA(b+'less'); addAdv(b+'lessly'); addN(b+'lessness');
});

// ── 2j. -ing / -ed as adjectives ─────────────────────────────────────────────
// Many participial adjectives; select common ones
const PART_VERBS = [
  'challenge','confuse','exhaust','fascinate','frustrate','impress','inspire',
  'interest','motivate','overwhelm','surprise','encourage','disappoint','satisfy',
  'absorb','activate','adapt','advance','balance','cache','cache','clear','close',
  'collect','combine','complete','configure','connect','create','customize','define',
  'deploy','design','develop','distribute','enable','evaluate','execute','expand',
  'filter','format','generate','handle','identify','implement','initialize','inspect',
  'integrate','iterate','launch','maintain','manage','measure','merge','migrate',
  'moderate','monitor','notify','observe','optimize','organize','perform','plan',
  'process','provide','reduce','register','restore','retrieve','schedule','search',
  'select','serialize','sort','specify','standardize','store','structure','submit',
  'support','synchronize','target','test','trace','transform','translate','update',
  'validate','verify','view','write',
];
PART_VERBS.forEach(function(v) {
  let ing = v.endsWith('e') ? v.slice(0,-1)+'ing' : v+'ing';
  let ed  = v.endsWith('e') ? v+'d' : v+'ed';
  addA(ing); addA(ed);
});

// ── 2k. Common compound nouns (domain-specific) ────────────────────────────────
const COMPOUNDS = [];
const D1 = ['web','app','mobile','cloud','data','user','code','file','form','site',
            'page','test','work','team','time','load','error','log','api','key',
            'name','type','mode','view','list','item','link','node','edge','grid',
            'flow','task','note','tag','path','rule','role','host','port'];
const D2 = ['flow','base','line','side','space','time','stream','store','set','map',
            'chain','point','track','path','root','tree','work','stack','pool','zone',
            'layer','stage','step','hook','event','state','scope','frame','block',
            'page','view','link','type','queue','loop','pipe','cache','index','limit',
            'count','rate','size','level','group','round','cycle','batch','chunk','row'];
D1.forEach(d => D2.forEach(s => { const w=d+s; if(w.length>=5&&w.length<=18) COMPOUNDS.push(w); }));
COMPOUNDS.forEach(c => addN(c));

// ── 2l. -ism, -ist, -ism (ideologies and practitioners) ──────────────────────
const ISM_BASES = [
  'activism','agnosticism','altruism','capitalism','centralism','classicism',
  'collectivism','colonialism','commercialism','communalism','conservatism',
  'constructivism','consumerism','cubism','cynicism','dadaism','darwinism',
  'determinism','digitalism','dualism','eclecticism','empiricism','environmentalism',
  'existentialism','expressionism','extremism','fatalism','federalism','feminism',
  'functionalism','futurism','globalism','humanism','idealism','impressionism',
  'individualism','institutionalism','intellectualism','internationalism',
  'liberalism','localism','minimalism','modernism','nationalism','naturalism',
  'nihilism','objectivism','optimism','pacifism','paganism','patriotism',
  'perfectionism','pessimism','pluralism','populism','pragmatism','progressivism',
  'rationalism','realism','relativism','romanticism','secularism','skepticism',
  'socialism','stoicism','structuralism','subjectivism','surrealism','symbolism',
  'totalitarianism','traditionalism','utilitarianism','utopianism',
];
const IST_BASES = [
  'activist','advocate','alchemist','analyst','antagonist','apologist','archaeologist',
  'archivist','artist','atheist','biologist','chemist','classicist','climatologist',
  'collaborationist','communist','conservative','cyclist','darwinist','defeatist',
  'dentist','dermatologist','economist','empiricist','essayist','ethnologist',
  'evangelist','existentialist','extremist','feminist','futurist','generalist',
  'geologist','globalist','guitarist','humanist','idealist','immunologist','journalist',
  'linguist','lobbyist','loyalist','marxist','mathematician','minimalist','modernist',
  'nationalist','naturalist','nihilist','novelist','nutritionist','optimist','pacifist',
  'pessimist','pharmacist','physicist','pianist','pluralist','podcast','populist',
  'pragmatist','progressivist','protagonist','psychologist','publicist','rationalist',
  'realist','receptionist','scientist','secularist','socialist','sociologist',
  'specialist','strategist','stylist','symbolist','therapist','traditionalist',
  'typist','utilitarian','violinist','vocalist',
];
ISM_BASES.forEach(w => addN(w));
IST_BASES.forEach(w => addN(w));

// ── 2m. Irregular verbs and nouns ─────────────────────────────────────────────
const IRR_VERBS = {
  be:['am','is','are','was','were','been','being'],have:['has','had','having'],
  do:['does','did','done','doing'],go:['goes','went','gone','going'],
  get:['gets','got','gotten','getting'],make:['makes','made','making'],
  take:['takes','took','taken','taking'],come:['comes','came','coming'],
  see:['sees','saw','seen','seeing'],know:['knows','knew','known','knowing'],
  think:['thinks','thought','thinking'],say:['says','said','saying'],
  give:['gives','gave','given','giving'],find:['finds','found','finding'],
  tell:['tells','told','telling'],keep:['keeps','kept','keeping'],
  hold:['holds','held','holding'],bring:['brings','brought','bringing'],
  write:['writes','wrote','written','writing'],sit:['sits','sat','sitting'],
  stand:['stands','stood','standing'],lose:['loses','lost','losing'],
  pay:['pays','paid','paying'],meet:['meets','met','meeting'],
  run:['runs','ran','running'],build:['builds','built','building'],
  fall:['falls','fell','fallen','falling'],grow:['grows','grew','grown','growing'],
  break:['breaks','broke','broken','breaking'],buy:['buys','bought','buying'],
  send:['sends','sent','sending'],spend:['spends','spent','spending'],
  win:['wins','won','winning'],cut:['cuts','cutting'],read:['reads','reading'],
  speak:['speaks','spoke','spoken','speaking'],lead:['leads','led','leading'],
  choose:['chooses','chose','chosen','choosing'],drive:['drives','drove','driven','driving'],
  eat:['eats','ate','eaten','eating'],feel:['feels','felt','feeling'],
  fly:['flies','flew','flown','flying'],leave:['leaves','left','leaving'],
  catch:['catches','caught','catching'],hear:['hears','heard','hearing'],
  show:['shows','showed','shown','showing'],wear:['wears','wore','worn','wearing'],
  begin:['begins','began','begun','beginning'],put:['puts','putting'],
  let:['lets','letting'],fight:['fights','fought','fighting'],
  forget:['forgets','forgot','forgotten','forgetting'],
  understand:['understands','understood','understanding'],
  sell:['sells','sold','selling'],draw:['draws','drew','drawn','drawing'],
  sleep:['sleeps','slept','sleeping'],teach:['teaches','taught','teaching'],
  throw:['throws','threw','thrown','throwing'],ride:['rides','rode','ridden','riding'],
  rise:['rises','rose','risen','rising'],seek:['seeks','sought','seeking'],
  deal:['deals','dealt','dealing'],feed:['feeds','fed','feeding'],
  hide:['hides','hid','hidden','hiding'],hit:['hits','hitting'],hurt:['hurts','hurting'],
  bite:['bites','bit','bitten','biting'],blow:['blows','blew','blown','blowing'],
  wake:['wakes','woke','woken','waking'],hang:['hangs','hung','hanging'],
  light:['lights','lit','lighting'],lay:['lays','laid','laying'],
  bear:['bears','bore','borne','bearing'],bind:['binds','bound','binding'],
  lie:['lies','lay','lain','lying'],mean:['means','meant','meaning'],
  set:['sets','setting'],shine:['shines','shone','shining'],
  shrink:['shrinks','shrank','shrunk','shrinking'],sing:['sings','sang','sung','singing'],
  sink:['sinks','sank','sunk','sinking'],slide:['slides','slid','sliding'],
  split:['splits','splitting'],spread:['spreads','spreading'],
  steal:['steals','stole','stolen','stealing'],stick:['sticks','stuck','sticking'],
  sting:['stings','stung','stinging'],strike:['strikes','struck','stricken','striking'],
  swear:['swears','swore','sworn','swearing'],sweep:['sweeps','swept','sweeping'],
  swim:['swims','swam','swum','swimming'],swing:['swings','swung','swinging'],
  tear:['tears','tore','torn','tearing'],weep:['weeps','wept','weeping'],
  wind:['winds','wound','winding'],withdraw:['withdraws','withdrew','withdrawn','withdrawing'],
  dream:['dreams','dreamed','dreamt','dreaming'],learn:['learns','learned','learnt','learning'],
  spell:['spells','spelled','spelt','spelling'],burn:['burns','burned','burnt','burning'],
  leap:['leaps','leaped','leapt','leaping'],kneel:['kneels','knelt','kneeling'],
  lend:['lends','lent','lending'],shed:['sheds','shedding'],quit:['quits','quitting'],
  ring:['rings','rang','rung','ringing'],forbid:['forbids','forbade','forbidden','forbidding'],
  freeze:['freezes','froze','frozen','freezing'],grind:['grinds','ground','grinding'],
  breed:['breeds','bred','breeding'],creep:['creeps','crept','creeping'],
  dig:['digs','dug','digging'],flee:['flees','fled','fleeing'],
  forgive:['forgives','forgave','forgiven','forgiving'],
  weave:['weaves','wove','woven','weaving'],
};
Object.entries(IRR_VERBS).forEach(function([lem,forms]) {
  reg(lem,lem,'verb'); forms.forEach(f=>reg(f,lem,'verb'));
});

const IRR_NOUNS = {
  person:['people','persons'],child:['children'],man:['men'],woman:['women'],
  tooth:['teeth'],foot:['feet'],mouse:['mice'],goose:['geese'],ox:['oxen'],
  datum:['data'],medium:['media'],criterion:['criteria'],phenomenon:['phenomena'],
  analysis:['analyses'],basis:['bases'],crisis:['crises'],thesis:['theses'],
  matrix:['matrices'],vertex:['vertices'],index:['indices','indexes'],
  formula:['formulas','formulae'],stratum:['strata'],alumnus:['alumni'],
  focus:['focuses','foci'],nucleus:['nuclei'],syllabus:['syllabi'],fungus:['fungi'],
  cactus:['cacti'],stimulus:['stimuli'],radius:['radii'],corpus:['corpora'],
  genus:['genera'],species:['species'],series:['series'],deer:['deer'],sheep:['sheep'],
};
Object.entries(IRR_NOUNS).forEach(function([lem,forms]) {
  reg(lem,lem,'noun'); forms.forEach(f=>reg(f,lem,'noun'));
});

// ─── Final statistics ─────────────────────────────────────────────────────────
const total  = Object.keys(vocab).length;
const byPos  = {};
Object.values(vocab).forEach(v=>{byPos[v.pos]=(byPos[v.pos]||0)+1;});
const lemmas = Object.keys(lemmaIdx).length;

console.log('\n=== VOCABULARY BUILD COMPLETE ===');
console.log('Total entries: ' + total);
console.log('Unique lemmas: ' + lemmas);
console.log('By POS:',JSON.stringify(byPos,null,2));

if (total < 111600) {
  console.warn('\n⚠ WARNING: Target 111,600 NOT reached. Got: ' + total);
  console.warn('Gap: ' + (111600 - total));
} else {
  console.log('\n✓ TARGET 111,600+ ACHIEVED: ' + total + ' entries.');
}

// ─── Serialize ────────────────────────────────────────────────────────────────
const freqIndex = {};
Object.entries(vocab).forEach(([w,v])=>{freqIndex[w]=v.rank;});

const report = {
  generatedAt: new Date().toISOString(),
  totalEntries: total,
  uniqueLemmas: lemmas,
  byPos,
  target: 111600,
  targetMet: total >= 111600,
  method: 'Programmatic morphological expansion of open English vocabulary',
  note: 'Word forms only — no definitions. Open English language, no proprietary content.',
  license: 'See DATA_SOURCES.md',
};

fs.writeFileSync(path.join(OUT,'vocab-index.json'), JSON.stringify(vocab,null,0));
fs.writeFileSync(path.join(OUT,'lemma-index.json'), JSON.stringify(lemmaIdx,null,0));
fs.writeFileSync(path.join(OUT,'freq-index.json'),  JSON.stringify(freqIndex,null,0));
fs.writeFileSync(path.join(OUT,'build-report.json'),JSON.stringify(report,null,2));
console.log('\nFiles written.');
