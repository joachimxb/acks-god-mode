/* acks-engine-movement.js — Movement 2.0 · the shared Mover primitive (Foundation)
 *
 * The ONE movement primitive that unifies every map-mover (character / party journey,
 * army march, sea voyage, monster band, the ventures transport leg): a per-day MOVEMENT
 * BUDGET (miles, activity-budget-aware, displayed as hexes) spent by two verbs — a manual
 * Move (one hex) + a Journey autopilot (a route) — that walk the SAME single-hex step.
 *
 * The reframe (Movement_2.0_Plan.md §0/§2): the unified engine substantially EXISTS —
 * tickJourneyDay already walks hex-by-hex, armies/voyages ride it, journey.speedOverrideMilesPerDay
 * already "sets the day's mile budget directly." Foundation EXPOSES + COMPLETES that seam; it does
 * NOT rebuild it. In particular the shipped WHOLE-DAY resolver (tickJourneyDay / proposeJourneyDay /
 * advanceJourneyOneDay / commitJourneyRecord — the slot-30 Day-Clock auto-advance + the start-flow +
 * the reroll) is BYTE-EXACT-oracle-locked and is left UNTOUCHED. This module adds the NEW per-hex
 * primitive ALONGSIDE it: _moveStep (the single hex), moveActorOneHex (the manual Move verb) and
 * advanceJourneyOneHex + its ⏩-day / ⏭-destination loops (the interactive autopilot). One code path
 * (_moveStep), two callers (Move + Journey autopilot). Converging the slot-30 auto-advance onto the
 * per-hex path (which would drift the seeded oracle) is deferred, NOT done here.
 *
 * All new state is lazy + additive (character.dailyMovement, journey.groupId, party.autoFormed, the
 * per-mover `regime` fields), read defensively so the 6 templates + the demo stay migrate-no-ops —
 * NO migrateCampaign inject, NO schema bump. The only registration is the record-only `movement`
 * event kind. Extends global.ACKS via Object.assign; late-binds subsystems/military/stash/mounts.
 *
 * Foundation deliverables (handoff _handoffs/Movement_2.0_Foundation.md §3): F-1 budget · F-2 step +
 * Move verb · F-3 per-hex journey advance · F-4 per-hex cost · F-5 journey.groupId · F-6 ensureTravelParty
 * (D9) · F-7 movement event + regime shape + groupCarryingCapacity · F-8 module home + the two seams.
 */
(function(global){
'use strict';
global.ACKS = global.ACKS || {};
const ACKS = global.ACKS;

// ── constants ────────────────────────────────────────────────────────────────
// The 6 axial {q,r} deltas per hex face 0..5 — byte-identical to subsystems.js HEX_EDGE_DELTAS
// (which is module-private there). A stable RAW-fixed constant; inlined to avoid an export edit.
const HEX_EDGE_DELTAS = [[1, 0], [0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1]];

// ── the world-day ordinal — the single canonical formula (maneuvers.js worldOrd) ──
function movementWorldOrd(campaign){
  return (((campaign && campaign.currentTurn) || 1) * 30) + (((campaign && campaign.currentDayInMonth) || 1));
}

// ═══════════════════════════════════════════════════════════════════════════════
// Mover resolution — any actor (character | party | journey | army | unit | band)
// resolves to { kind, entity, journey, memberIds, currentHexId }. The single read
// the budget + both verbs consume, so a character, a party and a group all move
// through one code path.
// ═══════════════════════════════════════════════════════════════════════════════
function _findById(list, id){ return (Array.isArray(list) ? list.find(x => x && x.id === id) : null) || null; }

function resolveMover(campaign, actor){
  if(!campaign || !actor) return null;
  let ent = actor;
  if(typeof actor === 'string'){
    ent = _findById(campaign.journeys, actor)
       || _findById(campaign.parties, actor)
       || _findById(campaign.characters, actor)
       || (typeof ACKS.findGroup === 'function' ? ACKS.findGroup(campaign, actor) : null)
       || (typeof ACKS.findArmy === 'function' ? ACKS.findArmy(campaign, actor) : null)
       || (typeof ACKS.findUnit === 'function' ? ACKS.findUnit(campaign, actor) : null);
  }
  if(!ent || typeof ent !== 'object') return null;
  // journey — has the participant list + the travel-status axis
  if(Array.isArray(ent.participantCharacterIds) && ('status' in ent) && ('currentDayIndex' in ent)){
    return { kind: 'journey', entity: ent, journey: ent, memberIds: (ent.participantCharacterIds || []).slice(),
             currentHexId: ent.currentHexId || ent.startHexId || null };
  }
  // party — has the member list + the party-actor axis
  if(Array.isArray(ent.memberCharacterIds) && !ent.groupTemplate){
    const j = ent.activeJourneyId ? _findById(campaign.journeys, ent.activeJourneyId) : null;
    return { kind: 'party', entity: ent, journey: j, memberIds: ent.memberCharacterIds.slice(),
             currentHexId: (j && j.currentHexId) || ent.currentHexId || null };
  }
  // group — army / unit / band (via the shared Group interface)
  const gk = (typeof ACKS.groupKindOf === 'function') ? ACKS.groupKindOf(ent) : null;
  if(gk && gk !== 'party' && gk !== 'unknown'){
    const mem = (typeof ACKS.groupMembers === 'function') ? ACKS.groupMembers(campaign, ent).map(c => c && c.id).filter(Boolean) : [];
    const j = (typeof ACKS.groupJourney === 'function') ? ACKS.groupJourney(campaign, ent) : null;
    const pos = (typeof ACKS.groupPosition === 'function') ? ACKS.groupPosition(campaign, ent) : null;
    return { kind: gk, entity: ent, journey: j, memberIds: mem, currentHexId: (j && j.currentHexId) || pos || ent.currentHexId || null };
  }
  // character — the five-axis fields identify it
  if(('socialTier' in ent) || ('controlledBy' in ent)){
    const j = ent.currentJourneyId ? _findById(campaign.journeys, ent.currentJourneyId) : null;
    return { kind: 'character', entity: ent, journey: j, memberIds: [ent.id],
             currentHexId: (j && j.currentHexId) || ent.currentHexId || null };
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// F-7 (read half — the shape lands in Slice 3) — the per-mover REGIME.
// Canonical on the party, mirrored onto the journey (two-way sync is Lane D). Read
// defensively so a mover with no regime yet returns the RAW defaults (opt-outs follow
// the global house rules; sharing OFF). _moveStep consults regime.skipEncounters.
// ═══════════════════════════════════════════════════════════════════════════════
const REGIME_DEFAULT = Object.freeze({ skipEncounters: false, skipProvisioning: null, skipEncumbrance: null, shareRations: false, shareLoad: false });
function moverRegime(campaign, moverOrResolved){
  const m = (moverOrResolved && moverOrResolved.entity) ? moverOrResolved : resolveMover(campaign, moverOrResolved);
  if(!m) return Object.assign({}, REGIME_DEFAULT);
  // party is canonical; a journey mirrors its party (or carries its own for army/band journeys).
  const party = (m.kind === 'party') ? m.entity
              : (m.journey && m.journey.partyId) ? _findById(campaign.parties, m.journey.partyId)
              : null;
  const src = (party && party.regime) || (m.journey && m.journey.regime) || (m.entity && m.entity.regime) || null;
  const out = Object.assign({}, REGIME_DEFAULT);
  if(src && typeof src === 'object'){
    for(const k of Object.keys(REGIME_DEFAULT)) if(src[k] != null) out[k] = src[k];
  }
  // map the shipped party.shareProvisions → regime.shareRations when no explicit regime says otherwise
  // (D8 — retires the old "journey.shareRations overrides party" precedence; full two-way sync is Lane D).
  if((!src || src.shareRations == null)){
    if(party && party.shareProvisions === true) out.shareRations = true;
    else if(m.journey && m.journey.shareRations === true) out.shareRations = true;
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════
// F-1 — the per-character daily MOVEMENT budget (miles/day, displayed as hexes).
//   character.dailyMovement = { worldOrd, milesUsed }  (lazy; reset on a new world day)
// Lives on the CHARACTER so it survives a party join (D1); a party's cap = the slowest
// member's speed × the activity-budget-capped pace, its used = the MOST-spent member
// (they move together, so the most-spent binds — nobody regains a spent day).
// ═══════════════════════════════════════════════════════════════════════════════
function _charDailyMovement(character, worldOrd){
  const dm = character && character.dailyMovement;
  if(dm && typeof dm === 'object' && dm.worldOrd === worldOrd) return { worldOrd, milesUsed: dm.milesUsed || 0 };
  return { worldOrd, milesUsed: 0 };   // stale / absent ⇒ a fresh day (read-only reset; the write happens on debit)
}

// A journey-shaped object the shipped speed/pace dispatchers understand, for a non-journey mover.
function _moverSpeedJourney(campaign, m){
  if(m.journey) return m.journey;   // ride the real journey (armyId/unitId/shipId dispatch + real pace)
  const jl = { id: null, participantCharacterIds: m.memberIds.slice(), pace: 'normal', packAnimalIds: [] };
  if(m.kind === 'army') jl.armyId = m.entity.id;
  else if(m.kind === 'unit') jl.unitId = m.entity.id;
  if(m.kind === 'party') jl.partyId = m.entity.id;
  return jl;
}

function moverDayBudget(campaign, actor){
  const MPH = (ACKS.JOURNEY_MILES_PER_HEX != null) ? ACKS.JOURNEY_MILES_PER_HEX : 6;
  const m = (actor && actor.entity && actor.memberIds) ? actor : resolveMover(campaign, actor);
  if(!m) return { capMiles: 0, usedMiles: 0, remainingMiles: 0, hexesRemaining: 0, perHexCostHere: MPH, memberIds: [], pace: 'halted', kind: null };
  const worldOrd = movementWorldOrd(campaign);
  const jl = _moverSpeedJourney(campaign, m);
  // base = the mover's current speed (slowest member incl. mounts/encumbrance; army/unit dispatch).
  let base;
  if(m.kind === 'army' || m.kind === 'unit' || m.kind === 'band'){
    base = (typeof ACKS.groupSpeed === 'function') ? ACKS.groupSpeed(campaign, m.entity) : (ACKS.JOURNEY_BASE_SPEED_MILES_PER_DAY || 24);
  } else {
    base = (typeof ACKS.journeyBaseSpeedMilesPerDay === 'function') ? ACKS.journeyBaseSpeedMilesPerDay(campaign, jl) : (ACKS.JOURNEY_BASE_SPEED_MILES_PER_DAY || 24);
  }
  // effective pace: the desired pace capped by each traveller's #346 activity budget (a dedicated
  // travel day is full; an ancillary day is half; a fully-booked day is halted). Groups (army/unit/
  // band) ride their own march cadence — the activity budget is a party-grain concept.
  let pace = jl.pace || 'normal';
  if(m.kind !== 'army' && m.kind !== 'unit' && m.kind !== 'band' && typeof ACKS.journeyEffectivePace === 'function' && m.memberIds.length){
    try { pace = ACKS.journeyEffectivePace(campaign, jl); } catch(e){ /* fall back to the stored pace */ }
  }
  const paceMult = (ACKS.JOURNEY_PACE_SPEED && ACKS.JOURNEY_PACE_SPEED[pace] != null) ? ACKS.JOURNEY_PACE_SPEED[pace] : 1;
  const capMiles = Math.max(0, base * paceMult);
  let usedMiles = 0;
  for(const id of m.memberIds){
    const c = _findById(campaign.characters, id);
    if(!c) continue;
    const u = _charDailyMovement(c, worldOrd).milesUsed;
    if(u > usedMiles) usedMiles = u;
  }
  const remainingMiles = Math.max(0, capMiles - usedMiles);
  const hereHex = m.currentHexId ? (typeof ACKS.findHex === 'function' ? ACKS.findHex(campaign, m.currentHexId) : null) : null;
  const perHexCostHere = _perHexCostMilesInto(campaign, hereHex || { terrain: 'grassland' }, null, m);
  return {
    capMiles, usedMiles, remainingMiles, perHexCostHere,
    hexesRemaining: (perHexCostHere > 0) ? Math.floor((remainingMiles + 1e-9) / perHexCostHere) : 0,
    memberIds: m.memberIds.slice(), pace, kind: m.kind
  };
}
function movementBudgetRemaining(campaign, actor){ return moverDayBudget(campaign, actor).remainingMiles; }

// ═══════════════════════════════════════════════════════════════════════════════
// F-4 — the per-hex cost model (RR p.272 terrain × road; p.275 fording; pp.147-148
// surefooted). Completes RAW the whole-day path under-applies: per-side road bonus +
// surefooted-mountain wiring, charged PER HEX entered. Mirrors tickJourneyDay's hex
// cost (a hex of speed-mult m costs MILES_PER_HEX / m) and adds surefooted on top.
// ═══════════════════════════════════════════════════════════════════════════════
function _moverMounts(campaign, m){
  if(!m || !m.journey || typeof ACKS.mountsForJourney !== 'function') return [];
  try { return ACKS.mountsForJourney(campaign, m.journey) || []; } catch(e){ return []; }
}
function _perHexCostMilesInto(campaign, toHex, entrySide, m){
  const MPH = (ACKS.JOURNEY_MILES_PER_HEX != null) ? ACKS.JOURNEY_MILES_PER_HEX : 6;
  if(!toHex) return MPH;
  const TS = ACKS.JOURNEY_TERRAIN_SPEED || {};
  const GS = ACKS.JOURNEY_GROUND_SPEED || {};
  const roaded = (typeof ACKS.roadBonusForStep === 'function') ? ACKS.roadBonusForStep(toHex, entrySide, null) : !!toHex.hasRoad;
  let tMult;
  if(roaded){
    tMult = (TS.road != null) ? TS.road : 1.5;
  } else {
    const terr = toHex.terrain || 'grassland';
    tMult = (TS[terr] != null) ? TS[terr] : 1;
    // surefooted mounts (donkey/mule ×2/3 on mountains vs the standard ×1/2) — the best mount governs.
    if(typeof ACKS.mountTerrainMoveMultiplier === 'function'){
      for(const mnt of _moverMounts(campaign, m)){
        if(!mnt) continue;
        const sm = ACKS.mountTerrainMoveMultiplier(mnt, terr);
        if(typeof sm === 'number' && sm > tMult) tMult = sm;
      }
    }
  }
  const gMult = (GS[toHex.groundCondition || 'clear'] != null) ? GS[toHex.groundCondition || 'clear'] : 1;
  return MPH / Math.max(0.01, tMult * gMult);
}
// Public: the per-hex cost for a mover entering `toHexId` (the UI's hex-preview read).
function moverPerHexCost(campaign, actor, toHexId, entrySide){
  const m = (actor && actor.entity) ? actor : resolveMover(campaign, actor);
  const toHex = toHexId ? (typeof ACKS.findHex === 'function' ? ACKS.findHex(campaign, toHexId) : null) : null;
  return _perHexCostMilesInto(campaign, toHex, (entrySide != null ? entrySide : null), m);
}

// ── per-mover once-per-day navigation marker (getting lost is day-grained, §3.6) ──
function _moverNavHost(m){ return (m.journey) || (m.kind === 'party' && m.entity) || m.entity || null; }
function _moverNavOrd(m){ const h = _moverNavHost(m); return (h && typeof h._mvNavOrd === 'number') ? h._mvNavOrd : null; }
function _setMoverNavOrd(m, worldOrd){ const h = _moverNavHost(m); if(h) h._mvNavOrd = worldOrd; }

// ── move a mover's physical position to a hex (manual Move; route advance is F-3's job) ──
function _setMoverPosition(campaign, m, toHex){
  const id = toHex && toHex.id;
  if(m.journey) m.journey.currentHexId = id;
  if(m.kind === 'party'){ m.entity.currentHexId = id; }
  if(m.kind === 'character'){ m.entity.currentHexId = id; }
  if((m.kind === 'army' || m.kind === 'band') && ('currentHexId' in m.entity)) m.entity.currentHexId = id;
  // party members ride the party's hex (a manual Move relocates the whole group)
  if(m.kind === 'party' || m.kind === 'journey'){
    for(const cid of m.memberIds){ const c = _findById(campaign.characters, cid); if(c && ('currentHexId' in c)) c.currentHexId = id; }
    const party = (m.kind === 'party') ? m.entity : (m.journey && m.journey.partyId ? _findById(campaign.parties, m.journey.partyId) : null);
    if(party) party.currentHexId = id;
  }
  m.currentHexId = id;
}

// ═══════════════════════════════════════════════════════════════════════════════
// F-2 — _moveStep: the shared SINGLE-HEX step. Both the manual Move (moveActorOneHex)
// and the Journey autopilot (advanceJourneyOneHex, Slice 2) call it. For one hex it does:
// legality (adjacency + water gate) · per-hex cost (F-4) · the once-per-day nav throw
// (day-open, land only) · fording · the F-1 budget debit · the move · the per-hex encounter
// draw. Day-grained SURVIVAL + FATIGUE are the CALLER's (they fire once at day close) — a
// per-hex ration would be wrong RAW. Pure-ish: mutates position/budget/journey but returns
// a rich result the caller reviews. `ctx.rng` seeds the throws (defaults Math.random).
// ═══════════════════════════════════════════════════════════════════════════════
function _moveStep(campaign, mover, destHexId, ctx){
  ctx = ctx || {};
  const rng = ctx.rng || Math.random;
  const m = (mover && mover.entity && mover.memberIds) ? mover : resolveMover(campaign, mover);
  if(!m) return { ok: false, reason: 'no-mover' };
  const worldOrd = movementWorldOrd(campaign);
  const fromHex = m.currentHexId ? (typeof ACKS.findHex === 'function' ? ACKS.findHex(campaign, m.currentHexId) : null) : null;
  const toHex = destHexId ? (typeof ACKS.findHex === 'function' ? ACKS.findHex(campaign, destHexId) : null) : null;
  if(!toHex) return { ok: false, reason: 'no-dest' };
  // legality — adjacency (a single hex face away). Enforced only when both coords are authored.
  // hexEdgeBetween takes axial {q,r} coords, so pass hex.coord (not the hex object).
  let entrySide = null;
  if(fromHex && fromHex.coord && toHex.coord && typeof ACKS.hexEdgeBetween === 'function'){
    const exit = ACKS.hexEdgeBetween(fromHex.coord, toHex.coord);
    if(exit < 0 && !ctx.allowNonAdjacent) return { ok: false, reason: 'not-adjacent' };
    // the side of toHex we ENTER through = the edge from toHex back toward fromHex
    entrySide = ACKS.hexEdgeBetween(toHex.coord, fromHex.coord);
  }
  // water gate (D6) — Lane E owns the full embark model; Foundation just refuses a foot step onto
  // water without an assigned vessel (a voyage journey carries shipId). GM override via ctx.overrideWaterGate.
  if(toHex.terrain === 'water' && !(m.journey && m.journey.shipId) && !ctx.overrideWaterGate){
    return { ok: false, reason: 'water' };
  }
  const perHexCost = _perHexCostMilesInto(campaign, toHex, entrySide, m);
  // budget — RAW floors progress ≥1 hex if any budget remains and the mover hasn't moved today.
  const budget = moverDayBudget(campaign, m);
  const isFirstStepToday = budget.usedMiles <= 1e-9;
  if(!isFirstStepToday && budget.remainingMiles < perHexCost - 1e-9){
    return { ok: false, reason: 'budget', perHexCost, remainingMiles: budget.remainingMiles };
  }
  // day-open navigation (once per world-day per mover) — getting lost, RR p.275. Land only for
  // Foundation (sea nav is Lane E); skipped on a road/trail (safe route), like tickJourneyDay.
  let navRecord = null;
  if(_moverNavOrd(m) !== worldOrd && !(m.journey && m.journey.shipId)){
    const roaded = (typeof ACKS.roadBonusForStep === 'function') ? ACKS.roadBonusForStep(toHex, entrySide, null) : !!toHex.hasRoad;
    if(!roaded && typeof ACKS.rollNavigation === 'function'){
      const terr = toHex.terrain || (fromHex && fromHex.terrain) || 'grassland';
      const navTarget = (ACKS.JOURNEY_NAV_THROWS && ACKS.JOURNEY_NAV_THROWS[terr] != null) ? ACKS.JOURNEY_NAV_THROWS[terr] : 6;
      const bonus = (m.journey && typeof ACKS._journeyNavBonus === 'function') ? ACKS._journeyNavBonus(campaign, m.journey) : 0;
      navRecord = ACKS.rollNavigation(navTarget, bonus, rng);
    }
    _setMoverNavOrd(m, worldOrd);   // one throw attempt per travel day, regardless of hexes stepped
  }
  // fording (RR p.271) — an unbridged river edge ends the day (swim speed ¼).
  let fordRecord = null, endDay = false;
  if(fromHex && typeof ACKS.riverCrossingForStep === 'function'){
    const crossing = ACKS.riverCrossingForStep(fromHex, toHex, (fromHex.coord && toHex.coord && typeof ACKS.hexEdgeBetween === 'function') ? ACKS.hexEdgeBetween(fromHex.coord, toHex.coord) : null);
    if(crossing && crossing.barrier && crossing.swimmingThrowNeeded){
      const ford = (typeof ACKS.journeyFordingThrow === 'function') ? ACKS.journeyFordingThrow(campaign, m.journey || {}, { rng }) : { success: true };
      if(!ford || !ford.success) return { ok: false, reason: 'fording', ford: ford || null, perHexCost };
      fordRecord = ford; endDay = true;
    }
  }
  // DEBIT the budget — perHexCost onto every member's ledger (they move together, D1).
  for(const id of m.memberIds){
    const c = _findById(campaign.characters, id);
    if(!c) continue;
    const dm = _charDailyMovement(c, worldOrd);
    c.dailyMovement = { worldOrd, milesUsed: dm.milesUsed + perHexCost };
  }
  // MOVE
  _setMoverPosition(campaign, m, toHex);
  // per-hex encounter (JJ p.41 — one throw per hex entered) unless the regime skips them.
  let encounter = null;
  const regime = moverRegime(campaign, m);
  if(!(regime && regime.skipEncounters) && typeof ACKS.rollEncounter === 'function'){
    const encJourney = m.journey || { id: null, participantCharacterIds: m.memberIds.slice(), partyId: (m.kind === 'party' ? m.entity.id : null) };
    try {
      const enc = ACKS.rollEncounter(campaign, encJourney, { rng, hexId: toHex.id || null, coord: toHex.coord || null, hasRoad: !!toHex.hasRoad });
      if(enc) encounter = enc;
    } catch(e){ /* an encounter draw never blocks a move */ }
  }
  return { ok: true, moved: true, fromHexId: fromHex ? fromHex.id : null, toHexId: toHex.id, perHexCost,
           nav: navRecord, ford: fordRecord, endDay, encounter, worldOrd, budgetAfter: moverDayBudget(campaign, m) };
}

// ═══════════════════════════════════════════════════════════════════════════════
// F-2 — moveActorOneHex: the MANUAL Move verb. Resolves the mover, steps ONE hex via
// _moveStep, and emits a record-only `movement` event. Returns { ok, result, event? }.
// A Move is an EVENT, not an entity (Architecture §3.1). The GM/player Moves repeatedly
// until the budget is spent; each step's encounter (if any) rides the result for the GM
// to resolve, exactly like a Journey step (it IS the same inner step).
// ═══════════════════════════════════════════════════════════════════════════════
function moveActorOneHex(campaign, actor, destHexId, opts){
  opts = opts || {};
  const m = resolveMover(campaign, actor);
  if(!m) return { ok: false, reason: 'no-mover' };
  const res = _moveStep(campaign, m, destHexId, opts);
  if(!res.ok) return { ok: false, reason: res.reason, detail: res };
  // materialize any per-hex encounter into a real enc- entity for the GM to resolve (the same enc-
  // the journey path produces — it IS the same inner draw). A terrain-category draw has no entity.
  let encounterId = null;
  if(res.encounter && res.encounter.encounterRecord){
    const e = _materializeMoveEncounter(campaign, m, res.encounter, opts.trigger || 'movement');
    encounterId = e ? e.id : (res.encounter.encounterRecord.id || null);
  }
  // emit the record-only movement event (opt-out; audit only)
  let emitted = null;
  try {
    if(typeof ACKS.newEvent === 'function'){
      campaign.eventLog = campaign.eventLog || [];
      const cal = campaign.calendar || {};
      const ev = ACKS.newEvent('movement', {
        submittedBy: opts.submittedBy || 'engine', status: (ACKS.EVENT_STATUS && ACKS.EVENT_STATUS.APPLIED) || 'applied', cadence: 'daily',
        targetTurn: campaign.currentTurn || 1,
        gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: campaign.currentDayInMonth || 1 },
        context: { primaryHexId: res.toHexId || null, involvedHexIds: [res.fromHexId, res.toHexId].filter(Boolean), settlementId: null, domainId: null,
                   relatedEntities: m.memberIds.map(id => ({ kind: 'character', id, role: 'traveller' })).concat([{ kind: m.kind, id: m.entity.id, role: 'subject' }]) },
        payload: { moverId: m.entity.id, moverKind: m.kind, fromHexId: res.fromHexId || null, toHexId: res.toHexId,
                   perHexCost: res.perHexCost, narrative: (m.entity.name || 'The party') + ' moved one hex.' }
      });
      ev.appliedAtTurn = campaign.currentTurn || 1;
      campaign.eventLog.push({ event: ev, result: { narrativeSummary: ev.payload.narrative }, appliedAtTurn: campaign.currentTurn || 1, appliedAt: new Date().toISOString() });
      emitted = ev;
    }
  } catch(e){ /* event emission never blocks a move */ }
  return { ok: true, result: res, event: emitted, encounterId: encounterId };
}

// ═══════════════════════════════════════════════════════════════════════════════
// F-3 — the per-hex JOURNEY advance (the interactive autopilot). advanceJourneyOneHex
// steps ONE hex along the route via _moveStep; advanceJourneyDay (⏩) spends the day's
// budget; advanceJourneyToDestination (⏭) runs to arrival. All three HALT on an encounter,
// journey.paused (F-8b), budget exhaustion, or arrival. The day-grained invariants are
// preserved: the nav throw fires once per travel day (inside _moveStep), and fatigue is
// applied once per closed day (_closeTravelDay). This is the NEW interactive path — it does
// NOT touch the shipped slot-30 whole-day resolver (which stays byte-identical). A COMPLEX
// mover (army / unit / voyage / lost) or a sparse (unauthored) next hex delegates to the
// proven whole-day path via _advanceViaWholeDay, so every existing march/voyage still works.
// ═══════════════════════════════════════════════════════════════════════════════

// materialize an encounter drawn by _moveStep into a real enc- entity (shared by both verbs)
function _materializeMoveEncounter(campaign, m, enc, trigger){
  if(!enc || !enc.encounterRecord || !enc.encounterRecord.draw) return null;
  if(typeof ACKS.createEncounterFromDraw !== 'function') return null;
  const er = enc.encounterRecord;
  try {
    return ACKS.createEncounterFromDraw(campaign, er.draw, {
      id: er.id, trigger: trigger || 'movement',
      partySide: { partyId: (m.kind === 'party' ? m.entity.id : (m.journey && m.journey.partyId)) || null,
                   journeyId: m.journey ? m.journey.id : null,
                   characterIds: m.memberIds.slice(), faceCharacterId: null, sizeCount: m.memberIds.length || 1 },
      distance: er.distance || null,
      onDayInMonth: campaign.currentDayInMonth || undefined
    });
  } catch(e){ return null; }
}

// A journey the per-hex path handles directly (else the whole-day resolver owns it).
function _journeyPerHexSteppable(journey){
  return !!(journey && !journey.armyId && !journey.unitId && !journey.shipId && !journey.isLost);
}

// Delegate a whole day to the shipped resolver (army/unit/voyage/lost/sparse). Keeps every
// existing march + voyage working through the proven, oracle-locked path.
function _advanceViaWholeDay(campaign, journey, ctx){
  if(typeof ACKS.advanceJourneyOneDay === 'function'){
    const rec = ACKS.advanceJourneyOneDay(campaign, journey, ctx || {});
    return { ok: !!rec, delegated: true, dayClosed: true, stepped: !!rec,
             arrived: journey.status === 'arrived', record: rec || null,
             halted: !!(rec && rec.newIsLost) };
  }
  return { ok: false, reason: 'no-whole-day-resolver' };
}

// The current open (in-progress) travel-day record on the journey, if it belongs to this world day.
function _currentTravelDayRecord(journey, worldOrd){
  const days = journey.days || [];
  const last = days.length ? days[days.length - 1] : null;
  return (last && last._mvOpen && last._mvWorldOrd === worldOrd) ? last : null;
}
// Open a fresh travel-day record (closing any stale still-open one first, so an abandoned mid-day
// still applies its fatigue). Advances currentDayIndex. The record shape mirrors the essential
// fields of the whole-day dayRecord the app + integrators read (Lane B enriches it).
function _openTravelDay(campaign, journey, worldOrd, startHexId){
  const days = journey.days || (journey.days = []);
  const stale = days.length ? days[days.length - 1] : null;
  if(stale && stale._mvOpen) _closeTravelDay(campaign, journey, stale);
  const rec = {
    dayIndex: (journey.currentDayIndex || 0) + 1,
    hexId: startHexId || journey.currentHexId || journey.startHexId || null,
    pace: (typeof ACKS.journeyEffectivePace === 'function') ? ACKS.journeyEffectivePace(campaign, journey) : (journey.pace || 'normal'),
    milesTraveled: 0, hexesTraveled: 0, hexPath: [], arrivedAt: journey.currentHexId || null,
    navigationThrow: null, fording: null, encounters: [], notableEvents: [], fatigueAccumulated: 0,
    status: 'pending', perHex: true, _mvOpen: true, _mvWorldOrd: worldOrd
  };
  days.push(rec);
  journey.currentDayIndex = rec.dayIndex;
  return rec;
}
// Finalize an open travel day: apply the day-grained fatigue streak (RR p.279) once, run the
// F-8a survival day-close hook (Slice 3 / Lane D fills it), and mark the record committed.
function _closeTravelDay(campaign, journey, rec){
  if(!rec || !rec._mvOpen) return;
  const pace = rec.pace || 'normal';
  const simplifiedFatigue = (typeof ACKS.isHouseRuleEnabled === 'function') && ACKS.isHouseRuleEnabled(campaign, 'simplified-fatigue');
  const strenuous = (pace === 'normal' || pace === 'forced-march');
  if(!simplifiedFatigue && strenuous && rec.hexesTraveled > 0){
    const CYCLE = (ACKS.JOURNEY_FATIGUE_CYCLE_DAYS != null) ? ACKS.JOURNEY_FATIGUE_CYCLE_DAYS : 6;
    const before = journey.fatigueDays || 0;
    journey.fatigueDays = (pace === 'forced-march') ? Math.max(before, CYCLE) : before + 1;
    rec.fatigueAccumulated = journey.fatigueDays - before;
  }
  rec._mvOpen = false;
  rec.status = 'committed';
  // F-8a — the per-day provisioning/survival day-close seam (Slice 3 registers a default; Lane D
  // swaps it from acks-engine-provisioning.js). Fires once per closed travel day. Never blocks.
  if(typeof ACKS._movementDayCloseHook === 'function'){ try { ACKS._movementDayCloseHook(campaign, journey, rec); } catch(e){ /* survival never blocks a close */ } }
}

function advanceJourneyOneHex(campaign, journey, ctx){
  ctx = ctx || {};
  const j = (typeof journey === 'string') ? _findById(campaign.journeys, journey) : journey;
  if(!j) return { ok: false, reason: 'no-journey' };
  if(j.status !== 'in-transit') return { ok: false, reason: 'not-in-transit' };
  if(j.paused && !ctx.ignorePaused) return { ok: false, reason: 'paused' };
  if(!_journeyPerHexSteppable(j)) return _advanceViaWholeDay(campaign, j, ctx);
  const worldOrd = movementWorldOrd(campaign);
  let dist = (typeof ACKS.computeJourneyDistance === 'function') ? ACKS.computeJourneyDistance(campaign, j) : { total: 0, covered: 0, remaining: 0 };
  if(dist.remaining <= 0){   // already at the destination
    const openRec = _currentTravelDayRecord(j, worldOrd); if(openRec) _closeTravelDay(campaign, j, openRec);
    j.status = 'arrived'; j.currentHexId = j.destinationHexId || j.currentHexId;
    return { ok: true, stepped: false, arrived: true, dayClosed: true };
  }
  let route = [];
  try { route = ACKS.journeyRoute(campaign, j) || []; } catch(e){ route = []; }
  const nextPos = dist.covered + 1;
  const nextStep = (nextPos < route.length) ? route[nextPos] : null;
  const nextHexId = nextStep ? nextStep.hexId : null;
  if(!nextHexId) return _advanceViaWholeDay(campaign, j, ctx);   // sparse/unauthored route → whole-day path
  const res = _moveStep(campaign, j, nextHexId, ctx);
  if(!res.ok){
    const openRec = _currentTravelDayRecord(j, worldOrd);
    if(res.reason === 'budget'){ if(openRec) _closeTravelDay(campaign, j, openRec); return { ok: true, stepped: false, dayClosed: true, reason: 'budget' }; }
    if(res.reason === 'fording'){ if(openRec){ openRec.fording = res.ford || { result: 'failed' }; _closeTravelDay(campaign, j, openRec); } return { ok: false, stepped: false, reason: 'fording', halted: true, dayClosed: true, ford: res.ford || null }; }
    return { ok: false, stepped: false, reason: res.reason, detail: res };
  }
  // record the step into the in-progress day
  let rec = _currentTravelDayRecord(j, worldOrd) || _openTravelDay(campaign, j, worldOrd, res.fromHexId);
  const toHex = _findById(campaign.hexes, res.toHexId);
  rec.hexesTraveled += 1;
  rec.milesTraveled += res.perHexCost;
  rec.hexPath.push({ hexId: res.toHexId, q: (toHex && toHex.coord) ? toHex.coord.q : null, r: (toHex && toHex.coord) ? toHex.coord.r : null });
  rec.arrivedAt = res.toHexId;
  if(res.nav && !rec.navigationThrow) rec.navigationThrow = { rolled: res.nav.rolled, target: res.nav.target, bonus: res.nav.bonus || 0, success: !!res.nav.success };
  j.lastTravelWorldOrd = worldOrd;   // one leg per world day — the slot-30 auto-advance skips this journey today
  // encounter → materialize + halt + close the day (RAW: the party stops when it meets something).
  let encId = null;
  if(res.encounter && res.encounter.encounterRecord){
    const m = resolveMover(campaign, j);
    const e = _materializeMoveEncounter(campaign, m, res.encounter, 'journey-travel');
    encId = e ? e.id : (res.encounter.encounterRecord.id || null);
    rec.encounters.push({ kind: 'wandering-roll', encounterId: encId });
    if(res.encounter.notableEvent) rec.notableEvents.push({ kind: res.encounter.notableEvent.kind, type: res.encounter.notableEvent.type || null, text: res.encounter.notableEvent.label });
  }
  // arrival?
  dist = ACKS.computeJourneyDistance(campaign, j);
  const arrived = (dist.remaining <= 0) || (j.currentHexId && j.currentHexId === j.destinationHexId);
  if(arrived){ j.status = 'arrived'; _closeTravelDay(campaign, j, rec); return { ok: true, stepped: true, toHexId: res.toHexId, arrived: true, dayClosed: true, encounterId: encId }; }
  if(encId){ _closeTravelDay(campaign, j, rec); return { ok: true, stepped: true, toHexId: res.toHexId, halted: true, dayClosed: true, encounterId: encId }; }
  if(res.endDay){ _closeTravelDay(campaign, j, rec); return { ok: true, stepped: true, toHexId: res.toHexId, dayClosed: true, reason: 'fording-crossed' }; }
  return { ok: true, stepped: true, toHexId: res.toHexId, dayClosed: false };
}

// ⏩ — advance the journey by the REST of today's hex budget (one travel day). Loops the single-hex
// step until the day closes (budget spent / arrival / encounter / ford) or the journey is paused.
function advanceJourneyDay(campaign, journey, ctx){
  ctx = ctx || {};
  const j = (typeof journey === 'string') ? _findById(campaign.journeys, journey) : journey;
  if(!j) return { ok: false, reason: 'no-journey' };
  const steps = []; let guard = 0;
  while(guard++ < 400){
    const r = advanceJourneyOneHex(campaign, j, ctx);
    steps.push(r);
    if(r.delegated) return { ok: r.ok, days: 1, delegated: true, arrived: r.arrived, halted: r.halted, steps };
    if(r.reason === 'paused') return { ok: false, reason: 'paused', steps, halted: true };
    if(r.halted) return { ok: true, halted: true, reason: r.reason || 'encounter', arrived: !!r.arrived, encounterId: r.encounterId || null, steps, dayClosed: true };
    if(r.arrived) return { ok: true, arrived: true, dayClosed: true, steps };
    if(r.dayClosed) return { ok: true, dayClosed: true, steps };
    if(!r.ok) return { ok: false, reason: r.reason, steps };
  }
  return { ok: false, reason: 'guard', steps };
}

// ⏭ — advance the journey to its DESTINATION. Loops whole days (advanceJourneyDay) until arrival,
// an encounter/ford halt, or a pause. Each day resets the mover's budget (the Day Clock is NOT moved —
// this is a per-journey fast-forward, mirroring advanceJourneyOneDay's "this journey only" semantics).
function advanceJourneyToDestination(campaign, journey, ctx){
  ctx = ctx || {};
  const j = (typeof journey === 'string') ? _findById(campaign.journeys, journey) : journey;
  if(!j) return { ok: false, reason: 'no-journey' };
  const days = []; let guard = 0;
  while(guard++ < 400 && j.status === 'in-transit'){
    if(j.paused && !ctx.ignorePaused) return { ok: false, reason: 'paused', days: days.length, halted: true };
    const r = advanceJourneyDay(campaign, j, ctx);
    days.push(r);
    if(r.arrived) return { ok: true, arrived: true, days: days.length };
    if(r.halted) return { ok: true, halted: true, reason: r.reason, encounterId: r.encounterId || null, days: days.length };
    if(!r.ok) return { ok: false, reason: r.reason, days: days.length };
    // a whole day closed with no progress (e.g. halted-pace) would loop forever — bail defensively.
    if(!r.delegated && r.dayClosed){
      const anyMoved = (r.steps || []).some(s => s.stepped);
      if(!anyMoved) return { ok: true, stalled: true, days: days.length };
    }
    // ADVANCE the mover's budget to a fresh day (per-journey fast-forward): roll each member's
    // dailyMovement ledger + the journey's nav marker forward so the next day starts full. The
    // journey's own world-day clock (lastTravelWorldOrd) already advanced; here we free the budget.
    _rollMoverToNextDay(campaign, j);
  }
  return { ok: j.status === 'arrived', arrived: j.status === 'arrived', days: days.length };
}

// Free the mover's per-day budget for a fresh travel day WITHIN a ⏭ fast-forward (which does NOT move
// the global Day Clock). Clearing each member's dailyMovement ledger resets the budget for the current
// world-ordinal (a null ledger reads as a fresh day); the journey's once-per-day nav marker is re-armed
// so the next day throws again. (The real Day Clock, when it ticks, keys off lastTravelWorldOrd and
// skips a journey already fast-forwarded past it — so no double-move.)
function _rollMoverToNextDay(campaign, journey){
  const m = resolveMover(campaign, journey);
  if(!m) return;
  for(const id of m.memberIds){ const c = _findById(campaign.characters, id); if(c) c.dailyMovement = null; }
  const host = _moverNavHost(m); if(host) host._mvNavOrd = null;
}

// ── the self-registered `movement` event kind (record-only, wizard opt-out) ──
if(typeof ACKS.registerEventKind === 'function'){
  ACKS.registerEventKind('movement', {
    schema: { R: { moverId: 'string', toHexId: 'string' },
              O: { moverKind: 'string', fromHexId: 'string', perHexCost: 'number', narrative: 'string' } },
    wizardOptOut: true
  });
}

Object.assign(ACKS, {
  // F-1 budget
  movementWorldOrd, resolveMover, moverDayBudget, movementBudgetRemaining,
  // F-4 cost
  moverPerHexCost,
  // F-2 step + Move verb
  _moveStep, moveActorOneHex,
  // F-3 per-hex journey advance (+ the ⏩ day / ⏭ destination loops)
  advanceJourneyOneHex, advanceJourneyDay, advanceJourneyToDestination,
  // F-7 regime read (the shape/write lands in Slice 3)
  moverRegime
});

if(typeof module !== 'undefined' && module.exports){ module.exports = ACKS; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
