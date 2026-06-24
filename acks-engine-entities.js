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
  const c = {
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
    // Turn Cycle v2 (Foundation #178) — typed-event inbox + immutable history. These are the event
    // inbox/log (NOT id-collections), so they stay explicit here rather than in the §15.5 registry.
    // campaign.log[] was removed 2026-05-28 (Foundation #234); the Campaign Log view derives from eventLog.
    pendingEvents: opts.pendingEvents || [],
    eventLog: opts.eventLog || [],
    // Calendar day-tick pipeline (#478) — global day clock; 1 means start-of-month.
    currentDayInMonth: opts.currentDayInMonth || 1
  };
  // Top-level array collections — seeded from the §15.5 collection registry (every descriptor with
  // seedInBlank:true; the central seed + per-collection provenance live in acks-engine.js). A module
  // that adds a collection self-registers via ACKS.registerCollection from its own file and is picked
  // up here automatically — it does NOT edit this factory (the 3-site DRY win). opts.<name> still
  // overrides the empty default, so blankCampaign({ characters:[...] }) behaves exactly as before.
  for(const cn of global.ACKS.seededCollections()){
    c[cn] = opts[cn] || [];
  }
  return c;
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
    // Phase 5 Tribal Domains — the RAW domain-TYPE (RR pp.353–354). 'ordinary' (default) is byte-
    // identical to today; clanhold/transitional/demchi own the per-hex family cap, the levy, the F&D
    // set, and the senate gate. ('ordinary' is the RAW word, and keeps the TYPE axis distinct from the
    // Civilized/Borderlands/Outlands classification axis.) dominantRace tags a beastman (auto-clanhold)
    // / demi-human population. Defensive-read on old saves (domainTypeOf ⇒ 'ordinary', dominantRaceOf
    // ⇒ null) — no migration.
    domainType: opts.domainType || 'ordinary',
    dominantRace: opts.dominantRace || null,
    tags: opts.tags || [],
    // Ruler — v2: ONLY the character ID. The legacy `ruler:{...}` struct is gone.
    rulerCharacterId: opts.rulerCharacterId || null,
    // Per-turn state that used to live on ruler.administersThisMonth — moved up to the domain
    administersThisMonth: opts.administersThisMonth || false,
    // Vassalage
    liegeId: opts.liegeId || null,
    vassalIds: opts.vassalIds || [],
    isRealm: opts.isRealm || false,
    // Phase 3 Military W2 — Vagaries of Incursion (JJ p.102; lazy on old saves).
    // dangerousBordersOverride: the GM's border-configuration judgment ('secure' | 'line' |
    // 'flank' | 'spearhead' | 'isolated'); null = derive from the hex map.
    dangerousBordersOverride: opts.dangerousBordersOverride || null,
    // Geography — single-home (T6): hexes live ONLY in campaign.hexes[] (claimed by hex.domainId);
    // geography carries the domain-level cartography aggregates, not a per-domain hex mirror.
    geography: opts.geography || {
      hexMapId: null,
      primaryHex: { q:0, r:0 },
      hexScale: '6-mile',
      controlledHexes: 1,
      claimedHexes: 1,
      controlledHexList: [],
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
    // Forces — single-home (T6): garrison units live in campaign.units[] (stationedAt this domain),
    // read via unitsStationedAt. No nested garrison mirror on the domain (a caller that builds a
    // legacy d.garrison.units gets it promoted + stripped by the load-time lift).
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
    // === Domain Completion DC-0 (team) === GM override for the RR p.340 "road-connected to a
    // small town within 24 miles" condition. null = use DC-0's DERIVED road-to-small-town check
    // (ACKS.roadConnectedToSmallTown); true/false = GM override for map-less campaigns. Read
    // defensively everywhere (`domain.roadToTownOverride ?? derived`); deliberately NOT lazy-injected
    // into migrateCampaign, so the 6 templates stay true migrate-no-ops (absent ⇒ undefined ⇒ derive).
    // The `!== undefined` guard preserves an explicit `false` passed via opts. (Plan §11.1 / §12.)
    roadToTownOverride: (opts.roadToTownOverride !== undefined ? opts.roadToTownOverride : null),
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
    // Phase_2.5_Terrain_Model_Plan.md — terrain refinement axes (additive, optional; no migration).
    // terrainSubtype: a TERRAIN_SUBTYPES token for the base (sandy/taiga/volcanic/scrubby/…) — drives the
    // lair count (JJ p.69), the encounter sub-table (JJ pp.45–67), and visibility (RR p.275). koppen: a
    // Köppen climate code (Af…EF) — the weather key (JJ p.41) + the biome source. biomeOverride: set ONLY
    // to override the Köppen-derived biome (biome is DERIVED via ACKS.biomeForHex, never stored).
    terrainSubtype: opts.terrainSubtype || '',
    koppen:         opts.koppen || '',
    biomeOverride:  opts.biomeOverride || '',
    // Phase_2.5_Hex_Scales_and_Weather_Plan.md §5 + §9 (HW-4) — the three interlocked map scales.
    // hexScale: which tier this hex belongs to ('local' 1.5-mi | 'regional' 6-mi | 'continental' 24-mi).
    // DEFAULT 'regional' — the canonical, shipped behaviour (every domain mechanic resolves at 6-mile).
    // parentHexId: the id of the COARSER hex that contains this one (a continental hex for a regional
    // child; a regional hex for a local child); null = derive the parent from coords (cube/4, §5.2) —
    // STORED WINS. childHexIds is COMPUTED, never stored (Architecture §3.3). Both additive + read
    // defensively (an old hex with neither reads as a parentless regional hex); deliberately NOT lazy-
    // injected into migrateCampaign, so the 6 templates + demo stay true migrate-no-ops (absent ⇒
    // 'regional'/null). Continental hexes own the climate (koppen) + the rolled weather; their land
    // value / families are AGGREGATES of children (ACKS.aggregateContinentalCell), not stored here.
    hexScale:    (opts.hexScale === 'local' || opts.hexScale === 'continental') ? opts.hexScale : 'regional',
    parentHexId: opts.parentHexId || null,
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
    // Phase 3 Voyages (#145) V3a — the sea-navigation zone (RR p.320), meaningful only when
    // terrain==='water': 'lake'|'river'|'coast'|'open-sea' → the staying-on-course target
    // (4+/4+/7+/11+, ACKS.SEA_NAV_THROWS) + the fog/snow weathering ½. null = unset → read as
    // 'coast' (the forgiving default; auto-derivation from distance-to-shore is V4). Additive
    // optional — NOT lazy-injected into migrateCampaign, so the 6 templates + demo stay migrate-no-ops.
    seaZone: (opts.seaZone === 'lake' || opts.seaZone === 'river' || opts.seaZone === 'coast' || opts.seaZone === 'open-sea') ? opts.seaZone : null,
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
    // T6 single-home — the canonical hex link: campaign.settlements[].hexId is what settlementForHex
    // keys on (the lift sets it when promoting an embedded settlement; foundSettlementOnHex sets it).
    hexId: opts.hexId || null,
    name,
    families: opts.families || 75,
    totalInvestment: opts.totalInvestment || 10000,
    // Urban investment paid over time (RR p.353 — "deduct the expense at a rate of 500gp per day").
    // investmentBudgetGp = committed-but-unpaid gp the GM ordered; it drips into totalInvestment at
    // 500gp/day on the Day Clock (the 'urban-investment' day consumer). investmentDripPaid = the
    // cumulative gp ever paid via the drip; floor(investmentDripPaid/1000) is the family-milestone
    // index that seeds the reproducible 1d10-per-1,000gp immigration roll. Both lazy (|| 0), so old
    // saves migrate for free.
    investmentBudgetGp: opts.investmentBudgetGp || 0,
    investmentDripPaid: opts.investmentDripPaid || 0,
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
    // Settlement Demographics SD-1 (2026-06-16) — the RAW p.214 GM override on the derived
    // Step-3 roster. null = pure RAW expectation; else per-bucket multipliers, e.g. the
    // "city of wizards" = { mage: 3 } or "denuded" = { all: 0.5 }. Read by ACKS.expectedDemographics;
    // additive + defensive (migration-free; templates stay migrate-no-ops). See Settlement_Demographics_Plan.md.
    demographicOverrides: opts.demographicOverrides || null,
    notes: opts.notes || ''
  };
}

// Phase 2.5 Monster Persistence (#476) — Lair, a first-class placed entity.
// M0 (2026-06-09) promoted blankLair from the legacy nested hex.lairs[] sub-entity
// ({id,name,creatureType,hd,numberAppearing,description}) to this shape; legacy nested
// lairs are lifted to campaign.lairs[] by migrateLegacyHexLairs (acks-engine.js). The RAW
// CORE is catalog-free — monsterCatalogKey is just a string until the MONSTER_CATALOG (M2)
// exists; generation (lairPct rolls, treasure, structured population) is the catalog-gated
// part (M3). Two-layer model (survey §2): the Lair entity + lifecycle is the RAW core
// (default behaviour); the "world remembers" persistence layer is default-OFF rules (M10+).
// Population is COMPOSITION (survey §5): groupIds[] → the rank-and-file campaign.groups[],
// leaderCharacterIds[] → individuated leaders in campaign.characters[]. Treasure is lair-only
// (a wandering Group carries none). See Phase_2.5_Monster_Persistence_Plan.md §3.1.
function blankLair(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.lair),
    name: opts.name || '',
    // Lifecycle status. 'dynamic' = authored-but-unplaced pool entry (hexId null), revealed
    // into a hex on a lair roll (the RAW dynamic lair, JJ p.195). 'unknown' = placed but
    // undetailed (the dynamic-lair authoring mode). See §3.2.
    status: opts.status || 'active',  // active|cleared|abandoned|destroyed|unknown|dynamic
    // Placement (D2 — strictly hex-local; no territory radius in v1).
    hexId: opts.hexId || null,                       // null while status:'dynamic'
    precisePlacement: opts.precisePlacement || '',   // GM narrative: "cave on the eastern slope"
    knownToPlayers: opts.knownToPlayers === true,    // discovered via search/tracking? (§6)
    hiddenDC: (opts.hiddenDC === undefined ? null : opts.hiddenDC),  // hex-search modifier
    // Phase 4 Sanctums AD-A — a lair is hex-anchored (wilderness) OR dungeon-anchored (a room in a
    // monster-farm dungeon). dungeonId null for every shipped lair (additive; the arcane overlay sets it
    // via ACKS.anchorLairToDungeon). areaIndex/depthRank = the room ordinal + the deeper-is-stronger rank.
    dungeonId: opts.dungeonId || null,
    areaIndex: (opts.areaIndex === undefined ? null : opts.areaIndex),
    depthRank: (opts.depthRank === undefined ? null : opts.depthRank),
    // Content — the STRUCTURED population (survey §5; NOT a flat count).
    monsterCatalogKey: opts.monsterCatalogKey || '', // → MONSTER_CATALOG (M2); free string until then
    lairPct: (opts.lairPct === undefined ? null : opts.lairPct),     // the monster's Lair % (0 = never lairs)
    groupIds: opts.groupIds || [],                   // rank-and-file Groups → campaign.groups[]
    leaderCharacterIds: opts.leaderCharacterIds || [], // individuated leaders → campaign.characters[]
    totalInhabitantCount: opts.totalInhabitantCount || 0,  // derived-cache (ACKS.lairInhabitantCount)
    // Treasure (lair-only — survey §16.3; a wandering Group carries no hoard).
    treasureType: opts.treasureType || '',           // 'A'..'R' or '' if none
    treasureCustodyId: opts.treasureCustodyId || null, // → campaign.itemCustody[] kind 'monster-hoard'
    // Characteristics
    lairType: opts.lairType || 'lair',               // lair|lair-large|hideout|ruin|natural-cave|dungeon-level
    terrain: opts.terrain || '',
    hasFortifications: opts.hasFortifications === true,
    features: opts.features || [],
    factionKey: opts.factionKey || null,             // reserved — cross-hex-lair-network (M10+)
    // Lifecycle
    establishedAtTurn: opts.establishedAtTurn || 1,
    establishedBy: opts.establishedBy || 'gm-fiat',  // genesis|hex-seeding|dynamic-reveal|persistent-wanderer|gm-fiat
    lastVisitedTurn: (opts.lastVisitedTurn === undefined ? null : opts.lastVisitedTurn),
    clearedAtTurn: (opts.clearedAtTurn === undefined ? null : opts.clearedAtTurn),
    clearedByEventId: opts.clearedByEventId || null,
    repopulationChance: (opts.repopulationChance === undefined ? null : opts.repopulationChance), // reserved
    // Audit (notability is EMERGENT from history — survey §18.8)
    discoveryHistory: opts.discoveryHistory || [],
    notes: opts.notes || '',
    history: opts.history || []                       // derived via Event.context where possible
  };
}

// #476 Encounter layer E1 (D8, 2026-06-10) — the reified pre-combat interaction
// (RR pp.280–287; survey §19, plan §15.1). An Encounter is a committed interaction
// between two sides with identity through change: it hosts the step state the RAW
// procedure accumulates (distance → surprise → evasion → reaction/influence), the
// stored intimidation roll (RAW re-uses the ORIGINAL roll vs new allies — E3), and
// the pursuit phase (E3, absorbing M5). Resolved encounters persist as world
// memory; prior attitude is DERIVED from them (D9), never stored on Lair/Group.
function blankEncounter(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.encounter),
    name: opts.name || '',                            // GM label; display derives from monster/hex
    scale: opts.scale || 'wilderness',                // wilderness|dungeon|sea|settlement|domain (only wilderness live in E1)
    trigger: opts.trigger || 'gm-authored',           // journey-travel|hex-search|rest-night|domain-incursion|gm-authored
    status: opts.status || 'active',                  // active|resolved
    phase: opts.phase || 'setup',                     // setup|surprise|evasion|interaction|pursuit
    outcome: (opts.outcome === undefined ? null : opts.outcome), // null|no-encounter|evaded|parleyed|dispersed|combat|settled-as-lair|dismissed
    hexId: opts.hexId || null,
    category: opts.category || null,                  // monster|civilized (the JJ category draw; null = GM-authored)
    rarity: opts.rarity || null,                      // common|uncommon|rare|very-rare (monster draws, JJ p.44)
    occurredAtTurn: opts.occurredAtTurn || 1,
    occurredOnDayInMonth: (opts.occurredOnDayInMonth === undefined ? null : opts.occurredOnDayInMonth),
    // Sides. partySide.sizeCount = man-equivalents (mounted/large 2, huge 6, gigantic 24,
    // colossal 120 — ENCOUNTER_SIZE_MEN); monsterSide mirrors the M3 pool proposal. E4 adds:
    // label (the printed table cell, verbatim — the display name when the catalog has no key),
    // identity (the 1d100 table roll: {natural, label, key, tableKey|columnKey, rarity, page,
    // gmChosen?}), binding ({mode, inLair, lairRoll, lairPct} — the JJ p.43 step 6a verdict),
    // minted (the unwind receipt when materializing detailed/revealed/created a lair).
    // E4m adds pursuitEncounterId — the chase encounter this band IS, when a third party
    // meets a band that is mid-hunt (dispersing the meeting ends the chase; D9 recalls).
    partySide: Object.assign({ partyId: null, journeyId: null, characterIds: [], faceCharacterId: null, sizeCount: null }, opts.partySide || {}),
    monsterSide: Object.assign({ source: 'fresh', lairId: null, groupIds: [], monsterCatalogKey: '', count: null, encounterKind: null, label: '', identity: null, binding: null, minted: null, pursuitEncounterId: null, residentCharacterId: null, residentSettlementId: null, garrisonDomainId: null, garrisonUnitId: null, garrisonTroopTypeKey: null }, opts.monsterSide || {}),
    // Step state (each null until its step runs; shapes documented in Data_Dictionary §4):
    distance: opts.distance || null,                  // { rolledFt, capFt, distanceFt, light, detectedBy, terrainRow }
    surprise: opts.surprise || null,                  // { party:{...}, monsters:{...}, evadeEligibility, noEncounter }
    evasion: opts.evasion || null,                    // { target, modifiers[], roll, success, aftermath:{...} }
    reaction: opts.reaction || null,                  // { current, rolls[], intimidationOriginalRoll (E3) }
    pursuit: opts.pursuit || null,                    // reserved — E3 (absorbs M5; the monster-pursuit rule)
    resolvedAtTurn: (opts.resolvedAtTurn === undefined ? null : opts.resolvedAtTurn),
    resolvedOnDayInMonth: (opts.resolvedOnDayInMonth === undefined ? null : opts.resolvedOnDayInMonth),
    resolvedByEventId: opts.resolvedByEventId || null,
    survivorsCarriedOver: opts.survivorsCarriedOver || [],  // absorbed from the J1 encounterRecord (§15.1)
    notes: opts.notes || '',
    history: opts.history || []
  };
}

// blankDungeon — the reconciled two-facet factory lives in acks-engine-delves.js (Delves D2, burst4);
// the vestigial stub that was here is superseded + removed (Data_Dictionary §13.2).

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

// Phase 3 Military W1 (2026-06-12) — the Unit factory. Unit is the Group's military
// sibling kind (campaign.units[]; Architecture §2.4): a count of soldiers with troop
// type + the military lifecycle (source / training / stationing / unit loyalty +
// calamities / supply state). The legacy garrison-unit shape is a strict SUBSET —
// blankGarrisonUnit below delegates here, and the load migration extends nested
// garrison/company units in place (reference-unified mirrors, Architecture §3.3).
// Wage + BR defaults derive from TROOP_CATALOG (RR pp.438–441) for the troop type;
// stored values act as GM overrides thereafter.
function blankUnit(opts={}){
  const typeKey = opts.unitTypeKey || 'light-infantry';
  const race = opts.race || 'man';
  const A = (typeof global !== 'undefined' && global.ACKS) ? global.ACKS : {};
  const row = (typeof A.findTroopType === 'function')
    ? A.findTroopType(typeKey, { race, veteran: !!opts.veteran, loadout: opts.loadout || null })
    : null;
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.unit),
    displayName: opts.displayName || (row ? row.label : 'Light Infantry'),
    unitTypeKey: typeKey,
    race,
    loadout: opts.loadout || null,                 // equipment variant A/B/C… (RR catalogs); null = default
    veteran: opts.veteran || false,                // RR p.430 — +1 morale, veteran wage; ≤25% of human mercs
    elite: opts.elite || false,                    // RR p.434 — behind the elite-troops house rule
    count: opts.count || 0,
    casualties: opts.casualties || 0,
    monthlyWage: opts.monthlyWage != null ? opts.monthlyWage : (row ? row.wageGpMonth : 0),   // per soldier
    brPerSoldier: opts.brPerSoldier != null ? opts.brPerSoldier : (row ? row.brPerCreature : 0),
    source: opts.source || 'mercenary',            // mercenary | conscript | militia | clanhold | follower | vassal | slave
    scale: opts.scale || 'company',                // platoon | company | battalion | brigade (RR p.437)
    trainingState: opts.trainingState || null,     // {targetTroopType, startedAtDay, completesAtDay} (RR p.431, W7)
    lieutenantCharacterId: opts.lieutenantCharacterId || null,
    commanderCharacterId: opts.commanderCharacterId || null,
    // Where the unit is assigned: {kind: 'domain-garrison'|'character'|'army'|'hex'|'constructible', id}.
    // The §5.5 Outpost demotion — stationing is a field, not a container entity.
    stationedAt: opts.stationedAt || null,
    // ownerDomainId — the domain (and thereby realm) that raised + owns this unit. RELATIONAL, not
    // geographic: it survives un-stationing, so a unit in an army or in transit still knows which
    // garrison it belongs to (muster timing, wages, the disband fall-back). The 2026-06-22 muster-
    // model rework dropped the geographic home (homeHexId) + the idle map-hint (stationedAtHexId): a
    // unit has a hex only when in an army on campaign or standing at a {kind:'hex'} station; a
    // garrisoning unit is abstract (no coordinate). migrateCampaign renames homeDomainId -> this +
    // drops homeHexId/stationedAtHexId on load.
    ownerDomainId: opts.ownerDomainId || null,
    loyalty: opts.loyalty != null ? opts.loyalty : 0,  // unit loyalty score (RR p.429; ± employer CHA at hire)
    moraleAdjustment: opts.moraleAdjustment != null ? opts.moraleAdjustment : 0,  // one-time levy ±1 + GM tweaks
    calamities: opts.calamities || [],             // [{kind, atTurn|atDay, note}] — RR p.430 loyalty-roll triggers
    supplyState: opts.supplyState || 'supplied',   // supplied | underfed | starving | dehydrated (RR p.452)
    // Movement state is the lazy musterState / musterPending (NOT emitted here): a unit MUSTERS to an
    // army / sortie / hex (callUpUnit / musterUnitToDestination) or is LEVIED in over ½/¼/remainder.
    // Both absent = the unit is present (garrisoning or in the field). The 2026-06-22 muster model
    // dropped the old rally/return-march journey markers — units muster, they no longer march.
    history: opts.history || [],
    notes: opts.notes || ''
  };
}

// Legacy factory — kept as a thin delegate so every existing caller gets the W1 superset
// shape (additive) + RAW catalog wage/BR defaults (the old hardcoded 6gp/0.034 BR were
// the interim MERCENARY_UNIT_DEFAULTS values, retired with TROOP_CATALOG).
function blankGarrisonUnit(opts={}){
  return blankUnit(opts);
}

// Phase 3 Military W1 — the Army factory. Divisions are EMBEDDED (no independent
// lifetime, nothing external points at them — Architecture §3.1; the old `div-` prefix
// reservation is dropped). Armies move on the journey engine (journeyId, W4); supply
// runs Simplified by default (RR p.452 — RAW's own automation mode, a per-army choice).
function blankArmy(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.army),
    name: opts.name || '',
    leaderCharacterId: opts.leaderCharacterId || null,
    // §12 Group model — the individuated roster (officers / riding-along PCs), displayed
    // exactly like a party's members. The leader is one of them; division commanders are
    // drawn from them. Additive + lazy ([]); armies are runtime-only, so templates stay no-ops.
    memberCharacterIds: opts.memberCharacterIds || [],
    // [{name, commanderCharacterId, adjutantCharacterId, unitIds: [], role: 'vanguard'|'main'|'rear-guard'}]
    divisions: opts.divisions || [],
    strategicStance: opts.strategicStance || 'defensive',   // offensive | defensive | evasive (RR p.448)
    journeyId: opts.journeyId || null,                      // armies march as journeys (W4); null = in garrison
    currentHexId: opts.currentHexId || null,
    supplyBaseIds: opts.supplyBaseIds || [],                // friendly domains / strongholds / border forts (RR p.450)
    supplySimplified: opts.supplySimplified != null ? opts.supplySimplified : true,  // RR p.452 default mode
    // ── W5 supply (RR pp.450–452) — all lazy (older saves read defensively) ──
    lastSupplyCheckOrd: opts.lastSupplyCheckOrd != null ? opts.lastSupplyCheckOrd : null,  // world ordinal of the last weekly check
    supplyTerrainTreatment: opts.supplyTerrainTreatment || null,   // GM override: null (auto) | 'elf' | 'dwarf' | 'beastman'
    requisitioning: opts.requisitioning || null,            // {atOrd, gp} while feeding off the land — −50% march speed (RR p.451)
    lastInitiative: opts.lastInitiative != null ? opts.lastInitiative : null,
    // ── W4 maneuvers (RR pp.447–460) — all lazy (older saves read defensively) ──
    marchedOrds: opts.marchedOrds || [],                    // world ordinals marched (last 14) — the 3-of-7 rest rule (RR p.448)
    forcedMarchOrds: opts.forcedMarchOrds || [],            // the forced-march subset (rest the day after or fatigued, RR p.449)
    warMachines: opts.warMachines || null,                  // null | {count, assembled} — caps speed 6/12 mi/day (RR p.449)
    intelReports: opts.intelReports || [],                  // reconnaissance reports incl. held prisoners (RR pp.452–457)
    reconModifier: opts.reconModifier != null ? opts.reconModifier : 0,        // standing GM mod on ITS rolls (magic/spies/stratagems)
    concealmentModifier: opts.concealmentModifier != null ? opts.concealmentModifier : 0,  // standing GM mod on rolls AGAINST it
    alliedLeaderCharacterIds: opts.alliedLeaderCharacterIds || [],   // GM-marked allies beyond the realm chain
    permittedDomainIds: opts.permittedDomainIds || [],      // domains whose ground this army may enter uninvited (no invasion)
    invasions: opts.invasions || {},                        // {domainId: worldOrd} — the once-per-domain invasion stamp (RR p.458)
    pillage: opts.pillage || null,                          // {domainId, startedOrd, daysRequired, saltTheEarth, unitsProportion} | null
    prisoners: opts.prisoners != null ? opts.prisoners : 0, // held prisoners (ransom 40gp/head or Construction labor, RR p.458)
    // ── Garrison reaction (2026-06-14) — a sally force deployed to meet a domain threat (an
    //    incursion band). The army marches to the band's hex (W4); the slot-88 military day
    //    consumer fires the resolution on co-location — abstract drive-off or a W3 battle
    //    (RAW JJ pp.104–106). Both lazy (older armies read undefined → null = a plain army). ──
    reactionTargetGroupId: opts.reactionTargetGroupId || null,  // the threat band this force was deployed against
    reactionBattleId: opts.reactionBattleId || null,            // the W3 battle the resolution created (the re-fire guard)
    history: opts.history || [],
    notes: opts.notes || ''
  };
}

// Phase 3 Military W3 (2026-06-12) — the Battle entity (RR pp.461–472): one engagement
// between two sides, from setup through the 10-phase battle turns to the aftermath.
// Sides hold battle-unit working records (snapshots pointing back at world Units/Groups/
// heroes — world casualties land only when the aftermath is APPLIED). Resolution verbs
// live in acks-engine-battles.js. campaign.battles[] is lazy-defaulted on load.
function blankBattleSide(opts={}){
  return {
    label: opts.label || '',
    kind: opts.kind || 'adhoc',                 // army | garrison | groups | adhoc
    armyId: opts.armyId || null,
    domainId: opts.domainId || null,            // garrison sides — whose garrison
    groupIds: opts.groupIds || [],
    stance: opts.stance || 'defensive',         // offensive | defensive | evasive (RR p.448)
    leaderCharacterId: opts.leaderCharacterId || null,
    commanders: opts.commanders || [],          // [{characterId, zones: ['left'|'center'|'right']}]
    units: opts.units || [],                    // battle-unit records (see acks-engine-battles.js)
    deployRestriction: opts.deployRestriction || 'all',   // all | vanguard | rear-guard (the situation's role)
    zonesDenied: opts.zonesDenied || [],        // zones the surprised side cannot deploy into (RR p.463)
    startingUnitCount: opts.startingUnitCount || 0,       // stamped at beginBattle
    breakPoint: opts.breakPoint || 0,           // ⅓ starting units, rounded up (RR p.467)
    startingBr: opts.startingBr || 0,           // Σ roster BR at begin (the troop-XP ratio reads it)
    withdrawn: opts.withdrawn || false,         // voluntarily withdrew (phase 10)
    gmAttackMod: opts.gmAttackMod || 0          // standing GM attack-throw modifier (conditions, stratagems)
  };
}
function blankBattle(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.battle),
    name: opts.name || '',
    hexId: opts.hexId || null,
    scale: opts.scale || 'company',             // platoon | company | battalion | brigade (RR p.437)
    status: opts.status || 'setup',             // setup | fighting | ended | resolved
    awareness: opts.awareness || 'mutual',      // mutual | mutual-unawareness | unilateral-a | unilateral-b
    situation: opts.situation || 'pitched-battle',        // STRATEGIC_SITUATIONS key
    attackerSide: opts.attackerSide || 'a',
    surprisedSide: opts.surprisedSide || null,  // null | 'a' | 'b'
    options: opts.options || {
      armySizeAsymmetry: false,                 // RR p.464 optional rule (recommended ON for monster fights)
      advantageousTerrain: null,                // null | 'a' | 'b' — which side holds the hill/ridgeline (−2 vs it)
      cannotRetreat: null                       // null | 'a' | 'b' | 'both' — +2 morale (surrounded/trapped)
    },
    turnNumber: opts.turnNumber || 0,
    sides: opts.sides || { a: blankBattleSide(), b: blankBattleSide() },
    forays: opts.forays || [],                  // heroic foray records (declare → resolve → applied by the turn)
    turnLog: opts.turnLog || [],                // one record per battle turn (lines + the _pre revert snapshot)
    result: opts.result || null,                // {winner, loser, endedBy, endedAtTurn} once ended
    aftermath: opts.aftermath || null,          // the computed proposal; applied:true once world-writes land
    createdAtTurn: opts.createdAtTurn || 1,
    createdOnDay: opts.createdOnDay || 1,
    history: opts.history || [],
    notes: opts.notes || ''
  };
}

// Phase 3 Military W6 (2026-06-13, burst3 team session) — the Siege entity (RR pp.473–485):
// an investment of a garrisoned stronghold / urban settlement by a besieging army. The
// default resolution is Sieges Simplified (the Duration-of-Siege table, days-to-capture); the
// detailed blockade / reduction / assault state is the per-instance opt-up. daysElapsed is
// DERIVED (worldOrd − startedOrd) — not stored. campaign.sieges[] is read defensively (no
// migrateCampaign injector, so the 6 templates + demo stay migrate-no-ops). Setters + the
// slot-90 day-tick consumer + the simplified resolver live in acks-engine-sieges.js.
function blankSiege(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.siege),
    name: opts.name || '',
    status: opts.status || 'investing',          // investing | resolved
    resolutionMode: opts.resolutionMode || 'simplified',  // simplified (default) | detailed
    besiegerArmyId: opts.besiegerArmyId || null,
    defenderDomainId: opts.defenderDomainId || null,      // the besieged domain (garrison + stronghold value)
    defenderArmyId: opts.defenderArmyId || null,          // a defending army holed up inside (optional)
    hexId: opts.hexId || null,                            // where the stronghold stands
    // Stronghold profile — authored, or estimated from strongholdValue at startSiege (RR p.474).
    stronghold: Object.assign({
      material: 'stone',                                  // stone | wood (wood = ⅒ the shp)
      strongholdShp: 0,                                   // total structural hit points
      shpDamage: 0,                                       // damage dealt so far — breaches = ⌊shpDamage / 1000⌋
      unitCapacity: 0,                                    // units it can defend (RR p.473)
      siteType: 'normal'                                  // normal | riverbank(×2) | peninsula(×3) | island(×4) | mountain(×5)
    }, opts.stronghold || {}),
    // Blockade state (RR pp.474–475) — the detailed opt-up.
    blockade: Object.assign({
      inPlace: false,
      circumvallationFeet: 0,                             // each 250' replaces 2 blockading units; full ring → −4 smuggling
      weeksPrep: 0,                                       // weeks of warning before encirclement (more stored supplies)
      storedSuppliesGp: 0,                                // current value of stored supplies (depletes as the garrison eats)
      suppliesExhausted: false
    }, opts.blockade || {}),
    // Besieger / defender war machines (the Sieges-Simplified bonus-unit table, RR p.485) —
    // {typeKey: count}. Bonus units widen the unit advantage; detailed bombardment reads them too.
    besiegerArtillery: opts.besiegerArtillery || {},
    defenderArtillery: opts.defenderArtillery || {},
    // Simplified clock (RR pp.484–485).
    daysRequired: opts.daysRequired != null ? opts.daysRequired : null,   // null = '−' (besieger too weak; blockade only)
    unitAdvantageAtStart: opts.unitAdvantageAtStart != null ? opts.unitAdvantageAtStart : null,
    startedOrd: opts.startedOrd != null ? opts.startedOrd : null,         // worldOrd when investing began
    captureReady: opts.captureReady || false,            // the simplified clock has run out — the GM resolves
    lastTickOrd: opts.lastTickOrd != null ? opts.lastTickOrd : null,      // last slot-90 advance
    assaultBattleId: opts.assaultBattleId || null,       // the W3 Battle an assault handed off to
    resolution: opts.resolution || null,                 // {outcome: captured|lifted|surrendered|destroyed, endedAtTurn, battleId?}
    history: opts.history || [],
    notes: opts.notes || ''
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
  // PT-0: route proficiency detection through the canonical accessor — it alias-folds and normalizes
  // BOTH the needle and the stored {key,ranks} entry to the same slug, so a required 'Manual of Arms'
  // matches {key:'manual-of-arms'} (and 'Heraldry'→manual-of-arms via the alias). The shape-aware
  // de-hyphenated substring scan is the standalone-engine fallback.
  const canon = (global.ACKS && typeof global.ACKS.hasProficiency === 'function') ? global.ACKS.hasProficiency : null;
  const profs = (character.proficiencies || []).map(p =>
    (typeof p === 'string' ? p : (p && (p.key || p.name || p.label)) || '').toLowerCase().replace(/-/g, ' '));
  function hasProf(name){
    if (canon) return canon(character, name);
    const needle = String(name || '').toLowerCase().replace(/-/g, ' ');
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
    structures: opts.structures || [],
    // Phase 4 Construction Wave C — link to the first-class Constructible mirror
    // (migrateStrongholdComponentsToConstructibles, acks-engine.js). null until mirrored.
    constructibleId: opts.constructibleId || null
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
  // Wave C — carry the Constructible-mirror link forward, so a stronghold already mirrored in its
  // legacy single-stronghold shape (s.constructibleId set by migrateStrongholdComponentsToConstructibles)
  // keeps the link on its new component[0] — otherwise a load→convert→save→reload would mint a duplicate mirror.
  const legacyConstructibleId = s.constructibleId || null;
  s.components = [];
  // Only create a component if there's anything to migrate (avoid spurious empty entries).
  if(legacyType || legacyBuildValue > 0 || legacyStructures.length > 0){
    s.components.push(blankStrongholdComponent({
      type: legacyType,
      buildValue: legacyBuildValue,
      structures: legacyStructures,
      constructibleId: legacyConstructibleId
    }));
  }
  // Drop the legacy fields so we don't carry duplicate state.
  delete s.type;
  delete s.buildValue;
  delete s.structures;
  delete s.constructibleId;
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
    // Detail level (2026-06-18 doctrine) — an NPC may be created 'lightweight' (a named
    // stub: type + wage + classification, abilities left at the 10-default) or 'full'
    // (rolled). A lightweight NPC is never a dead end — ACKS.expandCharacterToFull upgrades
    // it in place. Absent ⇒ 'full' (existing/template chars + PCs read as full; defensive,
    // no migration). The reusable lightweight↔full primitive for every NPC-creation surface.
    detailLevel: opts.detailLevel || 'full',
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
    // Settlement Demographics SD-1 (2026-06-16) — the home pointer: the settlement this NPC is
    // rostered in (the realized side of ACKS.realizedDemographics). Distinct from currentHexId
    // (where it stands now). null = unplaced. Additive + defensive; SD-2 wires the auto-set
    // sources (recruit/generate/encounter) + placementRole. See Settlement_Demographics_Plan.md.
    homeSettlementId: opts.homeSettlementId || null,
    // Settlement Demographics SD-3 (2026-06-16) — the realm home pointer: the DOMAIN this NPC serves
    // in (the realized side of ACKS.realmCommandStructure — an entourage office-holder of a realm).
    // Distinct from homeSettlementId (an urban resident) and currentHexId. null = not a realm retainer.
    // The realm tier is gated by the `living-census` house rule. Additive + defensive; migration-free.
    homeDomainId: opts.homeDomainId || null,
    // Settlement Demographics SD-2 (2026-06-16) — the civic placement role (JJ Step 4, p.217):
    // which part of the settlement this NPC belongs to (tower-of-knowledge / temple / …). null =
    // use the bucket-derived suggestion (ACKS.effectivePlacementRole). Additive + defensive.
    placementRole: opts.placementRole || null,
    // Settlement Demographics SD-4 (2026-06-19) — the RURAL home pointer: the wilderness/countryside
    // HEX this NPC lives in (the realized side of ACKS.domainRuralDemographics — "A Typical Hex").
    // Distinct from homeSettlementId (an urban resident) + currentHexId (where it stands now). The
    // rural tier is gated by the `living-census` house rule. Additive + defensive; migration-free.
    // (Note: this homeHexId is the Character's census residence — the Unit entity has NO home hex; a
    // unit's owner is unit.ownerDomainId, its location is unit.stationedAt. Different entity, no collision.)
    homeHexId: opts.homeHexId || null,
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
    // === Delves D1 — Mortal Wounds (team burst3 2026-06-13 — acks-engine-mortal-wounds.js) ===
    // The wound-record array (RR pp.300–301 + Appendix C pp.517–523). applyMortalWound pushes
    // a record {table,damageType,d20,d6,condition,permanentWound,bedRestDaysRemaining,outcome,…};
    // the slot-58 convalescence consumer advances bedRestDaysRemaining + resolves recovery. Read
    // defensively as (c.mortalWounds || []) everywhere — NO migrateCampaign injector, so the 6
    // templates + demo stay migrate-no-ops (the team-session defensive-read discipline, CLAUDE §15).
    mortalWounds: opts.mortalWounds || [],
    // === Religion R0 (team 2026-06-13 — Phase_4_Religion_Plan.md §4.4) ===
    // Divine power: a per-character spendable resource (gp-equivalent) a divine caster
    // accrues from worship/sacrifice. It CANNOT be stored — each accrual fades one month
    // after it is received (RR p.422), so it's an expiring ledger of {accruedAtTurn, amountGp,
    // source, deityId, expiresAtTurn} entries; reliquaryStoreGp is the craftpriest reliquary's
    // ONE non-expiring exception (0 for everyone else). Spendable now = Σ unexpired entries +
    // reliquaryStoreGp (ACKS.divinePowerAvailable). Additive + read DEFENSIVELY everywhere
    // (char.divinePower?.entries || []); deliberately NOT lazy-injected into migrateCampaign, so
    // legacy saves + the 6 templates stay migrate-no-ops (R0). Accrual/expiry land in R1.
    divinePower: (opts.divinePower && typeof opts.divinePower === 'object')
      ? { entries: Array.isArray(opts.divinePower.entries) ? opts.divinePower.entries : [],
          reliquaryStoreGp: Number(opts.divinePower.reliquaryStoreGp) || 0 }
      : { entries: [], reliquaryStoreGp: 0 },
    // === end Religion R0 ===
    // === Character Lifecycle CL-1 (burst4) === (RR p.19 — aging / attribute adjustments / death from old age)
    // Run the person forward. The monthly aging pass (ACKS.processAgingForTurn — hooked into commitTurn
    // like living-expenses) advances `age` with the calendar, applies the RR p.19 progressive attribute
    // adjustment on a category crossing, and fires the death-from-old-age Death save inside the threshold
    // window. All read DEFENSIVELY (absent ⇒ the default below) — NO migrateCampaign injector, so the 6
    // templates + demo stay migrate-no-ops (the team-session discipline, CLAUDE §15 / Plan §13.4).
    //   age:        years (number) | null. null ⇒ the aging pass SKIPS the character (opt-in seeding — the
    //               GM sets it on the sheet for the characters he cares about; survey §14 Q1).
    //   ageMonths:  0–11, the within-year accumulator the monthly turn advances (one turn = one month);
    //               at 12 it rolls over → age++ (Q2: advance age monthly, no calendar-epoch coupling).
    //   ageCategory: a display cache of ACKS.ageCategoryFor(c) (that derivation is canonical, rule #10);
    //               the pass reconciles it. null until set/derived; ageless races (elf/nobiran) → 'adult'.
    //   agingDeathSave: the death-from-old-age bookkeeping {dueInMonths,thresholdKey,resolved:[]} | null
    //               (RR p.19 — a Death save within 1d12 months of Old+CON / Ancient+CON / max-age-&-yearly).
    //   reserveXp:  the RAW Reserve XP fund (RR p.311) carried ON the character (survey §14 Q3 — inherited
    //               by the successor); seeded now for CL-4a. Default 0.
    age: (typeof opts.age === 'number' ? opts.age : null),
    ageMonths: opts.ageMonths || 0,
    ageCategory: opts.ageCategory || null,
    agingDeathSave: opts.agingDeathSave || null,
    reserveXp: opts.reserveXp || 0,
    // === end Character Lifecycle CL-1 ===
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
    // Scutage lifecycle (RR pp.347–348). scutageAutoPay is the persistent toggle: when true the vassal
    // pays scutage AUTOMATICALLY every monthly turn (the "Pay Scutage" button turns it on; "Stop Paying"
    // turns it off), billing as the vassal's garrison expense in the monthly net + crediting the lord each
    // month until stopped. false = not paying (withheld; the liege card shows a notice). scutageLastPaidTurn
    // is the AUDIT stamp of the last month scutage actually settled (set by the monthly turn). Both null/false
    // for every non-scutage kind; read defensively → no migration.
    scutageAutoPay: opts.scutageAutoPay != null ? !!opts.scutageAutoPay : false,
    scutageLastPaidTurn: opts.scutageLastPaidTurn != null ? opts.scutageLastPaidTurn : null,
    // Scutage **rate** in gp per family (RR p.347 — "1gp per family in the vassal's realm"). The monthly
    // amount is DERIVED LIVE (scutageMonthlyGp = rate × the vassal's current realm families), so it tracks
    // population growth/decline. null = the RAW default 1gp/family; a lower rate is "demand less" (RR p.345).
    // null for every non-scutage kind.
    scutageGpPerFamily: opts.scutageGpPerFamily != null ? opts.scutageGpPerFamily : null,
    // Running total of gp the vassal has expended on a Construction duty (auto-revokes at
    // 15,000gp per 6-mile hex in the realm — RR p.348). 0 for every other kind.
    constructionSpentGp: opts.constructionSpentGp || 0,
    // Office favor (RR p.348 — F&D-8): the free-text ceremonial office the lord granted (e.g. "Knight
    // Marshal", "Royal Chancellor"). '' for every non-office kind. The office grants the holder's OWN
    // vassals +1 to their loyalty rolls (officeLoyaltyBonusFor; non-stacking). Read defensively → no migration.
    officeTitle: opts.officeTitle || '',
    // Construction-duty orders (RR p.348 — F&D-7 liege side): the hexes + structure types the lord
    // ordered built, `[{hexId, type}]` (type ∈ CONSTRUCTION_DUTY_TYPES). The liege may add more while
    // the duty is active; the target gp is derived = 15,000 × distinct ordered hexes (no orders → the
    // realm-hex cap, legacy). [] for every non-construction kind. Read defensively → no migration.
    constructionOrders: Array.isArray(opts.constructionOrders) ? opts.constructionOrders : [],
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
      hitDice: null,                     // RAW HD string e.g. '1-1', '4+1'
      // #476 E10 — when set, this band is drawn from a domain's TRAINED MILITIA in revolt
      // (RR p.433: "any rebels will be drawn from the militia"): its BR + identity read the
      // TROOP_CATALOG, not the MM. troopRace/troopLoadout/troopVeteran resolve the row via
      // findTroopType (mirroring unitTroopRow); troopLabel is the display name. Absent/null
      // = an ordinary creature band (priced via monsterCatalogKey). monsterCatalogKey stays
      // 'bandit' on a militia band so the encounter machinery still treats it as men.
      troopTypeKey: null
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
    // #476 E10 — domain-morale banditry (RR pp.350–351; lazy on old saves). Set = this band
    // is the domain's OWN disaffected men: its wander is fenced to that domain, it never dens
    // or heads home, and the monthly turn reconciles it to banditCount (dissolving it when
    // morale recovers to −1 or better — the men return to their fields).
    banditryDomainId: opts.banditryDomainId || null,
    // Phase 3 Military W2 — Vagaries of Incursion (JJ pp.100–106; lazy on old saves).
    // Set = this band arrived as a DOMAIN ENCOUNTER: the verdict bundle the incursion
    // consumer recorded. Shape: { domainId, attitude (hostile|unfriendly|neutral|
    // mercantilist|friendly), disposition ('lingering'|'migrating'), fullStrength,
    // treasureType, rulerAware, monstersIntel, arrivedAtTurn, arrivedOnDay }. A
    // migrating band wanders on via the monster-bands consumer; a lingering one holds
    // (wanderState.halted) as the standing threat the BR comparison priced.
    incursion: opts.incursion || null,
    // #476 E6 — autonomous band motion (the monster-bands day consumer; lazy on old
    // saves). null = the defaults govern: an un-housed living band WANDERS (migration
    // movement — half expedition speed, random steps, never directly back). Shape:
    // { coord, lastCoord, mileRemainder, mode (null = wandering | 'heading-home'),
    //   destLairId, dissolveOnArrival, lastDomainId, halted (the GM's parking lever) }.
    wanderState: opts.wanderState || null,
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
    // W4 — an ARMY's march (RR p.448: armies move on the standard expedition rules).
    // When set, the army governs the journey: its slowest-unit speed × the large-army
    // multiplier × war-machine cap, the ARMY weather table, no navigation throw, no
    // per-hex encounter draws, no character survival (army supply is W5). Lazy field.
    armyId: opts.armyId || null,
    // A single UNIT marching to rally at an army's muster point (callUpUnit). Like an army
    // march, the party-grain machinery stands down; speed = the unit's own troop-type pace.
    // On arrival the unit is stationed to the army. Lazy field.
    unitId: opts.unitId || null,
    // The unit's march is a RETURN HOME (returnUnitHome — the symmetric counterpart of the
    // call-up rally): on arrival the unit falls back into its home-domain garrison rather than
    // joining an army. Lazy field (default false; old saves read falsy). Set with journey.unitId.
    unitReturnHome: opts.unitReturnHome || false,
    // The unit's march is a FREE march (startUnitMarch — the Garrison-table "March" verb): on
    // arrival the unit halts at the destination hex (neither rallies to an army nor returns home).
    // Lazy field (default false; old saves read falsy). Set with journey.unitId. No supply line —
    // supply is army-only; a lone unit just carries what it carries. (2026-06-17)
    unitMarch: opts.unitMarch || false,
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
    // E8 (RR p.285): the encounter whose evaded-then-failed Navigation throw (at −4) put this
    // journey at status 'lost' — KNOWINGLY lost, unlike the §27 unknowing stray (isLost). The
    // journey HOLDS until the landmark search recovers it, a re-route re-orients it, or the GM
    // clears it. null = not knowingly lost. (Read defensively — pre-E8 saves lack the field.)
    lostEncounterId: opts.lostEncounterId || null,
    coveredBaseline: opts.coveredBaseline || 0,
    currentHexId: opts.currentHexId || null,            // the hex the party is in now (advances hex-by-hex along the route — §24)
    currentDayIndex: opts.currentDayIndex || 0,         // 0..N days into the journey
    // Lockstep marker (Complete Movement, 2026-06-05): absolute world ordinal (turn*30 + dayInMonth) of
    // the day the latest leg TRAVELLED ON. null ⇒ not yet travelled (party still at the origin). The
    // day-tick skip-guard + the UI's "already moved today" check read it to keep one leg per world day.
    lastTravelWorldOrd: opts.lastTravelWorldOrd != null ? opts.lastTravelWorldOrd : null,
    daysRemainingEstimate: opts.daysRemainingEstimate != null ? opts.daysRemainingEstimate : null,
    // Mode + pace
    mode: opts.mode || 'foot',                          // J1: land modes; voyage-* modes ride a Vessel via shipId (§13)
    pace: opts.pace || 'normal',                        // forced-march | normal | cautious | half-ancillary
    // Voyages V2 (voyage modes only — a journey with a shipId): the propulsion the captain runs
    // ('auto' takes the faster of sail/oar given the wind; 'sail'/'oar' force it) + the GM toggle for
    // 24-hour open-sea sailing (×2 distance, gated on navigator + full crew + sail-capable). Lazy
    // fields, read defensively (journey.propulsion || 'auto') — no migration; land journeys ignore them.
    propulsion: opts.propulsion || 'auto',              // auto | sail | oar
    continuousSailing: opts.continuousSailing || false, // 24h open-sea sail toggle (RR p.318)
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
    // Completion spec (Construction Wave C — 2026-06-18). For a stronghold-component project, the
    // Construction Wizard stashes {componentType, structures:[{structureKey,quantity}]} here so the
    // construction-completed handler can rebuild the real stronghold component (so the domain's
    // stronghold value grows) + link it to the minted Constructible mirror. null for other kinds.
    completionSpec: opts.completionSpec || null,
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

// =============================================================================
// === Religion R0 (team 2026-06-13 — Phase_4_Religion_Plan.md §4.1–§4.3) ===
// Wave E (Architecture.md §3.5). Catalog-free RAW core: the Deity reference entity +
// the Congregation + the DivineFavor relation. RAW-faithful per the D1 ruling — DivineFavor
// tracks `standing` + a transgression log, NOT a numeric `favorLevel`; divine *power* (the
// expiring ledger on the character, §4.4) is the only numeric resource. No `kind` field is
// stored (the Entity Registry + collection membership carry the kind — the blankLair precedent).
// =============================================================================

// §4.1 — Deity. A first-class, system-agnostic reference entity (CORR-3). Ships generic;
// the Auran pantheon is an optional content pack (§11.4), never baked in (principle #4).
function blankDeity(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.deity),
    name: opts.name || '',
    alignment: opts.alignment || 'Neutral',          // Lawful | Neutral | Chaotic
    portfolio: opts.portfolio || '',                  // free text — "war, the dawn, justice"
    codeOfBehavior: opts.codeOfBehavior || '',        // free text (or a Phase 6 code ref) — what adherents uphold
    // Blood-sacrifice posture (RR p.422). Lawful/Neutral → none|animals-only; Chaotic → sapient.
    acceptsBloodSacrifice: opts.acceptsBloodSacrifice || 'none', // none | animals-only | sapient
    // Auran Empyrean rule: animal sacrifice yields the CASTER nothing (pure devotion to the god).
    sacrificeAsDevotion: opts.sacrificeAsDevotion === true,
    notes: opts.notes || '',
    status: opts.status || 'active',                  // active | dormant
    history: opts.history || []
  };
}

// §4.2 — Congregation. A divine caster's body of faithful (personal proselytizing and/or
// Domain Worship). Generates divine power weekly (the accrual math lands in R1). Domain-worship
// DP is DERIVED from the domain's live families × morale, never stored. templeRef is the optional
// {kind,id} site pointer (kept null until placed — Inspector edits it via Raw JSON for now).
function blankCongregation(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.congregation),
    name: opts.name || '',
    deityId: opts.deityId || null,
    highPriestCharacterId: opts.highPriestCharacterId || null,  // the divine caster who draws the power
    templeRef: opts.templeRef || null,                          // { kind:'settlement'|'outpost'|'stronghold'|'hex', id } | null
    personalCongregants: opts.personalCongregants || 0,         // from proselytizing — full 10gp/50/week rate
    domainWorshipDomainId: opts.domainWorshipDomainId || null,  // ruler/chaplain path; DP from this domain is DERIVED
    proselytizingValueThisMonthGp: opts.proselytizingValueThisMonthGp || 0, // accumulator → congregant gain at month end
    maintainedWeeksThisMonth: opts.maintainedWeeksThisMonth || 0,           // 0..4; un-maintained weeks drive decline
    lastMaintainedAtTurn: (opts.lastMaintainedAtTurn != null ? opts.lastMaintainedAtTurn : null),
    foundedAtTurn: opts.foundedAtTurn || 1,
    status: opts.status || 'active',                            // active | declining | abandoned | suppressed
    history: opts.history || []
  };
}

// §4.3 — DivineFavor. The (character ↔ deity) relation (Architecture §3, Wave E). RAW-faithful
// (D1): `standing` is the categorical relationship state (RAW has NO numeric favor score), with a
// transgression log. One active favor per (character, deity); a divine caster normally has one patron.
function blankDivineFavor(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.divineFavor),
    characterId: opts.characterId || null,
    deityId: opts.deityId || null,
    standing: opts.standing || 'good-standing',     // good-standing | lapsed | excommunicate (RAW, not numeric)
    codeOfBehaviorAck: opts.codeOfBehaviorAck === true,  // does this character uphold the deity's code
    sinceTurn: opts.sinceTurn || 1,
    lastSacrificeAtTurn: (opts.lastSacrificeAtTurn != null ? opts.lastSacrificeAtTurn : null),
    lastWorshipAtTurn: (opts.lastWorshipAtTurn != null ? opts.lastWorshipAtTurn : null), // last pray-and-sacrifice
    transgressionsLog: opts.transgressionsLog || [], // [{turn, kind, severity, tableRoll, consequence, atonedAtTurn|null}] — R5 owns the table
    status: opts.status || 'active',
    history: opts.history || []
  };
}
// === end Religion R0 ===

// === Knowledge Layer Wave A (team burst7 2026-06-19) — Lore + Knowledge factories ===
// Knowledge_Layer_Plan.md §6 / Sages_Knowledge_RAW_Survey.md §6+§16. Lore = a first-class fact
// (rumors subsume in Wave B); Knowledge = the per-knower relation (the believed-vs-true link,
// confidence + provenance). FIRST-hand Lore is DERIVED from the eventLog (acks-engine-knowledge.js
// firstHandLore); a stored Knowledge record is SECOND-hand (heard/read/deduced/gossip).
function blankLore(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.lore),
    // The fact as the GM states it (the TRUE statement of the fact). A Knower's distorted
    // belief lives on the Knowledge record's believedText (the secret-identity case), not here.
    text: opts.text || '',
    loreKind: opts.loreKind || 'fact',          // fact|rumor|secret|identity ('rumor' reserved for the Wave-B Rumors migration)
    truthValue: opts.truthValue || 'unknown',   // true|false|partial|unknown — is the statement actually true in the world?
    topic: opts.topic || '',                    // a short subject tag for grouping/search
    subjectIds: opts.subjectIds || [],          // entity ids the fact is ABOUT (mixed-kind) → powers loreOnSubject
    qualityDimensions: opts.qualityDimensions || [], // the What's-the-Word 6 dimensions (GM-filled; empty in v1)
    createdAtTurn: opts.createdAtTurn || 1,
    createdByCharacterId: opts.createdByCharacterId || null,
    notes: opts.notes || '',
    history: opts.history || []
  };
}
function blankKnowledge(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.knowledge),
    knowerKind: opts.knowerKind || 'character', // character|group|faction|domain|settlement (a ROLE, read via predicates)
    knowerId: opts.knowerId || null,
    loreId: opts.loreId || null,
    certainty: opts.certainty || 'rumored',     // rumored|suspected|probable|certain (the DF suspicion dimension, not a bool)
    source: opts.source || { kind: 'told-by', byId: null }, // provenance: witnessed|told-by|sage|treatise|deduced|gossip|rumor|gm
    believedText: opts.believedText || '',      // what THIS Knower believes (may differ from Lore.text); '' = the true text
    learnedAtTurn: opts.learnedAtTurn || 1,
    learnedAtHexId: opts.learnedAtHexId || null,
    status: opts.status || 'active',            // active|forgotten
    history: opts.history || []
  };
}

// === Delves D5 (team burst11 2026-06-20) — the SettlementVisit entity (svt-, Wave F) =========
// Phase_3.5_Delves_Plan.md §4.4 — the off-screen settlement layer: a settlement-scoped STAY record,
// the vessel for the urban-incident generator (JJ ch.3 / pp.81–84) + the holed-up day-cadence mode.
// The svt- prefix + campaign.settlementVisits[] collection + the registry kind 🛤 were RESERVED
// 2026-05-30 (lazyDefaultV1ScopeReservations + blankCampaign + entity-registry); this lane mints the
// factory that makes the kind real (+ the field-schema). The campaign-activity venues (Emporium /
// Guildhouse / Temple / Tower — buy / hire / research) are NOT here — that's the activity-budget
// #346 venue layer (Milestone A). The SettlementVisit is the adventure-INCIDENT surface only.
function blankSettlementVisit(opts={}){
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.settlementVisit),   // 'svt-' (reserved 2026-05-30)
    name: opts.name || '',                                // optional GM label (else derived from the settlement)
    settlementId: opts.settlementId || null,
    hexId: opts.hexId || null,                            // the settlement's hex (incident Event.context + day-clock)
    partyId: opts.partyId || null,
    participantCharacterIds: opts.participantCharacterIds || [],
    mode: opts.mode || 'holed-up',                        // holed-up | wandering | looking-for-trouble (JJ p.80)
    status: opts.status || 'active',                      // active | departed
    // [{ dayInMonth, turn, roll(1d100[+30 dark]), afterDark, incidentKey, label, category, cite,
    //    reactionCall, tone, reaction{natural,total,band}, theft{save,target,failed,gpLost},
    //    diseaseExposure, combatRisk, authority, rumor, rewardGp, affectedCharacterId, resolved, eventId }]
    incidents: opts.incidents || [],
    arrivedAtTurn: opts.arrivedAtTurn || null,
    arrivedAtDayInMonth: opts.arrivedAtDayInMonth || null,
    departedAtTurn: opts.departedAtTurn || null,
    history: opts.history || [],
    notes: opts.notes || ''
  };
}
// === end Delves D5 ===========================================================================

Object.assign(ACKS, {
  blankCampaign, blankDomain, blankHex, blankSettlement, blankLair, blankEncounter, blankPointOfInterest, blankLandImprovementProject, blankGarrisonUnit, blankSpecialist, blankStrongholdStructure, blankStrongholdComponent, migrateStrongholdToComponents, strongholdTotalValue, AGRICULTURAL_IMPROVEMENT_COST_PER_STEP, AGRICULTURAL_IMPROVEMENT_MAX_BONUS, AGRICULTURAL_IMPROVEMENT_VALUE_CAP, migrateHexToAccumulatedImprovement, migrateHexToMultiSupervisor, ratchetAgriculturalImprovement, blankCharacter, blankParty, blankVenture, blankPassiveInvestment,
  // Phase 2.95 Stash A + Wave A relation factories (2026-05-29)
  blankStash, blankStashItem, blankHenchmanship, blankSpecialistContract, blankHirelingContract, blankMagistracy, blankVassalage, blankTributaryAgreement, blankOutpost,
  // Favors & Duties (#230, F&D-1 — 2026-06-08) — liege↔vassal obligation relation factory
  blankFavorDutyObligation,
  // Wave B.5 — Notable items + custody factories (2026-05-29)
  blankNotableItem, blankItemCustody,
  // #442 — Group entity factory (Architecture.md §2.4, 2026-05-29)
  blankGroup,
  // Phase 3 Military W1 (2026-06-12) — Unit (Group's military sibling) + Army factories
  blankUnit, blankArmy,
  // Phase 3 Military W3 (2026-06-12) — Battle entity + side factories (RR pp.461–472)
  blankBattle, blankBattleSide,
  // Phase 3 Military W6 (2026-06-13, burst3) — Siege entity factory (RR pp.473–485)
  blankSiege,
  // Phase 2.5 Journeys (#475) — Journey entity factory (J1)
  blankJourney,
  // Phase 4 Construction Wave A (Architecture.md §10 — 2026-05-30)
  blankProject, blankConstructible,
  // === Religion R0 (team 2026-06-13) — Wave E: Deity + Congregation + DivineFavor factories ===
  blankDeity, blankCongregation, blankDivineFavor,
  // === Knowledge Layer Wave A (team burst7 2026-06-19) — Lore fact + Knowledge per-knower relation ===
  blankLore, blankKnowledge,
  // === Delves D5 (team burst11 2026-06-20) — SettlementVisit (svt-, the off-screen settlement layer) ===
  blankSettlementVisit,
  MAGISTRATE_ROLES, MAGISTRATE_ROLE_KEYS, MAGISTRATE_SALARY_FRACTION, emptyMagistrates, ensureMagistratesShape, isCharacterQualifiedForRole,
  LOYALTY_BANDS, loyaltyBandFor, applyLoyaltyFloors, rollLoyalty
});

if(typeof module !== 'undefined' && module.exports){
  module.exports = ACKS;
}

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
