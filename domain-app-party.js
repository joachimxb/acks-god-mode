/* =============================================================================
 * domain-app-party.js — ACKS God Mode app mixin: Party split / merge / D9 lifecycle
 *   Movement 2.0 · Team Session 1 · Lane C
 * =============================================================================
 *
 * The party-view UI over the Lane C engine (acks-engine-movement-party.js): the graphical §2.1
 * party-member DRAG (Senate pattern; H1 --c-success drop ring), the split modal (choose who splits
 * off + optionally allocate camp items [tick-boxes] + rations/water [sliders], and follow-or-stay),
 * the co-located merge prompt, and the D9 ephemeral-party keep/disband-on-arrival prompt.
 *
 * ALL membership mutations route through the CANONICAL engine setter (ACKS.addToParty / removeFromParty
 * / moveToParty) — this mixin never hand-mutates memberCharacterIds / character.partyId. Adds NEW methods
 * only (never redefines the core party methods it reuses: partyMembers / charactersInPartyHex /
 * selectedParty / partyMemberCount). Registers a members object on window.__ACKS_APP_MIXINS__; domainApp()
 * merges it into the component. Members use this.* / window.ACKS.* only. Loaded via <script src> after
 * domain-app.js, before Alpine's deferred init.
 * ============================================================================= */
(function(){
  'use strict';
  var M = (window.__ACKS_APP_MIXINS__ = window.__ACKS_APP_MIXINS__ || []);
  M.push({

  // ── transient UI state (never persisted) ──────────────────────────────────
  partyEdit: { dragCharId: null },   // §2.1 member-drag — the dragged character id (Senate pattern)
  partySplit: { open: false, sourcePartyId: null, departing: {}, campItemIds: {}, newName: '', mode: 'stay', rationsToNew: 0, waterToNew: 0 },

  // ── the full-detail party MODAL (Roster ▸ Groups quick box → ⚙ Manage) ─────
  // Two-tier party surface (Joachim 2026-07-01): the Groups view shows a succinct quick-access box
  // (summary + Move / Send-on-journey / Manage) when a party is selected; ⚙ Manage — and the party
  // name, and a character sheet's "in party …" link — open THIS modal with all the details (membership
  // drag, split/merge/muster, provisioning & load, members table, camp, chronicle). Transient state.
  partyModalId: null,
  partyModalTab: 'manage',   // 'manage' | 'travel' | 'camp' | 'chronicle' — the modal's four tabs (the day log lives inside Travel)
  openPartyModal(partyId, tab){
    if(!partyId) return;
    // Select the party (so selectedParty() resolves) but DO NOT navigate — the modal is a top-level overlay
    // in the global modal stack, so it renders over whatever view called it (a Travel-overview row, a
    // character-sheet party link, a hex, the map) without changing the current tab. (Joachim 2026-07-01.)
    if(typeof this.selectGroup === 'function') this.selectGroup('party', partyId);
    // Point journeyDetailId at the party's journey so journeyDetail() resolves INSIDE the modal — the modal
    // folds the whole Travel page in (advance / vessel / pace / speed override / day log), verbatim, so its
    // journeyDetail()-driven controls + no-arg methods (journeyCompleteMovement) work. The standalone Travel
    // PAGE is scoped to army/unit journeys, so this never renders it for a party. (Joachim 2026-07-01.)
    const p = (this.currentCampaign?.parties || []).find(x => x && x.id === partyId);
    this.journeyDetailId = (p && p.activeJourneyId) || null;
    this.journeyOverrideArmed = false;
    // Open on the requested tab (journey links pass 'travel' so they land straight on the travel controls);
    // anything unrecognised falls back to Manage. (Joachim 2026-07-01.)
    this.partyModalTab = ['manage','travel','camp','chronicle'].includes(tab) ? tab : 'manage';
    this.partyModalId = partyId;
  },
  closePartyModal(){ this.partyModalId = null; this.journeyDetailId = null; this.journeyOverrideArmed = false; },
  partyModalParty(){ return this.partyModalId ? ((this.currentCampaign?.parties || []).find(p => p && p.id === this.partyModalId) || null) : null; },
  // ── the party's active journey + party-scoped provisioning totals (Movement 2.0 rework) ────────────
  // The modal absorbs the old Travel page: the Advance-travel box + the provisioning tracker read the
  // party's journey (or the party itself when stationary). partyJourney() bridges journey↔party accessors.
  partyJourney(pt){ pt = pt || this.selectedParty(); return (pt && pt.activeJourneyId && this.journeyById) ? this.journeyById(pt.activeJourneyId) : null; },
  // Ration/water days the party currently HOLDS (members' carried + the party camp). On a journey we defer
  // to the journey total (it also folds in any legacy supplies pool); stationary we sum members + camp.
  partyHeldFoodDays(pt){
    pt = pt || this.selectedParty(); if(!pt) return 0;
    const j = this.partyJourney(pt); if(j && this.journeyTotalFoodDays) return this.journeyTotalFoodDays(j);
    const A = window.ACKS, c = this.currentCampaign; let days = 0;
    (this.partyMembers ? this.partyMembers(pt) : []).forEach(ch => { days += (A && A.rationDaysAvailable ? A.rationDaysAvailable(ch) : 0) || 0; });
    const camp = (A && A.partyCampStash) ? A.partyCampStash(c, pt.id) : null; if(camp) days += (A.rationDaysAvailable ? A.rationDaysAvailable(camp) : 0) || 0;
    return Math.round(days * 10) / 10;
  },
  partyHeldWaterDays(pt){
    pt = pt || this.selectedParty(); if(!pt) return 0;
    const j = this.partyJourney(pt); if(j && this.journeyTotalWaterDays) return this.journeyTotalWaterDays(j);
    const A = window.ACKS, c = this.currentCampaign; let days = 0;
    (this.partyMembers ? this.partyMembers(pt) : []).forEach(ch => { days += Number(ch.waterDaysCarried) || 0; });
    const camp = (A && A.partyCampStash) ? A.partyCampStash(c, pt.id) : null; if(camp) days += Number(camp.waterDaysCarried) || 0;
    return Math.round(days * 10) / 10;
  },
  partySupplyDaysLeft(pt){ pt = pt || this.selectedParty(); const n = Math.max(1, this.partyMemberCount ? this.partyMemberCount(pt) : 1); return Math.floor(Math.min(this.partyHeldFoodDays(pt), this.partyHeldWaterDays(pt)) / n); },
  // Is the party on the map (a hex position, directly or via its journey)? Gates the quick-box Move/Journey.
  partyOnMap(pt){
    const A = window.ACKS;
    if(!pt) return false;
    if(A && typeof A.resolveMover === 'function'){ const m = A.resolveMover(this.currentCampaign, pt.id); return !!(m && m.currentHexId); }
    return !!pt.currentHexId;
  },

  // ── §2.1 party-member DRAG (Senate pattern; H1 drop ring) ──────────────────
  partyDragStart(charId){ this.partyEdit.dragCharId = charId; },
  partyDragEnd(){ this.partyEdit.dragCharId = null; },   // two-clear: cleared here AND in each drop handler
  // Drop onto a party's member list (or another co-located party's card): add/move the dragged character.
  partyDropAddToParty(partyId){
    const A = window.ACKS, c = this.currentCampaign, id = this.partyEdit.dragCharId;
    this.partyEdit.dragCharId = null;
    if(!A || !c || !id || !partyId) return;
    const ch = (c.characters || []).find(x => x && x.id === id);
    if(ch && ch.partyId === partyId) return;   // already here — no-op
    const r = A.moveToParty(c, id, partyId);
    if(r && r.ok){
      A.reconcilePartyMembership(c);
      this.showToast((ch && ch.name || 'Character') + ' → ' + (this._partyName(partyId) || 'party') + '.');
      this.markDirty(); this.schedulePersist();
    } else { this.showToast('Could not move that character.', 3000); }
  },
  // Drop onto the Available roster / the Remove gutter: pull the dragged character out of its party.
  partyDropRemoveMember(){
    const A = window.ACKS, c = this.currentCampaign, id = this.partyEdit.dragCharId;
    this.partyEdit.dragCharId = null;
    if(!A || !c || !id) return;
    const ch = (c.characters || []).find(x => x && x.id === id);
    if(!ch || !ch.partyId) return;   // already party-less
    const r = A.removeFromParty(c, id);
    if(r && r.ok){
      A.reconcilePartyMembership(c);
      this.showToast((ch.name || 'Character') + ' left the party.');
      this.markDirty(); this.schedulePersist();
    }
  },
  _partyName(partyId){ const p = (this.currentCampaign?.parties || []).find(x => x && x.id === partyId); return p ? (p.name || 'party') : null; },
  // Party-less characters at the selected party's hex — the "Available roster" drag pool. Reuses the
  // core charactersInPartyHex (same-hex, party-less) — the RAW "others from the same hex may join" pool.
  partyAvailableRoster(pt){ return this.charactersInPartyHex ? this.charactersInPartyHex(pt) : []; },

  // ── SPLIT modal ────────────────────────────────────────────────────────────
  openPartySplit(partyId){
    const c = this.currentCampaign;
    const pt = (c?.parties || []).find(p => p && p.id === partyId);
    if(!pt) return;
    if(this.partyMemberCount(pt) < 2){ this.showToast('A party needs at least 2 members to split.', 3000); return; }
    this.partySplit = { open: true, sourcePartyId: partyId, departing: {}, campItemIds: {}, newName: '', mode: 'stay', rationsToNew: 0, waterToNew: 0 };
  },
  closePartySplit(){ this.partySplit.open = false; this.partySplit.sourcePartyId = null; },
  partySplitSource(){ const c = this.currentCampaign; return (c?.parties || []).find(p => p && p.id === this.partySplit.sourcePartyId) || null; },
  // The source party's members as toggle rows for "who departs".
  partySplitMembers(){ const pt = this.partySplitSource(); return pt ? this.partyMembers(pt) : []; },
  partySplitToggleDeparting(charId){ this.partySplit.departing[charId] = !this.partySplit.departing[charId]; },
  partySplitDepartingIds(){ return Object.keys(this.partySplit.departing).filter(k => this.partySplit.departing[k]); },
  partySplitSourceOnJourney(){ const pt = this.partySplitSource(); return !!(pt && pt.activeJourneyId && this.journeyById && this.journeyById(pt.activeJourneyId)); },
  // The source camp's NON-ration item lines (ration lines get the slider) — the tick-box list.
  partySplitCampItems(){
    const A = window.ACKS, c = this.currentCampaign, pt = this.partySplitSource();
    if(!A || !c || !pt || typeof A.partyCampStash !== 'function') return [];
    const camp = A.partyCampStash(c, pt.id);
    return ((camp && camp.items) || []).filter(it => !(typeof A.isRationLine === 'function' && A.isRationLine(it)))
      .map(it => ({ id: it.id, name: it.name || it.label || (it.facets ? it.facets.join('/') : 'item'), qty: (it.qty != null ? it.qty : 1) }));
  },
  partySplitToggleItem(itemId){ this.partySplit.campItemIds[itemId] = !this.partySplit.campItemIds[itemId]; },
  // Divisible ration-days / water-days in the source camp (slider maxima).
  partySplitAvailRations(){
    const A = window.ACKS, c = this.currentCampaign, pt = this.partySplitSource();
    if(!A || !c || !pt || typeof A.partyCampStash !== 'function') return 0;
    const camp = A.partyCampStash(c, pt.id);
    return Math.floor(((camp && camp.items) || []).filter(it => typeof A.isRationLine === 'function' && A.isRationLine(it)).reduce((s, it) => s + (Number(it.daysRemaining) || 0), 0));
  },
  partySplitAvailWater(){
    const A = window.ACKS, c = this.currentCampaign, pt = this.partySplitSource();
    if(!A || !c || !pt || typeof A.partyCampStash !== 'function') return 0;
    const camp = A.partyCampStash(c, pt.id);
    return Math.floor((camp && Number(camp.waterDaysCarried)) || 0);
  },
  partySplitCanSubmit(){
    const pt = this.partySplitSource(); if(!pt) return false;
    const n = this.partySplitDepartingIds().length;
    return n >= 1 && n < this.partyMemberCount(pt);
  },
  confirmPartySplit(){
    const A = window.ACKS, c = this.currentCampaign, pt = this.partySplitSource();
    if(!A || !c || !pt || !this.partySplitCanSubmit()) return;
    const s = this.partySplit;
    const campItemIds = Object.keys(s.campItemIds).filter(k => s.campItemIds[k]);
    const res = A.splitParty(c, pt, this.partySplitDepartingIds(), {
      newName: (s.newName || '').trim() || undefined,
      mode: (s.mode === 'follow' && this.partySplitSourceOnJourney()) ? 'follow' : 'stay',
      rationsToNew: Number(s.rationsToNew) || 0,
      waterToNew: Number(s.waterToNew) || 0,
      campItemIds: campItemIds
    });
    if(!res || !res.ok){ this.showToast('Split failed: ' + ((res && res.reason) || 'unknown'), 4000); return; }
    A.reconcilePartyMembership(c);
    this.showToast('Split off ' + res.newParty.name + (res.mode === 'follow' ? ' (following, half-speed).' : '.'), 4500);
    this.closePartySplit();
    if(this.selectGroup) this.selectGroup('party', res.newParty.id);
    this.markDirty(); this.schedulePersist();
  },

  // ── MERGE (co-located; Joachim: no auto-merge — same-hex parties can be prompted) ──
  partyMergeCandidates(pt){ const A = window.ACKS; return (A && A.mergeCandidatesFor) ? A.mergeCandidatesFor(this.currentCampaign, pt) : []; },
  confirmPartyMerge(keepPartyId, absorbPartyId){
    const A = window.ACKS, c = this.currentCampaign;
    if(!A || !c) return;
    const absorb = (c.parties || []).find(p => p && p.id === absorbPartyId);
    if(absorb && !confirm('Merge ' + (absorb.name || 'that party') + ' into ' + (this._partyName(keepPartyId) || 'this party') + '? Its members, camp, and supplies join; it is then disbanded.')) return;
    const res = A.mergeParties(c, keepPartyId, absorbPartyId);
    if(!res || !res.ok){ this.showToast('Merge failed: ' + ((res && res.reason) || 'unknown'), 4000); return; }
    A.reconcilePartyMembership(c);
    this.showToast('Merged ' + (absorb && absorb.name || 'a party') + ' in (' + res.movedIds.length + ' member' + (res.movedIds.length === 1 ? '' : 's') + ').', 4500);
    if(this.selectGroup) this.selectGroup('party', keepPartyId);
    this.markDirty(); this.schedulePersist();
  },

  // ── D9 ephemeral travel-party lifecycle (keep / disband on arrival) ─────────
  partyIsAutoFormed(pt){ return !!(pt && pt.autoFormed === true); },
  travelPartyArrivalPrompts(){ const A = window.ACKS; return (A && A.travelPartyArrivalPrompts) ? A.travelPartyArrivalPrompts(this.currentCampaign) : []; },
  keepTravelPartyUI(partyId, name){
    const A = window.ACKS, c = this.currentCampaign;
    if(!A || !c) return;
    const res = A.keepTravelParty(c, partyId, { name: (name || '').trim() || undefined });
    if(res && res.ok){ this.showToast('Kept ' + res.party.name + ' as a standing party.', 3500); this.markDirty(); this.schedulePersist(); }
  },
  dissolveTravelPartyUI(partyId){
    const A = window.ACKS, c = this.currentCampaign;
    if(!A || !c) return;
    const pt = (c.parties || []).find(p => p && p.id === partyId);
    if(pt && !confirm('Disband ' + (pt.name || 'this travel party') + '? Members are released and its camp goes to the leader.')) return;
    const res = A.dissolveTravelParty(c, partyId);
    if(res && res.ok){ A.reconcilePartyMembership(c); this.showToast('Travel party dissolved.', 3000); this.markDirty(); this.schedulePersist(); }
  },

  // ── follow (tracking-split) — the departing part trails the lead at half-speed ──
  partyFollowInfo(pt){
    const c = this.currentCampaign;
    const j = (pt && pt.activeJourneyId) ? (this.journeyById ? this.journeyById(pt.activeJourneyId) : (c?.journeys || []).find(x => x && x.id === pt.activeJourneyId)) : null;
    if(!j || !j.followsJourneyId) return null;
    const lead = (c?.journeys || []).find(x => x && x.id === j.followsJourneyId) || null;
    const leadParty = (lead && lead.partyId) ? (c?.parties || []).find(p => p && p.id === lead.partyId) : null;
    return { journeyId: j.id, leadJourneyId: j.followsJourneyId, leadName: (leadParty && leadParty.name) || (lead && lead.name) || 'the others' };
  },
  retargetFollowUI(journeyId){
    const A = window.ACKS, c = this.currentCampaign;
    if(!A || !c || !A.retargetFollowJourney) return;
    const res = A.retargetFollowJourney(c, journeyId);
    if(res && res.ok){ this.showToast('Re-pointed the follow toward the lead.', 3000); this.markDirty(); this.schedulePersist(); }
    else { this.showToast('Could not re-point: ' + ((res && res.reason) || 'unknown'), 3000); }
  }

  });
})();
