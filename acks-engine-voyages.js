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
      crewGroupIds: Array.isArray(opts.crewGroupIds) ? opts.crewGroupIds.slice() : [],            // counted crew → campaign.groups[]
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

  // ── Export onto window.ACKS ──
  Object.assign(ACKS, {
    VESSEL_CATALOG,
    findVesselClass, vesselClassKeys, vesselCatalogList, isVesselClass, vesselClassLabel,
    blankVessel, createVessel,
    findVessel, vesselsOwnedBy, vesselsAtHex, vesselForJourney, journeysForVessel,
    vesselClass, vesselOwner, vesselCrewGroups, vesselOfficers, vesselHold, ensureVesselHold,
    vesselCargoCapacitySt, vesselFullCrew, vesselDraftFt, vesselBaseVoyageSpeedMi, vesselIsDamaged
  });

})(typeof window !== 'undefined' ? window : global);
