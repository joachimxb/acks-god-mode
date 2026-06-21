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

  // ── SETTLEMENT_BUILDING_CATALOG (Wave E — JJ pp.217–221 + RR p.133 + AXIOMS 4) ──
  // The functional buildings a settlement can host. Each entry carries a `fn` (the settlement function
  // it provides → a chip on the hex card) + `enables` (the downstream subsystem it unlocks when built —
  // a stub today, real when that phase lands). `cost` is the default the Wizard fills; `minCost` is the
  // RAW threshold the cost can't drop below (0 = freely GM-set: the building has no RAW threshold, so the
  // default is a representative figure from the RR p.133 building table, flagged in the note).
  //   IP (CLAUDE §13.6): mechanical values + page cites only, no rulebook prose.
  const SETTLEMENT_BUILDING_CATALOG = [
    { key:'mercenary-guildhouse', label:'Mercenary Guildhouse', cost:5000,  minCost:5000,  fn:'mercenary-hiring', fnLabel:'Mercenary hiring',   enables:null,                page:'JJ p.218', note:'A hall where mercenaries gather for hire (JJ p.218). Guildhouse threshold 5,000gp (RR p.43).' },
    { key:'merchant-guildhouse',  label:'Merchant Guildhouse',  cost:5000,  minCost:5000,  fn:'banking',          fnLabel:'Banking / monopoly', enables:'Banking (#148)',     page:'RR p.43',  note:'A venturer guildhouse — raises passive-investment caps + grants monopoly power (RR p.43). Enables the Banking subsystem when built.' },
    { key:'temple',               label:'Temple',               cost:15000, minCost:15000, fn:'religion',         fnLabel:'Divine worship',     enables:'Religion (#146)',    page:'RR p.421', note:'A divine stronghold (15,000gp threshold). Enables the Religion subsystem when built.' },
    { key:'tower-of-knowledge',   label:'Tower of Knowledge',   cost:15000, minCost:15000, fn:'magic-research',   fnLabel:'Magic research',     enables:'Magic Research',     page:'RR p.386', note:'A magical academy (sanctum threshold 15,000gp). Enables the Magic Research subsystem when built.' },
    { key:'emporium',             label:'Emporium / Agora',     cost:3000,  minCost:0,     fn:'market',           fnLabel:'Daily market',       enables:null,                page:'JJ p.218', note:"The settlement's daily market hall (JJ p.218). Cost representative (RR p.133 villa); GM-set." },
    { key:'public-bath',          label:'Public Bath',          cost:13250, minCost:13250, fn:'civic-amenity',    fnLabel:'Public amenity',     enables:null,                page:'RR p.133', note:'A civic amenity — hot/tepid/cold pools + sauna (RR p.133).' },
    { key:'public-theater',       label:'Public Theater',       cost:16000, minCost:16000, fn:'civic-amenity',    fnLabel:'Public amenity',     enables:null,                page:'RR p.133', note:'A 32,000-sq-ft civic theater (RR p.133).' },
    { key:'inn',                  label:'Inn',                  cost:1500,  minCost:0,     fn:'lodging',          fnLabel:'Lodging',            enables:null,                page:'RR p.133', note:'A lodging house. Cost representative (RR p.133 townhouse); GM-set.' },
    { key:'smithy',               label:'Smithy',               cost:1500,  minCost:0,     fn:'craft',            fnLabel:'Craft / equipment',  enables:null,                page:'RR p.133', note:'A craft workshop. Cost representative (RR p.133 townhouse); GM-set.' },
    { key:'tradehouse',           label:'Tradehouse',           cost:3000,  minCost:0,     fn:'commerce',         fnLabel:'Commerce',           enables:null,                page:'RR p.133', note:'A commercial house. Cost representative (RR p.133 villa); GM-set.' },
    { key:'amphitheater',         label:'Amphitheater',         cost:16000, minCost:0,     fn:'arena',            fnLabel:'Arena (games)',      enables:'Gladiators (#150)', marketClassMin:4, page:'AXIOMS 4 p.21', note:'Hosts gladiatorial games (market class IV+). Seat count + economics via the Gladiators subsystem (AXIOMS 4); the cost here is GM-set (representative).' },
    { key:'gladiator-school',     label:'Gladiatorial School',  cost:5000,  minCost:0,     fn:'arena',            fnLabel:'Gladiator school',   enables:'Gladiators (#150)', page:'AXIOMS 4 p.24', note:'Trains + houses gladiators. Detailed structures + economics via the Gladiators subsystem (AXIOMS 4); the cost here is GM-set (representative).' }
  ].map(Object.freeze);
  Object.freeze(SETTLEMENT_BUILDING_CATALOG);
  const SETTLEMENT_BUILDING_BY_KEY = {};
  for(const b of SETTLEMENT_BUILDING_CATALOG){ SETTLEMENT_BUILDING_BY_KEY[b.key] = b; }
  function findSettlementBuilding(key){ return (key && SETTLEMENT_BUILDING_BY_KEY[key]) || null; }
  function settlementBuildingCatalogList(){ return SETTLEMENT_BUILDING_CATALOG.slice(); }   // defensive copy
  function settlementBuildingLabel(key){ const b = findSettlementBuilding(key); return b ? b.label : (key || ''); }
  // Settlement-building Constructibles (constructibleKind:'settlement-building') standing at a hex — the
  // function-chip readout the hex card reads. Reads the SHIPPED constructiblesAtHex; filters to the kind +
  // out the destroyed/being-demolished. Late-bound (constructiblesAtHex lives in acks-engine.js).
  function settlementBuildingsAtHex(campaign, hexId){
    const A = global.ACKS || ACKS;
    const list = (typeof A.constructiblesAtHex === 'function') ? A.constructiblesAtHex(campaign, hexId)
               : ((campaign && campaign.constructibles) || []).filter(c => c && c.hexId === hexId);
    return list.filter(c => c && c.constructibleKind === 'settlement-building' && c.damageState !== 'destroyed' && c.constructionState !== 'being-demolished');
  }

  // ── Wave H catalogs (RR p.133) — civic monuments / traps / field fortifications / roads ──
  // The long tail of constructible kinds. All EDITABLE-cost (a pick fills the RAW default; the GM adjusts
  // it for the RAW modifiers — rock-cut −10% / colour +5% on monuments, accessories on traps, per-mile ×
  // miles ÷ terrain on roads). Same shape as the settlement-building catalog. IP: values + cites only.

  // RR p.133 "Civic Facilities and Monuments" — the decorative monuments (the baths/theater are functional
  // settlement-buildings, Wave E). `colorModifier` flags the rock-cut −10% / prized-colour +5% adjustment.
  const CIVIC_MONUMENT_CATALOG = [
    { key:'statue-10',      label:"Statue, marble (10' tall)",   cost:200,     colorModifier:true, page:'RR p.133', note:'A marble statue. Rock-cut −10% / prized colour +5% (RR p.133) — adjust the cost.' },
    { key:'statue-25',      label:"Statue, marble (25' tall)",   cost:3125,    colorModifier:true, page:'RR p.133', note:'A marble statue. Rock-cut −10% / prized colour +5% (RR p.133) — adjust the cost.' },
    { key:'statue-50',      label:"Statue, marble (50' tall)",   cost:25000,   colorModifier:true, page:'RR p.133', note:'A grand marble statue. Rock-cut −10% / prized colour +5% (RR p.133) — adjust the cost.' },
    { key:'statue-100',     label:"Statue, marble (100' tall)",  cost:200000,  colorModifier:true, page:'RR p.133', note:'A colossal marble statue. Rock-cut −10% / prized colour +5% (RR p.133) — adjust the cost.' },
    { key:'statue-250',     label:"Statue, marble (250' tall)",  cost:3125000, colorModifier:true, page:'RR p.133', note:'A wonder-of-the-world statue. Rock-cut −10% / prized colour +5% (RR p.133) — adjust the cost.' },
    { key:'triumphal-arch', label:'Triumphal arch, quadrifrontal', cost:10000, colorModifier:true, page:'RR p.133', note:"A 30'×30'×30' quadrifrontal arch (RR p.133). Rock-cut −10% / prized colour +5% — adjust the cost." }
  ].map(Object.freeze);

  // RR p.133 "Traps" — built traps (the builder needs the Trapping proficiency, errata r4). Accessories —
  // pit spikes +100gp, concealed pit cover +500gp (RR p.133) — are GM-added, so the cost is editable.
  const TRAP_CATALOG = [
    { key:'arrow-firing',     label:'Arrow-firing trap',   cost:400,  page:'RR p.133', note:'Fires as a 1st-level fighter, 1d6+1 piercing (RR p.133).' },
    { key:'ceiling-collapse', label:'Ceiling collapse',    cost:1200, page:'RR p.133', note:"10'×10', Blast save or 1d6 bludgeoning (RR p.133)." },
    { key:'dart-firing',      label:'Dart-firing trap',    cost:380,  page:'RR p.133', note:'Fires as a 1st-level fighter, 1d4+1 piercing (RR p.133).' },
    { key:'deadfall',         label:'Deadfall',            cost:20,   page:'RR p.133', note:"5' diameter, Blast save or 1d12 bludgeoning (RR p.133)." },
    { key:'earth-pit',        label:'Excavated earth pit', cost:20,   page:'RR p.133', note:"10'×10'×10', concealed, 1d6 bludgeoning (RR p.133)." },
    { key:'fire',             label:'Fire trap',           cost:500,  page:'RR p.133', note:"10' diameter oil, Blast save or 1d8 fire for 2 rounds (RR p.133)." },
    { key:'needle-firing',    label:'Needle-firing trap',  cost:120,  page:'RR p.133', note:'1 damage (RR p.133).' },
    { key:'portcullis',       label:'Portcullis trap',     cost:1850, page:'RR p.133', note:'Falls downward, Blast save or 1d6 bludgeoning (RR p.133).' },
    { key:'rock-cut-pit',     label:'Rock-cut pit',        cost:500,  page:'RR p.133', note:"10'×10'×10', concealed by a rug, 1d6 bludgeoning (RR p.133)." },
    { key:'rolling-rock',     label:'Rolling rock',        cost:400,  page:'RR p.133', note:"5' boulder rolls 30', Blast save or 1d6 bludgeoning (RR p.133)." },
    { key:'scything-blade',   label:'Scything blade',      cost:550,  page:'RR p.133', note:"Swings in a 10' line, Blast save or 1d8 slashing (RR p.133)." },
    { key:'spring-snare',     label:'Spring snare',        cost:20,   page:'RR p.133', note:"Snatches 10' up, Paralysis save or 1d6 seismic + restrained (RR p.133)." },
    { key:'swinging-log',     label:'Swinging log',        cost:55,   page:'RR p.133', note:"Swings in a 10' line, Blast save or 1d8 bludgeoning (RR p.133)." },
    { key:'whipping-branch',  label:'Whipping branch',     cost:10,   page:'RR p.133', note:'Swings from a tree as a 1st-level fighter, 1d6+1 piercing (RR p.133).' }
  ].map(Object.freeze);

  // RR p.133 + the W5 army-built border fort (RR p.451). The crude works (`crude:true`) degrade in weather
  // when the Wave-I crude-construction-weather rule is on.
  const FIELD_FORTIFICATION_CATALOG = [
    { key:'border-fort',     label:'Border fort (Class VI market)', cost:10000, page:'RR p.451', note:'A 10,000gp army-built supply-base fort (RR p.451) — serves as a Class VI market; designate it in the army supply bases.' },
    { key:'palisade-wooden', label:"Palisade, wood (100')",        cost:125,  page:'RR p.133', note:"100' × 7.5' high (RR p.133)." },
    { key:'palisade-crude',  label:"Palisade, crude (100')",       cost:13,   crude:true, page:'RR p.133', note:"100' × 7.5' high; crude (RR p.133) — degrades in weather." },
    { key:'rampart-rammed',  label:"Rampart, rammed earth (100')", cost:300,  page:'RR p.133', note:"100' × 10' high × 15' thick (RR p.133)." },
    { key:'rampart-piled',   label:"Rampart, piled earth (100')",  cost:30,   crude:true, page:'RR p.133', note:"100' × 10' high × 15' thick; crude (RR p.133) — degrades in weather." },
    { key:'ditch',           label:"Ditch / moat, unfilled (100')",cost:400,  page:'RR p.133', note:"100' × 20' wide × 10' deep (RR p.133)." },
    { key:'ditch-crude',     label:"Ditch, crude (100')",          cost:40,   crude:true, page:'RR p.133', note:"100' × 20' wide × 10' deep; crude (RR p.133) — degrades in weather." }
  ].map(Object.freeze);

  // RR p.133 "Roads" — per-MILE cost (÷ the terrain movement multiplier in rough terrain). The Wizard cost
  // is editable (per-mile × miles ÷ terrain). The hex-movement EFFECT of a built road is a Journeys follow-on.
  const ROAD_CATALOG = [
    { key:'leveled-earth-8',  label:"Road, leveled earth (8' wide)",  cost:100, perMile:true, page:'RR p.133', note:'100gp per mile; ÷ the terrain movement multiplier in rough terrain (RR p.133). Set the total = per-mile × miles ÷ terrain.' },
    { key:'leveled-earth-10', label:"Road, leveled earth (10' wide)", cost:125, perMile:true, page:'RR p.133', note:'125gp per mile; ÷ the terrain movement multiplier in rough terrain (RR p.133). Set the total = per-mile × miles ÷ terrain.' },
    { key:'gravel-8',         label:"Road, gravel (8' wide)",         cost:200, perMile:true, page:'RR p.133', note:'200gp per mile; ÷ the terrain movement multiplier in rough terrain (RR p.133). Set the total = per-mile × miles ÷ terrain.' },
    { key:'gravel-10',        label:"Road, gravel (10' wide)",        cost:250, perMile:true, page:'RR p.133', note:'250gp per mile; ÷ the terrain movement multiplier in rough terrain (RR p.133). Set the total = per-mile × miles ÷ terrain.' },
    { key:'paved-8',          label:"Road, paved (8' wide)",          cost:400, perMile:true, page:'RR p.133', note:'400gp per mile; ÷ the terrain movement multiplier in rough terrain (RR p.133). Set the total = per-mile × miles ÷ terrain.' },
    { key:'paved-10',         label:"Road, paved (10' wide)",         cost:500, perMile:true, page:'RR p.133', note:'500gp per mile; ÷ the terrain movement multiplier in rough terrain (RR p.133). Set the total = per-mile × miles ÷ terrain.' }
  ].map(Object.freeze);
  [CIVIC_MONUMENT_CATALOG, TRAP_CATALOG, FIELD_FORTIFICATION_CATALOG, ROAD_CATALOG].forEach(Object.freeze);

  // A generic catalog lookup over the EDITABLE-cost kinds (settlement-building + the Wave-H kinds), so the
  // Wizard's subtype options / note / submit-gate read one helper. Vessel + war machine keep their own
  // fixed-cost path (a different module + shape). Returns the frozen catalog array, or null for a kind
  // with no subtype catalog (stronghold-component uses STRONGHOLD_CATALOG; the rest take a free-form cost).
  function constructionSubtypeCatalog(kind){
    switch(kind){
      case 'settlement-building': return SETTLEMENT_BUILDING_CATALOG;
      case 'civic-monument':      return CIVIC_MONUMENT_CATALOG;
      case 'trap':                return TRAP_CATALOG;
      case 'field-fortification': return FIELD_FORTIFICATION_CATALOG;
      case 'road':                return ROAD_CATALOG;
      default:                    return null;
    }
  }
  function findConstructionSubtype(kind, key){ const c = constructionSubtypeCatalog(kind); return (c && key) ? (c.find(x => x && x.key === key) || null) : null; }

  // ── Wave F — repair cost (RR p.339: cost ∝ the fraction of structure lost) ──
  // (shpLost / maxShp) × buildValue when SHP is tracked; else a damageState-fraction estimate. Pure.
  const _DAMAGE_FRACTION = { intact: 0, damaged: 0.25, breached: 0.5, ruined: 0.75, destroyed: 1 };
  function constructionRepairCost(cst){
    if(!cst) return 0;
    const bv = cst.buildValue || 0;
    if(cst.maxShp != null && cst.currentShp != null && cst.maxShp > 0){
      const lost = Math.max(0, cst.maxShp - cst.currentShp);
      return Math.round(bv * (lost / cst.maxShp));
    }
    return Math.round(bv * (_DAMAGE_FRACTION[cst.damageState] || 0));
  }
  // Whether a Constructible needs repair (damaged / breached / ruined / destroyed; not intact).
  function constructibleNeedsRepair(cst){ return !!cst && cst.damageState && cst.damageState !== 'intact'; }

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
    warMachinesForOwner, warMachineSiegeContribution, warMachineSiegeBonusUnits, warMachineBombardmentPerDay,
    // Wave E — settlement buildings
    SETTLEMENT_BUILDING_CATALOG,
    findSettlementBuilding, settlementBuildingCatalogList, settlementBuildingLabel, settlementBuildingsAtHex,
    // Wave H — civic monuments / traps / field fortifications / roads + the generic subtype lookup
    CIVIC_MONUMENT_CATALOG, TRAP_CATALOG, FIELD_FORTIFICATION_CATALOG, ROAD_CATALOG,
    constructionSubtypeCatalog, findConstructionSubtype,
    // Wave F — damage + repair
    constructionRepairCost, constructibleNeedsRepair
  });

})(typeof window !== 'undefined' ? window : global);
