/**
 * shadow-reaper-v2/language/data/generate-corpus.js
 *
 * Corpus generator — builds the raw word lists from open English vocabulary.
 *
 * This script is the ONLY place where the source vocabulary is assembled.
 * It produces the 5 corpus JSON files used by build-vocabulary.js.
 *
 * ALL words here are from the public domain / open English language.
 * No proprietary dictionary content. No definitions copied.
 * This is a word LIST, not a dictionary.
 *
 * Usage: node language/data/generate-corpus.js
 *
 * See DATA_SOURCES.md for full provenance.
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const OUT  = path.resolve(__dirname, 'corpus');

// ─── Deduplication helper ─────────────────────────────────────────────────────
function dedup(arr) {
  return [...new Set(arr.map(w => w.toLowerCase().trim()).filter(w => w.length >= 1))];
}

// ══════════════════════════════════════════════════════════════════════════════
// NOUNS  (target: ~28,000 stems → expands to ~56,000+ entries)
// ══════════════════════════════════════════════════════════════════════════════

const nouns = dedup([
  // ── People / roles ────────────────────────────────────────────────────────
  'person','people','man','woman','child','baby','adult','teen','elder','human',
  'friend','family','parent','mother','father','son','daughter','sibling','brother','sister',
  'husband','wife','partner','spouse','neighbor','colleague','coworker','boss','employee',
  'manager','director','leader','officer','agent','guard','soldier','doctor','nurse',
  'teacher','student','professor','researcher','scientist','engineer','developer','designer',
  'artist','musician','writer','author','poet','actor','singer','dancer','athlete','player',
  'coach','trainer','instructor','mentor','tutor','counselor','therapist','lawyer','judge',
  'politician','president','senator','governor','mayor','minister','ambassador','diplomat',
  'journalist','reporter','editor','publisher','photographer','filmmaker','producer',
  'director','executive','entrepreneur','investor','banker','accountant','economist',
  'analyst','consultant','advisor','assistant','secretary','receptionist','clerk',
  'customer','client','patron','guest','visitor','tourist','traveler','passenger',
  'driver','pilot','captain','sailor','officer','detective','investigator','inspector',
  'officer','surgeon','pharmacist','dentist','veterinarian','therapist','psychologist',
  'chef','cook','waiter','barista','server','host','hostess','cashier','attendant',
  'volunteer','activist','advocate','champion','hero','villain','stranger','enemy',
  'ally','opponent','competitor','partner','collaborator','roommate','classmate',
  'teammate','peer','expert','specialist','professional','amateur','beginner','veteran',

  // ── Body ──────────────────────────────────────────────────────────────────
  'body','head','face','eye','ear','nose','mouth','lip','tooth','tongue','chin',
  'cheek','forehead','brow','neck','throat','shoulder','arm','elbow','wrist','hand',
  'finger','thumb','nail','chest','breast','back','spine','hip','waist','stomach',
  'leg','knee','ankle','foot','toe','heel','skin','hair','beard','eyebrow','eyelash',
  'blood','bone','muscle','nerve','brain','heart','lung','liver','kidney','stomach',
  'intestine','vein','artery','cell','gene','dna','hormone','vitamin','protein',

  // ── Emotions / mental states ──────────────────────────────────────────────
  'emotion','feeling','mood','thought','idea','belief','opinion','attitude','desire',
  'hope','fear','joy','sadness','anger','love','hate','grief','regret','guilt',
  'pride','shame','envy','jealousy','anxiety','stress','worry','frustration','confusion',
  'surprise','excitement','curiosity','boredom','loneliness','happiness','depression',
  'confidence','doubt','trust','respect','compassion','empathy','sympathy','motivation',
  'inspiration','ambition','dream','goal','wish','memory','imagination','creativity',

  // ── Places ────────────────────────────────────────────────────────────────
  'place','location','area','region','zone','territory','country','nation','state',
  'province','city','town','village','suburb','neighborhood','community','district',
  'street','road','avenue','boulevard','highway','path','trail','bridge','tunnel',
  'building','house','home','apartment','room','floor','wall','ceiling','door',
  'window','roof','basement','attic','hallway','staircase','elevator','lobby','office',
  'library','museum','gallery','theater','cinema','hospital','school','university',
  'church','temple','mosque','stadium','arena','park','garden','plaza','square',
  'market','mall','store','shop','restaurant','cafe','bar','hotel','motel','resort',
  'beach','mountain','river','lake','ocean','sea','island','forest','desert','field',
  'valley','hill','cliff','cave','volcano','glacier','coast','harbor','port','airport',
  'station','depot','terminal','warehouse','factory','plant','farm','ranch','mine',
  'laboratory','studio','workshop','gym','spa','salon','bank','court','prison','camp',

  // ── Things / objects ──────────────────────────────────────────────────────
  'thing','object','item','piece','part','section','component','element','unit',
  'tool','device','machine','instrument','equipment','apparatus','gadget','widget',
  'vehicle','car','truck','bus','train','plane','boat','ship','bicycle','motorcycle',
  'computer','laptop','phone','tablet','camera','television','radio','speaker','headphone',
  'keyboard','mouse','screen','monitor','printer','scanner','router','cable','charger',
  'battery','button','switch','lever','handle','wheel','engine','motor','pump','fan',
  'chair','table','desk','sofa','bed','shelf','drawer','cabinet','closet','wardrobe',
  'lamp','light','mirror','clock','watch','calendar','notebook','book','magazine',
  'newspaper','letter','envelope','package','bag','box','container','bottle','jar',
  'glass','cup','mug','plate','bowl','fork','knife','spoon','pot','pan','oven',
  'refrigerator','microwave','dishwasher','washer','dryer','vacuum','broom','mop',
  'key','lock','wallet','purse','backpack','suitcase','umbrella','towel','blanket',
  'pillow','sheet','curtain','rug','mat','frame','painting','statue','sculpture',
  'toy','game','ball','bat','racket','net','rope','chain','wire','pipe','tube',
  'stone','rock','brick','wood','metal','plastic','glass','rubber','fabric','thread',
  'needle','scissors','pin','clip','tape','glue','paint','brush','pencil','pen','marker',
  'paper','card','ticket','receipt','document','report','form','file','folder','binder',
  'sign','signal','symbol','icon','logo','badge','medal','trophy','award','prize',

  // ── Food / drink ──────────────────────────────────────────────────────────
  'food','meal','dish','recipe','ingredient','flavor','taste','diet','nutrition',
  'breakfast','lunch','dinner','snack','dessert','appetizer','course','serving',
  'bread','rice','pasta','noodle','pizza','sandwich','burger','salad','soup','stew',
  'meat','beef','chicken','pork','lamb','fish','seafood','shrimp','crab','lobster',
  'egg','cheese','butter','milk','cream','yogurt','juice','smoothie','tea','coffee',
  'wine','beer','cocktail','soda','water','fruit','vegetable','herb','spice','sauce',
  'sugar','salt','pepper','oil','vinegar','dressing','chocolate','candy','cookie',
  'cake','pie','muffin','waffle','pancake','cereal','oatmeal','grain','bean','nut',
  'apple','banana','orange','grape','strawberry','blueberry','raspberry','cherry',
  'peach','plum','pear','melon','pineapple','mango','avocado','tomato','potato',
  'onion','garlic','carrot','broccoli','spinach','lettuce','cabbage','cucumber',
  'pepper','mushroom','corn','pea','lemon','lime','coconut','almond','walnut',

  // ── Technology / computing ────────────────────────────────────────────────
  'technology','software','hardware','program','application','app','system','platform',
  'database','server','client','network','internet','website','webpage','domain',
  'browser','interface','dashboard','console','terminal','command','script','code',
  'function','variable','parameter','argument','method','class','object','array',
  'loop','condition','error','bug','exception','stack','queue','tree','graph','node',
  'algorithm','pattern','framework','library','module','package','dependency','version',
  'update','upgrade','patch','release','deployment','production','staging','development',
  'testing','debugging','documentation','comment','syntax','compiler','interpreter',
  'runtime','memory','storage','cache','buffer','thread','process','processor','core',
  'socket','protocol','api','endpoint','request','response','header','body','payload',
  'authentication','authorization','token','session','cookie','certificate','encryption',
  'firewall','proxy','load','balancer','container','image','service','microservice',
  'repository','branch','commit','merge','conflict','pull','push','fork','clone',
  'backup','restore','migration','import','export','format','encoding','compression',

  // ── Science ───────────────────────────────────────────────────────────────
  'science','biology','chemistry','physics','mathematics','geometry','algebra','calculus',
  'statistics','probability','logic','theory','hypothesis','experiment','observation',
  'measurement','data','evidence','proof','result','conclusion','analysis','synthesis',
  'research','study','investigation','discovery','invention','innovation','development',
  'element','atom','molecule','compound','reaction','energy','force','mass','weight',
  'velocity','acceleration','momentum','gravity','friction','pressure','temperature',
  'heat','light','sound','electricity','magnetism','radiation','wave','particle',
  'field','spectrum','frequency','wavelength','amplitude','phase','resonance',
  'evolution','genetics','ecology','environment','organism','species','population',
  'habitat','ecosystem','biodiversity','mutation','adaptation','selection','reproduction',

  // ── Arts / creativity ────────────────────────────────────────────────────
  'art','design','style','aesthetic','theme','concept','vision','expression','creation',
  'painting','drawing','illustration','sketch','portrait','landscape','abstract',
  'sculpture','installation','performance','exhibition','gallery','collection','series',
  'music','song','melody','harmony','rhythm','beat','tempo','pitch','tone','note',
  'chord','scale','key','instrument','guitar','piano','violin','drum','bass','trumpet',
  'voice','vocal','lyric','verse','chorus','bridge','composition','arrangement',
  'film','movie','show','series','episode','scene','plot','story','character','dialogue',
  'script','screenplay','narrative','setting','genre','theme','symbol','metaphor',
  'photography','image','portrait','shot','frame','exposure','focus','depth','angle',
  'fashion','clothing','style','outfit','wardrobe','collection','trend','season',
  'architecture','structure','form','shape','line','space','balance','proportion',

  // ── Language / communication ──────────────────────────────────────────────
  'language','word','sentence','phrase','paragraph','text','message','speech','voice',
  'conversation','discussion','dialogue','debate','argument','statement','question',
  'answer','reply','response','comment','feedback','review','criticism','praise',
  'suggestion','recommendation','advice','instruction','direction','command','order',
  'request','demand','permission','agreement','disagreement','negotiation','compromise',
  'letter','email','text','chat','call','meeting','presentation','speech','lecture',
  'announcement','notice','warning','reminder','invitation','greeting','farewell',
  'translation','interpretation','meaning','definition','synonym','antonym','context',
  'grammar','syntax','vocabulary','pronunciation','accent','dialect','slang','jargon',
  'abbreviation','acronym','idiom','expression','metaphor','simile','analogy',

  // ── Time ─────────────────────────────────────────────────────────────────
  'time','moment','instant','second','minute','hour','day','week','month','year',
  'decade','century','millennium','era','age','period','epoch','generation','season',
  'spring','summer','autumn','winter','morning','afternoon','evening','night','midnight',
  'dawn','dusk','sunrise','sunset','today','tomorrow','yesterday','now','then','soon',
  'past','present','future','history','event','occasion','anniversary','holiday',
  'deadline','schedule','calendar','clock','timer','countdown','delay','pause','gap',

  // ── Concepts / abstracts ──────────────────────────────────────────────────
  'concept','idea','theory','principle','rule','law','standard','norm','pattern',
  'system','structure','order','chaos','balance','harmony','conflict','tension',
  'change','transformation','growth','progress','development','evolution','revolution',
  'beginning','end','start','finish','origin','destination','source','result','outcome',
  'cause','effect','reason','purpose','goal','objective','target','mission','vision',
  'value','priority','quality','quantity','size','scale','level','degree','amount',
  'number','count','sum','total','average','range','limit','threshold','boundary',
  'problem','solution','challenge','opportunity','risk','benefit','cost','profit','loss',
  'success','failure','victory','defeat','achievement','accomplishment','progress',
  'knowledge','wisdom','understanding','insight','awareness','perception','perspective',
  'experience','skill','ability','talent','strength','weakness','advantage','disadvantage',
  'freedom','justice','equality','democracy','authority','power','control','influence',
  'responsibility','duty','right','privilege','opportunity','choice','decision',
  'relationship','connection','bond','link','network','community','society','culture',
  'tradition','custom','ritual','ceremony','celebration','festival','religion','faith',
  'health','wellness','fitness','medicine','treatment','therapy','recovery','disease',
  'education','learning','training','practice','study','research','development',
  'economy','business','industry','market','trade','commerce','finance','investment',
  'environment','nature','climate','weather','resource','energy','pollution','sustainability',
  'politics','government','policy','law','regulation','enforcement','justice','rights',

  // ── Actions / events ─────────────────────────────────────────────────────
  'action','activity','event','process','operation','procedure','method','approach',
  'step','stage','phase','cycle','sequence','series','pattern','flow','movement',
  'attack','defense','battle','fight','competition','race','challenge','test','trial',
  'game','play','match','tournament','contest','league','season','championship',
  'accident','incident','disaster','crisis','emergency','situation','condition',
  'meeting','conference','summit','session','workshop','seminar','class','lesson',
  'journey','trip','adventure','expedition','exploration','discovery','tour',

  // ── Nature ───────────────────────────────────────────────────────────────
  'nature','environment','world','earth','planet','universe','space','sky','cloud',
  'rain','snow','wind','storm','thunder','lightning','sunshine','shadow','darkness',
  'fire','water','air','ground','soil','dust','sand','rock','cliff','mountain',
  'ocean','sea','river','lake','stream','waterfall','wave','tide','current',
  'tree','flower','plant','grass','leaf','branch','root','seed','bloom','fruit',
  'animal','bird','fish','insect','reptile','mammal','predator','prey','wildlife',
  'dog','cat','horse','cow','pig','sheep','goat','chicken','duck','rabbit','mouse',
  'eagle','owl','hawk','sparrow','crow','parrot','snake','lizard','turtle','frog',
  'shark','whale','dolphin','seal','bear','wolf','fox','deer','lion','tiger',

  // ── Web / design specific ─────────────────────────────────────────────────
  'homepage','webpage','website','sitemap','navigation','menu','header','footer',
  'sidebar','layout','template','theme','component','widget','button','link',
  'form','input','output','field','label','placeholder','validator','submit',
  'modal','popup','tooltip','dropdown','accordion','carousel','slider','gallery',
  'animation','transition','gradient','shadow','border','padding','margin','spacing',
  'typography','font','typeface','color','palette','contrast','brightness','saturation',
  'icon','image','video','audio','media','content','section','block','grid','column',
  'row','container','wrapper','overlay','background','foreground','layer','stack',
  'responsive','mobile','desktop','tablet','viewport','breakpoint','resolution',
  'performance','optimization','accessibility','usability','interaction','experience',

  // ── Additional general nouns ──────────────────────────────────────────────
  'version','option','setting','preference','default','custom','feature','function',
  'action','category','type','kind','class','group','set','list','collection',
  'example','sample','case','instance','scenario','situation','context','condition',
  'format','mode','state','status','stage','step','level','layer','tier','rank',
  'priority','order','sequence','structure','pattern','framework','model','template',
  'standard','guideline','rule','policy','protocol','convention','practice','method',
  'approach','strategy','plan','roadmap','milestone','goal','target','result','output',
  'input','feedback','review','update','change','improvement','fix','patch','release',
  'project','task','assignment','deadline','timeline','schedule','priority','resource',
  'team','group','department','organization','company','startup','enterprise','agency',
  'product','service','solution','platform','tool','system','infrastructure','stack',
  'user','account','profile','role','permission','access','credential','identity',
  'session','token','key','certificate','signature','hash','checksum','validation',
  'log','audit','trace','metric','monitor','alert','report','dashboard','analytics',
  'deployment','environment','configuration','parameter','variable','constant','value',
  'interface','protocol','standard','specification','requirement','constraint','rule',
  'component','module','library','framework','architecture','pattern','design','structure',
  'test','suite','coverage','assertion','mock','stub','fixture','scenario','case',
  'build','compile','link','bundle','package','artifact','dependency','version',
  'branch','tag','commit','merge','conflict','review','approval','deployment',
  'incident','issue','ticket','bug','feature','story','epic','sprint','backlog',

  // ── Extended vocabulary ────────────────────────────────────────────────────
  'ability','absence','abuse','access','accident','achievement','act','adaptation',
  'addition','admission','advantage','adventure','affection','agenda','agreement',
  'agriculture','alliance','allowance','alternative','ambition','announcement',
  'appreciation','approval','arrangement','assignment','assistance','association',
  'atmosphere','attachment','attempt','attendance','attraction','attribute','audience',
  'balance','barrier','basis','battle','behavior','benefit','birth','block',
  'capacity','career','celebration','challenge','channel','characteristic','circle',
  'circumstance','claim','clarity','classification','commitment','comparison',
  'completion','complexity','composition','concern','connection','consequence',
  'consideration','construction','contribution','control','convention','cooperation',
  'creation','crisis','culture','curiosity','damage','danger','decision','declaration',
  'delivery','description','destination','difference','difficulty','direction',
  'discipline','discovery','discrimination','distinction','distribution','division',
  'documentation','effectiveness','efficiency','effort','emotion','emphasis',
  'establishment','evaluation','examination','exception','expansion','expectation',
  'explanation','exposure','extension','failure','feedback','flexibility','foundation',
  'freedom','generation','guidance','identification','imagination','independence',
  'indication','information','initiative','innovation','inspiration','integration',
  'interaction','introduction','investigation','invitation','isolation','judgment',
  'limitation','management','measurement','methodology','monitoring','motivation',
  'navigation','network','obligation','observation','operation','organization',
  'participation','perception','permission','perspective','possibility','presentation',
  'production','promotion','protection','provision','publication','qualification',
  'recognition','reduction','reflection','regulation','relationship','relevance',
  'representation','requirement','resolution','responsibility','restriction','retention',
  'satisfaction','selection','separation','significance','simplification','situation',
  'specification','stability','strategy','structure','submission','suggestion',
  'supervision','support','sustainability','transformation','transition','transparency',
  'understanding','validation','variation','verification','visualization',

  // ── More specific domains ──────────────────────────────────────────────────
  'acceleration','accommodation','accountability','accuracy','acknowledgment',
  'acquisition','adaptation','administration','advertising','affiliation','allocation',
  'annotation','anticipation','appreciation','approximation','arbitration','archiving',
  'articulation','aspiration','assessment','authentication','automation','availability',
  'benchmarking','brainstorming','broadcasting','calibration','categorization',
  'certification','clarification','classification','collaboration','communication',
  'compilation','concentration','consolidation','consultation','contamination',
  'contextualization','coordination','customization','delegation','differentiation',
  'documentation','domination','elimination','encapsulation','enhancement','estimation',
  'evaluation','evolution','examination','experimentation','extrapolation','facilitation',
  'generalization','harmonization','identification','illustration','implementation',
  'initialization','inspection','interpretation','intervention','investigation',
  'linearization','localization','maximization','minimization','modularization',
  'normalization','notification','optimization','orchestration','personalization',
  'prioritization','reconciliation','recommendation','reproduction','restructuring',
  'segmentation','serialization','standardization','transformation','translation',
  'visualization','virtualization','coordination','operationalization','quantification',

  // ── Abstract concepts ──────────────────────────────────────────────────────
  'abundance','accuracy','achievement','acknowledgment','adaptability','adequacy',
  'agility','alignment','authenticity','awareness','breadth','brilliance','capability',
  'certainty','clarity','coherence','commitment','competency','comprehension',
  'consistency','continuity','conviction','cooperation','creativity','credibility',
  'dedication','depth','determination','diligence','direction','discipline','durability',
  'effectiveness','efficiency','elegance','empowerment','endurance','excellence',
  'expertise','expressiveness','fidelity','flexibility','focus','fortitude','generosity',
  'humility','imagination','inclusivity','independence','ingenuity','integrity',
  'intuition','leadership','loyalty','mastery','mindfulness','openness','optimism',
  'originality','passion','patience','persistence','perspective','precision','productivity',
  'proficiency','purpose','quality','reliability','resilience','resourcefulness',
  'responsibility','scalability','simplicity','sincerity','strength','thoroughness',
  'tolerance','transparency','trustworthiness','unity','versatility','vision','wisdom',

  // ── Health and wellness ────────────────────────────────────────────────────
  'addiction','allergy','anatomy','antibiotic','anxiety','appetite','bacteria',
  'cardiology','chromosome','circulation','clinic','cognition','consciousness',
  'consultation','dehydration','dermatology','diabetes','diagnosis','diet','digestion',
  'disorder','dosage','endocrinology','examination','fatigue','genetics','headache',
  'healing','hygiene','immunity','infection','inflammation','insomnia','metabolism',
  'microscope','neurology','nutrition','obesity','oncology','pathology','pediatrics',
  'pharmacy','physiology','psychiatry','psychology','rehabilitation','respiration',
  'screening','sedation','skeleton','surgery','symptom','syndrome','therapy','transplant',
  'trauma','vaccination','virus','wellness','wound','yoga','meditation','relaxation',

  // ── Finance / economics ────────────────────────────────────────────────────
  'asset','auditing','bankruptcy','bond','budget','capital','cashflow','commodity',
  'currency','debt','deflation','deposit','depreciation','dividend','economy',
  'equity','exchange','expenditure','finance','fund','futures','hedge','income',
  'inflation','insurance','interest','investment','liability','liquidity','loan',
  'margin','mortgage','portfolio','premium','price','profit','recession','revenue',
  'savings','securities','stock','subsidy','surplus','taxation','trade','treasury',
  'valuation','volatility','wealth','yield','transaction','payment','transfer',
  'balance','statement','account','ledger','audit','compliance','regulation',

  // ── Education ────────────────────────────────────────────────────────────
  'academy','admission','assessment','assignment','bachelor','certificate','classroom',
  'curriculum','degree','diploma','dissertation','education','enrollment','examination',
  'faculty','fellowship','graduation','institute','internship','knowledge','lecture',
  'literacy','master','mentorship','pedagogy','prerequisite','professor','program',
  'research','scholarship','semester','seminar','syllabus','thesis','tutoring',
  'workshop','academy','campus','college','faculty','laboratory','library','major',
  'minor','module','objective','outcome','performance','portfolio','presentation',

  // ── Environment / ecology ─────────────────────────────────────────────────
  'atmosphere','biodiversity','biomass','carbon','climate','conservation','deforestation',
  'drought','ecosystem','emission','erosion','extinction','fertilizer','fossil',
  'greenhouse','habitat','humidity','hydrology','irrigation','landfill','meteorology',
  'microplastic','nitrogen','ozone','pesticide','photosynthesis','precipitation',
  'recycling','reforestation','renewable','reservoir','sediment','sewage','species',
  'temperature','toxin','watershed','wetland','wildlife','biosphere','ecosystem',
  'pollution','sustainability','biodegradable','conservation','restoration',

  // ── Law / governance ────────────────────────────────────────────────────
  'accusation','acquittal','amendment','appeal','arbitration','attorney','bail',
  'ballot','charter','citizenship','civil','clause','compliance','constitution',
  'contempt','contract','conviction','copyright','corruption','counsel','defendant',
  'democracy','deposition','election','enforcement','evidence','execution','federalism',
  'legislation','liability','litigation','mandate','jurisdiction','judiciary','patent',
  'penalty','plaintiff','precedent','prosecution','regulation','republic','senate',
  'statute','subpoena','testimony','trademark','treaty','tribunal','verdict','veto',
  'violation','warrant','legislature','referendum','commission','authority','sanction',

  // ── Sports and recreation ─────────────────────────────────────────────────
  'athlete','basketball','boxing','championship','competition','court','cycling',
  'defense','dribble','endurance','exercise','fencing','football','goalkeeper',
  'gymnasium','handball','hiking','hockey','marathon','offense','penalty','referee',
  'rugby','skating','skiing','soccer','softball','stadium','swimming','teamwork',
  'tennis','tournament','volleyball','wrestling','archery','badminton','baseball',
  'bowling','climbing','cricket','golf','gymnastics','karate','lacrosse','rowing',
  'running','sailing','shooting','snowboarding','sprinting','surfing','triathlon',

  // ── Architecture / construction ────────────────────────────────────────────
  'arch','beam','blueprint','brickwork','cantilever','cement','column','concrete',
  'construction','decoration','demolition','doorway','elevation','facade','foundation',
  'framing','hallway','infrastructure','insulation','interior','landscaping','masonry',
  'partition','pillar','plumbing','renovation','scaffold','skyline','staircase',
  'structure','terrace','threshold','truss','ventilation','woodwork','zoning',

  // ── Transportation ────────────────────────────────────────────────────────
  'aircraft','ambulance','automobile','aviation','cargo','caravan','commuter',
  'conductor','conveyor','courier','crosswalk','cyclist','departure','destination',
  'driveway','elevation','escalator','freight','highway','intersection','itinerary',
  'jetway','locomotive','navigation','parking','pedestrian','propulsion','railway',
  'runway','shipment','subway','terminal','timetable','toll','traffic','transit',
  'transportation','turbulence','underpass','vehicle','velocity','watercraft',

  // ── Media / entertainment ────────────────────────────────────────────────
  'advertisement','audience','broadcast','caption','celebrity','channel','cinema',
  'commentary','content','creativity','documentary','episode','entertainment',
  'feedback','genre','headline','interview','journalism','magazine','narrative',
  'network','newscast','podcast','premiere','production','programming','publicity',
  'reality','screenplay','segment','social','streaming','subscription','viewer',
  'advertising','branding','campaign','engagement','follower','hashtag','influencer',
  'platform','posting','reach','sharing','trending','viral','community','creator',

  // ── Weather / geography ────────────────────────────────────────────────────
  'altitude','archipelago','blizzard','canyon','cascade','cavity','coastline',
  'continent','coordinates','cyclone','elevation','equator','fjord','glacier',
  'hemisphere','horizon','hurricane','latitude','longitude','meridian','monsoon',
  'peninsula','plateau','precipitation','terrain','topography','tropical','tsunami',
  'tundra','typhoon','watershed','windstorm','altitude','geography','geology',

  // ── Mathematics ────────────────────────────────────────────────────────────
  'addition','algebra','algorithm','angle','approximation','arithmetic','axis',
  'calculation','calculus','circumference','coefficient','combination','constant',
  'coordinate','correlation','denominator','derivative','diagonal','dimension',
  'division','equation','exponent','expression','factor','formula','fraction',
  'function','geometry','gradient','graph','histogram','hypothesis','inequality',
  'infinity','integer','integral','interval','logarithm','matrix','multiplication',
  'numerator','operation','pattern','percentage','permutation','polynomial','prime',
  'probability','proof','proportion','quadrant','quotient','ratio','regression',
  'remainder','sequence','series','set','simplification','solution','square',
  'statistics','subtraction','symmetry','tangent','theorem','transformation',
  'trigonometry','variable','vector','vertex','volume','zero','approximation',

  // ── Psychology / sociology ────────────────────────────────────────────────
  'adolescence','anxiety','attachment','behavior','bias','boundary','burnout',
  'childhood','cognition','communication','conflict','consciousness','coping','crisis',
  'culture','defense','development','disorder','dysfunction','ego','emotion','empathy',
  'esteem','family','guilt','habit','healing','humanization','identity','ideology',
  'incentive','individualism','inhibition','instinct','intelligence','interaction',
  'isolation','judgment','learning','mindset','motivation','neurosis','norm','obsession',
  'perception','personality','phobia','pleasure','prejudice','psychology','reinforcement',
  'repression','resilience','role','shame','socialization','stability','stereotype',
  'stigma','stimulus','stress','subconscious','therapy','trauma','trust','unconscious',

  // ── More general vocabulary ────────────────────────────────────────────────
  'abyss','accolade','accumulation','accuracy','acknowledgment','adversity','affiliation',
  'agenda','aggregation','alertness','allocation','allowance','alteration','ambiguity',
  'ammunition','anticipation','aptitude','archetype','ardor','articulation','aspiration',
  'assumption','assurance','astute','automation','awareness','backdrop','behavior',
  'benchmark','boldness','boundary','cascade','catalyst','caution','clarity','cluster',
  'cohesion','combination','commitment','compatibility','complexity','confidence',
  'conjunction','consensus','contradiction','contrast','conviction','cooperation',
  'critique','curiosity','cycle','declaration','deviation','dignity','dilemma',
  'dimension','direction','diversity','durability','dynamics','elaboration','empowerment',
  'encounter','endurance','engagement','entity','equilibrium','escalation','essence',
  'estimation','evolution','examination','exclusion','expectation','expertise',
  'exploration','exposure','expression','extension','facade','facilitation','fallacy',
  'familiarity','fascination','feasibility','fluctuation','foundation','fragility',
  'framework','fulfillment','functionality','generalization','gradient','habitation',
  'hierarchy','horizon','humility','hypothesis','identification','illusion','implication',
  'independence','indication','initialization','insight','inspiration','integrity',
  'interaction','interdependence','interpretation','intimacy','intuition','manifestation',
  'momentum','negotiation','neutrality','objectivity','orientation','overlap','paradox',
  'persistence','phenomenon','philosophy','potential','precision','progression',
  'projection','prototype','resolution','restriction','simplification','sophistication',
  'specification','stagnation','sustainability','synchronization','threshold',
  'tolerance','transformation','uniqueness','universality','urgency','utilization',
  'verification','visualization','volatility','vulnerability','workload',
]);

// ══════════════════════════════════════════════════════════════════════════════
// VERBS  (target: ~14,000 stems → expands to ~56,000+ entries)
// ══════════════════════════════════════════════════════════════════════════════

const verbs = dedup([
  // ── Basic actions ──────────────────────────────────────────────────────────
  'be','have','do','say','get','make','go','know','take','see','come','think','look',
  'want','give','use','find','tell','ask','seem','feel','try','leave','call','keep',
  'let','begin','show','hear','play','run','move','live','believe','hold','bring',
  'write','provide','sit','stand','lose','pay','meet','include','continue','set',
  'learn','change','lead','understand','watch','follow','stop','create','speak','read',
  'spend','grow','open','walk','win','offer','remember','love','consider','appear',
  'buy','wait','serve','die','send','expect','build','stay','fall','cut','reach',
  'kill','remain','suggest','raise','pass','sell','require','report','decide','pull',
  'break','hope','develop','carry','help','point','put','turn','start','add','happen',
  'work','describe','explain','happen','return','focus','close','discuss','add',

  // ── Communication ─────────────────────────────────────────────────────────
  'communicate','talk','speak','say','tell','share','announce','declare','state',
  'mention','note','report','describe','explain','clarify','express','articulate',
  'respond','reply','answer','question','ask','inquire','request','demand','insist',
  'suggest','recommend','advise','warn','instruct','direct','guide','inform','notify',
  'confirm','deny','agree','disagree','argue','debate','discuss','negotiate','convince',
  'persuade','influence','encourage','motivate','inspire','challenge','criticize',
  'praise','compliment','thank','apologize','greet','welcome','introduce','present',
  'demonstrate','illustrate','show','indicate','signal','emphasize','highlight',

  // ── Cognitive ─────────────────────────────────────────────────────────────
  'think','believe','know','understand','realize','recognize','remember','recall',
  'forget','imagine','consider','analyze','evaluate','assess','judge','decide',
  'choose','plan','design','create','invent','discover','solve','calculate','estimate',
  'predict','anticipate','assume','conclude','deduce','infer','reason','reflect',
  'contemplate','wonder','question','doubt','trust','accept','reject','compare',
  'contrast','categorize','organize','classify','identify','distinguish','define',
  'interpret','translate','summarize','simplify','abstract','generalize','specialize',
  'explore','investigate','research','study','learn','practice','improve','master',

  // ── Creation / modification ───────────────────────────────────────────────
  'create','make','build','design','develop','write','draw','paint','compose','produce',
  'generate','form','shape','construct','assemble','manufacture','fabricate','craft',
  'edit','modify','change','update','revise','refine','improve','enhance','optimize',
  'add','remove','delete','insert','replace','move','copy','paste','duplicate','clone',
  'combine','merge','split','divide','separate','filter','sort','group','arrange',
  'organize','structure','format','style','customize','configure','setup','initialize',
  'install','deploy','publish','release','launch','ship','deliver','submit','upload',
  'download','import','export','backup','restore','archive','compress','encrypt',

  // ── Movement / position ───────────────────────────────────────────────────
  'move','go','come','travel','walk','run','jump','climb','fall','rise','lift',
  'push','pull','carry','drag','throw','catch','drop','place','set','put','take',
  'bring','send','deliver','transport','transfer','shift','slide','roll','rotate',
  'spin','turn','flip','fold','bend','stretch','reach','extend','expand','shrink',
  'grow','increase','decrease','rise','fall','enter','exit','arrive','depart','leave',
  'return','approach','withdraw','advance','retreat','gather','scatter','spread',

  // ── Control / management ─────────────────────────────────────────────────
  'control','manage','lead','direct','guide','supervise','monitor','track','measure',
  'record','log','store','save','load','retrieve','access','read','write','update',
  'delete','clear','reset','restore','enable','disable','activate','deactivate',
  'configure','setup','install','uninstall','start','stop','pause','resume','cancel',
  'schedule','plan','prioritize','allocate','assign','delegate','distribute','coordinate',
  'collaborate','cooperate','help','support','assist','facilitate','enable','empower',

  // ── Social ───────────────────────────────────────────────────────────────
  'help','support','assist','collaborate','cooperate','share','give','offer','provide',
  'receive','accept','reject','trust','respect','care','love','hate','like','dislike',
  'admire','criticize','judge','forgive','apologize','thank','appreciate','celebrate',
  'comfort','encourage','motivate','inspire','challenge','compete','collaborate',
  'connect','disconnect','join','leave','follow','unfollow','like','share','comment',
  'post','publish','broadcast','communicate','interact','engage','participate',

  // ── Problem solving ────────────────────────────────────────────────────────
  'fix','repair','resolve','solve','address','handle','manage','overcome','prevent',
  'avoid','reduce','minimize','eliminate','optimize','improve','enhance','upgrade',
  'debug','troubleshoot','diagnose','identify','investigate','analyze','evaluate',
  'test','verify','validate','confirm','check','review','audit','inspect','examine',
  'detect','discover','find','locate','search','look','seek','explore','investigate',

  // ── Completion / state change ─────────────────────────────────────────────
  'complete','finish','end','close','stop','terminate','cancel','abort','pause',
  'start','begin','initiate','launch','open','activate','enable','continue','resume',
  'restart','reload','refresh','update','upgrade','downgrade','rollback','revert',
  'commit','push','pull','merge','deploy','release','publish','archive','retire',

  // ── Emotion / perception ──────────────────────────────────────────────────
  'feel','sense','perceive','notice','observe','see','hear','smell','taste','touch',
  'enjoy','love','hate','like','prefer','want','need','desire','wish','hope','fear',
  'worry','stress','relax','rest','sleep','wake','dream','meditate','focus','concentrate',

  // ── Web / tech specific ───────────────────────────────────────────────────
  'click','tap','swipe','scroll','zoom','navigate','browse','search','filter','sort',
  'select','deselect','highlight','copy','paste','cut','drag','drop','resize','reorder',
  'login','logout','signup','authenticate','authorize','register','verify','confirm',
  'submit','cancel','reset','refresh','reload','redirect','redirect','render','display',
  'hide','show','toggle','expand','collapse','open','close','minimize','maximize',
  'load','fetch','request','respond','send','receive','parse','serialize','transform',

  // ── Extended verbs ────────────────────────────────────────────────────────
  'abandon','absorb','accelerate','accommodate','accomplish','achieve','acquire',
  'activate','adapt','adjust','administer','adopt','advance','affect','afford',
  'aggregate','align','allocate','allow','alter','amplify','apply','approach',
  'approximate','archive','articulate','aspire','assess','associate','attempt',
  'attribute','automate','balance','benchmark','boost','calculate','capture','categorize',
  'certify','characterize','clarify','classify','collaborate','collect','compile',
  'concentrate','conclude','connect','consolidate','contribute','convert','coordinate',
  'customize','decide','decompose','decrease','define','delegate','demonstrate','deploy',
  'derive','detect','determine','differentiate','distribute','document','draft',
  'duplicate','elaborate','embed','emphasize','encode','establish','estimate','evaluate',
  'evolve','examine','execute','expand','extrapolate','facilitate','filter','formulate',
  'generate','govern','highlight','identify','illustrate','implement','improve',
  'incorporate','increase','indicate','initialize','integrate','interpret','introduce',
  'iterate','justify','launch','maintain','measure','migrate','minimize','model',
  'monitor','normalize','notify','observe','optimize','organize','overcome','participate',
  'perform','personalize','plan','prioritize','process','promote','protect','provide',
  'publish','quantify','recommend','reduce','reference','refactor','regulate','reinforce',
  'relate','release','rename','replace','reproduce','require','resolve','respond',
  'restrict','scale','secure','simplify','standardize','structure','summarize',
  'support','synchronize','test','trace','track','transform','transition','translate',
  'utilize','validate','verify','visualize','work','adapt','affect','approach',
  'calculate','capture','configure','consider','control','deliver','detect','develop',
  'display','encode','enhance','expand','focus','handle','improve','indicate','integrate',
  'locate','maintain','measure','model','operate','optimize','prepare','process',
  'produce','provide','reduce','report','represent','resolve','retrieve','review',
  'run','scale','select','simplify','specify','test','track','transform','update',
  'use','validate','view','write','achieve','activate','align','allocate','analyze',
  'apply','assess','build','categorize','collect','compile','coordinate','create',
  'customize','debug','define','design','document','establish','evaluate','explore',
  'facilitate','filter','generate','guide','identify','implement','improve','increase',
  'initialize','integrate','introduce','justify','launch','maintain','map','monitor',
  'normalize','observe','organize','perform','plan','prioritize','publish','quantify',
  'recommend','refine','regulate','reinforce','release','reproduce','require','restrict',
  'secure','sort','standardize','structure','summarize','support','synchronize',
  'trace','translate','utilize','verify','visualize','access','automate','benchmark',
  'cache','capture','classify','connect','consolidate','convert','deploy','derive',
  'differentiate','distribute','embed','emphasize','execute','expand','extrapolate',
  'formulate','govern','incorporate','iterate','migrate','minimize','model','normalize',
  'participate','personalize','protect','reference','refactor','relate','rename',
  'replace','respond','transition','override','encapsulate','extend','inherit',
  'instantiate','serialize','deserialize','authenticate','authorize','encrypt','decrypt',
  'hash','tokenize','sanitize','escape','parse','render','compile','interpret','execute',
  'debug','profile','benchmark','optimize','cache','invalidate','refresh','expire',
  'paginate','index','query','aggregate','join','filter','group','order','limit',
  'offset','project','flatten','normalize','denormalize','migrate','seed','snapshot',
  'checkpoint','rollback','commit','push','pull','branch','merge','rebase','cherry',
]);

// ══════════════════════════════════════════════════════════════════════════════
// ADJECTIVES  (target: ~12,000 stems → expands to ~36,000+ entries)
// ══════════════════════════════════════════════════════════════════════════════

const adjectives = dedup([
  // ── Basic descriptors ─────────────────────────────────────────────────────
  'big','small','large','little','tall','short','long','wide','narrow','thick','thin',
  'heavy','light','strong','weak','hard','soft','rough','smooth','sharp','dull',
  'hot','cold','warm','cool','wet','dry','clean','dirty','bright','dark','loud','quiet',
  'fast','slow','quick','old','new','young','fresh','stale','full','empty','open','closed',
  'free','busy','easy','hard','simple','complex','good','bad','great','poor','rich','cheap',
  'expensive','high','low','near','far','close','distant','safe','dangerous','real','fake',

  // ── Emotional / psychological ─────────────────────────────────────────────
  'happy','sad','angry','excited','scared','surprised','confused','bored','tired','awake',
  'calm','anxious','nervous','confident','shy','proud','ashamed','grateful','sorry',
  'lonely','friendly','kind','cruel','gentle','rough','patient','impatient','brave',
  'cowardly','honest','dishonest','loyal','faithful','jealous','generous','selfish',
  'curious','creative','imaginative','logical','rational','emotional','sensitive',
  'passionate','ambitious','motivated','lazy','dedicated','focused','distracted',
  'optimistic','pessimistic','realistic','idealistic','practical','theoretical',

  // ── Physical / appearance ─────────────────────────────────────────────────
  'beautiful','ugly','handsome','pretty','attractive','plain','elegant','stylish',
  'modern','classic','vintage','traditional','contemporary','retro','minimal','bold',
  'colorful','vibrant','muted','dull','bright','dark','light','dark','pale','vivid',
  'transparent','opaque','glossy','matte','rough','smooth','flat','textured','patterned',
  'solid','striped','spotted','checkered','digital','analog','physical','virtual',
  'round','square','rectangular','triangular','circular','oval','curved','straight',

  // ── Quality ───────────────────────────────────────────────────────────────
  'excellent','good','great','superb','outstanding','exceptional','perfect','ideal',
  'adequate','acceptable','sufficient','satisfactory','unsatisfactory','poor','bad',
  'terrible','awful','horrible','dreadful','mediocre','average','ordinary','typical',
  'special','unique','rare','common','general','specific','particular','general',
  'accurate','inaccurate','precise','approximate','exact','rough','correct','incorrect',
  'valid','invalid','true','false','real','fake','authentic','genuine','artificial',
  'natural','synthetic','organic','processed','raw','cooked','fresh','frozen','canned',
  'complete','incomplete','partial','total','full','empty','half','whole','single',

  // ── Temporal ─────────────────────────────────────────────────────────────
  'current','past','future','recent','old','new','latest','earliest','first','last',
  'initial','final','original','revised','updated','outdated','obsolete','modern',
  'traditional','historical','contemporary','previous','next','immediate','eventual',
  'temporary','permanent','brief','extended','short','long','quick','slow','instant',
  'daily','weekly','monthly','annual','frequent','rare','occasional','regular',
  'seasonal','periodic','continuous','intermittent','recurring','unique','singular',

  // ── Technical ────────────────────────────────────────────────────────────
  'digital','analog','online','offline','connected','disconnected','enabled','disabled',
  'active','inactive','available','unavailable','public','private','secure','insecure',
  'encrypted','decrypted','compressed','decompressed','cached','uncached','indexed',
  'sorted','unsorted','filtered','unfiltered','validated','invalid','authorized','unauthorized',
  'authenticated','unauthenticated','responsive','unresponsive','scalable','rigid',
  'modular','monolithic','distributed','centralized','synchronous','asynchronous',
  'blocking','nonblocking','stateful','stateless','immutable','mutable','atomic',
  'concurrent','sequential','parallel','serial','deterministic','nondeterministic',

  // ── Size / scale ─────────────────────────────────────────────────────────
  'tiny','small','medium','large','huge','enormous','massive','gigantic','miniature',
  'compact','bulky','slim','fat','lean','wide','narrow','deep','shallow','high','low',
  'short','tall','broad','thin','thick','dense','sparse','concentrated','diluted',
  'minimal','maximal','extensive','limited','bounded','unbounded','finite','infinite',

  // ── Social / relational ────────────────────────────────────────────────────
  'social','antisocial','friendly','unfriendly','polite','rude','formal','informal',
  'professional','casual','official','unofficial','public','private','personal',
  'collective','individual','shared','exclusive','inclusive','diverse','uniform',
  'cooperative','competitive','collaborative','independent','dependent','mutual',
  'equal','unequal','fair','unfair','just','unjust','legal','illegal','ethical','unethical',

  // ── State / condition ─────────────────────────────────────────────────────
  'broken','fixed','damaged','intact','working','failing','stable','unstable',
  'healthy','sick','active','inactive','busy','idle','available','occupied','used',
  'unused','new','worn','clean','dirty','organized','disorganized','ready','unready',
  'prepared','unprepared','trained','untrained','experienced','inexperienced',
  'qualified','unqualified','certified','uncertified','approved','rejected','pending',
  'confirmed','unconfirmed','verified','unverified','validated','invalidated',

  // ── Design specific ────────────────────────────────────────────────────────
  'minimal','clean','elegant','sleek','modern','flat','material','skeuomorphic',
  'dark','light','moody','vibrant','cinematic','neon','glassmorphic','neumorphic',
  'responsive','adaptive','accessible','readable','legible','clear','crisp','sharp',
  'blurry','soft','glowing','shadowed','highlighted','contrasted','balanced','aligned',
  'centered','left','right','justified','padded','spaced','compact','tight','loose',
  'bold','italic','underlined','strikethrough','uppercase','lowercase','regular',

  // ── Extended adjectives ────────────────────────────────────────────────────
  'abstract','accessible','accurate','adaptable','advanced','affordable','aggressive',
  'agile','alert','aligned','analytical','appropriate','assertive','automated',
  'balanced','beneficial','capable','careful','challenging','clear','compatible',
  'comprehensive','consistent','constructive','controlled','convenient','cooperative',
  'creative','critical','decisive','definitive','deliberate','detailed','different',
  'dynamic','effective','efficient','elaborate','engaging','essential','ethical',
  'evident','evolutionary','exclusive','expandable','experienced','explicit','extensive',
  'external','feasible','flexible','focused','formal','functional','fundamental',
  'gradual','helpful','hierarchical','holistic','horizontal','innovative','intelligent',
  'interactive','internal','intuitive','iterative','justified','legitimate','linear',
  'logical','manageable','measurable','methodical','modular','necessary','objective',
  'observable','operational','optional','organized','original','parallel','practical',
  'predictable','productive','progressive','proportional','qualified','quantifiable',
  'relevant','reliable','repeatable','resilient','rigorous','robust','scalable',
  'secure','selective','sequential','significant','skilled','sophisticated','strategic',
  'structured','suitable','systematic','tactical','technical','tested','thorough',
  'traceable','transferable','transparent','unified','usable','useful','valid',
  'valuable','versatile','vertical','visible','well-defined','achievable','actionable',
  'adequate','ambitious','anticipatory','applicable','appreciative','assertive',
  'attentive','authentic','autonomous','aware','careful','cohesive','collaborative',
  'committed','communicative','competent','concise','confident','constructive',
  'contextual','continuous','contributive','decisive','dedicated','dependable',
  'diligent','direct','disciplined','distinctive','diverse','empathetic','energetic',
  'engaged','experienced','exploratory','expressive','forthcoming','genuine','goal-oriented',
  'holistic','impactful','inclusive','independent','influential','informed','initiative',
  'innovative','insightful','intentional','leadership','meaningful','mindful',
  'motivated','open-minded','optimistic','organized','outcomes-focused','passionate',
  'patient','perceptive','persistent','positive','principled','proactive','problem-solving',
  'productive','proficient','purposeful','qualified','realistic','reflective',
  'resourceful','responsible','results-oriented','self-aware','solution-oriented',
  'supportive','thoughtful','transparent','trustworthy','values-driven','versatile',

  // ── Additional technical adjectives ───────────────────────────────────────
  'asynchronous','bidirectional','binary','boolean','buffered','cached','client-side',
  'cloud-based','compiled','concurrent','containerized','cross-platform','customizable',
  'data-driven','declarative','deplorable','deterministic','distributed','documented',
  'domain-specific','end-to-end','encrypted','event-driven','extensible','fault-tolerant',
  'framework-agnostic','functional','generic','high-performance','horizontally-scalable',
  'idempotent','immutable','injectable','instance-based','interpreted','iterable',
  'lazy','loosely-coupled','microservice-based','middleware','mock-friendly',
  'multiplatform','multithreaded','nested','normalized','object-oriented','observable',
  'open-source','optimized','orthogonal','pagination-aware','platform-agnostic',
  'plugin-based','polymorphic','portable','protocol-based','proxy-aware','pure',
  'queryable','queued','reactive','real-time','recursive','redundant','referential',
  'relational','reproducible','restful','reusable','reversible','role-based','runtime',
  'self-contained','server-side','singleton','stateless','streaming','strongly-typed',
  'template-based','testable','thread-safe','time-based','transactional','type-safe',
  'unidirectional','versioned','web-based','well-structured','zero-dependency',
]);

// ══════════════════════════════════════════════════════════════════════════════
// ADVERBS  (target: ~4,000)
// ══════════════════════════════════════════════════════════════════════════════

const adverbs = dedup([
  // Basic
  'very','quite','really','extremely','highly','deeply','truly','fully','absolutely',
  'completely','totally','entirely','partly','partially','somewhat','rather','fairly',
  'mostly','mainly','largely','greatly','slightly','barely','hardly','scarcely',
  'nearly','almost','just','only','even','still','yet','already','soon','now',
  'then','here','there','everywhere','nowhere','anywhere','somewhere','always',
  'never','often','sometimes','rarely','usually','generally','typically','normally',
  'frequently','occasionally','constantly','continuously','repeatedly','gradually',
  'suddenly','immediately','quickly','slowly','carefully','easily','clearly',
  'directly','exactly','precisely','roughly','approximately','finally','eventually',
  'initially','originally','currently','recently','previously','constantly','effectively',
  'efficiently','successfully','properly','correctly','incorrectly','formally',
  'informally','officially','personally','professionally','publicly','privately',
  'specifically','generally','locally','globally','digitally','physically','virtually',
  'automatically','manually','randomly','systematically','logically','technically',
  'thoroughly','briefly','extensively','collectively','individually','together',
  'separately','simultaneously','sequentially','forward','backward','upward','downward',
  'outward','inward','ahead','behind','above','below','beyond','within','without',
  'throughout','meanwhile','however','therefore','furthermore','additionally','moreover',
  'consequently','accordingly','otherwise','instead','also','too','either','neither',
  'both','each','every','any','all','none','more','less','most','least','better','worse',
  'best','worst','well','badly','hard','fast','late','early','long','far','near',
  'high','low','deep','wide','simply','clearly','obviously','apparently','certainly',
  'definitely','probably','possibly','perhaps','maybe','hopefully','unfortunately',
  'surprisingly','importantly','significantly','essentially','basically','fundamentally',
  'primarily','secondarily','particularly','especially','notably','remarkably',
  'considerably','substantially','significantly','dramatically','drastically',
  'continuously','persistently','consistently','reliably','accurately','precisely',
  'efficiently','productively','creatively','collaboratively','independently',
  'responsively','adaptively','proactively','reactively','iteratively','recursively',
]);

// ══════════════════════════════════════════════════════════════════════════════
// OTHER  (prepositions, conjunctions, pronouns, determiners, etc.)
// ══════════════════════════════════════════════════════════════════════════════

const other = dedup([
  // Prepositions
  'in','on','at','by','for','with','about','against','between','through','during',
  'before','after','above','below','from','to','up','down','into','out','of','off',
  'over','under','around','along','near','behind','across','beyond','within','without',
  'beside','besides','despite','except','including','toward','towards','until','upon',
  // Conjunctions
  'and','but','or','nor','so','yet','for','although','because','since','while',
  'when','where','if','unless','until','though','as','than','that','whether',
  'both','either','neither','not','only','both','just','even','rather','instead',
  // Pronouns
  'i','me','my','mine','myself','you','your','yours','yourself','he','him','his',
  'himself','she','her','hers','herself','it','its','itself','we','us','our','ours',
  'ourselves','they','them','their','theirs','themselves','who','whom','whose','which',
  'that','this','these','those','what','whatever','whoever','whomever','whichever',
  // Determiners / articles
  'a','an','the','some','any','no','every','each','either','neither','both','all',
  'most','more','many','much','few','little','several','enough','such','other','another',
  // Numbers as words
  'one','two','three','four','five','six','seven','eight','nine','ten','eleven',
  'twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen',
  'twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety','hundred',
  'thousand','million','billion','trillion','first','second','third','fourth','fifth',
  'sixth','seventh','eighth','ninth','tenth','last','next','previous','final',
  // Common interjections / discourse markers
  'yes','no','ok','okay','oh','ah','wow','hey','hi','hello','bye','please','thanks',
  'sorry','well','so','now','then','actually','basically','honestly','obviously',
  'clearly','certainly','definitely','probably','maybe','perhaps','anyway','however',
  'therefore','meanwhile','furthermore','additionally','instead','otherwise','still',
  // Common abbreviations used in conversation
  'etc','vs','eg','ie','mr','mrs','ms','dr','prof','sr','jr','inc','ltd','corp',
  // Web / domain specific common tokens
  'http','https','www','html','css','js','url','api','sql','xml','json','csv',
  'pdf','doc','xls','png','jpg','gif','svg','mp3','mp4','zip','tar','gz',
]);

// ── Write corpus ────────────────────────────────────────────────────────────

fs.writeFileSync(path.join(OUT, 'nouns.json'),      JSON.stringify(nouns,      null, 0));
fs.writeFileSync(path.join(OUT, 'verbs.json'),      JSON.stringify(verbs,      null, 0));
fs.writeFileSync(path.join(OUT, 'adjectives.json'), JSON.stringify(adjectives, null, 0));
fs.writeFileSync(path.join(OUT, 'adverbs.json'),    JSON.stringify(adverbs,    null, 0));
fs.writeFileSync(path.join(OUT, 'other.json'),      JSON.stringify(other,      null, 0));

const counts = {
  nouns:      nouns.length,
  verbs:      verbs.length,
  adjectives: adjectives.length,
  adverbs:    adverbs.length,
  other:      other.length,
  total:      nouns.length + verbs.length + adjectives.length + adverbs.length + other.length,
};

console.log('Corpus generated:');
console.log(JSON.stringify(counts, null, 2));
console.log('\nExpected vocabulary expansion:');
console.log('  Nouns (~2 forms each):      ', counts.nouns * 2);
console.log('  Verbs (~4 forms each):      ', counts.verbs * 4);
console.log('  Adjectives (~3 forms each): ', counts.adjectives * 3);
console.log('  Adverbs (1 form each):      ', counts.adverbs);
console.log('  Other (1 form each):        ', counts.other);
const estimated = counts.nouns*2 + counts.verbs*4 + counts.adjectives*3 + counts.adverbs + counts.other;
console.log('  ESTIMATED TOTAL:            ', estimated);
