/* =============================================================================
 * ACKS God Mode — Engine Module (v2)
 * =============================================================================
 *
 * This file is the canonical engine for the ACKS God Mode. It is
 * intentionally decoupled from any UI library (no DOM, no Alpine, no Tailwind)
 * so that companion tools, game master AI agents, or future hosted versions
 * can consume the same data and computations.
 *
 * Architecture:
 *   - Pure functions and constants only
 *   - No mutable global state beyond the exported namespace
 *   - All ACKS II rules baked into named constants with RAW citations
 *   - Stable IDs on every cross-referenced entity
 *   - Migration framework hook (empty at launch — v2 is the canonical baseline)
 *
 * Schema version 2 is a clean break from v1: previous saves will not load.
 * The new template set under Templates/ demonstrates the v2 shape end-to-end.
 *
 * See Schema_v2_Design.md and Data_Dictionary.md for the schema documentation.
 * ============================================================================= */
(function(global){
'use strict';

// =============================================================================
// 1. SCHEMA VERSION + ID GENERATION
// =============================================================================


// Errata §1.3 — Banker's rounding (half-to-even). RR r4 Introduction: "If not otherwise noted,
// round fractions to the nearest whole number, rounding fractions of 0.5 to the nearest even number".
// Used wherever we round a fractional gp/family value going forward; existing snapshots stay as-is.
function bankersRound(x){
  if(typeof x !== 'number' || !isFinite(x)) return Math.round(x);
  const truncated = Math.trunc(x);
  const frac = Math.abs(x - truncated);
  if(Math.abs(frac - 0.5) < 1e-9){
    if(truncated % 2 === 0) return truncated;
    return truncated + Math.sign(x || 1);
  }
  return Math.round(x);
}

// Round a gp amount to the nearest 5gp. Canonical home for the tribute-by-realm-families
// rounding policy (RR r4 errata §1.2: "tribute … rounds to nearest 5gp"). Lifted out of the
// UI (index.html) so the policy lives in one tested place rather than duplicated inline.
function roundToNearest5(gp){
  return Math.round((Number(gp) || 0) / 5) * 5;
}

const SCHEMA_VERSION = 2;

// ID prefix scheme — three-letter where possible, lowercased, dash-separated.
// When in doubt, look up via ID_PREFIXES rather than hardcoding.
const ID_PREFIXES = Object.freeze({
  campaign:             'cmp',
  domain:               'dom',
  character:            'chr',
  party:                'prt',
  hex:                  'hex',
  settlement:           'set',
  lair:                 'lai',
  dungeon:              'dun',
  pointOfInterest:      'poi',
  landImprovementProject:'lip',
  garrisonUnit:         'gar',
  specialist:           'spe',
  strongholdStructure:  'str',
  venture:              'vnt',
  passiveInvestment:    'inv',
  // Turn Cycle v2 (Foundation #178) — typed-event architecture
  event:                'evt',
  rumor:                'rum',
  // Phase 2.95 Stash A (2026-05-29) — Stash subsystem
  stash:                'stash',
  stashItem:            'si',
  // Wave A relation collections (Architecture.md §3.5) — landed alongside Stash A
  henchmanship:         'hen',
  specialistContract:   'spc',
  hirelingContract:     'hir',
  magistracy:           'mag',
  vassalage:            'vas',
  tributaryAgreement:   'trb',
  // Wave B.5 (Architecture.md §3.7) — Notable items + custody (2026-05-29)
  notableItem:          'itm',
  itemCustody:          'cus',
  // Group entity (Architecture.md §2.4) — count-level abstraction (#442, 2026-05-29)
  group:                'grp',
  // Phase 2.5 Journeys (#475) + Phase 2.95 Outposts (#395) — reserved 2026-05-30
  // Factories ship with their implementing phases; prefixes reserved now so IDs work
  // when the factories land.
  journey:              'jrn',
  outpost:              'out',
  // Wave E (Architecture.md §3.5) — Religion + Sanctums relation entities, reserved 2026-05-30
  congregation:         'con',
  divineFavor:          'dfv',
  attunement:           'att',
  // Wave F (Architecture.md §3.5) — Settlement Adventures relation entity, reserved 2026-05-30
  settlementVisit:      'svt',
  // Wave D (Architecture.md §3.5) + Phase 6 Codes shared — Oath relation entity, reserved 2026-05-30
  oath:                 'oth',
  // Phase 4 Construction Wave A (Architecture.md §10 — 2026-05-30) — Project + Constructible
  project:              'prj',
  constructible:        'cst'
});

function newId(prefix){
  if(!prefix) throw new Error('newId requires a prefix');
  // 7-char random suffix gives ~78 billion combinations per prefix — collision-resistant.
  return prefix + '-' + Math.random().toString(36).slice(2,9);
}

function slugify(s){
  return (s||'item').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')||('item-'+Date.now());
}

// =============================================================================
// 2. CORE TABLES & CONSTANTS (ACKS II RAW)
// =============================================================================

const DEFAULT_TAX_RATES = Object.freeze({ low: 1, standard: 2, high: 3, extortionate: 4 });

// RR p.348-349 — base morale penalty by classification
const REQUIRED_GARRISON_PER_FAMILY = Object.freeze({ Civilized: 2, Borderlands: 3, Outlands: 4 });

// Hex wilderness classification (RR p.340). Unsettled is the RAW name for hexes with no
// controlling domain (formerly "Unclaimed" in early development).
const HEX_CLASSIFICATIONS = Object.freeze(['Civilized','Borderlands','Outlands','Unsettled']);

// RR pp.349-351 — domain morale level names + flavor
const MORALE_LEVEL_NAMES = Object.freeze({
  '-4':'Rebellious','-3':'Defiant','-2':'Turbulent','-1':'Demoralized',
  '0':'Apathetic','1':'Loyal','2':'Dedicated','3':'Steadfast','4':'Stalwart'
});
const MORALE_EMOJI = Object.freeze({
  '-4':'🔥','-3':'⚔','-2':'😡','-1':'😟','0':'😐','1':'🙂','2':'😊','3':'⭐','4':'👑'
});

// Income reduction by morale per RR p.350. -4 → no income (rebellion), -3 → 50%, -2 → 80%.
const INCOME_FACTOR_BY_MORALE = Object.freeze({
  '-4':0,'-3':0.5,'-2':0.8,'-1':1,'0':1,'1':1,'2':1,'3':1,'4':1
});

// Full ACKS II RAW morale-level descriptions (RR pp.349-351) for the "State of Your Domain" panel
const MORALE_STATE_TEXT = Object.freeze({
  '-4':"The fires of rebellion burn! All rolls on the Vagaries tables are at -20. All vassal loyalty rolls are at -2 due to the ruler's uneasy grip on power. There is no population growth, and an extra 4d10 families per thousand are lost to illness, casualties, and emigration each month. Conscripts and militia cannot be levied. The able-bodied men (one per family) become bandits and begin to attack officials, trade caravans, troops, and travelers in the domain. With no workers, the domain's tax, land, trade, and service income drop to zero. Each month there is a cumulative 10% chance that an NPC emerges from the bandits to challenge the character's rule.",
  '-3':"The domain's inhabitants have become violently unhappy and defiant! Banditry, tax evasion, and disloyalty are widespread. All rolls on the Vagaries tables are at -10. All vassal loyalty rolls are at -1. An extra 3d10 families per thousand are lost to illness, casualties, and emigration each month. Conscripts and militia cannot be levied. Tax, land, trade, and service income are halved as one able-bodied man per two families becomes a bandit. Each month there is a cumulative 5% chance that an NPC emerges from the bandits to challenge the ruler.",
  '-2':"The domain is turbulent — in a state of dissatisfaction and unrest. All rolls on the Vagaries tables are at -5. An extra 2d10 families per thousand are lost to illness, casualties, and emigration each month. Conscripts and militia cannot be levied. Tax, land, trade, and service income are reduced by 20% as one able-bodied man per five families becomes a bandit. Each month there is a cumulative 1% chance that an NPC emerges from the bandits to challenge the ruler.",
  '-1':"The domain is demoralized. The populace sees the ruler as worse than average. An extra 1d10 families per thousand are lost to illness, casualties, and emigration each month. Conscripts and militia levied from the domain suffer a -1 decrease to their morale scores.",
  '0':"The domain is apathetic. The populace sees the ruler as just another petty noble. They work the land, pay their taxes, and do their duty, but have no special love for their ruler. Conscripts and militia levied from the domain suffer a -1 decrease to their morale scores.",
  '1':"The domain is loyal. The ruler is respected and popular with the subjects. Spies and thieves operating against the domain suffer a -1 penalty to their proficiency throws. The population grows by an extra 1d10 families per thousand each month.",
  '2':"The domain is dedicated. The populace has been inspired to strong loyalist sentiment by the ruler. Spies and thieves operating against the domain suffer a -2 penalty to their proficiency throws. The population grows by an extra 2d10 families per thousand each month. All rolls on the Vagaries of Recruitment tables are at +5.",
  '3':"The domain is steadfast. The inhabitants hail the ruler as a great leader deserving of strident support. The population grows by an extra 3d10 families per thousand each month. Spies and thieves operating against the domain suffer a -3 penalty to their proficiency throws. All rolls on the Vagaries of Recruitment tables are at +10. Conscripts and militia levied from the domain gain a +1 bonus to their morale scores. All vassal loyalty rolls are at +1.",
  '4':"The domain is stalwart! The populace acclaims the ruler as a beloved and righteous sovereign. The population grows by an extra 4d10 families per thousand each month. Spies and thieves operating against the domain suffer a -4 penalty to their proficiency throws. Conscripts and militia levied from the domain gain a +1 bonus to their morale scores. All rolls on the Vagaries of Recruitment tables are at +20. All vassal loyalty rolls are at +2 due to the ruler's secure base of power."
});

// Stronghold minimum value per controlled hex (ACKS II RAW p.339)
const STRONGHOLD_VALUE_PER_HEX = 15000;

// =============================================================================
// 3. MARKET CLASS + URBAN MECHANICS (RR pp.350-351)
// =============================================================================

const MARKET_CLASS_TABLE = Object.freeze([
  { min: 20000, max: Infinity, class: 'I',  tradePerFamily: 2.5 },
  { min:  5000, max:  19999,   class: 'II', tradePerFamily: 2.0 },
  { min:  2500, max:   4999,   class: 'III',tradePerFamily: 1.5 },
  { min:   500, max:   2499,   class: 'IV', tradePerFamily: 1.5 },
  { min:   250, max:    499,   class: 'V',  tradePerFamily: 1.5 },
  { min:    75, max:    249,   class: 'VI', tradePerFamily: 1.0 },
  { min:     0, max:     74,   class: 'VI*',tradePerFamily: 0   }  // hamlet — Class VI market at stronghold only
]);
function lookupMarketClass(urbanFamilies){
  const n = urbanFamilies || 0;
  return MARKET_CLASS_TABLE.find(row => n >= row.min && n <= row.max) || MARKET_CLASS_TABLE[MARKET_CLASS_TABLE.length-1];
}

// Founding Settlements / Maximum Population from total urban investment (ACKS II RR p.350)
const URBAN_INVESTMENT_TIERS = Object.freeze([
  { investment: 2500000, maxFamilies: 100000 },
  { investment:  625000, maxFamilies:  19999 },
  { investment:  200000, maxFamilies:   4999 },
  { investment:   75000, maxFamilies:   2499 },
  { investment:   25000, maxFamilies:    499 },
  { investment:   10000, maxFamilies:    249 }
]);
function urbanMaxFamilies(totalInvestment){
  const inv = totalInvestment || 0;
  for (const tier of URBAN_INVESTMENT_TIERS) if (inv >= tier.investment) return tier.maxFamilies;
  return 0;
}

// Villages, Towns, and Cities Benchmarks (ACKS RR p.351)
const SETTLEMENT_BENCHMARKS = Object.freeze([
  { min:     0, max:     74, type:'Hamlet',         marketClass:'VI*', incomeMin:      0, incomeMax:      0 },
  { min:    75, max:     99, type:'Small Village',  marketClass:'VI',  incomeMin:    150, incomeMax:    199 },
  { min:   100, max:    159, type:'Village',        marketClass:'VI',  incomeMin:    200, incomeMax:    319 },
  { min:   160, max:    249, type:'Village',        marketClass:'VI',  incomeMin:    320, incomeMax:    624 },
  { min:   250, max:    499, type:'Large Village',  marketClass:'V',   incomeMin:    625, incomeMax:  1249 },
  { min:   500, max:    624, type:'Small Town',     marketClass:'IV',  incomeMin:  1250, incomeMax:  1559 },
  { min:   625, max:   1249, type:'Large Town',     marketClass:'IV',  incomeMin:  1560, incomeMax:  3124 },
  { min:  1250, max:   2499, type:'Small City',     marketClass:'IV',  incomeMin:  3125, incomeMax:  6249 },
  { min:  2500, max:   4999, type:'City',           marketClass:'III', incomeMin:  6250, incomeMax: 14999 },
  { min:  5000, max:   9999, type:'Large City',     marketClass:'II',  incomeMin: 15000, incomeMax: 29999 },
  { min: 10000, max:  14999, type:'Large City',     marketClass:'II',  incomeMin: 30000, incomeMax: 44999 },
  { min: 15000, max:  19999, type:'Large City',     marketClass:'II',  incomeMin: 45000, incomeMax: 69999 },
  { min: 20000, max:  39999, type:'Metropolis',     marketClass:'I',   incomeMin: 70000, incomeMax:139999 },
  { min: 40000, max: Infinity, type:'Metropolis',   marketClass:'I',   incomeMin:140000, incomeMax: Infinity }
]);
function lookupSettlementBenchmark(families){
  const n = families || 0;
  return SETTLEMENT_BENCHMARKS.find(b => n >= b.min && n <= b.max) || SETTLEMENT_BENCHMARKS[0];
}

// =============================================================================
// 4. TITLES OF NOBILITY (RR p.345)
// =============================================================================

const TITLES_OF_NOBILITY = Object.freeze([
  { tier:8, common:'Emperor',  aural:'Tarkaun', argollean:'Ard-rí',         somirean:'Maharaja',  jutlandic:'High King',
    personalMin:12500, vassalsMin:5461,  realmMin:2000000 },
  { tier:7, common:'King',     aural:'Exarch',  argollean:'Rí-ruirech',     somirean:'Raja',      jutlandic:'King',
    personalMin:12500, vassalsMin:1365,  realmMin:364000 },
  { tier:6, common:'Prince',   aural:'Prefect', argollean:'Rí',             somirean:'Deshmukh',  jutlandic:'Prince',
    personalMin:7500,  vassalsMin:341,   realmMin:87000 },
  { tier:5, common:'Duke',     aural:'Palatine',argollean:'Ard-tigerna',    somirean:'Nawab',     jutlandic:'Jarl',
    personalMin:1500,  vassalsMin:85,    realmMin:20000 },
  { tier:4, common:'Count',    aural:'Legate',  argollean:'Tigerna',        somirean:'Subhedar',  jutlandic:'Hersir',
    personalMin:750,   vassalsMin:21,    realmMin:4300 },
  { tier:3, common:'Viscount', aural:'Decurion',argollean:'Tánaiste',       somirean:'Thanedar',  jutlandic:'Karl',
    personalMin:250,   vassalsMin:5,     realmMin:950 },
  { tier:2, common:'Baron',    aural:'Tribune', argollean:'Tiarna',         somirean:'Zamindar',  jutlandic:'Bondi',
    personalMin:75,    vassalsMin:1,     realmMin:175 },
  { tier:1, common:'Knight',   aural:'Decanus', argollean:'Triath',         somirean:'Jagirdar',  jutlandic:'Thegn',
    personalMin:25,    vassalsMin:0,     realmMin:25 },
  { tier:0, common:'Squire',   aural:'Eques',   argollean:'Saoi',           somirean:'Patel',     jutlandic:'Karl',
    personalMin:0,     vassalsMin:0,     realmMin:0 }
]);
function lookupTitleOfNobility(personalFamilies, vassalCount, totalRealmFamilies){
  for(const t of TITLES_OF_NOBILITY){
    let met = 0;
    if((personalFamilies||0) >= t.personalMin) met++;
    if((vassalCount||0) >= t.vassalsMin) met++;
    if((totalRealmFamilies||0) >= t.realmMin) met++;
    if(met >= 2) return t;
  }
  return TITLES_OF_NOBILITY[TITLES_OF_NOBILITY.length - 1];
}

// =============================================================================
// 5. CHARACTER MECHANICS — XP, HD, saves, PA, GP threshold
// =============================================================================

const SAVE_TABLES = Object.freeze({
  fighter: [null,
    [13,14,15,16,17], [12,13,14,15,16], [12,13,14,15,16],
    [11,12,13,14,15], [10,11,12,13,14], [10,11,12,13,14],
    [9,10,11,12,13],  [8,9,10,11,12],   [8,9,10,11,12],
    [7,8,9,10,11],    [6,7,8,9,10],     [6,7,8,9,10],
    [5,6,7,8,9],      [4,5,6,7,8]
  ],
  mage: [null,
    [13,13,15,11,12], [13,13,15,11,12], [13,13,15,11,12],
    [12,12,14,10,11], [12,12,14,10,11], [12,12,14,10,11],
    [11,11,13,9,10],  [11,11,13,9,10],  [11,11,13,9,10],
    [10,10,12,8,9],   [10,10,12,8,9],   [10,10,12,8,9],
    [9,9,11,7,8],     [9,9,11,7,8]
  ],
  cleric: [null,
    [13,10,16,13,15], [13,10,16,13,15], [12,9,15,12,14],
    [12,9,15,12,14],  [11,8,14,11,13],  [11,8,14,11,13],
    [10,7,13,10,12],  [10,7,13,10,12],  [9,6,12,9,11],
    [9,6,12,9,11],    [8,5,11,8,10],    [8,5,11,8,10],
    [7,4,10,7,9],     [7,4,10,7,9]
  ],
  thief: [null,
    [13,13,13,14,15], [13,13,13,14,15], [12,12,12,13,14],
    [12,12,12,13,14], [11,11,11,12,13], [11,11,11,12,13],
    [10,10,10,11,12], [10,10,10,11,12], [9,9,9,10,11],
    [9,9,9,10,11],    [8,8,8,9,10],     [8,8,8,9,10],
    [7,7,7,8,9],      [7,7,7,8,9]
  ]
});

const CLASS_TO_SAVE_ARCHETYPE = Object.freeze({
  'fighter':'fighter','barbarian':'fighter','paladin':'fighter','explorer':'fighter',
  'dwarven vaultguard':'fighter','vaultguard':'fighter',
  'elven spellsword':'fighter','spellsword':'fighter',
  'mage':'mage','wizard':'mage','warlock':'mage',
  'nobiran wonderworker':'mage','wonderworker':'mage',
  'cleric':'cleric','crusader':'cleric','priestess':'cleric','priest':'cleric',
  'shaman':'cleric','bladedancer':'cleric',
  'dwarven craftpriest':'cleric','craftpriest':'cleric',
  'thief':'thief','assassin':'thief','venturer':'thief',
  'elven nightblade':'thief','nightblade':'thief',
  'bard':'thief'
});

function classKey(className){return String(className||'').toLowerCase().trim();}
function classSaveArchetype(className){
  if(!className) return null;
  return CLASS_TO_SAVE_ARCHETYPE[classKey(className)] || null;
}
function computeSavingThrows(character){
  if(!character) return null;
  const archetype = classSaveArchetype(character.class);
  if(!archetype) return null;
  const lvl = Math.max(1, Math.min(14, Math.floor(character.level||1)));
  const row = SAVE_TABLES[archetype][lvl];
  if(!row) return null;
  return { paralysis: row[0], death: row[1], blast: row[2], implements: row[3], spells: row[4], _archetype: archetype };
}

// Personal Authority brackets (RR p.350) — also serve as GP Threshold per level (RR p.423).
const PERSONAL_AUTHORITY_BRACKETS = Object.freeze(
  [25, 75, 150, 300, 600, 1200, 2400, 5000, 10000, 20000, 45000, 75000, 150000, 425000]
);
function personalAuthorityBracketForIncome(gp){
  const v = gp || 0;
  for(let i = 0; i < PERSONAL_AUTHORITY_BRACKETS.length; i++){
    if(v <= PERSONAL_AUTHORITY_BRACKETS[i]) return i;
  }
  return PERSONAL_AUTHORITY_BRACKETS.length;
}
// `monthlyDomainIncome` per RR canonical definition (p.423): revenue − expenses,
// morale-adjusted. Same input as the XP threshold comparison. PA shifts with morale because
// morale is a real adjustment to actual income per RR p.350 income table — a domain in
// rebellion politically shrinks too.
function computePersonalAuthority(level, monthlyDomainIncome){
  const col = personalAuthorityBracketForIncome(monthlyDomainIncome);
  const lvl = Math.max(0, Math.min(14, Math.floor(level || 0)));
  return Math.max(-4, Math.min(+4, lvl - col - 1));
}
function computeGpThreshold(level){
  const lvl = Math.max(1, Math.min(14, Math.floor(level || 1)));
  return PERSONAL_AUTHORITY_BRACKETS[lvl - 1];
}

// XP progression per class (cumulative XP needed to ATTAIN that level).
// Source: ACKS II Revised Rulebook class entries.
const XP_PROGRESSION = Object.freeze({
  fighter:   [null,0,2000,4000,8000,16000,32000,65000,130000,250000,370000,490000,610000,730000,850000],
  paladin:   [null,0,2200,4400,8800,17500,35000,70000,140000,280000,400000,520000,640000,760000,880000],
  barbarian: [null,0,1900,3800,7600,15000,30000,60000,120000,240000,360000,480000,600000,720000,840000],
  mage:      [null,0,2500,5000,10000,20000,40000,80000,160000,310000,460000,610000,760000,910000,1060000],
  warlock:   [null,0,2500,5000,10000,20000,40000,80000,160000,310000,460000,610000,760000,910000,1060000],
  cleric:    [null,0,1500,3000,6000,12000,24000,50000,100000,200000,300000,400000,500000,600000,700000],
  crusader:  [null,0,1500,3000,6000,12000,24000,50000,100000,200000,300000,400000,500000,600000,700000],
  priestess: [null,0,2000,4000,8000,16000,32000,65000,130000,230000,330000,430000,530000,630000,730000],
  bladedancer:[null,0,1750,3500,7000,14000,28000,58000,115000,225000,335000,445000,555000,665000,775000],
  shaman:    [null,0,1750,3500,7000,14000,28000,58000,115000,225000,335000,445000,555000,665000,775000],
  thief:     [null,0,1250,2500,5000,10000,20000,40000,80000,180000,280000,380000,480000,580000,680000],
  assassin:  [null,0,1500,3000,6000,12000,25000,50000,100000,200000,300000,400000,500000,600000,700000],
  venturer:  [null,0,1500,3000,6000,12000,24000,50000,100000,200000,300000,400000,500000,600000,700000],
  bard:      [null,0,1500,3000,6000,12000,25000,50000,100000,220000,340000,460000,580000,700000,820000], // r4 errata §2.3 — matches Assassin to L8, then +120k/level
  explorer:  [null,0,2000,4000,8000,16000,32000,65000,130000,250000,370000,490000,610000,730000,850000],
  wizard:    [null,0,2500,5000,10000,20000,40000,80000,160000,310000,460000,610000,760000,910000,1060000]
});
const CLASS_HD = Object.freeze({
  fighter:   {sides:8, flatBonusAfter9:2},
  paladin:   {sides:8, flatBonusAfter9:2},
  barbarian: {sides:8, flatBonusAfter9:2},
  explorer:  {sides:6, flatBonusAfter9:2},
  mage:      {sides:4, flatBonusAfter9:1},
  warlock:   {sides:4, flatBonusAfter9:1},
  wizard:    {sides:4, flatBonusAfter9:1},
  cleric:    {sides:6, flatBonusAfter9:1},
  crusader:  {sides:6, flatBonusAfter9:1},
  priestess: {sides:4, flatBonusAfter9:1},
  bladedancer:{sides:6, flatBonusAfter9:1},
  shaman:    {sides:6, flatBonusAfter9:1},
  thief:     {sides:4, flatBonusAfter9:2},
  assassin:  {sides:6, flatBonusAfter9:2},
  venturer:  {sides:6, flatBonusAfter9:2},
  bard:      {sides:6, flatBonusAfter9:2}
});
function xpForLevel(className, level){
  const tab = XP_PROGRESSION[classKey(className)];
  if(!tab) return null;
  if(level <= 0) return 0;
  if(level >= 15) return Infinity;
  return tab[level] ?? null;
}
function xpToNextLevel(character){
  if(!character) return null;
  const lvl = Math.max(1, Math.floor(character.level||1));
  if(lvl >= 14) return null;
  return xpForLevel(character.class, lvl + 1);
}
function rollHpForLevel(className, levelGained, conMod){
  const hd = CLASS_HD[classKey(className)] || {sides:6, flatBonusAfter9:1};
  if(levelGained <= 9){
    const die = 1 + Math.floor(Math.random() * hd.sides);
    return Math.max(1, die + (conMod||0));
  }
  return hd.flatBonusAfter9;
}
function abilityMod(score){
  if(score>=18)return 3; if(score>=16)return 2; if(score>=13)return 1;
  if(score>=9)return 0;  if(score>=6)return -1; if(score>=4)return -2;
  return -3;
}
function computeHenchmanCap(character){
  return Math.max(0, abilityMod(character?.abilities?.CHA || 10) + 4);
}

// =============================================================================
// 6. DICE / RANDOMNESS HELPERS
// =============================================================================

function rollD6(){return 1+Math.floor(Math.random()*6);}
function rollD20(){return 1+Math.floor(Math.random()*20);}
function rollD10x(n){
  let total=0;
  for(let i=0;i<n;i++){
    let r=1+Math.floor(Math.random()*10);
    let sum=r;
    while(r===10){r=1+Math.floor(Math.random()*10);sum+=r;}
    total+=sum;
  }
  return total;
}
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}

function rollNaturalIncrease(familiesK,moraleAfter){
  if(moraleAfter<=-4)return 0;
  return rollD10x(familiesK);
}
function rollNaturalDecrease(familiesK){return rollD10x(familiesK);}
function rollMoraleExtra(moraleAfter,familiesK){
  const absMor=Math.abs(moraleAfter);
  if(absMor===0)return 0;
  const sum=rollD10x(absMor*familiesK);
  return moraleAfter>0?sum:-sum;
}

// =============================================================================
// Foundation #241 — Rural population reconciliation.
// `d.demographics.peasantFamilies` and `hex.families` (rural hexes) must always
// agree. The canonical single-source-of-truth setter is `setPeasantPopulation()`.
// Direct writes to either field are forbidden in new code — use this helper
// instead. Existing call sites that mutate `peasantFamilies` directly are being
// migrated; any leftover drift is corrected at load time by `reconcileRuralPopulation`.
//
// Distribution rule: a population delta lands on rural hexes (those without a
// `settlement`) weighted by their current `families`. If all rural hexes are
// empty, the delta is split as evenly as possible. Urban settlement families
// are tracked separately on `hex.settlement.families` and are not touched here.
// =============================================================================
function _ruralHexes(d){
  return ((d && d.geography && d.geography.hexes) || []).filter(h => !h.settlement);
}
function _redistributeRuralFamilies(d, newTotal){
  const hexes = _ruralHexes(d);
  if(hexes.length === 0) return;
  newTotal = Math.max(0, Math.floor(newTotal));
  if(newTotal === 0){
    hexes.forEach(h => { h.families = 0; });
    return;
  }
  const weights = hexes.map(h => Math.max(0, h.families || 0));
  const weightSum = weights.reduce((s,w) => s+w, 0);
  if(weightSum === 0){
    // Even split (with remainder going to first hexes).
    const per = Math.floor(newTotal / hexes.length);
    const remainder = newTotal - per * hexes.length;
    hexes.forEach((h, i) => { h.families = per + (i < remainder ? 1 : 0); });
    return;
  }
  // Proportional distribution. Use a running accumulator so rounding settles to exactly newTotal.
  let allocated = 0;
  hexes.forEach((h, i) => {
    if(i === hexes.length - 1){
      h.families = Math.max(0, newTotal - allocated);
    } else {
      const share = Math.round(newTotal * weights[i] / weightSum);
      h.families = Math.max(0, share);
      allocated += h.families;
    }
  });
}
function setPeasantPopulation(d, newTotal){
  if(!d || !d.demographics) return;
  newTotal = Math.max(0, Math.floor(newTotal));
  d.demographics.peasantFamilies = newTotal;
  _redistributeRuralFamilies(d, newTotal);
}
// On load, if peasantFamilies and sum(rural hex.families) disagree, reconcile.
// Trust peasantFamilies (it's been actively maintained by monthly commits) and
// redistribute across hexes by current weight. Returns the number of domains touched.
function reconcileRuralPopulation(campaign){
  if(!campaign || !Array.isArray(campaign.domains)) return 0;
  let fixed = 0;
  campaign.domains.forEach(d => {
    const hexes = _ruralHexes(d);
    if(hexes.length === 0) return;
    const pf = (d.demographics && d.demographics.peasantFamilies) || 0;
    const hexSum = hexes.reduce((s,h) => s + (h.families||0), 0);
    if(pf !== hexSum){
      _redistributeRuralFamilies(d, pf);
      fixed++;
    }
  });
  return fixed;
}
function moraleChangeFromRoll(adjusted,currentMorale,baseMorale){
  if(adjusted<=2)return -2;
  if(adjusted<=5)return -1;
  if(adjusted<=8){if(currentMorale===baseMorale)return 0;return currentMorale<baseMorale?1:-1;}
  if(adjusted<=11)return 1;
  return 2;
}
function baseMoraleFromClassification(classification,ruler){
  let base=0;
  if(classification==='Borderlands')base-=1;
  if(classification==='Outlands')base-=2;
  if(ruler&&typeof ruler.personalAuthority==='number')base+=ruler.personalAuthority;
  return base;
}

// RR p.349 — stronghold-adequacy morale penalty. A domain whose stronghold value falls
// below the minimum (15,000gp per controlled hex, RR p.348) takes a morale-roll penalty by
// band: at/above min → 0; ≥½ → −1; ≥¼ → −2; below ¼ → −3. Bands mirror the UI's
// strongholdState() so the *displayed* adequacy and the *applied* penalty never diverge
// (the bug this fixes: the UI showed "−1 base morale" but the roll ignored it). The UI
// computes value + required (house-rule + catalog aware) and passes the two numbers here.
function strongholdMoralePenalty(strongholdValue, strongholdRequired){
  const req = Number(strongholdRequired) || 0;
  if(req <= 0) return 0;                 // no hexes claimed → no requirement
  const val = Number(strongholdValue) || 0;
  if(val >= req)     return 0;
  if(val >= req / 2) return -1;
  if(val >= req / 4) return -2;
  return -3;
}

// RR p.340 — domain classification (Civilized / Borderlands / Outlands) is ultimately a GM
// judgment: RAW turns on settlement density + proximity, which the tool can't see. So the
// GM's stored domain.classification WINS; the families/morale/hexes heuristic is only a
// suggestion. (Bug this fixes: the UI derived classification and ignored the authored value,
// so the demo's authored-Borderlands march was treated Civilized — wrong garrison rate +
// base morale, with no way for the GM to correct it.)
const DOMAIN_CLASSIFICATIONS = Object.freeze(['Civilized', 'Borderlands', 'Outlands']);
function suggestDomainClassification(d){
  const fam    = (d && d.demographics && d.demographics.peasantFamilies) || 0;
  const morale = (d && d.demographics && d.demographics.morale) || 0;
  const hexes  = (d && d.geography && d.geography.controlledHexes) || 0;
  if(morale >= 1 && (fam >= 375 || (fam >= 1200 && hexes >= 7))) return 'Civilized';
  if(fam >= 75) return 'Borderlands';
  return 'Outlands';
}
function effectiveDomainClassification(d){
  const stored = d && d.classification;
  if(stored && DOMAIN_CLASSIFICATIONS.indexOf(stored) !== -1) return stored; // GM authored value wins
  return suggestDomainClassification(d);
}

// =============================================================================
// 6.5 REFERENCE DATA CATALOGS — MOVED to acks-engine-catalogs.js (2026-05-28).
// Loaded as a separate <script> tag before this file in index.html. The
// symbols are accessible via global.ACKS (e.g. global.ACKS.rollVagary()).
// =============================================================================

// =============================================================================
// 7. ENTITY FACTORIES — MOVED to acks-engine-entities.js (2026-05-28).
// Loaded as a separate <script> tag after this file. Symbols accessible via
// global.ACKS at runtime.
// =============================================================================

// =============================================================================
// 8. VALIDATION
// =============================================================================
// validate* functions return { ok:boolean, errors:[string] }. Used at file load
// to verify a campaign before showing it to the user.

function validateCampaign(campaign){
  const errors = [];
  if(!campaign || typeof campaign !== 'object') return { ok:false, errors:['Not an object'] };
  if(campaign.kind !== 'campaign') errors.push('Root is not kind:"campaign"');
  if(campaign.schemaVersion !== SCHEMA_VERSION) errors.push('Expected schemaVersion '+SCHEMA_VERSION+', got '+campaign.schemaVersion);
  if(!campaign.id) errors.push('Missing campaign id');
  // Foundation #234 dropped campaign.log[]; Campaign Log view derives from eventLog.
  ['domains','characters','parties','ventures','passiveInvestments'].forEach(field => {
    if(!Array.isArray(campaign[field])) errors.push('campaign.'+field+' must be an array');
  });
  // Foundation #193 — new top-level collections. Tolerated if absent (migration creates them on load),
  // but if present must be arrays.
  ['hexes','settlements','rumors','pendingEvents','eventLog','log'].forEach(field => {
    if(campaign[field] !== undefined && !Array.isArray(campaign[field])) errors.push('campaign.'+field+' must be an array if present');
  });
  // Check entity-level invariants
  const idErrors = validateUniqueIds(campaign);
  errors.push(...idErrors);
  const hexErrors = validateHexCoordUniqueness(campaign);
  errors.push(...hexErrors);
  return { ok: errors.length === 0, errors };
}

function validateUniqueIds(campaign){
  const errors = [];
  function checkCollection(arr, label){
    if(!Array.isArray(arr)) return;
    const seen = new Set();
    arr.forEach((entity, i) => {
      if(!entity || !entity.id){ errors.push(label+'['+i+'] missing id'); return; }
      if(seen.has(entity.id)) errors.push('Duplicate id "'+entity.id+'" in '+label);
      seen.add(entity.id);
    });
  }
  checkCollection(campaign.domains, 'domains');
  checkCollection(campaign.characters, 'characters');
  checkCollection(campaign.parties, 'parties');
  checkCollection(campaign.ventures, 'ventures');
  checkCollection(campaign.passiveInvestments, 'passiveInvestments');
  // Per-domain sub-collections
  (campaign.domains||[]).forEach(d => {
    const dl = 'domain['+d.id+']';
    checkCollection(d.garrison?.units, dl+'.garrison.units');
    checkCollection(d.specialists, dl+'.specialists');
    checkCollection(d.stronghold?.structures, dl+'.stronghold.structures');
    checkCollection(d.geography?.hexes, dl+'.geography.hexes');
    // Per-hex sub-collections
    (d.geography?.hexes||[]).forEach(h => {
      const hl = dl+'.hex['+h.id+']';
      checkCollection(h.lairs, hl+'.lairs');
      checkCollection(h.dungeons, hl+'.dungeons');
      checkCollection(h.pointsOfInterest, hl+'.pointsOfInterest');
      checkCollection(h.landImprovementProjects, hl+'.landImprovementProjects');
      if(h.settlement && !h.settlement.id) errors.push(hl+'.settlement missing id');
    });
  });
  return errors;
}

function validateHexCoordUniqueness(campaign){
  // Hex (q,r) coords must be unique within the campaign — even across domains.
  const errors = [];
  const seen = new Map(); // key "q,r" -> hexId
  (campaign.domains||[]).forEach(d => {
    (d.geography?.hexes||[]).forEach(h => {
      const key = (h.coord?.q||0)+','+(h.coord?.r||0);
      if(seen.has(key)) errors.push('Duplicate hex coord ('+key+'): '+seen.get(key)+' and '+h.id);
      else seen.set(key, h.id);
    });
  });
  return errors;
}

// =============================================================================
// 9. MIGRATION FRAMEWORK
// =============================================================================
// MIGRATIONS is an ordered list of { from, to, run(campaign) } steps. v2 launches
// with an empty list — any save with schemaVersion < 2 is rejected outright via
// the loader's friendly-error path. Future schema bumps will register a single
// entry here per version transition.

const MIGRATIONS = [
  // Example shape (DO NOT activate at v2 launch):
  // { from: 2, to: 3, run: function(c){ /* in-place transforms */ return c; } }
];

function migrateCampaign(raw){
  if(!raw || typeof raw !== 'object'){
    throw new Error('migrateCampaign: input is not an object');
  }
  if(typeof raw.schemaVersion !== 'number'){
    throw new Error('Save file missing schemaVersion; cannot migrate. Start fresh from a Templates/ file.');
  }
  if(raw.schemaVersion < SCHEMA_VERSION && MIGRATIONS.length === 0){
    throw new Error('Save file is schemaVersion '+raw.schemaVersion+' but engine is v'+SCHEMA_VERSION+'. v2 is a clean break — open a new campaign from Templates/.');
  }
  // Walk MIGRATIONS in order. Each step bumps from X to X+1.
  // (No early-return on already-current schema — the idempotent post-migration steps
  // below need to run on every load, including the Foundation #241 population reconcile.)
  let current = raw;
  let safety = 0;
  while(current.schemaVersion < SCHEMA_VERSION){
    if(safety++ > 50) throw new Error('Migration loop overflow');
    const step = MIGRATIONS.find(m => m.from === current.schemaVersion);
    if(!step) throw new Error('No migration step from schemaVersion '+current.schemaVersion);
    current = step.run(current);
    current.schemaVersion = step.to;
  }
  // Foundation #234 — drop legacy campaign.log[]. The Campaign Log view now derives
  // from eventLog. The string-only narrative entries the old field captured are not
  // preserved (eventLog already has structured equivalents for everything that matters).
  // Idempotent: subsequent loads find the field already gone and skip cleanly.
  if(Array.isArray(current.log)){
    delete current.log;
  }
  // Foundation #241 — reconcile rural population drift. Pre-fix campaigns may have
  // peasantFamilies ≠ sum(rural hex.families) because the old monthly commit only updated
  // the domain-level field. Idempotent: a no-op on already-consistent data.
  reconcileRuralPopulation(current);
  // Foundation #244 — strip mining-tagged income.other entries when the dwarven-mining
  // house rule is off. See `stripUnusedMiningEntries` helper below; this call covers any
  // domains stored inside `current.domains`. Callers that store domains separately (e.g. the
  // Alpine UI splits `this.currentCampaign.domains` and `this.domains` apart) must also call
  // `stripUnusedMiningEntries(separateDomainsArray, current.houseRules)` after migration.
  stripUnusedMiningEntries(current.domains || [], current.houseRules || {});
  // Phase #440 stage 1 — additive five-axis classification migration. Idempotent.
  // Walks campaign.characters[] and ensures every character has the canonical
  // controlledBy / socialTier / lifecycleState / creatureTypes / isEnchantedCreature
  // / hitDice fields. Legacy c.kind is preserved through stage 1 for display-string
  // compat; stage 2 will land the deletion after the index.html sweep.
  migrateAllCharacterClassification(current);
  // #445 — Wave A relation backfill. Idempotent. Lifts character.liegeCharacterId,
  // domain.magistrates, domain.liegeId, domain.expenses.tributeToLiege into
  // henchmanships / specialistContracts / hirelingContracts / magistracies /
  // vassalages / tributaryAgreements records. Additive; legacy fields preserved.
  migrateLegacyToWaveARelations(current);
  // #468 — Stash A.3 — materialize domain.treasury scalar into treasury-stash
  // entities for each domain. Gated on inventory-stash-system house rule.
  // Idempotent. Per Phase_2.95_Stash_Plan.md §6.3.
  migrateAllDomainTreasuries(current);
  // #469 — Stash A.4 — item-consolidation reconcile + treasury-scalar reconcile.
  // Idempotent. Tidies legacy multi-entry stashes (e.g. multiple gp coin entries
  // from pre-A.2 data) and catches any scalar drift from external writers.
  reconcileAllStashes(current);
  reconcileTreasuryScalars(current);
  // 2026-05-30 post-survey scope reservations — lazy backfill of additive fields.
  // Idempotent. Ensures Campaign/Hex/Character/Settlement/Event new optional fields
  // exist on legacy saves. See Data_Dictionary.md §13.2 + §13.3.
  lazyDefaultV1ScopeReservations(current);
  // Wave Construction-B — backfill agricultural improvements onto Project entities. Runs after
  // lazyDefaultV1ScopeReservations (which guarantees campaign.projects[]) and reads campaign.hexes
  // (canonical top-level collection). Idempotent. See migrateAgriculturalToProjects below.
  migrateAgriculturalToProjects(current);
  return current;
}

// 2026-05-30 — Lazy backfill of additive optional fields reserved during the
// post-RAW-survey scope pass. None of these are functional yet (their consumer
// subsystems ship in v1.0); they exist so the schema is stable and integrators
// can preserve them on round-trip. See Data_Dictionary.md §13.2 + §13.3.
function lazyDefaultV1ScopeReservations(campaign){
  if(!campaign || typeof campaign !== 'object') return campaign;
  // Campaign-level day-tick clock (Phase 2.95 Calendar #478)
  if(typeof campaign.currentDayInMonth !== 'number') campaign.currentDayInMonth = 1;
  // Reserved top-level collections (Architecture.md §3.5 Waves E + F + Wave D oaths)
  if(!Array.isArray(campaign.dungeons))           campaign.dungeons = [];
  if(!Array.isArray(campaign.journeys))           campaign.journeys = [];
  if(!Array.isArray(campaign.outposts))           campaign.outposts = [];
  if(!Array.isArray(campaign.congregations))      campaign.congregations = [];
  if(!Array.isArray(campaign.divineFavors))       campaign.divineFavors = [];
  if(!Array.isArray(campaign.attunements))        campaign.attunements = [];
  if(!Array.isArray(campaign.settlementVisits))   campaign.settlementVisits = [];
  if(!Array.isArray(campaign.oaths))              campaign.oaths = [];
  if(!Array.isArray(campaign.vagaryOfIncursionEvents)) campaign.vagaryOfIncursionEvents = [];
  // Phase 4 Construction Wave A (Architecture.md §10 — 2026-05-30)
  if(!Array.isArray(campaign.projects))       campaign.projects       = [];
  if(!Array.isArray(campaign.constructibles)) campaign.constructibles = [];
  // v0.9.1 (#544) — Backfill garrison-unit ids on v0.9 saves (the "+ add unit" button
  // pre-fix shipped units without ids, which broke the gm-fiat editable-stat flow).
  if(Array.isArray(campaign.domains)){
    for(const d of campaign.domains){
      const units = d && d.garrison && d.garrison.units;
      if(Array.isArray(units)){
        for(const u of units){
          if(u && !u.id){ u.id = newId(ID_PREFIXES.garrisonUnit); }
        }
      }
    }
  }
  if(Array.isArray(campaign.characters)){
    for(const c of campaign.characters){
      const units = c && c.mercenaryCompany && c.mercenaryCompany.units;
      if(Array.isArray(units)){
        for(const u of units){
          if(u && !u.id){ u.id = newId(ID_PREFIXES.garrisonUnit); }
        }
      }
    }
  }
  // v0.9.1 (#546) — RAW correction: ACKS II uses Will (WIL), not Wisdom (WIS).
  // RR p.17: "Will (WIL): This attribute measures mental fortitude..." 5d6/4d6/3d6 attr
  // table uses WIL as the third score. Rename existing characters' abilities.WIS → WIL.
  if(Array.isArray(campaign.characters)){
    for(const c of campaign.characters){
      if(c && c.abilities && typeof c.abilities.WIS === 'number' && typeof c.abilities.WIL !== 'number'){
        c.abilities.WIL = c.abilities.WIS;
        delete c.abilities.WIS;
      }
    }
  }
  // v0.9.1 (#521 #522) — backfill Party actor fields + Settlement M&M arrays on load.
  if(Array.isArray(campaign.parties)){
    for(const pt of campaign.parties){
      if(!pt) continue;
      if(typeof pt.status === 'undefined')             pt.status = 'active';
      if(typeof pt.activeJourneyId === 'undefined')    pt.activeJourneyId = null;
      if(typeof pt.formedAtTurn === 'undefined')       pt.formedAtTurn = null;
      if(typeof pt.disbandedAtTurn === 'undefined')    pt.disbandedAtTurn = null;
      if(typeof pt.currentSettlementId === 'undefined') pt.currentSettlementId = null;
      if(!Array.isArray(pt.history))                   pt.history = [];
    }
  }
  if(Array.isArray(campaign.settlements)){
    for(const st of campaign.settlements){
      if(!st) continue;
      if(!Array.isArray(st.entryways))       st.entryways = [];
      if(!Array.isArray(st.regulatedAssets)) st.regulatedAssets = [];
    }
  }
  // Per-hex new fields
  if(Array.isArray(campaign.hexes)){
    for(const h of campaign.hexes){
      if(!h) continue;
      if(typeof h.economyType !== 'string') h.economyType = 'agricultural';
      if(typeof h.terrainTransformationState === 'undefined') h.terrainTransformationState = null;
    }
  }
  // Per-character new fields
  if(Array.isArray(campaign.characters)){
    for(const c of campaign.characters){
      if(!c) continue;
      if(typeof c.heroicCode === 'undefined')          c.heroicCode = null;
      if(typeof c.fatePoints === 'undefined')          c.fatePoints = null;
      if(typeof c.transformationState === 'undefined') c.transformationState = null;
    }
  }
  // Per-settlement new fields
  if(Array.isArray(campaign.settlements)){
    for(const s of campaign.settlements){
      if(!s) continue;
      if(!Array.isArray(s.placesOfPower)) s.placesOfPower = [];
    }
  }
  // Per-event new fields (back-compat for events written before cadence existed)
  if(Array.isArray(campaign.eventLog)){
    for(const e of campaign.eventLog){
      if(!e || typeof e !== 'object') continue;
      if(typeof e.cadence !== 'string') e.cadence = 'monthly-turn';
      if(typeof e.subdayContext === 'undefined') e.subdayContext = null;
    }
  }
  if(Array.isArray(campaign.pendingEvents)){
    for(const e of campaign.pendingEvents){
      if(!e || typeof e !== 'object') continue;
      if(typeof e.cadence !== 'string') e.cadence = 'monthly-turn';
      if(typeof e.subdayContext === 'undefined') e.subdayContext = null;
    }
  }
  return campaign;
}

// ── Wave Construction-B — agricultural-improvement on the unified Project model ──
// Architecture.md §10 + Phase_4_Construction_Plan.md (Wave Construction-B). Agricultural
// improvement (Foundation #17 incremental model) becomes a `constructibleKind` in the one
// unified Construction subsystem. The HEX remains the economic source of truth — its
// landImprovementBonus (earned +N) and landImprovementInvested (gp toward the next step) are
// untouched by this layer. The Project is an additive ACTIVITY RECORD so the Day Clock /
// day-tick consumer have a live consumer and integrators get a typed entity + typed
// construction-progress events. Because the economic math is never moved, the monthly
// land-value outcome is byte-identical to the pre-refactor engine (see
// tests/agricultural-projects.smoke.js — the zero-drift oracle).
//
// gpSpent semantics: the implied CUMULATIVE gp at this hex = bonus×step + current accumulation
// (well-defined from hex state alone, so migration and the commitTurn mirror always agree and
// the resync is idempotent). Per-turn actual spend is reported on the construction-progress
// events, not here.
function findAgriculturalProject(campaign, hexId){
  if(!campaign || !hexId || !Array.isArray(campaign.projects)) return null;
  return campaign.projects.find(p => p && p.constructibleKind === 'agricultural-improvement' && p.siteHexId === hexId) || null;
}

// Create (if absent) and resync the agricultural-improvement Project that mirrors a hex's
// current incremental state. Returns the Project (or null if inputs are unusable).
//   opts.domainId   — owner domain id (falls back to hex.domainId)
//   opts.turn       — current turn number (stamps startedAtTurn/completedAtTurn + history)
//   opts.historyType / opts.historyNarrative — optional history entry to append this call
function syncAgriculturalProject(campaign, hex, opts){
  opts = opts || {};
  if(!campaign || !hex || !hex.id) return null;
  if(!Array.isArray(campaign.projects)) campaign.projects = [];
  const COST = global.ACKS.AGRICULTURAL_IMPROVEMENT_COST_PER_STEP;
  const MAXB = global.ACKS.AGRICULTURAL_IMPROVEMENT_MAX_BONUS;
  const VCAP = global.ACKS.AGRICULTURAL_IMPROVEMENT_VALUE_CAP;
  const base     = hex.valuePerFamily || 0;
  const bonus    = hex.landImprovementBonus || 0;
  const invested = hex.landImprovementInvested || 0;
  const atCap      = bonus >= MAXB || base + bonus >= VCAP;
  const cumulative = bonus * COST + invested;
  const maxSteps   = Math.max(0, Math.min(MAXB, VCAP - base));
  let proj = findAgriculturalProject(campaign, hex.id);
  if(!proj){
    const coordStr = hex.coord ? ('(' + (hex.coord.q || 0) + ',' + (hex.coord.r || 0) + ')') : '';
    proj = global.ACKS.blankProject({
      constructibleKind: 'agricultural-improvement',
      siteHexId: hex.id,
      ownerDomainId: opts.domainId || hex.domainId || null,
      name: 'Agricultural improvement' + (coordStr ? ' — ' + coordStr : ''),
      lifecycleState: atCap ? 'complete' : 'under-construction',
      totalCost: maxSteps * COST,
      gpSpent: cumulative,
      startedAtTurn: (typeof opts.turn === 'number') ? opts.turn : null
    });
    campaign.projects.push(proj);
  }
  // Resync the derived fields from canonical hex state (idempotent).
  if(!proj.ownerDomainId) proj.ownerDomainId = opts.domainId || hex.domainId || null;
  proj.gpSpent        = cumulative;
  proj.totalCost      = maxSteps * COST;
  proj.lifecycleState = atCap ? 'complete' : 'under-construction';
  if(atCap && typeof opts.turn === 'number' && !proj.completedAtTurn) proj.completedAtTurn = opts.turn;
  if(opts.historyType || opts.historyNarrative){
    (proj.history = proj.history || []).push({
      turn: (typeof opts.turn === 'number') ? opts.turn : null,
      type: opts.historyType || 'progress',
      narrative: opts.historyNarrative || ''
    });
  }
  return proj;
}

// Backfill migration: lift existing in-progress agricultural improvements onto Project entities.
// Walks campaign.hexes (the canonical top-level collection — it carries hex.domainId and, after
// liftToTopLevelCollections, is reference-unified with domain.geography.hexes). Only hexes with
// landImprovementInvested > 0 get a live Project (an active step in progress = the Day Clock
// consumer the day-tick pipeline needs). Completed/plateau hexes (invested 0) stay as the
// derived landImprovementBonus on the hex; the commitTurn mirror creates a Project on the fly if
// the GM resumes investment. Idempotent: skips any hex that already has an agricultural Project.
function migrateAgriculturalToProjects(campaign){
  if(!campaign || typeof campaign !== 'object') return campaign;
  if(!Array.isArray(campaign.projects)) campaign.projects = [];
  const hexes = Array.isArray(campaign.hexes) ? campaign.hexes : [];
  for(const hex of hexes){
    if(!hex || !hex.id) continue;
    const invested = hex.landImprovementInvested || 0;
    if(invested <= 0) continue;
    if(findAgriculturalProject(campaign, hex.id)) continue; // idempotent
    syncAgriculturalProject(campaign, hex, {
      domainId: hex.domainId || null,
      historyType: 'migrated',
      historyNarrative: 'Agricultural improvement lifted onto the unified Project model (bonus +'
        + (hex.landImprovementBonus || 0) + ', ' + invested.toLocaleString() + 'gp toward the next step).'
    });
  }
  return campaign;
}

// Foundation #244 — Helper used by both `migrateCampaign` and Alpine's session-restore path.
// When the `dwarven-mining` house rule is OFF (the default), strip any "Mine royalties" or
// similarly-tagged entries from `domain.income.other`. The pre-fix Dwarven Vault template had
// a placeholder line that wasn't backed by any actual mine mechanic; this removes it (and any
// future mining-tagged entries) idempotently. Matches by `kind: 'mining'` tag OR label prefix.
// Joachim's directive 2026-05-28: when the rule is off, mining data must be both hidden AND
// non-functional, not just hidden.
function stripUnusedMiningEntries(domains, houseRules){
  if(!Array.isArray(domains)) return 0;
  // GP Wave A.1 — route through canonical isHouseRuleEnabled. Wrap the
  // houseRules map in a synthetic {houseRules} object since the helper
  // signature is (campaign, id).
  const miningOn = isHouseRuleEnabled({ houseRules }, 'dwarven-mining');
  if(miningOn) return 0;
  const isMiningEntry = e => {
    if(!e) return false;
    if(e.kind === 'mining') return true;
    const label = (e.label || '').toLowerCase();
    return /^(mine\s|mining\s|ore\s|quarry\s|mine\b|quarry\b|royalt)/.test(label) ||
           label.includes('mine royalt') || label.includes('ore royalt');
  };
  let stripped = 0;
  domains.forEach(d => {
    if(d?.income && Array.isArray(d.income.other)){
      const before = d.income.other.length;
      d.income.other = d.income.other.filter(e => !isMiningEntry(e));
      stripped += before - d.income.other.length;
    }
  });
  return stripped;
}

// =============================================================================
// Phase #440 — Five-axis Character classification migration (Architecture.md §2.7).
// Stage 1 (2026-05-29): additive only — writes new fields, keeps c.kind for one
// load cycle so display-string sites in index.html that show c.kind directly
// (Roster column, ruler card, character-edit option text) keep rendering until
// they're swept to use ACKS.displayKind(c). Stage 2 will land delete c.kind.
// =============================================================================

// Map legacy c.kind value → planned socialTier. Mirror of _legacyTier() in
// the predicates section; lifted out here for migration use.
function _kindToTier(k){
  if(k === 'henchman')   return 'henchman';
  if(k === 'specialist') return 'specialist';
  if(k === 'follower')   return 'follower';
  if(k === 'hireling')   return 'hireling';
  if(k === 'mercenary')  return 'mercenary';
  return 'independent';
}

// Idempotent: skips if all four canonical axis fields are already present.
function migrateCharacterClassification(c){
  if(!c || typeof c !== 'object') return c;
  const k = c.kind;
  // Each axis field is individually guarded — idempotent. Legacy c.kind is
  // used only to derive missing fields on first-load of pre-#440 saves.
  if(!c.controlledBy){
    c.controlledBy = (k === 'PC' || k === 'pc') ? 'player' : 'gm';
  }
  if(!c.socialTier){
    if(k === 'candidate'){
      // Candidate's destined tier travels in recruitmentProvenance.hireCategory.
      c.socialTier = (c.recruitmentProvenance && c.recruitmentProvenance.hireCategory) || 'henchman';
    } else if(k === 'PC' || k === 'pc' || k === 'NPC' || k === 'npc' || !k){
      c.socialTier = 'independent';
    } else {
      c.socialTier = _kindToTier(k);
    }
  }
  if(!c.lifecycleState){
    if(c.alive === false)       c.lifecycleState = 'deceased';
    else if(k === 'candidate')  c.lifecycleState = 'candidate';
    else                        c.lifecycleState = 'active';
  }
  if(!Array.isArray(c.creatureTypes)){
    c.creatureTypes = ['humanoid'];
  }
  if(typeof c.isEnchantedCreature !== 'boolean'){
    c.isEnchantedCreature = false;
  }
  if(c.hitDice === undefined){
    // RAW per-class HD derivation is a Phase 6 thing. Null until then; the
    // character sheet HP.hitDice string already covers display.
    c.hitDice = null;
  }
  // #453 — c.kind retired. Five-axis fields are canonical; the legacy field
  // is always stripped, regardless of whether new fields were already set.
  delete c.kind;
  return c;
}

// Walk every character in a campaign. Idempotent + safe on empty campaigns.
function migrateAllCharacterClassification(campaign){
  if(!campaign || !Array.isArray(campaign.characters)) return 0;
  let migrated = 0;
  for(const c of campaign.characters){
    const had = (c && c.controlledBy && c.socialTier && c.lifecycleState && Array.isArray(c.creatureTypes));
    migrateCharacterClassification(c);
    if(!had) migrated++;
  }
  return migrated;
}

// =============================================================================
// 9.5 TYPED-EVENT SYSTEM — MOVED to acks-engine-events.js (2026-05-28).
// Loaded as a separate <script> tag after this file. All event symbols
// accessible via global.ACKS at runtime.
// =============================================================================

// =============================================================================
// 9.53–9.6 SUBSYSTEMS (Calendar / Hirelings / Rumors / M&M / Travel) — MOVED
// to acks-engine-subsystems.js (2026-05-28). Loaded as a separate <script>
// tag after this file in index.html. Symbols accessible via global.ACKS.
// =============================================================================

// =============================================================================
// 9.7 TOP-LEVEL COLLECTIONS (Foundation #193 — refactor)
// =============================================================================
// See Top_Level_Collections_Refactor_Plan.md.
//
// Hexes, settlements, and rumors live at campaign.hexes[], campaign.settlements[],
// campaign.rumors[] respectively. Each entry carries a parent reference id:
//   - Hex.domainId         (null for wilderness)
//   - Settlement.hexId
//   - Rumor.reach[].settlementId
//
// liftToTopLevelCollections() runs on campaign load. It walks the legacy nested
// storage (domain.geography.hexes[].settlement.rumors[]) and lifts everything to
// the top-level collections, populating the parent reference ids. It is idempotent
// — running on an already-migrated campaign is a no-op.

// --- Query helpers ---

function hexesForDomain(campaign, domainId){
  if(!campaign || !Array.isArray(campaign.hexes)) return [];
  return campaign.hexes.filter(h => h.domainId === domainId);
}

function wildernessHexes(campaign){
  if(!campaign || !Array.isArray(campaign.hexes)) return [];
  return campaign.hexes.filter(h => h.domainId == null);
}

function findHex(campaign, hexId){
  if(!campaign || !Array.isArray(campaign.hexes)) return null;
  return campaign.hexes.find(h => h.id === hexId) || null;
}

function findSettlement(campaign, settlementId){
  if(!campaign || !Array.isArray(campaign.settlements)) return null;
  return campaign.settlements.find(s => s.id === settlementId) || null;
}

function findRumor(campaign, rumorId){
  if(!campaign || !Array.isArray(campaign.rumors)) return null;
  return campaign.rumors.find(r => r.id === rumorId) || null;
}

function settlementForHex(campaign, hexId){
  if(!campaign || !Array.isArray(campaign.settlements)) return null;
  return campaign.settlements.find(s => s.hexId === hexId) || null;
}

function settlementsForDomain(campaign, domainId){
  if(!campaign) return [];
  const domainHexIds = new Set(hexesForDomain(campaign, domainId).map(h => h.id));
  return (campaign.settlements||[]).filter(s => domainHexIds.has(s.hexId));
}

function rumorsAtSettlement(campaign, settlementId){
  if(!campaign || !Array.isArray(campaign.rumors)) return [];
  return campaign.rumors.filter(r => (r.reach||[]).some(rch => rch.settlementId === settlementId));
}

function rumorsInDomain(campaign, domainId){
  const settlementIds = new Set(settlementsForDomain(campaign, domainId).map(s => s.id));
  return (campaign.rumors||[]).filter(r => (r.reach||[]).some(rch => settlementIds.has(rch.settlementId)));
}

// Returns the reach entry on a rumor for a given settlement, or null if not present.
function rumorReachAt(rumor, settlementId){
  if(!rumor || !Array.isArray(rumor.reach)) return null;
  return rumor.reach.find(rch => rch.settlementId === settlementId) || null;
}

// =============================================================================
// Phase 2.95 Stash A — Stash lookups (pure-find subset, commit 3 / 2026-05-29).
// Per Phase_2.95_Stash_Plan.md §6.2. Mutator-style helpers (findOrCreateStashAt,
// auto-create domain treasury) land with A.2 canonical setters.
// =============================================================================

function findStash(campaign, stashId){
  if(!campaign || !Array.isArray(campaign.stashes)) return null;
  return campaign.stashes.find(st => st.id === stashId) || null;
}

// Personal + cache stashes owned by this character. Does not include party
// stashes the character is a member of (use stashesAccessibleToCharacter for that).
function stashesOwnedByCharacter(campaign, characterId){
  if(!campaign || !Array.isArray(campaign.stashes)) return [];
  return campaign.stashes.filter(st => st.ownerCharacterId === characterId);
}

// All stashes located at a given hex, regardless of owner kind.
function stashesAtHex(campaign, hexId){
  if(!campaign || !Array.isArray(campaign.stashes)) return [];
  return campaign.stashes.filter(st => st.hexId === hexId);
}

// Defensive pure-find — returns null if no domain treasury stash exists for the
// given domain. A.2 will add domainTreasuryFor() that creates lazily.
function findDomainTreasury(campaign, domainId){
  if(!campaign || !Array.isArray(campaign.stashes)) return null;
  return campaign.stashes.find(st =>
    st.kind === 'domain-treasury' && st.ownerDomainId === domainId
  ) || null;
}

// Derived view — never stored. Personal stashes the character owns +
// party stashes for any party they're a member of +
// domain-treasuries of any domain whose rulerCharacterId matches them.
// Order: personal → party → treasury (most-personal-first).
function stashesAccessibleToCharacter(campaign, characterId){
  if(!campaign || !characterId) return [];
  const out = [];
  // Personal + cache stashes
  if(Array.isArray(campaign.stashes)){
    for(const st of campaign.stashes){
      if(st.ownerCharacterId === characterId) out.push(st);
    }
  }
  // Party stashes for parties this character is a member of
  if(Array.isArray(campaign.parties) && Array.isArray(campaign.stashes)){
    const memberPartyIds = campaign.parties
      .filter(p => Array.isArray(p.memberCharacterIds) && p.memberCharacterIds.includes(characterId))
      .map(p => p.id);
    if(memberPartyIds.length){
      const memberSet = new Set(memberPartyIds);
      for(const st of campaign.stashes){
        if(st.ownerPartyId && memberSet.has(st.ownerPartyId)) out.push(st);
      }
    }
  }
  // Domain treasuries for domains this character currently rules
  if(Array.isArray(campaign.domains) && Array.isArray(campaign.stashes)){
    const ruledDomainIds = campaign.domains
      .filter(d => d.rulerCharacterId === characterId)
      .map(d => d.id);
    if(ruledDomainIds.length){
      const ruledSet = new Set(ruledDomainIds);
      for(const st of campaign.stashes){
        if(st.kind === 'domain-treasury' && st.ownerDomainId && ruledSet.has(st.ownerDomainId)) out.push(st);
      }
    }
  }
  return out;
}

// =============================================================================
// Phase 2.95 Stash A.2 — canonical setters (#467 / 2026-05-29).
// depositToStash + withdrawFromStash + transferBetweenStashes.
// Per Phase_2.95_Stash_Plan.md §6.2. Coin items merge by denomination on
// deposit; bulk and item entries append. Withdraw supports partial qty.
// Each mutation stamps a history entry on the stash record.
// =============================================================================

// --- Internal helper: append a history entry to a stash ----------------------
function _stampStashHistory(stash, atTurn, type, payload){
  if(!stash) return;
  if(!Array.isArray(stash.history)) stash.history = [];
  stash.history.push(Object.assign({ turn: atTurn || 1, type }, payload || {}));
}

// --- Internal helper: brief summary of items for history payloads ------------
// Used for both deposit + withdraw history entries. Returns a compact array
// of {kind, label, qty} that's easier to audit than embedded full item objects.
function _summarizeItems(items){
  if(!Array.isArray(items)) return [];
  return items.map(it => {
    if(!it) return null;
    if(it.kind === 'coin') return { kind:'coin', label: it.denomination || 'gp', qty: it.qty || 0 };
    if(it.kind === 'bulk') return { kind:'bulk', label: it.label || '(unnamed)', unit: it.unit || 'stones', qty: it.qty || 0 };
    return { kind:'item', label: it.name || '(unnamed)', qty: it.qty || 1, magicItemId: it.magicItemId || null };
  }).filter(Boolean);
}

// --- Deposit ------------------------------------------------------------------
// Add items[] to a stash. Coin entries merge by denomination; other kinds append.
// Items can be passed as bare objects ({kind:'coin', denomination:'gp', qty:50})
// — they're normalized through blankStashItem so they end up with proper IDs.
function depositToStash(campaign, stashId, items, opts){
  if(!campaign || !stashId) return null;
  const stash = findStash(campaign, stashId);
  if(!stash) return null;
  if(!Array.isArray(items) || items.length === 0) return stash;  // no-op
  if(!Array.isArray(stash.items)) stash.items = [];

  const blankStashItem = (global.ACKS && global.ACKS.blankStashItem) || null;
  const atTurn = (opts && opts.atTurn) || campaign.currentTurn || 1;

  for(const incoming of items){
    if(!incoming) continue;
    const normalized = blankStashItem ? blankStashItem(incoming) : Object.assign({ id: 'si-?' }, incoming);

    // Coin merges by denomination.
    if(normalized.kind === 'coin'){
      const existing = stash.items.find(x =>
        x.kind === 'coin' && (x.denomination || 'gp') === (normalized.denomination || 'gp')
      );
      if(existing){
        existing.qty = (existing.qty || 0) + (normalized.qty || 0);
        continue;
      }
    }
    // Bulk + item append as new records. A.4 reconcile can consolidate later.
    stash.items.push(normalized);
  }

  _stampStashHistory(stash, atTurn, 'deposit', {
    reason: (opts && opts.reason) || 'deposit',
    source: (opts && opts.source) || null,
    items: _summarizeItems(items)
  });

  // A.4 — canonical-setter invariant: keep treasury scalar in sync
  _syncTreasuryScalarFor(campaign, stash);

  return stash;
}

// --- Withdraw -----------------------------------------------------------------
// Remove items from a stash. withdrawals: [{itemId, qty?}]. qty defaults to
// the entry's full qty. Partial withdrawal: source qty reduces, a new detached
// record (with a fresh id for coin/bulk; preserving id for full item-kind)
// is returned for each withdrawal entry. Returns null on any validation
// failure — withdraw is atomic: no partial effects if anything fails.
function withdrawFromStash(campaign, stashId, withdrawals, opts){
  if(!campaign || !stashId) return null;
  const stash = findStash(campaign, stashId);
  if(!stash) return null;
  if(!Array.isArray(withdrawals) || withdrawals.length === 0){
    return { stash, withdrawn: [] };  // no-op
  }
  if(!Array.isArray(stash.items)) return null;

  // Validate everything first — atomicity.
  const plan = [];
  for(const w of withdrawals){
    if(!w || !w.itemId) return null;
    const entry = stash.items.find(it => it.id === w.itemId);
    if(!entry) return null;
    const requested = (w.qty != null) ? w.qty : (entry.qty != null ? entry.qty : 1);
    if(typeof requested !== 'number' || requested <= 0) return null;
    const have = (entry.qty != null) ? entry.qty : 1;
    if(requested > have) return null;
    plan.push({ entry, requested, isFull: requested === have });
  }

  // All validated. Apply.
  const blankStashItem = (global.ACKS && global.ACKS.blankStashItem) || null;
  const withdrawn = [];
  for(const step of plan){
    if(step.isFull){
      // Remove entry from stash; return the original record (now detached).
      const idx = stash.items.indexOf(step.entry);
      if(idx >= 0) stash.items.splice(idx, 1);
      withdrawn.push(step.entry);
    } else {
      // Partial: reduce source qty, build a detached copy with new id.
      step.entry.qty = (step.entry.qty || 0) - step.requested;
      const copySpec = Object.assign({}, step.entry, { id: undefined, qty: step.requested });
      const copy = blankStashItem ? blankStashItem(copySpec) : Object.assign({ id: 'si-?' }, copySpec);
      withdrawn.push(copy);
    }
  }

  const atTurn = (opts && opts.atTurn) || campaign.currentTurn || 1;
  _stampStashHistory(stash, atTurn, 'withdraw', {
    reason: (opts && opts.reason) || 'withdraw',
    destination: (opts && opts.destination) || null,
    items: _summarizeItems(withdrawn)
  });

  // A.4 — canonical-setter invariant: keep treasury scalar in sync
  _syncTreasuryScalarFor(campaign, stash);

  return { stash, withdrawn };
}

// --- Transfer -----------------------------------------------------------------
// Atomic move: withdraw from `fromStashId`, deposit into `toStashId`. Same
// validation semantics as withdrawFromStash. History entries on both stashes
// reference the counterparty.
function transferBetweenStashes(campaign, fromStashId, toStashId, withdrawals, opts){
  if(!campaign || !fromStashId || !toStashId) return null;
  if(fromStashId === toStashId) return null;
  const fromStash = findStash(campaign, fromStashId);
  const toStash   = findStash(campaign, toStashId);
  if(!fromStash || !toStash) return null;

  const atTurn = (opts && opts.atTurn) || campaign.currentTurn || 1;
  const reason = (opts && opts.reason) || 'transfer';

  // Withdraw step writes its own history; we re-stamp with a richer payload below
  // by passing reason + destination so the withdraw entry already references `to`.
  const out = withdrawFromStash(campaign, fromStashId, withdrawals, {
    atTurn,
    reason,
    destination: { kind:'stash', id: toStashId, label: toStash.name || null }
  });
  if(!out) return null;

  // Deposit the withdrawn items into `to`. The deposit history entry references
  // the source stash so both sides of the transfer carry counterparty context.
  depositToStash(campaign, toStashId, out.withdrawn, {
    atTurn,
    reason,
    source: { kind:'stash', id: fromStashId, label: fromStash.name || null }
  });

  return { fromStash, toStash, transferred: out.withdrawn };
}

// =============================================================================
// Phase 2.95 Stash A.3 — domain.treasury → treasury-stash migration (#468 / 2026-05-29).
// Per Phase_2.95_Stash_Plan.md §6.3 + §8.2. Idempotent. Gated on the
// inventory-stash-system house rule per the gating doctrine.
// =============================================================================

// --- Capital-hex selection (pure) -------------------------------------------
// Prefer the hex with the largest urban settlement; fall back to the first
// hex in domain.geography.hexes. Returns null if the domain has no hexes
// (orphan domain — migration defers).
function _selectDomainCapitalHex(domain){
  if(!domain || !domain.geography || !Array.isArray(domain.geography.hexes)) return null;
  const hexes = domain.geography.hexes;
  if(hexes.length === 0) return null;
  let best = null;
  let bestPop = -1;
  for(const h of hexes){
    if(h && h.settlement){
      const pop = (h.settlement.urbanFamilies || 0);
      if(pop > bestPop){
        best = h;
        bestPop = pop;
      }
    }
  }
  return best || hexes[0];
}

// --- Per-domain migration (idempotent) --------------------------------------
// Returns the treasury stash (existing or freshly created). Three outcomes:
//   (1) domain.treasuryStashId resolves to a valid domain-treasury stash → return it
//   (2) Orphan: a domain-treasury stash for this domain exists but the pointer
//       is missing/stale → re-link domain.treasuryStashId, return the orphan
//   (3) Fresh: create stash at capital hex, seed with domain.treasury gp,
//       link via domain.treasuryStashId
//
// domain.treasury scalar is PRESERVED in all cases — A.4 reconcile owns
// the cross-field invariant.
function migrateDomainTreasuryToStash(campaign, domain){
  if(!campaign || !domain) return null;
  if(!Array.isArray(campaign.stashes)) campaign.stashes = [];

  // (1) Existing pointer resolves cleanly.
  if(domain.treasuryStashId){
    const existing = findStash(campaign, domain.treasuryStashId);
    if(existing && existing.kind === 'domain-treasury' && existing.ownerDomainId === domain.id){
      return existing;
    }
  }

  // (2) Orphan: a treasury stash exists for this domain but pointer is stale.
  const orphan = campaign.stashes.find(st =>
    st.kind === 'domain-treasury' && st.ownerDomainId === domain.id
  );
  if(orphan){
    domain.treasuryStashId = orphan.id;
    return orphan;
  }

  // (3) Fresh creation.
  const capitalHex = _selectDomainCapitalHex(domain);
  if(!capitalHex) return null;  // Defer — domain has no hexes

  const blankStash     = (global.ACKS && global.ACKS.blankStash)     || null;
  const blankStashItem = (global.ACKS && global.ACKS.blankStashItem) || null;
  if(!blankStash || !blankStashItem) return null;

  // Canonical shape: domain.treasury = { gp: N }. Defensive against legacy
  // scalar shape (some pre-Stash-A user data may have stored a bare number).
  const treasuryRaw = domain.treasury;
  const seedQty = (typeof treasuryRaw === 'number')
    ? treasuryRaw
    : (treasuryRaw && typeof treasuryRaw.gp === 'number' ? treasuryRaw.gp : 0);
  const seedItems = seedQty > 0
    ? [ blankStashItem({ kind:'coin', denomination:'gp', qty: seedQty }) ]
    : [];

  const stash = blankStash({
    kind: 'domain-treasury',
    name: (domain.name || 'Domain') + ' Treasury',
    ownerDomainId: domain.id,
    hexId: capitalHex.id,
    items: seedItems,
    createdAtTurn: campaign.currentTurn || 1,
    history: [{
      turn: campaign.currentTurn || 1,
      type: 'created',
      reason: 'treasury-migration',
      seededFromScalarGp: seedQty
    }]
  });
  campaign.stashes.push(stash);
  domain.treasuryStashId = stash.id;
  return stash;
}

// --- Orchestrator hook for migrateCampaign ----------------------------------
// Gated on inventory-stash-system. Per gating doctrine: when OFF, stash data
// is non-existent (we don't materialize anything). Returns the number of
// domains that ended up with a treasuryStashId — useful diagnostic but not
// strictly the number of newly-created stashes (orphan repair counts too).
function migrateAllDomainTreasuries(campaign){
  if(!campaign) return 0;
  if(!isHouseRuleEnabled(campaign, 'inventory-stash-system')) return 0;
  let linked = 0;
  for(const d of (campaign.domains || [])){
    const stash = migrateDomainTreasuryToStash(campaign, d);
    if(stash) linked++;
  }
  return linked;
}

// --- Canonical gp read (the public API replacing direct domain.treasury) ----
// Sum of gp-denominated coin entries in the domain's treasury stash. Returns
// 0 if no treasury stash exists (caller decides whether to fall back to the
// scalar). A.4 will add the canonical setter that keeps the scalar in sync.
function domainTreasuryGp(campaign, domainId){
  if(!campaign || !domainId) return 0;
  const stash = findDomainTreasury(campaign, domainId);
  if(!stash || !Array.isArray(stash.items)) return 0;
  let total = 0;
  for(const it of stash.items){
    if(it && it.kind === 'coin' && (it.denomination || 'gp') === 'gp'){
      total += (it.qty || 0);
    }
  }
  return total;
}

// =============================================================================
// Phase 2.95 Stash A.4 — canonical-setter invariant + item-consolidation reconcile
// (#469 / 2026-05-29). Per Phase_2.95_Stash_Plan.md §6.4 +
// feedback-canonical-setters memory.
// =============================================================================

// --- Canonical-setter invariant: keep domain.treasury in sync with the stash --
// Called by depositToStash + withdrawFromStash after their mutations. No-op for
// non-treasury stashes. The "single mutation helper + load-time reconcile" half
// of the canonical-setters doctrine: mutations write through here, load-time
// reconcileTreasuryScalars catches any drift from external writers.
function _syncTreasuryScalarFor(campaign, stash){
  if(!campaign || !stash) return;
  if(stash.kind !== 'domain-treasury' || !stash.ownerDomainId) return;
  if(!Array.isArray(campaign.domains)) return;
  const domain = campaign.domains.find(d => d.id === stash.ownerDomainId);
  if(!domain) return;
  // Canonical shape: { gp: N }. If a legacy scalar slipped through, normalize.
  if(!domain.treasury || typeof domain.treasury !== 'object') domain.treasury = { gp: 0 };
  domain.treasury.gp = domainTreasuryGp(campaign, domain.id);
}

// --- Apply a signed gp delta to a domain treasury (engine-internal callers) --
// Routes through depositToStash when inventory-stash-system is on AND a
// treasuryStashId is linked, otherwise mutates the scalar directly. The C.1
// event-handler analog (_applyTreasuryDelta in acks-engine-events.js) does
// the same thing but takes a domainId — this version takes the domain object
// because commitTurn already has it in scope. Both routes preserve the A.4
// invariant: after the call, domain.treasury.gp matches the stash sum.
//
// Zero-amount calls are no-ops (defensive).
function _applyDomainTreasuryDelta(campaign, domain, amount, opts){
  if(!campaign || !domain || !amount) return;
  opts = opts || {};
  const stashSystemOn = isHouseRuleEnabled(campaign, 'inventory-stash-system');
  if(stashSystemOn && domain.treasuryStashId){
    const stash = findStash(campaign, domain.treasuryStashId);
    if(stash){
      depositToStash(campaign, stash.id, [{ kind:'coin', denomination:'gp', qty: amount }], {
        reason: opts.reason || (amount >= 0 ? 'monthly-credit' : 'monthly-debit'),
        source: opts.label ? { kind:'label', label: opts.label } : null
      });
      // _syncTreasuryScalarFor inside depositToStash already updated domain.treasury.gp
      return;
    }
  }
  // Legacy fallback — rule off, or treasuryStashId unset (e.g. pre-migration).
  if(!domain.treasury) domain.treasury = { gp: 0 };
  domain.treasury.gp = (domain.treasury.gp || 0) + amount;
}

// --- Sweep all treasury scalars from their stashes' coin sums ----------------
// One-shot reconcile pass. Used at load time after migration; useful as a
// diagnostic to catch any pre-A.4 drift. Returns the number of domains whose
// scalar was updated.
function reconcileTreasuryScalars(campaign){
  if(!campaign || !Array.isArray(campaign.domains)) return 0;
  let count = 0;
  for(const d of campaign.domains){
    if(!d || !d.treasuryStashId) continue;
    if(!d.treasury || typeof d.treasury !== 'object') d.treasury = { gp: 0 };
    const newTotal = domainTreasuryGp(campaign, d.id);
    if(d.treasury.gp !== newTotal){
      d.treasury.gp = newTotal;
      count++;
    }
  }
  return count;
}

// --- Item-consolidation reconcile -------------------------------------------
// Merge fungible entries in stash.items:
//   - bulk: same (label, unit) → sum qty + encumbranceSt
//   - item: same name AND no magicItemId → sum qty + encumbranceSt
// Coin is already merged on deposit by depositToStash, so this is a no-op for
// coin in normal operation; we still pass through it defensively in case
// historical data has multiple coin entries of the same denomination.
//
// Notes are kept from the FIRST entry (consolidation preserves the oldest
// audit context). Returns true when any merge happened.
function reconcileStashItems(stash){
  if(!stash || !Array.isArray(stash.items) || stash.items.length < 2) return false;
  const items = stash.items;
  const coinBuckets = {};
  const bulkBuckets = {};
  const itemBuckets = {};
  const out = [];
  let merged = false;

  for(const it of items){
    if(!it){ continue; }
    if(it.kind === 'coin'){
      const key = it.denomination || 'gp';
      if(!coinBuckets[key]){ coinBuckets[key] = it; out.push(it); }
      else { coinBuckets[key].qty = (coinBuckets[key].qty || 0) + (it.qty || 0); merged = true; }
    } else if(it.kind === 'bulk'){
      const key = (it.label || '(unnamed)') + '|' + (it.unit || 'stones');
      if(!bulkBuckets[key]){ bulkBuckets[key] = it; out.push(it); }
      else {
        bulkBuckets[key].qty           = (bulkBuckets[key].qty           || 0) + (it.qty           || 0);
        bulkBuckets[key].encumbranceSt = (bulkBuckets[key].encumbranceSt || 0) + (it.encumbranceSt || 0);
        merged = true;
      }
    } else if(it.kind === 'item' && !it.magicItemId && it.name){
      const key = it.name;
      if(!itemBuckets[key]){ itemBuckets[key] = it; out.push(it); }
      else {
        itemBuckets[key].qty           = (itemBuckets[key].qty           || 0) + (it.qty           || 0);
        itemBuckets[key].encumbranceSt = (itemBuckets[key].encumbranceSt || 0) + (it.encumbranceSt || 0);
        merged = true;
      }
    } else {
      // Magic items, unnamed items, unknown kinds — passthrough, never merge
      out.push(it);
    }
  }

  if(merged){
    stash.items = out;
    if(!Array.isArray(stash.history)) stash.history = [];
    stash.history.push({
      turn: 0,  // No campaign-turn context here; reconcile is load-time/diagnostic
      type: 'reconciled',
      reason: 'item-consolidation',
      itemCountBefore: items.length,
      itemCountAfter:  out.length
    });
  }
  return merged;
}

// --- Sweep all stashes ------------------------------------------------------
function reconcileAllStashes(campaign){
  if(!campaign || !Array.isArray(campaign.stashes)) return 0;
  let count = 0;
  for(const st of campaign.stashes){
    if(reconcileStashItems(st)) count++;
  }
  return count;
}

// =============================================================================
// Phase Wave B.5 — Notable items + custody lookups (pure-find subset, 2026-05-29).
// Per Architecture.md §3.7. Mutator-style helpers (promoteToNotable, transferCustody)
// land with the future B.5.2 setters commit.
// =============================================================================

function findNotableItem(campaign, itemId){
  if(!campaign || !Array.isArray(campaign.notableItems)) return null;
  return campaign.notableItems.find(it => it.id === itemId) || null;
}

function findItemCustody(campaign, custodyId){
  if(!campaign || !Array.isArray(campaign.itemCustody)) return null;
  return campaign.itemCustody.find(cu => cu.id === custodyId) || null;
}

// Returns the currently-active custody record for a given item. Per §3.7, a notable
// item has at most one active custody (status==='active') at a time; superseded
// transfers have their prior records flipped to status==='ended'.
function currentCustodyOfItem(campaign, itemId){
  if(!campaign || !Array.isArray(campaign.itemCustody)) return null;
  return campaign.itemCustody.find(cu => cu.itemId === itemId && cu.status === 'active') || null;
}

// All notable items currently in a given custodian's possession. The custodian
// is keyed by (kind, id) pair — same shape used on itemCustody records.
function notableItemsInCustodian(campaign, custodianKind, custodianId){
  if(!campaign || !Array.isArray(campaign.itemCustody)) return [];
  if(!Array.isArray(campaign.notableItems)) return [];
  const liveCustody = campaign.itemCustody.filter(cu =>
    cu.status === 'active' &&
    cu.custodianKind === custodianKind &&
    cu.custodianId === custodianId
  );
  const itemIds = new Set(liveCustody.map(cu => cu.itemId));
  return campaign.notableItems.filter(it => itemIds.has(it.id));
}

// Convenience wrapper: notable items currently held by a character.
function notableItemsHeldByCharacter(campaign, characterId){
  return notableItemsInCustodian(campaign, 'character', characterId);
}

// Notable items physically located at a hex. Includes direct hex custodians
// (lost caches, abandoned hoards) AND transitively-resolved items held by
// characters whose currentHexId matches. Excludes items in characters that
// are travelling (currentHexId === null).
function notableItemsAtHex(campaign, hexId){
  if(!campaign || !hexId) return [];
  const out = [];
  if(Array.isArray(campaign.itemCustody)){
    // Direct hex custodianship
    const hexCustody = campaign.itemCustody.filter(cu =>
      cu.status === 'active' && cu.custodianKind === 'hex' && cu.custodianId === hexId
    );
    const hexItemIds = new Set(hexCustody.map(cu => cu.itemId));
    if(Array.isArray(campaign.notableItems)){
      for(const it of campaign.notableItems){
        if(hexItemIds.has(it.id)) out.push(it);
      }
    }
    // Items held by characters located at this hex
    if(Array.isArray(campaign.characters)){
      const charactersAtHex = new Set(
        campaign.characters
          .filter(c => c.currentHexId === hexId)
          .map(c => c.id)
      );
      if(charactersAtHex.size){
        const charItemIds = new Set(
          campaign.itemCustody
            .filter(cu => cu.status === 'active' && cu.custodianKind === 'character' && charactersAtHex.has(cu.custodianId))
            .map(cu => cu.itemId)
        );
        if(Array.isArray(campaign.notableItems)){
          for(const it of campaign.notableItems){
            if(charItemIds.has(it.id) && !hexItemIds.has(it.id)) out.push(it);
          }
        }
      }
    }
  }
  return out;
}

// =============================================================================
// #442 — Group entity lookups (count-level abstraction, Architecture.md §2.4).
// A Group represents N identical entities (kobold pack, bandit gang, town militia,
// future DaW Unit) sharing a monsterCatalogKey template. Used where individuated
// Creature records would be wasteful. Phase 3 Military's Unit specializes this.
// Setters (spawnCreatureFromGroup, applyCasualties) land later with Phase 3.
// =============================================================================

function findGroup(campaign, groupId){
  if(!campaign || !Array.isArray(campaign.groups)) return null;
  return campaign.groups.find(g => g.id === groupId) || null;
}

function groupsAtHex(campaign, hexId){
  if(!campaign || !Array.isArray(campaign.groups)) return [];
  return campaign.groups.filter(g => g.currentHexId === hexId);
}

// All groups whose template matches a given monsterCatalogKey. Useful for "where
// are all the kobolds in this world?" — answers across hexes and lifecycle states.
function groupsByCatalogKey(campaign, monsterCatalogKey){
  if(!campaign || !Array.isArray(campaign.groups)) return [];
  return campaign.groups.filter(g =>
    g.groupTemplate && g.groupTemplate.monsterCatalogKey === monsterCatalogKey
  );
}

// All groups currently under this character's command (reverse-derived from the
// commanderCharacterId pointer on each group). A character may command 0..N groups.
function groupsCommandedBy(campaign, characterId){
  if(!campaign || !Array.isArray(campaign.groups)) return [];
  return campaign.groups.filter(g => g.commanderCharacterId === characterId);
}

// Active member count = count − casualties, clamped at 0. Defensive: handles
// missing/negative casualties without going negative.
function groupActiveCount(group){
  if(!group) return 0;
  const count = group.count || 0;
  const casualties = group.casualties || 0;
  return Math.max(0, count - casualties);
}

// =============================================================================
// #443 — Wave A relation setters (Architecture.md §3.5, 2026-05-29).
// Six relation collections (henchmanships, specialistContracts, hirelingContracts,
// magistracies, vassalages, tributaryAgreements) each get a create + end pair plus
// active-relation lookups. The setters are the CANONICAL mutation primitives —
// callers (event handlers, UI workflows) must go through them, not push directly
// to the collection arrays. This guarantees:
//   - Every record has the required fields set
//   - Every record has a creation/end history entry
//   - status flips are coherent
//   - Active-relation invariants (subject has ≤1 active patron, etc.) can be enforced later
// =============================================================================

// --- Internal helper: lazy collection init + push with create-history entry ----
function _pushRelation(campaign, collectionName, record, createReason){
  if(!campaign) return record;
  if(!Array.isArray(campaign[collectionName])) campaign[collectionName] = [];
  if(!Array.isArray(record.history)) record.history = [];
  record.history.push({
    turn: record.hiredAtTurn || record.appointedAtTurn || record.oathTakenAtTurn || record.establishedAtTurn || record.sinceTurn || 1,
    type: 'created',
    reason: createReason || 'created'
  });
  campaign[collectionName].push(record);
  return record;
}

// --- Internal helper: end a relation by ID (idempotent) ----------------------
function _endRelation(campaign, collectionName, recordId, atTurn, reason){
  if(!campaign || !Array.isArray(campaign[collectionName])) return null;
  const record = campaign[collectionName].find(r => r.id === recordId);
  if(!record) return null;
  if(record.status === 'ended') return record;  // Idempotent
  record.status = 'ended';
  record.endedAtTurn = atTurn || null;
  if(!Array.isArray(record.history)) record.history = [];
  record.history.push({
    turn: atTurn || 1,
    type: 'ended',
    reason: reason || 'ended'
  });
  return record;
}

// =============================================================================
// Henchmanship — character serves as henchman to a patron.
// Subject: at most 1 active henchmanship. Patron: 0..N active henchmanships.
// =============================================================================

function createHenchmanship(campaign, opts={}){
  const record = global.ACKS.blankHenchmanship({
    id:                 opts.id,
    subjectCharacterId: opts.subjectCharacterId || null,
    patronCharacterId:  opts.patronCharacterId  || null,
    hiredAtTurn:        opts.hiredAtTurn        || 1,
    signingBonusPaidGp: opts.signingBonusPaidGp || 0,
    wageStreamGpMo:     opts.wageStreamGpMo     || 0,
    currentLoyalty:     opts.currentLoyalty     || 0
  });
  return _pushRelation(campaign, 'henchmanships', record, opts.reason || 'henchman-hired');
}

function endHenchmanship(campaign, henchmanshipId, atTurn, reason){
  return _endRelation(campaign, 'henchmanships', henchmanshipId, atTurn, reason || 'henchman-released');
}

function activeHenchmanshipFor(campaign, characterId){
  if(!campaign || !Array.isArray(campaign.henchmanships)) return null;
  return campaign.henchmanships.find(h =>
    h.subjectCharacterId === characterId && h.status === 'active'
  ) || null;
}

function henchmanshipsByPatron(campaign, patronCharacterId){
  if(!campaign || !Array.isArray(campaign.henchmanships)) return [];
  return campaign.henchmanships.filter(h =>
    h.patronCharacterId === patronCharacterId && h.status === 'active'
  );
}

// =============================================================================
// Specialist contract — specialist serves an employer in a category.
// Subject: at most 1 active contract. Employer: 0..N.
// =============================================================================

function createSpecialistContract(campaign, opts={}){
  const record = global.ACKS.blankSpecialistContract({
    id:                    opts.id,
    specialistCharacterId: opts.specialistCharacterId || null,
    employerCharacterId:   opts.employerCharacterId   || null,
    hiredAtTurn:           opts.hiredAtTurn           || 1,
    wageStreamGpMo:        opts.wageStreamGpMo        || 0,
    serviceCategory:       opts.serviceCategory       || null
  });
  return _pushRelation(campaign, 'specialistContracts', record, opts.reason || 'specialist-hired');
}

function endSpecialistContract(campaign, contractId, atTurn, reason){
  return _endRelation(campaign, 'specialistContracts', contractId, atTurn, reason || 'specialist-released');
}

function activeSpecialistContractFor(campaign, characterId){
  if(!campaign || !Array.isArray(campaign.specialistContracts)) return null;
  return campaign.specialistContracts.find(c =>
    c.specialistCharacterId === characterId && c.status === 'active'
  ) || null;
}

function specialistContractsByEmployer(campaign, employerCharacterId){
  if(!campaign || !Array.isArray(campaign.specialistContracts)) return [];
  return campaign.specialistContracts.filter(c =>
    c.employerCharacterId === employerCharacterId && c.status === 'active'
  );
}

// =============================================================================
// Hireling contract — short-term hire.
// Subject: at most 1 active. Employer: 0..N.
// =============================================================================

function createHirelingContract(campaign, opts={}){
  const record = global.ACKS.blankHirelingContract({
    id:                  opts.id,
    hirelingCharacterId: opts.hirelingCharacterId || null,
    employerCharacterId: opts.employerCharacterId || null,
    hiredAtTurn:         opts.hiredAtTurn         || 1,
    wageStreamGpMo:      opts.wageStreamGpMo      || 0
  });
  return _pushRelation(campaign, 'hirelingContracts', record, opts.reason || 'hireling-hired');
}

function endHirelingContract(campaign, contractId, atTurn, reason){
  return _endRelation(campaign, 'hirelingContracts', contractId, atTurn, reason || 'hireling-released');
}

function activeHirelingContractFor(campaign, characterId){
  if(!campaign || !Array.isArray(campaign.hirelingContracts)) return null;
  return campaign.hirelingContracts.find(c =>
    c.hirelingCharacterId === characterId && c.status === 'active'
  ) || null;
}

function hirelingContractsByEmployer(campaign, employerCharacterId){
  if(!campaign || !Array.isArray(campaign.hirelingContracts)) return [];
  return campaign.hirelingContracts.filter(c =>
    c.employerCharacterId === employerCharacterId && c.status === 'active'
  );
}

// =============================================================================
// Magistracy — character holds a magistrate role for a domain.
// Per RAW pp.344/351/354/425: 4 roles (captain-of-the-guard / chaplain / munerator / steward).
// (Character, domain, role) tuple is unique among active magistracies — at most one
// holder per (domain, role) slot at a time. A character may hold multiple roles
// across different domains (cross-domain) but not the same role in two domains.
// =============================================================================

function createMagistracy(campaign, opts={}){
  const record = global.ACKS.blankMagistracy({
    id:                    opts.id,
    magistrateCharacterId: opts.magistrateCharacterId || null,
    domainId:              opts.domainId              || null,
    role:                  opts.role                  || null,
    appointedAtTurn:       opts.appointedAtTurn       || 1,
    salaryCategory:        opts.salaryCategory        || null
  });
  return _pushRelation(campaign, 'magistracies', record, opts.reason || 'magistrate-appointed');
}

function endMagistracy(campaign, magistracyId, atTurn, reason){
  return _endRelation(campaign, 'magistracies', magistracyId, atTurn, reason || 'magistrate-dismissed');
}

// The active magistracy a character holds, optionally filtered by domain + role.
function activeMagistracyOf(campaign, characterId, domainId, role){
  if(!campaign || !Array.isArray(campaign.magistracies)) return null;
  return campaign.magistracies.find(m =>
    m.magistrateCharacterId === characterId &&
    m.status === 'active' &&
    (domainId == null || m.domainId === domainId) &&
    (role == null || m.role === role)
  ) || null;
}

// All active magistracies this character holds (across all domains).
function magistraciesByCharacter(campaign, characterId){
  if(!campaign || !Array.isArray(campaign.magistracies)) return [];
  return campaign.magistracies.filter(m =>
    m.magistrateCharacterId === characterId && m.status === 'active'
  );
}

// All current magistrates of a domain (active records).
function magistraciesByDomain(campaign, domainId){
  if(!campaign || !Array.isArray(campaign.magistracies)) return [];
  return campaign.magistracies.filter(m =>
    m.domainId === domainId && m.status === 'active'
  );
}

// =============================================================================
// Vassalage — a vassal domain's oath to a suzerain.
// A vassal domain has at most ONE active vassalage (one liege at a time).
// A suzerain may hold N vassalages (multiple vassals).
// =============================================================================

function createVassalage(campaign, opts={}){
  const record = global.ACKS.blankVassalage({
    id:                      opts.id,
    vassalRulerCharacterId:  opts.vassalRulerCharacterId  || null,
    suzerainCharacterId:     opts.suzerainCharacterId     || null,
    vassalDomainId:          opts.vassalDomainId          || null,
    suzerainDomainId:        opts.suzerainDomainId        || null,
    oathTakenAtTurn:         opts.oathTakenAtTurn         || 1,
    witnessCharacterIds:     opts.witnessCharacterIds     || [],
    recognitionStatus:       opts.recognitionStatus       || 'recognized'
  });
  return _pushRelation(campaign, 'vassalages', record, opts.reason || 'oath-sworn');
}

function endVassalage(campaign, vassalageId, atTurn, reason){
  return _endRelation(campaign, 'vassalages', vassalageId, atTurn, reason || 'oath-dissolved');
}

// The active vassalage for a given vassal domain (≤1 active at a time).
function activeVassalageOf(campaign, vassalDomainId){
  if(!campaign || !Array.isArray(campaign.vassalages)) return null;
  return campaign.vassalages.find(v =>
    v.vassalDomainId === vassalDomainId && v.status === 'active'
  ) || null;
}

// All active vassalages where the given character is the suzerain.
function vassalagesBySuzerain(campaign, suzerainCharacterId){
  if(!campaign || !Array.isArray(campaign.vassalages)) return [];
  return campaign.vassalages.filter(v =>
    v.suzerainCharacterId === suzerainCharacterId && v.status === 'active'
  );
}

// =============================================================================
// Tributary agreement — domain pays tribute to another domain.
// A payer may have multiple active agreements (multi-suzerain tribute).
// A recipient may have many incoming agreements.
// =============================================================================

function createTributaryAgreement(campaign, opts={}){
  const record = global.ACKS.blankTributaryAgreement({
    id:                opts.id,
    payerDomainId:     opts.payerDomainId     || null,
    recipientDomainId: opts.recipientDomainId || null,
    kind:              opts.kind              || 'gp',
    amount:            opts.amount            || 0,
    schedule:          opts.schedule          || 'per-month',
    establishedAtTurn: opts.establishedAtTurn || 1
  });
  return _pushRelation(campaign, 'tributaryAgreements', record, opts.reason || 'tribute-agreed');
}

function endTributaryAgreement(campaign, agreementId, atTurn, reason){
  return _endRelation(campaign, 'tributaryAgreements', agreementId, atTurn, reason || 'tribute-canceled');
}

function activeTributaryAgreementsFrom(campaign, payerDomainId){
  if(!campaign || !Array.isArray(campaign.tributaryAgreements)) return [];
  return campaign.tributaryAgreements.filter(t =>
    t.payerDomainId === payerDomainId && t.status === 'active'
  );
}

function activeTributaryAgreementsTo(campaign, recipientDomainId){
  if(!campaign || !Array.isArray(campaign.tributaryAgreements)) return [];
  return campaign.tributaryAgreements.filter(t =>
    t.recipientDomainId === recipientDomainId && t.status === 'active'
  );
}

// =============================================================================
// #444 — Wave A derived accessors (Architecture.md §3.6, 2026-05-29).
// Compute the role/relation state FROM the active relations. Today these are
// INFORMATIONAL — predicates still read the stored c.socialTier etc. After #445
// migration backfills relation collections from legacy scalar pointers, these
// derived accessors become canonical and the stored fields are dropped.
// =============================================================================

// Computes which social tier a character holds based on their active relations.
// Priority order: henchman > specialist > follower > hireling > independent.
// Returns null if no relations exist (caller falls back to stored c.socialTier).
function derivedSocialTierFor(campaign, characterId){
  if(!campaign || !characterId) return null;
  if(activeHenchmanshipFor(campaign, characterId))         return 'henchman';
  if(activeSpecialistContractFor(campaign, characterId))   return 'specialist';
  if(activeHirelingContractFor(campaign, characterId))     return 'hireling';
  return null;
}

// The character's liege (patron of their active henchmanship), or null.
function derivedLiegeFor(campaign, characterId){
  const h = activeHenchmanshipFor(campaign, characterId);
  return h ? h.patronCharacterId : null;
}

// The character's employer (employer of their active specialist OR hireling
// contract), or null. Specialist takes priority if both somehow exist.
function derivedEmployerFor(campaign, characterId){
  const s = activeSpecialistContractFor(campaign, characterId);
  if(s) return s.employerCharacterId;
  const h = activeHirelingContractFor(campaign, characterId);
  if(h) return h.employerCharacterId;
  return null;
}

// All active magistrate roles this character holds, as {domainId, role} pairs.
// Multi-cardinality (cross-domain, cross-role) is allowed; this returns all.
function derivedMagistrateRolesFor(campaign, characterId){
  return magistraciesByCharacter(campaign, characterId).map(m => ({
    domainId: m.domainId,
    role: m.role,
    magistracyId: m.id
  }));
}

// All vassal domains under this character's suzerainty (the character is
// suzerain on active vassalages). Each entry is the vassal domain ID.
function derivedVassalDomainsOf(campaign, suzerainCharacterId){
  return vassalagesBySuzerain(campaign, suzerainCharacterId).map(v => v.vassalDomainId);
}

// Sum of GP-denominated tribute owed per month by a domain (active agreements
// only, schedule===per-month, kind==='gp'). Multi-suzerain compatible.
function derivedTributeOutflowGpFor(campaign, payerDomainId){
  return activeTributaryAgreementsFrom(campaign, payerDomainId)
    .filter(t => t.kind === 'gp' && t.schedule === 'per-month')
    .reduce((sum, t) => sum + (t.amount || 0), 0);
}

// =============================================================================
// reconcileWaveARelations — load-time invariant check + relational integrity.
// Returns array of warning strings. Empty array = clean. Does NOT mutate the
// campaign (pure diagnostic). Caller decides how to surface warnings (console,
// toast, log, etc.).
// =============================================================================

function reconcileWaveARelations(campaign){
  const warnings = [];
  if(!campaign) return warnings;

  const characterIds = new Set(
    Array.isArray(campaign.characters) ? campaign.characters.map(c => c.id) : []
  );
  const domainIds = new Set(
    Array.isArray(campaign.domains) ? campaign.domains.map(d => d.id) : []
  );

  // Helper: subject-uniqueness check across a collection.
  function checkSubjectUnique(collection, subjectField, label){
    if(!Array.isArray(campaign[collection])) return;
    const byCharacter = new Map();
    for(const r of campaign[collection]){
      if(r.status !== 'active') continue;
      const subj = r[subjectField];
      if(!subj) continue;
      if(!byCharacter.has(subj)) byCharacter.set(subj, []);
      byCharacter.get(subj).push(r.id);
    }
    for(const [subj, recordIds] of byCharacter){
      if(recordIds.length > 1){
        warnings.push(label + ': character ' + subj + ' has ' + recordIds.length +
          ' active relations (expected ≤1). Record IDs: ' + recordIds.join(', '));
      }
    }
  }

  // Helper: orphan-reference check (the referenced id doesn't exist in the campaign).
  function checkOrphanRefs(collection, fields){
    if(!Array.isArray(campaign[collection])) return;
    for(const r of campaign[collection]){
      for(const [field, set, kind] of fields){
        const v = r[field];
        if(v && !set.has(v)){
          warnings.push(collection + '/' + r.id + ': ' + field + ' references ' +
            kind + ' "' + v + '" that does not exist in campaign.' + kind + 's[]');
        }
      }
    }
  }

  // Subject-uniqueness invariants per relation
  checkSubjectUnique('henchmanships',        'subjectCharacterId',    'henchmanship');
  checkSubjectUnique('specialistContracts',  'specialistCharacterId', 'specialistContract');
  checkSubjectUnique('hirelingContracts',    'hirelingCharacterId',   'hirelingContract');

  // Magistracy: (domain, role) tuple must be unique among active records.
  if(Array.isArray(campaign.magistracies)){
    const slotMap = new Map();
    for(const m of campaign.magistracies){
      if(m.status !== 'active') continue;
      const key = (m.domainId || '?') + '|' + (m.role || '?');
      if(!slotMap.has(key)) slotMap.set(key, []);
      slotMap.get(key).push(m.id);
    }
    for(const [key, recordIds] of slotMap){
      if(recordIds.length > 1){
        warnings.push('magistracy: slot ' + key + ' (domain|role) has ' + recordIds.length +
          ' active holders (expected ≤1). Record IDs: ' + recordIds.join(', '));
      }
    }
  }

  // Vassalage: a vassal domain has at most 1 active vassalage.
  if(Array.isArray(campaign.vassalages)){
    const vassalMap = new Map();
    for(const v of campaign.vassalages){
      if(v.status !== 'active') continue;
      if(!v.vassalDomainId) continue;
      if(!vassalMap.has(v.vassalDomainId)) vassalMap.set(v.vassalDomainId, []);
      vassalMap.get(v.vassalDomainId).push(v.id);
    }
    for(const [domId, recordIds] of vassalMap){
      if(recordIds.length > 1){
        warnings.push('vassalage: vassal domain ' + domId + ' has ' + recordIds.length +
          ' active vassalages (expected ≤1). Record IDs: ' + recordIds.join(', '));
      }
    }
  }

  // Orphan-reference checks
  const charField = (f) => [f, characterIds, 'character'];
  const domField  = (f) => [f, domainIds, 'domain'];
  checkOrphanRefs('henchmanships',        [charField('subjectCharacterId'), charField('patronCharacterId')]);
  checkOrphanRefs('specialistContracts',  [charField('specialistCharacterId'), charField('employerCharacterId')]);
  checkOrphanRefs('hirelingContracts',    [charField('hirelingCharacterId'), charField('employerCharacterId')]);
  checkOrphanRefs('magistracies',         [charField('magistrateCharacterId'), domField('domainId')]);
  checkOrphanRefs('vassalages',           [charField('vassalRulerCharacterId'), charField('suzerainCharacterId'),
                                            domField('vassalDomainId'), domField('suzerainDomainId')]);
  checkOrphanRefs('tributaryAgreements',  [domField('payerDomainId'), domField('recipientDomainId')]);

  return warnings;
}

// =============================================================================
// #445 — Legacy backfill migration: scalar pointers → Wave A relation collections.
// Per Architecture.md §3.5 wave plan. Walks existing data on every load and lifts
// legacy storage into the new relation arrays. ADDITIVE — stored fields stay
// canonical for now; predicates still read c.socialTier / c.liegeCharacterId /
// domain.magistrates / domain.liegeId / domain.expenses.tributeToLiege. The
// derived accessors from #444 verify drift. Stage 2 (later) flips predicates to
// read from relations and drops the legacy scalars.
//
// Every migration is IDEMPOTENT — checks for an existing active matching relation
// before creating. Re-running on already-migrated data is a no-op.
// =============================================================================

// camelCase magistrate role key → kebab-case relation role name.
const _MAGISTRATE_ROLE_KEY_TO_RELATION = {
  captainOfGuard: 'captain-of-the-guard',
  chaplain:       'chaplain',
  munerator:      'munerator',
  steward:        'steward'
};
// Same mapping for salaryCategory derivation (RR pp.344-345).
const _MAGISTRATE_ROLE_KEY_TO_OVERSEES = {
  captainOfGuard: 'garrison',
  chaplain:       'tithe',
  munerator:      'liturgy',
  steward:        'maintenance'
};

// Helper: does the character look like a henchman per either stored axis?
function _legacyIsHenchman(c){
  if(!c) return false;
  if(c.socialTier === 'henchman') return true;
  if(c.kind === 'henchman') return true;
  return false;
}
function _legacyIsSpecialist(c){
  if(!c) return false;
  if(c.socialTier === 'specialist') return true;
  if(c.kind === 'specialist') return true;
  return false;
}
function _legacyIsHireling(c){
  if(!c) return false;
  if(c.socialTier === 'hireling') return true;
  if(c.kind === 'hireling') return true;
  return false;
}

// Migrate henchman characters → henchmanship relation records. Idempotent.
function migrateLegacyHenchmanshipsToRelations(campaign){
  if(!campaign || !Array.isArray(campaign.characters)) return 0;
  const baselineTurn = campaign.currentTurn || 1;
  let created = 0;
  for(const c of campaign.characters){
    if(!_legacyIsHenchman(c)) continue;
    if(!c.liegeCharacterId) continue;  // No patron, nothing to link
    if(c.alive === false) continue;     // Dead henchmen don't carry active relations
    // Idempotency: skip if there's already an active henchmanship with the same
    // subject + patron pair.
    const existing = activeHenchmanshipFor(campaign, c.id);
    if(existing && existing.patronCharacterId === c.liegeCharacterId) continue;
    if(existing) continue;  // Different active henchmanship — leave manual fix to reconcile
    createHenchmanship(campaign, {
      subjectCharacterId: c.id,
      patronCharacterId:  c.liegeCharacterId,
      hiredAtTurn:        baselineTurn,
      signingBonusPaidGp: 0,
      wageStreamGpMo:     c.monthlyWage || 0,
      currentLoyalty:     c.loyalty || 0,
      reason:             'migrated-from-legacy-scalar'
    });
    created++;
  }
  return created;
}

// Migrate specialist characters → specialistContract relation records. Idempotent.
function migrateLegacySpecialistContractsToRelations(campaign){
  if(!campaign || !Array.isArray(campaign.characters)) return 0;
  const baselineTurn = campaign.currentTurn || 1;
  let created = 0;
  for(const c of campaign.characters){
    if(!_legacyIsSpecialist(c)) continue;
    if(!c.liegeCharacterId) continue;
    if(c.alive === false) continue;
    const existing = activeSpecialistContractFor(campaign, c.id);
    if(existing && existing.employerCharacterId === c.liegeCharacterId) continue;
    if(existing) continue;
    createSpecialistContract(campaign, {
      specialistCharacterId: c.id,
      employerCharacterId:   c.liegeCharacterId,
      hiredAtTurn:           baselineTurn,
      wageStreamGpMo:        c.monthlyWage || 0,
      serviceCategory:       null,
      reason:                'migrated-from-legacy-scalar'
    });
    created++;
  }
  return created;
}

// Migrate hireling characters → hirelingContract relation records. Idempotent.
function migrateLegacyHirelingContractsToRelations(campaign){
  if(!campaign || !Array.isArray(campaign.characters)) return 0;
  const baselineTurn = campaign.currentTurn || 1;
  let created = 0;
  for(const c of campaign.characters){
    if(!_legacyIsHireling(c)) continue;
    if(!c.liegeCharacterId) continue;
    if(c.alive === false) continue;
    const existing = activeHirelingContractFor(campaign, c.id);
    if(existing && existing.employerCharacterId === c.liegeCharacterId) continue;
    if(existing) continue;
    createHirelingContract(campaign, {
      hirelingCharacterId: c.id,
      employerCharacterId: c.liegeCharacterId,
      hiredAtTurn:         baselineTurn,
      wageStreamGpMo:      c.monthlyWage || 0,
      reason:              'migrated-from-legacy-scalar'
    });
    created++;
  }
  return created;
}

// Migrate domain.magistrates map → magistracy relation records. Idempotent.
// The legacy shape is {captainOfGuard:{characterId,...}, chaplain:{...}, ...}
function migrateLegacyMagistraciesToRelations(campaign){
  if(!campaign || !Array.isArray(campaign.domains)) return 0;
  const baselineTurn = campaign.currentTurn || 1;
  let created = 0;
  for(const d of campaign.domains){
    if(!d || !d.magistrates || typeof d.magistrates !== 'object') continue;
    for(const camelRoleKey of Object.keys(_MAGISTRATE_ROLE_KEY_TO_RELATION)){
      const slot = d.magistrates[camelRoleKey];
      if(!slot || !slot.characterId) continue;
      const relationRole = _MAGISTRATE_ROLE_KEY_TO_RELATION[camelRoleKey];
      // Idempotency: skip if an active magistracy already exists with the same
      // (character, domain, role) tuple.
      const existing = activeMagistracyOf(campaign, slot.characterId, d.id, relationRole);
      if(existing) continue;
      createMagistracy(campaign, {
        magistrateCharacterId: slot.characterId,
        domainId:              d.id,
        role:                  relationRole,
        appointedAtTurn:       baselineTurn,
        salaryCategory:        _MAGISTRATE_ROLE_KEY_TO_OVERSEES[camelRoleKey],
        reason:                'migrated-from-legacy-scalar'
      });
      created++;
    }
  }
  return created;
}

// Migrate domain.liegeId → vassalage relation records. Idempotent.
// suzerainCharacterId is resolved via the liege domain's rulerCharacterId.
function migrateLegacyVassalagesToRelations(campaign){
  if(!campaign || !Array.isArray(campaign.domains)) return 0;
  const baselineTurn = campaign.currentTurn || 1;
  let created = 0;
  const domainById = new Map(campaign.domains.map(d => [d.id, d]));
  for(const d of campaign.domains){
    if(!d || !d.liegeId) continue;
    // Idempotency: only one active vassalage per vassal domain.
    if(activeVassalageOf(campaign, d.id)) continue;
    const liegeDomain = domainById.get(d.liegeId);
    createVassalage(campaign, {
      vassalRulerCharacterId:  d.rulerCharacterId || null,
      suzerainCharacterId:     (liegeDomain && liegeDomain.rulerCharacterId) || null,
      vassalDomainId:          d.id,
      suzerainDomainId:        d.liegeId,
      oathTakenAtTurn:         baselineTurn,
      witnessCharacterIds:     [],
      recognitionStatus:       'recognized',
      reason:                  'migrated-from-legacy-scalar'
    });
    created++;
  }
  return created;
}

// Migrate domain.expenses.tributeToLiege → tributaryAgreement records. Idempotent.
function migrateLegacyTributesToRelations(campaign){
  if(!campaign || !Array.isArray(campaign.domains)) return 0;
  const baselineTurn = campaign.currentTurn || 1;
  let created = 0;
  for(const d of campaign.domains){
    if(!d || !d.expenses) continue;
    const amount = d.expenses.tributeToLiege || 0;
    if(amount <= 0) continue;
    if(!d.liegeId) continue;  // Tribute requires a destination
    // Idempotency: skip if an active per-month gp tribute already exists from
    // this payer to this recipient.
    const existing = activeTributaryAgreementsFrom(campaign, d.id).find(t =>
      t.recipientDomainId === d.liegeId &&
      t.kind === 'gp' &&
      t.schedule === 'per-month'
    );
    if(existing) continue;
    createTributaryAgreement(campaign, {
      payerDomainId:     d.id,
      recipientDomainId: d.liegeId,
      kind:              'gp',
      amount:            amount,
      schedule:          'per-month',
      establishedAtTurn: baselineTurn,
      reason:            'migrated-from-legacy-scalar'
    });
    created++;
  }
  return created;
}

// Orchestrator: runs all six migrations. Returns counts per category.
function migrateLegacyToWaveARelations(campaign){
  return {
    henchmanships:        migrateLegacyHenchmanshipsToRelations(campaign),
    specialistContracts:  migrateLegacySpecialistContractsToRelations(campaign),
    hirelingContracts:    migrateLegacyHirelingContractsToRelations(campaign),
    magistracies:         migrateLegacyMagistraciesToRelations(campaign),
    vassalages:           migrateLegacyVassalagesToRelations(campaign),
    tributaryAgreements:  migrateLegacyTributesToRelations(campaign)
  };
}

// =============================================================================
// Character predicates — canonical accessors (Architecture.md §2.6).
// Engine + UI consumers MUST use these instead of reading c.kind directly.
// Each predicate reads exclusively from the five-axis fields (controlledBy /
// socialTier / lifecycleState / creatureTypes). Per #453 (2026-05-29), c.kind
// is fully retired — migrateCharacterClassification deletes it on every load,
// and no UI surface writes it anymore. Legacy fallback paths removed.
// =============================================================================

const _DESTROYED_AT_ZERO_HP_TYPES = new Set(['construct','incarnation','ooze','plant','undead']);
const _RETAINER_TIERS = new Set(['hireling','specialist','mercenary','follower','henchman','slave']);
const _LOYALTY_TRACKED_TIERS = new Set(['henchman','specialist','follower','hireling','mercenary']);

// --- Agency axis (controlledBy) ---
function isPlayerControlled(c){
  if(!c) return false;
  return c.controlledBy === 'player';
}
function isGMControlled(c){
  if(!c) return false;
  return c.controlledBy === 'gm';
}

// --- Lifecycle axis ---
function isActive(c){
  if(!c) return false;
  return c.lifecycleState === 'active';
}
function isCandidate(c){
  if(!c) return false;
  return c.lifecycleState === 'candidate';
}
function isDeparted(c){
  if(!c) return false;
  return c.lifecycleState === 'departed';
}
function isDeceased(c){
  if(!c) return false;
  return c.lifecycleState === 'deceased';
}
function isImprisoned(c){
  if(!c) return false;
  return c.lifecycleState === 'imprisoned';
}
function isDominated(c){
  if(!c) return false;
  return c.lifecycleState === 'dominated';
}

// --- Creature type axis ---
function isDestroyedAtZeroHP(c){
  if(!c || !Array.isArray(c.creatureTypes)) return false;
  return c.creatureTypes.some(t => _DESTROYED_AT_ZERO_HP_TYPES.has(t));
}

// --- Social tier axis ---
function isHenchman(c){
  if(!c) return false;
  return c.socialTier === 'henchman';
}
function isSpecialist(c){
  if(!c) return false;
  return c.socialTier === 'specialist';
}
function isFollower(c){
  if(!c) return false;
  return c.socialTier === 'follower';
}
function isHireling(c){
  if(!c) return false;
  return c.socialTier === 'hireling';
}
function isMercenaryOfficer(c){
  if(!c) return false;
  return c.socialTier === 'mercenary';
}

// --- Derived role-class predicates ---
function isRetainer(c){
  if(!c) return false;
  return _RETAINER_TIERS.has(c.socialTier);
}
function isLoyaltyTracked(c){
  if(!c || !isActive(c)) return false;
  return _LOYALTY_TRACKED_TIERS.has(c.socialTier);
}
function isCommanderEligible(c){
  if(!c) return false;
  if(!isActive(c)) return false;
  // Leadership-Ability proxy until #440 lands the formal class-power check:
  // a positive henchmanCap signals the character carries Leadership.
  return (c.henchmanCap || 0) > 0;
}

// --- Role-from-relation predicates (canonical accessors per §3) ---
// Rules a domain that has a liege (i.e. is itself a vassal realm).
function isVassalRuler(c, campaign){
  if(!c || !campaign || !Array.isArray(campaign.domains)) return false;
  return campaign.domains.some(d =>
    d.rulerCharacterId === c.id && d.liegeId != null
  );
}

// --- UI display helpers ---
function displayKind(c){
  if(!c) return '';
  if(isCandidate(c)) return 'Candidate';
  if(isPlayerControlled(c)) return 'PC';
  if(isHenchman(c)) return 'Henchman';
  if(isSpecialist(c)) return 'Specialist';
  if(isFollower(c)) return 'Follower';
  if(isHireling(c)) return 'Hireling';
  if(isMercenaryOfficer(c)) return 'Mercenary';
  return 'NPC';
}
function lifecycleLabel(c){
  if(!c) return '';
  if(isDeceased(c)) return 'Deceased';
  if(isCandidate(c)) return 'Candidate';
  if(isDeparted(c)) return 'Departed';
  if(isImprisoned(c)) return 'Imprisoned';
  if(isDominated(c)) return 'Dominated';
  return 'Active';
}

// --- Mutators ---

// Add (or update, if already present) a reach entry on a rumor.
function addRumorReach(rumor, settlementId, apparentLevel, gainedAtTurn, distortedText){
  if(!rumor || !settlementId) return null;
  if(!Array.isArray(rumor.reach)) rumor.reach = [];
  const existing = rumor.reach.find(rch => rch.settlementId === settlementId);
  if(existing){
    // Refresh apparentLevel + distortedText if provided; preserve gainedAtTurn
    if(apparentLevel) existing.apparentLevel = apparentLevel;
    if(distortedText !== undefined) existing.distortedText = distortedText;
    return existing;
  }
  const entry = {
    settlementId: settlementId,
    apparentLevel: apparentLevel || 'uncommon',
    gainedAtTurn: gainedAtTurn != null ? gainedAtTurn : null,
    distortedText: distortedText != null ? distortedText : null
  };
  rumor.reach.push(entry);
  return entry;
}

function removeRumorReach(rumor, settlementId){
  if(!rumor || !Array.isArray(rumor.reach)) return false;
  const before = rumor.reach.length;
  rumor.reach = rumor.reach.filter(rch => rch.settlementId !== settlementId);
  return rumor.reach.length < before;
}

// --- Migration: lift nested storage to top-level collections ---

function liftToTopLevelCollections(campaign){
  if(!campaign || typeof campaign !== 'object') return;
  // Initialize the collections if absent
  if(!Array.isArray(campaign.hexes))       campaign.hexes = [];
  if(!Array.isArray(campaign.settlements)) campaign.settlements = [];
  if(!Array.isArray(campaign.rumors))      campaign.rumors = [];

  const existingHexIds        = new Set(campaign.hexes.map(h => h.id));
  const existingSettlementIds = new Set(campaign.settlements.map(s => s.id));
  const existingRumorIds      = new Set(campaign.rumors.map(r => r.id));

  (campaign.domains||[]).forEach(d => {
    const legacyHexes = d.geography?.hexes;
    if(!Array.isArray(legacyHexes) || legacyHexes.length === 0) return;
    legacyHexes.forEach(h => {
      // Lift the hex (preserving object reference — Decision 9.1, default)
      if(!h.domainId) h.domainId = d.id;
      if(!existingHexIds.has(h.id)){
        campaign.hexes.push(h);
        existingHexIds.add(h.id);
      }
      // Lift the settlement, if any
      const legacySettlement = h.settlement;
      if(legacySettlement && legacySettlement.id){
        if(!legacySettlement.hexId) legacySettlement.hexId = h.id;
        if(!existingSettlementIds.has(legacySettlement.id)){
          campaign.settlements.push(legacySettlement);
          existingSettlementIds.add(legacySettlement.id);
        }
        // Lift the settlement's rumors. Note: rumors are restructured — the old per-settlement
        // copies become reach[] entries on a single top-level rumor.
        const legacyRumors = Array.isArray(legacySettlement.rumors) ? legacySettlement.rumors : [];
        legacyRumors.forEach(r => {
          if(existingRumorIds.has(r.id)){
            // Already top-level. Ensure reach includes this settlement.
            const topRumor = campaign.rumors.find(x => x.id === r.id);
            if(topRumor) addRumorReach(topRumor, legacySettlement.id, r.apparentLevel, null, null);
            return;
          }
          // Move the rumor to top-level with a single reach entry pointing at this settlement.
          // Preserve fields we know about; reach replaces the per-settlement apparent/gainedAt info.
          const lifted = {
            schemaVersion: r.schemaVersion || SCHEMA_VERSION,
            id: r.id,
            text: r.text || '',
            truthLevel: r.truthLevel || 'unknown',
            topic: r.topic || 'other',
            reach: [{
              settlementId: legacySettlement.id,
              apparentLevel: r.apparentLevel || 'uncommon',
              gainedAtTurn: null,
              distortedText: null
            }],
            origin: r.origin || { submittedAt: new Date().toISOString(), submittedBy: 'gm', sourceEventId: null, sourceCharacterId: null },
            proliferation: r.proliferation ? { enabled: r.proliferation.enabled || false, chancePerMonth: r.proliferation.chancePerMonth || 0 } : { enabled: false, chancePerMonth: 0 },
            history: Array.isArray(r.history) ? r.history.slice() : [],
            notes: r.notes || ''
          };
          campaign.rumors.push(lifted);
          existingRumorIds.add(lifted.id);
        });
        // Clear the legacy nested rumors array — they're now top-level. Per-settlement rumor[] is
        // the one shape that genuinely changes; the rumor data has been moved, not copied.
        legacySettlement.rumors = [];
      }
    });
    // NOTE: We intentionally do NOT clear d.geography.hexes[]. Hexes (and their settlement
    // references) live by reference in both campaign.hexes[] and d.geography.hexes[] during
    // this transition pass. Old code that walks the legacy path keeps working, mutations
    // through either path propagate to both. The next schema bump (or a future cleanup pass)
    // can remove the legacy field; for now we ship both as views of the same data.
    //
    // Ref re-unification: after a save→load round-trip, the JSON parse creates two separate
    // JS objects for each hex (one in d.geography.hexes, one in campaign.hexes). Replace each
    // legacy entry with the top-level reference, matched by id, so mutations stay coherent.
    if(Array.isArray(d.geography.hexes)){
      d.geography.hexes = d.geography.hexes.map(h => {
        const topRef = campaign.hexes.find(x => x.id === h.id);
        if(!topRef) return h;
        // Also re-unify h.settlement against campaign.settlements
        if(topRef.settlement && topRef.settlement.id){
          const topSet = campaign.settlements.find(s => s.id === topRef.settlement.id);
          if(topSet) topRef.settlement = topSet;
        }
        return topRef;
      });
    }
  });
}

// =============================================================================
// 9.8 TURN ORCHESTRATION (Foundation #15 — partial lift, helpers-callback pattern)
// =============================================================================
// proposeMonthlyTurn() and commitTurn() are the two consequential operations
// in the system. They orchestrate per-domain math, event application, vagary
// resolution, passive investment payouts, level-up sweeps, henchman loyalty
// drift, rumor auto-emit, and calendar advance. Originally these lived in the
// Alpine UI as instance methods; lifting the orchestration into the engine
// completes the data-layer-as-platform goal documented in Data_Layer_Audit.md.
//
// HELPERS CONTRACT — the caller must provide a `helpers` object with these
// methods. Most are pure computations over (campaign, domain) and could be
// lifted into the engine as well (tracked as a follow-up). For now they live
// in the caller so we can ship the orchestration lift without porting every
// helper at once. A third-party tool that wants to run a turn must implement
// or stub these helpers — the orchestration shape itself is fully in the engine.
//
// For proposeMonthlyTurn:
//   summarizeEventTarget(event) -> string
//   summarizeEventPayload(event) -> string
//   effectiveClassification(domain) -> string
//   effectiveRuler(domain) -> ruler-shape ({name, class, level, ...})
//   totalFamilies(domain) -> number
//   incomeBreakdown(domain) -> [{label, gp}]
//   expenseBreakdown(domain) -> [{label, gp}]
//   incomeFactor(morale) -> number
//   moraleModifiersFor(domain) -> [{label, mod}]
//   hexSettlements(domain) -> [{hexIndex, settlement}]
//   settlementMarketClass(settlement) -> string
//   settlementCapacity(settlement) -> number
//
// For commitTurn:
//   incomeSum(proposalRow) -> number
//   expenseSum(proposalRow) -> number
//   moraleModSum(proposalRow) -> number
//   totalFamilies(domain) -> number
//   effectiveUrbanFamilies(domain) -> number
//   domainXpFromNet(domain, net) -> number
//   rulerCharacter(domain) -> character or null
//   addCharacterHistory(character, type, summary, extra) -> void (mutates character)
//   applyVagaryToVenture(venture, vagaryProposal) -> string (summary) or null
//   processPassiveInvestmentsForTurn() -> {totalGp, payouts}
//   checkAllCharacterLevelUps() -> [{character, levelUps}]
//   isHouseRuleEnabled(id) -> boolean (will be replaced by ACKS.isHouseRuleEnabled in #196)
//
// Both functions are pure-data: no DOM, no console, no Alpine. Side effects
// happen via campaign mutation (for state changes) and the returned logEntries
// array (for log messages the caller can render or persist however it wants).

function proposeMonthlyTurn(campaign, domains, helpers, options){
  options = options || {};
  if(!campaign) return { error: 'No campaign loaded', turnEventProposals: [], turnVentureProposals: [], turnProposal: [] };
  if(!Array.isArray(domains) || domains.length === 0){
    return { error: 'No domains to advance.', turnEventProposals: [], turnVentureProposals: [], turnProposal: [] };
  }

  if(!Array.isArray(campaign.pendingEvents)) campaign.pendingEvents = [];
  if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];

  const currentTurn = campaign.currentTurn || 1;

  // Gather pending events targeting this turn (or earlier).
  const pending = global.ACKS.eventsTargetingTurn(campaign, currentTurn);
  const turnEventProposals = pending.map(ev => ({
    eventId: ev.id,
    event: ev,
    decision: 'accept',
    gmNotes: ev.gmNotes || '',
    kindLabel: ev.kind,
    submitterLabel: ev.submittedBy,
    targetSummary: helpers.summarizeEventTarget(ev),
    payloadSummary: helpers.summarizeEventPayload(ev)
  }));

  // Phase 2b.5 — roll one vagary per in-transit venture.
  const turnVentureProposals = (campaign.ventures || [])
    .filter(v => v.status === 'in-transit')
    .map(v => {
      const vagary = global.ACKS.rollVagary();
      return {
        ventureId: v.id,
        venturerName: v.venturerName,
        originDomainId: v.originDomainId,
        destinationDomainId: v.destinationDomainId,
        totalInvestment: v.totalInvestment || 0,
        currentlyExpectedTurn: v.expectedArrivalTurn || 0,
        vagaryId: vagary.id,
        vagaryName: vagary.name,
        vagaryText: vagary.text,
        vagaryEffect: vagary.effect,
        vagaryEffectValue: vagary.effectValue || 0,
        vagarySeverity: vagary.severity,
        applyEffect: vagary.effect !== 'none'
      };
    });

  // Per-domain proposal rows.
  const turnProposal = domains.map(d => {
    try {
      return {
        domainId: d.id,
        domainName: d.name,
        classification: helpers.effectiveClassification(d),
        ruler: helpers.effectiveRuler(d),
        tithePaid: d.expenses.tithePaid !== false,
        tributePaid: d.expenses.tributePaid !== false,
        administersThisMonth: !!d.administersThisMonth,
        hasLiege: !!d.liegeId,
        moraleBefore: d.demographics.morale,
        populationBefore: helpers.totalFamilies(d),
        treasuryBefore: d.treasury.gp || 0,
        income: helpers.incomeBreakdown(d).map(r => ({...r})),
        expenses: helpers.expenseBreakdown(d).map(r => ({...r})),
        incomeFactor: helpers.incomeFactor(d.demographics.morale),
        moraleMods: helpers.moraleModifiersFor(d).map(m => ({...m})),
        moraleRoll: rollD6() + rollD6(),
        event: global.ACKS.sampleEvent(d.demographics.morale),
        hasPlayerInput: !!d.pendingPlayerInput,
        urbanInvestments: helpers.hexSettlements(d).map(({hexIndex, settlement}) => ({
          hexIndex,
          settlementName: settlement.name || '(unnamed)',
          marketClass: helpers.settlementMarketClass(settlement),
          currentFamilies: settlement.families || 0,
          capacity: helpers.settlementCapacity(settlement),
          amount: 0
        })),
        // Foundation #17 — incremental accumulation. Each hex's agricultural order is a gp amount
        // (not a boolean). The GM can allocate any value. proposeMonthlyTurn pre-seeds it from
        // hex.queuedImprovementGp (set in the Hexes tab prep section). commitTurn adds gpAmount
        // to hex.landImprovementInvested and ratchets +1 per 25k accumulated.
        agriculturalOrders: (d.geography?.hexes || []).map((h, hexIndex) => {
          const base = h.valuePerFamily || 0;
          const bonus = h.landImprovementBonus || 0;
          const invested = h.landImprovementInvested || 0;
          const effective = Math.min(global.ACKS.AGRICULTURAL_IMPROVEMENT_VALUE_CAP, base + bonus);
          const atBonusCap = bonus >= global.ACKS.AGRICULTURAL_IMPROVEMENT_MAX_BONUS;
          const atValueCap = effective >= global.ACKS.AGRICULTURAL_IMPROVEMENT_VALUE_CAP;
          return {
            hexIndex,
            hexId: h.id,
            coordStr: '(' + (h.coord?.q || 0) + ',' + (h.coord?.r || 0) + ')',
            baseValue: base,
            currentBonus: bonus,
            currentInvested: invested,
            effectiveValue: effective,
            eligible: !atBonusCap && !atValueCap,
            ineligibleReason: atValueCap ? 'at 9gp cap' : atBonusCap ? 'at +3 bonus cap' : '',
            gpAmount: h.queuedImprovementGp || 0,
            // Foundation #18 — supervisors assigned to this hex. Modal can adjust the list before
            // commit; commitTurn re-reads hex.constructionSupervisorCharacterIds. Array form
            // supports multiple co-supervisors per RR p.174 ("Multiple engineers or siege
            // engineers may work together to supervise large projects").
            supervisorCharacterIds: Array.isArray(h.constructionSupervisorCharacterIds)
              ? h.constructionSupervisorCharacterIds.slice()
              : (h.constructionSupervisorCharacterId ? [h.constructionSupervisorCharacterId] : [])
          };
        }),
        gmNotes: '',
        skip: false,
        askClaude: false
      };
    } catch(e){
      return { domainId: d.id, _error: e.message };
    }
  }).filter(p => !p._error);

  return {
    error: null,
    turnEventProposals,
    turnVentureProposals,
    turnProposal
  };
}

function commitTurn(campaign, domains, proposal, helpers){
  if(!campaign || !proposal) return { committed: 0, logEntries: [], error: 'No campaign or proposal' };

  const logEntries = [];
  const turnEventProposals = proposal.turnEventProposals || [];
  const turnVentureProposals = proposal.turnVentureProposals || [];
  const turnProposal = proposal.turnProposal || [];

  let committed = 0;
  const currentTurnNum = campaign.currentTurn || 1;

  if(!Array.isArray(campaign.pendingEvents)) campaign.pendingEvents = [];
  if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];

  // === EVENT APPLY PASS ===
  // Per Decision 2 (locked): timed events sort by gameTimeAt; untimed by submittedAt.
  // Attach domains to campaign so applyEvent handlers traverse them.
  const _origCampaignDomains = campaign.domains;
  campaign.domains = domains;
  try {
    const accepted = turnEventProposals.filter(ep => ep.decision === 'accept').map(ep => ep.event);
    const rejected = turnEventProposals.filter(ep => ep.decision === 'reject');
    const sortedAccepted = global.ACKS.sortEventsForApply(accepted);

    sortedAccepted.forEach(ev => {
      try {
        const epProposal = turnEventProposals.find(ep => ep.eventId === ev.id);
        if(epProposal && epProposal.gmNotes != null) ev.gmNotes = epProposal.gmNotes;
        const applyResult = global.ACKS.applyEvent(campaign, ev);
        ev.status = global.ACKS.EVENT_STATUS.APPLIED;
        ev.appliedAtTurn = currentTurnNum;
        campaign.eventLog.push({
          event: ev,
          result: applyResult.result,
          appliedAtTurn: currentTurnNum,
          appliedAt: new Date().toISOString()
        });
        logEntries.push('[event applied] ' + ev.kind + ' by ' + ev.submittedBy + ': ' + (applyResult.result?.narrativeSummary || ''));
      } catch(e){
        ev.status = global.ACKS.EVENT_STATUS.REJECTED;
        ev.appliedAtTurn = currentTurnNum;
        ev.gmNotes = (ev.gmNotes || '') + (ev.gmNotes ? ' · ' : '') + 'engine error: ' + e.message;
        campaign.eventLog.push({
          event: ev,
          result: { domainsChanged: [], charactersChanged: [], hexesChanged: [], treasuryDelta: 0, narrativeSummary: 'Engine error: ' + e.message },
          appliedAtTurn: currentTurnNum,
          appliedAt: new Date().toISOString()
        });
      }
    });

    rejected.forEach(ep => {
      const ev = ep.event;
      if(ep.gmNotes != null) ev.gmNotes = ep.gmNotes;
      ev.status = global.ACKS.EVENT_STATUS.REJECTED;
      ev.appliedAtTurn = currentTurnNum;
      campaign.eventLog.push({
        event: ev,
        result: { domainsChanged: [], charactersChanged: [], hexesChanged: [], treasuryDelta: 0, narrativeSummary: 'Rejected by GM' + (ep.gmNotes ? ': ' + ep.gmNotes : '') },
        appliedAtTurn: currentTurnNum,
        appliedAt: new Date().toISOString()
      });
    });

    // Remove applied + rejected from pendingEvents; skip-this-turn stays.
    campaign.pendingEvents = campaign.pendingEvents.filter(e => e.status === global.ACKS.EVENT_STATUS.PENDING);
  } finally {
    campaign.domains = _origCampaignDomains;
  }

  // === PER-DOMAIN STANDARD TURN MATH ===
  turnProposal.forEach(p => {
    if(p.skip) return;
    const d = domains.find(x => x.id === p.domainId);
    if(!d) return;

    d.expenses.tithePaid = p.tithePaid;
    if(p.hasLiege) d.expenses.tributePaid = p.tributePaid;
    d.administersThisMonth = p.administersThisMonth;

    const gross = helpers.incomeSum(p);
    const grossAdj = Math.round(gross * p.incomeFactor);
    const expenses = helpers.expenseSum(p);
    const net = grossAdj - expenses;
    const modSum = helpers.moraleModSum(p);
    const adjusted = (p.moraleRoll || 0) + modSum;
    const base = baseMoraleFromClassification(p.classification, p.ruler);
    const moraleChange = moraleChangeFromRoll(adjusted, p.moraleBefore, base);
    const moraleAfter = clamp(p.moraleBefore + moraleChange, -4, 4);

    const familiesK = Math.max(1, Math.ceil(d.demographics.peasantFamilies / 1000));
    const naturalIncrease = rollNaturalIncrease(familiesK, moraleAfter);
    const naturalDecrease = rollNaturalDecrease(familiesK);
    const moraleExtra = rollMoraleExtra(moraleAfter, familiesK);
    const popDelta = naturalIncrease - naturalDecrease + moraleExtra;
    const populationAfter = Math.max(0, helpers.totalFamilies(d) + popDelta);

    const snapshotBefore = {
      peasantFamilies: d.demographics.peasantFamilies,
      urbanFamilies: d.demographics.urbanFamilies,
      morale: d.demographics.morale,
      treasuryGp: d.treasury.gp
    };
    _applyDomainTreasuryDelta(campaign, d, net, { reason:'monthly-net-income', label:'monthly net income' });
    d.demographics.morale = moraleAfter;
    // Foundation #241 — go through the canonical setter so `hex.families` stays in sync.
    setPeasantPopulation(d, (d.demographics.peasantFamilies || 0) + popDelta);
    d.administersThisMonth = false;

    // Urban settlement growth (RR p.351).
    const urbanInvestmentResults = [];
    const urbanGrowthResults = [];
    let totalInvestmentSpent = 0, totalUrbanFamiliesGained = 0;
    (d.geography?.hexes || []).forEach((hex, hexIdx) => {
      if(!hex.settlement) return;
      const s = hex.settlement;
      const before = s.families || 0;
      const settK = Math.max(1, Math.ceil(before / 1000));
      const natInc = rollNaturalIncrease(settK, moraleAfter);
      const natDec = rollNaturalDecrease(settK);
      const moraleExtraUrban = rollMoraleExtra(moraleAfter, settK);
      const invLine = (p.urbanInvestments || []).find(inv => inv.hexIndex === hexIdx);
      const investAmount = Math.floor(invLine?.amount || 0);
      const thousands = Math.floor(investAmount / 1000);
      let investImmigrants = 0;
      for(let k = 0; k < thousands; k++) investImmigrants += 1 + Math.floor(Math.random() * 10);
      let target = before + natInc - natDec + moraleExtraUrban + investImmigrants;
      target = Math.max(0, target);
      const newInvestment = (s.totalInvestment || 0) + investAmount;
      const cap = urbanMaxFamilies(newInvestment);
      let capped = false;
      if(cap > 0 && target > cap){ target = cap; capped = true; }
      s.totalInvestment = newInvestment;
      s.families = target;
      const delta = target - before;
      if(investAmount > 0){
        totalInvestmentSpent += investAmount;
        totalUrbanFamiliesGained += investImmigrants;
        urbanInvestmentResults.push({ settlementName: s.name, hexCoord: hex.coord, amount: investAmount, familiesGained: investImmigrants });
      }
      if(delta !== 0 || before > 0){
        urbanGrowthResults.push({
          settlementName: s.name, hexCoord: hex.coord,
          before, after: target, delta,
          naturalIncrease: natInc, naturalDecrease: natDec, moraleExtra: moraleExtraUrban,
          investImmigrants, cappedAt: capped ? cap : null
        });
      }
    });
    _applyDomainTreasuryDelta(campaign, d, -totalInvestmentSpent, { reason:'urban-investment', label:'urban settlement investment' });

    // Agricultural investments (RR p.341, p.174) — Foundation #17 incremental model + Foundation #18
    // realistic-construction house rule. Each hex's order is a gpAmount (any value the GM allocated).
    // The amount is added to hex.landImprovementInvested, then global.ACKS.ratchetAgriculturalImprovement
    // consumes 25,000gp at a time into +1 bonus steps (capped at +3 / effective 9). Treasury debited
    // by actual amount committed; GM cannot spend more than treasury holds.
    //
    // When realistic-construction is on:
    //   - Each in-progress project requires an assigned supervisor character whose
    //     constructionSupervisorCap is ≥ the project's REMAINING construction cost.
    //   - Total construction allocations across all projects in this domain may not exceed
    //     the domain's monthlyLaborCapGp this month.
    //   - Allocations without a supervisor or that exceed the labor pool are skipped + logged.
    const agOrdersResults = [];
    let totalAgriculturalSpent = 0;
    const realisticOn = helpers.isHouseRuleEnabled('realistic-construction');
    const laborCap = (realisticOn && (d.monthlyLaborCapGp || 0) > 0) ? d.monthlyLaborCapGp : Infinity;
    let laborConsumed = 0;
    // Look up a character on the campaign roster by id (legacy-safe).
    const findCharacterById = (id) => {
      if(!id) return null;
      return (campaign.characters || []).find(c => c.id === id) || null;
    };
    (p.agriculturalOrders || []).forEach(ord => {
      const gpAmount = Math.max(0, Number(ord.gpAmount) || 0);
      const hex = d.geography?.hexes?.[ord.hexIndex];
      if(!hex) return;
      // Ensure migration is applied lazily — old saves may still have only the singular field.
      if(!Array.isArray(hex.constructionSupervisorCharacterIds)){
        hex.constructionSupervisorCharacterIds = hex.constructionSupervisorCharacterId
          ? [hex.constructionSupervisorCharacterId] : [];
      }
      // Foundation #18 — persist the modal's supervisor selection back to the hex BEFORE any
      // early returns. This lets the GM tweak the supervisor mid-review even if they choose
      // not to allocate gp this turn. Modal mutates ord.supervisorCharacterIds (array); also
      // accept the legacy ord.supervisorCharacterId for older client code.
      if(Array.isArray(ord.supervisorCharacterIds)){
        hex.constructionSupervisorCharacterIds = ord.supervisorCharacterIds.filter(Boolean);
      } else if(ord.supervisorCharacterId !== undefined){
        hex.constructionSupervisorCharacterIds = ord.supervisorCharacterId
          ? [ord.supervisorCharacterId] : [];
      }
      // Keep the legacy singular field in sync as the first supervisor (best-effort back-compat).
      hex.constructionSupervisorCharacterId = hex.constructionSupervisorCharacterIds[0] || null;
      if(gpAmount === 0) return;
      // Skip if hex already capped — no point accepting more investment.
      const base = hex.valuePerFamily || 0;
      const bonus = hex.landImprovementBonus || 0;
      if(bonus >= global.ACKS.AGRICULTURAL_IMPROVEMENT_MAX_BONUS) return;
      if(base + bonus >= global.ACKS.AGRICULTURAL_IMPROVEMENT_VALUE_CAP) return;
      // Realistic-construction supervisor validation. Multiple supervisors can co-supervise
      // (caps are additive per RR p.174); only on-site supervisors count. A supervisor is
      // considered on-site if currentHexId === hex.id, OR if currentHexId is unset (permissive
      // fallback for legacy data — Phase 2.6.6 character locations are still being filled in).
      let supervisorOk = true;
      let supervisorBlock = '';
      let totalSupervisorCap = 0;
      const supervisorReport = []; // per-supervisor diagnostics
      if(realisticOn){
        const ids = hex.constructionSupervisorCharacterIds || [];
        if(ids.length === 0){
          supervisorOk = false;
          supervisorBlock = 'no supervisor assigned';
        } else {
          ids.forEach(sid => {
            const sup = findCharacterById(sid);
            if(!sup){
              supervisorReport.push({ id: sid, name: '(missing)', onSite: false, cap: 0, reason: 'character not found' });
              return;
            }
            const cap = sup.constructionSupervisorCap || 0;
            const onSite = !sup.currentHexId || sup.currentHexId === hex.id;
            if(cap <= 0){
              supervisorReport.push({ id: sid, name: sup.name, onSite, cap, reason: 'not a construction supervisor (cap = 0)' });
              return;
            }
            if(!onSite){
              supervisorReport.push({ id: sid, name: sup.name, onSite: false, cap, reason: 'not on-site (at a different hex)' });
              return;
            }
            supervisorReport.push({ id: sid, name: sup.name, onSite: true, cap });
            totalSupervisorCap += cap;
          });
          const remainingThisStep = global.ACKS.AGRICULTURAL_IMPROVEMENT_COST_PER_STEP - (hex.landImprovementInvested || 0);
          if(totalSupervisorCap <= 0){
            supervisorOk = false;
            const issues = supervisorReport.filter(r => r.reason).map(r => r.name + ': ' + r.reason).join('; ');
            supervisorBlock = 'no eligible on-site supervisor (' + (issues || 'none') + ')';
          } else if(totalSupervisorCap < remainingThisStep){
            supervisorOk = false;
            supervisorBlock = 'combined on-site supervisor cap (' + totalSupervisorCap.toLocaleString()
              + 'gp) below remaining step cost (' + remainingThisStep.toLocaleString() + 'gp)';
          }
        }
      }
      if(!supervisorOk){
        agOrdersResults.push({
          hexIndex: ord.hexIndex, coordStr: ord.coordStr, baseValue: base,
          gpSpent: 0, oldBonus: bonus, newBonus: bonus, stepsApplied: 0,
          remainingInvested: hex.landImprovementInvested || 0,
          blocked: true, blockReason: supervisorBlock,
          supervisorReport
        });
        return;
      }
      // Clip to treasury, then to labor cap remainder.
      const affordable = Math.min(gpAmount, Math.max(0, d.treasury.gp || 0), laborCap - laborConsumed);
      if(affordable <= 0){
        agOrdersResults.push({
          hexIndex: ord.hexIndex, coordStr: ord.coordStr, baseValue: base,
          gpSpent: 0, oldBonus: bonus, newBonus: bonus, stepsApplied: 0,
          remainingInvested: hex.landImprovementInvested || 0,
          blocked: true, blockReason: laborCap === Infinity ? 'insufficient treasury' : 'labor cap exhausted this month'
        });
        return;
      }
      _applyDomainTreasuryDelta(campaign, d, -affordable, { reason:'agricultural-improvement', label:'agricultural land improvement' });
      totalAgriculturalSpent += affordable;
      laborConsumed += affordable;
      hex.landImprovementInvested = (hex.landImprovementInvested || 0) + affordable;
      const oldBonus = bonus;
      const stepsApplied = global.ACKS.ratchetAgriculturalImprovement(hex);
      agOrdersResults.push({
        hexIndex: ord.hexIndex,
        coordStr: ord.coordStr,
        baseValue: base,
        gpSpent: affordable,
        oldBonus,
        newBonus: hex.landImprovementBonus,
        stepsApplied,
        remainingInvested: hex.landImprovementInvested
      });

      // Wave Construction-B — mirror this hex's agricultural progress onto the unified Project
      // model and record a typed construction-progress event. PURELY ADDITIVE: the economic
      // state above (treasury, landImprovementInvested, landImprovementBonus) is untouched, so
      // the monthly land-value outcome is byte-identical to the pre-refactor engine (zero-drift;
      // see tests/agricultural-projects.smoke.js). Wrapped so a mirror failure can never break
      // the economic turn. The hex stays the source of truth; the Project is the activity record
      // the Day Clock / day-tick consumer and integrators read.
      try {
        const agProj = global.ACKS.syncAgriculturalProject(campaign, hex, {
          domainId: d.id,
          turn: currentTurnNum,
          historyType: 'progress',
          historyNarrative: '+' + affordable.toLocaleString() + 'gp this month'
            + (stepsApplied > 0 ? ' — +' + stepsApplied + ' land value (now +' + (hex.landImprovementBonus || 0) + ')' : '')
        });
        if(agProj){
          const atCapNow = (hex.landImprovementBonus || 0) >= global.ACKS.AGRICULTURAL_IMPROVEMENT_MAX_BONUS
            || (hex.valuePerFamily || 0) + (hex.landImprovementBonus || 0) >= global.ACKS.AGRICULTURAL_IMPROVEMENT_VALUE_CAP;
          const progEv = global.ACKS.newEvent('construction-progress', {
            submittedBy: 'engine',
            targetTurn: currentTurnNum,
            payload: {
              projectId: agProj.id,
              // narrative is the schema's optional human field; the extras below are integrator
              // metadata (agricultural is gp-denominated, not worker-days — no laborInvested).
              narrative: 'Agricultural works at ' + ord.coordStr + ' in ' + d.name + ': +' + affordable.toLocaleString() + 'gp'
                + (stepsApplied > 0 ? ', +' + stepsApplied + ' land value (now +' + (hex.landImprovementBonus || 0) + ')' : ' (accumulating)') + '.',
              gpThisTurn: affordable,
              stepsApplied: stepsApplied,
              bonusAfter: hex.landImprovementBonus || 0,
              completed: atCapNow
            }
          });
          progEv.status = global.ACKS.EVENT_STATUS.APPLIED;
          progEv.appliedAtTurn = currentTurnNum;
          global.ACKS.setEventContext(progEv, {
            primaryHexId: hex.id,
            domainId: d.id,
            relatedEntities: [{ kind: 'project', id: agProj.id, role: 'subject' }]
          });
          campaign.eventLog.push({
            event: progEv,
            result: {
              projectId: agProj.id,
              domainsChanged: [d.id], charactersChanged: [], hexesChanged: [hex.id],
              treasuryDelta: -affordable,
              narrativeSummary: progEv.payload.narrative
            },
            appliedAtTurn: currentTurnNum,
            appliedAt: new Date().toISOString()
          });
        }
      } catch(e){ /* mirror is additive — never let it fail the economic turn */ }
    });
    // Clear queue prep — the order has been consumed regardless of how much the GM ultimately spent.
    (d.geography?.hexes || []).forEach(hex => { if(hex.queuedImprovementGp) hex.queuedImprovementGp = 0; });

    // Foundation #18 followup — Construction Notability rumors (M&M p.4).
    // For each hex where we committed agricultural construction spending this turn, compare the
    // monthly spend against the supervising market's transaction threshold. If it crosses, queue
    // a rumor-emit event tied to the domain's primary settlement. Treats each hex's monthly spend
    // as a single transaction (RAW: "treat all purchases or sales occurring as part of the same
    // activity as a single transaction"). Multiple sites/hexes in one domain are evaluated
    // independently because they're geographically separated activities.
    const domainHexIds = new Set((campaign.hexes || []).filter(h => h.domainId === d.id).map(h => h.id));
    const domainSettlements = (campaign.settlements || []).filter(s => domainHexIds.has(s.hexId));
    // Pick the largest-market settlement as the "supervising market" for threshold lookup.
    // Fallback to the first settlement; if no settlements, skip Notability emission (no market = no transactions visible).
    let supervisingMarket = null;
    if(domainSettlements.length > 0){
      // Lower marketClass number = bigger market in ACKS (I is biggest). Treat 0/null as worst.
      const sortable = domainSettlements.filter(s => typeof s.marketClass === 'number' && s.marketClass > 0);
      supervisingMarket = sortable.length > 0
        ? sortable.sort((a,b) => a.marketClass - b.marketClass)[0]
        : domainSettlements[0];
    }
    try {
      if(supervisingMarket){
        const threshold = global.ACKS.computeTransactionThreshold(supervisingMarket);
        agOrdersResults.forEach(r => {
          if(r.blocked || !r.gpSpent || r.gpSpent < threshold || threshold <= 0) return;
          try {
            const ev = global.ACKS.newEvent('rumor-emit', {
              submittedBy: 'engine',
              targetTurn: currentTurnNum + 1,
              payload: {
                scope: 'settlement',
                settlementId: supervisingMarket.id,
                domainId: d.id,
                rumorText: 'Wages and materials worth ' + r.gpSpent.toLocaleString() + 'gp move through ' + (supervisingMarket.name || 'the market') + ' for agricultural works at ' + r.coordStr + ' in ' + d.name + '.',
                apparentLevel: 'common',
                topic: 'wealth',
                truthLevel: 'true',
                sourceEventId: null
              }
            });
            campaign.pendingEvents = campaign.pendingEvents || [];
            campaign.pendingEvents.push(ev);
          } catch(e){ /* swallow — don't let rumor emission fail the turn */ }
        });
      }
    } catch(e){ /* swallow — never let Notability emission fail the turn */ }

    // Projects completed this turn (legacy-shape compatibility — pre-Foundation #17 saves may
    // still have landImprovementProjects[] entries that haven't migrated yet).
    const projectsCompleted = [];
    const upcomingTurn = currentTurnNum + 1;
    (d.geography?.hexes || []).forEach((hex, hxi) => {
      if(!Array.isArray(hex.landImprovementProjects) || hex.landImprovementProjects.length === 0) return;
      const remaining = [];
      hex.landImprovementProjects.forEach(proj => {
        if((proj.completesTurn || 0) <= upcomingTurn){
          const base = hex.valuePerFamily || 0;
          const oldBonus = hex.landImprovementBonus || 0;
          const newBonus = Math.min(global.ACKS.AGRICULTURAL_IMPROVEMENT_MAX_BONUS, Math.min(global.ACKS.AGRICULTURAL_IMPROVEMENT_VALUE_CAP - base, oldBonus + 1));
          if(newBonus > oldBonus){
            hex.landImprovementBonus = newBonus;
            projectsCompleted.push({ hexIndex: hxi, coordStr: '(' + (hex.coord?.q || 0) + ',' + (hex.coord?.r || 0) + ')', baseValue: base, oldBonus, newBonus });
          }
        } else {
          remaining.push(proj);
        }
      });
      hex.landImprovementProjects = remaining;
    });

    const snapshotAfter = {
      peasantFamilies: d.demographics.peasantFamilies,
      urbanFamilies: helpers.effectiveUrbanFamilies(d),
      morale: d.demographics.morale,
      treasuryGp: d.treasury.gp
    };
    const turnSnapshot = {
      income: p.income, expenses: p.expenses, incomeFactor: p.incomeFactor,
      grossIncome: gross, grossAdjusted: grossAdj, totalExpenses: expenses,
      treasuryDelta: net - totalInvestmentSpent - totalAgriculturalSpent,
      moraleMods: p.moraleMods, moraleModSum: modSum, moraleRoll: p.moraleRoll, moraleAdjusted: adjusted,
      moraleBefore: p.moraleBefore, moraleAfter,
      populationBefore: p.populationBefore, populationAfter, populationDelta: popDelta,
      populationNaturalIncrease: naturalIncrease, populationNaturalDecrease: naturalDecrease, populationMoraleExtra: moraleExtra,
      urbanInvestments: urbanInvestmentResults, totalInvestmentSpent, totalUrbanFamiliesGained,
      urbanGrowth: urbanGrowthResults,
      agriculturalOrders: agOrdersResults, totalAgriculturalSpent, projectsCompleted,
      event: p.event, gmNotes: p.gmNotes, snapshotBefore, snapshotAfter
    };
    d.history.push(Object.assign({ date: 'Turn ' + currentTurnNum }, turnSnapshot));

    // Emit synthetic engine-standard-turn event (Decision 7, locked).
    try {
      const stEvent = global.ACKS.newEvent('engine-standard-turn', {
        submittedBy: 'engine',
        targetTurn: currentTurnNum,
        payload: { domainId: d.id, turnSnapshot: turnSnapshot }
      });
      stEvent.status = global.ACKS.EVENT_STATUS.APPLIED;
      stEvent.appliedAtTurn = currentTurnNum;
      campaign.eventLog.push({
        event: stEvent,
        result: { domainsChanged: [d.id], charactersChanged: [], hexesChanged: [], treasuryDelta: turnSnapshot.treasuryDelta, narrativeSummary: 'Standard month-end pass for ' + d.name + ' — turn ' + currentTurnNum },
        appliedAtTurn: stEvent.appliedAtTurn,
        appliedAt: new Date().toISOString()
      });
    } catch(e){ /* swallow per original */ }

    // Award XP to ruler (RR p.423; henchman rulers get half).
    const xpEarned = helpers.domainXpFromNet(d, net - totalInvestmentSpent - totalAgriculturalSpent);
    let rulerXpAwarded = 0;
    if(xpEarned && xpEarned > 0){
      const rulerCh = helpers.rulerCharacter(d);
      if(rulerCh){
        const henchPenalty = rulerCh.liegeCharacterId ? 0.5 : 1.0;
        rulerXpAwarded = Math.round(xpEarned * henchPenalty);
        rulerCh.xp = (rulerCh.xp || 0) + rulerXpAwarded;
        helpers.addCharacterHistory(rulerCh, 'xp',
          '+' + rulerXpAwarded.toLocaleString() + ' XP from ruling ' + d.name + ' (domain net ' + (net - totalInvestmentSpent - totalAgriculturalSpent).toLocaleString() + 'gp − threshold ' + computeGpThreshold(rulerCh.level || 1).toLocaleString() + 'gp' + (henchPenalty < 1 ? ', henchman ½' : '') + ')',
          { xp: rulerXpAwarded, source: 'domain', domainId: d.id }
        );
      }
    }

    const investBlurb = totalInvestmentSpent > 0 ? ', urban inv −' + totalInvestmentSpent.toLocaleString() + 'gp (+' + totalUrbanFamiliesGained + ' families)' : '';
    // Incremental agricultural improvement (Foundation #17) applies gp at commit time — there is
    // no deferred "queued" path (that was the legacy landImprovementProjects model). Count the
    // orders that actually moved gp this turn. (Fixes a latent ReferenceError: the prior code read
    // an undefined `immediateConstruction`, which threw on every commit with agricultural spend.)
    const agAppliedCount = agOrdersResults.filter(r => !r.blocked && (r.gpSpent || 0) > 0).length;
    const agBlurb = totalAgriculturalSpent > 0 ? ', ag inv −' + totalAgriculturalSpent.toLocaleString() + 'gp (' + agAppliedCount + ' applied)' : '';
    const projDoneBlurb = projectsCompleted.length > 0 ? ', ' + projectsCompleted.length + ' improvement(s) completed' : '';
    const rulerForBlurb = helpers.rulerCharacter(d);
    const xpBlurb = rulerXpAwarded > 0 ? ', +' + rulerXpAwarded.toLocaleString() + 'XP to ' + (rulerForBlurb?.name || 'ruler') : '';
    logEntries.push(d.name + ': morale ' + p.moraleBefore + '→' + moraleAfter + ', Δtreasury ' + (net >= 0 ? '+' : '') + net + 'gp' + investBlurb + agBlurb + projDoneBlurb + ', Δpop ' + (popDelta >= 0 ? '+' : '') + popDelta + xpBlurb + (p.event ? ' — event: ' + p.event : ''));
    committed++;
  });

  // === VENTURE VAGARIES ===
  let vagariesApplied = 0, ventureAnnihilations = 0;
  turnVentureProposals.forEach(vp => {
    const venture = (campaign.ventures || []).find(v => v.id === vp.ventureId);
    if(!venture || venture.status !== 'in-transit') return;
    if(vp.applyEffect && vp.vagaryEffect !== 'none'){
      const summary = helpers.applyVagaryToVenture(venture, vp);
      if(summary){
        logEntries.push('Venture vagary — ' + venture.venturerName + ': ' + vp.vagaryName + '. ' + summary);
        vagariesApplied++;
        if(vp.vagaryEffect === 'total-loss') ventureAnnihilations++;
      }
    }
  });

  // === PASSIVE INVESTMENTS (RR p.383) ===
  const passiveResult = helpers.processPassiveInvestmentsForTurn() || { totalGp: 0, payouts: [] };
  (passiveResult.payouts || []).forEach(pa => {
    logEntries.push('Passive investment payout — ' + pa.name + ' (' + pa.type + '): +' + pa.gp.toLocaleString() + 'gp → ' + pa.destination + '.');
  });

  // === LEVEL-UP SWEEP ===
  // Runs BEFORE incrementing the turn counter so level-up history is stamped with the current turn.
  // levelUpCharacter (called inside checkAllCharacterLevelUps) emits its own log lines via the
  // caller's logEvent, so we don't push anything here.
  const levelUpResults = helpers.checkAllCharacterLevelUps() || [];

  // === HENCHMAN LOYALTY DRIFT === (RAW baseline — always runs)
  let loyaltyDrifts = 0;
  {
    const _origCampaignDomains2 = campaign.domains;
    campaign.domains = domains;
    try {
      const drifts = global.ACKS.tickHenchmanLoyalty(campaign, campaign.currentTurn || 1);
      loyaltyDrifts = drifts.length;
      if(loyaltyDrifts) logEntries.push('Henchman loyalty drift: ' + loyaltyDrifts + ' character(s) shifted this turn');
    } finally {
      campaign.domains = _origCampaignDomains2;
    }
  }

  // === RUMOR AUTO-EMIT ===
  if(helpers.isHouseRuleEnabled('rumors-auto-emit')){
    const upcomingTurn = (campaign.currentTurn || 1) + 1;
    domains.forEach(d => {
      const lastHistory = d.history[d.history.length - 1];
      if(!lastHistory) return;
      const morale = lastHistory.moraleAfter;
      const treasury = d.treasury.gp || 0;
      const domainSettlements = settlementsForDomain(campaign, d.id);
      const primarySettlement = domainSettlements[0] || null;
      const settlementId = primarySettlement ? primarySettlement.id : null;
      const triggers = [];
      if(morale <= -3) triggers.push({ text: 'Open rebellion brews in ' + d.name + ' — the populace defies their ruler.', apparentLevel: 'common', topic: 'treason' });
      if(morale === -4 && treasury < 0) triggers.push({ text: 'Coffers are empty in ' + d.name + '; tax collectors flee or are killed.', apparentLevel: 'common', topic: 'wealth' });
      if(treasury < 0 && morale > -3) triggers.push({ text: 'Whispers of bankruptcy haunt the court of ' + d.name + '.', apparentLevel: 'uncommon', topic: 'wealth' });
      (lastHistory.urbanGrowth || []).forEach(ug => {
        if(ug.delta > 50) triggers.push({ text: 'Boomtown — ' + ug.settlementName + ' has grown by ' + ug.delta + ' families this month.', apparentLevel: 'uncommon', topic: 'trade' });
        if(ug.delta < -25) triggers.push({ text: 'Exodus — ' + ug.settlementName + ' has lost ' + Math.abs(ug.delta) + ' families this month.', apparentLevel: 'uncommon', topic: 'other' });
      });
      triggers.forEach(tr => {
        try {
          const ev = global.ACKS.newEvent('rumor-emit', {
            submittedBy: 'engine',
            targetTurn: upcomingTurn,
            payload: {
              scope: settlementId ? 'settlement' : 'domain',
              settlementId: settlementId,
              domainId: d.id,
              rumorText: tr.text,
              apparentLevel: tr.apparentLevel,
              topic: tr.topic,
              truthLevel: 'true',
              sourceEventId: null
            }
          });
          campaign.pendingEvents.push(ev);
        } catch(e){ /* swallow */ }
      });
    });
  }

  // === RUMOR APPARENT-LEVEL DRIFT ===
  let rumorDrifts = 0;
  if(helpers.isHouseRuleEnabled('rumors-proliferation')){
    const driftLog = global.ACKS.tickRumorApparentLevels(campaign, campaign.currentTurn || 1);
    rumorDrifts = driftLog.length;
    if(rumorDrifts) logEntries.push('Rumor drift: ' + rumorDrifts + ' rumor(s) shifted apparent level this turn');
  }

  // === ADVANCE TURN COUNTER + CALENDAR ===
  if(committed > 0){
    campaign.currentTurn = (campaign.currentTurn || 1) + 1;
    if(campaign.calendar){
      if(!campaign.calendar.year) campaign.calendar.year = 1;
      if(!campaign.calendar.month) campaign.calendar.month = 1;
      if(!campaign.calendar.day) campaign.calendar.day = 1;
      if(helpers.isHouseRuleEnabled('auran-calendar')){
        campaign.calendar.kind = 'auran';
      } else if(!campaign.calendar.kind){
        campaign.calendar.kind = 'default';
      }
      // Calendar §10.4 — day-tick subsumption at the monthly rollover. Advance day-aware
      // consumers (construction; future journeys/hijinks) to month end, then roll the day
      // clock back to 1. Subsuming is default-ON (monthly-commit-subsumes-in-flight); when
      // off and activity is mid-flight, the GM resolves day-by-day in the UI before commit.
      try {
        if(isDayTickRuleOn(campaign, 'monthly-commit-subsumes-in-flight') || (campaign.currentDayInMonth || 1) <= 1){
          global.ACKS.runDayTickToMonthEnd(campaign);
        }
      } catch(e){ /* never let day-tick subsumption fail the monthly commit */ }
      campaign.currentDayInMonth = 1;
      global.ACKS.advanceCalendarOneMonth(campaign);
    }
  }

  return {
    committed,
    logEntries,
    vagariesApplied,
    ventureAnnihilations,
    passiveResult,
    levelUpResults,
    loyaltyDrifts,
    rumorDrifts,
    newCurrentTurn: campaign.currentTurn,
    error: null
  };
}

// =============================================================================
// 10. EXPORT NAMESPACE
// =============================================================================

// §310.3f-fix26 — Canonical house-rule shape accessor.
function isHouseRuleEnabled(campaign, id){
  if(!campaign || !campaign.houseRules) return false;
  const v = campaign.houseRules[id];
  if(v == null) return false;
  if(v === true) return true;
  if(typeof v === 'object' && v.enabled === true) return true;
  return false;
}

// ─── Phase 4 Construction Wave A — engine surface (Architecture.md §10 — 2026-05-30) ───
//
// A.4 supervisor + site eligibility helpers · A.6 day-tick consumer with monthly
// fallback · A.8 predicates module additions.
//
// Day-tick registration: the canonical registerDayConsumer / tickDay primitives also
// ship here so the construction consumer has a home. When Calendar C2 lands the same
// primitives will be reused by Hijinks, Journeys, Spell Research. Monthly fallback is
// engaged via tickConstructionMonthly(campaign) — called from commitTurn when day-tick
// is not driving (current state through v0.9.x).

// ── Day-tick consumer registry (Architecture.md §7 + Phase 2.95 Calendar §10) ──
const DAY_CONSUMERS = {};

// Calendar §14 consumer registration. Accepts either the legacy (name, fn) form
// (Construction Wave A) or the §14 (name, {handler, order, pauseTriggers, commit}) form.
// Stored canonically as {handler, order, pauseTriggers, commit}:
//   handler(campaign, dayContext) -> { pendingRecords[], notableEvents[], encounters[] }
//     PURE — proposes the day's records WITHOUT mutating the campaign.
//   order        : §10.2 sequencing slot (lower runs first; a legacy fn gets slot 50).
//   pauseTriggers: trigger keys ('encounter','navigation-fail','supplies-low', ...) that,
//                  when surfaced on a notableEvent and the matching auto-pause-* house rule
//                  is on, pause the tick for GM review (§10.3 / §13).
//   commit(campaign, record): applies one ratified pendingRecord to the real campaign.
function registerDayConsumer(name, spec){
  if(!name) return;
  let entry = null;
  if(typeof spec === 'function'){
    entry = { handler: spec, order: 50, pauseTriggers: [], commit: null };
  } else if(spec && typeof spec.handler === 'function'){
    entry = {
      handler: spec.handler,
      order: (typeof spec.order === 'number') ? spec.order : 50,
      pauseTriggers: Array.isArray(spec.pauseTriggers) ? spec.pauseTriggers.slice() : [],
      commit: (typeof spec.commit === 'function') ? spec.commit : null
    };
  }
  if(entry) DAY_CONSUMERS[name] = entry;
}
function unregisterDayConsumer(name){ if(name) delete DAY_CONSUMERS[name]; }
function dayConsumersInOrder(){
  return Object.keys(DAY_CONSUMERS)
    .map(name => Object.assign({ name }, DAY_CONSUMERS[name]))
    .sort((a, b) => (a.order - b.order) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// Build the per-day context handed to each consumer (Calendar §14).
function dayTickContext(campaign, dayInMonth){
  const cal = (campaign && campaign.calendar) || {};
  return {
    year: cal.year || 1,
    month: cal.month || 1,
    dayInMonth: dayInMonth || (campaign && campaign.currentDayInMonth) || 1,
    days: 1,
    calendarKind: cal.kind || 'default',
    weather: null,
    regionalTables: null
  };
}

// Default-ON gate for the day-tick governance rules (auto-pause-*, monthly-commit-
// subsumes-in-flight). These default ON (Calendar §13): unlike the canonical
// isHouseRuleEnabled (absent => off), an absent value reads as ON here, so saves that
// predate these rules behave per the documented default without a migration. Only an
// explicit false / {enabled:false} turns them off.
function isDayTickRuleOn(campaign, id){
  const hr = campaign && campaign.houseRules;
  const v = hr ? hr[id] : undefined;
  if(v === false) return false;
  if(v && typeof v === 'object' && v.enabled === false) return false;
  return true;
}

function _deepCloneCampaign(c){
  try { if(typeof structuredClone === 'function') return structuredClone(c); } catch(e){}
  return JSON.parse(JSON.stringify(c));
}

// Single-day fan-out over a (possibly working-copy) campaign. Runs every registered
// consumer's PURE handler in §10.2 order, accumulating pending records, notable events
// and encounters (each tagged with the emitting consumer + dayInMonth). Does NOT mutate;
// callers that want the records applied use the consumer's commit().
// Reserved §10.2 slots (handlers land with their subsystems): 10 weather · 20 npc-migration
// · 30 journeys · 40 hijinks · 50 construction · 60 spell-research · 70 calendar-events
// · 80 collision-sweep · 90 event-emit.
function tickDayOnce(campaign, dayInMonth){
  const ctx = dayTickContext(campaign, dayInMonth);
  const out = { dayInMonth: ctx.dayInMonth, byConsumer: {}, pendingRecords: [], notableEvents: [], encounters: [] };
  for(const c of dayConsumersInOrder()){
    // collision sweep — Calendar §12, lands with Journeys/Monster-Persistence (no-op here).
    let res;
    try { res = c.handler(campaign, ctx); }
    catch(err){ res = { error: String((err && err.message) || err) }; }
    out.byConsumer[c.name] = res;
    if(res && typeof res === 'object' && !res.error){
      (res.pendingRecords || []).forEach(r => out.pendingRecords.push(Object.assign({ consumer: c.name, dayInMonth: ctx.dayInMonth }, r)));
      (res.notableEvents  || []).forEach(e => out.notableEvents.push(Object.assign({ consumer: c.name, dayInMonth: ctx.dayInMonth }, e)));
      (res.encounters     || []).forEach(e => out.encounters.push(Object.assign({ consumer: c.name, dayInMonth: ctx.dayInMonth }, e)));
    }
  }
  return out;
}

// Which pause triggers fired this day, gated by the auto-pause-* house rules + the
// emitting consumer's declared pauseTriggers (Calendar §10.3 / §13).
function dayTickPauseReasons(campaign, notableEvents){
  const reasons = [];
  (notableEvents || []).forEach(e => {
    const trig = e && (e.pauseTrigger || e.trigger);
    if(!trig) return;
    const consumer = DAY_CONSUMERS[e.consumer];
    if(consumer && Array.isArray(consumer.pauseTriggers) && consumer.pauseTriggers.indexOf(trig) < 0) return;
    if(isDayTickRuleOn(campaign, 'auto-pause-on-' + trig)){
      reasons.push({ trigger: trig, consumer: e.consumer, dayInMonth: e.dayInMonth, label: e.label || e.summary || trig });
    }
  });
  return reasons;
}

// Is any day-aware activity in flight? (Calendar §10.1.) Day-mode engages when the clock
// has advanced past day 1, or a consumer reports in-flight work (construction counts an
// under-construction project).
function dayTickActivityInFlight(campaign){
  if(!campaign) return false;
  if((campaign.currentDayInMonth || 1) > 1) return true;
  if(Array.isArray(campaign.projects) && campaign.projects.some(p => p && p.lifecycleState === 'under-construction')) return true;
  return false;
}

// PROPOSE half of the day-tick commit pipeline (Calendar §10). Advances up to `days`
// days on a deep-cloned working copy so the real campaign is untouched, accumulating
// pending records for GM review. Stops early (paused) when a consumer surfaces a
// notableEvent whose pauseTrigger has its auto-pause-* rule on — unless opts.force.
// Also stops at month end (day 30). Returns a tick proposal:
//   { fromDay, toDay, daysAdvanced, monthEndReached, paused, pauseReasons[],
//     pendingRecords[], notableEvents[], encounters[] }
function proposeDayTick(campaign, days, opts){
  opts = opts || {};
  const force = !!opts.force;
  const MONTH_LEN = 30;
  const fromDay = (campaign && campaign.currentDayInMonth) || 1;
  const want = (typeof days === 'number' && days > 0) ? days : 1;
  const work = _deepCloneCampaign(campaign);
  const proposal = {
    fromDay: fromDay, toDay: fromDay, daysAdvanced: 0, monthEndReached: false,
    paused: false, pauseReasons: [],
    pendingRecords: [], notableEvents: [], encounters: []
  };
  let day = fromDay;
  for(let i = 0; i < want; i++){
    if(day >= MONTH_LEN){ proposal.monthEndReached = true; break; }
    const nextDay = day + 1;
    const tick = tickDayOnce(work, nextDay);
    // Apply this day's records to the working copy so multi-day proposals accumulate.
    tick.pendingRecords.forEach(r => {
      const c = DAY_CONSUMERS[r.consumer];
      if(c && c.commit){ try { c.commit(work, r); } catch(e){} }
    });
    work.currentDayInMonth = nextDay;
    if(work.calendar) work.calendar.day = nextDay;
    proposal.pendingRecords.push.apply(proposal.pendingRecords, tick.pendingRecords);
    proposal.notableEvents.push.apply(proposal.notableEvents, tick.notableEvents);
    proposal.encounters.push.apply(proposal.encounters, tick.encounters);
    day = nextDay;
    proposal.toDay = day;
    proposal.daysAdvanced++;
    if(day >= MONTH_LEN) proposal.monthEndReached = true;
    if(!force){
      const reasons = dayTickPauseReasons(campaign, tick.notableEvents);
      if(reasons.length){ proposal.paused = true; proposal.pauseReasons = reasons; break; }
    }
  }
  return proposal;
}

// COMMIT half of the pipeline. Applies a ratified proposal's pending records to the REAL
// campaign (via each consumer's commit()), advances the day clock, and emits the
// proposal's notable events to the event log with the Event.context envelope populated
// (Architecture §3.5 — primaryHexId + gameTimeAt day stamp; cadence 'daily'). A record or
// event flagged {rejected:true} by the GM is skipped. Returns a commit summary.
function commitDayTick(campaign, proposal, helpers){
  if(!campaign || !proposal) return { committed: 0, eventsEmitted: 0 };
  let committed = 0;
  (proposal.pendingRecords || []).forEach(r => {
    if(r && r.rejected) return;
    const c = DAY_CONSUMERS[r.consumer];
    if(c && c.commit){ try { c.commit(campaign, r); committed++; } catch(e){} }
  });
  campaign.currentDayInMonth = proposal.toDay || campaign.currentDayInMonth || 1;
  if(campaign.calendar) campaign.calendar.day = campaign.currentDayInMonth;
  const eventsEmitted = emitDayTickEvents(campaign, proposal);
  return { committed: committed, eventsEmitted: eventsEmitted, toDay: campaign.currentDayInMonth, paused: !!proposal.paused };
}

function emitDayTickEvents(campaign, proposal){
  const evs = (proposal.notableEvents || []).filter(e => e && !e.rejected);
  if(!evs.length) return 0;
  campaign.eventLog = campaign.eventLog || [];
  const cal = campaign.calendar || {};
  let n = 0;
  evs.forEach(e => {
    try {
      const _mkEv = (k) => global.ACKS.newEvent(k, {
        submittedBy: 'engine',
        status: (global.ACKS.EVENT_STATUS && global.ACKS.EVENT_STATUS.APPLIED) || 'applied',
        cadence: 'daily',
        targetTurn: campaign.currentTurn || 1,
        gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: e.dayInMonth || campaign.currentDayInMonth || 1 },
        context: {
          primaryHexId: e.primaryHexId || null,
          involvedHexIds: e.involvedHexIds || [],
          settlementId: e.settlementId || null,
          domainId: e.domainId || null,
          relatedEntities: e.relatedEntities || []
        },
        payload: e.payload || { consumer: e.consumer, type: e.type || null, label: e.label || null }
      });
      let ev;
      try { ev = _mkEv(e.kind || 'gm-narrative'); }
      catch(_e){ try { ev = _mkEv('gm-narrative'); } catch(_e2){ return; } }
      ev.appliedAtTurn = campaign.currentTurn || 1;
      campaign.eventLog.push({
        event: ev,
        result: { narrativeSummary: e.label || e.summary || ((e.consumer || 'day-tick') + ' event') },
        appliedAtTurn: campaign.currentTurn || 1,
        appliedAt: new Date().toISOString()
      });
      n++;
    } catch(err){ /* swallow — never let event emission fail the tick */ }
  });
  return n;
}

// Run the pipeline forward to month end and commit it (subsumption — Calendar §10.4).
// days = 30 - currentDay, so an untouched month advances ~29 day-ticks of work and a
// partially-ticked month tops up to day 30. Forced (no pause). Used by commitTurn at the
// monthly rollover, and by the UI "Tick to Month End" control.
function runDayTickToMonthEnd(campaign){
  const dim = (campaign && campaign.currentDayInMonth) || 1;
  const days = (30 - dim);
  if(days <= 0) return { committed: 0, eventsEmitted: 0 };
  const proposal = proposeDayTick(campaign, days, { force: true });
  return commitDayTick(campaign, proposal, null);
}

// Legacy primitive, retained for back-compat: advance the REAL campaign by daysElapsed
// days, committing each consumer's records as it goes. No external callers today; the
// propose/commit pipeline above is the GM-facing path.
function tickDay(campaign, daysElapsed){
  const proposal = proposeDayTick(campaign, (daysElapsed == null ? 1 : daysElapsed), { force: true });
  commitDayTick(campaign, proposal, null);
  return proposal;
}

// ── A.4 — Supervisor + site eligibility helpers ──

// Returns whether the character has the qualifications to supervise a project of
// this constructibleKind. Used by Wizard step 4 (supervisor selection). Defensive —
// returns true when proficiencies absent / loosely structured; subsystems that care
// about strict gating can layer that on.
function isEligibleSupervisor(character, project){
  if(!character || !project) return false;
  const profs = (character.proficiencies || []).map(p => (typeof p === 'string' ? p : (p && p.key) || '').toLowerCase());
  const kind = project.constructibleKind;
  // Vessel-specific: shipwright preferred, engineering accepted with penalty
  if(kind === 'vessel' || (project.constructibleSubtype && /sailing|galley|longship|barge|raft/.test(project.constructibleSubtype))){
    if(profs.some(p => /shipwright/.test(p))) return true;
    return profs.some(p => /engineer/.test(p));
  }
  // Sanctum / dungeon / vault — mages, dwarves
  if(kind === 'sanctum' || kind === 'dungeon') return profs.some(p => /engineer|arcane|magical-engineering/.test(p));
  if(kind === 'vault') return profs.some(p => /engineer|craft-stone|mining/.test(p));
  // Mine — mining + engineering
  if(kind === 'mine') return profs.some(p => /mining|engineer/.test(p));
  // Default: engineering or siege-engineering qualifies. Anyone with profession
  // listed as their job is the loose fallback (a craftsman supervising their own
  // shop counts).
  if(profs.some(p => /engineering|siege-engineering/.test(p))) return true;
  // Permissive fallback — no proficiencies list at all (character is a stub)
  if(profs.length === 0) return true;
  return false;
}

// Sum of supervisor caps across all currently engaged supervisors. Default cap
// per supervisor is 100 workers (RR p.174). With multi-supervisor on-site (#208),
// caps are additive.
function supervisorCapTotal(project){
  if(!project || !Array.isArray(project.supervisorCharacterIds)) return 0;
  // 100 per supervisor as the default per RR p.174.
  return project.supervisorCharacterIds.length * 100;
}

// Project worker count exceeds total supervisor cap. When true, the realistic-
// construction rule throttles progress to whatever fraction is covered.
function projectExceedsSupervisor(project){
  if(!project) return false;
  const cap = supervisorCapTotal(project);
  const total = Object.values(project.workerCounts || {}).reduce((s,n) => s + (n||0), 0);
  return total > cap;
}

// Returns whether the given site (hex + optional settlement) can host the kind.
// Returns {eligible: bool, reason: string-or-null}. Wizard step 3 surfaces the reason.
function isSiteEligibleForKind(campaign, hex, kind, subtype){
  if(!hex) return { eligible:false, reason:'no-site' };
  const terrain = (hex.terrain || '').toLowerCase();
  const features = (hex.specialFeatures || []).map(f => (f||'').toLowerCase());
  // Vessels — must be on waterway-adjacent or coastal hex
  if(kind === 'vessel'){
    const hasWater = /coastal|river|lake|sea|ocean/.test(terrain) || features.some(f => /coast|river|lake|sea|harbor|port/.test(f));
    return hasWater ? { eligible:true, reason:null } : { eligible:false, reason:'requires-waterway' };
  }
  // Mines / vaults — underground; we accept any hex but vaults are flavor-gated for dwarven
  if(kind === 'mine' || kind === 'vault'){
    return { eligible:true, reason:null };  // Site is fine; class restriction handled separately
  }
  // Settlement-buildings — must have a settlement at the site
  if(kind === 'settlement-building'){
    const hasSettlement = (campaign.settlements||[]).some(s => s && s.hexId === hex.id);
    return hasSettlement ? { eligible:true, reason:null } : { eligible:false, reason:'requires-settlement' };
  }
  // Strongholds, sanctums, dungeons, hideouts, civic monuments, traps, fortifications, roads — generally OK on any hex
  return { eligible:true, reason:null };
}

// ── A.6 — Day-tick consumer for construction (with monthly fallback) ──
//
// Advance every in-progress Project by N days. For each Project, compute laborInvested
// gained this tick = (totalDailyOutputCf × min(supervised-fraction, 1) × N).
// Updates daysElapsed + laborInvested. When laborInvested >= laborRequired, marks
// constructionState='complete' on the spawned Constructible (Wave C+ wires the
// spawn at completion; Wave A only ticks progress).
//
// Magic-assist multipliers (RR p.176-177) apply only when mage-assisted-construction
// house rule is on AND project.magicAssist multipliers are populated. Wave A reads
// the multipliers from project.magicAssist.multipliers; Wave C wires them.
function tickConstructionByDays(campaign, days){
  if(!campaign || !Array.isArray(campaign.projects) || days <= 0) return { ticked: 0, completed: [] };
  const completed = [];
  let ticked = 0;
  const useRealisticCap = isHouseRuleEnabled(campaign, 'realistic-construction');
  const useMageAssist   = isHouseRuleEnabled(campaign, 'mage-assisted-construction');
  const CW = (typeof global !== 'undefined' && global.ACKS && global.ACKS.totalDailyOutputCf)
    ? global.ACKS.totalDailyOutputCf
    : ((wc) => Object.values(wc||{}).reduce((s,n) => s + (n||0)*5, 0));
  for(const p of campaign.projects){
    if(!p || p.lifecycleState !== 'under-construction') continue;
    let outputCfPerDay = CW(p.workerCounts);
    // Supervisor cap (realistic-construction house rule)
    if(useRealisticCap){
      const cap = supervisorCapTotal(p);
      const total = Object.values(p.workerCounts||{}).reduce((s,n) => s + (n||0), 0);
      if(total > cap && cap > 0){
        outputCfPerDay = outputCfPerDay * (cap / total);
      }
    }
    // Magic-assist multipliers
    if(useMageAssist && p.magicAssist && p.magicAssist.multipliers){
      const mult = Object.values(p.magicAssist.multipliers).reduce((s,n) => s + (n||0), 1);
      outputCfPerDay = outputCfPerDay * mult;
    }
    const gained = outputCfPerDay * days;
    p.laborInvested = (p.laborInvested || 0) + gained;
    p.daysElapsed   = (p.daysElapsed   || 0) + days;
    ticked++;
    // Completion check
    if(p.laborRequired && p.laborInvested >= p.laborRequired){
      p.lifecycleState = 'complete';
      p.completedAtTurn = campaign.currentTurn || null;
      (p.history = p.history || []).push({
        turn: campaign.currentTurn || null,
        type: 'completed',
        narrative: 'Project completed after ' + p.daysElapsed + ' days of work.'
      });
      completed.push({ projectId: p.id, kind: p.constructibleKind, subtype: p.constructibleSubtype });
    }
  }
  return { ticked, completed };
}

// Monthly fallback — called from commitTurn when day-tick is not driving. Advances
// every in-progress project by ~30 days. Calendar C2 will replace this with per-day
// tick + collision-check pipeline; until then this is the canonical advance step.
function tickConstructionMonthly(campaign, daysPerMonth){
  return tickConstructionByDays(campaign, daysPerMonth || 30);
}

// §14 day-handler for construction (Calendar §10.2 slot 50 — in-flight constructions).
// PURE: proposes one day's labor for every under-construction project WITHOUT mutating;
// commitConstructionRecord applies a ratified record. Mirrors tickConstructionByDays' math
// (which remains as the immediate-apply helper used by the legacy monthly path + tests).
function proposeConstructionDay(campaign, dayContext){
  const days = (dayContext && typeof dayContext.days === 'number') ? dayContext.days : 1;
  const pendingRecords = [];
  const notableEvents = [];
  if(!campaign || !Array.isArray(campaign.projects)) return { pendingRecords, notableEvents, encounters: [] };
  const useRealisticCap = isHouseRuleEnabled(campaign, 'realistic-construction');
  const useMageAssist   = isHouseRuleEnabled(campaign, 'mage-assisted-construction');
  const CW = (typeof global !== 'undefined' && global.ACKS && global.ACKS.totalDailyOutputCf)
    ? global.ACKS.totalDailyOutputCf
    : ((wc) => Object.values(wc||{}).reduce((s,n) => s + (n||0)*5, 0));
  for(const p of campaign.projects){
    if(!p || p.lifecycleState !== 'under-construction') continue;
    let outputCfPerDay = CW(p.workerCounts);
    if(useRealisticCap){
      const cap = supervisorCapTotal(p);
      const total = Object.values(p.workerCounts||{}).reduce((s,n) => s + (n||0), 0);
      if(total > cap && cap > 0) outputCfPerDay = outputCfPerDay * (cap / total);
    }
    if(useMageAssist && p.magicAssist && p.magicAssist.multipliers){
      const mult = Object.values(p.magicAssist.multipliers).reduce((s,n) => s + (n||0), 1);
      outputCfPerDay = outputCfPerDay * mult;
    }
    const laborGained = outputCfPerDay * days;
    const fromLaborInvested = p.laborInvested || 0;
    const newLaborInvested = fromLaborInvested + laborGained;
    const fromDaysElapsed = p.daysElapsed || 0;
    const newDaysElapsed = fromDaysElapsed + days;
    const willComplete = !!(p.laborRequired && newLaborInvested >= p.laborRequired);
    const name = p.name || p.constructibleSubtype || p.constructibleKind || 'project';
    const label = name + ': +' + Math.round(laborGained) + ' cf (' + Math.round(newLaborInvested) +
      (p.laborRequired ? ('/' + p.laborRequired) : '') + ' cf)' + (willComplete ? ' — complete' : '');
    pendingRecords.push({
      kind: 'construction-progress', projectId: p.id, label: label,
      daysAdded: days, laborGained: laborGained,
      fromLaborInvested: fromLaborInvested, newLaborInvested: newLaborInvested,
      fromDaysElapsed: fromDaysElapsed, newDaysElapsed: newDaysElapsed,
      willComplete: willComplete, primaryHexId: p.siteHexId || null
    });
    if(willComplete){
      notableEvents.push({
        kind: 'construction-completed', type: 'construction-complete', projectId: p.id,
        primaryHexId: p.siteHexId || null,
        label: name + ' completed',
        payload: { projectId: p.id, kind: p.constructibleKind, subtype: p.constructibleSubtype }
      });
    }
  }
  return { pendingRecords: pendingRecords, notableEvents: notableEvents, encounters: [] };
}

function commitConstructionRecord(campaign, record){
  if(!campaign || !record || !record.projectId) return;
  const p = (campaign.projects || []).find(x => x && x.id === record.projectId);
  if(!p) return;
  p.laborInvested = (typeof record.newLaborInvested === 'number')
    ? record.newLaborInvested : (p.laborInvested || 0) + (record.laborGained || 0);
  p.daysElapsed = (typeof record.newDaysElapsed === 'number')
    ? record.newDaysElapsed : (p.daysElapsed || 0) + (record.daysAdded || 0);
  if(record.willComplete || (p.laborRequired && p.laborInvested >= p.laborRequired)){
    p.lifecycleState = 'complete';
    p.completedAtTurn = campaign.currentTurn || null;
    (p.history = p.history || []).push({
      turn: campaign.currentTurn || null, type: 'completed',
      narrative: 'Project completed after ' + p.daysElapsed + ' days of work.'
    });
  }
}

// Register the construction consumer in the §14 shape (Calendar §14). The day-tick
// orchestrator (proposeDayTick/commitDayTick) fans out to it; commitTurn drives it to
// month end via runDayTickToMonthEnd. tickConstructionMonthly remains the non-day-aware
// immediate-apply helper.
registerDayConsumer('construction', {
  handler: proposeConstructionDay,
  order: 50,
  pauseTriggers: [],
  commit: commitConstructionRecord
});

// ── A.8 — Construction predicates (Architecture.md §10) ──

function isProject(o){ return !!(o && o.id && typeof o.id === 'string' && o.id.startsWith('prj-') && typeof o.constructibleKind === 'string'); }
function isConstructible(o){ return !!(o && o.id && typeof o.id === 'string' && o.id.startsWith('cst-') && typeof o.constructibleKind === 'string'); }
function isConstructibleKind(o, kind){ return !!(o && o.constructibleKind === kind); }
function isUnderConstruction(p){ return !!(p && p.lifecycleState === 'under-construction'); }
function isComplete(c){ return !!(c && (c.constructionState === 'complete' || c.lifecycleState === 'complete')); }
// A Constructible is "damaged" if it has any damage but is not destroyed (the predicate
// is used for "needs repair" workflows; destroyed structures are gone).
function isDamaged(c){
  if(!c) return false;
  const ds = c.damageState;
  return ds && ds !== 'intact' && ds !== 'destroyed';
}
function isOperational(c){ return !!(c && c.operationalState === 'operational'); }
function isInRepair(p){ return !!(p && p.isRepair === true); }

function displayConstructibleKind(c){
  if(!c) return '';
  const k = c.constructibleKind || 'unknown';
  const subtype = c.constructibleSubtype;
  const labels = {
    'stronghold-component': subtype ? subtype : 'Stronghold component',
    'agricultural-improvement': 'Agricultural improvement',
    'vessel': subtype ? subtype : 'Vessel',
    'war-machine': subtype ? subtype : 'War machine',
    'settlement-building': subtype ? subtype : 'Settlement building',
    'sanctum': 'Sanctum',
    'dungeon': 'Dungeon',
    'mine': 'Mine',
    'vault': 'Vault',
    'hideout': 'Hideout',
    'civic-monument': subtype ? subtype : 'Civic monument',
    'trap': subtype ? subtype : 'Trap',
    'field-fortification': subtype ? subtype : 'Field fortification',
    'road': 'Road'
  };
  return labels[k] || k;
}

// ── Lookups ──
function findProject(campaign, id){
  if(!campaign || !id) return null;
  return (campaign.projects || []).find(p => p && p.id === id) || null;
}
function findConstructible(campaign, id){
  if(!campaign || !id) return null;
  return (campaign.constructibles || []).find(c => c && c.id === id) || null;
}
function projectsAtHex(campaign, hexId){
  if(!campaign || !hexId) return [];
  return (campaign.projects || []).filter(p => p && p.siteHexId === hexId);
}
function constructiblesAtHex(campaign, hexId){
  if(!campaign || !hexId) return [];
  return (campaign.constructibles || []).filter(c => c && c.hexId === hexId);
}
function projectsForDomain(campaign, domainId){
  if(!campaign || !domainId) return [];
  return (campaign.projects || []).filter(p => p && p.ownerDomainId === domainId);
}
function constructiblesForDomain(campaign, domainId){
  if(!campaign || !domainId) return [];
  return (campaign.constructibles || []).filter(c => c && c.ownerDomainId === domainId);
}

// ─── #528 Event Context Envelope (Architecture.md §3.5 Wave Hex-history — 2026-05-30) ───
//
// Derived history accessors: every hex / settlement / constructible / group / etc.
// has its "history" computed by filtering campaign.eventLog against the context envelope.
// No stored history fields on those entities — derived from event records. Character
// histories remain stored on character.history[] for the transition window.

function hexHistory(campaign, hexId){
  if(!campaign || !hexId || !Array.isArray(campaign.eventLog)) return [];
  return campaign.eventLog.filter(e => {
    const c = e && e.context;
    if(!c) return false;
    if(c.primaryHexId === hexId) return true;
    if(Array.isArray(c.involvedHexIds) && c.involvedHexIds.indexOf(hexId) >= 0) return true;
    return false;
  });
}

function settlementHistory(campaign, settlementId){
  if(!campaign || !settlementId || !Array.isArray(campaign.eventLog)) return [];
  return campaign.eventLog.filter(e => e && e.context && e.context.settlementId === settlementId);
}

function _filterByRelatedEntity(campaign, kind, id){
  if(!campaign || !id || !Array.isArray(campaign.eventLog)) return [];
  return campaign.eventLog.filter(e => {
    const rels = e && e.context && e.context.relatedEntities;
    if(!Array.isArray(rels)) return false;
    return rels.some(r => r && r.kind === kind && r.id === id);
  });
}

function constructibleHistory(campaign, id){ return _filterByRelatedEntity(campaign, 'constructible', id); }
function groupHistory(campaign, id){          return _filterByRelatedEntity(campaign, 'group',          id); }
function notableItemHistory(campaign, id){    return _filterByRelatedEntity(campaign, 'notable-item',   id); }
function domainHistory(campaign, id){         return _filterByRelatedEntity(campaign, 'domain',         id); }
function partyHistory(campaign, id){          return _filterByRelatedEntity(campaign, 'party',          id); }
function journeyHistory(campaign, id){        return _filterByRelatedEntity(campaign, 'journey',        id); }
function outpostHistory(campaign, id){        return _filterByRelatedEntity(campaign, 'outpost',        id); }
function congregationHistory(campaign, id){   return _filterByRelatedEntity(campaign, 'congregation',   id); }

// Helper for event handlers: populate context on an event. Pass relatedEntities
// as an array of {kind,id,role} objects. Mutates event in place. Idempotent — safe
// to call multiple times.
function setEventContext(event, opts){
  if(!event) return event;
  event.context = event.context || { primaryHexId: null, involvedHexIds: [], settlementId: null, domainId: null, relatedEntities: [] };
  if(opts){
    if(opts.primaryHexId)     event.context.primaryHexId   = opts.primaryHexId;
    if(opts.settlementId)     event.context.settlementId   = opts.settlementId;
    if(opts.domainId)         event.context.domainId       = opts.domainId;
    if(Array.isArray(opts.involvedHexIds)){
      const seen = new Set(event.context.involvedHexIds);
      for(const h of opts.involvedHexIds){ if(h && !seen.has(h)){ event.context.involvedHexIds.push(h); seen.add(h); } }
    }
    if(Array.isArray(opts.relatedEntities)){
      for(const r of opts.relatedEntities){
        if(r && r.kind && r.id){ event.context.relatedEntities.push({ kind: r.kind, id: r.id, role: r.role || null }); }
      }
    }
  }
  return event;
}


function findParty(campaign, id){
  if(!campaign || !id) return null;
  return (campaign.parties || []).find(p => p && p.id === id) || null;
}
function partiesAtHex(campaign, hexId){
  if(!campaign || !hexId) return [];
  return (campaign.parties || []).filter(p => p && p.currentHexId === hexId);
}
function partiesAtSettlement(campaign, settlementId){
  if(!campaign || !settlementId) return [];
  return (campaign.parties || []).filter(p => p && p.currentSettlementId === settlementId);
}
function partiesInDomain(campaign, domainId){
  if(!campaign || !domainId) return [];
  return (campaign.parties || []).filter(p => p && p.currentDomainId === domainId);
}
function activeParties(campaign){
  return (campaign && Array.isArray(campaign.parties)) ? campaign.parties.filter(p => p && p.status !== 'disbanded') : [];
}

const ACKS = Object.assign(global.ACKS || {}, {
  // Engine helpers
  isHouseRuleEnabled,
  // #521 Party-as-actor helpers (2026-05-30)
  findParty, partiesAtHex, partiesAtSettlement, partiesInDomain, activeParties,
  // #528 Event Context Envelope (Architecture.md §3.5 Wave Hex-history — 2026-05-30)
  hexHistory, settlementHistory, constructibleHistory, groupHistory, notableItemHistory,
  domainHistory, partyHistory, journeyHistory, outpostHistory, congregationHistory,
  setEventContext,
  // Phase 4 Construction Wave A (Architecture.md §10 — 2026-05-30)
  // Day-tick primitives (also for future Calendar C2 reuse by Hijinks / Journeys / Spell Research)
  registerDayConsumer, unregisterDayConsumer, tickDay, tickDayOnce, dayConsumersInOrder,
  dayTickContext, isDayTickRuleOn, dayTickPauseReasons, dayTickActivityInFlight,
  proposeDayTick, commitDayTick, runDayTickToMonthEnd, emitDayTickEvents,
  proposeConstructionDay, commitConstructionRecord,
  // Construction-specific helpers
  isEligibleSupervisor, supervisorCapTotal, projectExceedsSupervisor, isSiteEligibleForKind,
  tickConstructionByDays, tickConstructionMonthly,
  // Construction predicates
  isProject, isConstructible, isConstructibleKind, isUnderConstruction, isComplete, isDamaged, isOperational, isInRepair,
  displayConstructibleKind,
  // Construction lookups
  findProject, findConstructible, projectsAtHex, constructiblesAtHex, projectsForDomain, constructiblesForDomain,
  // Wave Construction-B — agricultural-improvement on the unified Project model
  migrateAgriculturalToProjects, findAgriculturalProject, syncAgriculturalProject,
  // Schema + identity
  SCHEMA_VERSION, ID_PREFIXES, newId, slugify,

  // Core constants
  DEFAULT_TAX_RATES, REQUIRED_GARRISON_PER_FAMILY, HEX_CLASSIFICATIONS,
  MORALE_LEVEL_NAMES, MORALE_EMOJI, MORALE_STATE_TEXT, INCOME_FACTOR_BY_MORALE,
  STRONGHOLD_VALUE_PER_HEX,

  // Market + urban
  MARKET_CLASS_TABLE, URBAN_INVESTMENT_TIERS, SETTLEMENT_BENCHMARKS,
  lookupMarketClass, urbanMaxFamilies, lookupSettlementBenchmark,

  // Reference catalogs are attached by acks-engine-catalogs.js (loaded earlier).

  // Titles
  TITLES_OF_NOBILITY, lookupTitleOfNobility,

  // Characters
  SAVE_TABLES, CLASS_TO_SAVE_ARCHETYPE,
  PERSONAL_AUTHORITY_BRACKETS, XP_PROGRESSION, CLASS_HD,
  classKey, classSaveArchetype, computeSavingThrows,
  personalAuthorityBracketForIncome, computePersonalAuthority,
  computeGpThreshold, xpForLevel, xpToNextLevel, rollHpForLevel,
  abilityMod, computeHenchmanCap,

  // Errata §1.3 — banker's rounding (half-to-even)
  bankersRound,
  // Errata §1.2 — tribute rounds to nearest 5gp (canonical home; UI delegates here)
  roundToNearest5,

  // Dice + rolls
  rollD6, rollD20, rollD10x, clamp,
  rollNaturalIncrease, rollNaturalDecrease, rollMoraleExtra,
  moraleChangeFromRoll, baseMoraleFromClassification, strongholdMoralePenalty,
  DOMAIN_CLASSIFICATIONS, suggestDomainClassification, effectiveDomainClassification,

  // Foundation #241 — rural population: canonical setter + reconciliation.
  // Tools/UI MUST go through setPeasantPopulation for any rural population change.
  setPeasantPopulation, reconcileRuralPopulation,

  // Entity-factory exports attached by acks-engine-entities.js (loaded after).

  // Validation
  validateCampaign, validateUniqueIds, validateHexCoordUniqueness,

  // Migration
  MIGRATIONS, migrateCampaign,
  // Phase #440 stage 1 — additive five-axis classification migration (2026-05-29)
  migrateCharacterClassification, migrateAllCharacterClassification,
  // Foundation #244 — mining-entry stripper (callable independently of migrateCampaign for
  // session-restore paths that store domains separately from the campaign object).
  stripUnusedMiningEntries,

  // Event-system exports are attached by acks-engine-events.js (loaded after).

  // Top-level collections refactor (Foundation #193)
  hexesForDomain, wildernessHexes, findHex, findSettlement, findRumor,
  // Phase 2.95 Stash A — read-only stash lookups (2026-05-29)
  findStash, stashesOwnedByCharacter, stashesAtHex, findDomainTreasury, stashesAccessibleToCharacter,
  // Phase 2.95 Stash A.2 — canonical setters (#467 / 2026-05-29)
  depositToStash, withdrawFromStash, transferBetweenStashes,
  // Phase 2.95 Stash A.3 — treasury migration + canonical gp read (#468 / 2026-05-29)
  migrateDomainTreasuryToStash, migrateAllDomainTreasuries, domainTreasuryGp,
  // Phase 2.95 Stash A.4 — canonical-setter invariant + item-consolidation reconcile (#469 / 2026-05-29)
  reconcileStashItems, reconcileAllStashes, reconcileTreasuryScalars,
  // Wave B.5 — Notable items + custody read-only lookups (2026-05-29)
  findNotableItem, findItemCustody, currentCustodyOfItem,
  notableItemsInCustodian, notableItemsHeldByCharacter, notableItemsAtHex,
  // #442 — Group entity lookups (Architecture.md §2.4, 2026-05-29)
  findGroup, groupsAtHex, groupsByCatalogKey, groupsCommandedBy, groupActiveCount,
  // #443 — Wave A relation setters + active-relation lookups (Architecture.md §3.5, 2026-05-29)
  createHenchmanship, endHenchmanship, activeHenchmanshipFor, henchmanshipsByPatron,
  createSpecialistContract, endSpecialistContract, activeSpecialistContractFor, specialistContractsByEmployer,
  createHirelingContract, endHirelingContract, activeHirelingContractFor, hirelingContractsByEmployer,
  createMagistracy, endMagistracy, activeMagistracyOf, magistraciesByCharacter, magistraciesByDomain,
  createVassalage, endVassalage, activeVassalageOf, vassalagesBySuzerain,
  createTributaryAgreement, endTributaryAgreement, activeTributaryAgreementsFrom, activeTributaryAgreementsTo,
  // #444 — Wave A derived accessors + reconcile (Architecture.md §3.6, 2026-05-29)
  derivedSocialTierFor, derivedLiegeFor, derivedEmployerFor,
  derivedMagistrateRolesFor, derivedVassalDomainsOf, derivedTributeOutflowGpFor,
  reconcileWaveARelations,
  // #445 — Legacy backfill migration (Architecture.md §3.5, 2026-05-29)
  migrateLegacyHenchmanshipsToRelations, migrateLegacySpecialistContractsToRelations,
  migrateLegacyHirelingContractsToRelations, migrateLegacyMagistraciesToRelations,
  migrateLegacyVassalagesToRelations, migrateLegacyTributesToRelations,
  migrateLegacyToWaveARelations,
  // #441 Predicates — canonical accessors (Architecture.md §2.6, 2026-05-29)
  isPlayerControlled, isGMControlled,
  isActive, isCandidate, isDeparted, isDeceased, isImprisoned, isDominated,
  isDestroyedAtZeroHP,
  isHenchman, isSpecialist, isFollower, isHireling, isMercenaryOfficer,
  isRetainer, isLoyaltyTracked, isCommanderEligible,
  isVassalRuler,
  displayKind, lifecycleLabel,
  settlementForHex, settlementsForDomain, rumorsAtSettlement, rumorsInDomain, rumorReachAt,
  addRumorReach, removeRumorReach,
  liftToTopLevelCollections,

  // Turn orchestration (Foundation #15 — partial lift, helpers-callback pattern)
  proposeMonthlyTurn, commitTurn
});
// Object.freeze omitted: later modules (subsystems, future splits) extend the namespace.

if(typeof module !== 'undefined' && module.exports){
  module.exports = ACKS;
}
global.ACKS = ACKS;

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
