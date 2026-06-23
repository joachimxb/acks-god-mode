/* =============================================================================
 * domain-app-generators.js — ACKS God Mode app mixin: NPC Generators UI
 * =============================================================================
 *
 * NPC Generators UI, extracted from domain-app.js (T5 chip 8, 2026-06-23) — pure code-motion: a
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

  // ─── burst8 (team session) — per-agent state + methods. Each builder appends its
  //     object properties (`propName(){…},` / `stateVar: …,`) right AFTER its OWN marker
  //     line below — disjoint anchors → clean 6-way merge. Wrap your block in a
  //     `// === <Topic> (team) ===` header. Do NOT edit another lane's marker. ───
  // === @b8-generators (team) — NPC Generator G1: state + methods ===
  // NPC Generator G1 (Phase 4.8 §2.1) — the Generation door. genRoll() builds a PREVIEW Character
  // (not yet landed); genCommit() lands the SAME object + emits the `generation` event. The
  // full-vs-lightweight choice is a plain detailLevel param (no house rule — manifest houseRules:[]).
  genForm: { targetLevel:'', classKey:'', race:'human', settlementId:'', detailLevel:'full', attributeMethod:'3d6', seed:'' },
  genPreview: null,
  genLastSeed: null,
  genPreviewChar(){ return this.genPreview ? this.genPreview.character : null; },
  genClassOptions(){
    const A = window.ACKS;
    const keys = (typeof A.seedClassTemplates==='function') ? A.seedClassTemplates().map(t=>({ key:t.key, label:t.displayName||t.key })) : [];
    const camp = this.currentCampaign;
    if(camp && Array.isArray(camp.customClasses)) camp.customClasses.forEach(c=>{ if(c && c.key && !keys.find(k=>k.key===c.key)) keys.push({ key:c.key, label:c.displayName||c.key }); });
    return keys;
  },
  genSettlementOptions(){
    const camp = this.currentCampaign;
    if(!camp || !Array.isArray(camp.settlements)) return [];
    return camp.settlements.map(s=>({ id:s.id, name:s.name||s.id }));
  },
  _genCtxOpts(seed){
    const f = this.genForm, camp = this.currentCampaign;
    const ctx = {};
    if(f.targetLevel!=='' && f.targetLevel!=null) ctx.targetLevel = Math.max(0, Math.min(14, parseInt(f.targetLevel,10)||0));
    if(f.classKey) ctx.class = f.classKey;
    if(f.race) ctx.race = f.race;
    if(f.settlementId){ ctx.settlementId = f.settlementId; const st=(camp.settlements||[]).find(s=>s.id===f.settlementId); if(st){ if(st.hexId) ctx.hexId=st.hexId; if(st.domainId) ctx.domainId=st.domainId; } }
    const opts = { detailLevel: (f.detailLevel==='lightweight'?'lightweight':'full'), attributeMethod: f.attributeMethod, seed };
    return { ctx, opts };
  },
  genRoll(){
    if(!this.currentCampaign){ this.showToast('Load a campaign first.', 3000, 'warn'); return; }
    const seed = (this.genForm.seed!=='' && this.genForm.seed!=null) ? this.genForm.seed : ('npc-' + Math.floor(Math.random()*1e9));
    this.genLastSeed = seed;
    const { ctx, opts } = this._genCtxOpts(seed);
    try { this.genPreview = window.ACKS.generateNPC(this.currentCampaign, ctx, opts); }
    catch(e){ this.showToast('Generation failed: ' + e.message, 4000, 'error'); this.genPreview = null; }
  },
  genReroll(){ this.genForm.seed = ''; this.genRoll(); },
  genCommit(){
    if(!this.genPreview) return;
    const { opts } = this._genCtxOpts(this.genLastSeed);
    const c = window.ACKS.landGeneratedNPC(this.currentCampaign, this.genPreview, opts);
    this.genPreview = null;
    this.markDirty(); this.schedulePersist();
    this.showToast('🧙 ' + (c ? c.name : 'NPC') + ' added to the roster.', 4000, 'success');
  },
  // === @b12-voyages    (team) — Voyages deferred seams (vessel-construction / marines / port-repair): state + methods ===
  // === @b12-generators (team) — NPC Generator G2 (rosters / entourages / deep-links): state + methods ===
  // The batch-generation card on the 🧙 Generators tab (below the G1 single-NPC card). Calls the shipped
  // ACKS.generateRoster / generateEntourage / generateNpcParty (which READ the census open-slot
  // accessors read-only — never editing the Demographics roster, the @b12-census lane's region), shows
  // a reviewable PREVIEW (per-row ⟳ via regenProposal / ✕ drop), and lands the keepers via landRoster
  // (one shipped `generation` event per NPC). Ungated GM tooling — distinct from the census's gated
  // SD-2b auto-fill. Reuses G1's genClassOptions() / genSettlementOptions().
  genBatch: { mode:'roster', settlementId:'', domainId:'', count:6, minLevel:'', maxLevel:'', classKey:'',
    race:'', detailLevel:'full', seed:'', useCensusSlots:false, leaderLevel:5, companions:3, partyName:'' },
  // the three batch modes (in JS, so the apostrophe in "Ruler's court" is safe — an Alpine attribute
  // expression is HTML-decoded first, so an inline &#39; would break the string literal).
  genBatchModes: [{ k:'roster', l:'🏘 Settlement roster' }, { k:'entourage', l:"👑 Ruler's court" }, { k:'party', l:'🎒 NPC party' }],
  genBatchPreview: [],
  genBatchSeed: null,
  genBatchPartyName: '',
  genBatchDomainOptions(){
    const ds = this.domains || (this.currentCampaign && this.currentCampaign.domains) || [];
    return ds.map(d => ({ id:d.id, name:d.name || d.id }));
  },
  genBatchHasCensus(){ return typeof window.ACKS.demographicOpenNotableSlots === 'function'; },
  _genBatchSettlement(){ const c=this.currentCampaign; return (c && Array.isArray(c.settlements)) ? (c.settlements.find(s=>s && s.id===this.genBatch.settlementId) || null) : null; },
  genBatchOpenSlotsText(){
    const st = this._genBatchSettlement(); if(!st || !this.genBatchHasCensus()) return '';
    const minL = (this.genBatch.minLevel!=='' && this.genBatch.minLevel!=null) ? (parseInt(this.genBatch.minLevel,10)||1) : 1;
    const slots = window.ACKS.demographicOpenNotableSlots(this.currentCampaign, st, { minLevel:minL }) || [];
    const n = slots.reduce((s,x)=>s+x.open,0);
    return n ? ('— ' + n + ' open at L≥' + minL) : '— none open at this level';
  },
  genBatchEntourageText(){
    const A=window.ACKS; if(typeof A.realmCommandStructure!=='function' || !this.genBatch.domainId) return '';
    const rc = A.realmCommandStructure(this.currentCampaign, this.genBatch.domainId); if(!rc) return '';
    const open = rc.offices.filter(o=>!o.filled && o.mapsTo==='entourage' && o.bucket);
    if(!open.length) return (rc.titleLabel||'Realm') + ' — every court office is filled; a small generic court will be generated.';
    return (rc.titleLabel||'Realm') + ' — open court offices: ' + open.map(o=>o.label + ' (L' + o.expectedLevel + ')').join(', ') + '.';
  },
  genBatchRun(){
    if(!this.currentCampaign){ this.showToast('Load a campaign first.', 3000, 'warn'); return; }
    const b = this.genBatch;
    const seed = (b.seed!=='' && b.seed!=null) ? b.seed : ('batch-' + Math.floor(Math.random()*1e9));
    this.genBatchSeed = seed;
    const opts = { detailLevel: (b.detailLevel==='lightweight'?'lightweight':'full'), seed };
    const num = v => (v!=='' && v!=null) ? Number(v) : undefined;
    try {
      if(b.mode==='roster'){
        const ctx = { settlementId: b.settlementId || null, count: num(b.count), minLevel: num(b.minLevel), maxLevel: num(b.maxLevel),
          race: b.race || undefined, useCensusSlots: !!(b.settlementId && b.useCensusSlots) };
        if(b.classKey && !ctx.useCensusSlots) ctx.class = b.classKey;
        this.genBatchPreview = window.ACKS.generateRoster(this.currentCampaign, ctx, opts);
        this.genBatchPartyName = '';
      } else if(b.mode==='entourage'){
        if(!b.domainId){ this.showToast('Pick a realm first.', 3000, 'warn'); return; }
        this.genBatchPreview = window.ACKS.generateEntourage(this.currentCampaign, b.domainId, Object.assign({}, opts, { race: b.race || undefined }));
        this.genBatchPartyName = '';
      } else if(b.mode==='party'){
        const party = window.ACKS.generateNpcParty(this.currentCampaign, Object.assign({}, opts, {
          leaderLevel: num(b.leaderLevel), companions: num(b.companions), leaderClass: b.classKey || undefined,
          race: b.race || undefined, partyName: b.partyName || undefined }));
        this.genBatchPreview = [party.leader].concat(party.companions || []).filter(Boolean);
        this.genBatchPartyName = party.partyName;
      }
    } catch(e){ this.showToast('Generation failed: ' + e.message, 4000, 'error'); this.genBatchPreview = []; return; }
    if(!this.genBatchPreview.length) this.showToast('Nothing generated for this context.', 3000);
  },
  genBatchRerollOne(i){
    const p = this.genBatchPreview[i]; if(!p) return;
    const re = window.ACKS.regenProposal(this.currentCampaign, p, { detailLevel: (this.genBatch.detailLevel==='lightweight'?'lightweight':'full'), seed: 'reroll-' + Math.floor(Math.random()*1e9) });
    this.genBatchPreview.splice(i, 1, re);
  },
  genBatchRemove(i){ this.genBatchPreview.splice(i, 1); },
  genBatchClear(){ this.genBatchPreview = []; this.genBatchPartyName = ''; },
  genBatchCommit(){
    if(!this.genBatchPreview.length) return;
    const landed = window.ACKS.landRoster(this.currentCampaign, this.genBatchPreview.slice(), {});
    this.genBatchPreview = []; this.genBatchPartyName = '';
    if(this.markDirty) this.markDirty(); if(this.schedulePersist) this.schedulePersist();
    this.showToast('👥 ' + landed.length + ' NPC' + (landed.length===1?'':'s') + ' added to the roster.', 4000, 'success');
  },
  });
})();
