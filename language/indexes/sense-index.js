/**
 * shadow-reaper-v2/language/indexes/sense-index.js
 * Shadow Reaper — Word Sense Index
 *
 * Build: SR-SENSE-INDEX-1
 *
 * Exposes: window.SRSenseIndex
 *
 * PURPOSE:
 *   Pre-built index of AMBIGUOUS words that have multiple distinct meanings.
 *   Provides context-scoring keys so the comprehension engine can resolve
 *   which sense is most likely given surrounding words.
 *
 *   This is NOT a full dictionary.
 *   This covers words whose interpretation MATERIALLY changes the meaning
 *   of a sentence when misread.
 *
 * STRUCTURE:
 *   Each entry:
 *   {
 *     senses: [
 *       {
 *         id:       string          — unique sense identifier
 *         label:    string          — human-readable description
 *         pos:      string          — noun | verb | adj | adv
 *         domain:   string          — finance | nature | tech | general ...
 *         contextKeys: string[]     — words that increase confidence in this sense
 *         antiKeys:    string[]     — words that DECREASE confidence (competitor domain)
 *         weight:   number          — base prior (0-1)
 *       }
 *     ]
 *   }
 *
 * USAGE:
 *   SRSenseIndex.getSenses('bank')
 *   → [{id:'bank:finance', label:'financial institution', ...}, {id:'bank:nature', ...}]
 *
 *   SRSenseIndex.score('bank', contextTokens)
 *   → [{ sense, confidence }, ...]  ordered by confidence
 *
 * Zero external calls. Offline. Pure local data.
 */

'use strict';

(function (global) {

  var BUILD_ID = 'SR-SENSE-INDEX-1';

  // ─── Sense definitions ────────────────────────────────────────────────────
  // Only words with genuinely distinct meanings that affect interpretation.

  var SENSE_DATA = {

    // ── bank ──────────────────────────────────────────────────────────────────
    'bank': {
      senses: [
        { id:'bank:finance', label:'financial institution', pos:'noun', domain:'finance',
          contextKeys:['money','account','deposit','withdraw','loan','credit','interest','savings','atm','transaction','branch','teller','funds','currency'],
          antiKeys:['river','shore','cliff','water','fish','flood'],
          weight: 0.55 },
        { id:'bank:nature', label:'edge of a river or body of water', pos:'noun', domain:'nature',
          contextKeys:['river','shore','water','fish','flood','swim','stream','creek','lake','mud','bank'],
          antiKeys:['money','loan','account','deposit'],
          weight: 0.35 },
        { id:'bank:tilt', label:'to tilt or lean (aircraft/vehicle)', pos:'verb', domain:'aviation',
          contextKeys:['plane','aircraft','turn','fly','pilot','angle','steep','left','right'],
          antiKeys:['money','river'],
          weight: 0.1 },
      ]
    },

    // ── run ───────────────────────────────────────────────────────────────────
    'run': {
      senses: [
        { id:'run:move', label:'to move by running (physical action)', pos:'verb', domain:'physical',
          contextKeys:['fast','miles','jog','race','marathon','morning','exercise','outside','gym'],
          antiKeys:['program','software','execute','code','server','process','machine'],
          weight: 0.4 },
        { id:'run:execute', label:'to execute a program or process', pos:'verb', domain:'tech',
          contextKeys:['program','software','script','code','execute','process','server','command','app','terminal'],
          antiKeys:['jog','exercise','marathon','outside','gym'],
          weight: 0.35 },
        { id:'run:operate', label:'to operate or manage something', pos:'verb', domain:'business',
          contextKeys:['business','company','operation','manage','organization','department','store'],
          antiKeys:['jog','code','execute'],
          weight: 0.15 },
        { id:'run:noun', label:'a period or instance (noun use)', pos:'noun', domain:'general',
          contextKeys:['good','long','short','ski','score','baseball','hit','home'],
          antiKeys:[],
          weight: 0.1 },
      ]
    },

    // ── light ─────────────────────────────────────────────────────────────────
    'light': {
      senses: [
        { id:'light:illumination', label:'electromagnetic radiation / illumination', pos:'noun', domain:'physical',
          contextKeys:['bright','sun','lamp','bulb','candle','dark','dim','glow','beam','shine','room','flash'],
          antiKeys:['weight','heavy','carry','load','color','color'],
          weight: 0.45 },
        { id:'light:weight', label:'not heavy in weight', pos:'adj', domain:'physical',
          contextKeys:['weight','carry','heavy','bag','lift','load','material','fabric','package'],
          antiKeys:['bright','bulb','lamp','glow','sun'],
          weight: 0.3 },
        { id:'light:color', label:'pale or light in color', pos:'adj', domain:'visual',
          contextKeys:['color','shade','tone','blue','green','grey','pink','yellow','paint','design'],
          antiKeys:['heavy','lift','carry'],
          weight: 0.15 },
        { id:'light:ignite', label:'to ignite or start a fire', pos:'verb', domain:'action',
          contextKeys:['fire','candle','flame','match','lighter','kindle','torch','grill','cigarette'],
          antiKeys:['bulb','weight','shade'],
          weight: 0.1 },
      ]
    },

    // ── match ─────────────────────────────────────────────────────────────────
    'match': {
      senses: [
        { id:'match:comparison', label:'to correspond or be equal', pos:'verb', domain:'comparison',
          contextKeys:['compare','equal','same','fit','pair','identical','correspond','similar','pattern','color'],
          antiKeys:['fire','light','burn','soccer','game','tournament','sport'],
          weight: 0.45 },
        { id:'match:sport', label:'a competitive game or contest', pos:'noun', domain:'sport',
          contextKeys:['game','play','team','score','win','lose','sport','soccer','tennis','boxing','tournament','championship'],
          antiKeys:['color','equal','compare'],
          weight: 0.35 },
        { id:'match:fire', label:'a small stick used to start fire', pos:'noun', domain:'physical',
          contextKeys:['fire','light','candle','flame','strike','burn','matchstick','lighter'],
          antiKeys:['game','team','equal'],
          weight: 0.2 },
      ]
    },

    // ── spring ────────────────────────────────────────────────────────────────
    'spring': {
      senses: [
        { id:'spring:season', label:'the season between winter and summer', pos:'noun', domain:'time',
          contextKeys:['season','summer','winter','fall','autumn','flowers','warm','bloom','april','may','weather','rain'],
          antiKeys:['coil','metal','bounce','water','well'],
          weight: 0.5 },
        { id:'spring:jump', label:'to jump or leap suddenly', pos:'verb', domain:'physical',
          contextKeys:['jump','leap','bounce','action','surprise','sudden','quickly'],
          antiKeys:['season','flower','summer','winter'],
          weight: 0.3 },
        { id:'spring:device', label:'a coiled mechanical device', pos:'noun', domain:'mechanical',
          contextKeys:['coil','metal','bounce','tension','compressed','mechanical','device','steel'],
          antiKeys:['season','flower','jump'],
          weight: 0.1 },
        { id:'spring:water', label:'a natural water source', pos:'noun', domain:'nature',
          contextKeys:['water','natural','source','well','ground','fresh','fountain'],
          antiKeys:['season','coil','jump'],
          weight: 0.1 },
      ]
    },

    // ── bar ───────────────────────────────────────────────────────────────────
    'bar': {
      senses: [
        { id:'bar:drinking', label:'a place that serves alcoholic drinks', pos:'noun', domain:'social',
          contextKeys:['drink','alcohol','beer','cocktail','pub','night','friends','bartender','club','alcohol'],
          antiKeys:['law','legal','court','graph','chart','metal','rod'],
          weight: 0.4 },
        { id:'bar:law', label:'the legal profession', pos:'noun', domain:'legal',
          contextKeys:['law','legal','attorney','lawyer','court','exam','pass','admitted','practice'],
          antiKeys:['drink','beer','pub'],
          weight: 0.25 },
        { id:'bar:physical', label:'a long rigid object (rod, stick)', pos:'noun', domain:'physical',
          contextKeys:['metal','steel','rod','horizontal','pull','gym','exercise','grip','iron'],
          antiKeys:['drink','law','court'],
          weight: 0.2 },
        { id:'bar:chart', label:'a bar in a chart or musical measure', pos:'noun', domain:'data',
          contextKeys:['chart','graph','data','measure','music','note','beat','rhythm','measure'],
          antiKeys:['drink','law'],
          weight: 0.15 },
      ]
    },

    // ── die ───────────────────────────────────────────────────────────────────
    'die': {
      senses: [
        { id:'die:death', label:'to cease living', pos:'verb', domain:'life',
          contextKeys:['dead','death','kill','killed','alive','live','life','passed','funeral','battery','plant','flower','pet'],
          antiKeys:['roll','game','cube','dice'],
          weight: 0.75 },
        { id:'die:game', label:'a cube used in games (singular of dice)', pos:'noun', domain:'game',
          contextKeys:['roll','game','dice','cube','six','number','board','play','chance'],
          antiKeys:['dead','death','alive'],
          weight: 0.15 },
        { id:'die:tool', label:'a tool for cutting or shaping material', pos:'noun', domain:'manufacturing',
          contextKeys:['metal','stamp','cut','shape','press','mold','manufacturing','tool','cast'],
          antiKeys:['dead','game','dice'],
          weight: 0.1 },
      ]
    },

    // ── plant ─────────────────────────────────────────────────────────────────
    'plant': {
      senses: [
        { id:'plant:biology', label:'a living organism (vegetation)', pos:'noun', domain:'nature',
          contextKeys:['garden','grow','flower','leaf','soil','water','tree','green','seed','pot','nature','herb'],
          antiKeys:['factory','manufacture','install','spy','hidden'],
          weight: 0.55 },
        { id:'plant:factory', label:'an industrial factory or facility', pos:'noun', domain:'industry',
          contextKeys:['factory','manufacture','production','industrial','facility','workers','equipment','output'],
          antiKeys:['garden','flower','soil','seed'],
          weight: 0.3 },
        { id:'plant:place', label:'to place or install something (often secretly)', pos:'verb', domain:'action',
          contextKeys:['place','put','install','hide','secret','spy','evidence','device','seed'],
          antiKeys:['factory','garden'],
          weight: 0.15 },
      ]
    },

    // ── cold ─────────────────────────────────────────────────────────────────
    'cold': {
      senses: [
        { id:'cold:temperature', label:'low temperature', pos:'adj', domain:'physical',
          contextKeys:['temperature','weather','freeze','snow','winter','ice','hot','warm','outside','degrees'],
          antiKeys:['sick','flu','virus','sneeze','cough','nose'],
          weight: 0.6 },
        { id:'cold:illness', label:'a common illness (cold/flu)', pos:'noun', domain:'health',
          contextKeys:['sick','cough','sneeze','runny','nose','fever','medicine','flu','throat','sore'],
          antiKeys:['weather','snow','temperature','degrees'],
          weight: 0.3 },
        { id:'cold:emotion', label:'emotionally distant or unfriendly', pos:'adj', domain:'emotion',
          contextKeys:['person','unfriendly','distant','harsh','unkind','response','attitude','behavior'],
          antiKeys:['weather','sick','temperature'],
          weight: 0.1 },
      ]
    },

    // ── well ─────────────────────────────────────────────────────────────────
    'well': {
      senses: [
        { id:'well:adverb', label:'in a good or satisfactory manner', pos:'adv', domain:'general',
          contextKeys:['done','good','work','perform','feel','great','fine','health'],
          antiKeys:['water','ground','dig','oil'],
          weight: 0.65 },
        { id:'well:water', label:'a hole dug to reach water or oil', pos:'noun', domain:'nature',
          contextKeys:['water','dig','ground','pump','oil','barrel','deep','bucket','rope'],
          antiKeys:['done','good','feel','health'],
          weight: 0.35 },
      ]
    },

    // ── table ─────────────────────────────────────────────────────────────────
    'table': {
      senses: [
        { id:'table:furniture', label:'a piece of furniture with a flat top', pos:'noun', domain:'physical',
          contextKeys:['chair','sit','eat','dinner','desk','wood','legs','surface','kitchen'],
          antiKeys:['data','database','sql','column','row','spreadsheet','chart'],
          weight: 0.5 },
        { id:'table:data', label:'a structured data grid (rows and columns)', pos:'noun', domain:'tech',
          contextKeys:['data','row','column','sql','database','spreadsheet','html','excel','grid','record'],
          antiKeys:['chair','sit','dinner','wood','kitchen'],
          weight: 0.4 },
        { id:'table:postpone', label:'to postpone (a motion/discussion)', pos:'verb', domain:'formal',
          contextKeys:['motion','vote','discussion','meeting','postpone','delay','agenda'],
          antiKeys:['chair','data','sql'],
          weight: 0.1 },
      ]
    },

    // ── address ───────────────────────────────────────────────────────────────
    'address': {
      senses: [
        { id:'address:location', label:'a physical or postal location', pos:'noun', domain:'location',
          contextKeys:['street','city','zip','postal','home','mail','send','delivery','location','house','number','state'],
          antiKeys:['email','ip','speech','talk','problem'],
          weight: 0.45 },
        { id:'address:email', label:'an email or internet address', pos:'noun', domain:'tech',
          contextKeys:['email','ip','url','web','domain','host','server','port','internet','@'],
          antiKeys:['street','city','postal','house'],
          weight: 0.35 },
        { id:'address:speech', label:'a formal speech', pos:'noun', domain:'formal',
          contextKeys:['speech','give','deliver','president','audience','keynote','commencement'],
          antiKeys:['street','email','ip'],
          weight: 0.1 },
        { id:'address:handle', label:'to handle or deal with a problem', pos:'verb', domain:'action',
          contextKeys:['problem','issue','concern','solve','handle','deal','tackle','question'],
          antiKeys:['street','email','speech'],
          weight: 0.1 },
      ]
    },

    // ── server ────────────────────────────────────────────────────────────────
    'server': {
      senses: [
        { id:'server:computer', label:'a computer that provides services to other computers', pos:'noun', domain:'tech',
          contextKeys:['computer','host','web','database','cloud','backend','deploy','http','api','request','response','port','ip'],
          antiKeys:['restaurant','waiter','food','table','tip','menu'],
          weight: 0.65 },
        { id:'server:restaurant', label:'a person who serves food in a restaurant', pos:'noun', domain:'food',
          contextKeys:['restaurant','waiter','food','table','tip','menu','eat','order','dish'],
          antiKeys:['computer','cloud','deploy','http','api'],
          weight: 0.2 },
        { id:'server:discord', label:'a Discord community server', pos:'noun', domain:'social',
          contextKeys:['discord','community','channel','invite','join','admin','moderator','bot','dm'],
          antiKeys:['computer','http','restaurant'],
          weight: 0.15 },
      ]
    },

    // ── post ──────────────────────────────────────────────────────────────────
    'post': {
      senses: [
        { id:'post:social', label:'a social media post', pos:'noun', domain:'social',
          contextKeys:['social','media','share','like','comment','upload','instagram','twitter','facebook','linkedin','publish','content'],
          antiKeys:['mail','letter','job','position','column','beam'],
          weight: 0.45 },
        { id:'post:mail', label:'postal mail or sending by post', pos:'noun', domain:'postal',
          contextKeys:['mail','letter','envelope','stamp','send','deliver','postbox','package'],
          antiKeys:['social','share','like','comment'],
          weight: 0.25 },
        { id:'post:job', label:'a job position or role', pos:'noun', domain:'employment',
          contextKeys:['job','position','role','apply','hire','fill','vacancy','candidate'],
          antiKeys:['social','mail','beam','column'],
          weight: 0.2 },
        { id:'post:physical', label:'a physical pole or support structure', pos:'noun', domain:'physical',
          contextKeys:['wooden','metal','pole','fence','column','beam','structural'],
          antiKeys:['social','mail','job'],
          weight: 0.1 },
      ]
    },

    // ── charge ────────────────────────────────────────────────────────────────
    'charge': {
      senses: [
        { id:'charge:battery', label:'to recharge a battery or device', pos:'verb', domain:'tech',
          contextKeys:['battery','phone','device','cable','electric','power','plug','laptop','usb','percent'],
          antiKeys:['money','fee','crime','law','attack'],
          weight: 0.35 },
        { id:'charge:money', label:'to bill someone / a fee', pos:'verb', domain:'finance',
          contextKeys:['money','fee','bill','pay','cost','price','dollar','cent','credit','invoice','account'],
          antiKeys:['battery','phone','crime','attack'],
          weight: 0.35 },
        { id:'charge:crime', label:'a formal criminal accusation', pos:'noun', domain:'legal',
          contextKeys:['crime','court','law','arrest','guilty','felony','count','criminal','police','indict'],
          antiKeys:['battery','money','fee'],
          weight: 0.15 },
        { id:'charge:attack', label:'to rush forward in an attack', pos:'verb', domain:'military',
          contextKeys:['attack','rush','forward','battle','troops','enemy','military','assault'],
          antiKeys:['battery','money','crime'],
          weight: 0.15 },
      ]
    },

    // ── bright ────────────────────────────────────────────────────────────────
    'bright': {
      senses: [
        { id:'bright:light', label:'emitting a lot of light', pos:'adj', domain:'visual',
          contextKeys:['light','sun','room','screen','color','shine','lamp','day','flash','glow'],
          antiKeys:['smart','intelligent','student','idea'],
          weight: 0.6 },
        { id:'bright:intelligent', label:'intelligent or clever', pos:'adj', domain:'cognitive',
          contextKeys:['student','person','idea','mind','intelligent','smart','clever','gifted','sharp'],
          antiKeys:['light','lamp','sun','room'],
          weight: 0.4 },
      ]
    },

  };

  // ─── Public: getSenses ────────────────────────────────────────────────────
  /**
   * getSenses(word)
   * Returns array of sense objects for a word, or [] if not ambiguous.
   */
  function getSenses(word) {
    if (!word) return [];
    var w = word.toLowerCase().trim();
    var entry = SENSE_DATA[w];
    return entry ? entry.senses : [];
  }

  // ─── Public: score ────────────────────────────────────────────────────────
  /**
   * score(word, contextTokens, options)
   *
   * Given a word and surrounding context tokens, return senses ranked
   * by confidence.
   *
   * contextTokens: string[] — normalized tokens from the sentence
   * options.pos: string — if known POS, use to filter
   *
   * Returns [{ sense, confidence }, ...] ordered by confidence desc.
   */
  function score(word, contextTokens, options) {
    var senses = getSenses(word);
    if (!senses.length) return [];

    var opts    = options || {};
    var posHint = opts.pos ? opts.pos.toLowerCase() : null;
    var ctxSet  = new Set((contextTokens || []).map(function(t){ return t.toLowerCase(); }));

    var scored = senses.map(function (sense) {
      var conf = sense.weight;

      // POS filter boost/penalty
      if (posHint && sense.pos) {
        if (sense.pos === posHint || sense.pos === posHint.replace('adj','adj')) {
          conf += 0.1;
        } else if (posHint !== 'unknown') {
          conf -= 0.15;
        }
      }

      // Context key scoring
      sense.contextKeys.forEach(function (key) {
        if (ctxSet.has(key)) {
          conf += 0.15;
        }
        // Partial bigram check
        if (key.indexOf(' ') !== -1) {
          var parts = key.split(' ');
          if (parts.every(function(p){ return ctxSet.has(p); })) {
            conf += 0.1;
          }
        }
      });

      // Anti-key penalty
      sense.antiKeys.forEach(function (key) {
        if (ctxSet.has(key)) {
          conf -= 0.2;
        }
      });

      // Clamp
      conf = Math.max(0, Math.min(1, conf));

      return { sense: sense, confidence: conf };
    });

    // Sort by confidence desc
    scored.sort(function (a, b) { return b.confidence - a.confidence; });

    return scored;
  }

  // ─── Public: topSense ─────────────────────────────────────────────────────
  /**
   * topSense(word, contextTokens, options)
   * Returns single highest-confidence sense or null if unambiguous.
   * Returns { sense, confidence, isAmbiguous }
   */
  function topSense(word, contextTokens, options) {
    var scored = score(word, contextTokens, options);
    if (!scored.length) return null;

    var top   = scored[0];
    var second = scored[1];
    var isAmbiguous = second && (top.confidence - second.confidence) < 0.15;

    return {
      sense:        top.sense,
      confidence:   top.confidence,
      isAmbiguous:  isAmbiguous,
      alternatives: isAmbiguous ? scored.slice(1, 3) : [],
    };
  }

  // ─── Public: isAmbiguous ─────────────────────────────────────────────────
  function isAmbiguous(word) {
    return getSenses(word).length > 1;
  }

  // ─── Public: getStats ─────────────────────────────────────────────────────
  function getStats() {
    var words = Object.keys(SENSE_DATA);
    var totalSenses = 0;
    words.forEach(function (w) {
      totalSenses += SENSE_DATA[w].senses.length;
    });
    return {
      ambiguousWords: words.length,
      totalSenses:    totalSenses,
      averageSenses:  totalSenses / Math.max(words.length, 1),
    };
  }

  // ─── Export ───────────────────────────────────────────────────────────────

  global.SRSenseIndex = {
    build:        BUILD_ID,
    getSenses:    getSenses,
    score:        score,
    topSense:     topSense,
    isAmbiguous:  isAmbiguous,
    getStats:     getStats,
  };

})(typeof window !== 'undefined' ? window : global);
