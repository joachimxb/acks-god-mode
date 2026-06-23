/* =============================================================================
 * domain-app-favors-duties.js — ACKS God Mode app mixin: the Favors & Duties UI
 * =============================================================================
 *
 * The Favors & Duties (F&D-2, RR pp.345–348) Vassalage-tab UI — obligation reads,
 * Grant / Demand / Revoke edicts, send-to-council. Extracted verbatim from
 * domain-app.js (T5 chip 7, 2026-06-23) — pure code-motion. Registers a members
 * object on window.__ACKS_APP_MIXINS__; domainApp() merges it into the component
 * (descriptor-preserving). Members use this.* / window.ACKS.* only.
 * Loaded via <script src> after domain-app.js, before Alpine’s deferred init.
 * ============================================================================= */
(function(){
  'use strict';
  var M = (window.__ACKS_APP_MIXINS__ = window.__ACKS_APP_MIXINS__ || []);
  M.push({
  // --- Favors & Duties (F&D-2 UI; RR pp.345–348). The card lives on the Vassalage tab. Reads route
  //     through the engine accessors; Grant / Demand / Revoke go through the shared engine edict core
  //     (applyFavorDutyEdictByKind / revokeFavorDutyEdict) so a hand-raised edict is identical to the
  //     monthly auto-roll. F&D is RAW core — these actions are always available (independent of the
  //     favor-duty-auto-roll toggle, which only governs the monthly auto-roll). ---
  fdLiegeOfVassal(vDomainId){ const v=(this.currentCampaign?.vassalages||[]).find(x=>x&&x.status==='active'&&x.vassalDomainId===vDomainId); return v?v.suzerainCharacterId:null; },
  fdActiveObligations(vDomainId){ const L=this.fdLiegeOfVassal(vDomainId); return L?window.ACKS.activeFavorDutyObligationsFor(this.currentCampaign,L,vDomainId):[]; },
  fdBalance(vDomainId){ const L=this.fdLiegeOfVassal(vDomainId); return L?window.ACKS.favorDutyBalance(this.currentCampaign,L,vDomainId,{turn:this.currentCampaign?.currentTurn||1}):null; },
  fdFavorKinds(){ return (window.ACKS.FAVOR_DUTY_TABLE||[]).filter(e=>e.isFavor===true); },
  fdDutyKinds(){ return (window.ACKS.FAVOR_DUTY_TABLE||[]).filter(e=>e.isFavor===false); },
  fdKindLabel(kind){ const e=(window.ACKS.FAVOR_DUTY_TABLE||[]).find(x=>x.kind===kind); return e?e.label:kind; },
  fdMuster(o){ if(!o||!o.musterTitle||!o.gpPerMonth)return null; return window.ACKS.musterSchedule(o.musterTitle,o.gpPerMonth); },
  fdIsThisMonth(o){ return o && o.grantedAtTurn === (this.currentCampaign?.currentTurn||1); },
  fdKindHasGp(kind){ const e=(window.ACKS.FAVOR_DUTY_TABLE||[]).find(x=>x.kind===kind); return !!e && e.gpBasis !== 'none'; },
  // The RAW default gp for a standard kind on a vassal (the "demand less" field pre-fills with this).
  fdDefaultAmount(vDomainId, kind){
    const e=(window.ACKS.FAVOR_DUTY_TABLE||[]).find(x=>x.kind===kind); if(!e) return 0;
    const d=(this.currentCampaign?.domains||[]).find(x=>x.id===vDomainId); if(!d) return 0;
    if(e.gpBasis==='realm-families') return window.ACKS.realmFamiliesForDomain(this.currentCampaign, d);
    if(e.gpBasis==='monthly-tribute') return window.ACKS.tributeOwed(this.currentCampaign, d);
    return 0;
  },
  // The vassal's current realm family count (RR p.346) — drives the live scutage preview in the composer.
  fdRealmFamilies(vDomainId){
    const d=(this.currentCampaign?.domains||[]).find(x=>x.id===vDomainId); if(!d) return 0;
    return window.ACKS.realmFamiliesForDomain(this.currentCampaign, d);
  },
  // Display name for an obligation — the custom label for a custom edict, else the table label.
  fdDisplayLabel(o){ return o && o.kind==='custom' ? (o.customLabel||'Custom edict') : this.fdKindLabel(o&&o.kind); },
  // Raise an edict via the composer. opts: { kind, customLabel?, isFavor?, isOngoing?, gpPerMonth? }.
  // A blank gpPerMonth means "RAW default" for a standard kind (the engine fills it); for custom it's 0.
  fdRaiseEdict(vDomainId, opts){
    opts = opts || {}; if(!opts.kind) return;
    if(opts.kind==='custom' && !String(opts.customLabel||'').trim()){ this.showToast && this.showToast('Give the custom edict a name first.', 3500); return; }
    const payload = { vassalDomainId: vDomainId, kind: opts.kind };
    if(opts.kind==='custom'){
      payload.customLabel = String(opts.customLabel||'').trim();
      payload.isFavor = !!opts.isFavor;
      payload.isOngoing = !!opts.isOngoing;
      if(opts.gpPerMonth !== '' && opts.gpPerMonth != null) payload.gpPerMonth = Math.max(0, Number(opts.gpPerMonth) || 0);
    } else if(opts.kind==='scutage'){
      // Scutage is a per-family RATE (RR p.347 — the monthly amount derives live from current realm families);
      // the override is the rate (default 1gp/family; a lower rate is "demand less", RR p.345).
      if(opts.scutageGpPerFamily !== '' && opts.scutageGpPerFamily != null) payload.scutageGpPerFamily = Math.max(0, Number(opts.scutageGpPerFamily) || 0);
    } else if(opts.gpPerMonth !== '' && opts.gpPerMonth != null){
      payload.gpPerMonth = Math.max(0, Number(opts.gpPerMonth) || 0);   // the "demand less" override (RR p.345)
    }
    if(opts.kind==='call-to-council' && opts.councilHexId) payload.councilHexId = opts.councilHexId;   // F&D-5 — the chosen council location (RR p.346)
    if(opts.kind==='office' && opts.officeTitle) payload.officeTitle = String(opts.officeTitle).trim();  // F&D-8 — the ceremonial office name (RR p.348)
    const res = window.ACKS.applyFavorDutyEdictByKind(this.currentCampaign, payload, { rng: Math.random });
    if(!res || !res.obligation){ this.showToast && this.showToast('Could not apply — this domain has no active liege.', 4000); return; }
    this.markDirty(); this.schedulePersist();
    let msg = res.narrative || 'Edict applied.';
    if(res.loyaltyResult){ msg += ' Loyalty roll at ' + res.balance.loyaltyModifier + ' → ' + (res.loyaltyResult.bandLabel || res.loyaltyResult.bandKey) + '.'; }
    this.showToast && this.showToast(msg, 6000);
  },
  fdRevoke(obligationId){
    const o = window.ACKS.revokeFavorDutyEdict(this.currentCampaign, obligationId, {});
    this.markDirty(); this.schedulePersist();
    let msg = o ? ('Revoked ' + (o.kind||'obligation') + '.') : 'Nothing to revoke.';
    // RR p.348 — revoking a given loan repays the principal to the vassal.
    if(o && o.kind==='loan' && o.loanGivenAtTurn != null) msg = 'Loan revoked — ' + (o.gpPerMonth||0).toLocaleString() + 'gp repaid to the vassal.';
    this.showToast && this.showToast(msg, 4500);
  },
  // Loan lifecycle (F&D-4; RR p.348). A Loan is DEMANDED (created) but the gp moves only when the
  // vassal GIVES it — so the liege sees a "not yet given" notice and the vassal gets a Give-loan button.
  fdLoanNotGiven(o){ return !!o && o.kind==='loan' && o.status==='active' && o.loanGivenAtTurn == null; },
  fdLoanGiven(o){ return !!o && o.kind==='loan' && o.loanGivenAtTurn != null; },
  // gp suffix for an obligation row — a loan is a one-time principal (no "/mo"); scutage shows its LIVE
  // amount (rate × current realm families) + the breakdown so it's clear it tracks population; else per-month.
  fdGpText(o){
    if(o && o.kind==='scutage'){
      const fams = this.fdRealmFamilies(o.vassalDomainId);
      const rate = window.ACKS.scutageRate(o);
      const amt = window.ACKS.scutageMonthlyGp(this.currentCampaign, o);
      const rateStr = (rate === 1) ? '1gp' : (rate + 'gp');
      return ' · ' + amt.toLocaleString() + 'gp/mo (' + rateStr + '/family × ' + fams.toLocaleString() + ')';
    }
    if(!o || !o.gpPerMonth) return '';
    const n = o.gpPerMonth.toLocaleString();
    return o.kind==='loan' ? (' · ' + n + 'gp loan') : (' · ' + n + 'gp' + (o.isOngoing ? '/mo' : ''));
  },
  // Vassal-side act: give (fund) a demanded loan — moves the principal vassal → liege (RR p.348).
  fdGiveLoan(obligationId){
    const o = window.ACKS.giveLoanObligation(this.currentCampaign, obligationId, {});
    this.markDirty(); this.schedulePersist();
    this.showToast && this.showToast(o && o.loanGivenAtTurn != null ? ('Loan given — ' + (o.gpPerMonth||0).toLocaleString() + 'gp paid to your liege.') : 'Could not give the loan.', 5000);
  },
  // Scutage lifecycle (F&D-6; RR pp.347–348). Scutage is a recurring tax with a persistent AUTO-PAY toggle:
  // "Pay Scutage" turns it on (it then bills automatically every monthly turn — garrison expense for the
  // vassal, credited to the lord), "Stop Paying" turns it off. fdScutageAutoPay(o) = the toggle is on.
  fdIsScutage(o){ return !!o && o.kind === 'scutage' && o.status === 'active'; },
  fdScutageAutoPay(o){ return !!o && o.kind === 'scutage' && o.scutageAutoPay === true; },
  // Vassal-side acts: start paying scutage automatically each month, or stop.
  fdPayScutage(obligationId){
    const o = window.ACKS.payScutageObligation(this.currentCampaign, obligationId, {});
    this.markDirty(); this.schedulePersist();
    const amt = o ? window.ACKS.scutageMonthlyGp(this.currentCampaign, o) : 0;
    this.showToast && this.showToast(o && this.fdScutageAutoPay(o)
      ? ('Now paying scutage automatically — ' + amt.toLocaleString() + 'gp/mo settles (vassal → lord) each monthly turn until you stop.')
      : 'Could not pay scutage.', 5500);
  },
  fdStopScutage(obligationId){
    const o = window.ACKS.stopScutagePayment(this.currentCampaign, obligationId, {});
    this.markDirty(); this.schedulePersist();
    this.showToast && this.showToast(o && !this.fdScutageAutoPay(o) ? 'Stopped paying scutage — it is now withheld from your liege.' : 'Could not stop scutage.', 5000);
  },
  // Construction duty — liege side (F&D-7; RR p.348). The lord orders structures (hex + type) built in
  // the vassal's realm; the target gp = 15,000 × distinct ordered hexes; the card shows progress + lets
  // the liege add/remove orders while the duty is on-going. (Actual building detection + auto-revoke-on-
  // completion is the future full Construction subsystem; for now the monthly self-spend drives progress.)
  // Office favor (F&D-8; RR p.348) — the holder's ceremonial office; grants the holder's own vassals
  // +1 to their loyalty rolls (applied automatically in loyalty rolls). The title is free text.
  fdIsOffice(o){ return !!o && o.kind === 'office'; },
  fdIsConstruction(o){ return !!o && o.kind === 'construction' && o.status === 'active'; },
  fdConstructionProgress(o){ return window.ACKS.constructionDutyProgress(this.currentCampaign, o); },
  fdConstructionHexLabel(hexId){ return this.journeyHexLabel(hexId); },
  // The vassal realm's hexes for the order picker.
  fdConstructionHexOptions(vDomainId){
    return (this.currentCampaign?.hexes || []).filter(h => h && h.domainId === vDomainId).map(h => ({ id:h.id, label: this.journeyHexLabel(h.id) }));
  },
  // The structure types the liege may order (vessel only on a littoral realm).
  fdConstructionTypes(vDomainId){
    const dom = (this.currentCampaign?.domains || []).find(d => d.id === vDomainId) || null;
    const littoral = dom ? window.ACKS.isLittoralDomain(this.currentCampaign, dom) : false;
    return (window.ACKS.CONSTRUCTION_DUTY_TYPES || []).filter(t => !t.littoralOnly || littoral).map(t => ({ value:t.value, label:t.label, generic: !!t.generic }));
  },
  fdAddConstructionOrder(obligationId, hexId, type){
    if(!type || (type !== 'generic' && !hexId)) return;
    const before = (this.currentCampaign.favorDutyObligations.find(o=>o.id===obligationId)?.constructionOrders||[]).length;
    const o = window.ACKS.addConstructionOrder(this.currentCampaign, obligationId, type === 'generic' ? { type:'generic' } : { hexId, type });
    this.markDirty(); this.schedulePersist();
    const added = o && (o.constructionOrders||[]).length > before;
    this.showToast && this.showToast(added
      ? ((type === 'generic' ? 'Ordered generic construction (anywhere in the realm)' : ('Ordered ' + window.ACKS.constructionDutyTypeLabel(type).toLowerCase())) + ' — construction target now ' + window.ACKS.constructionDutyTargetGp(this.currentCampaign, o).toLocaleString() + 'gp.')
      : (type === 'generic' ? 'Generic construction is already ordered.' : 'Could not add the order (hex must be in the vassal’s realm; vessels need a littoral realm).'), 5000);
  },
  fdRemoveConstructionOrder(obligationId, index){
    const o = window.ACKS.removeConstructionOrder(this.currentCampaign, obligationId, index, {});
    this.markDirty(); this.schedulePersist();
    this.showToast && this.showToast(o ? ('Order removed — construction target now ' + window.ACKS.constructionDutyTargetGp(this.currentCampaign, o).toLocaleString() + 'gp.') : 'Could not remove the order.', 4000);
  },
  // Call to Council (F&D-5; RR p.346). The liege picks a council hex in his domain (default = where
  // he is now); the vassal travels there via "Go to Council" (plots/re-routes a journey); the live
  // attendance status (at-council / en-route / away) shows on the card.
  fdIsCallToCouncil(o){ return !!o && o.kind === 'call-to-council'; },
  // The liege ruler's (selectedDomain's ruler's) current hex — the default council location.
  fdLiegeRulerCurrentHex(){
    const dom = this.selectedDomain; if(!dom || !dom.rulerCharacterId) return null;
    const r = (this.currentCampaign?.characters||[]).find(c => c && c.id === dom.rulerCharacterId);
    return r ? (r.currentHexId || null) : null;
  },
  // Hex options for the council picker — the liege (selectedDomain) domain hexes, plus the liege
  // ruler's current hex if it's outside the domain (so "where he is now" is always offerable).
  fdCouncilHexOptions(){
    const dom = this.selectedDomain; if(!dom) return [];
    const opts = (this.currentCampaign?.hexes||[]).filter(h => h && h.domainId === dom.id).map(h => ({ id:h.id, label: this.journeyHexLabel(h.id) }));
    const cur = this.fdLiegeRulerCurrentHex();
    if(cur && !opts.some(o => o.id === cur)) opts.unshift({ id:cur, label: this.journeyHexLabel(cur) + ' (current location)' });
    return opts;
  },
  fdCouncilLocationLabel(o){ return o && o.councilHexId ? this.journeyHexLabel(o.councilHexId) : '—'; },
  fdCouncilStatus(o){ return window.ACKS.councilAttendanceStatus(this.currentCampaign, o); },
  // Card text for the council attendance (neutral wording — reads on both the liege + vassal side).
  fdCouncilStatusText(o){
    const s = this.fdCouncilStatus(o);
    if(s.status === 'no-location') return 'council location not set';
    const loc = this.fdCouncilLocationLabel(o);
    if(s.status === 'at-council') return 'council at ' + loc + ' · ✓ vassal present';
    if(s.status === 'en-route')   return 'council at ' + loc + ' · 🧭 vassal en route';
    return 'council at ' + loc + ' · — vassal not yet there';
  },
  // Vassal-side act: send the vassal (or his party) to council — plots or re-routes a journey.
  fdGoToCouncil(obligationId){
    const r = this._journeyWithDomains(() => window.ACKS.sendVassalToCouncil(this.currentCampaign, obligationId, {}));
    this.markDirty(); this.schedulePersist();
    const msg = ({
      started: 'Set out for council — a journey is under way.',
      rerouted: 'Re-routed the journey toward the council location.',
      'already-there': 'Already at the council location.',
      'no-location': 'No council location set on this duty.',
      'no-origin': "Set the vassal's location first — no hex to set out from.",
      'no-traveller': 'No vassal ruler to send.'
    })[r && r.action] || 'Could not send to council.';
    this.showToast && this.showToast(msg, 5000);
  },
  });
})();
