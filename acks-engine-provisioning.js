/* acks-engine-provisioning.js — Movement 2.0 · Lane D — Provisioning & load unification
 *
 * Fills the two Foundation seams (acks-engine-movement.js) from a self-contained module, WITHOUT
 * editing acks-engine-subsystems.js (the shipped survival resolver is Foundation-only):
 *
 *   1. ACKS._provisioningDemand(campaign, group, regime) — the individual-vs-unit RATION LINE (D4/OQ1).
 *      resolveDaySurvival consumes it ONLY when a caller passes args.group; every shipped caller passes
 *      args.members (the explicit traveller list), so this override leaves the shipped survival path
 *      BYTE-IDENTICAL. It is the authoritative eater set the UI readout + future group-scoped callers use.
 *      RAW (RR p.276 every humanoid eats; RR Ch.7 the employer feeds its hires *in addition to* wages;
 *      RR Ch.10 mercenary UNITS ride the gold weekly supply cost): COUNTED = PCs + henchmen + named
 *      companions + hired individuals (specialist / hireling / lone mercenary escort); EXCLUDED =
 *      count-level mercenary Units (Groups, never characters) + animals (mnt-, tracked by mounts.js).
 *
 *   2. group food/water-per-day readout (moverConsumptionPerDay) + the share-load model (groupShareLoadReport
 *      / balanceGroupLoad, D5) + the extended carrying capacity (groupHaulCapacity — Foundation's member sum
 *      + co-present hires + pack/draft animals; the vehicle hook is TS2 Lane G) + the per-mover REGIME
 *      helpers (D8 — party-canonical, journey-mirrored two-way sync via Foundation's setMoverRegime, with
 *      shareRations ALSO mirrored to the legacy party.shareProvisions / journey.shareRations the shipped
 *      survival consumer reads, so the unified toggle actually drives sourcing).
 *
 * NO new house rule / prefix / event / entity / collection / day-tick slot. NO migration — regime /
 * shareLoad / porter fields are lazy + defensively read (migrate(template) === template holds). Extends
 * global.ACKS via Object.assign; every core/sibling read (resolveMover, moverRegime, setMoverRegime,
 * groupCarryingCapacity, carryEncumbranceInfo, itemEncumbranceSt, mount*, the hire-relation accessors) is
 * LATE-BOUND at call time, so load order is irrelevant. Loads after acks-engine-movement.js (alphabetical),
 * so the ACKS._provisioningDemand override below supersedes the Foundation default.
 *
 * RAW reconciles surfaced by the Lane D build — all three RESOLVED 2026-07-01 (Joachim; see the SUMMARY):
 *   • hireling→employer link — an UNSHARED hire now draws its food/water from its EMPLOYER's stores once its
 *     own run out (RR Ch.7), via resolveDaySurvival's employerOf map (built from the shipped hire relations),
 *     gated on args.employerSourcing — which the off-journey survival consumer (proposeSurvivalDay) sets; the
 *     shipped journey/legacy members-only callers pass no flag and stay BYTE-IDENTICAL.
 *   • animal feed — the grazer trait was SPLIT (RR p.276): 'march-grazer' (donkey, steppe horse) grazes its
 *     ration with its ancillary activities so it feeds free even at a full march; a plain 'grazer' (ox &c.)
 *     grazes free only off the full march (a dedicated grazing day / ≤ half-speed). resolveMountFeedingDay
 *     takes opts.halfOrSlower; the readout here shows an ox's feed demand at the normal-pace headline.
 *   • per-mover skipProvisioning / skipEncumbrance — now BITE: skipProvisioning skips the off-journey survival
 *     tick (proposeSurvivalDay / _groupSkipsRations); skipEncumbrance walks the unencumbered band in the Move
 *     budget (moverDayBudget → journeyBaseSpeedMilesPerDay opts.ignoreEncumbrance). Each renders as a 2-state
 *     Track/Skip pill and is HIDDEN while its global ignore-rations / ignore-encumbrance rule is on (the override
 *     isn't available then). skipEncounters was already live via _moveStep. (Journey-tick convergence deferred.)
 */
(function(global){
'use strict';
global.ACKS = global.ACKS || {};
const ACKS = global.ACKS;

// Late-bound core accessor — this module loads after acks-engine*.js; reference ACKS at call time.
function _A(){ return global.ACKS || ACKS; }
function _find(list, id){ return (Array.isArray(list) ? list.find(x => x && x.id === id) : null) || null; }
function _round(n, p){ const f = Math.pow(10, p == null ? 2 : p); return Math.round((Number(n) || 0) * f) / f; }
function RATION_FOOD_ST(){ const A = _A(); return (A.RATION_FOOD_ST_PER_DAY != null) ? A.RATION_FOOD_ST_PER_DAY : (1 / 6); }
function RATION_WATER_ST(){ const A = _A(); return (A.RATION_WATER_ST_PER_DAY != null) ? A.RATION_WATER_ST_PER_DAY : (5 / 6); }

// Resolve any actor (character | party | journey | army | unit | band | resolved-mover) to the
// Foundation mover shape { kind, entity, journey, memberIds, currentHexId }.
function _mover(campaign, group){
  if(group && group.entity && group.memberIds) return group;   // already resolved
  const A = _A();
  return (typeof A.resolveMover === 'function') ? A.resolveMover(campaign, group) : null;
}
function _regimeOf(campaign, m){
  const A = _A();
  return (typeof A.moverRegime === 'function') ? A.moverRegime(campaign, m) : {};
}

// A living humanoid individual eats (RR p.276). A character who is gone from the column (dead / departed /
// imprisoned) does not draw the party's rations.
function _eats(c){
  if(!c) return false;
  if(c.alive === false) return false;
  const ls = c.lifecycleState;
  if(ls === 'deceased' || ls === 'departed' || ls === 'imprisoned') return false;
  return true;
}

// Classify an eating character for the readout breakdown (display only).
//   pc | henchman | companion | hire   (a LONE mercenary escort is a character → 'hire' + eats;
//   a mercenary UNIT is a count-level Group, never a character → never in this set).
function _eaterClass(c){
  if(!c) return 'companion';
  if(c.controlledBy === 'player' || c.kind === 'PC' || c.kind === 'pc') return 'pc';
  switch(c.socialTier){
    case 'henchman':   return 'henchman';
    case 'specialist':
    case 'hireling':
    case 'mercenary':
    case 'slave':      return 'hire';
    case 'follower':   return 'companion';
    default:           return 'companion';   // an independent NPC travelling with the group
  }
}

// Hired individuals CO-PRESENT with a mover but not counted among its formal members — a henchman
// travelling with his patron, a specialist/hireling with his employer. Walks the shipped hire RELATIONS
// (the employer/patron link, RAW reconcile #1) and only counts a hire that (a) has an employer among the
// members and (b) is actually with the group (same party / same journey / same hex). Keeps the ration
// tally authoritative without double-counting a hire who is already a member. Employer-scoped SOURCING
// (who feeds whom when unshared) is a separate resolver concern — see the file header.
function _coPresentHireIds(campaign, m, memberIds){
  const A = _A();
  const out = [];
  if(!m || !memberIds || !memberIds.length) return out;
  const memberSet = Object.create(null); memberIds.forEach(id => { memberSet[id] = 1; });
  const partyId = (m.kind === 'party') ? (m.entity && m.entity.id)
                : (m.journey && m.journey.partyId) ? m.journey.partyId : null;
  const hexId = m.currentHexId || null;
  const participants = (m.journey && Array.isArray(m.journey.participantCharacterIds)) ? m.journey.participantCharacterIds : null;
  const consider = (hireId, employerId) => {
    if(!hireId || memberSet[hireId] || out.indexOf(hireId) >= 0) return;
    if(!memberSet[employerId]) return;                          // the employer must be with the group
    const h = _find(campaign.characters, hireId);
    if(!h || !_eats(h)) return;
    const coPresent = (partyId && h.partyId === partyId)
                   || (participants && participants.indexOf(hireId) >= 0)
                   || (hexId && h.currentHexId === hexId);
    if(coPresent) out.push(hireId);
  };
  for(const eid of memberIds){
    (typeof A.henchmanshipsByPatron === 'function' ? A.henchmanshipsByPatron(campaign, eid) : []).forEach(x => consider(x && x.subjectCharacterId, eid));
    (typeof A.specialistContractsByEmployer === 'function' ? A.specialistContractsByEmployer(campaign, eid) : []).forEach(x => consider(x && x.specialistCharacterId, eid));
    (typeof A.hirelingContractsByEmployer === 'function' ? A.hirelingContractsByEmployer(campaign, eid) : []).forEach(x => consider(x && x.hirelingCharacterId, eid));
  }
  return out;
}

// The pack/riding animals travelling with a mover: a journey's assigned mounts (packAnimalIds), else the
// mounts ridden/owned by the group's members (a stationary party). Excludes dead animals.
function _groupAnimals(campaign, m){
  const A = _A();
  if(!m) return [];
  if(m.journey && typeof A.mountsForJourney === 'function'){
    const list = A.mountsForJourney(campaign, m.journey) || [];
    if(list.length) return list.filter(mt => mt && mt.condition !== 'dead');
  }
  const memberSet = Object.create(null); (m.memberIds || []).forEach(id => { memberSet[id] = 1; });
  return (campaign.mounts || []).filter(mt => mt && mt.condition !== 'dead'
    && (memberSet[mt.riderCharacterId] || memberSet[mt.ownerCharacterId]));
}

// ─────────────────────────────────────────────────────────────────────────────
// D4/OQ1 — the individual-vs-unit ration line. THE Foundation survival-resolver seam override.
// Returns { eaters:[charId…], perEaterFood, perEaterWater, shareRations, unitScale }.
// ─────────────────────────────────────────────────────────────────────────────
function moverProvisioningDemand(campaign, group, regime){
  const m = _mover(campaign, group);
  const share = !!(regime && regime.shareRations);
  if(!m) return { eaters: [], perEaterFood: 1, perEaterWater: 1, shareRations: share, unitScale: false };
  // An ARMY / marching UNIT / monster BAND rides the gold weekly supply cost or forages (RR p.450 /
  // Ch.10) — NOT this per-person tally. Individual-vs-unit: no personal ration line at the unit scale.
  if(m.kind === 'army' || m.kind === 'unit' || m.kind === 'band'){
    return { eaters: [], perEaterFood: 1, perEaterWater: 1, shareRations: false, unitScale: true };
  }
  const memberIds = (m.memberIds || []).slice();
  const extra = _coPresentHireIds(campaign, m, memberIds);
  const eaters = [];
  for(const id of memberIds.concat(extra)){
    if(eaters.indexOf(id) >= 0) continue;
    const c = _find(campaign.characters, id);
    if(c && _eats(c)) eaters.push(id);
  }
  return { eaters, perEaterFood: 1, perEaterWater: 1, shareRations: share, unitScale: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// Group food/water-per-day readout (the brief's "display how much food/water the group is consuming per
// day"). DERIVED, no storage. People: N rations + N water/day (+ the stone equivalents + a class
// breakdown). Animals: Σ feed + Σ water in stone, honouring grazers (food-free) + camels (water-free),
// exactly as the shipped resolveMountFeedingDay does. The excluded supply-cost units are named so the
// exclusion is visible, not silent.
// ─────────────────────────────────────────────────────────────────────────────
function moverConsumptionPerDay(campaign, group){
  const A = _A();
  const m = _mover(campaign, group);
  const out = {
    people: { count: 0, rationsPerDay: 0, waterPerDay: 0, foodSt: 0, waterSt: 0,
              breakdown: { pcs: 0, henchmen: 0, companions: 0, hires: 0 } },
    animals: { count: 0, foodSt: 0, waterSt: 0, list: [] },
    unitScale: false, totalFoodSt: 0, totalWaterSt: 0
  };
  if(!m) return out;
  const demand = moverProvisioningDemand(campaign, m, _regimeOf(campaign, m));
  out.unitScale = !!demand.unitScale;
  for(const id of (demand.eaters || [])){
    const c = _find(campaign.characters, id); if(!c) continue;
    out.people.count++;
    const cls = _eaterClass(c);
    if(cls === 'pc') out.people.breakdown.pcs++;
    else if(cls === 'henchman') out.people.breakdown.henchmen++;
    else if(cls === 'hire') out.people.breakdown.hires++;
    else out.people.breakdown.companions++;
  }
  out.people.rationsPerDay = out.people.count;
  out.people.waterPerDay = out.people.count;
  out.people.foodSt = _round(out.people.count * RATION_FOOD_ST());
  out.people.waterSt = _round(out.people.count * RATION_WATER_ST());
  for(const mt of _groupAnimals(campaign, m)){
    // Food-free in the readout = a MARCH-grazer only (donkey/steppe graze free even while marching, RR p.276).
    // A plain grazer (ox) draws its feed at a normal day's march, so it shows its demand here (the headline
    // normal-pace number); it grazes free only on a non-marching / ≤half-speed day, resolved at the day-tick.
    const grazer = (typeof A.mountIsMarchGrazer === 'function') ? A.mountIsMarchGrazer(mt) : false;
    const dromedary = (typeof A.mountIsDesertDromedary === 'function') ? A.mountIsDesertDromedary(mt) : false;
    const foodSt = grazer ? 0 : ((typeof A.mountDailyFoodSt === 'function') ? (Number(A.mountDailyFoodSt(mt)) || 0) : 0);
    const waterSt = dromedary ? 0 : ((typeof A.mountDailyWaterSt === 'function') ? (Number(A.mountDailyWaterSt(mt)) || 0) : 0);
    const cls = (typeof A.mountClass === 'function') ? A.mountClass(mt) : null;
    out.animals.count++;
    out.animals.foodSt += foodSt;
    out.animals.waterSt += waterSt;
    out.animals.list.push({ id: mt.id, name: mt.name || (cls && cls.label) || mt.catalogKey || 'animal',
      foodSt: _round(foodSt), waterSt: _round(waterSt), grazer: !!grazer, dromedary: !!dromedary });
  }
  out.animals.foodSt = _round(out.animals.foodSt);
  out.animals.waterSt = _round(out.animals.waterSt);
  out.totalFoodSt = _round(out.people.foodSt + out.animals.foodSt);
  out.totalWaterSt = _round(out.people.waterSt + out.animals.waterSt);
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Carrying capacity — extends Foundation's groupCarryingCapacity (member characters) with co-present
// hires + pack/draft animals; the vehicle term is the TS2 Lane G hook (partyCarriageCapacity). Returns
// { memberSt, memberCount, hireSt, hireCount, animalSt, animalCount, vehicleSt, totalSt }.
// ─────────────────────────────────────────────────────────────────────────────
function groupHaulCapacity(campaign, group){
  const A = _A();
  const m = _mover(campaign, group);
  const base = (typeof A.groupCarryingCapacity === 'function')
    ? A.groupCarryingCapacity(campaign, m || group)
    : { totalSt: 0, memberSt: 0, memberCount: 0 };
  let hireSt = 0, hireCount = 0;
  if(m){
    for(const id of _coPresentHireIds(campaign, m, (m.memberIds || []))){
      const c = _find(campaign.characters, id); if(!c) continue;
      hireSt += (typeof A.characterCarryCapacitySt === 'function') ? A.characterCarryCapacitySt(c) : 20;
      hireCount++;
    }
  }
  let animalSt = 0, animalCount = 0;
  for(const mt of (m ? _groupAnimals(campaign, m) : [])){
    animalSt += (typeof A.mountNormalLoadSt === 'function') ? (Number(A.mountNormalLoadSt(mt)) || 0) : 0;
    animalCount++;
  }
  const vehicleSt = 0;   // TS2 Lane G — partyCarriageCapacity(...) extends this
  return {
    memberSt: _round(base.memberSt || 0, 1), memberCount: base.memberCount || 0,
    hireSt: _round(hireSt, 1), hireCount,
    animalSt: _round(animalSt, 1), animalCount,
    vehicleSt,
    totalSt: _round((base.totalSt || 0) + hireSt + animalSt + vehicleSt, 1)
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Share-load (D5). Default OFF = RAW slowest-member (the group travels at its most-encumbered walker's
// band — exactly what the shipped journeyBaseSpeedMilesPerDay already computes). ON = FAITHFUL
// redistribution: hand the discrete, transferable inventory around to minimise the slowest walker's
// encumbrance band, then compute speed (RR pp.83-84 — players may redistribute gear). Item-granular, not
// a pooled average. Coins / equipped / attuned / ration lines / water containers stay with their owner;
// plain gear + bulk are transferable. groupShareLoadReport is PURE (the display + the plan);
// balanceGroupLoad APPLIES it (the "Balance load" action) — after which the shipped speed reflects it.
// ─────────────────────────────────────────────────────────────────────────────
function _itemTransferable(item){
  const A = _A();
  if(!item) return false;
  if(item.equipped === true) return false;
  if(item.attunementId || item.attuned === true) return false;
  if(typeof A.itemHasFacet === 'function' && A.itemHasFacet(item, 'coin')) return false;
  if(typeof A.isRationLine === 'function' && A.isRationLine(item)) return false;   // food = the ration line's job
  if(typeof A.waterContainerDaysFor === 'function' && A.waterContainerDaysFor(item) > 0) return false;   // a water skin/barrel stays with its owner (waterDaysCarried is a character counter)
  if(typeof A.itemEncumbranceSt === 'function' && !(A.itemEncumbranceSt(item) > 0)) return false;   // weightless — moving it is pointless
  return true;
}
function _itemStone(item){ const A = _A(); return (typeof A.itemEncumbranceSt === 'function') ? (Number(A.itemEncumbranceSt(item)) || 0) : 0; }
function _bandForSt(totalSt){ const A = _A(); return (typeof A.carryEncumbranceBandFor === 'function') ? A.carryEncumbranceBandFor(totalSt) : { level: 'unencumbered', milesPerDay: 24 }; }
function _walkersOf(campaign, m){
  const A = _A();
  const riddenBy = Object.create(null);
  if(m && m.journey && typeof A.mountsForJourney === 'function'){
    (A.mountsForJourney(campaign, m.journey) || []).forEach(mt => {
      if(mt && mt.role === 'mount' && mt.riderCharacterId && (typeof A.mountClass === 'function' ? A.mountClass(mt) : true)) riddenBy[mt.riderCharacterId] = 1;
    });
  }
  const out = [];
  for(const id of (m && m.memberIds || [])){
    if(riddenBy[id]) continue;                       // a mounted rider travels at the mount's speed, not a foot band
    const c = _find(campaign.characters, id);
    if(c && _eats(c)) out.push(c);
  }
  return out;
}
// The fixed (non-transferable) carried stone of a walker: coins + everything _itemTransferable rejects.
function _fixedStone(c){
  const A = _A();
  let st = (typeof A.characterCoinWeightSt === 'function') ? (Number(A.characterCoinWeightSt(c)) || 0) : 0;
  for(const it of (c.inventory || [])){ if(!_itemTransferable(it)) st += _itemStone(it); }
  return st;
}
function groupShareLoadReport(campaign, group){
  const A = _A();
  const m = _mover(campaign, group);
  const out = { members: [], slowestMilesPerDay: null, slowestBand: null,
                balanced: { slowestMilesPerDay: null, slowestBand: null, maxAfterSt: null, transferableItems: 0, improves: false } };
  if(!m) return out;
  const walkers = _walkersOf(campaign, m);
  if(!walkers.length) return out;
  // OFF — as currently carried (the shipped slowest-member rule).
  let offSlow = Infinity, offBand = null;
  for(const c of walkers){
    const info = (typeof A.carryEncumbranceInfo === 'function') ? A.carryEncumbranceInfo(c) : { totalSt: 0, band: { milesPerDay: 24, level: 'unencumbered' } };
    out.members.push({ id: c.id, name: c.name || '(unnamed)', carriedSt: _round(info.totalSt, 1), band: info.band.level, milesPerDay: info.band.milesPerDay });
    if(info.band.milesPerDay < offSlow){ offSlow = info.band.milesPerDay; offBand = info.band.level; }
  }
  out.slowestMilesPerDay = (offSlow === Infinity) ? null : offSlow;
  out.slowestBand = offBand;
  // ON — LPT redistribution of the transferable pool over the walkers' fixed bases (min the max load).
  const bins = walkers.map(c => ({ st: _fixedStone(c) }));
  const pool = [];
  for(const c of walkers){ for(const it of (c.inventory || [])){ if(_itemTransferable(it)) pool.push(_itemStone(it)); } }
  pool.sort((a, b) => b - a);
  for(const w of pool){
    let lo = 0; for(let i = 1; i < bins.length; i++){ if(bins[i].st < bins[lo].st) lo = i; }
    bins[lo].st += w;
  }
  let maxAfter = 0, balSlow = Infinity, balBand = null;
  for(const b of bins){
    if(b.st > maxAfter) maxAfter = b.st;
    const band = _bandForSt(b.st);
    if(band.milesPerDay < balSlow){ balSlow = band.milesPerDay; balBand = band.level; }
  }
  out.balanced.slowestMilesPerDay = (balSlow === Infinity) ? null : balSlow;
  out.balanced.slowestBand = balBand;
  out.balanced.maxAfterSt = _round(maxAfter, 1);
  out.balanced.transferableItems = pool.length;
  out.balanced.improves = (out.balanced.slowestMilesPerDay != null && out.slowestMilesPerDay != null
    && out.balanced.slowestMilesPerDay > out.slowestMilesPerDay);
  return out;
}
// APPLY the faithful redistribution: move transferable items between walkers (LPT) so the slowest band is
// minimised. Mutates character.inventory (players handing gear around); after it, the shipped
// journeyBaseSpeedMilesPerDay reflects the new distribution. Returns { moved, maxAfterSt } (moved = items
// relocated). A no-op-safe explicit action — the "Balance load" button / the shareLoad policy realiser.
function balanceGroupLoad(campaign, group){
  const A = _A();
  const m = _mover(campaign, group);
  if(!m) return { moved: 0, maxAfterSt: 0 };
  const walkers = _walkersOf(campaign, m);
  if(walkers.length < 2) return { moved: 0, maxAfterSt: 0 };
  // pool every transferable item with its source; each bin starts at the walker's fixed base.
  const bins = walkers.map(c => ({ c, st: _fixedStone(c) }));
  const items = [];
  for(const b of bins){
    for(let i = (b.c.inventory || []).length - 1; i >= 0; i--){
      const it = b.c.inventory[i];
      if(_itemTransferable(it)){ items.push({ it, from: b, st: _itemStone(it) }); }
    }
  }
  items.sort((a, b) => b.st - a.st);
  let moved = 0;
  for(const entry of items){
    let lo = 0; for(let i = 1; i < bins.length; i++){ if(bins[i].st < bins[lo].st) lo = i; }
    const target = bins[lo];
    if(target !== entry.from){
      const src = entry.from.c.inventory; const idx = src.indexOf(entry.it);
      if(idx >= 0){ src.splice(idx, 1); (target.c.inventory = target.c.inventory || []).push(entry.it); moved++; }
    }
    target.st += entry.st;
  }
  let maxAfter = 0; for(const b of bins){ if(b.st > maxAfter) maxAfter = b.st; }
  return { moved, maxAfterSt: _round(maxAfter, 1) };
}

// ─────────────────────────────────────────────────────────────────────────────
// Per-mover REGIME (D8) — party-canonical, journey-mirrored. Foundation owns the read (moverRegime) +
// the two-way write (setMoverRegime). This wrapper adds the shareRations legacy mirror so the unified
// toggle actually drives the shipped survival sourcing (party.shareProvisions / journey.shareRations).
// ─────────────────────────────────────────────────────────────────────────────
const REGIME_KEYS = ['skipEncounters', 'skipProvisioning', 'skipEncumbrance', 'shareRations', 'shareLoad'];
const REGIME_TRISTATE = { skipProvisioning: 1, skipEncumbrance: 1 };   // null(auto) → true(skip) → false(force) → null

function setMoverRegimeFlag(campaign, group, key, value){
  const A = _A();
  const m = _mover(campaign, group);
  if(!m || REGIME_KEYS.indexOf(key) < 0) return _regimeOf(campaign, m);
  if(typeof A.setMoverRegime === 'function') A.setMoverRegime(campaign, m, key, value);
  if(key === 'shareRations'){
    // mirror to the legacy fields the shipped survival consumer reads (so the D8 toggle drives sourcing).
    const party = (m.kind === 'party') ? m.entity
                : (m.journey && m.journey.partyId) ? _find(campaign.parties, m.journey.partyId) : null;
    if(party) party.shareProvisions = !!value;
    if(m.journey) m.journey.shareRations = !!value;
  }
  return _regimeOf(campaign, m);
}
function toggleMoverRegimeFlag(campaign, group, key){
  const m = _mover(campaign, group);
  if(!m || REGIME_KEYS.indexOf(key) < 0) return _regimeOf(campaign, m);
  const cur = _regimeOf(campaign, m);
  let next;
  if(REGIME_TRISTATE[key]){ const v = cur[key]; next = (v == null) ? true : (v === true ? false : null); }   // auto → skip → force → auto
  else next = !cur[key];
  return setMoverRegimeFlag(campaign, group, key, next);
}
// The effective regime + per-key provenance for the UI: value + whether it's a per-mover OVERRIDE or the
// global rule ('auto'). skipProvisioning/skipEncumbrance fall back to ignore-rations/ignore-encumbrance.
function moverRegimeState(campaign, group){
  const A = _A();
  const m = _mover(campaign, group);
  const r = _regimeOf(campaign, m);
  const gRations = (typeof A.isHouseRuleEnabled === 'function') && A.isHouseRuleEnabled(campaign, 'ignore-rations');
  const gEnc = (typeof A.isHouseRuleEnabled === 'function') && A.isHouseRuleEnabled(campaign, 'ignore-encumbrance');
  const triState = (v, globalSkip) => (v == null)
    ? { mode: 'auto', effectiveSkip: !!globalSkip }
    : { mode: (v ? 'skip' : 'force'), effectiveSkip: !!v };
  return {
    skipEncounters: { value: !!r.skipEncounters },
    skipProvisioning: triState(r.skipProvisioning, gRations),
    skipEncumbrance: triState(r.skipEncumbrance, gEnc),
    shareRations: { value: !!r.shareRations },
    shareLoad: { value: !!r.shareLoad }
  };
}

Object.assign(ACKS, {
  // D4/OQ1 — the ration line (public alias + the resolver seam is set below)
  moverProvisioningDemand,
  // readout + capacity
  moverConsumptionPerDay, groupHaulCapacity,
  // D5 — share-load
  groupShareLoadReport, balanceGroupLoad,
  // D8 — regime helpers
  setMoverRegimeFlag, toggleMoverRegimeFlag, moverRegimeState
});
// Install the RAW-faithful eater set as the Foundation survival-resolver seam (supersedes the movement.js
// default). Unconditional: this module loads after acks-engine-movement.js, so ours wins; and movement's
// own guard only sets the default when none exists, so order can't clobber this.
ACKS._provisioningDemand = moverProvisioningDemand;

if(typeof module !== 'undefined' && module.exports){ module.exports = ACKS; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
