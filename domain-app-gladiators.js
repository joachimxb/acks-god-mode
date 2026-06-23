/* =============================================================================
 * domain-app-gladiators.js — ACKS God Mode app mixin: Gladiators / arena UI
 * =============================================================================
 *
 * Gladiators / arena UI, extracted from domain-app.js (T5 chip 8, 2026-06-23) — pure code-motion: a
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
  // === @b9-gladiators (team) — Gladiators G2 arena tab: state + methods ===
  // Gladiators G2 (#150) — the ⚔ arena tab over acks-engine-gladiators.js (recruitGladiator /
  // scheduleBout / resolveAndCommitBout / holdGame / freeGladiator; the abstract 1d10 resolver + the
  // Mortal-Wounds aftermath live in the engine). Dormant-until-used: the tab + view show only when
  // gladiator-games is on OR a school exists. The verbs gate on gladiator-games (refuse + toast when off).
  gladState: { schoolId:null, showNewSchool:false,
    newSchool:{ name:'', settlementId:'', lanistaId:'' },
    recruit:{ open:false, schoolId:null, name:'', gladiatorType:'', level:0, method:'buy-trained', thrassian:false },
    bout:{ open:false, schoolId:null, sideAId:'', sideBId:'', kind:'to-incapacitation' },
    lastBout:null },
  gladiatorsTabVisible(){ const c=this.currentCampaign; return !!(c && window.ACKS.gladiatorsSubsystemActive && window.ACKS.gladiatorsSubsystemActive(c)); },
  gladRuleOn(){ const c=this.currentCampaign; return !!(c && window.ACKS.isHouseRuleEnabled && window.ACKS.isHouseRuleEnabled(c,'gladiator-games')); },
  gladSchools(){ const c=this.currentCampaign; return (c && window.ACKS.gladiatorSchoolsList) ? window.ACKS.gladiatorSchoolsList(c) : []; },
  gladSelectedSchool(){ const ss=this.gladSchools(); if(!ss.length) return null; return ss.find(s=>s && s.id===this.gladState.schoolId) || ss[0]; },
  gladRoster(school){ const c=this.currentCampaign; return (c && school && window.ACKS.gladiatorsOfSchool) ? window.ACKS.gladiatorsOfSchool(c, school) : []; },
  gladTypes(){ return window.ACKS.gladiatorTypes ? window.ACKS.gladiatorTypes() : []; },
  gladTypeLabel(key){ const t=window.ACKS.findGladiatorType && window.ACKS.findGladiatorType(key); return t ? t.label : (key||'—'); },
  gladRankLabel(ch){ return window.ACKS.gladiatorRank ? window.ACKS.gladiatorRank(ch) : ''; },
  gladGpValue(ch){ return window.ACKS.gladiatorGpValue ? window.ACKS.gladiatorGpValue(ch, { thrassian: ch && ch.gladiatorIsThrassian }) : 0; },
  gladEarnedFreedom(ch){ return window.ACKS.gladiatorEarnedFreedom ? window.ACKS.gladiatorEarnedFreedom(ch) : false; },
  gladSettlementOptions(){ const c=this.currentCampaign; return (c && Array.isArray(c.settlements)) ? c.settlements.map(s=>({ id:s.id, name:s.name||s.id })) : []; },
  gladLanistaOptions(){ const c=this.currentCampaign; return (c && Array.isArray(c.characters)) ? c.characters.filter(x=>x && x.socialTier!=='gladiator' && x.lifecycleState!=='deceased').map(x=>({ id:x.id, name:x.name })) : []; },
  gladCombatantName(id){ const c=this.currentCampaign; const ch=(c && c.characters||[]).find(x=>x && x.id===id); return ch?ch.name:id; },
  gladScheduledBouts(school){ const c=this.currentCampaign; return (c && school && window.ACKS.boutsForSchool) ? window.ACKS.boutsForSchool(c, school, { scheduledOnly:true }) : []; },
  gladRecentBouts(school){ const c=this.currentCampaign; const all=(c && school && window.ACKS.boutsForSchool) ? window.ACKS.boutsForSchool(c, school) : []; return all.filter(b=>b.status==='resolved').slice(-6).reverse(); },
  gladBoutSummary(b){ if(!b || !b.result) return ''; const r=b.result; const slain=(r.casualties||[]).filter(x=>x.outcome==='slain').length; /* @b11-gladiators G5: resolution-mode-aware (combat → N rounds; abstract → 1d10) + draw */ const how=(r.resolutionMode==='combat')?(r.roundCount+' rounds'):('1d10 '+r.d10); if(r.winnerSide==='draw') return 'a draw ('+how+')'+(slain?(' · '+slain+' slain'):''); const win=(r.winnerSide==='A'?b.sideA:b.sideB).combatantIds.map(id=>this.gladCombatantName(id)).join(', '); return win+' won ('+how+')'+(slain?(' · '+slain+' slain'):'')+(r.crowdReaction?(' · crowd '+r.crowdReaction):''); },
  _gladPersist(){ try{ this.markDirty(); this.schedulePersist(); }catch(_e){} },
  gladEstablishSchool(){
    const c=this.currentCampaign; if(!c) return;
    const f=this.gladState.newSchool;
    const r=window.ACKS.createGladiatorSchool(c, { name:f.name||'New Ludus', settlementId:f.settlementId||null, lanistaCharacterId:f.lanistaId||null, foundedAtTurn:c.currentTurn||1 });
    if(!r){ this.showToast('Could not establish a school.',3000,'error'); return; }
    this.gladState.schoolId=r.id; this.gladState.showNewSchool=false;
    this.gladState.newSchool={ name:'', settlementId:'', lanistaId:'' };
    this._gladPersist(); this.showToast('School established: '+r.name,2500);
  },
  gladOpenRecruit(){ const s=this.gladSelectedSchool(); if(!s){ this.showToast('Establish a school first.',3000,'warn'); return; } this.gladState.recruit={ open:true, schoolId:s.id, name:'', gladiatorType:(this.gladTypes()[0]||{}).key||'', level:0, method:'buy-trained', thrassian:false }; },
  gladSubmitRecruit(){
    const c=this.currentCampaign; const f=this.gladState.recruit;
    const r=window.ACKS.recruitGladiator(c, f.schoolId, { name:f.name||undefined, gladiatorType:f.gladiatorType||null, level:parseInt(f.level,10)||0, method:f.method, thrassian:!!f.thrassian });
    if(!r.ok){ this.showToast('Recruit failed: '+r.reason,3500,'error'); return; }
    this.gladState.recruit.open=false; this._gladPersist();
    this.showToast(r.character.name+' joins the school ('+(r.costGp||0).toLocaleString()+' gp value)',2800);
  },
  gladOpenBout(){
    const s=this.gladSelectedSchool(); if(!s){ this.showToast('Establish a school first.',3000,'warn'); return; }
    const roster=this.gladRoster(s).filter(ch=>ch && ch.lifecycleState!=='deceased' && ch.lifecycleState!=='candidate');
    if(roster.length<2){ this.showToast('Recruit at least two ready gladiators first.',3500,'warn'); return; }
    this.gladState.bout={ open:true, schoolId:s.id, sideAId:roster[0].id, sideBId:roster[1].id, kind:'to-incapacitation' };
  },
  gladBoutRoster(){ const s=this.gladSchools().find(x=>x && x.id===this.gladState.bout.schoolId); return this.gladRoster(s).filter(ch=>ch && ch.lifecycleState!=='deceased' && ch.lifecycleState!=='candidate'); },
  gladSubmitBout(){
    const c=this.currentCampaign; const f=this.gladState.bout;
    if(!f.sideAId || !f.sideBId || f.sideAId===f.sideBId){ this.showToast('Pick two different combatants.',3000,'warn'); return; }
    const r=window.ACKS.scheduleBout(c, { sideA:{ combatantIds:[f.sideAId], kind:'gladiator' }, sideB:{ combatantIds:[f.sideBId], kind:'gladiator' }, kind:f.kind });
    if(!r.ok){ this.showToast('Schedule failed: '+r.reason,3500,'error'); return; }
    this.gladState.bout.open=false; this._gladPersist(); this.showToast('Bout scheduled.',2200);
  },
  gladResolveBout(boutId){
    const c=this.currentCampaign;
    const r=window.ACKS.resolveAndCommitBout(c, boutId, {});
    if(!r.ok){ this.showToast('Resolve failed: '+r.reason,3500,'error'); return; }
    this.gladState.lastBout={ boutId, result:r.result };
    this._gladPersist();
    const slain=(r.result.casualties||[]).filter(x=>x.outcome==='slain').length;
    this.showToast('Bout resolved — Side '+r.result.winnerSide+' wins'+(slain?(', '+slain+' slain'):''),3000);
  },
  gladStageGame(){
    const c=this.currentCampaign; const s=this.gladSelectedSchool(); if(!s) return;
    const scheduled=this.gladScheduledBouts(s);
    if(!scheduled.length){ this.showToast('Schedule some bouts first.',3000,'warn'); return; }
    const g=window.ACKS.createGame(c, { name:(s.name||'The')+' Games', settlementId:s.settlementId||null, createdAtTurn:c.currentTurn||1 });
    scheduled.forEach(b=>{ b.gameId=g.id; if(!Array.isArray(g.boutIds)) g.boutIds=[]; if(!g.boutIds.includes(b.id)) g.boutIds.push(b.id); });
    const r=window.ACKS.holdGame(c, g, {});
    if(!r.ok){ this.showToast('Game failed: '+r.reason,3500,'error'); return; }
    this.gladState.lastBout=null; this._gladPersist();
    this.showToast('Games held — '+r.resolved.length+' bout(s) fought.',3000);
  },
  gladFreeGladiator(ch){ const c=this.currentCampaign; const r=window.ACKS.freeGladiator(c, ch.id); if(!r.ok){ this.showToast('Cannot free: '+r.reason,3000,'warn'); return; } this._gladPersist(); this.showToast(ch.name+' wins their freedom.',2500); },
  // === @b11-gladiators (team) — G5 round-by-round tactical bout: state + methods ===
  // The tactical-bout modal (the ⚔ Fight launcher on each scheduled-bout row). Runs the SELF-CONTAINED
  // round resolver (resolveAndCommitBoutTactical) — the Combat-Option-B exemplar — and shows the per-round
  // log + the shared aftermath (crowd verdict + Delves-D1 Mortal Wounds + XP). gladTactState.logRounds →
  // a verbose, campaignLogHidden bout-round event per round. Gated on gladiator-games (the verb refuses off).
  gladTactState: { open:false, boutId:null, logRounds:false, result:null },
  gladTactBout(){ const c=this.currentCampaign; return (c && window.ACKS.findBout) ? window.ACKS.findBout(c, this.gladTactState.boutId) : null; },
  gladOpenTacticalBout(boutId){
    if(!this.gladRuleOn()){ this.showToast('Enable Gladiator games first.',3000,'warn'); return; }
    this.gladTactState = { open:true, boutId, logRounds:false, result:null };
  },
  gladCloseTactical(){ this.gladTactState.open=false; this.gladTactState.boutId=null; this.gladTactState.result=null; },
  gladTacticalFight(){
    const c=this.currentCampaign;
    const r=window.ACKS.resolveAndCommitBoutTactical(c, this.gladTactState.boutId, { logRounds: !!this.gladTactState.logRounds });
    if(!r.ok){ this.showToast('Bout failed: '+r.reason,3500,'error'); return; }
    this.gladTactState.result=r.result;
    this.gladState.lastBout={ boutId:this.gladTactState.boutId, result:r.result };
    this._gladPersist();
    const slain=(r.result.casualties||[]).filter(x=>x.outcome==='slain').length;
    this.showToast('Bout fought — '+(r.result.winnerSide==='draw'?'a draw':'Side '+r.result.winnerSide+' wins')+' in '+r.result.roundCount+' round(s)'+(slain?(', '+slain+' slain'):''),3200);
  },
  gladTactOutcomeText(){
    const res=this.gladTactState.result; const b=this.gladTactBout(); if(!res || !b) return '';
    if(res.winnerSide==='draw') return 'A draw — neither side fell after '+res.roundCount+' rounds.';
    const win=(res.winnerSide==='A'?b.sideA:b.sideB).combatantIds.map(id=>this.gladCombatantName(id)).join(', ');
    return win+' prevail after '+res.roundCount+' round'+(res.roundCount===1?'':'s')+(res.crowdReaction?(' · crowd '+res.crowdReaction):'')+'.';
  },
  // === @b10-gladiators (team) — Gladiators G3/G4 training + business loop + uprisings + sponsoring: state + methods ===
  // Over acks-engine-gladiators.js (trainGladiator / resolveGraduation / schoolMonthlyPL / runSchoolBusinessMonth /
  // uprisingModifiers / checkUprising / sponsorGame; the slot-62 Day-Clock consumer graduates + runs the P&L
  // automatically). Extends the ⚔ Gladiators tab (no new tab). All verbs gate on gladiator-games.
  gladG3: {
    business: { result:null },
    uprising: { open:false, schoolId:null, spark:'heavy-game-losses', sparkNotFault:true, result:null },
    sponsor:  { open:false, settlementId:'', muneratorId:'', budgetGp:0, minBudget:0, payFromMunerator:false }
  },
  gladTrainInfo(g){ const c=this.currentCampaign; return (c && window.ACKS.gladiatorTrainingInfo) ? window.ACKS.gladiatorTrainingInfo(c, g) : { inTraining:false }; },
  gladBeginTraining(g){
    const c=this.currentCampaign; const s=this.gladSelectedSchool(); if(!s) return;
    const r=window.ACKS.trainGladiator(c, s, g.id, { type: g.gladiatorType || (this.gladTypes()[0]||{}).key });
    if(!r.ok){ this.showToast('Cannot train: '+r.reason, 3000, 'warn'); return; }
    this._gladPersist(); this.showToast(g.name+' begins '+r.months+'-month training.', 2800);
  },
  gladGraduate(g){
    const c=this.currentCampaign; const r=window.ACKS.resolveGraduation(c, g.id, {});
    if(!r.ok){ this.showToast('Cannot graduate: '+r.reason, 3000, 'warn'); return; }
    this._gladPersist();
    this.showToast(r.maimed ? (g.name+' is maimed in training (1d20 '+r.roll+')') : (g.name+' graduates (1d20 '+r.roll+')'), 3200, r.maimed ? 'warn' : 'info');
  },
  // The monthly accounts preview (staff/upkeep/est-rent/est-profit + the settlement amphitheater size).
  gladSchoolAccounts(){
    const c=this.currentCampaign; const A=window.ACKS; const s=this.gladSelectedSchool();
    if(!c || !s || !A.schoolStaffWages) return null;
    const upkeep=A.schoolUpkeepGp(c,s), staffWages=A.schoolStaffWages(c,s), estRent=A.estimateSchoolMonthlyRent(c,s);
    const set=s.settlementId ? (c.settlements||[]).find(x=>x&&x.id===s.settlementId) : null;
    return { roster:A.schoolRosterCount(c,s), upkeep, staffWages, estRent,
             estProfit: estRent - upkeep - staffWages,
             amphitheaterSeats: set ? A.amphitheaterSeatsForSettlement(c, set) : 0 };
  },
  gladRunBusinessMonth(){
    const c=this.currentCampaign; const s=this.gladSelectedSchool(); if(!s){ this.showToast('Establish a school first.',3000,'warn'); return; }
    const r=window.ACKS.runSchoolBusinessMonth(c, s, {});
    if(!r.ok){ this.showToast('Business month failed: '+r.reason, 3500, 'error'); return; }
    this.gladG3.business.result=r; this._gladPersist();
    this.showToast('Business month — '+(r.pl.profit>=0?('profit +'+r.pl.profit):('loss '+r.pl.profit))+'gp', 3200);
  },
  gladOpenUprising(){
    const s=this.gladSelectedSchool(); if(!s){ this.showToast('Establish a school first.',3000,'warn'); return; }
    this.gladG3.uprising={ open:true, schoolId:s.id, spark:'heavy-game-losses', sparkNotFault:true, result:this.gladG3.uprising.result };
  },
  gladUprisingMod(){ const c=this.currentCampaign; const s=this.gladSelectedSchool(); const A=window.ACKS; return (c&&s&&A.uprisingModifiers) ? A.uprisingModifiers(c, s, { sparkNotFault:this.gladG3.uprising.sparkNotFault }).total : 0; },
  gladSubmitUprising(){
    const c=this.currentCampaign; const s=this.gladSelectedSchool(); const u=this.gladG3.uprising;
    const r=window.ACKS.checkUprising(c, s, { spark:u.spark, sparkNotFault:u.sparkNotFault });
    if(!r.ok){ this.showToast('Uprising check failed: '+r.reason, 3500, 'warn'); return; }
    this.gladG3.uprising.open=false; this.gladG3.uprising.result=r; this._gladPersist();
    this.showToast(r.revolt ? '🔥 An uprising breaks out!' : 'The spark passes — no uprising.', 3200, r.revolt ? 'error' : 'info');
  },
  gladOpenSponsor(){
    const s=this.gladSelectedSchool();
    const settlementId = (s && s.settlementId) || (this.gladSettlementOptions()[0]||{}).id || '';
    this.gladG3.sponsor={ open:true, settlementId, muneratorId:'', budgetGp:0, minBudget:0, payFromMunerator:false };
    this.gladSponsorRecalc();
  },
  gladSponsorRecalc(){
    const c=this.currentCampaign; const sp=this.gladG3.sponsor;
    const set=sp.settlementId ? (c.settlements||[]).find(x=>x&&x.id===sp.settlementId) : null;
    const fam=set ? (Number(set.families)||0) : 0;
    sp.minBudget=Math.ceil(fam*0.5);
    if(!sp.budgetGp || sp.budgetGp < sp.minBudget) sp.budgetGp=sp.minBudget;
  },
  gladSubmitSponsor(){
    const c=this.currentCampaign; const sp=this.gladG3.sponsor; const s=this.gladSelectedSchool();
    // schedule one balanced one-on-one from the school's two ablest ready gladiators (if available)
    const roster=this.gladRoster(s).filter(ch=>ch && ch.lifecycleState!=='deceased' && ch.lifecycleState!=='candidate').sort((a,b)=>(b.level||0)-(a.level||0));
    const bouts=[]; if(roster.length>=2) bouts.push({ sideA:{ combatantIds:[roster[0].id], kind:'gladiator' }, sideB:{ combatantIds:[roster[1].id], kind:'gladiator' }, kind:'to-incapacitation' });
    const r=window.ACKS.sponsorGame(c, { settlementId:sp.settlementId||null, muneratorCharacterId:sp.muneratorId||null,
      budgetGp:sp.budgetGp, payFromMunerator:sp.payFromMunerator, name:(s&&s.name?s.name+' ':'')+'Games', bouts });
    if(!r.ok){ this.showToast('Sponsor failed: '+(r.reason==='budget-too-low'?('budget must be ≥'+r.minBudget+'gp'):r.reason), 3800, 'error'); return; }
    this.gladG3.sponsor.open=false; this._gladPersist();
    this.showToast('Games sponsored ('+r.budgetGp+'gp, '+r.scheduled.length+' bout'+(r.scheduled.length===1?'':'s')+').', 3000);
  },
  });
})();
