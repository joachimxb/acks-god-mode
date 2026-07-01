/* =============================================================================
 * domain-app-mounts.js — ACKS God Mode app mixin
 * =============================================================================
 *
 * The Mounts (Phase 2.5 MO-4) Inventory-tab UI — acquire / train / assign / feed.
 *
 * Extracted verbatim from domain-app.js (T5 chip 6, 2026-06-23) — pure code-motion.
 * Registers a members object on window.__ACKS_APP_MIXINS__; domainApp() merges it
 * into the component (descriptor-preserving). Members use this.* / window.ACKS.* only.
 * Loaded via <script src> after domain-app.js, before Alpine’s deferred init.
 * ============================================================================= */
(function(){
  'use strict';
  var M = (window.__ACKS_APP_MIXINS__ = window.__ACKS_APP_MIXINS__ || []);
  M.push({
  // ============================ Mounts (Phase 2.5 MO-4, 2026-06-22) — the Inventory-tab UI ============================
  // The 🐴 Mounts card in a character's Inventory tab: acquire from MOUNT_CATALOG, list each mount with its
  // load band + load-adjusted expedition speed + feeding status, toggle it onto the rider's active journey,
  // open it in the Inspector for full editing (barding / cargo / role / rider), and remove it. Pure UI over
  // the MO-1..MO-3 engine (mountsOwnedBy / mountLoadBand / mountExpeditionMi / mountFeedingStatus / createMount).
  mountNew: { catalogKey:'', training:'' },
  characterMounts(ch){ const A=window.ACKS; return (ch && A.mountsOwnedBy) ? A.mountsOwnedBy(this.currentCampaign, ch.id) : []; },
  mountCatalogOptions(){ const A=window.ACKS; return (A && A.mountCatalogList) ? A.mountCatalogList().map(c=>({ key:c.key, label:c.label })) : []; },
  mountTrainingOptions(catalogKey){ const A=window.ACKS; const c = (A && A.findMountClass) ? A.findMountClass(catalogKey) : null; return (c && Array.isArray(c.trainings)) ? c.trainings.slice() : ['draft']; },
  mountRow(m){
    const A=window.ACKS; const c=this.currentCampaign; const cls=(m && A.mountClass)?A.mountClass(m):null;
    const band=(A.mountLoadBand)?A.mountLoadBand(c,m):'full';
    const feeding=(A.mountFeedingStatus)?A.mountFeedingStatus(m):'healthy';
    return {
      name:(m && m.name) || (cls?cls.label:((m&&m.catalogKey)||'mount')),
      breed: cls?cls.label:((m&&m.catalogKey)||'—'),
      training:(m&&m.training)||'', role:(m&&m.role)||'mount',
      band, mi:(A.mountExpeditionMi)?A.mountExpeditionMi(c,m):(cls?cls.expeditionMi:0),
      load:(A.mountCurrentLoadSt)?Math.round(A.mountCurrentLoadSt(c,m)*10)/10:0,
      norm:(A.mountNormalLoadSt)?A.mountNormalLoadSt(m):(cls?cls.normalLoadSt:0),
      max:(A.mountMaxLoadSt)?A.mountMaxLoadSt(m):(cls?cls.maxLoadSt:0),
      feeding,
      bandColor: band==='overloaded'?'#b91c1c':(band==='half'?'#b45309':'#15803d'),
      feedColor: feeding==='healthy'?'#15803d':(feeding==='hungry'?'#b45309':'#b91c1c')
    };
  },
  mountAcquireSubmit(ch){
    if(!this.currentCampaign){ alert('Open a campaign first.'); return; }
    if(!ch || !this.mountNew.catalogKey) return;
    const A=window.ACKS; const camp=this.currentCampaign; const cls=A.findMountClass(this.mountNew.catalogKey);
    const training=this.mountNew.training || this.mountTrainingOptions(this.mountNew.catalogKey)[0];
    const rideable=!!(cls && cls.rideable);
    const m=A.createMount(camp, { catalogKey:this.mountNew.catalogKey, training, role: rideable?'mount':'pack',
      ownerCharacterId:ch.id, riderCharacterId: rideable?ch.id:null, currentHexId:ch.currentHexId||null, createdAtTurn:camp.currentTurn||null });
    // record-only audit (mount-acquired) — the canonical apply+log path
    try {
      const ev=A.newEvent('mount-acquired', { payload:{ mountId:m.id, catalogKey:m.catalogKey, ownerCharacterId:ch.id, training, narrative:(ch.name||'Someone')+' acquired a '+(cls?cls.label:'mount')+(training?(' ('+training+')'):'') }, submittedBy:'gm', targetTurn:camp.currentTurn||1, status:'applied' });
      const out=A.applyEvent(camp, ev); ev.appliedAtTurn=camp.currentTurn||1; ev.result=out.result;
      (camp.eventLog=camp.eventLog||[]).push({ event:ev, result:out.result, appliedAtTurn:ev.appliedAtTurn, appliedAt:new Date().toISOString() });
    } catch(e){ /* audit is best-effort; the mount is already created */ }
    this.mountNew={ catalogKey:'', training:'' };
    this.markDirty(); this.schedulePersist();
    this.showToast('🐴 '+(cls?cls.label:'Mount')+' acquired.');
  },
  mountActiveJourney(ch){ const A=window.ACKS; if(!ch || !ch.currentJourneyId || !A.findJourney) return null; const j=A.findJourney(this.currentCampaign, ch.currentJourneyId); return (j && j.status==='in-transit') ? j : null; },
  mountOnActiveJourney(m, ch){ const j=this.mountActiveJourney(ch); return !!(j && Array.isArray(j.packAnimalIds) && j.packAnimalIds.indexOf(m.id)>=0); },
  mountToggleJourney(m, ch){
    const j=this.mountActiveJourney(ch); if(!j){ this.showToast('No active journey — start one for '+(ch.name||'this character')+' first.'); return; }
    j.packAnimalIds=Array.isArray(j.packAnimalIds)?j.packAnimalIds:[];
    const i=j.packAnimalIds.indexOf(m.id);
    if(i>=0){ j.packAnimalIds.splice(i,1); this.showToast('Mount removed from the journey.'); }
    else { j.packAnimalIds.push(m.id); this.showToast('🐴 Mount added to the journey — it now sets the pace + needs feeding.'); }
    this.markDirty(); this.schedulePersist();
  },
  mountRemove(m){
    if(!m || !this.currentCampaign) return;
    if(!confirm('Remove '+((m.name)||'this mount')+'? (Its cargo is discarded.)')) return;
    const camp=this.currentCampaign;
    camp.mounts=(camp.mounts||[]).filter(x=>x && x.id!==m.id);
    (camp.journeys||[]).forEach(j=>{ if(Array.isArray(j.packAnimalIds)) j.packAnimalIds=j.packAnimalIds.filter(id=>id!==m.id); });
    this.markDirty(); this.schedulePersist(); this.showToast('Mount removed.');
  },
  // -- Journey-panel mount readouts (MO-4) — surface mounts per traveller + the herd's feed in the Journey Detail --
  journeyMounts(j){ const A=window.ACKS; return (j && A.mountsForJourney) ? A.mountsForJourney(this.currentCampaign, j) : []; },
  journeyMemberMount(j, ch){ if(!ch) return null; return this.journeyMounts(j).find(m => m && m.role==='mount' && m.riderCharacterId===ch.id) || null; },
  journeyMemberMountRow(j, ch){ const m=this.journeyMemberMount(j, ch); return m ? this.mountRow(m) : null; },
  journeyPackAnimals(j){ const ids=(j && j.participantCharacterIds)||[]; return this.journeyMounts(j).filter(m => !(m.role==='mount' && m.riderCharacterId && ids.indexOf(m.riderCharacterId)>=0)); },
  journeyAnimalFeedSummary(j){
    const A=window.ACKS; const mounts=this.journeyMounts(j); if(!mounts.length) return null;
    const sup=(j && j.supplies)||{};
    const needF=mounts.reduce((s,m)=> s + (A.mountIsMarchGrazer(m)?0:(A.mountDailyFoodSt(m)||0)), 0);  // only march-grazers (donkey/steppe) feed free while marching; an ox draws its feed (RR p.276)
    const feed=Number(sup.animalFeed)||0, water=Number(sup.animalWater)||0;
    return { count:mounts.length, feed, water, days: needF>0 ? Math.floor(feed/needF) : null };
  },
  });
})();
