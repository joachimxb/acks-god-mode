/* =============================================================================
 * domain-app-voyages.js — ACKS God Mode app mixin
 * =============================================================================
 *
 * The Voyages V6 (2026-06-17) Vessel / voyage UI — the Vessels card + detail modal,
 * the voyage start branch, the journey voyage block + day-log lines.
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
  // ============================ Voyages V6 (2026-06-17) — the Vessel/voyage UI ============================
  // The first user-facing surface over the V1–V5 engine: a Vessels card (Travel sub-view) + the voyage
  // Start-a-Journey branch + the journey-detail voyage block + the hex-card Water section. Pure UI over the
  // shipped accessors (createVessel / vesselClass / vesselFullCrew / vesselForJourney / voyageContinuousSailEligible
  // / fishActivity …); every edit routes through gm-fiat (commitStatEdit). No engine change.

  // -- Vessels card --
  voyagesNewVessel: { name:'', catalogKey:'' },
  voyagesVesselRow(v){
    const A = window.ACKS; const cls = (v && A.vesselClass) ? A.vesselClass(v) : null;
    const cc = (v && v.crewComplement) || {};
    const full = (v && A.vesselFullCrew) ? A.vesselFullCrew(v) : { sailors:0, rowers:0, marines:0 };
    const ccSet = (Number(cc.sailors)||0) + (Number(cc.rowers)||0) + (Number(cc.marines)||0) > 0;
    return {
      name: (v && v.name) || (cls && cls.label) || (v && v.id) || '',
      classLabel: cls ? cls.label : ((v && v.catalogKey) || '— pick a class'),
      shp: (v && v.shp != null) ? v.shp : (cls ? cls.shp : '?'), maxShp: cls ? cls.shp : null,
      condition: (v && v.condition) || 'seaworthy',
      draft: cls ? cls.draftFt : null,
      sailMi: cls ? cls.voyageSailMi : null, oarMi: cls ? cls.voyageOarMi : null,
      crewLine: ccSet ? ((cc.sailors||0)+'/'+full.sailors+' sail · '+(cc.rowers||0)+'/'+full.rowers+' row · '+(cc.marines||0)+'/'+full.marines+' mar')
                      : ('full assumed ('+full.sailors+' sail · '+full.rowers+' row)'),
      damaged: !!(v && A.vesselIsDamaged && A.vesselIsDamaged(v))
    };
  },
  voyagesCreateVesselSubmit(){
    if(!this.currentCampaign){ alert('Create or open a campaign first.'); return; }
    const A = window.ACKS; const nv = this.voyagesNewVessel;
    const v = A.createVessel(this.currentCampaign, { name:(nv.name||'').trim()||'New Vessel', catalogKey:nv.catalogKey||'', createdAtTurn:this.currentCampaign.currentTurn||null });
    this.voyagesNewVessel = { name:'', catalogKey:'' };
    this.markDirty(); this.schedulePersist();
    this.openVesselDetail(v.id);
    this.showToast('🚢 Vessel created — set crew, owner & hex; assign it to a journey to sail.');
  },

  // -- Vessel detail modal --
  vesselDetailId: null,
  vesselDetail(){ const A=window.ACKS; return (A && A.findVessel) ? A.findVessel(this.currentCampaign, this.vesselDetailId) : null; },
  openVesselDetail(id){ this.vesselDetailId = id; },
  closeVesselDetail(){ this.vesselDetailId = null; },
  vesselDetailClass(){ const A=window.ACKS; const v=this.vesselDetail(); return (v && A.vesselClass) ? A.vesselClass(v) : null; },
  vesselDetailOfficers(){ const A=window.ACKS; const v=this.vesselDetail(); return (v && A.vesselOfficers) ? A.vesselOfficers(this.currentCampaign, v) : []; },
  vesselDetailHasMaster(){ const A=window.ACKS; const v=this.vesselDetail(); return !!(v && A.vesselHasMasterMariner && A.vesselHasMasterMariner(this.currentCampaign, v)); },
  vesselDetailHasNavigator(){ const A=window.ACKS; const v=this.vesselDetail(); return !!(v && A.vesselHasNavigator && A.vesselHasNavigator(this.currentCampaign, v)); },
  vesselDetailHold(){ const A=window.ACKS; const v=this.vesselDetail(); return (v && A.vesselHold) ? A.vesselHold(this.currentCampaign, v) : null; },
  vesselDetailEnsureHold(){ const A=window.ACKS; const v=this.vesselDetail(); if(!v||!A.ensureVesselHold) return; A.ensureVesselHold(this.currentCampaign, v); this.markDirty(); this.schedulePersist(); this.showToast('Cargo hold created (a vessel-hold Stash).'); },
  vesselDetailOwnerLabel(){ const A=window.ACKS; const v=this.vesselDetail(); if(!v) return '— none'; const o = A.vesselOwner ? A.vesselOwner(this.currentCampaign, v) : null; return o ? ((o.entity.name||o.entity.id)+' ('+o.kind+')') : '— none'; },
  voyagesOwnerOptions(){
    const c = this.currentCampaign; if(!c) return [];
    const chars = (c.characters||[]).map(x=>({ id:x.id, label:(x.name||x.id)+' · character' }));
    const doms  = (this.domains||c.domains||[]).map(d=>({ id:d.id, label:(d.name||d.id)+' · domain' }));
    return chars.concat(doms);
  },
  voyagesHexOptions(){ return this.journeyHexOptions ? this.journeyHexOptions() : []; },
  vesselDetailScurvyLine(){ const v=this.vesselDetail(); if(!v||typeof v.shipStores!=='number') return ''; const d=v.daysAtSeaWithoutFreshFood||0; const bits=[]; if(v.scurvy) bits.push('⚠ scurvy aboard'); if(d) bits.push(d+' day'+(d===1?'':'s')+' since fresh food (onset at 30)'); return bits.join(' · '); },
  vesselFishUI(){
    const A=window.ACKS; const v=this.vesselDetail(); if(!v) return;
    if(!A.shipStoresTracked(v)){ this.showToast('Set "Ship stores" to a number first — the crew-provisioning layer is opt-in.', 4500); return; }
    const r = A.fishActivity(this.currentCampaign, v, {});
    this.markDirty(); this.schedulePersist();
    this.showToast(r.success ? ('🎣 Fished — +1 day of stores (Survival '+r.rolled+(r.bonus?('+'+r.bonus):'')+' vs 14+). Stores now '+r.newStores+'.')
                             : ('🎣 No catch (Survival '+r.rolled+(r.bonus?('+'+r.bonus):'')+' vs 14+).'), 4500);
  },

  // -- voyage Start-a-Journey wizard branch --
  voyageWizardVessel(){ const A=window.ACKS; return (this.journeyWizard.shipId && A.findVessel) ? A.findVessel(this.currentCampaign, this.journeyWizard.shipId) : null; },
  voyageWizardCrewLine(){
    const A=window.ACKS; const v=this.voyageWizardVessel(); if(!v) return '';
    const cc=v.crewComplement||{}; const full=A.vesselFullCrew(v);
    const set=(Number(cc.sailors)||0)+(Number(cc.rowers)||0)+(Number(cc.marines)||0)>0;
    if(!set) return 'crew: full complement assumed ('+full.sailors+' sail · '+full.rowers+' row)';
    const under=((cc.sailors||0)<full.sailors)||((cc.rowers||0)<full.rowers);
    return (under?'⚠ undercrewed — ':'crew ')+(cc.sailors||0)+'/'+full.sailors+' sail · '+(cc.rowers||0)+'/'+full.rowers+' row';
  },
  voyageWizardSpeedLine(){
    const A=window.ACKS; const v=this.voyageWizardVessel(); if(!v) return ''; const cls=A.vesselClass(v); if(!cls) return '';
    const parts=[]; if(cls.voyageSailMi!=null) parts.push('sail '+cls.voyageSailMi+' mi/day'); if(cls.voyageOarMi!=null) parts.push('oar '+cls.voyageOarMi+' mi/day');
    return parts.join(' · ')+' base — wind & point of sail modify it';
  },
  voyageWizardContinuousEligible(){ const A=window.ACKS; const v=this.voyageWizardVessel(); return !!(v && A.voyageContinuousSailEligible && A.voyageContinuousSailEligible(this.currentCampaign, {}, v)); },

  // -- journey-detail voyage block --
  journeyVessel(j){ const A=window.ACKS; return (A && A.vesselForJourney) ? A.vesselForJourney(this.currentCampaign, j||this.journeyDetail()) : null; },
  journeyVoyageVesselOptions(){ return (this.currentCampaign && this.currentCampaign.vessels) || []; },
  journeyAssignVessel(j, vesselId){
    if(!j) return; const id = vesselId || '';
    this.commitStatEdit({ entityType:'journey', entityId:j.id, entity:j, fieldPath:'shipId', label:'Vessel', oldValue:j.shipId||null, newValue:id||null, suppressFromCampaignLog:true });
    if(id && (j.mode||'foot')==='foot') this.commitStatEdit({ entityType:'journey', entityId:j.id, entity:j, fieldPath:'mode', label:'Mode', oldValue:j.mode||'foot', newValue:'voyage-sail', suppressFromCampaignLog:true });
    if(!id && (j.mode||'').startsWith('voyage-')) this.commitStatEdit({ entityType:'journey', entityId:j.id, entity:j, fieldPath:'mode', label:'Mode', oldValue:j.mode, newValue:'foot', suppressFromCampaignLog:true });
  },
  setJourneyPropulsion(j, val){ if(!j) return; this.commitStatEdit({ entityType:'journey', entityId:j.id, entity:j, fieldPath:'propulsion', label:'Propulsion', oldValue:j.propulsion||'auto', newValue:val||'auto', suppressFromCampaignLog:true }); },
  toggleJourneyContinuous(j){ if(!j) return; this.commitStatEdit({ entityType:'journey', entityId:j.id, entity:j, fieldPath:'continuousSailing', label:'Continuous sailing', oldValue:!!j.continuousSailing, newValue:!j.continuousSailing, suppressFromCampaignLog:true }); },
  journeyContinuousEligible(j){ const A=window.ACKS; const v=this.journeyVessel(j); return !!(v && A.voyageContinuousSailEligible && A.voyageContinuousSailEligible(this.currentCampaign, j||{}, v)); },
  setJourneyRiverCurrentSpeed(j, speed){ if(!j) return; const next = speed ? Object.assign({ heading:'downriver' }, j.riverCurrent||{}, { speed }) : null; this.commitStatEdit({ entityType:'journey', entityId:j.id, entity:j, fieldPath:'riverCurrent', label:'River current', oldValue:j.riverCurrent||null, newValue:next, suppressFromCampaignLog:true }); },
  setJourneyRiverCurrentHeading(j, heading){ if(!j||!j.riverCurrent) return; const next = Object.assign({}, j.riverCurrent, { heading:heading||'downriver' }); this.commitStatEdit({ entityType:'journey', entityId:j.id, entity:j, fieldPath:'riverCurrent', label:'River current', oldValue:j.riverCurrent, newValue:next, suppressFromCampaignLog:true }); },
  voyageDayLine(d){
    const vo = d && d.voyage; if(!vo) return '';
    const parts = ['⛵ ' + (vo.propulsion||'sail')];
    if(vo.windLabel) parts.push(vo.windLabel + ' wind');
    if(vo.pointOfSailLabel) parts.push(vo.pointOfSailLabel);
    if(vo.masterMariner) parts.push('master mariner');
    if(vo.continuousSailing) parts.push('24h sailing ×2');
    if(vo.riverCurrent && vo.riverCurrent.mi) parts.push('current ' + (vo.riverCurrent.mi>0?'+':'') + vo.riverCurrent.mi + ' mi (' + vo.riverCurrent.speed + ', ' + vo.riverCurrent.heading + ')');
    if(vo.weathering) parts.push(vo.weathering + (vo.weatheringSpeedMult<1 ? (' ×'+vo.weatheringSpeedMult) : ''));
    if(vo.provision && vo.provision.level && vo.provision.level!=='fed') parts.push(vo.provision.level + (vo.provision.speedMult<1 ? (' ×'+(Math.round(vo.provision.speedMult*100)/100)) : ''));
    if(vo.crewDamageFactor!=null && vo.crewDamageFactor<1) parts.push('crew/damage ×'+(Math.round(vo.crewDamageFactor*100)/100));
    return parts.join(' · ');
  },
  voyageDayHazardLine(d){
    const vo = d && d.voyage; if(!vo) return '';
    const out = [];
    if(vo.hazards) for(const h of vo.hazards){ out.push(h.success ? ('cleared '+h.hazard) : ('✗ '+h.hazard+(h.shpDamage?(' — '+h.shpDamage+' SHP'):'')+(h.grounded?' — grounded':''))); }
    if(vo.gale) out.push('gale damage '+vo.gale.shpDamage+' SHP ('+vo.gale.hoursCaught+'h caught)');
    if(vo.grounded) out.push(vo.grounded==='too-shallow' ? '⚓ aground — too shallow for its draft' : ('⚓ aground: '+vo.grounded));
    if(vo.provision && vo.provision.scurvyOnset) out.push('⚠ scurvy breaks out');
    if(vo.provision && vo.provision.scurvyCured) out.push('scurvy cured (fresh food)');
    return out.join(' · ');
  },

  // -- hex-card Water section --
  hexNauticalHazardOptions(){ const A=window.ACKS; const HZ=(A && A.NAUTICAL_HAZARDS)||{}; return Object.keys(HZ).map(k=>({ key:k, label:HZ[k].label||k })); },
  // burst4 agent-5 (Delves D2 — world-dungeons sub-view / Inspector helpers):
  dungeonsSearch: '',
  // The campaign's dungeons (read defensively — campaign.delves is not lazy-injected; dungeons is).
  worldDungeons(){ return (this.currentCampaign && this.currentCampaign.dungeons) || []; },
  filteredDungeons(){
    const q = (this.dungeonsSearch || '').trim().toLowerCase();
    const all = this.worldDungeons();
    if(!q) return all;
    return all.filter(d => {
      if(!d) return false;
      const hx = (this.dungeonHexLabel(d) || '').toLowerCase();
      return ((d.name || '').toLowerCase().includes(q)) || hx.includes(q) || ((d.id || '').toLowerCase().includes(q));
    });
  },
  // Lifecycle overlay (attuned > owned > stored status) — derived (dungeonLifecycleLabel).
  dungeonLifecycle(d){
    return (window.ACKS && window.ACKS.dungeonLifecycleLabel) ? window.ACKS.dungeonLifecycleLabel(this.currentCampaign, d) : (d && d.status) || '';
  },
  // Encounters remaining — authored count, or the living-lair count for a stocked dungeon.
  dungeonEncountersLeft(d){
    return (window.ACKS && window.ACKS.dungeonEncountersRemaining) ? window.ACKS.dungeonEncountersRemaining(this.currentCampaign, d) : ((d && d.encountersRemaining) || 0);
  },
  dungeonHexLabel(d){
    if(!d || !d.hexId) return '— unplaced';
    const h = this.currentCampaign && ((this.currentCampaign.hexes || []).find(x => x && x.id === d.hexId));
    if(!h) return d.hexId;
    return (window.ACKS && window.ACKS.hexName) ? hexLabelFor(h) : (h.coord ? ('(' + h.coord.q + ',' + h.coord.r + ')') : d.hexId);
  },
  dungeonSizeLevelLabel(d){
    const size = (d && d.size) || 'small';
    const lvl = (d && d.dungeonLevel) || 1;
    return size.charAt(0).toUpperCase() + size.slice(1) + ' · L' + lvl;
  },
  // Admin-verb create: spawn a blank Dungeon (both facets; arcane reserved-null) + open the
  // schemaForm edit. The guided Foray Wizard (the Action verb) is D3.
  inspectorCreateBlankDungeon(){
    if(!this.currentCampaign){ alert('Create or open a campaign first.'); return; }
    if(!Array.isArray(this.currentCampaign.dungeons)) this.currentCampaign.dungeons = [];
    const d = window.ACKS.blankDungeon({ name: 'New Dungeon' });
    this.currentCampaign.dungeons.push(d);
    this.markDirty(); this.schedulePersist();
    this.currentView = 'inspector';   // jump to the editor (Author from the World ▸ Dungeons sub-view too)
    this.inspectorOpenInspect('dungeon', d.id);
    this.inspectorEditMode = true;
    if(this.showToast) this.showToast('New Dungeon created — set its hex, size, level, and encounter count. (The abstract-foray resolver + Foray Wizard land in D3.)');
  },
  // Admin-verb create: spawn a blank Delve (init-on-writes campaign.delves[] — it isn't lazy-injected).
  inspectorCreateBlankDelve(){
    if(!this.currentCampaign){ alert('Create or open a campaign first.'); return; }
    if(!Array.isArray(this.currentCampaign.delves)) this.currentCampaign.delves = [];
    const dl = window.ACKS.blankDelve({ name: 'New Delve' });
    this.currentCampaign.delves.push(dl);
    this.markDirty(); this.schedulePersist();
    this.currentView = 'inspector';   // jump to the editor (Author from the World ▸ Dungeons sub-view too)
    this.inspectorOpenInspect('delve', dl.id);
    this.inspectorEditMode = true;
    if(this.showToast) this.showToast('New Delve created — link it to a dungeon + add participants. The multi-foray resolution is D3.');
  },
  });
})();
