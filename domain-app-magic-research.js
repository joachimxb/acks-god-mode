/* =============================================================================
 * domain-app-magic-research.js — ACKS God Mode app mixin: Magic Research UI
 * =============================================================================
 *
 * Magic Research UI, extracted from domain-app.js (T5 chip 8, 2026-06-23) — pure code-motion: a
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
  researchKindLabel(kind){ const m = window.ACKS.magicResearchKind(kind); return m ? (m.icon + ' ' + m.label) : kind; },
  researchNewKinds(){ return (window.ACKS.availableResearchKinds() || []).map(k => ({ id: k, label: this.researchKindLabel(k) })); },
  // Rituals (AD-M3) — the sample-ritual picker + repertoire readouts.
  researchRitualOptions(){
    const cat = window.ACKS.RITUAL_CATALOG || []; const ch = this.characterEditing;
    return cat.map(r => {
      const L = (ch ? window.ACKS.ritualLevelFor(this.currentCampaign, ch, r.key) : null) || (r.arcane != null ? r.arcane : r.divine);
      return { key: r.key, label: r.name + ' (L' + L + ')', level: L };
    });
  },
  researchRitualInfo(){ const k = this.researchNew.ritualKey; return (!k || k === 'custom') ? null : window.ACKS.ritualCatalogEntry(k); },
  researchRitualLevel(){ return this._researchNewConfig().ritualLevel || Number(this.researchNew.ritualLevel) || 7; },
  researchRitualRepertoire(){
    const ch = this.characterEditing; const lvl = this.researchRitualLevel();
    if(!ch) return { cap: 0, known: 0, level: lvl };
    return { cap: window.ACKS.ritualRepertoireCap(this.currentCampaign, ch), known: window.ACKS.ritualsKnown(this.currentCampaign, ch, lvl).length, level: lvl };
  },
  _researchNewConfig(){
    const n = this.researchNew;
    const cfg = { targetName: (n.targetName || '').trim() };
    if(n.kind === 'spell-research'){ cfg.spellLevel = Number(n.spellLevel) || 1; }
    else if(n.kind === 'identify'){ cfg.spellLevelsImbued = Number(n.spellLevelsImbued) || 0; }
    else if(n.kind === 'item-creation'){
      cfg.itemKind = n.itemKind; cfg.effectType = n.effectType; cfg.spellLevel = Number(n.spellLevel) || 1;
      if(n.effectType === 'charged') cfg.charges = Number(n.charges) || 1;
      if(n.effectType === 'activated') cfg.activationRate = n.activationRate;
      if(n.effectType === 'permanent') cfg.permanentDuration = n.permanentDuration;
      if(n.effectType === 'permanent-bonus') cfg.enchantBonus = Number(n.enchantBonus) || 1;
    }
    else if(['construct-design','construct-manufacture','crossbreed','necromancy'].includes(n.kind)){
      cfg.hd = Number(n.hd) || 0; cfg.minorAbilities = Number(n.minorAbilities) || 0; cfg.majorAbilities = Number(n.majorAbilities) || 0;
      if(n.kind !== 'construct-design') cfg.quantity = Math.max(1, Number(n.quantity) || 1);
      if(n.kind === 'construct-manufacture'){ cfg.undead = !!n.undead; cfg.sentient = !!n.sentient; }
      if(n.kind === 'crossbreed') cfg.preserveMemory = !!n.preserveMemory;
      if(n.kind === 'necromancy') cfg.willing = !!n.willing;
    }
    else if(['ritual-learn','ritual-cast'].includes(n.kind)){
      const key = (n.ritualKey && n.ritualKey !== 'custom') ? n.ritualKey : null;
      cfg.ritualKey = key;
      const entry = key ? window.ACKS.ritualCatalogEntry(key) : null;
      const lvl = entry ? (window.ACKS.ritualLevelFor(this.currentCampaign, this.characterEditing, key) || entry.arcane || entry.divine) : (Number(n.ritualLevel) || 7);
      cfg.ritualLevel = Math.max(7, Math.min(9, Number(lvl) || 7));
      if(entry && !cfg.targetName) cfg.targetName = entry.name;
      if(n.kind === 'ritual-cast'){ cfg.mode = (n.mode === 'stored') ? 'stored' : 'immediate'; if(cfg.mode === 'stored') cfg.storedForm = n.storedForm || 'scroll'; }
    }
    return cfg;
  },
  researchNewCosts(){ return window.ACKS.researchProjectCosts(this.researchNew.kind, this._researchNewConfig()); },
  researchNewMinLevel(){ return window.ACKS.researchEffectiveMinLevel(this.researchNew.kind, this._researchNewConfig()); },
  researchNewEligible(){
    const ch = this.characterEditing; if(!ch) return { ok: false, reason: 'no-character' };
    return window.ACKS.isEligibleResearcher(this.currentCampaign, ch, this.researchNew.kind, this._researchNewConfig());
  },
  researchNewAssistants(){
    const ch = this.characterEditing; if(!ch) return [];
    return (window.ACKS.researchAssistantsFor(this.currentCampaign, ch.id) || []).map(a => {
      const c = (this.currentCampaign.characters || []).find(x => x && x.id === a.characterId);
      return { id: a.characterId, label: ((c && c.name) || a.characterId) + ' · L' + a.level + ' ' + a.role, eligible: a.level >= 1 };
    });
  },
  researchToggleAssistant(id){ const arr = this.researchNew.assistantIds; const i = arr.indexOf(id); if(i >= 0) arr.splice(i, 1); else arr.push(id); },
  // Experimentation (AD-M4; RR pp.408–411) — the modal's experiment config.
  researchExperimentAvailable(){
    const ch = this.characterEditing; if(!ch || (Number(ch.level) || 0) < 5) return false;
    const n = this.researchNew;
    return !n.commonSpell && !n.fromFormula;   // a no-throw project can't be experimented (RR p.408)
  },
  researchExperimentMethods(){
    const ch = this.characterEditing; const lvl = ch ? (Number(ch.level) || 0) : 0;
    const M = window.ACKS.EXPERIMENT_METHODS || {};
    return Object.keys(M).map(k => ({ key: k, label: M[k].label, minLevel: M[k].minLevel, disabled: lvl < M[k].minLevel }));
  },
  researchExperimentAllowed(){
    const ch = this.characterEditing; if(!ch) return 0;
    return window.ACKS.experimentAllowedAdvantages(this.currentCampaign, ch, this.researchNew.experimentMethod, { artCraftRelated: this.researchNew.experimentArtCraft });
  },
  researchExperimentMishapTier(){ const m = (window.ACKS.EXPERIMENT_METHODS || {})[this.researchNew.experimentMethod]; return m ? m.mishapTier : 'minor'; },
  researchExperimentUsed(){ const a = this.researchNew.experimentAdv || {}; return (Number(a.haste)||0) + (Number(a.efficiency)||0) + (Number(a.insight)||0) + (Number(a.lore)||0); },
  researchAdvLabel(adv){ const A = (window.ACKS.EXPERIMENT_ADVANTAGES || {})[adv]; return A ? A.label : adv; },
  researchAdvEffect(adv){ const A = (window.ACKS.EXPERIMENT_ADVANTAGES || {})[adv]; return A ? A.effect : ''; },
  researchExperimentPreview(){
    const a = this.researchNew.experimentAdv || {}; const parts = [];
    if((Number(a.haste)||0) > 0) parts.push('rate ×' + ((Number(a.haste)||0) + 1));
    if((Number(a.efficiency)||0) > 0) parts.push('components ×' + ((Number(a.efficiency)||0) + 1));
    if((Number(a.insight)||0) > 0) parts.push('+' + ((Number(a.insight)||0) * 2) + ' throw');
    if((Number(a.lore)||0) > 0) parts.push('esoteric spells');
    return parts.length ? (' · ' + parts.join(' · ')) : '';
  },
  researchExperimentOk(){
    const n = this.researchNew;
    if(!this.researchExperimentAvailable() || !n.experimentOn) return true;
    const ee = window.ACKS.experimentEligibility(this.currentCampaign, this.characterEditing, n.experimentMethod, { artCraftRelated: n.experimentArtCraft });
    return !!ee.ok && this.researchExperimentUsed() <= this.researchExperimentAllowed();
  },
  _researchExperiment(){
    const n = this.researchNew;
    if(!this.researchExperimentAvailable() || !n.experimentOn || !n.experimentMethod) return null;
    const a = n.experimentAdv || {}; const advantages = [];
    ['haste','efficiency','insight','lore'].forEach(k => { for(let i = 0; i < (Number(a[k]) || 0); i++) advantages.push(k); });
    return { method: n.experimentMethod, advantages, artCraftRelated: !!n.experimentArtCraft };
  },
  researchMethodMishap(method){ const m = (window.ACKS.EXPERIMENT_METHODS || {})[method]; return m ? m.mishapTier : 'minor'; },
  researchNewCommit(){
    const ch = this.characterEditing; if(!ch) return;
    const n = this.researchNew;
    const r = window.ACKS.startResearchProject(this.currentCampaign, {
      kind: n.kind, researcherCharacterId: ch.id, config: this._researchNewConfig(),
      assistantCharacterIds: n.assistantIds.slice(), magicDomain: n.magicDomain || null,
      commonSpell: !!n.commonSpell, fromFormula: !!n.fromFormula, fromSample: !!n.fromSample,
      experiment: this._researchExperiment()
    });
    if(r && r.ok){
      this.markDirty(); this.schedulePersist();
      this.researchModalOpen = false;
      this.showToast('⚗ ' + this.researchKindLabel(n.kind) + ' begun' + (r.materialShort ? ' (⚠ material cost exceeds funds — purse is negative)' : '') + '.');
    } else {
      this.researchNewMsg = 'Cannot start: ' + ((r && r.reason) || 'unknown') + (r && r.minLevel ? (' (needs L' + r.minLevel + ')') : '');
    }
  },
  // Per-project reads + the throw flow
  researchProjectRate(p){ return p ? Math.round(window.ACKS.totalResearchRate(this.currentCampaign, p)) : 0; },
  researchProjectDays(p){ const d = p ? window.ACKS.researchDaysRemaining(this.currentCampaign, p) : 0; return (d === Infinity) ? '∞' : d; },
  // Realistic completion ETA in MONTHLY turns (the accrual cadence): labour accrues rate×30/turn, so
  // months = ceil(remaining ÷ (rate×30)). Pairs with researchProjectDays (days-of-dedicated-work) to
  // resolve the "N days remaining but advances monthly" mismatch — this is when the pool actually fills.
  researchProjectMonths(p){ if(!p) return '∞'; const A = window.ACKS; const rate = A.totalResearchRate(this.currentCampaign, p); if(!(rate > 0)) return '∞'; const remaining = Math.max(0, (p.researchCostGp||0) - (p.researchInvestedGp||0)); const m = Math.max(1, Math.ceil(remaining / (rate*30))); return m + ' monthly turn' + (m===1?'':'s'); },
  researchProjectThrow(p){ return p ? window.ACKS.researchThrowInfo(this.currentCampaign, p) : null; },
  researchArcaneAvailable(ch){ return (ch && window.ACKS.arcanePowerAvailable) ? window.ACKS.arcanePowerAvailable(this.currentCampaign, ch.id) : 0; },
  researchComponentsHeld(ch){ return (ch && window.ACKS.specialComponentsHeldBy) ? (window.ACKS.specialComponentsHeldBy(this.currentCampaign, ch.id) || []) : []; },
  researchPlanFor(p){ if(!this.researchThrowPlan[p.id]) this.researchThrowPlan[p.id] = { arcanePowerGp: 0, specialItemValueGp: 0, miscGp: 0, inappropriateGp: 0 }; return this.researchThrowPlan[p.id]; },
  researchRoll(p){
    if(!p) return;
    const plan = this.researchPlanFor(p);
    const r = window.ACKS.payAndRollResearchThrow(this.currentCampaign, p.id, { componentPlan: Object.assign({}, plan) });
    if(r && r.ok){
      this.markDirty(); this.schedulePersist();
      const rolled = r.throwResult ? (r.throwResult.total + ' vs ' + r.throwResult.target) : 'no throw';
      this.researchThrowMsg[p.id] = r.succeeded
        ? ('✓ Success — ' + rolled + '. ' + this._researchResultText(p))
        : ('✗ Failed — ' + rolled + '. All ' + (r.lostGp||0).toLocaleString() + 'gp lost.' + (r.mishap ? (' ⚠ ' + r.mishap.tier + ' mishap — GM resolves (RR pp.412+).') : ''));
      this.showToast(r.succeeded
        ? ('⚗ ' + (p.name || 'Research') + ' succeeds!' + (r.breakthrough ? (' 🌟 ' + r.breakthrough.level + ' breakthrough!') : ''))
        : ('💥 ' + (p.name || 'Research') + ' fails — ' + (r.lostGp||0).toLocaleString() + 'gp lost.' + (r.mishap ? (' A ' + r.mishap.tier + ' mishap!') : '')));
    } else {
      this.researchThrowMsg[p.id] = 'Cannot roll: ' + ((r && r.reason) || 'unknown') + (r && r.componentCostGp ? (' (need ' + r.componentCostGp.toLocaleString() + 'gp components, assembled ' + (r.assembled||0).toLocaleString() + ')') : '');
    }
  },
  _researchResultText(p){
    const kr = p && p.kindResult; if(!kr) return '';
    let base = '';
    if(kr.mode === 'immediate') base = kr.note || 'The ritual takes effect (GM resolves).';
    else if(kr.mode === 'stored') base = (kr.note || 'The ritual is stored as a single charge.') + ' (see the maker’s Inventory / World items).';
    else if(kr.notableItemId) base = 'A new magic item is crafted (see the maker’s Inventory / World items).';
    else if(kr.identified) base = 'The item’s properties are now known.';
    else if(kr.groupId){
      const g = (this.currentCampaign.groups || []).find(x => x && x.id === kr.groupId);
      const nm = (g && g.name) || 'The creature';
      base = (kr.count > 1 ? (kr.count + '× ') : '') + nm + (kr.controlled
        ? ' is created under your command (see World ▸ 🐉 Monsters / Inspector).'
        : ' is created — but it slipped your control (disposition: ' + (kr.disposition || 'hostile') + ').');
    }
    else if(kr.formula) base = 'Formula gained: ' + kr.formula + (kr.note ? (' — ' + kr.note) : '');
    // Experiment breakthrough (AD-M4) — appended to whatever the base result is.
    const bt = kr.breakthrough ? (' 🌟 ' + kr.breakthrough.level + ' breakthrough — ' + (kr.breakthrough.note || '')) : '';
    return base + bt;
  },
  researchAbandon(p){ if(!p) return; if(!confirm('Abandon "' + (p.name || p.kind) + '"? Material + invested research are forfeit.')) return; window.ACKS.abandonResearchProject(this.currentCampaign, p.id, 'gm-action'); this.markDirty(); this.schedulePersist(); },
  // Phase 4 — Magic Research (AD-M1) · the character-sheet ⚗ Research panel. Transient form state.
  researchModalOpen: false,      // the New-research modal (null = closed)
  researchNew: { kind: 'spell-research', spellLevel: 1, effectType: 'one-use', itemKind: 'potion',
                 charges: 10, activationRate: '1/day', permanentDuration: '1-day', enchantBonus: 1,
                 spellLevelsImbued: 1, targetName: '', commonSpell: false, fromFormula: false, fromSample: false,
                 assistantIds: [], magicDomain: '', ritualKey: '', ritualLevel: 7, mode: 'immediate', storedForm: 'scroll',
                 experimentOn: false, experimentMethod: 'conventional', experimentAdv: { haste: 0, efficiency: 0, insight: 0, lore: 0 }, experimentArtCraft: false },
  researchNewMsg: '',
  researchThrowPlan: {},          // per-project component plan being assembled (keyed by project id)
  researchThrowMsg: {},           // per-project last throw message
  });
})();
