/* =============================================================================
 * acks-engine-construction.js — Phase 4 Construction, Wave D (vessels / war machines)
 * =============================================================================
 * b13 team session, lane agent-1 (2026-06-21). The home for Wave-D's new code — and the
 * first step of extracting Construction into its own module (a forward win; the Project /
 * Constructible model + the Wizard engine + the day-tick consumer still live in
 * acks-engine.js, late-bound here).
 *
 * Doctrine: Architecture.md §10 (Project + Constructible + the Construction Wizard); the
 * wave plan, Phase_4_Construction_Plan.md (Wave D, §3); RAW cites, Construction_RAW_Survey.md.
 * RR pp.136–137 (War Machines + Siege Engines tables), RR p.174 (the construction-rate model:
 * cost paid by worker construction-rates; the shipped CONSTRUCTION_CF_PER_GP = 30 model serves
 * vessels + war machines unchanged), RR pp.316/176–177 (vessels).
 *
 * WHAT THIS LANE DELIVERS:
 *   • VESSELS — a kind:'vessel' Construction Project completes → the SHIPPED voyages seam
 *     (onVesselConstructed + the 'voyages' day-tick consumer, burst12) mints a real Vessel.
 *     This lane adds the construction SIDE: the Wizard authors a vessel Project with the right
 *     VESSEL_CATALOG class + cost (vesselConstructionCatalog / vesselConstructionCost). No new
 *     code is needed for the materialization — voyages owns it.
 *   • WAR MACHINES — a kind:'war-machine' Construction Project completes → materializeWaveD-
 *     Constructible (called from the shipped commitConstructionRecord on completion — no new
 *     day-tick slot) mints a kind:'war-machine' Constructible keyed to match the SHIPPED siege
 *     tables (acks-engine-sieges.js SIEGE_BONUS_UNITS / SIEGE_BOMBARDMENT), and emits the
 *     record-only war-machine-built audit event (self-registered via registerEventKind — the
 *     PR #89 kernel; no acks-engine-events.js edit).
 *   • THE SIEGE FEED — warMachinesForOwner / warMachineSiegeContribution + the bonus/bombardment
 *     bridges turn a besieger's built war machines into the artilleryMap the SHIPPED siege
 *     resolver consumes (Military W6 reads these instead of re-implementing construction).
 *
 * WHY commitConstructionRecord (not a new consumer): the shipped day-tick (emitDayTickEvents)
 * LOGS construction-completed but never applyEvent()s it, so the generic events.js mint never
 * fires on the Day Clock — only commitConstructionRecord runs (it's what flips a Project to
 * 'complete'). The war-machine mint hooks there. (Vessels already work end-to-end because the
 * voyages consumer keys off lifecycleState:'complete', not the event.)
 *
 * DEFERRED (documented follow-on — Phase_4_Construction_Plan.md §3 "siege-support" block):
 *   circumvallation rings (RR p.474), war-machine field (dis)assembly (RR p.449), and the
 *   siege-hijinks smuggling/sabotage hooks (RR pp.474–475). The siege math for these already
 *   lives in acks-engine-sieges.js (circumvallationCostGp / blockadeUnitsAfterCircumvallation);
 *   what remains is the Construction-Project side. Not built this slice (scope honesty — vessels
 *   + war machines are the coherent core). The reserved siege-construction-built event is NOT
 *   registered (no inert event kinds).
 *
 * Loads after the core it late-binds (acks-engine.js / -entities / -events / -voyages / -sieges).
 * Every cross-module reference resolves global.ACKS at CALL time (the harness loads engine
 * modules in a different order than index.html — late-binding makes load order irrelevant).
 * IP (CLAUDE §13.6): mechanical values + page cites only, no rulebook prose.
 * ========================================================================== */
(function(global){
  'use strict';
  const ACKS = global.ACKS = global.ACKS || {};

  // ── WAR_MACHINE_CATALOG (immutable reference data — RR pp.136–137) ──────────
  // The buildable war machines. `key` matches the SHIPPED siege keys (acks-engine-sieges.js
  // SIEGE_BONUS_UNITS / SIEGE_BOMBARDMENT) for every machine the Sieges-Simplified bonus table
  // scores, so a built kind:'war-machine' Constructible feeds a siege directly by subtype.
  //   costGp   — RR build cost (= the construction cost; built at CONSTRUCTION_CF_PER_GP rate)
  //   category — 'artillery' (bombards + assault bonus) | 'engine' (assault equipment)
  //   shp      — the weapon's own structural hit points (RR p.136 artillery table; null for the
  //              siege-engine rows, which RR doesn't give an SHP for)
  //   siegeScored — false for the 3 RAW machines NOT in the Sieges-Simplified bonus table
  //              (light-repeating-ballista / heavy-harpoon-ballista / fire-bearing-siphon —
  //              specialist/naval); they're buildable + real, but contribute 0 siege bonus.
  const WAR_MACHINE_CATALOG = [
    // Artillery (RR p.136)
    { key:'light-ballista',           label:'Ballista, Light',           costGp:40,    category:'artillery', shp:1,    siegeScored:true,  page:136 },
    { key:'light-repeating-ballista', label:'Ballista, Light Repeating', costGp:200,   category:'artillery', shp:1,    siegeScored:false, page:136, note:'rapid-fire; not in the Sieges-Simplified bonus table' },
    { key:'medium-ballista',          label:'Ballista, Medium',          costGp:80,    category:'artillery', shp:1,    siegeScored:true,  page:136 },
    { key:'heavy-ballista',           label:'Ballista, Heavy',           costGp:180,   category:'artillery', shp:2,    siegeScored:true,  page:136 },
    { key:'heavy-harpoon-ballista',   label:'Ballista, Heavy Harpoon',   costGp:250,   category:'artillery', shp:2,    siegeScored:false, page:136, note:'grappling/naval; not in the Sieges-Simplified bonus table' },
    { key:'light-catapult',           label:'Catapult, Light',           costGp:100,   category:'artillery', shp:1,    siegeScored:true,  page:136 },
    { key:'medium-catapult',          label:'Catapult, Medium',          costGp:200,   category:'artillery', shp:1,    siegeScored:true,  page:136 },
    { key:'heavy-catapult',           label:'Catapult, Heavy',           costGp:400,   category:'artillery', shp:2,    siegeScored:true,  page:136 },
    { key:'fire-bearing-siphon',      label:'Fire-Bearing Siphon',       costGp:2500,  category:'artillery', shp:1,    siegeScored:false, page:136, note:'anti-personnel/naval flame; not in the Sieges-Simplified bonus table' },
    { key:'light-trebuchet',          label:'Trebuchet, Light',          costGp:600,   category:'artillery', shp:3,    siegeScored:true,  page:137 },
    { key:'medium-trebuchet',         label:'Trebuchet, Medium',         costGp:1200,  category:'artillery', shp:6,    siegeScored:true,  page:137 },
    { key:'heavy-trebuchet',          label:'Trebuchet, Heavy',          costGp:2500,  category:'artillery', shp:12,   siegeScored:true,  page:137 },
    // Siege engines (RR p.137)
    { key:'ram',                      label:'Battering Ram / Screw',     costGp:200,   category:'engine',    shp:null, siegeScored:true,  page:137 },
    { key:'hoist',                    label:'Hoist',                     costGp:300,   category:'engine',    shp:null, siegeScored:true,  page:137 },
    { key:'siege-tower-standard',     label:'Siege Tower, Standard',     costGp:2500,  category:'engine',    shp:null, siegeScored:true,  page:137 },
    { key:'siege-tower-large',        label:'Siege Tower, Large',        costGp:10000, category:'engine',    shp:null, siegeScored:true,  page:137 },
    { key:'siege-tower-huge',         label:'Siege Tower, Huge',         costGp:40000, category:'engine',    shp:null, siegeScored:true,  page:137 }
  ].map(Object.freeze);
  Object.freeze(WAR_MACHINE_CATALOG);

  const WAR_MACHINE_BY_KEY = {};
  for(const m of WAR_MACHINE_CATALOG){ WAR_MACHINE_BY_KEY[m.key] = m; }

  // ── catalog lookups ─────────────────────────────────────────────────────────
  function findWarMachineClass(key){ return (key && WAR_MACHINE_BY_KEY[key]) || null; }
  function isWarMachineClass(key){ return !!findWarMachineClass(key); }
  function warMachineCatalogList(){ return WAR_MACHINE_CATALOG.slice(); }   // defensive copy
  function warMachineClassKeys(){ return WAR_MACHINE_CATALOG.map(m => m.key); }
  function warMachineLabel(key){ const m = findWarMachineClass(key); return m ? m.label : (key || ''); }
  function warMachineCostGp(key){ const m = findWarMachineClass(key); return m ? m.costGp : 0; }

  // ── vessel construction — the construction SIDE of the shipped voyages seam ──
  // The materialization (Project → Vessel) is voyages's onVesselConstructed + its day-tick
  // consumer; this just hands the Wizard the VESSEL_CATALOG cost so a vessel Project is costed
  // by class. Late-bound (voyages may load after this module in the test harness).
  function vesselConstructionCatalog(){
    const A = global.ACKS || ACKS;
    return (typeof A.vesselCatalogList === 'function') ? A.vesselCatalogList()
         : ((A.VESSEL_CATALOG) || []).slice();
  }
  function vesselConstructionCost(catalogKey){
    const A = global.ACKS || ACKS;
    const cls = (typeof A.findVesselClass === 'function') ? A.findVesselClass(catalogKey) : null;
    return cls ? (cls.costGp || 0) : 0;
  }

  // ── war-machine completion → a Constructible (called from commitConstructionRecord) ──
  // The shipped day-tick LOGS construction-completed but never applyEvent()s it, so the generic
  // events.js mint never fires on the Day Clock. This is the war-machine materializer (the
  // onVesselConstructed analog): on a completed kind:'war-machine' Project, mint a kind:'war-
  // machine' Constructible keyed to the siege tables. Idempotent via proj.constructibleId
  // (a second call returns the existing one). Acts ONLY on war machines — vessels are the
  // voyages seam's, dungeons are onDungeonConstructed's, strongholds/others are the existing
  // applyEvent_constructionCompleted path's (untouched). Late-bound + try-guarded by the caller.
  function materializeWaveDConstructible(campaign, proj){
    if(!campaign || !proj) return null;
    if(proj.constructibleKind !== 'war-machine') return null;
    if(proj.constructibleId){
      const existing = (campaign.constructibles || []).find(c => c && c.id === proj.constructibleId);
      if(existing) return existing;                                   // already materialized (idempotent)
    }
    const A = global.ACKS || ACKS;
    if(typeof A.blankConstructible !== 'function') return null;
    const cls = findWarMachineClass(proj.constructibleSubtype);
    const cst = A.blankConstructible({
      constructibleKind: 'war-machine',
      constructibleSubtype: proj.constructibleSubtype || null,
      name: proj.name || (cls ? cls.label : 'War machine'),
      hexId: proj.siteHexId || null,
      settlementId: proj.siteSettlementId || null,
      ownerCharacterId: proj.ownerCharacterId || null,
      ownerDomainId: proj.ownerDomainId || null,
      siteType: 'special',
      buildValue: proj.totalCost || (cls ? cls.costGp : 0),
      maxShp: cls ? cls.shp : null,
      currentShp: cls ? cls.shp : null,
      completedAtTurn: (campaign.currentTurn != null) ? campaign.currentTurn : null,
      functionData: { warMachine: true, siegeKey: proj.constructibleSubtype || null, category: cls ? cls.category : null, siegeScored: cls ? !!cls.siegeScored : false }
    });
    if(!Array.isArray(campaign.constructibles)) campaign.constructibles = [];
    campaign.constructibles.push(cst);
    proj.constructibleId = cst.id;                                    // link + idempotency marker
    (cst.history = cst.history || []).push({ turn: (campaign.currentTurn) || null, type: 'built',
      narrative: 'Built from construction (project ' + proj.id + ').' });
    _recordWarMachineEvent(campaign, cst, proj);
    return cst;
  }

  // Record-only audit emit (mirror voyages/_recordVoyageEvent). The verb already minted; this
  // writes a well-formed audit entry with the §3.5 context envelope. campaignLogHidden is left
  // false — a war machine joining the host is a meaningful military milestone (it narrates).
  function _recordWarMachineEvent(campaign, cst, proj){
    const A = global.ACKS || ACKS;
    if(!campaign || typeof A.newEvent !== 'function') return null;
    const cal = (campaign.calendar) || {};
    const label = '🛠 ' + (cst.name || warMachineLabel(cst.constructibleSubtype) || 'A war machine') +
      ' is built (' + ((cst.buildValue) || 0).toLocaleString() + ' gp).';
    let ev;
    try {
      ev = A.newEvent('war-machine-built', {
        submittedBy: 'engine', cadence: 'daily', targetTurn: (campaign.currentTurn) || 1,
        gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: (campaign.currentDayInMonth) || 1 },
        payload: { constructibleId: cst.id, projectId: proj && proj.id, subtype: cst.constructibleSubtype, narrative: label }
      });
    } catch(_e){ return null; }
    if(typeof A.setEventContext === 'function'){
      A.setEventContext(ev, { primaryHexId: cst.hexId || null,
        relatedEntities: [{ kind: 'constructible', id: cst.id, role: 'subject' }]
          .concat(cst.ownerCharacterId ? [{ kind: 'character', id: cst.ownerCharacterId, role: 'owner' }] : [])
          .concat(cst.ownerDomainId ? [{ kind: 'domain', id: cst.ownerDomainId, role: 'owner' }] : []) });
    }
    ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
    ev.appliedAtTurn = (campaign.currentTurn) || 1;
    ev.appliedAtDay = (campaign.currentDayInMonth) || 1;
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: label },
      appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
    return ev;
  }

  // Record-only audit handler (the verb already applied state; keeps the event well-formed on
  // replay — the applyEvent_voyageAudit precedent).
  function applyEvent_warMachineAudit(campaign, event){
    const p = (event && event.payload) || {};
    return { result: { narrativeSummary: p.narrative || (event && event.kind) || 'war machine built' } };
  }

  // ── the siege feed (Military W6 reads these instead of re-implementing construction) ──
  // A besieger's built war machines → the artilleryMap the SHIPPED siege resolver consumes
  // (acks-engine-sieges.js artilleryBonusUnits / bombardmentPerDay). Owner-scoped (W6 picks
  // which are at the siege — a hex filter is a W6 refinement). Destroyed machines drop out.
  function warMachinesForOwner(campaign, ownerId){
    if(!campaign || !ownerId) return [];
    return (campaign.constructibles || []).filter(c => c && c.constructibleKind === 'war-machine'
      && (c.ownerCharacterId === ownerId || c.ownerDomainId === ownerId)
      && c.damageState !== 'destroyed');
  }
  // { subtype: count } — the artilleryMap shape SIEGE_BONUS_UNITS / SIEGE_BOMBARDMENT key off.
  function warMachineSiegeContribution(campaign, ownerId){
    const map = {};
    for(const c of warMachinesForOwner(campaign, ownerId)){
      const k = c.constructibleSubtype; if(!k) continue;
      map[k] = (map[k] || 0) + 1;
    }
    return map;
  }
  // Bonus units a besieger's war machines add to a Sieges-Simplified assault (the shipped
  // resolver only scores the 14 keyed machines; the 3 specialist ones contribute 0).
  function warMachineSiegeBonusUnits(campaign, ownerId){
    const A = global.ACKS || ACKS;
    return (typeof A.artilleryBonusUnits === 'function') ? A.artilleryBonusUnits(warMachineSiegeContribution(campaign, ownerId)) : 0;
  }
  // SHP/day a besieger's artillery bombards a stronghold of the given material for.
  function warMachineBombardmentPerDay(campaign, ownerId, material){
    const A = global.ACKS || ACKS;
    return (typeof A.bombardmentPerDay === 'function') ? A.bombardmentPerDay(warMachineSiegeContribution(campaign, ownerId), material) : 0;
  }

  // ── self-register the war-machine-built event kind (PR #89 kernel; from THIS module) ──
  (function _registerWaveDEventKinds(){
    const A = global.ACKS || ACKS;
    if(typeof A.registerEventKind !== 'function') return;
    A.registerEventKind('war-machine-built', {
      schema: { R: { constructibleId: 'string' }, O: { projectId: 'string', subtype: 'string', narrative: 'string' } },
      wizardOptOut: true, handler: applyEvent_warMachineAudit });
  })();

  // ── export onto window.ACKS ──
  Object.assign(ACKS, {
    WAR_MACHINE_CATALOG,
    findWarMachineClass, isWarMachineClass, warMachineCatalogList, warMachineClassKeys, warMachineLabel, warMachineCostGp,
    vesselConstructionCatalog, vesselConstructionCost,
    materializeWaveDConstructible,
    warMachinesForOwner, warMachineSiegeContribution, warMachineSiegeBonusUnits, warMachineBombardmentPerDay
  });

})(typeof window !== 'undefined' ? window : global);
