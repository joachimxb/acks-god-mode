/* =============================================================================
 * acks-engine-voyages.js — ACKS God Mode Maritime / Voyages (Phase 3 Voyages #145, V1)
 *
 * The Vessel data layer: a frozen VESSEL_CATALOG (the 20 RR Sea Vessels classes)
 * + the first-class Vessel entity (campaign.vessels[], prefix vsl-) + lookups and
 * the crew-Group / officer-Character / hold-Stash binding resolvers, plus the
 * Journey.shipId resolver (the factory field is already reserved on blankJourney).
 *
 * SCOPE (V1 — DATA LAYER ONLY). voyage-mode (the journey.mode voyage branches in
 * the journeys day-tick consumer), the wind/point-of-sail speed model, sea
 * navigation/hazards/survival, and the sea-encounter tables are V2+ — NOT here.
 * Nothing in this module touches tickJourneyDay or the journeys consumer.
 * Build view: Phase_3_Voyages_Plan.md §3 + §66 (V1 row). RAW: Maritime_Voyages_RAW_Survey.md.
 *
 * SOURCE + IP (CLAUDE.md §13.6): mechanical values only, page-cited, no rule prose.
 *   VESSEL_CATALOG  — RR p.316 Sea Vessels table (crew · 4 combat speeds · 2 voyage
 *                     speeds · cargo · AC · base SHP · cost); draft / tonnage /
 *                     war-machine capacity / deck type (aphract|cataphract) from the
 *                     RR pp.153–156 Vessel Descriptions; draft also RR p.331 (rivers).
 *   Two RR-internal print values kept as the table prints them, with the prose value
 *   noted in a comment (the troops.js precedent): the 2.5-rower galley cargo reads
 *   1,250 st in the p.316 table vs 1,200 st in the p.154 description — the catalog
 *   follows the table (the column of record). "—" in a crew column is 0 (no
 *   requirement/capacity); "—" in a SPEED column is null (that propulsion mode is
 *   not available — a barge cannot row, a rowboat has no sail).
 *
 * Load order: AFTER acks-engine.js (newId / ID_PREFIXES / SCHEMA_VERSION) — like
 * religion/weather, a fresh acks-engine-*.js loads after the core (tests/_engine.js
 * auto-discovers it; index.html adds the <script> at the burst4 agent-4 marker).
 * Self-contained: pure reads/setters over a passed campaign, late-bound on global.ACKS.
 * =============================================================================
 */
(function (global) {
  'use strict';
  const ACKS = global.ACKS = global.ACKS || {};

  // Late-bound core helpers (this module loads after acks-engine.js; reference at call time
  // so we never depend on load order beyond "core is present"). Mirrors the entities.js idiom.
  function _newVesselId(){
    const A = global.ACKS || ACKS;
    const prefix = (A.ID_PREFIXES && A.ID_PREFIXES.vessel) || 'vsl';
    return (typeof A.newId === 'function') ? A.newId(prefix) : (prefix + '-' + Math.random().toString(36).slice(2, 9));
  }
  function _schemaVersion(){
    const A = global.ACKS || ACKS;
    return (typeof A.SCHEMA_VERSION === 'number') ? A.SCHEMA_VERSION : 2;
  }

  // ── VESSEL_CATALOG (immutable reference data) ──────────────────────────────
  // RR p.316 Sea Vessels table + RR pp.153–156 / p.331 descriptions. Flat rows (the
  // TROOP_CATALOG shape). speeds in feet/round (combat) or miles/12-hour-day (voyage);
  // "—" in the printed table ⇒ null for a speed (mode unavailable), 0 for crew.
  //   sailors/rowers/marines  — full crew complement (RR p.316: marines = carried capacity)
  //   oarSprintFt/oarCruiseFt/oarSlowFt/sailFt — combat speed, feet per round
  //   voyageOarMi/voyageSailMi — voyage speed, miles per 12-hour day
  //   cargoSt — cargo capacity, stone · ac · shp (base structural hit points) · costGp
  //   draftFt — surface depth (RR pp.153–156 / p.331; the V5 depth-vs-draft river check)
  //   tonnage — displacement (RR pp.153–156; null where the description gives none)
  //   warMachineCount / warMachineMaxSt — fitted war-machine slots + max weight each
  //   deckType — aphract (open) | cataphract (closed) where RR designates it (galleys); else null
  const VESSEL_CATALOG = [
    // Barges — flat-bottomed sail cargo carriers (RR p.153); no oars.
    { key:"barge-small",       label:"Barge, Small",       sailors:5,  rowers:0,   marines:0,   oarSprintFt:null, oarCruiseFt:null, oarSlowFt:null, sailFt:180, voyageOarMi:null, voyageSailMi:72, cargoSt:2000,   ac:2, shp:15,   draftFt:2,    tonnage:15,   warMachineCount:1, warMachineMaxSt:120, deckType:null, costGp:2000,   page:316 },
    { key:"barge-large",       label:"Barge, Large",       sailors:10, rowers:0,   marines:0,   oarSprintFt:null, oarCruiseFt:null, oarSlowFt:null, sailFt:150, voyageOarMi:null, voyageSailMi:60, cargoSt:7000,   ac:2, shp:60,   draftFt:3,    tonnage:60,   warMachineCount:1, warMachineMaxSt:400, deckType:null, costGp:9000,   page:316 },
    { key:"barge-huge",        label:"Barge, Huge",        sailors:50, rowers:0,   marines:0,   oarSprintFt:null, oarCruiseFt:null, oarSlowFt:null, sailFt:120, voyageOarMi:null, voyageSailMi:48, cargoSt:135000, ac:2, shp:1150, draftFt:10,   tonnage:1150, warMachineCount:4, warMachineMaxSt:800, deckType:null, costGp:180000, page:316 },
    // Boats + canoe + raft — small craft.
    { key:"boat-row",          label:"Boat, Row",          sailors:0,  rowers:1,   marines:0,   oarSprintFt:210,  oarCruiseFt:150,  oarSlowFt:90,   sailFt:null, voyageOarMi:30,   voyageSailMi:null, cargoSt:100,    ac:1, shp:2,    draftFt:1,    tonnage:null, warMachineCount:0, warMachineMaxSt:null, deckType:null, costGp:200,    page:316 },
    { key:"boat-sail",         label:"Boat, Sail",         sailors:3,  rowers:0,   marines:0,   oarSprintFt:null, oarCruiseFt:null, oarSlowFt:null, sailFt:180, voyageOarMi:null, voyageSailMi:72, cargoSt:500,    ac:1, shp:5,    draftFt:2,    tonnage:null, warMachineCount:0, warMachineMaxSt:null, deckType:null, costGp:1500,   page:316 },
    { key:"canoe",             label:"Canoe",              sailors:0,  rowers:1,   marines:0,   oarSprintFt:210,  oarCruiseFt:150,  oarSlowFt:90,   sailFt:null, voyageOarMi:30,   voyageSailMi:null, cargoSt:60,     ac:0, shp:1,    draftFt:0.5,  tonnage:null, warMachineCount:0, warMachineMaxSt:null, deckType:null, costGp:40,     page:316 },
    // Galleys — oar+sail; aphract (open) through the 3-rower, cataphract (closed) from the 4-rower up.
    { key:"galley-1-rower",    label:"Galley, 1-Rower",    sailors:3,  rowers:30,  marines:0,   oarSprintFt:240,  oarCruiseFt:150,  oarSlowFt:90,   sailFt:240, voyageOarMi:30,   voyageSailMi:96, cargoSt:500,    ac:2, shp:15,   draftFt:2.33, tonnage:15,   warMachineCount:1, warMachineMaxSt:150, deckType:"aphract",    costGp:1500,  page:316 },
    { key:"galley-1.5-rower",  label:"Galley, 1.5-Rower",  sailors:5,  rowers:50,  marines:5,   oarSprintFt:270,  oarCruiseFt:180,  oarSlowFt:90,   sailFt:300, voyageOarMi:30,   voyageSailMi:96, cargoSt:750,    ac:2, shp:20,   draftFt:2.5,  tonnage:20,   warMachineCount:2, warMachineMaxSt:150, deckType:"aphract",    costGp:2750,  page:316 },
    { key:"galley-2-rower",    label:"Galley, 2-Rower",    sailors:5,  rowers:90,  marines:10,  oarSprintFt:270,  oarCruiseFt:180,  oarSlowFt:90,   sailFt:240, voyageOarMi:36,   voyageSailMi:96, cargoSt:1000,   ac:2, shp:25,   draftFt:2.5,  tonnage:25,   warMachineCount:2, warMachineMaxSt:200, deckType:"aphract",    costGp:3350,  page:316 },
    // 2.5-rower cargo: p.316 table = 1,250 st; p.154 description = 1,200 st (RR-internal); follow the table.
    { key:"galley-2.5-rower",  label:"Galley, 2.5-Rower",  sailors:10, rowers:120, marines:10,  oarSprintFt:300,  oarCruiseFt:240,  oarSlowFt:120,  sailFt:360, voyageOarMi:48,   voyageSailMi:96, cargoSt:1250,   ac:2, shp:45,   draftFt:2.5,  tonnage:45,   warMachineCount:2, warMachineMaxSt:250, deckType:"aphract",    costGp:6000,  page:316 },
    { key:"galley-3-rower",    label:"Galley, 3-Rower",    sailors:15, rowers:170, marines:15,  oarSprintFt:330,  oarCruiseFt:270,  oarSlowFt:150,  sailFt:240, voyageOarMi:54,   voyageSailMi:96, cargoSt:1500,   ac:2, shp:55,   draftFt:3,    tonnage:55,   warMachineCount:2, warMachineMaxSt:350, deckType:"aphract",    costGp:7500,  page:316 },
    { key:"galley-4-rower",    label:"Galley, 4-Rower",    sailors:15, rowers:180, marines:75,  oarSprintFt:300,  oarCruiseFt:240,  oarSlowFt:120,  sailFt:180, voyageOarMi:48,   voyageSailMi:72, cargoSt:2000,   ac:2, shp:65,   draftFt:4,    tonnage:65,   warMachineCount:2, warMachineMaxSt:400, deckType:"cataphract", costGp:10000, page:316 },
    { key:"galley-5-rower",    label:"Galley, 5-Rower",    sailors:20, rowers:300, marines:75,  oarSprintFt:270,  oarCruiseFt:240,  oarSlowFt:120,  sailFt:150, voyageOarMi:48,   voyageSailMi:66, cargoSt:5750,   ac:2, shp:120,  draftFt:5,    tonnage:120,  warMachineCount:3, warMachineMaxSt:500, deckType:"cataphract", costGp:16250, page:316 },
    { key:"galley-6-rower",    label:"Galley, 6-Rower",    sailors:20, rowers:336, marines:100, oarSprintFt:270,  oarCruiseFt:210,  oarSlowFt:120,  sailFt:150, voyageOarMi:42,   voyageSailMi:60, cargoSt:6000,   ac:2, shp:140,  draftFt:6,    tonnage:140,  warMachineCount:4, warMachineMaxSt:600, deckType:"cataphract", costGp:20000, page:316 },
    { key:"galley-8-rower",    label:"Galley, 8-Rower",    sailors:50, rowers:440, marines:150, oarSprintFt:240,  oarCruiseFt:210,  oarSlowFt:120,  sailFt:150, voyageOarMi:42,   voyageSailMi:60, cargoSt:8000,   ac:2, shp:200,  draftFt:8,    tonnage:200,  warMachineCount:7, warMachineMaxSt:800, deckType:"cataphract", costGp:30000, page:316 },
    // Longship — oar+sail raider; crew double as marines (RR p.155, table marines "(75)"); draft 2'–3'.
    { key:"longship",          label:"Longship",           sailors:15, rowers:60,  marines:75,  oarSprintFt:210,  oarCruiseFt:150,  oarSlowFt:90,   sailFt:240, voyageOarMi:30,   voyageSailMi:90, cargoSt:2000,   ac:2, shp:30,   draftFt:3,    tonnage:null, warMachineCount:0, warMachineMaxSt:null, deckType:null, costGp:4000,   page:316 },
    { key:"raft",              label:"Raft",               sailors:0,  rowers:1,   marines:0,   oarSprintFt:180,  oarCruiseFt:120,  oarSlowFt:60,   sailFt:null, voyageOarMi:24,   voyageSailMi:null, cargoSt:150,    ac:0, shp:1,    draftFt:1,    tonnage:null, warMachineCount:0, warMachineMaxSt:null, deckType:null, costGp:150,    page:316 },
    // Sailing ships — seaworthy cargo carriers; no oars; small crews (RR p.155).
    { key:"sailing-ship-small",label:"Sailing Ship, Small",sailors:12, rowers:0,   marines:0,   oarSprintFt:null, oarCruiseFt:null, oarSlowFt:null, sailFt:240, voyageOarMi:null, voyageSailMi:96, cargoSt:10000,  ac:2, shp:75,   draftFt:5,    tonnage:75,   warMachineCount:1, warMachineMaxSt:400, deckType:null, costGp:10000,  page:316 },
    { key:"sailing-ship-large",label:"Sailing Ship, Large",sailors:20, rowers:0,   marines:0,   oarSprintFt:null, oarCruiseFt:null, oarSlowFt:null, sailFt:180, voyageOarMi:null, voyageSailMi:72, cargoSt:30000,  ac:2, shp:200,  draftFt:10,   tonnage:200,  warMachineCount:2, warMachineMaxSt:800, deckType:null, costGp:20000,  page:316 },
    { key:"sailing-ship-huge", label:"Sailing Ship, Huge", sailors:40, rowers:0,   marines:0,   oarSprintFt:null, oarCruiseFt:null, oarSlowFt:null, sailFt:180, voyageOarMi:null, voyageSailMi:60, cargoSt:50000,  ac:2, shp:400,  draftFt:12.5, tonnage:400,  warMachineCount:4, warMachineMaxSt:800, deckType:null, costGp:60000,  page:316 }
  ].map(Object.freeze);
  Object.freeze(VESSEL_CATALOG);

  // Fast key→row lookup.
  const VESSEL_CATALOG_BY_KEY = {};
  for(const c of VESSEL_CATALOG){ VESSEL_CATALOG_BY_KEY[c.key] = c; }

  // ── Catalog lookups ────────────────────────────────────────────────────────
  function findVesselClass(catalogKey){ return (catalogKey && VESSEL_CATALOG_BY_KEY[catalogKey]) || null; }
  function vesselClassKeys(){ return VESSEL_CATALOG.map(c => c.key); }
  function vesselCatalogList(){ return VESSEL_CATALOG.slice(); }     // defensive copy
  function isVesselClass(catalogKey){ return !!findVesselClass(catalogKey); }
  function vesselClassLabel(catalogKey){ const c = findVesselClass(catalogKey); return c ? c.label : (catalogKey || ''); }

  // ── The Vessel entity (mutable instance; Phase_3_Voyages_Plan.md §3) ────────
  // References a VESSEL_CATALOG class for immutable stats; carries everything that
  // changes (shp / crew complement / condition / ownership / cargo). Crew = Groups
  // (counted) + Characters (named officers) bound via the vessel-side ref arrays
  // (Architecture §3.3 — reverse-index computed, so no new field on Character/Group).
  // The hold is a Stash (stashKind:'vessel-hold'). Parallel: Vessel : crew-Groups :: Army : Units.
  function blankVessel(opts){
    opts = opts || {};
    const cls = findVesselClass(opts.catalogKey);
    const cc = opts.crewComplement || {};
    return {
      schemaVersion: _schemaVersion(),
      id: opts.id || _newVesselId(),
      name: opts.name || '',
      catalogKey: opts.catalogKey || '',           // → VESSEL_CATALOG (immutable class stats)
      shp: (opts.shp != null) ? opts.shp : (cls ? cls.shp : 0),   // current structural hit points (≤ catalog.shp)
      ownerId: opts.ownerId || null,               // a character OR a domain (resolved by vesselOwner)
      currentHexId: opts.currentHexId || null,
      // Crew complement: current manning vs the catalog full requirement.
      crewComplement: {
        sailors:  Number(cc.sailors)  || 0,
        rowers:   Number(cc.rowers)   || 0,
        marines:  Number(cc.marines)  || 0
      },
      crewGroupIds: Array.isArray(opts.crewGroupIds) ? opts.crewGroupIds.slice() : [],            // counted crew (sailors/rowers) → campaign.groups[]
      marineGroupIds: Array.isArray(opts.marineGroupIds) ? opts.marineGroupIds.slice() : [],       // SEAM 2 — carried foot-troop marines (the Military seam, RR p.315) → campaign.groups[]; the V1 crew pattern, distinct from crewGroupIds (ship operation). Additive/defensive-read (old saves lack it → []); no migration.
      officerCharacterIds: Array.isArray(opts.officerCharacterIds) ? opts.officerCharacterIds.slice() : [], // captain/navigator/master mariner → campaign.characters[]
      holdStashId: opts.holdStashId || null,        // cargo → a Stash (stashKind:'vessel-hold')
      warMachines: Array.isArray(opts.warMachines) ? opts.warMachines.slice() : [],               // fitted naval machines [{kind, note}]
      condition: opts.condition || 'seaworthy',     // seaworthy | damaged | sinking | beached | wrecked
      constructionState: opts.constructionState || 'complete', // complete when bought; a Construction Project drives the lifecycle (Wave D)
      createdAtTurn: (opts.createdAtTurn != null) ? opts.createdAtTurn : null,
      history: Array.isArray(opts.history) ? opts.history.slice() : []
    };
  }

  // Canonical create setter — init-on-write (no migrateCampaign injector, so templates stay
  // migrate-no-ops; campaign.vessels is read defensively as `|| []` everywhere else).
  function createVessel(campaign, opts){
    if(!campaign || typeof campaign !== 'object') return null;
    const v = blankVessel(opts || {});
    if(!Array.isArray(campaign.vessels)) campaign.vessels = [];
    campaign.vessels.push(v);
    return v;
  }

  // ── Instance lookups (defensive — absent collection reads as []) ────────────
  function _vessels(campaign){ return (campaign && Array.isArray(campaign.vessels)) ? campaign.vessels : []; }
  function findVessel(campaign, vesselId){
    if(!vesselId) return null;
    return _vessels(campaign).find(v => v && v.id === vesselId) || null;
  }
  function vesselsOwnedBy(campaign, ownerId){
    if(!ownerId) return [];
    return _vessels(campaign).filter(v => v && v.ownerId === ownerId);
  }
  function vesselsAtHex(campaign, hexId){
    if(!hexId) return [];
    return _vessels(campaign).filter(v => v && v.currentHexId === hexId);
  }
  // The Vessel a Journey rides (voyage modes) — resolves journey.shipId. Reads defensively, so
  // a land journey (shipId null) returns null. (The journeys day-tick consumer is V2 — not here.)
  function vesselForJourney(campaign, journeyOrId){
    if(!journeyOrId) return null;
    let j = journeyOrId;
    if(typeof journeyOrId === 'string'){
      const A = global.ACKS || ACKS;
      j = (typeof A.findEntity === 'function') ? A.findEntity(campaign, 'journey', journeyOrId)
                                               : ((campaign && campaign.journeys) || []).find(x => x && x.id === journeyOrId);
    }
    return (j && j.shipId) ? findVessel(campaign, j.shipId) : null;
  }
  // Journeys that ride a given vessel (the reverse index — computed, not stored; Architecture §3.3).
  function journeysForVessel(campaign, vesselId){
    if(!vesselId) return [];
    return ((campaign && campaign.journeys) || []).filter(j => j && j.shipId === vesselId);
  }

  // ── Binding resolvers (vessel-side ref arrays → the bound entities) ─────────
  function vesselClass(vessel){ return vessel ? findVesselClass(vessel.catalogKey) : null; }
  // The vessel's owner — a character or a domain (ownerId is polymorphic; resolve against both).
  function vesselOwner(campaign, vessel){
    if(!campaign || !vessel || !vessel.ownerId) return null;
    const ch = ((campaign.characters) || []).find(c => c && c.id === vessel.ownerId);
    if(ch) return { kind: 'character', entity: ch };
    const dom = ((campaign.domains) || []).find(d => d && d.id === vessel.ownerId);
    if(dom) return { kind: 'domain', entity: dom };
    return null;
  }
  // Counted-crew Groups bound to the vessel (crewGroupIds → campaign.groups[]).
  function vesselCrewGroups(campaign, vessel){
    if(!campaign || !vessel) return [];
    const groups = (campaign.groups) || [];
    return (vessel.crewGroupIds || []).map(id => groups.find(g => g && g.id === id)).filter(Boolean);
  }
  // Named officer Characters bound to the vessel (officerCharacterIds → campaign.characters[]).
  function vesselOfficers(campaign, vessel){
    if(!campaign || !vessel) return [];
    const chars = (campaign.characters) || [];
    return (vessel.officerCharacterIds || []).map(id => chars.find(c => c && c.id === id)).filter(Boolean);
  }
  // The vessel's cargo hold (a Stash, stashKind:'vessel-hold') — or null until one is created.
  function vesselHold(campaign, vessel){
    if(!campaign || !vessel || !vessel.holdStashId) return null;
    return ((campaign.stashes) || []).find(s => s && s.id === vessel.holdStashId) || null;
  }
  // Create-and-bind the vessel's hold Stash (stashKind:'vessel-hold'), if the Stash factory is
  // present. Idempotent — returns the existing hold if already linked. The hold's GP/item
  // machinery is the shipped Stash subsystem's; this just materializes + links it.
  function ensureVesselHold(campaign, vessel, opts){
    if(!campaign || !vessel) return null;
    const existing = vesselHold(campaign, vessel);
    if(existing) return existing;
    const A = global.ACKS || ACKS;
    if(typeof A.blankStash !== 'function') return null;       // Stash subsystem not loaded — caller falls back
    opts = opts || {};
    const stash = A.blankStash({
      name: opts.name || ((vessel.name || vesselClassLabel(vessel.catalogKey) || 'Vessel') + ' — hold'),
      kind: 'vessel-hold',                                    // stashKind:'vessel-hold' (the cargo manifest)
      ownerCharacterId: opts.ownerCharacterId || null
    });
    if(!Array.isArray(campaign.stashes)) campaign.stashes = [];
    campaign.stashes.push(stash);
    vessel.holdStashId = stash.id;
    return stash;
  }

  // ── Derived reference reads (catalog-backed; the V1 read surface) ───────────
  // Cargo capacity = the class cargo (the hold-vs-rations-vs-kit budgeting is V2/Mercantile).
  function vesselCargoCapacitySt(vessel){ const c = vesselClass(vessel); return c ? c.cargoSt : 0; }
  // Full crew the class requires (the manning target crewComplement is measured against).
  function vesselFullCrew(vessel){
    const c = vesselClass(vessel);
    return c ? { sailors: c.sailors, rowers: c.rowers, marines: c.marines } : { sailors: 0, rowers: 0, marines: 0 };
  }
  // Surface depth (RR pp.153–156 / p.331) — the V5 river depth-vs-draft check reads this.
  function vesselDraftFt(vessel){ const c = vesselClass(vessel); return c ? c.draftFt : null; }
  // The class voyage speed (miles per 12-hour day) under a propulsion mode; null when unavailable.
  // NB: this is the RAW base rate ONLY — the wind × point-of-sail × pace model is V2 (NOT applied here).
  function vesselBaseVoyageSpeedMi(vessel, propulsion){
    const c = vesselClass(vessel); if(!c) return null;
    return (propulsion === 'oar') ? c.voyageOarMi : c.voyageSailMi;
  }
  // True when the vessel is below its class base SHP (took damage).
  function vesselIsDamaged(vessel){ const c = vesselClass(vessel); return !!(c && vessel && vessel.shp < c.shp); }

  // ===========================================================================
  // V2 — the wind + sailing-speed model (RR pp.318–322). Pure functions: the
  // wind-strength × point-of-sail × pace × crew/damage product the journeys
  // day-tick consumer applies when a journey rides a Vessel (the voyage branch).
  // Maritime_Voyages_RAW_Survey.md §5–§6 / §10; Phase_3_Voyages_Plan.md §66 (V2).
  // ===========================================================================

  // (a) Wind STRENGTH → propulsion multipliers (RR p.319). Keyed by the SHIPPED
  // Weather wind vocabulary (acks-engine-weather.js): Still/Gentle/Moderate/Strong/
  // Windy/Stormy — where "Windy" = RR's Very Strong and "Stormy" = RR's Gale (so the
  // Weather wind axis IS the RR p.319 wind-strength axis; we consume it, never re-roll).
  // sail = the sail-speed multiplier; oar = the oar-speed multiplier (oars row on
  // regardless of wind DIRECTION — the whole strategic point of a galley). tackNeedsMaster:
  // in Strong+ wind a vessel can only beat to windward (tack) with a master mariner.
  const WIND_STRENGTH_VOYAGE = Object.freeze({
    Still:    Object.freeze({ sail: 0,   oar: 1,   label: 'Still',       rawBand: 'Still' }),
    Gentle:   Object.freeze({ sail: 1/2, oar: 1,   label: 'Gentle',      rawBand: 'Gentle' }),
    Moderate: Object.freeze({ sail: 1,   oar: 1,   label: 'Moderate',    rawBand: 'Moderate' }),
    Strong:   Object.freeze({ sail: 3/2, oar: 1,   label: 'Strong',      rawBand: 'Strong',      tackNeedsMaster: true }),
    Windy:    Object.freeze({ sail: 2/3, oar: 2/3, label: 'Very Strong', rawBand: 'Very Strong', tackNeedsMaster: true }),
    Stormy:   Object.freeze({ sail: 2/3, oar: 2/3, label: 'Gale',        rawBand: 'Gale',        tackNeedsMaster: true, gale: true })
  });
  function windStrengthVoyage(weatherWindName){ return WIND_STRENGTH_VOYAGE[weatherWindName] || WIND_STRENGTH_VOYAGE.Moderate; }

  // (b) POINT OF SAIL (RR p.318) — the sail multiplier by the bow's angle to the wind.
  // Ordered worst→best (index 0..4). Close-hauled tacks, so only 66% of distance counts
  // toward the goal; into-the-wind makes no headway directly (must tack as close-hauled).
  const POINT_OF_SAIL_BANDS = Object.freeze([
    Object.freeze({ key:'into-wind',    label:'Into the wind', sail:0,   progress:1,    beating:true,  index:0 }),
    Object.freeze({ key:'close-hauled', label:'Close-hauled',  sail:1/3, progress:0.66, beating:true,  index:1 }),
    Object.freeze({ key:'beam-reach',   label:'Beam reach',    sail:1/2, progress:1,    beating:false, index:2 }),
    Object.freeze({ key:'broad-reach',  label:'Broad reach',   sail:2/3, progress:1,    beating:false, index:3 }),
    Object.freeze({ key:'running',      label:'Running',       sail:1,   progress:1,    beating:false, index:4 })
  ]);
  // pointOfSail(headingDeg, windFromDeg, {masterMariner}) → the band for a vessel heading
  // headingDeg with the wind blowing FROM windFromDeg (both compass bearings, N=0° CW).
  // θ = the angle between the bow and where the wind comes from (0 = dead ahead = into the
  // wind; 180 = dead behind = running). Master mariner shifts one step more favorable (RR p.319).
  function pointOfSail(headingDeg, windFromDeg, opts){
    opts = opts || {};
    let theta = Math.abs((((Number(headingDeg) - Number(windFromDeg)) % 360) + 540) % 360 - 180);
    if(!isFinite(theta)) theta = 90;   // no heading/direction data → beam reach (neutral)
    let idx;
    if(theta < 22.5) idx = 0;          // into the wind
    else if(theta < 67.5) idx = 1;     // close-hauled
    else if(theta < 112.5) idx = 2;    // beam reach
    else if(theta < 157.5) idx = 3;    // broad reach
    else idx = 4;                       // running
    if(opts.masterMariner) idx = Math.min(4, idx + 1);
    const b = POINT_OF_SAIL_BANDS[idx];
    return { band:b.key, label:b.label, sailMult:b.sail, progressFraction:b.progress, beating:b.beating, index:idx, angleDeg:Math.round(theta) };
  }

  // (c) Hex axial coord → compass bearing (degrees, N=0° CW). The map is flat-top with
  // HEX_EDGE_DELTAS faces [SE,S,SW,NW,N,NE] = bearings [120,180,240,300,0,60]; this affine
  // axial→cartesian (x east, y north) reproduces those exactly, so a vessel's travel heading
  // can be derived from its route (current hex → next/destination). Returns null for a zero delta.
  function vesselBearingDeg(fromCoord, toCoord){
    if(!fromCoord || !toCoord) return null;
    const dq = (Number(toCoord.q) || 0) - (Number(fromCoord.q) || 0);
    const dr = (Number(toCoord.r) || 0) - (Number(fromCoord.r) || 0);
    if(dq === 0 && dr === 0) return null;
    const east  = (Math.sqrt(3) / 2) * dq;
    const north = (-0.5 * dq) - dr;
    let deg = Math.atan2(east, north) * 180 / Math.PI;   // compass bearing, CW from north
    if(deg < 0) deg += 360;
    return deg;
  }

  // (d) Officer proficiency scan over the canonical PT-0 {key,ranks} shape (also tolerant of a
  // bare-string legacy proficiency). Used to find a master mariner (Seafaring 3 ranks, RR p.315)
  // and a navigator (Navigation, or any Seafaring) aboard.
  function _voyOfficerProfRanks(officer, re){
    const profs = (officer && officer.proficiencies) || [];
    let best = 0;
    for(const p of profs){
      const key = (p && typeof p === 'object') ? String(p.key || p.name || '') : String(p || '');
      if(re.test(key)){
        const r = (p && typeof p === 'object' && typeof p.ranks === 'number') ? p.ranks : 1;
        if(r > best) best = r;
      }
    }
    return best;
  }
  // A master mariner aboard? (RR p.315 — 3 ranks Seafaring). Shifts the point of sail + enables
  // tacking in heavy wind.
  function vesselHasMasterMariner(campaign, vessel){
    const officers = vesselOfficers(campaign, vessel);
    return officers.some(o => _voyOfficerProfRanks(o, /seafaring/i) >= 3);
  }
  // A navigator aboard? (RR p.315 — Navigation, or a master mariner). Gates the 24h sail.
  function vesselHasNavigator(campaign, vessel){
    const officers = vesselOfficers(campaign, vessel);
    return officers.some(o => _voyOfficerProfRanks(o, /navigation/i) >= 1 || _voyOfficerProfRanks(o, /seafaring/i) >= 1);
  }

  // (e) Crew-loss + damage → proportional voyage-speed factor (RR p.322). Damage: speed ∝ SHP
  // remaining. Crew: speed ∝ the manning the chosen propulsion needs (rowers for oar, sailors for
  // sail). RAW: the two are NOT cumulative — use whichever is worse. An UNSET crew complement (all
  // zeros, the blankVessel default) reads as fully manned (the GM hasn't tracked manning → no
  // penalty); only a GM-set partial crew reduces. (Crew-from-Groups reconciliation is a later refinement.)
  function vesselVoyageSpeedFactor(campaign, vessel, propulsion){
    const cls = vesselClass(vessel);
    if(!cls || !vessel) return 1;
    const damageFactor = (cls.shp > 0) ? Math.max(0, Math.min(1, (vessel.shp != null ? vessel.shp : cls.shp) / cls.shp)) : 1;
    const cc = vessel.crewComplement || {};
    const ccSet = (Number(cc.sailors) || 0) + (Number(cc.rowers) || 0) + (Number(cc.marines) || 0) > 0;
    let crewFactor = 1;
    if(ccSet){
      if(propulsion === 'oar' && cls.rowers > 0)      crewFactor = Math.max(0, Math.min(1, (Number(cc.rowers) || 0) / cls.rowers));
      else if(propulsion === 'sail' && cls.sailors > 0) crewFactor = Math.max(0, Math.min(1, (Number(cc.sailors) || 0) / cls.sailors));
    }
    return Math.min(damageFactor, crewFactor);
  }

  // (f) 24-hour open-sea sailing eligibility (RR p.318): a sail-capable vessel with a navigator
  // and a full crew may sail through the night (×2 distance). The GM TOGGLES the choice
  // (journey.continuousSailing); this gates whether the toggle has effect. v2: the "open sea"
  // requirement (distance-from-shore) is deferred to V4's territory classification — here it is
  // sail-capable + navigator + full-or-unset crew.
  function voyageContinuousSailEligible(campaign, journey, vessel){
    const cls = vesselClass(vessel);
    if(!cls || cls.sailFt == null) return false;          // must be able to sail
    if(!vesselHasNavigator(campaign, vessel)) return false;
    const cc = vessel.crewComplement || {};
    const ccSet = (Number(cc.sailors) || 0) + (Number(cc.rowers) || 0) > 0;
    const fullCrew = !ccSet || ((Number(cc.sailors) || 0) >= cls.sailors && (Number(cc.rowers) || 0) >= cls.rowers);
    return fullCrew;
  }

  // (g) voyageDayMiles — the day's voyage distance (miles). The product the journeys day-loop
  // reads as its mile BUDGET (replacing the land base × weather × temperature × pace):
  //   sail: voyageSailMi × windStrength.sail × pointOfSail.sail × progressFraction × crew/damage × pace
  //   oar:  voyageOarMi  × windStrength.oar                                       × crew/damage × pace
  // 'auto' picks the faster available mode; the §26 GM override replaces the wind model as a base
  // rate (× pace still applies). The 24h doubling (×2) lands when continuousSailing is toggled +
  // eligible. opts: { weather, pace, overrideMiles, headingDeg, propulsion }.
  function voyageDayMiles(campaign, journey, vessel, opts){
    opts = opts || {};
    const cls = vesselClass(vessel);
    const A = global.ACKS || ACKS;
    const weather = opts.weather || {};
    const pace = opts.pace || (journey && journey.pace) || 'normal';
    const paceMult = (A.JOURNEY_PACE_SPEED && A.JOURNEY_PACE_SPEED[pace] != null) ? A.JOURNEY_PACE_SPEED[pace] : 1;

    // §26 GM override — a positive miles/day REPLACES the wind/sail model as the base rate
    // (× pace; the sea modifiers do not apply). The escape hatch outranks everything.
    const ov = opts.overrideMiles;
    if(typeof ov === 'number' && isFinite(ov) && ov > 0){
      return { miles: Math.max(0, ov * paceMult), propulsion: 'override', overrideMiles: ov, paceMult,
               windName: weather.wind || null, sailMiles: null, oarMiles: null, crewDamageFactor: 1,
               continuousSailing: false, notes: ['GM speed override (' + ov + ' mi/day base)'] };
    }

    // Wind strength (from the shipped Weather wind axis) — gm-fiat default = Moderate (fair sailing).
    const windName = weather.wind || 'Moderate';
    const ws = windStrengthVoyage(windName);
    // Wind direction (HW-3) + the vessel's heading → point of sail. Missing data → beam-reach neutral.
    const windFromDeg = (typeof weather.windDirection === 'number') ? weather.windDirection : null;
    const headingDeg  = (typeof opts.headingDeg === 'number') ? opts.headingDeg : null;
    const masterMariner = vesselHasMasterMariner(campaign, vessel);
    // Point of sail needs BOTH the heading and the wind direction. When the day's wind DIRECTION is
    // unknown (gm-fiat "fair sailing" weather — no roll), assume a FAVORABLE point of sail (running)
    // so a vessel makes its rated voyage speed (the intuitive default). With a direction known, the
    // real bearing-vs-wind model applies (an unknown heading falls to the function's beam-reach neutral).
    const pos = (windFromDeg == null)
      ? { band:'running', label:'Running', sailMult:1, progressFraction:1, beating:false, index:4, angleDeg:180 }
      : pointOfSail(headingDeg != null ? headingDeg : NaN, windFromDeg, { masterMariner });

    // sail miles
    const sailBase = cls ? cls.voyageSailMi : null;
    let sailMiles = 0;
    if(sailBase != null && ws.sail > 0){
      let sailMult = pos.sailMult, progress = pos.progressFraction;
      if(pos.index <= 1){                                  // beating to windward (close-hauled / into the wind)
        if(ws.tackNeedsMaster && !masterMariner){ sailMult = 0; }            // can't tack in Strong+ wind without a master mariner
        else if(pos.index === 0){ sailMult = POINT_OF_SAIL_BANDS[1].sail; progress = POINT_OF_SAIL_BANDS[1].progress; } // into the wind → tack as close-hauled
      }
      sailMiles = sailBase * ws.sail * sailMult * progress;
    }
    // oar miles (oars ignore wind DIRECTION; only the wind-strength oar multiplier)
    const oarBase = cls ? cls.voyageOarMi : null;
    let oarMiles = 0;
    if(oarBase != null && ws.oar > 0){ oarMiles = oarBase * ws.oar; }

    // propulsion: 'auto' takes the faster available mode; 'sail'/'oar' force it (falling back if absent).
    const canSail = sailBase != null, canOar = oarBase != null;
    let want = opts.propulsion || (journey && journey.propulsion) || 'auto';
    if(want === 'sail' && !canSail) want = 'auto';
    if(want === 'oar'  && !canOar)  want = 'auto';
    let propulsion, rawMiles;
    if(want === 'sail'){ propulsion = 'sail'; rawMiles = sailMiles; }
    else if(want === 'oar'){ propulsion = 'oar'; rawMiles = oarMiles; }
    else if(canSail && (!canOar || sailMiles >= oarMiles)){ propulsion = 'sail'; rawMiles = sailMiles; }
    else { propulsion = 'oar'; rawMiles = oarMiles; }

    // crew + damage reduction (RR p.322), worse of the two.
    const reduction = vesselVoyageSpeedFactor(campaign, vessel, propulsion);
    let miles = Math.max(0, rawMiles) * reduction * paceMult;

    // V3a — weathering the seas (RR pp.321–322): the PRECIPITATION axis (the shipped Weather
    // `condition`, distinct from the wind-strength axis above) slows the vessel — fog ½ for a
    // COASTAL vessel (20' vis; open sea unaffected), snow ½ (rare at sea); rain is nav-only. The
    // §26 override path returns earlier, so an override base rate is NOT weathering-slowed (consistent
    // with V2 — the GM set the exact rate). seaZone reaches here via opts (the tickJourneyDay voyage branch).
    const weatherFx = voyageWeatherEffects(weather.condition, opts.seaZone);
    if(weatherFx.speedMult !== 1) miles = miles * weatherFx.speedMult;

    // 24-hour open-sea sailing (RR p.318) — GM toggle gated on eligibility → ×2.
    const continuous = !!(journey && journey.continuousSailing) && propulsion === 'sail' && voyageContinuousSailEligible(campaign, journey, vessel);
    if(continuous) miles *= 2;

    return {
      miles: Math.max(0, miles), propulsion, paceMult,
      windName, windLabel: ws.label, gale: !!ws.gale,
      weathering: weatherFx.label, weatheringSpeedMult: weatherFx.speedMult,
      windStrengthSailMult: ws.sail, windStrengthOarMult: ws.oar,
      windFromDeg, windDirectionLabel: weather.windDirectionLabel || null, headingDeg,
      pointOfSail: pos.band, pointOfSailLabel: pos.label, pointOfSailMult: pos.sailMult,
      progressFraction: pos.progressFraction, angleDeg: pos.angleDeg, beating: pos.beating,
      masterMariner, sailMiles, oarMiles, crewDamageFactor: reduction, continuousSailing: continuous
    };
  }

  // ===========================================================================
  // V3a — Navigating & weathering the seas (RR pp.320–322). The sea-navigation
  // targets fold into the shipped §27 getting-lost machinery (tickJourneyDay):
  // a lost vessel strays exactly like a lost party (RR p.320 — "being lost at sea
  // is treated as being lost in the wilderness"); the precipitation axis (fog/rain/
  // snow) slows the vessel + raises the navigation difficulty. Nautical hazards +
  // ship stores/scurvy/fishing + gale damage are V3b (they MUTATE vessel/crew state
  // — a separate replay slice). Maritime_Voyages_RAW_Survey.md §5.1c / §7 / §9.
  // ===========================================================================

  // Sea-navigation staying-on-course targets by sea zone (RR p.320). Lake/River are
  // low-risk (you follow the bank/shore — the sea analog of a road); the open sea is hard.
  // A vessel's zone is the GM-set hex.seaZone (lake|river|coast|open-sea); auto-derivation
  // from distance-to-shore is the V4 territory classification — v1 defaults to the forgiving
  // 'coast' (7+), the survey's "coastal navigation gets the easier target" + the common case.
  const SEA_NAV_THROWS = Object.freeze({ lake: 4, river: 4, coast: 7, 'open-sea': 11 });
  function seaZoneForHex(hex){
    const z = hex && hex.seaZone;
    return (z === 'lake' || z === 'river' || z === 'coast' || z === 'open-sea') ? z : 'coast';
  }
  function seaNavTarget(seaZone){ const t = SEA_NAV_THROWS[seaZone]; return (t != null) ? t : SEA_NAV_THROWS.coast; }

  // Weathering the seas (RR pp.321–322): the PRECIPITATION axis (the shipped Weather
  // `condition` — fair|rainy|foggy|snowy|stormy) applies, DISTINCT from the wind-strength
  // axis (V2). Fog slows a COASTAL vessel to ½ + a −4 nav penalty (20' vis, open sea
  // unaffected); rain a −2 nav penalty (½ vis); snow (rare at sea) ½ speed. Stormy = the
  // Gale wind band (V2 owns its speed; the gale-damage tail is V3b). Returns the speed
  // multiplier + the nav-target penalty (a higher target = harder to stay on course).
  function voyageWeatherEffects(weatherCondition, seaZone){
    switch(weatherCondition){
      case 'foggy': return { speedMult: (seaZone === 'coast' ? 0.5 : 1), navTargetPenalty: 4, label: 'fog' };
      case 'rainy': return { speedMult: 1,   navTargetPenalty: 2, label: 'rain' };
      case 'snowy': return { speedMult: 0.5, navTargetPenalty: 0, label: 'snow' };
      default:      return { speedMult: 1,   navTargetPenalty: 0, label: null };
    }
  }

  // A participant carrying Navigation / Pathfinding (the §27 land bonus, scanned over the
  // PT-0 {key,ranks} shape + class powers). At sea this counts toward the crew's nav bonus.
  function _voyParticipantNavBonus(campaign, journey){
    const ids = (journey && journey.participantCharacterIds) || [];
    let hasNav = false, hasPath = false;
    const scan = (e) => { const n = (typeof e === 'string') ? e : ((e && (e.key || e.name || e.label || e.proficiency)) || ''); if(/\bnavigation\b/i.test(n)) hasNav = true; if(/\bpathfinding\b/i.test(n)) hasPath = true; };
    for(const c of ((campaign && campaign.characters) || [])){
      if(!c || ids.indexOf(c.id) < 0) continue;
      for(const p of (c.proficiencies || [])) scan(p);
      for(const cp of (c.classPowers || [])) scan(cp);
    }
    return (hasNav && hasPath) ? 8 : (hasNav || hasPath) ? 4 : 0;
  }
  // The sea-navigation throw bonus (RR p.320 — the same +4/+8 Navigation/Pathfinding the §27
  // land model uses, gated through the Seafaring crew): a navigator aboard → +4, with a master
  // mariner → +8; a participant carrying Navigation/Pathfinding also counts (whichever is larger).
  function seaNavBonus(campaign, journey, vessel){
    const hasNav = vesselHasNavigator(campaign, vessel);
    const hasMaster = vesselHasMasterMariner(campaign, vessel);
    const officerBonus = hasNav ? (hasMaster ? 8 : 4) : (hasMaster ? 4 : 0);
    return Math.max(officerBonus, _voyParticipantNavBonus(campaign, journey));
  }

  // ===========================================================================
  // V3b — Nautical hazards + gale damage (RR pp.319–320). The vessel-STATE-mutating
  // slice: a Seafaring throw on entering a GM-flagged hazard hex (kelp/rock/reef/
  // wreck/seamount/sandbar/shoal/whirlpool), or weathering a gale at sea, either holes
  // the hull (SHP damage, the vessel sails on) or grounds/entangles it (stuck until
  // refloated). MUTATIONS ride the record→commit→revert path (the survival precedent):
  // tickJourneyDay ROLLS + records the absolutes (record.voyageState), commitJourneyRecord
  // APPLIES them (applyVoyageDayState), rerollJourneyDay REVERTS from the _preDay.voyage
  // snapshot. Ship stores / deprivation / scurvy / fishing (the crew-provisioning ladder)
  // layer on this same machinery in V3c. Maritime_Voyages_RAW_Survey.md §7 / §9 / §10.
  // OPT-IN BY DATA: hazards fire only on a GM-set hex.nauticalHazard, gale only on a gale
  // weather day — so every existing voyage (+ the V2/V3a tests) stays byte-unchanged.
  //
  // IP (CLAUDE §13.6): mechanical values only, page-cited. The round-by-round whirlpool
  // (25–40 SHP/round + Paralysis saves, RR p.320) is tactical-sea-combat OUT (survey §15);
  // v1 models a per-day SHP proxy + a stuck flag (the GM resolves the overboard saves).
  // ===========================================================================

  // The nautical-hazard kinds (RR p.320) + the failure effect. effect: 'hull' = pierces the
  // hull (SHP, sails on); 'ground' = runs aground (SHP + stuck until refloated); 'entangle' =
  // kelp (no SHP, stuck until cut free); 'whirlpool' = heavy SHP + stuck. shpDice: the failure
  // damage (½ at ≤½ speed for hull/ground, RR p.320). The full-strength dice are RR p.320's
  // (8d10 rock/reef, 4d10 sandbar/shoal); whirlpool's 6d10 is the v1 per-day proxy for its
  // round-by-round tactical figure.
  const NAUTICAL_HAZARDS = Object.freeze({
    kelp:      Object.freeze({ key:'kelp',      label:'kelp forest', effect:'entangle',  shpDice:null,  page:320 }),
    rock:      Object.freeze({ key:'rock',      label:'rocks',       effect:'hull',      shpDice:'8d10', page:320 }),
    reef:      Object.freeze({ key:'reef',      label:'a reef',      effect:'hull',      shpDice:'8d10', page:320 }),
    wreck:     Object.freeze({ key:'wreck',     label:'a wreck',     effect:'hull',      shpDice:'8d10', page:320 }),
    seamount:  Object.freeze({ key:'seamount',  label:'a seamount',  effect:'hull',      shpDice:'8d10', page:320 }),
    sandbar:   Object.freeze({ key:'sandbar',   label:'a sandbar',   effect:'ground',    shpDice:'4d10', page:320 }),
    shoal:     Object.freeze({ key:'shoal',     label:'a shoal',     effect:'ground',    shpDice:'4d10', page:320 }),
    whirlpool: Object.freeze({ key:'whirlpool', label:'a whirlpool', effect:'whirlpool', shpDice:'6d10', page:320 })
  });
  // A hex's GM-set nautical hazard (a validated hex.nauticalHazard flag, like a road/river edge),
  // or null. The GM flags chokepoints; known/charted routes are sailed around (the hazard map data).
  function nauticalHazardForHex(hex){
    const h = hex && hex.nauticalHazard;
    return (h && NAUTICAL_HAZARDS[h]) || null;
  }

  // Roll a d20-vs-target Seafaring throw through the canonical Layer-1 resolver (PT-6 — the same
  // path rollNavigation / journeyFordingThrow fold onto; nat-1 auto-fails, no nat-20). Returns the
  // legacy {rolled,target,bonus,total,naturalOne,success} shape. Late-bound on ACKS (voyages.js is
  // called BY the tick, so the resolver is present at call time).
  function _voyThrow(target, bonus, rng){
    const A = global.ACKS || ACKS;
    if(typeof A.rollProficiencyThrow === 'function'){
      const r = A.rollProficiencyThrow({ target: target, modifiers: [{ source: 'seafaring', value: bonus || 0 }], autoFailBand: 1, proficient: false, rng: rng || Math.random });
      return { rolled: r.natural, target: target, bonus: bonus || 0, total: r.total, naturalOne: r.natural === 1, success: r.success };
    }
    const nat = 1 + Math.floor((rng || Math.random)() * 20);   // defensive fallback (resolver absent)
    return { rolled: nat, target: target, bonus: bonus || 0, total: nat + (bonus || 0), naturalOne: nat === 1, success: nat !== 1 && (nat + (bonus || 0)) >= target };
  }
  // SHP-damage dice (e.g. '8d10') via the core roller, with a tiny rng-driven fallback. PURE.
  function _voyDamageDice(spec, rng){
    const A = global.ACKS || ACKS;
    if(typeof A._rollDiceStr === 'function') return A._rollDiceStr(spec, rng) || 0;
    const m = /^(\d+)d(\d+)$/.exec(String(spec || '')); if(!m) return 0;
    const n = +m[1], faces = +m[2]; let t = 0; for(let i = 0; i < n; i++) t += 1 + Math.floor((rng || Math.random)() * faces); return t;
  }

  // Roll a nautical-hazard traversal (RR p.320). Seafaring 11+ (7+ master mariner); +4 at ≤½ speed;
  // galley/longship +4 vs sandbar/shoal (shallow draft). On FAILURE: SHP damage (½ at ≤½ speed for
  // hull/ground) and/or the stuck flag (ground/entangle/whirlpool). PURE (rng-driven, no mutation) —
  // the SHP/grounded mutation is applied later via applyVoyageDayState. atHalfSpeed: the vessel is
  // creeping carefully (pace half-speed/halted).
  function rollNauticalHazard(campaign, vessel, hazard, opts){
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const hz = (typeof hazard === 'string') ? NAUTICAL_HAZARDS[hazard] : hazard;
    if(!hz) return null;
    const master = vesselHasMasterMariner(campaign, vessel);
    const target = master ? 7 : 11;
    let bonus = 0;
    if(opts.atHalfSpeed) bonus += 4;
    const ck = (vessel && vessel.catalogKey) || '';
    const shallow = /^galley/.test(ck) || ck === 'longship';
    // Shallow-draft +4 vs sandbar/shoal (the SEA case). V5 suppresses it for the river depth-vs-draft
    // hazard: there the galley's shallow draft is already WHY the hex reads only "within 2′" (not
    // impassable), so granting the +4 again would double-count (Maritime_Voyages_RAW_Survey.md §16).
    if(shallow && !opts.suppressShallowBonus && (hz.key === 'sandbar' || hz.key === 'shoal')) bonus += 4;
    const t = _voyThrow(target, bonus, rng);
    const out = { hazard: hz.key, hazardLabel: hz.label, effect: hz.effect, target: t.target, bonus: bonus,
                  rolled: t.rolled, total: t.total, success: t.success, naturalOne: t.naturalOne, masterMariner: master,
                  atHalfSpeed: !!opts.atHalfSpeed, shpDamage: 0, grounded: null };
    if(!t.success){
      if(hz.shpDice){
        let dmg = _voyDamageDice(hz.shpDice, rng);
        if(opts.atHalfSpeed && (hz.effect === 'hull' || hz.effect === 'ground')) dmg = Math.ceil(dmg / 2);   // ½ at ≤½ speed (RR p.320)
        out.shpDamage = dmg;
      }
      if(hz.effect === 'ground' || hz.effect === 'entangle' || hz.effect === 'whirlpool') out.grounded = hz.key;   // stuck until refloated/cut free
    }
    return out;
  }

  // Roll the gale (RR p.319): a gale day at sea threatens the hull. A Seafaring "ride out the gale"
  // throw (11+, +4 master mariner, nat-1 fails); SUCCESS = beached / rode it out (no damage). FAILURE
  // = caught at sea → 2d8/hour SHP for 1d4 hours exposed (RR p.319; v1 models a partial exposure, not
  // the full 12h — the GM beaches/anchors). PURE. The speed effect of a gale is already V2 (×2/3 or 0).
  function rollVoyageGale(campaign, vessel, opts){
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const master = vesselHasMasterMariner(campaign, vessel);
    const t = _voyThrow(11, master ? 4 : 0, rng);
    const out = { target: t.target, bonus: master ? 4 : 0, rolled: t.rolled, total: t.total, success: t.success, naturalOne: t.naturalOne,
                  masterMariner: master, hoursCaught: 0, shpDamage: 0 };
    if(!t.success){
      const hours = 1 + Math.floor(rng() * 4);                 // 1d4 hours caught at sea
      let dmg = 0; for(let h = 0; h < hours; h++) dmg += _voyDamageDice('2d8', rng);   // 2d8/hour (RR p.319)
      out.hoursCaught = hours; out.shpDamage = dmg;
    }
    return out;
  }

  // Apply the recorded V3b vessel-state absolutes to the campaign (called by commitJourneyRecord —
  // the applyDaySurvival precedent). PURE-ABSOLUTE (no rng — the tick already rolled): writes the
  // vessel's new SHP / condition / grounded flag. A reroll reverts these from _preDay.voyage. Only
  // the three mutated fields are written (no per-day history push, so revert stays a clean restore).
  function applyVoyageDayState(campaign, journey, voyageState){
    if(!campaign || !voyageState || !voyageState.vesselId) return;
    const v = findVessel(campaign, voyageState.vesselId);
    if(!v) return;
    if(typeof voyageState.newShp === 'number') v.shp = voyageState.newShp;                       // V3b — hull
    if(voyageState.newCondition) v.condition = voyageState.newCondition;
    if('newGrounded' in voyageState) v.grounded = voyageState.newGrounded || null;
    // V3c — the crew-provisioning ladder (ship stores / deficit / scurvy). Same replay path as the hull.
    if(typeof voyageState.newShipStores === 'number') v.shipStores = voyageState.newShipStores;
    if(typeof voyageState.newProvisionDeficitDays === 'number') v.provisionDeficitDays = voyageState.newProvisionDeficitDays;
    if(typeof voyageState.newScurvyDays === 'number') v.daysAtSeaWithoutFreshFood = voyageState.newScurvyDays;
    if('newScurvy' in voyageState) v.scurvy = !!voyageState.newScurvy;
  }

  // ===========================================================================
  // V3c — Ship stores + deprivation + scurvy + fishing (RR p.321). The crew-
  // provisioning ladder, layered on the V3b record.voyageState → applyVoyageDayState
  // → _preDay.voyage replay machinery: the day's store consumption / deficit / scurvy
  // counter are recorded as absolutes (computeShipProvisionDay, PURE) and applied on
  // commit, so a reroll reverts. Fishing is a standalone GM verb that replenishes stores.
  // OPT-IN BY DATA: vessel.shipStores must be a number (the GM provisioned the ship); an
  // unprovisioned vessel runs none of this. Gated by the shipped `ignore-rations` opt-out
  // (checked in the tick, the forageActivity precedent). Maritime_Voyages_RAW_Survey §8.
  //
  // 🔧 v1 abstractions: shipStores is in CREW-DAYS (1 consumed/voyage day, headcount-
  // abstracted — the same abstraction the deprivation ladder makes; RR's per-individual
  // "1 st = 6 meals" maps to 1 crew-day/store). The per-PC STR/CON scurvy ABILITY cascade
  // is a Character-Lifecycle-coupled follow-on — v1 ships the vessel-level onset flag +
  // notable + the cure-at-port reset (the GM applies the −1 STR/CON). The starvation morale
  // calamity (mutiny) is surfaced as a flag/notable; the GM resolves it via the shipped
  // loyalty/calamity machinery (§17). No new house rule / event kind / prefix / entity.
  // ===========================================================================

  const SHIP_SCURVY_ONSET_DAYS = 30;     // RR p.321 — one month at sea on iron rations/fish

  // Is the crew-provisioning layer ON for this vessel? Opt-in: shipStores is a number (incl. 0 =
  // tracked, the GM provisioned the ship); absent/null = untracked (no consumption/ladder/scurvy).
  function shipStoresTracked(vessel){ return !!vessel && typeof vessel.shipStores === 'number'; }

  // The deprivation ladder (RR p.321) — mirrors the shipped wilderness food ladder day-thresholds
  // (hungry≥1 grace, underfed≥2, starving≥7) so a crew degrades in lockstep with what the per-
  // character survival would do on land. underfed → ½ voyage speed; starving → ⅓ + a morale calamity.
  function shipDeprivationLevel(deficitDays){
    const d = Number(deficitDays) || 0;
    if(d >= 7) return { level: 'starving', speedMult: 1/3, calamity: true };
    if(d >= 2) return { level: 'underfed', speedMult: 1/2, calamity: false };
    if(d >= 1) return { level: 'hungry',   speedMult: 1,   calamity: false };
    return       { level: 'fed',      speedMult: 1,   calamity: false };
  }

  // A port/landfall hex (fresh food) — a GM-set hex.freshFood flag OR an embedded hex.settlement.
  // At a fresh-food hex the crew eats ashore: the deficit clears, no ship-store is consumed, and
  // scurvy is cured (RR p.321 — fresh food cures scurvy). The sea analog of a settlement's provisioning.
  // T6 single-home — the embedded hex.settlement is read for back-compat; pass `campaign` to resolve
  // the settlement from the canonical campaign.settlements[] (settlementForHex).
  function voyageHexIsFreshFood(hex, campaign){
    if(!hex) return false;
    if(hex.freshFood || hex.settlement) return true;
    return !!(campaign && hex.id && global.ACKS && global.ACKS.settlementForHex && global.ACKS.settlementForHex(campaign, hex.id));
  }

  // PURE — the day's provisioning result for a voyage day (no mutation). The deprivation governing
  // TODAY's speed reads the deficit ENTERING the day (RAW JJ p.70 sequence: starvation is checked
  // before rations); consumption + the scurvy counter produce the new absolutes the commit applies.
  // opts.hex = the day's hex (for the fresh-food/port check); opts.freshFood overrides it.
  function computeShipProvisionDay(campaign, vessel, opts){
    opts = opts || {};
    if(!shipStoresTracked(vessel)) return { tracked: false, deprivation: { level: 'fed', speedMult: 1, calamity: false } };
    const freshFood = !!opts.freshFood || voyageHexIsFreshFood(opts.hex, campaign);
    const curStores = Number(vessel.shipStores) || 0;
    const enteringDeficit = Number(vessel.provisionDeficitDays) || 0;
    const curScurvyDays = Number(vessel.daysAtSeaWithoutFreshFood) || 0;
    const wasScurvy = !!vessel.scurvy;
    const deprivation = shipDeprivationLevel(enteringDeficit);   // governs TODAY's speed
    let newStores, newDeficit, newScurvyDays, newScurvy = wasScurvy, scurvyOnset = false, scurvyCured = false, ate = false;
    if(freshFood){
      newStores = curStores;                 // eat ashore — no ship-store consumed
      newDeficit = 0;                         // reprovisioned / fed at port
      newScurvyDays = 0;                      // fresh food cures scurvy (RR p.321)
      if(wasScurvy){ newScurvy = false; scurvyCured = true; }
    } else {
      if(curStores >= 1){ newStores = curStores - 1; newDeficit = 0; ate = true; }   // ate a ration
      else { newStores = 0; newDeficit = enteringDeficit + 1; }                        // went without → deficit grows
      newScurvyDays = curScurvyDays + 1;                                               // a day at sea on iron rations / fish
      if(!wasScurvy && newScurvyDays >= SHIP_SCURVY_ONSET_DAYS){ newScurvy = true; scurvyOnset = true; }
    }
    const newLevel = shipDeprivationLevel(newDeficit);
    const becameStarving = (newLevel.level === 'starving' && deprivation.level !== 'starving');
    const becameUnderfed = (newLevel.level === 'underfed' && deprivation.level !== 'underfed' && deprivation.level !== 'starving');
    return { tracked: true, freshFood, enteringDeficit, deprivation, newStores, newDeficit,
             newScurvyDays, newScurvy, newLevel, scurvyOnset, scurvyCured, becameStarving, becameUnderfed, ate };
  }

  // Fishing (RR p.321) — a standalone GM provisioning verb (the sea Forage variant). Fishing 14+,
  // +4 if the fisher (an officer, or opts.actorCharacterId) has Survival or Fishing; success = +1
  // store (1 crew-day; RR's "1 st = 6 meals" at crew scale). No nat-1 auto-fail (autoFailBand 0,
  // the forageActivity sibling, RR p.278). MUTATES vessel.shipStores immediately (a GM action,
  // applied on the spot like forageActivity — not part of the tick replay) + logs to vessel.history.
  function fishActivity(campaign, vessel, opts){
    opts = opts || {};
    if(!vessel) return { ok: false, error: 'no-vessel' };
    const A = global.ACKS || ACKS;
    const rng = opts.rng || Math.random;
    let bonus = 0;
    if(opts.actorCharacterId){
      const ch = ((campaign && campaign.characters) || []).find(c => c && c.id === opts.actorCharacterId);
      if(ch && _voyOfficerProfRanks(ch, /survival|fishing/i) >= 1) bonus = 4;
    } else if(vesselOfficers(campaign, vessel).some(o => _voyOfficerProfRanks(o, /survival|fishing/i) >= 1)){
      bonus = 4;
    }
    const fr = (typeof A.rollProficiencyThrow === 'function')
      ? A.rollProficiencyThrow({ target: 14, modifiers: [{ source: 'survival', value: bonus }], autoFailBand: 0, proficient: false, rng: rng })
      : (function(){ const nat = 1 + Math.floor(rng() * 20); return { natural: nat, total: nat + bonus, success: (nat + bonus) >= 14 }; })();
    const out = { ok: true, success: fr.success, rolled: fr.natural, target: 14, bonus: bonus,
                  storesGained: 0, newStores: (typeof vessel.shipStores === 'number') ? vessel.shipStores : 0 };
    if(fr.success){
      const cur = (typeof vessel.shipStores === 'number') ? vessel.shipStores : 0;
      vessel.shipStores = cur + 1;
      out.storesGained = 1; out.newStores = vessel.shipStores;
      (vessel.history = vessel.history || []).push({ turn: (campaign && campaign.currentTurn) || null, type: 'fished',
        narrative: 'The crew fished — +1 day of stores (Survival/Fishing ' + fr.natural + (bonus ? ('+' + bonus) : '') + ' vs 14+).' });
    }
    return out;
  }

  // ===========================================================================
  // V5 — River voyages (RR pp.330–331). Two river-specific bits over the shipped
  // wind model (V2) + the V3b hazard/replay machinery: (1) the river CURRENT — a
  // flat ± mi/day applied after wind (downriver carries, upriver fights); (2) DEPTH
  // vs DRAFT — a too-shallow river hex grounds a deep hull (impassable < draft;
  // within 2′ of draft = a sandbar/shoal-class throw, the shallow-draft bonus
  // suppressed). The current touches only the day's mile budget (no vessel-state
  // mutation → no replay); a depth grounding rides the EXISTING V3b record.voyageState
  // (newGrounded/newShp) → commit applies → reroll reverts. Reuses the shipped §24
  // river-edge cartography conceptually (a river voyage travels ALONG the river; the
  // depth check is the new per-hex bit). Maritime_Voyages_RAW_Survey.md §16.
  // OPT-IN BY DATA: the current fires only on a GM-set journey.riverCurrent on a river
  // zone; the depth check only on a GM-set hex.riverDepth → existing voyages are byte-
  // unchanged. No new house rule / event kind / prefix / entity; no save migration
  // (journey.riverCurrent + hex.riverDepth are defensive-read, not on the factories —
  // the journey.tradeRoute / hex.seaZone / hex.nauticalHazard precedent).
  // ===========================================================================

  // River current speed → a flat voyage-speed modifier in miles/day, applied AFTER the
  // wind model (RR p.331; ±1..±8 hexes/day at 6 mi/hex). Applies to both sail and oar.
  const RIVER_CURRENT_SPEED = Object.freeze({ placid:6, gentle:12, slow:18, moderate:24, swift:36, rapid:48 });

  // The signed current modifier (mi/day) for a journey on a river: DOWNRIVER adds (the
  // river carries the hull), UPRIVER subtracts (it fights the flow). Reads a GM-set
  // journey.riverCurrent = { speed:'placid'..'rapid', heading:'downriver'|'upriver' }
  // (opts.riverCurrent overrides). No current set / unknown speed → mi 0 (no effect).
  // Heading defaults to 'downriver' (the common case — going with the flow).
  function riverCurrentModifierMi(journey, opts){
    opts = opts || {};
    const rc = opts.riverCurrent || (journey && journey.riverCurrent) || null;
    if(!rc) return { mi:0, speed:null, heading:null, label:null };
    const speed = String(rc.speed || '').toLowerCase();
    const base = RIVER_CURRENT_SPEED[speed];
    if(base == null) return { mi:0, speed:null, heading:null, label:null };
    const heading = (rc.heading === 'upriver') ? 'upriver' : 'downriver';
    const sign = (heading === 'upriver') ? -1 : 1;
    return { mi: sign * base, speed, heading,
             label: (heading === 'downriver' ? '+' : '−') + base + ' mi (' + speed + ', ' + heading + ')' };
  }

  // River depth vs the vessel's draft (RR p.331 + the per-class draft table): depth ≥ draft+2′ = safe;
  // depth < draft = IMPASSABLE (the hull can go no further); draft ≤ depth < draft+2′ = SHALLOW (treat
  // the hex as a sandbar/shoal hazard). Reads a GM-set hex.riverDepth (feet); an UNAUTHORED depth →
  // 'unknown' (treated as safe — opt-in by data, so a river lane with no depths set is byte-unchanged).
  function riverDepthClearance(vessel, hex){
    const draft = vesselDraftFt(vessel);
    const depth = (hex && typeof hex.riverDepth === 'number') ? hex.riverDepth : null;
    if(draft == null || depth == null) return { status: 'unknown', depthFt: depth, draftFt: draft };
    if(depth < draft)     return { status: 'impassable', depthFt: depth, draftFt: draft };
    if(depth < draft + 2) return { status: 'shallow',     depthFt: depth, draftFt: draft };
    return                        { status: 'safe',        depthFt: depth, draftFt: draft };
  }

  // ===========================================================================
  // SEAMS — the deferred cross-subsystem hooks (Phase_3_Voyages_Plan.md §73 deferred
  // list: "Vessel-Construction-Project materialization → Construction Wave D; marines-
  // as-Group binding → Military; port-hex repair sites"). All three self-register from
  // THIS module (the §15.5 convention) — NO acks-engine.js / events.js edit. Seams (1)+(3)
  // auto-fire via ONE self-registered day-tick consumer ('voyages'); (1) is also exported
  // (onVesselConstructed) for a direct UI / future Construction-Wave-D events.js call (the
  // onDungeonConstructed dual-use precedent). IP (CLAUDE §13.6): mechanical, page-cited, no prose.
  // ===========================================================================

  // ── SEAM 2 — marines-as-Group binding (RR p.315; the V1 crew pattern) ───────
  // Marines are the vessel's carried FOOT-TROOPS (the Military seam — boarding/landing
  // fighters, distinct from the sailors/rowers who work the ship). They bind as Groups via
  // the vessel-side marineGroupIds array, exactly like crewGroupIds binds the counted crew
  // (Architecture §3.3 — the reverse index is computed, no field on Group). Parallel to
  // vesselCrewGroups / vesselCrewGroups's resolver.
  function vesselMarineGroups(campaign, vessel){
    if(!campaign || !vessel) return [];
    const groups = (campaign.groups) || [];
    return (vessel.marineGroupIds || []).map(id => groups.find(g => g && g.id === id)).filter(Boolean);
  }
  // The vessel's embarked marine headcount (sum of bound Groups' ACTIVE strength). Distinct
  // from crewComplement.marines (the manning target/number the GM tracks); this reads the real
  // bound foot-troops. groupActiveCount = count − casualties (late-bound, with a fallback).
  function vesselMarineCount(campaign, vessel){
    const A = global.ACKS || ACKS;
    const active = (g) => (typeof A.groupActiveCount === 'function') ? A.groupActiveCount(g) : Math.max(0, ((g && g.count) || 0) - ((g && g.casualties) || 0));
    return vesselMarineGroups(campaign, vessel).reduce((s, g) => s + active(g), 0);
  }
  // Bind an existing foot-troop Group to the vessel as marines (idempotent).
  function bindMarineGroup(campaign, vessel, groupId){
    if(!vessel || !groupId) return false;
    if(!Array.isArray(vessel.marineGroupIds)) vessel.marineGroupIds = [];
    if(vessel.marineGroupIds.indexOf(groupId) >= 0) return false;
    vessel.marineGroupIds.push(groupId);
    return true;
  }
  // Unbind a marine Group from the vessel (disembark; the Group survives in campaign.groups).
  function unbindMarineGroup(campaign, vessel, groupId){
    if(!vessel || !Array.isArray(vessel.marineGroupIds)) return false;
    const i = vessel.marineGroupIds.indexOf(groupId);
    if(i < 0) return false;
    vessel.marineGroupIds.splice(i, 1);
    return true;
  }
  // Embark marines = create a foot-troop Group (the Military seam) bound to the vessel + placed
  // at its hex, and bump the crewComplement.marines manning count. Returns the Group (or null if
  // the Group factory is absent). opts: { count, name, commanderCharacterId, monsterCatalogKey,
  // creatureTypes, hitDice, troopTypeKey, socialTier }. Init-on-writes campaign.groups (the
  // createVessel pattern; there is no createGroup setter).
  function embarkMarines(campaign, vessel, opts){
    if(!campaign || !vessel) return null;
    const A = global.ACKS || ACKS;
    if(typeof A.blankGroup !== 'function') return null;     // Group factory not loaded — caller falls back
    opts = opts || {};
    const g = A.blankGroup({
      name: opts.name || ((vessel.name || vesselClassLabel(vessel.catalogKey) || 'Vessel') + ' marines'),
      count: Math.max(0, Number(opts.count) || 0),
      socialTier: opts.socialTier || 'mercenary',
      lifecycleState: 'active',
      currentHexId: vessel.currentHexId || null,
      commanderCharacterId: opts.commanderCharacterId || null,
      groupTemplate: {
        monsterCatalogKey: opts.monsterCatalogKey || null,
        creatureTypes: Array.isArray(opts.creatureTypes) ? opts.creatureTypes.slice() : ['humanoid'],
        hitDice: opts.hitDice || null,
        troopTypeKey: opts.troopTypeKey || null
      }
    });
    if(!Array.isArray(campaign.groups)) campaign.groups = [];
    campaign.groups.push(g);
    bindMarineGroup(campaign, vessel, g.id);
    const cc = vessel.crewComplement || (vessel.crewComplement = { sailors:0, rowers:0, marines:0 });
    cc.marines = (Number(cc.marines) || 0) + (Number(opts.count) || 0);
    return g;
  }

  // ── SEAM 1 — Vessel-as-Construction-Project (RR p.177; the onDungeonConstructed precedent) ──
  // A completed kind:'vessel' Construction Project MINTS a Vessel (a vsl-), the way a kind:'dungeon'
  // Project mints a dun- (onDungeonConstructed). Reads the shipped Project: constructibleSubtype = the
  // VESSEL_CATALOG class key (blankProject's own example is 'galley-2-rower'); name / owner / site flow
  // onto the Vessel. Idempotent — proj.vesselId is BOTH the dedup marker and the Project→Vessel link
  // (a second call returns the existing Vessel). Exported, so the UI (a "launch completed vessel" action)
  // or a future Construction-Wave-D events.js hook can call it directly; the 'voyages' day-tick consumer
  // calls it automatically when a vessel Project reaches lifecycleState:'complete'.
  function onVesselConstructed(campaign, proj, opts){
    opts = opts || {};
    if(!campaign || !proj) return null;
    if(proj.constructibleKind !== 'vessel') return null;             // not a vessel project
    if(proj.vesselId){ return findVessel(campaign, proj.vesselId); } // already launched (idempotent)
    const catalogKey = isVesselClass(proj.constructibleSubtype) ? proj.constructibleSubtype : '';
    const name = proj.name || vesselClassLabel(catalogKey) || 'New Vessel';
    const v = createVessel(campaign, {
      name: name,
      catalogKey: catalogKey,
      ownerId: proj.ownerCharacterId || proj.ownerDomainId || null,   // polymorphic — vesselOwner resolves char-or-domain
      currentHexId: proj.siteHexId || null,
      constructionState: 'complete',
      createdAtTurn: (campaign.currentTurn != null) ? campaign.currentTurn : null
    });
    proj.vesselId = v.id;                                             // link + idempotency marker
    (v.history = v.history || []).push({ turn: (campaign.currentTurn) || null, type: 'launched',
      narrative: 'Launched from construction (project ' + proj.id + ').' });
    return v;
  }

  // ── SEAM 3 — Port-repair sites (RR p.322; dock repair restores SHP over time) ──
  // RR p.322: SHP can't be HEALED but can be REPAIRED — 5 crew × 1 turn per SHP, only ½ of at-sea
  // damage is repairable at sea (the rest needs a dock). This seam is the DOCK case: a damaged vessel
  // laid up at a port (a settlement hex) mends back to its class SHP over the day-tick. (At-sea
  // half-repair is a V3-layer refinement — not here.)

  // The friendly port the vessel can dock-repair at: its current hex bears a settlement (the dock).
  // Returns { hexId, settlementId, settlementName, friendly } or null. 🔧 v1: friendliness is
  // permissive — any settlement hex is a usable dock (no hostility model exists; the GM moves the
  // vessel away to stop repair); `friendly` is best-effort true (a hostile-port gate is a refinement).
  function vesselPortRepairSite(campaign, vessel){
    if(!campaign || !vessel || !vessel.currentHexId) return null;
    const A = global.ACKS || ACKS;
    const settlement = (typeof A.settlementForHex === 'function') ? A.settlementForHex(campaign, vessel.currentHexId) : null;
    if(!settlement) return null;
    return { hexId: vessel.currentHexId, settlementId: settlement.id || null,
             settlementName: settlement.name || settlement.label || 'port', friendly: true };
  }

  // SHP restored per day of dock repair (RR p.322 — repair = 5 crew × 1 turn per SHP). 🔧 v1 abstraction:
  // RAW's per-TURN rate (which would mend most hulls in a single day's frantic labour) is applied per DAY
  // of laid-up dock work — a conservative downtime rate of floor(repairCrew / 5) SHP/day (min 1), where
  // repairCrew = the vessel's tracked sailors+rowers (or the catalog full sailors+rowers when manning is
  // untracked). A shipwright officer aboard doubles it (dock expertise). The GM can run a multi-day tick
  // to mend faster. (RAW's per-turn rate is reachable later if a finer repair clock is wanted.)
  function vesselPortRepairPerDay(campaign, vessel){
    const cls = vesselClass(vessel); if(!cls) return 0;
    const cc = (vessel && vessel.crewComplement) || {};
    const ccSet = (Number(cc.sailors) || 0) + (Number(cc.rowers) || 0) > 0;
    const crew = ccSet ? ((Number(cc.sailors) || 0) + (Number(cc.rowers) || 0)) : (cls.sailors + cls.rowers);
    let rate = Math.max(1, Math.floor(crew / 5));
    if(vesselOfficers(campaign, vessel).some(o => _voyOfficerProfRanks(o, /shipwright/i) >= 1)) rate *= 2;
    return rate;
  }

  // ── The owner as a related-entity descriptor (for the audit event context envelope) ──
  function _vesselOwnerRelated(campaign, vessel){
    const o = vesselOwner(campaign, vessel);
    if(o && o.kind === 'character') return [{ kind: 'character', id: o.entity.id, role: 'owner' }];
    if(o && o.kind === 'domain')    return [{ kind: 'domain',    id: o.entity.id, role: 'owner' }];
    return [];
  }

  // Record-only audit emit (mirror religion/_recordReligionEvent + sanctums/_recordArcaneEvent): the verb
  // already applied state; this just writes a well-formed audit entry into the eventLog with the §3.5
  // context envelope. applyEvent_voyageAudit (registered below) keeps it well-formed on replay.
  function _recordVoyageEvent(campaign, kind, payload, opts){
    const A = global.ACKS || ACKS;
    opts = opts || {};
    if(!campaign || typeof A.newEvent !== 'function') return null;
    const cal = (campaign.calendar) || {};
    let ev;
    try {
      ev = A.newEvent(kind, {
        submittedBy: 'engine', cadence: opts.cadence || 'daily', targetTurn: (campaign.currentTurn) || 1,
        gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: (campaign.currentDayInMonth) || 1 },
        payload: Object.assign({ narrative: opts.narrative }, payload || {})
      });
    } catch(_e){ return null; }
    if(typeof A.setEventContext === 'function'){
      A.setEventContext(ev, { primaryHexId: opts.primaryHexId || null, settlementId: opts.settlementId || null, domainId: opts.domainId || null, relatedEntities: opts.relatedEntities || [] });
    }
    if(opts.campaignLogHidden) ev.campaignLogHidden = true;
    ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
    ev.appliedAtTurn = (campaign.currentTurn) || 1;
    ev.appliedAtDay = (campaign.currentDayInMonth) || 1;
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: opts.narrative || (kind + ' applied') },
      appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString(),
      ...(opts.campaignLogHidden ? { campaignLogHidden: true } : {}) });
    return ev;
  }

  // Record-only audit handler for the 2 voyage event kinds (the verbs above already applied state; this
  // keeps the event well-formed on replay — the applyEvent_arcaneAudit precedent). Registered below.
  function applyEvent_voyageAudit(campaign, event){
    const p = (event && event.payload) || {};
    return { result: { narrativeSummary: p.narrative || (event && event.kind) || 'voyage event' } };
  }

  // ── The 'voyages' day-tick consumer (auto-fires SEAM 1 launch + SEAM 3 repair) ──
  // PURE peek (propose) → commit, the levy-muster / construction precedent. Launch records carry
  // vesselProjectId (NOT projectId — so _mergeDayRecords passes them through, never merging them into
  // a construction summary); repair records carry vesselId + the day's SHP delta. Routine (no
  // pauseTriggers — launching/mending never halts the clock; the GM may still reject a record in the
  // review). order 53 (after construction's 50); name-keyed (DAY_CONSUMERS is keyed by name, so this
  // never collides with another lane's slot regardless of order). 🔧 Completion is detected by
  // lifecycleState:'complete' (set by BOTH commitConstructionRecord AND applyEvent_constructionCompleted),
  // so a vessel Project finished by either path launches; a same-day completion launches on the NEXT
  // day-tick (the work-clone commits construction's completion only after that day's full pass — a
  // 1-day lag, absorbed within a multi-day Advance-Month).
  function proposeVoyagesDay(campaign, ctx){
    const out = { pendingRecords: [], notableEvents: [], encounters: [] };
    if(!campaign) return out;
    // SEAM 1 — launch completed-but-unmaterialized vessel Projects.
    for(const proj of (campaign.projects || [])){
      if(!proj || proj.constructibleKind !== 'vessel') continue;
      if(proj.lifecycleState !== 'complete') continue;
      if(proj.vesselId) continue;                                   // already launched (idempotent)
      const label = proj.name || vesselClassLabel(proj.constructibleSubtype) || 'A new vessel';
      out.pendingRecords.push({ kind: 'vessel-launch', vesselProjectId: proj.id });
      out.notableEvents.push({ kind: 'gm-narrative', type: 'vessel-launch', transient: true,
        primaryHexId: proj.siteHexId || null,
        label: '🚢 ' + label + ' is launched (construction complete).', payload: { projectId: proj.id } });
    }
    // SEAM 3 — dock-repair damaged vessels laid up at a port.
    for(const v of _vessels(campaign)){
      if(!v || v.grounded) continue;                                // a grounded/wrecked hull can't dock-repair until refloated
      const cls = vesselClass(v);
      if(!cls || cls.shp <= 0) continue;
      const cur = (v.shp != null) ? v.shp : cls.shp;
      if(cur >= cls.shp) continue;                                  // fully sound
      const site = vesselPortRepairSite(campaign, v);
      if(!site) continue;                                           // not at a port
      const amount = Math.min(vesselPortRepairPerDay(campaign, v), cls.shp - cur);
      if(amount <= 0) continue;
      out.pendingRecords.push({ kind: 'vessel-repair', vesselId: v.id, repairAmount: amount });
      out.notableEvents.push({ kind: 'gm-narrative', type: 'vessel-repair', transient: true,
        primaryHexId: v.currentHexId || null,
        label: '🔧 ' + (v.name || vesselClassLabel(v.catalogKey) || 'A vessel') + ' repairs +' + amount + ' SHP at ' + site.settlementName + ' (' + (cur + amount) + '/' + cls.shp + ').',
        payload: { vesselId: v.id } });
    }
    return out;
  }
  function commitVoyagesRecord(campaign, record){
    if(!campaign || !record) return;
    if(record.kind === 'vessel-launch'){
      const proj = (campaign.projects || []).find(p => p && p.id === record.vesselProjectId);
      if(!proj || proj.vesselId) return;                           // gone or already launched
      const v = onVesselConstructed(campaign, proj);
      if(v) _recordVoyageEvent(campaign, 'vessel-launched',
        { vesselId: v.id, projectId: proj.id, catalogKey: v.catalogKey },
        { narrative: '🚢 ' + (v.name || vesselClassLabel(v.catalogKey) || 'A vessel') + ' launched (construction complete, ' + ((v.shp) || 0) + ' SHP).',
          primaryHexId: v.currentHexId || null,
          relatedEntities: [{ kind: 'vessel', id: v.id, role: 'subject' }].concat(_vesselOwnerRelated(campaign, v)) });
      return;
    }
    if(record.kind === 'vessel-repair'){
      const v = findVessel(campaign, record.vesselId);
      const cls = vesselClass(v);
      if(!v || !cls) return;
      const cur = (v.shp != null) ? v.shp : cls.shp;
      const amount = Math.min(Math.max(0, Number(record.repairAmount) || 0), cls.shp - cur);   // re-cap defensively
      if(amount <= 0) return;
      v.shp = cur + amount;
      const full = (v.shp >= cls.shp);
      if(full && v.condition === 'damaged') v.condition = 'seaworthy';   // fully mended
      (v.history = v.history || []).push({ turn: (campaign.currentTurn) || null, type: 'repaired',
        narrative: 'Repaired +' + amount + ' SHP at port (' + v.shp + '/' + cls.shp + ').' });
      _recordVoyageEvent(campaign, 'vessel-repaired',
        { vesselId: v.id, shpRestored: amount, shp: v.shp },
        { narrative: '🔧 ' + (v.name || vesselClassLabel(v.catalogKey) || 'A vessel') + ' repaired +' + amount + ' SHP (' + v.shp + '/' + cls.shp + ')' + (full ? ' — fully mended.' : '.'),
          primaryHexId: v.currentHexId || null,
          campaignLogHidden: !full,                                 // routine in-progress repair stays out of the Campaign Log; the full-mend lands
          relatedEntities: [{ kind: 'vessel', id: v.id, role: 'subject' }] });
      return;
    }
  }

  // Self-register the 2 record-only audit event kinds (PR #89 kernel — from THIS module, no events.js edit).
  (function _registerVoyageEventKinds(){
    const A = global.ACKS || ACKS;
    if(typeof A.registerEventKind !== 'function') return;
    A.registerEventKind('vessel-launched', {
      schema: { R: { vesselId: 'string' }, O: { projectId: 'string', catalogKey: 'string', narrative: 'string' } },
      wizardOptOut: true, handler: applyEvent_voyageAudit });
    A.registerEventKind('vessel-repaired', {
      schema: { R: { vesselId: 'string' }, O: { shpRestored: 'number', shp: 'number', narrative: 'string' } },
      wizardOptOut: true, handler: applyEvent_voyageAudit });
  })();
  // Self-register the 'voyages' day-tick consumer.
  if(global.ACKS && typeof global.ACKS.registerDayConsumer === 'function'){
    global.ACKS.registerDayConsumer('voyages', { handler: proposeVoyagesDay, order: 53, pauseTriggers: [], commit: commitVoyagesRecord });
  }

  // ── Export onto window.ACKS ──
  Object.assign(ACKS, {
    VESSEL_CATALOG,
    findVesselClass, vesselClassKeys, vesselCatalogList, isVesselClass, vesselClassLabel,
    blankVessel, createVessel,
    findVessel, vesselsOwnedBy, vesselsAtHex, vesselForJourney, journeysForVessel,
    vesselClass, vesselOwner, vesselCrewGroups, vesselOfficers, vesselHold, ensureVesselHold,
    vesselCargoCapacitySt, vesselFullCrew, vesselDraftFt, vesselBaseVoyageSpeedMi, vesselIsDamaged,
    // V2 — the wind + sailing-speed model
    WIND_STRENGTH_VOYAGE, POINT_OF_SAIL_BANDS, windStrengthVoyage, pointOfSail, vesselBearingDeg,
    vesselHasMasterMariner, vesselHasNavigator, vesselVoyageSpeedFactor, voyageContinuousSailEligible,
    voyageDayMiles,
    // V3a — navigating & weathering the seas
    SEA_NAV_THROWS, seaZoneForHex, seaNavTarget, voyageWeatherEffects, seaNavBonus,
    // V3b — nautical hazards + gale damage (the SHP-mutating replay slice)
    NAUTICAL_HAZARDS, nauticalHazardForHex, rollNauticalHazard, rollVoyageGale, applyVoyageDayState,
    // V3c — ship stores + deprivation + scurvy + fishing (the crew-provisioning ladder)
    SHIP_SCURVY_ONSET_DAYS, shipStoresTracked, shipDeprivationLevel, voyageHexIsFreshFood, computeShipProvisionDay, fishActivity,
    // V5 — river voyages (current + depth-vs-draft)
    RIVER_CURRENT_SPEED, riverCurrentModifierMi, riverDepthClearance,
    // SEAMS — the deferred cross-subsystem hooks
    // (2) marines-as-Group binding
    vesselMarineGroups, vesselMarineCount, bindMarineGroup, unbindMarineGroup, embarkMarines,
    // (1) Vessel-as-Construction-Project (also auto-fired by the 'voyages' day-tick consumer)
    onVesselConstructed,
    // (3) port-repair sites
    vesselPortRepairSite, vesselPortRepairPerDay,
    // the day-tick consumer + audit emit (registered above at load)
    proposeVoyagesDay, commitVoyagesRecord
  });

})(typeof window !== 'undefined' ? window : global);
