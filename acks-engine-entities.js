/* =============================================================================
 * acks-engine-entities.js — ACKS God Mode Entity Factories (Module 4)
 *
 * Extracted from acks-engine.js §7 on 2026-05-28. Contains:
 *   - blank* factories for every persisted entity (campaign, domain, hex,
 *     settlement, lair, dungeon, POI, land-improvement-project, garrison unit,
 *     specialist, stronghold structure, stronghold component, character,
 *     party, venture, passive investment)
 *   - Foundation #16 stronghold-component helpers (migrate, totalValue)
 *   - Foundation #17 agricultural-improvement helpers (constants + ratchet,
 *     migration helpers for hex shape)
 *
 * Each factory uses newId() and SCHEMA_VERSION from the core engine. They are
 * accessed via local aliases pointing at global.ACKS at runtime.
 *
 * Load order: AFTER acks-engine.js so SCHEMA_VERSION / newId are available.
 * =============================================================================
 */
(function(global){
'use strict';

const SCHEMA_VERSION = 2;
const newId = function(...a){ return global.ACKS.newId(...a); };
// Constants referenced inside factory bodies — proxy through the namespace.
const ID_PREFIXES = new Proxy({}, { get(_, key){ return (global.ACKS.ID_PREFIXES||{})[key]; } });

// =============================================================================
// 7. ENTITY FACTORIES (v2 schema)
// =============================================================================
// Every factory:
//   - Assigns a stable id via newId() when one isn't provided
//   - Sets schemaVersion: 2 at the entity level
//   - Reserves future-subsystem fields explicitly (nil-valued)
//   - Avoids denormalized display copies — references go through IDs
// =============================================================================

function blankCampaign(opts={}){
  const name = opts.name || 'New Campaign';
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'campaign',
    id: opts.id || newId(ID_PREFIXES.campaign),
    name,
    createdAt: opts.createdAt || new Date().toISOString().slice(0,10),
    lastModifiedAt: new Date().toISOString().slice(0,10),
    currentTurn: opts.currentTurn || 1,
    // Optional Auran-calendar fields, reserved for Phase 2.95 (calendar subsystem)
    calendar: opts.calendar || { year: null, month: null, day: null, season: null },
    houseRules: opts.houseRules || {},
    // Reserved for Phase 6 Claude integration
    campaignContext: opts.campaignContext || { theme:'', tone:'', season:'', aiNotes:'' },
    // Collections
    domains: opts.domains || [],
    characters: opts.characters || [],
    parties: opts.parties || [],
    ventures: opts.ventures || [],
    passiveInvestments: opts.passiveInvestments || [],
    // campaign.log[] removed 2026-05-28 (Foundation #234). The Campaign Log view now
    // derives from eventLog. migrateCampaign drops any legacy log array on load.
    // Reserved for Phase 2.8 Rumors, Phase 4 Religion, Phase 4 Banking
    deities: opts.deities || [],
    banks: opts.banks || [],
    loans: opts.loans || [],
    // Turn Cycle v2 (Foundation #178) — typed-event inbox + immutable history.
    // pendingEvents are submitted by GM / players / tools / agents and await resolution at Advance Month.
    // eventLog is append-only history of everything that has been applied or rejected, with attribution.
    pendingEvents: opts.pendingEvents || [],
    eventLog: opts.eventLog || [],
    // Top-Level Collections Refactor (Foundation #193) — hexes, settlements, rumors live here.
    // Each entry carries a reference id back to its parent (Hex.domainId, Settlement.hexId).
    // Rumors carry a reach[] array of {settlementId, apparentLevel, gainedAtTurn, distortedText} entries.
    // liftToTopLevelCollections() populates these from legacy nested storage on load (idempotent).
    hexes: opts.hexes || [],
    settlements: opts.settlements || [],
    rumors: opts.rumors || [],
    // Phase 2.95 Stash A (2026-05-29) — Stash subsystem top-level collection.
    // Gated by inventory-stash-system house rule (default ON). When OFF, this
    // array is stripped at save time per the house-rule-gating memory.
    stashes: opts.stashes || [],
    // Wave A relation collections (Architecture.md §3.5 — landed alongside Stash A).
    // These are empty containers in commit 2; setters / accessors / migrations
    // land in later commits per the wave plan. Each carries its own history[].
    henchmanships: opts.henchmanships || [],
    specialistContracts: opts.specialistContracts || [],
    hirelingContracts: opts.hirelingContracts || [],
    magistracies: opts.magistracies || [],
    vassalages: opts.vassalages || [],
    tributaryAgreements: opts.tributaryAgreements || [],
    // Wave B.5 (Architecture.md §3.7) — Notable items + custody. Empty containers in
    // commit 2; setters / promote-to-notable / custody-transfer land in B.5.2.
    // Gated by notable-items-tracking house rule (default OFF until UI ships).
    notableItems: opts.notableItems || [],
    itemCustody: opts.itemCustody || [],
    // #442 (Architecture.md §2.4) — Group entity: count-level abstraction for kobold
    // packs, bandit gangs, abstract militia, and future DaW Units. Empty by default;
    // the data layer is a benign no-op until Phase 3 Military surfaces it.
    groups: opts.groups || [],
    // 2026-05-30 post-survey reservations — additive optional collections + fields.
    // None are functional yet; consumer subsystems ship in v1.0. See Data_Dictionary §13.2.
    // Calendar day-tick pipeline (#478) — global day clock; 1 means start-of-month.
    currentDayInMonth: opts.currentDayInMonth || 1,
    // Phase 2.5 Journeys (#475) — day-tick consumer entity (sole entity in this collection
    // is the Journey; Journey day records nest as journey.dayRecords[]).
    journeys: opts.journeys || [],
    // Phase 2.95 Outposts (#395) — persistent located containers (formerly "Camps").
    outposts: opts.outposts || [],
    // Phase 3.5 Delves — Dungeon as first-class entity (separate from Lair); Abstract
    // Dungeons + Sanctum Attunement both reference. Distinct from hex.dungeons[] legacy nested data.
    dungeons: opts.dungeons || [],
    // Wave E (Architecture.md §3.5) — Religion + Sanctums relation entities
    congregations: opts.congregations || [],
    divineFavors:  opts.divineFavors  || [],
    attunements:   opts.attunements   || [],
    // Wave F (Architecture.md §3.5) — Settlement Adventures relation entity
    settlementVisits: opts.settlementVisits || [],
    // Wave D + Phase 6 Codes shared — Oath relation entity (Architecture.md §3.5 Wave D)
    oaths: opts.oaths || [],
    // Phase 5 Domain Variants (gap K) — domain incursion event log
    vagaryOfIncursionEvents: opts.vagaryOfIncursionEvents || [],
    // Phase 4 Construction Wave A (Architecture.md §10 — 2026-05-30) — Project + Constructible
    projects:       opts.projects       || [],
    constructibles: opts.constructibles || []
  };
}

function blankDomain(opts={}){
  const name = opts.name || 'New Domain';
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: 'domain',
    id: opts.id || newId(ID_PREFIXES.domain),
    name,
    createdAt: opts.createdAt || new Date().toISOString().slice(0,10),
    lastModifiedAt: new Date().toISOString().slice(0,10),
    type: opts.type || 'rural',
    classification: opts.classification || 'Borderlands',
    tags: opts.tags || [],
    // Ruler — v2: ONLY the character ID. The legacy `ruler:{...}` struct is gone.
    rulerCharacterId: opts.rulerCharacterId || null,
    // Per-turn state that used to live on ruler.administersThisMonth — moved up to the domain
    administersThisMonth: opts.administersThisMonth || false,
    // Vassalage
    liegeId: opts.liegeId || null,
    vassalIds: opts.vassalIds || [],
    isRealm: opts.isRealm || false,
    // Geography (hexes live here for v2; canonical-store lift to campaign-level remains deferred per task #119)
    geography: opts.geography || {
      hexMapId: null,
      primaryHex: { q:0, r:0 },
      hexScale: '6-mile',
      controlledHexes: 1,
      claimedHexes: 1,
      controlledHexList: [],
      hexes: [],
      terrain: '',
      features: []
    },
    // Population, treasury, income, expenses
    demographics: opts.demographics || { peasantFamilies:75, urbanFamilies:0, morale:0, moraleNotes:'' },
    treasury: opts.treasury || { gp: 0 },
    income: opts.income || {
      landRevenuePerFamily: 6,
      serviceRevenuePerFamily: 4,
      miscPerFamily: opts.income?.miscPerFamily || 0,
      miscFlat: opts.income?.miscFlat || 0,
      taxPerFamily: 2,
      tributesIn: [],          // [{ fromDomainId, gpPerMonth, notes }]
      tariffs: 0,
      urbanRevenue: 0,
      other: []
    },
    expenses: opts.expenses || {
      garrisonMonthly: 0,
      liturgyPerFamily: 1,
      miscPerFamily: opts.expenses?.miscPerFamily || 0,
      miscFlat: opts.expenses?.miscFlat || 0,
      tithesOut: [],           // [{ toDomainId, gpPerMonth, notes }]
      titheMonthly: 0,
      tithePaid: true,
      strongholdMaintenance: 0,
      personalExpenses: 0,
      tributeToLiege: 0,
      tributeAuto: true,
      tributePct: 10,
      tributePaid: true,
      other: []
    },
    taxPolicy: opts.taxPolicy || { rate:'standard', moraleImpact:0 },
    // Forces — units carry IDs in v2; future Forces tab (#41) uses them
    garrison: opts.garrison || { units: [], totalMonthlyCost: 0, totalBR: 0 },
    // Foundation #16 — stronghold is now a list of components. A domain can have multiple
    // fortifications (Tower + Castle + Vault, etc.); each component carries its own type,
    // buildValue, and per-building catalog. garrisonCapacity sums across components.
    stronghold: opts.stronghold || { components: [], maintenancePerMonth:0, garrisonCapacity:0 },
    // Foundation #18 — monthly labor cap representing the workforce available for construction
    // projects (realistic-construction house rule). 0 = unlimited (rule disabled or GM hasn't
    // set a cap). When the rule is on, this caps total construction allocations per month
    // across all projects in this domain.
    monthlyLaborCapGp: opts.monthlyLaborCapGp || 0,
    specialists: opts.specialists || [],
    // Henchmen are now references to characters (kind='henchman') with liegeCharacterId pointing at the ruler
    henchmenCharacterIds: opts.henchmenCharacterIds || [],
    // Magistrates per RR p.344 — 4 named slots, each tied to a specific
    // expense category. Vacant = abstract NPC, no PC salary. See MAGISTRATE_ROLES.
    magistrates: opts.magistrates || emptyMagistrates(),
    urban: opts.urban || { marketClass:null, totalInvestment:0, investments:[], demandModifiers:{} },
    // Phase 5 reservation: player-submitted end-of-turn plan
    pendingPlayerInput: opts.pendingPlayerInput || null,
    // Reserved for Phase 3 Domains at War
    warfare: opts.warfare || { stationedArmyIds:[], supplyDepots:[], fortifications:[], siegeStatus:null },
    // Reserved for Phase 4 Politics (council/oligarchy)
    council: opts.council || null,
    // Domain history — log of monthly turn snapshots and notable events
    history: opts.history || [],
    notes: opts.notes || ''
  };
}

function blankHex(opts={}){
  const coord = opts.coord || { q:0, r:0 };
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.hex),
    coord,
    classification: opts.classification || 'Borderlands',
    explored: opts.explored !== false,
    families: opts.families || 0,
    valuePerFamily: opts.valuePerFamily || 6,
    // Foundation #17 — agricultural improvements accumulate incrementally per RAW (RR p.341 + p.174).
    // landImprovementBonus is the integer +N already earned. landImprovementInvested is the gp
    // currently accumulating toward the NEXT +1; when it reaches 25,000, bonus += 1 and invested -= 25,000.
    landImprovementBonus: opts.landImprovementBonus || 0,
    landImprovementInvested: opts.landImprovementInvested || 0,
    // Legacy: pre-Foundation #17 fixed-25k atomic projects with a 2-turn delay. Kept on schema
    // for migration; new code uses landImprovementInvested instead. Migration sums gpPaid into it.
    landImprovementProjects: opts.landImprovementProjects || [],
    // Per-hex queue prep: amount of gp the GM has pre-committed for next advance-month (any value).
    queuedImprovementGp: opts.queuedImprovementGp || 0,
    // Foundation #18 — supervisors assigned to this hex's construction project (when the
    // realistic-construction house rule is on). Multiple supervisors may co-supervise large
    // projects; their caps are additive (RR p.174: "Multiple engineers or siege engineers may
    // work together to supervise large projects"). Each supervisor must be physically at the hex
    // (character.currentHexId === hex.id) to count. Empty list blocks progress under the rule.
    // Legacy field constructionSupervisorCharacterId is migrated to this array on load.
    constructionSupervisorCharacterIds: opts.constructionSupervisorCharacterIds
      || (opts.constructionSupervisorCharacterId ? [opts.constructionSupervisorCharacterId] : []),
    terrain: opts.terrain || '',
    primaryStructure: opts.primaryStructure || '',
    settlement: opts.settlement || null,
    lairs: opts.lairs || [],
    dungeons: opts.dungeons || [],
    pointsOfInterest: opts.pointsOfInterest || [],
    monsterNotes: opts.monsterNotes || '',
    notes: opts.notes || '',
    // 2026-05-30 post-survey reservations — additive optional fields.
    // Phase 5 Pastoralist Economics (gap O, JJ ch.21 pp.436-438) — variant land-revenue
    // discriminator. Defaults to 'agricultural' (RAW). When 'pastoralist-*' / 'mining' /
    // etc. and `pastoralist-economics` (or peer) house rule is on, drives variant math.
    economyType: opts.economyType || 'agricultural',
    // Phase 5 Terrain Transformation (gap L, JJ p.412) — multi-month hex conversion
    // state machine. Null when no transformation in progress.
    terrainTransformationState: opts.terrainTransformationState || null
  };
}

function blankSettlement(opts={}){
  const name = opts.name || 'New Settlement';
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.settlement),
    name,
    families: opts.families || 75,
    totalInvestment: opts.totalInvestment || 10000,
    foundedTurn: opts.foundedTurn || 1,
    foundedByCharacterId: opts.foundedByCharacterId || null,
    demandModifiers: opts.demandModifiers || {},
    // 2026-05-30 post-survey reservations — Settlement Adventures (gap D, JJ ch.3 pp.79-83)
    // Places of Power are settlement-scoped notable in-settlement locations that bias
    // encounter generation. Sub-entities, not relations. Phase 3.5 Delves §5 spells out usage.
    placesOfPower: opts.placesOfPower || [],
    // Reserved for Phase 2.8 Rumors
    rumors: opts.rumors || [],
    // Reserved for Phase 2.9 Markets & Merchandise
    // #522 (2026-05-30) M&M depth — default to arrays so settlement.entryways[] / .regulatedAssets[] are always iterable from UI without null-guards.
    entryways: Array.isArray(opts.entryways) ? opts.entryways : [],
    regulatedAssets: Array.isArray(opts.regulatedAssets) ? opts.regulatedAssets : [],
    notes: opts.notes || ''
  };
}

function blankLair(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.lair),
    name: opts.name || '',
    creatureType: opts.creatureType || '',
    hd: opts.hd || '',
    numberAppearing: opts.numberAppearing || '',
    description: opts.description || ''
  };
}

function blankDungeon(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.dungeon),
    name: opts.name || '',
    levels: opts.levels || 1,
    description: opts.description || ''
  };
}

function blankPointOfInterest(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.pointOfInterest),
    name: opts.name || '',
    kind: opts.kind || 'ruin', // ruin|landmark|shrine|village|oasis|mine|other
    description: opts.description || ''
  };
}

function blankLandImprovementProject(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.landImprovementProject),
    startedTurn: opts.startedTurn || 1,
    completesTurn: opts.completesTurn || 3,
    gpPaid: opts.gpPaid || 25000
  };
}

function blankGarrisonUnit(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.garrisonUnit),
    displayName: opts.displayName || 'Light Infantry',
    unitTypeKey: opts.unitTypeKey || 'light-infantry',
    count: opts.count || 0,
    monthlyWage: opts.monthlyWage || 6,
    brPerSoldier: opts.brPerSoldier || 0.034,
    stationedAtHexId: opts.stationedAtHexId || null
  };
}

function blankSpecialist(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.specialist),
    type: opts.type || '',
    count: opts.count || 1,
    monthlyNet: opts.monthlyNet || 0,
    characterId: opts.characterId || null,  // optional — set when a named character holds the role
    notes: opts.notes || ''
  };
}

function blankStrongholdStructure(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.strongholdStructure),
    structureKey: opts.structureKey || '',
    quantity: opts.quantity || 1,
    notes: opts.notes || ''
  };
}

// Foundation #17 — agricultural improvement helpers.
// Constants: 25,000gp per +1 land value step (RR p.341); cap at +3 per hex; effective value cap 9.
// Magistrate roles per RR p.344. Each role oversees a single domain expense
// category and earns 12.5% of it as monthly salary (paid out of the existing
// expense, not added on top — see RR p.344, p.425). Qualification gates are
// strict: assignment requires the listed proficiencies (and divine casting for
// the chaplain). Vacant slots mean an abstract NPC handles the role — no PC
// earns the salary.
const MAGISTRATE_ROLES = Object.freeze({
  captainOfGuard: Object.freeze({
    key: 'captainOfGuard',
    label: 'Captain of the Guard',
    oversees: 'garrison',
    overseesLabel: 'garrison expenditure',
    requiredProficiencies: ['Command', 'Manual of Arms'],
    requiredProficienciesAny: null,
    requiredDivineCasting: false,
    rawCitation: 'RR p.344',
  }),
  chaplain: Object.freeze({
    key: 'chaplain',
    label: 'Chaplain',
    oversees: 'tithe',
    overseesLabel: 'tithe expenditure',
    requiredProficiencies: ['Theology'],
    requiredProficienciesAny: null,
    requiredDivineCasting: true,
    rawCitation: 'RR p.344',
  }),
  munerator: Object.freeze({
    key: 'munerator',
    label: 'Munerator',
    oversees: 'liturgy',
    overseesLabel: 'liturgies expenditure',
    requiredProficiencies: ['Diplomacy', 'Performance'],
    requiredProficienciesAny: null,
    requiredDivineCasting: false,
    rawCitation: 'RR p.344',
  }),
  steward: Object.freeze({
    key: 'steward',
    label: 'Steward',
    oversees: 'maintenance',
    overseesLabel: 'maintenance expenditure',
    requiredProficiencies: ['Bargaining'],
    requiredProficienciesAny: ['Craft', 'Profession'],
    requiredDivineCasting: false,
    rawCitation: 'RR p.344',
  }),
});
const MAGISTRATE_ROLE_KEYS = Object.freeze(['captainOfGuard','chaplain','munerator','steward']);
const MAGISTRATE_SALARY_FRACTION = 0.125;  // RR p.344 — 12.5%

// Empty magistrates shape: four slots, none assigned, none administering.
function emptyMagistrates(){
  const out = {};
  for (const k of MAGISTRATE_ROLE_KEYS) {
    out[k] = { characterId: null, administersThisMonth: false };
  }
  return out;
}

// Idempotent shape-ensure for domain.magistrates on load. Fills missing roles
// with vacant slots; existing assignments preserved.
function ensureMagistratesShape(domain){
  if (!domain) return;
  if (!domain.magistrates || typeof domain.magistrates !== 'object') {
    domain.magistrates = emptyMagistrates();
    return;
  }
  for (const k of MAGISTRATE_ROLE_KEYS) {
    const slot = domain.magistrates[k];
    if (!slot || typeof slot !== 'object') {
      domain.magistrates[k] = { characterId: null, administersThisMonth: false };
    } else {
      if (slot.characterId === undefined) slot.characterId = null;
      if (typeof slot.administersThisMonth !== 'boolean') slot.administersThisMonth = false;
    }
  }
}

// Strict qualification check per RR p.344. Returns boolean.
// Proficiency name match is substring + case-insensitive against the
// character's proficiencies array (which uses "Bargaining (2)" style strings).
// Divine-casting check uses the engine's CLASS_TO_SAVE_ARCHETYPE map:
// 'cleric' archetype means the class has divine casting.
function isCharacterQualifiedForRole(character, roleKey){
  if (!character) return false;
  const role = MAGISTRATE_ROLES[roleKey];
  if (!role) return false;
  const profs = (character.proficiencies || []).map(p => String(p || '').toLowerCase());
  function hasProf(name){
    const needle = String(name || '').toLowerCase();
    if (!needle) return false;
    return profs.some(p => p.startsWith(needle) || p.includes(needle));
  }
  for (const req of (role.requiredProficiencies || [])) {
    if (!hasProf(req)) return false;
  }
  if (Array.isArray(role.requiredProficienciesAny) && role.requiredProficienciesAny.length > 0) {
    const anyMet = role.requiredProficienciesAny.some(p => hasProf(p));
    if (!anyMet) return false;
  }
  if (role.requiredDivineCasting) {
    // Check via the global ACKS classSaveArchetype if available; fall back to
    // a string-match list. Bards intentionally not counted — they're 'thief'
    // archetype despite divine flavour.
    const ACKS = (typeof global !== 'undefined' && global.ACKS) || (typeof window !== 'undefined' && window.ACKS);
    if (ACKS && typeof ACKS.classSaveArchetype === 'function') {
      if (ACKS.classSaveArchetype(character.class) !== 'cleric') return false;
    } else {
      const cls = String(character.class || '').toLowerCase();
      const divineClasses = ['cleric','crusader','priestess','priest','shaman','bladedancer','craftpriest'];
      if (!divineClasses.some(d => cls.includes(d))) return false;
    }
  }
  return true;
}

// Loyalty Roll RAW (RR p.168). Bands ordered from best to worst for floor/ceiling
// look-ups. Each band carries threshold (minAdjusted), narrative label, css/style
// hint, permanent loyalty drift on roll, and one-line GM hint.
const LOYALTY_BANDS = Object.freeze([
  Object.freeze({ key:'fanatic',     minAdjusted:12, label:'Fanatic Loyalty',  loyaltyDelta:+1, accent:'green',
    note:'Hireling becomes a dedicated, sworn servant. Loyalty score permanently +1.' }),
  Object.freeze({ key:'loyalty',     minAdjusted: 9, label:'Loyalty',          loyaltyDelta: 0, accent:'green',
    note:'Hireling continues in service with enthusiasm. No change.' }),
  Object.freeze({ key:'grudging',    minAdjusted: 6, label:'Grudging Loyalty', loyaltyDelta:-1, accent:'amber',
    note:'Hireling stays but reluctantly. Loyalty score permanently −1.' }),
  Object.freeze({ key:'resignation', minAdjusted: 3, label:'Resignation',      loyaltyDelta: 0, accent:'red',
    note:'Hireling leaves immediately. No ill will — could be re-hired later.' }),
  Object.freeze({ key:'hostility',   minAdjusted:-Infinity, label:'Hostility', loyaltyDelta: 0, accent:'red',
    note:'Hireling leaves immediately, becomes a rival or enemy. Never recruitable again.' }),
]);

// Look up the band for an adjusted result. Walks the bands from best to worst
// and picks the first whose threshold the adjusted score meets.
function loyaltyBandFor(adjusted){
  for(const b of LOYALTY_BANDS){
    if(adjusted >= b.minAdjusted) return b;
  }
  return LOYALTY_BANDS[LOYALTY_BANDS.length - 1];
}

// Apply RAW floors: nat 2 never better than Resignation; nat 12 never worse
// than Loyalty. Returns the post-floored band.
function applyLoyaltyFloors(rawBand, natRoll){
  if(natRoll === 2){
    // Cap at Resignation (or worse) — if rawBand is better, downgrade.
    const rIdx = LOYALTY_BANDS.findIndex(b => b.key === 'resignation');
    const curIdx = LOYALTY_BANDS.findIndex(b => b.key === rawBand.key);
    if(curIdx < rIdx) return LOYALTY_BANDS[rIdx];  // curIdx < rIdx means "better band index" since array is best-first
    return rawBand;
  }
  if(natRoll === 12){
    // Floor at Loyalty (or better) — if rawBand is worse, upgrade.
    const lIdx = LOYALTY_BANDS.findIndex(b => b.key === 'loyalty');
    const curIdx = LOYALTY_BANDS.findIndex(b => b.key === rawBand.key);
    if(curIdx > lIdx) return LOYALTY_BANDS[lIdx];  // curIdx > lIdx means "worse band"
    return rawBand;
  }
  return rawBand;
}

// Roll a 2d6 (or use prerolled), add loyaltyScore + situationalModifier, apply
// floors, return structured result. The roll itself uses Math.random — the GM
// can re-roll freely in the modal until they Apply (the recorded result is
// what gets saved).
function rollLoyalty(loyaltyScore, situationalModifier, prerolled){
  const d1 = prerolled?.d1 ?? (1 + Math.floor(Math.random() * 6));
  const d2 = prerolled?.d2 ?? (1 + Math.floor(Math.random() * 6));
  const natRoll = d1 + d2;
  const ls = Number(loyaltyScore) || 0;
  const sm = Number(situationalModifier) || 0;
  const adjusted = natRoll + ls + sm;
  let band = loyaltyBandFor(adjusted);
  band = applyLoyaltyFloors(band, natRoll);
  return Object.freeze({
    d1, d2, natRoll, loyaltyScore: ls, situationalModifier: sm, adjusted,
    bandKey: band.key, bandLabel: band.label, loyaltyDelta: band.loyaltyDelta, accent: band.accent, note: band.note,
  });
}

const AGRICULTURAL_IMPROVEMENT_COST_PER_STEP = 25000;
const AGRICULTURAL_IMPROVEMENT_MAX_BONUS = 3;
const AGRICULTURAL_IMPROVEMENT_VALUE_CAP = 9;

// Migrate a hex from the legacy landImprovementProjects[] shape to the new accumulating
// landImprovementInvested model. Sums each project's gpPaid (defaulting to 25,000gp per RAW
// since legacy projects were atomic 25k commits) into landImprovementInvested, then clears
// the projects array. Idempotent — if no legacy projects exist, it's a no-op.
function migrateHexToAccumulatedImprovement(hex){
  if(!hex) return;
  const projects = Array.isArray(hex.landImprovementProjects) ? hex.landImprovementProjects : [];
  if(projects.length === 0) return;
  const summed = projects.reduce((s, p) => s + (p.gpPaid || AGRICULTURAL_IMPROVEMENT_COST_PER_STEP), 0);
  hex.landImprovementInvested = (hex.landImprovementInvested || 0) + summed;
  hex.landImprovementProjects = [];
}

// Foundation #18 followup — migrate the single-supervisor field to the multi-supervisor array.
// Idempotent: if constructionSupervisorCharacterIds is already populated, do nothing. If only
// the legacy constructionSupervisorCharacterId exists, wrap it in an array. The legacy field is
// kept on the object for one cycle so old code paths don't crash, but new logic reads the array.
function migrateHexToMultiSupervisor(hex){
  if(!hex) return;
  if(Array.isArray(hex.constructionSupervisorCharacterIds) && hex.constructionSupervisorCharacterIds.length > 0) return;
  if(!Array.isArray(hex.constructionSupervisorCharacterIds)) hex.constructionSupervisorCharacterIds = [];
  if(hex.constructionSupervisorCharacterId){
    hex.constructionSupervisorCharacterIds = [hex.constructionSupervisorCharacterId];
  }
}

// Apply accumulated investment to a hex, ratcheting bonus +1 for every 25,000gp until cap.
// Mutates the hex. Returns the number of steps applied (0, 1, 2, or 3). Caps:
//   bonus may not exceed AGRICULTURAL_IMPROVEMENT_MAX_BONUS (3)
//   effective value (base + bonus) may not exceed AGRICULTURAL_IMPROVEMENT_VALUE_CAP (9)
// When at cap, excess invested gp is wasted (refunded to no-one — the labor has been spent).
function ratchetAgriculturalImprovement(hex){
  if(!hex) return 0;
  let steps = 0;
  const base = hex.valuePerFamily || 0;
  while((hex.landImprovementInvested || 0) >= AGRICULTURAL_IMPROVEMENT_COST_PER_STEP
        && (hex.landImprovementBonus || 0) < AGRICULTURAL_IMPROVEMENT_MAX_BONUS
        && base + (hex.landImprovementBonus || 0) < AGRICULTURAL_IMPROVEMENT_VALUE_CAP){
    hex.landImprovementBonus = (hex.landImprovementBonus || 0) + 1;
    hex.landImprovementInvested -= AGRICULTURAL_IMPROVEMENT_COST_PER_STEP;
    steps++;
  }
  // At cap — discard any further accumulation so the GM isn't misled.
  if((hex.landImprovementBonus || 0) >= AGRICULTURAL_IMPROVEMENT_MAX_BONUS
     || base + (hex.landImprovementBonus || 0) >= AGRICULTURAL_IMPROVEMENT_VALUE_CAP){
    hex.landImprovementInvested = 0;
  }
  return steps;
}

// Foundation #16 — a stronghold component is one fortification (Tower, Keep, Castle, etc.).
// A domain's stronghold = a list of these. Each component owns its own buildings (when the
// building-by-building house rule is on) and its own buildValue (manual when off; computed
// from structures when on).
function blankStrongholdComponent(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || ('str-' + Math.random().toString(36).slice(2, 8)),
    type: opts.type || '',
    name: opts.name || '',
    buildValue: opts.buildValue || 0,
    structures: opts.structures || []
  };
}

// Lazy migration: convert legacy { type, buildValue, structures[] } shape into the new
// components array with a single entry. Runs idempotently — if components already exists, no-op.
function migrateStrongholdToComponents(domain){
  if(!domain || !domain.stronghold) return;
  const s = domain.stronghold;
  if(Array.isArray(s.components)) return;
  const legacyType = s.type || '';
  const legacyBuildValue = s.buildValue || 0;
  const legacyStructures = Array.isArray(s.structures) ? s.structures : [];
  s.components = [];
  // Only create a component if there's anything to migrate (avoid spurious empty entries).
  if(legacyType || legacyBuildValue > 0 || legacyStructures.length > 0){
    s.components.push(blankStrongholdComponent({
      type: legacyType,
      buildValue: legacyBuildValue,
      structures: legacyStructures
    }));
  }
  // Drop the legacy fields so we don't carry duplicate state.
  delete s.type;
  delete s.buildValue;
  delete s.structures;
}

// Total build value across all components.
function strongholdTotalValue(domain){
  if(!domain || !domain.stronghold) return 0;
  const comps = domain.stronghold.components || [];
  return comps.reduce((s, c) => s + (c.buildValue || 0), 0);
}

function blankCharacter(opts={}){
  const name = opts.name || 'New Character';
  // Phase #440 stage 1 — derive canonical five-axis fields from opts.kind when
  // not explicitly supplied. Translation matches migrateCharacterClassification.
  // kind itself is still written for one cycle so index.html display strings
  // (Roster column etc.) keep rendering until they're swept to ACKS.displayKind.
  const _kind = opts.kind || 'NPC';
  const _controlledBy = opts.controlledBy ||
    ((_kind === 'PC' || _kind === 'pc') ? 'player' : 'gm');
  const _socialTier = opts.socialTier || (
    _kind === 'henchman'   ? 'henchman'   :
    _kind === 'specialist' ? 'specialist' :
    _kind === 'follower'   ? 'follower'   :
    _kind === 'hireling'   ? 'hireling'   :
    _kind === 'mercenary'  ? 'mercenary'  :
    _kind === 'candidate'  ? ((opts.recruitmentProvenance && opts.recruitmentProvenance.hireCategory) || 'henchman') :
                             'independent'
  );
  const _lifecycleState = opts.lifecycleState || (
    opts.alive === false   ? 'deceased'  :
    _kind === 'candidate'  ? 'candidate' :
                             'active'
  );
  return {
    schemaVersion: SCHEMA_VERSION,
    // #453 — c.kind retired. Five-axis fields below are canonical.
    // Architecture.md §2. Readers use ACKS.displayKind(c) for the legacy string.
    controlledBy: _controlledBy,        // 'player' | 'gm'
    socialTier:   _socialTier,          // 'independent' | 'henchman' | 'specialist' | 'follower' | 'hireling' | 'mercenary' | 'slave'
    lifecycleState: _lifecycleState,    // 'active' | 'candidate' | 'departed' | 'imprisoned' | 'dominated' | 'deceased'
    creatureTypes:  opts.creatureTypes || ['humanoid'],
    isEnchantedCreature: opts.isEnchantedCreature === true,
    hitDice: opts.hitDice || null,      // Per-class HD derivation deferred to Phase 6.
    id: opts.id || newId(ID_PREFIXES.character),
    name,
    alignment: opts.alignment || 'N',
    race: opts.race || 'human',
    class: opts.class || '',
    level: opts.level || 1,
    xp: opts.xp || 0,
    hp: opts.hp || { current: 0, max: 0, hitDice: '' },
    ac: opts.ac || 0,
    attackThrow: opts.attackThrow || 10,
    abilities: opts.abilities || { STR:10, INT:10, WIL:10, DEX:10, CON:10, CHA:10 },
    savingThrows: opts.savingThrows || { paralysis:15, death:15, blast:15, implements:15, spells:15 },
    proficiencies: opts.proficiencies || [],
    classPowers: opts.classPowers || [],
    henchmanCap: opts.henchmanCap || 4,
    inventory: opts.inventory || [],
    personalGp: opts.personalGp || 0,
    // 2026-05-30 post-survey reservations — additive optional fields.
    // Phase 6 Codes (gap I, JJ pp.394-398) — Heroic Codes + Heroic Fate. Research-first
    // per Joachim's response; reserved here so the schema is stable.
    heroicCode: opts.heroicCode || null,
    fatePoints: typeof opts.fatePoints === 'number' ? opts.fatePoints : null,
    // Phase 5 Transformations (gap J, JJ p.94) — creature-type changes (polymorph,
    // lycanthropy, possession, awakening). Five-axis classification fields (`creatureTypes[]`,
    // `lifecycleState`) reflect *current* state; this records the transformation event.
    transformationState: opts.transformationState || null,
    // Foundation #18 — construction supervision cap (RR p.174). Siege engineer can supervise
    // projects up to 25,000gp; engineer up to 100,000gp. 0 = not a construction supervisor.
    // The realistic-construction house rule reads this; ignored when the rule is off.
    constructionSupervisorCap: opts.constructionSupervisorCap || 0,
    // Location — v2 uses stable hex ID, not (q,r) coord
    currentHexId: opts.currentHexId || null,
    currentDomainId: opts.currentDomainId || null,
    partyId: opts.partyId || null,
    travelDestination: opts.travelDestination || null,
    travelPace: opts.travelPace || 'walking',
    // RP dossier
    background: opts.background || '',
    personality: opts.personality || '',
    goals: opts.goals || [],
    relationships: opts.relationships || [],
    secrets: opts.secrets || '',
    voice: opts.voice || '',
    // Henchman specifics
    liegeCharacterId: opts.liegeCharacterId || null,
    loyalty: opts.loyalty || 0,
    monthlyWage: opts.monthlyWage || 0,
    // §310.6 — Loyalty drift ledger fields (RR p.166).
    // permanentWoundPenalty: standing penalty until wound cured (0..-3).
    // mortalityPenalty:      cumulative Tampering side-effect penalty (≤ 0, permanent).
    // Effective loyalty = clamp(loyalty + permanentWoundPenalty + mortalityPenalty, -4, +4).
    permanentWoundPenalty: opts.permanentWoundPenalty || 0,
    mortalityPenalty:      opts.mortalityPenalty      || 0,
    // Reserved for Phase 2.8 Rumors — Status tracking
    upkeepMonthly: opts.upkeepMonthly || 0,
    honor: opts.honor || [],
    shame: opts.shame || [],
    // Mercantile state
    mercantileNetwork: opts.mercantileNetwork || [],
    earningsLedger: opts.earningsLedger || [],
    // Character history log
    history: opts.history || [],
    // Behavior flag
    autoAdvance: opts.autoAdvance !== false,
    // Status
    alive: opts.alive !== false,
    deceasedTurn: opts.deceasedTurn || null,
    notes: opts.notes || ''
  };
}

function blankParty(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.party),
    name: opts.name || 'New Party',
    memberCharacterIds: opts.memberCharacterIds || [],
    leaderCharacterId: opts.leaderCharacterId || null,
    // Location (existing)
    currentHexId: opts.currentHexId || null,
    currentDomainId: opts.currentDomainId || null,
    currentSettlementId: opts.currentSettlementId || null,  // #521 — when present, party is "in" a settlement
    // Travel (existing)
    travelDestination: opts.travelDestination || null,
    travelPace: opts.travelPace || 'walking',
    // #521 (2026-05-30) Party-as-actor fields:
    activeJourneyId: opts.activeJourneyId || null,        // pointer when journeying (Phase 2.5 #475)
    status: opts.status || 'active',                       // 'active' | 'resting' | 'disbanded'
    formedAtTurn: opts.formedAtTurn || null,
    disbandedAtTurn: opts.disbandedAtTurn || null,
    history: opts.history || [],                           // DF-style "world remembers" — append on join/leave/journey-start/etc.
    notes: opts.notes || ''
  };
}

function blankVenture(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.venture),
    venturerCharacterId: opts.venturerCharacterId || null,  // canonical reference; name dereferenced at render
    originDomainId: opts.originDomainId || null,
    destinationDomainId: opts.destinationDomainId || null,
    cargo: opts.cargo || [],
    totalInvestment: opts.totalInvestment || 0,
    status: opts.status || 'in-transit',  // 'in-transit'|'selling'|'complete'|'failed'
    departureTurn: opts.departureTurn || 1,
    expectedArrivalTurn: opts.expectedArrivalTurn || 3,
    arrivalTurn: opts.arrivalTurn || null,
    completedTurn: opts.completedTurn || null,
    salePriceGp: opts.salePriceGp || null,
    profitGp: opts.profitGp || null,
    xpAwarded: opts.xpAwarded || 0,
    vagaries: opts.vagaries || [],
    notes: opts.notes || '',
    // Cross-system reservations
    garrisonEscortUnitIds: opts.garrisonEscortUnitIds || [],
    syndicateDisruptionId: opts.syndicateDisruptionId || null,
    politicalTariffs: opts.politicalTariffs || []
  };
}

function blankPassiveInvestment(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.passiveInvestment),
    name: opts.name || 'New Investment',
    ownerCharacterId: opts.ownerCharacterId || null,
    type: opts.type || 'commercial-expedition',     // 'commercial-expedition' | 'business-establishment' | 'money-lending'
    riskTier: opts.riskTier || 'balanced',          // 'safe'|'cautious'|'balanced'|'risky'|'perilous'
    capital: opts.capital || 0,
    destinationDomainId: opts.destinationDomainId || null,
    enabled: opts.enabled !== false,
    createdTurn: opts.createdTurn || 1,
    vagaries: opts.vagaries || [],
    notes: opts.notes || ''
  };
}

// =============================================================================
// Phase 2.95 Stash A (2026-05-29) — Stash entity + StashItem factories.
// Per Phase_2.95_Stash_Plan.md §5.2 + §6.1. Stash kinds: 'personal' | 'party'
// | 'domain-treasury' | 'cache'. Owner is exactly one of ownerCharacterId /
// ownerPartyId / ownerDomainId per kind. Total gp and encumbrance are derived,
// never stored — see Stash plan §5.2 "no amount field on the stash root."
// =============================================================================

function blankStash(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    kind: opts.kind || 'personal',
    id: opts.id || newId(ID_PREFIXES.stash),
    name: opts.name || '',
    hexId: opts.hexId || null,
    strongholdComponentId: opts.strongholdComponentId || null,
    ownerCharacterId: opts.ownerCharacterId || null,
    ownerPartyId: opts.ownerPartyId || null,
    ownerDomainId: opts.ownerDomainId || null,
    items: opts.items || [],
    isHidden: opts.isHidden || false,
    notes: opts.notes || '',
    createdAtTurn: opts.createdAtTurn || 1,
    history: opts.history || []
  };
}

function blankStashItem(opts={}){
  const kind = opts.kind || 'item';
  const base = {
    id: opts.id || newId(ID_PREFIXES.stashItem),
    kind
  };
  if (kind === 'coin'){
    return { ...base, denomination: opts.denomination || 'gp', qty: opts.qty || 0 };
  }
  if (kind === 'bulk'){
    return {
      ...base,
      label: opts.label || '',
      qty: opts.qty || 0,
      unit: opts.unit || 'stones',
      encumbranceSt: opts.encumbranceSt || 0
    };
  }
  // 'item' (default)
  return {
    ...base,
    name: opts.name || '',
    qty: opts.qty || 1,
    encumbranceSt: (opts.encumbranceSt != null) ? opts.encumbranceSt : 1,
    magicItemId: opts.magicItemId || null,
    notes: opts.notes || ''
  };
}

// =============================================================================
// Wave A relation entities (Architecture.md §3.5) — landed alongside Stash A.
// Each carries its own history[] for typed event audit trails. Status is the
// active/ended marker. These are EMPTY containers in commit 2 — no setters,
// no accessors, no migrations yet. The wave plan in Architecture.md §3 governs
// what lands when.
// =============================================================================

function blankHenchmanship(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.henchmanship),
    subjectCharacterId: opts.subjectCharacterId || null,
    patronCharacterId: opts.patronCharacterId || null,
    hiredAtTurn: opts.hiredAtTurn || 1,
    signingBonusPaidGp: opts.signingBonusPaidGp || 0,
    wageStreamGpMo: opts.wageStreamGpMo || 0,
    currentLoyalty: opts.currentLoyalty || 0,
    loyaltyHistory: opts.loyaltyHistory || [],
    history: opts.history || [],
    status: opts.status || 'active'
  };
}

function blankSpecialistContract(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.specialistContract),
    specialistCharacterId: opts.specialistCharacterId || null,
    employerCharacterId: opts.employerCharacterId || null,
    hiredAtTurn: opts.hiredAtTurn || 1,
    wageStreamGpMo: opts.wageStreamGpMo || 0,
    serviceCategory: opts.serviceCategory || '',
    history: opts.history || [],
    status: opts.status || 'active'
  };
}

function blankHirelingContract(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.hirelingContract),
    hirelingCharacterId: opts.hirelingCharacterId || null,
    employerCharacterId: opts.employerCharacterId || null,
    hiredAtTurn: opts.hiredAtTurn || 1,
    wageStreamGpMo: opts.wageStreamGpMo || 0,
    history: opts.history || [],
    status: opts.status || 'active'
  };
}

function blankMagistracy(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.magistracy),
    magistrateCharacterId: opts.magistrateCharacterId || null,
    domainId: opts.domainId || null,
    role: opts.role || '',
    appointedAtTurn: opts.appointedAtTurn || 1,
    salaryCategory: opts.salaryCategory || '',
    performanceLog: opts.performanceLog || [],
    history: opts.history || [],
    status: opts.status || 'active'
  };
}

function blankVassalage(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.vassalage),
    vassalRulerCharacterId: opts.vassalRulerCharacterId || null,
    suzerainCharacterId: opts.suzerainCharacterId || null,
    vassalDomainId: opts.vassalDomainId || null,
    suzerainDomainId: opts.suzerainDomainId || null,
    oathTakenAtTurn: opts.oathTakenAtTurn || 1,
    witnessCharacterIds: opts.witnessCharacterIds || [],
    recognitionStatus: opts.recognitionStatus || 'recognized',
    history: opts.history || [],
    status: opts.status || 'active'
  };
}

function blankTributaryAgreement(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.tributaryAgreement),
    payerDomainId: opts.payerDomainId || null,
    recipientDomainId: opts.recipientDomainId || null,
    kind: opts.kind || 'gp',
    amount: opts.amount || 0,
    schedule: opts.schedule || 'per-month',
    establishedAtTurn: opts.establishedAtTurn || 1,
    renegotiationHistory: opts.renegotiationHistory || [],
    history: opts.history || [],
    status: opts.status || 'active'
  };
}

// =============================================================================
// Wave B.5 (Architecture.md §3.7, 2026-05-29) — Notable items + custody.
// First-class entities for magic items, AXIOMS books, regalia, masterworks. The
// promotion threshold + the mundane-stays-flat rule are documented in §3.7.
// =============================================================================

function blankNotableItem(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.notableItem),
    kind: opts.kind || 'misc-magic',     // magic-weapon | magic-armor | potion | scroll | wand | rod
                                         // | staff | misc-magic | book | relic | regalia | masterwork
    baseCatalogKey: opts.baseCatalogKey || null,
    name: opts.name || '',               // Named-item label (optional)
    intrinsic: opts.intrinsic || {},     // Item-kind-specific: enchantmentBonus, properties[], charges*,
                                         // or for book kind: format/language/topics/scope/complexity/etc.
    provenance: opts.provenance || {
      makerCharacterId: null,
      createdAtTurn: null,
      originLore: '',
      knownMakeAndAuthenticity: false  // RAW JJ p.130 — affects sale pricing (2× multiplier when true)
    },
    identification: opts.identification || {
      // Map: characterId → array of property keys this character has identified.
      knownProperties: {},
      // For books only — characterId → number (days of reading progress).
      learningProgressDaysByCharacter: {},
      timesRereadByCharacter: {}
    },
    history: opts.history || [],
    status: opts.status || 'active'     // active | destroyed | lost
  };
}

function blankItemCustody(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.itemCustody),
    itemId: opts.itemId || null,         // → NotableItem
    custodianKind: opts.custodianKind || 'unknown', // character | group | outpost | stronghold-vault
                                                    // | hex | monster-hoard | merchant-stock | unknown
    custodianId: opts.custodianId || null,  // ID into the appropriate collection (chr-, grp-, out-,
                                            // dom- for stronghold-vault, hex-, lair-, set-/business
                                            // for merchant-stock, null for unknown)
    sinceTurn: opts.sinceTurn || 1,
    acquiredViaEventId: opts.acquiredViaEventId || null,
    history: opts.history || [],
    status: opts.status || 'active'     // active | ended (when a later custody record supersedes)
  };
}

// =============================================================================
// #442 — Group entity factory (Architecture.md §2.4, 2026-05-29).
// Count-level abstraction: a single record stands for N identical entities sharing
// a monsterCatalogKey template. Phase 3 Military's Unit specializes this.
// =============================================================================

function blankGroup(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.group),
    name: opts.name || '',               // Optional descriptive label (e.g. "Gnoll raiding band")
    // The template that all members share. Copied into individuated Creatures when
    // a Group member is spawned (parlay, capture, single survivor).
    groupTemplate: opts.groupTemplate || {
      monsterCatalogKey: null,           // Key into the planned MONSTER_CATALOG
      creatureTypes: ['humanoid'],       // Same multi-valued axis as Character.creatureTypes[]
      hitDice: null                      // RAW HD string e.g. '1-1', '4+1'
    },
    count: opts.count || 0,              // Roster strength
    casualties: opts.casualties || 0,    // Combat losses to this group (active = count - casualties)
    // Classification axes — same vocabulary as Character, since a Group represents
    // a homogeneous population of creatures. Predicates can operate on either.
    socialTier: opts.socialTier || 'independent',
    lifecycleState: opts.lifecycleState || 'wild',
    // Location + command
    currentHexId: opts.currentHexId || null,
    currentDomainId: opts.currentDomainId || null,
    commanderCharacterId: opts.commanderCharacterId || null,  // Optional named commander
    // Per-group history (combat actions, recruitment, attrition)
    history: opts.history || [],
    notes: opts.notes || ''
  };
}

const ACKS = global.ACKS = global.ACKS || {};
// ─── Phase 4 Construction Wave A (Architecture.md §10.2 — 2026-05-30) ─────
// Project = work-in-progress construction. Constructible = the completed major
// structure produced by the Project. Major structures get first-class entities;
// minor structures stay nested (counts on Settlement / arrays on Stronghold).
// See Architecture.md §10.2.1 + §10.2.2 for full field reference; Phase_4_Construction_Plan.md
// for the operational wave plan; Construction_RAW_Survey.md for RAW citations.
function blankProject(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.project),
    // What is being built
    constructibleKind: opts.constructibleKind || 'stronghold-component',  // see §10.5 catalog
    constructibleSubtype: opts.constructibleSubtype || null,               // e.g. 'keep', 'galley-2-rower'
    name: opts.name || '',                                                // GM-set; flows to Constructible on completion
    // Where
    siteHexId: opts.siteHexId || null,
    siteSettlementId: opts.siteSettlementId || null,                       // optional refinement
    siteConstructibleId: opts.siteConstructibleId || null,                 // for sub-projects (e.g. naval fitting on a ship)
    // Who
    ownerCharacterId: opts.ownerCharacterId || null,                      // optional — null for civic/domain owned
    ownerDomainId: opts.ownerDomainId || null,
    // Repair flag — when true, this Project repairs an existing Constructible
    // rather than creating a new one. repairTargetConstructibleId points at the
    // damaged Constructible. On completion, Constructible.damageState is restored.
    isRepair: opts.isRepair === true,
    repairTargetConstructibleId: opts.repairTargetConstructibleId || null,
    // Money + Labor
    totalCost: opts.totalCost || 0,                                       // gp budget
    gpSpent: opts.gpSpent || 0,                                           // gp already disbursed
    laborInvested: opts.laborInvested || 0,                               // total worker-days expended
    laborRequired: opts.laborRequired || 0,                               // total worker-days to completion (estimate)
    workerCounts: opts.workerCounts || {},                                // {laborer: 50, mason: 5, smith: 2} — current engaged crew
    workerCapPerDay: opts.workerCapPerDay || 0,                           // peak worker cap; from site + magic-assist
    // Supervision
    supervisorCharacterIds: opts.supervisorCharacterIds || [],            // current supervisors
    requiredSupervisorRating: opts.requiredSupervisorRating || 0,         // sum-of-mastery cap met by supervisors
    // Magic assist
    magicAssist: opts.magicAssist || { ditches:false, mire:false, walls:false, multipliers:{} },
    // State
    lifecycleState: opts.lifecycleState || 'planning',                  // planning | under-construction | paused | complete | abandoned
    startedAtTurn: opts.startedAtTurn || null,
    completedAtTurn: opts.completedAtTurn || null,
    estimatedCompletionTurn: opts.estimatedCompletionTurn || null,
    // Day cadence (consumed when Calendar C2 lands; monthly fallback used today)
    daysElapsed: opts.daysElapsed || 0,                                   // since startedAtTurn — used by day-tick consumer
    // History (DF-style "world remembers" per Architecture.md §10.10)
    history: opts.history || [],                                          // appended on key events (started, vagary, paused, completed)
    // Notes
    notes: opts.notes || ''
  };
}

function blankConstructible(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.constructible),
    // What it is — six-axis classification per Architecture.md §10.3
    constructibleKind: opts.constructibleKind || 'stronghold-component', // §10.5 catalog
    constructibleSubtype: opts.constructibleSubtype || null,              // e.g. 'keep', 'sanctum', 'merchant-guildhouse'
    constructionState: opts.constructionState || 'complete',             // planning | under-construction | complete | in-repair | being-demolished
    damageState: opts.damageState || 'intact',                           // intact | damaged | breached | ruined | destroyed (independent axis)
    ownership: opts.ownership || 'domain',                               // domain | character | settlement-civic | abandoned | contested
    siteType: opts.siteType || 'wilderness-hex',                         // wilderness-hex | settlement-embedded | stronghold-courtyard | sub-structure | naval | special
    operationalState: opts.operationalState || 'operational',            // operational | understaffed | abandoned | contested (sixth axis)
    // Identity
    name: opts.name || '',
    // Where
    hexId: opts.hexId || null,                                             // canonical site
    settlementId: opts.settlementId || null,                               // if settlement-embedded
    parentConstructibleId: opts.parentConstructibleId || null,             // for sub-structures (e.g. naval fitting on a ship)
    // Who
    ownerCharacterId: opts.ownerCharacterId || null,                      // for character-owned
    ownerDomainId: opts.ownerDomainId || null,                            // for domain-owned
    // Economics
    buildValue: opts.buildValue || 0,                                      // gp cost at completion — sets stronghold value contribution
    monthlyMaintenance: opts.monthlyMaintenance || 0,                      // gp/month per RR p.339
    // Combat / damage (SHP per D@W Battles, or null if not yet attacked)
    maxShp: opts.maxShp || null,
    currentShp: opts.currentShp || null,                                   // when null, treat as maxShp (intact)
    armorClass: opts.armorClass || null,                                   // for siege resolution
    // Multi-story support per Architecture.md §10.9 + D@W Battles. Each entry is
    // its own sub-strucutre with own SHP + damageState. When the ground story is
    // destroyed, upper stories cascade.
    subStructures: opts.subStructures || [],                               // [{label, maxShp, currentShp, damageState, level}]
    // Function-specific data — varies by kind. Shipped as {} default; per-kind
    // sub-flows in Waves C-H populate this (e.g. vessel.maxCrew, mine.yieldGpPerMonth).
    functionData: opts.functionData || {},
    // State
    completedAtTurn: opts.completedAtTurn || null,
    // History (DF-style "world remembers" per Architecture.md §10.10)
    history: opts.history || [],
    // Notes
    notes: opts.notes || ''
  };
}

Object.assign(ACKS, {
  blankCampaign, blankDomain, blankHex, blankSettlement, blankLair, blankDungeon, blankPointOfInterest, blankLandImprovementProject, blankGarrisonUnit, blankSpecialist, blankStrongholdStructure, blankStrongholdComponent, migrateStrongholdToComponents, strongholdTotalValue, AGRICULTURAL_IMPROVEMENT_COST_PER_STEP, AGRICULTURAL_IMPROVEMENT_MAX_BONUS, AGRICULTURAL_IMPROVEMENT_VALUE_CAP, migrateHexToAccumulatedImprovement, migrateHexToMultiSupervisor, ratchetAgriculturalImprovement, blankCharacter, blankParty, blankVenture, blankPassiveInvestment,
  // Phase 2.95 Stash A + Wave A relation factories (2026-05-29)
  blankStash, blankStashItem, blankHenchmanship, blankSpecialistContract, blankHirelingContract, blankMagistracy, blankVassalage, blankTributaryAgreement,
  // Wave B.5 — Notable items + custody factories (2026-05-29)
  blankNotableItem, blankItemCustody,
  // #442 — Group entity factory (Architecture.md §2.4, 2026-05-29)
  blankGroup,
  // Phase 4 Construction Wave A (Architecture.md §10 — 2026-05-30)
  blankProject, blankConstructible,
  MAGISTRATE_ROLES, MAGISTRATE_ROLE_KEYS, MAGISTRATE_SALARY_FRACTION, emptyMagistrates, ensureMagistratesShape, isCharacterQualifiedForRole,
  LOYALTY_BANDS, loyaltyBandFor, applyLoyaltyFloors, rollLoyalty
});

if(typeof module !== 'undefined' && module.exports){
  module.exports = ACKS;
}

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
