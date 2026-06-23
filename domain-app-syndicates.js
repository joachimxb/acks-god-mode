/* =============================================================================
 * domain-app-syndicates.js — ACKS God Mode app mixin: Syndicates (hijinks) UI
 * =============================================================================
 *
 * Syndicates (hijinks) UI, extracted from domain-app.js (T5 chip 8, 2026-06-23) — pure code-motion: a
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
  synLtDraft: {},                                            // { [synId]: { level, name } } — the individuate-a-lieutenant draft
  // named lieutenants + criminal guild (per syndicate card)
  synHj3(synId) {
    const A = window.ACKS, c = this.currentCampaign;
    const syn = (c && c.syndicates || []).find(s => s && s.id === synId);
    if (!A || !syn) return { lieutenants: [], guildChartered: false, guildName: '', canCharter: false, canCharterReason: '' };
    const lts = (A.syndicateLieutenants ? A.syndicateLieutenants(c, syn) : []).map(lt => ({ id: lt.id, name: lt.name || '(unnamed)', class: lt.class || '?', level: lt.level || 1 }));
    const reason = A.canCharterGuildReason ? A.canCharterGuildReason(c, syn) : '';
    return { lieutenants: lts, guildChartered: !!(A.guildChartered && A.guildChartered(syn)), guildName: (syn.guild && syn.guild.name) || '', canCharter: reason === '', canCharterReason: reason };
  },
  _synLtDraft(synId) { if (!this.synLtDraft[synId]) this.synLtDraft[synId] = { level: 1, name: '' }; return this.synLtDraft[synId]; },
  synIndividuate(synId) {
    const A = window.ACKS, d = this._synLtDraft(synId);
    const res = A.individuateLieutenant(this.currentCampaign, synId, { level: Number(d.level) || 1, name: (d.name || '').trim() || undefined });
    if (!res || !res.ok) { this.showToast('Could not name a lieutenant: ' + ((res && (res.detail || res.error)) || 'unknown'), 3500); return; }
    this.showToast('🎖 ' + res.lieutenant.name + ' is named a lieutenant of the syndicate.', 3500);
    d.name = '';
    this.markDirty(); this.schedulePersist();
  },
  synCharterGuild(synId) {
    const A = window.ACKS;
    const res = A.charterGuild(this.currentCampaign, synId, {});
    if (!res || !res.ok) { this.showToast('Could not charter a guild: ' + ((res && (res.detail || res.error)) || 'unknown'), 4000); return; }
    this.showToast('🏷 Chartered as ' + res.guild.name + ' (its formal reach raises the membership cap).', 4500);
    this.markDirty(); this.schedulePersist();
  },
  // ── agent-5 (Hijinks HJ-2) state + methods ──
  // Phase 2.7 Hijinks HJ-2 (RR pp.358–369) — syndicates / tribute / trials. The engine
  // (acks-engine-hijinks.js) owns formSyndicate / collectSyndicateTribute / resolveHijinkTrial;
  // this is the surface inside Activities ▸ Hijinks (extends the sub-view in place).
  synForm: { bossCharacterId: '', baseSettlementId: '', marketClass: 'VI', hideoutType: 'hideout', hideoutValueGp: 5000, name: '' },
  synMemberDraft: {},   // { [synId]: { level, count } }
  synTrialDraft: {},    // { [hijinkId]: { plea, priorOffenses, gmModifier } }
  // Bosses who can found a syndicate (RR p.358 — thief / assassin / nightblade / venturer).
  synBossOptions() {
    const A = window.ACKS; if (!A || !this.currentCampaign) return [];
    return (this.currentCampaign.characters || []).filter(c => c
      && (A.isActive ? A.isActive(c) : (c.alive !== false))
      && A.syndicateBossEligible && A.syndicateBossEligible(c));
  },
  _synSettlementMarketClass() {
    const id = this.synForm.baseSettlementId; if (!id) return null;
    const s = (this.currentCampaign?.settlements || []).find(x => x && x.id === id);
    return (s && (s.marketClass || s.market)) || null;
  },
  synCanForm() {
    const A = window.ACKS; const boss = (this.currentCampaign?.characters || []).find(c => c && c.id === this.synForm.bossCharacterId);
    return !!(boss && A && A.syndicateBossEligible && A.syndicateBossEligible(boss));
  },
  synFormDisabledReason() {
    if (!this.synForm.bossCharacterId) return 'Pick an eligible boss (a thief / assassin / nightblade / venturer).';
    return this.synCanForm() ? '' : 'Only a thief / assassin / nightblade / venturer may run a syndicate (RR p.358).';
  },
  synFormSubmit() {
    const A = window.ACKS; if (!this.synCanForm() || !A || !A.formSyndicate) return;
    const res = A.formSyndicate(this.currentCampaign, {
      bossCharacterId: this.synForm.bossCharacterId,
      baseSettlementId: this.synForm.baseSettlementId || null,
      marketClass: this.synForm.marketClass,
      // hideoutType omitted → the engine auto-detects (a venturer founds a guildhouse, RR p.43; else a hideout)
      hideoutValueGp: Number(this.synForm.hideoutValueGp) || 0,
      name: this.synForm.name || ''
    });
    if (!res || !res.ok) { this.showToast('Could not found the syndicate: ' + ((res && (res.detail || res.error)) || 'unknown'), 4000); return; }
    this.showToast('🏛 ' + res.syndicate.name + ' founded (Class ' + res.syndicate.marketClass + ' ' + res.syndicate.hideoutType + ').', 4000);
    this.synForm.bossCharacterId = ''; this.synForm.name = '';
    this.markDirty(); this.schedulePersist();
  },
  _synCharName(id) { const c = (this.currentCampaign?.characters || []).find(x => x && x.id === id); return (c && c.name) || '—'; },
  syndicateRows() {
    const A = window.ACKS; if (!A || !this.currentCampaign) return [];
    return (this.currentCampaign.syndicates || []).filter(s => s && s.status !== 'disbanded').map(s => {
      const trib = A.syndicateMonthlyTribute(this.currentCampaign, s);
      const maxMembers = A.syndicateMaxMembers(s);
      const collectedThisTurn = s.lastTributeTurn === (this.currentCampaign.currentTurn || 1);
      return {
        id: s.id, name: s.name || '(unnamed syndicate)', bossName: this._synCharName(s.bossCharacterId), hasBoss: !!s.bossCharacterId,
        marketClass: s.marketClass, hideoutType: s.hideoutType, hideoutValueGp: s.hideoutValueGp || 0,
        memberCount: A.syndicateMemberCount(s), maxMembers, maxEffectiveLevel: A.syndicateMaxEffectiveLevel(s.marketClass),
        members: (s.members || []).slice().sort((a, b) => (a.level || 0) - (b.level || 0)),
        tributeTotal: trib.totalGp, tributeLines: trib.lines, collectedThisTurn,
        autoTribute: !!(A.isHouseRuleEnabled && A.isHouseRuleEnabled(this.currentCampaign, 'syndicate-auto-tribute'))
      };
    });
  },
  synCollect(synId) {
    const A = window.ACKS; if (!A || !A.collectSyndicateTribute) return;
    const res = A.collectSyndicateTribute(this.currentCampaign, synId);
    if (!res || !res.ok) { this.showToast('Tribute not collected: ' + ((res && (res.detail || res.error)) || 'unknown'), 3500); return; }
    this.showToast('💰 Collected ' + res.totalGp.toLocaleString() + 'gp in tribute.', 3500);
    this.markDirty(); this.schedulePersist();
  },
  _synDraft(synId) { if (!this.synMemberDraft[synId]) this.synMemberDraft[synId] = { level: 0, count: 1 }; return this.synMemberDraft[synId]; },
  synAddMembers(synId) {
    const A = window.ACKS, d = this._synDraft(synId);
    const res = A.addSyndicateMembers(this.currentCampaign, synId, Number(d.level) || 0, Number(d.count) || 0);
    if (!res || !res.ok) { this.showToast('Could not add members: ' + ((res && (res.detail || res.error)) || 'unknown'), 3500); return; }
    this.markDirty(); this.schedulePersist();
  },
  synRemoveMembers(synId, level, count) {
    const A = window.ACKS;
    A.removeSyndicateMembers(this.currentCampaign, synId, level, count);
    this.markDirty(); this.schedulePersist();
  },
  // Hijinks that resolved as CAUGHT and await trial (HJ-1 reveals the catch at the day-tick →
  // status 'caught' + a rolled charge; HJ-2 resolves the trial). status (not the launch-locked,
  // still-hidden outcome) is the gate — you can't try a perpetrator before he's actually caught.
  synCaughtTrials() {
    const A = window.ACKS;
    return (this.currentCampaign?.hijinks || []).filter(h => h && h.status === 'caught' && !(h.trial && h.trial.resolved)).map(h => {
      const def = (A && A.hijinkDefinition) ? (A.hijinkDefinition(h.type) || {}) : {};
      const prof = (A && A.crimeProfile) ? A.crimeProfile(h.charge) : {};
      return { id: h.id, perpName: this._synCharName(h.perpetratorCharacterId), bossName: h.bossCharacterId ? this._synCharName(h.bossCharacterId) : '', icon: def.icon || '🗡', typeLabel: def.label || h.type, charge: h.charge, crime: prof.crime || h.charge, severity: prof.severity };
    });
  },
  // Tried hijinks (the verdict log).
  synTriedRows() {
    return (this.currentCampaign?.hijinks || []).filter(h => h && h.trial && h.trial.resolved).map(h => ({
      id: h.id, perpName: this._synCharName(h.perpetratorCharacterId), crime: h.trial.crime, label: h.trial.label,
      acquitted: h.trial.acquitted, fineGp: h.trial.fineGp, indentureGp: h.trial.indentureGp, damagesGp: h.trial.damagesGp,
      physical: h.trial.physical, languishingDays: h.trial.languishingDays
    }));
  },
  _synTrialDraft(hijinkId) { if (!this.synTrialDraft[hijinkId]) this.synTrialDraft[hijinkId] = { plea: 'guilty', priorOffenses: 0, gmModifier: 0 }; return this.synTrialDraft[hijinkId]; },
  synResolveTrial(hijinkId) {
    const A = window.ACKS, d = this._synTrialDraft(hijinkId);
    const res = A.resolveHijinkTrial(this.currentCampaign, hijinkId, { plea: d.plea, priorOffenses: Number(d.priorOffenses) || 0, gmModifier: Number(d.gmModifier) || 0 });
    if (!res || !res.ok) { this.showToast('Trial not resolved: ' + ((res && (res.detail || res.error)) || 'unknown'), 4000); return; }
    this.showToast('⚖ ' + (res.narrative || (res.label + ' — ' + res.crime)), 5000);
    this.markDirty(); this.schedulePersist();
  },
  });
})();
