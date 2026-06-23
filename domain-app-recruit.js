/* =============================================================================
 * domain-app-recruit.js — ACKS God Mode app mixin: Recruitment (hirelings + realm-scale) UI
 * =============================================================================
 *
 * Recruitment (hirelings + realm-scale) UI, extracted from domain-app.js (T5 chip 8, 2026-06-23) — pure code-motion: a
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
  recruitModalDomain(){ const id = this.recruitModal && this.recruitModal.domainId; return id ? (this.domains || []).find(d => d && d.id === id) : null; },
  recruitModalTier(){ const d = this.recruitModalDomain(); return d ? (window.ACKS.realmRecruitTierForDomain(this.currentCampaign, d) || '—') : '—'; },
  recruitModalPeriodWord(){ const p = window.ACKS.realmRecruitPeriodDays(this.recruitModalTier()); return p === 360 ? 'years' : p === 90 ? 'seasons' : p === 30 ? 'months' : 'weeks'; },
  recruitModalTreasury(){ const d = this.recruitModalDomain(); if(!d) return 0; return window.ACKS.domainTreasuryGp ? window.ACKS.domainTreasuryGp(this.currentCampaign, d.id) : ((d.treasury && d.treasury.gp) || 0); },
  recruitTypeRowsFor(domain){
    const A = window.ACKS;
    if(!domain || !A.realmRecruitMercTypes) return [];
    return A.realmRecruitMercTypes().map(key => {
      const row = A.findTroopType ? A.findTroopType(key, { race: 'man' }) : null;
      return { key, label: key.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
               available: A.domainRealmRecruitAvailable(this.currentCampaign, domain, key),
               wage: (A.mercWage ? A.mercWage(key, 'man') : null),
               br: row ? row.brPerCreature : 0 };
    });
  },
  recruitModalTypeRows(){ const d = this.recruitModalDomain(); return d ? this.recruitTypeRowsFor(d) : []; },
  recruitModalChosen(){ return this.recruitModalTypeRows().find(r => r.key === this.recruitModal.typeKey) || null; },
  recruitModalAvailable(){ const c = this.recruitModalChosen(); return c ? c.available : 0; },
  recruitModalFeeText(){ const spec = window.ACKS.realmRecruitFeeSpec(this.recruitModalTier()); return spec ? spec.text : '—'; },
  recruitModalCanSubmit(){ const c = this.recruitModalChosen(); if(!c) return false; const n = Math.floor(Number(this.recruitModal.count) || 0); return n >= 1 && n <= c.available; },
  recruitSpecialistDomain(){ const id = this.recruitSpecialistModal && this.recruitSpecialistModal.domainId; return id ? (this.domains || []).find(d => d && d.id === id) : null; },
  recruitSpecialistTier(){ const d = this.recruitSpecialistDomain(); return d ? (window.ACKS.realmRecruitTierForDomain(this.currentCampaign, d) || '—') : '—'; },
  recruitSpecialistPeriodWord(){ const p = window.ACKS.realmRecruitPeriodDays(this.recruitSpecialistTier()); return p === 360 ? 'years' : p === 90 ? 'seasons' : p === 30 ? 'months' : 'weeks'; },
  recruitSpecialistTypeRowsFor(domain){
    const A = window.ACKS;
    if(!domain || !A.realmSpecialistTypes) return [];
    return A.realmSpecialistTypes().map(key => {
      const prof = A.realmSpecialistProfile(key) || {};
      return { key, label: prof.label || key, available: A.domainRealmSpecialistAvailable(this.currentCampaign, domain, key) };
    });
  },
  recruitSpecialistTypeRows(){ const d = this.recruitSpecialistDomain(); return d ? this.recruitSpecialistTypeRowsFor(d) : []; },
  recruitSpecialistChosen(){ return this.recruitSpecialistTypeRows().find(r => r.key === this.recruitSpecialistModal.typeKey) || null; },
  recruitSpecialistProfileText(){
    const prof = window.ACKS.realmSpecialistProfile(this.recruitSpecialistModal.typeKey);
    if(!prof) return '—';
    const bits = [];
    if(prof.level) bits.push('L' + prof.level);
    bits.push(prof.wageGp ? prof.wageGp + 'gp/mo' : 'wage GM-set');
    if(prof.isOfficer) bits.push('LA ' + prof.leadershipAbility + ' · SA +' + prof.strategicAbility + ' (RR p.171)');
    return bits.join(' · ');
  },
  recruitSpecialistCanSubmit(){ const c = this.recruitSpecialistChosen(); return !!(c && c.available >= 1); },
  recruitState: null,
  _recruitStartPick: '',          // patron-picker scratch state (declared so

  // ─── Recruit sub-tab workflow (Phase 2.95 §4.2 / §310.3f) ────────────────
  recruitStart(patronId){
    const patron = patronId
      ? (this.currentCampaign && this.currentCampaign.characters || []).find(c => c.id === patronId)
      : null;
    // Detect patron's home settlement + market class. Priority:
    // 1) Settlement on patron.currentHexId.
    // 2) First settlement in any domain the patron rules.
    // 3) Fallback: any settlement in the campaign.
    // Critical: use the SAME id-generation as recruitSettlementOptions so the
    // detected id actually selects in the dropdown.
    let detectedSettlementId = '';
    let detectedMarketClassIdx = 2; // default Class III
    if(patron){
      const sets = this.allSettlements ? this.allSettlements() : [];
      const idFor = (s) => s.settlement.id;   // T6 single-home — settlements always carry an id
      // (1) patron's currentHexId — find which settlement entry sits on that hex
      if(patron.currentHexId){
        for(const s of sets){
          const hex = window.ACKS.findHex(this.currentCampaign, s.hexId);
          if(hex && hex.id === patron.currentHexId){
            detectedSettlementId = idFor(s);
            detectedMarketClassIdx = this.recruitMarketClassStrToIdx(s.marketClass);
            break;
          }
        }
      }
      // (1.5) patron's currentDomainId — find a settlement in that domain
      if(!detectedSettlementId && patron.currentDomainId){
        const inDomain = sets.find(s => s.domainId === patron.currentDomainId);
        if(inDomain){
          detectedSettlementId = idFor(inDomain);
          detectedMarketClassIdx = this.recruitMarketClassStrToIdx(inDomain.marketClass);
        }
      }
      // (2) first settlement in any domain the patron rules
      if(!detectedSettlementId){
        const ruledIds = (this.domains||[]).filter(d => d.rulerCharacterId === patron.id).map(d => d.id);
        const inRuled = sets.find(s => ruledIds.indexOf(s.domainId) >= 0);
        if(inRuled){
          detectedSettlementId = idFor(inRuled);
          detectedMarketClassIdx = this.recruitMarketClassStrToIdx(inRuled.marketClass);
        }
      }
      // (3) any settlement
      if(!detectedSettlementId && sets.length > 0){
        detectedSettlementId = idFor(sets[0]);
        detectedMarketClassIdx = this.recruitMarketClassStrToIdx(sets[0].marketClass);
      }
    }
    // Auto-pick roleDomainId when the patron rules exactly one domain.
    let autoRoleDomainId = '';
    let defaultDestKind = 'company'; // landless default
    if(patron){
      const ruled = (this.domains||[]).filter(d => d.rulerCharacterId === patron.id);
      if(ruled.length === 1) autoRoleDomainId = ruled[0].id;
      if(ruled.length >= 1) defaultDestKind = 'garrison';
    }
    this.recruitState = {
      patronCharacterId: patron ? patron.id : '',
      patron: patron || null,
      hireCategory: 'henchman',
      hireTypeId: '',
      marketClassIdx: detectedMarketClassIdx,
      settlementId: detectedSettlementId,
      settlementAutoDetected: !!detectedSettlementId,
      monthlyOffer: 0,
      roleToFill: '',
      roleDomainId: autoRoleDomainId,
      commandUnitId: '',
      // R3 — the persistent solicitation drive lives on the patron
      // (character.recruitmentDrives[]); the wizard holds only its id. Null until
      // "Start soliciting". Replaces the old instant solicitResult / solicitWeeksUsed.
      driveId: null,
      engagedIds: [],
      // §310.3f-fix13 — id→candidate map for NEW individuations this session.
      // Resurfaced candidates (kind='candidate' already in camp.characters via
      // persistence rule) are not duplicated here — recruitCandidate falls
      // through to camp.characters when not found in the pool.
      candidatePool: {},
      negotiations: {},
      mercenaryHireCount: 0,
      destinationKind: defaultDestKind,    // 'garrison' | 'company' — for mercenary hires
      targetGarrisonUnitId: '',            // #548 — '' = auto-merge to first same-type, '__new__' = force new, else unit id
    };
    // R3 — resume an in-flight drive. A drive started earlier (and advanced across
    // days by the global Day Clock) persists on the patron; adopt it so re-entering
    // Recruit picks up where it left off, locking the setup to the drive's params.
    if(patron && window.ACKS && window.ACKS.recruitmentDrivesForPatron){
      const open = window.ACKS.recruitmentDrivesForPatron(this.currentCampaign, patron.id)
        .find(d => d && (d.status === 'active' || d.status === 'complete'));
      if(open){
        this.recruitState.driveId = open.id;
        this.recruitState.hireCategory = open.hireCategory;
        this.recruitState.hireTypeId = open.hireTypeId;
        this.recruitState.marketClassIdx = open.marketClassIdx;
        if(open.settlementId) this.recruitState.settlementId = open.settlementId;
        const row = this.recruitCurrentRow();
        if(row && typeof row.wage === 'number') this.recruitState.monthlyOffer = row.wage;
      }
    }
  },
  recruitMarketClassStrToIdx(s){
    if(!s) return 2;
    const v = String(s).replace(/\*$/, '');
    const map = { 'I':0, 'II':1, 'III':2, 'IV':3, 'V':4, 'VI':5 };
    return (v in map) ? map[v] : 2;
  },
  recruitSettlementOptions(){
    const sets = this.allSettlements ? this.allSettlements() : [];
    return sets.map(s => ({
      id: s.settlement.id,
      label: (s.settlement.name || '(unnamed)') + ' · Class ' + s.marketClass + ' · ' + s.domainName,
      marketClass: s.marketClass
    }));
  },
  recruitOnSettlementChange(){
    const s = this.recruitState; if(!s) return;
    const opts = this.recruitSettlementOptions();
    const picked = opts.find(o => o.id === s.settlementId);
    if(picked){
      s.marketClassIdx = this.recruitMarketClassStrToIdx(picked.marketClass);
      s.settlementAutoDetected = false;
    }
  },
  recruitPatronLocationDescription(){
    const s = this.recruitState; if(!s || !s.patron) return '';
    const ch = s.patron;
    if(this.characterLocationLabel) return this.characterLocationLabel(ch);
    return ch.currentHexId || '—';
  },
  recruitHenchmanCap(){
    const s = this.recruitState; if(!s || !s.patron) return { current: 0, cap: 0 };
    const ch = s.patron;
    const cap = (window.ACKS && window.ACKS.computeHenchmanCap) ? window.ACKS.computeHenchmanCap(ch) : Math.max(0, ((ch.abilities?.CHA ?? 10) - 10) / 2 + 4);
    const current = (this.currentCampaign?.characters||[]).filter(c => c.liegeCharacterId === ch.id && ACKS.isHenchman(c) && ACKS.isActive(c)).length;
    return { current, cap };
  },
  recruitBlockedByHenchmanCap(){
    const s = this.recruitState; if(!s) return false;
    if(s.hireCategory !== 'henchman') return false;
    const cap = this.recruitHenchmanCap();
    return cap.cap > 0 && cap.current >= cap.cap;
  },
  // Persuasion proficiency auto-detect (RR p.165 / §348). Reads the patron's
  // proficiencies[] array and returns the ones that grant a +1 to the
  // Reaction-to-Hiring roll. Case-insensitive substring match — proficiencies
  // can have ranks or extra annotation (e.g. "Diplomacy 2") and still match.
  recruitPatronPersuasionProfs(){
    const s = this.recruitState; if(!s || !s.patron) return [];
    const profs = (s.patron.proficiencies || []).map(p => String((p && (p.key || p.name || p.label)) || p || '').toLowerCase().replace(/-/g, ' ').trim());   // PT-0: canonical {key}, de-hyphenated for 'mystic aura' etc.
    if(profs.length === 0) return [];
    const opts = [
      { id: 'diplomacy',    label: 'Diplomacy',    match: 'diplomacy' },
      { id: 'intimidation', label: 'Intimidation', match: 'intimidation' },
      { id: 'mystic-aura',  label: 'Mystic Aura',  match: 'mystic aura' },
      { id: 'seduction',    label: 'Seduction',    match: 'seduction' }
    ];
    return opts.filter(o => profs.some(p => p.includes(o.match)));
  },
  // Deep-link helper (§343). Starts a recruitment session from a context outside
  // the Recruit sub-tab (Officers Magistrates / Specialists / Henchmen boxes,
  // Military Garrison Units), pre-filling patron + category + role and
  // navigating into the workflow. Caller passes only the bits they know;
  // omitted fields fall through to recruitStart defaults.
  recruitDeepLink(opts){
    opts = opts || {};
    if(!opts.patronId){ this.showToast('No patron in this context — pick a ruler first.'); return; }
    // Capture origin BEFORE recruitStart so we can return after submit/cancel.
    const origin = {
      view: this.currentView,
      rosterSubView: this.rosterSubView,
      activitiesSubView: this.activitiesSubView,
      selectedDomainId: this.selectedDomainId,
      activeTab: this.activeTab
    };
    this.recruitStart(opts.patronId);
    if(!this.recruitState) return;
    this.recruitState.origin = origin;
    // §310.3f-fix4 — when role-targeted, pre-pick the most-likely hire type.
    // Set values directly without calling recruitOnCategoryChange (which would
    // reset hireTypeId). Apply the type-change side-effects manually.
    const roleDefaults = {
      chaplain:       { category:'henchman',   typeId:'henchman-3' },
      captainOfGuard: { category:'henchman',   typeId:'henchman-3' },
      munerator:      { category:'specialist', typeId:'quartermaster' },
      steward:        { category:'specialist', typeId:'sage' }
    };
    // R3 — if recruitStart adopted an in-flight drive, its category/type are fixed; skip the deep-link override.
    const def = (!this.recruitState.driveId && opts.roleToFill) ? roleDefaults[opts.roleToFill] : null;
    if(def){
      this.recruitState.hireCategory = def.category;
      this.recruitState.hireTypeId   = def.typeId;
      // Replicate recruitOnTypeChange's wage-fill so the offer auto-populates.
      const row = this.recruitCurrentRow();
      if(row && typeof row.wage === 'number') this.recruitState.monthlyOffer = row.wage;
    } else if(!this.recruitState.driveId && opts.category){
      this.recruitState.hireCategory = opts.category;
      this.recruitOnCategoryChange();
    }
    if(opts.roleToFill)   this.recruitState.roleToFill   = opts.roleToFill;
    if(opts.roleDomainId) this.recruitState.roleDomainId = opts.roleDomainId;
    this.currentView      = 'activities';
    this.activitiesSubView = 'recruit';
  },
  // §310.3f-fix4 — true when chosen settlement matches patron's current hex.
  recruitPatronAtSettlement(){
    const s = this.recruitState; if(!s || !s.patron || !s.settlementId) return true;
    const sets = (this.allSettlements ? this.allSettlements() : []);
    const idFor = (x) => x.settlement.id;   // T6 single-home — settlements always carry an id
    const match = sets.find(x => idFor(x) === s.settlementId);
    if(!match) return true;
    const hex = window.ACKS.findHex(this.currentCampaign, match.hexId);   // T6 single-home
    if(!hex) return true;
    return s.patron.currentHexId === hex.id;
  },
  // §310.3f-fix4 — Mercenary destination radio labels. Avoids inline
  // apostrophe escaping (which broke the x-text in the prior bundle).
  recruitCandidateUnits(){
    // #548 — Returns same-type units in the chosen mercenary destination, so the
    // recruiter can pick which existing unit absorbs the new recruits.
    const s = this.recruitState; if(!s || s.hireCategory !== 'mercenary') return [];
    const typeKey = s.hireTypeId;
    if(s.destinationKind === 'company'){
      const patron = this.recruitState && this.recruitState.patron;
      const units = window.ACKS.characterMercenaryUnits(this.currentCampaign, patron);
      return units.filter(u => u && u.unitTypeKey === typeKey);
    }
    if(s.destinationKind === 'garrison'){
      const doms = this.recruitPatronDomains();
      const d = doms[0]; if(!d) return [];
      const units = window.ACKS.domainGarrisonUnits(this.currentCampaign, d);
      return units.filter(u => u && u.unitTypeKey === typeKey);
    }
    return [];
  },
  recruitMercGarrisonLabel(){
    const doms = this.recruitPatronDomains();
    const domName = (doms[0] && doms[0].name) || "patron's domain";
    return 'Garrison at ' + domName;
  },
  recruitMercCompanyLabel(){
    const s = this.recruitState;
    const name = (s && s.patron && s.patron.name) || 'patron';
    return 'Private retinue in ' + name + "'s company";
  },

  // §310.4 / §310.3f-fix8 — split house-rule surface.
  //   recruitPersistOn  : are candidate Character records kept after the session?
  //   recruitResurfaceOn: do persisted candidates re-appear in future solicits?
  // Resurfacing requires persistence (you can't resurface what isn't saved).
  // §310.3f-fix17 — house rules are stored as {enabled: bool} objects, so use
  // the canonical isHouseRuleEnabled accessor rather than a raw === true.
  recruitPersistOn(){
    return this.isHouseRuleEnabled('persistent-hireling-candidates');
  },
  recruitResurfaceOn(){
    return this.recruitPersistOn() && this.isHouseRuleEnabled('persistent-hireling-resurfacing');
  },
  // Back-compat alias — old references to recruitPersistentRuleOn() still work.
  recruitPersistentRuleOn(){ return this.recruitPersistOn(); },
  recruitExistingCandidates(){
    const s = this.recruitState; if(!s) return [];
    if(!this.recruitResurfaceOn()) return [];
    if(s.hireCategory === 'mercenary') return [];  // mercenaries are count-level, no individuation
    if(!s.settlementId || !s.hireTypeId) return [];
    if(!window.ACKS || !window.ACKS.findPersistentCandidates) return [];
    const all = window.ACKS.findPersistentCandidates(this.currentCampaign, {
      settlementId: s.settlementId,
      hireCategory: s.hireCategory,
      hireTypeId:   s.hireTypeId,
      classRequired: this.recruitClassRequiredFromRole()
    });
    // Skip ones already engaged this session.
    return all.filter(c => !s.engagedIds.includes(c.id));
  },
  recruitEngageExisting(candidateId){
    const s = this.recruitState; if(!s) return;
    if(s.engagedIds.includes(candidateId)) return;
    s.engagedIds.push(candidateId);
    const available = this.recruitPatronPersuasionProfs();
    const defaultProf = (available.length === 1) ? available[0].id : '';
    s.negotiations[candidateId] = { signingBonusTier:'none', persuasionProficiency: defaultProf, situational:0, rollResult:null, decision:'pending' };
  },
  // §310.7 — Henchman level cap check (RR p.164: henchmen ≤ patron level − 1).
  // Returns { applies, ok, hireLevel, patronLevel, expectedMinPatron, strict }.
  recruitLevelCapCheck(){
    // §310.3f-fix12 — RR p.164: henchmen must be ≤ patron level − 1. RAW;
    // always enforced. No house-rule opt-in.
    const s = this.recruitState;
    const empty = { applies:false, ok:true, hireLevel:0, patronLevel:0, expectedMinPatron:0 };
    if(!s || !s.patron) return empty;
    if(s.hireCategory !== 'henchman') return empty;
    const row = this.recruitCurrentRow();
    if(!row) return empty;
    const hireLevel = Number(row.level || 0);
    // RR p.170 — henchmen judge an employer by his APPARENT level (appearance + living expenses),
    // not his true class level. With Living Expenses on, an underspender appears lower (and can hire
    // fewer); a profligate appears higher. apparentLevel falls back to the true level when the rule
    // is off or the spend hasn't been computed yet. (CoL-2, 2026-06-08.)
    const trueLevel = Number(s.patron.level || 1);
    const patronLevel = (window.ACKS && window.ACKS.apparentLevel)
      ? Number(window.ACKS.apparentLevel(this.currentCampaign, s.patron) || trueLevel)
      : trueLevel;
    const expectedMinPatron = hireLevel + 1;
    return {
      applies: true,
      ok: patronLevel >= expectedMinPatron,
      hireLevel, patronLevel, trueLevel, expectedMinPatron,
      apparentBelowTrue: patronLevel < trueLevel
    };
  },
  recruitBlockedByLevelCap(){
    const c = this.recruitLevelCapCheck();
    return c.applies && !c.ok;
  },
  // §310.3f-fix13 — Merge new pool entries into camp.characters according to
  // a selector. `select` is one of 'all' | 'hired' | 'none'. Resurfaced
  // candidates are skipped (they're already in camp.characters).
  recruitMergePoolToCampaign(select){
    const s = this.recruitState; if(!s) return;
    const camp = this.currentCampaign; if(!camp) return;
    if(!Array.isArray(camp.characters)) camp.characters = [];
    if(select === 'none') return;
    for(const cid of s.engagedIds){
      const c = s.candidatePool[cid];
      if(!c) continue;                                  // resurfaced — already in camp.characters
      if(camp.characters.some(x => x.id === c.id)) continue;
      if(select === 'hired'){
        const decision = s.negotiations[cid] && s.negotiations[cid].decision;
        if(decision !== 'hire') continue;
      }
      camp.characters.push(c);
    }
  },
  recruitReset(){
    // §310.3f-fix13 — Submit path runs recruitMergePoolToCampaign BEFORE
    // applyEvent. By the time recruitReset is called post-Submit, the
    // requested merges have already happened. So Submit's reset is a
    // simple state-clear.
    //
    // Cancel path calls recruitCancel (alias) which handles the persistence
    // decision before this runs. Same simple state-clear here.
    const s = this.recruitState;
    const origin = s && s.origin;
    this.recruitState = null;
    this._recruitStartPick = '';
    // §310.3f-fix6 — restore origin view if we deep-linked from elsewhere.
    if(origin){
      if(origin.view) this.currentView = origin.view;
      if(origin.rosterSubView) this.rosterSubView = origin.rosterSubView;
      if(origin.activitiesSubView) this.activitiesSubView = origin.activitiesSubView;
      if(origin.selectedDomainId) this.selectedDomainId = origin.selectedDomainId;
      if(origin.activeTab) this.activeTab = origin.activeTab;
    }
  },
  // §310.3f-fix13 — Cancel honors persistence. With persistence ON, all new
  // pool entries are saved (so Joachim's "don't lose earlier-individuated
  // henchmen" scenario works). With persistence OFF, the pool is simply
  // discarded — no records were ever in camp.characters in the first place.
  recruitCancel(){
    const select = this.recruitPersistOn() ? 'all' : 'none';
    this.recruitMergePoolToCampaign(select);
    this.recruitReset();
  },
  recruitRowsForCategory(){
    const s = this.recruitState; if(!s) return [];
    if(s.hireCategory === 'mercenary')  return (window.ACKS && window.ACKS.HIRELING_MERCENARIES)  || [];
    if(s.hireCategory === 'henchman')   return (window.ACKS && window.ACKS.HIRELING_HENCHMEN)   || [];
    if(s.hireCategory === 'specialist') return (window.ACKS && window.ACKS.HIRELING_SPECIALISTS)|| [];
    return [];
  },
  recruitCurrentRow(){
    const s = this.recruitState; if(!s || !s.hireTypeId) return null;
    return this.recruitRowsForCategory().find(r => r.id === s.hireTypeId);
  },
  recruitMarketClasses(){ return (window.ACKS && window.ACKS.HIRELING_MARKET_CLASSES) || []; },
  recruitOnCategoryChange(){
    const s = this.recruitState; if(!s) return;
    s.hireTypeId = ''; s.engagedIds = []; s.negotiations = {}; s.mercenaryHireCount = 0; s.candidatePool = {};
    s.roleToFill = '';
  },
  recruitOnTypeChange(){
    const s = this.recruitState; if(!s) return;
    const row = this.recruitCurrentRow();
    s.monthlyOffer = (row && typeof row.wage === 'number') ? row.wage : 0;
    // §310.3f-fix16 — also clear candidatePool so stale entries don't survive.
    s.engagedIds = []; s.negotiations = {}; s.mercenaryHireCount = 0; s.candidatePool = {};
  },
  recruitPatronDomains(){
    const s = this.recruitState; if(!s || !s.patronCharacterId) return [];
    return (this.domains||[]).filter(d => d.rulerCharacterId === s.patronCharacterId);
  },
  recruitRoleOptions(){
    const s = this.recruitState; if(!s) return [];
    if(s.hireCategory === 'mercenary') return [];
    const doms = this.recruitPatronDomains();
    if(doms.length === 0) return [];
    // If exactly one ruled domain and roleDomainId not yet set, treat it as
    // implicit. recruitOnPatronChange handles the auto-pick at recruitStart;
    // here we just resolve which domain we're filtering against.
    const dom = (this.domains||[]).find(d => d.id === s.roleDomainId) || (doms.length === 1 ? doms[0] : null);
    const allRoles = [
      { id:'captainOfGuard', label:'Captain of the Guard' },
      { id:'chaplain',       label:'Chaplain' },
      { id:'munerator',      label:'Munerator' },
      { id:'steward',        label:'Steward' }
    ];
    if(!dom) return allRoles; // no domain selected yet — surface all; UI prompts for domain
    const filled = dom.magistrates || {};
    return allRoles.filter(r => !filled[r.id] || !filled[r.id].characterId);
  },
  recruitClassRequiredFromRole(){
    const s = this.recruitState; if(!s) return '';
    if(s.roleToFill === 'chaplain') return 'Cleric';
    return '';
  },
  // ─── R3 — drive-based soliciting. The persistent drive lives on the patron
  // (character.recruitmentDrives[]); the GLOBAL Day Clock advances it (Day-Clock-only,
  // per Joachim) — no recruit-panel advance button. The wizard starts / shows / stops
  // the drive and engages candidates against its revealed pool. RR p.164.
  recruitActiveDrive(){
    const s = this.recruitState; if(!s || !s.driveId) return null;
    const list = (window.ACKS && window.ACKS.recruitmentDrivesForPatron)
      ? window.ACKS.recruitmentDrivesForPatron(this.currentCampaign, s.patronCharacterId) : [];
    return list.find(d => d && d.id === s.driveId) || null;
  },
  recruitRevealedAvailable(){
    const d = this.recruitActiveDrive();
    return d ? (d.revealedAvailable || 0) : 0;
  },
  // Days elapsed in the CURRENT soliciting week, 0..7 (RR p.164 — a week reveals at +7/+14/+21 days).
  // Counts game days since the start of the in-progress week (start, or the last week revealed).
  recruitDriveWeekDays(){
    const d = this.recruitActiveDrive(); if(!d || !this.currentCampaign) return 0;
    const c = this.currentCampaign;
    const ord = (((c.currentTurn || 1) - 1) * 30) + (c.currentDayInMonth || 1);
    const elapsed = Math.max(0, ord - (d.startedDayOrd || ord));
    return Math.max(0, Math.min(7, elapsed - (d.weeksRevealed || 0) * 7));
  },
  recruitDriveSummaryLine(){
    const d = this.recruitActiveDrive(); if(!d) return '';
    const cat = d.hireCategory ? (d.hireCategory.charAt(0).toUpperCase() + d.hireCategory.slice(1)) : '';
    const where = d.settlementId ? (' at ' + d.settlementId) : '';
    return cat + ' · ' + (d.hireTypeLabel || d.hireTypeId) + where;
  },
  // Start gate — a drive costs 1 ancillary/day (ongoing). Mirror the Forage ancillary
  // gate: block Start when the patron has no short-task room today. Also blocks the RAW
  // level / henchman caps + a zero-chance market. Returns { fits, reason, label }.
  recruitStartFits(){
    const s = this.recruitState;
    if(!s || !s.hireTypeId) return { fits:false, reason:'Pick a category and a type first.', label:'Start soliciting' };
    if(this.recruitNoChance()) return { fits:false, reason:'No chance of finding this hire type at this market — see Forecast.', label:'✗ No chance' };
    if(this.recruitBlockedByLevelCap()) return { fits:false, reason:'Over RAW level cap — pick a lower-level type or a higher-level patron.', label:'✗ Over level cap' };
    if(this.recruitBlockedByHenchmanCap()) return { fits:false, reason:'Patron at henchman cap — release a current henchman first.', label:'✗ At henchman cap' };
    const A = window.ACKS, c = s.patron;
    if(A && A.characterActivityBudget && c){
      const BUDGET = A.ACTIVITY_BUDGET || { dedicatedPerDay:1, ancillaryPerDedicatedDay:4, ancillaryMaxPerDay:12 };
      const b = A.characterActivityBudget(this.currentCampaign, c.id);
      const dedUsed = b.dedicatedUsed || 0, ancUsed = b.ancillaryUsed || 0;
      const ancCap = (dedUsed >= 1) ? BUDGET.ancillaryPerDedicatedDay : BUDGET.ancillaryMaxPerDay;
      if(ancUsed + 1 > ancCap){
        const who = c.name || 'They';
        return { fits:false, label:'Start soliciting',
          reason: who + ' has no time left today — ' + ancUsed + ' of ' + ancCap + ' short tasks used' + (dedUsed >= 1 ? ' alongside a full-day task' : '') + '. Soliciting is an ancillary activity (RR p.164).' };
      }
    }
    return { fits:true, reason:'', label:'🎲 Start soliciting' };
  },
  recruitBudgetLine(){
    const s = this.recruitState; if(!s || !s.patron) return '';
    const A = window.ACKS; if(!A || !A.characterActivityBudget) return '';
    const b = A.characterActivityBudget(this.currentCampaign, s.patron.id);
    return 'Today: ' + (b.dedicatedUsed || 0) + ' dedicated · ' + (b.ancillaryUsed || 0) + ' ancillary' + (b.overBudget ? ' (over budget)' : '');
  },
  recruitStartSoliciting(){
    const s = this.recruitState; if(!s) return;
    const camp = this.currentCampaign; if(!camp){ this.showToast('No campaign loaded.'); return; }
    const fit = this.recruitStartFits();
    if(!fit.fits){ this.showToast(fit.reason); return; }
    if(!window.ACKS || !window.ACKS.startRecruitmentDrive){ this.showToast('Recruitment engine unavailable.'); return; }
    try {
      const res = window.ACKS.startRecruitmentDrive(camp, {
        patronCharacterId: s.patronCharacterId,
        settlementId: s.settlementId || null,
        marketClassIdx: Number(s.marketClassIdx),
        hireCategory: s.hireCategory,
        hireTypeId: s.hireTypeId
      });
      if(!res || !res.ok){ this.showToast('Could not start soliciting: ' + ((res && res.error) || 'unknown')); return; }
      s.driveId = res.drive.id;
      // Debit week-1 solicit fee from the patron's purse (RR p.164 — per week, per type), GP Wave B.
      const fee = res.feeOwedGp || 0;
      if(fee > 0 && window.ACKS.applyWealthTransfer){
        const spec = { amount: fee, source: { kind:'character-gp', id: s.patronCharacterId }, destination: { kind:'external', label:'Solicitation fee' }, allowOverdraft:true, reason:'Hireling solicitation fee', bucket:'recruitment' };
        try { window.ACKS.applyWealthTransfer(camp, spec); if(window.ACKS.recordWealthTransfer) window.ACKS.recordWealthTransfer(camp, spec, { submittedBy:'gm' }); } catch(e){}
      }
      this.markDirty(); this.schedulePersist();
      this.showToast('Soliciting started — candidates arrive after a week of soliciting (RR p.164). Advance the Day Clock.');
    } catch(e){ this.showToast('Start failed: ' + e.message); }
  },
  recruitStopSoliciting(){
    const s = this.recruitState; if(!s) return;
    const camp = this.currentCampaign; const d = this.recruitActiveDrive();
    if(camp && d && window.ACKS && window.ACKS.stopRecruitmentDrive){
      try { window.ACKS.stopRecruitmentDrive(camp, s.patronCharacterId, d.id); } catch(e){}
    }
    s.driveId = null;
    s.engagedIds = []; s.negotiations = {}; s.candidatePool = {}; s.mercenaryHireCount = 0;
    this.markDirty(); this.schedulePersist();
    this.showToast('Soliciting stopped.');
  },
  // ─── R3 roster — every in-flight recruiting effort across the campaign (the Recruit landing,
  // mirroring the Journeys/Travel list). status active OR complete (a complete search still has
  // candidates left to hire). Players first, then by patron name. ───────────────────────────────
  recruitOngoingDrives(){
    const camp = this.currentCampaign; if(!camp || !Array.isArray(camp.characters)) return [];
    const A = window.ACKS || {};
    const out = [];
    for(const c of camp.characters){
      if(!c || !Array.isArray(c.recruitmentDrives)) continue;
      for(const d of c.recruitmentDrives){
        if(d && (d.status === 'active' || d.status === 'complete')) out.push({ patron: c, drive: d });
      }
    }
    const isPC = A.isPlayerControlled || (c => c && c.controlledBy === 'player');
    out.sort((a, b) => (isPC(a.patron) ? 0 : 1) - (isPC(b.patron) ? 0 : 1) || (a.patron.name || '').localeCompare(b.patron.name || ''));
    return out;
  },
  // Open a roster drive's patron in the wizard (recruitStart adopts the in-flight drive).
  recruitOpenDrive(patronId){ this.recruitStart(patronId); },
  // Stop a drive straight from the roster (no need to open the wizard first).
  recruitStopDrive(patronId, driveId){
    const camp = this.currentCampaign; if(!camp || !window.ACKS || !window.ACKS.stopRecruitmentDrive) return;
    try { window.ACKS.stopRecruitmentDrive(camp, patronId, driveId); this.markDirty(); this.schedulePersist(); this.showToast('Soliciting stopped.'); } catch(e){}
  },
  // §310.3f-fix23 — Pre-solicit forecast: read the RAW cell for the chosen
  // hire type × market class and translate it into plain English so the GM
  // can decide whether to spend a week here. Returns { cellRaw, summary,
  // noChance } where noChance=true means the cell is '-' / '—' (Solicit is
  // pointless and the button is blocked).
  recruitAvailabilityForecast(){
    const s = this.recruitState; if(!s || !s.hireTypeId) return null;
    const row = this.recruitCurrentRow(); if(!row) return null;
    const mki = Number(s.marketClassIdx);
    if(!Array.isArray(row.cells) || mki < 0 || mki >= row.cells.length) return null;
    const cellRaw = row.cells[mki];
    if(!window.ACKS || !window.ACKS.parseAvailabilitySpec) return { cellRaw, summary: cellRaw, noChance: false };
    const spec = window.ACKS.parseAvailabilitySpec(cellRaw);
    // Helper: parse "NdM" into {n, sides} for min/max/avg.
    function diceRange(notation){
      const m = String(notation||'').match(/^(\d+)d(\d+)\s*([+-]\s*\d+)?$/);
      if(!m) return null;
      const n = parseInt(m[1],10), sides = parseInt(m[2],10);
      const mod = m[3] ? parseInt(m[3].replace(/\s/g,''), 10) : 0;
      return { min: n + mod, max: n*sides + mod, avg: (n*(1+sides)/2) + mod };
    }
    if(spec.type === 'none'){
      return { cellRaw, summary: 'No candidates of this type are available at this market class. Soliciting will waste time and fees.', noChance: true };
    }
    if(spec.type === 'count'){
      return { cellRaw, summary: this.pluralize(spec.count, 'candidate') + ' guaranteed per solicit week (no roll).', noChance: false };
    }
    if(spec.type === 'dice'){
      const r = diceRange(spec.notation);
      const txt = spec.notation + ' candidates per solicit week' + (r ? ' (range ' + r.min + '–' + r.max + ', avg ~' + r.avg.toFixed(1) + ')' : '');
      return { cellRaw, summary: txt, noChance: false };
    }
    if(spec.type === 'dice-times'){
      const r = diceRange(spec.notation);
      const txt = spec.notation + ' × ' + spec.multiplier + ' candidates per solicit week' + (r ? ' (range ' + (r.min*spec.multiplier) + '–' + (r.max*spec.multiplier) + ', avg ~' + (r.avg*spec.multiplier).toFixed(0) + ')' : '');
      return { cellRaw, summary: txt, noChance: false };
    }
    if(spec.type === 'percent-single'){
      return { cellRaw, summary: spec.percent + '% chance per solicit week of finding ' + this.pluralize(spec.count, 'candidate') + '.', noChance: false };
    }
    if(spec.type === 'percent-dice'){
      const r = diceRange(spec.notation);
      const txt = spec.percent + '% chance per solicit week of finding ' + spec.notation + ' candidates' + (r ? ' (' + r.min + '–' + r.max + ' if found)' : '');
      return { cellRaw, summary: txt, noChance: false };
    }
    return { cellRaw, summary: 'Unknown cell format: ' + cellRaw, noChance: false };
  },
  recruitNoChance(){
    const f = this.recruitAvailabilityForecast();
    return !!(f && f.noChance);
  },
  recruitEngageOne(){
    const s = this.recruitState; if(!s || !this.recruitActiveDrive()) return;
    const row = this.recruitCurrentRow(); if(!row) return;
    const camp = this.currentCampaign; if(!camp){ this.showToast('No campaign loaded.'); return; }
    // §310.3f-fix18 — resurfaced-first: if persistent-hireling-resurfacing is
    // on and there are unengaged previously-seen candidates at this market +
    // type, pull from that pool before individuating a new one. New rolls
    // only happen when the resurfaced pool is exhausted.
    if(this.recruitResurfaceOn()){
      const existing = this.recruitExistingCandidates();
      if(existing && existing.length > 0){
        this.recruitEngageExisting(existing[0].id);
        return;
      }
    }
    const classRequired = this.recruitClassRequiredFromRole();
    // §310.3f-fix6 — resolve the chosen settlement's hex so the candidate's
    // location reflects where they were individuated.
    let candHexId = null, candDomainId = null;
    if(s.settlementId){
      const sets = this.allSettlements ? this.allSettlements() : [];
      const idFor = (x) => x.settlement.id;   // T6 single-home — settlements always carry an id
      const match = sets.find(x => idFor(x) === s.settlementId);
      if(match){
        const hex = window.ACKS.findHex(this.currentCampaign, match.hexId);   // T6 single-home
        if(hex) candHexId = hex.id;
        candDomainId = match.domainId;
      }
    }
    try {
      const cand = window.ACKS.individuateHirelingCandidate({
        row, hireCategory: s.hireCategory, classRequired,
        settlementId: s.settlementId || null,
        currentHexId: candHexId,
        currentDomainId: candDomainId,
        turn: camp.currentTurn || 1
      });
      // §310.3f-fix13 — NEW candidates live in the transient pool. They land
      // in camp.characters only at Submit/Cancel time, gated by persistence.
      s.candidatePool[cand.id] = cand;
      s.engagedIds.push(cand.id);
      // §348 — auto-pick when the patron has exactly one persuasion proficiency.
      // When multiple, leave '' so the GM picks per RAW (only one applies per attempt).
      const available = this.recruitPatronPersuasionProfs();
      const defaultProf = (available.length === 1) ? available[0].id : '';
      s.negotiations[cand.id] = { signingBonusTier:'none', persuasionProficiency: defaultProf, situational:0, rollResult:null, decision:'pending' };
    } catch(e){ this.showToast('Engage failed: '+e.message); }
  },
  recruitNegotiationMod(candId){
    const s = this.recruitState; if(!s) return 0;
    const n = s.negotiations[candId]; if(!n) return 0;
    return window.ACKS.computeReactionMods(s.patron, {
      signingBonusTier: n.signingBonusTier,
      persuasionProficiency: n.persuasionProficiency || '',
      situational: n.situational || 0,
      previousFailedAttempts: 0,
      regionalSlanderPenalty: 0
    });
  },
  recruitRollReactionFor(candId){
    const s = this.recruitState; if(!s) return;
    const n = s.negotiations[candId]; if(!n) return;
    const mod = this.recruitNegotiationMod(candId);
    n.rollResult = window.ACKS.rollReactionToHiring(mod);
  },
  recruitDecide(candId, decision){
    const s = this.recruitState; if(!s) return;
    if(s.negotiations[candId]) s.negotiations[candId].decision = decision;
  },
  recruitCandidate(candId){
    // §310.3f-fix13 — transient pool first (new individuations this session),
    // then fall through to camp.characters for resurfaced candidates.
    const s = this.recruitState;
    if(s && s.candidatePool && s.candidatePool[candId]) return s.candidatePool[candId];
    return (this.currentCampaign && this.currentCampaign.characters || []).find(c => c.id === candId);
  },
  // §310.3f-fix19 — true when this engaged candidate is one that was pulled
  // from camp.characters via the persistent-hireling-resurfacing rule
  // (i.e., they were individuated in a prior session at this market). New
  // individuations of this session live in candidatePool; resurfaced ones do
  // not.
  recruitIsResurfaced(candId){
    const s = this.recruitState;
    return !!(s && (!s.candidatePool || !s.candidatePool[candId]));
  },
  // §310.3f-fix15 — Submit gating.
  // Returns the reason Submit should be disabled, or '' if it's good to go.
  recruitSubmitDisabledReason(){
    const s = this.recruitState; if(!s) return 'No recruitment in progress.';
    if(this.recruitBlockedByLevelCap()) return 'Over RAW level cap — pick a lower-level type or a higher-level patron.';
    if(this.recruitBlockedByHenchmanCap()) return 'Patron at henchman cap — release a current henchman first.';
    if(s.hireCategory === 'mercenary'){
      if(!Number(s.mercenaryHireCount||0)) return 'Set a hire count > 0.';
      return '';
    }
    // henchman / specialist: need at least one decided candidate.
    const decided = s.engagedIds.filter(id => {
      const d = s.negotiations[id] && s.negotiations[id].decision;
      return d === 'hire' || d === 'reject';
    }).length;
    if(!decided) return 'Engage a candidate and decide (hire / reject) first.';
    return '';
  },
  recruitCanSubmit(){ return this.recruitSubmitDisabledReason() === ''; },
  // GP Wave A.2 — compute the gp amounts to record on the recruit-hireling
  // event. No money actually moves yet; this is data hygiene that the
  // Phase 2.95 Stash work (#263) will plug into. Ratios match RR p.165
  // signing-bonus tiers.
  recruitBonusRatioFor(tier){
    return { none:0, week:0.25, month:1.0, year:12.0 }[tier || 'none'] || 0;
  },
  // Returns total signing bonus gp for the current recruitment, summed per
  // hired candidate (each candidate's tier × the patron's monthlyOffer).
  // For mercenary count hires, uses count × wage × ratio[session tier].
  recruitComputeSigningBonusGp(){
    const s = this.recruitState; if(!s) return 0;
    const offer = Number(s.monthlyOffer || 0);
    if(s.hireCategory === 'mercenary'){
      const ct = Number(s.mercenaryHireCount || 0);
      // Mercenary signing tier isn't surfaced in the current UI; defaults to 'none'.
      const tier = s.mercenarySigningBonusTier || 'none';
      const ratio = this.recruitBonusRatioFor(tier);
      return Math.round(ct * offer * ratio);
    }
    // Individual hires: sum per hired candidate.
    let total = 0;
    for(const cid of (s.engagedIds || [])){
      const n = s.negotiations && s.negotiations[cid];
      if(!n || n.decision !== 'hire') continue;
      const ratio = this.recruitBonusRatioFor(n.signingBonusTier || 'none');
      total += offer * ratio;
    }
    return Math.round(total);
  },
  // R3 — total solicit fees charged on the active drive (live-debited at Start + by the
  // day-tick consumer). Recorded on the recruit-hireling payload for audit — no money
  // moves here (the handler sets treasuryDelta:0); the drive already paid the fees.
  recruitComputeSolicitFeesGp(){
    const d = this.recruitActiveDrive();
    return d ? (d.feesAccruedGp || 0) : 0;
  },
  recruitHiredCount(){
    const s = this.recruitState; if(!s) return 0;
    return s.engagedIds.filter(id => s.negotiations[id] && s.negotiations[id].decision === 'hire').length;
  },
  recruitRejectedCount(){
    const s = this.recruitState; if(!s) return 0;
    return s.engagedIds.filter(id => s.negotiations[id] && s.negotiations[id].decision === 'reject').length;
  },
  recruitSubmit(){
    const s = this.recruitState; if(!s) return;
    if(!s.patronCharacterId){ this.showToast('Pick a patron first.'); return; }
    if(!s.hireCategory || !s.hireTypeId){ this.showToast('Pick a hire type first.'); return; }
    const camp = this.currentCampaign; if(!camp){ this.showToast('No campaign loaded.'); return; }
    // Henchman-cap pre-check — RR p.164 (CHA mod + 4). The handler also checks
    // defensively, but doing it here lets us write a recruitment-aware toast
    // BEFORE the event is built/applied.
    if(s.hireCategory === 'henchman'){
      const cap = this.recruitHenchmanCap();
      const wouldHire = s.engagedIds.filter(id => s.negotiations[id] && s.negotiations[id].decision === 'hire').length;
      if(cap.cap > 0 && cap.current + wouldHire > cap.cap){
        this.showToast('Patron at henchman cap (' + cap.current + ' / ' + cap.cap + '). Release a current henchman before recruiting more.');
        return;
      }
    }
    if(!Array.isArray(camp.eventLog)) camp.eventLog = [];

    const payload = {
      patronCharacterId: s.patronCharacterId,
      hireCategory: s.hireCategory,
      hireTypeId: s.hireTypeId,
      settlementId: s.settlementId || undefined,
      monthlyOffer: Number(s.monthlyOffer || 0)
    };

    if(s.hireCategory === 'mercenary'){
      const ct = Number(s.mercenaryHireCount || 0);
      if(ct <= 0){ this.showToast('Pick a count to hire (mercenaries).'); return; }
      payload.count = ct;
      if(s.destinationKind) payload.destinationKind = s.destinationKind;
      if(s.targetGarrisonUnitId) payload.targetGarrisonUnitId = s.targetGarrisonUnitId;  // #548
    } else {
      const hiredIds = [], rejectedIds = [];
      let lastRoll = null, lastBand = null;
      for(const cid of s.engagedIds){
        const n = s.negotiations[cid]; if(!n) continue;
        if(n.decision === 'hire') hiredIds.push(cid);
        else if(n.decision === 'reject') rejectedIds.push(cid);
        if(n.rollResult){ lastRoll = n.rollResult; lastBand = n.rollResult.bandKey; }
      }
      if(hiredIds.length === 0 && rejectedIds.length === 0){
        this.showToast('No candidates engaged. Engage and decide first.'); return;
      }
      payload.candidateIds = hiredIds;
      payload.rejectedCandidateIds = rejectedIds;
      if(lastBand) payload.reactionBandKey = lastBand;
      if(lastRoll) payload.rollResult = lastRoll;
      if(s.roleToFill && hiredIds.length){
        payload.roleToFill = s.roleToFill;
        if(s.roleDomainId) payload.roleDomainId = s.roleDomainId;
      }
    }

    try {
      // §310.3f-fix13 — merge appropriate pool entries into camp.characters
      // BEFORE applyEvent so the engine handler can resolve candidate ids.
      //   persistence ON  → merge all (hired AND rejected — engine writes
      //                     history to both)
      //   persistence OFF → merge only hired (rejected/unresolved are
      //                     transient and must not pollute the campaign)
      const select = this.recruitPersistOn() ? 'all' : 'hired';
      this.recruitMergePoolToCampaign(select);
      // GP Wave A.2 — record gp amounts on the payload. Pure data hygiene;
      // no transfer fires today. Phase 2.95 Stash #263 will wire these to
      // wealth-transfer events.
      payload.signingBonusGp = this.recruitComputeSigningBonusGp();
      payload.solicitFeesGp  = this.recruitComputeSolicitFeesGp();
      const ev = window.ACKS.newEvent('recruit-hireling', {
        payload, submittedBy:'gm', targetTurn: camp.currentTurn || 1, status:'applied'
      });
      // §310.3f-fix29 — pass the FULL campaign so engine-side hooks can
      // reach houseRules + settlements (notability gate + settlement
      // lookup). Previous partial campaign was silently failing the
      // recruitment-notability path.
      const out = window.ACKS.applyEvent(camp, ev);
      ev.appliedAtTurn = camp.currentTurn || 1;
      ev.result = out.result;
      // §310.3f-fix29 — push the canonical event-log entry shape so the
      // Event Log view's entry.event.* bindings resolve correctly.
      camp.eventLog.push({
        event: ev,
        result: out.result,
        appliedAtTurn: ev.appliedAtTurn,
        appliedAt: new Date().toISOString()
      });
      this.showToast(out.result && out.result.narrativeSummary ? out.result.narrativeSummary : 'Recruitment recorded.');
      // R3 — conclude the drive (the search ended in a hire). Fees were charged live
      // (Start + day-tick); stopping just removes it from the active set + the budget.
      const _drv = this.recruitActiveDrive();
      if(_drv && window.ACKS.stopRecruitmentDrive){ try { window.ACKS.stopRecruitmentDrive(camp, s.patronCharacterId, _drv.id); } catch(e){} }
      this.recruitReset();
    } catch(e){
      console.error(e);
      this.showToast('Recruitment failed: '+e.message);
    }
  },
  recruitModal: { open: false, domainId: null, typeKey: '', count: 1 },  // 🪖 Recruit-mercenaries (realm scale) modal
  recruitSpecialistModal: { open: false, domainId: null, typeKey: '', detailLevel: 'lightweight' },  // 🎖 Recruit-officer/specialist (realm scale) modal
  });
})();
