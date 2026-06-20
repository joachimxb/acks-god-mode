/* Phase 4 Construction Wave C — Follower Attraction (RR p.334) ENGINE smoke.
 *
 * Run from "ACKS God Mode/" (or via `npm test`):  node tests/followers.smoke.js
 *
 * Covers (acks-engine-followers.js + acks-engine-events.js + the core):
 *   0. EXPORTS + event registration (follower-arrival known, schema'd, Wizard-opted-out).
 *   1. CATALOG — all 21 RR p.334 classes present; every count die parses; sanctum classes flagged.
 *   2. rollFollowerDice — "NdM(+K)(*X)" parses + rolls (the RAW worked counts).
 *   3. followerClassKey — normalizes "Fighter" / "Dwarven Vaultguard" / aliases; null for custom classes.
 *   4. domainFollowerEligibility — ok + each refusal reason (no-ruler / class-has-no-followers /
 *      sanctum-class / ruler-below-9th / stronghold-too-small / already-attracted).
 *   5. proposeFollowerArrival — companion count + per-companion level (1d6→1-3:1,4-5:2,6:3), troop count
 *      in dice range; rogue = companions only (no troops); priestess = companions + novices.
 *   6. attractFollowers — mints follower Characters (socialTier:'follower', lieged) + a troop Group
 *      (commanded by the ruler) + the novice Group; marks the ruler attracted-ONCE; emits follower-arrival.
 *   7. THE NO-SLOT RAW INVARIANT (RR p.335) — followers DON'T create henchmanships → the henchman cap
 *      is not inflated.
 *   8. DIVINE — crusader followers start loyalty/morale +4 (stored on the character).
 *   9. COMPLETION HINT — a construction-completed that pushes a domain ≥ threshold appends the follower
 *      heads-up to the narrative.
 *
 * Authored 2026-06-18 (Wave Construction-C, the follower slice; CLAUDE §8).
 */
'use strict';
require('./_engine.js').load();
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail !== undefined ? '  -- ' + detail : '')); failed++; }
}
const rngMin = () => 0;        // every die → its minimum
const rngMax = () => 0.999;    // every die → its maximum

// Build a fresh fixture: a ruler of `cls`/`level` ruling a domain whose stronghold is worth `sv` gp.
function fixture(cls, level, sv, opts){
  opts = opts || {};
  return {
    schemaVersion: 2, currentTurn: 5, houseRules: {},
    calendar: { year: 1, month: 1 }, currentDayInMonth: 1,
    characters: [ Object.assign({ id:'chr-ruler', name:'Aelric', class:cls, level:level, alignment:'L', race:opts.race||'human',
      abilities:{ STR:12, INT:12, WIL:12, DEX:12, CON:12, CHA:13 }, currentHexId:'hex-seat' }, opts.rulerExtra||{}) ],
    hexes: [ { id:'hex-seat', domainId:'dom-x', settlement:{ families:300 } } ],
    constructibles: [], groups: [], henchmanships: [], eventLog: [],
    domains: [ { id:'dom-x', name:'March', rulerCharacterId:'chr-ruler',
      stronghold: { components:[ { schemaVersion:2, id:'cmp-1', type:'Castle', name:'Castle', buildValue:sv, structures:[] } ] },
      geography: { hexes:[ { id:'hex-seat', domainId:'dom-x' } ] } } ]
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 0. Exports + event registration
// ─────────────────────────────────────────────────────────────────────────────
['FOLLOWERS_BY_CLASS','rollFollowerDice','followerClassKey','followersForClass','domainFollowerEligibility','proposeFollowerArrival','attractFollowers']
  .forEach(k => check('exported: ' + k, ACKS[k] !== undefined));
check('follower-arrival is a known event kind',      ACKS.isEventKindKnown('follower-arrival') === true);
check('follower-arrival NOT Wizard-emittable (audit)', ACKS.isWizardEmittable('follower-arrival') === false);
check('follower-arrival has a schema',                !!ACKS.EVENT_SCHEMAS['follower-arrival']);
// Wave B — Families Arriving with Followers event (RR p.337)
check('follower-families-arrived is a known event kind',      ACKS.isEventKindKnown('follower-families-arrived') === true);
check('follower-families-arrived NOT Wizard-emittable (audit)', ACKS.isWizardEmittable('follower-families-arrived') === false);
check('follower-families-arrived has a schema',                !!ACKS.EVENT_SCHEMAS['follower-families-arrived']);
['FAMILIES_ARRIVING_PER_HEX','FOLLOWER_TROOP_TABLES','followerTroopTableKey','rollFollowerTroopType','rollFollowerTroops','familiesArrivingPreview','rollFamiliesArriving','followerLoyaltyInfo','rollFollowerLoyalty']
  .forEach(k => check('Wave B exported: ' + k, ACKS[k] !== undefined));

// ─────────────────────────────────────────────────────────────────────────────
// 1. Catalog — the full RR p.334 roster
// ─────────────────────────────────────────────────────────────────────────────
const CAT = ACKS.FOLLOWERS_BY_CLASS;
const EXPECTED = ['assassin','barbarian','bard','bladedancer','crusader','dwarven-craftpriest','dwarven-vaultguard',
  'elven-nightblade','elven-spellsword','explorer','fighter','mage','nobiran-wonderworker','paladin','priestess',
  'shaman','thief','venturer','warlock','witch','zaharan-ruinguard'];
check('catalog has all 21 RR p.334 classes', EXPECTED.every(k => CAT[k]) && Object.keys(CAT).length === 21, Object.keys(CAT).length);
check('fighter: Castle / 15,000 / 5d6*10 troops / 1d6 companions',
  CAT.fighter.stronghold === 'Castle' && CAT.fighter.minGp === 15000 && CAT.fighter.troops === '5d6*10' && CAT.fighter.companions === '1d6');
check('thief: Hideout / 5,000 / 2d6 companions / NO troops / noDomain',
  CAT.thief.stronghold === 'Hideout' && CAT.thief.minGp === 5000 && CAT.thief.companions === '2d6' && !CAT.thief.troops && CAT.thief.noDomain === true);
check('dwarven-vaultguard: 3d6*10 1st dwarven troops, NO companions, race dwarf',
  CAT['dwarven-vaultguard'].troops === '3d6*10' && CAT['dwarven-vaultguard'].troopLevel === 1 && !CAT['dwarven-vaultguard'].companions && CAT['dwarven-vaultguard'].race === 'dwarf');
check('crusader divine (+4 loyalty/morale)', CAT.crusader.divine === true && CAT.crusader.loyalty === 4 && CAT.crusader.morale === 4);
check('priestess: 1d2*10 companions + 1d6*30 apprentices', CAT.priestess.companions === '1d2*10' && CAT.priestess.apprentices === '1d6*30');
check('mage/warlock/witch/nobiran flagged sanctumModule (AD-B owns them)',
  ['mage','warlock','witch','nobiran-wonderworker'].every(k => CAT[k].sanctumModule === true));
// every count die in the catalog parses
let allDiceParse = true;
for(const [k, row] of Object.entries(CAT)){
  for(const spec of [row.troops, row.companions, row.apprentices]){
    if(spec != null && ACKS.rollFollowerDice(spec, rngMin) <= 0){ allDiceParse = false; console.log('   bad die: ' + k + ' ' + spec); }
  }
}
check('every catalog count die parses to a positive roll', allDiceParse);

// ─────────────────────────────────────────────────────────────────────────────
// 2. rollFollowerDice
// ─────────────────────────────────────────────────────────────────────────────
check('5d6*10 min = 50',     ACKS.rollFollowerDice('5d6*10', rngMin) === 50);
check('5d6*10 max = 300',    ACKS.rollFollowerDice('5d6*10', rngMax) === 300);
check('1d4+1*10 min = 20',   ACKS.rollFollowerDice('1d4+1*10', rngMin) === 20);
check('1d4+1*10 max = 50',   ACKS.rollFollowerDice('1d4+1*10', rngMax) === 50);
check('1d2*10 range 10..20', ACKS.rollFollowerDice('1d2*10', rngMin) === 10 && ACKS.rollFollowerDice('1d2*10', rngMax) === 20);
check('1d6*30 min = 30',     ACKS.rollFollowerDice('1d6*30', rngMin) === 30);
check('2d6 min = 2, max = 12', ACKS.rollFollowerDice('2d6', rngMin) === 2 && ACKS.rollFollowerDice('2d6', rngMax) === 12);
check('garbage spec → 0',    ACKS.rollFollowerDice('nonsense', rngMin) === 0);

// ─────────────────────────────────────────────────────────────────────────────
// 3. followerClassKey
// ─────────────────────────────────────────────────────────────────────────────
check('"Fighter" → fighter',                  ACKS.followerClassKey({ class:'Fighter' }) === 'fighter');
check('"Dwarven Vaultguard" → dwarven-vaultguard', ACKS.followerClassKey({ class:'Dwarven Vaultguard' }) === 'dwarven-vaultguard');
check('"Nobiran Wonderworker" → nobiran-wonderworker', ACKS.followerClassKey({ class:'Nobiran Wonderworker' }) === 'nobiran-wonderworker');
check('alias "Vaultguard" → dwarven-vaultguard', ACKS.followerClassKey({ class:'Vaultguard' }) === 'dwarven-vaultguard');
check('custom class → null',                  ACKS.followerClassKey({ class:'Spellsinger' }) === null);
check('no class → null',                      ACKS.followerClassKey({ class:'' }) === null);

// ─────────────────────────────────────────────────────────────────────────────
// 4. domainFollowerEligibility — ok + each refusal reason
// ─────────────────────────────────────────────────────────────────────────────
{
  const c = fixture('Fighter', 9, 15000);
  const e = ACKS.domainFollowerEligibility(c, c.domains[0]);
  check('eligible ok: Fighter L9 @ 15,000gp', e.ok === true && e.classKey === 'fighter' && e.threshold === 15000 && e.strongholdValue === 15000, JSON.stringify({ok:e.ok, r:e.reason}));
}
{ const c = fixture('Fighter', 8, 15000); const e = ACKS.domainFollowerEligibility(c, c.domains[0]); check('refuse: ruler-below-9th (L8)', !e.ok && e.reason === 'ruler-below-9th', e.reason); }
{ const c = fixture('Fighter', 9, 10000); const e = ACKS.domainFollowerEligibility(c, c.domains[0]); check('refuse: stronghold-too-small (10,000 < 15,000)', !e.ok && e.reason === 'stronghold-too-small', e.reason); }
{ const c = fixture('Mage', 9, 20000);    const e = ACKS.domainFollowerEligibility(c, c.domains[0]); check('refuse: sanctum-class (Mage → AD-B owns)', !e.ok && e.reason === 'sanctum-class', e.reason); }
{ const c = fixture('Spellsinger', 9, 20000); const e = ACKS.domainFollowerEligibility(c, c.domains[0]); check('refuse: class-has-no-followers (custom)', !e.ok && e.reason === 'class-has-no-followers', e.reason); }
{ const c = fixture('Fighter', 9, 15000); c.domains[0].rulerCharacterId = null; const e = ACKS.domainFollowerEligibility(c, c.domains[0]); check('refuse: no-ruler', !e.ok && e.reason === 'no-ruler', e.reason); }
// Thief qualifies at the lower 5,000gp threshold
{ const c = fixture('Thief', 9, 5000); const e = ACKS.domainFollowerEligibility(c, c.domains[0]); check('eligible: Thief L9 @ 5,000gp (hideout threshold)', e.ok === true && e.threshold === 5000, e.reason); }
{ const c = fixture('Thief', 9, 4000); const e = ACKS.domainFollowerEligibility(c, c.domains[0]); check('refuse: Thief @ 4,000 (< 5,000)', !e.ok && e.reason === 'stronghold-too-small', e.reason); }

// ─────────────────────────────────────────────────────────────────────────────
// 5. proposeFollowerArrival
// ─────────────────────────────────────────────────────────────────────────────
{
  const c = fixture('Fighter', 9, 15000);
  const pMin = ACKS.proposeFollowerArrival(c, c.domains[0], { rng: rngMin });
  check('fighter propose min: 1 companion (L1) + 50 troops', pMin.companionCount === 1 && pMin.companions[0].level === 1 && pMin.troopCount === 50 && pMin.troopLevel === 0, JSON.stringify(pMin.companions));
  const pMax = ACKS.proposeFollowerArrival(c, c.domains[0], { rng: rngMax });
  check('fighter propose max: 6 companions (all L3) + 300 troops', pMax.companionCount === 6 && pMax.companions.every(x => x.level === 3) && pMax.troopCount === 300, JSON.stringify({n:pMax.companionCount, t:pMax.troopCount}));
  // companion levels stay in 1..3
  check('companion levels in 1..3', pMax.companions.every(x => x.level >= 1 && x.level <= 3));
}
{ // companion level mapping 1d6 → 1-3:1, 4-5:2, 6:3
  const c = fixture('Fighter', 9, 15000);
  let lv = { 1:0, 2:0, 3:0 };
  // feed a controlled rng: companions-count die first (force 6), then the 6 level dice 0..0.999 spread
  const seq = [0.999, 0/6, 2.5/6, 3.5/6, 4.5/6, 5.5/6, 5.99/6]; let i = 0;
  const p = ACKS.proposeFollowerArrival(c, c.domains[0], { rng: () => seq[Math.min(i++, seq.length-1)] });
  p.companions.forEach(x => lv[x.level]++);
  check('1d6 level mapping produces a spread of 1/2/3', lv[1] > 0 && lv[2] > 0 && lv[3] > 0, JSON.stringify(lv));
}
{ // rogue: companions only, no troops
  const c = fixture('Thief', 9, 5000);
  const p = ACKS.proposeFollowerArrival(c, c.domains[0], { rng: rngMax });
  check('thief propose: 12 companions (all L1), 0 troops', p.companionCount === 12 && p.companions.every(x => x.level === 1) && p.troopCount === 0, JSON.stringify({n:p.companionCount, t:p.troopCount}));
}
{ // priestess: companions + novices(apprentices), no troops
  const c = fixture('Priestess', 9, 15000);
  const p = ACKS.proposeFollowerArrival(c, c.domains[0], { rng: rngMin });
  check('priestess propose: 10 companions + 30 novices + 0 troops', p.companionCount === 10 && p.apprenticeCount === 30 && p.troopCount === 0, JSON.stringify({n:p.companionCount, a:p.apprenticeCount, t:p.troopCount}));
}

// ─────────────────────────────────────────────────────────────────────────────
// 6 + 7. attractFollowers — materialization + the no-slot RAW invariant
// ─────────────────────────────────────────────────────────────────────────────
{
  const c = fixture('Fighter', 9, 15000);
  const ruler = c.characters[0];
  const capBefore = ACKS.henchmanshipsByPatron(c, ruler.id).length;
  const p = ACKS.proposeFollowerArrival(c, c.domains[0], { rng: rngMax }); // 6 companions + 300 troops
  const r = ACKS.attractFollowers(c, c.domains[0], p, { rng: rngMax });
  check('attract ok', r.ok === true && r.companionCount === 6 && r.troopCount === 300);
  const followers = c.characters.filter(ch => ch.socialTier === 'follower');
  check('  minted 6 follower Characters (socialTier follower)', followers.length === 6, followers.length);
  check('  followers lieged to the ruler', followers.every(ch => ch.liegeCharacterId === ruler.id));
  check('  followers carry the ruler\'s class + a 1..3 level', followers.every(ch => ch.class === 'Fighter' && ch.level >= 1 && ch.level <= 3));
  check('  followers homed to the domain', followers.every(ch => ch.currentDomainId === 'dom-x'));
  const troopG = (c.groups || []).find(g => g.id === r.troopGroupId);
  check('  minted a troop Group of 300, commanded by the ruler', troopG && troopG.count === 300 && troopG.commanderCharacterId === ruler.id && troopG.socialTier === 'follower', troopG && troopG.count);
  check('  RAW NO-SLOT INVARIANT: no henchmanships created (cap not inflated)', ACKS.henchmanshipsByPatron(c, ruler.id).length === capBefore);
  check('  ruler marked attracted-once', ruler.followersAttracted === true && ruler.followersAttractedAtTurn === 5);
  // event emitted
  const ev = (c.eventLog || []).map(e => e.event).find(e => e && e.kind === 'follower-arrival');
  check('  follower-arrival event recorded with payload', !!ev && ev.payload.companionCount === 6 && ev.payload.troopCount === 300 && ev.payload.rulerCharacterId === ruler.id);
  check('  event carries the ruler + domain context', ev && ev.context && (ev.context.domainId === 'dom-x') && (ev.context.relatedEntities || []).some(re => re.id === ruler.id && re.role === 'subject'));
  // re-attract refused (once-only)
  const p2 = ACKS.proposeFollowerArrival(c, c.domains[0], { rng: rngMax });
  check('  re-propose now refused (already-attracted)', p2.ok === false && p2.reason === 'already-attracted');
  const r2 = ACKS.attractFollowers(c, c.domains[0], { ok:true, rulerId:ruler.id, companions:[{level:1}], troopCount:50 }, {});
  check('  re-attract refused (already-attracted), no new chars', r2.ok === false && r2.reason === 'already-attracted' && c.characters.filter(ch => ch.socialTier === 'follower').length === 6);
}
{ // priestess materializes companions + a novice Group
  const c = fixture('Priestess', 9, 15000);
  const p = ACKS.proposeFollowerArrival(c, c.domains[0], { rng: rngMin }); // 10 companions + 30 novices
  const r = ACKS.attractFollowers(c, c.domains[0], p, { rng: rngMin });
  const novG = (c.groups || []).find(g => g.id === r.noviceGroupId);
  check('priestess: 10 follower Characters + a 30-novice Group',
    c.characters.filter(ch => ch.socialTier === 'follower').length === 10 && novG && novG.count === 30 && /novices/.test(novG.name), novG && novG.count);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. Divine loyalty/morale stored on the follower (RR p.335 — +4)
// ─────────────────────────────────────────────────────────────────────────────
{
  const c = fixture('Crusader', 9, 15000);
  const p = ACKS.proposeFollowerArrival(c, c.domains[0], { rng: rngMin });
  check('crusader proposal carries divine=true, loyalty/morale 4', p.divine === true && p.loyalty === 4 && p.morale === 4);
  ACKS.attractFollowers(c, c.domains[0], p, { rng: rngMin });
  const f = c.characters.find(ch => ch.socialTier === 'follower');
  check('crusader followers stored with loyalty/morale +4', f && f.followerLoyalty === 4 && f.followerMorale === 4);
}

// ─────────────────────────────────────────────────────────────────────────────
// 9. Completion hint — a stronghold-component completion that crosses the threshold
//    appends the follower heads-up to the construction-completed narrative.
// ─────────────────────────────────────────────────────────────────────────────
{
  // ruler L9 Fighter; domain at 14,000gp; build a 2,000gp component → crosses 15,000 → hint
  const c = fixture('Fighter', 9, 14000);
  const dom = c.domains[0];
  const p = ACKS.startConstructionProject(c, { name:'Tower', constructibleKind:'stronghold-component',
    siteHexId:'hex-seat', ownerDomainId:'dom-x', totalCost:2000, workerCounts:{ laborer:100 },
    completionSpec:{ componentType:'', structures:[] } });
  const res = ACKS.applyEvent(c, ACKS.newEvent('construction-completed', { payload:{ projectId:p.id }, submittedBy:'gm', status:'applied' }));
  const narr = (res && res.result && res.result.narrativeSummary) || '';
  check('completion hint: narrative mentions followers after crossing threshold', /attract followers/.test(narr), narr);
  check('  (sanity) stronghold value now >= 15,000', ACKS.strongholdValue(c, dom) >= 15000, ACKS.strongholdValue(c, dom));
}
{ // below-threshold completion → NO follower hint
  const c = fixture('Fighter', 9, 10000);
  const p = ACKS.startConstructionProject(c, { name:'Wall', constructibleKind:'stronghold-component',
    siteHexId:'hex-seat', ownerDomainId:'dom-x', totalCost:2000, workerCounts:{ laborer:100 }, completionSpec:{ structures:[] } });
  const res = ACKS.applyEvent(c, ACKS.newEvent('construction-completed', { payload:{ projectId:p.id }, submittedBy:'gm', status:'applied' }));
  check('no hint when still below threshold (12,000 < 15,000)', !/attract followers/.test((res && res.result && res.result.narrativeSummary) || ''));
}

// ═════════════════════════════════════════════════════════════════════════════
// WAVE B (team b11) — loyalty/morale wiring + Families Arriving + Type & Equipment
// ═════════════════════════════════════════════════════════════════════════════

// A fixture with a controlled domain classification + N rural (settlement-less) hexes for the
// per-hex Families roll. (effectiveDomainClassification uses d.classification when it's a valid value.)
function famFixture(cls, level, sv, o){
  o = o || {};
  const c = fixture(cls, level, sv);
  const d = c.domains[0];
  d.demographics = { peasantFamilies: o.peasantFamilies || 0, urbanFamilies: 0, morale: o.morale || 0, moraleNotes: '' };
  if(o.classification) d.classification = o.classification;
  d.geography = { hexes: [] }; c.hexes = [];
  for(let i = 0; i < (o.nHexes || 1); i++){ const h = { id:'hex-' + i, domainId:'dom-x' }; d.geography.hexes.push(h); c.hexes.push(h); }
  return c;
}

// ── 10. loyalty/morale WIRING ──
{ // non-divine: canonical character.loyalty = base 2 + ruler CHA mod (CHA 13 → +1) = 3
  const c = fixture('Fighter', 9, 15000);
  const p = ACKS.proposeFollowerArrival(c, c.domains[0], { rng: rngMax });
  ACKS.attractFollowers(c, c.domains[0], p, { rng: rngMax });
  const f = c.characters.find(ch => ch.socialTier === 'follower');
  check('WIRING: follower carries canonical character.loyalty (base 2 + ruler CHA +1 = 3)', f.loyalty === 3, f.loyalty);
  check('WIRING: follower keeps the immutable RAW-base followerLoyalty (2)', f.followerLoyalty === 2, f.followerLoyalty);
  check('WIRING: non-divine follower NOT fanatical', f.fanaticalFollower === false);
  const info = ACKS.followerLoyaltyInfo(c, f.id);
  check('followerLoyaltyInfo: isFollower, effectiveLoyalty 3, rollsLoyalty true', info.ok && info.isFollower === true && info.effectiveLoyalty === 3 && info.rollsLoyalty === true, JSON.stringify(info));
  // rollFollowerLoyalty bridges to the shipped rollLoyalty (nat 4+4=8 + loyalty 3 = 11 → Loyalty band)
  const r = ACKS.rollFollowerLoyalty(c, f.id, { prerolled: { d1:4, d2:4 } });
  check('rollFollowerLoyalty bridges to rollLoyalty (nat8 + loy3 = 11 → Loyalty)', r.ok && r.rolled === true && r.natRoll === 8 && r.adjusted === 11 && r.bandKey === 'loyalty', JSON.stringify(r));
}
{ // divine crusader → fanatical: loyalty base 4 (+ CHA, clamped +4); no calamity loyalty roll
  const c = fixture('Crusader', 9, 15000);
  const p = ACKS.proposeFollowerArrival(c, c.domains[0], { rng: rngMin });
  ACKS.attractFollowers(c, c.domains[0], p, { rng: rngMin });
  const f = c.characters.find(ch => ch.socialTier === 'follower');
  check('WIRING: divine follower fanaticalFollower true', f.fanaticalFollower === true);
  check('WIRING: divine follower loyalty clamped to +4', f.loyalty === 4, f.loyalty);
  const r = ACKS.rollFollowerLoyalty(c, f.id, {});
  check('rollFollowerLoyalty: divine → fanatical, no roll (RR p.336)', r.ok && r.fanatical === true && r.rolled === false && r.bandKey === 'fanatic', JSON.stringify(r));
  const info = ACKS.followerLoyaltyInfo(c, f.id);
  check('followerLoyaltyInfo: divine → fanatical, rollsLoyalty false', info.fanatical === true && info.rollsLoyalty === false);
}
check('followerLoyaltyInfo: unknown char → not ok', ACKS.followerLoyaltyInfo(fixture('Fighter',9,15000), 'nope').ok === false);

// ── 11. Families Arriving with Followers (RR p.337) ──
check('FAMILIES table: civilized 8d6×10 / borderlands 3d6×10 / outlands 1d4+1×10',
  ACKS.FAMILIES_ARRIVING_PER_HEX.Civilized === '8d6*10' && ACKS.FAMILIES_ARRIVING_PER_HEX.Borderlands === '3d6*10' && ACKS.FAMILIES_ARRIVING_PER_HEX.Outlands === '1d4+1*10');
{ const c = famFixture('Fighter', 9, 15000, { classification:'Outlands', nHexes:1 });
  const fr = ACKS.rollFamiliesArriving(c, c.domains[0], CAT.fighter, rngMax);
  check('rollFamiliesArriving outlands 1 hex max = 50', fr.applicable && fr.families === 50 && fr.hexCount === 1 && fr.classification === 'Outlands', JSON.stringify(fr)); }
{ const c = famFixture('Fighter', 9, 15000, { classification:'Borderlands', nHexes:2 });
  const fr = ACKS.rollFamiliesArriving(c, c.domains[0], CAT.fighter, rngMin);
  check('rollFamiliesArriving borderlands 2 hexes min = 60 (30×2)', fr.families === 60 && fr.hexCount === 2 && fr.perHex.length === 2, JSON.stringify(fr)); }
{ const c = famFixture('Fighter', 9, 15000, { classification:'Civilized', nHexes:1 });
  const fr = ACKS.rollFamiliesArriving(c, c.domains[0], CAT.fighter, rngMin);
  check('rollFamiliesArriving civilized 1 hex min = 80', fr.families === 80, JSON.stringify(fr)); }
{ const c = famFixture('Thief', 9, 5000, { classification:'Borderlands', nHexes:2 });
  const fr = ACKS.rollFamiliesArriving(c, c.domains[0], CAT.thief, rngMax);
  check('noDomain (thief hideout) → families not applicable, 0', fr.applicable === false && fr.families === 0); }
{ const c = famFixture('Fighter', 9, 15000, { classification:'Borderlands', nHexes:2 });
  const pv = ACKS.familiesArrivingPreview(c, c.domains[0], CAT.fighter);
  check('familiesArrivingPreview: borderlands 2 hexes label', pv.applicable && pv.classification === 'Borderlands' && pv.hexCount === 2 && /3d6×10 per hex × 2 hexes \(Borderlands\)/.test(pv.label), pv.label); }
// attractFollowers bumps domain population via the canonical setter (keeps the per-hex mirror in sync)
{
  const c = famFixture('Fighter', 9, 15000, { classification:'Borderlands', nHexes:2, peasantFamilies:200 });
  const p = ACKS.proposeFollowerArrival(c, c.domains[0], { rng: rngMin });
  check('proposal carries familiesPreview (Borderlands)', p.familiesPreview && p.familiesPreview.applicable && p.familiesPreview.classification === 'Borderlands');
  const r = ACKS.attractFollowers(c, c.domains[0], p, { rng: rngMin });   // borderlands 2 hexes min = 60
  check('attract: families arrived = 60', r.families === 60, r.families);
  check('domain peasantFamilies bumped 200 → 260', c.domains[0].demographics.peasantFamilies === 260, c.domains[0].demographics.peasantFamilies);
  check('domain.followerFamiliesArrived marker = 60', c.domains[0].followerFamiliesArrived === 60);
  const hexSum = c.domains[0].geography.hexes.reduce((s,h) => s + (h.families || 0), 0);
  check('per-hex rural families sum == peasantFamilies (260) — canonical setter kept the mirror in sync', hexSum === 260, hexSum);
  const fev = (c.eventLog || []).map(e => e.event).find(e => e && e.kind === 'follower-families-arrived');
  check('follower-families-arrived event recorded with context', !!fev && fev.payload.families === 60 && fev.payload.classification === 'Borderlands' && fev.context && fev.context.domainId === 'dom-x', fev && JSON.stringify(fev.payload));
  check('follower-arrival result/event includes families', r.familiesInfo && r.familiesInfo.families === 60);
}
{ // the REAL UI path: attractFollowers called with NO opts (rng omitted) — families must still roll
  // (regression: rollFamiliesArriving handed undefined straight to rollFollowerDice → rng() threw → 0 families)
  const c = famFixture('Fighter', 9, 15000, { classification:'Outlands', nHexes:1, peasantFamilies:50 });
  const p = ACKS.proposeFollowerArrival(c, c.domains[0]);          // no rng
  const r = ACKS.attractFollowers(c, c.domains[0], p);            // no opts at all
  check('UI path (no rng): families rolled (outlands 1 hex, 20..50)', r.families >= 20 && r.families <= 50, r.families);
  check('UI path (no rng): peasantFamilies bumped by the rolled families', c.domains[0].demographics.peasantFamilies === 50 + r.families, c.domains[0].demographics.peasantFamilies);
  check('UI path (no rng): troop composition still rolled', r.troopComposition && r.troopComposition.platoons.length >= 1);
}
{ // noDomain attract → population untouched, no families event
  const c = famFixture('Thief', 9, 5000, { classification:'Borderlands', nHexes:2, peasantFamilies:100 });
  const p = ACKS.proposeFollowerArrival(c, c.domains[0], { rng: rngMax });
  const r = ACKS.attractFollowers(c, c.domains[0], p, { rng: rngMax });
  check('thief attract: 0 families (hideout brings none), population untouched', r.families === 0 && c.domains[0].demographics.peasantFamilies === 100);
  check('no follower-families-arrived event for noDomain', !(c.eventLog || []).map(e => e.event).some(e => e && e.kind === 'follower-families-arrived'));
}

// ── 12. per-class Followers Type & Equipment (RR p.337) ──
{
  const tk = Object.keys(ACKS.FOLLOWER_TROOP_TABLES);
  check('9 troop tables present (6 class groups + 3 barbarian setting variants)', tk.length === 9, tk.length);
  let allContig = true;
  for(const k of tk){
    const t = ACKS.FOLLOWER_TROOP_TABLES[k];
    if(t[0].lo !== 1){ allContig = false; console.log('   ' + k + ' starts ' + t[0].lo); }
    if(t[t.length - 1].hi !== 100){ allContig = false; console.log('   ' + k + ' ends ' + t[t.length - 1].hi); }
    for(let i = 1; i < t.length; i++){ if(t[i].lo !== t[i-1].hi + 1){ allContig = false; console.log('   ' + k + ' gap at ' + i); } }
    if(!t.every(r => r.type && r.equipment)){ allContig = false; console.log('   ' + k + ' missing type/equipment'); }
  }
  check('every troop table is contiguous 1..100 with type+equipment', allContig);
}
check('followerTroopTableKey: fighter/paladin/crusader → fighter', ['fighter','paladin','crusader'].every(c => ACKS.followerTroopTableKey(c) === 'fighter'));
check('followerTroopTableKey: bard/bladedancer → bard-bladedancer', ACKS.followerTroopTableKey('bard') === 'bard-bladedancer' && ACKS.followerTroopTableKey('bladedancer') === 'bard-bladedancer');
check('followerTroopTableKey: explorer/shaman → explorer-shaman', ACKS.followerTroopTableKey('explorer') === 'explorer-shaman' && ACKS.followerTroopTableKey('shaman') === 'explorer-shaman');
check('followerTroopTableKey: dwarven → dwarven', ACKS.followerTroopTableKey('dwarven-vaultguard') === 'dwarven' && ACKS.followerTroopTableKey('dwarven-craftpriest') === 'dwarven');
check('followerTroopTableKey: elven-spellsword + zaharan-ruinguard', ACKS.followerTroopTableKey('elven-spellsword') === 'elven-spellsword' && ACKS.followerTroopTableKey('zaharan-ruinguard') === 'zaharan');
check('followerTroopTableKey: barbarian default jutland; culture picks variant', ACKS.followerTroopTableKey('barbarian') === 'barbarian-jutland' && ACKS.followerTroopTableKey('barbarian', { barbarianCulture:'skysos' }) === 'barbarian-skysos');
check('followerTroopTableKey: opts.tableKey override (Chaotic crusader → zaharan, RR p.337)', ACKS.followerTroopTableKey('crusader', { tableKey:'zaharan' }) === 'zaharan');
check('followerTroopTableKey: rogue/no-troops class → null', ACKS.followerTroopTableKey('thief') === null);
{ const lo = ACKS.rollFollowerTroopType('fighter', rngMin); check('rollFollowerTroopType fighter min (roll 1) → Cataphract Cavalry', lo.roll === 1 && lo.type === 'Cataphract Cavalry', JSON.stringify(lo)); }
{ const hi = ACKS.rollFollowerTroopType('fighter', rngMax); check('rollFollowerTroopType fighter max (roll 100) → Slingers', hi.roll === 100 && hi.type === 'Slingers', JSON.stringify(hi)); }
{
  const comp = ACKS.rollFollowerTroops(null, 'fighter', 75, { rng: rngMax });
  check('rollFollowerTroops 75 → 3 platoons (30+30+15)', comp.platoons.length === 3 && comp.platoons[0].count === 30 && comp.platoons[1].count === 30 && comp.platoons[2].count === 15, JSON.stringify(comp.platoons.map(p => p.count)));
  check('  platoon counts sum to 75', comp.platoons.reduce((s,p) => s + p.count, 0) === 75);
  check('  all-max → all Slingers, summary [{Slingers,75}]', comp.summary.length === 1 && comp.summary[0].type === 'Slingers' && comp.summary[0].count === 75, JSON.stringify(comp.summary));
  check('  tableKey = fighter', comp.tableKey === 'fighter');
}
check('rollFollowerTroops 0 troops → empty', ACKS.rollFollowerTroops(null, 'fighter', 0, { rng: rngMin }).platoons.length === 0);
{ // attractFollowers attaches the rolled composition to the troop group
  const c = fixture('Fighter', 9, 15000);
  const p = ACKS.proposeFollowerArrival(c, c.domains[0], { rng: rngMax });   // 300 troops
  check('proposal carries troopTableKey (fighter)', p.troopTableKey === 'fighter');
  const r = ACKS.attractFollowers(c, c.domains[0], p, { rng: rngMax });
  const g = (c.groups || []).find(x => x.id === r.troopGroupId);
  check('troop group carries followerComposition (10 platoons for 300)', g && Array.isArray(g.followerComposition) && g.followerComposition.length === 10, g && g.followerComposition && g.followerComposition.length);
  check('  composition platoons sum to 300', g.followerComposition.reduce((s,pl) => s + pl.count, 0) === 300);
  check('  troop group carries follower morale (1) + loyalty (2)', g.followerMorale === 1 && g.followerLoyalty === 2);
  check('  troop group name names the dominant type', /mostly /.test(g.name || ''), g.name);
  check('  groupTemplate.followerTroopTableKey = fighter', g.groupTemplate && g.groupTemplate.followerTroopTableKey === 'fighter');
  check('  attract result returns troopComposition', r.troopComposition && r.troopComposition.tableKey === 'fighter');
}

console.log((failed === 0 ? 'PASS' : 'FAIL') + ' followers.smoke — ' + passed + ' passed, ' + failed + ' failed');
if(failed > 0) process.exit(1);
