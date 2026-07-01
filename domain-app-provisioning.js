/* =============================================================================
 * domain-app-provisioning.js — ACKS God Mode app mixin (Movement 2.0 Lane D)
 * =============================================================================
 *
 * The per-mover PROVISIONING & LOAD UI: a regime-toggle strip + a group food/water-per-day readout +
 * the carrying-capacity / share-load line. Rendered on BOTH the Journey detail AND the party view (D8),
 * over the acks-engine-provisioning.js accessors (moverRegimeState / toggleMoverRegimeFlag /
 * moverConsumptionPerDay / groupHaulCapacity / groupShareLoadReport / balanceGroupLoad).
 *
 * Pure UI over the engine — no engine logic here. Registers a members object on
 * window.__ACKS_APP_MIXINS__; domainApp() merges it into the component. Members use this.* /
 * window.ACKS.* only. H1: the strip uses .seg-tab/.tab-active pills + token colours only (no raw
 * palette family — palette.smoke.js gates the build); inline 🍖/💧/🐴/📦 match the adjacent supplies
 * tracker's established data-label emoji, buttons carry no chrome glyph.
 * ============================================================================= */
(function(){
  'use strict';
  var M = (window.__ACKS_APP_MIXINS__ = window.__ACKS_APP_MIXINS__ || []);
  M.push({
  // ── Movement 2.0 Lane D — Provisioning & load (regime strip + consumption readout) ──
  // `mover` is any actor the engine resolves: a journey object (journey detail) or a party (party view).
  provRegimeState(mover){ const A = window.ACKS; return (A && A.moverRegimeState) ? A.moverRegimeState(this.currentCampaign, mover) : {}; },
  provConsumption(mover){ const A = window.ACKS; return (A && A.moverConsumptionPerDay) ? A.moverConsumptionPerDay(this.currentCampaign, mover) : { people:{count:0,rationsPerDay:0,waterPerDay:0,breakdown:{}}, animals:{count:0,foodSt:0,waterSt:0}, unitScale:false }; },
  provHaul(mover){ const A = window.ACKS; return (A && A.groupHaulCapacity) ? A.groupHaulCapacity(this.currentCampaign, mover) : { totalSt:0, memberSt:0, memberCount:0, hireCount:0, animalCount:0 }; },
  provLoadReport(mover){ const A = window.ACKS; return (A && A.groupShareLoadReport) ? A.groupShareLoadReport(this.currentCampaign, mover) : { members:[], slowestMilesPerDay:null, balanced:{ improves:false, slowestMilesPerDay:null } }; },
  // The regime toggles rendered in the strip. `type` drives the pill: 'bool' (on/off), 'tri' (auto → skip → force).
  provRegimeToggles(){
    return [
      { key:'skipEncounters',   type:'bool', on:'No encounters',  off:'Encounters',  title:'Per-mover: skip the per-hex wilderness encounter draw for this mover (live via the Move/Journey step). RAW default = encounters on.' },
      { key:'skipProvisioning', type:'tri',  label:'Rations',      title:'Per-mover food/water tracking. Auto = follow the ⚙ ignore-rations house rule; Skip = never track for this mover; Track = always track. (Per-mover consumption seam is a Foundation follow-on; the global rule governs today.)' },
      { key:'skipEncumbrance',  type:'tri',  label:'Encumbrance',  title:'Per-mover encumbrance. Auto = follow the ⚙ ignore-encumbrance house rule; Skip = ignore load for this mover; Track = always track. (Per-mover consumption seam is a Foundation follow-on; the global rule governs today.)' },
      { key:'shareRations',     type:'bool', on:'Share rations',   off:'Own stores',  title:'ON = the whole group pools food + water (camp-first, leader-priority). OFF = each eats from their own stores (RR-literal; a hire eats from its employer). Drives the shipped survival sourcing.' },
      { key:'shareLoad',        type:'bool', on:'Share load',      off:'Slowest sets pace', title:'ON = the group evens its carried gear to travel at a better band (RR pp.83–84); OFF = the slowest-loaded walker sets the pace. Use “Balance load” to apply.' }
    ];
  },
  // The subset shown as the party's standing "operating rules" strip (Movement 2.0 rework, Joachim
  // 2026-07-01): Encounters / Rations / Encumbrance — the rules the party travels + provisions under.
  // shareRations / shareLoad are NOT here — they're tick-boxes in the Provisioning section instead.
  provOperatingToggles(){ return this.provRegimeToggles().filter(t => t.key==='skipEncounters' || t.key==='skipProvisioning' || t.key==='skipEncumbrance'); },
  provRegimePillLabel(mover, t){
    const rs = this.provRegimeState(mover); const st = rs[t.key] || {};
    if(t.type === 'bool') return st.value ? t.on : t.off;
    // tri-state: show the mode
    return t.label + ': ' + (st.mode === 'skip' ? 'Skip' : (st.mode === 'force' ? 'Track' : 'Auto'));
  },
  provRegimePillActive(mover, t){
    const rs = this.provRegimeState(mover); const st = rs[t.key] || {};
    return (t.type === 'bool') ? !!st.value : (st.mode && st.mode !== 'auto');
  },
  provToggleRegime(mover, key){
    const A = window.ACKS; if(!A || !A.toggleMoverRegimeFlag) return;
    A.toggleMoverRegimeFlag(this.currentCampaign, mover, key);
    this.markDirty(); this.schedulePersist();
  },
  provBalanceLoad(mover){
    const A = window.ACKS; if(!A || !A.balanceGroupLoad) return;
    const res = A.balanceGroupLoad(this.currentCampaign, mover);
    this.markDirty(); this.schedulePersist();
    this.showToast(res && res.moved ? ('⚖ Load balanced — ' + res.moved + ' item' + (res.moved === 1 ? '' : 's') + ' handed around (max ' + res.maxAfterSt + ' st).') : 'Nothing to rebalance — the load is already even.');
  }
  });
})();
