/* =============================================================================
 * domain-app-military-w7.js — ACKS God Mode app mixin
 * =============================================================================
 *
 * The Military W7 conscripts / militia / training UI (RR pp.430–433) + the F&D
 * call-to-arms surface (burst4 team-session).
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
  // ===== burst4 team-session — Alpine state + methods. Each builder adds its props/getters/methods after ITS marker, each ending in a trailing comma (valid JS). =====
  // burst4 agent-1 (Military W7 — army-troops-depth + fd-troops-effects):
  // === Military W7 (burst4) — conscripts/militia/training (RR pp.430–433) + the F&D
  //     Call-to-Arms/Troops materialization readout. All read/mutate through window.ACKS. ===
  armyTroopDepthRows(army){
    if(!army || !this.currentCampaign) return [];
    const rows = (window.ACKS.armyTroopSourceBreakdown(this.currentCampaign, army)) || [];
    const icon = { mercenary:'💰', conscript:'⚒', militia:'🛡', vassal:'👑', clanhold:'⚔', follower:'🏰', slave:'⛓' };
    return rows.map(r => ({ ...r, icon: icon[r.source] || '•' }));
  },
  // (The army-levy methods moved to the Domain ▸ Military tab — see domainLevyFrom / domainTrainLevy /
  // domainSendMilitiaUnitHome etc.; conscripts & militia are a DOMAIN's manpower, called up at muster.)
  // F&D card — the materialized Call-to-Arms / Troops force (RR pp.433–434 + p.348).
  fdIsTroopMuster(o){ return !!o && (o.kind === 'call-to-arms' || o.kind === 'troops'); },
  fdMaterializedForce(o){
    if(!o || !Array.isArray(o.materializedUnitIds) || !o.materializedUnitIds.length || !this.currentCampaign) return null;
    const camp = this.currentCampaign;
    const n = o.materializedUnitIds.map(id => (camp.units || []).find(u => u && u.id === id)).filter(Boolean).reduce((s, u) => s + (u.count || 0), 0);
    if(o.kind === 'call-to-arms'){
      const army = (camp.armies || []).find(a => a && a.id === o.materializedArmyId);
      return { label: '🎖 Mustered ' + n.toLocaleString() + ' light infantry into ' + (army ? (army.name || 'the host') : 'the host'), armyId: army ? army.id : null };
    }
    return { label: '🛡 The lord stationed ' + n.toLocaleString() + ' light infantry under the vassal (no wages, RR p.348)', armyId: null };
  },
  // === end Military W7 (burst4) ===
  // burst4 agent-2 (Politics P-1 — realm-senate panel):
  // Politics P-1 — the realm-senate readout (data-layer surface; the visible Senate tab is P-5).
  // Resolves the senate governing a domain's realm (at the apex) — null when none (dormant-until-used).
  realmSenateOf(domain){
    if(!domain || !this.currentCampaign || !window.ACKS || !window.ACKS.senateForDomain) return null;
    return window.ACKS.senateForDomain(this.currentCampaign, domain);
  },
  // A compact, GM-facing summary of the realm's senate: seats, the live vote tally, ruling/leading
  // faction (DERIVED), the factions with their live influence + standing, and the dispute/benefit
  // state. Returns null when the realm has no senate. Browser-verify: acksApp.realmSenateReadout(d).
  realmSenateReadout(domain){
    const A = window.ACKS; const c = this.currentCampaign;
    const senate = this.realmSenateOf(domain);
    if(!senate || !A) return null;
    const factions = (A.factionsForSenate(c, senate.id) || []).map(f => ({
      id: f.id, name: f.name || f.id, influence: A.factionTotalInfluence(c, f), standing: A.factionStanding(c, f)
    })).sort((a, b) => b.influence - a.influence);
    const seated = A.senatorshipsForSenate(c, senate.id) || [];
    return {
      senate, name: senate.name || senate.id, kind: senate.kind, seats: senate.seats,
      totalVotes: A.senateTotalVotes(c, senate),
      inDispute: senate.dispute != null,
      benefitsActive: A.senateBenefitsActive(c, domain),
      rulingFactionId: A.senateRulingFactionId(c, senate),
      leadingFactionId: A.senateLeadingFactionId(c, senate),
      factions,
      leadingSenators: seated.filter(s => s.rank === 'leading').length,
      independentVotes: senate.independentMinorSenatorVotes || 0
    };
  },
  // Admin-verb create for a Politics entity (senate/faction/senatorship): spawn a blank via the
  // factory, push to the (defensively-ensured) collection, and open it in the Inspector edit form.
  // The guided Senate Wizard (the Action verb) is P-5; this is the free-form Admin path.
  politicsCreate(kind, opts){
    const A = window.ACKS; const c = this.currentCampaign;
    if(!c){ alert('Create or open a campaign first.'); return null; }
    const map = { senate: ['senates', 'blankSenate'], faction: ['factions', 'blankFaction'], senatorship: ['senatorships', 'blankSenatorship'] };
    const m = map[kind];
    if(!m || !A || typeof A[m[1]] !== 'function') return null;
    if(!Array.isArray(c[m[0]])) c[m[0]] = [];
    const ent = A[m[1]](opts || {});
    c[m[0]].push(ent);
    this.markDirty(); this.schedulePersist();
    this.inspectorOpenInspect(kind, ent.id);
    return ent;
  },
  // burst4 agent-3 (Character Lifecycle CL-1 — char-sheet aging readout):
  characterAgingLine(ch){
    const A = window.ACKS;
    if(!ch || !A || typeof A.characterAgingInfo !== 'function') return '';
    const info = A.characterAgingInfo(ch);
    if(info.age == null) return '';
    if(info.ageless) return (info.categoryLabel || 'Adult') + ' · ageless';
    let s = info.categoryLabel || '';
    if(info.pendingSave){
      s += ' · ⚠ death-from-old-age save (' + info.pendingSave.thresholdKey + ') due in ' + info.pendingSave.dueInMonths + ' mo';
    } else if(info.nextOldAgeSave){
      s += ' · next old-age save at ' + info.nextOldAgeSave.age;
    }
    return s;
  },
  rollCharacterStartingAge(ch){
    const A = window.ACKS;
    if(!ch || !A || typeof A.rollStartingAge !== 'function') return;
    const age = A.rollStartingAge(ch.class || '');
    this.commitStatEdit({ entityType:'character', entityId:ch.id, entity:ch, fieldPath:'age', label:'Age', oldValue:(ch.age == null ? null : ch.age), newValue:age });
    this.showToast('🎲 Rolled starting age ' + age + ' (' + A.startingAgeSpecFor(ch.class || '') + ')', 4000);
  },
  // burst4 agent-4 (Voyages V1 — vessels panel / Inspector helpers):
  // Phase 3 Voyages (#145) — Admin verb: spawn a blank Vessel + open it in the Inspector edit form
  // (mirrors inspectorCreateBlankJourney/Army). init-on-write campaign.vessels (no migrate injector →
  // templates stay migrate-no-ops). The GM then picks a class (catalogKey) + crew + owner.
  inspectorCreateBlankVessel() {
    if (!this.currentCampaign) { alert('Create or open a campaign first.'); return; }
    if (!Array.isArray(this.currentCampaign.vessels)) this.currentCampaign.vessels = [];
    const v = window.ACKS.blankVessel({ name: 'New Vessel' });
    this.currentCampaign.vessels.push(v);
    this.markDirty(); this.schedulePersist();
    this.inspectorOpenInspect('vessel', v.id);
    this.inspectorEditMode = true;
    if (this.showToast) this.showToast('New Vessel created — pick a class (catalogKey), set crew + owner.');
  },
  // panel:vessels — a light read surface backing a future "Vessels" card (the Inspector is the
  // primary V1 UI; a visible card is a thin V6 follow-up). All catalog-backed, browser-verifiable now.
  voyagesVessels() { return (this.currentCampaign && this.currentCampaign.vessels) || []; },
  voyagesVesselCatalogOptions() { return (window.ACKS.vesselCatalogList ? window.ACKS.vesselCatalogList() : []).map(c => ({ key: c.key, label: c.label })); },
  voyagesVesselClassLabel(key) { return window.ACKS.vesselClassLabel ? window.ACKS.vesselClassLabel(key) : (key || ''); },
  voyagesVesselSummary(v) {
    if (!v) return '';
    const cls = window.ACKS.vesselClass ? window.ACKS.vesselClass(v) : null;
    const name = v.name || (cls && cls.label) || v.id;
    const klass = cls ? cls.label : (v.catalogKey || '—');
    const shp = (v.shp != null ? v.shp : (cls ? cls.shp : '?')) + (cls ? '/' + cls.shp : '');
    return name + ' · ' + klass + ' · SHP ' + shp + ' · ' + (v.condition || 'seaworthy');
  },
  });
})();
