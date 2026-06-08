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
    // Always-on core (the inventory-stash-system toggle was removed v0.17.0); the
    // Domain Treasury and every party camp materialize into this array on load.
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
    // Favors & Duties (#230, F&D-1 — 2026-06-08) — the monthly liege↔vassal obligation
    // relation collection (RR pp.345–348). Populated by the monthly turn's auto-roll
    // (default-ON favor-duty-auto-roll) or by Inspector Create. Lazy-defaulted on load.
    favorDutyObligations: opts.favorDutyObligations || [],
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
      tributeAuto: true,          // true = RAW tribute by realm families (rawTributeForRealmFamilies); false = manual tributeToLiege
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
    // Time-based construction (RR p.174): when realistic-construction drives improvement through the
    // day-tick, this is the GM's committed BUDGET — it drips into landImprovementInvested at the
    // construction rate (~500gp/day) over ~50 days/step, paying as the work proceeds. 0 = nothing in
    // flight. Existing hexes without the field read as 0 (no migration needed). Unused when the
    // realistic-construction model is off (the monthly path spends queuedImprovementGp instantly).
    improvementBudgetGp: opts.improvementBudgetGp || 0,
    // Foundation #18 — supervisors assigned to this hex's construction project (when the
    // realistic-construction house rule is on). Multiple supervisors may co-supervise large
    // projects; their caps are additive (RR p.174: "Multiple engineers or siege engineers may
    // work together to supervise large projects"). Each supervisor must be physically at the hex
    // (character.currentHexId === hex.id) to count. Empty list blocks progress under the rule.
    // Legacy field constructionSupervisorCharacterId is migrated to this array on load.
    constructionSupervisorCharacterIds: opts.constructionSupervisorCharacterIds
      || (opts.constructionSupervisorCharacterId ? [opts.constructionSupervisorCharacterId] : []),
    terrain: opts.terrain || '',
    // Phase 2.5 Journeys (#475) — travel-relevant hex geography. terrain (above) keys the
    // speed + navigation catalogs; these refine route cost. GM-settable on the hex card.
    hasRoad: opts.hasRoad === true,        // legacy COARSE travel flag (×3/2 speed, RR p.272) read by the
                                           // current distance-based journey engine. The per-side roadSides[]
                                           // below is the precise map geometry; hex-by-hex journeys will
                                           // derive the road bonus from it (Phase_2.5_Journeys_Plan §24).
    hasTrail: opts.hasTrail === true,      // marked trail — eases navigation but no speed bonus
    // #225 Map Mode "Add/Edit hexes" — per-side CARTOGRAPHY (which of the 6 hex sides, 0..5, carry a
    // feature; edge indexing matches hexEdgePoints / HEX_EDGE_DELTAS). riverSides: a river runs ALONG the
    // edge (a movement BARRIER). roadSides: a road runs from the hex centre out to the side midpoint
    // (circular bends). crossingSides: a ford/bridge ON a river edge that negates the barrier (a road that
    // crosses a river edge is an implicit bridge — drawn, not stored here). These are map-drawing truth;
    // the travel EFFECTS (road bonus, river barrier + RAW fording) are documented for hex-by-hex journeys
    // (Phase_2.5_Journeys_Plan §24), not yet wired into the current engine. (riverCount dropped #225 —
    // it cited a non-existent RAW rule and was unused; RAW crossing = Swimming throws, RR p.271.)
    roadSides: Array.isArray(opts.roadSides) ? opts.roadSides.slice() : [],
    riverSides: Array.isArray(opts.riverSides) ? opts.riverSides.slice() : [],
    crossingSides: Array.isArray(opts.crossingSides) ? opts.crossingSides.slice() : [],
    elevationFt: opts.elevationFt || 0,    // feeds visibility/sighting (Journeys §11)
    groundCondition: opts.groundCondition || 'clear', // 'clear'|'mud'|'snow' — mud/snow ×1/2 speed (RR p.272)
    // Phase 2.5 Provisioning — fresh-water hex features (RR p.278 "river or lake"). hasLake: a
    // freshwater lake on this LAND hex (the common sub-hex case). freshWater: meaningful only when
    // terrain==='water' — a genuine multi-hex freshwater body (great lake / inland freshwater sea);
    // default false = salt sea (open 'water' shipped meaning RAW Ocean). "Hex contains fresh water"
    // ⇔ riverSides.length>0 ‖ hasLake ‖ (terrain==='water' && freshWater). Bordering a SALT sea
    // grants no drinking water. Additive optional flags — no coordinate migration (Provisioning §3.1).
    hasLake:    opts.hasLake === true,
    freshWater: opts.freshWater === true,
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
  // Items I1 — multi-denomination coin purse (RAW). coins.gp is canonical; the
  // personalGp field below is a synced mirror (rule #10). Built from opts.coins
  // when given, else folds a legacy opts.personalGp into coins.gp.
  const _coins = (opts.coins && typeof opts.coins === 'object')
    ? { pp:Number(opts.coins.pp)||0, gp:Number(opts.coins.gp)||0, ep:Number(opts.coins.ep)||0, sp:Number(opts.coins.sp)||0, cp:Number(opts.coins.cp)||0 }
    : { pp:0, gp:Number(opts.personalGp)||0, ep:0, sp:0, cp:0 };
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
    coins: _coins,                  // {pp,gp,ep,sp,cp} multi-denomination purse (RAW)
    personalGp: _coins.gp,          // synced mirror of coins.gp (canonical-setter rule #10)
    // Phase 2.95 Hirelings (#310) — day-aware recruitment. A patron "in the market for hirelings"
    // runs ongoing solicitation drives: each costs 1 ancillary/day/type (RR p.164) + a weekly fee,
    // with availability trickling in 1/2, 1/4, remainder over 3 weeks. Advanced by the Day Clock
    // (the 'recruitment' day-consumer). Empty = not soliciting. Lazy-defaulted on load.
    recruitmentDrives: opts.recruitmentDrives || [],
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
    // Phase 2.5 Journeys (#475) — per-character travel + survival state. currentJourneyId is
    // the inverse pointer to an in-flight Journey; personalFatigue / hungerDays / dehydrationDays
    // PERSIST across journeys (fatigue from a journey carries into the next month — JJ p.84 §10.4).
    currentJourneyId: opts.currentJourneyId || null,
    personalFatigue: opts.personalFatigue || 0,
    hungerDays: opts.hungerDays || 0,
    dehydrationDays: opts.dehydrationDays || 0,
    // Phase 2.5 Provisioning — per-member survival state (RR p.278 "Surviving the Wild"). Replaces
    // the old first-participant-only hunger/dehydration read in tickJourneyDay (V2/V3). waterDaysCarried:
    // days of drinking water held in this character's containers (≤ waterCapacityDays). foodDeficitDays
    // / waterDeficitDays: consecutive days WITHOUT a full ration (drive the hungry/underfed/starving +
    // dehydrated ladders). underfed/starving/dehydrated: RAW condition flags, derived at tick time and
    // stored for display ("hungry" stays derived = foodDeficitDays>=1). conLossHunger/conLossThirst:
    // CON lost to Starving / Dehydration (recover 1/day food, 3/day water). Effective CON = base −
    // conLossHunger − conLossThirst; death at 0. Additive — default-inert until the V2/V3 tick consumes.
    waterDaysCarried: opts.waterDaysCarried || 0,
    foodDeficitDays:  opts.foodDeficitDays  || 0,
    waterDeficitDays: opts.waterDeficitDays || 0,
    underfed:   opts.underfed   === true,
    starving:   opts.starving   === true,
    dehydrated: opts.dehydrated === true,
    conLossHunger: opts.conLossHunger || 0,
    conLossThirst: opts.conLossThirst || 0,
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
    // Cost of Living (Phase 2.5 §16 CoL-2, RR p.173). All read defensively (null/0/false defaults),
    // so legacy saves + templates need NO migration backfill and stay migrate-no-ops.
    //   lifestyleTargetLevel: the level whose wage the character TARGETS spending; null = true level.
    //   effectiveSocialLevel: the apparent level the latest month's spend bought (RR p.170/173); set by
    //                         the monthly pass; null = take the true level (also when the rule is off).
    //   lastLivingExpensePaidGp: audit of the last monthly keep actually paid.
    //   payKeepFromTreasury: a ruler pays his own keep AND his henchmen's wages from the domain treasury
    //                        he rules instead of his coin purse (Joachim 2026-06-08 — one setting). DEFAULT
    //                        ON for rulers: null/absent ⇒ on. It only ever applies to a domain ruler — a
    //                        non-ruler has no treasury, so the engine + UI gate it on ruler status; an
    //                        explicit false is the GM opting a specific ruler out (back to the coin purse).
    lifestyleTargetLevel: (opts.lifestyleTargetLevel != null ? opts.lifestyleTargetLevel : null),
    effectiveSocialLevel: (opts.effectiveSocialLevel != null ? opts.effectiveSocialLevel : null),
    lastLivingExpensePaidGp: opts.lastLivingExpensePaidGp || 0,
    payKeepFromTreasury: (opts.payKeepFromTreasury != null ? opts.payKeepFromTreasury : null),
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
    shareProvisions: opts.shareProvisions || false,       // CoL-1 (Provisioning §16.3) — pool food+water (camp-first, leader-first) for the party whenever it shares, journey or not; journey.shareRations overrides
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

// OQ9 resolved 2026-06-03 (Items I1) — composition over hierarchy
// (Architecture.md §2.2 + §3.7; DF_Study_2_Code_and_Data_Layer.md §3.5).
// ONE item-line shape carrying a multi-valued facets[] — 'coin' | 'valuable' |
// 'gear' | 'bulk' | 'magical' | 'readable' | 'container' — NOT a coin|bulk|item
// subtype. Facets compose: a jeweled +1 dagger is ['gear','valuable','magical'].
// A line that accrues identity/story PROMOTES by pointing at a campaign.notableItems[]
// entry via notableItemId (renamed from magicItemId), mirroring the wanderer→lair
// pattern. Coin/valuable weight + value are DERIVED (ACKS.itemEncumbranceSt /
// ACKS.itemValueGp), never stored — single source of truth (Stash plan §5.2).
// Back-compat sugar: opts.kind ('coin'|'bulk'|'item'|'valuable') maps to a facet;
// opts.facets[] wins when provided. Returns a single superset shape regardless of
// facets so the Inspector field-schema + the schema⊆factory invariant stay simple.
function blankStashItem(opts={}){
  const FACET_FOR_KIND = { coin:'coin', bulk:'bulk', valuable:'valuable', item:'gear' };
  let facets = (Array.isArray(opts.facets) && opts.facets.length)
    ? opts.facets.slice()
    : [ FACET_FOR_KIND[opts.kind] || 'gear' ];
  const notableItemId = opts.notableItemId || opts.magicItemId || null;
  if(notableItemId && facets.indexOf('magical') < 0 && facets.indexOf('readable') < 0){
    facets.push('magical');
  }
  const isCoin = facets.indexOf('coin') >= 0;
  const isBulk = facets.indexOf('bulk') >= 0;
  return {
    id: opts.id || newId(ID_PREFIXES.stashItem),
    facets,
    qty: (opts.qty != null) ? opts.qty : ((isCoin || isBulk) ? 0 : 1),
    name: opts.name || opts.label || '',
    // coin facet — ACKS denominations cp | sp | ep | gp | pp
    denomination: opts.denomination || (isCoin ? 'gp' : null),
    // valuable facet — Treasure_Tome_RAW_Survey.md §1.3 (gems / jewelry / special treasures)
    valuableType: opts.valuableType || null,   // gem | jewelry | special-treasure
    valuableTier: opts.valuableTier || null,   // ornamental|gem|brilliant / trinket|jewelry|regalia
    unitValueGp: (opts.unitValueGp != null) ? opts.unitValueGp : null,
    // physical (gear / bulk); coin + valuable weight is derived, not stored
    encumbranceSt: (opts.encumbranceSt != null) ? opts.encumbranceSt : null,
    unit: opts.unit || (isBulk ? 'stones' : null),
    // promotion pointer → campaign.notableItems[] (was magicItemId)
    notableItemId,
    // container facet (reserved — nested stashes deferred)
    containerStashId: opts.containerStashId || null,
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
    status: opts.status || 'active',
    // End-of-lifecycle field, set by _endRelation on dismissal/termination. Emitted as
    // null from creation so it is part of the factory shape (lets the Inspector schema
    // reference it; closes the schema⊆factory drift). (Wave C Step 2.)
    endedAtTurn: opts.endedAtTurn || null
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
    status: opts.status || 'active',
    // End-of-lifecycle field, set by _endRelation on dismissal/termination. Emitted as
    // null from creation so it is part of the factory shape (lets the Inspector schema
    // reference it; closes the schema⊆factory drift). (Wave C Step 2.)
    endedAtTurn: opts.endedAtTurn || null
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
    status: opts.status || 'active',
    // End-of-lifecycle field, set by _endRelation on dismissal/termination. Emitted as
    // null from creation so it is part of the factory shape (lets the Inspector schema
    // reference it; closes the schema⊆factory drift). (Wave C Step 2.)
    endedAtTurn: opts.endedAtTurn || null
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
    status: opts.status || 'active',
    // End-of-lifecycle field, set by _endRelation on dismissal/termination. Emitted as
    // null from creation so it is part of the factory shape (lets the Inspector schema
    // reference it; closes the schema⊆factory drift). (Wave C Step 2.)
    endedAtTurn: opts.endedAtTurn || null
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
    status: opts.status || 'active',
    // End-of-lifecycle field, set by _endRelation on dismissal/termination. Emitted as
    // null from creation so it is part of the factory shape (lets the Inspector schema
    // reference it; closes the schema⊆factory drift). (Wave C Step 2.)
    endedAtTurn: opts.endedAtTurn || null
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
    status: opts.status || 'active',
    // End-of-lifecycle field, set by _endRelation on dismissal/termination. Emitted as
    // null from creation so it is part of the factory shape (lets the Inspector schema
    // reference it; closes the schema⊆factory drift). (Wave C Step 2.)
    endedAtTurn: opts.endedAtTurn || null
  };
}

// =============================================================================
// Favors & Duties (#230, F&D-1 — 2026-06-08) — the monthly liege↔vassal obligation
// relation (RR pp.345–348). A favor (lord grants) or duty (lord demands) has its own
// lifecycle (granted → active → revoked / one-time-spent), so it is a first-class
// relation entity, not a field (Architecture §3). Subject = the vassal domain; the
// other end = the liege character. gpPerMonth holds the 1gp-×-realm-families basis
// (0 for non-gp edicts). isOngoing distinguishes recurring duties/favors from one-time
// ones (only one-time favors offset a duty in the month given — RR p.347).
// =============================================================================
function blankFavorDutyObligation(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.favorDutyObligation),
    // The liege character granting the favor / demanding the duty.
    liegeCharacterId: opts.liegeCharacterId || null,
    // The vassal's domain (the subject of the obligation) + its ruler (the Loyalty-roll subject).
    vassalDomainId: opts.vassalDomainId || null,
    vassalRulerCharacterId: opts.vassalRulerCharacterId || null,
    // The edict kind (Favor/Duty table, RR p.348). Duties: construction | scutage |
    // call-to-council | call-to-arms | loan. Favors: charter-of-monopoly | gift | office |
    // troops | grant-of-land. Plus 'custom' — a GM-devised freeform edict (RR p.345 "the Judge
    // should feel free to devise additional favors and duties"), only ever hand-raised, never rolled.
    // (Revocations modify a prior obligation; they don't create one.)
    kind: opts.kind || '',
    // Free-text label for a kind:'custom' edict (the GM's own favor/duty name). '' for table kinds.
    customLabel: opts.customLabel || '',
    isFavor: opts.isFavor || false,    // true = a favor the lord grants; false = a duty the lord demands
    isOngoing: opts.isOngoing || false, // true = recurs until revoked; false = one-time (gift / grant-of-land)
    // The per-month gp basis (1gp × families in the vassal's realm; for construction = the
    // vassal's monthly tribute). 0 for non-gp edicts (council / office / charter / grant-of-land).
    gpPerMonth: opts.gpPerMonth || 0,
    // Realm title sizing the muster periods for Call to Arms / Scutage (RR p.348). '' = derive
    // from the suzerain's realm at resolution time. See musterSchedule() in the catalogs.
    musterTitle: opts.musterTitle || '',
    // The 1d20 that produced this edict (audit trail); null when GM-picked via the Inspector.
    roll: opts.roll != null ? opts.roll : null,
    status: opts.status || 'active',   // 'active' | 'revoked' | 'one-time-spent'
    grantedAtTurn: opts.grantedAtTurn || 1,
    revokedAtTurn: opts.revokedAtTurn != null ? opts.revokedAtTurn : null,
    // Loan lifecycle (RR p.348). A Loan duty is DEMANDED (created) but the gp does not move until
    // the vassal GIVES it (giveLoanObligation: vassal realm treasury → liege). loanGivenAtTurn = the
    // turn the loan was given; null = demanded-but-not-yet-given (the liege card shows a notice).
    // The monthly CHA% repayment check and revoke-repays-the-principal both key off this. null for
    // every non-loan kind. Read defensively (== null → not given) so legacy saves need no migration.
    loanGivenAtTurn: opts.loanGivenAtTurn != null ? opts.loanGivenAtTurn : null,
    // Call to Council (RR p.346) — the hex (within the lord's domain) where the vassal must attend.
    // Set by the liege when demanding the duty (defaults to the liege ruler's current hex); the
    // vassal travels there via "Go to Council" (plots/re-routes a Journey), and attendance is the
    // live comparison of the vassal ruler's current hex to this. null for every non-council kind.
    councilHexId: opts.councilHexId != null ? opts.councilHexId : null,
    // Scutage lifecycle (RR pp.347–348) — a recurring duty the vassal must PAY each month (the "Pay
    // Scutage" button: payScutageObligation stamps this to the current turn). It bills as the vassal's
    // garrison expense in the monthly net (expenseBreakdown) when scutageLastPaidTurn === currentTurn,
    // and the lord is credited that month; an unpaid month is withheld (the liege card shows a notice).
    // null for every non-scutage kind; reset each month (the vassal re-pays). Read defensively → no migration.
    scutageLastPaidTurn: opts.scutageLastPaidTurn != null ? opts.scutageLastPaidTurn : null,
    // Running total of gp the vassal has expended on a Construction duty (auto-revokes at
    // 15,000gp per 6-mile hex in the realm — RR p.348). 0 for every other kind.
    constructionSpentGp: opts.constructionSpentGp || 0,
    notes: opts.notes || '',
    history: opts.history || []
  };
}

// =============================================================================
// Outpost (Phase 2.95 Stash §H / Phase 3 Military §13) — persistent waypoint owning
// a garrison + treasury cache. The field-schema (Inspector §4.1) + the Entity Registry
// already referenced factory:'blankOutpost' but no factory existed (Wave C Step 2 fix).
// =============================================================================
function blankOutpost(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.outpost),
    name: opts.name || '',
    kind: opts.kind || 'watchtower',
    hexId: opts.hexId || null,
    controllingDomainId: opts.controllingDomainId || null,
    commanderCharacterId: opts.commanderCharacterId || null,
    garrisonGroupId: opts.garrisonGroupId || null,
    foundedAtTurn: opts.foundedAtTurn || 1,
    history: opts.history || []
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

// =============================================================================
// Phase 2.5 Journeys (#475) — the Journey entity (J1: overland/foot only).
// Architecture.md §3 (event-like, its own top-level collection) + Phase_2.5_Journeys_Plan.md
// §4.1. One Journey models 1..N travelers; partyId is an OPTIONAL convenience pointer
// (cardinality-1 journeys — a lone courier — are first-class). The `mode` enum reserves
// sea/air; J1 only acts on land modes. The day-tick consumer (acks-engine-subsystems.js)
// advances in-transit journeys one day per tick.
// =============================================================================
function blankJourney(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.journey),
    name: opts.name || '',                              // GM-set, e.g. "Saltspur to the Tablelands"
    status: opts.status || 'planning',                  // planning | in-transit | resting | arrived | aborted | lost
    // Participants — participantCharacterIds is the source of truth; partyId is optional.
    partyId: opts.partyId || null,
    participantCharacterIds: opts.participantCharacterIds || [],
    packAnimalIds: opts.packAnimalIds || [],
    shipId: opts.shipId || null,                        // voyage modes only (reserved)
    // Origin / destination / route
    startedAtTurn: opts.startedAtTurn || null,
    startedAtDayInMonth: opts.startedAtDayInMonth || null,
    startHexId: opts.startHexId || null,
    destinationHexId: opts.destinationHexId || null,
    waypoints: opts.waypoints || [],                    // ordered [{hexId, label, plannedPurpose}]
    // §24 — informational snapshot of the planned hex path [{q,r},…] (start→waypoints→dest), stamped
    // at startJourney. The day handler derives the LIVE route on demand (ACKS.journeyRoute) — this is
    // a stable cache for the UI/integrators, not the movement source of truth. [] = compute on demand.
    routeCoords: opts.routeCoords || [],
    // §24 mid-journey re-route: when the route's waypoints/destination are changed WHILE under way, the
    // route is re-anchored to where the party is (routeAnchorHexId = current hex) and coveredBaseline is
    // set to the hexes already walked, so the new route's progress counts from here. startHexId is kept
    // as the TRUE origin (name + history). null/0 = never re-routed (route runs from startHexId).
    routeAnchorHexId: opts.routeAnchorHexId || null,
    // §27 getting-lost (RR p.275): a lost party strays toward a random hex face, off the planned route,
    // possibly onto UNauthored coords (no hex id). routeAnchorCoord is the coord-capable anchor used while
    // straying — it takes precedence over routeAnchorHexId so the route resolves from where the party
    // physically is, even in trackless wilderness. null = anchor by hex id (the normal case).
    routeAnchorCoord: opts.routeAnchorCoord || null,
    coveredBaseline: opts.coveredBaseline || 0,
    currentHexId: opts.currentHexId || null,            // the hex the party is in now (advances hex-by-hex along the route — §24)
    currentDayIndex: opts.currentDayIndex || 0,         // 0..N days into the journey
    // Lockstep marker (Complete Movement, 2026-06-05): absolute world ordinal (turn*30 + dayInMonth) of
    // the day the latest leg TRAVELLED ON. null ⇒ not yet travelled (party still at the origin). The
    // day-tick skip-guard + the UI's "already moved today" check read it to keep one leg per world day.
    lastTravelWorldOrd: opts.lastTravelWorldOrd != null ? opts.lastTravelWorldOrd : null,
    daysRemainingEstimate: opts.daysRemainingEstimate != null ? opts.daysRemainingEstimate : null,
    // Mode + pace
    mode: opts.mode || 'foot',                          // J1: land modes only; enum reserves sea/air (§13)
    pace: opts.pace || 'normal',                        // forced-march | normal | cautious | half-ancillary
    // GM speed override (§26) — a positive number sets the day's mile BUDGET directly, bypassing
    // base × weather × temperature × pace (per-hex terrain/ground/road still apply, §24). null = pace
    // governs (the default). The grayed-in-UI pace value is preserved and still drives fatigue.
    speedOverrideMilesPerDay: (typeof opts.speedOverrideMilesPerDay === 'number') ? opts.speedOverrideMilesPerDay : null,
    // Purpose (folds the old venture/journey split — §17.1)
    purpose: opts.purpose || 'expedition',
    ventureAnnotation: opts.ventureAnnotation || null,  // commercial-venture payload (cargo/investment/vagaries)
    // Splitting + merging audit (§16) — reserved for a later slice
    parentJourneyId: opts.parentJourneyId || null,
    splitFromAtDayIndex: opts.splitFromAtDayIndex != null ? opts.splitFromAtDayIndex : null,
    mergedIntoJourneyId: opts.mergedIntoJourneyId || null,
    mergedAtDayIndex: opts.mergedAtDayIndex != null ? opts.mergedAtDayIndex : null,
    // Per-day navigation state
    isLost: opts.isLost === true,
    // §27 getting-lost (RR p.275): the hex face (0..5, HEX_EDGE_DELTAS order) a lost party is straying
    // toward, set on the failed Navigation throw and persisted ("blithely continues on") until a later
    // successful throw re-orients them. null = not lost / not straying.
    strayHeading: (typeof opts.strayHeading === 'number') ? opts.strayHeading : null,
    lastKnownHexId: opts.lastKnownHexId || null,
    fatigueDays: opts.fatigueDays || 0,                 // strenuous-day streak (JJ p.84)
    // Engine-managed logs (each day-tick appends one Day record; encounters tie to #141/#476)
    days: opts.days || [],                              // §4.2 Day records
    encounters: opts.encounters || [],                  // §4.3 encounter records
    // Supplies — LEGACY abstract person-day pool. Phase 2.5 Provisioning seeds these into tight
    // inventory (camp ration items + per-member waterDaysCarried) at launch/load (seedJourneyProvisions,
    // decision #1); the day-tick still honors a non-zero pool as a shared fallback for unseeded saves.
    supplies: opts.supplies || {
      rations: 0,
      waterRations: 0,
      animalFeed: 0,
      animalWater: 0,
      shipStores: 0
    },
    // Phase 2.5 Provisioning — the two party-level day-tick toggles (Journey Detail). forageWaterEnabled:
    // the party forages for water on no-source days (§4.1; greyed when the hex auto-supplies). shareRations:
    // pool food AND water — camp-first, leader-priority (§6). Off = self-only.
    forageWaterEnabled: opts.forageWaterEnabled === true,
    shareRations: opts.shareRations === true,
    notes: opts.notes || '',
    history: opts.history || []                         // append-only audit (start, day-tick, arrival, …)
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
  blankStash, blankStashItem, blankHenchmanship, blankSpecialistContract, blankHirelingContract, blankMagistracy, blankVassalage, blankTributaryAgreement, blankOutpost,
  // Favors & Duties (#230, F&D-1 — 2026-06-08) — liege↔vassal obligation relation factory
  blankFavorDutyObligation,
  // Wave B.5 — Notable items + custody factories (2026-05-29)
  blankNotableItem, blankItemCustody,
  // #442 — Group entity factory (Architecture.md §2.4, 2026-05-29)
  blankGroup,
  // Phase 2.5 Journeys (#475) — Journey entity factory (J1)
  blankJourney,
  // Phase 4 Construction Wave A (Architecture.md §10 — 2026-05-30)
  blankProject, blankConstructible,
  MAGISTRATE_ROLES, MAGISTRATE_ROLE_KEYS, MAGISTRATE_SALARY_FRACTION, emptyMagistrates, ensureMagistratesShape, isCharacterQualifiedForRole,
  LOYALTY_BANDS, loyaltyBandFor, applyLoyaltyFloors, rollLoyalty
});

if(typeof module !== 'undefined' && module.exports){
  module.exports = ACKS;
}

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
