/* acks-engine-sea-encounters.js — Voyages V4: the maritime Encounter layer (JJ pp.71–78 + RR p.323).
 *
 * The sea variant of the shipped wilderness Encounter layer (E1–E10). It is a THIN content+math
 * expansion (Maritime survey §13): the sea-encounter procedure REUSES the shipped spine —
 *   - rarity   → ACKS.rollEncounterRarity   (the Sea Monster Rarity table IS the land one, JJ p.72)
 *   - 6a bind  → ACKS.bindEncounterIdentity  (Lair % → in-lair/wandering, identical)
 *   - entity   → ACKS.createEncounterFromDraw (materialize the Encounter, with a sea distance)
 * — and adds (a) the sea tables, (b) sea distance/evasion/Sea-Pursuit-Time, (c) a territoryClass
 * derived from distance-to-shore (the V3a seaZone). seaEncounterDraw() returns the SAME draw shape
 * as ACKS.encounterDraw, so the consumer + resolution panel work unchanged.
 *
 * ⚠ IP (CLAUDE §13.6 + §13.9 checkpoint 3): this module transcribes the JJ pp.71–78 Sea Encounter
 *   tables — mechanical table CELLS + page cites + own-words effect glosses ONLY, never rulebook
 *   prose. Same posture as acks-engine-encounter-tables.js / the Monster Catalog: self-contained +
 *   excisable, branch-gated under the standing Autarch courtesy umbrella.
 *
 * Loads after acks-engine-voyages.js (uses vessel helpers) + the core (encounterDraw/binding). The
 * day-tick voyage branch (acks-engine-subsystems.js) late-binds ACKS.seaEncounterCheck at runtime.
 */
;(function(global){
  'use strict';
  const A = (global.ACKS = global.ACKS || {});
  const _r = (rng) => (typeof rng === 'function' ? rng : Math.random);
  const _d = (n, rng) => 1 + Math.floor(_r(rng)() * n);            // 1dN
  const _band100 = (table, roll) => { for(const c of table){ if(roll <= c.max) return c; } return table[table.length - 1]; };

  // ─────────────────────────────────────────────────────────────────────────────
  // Sea territory classification (JJ p.71). A sea hex's class derives from its
  // distance to shore: ≤6 mi (1 hex) = the shoreland's class; 6–24 mi (2–4 hexes) =
  // one step wilder; >24 mi = unsettled. v1 keys off the V3a seaZone as the proxy
  // (precise per-hex shore-distance is a Map refinement 🔧): a sea hex with its own
  // domain class is honoured first; otherwise the zone maps to a class.
  // ─────────────────────────────────────────────────────────────────────────────
  const SEA_TERRITORY_BY_ZONE = Object.freeze({ 'lake': 'civilized', 'river': 'civilized', 'coast': 'borderlands', 'open-sea': 'unsettled' });
  function seaTerritoryClassForHex(campaign, hex, seaZone){
    if(hex && hex.domainId && typeof A.territoryClassForHex === 'function'){
      const t = A.territoryClassForHex(campaign, hex);
      if(t) return t;
    }
    return SEA_TERRITORY_BY_ZONE[String(seaZone || 'coast').toLowerCase()] || 'unsettled';
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Sea Encounter Throw Frequency (JJ p.71) — reference data (the consumer keys the
  // cadence off it: sailing = once per 24-mile hex, once per 6-mile hex on a trade route).
  // ─────────────────────────────────────────────────────────────────────────────
  const SEA_ENCOUNTER_FREQUENCY = Object.freeze({
    'anchored-day':   Object.freeze({ civilized: null, borderlands: null, outlands: null, unsettled: 'per-12-hours' }),
    'anchored-night': Object.freeze({ civilized: 'per-7-nights', borderlands: 'per-3-nights', outlands: 'per-12-hours', unsettled: 'per-12-hours' }),
    'fishing':        Object.freeze({ civilized: 'per-attempt', borderlands: 'per-attempt', outlands: 'per-attempt', unsettled: 'per-attempt' }),
    'searching':      Object.freeze({ civilized: 'per-hour', borderlands: 'per-hour', outlands: 'per-hour', unsettled: 'per-hour' }),
    'sailing':        Object.freeze({ civilized: 'per-24-mile-hex', borderlands: 'per-24-mile-hex', outlands: 'per-24-mile-hex', unsettled: 'per-24-mile-hex' }),
    'sailing-trade-route': Object.freeze({ civilized: 'per-6-mile-hex', borderlands: 'per-6-mile-hex', outlands: 'per-6-mile-hex', unsettled: 'per-6-mile-hex' })
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Sea Encounter by Territory Classification (JJ p.72, 1d20). Five danger-ladder
  // columns; the column header "X or Y + Trade Route" encodes the trade-route shift:
  //   base (no trade route): civilized→1, borderlands→2, outlands→3, unsettled→4
  //   on a trade route: shift one LEFT (safer); sailing at night (civ/border/outland): one RIGHT.
  // The "Column Shift, Roll Again" result (a natural 1 in cols 0–3) re-rolls one column right.
  // Mirror of the shipped land rollEncounterCategory column model.
  // ─────────────────────────────────────────────────────────────────────────────
  const SEA_CATEGORY_COLUMNS = Object.freeze([
    Object.freeze({ key: 'civ-trade',        shiftOn1: true,  rows: Object.freeze({ 'no-encounter': [2, 13], 'civilized': [14, 20] }) }),
    Object.freeze({ key: 'civ/border-trade', shiftOn1: true,  rows: Object.freeze({ 'no-encounter': [2, 12], 'civilized': [13, 18], 'monster': [19, 19], 'nautical': [20, 20] }) }),
    Object.freeze({ key: 'border/out-trade', shiftOn1: true,  rows: Object.freeze({ 'no-encounter': [2, 12], 'civilized': [13, 16], 'monster': [17, 19], 'nautical': [20, 20] }) }),
    Object.freeze({ key: 'out/unsettled-trade', shiftOn1: true, rows: Object.freeze({ 'no-encounter': [2, 11], 'civilized': [12, 14], 'monster': [15, 18], 'nautical': [19, 20] }) }),
    Object.freeze({ key: 'unsettled',        shiftOn1: false, rows: Object.freeze({ 'no-encounter': [1, 10], 'monster': [11, 17], 'nautical': [18, 20] }) })
  ]);
  function seaCategoryColumnIndex(territoryClass, opts){
    const o = opts || {};
    const t = String(territoryClass || 'unsettled').toLowerCase();
    let idx;
    if(t === 'civilized')        idx = 1;
    else if(t === 'borderlands') idx = 2;
    else if(t === 'outlands')    idx = 3;
    else                          idx = 4;   // unsettled
    if(o.tradeRoute) idx -= 1;
    if(o.night && (t === 'civilized' || t === 'borderlands' || t === 'outlands')) idx += 1;
    return Math.max(0, Math.min(idx, SEA_CATEGORY_COLUMNS.length - 1));
  }
  function rollSeaEncounterCategory(opts){
    const o = opts || {};
    const rng = _r(o.rng);
    let idx = (typeof o.columnIndex === 'number') ? o.columnIndex : seaCategoryColumnIndex(o.territoryClass, o);
    const rolls = [];
    let category = 'no-encounter';
    for(let guard = 0; guard < 6; guard++){
      const col = SEA_CATEGORY_COLUMNS[Math.min(idx, SEA_CATEGORY_COLUMNS.length - 1)];
      const die = 1 + Math.floor(rng() * 20);
      rolls.push({ column: col.key, roll: die });
      if(die === 1 && col.shiftOn1){ idx += 1; continue; }
      category = 'no-encounter';
      for(const cat of Object.keys(col.rows)){
        const range = col.rows[cat];
        if(die >= range[0] && die <= range[1]){ category = cat; break; }
      }
      break;
    }
    return { category, columnKey: SEA_CATEGORY_COLUMNS[Math.min(idx, 4)].key, rolls };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Sea Civilized Encounter by Territory Classification (JJ p.73, 1d100). 20 bands of 5.
  // Cells → catalog keys (commoner / merchant-mariner / pirate / raider exist; naval-mariner
  // is label-only — the M2 excluded-variant pattern). { max, key, label }.
  // ─────────────────────────────────────────────────────────────────────────────
  const _FISHERS = Object.freeze({ key: 'commoner', label: 'Man, Commoner (fishers)' });
  const _MERCH   = Object.freeze({ key: 'merchant-mariner', label: 'Man, Merchant Mariner' });
  const _NAVAL   = Object.freeze({ key: null, label: 'Man, Naval Mariner' });
  const _PIRATE  = Object.freeze({ key: 'pirate', label: 'Man, Pirate' });
  const _RAIDER  = Object.freeze({ key: 'raider', label: 'Man, Raider' });
  const _civRow = (m, c) => Object.freeze({ max: m, key: c.key, label: c.label });
  const SEA_CIVILIZED_TABLE = Object.freeze({
    'civilized': Object.freeze([_civRow(5,_FISHERS),_civRow(10,_FISHERS),_civRow(15,_FISHERS),_civRow(20,_FISHERS),_civRow(25,_FISHERS),_civRow(30,_FISHERS),_civRow(35,_FISHERS),_civRow(40,_MERCH),_civRow(45,_MERCH),_civRow(50,_MERCH),_civRow(55,_MERCH),_civRow(60,_MERCH),_civRow(65,_MERCH),_civRow(70,_MERCH),_civRow(75,_MERCH),_civRow(80,_MERCH),_civRow(85,_NAVAL),_civRow(90,_PIRATE),_civRow(95,_PIRATE),_civRow(100,_RAIDER)]),
    'borderlands': Object.freeze([_civRow(5,_FISHERS),_civRow(10,_FISHERS),_civRow(15,_FISHERS),_civRow(20,_FISHERS),_civRow(25,_FISHERS),_civRow(30,_FISHERS),_civRow(35,_FISHERS),_civRow(40,_FISHERS),_civRow(45,_MERCH),_civRow(50,_MERCH),_civRow(55,_MERCH),_civRow(60,_MERCH),_civRow(65,_MERCH),_civRow(70,_MERCH),_civRow(75,_MERCH),_civRow(80,_MERCH),_civRow(85,_NAVAL),_civRow(90,_PIRATE),_civRow(95,_PIRATE),_civRow(100,_RAIDER)]),
    'outlands': Object.freeze([_civRow(5,_FISHERS),_civRow(10,_FISHERS),_civRow(15,_FISHERS),_civRow(20,_FISHERS),_civRow(25,_FISHERS),_civRow(30,_FISHERS),_civRow(35,_FISHERS),_civRow(40,_FISHERS),_civRow(45,_FISHERS),_civRow(50,_MERCH),_civRow(55,_MERCH),_civRow(60,_MERCH),_civRow(65,_MERCH),_civRow(70,_MERCH),_civRow(75,_MERCH),_civRow(80,_MERCH),_civRow(85,_NAVAL),_civRow(90,_PIRATE),_civRow(95,_PIRATE),_civRow(100,_RAIDER)]),
    'unsettled': Object.freeze([_civRow(5,_FISHERS),_civRow(10,_FISHERS),_civRow(15,_FISHERS),_civRow(20,_FISHERS),_civRow(25,_MERCH),_civRow(30,_MERCH),_civRow(35,_MERCH),_civRow(40,_MERCH),_civRow(45,_MERCH),_civRow(50,_MERCH),_civRow(55,_MERCH),_civRow(60,_MERCH),_civRow(65,_NAVAL),_civRow(70,_NAVAL),_civRow(75,_PIRATE),_civRow(80,_PIRATE),_civRow(85,_PIRATE),_civRow(90,_PIRATE),_civRow(95,_RAIDER),_civRow(100,_RAIDER)])
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Sea Monster Encounters by Rarity (JJ p.73, 1d100). 20 bands of 5 × 4 rarity columns.
  // Cells → catalog keys (most exist — common-dolphin, kraken, sperm-whale, …); the excluded
  // variable monsters (water elementals, sea-dragon, sphinx) are LABEL-ONLY (key:null), the
  // shipped land null-key pattern. '*' cells (Damned Mariners / Ghost Ship) route to the unique
  // Nautical table — label-only with nauticalRef. { max, key, label }.
  // ─────────────────────────────────────────────────────────────────────────────
  const _m = (m, key, label, nauticalRef) => Object.freeze({ max: m, key: key, label: label, nauticalRef: !!nauticalRef });
  const SEA_MONSTER_TABLE = Object.freeze({
    'common': Object.freeze([
      _m(5,'common-dolphin','Dolphin, Common'), _m(10,'common-dolphin','Dolphin, Common'), _m(15,'common-dolphin','Dolphin, Common'),
      _m(20,null,'Elemental, Petty Water'), _m(25,'small-raptor','Raptor, Small (osprey)'), _m(30,'small-raptor','Raptor, Small (osprey)'),
      _m(35,'medium-raptor','Raptor, Med. (sea eagle)'), _m(40,'medium-raptor','Raptor, Med. (sea eagle)'),
      _m(45,'common-seal','Seal, Common'), _m(50,'common-seal','Seal, Common'), _m(55,'common-seal','Seal, Common'),
      _m(60,'bull-shark','Shark, Bull'), _m(65,'bull-shark','Shark, Bull'), _m(70,'mako-shark','Shark, Mako'), _m(75,'mako-shark','Shark, Mako'),
      _m(80,'sea-snake','Snake, Sea'), _m(85,'fish-swarm','Swarm, Fish'), _m(90,'fish-swarm','Swarm, Fish'), _m(95,'fish-swarm','Swarm, Fish'),
      _m(100,'sea-turtle','Turtle, Sea')
    ]),
    'uncommon': Object.freeze([
      _m(5,'giant-crab','Crab, Giant'), _m(10,'giant-devil-ray','Devil Ray, Giant'), _m(15,'giant-dragonfly','Dragonfly, Giant'),
      _m(20,null,'Elemental, Minor Water'), _m(25,'giant-catfish','Fish, Giant Catfish'), _m(30,'giant-piranha','Fish, Giant Piranha'),
      _m(35,'rockfish','Fish, Giant Rockfish'), _m(40,null,'Man, Naval Mariner'), _m(45,'pirate','Man, Pirate'), _m(50,'pirate','Man, Pirate'),
      _m(55,'raider','Man, Raider'), _m(60,'raider','Man, Raider'), _m(65,'large-raptor','Raptor, Large (albatross)'), _m(70,'large-raptor','Raptor, Large (albatross)'),
      _m(75,'small-roc','Roc, Small'), _m(80,'great-white-shark','Shark, Great White'), _m(85,'great-white-shark','Shark, Great White'),
      _m(90,'insect-swarm','Swarm, Insect (dragonfly)'), _m(95,'killer-whale','Whale, Killer'), _m(100,'killer-whale','Whale, Killer')
    ]),
    'rare': Object.freeze([
      _m(5,null,'Elemental, Major Water'), _m(10,'sturgeon','Fish, Giant Sturgeon'), _m(15,'griffon','Griffon'), _m(20,'hippogriff','Hippogriff'),
      _m(25,'giant-jellyfish','Jellyfish, Giant'), _m(30,'manticore','Manticore'), _m(35,'naiad','Nymph, Naiad'), _m(40,'giant-octopus','Octopus, Giant'),
      _m(45,'pegasus','Pegasus'), _m(50,'giant-raptor','Raptor, Giant (albatross)'), _m(55,'large-roc','Roc, Large'), _m(60,'skittering-maw','Skittering Maw'),
      _m(65,'sea-serpent','Sea Serpent'), _m(70,'siren','Siren'), _m(75,null,'Sphinx'), _m(80,'giant-squid','Squid, Giant'),
      _m(85,'strix','Strix'), _m(90,'stymph','Stymph'), _m(95,'triton','Triton'), _m(100,'narwhal-whale','Whale, Narwhal')
    ]),
    'very-rare': Object.freeze([
      _m(5,null,'Damned Mariners',true), _m(10,null,'Dragon, Sea'), _m(15,null,'Dragon, Sea'), _m(20,'dragon-turtle','Dragon Turtle'), _m(25,'dragon-turtle','Dragon Turtle'),
      _m(30,null,'Elemental, Supreme Water'), _m(35,null,'Elemental, Supreme Water'), _m(40,'marid','Genie, Marid'), _m(45,'marid','Genie, Marid'),
      _m(50,null,'Ghost Ship',true), _m(55,'kraken','Kraken'), _m(60,'kraken','Kraken'), _m(65,'phoenix','Phoenix'), _m(70,'phoenix','Phoenix'),
      _m(75,'giant-roc','Roc, Giant'), _m(80,'giant-roc','Roc, Giant'), _m(85,'greater-titan','Titan, Greater'), _m(90,'greater-titan','Titan, Greater'),
      _m(95,'sperm-whale','Whale, Sperm'), _m(100,'sperm-whale','Whale, Sperm')
    ])
  });

  // 1d100 identity draw → { key, label, natural } (the _drawIdentityForHex shape, so the shipped
  // bindEncounterIdentity / _applyIdentityBinding consume it unchanged; null key = label-only).
  function rollSeaCivilized(territoryClass, rng){
    const table = SEA_CIVILIZED_TABLE[String(territoryClass || 'unsettled').toLowerCase()] || SEA_CIVILIZED_TABLE['unsettled'];
    const roll = _d(100, rng); const cell = _band100(table, roll);
    return { key: cell.key || null, label: cell.label, natural: roll };
  }
  function rollSeaMonster(rarity, rng){
    const table = SEA_MONSTER_TABLE[String(rarity || 'common').toLowerCase()] || SEA_MONSTER_TABLE['common'];
    const roll = _d(100, rng); const cell = _band100(table, roll);
    return { key: cell.key || null, label: cell.label, natural: roll, nauticalRef: !!cell.nauticalRef };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Nautical Encounters (JJ pp.73–78) — the sea "terrain encounter": 1d12 type, then the
  // sub-table. Each cell carries the name + an own-words mechanical gloss (NOT rulebook prose);
  // several are persistent map features (a Monster-Persistence seam, noted `persistent`). v1
  // SURFACES the rolled encounter as a GM-resolve notable (the land terrain-encounter precedent);
  // auto-applying each effect is a 🔧 follow-on.
  // ─────────────────────────────────────────────────────────────────────────────
  const NAUTICAL_TYPE = Object.freeze([Object.freeze({ max: 5, type: 'beneficial' }), Object.freeze({ max: 10, type: 'detrimental' }), Object.freeze({ max: 12, type: 'unique' })]);
  const _ne = (n, name, effect, persistent) => Object.freeze({ n: n, name: name, effect: effect, persistent: !!persistent });
  const NAUTICAL_BENEFICIAL = Object.freeze([
    _ne(1,'Castaway','A rescuable NPC adrift — Friendly if rescued, knows a rumor, recruitable.'),
    _ne(2,'Derelict','An abandoned vessel — roll its type; 2d4×10% SHP; 25% holds cargo (max × SHP%).'),
    _ne(3,'Favorable Current','The vessel’s speed is increased by 50% in this hex.'),
    _ne(4,'Favorable Winds','Wind shifts 30° toward the vessel’s heading (or +1 strength step if already running).'),
    _ne(5,'Flotsam','Floating cargo — 2d6 lots of 1,000 st; roll merchandise (re-roll common/tools/arms/precious).'),
    _ne(6,'Good Omen','The inspired crew ignores its next morale calamity.'),
    _ne(7,'Monster Carcass','A floating carcass — roll the monster table; 1d4 days old; salvageable parts.'),
    _ne(8,'Navigational Sign','A landmark — relocates a lost vessel, or +4 to the next not-lost throw.', true),
    _ne(9,'Plentiful Fish','Rich grounds — 4d10×2 lb rations per 20 crew (more if fishing).', true),
    _ne(10,'Safe Haven','A hidden cove — anchor safely, no encounter throws (else Smooth Sailing).', true),
    _ne(11,'Smooth Sailing','The vessel ignores its next sea-monster or detrimental nautical encounter.'),
    _ne(12,'Double','Roll twice on this table (a re-rolled ‘double’ sends you to the unique table).')
  ]);
  const NAUTICAL_DETRIMENTAL = Object.freeze([
    _ne(1,'Bad Omen','A morale calamity for the superstitious crew.'),
    _ne(2,'Dead Sea','Lifeless water — the vessel cannot fish in this hex.', true),
    _ne(3,'Food Spoilage','Lose 2d10% of stored food; a morale calamity.'),
    _ne(4,'Mariner Overboard','A random NPC overboard — drowns if not rescued; a calamity if a crewman is abandoned.'),
    _ne(5,'Nautical Challenge','A failing component — ≤¼ speed until 1d3 difficult throws succeed (−4 Windy / −10 Stormy).'),
    _ne(6,'Nautical Hazard','The hex holds a hazard — roll the hazard table; Seafaring 11+ (7+ master) to traverse.', true),
    _ne(7,'Rogue Wave','A capsizing wave — SHP damage scaling with wind; the captain’s save caps loss at 25% SHP.'),
    _ne(8,'Rough Conditions','All speeds are reduced by ½ in this hex.'),
    _ne(9,'Unpredictable Weather','Immediately re-roll the day’s weather (temperature, precipitation, wind).'),
    _ne(10,'Water Spoilage','Lose 2d10% of stored water; a morale calamity.'),
    _ne(11,'Wear-and-Tear','1 structural damage (repairable only in port — dangerous to small vessels).'),
    _ne(12,'Double','Roll twice on this table (a re-rolled ‘double’ sends you to the unique table).')
  ]);
  const NAUTICAL_UNIQUE = Object.freeze([
    _ne(1,'Colossal Statue','A sea-god colossus juts from the water; GM’s discretion (curiosity to dungeon).', true),
    _ne(2,'Damned Mariners','An undead vessel — haugbui crew, draugr officers; automatically hostile, will board.'),
    _ne(3,'Deafening Mist','A supernatural mist; GM resolves.'),
    _ne(4,'Ghost Ship','A phantom vessel; GM resolves.'),
    _ne(5,'Leviathan','A colossal sea beast; GM resolves.'),
    _ne(6,'Magical Resource','A magical resource at sea; GM resolves.'),
    _ne(7,'Marine Formation','A notable marine terrain formation; GM resolves.'),
    _ne(8,'Message in a Bottle','A drifting message; GM resolves.'),
    _ne(9,'Place of Power','A sea place of power; GM resolves.', true),
    _ne(10,'Sunken Treasure Ship','A treasure wreck below; GM resolves.', true),
    _ne(11,'Truly Unique','The GM devises something wholly unique.'),
    _ne(12,'Double','Roll twice on this table.')
  ]);
  // Depth (JJ p.74) by distance to shore, in feet; Vessels (1d20) + Treasure-by-territory sub-tables.
  const NAUTICAL_DEPTH = Object.freeze([
    Object.freeze({ maxHex: 4,  dice: '2d4 × 50' }), Object.freeze({ maxHex: 8, dice: '2d8 × 50' }),
    Object.freeze({ maxHex: 11, dice: '3d6 × 500' }), Object.freeze({ maxHex: 99, dice: '3d6 × 1000' })
  ]);
  const NAUTICAL_VESSELS = Object.freeze(['barge-small','barge-small','barge-large','barge-large','barge-huge','galley-1-rower','galley-1.5-rower','galley-2-rower','galley-2.5-rower','galley-3-rower','galley-3-rower','galley-4-rower','galley-5-rower','galley-8-rower','longship','sailing-ship-small','sailing-ship-small','sailing-ship-large','sailing-ship-large','sailing-ship-huge']);
  const NAUTICAL_TREASURE_BY_TERRITORY = Object.freeze({ 'civilized': 'L,D', 'borderlands': 'K,C', 'outlands': 'L', 'unsettled': 'O' });
  function rollNauticalEncounter(rng){
    const r = _r(rng);
    const tRoll = _d(12, rng);
    const type = (_band100(NAUTICAL_TYPE.map(c => ({ max: c.max, type: c.type })), tRoll)).type;
    const sub = type === 'beneficial' ? NAUTICAL_BENEFICIAL : type === 'detrimental' ? NAUTICAL_DETRIMENTAL : NAUTICAL_UNIQUE;
    const subRoll = _d(12, rng);
    const cell = sub.find(c => c.n === subRoll) || sub[sub.length - 1];
    return { type: type, typeRoll: tRoll, roll: subRoll, name: cell.name, effect: cell.effect, persistent: !!cell.persistent };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Sea-encounter distance → evasion → pursuit (RR p.323). Encounters begin at MAX
  // visibility; combat at ≤1,800'. 🔧 v1: true sea visibility is miles (the horizon); we
  // use a 1-mile engine proxy under clear conditions, halved/short under weathering — what's
  // load-bearing is far-when-clear (evasion possible) vs short-in-fog/storm (immediate).
  // ─────────────────────────────────────────────────────────────────────────────
  const SEA_COMBAT_RANGE_FEET = 1800;
  const SEA_VISIBILITY_FEET = Object.freeze({ 'clear': 5280, 'cloudy': 5280, 'overcast': 3960, 'rain': 2640, 'rainy': 2640, 'snow': 20, 'snowy': 20, 'fog': 20, 'foggy': 20, 'storm': 20, 'stormy': 20 });
  function seaEncounterDistance(opts){
    const o = opts || {};
    let ft = (typeof o.visibilityFeet === 'number') ? o.visibilityFeet
      : (o.weatherCondition ? (SEA_VISIBILITY_FEET[String(o.weatherCondition).toLowerCase()] || SEA_VISIBILITY_FEET.clear) : SEA_VISIBILITY_FEET.clear);
    return { distanceFt: ft, combatRangeFt: SEA_COMBAT_RANGE_FEET, atMaxVisibility: true, combatBeginsImmediately: ft <= SEA_COMBAT_RANGE_FEET };
  }
  // Vessels cannot evade sea creatures (→ combat handoff); vessels CAN evade other vessels by
  // outrunning / waiting for visibility to drop / weather / shallows-draft / hidden coves (RR p.323).
  const SEA_EVASION_VESSEL_ROUTES = Object.freeze(['outrun-beyond-visibility', 'wait-for-visibility-drop', 'into-weather', 'into-shallows-draft', 'into-coves-coastline']);
  // A "Man, …" result (pirate/raider/naval mariner/merchant/commoner) is a MANNED VESSEL — RAW-
  // evadable — even when rolled on the Sea Monster table; only a true sea creature can't be evaded.
  const _isMannedVessel = (opts) => (opts.opponentKind === 'vessel') || (opts.category === 'civilized')
    || (opts.identity && /^man[, ]/i.test(String(opts.identity.label || '')));
  function evasionAtSea(opts){
    const o = opts || {};
    if(!_isMannedVessel(o)) return { canEvade: false, reason: 'vessels-cannot-evade-sea-creatures', routes: [], handoff: 'combat' };
    return { canEvade: true, reason: 'speed-paramount', routes: SEA_EVASION_VESSEL_ROUTES.slice() };
  }
  // Sea Pursuit Time (RR p.323): by the evading vessel's speed differential, in feet/round slower.
  // Assumes a 6-mile initial range (scale down for less). 'turn' = 10 min.
  const SEA_PURSUIT_TIME = Object.freeze([
    Object.freeze({ maxSlower: 0,   dice: null,      unit: null,   note: 'faster — cannot be caught' }),
    Object.freeze({ maxSlower: 30,  dice: '1d6+2',   unit: 'hours' }),
    Object.freeze({ maxSlower: 60,  dice: '1d3+1',   unit: 'hours' }),
    Object.freeze({ maxSlower: 90,  dice: '1d3',     unit: 'hours' }),
    Object.freeze({ maxSlower: 120, dice: '2d6+1',   unit: 'turns' }),
    Object.freeze({ maxSlower: 150, dice: '2d6-1',   unit: 'turns' })
  ]);
  function seaPursuitTime(speedDiffPerRound, rng){
    const d = Number(speedDiffPerRound);
    if(!(d > 0)) return { uncatchable: true, band: SEA_PURSUIT_TIME[0], time: null, unit: null };
    let band = SEA_PURSUIT_TIME[SEA_PURSUIT_TIME.length - 1];
    for(const b of SEA_PURSUIT_TIME){ if(d <= b.maxSlower){ band = b; break; } }
    if(!band.dice) return { uncatchable: true, band: band, time: null, unit: null };
    const time = (typeof A._rollDiceStr === 'function') ? A._rollDiceStr(band.dice, _r(rng)) : 0;
    return { uncatchable: false, band: band, time: time, unit: band.unit };
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // seaEncounterDraw — the maritime mirror of ACKS.encounterDraw. Same draw shape (so the
  // consumer + createEncounterFromDraw + resolution panel work unchanged), plus sea fields
  // (atSea/seaZone/nautical/distance/evasion). Category from the sea 1d20; rarity from the
  // shipped land table (identical, JJ p.72); identity from the sea 1d100; the 6a binding from
  // the shipped bindEncounterIdentity (a sea hex rarely lairs → wandering; a flyer/aquatic den
  // on an islet/reef/wreck binds as on land).
  // ─────────────────────────────────────────────────────────────────────────────
  function seaEncounterDraw(campaign, hexId, context){
    const ctx = context || {};
    const rng = _r(ctx.rng);
    const hex = Array.isArray(campaign && campaign.hexes) ? campaign.hexes.find(h => h && h.id === hexId) : null;
    const seaZone = ctx.seaZone || 'coast';
    const territory = ctx.territoryClass || seaTerritoryClassForHex(campaign, hex, seaZone);
    const cat = rollSeaEncounterCategory({ territoryClass: territory, tradeRoute: !!ctx.tradeRoute, night: !!ctx.night, rng });
    const draw = {
      atSea: true, seaZone: seaZone, hexId: hexId || null, territoryClass: territory, columnKey: cat.columnKey,
      category: cat.category, rolls: cat.rolls, rarity: null, rarityRoll: null,
      identity: null, identityRoll: null, binding: null, proposal: null,
      nautical: null, distance: null, evasion: null
    };
    if(cat.category === 'no-encounter') return draw;
    if(cat.category === 'nautical'){ draw.nautical = rollNauticalEncounter(rng); return draw; }
    if(cat.category === 'civilized'){
      const ident = rollSeaCivilized(territory, rng);
      draw.identityRoll = ident; draw.identity = 'table';
      if(typeof A.bindEncounterIdentity === 'function') draw.binding = A.bindEncounterIdentity(campaign, hexId, ident, { category: 'civilized', rng, partySide: ctx.partySide });
    } else if(cat.category === 'monster'){
      const rar = (typeof A.rollEncounterRarity === 'function') ? A.rollEncounterRarity(territory, rng) : { rarity: 'common', roll: 0 };
      draw.rarity = rar.rarity; draw.rarityRoll = rar.roll;
      const ident = rollSeaMonster(rar.rarity, rng);
      draw.identityRoll = ident; draw.identity = 'table';
      if(typeof A.bindEncounterIdentity === 'function') draw.binding = A.bindEncounterIdentity(campaign, hexId, ident, { category: 'monster', rng, partySide: ctx.partySide });
    }
    draw.distance = seaEncounterDistance({ weatherCondition: ctx.weatherCondition, visibilityFeet: ctx.visibilityFeet });
    if(draw.distance) draw.distance.terrainRow = (seaZone === 'open-sea') ? 'the open sea' : ('the ' + seaZone);
    draw.evasion = evasionAtSea({ category: draw.category, identity: draw.identityRoll });
    return draw;
  }

  Object.assign(A, {
    SEA_TERRITORY_BY_ZONE, seaTerritoryClassForHex,
    SEA_ENCOUNTER_FREQUENCY,
    SEA_CATEGORY_COLUMNS, seaCategoryColumnIndex, rollSeaEncounterCategory,
    SEA_CIVILIZED_TABLE, SEA_MONSTER_TABLE, rollSeaCivilized, rollSeaMonster,
    NAUTICAL_TYPE, NAUTICAL_BENEFICIAL, NAUTICAL_DETRIMENTAL, NAUTICAL_UNIQUE,
    NAUTICAL_DEPTH, NAUTICAL_VESSELS, NAUTICAL_TREASURE_BY_TERRITORY, rollNauticalEncounter,
    SEA_COMBAT_RANGE_FEET, SEA_VISIBILITY_FEET, seaEncounterDistance,
    SEA_EVASION_VESSEL_ROUTES, evasionAtSea, SEA_PURSUIT_TIME, seaPursuitTime,
    seaEncounterDraw
  });
})(typeof globalThis !== 'undefined' ? globalThis : this);
