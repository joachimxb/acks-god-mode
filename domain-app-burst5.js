/* =============================================================================
 * domain-app-burst5.js — ACKS God Mode app mixin: the TEAM BURST5 method-group
 * =============================================================================
 *
 * Extracted verbatim from domain-app.js (T5 chip 5, 2026-06-23) — pure code-motion,
 * no behaviour change. The Treasure Wizard / Sage Consult / Senate Consult /
 * Religion Sacrifice / Foray (delve) / Disease UI methods + their transient state.
 * Registers a members object on window.__ACKS_APP_MIXINS__; domainApp() merges it
 * into the component (descriptor-preserving). All members use this.* and
 * window.ACKS.* only — no closure over domain-app.js script-scoped consts.
 * Loaded via <script src> AFTER domain-app.js, before Alpine’s deferred init.
 * ============================================================================= */
(function(){
  'use strict';
  var M = (window.__ACKS_APP_MIXINS__ = window.__ACKS_APP_MIXINS__ || []);
  M.push({
  // ========================= TEAM BURST5 — per-agent Alpine state + methods =========================
  // Each builder adds its state vars + methods AFTER its own agent line below, each property
  // COMMA-terminated (a trailing comma before }; is legal). Disjoint anchors → clean merge.
  // Inspector-only lanes (gladiators, custom-classes) usually add nothing here.
  // --- b5-gladiators (#150): ---
  // Gladiators G1 (AXIOMS 4) — Admin-verb create for the 3 entities (init-on-write the collection,
  // which isn't lazy-injected, then open the generic schemaForm edit). Ungated (the createVessel/
  // createArmy precedent — the Inspector is the admin escape hatch; the gladiator-games rule gates
  // the resolver, not authoring). The guided Action verbs (school/game/bout wizards) are G2–G6.
  inspectorCreateBlankBout(){
    if(!this.currentCampaign){ alert('Create or open a campaign first.'); return; }
    if(!Array.isArray(this.currentCampaign.bouts)) this.currentCampaign.bouts = [];
    const b = window.ACKS.blankBout({});
    this.currentCampaign.bouts.push(b);
    this.markDirty(); this.schedulePersist();
    this.inspectorOpenInspect('bout', b.id);
    this.inspectorEditMode = true;
    if(this.showToast) this.showToast('New Bout created — set its sides + kind. (Enable the “Gladiatorial games” house rule to resolve it.)');
  },
  inspectorCreateBlankGladiatorSchool(){
    if(!this.currentCampaign){ alert('Create or open a campaign first.'); return; }
    if(!Array.isArray(this.currentCampaign.gladiatorSchools)) this.currentCampaign.gladiatorSchools = [];
    const s = window.ACKS.blankGladiatorSchool({ name: 'New Gladiator School' });
    this.currentCampaign.gladiatorSchools.push(s);
    this.markDirty(); this.schedulePersist();
    this.inspectorOpenInspect('gladiator-school', s.id);
    this.inspectorEditMode = true;
    if(this.showToast) this.showToast('New Gladiator School created — set the lanista, settlement, and roster.');
  },
  inspectorCreateBlankGame(){
    if(!this.currentCampaign){ alert('Create or open a campaign first.'); return; }
    if(!Array.isArray(this.currentCampaign.games)) this.currentCampaign.games = [];
    const g = window.ACKS.blankGame({ name: 'New Game' });
    this.currentCampaign.games.push(g);
    this.markDirty(); this.schedulePersist();
    this.inspectorOpenInspect('game', g.id);
    this.inspectorEditMode = true;
    if(this.showToast) this.showToast('New Game created — set the munerator, venue, and budget, then add bouts.');
  },
  // --- b5-custom-classes (#154): ---
  // --- b5-treasure (#142): Treasure Generator wizard (#142, T1–T3) — engine in acks-engine-treasure.js ---
  treasureWizard: { open:false, treasureType:'E', targetGp:null, usePlanned:false, withSpecial:false, hexId:'', lairId:null, lairName:null, hoard:null, placed:null },
  openTreasureWizard(opts){
    opts = opts || {};
    const A = window.ACKS;
    const w = { open:true, treasureType: opts.treasureType || this.treasureWizard.treasureType || 'E',
      targetGp: opts.targetGp || null, usePlanned: opts.targetGp != null, withSpecial:false,
      hexId: opts.hexId || '', lairId: opts.lairId || null, lairName: opts.lairName || null, hoard:null, placed:null };
    // Launched from a lair → auto-read its Treasure Type (its own field, else its monster's catalog TT).
    if(opts.lairId && A && A.findLair && this.currentCampaign){
      const l = A.findLair(this.currentCampaign, opts.lairId);
      if(l){ w.lairName = l.name || w.lairName; if(l.hexId) w.hexId = l.hexId;
        let tt = l.treasureType || (l.monsterCatalogKey && A.findMonster && A.findMonster(l.monsterCatalogKey) ? (A.findMonster(l.monsterCatalogKey).treasureType || '') : '');
        if(tt) w.treasureType = tt; }
    }
    this.treasureWizard = w;
  },
  closeTreasureWizard(){ this.treasureWizard.open = false; },
  treasureTypeOptions(){ const A = window.ACKS; return (A && A.TREASURE_TYPE_LETTERS) || []; },
  treasureTypeAvgGpLabel(L){ const A = window.ACKS; return A && A.treasureTypeAvgGp ? A.treasureTypeAvgGp(L).toLocaleString() : ''; },
  treasureAccumulationLabel(L){ const A = window.ACKS; return A && A.treasureAccumulation ? A.treasureAccumulation(L) : ''; },
  nearestTreasureTypeLabel(gp){ const A = window.ACKS; return A && A.nearestTreasureType ? A.nearestTreasureType(Number(gp) || 0) : ''; },
  treasureModeLabel(){ const A = window.ACKS; return A && A.treasureModeFor ? A.treasureModeFor(this.currentCampaign) : 'classic'; },
  treasureRoll(){
    const A = window.ACKS, w = this.treasureWizard;
    if(!A || !A.generateHoard) return;
    let h;
    if(w.usePlanned && w.targetGp){ h = A.planHoard(Number(w.targetGp), A.treasureModeFor(this.currentCampaign)); w.treasureType = h.treasureType; }
    else { h = A.generateHoard({ treasureType: w.treasureType, mode: A.treasureModeFor(this.currentCampaign) }); }
    if(w.withSpecial && A.applySpecialTreasures) A.applySpecialTreasures(h);
    w.hoard = h; w.placed = null;
  },
  treasureCoinRows(){
    const A = window.ACKS, w = this.treasureWizard;
    if(!w.hoard) return [];
    const V = (A && A.COIN_GP_VALUE) || { cp:0.01, sp:0.1, ep:0.5, gp:1, pp:5 };
    return ['pp','gp','ep','sp','cp'].filter(d => (w.hoard.coins[d] || 0) > 0)
      .map(d => ({ denom:d, qty: w.hoard.coins[d], gp: Math.round(w.hoard.coins[d] * (V[d] || 0)) }));
  },
  treasureGpLabel(h){ const A = window.ACKS; return A && A.hoardTotalGp ? Math.round(A.hoardTotalGp(h)).toLocaleString() : '0'; },
  treasureStoneLabel(h){ const A = window.ACKS; return A && A.hoardTotalStone ? (Math.round(A.hoardTotalStone(h) * 10) / 10).toLocaleString() : '0'; },
  gemTierLabel(t){ return t === 'brilliant' ? 'Brilliant gem' : t === 'gem' ? 'Gem' : 'Ornamental stone'; },
  jewelryTierLabel(t){ return t === 'regalia' ? 'Regalia' : t === 'jewelry' ? 'Jewelry' : 'Trinket'; },
  magicSlotLabel(cat){ return cat === 'potion' ? 'Potion' : cat === 'scroll' ? 'Scroll' : cat === 'weapon-or-armor' ? 'Magic weapon/armor' : 'Magic item'; },
  treasurePlace(){
    const A = window.ACKS, w = this.treasureWizard;
    if(!A || !A.materializeHoard || !w.hoard) return;
    if(!this.currentCampaign){ alert('Open or create a campaign first.'); return; }
    const res = A.materializeHoard(this.currentCampaign, w.hoard, { hexId: w.hexId || null, lairId: w.lairId || null });
    w.placed = res;
    this.markDirty && this.markDirty();
    this.schedulePersist && this.schedulePersist();
    if(this.showToast && res && res.stash){
      this.showToast('💰 Hoard placed: ' + res.stash.name + ' (~' + this.treasureGpLabel(w.hoard) + ' gp · ' +
        res.notables.length + ' magic · ' + res.captives.length + ' captives).');
    }
  },
  treasurePlacedSummary(){
    const w = this.treasureWizard, r = w.placed;
    if(!r) return '';
    const parts = [];
    if(r.stash) parts.push((r.deposited ? r.deposited.length : 0) + ' item line(s) in “' + r.stash.name + '”');
    if(r.notables && r.notables.length) parts.push(r.notables.length + ' magic item(s) → Notable Items');
    if(r.captives && r.captives.length) parts.push(r.captives.length + ' captive(s) → Characters');
    return parts.join(' · ') + (w.hexId ? (' · at hex ' + w.hexId) : '') + '.';
  },
  // --- b5-sages (#147): ---
  // Sages SG-1 — the Consult-a-Sage modal (a thin surface over ACKS.consultSage). Launched from a
  // character sheet's Skills tab (🔮 Consult a sage). Adds no state/collection to the campaign.
  sageConsult: { open:false, sageId:null, clientId:null, subject:'', query:'', specialty:'', feeGp:0, answerText:'', inSpecialtyOverride:null, secret:false, result:null },
  openSageConsultModal(ch){
    const actors = this.sageConsultActors();
    const def = (ch && actors.some(a => a.id === ch.id)) ? ch.id : (actors[0] ? actors[0].id : null);
    if(!def){ if(this.showToast) this.showToast('No active character to consult.'); return; }
    const sageCh = (this.currentCampaign.characters||[]).find(c => c && c.id === def);
    this.sageConsult = { open:true, sageId:def, clientId:def, subject:'', query:'', specialty:(sageCh && sageCh.sageSpecialty) || '', feeGp:0, answerText:'', inSpecialtyOverride:null, secret:false, result:null };
  },
  closeSageConsultModal(){ this.sageConsult.open = false; this.sageConsult.result = null; },
  sageConsultActors(){
    const A = window.ACKS;
    return ((this.currentCampaign && this.currentCampaign.characters) || [])
      .filter(c => c && (A.isActive ? A.isActive(c) : (c.alive !== false)))
      .map(c => ({ id:c.id, label:(c.name || c.id) + (c.class ? (' · ' + c.class + ' L' + (c.level||1)) : '') }));
  },
  sageConsultSetSage(id){
    const ch = ((this.currentCampaign && this.currentCampaign.characters) || []).find(c => c && c.id === id);
    this.sageConsult.sageId = id;
    if(!this.sageConsult.clientId) this.sageConsult.clientId = id;
    this.sageConsult.specialty = (ch && ch.sageSpecialty) || '';
    this.sageConsult.inSpecialtyOverride = null;
    this.sageConsult.result = null;
  },
  sageConsultSage(){
    const id = this.sageConsult.sageId;
    return id ? ((this.currentCampaign && this.currentCampaign.characters) || []).find(c => c && c.id === id) : null;
  },
  sageConsultForecastUI(){
    const sage = this.sageConsultSage();
    if(!sage || !window.ACKS.sageConsultForecast) return null;
    return window.ACKS.sageConsultForecast(this.currentCampaign, sage, {
      subject: this.sageConsult.subject, specialty: this.sageConsult.specialty,
      inSpecialty: this.sageConsult.inSpecialtyOverride
    });
  },
  sageConsultSubmit(){
    const sage = this.sageConsultSage();
    if(!sage) return;
    const r = window.ACKS.consultSage(this.currentCampaign, {
      sageId: this.sageConsult.sageId, clientId: this.sageConsult.clientId || this.sageConsult.sageId,
      subject: this.sageConsult.subject, query: this.sageConsult.query, specialty: this.sageConsult.specialty,
      inSpecialty: this.sageConsult.inSpecialtyOverride, feeGp: Number(this.sageConsult.feeGp) || 0,
      answerText: this.sageConsult.answerText, secret: this.sageConsult.secret,
      // SG-4: the "📚 Record to Knowledge" tick forces the Lore emit; unticked → undefined (the engine
      // falls back to the campaign's knowledge-tracking house rule). Knowledge layer off → no-op.
      emitLore: this.sageConsult.recordToKnowledge ? true : undefined
    });
    this.sageConsult.result = r;
    if(r && r.ok){ this.markDirty(); this.schedulePersist(); if(this.showToast) this.showToast(r.success ? 'The sage answers.' : 'The sage cannot answer.'); }
    else if(r && this.showToast){ this.showToast(r.error === 'insufficient-funds' ? 'The inquirer cannot afford the fee.' : ('Cannot consult: ' + r.error)); }
  },
  // --- b5-politics (P-2): ---
  // Politics P-2 (burst5 2026-06-14) — the 🏛 Senate top-level view. A thin Alpine layer over
  // acks-engine-politics.js (senateVote / enactPolicy / the §4.4 derived tally + benefits). The
  // ruling/leading faction is always DERIVED — never read off a stored field. (P-1 left
  // realmSenateOf / realmSenateReadout / politicsCreate above in the burst4 region.)
  senateSelectedId: '',
  senateConsult: { matter: 'change-taxes', customMatter: '', mode: 'per-senator', domainMorale: 0,
    rulerFactionId: '', militaryLoyalty: 'none', controlledIndependentVotes: 0,
    policyHelps: [], policyHinders: [], gmOutcome: 'approved' },
  senateConsultResult: null,
  // dormant-until-used: the nav tab + every panel gate on a senate existing.
  campaignHasSenate(){ return !!(this.currentCampaign && Array.isArray(this.currentCampaign.senates) && this.currentCampaign.senates.some(s => s && s.status !== 'dissolved')); },
  policyObjectiveList(){ return (window.ACKS && window.ACKS.POLICY_OBJECTIVES) || []; },
  senateAutoVoteOn(){ const A = window.ACKS; return !(A && A.isHouseRuleEnabled && A.isHouseRuleEnabled(this.currentCampaign, 'senate-auto-vote') === false); },
  senateAllRows(){
    const c = this.currentCampaign;
    if(!c || !Array.isArray(c.senates)) return [];
    return c.senates.filter(s => s && s.status !== 'dissolved').map(s => ({ id: s.id, name: s.name || s.id }));
  },
  senateSelected(){
    const c = this.currentCampaign, A = window.ACKS;
    if(!c || !A) return null;
    const rows = this.senateAllRows();
    if(rows.length === 0) return null;
    const id = this.senateSelectedId || rows[0].id;
    return A.findSenate(c, id) || A.findSenate(c, rows[0].id);
  },
  _senateApex(senate){
    const c = this.currentCampaign;
    if(!c || !senate || !Array.isArray(c.domains)) return null;
    return c.domains.find(d => d && d.id === senate.realmDomainId) || null;
  },
  // the derived tally (§4.4) for the selected senate — recomputed live, nothing cached.
  senateReadout(){
    const A = window.ACKS, c = this.currentCampaign, senate = this.senateSelected();
    if(!A || !c || !senate) return { totalVotes: 0, independentVotes: 0, rulingFactionId: null, leadingFactionId: null, factions: [] };
    const factions = (A.factionsForSenate(c, senate.id) || []).map(f => ({
      id: f.id, name: f.name || f.id, influence: A.factionTotalInfluence(c, f), standing: A.factionStanding(c, f)
    })).sort((a, b) => b.influence - a.influence);
    return {
      totalVotes: A.senateTotalVotes(c, senate),
      independentVotes: senate.independentMinorSenatorVotes || 0,
      rulingFactionId: A.senateRulingFactionId(c, senate),
      leadingFactionId: A.senateLeadingFactionId(c, senate),
      factions
    };
  },
  senateRulerName(){
    const apex = this._senateApex(this.senateSelected());
    if(!apex) return '—';
    const r = (this.currentCampaign.characters || []).find(ch => ch && ch.id === apex.rulerCharacterId);
    return r ? (r.name || r.id) : '—';
  },
  senateFactionName(id){
    if(!id) return '—';
    const f = window.ACKS.findFaction(this.currentCampaign, id);
    return f ? (f.name || f.id) : id;
  },
  senateBenefitsView(){
    const A = window.ACKS, senate = this.senateSelected(), apex = this._senateApex(senate);
    if(!A || !apex) return { active: false, inDispute: false, isSenatorial: false, benefits: { moraleBonus: 0, vassalBaseLoyalty: -2, freeFirstExtraDuty: false, freeMilitiaLevy: false } };
    return A.senateBenefits(this.currentCampaign, apex);
  },
  senateLeadingSenatorRows(){
    const A = window.ACKS, c = this.currentCampaign, senate = this.senateSelected();
    if(!A || !c || !senate) return [];
    return (A.senatorshipsForSenate(c, senate.id) || []).filter(s => s.rank !== 'minor').sort((a, b) => (b.votes || 0) - (a.votes || 0)).map(s => {
      const ch = (c.characters || []).find(x => x && x.id === s.senatorCharacterId);
      const f = s.factionId ? A.findFaction(c, s.factionId) : null;
      return {
        id: s.id, name: ch ? (ch.name || ch.id) : (s.senatorCharacterId || '(vacant)'),
        factionName: f ? (f.name || f.id) : '—', votes: s.votes || 0,
        objectives: (Array.isArray(s.policyObjectives) && s.policyObjectives.length) ? s.policyObjectives.join(', ') : '—',
        attitude: s.attitudeTowardRuler != null ? s.attitudeTowardRuler : '—',
        viaOffice: !!s.sourceObligationId,
        bewitched: Array.isArray(s.influenceModifiers) && s.influenceModifiers.some(m => m && m.kind === 'bewitched')
      };
    });
  },
  senateMatterOptions(){
    const labels = { 'invade-realm': 'Invade another realm', 'demand-duty': 'Demand a duty of a vassal',
      'appoint-vassal-manager': 'Appoint a vassal-domain manager', 'change-taxes': "Change the realm's taxes",
      'change-religion': "Change the realm's religion", 'levy-troops': 'Levy conscripts or militia' };
    return ((window.ACKS && window.ACKS.SENATE_RESTRICTED_MATTERS) || []).map(m => ({ value: m, label: labels[m] || m }));
  },
  _senateMatter(){
    return this.senateConsult.matter === '__custom__' ? (this.senateConsult.customMatter || 'a custom matter') : this.senateConsult.matter;
  },
  senateMatterRestricted(){
    const A = window.ACKS;
    return !!(A && A.isSenateConsultationRequired && A.isSenateConsultationRequired(this._senateMatter()));
  },
  // the result-table render helpers (per-senator rows carry senatorCharacterId; by-faction rows carry factionName)
  senateRollWho(row){
    if(row.factionName) return row.factionName;
    const ch = (this.currentCampaign.characters || []).find(x => x && x.id === row.senatorCharacterId);
    return ch ? (ch.name || ch.id) : (row.senatorCharacterId || 'senator');
  },
  senateRollModifiers(row){
    if(!row.modifiers || row.modifiers.length === 0) return row.bewitched ? 'auto (bewitched)' : '—';
    return row.modifiers.map(m => (m.value >= 0 ? '+' : '') + m.value + ' ' + m.label).join(', ');
  },
  // run the 2d6 consultation (or record the GM narration when senate-auto-vote is off)
  senateRunConsult(){
    const A = window.ACKS, c = this.currentCampaign, senate = this.senateSelected();
    if(!A || !c || !senate) return;
    const res = A.senateVote(c, {
      senateId: senate.id, matter: this._senateMatter(), mode: this.senateConsult.mode,
      domainMorale: Number(this.senateConsult.domainMorale) || 0,
      rulerFactionId: this.senateConsult.rulerFactionId || null,
      militaryLoyalty: this.senateConsult.militaryLoyalty,
      controlledIndependentVotes: Number(this.senateConsult.controlledIndependentVotes) || 0,
      policyHelps: (this.senateConsult.policyHelps || []).slice(),
      policyHinders: (this.senateConsult.policyHinders || []).slice(),
      gmOutcome: this.senateConsult.gmOutcome
    });
    this.senateConsultResult = res;
    this.markDirty(); this.schedulePersist();
    if(res) this.showToast('🗳 The senate votes — ' + res.outcome + ' (' + res.forVotes + ' for / ' + res.againstVotes + ' against of ' + res.totalVotes + ')', 5000);
  },
  // the ruler acts on the matter: enact cleanly (approved) or defy the senate (→ dispute)
  senateEnact(approved){
    const A = window.ACKS, c = this.currentCampaign, senate = this.senateSelected();
    if(!A || !c || !senate) return;
    const r = A.enactPolicy(c, { senateId: senate.id, matter: this._senateMatter(), consulted: true, approved: !!approved });
    this.markDirty(); this.schedulePersist();
    if(r){
      if(r.disputed) this.showToast('⚠ The ruler defies the senate — the realm is in dispute.', 5000);
      else if(r.cleared) this.showToast('✓ The dispute is resolved — benefits restored.', 5000);
      else this.showToast("✓ Policy enacted with the senate's sanction.", 4000);
    }
    this.senateConsultResult = null;
  },
  // resolve an existing dispute via a retroactive-approval enactment on the defied topic
  senateResolveDispute(){
    const A = window.ACKS, c = this.currentCampaign, senate = this.senateSelected();
    if(!A || !c || !senate || senate.dispute == null) return;
    const r = A.enactPolicy(c, { senateId: senate.id, matter: senate.dispute.defiedTopic, consulted: true, approved: true, retroactiveApproval: true });
    this.markDirty(); this.schedulePersist();
    if(r && r.cleared) this.showToast('✓ The senate grants retroactive approval — the dispute ends.', 5000);
  },
  // --- b5-religion (R2): ---
  // --- b5-religion (R2): blood sacrifice (the Chaotic path) — thin Alpine layer over bloodSacrifice ---
  religionSacForm: { casterId: '', componentValueGp: 0, victimCharacterId: '', victimSapient: false, victimWilling: false, victimHelpless: true, victimAlignment: '', multipliers: {} },
  religionSacResult: null,
  religionSacCasterOptions(){
    const camp = this.currentCampaign; if(!camp) return [];
    const A = window.ACKS; const priestIds = new Set((camp.congregations || []).map(c => c.highPriestCharacterId).filter(Boolean));
    return (camp.characters || []).filter(ch => ch && (A.isDivineCaster(ch) || A.hasPowerOfSacrifice(ch) || priestIds.has(ch.id)));
  },
  religionSacMultiplierKeys(){ return Object.keys(window.ACKS.SACRIFICE_MULTIPLIERS || {}); },
  religionSacMultValue(k){ return (window.ACKS.SACRIFICE_MULTIPLIERS || {})[k] || 0; },
  religionSacToggleMult(k){ this.religionSacForm.multipliers[k] = !this.religionSacForm.multipliers[k]; },
  religionSacComponentPreview(){
    const f = this.religionSacForm;
    if(f.victimCharacterId){ const v = (this.currentCampaign.characters || []).find(c => c.id === f.victimCharacterId); return v ? (Number(v.xp) || 0) : 0; }
    return Number(f.componentValueGp) || 0;
  },
  religionSacMultSumPreview(){
    const f = this.religionSacForm;
    return window.ACKS.sacrificeMultiplierSum(Object.keys(f.multipliers).filter(k => f.multipliers[k]));
  },
  religionPerformSacrifice(){
    const f = this.religionSacForm; if(!f.casterId) return;
    const multipliers = Object.keys(f.multipliers).filter(k => f.multipliers[k]);
    const opts = { casterId: f.casterId, multipliers, victimSapient: f.victimSapient,
      victimWilling: f.victimWilling, victimHelpless: f.victimHelpless, victimAlignment: f.victimAlignment || null };
    if(f.victimCharacterId) opts.victimCharacterId = f.victimCharacterId;
    else opts.componentValueGp = Number(f.componentValueGp) || 0;
    const r = window.ACKS.bloodSacrifice(this.currentCampaign, opts);
    this.religionSacResult = r;
    if(!r || !r.ok){ this.showToast('Sacrifice blocked: ' + ((r && r.reason) || 'failed')); return; }
    this.markDirty(); this.schedulePersist();
    this.showToast(r.yieldsNothing ? ('Sacrifice performed — no power earned (' + r.yieldReason + ')')
      : (r.arcane ? ('Stored ' + (r.arcaneStoredGp || 0).toLocaleString() + 'gp arcane power')
        : ('Gained ' + (r.divinePowerGained || 0).toLocaleString() + 'gp divine power')));
  },
  // --- b5-delves (D3): ---
  // --- b5-delves (D3): the Foray Wizard (Abstract Dungeon foray Action verb, JJ ch.12) ---
  foray: { open:false, dungeonId:null, delveId:null, participantIds:[], attempted:1, situationalKeys:[], healedToOneHp:true, isHenchmanDelve:false, proposal:null, lastCommit:null, realizeResult:null, treasureDest:'' },
  // A dungeon is forayable while it isn't cleared/destroyed and still has encounters left.
  dungeonForayable(d){ return !!d && d.status !== 'cleared' && d.status !== 'destroyed' && this.dungeonEncountersLeft(d) > 0; },
  forayDungeon(){ return this.foray.dungeonId ? window.ACKS.findDungeon(this.currentCampaign, this.foray.dungeonId) : null; },
  forayDelve(){ return this.foray.delveId ? window.ACKS.findDelve(this.currentCampaign, this.foray.delveId) : null; },
  forayCandidates(){ return (this.currentCampaign?.characters || []).filter(c => c && (window.ACKS.isActive ? window.ACKS.isActive(c) : (c.alive !== false))); },
  forayActiveDelves(){ return (this.currentCampaign && window.ACKS.activeDelves) ? window.ACKS.activeDelves(this.currentCampaign) : []; },
  forayDelvesForDungeon(dungeonId){ return (this.currentCampaign && window.ACKS.delvesForDungeon) ? window.ACKS.delvesForDungeon(this.currentCampaign, dungeonId).filter(x => x.status === 'in-progress') : []; },
  forayDelveDungeonName(dl){ const d = dl && window.ACKS.findDungeon(this.currentCampaign, dl.dungeonId); return d ? (d.name || '(dungeon)') : '—'; },
  forayDelveRemaining(dl){ const d = dl && window.ACKS.findDungeon(this.currentCampaign, dl.dungeonId); return d ? this.dungeonEncountersLeft(d) : 0; },
  // Open the wizard for a dungeon — continue its in-progress delve, or stage a fresh one.
  openForayWizard(dungeonId){
    const existing = this.forayDelvesForDungeon(dungeonId)[0];
    this.foray = { open:true, dungeonId, delveId: existing ? existing.id : null,
      participantIds: existing ? (existing.participantCharacterIds || []).slice() : [],
      attempted: 1, situationalKeys: [], healedToOneHp: true,
      isHenchmanDelve: existing ? !!existing.isHenchmanDelve : false,
      proposal: null, lastCommit: null, realizeResult: null, treasureDest: '' };
  },
  forayToggleParticipant(id){ const i = this.foray.participantIds.indexOf(id); if(i >= 0) this.foray.participantIds.splice(i, 1); else if(this.foray.participantIds.length < 8) this.foray.participantIds.push(id); this.foray.proposal = null; },
  forayToggleSituational(key){ const i = this.foray.situationalKeys.indexOf(key); if(i >= 0) this.foray.situationalKeys.splice(i, 1); else this.foray.situationalKeys.push(key); this.foray.proposal = null; },
  foraySituationalMods(){ return window.ACKS.DUNGEON_SITUATIONAL_MODS || []; },
  forayPartyLevel(){ return window.ACKS.partyLevelFor(this.currentCampaign, this.foray.participantIds.slice(0, 8)); },
  forayPartySize(){ return Math.min(8, this.foray.participantIds.length); },
  forayRemaining(){ const d = this.forayDungeon(); return d ? this.dungeonEncountersLeft(d) : 0; },
  forayCharName(id){ const c = (this.currentCampaign?.characters || []).find(x => x.id === id); return c ? c.name : id; },
  forayModifierPreview(){
    const d = this.forayDungeon(); if(!d) return null;
    return window.ACKS.dungeonForayResolutionModifier(d, { partyLevel: this.forayPartyLevel(), dungeonLevel: d.dungeonLevel,
      attemptedEncounters: Math.min(this.foray.attempted, this.forayRemaining()), adventurerCount: this.forayPartySize(), situationalKeys: this.foray.situationalKeys });
  },
  forayCanResolve(){ return this.foray.participantIds.length > 0 && this.foray.attempted >= 1 && this.forayRemaining() > 0; },
  forayResolve(){
    if(!this.forayCanResolve()) return;
    if(!this.foray.delveId){
      const dl = window.ACKS.startDelve(this.currentCampaign, { dungeonId: this.foray.dungeonId, participantCharacterIds: this.foray.participantIds.slice(), isHenchmanDelve: this.foray.isHenchmanDelve });
      this.foray.delveId = dl.id;
    } else {
      const dl = this.forayDelve(); if(dl){ dl.participantCharacterIds = this.foray.participantIds.slice(); dl.isHenchmanDelve = this.foray.isHenchmanDelve; }
    }
    this.foray.proposal = window.ACKS.resolveDungeonForay(this.currentCampaign, this.foray.delveId, { attemptedEncounters: Math.min(this.foray.attempted, this.forayRemaining()), situationalKeys: this.foray.situationalKeys });
    this.foray.lastCommit = null;
  },
  forayReroll(){ this.foray.proposal = null; this.forayResolve(); },
  forayCommit(){
    if(!this.foray.proposal) return;
    const out = window.ACKS.commitDungeonForay(this.currentCampaign, this.foray.delveId, this.foray.proposal, { healedToOneHp: this.foray.healedToOneHp });
    this.foray.lastCommit = out; this.foray.proposal = null;
    const dl = this.forayDelve(); if(dl) this.foray.participantIds = (dl.participantCharacterIds || []).slice();
    this.markDirty(); this.schedulePersist();
    if(this.showToast) this.showToast(out && out.foray ? ('Foray resolved — ' + out.foray.result) : 'Foray resolved');
  },
  forayAttemptMore(){ this.foray.lastCommit = null; this.foray.proposal = null; this.foray.attempted = Math.max(1, Math.min(this.foray.attempted, this.forayRemaining())); },
  forayRealize(outcome){
    const res = window.ACKS.realizeDelve(this.currentCampaign, this.foray.delveId, { outcome, treasureDestinationCharacterId: this.foray.treasureDest || null });
    this.foray.realizeResult = res; this.foray.lastCommit = null;
    this.markDirty(); this.schedulePersist();
    if(this.showToast && res) this.showToast(res.narrative);
  },
  closeForayWizard(){
    // discard an empty delve that was staged but never resolved a foray (it never happened).
    const dl = this.forayDelve();
    if(dl && (dl.foraysResolved || []).length === 0 && Array.isArray(this.currentCampaign.delves)){
      this.currentCampaign.delves = this.currentCampaign.delves.filter(x => x.id !== dl.id);
    }
    this.foray = { open:false, dungeonId:null, delveId:null, participantIds:[], attempted:1, situationalKeys:[], healedToOneHp:true, isHenchmanDelve:false, proposal:null, lastCommit:null, realizeResult:null, treasureDest:'' };
  },
  // --- b5-cl2 (disease): ---
  // --- b5-cl2 (disease): Character Lifecycle CL-2 — disease (JJ p.84) ---
  // The character-sheet Health readout + the Expose-to-disease modal. The disease engine (the
  // contraction verb + the slot-57 disease day-tick consumer) lives in acks-engine-lifecycle.js;
  // these are thin wrappers + the GM modal state. Mutations go through the engine verbs (which find
  // the live character on currentCampaign), so the readout re-renders like D1's Wounds readout.
  characterDiseaseRows(ch){
    const A = window.ACKS;
    if(!ch || !A || typeof A.characterDiseaseInfo !== 'function') return [];
    return A.characterDiseaseInfo(ch).diseases || [];
  },
  diseaseSymptomatic(ch){
    const A = window.ACKS;
    return !!(ch && A && typeof A.characterDiseaseInfo === 'function' && A.characterDiseaseInfo(ch).symptomatic);
  },
  diseaseTypeOptions(){ return (window.ACKS && window.ACKS.DISEASE_TYPES) || []; },
  exposeDisease: { open:false, characterId:null, charName:'', deathTarget:15, diseaseType:'', modifier:0, rollSave:true, forcedSave:11, result:null },
  openExposeDiseaseModal(ch){
    if(!ch) return;
    const dt = (ch.savingThrows && ch.savingThrows.death != null) ? ch.savingThrows.death : 15;
    this.exposeDisease = { open:true, characterId:ch.id, charName:ch.name, deathTarget:dt, diseaseType:'', modifier:0, rollSave:true, forcedSave:11, result:null };
  },
  closeExposeDiseaseModal(){ this.exposeDisease.open = false; this.exposeDisease.result = null; },
  exposeDiseaseRun(){
    const ed = this.exposeDisease; const camp = this.currentCampaign;
    if(!camp){ this.showToast('No campaign loaded.'); return; }
    const opts = {};
    if(ed.diseaseType) opts.diseaseType = ed.diseaseType;
    else if(ed.modifier) opts.modifier = Number(ed.modifier) || 0;
    if(!ed.rollSave) opts.forcedSave = Math.max(1, Math.min(20, Number(ed.forcedSave) || 1));
    try {
      const r = window.ACKS.contractDisease(camp, ed.characterId, opts);
      ed.result = r || { infected:false, narrative:'No result.' };
      if(r && r.infected === false){ this.showToast('✅ ' + (r.narrative || (ed.charName + ' resists the illness.')), 4000); }
      else if(r){ this.showToast('🤒 ' + ed.charName + ' contracts ' + r.diseaseLabel + (r.willDie ? ' (will die without a cure)' : '') + '.', 5000); this.markDirty(); this.schedulePersist(); }
    } catch(e){ this.showToast('Expose failed: ' + e.message); }
  },
  identifyDiseaseRow(ch, d){
    const camp = this.currentCampaign; if(!camp || !ch || !d) return;
    const opts = (d.identifiedLevel === 'identified') ? { level:'prognosis' } : {};   // sensed→identified→prognosis
    try { window.ACKS.identifyDisease(camp, ch.id, d.id, opts); this.markDirty(); this.schedulePersist(); }
    catch(e){ this.showToast('Identify failed: ' + e.message); }
  },
  cureDiseaseRow(ch, d){
    const camp = this.currentCampaign; if(!camp || !ch || !d) return;
    try { const r = window.ACKS.cureDisease(camp, ch.id, d.id, { method:'Healing' });
      if(r){ this.showToast('✚ ' + ch.name + ' is cured of ' + (r.diseaseLabel || 'their illness') + '.', 4000); this.markDirty(); this.schedulePersist(); } }
    catch(e){ this.showToast('Cure failed: ' + e.message); }
  },
  });
})();
