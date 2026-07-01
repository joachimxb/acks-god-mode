/* acks-engine-movement-party.js — Movement 2.0 · Lane C · party split / merge / D9 ephemeral lifecycle
 *
 * The party-side of Movement 2.0 Team Session 1. Foundation (acks-engine-movement.js) guarantees every
 * people-journey resolves to a Party (D9 — ensureTravelParty auto-forms an `autoFormed` ephemeral party
 * from loose travellers). This module owns SPLITTING and MERGING that party and the ephemeral lifecycle:
 *
 *   • addToParty / removeFromParty / moveToParty — the CANONICAL party-membership setter (Architecture
 *     §5.10). The canonical field is character.partyId; party.memberCharacterIds is DERIVED by the shipped
 *     reconcilePartyMembership. Every membership mutation in Movement 2.0 (the §2.1 member drag, Lane A's
 *     move-away-leave, and this module's split/merge) routes through here — never hand-mutating
 *     memberCharacterIds / character.partyId. One character per party is inherent (partyId is single-valued).
 *   • splitParty / splitJourney — spawn a second party (+ optionally a following journey) from a subset,
 *     dividing shared stores per the GM's allocation (Joachim 2026-07-01: the camp Stash + rations/water
 *     STAY with the parent by default; the split modal may allocate camp-Stash items [tick-boxes] + a
 *     variable amount of rations/water [sliders] to the departing part).
 *   • mergeParties / mergeJourney — recombine two CO-LOCATED parties (Joachim: split parties never merge
 *     automatically; two parties in the same hex can be PROMPTED to merge). No auto-merge.
 *   • dissolveTravelParty / keepTravelParty / travelPartyArrivalPrompts — the D9 ephemeral lifecycle: an
 *     autoFormed travel party is PROMPTED keep-or-disband on arrival (default disband; keep/name promotes
 *     it to a standing party). Foundation forms it; Lane C dissolves / promotes it.
 *
 * Tracking-split (RAW note): the "follow" mode aims the departing part at the lead party at HALF expedition
 * speed (RR p.120 — tracking pace). It does NOT create a monster-pursuit encounter: the shipped slot-82
 * pursuit CATCH mints a fresh COMBAT encounter (right for a monster quarry, wrong for two friendly parts),
 * and its consumer lives in the Foundation-only acks-engine-subsystems.js. Per Joachim's decision the
 * resolution is instead the manual co-located merge prompt, so the follow rides the shipped journey engine
 * (a lazy journey.followsJourneyId marker + pace 'half-speed') with NO new day-tick slot and NO subsystems
 * edit. retargetFollowJourney re-points the follower at the lead's current hex.
 *
 * All state is lazy + additive (party.autoFormed [Foundation], journey.followsJourneyId/followsPartyId, the
 * reserved journey split/merge audit fields parentJourneyId/splitFromAtDayIndex/mergedIntoJourneyId/
 * mergedAtDayIndex), read defensively — NO migrateCampaign inject, NO schema bump. The only registration is
 * two record-only event kinds (journey-split / journey-merge), self-registered here via registerEventKind
 * (this module does NOT edit acks-engine-events.js). Extends global.ACKS via Object.assign; late-binds the
 * stash / journey / entity helpers (they load before this module, but every call is guarded anyway).
 */
(function(global){
'use strict';
global.ACKS = global.ACKS || {};
const ACKS = global.ACKS;

// ── tiny helpers ───────────────────────────────────────────────────────────────
function _findById(list, id){ return (Array.isArray(list) ? list.find(x => x && x.id === id) : null) || null; }
function _resolveParty(campaign, p){ if(!p) return null; if(typeof p === 'object') return p; return _findById(campaign && campaign.parties, p); }
function _resolveChar(campaign, c){ if(!c) return null; if(typeof c === 'object') return c; return _findById(campaign && campaign.characters, c); }
function _resolveJourney(campaign, j){ if(!j) return null; if(typeof j === 'object') return j; return _findById(campaign && campaign.journeys, j); }
function _reconcile(campaign){ if(typeof ACKS.reconcilePartyMembership === 'function') ACKS.reconcilePartyMembership(campaign); }
function _partyHistory(pt, campaign, type, narrative){ if(!pt) return; (pt.history = pt.history || []).push({ turn: (campaign && campaign.currentTurn) || null, type: type, narrative: narrative }); }
function _worldOrd(campaign){ return (((campaign && campaign.currentTurn) || 1) * 30) + (((campaign && campaign.currentDayInMonth) || 1)); }
// A party's physical position = its active journey's current hex, else its own currentHexId.
function _partyHexId(campaign, pt){
  if(!pt) return null;
  const j = pt.activeJourneyId ? _findById(campaign.journeys, pt.activeJourneyId) : null;
  return (j && j.currentHexId) || pt.currentHexId || null;
}
function _partyMemberIds(campaign, pt){
  if(!pt || !campaign) return [];
  return (campaign.characters || []).filter(c => c && c.partyId === pt.id).map(c => c.id);
}

// ═══════════════════════════════════════════════════════════════════════════════
// The CANONICAL party-membership setter (Architecture §5.10). character.partyId is
// the single canonical home; reconcilePartyMembership derives party.memberCharacterIds
// + re-validates leaderCharacterId. Every Movement 2.0 membership mutation routes here.
// ═══════════════════════════════════════════════════════════════════════════════

// Add a character to a party (moving it out of any prior party — partyId is single-valued).
function addToParty(campaign, party, characterId, opts){
  opts = opts || {};
  const pt = _resolveParty(campaign, party);
  const ch = _resolveChar(campaign, characterId);
  if(!campaign || !pt || !ch) return { ok: false, reason: 'bad-args' };
  if(pt.status === 'disbanded') return { ok: false, reason: 'disbanded-party' };
  if(ch.partyId === pt.id) return { ok: true, party: pt, character: ch, noop: true };
  const fromPartyId = ch.partyId || null;
  ch.partyId = pt.id;
  if(!pt.leaderCharacterId) pt.leaderCharacterId = ch.id;   // first member founds/leads
  _reconcile(campaign);                                     // rebuilds memberCharacterIds + re-validates BOTH parties' leaders
  if(typeof ACKS.ensurePartyCampStash === 'function') ACKS.ensurePartyCampStash(campaign, pt);   // every party keeps a travelling camp (Items I1)
  if(!opts.silent){
    _partyHistory(pt, campaign, 'member-joined', (ch.name || ch.id) + ' joined the party.');
    if(fromPartyId){ const from = _findById(campaign.parties, fromPartyId); if(from) _partyHistory(from, campaign, 'member-left', (ch.name || ch.id) + ' left for ' + (pt.name || 'another party') + '.'); }
  }
  return { ok: true, party: pt, character: ch, fromPartyId: fromPartyId };
}

// Remove a character from its party (partyId → null). No-op if party-less.
function removeFromParty(campaign, characterId, opts){
  opts = opts || {};
  const ch = _resolveChar(campaign, characterId);
  if(!campaign || !ch) return { ok: false, reason: 'bad-args' };
  const pid = ch.partyId || null;
  if(!pid) return { ok: true, character: ch, noop: true };
  ch.partyId = null;
  _reconcile(campaign);   // rebuilds the old party's memberCharacterIds + re-picks its leader if this was the leader
  const pt = _findById(campaign.parties, pid);
  if(pt && !opts.silent) _partyHistory(pt, campaign, 'member-left', (ch.name || ch.id) + ' left the party.');
  return { ok: true, character: ch, fromPartyId: pid };
}

// Move a character between parties (or to no party when toPartyId is falsy).
function moveToParty(campaign, characterId, toPartyId, opts){
  const toPt = _resolveParty(campaign, toPartyId);
  if(!toPt) return removeFromParty(campaign, characterId, opts);
  return addToParty(campaign, toPt, characterId, opts);
}

// ═══════════════════════════════════════════════════════════════════════════════
// D9 — the EPHEMERAL travel-party lifecycle. Foundation's ensureTravelParty forms an
// `autoFormed` party for loose journey travellers; on ARRIVAL it is PROMPTED keep-or-
// disband (default disband). keep promotes it to a standing party.
// ═══════════════════════════════════════════════════════════════════════════════

// Dissolve a party: release its members, hand its camp to the leader (or leave a hex cache), disband it.
// Mirrors the app's disbandParty in the engine so the arrival prompt + tests can run headless. Callable on
// any party; the D9 default action for an autoFormed party whose journey has arrived.
function dissolveTravelParty(campaign, party, opts){
  opts = opts || {};
  const pt = _resolveParty(campaign, party);
  if(!campaign || !pt) return { ok: false, reason: 'bad-args' };
  if(pt.status === 'disbanded') return { ok: true, noop: true };
  const members = (campaign.characters || []).filter(c => c && c.partyId === pt.id);
  let camp = null;
  if(typeof ACKS.handOffPartyCampToLeader === 'function') camp = ACKS.handOffPartyCampToLeader(campaign, pt);   // leader takes the equipment (RR — "the leader takes all the equipment"); no leader → hex cache
  for(const ch of members){ if(ch) ch.partyId = null; }
  pt.status = 'disbanded';
  pt.disbandedAtTurn = (campaign.currentTurn != null) ? campaign.currentTurn : null;
  pt.leaderCharacterId = null;
  pt.activeJourneyId = null;
  _partyHistory(pt, campaign, 'disbanded', (pt.name || 'Party') + ' disbanded' + (pt.autoFormed ? ' (auto-formed travel party, dissolved on arrival)' : '') + '.');
  _reconcile(campaign);
  return { ok: true, disbanded: true, releasedIds: members.map(c => c.id), camp: camp };
}

// Keep an autoFormed party — promote it to a standing party (clear autoFormed; optionally name it).
function keepTravelParty(campaign, party, opts){
  opts = opts || {};
  const pt = _resolveParty(campaign, party);
  if(!campaign || !pt) return { ok: false, reason: 'bad-args' };
  pt.autoFormed = false;   // it now persists past arrival
  if(opts.name && typeof opts.name === 'string' && opts.name.trim()) pt.name = opts.name.trim();
  _partyHistory(pt, campaign, 'kept', 'Kept as a standing party' + (opts.name ? (' — "' + pt.name + '"') : '') + '.');
  return { ok: true, party: pt };
}

// The autoFormed parties awaiting the keep-or-disband prompt: those whose journey has ARRIVED (or no longer
// has a live journey). The UI surfaces the prompt; the GM keeps or dissolves. Derived, no stored flag.
function travelPartyArrivalPrompts(campaign){
  if(!campaign || !Array.isArray(campaign.parties)) return [];
  const out = [];
  for(const pt of campaign.parties){
    if(!pt || pt.status === 'disbanded' || pt.autoFormed !== true) continue;
    const j = pt.activeJourneyId ? _findById(campaign.journeys, pt.activeJourneyId) : null;
    const arrived = !j || j.status === 'arrived' || j.status === 'merged';
    if(arrived) out.push(pt);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SPLIT — spawn a second party from a subset of the members, dividing shared stores.
// Store policy (Joachim 2026-07-01): the camp Stash + journey rations/water STAY with
// the parent by default; opts may allocate camp-Stash items (campItemIds) + a variable
// amount of rations/water (rationsToNew / waterToNew) to the departing part. The
// departing members' PERSONAL carried gear rides with them automatically (it's on the
// character). mode 'follow' aims the departing part at the parent (tracking-split).
// ═══════════════════════════════════════════════════════════════════════════════

function _splitDefaultName(campaign, leadCharId){
  const lead = _resolveChar(campaign, leadCharId);
  return (lead && lead.name) ? (lead.name + "'s party") : 'Splinter party';
}

// Shared provisions live on the PARTY CAMP STASH after a journey seeds them (seedJourneyProvisions:
// ONE ration line with daysRemaining in the camp; water distributes per-member as waterDaysCarried, and
// forage/GM can pool water on the camp too). The split sliders divide the camp pools; each member's own
// carried water rides with them automatically. These helpers move whole ration-DAYS / water-DAYS.
function _campRationDays(camp){
  let days = 0;
  for(const it of ((camp && camp.items) || [])){ if(typeof ACKS.isRationLine === 'function' && ACKS.isRationLine(it)) days += Math.max(0, Number(it.daysRemaining) || 0); }
  return days;
}
function _transferRationDays(campSrc, campB, nDays){
  if(!campSrc || !campB || !(nDays > 0)) return 0;
  let need = nDays, drawn = 0;
  for(const it of (campSrc.items || [])){
    if(need <= 0) break;
    if(!(typeof ACKS.isRationLine === 'function' && ACKS.isRationLine(it))) continue;
    const have = Math.max(0, Number(it.daysRemaining) || 0);
    if(have <= 0) continue;
    const take = Math.min(have, need);
    it.daysRemaining = have - take;
    if(ACKS.RATION_FOOD_ST_PER_DAY != null) it.stone = it.daysRemaining * ACKS.RATION_FOOD_ST_PER_DAY;
    need -= take; drawn += take;
  }
  campSrc.items = (campSrc.items || []).filter(it => !(typeof ACKS.isRationLine === 'function' && ACKS.isRationLine(it)) || (Number(it.daysRemaining) || 0) > 0);
  if(drawn > 0 && typeof ACKS.makeRationLine === 'function'){
    campB.items = campB.items || [];
    campB.items.push(ACKS.makeRationLine({ rationType: 'iron', daysRemaining: drawn }));
  }
  return drawn;
}
function _transferWaterDays(campSrc, campB, nDays){
  if(!campSrc || !campB) return 0;
  const have = Math.max(0, Number(campSrc.waterDaysCarried) || 0);
  const take = Math.max(0, Math.min(Number(nDays) || 0, have));
  if(take > 0){ campSrc.waterDaysCarried = have - take; campB.waterDaysCarried = (Number(campB.waterDaysCarried) || 0) + take; }
  return take;
}

// Aim the departing party at the parent: its own journey toward the parent's current hex at half-speed
// (RR p.120), tagged followsJourneyId. NO monster-pursuit record (no slot-82 combat catch). The follow
// party's rations already live in its camp (divided at split time — see _divideStores), so the journey's
// abstract supplies pool starts empty; the survival tick draws from the camp.
function _startFollowJourney(campaign, partyB, srcParty, srcJourney){
  if(typeof ACKS.blankJourney !== 'function' || typeof ACKS.startJourney !== 'function') return null;
  const memberIds = _partyMemberIds(campaign, partyB);
  const targetHexId = srcJourney.currentHexId || srcJourney.startHexId || partyB.currentHexId || null;
  const j = ACKS.blankJourney({
    name: (partyB.name || 'Party') + ' (following ' + (srcParty.name || 'the others') + ')',
    participantCharacterIds: memberIds, partyId: partyB.id,
    startHexId: partyB.currentHexId || targetHexId, destinationHexId: targetHexId,
    mode: srcJourney.mode || 'foot', pace: 'half-speed',   // RR p.120 — a party following tracks at half expedition speed
    supplies: { rations: 0, waterRations: 0, animalFeed: 0, animalWater: 0, shipStores: 0 }
  });
  j.followsJourneyId = srcJourney.id;   // lazy marker: this journey trails another (Movement 2.0 tracking-split)
  j.followsPartyId = srcParty.id;
  j.parentJourneyId = srcJourney.id;
  j.splitFromAtDayIndex = (srcJourney.currentDayIndex != null) ? srcJourney.currentDayIndex : 0;
  campaign.journeys = campaign.journeys || [];
  campaign.journeys.push(j);
  ACKS.startJourney(campaign, j);
  return j;
}

// Re-point a follow journey at the lead's CURRENT hex (the lead keeps moving; the GM re-aims the follower).
function retargetFollowJourney(campaign, followerJourney){
  const j = _resolveJourney(campaign, followerJourney);
  if(!j || !j.followsJourneyId) return { ok: false, reason: 'not-a-follow' };
  const lead = _findById(campaign.journeys, j.followsJourneyId);
  if(!lead) return { ok: false, reason: 'no-lead' };
  const dest = lead.currentHexId || lead.destinationHexId || null;
  if(!dest) return { ok: false, reason: 'no-lead-position' };
  if(typeof ACKS.reRouteJourney === 'function') ACKS.reRouteJourney(campaign, j, { destinationHexId: dest });
  else j.destinationHexId = dest;
  return { ok: true, journey: j, destinationHexId: dest };
}

// Split `departingMemberIds` off `party` into a new party. opts:
//   { newName?, mode?: 'stay'|'follow', rationsToNew?, waterToNew?, campItemIds?: [stashItemId] }
function splitParty(campaign, party, departingMemberIds, opts){
  opts = opts || {};
  const src = _resolveParty(campaign, party);
  if(!campaign || !src) return { ok: false, reason: 'bad-args' };
  if(src.status === 'disbanded') return { ok: false, reason: 'disbanded-party' };
  const srcMemberIds = _partyMemberIds(campaign, src);
  const departing = (departingMemberIds || []).filter(id => srcMemberIds.indexOf(id) >= 0);
  if(!departing.length) return { ok: false, reason: 'no-departing' };
  if(departing.length >= srcMemberIds.length) return { ok: false, reason: 'whole-party' };   // must leave ≥1 behind
  const srcJourney = src.activeJourneyId ? _findById(campaign.journeys, src.activeJourneyId) : null;
  const hexId = _partyHexId(campaign, src);

  // 1) create the departing party B + move members through the canonical setter
  const partyB = ACKS.blankParty({
    name: opts.newName || _splitDefaultName(campaign, departing[0]),
    currentHexId: hexId, leaderCharacterId: departing[0],
    formedAtTurn: (campaign.currentTurn != null) ? campaign.currentTurn : null
  });
  campaign.parties = campaign.parties || [];
  campaign.parties.push(partyB);
  for(const id of departing) moveToParty(campaign, id, partyB.id, { silent: true });
  if(typeof ACKS.ensurePartyCampStash === 'function') ACKS.ensurePartyCampStash(campaign, partyB);

  // 2) divide the shared stores on the CAMP STASH (Joachim 2026-07-01: the camp + rations/water STAY with
  //    the parent by default; opts allocate to the departing part). campItemIds = whole item lines (tick-
  //    boxes — ration lines excluded in the UI, they use the ration slider); rationsToNew / waterToNew =
  //    ration-DAYS / water-DAYS (sliders). Each member's own carried water rides with them automatically.
  const division = { rations: 0, water: 0, campItems: 0 };
  const campSrc = (typeof ACKS.ensurePartyCampStash === 'function') ? ACKS.ensurePartyCampStash(campaign, src)
                : (typeof ACKS.partyCampStash === 'function' ? ACKS.partyCampStash(campaign, src.id) : null);
  const campB = (typeof ACKS.ensurePartyCampStash === 'function') ? ACKS.ensurePartyCampStash(campaign, partyB) : null;
  if(campSrc && campB){
    const itemIds = Array.isArray(opts.campItemIds) ? opts.campItemIds.filter(Boolean) : [];
    if(itemIds.length && typeof ACKS.transferBetweenStashes === 'function'){
      const r = ACKS.transferBetweenStashes(campaign, campSrc.id, campB.id, itemIds.map(id => ({ itemId: id })), { reason: 'party-split' });
      if(r) division.campItems = (r.transferred || []).length;
    }
    division.rations = _transferRationDays(campSrc, campB, Number(opts.rationsToNew) || 0);
    division.water = _transferWaterDays(campSrc, campB, Number(opts.waterToNew) || 0);
  }

  // 3) the departing part's next step: follow (tracking-split) or stay put
  const follow = (opts.mode === 'follow') && !!srcJourney;
  const newJourney = follow ? _startFollowJourney(campaign, partyB, src, srcJourney) : null;

  // 4) audit + events
  _emitSplit(campaign, src, partyB, srcJourney, newJourney, departing, follow ? 'follow' : 'stay', hexId);
  _partyHistory(src, campaign, 'split', departing.length + ' member(s) split off to form ' + partyB.name + (follow ? ' (following)' : '') + '.');
  _partyHistory(partyB, campaign, 'formed-by-split', 'Split from ' + (src.name || 'party') + '.');
  _reconcile(campaign);
  return { ok: true, sourceParty: src, newParty: partyB, newJourney: newJourney, division: division, mode: follow ? 'follow' : 'stay' };
}

// Journey-aware entry (brief-named): split a subset off the journey's owning party.
function splitJourney(campaign, journey, memberIds, opts){
  const j = _resolveJourney(campaign, journey);
  if(!campaign || !j) return { ok: false, reason: 'no-journey' };
  const pt = j.partyId ? _findById(campaign.parties, j.partyId) : null;
  if(!pt) return { ok: false, reason: 'no-party' };   // a people-journey always has a party (D9)
  return splitParty(campaign, pt, memberIds, opts);
}

// ═══════════════════════════════════════════════════════════════════════════════
// MERGE — recombine two CO-LOCATED parties (Joachim: split parties never auto-merge;
// two parties in the same hex are PROMPTED to merge). `keep` absorbs `absorb`.
// ═══════════════════════════════════════════════════════════════════════════════

// Other non-disbanded parties sharing this party's hex — the merge-prompt candidates.
function mergeCandidatesFor(campaign, party){
  const pt = _resolveParty(campaign, party);
  if(!campaign || !pt) return [];
  const hex = _partyHexId(campaign, pt);
  if(!hex) return [];
  return (campaign.parties || []).filter(p => p && p.id !== pt.id && p.status !== 'disbanded' && _partyHexId(campaign, p) === hex);
}

function mergeParties(campaign, keepParty, absorbParty, opts){
  opts = opts || {};
  const keep = _resolveParty(campaign, keepParty);
  const absorb = _resolveParty(campaign, absorbParty);
  if(!campaign || !keep || !absorb || keep.id === absorb.id) return { ok: false, reason: 'bad-args' };
  if(keep.status === 'disbanded' || absorb.status === 'disbanded') return { ok: false, reason: 'disbanded-party' };
  const keepHex = _partyHexId(campaign, keep), absorbHex = _partyHexId(campaign, absorb);
  if(!opts.force && keepHex && absorbHex && keepHex !== absorbHex) return { ok: false, reason: 'not-co-located', keepHex: keepHex, absorbHex: absorbHex };
  const keepJourney = keep.activeJourneyId ? _findById(campaign.journeys, keep.activeJourneyId) : null;
  const absorbJourney = absorb.activeJourneyId ? _findById(campaign.journeys, absorb.activeJourneyId) : null;
  const movedIds = _partyMemberIds(campaign, absorb);

  // 1) move every absorbed member through the canonical setter
  for(const id of movedIds) moveToParty(campaign, id, keep.id, { silent: true });

  // 2) merge camp stashes (absorb → keep): GEAR items ride transferBetweenStashes by id, but a ration
  //    line carries NO stash-item id (rations are peeled by ration-day, not withdrawn by id) and camp
  //    water is a number — move both via the day helpers. Passing an id-less line's {itemId:undefined}
  //    to withdrawFromStash would abort the whole (atomic) transfer, so filter to id-bearing gear only.
  if(typeof ACKS.partyCampStash === 'function'){
    const campA = ACKS.partyCampStash(campaign, absorb.id);
    const campK = (typeof ACKS.ensurePartyCampStash === 'function') ? ACKS.ensurePartyCampStash(campaign, keep) : ACKS.partyCampStash(campaign, keep.id);
    if(campA && campK){
      const gear = (campA.items || []).filter(it => it && it.id && !(typeof ACKS.isRationLine === 'function' && ACKS.isRationLine(it))).map(it => ({ itemId: it.id }));
      if(gear.length && typeof ACKS.transferBetweenStashes === 'function') ACKS.transferBetweenStashes(campaign, campA.id, campK.id, gear, { reason: 'party-merge' });
      _transferRationDays(campA, campK, _campRationDays(campA));                 // ration lines (id-less) — peel all days
      _transferWaterDays(campA, campK, Number(campA.waterDaysCarried) || 0);     // camp water — move all
    }
  }

  // 3) merge journey supplies (absorb → keep) when both are journeying
  if(keepJourney && absorbJourney){
    keepJourney.supplies = keepJourney.supplies || {};
    for(const k of ['rations', 'waterRations', 'animalFeed', 'animalWater', 'shipStores']){
      keepJourney.supplies[k] = ((keepJourney.supplies[k]) || 0) + ((absorbJourney.supplies && absorbJourney.supplies[k]) || 0);
    }
  }

  // 4) stop the absorbed journey (reserved §16 audit fields) + re-home its travellers' journey pointer
  if(absorbJourney){
    absorbJourney.mergedIntoJourneyId = keepJourney ? keepJourney.id : (keep.activeJourneyId || null);
    absorbJourney.mergedAtDayIndex = absorbJourney.currentDayIndex || 0;
    absorbJourney.status = 'merged';
    for(const c of (campaign.characters || [])){ if(c && c.currentJourneyId === absorbJourney.id) c.currentJourneyId = keepJourney ? keepJourney.id : null; }
  }

  // 5) disband the emptied absorbed party
  absorb.status = 'disbanded';
  absorb.disbandedAtTurn = (campaign.currentTurn != null) ? campaign.currentTurn : null;
  absorb.leaderCharacterId = null;
  absorb.activeJourneyId = null;
  _partyHistory(keep, campaign, 'merged-in', 'Absorbed ' + (absorb.name || 'a party') + ' (' + movedIds.length + ' member' + (movedIds.length === 1 ? '' : 's') + ').');
  _partyHistory(absorb, campaign, 'merged', 'Merged into ' + (keep.name || 'a party') + '.');
  _reconcile(campaign);
  _emitMerge(campaign, keep, absorb, keepJourney, absorbJourney, movedIds, keepHex || absorbHex);
  return { ok: true, party: keep, absorbedId: absorb.id, movedIds: movedIds };
}

// Journey-aware entry (brief-named): merge two journeys' parties (keep = a's party absorbs b's).
function mergeJourney(campaign, aJourney, bJourney, opts){
  const a = _resolveJourney(campaign, aJourney), b = _resolveJourney(campaign, bJourney);
  if(!campaign || !a || !b) return { ok: false, reason: 'no-journey' };
  const keep = a.partyId ? _findById(campaign.parties, a.partyId) : null;
  const absorb = b.partyId ? _findById(campaign.parties, b.partyId) : null;
  if(!keep || !absorb) return { ok: false, reason: 'no-party' };
  return mergeParties(campaign, keep, absorb, opts);
}

// ── event emission (record-only, opt-out; never blocks the operation) ──────────
function _relEntities(m){ return m.filter(Boolean); }
function _emitEvent(campaign, kind, hexId, related, payload){
  if(typeof ACKS.newEvent !== 'function') return null;
  try {
    campaign.eventLog = campaign.eventLog || [];
    const cal = campaign.calendar || {};
    const ev = ACKS.newEvent(kind, {
      submittedBy: 'engine', status: (ACKS.EVENT_STATUS && ACKS.EVENT_STATUS.APPLIED) || 'applied', cadence: 'daily',
      targetTurn: campaign.currentTurn || 1,
      gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: campaign.currentDayInMonth || 1 },
      context: { primaryHexId: hexId || null, involvedHexIds: hexId ? [hexId] : [], settlementId: null, domainId: null, relatedEntities: related },
      payload: payload
    });
    ev.appliedAtTurn = campaign.currentTurn || 1;
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: payload.narrative || '' }, appliedAtTurn: campaign.currentTurn || 1, appliedAt: new Date().toISOString() });
    return ev;
  } catch(e){ return null; }   // event emission never blocks a split/merge
}
function _emitSplit(campaign, src, partyB, srcJourney, newJourney, departingIds, mode, hexId){
  const narrative = departingIds.length + ' member' + (departingIds.length === 1 ? '' : 's') + ' split off from ' + (src.name || 'a party') + ' to form ' + (partyB.name || 'a new party') + (mode === 'follow' ? ' (following).' : '.');
  return _emitEvent(campaign, 'journey-split', hexId,
    _relEntities([{ kind: 'party', id: src.id, role: 'subject' }, { kind: 'party', id: partyB.id, role: 'object' }]
      .concat(departingIds.map(id => ({ kind: 'character', id: id, role: 'traveller' })))),
    { sourcePartyId: src.id, newPartyId: partyB.id, parentJourneyId: srcJourney ? srcJourney.id : null,
      newJourneyId: newJourney ? newJourney.id : null, departingMemberIds: departingIds.slice(), mode: mode, narrative: narrative });
}
function _emitMerge(campaign, keep, absorb, keepJourney, absorbJourney, movedIds, hexId){
  const narrative = (absorb.name || 'a party') + ' merged into ' + (keep.name || 'a party') + ' (' + movedIds.length + ' member' + (movedIds.length === 1 ? '' : 's') + ').';
  return _emitEvent(campaign, 'journey-merge', hexId,
    _relEntities([{ kind: 'party', id: keep.id, role: 'subject' }, { kind: 'party', id: absorb.id, role: 'object' }]
      .concat(movedIds.map(id => ({ kind: 'character', id: id, role: 'traveller' })))),
    { keepPartyId: keep.id, absorbedPartyId: absorb.id, keepJourneyId: keepJourney ? keepJourney.id : null,
      absorbedJourneyId: absorbJourney ? absorbJourney.id : null, mergedMemberIds: movedIds.slice(), narrative: narrative });
}

// ── self-registered event kinds (record-only, wizard opt-out) — from THIS module ──
if(typeof ACKS.registerEventKind === 'function'){
  ACKS.registerEventKind('journey-split', {
    schema: { R: { sourcePartyId: 'string', newPartyId: 'string' },
              O: { parentJourneyId: 'string', newJourneyId: 'string', departingMemberIds: 'array', mode: 'string', narrative: 'string' } },
    wizardOptOut: true
  });
  ACKS.registerEventKind('journey-merge', {
    schema: { R: { keepPartyId: 'string', absorbedPartyId: 'string' },
              O: { keepJourneyId: 'string', absorbedJourneyId: 'string', mergedMemberIds: 'array', narrative: 'string' } },
    wizardOptOut: true
  });
}

Object.assign(ACKS, {
  // canonical party-membership setter (Architecture §5.10)
  addToParty, removeFromParty, moveToParty,
  // D9 ephemeral lifecycle
  dissolveTravelParty, keepTravelParty, travelPartyArrivalPrompts,
  // split
  splitParty, splitJourney, retargetFollowJourney,
  // merge
  mergeParties, mergeJourney, mergeCandidatesFor
});

if(typeof module !== 'undefined' && module.exports){ module.exports = ACKS; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
