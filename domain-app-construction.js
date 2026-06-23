/* =============================================================================
 * domain-app-construction.js — ACKS God Mode app mixin: Construction Wizard UI
 * =============================================================================
 *
 * Construction Wizard UI, extracted from domain-app.js (T5 chip 8, 2026-06-23) — pure code-motion: a
 * reorder-gather of the feature’s members, which the team-session append-zones
 * (@b8..@b14) had scattered across the component literal. Registers a members object
 * on window.__ACKS_APP_MIXINS__; domainApp() merges it into the component
 * (descriptor-preserving, so getters survive). Members use this.* / window.ACKS.* only.
 * Loaded via <script src> after domain-app.js, before Alpine’s deferred init.
 * ============================================================================= */
(function(){
  'use strict';
  var M = (window.__ACKS_APP_MIXINS__ = window.__ACKS_APP_MIXINS__ || []);
  M.push({
  // === @b13 TEAM SESSION insertion zone — each lane appends its state+methods AFTER ITS OWN marker line (distinct lines → clean auto-merge). Do not touch another lane's marker. ===
  // === @b13-construction  (team) — Construction Wave D (vessels / war machines / siege-support): state + methods ===
  // Catalog-driven subtype options for the Construction Wizard (vessel → VESSEL_CATALOG, RR p.316;
  // war-machine → WAR_MACHINE_CATALOG, RR pp.136–137). Returns [{key,label,costGp}] for the picker.
  constructionWizardSubtypeOptions(){
    const A = window.ACKS, cw = this.constructionWizard;
    if(cw.kind === 'vessel')      return (A.vesselConstructionCatalog ? A.vesselConstructionCatalog() : ((A.VESSEL_CATALOG)||[])).map(v => ({ key:v.key, label:v.label, costGp:v.costGp||0 }));
    if(cw.kind === 'war-machine') return (A.warMachineCatalogList ? A.warMachineCatalogList() : []).map(m => ({ key:m.key, label:m.label, costGp:m.costGp||0 }));
    if(cw.kind === 'siege-construction') return (A.siegeConstructionCatalogList ? A.siegeConstructionCatalogList() : []).map(s => ({ key:s.key, label:s.label, costGp:0 }));  /* @b14-construction */
    // Wave E + H — the editable-cost catalog kinds (settlement-building / civic-monument / trap /
    // field-fortification / road): a catalog pick fills a DEFAULT cost the GM can then raise (minCost =
    // the RAW threshold the cost can't drop below; 0 = freely GM-set). One generic lookup; the modal shows
    // BOTH the subtype picker AND the editable cost field for these kinds.
    const cat = A.constructionSubtypeCatalog ? A.constructionSubtypeCatalog(cw.kind) : null;
    if(cat) return cat.map(b => ({ key:b.key, label:b.label, costGp:b.cost||0, minCost:b.minCost||0 }));
    return [];
  },
  // The current kind has a subtype catalog → the subtype picker shows. Fixed-cost kinds (vessel /
  // war-machine) take their cost from the pick; the editable-cost kinds show the cost field too.
  constructionWizardHasCatalog(){ return this.constructionWizard.kind !== 'siege-construction' && this.constructionWizardSubtypeOptions().length > 0; },  /* @b14-construction: siege works use their own picker (derived cost) */
  constructionWizardFixedCost(){ const k = this.constructionWizard.kind; return k === 'vessel' || k === 'war-machine'; },
  constructionWizardSubtypeLabel(){
    return ({ 'vessel':'Vessel class (RR p.316):', 'war-machine':'War machine (RR pp.136–137):',
      'settlement-building':'Building (JJ pp.217–221 + RR p.133):', 'civic-monument':'Monument (RR p.133):',
      'trap':'Trap (RR p.133):', 'field-fortification':'Field work (RR p.133):', 'road':'Road surface (RR p.133):' })[this.constructionWizard.kind] || 'Subtype:';
  },
  // Pick a vessel class / war machine → set the subtype (reusing cw.structureKey, already plumbed to
  // constructibleSubtype + the site-eligibility check) + fill cost + default name from the catalog.
  constructionWizardPickSubtype(key){
    const cw = this.constructionWizard;
    cw.structureKey = key;
    const o = this.constructionWizardSubtypeOptions().find(x => x.key === key);
    if(o){ cw.totalCost = o.costGp; if(!cw.name || !cw.name.trim()) cw.name = o.label; }
    else { cw.totalCost = 0; }
    // @b14-construction — a siege work's cost is derived from its secondary input (feet / machine), not the catalog.
    if(cw.kind === 'siege-construction'){ cw.assemblyMachineId = ''; if(key === 'circumvallation' && !(cw.circumvallationFeet >= 2500)) cw.circumvallationFeet = 2500; this.siegeWizardSyncCost(); }
  },

  // ── Construction Wizard (Architecture §10.8 — Wave C, 2026-06-18) — the Action verb. Creates an
  //    under-construction Project that the Day Clock / Advance Month builds toward completion. Launched
  //    from the Inspector Create→Project (Admin) + the Domain Stronghold tab (deep-link prefill). ──
  constructionWizardKinds(){
    const A = window.ACKS, camp = this.currentCampaign;
    const on = (id) => !!(camp && A.isHouseRuleEnabled && A.isHouseRuleEnabled(camp, id));
    return [
      { key:'stronghold-component', label:'Stronghold component (Keep, Tower, Wall…)' },
      { key:'settlement-building',  label:'Settlement building' },
      { key:'vessel',               label:'Vessel (ship / boat)' },
      { key:'war-machine',          label:'War machine (catapult, ballista, ram, siege tower…)' },  /* @b13-construction (Wave D) */
      { key:'sanctum',              label:'Sanctum' },                                                       /* Wave G */
      { key:'dungeon',              label:'Dungeon' },                                                       /* Wave G */
      // Wave G — `mine` is the dwarven-mining subsystem's build surface; `vault` is a dwarven-civilization
      // stronghold. Each is hidden when its house rule is OFF (CLAUDE §5.8 — off ⇒ hidden + non-functional;
      // §6 polarity: these are supplement/content-pack kinds, default OFF). Existing built mines/vaults still
      // render from their own data — gating only hides the picker option.
      ...(on('dwarven-mining')       ? [{ key:'mine',  label:'Mine' }]  : []),
      ...(on('dwarven-civilization') ? [{ key:'vault', label:'Vault' }] : []),
      { key:'hideout',              label:'Hideout' },                                                       /* Wave G */
      { key:'field-fortification',  label:'Field fortification (palisade, rampart, ditch, border fort)' },  /* Wave H — renamed from 'fortification' to match the W5 border fort */
      { key:'civic-monument',       label:'Civic monument (statue, triumphal arch)' },                      /* Wave H */
      { key:'trap',                 label:'Trap' },                                                          /* Wave H */
      { key:'road',                 label:'Road / bridge' },                                                /* Wave H */
      // @b14-construction — siege-support works (RR p.474 / p.449), shown only while a siege is under way.
      ...((camp && A.activeSieges && A.activeSieges(camp).length > 0) ? [{ key:'siege-construction', label:'Siege works (circumvallation / war-machine assembly)' }] : [])
    ];
  },
  constructionWizardKindNote(){
    const k = this.constructionWizard.kind;
    // @b13-construction (Wave D) — vessels + war machines are catalog-driven (RR p.316 / pp.136–137).
    if(k === 'vessel') return 'Pick a waterway-adjacent site + a class. On completion it is launched as a real Vessel (RR p.316).';
    if(k === 'war-machine') return 'A buildable war machine (RR pp.136–137). On completion it can be brought to a siege (it feeds the Sieges-Simplified bonus + bombardment). Needs a siege engineer / engineer supervisor (RR p.174).';
    if(k === 'siege-construction'){  /* @b14-construction */
      if(this.constructionWizard.structureKey === 'circumvallation')      return "A besieger's encircling line (RR p.474) — 1gp/ft, built in ≥2,500' segments. On completion each 250' relieves 2 blockading units; a complete ring imposes −4 on enemy smuggling.";
      if(this.constructionWizard.structureKey === 'war-machine-assembly') return 'Field-(dis)assembly of an existing war machine for the siege (RR p.449) — 1/100 the build cost. On completion it joins the besieger’s bombardment + assault bonus.';
      return 'Siege works built over time against a siege (RR p.474 / p.449). Pick the target siege + the work.';
    }
    // Wave E + H — the editable-cost catalog kinds: once a subtype is picked, show its note (the RAW cite +
    // any threshold / downstream-enables for settlement buildings); before a pick, a per-kind hint.
    const ent = window.ACKS.findConstructionSubtype ? window.ACKS.findConstructionSubtype(k, this.constructionWizard.structureKey) : null;
    if(ent){
      let n = ent.note || '';
      if(k === 'settlement-building') n += (ent.minCost > 0 ? (' Minimum ' + ent.minCost.toLocaleString() + 'gp — build grander if you like.') : ' Raise the cost for a grander building.') + (ent.enables ? (' Enables ' + ent.enables + ' when built.') : '');
      return n;
    }
    if(k === 'settlement-building')  return 'Requires a settlement at the site (JJ pp.217–221 + RR p.133). Pick a building, then set its cost.';
    if(k === 'civic-monument')       return 'A decorative monument (RR p.133). Pick one, then set its cost (rock-cut −10% / prized colour +5%).';
    if(k === 'trap')                 return 'A built trap (RR p.133). The builder needs the Trapping proficiency. Pick one, then set its cost.';
    if(k === 'field-fortification')  return 'A field work (RR p.133 + p.451). Pick one, then set its cost.';
    if(k === 'road')                 return 'A road, priced per mile ÷ the terrain movement multiplier (RR p.133). Pick a surface, then set the total cost.';
    // Wave G — the class-bound + dwarven kinds (no fixed catalog: free-form cost + a class/site advisory).
    if(k === 'sanctum')  return 'An arcane caster’s sanctum (RR p.386 — threshold 15,000gp). Owned by an arcane L9+ caster it draws apprentices + companions on completion; a non-mage can build the structure, but it draws no apprentices.';
    if(k === 'dungeon')  return 'A built dungeon (RR p.386 — Structure Costs). On completion it mints a Dungeon and auto-attunes an arcane L9+ owner; monsters then arrive + lair within it (Vagaries of Incursion). The instant 🏗 Build a dungeon on the Arcane tab is the admin shortcut.';
    if(k === 'mine')     return 'A mine — the physical workings (BTA Ch.8 / AXIOMS 17). Ore yield + royalties run through the domain economy (the dwarven-mining subsystem); this builds the structure. Best sited in hills / mountains.';
    if(k === 'vault')    return 'A dwarven vault — an underground dwarven stronghold (RR p.353 / BTA). The Vaultguard / Craftpriest bonuses apply for a dwarf owner. Best sited in hills / mountains.';
    if(k === 'hideout')  return 'A hideout (RR p.360 — threshold 5,000gp). A thief / assassin’s hideout anchors a crime syndicate (Hijinks); anyone can build the structure.';
    return 'Enter the RR cost for the structure.';
  },
  // Wave G — the builder class-restriction advisory (RR pp.386–388 + JJ p.121). Soft + non-blocking: a
  // sanctum/dungeon wants an arcane L9+ owner; a vault wants a dwarf. Returns the advisory string (or '' when
  // matched / N/A). The modal shows it as an amber heads-up; the submit gate never reads it (anyone CAN build).
  constructionWizardClassAdvisory(){
    const cw = this.constructionWizard, A = window.ACKS;
    if(cw.repairTargetId || !A.constructionBuilderClassAdvisory) return '';
    const r = A.constructionBuilderClassAdvisory(this.currentCampaign, {
      kind: cw.kind,
      ownerCharacterId: cw.ownerKind === 'character' ? (cw.ownerCharacterId || null) : null,
      ownerDomainId:    cw.ownerKind === 'domain'    ? (cw.ownerDomainId    || null) : null
    });
    return (r && !r.matched) ? r.advisory : '';
  },
  // Wave F — the label of the Constructible being repaired (name + damage state), for the repair banner.
  constructionWizardRepairTargetLabel(){
    const id = this.constructionWizard.repairTargetId; if(!id) return '';
    const t = window.ACKS.findConstructible ? window.ACKS.findConstructible(this.currentCampaign, id) : null;
    if(!t) return id;
    return (t.name || t.constructibleSubtype || t.constructibleKind) + ' (' + (t.damageState || 'damaged') + ')';
  },
  constructionWizardOnKind(){
    // Reset the per-kind picks when the kind changes (the catalog structure only applies to strongholds).
    const cw = this.constructionWizard;
    cw.structureKey = ''; cw.componentType = '';
    if(cw.kind === 'siege-construction'){ cw.siegeId = cw.siegeId || ''; cw.circumvallationFeet = 2500; cw.assemblyMachineId = ''; }  /* @b14-construction */
    // A catalog-driven kind (stronghold-component / vessel / war-machine / settlement-building / the
    // Wave-H kinds) re-fills its cost from the pick, so zero it on a kind switch. Wave G's free-form
    // class-bound kinds get a sensible RAW default the GM adjusts (RR p.386 sanctum/dungeon, p.353 vault,
    // p.360 hideout); any other free-form kind (mine — BTA-variable) resets to 0.
    const G_DEFAULT = { sanctum:15000, dungeon:30000, vault:15000, hideout:5000 };
    if(cw.kind === 'stronghold-component' || this.constructionWizardHasCatalog()) cw.totalCost = 0;
    else cw.totalCost = G_DEFAULT[cw.kind] || 0;
  },
  constructionWizardPickStructure(key){
    const cw = this.constructionWizard;
    cw.structureKey = key;
    const s = (window.ACKS.STRONGHOLD_CATALOG || []).find(x => x.key === key);
    if(s){
      cw.totalCost = s.cost;
      if(!cw.name || !cw.name.trim()) cw.name = s.name;
      // Derive the component type from the structure key (keep→Keep, tower→Tower, …); else leave blank
      // (the component still carries name + buildValue + structures, which is what the value uses).
      cw.componentType = /^keep/.test(key) ? 'Keep' : /^tower/.test(key) ? 'Tower' :
        /^citadel/.test(key) ? 'Citadel' : /^castle/.test(key) ? 'Castle' : /^vault/.test(key) ? 'Vault' : '';
    }
  },
  constructionWizardOwnerDomain(){
    const cw = this.constructionWizard;
    if(cw.ownerKind !== 'domain') return null;
    return (this.domains || []).find(d => d && d.id === cw.ownerDomainId) || null;
  },
  constructionWizardSiteOptions(){
    const cw = this.constructionWizard, A = window.ACKS;
    const dom = this.constructionWizardOwnerDomain();
    let hexes = dom
      ? window.ACKS.hexesForDomain(this.currentCampaign, dom.id)
      : ((this.currentCampaign && this.currentCampaign.hexes) || []);
    return hexes.filter(Boolean).map(h => {
      const e = A.isSiteEligibleForKind ? A.isSiteEligibleForKind(this.currentCampaign, h, cw.kind, cw.structureKey) : { eligible:true, reason:null };
      return { id: h.id, label: hexLabelFor(h),
               eligible: e.eligible, reason: this.constructionWizardSiteReason(e.reason) };
    });
  },
  constructionWizardSiteReason(r){
    return ({ 'requires-waterway':'needs a waterway', 'requires-settlement':'needs a settlement', 'no-site':'no site' })[r] || r || '';
  },
  constructionWizardSupervisorCandidates(){
    const A = window.ACKS, cw = this.constructionWizard;
    return (((this.currentCampaign && this.currentCampaign.characters) || []).map(c => {
      const cap = A.constructionSupervisorCapForCharacter ? A.constructionSupervisorCapForCharacter(c) : (c.constructionSupervisorCap || 0);
      const onSite = !c.currentHexId || c.currentHexId === cw.siteHexId;
      return { id: c.id, name: c.name || c.id, cap, onSite };
    })).filter(c => c.cap > 0);
  },
  constructionWizardWorkerCounts(){
    const cw = this.constructionWizard, wc = {};
    if(cw.laborers   > 0) wc.laborer   = Math.floor(cw.laborers);
    if(cw.masons     > 0) wc.mason     = Math.floor(cw.masons);
    if(cw.carpenters > 0) wc.carpenter = Math.floor(cw.carpenters);
    if(cw.smiths     > 0) wc.smith     = Math.floor(cw.smiths);
    return wc;
  },
  constructionWizardProject(){
    const cw = this.constructionWizard;
    return {
      constructibleKind: cw.kind, constructibleSubtype: cw.structureKey || null,
      siteHexId: cw.siteHexId || null, totalCost: Number(cw.totalCost) || 0,
      workerCounts: this.constructionWizardWorkerCounts(),
      supervisorCharacterIds: (cw.supervisorIds || []).slice(), laborInvested: 0
    };
  },
  constructionWizardForecast(){
    if(!this.currentCampaign || !window.ACKS.projectConstructionForecast) return null;
    return window.ACKS.projectConstructionForecast(this.currentCampaign, this.constructionWizardProject());
  },
  constructionWizardSubmitReason(){
    const cw = this.constructionWizard;
    if(!cw.name || !cw.name.trim()) return cw.repairTargetId ? 'Name the work' : 'Name the structure';
    // Build-only gates (skipped in Wave-F repair mode — the kind/subtype are fixed to the target).
    if(!cw.repairTargetId){
      if(cw.kind === 'stronghold-component' && !cw.structureKey) return 'Pick a structure';
      if((cw.kind === 'vessel' || cw.kind === 'war-machine') && !cw.structureKey) return cw.kind === 'vessel' ? 'Pick a vessel class' : 'Pick a war machine';  /* @b13-construction (Wave D) */
      // Wave E + H — the editable-cost catalog kinds need a subtype pick + cost ≥ the RAW threshold (minCost).
      if(window.ACKS.constructionSubtypeCatalog && window.ACKS.constructionSubtypeCatalog(cw.kind)){
        if(!cw.structureKey) return 'Pick a ' + (({ 'settlement-building':'building', 'civic-monument':'monument', 'trap':'trap', 'field-fortification':'field work', 'road':'road surface' })[cw.kind] || 'subtype');
        const ent = window.ACKS.findConstructionSubtype(cw.kind, cw.structureKey);
        if(ent && ent.minCost > 0 && Number(cw.totalCost) < ent.minCost) return 'Cost must be at least ' + ent.minCost.toLocaleString() + 'gp for a ' + ent.label;
      }
      // @b14-construction — siege works need a target siege + the per-work parameter.
      if(cw.kind === 'siege-construction'){
        if(!cw.siegeId) return 'Pick a siege to support';
        if(!cw.structureKey) return 'Pick a siege work (circumvallation / war-machine assembly)';
        if(cw.structureKey === 'circumvallation' && !(Number(cw.circumvallationFeet) >= 2500)) return "Circumvallation is built in ≥2,500' segments";
        if(cw.structureKey === 'war-machine-assembly' && !cw.assemblyMachineId) return 'Pick a built war machine to assemble';
      }
    }
    if(!(Number(cw.totalCost) > 0)) return cw.repairTargetId ? 'Repair cost must be greater than 0' : 'Cost must be greater than 0';
    if(cw.ownerKind === 'domain' && !cw.ownerDomainId) return 'Pick an owner domain';
    if(cw.ownerKind === 'character' && !cw.ownerCharacterId) return 'Pick an owner character';
    if(!cw.siteHexId) return 'Pick a site hex';
    if(Object.keys(this.constructionWizardWorkerCounts()).length === 0) return 'Assign at least one worker';
    const f = this.constructionWizardForecast();
    if(f && f.requiresSupervisor && !f.supervisorOk) return f.supervisorBlockReason || 'Assign a qualified supervisor';
    return '';
  },
  constructionWizard: { open: false, kind: 'stronghold-component', structureKey: '', componentType: '', name: '', totalCost: 0, ownerKind: 'domain', ownerDomainId: '', ownerCharacterId: '', siteHexId: '', laborers: 0, masons: 0, carpenters: 0, smiths: 0, supervisorIds: [], repairTargetId: '' },  // 🏗 Construction Wizard (Domain ▸ Stronghold + Inspector; repairTargetId set = Wave-F repair mode)
  });
})();
