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

// RAW precise tribute (RR p.346, "Calculating Precise Tribute (Optional)"): 18gp × realm-families^0.6,
// rounded to the nearest 5gp — the Tribute by Realm Families table (RR p.346) is this formula. Pure.
// `families` is the number of families in the WHOLE realm being assessed: a vassal's own domain plus
// all of its sub-vassal realms. Validated against the RR table anchors: 100→285, 1,000→1,135,
// 10,000→4,520, 100,000→18,000. (RAW tribute is a fixed obligation by realm size, NOT a % of income.)
function rawTributeForRealmFamilies(families){
  const f = Math.max(0, Number(families) || 0);
  return roundToNearest5(18 * Math.pow(f, 0.6));
}

// 2026-06-05 — `tributePct` removed. Auto-tribute now computes the RAW realm-families amount
// (rawTributeForRealmFamilies); the old "% of gross income" proxy field is deleted from every
// domain's expenses on load. A domain that had a custom pct falls to the RAW amount (set tribute
// manually via tributeToLiege for a bespoke figure). Idempotent.
function migrateRemoveTributePct(campaign){
  if(!campaign || !Array.isArray(campaign.domains)) return campaign;
  for(const d of campaign.domains){
    if(d && d.expenses && Object.prototype.hasOwnProperty.call(d.expenses, 'tributePct')) delete d.expenses.tributePct;
  }
  return campaign;
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
  constructible:        'cst',
  // Phase 2.95 Hirelings (#310) — day-aware recruitment drive (sub-object on the patron, 2026-06-06)
  recruitmentDrive:     'rcd',
  // Favors & Duties (#230, F&D-1 — 2026-06-08) — the monthly liege↔vassal obligation relation (RR pp.345–348)
  favorDutyObligation:  'fdo',
  // #476 Encounter layer E1 (2026-06-10) — the reified pre-combat interaction (D8; RR pp.280–287)
  encounter:            'enc',
  // Phase 3 Military W1 (2026-06-12) — Unit (the Group's military sibling) + Army.
  // NB lifted legacy garrison units KEEP their 'gar-' ids (id stability); 'unit-' is
  // the prefix for units created after the lift.
  unit:                 'unit',
  army:                 'army',
  // Phase 3 Military W3 (2026-06-12) — Battle (the RR pp.461–472 engagement record:
  // sides + zones + the turn log + aftermath; resolved by acks-engine-battles.js).
  battle:               'btl'
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

// Domain-morale effects, summarized in the tool's own words for the "State of Your Domain"
// panel. These are original paraphrases of the mechanical effects (every number preserved);
// the rulebook's descriptive prose is NOT reproduced here. Cite: RR pp.349-351. (IP hygiene —
// see ACKS_Mechanic_Extensions.md "Morale state text".)
const MORALE_STATE_TEXT = Object.freeze({
  '-4':"Open revolt. Income from tax, land, trade, and service collapses to nothing as one able-bodied villager per family takes up banditry, preying on officials, caravans, troops, and travelers. No families are gained and a further 4d10 per 1,000 are lost each month to violence, sickness, and flight. No conscripts or militia can be raised. Every Vagaries roll takes -20 and vassal loyalty checks take -2. Each month carries a cumulative 10% chance a bandit leader rises to contest the ruler's claim.",
  '-3':"Widespread defiance — banditry, tax evasion, and disloyalty are rife. Tax, land, trade, and service income is halved as roughly one able-bodied villager per two families turns bandit. A further 3d10 families per 1,000 are lost each month, and no conscripts or militia can be raised. Vagaries rolls take -10 and vassal loyalty checks take -1. Each month brings a cumulative 5% chance a bandit leader rises to challenge the ruler.",
  '-2':"Unrest and dissatisfaction. Tax, land, trade, and service income drops by a fifth as about one able-bodied villager per five families turns bandit. A further 2d10 families per 1,000 are lost each month, and no conscripts or militia can be raised. Vagaries rolls take -5. Each month brings a cumulative 1% chance a bandit leader emerges to challenge the ruler.",
  '-1':"The populace thinks poorly of the ruler. An extra 1d10 families per 1,000 are lost each month, and any conscripts or militia raised here muster at -1 to their morale.",
  '0':"Indifference — the ruler is seen as just another noble. The people work, pay, and serve out of duty but feel no real loyalty, and conscripts or militia raised here muster at -1 to their morale.",
  '1':"The ruler is respected and well-liked. The population grows by an extra 1d10 families per 1,000 each month, and spies or thieves working against the domain take -1 on their proficiency throws.",
  '2':"Strong loyalist feeling. The population grows by an extra 2d10 families per 1,000 each month, spies or thieves working against the domain take -2 on their proficiency throws, and Vagaries of Recruitment rolls take +5.",
  '3':"The ruler is hailed as a great leader. The population grows by an extra 3d10 families per 1,000 each month; spies or thieves working against the domain take -3 on their proficiency throws; Vagaries of Recruitment rolls take +10; conscripts and militia raised here muster at +1 morale; and vassal loyalty checks take +1.",
  '4':"The ruler is acclaimed as a beloved and rightful sovereign. The population grows by an extra 4d10 families per 1,000 each month; spies or thieves working against the domain take -4 on their proficiency throws; Vagaries of Recruitment rolls take +20; conscripts and militia raised here muster at +1 morale; and vassal loyalty checks take +2."
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

// Each dice helper accepts an OPTIONAL trailing `rng` (a () => [0,1) function). Default Math.random,
// so every existing caller is unchanged. proposeMonthlyTurn / commitTurn thread an injected rng so a
// turn's outcome is scriptable in tests (qa-strategy I2); see options.rng on those two functions.
function rollD6(rng){return 1+Math.floor((rng||Math.random)()*6);}
function rollD20(rng){return 1+Math.floor((rng||Math.random)()*20);}
function rollD10x(n,rng){
  rng = rng || Math.random;
  let total=0;
  for(let i=0;i<n;i++){
    let r=1+Math.floor(rng()*10);
    let sum=r;
    while(r===10){r=1+Math.floor(rng()*10);sum+=r;}
    total+=sum;
  }
  return total;
}
function clamp(v,lo,hi){return Math.max(lo,Math.min(hi,v));}

function rollNaturalIncrease(familiesK,moraleAfter,rng){
  if(moraleAfter<=-4)return 0;
  return rollD10x(familiesK,rng);
}
function rollNaturalDecrease(familiesK,rng){return rollD10x(familiesK,rng);}
function rollMoraleExtra(moraleAfter,familiesK,rng){
  const absMor=Math.abs(moraleAfter);
  if(absMor===0)return 0;
  const sum=rollD10x(absMor*familiesK,rng);
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
// Inverse of setPeasantPopulation: derive the domain's peasant total FROM its rural
// hexes. This is the canonical direction when families-per-hex-tracking is ON — the GM
// edits per-hex family counts directly, so the hexes are the source of truth and the
// domain total is simply their sum. Returns the new total.
function syncRuralPopulationFromHexes(d){
  if(!d || !d.demographics) return 0;
  const sum = _ruralHexes(d).reduce((s,h) => s + (h.families||0), 0);
  d.demographics.peasantFamilies = sum;
  return sum;
}
// On load, reconcile any drift between peasantFamilies and Σ(rural hex.families). The
// CANONICAL DIRECTION depends on the mode (CLAUDE principle #10 — canonical setters):
//   • families-per-hex-tracking ON  → the GM edits hexes directly, so the HEXES win:
//     derive peasantFamilies = Σ(hex.families). (Edge case: when the hexes are still
//     empty — hexSum 0 with a positive domain total — seed them from the total instead,
//     so a domain that just enabled the rule doesn't lose its population.)
//   • OFF (RAW default)             → peasantFamilies is the canonical domain-level
//     figure; redistribute it across the hexes by current weight.
// Returns the number of domains touched.
function reconcileRuralPopulation(campaign){
  if(!campaign || !Array.isArray(campaign.domains)) return 0;
  const perHexCanonical = isHouseRuleEnabled(campaign, 'families-per-hex-tracking');
  let fixed = 0;
  campaign.domains.forEach(d => {
    const hexes = _ruralHexes(d);
    if(hexes.length === 0) return;
    const pf = (d.demographics && d.demographics.peasantFamilies) || 0;
    const hexSum = hexes.reduce((s,h) => s + (h.families||0), 0);
    if(pf === hexSum) return;
    if(perHexCanonical && hexSum > 0){
      syncRuralPopulationFromHexes(d);   // hexes canonical → peasantFamilies = Σ(hex.families)
    } else {
      _redistributeRuralFamilies(d, pf); // domain total canonical (or seeding empty hexes)
    }
    fixed++;
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
  // Phase 3 Military W1 — first-class Units + Armies (the nested garrison/company arrays
  // mirror the SAME unit objects, so they are checked per-collection, never cross-collection).
  checkCollection(campaign.units, 'units');
  checkCollection(campaign.armies, 'armies');
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
  // 2026-06-05 — remove the retired `tributePct` field (auto-tribute is RAW realm-families now). Idempotent.
  migrateRemoveTributePct(current);
  // Phase #440 stage 1 — additive five-axis classification migration. Idempotent.
  // Walks campaign.characters[] and ensures every character has the canonical
  // controlledBy / socialTier / lifecycleState / creatureTypes / isEnchantedCreature
  // / hitDice fields. Legacy c.kind is preserved through stage 1 for display-string
  // compat; stage 2 will land the deletion after the index.html sweep.
  migrateAllCharacterClassification(current);
  // Items I1 — character coin purse. Idempotent. Ensures every character has a
  // coins:{pp,gp,ep,sp,cp} object (folding a legacy personalGp scalar into coins.gp)
  // and keeps the personalGp mirror in lockstep (canonical-setter rule #10).
  migrateAllCharacterCoins(current);
  // #445 — Wave A relation backfill. Idempotent. Lifts character.liegeCharacterId,
  // domain.magistrates, domain.liegeId, domain.expenses.tributeToLiege into
  // henchmanships / specialistContracts / hirelingContracts / magistracies /
  // vassalages / tributaryAgreements records. Additive; legacy fields preserved.
  migrateLegacyToWaveARelations(current);
  // #468 — Stash A.3 — materialize domain.treasury scalar into treasury-stash
  // entities for each domain. Always-on core (the inventory-stash-system toggle
  // was removed v0.17.0). Idempotent. Per Phase_2.95_Stash_Plan.md §6.3.
  migrateAllDomainTreasuries(current);
  // Items I1 (OQ9, 2026-06-03) — upgrade legacy coin|bulk|item stash/carry lines
  // to the facet shape (facets[] + notableItemId) BEFORE reconcile reads them.
  // Idempotent; skips free-text inventory strings.
  migrateAllStashItemShapes(current);
  // #469 — Stash A.4 — item-consolidation reconcile + treasury-scalar reconcile.
  // Idempotent. Tidies legacy multi-entry stashes (e.g. multiple gp coin entries
  // from pre-A.2 data) and catches any scalar drift from external writers.
  reconcileAllStashes(current);
  reconcileTreasuryScalars(current);
  // 2026-05-30 post-survey scope reservations — lazy backfill of additive fields.
  // Idempotent. Ensures Campaign/Hex/Character/Settlement/Event new optional fields
  // exist on legacy saves. See Data_Dictionary.md §13.2 + §13.3.
  lazyDefaultV1ScopeReservations(current);
  // Phase 2.5 Monster Persistence (#476, M0) — lift legacy nested hex.lairs[] sub-entities to the
  // first-class campaign.lairs[] collection (same pattern as the treasury→stash lift). Runs after
  // lazyDefaultV1ScopeReservations guarantees campaign.lairs[]. Idempotent; a no-op on campaigns
  // with no nested lairs (every shipped template). See migrateLegacyHexLairs below.
  migrateLegacyHexLairs(current);
  // Phase 3 Military W1 (2026-06-12) — lift nested garrison/mercenary-company units to the
  // first-class campaign.units[] collection, reference-unified (the SAME object in both homes —
  // the hexes precedent, Architecture §3.3). Runs after lazyDefaultV1ScopeReservations guarantees
  // campaign.units[]/armies[]. Idempotent + self-healing in both directions (a JSON round-trip
  // duplicates the shared objects; this re-unifies by id on every load).
  migrateGarrisonUnitsToUnits(current);
  // Wave Construction-B — backfill agricultural improvements onto Project entities. Runs after
  // lazyDefaultV1ScopeReservations (which guarantees campaign.projects[]) and reads campaign.hexes
  // (canonical top-level collection). Idempotent. See migrateAgriculturalToProjects below.
  migrateAgriculturalToProjects(current);
  // #521 follow-up — rebuild each party's member mirror + validate leader from the
  // character.partyId truth (Architecture §3.3). Idempotent; no-op on party-less templates.
  reconcilePartyMembership(current);
  // Items I1 / Stash B — every party has a camp stash that travels with it. Runs after
  // membership reconcile (needs leader/members) + treasury migration. Always-on core;
  // a no-op on party-less campaigns (e.g. the templates). Idempotent.
  syncAllPartyCampStashes(current);
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
  // Favors & Duties (#230, F&D-1 — 2026-06-08) — the liege↔vassal obligation relation collection.
  if(!Array.isArray(campaign.favorDutyObligations)) campaign.favorDutyObligations = [];
  // Phase 2.5 Monster Persistence (#476, M0 — 2026-06-09) — Lairs as first-class placed entities.
  if(!Array.isArray(campaign.lairs)) campaign.lairs = [];
  // #476 Encounter layer E1 (2026-06-10) — Encounters as first-class interactions (D8).
  if(!Array.isArray(campaign.encounters)) campaign.encounters = [];
  // Phase 3 Military W1 (2026-06-12) — Units (first-class; the nested garrison/company
  // arrays stay reference-unified mirrors) + Armies.
  if(!Array.isArray(campaign.units)) campaign.units = [];
  if(!Array.isArray(campaign.armies)) campaign.armies = [];
  // Phase 3 Military W3 (2026-06-12) — Battles (RR pp.461–472 engagement records).
  if(!Array.isArray(campaign.battles)) campaign.battles = [];
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
      // Phase 2.5 Journeys (#475) — travel-relevant hex geography.
      if(typeof h.hasRoad !== 'boolean')  h.hasRoad = false;
      if(typeof h.hasTrail !== 'boolean') h.hasTrail = false;
      if('riverCount' in h) delete h.riverCount; // #225 dropped: not RAW-grounded (no overland crossing-cost rule) + unused; rivers are riverSides[] edges now (RAW crossing = Swimming throws, RR p.271)
      if(typeof h.elevationFt !== 'number') h.elevationFt = 0;
      // NB: groundCondition (mud/snow ×1/2, RR p.272) is deliberately NOT backfilled — it's a sparse
      // GM-set transient that the engine + hex card default to 'clear' when absent, so stamping an
      // inert default onto every legacy/template hex (breaking the migrate-no-op invariant + churning
      // the templates) buys nothing. blankHex seeds it on new hexes.
    }
  }
  // Per-character new fields
  if(Array.isArray(campaign.characters)){
    for(const c of campaign.characters){
      if(!c) continue;
      if(typeof c.heroicCode === 'undefined')          c.heroicCode = null;
      if(typeof c.fatePoints === 'undefined')          c.fatePoints = null;
      if(typeof c.transformationState === 'undefined') c.transformationState = null;
      // Phase 2.5 Journeys (#475) — per-character travel + survival state (persists across journeys).
      if(typeof c.currentJourneyId === 'undefined')    c.currentJourneyId = null;
      if(typeof c.personalFatigue !== 'number')        c.personalFatigue = 0;
      if(typeof c.hungerDays !== 'number')             c.hungerDays = 0;
      if(typeof c.dehydrationDays !== 'number')        c.dehydrationDays = 0;
    }
  }
  // Journeys — normalize the pace enum to RAW's three paces (RR p.272). The retired tool
  // constructs 'cautious' (×1/2) and 'half-ancillary' (×0.1) both map to RAW 'half-speed' (×1/2).
  if(Array.isArray(campaign.journeys)){
    for(const j of campaign.journeys){
      if(!j) continue;
      if(j.pace === 'cautious' || j.pace === 'half-ancillary') j.pace = 'half-speed';
      if(!Array.isArray(j.routeCoords)) j.routeCoords = [];  // §24 — informational route cache; [] = computed on demand
      if(j.routeAnchorHexId === undefined) j.routeAnchorHexId = null;   // §24 mid-journey re-route anchor (null ⇒ route runs from startHexId)
      if(typeof j.coveredBaseline !== 'number') j.coveredBaseline = 0;  // §24 — hexes walked under prior route epochs
      if(typeof j.speedOverrideMilesPerDay === 'undefined') j.speedOverrideMilesPerDay = null;  // §26 GM speed override (null ⇒ pace governs)
      if(typeof j.strayHeading === 'undefined') j.strayHeading = null;                          // §27 getting-lost — stray hex face (null ⇒ not lost)
      if(typeof j.routeAnchorCoord === 'undefined') j.routeAnchorCoord = null;                  // §27 — coord anchor while straying off authored hexes
      if(typeof j.forageWaterEnabled !== 'boolean') j.forageWaterEnabled = false;               // Provisioning — party water-forage tick
      if(typeof j.shareRations !== 'boolean') j.shareRations = false;                           // Provisioning — share food + water tick
      // Provisioning — seed an in-flight journey's abstract supplies into tight inventory on load
      // (decision #1). Idempotent; only touches in-transit journeys carrying a non-zero legacy pool.
      if(j.status === 'in-transit' && global.ACKS && global.ACKS.seedJourneyProvisions) global.ACKS.seedJourneyProvisions(campaign, j);
      // Travel pivot — a journey's name describes WHO travels, not the route. Re-derive an auto-route
      // name (contains ' → ') or an empty name from the party/character set; a GM-set name (no arrow)
      // is preserved. Only applies when a named traveller exists (else the route name is kept).
      const _jname = (j.name || '').trim();
      if((!_jname || _jname.indexOf(' → ') >= 0) && global.ACKS && global.ACKS.journeyDefaultName){
        const _who = global.ACKS.journeyDefaultName(campaign, j);
        if(_who) j.name = _who;
      }
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

// ── Time-based construction (RAW RR p.174 — 2026-05-31) ──
// RAW: construction is labor-paid and takes TIME — each day, workers add a gp "construction rate"
// toward the cost. RAW's "Typical Laborer" simplification (RR p.174): 3,000 laborers build 500gp/day,
// so a 25,000gp land-improvement step takes ~50 days. We default agricultural improvement to this
// flat rate; a workforce-driven per-domain rate is an optional refinement. These helpers are the
// shared foundation for the day-tick drip; they are inert until the day-tick consumer uses them.
const AGRICULTURAL_CONSTRUCTION_RATE_PER_DAY = 500; // gp/day (RR p.174 "Typical Laborer")

// gp/day at which an agricultural improvement progresses. Flat Typical-Laborer default for now;
// the signature carries campaign/domain/hex so a workforce-driven model can layer in without churn.
function agriculturalConstructionRatePerDay(campaign, domain, hex){
  return AGRICULTURAL_CONSTRUCTION_RATE_PER_DAY;
}

// Supervisor adequacy for a hex's agricultural improvement (RR p.174: a structure/vessel project
// MUST be overseen by a siege engineer [≤25,000gp] or engineer [≤100,000gp]; multiple may
// co-supervise, caps additive). On-site = supervisor.currentHexId is this hex, or unset (permissive
// for legacy data whose character locations aren't filled in). Returns { ok, totalCap, report[],
// blockReason }. When remainingStepCost is given, enforces the cap-covers-the-remaining-step rule.
// Extracted from the commitTurn ag block so the day-tick consumer and the monthly path agree.
//
// Derive a character's construction-supervision cap from PROFICIENCY, not from a hired-specialist
// title (RR p.353: "a character with sufficient ranks of Engineering or Siege Engineering proficiency
// can serve as the construction supervisor"). Engineering -> <=100,000gp (engineer); Siege Engineering
// -> <=25,000gp (siege engineer), per RR p.174. A manually-set character.constructionSupervisorCap is
// honored as a fallback/override (NPCs entered without proficiency detail). 0 = not a supervisor.
// NOTE: RR p.174 says one rank of Siege Engineering counts as a skilled laborer, not a siege engineer;
// a ranks check is a future refinement once the proficiency model tracks ranks (it stores names today).
function constructionSupervisorCapForCharacter(character){
  if(!character) return 0;
  const manual = character.constructionSupervisorCap || 0;
  const profs = (character.proficiencies || []).map(p => (typeof p === 'string' ? p : (p && p.key) || '').toLowerCase());
  let derived = 0;
  if(profs.some(p => p.includes('engineering') && !p.includes('siege'))) derived = 100000;      // Engineer
  else if(profs.some(p => p.includes('siege engineering'))) derived = 25000;                     // Siege Engineer
  return Math.max(derived, manual);
}

function agriculturalSupervisorAdequacy(campaign, hex, remainingStepCost){
  const ids = (hex && Array.isArray(hex.constructionSupervisorCharacterIds)) ? hex.constructionSupervisorCharacterIds
            : (hex && hex.constructionSupervisorCharacterId ? [hex.constructionSupervisorCharacterId] : []);
  const report = [];
  let totalCap = 0;
  const findCh = (id) => ((campaign && campaign.characters) || []).find(c => c && c.id === id) || null;
  if(!ids || ids.length === 0){
    return { ok: false, totalCap: 0, report, blockReason: 'no supervisor assigned' };
  }
  ids.forEach(sid => {
    const sup = findCh(sid);
    if(!sup){ report.push({ id: sid, name: '(missing)', onSite: false, cap: 0, reason: 'character not found' }); return; }
    const cap = constructionSupervisorCapForCharacter(sup);   // proficiency-derived (RR p.353), manual field as fallback
    const onSite = !sup.currentHexId || sup.currentHexId === hex.id;
    if(cap <= 0){ report.push({ id: sid, name: sup.name, onSite, cap, reason: 'not a construction supervisor (cap = 0)' }); return; }
    if(!onSite){ report.push({ id: sid, name: sup.name, onSite: false, cap, reason: 'not on-site (at a different hex)' }); return; }
    report.push({ id: sid, name: sup.name, onSite: true, cap });
    totalCap += cap;
  });
  if(totalCap <= 0){
    const issues = report.filter(r => r.reason).map(r => r.name + ': ' + r.reason).join('; ');
    return { ok: false, totalCap: 0, report, blockReason: 'no eligible on-site supervisor (' + (issues || 'none') + ')' };
  }
  if(remainingStepCost != null && totalCap < remainingStepCost){
    return { ok: false, totalCap, report,
      blockReason: 'combined on-site supervisor cap (' + totalCap.toLocaleString() + 'gp) below remaining step cost (' + Number(remainingStepCost).toLocaleString() + 'gp)' };
  }
  return { ok: true, totalCap, report, blockReason: '' };
}

// Find a hex by id from BOTH the top-level collection and nested domain geography (robust to the
// pre-lift split-domains shape, like migrateAgriculturalToProjects).
function _hexByIdAnywhere(campaign, hexId){
  if(!campaign || !hexId) return null;
  const top = (campaign.hexes || []).find(h => h && h.id === hexId);
  if(top) return top;
  for(const d of (campaign.domains || [])){
    const h = d && d.geography && (d.geography.hexes || []).find(x => x && x.id === hexId);
    if(h) return h;
  }
  return null;
}

// Compute ONE day-tick's agricultural drip for a Project, authoritatively against the current
// campaign state (treasury, hex budget, supervisor, caps). PURE — does not mutate. The day-tick
// PROPOSE half uses it to project the record; the COMMIT half uses it to apply, so projection and
// apply always agree. The drip is clipped to: rate*days, the hex budget, the domain treasury, and
// the gp remaining to the value/bonus cap. Returns a result object (drip 0 + a blockReason/atCap
// when it can't progress).
function computeAgriculturalDrip(campaign, project, days){
  days = (typeof days === 'number' && days > 0) ? days : 1;
  const COST = global.ACKS.AGRICULTURAL_IMPROVEMENT_COST_PER_STEP;
  const MAXB = global.ACKS.AGRICULTURAL_IMPROVEMENT_MAX_BONUS;
  const VCAP = global.ACKS.AGRICULTURAL_IMPROVEMENT_VALUE_CAP;
  const out = { drip: 0, blocked: false, blockReason: '', atCap: false, hex: null, domain: null,
    rate: 0, base: 0, bonus: 0, invested: 0, budget: 0, treasury: 0, remainingStep: 0,
    supervisorReport: [], stepsWillComplete: 0, treasuryLimited: false };
  if(!project || project.constructibleKind !== 'agricultural-improvement') return out;
  const hex = _hexByIdAnywhere(campaign, project.siteHexId);
  if(!hex){ out.blocked = true; out.blockReason = 'hex not found'; return out; }
  const domain = (campaign.domains || []).find(d => d && d.id === project.ownerDomainId) || null;
  const base = hex.valuePerFamily || 0, bonus = hex.landImprovementBonus || 0;
  const invested = hex.landImprovementInvested || 0, budget = hex.improvementBudgetGp || 0;
  const treasury = (domain && domain.treasury && domain.treasury.gp) || 0;
  Object.assign(out, { hex, domain, base, bonus, invested, budget, treasury });
  if(bonus >= MAXB || base + bonus >= VCAP){ out.atCap = true; out.blockReason = 'at cap'; return out; }
  if(budget <= 0){ out.blockReason = 'no budget allocated'; return out; }
  // RAW (RR p.174): the siege-engineer/engineer supervisor requirement is for "a construction
  // project of a STRUCTURE or VESSEL". Land improvement (RR p.341 — irrigation/drainage/terracing,
  // ordered by the ruler) is neither, so it needs NO engineer; it builds at the labor rate. The ruler
  // or munerator may OPTIONALLY oversee it for a speed bonus (RR p.353), a future refinement. So no
  // supervisor gate here. agriculturalSupervisorAdequacy is retained for the structure/vessel
  // construction that lands later (and that check should derive from Engineering/Siege Engineering
  // PROFICIENCY, not a manual cap field — see constructionSupervisorCapForCharacter).
  const stepsAllowed = Math.min(MAXB - bonus, VCAP - (base + bonus));   // integer +1 steps to the cap
  const costToCap = Math.max(0, stepsAllowed * COST - invested);        // gp from now to the cap
  const rate = agriculturalConstructionRatePerDay(campaign, domain, hex);
  out.rate = rate;
  out.drip = Math.max(0, Math.min(rate * days, budget, Math.max(0, treasury), costToCap));
  out.stepsWillComplete = Math.floor((invested + out.drip) / COST) - Math.floor(invested / COST);
  // Flag when the DOMAIN TREASURY was the binding constraint — i.e. pay-as-you-build ran the domain's
  // cash below the full rate, even though budget + cost-to-cap still had room. Lets the UI explain a
  // drip that fell short despite budget remaining (the "+1,500 over 7 days but 33,500 budget left" case).
  const want = rate * days, cash = Math.max(0, treasury);
  out.treasuryLimited = cash < want && cash < budget && cash < costToCap;
  if(out.drip <= 0 && cash <= 0 && budget > 0){ out.blockReason = 'treasury empty'; }
  return out;
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
  // Collect every hex from BOTH the top-level campaign.hexes collection AND each domain's nested
  // geography.hexes. migrateCampaign runs BEFORE liftToTopLevelCollections, so at this point one of
  // the two can be stale/empty while the other holds the live values (e.g. a session-restored save
  // whose top-level campaign.hexes hasn't been re-unified yet). Reading both makes the reconcile +
  // create passes robust to either storage shape. campaign.hexes wins on id collision (it is the
  // canonical top-level copy; the nested copy can lag, as in the shipped templates).
  const hexById = Object.create(null);
  const addHexes = (arr) => { if(Array.isArray(arr)){ for(const h of arr){ if(h && h.id && !hexById[h.id]) hexById[h.id] = h; } } };
  addHexes(campaign.hexes);
  if(Array.isArray(campaign.domains)){ for(const d of campaign.domains){ if(d && d.geography) addHexes(d.geography.hexes); } }
  const allHexes = Object.keys(hexById).map(k => hexById[k]);
  // Normalize any hex carrying landImprovementInvested >= one full step. The old monthly model
  // ratcheted at commit, but the timed model ratchets at drip time — so an authored/legacy hex with
  // >= 25,000gp banked (and no active budget to drip) would otherwise never advance. Ratcheting here
  // on load converts the overflow into earned bonus immediately. Idempotent (ratchet leaves < step).
  for(const hex of allHexes){
    if(!hex) continue;
    if((hex.landImprovementInvested || 0) >= global.ACKS.AGRICULTURAL_IMPROVEMENT_COST_PER_STEP){
      global.ACKS.ratchetAgriculturalImprovement(hex);
    }
    // Clear stranded budget on a capped hex — the drip can't spend past the value/bonus cap
    // (pay-as-you-build stops there), so leftover budget would just sit misleadingly.
    const _base = hex.valuePerFamily || 0, _bonus = hex.landImprovementBonus || 0;
    if((_bonus >= global.ACKS.AGRICULTURAL_IMPROVEMENT_MAX_BONUS || _base + _bonus >= global.ACKS.AGRICULTURAL_IMPROVEMENT_VALUE_CAP) && (hex.improvementBudgetGp || 0) > 0){
      hex.improvementBudgetGp = 0;
    }
  }
  // Reconcile EXISTING agricultural Projects to their hex's canonical state. Catches lifecycleState
  // / gpSpent drift — e.g. a Project left 'under-construction' after its hex reached the value or
  // bonus cap (whether via a GM hex edit in the Inspector, the legacy landImprovementProjects
  // completion path, or a save written by an older build). Canonical-setter doctrine, CLAUDE.md
  // principle #10: stored fields that should agree must never drift — reconcile at load. Resync
  // only; no history entry appended.
  for(const proj of campaign.projects){
    if(!proj || proj.constructibleKind !== 'agricultural-improvement') continue;
    const hex = hexById[proj.siteHexId];
    if(hex) syncAgriculturalProject(campaign, hex, { domainId: proj.ownerDomainId || hex.domainId || null });
  }
  // Carry any legacy per-month queue (queuedImprovementGp) into the persistent dripping budget.
  // Under the timed model the panel writes improvementBudgetGp directly; this preserves allocations
  // a GM set under the old queue-then-commit flow. Idempotent (the queue is zeroed after the move).
  for(const hex of allHexes){
    if(hex && (hex.queuedImprovementGp || 0) > 0){
      hex.improvementBudgetGp = (hex.improvementBudgetGp || 0) + hex.queuedImprovementGp;
      hex.queuedImprovementGp = 0;
    }
  }
  // Create live Projects for hexes with work in flight — invested gp OR a dripping budget — that
  // lack one, so the day-tick can find and advance them.
  for(const hex of allHexes){
    if(!hex || !hex.id) continue;
    const invested = hex.landImprovementInvested || 0;
    const budget = hex.improvementBudgetGp || 0;
    if(invested <= 0 && budget <= 0) continue;
    if(findAgriculturalProject(campaign, hex.id)) continue; // idempotent
    syncAgriculturalProject(campaign, hex, {
      domainId: hex.domainId || null,
      historyType: 'migrated',
      historyNarrative: 'Agricultural improvement lifted onto the unified Project model (bonus +'
        + (hex.landImprovementBonus || 0) + ', ' + invested.toLocaleString() + 'gp invested, '
        + budget.toLocaleString() + 'gp budget).'
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

// ── Phase 2.5 Journeys (#475) — lookups + a pure hex-distance helper ──
function findJourney(campaign, journeyId){
  if(!campaign || !Array.isArray(campaign.journeys)) return null;
  return campaign.journeys.find(j => j && j.id === journeyId) || null;
}
function journeysInTransit(campaign){
  if(!campaign || !Array.isArray(campaign.journeys)) return [];
  return campaign.journeys.filter(j => j && j.status === 'in-transit');
}
function journeysWithParticipant(campaign, characterId){
  if(!campaign || !Array.isArray(campaign.journeys) || !characterId) return [];
  return campaign.journeys.filter(j => j && Array.isArray(j.participantCharacterIds) && j.participantCharacterIds.indexOf(characterId) >= 0);
}
// Resolve a hex by id from the canonical top-level collection, falling back to per-domain
// geography (the UI keeps hexes split across domains' geography.hexes). Pure read.
function resolveHexAnywhere(campaign, hexId){
  if(!campaign || !hexId) return null;
  const top = findHex(campaign, hexId);
  if(top) return top;
  if(Array.isArray(campaign.domains)){
    for(const d of campaign.domains){
      const hexes = d && d.geography && d.geography.hexes;
      if(Array.isArray(hexes)){
        const h = hexes.find(x => x && x.id === hexId);
        if(h) return h;
      }
    }
  }
  return null;
}
// Axial hex distance between two {q, r} coords (cube-coordinate metric). Pure.
function hexAxialDistance(a, b){
  if(!a || !b) return 0;
  const aq = a.q || 0, ar = a.r || 0, bq = b.q || 0, br = b.r || 0;
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(aq + ar - bq - br)) / 2;
}
// The authored hex at axial coord (q,r), or null. Accepts (campaign, q, r) or (campaign, {q,r}).
// Checks the canonical top-level store first, then the reference-unified nested geography mirror.
// Used by hex-by-hex journey resolution to look up the hexes a route passes through (a route
// step over an UNauthored coord returns null, and the caller falls back to the journey's base
// environment — so per-hex/per-side travel effects apply only where cartography exists).
function hexAtCoord(campaign, q, r){
  if(!campaign) return null;
  if(q && typeof q === 'object'){ r = q.r; q = q.q; }
  if(typeof q !== 'number' || typeof r !== 'number') return null;
  if(Array.isArray(campaign.hexes)){
    for(const h of campaign.hexes){ if(h && h.coord && h.coord.q === q && h.coord.r === r) return h; }
  }
  if(Array.isArray(campaign.domains)){
    for(const d of campaign.domains){
      const gh = d && d.geography && d.geography.hexes;
      if(Array.isArray(gh)){ for(const h of gh){ if(h && h.coord && h.coord.q === q && h.coord.r === r) return h; } }
    }
  }
  return null;
}
function isJourney(o){ return !!(o && typeof o.id === 'string' && o.id.startsWith('jrn-')); }

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
  // Party stashes for the party this character belongs to. character.partyId is the canonical
  // membership truth (Architecture §3.3); read it directly so this works even before
  // reconcilePartyMembership has rebuilt the party.memberCharacterIds mirror.
  if(Array.isArray(campaign.stashes)){
    const ch = Array.isArray(campaign.characters) ? campaign.characters.find(c => c && c.id === characterId) : null;
    const myPartyId = ch && ch.partyId;
    if(myPartyId){
      for(const st of campaign.stashes){
        if(st.ownerPartyId === myPartyId) out.push(st);
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
    const pf = primaryFacet(it);
    if(pf === 'coin') return { kind:'coin', label: it.denomination || 'gp', qty: it.qty || 0 };
    if(pf === 'bulk') return { kind:'bulk', label: it.name || it.label || '(unnamed)', unit: it.unit || 'stones', qty: it.qty || 0 };
    return { kind: pf, label: it.name || '(unnamed)', qty: it.qty || 1, notableItemId: it.notableItemId || it.magicItemId || null };
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
    if(itemHasFacet(normalized, 'coin')){
      const existing = stash.items.find(x =>
        itemHasFacet(x, 'coin') && (x.denomination || 'gp') === (normalized.denomination || 'gp')
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
// Phase 2.95 Stash B (engine foundation, 2026-06-03) — carry↔stash transfers,
// controller change, find-or-create, and the RAW carry-encumbrance bands the
// character-sheet surface reads. Per Phase_2.95_Stash_Plan.md §6.2–§6.4 + §12.
// =============================================================================

// --- One-per-owner-per-hex find-or-create ("the windfall lands here" helper) --
// ownerSpec: {characterId} | {partyId} | {domainId}. opts.kind overrides the
// default kind for a character owner (personal | cache). Returns an existing
// match (same owner + hex + kind) or a freshly created + pushed stash.
function findOrCreateStashAt(campaign, ownerSpec, hexId, opts){
  if(!campaign || !ownerSpec) return null;
  opts = opts || {};
  if(!Array.isArray(campaign.stashes)) campaign.stashes = [];
  let ownerField, ownerId, kind;
  if(ownerSpec.characterId){ ownerField='ownerCharacterId'; ownerId=ownerSpec.characterId; kind=opts.kind || 'personal'; }
  else if(ownerSpec.partyId){ ownerField='ownerPartyId'; ownerId=ownerSpec.partyId; kind='party'; }
  else if(ownerSpec.domainId){ ownerField='ownerDomainId'; ownerId=ownerSpec.domainId; kind='domain-treasury'; }
  else return null;
  const existing = campaign.stashes.find(s => s && s.hexId === hexId && s[ownerField] === ownerId && s.kind === kind);
  if(existing) return existing;
  const blankStash = (global.ACKS && global.ACKS.blankStash) || null;
  if(!blankStash) return null;
  const s = blankStash({ kind, hexId });
  s[ownerField] = ownerId;
  s.name = opts.name || (kind === 'domain-treasury' ? 'Treasury' : (kind === 'party' ? 'Party loot' : 'Cache'));
  s.createdAtTurn = campaign.currentTurn || 1;
  campaign.stashes.push(s);
  return s;
}

// --- Private: atomic withdraw from a bare item array (carry inventory) --------
// Mirrors withdrawFromStash's validate-then-apply atomicity. withdrawals:
// [{itemId, qty?}]. Returns {ok, removed} (removed = detached item lines).
function _withdrawFromItemArray(items, withdrawals){
  if(!Array.isArray(items) || !Array.isArray(withdrawals)) return { ok:false, removed:[] };
  const blankStashItem = (global.ACKS && global.ACKS.blankStashItem) || null;
  const plan = [];
  for(const w of withdrawals){
    if(!w || !w.itemId) return { ok:false, removed:[] };
    const entry = items.find(it => it && it.id === w.itemId);
    if(!entry) return { ok:false, removed:[] };
    const have = (entry.qty != null) ? entry.qty : 1;
    const req = (w.qty != null) ? w.qty : have;
    if(typeof req !== 'number' || req <= 0 || req > have) return { ok:false, removed:[] };
    plan.push({ entry, req, isFull: req === have });
  }
  const removed = [];
  for(const step of plan){
    if(step.isFull){
      const idx = items.indexOf(step.entry);
      if(idx >= 0) items.splice(idx, 1);
      removed.push(step.entry);
    } else {
      step.entry.qty = (step.entry.qty || 0) - step.req;
      const copySpec = Object.assign({}, step.entry, { id: undefined, qty: step.req });
      removed.push(blankStashItem ? blankStashItem(copySpec) : copySpec);
    }
  }
  return { ok:true, removed };
}

// --- Carry → stash ("bank your coin at home") --------------------------------
function transferCarryToStash(campaign, characterId, stashId, withdrawals, opts){
  if(!campaign) return null;
  const ch = (campaign.characters || []).find(c => c && c.id === characterId);
  const stash = findStash(campaign, stashId);
  if(!ch || !stash) return null;
  if(!Array.isArray(ch.inventory)) ch.inventory = [];
  const out = _withdrawFromItemArray(ch.inventory, withdrawals);
  if(!out.ok) return null;
  depositToStash(campaign, stashId, out.removed, {
    reason: (opts && opts.reason) || 'bank-carry',
    source: { kind:'character', id: characterId, label: ch.name || null }
  });
  return { character: ch, stash, moved: out.removed };
}

// --- Stash → carry (warns over encumbrance, never blocks — RAW) --------------
function transferStashToCarry(campaign, stashId, characterId, withdrawals, opts){
  if(!campaign) return null;
  const ch = (campaign.characters || []).find(c => c && c.id === characterId);
  const stash = findStash(campaign, stashId);
  if(!ch || !stash) return null;
  const out = withdrawFromStash(campaign, stashId, withdrawals, {
    reason: (opts && opts.reason) || 'draw-from-stash',
    destination: { kind:'character', id: characterId, label: ch.name || null }
  });
  if(!out) return null;
  if(!Array.isArray(ch.inventory)) ch.inventory = [];
  for(const it of out.withdrawn) ch.inventory.push(it);
  const band = carryEncumbranceBandFor(carryTotalEncumbrance(ch));
  return { character: ch, stash, moved: out.withdrawn, overEncumbered: band.level === 'overloaded', band };
}

// --- Controller change (ruler succession on a domain-treasury; or owner swap) -
// For domain-treasury: ownerDomainId is UNCHANGED (the domain still owns it) — the
// controllerChanged history entry records who held office. For personal/cache:
// sets the new owner. newOwner: {characterId} | {partyId} | {domainId}.
function changeStashController(campaign, stashId, newOwner, opts){
  if(!campaign || !newOwner) return null;
  const stash = findStash(campaign, stashId);
  if(!stash) return null;
  const before = { ownerCharacterId: stash.ownerCharacterId, ownerPartyId: stash.ownerPartyId, ownerDomainId: stash.ownerDomainId };
  if(stash.kind !== 'domain-treasury'){
    if(newOwner.characterId !== undefined){ stash.ownerCharacterId = newOwner.characterId; stash.ownerPartyId = null; stash.ownerDomainId = null; }
    else if(newOwner.partyId !== undefined){ stash.ownerPartyId = newOwner.partyId; stash.ownerCharacterId = null; stash.ownerDomainId = null; }
  }
  _stampStashHistory(stash, (opts && opts.atTurn) || campaign.currentTurn || 1, 'controllerChanged', {
    reason: (opts && opts.reason) || 'controller-change',
    from: before,
    to: { ownerCharacterId: stash.ownerCharacterId, ownerPartyId: stash.ownerPartyId, ownerDomainId: stash.ownerDomainId },
    officeHolderCharacterId: (newOwner.characterId !== undefined ? newOwner.characterId : null)
  });
  return stash;
}

// =============================================================================
// Character ⇄ co-located stash transfer (Items I1 Step 3 — the GM-facing
// "cache from inventory / draw from a cache" verbs, per Phase_2.95_Stash_Plan §6.2).
// These operate on the SHIPPED carry shapes — the Phase 2.6 carry inventory
// (index-addressed {name,stone,notes}, NO ids) + the character.coins purse — and
// bridge them to/from facet stash items, so the §8.3 inventory→facet unification
// is NOT a prerequisite. (transferCarryToStash/transferStashToCarry above stay the
// id-based primitives for the future unified carry; the UI uses the two below.)
// Coins are routed to/from character.coins (the purse), NOT carry lines.
// =============================================================================

// Phase-2.6 carry line ({name,stone,notes,notableItemId?}) → a facet stash-item
// spec (depositToStash normalizes it). Stone → encumbranceSt so weight survives.
// A facet-shaped line (future unified carry) passes through unchanged.
function _carryLineToStashItem(line){
  if(!line) return null;
  if(Array.isArray(line.facets) && line.facets.length){
    return Object.assign({}, line, { id: undefined });   // already facet-shaped — clone, fresh id on deposit
  }
  return {
    facets: ['gear'],                                     // blankStashItem adds 'magical' if notableItemId set
    name: line.name || '',
    qty: (line.qty != null) ? line.qty : 1,
    encumbranceSt: (line.stone != null) ? (parseFloat(line.stone) || 0) : null,
    notableItemId: line.notableItemId || null,
    notes: line.notes || ''
  };
}

// Withdrawn facet stash item → a carry line. Keeps the full facet line (nothing
// lost — a withdrawn valuable retains unitValueGp, a notable retains its pointer)
// AND sets `stone` so the Phase 2.6 carry table renders its weight column.
function _stashItemToCarryLine(item){
  return Object.assign({}, item, {
    stone: itemEncumbranceSt(item),
    name: item.name || '',
    notes: item.notes || ''
  });
}

// --- Cache from carry → stash ("stash items/coins here") ----------------------
// spec: { itemIndices:[int], coins:{pp,gp,ep,sp,cp} }. Items addressed by carry
// index; coins drawn from the purse. Validate-all-then-apply (atomic). Returns
// { ok, stash, movedItems, movedCoinGp } | { ok:false, error }.
function cacheToStash(campaign, characterId, stashId, spec, opts){
  if(!campaign) return { ok:false, error:'no-campaign' };
  const ch = (campaign.characters || []).find(c => c && c.id === characterId);
  const stash = findStash(campaign, stashId);
  if(!ch || !stash) return { ok:false, error:'not-found' };
  spec = spec || {};
  const indices = Array.isArray(spec.itemIndices) ? spec.itemIndices.slice() : [];
  const coins = spec.coins || {};
  if(!Array.isArray(ch.inventory)) ch.inventory = [];
  reconcileCharacterCoins(ch);

  // Validate item indices.
  for(const ix of indices){
    if(typeof ix !== 'number' || ix < 0 || ix >= ch.inventory.length || !Number.isInteger(ix)) return { ok:false, error:'bad-index' };
  }
  // Validate coins ≤ purse.
  let anyCoin = false;
  for(const d of COIN_DENOMINATIONS){
    const amt = Number(coins[d]) || 0;
    if(amt < 0) return { ok:false, error:'bad-coin' };
    if(amt > (Number(ch.coins[d]) || 0)) return { ok:false, error:'insufficient-coin' };
    if(amt > 0) anyCoin = true;
  }
  if(indices.length === 0 && !anyCoin) return { ok:false, error:'nothing-selected' };

  // Apply: splice items high-index-first (so earlier indices stay valid), then coins.
  const depositItems = [];
  let movedItems = 0;
  for(const ix of indices.slice().sort((a,b) => b - a)){
    const line = ch.inventory[ix];
    depositItems.push(_carryLineToStashItem(line));
    ch.inventory.splice(ix, 1);
    movedItems++;
  }
  let movedCoinGp = 0;
  for(const d of COIN_DENOMINATIONS){
    const amt = Number(coins[d]) || 0;
    if(amt > 0){
      depositItems.push({ facets:['coin'], denomination:d, qty:amt });
      ch.coins[d] = (Number(ch.coins[d]) || 0) - amt;
      movedCoinGp += amt * (COIN_GP_VALUE[d] != null ? COIN_GP_VALUE[d] : 1);
    }
  }
  reconcileCharacterCoins(ch);   // keep personalGp mirror in lockstep (#10)

  depositToStash(campaign, stashId, depositItems, {
    reason: (opts && opts.reason) || 'cache-from-carry',
    source: { kind:'character', id: characterId, label: ch.name || null },
    atTurn: (opts && opts.atTurn) || campaign.currentTurn || 1
  });
  // GP Wave B (Architecture.md §4.3.6) — the cache/draw modal moved items but emitted no
  // eventLog event; emit the item-transfer (+ a wealth-transfer for the coin leg) so the
  // action surfaces in entity history. Suppressed when invoked as an item-transfer leg.
  if(!(opts && opts.suppressEvent) && global.ACKS){
    if(movedItems > 0 && global.ACKS.recordItemTransfer){
      global.ACKS.recordItemTransfer(campaign, {
        source: { kind:'character', id: characterId, label: ch.name || null },
        destination: { kind:'stash', id: stashId, label: stash.name || null },
        lines: depositItems.filter(d => (d.facets||[]).indexOf('coin') < 0).map(d => ({ name: d.name, qty: d.qty })),
        bucket: 'cache', reason: (opts && opts.reason) || 'cache'
      });
    }
    if(movedCoinGp > 0 && global.ACKS.recordWealthTransfer){
      global.ACKS.recordWealthTransfer(campaign, {
        source: { kind:'character-gp', id: characterId, label: ch.name || null },
        destination: { kind:'stash', id: stashId, label: stash.name || null },
        amount: movedCoinGp, bucket: 'cache', reason: (opts && opts.reason) || 'cache'
      });
    }
  }
  return { ok:true, stash, movedItems, movedCoinGp };
}

// --- Draw from a co-located stash → carry ("take items/coins") ----------------
// spec: { itemIds:[id], coins:{pp,gp,ep,sp,cp} }. Coin lines route to the purse;
// non-coin lines become carry lines (bridged). Warns over-encumbrance, never
// blocks (RAW). Returns { ok, stash, band, overEncumbered } | { ok:false, error }.
function drawFromStash(campaign, stashId, characterId, spec, opts){
  if(!campaign) return { ok:false, error:'no-campaign' };
  const ch = (campaign.characters || []).find(c => c && c.id === characterId);
  const stash = findStash(campaign, stashId);
  if(!ch || !stash) return { ok:false, error:'not-found' };
  spec = spec || {};
  const itemIds = Array.isArray(spec.itemIds) ? spec.itemIds.slice() : [];
  const coins = spec.coins || {};
  if(!Array.isArray(stash.items)) stash.items = [];
  if(!Array.isArray(ch.inventory)) ch.inventory = [];
  reconcileCharacterCoins(ch);

  const withdrawals = [];
  for(const id of itemIds){
    if(!stash.items.find(it => it && it.id === id)) return { ok:false, error:'item-not-found' };
    withdrawals.push({ itemId: id });   // full withdrawal
  }
  for(const d of COIN_DENOMINATIONS){
    const amt = Number(coins[d]) || 0;
    if(amt < 0) return { ok:false, error:'bad-coin' };
    if(amt === 0) continue;
    const coinLine = stash.items.find(it => itemHasFacet(it, 'coin') && (it.denomination || 'gp') === d);
    if(!coinLine || (coinLine.qty || 0) < amt) return { ok:false, error:'insufficient-coin' };
    withdrawals.push({ itemId: coinLine.id, qty: amt });
  }
  if(withdrawals.length === 0) return { ok:false, error:'nothing-selected' };

  const out = withdrawFromStash(campaign, stashId, withdrawals, {
    reason: (opts && opts.reason) || 'draw-to-carry',
    destination: { kind:'character', id: characterId, label: ch.name || null },
    atTurn: (opts && opts.atTurn) || campaign.currentTurn || 1
  });
  if(!out) return { ok:false, error:'withdraw-failed' };

  let movedCoinGp = 0; const movedItemLines = [];
  for(const line of out.withdrawn){
    if(itemHasFacet(line, 'coin')){
      const d = line.denomination || 'gp';
      ch.coins[d] = (Number(ch.coins[d]) || 0) + (line.qty || 0);
      movedCoinGp += itemValueGp(line);
    } else {
      ch.inventory.push(_stashItemToCarryLine(line));
      movedItemLines.push({ name: line.name || null, qty: (line.qty != null) ? line.qty : 1 });
    }
  }
  reconcileCharacterCoins(ch);
  // GP Wave B (Architecture.md §4.3.6) — emit the item-transfer (+ wealth-transfer coin leg).
  if(!(opts && opts.suppressEvent) && global.ACKS){
    if(movedItemLines.length && global.ACKS.recordItemTransfer){
      global.ACKS.recordItemTransfer(campaign, {
        source: { kind:'stash', id: stashId, label: stash.name || null },
        destination: { kind:'character', id: characterId, label: ch.name || null },
        lines: movedItemLines, bucket: 'draw', reason: (opts && opts.reason) || 'draw'
      });
    }
    if(movedCoinGp > 0 && global.ACKS.recordWealthTransfer){
      global.ACKS.recordWealthTransfer(campaign, {
        source: { kind:'stash', id: stashId, label: stash.name || null },
        destination: { kind:'character-gp', id: characterId, label: ch.name || null },
        amount: movedCoinGp, bucket: 'draw', reason: (opts && opts.reason) || 'draw'
      });
    }
  }
  const band = carryEncumbranceBandFor(carryTotalEncumbrance(ch));
  return { ok:true, stash, band, overEncumbered: band.level === 'overloaded' };
}

// =============================================================================
// Party camp stash (Items I1 / Stash B — "every party has a camp"). A party-owned
// stash named "<Party>'s Camp" that TRAVELS with the party: its hexId mirrors
// party.currentHexId (the party is the source of truth; the camp hex is a reconciled
// mirror — Architecture §3.3). The Stash subsystem is always-on core, so the camp is
// materialized for every non-disbanded party (the inventory-stash-system toggle was removed v0.17.0).
// =============================================================================
function partyCampStash(campaign, partyId){
  if(!campaign || !partyId || !Array.isArray(campaign.stashes)) return null;
  return campaign.stashes.find(s => s && s.kind === 'party' && s.ownerPartyId === partyId) || null;
}
// Idempotent find-or-create. Keeps the camp's hexId tracking the party, and its name
// tracking the party while it is still the auto-name (never clobbers a GM rename — a
// custom name that doesn't end in "'s Camp" is left alone). Returns the camp stash.
function ensurePartyCampStash(campaign, party){
  if(!campaign || !party || !party.id) return null;
  if(!Array.isArray(campaign.stashes)) campaign.stashes = [];
  let camp = partyCampStash(campaign, party.id);
  if(!camp){
    const _blankStash = (global.ACKS && global.ACKS.blankStash) || null;
    if(!_blankStash) return null;
    camp = _blankStash({ kind:'party', ownerPartyId: party.id, hexId: party.currentHexId || null, name: (party.name || 'Party') + "'s Camp" });
    camp.createdAtTurn = campaign.currentTurn || 1;
    campaign.stashes.push(camp);
  }
  camp.hexId = party.currentHexId || null;                                   // travels with the party
  if(!camp.name || /'s Camp$/.test(camp.name)) camp.name = (party.name || 'Party') + "'s Camp";
  return camp;
}
// Reconcile pass — ensure a camp for every non-disbanded party. Hooked into
// migrateCampaign (load). The Stash subsystem is always-on core, so this runs
// unconditionally; it is a no-op on party-less campaigns (e.g. the templates).
function syncAllPartyCampStashes(campaign){
  if(!campaign || !Array.isArray(campaign.parties)) return 0;
  let n = 0;
  for(const p of campaign.parties){ if(p && p.status !== 'disbanded' && ensurePartyCampStash(campaign, p)) n++; }
  return n;
}
// Light follow — used by the party-movement handlers (journey commit, gm-fiat). Does NOT
// create (creation is gated at ensure/sync); just keeps an existing camp at the party's hex.
function syncPartyCampHex(campaign, party){
  if(!campaign || !party) return;
  const camp = partyCampStash(campaign, party.id);
  if(camp) camp.hexId = party.currentHexId || null;
}
// Party dissolved → the leader takes the camp: re-home it as the leader's personal stash
// (all items + coins travel with ownership — "the leader takes all the equipment"). No
// leader → leave it as an ownerless cache at the hex so nothing is lost. (Splitting the
// camp among members on disband is a queued future feature — Stash plan §15 / Mech Ext.)
function handOffPartyCampToLeader(campaign, party){
  if(!campaign || !party) return null;
  const camp = partyCampStash(campaign, party.id);
  if(!camp) return null;
  const leaderId = party.leaderCharacterId || (Array.isArray(party.memberCharacterIds) && party.memberCharacterIds[0]) || null;
  if(leaderId){
    changeStashController(campaign, camp.id, { characterId: leaderId }, { reason:'party-disbanded' });
    camp.kind = 'personal';
    camp.name = (party.name || 'Party') + ' camp (dissolved)';
    return { camp, leaderId };
  }
  camp.kind = 'cache'; camp.ownerPartyId = null;
  camp.name = (party.name || 'Party') + ' camp (abandoned)';
  return { camp, leaderId: null };
}

// --- RAW carry-encumbrance bands (RR pp.83–84) -------------------------------
// Carry weight is in stone (coins: 1,000 = 1 st). Movement by load band:
// exploration ft/turn, combat ft/round (≈ 1/3 exploration), expedition miles/day.
// v1 surfaces the band on the sheet; propagating the penalty into other
// subsystems is Phase 3 travel (Journeys already uses the 24-mi unencumbered base).
const CARRY_ENCUMBRANCE_BANDS = [
  { level:'unencumbered', label:'Unencumbered',    maxSt: 5,       explorationFeet:120, combatFeet:40, milesPerDay:24 },
  { level:'light',        label:'Lightly loaded',  maxSt: 7,       explorationFeet: 90, combatFeet:30, milesPerDay:18 },
  { level:'heavy',        label:'Heavily loaded',  maxSt:10,       explorationFeet: 60, combatFeet:20, milesPerDay:12 },
  { level:'severe',       label:'Severely loaded', maxSt:20,       explorationFeet: 30, combatFeet:10, milesPerDay: 6 },
  { level:'overloaded',   label:'Overloaded',      maxSt:Infinity, explorationFeet:  0, combatFeet: 0, milesPerDay: 0 }
];
function carryEncumbranceBandFor(totalSt){
  const t = totalSt || 0;
  for(const b of CARRY_ENCUMBRANCE_BANDS){ if(t <= b.maxSt) return b; }
  return CARRY_ENCUMBRANCE_BANDS[CARRY_ENCUMBRANCE_BANDS.length - 1];
}
function carryEncumbranceLevel(character){ return carryEncumbranceBandFor(carryTotalEncumbrance(character)).level; }
function carryEncumbranceInfo(character){
  const totalSt = carryTotalEncumbrance(character);
  return { totalSt, band: carryEncumbranceBandFor(totalSt) };
}

// =============================================================================
// Phase 2.95 Stash A.3 — domain.treasury → treasury-stash migration (#468 / 2026-05-29).
// Per Phase_2.95_Stash_Plan.md §6.3 + §8.2. Idempotent. Always-on core
// (the inventory-stash-system toggle was removed v0.17.0).
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
// Always-on core (the inventory-stash-system toggle was removed v0.17.0): this
// materializes a treasury stash for every domain on load. Returns the number of
// domains that ended up with a treasuryStashId — useful diagnostic but not
// strictly the number of newly-created stashes (orphan repair counts too).
function migrateAllDomainTreasuries(campaign){
  if(!campaign) return 0;
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
    // gp-equivalent of every coin line (handles multi-denomination treasuries; a
    // pure-gp treasury — the common case — is unchanged). Items I1, 2026-06-03.
    if(it && itemHasFacet(it, 'coin')){
      total += itemValueGp(it);
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
// Routes through depositToStash whenever a treasuryStashId is linked (the Stash
// subsystem is always-on core), otherwise mutates the scalar directly. The C.1
// event-handler analog (_applyTreasuryDelta in acks-engine-events.js) does
// the same thing but takes a domainId — this version takes the domain object
// because commitTurn already has it in scope. Both routes preserve the A.4
// invariant: after the call, domain.treasury.gp matches the stash sum.
//
// Zero-amount calls are no-ops (defensive).
function _applyDomainTreasuryDelta(campaign, domain, amount, opts){
  if(!campaign || !domain || !amount) return;
  opts = opts || {};
  // Stash subsystem is always-on core — route through the treasury stash whenever
  // one is linked; the scalar fallback below covers the pre-migration window.
  if(domain.treasuryStashId){
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
// Merge fungible facet-lines in stash.items (Items I1 facet model, 2026-06-03):
//   - coin    facet: same denomination → sum qty
//   - bulk    facet: same (name, unit) → sum qty + encumbranceSt
//   - gear    facet (and NOT magical/valuable/notable, named) → sum qty + encumbranceSt
// Coin is already merged on deposit by depositToStash, so this is a no-op for
// coin in normal operation; we still pass through it defensively in case
// historical data has multiple coin entries of the same denomination. Notable
// (promoted), valuable, and unnamed lines never merge — each is distinct.
//
// Notes are kept from the FIRST entry (consolidation preserves the oldest
// audit context). Returns true when any merge happened.
function reconcileStashItems(stash){
  if(!stash || !Array.isArray(stash.items) || stash.items.length < 2) return false;
  const items = stash.items;
  const coinBuckets = {};
  const bulkBuckets = {};
  const gearBuckets = {};
  const out = [];
  let merged = false;

  for(const it of items){
    if(!it){ continue; }
    if(itemHasFacet(it, 'coin')){
      const key = it.denomination || 'gp';
      if(!coinBuckets[key]){ coinBuckets[key] = it; out.push(it); }
      else { coinBuckets[key].qty = (coinBuckets[key].qty || 0) + (it.qty || 0); merged = true; }
    } else if(itemHasFacet(it, 'bulk')){
      const key = (it.name || it.label || '(unnamed)') + '|' + (it.unit || 'stones');
      if(!bulkBuckets[key]){ bulkBuckets[key] = it; out.push(it); }
      else {
        bulkBuckets[key].qty           = (bulkBuckets[key].qty           || 0) + (it.qty           || 0);
        bulkBuckets[key].encumbranceSt = (bulkBuckets[key].encumbranceSt || 0) + (it.encumbranceSt || 0);
        merged = true;
      }
    } else if(itemHasFacet(it, 'gear') && !it.notableItemId && !itemHasFacet(it, 'magical') && !itemHasFacet(it, 'valuable') && it.name){
      const key = it.name;
      if(!gearBuckets[key]){ gearBuckets[key] = it; out.push(it); }
      else {
        gearBuckets[key].qty           = (gearBuckets[key].qty           || 0) + (it.qty           || 0);
        gearBuckets[key].encumbranceSt = (gearBuckets[key].encumbranceSt || 0) + (it.encumbranceSt || 0);
        merged = true;
      }
    } else {
      // Notable/magical, valuable, unnamed — passthrough, never merge
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
// Items I1 (OQ9 resolved 2026-06-03) — item facets + valuation + promotion.
// Composition over hierarchy (Architecture.md §2.2 + §3.7; DF_Study_2 §3.5): a
// stash/carry line carries facets[] not a coin|bulk|item subtype. These accessors
// are facet-canonical but fall back to the retired kind/magicItemId shape so an
// un-migrated line still reads correctly (DF "resilient accessor" — a missed
// migration stays harmless).
// =============================================================================

// ACKS II coin exchange, gp-equivalent. 1 pp = 5 gp; 1 gp = 10 sp = 100 cp;
// 1 ep = 5 sp = 0.5 gp. (RR Money; gp/sp/cp ratio per Phase_2.95_Stash_Plan.md §5.2.)
const COIN_GP_VALUE = { cp: 0.01, sp: 0.1, ep: 0.5, gp: 1, pp: 5 };

function itemFacets(item){
  if(!item) return [];
  if(Array.isArray(item.facets) && item.facets.length) return item.facets;
  // Legacy fallback — derive from the retired `kind` discriminator.
  const k = item.kind;
  let f;
  if(k === 'coin') f = ['coin'];
  else if(k === 'bulk') f = ['bulk'];
  else if(k === 'valuable') f = ['valuable'];
  else f = ['gear'];
  if(item.magicItemId || item.notableItemId) f = f.concat('magical');
  return f;
}
function itemHasFacet(item, facet){ return itemFacets(item).indexOf(facet) >= 0; }

// Display precedence — the one facet that "names" the line.
const _FACET_PRECEDENCE = ['coin','valuable','readable','magical','container','bulk','gear'];
function primaryFacet(item){
  const f = itemFacets(item);
  for(const p of _FACET_PRECEDENCE){ if(f.indexOf(p) >= 0) return p; }
  return f[0] || 'gear';
}

// Per-line stone weight (derived). Coin: 1,000 coins = 1 stone, any denomination
// (RR p.83). Bulk in stones: weight = qty. Gear: explicit encumbranceSt, default
// 1 stone when unset (Stash plan §12). Valuables/other: explicit or negligible.
function itemEncumbranceSt(item){
  if(!item) return 0;
  if(itemHasFacet(item, 'coin')) return (item.qty || 0) / 1000;
  if(item.encumbranceSt != null) return item.encumbranceSt;
  if(item.stone != null) return parseFloat(item.stone) || 0;   // legacy Phase 2.6 carry-inventory weight
  if(itemHasFacet(item, 'bulk')) return (item.unit === 'stones') ? (item.qty || 0) : 0;
  if(itemHasFacet(item, 'gear')) return 1;
  return 0;
}

// ── Phase 2.5 Provisioning — food/water inventory accessors (RR p.278) ───────
// One daily ration = 1 stone = 2 lb food (1/6 st) + 1 gallon water (5/6 st). Food rides as discrete
// ration items in carry inventory / the camp stash (weight = 1/6 st × daysRemaining, so a half-eaten
// pack weighs less). Water is a metered fluid: the WATER CONTAINER items (waterskin 1/5 day, barrel
// 20 days) set the capacity; the single waterDaysCarried counter on the holder is the contents (no
// per-skin fill state — RAW meters by the daily gallon). See Provisioning §3.3–§3.5 + §5.
const RATION_FOOD_ST_PER_DAY  = 1/6;   // 2 lb food
const RATION_WATER_ST_PER_DAY = 5/6;   // 1 gallon water (only carried when no source — §4.3)

// Day-capacity of a water-container item: explicit field on the line, else the catalog entry's
// waterCapacityDays (by catalogId or matching name). Non-containers → 0.
function waterContainerDaysFor(item){
  if(!item) return 0;
  if(typeof item.waterCapacityDays === 'number') return item.waterCapacityDays;
  const cat = (global.ACKS && global.ACKS.EQUIPMENT_CATALOG) || [];
  const hit = (item.catalogId && cat.find(e => e.id === item.catalogId)) ||
              (item.name && cat.find(e => String(e.name).toLowerCase() === String(item.name).toLowerCase())) || null;
  return (hit && typeof hit.waterCapacityDays === 'number') ? hit.waterCapacityDays : 0;
}
// Total drinking-water capacity (days) of a holder = Σ its container items. Holder = a character
// (.inventory[]) or a stash (.items[]) — e.g. barrels in the party camp stash.
function waterCapacityDays(holder){
  if(!holder) return 0;
  const lines = Array.isArray(holder.inventory) ? holder.inventory
              : Array.isArray(holder.items) ? holder.items : [];
  return lines.reduce((s, it) => s + waterContainerDaysFor(it), 0);
}

// Ration-line helpers. A ration line: { name, catalogId, rationType:'iron'|'standard', daysRemaining,
// stone }. daysRemaining = person-day rations left in the pack (a fresh week-pack = 7); weight derives.
function isRationLine(item){
  return !!(item && (item.rationType === 'iron' || item.rationType === 'standard' ||
    (typeof item.daysRemaining === 'number' && /ration/i.test(item.name || ''))));
}
function rationLineDays(item){ return isRationLine(item) ? Math.max(0, Number(item.daysRemaining) || 0) : 0; }
function makeRationLine(opts){
  opts = opts || {};
  const type = (opts.rationType === 'standard') ? 'standard' : 'iron';
  const days = Math.max(0, Number(opts.daysRemaining != null ? opts.daysRemaining : 7) || 0);
  return {
    name: (type === 'iron') ? 'Rations, Iron (one week)' : 'Rations, Standard (one week)',
    catalogId: (type === 'iron') ? 'rations-iron-week' : 'rations-standard-week',
    rationType: type,
    daysRemaining: days,
    stone: days * RATION_FOOD_ST_PER_DAY,   // food weight only (1/6 st/day); water rides in containers
    notes: opts.notes || ''
  };
}
// Total person-day food rations a holder (character .inventory / stash .items) can draw on.
function rationDaysAvailable(holder){
  if(!holder) return 0;
  const lines = Array.isArray(holder.inventory) ? holder.inventory
              : Array.isArray(holder.items) ? holder.items : [];
  return lines.reduce((s, it) => s + rationLineDays(it), 0);
}

// Per-line gp value (derived). Coin: qty × denomination multiplier. Valuable:
// qty × unitValueGp. Gear/bulk carry no liquid gp value here (sale price is a
// mercantile concern, not stash wealth).
function itemValueGp(item){
  if(!item) return 0;
  if(itemHasFacet(item, 'coin')){
    const mult = COIN_GP_VALUE[item.denomination || 'gp'];
    return (item.qty || 0) * (mult != null ? mult : 1);
  }
  if(itemHasFacet(item, 'valuable')){
    return (item.qty || 0) * (item.unitValueGp || 0);
  }
  return 0;
}

// Stash / carry aggregates (derived; never stored — Stash plan §5.2 / §6.4).
function stashTotalGp(stash){
  if(!stash || !Array.isArray(stash.items)) return 0;
  return stash.items.reduce((s, it) => s + itemValueGp(it), 0);
}
function stashTotalEncumbrance(stash){
  if(!stash || !Array.isArray(stash.items)) return 0;
  return stash.items.reduce((s, it) => s + itemEncumbranceSt(it), 0);
}
function carryTotalEncumbrance(character){
  if(!character) return 0;
  let total = 0;
  if(Array.isArray(character.inventory)) total += character.inventory.reduce((s, it) => s + itemEncumbranceSt(it), 0);
  total += characterCoinWeightSt(character);   // RR p.83 — carried coins weigh
  return total;
}

// =============================================================================
// Character coins — multi-denomination purse (RAW; RR pp.83-84). coins.gp is the
// canonical gp store; character.personalGp is a synced mirror (canonical-setter
// rule #10), kept current by reconcileCharacterCoins (load-time migration + after
// any gm-fiat coins.* edit — see applyEvent_gmFiat). Coin weight derives: 1,000
// coins of ANY denomination = 1 stone. gp-equivalent uses COIN_GP_VALUE
// (cp .01 / sp .1 / ep .5 / gp 1 / pp 5).
// =============================================================================
const COIN_DENOMINATIONS = ['pp', 'gp', 'ep', 'sp', 'cp'];   // display order, high → low
function normalizeCoins(coins, personalGpFallback){
  const c = (coins && typeof coins === 'object') ? coins : null;
  return {
    pp: c ? (Number(c.pp) || 0) : 0,
    gp: c ? (Number(c.gp) || 0) : (Number(personalGpFallback) || 0),
    ep: c ? (Number(c.ep) || 0) : 0,
    sp: c ? (Number(c.sp) || 0) : 0,
    cp: c ? (Number(c.cp) || 0) : 0
  };
}
function characterCoinCount(character){
  if(!character || !character.coins) return 0;
  return COIN_DENOMINATIONS.reduce((s, d) => s + (Number(character.coins[d]) || 0), 0);
}
function characterCoinValueGp(character){
  if(!character || !character.coins) return 0;
  return COIN_DENOMINATIONS.reduce((s, d) => s + (Number(character.coins[d]) || 0) * COIN_GP_VALUE[d], 0);
}
function characterCoinWeightSt(character){
  return characterCoinCount(character) / 1000;   // RR p.83 — 1,000 coins = 1 stone
}
// Idempotent reconcile: ensure character.coins exists (folding a legacy personalGp
// scalar into coins.gp the first time it's seen), then refresh the personalGp mirror
// from the canonical coins.gp. Returns true iff it created the coins object.
function reconcileCharacterCoins(character){
  if(!character || typeof character !== 'object') return false;
  let created = false;
  if(!character.coins || typeof character.coins !== 'object'){
    character.coins = normalizeCoins(null, character.personalGp);
    created = true;
  }
  character.personalGp = Number(character.coins.gp) || 0;
  return created;
}
function migrateAllCharacterCoins(campaign){
  if(!campaign || !Array.isArray(campaign.characters)) return 0;
  let n = 0;
  for(const c of campaign.characters){ if(reconcileCharacterCoins(c)) n++; }
  return n;
}

// Promotion: a fungible/gear line → tracked NotableItem (§3.7; wanderer→lair).
// Creates a campaign.notableItems[] entry, points the line at it (notableItemId),
// and tags the line with the magical/readable facet. Idempotent: a line that
// already points at a notable returns that notable unchanged. Located-by-line —
// no separate itemCustody record is created (the line's container IS the custody;
// itemCustody is for UN-stashed notables: hoards, merchant stock — §3.7).
function promoteLineToNotableItem(campaign, line, opts){
  if(!campaign || !line) return null;
  if(line.notableItemId) return findNotableItem(campaign, line.notableItemId);
  const blankNotableItem = (global.ACKS && global.ACKS.blankNotableItem) || null;
  if(!blankNotableItem) return null;
  opts = opts || {};
  if(!Array.isArray(campaign.notableItems)) campaign.notableItems = [];
  const ni = blankNotableItem({
    kind: opts.kind || 'masterwork',
    name: opts.name || line.name || '',
    baseCatalogKey: opts.baseCatalogKey || null,
    intrinsic: opts.intrinsic || {},
    history: opts.history || []
  });
  campaign.notableItems.push(ni);
  line.notableItemId = ni.id;
  const facet = opts.facet || (ni.kind === 'book' ? 'readable' : 'magical');
  if(Array.isArray(line.facets) && line.facets.indexOf(facet) < 0) line.facets.push(facet);
  return ni;
}

// Derived facet view of a NotableItem — uniform vocabulary with stash lines, so a
// promoted item reads under the same facet model. NotableItem stored shape is NOT
// restructured here (its intrinsic/provenance/identification stay as §3.7); this is
// the bridge accessor.
function notableItemFacets(ni){
  if(!ni) return [];
  const k = ni.kind;
  if(k === 'book') return ['readable'];
  if(k === 'potion' || k === 'scroll') return ['consumable','magical'];
  if(k === 'regalia' || k === 'relic' || k === 'masterwork') return ['gear','valuable'];
  return ['gear','magical'];  // weapons / armor / wands / rods / staves / misc-magic
}

// Migration: legacy {kind, magicItemId, label} stash/carry line → facet shape.
// Idempotent — a line already carrying facets[] (and no legacy keys) is a no-op.
// Non-object entries (free-text inventory strings) are skipped untouched (the
// free-text→typed upgrade is Stash plan §8.3, a separate concern).
function migrateStashItemShape(item){
  if(!item || typeof item !== 'object') return false;
  const hasFacets = Array.isArray(item.facets) && item.facets.length;
  const hasLegacy = ('kind' in item) || ('magicItemId' in item) || ('label' in item);
  // Only migrate genuine stash-item lines (a legacy kind/magicItemId/label present).
  // Already-facet lines AND the Phase 2.6 carry-inventory {name,qty,stone,gp} shape
  // (neither facets nor a legacy stash discriminator) are left untouched — the full
  // carry-inventory→facet unification is Stash plan §8.3, deferred. itemEncumbranceSt
  // reads the legacy `stone` field so encumbrance is correct over both shapes.
  if(!hasLegacy) return false;
  if(!hasFacets){
    const k = item.kind;
    if(k === 'coin') item.facets = ['coin'];
    else if(k === 'bulk') item.facets = ['bulk'];
    else if(k === 'valuable') item.facets = ['valuable'];
    else item.facets = ['gear'];
  }
  if('magicItemId' in item){
    if(item.magicItemId && !item.notableItemId) item.notableItemId = item.magicItemId;
    delete item.magicItemId;
  }
  if(item.notableItemId && item.facets.indexOf('magical') < 0 && item.facets.indexOf('readable') < 0){
    item.facets.push('magical');
  }
  if('label' in item){
    if(item.label && !item.name) item.name = item.label;
    delete item.label;
  }
  // Ensure the superset fields exist (stable Inspector schema + accessors).
  if(!('name' in item)) item.name = '';
  if(!('denomination' in item)) item.denomination = item.facets.indexOf('coin') >= 0 ? 'gp' : null;
  if(!('valuableType' in item)) item.valuableType = null;
  if(!('valuableTier' in item)) item.valuableTier = null;
  if(!('unitValueGp' in item)) item.unitValueGp = null;
  if(!('encumbranceSt' in item)) item.encumbranceSt = null;
  if(!('unit' in item)) item.unit = (item.facets.indexOf('bulk') >= 0 ? 'stones' : null);
  if(!('notableItemId' in item)) item.notableItemId = null;
  if(!('containerStashId' in item)) item.containerStashId = null;
  if(!('notes' in item)) item.notes = '';
  delete item.kind;
  return true;
}

// Sweep every stash + every character carry inventory. Idempotent. Hooked into
// migrateCampaign before reconcileAllStashes so reconcile reads facet-shaped lines.
function migrateAllStashItemShapes(campaign){
  if(!campaign) return 0;
  let n = 0;
  for(const st of (campaign.stashes || [])){
    for(const it of (st && Array.isArray(st.items) ? st.items : [])){
      if(migrateStashItemShape(it)) n++;
    }
  }
  for(const ch of (campaign.characters || [])){
    for(const it of (ch && Array.isArray(ch.inventory) ? ch.inventory : [])){
      if(migrateStashItemShape(it)) n++;
    }
  }
  return n;
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
// Phase 3 Military W1 (2026-06-12) — Units & Armies.
// Unit is the Group's military sibling kind (campaign.units[]; Architecture §2.4 —
// soldiers never leak into the monster-band machinery that iterates campaign.groups[]).
// Both kinds meet the battle layer through the SAME derived interface: a Unit's BR
// reads TROOP_CATALOG (RR pp.438–444); a Group's BR reads the MONSTER_CATALOG's
// per-creature battleRating (the JJ pp.104–106 platoon organization consumes it at W2).
// Armies embed their divisions (no independent lifetime — Architecture §3.1).
// The legacy nested homes (domain.garrison.units[] / character.mercenaryCompany.units[])
// stay as REFERENCE-UNIFIED MIRRORS of campaign.units[] (the hexes precedent, §3.3):
// the lift migration extends each nested unit in place and shares the object, so the
// economy + UI readers are untouched while military reads go through the collection.
// =============================================================================

function findUnit(campaign, unitId){
  if(!campaign || !Array.isArray(campaign.units)) return null;
  return campaign.units.find(u => u && u.id === unitId) || null;
}

function findArmy(campaign, armyId){
  if(!campaign || !Array.isArray(campaign.armies)) return null;
  return campaign.armies.find(a => a && a.id === armyId) || null;
}

// All units assigned to a station — {kind: 'domain-garrison'|'character'|'army'|'hex'|'constructible', id}.
function unitsStationedAt(campaign, stationedAt){
  if(!campaign || !Array.isArray(campaign.units) || !stationedAt) return [];
  return campaign.units.filter(u => u && u.stationedAt &&
    u.stationedAt.kind === stationedAt.kind && u.stationedAt.id === stationedAt.id);
}

function armiesAtHex(campaign, hexId){
  if(!campaign || !Array.isArray(campaign.armies)) return [];
  return campaign.armies.filter(a => a && a.currentHexId === hexId);
}

// Active soldier count = count − casualties (the Group shape).
function unitActiveCount(unit){
  if(!unit) return 0;
  return Math.max(0, (unit.count || 0) - (unit.casualties || 0));
}

// The army's units (stationedAt = the army). Division membership (division.unitIds) is the
// army's INTERNAL org chart; stationedAt is the unit's assignment truth — validateArmyOrganization
// flags disagreements between the two rather than auto-mutating either.
function armyUnits(campaign, army){
  if(!army) return [];
  return unitsStationedAt(campaign, { kind: 'army', id: army.id });
}

function armyDivisionForUnit(army, unitId){
  if(!army || !Array.isArray(army.divisions)) return null;
  return army.divisions.find(dv => dv && Array.isArray(dv.unitIds) && dv.unitIds.includes(unitId)) || null;
}

// ─── Catalog-derived unit reads (derive-don't-store; stored per-soldier wage/BR are
//     GM overrides that win over the catalog — the legacy garrison-unit fields) ───

// Resolve the unit's TROOP_CATALOG row (null when the race doesn't field the type
// or the type is unknown — e.g. a fully hand-authored unit).
function unitTroopRow(unit){
  if(!unit || !global.ACKS || typeof global.ACKS.findTroopType !== 'function') return null;
  return global.ACKS.findTroopType(unit.unitTypeKey, {
    race: unit.race || 'man', veteran: !!unit.veteran, loadout: unit.loadout || null
  });
}

// A single unit's daily march in miles (RR p.448 — the printed unit daily move, else
// exploration ft/5, else 24 🔧). Mirrors armyMarchProfile's per-unit read so a lone
// detachment rallying to a muster point travels at its own troop type's pace.
function unitMarchMilesPerDay(unit){
  const row = unitTroopRow(unit);
  return (row && typeof row.unitDailyMoveMiles === 'number' && row.unitDailyMoveMiles > 0) ? row.unitDailyMoveMiles
       : (row && typeof row.moveFt === 'number' && row.moveFt > 0) ? row.moveFt / 5
       : 24;
}

// Where a unit physically is, as a hex id (for plotting a rally march). A garrison unit
// sits at its domain's seat (🔧 v1: the domain's first authored hex — the muster default's
// twin); a company unit is with its patron; a hex/army station resolves directly. null
// when unresolvable (no hexes authored / dangling station). Pure read.
function unitCurrentHexId(campaign, unit){
  const st = unit && unit.stationedAt;
  if(!campaign || !st) return null;
  if(st.kind === 'hex') return st.id;
  if(st.kind === 'army'){ const a = findArmy(campaign, st.id); return a ? (a.currentHexId || null) : null; }
  if(st.kind === 'character'){ const c = _findCharacterById(campaign, st.id); return c ? (c.currentHexId || null) : null; }
  if(st.kind === 'domain-garrison'){
    const d = (campaign.domains || []).find(x => x && x.id === st.id);
    if(!d) return null;
    const seat = (campaign.hexes || []).find(h => h && h.domainId === d.id);
    return seat ? seat.id : null;
  }
  return null;
}

// Round to the printed unit-BR grain (nearest 0.5 — RR pp.442–444).
function _roundHalfBr(x){ return Math.round(x * 2) / 2; }

// RR p.462 — a unit's battle rating. A stored brPerSoldier (>0, the GM-override /
// legacy garrison field) wins; else the catalog row: full-strength standard units use
// the PRINTED unit BR (a few veteran rows differ from per-creature × size by design,
// RR p.443 designer's note), understrength/over scale per-creature × active count.
function unitBattleRating(campaign, unit){
  const active = unitActiveCount(unit);
  if(!active) return 0;
  const stored = (typeof unit.brPerSoldier === 'number' && unit.brPerSoldier > 0) ? unit.brPerSoldier : null;
  if(stored != null) return _roundHalfBr(stored * active);
  const row = unitTroopRow(unit);
  if(!row) return 0;
  if(active === row.unitSize && row.unitBattleRating != null) return row.unitBattleRating;
  return _roundHalfBr(row.brPerCreature * active);
}

// The Group side of the shared battle interface: per-creature battleRating from the
// MONSTER_CATALOG (MM stat blocks) × active count. This is how a monster band, an E10
// banditry band, or a lair's defenders price into the JJ pp.104–106 mass-combat layer —
// no promotion to Unit needed.
function groupBattleRating(campaign, group){
  const active = groupActiveCount(group);
  if(!active) return 0;
  const key = group && group.groupTemplate && group.groupTemplate.monsterCatalogKey;
  const m = key && global.ACKS && typeof global.ACKS.findMonster === 'function' ? global.ACKS.findMonster(key) : null;
  if(!m || typeof m.battleRating !== 'number') return 0;
  return _roundHalfBr(m.battleRating * active);
}

// Per-soldier monthly wage: stored monthlyWage (>0) wins, else the catalog row's wage.
// Elite troops (RR p.434, behind the `elite-troops` rule): +1gp per full 6gp of regular
// wage, minimum +3gp. 🔧 "per every 6gp" read as floor(wage/6).
function unitWagePerSoldier(campaign, unit){
  if(!unit) return 0;
  const stored = (typeof unit.monthlyWage === 'number' && unit.monthlyWage > 0) ? unit.monthlyWage : null;
  const row = stored == null ? unitTroopRow(unit) : null;
  let wage = stored != null ? stored : (row ? row.wageGpMonth : 0);
  if(unit.elite && isHouseRuleEnabled(campaign, 'elite-troops')){
    wage += Math.max(3, Math.floor(wage / 6));
  }
  return wage;
}

// Monthly wage bill: active soldiers × per-soldier wage (dead mercenaries collect no wages).
function unitWageMonthly(campaign, unit){
  return unitActiveCount(unit) * unitWagePerSoldier(campaign, unit);
}

// RR p.450 — weekly supply cost for the unit at its scale. The catalog row carries the
// PRINTED company-scale weekly cost (carnivore-correct, e.g. wolf riders 480gp); other
// scales multiply by the RR p.437 scale factor. Rowless units fall back to the generic
// scale table by category. Supply is per unit regardless of understrength (RAW).
function unitWeeklySupplyCost(campaign, unit){
  if(!unit || !global.ACKS) return 0;
  const scaleRowFn = global.ACKS.scaleRow, costFn = global.ACKS.unitScaleSupplyCost;
  const sc = (typeof scaleRowFn === 'function') ? scaleRowFn(unit.scale || 'company') : null;
  const mult = sc && sc.multiplier ? sc.multiplier : 1;
  const row = unitTroopRow(unit);
  if(row && row.unitSupplyWeekly != null) return row.unitSupplyWeekly * mult;
  const category = (row && row.category) || (unit.category) || 'infantry';
  const base = (typeof costFn === 'function') ? costFn(category === 'infantry' ? 'infantry' : 'cavalry', unit.scale || 'company') : null;
  return base != null ? base : 0;
}

// Unit morale score: the catalog row's morale (veteran rows carry the veteran value;
// a veteran flag without a veteran row adds the RR p.430 +1), plus the stored
// moraleAdjustment (the one-time levy ±1 from domain morale, GM tweaks).
function unitMoraleScore(campaign, unit){
  if(!unit) return 0;
  let base = null;
  const row = unitTroopRow(unit);
  if(row && typeof row.morale === 'number'){
    base = row.morale;
  } else if(global.ACKS && typeof global.ACKS.mercMorale === 'function'){
    const m = global.ACKS.mercMorale(unit.unitTypeKey, unit.race || 'man');
    if(typeof m === 'number') base = m;
    if(base != null && unit.veteran) base += 1;   // no veteran row resolved — apply the RAW +1
  }
  if(base == null) base = 0;
  return base + (unit.moraleAdjustment || 0);
}

// ─── Officer characteristics (RR pp.435–437 + p.171) — pure derived reads on Character.
//     A character with numeric abilities uses the PC/NPC formulas; one without (a monster
//     leader) uses the monster formulas off its hitDice. ───

function _hdLead(hd){ const m = String(hd == null ? '' : hd).match(/-?\d+/); return m ? +m[0] : 0; }
function _isMonsterOfficer(c){ return !(c && c.abilities && typeof c.abilities.CHA === 'number'); }

// Sum of proficiency ranks for a named proficiency. An entry's rank = its trailing
// number ("Military Strategy 2" = 2 ranks) or 1; repeated entries sum (the E5
// tracking-ranks convention — count entries — generalized for the officer table's
// single-entry-with-rank style).
function proficiencyRanks(character, name){
  if(!character || !Array.isArray(character.proficiencies) || !name) return 0;
  const want = String(name).toLowerCase();
  let ranks = 0;
  for(const p of character.proficiencies){
    const s = (typeof p === 'string' ? p : (p && p.name) || '').trim().toLowerCase();
    if(!s.startsWith(want)) continue;
    const rest = s.slice(want.length).trim();
    if(rest && !/^\d+$/.test(rest)) continue;       // "Command" must not match "Commanding Presence"
    ranks += rest ? +rest : 1;
  }
  return ranks;
}
function hasProficiencyNamed(character, name){ return proficiencyRanks(character, name) >= 1; }

// RR p.435 — leadership ability: units controllable at once / divisions per army.
// Character: 4 + CHA mod (+1 Leadership proficiency; −1 using an adjutant), max 8.
// Monster: 3 + HD/4 (rounded down), max 8.
function leadershipAbility(character, opts){
  const o = opts || {};
  let la;
  if(_isMonsterOfficer(character)){
    la = 3 + Math.floor(_hdLead(character && character.hitDice) / 4);
  } else {
    la = 4 + abilityMod(character.abilities.CHA)
       + (hasProficiencyNamed(character, 'Leadership') ? 1 : 0)
       - (o.usingAdjutant ? 1 : 0);
  }
  return Math.min(8, la);
}

// RR p.436 — strategic ability: better-of(INT, WIL) bonus (min 0) + worse-of penalty
// (max 0) + Military Strategy ranks; clamped [−3, +6]. Monster: HD/5 (rounded down)
// ± intelligence tier (opts.monsterIntelligence: 'sub' −1 | 'high' +1 | 'super' +2).
function strategicAbility(character, opts){
  const o = opts || {};
  let sa;
  if(_isMonsterOfficer(character)){
    sa = Math.floor(_hdLead(character && character.hitDice) / 5);
    if(o.monsterIntelligence === 'sub') sa -= 1;
    if(o.monsterIntelligence === 'high') sa += 1;
    if(o.monsterIntelligence === 'super') sa += 2;
  } else {
    const intMod = abilityMod(character.abilities.INT || 10);
    const wilMod = abilityMod(character.abilities.WIL || 10);
    sa = Math.max(0, Math.max(intMod, wilMod)) + Math.min(0, Math.min(intMod, wilMod))
       + proficiencyRanks(character, 'Military Strategy');
  }
  return clamp(sa, -3, 6);
}

// RR p.436 — a commander with an adjutant may use the adjutant's SA − 1 in place of
// his own. Returns the better arrangement: { value, usingAdjutant } (using the adjutant
// costs −1 morale modifier — officerMoraleModifier reads the flag).
function effectiveStrategicAbility(commander, adjutant, opts){
  const own = strategicAbility(commander, opts);
  if(!adjutant) return { value: own, usingAdjutant: false };
  const loan = strategicAbility(adjutant, opts) - 1;
  return loan > own ? { value: loan, usingAdjutant: true } : { value: own, usingAdjutant: false };
}

// RR p.436 — morale modifier (Unit Morale rolls, NOT Unit Loyalty): CHA mod
// (+1 battlefield prowess — 5th+ barbarian/bard/explorer/fighter/paladin or the class
// power; +2 Command proficiency; −1 using an adjutant). Monster: 0 unless the MM grants
// an "as long as X is alive" bonus (opts.monsterMoraleBonus).
function officerMoraleModifier(character, opts){
  const o = opts || {};
  if(_isMonsterOfficer(character)){
    return (typeof o.monsterMoraleBonus === 'number' ? o.monsterMoraleBonus : 0) - (o.usingAdjutant ? 1 : 0);
  }
  const cls = String(character.class || '').toLowerCase();
  const prowessClass = /barbarian|bard|explorer|fighter|paladin/.test(cls);
  const prowessPower = Array.isArray(character.classPowers) &&
    character.classPowers.some(p => /battlefield prowess/i.test(typeof p === 'string' ? p : (p && p.name) || ''));
  return abilityMod(character.abilities.CHA)
    + (((prowessClass && (character.level || 0) >= 5) || prowessPower) ? 1 : 0)
    + (hasProficiencyNamed(character, 'Command') ? 2 : 0)
    - (o.usingAdjutant ? 1 : 0);
}

// RR p.437 — scale-dependent officer qualification. Characters check level against the
// Army Organization and Size table; monsters need HD ≥ the commanded unit's average HD
// + the scale threshold (pass opts.unitAvgHd; without it a monster check returns null =
// "Judge decides"). Beastman chieftain/sub-chieftain waivers stay a GM call (RR p.437).
function qualifiesAsOfficer(character, role, scale, opts){
  const o = opts || {};
  const sc = (global.ACKS && typeof global.ACKS.scaleRow === 'function') ? global.ACKS.scaleRow(scale || 'company') : null;
  if(!sc) return null;
  const qual = role === 'lieutenant' ? sc.lieutenantQual : sc.commanderQual;
  if(_isMonsterOfficer(character)){
    if(typeof o.unitAvgHd !== 'number') return null;
    return _hdLead(character && character.hitDice) >= o.unitAvgHd + (qual.monsterHdOver || 0);
  }
  return (character.level || 0) >= (qual.npcLevel || 0);
}
function qualifiesAsCommander(character, scale, opts){ return qualifiesAsOfficer(character, 'commander', scale, opts); }
function qualifiesAsLieutenant(character, scale, opts){ return qualifiesAsOfficer(character, 'lieutenant', scale, opts); }

// ─── Army derived reads ───

function _findCharacterById(campaign, characterId){
  if(!campaign || !Array.isArray(campaign.characters) || !characterId) return null;
  return campaign.characters.find(c => c && c.id === characterId) || null;
}

// RR pp.462–463 — army BR: Σ unit BRs, rounded down; the leader's strategic ability
// adds +0.5 per unit at SA ≥ +3 and +1.0 per unit at SA ≥ +5.
function armyBattleRating(campaign, army){
  const units = armyUnits(campaign, army);
  let br = units.reduce((s, u) => s + unitBattleRating(campaign, u), 0);
  const leader = army && army.leaderCharacterId ? _findCharacterById(campaign, army.leaderCharacterId) : null;
  if(leader){
    const sa = strategicAbility(leader);
    if(sa >= 5) br += units.length * 1.0;
    else if(sa >= 3) br += units.length * 0.5;
  }
  return Math.floor(br);
}

function armyWageMonthly(campaign, army){
  return armyUnits(campaign, army).reduce((s, u) => s + unitWageMonthly(campaign, u), 0);
}

function armyWeeklySupplyCost(campaign, army){
  return armyUnits(campaign, army).reduce((s, u) => s + unitWeeklySupplyCost(campaign, u), 0);
}

// RR p.435 — max divisions = the leader's leadership ability.
function armyMaxDivisions(campaign, army){
  const leader = army && army.leaderCharacterId ? _findCharacterById(campaign, army.leaderCharacterId) : null;
  return leader ? leadershipAbility(leader) : 0;
}

// Pure organization diagnostic (RR pp.434–437; engine-enforced findings, GM-overridable
// per RAW's waiver clause — a validation surface, never an auto-mutation).
function validateArmyOrganization(campaign, army){
  const findings = [];
  if(!army) return findings;
  const units = armyUnits(campaign, army);
  const leader = army.leaderCharacterId ? _findCharacterById(campaign, army.leaderCharacterId) : null;
  if(!leader) findings.push({ code: 'no-leader', text: 'Army has no leader' });
  if(units.length < 3) findings.push({ code: 'under-3-units', text: 'An army must have at least 3 units (RR p.435) — has ' + units.length });
  const divisions = Array.isArray(army.divisions) ? army.divisions : [];
  if(leader && divisions.length > leadershipAbility(leader)){
    findings.push({ code: 'too-many-divisions', text: divisions.length + ' divisions exceed the leader\'s leadership ability ' + leadershipAbility(leader) + ' (RR p.435)' });
  }
  const totalTroops = units.reduce((s, u) => s + unitActiveCount(u), 0);
  const scale = (global.ACKS && global.ACKS.armyScaleForSize) ? global.ACKS.armyScaleForSize(totalTroops) : 'company';
  const seenUnitIds = new Set();
  for(const dv of divisions){
    if(!dv) continue;
    const dvUnits = Array.isArray(dv.unitIds) ? dv.unitIds : [];
    for(const uid of dvUnits){
      if(seenUnitIds.has(uid)) findings.push({ code: 'unit-in-two-divisions', text: 'Unit ' + uid + ' appears in more than one division' });
      seenUnitIds.add(uid);
      const u = findUnit(campaign, uid);
      if(!u) findings.push({ code: 'division-unknown-unit', text: (dv.name || 'Division') + ' lists unknown unit ' + uid });
      else if(!u.stationedAt || u.stationedAt.kind !== 'army' || u.stationedAt.id !== army.id){
        findings.push({ code: 'division-unit-not-stationed', text: (u.displayName || uid) + ' is in ' + (dv.name || 'a division') + ' but not stationed to this army' });
      }
    }
    const cmdr = dv.commanderCharacterId ? _findCharacterById(campaign, dv.commanderCharacterId) : null;
    if(!cmdr) findings.push({ code: 'division-no-commander', text: (dv.name || 'Division') + ' has no commander (RR p.435)' });
    else {
      const q = qualifiesAsCommander(cmdr, scale);
      if(q === false) findings.push({ code: 'commander-unqualified', text: (cmdr.name || 'Commander') + ' does not qualify to command at ' + scale + ' scale (RR p.437)' });
      if(dvUnits.length > leadershipAbility(cmdr, { usingAdjutant: !!dv.adjutantCharacterId })){
        findings.push({ code: 'commander-over-leadership', text: (dv.name || 'Division') + ' has ' + dvUnits.length + ' units, over ' + (cmdr.name || 'the commander') + '\'s leadership ability (RR p.435)' });
      }
    }
  }
  for(const u of units){
    if(!seenUnitIds.has(u.id)) findings.push({ code: 'unit-no-division', text: (u.displayName || u.id) + ' is stationed to the army but assigned to no division' });
  }
  return findings;
}

// ─── Phase 3 Military W2 — the Vagaries of Incursion derived reads (JJ pp.100–106) ───
// All derive-don't-store (§3.13): territory, borders, classification demotion, the daily
// chance, and the platoon-scale BR comparison are pure reads over the campaign; the only
// stored state W2 adds is d.dangerousBordersOverride (the GM's judgment lever),
// d.incursionXenophobiaPending (the JJ p.103 one-shot −1) and group.incursion (the
// materialized band's verdict bundle).

// How many 6-mile hexes the domain holds: authored hexes are the truth when the map
// carries any; legacy aggregate domains fall back to geography.controlledHexes.
function domainTerritoryHexCount(campaign, d){
  if(!d) return 1;
  const authored = ((campaign && campaign.hexes) || []).filter(h => h && h.domainId === d.id).length;
  if(authored > 0) return authored;
  return Math.max(1, (d.geography && d.geography.controlledHexes) || 1);
}

// JJ p.102 — is the domain's border dangerous, and in which configuration? RAW frames
// this as a judgment from the regional geography; the derivation reads the hex map:
// a border face is SECURE when the neighbour belongs to any domain, is water
// (impassable), or the shared edge carries a river (RAW's own "a domain with a broad
// river … is far easier to defend" — the §24 effect-3 note, closed here); otherwise it
// is dangerous (unsettled or unauthored land — a frontier is exposed even where the GM
// hasn't authored the wilds). The dangerous fraction of border faces maps onto RAW's
// four illustrations (🔧 heuristic: 0 → secure · ≤⅓ → line · ≤½ → flank · <1 →
// spearhead · all → isolated); d.dangerousBordersOverride (one of
// BORDER_CONFIGURATIONS) outranks the heuristic, exactly as printed. A mapless domain
// derives 'secure' (no inflation without geography).
function domainBorderConfiguration(campaign, d){
  const A = global.ACKS || {};
  const out = { configuration: 'secure', source: 'derived', dangerousFaces: 0, borderFaces: 0 };
  if(!d) return out;
  const hexes = ((campaign && campaign.hexes) || []).filter(h => h && h.domainId === d.id && h.coord);
  if(hexes.length){
    const byCoord = new Map();
    for(const h of ((campaign && campaign.hexes) || [])){ if(h && h.coord) byCoord.set(h.coord.q + ',' + h.coord.r, h); }
    // HEX_EDGE_DELTAS order (the map convention — riverSides indices key off it)
    const deltas = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
    let dangerous = 0, total = 0;
    for(const h of hexes){
      for(let side = 0; side < 6; side++){
        const n = byCoord.get((h.coord.q + deltas[side][0]) + ',' + (h.coord.r + deltas[side][1])) || null;
        if(n && n.domainId === d.id) continue;                 // internal face
        total++;
        let secure = false;
        if(n && n.domainId) secure = true;                     // a neighbouring domain holds it
        else if(n){
          const base = (typeof A.terrainBase === 'function') ? A.terrainBase(n.terrain) : n.terrain;
          if(base === 'water') secure = true;                  // impassable terrain
        }
        const opp = (side + 3) % 6;
        if(!secure && Array.isArray(h.riverSides) && h.riverSides.indexOf(side) >= 0) secure = true;
        if(!secure && n && Array.isArray(n.riverSides) && n.riverSides.indexOf(opp) >= 0) secure = true;
        if(!secure) dangerous++;
      }
    }
    out.borderFaces = total; out.dangerousFaces = dangerous;
    if(total > 0 && dangerous > 0){
      const f = dangerous / total;
      out.configuration = (dangerous >= total) ? 'isolated'
        : (f > 0.5)   ? 'spearhead'
        : (f > 1 / 3) ? 'flank'
        : 'line';
    }
  }
  const override = d.dangerousBordersOverride;
  const cfgList = (A.BORDER_CONFIGURATIONS || ['secure', 'line', 'flank', 'spearhead', 'isolated']);
  if(override && cfgList.indexOf(String(override).toLowerCase()) >= 0){
    out.configuration = String(override).toLowerCase();
    out.source = 'override';
  }
  return out;
}

// JJ p.102 — actual territory + border configuration → the effective territory size
// the encounter throw reads.
function domainEffectiveTerritory(campaign, d){
  const A = global.ACKS || {};
  const actual = domainTerritoryHexCount(campaign, d);
  const cfg = domainBorderConfiguration(campaign, d);
  const effective = (typeof A.effectiveTerritoryWithBorders === 'function')
    ? A.effectiveTerritoryWithBorders(actual, cfg.configuration)
    : actual;
  return { actualHexes: actual, effectiveHexes: effective, configuration: cfg.configuration,
           configurationSource: cfg.source, dangerousFaces: cfg.dangerousFaces, borderFaces: cfg.borderFaces };
}

// JJ p.102 — an insufficient garrison and/or stronghold reads the domain one
// classification worse for domain encounters (civilized → borderlands → outlands →
// unsettled; the printed example demotes a bankrupt outlands domain to unsettled).
// Garrison sufficiency uses the same effective spend the morale adequacy sees
// (garrisonCost + scutage paid this month, RR p.347); stronghold sufficiency is value
// vs the RR p.349 per-hex requirement.
function domainIncursionClassification(campaign, d){
  const A = global.ACKS || {};
  const base = String(effectiveDomainClassification(d) || 'Outlands').toLowerCase();
  const garrSpend = ((typeof A.garrisonCost === 'function') ? A.garrisonCost(d) : 0)
    + ((typeof A.scutagePaidThisMonth === 'function') ? A.scutagePaidThisMonth(campaign, d) : 0);
  const garrReq = (typeof A.requiredGarrison === 'function') ? A.requiredGarrison(campaign, d) : 0;
  const insufficientGarrison = garrReq > 0 && garrSpend < garrReq;
  const shReq = (typeof A.strongholdRequired === 'function') ? A.strongholdRequired(d) : 0;
  const shVal = (typeof A.strongholdValue === 'function') ? A.strongholdValue(campaign, d) : 0;
  const insufficientStronghold = shReq > 0 && shVal < shReq;
  const ladder = ['civilized', 'borderlands', 'outlands', 'unsettled'];
  let idx = ladder.indexOf(base); if(idx < 0) idx = 2;
  const demoted = insufficientGarrison || insufficientStronghold;
  if(demoted) idx = Math.min(ladder.length - 1, idx + 1);
  return { base, effective: ladder[idx], demoted, insufficientGarrison, insufficientStronghold };
}

// The one read the consumer, the UI and the tests share: the domain's daily domain-
// encounter chance (JJ p.101) off its effective territory + effective classification.
function domainDailyEncounterChance(campaign, d){
  const A = global.ACKS || {};
  const terr = domainEffectiveTerritory(campaign, d);
  const cls = domainIncursionClassification(campaign, d);
  const pct = (typeof A.incursionDailyPct === 'function') ? A.incursionDailyPct(terr.effectiveHexes, cls.effective) : 0;
  return Object.assign({ pct }, terr, cls);
}

// ── JJ p.105 — mass combat for domain encounters runs at PLATOON scale ──
// (units of 30 men / 15 large; per-creature BR is ×4 the company values). The garrison
// prices its actual units; a monster band prices off the MONSTER_CATALOG battleRating
// the same way — the shared battle interface (§5.1), no promotion.
function _roundQuarterBr(x){ return Math.round(x * 4) / 4; }   // the printed platoon-BR grain
// One unit's BR at platoon scale. A stored brPerSoldier (the GM override) wins; else the
// PRINTED company unit BR scaled to the active fraction × the ×4 platoon factor — which
// reproduces the JJ p.105 worked example exactly (60 heavy + 30 light foot → garrison
// BR 5.0); rows with no printed unit BR fall back to per-creature × count × 4.
function unitPlatoonScaleBr(unit){
  if(!unit) return 0;
  const active = unitActiveCount(unit);
  if(!active) return 0;
  const stored = (typeof unit.brPerSoldier === 'number' && unit.brPerSoldier > 0) ? unit.brPerSoldier : null;
  if(stored != null) return stored * active * 4;
  const row = unitTroopRow(unit);
  if(!row) return 0;
  if(row.unitBattleRating != null && row.unitSize > 0) return row.unitBattleRating * (active / row.unitSize) * 4;
  return (row.brPerCreature || 0) * active * 4;
}
function domainGarrisonPlatoonBr(campaign, d){
  const units = (d && d.garrison && Array.isArray(d.garrison.units)) ? d.garrison.units : [];
  let br = 0;
  for(const u of units){ if(u) br += unitPlatoonScaleBr(u); }
  return _roundQuarterBr(br);
}
// A band of N creatures at platoon scale; null when the creature carries no catalog BR
// (a label-only identity — the GM prices it).
function monsterPlatoonBr(brPerCreature, count){
  if(!(brPerCreature > 0) || !(count > 0)) return null;
  return _roundQuarterBr(brPerCreature * count * 4);
}

// ─── Canonical stationing setter + the garrison/mercenaryCompany lift (rule #10) ───

// Move a unit to a station, maintaining BOTH homes: campaign.units[] (canonical) and
// the legacy nested mirrors (domain.garrison.units[] / character.mercenaryCompany.units[]
// — reference-unified: the same object, never a copy). Passing stationedAt null leaves
// the unit field-stationed nowhere (e.g. an independent band's captured equipment train).
function stationUnit(campaign, unitOrId, stationedAt){
  const unit = (typeof unitOrId === 'string') ? findUnit(campaign, unitOrId) : unitOrId;
  if(!campaign || !unit) return null;
  if(!Array.isArray(campaign.units)) campaign.units = [];
  const idx = campaign.units.findIndex(u => u && u.id === unit.id);
  if(idx < 0) campaign.units.push(unit);
  else if(campaign.units[idx] !== unit) campaign.units[idx] = unit;
  // drop from every nested mirror that is NOT the target
  for(const d of (campaign.domains || [])){
    const arr = d && d.garrison && d.garrison.units;
    if(!Array.isArray(arr)) continue;
    const keep = stationedAt && stationedAt.kind === 'domain-garrison' && stationedAt.id === d.id;
    const i = arr.findIndex(u => u && u.id === unit.id);
    if(i >= 0 && !keep) arr.splice(i, 1);
  }
  for(const c of (campaign.characters || [])){
    const arr = c && c.mercenaryCompany && c.mercenaryCompany.units;
    if(!Array.isArray(arr)) continue;
    const keep = stationedAt && stationedAt.kind === 'character' && stationedAt.id === c.id;
    const i = arr.findIndex(u => u && u.id === unit.id);
    if(i >= 0 && !keep) arr.splice(i, 1);
  }
  // add to the target mirror (same object reference)
  if(stationedAt && stationedAt.kind === 'domain-garrison'){
    const d = (campaign.domains || []).find(x => x && x.id === stationedAt.id);
    if(d){
      if(!d.garrison) d.garrison = { units: [] };
      if(!Array.isArray(d.garrison.units)) d.garrison.units = [];
      const i = d.garrison.units.findIndex(u => u && u.id === unit.id);
      if(i < 0) d.garrison.units.push(unit);
      else if(d.garrison.units[i] !== unit) d.garrison.units[i] = unit;
    }
  } else if(stationedAt && stationedAt.kind === 'character'){
    const c = (campaign.characters || []).find(x => x && x.id === stationedAt.id);
    if(c){
      if(!c.mercenaryCompany) c.mercenaryCompany = { units: [] };
      if(!Array.isArray(c.mercenaryCompany.units)) c.mercenaryCompany.units = [];
      const i = c.mercenaryCompany.units.findIndex(u => u && u.id === unit.id);
      if(i < 0) c.mercenaryCompany.units.push(unit);
      else if(c.mercenaryCompany.units[i] !== unit) c.mercenaryCompany.units[i] = unit;
    }
  }
  unit.stationedAt = stationedAt || null;
  return unit;
}

// Remove a unit from the world: campaign.units[] + every nested mirror (the merge /
// disband destructor — the counterpart of stationUnit). Returns the removed unit or null.
function disbandUnit(campaign, unitOrId){
  const unit = (typeof unitOrId === 'string') ? findUnit(campaign, unitOrId) : unitOrId;
  if(!campaign || !unit) return null;
  if(Array.isArray(campaign.units)){
    const i = campaign.units.findIndex(u => u && u.id === unit.id);
    if(i >= 0) campaign.units.splice(i, 1);
  }
  for(const d of (campaign.domains || [])){
    const arr = d && d.garrison && d.garrison.units;
    if(!Array.isArray(arr)) continue;
    const i = arr.findIndex(u => u && u.id === unit.id);
    if(i >= 0) arr.splice(i, 1);
  }
  for(const c of (campaign.characters || [])){
    const arr = c && c.mercenaryCompany && c.mercenaryCompany.units;
    if(!Array.isArray(arr)) continue;
    const i = arr.findIndex(u => u && u.id === unit.id);
    if(i >= 0) arr.splice(i, 1);
  }
  return unit;
}

// ─── Phase 3 Military — army muster / disband (the canonical CRUD both verbs route
//     through; the in-fiction Muster modal on a character/domain AND the Inspector
//     Admin-verb Create) ──────────────────────────────────────────────────────────
// Push a blank army to campaign.armies; optionally seat a leader, name it, place it on a
// hex, set its stance, and STATION a starting roster (unitIds → stationUnit to
// {kind:'army', id} — stationUnit handles the garrison/merc-company mirror bookkeeping).
// When a leader + units are given it auto-builds a single "Main Body" division led by the
// commander — the RAW-minimal valid org (RR p.435: a small army is one division led by its
// commander; the GM splits into more divisions later). validateArmyOrganization surfaces
// an under-qualified commander or too-few units as advisory findings (GM-overridable per
// RAW's waiver clause). id-stable (opts.id returns the existing army — the createLair
// idempotency pattern). Stamps an army.history 'mustered' entry. Returns the army.
function createArmy(campaign, opts={}){
  if(!campaign) return null;
  if(!Array.isArray(campaign.armies)) campaign.armies = [];
  if(opts.id){
    const ex = campaign.armies.find(a => a && a.id === opts.id);
    if(ex) return ex;
  }
  const army = global.ACKS.blankArmy({
    id: opts.id,
    name: opts.name || '',
    leaderCharacterId: opts.leaderCharacterId || null,
    currentHexId: opts.currentHexId || null,
    strategicStance: opts.strategicStance || 'defensive'
  });
  campaign.armies.push(army);
  const unitIds = Array.isArray(opts.unitIds) ? opts.unitIds.filter(Boolean) : [];
  const stationed = [];
  for(const uid of unitIds){
    const u = stationUnit(campaign, uid, { kind: 'army', id: army.id });
    if(u) stationed.push(u.id);
  }
  if(army.leaderCharacterId && stationed.length){
    army.divisions = [{ name: 'Main Body', commanderCharacterId: army.leaderCharacterId, adjutantCharacterId: null, unitIds: stationed, role: 'main' }];
  }
  // Distant units called up rather than teleported: each marches to the muster point
  // (callUpUnit plots a rally journey; a co-located one just joins). The army has its
  // hex set above, so the rally march can be plotted.
  const callUp = Array.isArray(opts.callUpUnitIds) ? opts.callUpUnitIds.filter(Boolean) : [];
  let marching = 0;
  for(const uid of callUp){
    const r = callUpUnit(campaign, uid, army);
    if(r && r.action === 'marching') marching++;
    else if(r && r.action === 'joined' && !stationed.includes(uid)) stationed.push(uid);
  }
  const turn = (campaign.currentTurn != null) ? campaign.currentTurn : 0;
  army.history.push({ turn, type: 'mustered', text: 'Mustered' + (opts.name ? ' as ' + opts.name : '') + (stationed.length ? ' with ' + stationed.length + ' unit' + (stationed.length === 1 ? '' : 's') : '') + (marching ? ' (' + marching + ' marching in)' : '') });
  return army;
}

// Disband an army: un-station its units (they SURVIVE in campaign.units, homeless until
// re-stationed — the next muster's available-units list surfaces them, closing the loop),
// stop its march (the journey is marked disbanded), and splice it from campaign.armies.
// Returns the removed army or null. The counterpart of createArmy.
function disbandArmy(campaign, armyOrId){
  const army = (typeof armyOrId === 'string') ? findArmy(campaign, armyOrId) : armyOrId;
  if(!campaign || !army) return null;
  for(const u of armyUnits(campaign, army)){ if(u) u.stationedAt = null; }
  if(army.journeyId && Array.isArray(campaign.journeys)){
    const j = campaign.journeys.find(x => x && x.id === army.journeyId);
    if(j) j.status = 'disbanded';
  }
  if(Array.isArray(campaign.armies)){
    const i = campaign.armies.findIndex(a => a && a.id === army.id);
    if(i >= 0) campaign.armies.splice(i, 1);
  }
  return army;
}

// Call up a unit to an army's muster point (the hard-constraint alternative to teleporting
// troops in). If the unit is already AT the army's hex (or the army/unit has no resolvable
// hex), it joins immediately. Otherwise the unit LEAVES its garrison (un-stationed — the
// troops have marched out) and a rally journey is plotted from its hex to the muster point;
// `unit.rallyingToArmyId` marks it incoming. It is NOT counted in the army's present strength
// until the journey arrives (commitJourneyRecord stations it then). Returns
// {action:'joined'|'marching'|'error', unitId, journeyId?, journey?}.
function callUpUnit(campaign, unitOrId, armyOrId){
  const unit = (typeof unitOrId === 'string') ? findUnit(campaign, unitOrId) : unitOrId;
  const army = (typeof armyOrId === 'string') ? findArmy(campaign, armyOrId) : armyOrId;
  if(!campaign || !unit || !army) return { action: 'error', reason: 'missing' };
  const dest = army.currentHexId || null;
  const origin = unitCurrentHexId(campaign, unit);
  if(!dest || !origin || origin === dest){
    stationUnit(campaign, unit, { kind: 'army', id: army.id });
    unit.rallyingToArmyId = null; unit.rallyJourneyId = null;
    return { action: 'joined', unitId: unit.id };
  }
  const A = global.ACKS;
  stationUnit(campaign, unit, null);   // the troops leave their garrison and take the road
  const name = (unit.displayName || unit.unitTypeKey || 'unit') + ' → ' + (army.name || 'the army');
  const journey = A.blankJourney({ unitId: unit.id, name, startHexId: origin, destinationHexId: dest, participantCharacterIds: [] });
  if(!Array.isArray(campaign.journeys)) campaign.journeys = [];
  campaign.journeys.push(journey);
  if(typeof A.startJourney === 'function') A.startJourney(campaign, journey);
  else journey.status = 'in-transit';
  unit.rallyingToArmyId = army.id; unit.rallyJourneyId = journey.id;
  return { action: 'marching', unitId: unit.id, journeyId: journey.id, journey };
}

// The units MARCHING IN to an army (rallyingToArmyId === army.id) — each with its rally
// journey + the distance still to cover (miles / hexes / days at the unit's own pace). The
// army card's "reinforcements marching in" readout. Pure derived read.
function armyIncomingUnits(campaign, army){
  if(!campaign || !army || !Array.isArray(campaign.units)) return [];
  const A = global.ACKS;
  const milesPerHex = (A && A.JOURNEY_MILES_PER_HEX) || 6;
  return campaign.units.filter(u => u && u.rallyingToArmyId === army.id).map(u => {
    const j = u.rallyJourneyId ? (campaign.journeys || []).find(x => x && x.id === u.rallyJourneyId) : null;
    let hexes = null, miles = null, days = null;
    if(j && A && typeof A.computeJourneyDistance === 'function'){
      const d = A.computeJourneyDistance(campaign, j);
      hexes = Math.max(0, (d.total || 0) - (d.covered || 0));
      miles = hexes * milesPerHex;
      const spd = unitMarchMilesPerDay(u);
      days = (spd > 0) ? Math.ceil(miles / spd) : null;
    }
    return { unit: u, journey: j, hexesRemaining: hexes, milesRemaining: miles, daysRemaining: days, fromHexId: j ? j.startHexId : null };
  });
}

// =============================================================================
// §12 The Group model — the shared interface over the collective-actor kinds
// (Architecture.md §12). Party / Army / Unit / Band are ONE behavioral category — a
// positioned, mobile, fightable, persistent collective — but stay DISTINCT entities;
// these accessors are the shared contract the merged "Parties" view and the Player
// Portal `controllable` read through. Caravan is specced (§12.8) but its entity lands
// with the Ventures-RAW slice, so groupKindOf never returns it yet. The kind is sniffed
// by SIGNATURE (the shapes are disjoint — no new stored field). Cross-module reads
// (armyMarchProfile in maneuvers, journeyBaseSpeedMilesPerDay in subsystems) go through
// global.ACKS lazily, like unitTroopRow → findTroopType.
// =============================================================================

// Discriminate a group entity by signature. Army FIRST (it now also carries
// memberCharacterIds, the party tell), then unit / band / caravan, party last.
function groupKindOf(g){
  if(!g || typeof g !== 'object') return null;
  if(Array.isArray(g.divisions)) return 'army';
  if(g.unitTypeKey != null) return 'unit';
  if(g.groupTemplate != null) return 'band';
  if(g.cargo != null || g.ventureId != null) return 'caravan';   // reserved (§12.8)
  if(Array.isArray(g.memberCharacterIds)) return 'party';
  return null;
}

const GROUP_KIND_META = {
  party:   { icon: '🧭', label: 'Party' },
  army:    { icon: '🎖', label: 'Army' },
  unit:    { icon: '🪖', label: 'Unit' },
  band:    { icon: '🐉', label: 'Band' },
  caravan: { icon: '🐪', label: 'Caravan' }
};
function groupKindMeta(kind){ return GROUP_KIND_META[kind] || { icon: '•', label: 'Group' }; }

function groupDisplayName(g){
  const kind = groupKindOf(g);
  if(kind === 'unit') return g.displayName || g.unitTypeKey || 'Unit';
  if(kind === 'band') return g.name || (g.groupTemplate && g.groupTemplate.monsterCatalogKey) || 'Band';
  return g.name || g.id || '';   // party / army / caravan
}

// The INDIVIDUATED channel — member Characters (full sheets), deduped + order-preserving.
// Party members; army officers (leader + division commanders + adjutants + the roster);
// a unit's commander/lieutenant; a band's commander. This is what the members table renders.
function groupMembers(campaign, g){
  if(!campaign || !g) return [];
  const ids = [];
  const push = id => { if(id && !ids.includes(id)) ids.push(id); };
  const kind = groupKindOf(g);
  if(kind === 'party'){ (g.memberCharacterIds || []).forEach(push); }
  else if(kind === 'army'){
    push(g.leaderCharacterId);
    for(const dv of (g.divisions || [])){ push(dv && dv.commanderCharacterId); push(dv && dv.adjutantCharacterId); }
    (g.memberCharacterIds || []).forEach(push);
  } else if(kind === 'unit'){ push(g.commanderCharacterId); push(g.lieutenantCharacterId); }
  else if(kind === 'band'){ push(g.commanderCharacterId); }
  return ids.map(id => _findCharacterById(campaign, id)).filter(Boolean);
}

function groupLeader(campaign, g){
  if(!campaign || !g) return null;
  const kind = groupKindOf(g);
  const id = (kind === 'unit') ? (g.commanderCharacterId || g.lieutenantCharacterId)
           : (g.leaderCharacterId || g.commanderCharacterId);
  return id ? _findCharacterById(campaign, id) : null;
}

// The COUNTED channel — the formations the group carries: army → its stationed units;
// party → its members' mercenary-company units; an atom (unit/band) → itself.
function groupFormations(campaign, g){
  if(!campaign || !g) return [];
  const kind = groupKindOf(g);
  if(kind === 'army') return armyUnits(campaign, g);
  if(kind === 'unit' || kind === 'band') return [g];
  if(kind === 'party'){
    const out = [];
    for(const id of (g.memberCharacterIds || [])){
      const c = _findCharacterById(campaign, id);
      const arr = c && c.mercenaryCompany && c.mercenaryCompany.units;
      if(Array.isArray(arr)) for(const u of arr) if(u) out.push(u);
    }
    return out;
  }
  return [];
}

// The group's natural size: party → characters + their mercenaries; army → troops;
// unit → soldiers; band → creatures (active = count − casualties throughout).
function groupHeadcount(campaign, g){
  const kind = groupKindOf(g);
  if(kind === 'unit') return unitActiveCount(g);
  if(kind === 'band') return groupActiveCount(g);
  const counted = groupFormations(campaign, g).reduce((s, u) => s + unitActiveCount(u), 0);
  if(kind === 'party') return (g.memberCharacterIds || []).length + counted;
  return counted;   // army (troops) / caravan
}

// Where the group physically is, as a hex id. A nested member resolves to its CONTAINER'S
// position (a stationed unit → its army/garrison hex). Pure read.
function groupPosition(campaign, g){
  if(!campaign || !g) return null;
  const kind = groupKindOf(g);
  if(kind === 'unit') return unitCurrentHexId(campaign, g);
  if(kind === 'army'){
    if(g.currentHexId) return g.currentHexId;
    const u = armyUnits(campaign, g)[0];
    return u ? unitCurrentHexId(campaign, u) : null;
  }
  return g.currentHexId || null;   // party / band / caravan
}

// The group's active journey/march (the journey entity it rides), or null. A band
// wanders via the monster-bands consumer (no journey entity).
function groupJourney(campaign, g){
  if(!campaign || !g || !Array.isArray(campaign.journeys)) return null;
  const kind = groupKindOf(g);
  const jid = (kind === 'party') ? g.activeJourneyId
            : (kind === 'army')  ? g.journeyId
            : (kind === 'unit')  ? g.rallyJourneyId
            : null;
  return jid ? (campaign.journeys.find(j => j && j.id === jid) || null) : null;
}

// Daily movement in miles (best-effort; generalizes the per-kind reads).
function groupSpeed(campaign, g){
  const A = global.ACKS, kind = groupKindOf(g);
  if(kind === 'unit') return unitMarchMilesPerDay(g);
  if(kind === 'army' && A && typeof A.armyMarchProfile === 'function'){
    const p = A.armyMarchProfile(campaign, g); return p ? (p.milesPerDay || null) : null;
  }
  const j = groupJourney(campaign, g);
  if(j && A && typeof A.journeyBaseSpeedMilesPerDay === 'function') return A.journeyBaseSpeedMilesPerDay(campaign, j);
  return null;
}

// The per-day logistics model (a tagged union): party eats rations + drinks water;
// army/unit draw supplies (RR p.450); a band forages.
function groupLogistics(campaign, g){
  const kind = groupKindOf(g);
  if(kind === 'party')   return { model: 'rations-water' };
  if(kind === 'army')    return { model: 'supplies', simplified: g.supplySimplified !== false };
  if(kind === 'unit')    return { model: 'supplies', state: g.supplyState || 'supplied' };
  if(kind === 'band')    return { model: 'forage' };
  if(kind === 'caravan') return { model: 'supplies' };
  return { model: 'none' };
}

// The parent GROUP this one is nested in (the inverse of groupFormations): a unit
// stationed to an army → that army; else null. A lair holds a band but is not a group.
function groupContainer(campaign, g){
  if(!campaign || !g) return null;
  if(groupKindOf(g) === 'unit'){
    const st = g.stationedAt;
    if(st && st.kind === 'army') return findArmy(campaign, st.id);
  }
  return null;
}

// Autonomous = a top-level actor (a row in the merged view), i.e. NOT nested in another
// group. A unit is nested iff stationed to an army; a band iff a lair holds it;
// party/army/caravan are always autonomous (§12.5).
function groupIsAutonomous(campaign, g){
  const kind = groupKindOf(g);
  if(kind === 'unit') return !(g.stationedAt && g.stationedAt.kind === 'army');
  if(kind === 'band'){
    if(campaign && Array.isArray(campaign.lairs))
      return !campaign.lairs.some(l => l && Array.isArray(l.groupIds) && l.groupIds.includes(g.id));
    return true;
  }
  return true;
}

function groupLifecycleState(campaign, g){
  const kind = groupKindOf(g);
  if(kind === 'party') return g.status || 'active';
  if(kind === 'band')  return g.lifecycleState || 'wild';
  if(kind === 'unit')  return g.rallyingToArmyId ? 'rallying' : ((g.stationedAt && g.stationedAt.kind) || 'loose');
  if(kind === 'army')  return g.journeyId ? 'marching' : 'mustered';
  return 'active';
}

// The shared row descriptor for the merged "Parties" view tables. Pure data; the UI
// formats the hex label (hexName) + the link targets.
function groupRow(campaign, g){
  const kind = groupKindOf(g), meta = groupKindMeta(kind), leader = groupLeader(campaign, g);
  const j = groupJourney(campaign, g);
  return {
    kind, id: g.id, icon: meta.icon, kindLabel: meta.label,
    name: groupDisplayName(g),
    leaderName: leader ? (leader.name || '(unnamed)') : null,
    leaderId: leader ? leader.id : null,
    headcount: groupHeadcount(campaign, g),
    memberCount: groupMembers(campaign, g).length,
    hexId: groupPosition(campaign, g),
    onTheMove: !!(j && (j.status === 'in-transit' || j.status === 'resting' || j.status === 'lost')),
    journeyId: j ? j.id : null,
    lifecycle: groupLifecycleState(campaign, g)
  };
}

// The Units table: every unit NOT absorbed into an army (garrison / mercenary-company /
// rallying-in / hex). An army-stationed unit shows only under its army (§12.5).
function looseUnits(campaign){
  if(!campaign || !Array.isArray(campaign.units)) return [];
  return campaign.units.filter(u => u && !(u.stationedAt && u.stationedAt.kind === 'army'));
}

// The cross-kind enumerator: every AUTONOMOUS group in the world, as {kind, entity}
// (parties + armies + loose units; bands/caravans join as the view grows). opts.kinds
// filters; opts.includeNested keeps absorbed units / lair-bound bands.
function worldGroups(campaign, opts={}){
  if(!campaign) return [];
  const want = opts.kinds ? new Set(opts.kinds) : null;
  const out = [];
  const add = (entity) => {
    const kind = groupKindOf(entity);
    if(want && !want.has(kind)) return;
    if(!opts.includeNested && !groupIsAutonomous(campaign, entity)) return;
    out.push({ kind, entity });
  };
  for(const p of (campaign.parties || [])) if(p && p.status !== 'disbanded') add(p);
  for(const a of (campaign.armies || [])) add(a);
  for(const u of (campaign.units || [])) add(u);
  return out;
}

// The group (party / army / unit) that OWNS a journey — the inverse of groupJourney.
// A journey carries exactly one owner discriminator (armyId | unitId | partyId); a lone
// traveller (participantCharacterIds, no group) returns null. Lets the Journey Detail
// panel render group-aware (an army's march shows its units + supplies, not rations).
function groupForJourney(campaign, journeyOrId){
  if(!campaign) return null;
  const j = (typeof journeyOrId === 'string') ? (campaign.journeys || []).find(x => x && x.id === journeyOrId) : journeyOrId;
  if(!j) return null;
  if(j.armyId) return findArmy(campaign, j.armyId);
  if(j.unitId) return findUnit(campaign, j.unitId);
  if(j.partyId) return (campaign.parties || []).find(p => p && p.id === j.partyId) || null;
  return null;
}

// Muster an army FROM an existing party (§12.6 — the party→army transformation). The
// party's members become the army's individuated roster (its leader → the commander),
// each member's mercenary-company units → the army's first units, and the party is
// CONSUMED (its camp handed to the leader, members freed, the party removed). The army
// inherits the party's hex + (an in-transit) journey ends so the army marches anew.
// Returns the army. id-stable via opts.id (the createArmy idempotency pattern).
function musterArmyFromParty(campaign, partyOrId, opts={}){
  if(!campaign) return null;
  const party = (typeof partyOrId === 'string')
    ? (campaign.parties || []).find(p => p && p.id === partyOrId) : partyOrId;
  if(!party) return null;
  const memberIds = (party.memberCharacterIds || []).slice();
  const commanderId = opts.commanderCharacterId || party.leaderCharacterId || memberIds[0] || null;
  const hexId = opts.currentHexId || party.currentHexId || null;
  // the members' mercenary-company units become the army's units
  const unitIds = [];
  for(const id of memberIds){
    const c = _findCharacterById(campaign, id);
    const arr = c && c.mercenaryCompany && c.mercenaryCompany.units;
    if(Array.isArray(arr)) for(const u of arr) if(u && u.id) unitIds.push(u.id);
  }
  const army = createArmy(campaign, {
    id: opts.id,
    name: opts.name || (party.name ? (party.name + ' (army)') : ''),
    leaderCharacterId: commanderId,
    currentHexId: hexId,
    strategicStance: opts.strategicStance || 'defensive',
    unitIds
  });
  if(!army) return null;
  army.memberCharacterIds = memberIds.slice();   // the party's people become the army's roster
  // consume the party: hand its camp to the leader, free the members, remove it
  handOffPartyCampToLeader(campaign, party);
  for(const id of memberIds){ const c = _findCharacterById(campaign, id); if(c && c.partyId === party.id) c.partyId = null; }
  if(party.activeJourneyId && Array.isArray(campaign.journeys)){
    const j = campaign.journeys.find(x => x && x.id === party.activeJourneyId);
    if(j && j.status === 'in-transit') j.status = 'arrived';
  }
  if(Array.isArray(campaign.parties)){
    const i = campaign.parties.findIndex(p => p && p.id === party.id);
    if(i >= 0) campaign.parties.splice(i, 1);
  }
  const turn = (campaign.currentTurn != null) ? campaign.currentTurn : 0;
  army.history.push({ turn, type: 'mustered-from-party', text: 'Mustered from the party ' + (party.name || party.id) });
  return army;
}

// Lazy-default the W1 military fields on a legacy garrison-unit object (additive; never
// clobbers existing values — idempotent).
function _lazyDefaultUnitFields(u){
  if(u.race == null) u.race = 'man';
  if(u.loadout === undefined) u.loadout = null;
  if(u.veteran == null) u.veteran = false;
  if(u.elite == null) u.elite = false;
  if(u.casualties == null) u.casualties = 0;
  if(u.source == null) u.source = 'mercenary';
  if(u.scale == null) u.scale = 'company';
  if(u.trainingState === undefined) u.trainingState = null;
  if(u.lieutenantCharacterId === undefined) u.lieutenantCharacterId = null;
  if(u.loyalty == null) u.loyalty = 0;
  if(u.moraleAdjustment == null) u.moraleAdjustment = 0;
  if(!Array.isArray(u.calamities)) u.calamities = [];
  if(u.supplyState == null) u.supplyState = 'supplied';
  // rallyingToArmyId / rallyJourneyId are transient runtime state (set only while a unit is
  // marching to rally — callUpUnit). NOT backfilled on load: a unit without them reads as
  // present (every consumer tests `=== army.id`), so templates stay migrate-no-ops.
  if(!Array.isArray(u.history)) u.history = [];
  if(u.notes == null) u.notes = '';
  return u;
}

// The W1 lift: every nested garrison/mercenary-company unit becomes a first-class
// member of campaign.units[] — the SAME object in both homes (reference-unified, the
// hexes/liftToTopLevelCollections precedent). Idempotent + self-healing both ways:
// a JSON round-trip duplicates the objects; on load the campaign.units copy wins as
// canonical and the nested entries are re-pointed at it; units present only in
// campaign.units with a garrison/character station are pushed back into their mirror.
function migrateGarrisonUnitsToUnits(campaign){
  if(!campaign) return campaign;
  if(!Array.isArray(campaign.units)) campaign.units = [];
  if(!Array.isArray(campaign.armies)) campaign.armies = [];
  const byId = new Map();
  for(const u of campaign.units){ if(u && u.id) byId.set(u.id, u); }
  function lift(arr, stationedAt){
    if(!Array.isArray(arr)) return;
    for(let i = 0; i < arr.length; i++){
      let u = arr[i];
      if(!u) continue;
      if(!u.id) u.id = newId(ID_PREFIXES.garrisonUnit);
      const canonical = byId.get(u.id);
      if(canonical && canonical !== u){ arr[i] = canonical; u = canonical; }
      _lazyDefaultUnitFields(u);
      if(!u.stationedAt) u.stationedAt = stationedAt;
      if(!byId.has(u.id)){ campaign.units.push(u); byId.set(u.id, u); }
    }
  }
  for(const d of (campaign.domains || [])){
    if(d && d.garrison) lift(d.garrison.units, { kind: 'domain-garrison', id: d.id });
  }
  for(const c of (campaign.characters || [])){
    if(c && c.mercenaryCompany) lift(c.mercenaryCompany.units, { kind: 'character', id: c.id });
  }
  // reverse pass: first-class units whose station names a mirror they're missing from
  for(const u of campaign.units){
    if(!u) continue;
    _lazyDefaultUnitFields(u);
    const st = u.stationedAt;
    if(!st) continue;
    if(st.kind === 'domain-garrison'){
      const d = (campaign.domains || []).find(x => x && x.id === st.id);
      if(d){
        if(!d.garrison) d.garrison = { units: [] };
        if(!Array.isArray(d.garrison.units)) d.garrison.units = [];
        const i = d.garrison.units.findIndex(x => x && x.id === u.id);
        if(i < 0) d.garrison.units.push(u);
        else if(d.garrison.units[i] !== u) d.garrison.units[i] = u;
      }
    } else if(st.kind === 'character'){
      const c = (campaign.characters || []).find(x => x && x.id === st.id);
      if(c){
        if(!c.mercenaryCompany) c.mercenaryCompany = { units: [] };
        if(!Array.isArray(c.mercenaryCompany.units)) c.mercenaryCompany.units = [];
        const i = c.mercenaryCompany.units.findIndex(x => x && x.id === u.id);
        if(i < 0) c.mercenaryCompany.units.push(u);
        else if(c.mercenaryCompany.units[i] !== u) c.mercenaryCompany.units[i] = u;
      }
    }
  }
  return campaign;
}

// =============================================================================
// Phase 2.5 Monster Persistence (#476, M0 — 2026-06-09) — Lair lookups + the legacy lift.
// Lairs are first-class placed entities (campaign.lairs[]); see blankLair (§3.1). These pure
// finds mirror the Group/Outpost lookup shape; the encounter pipeline (M3) and discovery (M4)
// build on them. RAW core — catalog-free.
// =============================================================================
function findLair(campaign, lairId){
  if(!campaign || !Array.isArray(campaign.lairs)) return null;
  return campaign.lairs.find(l => l && l.id === lairId) || null;
}
// All lairs in a hex, any status (the encounter pool + UI filter by status downstream).
function lairsAtHex(campaign, hexId){
  if(!campaign || !Array.isArray(campaign.lairs) || !hexId) return [];
  return campaign.lairs.filter(l => l && l.hexId === hexId);
}
// All lairs of a given monster type — "where do the dire wolves den in this world?"
function lairsByMonsterKey(campaign, monsterCatalogKey){
  if(!campaign || !Array.isArray(campaign.lairs)) return [];
  return campaign.lairs.filter(l => l && l.monsterCatalogKey === monsterCatalogKey);
}
function activeLairs(campaign){
  if(!campaign || !Array.isArray(campaign.lairs)) return [];
  return campaign.lairs.filter(l => l && l.status === 'active');
}
function clearedLairs(campaign){
  if(!campaign || !Array.isArray(campaign.lairs)) return [];
  return campaign.lairs.filter(l => l && l.status === 'cleared');
}
// Derived inhabitant total = Σ active group counts (count − casualties) + individuated leader
// Characters. Pure; recompute on demand — lair.totalInhabitantCount is only a cache.
function lairInhabitantCount(campaign, lair){
  if(!lair) return 0;
  let n = 0;
  if(Array.isArray(lair.groupIds) && campaign && Array.isArray(campaign.groups)){
    for(const gid of lair.groupIds){
      const g = campaign.groups.find(x => x && x.id === gid);
      if(g) n += groupActiveCount(g);
    }
  }
  if(Array.isArray(lair.leaderCharacterIds)) n += lair.leaderCharacterIds.length;
  return n;
}

// Lift legacy nested hex.lairs[] sub-entities ({id,name,creatureType,hd,numberAppearing,description})
// to the first-class campaign.lairs[] collection (blankLair §3.1). Same pattern as the treasury→stash
// lift. No shipped template carries populated nested lairs, so this is purely defensive for old
// community saves — and a no-op (returns 0) on every template, preserving the migrate-no-op invariant.
// Mirrors the migrateAgriculturalToProjects hex-collection idiom (reads BOTH campaign.hexes and each
// domain.geography.hexes; migrateCampaign runs before liftToTopLevelCollections). Idempotent: an
// entry already lifted (id present in campaign.lairs) is dropped, and each hex's nested array is
// cleared once processed, so a second pass finds nothing. Returns the count lifted.
function migrateLegacyHexLairs(campaign){
  if(!campaign || typeof campaign !== 'object') return 0;
  if(!Array.isArray(campaign.lairs)) campaign.lairs = [];
  const existingIds = new Set(campaign.lairs.map(l => l && l.id).filter(Boolean));
  const hexById = Object.create(null);
  const addHexes = (arr) => { if(Array.isArray(arr)){ for(const h of arr){ if(h && h.id && !hexById[h.id]) hexById[h.id] = h; } } };
  addHexes(campaign.hexes);
  if(Array.isArray(campaign.domains)){ for(const d of campaign.domains){ if(d && d.geography) addHexes(d.geography.hexes); } }
  let lifted = 0;
  for(const hexId of Object.keys(hexById)){
    const hex = hexById[hexId];
    if(!hex || !Array.isArray(hex.lairs) || hex.lairs.length === 0) continue;
    for(const legacy of hex.lairs){
      if(!legacy || typeof legacy !== 'object') continue;
      if(legacy.id && existingIds.has(legacy.id)) continue;  // already lifted — drop the nested dup
      // No clean target for creatureType/hd/numberAppearing in the §3.1 shape, so fold them into
      // notes with a citation; description → notes. Authored content → status:'active'.
      const bits = [];
      if(legacy.creatureType)   bits.push('Creature: ' + legacy.creatureType);
      if(legacy.hd)             bits.push('HD: ' + legacy.hd);
      if(legacy.numberAppearing)bits.push('No. appearing: ' + legacy.numberAppearing);
      const noteParts = [];
      if(legacy.description) noteParts.push(legacy.description);
      if(bits.length)        noteParts.push('(legacy ' + bits.join(', ') + ')');
      const lair = global.ACKS.blankLair({
        id: legacy.id || undefined,
        name: legacy.name || '',
        status: 'active',
        hexId: hex.id,
        establishedBy: 'gm-fiat',
        notes: noteParts.join(' ').trim()
      });
      campaign.lairs.push(lair);
      existingIds.add(lair.id);
      lifted++;
    }
    hex.lairs = [];  // canonical home is campaign.lairs[]; clear the nested array once lifted
  }
  return lifted;
}

// =============================================================================
// #476 Monster Persistence M1 — Lair lifecycle setters (Phase_2.5_Monster_Persistence_Plan.md §13).
// These are the CANONICAL mutation primitives for a lair's lifecycle — callers (the Lair Wizard,
// the Inspector, event handlers like adventure-result, the future collision consumer) go through
// them, never mutating campaign.lairs[] directly, so every transition is coherent + audited. Each
// stamps a {turn,type,reason,...} entry on lair.history (the same convention as the Wave A relation
// setters + stash history). Status semantics (blankLair §3.2): active | cleared (inhabitants gone,
// structure remains — RAW §3.2, NOT deleted) | abandoned (left of their own accord) | destroyed
// (the structure itself razed) | unknown (placed, undetailed — the hex-seeding shell) | dynamic
// (authored but unplaced — the JJ p.195 dynamic-lair pool, revealed into a hex on demand). Catalog-
// free: none of this needs MONSTER_CATALOG (that gates generation, M2/M3).
// =============================================================================

// Internal: stamp a lifecycle entry on a lair's history[]. Mirrors the Wave A / stash convention.
function _lairHistory(lair, turn, type, reason, extra){
  if(!lair) return;
  if(!Array.isArray(lair.history)) lair.history = [];
  lair.history.push(Object.assign({ turn: (turn === undefined || turn === null) ? null : turn, type: type, reason: reason || type }, extra || {}));
}

// Author a lair into campaign.lairs[] (the Lair Wizard's / Inspector's create path; also used by
// seedHexLairs + migrateLegacyHexLairs callers). opts is a blankLair opts bag. Stamps a 'created'
// history entry. establishedAtTurn defaults to the campaign's current turn. Returns the new lair.
function createLair(campaign, opts){
  if(!campaign || typeof campaign !== 'object') return null;
  if(!Array.isArray(campaign.lairs)) campaign.lairs = [];
  const o = Object.assign({}, opts || {});
  if(o.establishedAtTurn === undefined) o.establishedAtTurn = campaign.currentTurn || 1;
  const lair = global.ACKS.blankLair(o);
  _lairHistory(lair, lair.establishedAtTurn, 'created', (opts && opts.createReason) || lair.establishedBy || 'created');
  campaign.lairs.push(lair);
  return lair;
}

// Internal: resolve a lair's bound Groups (campaign.groups[] referenced by lair.groupIds).
function _lairBoundGroups(campaign, lair){
  if(!lair || !Array.isArray(lair.groupIds) || !campaign || !Array.isArray(campaign.groups)) return [];
  return lair.groupIds.map(gid => campaign.groups.find(g => g && g.id === gid)).filter(Boolean);
}

// Clear a lair — RAW §3.2: inhabitants are driven off / slain and treasure taken, but the structure
// REMAINS (status:'cleared', not deletion; it can later repopulate). Idempotent (already-cleared →
// no-op return). Stamps clearedAtTurn + clearedByEventId (when an event drove it). The canonical
// setter the adventure-result handler delegates to. Bound Groups take FULL casualties so
// groupsAtHex/groupActiveCount agree with the status (opts.leaveGroups:true skips — e.g. the GM
// narrates a rout that scattered survivors; the persistence layer owns what becomes of them).
// GM-authored leader Characters are NOT auto-killed — too destructive for a setter; GM decides.
function clearLair(campaign, lairId, opts){
  const lair = findLair(campaign, lairId);
  if(!lair) return null;
  if(lair.status === 'cleared') return lair;
  const o = opts || {};
  const turn = (o.atTurn === undefined) ? (campaign.currentTurn || null) : o.atTurn;
  lair.status = 'cleared';
  lair.clearedAtTurn = turn;
  if(o.byEventId) lair.clearedByEventId = o.byEventId;
  if(o.leaveGroups !== true){
    for(const g of _lairBoundGroups(campaign, lair)) g.casualties = Math.max(g.casualties || 0, g.count || 0);
    lair.totalInhabitantCount = lairInhabitantCount(campaign, lair);
  }
  _lairHistory(lair, turn, 'cleared', o.reason || 'cleared', o.byEventId ? { byEventId: o.byEventId } : null);
  return lair;
}

// Mark a lair discovered by the players (hex-search / tracking / GM reveal — §6/§7). Sets
// knownToPlayers + lastVisitedTurn, appends a discoveryHistory entry, and stamps history.
// Idempotent on knownToPlayers (re-discovery just refreshes lastVisitedTurn + logs a visit).
function discoverLair(campaign, lairId, opts){
  const lair = findLair(campaign, lairId);
  if(!lair) return null;
  const o = opts || {};
  const turn = (o.atTurn === undefined) ? (campaign.currentTurn || null) : o.atTurn;
  const firstTime = !lair.knownToPlayers;
  lair.knownToPlayers = true;
  lair.lastVisitedTurn = turn;
  if(!Array.isArray(lair.discoveryHistory)) lair.discoveryHistory = [];
  lair.discoveryHistory.push({ turn: turn, by: o.by || null, method: o.method || 'gm-reveal' });
  _lairHistory(lair, turn, firstTime ? 'discovered' : 'revisited', o.reason || (firstTime ? 'discovered' : 'revisited'), o.by ? { by: o.by } : null);
  return lair;
}

// Abandon a lair — its inhabitants leave of their own accord (migration, depletion, fear). Structure
// remains (status:'abandoned'). Idempotent. Distinct from 'cleared' (driven out by adventurers).
// Bound Groups DEPART alive: counts kept, currentHexId → null (gone somewhere unspecified — v1 is
// hex-local, so "away" has no coordinate; the persistence layer will give them destinations).
// opts.leaveGroups:true keeps them standing at the hex.
function abandonLair(campaign, lairId, opts){
  const lair = findLair(campaign, lairId);
  if(!lair) return null;
  if(lair.status === 'abandoned') return lair;
  const o = opts || {};
  const turn = (o.atTurn === undefined) ? (campaign.currentTurn || null) : o.atTurn;
  lair.status = 'abandoned';
  if(o.leaveGroups !== true){
    for(const g of _lairBoundGroups(campaign, lair)) g.currentHexId = null;
  }
  _lairHistory(lair, turn, 'abandoned', o.reason || 'abandoned');
  return lair;
}

// Destroy a lair — the structure itself is razed/collapsed (status:'destroyed'); the site no longer
// functions as a lair. Idempotent. (Clearing leaves a reoccupiable structure; destroying does not.)
// Destroying a still-ACTIVE lair wipes its bound Groups like clearLair (the inhabitants perish with
// the structure; opts.leaveGroups:true skips); a cleared/abandoned lair's groups are already settled.
function destroyLair(campaign, lairId, opts){
  const lair = findLair(campaign, lairId);
  if(!lair) return null;
  if(lair.status === 'destroyed') return lair;
  const o = opts || {};
  const turn = (o.atTurn === undefined) ? (campaign.currentTurn || null) : o.atTurn;
  const wasActive = (lair.status === 'active' || lair.status === 'unknown');
  lair.status = 'destroyed';
  if(wasActive && o.leaveGroups !== true){
    for(const g of _lairBoundGroups(campaign, lair)) g.casualties = Math.max(g.casualties || 0, g.count || 0);
    lair.totalInhabitantCount = lairInhabitantCount(campaign, lair);
  }
  _lairHistory(lair, turn, 'destroyed', o.reason || 'destroyed');
  return lair;
}

// Reveal a dynamic-pool lair into a hex (the JJ p.195 dynamic lair, §12.5(b) / D5): bind hexId,
// flip status:'dynamic' → 'active', record establishedBy:'dynamic-reveal'. opts.knownToPlayers sets
// discovery (when the party found it on the roll). Returns the lair (or null). Refuses a non-dynamic
// lair (use the other setters for those).
function revealDynamicLair(campaign, lairId, hexId, opts){
  const lair = findLair(campaign, lairId);
  if(!lair || !hexId) return null;
  if(lair.status !== 'dynamic') return lair;  // only pooled dynamic lairs are revealed
  const o = opts || {};
  const turn = (o.atTurn === undefined) ? (campaign.currentTurn || null) : o.atTurn;
  lair.hexId = hexId;
  lair.status = 'active';
  lair.establishedBy = 'dynamic-reveal';
  lair.establishedAtTurn = turn || lair.establishedAtTurn;
  if(o.knownToPlayers === true) lair.knownToPlayers = true;
  // The lair's population moves with it: a pool lair generated while unplaced has its bound Groups
  // (and any GM-authored leader Characters) at currentHexId:null — bind them to the revealed hex.
  for(const g of _lairBoundGroups(campaign, lair)) g.currentHexId = hexId;
  if(Array.isArray(lair.leaderCharacterIds) && Array.isArray(campaign && campaign.characters)){
    for(const cid of lair.leaderCharacterIds){
      const ch = campaign.characters.find(c => c && c.id === cid);
      if(ch) ch.currentHexId = hexId;
    }
  }
  _lairHistory(lair, turn, 'revealed', o.reason || 'dynamic-reveal', { hexId: hexId });
  return lair;
}

// --- M3 catalog-gated generation (Plan §5.3) --------------------------------
// generateLair is the SHARED generation primitive: the M3 collision consumer calls it for a fresh
// lair, the Lair Wizard "Generate from catalog" mode calls it on demand, and revealing an 'unknown'
// seeded shell or a 'dynamic' pool lair populates it via opts.lairId. It rolls the RAW lair
// population (numberAppearing.lair) into a Group bound to the lair (the structured-population model,
// flat-count for v1 — Plan §3.3) and records the Treasure Type from the catalog. NB: full hoard
// CONTENTS materialization (stash + monster-hoard custody + Notable-item promotion, Plan §3.4) is
// DEFERRED to a treasure-generation wave that consumes the Treasure-Type tables (Treasure_Tome
// survey) — v1 records lair.treasureType so the hoard can be rolled later.

// Roll an "XdY±Z" (or plain integer) dice string. rng injectable. Clamped ≥0.
function _rollDiceStr(s, rng){
  const r = rng || Math.random;
  const str = String(s == null ? '' : s).trim();
  if(/^\d+$/.test(str)) return parseInt(str, 10);
  const m = str.match(/^(\d*)d(\d+)\s*([+\-]\s*\d+)?$/i);
  if(!m){ const n = parseInt(str, 10); return isNaN(n) ? 0 : n; }
  const n = m[1] ? parseInt(m[1], 10) : 1, d = parseInt(m[2], 10), mod = m[3] ? parseInt(m[3].replace(/\s+/g, ''), 10) : 0;
  let t = mod; for(let i = 0; i < n; i++) t += 1 + Math.floor(r() * d);
  return Math.max(0, t);
}

// Generate (or populate) a lair from the MONSTER_CATALOG. opts: { monsterCatalogKey, hexId, lairId?,
// establishedBy?, count?, atTurn?, knownToPlayers?, name?, reason? }. With lairId, populates an
// existing lair (e.g. a revealed dynamic/unknown shell); else creates a fresh active lair. Returns
// { lair, group, entry, count } (entry null + group null when the key isn't in the catalog — the
// lair shell is still returned so the GM can author it via the Inspector).
function generateLair(campaign, opts, rng){
  if(!campaign || typeof campaign !== 'object') return null;
  const o = Object.assign({}, opts || {});
  const r = rng || Math.random;
  const turn = (o.atTurn === undefined) ? (campaign.currentTurn || 1) : o.atTurn;
  const entry = global.ACKS.findMonster ? global.ACKS.findMonster(o.monsterCatalogKey) : null;

  // get-or-create the lair. Populating an 'unknown' (placed) shell activates it; a 'dynamic' pool
  // lair STAYS dynamic — populated-but-unplaced (the pre-rolled JJ p.195 drop-in) — until
  // revealDynamicLair binds it to a hex (which also moves its population there).
  let lair;
  if(o.lairId){
    lair = findLair(campaign, o.lairId);
    if(!lair) return null;
    if(o.hexId) lair.hexId = o.hexId;
    if(lair.status === 'unknown') lair.status = 'active';
    if(o.knownToPlayers === true) lair.knownToPlayers = true;
  } else {
    lair = createLair(campaign, {
      hexId: o.hexId || null,
      monsterCatalogKey: o.monsterCatalogKey || '',
      status: 'active',
      establishedBy: o.establishedBy || 'gm-fiat',
      establishedAtTurn: turn,
      knownToPlayers: o.knownToPlayers === true,
      name: o.name || (entry ? entry.name + ' lair' : '')
    });
  }
  if(!lair) return null;

  // record catalog identity + treasure type (hoard contents deferred — see header)
  if(entry){
    lair.monsterCatalogKey = entry.key;
    if(lair.lairPct == null) lair.lairPct = entry.lairPct;
    if(!lair.treasureType) lair.treasureType = entry.treasureType || '';
    if(!(lair.name || '').trim()) lair.name = entry.name + ' lair';   // a populated seeded shell gets the same default name as the fresh path
  }

  // roll the population into a bound Group
  let group = null, count = 0;
  if(entry){
    count = (o.count != null) ? o.count
          : Math.max(1, _rollDiceStr((entry.numberAppearing && (entry.numberAppearing.lair || entry.numberAppearing.wandering)) || '1', r));
    if(!Array.isArray(campaign.groups)) campaign.groups = [];
    group = global.ACKS.blankGroup({
      name: entry.name,
      groupTemplate: { monsterCatalogKey: entry.key, creatureTypes: (entry.creatureTypes || []).slice(), hitDice: entry.hd || null },
      count: count,
      currentHexId: lair.hexId || null,
      socialTier: 'independent',
      lifecycleState: 'wild'
    });
    campaign.groups.push(group);
    if(!Array.isArray(lair.groupIds)) lair.groupIds = [];
    lair.groupIds.push(group.id);
    lair.totalInhabitantCount = lairInhabitantCount(campaign, lair);
  }

  _lairHistory(lair, turn, 'generated', o.reason || (entry ? 'catalog:' + entry.key : 'no-catalog-entry'),
    { monsterCatalogKey: o.monsterCatalogKey || (entry && entry.key) || null, count: count, treasureType: lair.treasureType || '' });
  return { lair: lair, group: group, entry: entry, count: count };
}

// Pool-first encounter selector (Plan §5.2 / D5) — PURE. Given an encounter has fired at a hex,
// decide what it IS by consulting the per-hex POOL before any fresh generation: an existing ACTIVE
// lair populates the encounter (random pick if several — D5); else the hex's seeded-but-undetailed
// 'unknown' SHELLS surface as populate candidates (D4 — the seeded count IS the hex's placed pool,
// Plan §4/§5.2.3; a generateLair {lairId} call fleshes the one the GM picks); else a pooled
// 'dynamic' lair may be revealed into the hex; else it's a fresh roll (the seam Phase 3 #141 /
// a generateLair call fills). Returns a proposal { source:'existing-lair'|'seeded-shell'|
// 'dynamic-pool'|'fresh', hexId, lair?, lairId?, contents?, candidates?, encounterKind?,
// fragment? }; NEVER mutates — the caller (the journey encounter, the GM, or a future all-actor
// slot-80 consumer with the territory-class probability, M8/Vagaries) acts on it.
//
// M4 lair-vs-wandering (RAW, MM p.15 / survey §16.3): meeting the monsters of a lair'd hex is
// usually a WANDERING FRAGMENT of the lair population away from home (no hoard, lair not located),
// and only Lair-% of the time the lair itself. When the picked lair carries a usable lairPct
// (0 < pct < 100) the proposal rolls 1d100: ≤ pct → encounterKind 'at-lair'; > → 'wandering-fragment'
// with a suggested fragment size (the catalog's numberAppearing.wandering when resolvable). A
// fragment encounter is the track-home hook (§6.2): the lair exists but stays undiscovered until
// tracked/searched. No usable pct (null / 0 / ≥100 / GM-authored bare lair) → 'at-lair' (the
// pre-M4 behaviour). rng draws stay deterministic under a seeded preview (same stream → same day).
function lairEncounterProposal(campaign, hexId, opts){
  const o = opts || {};
  const r = o.rng || Math.random;
  const atHex = lairsAtHex(campaign, hexId) || [];
  const here = atHex.filter(l => l && l.status === 'active');
  if(here.length){
    const lair = here.length === 1 ? here[0] : here[Math.floor(r() * here.length)];
    // The lair's own lairPct wins; a GM-authored lair without one falls back to the catalog's
    // (the monster's nature). Pin lairPct:100 on the lair to mean "they're always at home."
    const entry = (typeof global.ACKS.findMonster === 'function') ? global.ACKS.findMonster(lair.monsterCatalogKey) : null;
    const pct = (typeof lair.lairPct === 'number') ? lair.lairPct : ((entry && typeof entry.lairPct === 'number') ? entry.lairPct : null);
    let encounterKind = 'at-lair', fragment = null;
    if(pct != null && pct > 0 && pct < 100){
      const d100 = 1 + Math.floor(r() * 100);
      if(d100 > pct){
        encounterKind = 'wandering-fragment';
        const spec = entry && entry.numberAppearing && entry.numberAppearing.wandering;
        const alive = lairInhabitantCount(campaign, lair);
        let count = spec ? _rollDiceStr(spec, r) : null;
        if(count != null && alive > 0) count = Math.max(1, Math.min(count, alive));  // a fragment can't outnumber the lair's living population
        fragment = { count: count };
      }
    }
    return {
      source: 'existing-lair', hexId: hexId, lairId: lair.id, lair: lair,
      encounterKind: encounterKind, fragment: fragment,
      contents: {
        monsterCatalogKey: lair.monsterCatalogKey || '',
        groupIds: (lair.groupIds || []).slice(),
        totalInhabitantCount: lairInhabitantCount(campaign, lair),
        treasureType: lair.treasureType || '',
        knownToPlayers: !!lair.knownToPlayers
      }
    };
  }
  if(o.includeSeededShells !== false){
    const shells = atHex.filter(l => l && l.status === 'unknown');
    if(shells.length) return { source: 'seeded-shell', hexId: hexId, candidates: shells.slice() };
  }
  if(o.includeDynamicPool !== false){
    const pool = (Array.isArray(campaign && campaign.lairs) ? campaign.lairs : []).filter(l => l && l.status === 'dynamic' && !l.hexId);
    if(pool.length) return { source: 'dynamic-pool', hexId: hexId, candidates: pool.slice() };
  }
  return { source: 'fresh', hexId: hexId };
}

// --- D4 hex-density seeding (JJ p.69; Plan §4) -------------------------------
// The COUNT half of RAW wilderness stocking (catalog-free). lairDiceForTerrain maps a hex's terrain
// → the LAIRS_PER_HEX dice spec (alias-normalized); rollLairCount rolls it; seedHexLairs creates that
// many empty status:'unknown' shells the GM then fleshes (Lair Wizard / Inspector) or the catalog
// populates (M2/M3). Seeding is OPT-IN — never auto-called — and only UNSETTLED hexes seed (a domain
// hex seeds none unless forced; securing clears lairs, RR p.338).

// Roll a lair-count dice spec {n,d,mod}; clamped to ≥0 (steppe 1d3−1 can roll 0). rng injectable.
function rollLairCount(spec, rng){
  if(!spec || !spec.d || !spec.n) return 0;
  const r = rng || Math.random;
  let total = spec.mod || 0;
  for(let i=0;i<spec.n;i++) total += 1 + Math.floor(r()*spec.d);
  return Math.max(0, total);
}

// Resolve a terrain value → { key, spec:{n,d,mod}, label } from LAIRS_PER_HEX (alias-normalized),
// or null for unknown terrain. 'water' resolves to a zero spec (no land lairs). Catalog-sourced, so
// it reads through global.ACKS (set by acks-engine-catalogs.js, which loads first).
function lairDiceForTerrain(terrain){
  const T = global.ACKS.LAIRS_PER_HEX || {};
  const ALIAS = global.ACKS.LAIR_TERRAIN_ALIAS || {};
  let key = String(terrain || '').toLowerCase().trim();
  if(!key) return null;
  if(!(key in T) && (key in ALIAS)) key = ALIAS[key];
  const spec = T[key];
  if(!spec) return null;
  const label = (typeof global.ACKS.lairDiceLabel === 'function') ? global.ACKS.lairDiceLabel(spec) : '';
  return { key: key, spec: spec, label: label };
}

// lairDiceForHex(hex) — the SUB-TYPE-aware lair dice (Phase_2.5_Terrain_Model_Plan.md). Composes the
// hex's (terrain, terrainSubtype) into the LAIRS_PER_HEX key (JJ p.69). Every sub-type of a RAW-SPLIT
// base (desert/grassland/hills/mountains/scrubland) now has its own explicit row, so it resolves to its
// exact RAW count; the fallback to the bare base only fires for a RAW "(any)" base (barrens/forest/swamp
// — one value for all sub-types) or a hex with no sub-type set. Closes the M1 coarse-default gap: a hex
// that carries a sub-type seeds the RAW-correct density (forested mountain 2d4 vs rocky/snowy 1d4+1).
function lairDiceForHex(hex){
  if(!hex) return null;
  const base = (global.ACKS.terrainBase ? global.ACKS.terrainBase(hex.terrain) : String(hex.terrain || '').toLowerCase().trim());
  if(!base) return null;
  let sub = String(hex.terrainSubtype || '').toLowerCase().trim();
  if(sub === 'low') sub = 'sparse';   // RAW "low, sparse" synonyms; LAIRS_PER_HEX keys it 'scrubland-sparse'
  return (sub && lairDiceForTerrain(base + '-' + sub)) || lairDiceForTerrain(base);
}

// Seed a hex's wilderness lairs (D4). Rolls the terrain count and creates that many empty
// status:'unknown' shells (establishedBy:'hex-seeding'). OPT-IN — callers invoke it explicitly
// (a button / wizard mode), never on bulk map generation. Returns the created lairs ([] if the
// hex is missing, belongs to a domain (RAW: domain hexes seed none) without opts.force, has
// unknown terrain, or the count rolls 0). opts: { count? (override the roll), rng?, atTurn?,
// terrain? (override hex.terrain), force? (seed a domain hex anyway) }.
function seedHexLairs(campaign, hexId, opts){
  if(!campaign) return [];
  const o = opts || {};
  const hex = Array.isArray(campaign.hexes) ? campaign.hexes.find(h => h && h.id === hexId) : null;
  if(!hex) return [];
  if(hex.domainId && !o.force) return [];                 // RAW: settled (domain) hexes seed none
  // Sub-type-aware (T1): default reads the hex's full (terrain, terrainSubtype); an explicit
  // opts.terrain override stays the string path. Falls back to the bare terrain if neither resolves.
  const dice = o.terrain ? lairDiceForTerrain(o.terrain) : (lairDiceForHex(hex) || lairDiceForTerrain(hex.terrain));
  if(!dice) return [];
  const count = (o.count !== undefined) ? Math.max(0, o.count|0) : rollLairCount(dice.spec, o.rng);
  const turn = (o.atTurn === undefined) ? (campaign.currentTurn || 1) : o.atTurn;
  const out = [];
  for(let i=0; i<count; i++){
    out.push(createLair(campaign, {
      status: 'unknown',
      hexId: hex.id,
      terrain: dice.key,
      establishedBy: 'hex-seeding',
      establishedAtTurn: turn,
      createReason: 'hex-seeding'
    }));
  }
  return out;
}

// --- §6.3 securing consequence (RR p.338 + p.277; Plan M4) --------------------
// The lairs standing in the way of securing a hex for settlement: every still-live lair record —
// 'active' (inhabited) or 'unknown' (seeded/undetailed; RAW: an UNdiscovered hostile lair "will
// almost certainly disrupt settlement"). Cleared / abandoned / destroyed structures don't block;
// an unplaced 'dynamic' pool entry isn't in any hex. Pure read — the hex card surfaces it now;
// Domain Completion DC-0 consumes it as the securing gate. (Whether a specific harmless lair —
// the RAW lammasu — blocks stays GM judgment: clear it, or mark it cleared/abandoned.)
function hexSecuringBlockers(campaign, hexId){
  return (lairsAtHex(campaign, hexId) || []).filter(l => l && (l.status === 'active' || l.status === 'unknown'));
}

// --- E9 maximum lairs per hex (JJ p.69) ---------------------------------------
// "The maximum number of lairs that theoretically could be present": civilized 33% /
// borderlands 50% / outlands 66% of the unsettled amount; a domainless hex's ceiling is
// the amount itself. The unsettled amount = the terrain's lair-dice MAXIMUM (deterministic
// — a cap can't be a die roll); 🔧 rounding = NEAREST (the printed 33%/66% are ⅓/⅔ —
// civilized grassland 3 × 33% must read 1, not floor's 0). SETTLING monsters respect the
// cap ("it is simply too crowded for them" — they move to another hex): the E3a settle
// offer refuses `hex-full` and an E6 wander-entry never lingers at a full hex. The count
// is LIVING dens (active + unknown shells; cleared / abandoned / destroyed structures are
// vacant real estate, an unplaced dynamic lair sits in no hex). DISCOVERY stays ungated
// (an E4 in-lair verdict / a tracked band's founded den reveal what was already there),
// and GM authoring (Lair Wizard / createLair / Inspector / forced seeding) stays sovereign
// — the cap governs the world's own settlement, not the Judge. Returns null when no lair
// dice resolve (unknown terrain — no cap defined, nothing gates); water's zero dice read
// max 0 (v1: no land lairs in open ocean).

// The maximum of a lair-count dice spec {n,d,mod}, clamped ≥0: 1d4+1 → 5, 2d8 → 16, 1d3−1 → 2.
function lairDiceMax(spec){
  if(!spec || !spec.d || !spec.n) return 0;
  return Math.max(0, (spec.n * spec.d) + (spec.mod || 0));
}

function hexLairCapacity(campaign, hexId){
  if(!campaign) return null;
  const hex = Array.isArray(campaign.hexes) ? campaign.hexes.find(h => h && h.id === hexId) : null;
  if(!hex) return null;
  const dice = lairDiceForHex(hex) || lairDiceForTerrain(hex.terrain);
  if(!dice) return null;                               // unknown terrain — no cap defined
  const A = global.ACKS || {};
  const territoryClass = (typeof A.territoryClassForHex === 'function') ? A.territoryClassForHex(campaign, hex) : 'unsettled';
  const PCT = A.LAIR_CAP_PCT_BY_TERRITORY || {};
  const pct = (typeof PCT[territoryClass] === 'number') ? PCT[territoryClass] : 1.0;
  const diceMax = lairDiceMax(dice.spec);
  const max = Math.round(diceMax * pct);
  const count = (lairsAtHex(campaign, hexId) || []).filter(l => l && (l.status === 'active' || l.status === 'unknown')).length;
  return { count, max, full: count >= max, territoryClass, pct, diceStr: dice.label, diceMax, terrainKey: dice.key };
}

// =============================================================================
// #476 ENCOUNTER LAYER (E1) — the Encounter entity + the draw seam (D8–D12).
// An encounter is a reified COMMITTED INTERACTION between two sides (Architecture
// §3.13's third worked application): the multi-day influence ladder, the stored
// intimidation roll, and the pursuit phase are state with no other home. The RAW
// catalogs + pure resolvers live in acks-engine-catalogs.js; the GM-facing step
// verbs (which emit events) in acks-engine-events.js; the triggers (journey hex-
// entry, search-hour, rest-night) in their owning modules. Resolved encounters
// persist as world memory (D9 derives prior attitude from them at E2).
// =============================================================================

// --- Lookups (pure) -----------------------------------------------------------
function findEncounter(campaign, encounterId){
  return ((campaign && campaign.encounters) || []).find(e => e && e.id === encounterId) || null;
}
function encountersAtHex(campaign, hexId){
  return ((campaign && campaign.encounters) || []).filter(e => e && e.hexId === hexId);
}
function activeEncounters(campaign){
  return ((campaign && campaign.encounters) || []).filter(e => e && e.status === 'active');
}
function encounterDisplayName(campaign, enc){
  if(!enc) return '';
  if(enc.name) return enc.name;
  const mk = enc.monsterSide && enc.monsterSide.monsterCatalogKey;
  const mName = mk && global.ACKS && typeof global.ACKS.monsterDisplayName === 'function'
    ? global.ACKS.monsterDisplayName(mk) : (mk || '');
  const what = mName || (enc.category === 'civilized' ? 'civilized encounter'
    : enc.category === 'monster' ? 'monster encounter' : 'encounter');
  return what + (enc.hexId ? ' at ' + enc.hexId : '');
}
// priorReactionBetween — D9: prior attitude is DERIVED from encounter history, never
// stored on Lair/Group. "The same monsters" = the same lair binding OR an overlapping
// bound Group (a bare catalog key is deliberately NOT identity — any goblin is not THIS
// goblin band); "the same party" = the same party id OR any overlapping character (so
// the memory follows the people across re-formed parties). Returns the most recent
// RESOLVED prior meeting (the subject itself + no-encounter non-meetings excluded)
// with its last standing attitude — or null when these sides have never met.
function priorReactionBetween(campaign, encounter){
  if(!campaign) return null;
  const enc = (typeof encounter === 'string') ? findEncounter(campaign, encounter) : encounter;
  if(!enc) return null;
  const ms0 = enc.monsterSide || {};
  const myLair = ms0.lairId || null;
  const myGroups = ms0.groupIds || [];
  // E4m — a side bound to a pursuing band carries the chase encounter's id: the chase
  // itself IS a prior meeting with that band (the sprung caught-encounter recalls the
  // evade it sprang from), and two meetings referencing the same chase are the same band.
  const myPursuit = ms0.pursuitEncounterId || null;
  if(!myLair && !myGroups.length && !myPursuit) return null;     // unbound fresh monsters — no identity to remember
  const ps0 = enc.partySide || {};
  const myParty = ps0.partyId || null;
  const myChars = ps0.characterIds || [];
  const when = e => ((e.resolvedAtTurn || e.occurredAtTurn || 0) * 100) + (e.resolvedOnDayInMonth || e.occurredOnDayInMonth || 0);
  let best = null;
  for(const e of (campaign.encounters || [])){
    if(!e || e.id === enc.id || e.status !== 'resolved' || e.outcome === 'no-encounter') continue;
    const ms = e.monsterSide || {};
    if(!((myLair && ms.lairId === myLair) || (ms.groupIds || []).some(g => myGroups.includes(g))
         || (myPursuit && (e.id === myPursuit || ms.pursuitEncounterId === myPursuit)))) continue;
    const ps = e.partySide || {};
    if(!((myParty && ps.partyId === myParty) || (ps.characterIds || []).some(c => myChars.includes(c)))) continue;
    if(!best || when(e) >= when(best)) best = e;   // latest wins; array order breaks ties
  }
  if(!best) return null;
  return {
    encounterId: best.id, encounter: best,
    outcome: best.outcome,
    reaction: (best.reaction && best.reaction.current) || null,
    atTurn: best.resolvedAtTurn || best.occurredAtTurn || null,
    onDayInMonth: best.resolvedOnDayInMonth || best.occurredOnDayInMonth || null
  };
}

// --- Creation + resolution (state-only; event emission lives in events.js) ----
// createEncounter — the bare constructor + collection push + history stamp. Most
// callers want createEncounterFromDraw (below), which fills the sides from a draw.
function createEncounter(campaign, opts){
  if(!campaign) return null;
  const o = opts || {};
  if(!Array.isArray(campaign.encounters)) campaign.encounters = [];
  if(o.id){
    const existing = findEncounter(campaign, o.id);
    if(existing) return existing;                       // idempotent on an explicit id (commit replays)
  }
  const enc = global.ACKS.blankEncounter(Object.assign({
    occurredAtTurn: campaign.currentTurn || 1,
    occurredOnDayInMonth: campaign.currentDayInMonth || null
  }, o));
  enc.history.push({ turn: enc.occurredAtTurn, type: 'created', reason: o.createReason || enc.trigger || 'gm-authored' });
  campaign.encounters.push(enc);
  return enc;
}
// resolveEncounter — flip to resolved with an outcome (idempotent). Outcomes:
// no-encounter | evaded | parleyed | dispersed | combat | settled-as-lair | dismissed.
// 'combat' records "GM resolves" until #141; 'settled-as-lair' is E3's linger branch.
function resolveEncounter(campaign, encounterId, outcome, opts){
  const enc = findEncounter(campaign, encounterId);
  if(!enc) return null;
  const o = opts || {};
  if(enc.status === 'resolved') return enc;             // idempotent
  enc.status = 'resolved';
  enc.outcome = outcome || enc.outcome || 'dismissed';
  enc.resolvedAtTurn = (o.atTurn === undefined) ? (campaign.currentTurn || 1) : o.atTurn;
  enc.resolvedOnDayInMonth = (o.onDayInMonth === undefined) ? (campaign.currentDayInMonth || null) : o.onDayInMonth;
  if(o.resolvedByEventId) enc.resolvedByEventId = o.resolvedByEventId;
  enc.history.push({ turn: enc.resolvedAtTurn, type: 'resolved', reason: enc.outcome, note: o.note || '' });
  return enc;
}

// --- The identity roll + the RAW 6a lair binding (E4, revising D12) -------------

// Resolve a hex (or a sparse-route override) to the identity-table inputs and roll the
// JJ 1d100. Returns the identity {natural, label, key, tableKey|columnKey, rarity, page}
// or null when no table maps (water, unknown terrain, tables module absent).
function _drawIdentityForHex(campaign, hexId, ctx, category, rarity, rng){
  const A = global.ACKS;
  if(typeof A.rollEncounterIdentity !== 'function') return null;
  const hex = hexId && Array.isArray(campaign && campaign.hexes) ? campaign.hexes.find(h => h && h.id === hexId) : null;
  const tKey = ctx.terrainKey || (hex && typeof A.terrainKey === 'function' ? A.terrainKey(hex) : null);
  if(!tKey) return null;
  const hasRiver = (ctx.hasRiver !== undefined) ? !!ctx.hasRiver
    : !!(hex && Array.isArray(hex.riverSides) && hex.riverSides.length);
  return A.rollEncounterIdentity({ terrainKey: tKey, hasRiver: hasRiver, category: category, rarity: rarity, rng: rng });
}

// E4m — the world's loose monster bands (derived, never stored): the bands ABROAD that a
// wandering draw can meet — the pool-first principle extended off the lair map (Joachim
// 2026-06-11: "a wandering group that is pursuing someone should be eligible to be found
// by a third party on the same hex — the mechanic like a pre-existing lair being found").
// Two kinds:
//   • pursuer — an active chase (phase 'pursuit', offered|pursuing): the band IS the chase
//     encounter's monster side, placed at the trail's anchor hex (🔧 v1 — the chase model is
//     straight-line; the band itself trails by gapMiles within the hex's reach).
//   • migrant — a living Group housed by no living lair (an abandoned den's survivors, or a
//     free-authored band) standing at its currentHexId. A group bound to an active chase
//     reads as the pursuer row, never twice.
// The ONE derivation both consumers read: the 6a binding (who answers a wandering verdict)
// and the 🐉 Monsters Groups table (what roams the world). Rows carry monsterKey (catalog-
// resolved so aliases fold), the living count, the hex, and the refs the binding records.
function looseMonsterBands(campaign){
  const A = global.ACKS;
  const rows = [];
  if(!campaign) return rows;
  const LIVING = { active: 1, unknown: 1, dynamic: 1 };
  const settled = new Set(), deadHome = {};
  for(const l of (campaign.lairs || [])){
    if(!l) continue;
    for(const gid of (l.groupIds || [])){ if(LIVING[l.status]) settled.add(gid); else if(!(gid in deadHome)) deadHome[gid] = l.id; }
  }
  const chasing = new Set();
  for(const e of (campaign.encounters || [])){
    const p = e && e.pursuit;
    if(!e || e.status !== 'active' || e.phase !== 'pursuit' || !p || p.direction === 'party' || (p.status !== 'offered' && p.status !== 'pursuing')) continue;
    const ms = e.monsterSide || {};
    for(const gid of (ms.groupIds || [])) chasing.add(gid);
    const entry = (ms.monsterCatalogKey && typeof A.findMonster === 'function') ? A.findMonster(ms.monsterCatalogKey) : null;
    rows.push({
      kind: 'pursuer', encounterId: e.id,
      monsterKey: entry ? entry.key : ((ms.monsterCatalogKey) || null),
      label: p.pursuerLabel || ms.label || (entry && entry.name) || '',
      count: (ms.count != null) ? ms.count : null,
      hexId: p.lastPartyHexId || e.hexId || null,
      groupIds: (ms.groupIds || []).slice(),
      lairId: ms.lairId || null,
      pursuitStatus: p.status, gapMiles: (p.gapMiles == null ? null : p.gapMiles),
      quarry: { partyId: (e.partySide && e.partySide.partyId) || null,
                characterIds: ((e.partySide && e.partySide.characterIds) || []).slice() }
    });
  }
  // E5 — a band being TRACKED is abroad too: a definite entity at its trail-head hex, met
  // as itself by anyone else's wandering draw (its own trackers excluded — the catch owns
  // that meeting). A tracked migrant Group reads as the tracked row, never twice.
  const tracked = new Set();
  for(const e of (campaign.encounters || [])){
    const p = e && e.pursuit;
    if(!e || !p || p.direction !== 'party' || p.status !== 'tracking') continue;
    const ms = e.monsterSide || {};
    const q = p.quarry || {};
    if(q.groupId) tracked.add(q.groupId);
    const entry = (ms.monsterCatalogKey && typeof A.findMonster === 'function') ? A.findMonster(ms.monsterCatalogKey) : null;
    rows.push({
      kind: 'tracked', encounterId: e.id,
      monsterKey: entry ? entry.key : ((ms.monsterCatalogKey) || null),
      label: p.quarryLabel || ms.label || (entry && entry.name) || '',
      count: (p.countTracked != null && p.countTracked !== 0) ? p.countTracked : ((ms.count != null) ? ms.count : null),
      hexId: q.hexId || null,
      groupIds: q.groupId ? [q.groupId] : (ms.groupIds || []).slice(),
      lairId: ms.lairId || null,
      quarryCoord: q.coord ? { q: q.coord.q, r: q.coord.r } : null,
      halted: !!q.halted,
      trackedBy: { characterId: p.trackerCharacterId || null, partyId: p.trackerPartyId || null,
                   name: p.trackerName || '', journeyId: p.journeyId || null }
    });
  }
  for(const g of (campaign.groups || [])){
    if(!g || settled.has(g.id) || chasing.has(g.id) || tracked.has(g.id)) continue;
    const alive = (typeof groupActiveCount === 'function') ? groupActiveCount(g) : Math.max(0, (g.count || 0) - (g.casualties || 0));
    if(alive <= 0) continue;
    const tpl = g.groupTemplate || {};
    const entry = (tpl.monsterCatalogKey && typeof A.findMonster === 'function') ? A.findMonster(tpl.monsterCatalogKey) : null;
    const ws = g.wanderState || null;
    // E10 — a morale-banditry band (RR pp.350–351): the domain's OWN disaffected men,
    // raiding within their domain. Its own roster kind — the band consumer fences its
    // wander to the domain, it never dens or heads home, and the 6a abroad verdict binds
    // it as 'banditry-band'. Takes precedence over any (defensive) homing state.
    if(g.banditryDomainId){
      const dom = (campaign.domains || []).find(d => d && d.id === g.banditryDomainId);
      rows.push({
        kind: 'banditry', groupId: g.id,
        monsterKey: entry ? entry.key : ((tpl.monsterCatalogKey) || null),
        label: g.name || (entry && entry.name) || '',
        count: alive,
        hexId: g.currentHexId || null,
        groupIds: [g.id],
        lairId: null,
        banditryDomainId: g.banditryDomainId,
        banditryDomainName: (dom && dom.name) || null,
        halted: !!(ws && ws.halted)
      });
      continue;
    }
    // E6 — a post-chase band walking back to its den (pursuitAftermath set the state):
    // its own roster kind, carrying the den ref so a chase sprung from MEETING it re-homes.
    if(ws && ws.mode === 'heading-home' && ws.destLairId){
      rows.push({
        kind: 'homing', groupId: g.id,
        monsterKey: entry ? entry.key : ((tpl.monsterCatalogKey) || null),
        label: g.name || (entry && entry.name) || '',
        count: alive,
        hexId: g.currentHexId || null,
        groupIds: [g.id],
        lairId: ws.destLairId,
        destLairId: ws.destLairId
      });
      continue;
    }
    rows.push({
      kind: 'migrant', groupId: g.id,
      monsterKey: entry ? entry.key : ((tpl.monsterCatalogKey) || null),
      label: g.name || (entry && entry.name) || '',
      count: alive,
      hexId: g.currentHexId || null,
      groupIds: [g.id],
      lairId: null,
      deadHomeLairId: deadHome[g.id] || null,
      halted: !!(ws && ws.halted),                 // E6 — the GM's parking lever (else it wanders)
      // W2 — a band that arrived as a DOMAIN ENCOUNTER carries its verdict (the Groups
      // table + the 6a binding label name the incursion; the band wanders/holds the same).
      incursion: g.incursion ? { domainId: g.incursion.domainId, attitude: g.incursion.attitude,
                                 disposition: g.incursion.disposition, rulerAware: g.incursion.rulerAware !== false } : null
    });
  }
  return rows;
}

// RAW JJ p.43 step 6a: once the table names the creature, roll against its MM Lair
// characteristic to decide whether the meeting is AT its lair or with creatures abroad —
// then bind the verdict to the world. An existing active den of that monster answers
// (the world remembers — D5 as written: "an existing lair populates a lair encounter");
// otherwise an in-lair result DETAILS one of the hex's seeded shells, or REVEALS a
// key-matched pooled dynamic lair (RAW's own parenthetical: "a dynamic lair can be used
// if one is available"), or — monster category only — MINTS a fresh den (the Judge's
// improvised lair, automated; 🔧 civilized folk "at home" with no den entity just count
// at lair size). A wandering result binds FIRST to a LOOSE BAND of that monster at the
// hex (E4m — a pursuing band or migrant Group is a definite entity; it beats the conjured
// fragment; the chase whose own quarry is drawing is excluded — meeting your pursuer is
// the chase's catch, not the table's), then where a den of that monster exists it is a
// FRAGMENT of it (MM p.15 — capped at the living population, no hoard, the lair unlocated).
// PURE — counts + picks pre-rolled into the returned intent; mutation happens at
// createEncounterFromDraw (the trigger's commit point). opts.partySide {partyId,
// characterIds} = the drawing group (the quarry exclusion).
function bindEncounterIdentity(campaign, hexId, identity, opts){
  const o = opts || {};
  const r = o.rng || Math.random;
  const A = global.ACKS;
  const entry = (identity && identity.key && typeof A.findMonster === 'function') ? A.findMonster(identity.key) : null;
  if(!entry) return { mode: 'wandering', inLair: false, lairRoll: null, lairPct: null, count: null };
  const pct = (typeof entry.lairPct === 'number') ? entry.lairPct : 0;
  const lairRoll = 1 + Math.floor(r() * 100);
  const inLair = pct > 0 && lairRoll <= pct;
  const atHex = hexId ? (lairsAtHex(campaign, hexId) || []) : [];
  const sameMonster = l => l && ((A.findMonster(l.monsterCatalogKey) || {}).key === entry.key);
  const densHere = atHex.filter(l => l && l.status === 'active' && sameMonster(l));
  const pick = list => list.length === 1 ? list[0] : list[Math.floor(r() * list.length)];
  const wanderSpec = (entry.numberAppearing && entry.numberAppearing.wandering) || '1';
  const lairSpec = (entry.numberAppearing && (entry.numberAppearing.lair || entry.numberAppearing.wandering)) || '1';
  if(inLair){
    if(densHere.length){
      const lair = pick(densHere);
      return { mode: 'existing-lair', inLair: true, lairRoll, lairPct: pct, lairId: lair.id, count: lairInhabitantCount(campaign, lair) || null };
    }
    const shells = atHex.filter(l => l && l.status === 'unknown');
    if(shells.length && hexId){
      const shell = pick(shells);
      return { mode: 'populate-shell', inLair: true, lairRoll, lairPct: pct, shellLairId: shell.id, count: Math.max(1, _rollDiceStr(lairSpec, r)) };
    }
    const dyn = (Array.isArray(campaign && campaign.lairs) ? campaign.lairs : []).filter(l => l && l.status === 'dynamic' && !l.hexId && sameMonster(l));
    if(dyn.length){
      const lair = pick(dyn);
      return { mode: 'reveal-dynamic', inLair: true, lairRoll, lairPct: pct, lairId: lair.id, count: lairInhabitantCount(campaign, lair) || null };
    }
    if((o.category || 'monster') === 'monster' && hexId)
      return { mode: 'fresh-lair', inLair: true, lairRoll, lairPct: pct, count: Math.max(1, _rollDiceStr(lairSpec, r)) };
    return { mode: 'wandering', inLair: true, lairRoll, lairPct: pct, count: Math.max(1, _rollDiceStr(lairSpec, r)) };
  }
  // E4m — a loose band of this monster standing at the hex answers the abroad verdict
  // first: the band met IS the known band (pursuer or migrant), not a conjured one.
  if(hexId){
    const me = (o.partySide || {});
    const myChars = me.characterIds || [];
    const bands = looseMonsterBands(campaign).filter(band => {
      if(band.hexId !== hexId || !band.monsterKey || band.monsterKey !== entry.key) return false;
      if(band.kind === 'pursuer'){
        const q = band.quarry || {};
        if(me.partyId && q.partyId && me.partyId === q.partyId) return false;
        if((q.characterIds || []).some(id => myChars.includes(id))) return false;
      }
      if(band.kind === 'tracked'){
        // E5 — the trackers never meet their own quarry through the table (the catch owns it).
        const tb = band.trackedBy || {};
        if(me.partyId && tb.partyId && me.partyId === tb.partyId) return false;
        if(tb.characterId && myChars.includes(tb.characterId)) return false;
      }
      return true;
    });
    if(bands.length){
      const band = pick(bands);
      return { mode: 'loose-band', inLair: false, lairRoll, lairPct: pct,
               bandKind: band.kind, encounterId: band.encounterId || null, groupId: band.groupId || null,
               lairId: band.lairId || null, count: (band.count != null) ? band.count : Math.max(1, _rollDiceStr(wanderSpec, r)) };
    }
  }
  if(densHere.length){
    const lair = pick(densHere);
    const alive = lairInhabitantCount(campaign, lair);
    let count = Math.max(1, _rollDiceStr(wanderSpec, r));
    if(alive > 0) count = Math.max(1, Math.min(count, alive));
    return { mode: 'fragment', inLair: false, lairRoll, lairPct: pct, lairId: lair.id, count };
  }
  return { mode: 'wandering', inLair: false, lairRoll: pct > 0 ? lairRoll : null, lairPct: pct, count: Math.max(1, _rollDiceStr(wanderSpec, r)) };
}

// --- The draw seam (§15.2; E4 lands the 1d100 identity tables, revising D12) ----
// encounterDraw(campaign, hexId, context) — ONE function, two identity regimes:
//   • TABLE-FIRST (the default — RAW JJ p.43 steps 4–6a, the travel + rest-night
//     procedure): the 1d20 category draw → monster rarity → the 1d100 identity table
//     for the hex's terrain → the Lair % binding (bindEncounterIdentity above). The
//     hex's lairs participate by MATCHING the rolled monster, not by overriding it.
//   • LAIR-FIRST (context.lairFirst — the RR p.276 search-hour: "stumbled onto one
//     of the lairs in the hex"): the M3 pool answers before any table —
//     lairEncounterProposal unchanged.
// Water / unknown terrain (no table) falls back to the pre-E4 pool-then-gm-pick fill.
// context: { road?, night?, resting?, knownRoute?, rng?, lairFirst?, includeDynamicPool?,
//            territoryClass?, terrainKey?, hasRiver? (sparse-route environment overrides),
//            partySide? {partyId, characterIds} (the drawing group — E4m quarry exclusion) }.
// PURE except rng consumption — no campaign mutation; triggers materialize entities
// from the returned draw at their commit point (createEncounterFromDraw).
function encounterDraw(campaign, hexId, context){
  const ctx = context || {};
  const rng = ctx.rng || Math.random;
  const A = global.ACKS;
  const hex = Array.isArray(campaign && campaign.hexes) ? campaign.hexes.find(h => h && h.id === hexId) : null;
  const territoryClass = ctx.territoryClass
    || (typeof A.territoryClassForHex === 'function' ? A.territoryClassForHex(campaign, hex) : 'unsettled');
  const cat = A.rollEncounterCategory({
    territoryClass, road: !!ctx.road, night: !!ctx.night,
    resting: !!ctx.resting, knownRoute: !!ctx.knownRoute, rng
  });
  const draw = {
    hexId: hexId || null, territoryClass, columnKey: cat.columnKey,
    category: cat.category, demoted: cat.demoted || null, rolls: cat.rolls,
    rarity: null, rarityRoll: null, identity: null, identityRoll: null, binding: null, proposal: null
  };
  // The pre-E4 pool-then-gm-pick fill — kept for the search path + unmappable terrain.
  const poolFill = () => {
    const prop = hexId ? lairEncounterProposal(campaign, hexId, { rng, includeDynamicPool: ctx.includeDynamicPool === true })
                       : { source: 'fresh', hexId: null };
    draw.proposal = prop;
    draw.identity = (prop && prop.source === 'existing-lair') ? 'pool' : 'gm-pick';
  };
  if(cat.category === 'monster'){
    const rar = A.rollEncounterRarity(territoryClass, rng);
    draw.rarity = rar.rarity; draw.rarityRoll = rar.roll;
    if(ctx.lairFirst){
      poolFill();
      // E4n — the hex held nothing to stumble onto (no active den, no seeded shell,
      // no pool candidate): the search-hour's meeting is an ordinary wandering
      // encounter, so the JJ tables name it exactly as the travel/rest draws do.
      // Lair-first PRECEDENCE stands (RR p.276) — only the empty-pool fallback
      // upgrades from the pre-E4 "GM identifies" fill.
      if(draw.proposal && draw.proposal.source === 'fresh'){
        const ident = _drawIdentityForHex(campaign, hexId, ctx, 'monster', rar.rarity, rng);
        if(ident){
          draw.proposal = null;
          draw.identityRoll = ident; draw.identity = 'table';
          draw.binding = bindEncounterIdentity(campaign, hexId, ident, { category: 'monster', rng, partySide: ctx.partySide });
        }
      }
    }
    else {
      const ident = _drawIdentityForHex(campaign, hexId, ctx, 'monster', rar.rarity, rng);
      if(ident){
        draw.identityRoll = ident; draw.identity = 'table';
        draw.binding = bindEncounterIdentity(campaign, hexId, ident, { category: 'monster', rng, partySide: ctx.partySide });
      } else poolFill();
    }
  } else if(cat.category === 'civilized'){
    const ident = _drawIdentityForHex(campaign, hexId, ctx, 'civilized', null, rng);
    if(ident){
      draw.identityRoll = ident; draw.identity = 'table';
      draw.binding = bindEncounterIdentity(campaign, hexId, ident, { category: 'civilized', rng, partySide: ctx.partySide });
    } else draw.identity = 'gm-pick';
  }
  return draw;
}

// --- Apply a 6a binding to a monster side (shared: creation + identity reroll) ---
// MUTATES the campaign for the lair-touching modes: populate-shell details a seeded
// shell (generateLair on it), reveal-dynamic places a pooled lair (RAW's parenthetical),
// fresh-lair mints the Judge's improvised den. Each stamps side.minted — the unwind
// receipt _unwindEncounterMinting reverses (day revert / identity reroll). The party
// meets an in-lair creature AT the den (RR 6c: the distance is to the lair), so a
// detailed/revealed/minted den lands knownToPlayers:true. A shell or pooled lair that
// changed since the preview (GM touched it) degrades to a fresh mint.
function _applyIdentityBinding(campaign, side, identity, binding, opts){
  const o = opts || {};
  const A = global.ACKS;
  const turn = (o.atTurn === undefined) ? ((campaign && campaign.currentTurn) || 1) : o.atTurn;
  side.identity = Object.assign({}, identity);
  side.binding = binding ? { mode: binding.mode, inLair: !!binding.inLair, lairRoll: (binding.lairRoll === undefined ? null : binding.lairRoll), lairPct: (binding.lairPct === undefined ? null : binding.lairPct) } : null;
  side.monsterCatalogKey = (identity && identity.key) || '';
  side.label = (identity && identity.label) || '';
  side.source = 'table';
  side.minted = null;
  side.pursuitEncounterId = null;   // E4m — a rebind away from a pursuing band drops the chase link
  const b = binding || { mode: 'wandering', count: null };
  const bindToLair = (lair, kind, count) => {
    side.lairId = lair.id;
    side.encounterKind = kind;
    side.groupIds = (lair.groupIds || []).slice();
    side.count = (count != null) ? count : (lairInhabitantCount(campaign, lair) || null);
  };
  const wanderingFallback = () => { side.lairId = null; side.groupIds = []; side.encounterKind = 'wandering'; side.count = (b.count == null ? null : b.count); };
  const freshMint = () => {
    if(!identity || !identity.key || !o.hexId){ wanderingFallback(); return; }
    const gen = generateLair(campaign, { hexId: o.hexId, monsterCatalogKey: identity.key, count: b.count,
                                         establishedBy: 'encounter-in-lair', knownToPlayers: true, atTurn: turn }, o.rng);
    if(gen && gen.lair){
      bindToLair(gen.lair, 'at-lair', b.count);
      side.minted = { mode: 'fresh-lair', lairId: gen.lair.id, groupId: gen.group ? gen.group.id : null };
    } else wanderingFallback();
  };
  if(b.mode === 'existing-lair' || b.mode === 'fragment'){
    const lair = findLair(campaign, b.lairId);
    if(lair){
      side.source = 'existing-lair';
      if(b.mode === 'fragment'){ side.lairId = lair.id; side.encounterKind = 'wandering-fragment'; side.count = b.count; }
      else bindToLair(lair, 'at-lair', b.count);
    } else wanderingFallback();
  } else if(b.mode === 'populate-shell'){
    const shell = findLair(campaign, b.shellLairId);
    if(shell && shell.status === 'unknown' && identity && identity.key){
      const prior = { status: shell.status, monsterCatalogKey: shell.monsterCatalogKey || '', treasureType: shell.treasureType || '',
                      name: shell.name || '', lairPct: (shell.lairPct === undefined ? null : shell.lairPct),
                      knownToPlayers: !!shell.knownToPlayers, groupIds: (shell.groupIds || []).slice(), historyLen: (shell.history || []).length };
      const gen = generateLair(campaign, { lairId: shell.id, monsterCatalogKey: identity.key, count: b.count,
                                           knownToPlayers: true, atTurn: turn }, o.rng);
      if(gen && gen.lair){
        bindToLair(gen.lair, 'at-lair', b.count);
        side.minted = { mode: 'populate-shell', lairId: gen.lair.id, groupId: gen.group ? gen.group.id : null, priorLair: prior };
      } else wanderingFallback();
    } else freshMint();
  } else if(b.mode === 'reveal-dynamic'){
    const lair = findLair(campaign, b.lairId);
    if(lair && lair.status === 'dynamic' && o.hexId){
      const priorGroups = _lairBoundGroups(campaign, lair).map(g => ({ groupId: g.id, hexId: g.currentHexId || null }));
      const priorLeaders = (lair.leaderCharacterIds || []).map(cid => {
        const ch = (campaign.characters || []).find(c => c && c.id === cid);
        return { characterId: cid, hexId: ch ? (ch.currentHexId || null) : null };
      });
      const prior = { establishedBy: lair.establishedBy || null, establishedAtTurn: lair.establishedAtTurn || null,
                      knownToPlayers: !!lair.knownToPlayers, historyLen: (lair.history || []).length,
                      groups: priorGroups, leaders: priorLeaders };
      revealDynamicLair(campaign, lair.id, o.hexId, { knownToPlayers: true, atTurn: turn, reason: 'encounter-in-lair' });
      bindToLair(lair, 'at-lair', b.count);
      side.minted = { mode: 'reveal-dynamic', lairId: lair.id, prior: prior };
    } else freshMint();
  } else if(b.mode === 'fresh-lair'){
    freshMint();
  } else if(b.mode === 'loose-band'){
    // E4m — the band met IS a known loose band: a pursuing band (the chase encounter's
    // monster side, linked via pursuitEncounterId so D9 recalls it and the chase can
    // reconcile on resolution) or a migrant Group. Nothing is minted — the identity
    // reroll re-binds freely, no unwind receipt. A stale ref (the GM resolved the chase
    // or the group died between propose and commit) degrades to a plain wandering band.
    let bound = false;
    if(b.bandKind === 'pursuer' && b.encounterId){
      const chase = findEncounter(campaign, b.encounterId);
      const pp = chase && chase.pursuit;
      if(chase && chase.status === 'active' && chase.monsterSide && pp && (pp.status === 'offered' || pp.status === 'pursuing')){
        const cms = chase.monsterSide;
        side.source = 'pursuing-band';
        side.pursuitEncounterId = chase.id;
        side.lairId = cms.lairId || null;          // a fragment-that-pursues keeps its den ref
        side.groupIds = (cms.groupIds || []).slice();
        side.encounterKind = 'wandering';
        side.count = (cms.count != null) ? cms.count : (b.count == null ? null : b.count);
        bound = true;
      }
    } else if(b.bandKind === 'migrant' && b.groupId){
      const g = (campaign.groups || []).find(x => x && x.id === b.groupId);
      const alive = g ? ((typeof groupActiveCount === 'function') ? groupActiveCount(g) : Math.max(0, (g.count || 0) - (g.casualties || 0))) : 0;
      if(g && alive > 0){
        side.source = 'migrant-band';
        side.lairId = null;
        side.groupIds = [g.id];
        side.encounterKind = 'wandering';
        side.count = alive;
        bound = true;
      }
    } else if(b.bandKind === 'tracked' && b.encounterId){
      // E5 — the band met IS the quarry of someone else's follow: the tracked meeting's
      // monster side, linked via pursuitEncounterId so D9 recalls it (and a 'dispersed'
      // here ends the follow — the trail has no band left on it).
      const trk = findEncounter(campaign, b.encounterId);
      const tp = trk && trk.pursuit;
      if(trk && trk.monsterSide && tp && tp.direction === 'party' && tp.status === 'tracking'){
        const tms = trk.monsterSide;
        const qg = (tp.quarry && tp.quarry.groupId) || null;
        side.source = 'tracked-band';
        side.pursuitEncounterId = trk.id;
        side.lairId = tms.lairId || null;          // a banded fragment keeps its den ref
        side.groupIds = qg ? [qg] : (tms.groupIds || []).slice();
        side.encounterKind = 'wandering';
        side.count = (b.count != null) ? b.count : (tms.count != null ? tms.count : null);
        bound = true;
      }
    } else if(b.bandKind === 'homing' && b.groupId){
      // E6 — a post-chase band walking home: met as itself, the side keeping the DEN ref —
      // so a chase sprung from this meeting re-homes after it (the directive's "pick up a
      // new pursuit … and return home after that pursuit").
      const g = (campaign.groups || []).find(x => x && x.id === b.groupId);
      const alive = g ? ((typeof groupActiveCount === 'function') ? groupActiveCount(g) : Math.max(0, (g.count || 0) - (g.casualties || 0))) : 0;
      if(g && alive > 0){
        side.source = 'homing-band';
        side.lairId = (g.wanderState && g.wanderState.destLairId) || b.lairId || null;
        side.groupIds = [g.id];
        side.encounterKind = 'wandering';
        side.count = alive;
        bound = true;
      }
    } else if(b.bandKind === 'banditry' && b.groupId){
      // E10 — a morale-banditry band (RR pp.350–351): met as itself, the side carrying the
      // plagued domain so the panel names whose men these are. No den ref — it never lairs;
      // the settle offer refuses 'banditry-band'.
      const g = (campaign.groups || []).find(x => x && x.id === b.groupId);
      const alive = g ? ((typeof groupActiveCount === 'function') ? groupActiveCount(g) : Math.max(0, (g.count || 0) - (g.casualties || 0))) : 0;
      if(g && alive > 0){
        side.source = 'banditry-band';
        side.banditryDomainId = g.banditryDomainId || null;
        side.lairId = null;
        side.groupIds = [g.id];
        side.encounterKind = 'wandering';
        side.count = alive;
        bound = true;
      }
    }
    if(!bound) wanderingFallback();
  } else {
    wanderingFallback();
    if(b.inLair) side.encounterKind = 'wandering';   // civilized "at home" — no den entity (🔧), count at lair size
  }
  return side;
}

// Reverse what _applyIdentityBinding minted — the journey-day revert + the identity
// reroll/choose verbs. Surgical: a fresh den (+ its group) is removed; a detailed shell
// reverts to its pre-populate snapshot (created group dropped); a revealed pooled lair
// returns to the pool with its population un-placed.
function _unwindEncounterMinting(campaign, minted){
  if(!campaign || !minted) return;
  const lair = findLair(campaign, minted.lairId);
  if(minted.mode === 'fresh-lair'){
    if(Array.isArray(campaign.lairs)) campaign.lairs = campaign.lairs.filter(l => !(l && l.id === minted.lairId));
    if(minted.groupId && Array.isArray(campaign.groups)) campaign.groups = campaign.groups.filter(g => !(g && g.id === minted.groupId));
    return;
  }
  if(minted.mode === 'populate-shell' && lair && minted.priorLair){
    const p = minted.priorLair;
    const createdGroups = (lair.groupIds || []).filter(id => (p.groupIds || []).indexOf(id) < 0);
    lair.status = p.status; lair.monsterCatalogKey = p.monsterCatalogKey; lair.treasureType = p.treasureType;
    lair.name = p.name; lair.lairPct = p.lairPct; lair.knownToPlayers = p.knownToPlayers;
    lair.groupIds = (p.groupIds || []).slice();
    if(createdGroups.length && Array.isArray(campaign.groups)) campaign.groups = campaign.groups.filter(g => !(g && createdGroups.indexOf(g.id) >= 0));
    if(Array.isArray(lair.history) && typeof p.historyLen === 'number') lair.history.length = Math.min(lair.history.length, p.historyLen);
    return;
  }
  if(minted.mode === 'reveal-dynamic' && lair && minted.prior){
    const p = minted.prior;
    lair.status = 'dynamic'; lair.hexId = null;
    lair.establishedBy = p.establishedBy; lair.establishedAtTurn = p.establishedAtTurn; lair.knownToPlayers = p.knownToPlayers;
    for(const gp of (p.groups || [])){ const g = (campaign.groups || []).find(x => x && x.id === gp.groupId); if(g) g.currentHexId = gp.hexId; }
    for(const lp of (p.leaders || [])){ const ch = (campaign.characters || []).find(c => c && c.id === lp.characterId); if(ch) ch.currentHexId = lp.hexId; }
    if(Array.isArray(lair.history) && typeof p.historyLen === 'number') lair.history.length = Math.min(lair.history.length, p.historyLen);
  }
}

// --- Materialize an Encounter entity from a draw -------------------------------
// Called at a trigger's COMMIT point (journey day commit / search verb / rest-night
// consumer commit) — never during a pure propose pass. Only meeting categories
// (monster / civilized) become entities; terrain discoveries (dangerous / valuable /
// unique) have no sides and stay day-log notables. opts: { id? (stable preview id),
// trigger, partySide{}, light?, rng?, atTurn?, onDayInMonth? }.
function createEncounterFromDraw(campaign, draw, opts){
  if(!campaign || !draw) return null;
  if(draw.category !== 'monster' && draw.category !== 'civilized') return null;
  const o = opts || {};
  const A = global.ACKS;
  const monsterSide = { source: 'fresh', lairId: null, groupIds: [], monsterCatalogKey: '', count: null, encounterKind: null, label: '', identity: null, binding: null, minted: null };
  const prop = draw.proposal;
  if(draw.identityRoll){
    // E4 — the table named the creature; the 6a binding rides the draw verbatim
    // (counts + picks pre-rolled with the trigger's seeded rng — preview byte-stable).
    _applyIdentityBinding(campaign, monsterSide, draw.identityRoll, draw.binding, {
      hexId: draw.hexId || null, atTurn: o.atTurn, rng: o.rng
    });
  } else if(prop && prop.source === 'existing-lair'){
    monsterSide.source = 'existing-lair';
    monsterSide.lairId = prop.lairId;
    monsterSide.monsterCatalogKey = (prop.contents && prop.contents.monsterCatalogKey) || '';
    monsterSide.encounterKind = prop.encounterKind || 'at-lair';
    if(prop.encounterKind === 'wandering-fragment'){
      monsterSide.count = (prop.fragment && prop.fragment.count) || null;
    } else {
      monsterSide.groupIds = (prop.contents && prop.contents.groupIds) ? prop.contents.groupIds.slice() : [];
      monsterSide.count = (prop.contents && prop.contents.totalInhabitantCount) || null;
    }
  } else if(prop && prop.source === 'seeded-shell'){
    monsterSide.source = 'seeded-shell';                // GM populates one of the hex's shells
  } else if(prop && prop.source === 'dynamic-pool'){
    monsterSide.source = 'dynamic';
  }
  const createOpts = {
    scale: 'wilderness',
    trigger: o.trigger || 'gm-authored',
    hexId: draw.hexId || null,
    category: draw.category,
    rarity: draw.rarity || null,
    partySide: o.partySide || {},
    monsterSide,
    createReason: o.trigger || 'draw'
  };
  if(o.id) createOpts.id = o.id;
  if(o.atTurn !== undefined) createOpts.occurredAtTurn = o.atTurn;
  if(o.onDayInMonth !== undefined) createOpts.occurredOnDayInMonth = o.onDayInMonth;
  const enc = createEncounter(campaign, createOpts);
  if(!enc) return null;
  // A trigger that pre-rolled the distance with its SEEDED rng (the journey preview) hands it
  // in verbatim — the entity matches the reviewed proposal byte-for-byte.
  if(o.distance && enc.distance == null){
    enc.distance = o.distance;
    enc.history.push({ turn: enc.occurredAtTurn, type: 'distance', reason: (o.distance.distanceFt != null ? o.distance.distanceFt : '?') + " ft (" + (o.distance.terrainRow || 'terrain') + ")" });
  }
  // Pre-roll the distance when the terrain resolves (RR pp.280–281): identity-independent,
  // so it lands at creation; sides' counts refine the visibility cap when known.
  if(enc.distance == null && typeof A.computeEncounterDistance === 'function'){
    const hex = Array.isArray(campaign.hexes) ? campaign.hexes.find(h => h && h.id === enc.hexId) : null;
    const rowKey = hex && typeof A.encounterRowKeyForHex === 'function' ? A.encounterRowKeyForHex(hex) : null;
    if(rowKey){
      enc.distance = A.computeEncounterDistance({
        terrainRow: rowKey,
        light: o.light || 'daylight',
        sideACount: (enc.partySide && enc.partySide.sizeCount) || null,
        sideBCount: (enc.monsterSide && enc.monsterSide.count) || null,
        rng: o.rng || Math.random
      });
      if(enc.distance) enc.history.push({ turn: enc.occurredAtTurn, type: 'distance', reason: enc.distance.distanceFt + " ft (" + (enc.distance.terrainRow || 'terrain') + ")" });
    }
  }
  return enc;
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
    turn: record.hiredAtTurn || record.appointedAtTurn || record.oathTakenAtTurn || record.establishedAtTurn || record.grantedAtTurn || record.sinceTurn || 1,
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
// Favors & Duties (#230, F&D-1 — RR pp.345–348) — the monthly liege↔vassal obligation
// relation setters + lookups + the derived favor/duty balance.
//
// Unlike the other Wave A relations, the obligation's status vocabulary is
// 'active' | 'revoked' | 'one-time-spent' (not 'ended'), so it has dedicated end
// setters. A vassal domain may carry many active obligations (duties + favors stack);
// the balance (favorDutyBalance) is the derived gate that decides when over-demanding
// duties triggers a Loyalty roll.
// =============================================================================

function createFavorDutyObligation(campaign, opts={}){
  const record = global.ACKS.blankFavorDutyObligation({
    id:                     opts.id,
    liegeCharacterId:       opts.liegeCharacterId       || null,
    vassalDomainId:         opts.vassalDomainId          || null,
    vassalRulerCharacterId: opts.vassalRulerCharacterId  || null,
    kind:                   opts.kind                    || '',
    customLabel:            opts.customLabel             || '',
    isFavor:                !!opts.isFavor,
    isOngoing:              !!opts.isOngoing,
    gpPerMonth:             opts.gpPerMonth              || 0,
    musterTitle:            opts.musterTitle             || '',
    roll:                   opts.roll != null ? opts.roll : null,
    grantedAtTurn:          opts.grantedAtTurn           || 1,
    loanGivenAtTurn:        opts.loanGivenAtTurn != null ? opts.loanGivenAtTurn : null,
    councilHexId:           opts.councilHexId             || null,
    scutageAutoPay:         opts.scutageAutoPay != null ? !!opts.scutageAutoPay : false,
    scutageLastPaidTurn:    opts.scutageLastPaidTurn != null ? opts.scutageLastPaidTurn : null,
    scutageGpPerFamily:     opts.scutageGpPerFamily != null ? opts.scutageGpPerFamily : null,
    officeTitle:            opts.officeTitle              || '',
    constructionSpentGp:    opts.constructionSpentGp     || 0,
    constructionOrders:     Array.isArray(opts.constructionOrders) ? opts.constructionOrders : [],
    notes:                  opts.notes                   || ''
  });
  return _pushRelation(campaign, 'favorDutyObligations', record, opts.reason || (record.isFavor ? 'favor-granted' : 'duty-demanded'));
}

// Revoke an obligation (status → 'revoked'). Idempotent.
function revokeFavorDutyObligation(campaign, obligationId, atTurn, reason){
  if(!campaign || !Array.isArray(campaign.favorDutyObligations)) return null;
  const record = campaign.favorDutyObligations.find(o => o.id === obligationId);
  if(!record) return null;
  if(record.status !== 'active') return record;  // Idempotent — already revoked / spent
  record.status = 'revoked';
  record.revokedAtTurn = atTurn != null ? atTurn : (campaign.currentTurn || 1);
  if(!Array.isArray(record.history)) record.history = [];
  record.history.push({ turn: record.revokedAtTurn, type: 'revoked', reason: reason || 'revoked' });
  return record;
}

// Retire a one-time favor after the month it was given (status → 'one-time-spent'). It no
// longer offsets a duty (RR p.347 — "a one-time favor only offsets a duty during the month
// it is given"). Idempotent.
function spendOneTimeFavorObligation(campaign, obligationId, atTurn, reason){
  if(!campaign || !Array.isArray(campaign.favorDutyObligations)) return null;
  const record = campaign.favorDutyObligations.find(o => o.id === obligationId);
  if(!record) return null;
  if(record.status !== 'active') return record;
  record.status = 'one-time-spent';
  if(!Array.isArray(record.history)) record.history = [];
  record.history.push({ turn: atTurn != null ? atTurn : (campaign.currentTurn || 1), type: 'one-time-spent', reason: reason || 'one-time-favor-lapsed' });
  return record;
}

// All ACTIVE obligations for a given (liege, vassal domain) pair.
function activeFavorDutyObligationsFor(campaign, liegeCharacterId, vassalDomainId){
  if(!campaign || !Array.isArray(campaign.favorDutyObligations)) return [];
  return campaign.favorDutyObligations.filter(o =>
    o.status === 'active' &&
    o.liegeCharacterId === liegeCharacterId &&
    o.vassalDomainId === vassalDomainId
  );
}

// All obligations binding a vassal domain (any liege, any status).
function favorDutyObligationsForVassalDomain(campaign, vassalDomainId){
  if(!campaign || !Array.isArray(campaign.favorDutyObligations)) return [];
  return campaign.favorDutyObligations.filter(o => o.vassalDomainId === vassalDomainId);
}

// Families in a vassal's realm = his own domain + every sub-vassal realm (RR p.346 — the
// gp basis for Loan / Scutage / Call-to-Arms / Gift / Troops is 1gp × this count). Mirrors
// the tribute realm-family walk (tributeOwed).
function realmFamiliesForDomain(campaign, domain){
  if(!domain) return 0;
  let families = global.ACKS.totalFamilies(domain);
  for(const { domain:v } of global.ACKS.vassalChainUnder(campaign, domain.id)) families += global.ACKS.totalFamilies(v);
  return families;
}

// The scutage rate in gp/family (RR p.347 — default 1gp/family; a lower rate is "demand less", RR p.345).
function scutageRate(o){ return (o && o.scutageGpPerFamily != null) ? Number(o.scutageGpPerFamily) : 1; }
// The LIVE monthly scutage for an obligation = rate × the vassal's CURRENT realm families (RR p.347 —
// "1gp per family in the vassal's realm"), recomputed each read so it tracks population growth/decline.
// This is canonical for billing + display; the stored gpPerMonth is only a demand-month snapshot. A
// non-scutage obligation falls back to its stored gpPerMonth.
function scutageMonthlyGp(campaign, o){
  if(!o || o.kind !== 'scutage') return Math.round(Number(o && o.gpPerMonth) || 0);
  const vassalDomain = (campaign && campaign.domains || []).find(d => d.id === o.vassalDomainId) || null;
  if(!vassalDomain) return Math.round(Number(o.gpPerMonth) || 0);
  return Math.round(scutageRate(o) * realmFamiliesForDomain(campaign, vassalDomain));
}

// The favor/duty balance for a (liege, vassal) in a given month (RR p.347). A vassal can be
// safely asked ONE ongoing duty, +1 per ongoing favor and +1 per one-time favor given THIS
// month. Demanding duties beyond that total → a Hireling Loyalty roll, at a cumulative −1 per
// duty past the one that triggers the roll. Returns the derived snapshot; loyaltyModifier is the
// situational modifier for the single excess-duty roll (the worked example RR p.347: 2 duties →
// roll at 0; 3 duties → roll at −1).
function favorDutyBalance(campaign, liegeCharacterId, vassalDomainId, opts){
  opts = opts || {};
  const month = opts.turn != null ? opts.turn : (campaign && campaign.currentTurn || 1);
  const active = activeFavorDutyObligationsFor(campaign, liegeCharacterId, vassalDomainId);
  const activeDuties          = active.filter(o => !o.isFavor).length;                                  // ongoing duties in force
  const ongoingFavors         = active.filter(o =>  o.isFavor && o.isOngoing).length;
  const oneTimeFavorsThisMonth= active.filter(o =>  o.isFavor && !o.isOngoing && o.grantedAtTurn === month).length;
  const safeDutyCount         = 1 + ongoingFavors + oneTimeFavorsThisMonth;
  const excess                = Math.max(0, activeDuties - safeDutyCount);
  // The single excess-duty roll's modifier: 0 for the duty that triggers the roll, then a
  // cumulative −1 per additional duty (RR p.347 — 2 duties → roll at 0; 3 → −1; 4 → −2).
  const loyaltyModifier       = excess > 1 ? -(excess - 1) : 0;
  return { activeDuties, ongoingFavors, oneTimeFavorsThisMonth, safeDutyCount, excess, loyaltyModifier };
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

// CoL-1 (Phase 2.5 Provisioning §16.1) — does the character live in the SETTLED regime (food + lodging
// abstracted into a monthly cost of living, no ration tracking) or the FIELD regime (stone-tracked
// rations + water, the §4 survival resolution)? Settled when the character's CURRENT hex (a) has a
// settlement, (b) holds a complete habitable stronghold (a Constructible), or (c) sits in a domain the
// character rules — directly (domain.rulerCharacterId) or up the vassalage chain (derivedVassalDomainsOf;
// "a ruler anywhere in his domain lives off his lifestyle"). A character with no current hex is SETTLED
// ("can't starve in limbo"). RAW abstracts town food/lodging into the cost of living (RR p.173); treating
// the wilderness chapter's ration rules (RR p.278) as the field-only regime is the structural reading (🔧).
const _SETTLED_CONSTRUCTIBLE_KINDS = { 'stronghold-component':1, 'settlement-building':1, 'sanctum':1 };
// ── Provisioning regime (CoL-1, Joachim 2026-06-06) ──────────────────────────────────────────────
// A character/group is on LIFESTYLE ('settled' — no rations or water consumed, "as if relying on
// living-expenses") when the hex shelters them; otherwise they're in the FIELD ('field' — daily food
// + water, RR p.278). A hex shelters a group when:
//   (a) a settlement is in the hex,
//   (b) a complete habitable stronghold is at the hex (keep / hall / sanctum — not a mill or dungeon), or
//   (c) the hex's domain is ruled (own OR up the vassalage chain) by SOMEONE IN THE GROUP — a ruler in
//       his own / his vassals' realm, and his party + journey companions, all live off the lifestyle
//       (Joachim's ruling: the own-domain exemption extends to companions; a vassal's realm counts as
//       the ruler's own). groupProvisioningInfo returns the structured reason so the UI can say WHY no
//       rations are spent; groupProvisioningRegime is the bare 'settled' | 'field'.
function groupProvisioningInfo(campaign, members, hex){
  if(!hex) return { regime: 'field', kind: null, domainId: null };
  // (a) settlement at the hex (embedded mirror or top-level by hexId) — shelters everyone present.
  const set = hex.settlement || settlementForHex(campaign, hex.id);
  if(set) return { regime: 'settled', kind: 'settlement', settlementId: (set.id || null), domainId: (hex.domainId || null) };
  // (b) a complete habitable stronghold at the hex.
  const keep = constructiblesAtHex(campaign, hex.id).find(k =>
    k && _SETTLED_CONSTRUCTIBLE_KINDS[k.constructibleKind] &&
    (k.constructionState === 'complete' || k.lifecycleState === 'complete'));
  if(keep) return { regime: 'settled', kind: 'stronghold', constructibleId: (keep.id || null), domainId: (hex.domainId || null) };
  // (c) a domain ruled (own / vassal chain) by any group member — the host carries his companions.
  if(hex.domainId){
    for(const c of (members || [])){
      if(!c) continue;
      const owns = (campaign.domains || []).some(d => d && d.id === hex.domainId && d.rulerCharacterId === c.id);
      const viaVassal = !owns && (derivedVassalDomainsOf(campaign, c.id) || []).indexOf(hex.domainId) >= 0;
      if(owns || viaVassal) return { regime: 'settled', kind: 'domain', domainId: hex.domainId, hostCharacterId: c.id, viaVassal: viaVassal };
    }
  }
  return { regime: 'field', kind: null, domainId: (hex.domainId || null) };
}
function groupProvisioningRegime(campaign, members, hex){
  return groupProvisioningInfo(campaign, members, hex).regime;
}
function _resolveProvisioningChar(campaign, char){
  return (typeof char === 'string')
    ? (campaign && Array.isArray(campaign.characters) ? campaign.characters.find(x => x && x.id === char) : null)
    : char;
}
// The cohort whose ruler-status counts toward a character's lifestyle: the character itself + every party
// co-member + every journey co-participant standing at the SAME hex. (So a henchman travelling with his
// lord through the lord's realm is on lifestyle whether or not the party shares rations; an arrived
// journey still counts as companionship.)
function characterCohort(campaign, char){
  const c = _resolveProvisioningChar(campaign, char);
  if(!c) return [];
  const hexId = c.currentHexId || null;
  const seen = {}; seen[c.id] = 1; const out = [c];
  const add = (id) => {
    if(!id || seen[id]) return;
    const m = (campaign.characters || []).find(x => x && x.id === id);
    if(m && (m.currentHexId || null) === hexId){ seen[id] = 1; out.push(m); }
  };
  if(c.partyId) (campaign.characters || []).forEach(x => { if(x && x.partyId === c.partyId) add(x.id); });
  (journeysWithParticipant(campaign, c.id) || []).forEach(j => (j.participantCharacterIds || []).forEach(add));
  return out;
}
// Regime for a single character, COMPANION-AWARE (the cohort's rulers count). This is what the day-tick
// survival consumer + the character-sheet Survival tab read. characterProvisioningRegime stays the pure
// per-character primitive (own rule only) for callers wanting just this character's standing.
function characterEffectiveRegime(campaign, char){
  const c = _resolveProvisioningChar(campaign, char);
  if(!c || !c.currentHexId) return 'settled';
  return groupProvisioningRegime(campaign, characterCohort(campaign, c), findHex(campaign, c.currentHexId));
}
function characterEffectiveProvisioningInfo(campaign, char){
  const c = _resolveProvisioningChar(campaign, char);
  if(!c || !c.currentHexId) return { regime: 'settled', kind: 'unlocated' };
  return groupProvisioningInfo(campaign, characterCohort(campaign, c), findHex(campaign, c.currentHexId));
}
function characterProvisioningRegime(campaign, char){
  const c = _resolveProvisioningChar(campaign, char);
  if(!c || !c.currentHexId) return 'settled';
  return groupProvisioningRegime(campaign, [c], findHex(campaign, c.currentHexId));
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

// --- Class-power predicate ---
// Mercantile Network (RR p.43) — the Venturer class power. Innate to the Venturer class (it is NOT
// listed in classPowers — the demo venturer has class:'Venturer' with classPowers:[]), so detect by
// class; also honor an explicit grant in classPowers (rare — a template or Judge award). Gates the
// equipment "visited before" bonus: only a venturer treats a market they've previously entered as
// one market class larger (for buying/selling equipment, hiring retainers, and ventures).
function hasMercantileNetwork(c){
  if(!c) return false;
  if(/venturer/i.test(c.class || '')) return true;
  return Array.isArray(c.classPowers) && c.classPowers.some(cp => /mercantile network/i.test(String(cp)));
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

// Canonical setter (CLAUDE #10): `hex.domainId` is the truth; each domain's nested `geography.hexes[]`
// is a reference-unified MIRROR that must follow it. Ensure `hex` lives in exactly its domainId's
// geography.hexes (creating the array if needed) and in NO other domain's, and that it's present in
// the top-level campaign.hexes. Idempotent. The gm-fiat handler calls this whenever a hex's domainId
// is set (the hex panel, the Inspector, the Event Wizard, an integrator) so the move never drifts from
// the mirror; index.html's mapRehomeHex does the same move for the (unlogged, bulk) map editor.
function reconcileHexDomainMembership(campaign, hex){
  if(!campaign || !hex) return;
  const want = hex.domainId || null;
  (campaign.domains || []).forEach(d => {
    if(!d) return;
    if(d.id === want){
      if(!d.geography) d.geography = {};
      if(!Array.isArray(d.geography.hexes)) d.geography.hexes = [];
      if(!d.geography.hexes.some(h => h && h.id === hex.id)) d.geography.hexes.push(hex);
    } else if(d.geography && Array.isArray(d.geography.hexes) && d.geography.hexes.some(h => h && h.id === hex.id)){
      d.geography.hexes = d.geography.hexes.filter(h => h && h.id !== hex.id);
    }
  });
  if(Array.isArray(campaign.hexes) && !campaign.hexes.some(h => h && h.id === hex.id)) campaign.hexes.push(hex);
}

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
      // Old-save backfill: settlements predate stable IDs (pre-#193). Without an id a settlement is
      // never lifted to campaign.settlements[] (the checks below are id-gated) AND can't be edited —
      // the editableStat save guard requires entity.id, so GM edits to Families / Investment silently
      // revert ("no entity to save against"). Assign one before the lift so it round-trips + is editable.
      if(legacySettlement && !legacySettlement.id) legacySettlement.id = newId(ID_PREFIXES.settlement);
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
        // Backfill domainId on the SURVIVING (canonical, top-level) copy. The per-hex backfill
        // above runs on the geography copy `h`, but when campaign.hexes already held this hex
        // (a save round-trip, a pre-backfill session cache, or a shared .acks.json whose
        // top-level hexes lack domainId), that geography copy is discarded here in favour of
        // topRef — so the backfill would be lost unless we also apply it to topRef. Membership
        // in d.geography.hexes[] IS the domain claim (CLAUDE #10): adopt it onto the scalar.
        if(!topRef.domainId) topRef.domainId = d.id;
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
// 9.8 TURN ORCHESTRATION (Foundation #15 — fully engine-owned, audit batch 3)
// =============================================================================
// proposeMonthlyTurn() and commitTurn() are the two consequential operations
// in the system. They orchestrate per-domain math, event application, vagary
// resolution, passive investment payouts, level-up sweeps, henchman loyalty
// drift, rumor auto-emit, and calendar advance.
//
// They compute everything internally — NO `helpers` callback bag. The ACKS
// economic ruleset lives in acks-engine-economy.js (incomeBreakdown /
// expenseBreakdown / moraleModifiersFor / sums / monthlyNet / tributeOwed /
// domainXpFromNet / families / garrison / settlement helpers, reached via
// global.ACKS at call time); the orchestration-tail helpers below (event
// summaries, character history, venture vagary, passive investments, the
// level-up sweep) were lifted out of the Alpine UI in the same batch. A
// third-party tool, a bot, or a headless test can now run a full monthly turn
// with just `ACKS.proposeMonthlyTurn(campaign)` + `ACKS.commitTurn(campaign,
// proposal)` — no DOM, no Alpine. (thermonuclear.md C1 / Restructuring R1.)
//
// Both are pure-data: no DOM, no console. Side effects happen via campaign
// mutation (state changes) + the returned result object (logEntries, levelUps,
// passiveResult, … the caller renders). RNG is injectable via options.rng so a
// turn's morale / population / vagary outcomes are scriptable in tests
// (qa-strategy I2); default Math.random — identical to the previous behavior.
//
// =============================================================================
// 9.8a TURN-ORCHESTRATION TAIL HELPERS (lifted from the Alpine UI, audit batch 3)
// -----------------------------------------------------------------------------
// These were the non-economy `helpers` the UI used to pass in. They're pure
// data over the campaign, so they live here next to the orchestration that
// calls them. The UI keeps the same method NAMES as one-line delegations.

// Append a chronological entry to a character's personal history. type: 'xp' |
// 'level-up' | 'venture' | 'domain' | 'note' | 'death' | 'restore' | 'other'.
function addCharacterHistory(campaign, c, type, summary, extra){
  if(!c) return;
  if(!Array.isArray(c.history)) c.history = [];
  // Capture the in-game date at write time so entries are stable across calendar changes.
  let gameDate = null;
  try { gameDate = global.ACKS.currentDateString ? global.ACKS.currentDateString(campaign) : null; } catch(_) {}
  c.history.push({
    turn: campaign?.currentTurn || 1,
    gameDate,
    type: type || 'note',
    summary: summary || '',
    ...(extra || {})
  });
}

// Build + push an already-applied event onto campaign.eventLog (no propose step). The engine
// equivalent of the UI's recordAppliedEvent — used by the level-up sweep below; the UI method
// delegates here so there's a single implementation.
function recordAppliedEvent(campaign, kind, payload, opts){
  if(!campaign) return null;
  opts = opts || {};
  const ev = global.ACKS.newEvent(kind, {
    submittedBy: opts.submittedBy || 'engine',
    submittedAt: new Date().toISOString(),
    targetTurn: campaign.currentTurn || 1,
    payload: payload || {}
  });
  ev.status = global.ACKS.EVENT_STATUS.APPLIED;
  ev.appliedAtTurn = campaign.currentTurn || 1;
  if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
  campaign.eventLog.push({
    event: ev,
    result: opts.result || { domainsChanged: [], charactersChanged: [], hexesChanged: [], treasuryDelta: 0, narrativeSummary: opts.narrativeSummary || payload?.narrativeSummary || (kind + ' applied') },
    appliedAtTurn: ev.appliedAtTurn,
    appliedAt: new Date().toISOString()
  });
  return ev;
}

// Human-readable target of an event (for the Advance-Month proposal display).
function summarizeEventTarget(campaign, ev){
  const p = ev.payload || {};
  if(p.domainId){
    const d = (campaign.domains||[]).find(x => x.id === p.domainId);
    return d ? ('Domain · '+d.name) : ('Domain · '+p.domainId+' (unresolved)');
  }
  if(p.characterId){
    const c = (campaign.characters||[]).find(x => x.id === p.characterId);
    return c ? ('Character · '+c.name) : ('Character · '+p.characterId+' (unresolved)');
  }
  if(p.target && p.target.kind && p.target.id){
    return p.target.kind.charAt(0).toUpperCase()+p.target.kind.slice(1)+' · '+p.target.id;
  }
  if(p.hexId) return 'Hex · '+p.hexId;
  if(p.settlementId) return 'Settlement · '+p.settlementId;
  if(p.attackerDomainId || p.defenderDomainId) return 'War · '+(p.attackerDomainId||'?')+' vs '+(p.defenderDomainId||'?');
  if(p.scope === 'campaign' || ev.kind === 'engine-standard-turn') return 'Campaign-scoped';
  return '(no target)';
}

// Humanize the event payload for at-a-glance display. Each kind picks its most salient fields.
function summarizeEventPayload(campaign, ev){
  const p = ev.payload || {};
  switch(ev.kind){
    case 'player-plan': {
      const parts = [];
      if(p.freeformNotes) parts.push('"'+p.freeformNotes.substring(0,80)+(p.freeformNotes.length>80?'...':'')+'"');
      const actions = Array.isArray(p.intendedActions) ? p.intendedActions.length : 0;
      if(actions) parts.push(actions+' action'+(actions===1?'':'s'));
      return parts.join(' · ') || '(no details)';
    }
    case 'gm-fiat':
      return (p.mutation?.fieldPath || '?')+' = '+JSON.stringify(p.mutation?.newValue);
    case 'treasury-grant':
    case 'treasury-debit':
      return (p.amount>=0?'+':'')+p.amount+'gp · '+(p.label||'no label');
    case 'character-update':
      return Object.keys(p.fieldUpdates||{}).join(', ') || '(no fields)';
    case 'adventure-result':
      return p.outcome+(p.lairId?' · cleared '+p.lairId:'')+(p.narrativeSummary?' · "'+p.narrativeSummary.substring(0,60)+'..."':'');
    case 'daw-result':
      return p.outcome+(p.attackerDomainId?' · '+p.attackerDomainId+' vs '+(p.defenderDomainId||'?'):'');
    case 'claude-event':
      return p.title || p.scope+' event';
    case 'rumor-emit':
      return '"'+(p.rumorText||'').substring(0,80)+'..."';
    case 'venture-result':
      return p.outcome+' · venture '+p.ventureId;
    case 'population-shock':
      return p.kind+': '+(p.deltaFamilies>0?'+':'')+p.deltaFamilies+' families';
    case 'domain-transfer':
      return (p.newRulerCharacterId?'new ruler '+p.newRulerCharacterId:'')+(p.newLiegeId?' new liege '+p.newLiegeId:'');
    case 'hireling-calamity': {
      const ch = (campaign.characters||[]).find(c => c.id === p.characterId);
      const who = ch ? ch.name : (p.characterId || '(unknown character)');
      const kindLabels = {
        'rations':                'went without rations',
        'wages':                  'went without wages',
        'enervation':             'suffered an enervation',
        'curse':                  'suffered a curse',
        'magical-disease':        'suffered a magical disease',
        'hp-zero':                'was reduced to 0 hp',
        'transfer-of-employment': 'was transferred to a new employer',
        'hidden-comrades':        'discovered a previously-rejected comrade in the party',
        'other':                  'suffered a calamity'
      };
      const kindStr = kindLabels[p.kind] || ('calamity (' + (p.kind||'?') + ')');
      let extra = '';
      if(p.kind === 'transfer-of-employment' && p.newEmployerCharacterId){
        const ne = (campaign.characters||[]).find(c => c.id === p.newEmployerCharacterId);
        extra = ne ? ' → ' + ne.name : '';
      }
      const noteSuffix = p.reasonNote ? ' · ' + p.reasonNote : '';
      return who + ' ' + kindStr + extra + ' (loyalty roll pending)' + noteSuffix;
    }
    case 'loyalty-check': {
      const ch = (campaign.characters||[]).find(c => c.id === p.characterId);
      const who = ch ? ch.name : (p.characterId || '(unknown character)');
      const reasonLabel = ({
        'level-up':  'after level-up',
        'calamity':  'after calamity',
        'other':     'at GM discretion',
      })[p.reason] || ('after ' + (p.reason || 'event'));
      if(p.rollResult){
        const rr = p.rollResult;
        const breakdown = 'nat ' + (rr.natRoll||'?') + ' + loy ' + ((rr.loyaltyScore||0) >= 0 ? '+' : '') + (rr.loyaltyScore||0)
                        + ' + mod ' + ((rr.situationalModifier||0) >= 0 ? '+' : '') + (rr.situationalModifier||0)
                        + ' = ' + (rr.adjusted||'?');
        return who + ' rolled ' + (rr.bandLabel||rr.bandKey||'(?)') + ' ' + reasonLabel + ' · ' + breakdown;
      }
      const noteSuffix = p.reasonNote ? ' — ' + p.reasonNote : '';
      return 'Loyalty roll for ' + who + ' ' + reasonLabel + ' (awaiting roll)' + noteSuffix;
    }
    default:
      return JSON.stringify(p).substring(0,80);
  }
}

// Passive investments (RR p.383). Monthly return = capital × the risk-tier rate.
function passiveInvestmentRate(tier){
  return ({safe:0.0025, cautious:0.005, balanced:0.01, risky:0.03, perilous:0.09})[tier] || 0.01;
}
function passiveInvestmentMonthlyGp(inv){
  if(!inv) return 0;
  const capital = parseInt(inv.capital)||0;
  const rate = passiveInvestmentRate(inv.riskTier);
  return Math.round(capital * rate);
}
// Pay out every enabled passive investment for the turn. Credits destination domain treasuries +
// the owner's earnings ledger. Returns { totalGp, payouts: [{name, type, gp, destination}] }.
function processPassiveInvestmentsForTurn(campaign){
  const payouts = [];
  let totalGp = 0;
  (campaign?.passiveInvestments||[]).forEach(inv => {
    if(!inv.enabled) return;
    const gp = passiveInvestmentMonthlyGp(inv);
    if(!gp || gp <= 0) return;
    const destDomainId = inv.destinationDomainId || null;
    let destLabel = 'ledger-only';
    if(destDomainId){
      const destDomain = (campaign.domains||[]).find(d => d.id === destDomainId);
      if(destDomain){
        destDomain.treasury.gp = (destDomain.treasury.gp||0) + gp;
        destLabel = destDomain.name + ' treasury';
      }
    }
    if(inv.ownerCharacterId){
      const ch = (campaign.characters||[]).find(c => c.id === inv.ownerCharacterId);
      if(ch){
        if(!Array.isArray(ch.earningsLedger)) ch.earningsLedger = [];
        ch.earningsLedger.push({
          turn: campaign.currentTurn || 1, gp: gp, kind: 'passive-investment',
          investmentId: inv.id, investmentType: inv.type, riskTier: inv.riskTier,
          capital: parseInt(inv.capital)||0, destination: destDomainId || 'ledger-only'
        });
      }
    }
    payouts.push({ name: inv.name || inv.ownerName, type: inv.type, gp, destination: destLabel });
    totalGp += gp;
  });
  return { totalGp, payouts };
}

// Apply a venture vagary's effect to a venture record (Phase 2b.5). Mutates the venture; returns a
// human-readable summary string (or null when there's nothing to apply).
function applyVagaryToVenture(campaign, venture, vp){
  if(!venture || !vp || !vp.applyEffect || vp.vagaryEffect === 'none') return null;
  const v = global.ACKS.lookupVagary(vp.vagaryId);
  if(!v) return null;
  if(!Array.isArray(venture.vagaries)) venture.vagaries = [];
  const curTurn = campaign?.currentTurn || 1;
  let summary = '';
  switch(vp.vagaryEffect){
    case 'speed-up-1':
      venture.expectedArrivalTurn = Math.max(curTurn+1, (venture.expectedArrivalTurn||0)-1);
      summary = 'Arrival accelerated to Turn '+venture.expectedArrivalTurn+'.';
      break;
    case 'delay-turns':
      venture.expectedArrivalTurn = (venture.expectedArrivalTurn||0) + (vp.vagaryEffectValue||1);
      summary = 'Arrival delayed to Turn '+venture.expectedArrivalTurn+'.';
      break;
    case 'value-bonus-pct':
      venture.totalInvestment = Math.round((venture.totalInvestment||0) * (1 + (vp.vagaryEffectValue||0)/100));
      summary = 'Cargo value boosted by '+vp.vagaryEffectValue+'% to '+venture.totalInvestment.toLocaleString()+'gp.';
      break;
    case 'value-loss-pct':
      venture.totalInvestment = Math.round((venture.totalInvestment||0) * (1 - (vp.vagaryEffectValue||0)/100));
      summary = 'Cargo value reduced by '+vp.vagaryEffectValue+'% to '+venture.totalInvestment.toLocaleString()+'gp.';
      break;
    case 'total-loss':
      venture.status = 'failed';
      venture.completedTurn = curTurn;
      venture.totalInvestment = 0;
      summary = 'Venture annihilated — total loss booked.';
      const character = (campaign?.characters||[]).find(c => c.id === venture.venturerCharacterId);
      if(character){
        if(!Array.isArray(character.earningsLedger)) character.earningsLedger = [];
        character.earningsLedger.push({ ventureId:venture.id, turn:venture.completedTurn, gp:-(venture.totalInvestment||0), kind:'venture-annihilated', fromDomainId:venture.originDomainId, toDomainId:venture.destinationDomainId, aborted:true, vagary:vp.vagaryId });
      }
      break;
  }
  venture.vagaries.push({ turn:curTurn, vagaryId:vp.vagaryId, name:vp.vagaryName, effect:vp.vagaryEffect, effectValue:vp.vagaryEffectValue||0, summary });
  return summary;
}

// Level a character up one step (XP-driven sweep or GM-forced). Mutates hp / level / hd / saves /
// henchmanCap, stamps history + a character-level-up event, and (for henchmen) auto-emits a pending
// loyalty-check (RR p.168). Returns the level-up entry, or null at the L14 cap / for an unknown class.
function levelUpCharacter(campaign, c){
  if(!c) return null;
  const oldLevel = c.level || 1;
  if(oldLevel >= 14) return null;
  const newLevel = oldLevel + 1;
  const conMod = abilityMod(c.abilities?.CON || 10);
  const hpGain = rollHpForLevel(c.class, newLevel, conMod);
  if(!c.hp) c.hp = { current:0, max:0, hitDice:'' };
  c.hp.max = (c.hp.max || 0) + hpGain;
  c.hp.current = (c.hp.current || 0) + hpGain;
  c.level = newLevel;
  const hd = CLASS_HD[classKey(c.class)];
  if(hd){
    if(newLevel <= 9){
      c.hp.hitDice = newLevel + 'd' + hd.sides;
    } else {
      const bonus = (newLevel - 9) * hd.flatBonusAfter9;
      c.hp.hitDice = '9d' + hd.sides + ' + ' + bonus + '*';
    }
  }
  const saves = computeSavingThrows(c);
  if(saves){
    if(!c.savingThrows) c.savingThrows = {};
    c.savingThrows.paralysis = saves.paralysis;
    c.savingThrows.death = saves.death;
    c.savingThrows.blast = saves.blast;
    c.savingThrows.implements = saves.implements;
    c.savingThrows.spells = saves.spells;
  }
  c.henchmanCap = computeHenchmanCap(c);
  const entry = {
    oldLevel, newLevel, hpGain, hd: c.hp.hitDice,
    saves: saves ? {paralysis:saves.paralysis,death:saves.death,blast:saves.blast,implements:saves.implements,spells:saves.spells} : null
  };
  addCharacterHistory(campaign, c, 'level-up', (c.class||'?')+' L'+oldLevel+' → L'+newLevel+' (+'+hpGain+' HP)', entry);
  recordAppliedEvent(campaign, 'character-level-up', {
    characterId: c.id, oldLevel, newLevel, hpGained: hpGain, source: 'auto',
    narrativeSummary: 'Level up: '+c.name+' — '+(c.class||'?')+' L'+oldLevel+' → L'+newLevel+' (+'+hpGain+' HP).'
  }, { result: { domainsChanged: [], hexesChanged: [], charactersChanged: [c.id], treasuryDelta: 0, narrativeSummary: 'Level up: '+c.name+' — '+(c.class||'?')+' L'+oldLevel+' → L'+newLevel+' (+'+hpGain+' HP).' } });
  // RAW (RR p.168): henchmen roll loyalty each time they advance a level. Auto-emit a pending
  // loyalty-check event for the GM to resolve via the Roll Loyalty modal.
  if(isHenchman(c)){
    if(campaign){
      if(!Array.isArray(campaign.pendingEvents)) campaign.pendingEvents = [];
      const pending = global.ACKS.newEvent('loyalty-check', {
        submittedBy: 'engine',
        submittedAt: new Date().toISOString(),
        targetTurn: (campaign.currentTurn || 1) + 1,
        payload: { characterId: c.id, reason: 'level-up', reasonNote: 'Level-up to L'+newLevel+' (RR p.168 requires loyalty roll).' }
      });
      pending.status = global.ACKS.EVENT_STATUS.PENDING;
      campaign.pendingEvents.push(pending);
    }
  }
  return entry;
}
// Walk all alive characters; level-up anyone whose XP meets/exceeds their next threshold (loops for
// multi-level catch-up). Returns [{character, levelUps:[entry,...]}].
function checkAllCharacterLevelUps(campaign){
  const results = [];
  (campaign?.characters || []).forEach(c => {
    if(c.alive === false) return;
    if(c.autoAdvance === false) return;
    if(!XP_PROGRESSION[classKey(c.class)]) return;
    const levelUps = [];
    let guard = 20;
    while(guard-- > 0){
      const next = xpToNextLevel(c);
      if(next === null || next === Infinity) break;
      if((c.xp || 0) < next) break;
      const entry = levelUpCharacter(campaign, c);
      if(!entry) break;
      levelUps.push(entry);
    }
    if(levelUps.length > 0) results.push({ character:c, levelUps });
  });
  return results;
}

// ─── Cost of Living (Phase 2.5 §16 CoL-2 — RR p.173 + p.168) ─────────────────────────────────────
// The end-of-month keep pass, run from commitTurn AFTER domains + passive investments bank income
// (RR: a ruler banks his domain income before paying his own keep). Two independent line items per
// the §16.6 payer taxonomy:
//   (1) Self-supporting characters (PCs / independent NPCs) pay their OWN living expenses =
//       min(target wage, funds on hand) — NO debt; effectiveSocialLevel is set from what they actually
//       spent (RR p.173: an underspender is taken for a lower level by NPCs → feeds the hiring cap + loyalty).
//   (2) A liege pays the monthly WAGE of each henchman/specialist bound to him (the long-open Stash C.4
//       outflow). RAW carve-out (RR p.168): a vassal-ruling henchman whose domain income ≥ his wage owes
//       nothing. The henchman takes NO self-debit (the wage IS his keep), so his effectiveSocialLevel = null
//       (apparent = true level).
// Pay source per payer (Joachim 2026-06-08 — one setting governs his keep AND the wages he owes): the
// treasury of a domain he rules (the DEFAULT for a ruler — payKeepFromTreasury defaults on; only an
// explicit false opts him out to his coin purse), or his coin purse when he rules no domain. Routed
// through the GP Wave B wealth-transfer grammar (applyWealthTransfer MOVES; recordWealthTransfer logs,
// campaignLogHidden so the routine debit stays in the Event Log audit but off the narrative Campaign Log).
// Gated on `living-expenses` (default ON via the registry default); OFF ⇒ no debits + apparent = true level.
//   opts.dryRun: compute the charges WITHOUT moving gp / setting fields (the proposeMonthlyTurn preview).
// Returns { ruleOn, charges:[{charId,name,kind,trueLevel?,target?,wage?,paid,effectiveLevel?,liegeId?,waived?}], totalGp }.
// Shared wage helpers (CoL-2, RR p.168) — used by both the monthly living-expenses pass and the
// per-character Expenses breakdown so the two never drift. A henchman/specialist's monthly wage is
// his explicit monthlyWage when set, else the wage of his level (RR p.168 table).
function henchmanMonthlyWage(campaign, c){
  const A = global.ACKS || {};
  return (c && c.monthlyWage > 0) ? c.monthlyWage : (A.levelMonthlyWage ? A.levelMonthlyWage(c ? c.level : 0) : 0);
}
// RAW carve-out (RR p.168): a henchman given a domain to rule as a vassal owes no wage when that
// domain's income ≥ his wage. Returns the waiver reason string, or null when the wage is owed.
function henchmanWageWaiver(campaign, c){
  const A = global.ACKS || {};
  const ruled = ((campaign && campaign.domains) || []).find(d => d && d.rulerCharacterId === (c && c.id));
  if(!ruled) return null;
  let income = 0; try { income = A.monthlyNet ? A.monthlyNet(campaign, ruled) : 0; } catch(e){ income = 0; }
  return (income >= henchmanMonthlyWage(campaign, c)) ? 'domain-income' : null;
}

function processLivingExpensesForTurn(campaign, opts){
  opts = opts || {};
  const A = global.ACKS || {};
  const dryRun = !!opts.dryRun;
  const chars = (campaign && campaign.characters) || [];
  const out = { ruleOn: false, charges: [], totalGp: 0 };
  out.ruleOn = isHouseRuleEnabled(campaign, 'living-expenses');
  const active = (c) => A.isActive ? A.isActive(c)
    : (c && c.alive !== false && c.kind !== 'candidate' && c.lifecycleState !== 'candidate' && c.lifecycleState !== 'deceased');
  if(!out.ruleOn){
    if(!dryRun) for(const c of chars){ if(c) c.effectiveSocialLevel = null; }   // OFF ⇒ apparent = true level
    return out;
  }
  const wageFor = (c) => henchmanMonthlyWage(campaign, c);
  // The pay handle (a ruler's domain treasury if he opted in, else his purse) + its available gp.
  const payHandle = (payer) => {
    // Default-on for rulers: absent/null ⇒ treasury; only an explicit false opts the ruler out to his
    // purse. A non-ruler can't draw a treasury — the find below returns nothing, so we fall through.
    if(payer && payer.payKeepFromTreasury !== false){
      const dom = (campaign.domains || []).find(d => d && d.rulerCharacterId === payer.id);
      if(dom){
        const gp = A.domainTreasuryGp ? A.domainTreasuryGp(campaign, dom.id) : ((dom.treasury && dom.treasury.gp) || 0);
        return { handle:{ kind:'treasury', id: dom.id }, available: Math.max(0, gp) };
      }
    }
    const gp = (payer && payer.coins) ? (Number(payer.coins.gp) || 0) : (Number(payer && payer.personalGp) || 0);
    return { handle:{ kind:'character-gp', id: payer.id }, available: Math.max(0, gp) };
  };
  // Move up to `amount` gp out of the payer's handle to the world (no debt — clamp to funds). Returns paid.
  const pay = (payer, amount, reason, bucket) => {
    if(!payer || amount <= 0) return 0;
    const ph = payHandle(payer);
    const amt = Math.min(amount, ph.available);
    if(amt <= 0) return 0;
    if(dryRun) return amt;
    const spec = { amount: amt, source: ph.handle, destination:{ kind:'external', label: reason }, allowOverdraft:false, reason, bucket };
    try {
      if(A.applyWealthTransfer) A.applyWealthTransfer(campaign, spec);
      if(A.recordWealthTransfer) A.recordWealthTransfer(campaign, spec, { submittedBy:'engine', campaignLogHidden:true });
    } catch(e){ return 0; }
    return amt;
  };

  // (1) Self-supporting characters pay their own living expenses.
  for(const c of chars){
    if(!c || !active(c)) continue;
    if(isFollower(c) || isMercenaryOfficer(c)){ if(!dryRun) c.effectiveSocialLevel = null; continue; }  // no self-keep
    if((isHenchman(c) || isSpecialist(c)) && c.liegeCharacterId){ if(!dryRun) c.effectiveSocialLevel = null; continue; } // liege-paid (pass 2)
    const trueLevel = c.level || 0;
    const targetLevel = (c.lifestyleTargetLevel != null) ? c.lifestyleTargetLevel : trueLevel;
    const target = A.levelMonthlyWage ? A.levelMonthlyWage(targetLevel) : 0;
    const paid = pay(c, target, 'Living expenses', 'living-expenses');
    // RR p.173 is downward-only: underspending drops you to the level your spend covers; overspending
    // does NOT raise you above your true level (the profligate "fool a henchman" is a Judge-discretion
    // bluff, RR p.170, not a cap-raise). So cap the apparent level at the true level.
    const eff = A.effectiveSocialLevelForSpend ? Math.min(trueLevel, A.effectiveSocialLevelForSpend(paid)) : trueLevel;
    if(!dryRun){ c.lastLivingExpensePaidGp = paid; c.effectiveSocialLevel = eff; }
    out.charges.push({ charId: c.id, name: c.name, kind:'living-expenses', trueLevel, targetLevel, target, paid, effectiveLevel: eff });
    out.totalGp += paid;
  }
  // (2) Lieges pay the monthly wage of each henchman/specialist bound to them (Stash C.4 outflow).
  for(const c of chars){
    if(!c || !active(c)) continue;
    if(!((isHenchman(c) || isSpecialist(c)) && c.liegeCharacterId)) continue;
    const liege = chars.find(x => x && x.id === c.liegeCharacterId);
    if(!liege) continue;
    const wage = wageFor(c);
    const waived = henchmanWageWaiver(campaign, c);   // RR p.168 carve-out: vassal domain income ≥ wage
    if(waived){ out.charges.push({ charId: c.id, name: c.name, liegeId: liege.id, kind:'henchman-wage', wage, paid:0, waived }); continue; }
    const paid = pay(liege, wage, 'Wage: ' + (c.name || c.id), 'henchman-wage');
    out.charges.push({ charId: c.id, name: c.name, liegeId: liege.id, kind:'henchman-wage', wage, paid });
    out.totalGp += paid;
  }
  return out;
}

// The level a character APPEARS to be to NPCs (RR p.173) — the apparent/social level the henchman
// hiring cap + loyalty read. RAW is DOWNWARD ONLY: "Adventurers who do not spend at least this much
// are considered to be of LOWER level (equivalent to what they do spend)" (RR p.173). Overspending does
// NOT mechanically raise you above your true level — a profligate "might be able to fool a powerful
// henchman" (RR p.170) but that's a Judge-discretion bluff (with its own loyalty-roll catch), not an
// automatic cap-raise. So apparent = min(true level, what the spend bought). null / rule off ⇒ true level.
function apparentLevel(campaign, char){
  if(!char) return 0;
  const trueLevel = char.level || 0;
  if(!isHouseRuleEnabled(campaign, 'living-expenses')) return trueLevel;
  return (char.effectiveSocialLevel != null) ? Math.min(trueLevel, char.effectiveSocialLevel) : trueLevel;
}
// RR p.170: if a henchman concludes he is more powerful than his (apparent) employer, it triggers an
// immediate Loyalty roll at −1 per apparent level of difference. Returns the loyalty modifier (≤ 0).
function apparentLevelLoyaltyPenalty(campaign, henchman, employer){
  if(!henchman || !employer) return 0;
  const hl = henchman.level || 0;
  const al = apparentLevel(campaign, employer);
  return (hl > al) ? -(hl - al) : 0;
}

// Per-character monthly expense breakdown (CoL-2, RR p.173 + p.168) — a read-only view for the
// character sheet's Expenses tab: the character's own lifestyle keep (counted toward the total only
// when the rule is on AND the character is self-supporting) plus the wages it pays as a liege to its
// bound henchmen/specialists, and the total. Mirrors processLivingExpensesForTurn without mutating.
function characterExpenseBreakdown(campaign, char){
  const A = global.ACKS || {};
  const ch = (typeof char === 'string') ? ((campaign && campaign.characters) || []).find(c => c && c.id === char) : char;
  const out = { ruleOn:false, selfSupporting:false, lifestyle:null, henchmen:[], henchmenTotal:0, lifestyleGp:0, total:0 };
  if(!ch || !campaign) return out;
  out.ruleOn = isHouseRuleEnabled(campaign, 'living-expenses');
  const active = (c) => A.isActive ? A.isActive(c)
    : (c && c.alive !== false && c.lifecycleState !== 'candidate' && c.lifecycleState !== 'deceased');
  // (1) The character's own lifestyle keep. Only self-supporting characters pay it — a liege-paid
  //     henchman/specialist, a follower, or a mercenary officer pays none (the liege covers them).
  out.selfSupporting = !(isFollower(ch) || isMercenaryOfficer(ch) || ((isHenchman(ch) || isSpecialist(ch)) && ch.liegeCharacterId));
  const trueLevel = ch.level || 0;
  const targetLevel = (ch.lifestyleTargetLevel != null) ? ch.lifestyleTargetLevel : trueLevel;
  const targetWage = A.levelMonthlyWage ? A.levelMonthlyWage(targetLevel) : 0;
  out.lifestyle = { targetLevel, targetWage, lastPaid: ch.lastLivingExpensePaidGp || 0 };
  out.lifestyleGp = (out.ruleOn && out.selfSupporting) ? targetWage : 0;
  // (2) Wages this character pays as a liege to its bound henchmen + specialists (the RR p.168 bill).
  for(const c of ((campaign.characters) || [])){
    if(!c || !active(c)) continue;
    if(!((isHenchman(c) || isSpecialist(c)) && c.liegeCharacterId === ch.id)) continue;
    const wage = henchmanMonthlyWage(campaign, c);
    const waived = henchmanWageWaiver(campaign, c);
    const due = waived ? 0 : wage;
    out.henchmen.push({ id:c.id, name:c.name, level:c.level || 0, role: isSpecialist(c) ? 'specialist' : 'henchman', wage, waived, due });
    out.henchmenTotal += due;
  }
  out.total = out.lifestyleGp + out.henchmenTotal;
  return out;
}

// =============================================================================
// Favors & Duties (#230, F&D-1 — RR pp.345–348) — the monthly orchestrator.
// Called from commitTurn when the favor-duty-auto-roll rule is on (default ON). Once per
// month, per active vassalage:
//   PHASE 0 — lapse one-time favors whose month has ended (status → 'one-time-spent'); runs before A.
//   PHASE A — roll 1d20 on the Favor/Duty table; create the obligation (or, on 9–12, revoke
//             the most-recent favor/duty); apply the one-time on-grant gp flow (Loan principal,
//             Gift); on a duty, check the favor/duty balance and fire the excess-duty Loyalty
//             roll at the cumulative −1; emit a record-only favor-duty event.
//   PHASE B — apply the recurring monthly gp flows for active ongoing gp duties: Scutage
//             (vassal → lord each month), Construction (vassal self-spend = monthly tribute,
//             auto-revokes at 15,000gp / 6-mile hex), and the Loan CHA% repayment check.
// All gp moves go through _applyDomainTreasuryDelta (the canonical treasury setter — keeps the
// treasury stash + scalar in sync). Cross-subsystem effects with no shipped target (Call to Arms,
// Troops, Office, Charter, Council, Grant of Land) are recorded with a GM-resolve note only.
// =============================================================================

// Build the GM-resolve note for an edict whose downstream effect isn't automated yet.
function _favorDutyResolveNote(entry, ctx){
  const base = entry.summary || '';
  switch(entry.kind){
    case 'call-to-arms':
      return base + ' GM: resolve the muster via Phase 3 Military (muster ' + (ctx.musterTitle || 'baron') + '-paced).';
    case 'call-to-council':
      return base + ' GM: the vassal ruler is away at the lord’s court until this is revoked.';
    case 'troops':
      return base + ' GM: place the stationed garrison under the vassal (Phase 3 Military).';
    case 'office':
      return base + ' The +1 to the holder’s vassals’ loyalty rolls applies automatically (RR p.348). GM: if the lord’s realm is senatorial, the holder is owed a senate seat (RR p.355 — deferred to the senatorial-realms phase).';
    case 'charter-of-monopoly':
      return base + ' GM: apply the merchandise monopoly in M&M (2× volume, +1 price step).';
    case 'grant-of-land':
      return base + ' GM: generate + assign the new domain (Domain creation).';
    case 'construction':
      return base + ' GM: author the structures via the Construction Wizard; the engine debits the monthly gp + auto-revokes at the cap.';
    default:
      return base;
  }
}

// Move gp between two domain treasuries (or self-debit when `to` is null), recording the flow.
// Returns the flow descriptor for the event payload, or null if nothing moved.
function _favorDutyMoveGp(campaign, fromDomain, toDomain, amount, reason, flows){
  const amt = Math.round(Number(amount) || 0);
  if(amt <= 0) return null;
  if(fromDomain) _applyDomainTreasuryDelta(campaign, fromDomain, -amt, { reason: reason, label: 'favor-duty: ' + reason });
  if(toDomain)   _applyDomainTreasuryDelta(campaign, toDomain,   +amt, { reason: reason, label: 'favor-duty: ' + reason });
  const flow = { from: fromDomain ? fromDomain.id : null, to: toDomain ? toDomain.id : null, amount: amt, reason };
  if(Array.isArray(flows)) flows.push(flow);
  return flow;
}

// Resolve (vassalDomain, liegeDomain) for an obligation from its active vassalage — mirrors the
// Phase B / edict-core resolution. liegeDomain is null if the vassalage is gone.
function _favorDutyDomainsFor(campaign, rec){
  const vassalDomain = (campaign.domains || []).find(d => d.id === rec.vassalDomainId) || null;
  const v = (campaign.vassalages || []).find(x => x && x.status === 'active'
    && x.vassalDomainId === rec.vassalDomainId && x.suzerainCharacterId === rec.liegeCharacterId);
  const liegeDomain = v ? ((campaign.domains || []).find(d => d.id === v.suzerainDomainId) || null) : null;
  return { vassalDomain, liegeDomain };
}

// RR p.348 — "The loan is repaid when the duty is revoked." When an active Loan obligation that was
// actually GIVEN (loanGivenAtTurn set) is revoked by any path (manual revoke OR the 1d20 9–12
// table-revocation), the lord returns the principal to the vassal (lord → vassal). Returns the gp
// flow, or null for a non-loan / never-given / zero-amount loan. Mutates treasuries; does NOT
// revoke (the caller owns that, so the order of operations stays explicit at each call site).
function _favorDutyRepayLoanOnRevoke(campaign, rec){
  if(!rec || rec.kind !== 'loan' || rec.loanGivenAtTurn == null) return null;
  const amt = Math.round(Number(rec.gpPerMonth) || 0);
  if(amt <= 0) return null;
  const { vassalDomain, liegeDomain } = _favorDutyDomainsFor(campaign, rec);
  return _favorDutyMoveGp(campaign, liegeDomain, vassalDomain, amt, 'loan-repaid', null);   // lord → vassal
}

// Office favor (RR p.348, F&D-8) — a character whose LIEGE holds an active Office favor gets a **+1 to
// their own loyalty rolls** (the office raises the holder's prestige, so his vassals are more loyal to
// him). The character must be a vassal ruler under that liege; the bonus does NOT stack across multiple
// offices the liege holds (still +1). Returns 0 or +1. Use it as a situational modifier on any loyalty
// roll the character makes (it's added in _favorDutyLoyaltyRoll + surfaced in the manual Loyalty modal).
function officeLoyaltyBonusFor(campaign, characterId){
  if(!campaign || !characterId) return 0;
  const v = (campaign.vassalages || []).find(x => x && x.status === 'active' && x.vassalRulerCharacterId === characterId);
  const liegeId = v ? v.suzerainCharacterId : null;
  if(!liegeId) return 0;
  const liegeHoldsOffice = (campaign.favorDutyObligations || []).some(o => o && o.status === 'active' && o.kind === 'office' && o.vassalRulerCharacterId === liegeId);
  return liegeHoldsOffice ? 1 : 0;
}

// Fire one Loyalty roll on the vassal ruler (RR p.168 + p.347–348). Rolls 2d6 from the passed rng
// (deterministic for tests), applies the loyaltyDelta to the ruler's loyalty (clamped −4..+4 per RAW
// p.166), and records it on the character's loyaltyHistory. opts.reason / opts.reasonNote override the
// default (over-demanded duties) — the scutage-misappropriation check passes its own. The Office-favor
// +1 (RR p.348, F&D-8) is folded into the modifier when this ruler's liege holds an office. Returns the roll.
function _favorDutyLoyaltyRoll(campaign, vassalRulerCharacterId, modifier, rng, opts){
  rng = rng || Math.random; opts = opts || {};
  const ch = (campaign.characters || []).find(c => c.id === vassalRulerCharacterId) || null;
  const loyaltyScore = ch ? (ch.loyalty || 0) : 0;
  const officeBonus = officeLoyaltyBonusFor(campaign, vassalRulerCharacterId);   // RR p.348 Office favor (F&D-8)
  const effMod = (Number(modifier) || 0) + officeBonus;
  const d1 = 1 + Math.floor(rng() * 6), d2 = 1 + Math.floor(rng() * 6);
  const rr = global.ACKS.rollLoyalty(loyaltyScore, effMod, { d1, d2 });
  if(ch){
    const before = Number(ch.loyalty || 0);
    const after = Math.max(-4, Math.min(4, before + Number(rr.loyaltyDelta || 0)));
    ch.loyalty = after;
    if(!Array.isArray(ch.loyaltyHistory)) ch.loyaltyHistory = [];
    ch.loyaltyHistory.push({
      turn: campaign.currentTurn || 1, delta: after - before, reason: opts.reason || 'favor-duty-excess',
      reasonNote: (opts.reasonNote || 'over-demanded duties (RR p.347)') + (officeBonus ? ' [+1 office, RR p.348]' : ''),
      rollResult: rr, outcome: rr.bandKey, newValue: after
    });
  }
  return rr;
}

// Emit a record-only favor-duty event carrying the Event.context envelope (vassal domain hex
// + liege/vassal characters + the vassal domain). Pushes an already-applied entry to the eventLog.
function _emitFavorDutyEvent(campaign, obligation, payloadExtra){
  const vassalDomainId = obligation.vassalDomainId;
  const hexId = ((campaign.hexes || []).find(h => h && h.domainId === vassalDomainId) || {}).id || null;
  const ev = global.ACKS.newEvent('favor-duty', {
    submittedBy: 'engine',
    targetTurn: campaign.currentTurn || 1,
    cadence: 'monthly-turn',
    payload: Object.assign({
      kind: obligation.kind,
      vassalDomainId: vassalDomainId,
      obligationId: obligation.id,
      liegeCharacterId: obligation.liegeCharacterId,
      vassalRulerCharacterId: obligation.vassalRulerCharacterId,
      isFavor: obligation.isFavor,
      isOngoing: obligation.isOngoing,
      roll: obligation.roll,
      gpPerMonth: obligation.gpPerMonth
    }, payloadExtra || {})
  });
  global.ACKS.setEventContext(ev, {
    primaryHexId: hexId,
    domainId: vassalDomainId,
    relatedEntities: [
      obligation.liegeCharacterId ? { kind:'character', id: obligation.liegeCharacterId, role:'liege' } : null,
      obligation.vassalRulerCharacterId ? { kind:'character', id: obligation.vassalRulerCharacterId, role:'vassal' } : null,
      { kind:'domain', id: vassalDomainId, role:'subject' }
    ].filter(Boolean)
  });
  ev.status = global.ACKS.EVENT_STATUS.APPLIED;
  ev.appliedAtTurn = campaign.currentTurn || 1;
  if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
  campaign.eventLog.push({ event: ev, result: { narrativeSummary: (payloadExtra && payloadExtra.narrative) || (obligation.kind + ' edict') }, appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
  return ev;
}

// The shared per-edict core (RR pp.345–348). Given a resolved (liege, vassal) context + a chosen
// table entry, it: computes the gp basis, creates the obligation, runs the one-time on-grant gp
// flows (loan principal / gift), derives the favor/duty balance, fires the single excess-duty
// Loyalty roll when a duty over-demands, and emits the record-only favor-duty event. BOTH the
// monthly auto-roll (processFavorsAndDutiesForTurn PHASE A) and the manual GM-pick path
// (applyFavorDutyEdictByKind) call this — so an edict is identical however it was raised. `roll`
// is the 1d20 result for an auto-roll, or null for a hand-picked edict. Returns the snapshot
// { obligation, gpPerMonth, gpFlows, balance, loyaltyResult, musterTitle, musterSchedule, narrative }.
function _applyFavorDutyEdict(campaign, ctx, rng){
  rng = rng || Math.random;
  const { liegeId, vassalDomainId, vassalRulerId, vassalDomain, liegeDomain, entry, currentTurn } = ctx;
  const roll = ctx.roll != null ? ctx.roll : null;

  // Compute the gp amount: a GM amount override (RR p.345 — "a lord may always choose to demand
  // less when demanding a duty"; a favor's value may likewise be set), else the RAW basis. The
  // amount is stored on the obligation, so it governs BOTH the on-grant flow and the recurring
  // Phase B billing. A no-gp standard kind ignores the override; a 'custom' edict's amount is
  // entirely GM-supplied (ctx.amountOverride).
  const realmFamilies = realmFamiliesForDomain(campaign, vassalDomain);
  let gpPerMonth, scutageGpPerFamily = null;
  if(entry.kind === 'scutage'){
    // Scutage is a per-family RATE (RR p.347 — "1gp per family in the vassal's realm"); the monthly amount
    // is DERIVED LIVE (scutageMonthlyGp = rate × current realm families) so it tracks population. We store
    // the rate; gpPerMonth is only the demand-month snapshot. The override is the *rate* (ctx.scutageGpPerFamily,
    // default 1gp/family — a lower rate is "demand less", RR p.345); a legacy total (ctx.amountOverride) is
    // converted to an equivalent per-family rate at demand time.
    if(ctx.scutageGpPerFamily != null) scutageGpPerFamily = Math.max(0, Number(ctx.scutageGpPerFamily));
    else if(ctx.amountOverride != null) scutageGpPerFamily = realmFamilies > 0 ? Math.max(0, Number(ctx.amountOverride)) / realmFamilies : 0;
    else scutageGpPerFamily = 1;
    gpPerMonth = Math.round(scutageGpPerFamily * realmFamilies);
  } else if(entry.kind === 'custom'){
    gpPerMonth = Math.max(0, Math.round(Number(ctx.amountOverride) || 0));
  } else if(ctx.amountOverride != null && entry.gpBasis !== 'none'){
    gpPerMonth = Math.max(0, Math.round(Number(ctx.amountOverride)));
  } else if(entry.gpBasis === 'realm-families'){
    gpPerMonth = realmFamilies;                                                                   // 1gp × realm families
  } else if(entry.gpBasis === 'monthly-tribute'){
    gpPerMonth = global.ACKS.tributeOwed(campaign, vassalDomain);
  } else {
    gpPerMonth = 0;
  }

  const musterTitle = entry.muster ? global.ACKS.realmTitleForDomain(liegeDomain) : '';
  // Call to Council (RR p.346) — the vassal must attend the lord at a hex in the lord's domain.
  // The location defaults to where the lord is now (the liege ruler's current hex), else the
  // liege domain's first hex; a GM-supplied ctx.councilHexId (the location picker) overrides.
  let councilHexId = null;
  if(entry.kind === 'call-to-council'){
    if(ctx.councilHexId){
      councilHexId = ctx.councilHexId;
    } else {
      const liegeRuler = (campaign.characters || []).find(c => c && c.id === liegeId) || null;
      councilHexId = (liegeRuler && liegeRuler.currentHexId)
        || ((((campaign.hexes || []).find(h => h && h.domainId === (liegeDomain && liegeDomain.id))) || {}).id)
        || null;
    }
  }
  const obligation = createFavorDutyObligation(campaign, {
    liegeCharacterId: liegeId, vassalDomainId, vassalRulerCharacterId: vassalRulerId,
    kind: entry.kind, isFavor: entry.isFavor, isOngoing: entry.isOngoing,
    gpPerMonth, musterTitle, roll, grantedAtTurn: currentTurn, councilHexId, scutageGpPerFamily,
    officeTitle: entry.kind === 'office' ? (ctx.officeTitle || '') : '',
    customLabel: entry.kind === 'custom' ? (ctx.customLabel || entry.label || '') : '',
    notes: entry.kind === 'custom' ? (ctx.customLabel || '') : _favorDutyResolveNote(entry, { musterTitle })
  });

  // STEP 4 — one-time on-grant gp flows (the recurring ones run in Phase B, incl. this month).
  // NB a Loan moves NO gp on grant (RR p.348 — the lord *demands* the loan; the vassal provides it
  // as a separate act). The principal moves only when the vassal gives it (giveLoanObligation:
  // vassal → lord), and is repaid on revoke or via the monthly CHA% check (lord → vassal).
  const flows = [];
  if(entry.kind === 'gift' && gpPerMonth > 0){
    _favorDutyMoveGp(campaign, liegeDomain, vassalDomain, gpPerMonth, 'gift', flows);             // lord → vassal, once
  } else if(entry.kind === 'custom' && !entry.isOngoing && gpPerMonth > 0){
    // a one-time custom edict moves gp once on grant: a favor pushes lord→vassal, a duty pulls vassal→lord
    // (an *ongoing* custom edict with gp recurs in Phase B instead — no on-grant move, to avoid double-billing)
    if(entry.isFavor) _favorDutyMoveGp(campaign, liegeDomain, vassalDomain, gpPerMonth, 'custom-favor', flows);
    else              _favorDutyMoveGp(campaign, vassalDomain, liegeDomain, gpPerMonth, 'custom-duty', flows);
  }

  // Balance + the excess-duty Loyalty roll (duties only — favors never over-demand).
  let loyaltyResult = null;
  const balance = favorDutyBalance(campaign, liegeId, vassalDomainId, { turn: currentTurn });
  if(!entry.isFavor && balance.excess > 0){
    loyaltyResult = _favorDutyLoyaltyRoll(campaign, vassalRulerId, balance.loyaltyModifier, rng);
  }

  const musterSched = entry.muster ? global.ACKS.musterSchedule(musterTitle, gpPerMonth) : null;
  const verb = entry.isFavor ? 'granted ' : 'demanded ';
  const gpStr = gpPerMonth > 0 ? ' (' + gpPerMonth.toLocaleString() + 'gp)' : '';
  const narrative = verb + entry.label + ' on ' + (vassalDomain.name || vassalDomainId) + gpStr + '.';
  _emitFavorDutyEvent(campaign, obligation, {
    action: 'granted', roll, gpPerMonth, gpFlows: flows,
    balance, loyaltyResult, musterTitle, musterSchedule: musterSched, narrative
  });
  return { obligation, gpPerMonth, gpFlows: flows, balance, loyaltyResult, musterTitle, musterSchedule: musterSched, narrative };
}

// Manually raise a Favor/Duty edict — the GM-pick path used by the F&D UI (and whenever
// favor-duty-auto-roll is off). Resolves the liege + vassal ruler + both domains from the vassal's
// active vassalage; runs the same shared core as the monthly pass (roll = null — it wasn't rolled).
// Does NOT gate on favor-duty-auto-roll (F&D is RAW core — manual edicts are always available).
//   opts.kind         — a 1d20-table kind, OR 'custom' for a freeform edict (RR p.345 — the Judge may
//                       devise additional favors/duties). 'revocation' is roll-only (returns null).
//   opts.gpPerMonth   — optional amount override (RR p.345 "a lord may always choose to demand less");
//                       default = the RAW basis. Ignored for a no-gp standard kind; required-ish for custom.
//   opts.customLabel / opts.isFavor / opts.isOngoing — for kind:'custom' (the GM-authored edict's shape).
// Returns the edict snapshot, or null when the domain has no active liege or the kind is unknown.
function applyFavorDutyEdictByKind(campaign, opts, options){
  opts = opts || {}; options = options || {};
  const rng = options.rng || Math.random;
  const vassalDomainId = opts.vassalDomainId;
  if(!campaign || !vassalDomainId) return null;
  const v = (campaign.vassalages || []).find(x => x && x.status === 'active' && x.vassalDomainId === vassalDomainId
    && (!opts.liegeCharacterId || x.suzerainCharacterId === opts.liegeCharacterId));
  if(!v) return null;                                    // no active liege → nothing to demand/grant
  const vassalDomain = (campaign.domains || []).find(d => d.id === vassalDomainId) || null;
  const liegeDomain  = (campaign.domains || []).find(d => d.id === v.suzerainDomainId) || null;
  if(!vassalDomain) return null;

  // The table entry — a standard 1d20 kind, or a synthetic 'custom' entry (gpBasis 'none' → the
  // amount is entirely GM-supplied; isFavor/isOngoing are the GM's; label = the custom label).
  let entry, customLabel = '';
  if(opts.kind === 'custom'){
    customLabel = String(opts.customLabel || '').trim();
    entry = { kind: 'custom', isFavor: !!opts.isFavor, isOngoing: !!opts.isOngoing, gpBasis: 'none',
      muster: false, label: customLabel || (opts.isFavor ? 'Custom favor' : 'Custom duty'), summary: customLabel };
  } else {
    entry = (global.ACKS.FAVOR_DUTY_TABLE || []).find(e => e.kind === opts.kind);
    if(!entry || entry.kind === 'revocation') return null; // unknown kind, or the roll-only revocation
  }

  const currentTurn = options.atTurn != null ? options.atTurn : (campaign.currentTurn || 1);
  return _applyFavorDutyEdict(campaign, {
    liegeId: v.suzerainCharacterId, vassalDomainId, vassalRulerId: v.vassalRulerCharacterId,
    vassalDomain, liegeDomain, entry, roll: null, currentTurn,
    amountOverride: opts.gpPerMonth != null ? opts.gpPerMonth : null,
    scutageGpPerFamily: opts.scutageGpPerFamily != null ? opts.scutageGpPerFamily : null,
    councilHexId: opts.councilHexId || null,
    officeTitle: opts.officeTitle || '',
    customLabel
  }, rng);
}

// Manually revoke an active Favor/Duty obligation AND emit the favor-duty event (the bare
// revokeFavorDutyObligation setter only flips status — it does not emit). Used by the F&D UI's
// per-obligation Revoke. Idempotent: returns the record unchanged (no event) if it isn't active.
function revokeFavorDutyEdict(campaign, obligationId, options){
  options = options || {};
  const rec = (campaign && Array.isArray(campaign.favorDutyObligations))
    ? campaign.favorDutyObligations.find(o => o.id === obligationId) : null;
  if(!rec || rec.status !== 'active') return rec || null;
  const atTurn = options.atTurn != null ? options.atTurn : (campaign.currentTurn || 1);
  // RR p.348 — revoking a GIVEN Loan repays the principal (lord → vassal) first.
  const repayFlow = _favorDutyRepayLoanOnRevoke(campaign, rec);
  revokeFavorDutyObligation(campaign, obligationId, atTurn, options.reason || 'gm-revoked');
  const dname = ((campaign.domains || []).find(d => d.id === rec.vassalDomainId) || {}).name || rec.vassalDomainId;
  const narrative = repayFlow
    ? 'Revoked loan on ' + dname + ' — ' + repayFlow.amount.toLocaleString() + 'gp repaid to the vassal.'
    : 'Revoked ' + rec.kind + ' (' + (rec.isFavor ? 'favor' : 'duty') + ') on ' + dname + '.';
  _emitFavorDutyEvent(campaign, rec, { action:'revoked', gpFlows: repayFlow ? [repayFlow] : [], narrative });
  return rec;
}

// Give (fund) a demanded Loan duty — the vassal-side act that actually moves the money (RR p.348:
// the lord demands the loan; the vassal provides it). Transfers gpPerMonth from the vassal's realm
// treasury to the liege's, stamps loanGivenAtTurn (so the monthly CHA% repayment check + revoke-
// repays-the-principal both engage), records the funding in history, and emits the favor-duty event.
// Idempotent / guarded: a non-loan, inactive, or already-given obligation is returned unchanged
// (no money moves). Returns the obligation record, or null when it doesn't exist.
function giveLoanObligation(campaign, obligationId, options){
  options = options || {};
  const rec = (campaign && Array.isArray(campaign.favorDutyObligations))
    ? campaign.favorDutyObligations.find(o => o.id === obligationId) : null;
  if(!rec) return null;
  if(rec.status !== 'active' || rec.kind !== 'loan' || rec.loanGivenAtTurn != null) return rec;  // guarded no-op
  const atTurn = options.atTurn != null ? options.atTurn : (campaign.currentTurn || 1);
  const amt = Math.round(Number(rec.gpPerMonth) || 0);
  const { vassalDomain, liegeDomain } = _favorDutyDomainsFor(campaign, rec);
  const flows = [];
  if(amt > 0) _favorDutyMoveGp(campaign, vassalDomain, liegeDomain, amt, 'loan-principal', flows);  // vassal → lord
  rec.loanGivenAtTurn = atTurn;
  if(!Array.isArray(rec.history)) rec.history = [];
  rec.history.push({ turn: atTurn, type: 'loan-given', amount: amt });
  const dname = (vassalDomain && vassalDomain.name) || rec.vassalDomainId;
  _emitFavorDutyEvent(campaign, rec, { action:'loan-given', gpFlows: flows,
    narrative: 'Loan of ' + amt.toLocaleString() + 'gp given by ' + dname + ' to its liege.' });
  return rec;
}

// Turn scutage auto-pay on/off — the vassal-side toggle (RR pp.347–348). Scutage is a recurring monthly
// tax (1gp/family); rather than re-paying each month, the vassal sets it to pay AUTOMATICALLY: with
// scutageAutoPay true the monthly turn bills it as the vassal's GARRISON EXPENSE (so the net debits it +
// it counts toward garrison adequacy, RR p.347) and CREDITS the lord, every month until stopped; false =
// withheld (the liege card shows a notice). The "Pay Scutage" button turns it on; "Stop Paying" turns it
// off. Idempotent (already in that state → no-op, no duplicate event). Guarded: a non-scutage / inactive
// obligation is a no-op. Returns the obligation record, or null when it doesn't exist.
function setScutageAutoPay(campaign, obligationId, on, options){
  options = options || {};
  const rec = (campaign && Array.isArray(campaign.favorDutyObligations))
    ? campaign.favorDutyObligations.find(o => o.id === obligationId) : null;
  if(!rec) return null;
  if(rec.status !== 'active' || rec.kind !== 'scutage') return rec;          // guarded no-op
  const want = !!on;
  if(!!rec.scutageAutoPay === want) return rec;                              // already in that state
  const atTurn = options.atTurn != null ? options.atTurn : (campaign.currentTurn || 1);
  rec.scutageAutoPay = want;
  if(!Array.isArray(rec.history)) rec.history = [];
  rec.history.push({ turn: atTurn, type: want ? 'scutage-autopay-on' : 'scutage-autopay-off' });
  const dname = ((campaign.domains || []).find(d => d.id === rec.vassalDomainId) || {}).name || rec.vassalDomainId;
  _emitFavorDutyEvent(campaign, rec, { action: want ? 'scutage-autopay-on' : 'scutage-autopay-off',
    narrative: want
      ? (dname + ' now pays scutage automatically each month (it settles at the monthly turn).')
      : (dname + ' has stopped paying scutage.') });
  return rec;
}
// Thin vassal-side wrappers: "Pay Scutage" = enable auto-pay; "Stop Paying" = disable.
function payScutageObligation(campaign, obligationId, options){ return setScutageAutoPay(campaign, obligationId, true, options); }
function stopScutagePayment(campaign, obligationId, options){ return setScutageAutoPay(campaign, obligationId, false, options); }

// =============================================================================
// Construction duty — LIEGE side (RR p.348, F&D-7). The lord orders structures built in specific hexes
// of the vassal's realm (bridges / roads / forts / towers / other; vessels if littoral). The RAW target
// is 15,000gp per 6-mile hex; F&D-7 ties it to the *ordered* hexes (15,000 × distinct ordered hexes), so
// adding orders raises the target. The vassal-side actual-building detection + auto-revoke-on-completion
// is the future full Construction subsystem (Architecture §10) — for now the monthly self-spend (Phase B)
// is the progress placeholder, and the card reads the derived progress below.
// =============================================================================

// A domain is littoral (may be ordered to build vessels, RR p.348) if any of its hexes is water OR
// borders a water hex (axial neighbour). Gates the 'vessel' construction-duty type.
function isLittoralDomain(campaign, domain){
  if(!campaign || !domain) return false;
  const all = Array.isArray(campaign.hexes) ? campaign.hexes : [];
  const realm = all.filter(h => h && h.domainId === domain.id);
  if(realm.some(h => (h.terrain || '') === 'water')) return true;
  const waters = all.filter(h => h && (h.terrain || '') === 'water' && h.coord);
  return realm.some(h => h.coord && waters.some(w => hexAxialDistance(h.coord, w.coord) === 1));
}
// Whether a construction-duty type may be ordered on this vassal domain (vessel needs a littoral realm).
function constructionDutyTypeAllowed(campaign, vassalDomain, type){
  const e = (global.ACKS.CONSTRUCTION_DUTY_TYPES || []).find(t => t.value === type);
  if(!e) return false;
  return e.littoralOnly ? isLittoralDomain(campaign, vassalDomain) : true;
}
// Distinct 6-mile hexes in the vassal's realm (own domain + sub-vassal realms) — the realm-wide cap base.
function _realmHexCount(campaign, vassalDomain){
  if(!campaign || !vassalDomain) return 1;
  const ids = new Set([vassalDomain.id]);
  for(const { domain:v } of (global.ACKS.vassalChainUnder(campaign, vassalDomain.id) || [])) ids.add(v.id);
  const n = (campaign.hexes || []).filter(h => h && ids.has(h.domainId)).length;
  return Math.max(1, n || (vassalDomain.geography && Array.isArray(vassalDomain.geography.hexes) ? vassalDomain.geography.hexes.length : 1));
}
// The target gp for a construction duty (RR p.348 — 15,000gp / 6-mile hex). F&D-7: with SPECIFIC orders
// the target = 15,000 × distinct ordered hexes (adding a hex raises it). A GENERIC order (RR p.348 "or
// other structures somewhere within his realm") — or no orders at all — falls back to 15,000 × the realm's
// hex count (the RAW realm-wide cap), since generic construction may go anywhere in the realm.
function constructionDutyTargetGp(campaign, o){
  if(!o || o.kind !== 'construction') return 0;
  const orders = Array.isArray(o.constructionOrders) ? o.constructionOrders : [];
  const hasGeneric = orders.some(x => x && (x.type === 'generic' || !x.hexId));
  const specificHexes = new Set(orders.filter(x => x && x.type !== 'generic' && x.hexId).map(x => x.hexId));
  if(!hasGeneric && specificHexes.size > 0) return 15000 * specificHexes.size;   // specific only → ordered hexes
  const vd = (campaign.domains || []).find(d => d.id === o.vassalDomainId) || null;
  return 15000 * _realmHexCount(campaign, vd);                                   // generic / none → realm cap
}
// Derived liege-side progress for a construction duty — the ordered work + the monthly minimum (= monthly
// tribute) + progress toward the target (spent / target / remaining, the min-met flag, target-reached).
function constructionDutyProgress(campaign, o){
  const spent = Math.round(Number(o && o.constructionSpentGp) || 0);
  const target = constructionDutyTargetGp(campaign, o);
  const monthlyMinimum = Math.round(Number(o && o.gpPerMonth) || 0);
  const orders = (Array.isArray(o && o.constructionOrders) ? o.constructionOrders : []).map(x => ({
    hexId: (x && x.hexId) || null, type: (x && x.type) || '', generic: !!(x && x.type === 'generic'),
    typeLabel: global.ACKS.constructionDutyTypeLabel(x && x.type)
  }));
  return {
    orders,
    orderedHexCount: new Set(orders.filter(x => !x.generic && x.hexId).map(x => x.hexId)).size,
    hasGeneric: orders.some(x => x.generic),
    spent, target, remaining: Math.max(0, target - spent), monthlyMinimum,
    minimumMet: monthlyMinimum > 0 && spent >= monthlyMinimum,   // at least one month's minimum built
    targetReached: target > 0 && spent >= target
  };
}
// Add a construction order to an active construction duty — the F&D-7 liege act. A SPECIFIC order needs a
// {hexId, type}: validated (construction kind + active; the hex is in the vassal's realm; the type known +
// allowed — vessel → littoral; no exact duplicate); adding one in a NEW hex raises the target by 15,000gp.
// A GENERIC order ({type:'generic'}, RR p.348 "or other structures somewhere within his realm") needs no
// hex — it's "build anything, anywhere in the realm" (target = the realm-wide cap); one generic per duty.
// Records history + emits a favor-duty event. Returns the obligation, or null if not found.
function addConstructionOrder(campaign, obligationId, options){
  options = options || {};
  const rec = (campaign && Array.isArray(campaign.favorDutyObligations))
    ? campaign.favorDutyObligations.find(o => o.id === obligationId) : null;
  if(!rec) return null;
  if(rec.status !== 'active' || rec.kind !== 'construction') return rec;
  const type = options.type;
  if(!type) return rec;
  if(!Array.isArray(rec.constructionOrders)) rec.constructionOrders = [];
  const atTurn = options.atTurn != null ? options.atTurn : (campaign.currentTurn || 1);
  if(!Array.isArray(rec.history)) rec.history = [];
  // Generic order — no hex; only one per duty.
  if(type === 'generic'){
    if(rec.constructionOrders.some(x => x && x.type === 'generic')) return rec;   // already generic
    rec.constructionOrders.push({ hexId: null, type: 'generic' });
    rec.history.push({ turn: atTurn, type:'construction-order-added', hexId: null, structureType: 'generic' });
    _emitFavorDutyEvent(campaign, rec, { action:'construction-order-added', hexId: null, structureType: 'generic',
      narrative: 'Ordered generic construction anywhere in the realm (target ' + constructionDutyTargetGp(campaign, rec).toLocaleString() + 'gp).' });
    return rec;
  }
  // Specific order — needs a hex in the vassal's realm.
  const hexId = options.hexId;
  if(!hexId) return rec;
  const vd = (campaign.domains || []).find(d => d.id === rec.vassalDomainId) || null;
  const realmIds = new Set([rec.vassalDomainId]);
  for(const { domain:v } of (global.ACKS.vassalChainUnder(campaign, rec.vassalDomainId) || [])) realmIds.add(v.id);
  const hex = (campaign.hexes || []).find(h => h && h.id === hexId) || null;
  if(!hex || !realmIds.has(hex.domainId)) return rec;                 // hex not in the vassal's realm
  if(!constructionDutyTypeAllowed(campaign, vd, type)) return rec;    // unknown type / vessel on a landlocked realm
  if(rec.constructionOrders.some(x => x && x.hexId === hexId && x.type === type)) return rec;   // duplicate
  rec.constructionOrders.push({ hexId, type });
  rec.history.push({ turn: atTurn, type:'construction-order-added', hexId, structureType: type });
  _emitFavorDutyEvent(campaign, rec, { action:'construction-order-added', hexId, structureType: type,
    narrative: 'Ordered a ' + global.ACKS.constructionDutyTypeLabel(type).toLowerCase() + ' built (construction target now ' + constructionDutyTargetGp(campaign, rec).toLocaleString() + 'gp).' });
  return rec;
}
// Remove a construction order by index (the liege un-orders a structure) — lowers the target when it was
// the last order in that hex. Records history. Returns the obligation.
function removeConstructionOrder(campaign, obligationId, index, options){
  options = options || {};
  const rec = (campaign && Array.isArray(campaign.favorDutyObligations))
    ? campaign.favorDutyObligations.find(o => o.id === obligationId) : null;
  if(!rec || rec.kind !== 'construction' || !Array.isArray(rec.constructionOrders)) return rec || null;
  const i = Number(index);
  if(!(i >= 0 && i < rec.constructionOrders.length)) return rec;
  const removed = rec.constructionOrders.splice(i, 1)[0] || {};
  const atTurn = options.atTurn != null ? options.atTurn : (campaign.currentTurn || 1);
  if(!Array.isArray(rec.history)) rec.history = [];
  rec.history.push({ turn: atTurn, type:'construction-order-removed', hexId: removed.hexId, structureType: removed.type });
  return rec;
}

// The vassal-ruler character for an obligation (the Call-to-Council traveller): the recorded
// vassalRulerCharacterId, else the vassal domain's ruler. null if neither resolves.
function _favorDutyVassalRuler(campaign, rec){
  if(!campaign || !rec) return null;
  let ch = rec.vassalRulerCharacterId ? (campaign.characters || []).find(c => c && c.id === rec.vassalRulerCharacterId) : null;
  if(!ch){
    const vd = (campaign.domains || []).find(d => d.id === rec.vassalDomainId) || null;
    if(vd && vd.rulerCharacterId) ch = (campaign.characters || []).find(c => c && c.id === vd.rulerCharacterId) || null;
  }
  return ch || null;
}

// Derived Call-to-Council attendance (RR p.346) — a LIVE read off the vassal ruler's current hex, so
// it's correct however he got there (a Go-to-Council journey, the Day Clock, or a manual move).
// Returns { kind, councilHexId, travellerId, journeyId, status } where status is:
//   'no-location' (no councilHexId) | 'at-council' (the vassal ruler is at the hex) |
//   'en-route' (on an active journey whose destination IS the council hex) | 'away' (elsewhere).
// A non-council obligation returns kind:'other'.
function councilAttendanceStatus(campaign, obligation){
  const rec = (typeof obligation === 'string')
    ? ((campaign && (campaign.favorDutyObligations || []).find(o => o.id === obligation)) || null)
    : obligation;
  if(!rec || rec.kind !== 'call-to-council') return { kind:'other', councilHexId:null, travellerId:null, journeyId:null, status:'other' };
  const councilHexId = rec.councilHexId || null;
  const ruler = _favorDutyVassalRuler(campaign, rec);
  const travellerId = ruler ? ruler.id : null;
  if(!councilHexId) return { kind:'call-to-council', councilHexId:null, travellerId, journeyId:null, status:'no-location' };
  // A party on a journey moves with it (party.currentHexId / activeJourneyId); else the character's
  // own currentHexId (which the journey day-tick keeps current) + currentJourneyId.
  let atHex = ruler ? ruler.currentHexId : null;
  let journeyId = ruler ? (ruler.currentJourneyId || null) : null;
  if(ruler && ruler.partyId){
    const pt = (campaign.parties || []).find(p => p && p.id === ruler.partyId) || null;
    if(pt){ if(pt.currentHexId) atHex = pt.currentHexId; if(pt.activeJourneyId) journeyId = pt.activeJourneyId; }
  }
  if(atHex && atHex === councilHexId) return { kind:'call-to-council', councilHexId, travellerId, journeyId:null, status:'at-council' };
  const j = journeyId ? ((campaign.journeys || []).find(x => x && x.id === journeyId) || null) : null;
  if(j && (j.status === 'in-transit' || j.status === 'resting' || j.status === 'lost') && j.destinationHexId === councilHexId){
    return { kind:'call-to-council', councilHexId, travellerId, journeyId: j.id, status:'en-route' };
  }
  return { kind:'call-to-council', councilHexId, travellerId, journeyId: (j ? j.id : null), status:'away' };
}

// "Go to Council" — plot (or re-route) the vassal's Journey to the council hex (RR p.346). The vassal
// ruler travels; if he's in a party, the whole party travels. If he (or his party) is already on an
// active journey, re-route its destination to the council hex; otherwise create a new journey from his
// current hex and set out. Returns { action, journey, status }, action ∈ 'rerouted' | 'started' |
// 'already-there' | 'no-location' | 'no-traveller' | 'no-origin' | 'not-applicable'.
function sendVassalToCouncil(campaign, obligationId, options){
  options = options || {};
  const rec = (campaign && Array.isArray(campaign.favorDutyObligations))
    ? campaign.favorDutyObligations.find(o => o.id === obligationId) : null;
  if(!rec || rec.status !== 'active' || rec.kind !== 'call-to-council') return { action:'not-applicable', journey:null, status:null };
  const councilHexId = rec.councilHexId || null;
  if(!councilHexId) return { action:'no-location', journey:null, status:null };
  const ruler = _favorDutyVassalRuler(campaign, rec);
  if(!ruler) return { action:'no-traveller', journey:null, status:null };
  const pt = ruler.partyId ? ((campaign.parties || []).find(p => p && p.id === ruler.partyId) || null) : null;
  const atHex = (pt && pt.currentHexId) ? pt.currentHexId : ruler.currentHexId;
  if(atHex && atHex === councilHexId) return { action:'already-there', journey:null, status:'at-council' };
  // Re-route an existing active journey (the ruler's, or his party's).
  const activeJourneyId = ruler.currentJourneyId || (pt && pt.activeJourneyId) || null;
  const activeJourney = activeJourneyId ? ((campaign.journeys || []).find(x => x && x.id === activeJourneyId) || null) : null;
  if(activeJourney && ['in-transit','resting','lost','planning'].indexOf(activeJourney.status) >= 0){
    global.ACKS.reRouteJourney(campaign, activeJourney.id, { destinationHexId: councilHexId });
    return { action:'rerouted', journey: activeJourney, status:'en-route' };
  }
  // Otherwise plot + start a new journey from the ruler's current hex.
  if(!atHex) return { action:'no-origin', journey:null, status:null };
  const participantIds = pt
    ? (campaign.characters || []).filter(c => c && c.partyId === pt.id).map(c => c.id)
    : [ruler.id];
  if(participantIds.indexOf(ruler.id) < 0) participantIds.push(ruler.id);
  const j = global.ACKS.blankJourney({
    name: global.ACKS.journeyDefaultName(campaign, { partyId: pt ? pt.id : null, participantCharacterIds: participantIds }) || 'Call to council',
    participantCharacterIds: participantIds,
    partyId: pt ? pt.id : null,
    startHexId: atHex,
    destinationHexId: councilHexId,
    mode: 'foot', pace: 'normal'
  });
  if(!Array.isArray(campaign.journeys)) campaign.journeys = [];
  campaign.journeys.push(j);
  global.ACKS.startJourney(campaign, j);
  return { action:'started', journey: j, status:'en-route' };
}

function processFavorsAndDutiesForTurn(campaign, options){
  options = options || {};
  const rng = options.rng || Math.random;
  const result = { ruleOn: false, rolled: [], revoked: [], loyaltyRolls: [], gpFlows: [], events: 0, logEntries: [] };
  if(!campaign) return result;
  // The favor-duty-auto-roll rule gates ONLY the auto-ROLL of new edicts (Phase A). Lapsing one-time
  // favors (Phase 0) and billing existing recurring obligations (Phase B) always run on the monthly
  // turn — they process obligations already in force, however they were raised (auto-rolled OR
  // hand-authored), so turning auto-roll off never freezes a live scutage / loan / custom recurring edict.
  const autoRoll = isHouseRuleEnabled(campaign, 'favor-duty-auto-roll');
  result.ruleOn = autoRoll;
  const currentTurn = campaign.currentTurn || 1;
  const domainsById = id => (campaign.domains || []).find(d => d.id === id) || null;
  const vassalages = (campaign.vassalages || []).filter(v => v && v.status === 'active');

  // PHASE 0 — lapse one-time favors whose month has ended (RR p.347 — a one-time favor offsets a duty
  // only in the month it is given, and must not linger as active afterward). Uses `<=`: this runs BEFORE
  // Phase A, so any one-time favor present here was granted in a PRIOR month OR manually during the month
  // now ending — both have had their month, so both lapse. A favor auto-rolled THIS commit (Phase A,
  // below) is created after this and survives to next month (it lapses at the following monthly turn).
  for(const o of (campaign.favorDutyObligations || [])){
    if(o.status === 'active' && o.isFavor && !o.isOngoing && o.grantedAtTurn <= currentTurn){
      spendOneTimeFavorObligation(campaign, o.id, currentTurn, 'one-time-favor-lapsed');
    }
  }

  // PHASE A — roll & create one new edict per active vassalage (only when auto-roll is on).
  if(autoRoll) for(const v of vassalages){
    const liegeId = v.suzerainCharacterId;
    const vassalDomainId = v.vassalDomainId;
    const vassalRulerId = v.vassalRulerCharacterId;
    const vassalDomain = domainsById(vassalDomainId);
    const liegeDomain = domainsById(v.suzerainDomainId);
    if(!vassalDomain) continue;

    const roll = 1 + Math.floor(rng() * 20);
    const entry = global.ACKS.lookupFavorDuty(roll);
    if(!entry) continue;

    // 9–12 — revoke the most recent active favor (1d6 = 1) or duty (2–6).
    if(entry.kind === 'revocation'){
      const subRoll = 1 + Math.floor(rng() * 6);
      const wantFavor = subRoll === 1;
      const candidates = activeFavorDutyObligationsFor(campaign, liegeId, vassalDomainId)
        .filter(o => !!o.isFavor === wantFavor);
      let target = null;
      for(const o of candidates){ if(!target || (o.grantedAtTurn || 0) >= (target.grantedAtTurn || 0)) target = o; }
      if(target){
        // RR p.348 — a revoked given Loan repays the principal (lord → vassal), same as a manual revoke.
        const repayFlow = _favorDutyRepayLoanOnRevoke(campaign, target);
        if(repayFlow) result.gpFlows.push(repayFlow);
        revokeFavorDutyObligation(campaign, target.id, currentTurn, 'favor-duty-table-revocation');
        const narrative = repayFlow
          ? 'Revoked loan for ' + (vassalDomain.name || vassalDomainId) + ' — ' + repayFlow.amount.toLocaleString() + 'gp repaid.'
          : 'Revoked ' + target.kind + ' (' + (wantFavor ? 'favor' : 'duty') + ') for ' + (vassalDomain.name || vassalDomainId) + '.';
        _emitFavorDutyEvent(campaign, target, { action:'revoked', roll, subRoll, gpFlows: repayFlow ? [repayFlow] : [], narrative });
        result.revoked.push({ obligationId: target.id, kind: target.kind, wantFavor });
        result.events++;
        result.logEntries.push('Favor/Duty — ' + (vassalDomain.name || vassalDomainId) + ': ' + narrative);
      } else {
        // Nothing to revoke — record the roll so the audit trail is complete.
        _emitFavorDutyEvent(campaign, { id:null, kind:'revocation', vassalDomainId, liegeCharacterId:liegeId, vassalRulerCharacterId:vassalRulerId, isFavor:wantFavor, isOngoing:false, roll, gpPerMonth:0 },
          { action:'nothing-to-revoke', roll, subRoll, narrative: 'Favor/Duty revocation rolled but the vassal had no active ' + (wantFavor ? 'favor' : 'duty') + ' to lose.' });
        result.events++;
      }
      continue;
    }

    // Apply the edict via the shared core (the same path the manual GM-pick UI calls).
    const r = _applyFavorDutyEdict(campaign, { liegeId, vassalDomainId, vassalRulerId, vassalDomain, liegeDomain, entry, roll, currentTurn }, rng);
    r.gpFlows.forEach(f => result.gpFlows.push(f));
    if(r.loyaltyResult){
      result.loyaltyRolls.push({ vassalDomainId, vassalRulerCharacterId: vassalRulerId, modifier: r.balance.loyaltyModifier, bandKey: r.loyaltyResult.bandKey });
      result.logEntries.push('Favor/Duty — ' + (vassalDomain.name || vassalDomainId) + ': over-demanded (' + r.balance.activeDuties + ' duties vs ' + r.balance.safeDutyCount + ' safe) → Loyalty roll at ' + r.balance.loyaltyModifier + ' → ' + r.loyaltyResult.bandLabel + '.');
    }
    result.events++;
    result.rolled.push({ obligationId: r.obligation.id, kind: entry.kind, isFavor: entry.isFavor, roll, gpPerMonth: r.gpPerMonth, vassalDomainId });
    if(!r.loyaltyResult) result.logEntries.push('Favor/Duty — ' + r.narrative);
  }

  // PHASE B — recurring monthly gp for active ongoing gp duties.
  // Per-lord scutage tally (RR p.348 misappropriation check, run after the loop).
  const scutageReceivedByLiege = {};
  for(const o of (campaign.favorDutyObligations || [])){
    if(o.status !== 'active') continue;
    const vassalDomain = domainsById(o.vassalDomainId);
    if(!vassalDomain) continue;
    const v = (campaign.vassalages || []).find(x => x && x.status === 'active' && x.vassalDomainId === o.vassalDomainId && x.suzerainCharacterId === o.liegeCharacterId);
    const liegeDomain = v ? domainsById(v.suzerainDomainId) : null;

    if(o.kind === 'scutage'){
      // Scutage settles ONLY when the vassal paid it this month (the Pay Scutage button — RR pp.347–348).
      // The amount is DERIVED LIVE (scutageMonthlyGp = rate × current realm families) so it tracks population.
      // The vassal is debited via the monthly NET (scutage is a garrison-expense row in expenseBreakdown,
      // already applied before this runs); here we only CREDIT the lord (one-sided — no double-move). A
      // not-paying month does nothing (the gp stays with the vassal; the liege card shows it wasn't paid).
      // Gated on the auto-pay toggle (scutageAutoPay) — it bills automatically each month while on.
      const amt = scutageMonthlyGp(campaign, o);
      if(amt > 0 && o.scutageAutoPay === true && liegeDomain){
        _applyDomainTreasuryDelta(campaign, liegeDomain, +amt, { reason:'scutage', label:'favor-duty: scutage (collected)' });
        o.scutageLastPaidTurn = currentTurn;   // audit: the last month scutage actually settled
        const flow = { from: vassalDomain.id, to: liegeDomain.id, amount: amt, reason:'scutage' };
        result.gpFlows.push(flow);
        _emitFavorDutyEvent(campaign, o, { action:'scutage-collected', gpPerMonth:amt, gpFlows:[flow], narrative:'Scutage of ' + amt.toLocaleString() + 'gp collected by the lord from ' + (vassalDomain.name || o.vassalDomainId) + ' (counts as the vassal’s garrison expense).' });
        result.events++;
        const key = o.liegeCharacterId || liegeDomain.id;
        const acc = scutageReceivedByLiege[key] || (scutageReceivedByLiege[key] = { liegeDomain, liegeCharacterId: o.liegeCharacterId, total: 0, payers: [] });
        acc.total += amt;
        acc.payers.push({ obligationId: o.id, vassalRulerId: o.vassalRulerCharacterId || vassalDomain.rulerCharacterId || null, vassalDomain });
      }
    } else if(o.kind === 'construction' && o.gpPerMonth > 0){
      // RAW p.348 — each month the vassal expends gp = his monthly tribute on the ordered construction.
      // (This monthly self-spend is the PLACEHOLDER for the future full Construction subsystem's actual
      // building detection; F&D-7 is the liege-side authoring + the target it accumulates toward.)
      const spend = o.gpPerMonth;
      const f = _favorDutyMoveGp(campaign, vassalDomain, null, spend, 'construction', null);
      if(f){
        o.constructionSpentGp = (o.constructionSpentGp || 0) + spend;
        result.gpFlows.push(f);
        // Auto-revoke at the construction target (F&D-7: 15,000gp × distinct ordered hexes, else the
        // RAW realm-wide 15,000gp / 6-mile-hex cap when no orders have been placed).
        const cap = constructionDutyTargetGp(campaign, o);
        if(cap > 0 && o.constructionSpentGp >= cap){
          revokeFavorDutyObligation(campaign, o.id, currentTurn, 'construction-cap-reached');
          _emitFavorDutyEvent(campaign, o, { action:'auto-revoked', gpFlows:[f], narrative:'Construction duty auto-revoked on ' + (vassalDomain.name || o.vassalDomainId) + ' (reached the ' + cap.toLocaleString() + 'gp target).' });
        } else {
          _emitFavorDutyEvent(campaign, o, { action:'recurring', gpPerMonth:spend, gpFlows:[f], narrative:'Construction: ' + spend.toLocaleString() + 'gp expended on ' + (vassalDomain.name || o.vassalDomainId) + ' (' + o.constructionSpentGp.toLocaleString() + '/' + cap.toLocaleString() + 'gp).' });
        }
        result.events++;
      }
    } else if(o.kind === 'loan' && o.gpPerMonth > 0 && o.loanGivenAtTurn != null && o.loanGivenAtTurn < currentTurn){
      // Repayment check (RR p.348): once the loan has been GIVEN, the lord's CHA% chance each month;
      // success repays (lord → vassal) + revokes. A demanded-but-ungiven loan is not yet repayable.
      const lord = (campaign.characters || []).find(c => c.id === o.liegeCharacterId) || null;
      const chaPct = lord ? Math.max(0, Math.min(100, Number((lord.abilities && lord.abilities.CHA) || 0))) : 0;
      // CHA score (3..18) used directly as a percentage chance (RAW phrases it as "CHA as a percentage").
      const roll100 = 1 + Math.floor(rng() * 100);
      if(roll100 <= chaPct){
        const f = _favorDutyMoveGp(campaign, liegeDomain, vassalDomain, o.gpPerMonth, 'loan-repaid', null);  // lord → vassal
        revokeFavorDutyObligation(campaign, o.id, currentTurn, 'loan-repaid');
        if(f) result.gpFlows.push(f);
        _emitFavorDutyEvent(campaign, o, { action:'repaid', gpFlows: f ? [f] : [], narrative:'Loan of ' + o.gpPerMonth.toLocaleString() + 'gp repaid to ' + (vassalDomain.name || o.vassalDomainId) + ' (CHA ' + chaPct + '% ✓).' });
        result.events++;
      }
    } else if(o.kind === 'custom' && o.isOngoing && o.gpPerMonth > 0){
      // Recurring custom edict (RR p.345 — a GM-devised favor/duty): a duty pulls vassal→lord, a favor
      // pushes lord→vassal, every month while active (like scutage). An auto-rolled edict would bill its
      // grant month here too; a manually-raised one bills from the next monthly turn (no on-grant move
      // happened for an ongoing custom, so there's no double-billing).
      const f = o.isFavor
        ? _favorDutyMoveGp(campaign, liegeDomain, vassalDomain, o.gpPerMonth, 'custom-favor', null)   // lord → vassal
        : _favorDutyMoveGp(campaign, vassalDomain, liegeDomain, o.gpPerMonth, 'custom-duty', null);   // vassal → lord
      if(f){
        result.gpFlows.push(f);
        _emitFavorDutyEvent(campaign, o, { action:'recurring', gpPerMonth:o.gpPerMonth, gpFlows:[f],
          narrative: (o.customLabel || 'Custom edict') + ': ' + o.gpPerMonth.toLocaleString() + 'gp ' + (o.isFavor ? 'to ' : 'from ') + (vassalDomain.name || o.vassalDomainId) + '.' });
        result.events++;
      }
    }
  }

  // PHASE C — scutage misappropriation (RR p.348): "A lord who receives scutage must spend the funds
  // on troops or provoke Henchman Loyalty rolls at -4." If the lord did NOT out-spend the scutage he
  // collected this month on troops (interpreted as his garrison cost — the domain's standing troop
  // wage), every vassal who paid him scutage makes a Henchman Loyalty roll at -4.
  for(const key of Object.keys(scutageReceivedByLiege)){
    const acc = scutageReceivedByLiege[key];
    const troopSpend = global.ACKS.garrisonCost(acc.liegeDomain);
    if(troopSpend > acc.total) continue;                                   // lord spent enough on troops — no penalty
    for(const p of acc.payers){
      if(!p.vassalRulerId) continue;
      const rr = _favorDutyLoyaltyRoll(campaign, p.vassalRulerId, -4, rng,
        { reason:'scutage-misappropriated', reasonNote:'lord did not spend scutage on troops (RR p.348)' });
      result.loyaltyRolls.push({ vassalDomainId: p.vassalDomain.id, vassalRulerCharacterId: p.vassalRulerId, modifier: -4, bandKey: rr.bandKey, reason:'scutage-misappropriated' });
    }
    const liegeName = ((campaign.characters || []).find(c => c.id === acc.liegeCharacterId) || {}).name || (acc.liegeDomain && acc.liegeDomain.name) || 'The lord';
    _emitFavorDutyEvent(campaign,
      { id:null, kind:'scutage', vassalDomainId:(acc.payers[0] && acc.payers[0].vassalDomain.id) || null, liegeCharacterId: acc.liegeCharacterId, vassalRulerCharacterId:null, isFavor:false, isOngoing:true, roll:null, gpPerMonth: acc.total },
      { action:'scutage-misappropriated', narrative: liegeName + ' spent only ' + troopSpend.toLocaleString() + 'gp on troops against ' + acc.total.toLocaleString() + 'gp of scutage received — ' + acc.payers.length + ' scutage-paying vassal' + (acc.payers.length===1?'':'s') + ' roll Loyalty at -4 (RR p.348).' });
    result.events++;
    result.logEntries.push('Favor/Duty — scutage misappropriated by ' + liegeName + ' (troops ' + troopSpend.toLocaleString() + 'gp ≤ scutage ' + acc.total.toLocaleString() + 'gp) → ' + acc.payers.length + ' vassal Loyalty roll' + (acc.payers.length===1?'':'s') + ' at -4.');
  }

  return result;
}

function proposeMonthlyTurn(campaign, options){
  options = options || {};
  const rng = options.rng || Math.random;
  if(!campaign) return { error: 'No campaign loaded', turnEventProposals: [], turnVentureProposals: [], turnProposal: [] };
  const domains = campaign.domains || [];
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
    targetSummary: summarizeEventTarget(campaign, ev),
    payloadSummary: summarizeEventPayload(campaign, ev)
  }));

  // Phase 2b.5 — roll one vagary per in-transit venture.
  const turnVentureProposals = (campaign.ventures || [])
    .filter(v => v.status === 'in-transit')
    .map(v => {
      const vagary = global.ACKS.rollVagary(rng);
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
        classification: effectiveDomainClassification(d),
        // W4 — RR p.458: while OCCUPIED the monthly morale machinery runs under the
        // OCCUPIER's personal authority (the base morale recomputes from him); the
        // moraleModifiersFor occupation-penalty row rides on top. Unoccupied domains
        // (the universal case) read effectiveRuler exactly as before.
        ruler: (d.occupiedBy && d.occupiedBy.leaderCharacterId && global.ACKS.occupierRulerSummary)
          ? global.ACKS.occupierRulerSummary(campaign, d)
          : global.ACKS.effectiveRuler(campaign, d),
        tithePaid: d.expenses.tithePaid !== false,
        tributePaid: d.expenses.tributePaid !== false,
        administersThisMonth: !!d.administersThisMonth,
        hasLiege: !!d.liegeId,
        moraleBefore: d.demographics.morale,
        populationBefore: global.ACKS.totalFamilies(d),
        treasuryBefore: d.treasury.gp || 0,
        income: global.ACKS.incomeBreakdown(campaign, d).map(r => ({...r})),
        expenses: global.ACKS.expenseBreakdown(campaign, d).map(r => ({...r})),
        incomeFactor: global.ACKS.incomeFactor(d.demographics.morale),
        moraleMods: global.ACKS.moraleModifiersFor(campaign, d).map(m => ({...m})),
        moraleRoll: rollD6(rng) + rollD6(rng),
        event: global.ACKS.sampleEvent(d.demographics.morale),
        hasPlayerInput: !!d.pendingPlayerInput,
        urbanInvestments: global.ACKS.hexSettlements(d).map(({hexIndex, settlement}) => ({
          hexIndex,
          settlementName: settlement.name || '(unnamed)',
          marketClass: global.ACKS.settlementMarketClass(settlement),
          currentFamilies: settlement.families || 0,
          capacity: global.ACKS.settlementCapacity(settlement),
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

  // CoL-2 — preview the end-of-month living-expenses + henchman-wage debits (read-only; dryRun).
  const livingExpenseProposal = processLivingExpensesForTurn(campaign, { dryRun: true });

  return {
    error: null,
    turnEventProposals,
    turnVentureProposals,
    turnProposal,
    livingExpenseProposal
  };
}

function commitTurn(campaign, proposal, options){
  if(!campaign || !proposal) return { committed: 0, logEntries: [], error: 'No campaign or proposal' };
  options = options || {};
  const rng = options.rng || Math.random;
  const domains = campaign.domains || [];

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
  // Domains live on the campaign (single home; the caller passes an attached campaign), so
  // applyEvent handlers traverse campaign.domains directly — no swap/restore needed.
  {
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
  }

  // === PER-DOMAIN STANDARD TURN MATH ===
  turnProposal.forEach(p => {
    if(p.skip) return;
    const d = domains.find(x => x.id === p.domainId);
    if(!d) return;
    // GP Wave B (Architecture.md §4.3.2) — collect the month's treasury line items; emitted as
    // wealth-transfer children under this domain's engine-standard-turn event below.
    const _turnWealthChildren = [];

    d.expenses.tithePaid = p.tithePaid;
    if(p.hasLiege) d.expenses.tributePaid = p.tributePaid;
    d.administersThisMonth = p.administersThisMonth;

    const gross = global.ACKS.incomeSum(p);
    const grossAdj = Math.round(gross * p.incomeFactor);
    const expenses = global.ACKS.expenseSum(p);
    const net = grossAdj - expenses;
    const modSum = global.ACKS.moraleModSum(p);
    const adjusted = (p.moraleRoll || 0) + modSum;
    const base = baseMoraleFromClassification(p.classification, p.ruler);
    const moraleChange = moraleChangeFromRoll(adjusted, p.moraleBefore, base);
    const moraleAfter = clamp(p.moraleBefore + moraleChange, -4, 4);

    const familiesK = Math.max(1, Math.ceil(d.demographics.peasantFamilies / 1000));
    const naturalIncrease = rollNaturalIncrease(familiesK, moraleAfter, rng);
    const naturalDecrease = rollNaturalDecrease(familiesK, rng);
    const moraleExtra = rollMoraleExtra(moraleAfter, familiesK, rng);
    const popDelta = naturalIncrease - naturalDecrease + moraleExtra;
    const populationAfter = Math.max(0, global.ACKS.totalFamilies(d) + popDelta);

    const snapshotBefore = {
      peasantFamilies: d.demographics.peasantFamilies,
      urbanFamilies: d.demographics.urbanFamilies,
      morale: d.demographics.morale,
      treasuryGp: d.treasury.gp
    };
    // W4 — RR p.458: while OCCUPIED (not conquered) the peasants and their revenues are
    // the occupier's; the urban families stay the owner's until conquest. A positive
    // month splits by the peasant-attributable share of gross income (peasantIncomeShare);
    // a negative month stays the owner's burden (the occupier does not subsidize 🔧).
    let _ownerNet = net;
    if(d.occupiedBy && d.occupiedBy.leaderCharacterId && net > 0 && global.ACKS.peasantIncomeShare){
      const _occShare = global.ACKS.peasantIncomeShare(campaign, d);
      const _occupierGp = Math.max(0, Math.round(net * _occShare));
      if(_occupierGp > 0){
        _ownerNet = net - _occupierGp;
        const _occupier = (campaign.characters || []).find(c => c && c.id === d.occupiedBy.leaderCharacterId);
        if(_occupier){
          const _occDom = (campaign.domains || []).find(x => x && x.rulerCharacterId === _occupier.id) || null;
          const _handle = (_occupier.payKeepFromTreasury !== false && _occDom)
            ? { kind: 'treasury', id: _occDom.id } : { kind: 'character-gp', id: _occupier.id };
          const _spec = { amount: _occupierGp, source: { kind: 'external', label: 'occupation of ' + (d.name || 'a domain') },
                          destination: _handle, reason: 'Occupation revenue from ' + (d.name || 'a domain'), bucket: 'occupation-revenue' };
          try {
            if(global.ACKS.applyWealthTransfer) global.ACKS.applyWealthTransfer(campaign, _spec);
            if(global.ACKS.recordWealthTransfer) global.ACKS.recordWealthTransfer(campaign, _spec, { submittedBy: 'engine', campaignLogHidden: true });
          } catch(e){ /* the turn still settles; the event log just misses the transfer record */ }
        }
      }
    }
    _applyDomainTreasuryDelta(campaign, d, _ownerNet, { reason:'monthly-net-income', label:'monthly net income' });
    if(_ownerNet) _turnWealthChildren.push({ amount: _ownerNet, bucket:'monthly-net-income', reason:'monthly net income' });
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
      for(let k = 0; k < thousands; k++) investImmigrants += 1 + Math.floor(rng() * 10);
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
    if(totalInvestmentSpent) _turnWealthChildren.push({ amount: -totalInvestmentSpent, bucket:'urban-investment', reason:'urban settlement investment' });

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
    // RAW DEFAULT (RR p.174): construction is labor-paid, supervised, and takes time. The internal
    // `abstract-construction` flag opts into the old instant/gp-only path (fast play; the oracle).
    // Instant completion for GMs is via the admin tools (Inspector force-complete), not a house rule.
    const realisticOn = !isHouseRuleEnabled(campaign, 'abstract-construction');
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
      // Time-based construction (RR p.174): when realistic-construction is ON, the monthly commit
      // does NOT spend or ratchet. It accumulates the GM's allocation into the hex's improvement
      // BUDGET and hands off to the day-tick, which drips it at the construction rate (~500gp/day)
      // over ~50 days/step (pay-as-you-build). Supervisor adequacy is checked at drip time so the GM
      // can budget before assigning an engineer (Option A). The instant path below runs only when OFF.
      if(realisticOn){
        hex.improvementBudgetGp = (hex.improvementBudgetGp || 0) + gpAmount;
        try { global.ACKS.syncAgriculturalProject(campaign, hex, { domainId: d.id, turn: currentTurnNum }); } catch(e){}
        agOrdersResults.push({
          hexIndex: ord.hexIndex, coordStr: ord.coordStr, baseValue: base,
          gpSpent: 0, budgeted: gpAmount, oldBonus: bonus, newBonus: bonus, stepsApplied: 0,
          remainingInvested: hex.landImprovementInvested || 0,
          timed: true, budgetGp: hex.improvementBudgetGp
        });
        return;
      }
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
      if(affordable) _turnWealthChildren.push({ amount: -affordable, bucket:'agricultural-improvement', reason:'agricultural land improvement' });
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
      urbanFamilies: global.ACKS.effectiveUrbanFamilies(d),
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
      // GP Wave B (§4.3.2) — the per-line-item wealth-transfer decomposition under the turn
      // event. The treasury mutation already happened once above; these carry the grammar.
      for(const w of _turnWealthChildren){
        if(!w.amount || !global.ACKS.recordWealthTransfer) continue;
        const into = w.amount >= 0;
        global.ACKS.recordWealthTransfer(campaign, {
          source:      into ? { kind:'external', label: w.reason } : { kind:'treasury', id: d.id },
          destination: into ? { kind:'treasury', id: d.id } : { kind:'external', label: w.reason },
          amount: Math.abs(w.amount), bucket: w.bucket, reason: w.reason
        }, { parentEvent: stEvent });
      }
    } catch(e){ /* swallow per original */ }

    // Award XP to ruler (RR p.423; henchman rulers get half). While occupied, the
    // owner's XP basis is the net HE actually kept (_ownerNet — the occupier's share
    // earned the occupier gp, not the deposed lord XP).
    const xpEarned = global.ACKS.domainXpFromNet(campaign, d, _ownerNet - totalInvestmentSpent - totalAgriculturalSpent);
    let rulerXpAwarded = 0;
    if(xpEarned && xpEarned > 0){
      const rulerCh = global.ACKS.rulerCharacter(campaign, d);
      if(rulerCh){
        const henchPenalty = rulerCh.liegeCharacterId ? 0.5 : 1.0;
        rulerXpAwarded = Math.round(xpEarned * henchPenalty);
        rulerCh.xp = (rulerCh.xp || 0) + rulerXpAwarded;
        addCharacterHistory(campaign, rulerCh, 'xp',
          '+' + rulerXpAwarded.toLocaleString() + ' XP from ruling ' + d.name + ' (domain net ' + (_ownerNet - totalInvestmentSpent - totalAgriculturalSpent).toLocaleString() + 'gp − threshold ' + computeGpThreshold(rulerCh.level || 1).toLocaleString() + 'gp' + (henchPenalty < 1 ? ', henchman ½' : '') + ')',
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
    const rulerForBlurb = global.ACKS.rulerCharacter(campaign, d);
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
      const summary = applyVagaryToVenture(campaign, venture, vp);
      if(summary){
        logEntries.push('Venture vagary — ' + venture.venturerName + ': ' + vp.vagaryName + '. ' + summary);
        vagariesApplied++;
        if(vp.vagaryEffect === 'total-loss') ventureAnnihilations++;
      }
    }
  });

  // === PASSIVE INVESTMENTS (RR p.383) ===
  const passiveResult = processPassiveInvestmentsForTurn(campaign) || { totalGp: 0, payouts: [] };
  (passiveResult.payouts || []).forEach(pa => {
    logEntries.push('Passive investment payout — ' + pa.name + ' (' + pa.type + '): +' + pa.gp.toLocaleString() + 'gp → ' + pa.destination + '.');
  });

  // === LEVEL-UP SWEEP ===
  // Runs BEFORE incrementing the turn counter so level-up history is stamped with the current turn.
  // levelUpCharacter (called inside checkAllCharacterLevelUps) emits its own log lines via the
  // caller's logEvent, so we don't push anything here.
  const levelUpResults = checkAllCharacterLevelUps(campaign) || [];

  // === LIVING EXPENSES + HENCHMAN WAGES (RR p.173 + p.168 — CoL-2) ===
  // The end-of-month keep. Gated on committed > 0 (a real month rolled) so it never double-charges
  // when the GM advances with all domains skipped. Sets effectiveSocialLevel (apparent level → the
  // henchman hiring cap + loyalty). Gated on the `living-expenses` rule (default ON) inside the helper.
  let livingExpenseResult = { ruleOn:false, charges: [], totalGp: 0 };
  if(committed > 0){
    livingExpenseResult = processLivingExpensesForTurn(campaign) || livingExpenseResult;
    if(livingExpenseResult.ruleOn && livingExpenseResult.totalGp > 0){
      const selfN = livingExpenseResult.charges.filter(x => x.kind === 'living-expenses' && x.paid > 0).length;
      const wageN = livingExpenseResult.charges.filter(x => x.kind === 'henchman-wage' && x.paid > 0).length;
      logEntries.push('Living expenses + wages: ' + livingExpenseResult.totalGp.toLocaleString() + 'gp ('
        + selfN + ' living expense' + (selfN === 1 ? '' : 's')
        + (wageN ? ', ' + wageN + ' henchman wage' + (wageN === 1 ? '' : 's') : '') + ')');
    }
  }

  // === HENCHMAN LOYALTY DRIFT === (RAW baseline — always runs)
  // Domains live on the campaign (single home) — tickHenchmanLoyalty traverses them directly.
  let loyaltyDrifts = 0;
  {
    const drifts = global.ACKS.tickHenchmanLoyalty(campaign, campaign.currentTurn || 1);
    loyaltyDrifts = drifts.length;
    if(loyaltyDrifts) logEntries.push('Henchman loyalty drift: ' + loyaltyDrifts + ' character(s) shifted this turn');
  }

  // === FAVORS & DUTIES (RR pp.345–348 — #230) ===
  // Once per month, per active vassalage: roll the lord's edict, apply the gp flows, and check
  // the favor/duty balance. Gated on committed > 0 (a real month rolled) AND the favor-duty-auto-roll
  // rule (default ON). Wrapped so a F&D error never breaks the core monthly commit (cf. day-tick).
  let favorDutyResult = { ruleOn: false };
  if(committed > 0){
    try {
      favorDutyResult = processFavorsAndDutiesForTurn(campaign, { rng }) || favorDutyResult;
      (favorDutyResult.logEntries || []).forEach(l => logEntries.push(l));
    } catch(e){ /* never let Favors & Duties fail the monthly commit */ }
  }

  // === DOMAIN BANDITRY (RR pp.350–351 — #476 E10) ===
  // Morale at −2 or worse turns the domain's own men bandit. The processor (subsystems
  // module) settles last month's casualties as population loss, reconciles the placed
  // banditry bands to the RAW banditCount (rising / swelling / waning / disbanding), and
  // advances the enemy-army occupation counter the morale roll reads (RR p.349 + p.351).
  // Runs AFTER the per-domain morale + population resolution (it reads moraleAfter) and is
  // gated on committed > 0 + the domain-morale-banditry rule (default ON) inside the helper.
  let banditryResult = { ruleOn: false };
  if(committed > 0){
    try {
      if(typeof global.ACKS.processBanditryForTurn === 'function'){
        banditryResult = global.ACKS.processBanditryForTurn(campaign, { rng }) || banditryResult;
        (banditryResult.logEntries || []).forEach(l => logEntries.push(l));
      }
    } catch(e){ /* never let banditry fail the monthly commit */ }
    // Phase 3 Military W2 — the JJ p.103 peasant-unease flag is ONE-SHOT: it just fed
    // this month's morale roll (the moraleModifiersFor row), so consume it. Clearing a
    // stale flag is harmless + self-healing, so this runs unconditionally of the rule.
    try {
      (campaign.domains || []).forEach(d => { if(d && d.incursionXenophobiaPending) d.incursionXenophobiaPending = false; });
    } catch(e){ /* never let the flag clear fail the monthly commit */ }
    // W4 — RR p.458: the post-occupation −1/month penalty is likewise ONE-SHOT (the
    // owner's NEXT morale roll). It just fed this month's roll — consume it.
    try {
      (campaign.domains || []).forEach(d => { if(d && d.postOccupationPenaltyMonths) d.postOccupationPenaltyMonths = 0; });
    } catch(e){ /* never let the flag clear fail the monthly commit */ }
  }

  // === RUMOR AUTO-EMIT ===
  if(isHouseRuleEnabled(campaign, 'rumors-auto-emit')){
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
  if(isHouseRuleEnabled(campaign, 'rumors-proliferation')){
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
      if(isHouseRuleEnabled(campaign, 'auran-calendar')){
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
          // Domains live on the campaign (single home), so the day-tick consumers (construction)
          // find the domain treasuries directly. Materialize Projects for any funded-but-not-yet-
          // projected hex (the panel writes the budget field directly) so the month-end drip finds +
          // advances them; also clears capped budgets. Idempotent.
          migrateAgriculturalToProjects(campaign);
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
    livingExpenseResult,
    favorDutyResult,
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
  const v = (campaign && campaign.houseRules) ? campaign.houseRules[id] : undefined;
  if(v === true) return true;
  if(typeof v === 'object' && v && v.enabled === true) return true;
  if(typeof v === 'object' && v && v.enabled === false) return false;   // explicit off wins over the registry default
  if(v === false) return false;                                          // explicit off (bare boolean)
  if(v == null){
    // Absent → fall back to the registry default (default:true rules like `living-expenses`).
    // Every other rule has no `default` field, so absent ⇒ OFF exactly as before.
    const reg = (global.ACKS && global.ACKS.lookupHouseRule) ? global.ACKS.lookupHouseRule(id) : null;
    return !!(reg && reg.default === true);
  }
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
function tickDayOnce(campaign, dayInMonth, ctxExtra){
  const ctx = Object.assign(dayTickContext(campaign, dayInMonth), ctxExtra || {});
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
  // Phase 2.5 Journeys (#475) — an in-transit journey is day-aware activity in flight.
  // E8 — a KNOWINGLY-lost journey too: the world keeps ticking over the held party
  // (its camp checks + survival run on the Day Clock while it searches for the landmark).
  if(Array.isArray(campaign.journeys) && campaign.journeys.some(j => j && (j.status === 'in-transit' || j.status === 'resting' || j.status === 'lost'))) return true;
  // A funded-but-not-yet-projected agricultural improvement also counts as in flight: the panel
  // writes hex.improvementBudgetGp directly, and the Project is materialized just before the tick.
  const budgeted = (arr) => Array.isArray(arr) && arr.some(h => h && (h.improvementBudgetGp || 0) > 0);
  if(budgeted(campaign.hexes)) return true;
  if(Array.isArray(campaign.domains) && campaign.domains.some(d => d && d.geography && budgeted(d.geography.hexes))) return true;
  return false;
}

// PROPOSE half of the day-tick commit pipeline (Calendar §10). Advances up to `days`
// days on a deep-cloned working copy so the real campaign is untouched, accumulating
// pending records for GM review. Stops early (paused) when a consumer surfaces a
// notableEvent whose pauseTrigger has its auto-pause-* rule on — unless opts.force.
// Also stops at month end (day 30). Returns a tick proposal:
//   { fromDay, toDay, daysAdvanced, monthEndReached, paused, pauseReasons[],
//     pendingRecords[], notableEvents[], encounters[] }
// Regenerate a merged record's summary label from its accumulated totals (week/month tick).
function _dayRecordLabel(m){
  const nm = m.name || 'project';
  const days = m.daysAdded || 0;
  const dsuf = (days === 1 ? ' day' : ' days');
  if(m.agriculturalDrip){
    const drip = Math.round(m._sumDrip || 0);
    if(drip <= 0) return m._lastLabel || (nm + ' — idle');
    const steps = m._sumSteps || 0;
    const budgetLeft = Math.max(0, Math.round(m.budgetLeftAfter || 0));
    return nm + ': +' + drip.toLocaleString() + 'gp over ' + days + dsuf
      + (steps > 0 ? ' (+' + steps + ' land value)' : '')
      + ' · ' + budgetLeft.toLocaleString() + 'gp budget left'
      + (m.treasuryLimited ? ' · limited by treasury' : '');
  }
  if(typeof m.newLaborInvested === 'number'){
    const gained = Math.round(m._sumLabor || 0);
    const inv = Math.round(m.newLaborInvested || 0);
    return nm + ': +' + gained + ' cf over ' + days + dsuf
      + ' (' + inv + (m.laborRequired ? ('/' + m.laborRequired) : '') + ' cf)'
      + (m.willComplete ? ' — complete' : '');
  }
  return m._lastLabel || m.label || (nm + ' — ' + days + dsuf);
}

// Collapse a multi-day proposal's per-day construction records into ONE record per
// (consumer, project) so a week/month tick shows a single summary line per project instead
// of N daily spam lines. Single-day groups pass through untouched (a 1-day tick is unchanged).
// The merged record sums daysAdded + drip/labor and keeps the LAST day's cumulative state, so
// commitConstructionRecord — which recomputes agricultural drip from daysAdded and reads the
// absolute newLaborInvested for workers — applies the correct weekly/monthly total.
function _mergeDayRecords(records){
  if(!Array.isArray(records) || records.length < 2) return records || [];
  const groups = new Map();
  const order = [];
  const passthrough = [];
  records.forEach(r => {
    if(!r || !r.projectId){ passthrough.push(r); return; }
    const key = (r.consumer || '') + '|' + r.projectId + '|' + (r.kind || '');
    if(!groups.has(key)){
      const seed = Object.assign({}, r);
      seed._count = 0; seed._sumDrip = 0; seed._sumSteps = 0; seed._sumLabor = 0;
      seed.daysAdded = 0;
      groups.set(key, seed);
      order.push(key);
    }
    const m = groups.get(key);
    m._count++;
    m.daysAdded = (m.daysAdded || 0) + (r.daysAdded || 0);
    m._sumDrip  += (r.dripProjected || 0);
    m._sumSteps += (r.stepsWillComplete || 0);
    m._sumLabor += (r.laborGained || 0);
    if(typeof r.newLaborInvested === 'number') m.newLaborInvested = r.newLaborInvested;
    if(typeof r.newDaysElapsed === 'number')   m.newDaysElapsed   = r.newDaysElapsed;
    if(typeof r.budgetLeftAfter === 'number')  m.budgetLeftAfter  = r.budgetLeftAfter;
    if(r.willComplete) m.willComplete = true;
    if(r.treasuryLimited) m.treasuryLimited = true;
    if(r.paused){ m.paused = true; if(r.blockReason) m.blockReason = r.blockReason; }
    m.dripProjected = m._sumDrip;
    m.laborGained = m._sumLabor;
    m._lastLabel = r.label;
    if(r.dayInMonth != null) m.dayInMonth = r.dayInMonth;
  });
  const out = [];
  order.forEach(key => {
    const m = groups.get(key);
    if(m._count > 1) m.label = _dayRecordLabel(m);
    delete m._count; delete m._sumDrip; delete m._sumSteps; delete m._sumLabor; delete m._lastLabel;
    out.push(m);
  });
  return out.concat(passthrough);
}

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
    // opts.rng threads a deterministic die into every consumer's ctx (tests / scriptable
    // ticks — the commitTurn options.rng pattern); absent, each consumer seeds its own.
    const tick = tickDayOnce(work, nextDay, opts.rng ? { rng: opts.rng } : null);
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
  // Collapse per-day construction records into one summary line per project (week/month tick).
  proposal.pendingRecords = _mergeDayRecords(proposal.pendingRecords);
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
  // Skip TRANSIENT notable events (Travel pivot 2026-06-04): the per-thing journey signals
  // (lost/hunger/fording/…) drive the pause check + day-log digest but are folded into one
  // comprehensive journey-day-tick event, so they don't each become their own eventLog entry.
  const evs = (proposal.notableEvents || []).filter(e => e && !e.rejected && !e.transient);
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
        appliedAt: new Date().toISOString(),
        // Routine days (no notable happening) stay out of the narrative Campaign Log but remain in the
        // Event Log + every entity history (Travel pivot 2026-06-04, reusing the §26 campaignLogHidden flag).
        ...(e.campaignLogHidden ? { campaignLogHidden: true } : {})
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
  const useRealisticCap = !isHouseRuleEnabled(campaign, 'abstract-construction'); // RAW default (RR p.174)
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
  const useRealisticCap = !isHouseRuleEnabled(campaign, 'abstract-construction'); // RAW default (RR p.174)
  const useMageAssist   = isHouseRuleEnabled(campaign, 'mage-assisted-construction');
  const CW = (typeof global !== 'undefined' && global.ACKS && global.ACKS.totalDailyOutputCf)
    ? global.ACKS.totalDailyOutputCf
    : ((wc) => Object.values(wc||{}).reduce((s,n) => s + (n||0)*5, 0));
  for(const p of campaign.projects){
    if(!p || p.lifecycleState !== 'under-construction') continue;
    // Agricultural improvement is gp-denominated, not worker-cf, so it never runs totalDailyOutputCf.
    if(p.constructibleKind === 'agricultural-improvement'){
      const nm = p.name || 'Agricultural improvement';
      if(useRealisticCap){
        // TIME-BASED (RAW RR p.174): drip the GM's committed budget at the construction rate. Project
        // this day's drip for review; commitConstructionRecord recomputes + applies authoritatively.
        const calc = computeAgriculturalDrip(campaign, p, days);
        let label;
        if(calc.atCap)            label = nm + ' — complete (at the cap)';
        else if(calc.blocked)     label = nm + ' — paused: ' + calc.blockReason;
        else if(calc.drip <= 0)   label = nm + ' — ' + (calc.blockReason || 'idle');
        else                      label = nm + ': +' + Math.round(calc.drip) + 'gp'
                                    + (calc.stepsWillComplete > 0 ? ' (+' + calc.stepsWillComplete + ' land value)' : '')
                                    + ' · ' + Math.max(0, Math.round(calc.budget - calc.drip)).toLocaleString() + 'gp budget left'
                                    + (calc.treasuryLimited ? ' · limited by treasury' : '');
        pendingRecords.push({
          kind: 'construction-progress', projectId: p.id, agriculturalDrip: true,
          name: nm, label: label, daysAdded: days, dripProjected: calc.drip,
          stepsWillComplete: calc.stepsWillComplete || 0,
          treasuryLimited: !!calc.treasuryLimited,
          budgetLeftAfter: Math.max(0, (calc.budget || 0) - (calc.drip || 0)),
          paused: !!calc.blocked, blockReason: calc.blockReason || '',
          willComplete: false, primaryHexId: p.siteHexId || null
        });
        // (Land improvement needs no engineer supervisor — RR p.174 reserves that for structures/
        // vessels. It builds at the labor rate; it only pauses for no budget or at the cap.)
        continue;
      }
      // realistic-construction OFF (current default): monthly no-op. Progress lands at month-end via
      // the instant monthly path in commitTurn; this record is a no-op for commitConstructionRecord.
      pendingRecords.push({
        kind: 'construction-progress', projectId: p.id,
        label: nm + ' — monthly investment (advances at month-end)', cadence: 'monthly',
        daysAdded: days, laborGained: 0,
        fromLaborInvested: p.laborInvested || 0, newLaborInvested: p.laborInvested || 0,
        fromDaysElapsed: p.daysElapsed || 0, newDaysElapsed: p.daysElapsed || 0,
        willComplete: false, primaryHexId: p.siteHexId || null
      });
      continue;
    }
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
      kind: 'construction-progress', projectId: p.id, name: name, label: label,
      daysAdded: days, laborGained: laborGained, laborRequired: p.laborRequired || 0,
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
  // Time-based agricultural drip (RR p.174). Recompute the drip authoritatively against the CURRENT
  // campaign state (so sequential same-month records deplete the treasury/budget correctly) and
  // apply it: drip gp from the treasury into the hex's invested (pay-as-you-build), reduce the
  // budget, ratchet the bonus on step completion, resync the Project mirror. A blocked / at-cap /
  // no-budget tick is a no-op. Non-drip agricultural records (the OFF-path monthly no-op) do nothing.
  if(p.constructibleKind === 'agricultural-improvement'){
    if(record.agriculturalDrip){
      const calc = computeAgriculturalDrip(campaign, p, record.daysAdded || 1);
      if(calc.drip > 0 && calc.domain && calc.hex){
        _applyDomainTreasuryDelta(campaign, calc.domain, -calc.drip, { reason: 'agricultural-improvement', label: 'agricultural land improvement (construction)' });
        calc.hex.improvementBudgetGp = Math.max(0, (calc.hex.improvementBudgetGp || 0) - calc.drip);
        calc.hex.landImprovementInvested = (calc.hex.landImprovementInvested || 0) + calc.drip;
        global.ACKS.ratchetAgriculturalImprovement(calc.hex);
        try { global.ACKS.syncAgriculturalProject(campaign, calc.hex, { domainId: calc.domain.id, turn: campaign.currentTurn || null }); } catch(e){}
      }
      p.daysElapsed = (p.daysElapsed || 0) + (record.daysAdded || 1);
    }
    return;
  }
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

// Activity-budget heads-up (#346 AB-3 / Joachim 2026-06-05): a READ-ONLY day consumer that flags
// any active character whose committed undertakings push them OVER their RAW day budget (e.g.
// travelling while administering a domain = two dedicated tasks; RR p.272 / JJ pp.99–100). Emits a
// TRANSIENT notable per over-budget character — transient so it drives the pause + the review-surface
// Activities list but never becomes an eventLog entry (it's advisory, not an occurrence). The
// pauseTrigger 'overbudget' + the default-ON `auto-pause-on-overbudget` rule stop a multi-day advance
// for GM review (Calendar §10.3/§13). No pendingRecords / no commit — it mutates nothing. Reads the
// budget off the working campaign (the UI attaches `domains` before proposeDayTick clones, so
// domain-admin gating resolves). Runs late (order 85, read-only) after the state-changing consumers.
registerDayConsumer('activity-budget', {
  order: 85,
  pauseTriggers: ['overbudget'],
  handler: function(campaign, ctx){
    const A = global.ACKS || {};
    const budget = A.characterActivityBudget;
    if(typeof budget !== 'function') return { pendingRecords: [], notableEvents: [], encounters: [] };
    const active = A.isActive;
    const chars = (campaign && Array.isArray(campaign.characters)) ? campaign.characters : [];
    const notableEvents = [];
    for(const ch of chars){
      if(!ch || !ch.id) continue;
      if(typeof active === 'function' && !active(ch)) continue;
      const b = budget(campaign, ch.id);
      if(!b || !b.overBudget) continue;
      const activityLabels = [].concat(b.dedicated || [], b.ancillary || []).map(a => a && a.label).filter(Boolean);
      notableEvents.push({
        kind: 'activity-overbudget',
        type: 'overbudget',
        pauseTrigger: 'overbudget',
        transient: true,                                  // advisory — never an eventLog entry
        characterId: ch.id,
        characterName: ch.name || '(unnamed)',
        reason: b.overReason || 'over the day budget',
        activityLabels: activityLabels,
        dedicatedUsed: b.dedicatedUsed,
        ancillaryUsed: b.ancillaryUsed,
        label: (ch.name || 'A character') + ' is over their activity budget — ' + (b.overReason || '')
      });
    }
    return { pendingRecords: [], notableEvents: notableEvents, encounters: [] };
  }
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

// eventLog entries are WRAPPED — { event:{…,context}, result, appliedAtTurn, appliedAt } — so the
// context envelope lives at entry.event.context. (Fixed 2026-06-04: these accessors previously read
// entry.context, which is never present on a wrapped entry, so EVERY derived history silently returned
// []. The `(e.event)||e` unwrap also tolerates a bare event object, should one ever be stored flat.)
function _eventContextOf(e){ const ev = (e && e.event) || e; return (ev && ev.context) || null; }

function hexHistory(campaign, hexId){
  if(!campaign || !hexId || !Array.isArray(campaign.eventLog)) return [];
  return campaign.eventLog.filter(e => {
    const c = _eventContextOf(e);
    if(!c) return false;
    if(c.primaryHexId === hexId) return true;
    if(Array.isArray(c.involvedHexIds) && c.involvedHexIds.indexOf(hexId) >= 0) return true;
    return false;
  });
}

function settlementHistory(campaign, settlementId){
  if(!campaign || !settlementId || !Array.isArray(campaign.eventLog)) return [];
  return campaign.eventLog.filter(e => { const c = _eventContextOf(e); return c && c.settlementId === settlementId; });
}

function _filterByRelatedEntity(campaign, kind, id){
  if(!campaign || !id || !Array.isArray(campaign.eventLog)) return [];
  return campaign.eventLog.filter(e => {
    const c = _eventContextOf(e);
    const rels = c && c.relatedEntities;
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
// Derived per-character event history (Travel pivot 2026-06-04). Returns every eventLog entry that
// names this character in its context envelope's relatedEntities — travel days (role 'traveller'),
// journey stops/re-routes, and any future character-tagged event. Complements the STORED
// character.history[] (recruitment / calamity / loyalty drift / level-up); a "what happened to this
// person" view merges the two. The travel days are now captured here because every committed travel
// day emits one comprehensive journey-day-tick event tagging all its travellers.
function characterHistory(campaign, id){      return _filterByRelatedEntity(campaign, 'character',      id); }
function outpostHistory(campaign, id){        return _filterByRelatedEntity(campaign, 'outpost',        id); }
function congregationHistory(campaign, id){   return _filterByRelatedEntity(campaign, 'congregation',   id); }

// Derived per-character activity budget (#346 / Phase_2.95_Activity_Budget_Plan.md AB-1).
// The middle layer of the actor-time stack (Architecture.md §7): a pure derivation — like
// characterHistory — of what this character is currently committed to, bucketed against the
// RAW 1-dedicated-+-4-ancillary day budget (ACTIVITY_BUDGET / ACTIVITY_COSTS, RR p.272 / JJ pp.99–100).
//
// Derive-don't-store (Architecture.md §3.13): the budget reads the committed undertakings that
// are ALREADY entities (the character's active Journeys + the domains they administer THIS month —
// ventures, construction supervision and the rest wire in at AB-4) and maps each through its
// activity-cost. (Domain admin is gated on the administers-this-month lever, not mere office-holding
// — see the domain loop below.) The
// entity-less errands (carouse / study / buy) union in via a seam (cost-tagged daily events or a
// thin buffer — built at AB-4, plan §9 / OQ1; empty for now). No parallel activityRecords[]
// ledger to shadow the undertakings and drift (the party.memberCharacterIds-mirror hazard, §3.3).
//
// Returns { charId, grain, dedicated:[…], ancillary:[…], incidental:[…], dedicatedUsed,
//   ancillaryUsed, overBudget, overReason, strenuousDays, fatigued }, each activity being
//   { kind, label, cost, strenuous, sourceKind, sourceId }. This is THIS GAME DAY's load — the
//   standing undertakings plus the day's cost-tagged errands (windowed to campaign.currentDayInMonth
//   within campaign.currentTurn); it refreshes each day-tick. The visible read surface lands in AB-3.
// Does an event engage this character as its acting subject? Used by the activity budget to
// attribute cost-tagged errand events (the market-transaction is the first). Reads the actor id
// off the payload, then the Event.context relatedEntities (role 'subject').
function _eventEngagesCharacter(ev, charId){
  if(!ev || !charId) return false;
  const p = ev.payload || {};
  if(p.actorCharacterId === charId || p.characterId === charId) return true;
  const re = (ev.context && ev.context.relatedEntities) || [];
  return re.some(r => r && r.kind === 'character' && r.id === charId);
}

function characterActivityBudget(campaign, charId, opts){
  opts = opts || {};
  const A = global.ACKS || {};
  const BUDGET = A.ACTIVITY_BUDGET || { dedicatedPerDay:1, ancillaryPerDedicatedDay:4, ancillaryMaxPerDay:12 };
  const costFor = A.activityCostFor || (k => ({ cost:'ancillary', strenuous:false, label:String(k) }));
  const char = (campaign && Array.isArray(campaign.characters)) ? campaign.characters.find(c => c && c.id === charId) : null;
  const activities = [];

  // ── Undertaking-derived contributions ──
  // Active journeys. Travel cost is PACE-dependent — travel is an explicit line in the activity
  // budget (JJ ancillary list: "Travel for 6 turns"; RR p.272), and the base rate is 3 mi/hour:
  //   • normal pace = full expedition speed (24 mi unencumbered) = the DEDICATED activity (8h;
  //     leaves 4 ancillary free to forage/shop on the same day — RR p.272).
  //   • half speed = 4 ANCILLARY activities (4h × 3 mi = 12 mi = ½ of 24); frees the dedicated slot.
  //   • forced march = the WHOLE day (1 dedicated + all 4 ancillary, +50%, strenuous — RR p.279).
  // So the budget GATES travel speed (Joachim 2026-06-05, "like encumbrance"): you can't travel
  // full-speed AND do another dedicated task (2 dedicated → over budget); to do both you drop to
  // half speed (4 ancillary, dedicated free). The over-budget check (units-summed below) enforces
  // it. 'resting' is the fatigue-clearing dedicated rest. 'planning'/'arrived'/'aborted' are out.
  // The half-day is 4 ancillary hours (½ of the 8-hour dedicated block), which equals the per-day
  // ancillary allowance — both 4. tickJourneyDay applies the pace ×-multiplier to distance; this is
  // the budget (cost) side. The pace charged is the EFFECTIVE pace — the GM's desired j.pace CAPPED
  // by what the traveller's other commitments leave room for (journeyEffectivePace; Joachim
  // 2026-06-05). So an administering ruler whose journey is set to 'normal' is charged at the capped
  // 'half-speed' (4 ancillary), and a fully-booked traveller at 'halted' (no travel cost) — the GM
  // never sees a phantom over-budget from a pace the day can't sustain. opts.excludeJourneyId omits
  // one journey entirely AND switches to STORED-pace (no cap) for any others — journeyMaxPace uses
  // that to read a traveller's "other load" without recursing back into the cap.
  const HALF_DAY_ANCILLARY = 4;   // 4 hours = half the 8-hour dedicated travel day
  const JOURNEY_ACTIVE = { 'in-transit':1, 'resting':1, 'lost':1 };
  // "What happened today" vs "what's underway now" (Joachim 2026-06-06): a journey that TRAVELLED on the
  // current world day still spent the party's day even if it has since ARRIVED (or been stopped) — so its
  // travel + forage stay on the budget for that day and roll off the next. lastTravelWorldOrd (turn*30 +
  // day, stamped by commitJourneyRecord on every committed leg) is the day it last travelled; when that
  // equals today's ord the party travelled (and foraged) today. This is the Complete-Movement-to-arrival
  // case the GM sees with the clock still on the arrival day; a Day-Clock advance moves the clock PAST the
  // leg, so an arrived journey then reads as yesterday's travel (correctly dropped).
  const _todayOrd = (((campaign && campaign.currentTurn) || 1) * 30) + (((campaign && campaign.currentDayInMonth) || 1));
  for(const j of journeysWithParticipant(campaign, charId)){
    if(!j) continue;
    const actedTodayJ = (j.lastTravelWorldOrd != null && j.lastTravelWorldOrd === _todayOrd);
    if(!JOURNEY_ACTIVE[j.status] && !actedTodayJ) continue;   // active now, OR it travelled today (now ended)
    if(opts.excludeJourneyId && j.id === opts.excludeJourneyId) continue;   // omit this journey (journeyMaxPace's "other load")
    if(j.status === 'resting'){
      const cc = costFor('rest');
      activities.push({ kind:'rest', label: cc.label, cost: cc.cost, strenuous: !!cc.strenuous, sourceKind:'journey', sourceId: j.id, dedicatedUnits:1, ancillaryUnits:0 });
      continue;
    }
    if(j.status === 'lost'){
      // E8 (RR p.285) — a KNOWINGLY-lost journey holds its position: no travel is spent, the
      // day is free for the landmark search (itself 1 ancillary when taken). Shown, not charged.
      activities.push({ kind:'travel', label:'Travel · lost — holding position', cost:'incidental', strenuous:false, sourceKind:'journey', sourceId: j.id, dedicatedUnits:0, ancillaryUnits:0 });
      continue;
    }
    // Effective pace = the GM's pace capped by the activity budget — but NOT when reading "other
    // load" (excludeJourneyId set), where we charge the stored pace to avoid recursing into the cap.
    let pace = j.pace || 'normal';
    if(!opts.excludeJourneyId){
      const eff = (typeof journeyEffectivePace === 'function') ? journeyEffectivePace(campaign, j) : pace;
      if(eff) pace = eff;
    }
    if(pace === 'halted'){
      activities.push({ kind:'travel', label:'Travel · halted (day full)', cost:'incidental', strenuous:false, sourceKind:'journey', sourceId: j.id, dedicatedUnits:0, ancillaryUnits:0 });
    } else if(pace === 'half-speed'){
      activities.push({ kind:'travel', label:'Travel · half speed', cost:'ancillary', strenuous:false, sourceKind:'journey', sourceId: j.id, dedicatedUnits:0, ancillaryUnits: HALF_DAY_ANCILLARY });
    } else if(pace === 'forced-march'){
      activities.push({ kind:'travel', label:'Travel · forced march', cost:'dedicated', strenuous:true, sourceKind:'journey', sourceId: j.id, dedicatedUnits:1, ancillaryUnits: HALF_DAY_ANCILLARY });
    } else {
      const cc = costFor('travel');
      activities.push({ kind:'travel', label: cc.label, cost: cc.cost, strenuous: !!cc.strenuous, sourceKind:'journey', sourceId: j.id, dedicatedUnits:1, ancillaryUnits:0 });
      // Foraging for water on the march is an ANCILLARY activity that rides in the normal-pace day's free
      // ancillary hours (RR p.272 — a full-speed day leaves 4 ancillary slots). Count it when the party is
      // set to forage for water AND the current hex has no free source (a river/lake/settlement needs no
      // foraging). Per traveller, derived from the journey — exactly like travel. (Half-speed/forced/halted
      // days already spend the ancillary hours on travel, so foraging doesn't ride along there.)
      if(j.forageWaterEnabled){
        const fhex = (typeof findHex === 'function') ? findHex(campaign, j.currentHexId || j.startHexId) : null;
        const sourced = (A.hasFreshSource && fhex) ? !!A.hasFreshSource(campaign, fhex) : false;
        if(!sourced){
          const fc = costFor('forage');
          activities.push({ kind:'forage', label: (fc.label || 'Forage') + ' for water', cost: (fc.cost || 'ancillary'), strenuous: !!fc.strenuous, sourceKind:'journey', sourceId: j.id });
        }
      }
    }
  }
  // Domain administration — RAW: "Administer a domain" IS a dedicated activity (RR p.352, "hold
  // court"), but only for whoever is ACTUALLY administering THIS month — the +1-domain-morale lever
  // (RR p.344/349; domain.administersThisMonth for the ruler, magistrates[role].administersThisMonth
  // for an officer), NOT merely holding the office. So a magistrate who hasn't ticked "administers
  // this month" spends no dedicated day; an administering ruler does (the old version counted any
  // magistracy-holder and missed administering rulers entirely). Counts an administering ruler + any
  // administering magistrate; dedupes per domain (ruler + an officer both administering one domain =
  // one administration). Mirrors the Activity projection's gate (index.html characterActivities
  // Contributor 2). Domains live on the campaign (single home) — read them directly.
  const _domains = (campaign && campaign.domains) || [];
  const seenDomains = {};
  for(const d of _domains){
    if(!d || !d.id || seenDomains[d.id]) continue;
    let administering = !!(d.administersThisMonth && d.rulerCharacterId === charId);
    if(!administering && d.magistrates){
      for(const rk of Object.keys(d.magistrates)){
        const slot = d.magistrates[rk];
        if(slot && slot.administersThisMonth && slot.characterId === charId){ administering = true; break; }
      }
    }
    if(administering){
      seenDomains[d.id] = 1;
      const cc = costFor('domain-admin');
      activities.push({ kind:'domain-admin', label: cc.label, cost: cc.cost, strenuous: !!cc.strenuous, sourceKind:'domain', sourceId: d.id });
    }
  }

  // Recruitment (Phase 2.95 #310) — soliciting hirelings is an ongoing ANCILLARY activity (RR p.164:
  // "These count as ancillary activities"), one per ACTIVE drive (per hireling type) per day while the
  // patron is in the market. Derived from the patron's active recruitmentDrives, exactly like travel
  // from a journey; the 'recruitment' day-consumer advances them (½/¼/remainder over 3 weeks).
  // "What happened today" (Joachim 2026-06-08): a drive also solicited on the DAY IT COMPLETED — the
  // week-3 reveal is the LAST of the 3 solicitation weeks, not a separate hiring day, so it should still
  // read as soliciting that day (then roll off). The drive completes deterministically at startedDayOrd
  // + 21 days (when elapsedWeeks first reaches 3 — RR p.164); compare to today on the RECRUIT ordinal
  // ((turn-1)*30 + day, the convention startedDayOrd is stamped with — distinct from the journey ordinal).
  if(char && Array.isArray(char.recruitmentDrives)){
    const _recruitTodayOrd = (((campaign && campaign.currentTurn) || 1) - 1) * 30 + (((campaign && campaign.currentDayInMonth) || 1));
    for(const d of char.recruitmentDrives){
      if(!d) continue;
      const completedToday = (d.status === 'complete' && d.startedDayOrd != null && (d.startedDayOrd + 21) === _recruitTodayOrd);
      if(d.status !== 'active' && !completedToday) continue;
      const cc = costFor('recruit');
      activities.push({ kind:'recruit', label: cc.label + (d.hireTypeLabel ? (' (' + d.hireTypeLabel + ')') : ''), cost: cc.cost, strenuous: !!cc.strenuous, sourceKind:'recruitment-drive', sourceId: d.id });
    }
  }

  // ── Entity-less errand store — cost-tagged daily events (OQ1 RESOLVED 2026-06-04, plan §9/§14) ──
  // The errand half of the hybrid: union the actor's cost-tagged events for THIS GAME DAY into the
  // budget. RAW refreshes the 1-dedicated-+-4-ancillary / 12-ancillary allowance each game DAY (not
  // each monthly turn), so the window is (appliedAtTurn, appliedAtDay) = (campaign.currentTurn,
  // campaign.currentDayInMonth) — both stamped by _logAppliedEvent at apply time. Advance the Day
  // Clock and the errands clear; commitTurn rolls the day back to 1. A cost-tagged event carries
  // payload.activityCost = { slot, units, kind, strenuous? } — the market-transaction is the first
  // (future carouse / rest / study / buy join the same way; each MUST be day-stamped). Derived from
  // the eventLog like characterHistory; NO activityRecords[]/activityLog[] buffer (rejected option
  // (b)). NB the monthly 10× availability ceiling is a SEPARATE, month-windowed concern
  // (marketUnitsTransactedThisMonth, RR p.124) — don't conflate the two windows.
  const _turnWindow = (campaign && campaign.currentTurn) || 1;
  const _dayWindow  = (campaign && campaign.currentDayInMonth) || 1;
  const _log = (campaign && Array.isArray(campaign.eventLog)) ? campaign.eventLog : [];
  for(const entry of _log){
    const ev = entry && entry.event; if(!ev) continue;
    if(ev.payload && ev.payload.reversed) continue;   // a refunded/unwound transaction is no longer today's activity (reverseMarketTransaction)
    const ac = ev.payload && ev.payload.activityCost; if(!ac || !ac.slot) continue;
    const at = (entry.appliedAtTurn != null) ? entry.appliedAtTurn : ev.appliedAtTurn;
    if(at != null && at !== _turnWindow) continue;                   // window: this turn (month)…
    const atDay = (entry.appliedAtDay != null) ? entry.appliedAtDay : ev.appliedAtDay;
    if(atDay !== _dayWindow) continue;                               // …and THIS game day (strict): an un-day-stamped (pre-update / legacy) errand isn't attributable to *today*, so it's excluded from the daily budget. It still appears in turn-windowed history + counts toward the monthly availability ceiling. Every new cost-tagged event IS stamped (in _logAppliedEvent), so a current errand never falls through here.
    if(!_eventEngagesCharacter(ev, charId)) continue;                // the acting character
    const cc = costFor(ac.kind || '');
    const units = Math.max(1, Number(ac.units) || 1);
    const label = ac.label || cc.label;
    const strenuous = (ac.strenuous != null) ? !!ac.strenuous : !!cc.strenuous;
    for(let i = 0; i < units; i++){
      activities.push({ kind: ac.kind || 'errand', label, cost: ac.slot, strenuous, sourceKind:'errand-event', sourceId: ev.id });
    }
  }

  // ── Bucket by cost (for display) ──
  const dedicated = activities.filter(a => a.cost === 'dedicated');
  const ancillary = activities.filter(a => a.cost === 'ancillary');
  const incidental = activities.filter(a => a.cost === 'incidental');

  // ── Unit-summed usage ── An activity may weigh more than one slot: half-speed travel = 4 ancillary
  // hours; forced march = 1 dedicated + 4 ancillary (the whole day). So count UNITS, not entries —
  // dedicatedUnits / ancillaryUnits when set, else default from cost (a plain dedicated task = 1
  // dedicated; a plain errand = 1 ancillary). Keeps the over-budget gate honest while each undertaking
  // stays a single row (a half-speed journey is one "Travel · half speed · 4h" line, not four).
  const _ded = a => (a.dedicatedUnits != null) ? a.dedicatedUnits : (a.cost === 'dedicated' ? 1 : 0);
  const _anc = a => (a.ancillaryUnits != null) ? a.ancillaryUnits : (a.cost === 'ancillary' ? 1 : 0);
  const dedUsed = activities.reduce((s, a) => s + _ded(a), 0);
  const ancUsed = activities.reduce((s, a) => s + _anc(a), 0);

  // ── Over-budget (RAW: 1 dedicated + up to 4 ancillary, OR up to 12 ancillary with no dedicated) ──
  let overBudget = false, overReason = null;
  if(dedUsed > BUDGET.dedicatedPerDay){
    overBudget = true; overReason = dedUsed + ' dedicated tasks (max ' + BUDGET.dedicatedPerDay + ')';
  } else if(dedUsed >= 1 && ancUsed > BUDGET.ancillaryPerDedicatedDay){
    overBudget = true; overReason = ancUsed + ' ancillary alongside a dedicated task (max ' + BUDGET.ancillaryPerDedicatedDay + ')';
  } else if(dedUsed === 0 && ancUsed > BUDGET.ancillaryMaxPerDay){
    overBudget = true; overReason = ancUsed + ' ancillary errands (max ' + BUDGET.ancillaryMaxPerDay + ')';
  }

  // ── Strenuous → rest fatigue (RR p.279) — read the shipped per-character counter ──
  const strenuousDays = (char && typeof char.personalFatigue === 'number') ? char.personalFatigue : 0;
  const simplifiedFatigue = isHouseRuleEnabled(campaign, 'simplified-fatigue');
  const cycle = A.JOURNEY_FATIGUE_CYCLE_DAYS || 6;
  const fatigued = !simplifiedFatigue && strenuousDays >= cycle;

  return {
    charId,
    grain: opts.grain || 'current',
    dedicated, ancillary, incidental,
    dedicatedUsed: dedUsed,
    ancillaryUsed: ancUsed,
    overBudget, overReason,
    strenuousDays, fatigued
  };
}

// ── Travel pace ↔ activity budget: the day's activities CAP the achievable pace (Joachim 2026-06-05,
// "the daily pace choice should be restricted by the activity budget … a Halted (×0) pace"). The four
// paces ranked by speed; each costs a known slice of the day (per the pace-aware travel charge above):
//   forced-march = 1 dedicated + 4 ancillary (the whole day) · normal = 1 dedicated · half-speed = 4
//   ancillary · halted = nothing. A pace FITS a traveller iff, ADDED to their OTHER commitments, the
// day still satisfies RAW (≤1 dedicated; ≤4 ancillary with a dedicated, else ≤12). The fastest pace
// that fits is that traveller's cap; the party's cap is the SLOWEST traveller's (everyone must sustain
// the chosen pace). So an administering ruler caps the party at half speed, and a fully-booked one at
// halted. RAW-grounded in the travel-as-an-activity model; the cap itself is project doctrine.
const PACE_RANK = Object.freeze({ 'halted':0, 'half-speed':1, 'normal':2, 'forced-march':3 });
const RANK_PACE = Object.freeze(['halted', 'half-speed', 'normal', 'forced-march']);
const PACE_COST = Object.freeze({
  'forced-march': { d:1, a:4 }, 'normal': { d:1, a:0 }, 'half-speed': { d:0, a:4 }, 'halted': { d:0, a:0 }
});
// Does `pace` fit a traveller who already spends otherDed dedicated + otherAnc ancillary units?
function _travelPaceFits(otherDed, otherAnc, pace, BUDGET){
  const c = PACE_COST[pace] || PACE_COST.halted;
  const totalDed = otherDed + c.d;
  if(totalDed > BUDGET.dedicatedPerDay) return false;
  const ancCap = (totalDed >= 1) ? BUDGET.ancillaryPerDedicatedDay : BUDGET.ancillaryMaxPerDay;
  return (otherAnc + c.a) <= ancCap;
}
// Fastest pace a traveller with (otherDed, otherAnc) of OTHER load can sustain.
function _maxPaceForLoad(otherDed, otherAnc, BUDGET){
  for(const p of ['forced-march', 'normal', 'half-speed', 'halted']){
    if(_travelPaceFits(otherDed, otherAnc, p, BUDGET)) return p;
  }
  return 'halted';
}
// #476 E5 — the live follow steering this journey, if any (DERIVED — the pursuit lives on
// the tracked encounter, the journey carries no mirror field): the encounter whose
// direction-'party' pursuit is 'tracking' and names this journey. Read by journeyMaxPace
// (the RR p.120 half-speed cap), tickJourneyDay (no Navigation throw while the spoor
// leads) and the journey-panel strip. Returns { encounterId, pursuit } or null.
function journeyTrackingPursuit(campaign, journeyId){
  if(!campaign || !journeyId) return null;
  for(const e of (campaign.encounters || [])){
    const p = e && e.pursuit;
    if(p && p.direction === 'party' && p.status === 'tracking' && p.journeyId === journeyId)
      return { encounterId: e.id, pursuit: p };
  }
  return null;
}
// The fastest pace the WHOLE party can sustain = the slowest individual cap across its character
// travellers (mercenaries have no budget). Returns { maxPace, binding } where binding names the
// constraining traveller + why (for the UI's "pace restricted because…" text). Reads each traveller's
// OTHER load via characterActivityBudget(excludeJourneyId) (stored-pace, no recursion — see above).
function journeyMaxPace(campaign, journey, opts){
  opts = opts || {};
  const A = global.ACKS || {};
  const BUDGET = A.ACTIVITY_BUDGET || { dedicatedPerDay:1, ancillaryPerDedicatedDay:4, ancillaryMaxPerDay:12 };
  const ids = (journey && Array.isArray(journey.participantCharacterIds)) ? journey.participantCharacterIds : [];
  const chars = (campaign && Array.isArray(campaign.characters)) ? campaign.characters : [];
  let maxRank = PACE_RANK['forced-march'];   // unconstrained ceiling
  let binding = null;
  for(const cid of ids){
    const ch = chars.find(c => c && c.id === cid);
    if(!ch) continue;
    const b = characterActivityBudget(campaign, cid, { excludeJourneyId: journey.id });
    const cap = _maxPaceForLoad(b.dedicatedUsed, b.ancillaryUsed, BUDGET);
    if(PACE_RANK[cap] < maxRank){
      maxRank = PACE_RANK[cap];
      binding = { characterId: cid, name: ch.name || cid, maxPace: cap, otherDedicated: b.dedicatedUsed, otherAncillary: b.ancillaryUsed };
    }
  }
  // E5 — a party following tracks moves at HALF expedition speed (RR p.120), whatever the
  // budget would allow: an active follow on this journey caps the pace at half-speed.
  const tracking = journeyTrackingPursuit(campaign, journey && journey.id);
  if(tracking && PACE_RANK['half-speed'] < maxRank){
    maxRank = PACE_RANK['half-speed'];
    binding = { characterId: null, name: 'tracking ' + ((tracking.pursuit && tracking.pursuit.quarryLabel) || 'a quarry') + ' (RR p.120)',
                maxPace: 'half-speed', reason: 'tracking', otherDedicated: 0, otherAncillary: 0 };
  }
  return { maxPace: RANK_PACE[maxRank], binding };
}
// The GM's desired journey.pace, capped by journeyMaxPace. The value tickJourneyDay + the budget use.
function journeyEffectivePace(campaign, journey, opts){
  const desired = (journey && journey.pace) || 'normal';
  const cap = journeyMaxPace(campaign, journey, opts).maxPace;
  const dr = (PACE_RANK[desired] != null) ? PACE_RANK[desired] : PACE_RANK['normal'];
  return (dr <= PACE_RANK[cap]) ? desired : cap;
}

// What kind of "reject" does an activity support, and what's the button label? (Joachim 2026-06-05,
// the Current Activities table.) Rejecting a derived activity reaches back to its SOURCE — and the
// undo differs because the sources have three temporal natures: a standing monthly commitment
// (domain admin → WITHDRAW it: untick administersThisMonth), a completed atomic act (a market trade
// → REVERSE it: reverseMarketTransaction), an ongoing process (a journey → can't rewind a travelled
// day; NAVIGATE to it and Stop Moving). Other errand kinds (future carouse/study/rest) aren't
// reversible yet → 'none'. Pure (the UI dispatches on .mode); keeps button labels consistent.
// Returns { mode:'reverse'|'navigate'|'none', label, verb }.
function activityRejectAffordance(activity){
  if(!activity) return { mode:'none', label:'', verb:'' };
  switch(activity.sourceKind){
    case 'domain':  return { mode:'reverse',  label:'Untick admin', verb:'untick' };
    case 'journey': return { mode:'navigate', label:'Go to journey', verb:'navigate' };
    case 'recruitment-drive': return { mode:'navigate', label:'Go to Recruit', verb:'navigate' };  // a search is an ongoing process — open it + Stop soliciting (like a journey)
    case 'errand-event':
      return (activity.kind === 'market-transaction')
        ? { mode:'reverse', label:'Refund', verb:'refund' }
        : { mode:'none', label:'', verb:'' };
    default: return { mode:'none', label:'', verb:'' };
  }
}

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
// Reconcile each party's stored member mirror + leader from the canonical truth
// (character.partyId). Per Architecture §3.3 the live membership is the reverse index
// character.partyId; party.memberCharacterIds is a derived mirror kept in the saved JSON so a
// party is self-describing for integrators (principle #7). This rebuilds the mirror and
// guarantees leaderCharacterId points at an actual current member (or null). Idempotent —
// runs in migrateCampaign and after each UI membership mutation. (#521 follow-up, 2026-06-02.)
function reconcilePartyMembership(campaign){
  if(!campaign || !Array.isArray(campaign.parties)) return campaign;
  const chars = Array.isArray(campaign.characters) ? campaign.characters : [];
  for(const pt of campaign.parties){
    if(!pt) continue;
    const members = chars.filter(c => c && c.partyId === pt.id).map(c => c.id);
    pt.memberCharacterIds = members;
    if(!pt.leaderCharacterId || !members.includes(pt.leaderCharacterId)){
      pt.leaderCharacterId = members.length ? members[0] : null;
    }
  }
  return campaign;
}

const ACKS = Object.assign(global.ACKS || {}, {
  // Engine helpers
  isHouseRuleEnabled,
  // #521 Party-as-actor helpers (2026-05-30) + membership reconcile (2026-06-02)
  findParty, partiesAtHex, partiesAtSettlement, partiesInDomain, activeParties, reconcilePartyMembership,
  // #528 Event Context Envelope (Architecture.md §3.5 Wave Hex-history — 2026-05-30)
  hexHistory, settlementHistory, constructibleHistory, groupHistory, notableItemHistory,
  domainHistory, partyHistory, journeyHistory, outpostHistory, congregationHistory, characterHistory,
  setEventContext,
  // Phase 2.95 Activity Budget (#346 / AB-1) — derived per-character daily activity budget.
  characterActivityBudget, activityRejectAffordance,
  // Travel pace ↔ budget: the day's activities cap the achievable pace (Joachim 2026-06-05).
  journeyMaxPace, journeyEffectivePace, journeyTrackingPursuit,
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
  // Time-based construction (RR p.174) — rate + supervisor-adequacy + per-day drip
  AGRICULTURAL_CONSTRUCTION_RATE_PER_DAY, agriculturalConstructionRatePerDay, agriculturalSupervisorAdequacy,
  constructionSupervisorCapForCharacter, computeAgriculturalDrip,
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
  // RAW precise tribute formula (RR p.346): 18gp × realm-families^0.6, rounded to 5gp
  rawTributeForRealmFamilies,

  // Dice + rolls
  rollD6, rollD20, rollD10x, clamp,
  rollNaturalIncrease, rollNaturalDecrease, rollMoraleExtra,
  moraleChangeFromRoll, baseMoraleFromClassification, strongholdMoralePenalty,
  DOMAIN_CLASSIFICATIONS, suggestDomainClassification, effectiveDomainClassification,

  // Foundation #241 — rural population: canonical setter + reconciliation.
  // Tools/UI MUST go through setPeasantPopulation for any rural population change.
  setPeasantPopulation, syncRuralPopulationFromHexes, reconcileRuralPopulation,

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
  // Phase 2.95 Stash B engine foundation — carry↔stash + controller + bands (2026-06-03)
  findOrCreateStashAt, transferCarryToStash, transferStashToCarry, changeStashController,
  // Items I1 Step 3 — character⇄co-located-stash transfer (purse + Phase-2.6 carry; 2026-06-03)
  cacheToStash, drawFromStash,
  // Items I1 / Stash B — party camp stash (travels with the party; leader-takes-all on disband)
  partyCampStash, ensurePartyCampStash, syncAllPartyCampStashes, syncPartyCampHex, handOffPartyCampToLeader,
  carryEncumbranceLevel, carryEncumbranceInfo, carryEncumbranceBandFor, CARRY_ENCUMBRANCE_BANDS,
  // Phase 2.95 Stash A.3 — treasury migration + canonical gp read (#468 / 2026-05-29)
  migrateDomainTreasuryToStash, migrateAllDomainTreasuries, domainTreasuryGp,
  // Phase 2.95 Stash A.4 — canonical-setter invariant + item-consolidation reconcile (#469 / 2026-05-29)
  reconcileStashItems, reconcileAllStashes, reconcileTreasuryScalars,
  // Items I1 — facet item model + valuation + promotion + migration (OQ9, 2026-06-03)
  itemFacets, itemHasFacet, primaryFacet, itemEncumbranceSt, itemValueGp, COIN_GP_VALUE,
  stashTotalGp, stashTotalEncumbrance, carryTotalEncumbrance,
  // Phase 2.5 Provisioning — food/water inventory accessors (RR p.278)
  RATION_FOOD_ST_PER_DAY, RATION_WATER_ST_PER_DAY, waterContainerDaysFor, waterCapacityDays,
  isRationLine, rationLineDays, makeRationLine, rationDaysAvailable,
  promoteLineToNotableItem, notableItemFacets,
  migrateStashItemShape, migrateAllStashItemShapes,
  // Items I1 — character coin purse (multi-denomination; coins.gp canonical, personalGp mirror)
  COIN_DENOMINATIONS, normalizeCoins, characterCoinCount, characterCoinValueGp, characterCoinWeightSt,
  reconcileCharacterCoins, migrateAllCharacterCoins,
  // Wave B.5 — Notable items + custody read-only lookups (2026-05-29)
  findNotableItem, findItemCustody, currentCustodyOfItem,
  notableItemsInCustodian, notableItemsHeldByCharacter, notableItemsAtHex,
  // #442 — Group entity lookups (Architecture.md §2.4, 2026-05-29)
  findGroup, groupsAtHex, groupsByCatalogKey, groupsCommandedBy, groupActiveCount,
  // Phase 3 Military W1 (2026-06-12) — Units & Armies: lookups, the shared battle interface
  // (unitBattleRating reads TROOP_CATALOG; groupBattleRating reads the MM per-creature BR),
  // officer characteristics (RR pp.435–437), stationing setter + the garrison lift.
  findUnit, findArmy, unitsStationedAt, armiesAtHex, unitActiveCount,
  armyUnits, armyDivisionForUnit, unitTroopRow, unitMarchMilesPerDay, unitCurrentHexId,
  unitBattleRating, groupBattleRating, unitWagePerSoldier, unitWageMonthly,
  unitWeeklySupplyCost, unitMoraleScore,
  proficiencyRanks, hasProficiencyNamed,
  leadershipAbility, strategicAbility, effectiveStrategicAbility, officerMoraleModifier,
  qualifiesAsOfficer, qualifiesAsCommander, qualifiesAsLieutenant,
  armyBattleRating, armyWageMonthly, armyWeeklySupplyCost, armyMaxDivisions,
  validateArmyOrganization, stationUnit, disbandUnit, createArmy, disbandArmy, callUpUnit, armyIncomingUnits, migrateGarrisonUnitsToUnits,
  // §12 Group model — the shared interface over party/army/unit/band (Architecture.md §12)
  groupKindOf, groupKindMeta, groupDisplayName, groupMembers, groupLeader, groupFormations,
  groupHeadcount, groupPosition, groupJourney, groupSpeed, groupLogistics, groupContainer,
  groupIsAutonomous, groupLifecycleState, groupRow, looseUnits, worldGroups, groupForJourney, musterArmyFromParty,
  // Phase 3 Military W2 — the Vagaries of Incursion derived reads (JJ pp.100–106)
  domainTerritoryHexCount, domainBorderConfiguration, domainEffectiveTerritory,
  domainIncursionClassification, domainDailyEncounterChance,
  unitPlatoonScaleBr, domainGarrisonPlatoonBr, monsterPlatoonBr,
  // #476 Monster Persistence M0 — Lair lookups + the legacy hex.lairs[] lift (2026-06-09)
  findLair, lairsAtHex, lairsByMonsterKey, activeLairs, clearedLairs, lairInhabitantCount, migrateLegacyHexLairs,
  // #476 M1 — Lair lifecycle setters + terrain-keyed density seeding (Plan §13)
  createLair, clearLair, discoverLair, abandonLair, destroyLair, revealDynamicLair,
  generateLair, _rollDiceStr, lairEncounterProposal,
  rollLairCount, lairDiceForTerrain, lairDiceForHex, seedHexLairs, lairDiceMax, hexLairCapacity,
  // #476 M4 — securing consequence (RR p.338): live lairs block settling the hex (DC-0 consumes)
  hexSecuringBlockers,
  // #476 Encounter layer E1 — the Encounter entity + the draw seam (D8–D12, plan §15)
  findEncounter, encountersAtHex, activeEncounters, encounterDisplayName, priorReactionBetween,
  createEncounter, resolveEncounter, encounterDraw, createEncounterFromDraw,
  bindEncounterIdentity, _applyIdentityBinding, _unwindEncounterMinting, looseMonsterBands,
  // #443 — Wave A relation setters + active-relation lookups (Architecture.md §3.5, 2026-05-29)
  createHenchmanship, endHenchmanship, activeHenchmanshipFor, henchmanshipsByPatron,
  createSpecialistContract, endSpecialistContract, activeSpecialistContractFor, specialistContractsByEmployer,
  createHirelingContract, endHirelingContract, activeHirelingContractFor, hirelingContractsByEmployer,
  createMagistracy, endMagistracy, activeMagistracyOf, magistraciesByCharacter, magistraciesByDomain,
  createVassalage, endVassalage, activeVassalageOf, vassalagesBySuzerain,
  createTributaryAgreement, endTributaryAgreement, activeTributaryAgreementsFrom, activeTributaryAgreementsTo,
  // Favors & Duties (#230, F&D-1 — RR pp.345–348) — relation setters, lookups, balance, monthly roll
  createFavorDutyObligation, revokeFavorDutyObligation, spendOneTimeFavorObligation,
  activeFavorDutyObligationsFor, favorDutyObligationsForVassalDomain, realmFamiliesForDomain,
  favorDutyBalance, processFavorsAndDutiesForTurn,
  applyFavorDutyEdictByKind, revokeFavorDutyEdict, giveLoanObligation,
  setScutageAutoPay, payScutageObligation, stopScutagePayment,
  scutageRate, scutageMonthlyGp, councilAttendanceStatus, sendVassalToCouncil,
  isLittoralDomain, constructionDutyTypeAllowed, constructionDutyTargetGp, constructionDutyProgress,
  addConstructionOrder, removeConstructionOrder, officeLoyaltyBonusFor,
  // #444 — Wave A derived accessors + reconcile (Architecture.md §3.6, 2026-05-29)
  derivedSocialTierFor, derivedLiegeFor, derivedEmployerFor,
  derivedMagistrateRolesFor, derivedVassalDomainsOf, derivedTributeOutflowGpFor,
  reconcileWaveARelations,
  // CoL-1 (Phase 2.5 Provisioning §16.1) — settled/field regime predicate + group/companion lifestyle
  characterProvisioningRegime, groupProvisioningRegime, groupProvisioningInfo,
  characterCohort, characterEffectiveRegime, characterEffectiveProvisioningInfo,
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
  hasMercantileNetwork,
  isVassalRuler,
  displayKind, lifecycleLabel,
  settlementForHex, settlementsForDomain, rumorsAtSettlement, rumorsInDomain, rumorReachAt,
  addRumorReach, removeRumorReach,
  liftToTopLevelCollections, reconcileHexDomainMembership,
  // Phase 2.5 Journeys (#475) — lookups + helpers (J1)
  findJourney, journeysInTransit, journeysWithParticipant, resolveHexAnywhere, hexAtCoord, hexAxialDistance, isJourney,

  // Turn orchestration (Foundation #15 → fully engine-owned, audit batch 3 — no helpers bag).
  // proposeMonthlyTurn(campaign, options?) / commitTurn(campaign, proposal, options?); options.rng injectable.
  // The ACKS economy ruleset lives in acks-engine-economy.js (incomeBreakdown / expenseBreakdown / …).
  proposeMonthlyTurn, commitTurn,
  // §9.8a orchestration-tail helpers lifted from the Alpine UI (audit batch 3). UI delegates to these.
  addCharacterHistory, recordAppliedEvent, summarizeEventTarget, summarizeEventPayload,
  passiveInvestmentRate, passiveInvestmentMonthlyGp, processPassiveInvestmentsForTurn,
  applyVagaryToVenture, levelUpCharacter, checkAllCharacterLevelUps,
  // Cost of Living (Phase 2.5 §16 CoL-2 — RR p.173 + p.168).
  processLivingExpensesForTurn, apparentLevel, apparentLevelLoyaltyPenalty,
  characterExpenseBreakdown, henchmanMonthlyWage, henchmanWageWaiver
});
// Object.freeze omitted: later modules (subsystems, future splits) extend the namespace.

if(typeof module !== 'undefined' && module.exports){
  module.exports = ACKS;
}
global.ACKS = ACKS;

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
