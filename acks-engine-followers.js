/* ACKS God Mode — acks-engine-followers.js
 * Follower Attraction (RR p.334) — Phase 4 Construction, Wave C (the follower slice).
 *
 * When a domain's ruler reaches name level (9th) holding a stronghold worth at least his class's
 * threshold (5,000gp hideout/guildhouse → 15,000gp most), followers rally to his banner (RR pp.334–337):
 *   • COMPANIONS (1st–3rd level of the ruler's class) → first-class follower Characters
 *     (socialTier:'follower', lieged to the ruler). RAW p.335: they "function as henchmen for all
 *     purposes but do NOT take up henchman slots" — so we create NO henchmanship relation (the cap
 *     counts henchmanships), which is exactly the RAW no-slot behaviour.
 *   • TROOPS (0th/1st level rank-and-file) → one count-Group commanded by the ruler.
 *   • Cloister NOVICES (priestess) → one count-Group (the per-class progression is a Religion layer).
 *
 * The arcane SANCTUM classes (mage / warlock / witch / nobiran-wonderworker) attract their followers
 * via the SANCTUM (acks-engine-sanctums.js onSanctumConstructed, AD-B) — NOT this stronghold path; the
 * eligibility returns reason 'sanctum-class' for them so we never double-mint (a mage's followers come
 * with his sanctum, not his castle — RAW).
 *
 * Surfacing is eligibility-DERIVED (the Stronghold-tab Followers card) so it covers the build-a-castle
 * path, the reach-9th-with-a-stronghold path, AND legacy saves uniformly — no pending-event plumbing.
 * Materialization is GM-reviewed (roll → review the modal → accept). Fires ONCE per ruler
 * (ruler.followersAttracted, RR p.334 — "begin arriving when the stronghold is built or, if he already
 * has one, when he reaches 9th level").
 *
 * Wave B (team b11, 2026-06-20) — landed the three deferred RAW layers (RR pp.335–337):
 *   • LOYALTY/MORALE WIRING — a minted follower now carries the canonical character.loyalty
 *     (the RAW +2/+4 base, permanently modified by the LEADER's Charisma modifier — RR p.395), so
 *     the shipped loyalty machinery (computeEffectiveLoyalty / rollLoyalty / the Loyalty Roll modal)
 *     sees it. followerLoyalty/followerMorale stay the immutable RAW-base record. Divine followers are
 *     fanaticalFollower:true → no loyalty roll on calamities (RR p.336). rollFollowerLoyalty bridges
 *     to the shipped rollLoyalty (read-only consume); followerLoyaltyInfo is the pure UI read.
 *   • FAMILIES ARRIVING WITH FOLLOWERS (RR p.337) — attractFollowers bumps the domain's peasant
 *     population (8d6×10 civilized / 3d6×10 borderlands / 1d4+1×10 outlands, rolled PER 6-mile hex of
 *     the domain's territory) via the canonical setPeasantPopulation setter (keeps the per-hex mirror
 *     in sync, survives the on-load reconcile in both families-per-hex modes), and emits the
 *     follower-families-arrived event. noDomain classes (hideout/guildhouse) bring NO peasants (RR p.337).
 *   • PER-CLASS FOLLOWERS TYPE & EQUIPMENT (RR p.337) — the 9 1d100 tables (one roll per platoon of 30,
 *     RR p.336); the troop Group carries followerComposition[] (per-platoon type+equipment) instead of
 *     being generic men. Group morale = the follower morale (RR p.395).
 *
 * v1 STILL DEFERRED: the hideout→syndicate (Hijinks) + sanctum/dungeon specializations, and promoting
 * the troop Group to real first-class Units with the rolled equipment.
 *
 * Loads after the core (late-binds strongholdValue / rulerCharacter / blankCharacter / blankGroup /
 * _strongholdSeatHexId / newEvent / setEventContext / abilityMod / computeEffectiveLoyalty / rollLoyalty /
 * effectiveDomainClassification / setPeasantPopulation via _A()). Extends global.ACKS via Object.assign.
 */
(function(global){
  'use strict';

  const ACKS = global.ACKS = global.ACKS || {};
  function _A(){ return global.ACKS || ACKS; }

  // ── plumbing ──
  function _rng(opts){ return (opts && typeof opts.rng === 'function') ? opts.rng : Math.random; }
  function _d6(rng){ return 1 + Math.floor((rng() || 0) * 6); }
  function _3d6(rng){ return _d6(rng) + _d6(rng) + _d6(rng); }
  function _rollAbilities(rng){ return { STR:_3d6(rng), INT:_3d6(rng), WIL:_3d6(rng), DEX:_3d6(rng), CON:_3d6(rng), CHA:_3d6(rng) }; }
  function _currentTurn(campaign){ return (campaign && typeof campaign.currentTurn === 'number') ? campaign.currentTurn : 1; }
  function _chars(campaign){ return (campaign && Array.isArray(campaign.characters)) ? campaign.characters : []; }
  function _findChar(campaign, id){ if(id && typeof id === 'object') return id; return _chars(campaign).find(c => c && c.id === id) || null; }

  // Parse + roll an RAW count spec: "NdM", "NdM+K", "NdM*X", "NdM+K*X" (e.g. "5d6*10", "1d4+1*10", "2d6", "1d2*10").
  function rollFollowerDice(spec, rng){
    const m = /^(\d+)d(\d+)(?:\+(\d+))?(?:\*(\d+))?$/.exec(String(spec || '').replace(/\s+/g, ''));
    if(!m) return 0;
    const n = +m[1], die = +m[2], plus = +(m[3] || 0), mult = +(m[4] || 1);
    let sum = 0; for(let i = 0; i < n; i++) sum += 1 + Math.floor((rng() || 0) * die);
    return (sum + plus) * mult;
  }

  // A small, setting-neutral name pool (the GM renames freely). Generic — followers are a mix of cultures.
  const _FOLLOWER_NAMES = Object.freeze([
    'Aldous','Bram','Cedric','Doran','Edric','Fenn','Garrick','Halvard','Ivo','Jarl','Kerrin','Loren',
    'Marek','Nils','Osric','Pell','Quill','Roderic','Sten','Toran','Ulf','Varro','Wend','Yorin',
    'Aud','Brena','Cora','Dera','Esme','Frida','Gwen','Halla','Inga','Jora','Kesta','Lys','Mira',
    'Nessa','Oda','Perrin','Rhea','Sela','Thora','Una','Vesna','Wyn','Yara'
  ]);
  function _pickName(rng){ const i = Math.floor((rng() || 0) * _FOLLOWER_NAMES.length); return _FOLLOWER_NAMES[Math.min(_FOLLOWER_NAMES.length - 1, Math.max(0, i))]; }

  // ════════════════════════════════════════════════════════════════════════════
  // The Followers by Class catalog (RR p.334).
  //   companions  — count dice for the leader companions (1st–3rd level of the ruler's class). null = none.
  //   companionLevels — '1d6' (roll per companion → 1-3:1, 4-5:2, 6:3) | a number (all that level).
  //   troops      — count dice for the rank-and-file (0th/1st level men). null = none.
  //   troopLevel  — 0 or 1.
  //   apprentices — count dice for 0th-level trainees (priestess cloister novices; the arcane sanctum
  //                 classes have apprentices too, but their attraction is owned by AD-B — sanctumModule).
  //   loyalty/morale — RAW starting loyalty / morale (most +2 / +1; divine +4 / +4).
  //   divine      — fanatical followers (+4 loyalty+morale, no loyalty roll on calamities); −50% build cost (info).
  //   noDomain    — hideout/guildhouse: cannot secure a domain; followers bring NO peasants (RR p.337).
  //   infiltrator — ≥1 rogue follower is a rival's infiltrator (RR p.334); can start a syndicate (Hijinks).
  //   sanctumModule — mage/warlock/witch/nobiran: followers come via the SANCTUM (AD-B), not this path.
  //   race / site — informational (the dwarven/elven follower race + the RAW site constraint).
  // ════════════════════════════════════════════════════════════════════════════
  const FOLLOWERS_BY_CLASS = Object.freeze({
    // — Martial: castle/fortress-type stronghold, 5d6×10 0th troops + 1d6 1st–3rd companions —
    'fighter':            { stronghold:'Castle',           minGp:15000, troops:'5d6*10', troopLevel:0, companions:'1d6', companionLevels:'1d6', loyalty:2, morale:1 },
    'paladin':            { stronghold:'Fortress',         minGp:15000, troops:'5d6*10', troopLevel:0, companions:'1d6', companionLevels:'1d6', loyalty:2, morale:1 },
    'barbarian':          { stronghold:"Chieftain's Hall", minGp:15000, troops:'5d6*10', troopLevel:0, companions:'1d6', companionLevels:'1d6', loyalty:2, morale:1, note:'See Clanholds' },
    'bard':               { stronghold:'Great Hall',       minGp:15000, troops:'5d6*10', troopLevel:0, companions:'1d6', companionLevels:'1d6', loyalty:2, morale:1 },
    'explorer':           { stronghold:'Border Fort',      minGp:15000, troops:'5d6*10', troopLevel:0, companions:'1d6', companionLevels:'1d6', loyalty:2, morale:1, site:'outlands or unsettled' },
    'zaharan-ruinguard':  { stronghold:'Dark Fortress',    minGp:15000, troops:'5d6*10', troopLevel:0, companions:'1d6', companionLevels:'1d6', loyalty:2, morale:1, note:'troops may be beastmen; See Clanholds and Transitional Domains' },
    // — Divine martial: −50% build cost (info); followers fanatical (+4 loyalty/morale, no calamity loyalty roll) —
    'bladedancer':        { stronghold:'Temple',           minGp:15000, troops:'5d6*10', troopLevel:0, companions:'1d6', companionLevels:'1d6', loyalty:4, morale:4, divine:true, note:'See Congregants and Divine Power' },
    'crusader':           { stronghold:'Fortified Church', minGp:15000, troops:'5d6*10', troopLevel:0, companions:'1d6', companionLevels:'1d6', loyalty:4, morale:4, divine:true, note:'See Congregants and Divine Power' },
    'shaman':             { stronghold:'Medicine Lodge',   minGp:15000, troops:'5d6*10', troopLevel:0, companions:'1d6', companionLevels:'1d6', loyalty:4, morale:4, divine:true, note:'See Congregants and Divine Power' },
    // — Dwarven: vault, 1st-level dwarven mercenaries, underground —
    'dwarven-craftpriest':{ stronghold:'Vault',            minGp:15000, troops:'1d4+1*10', troopLevel:1, companions:'1d6', companionLevels:'1d6', loyalty:2, morale:1, race:'dwarf', site:'underground (not human/elven civilized or borderland)', divine:true, note:'See Congregants and Divine Power' },
    'dwarven-vaultguard': { stronghold:'Vault',            minGp:15000, troops:'3d6*10',   troopLevel:1, companions:null, loyalty:2, morale:1, race:'dwarf', site:'underground (not human/elven civilized or borderland)' },
    // — Elven —
    'elven-spellsword':   { stronghold:'Fastness',         minGp:15000, troops:'3d6*10',   troopLevel:1, companions:null, loyalty:2, morale:1, race:'elf', site:'place of beauty outside human/dwarven civilized or borderland', note:'animals within 3 miles become friendly' },
    // — Rogue: hideout/guildhouse (5,000gp), 2d6 1st-level companions, NO troops, NO peasants, cannot secure a domain —
    'thief':              { stronghold:'Hideout',          minGp:5000, troops:null, companions:'2d6', companionLevels:1, loyalty:2, morale:1, noDomain:true, infiltrator:true, note:'≥1 follower is a rival infiltrator; can start a syndicate (Hijinks)' },
    'assassin':           { stronghold:'Hideout',          minGp:5000, troops:null, companions:'2d6', companionLevels:1, loyalty:2, morale:1, noDomain:true, infiltrator:true, note:'≥1 infiltrator; can start a syndicate (Hijinks)' },
    'elven-nightblade':   { stronghold:'Hideout',          minGp:5000, troops:null, companions:'2d6', companionLevels:1, loyalty:2, morale:1, noDomain:true, infiltrator:true, race:'elf', note:'≥1 infiltrator; can start a syndicate (Hijinks)' },
    'venturer':           { stronghold:'Guildhouse',       minGp:5000, troops:null, companions:'2d6', companionLevels:1, loyalty:2, morale:1, noDomain:true, infiltrator:true, note:'≥1 infiltrator; raises passive-investment cap; monopoly at 12th' },
    // — Priestess: cloister — 1d2×10 1st-level priestesses (companions) + 1d6×30 0th-level novices (apprentices) —
    'priestess':          { stronghold:'Cloister',         minGp:15000, troops:null, companions:'1d2*10', companionLevels:1, apprentices:'1d6*30', loyalty:2, morale:1, divine:true, note:'−50% build cost; novices become priestesses over ~2 years (Religion); part of older cloister until 12th' },
    // — Arcane sanctum classes: followers come via the SANCTUM (AD-B onSanctumConstructed), NOT this stronghold path —
    'mage':               { stronghold:'Sanctum', minGp:15000, sanctumModule:true, companions:'1d6', apprentices:'2d6', note:'Followers attracted via the sanctum (AD-B), not a stronghold-component' },
    'warlock':            { stronghold:'Sanctum', minGp:15000, sanctumModule:true, companions:'1d6', apprentices:'2d6', note:'Followers attracted via the sanctum (AD-B)' },
    'nobiran-wonderworker':{ stronghold:'Sanctum', minGp:15000, sanctumModule:true, companions:'1d6', apprentices:'2d6', divine:true, note:'Followers attracted via the sanctum (AD-B)' },
    'witch':              { stronghold:'Cottage', minGp:15000, sanctumModule:true, companions:'1d6', apprentices:'2d6', note:'Followers attracted via the cottage/sanctum (AD-B)' }
  });

  // Common variant spellings → the canonical catalog key. (Custom classes — #154 — define their own
  // followers and won't appear here; followerClassKey returns null for them.)
  const _CLASS_ALIASES = Object.freeze({
    'wonderworker':'nobiran-wonderworker', 'nobiran wonderworker':'nobiran-wonderworker',
    'ruinguard':'zaharan-ruinguard', 'zaharan ruinguard':'zaharan-ruinguard',
    'vaultguard':'dwarven-vaultguard', 'dwarven vaultguard':'dwarven-vaultguard',
    'craftpriest':'dwarven-craftpriest', 'dwarven craftpriest':'dwarven-craftpriest',
    'nightblade':'elven-nightblade', 'elven nightblade':'elven-nightblade',
    'spellsword':'elven-spellsword', 'elven spellsword':'elven-spellsword'
  });

  // Normalize a character's class string → a FOLLOWERS_BY_CLASS key (lowercase, hyphenated).
  function followerClassKey(character){
    const raw = String((character && character.class) || '').trim().toLowerCase();
    if(!raw) return null;
    if(_CLASS_ALIASES[raw]) return _CLASS_ALIASES[raw];
    const key = raw.replace(/\s+/g, '-');
    if(FOLLOWERS_BY_CLASS[key]) return key;
    if(_CLASS_ALIASES[key]) return _CLASS_ALIASES[key];
    return null;
  }
  function followersForClass(classKey){ return (classKey && FOLLOWERS_BY_CLASS[classKey]) || null; }

  // ════════════════════════════════════════════════════════════════════════════
  // WAVE B (team b11) — Families Arriving with Followers (RR p.337) + the per-class
  // Followers Type & Equipment tables (RR p.337) + the loyalty/morale wiring.
  // ════════════════════════════════════════════════════════════════════════════

  // Families Arriving with Followers (RR p.337): rolled PER 6-mile hex of the domain's
  // territory, by the hex's classification. (Unsettled has no RAW row → falls to Outlands.)
  const FAMILIES_ARRIVING_PER_HEX = Object.freeze({ Civilized:'8d6*10', Borderlands:'3d6*10', Outlands:'1d4+1*10' });

  // The Followers Type and Equipment by Class tables (RR p.337) — 6 class groups + 3 barbarian
  // setting variants = 9 tables. Each row is a contiguous
  // 1d100 band → a troop type + its equipment (mechanical facts, not rulebook prose). One roll
  // per platoon (30 troops) or fraction thereof (RR p.336). Variant barbarian setting tables are
  // kept separate (Jutland is the default; the GM picks Ivory Kingdoms / Skysos via opts).
  //   ⚠ RR print fix: the Elven Spellsword table misprints the Light Cavalry band as "15-25"
  //   (overlapping Horse Archers 06-15 at 15); corrected to 16-25 for a clean contiguous 1d100.
  const FOLLOWER_TROOP_TABLES = Object.freeze({
    'fighter': Object.freeze([ // Crusaders, Fighters, & Paladins
      { lo:1,  hi:5,   type:'Cataphract Cavalry', equipment:'composite bow, lance, sword, plate armor, lamellar-barded medium warhorse' },
      { lo:6,  hi:15,  type:'Heavy Cavalry',      equipment:'lance, sword, shield, plate armor, chain-barded medium warhorse' },
      { lo:16, hi:25,  type:'Medium Cavalry',     equipment:'lance, sword, shield, lamellar armor, scale-barded medium warhorse' },
      { lo:26, hi:35,  type:'Light Cavalry',      equipment:'3 javelins, sword, shield, scale armor, light warhorse' },
      { lo:36, hi:60,  type:'Heavy Infantry',     equipment:'spear, short sword, shield, banded plate armor' },
      { lo:61, hi:80,  type:'Light Infantry',     equipment:'spear, short sword, shield, leather armor' },
      { lo:81, hi:90,  type:'Bowmen',             equipment:'short bow, short sword, leather armor' },
      { lo:91, hi:100, type:'Slingers',           equipment:'sling, short sword, shield' }
    ]),
    'bard-bladedancer': Object.freeze([ // Bards & Bladedancers
      { lo:1,  hi:10,  type:'Heavy Cavalry',  equipment:'lance, sword, shield, plate armor, chain-barded medium warhorse' },
      { lo:11, hi:20,  type:'Medium Cavalry', equipment:'lance, sword, shield, lamellar armor, scale-barded medium warhorse' },
      { lo:21, hi:35,  type:'Light Cavalry',  equipment:'3 javelins, sword, shield, scale armor, light warhorse' },
      { lo:36, hi:55,  type:'Heavy Infantry', equipment:'spear, short sword, shield, banded plate armor' },
      { lo:56, hi:80,  type:'Light Infantry', equipment:'2 swords, dagger, leather armor' },
      { lo:81, hi:90,  type:'Bowmen',         equipment:'short bow, short sword, leather armor' },
      { lo:91, hi:100, type:'Slingers',       equipment:'sling, short sword, shield' }
    ]),
    'explorer-shaman': Object.freeze([ // Explorers & Shamans
      { lo:1,  hi:10,  type:'Medium Cavalry', equipment:'lance, sword, shield, lamellar armor, scale-barded medium warhorse' },
      { lo:11, hi:25,  type:'Light Cavalry',  equipment:'3 javelins, 2 swords, scale armor, light warhorse' },
      { lo:26, hi:40,  type:'Horse Archers',  equipment:'composite bow, scimitar, leather armor, light warhorse' },
      { lo:41, hi:60,  type:'Light Infantry', equipment:'spear, battle axe, shield, leather armor' },
      { lo:61, hi:70,  type:'Longbowmen',     equipment:'long bow, sword, chain mail' },
      { lo:71, hi:80,  type:'Bowmen',         equipment:'short bow, short sword, leather armor' },
      { lo:81, hi:90,  type:'Slingers',       equipment:'sling, short sword, shield' },
      { lo:91, hi:100, type:'Hunters',        equipment:'bola, net, 3 javelins, hand axe, leather armor' }
    ]),
    'dwarven': Object.freeze([ // Dwarven Craftpriests & Dwarven Vaultguards
      { lo:1,  hi:20,  type:'Dwarven Heavy Infantry',       equipment:'spear, hand axe, shield, plate armor' },
      { lo:21, hi:36,  type:'Dwarven Heavy Infantry',       equipment:'great axe, plate armor' },
      { lo:37, hi:52,  type:'Dwarven Heavy Infantry',       equipment:'warhammer, shield, banded plate armor' },
      { lo:53, hi:68,  type:'Dwarven Heavy Infantry',       equipment:'battle axe, shield, banded plate armor' },
      { lo:69, hi:84,  type:'Dwarven Crossbowman',          equipment:'arbalest, short sword, shield, chain mail' },
      { lo:85, hi:100, type:'Dwarven Mounted Crossbowmen',  equipment:'crossbow, hand axe, plate armor, mule' }
    ]),
    'elven-spellsword': Object.freeze([ // Elven Spellswords
      { lo:1,  hi:5,   type:'Elven Cataphract',     equipment:'composite bow, lance, sword, plate armor, lamellar-barded medium warhorse' },
      { lo:6,  hi:15,  type:'Elven Horse Archers',  equipment:'composite bow, scimitar, leather armor, light warhorse' },
      { lo:16, hi:25,  type:'Elven Light Cavalry',  equipment:'3 javelins, sword, shield, leather armor, light warhorse' },
      { lo:26, hi:40,  type:'Elven Light Infantry', equipment:'spear, short sword, shield, leather armor' },
      { lo:41, hi:55,  type:'Elven Heavy Infantry', equipment:'spear, short sword, shield, chain mail' },
      { lo:56, hi:75,  type:'Elven Bowmen',         equipment:'short bow, short sword, leather armor' },
      { lo:76, hi:100, type:'Elven Longbowmen',     equipment:'long bow, short sword, chain mail' }
    ]),
    'zaharan': Object.freeze([ // Zaharan Ruinguards
      { lo:1,  hi:5,   type:'Goblin Wolf Riders',   equipment:'spear, short sword, shield, leather armor, dire wolf' },
      { lo:6,  hi:15,  type:'Goblin Slingers',      equipment:'sling, short sword, shield, leather armor' },
      { lo:16, hi:25,  type:'Goblin Bowmen',        equipment:'short bow, short sword, scale armor' },
      { lo:26, hi:50,  type:'Goblin Light Infantry',equipment:'spear, short sword, shield, leather armor' },
      { lo:51, hi:75,  type:'Orc Light Infantry',   equipment:'spear, scimitar, shield, leather armor' },
      { lo:76, hi:85,  type:'Orc Bowmen',           equipment:'short bow, scimitar, scale armor' },
      { lo:86, hi:95,  type:'Orc Crossbow',         equipment:'crossbow, scimitar, scale armor' },
      { lo:96, hi:100, type:'Orc Boar Riders',      equipment:'spear, scimitar, shield, leather armor, giant boar' }
    ]),
    'barbarian-jutland': Object.freeze([ // Barbarians (Jutland)
      { lo:1,  hi:25,  type:'Bowmen',         equipment:'short bow, hand axe, leather armor' },
      { lo:26, hi:50,  type:'Light Infantry', equipment:'great axe, leather armor' },
      { lo:51, hi:70,  type:'Light Infantry', equipment:'spear, battle axe, leather armor, shield' },
      { lo:71, hi:85,  type:'Heavy Infantry', equipment:'two-handed sword, chain mail' },
      { lo:86, hi:100, type:'Heavy Infantry', equipment:'spear, sword, chain mail, shield' }
    ]),
    'barbarian-ivory': Object.freeze([ // Barbarians (Ivory Kingdoms)
      { lo:1,  hi:25,  type:'Hunters',        equipment:'bola, 5 darts, hand axe, hide armor' },
      { lo:26, hi:50,  type:'Hunters',        equipment:'bola, net, 3 javelins, hand axe, leather armor' },
      { lo:51, hi:70,  type:'Bowmen',         equipment:'short bow, hand axe, leather armor' },
      { lo:71, hi:85,  type:'Light Infantry', equipment:'spear, scimitar, shield, leather armor' },
      { lo:86, hi:100, type:'Light Infantry', equipment:'spear, hand axe, shield, leather armor' }
    ]),
    'barbarian-skysos': Object.freeze([ // Barbarians (Skysos)
      { lo:1,  hi:25,  type:'Light Infantry',    equipment:'spear, scimitar, shield, leather armor' },
      { lo:26, hi:50,  type:'Composite Bowmen',  equipment:'composite bow, scimitar, leather armor' },
      { lo:51, hi:70,  type:'Horse Archers',     equipment:'composite bow, scimitar, leather armor, light warhorse' },
      { lo:71, hi:85,  type:'Medium Cavalry',    equipment:'lance, scimitar, shield, lamellar armor, scale-barded medium warhorse' },
      { lo:86, hi:100, type:'Light Cavalry',     equipment:'3 javelins, sword, shield, scale armor, light warhorse' }
    ])
  });

  // class → troop-table key. RR p.337 discretion: a Chaotic bladedancer/crusader may roll the
  // Zaharan table, a Neutral ruinguard the Fighter table — surfaced via opts.tableKey (GM judgment,
  // principle #1; never auto-switched). Barbarians pick a setting variant via opts.barbarianCulture.
  const _TROOP_TABLE_BY_CLASS = Object.freeze({
    fighter:'fighter', paladin:'fighter', crusader:'fighter',
    bard:'bard-bladedancer', bladedancer:'bard-bladedancer',
    explorer:'explorer-shaman', shaman:'explorer-shaman',
    'dwarven-craftpriest':'dwarven', 'dwarven-vaultguard':'dwarven',
    'elven-spellsword':'elven-spellsword',
    'zaharan-ruinguard':'zaharan'
  });
  function followerTroopTableKey(classKey, opts){
    opts = opts || {};
    if(opts.tableKey && FOLLOWER_TROOP_TABLES[opts.tableKey]) return opts.tableKey;
    if(classKey === 'barbarian'){
      const c = String(opts.barbarianCulture || 'jutland').toLowerCase();
      return FOLLOWER_TROOP_TABLES['barbarian-' + c] ? ('barbarian-' + c) : 'barbarian-jutland';
    }
    return _TROOP_TABLE_BY_CLASS[classKey] || null;
  }

  // Roll one platoon's type+equipment on a class's 1d100 table.
  function rollFollowerTroopType(tableKey, rng){
    const table = FOLLOWER_TROOP_TABLES[tableKey];
    if(!table) return null;
    const roll = 1 + Math.floor((rng() || 0) * 100);
    for(const row of table){ if(roll >= row.lo && roll <= row.hi) return { roll, type:row.type, equipment:row.equipment }; }
    const last = table[table.length - 1];
    return { roll, type:last.type, equipment:last.equipment };
  }

  // Split `totalCount` troops into platoons of 30 (RR p.336 — "every platoon or fraction thereof")
  // and roll each platoon's type+equipment. Returns { tableKey, platoons:[{platoon,count,type,equipment,roll}],
  // summary:[{type,equipment,count}] (grouped, largest first), total }.
  function rollFollowerTroops(campaign, classKey, totalCount, opts){
    opts = opts || {}; const rng = _rng(opts);
    const total = Math.max(0, Math.round(Number(totalCount) || 0));
    const tableKey = followerTroopTableKey(classKey, opts);
    if(total <= 0 || !tableKey || !FOLLOWER_TROOP_TABLES[tableKey]) return { tableKey: tableKey || null, platoons:[], summary:[], total };
    const nPlatoons = Math.ceil(total / 30);
    const platoons = [];
    for(let i = 0; i < nPlatoons; i++){
      const count = (i < nPlatoons - 1) ? 30 : (total - 30 * (nPlatoons - 1));
      const t = rollFollowerTroopType(tableKey, rng) || { type:'Troops', equipment:'', roll:0 };
      platoons.push({ platoon:i + 1, count, type:t.type, equipment:t.equipment, roll:t.roll });
    }
    const byKey = {};
    for(const p of platoons){ const k = p.type + '|' + p.equipment; (byKey[k] = byKey[k] || { type:p.type, equipment:p.equipment, count:0 }).count += p.count; }
    const summary = Object.keys(byKey).map(k => byKey[k]).sort((a, b) => b.count - a.count);
    return { tableKey, platoons, summary, total };
  }

  // Count the domain's 6-mile territory hexes (the Families roll is per hex, RR p.337). Dedupes the
  // per-domain geography mirror against the top-level campaign.hexes (domainId match). Min 1 (the seat).
  function _domainTerritoryHexCount(campaign, domain){
    if(!domain) return 0;
    const ids = new Set();
    const geo = (domain.geography && Array.isArray(domain.geography.hexes)) ? domain.geography.hexes : [];
    for(const h of geo){ if(h && h.id) ids.add(h.id); }
    const top = (campaign && Array.isArray(campaign.hexes)) ? campaign.hexes : [];
    for(const h of top){ if(h && h.domainId === domain.id && h.id) ids.add(h.id); }
    return ids.size;
  }

  // Shared plan for the Families roll: { applicable, classification, spec, hexCount }. noDomain
  // classes (hideout/guildhouse) attract NO peasants (RR p.337) → applicable:false.
  function _familiesArrivingPlan(campaign, domain, row){
    if(!domain || (row && row.noDomain)) return { applicable:false };
    const A = _A();
    let cls = 'Outlands';
    try { if(typeof A.effectiveDomainClassification === 'function') cls = A.effectiveDomainClassification(domain) || 'Outlands'; } catch(_e){}
    const spec = FAMILIES_ARRIVING_PER_HEX[cls] || FAMILIES_ARRIVING_PER_HEX.Outlands;
    const hexCount = Math.max(1, _domainTerritoryHexCount(campaign, domain));
    return { applicable:true, classification:cls, spec, hexCount };
  }

  // PURE preview for the modal/card (no roll). label e.g. "3d6×10 per hex × 2 hexes (Borderlands)".
  function familiesArrivingPreview(campaign, domain, row){
    const plan = _familiesArrivingPlan(campaign, domain, row || (domain && followersForClass(followerClassKey((_A().rulerCharacter ? _A().rulerCharacter(campaign, domain) : null) || {}))));
    if(!plan.applicable) return { applicable:false };
    return Object.assign({}, plan, { label: plan.spec.replace(/\*/g, '×') + ' per hex × ' + plan.hexCount + ' hex' + (plan.hexCount === 1 ? '' : 'es') + ' (' + plan.classification + ')' });
  }

  // Roll the peasant families arriving with the followers (RR p.337) — once per 6-mile hex.
  // Returns { applicable, families, perHex[], classification, spec, hexCount }.
  function rollFamiliesArriving(campaign, domain, row, rng){
    const plan = _familiesArrivingPlan(campaign, domain, row);
    if(!plan.applicable) return { applicable:false, families:0, perHex:[], hexCount:0, classification:null };
    const perHex = []; let total = 0;
    for(let i = 0; i < plan.hexCount; i++){ const n = rollFollowerDice(plan.spec, rng); perHex.push(n); total += n; }
    return { applicable:true, families:total, perHex, classification:plan.classification, spec:plan.spec, hexCount:plan.hexCount };
  }

  // ── loyalty/morale wiring (read-only consume of the shipped loyalty machinery) ──
  // followerLoyaltyInfo — the pure UI read; effectiveLoyalty via the shipped computeEffectiveLoyalty.
  function followerLoyaltyInfo(campaign, charOrId){
    const A = _A();
    const ch = _findChar(campaign, charOrId);
    if(!ch) return { ok:false, reason:'no-character' };
    const isFollower = ch.attractedAsFollower === true || ch.socialTier === 'follower';
    const fanatical = !!ch.fanaticalFollower;
    const eff = (typeof A.computeEffectiveLoyalty === 'function')
      ? A.computeEffectiveLoyalty(ch)
      : Math.max(-4, Math.min(4, Number(ch.loyalty || 0) + Number(ch.permanentWoundPenalty || 0) + Number(ch.mortalityPenalty || 0)));
    return {
      ok:true, isFollower, fanatical,
      startingLoyalty: (ch.followerLoyalty != null) ? ch.followerLoyalty : null,
      loyalty: Number(ch.loyalty || 0),
      effectiveLoyalty: eff,
      morale: (ch.followerMorale != null) ? ch.followerMorale : null,
      rollsLoyalty: !fanatical,
      note: fanatical ? 'Divine follower — fanatically loyal; rolls no loyalty check on calamities (RR p.336).' : null
    };
  }
  // rollFollowerLoyalty — bridges to the shipped rollLoyalty. A fanatical (divine) follower makes no
  // loyalty roll on calamities (RR p.336) → returns a fanatical result with rolled:false.
  function rollFollowerLoyalty(campaign, charOrId, opts){
    const A = _A(); opts = opts || {};
    const ch = _findChar(campaign, charOrId);
    if(!ch) return { ok:false, reason:'no-character' };
    if(ch.fanaticalFollower){
      return { ok:true, fanatical:true, rolled:false, bandKey:'fanatic', bandLabel:'Fanatic Loyalty', loyaltyDelta:0,
        note:'Divine follower — fanatically loyal; no loyalty roll on calamities (RR p.336).' };
    }
    const eff = (typeof A.computeEffectiveLoyalty === 'function')
      ? A.computeEffectiveLoyalty(ch)
      : Math.max(-4, Math.min(4, Number(ch.loyalty || 0)));
    if(typeof A.rollLoyalty !== 'function') return { ok:false, reason:'loyalty-engine-unavailable' };
    const res = A.rollLoyalty(eff, Number(opts.modifier || 0), opts.prerolled);
    return Object.assign({ ok:true, rolled:true, fanatical:false }, res);
  }

  // ── eligibility (derived — drives the Stronghold-tab card; no stored flag for surfacing) ──
  // Returns { ok, reason, ruler, classKey, row, strongholdValue, threshold, level }.
  function domainFollowerEligibility(campaign, domain){
    const A = _A();
    if(!campaign || !domain) return { ok:false, reason:'no-domain' };
    const ruler = (typeof A.rulerCharacter === 'function') ? A.rulerCharacter(campaign, domain) : _findChar(campaign, domain.rulerCharacterId);
    if(!ruler) return { ok:false, reason:'no-ruler' };
    const classKey = followerClassKey(ruler);
    const row = classKey && FOLLOWERS_BY_CLASS[classKey];
    if(!row) return { ok:false, reason:'class-has-no-followers', ruler, classKey:classKey || null };
    if(row.sanctumModule) return { ok:false, reason:'sanctum-class', ruler, classKey, row };   // AD-B owns these
    const level = Number(ruler.level) || 0;
    if(level < 9) return { ok:false, reason:'ruler-below-9th', ruler, classKey, row, level };
    if(ruler.followersAttracted) return { ok:false, reason:'already-attracted', ruler, classKey, row, level };
    const sv = (typeof A.strongholdValue === 'function') ? (A.strongholdValue(campaign, domain) || 0) : 0;
    if(sv < row.minGp) return { ok:false, reason:'stronghold-too-small', ruler, classKey, row, strongholdValue:sv, threshold:row.minGp, level };
    return { ok:true, ruler, classKey, row, strongholdValue:sv, threshold:row.minGp, level };
  }

  // ── propose (PURE roll over an eligible domain — the modal holds this; ⟳ re-rolls; Accept materializes) ──
  function proposeFollowerArrival(campaign, domain, opts){
    const elig = domainFollowerEligibility(campaign, domain);
    if(!elig.ok) return { ok:false, reason:elig.reason, eligibility:elig };
    const rng = _rng(opts);
    const row = elig.row;
    const companions = [];
    const nComp = row.companions ? rollFollowerDice(row.companions, rng) : 0;
    for(let i = 0; i < nComp; i++){
      let lvl = 1;
      if(row.companionLevels === '1d6'){ const r = _d6(rng); lvl = r <= 3 ? 1 : (r <= 5 ? 2 : 3); }
      else if(typeof row.companionLevels === 'number') lvl = row.companionLevels;
      companions.push({ level: lvl });
    }
    const troopCount = row.troops ? rollFollowerDice(row.troops, rng) : 0;
    const apprenticeCount = row.apprentices ? rollFollowerDice(row.apprentices, rng) : 0;
    return {
      ok:true, rulerId:elig.ruler.id, domainId:domain.id, classKey:elig.classKey, row,
      strongholdValue:elig.strongholdValue, threshold:elig.threshold,
      companions, companionCount:companions.length, troopCount, troopLevel:row.troopLevel || 0, apprenticeCount,
      race: row.race || (elig.ruler.race || 'human'), divine: !!row.divine, loyalty: row.loyalty || 2, morale: row.morale || 1,
      // Wave B previews (no roll committed): the families that will settle + the troop-table the platoons roll on.
      familiesPreview: familiesArrivingPreview(campaign, domain, row),
      troopTableKey: troopCount > 0 ? followerTroopTableKey(elig.classKey, opts) : null
    };
  }

  // ── materialize a reviewed proposal ──
  function _generateFollowerCharacter(campaign, opts){
    const A = _A(); opts = opts || {};
    if(typeof A.blankCharacter !== 'function') return null;
    const rng = _rng(opts);
    const ruler = opts.ruler || {};
    const ch = A.blankCharacter({
      name: _pickName(rng),
      class: ruler.class || '',
      level: Math.max(1, Math.min(3, Number(opts.level) || 1)),
      alignment: ruler.alignment || 'N',
      race: opts.race || ruler.race || 'human',
      abilities: _rollAbilities(rng),
      controlledBy: 'gm',
      socialTier: 'follower',                 // henchman-like, but NO henchmanship → no slot (RR p.335)
      liegeCharacterId: ruler.id || null,
      currentDomainId: opts.domainId || null,
      currentHexId: opts.hexId || ruler.currentHexId || null
    });
    if(!ch) return null;
    ch.attractedAsFollower = true;            // marker for queries + the loyalty wiring
    // Wave B — loyalty/morale wiring (RR p.336 + p.395). followerLoyalty/followerMorale are the IMMUTABLE
    // RAW-base record (+2, or +4 divine); the canonical, driftable, rollable character.loyalty carries
    // the base PERMANENTLY modified by the LEADER's Charisma modifier (RR p.395) — so the shipped loyalty
    // machinery (computeEffectiveLoyalty / rollLoyalty / the Loyalty Roll modal) sees a follower's loyalty.
    const baseLoy = (opts.loyalty != null) ? opts.loyalty : 2;
    ch.followerLoyalty = baseLoy;
    ch.followerMorale = (opts.morale != null) ? opts.morale : 1;
    const chaMod = (typeof A.abilityMod === 'function') ? A.abilityMod((ruler.abilities && ruler.abilities.CHA) || 10) : 0;
    ch.loyalty = Math.max(-4, Math.min(4, baseLoy + chaMod));    // the canonical loyalty score the engine reads
    ch.fanaticalFollower = !!opts.divine;     // divine followers make NO loyalty roll on calamities (RR p.336)
    if(!Array.isArray(campaign.characters)) campaign.characters = [];
    campaign.characters.push(ch);
    return ch;
  }
  function _mintFollowerGroup(campaign, opts){
    const A = _A(); opts = opts || {};
    if(typeof A.blankGroup !== 'function') return null;
    const ruler = opts.ruler || {};
    const count = Math.max(0, Math.round(Number(opts.count) || 0));
    if(count <= 0) return null;
    const novices = opts.novices === true;
    const lvl = Number(opts.level) || 0;
    const raceWord = (opts.race && opts.race !== 'human') ? (opts.race.charAt(0).toUpperCase() + opts.race.slice(1) + ' ') : '';
    const name = count + ' ' + raceWord + (novices ? 'novices of ' : 'follower troops of ') + (ruler.name || 'the ruler');
    const g = A.blankGroup({
      name,
      groupTemplate: { monsterCatalogKey: null, creatureTypes: ['humanoid'], hitDice: lvl >= 1 ? '1' : '1-1' },
      count, casualties: 0,
      socialTier: 'follower',
      commanderCharacterId: ruler.id || null,
      currentDomainId: opts.domainId || null,
      currentHexId: opts.hexId || ruler.currentHexId || null,
      notes: novices
        ? ('Cloister novices attracted to ' + (ruler.name || 'the ruler') + ' (RR p.334 — become 1st-level over ~2 years; a Religion layer)')
        : ('Military followers of ' + (ruler.name || 'the ruler') + ' (RR pp.334–337 — function as mercenaries, but follow on adventures)')
    });
    if(!g) return null;
    if(!Array.isArray(g.history)) g.history = [];
    g.history.push({ turn:_currentTurn(campaign), type:'created', reason:(novices ? 'cloister novices' : 'military followers') + ' attracted to ' + (ruler.name || ruler.id) });
    if(!Array.isArray(campaign.groups)) campaign.groups = [];
    campaign.groups.push(g);
    return g;
  }

  // Record the follower-arrival audit event directly (the _recordArcaneEvent idiom — state is already
  // applied by this verb, so the event is an audit/chronicle entry, not an applyEvent round-trip).
  function _recordFollowerEvent(campaign, payload, opts){
    const A = _A(); opts = opts || {};
    if(!campaign || typeof A.newEvent !== 'function') return null;
    const cal = (campaign.calendar) || {};
    let ev;
    try {
      ev = A.newEvent('follower-arrival', {
        submittedBy:'engine', cadence:'monthly-turn', targetTurn:_currentTurn(campaign),
        gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: (campaign.currentDayInMonth) || 1 },
        payload: Object.assign({ narrative: opts.narrative }, payload || {})
      });
    } catch(_e){ return null; }
    if(typeof A.setEventContext === 'function'){
      A.setEventContext(ev, { primaryHexId: opts.primaryHexId || null, domainId: opts.domainId || null, relatedEntities: opts.relatedEntities || [] });
    }
    ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
    ev.appliedAtTurn = _currentTurn(campaign);
    ev.appliedAtDay = (campaign.currentDayInMonth) || 1;
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: opts.narrative || 'followers arrive' },
      appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
    return ev;
  }

  // Wave B — record the follower-families-arrived audit event (the Families-Arriving population bump,
  // RR p.337). Same direct-emit idiom as _recordFollowerEvent (the bump is already applied).
  function _recordFollowerFamiliesEvent(campaign, payload, opts){
    const A = _A(); opts = opts || {};
    if(!campaign || typeof A.newEvent !== 'function') return null;
    const cal = (campaign.calendar) || {};
    let ev;
    try {
      ev = A.newEvent('follower-families-arrived', {
        submittedBy:'engine', cadence:'monthly-turn', targetTurn:_currentTurn(campaign),
        gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: (campaign.currentDayInMonth) || 1 },
        payload: Object.assign({ narrative: opts.narrative }, payload || {})
      });
    } catch(_e){ return null; }
    if(typeof A.setEventContext === 'function'){
      A.setEventContext(ev, { primaryHexId: opts.primaryHexId || null, domainId: opts.domainId || null, relatedEntities: opts.relatedEntities || [] });
    }
    ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
    ev.appliedAtTurn = _currentTurn(campaign);
    ev.appliedAtDay = (campaign.currentDayInMonth) || 1;
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: opts.narrative || 'families settle' },
      appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
    return ev;
  }

  // Materialize a reviewed proposal: companions → follower Characters, troops/novices → count-Groups,
  // mark the ruler attracted-once, emit follower-arrival. Returns { ok, reason?, companionIds, troopGroupId,
  // noviceGroupId, companionCount, troopCount, apprenticeCount }.
  function attractFollowers(campaign, domain, proposal, opts){
    const A = _A();
    if(!campaign || !domain || !proposal || proposal.ok === false) return { ok:false, reason:'no-proposal' };
    const ruler = _findChar(campaign, proposal.rulerId) || ((typeof A.rulerCharacter === 'function') ? A.rulerCharacter(campaign, domain) : null);
    if(!ruler) return { ok:false, reason:'no-ruler' };
    if(ruler.followersAttracted) return { ok:false, reason:'already-attracted' };
    const row = proposal.row || FOLLOWERS_BY_CLASS[proposal.classKey] || {};
    const seatHex = (typeof A._strongholdSeatHexId === 'function') ? A._strongholdSeatHexId(campaign, domain) : (ruler.currentHexId || null);
    const companionIds = [];
    for(const c of (proposal.companions || [])){
      const ch = _generateFollowerCharacter(campaign, { ruler, level:c.level, race:proposal.race, loyalty:proposal.loyalty, morale:proposal.morale, divine:proposal.divine, domainId:domain.id, hexId:seatHex, rng:opts && opts.rng });
      if(ch) companionIds.push(ch.id);
    }
    // — military troops → a count-Group carrying the per-class Type & Equipment composition (RR p.337) —
    let troopGroupId = null, troopComposition = null;
    if((proposal.troopCount || 0) > 0){
      const g = _mintFollowerGroup(campaign, { ruler, count:proposal.troopCount, level:proposal.troopLevel, race:proposal.race, domainId:domain.id, hexId:seatHex });
      if(g){
        troopGroupId = g.id;
        troopComposition = rollFollowerTroops(campaign, proposal.classKey, proposal.troopCount, { rng:opts && opts.rng, ruler, tableKey:opts && opts.troopTableKey, barbarianCulture:opts && opts.barbarianCulture });
        g.followerComposition = troopComposition.platoons;            // per-platoon RAW type + equipment
        g.followerCompositionSummary = troopComposition.summary;      // grouped, largest first (display)
        g.followerMorale = proposal.morale;                          // RR p.395 — follower morale on the band
        g.followerLoyalty = proposal.loyalty;
        if(g.groupTemplate) g.groupTemplate.followerTroopTableKey = troopComposition.tableKey;
        if(troopComposition.summary && troopComposition.summary.length){
          const dom = troopComposition.summary[0];
          const raceWord = (proposal.race && proposal.race !== 'human') ? (proposal.race.charAt(0).toUpperCase() + proposal.race.slice(1) + ' ') : '';
          g.name = proposal.troopCount.toLocaleString() + ' ' + raceWord + 'follower troops of ' + (ruler.name || 'the ruler') + ' (mostly ' + dom.type + ')';
        }
      }
    }
    let noviceGroupId = null;
    if((proposal.apprenticeCount || 0) > 0){
      const g = _mintFollowerGroup(campaign, { ruler, count:proposal.apprenticeCount, level:0, race:proposal.race, domainId:domain.id, hexId:seatHex, novices:true });
      noviceGroupId = g ? g.id : null;
    }
    // — Families Arriving with Followers (RR p.337): bump the domain's peasant population via the
    //   canonical setter (keeps the per-hex mirror in sync). noDomain classes bring none. Guarded so a
    //   families error never breaks the attraction (the F&D/banditry defensive pattern). —
    let familiesArrived = 0, familiesInfo = null;
    try {
      const fr = rollFamiliesArriving(campaign, domain, row, opts && opts.rng);
      if(fr && fr.applicable && fr.families > 0){
        if(!domain.demographics) domain.demographics = { peasantFamilies:0, urbanFamilies:0, morale:0, moraleNotes:'' };
        const cur = Number(domain.demographics.peasantFamilies || 0);
        if(typeof A.setPeasantPopulation === 'function') A.setPeasantPopulation(domain, cur + fr.families);
        else domain.demographics.peasantFamilies = cur + fr.families;
        domain.followerFamiliesArrived = (Number(domain.followerFamiliesArrived) || 0) + fr.families;   // readout marker
        familiesArrived = fr.families; familiesInfo = fr;
        _recordFollowerFamiliesEvent(campaign, {
          domainId: domain.id, rulerCharacterId: ruler.id, families: fr.families,
          classification: fr.classification, hexCount: fr.hexCount, perHex: fr.perHex
        }, { domainId: domain.id, primaryHexId: seatHex,
          narrative: fr.families.toLocaleString() + ' peasant famil' + (fr.families === 1 ? 'y' : 'ies') + ' settle in ' + (domain.name || 'the domain') + ' with the followers (' + fr.classification + ', ' + fr.hexCount + ' hex' + (fr.hexCount === 1 ? '' : 'es') + ' — RR p.337).',
          relatedEntities: [{ kind:'character', id:ruler.id, role:'subject' }, { kind:'domain', id:domain.id, role:'site' }] });
      }
    } catch(_e){ /* the families bump never breaks attraction */ }
    ruler.followersAttracted = true;
    ruler.followersAttractedAtTurn = _currentTurn(campaign);
    if(typeof A.addCharacterHistory === 'function'){
      try { A.addCharacterHistory(campaign, ruler.id, { turn:_currentTurn(campaign), type:'followers-attracted', reason:'attracts followers to ' + (row.stronghold || 'his stronghold') + ' (RR p.334)' }); } catch(_e){}
    }
    const bits = [];
    if(companionIds.length) bits.push(companionIds.length + ' companion' + (companionIds.length === 1 ? '' : 's'));
    if(proposal.troopCount) bits.push(proposal.troopCount.toLocaleString() + ' troops');
    if(proposal.apprenticeCount) bits.push(proposal.apprenticeCount.toLocaleString() + ' novices');
    if(familiesArrived) bits.push(familiesArrived.toLocaleString() + ' peasant famil' + (familiesArrived === 1 ? 'y' : 'ies'));
    const narrative = (ruler.name || ruler.id) + ' attracts followers to ' + (row.stronghold || 'a stronghold') + ': ' + (bits.join(' + ') || 'none') + ' (RR p.334).';
    _recordFollowerEvent(campaign, {
      domainId: domain.id, rulerCharacterId: ruler.id, classKey: proposal.classKey,
      companionCharacterIds: companionIds, troopGroupId, noviceGroupId,
      companionCount: companionIds.length, troopCount: proposal.troopCount || 0, apprenticeCount: proposal.apprenticeCount || 0,
      families: familiesArrived, troopTableKey: troopComposition ? troopComposition.tableKey : null
    }, { domainId: domain.id, primaryHexId: seatHex, narrative,
      relatedEntities: [{ kind:'character', id:ruler.id, role:'subject' }, { kind:'domain', id:domain.id, role:'site' }].concat(companionIds.map(id => ({ kind:'character', id, role:'beneficiary' }))) });
    return { ok:true, rulerId:ruler.id, companionIds, troopGroupId, noviceGroupId,
      companionCount: companionIds.length, troopCount: proposal.troopCount || 0, apprenticeCount: proposal.apprenticeCount || 0,
      families: familiesArrived, familiesInfo, troopComposition, narrative };
  }

  Object.assign(global.ACKS, {
    FOLLOWERS_BY_CLASS, rollFollowerDice, followerClassKey, followersForClass,
    domainFollowerEligibility, proposeFollowerArrival, attractFollowers,
    // Wave B (team b11)
    FAMILIES_ARRIVING_PER_HEX, FOLLOWER_TROOP_TABLES, followerTroopTableKey,
    rollFollowerTroopType, rollFollowerTroops, familiesArrivingPreview, rollFamiliesArriving,
    followerLoyaltyInfo, rollFollowerLoyalty
  });

})(typeof window !== 'undefined' ? window : global);
