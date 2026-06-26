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

// ENGINE_VERSION — the engine's release/generation tag, equal to package.json's "version".
//
// Why this exists, separate from SCHEMA_VERSION: SCHEMA_VERSION is the BREAKING save-format
// version (a clean break at 2; bumped only when old saves can no longer load). It has been 2
// across every release, evolved forward by the idempotent reconcilers in migrateCampaign — so
// it cannot tell a consumer WHICH generation of the tool wrote a file (a `schemaVersion: 2`
// save might predate or postdate `units`/`armies`/`encounters`). ENGINE_VERSION fills that gap:
// stamped onto saved campaigns (at SAVE time — see stampCampaignForSave, NOT in migrateCampaign,
// so loading a template stays a byte-identical no-op and the field is absent from the shipped
// templates), it lets a third-party reader version-detect across releases. See INTEGRATION.md.
//
// No build step (CLAUDE §4), so this is a hand-kept constant, NOT read from package.json at
// runtime (package.json isn't reachable from a file:// browser load). tests/schema.smoke.js
// asserts it equals package.json's "version" — the same release-checklist guard that pins the
// README version (T1-C); bump both together on release.
const ENGINE_VERSION = '0.51.0';

// ID prefix scheme — three-letter where possible, lowercased, dash-separated.
// When in doubt, look up via ID_PREFIXES rather than hardcoding.
// Self-registration kernel — the registerDayConsumer pattern generalized to the central prefix
// list (CLAUDE §15.5 north star). ID_PREFIXES is an accumulating store, not a frozen literal: a
// module that introduces a new entity calls ACKS.registerPrefix('thing','xyz') at load (a
// typeof-guarded call, the registerDayConsumer idiom) instead of editing this central list. The
// core + legacy set is seeded just below (values byte-identical to the old freeze). The reverse-
// lookup Proxy readers in the other modules read global.ACKS.ID_PREFIXES at runtime, so they
// observe every registration regardless of module load order.
const ID_PREFIXES = {};
function registerPrefix(kind, prefix){
  if(!kind || !prefix) return ID_PREFIXES;
  const existing = ID_PREFIXES[kind];
  if(existing && existing !== prefix){
    if(typeof console !== 'undefined' && console.warn){
      console.warn('[ACKS] ID-prefix conflict for "' + kind + '": "' + existing + '" already registered; ignoring "' + prefix + '".');
    }
    return ID_PREFIXES;
  }
  ID_PREFIXES[kind] = prefix;
  return ID_PREFIXES;
}
// Seed the core + legacy prefix set. New entities do NOT extend this literal — they call
// ACKS.registerPrefix from their own module (the §15.5 convention). The comments below are the
// per-entity provenance, preserved verbatim from the original frozen list.
Object.entries({
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
  // === Religion R0 (team 2026-06-13) — Deity reference entity (Phase_4_Religion_Plan.md §4.1, CORR-3).
  // con/dfv/att pre-reserved; dei added now (the deity collection ships with R0).
  deity:                'dei',
  congregation:         'con',
  divineFavor:          'dfv',
  attunement:           'att',
  // Sanctums AD-B (2026-06-15) — the apprenticeship relation (an L0 apprentice ↔ a sanctum master, RR p.386).
  apprenticeship:       'apr',
  // Wave F (Architecture.md §3.5) — Settlement Adventures relation entity, reserved 2026-05-30
  settlementVisit:      'svt',
  // Wave D (Architecture.md §3.5) + Phase 6 Codes shared — Oath relation entity, reserved 2026-05-30
  oath:                 'oth',
  // Phase 4 Construction Wave A (Architecture.md §10 — 2026-05-30) — Project + Constructible
  project:              'prj',
  constructible:        'cst',
  // Phase 2.95 Hirelings (#310) — day-aware recruitment drive (sub-object on the patron, 2026-06-06)
  recruitmentDrive:     'rcd',
  // Phase 2.7 Hijinks (HJ-1, world-front team session 2026-06-13) — registered canonically at integration
  hijink:               'hij',
  // === Hijinks HJ-2 (team 2026-06-13) — Syndicate (RR pp.358–362; campaign.syndicates[])
  syndicate:            'syn',
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
  battle:               'btl',
  // Phase 3 Military W6 (2026-06-13, burst3 team session) — Siege (the RR pp.473–485
  // stronghold-investment record; resolved by acks-engine-sieges.js).
  siege:                'sie',
  // === Voyages V1 (burst4) — Phase 3 Voyages (#145): Vessel (RR Ch.7 Seafarers & Voyages,
  // the RR p.316 Sea Vessels classes; resolved by acks-engine-voyages.js). ===
  vessel:               'vsl',
  // === Delves D2 (burst4) — the multi-foray clear-a-dungeon operation (Phase_3.5_Delves_Plan.md
  // §4.2). The Dungeon prefix 'dun' is already registered above (since 2026-05-30); this adds Delve. ===
  delve:                'dlv',
  // === Politics P-1 (burst4 2026-06-13) — the senate/faction/senatorship data layer
  // (RR pp.355–360; acks-engine-politics.js). Wave D (Architecture §3.5).
  senate:               'sen',
  faction:              'fac',
  senatorship:          'snr',
  // === Gladiators G1 (b5-gladiators, burst5 2026-06-14) — AXIOMS 4 (#150). Bout / Gladiator
  // School / Game/Munus first-class entities (Phase_4_Gladiators_Plan.md §3). Arena → a
  // Constructible + Sponsor → a field (NOT entities — arn-/spo- dropped, survey §4). ===
  bout:                 'bot',
  gladiatorSchool:      'gld',
  game:                 'gam',
  // === Custom Classes & Races W1 (b5-custom-classes, team burst5) — #154.
  // ClassTemplate (the point-buy class DEFINITION) + RaceTemplate (the +racial-build-point
  // race); catalog/template tier. Resolved by acks-engine-custom-classes.js (Phase 6 W1). ===
  customClass:          'ccl',
  customRace:           'crc',
  // === Magic Research (AD-M1, 2026-06-15) — Phase 4 the Arcane-Domain consumer (RR pp.388–393).
  // The Research Project entity (campaign.researchProjects[]); resolved by acks-engine-magic-research.js. ===
  researchProject:      'rsp',
  // === Banking (team b7 2026-06-19) — Banking & Loans B1 (#148). The shared Loan relation
  // (campaign.loans[]; RR p.42 Access to Capital) + the BankAccount relation/wealth-handle
  // (campaign.bankAccounts[]; RR p.313 custody). Resolved by acks-engine-banking.js.
  loan:                 'lon',
  bankAccount:          'bnk',
  letterOfCredit:       'loc',           // === Banking B4/B5 (team burst9 2026-06-20) — the inter-market draw primitive (campaign.lettersOfCredit[])
  // === Knowledge Layer Wave A (team burst7 2026-06-19) — the Lore data layer (Knowledge_Layer_Plan.md /
  // Sages_Knowledge_RAW_Survey.md §6/§16). `lore` = a first-class fact (campaign.lore[]; rumors subsume in
  // Wave B); `knowledge` = the per-knower relation (campaign.knowledge[]; character ↔ lore, the
  // believed-vs-true / confidence + provenance link). Resolved by acks-engine-knowledge.js. ===
  lore:                 'lor',
  knowledge:            'knw',
  // === Sages SG-2 (burst8 b8-sages 2026-06-19) — the multi-week SageCommission research-commission
  // (campaign.sageCommissions[]; Phase_4_Sages_Plan.md §3.3). A work-in-progress entity advanced on
  // the slot-64 day-tick + resolved on the shipped Proficiency-Throws die. Resolved by acks-engine-sages.js. ===
  sageCommission:       'sag',
  // === Mounts (Phase 2.5 MO-1, 2026-06-21) — the Mount entity (campaign.mounts[]; RR
  // p.161 Domesticated Animals; resolved by acks-engine-mounts.js). Catalog+instance,
  // owned by a character, surfaced in the Inventory tab, assigned to journeys. ===
  mount:                'mnt'
}).forEach(function(pair){ registerPrefix(pair[0], pair[1]); });

// =============================================================================
// Collection self-registration — the §15.5 family, slice 2 (after ID prefixes).
// =============================================================================
// The top-level `campaign.<name>[]` array collections are the second central append-target
// generalized off the registerDayConsumer pattern. Before this, a module adding a collection
// had to edit THREE sites — blankCampaign() (seed), lazyDefaultV1ScopeReservations() (load-time
// backfill), and index.html's SIMPLE_ID_COLLECTIONS (the Import-Domain walker) — the dominant
// team-session merge-conflict surface. Now each collection is a descriptor in this accumulating
// store, and a module self-registers from its own file via ACKS.registerCollection(name, opts);
// the three sites DERIVE from the store. Each descriptor carries three INDEPENDENT flags observed
// across the three sites (the pre-refactor truth table):
//   seedInBlank — blankCampaign() seeds it as an empty array on a fresh campaign.
//   lazyDefault — migrateCampaign() backfills it on load (an old save without it gains [] ).
//   importable  — Import-Domain copies it (id-collision-skip per the §8.9 importer mandate).
// registerCollection DEFAULTS to the DEFENSIVE-READ posture { seedInBlank:true, lazyDefault:false,
// importable:true } (Joachim 2026-06-20): a new collection is NOT migrate-injected, so no template
// regen is ever forced (the byte-level migrate-no-op test stays green) — the team-session enabler.
// A collection that genuinely needs eager backfill opts in with { lazyDefault:true }.
const CAMPAIGN_COLLECTIONS = [];
const CAMPAIGN_COLLECTION_INDEX = {};
function registerCollection(name, opts){
  if(!name || typeof name !== 'string') return CAMPAIGN_COLLECTIONS;
  opts = opts || {};
  const desc = {
    name: name,
    seedInBlank: opts.seedInBlank !== false,   // default true
    lazyDefault: !!opts.lazyDefault,           // default false (defensive-read)
    importable:  opts.importable  !== false    // default true
  };
  const existing = CAMPAIGN_COLLECTION_INDEX[name];
  if(existing){
    // idempotent: identical flags = silent no-op; differing flags = warn + keep the original
    // (mirrors registerPrefix's conflict rule — the seed wins over a late differing registration).
    if(existing.seedInBlank !== desc.seedInBlank || existing.lazyDefault !== desc.lazyDefault || existing.importable !== desc.importable){
      if(typeof console !== 'undefined' && console.warn){
        console.warn('[ACKS] collection "' + name + '" re-registered with different flags; keeping the original.');
      }
    }
    return CAMPAIGN_COLLECTIONS;
  }
  CAMPAIGN_COLLECTION_INDEX[name] = desc;
  CAMPAIGN_COLLECTIONS.push(desc);
  return CAMPAIGN_COLLECTIONS;
}
function registeredCollections(){ return CAMPAIGN_COLLECTIONS.slice(); }
function seededCollections(){     return CAMPAIGN_COLLECTIONS.filter(function(c){ return c.seedInBlank; }).map(function(c){ return c.name; }); }
function lazyDefaultCollections(){ return CAMPAIGN_COLLECTIONS.filter(function(c){ return c.lazyDefault; }).map(function(c){ return c.name; }); }
function importableCollections(){ return CAMPAIGN_COLLECTIONS.filter(function(c){ return c.importable; }).map(function(c){ return c.name; }); }

// Seed the existing 58 collections with their EXACT pre-refactor flags (the truth table — captured
// from main @ 8023191). New collections do NOT extend this literal; they call ACKS.registerCollection
// from their own module (the §15.5 convention). Order = blankCampaign()'s collection order (so a fresh
// campaign's array-key set is preserved), then the importer-only (seedInBlank:false) collections.
// Provenance comments are grouped; per-collection detail lives in Data_Dictionary §1 + §13.2.
[
  // ── Core collections (predate the reservation system) ───────────────────────────────────────
  ['domains',              { seedInBlank:true,  lazyDefault:false, importable:false }],  // special-cased in the importer (upsertDomain)
  ['characters',           { seedInBlank:true,  lazyDefault:false, importable:true  }],
  ['parties',              { seedInBlank:true,  lazyDefault:false, importable:true  }],
  ['ventures',             { seedInBlank:true,  lazyDefault:false, importable:true  }],
  ['passiveInvestments',   { seedInBlank:true,  lazyDefault:false, importable:true  }],
  ['deities',              { seedInBlank:true,  lazyDefault:false, importable:true  }],  // Religion R0 (the Deity reference entity)
  ['banks',                { seedInBlank:true,  lazyDefault:false, importable:false }],  // legacy reserved; not walked by the importer
  ['loans',                { seedInBlank:true,  lazyDefault:false, importable:true  }],  // Banking B1 (the shared Loan relation)
  ['hexes',                { seedInBlank:true,  lazyDefault:false, importable:false }],  // special-cased in the importer (id + (q,r) coord uniqueness)
  ['settlements',          { seedInBlank:true,  lazyDefault:false, importable:true  }],
  ['rumors',               { seedInBlank:true,  lazyDefault:false, importable:true  }],
  ['stashes',              { seedInBlank:true,  lazyDefault:false, importable:true  }],  // Stash A (always-on core)
  // ── Wave A relation collections (Architecture §3.5) ─────────────────────────────────────────
  ['henchmanships',        { seedInBlank:true,  lazyDefault:false, importable:true  }],
  ['specialistContracts',  { seedInBlank:true,  lazyDefault:false, importable:true  }],
  ['hirelingContracts',    { seedInBlank:true,  lazyDefault:false, importable:true  }],
  ['magistracies',         { seedInBlank:true,  lazyDefault:false, importable:true  }],
  ['vassalages',           { seedInBlank:true,  lazyDefault:false, importable:true  }],
  ['tributaryAgreements',  { seedInBlank:true,  lazyDefault:false, importable:true  }],
  ['favorDutyObligations', { seedInBlank:true,  lazyDefault:true,  importable:true  }],  // F&D-1 (lazy-injected)
  // ── Wave B.5 + Group ────────────────────────────────────────────────────────────────────────
  ['notableItems',         { seedInBlank:true,  lazyDefault:false, importable:true  }],
  ['itemCustody',          { seedInBlank:true,  lazyDefault:false, importable:true  }],
  ['groups',               { seedInBlank:true,  lazyDefault:false, importable:true  }],
  // ── 2026-05-30 post-survey reservations (lazy-injected) ─────────────────────────────────────
  ['journeys',             { seedInBlank:true,  lazyDefault:true,  importable:true  }],
  ['outposts',             { seedInBlank:true,  lazyDefault:true,  importable:true  }],
  ['dungeons',             { seedInBlank:true,  lazyDefault:true,  importable:true  }],
  ['congregations',        { seedInBlank:true,  lazyDefault:true,  importable:true  }],
  ['divineFavors',         { seedInBlank:true,  lazyDefault:true,  importable:true  }],
  ['attunements',          { seedInBlank:true,  lazyDefault:true,  importable:true  }],
  ['settlementVisits',     { seedInBlank:true,  lazyDefault:true,  importable:true  }],
  ['oaths',                { seedInBlank:true,  lazyDefault:true,  importable:true  }],
  ['vagaryOfIncursionEvents', { seedInBlank:true, lazyDefault:true, importable:true }],
  ['projects',             { seedInBlank:true,  lazyDefault:true,  importable:true  }],  // Construction Wave A
  ['constructibles',       { seedInBlank:true,  lazyDefault:true,  importable:true  }],
  ['lairs',                { seedInBlank:true,  lazyDefault:true,  importable:true  }],  // Monster Persistence M0
  // ── Hijinks (defensive-read, seeded) ────────────────────────────────────────────────────────
  ['hijinks',              { seedInBlank:true,  lazyDefault:false, importable:true  }],
  ['syndicates',           { seedInBlank:true,  lazyDefault:false, importable:true  }],
  // ── Arcane Domain (lazy-injected) ───────────────────────────────────────────────────────────
  ['researchProjects',     { seedInBlank:true,  lazyDefault:true,  importable:true  }],  // Magic Research AD-M1
  ['apprenticeships',      { seedInBlank:true,  lazyDefault:true,  importable:true  }],  // Sanctums AD-B
  // ── Banking / Knowledge / Sages (defensive-read, seeded) ────────────────────────────────────
  ['bankAccounts',         { seedInBlank:true,  lazyDefault:false, importable:true  }],
  ['lettersOfCredit',      { seedInBlank:true,  lazyDefault:false, importable:true  }],
  ['lore',                 { seedInBlank:true,  lazyDefault:false, importable:true  }],
  ['knowledge',            { seedInBlank:true,  lazyDefault:false, importable:true  }],
  ['sageCommissions',      { seedInBlank:true,  lazyDefault:false, importable:true  }],
  // ── Importer-only collections (NOT seeded in blankCampaign — historically materialized by
  //    migrate or seed-on-write, never by the factory; preserved exactly) ──────────────────────
  ['encounters',           { seedInBlank:false, lazyDefault:true,  importable:true  }],  // Encounter layer E1 (migrate-injected, not seeded)
  ['units',                { seedInBlank:false, lazyDefault:true,  importable:true  }],  // Military W1
  ['armies',               { seedInBlank:false, lazyDefault:true,  importable:true  }],
  ['battles',              { seedInBlank:false, lazyDefault:true,  importable:true  }],  // Military W3
  ['sieges',               { seedInBlank:false, lazyDefault:false, importable:true  }],  // Military W6 (defensive-read)
  ['vessels',              { seedInBlank:false, lazyDefault:false, importable:true  }],  // Voyages V1
  ['delves',               { seedInBlank:false, lazyDefault:false, importable:true  }],  // Delves D2
  ['senates',              { seedInBlank:false, lazyDefault:false, importable:true  }],  // Politics P-1
  ['factions',             { seedInBlank:false, lazyDefault:false, importable:true  }],
  ['senatorships',         { seedInBlank:false, lazyDefault:false, importable:true  }],
  ['bouts',                { seedInBlank:false, lazyDefault:false, importable:true  }],  // Gladiators G1
  ['gladiatorSchools',     { seedInBlank:false, lazyDefault:false, importable:true  }],
  ['games',                { seedInBlank:false, lazyDefault:false, importable:true  }],
  ['customClasses',        { seedInBlank:false, lazyDefault:false, importable:true  }],  // Custom Classes W1
  ['customRaces',          { seedInBlank:false, lazyDefault:false, importable:true  }],
  ['mounts',               { seedInBlank:false, lazyDefault:false, importable:true  }]   // Mounts MO-1 (defensive-read; migrate-no-op)
].forEach(function(pair){ registerCollection(pair[0], pair[1]); });

// =============================================================================
// Load-migration self-registration — the §15.5 family, slice 4 (after house rules).
// =============================================================================
// migrateCampaign() runs an ordered sequence of idempotent per-LOAD passes — the normalize /
// backfill / lift / reconcile steps that run on EVERY campaign load regardless of schemaVersion
// (distinct from the versioned MIGRATIONS array below, which bumps schemaVersion). Before this it
// was a hand-ordered block of ~19 bare calls inside migrateCampaign — a central append-target every
// data-shape subsystem had to edit. Now each pass is a descriptor in this accumulating store, and a
// module self-registers its pass from its own file via ACKS.registerLoadMigration(name, fn, {order}).
// Unlike the prefix / collection / house-rule families (which are SETS), the passes are an ORDERED
// PIPELINE with real dependencies (e.g. stash-item-shapes must run BEFORE reconcile-stashes; the
// lairs / units / projects lifts run AFTER lazy-default seeds their collections), so a pass carries
// an explicit `order` and the runner sorts by (order, registration-seq). The legacy 19 are seeded
// just before migrateCampaign with orders 10..190 (gaps of 10 leave room to slot a new pass between
// two existing ones). registerLoadMigration is a no-op on missing args; a same-name re-register with
// a DIFFERENT fn warns + keeps the original (the registerPrefix / registerCollection conflict rule).
const LOAD_MIGRATIONS = [];
const LOAD_MIGRATION_INDEX = {};
let _loadMigrationSeq = 0;
function registerLoadMigration(name, fn, opts){
  if(!name || typeof name !== 'string' || typeof fn !== 'function') return LOAD_MIGRATIONS;
  opts = opts || {};
  const existing = LOAD_MIGRATION_INDEX[name];
  if(existing){
    // idempotent: same fn = silent no-op; a different fn keeps the original (warn). An already-
    // registered pass is never silently reordered (re-registering can't reshuffle the pipeline).
    if(existing.fn !== fn && typeof console !== 'undefined' && console.warn){
      console.warn('[ACKS] load-migration "' + name + '" re-registered with a different fn; keeping the original.');
    }
    return LOAD_MIGRATIONS;
  }
  const desc = { name: name, fn: fn, order: (typeof opts.order === 'number' ? opts.order : 1000), seq: _loadMigrationSeq++ };
  LOAD_MIGRATION_INDEX[name] = desc;
  LOAD_MIGRATIONS.push(desc);
  return LOAD_MIGRATIONS;
}
// The passes in execution order — sorted by (order, registration-seq) so a same-order pass keeps its
// registration order, and a new pass slots deterministically. Returns a fresh sorted array (callers
// must not mutate the store).
function registeredLoadMigrations(){
  return LOAD_MIGRATIONS.slice().sort(function(a, b){ return (a.order - b.order) || (a.seq - b.seq); });
}
// Run every registered per-load pass in order, in place. migrateCampaign calls this after the
// versioned MIGRATIONS schema-bump loop. Each pass is idempotent (safe to run on every load).
function runLoadMigrations(campaign){
  registeredLoadMigrations().forEach(function(p){ p.fn(campaign); });
  return campaign;
}

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

// Class → save-progression archetype. The (X) in each class's "Class (X) Attack and Saving Throws"
// table title IS the RAW archetype — assassins and bards advance "as fighters" (RR: "Assassin (Fighter)…",
// "Bard (Fighter)…"), so both take the fighter row, not the thief row.
// ⚠ Race-variant classes (dwarven vaultguard/craftpriest, elven spellsword/nightblade, Nobiran
// wonderworker) print their OWN tables with the racial save bonus baked in (dwarven Hardy +3 Blast/+4
// other; Nobiran Favor +2 all; the elven tables are bespoke). The engine approximates them with the
// base human archetype here — a known simplification (it does NOT apply the racial adjustment); the
// four BASE class tables (fighter/mage/cleric/thief) are RAW-exact and pinned by tests/save-tables.smoke.js.
const CLASS_TO_SAVE_ARCHETYPE = Object.freeze({
  'fighter':'fighter','barbarian':'fighter','paladin':'fighter','explorer':'fighter',
  'assassin':'fighter','bard':'fighter',
  'dwarven vaultguard':'fighter','vaultguard':'fighter',
  'elven spellsword':'fighter','spellsword':'fighter',
  'mage':'mage','wizard':'mage','warlock':'mage',
  'nobiran wonderworker':'mage','wonderworker':'mage',
  'cleric':'cleric','crusader':'cleric','priestess':'cleric','priest':'cleric',
  'shaman':'cleric','bladedancer':'cleric',
  'dwarven craftpriest':'cleric','craftpriest':'cleric',
  'thief':'thief','venturer':'thief',
  'elven nightblade':'thief','nightblade':'thief'
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
// RR p.353 — a clanhold whose chief actively raided/adventured this month grows faster ("treat the
// clanhold as two population categories smaller on the p.340 growth table"). 🔧 The shipped growth model
// is a simplified d10-per-thousand oracle with no explicit RR p.340 category brackets, so the bonus is
// modelled as one EXTRA natural-increase roll — a clear, bounded "grows faster" increment in the same
// dice unit (the magnitude is a tooling approximation, open to tuning). Returns the extra families this
// month: 0 unless the domain is a clanhold whose chief raided AND morale is above collapse (≤ −4 ⇒ 0,
// mirroring rollNaturalIncrease). Late-binds isClanhold (domain-variants.js loads after this file).
function clanholdRaidGrowth(campaign,d,familiesK,moraleAfter,rng){
  if(moraleAfter<=-4 || !d || !d.chiefRaidedThisMonth) return 0;
  if(!(global.ACKS && typeof global.ACKS.isClanhold==='function' && global.ACKS.isClanhold(d))) return 0;
  return rollD10x(familiesK,rng);
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
function _ruralHexes(campaign, d){
  // Single-home (T6): a domain's rural hexes are its canonical campaign.hexes with no settlement.
  return hexesForDomain(campaign, d && d.id).filter(h => !settlementForHex(campaign, h.id));
}
function _redistributeRuralFamilies(campaign, d, newTotal){
  const hexes = _ruralHexes(campaign, d);
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
function setPeasantPopulation(campaign, d, newTotal){
  if(!d || !d.demographics) return;
  newTotal = Math.max(0, Math.floor(newTotal));
  d.demographics.peasantFamilies = newTotal;
  _redistributeRuralFamilies(campaign, d, newTotal);
}
// Inverse of setPeasantPopulation: derive the domain's peasant total FROM its rural
// hexes. This is the canonical direction when families-per-hex-tracking is ON — the GM
// edits per-hex family counts directly, so the hexes are the source of truth and the
// domain total is simply their sum. Returns the new total.
function syncRuralPopulationFromHexes(campaign, d){
  if(!d || !d.demographics) return 0;
  const sum = _ruralHexes(campaign, d).reduce((s,h) => s + (h.families||0), 0);
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
    const hexes = _ruralHexes(campaign, d);
    if(hexes.length === 0) return;
    const pf = (d.demographics && d.demographics.peasantFamilies) || 0;
    const hexSum = hexes.reduce((s,h) => s + (h.families||0), 0);
    if(pf === hexSum) return;
    if(perHexCanonical && hexSum > 0){
      syncRuralPopulationFromHexes(campaign, d);   // hexes canonical → peasantFamilies = Σ(hex.families)
    } else {
      _redistributeRuralFamilies(campaign, d, pf); // domain total canonical (or seeding empty hexes)
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
  const authored = (stored && DOMAIN_CLASSIFICATIONS.indexOf(stored) !== -1) ? stored : suggestDomainClassification(d);
  // === DC-2 (team) === classification advancement is PERMANENT (RR p.340). The effective tier is
  // the MORE-ADVANCED of the GM-authored value and the advancement floor (d.classificationAdvancedTo,
  // read DEFENSIVELY — absent on legacy/template domains ⇒ undefined ⇒ authored wins, a migrate-no-op).
  // The GM may author HIGHER (start Civilized); the engine never silently lowers a domain below what
  // it earned (canonical-setter discipline, principle #10). DOMAIN_CLASSIFICATIONS is most→least, so
  // "more advanced" = the lower index. The floor is written only by processClassificationAdvancement.
  const floor = d && d.classificationAdvancedTo;
  if(floor && DOMAIN_CLASSIFICATIONS.indexOf(floor) !== -1 &&
     DOMAIN_CLASSIFICATIONS.indexOf(floor) < DOMAIN_CLASSIFICATIONS.indexOf(authored)){
    return floor;
  }
  return authored;
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

// Seed the legacy per-load passes with their EXACT pre-refactor execution order (orders 10..190 —
// the hand-ordered block that used to live inline in migrateCampaign, node-captured from main @
// 9b1273f). New passes do NOT extend this literal: a module self-registers its pass from its own
// file via ACKS.registerLoadMigration with an explicit order (the §15.5 convention). The per-pass
// provenance comments below are preserved verbatim from the old inline block. The ordering
// dependencies (why each `order` is what it is):
//   • character-proficiencies (60) after character-classification (50)
//   • stash-item-shapes (100) BEFORE reconcile-stashes (110) — reconcile reads facet-shaped lines
//   • the lairs/units/agricultural/stronghold lifts (140..170) after lazy-default-v1 (130) seeds
//     campaign.lairs[] / units[] / armies[] / projects[]
//   • stronghold-to-constructibles (170) after agricultural-to-projects (160)
//   • sync-party-camp-stashes (190) after reconcile-party-membership (180) + domain-treasuries (90)
//   • the stash/coins/wealth passes (orders 70,90,100,110,120,190) now self-register from
//     acks-engine-stash.js (T5, 2026-06-23) — orders preserved, so the dependencies above still hold
[
  // Foundation #234 — drop legacy campaign.log[]. The Campaign Log view now derives from eventLog.
  // Idempotent: subsequent loads find the field already gone and skip cleanly.
  ['drop-legacy-log', function(c){ if(Array.isArray(c.log)){ delete c.log; } }, 10],
  // Foundation #241 — reconcile rural population drift. Pre-fix campaigns may have peasantFamilies
  // ≠ sum(rural hex.families). Idempotent: a no-op on already-consistent data.
  ['reconcile-rural-population', reconcileRuralPopulation, 20],
  // Foundation #244 — strip mining-tagged income.other entries when the dwarven-mining house rule is
  // off (special signature: takes (domains, houseRules)). Covers domains stored inside current.domains;
  // the Alpine session-restore path calls stripUnusedMiningEntries separately for its split domains array.
  ['strip-unused-mining', function(c){ stripUnusedMiningEntries(c.domains || [], c.houseRules || {}); }, 30],
  // 2026-06-05 — remove the retired tributePct field (auto-tribute is RAW realm-families now). Idempotent.
  ['remove-tribute-pct', migrateRemoveTributePct, 40],
  // Phase #440 stage 1 — additive five-axis classification (controlledBy / socialTier /
  // lifecycleState / creatureTypes / isEnchantedCreature / hitDice). Idempotent.
  ['character-classification', migrateAllCharacterClassification, 50],
  // PT-0 — materialize the loose character.proficiencies[] into the canonical { key, ranks (, spec) }
  // shape on disk. Guarded: a no-op when the proficiencies module isn't loaded (standalone engine use).
  // Runs after the classification migration. The forward ideal is acks-engine-proficiencies.js
  // self-registering this pass from its own file. See Phase_3.6_Proficiency_Throws_Plan.md §5.2.
  ['character-proficiencies', function(c){
    if(global.ACKS && typeof global.ACKS.migrateAllCharacterProficiencies === 'function'){
      global.ACKS.migrateAllCharacterProficiencies(c);
    }
  }, 60],
  // #445 — Wave A relation backfill (liege / magistrates / tribute → henchmanships / … /
  // tributaryAgreements). Additive; legacy fields preserved. Idempotent.
  ['wave-a-relations', migrateLegacyToWaveARelations, 80],
  // 2026-05-30 post-survey scope reservations — lazy backfill of additive collections + fields.
  // Idempotent. See Data_Dictionary §13.2 + §13.3.
  ['lazy-default-v1-reservations', lazyDefaultV1ScopeReservations, 130],
  // #476 M0 (legacy-hex-lairs @140) + Military W1 (garrison-units-to-units @150) load passes now
  // self-register from acks-engine-lairs.js / acks-engine-military.js (T5, 2026-06-23). Orders preserved.
  // T6 single-home — strip the now-redundant nested UNIT mirrors (domain.garrison /
  // character.mercenaryCompany), right after the @150 lift promotes them to campaign.units. The
  // hex/settlement mirror is stripped later, in _finishLoad after the hex lift (NOT here). Idempotent.
  ['strip-unit-mirror', stripUnitMirrors, 155],
  // Wave Construction-B — backfill agricultural improvements onto Project entities. Runs after
  // lazy-default (guarantees campaign.projects[]) and reads campaign.hexes. Idempotent.
  ['agricultural-to-projects', migrateAgriculturalToProjects, 160],
  // Wave Construction-C — lift each domain's stronghold onto a first-class Constructible mirror
  // (additive; the economy keeps reading the stronghold's own value — zero drift). Runs after the
  // ag migration. Idempotent.
  ['stronghold-to-constructibles', migrateStrongholdComponentsToConstructibles, 170],
  // #521 follow-up — rebuild each party's member mirror + validate leader from character.partyId
  // (Architecture §3.3). Idempotent; no-op on party-less templates.
  ['reconcile-party-membership', reconcilePartyMembership, 180],
].forEach(function(t){ registerLoadMigration(t[0], t[1], { order: t[2] }); });

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
  // Run the registered per-load migration passes in order (the self-registration kernel —
  // Architecture §9.4 / CLAUDE §15.5). These are the idempotent normalize / backfill / lift /
  // reconcile passes that run on EVERY load regardless of schemaVersion; each is registered with
  // an explicit `order` (the legacy 19 are seeded above with orders 10..190) so a module can
  // self-register its pass from its own file. Replaces the old hand-ordered inline block — same
  // passes, same order; the per-pass provenance comments now live on the seed descriptors above.
  runLoadMigrations(current);
  return current;
}

// finalizeCampaignLoad(campaign) — the post-migrate FINISH steps (G2, audit 2026-06-24). These ran
// only in the UI's domain-app.js _finishLoad, so a headless integrator following INTEGRATION.md §5's
// `migrateCampaign(raw)` recipe got a campaign with its hexes still trapped in the legacy nested
// mirror (campaign.hexes === undefined) — the lift never ran. Lifting them into the engine makes one
// code path for app + headless: array-ensure → the pre-lift lazy migrations (player-input → events,
// stronghold → components, hex improvement/supervisor shapes, magistrate shape) → the #193 top-level
// lift of hexes/settlements/rumors → agricultural-Project materialization → the T6 mirror strip.
// Idempotent (every step is). Cross-module steps go through global.ACKS (guarded, so a partial-module
// headless load degrades instead of throwing); the lift/strip/agri steps are in-file. Mutates + returns.
function finalizeCampaignLoad(campaign){
  if(!campaign || typeof campaign !== 'object') return campaign;
  if(!Array.isArray(campaign.domains))      campaign.domains = [];
  if(!Array.isArray(campaign.pendingEvents)) campaign.pendingEvents = [];
  if(!Array.isArray(campaign.eventLog))     campaign.eventLog = [];
  if(!Array.isArray(campaign.hexes))        campaign.hexes = [];
  if(!Array.isArray(campaign.settlements))  campaign.settlements = [];
  if(!Array.isArray(campaign.rumors))       campaign.rumors = [];
  const A = global.ACKS || {};
  const ds = campaign.domains;
  if(A.migratePendingPlayerInputToEvents) A.migratePendingPlayerInputToEvents(campaign);
  if(A.migrateStrongholdToComponents) ds.forEach(d => A.migrateStrongholdToComponents(d));
  // #17/#18 read the NESTED hexes, so they must run BEFORE the lift empties domain.geography.hexes[].
  if(A.migrateHexToAccumulatedImprovement) ds.forEach(d => (d.geography && d.geography.hexes || []).forEach(h => A.migrateHexToAccumulatedImprovement(h)));
  if(A.migrateHexToMultiSupervisor) ds.forEach(d => (d.geography && d.geography.hexes || []).forEach(h => A.migrateHexToMultiSupervisor(h)));
  if(A.ensureMagistratesShape) ds.forEach(d => A.ensureMagistratesShape(d));
  // #193 — lift hexes/settlements/rumors to the top-level collections (empties the nested arrays).
  const liftSynth = { domains: ds, hexes: campaign.hexes, settlements: campaign.settlements, rumors: campaign.rumors };
  liftToTopLevelCollections(liftSynth);
  campaign.hexes = liftSynth.hexes;
  campaign.settlements = liftSynth.settlements;
  campaign.rumors = liftSynth.rumors;
  // Construction-B — materialize agricultural Projects now that hexes are lifted (templates ship nested).
  migrateAgriculturalToProjects(campaign);
  // T6 single-home — strip the nested hex/settlement mirror (the lift already promoted any legacy data).
  stripHexSettlementMirrors(campaign);
  return campaign;
}

// loadCampaign(raw) — the COMPLETE headless load entry (G2): migrate, then finalize, then return the
// ready-to-use campaign. This is what INTEGRATION.md §5 should advertise instead of bare migrateCampaign
// — a Node bot / companion tool gets a campaign with its hexes already lifted into campaign.hexes,
// exactly as the app does. The UI's _finishLoad calls finalizeCampaignLoad (it already migrated), so
// the two share one finish implementation.
function loadCampaign(raw){
  return finalizeCampaignLoad(migrateCampaign(raw));
}

// stampCampaignForSave(campaign, opts?) — return a SAVE-READY deep clone of a campaign with the
// generation/version metadata stamped: engineVersion = ENGINE_VERSION, savedAt = today, and the
// canonical lastModifiedAt (campaign + each domain). PURE — never mutates the input.
//
// This is the headless serializer the data-layer contract documents (INTEGRATION.md): a Node bot
// or companion tool writes `JSON.stringify(ACKS.stampCampaignForSave(campaign))` and the file
// carries the engineVersion a later reader version-detects on. The in-app File-System-Access save
// path (index.html serializedCampaign()) should route through this too so app-written and tool-
// written files agree — that wiring is a one-liner gated on the index.html owner.
//
// Deliberately NOT called by migrateCampaign: stamping engineVersion on load would make every
// shipped template gain the field, breaking the migrate-no-op invariant (migrations.smoke P3.6:
// on-disk template === migrate(template)). engineVersion is a SAVE-time artifact, not a load-time
// one — so it's absent from the templates (loading one changes nothing) and present only on files
// a human or tool actually saved. A reader treats its absence as "pre-engineVersion" (≤ v0.24).
function stampCampaignForSave(campaign, opts){
  opts = opts || {};
  const c = _deepCloneCampaignForSave(campaign);
  // T6 single-home — the nested mirrors (geography.hexes / hex.settlement / garrison / mercenaryCompany)
  // are gone from the data model; strip them from the save-clone so the on-disk file carries only the
  // canonical top-level collections (campaign.hexes / .settlements / .units). Old files that still carry
  // nested data load via the lift-then-strip path. Runs on the clone; pure wrt input.
  stripNestedMirrors(c);
  const today = opts.savedAt || new Date().toISOString().slice(0, 10);
  c.engineVersion = ENGINE_VERSION;
  c.savedAt = today;
  c.lastModifiedAt = today;
  if(Array.isArray(c.domains)){ for(const d of c.domains){ if(d) d.lastModifiedAt = today; } }
  delete c.domainIds; // legacy field (index.html serializedCampaign drops it too)
  return c;
}
function _deepCloneCampaignForSave(c){
  try { if(typeof structuredClone === 'function') return structuredClone(c); } catch(e){}
  return JSON.parse(JSON.stringify(c));
}


// =============================================================================
// T6 — single-home: STRIP the nested mirrors (2026-06-21). The reader sweep made every
// reader read the canonical top-level collection (campaign.hexes / .settlements / .units),
// so the nested mirrors (domain.geography.hexes / hex.settlement / domain.garrison.units /
// character.mercenaryCompany.units) are now pure redundancy. This deletes them in place so
// the single home is the ONLY home — in memory after load (called from migrateCampaign for
// units + index.html _finishLoad for hexes/settlements, each AFTER its forward-lift has
// promoted any old-save nested data to top-level) and on disk (called at save time in
// stampCampaignForSave + index.html serializedCampaign, replacing projectNestedMirrors).
//
// Deletes only the mirror arrays + their now-vestigial wrappers: domain.geography.hexes (the
// geography object itself survives — it carries controlledHexes / controlledHexList);
// domain.garrison (held only units + the dead totalMonthlyCost/totalBR caches); hex.settlement;
// character.mercenaryCompany (held only units). Idempotent — a no-op once stripped. Pure wrt
// every non-mirror field. Membership is unaffected: a hex's domain is hex.domainId, a unit's
// owner is unit.stationedAt, a settlement's hex is settlement.hexId — all on the canonical entity.
// Units half — strip domain.garrison + character.mercenaryCompany. Safe to run inside migrateCampaign
// (order 155, right after the @150 garrison-units-to-units lift), because that lift has already
// promoted any old-save nested units to campaign.units before this deletes the mirror.
function stripUnitMirrors(campaign){
  if(!campaign || typeof campaign !== 'object') return campaign;
  if(Array.isArray(campaign.domains)){
    for(const d of campaign.domains){ if(d && 'garrison' in d) delete d.garrison; }
  }
  if(Array.isArray(campaign.characters)){
    for(const c of campaign.characters){ if(c && 'mercenaryCompany' in c) delete c.mercenaryCompany; }
  }
  return campaign;
}
// Hexes + settlements half — strip domain.geography.hexes + hex.settlement. Must run AFTER
// liftToTopLevelCollections (index.html _finishLoad), NOT inside migrateCampaign: the hex lift runs in
// _finishLoad, so the nested hexes of a nested-only template aren't on campaign.hexes yet at migrate
// time — deleting them here would lose them. The geography object itself survives (controlledHexes etc.).
function stripHexSettlementMirrors(campaign){
  if(!campaign || typeof campaign !== 'object') return campaign;
  if(Array.isArray(campaign.domains)){
    for(const d of campaign.domains){ if(d && d.geography && 'hexes' in d.geography) delete d.geography.hexes; }
  }
  if(Array.isArray(campaign.hexes)){
    for(const h of campaign.hexes){ if(h && 'settlement' in h) delete h.settlement; }
  }
  return campaign;
}
// The full strip (all four mirrors) — used at SAVE time (stampCampaignForSave + index.html
// serializedCampaign), where every collection is already lifted, so it's safe to drop everything.
function stripNestedMirrors(campaign){
  stripUnitMirrors(campaign);
  stripHexSettlementMirrors(campaign);
  return campaign;
}

// 2026-05-30 — Lazy backfill of additive optional fields reserved during the
// post-RAW-survey scope pass. None of these are functional yet (their consumer
// subsystems ship in v1.0); they exist so the schema is stable and integrators
// can preserve them on round-trip. See Data_Dictionary.md §13.2 + §13.3.
function lazyDefaultV1ScopeReservations(campaign){
  if(!campaign || typeof campaign !== 'object') return campaign;
  // Campaign-level day-tick clock (Phase 2.95 Calendar #478)
  if(typeof campaign.currentDayInMonth !== 'number') campaign.currentDayInMonth = 1;
  // Reserved top-level collections — backfilled from the §15.5 collection registry (the
  // lazyDefault:true set). This loop reproduces the old explicit `if(!Array.isArray) = []`
  // block exactly (the 19 lazy-injected collections: the §3.5 Waves E/F/D reservations,
  // Construction, Favors & Duties, Lairs, the Encounter/Military entities, the Arcane Domain).
  // A NEW collection defaults to DEFENSIVE-READ (lazyDefault:false → NOT backfilled here): its
  // module reads `campaign.foo ?? []` + seeds on first write, so the 6 templates + demo stay
  // TRUE migrate-no-ops with no regen (the team-session enabler — the banking/sages/burst5+9
  // convention). To opt a collection into eager backfill, register it with { lazyDefault:true }.
  for(const name of lazyDefaultCollections()){
    if(!Array.isArray(campaign[name])) campaign[name] = [];
  }
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
// a ranks check is a future refinement (the PT-0 model now tracks ranks via ACKS.proficiencyRanks).
function constructionSupervisorCapForCharacter(character){
  if(!character) return 0;
  const manual = character.constructionSupervisorCap || 0;
  // PT-0: read the canonical {key} (or a legacy string / {name}); de-hyphenate so the slug key
  // 'siege-engineering' still matches the 'siege engineering' substring needle below.
  const profs = (character.proficiencies || []).map(p =>
    (typeof p === 'string' ? p : (p && (p.key || p.name || p.label)) || '').toLowerCase().replace(/-/g, ' '));
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

// =============================================================================
// Phase 4 Construction Wave C — lift stronghold components onto first-class Constructibles
// =============================================================================
// Foundation #16 stores a domain's stronghold as domain.stronghold.components[] ({type, name,
// buildValue, structures[]}) — or, for un-converted saves, the legacy single-stronghold shape
// ({type, buildValue, structures} on the stronghold itself; the UI's migrateStrongholdToComponents
// converts it on load). The economy's strongholdValue (acks-engine-economy.js) reads either shape.
//
// This migration lifts each content-bearing stronghold onto a first-class Constructible
// (campaign.constructibles[], constructibleKind:'stronghold-component') as an ADDITIVE MIRROR:
//   • the economy is UNTOUCHED — strongholdValue still sums the components/legacy value (zero drift
//     by construction; this only ADDS a constructibleId pointer to the source, which the economy and
//     the W4 pillage path — which writes s.buildValue directly, acks-engine-maneuvers.js — both ignore);
//   • the Constructible is the first-class, Inspector-visible, Wizard-extensible record (Wave C+ build
//     onto it);
//   • linked forward (source.constructibleId → the dedup key) + back (constructible.functionData
//     .legacyComponentId, best-effort); migrateStrongholdToComponents carries the forward link onto the
//     new component when the UI converts legacy→components, so a load→convert→save→reload never duplicates;
//   • the mirror is reconciled to its source on every load (resync buildValue/name/subtype), so a GM edit
//     or a pillage that mutates the source value doesn't leave the mirror stale;
//   • idempotent (an existing live mirror is reconciled, not duplicated) — the shipped templates stay
//     migrate-no-ops (migrations.smoke §P3.6) once regenerated through migrateCampaign.
// It does NOT restructure the stronghold (no migrateStrongholdToComponents call here) — that would delete
// s.buildValue, which W4 pillage reads/writes directly. The canonical-setter wiring (the Construction
// Wizard's "+ build a component" writing the component AND its mirror through one setter) lands with
// Wave C's Wizard. See Phase_4_Construction_Plan.md Wave C.

// The stronghold's seat hex — robust at migrateCampaign time (campaign.hexes may not be lifted yet), so
// read the domain's own nested geography.hexes first, falling back to the lifted top-level copy.
// Deterministic + lift-state-independent → no drift between the regen write and a later reload.
function _strongholdSeatHexId(campaign, dom){
  const byId = Object.create(null);
  if(dom.geography && Array.isArray(dom.geography.hexes)){
    for(const h of dom.geography.hexes){ if(h && h.id && !byId[h.id]) byId[h.id] = h; }
  }
  if(Array.isArray(campaign.hexes)){
    for(const h of campaign.hexes){ if(h && h.id && h.domainId === dom.id && !byId[h.id]) byId[h.id] = h; }
  }
  const hexes = Object.keys(byId).map(k => byId[k]);
  if(!hexes.length) return null;
  const ruler = dom.rulerCharacterId ? (campaign.characters || []).find(c => c && c.id === dom.rulerCharacterId) : null;
  if(ruler && ruler.currentHexId && hexes.some(h => h.id === ruler.currentHexId)) return ruler.currentHexId;
  let best = null, bestPop = -1;
  for(const h of hexes){
    // Migrate-time may run pre-lift: read the embedded settlement (nested-only file) then the
    // canonical campaign.settlements (regenerated/single-home file). T6 back-compat.
    const s = h.settlement || (Array.isArray(campaign.settlements) ? campaign.settlements.find(x => x && x.hexId === h.id) : null);
    const pop = s ? (s.families || s.population || 0) : 0;
    if(pop > bestPop){ bestPop = pop; best = h; }
  }
  return (best || hexes[0]).id;
}

function migrateStrongholdComponentsToConstructibles(campaign){
  if(!campaign || typeof campaign !== 'object') return campaign;
  if(!Array.isArray(campaign.constructibles)) campaign.constructibles = [];
  if(!Array.isArray(campaign.domains)) return campaign;
  const A = global.ACKS || {};
  const blank = A.blankConstructible;
  if(typeof blank !== 'function') return campaign;   // entities.js not loaded yet (never at runtime)
  const byId = Object.create(null);
  for(const c of campaign.constructibles){ if(c && c.id) byId[c.id] = c; }
  for(const dom of campaign.domains){
    if(!dom || !dom.stronghold) continue;
    const s = dom.stronghold;
    // Mirror BOTH shapes WITHOUT restructuring the stronghold: the Foundation-#16 components[] shape,
    // and the legacy single-stronghold shape (the stronghold object itself is the one "component").
    const refs = Array.isArray(s.components) ? s.components : [s];
    let seatHexId = null, seatResolved = false;
    for(const ref of refs){
      if(!ref) continue;
      const hasContent = ref.type || ref.name || (ref.buildValue || 0) > 0 ||
        (Array.isArray(ref.structures) && ref.structures.length > 0);
      if(!hasContent) continue;   // skip empty placeholder components — don't mint a Constructible for nothing
      if(!seatResolved){ seatHexId = _strongholdSeatHexId(campaign, dom); seatResolved = true; }
      const name = ref.name || ref.type || 'Stronghold component';
      const subtype = ref.type ? slugify(ref.type) : null;
      let cst = ref.constructibleId ? byId[ref.constructibleId] : null;
      if(cst){
        // Reconcile the mirror to its source (principle #10; resync-only, no history append). A no-op on
        // already-synced data (the regenerated templates), so the migrate-no-op invariant holds; keeps the
        // mirror correct after the source value changes (a GM edit, or a W4 pillage of s.buildValue).
        cst.functionData = cst.functionData || {};
        cst.buildValue = ref.buildValue || 0;
        cst.name = name;
        if(subtype) cst.constructibleSubtype = subtype;
        cst.ownerDomainId = dom.id;
        if(seatHexId && !cst.hexId) cst.hexId = seatHexId;
        if(ref.id && !cst.functionData.legacyComponentId) cst.functionData.legacyComponentId = ref.id;
        continue;
      }
      cst = blank({
        constructibleKind: 'stronghold-component',
        constructibleSubtype: subtype,
        constructionState: 'complete',
        damageState: 'intact',
        ownership: 'domain',
        siteType: 'stronghold-courtyard',
        operationalState: 'operational',
        name: name,
        hexId: seatHexId,
        ownerDomainId: dom.id,
        buildValue: ref.buildValue || 0
      });
      cst.functionData = cst.functionData || {};
      if(ref.id) cst.functionData.legacyComponentId = ref.id;
      cst.history.push({
        turn: (typeof campaign.currentTurn === 'number' ? campaign.currentTurn : null),
        type: 'migrated',
        narrative: 'Lifted onto the unified Constructible model from the stronghold component "' +
          name + '" (' + (ref.buildValue || 0).toLocaleString() + 'gp).'
      });
      ref.constructibleId = cst.id;
      campaign.constructibles.push(cst);
      byId[cst.id] = cst;
    }
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
  if(!campaign) return null;
  if(Array.isArray(campaign.settlements)){
    const s = campaign.settlements.find(s => s.hexId === hexId);
    if(s) return s;
  }
  // T6 single-home — back-compat bridge: an un-lifted input (an old save mid-migration, a test
  // fixture that embeds a settlement on the hex but hasn't run the lift) may carry the settlement
  // ONLY as hex.settlement. This is the SINGLE place that reads the embedded mirror; it's dead in
  // production (the load strips hex.settlement after liftToTopLevelCollections promotes it here).
  const h = findHex(campaign, hexId);
  return (h && h.settlement) || null;
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
// Resolve a hex by id from the canonical campaign.hexes (single-home, T6). Pure read.
function resolveHexAnywhere(campaign, hexId){
  return findHex(campaign, hexId);
}
// Axial hex distance between two {q, r} coords (cube-coordinate metric). Pure.
function hexAxialDistance(a, b){
  if(!a || !b) return 0;
  const aq = a.q || 0, ar = a.r || 0, bq = b.q || 0, br = b.r || 0;
  return (Math.abs(aq - bq) + Math.abs(ar - br) + Math.abs(aq + ar - bq - br)) / 2;
}
// The authored hex at axial coord (q,r), or null. Accepts (campaign, q, r) or (campaign, {q,r}).
// Reads the canonical campaign.hexes (single-home, T6). Used by hex-by-hex journey resolution to look
// up the hexes a route passes through (a route step over an UNauthored coord returns null, and the
// caller falls back to the journey's base environment — so per-hex/per-side travel effects apply only
// where cartography exists).
function hexAtCoord(campaign, q, r){
  if(!campaign) return null;
  if(q && typeof q === 'object'){ r = q.r; q = q.q; }
  if(typeof q !== 'number' || typeof r !== 'number') return null;
  if(Array.isArray(campaign.hexes)){
    for(const h of campaign.hexes){ if(h && h.coord && h.coord.q === q && h.coord.r === r) return h; }
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
// The Stash / wealth / inventory layer (Phase 2.95 Stash A/B + Items I1 + coins +
// notable items + provisioning) was moved to acks-engine-stash.js (T5 monolith
// decomposition, 2026-06-23). That module loads after this file and self-registers
// its six stash/coins load-migration passes (orders 70/90/100/110/120/190).
// _applyDomainTreasuryDelta (the canonical treasury setter) moved with it and is
// exported there; the callers below use ACKS._applyDomainTreasuryDelta.
// =============================================================================

// =============================================================================
// The Group model + Units & Armies (Military W1) + levies/militia (W7) + the
// Vagaries-of-Incursion derived reads (W2) were moved to acks-engine-military.js
// (T5 monolith decomposition, 2026-06-23). That module loads after this file and
// self-registers its garrison-units-to-units load-migration (order 150). The six
// privates it exports (_resolveDomain / _levyMusterNoun / _completeTraining /
// _musterDestinationHexId / _favorDutyMaterializeTroops / _favorDutyDematerializeTroops)
// are reached here via ACKS.*.
// =============================================================================

// =============================================================================
// Lairs (Monster Persistence #476) + the wilderness encounter-generation engine
// were moved to acks-engine-lairs.js (T5 monolith decomposition, 2026-06-23).
// That module loads after this file and self-registers its "legacy-hex-lairs"
// load-migration (order 140). _rollDiceStr moved with it (exported there; the one
// Military caller below uses ACKS._rollDiceStr).
// =============================================================================

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
  // === Military W7 (burst4) — disband any troops a Call-to-Arms / Troops obligation materialized.
  if(record.kind === 'call-to-arms' || record.kind === 'troops'){
    try { ACKS._favorDutyDematerializeTroops(campaign, record); } catch(e){ /* best-effort */ }
  }
  // === Politics P-2 (burst5) — vacate the senate seat an Office favor materialized on a senatorial
  //     realm (Phase_4_Politics_Plan.md §10). The single revoke chokepoint catches every path
  //     (manual revoke, the 1d20 table-revocation, …); a no-op when not senatorial / never seated.
  if(record.kind === 'office' && global.ACKS && typeof global.ACKS.syncOfficeSenateSeat === 'function'){
    try { global.ACKS.syncOfficeSenateSeat(campaign, record, 'revoke'); } catch(e){ /* best-effort */ }
  }
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
  let families = global.ACKS.totalFamilies(campaign, domain);
  for(const { domain:v } of global.ACKS.vassalChainUnder(campaign, domain.id)) families += global.ACKS.totalFamilies(campaign, v);
  return families;
}

// RR p.434 — the realm's standing-army capacity (the Vassal Troops by Realm Size table — the quick
// "what armies can a realm of this size field" reference). The realm = this domain + its sub-vassal
// chain (the same basis realmFamiliesForDomain sums). Returns the RAW tier caps (max standing army,
// realm-troops wage budget, the avg garrison baseline) + a light comparison to the realm's CURRENT
// fielded force (every Unit homed in a realm domain — garrisons + field armies). A standing army is
// funded by Scutage from vassals (1gp+/family — shipped F&D-6) + parceled across their domains via
// the Troops favor (shipped); vassal-reliant realms field conscripts, standing armies hire mercenaries
// (RR p.433). Pure derived read — no stored field, no new entity/rule/event. Null if no domain.
function realmStandingArmyCapacity(campaign, domainOrId){
  const A = global.ACKS;
  const d = ACKS._resolveDomain(campaign, domainOrId);
  if(!d) return null;
  const realmFamilies = realmFamiliesForDomain(campaign, d);
  const tier = A.vassalTroopsForRealmFamilies(realmFamilies);
  if(!tier) return null;
  // The realm's domain set: this domain + every sub-vassal domain (the realmFamiliesForDomain basis).
  const realmDomainIds = new Set([d.id]);
  for(const { domain:v } of A.vassalChainUnder(campaign, d.id)) if(v && v.id) realmDomainIds.add(v.id);
  // Current realm military force: every Unit OWNED by a realm domain (garrisoned or afield). Ownership
  // is resolved via the canonical unitOwnerDomainId accessor (explicit ownerDomainId, else the garrison
  // station), falling back to the raw field.
  let troops = 0, wages = 0;
  for(const u of (campaign.units || [])){
    if(!u) continue;
    const home = (A.unitOwnerDomainId ? A.unitOwnerDomainId(campaign, u) : null) || u.ownerDomainId || null;
    if(home && realmDomainIds.has(home)){
      troops += ACKS.unitActiveCount(u);
      wages  += ACKS.unitWageMonthly(campaign, u);
    }
  }
  const maxArmy  = (tier.maxStandingArmy && tier.maxStandingArmy.max) || 0;
  const maxWages = (tier.maxRealmTroopsWages && tier.maxRealmTroopsWages.max) || 0;
  return {
    tier: tier.key, title: tier.title, page: tier.page || 434,
    realmFamilies,
    avgPersonalGarrisonWages: tier.avgPersonalGarrisonWages || 0,
    maxStandingArmy: maxArmy,  maxStandingArmyText:  (tier.maxStandingArmy  || {}).text || '',
    maxRealmTroopsWages: maxWages, maxRealmTroopsWagesText: (tier.maxRealmTroopsWages || {}).text || '',
    currentRealmTroops: troops, currentRealmTroopWages: wages,
    fitsArmyCap:    maxArmy  ? troops <= maxArmy  : true,
    fitsWageBudget: maxWages ? wages  <= maxWages : true,
    timePeriod: tier.timePeriod || 'season'
  };
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

// Canonical setter (CLAUDE #10): `hex.domainId` is the truth — and, single-home (T6), the ONLY home.
// Setting hex.domainId IS the move; there's no nested geography.hexes mirror to follow it. This just
// ensures the hex is present in the canonical campaign.hexes. Kept (the gm-fiat hex-domainId edit calls
// it) but reduced to that one invariant. Idempotent.
function reconcileHexDomainMembership(campaign, hex){
  if(!campaign || !hex) return;
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
    // Single-home (T6): the nested d.geography.hexes mirror is stripped right after this lift
    // (stripHexSettlementMirrors, index.html _finishLoad), so there is NO reference re-unification.
    // But preserve the load-bearing BACKFILL onto the canonical (top-level) survivor: when
    // campaign.hexes already held this hex as a SEPARATE object (a save round-trip / shared file whose
    // top-level hexes lack domainId, or a pre-hexId settlement), the forward-lift above backfilled the
    // discarded nested copy, not the survivor — so adopt the domain claim (membership IS the claim,
    // CLAUDE #10) onto the top-level hex, and the hex link onto the top-level settlement.
    if(Array.isArray(d.geography.hexes)){
      for(const h of d.geography.hexes){
        if(!h || !h.id) continue;
        const topRef = campaign.hexes.find(x => x.id === h.id);
        if(!topRef) continue;
        if(!topRef.domainId) topRef.domainId = d.id;
        const embedded = h.settlement;
        if(embedded && embedded.id){
          const topSet = campaign.settlements.find(s => s.id === embedded.id);
          if(topSet && !topSet.hexId) topSet.hexId = h.id;
        }
      }
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
        // Route through the canonical treasury setter (NOT a raw scalar write): it
        // deposits to the domain's treasury stash and keeps domain.treasury.gp in
        // lockstep, so the load-time reconcileTreasuryScalars pass no longer clobbers
        // the payout. A scalar-only write left the stash sum un-incremented, so on the
        // next load reconcile rewrote the scalar back down — the payout silently
        // vanished on reload (Stash C.2 / GP Wave B canonical-setter doctrine).
        ACKS._applyDomainTreasuryDelta(campaign, destDomain, gp, { reason:'passive-investment', label:(inv.name || inv.ownerName || 'passive investment') });
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
      return base + ' The +1 to the holder’s vassals’ loyalty rolls applies automatically (RR p.348). On a senatorial realm the holder is automatically seated as a leading senator (RR p.355 — set the seat’s influence on the senatorship); on a non-senatorial realm the seat is a no-op.';
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
  if(fromDomain) ACKS._applyDomainTreasuryDelta(campaign, fromDomain, -amt, { reason: reason, label: 'favor-duty: ' + reason });
  if(toDomain)   ACKS._applyDomainTreasuryDelta(campaign, toDomain,   +amt, { reason: reason, label: 'favor-duty: ' + reason });
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
  // === @b10-religion (team) — Religion R3 consecrate-ruler (RR p.422): a vassal of a consecrated ruler
  // gets +1 to their loyalty rolls (−1 if the rite went awry). The POSITIVE bonus is non-stacking with the
  // Office favor's +1 (OQ5 — take the max); an awry −1 is a curse that still applies. Late-bound (religion.js
  // loads after this module); absent / no live buff ⇒ 0 ⇒ effMod identical to the shipped behavior.
  const consecrationBonus = (global.ACKS && typeof global.ACKS.domainConsecrationVassalLoyaltyBonus === 'function')
    ? (global.ACKS.domainConsecrationVassalLoyaltyBonus(campaign, vassalRulerCharacterId) || 0) : 0;
  const religiousBonus = consecrationBonus < 0 ? (officeBonus + consecrationBonus) : Math.max(officeBonus, consecrationBonus);
  // === end @b10-religion ===
  const effMod = (Number(modifier) || 0) + religiousBonus;
  const d1 = 1 + Math.floor(rng() * 6), d2 = 1 + Math.floor(rng() * 6);
  const rr = global.ACKS.rollLoyalty(loyaltyScore, effMod, { d1, d2 });
  if(ch){
    const before = Number(ch.loyalty || 0);
    const after = Math.max(-4, Math.min(4, before + Number(rr.loyaltyDelta || 0)));
    ch.loyalty = after;
    if(!Array.isArray(ch.loyaltyHistory)) ch.loyaltyHistory = [];
    ch.loyaltyHistory.push({
      turn: campaign.currentTurn || 1, delta: after - before, reason: opts.reason || 'favor-duty-excess',
      reasonNote: (opts.reasonNote || 'over-demanded duties (RR p.347)') + (officeBonus ? ' [+1 office, RR p.348]' : '')
        + (consecrationBonus ? (' [' + (consecrationBonus > 0 ? '+1 consecrated ruler' : '−1 consecration awry') + ', RR p.422]') : ''),
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
  // RR p.354 — a clanhold vassal can only be offered/demanded the clanhold-restricted F&D set (a
  // 'custom' edict is the Judge's freeform device, RR p.345, always allowed). Refuse an excluded kind —
  // the real limitation, enforced for BOTH the manual composer AND the monthly auto-roll (both paths
  // funnel here). The caller (Phase A / applyFavorDutyEdictByKind) handles the null.
  if(entry && entry.kind && entry.kind !== 'custom' && global.ACKS && typeof global.ACKS.favorDutyKindAllowedForDomain === 'function'
     && !global.ACKS.favorDutyKindAllowedForDomain(vassalDomain, entry.kind)) return null;

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

  // === Military W7 (burst4) — materialize the Call-to-Arms duty / Troops favor into real Units
  //     (the shipped F&D left these as GM-resolve notes). No-op for every other kind.
  if(entry.kind === 'call-to-arms' || entry.kind === 'troops'){
    try { ACKS._favorDutyMaterializeTroops(campaign, obligation, { liegeId, vassalDomain, liegeDomain, race: 'man' }); }
    catch(e){ /* materialization is best-effort — never block the edict on a troop-muster hiccup */ }
  }
  // === Politics P-2 (burst5) — the F&D Office→senate-seat hook (the deferred F&D-8 dependency,
  //     Phase_4_Politics_Plan.md §10; RR p.348 + p.355). Granting an Office favor on a realm whose
  //     apex governance is senatorial auto-seats the officeholder as a leading senator. A no-op when
  //     the realm isn't senatorial (the Office favor behaves as shipped — title + the +1 vassal-loyalty).
  if(entry.kind === 'office' && global.ACKS && typeof global.ACKS.syncOfficeSenateSeat === 'function'){
    try { global.ACKS.syncOfficeSenateSeat(campaign, obligation, 'grant'); }
    catch(e){ /* best-effort — never block the edict on a seating hiccup */ }
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
    if(!r){   // RR p.354 — the rolled kind isn't available to a clanhold vassal; record it + skip (no edict this month)
      result.logEntries.push('Favor/Duty — ' + (vassalDomain.name || vassalDomainId) + ': rolled ' + entry.kind + ', not available to a clanhold vassal (RR p.354) — skipped.');
      continue;
    }
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
        ACKS._applyDomainTreasuryDelta(campaign, liegeDomain, +amt, { reason:'scutage', label:'favor-duty: scutage (collected)' });
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
    const troopSpend = global.ACKS.garrisonCost(campaign, acc.liegeDomain);
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
        populationBefore: global.ACKS.totalFamilies(campaign, d),
        treasuryBefore: d.treasury.gp || 0,
        income: global.ACKS.incomeBreakdown(campaign, d).map(r => ({...r})),
        expenses: global.ACKS.expenseBreakdown(campaign, d).map(r => ({...r})),
        incomeFactor: global.ACKS.incomeFactor(d.demographics.morale),
        moraleMods: global.ACKS.moraleModifiersFor(campaign, d).map(m => ({...m})),
        moraleRoll: rollD6(rng) + rollD6(rng),
        event: global.ACKS.sampleEvent(d.demographics.morale),
        hasPlayerInput: !!d.pendingPlayerInput,
        urbanInvestments: global.ACKS.hexSettlements(campaign, d).map(({hexIndex, hex, settlement}) => ({
          hexIndex,
          hexId: hex.id,
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
        agriculturalOrders: hexesForDomain(campaign, d.id).map((h, hexIndex) => {
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

  // CoL-2 — preview the end-of-month living-expenses + henchman-wage debits (read-only; dryRun). A
  // direct in-file call (not late-bound), so it stays inline; the late-bound previews come from the
  // monthly-consumer registry below (audit E2).
  const livingExpenseProposal = processLivingExpensesForTurn(campaign, { dryRun: true });

  // Late-bound monthly-consumer PREVIEWS (the dryRun half of the propose-ratify gate) — driven by the
  // SAME registry commitTurn runs, so the propose + commit lists can't drift (audit E2). aging /
  // banking / syndicate-tribute each registered a .preview; the rest have none (no meaningful dryRun).
  const _previews = {};
  for(const mc of monthlyConsumersInOrder()){
    if(typeof mc.preview !== 'function') continue;
    try { _previews[mc.name] = mc.preview(campaign, { rng }); }
    catch(e){ /* never let a monthly-consumer preview fail the turn proposal */ }
  }

  return {
    error: null,
    turnEventProposals,
    turnVentureProposals,
    turnProposal,
    livingExpenseProposal,
    agingProposal: _previews['aging'] || { ran: false },
    bankingProposal: _previews['banking'] || { ran: false },
    syndicateTributeProposal: _previews['syndicate-tribute'] || { ran: false }
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

  // === EVENT APPLY PASS ===  (F1 + F2 — pre-validate, then one batch snapshot for the apply)
  // Per Decision 2 (locked): timed events sort by gameTimeAt; untimed by submittedAt. Domains live on
  // the campaign (single home), so applyEvent handlers traverse campaign.domains directly.
  //
  // F2 (audit 2026-06-24): the GM's accepted-event batch is the transactional unit.
  //  1. PRE-VALIDATE every accepted event. One that fails its own schema mutates nothing, so it is
  //     rejected WITHOUT an apply attempt — exactly as the pre-F2 per-event flow did (validateEvent
  //     threw before any snapshot). This keeps the common "malformed integrator event" case off the
  //     rollback path entirely, so a caller holding a campaign.domains[i] reference across the commit
  //     stays valid (the rollback only ever clones+swaps on a genuine handler throw).
  //  2. Apply the VALID events on a FAST path with per-event rollback suppressed ({transactional:false})
  //     — the whole batch costs ONE clone (cheap; F1 excludes the unbounded eventLog), not one-per-event.
  //  3. Only if a VALID event's handler throws mid-run (rare) do we roll the whole batch back and RE-RUN
  //     it resiliently (per-event rollback, reject-and-continue) — preserving exactly the pre-F2 outcome.
  {
    const acceptedProposals = turnEventProposals.filter(ep => ep.decision === 'accept');
    const rejectedProposals = turnEventProposals.filter(ep => ep.decision === 'reject');

    const _applyOne = (ev, transactional) => {
      const ep = turnEventProposals.find(x => x.eventId === ev.id);
      if(ep && ep.gmNotes != null) ev.gmNotes = ep.gmNotes;
      const applyResult = global.ACKS.applyEvent(campaign, ev, transactional ? undefined : { transactional: false });
      ev.status = global.ACKS.EVENT_STATUS.APPLIED;
      ev.appliedAtTurn = currentTurnNum;
      campaign.eventLog.push({ event: ev, result: applyResult.result, appliedAtTurn: currentTurnNum, appliedAt: new Date().toISOString() });
      logEntries.push('[event applied] ' + ev.kind + ' by ' + ev.submittedBy + ': ' + (applyResult.result?.narrativeSummary || ''));
    };
    const _rejectErr = (ev, errMessage) => {
      ev.status = global.ACKS.EVENT_STATUS.REJECTED;
      ev.appliedAtTurn = currentTurnNum;
      ev.gmNotes = (ev.gmNotes || '') + (ev.gmNotes ? ' · ' : '') + 'engine error: ' + errMessage;
      campaign.eventLog.push({ event: ev, result: { domainsChanged: [], charactersChanged: [], hexesChanged: [], treasuryDelta: 0, narrativeSummary: 'Engine error: ' + errMessage }, appliedAtTurn: currentTurnNum, appliedAt: new Date().toISOString() });
    };

    // (1) pre-validate — split valid from malformed without applying anything.
    const validIds = [], invalidIds = [];
    acceptedProposals.forEach(ep => {
      try { global.ACKS.validateEvent(ep.event); validIds.push(ep.eventId); }
      catch(e){ invalidIds.push([ep.eventId, e.message]); }
    });
    const _liveById = () => new Map((campaign.pendingEvents || []).map(e => [e.id, e]));
    const _liveValid = () => { const byId = _liveById(); return global.ACKS.sortEventsForApply(validIds.map(id => byId.get(id)).filter(Boolean)); };

    // (2) FAST path — one batch snapshot, no per-event clone.
    if(validIds.length){
      const _batchSnap = global.ACKS.cloneCampaignForRollback(campaign);
      const _logMark = logEntries.length;
      let _fastFailed = false;
      try { _liveValid().forEach(ev => _applyOne(ev, false)); }
      catch(e){ _fastFailed = true; }
      // (3) handler threw — roll the whole batch back, then re-run resiliently (per-event rollback).
      if(_fastFailed){
        global.ACKS.restoreCampaignForRollback(campaign, _batchSnap);
        logEntries.length = _logMark;
        _liveValid().forEach(ev => { try { _applyOne(ev, true); } catch(err){ _rejectErr(ev, err.message); } });
      }
    }

    // Reject the pre-validation failures — AFTER the apply, so a slow-path restore can't truncate them.
    { const byId = _liveById(); invalidIds.forEach(([id, msg]) => { const ev = byId.get(id); if(ev) _rejectErr(ev, msg); }); }

    // GM-rejected events (decision === 'reject') — by id off the live pendingEvents.
    { const byId = _liveById(); rejectedProposals.forEach(ep => {
      const ev = byId.get(ep.eventId) || ep.event;
      if(ep.gmNotes != null) ev.gmNotes = ep.gmNotes;
      ev.status = global.ACKS.EVENT_STATUS.REJECTED;
      ev.appliedAtTurn = currentTurnNum;
      campaign.eventLog.push({ event: ev, result: { domainsChanged: [], charactersChanged: [], hexesChanged: [], treasuryDelta: 0, narrativeSummary: 'Rejected by GM' + (ep.gmNotes ? ': ' + ep.gmNotes : '') }, appliedAtTurn: currentTurnNum, appliedAt: new Date().toISOString() });
    }); }

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
    const raidGrowth = clanholdRaidGrowth(campaign, d, familiesK, moraleAfter, rng);   // RR p.353 — clanhold raid bonus (0 otherwise)
    const popDelta = naturalIncrease - naturalDecrease + moraleExtra + raidGrowth;
    const populationAfter = Math.max(0, global.ACKS.totalFamilies(campaign, d) + popDelta);

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
    ACKS._applyDomainTreasuryDelta(campaign, d, _ownerNet, { reason:'monthly-net-income', label:'monthly net income' });
    if(_ownerNet) _turnWealthChildren.push({ amount: _ownerNet, bucket:'monthly-net-income', reason:'monthly net income' });
    d.demographics.morale = moraleAfter;
    // I2 (audit 2026-06-24, Lane I) — RR p.349 unpaid-garrison consequence. AFTER the month's net hits
    // the treasury, a domain with peasants that ends insolvent (treasury < 0) could not pay its garrison;
    // bump the one-shot counter moraleModifiersFor reads NEXT month (−1/consecutive insolvent month, cap
    // −4). Solvency resets it. Lazy field (|| 0 default), no migration. The trigger is treasury sign, not
    // monthly net — a rich domain absorbing a small deficit from reserves stays solvent and takes no hit.
    if((d.demographics.peasantFamilies || 0) > 0 && ((d.treasury && d.treasury.gp) || 0) < 0){
      d.unpaidGarrisonMonths = Math.min(4, (d.unpaidGarrisonMonths || 0) + 1);
    } else if(d.unpaidGarrisonMonths){
      d.unpaidGarrisonMonths = 0;
    }
    // Foundation #241 — go through the canonical setter so `hex.families` stays in sync.
    setPeasantPopulation(campaign, d, (d.demographics.peasantFamilies || 0) + popDelta);
    d.administersThisMonth = false;
    d.chiefRaidedThisMonth = false;   // RR p.353 — the raid bonus is per-month; the GM re-affirms the chief raided each month

    // Urban settlement growth (RR p.351).
    const urbanInvestmentResults = [];
    const urbanGrowthResults = [];
    let totalInvestmentSpent = 0, totalUrbanFamiliesGained = 0;
    hexesForDomain(campaign, d.id).forEach((hex, hexIdx) => {
      const s = settlementForHex(campaign, hex.id);
      if(!s) return;
      const before = s.families || 0;
      const settK = Math.max(1, Math.ceil(before / 1000));
      const natInc = rollNaturalIncrease(settK, moraleAfter, rng);
      const natDec = rollNaturalDecrease(settK, rng);
      const moraleExtraUrban = rollMoraleExtra(moraleAfter, settK, rng);
      // Single-home (T6): match the order by hexId (order-independent); fall back to the legacy
      // positional hexIndex for older proposals that predate the hexId stamp.
      const invLine = (p.urbanInvestments || []).find(inv => inv.hexId ? inv.hexId === hex.id : inv.hexIndex === hexIdx);
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
    ACKS._applyDomainTreasuryDelta(campaign, d, -totalInvestmentSpent, { reason:'urban-investment', label:'urban settlement investment' });
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
      // Single-home (T6): resolve the order's hex by hexId (order-independent); fall back to the
      // legacy positional hexIndex for older proposals that predate the hexId stamp.
      const dHexes = hexesForDomain(campaign, d.id);
      const hex = (ord.hexId && dHexes.find(h => h.id === ord.hexId)) || dHexes[ord.hexIndex];
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
      ACKS._applyDomainTreasuryDelta(campaign, d, -affordable, { reason:'agricultural-improvement', label:'agricultural land improvement' });
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
    hexesForDomain(campaign, d.id).forEach(hex => { if(hex.queuedImprovementGp) hex.queuedImprovementGp = 0; });

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
    hexesForDomain(campaign, d.id).forEach((hex, hxi) => {
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
      urbanFamilies: global.ACKS.effectiveUrbanFamilies(campaign, d),
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

    // Award XP to ruler from domain income (RR p.342 / p.423). Domain income is the EXPLICIT
    // exception to the henchman ½-share: a henchman vassal subtracts their wage (inside
    // domainXpFromNet → domainRulerXpAward) but does NOT reduce domain XP by 50% — RR p.342:
    // "they do not reduce earned XP from domains by 50%." So NO ×0.5 here, henchman or PC vassal
    // alike. (audit 2026-06-24 / acks-authority C1 — the old ×0.5 double-penalized henchman rulers.)
    // While occupied, the owner's XP basis is the net HE actually kept (_ownerNet — the occupier's
    // share earned the occupier gp, not the deposed lord XP).
    const _xpBasisNet = _ownerNet - totalInvestmentSpent - totalAgriculturalSpent;
    const _rulerXpEarned = global.ACKS.domainRulerXpAward(campaign, d, _xpBasisNet);
    let rulerXpAwarded = 0;
    if(_rulerXpEarned > 0){
      const rulerCh = global.ACKS.rulerCharacter(campaign, d);
      if(rulerCh){
        rulerXpAwarded = _rulerXpEarned;
        rulerCh.xp = (rulerCh.xp || 0) + rulerXpAwarded;
        addCharacterHistory(campaign, rulerCh, 'xp',
          '+' + rulerXpAwarded.toLocaleString() + ' XP from ruling ' + d.name + ' (domain net ' + _xpBasisNet.toLocaleString() + 'gp − threshold ' + computeGpThreshold(rulerCh.level || 1).toLocaleString() + 'gp)',
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

  // === MONTHLY-TURN CONSUMERS (audit E2, 2026-06-24) ===
  // The dozen late-bound monthly processors — banking · banditry (+ its one-shot W2/W4 morale-flag
  // clear) · recruitment & commerce vagaries · classification advancement · religion · aging ·
  // syndicate tribute · levy replenishment · construction vagaries · terrain transformation · the
  // arcane-power refresh · sanctum apprentices — now run from the registerMonthlyConsumer registry
  // (orders 10–130, the pre-refactor order — and thus the seeded RNG draw sequence — preserved
  // exactly). Each closure owns its existence-guard + default result; the loop owns the committed>0
  // gate, the per-consumer try (so one processor can never fail the core monthly commit), and the
  // logEntries fan-out. agingResult is the one result the return surfaces (CL-1 propose-ratify).
  const monthlyResults = {};
  for(const mc of monthlyConsumersInOrder()){
    if(mc.gateCommitted && !(committed > 0)) continue;
    let r = null;
    try { r = mc.run(campaign, { rng, committed }); }
    catch(e){ /* never let a monthly consumer fail the core monthly commit */ }
    if(r){
      monthlyResults[mc.name] = r;
      if(Array.isArray(r.logEntries)) r.logEntries.forEach(l => logEntries.push(l));
    }
  }
  const agingResult = monthlyResults['aging'] || { ran: false };

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
          global.ACKS.runDayTickToMonthEnd(campaign, rng);
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
    agingResult,                 // CL-1 (burst4) — the monthly aging pass result
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

// ── Monthly-turn consumer registry (audit E2, 2026-06-24) ──
// The registerDayConsumer pattern, generalized to the MONTHLY turn. Before this, commitTurn ran a
// dozen copy-pasted `if(typeof global.ACKS.processXForTurn==='function'){…}` existence-guards and
// proposeMonthlyTurn duplicated the dryRun half — adding a monthly consumer meant editing both lists
// in this central file. Now each entry is a registered consumer; commitTurn iterates `.run` and
// proposeMonthlyTurn iterates `.preview`, so the two lists can't drift and a future module can
// self-register its own pass from its own file (the §15.5 north star) instead of editing here.
//   run(campaign, ctx)     -> result (with optional .logEntries[]); ctx = { rng, committed }
//   preview(campaign, ctx) -> the dryRun proposal surfaced by proposeMonthlyTurn (optional)
//   order                  -> execution slot (lower first; preserves the pre-refactor order, hence
//                             the RNG draw sequence the seeded-determinism tests pin)
//   gateCommitted          -> default true: only run on a real month (committed > 0)
const MONTHLY_CONSUMERS = {};
function registerMonthlyConsumer(name, spec){
  if(!name || !spec || typeof spec.run !== 'function') return;
  MONTHLY_CONSUMERS[name] = {
    order: (typeof spec.order === 'number') ? spec.order : 50,
    run: spec.run,
    preview: (typeof spec.preview === 'function') ? spec.preview : null,
    gateCommitted: spec.gateCommitted !== false
  };
}
function unregisterMonthlyConsumer(name){ if(name) delete MONTHLY_CONSUMERS[name]; }
function monthlyConsumersInOrder(){
  return Object.keys(MONTHLY_CONSUMERS)
    .map(name => Object.assign({ name }, MONTHLY_CONSUMERS[name]))
    .sort((a, b) => (a.order - b.order) || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

// The core monthly consumers. Each closure resolves its late-bound processor via global.ACKS at RUN
// time (the modules load after this file), exactly as the inline existence-guards did — so registration
// at load is safe even though the processors don't exist yet. Orders 10–130 reproduce the pre-refactor
// execution order verbatim (and thus the seeded RNG sequence). All are gated on committed > 0.
registerMonthlyConsumer('banking', {                          // RR p.42 + p.313 — #148 B2 (interest accrual)
  order: 10,
  run: (campaign, ctx) => (typeof global.ACKS.processBankingForTurn === 'function')
    ? (global.ACKS.processBankingForTurn(campaign, { rng: ctx.rng }) || { ran: false }) : { ran: false },
  preview: (campaign) => (typeof global.ACKS.processBankingForTurn === 'function')
    ? (global.ACKS.processBankingForTurn(campaign, { dryRun: true }) || { ran: false }) : { ran: false }
});
registerMonthlyConsumer('banditry', {                         // RR pp.350–351 — #476 E10 (domain banditry)
  order: 20,
  run: (campaign, ctx) => (typeof global.ACKS.processBanditryForTurn === 'function')
    ? (global.ACKS.processBanditryForTurn(campaign, { rng: ctx.rng }) || { ruleOn: false }) : { ruleOn: false }
});
registerMonthlyConsumer('banditry-flags-clear', {             // W2/W4 one-shot flags consumed after the morale roll
  order: 25,
  run: (campaign) => {
    (campaign.domains || []).forEach(d => { if(d && d.incursionXenophobiaPending) d.incursionXenophobiaPending = false; });
    (campaign.domains || []).forEach(d => { if(d && d.postOccupationPenaltyMonths) d.postOccupationPenaltyMonths = 0; });
    return null;
  }
});
registerMonthlyConsumer('recruitment-vagaries', {             // W8 — JJ pp.110–112 (default-OFF rule, helper no-ops)
  order: 30,
  run: (campaign, ctx) => (typeof global.ACKS.processRecruitmentVagariesForTurn === 'function')
    ? (global.ACKS.processRecruitmentVagariesForTurn(campaign, { rng: ctx.rng }) || {}) : null
});
registerMonthlyConsumer('commerce-vagary-expiry', {           // W8 — JJ p.111 (timed commerce-vagary expiry; no rng)
  order: 40,
  run: (campaign) => (typeof global.ACKS.processCommerceVagaryExpiryForTurn === 'function')
    ? (global.ACKS.processCommerceVagaryExpiryForTurn(campaign) || {}) : null
});
registerMonthlyConsumer('classification-advancement', {       // DC-2 — RR p.340 (Outlands→Borderlands→Civilized)
  order: 50,
  run: (campaign, ctx) => (typeof global.ACKS.processClassificationAdvancement === 'function')
    ? (global.ACKS.processClassificationAdvancement(campaign, { rng: ctx.rng }) || {}) : null
});
registerMonthlyConsumer('religion', {                         // R1 — RR pp.421–425, #146 (divine power / congregations)
  order: 60,
  run: (campaign, ctx) => (typeof global.ACKS.processReligionForTurn === 'function')
    ? (global.ACKS.processReligionForTurn(campaign, { rng: ctx.rng }) || { ran: false }) : { ran: false }
});
registerMonthlyConsumer('aging', {                            // CL-1 — RR p.19, #7 (monthly aging; result surfaced)
  order: 70,
  run: (campaign, ctx) => (typeof global.ACKS.processAgingForTurn === 'function')
    ? (global.ACKS.processAgingForTurn(campaign, { rng: ctx.rng }) || { ran: false }) : { ran: false },
  preview: (campaign) => (typeof global.ACKS.processAgingForTurn === 'function')
    ? (global.ACKS.processAgingForTurn(campaign, { dryRun: true }) || { ran: false }) : { ran: false }
});
registerMonthlyConsumer('syndicate-tribute', {                // HJ-2 — RR p.362 (monthly syndicate tribute)
  order: 80,
  run: (campaign, ctx) => (typeof global.ACKS.processSyndicateTributeForTurn === 'function')
    ? (global.ACKS.processSyndicateTributeForTurn(campaign, { rng: ctx.rng }) || { ran: false }) : { ran: false },
  preview: (campaign) => (typeof global.ACKS.processSyndicateTributeForTurn === 'function')
    ? (global.ACKS.processSyndicateTributeForTurn(campaign, { dryRun: true }) || { ran: false }) : { ran: false }
});
registerMonthlyConsumer('levy-replenishment', {               // RR p.430 designer's note (in-file; always on; no rng)
  order: 90,
  run: (campaign) => {
    const healed = global.ACKS.processLevyReplenishmentForTurn(campaign);
    return (healed > 0) ? { logEntries: ['Conscript/militia replenishment: ' + healed + ' recovered (RR p.430)'] } : { ran: true };
  }
});
registerMonthlyConsumer('construction-vagaries', {            // Construction Wave I (default-OFF rules, helper no-ops)
  order: 100,
  run: (campaign, ctx) => (typeof global.ACKS.processConstructionVagariesForTurn === 'function')
    ? (global.ACKS.processConstructionVagariesForTurn(campaign, { rng: ctx.rng }) || {}) : null
});
registerMonthlyConsumer('terrain-transformation', {           // P5-TERR — JJ p.412 (default-OFF rule, helper no-ops)
  order: 110,
  run: (campaign, ctx) => (typeof global.ACKS.processTerrainTransformationForTurn === 'function')
    ? (global.ACKS.processTerrainTransformationForTurn(campaign, { rng: ctx.rng }) || {}) : null
});
registerMonthlyConsumer('arcane', {                           // AD-E — RR p.388 (arcane-power refresh; dormant w/o dungeons)
  order: 120,
  run: (campaign, ctx) => (typeof global.ACKS.processArcaneForTurn === 'function')
    ? (global.ACKS.processArcaneForTurn(campaign, { rng: ctx.rng }) || { ran: false }) : { ran: false }
});
registerMonthlyConsumer('sanctums', {                         // AD-B — RR p.386 (sanctum apprentices; dormant w/o sanctums)
  order: 130,
  run: (campaign, ctx) => (typeof global.ACKS.processSanctumsForTurn === 'function')
    ? (global.ACKS.processSanctumsForTurn(campaign, { rng: ctx.rng }) || { ran: false }) : { ran: false }
});
// NOTE: Magic-Research accrual is NOT a monthly consumer — it moved to the Day Clock (SR-1, RR p.388;
// the slot-56 'magic-research' day consumer + runDayTickToMonthEnd), so it must not run here too.

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
  // Delves D1 — a convalescing (incapacitated) character is day-aware activity in flight: the
  // slot-58 convalescence consumer (acks-engine-mortal-wounds.js, loads after this module —
  // call-time lookup) needs the Day Clock engaged to heal them (e.g. an officer wounded in a battle).
  const convFn = global.ACKS && typeof global.ACKS.anyConvalescing === 'function' ? global.ACKS.anyConvalescing : null;
  if(convFn && convFn(campaign)) return true;
  // A funded-but-not-yet-projected agricultural improvement also counts as in flight: the panel
  // writes hex.improvementBudgetGp directly, and the Project is materialized just before the tick.
  const budgeted = (arr) => Array.isArray(arr) && arr.some(h => h && (h.improvementBudgetGp || 0) > 0);
  if(budgeted(campaign.hexes)) return true;
  if(Array.isArray(campaign.domains) && campaign.domains.some(d => d && d.geography && budgeted(d.geography.hexes))) return true;
  // Delves D5 (team burst11) — an active holed-up SettlementVisit is day-aware activity in flight:
  // the slot-66 settlement-incidents consumer (acks-engine-delves.js) makes its 1/day urban-incident
  // check while the party recuperates/studies/trains in town (JJ p.80).
  if(Array.isArray(campaign.settlementVisits) && campaign.settlementVisits.some(v => v && v.status === 'active' && v.mode === 'holed-up')) return true;
  // Urban investment paid over time (RR p.353): a settlement with a committed investment budget is
  // day-aware activity in flight — its 500gp/day drip runs on the Day Clock (slot-51 consumer).
  if(Array.isArray(campaign.settlements) && campaign.settlements.some(s => s && (s.investmentBudgetGp || 0) > 0)) return true;
  // Magic Research (SR-1) — an in-progress research project is day-aware activity in flight: the slot-56
  // 'magic-research' consumer accrues its per-day rate on the Day Clock (RR p.388).
  if(Array.isArray(campaign.researchProjects) && campaign.researchProjects.some(p => p && p.status === 'in-progress')) return true;
  return false;
}

// What HOLDS the world clock (Review tab, 2026-06-13): sub-day-scale situations that need
// the GM resolved before another day passes — active Encounters (the RAW pre-combat walk)
// and Battles still in motion (setup / fighting / awaiting aftermath; ~10-minute battle
// turns). The advance buttons grey while any exist. Month-grained obligations (the
// pendingEvents queue — player plans, scheduled loyalty checks) deliberately do NOT hold
// the day clock: they ride until the month commit, where the turn resolution forces a
// decision per event (eventsTargetingTurn). Pure derived read.
function dailyAdvanceBlockers(campaign){
  if(!campaign) return [];
  const out = [];
  (ACKS.activeEncounters(campaign) || []).forEach(e => {
    out.push({ kind: 'encounter', id: e.id, label: ACKS.encounterDisplayName(campaign, e) });
  });
  // activeBattles lives in acks-engine-battles.js (loads after this module) — call-time lookup.
  const battlesFn = global.ACKS && typeof global.ACKS.activeBattles === 'function' ? global.ACKS.activeBattles : null;
  ((battlesFn ? battlesFn(campaign) : []) || []).forEach(b => {
    out.push({ kind: 'battle', id: b.id, label: (b.name || b.id) + (b.status === 'ended' ? ' — awaiting aftermath' : '') });
  });
  return out;
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
function runDayTickToMonthEnd(campaign, rng){
  const dim = (campaign && campaign.currentDayInMonth) || 1;
  const days = (30 - dim);
  if(days <= 0) return { committed: 0, eventsEmitted: 0 };
  // When the caller seeds the turn (commitTurn passes its rng), route the day-tick's
  // randomness through that seed too, so "advance month" is reproducible end-to-end.
  // The day consumers (incursions, band generation, vagaries, newId) call Math.random
  // directly — otherwise unseeded — so a seeded monthly commit was not actually
  // deterministic across its subsumed day-tick. Restored in finally; the interactive
  // day-advance path (no rng) is unaffected and stays on Math.random.
  const realRandom = Math.random;
  if(rng && rng !== realRandom){ Math.random = rng; }
  try {
    const proposal = proposeDayTick(campaign, days, { force: true });
    return commitDayTick(campaign, proposal, null);
  } finally {
    Math.random = realRandom;
  }
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

// ── Construction Wave G — builder class-restriction advisory (RR pp.386–388 + JJ p.121; 2026-06-21) ──
// The class-bound kinds (sanctum / dungeon / vault) carry a class-restriction. JJ p.121: anyone CAN build
// any structure, so this NEVER blocks — it's a soft heads-up the Wizard surfaces. A kind's class-bound
// downstream EFFECT only fires for the matching class:
//   • sanctum / dungeon — an ARCANE caster of L9+ (RR p.386): a mage's sanctum draws apprentices/companions
//     (attractToSanctum), a mage's (L9+) dungeon auto-attunes on completion (onDungeonConstructed). A
//     non-mage builds the structure, but it draws nothing / isn't attuned until an eligible mage owns/attunes.
//   • vault — a DWARVEN stronghold (RR p.353 / BTA): the Vaultguard/Craftpriest bonuses (the dwarven-
//     civilization wave) apply only for a dwarf.
// The "builder" is the owner character; for a domain-owned project we read the domain's ruler. Late-binds
// isArcaneCaster (acks-engine-sanctums.js, loads after this). Returns { matched, advisory, ownerName }.
function constructionBuilderClassAdvisory(campaign, opts){
  opts = opts || {};
  const kind = opts.kind;
  if(kind !== 'sanctum' && kind !== 'dungeon' && kind !== 'vault') return { matched:true, advisory:'', ownerName:null };
  const chars = (campaign && campaign.characters) || [];
  let owner = null;
  if(opts.ownerCharacterId) owner = chars.find(c => c && c.id === opts.ownerCharacterId) || null;
  else if(opts.ownerDomainId){
    const dom = (campaign && (campaign.domains || []).find(d => d && d.id === opts.ownerDomainId)) || null;
    if(dom) owner = chars.find(c => c && c.id === dom.rulerCharacterId) || null;
  }
  const ownerName = owner ? (owner.name || owner.id) : null;
  if(kind === 'vault'){
    const isDwarf = !!owner && /dwarf|dwarven|vaultguard|craftpriest/i.test(((owner.race || '') + ' ' + (owner.class || '')));
    if(isDwarf) return { matched:true, advisory:'', ownerName };
    if(!owner)  return { matched:false, advisory:'A vault is a dwarven stronghold (RR p.353) — assign a dwarven Vaultguard/Craftpriest owner for the dwarven bonuses. It still builds without one.', ownerName:null };
    return { matched:false, advisory:ownerName + ' is not a dwarf — the vault builds, but the dwarven Vaultguard/Craftpriest bonuses won’t apply (JJ p.121).', ownerName };
  }
  // sanctum / dungeon — arcane L9+
  const A = global.ACKS || {};
  const arcane = !!owner && typeof A.isArcaneCaster === 'function' && A.isArcaneCaster(owner);
  const l9 = !!owner && (Number(owner.level) || 0) >= 9;
  if(arcane && l9) return { matched:true, advisory:'', ownerName };
  const effect   = (kind === 'sanctum') ? 'draws apprentices + companions' : 'auto-attunes the owner';
  const fallback = (kind === 'sanctum') ? 'draws no apprentices until an arcane caster owns it' : 'won’t attune until an arcane L9+ caster attunes to it';
  if(!owner) return { matched:false, advisory:'Assign an arcane caster (L9+) owner so the ' + kind + ' ' + effect + ' on completion (RR p.386). It still builds without one.', ownerName:null };
  const why = !arcane ? (ownerName + ' is not an arcane caster') : (ownerName + ' is below 9th level');
  return { matched:false, advisory:why + ' — the ' + kind + ' builds, but ' + fallback + ' (JJ p.121).', ownerName };
}

// ── Construction Wave C — Construction Wizard engine (the creation verb + forecast; 2026-06-18) ──
// The day-tick consumer (proposeConstructionDay) already ADVANCES a structure Project — it accrues
// totalDailyOutputCf(workerCounts) per day toward laborRequired, completes at laborRequired, and the
// construction-completed event mints the Constructible. What was missing is the START: a setter that
// CREATES the Project (computing laborRequired from totalCost) + a forecast the Wizard previews. These
// fill that gap; the advance + completion machinery is unchanged.

// RR p.174: a STRUCTURE or VESSEL construction must be overseen by a siege engineer (≤25,000gp) or
// engineer (≤100,000gp). Land improvement (agricultural-improvement) is neither — it needs no engineer.
function projectRequiresSupervisor(project){
  return !!project && project.constructibleKind !== 'agricultural-improvement';
}

// Combined on-site supervisor COST cap (RR p.174 — engineer ≤100,000gp / siege engineer ≤25,000gp;
// caps additive). On-site = supervisor.currentHexId unset OR === the project's site hex (the
// agriculturalSupervisorAdequacy convention). Returns { ok, totalCap, report, blockReason }. The cap
// must cover the project's total cost. (Distinct from supervisorCapTotal, which is the WORKER-COUNT
// cap the day-tick uses to throttle output — N supervisors × 100 workers each.)
function projectSupervisorCostAdequacy(campaign, project){
  const ids = (project && Array.isArray(project.supervisorCharacterIds)) ? project.supervisorCharacterIds : [];
  const cost = (project && project.totalCost) || 0;
  const report = []; let totalCap = 0;
  const findCh = (id) => ((campaign && campaign.characters) || []).find(c => c && c.id === id) || null;
  if(!ids.length) return { ok:false, totalCap:0, report, blockReason:'no supervisor assigned' };
  ids.forEach(sid => {
    const sup = findCh(sid);
    if(!sup){ report.push({ id:sid, name:'(missing)', onSite:false, cap:0, reason:'character not found' }); return; }
    const cap = constructionSupervisorCapForCharacter(sup);
    const onSite = !sup.currentHexId || sup.currentHexId === project.siteHexId;
    if(cap <= 0){ report.push({ id:sid, name:sup.name, onSite, cap, reason:'not a construction supervisor (needs Engineering or Siege Engineering)' }); return; }
    if(!onSite){ report.push({ id:sid, name:sup.name, onSite:false, cap, reason:'not on-site (at a different hex)' }); return; }
    report.push({ id:sid, name:sup.name, onSite:true, cap }); totalCap += cap;
  });
  if(totalCap <= 0){
    const issues = report.filter(r => r.reason).map(r => r.name + ': ' + r.reason).join('; ');
    return { ok:false, totalCap:0, report, blockReason:'no eligible on-site supervisor (' + (issues || 'none') + ')' };
  }
  if(totalCap < cost) return { ok:false, totalCap, report, blockReason:'combined on-site supervisor cap (' + totalCap.toLocaleString() + 'gp) below project cost (' + cost.toLocaleString() + 'gp)' };
  return { ok:true, totalCap, report, blockReason:'' };
}

// PURE forecast for a Project — the Wizard preview AND a project card read it. Mirrors the day-tick
// math (proposeConstructionDay) exactly: crew cf/day, the worker-cap throttle when realistic, mage-assist
// multiplier, days to completion from the cf remaining. Plus the RR p.174 supervisor-cost adequacy.
function projectConstructionForecast(campaign, project){
  const A = global.ACKS || {};
  const out = { totalCost:0, laborRequired:0, laborInvested:0, remainingCf:0, pctComplete:0,
    dailyCf:0, dailyGp:0, dailyWageGp:0, workerTotal:0, workerCap:0, capLimited:false,
    daysToComplete:null, daysElapsed:0, requiresSupervisor:false, supervisorOk:true,
    supervisorCostCap:0, supervisorReport:[], supervisorBlockReason:'', realistic:true };
  if(!project) return out;
  const cfPerGp = A.CONSTRUCTION_CF_PER_GP || 30;
  const totalCost = project.totalCost || 0;
  const laborRequired = project.laborRequired || Math.round(totalCost * cfPerGp);
  const laborInvested = project.laborInvested || 0;
  const wc = project.workerCounts || {};
  const workerTotal = Object.values(wc).reduce((s,n) => s + (n||0), 0);
  let dailyCf = A.totalDailyOutputCf ? A.totalDailyOutputCf(wc) : 0;
  const realistic = !isHouseRuleEnabled(campaign, 'abstract-construction');
  const workerCap = supervisorCapTotal(project);
  let capLimited = false;
  if(realistic && workerCap > 0 && workerTotal > workerCap){ dailyCf = dailyCf * (workerCap / workerTotal); capLimited = true; }
  if(isHouseRuleEnabled(campaign, 'mage-assisted-construction') && project.magicAssist && project.magicAssist.multipliers){
    const mult = Object.values(project.magicAssist.multipliers).reduce((s,n) => s + (n||0), 1);
    dailyCf = dailyCf * mult;
  }
  const dailyWageGp = A.totalDailyWageGp ? A.totalDailyWageGp(wc) : 0;
  const remainingCf = Math.max(0, laborRequired - laborInvested);
  const daysToComplete = dailyCf > 0 ? Math.ceil(remainingCf / dailyCf) : null;   // null = never (no productive crew)
  const pctComplete = laborRequired > 0 ? Math.min(100, Math.round(laborInvested / laborRequired * 100)) : 0;
  const requiresSupervisor = projectRequiresSupervisor(project);
  const sup = projectSupervisorCostAdequacy(campaign, project);
  Object.assign(out, { totalCost, laborRequired, laborInvested, remainingCf, pctComplete,
    dailyCf, dailyGp: dailyCf / cfPerGp, dailyWageGp, workerTotal, workerCap, capLimited,
    daysToComplete, daysElapsed: project.daysElapsed || 0, requiresSupervisor,
    supervisorOk: (!requiresSupervisor || !realistic) ? true : sup.ok,
    supervisorCostCap: sup.totalCap, supervisorReport: sup.report, supervisorBlockReason: sup.blockReason, realistic });
  return out;
}

// The creation verb the Construction Wizard calls (Architecture §10.8). Builds a Project, computes
// laborRequired from totalCost (cf = gp × CONSTRUCTION_CF_PER_GP), and pushes it to campaign.projects
// in 'under-construction' state so the day-tick advances it immediately. Returns the Project. Does NOT
// emit an event (the UI emits construction-project-started for the audit trail + the 'started' history;
// the handler is idempotent on an already-started project). opts.start === false leaves it 'planning'.
function startConstructionProject(campaign, opts={}){
  if(!campaign) return null;
  if(!Array.isArray(campaign.projects)) campaign.projects = [];
  const blank = (global.ACKS && global.ACKS.blankProject) || null;
  if(typeof blank !== 'function') return null;
  const totalCost = Math.max(0, Number(opts.totalCost) || 0);
  const p = blank({
    id: opts.id,
    constructibleKind: opts.constructibleKind || 'stronghold-component',
    constructibleSubtype: opts.constructibleSubtype || null,
    name: opts.name || '',
    siteHexId: opts.siteHexId || null,
    siteSettlementId: opts.siteSettlementId || null,
    siteConstructibleId: opts.siteConstructibleId || null,
    ownerCharacterId: opts.ownerCharacterId || null,
    ownerDomainId: opts.ownerDomainId || null,
    isRepair: opts.isRepair === true,
    repairTargetConstructibleId: opts.repairTargetConstructibleId || null,
    totalCost,
    workerCounts: opts.workerCounts || {},
    supervisorCharacterIds: Array.isArray(opts.supervisorCharacterIds) ? opts.supervisorCharacterIds.filter(Boolean) : [],
    completionSpec: opts.completionSpec || null,
    notes: opts.notes || ''
  });
  p.laborRequired = (typeof opts.laborRequired === 'number') ? opts.laborRequired
    : (global.ACKS && global.ACKS.constructionLaborForGp ? global.ACKS.constructionLaborForGp(totalCost) : Math.round(totalCost * 30));
  p.lifecycleState = (opts.start === false) ? 'planning' : 'under-construction';
  if(p.lifecycleState === 'under-construction') p.startedAtTurn = (campaign.currentTurn != null) ? campaign.currentTurn : null;
  campaign.projects.push(p);
  return p;
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
    // === @b13-construction (team) — Wave D: vessels + war machines own their completion audit
    // (vessel-launched via the voyages seam; war-machine-built via materializeWaveDConstructible),
    // so suppress the generic construction-completed log notable for those two kinds — otherwise the
    // Event Log would carry a redundant "X completed" line alongside the kind-specific audit.
    if(willComplete && p.constructibleKind !== 'vessel' && p.constructibleKind !== 'war-machine'){
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
        ACKS._applyDomainTreasuryDelta(campaign, calc.domain, -calc.drip, { reason: 'agricultural-improvement', label: 'agricultural land improvement (construction)' });
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
    // ── Materialize the completed Constructible on the Day Clock (Wave E fix, 2026-06-21) ──
    // The shipped day-tick LOGS construction-completed but never applyEvent()s it (emitDayTickEvents
    // only emits the narrative log line), so before this fix a project completing on the Day Clock
    // produced NO Constructible for any kind except vessel + war-machine — strongholds (Wave C),
    // settlement buildings (Wave E), sanctums (AD-B), and the rest all completed empty. The two
    // special materializers stay: a WAR MACHINE mints via materializeWaveDConstructible (the Wave-D
    // analog) and a VESSEL via the voyages day-tick consumer (off lifecycleState:'complete'). EVERY
    // OTHER kind now runs the full construction-completed handler here — spawning the Constructible +
    // growing the stronghold (Wave C) + firing the sanctum (AD-B) / dungeon (AD-C) hooks — the same
    // path the event-apply already runs. Idempotent: the project is 'complete' now, so it yields no
    // further day-tick record (proposeConstructionDay skips non-under-construction projects).
    try {
      const A = global.ACKS;
      if(p.constructibleKind === 'war-machine'){
        if(A && typeof A.materializeWaveDConstructible === 'function') A.materializeWaveDConstructible(campaign, p);
      } else if(p.constructibleKind !== 'vessel' && A && typeof A.applyEvent === 'function' && typeof A.newEvent === 'function'){
        A.applyEvent(campaign, A.newEvent('construction-completed', { payload: { projectId: p.id }, submittedBy: 'engine', status: 'applied', targetTurn: campaign.currentTurn || 1 }));
      }
    } catch(_e){}
  }
}

// ── 'levy-muster' day-consumer (RR p.430; W7 levy-arrival staging) ──────────────────────────────────
// PURE peek: one record per mustering levy with batch(es) arriving on/before the simulated day; the
// commit tops up the unit's arrived `count` from `musterPending`. A domain levy arrives ½/¼/remainder
// over 3 weeks (the batches landing at +7/+14/+21 days — the barony time period, RR pp.430/434). Reads
// ctx.dayInMonth like the training consumer. Routine (no pauseTrigger). order 46 — after recruitment
// (45), before training (48): you muster, THEN train. commitTurn drives it to month end via
// runDayTickToMonthEnd, so a levy musters across Advance-Months. Records carry the per-batch DELTA
// (arriving), so applying them in day order to the real campaign reproduces the work-clone's progression.
function proposeLevyMusterDay(campaign, ctx){
  const out = { pendingRecords: [], notableEvents: [], encounters: [] };
  if(!campaign || !Array.isArray(campaign.units)) return out;
  const dayInMonth = (ctx && ctx.dayInMonth) || (campaign.currentDayInMonth || 1);
  const dayOrd = (((campaign.currentTurn) || 1) - 1) * 30 + dayInMonth;
  for(const u of campaign.units){
    const ms = u && u.musterState;
    if(!ms) continue;
    if(ms.destination){
      // MOVE muster (mobilizing an existing unit) — the whole unit arrives at its destination.
      if((ms.arrivesAtOrd || 0) > dayOrd) continue;
      out.pendingRecords.push({ kind: 'levy-muster', move: true, unitId: u.id });
      out.notableEvents.push({ kind: 'gm-narrative', type: 'unit-muster', transient: true, primaryHexId: ACKS._musterDestinationHexId(campaign, ms.destination),
        label: (u.displayName || 'A unit') + ' completes its muster and takes up its post.', payload: { unitId: u.id } });
      continue;
    }
    if((u.musterPending || 0) <= 0) continue;
    // RAISE muster (levy / realm recruitment) — soldiers arrive in ½/¼/remainder batches.
    let target = 0;
    for(const b of (ms.schedule || [])){ if(b.atOrd <= dayOrd) target += b.count; }
    const arriving = target - (ms.arrivedSoFar || 0);
    if(arriving <= 0) continue;
    const complete = (target >= ms.total);
    const noun = ACKS._levyMusterNoun(u.source);
    const isLevy = (u.source === 'militia' || u.source === 'conscript');
    const doneWord = isLevy ? 'levy complete' : 'muster complete';
    const stillVerb = isLevy ? 'still levying' : 'still mustering';
    out.pendingRecords.push({ kind: 'levy-muster', unitId: u.id, arriving });
    out.notableEvents.push({ kind: 'gm-narrative', type: 'levy-muster', transient: true, primaryHexId: null,
      label: (u.displayName || 'A levy') + ': ' + arriving + ' ' + noun + ' arrive' + (complete ? ' — ' + doneWord + ' (' + ms.total + ')' : ' (' + (ms.total - target) + ' ' + stillVerb + ')'),
      payload: { unitId: u.id } });
  }
  return out;
}
function commitLevyMusterRecord(campaign, record){
  if(!record || record.kind !== 'levy-muster') return;
  const u = ACKS.findUnit(campaign, record.unitId);
  const ms = u && u.musterState;
  if(!ms) return;
  const turn = (campaign.currentTurn != null) ? campaign.currentTurn : 0;
  if(record.move || ms.destination){
    // MOVE muster — station the whole unit at its destination, clear the muster.
    const dest = ms.destination;
    ACKS.stationUnit(campaign, u, dest ? { kind: dest.kind, id: dest.id } : null);
    u.musterState = null; u.musterPending = 0;
    if(dest && dest.kind === 'army'){
      const army = ACKS.findArmy(campaign, dest.id);
      if(army){
        if(!Array.isArray(army.divisions)) army.divisions = [];
        let div = army.divisions.find(d => d && d.role === 'main') || army.divisions[0] || null;
        if(!div && army.leaderCharacterId){
          div = { name: 'Main Body', commanderCharacterId: army.leaderCharacterId, adjutantCharacterId: null, unitIds: [], role: 'main' };
          army.divisions.push(div);
        }
        if(div){ if(!Array.isArray(div.unitIds)) div.unitIds = []; if(!div.unitIds.includes(u.id)) div.unitIds.push(u.id); }
        (army.history = army.history || []).push({ turn, type: 'reinforcement-arrived', narrative: (u.displayName || u.unitTypeKey || 'A unit') + ' completed its muster and joined ' + (army.name || 'the army') + '.' });
      }
    }
    (u.history = u.history || []).push({ turn, type: 'mustered', text: 'Muster complete — took up its post.' });
    return;
  }
  // RAISE muster — top up arrived soldiers.
  const arriving = Math.max(0, record.arriving || 0);
  u.count = (u.count || 0) + arriving;
  u.musterPending = Math.max(0, (u.musterPending || 0) - arriving);
  ms.arrivedSoFar = (ms.arrivedSoFar || 0) + arriving;
  if((u.musterPending || 0) <= 0 || ms.arrivedSoFar >= ms.total){
    u.musterPending = 0;
    u.musterState = null;
    const isLevy = (u.source === 'militia' || u.source === 'conscript');
    u.history.push({ turn, type: isLevy ? 'levied' : 'mustered', text: (isLevy ? 'Levy complete — ' : 'Muster complete — ') + ACKS.unitActiveCount(u) + ' ' + ACKS._levyMusterNoun(u.source) + ' assembled' });
  }
}
registerDayConsumer('levy-muster', {
  handler: proposeLevyMusterDay,
  order: 46,
  pauseTriggers: [],
  commit: commitLevyMusterRecord
});

// ── 'levy-training' day-consumer (RR p.431; W7 training timer) ───────────────────────────────────────
// PURE peek: one record per in-training levy whose training completes on/before the simulated day; the
// commit converts it to its trained troop type via _completeTraining. Reads ctx.dayInMonth (the simulated
// day during a multi-day propose — work.currentDayInMonth isn't advanced until after the handler runs).
// Routine (no pauseTrigger). order 48 — after recruitment (45), before construction (50). commitTurn
// drives it to month end via runDayTickToMonthEnd, so multi-month training completes across Advance-Months.
function proposeLevyTrainingDay(campaign, ctx){
  const out = { pendingRecords: [], notableEvents: [], encounters: [] };
  if(!campaign || !Array.isArray(campaign.units)) return out;
  const dayInMonth = (ctx && ctx.dayInMonth) || (campaign.currentDayInMonth || 1);
  const dayOrd = (((campaign.currentTurn) || 1) - 1) * 30 + dayInMonth;
  const A = global.ACKS;
  for(const u of campaign.units){
    const ts = u && u.trainingState;
    if(!ts || ts.completesAtOrd == null || ts.completesAtOrd > dayOrd) continue;
    const row = (A && A.findTroopType) ? A.findTroopType(ts.targetTroopType, { race: u.race || 'man' }) : null;
    const label = (row && row.label) || ts.targetTroopType;
    out.pendingRecords.push({ kind: 'levy-training', unitId: u.id, targetTroopType: ts.targetTroopType, count: ts.count, label });
    out.notableEvents.push({ kind: 'gm-narrative', type: 'levy-training', transient: true, primaryHexId: null,
      label: (u.displayName || 'A levy') + ': training complete — now ' + ACKS.unitActiveCount(u) + ' ' + label,
      payload: { unitId: u.id } });
  }
  return out;
}
function commitLevyTrainingRecord(campaign, record){
  if(!record || record.kind !== 'levy-training') return;
  const u = ACKS.findUnit(campaign, record.unitId);
  if(u && u.trainingState) ACKS._completeTraining(campaign, u);
}
registerDayConsumer('levy-training', {
  handler: proposeLevyTrainingDay,
  order: 48,
  pauseTriggers: [],
  commit: commitLevyTrainingRecord
});

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

// ── Urban investment paid over time (RR p.353 + RR p.351 + RR p.350) ─────────────────────────────
// RAW makes ordering urban investment a decree whose cost "is immediately paid" by default, but
// explicitly allows the Judge to "deduct the expense at a rate of 500gp per day" (RR p.353). For
// ACKS God Mode that 500gp/day drip is THE behaviour — the tool exists to do the bookkeeping RAW
// itself calls "usually more bookkeeping than its worth" (Joachim 2026-06-23). The committed gp
// (settlement.investmentBudgetGp) is paid out of the treasury at URBAN_INVESTMENT_RATE_PER_DAY on
// the Day Clock, raising the settlement's total investment (and so its max-population cap, RR p.350),
// and the FAMILIES FOLLOW THE BUILD: for every 1,000gp actually paid, 1d10 new urban families
// immigrate (RR p.351) — people move into the city as the infrastructure is built (Joachim's ruling).
//
// Reproducibility: the k-th 1,000gp-of-drip rolls a FIXED seeded 1d10, keyed on
// (campaign, settlement.id, k = floor(investmentDripPaid/1000)). So the propose half, the commit
// half, and a re-opened day review all agree regardless of how the days are chunked, and the
// treasury-authoritative recompute at commit can never drift the immigration off its seed.
const URBAN_INVESTMENT_RATE_PER_DAY = 500; // gp/day (RR p.353 — the investment-deduction rate)

function _urbanFamilyHash32(str){
  let h = 0x811c9dc5;
  for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function _urbanMulberry32(a){
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// One seeded 1d10 for a settlement's k-th family-milestone (k = the 1,000gp boundary just crossed).
function _urbanMilestoneFamilies(campaign, settlement, k){
  const seed = _urbanFamilyHash32(String((campaign && (campaign.seed || campaign.id || campaign.name)) || 'acks')
    + ':' + String(settlement.id) + ':uinv:' + k);
  return 1 + Math.floor(_urbanMulberry32(seed)() * 10);   // 1d10 (plain, RR p.351 — not exploding)
}

// PURE projection of ONE drip step for a settlement carrying a committed investment budget. Pays
// min(rate*days, budget, treasury) out of the treasury, rolls the family-milestones that payment
// crosses (seeded), and clamps the would-be arrivals to the settlement's NEW cap (RR p.350). Returns
// a result object (paid 0 + blockReason when it can't progress). Does NOT mutate.
function computeUrbanInvestmentDrip(campaign, domain, settlement, days){
  days = (typeof days === 'number' && days > 0) ? days : 1;
  const out = { paid: 0, families: 0, capped: false, settlement, domain,
    budget: (settlement && settlement.investmentBudgetGp) || 0,
    treasury: (domain && domain.treasury && domain.treasury.gp) || 0,
    newInvestment: (settlement && settlement.totalInvestment) || 0, cap: 0,
    blockReason: '', treasuryLimited: false };
  if(!campaign || !domain || !settlement) return out;
  const budget = settlement.investmentBudgetGp || 0;
  if(budget <= 0){ out.blockReason = 'no budget'; return out; }
  const treasury = Math.max(0, (domain.treasury && domain.treasury.gp) || 0);
  const want = URBAN_INVESTMENT_RATE_PER_DAY * days;
  const paid = Math.max(0, Math.min(want, budget, treasury));
  out.paid = paid;
  out.treasuryLimited = treasury < want && treasury < budget;
  if(paid <= 0){ out.blockReason = treasury <= 0 ? 'treasury empty' : 'idle'; return out; }
  // Family-milestones crossed: the 1,000gp boundaries between dripPaid and dripPaid + paid.
  const before = settlement.investmentDripPaid || 0;
  const mBefore = Math.floor(before / 1000), mAfter = Math.floor((before + paid) / 1000);
  let fam = 0;
  for(let k = mBefore + 1; k <= mAfter; k++) fam += _urbanMilestoneFamilies(campaign, settlement, k);
  out.newInvestment = (settlement.totalInvestment || 0) + paid;
  out.cap = global.ACKS.urbanMaxFamilies(out.newInvestment);
  // RR p.353 — a clanhold caps urban families at min(249, 12.5% of peasants), whatever the investment
  // (defence-in-depth: beginUrbanInvestment already blocks ordering, but a domain flipped to clanhold
  // mid-investment could still have an in-flight budget). clanholdMaxUrbanFamilies → null for non-clanholds.
  if(global.ACKS.clanholdMaxUrbanFamilies){
    const chCap = global.ACKS.clanholdMaxUrbanFamilies(domain);
    if(chCap != null) out.cap = out.cap > 0 ? Math.min(out.cap, chCap) : chCap;
  }
  const wouldBe = (settlement.families || 0) + fam;
  if(out.cap > 0 && wouldBe > out.cap){ out.families = Math.max(0, out.cap - (settlement.families || 0)); out.capped = true; }
  else out.families = fam;
  return out;
}

// §10.2 day-handler for urban investment (order 51 — right after construction's drip at 50). PURE:
// projects one day's drip per domain settlement with a committed budget WITHOUT mutating.
function proposeUrbanInvestmentDay(campaign, ctx){
  const days = (ctx && typeof ctx.days === 'number') ? ctx.days : 1;
  const pendingRecords = [], notableEvents = [];
  if(!campaign || !Array.isArray(campaign.domains)) return { pendingRecords, notableEvents, encounters: [] };
  for(const d of campaign.domains){
    if(!d) continue;
    let setts; try { setts = global.ACKS.hexSettlements(campaign, d) || []; } catch(e){ setts = []; }
    for(const entry of setts){
      const settlement = entry && entry.settlement, hex = entry && entry.hex;
      if(!settlement || (settlement.investmentBudgetGp || 0) <= 0) continue;
      const calc = computeUrbanInvestmentDrip(campaign, d, settlement, days);
      if(calc.paid <= 0) continue;
      const budgetLeft = Math.max(0, (settlement.investmentBudgetGp || 0) - calc.paid);
      const label = (settlement.name || 'settlement') + ': +' + Math.round(calc.paid) + 'gp invested'
        + (calc.families > 0 ? ' (+' + calc.families + ' famil' + (calc.families === 1 ? 'y' : 'ies') + (calc.capped ? ', at cap' : '') + ')' : '')
        + ' · ' + budgetLeft.toLocaleString() + 'gp budget left'
        + (calc.treasuryLimited ? ' · limited by treasury' : '');
      pendingRecords.push({
        kind: 'urban-investment-progress', settlementId: settlement.id, domainId: d.id,
        paid: calc.paid, families: calc.families, daysAdded: days, budgetLeftAfter: budgetLeft,
        primaryHexId: (hex && hex.id) || settlement.hexId || null, label
      });
      if(calc.families > 0){
        notableEvents.push({
          kind: 'urban-investment', type: 'immigration', settlementId: settlement.id, domainId: d.id,
          primaryHexId: (hex && hex.id) || settlement.hexId || null, campaignLogHidden: true,
          label: (settlement.name || 'settlement') + ' — +' + calc.families + ' urban famil' + (calc.families === 1 ? 'y' : 'ies') + ' (investment, RR p.351)'
        });
      }
    }
  }
  return { pendingRecords, notableEvents, encounters: [] };
}

// COMMIT half: recompute the drip authoritatively against CURRENT state (so the treasury depletes
// correctly across sequential records) and apply it — debit treasury, advance dripPaid + total
// investment, add the (seeded, clamped) families, draw down the budget, audit on completion.
function commitUrbanInvestmentRecord(campaign, record){
  if(!campaign || !record || !record.settlementId) return;
  const d = (campaign.domains || []).find(x => x && x.id === record.domainId) || null;
  const settlement = (campaign.settlements || []).find(s => s && s.id === record.settlementId) || null;
  if(!d || !settlement) return;
  const calc = computeUrbanInvestmentDrip(campaign, d, settlement, record.daysAdded || 1);
  if(calc.paid <= 0) return;
  global.ACKS._applyDomainTreasuryDelta(campaign, d, -calc.paid, { reason: 'urban-investment', label: 'urban investment — ' + (settlement.name || 'settlement') });
  settlement.investmentDripPaid = (settlement.investmentDripPaid || 0) + calc.paid;
  settlement.totalInvestment = (settlement.totalInvestment || 0) + calc.paid;
  settlement.investmentBudgetGp = Math.max(0, (settlement.investmentBudgetGp || 0) - calc.paid);
  if(calc.families > 0) settlement.families = (settlement.families || 0) + calc.families;
  if((settlement.investmentBudgetGp || 0) <= 0 && Array.isArray(d.history)){
    d.history.push({
      kind: 'urban-investment-complete', date: 'Turn ' + (campaign.currentTurn || 1),
      settlementId: settlement.id, settlementName: settlement.name || '(unnamed)',
      totalInvestmentAfter: settlement.totalInvestment, familiesAfter: settlement.families
    });
  }
}

registerDayConsumer('urban-investment', {
  handler: proposeUrbanInvestmentDay,
  order: 51,
  pauseTriggers: [],
  commit: commitUrbanInvestmentRecord
});

// Admin "complete now": pay the whole remaining budget at once (rolling every family-milestone the
// payment crosses), clamped by the treasury. Returns { paid, families, remaining } or null.
function flushUrbanInvestment(campaign, domain, settlement){
  if(!campaign || !domain || !settlement) return null;
  const budget = settlement.investmentBudgetGp || 0;
  if(budget <= 0) return null;
  const famBefore = settlement.families || 0, paidBefore = settlement.investmentDripPaid || 0;
  const days = Math.ceil(budget / URBAN_INVESTMENT_RATE_PER_DAY) + 1;   // enough to clear it (treasury permitting)
  commitUrbanInvestmentRecord(campaign, { settlementId: settlement.id, domainId: domain.id, daysAdded: days });
  return { paid: (settlement.investmentDripPaid || 0) - paidBefore, families: (settlement.families || 0) - famBefore,
           remaining: settlement.investmentBudgetGp || 0 };
}

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

// ── eventLog index (perf audit 2026-06-14, T11) ──────────────────────────────
// A once-per-build inverted index over the eventLog's context envelope, so the
// derived-history accessors + characterActivityBudget read an O(1) keyed slice
// instead of a full O(N) scan each. Built lazily and MEMOIZED in a module-level
// WeakMap keyed by the campaign (dirty-keyed by eventLog.length, so it never
// serializes into a save and rebuilds when entries are appended). The eventLog is
// effectively append-only between renders, so length is a sufficient dirty key —
// the day-tick / monthly machinery only ever pushes; on the rare in-place edit a
// callsite can pass {fresh:true} to force a rebuild.
//
//   byHex          Map<hexId, entry[]>         primaryHexId ∪ involvedHexIds
//   bySettlement   Map<settlementId, entry[]>  context.settlementId
//   byRelated      Map<"kind:id", entry[]>     context.relatedEntities (covers
//                                              character/group/domain/party/journey/…)
//   activityCost   entry[]                     only entries whose payload carries an
//                                              activityCost.slot (the tiny subset the
//                                              activity budget scans for, RR p.272/#346)
// Index ONE log entry into an (existing) index — factored out so _buildEventLogIndex (full) and
// the F4 incremental append (tail-only) share the exact same per-entry logic.
function _indexOneEventLogEntry(idx, entry){
  const push = (map, key, e) => { let a = map.get(key); if(!a){ a = []; map.set(key, a); } a.push(e); };
  const ev = (entry && entry.event) || entry;
  const c = (ev && ev.context) || null;
  if(c){
    if(c.primaryHexId) push(idx.byHex, c.primaryHexId, entry);
    if(Array.isArray(c.involvedHexIds)){
      for(const h of c.involvedHexIds){ if(h && h !== c.primaryHexId) push(idx.byHex, h, entry); }
    }
    if(c.settlementId) push(idx.bySettlement, c.settlementId, entry);
    const rels = c.relatedEntities;
    if(Array.isArray(rels)){
      const seen = new Set();
      for(const r of rels){
        if(r && r.kind && r.id){
          const k = r.kind + ':' + r.id;
          if(!seen.has(k)){ seen.add(k); push(idx.byRelated, k, entry); }   // an entry that names an entity twice still lists once
        }
      }
    }
  }
  if(ev && ev.payload && ev.payload.activityCost && ev.payload.activityCost.slot) idx.activityCost.push(entry);
}
function _buildEventLogIndex(campaign){
  const idx = { byHex: new Map(), bySettlement: new Map(), byRelated: new Map(), activityCost: [], len: 0 };
  const log = (campaign && Array.isArray(campaign.eventLog)) ? campaign.eventLog : [];
  for(const entry of log) _indexOneEventLogEntry(idx, entry);
  idx.len = log.length;
  return idx;
}

// Memoized accessor — rebuilds only when the eventLog grows (or fresh:true).
// The cache lives in a module-level WeakMap keyed by the campaign object, NOT on the
// campaign itself. Storing it on the campaign breaks under Alpine: currentCampaign is a
// reactive Proxy, so writing a property here either retriggers the very render that read it
// (a reactive loop) or makes Alpine deep-proxy the whole index (Maps of thousands of entries)
// — the app hangs on load with a large eventLog. A WeakMap is invisible to the reactive graph
// (no dependency tracked, no trigger fired, no deep-wrap) and still never serializes into a save.
const _eventLogIndexCache = new WeakMap();   // campaign → { ...idx, len }
function _eventLogIndexFor(campaign, opts){
  if(!campaign || typeof campaign !== 'object') return _buildEventLogIndex(campaign || null);
  const log = Array.isArray(campaign.eventLog) ? campaign.eventLog : [];
  const len = log.length;
  const cached = _eventLogIndexCache.get(campaign);
  if(!(opts && opts.fresh) && cached){
    if(cached.len === len) return cached;
    // F4 (audit 2026-06-24): the eventLog is append-only between renders, so on a length INCREASE
    // index just the new tail onto the cached maps (O(new entries)) rather than rebuilding the whole
    // index (O(N)). During a turn's many pushes this turns repeated O(N) rebuilds into O(total
    // appended). A DECREASE (an in-place edit / a truncation / an F1 rollback) can't be patched
    // incrementally → fall through to a full rebuild.
    if(len > cached.len){
      for(let i = cached.len; i < len; i++) _indexOneEventLogEntry(cached, log[i]);
      cached.len = len;
      return cached;
    }
  }
  const idx = _buildEventLogIndex(campaign);
  try { _eventLogIndexCache.set(campaign, idx); } catch(e){ /* non-extensible/non-object key — skip caching */ }
  return idx;
}

// The accessors return a COPY of the per-entity slice (the old .filter() contract: a fresh array
// the caller may .reverse()/.sort() in place). The slice is one entity's events — small — so the
// copy is cheap, and it keeps the shared index array uncorrupted.
function hexHistory(campaign, hexId){
  if(!campaign || !hexId || !Array.isArray(campaign.eventLog)) return [];
  const a = _eventLogIndexFor(campaign).byHex.get(hexId);
  return a ? a.slice() : [];
}

function settlementHistory(campaign, settlementId){
  if(!campaign || !settlementId || !Array.isArray(campaign.eventLog)) return [];
  const a = _eventLogIndexFor(campaign).bySettlement.get(settlementId);
  return a ? a.slice() : [];
}

function _filterByRelatedEntity(campaign, kind, id){
  if(!campaign || !id || !Array.isArray(campaign.eventLog)) return [];
  const a = _eventLogIndexFor(campaign).byRelated.get(kind + ':' + id);
  return a ? a.slice() : [];
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

  // ── Magic research (Phase 4 AD-M1; budget plan §13 — "research = dedicated-ongoing") ──
  // An in-progress research project DEDICATES the researcher's day (RR p.388 — 8 h/day at the full
  // research rate). Each named ASSISTANT likewise dedicates their day. RAW research IS per-day
  // downtime even though the engine ACCRUES the labour MONTHLY (processResearchForTurn; the per-day
  // accrual grain is deferred, consistent with the arcane core) — so the budget tracks per-day
  // OCCUPANCY: a researching mage reads as busy today (and is travel-capped), while the pool still
  // fills at the monthly turn. 'awaiting-throw' = labour-complete, waiting on a discrete throw (not
  // ongoing work) → not counted. Read from campaign.researchProjects (plain data) — no magic-research
  // module call, so no load-order coupling (this accessor is engine-core; that module loads later).
  for(const p of ((campaign && campaign.researchProjects) || [])){
    if(!p || p.status !== 'in-progress') continue;
    const isResearcher = p.researcherCharacterId === charId;
    const isAssistant  = Array.isArray(p.assistantCharacterIds) && p.assistantCharacterIds.indexOf(charId) >= 0;
    if(!isResearcher && !isAssistant) continue;
    const rc = costFor('research');
    activities.push({ kind:'research', label: (rc.label || 'Magic research') + (p.name ? (' — ' + p.name) : '') + (isResearcher ? '' : ' (assisting)'), cost: rc.cost, strenuous: !!rc.strenuous, sourceKind:'research-project', sourceId: p.id });
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
  // Read the pre-indexed activity-cost entries (perf T11) instead of full-scanning the eventLog per
  // character. The index holds only the tiny subset of events that carry payload.activityCost.slot,
  // so this loop is O(cost-tagged events) not O(eventLog) — collapsing the dashboard from
  // O(characters × eventLog) to ~O(characters + eventLog). Same per-entry filtering below.
  const _costEntries = _eventLogIndexFor(campaign).activityCost;
  for(const entry of _costEntries){
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
  // eventLog index (perf T11, 2026-06-14) — the memoized once-per-build inverted index the
  // history accessors + activity budget read; exported for tests + UI cache invalidation.
  buildEventLogIndex: _buildEventLogIndex, eventLogIndexFor: _eventLogIndexFor,
  // Phase 2.95 Activity Budget (#346 / AB-1) — derived per-character daily activity budget.
  characterActivityBudget, activityRejectAffordance,
  // Travel pace ↔ budget: the day's activities cap the achievable pace (Joachim 2026-06-05).
  journeyMaxPace, journeyEffectivePace, journeyTrackingPursuit,
  // Phase 4 Construction Wave A (Architecture.md §10 — 2026-05-30)
  // Day-tick primitives (also for future Calendar C2 reuse by Hijinks / Journeys / Spell Research)
  registerDayConsumer, unregisterDayConsumer, tickDay, tickDayOnce, dayConsumersInOrder,
  registerMonthlyConsumer, unregisterMonthlyConsumer, monthlyConsumersInOrder,   // audit E2 — monthly-turn consumer registry
  dayTickContext, isDayTickRuleOn, dayTickPauseReasons, dayTickActivityInFlight,
  dailyAdvanceBlockers,
  proposeDayTick, commitDayTick, runDayTickToMonthEnd, emitDayTickEvents,
  proposeConstructionDay, commitConstructionRecord,
  // Urban investment paid over time (RR p.353 — the 500gp/day drip; slot-51 day consumer)
  URBAN_INVESTMENT_RATE_PER_DAY, computeUrbanInvestmentDrip, proposeUrbanInvestmentDay, commitUrbanInvestmentRecord, flushUrbanInvestment,
  // Construction-specific helpers
  isEligibleSupervisor, supervisorCapTotal, projectExceedsSupervisor, isSiteEligibleForKind, constructionBuilderClassAdvisory,
  tickConstructionByDays, tickConstructionMonthly,
  // Wave Construction-C — the Construction Wizard engine (creation verb + forecast; 2026-06-18)
  startConstructionProject, projectConstructionForecast, projectRequiresSupervisor, projectSupervisorCostAdequacy,
  // Construction predicates
  isProject, isConstructible, isConstructibleKind, isUnderConstruction, isComplete, isDamaged, isOperational, isInRepair,
  displayConstructibleKind,
  // Construction lookups
  findProject, findConstructible, projectsAtHex, constructiblesAtHex, projectsForDomain, constructiblesForDomain,
  // Wave Construction-B — agricultural-improvement on the unified Project model
  migrateAgriculturalToProjects, findAgriculturalProject, syncAgriculturalProject,
  // Wave Construction-C — stronghold components lifted onto first-class Constructibles
  migrateStrongholdComponentsToConstructibles, _strongholdSeatHexId,
  // Time-based construction (RR p.174) — rate + supervisor-adequacy + per-day drip
  AGRICULTURAL_CONSTRUCTION_RATE_PER_DAY, agriculturalConstructionRatePerDay, agriculturalSupervisorAdequacy,
  constructionSupervisorCapForCharacter, computeAgriculturalDrip,
  // Schema + identity
  SCHEMA_VERSION, ENGINE_VERSION, ID_PREFIXES, registerPrefix, newId, slugify,
  // §15.5 collection self-registration (slice 2) — the campaign-collection registry + its derived sets.
  registerCollection, registeredCollections, seededCollections, lazyDefaultCollections, importableCollections,
  // Save-time serializer — stamps engineVersion/savedAt (the data-layer contract; INTEGRATION.md).
  stampCampaignForSave,
  // T6 single-home — strip the nested mirrors (the reader sweep made the top-level the single home).
  // stripNestedMirrors = both halves (save time); stripHexSettlementMirrors = the hex/settlement half
  // (index.html _finishLoad, after the hex lift); stripUnitMirrors = the unit half (load-migration @155).
  stripNestedMirrors, stripUnitMirrors, stripHexSettlementMirrors,

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
  rollNaturalIncrease, rollNaturalDecrease, rollMoraleExtra, clanholdRaidGrowth,
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
  loadCampaign, finalizeCampaignLoad,   // audit G2 — the complete headless load entry (migrate → finalize)
  // §15.5 load-migration self-registration (slice 4) — the per-load pass registry + runner.
  registerLoadMigration, registeredLoadMigrations, runLoadMigrations,
  // Phase #440 stage 1 — additive five-axis classification migration (2026-05-29)
  migrateCharacterClassification, migrateAllCharacterClassification,
  // Foundation #244 — mining-entry stripper (callable independently of migrateCampaign for
  // session-restore paths that store domains separately from the campaign object).
  stripUnusedMiningEntries,

  // Event-system exports are attached by acks-engine-events.js (loaded after).

  // Top-level collections refactor (Foundation #193)
  hexesForDomain, wildernessHexes, findHex, findSettlement, findRumor,
  // W7-continuation — the training timer (RR p.431): training takes its months; a day-consumer completes it
  proposeLevyTrainingDay, commitLevyTrainingRecord,
  // W7-continuation — the levy-arrival timer (RR p.430): levied troops arrive ½/¼/remainder over 3 weeks
  proposeLevyMusterDay, commitLevyMusterRecord,
  // W7-continuation — standing-army capacity (RR p.434, the Vassal Troops by Realm Size table)
  realmStandingArmyCapacity,
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
