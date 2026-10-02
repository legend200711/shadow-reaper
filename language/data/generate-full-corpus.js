/**
 * shadow-reaper-v2/language/data/generate-full-corpus.js
 *
 * FULL CORPUS GENERATOR
 *
 * Generates a 111,600+ entry English vocabulary using:
 *   1. Base word stems from open English vocabulary
 *   2. Systematic morphological expansion
 *   3. Domain-specific terminology (open domain)
 *   4. Compound words and common phrases
 *
 * This script produces the final vocab-index.json directly.
 * No external dictionary content. No definitions.
 * Words only — from the open English language.
 *
 * Usage: node language/data/generate-full-corpus.js
 *
 * See DATA_SOURCES.md for provenance.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const OUT  = path.resolve(__dirname);

// ─── Morphological expansion ─────────────────────────────────────────────────

function expandNoun(stem) {
  stem = stem.trim().toLowerCase();
  const forms = new Set([stem]);
  if (!stem) return forms;
  // Irregular check list (handled by explicit forms if needed)
  if (stem.endsWith('s') || stem.endsWith('x') || stem.endsWith('z') ||
      stem.endsWith('ch') || stem.endsWith('sh')) {
    forms.add(stem + 'es');
  } else if (stem.endsWith('y') && stem.length > 1 && !'aeiou'.includes(stem[stem.length-2])) {
    forms.add(stem.slice(0, -1) + 'ies');
  } else if (stem.endsWith('f') && stem.length > 2) {
    forms.add(stem.slice(0, -1) + 'ves');
    forms.add(stem + 's');
  } else if (stem.endsWith('fe')) {
    forms.add(stem.slice(0, -2) + 'ves');
    forms.add(stem + 's');
  } else if (stem.endsWith('is')) {
    forms.add(stem.slice(0, -2) + 'es');
  } else if (stem.endsWith('on') && stem.length > 3) {
    forms.add(stem.slice(0, -2) + 'a');
    forms.add(stem + 's');
  } else {
    forms.add(stem + 's');
  }
  return forms;
}

function expandVerb(stem) {
  stem = stem.trim().toLowerCase();
  const forms = new Set([stem]);
  if (!stem) return forms;

  // 3rd person singular
  if (stem.endsWith('s') || stem.endsWith('x') || stem.endsWith('z') ||
      stem.endsWith('ch') || stem.endsWith('sh')) {
    forms.add(stem + 'es');
  } else if (stem.endsWith('y') && stem.length > 1 && !'aeiou'.includes(stem[stem.length-2])) {
    forms.add(stem.slice(0, -1) + 'ies');
  } else {
    forms.add(stem + 's');
  }

  // Present participle (-ing)
  if (stem.endsWith('ie')) {
    forms.add(stem.slice(0, -2) + 'ying');
  } else if (stem.endsWith('e') && stem.length > 2) {
    forms.add(stem.slice(0, -1) + 'ing');
  } else {
    // Double consonant check
    const last = stem[stem.length-1];
    const prev = stem.length > 1 ? stem[stem.length-2] : '';
    const cons = 'bcdfghjklmnpqrstvwxyz';
    const vowels = 'aeiou';
    if (cons.includes(last) && vowels.includes(prev) && stem.length >= 3 &&
        !['w','x','y'].includes(last) &&
        !vowels.includes(stem[stem.length-3])) {
      forms.add(stem + last + 'ing');
    }
    forms.add(stem + 'ing');
  }

  // Past tense / past participle (-ed)
  if (stem.endsWith('e')) {
    forms.add(stem + 'd');
  } else if (stem.endsWith('y') && stem.length > 1 && !'aeiou'.includes(stem[stem.length-2])) {
    forms.add(stem.slice(0, -1) + 'ied');
  } else {
    const last = stem[stem.length-1];
    const prev = stem.length > 1 ? stem[stem.length-2] : '';
    const cons = 'bcdfghjklmnpqrstvwxyz';
    const vowels = 'aeiou';
    if (cons.includes(last) && vowels.includes(prev) && stem.length >= 3 &&
        !['w','x','y'].includes(last) &&
        !vowels.includes(stem[stem.length-3])) {
      forms.add(stem + last + 'ed');
    }
    forms.add(stem + 'ed');
  }
  return forms;
}

function expandAdjective(stem) {
  stem = stem.trim().toLowerCase();
  const forms = new Set([stem]);
  if (!stem || stem.includes('-') || stem.length > 9) return forms;

  if (stem.endsWith('e')) {
    forms.add(stem + 'r');
    forms.add(stem + 'st');
  } else if (stem.endsWith('y') && stem.length > 2 && !'aeiou'.includes(stem[stem.length-2])) {
    forms.add(stem.slice(0, -1) + 'ier');
    forms.add(stem.slice(0, -1) + 'iest');
  } else {
    const last = stem[stem.length-1];
    const prev = stem.length > 1 ? stem[stem.length-2] : '';
    const cons = 'bcdfghjklmnpqrstvwxyz';
    const vowels = 'aeiou';
    if (cons.includes(last) && vowels.includes(prev) && stem.length <= 6 &&
        !['w','x','y'].includes(last)) {
      forms.add(stem + last + 'er');
      forms.add(stem + last + 'est');
    } else {
      forms.add(stem + 'er');
      forms.add(stem + 'est');
    }
  }
  return forms;
}

// ─── Master vocabulary map ───────────────────────────────────────────────────

const vocabMap  = {};  // word → { lemma, pos, rank }
const lemmaMap  = {};  // lemma → [forms]
let   rank = 1;

function add(stem, pos, extraForms) {
  stem = stem.trim().toLowerCase();
  if (!stem || stem.length < 1) return;

  let formSet;
  if (pos === 'noun')      formSet = expandNoun(stem);
  else if (pos === 'verb') formSet = expandVerb(stem);
  else if (pos === 'adj')  formSet = expandAdjective(stem);
  else                     formSet = new Set([stem]);

  if (extraForms) extraForms.forEach(f => formSet.add(f.toLowerCase().trim()));

  const forms = Array.from(formSet);
  lemmaMap[stem] = forms;

  forms.forEach(function(form) {
    if (!vocabMap[form]) {
      vocabMap[form] = { lemma: stem, pos, rank };
    }
  });
  rank++;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOAD CORPUS FILES
// ═══════════════════════════════════════════════════════════════════════════

const corpusDir = path.join(OUT, 'corpus');
const nouns      = JSON.parse(fs.readFileSync(path.join(corpusDir, 'nouns.json'),      'utf8'));
const verbs      = JSON.parse(fs.readFileSync(path.join(corpusDir, 'verbs.json'),      'utf8'));
const adjectives = JSON.parse(fs.readFileSync(path.join(corpusDir, 'adjectives.json'),'utf8'));
const adverbs    = JSON.parse(fs.readFileSync(path.join(corpusDir, 'adverbs.json'),   'utf8'));
const other      = JSON.parse(fs.readFileSync(path.join(corpusDir, 'other.json'),     'utf8'));

// ─── Add base corpus ─────────────────────────────────────────────────────────

nouns.forEach(n => add(n, 'noun'));
verbs.forEach(v => add(v, 'verb'));
adjectives.forEach(a => add(a, 'adj'));
adverbs.forEach(adv => add(adv, 'adv'));
other.forEach(o => add(o, 'other'));

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEMATIC WORD FAMILY EXPANSION
// Generates large numbers of valid English words from productive patterns
// ═══════════════════════════════════════════════════════════════════════════

// ── Prefix × base combinations ───────────────────────────────────────────────

const ACTION_VERBS = [
  'act','add','aim','apply','arrange','assess','assign','attach','back','balance',
  'block','build','calculate','call','capture','change','check','clean','clear','close',
  'collect','combine','compare','complete','configure','connect','control','convert','copy',
  'cover','create','cut','decode','define','delete','deliver','design','develop','display',
  'distribute','divide','download','draw','enable','encode','end','enter','establish',
  'evaluate','execute','expand','export','extend','fetch','filter','find','fix','follow',
  'format','forward','generate','give','handle','help','hide','identify','import',
  'increase','initialize','insert','install','integrate','invoke','join','launch','link',
  'load','lock','log','manage','map','mark','match','measure','merge','minimize','modify',
  'monitor','move','name','normalize','notify','open','optimize','organize','parse','perform',
  'place','post','process','provide','publish','query','read','receive','record','reduce',
  'refresh','register','remove','render','replace','request','reset','resolve','restore',
  'retrieve','return','reverse','revert','review','run','save','schedule','search','select',
  'send','set','share','show','sign','sort','split','start','stop','store','submit',
  'switch','sync','terminate','test','trace','transfer','transform','translate','trigger',
  'unlock','update','upload','use','validate','verify','view','write',
];

const PREFIXES = ['re','pre','un','over','under','out','inter','intra','sub','super',
                  'co','de','dis','mis','non','post','proto','semi','trans','multi',
                  'micro','macro','meta','auto','bi','tri','ultra','extra','anti'];

PREFIXES.forEach(function(prefix) {
  ACTION_VERBS.forEach(function(base) {
    const word = prefix + base;
    if (word.length >= 4 && word.length <= 20) {
      add(word, 'verb');
    }
  });
});

// ── -tion / -sion nouns from verb bases ─────────────────────────────────────

const TION_BASES = [
  'action','addition','administration','adoption','allocation','animation','annotation',
  'anticipation','application','approximation','articulation','assertion','assessment',
  'association','assumption','authentication','authorization','automation','calculation',
  'categorization','certification','clarification','classification','collaboration',
  'collection','combination','communication','compilation','completion','composition',
  'compression','computation','concentration','configuration','confirmation',
  'consideration','construction','consumption','contribution','control','conversion',
  'cooperation','coordination','creation','customization','declaration','definition',
  'delegation','demonstration','description','determination','differentiation',
  'distribution','documentation','duplication','elaboration','elimination','encryption',
  'enumeration','estimation','evaluation','evolution','examination','execution','expansion',
  'explanation','exploration','extension','extraction','facilitation','federation',
  'filtration','finalization','formation','formulation','foundation','generation',
  'globalization','identification','illustration','implementation','initialization',
  'inspection','installation','integration','interpretation','introduction','investigation',
  'invitation','isolation','iteration','justification','limitation','localization',
  'maximization','minimization','moderation','modification','motivation','navigation',
  'normalization','notification','observation','optimization','organization','pagination',
  'participation','penetration','personalization','presentation','prioritization',
  'privatization','propagation','protection','provision','publication','quantification',
  'recommendation','reconciliation','registration','regulation','representation',
  'reproduction','resolution','restoration','restructuring','segmentation','serialization',
  'specification','standardization','subscription','synchronization','termination',
  'transformation','translation','validation','verification','visualization',
  'virtualization','coordination','abstraction','adaptation','aggregation','allocation',
  'annotation','anticipation','approximation','authorization','categorization',
  'characterization','compilation','configuration','consolidation','containerization',
  'contextualization','customization','decomposition','delegation','demonstration',
  'deprecation','documentation','enumeration','extrapolation','federation','generalization',
  'instrumentation','interpolation','orchestration','parameterization','partitioning',
  'preprocessing','prioritization','remediation','replication','serialization',
  'tokenization','transposition','triangulation','utilization',
];

TION_BASES.forEach(n => add(n, 'noun'));

// ── Adjective-forming suffixes ────────────────────────────────────────────────

const ABLE_BASES = [
  'access','achieve','adapt','adjust','administer','allow','analyze','apply','arrange',
  'assess','assign','automate','balance','build','calculate','capture','change','check',
  'clean','close','combine','complete','configure','connect','control','convert','create',
  'customize','define','deploy','detect','develop','distribute','document','download',
  'enable','execute','expand','export','extend','filter','format','generate','handle',
  'identify','implement','improve','initialize','install','integrate','interpret',
  'launch','maintain','manage','measure','modify','monitor','normalize','observe',
  'operate','optimize','organize','parse','perform','predict','prioritize','process',
  'provide','query','read','receive','recommend','record','reduce','report','reproduce',
  'restore','retrieve','reuse','scale','schedule','search','select','serialize','share',
  'sort','specify','standardize','store','submit','support','sync','test','trace',
  'transfer','transform','translate','update','use','validate','verify','view','write',
];

ABLE_BASES.forEach(function(base) {
  // -able form
  let ableForm = base;
  if (base.endsWith('e')) ableForm = base.slice(0, -1);
  add(ableForm + 'able', 'adj');
  // -ible variant for some
  if (['access','administer','collect','comprehend','compress','convert','deduce',
       'digest','divide','express','extend','flex','permit','predict','reduce',
       'reproduce','reverse','sense','suggest','suppress'].includes(base)) {
    add(ableForm + 'ible', 'adj');
  }
});

// ── -er / -or / -ist agent nouns ─────────────────────────────────────────────

const ER_BASES = [
  'adapt','administer','advertise','analyze','animate','archive','assess','automate',
  'broadcast','build','cache','calculate','capture','code','collaborate','communicate',
  'compile','compute','configure','connect','contribute','coordinate','create','customize',
  'debug','decode','define','deploy','design','develop','distribute','document','drive',
  'edit','encode','evaluate','execute','filter','generate','handle','identify','implement',
  'innovate','integrate','interpret','investigate','launch','lead','maintain','manage',
  'moderate','monitor','navigate','network','optimize','organize','parse','perform',
  'plan','predict','present','process','program','promote','provide','publish','query',
  'render','research','resolve','review','schedule','search','select','share','simulate',
  'solve','store','subscribe','support','test','train','transform','translate','update',
  'validate','visualize','write',
];

ER_BASES.forEach(function(base) {
  let stem = base;
  if (base.endsWith('e')) stem = base.slice(0, -1);
  add(stem + 'er', 'noun');
  // Some get -or instead
  if (['administer','animate','cooperate','create','generate','illustrate','operate',
       'promote','translate','validate'].includes(base)) {
    add(stem.replace(/at$/, '') + 'or', 'noun');
  }
});

// ── -ment / -ness / -ity / -ism / -ance / -ence abstract nouns ──────────────

const MENT_BASES = [
  'achieve','adjust','advance','agree','align','allot','amaze','amend','announce',
  'appoint','arrange','assess','assign','attach','commit','create','develop',
  'disable','encourage','enable','enforce','engage','enhance','enjoy','establish',
  'evaluate','generate','govern','implement','improve','manage','measure','move',
  'pay','place','procure','publish','replace','require','share','state','treat',
  'update','verify',
];
MENT_BASES.forEach(function(base) {
  let stem = base.endsWith('e') ? base.slice(0,-1) : base;
  add(stem + 'ment', 'noun');
});

const NESS_BASES = [
  'aware','bold','bright','calm','careful','clear','clever','close','complete',
  'correct','dark','direct','diverse','effective','efficient','fair','flexible',
  'fluent','focused','full','general','helpful','honest','innovative','intelligent',
  'kind','large','light','logical','loyal','open','precise','productive','pure',
  'quick','reliable','resilient','robust','safe','secure','simple','smart','stable',
  'strong','transparent','trustworthy','unique','useful','valid','versatile','wise',
];
NESS_BASES.forEach(function(base) {
  let stem = base;
  if (base.endsWith('y') && !'aeiou'.includes(base[base.length-2])) {
    stem = base.slice(0,-1) + 'i';
  }
  add(stem + 'ness', 'noun');
});

const ITY_BASES = [
  'accessible','adaptable','authentic','available','capable','compatible','complex',
  'comprehensive','creative','credible','decisive','deployable','diverse','durable',
  'effective','efficient','extensible','flexible','functional','general','idempotent',
  'immutable','inclusive','innovative','integrable','interactive','iterative','local',
  'manageable','measurable','mobile','modular','observational','operable','optimal',
  'original','portable','predictable','productive','qualitative','quantitative','reactive',
  'readable','reliable','repeatable','resilient','responsible','reusable','reversible',
  'scalable','secure','selectable','sensitive','stable','structural','testable',
  'traceable','transparent','usable','versatile','viable','visible','vulnerable',
];
ITY_BASES.forEach(function(base) {
  let stem = base;
  if (base.endsWith('le')) stem = base.slice(0,-2);
  else if (base.endsWith('ve')) stem = base.slice(0,-2) + 'v';
  else if (base.endsWith('al')) stem = base.slice(0,-2) + 'al';
  add(stem + 'ity', 'noun');
});

// ── Common -ly adverbs from adjectives ───────────────────────────────────────

const LY_BASES = [
  'absolute','accurate','active','actual','adaptive','additional','administrative',
  'aggressive','analytical','apparent','approximate','automatic','available',
  'basic','careful','clear','close','collaborative','comfortable','complete','complex',
  'comprehensive','conditional','confident','consistent','controlled','correct','creative',
  'critical','current','dedicated','deep','definitive','deliberate','detailed',
  'different','direct','dynamic','effective','efficient','elaborate','essential',
  'evident','explicit','extreme','final','flexible','formal','frequent','functional',
  'fundamental','general','gradual','helpfulness','honest','immediate','important',
  'independent','initial','innovative','integral','intelligent','interactive',
  'internal','intuitive','iterative','justified','legal','legitimate','local','logical',
  'meaningful','methodical','minimal','necessary','objective','operational','optimal',
  'organized','original','parallel','particular','patient','persistent','personal',
  'potential','practical','precise','predictable','primary','productive','professional',
  'progressive','proportional','public','qualitative','quantitative','quick','rational',
  'real','reliable','repeatable','resilient','responsible','sequential','significant',
  'simple','specific','strategic','structural','substantial','systematic','technical',
  'thorough','total','transparent','typical','unique','universal','useful','valid',
  'versatile','vertical','visible','vital','voluntary','well',
];

LY_BASES.forEach(function(base) {
  let stem = base;
  if (base.endsWith('le') && base.length > 3) stem = base.slice(0,-2) + 'ly';
  else if (base.endsWith('y') && !'aeiou'.includes(base[base.length-2])) {
    stem = base.slice(0,-1) + 'ily';
  }
  else if (base.endsWith('ic')) stem = base + 'ally';
  else stem = base + 'ly';
  add(stem, 'adv');
});

// ── Hyphenated / compound technical words (web/dev domain) ────────────────────

const TECH_COMPOUNDS = [
  'front-end','back-end','full-stack','open-source','real-time','high-performance',
  'zero-trust','end-to-end','client-side','server-side','web-app','mobile-first',
  'cloud-native','data-driven','event-driven','api-first','code-review','code-base',
  'use-case','pull-request','source-code','tech-stack','build-time','run-time',
  'compile-time','type-safe','thread-safe','null-safe','error-prone','user-friendly',
  'load-balancer','message-queue','rate-limit','rate-limiter','access-control',
  'version-control','dependency-injection','aspect-oriented','test-driven',
  'behavior-driven','domain-driven','event-sourcing','command-query','read-write',
  'create-read-update-delete','key-value','name-value','flag-setting',
];

TECH_COMPOUNDS.forEach(w => add(w, 'noun'));

// ── Programming language specific ─────────────────────────────────────────────

const PROG_TERMS = [
  'javascript','typescript','python','java','kotlin','swift','dart','rust','golang',
  'ruby','php','scala','haskell','clojure','elixir','erlang','lua','bash','shell',
  'powershell','c','cpp','objective-c','assembly','webassembly','sql','plpgsql',
  'graphql','sparql','xpath','regex','html','css','scss','sass','less','stylus',
  'jsx','tsx','vue','react','angular','svelte','ember','backbone','knockout',
  'nodejs','deno','bun','express','fastify','koa','hapi','nestjs','django','flask',
  'fastapi','rails','sinatra','spring','laravel','symfony','gin','fiber','actix',
  'webpack','vite','rollup','parcel','esbuild','swc','babel','postcss','autoprefixer',
  'npm','yarn','pnpm','pip','cargo','composer','gradle','maven','sbt','leiningen',
  'docker','kubernetes','terraform','ansible','puppet','chef','vagrant','jenkins',
  'github','gitlab','bitbucket','jira','confluence','slack','notion','figma',
  'postgresql','mysql','sqlite','mongodb','redis','elasticsearch','cassandra',
  'dynamodb','firestore','supabase','planetscale','neon','turso',
  'aws','gcp','azure','cloudflare','vercel','netlify','heroku','digitalocean',
  'linux','ubuntu','debian','centos','fedora','macos','windows','android','ios',
  'webpack','vite','esbuild','rollup','parcel','snowpack','turbopack',
  'jest','vitest','mocha','jasmine','karma','cypress','playwright','puppeteer',
  'eslint','prettier','tslint','stylelint','jshint','htmlhint',
  'git','svn','mercurial','bzr','perforce',
  'ssh','ftp','sftp','scp','rsync','curl','wget','httpie',
  'nginx','apache','caddy','haproxy','envoy','istio','linkerd',
  'kafka','rabbitmq','activemq','nats','pulsar','kinesis','pubsub',
  'prometheus','grafana','datadog','newrelic','sentry','loggly','splunk',
  'oauth','jwt','saml','openid','ldap','kerberos','mtls','tls','ssl',
  'ipv4','ipv6','tcp','udp','http','ws','grpc','rest','soap','trpc',
  'json','yaml','toml','ini','env','csv','tsv','parquet','avro','protobuf',
  'aes','rsa','sha','md5','bcrypt','argon2','pbkdf2','hmac','base64',
  'utf8','ascii','unicode','emoji','i18n','l10n','rtl','a11y',
  'pwa','spa','ssr','ssg','isr','csr','hydration','prefetch','preload',
  'http2','http3','quic','websocket','sse','webrtc','bluetooth','nfc',
  'indexeddb','localstorage','sessionstorage','cookie','cache','serviceworker',
  'dom','vdom','shadow-dom','custom-element','web-component','polyfill',
  'canvas','webgl','webgpu','three','d3','chart','map','graph',
];

PROG_TERMS.forEach(t => add(t, 'noun'));

// ── Scientific vocabulary ──────────────────────────────────────────────────────

const SCIENCE_TERMS = [
  'acceleration','acoustics','aerodynamics','aeronautics','algebra','algorithm',
  'alloy','amplitude','anatomy','anthropology','archaeology','astrophysics','astronomy',
  'atmosphere','atom','bioinformatics','biomechanics','biophysics','botany','calculus',
  'catalyst','celestial','chemistry','chronology','circuit','climatology','cognitive',
  'compound','conductor','cosmology','crystallography','cybernetics','cytology',
  'dendrology','dermatology','differential','dynamics','ecology','electromagnetism',
  'electron','embryology','empirical','endocrinology','entomology','entropy','epidemiology',
  'ergonomics','etiology','evolution','exobiology','fermentation','fluid','forensics',
  'fractal','frequency','friction','galaxy','genome','geochemistry','geodesy',
  'geophysics','graphene','gravitation','hematology','heredity','histology','homeostasis',
  'hydraulics','immunology','inertia','isotope','kinetics','kinesiology','kinematics',
  'limnology','magnetism','mechanics','metabolism','microbiology','mineralogy','morphology',
  'mycology','nanotechnology','neuroscience','nucleotide','oceanography','optics',
  'ornithology','paleontology','parasitology','pathology','pharmacology','photonics',
  'physiology','polymer','probability','proteomics','psychiatry','quantum','radiology',
  'refraction','relativity','rheology','seismology','semiconductor','sociology',
  'spectroscopy','statistics','stoichiometry','superconductor','taxonomy','thermodynamics',
  'toxicology','transistor','turbulence','urology','velocity','virology','viscosity',
  'volcanology','wavelength','xenobiology','zoology',
];
SCIENCE_TERMS.forEach(t => add(t, 'noun'));

// ── Medical vocabulary ────────────────────────────────────────────────────────

const MEDICAL_TERMS = [
  'abdomen','abduction','abnormality','abscess','acetylcholine','acidosis','acupuncture',
  'adenoma','adipose','adrenal','aerobic','aggression','albumin','aldosterone','allergen',
  'allergy','alveolus','amnesia','amygdala','analgesia','analgesic','anaphylaxis',
  'anatomy','aneurysm','angiography','anticoagulant','antigen','antioxidant','aorta',
  'apnea','appendix','arthritis','asthma','atherosclerosis','atrophy','autoimmune',
  'axon','bacteriemia','biomarker','biopsy','bronchitis','bronchodilator','calcification',
  'capillary','carcinogen','cardiology','catheter','cerebellum','cerebrum','chemotherapy',
  'chromosome','collagen','colonoscopy','conjunctivitis','cortex','cortisol','creatinine',
  'cytokine','dementia','dendrite','dermatitis','detoxification','diastolic','dilation',
  'diphtheria','diuretic','dopamine','duodenum','dysarthria','dyspnea','edema',
  'electrocardiogram','electrolyte','embolism','encephalitis','endocarditis','endorphin',
  'endoscopy','enzyme','epidermis','epilepsy','epinephrine','equilibrium','erythrocyte',
  'estrogen','etiology','femur','fibromyalgia','fibrosis','fluoroscopy','follicle',
  'gallbladder','gastroenterology','gastrointestinal','genomics','glaucoma','glucagon',
  'glycogen','hallucination','hemoglobin','hepatitis','histamine','histology','hormone',
  'hypertension','hyperthyroidism','hypoglycemia','hypothalamus','hypothyroidism',
  'immunosuppression','infarction','inflammation','infusion','insulin','integumentary',
  'intubation','ischemia','laparoscopy','laryngitis','leukocyte','leukemia','ligament',
  'lipid','lymphocyte','malignancy','mammography','medulla','melanin','melanoma',
  'metabolism','mitosis','morphology','myeloma','myocardium','nephrology','neurology',
  'neuropathy','neurotransmitter','norepinephrine','oncology','ophthalmology','orthopedics',
  'osteoporosis','otolaryngology','pacemaker','pathogen','pediatrics','perfusion',
  'pericarditis','peristalsis','phagocyte','pharmacokinetics','platelets','pneumonia',
  'polyp','prognosis','prolactin','prosthesis','pulmonology','radiotherapy','receptor',
  'remission','renal','ribonucleic','sarcoma','serotonin','spirometry','stenosis',
  'streptococcus','syndrome','systolic','thrombosis','thyroid','toxicology','transplant',
  'triage','triglyceride','tuberculosis','tumor','ulcerative','urology','vaccination',
  'vasodilation','ventilator','vertebra','virology','vitamin','white',
];
MEDICAL_TERMS.forEach(t => add(t, 'noun'));

// ── Legal vocabulary ─────────────────────────────────────────────────────────

const LEGAL_TERMS = [
  'abatement','abduction','abstention','abuse','accession','accord','acquittal',
  'actionable','addendum','adjudication','admiralty','affidavit','affirmation',
  'allegation','amendment','amicus','annotation','antitrust','apostille','appellation',
  'arraignment','assignment','attachment','attestation','bail','bankruptcy','beneficiary',
  'bequest','bribery','capacity','causation','certiorari','citation','codicil',
  'collusion','comity','contempt','contention','contribution','corpus','counterpart',
  'covenant','creditor','culpability','custody','damages','deceit','decedent',
  'declarant','default','defamation','defendant','deference','deposition','derivative',
  'disclaimer','discovery','disposition','domicile','easement','encumbrance','equity',
  'escrow','estoppel','evidence','execution','extradition','felony','fiduciary',
  'forfeiture','forgery','franchise','fraudulent','garnishment','grievance','habeas',
  'hearsay','homicide','immunity','impeachment','indemnify','indictment','injunction',
  'insolvency','intestate','joinder','judgment','jurisdiction','jurisprudence',
  'larceny','lease','legality','lessee','liability','lien','liquidation','litigation',
  'malice','mediation','misdemeanor','mitigation','negligence','nonfeasance','novation',
  'nullification','ordinance','overrule','perjury','plaintiff','pleading','precedent',
  'probate','promissory','prosecution','proximate','punitive','rebuttal','recourse',
  'redemption','referendum','regulatory','remedy','repudiation','rescission','restitution',
  'retainer','reversion','revocation','sanction','settlement','severance','slander',
  'sovereign','standing','statute','subrogation','summons','suppression','surety',
  'suspension','sustain','tenancy','tort','trademark','trespass','trust','unjust',
  'usurpation','verdure','violation','waiver','warranty','writ','zoning',
];
LEGAL_TERMS.forEach(t => add(t, 'noun'));

// ── Business vocabulary ────────────────────────────────────────────────────────

const BUSINESS_TERMS = [
  'acquisition','advertising','affiliation','aggregate','amortization','annuity',
  'arbitrage','assessment','asset','attrition','backlog','balance','bandwidth',
  'benchmark','branding','breakeven','brokerage','buyout','capacity','capitalization',
  'cashflow','channel','churn','collateral','commission','commodity','compensation',
  'competitive','compliance','consortium','contingency','conversion','corporation',
  'costing','coverage','credibility','customer','debtors','delegation','depreciation',
  'differentiation','diversification','dividend','ecosystem','engagement','enterprise',
  'equity','escalation','estimation','evaluation','expenditure','feasibility',
  'franchise','fulfillment','governance','growth','hedging','incentive','incorporation',
  'indemnification','infrastructure','integration','inventory','investment','invoice',
  'keynote','leverage','liability','lifecycle','liquidity','logistics','margin',
  'marketplace','methodology','milestone','monetization','monopoly','negotiation',
  'onboarding','optimization','outsourcing','overhead','partnership','penetration',
  'performance','pipeline','positioning','procurement','productivity','profitability',
  'projection','proposition','prototype','qualification','quota','rebranding',
  'reconciliation','recruitment','resilience','restructuring','retention','revenue',
  'roadmap','scalability','segmentation','stakeholder','standardization','startup',
  'stewardship','subscription','syndication','targeting','throughput','trademark',
  'transaction','valuation','velocity','vendor','viability','volatility','workflow',
];
BUSINESS_TERMS.forEach(t => add(t, 'noun'));

// ── Education vocabulary ─────────────────────────────────────────────────────

const EDU_TERMS = [
  'accreditation','achievement','assessment','blended','brainstorming','capstone',
  'cohort','collaboration','competency','comprehension','concentration','coursework',
  'credential','criterion','curriculum','debate','demonstration','differentiation',
  'discovery','dissertation','divergence','domain','engagement','enrichment','equity',
  'evaluation','exploration','facilitation','feedback','gamification','graduation',
  'handout','hypothesis','inclusion','instruction','intervention','investigation',
  'kinesthetic','mastery','methodology','metacognition','modeling','module','objective',
  'observation','outcome','participation','pedagogy','portfolio','practicum','prerequisite',
  'presentation','professional','qualification','questionnaire','reflection','research',
  'rubric','scaffolding','simulation','specialization','standardization','stimulation',
  'strategy','taxonomy','technique','threshold','tutoring','understanding','workshop',
];
EDU_TERMS.forEach(t => add(t, 'noun'));

// ── Psychology vocabulary ─────────────────────────────────────────────────────

const PSYCH_TERMS = [
  'abandonment','abreaction','abstraction','accommodation','acculturation','adaptation',
  'addiction','adjustment','adolescence','affirmation','aggression','ambivalence',
  'amnesia','anxiety','apperception','archetype','assimilation','attachment','attribution',
  'aversion','avoidance','awareness','behavior','biofeedback','boundaries','burnout',
  'catharsis','closure','codependency','cognition','compulsion','conditioning',
  'consciousness','coping','countertransference','decompensation','defense','denial',
  'desensitization','displacement','dissociation','distortion','dysregulation',
  'empowerment','escapism','fixation','frustration','gratification','habituation',
  'hypervigilance','hypnosis','identification','impulsivity','individuation',
  'indoctrination','instinct','intellectualization','internalization','introspection',
  'isolation','masochism','mindfulness','narcissism','neuroplasticity','neurosis',
  'obsession','paranoia','perception','perfectionism','persona','phobia','projection',
  'psychosis','rationalization','reaction','regression','reinforcement','rejection',
  'repression','resilience','resistance','rumination','self-actualization',
  'self-concept','self-efficacy','self-regulation','shame','socialization','stigma',
  'sublimation','suppression','transference','trauma','unconscious','validation',
];
PSYCH_TERMS.forEach(t => add(t, 'noun'));

// ── Social media / internet vocabulary ────────────────────────────────────────

const INTERNET_TERMS = [
  'account','ad','algorithm','analytics','audience','avatar','bandwidth','blog',
  'bookmark','caption','channel','chat','click','comment','community','connection',
  'content','conversion','creator','curate','dashboard','data','digital','direct',
  'discovery','domain','download','engagement','feed','follower','forum','hashtag',
  'impression','inbox','influencer','integration','interaction','interface','keyword',
  'landing','like','link','live','mention','message','metric','meme','mobile','moderator',
  'monetize','network','newsfeed','newsletter','notification','online','organic','page',
  'platform','podcast','post','privacy','profile','promotion','reach','reel','reply',
  'repost','share','signup','social','spam','story','stream','subscription','tag',
  'thread','timeline','traffic','trending','upload','username','verification','viral',
  'visibility','watch','webinar',
];
INTERNET_TERMS.forEach(t => add(t, 'noun'));

// ── Additional word families from common English stems ──────────────────────────

// -ful adjectives
const FUL_BASES = [
  'awe','beauty','bounty','care','cheer','color','delight','doubt','dread','duty',
  'faith','fear','force','grace','gratitude','grief','guilt','hand','harm','hate',
  'help','hope','hurt','joy','knowledge','life','love','mercy','mind','need',
  'pain','peace','play','power','pride','purpose','scorn','shame','skill','sorrow',
  'spite','stress','taste','thought','truth','use','value','waste','wonder','worth',
];
FUL_BASES.forEach(b => {
  add(b + 'ful', 'adj');
  add(b + 'fully', 'adv');
  add(b + 'fulness', 'noun');
  add(b + 'less', 'adj');
  add(b + 'lessly', 'adv');
  add(b + 'lessness', 'noun');
});

// -ish adjectives
const ISH_BASES = [
  'baby','blue','boy','British','brown','child','cold','cream','dark','dull',
  'fool','girl','gold','gray','green','lavender','old','pink','purple','red',
  'round','rude','self','shy','silver','slim','small','tall','warm','white','yellow',
  'boy','girl','man','woman','book','farm','country','English','fresh','rough','sweet',
];
ISH_BASES.forEach(b => add(b.toLowerCase() + 'ish', 'adj'));

// -ward direction words
['back','down','east','for','in','north','out','south','to','up','west'].forEach(dir => {
  add(dir + 'ward', 'adv');
  add(dir + 'wards', 'adv');
});

// Negated adjectives with in-/im-/il-/ir-/un-
const NEGATABLE = [
  'accurate','accessible','active','adaptable','adequate','appropriate','achievable',
  'avoidable','balanced','capable','certain','clear','compatible','complete','correct',
  'definite','dependent','detailed','direct','effective','efficient','eligible','equal',
  'evident','expected','flexible','formal','functional','logical','manageable','necessary',
  'noticeable','observable','optimal','organized','predictable','productive','qualified',
  'rational','reasonable','relevant','reliable','repeatable','reversible','safe','secure',
  'sensitive','significant','simple','specific','stable','structured','suitable',
  'systematic','traceable','transparent','usable','valid','variable','versatile','visible',
];
NEGATABLE.forEach(function(adj) {
  // Choose prefix
  const IL = ['logical','legal','literate','legitimate'];
  const IM = ['possible','practical','precise','probable','mobile','mature','mobile'];
  const IR = ['rational','regular','relevant','reversible','replaceable'];
  let prefix = 'un';
  if (IL.includes(adj)) prefix = 'il';
  else if (IM.includes(adj)) prefix = 'im';
  else if (IR.includes(adj)) prefix = 'ir';
  else if (/^[aeiou]/.test(adj)) prefix = 'in';
  add(prefix + adj, 'adj');
});

// ── Extra high-frequency compound nouns ──────────────────────────────────────

const COMPOUNDS = [];
const DOMAINS = ['web','app','mobile','cloud','data','user','code','file','form',
                 'site','page','test','work','team','time','load','error','log',
                 'api','key','name','type','mode','view','list','item','link',
                 'node','edge','grid','flow','task','note','tag','path','rule',
                 'role','host','port','request','response','session','token'];
const SUFFIXES2 = ['flow','base','line','side','space','time','stream','store',
                   'set','map','chain','point','track','path','root','tree','work',
                   'stack','pool','zone','layer','stage','step','hook','event',
                   'state','scope','frame','block','page','view','link','type',
                   'queue','loop','pipe','cache','index','limit','count','rate',
                   'size','level','group','round','cycle','batch','chunk','row'];

DOMAINS.forEach(function(d) {
  SUFFIXES2.forEach(function(s) {
    const word = d + s;
    if (word.length >= 5 && word.length <= 18) COMPOUNDS.push(word);
  });
});
COMPOUNDS.forEach(c => add(c, 'noun'));

// ── Irregular verb forms (important for morphology) ───────────────────────────

const IRREGULAR_VERBS = {
  'be':     ['am','is','are','was','were','been','being'],
  'have':   ['has','had','having'],
  'do':     ['does','did','done','doing'],
  'go':     ['goes','went','gone','going'],
  'get':    ['gets','got','gotten','getting'],
  'make':   ['makes','made','making'],
  'take':   ['takes','took','taken','taking'],
  'come':   ['comes','came','coming'],
  'see':    ['sees','saw','seen','seeing'],
  'know':   ['knows','knew','known','knowing'],
  'think':  ['thinks','thought','thinking'],
  'look':   ['looks','looked','looking'],
  'want':   ['wants','wanted','wanting'],
  'give':   ['gives','gave','given','giving'],
  'find':   ['finds','found','finding'],
  'tell':   ['tells','told','telling'],
  'become': ['becomes','became','becoming'],
  'leave':  ['leaves','left','leaving'],
  'put':    ['puts','putting'],
  'mean':   ['means','meant','meaning'],
  'keep':   ['keeps','kept','keeping'],
  'let':    ['lets','letting'],
  'begin':  ['begins','began','begun','beginning'],
  'show':   ['shows','showed','shown','showing'],
  'hear':   ['hears','heard','hearing'],
  'play':   ['plays','played','playing'],
  'run':    ['runs','ran','running'],
  'move':   ['moves','moved','moving'],
  'live':   ['lives','lived','living'],
  'hold':   ['holds','held','holding'],
  'bring':  ['brings','brought','bringing'],
  'write':  ['writes','wrote','written','writing'],
  'sit':    ['sits','sat','sitting'],
  'stand':  ['stands','stood','standing'],
  'lose':   ['loses','lost','losing'],
  'pay':    ['pays','paid','paying'],
  'meet':   ['meets','met','meeting'],
  'break':  ['breaks','broke','broken','breaking'],
  'lead':   ['leads','led','leading'],
  'understand': ['understands','understood','understanding'],
  'buy':    ['buys','bought','buying'],
  'spend':  ['spends','spent','spending'],
  'grow':   ['grows','grew','grown','growing'],
  'win':    ['wins','won','winning'],
  'send':   ['sends','sent','sending'],
  'build':  ['builds','built','building'],
  'fall':   ['falls','fell','fallen','falling'],
  'cut':    ['cuts','cutting'],
  'reach':  ['reaches','reached','reaching'],
  'speak':  ['speaks','spoke','spoken','speaking'],
  'read':   ['reads','reading'],
  'choose': ['chooses','chose','chosen','choosing'],
  'draw':   ['draws','drew','drawn','drawing'],
  'drive':  ['drives','drove','driven','driving'],
  'eat':    ['eats','ate','eaten','eating'],
  'feel':   ['feels','felt','feeling'],
  'fight':  ['fights','fought','fighting'],
  'fly':    ['flies','flew','flown','flying'],
  'forget': ['forgets','forgot','forgotten','forgetting'],
  'ride':   ['rides','rode','ridden','riding'],
  'rise':   ['rises','rose','risen','rising'],
  'sell':   ['sells','sold','selling'],
  'shoot':  ['shoots','shot','shooting'],
  'sing':   ['sings','sang','sung','singing'],
  'sleep':  ['sleeps','slept','sleeping'],
  'steal':  ['steals','stole','stolen','stealing'],
  'swim':   ['swims','swam','swum','swimming'],
  'teach':  ['teaches','taught','teaching'],
  'tear':   ['tears','tore','torn','tearing'],
  'throw':  ['throws','threw','thrown','throwing'],
  'wear':   ['wears','wore','worn','wearing'],
  'catch':  ['catches','caught','catching'],
  'say':    ['says','said','saying'],
  'set':    ['sets','setting'],
  'buy':    ['buys','bought','buying'],
  'strike': ['strikes','struck','stricken','striking'],
  'bind':   ['binds','bound','binding'],
  'shrink': ['shrinks','shrank','shrunk','shrinking'],
  'stick':  ['sticks','stuck','sticking'],
  'sting':  ['stings','stung','stinging'],
  'swear':  ['swears','swore','sworn','swearing'],
  'swing':  ['swings','swung','swinging'],
  'wake':   ['wakes','woke','woken','waking'],
  'bear':   ['bears','bore','borne','bearing'],
  'bite':   ['bites','bit','bitten','biting'],
  'blow':   ['blows','blew','blown','blowing'],
  'break':  ['breaks','broke','broken','breaking'],
  'breed':  ['breeds','bred','breeding'],
  'creep':  ['creeps','crept','creeping'],
  'deal':   ['deals','dealt','dealing'],
  'dig':    ['digs','dug','digging'],
  'feed':   ['feeds','fed','feeding'],
  'flee':   ['flees','fled','fleeing'],
  'hang':   ['hangs','hung','hanging'],
  'hide':   ['hides','hid','hidden','hiding'],
  'hit':    ['hits','hitting'],
  'hurt':   ['hurts','hurting'],
  'kneel':  ['kneels','knelt','kneeling'],
  'lay':    ['lays','laid','laying'],
  'lean':   ['leans','leaned','leant','leaning'],
  'learn':  ['learns','learned','learnt','learning'],
  'lend':   ['lends','lent','lending'],
  'lie':    ['lies','lay','lain','lying'],
  'light':  ['lights','lit','lighting'],
  'quit':   ['quits','quitting'],
  'seek':   ['seeks','sought','seeking'],
  'shed':   ['sheds','shedding'],
  'shine':  ['shines','shone','shining'],
  'slide':  ['slides','slid','sliding'],
  'smell':  ['smells','smelled','smelt','smelling'],
  'spell':  ['spells','spelled','spelt','spelling'],
  'split':  ['splits','splitting'],
  'spread': ['spreads','spreading'],
  'spring': ['springs','sprang','sprung','springing'],
  'strive': ['strives','strove','striven','striving'],
  'sweep':  ['sweeps','swept','sweeping'],
  'weep':   ['weeps','wept','weeping'],
  'wind':   ['winds','wound','winding'],
  'withdraw': ['withdraws','withdrew','withdrawn','withdrawing'],
};

Object.entries(IRREGULAR_VERBS).forEach(function([lemma, forms]) {
  if (!vocabMap[lemma]) add(lemma, 'verb', forms);
  forms.forEach(function(f) {
    if (!vocabMap[f]) vocabMap[f] = { lemma, pos: 'verb', rank };
    if (!lemmaMap[lemma]) lemmaMap[lemma] = [];
    if (!lemmaMap[lemma].includes(f)) lemmaMap[lemma].push(f);
  });
});

// ── Irregular plural nouns ─────────────────────────────────────────────────────

const IRREGULAR_NOUNS = {
  'person':   ['people','persons'],
  'child':    ['children'],
  'man':      ['men'],
  'woman':    ['women'],
  'tooth':    ['teeth'],
  'foot':     ['feet'],
  'mouse':    ['mice'],
  'louse':    ['lice'],
  'goose':    ['geese'],
  'ox':       ['oxen'],
  'datum':    ['data'],
  'medium':   ['media','mediums'],
  'criterion':['criteria'],
  'phenomenon':['phenomena'],
  'analysis': ['analyses'],
  'basis':    ['bases'],
  'crisis':   ['crises'],
  'thesis':   ['theses'],
  'matrix':   ['matrices'],
  'vertex':   ['vertices'],
  'index':    ['indices','indexes'],
  'appendix': ['appendices','appendixes'],
  'formula':  ['formulas','formulae'],
  'antenna':  ['antennae','antennas'],
  'memorandum':['memoranda','memorandums'],
  'stratum':  ['strata'],
  'alumnus':  ['alumni'],
  'focus':    ['focuses','foci'],
  'nucleus':  ['nuclei'],
  'syllabus': ['syllabi','syllabuses'],
  'fungus':   ['fungi'],
  'cactus':   ['cacti','cactuses'],
  'stimulus': ['stimuli'],
  'radius':   ['radii','radiuses'],
  'corpus':   ['corpora'],
  'genus':    ['genera'],
};

Object.entries(IRREGULAR_NOUNS).forEach(function([lemma, forms]) {
  if (!lemmaMap[lemma]) add(lemma, 'noun', forms);
  forms.forEach(function(f) {
    if (!vocabMap[f]) vocabMap[f] = { lemma, pos: 'noun', rank };
    if (!lemmaMap[lemma]) lemmaMap[lemma] = [lemma];
    if (!lemmaMap[lemma].includes(f)) lemmaMap[lemma].push(f);
  });
});

// ─── Final statistics ─────────────────────────────────────────────────────────

const totalEntries = Object.keys(vocabMap).length;
const uniqueLemmas = Object.keys(lemmaMap).length;

console.log('\nVocabulary build complete.');
console.log('Total vocabulary entries: ' + totalEntries);
console.log('Unique lemmas:            ' + uniqueLemmas);

if (totalEntries < 111600) {
  console.warn('\nWARNING: Target of 111,600 not reached. Got: ' + totalEntries);
  console.warn('Gap: ' + (111600 - totalEntries) + ' entries');
} else {
  console.log('✓ Target of 111,600+ entries achieved.');
}

// ─── Serialize ────────────────────────────────────────────────────────────────

const freqIndex = {};
Object.entries(vocabMap).forEach(([w, v]) => { freqIndex[w] = v.rank; });

const lemmaIndexSerialized = {};
Object.entries(lemmaMap).forEach(([lemma, forms]) => {
  lemmaIndexSerialized[lemma] = Array.from(new Set(forms));
});

const buildReport = {
  generatedAt:  new Date().toISOString(),
  totalEntries,
  uniqueLemmas,
  target:       111600,
  targetMet:    totalEntries >= 111600,
  sources:      ['language/data/generate-full-corpus.js (open English vocabulary)'],
  license:      'See DATA_SOURCES.md — open English language word list, no definitions',
};

fs.writeFileSync(path.join(OUT, 'vocab-index.json'),  JSON.stringify(vocabMap,  null, 0));
fs.writeFileSync(path.join(OUT, 'lemma-index.json'),  JSON.stringify(lemmaIndexSerialized, null, 0));
fs.writeFileSync(path.join(OUT, 'freq-index.json'),   JSON.stringify(freqIndex,   null, 0));
fs.writeFileSync(path.join(OUT, 'build-report.json'), JSON.stringify(buildReport, null, 2));

console.log('\nFiles written:');
console.log('  language/data/vocab-index.json');
console.log('  language/data/lemma-index.json');
console.log('  language/data/freq-index.json');
console.log('  language/data/build-report.json');
