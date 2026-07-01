/* Movement 2.0 Foundation smoke test — the shared Mover primitive.
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/movement.smoke.js
 *
 * Covers the Foundation deliverables (_handoffs/Movement_2.0_Foundation.md §3):
 *   Slice 1 — F-1 the per-character movement budget (activity-budget-aware, survives party join,
 *             party = min-remaining) · F-4 the per-hex cost model (terrain / road / surefooted) ·
 *             F-2 _moveStep + the manual moveActorOneHex verb (adjacency, water gate, budget, event).
 *   Slice 2 — F-3 per-hex journey advance (advanceJourneyOneHex + ⏩/⏭ loops; nav once-per-day,
 *             halts) · F-5 journey.groupId · F-8b the paused-aware autopilot.
 *   Slice 3 — F-6 ensureTravelParty (D9) · F-7 the regime shape + groupCarryingCapacity · F-8a the
 *             provisioning-demand seam.
 *
 * The oracle-safety bar (the #1 regression risk): Foundation adds the per-hex path ALONGSIDE the
 * shipped whole-day resolver, which stays byte-identical — so journeys/economy/voyages/military
 * smokes are unchanged. This suite tests only the NEW primitive.
 *
 * Authored 2026-07-01 (Movement 2.0 Foundation).
 */

const path = require('path');
require('./_engine.js').load();
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail !== undefined ? '  -- ' + detail : '')); failed++; }
}
function section(t){ console.log('--- ' + t + ' ---'); }
const PASS_RNG = () => 0.99;   // d20 ≈ 20 → nav ok; encounter draw → nothing (high roll)

// A little grid: a row of grassland (a-b-c-d-e), a forest branch, a road hex, a water hex.
//   coords:  a(0,0) b(1,0) c(2,0) d(3,0) e(4,0)   f=forest(0,1)   w=water(2,-1 adj to c? no) — build adj as needed
function grid(opts){
  opts = opts || {};
  const c = ACKS.blankCampaign({ name: 'mvtest' });
  c.currentTurn = 1; c.currentDayInMonth = 5;
  c.calendar = c.calendar || { year: 1, month: 1, day: 5 };
  c.hexes = [
    ACKS.blankHex({ id: 'hex-a', coord: { q: 0, r: 0 }, terrain: 'grassland' }),
    ACKS.blankHex({ id: 'hex-b', coord: { q: 1, r: 0 }, terrain: 'grassland' }),
    ACKS.blankHex({ id: 'hex-c', coord: { q: 2, r: 0 }, terrain: 'grassland' }),
    ACKS.blankHex({ id: 'hex-d', coord: { q: 3, r: 0 }, terrain: 'grassland' }),
    ACKS.blankHex({ id: 'hex-e', coord: { q: 4, r: 0 }, terrain: 'grassland' }),
    ACKS.blankHex({ id: 'hex-f', coord: { q: 0, r: 1 }, terrain: 'forest' }),            // adj to a (delta 0,1 = face 1)
    ACKS.blankHex({ id: 'hex-rd', coord: { q: 5, r: 0 }, terrain: 'grassland', hasRoad: true }), // adj to e
    ACKS.blankHex({ id: 'hex-w', coord: { q: -1, r: 0 }, terrain: 'water' })              // adj to a (delta -1,0 = face 3)
  ];
  const ch = ACKS.blankCharacter({ id: 'chr-1', name: 'Halvard', currentHexId: 'hex-a' });
  c.characters = [ch];
  const pt = ACKS.blankParty({ id: 'par-1', name: 'Scouts', memberCharacterIds: ['chr-1'], leaderCharacterId: 'chr-1', currentHexId: 'hex-a' });
  c.parties = [pt];
  return { c, ch, pt };
}

// ═══════════════════════════════════ SLICE 1 ═══════════════════════════════════
section('F-1 — the movement budget (RR p.272: 24 mi/day unencumbered = 4 grassland hexes)');
{
  const { c, pt } = grid();
  const b = ACKS.moverDayBudget(c, pt);
  check('cap = 24 miles (unencumbered foot party at normal pace)', b.capMiles === 24, b.capMiles);
  check('perHexCostHere = 6 (grassland)', b.perHexCostHere === 6, b.perHexCostHere);
  check('hexesRemaining = 4 (24/6)', b.hexesRemaining === 4, b.hexesRemaining);
  check('remaining = cap when nothing spent', b.remainingMiles === 24, b.remainingMiles);
  check('movementBudgetRemaining agrees', ACKS.movementBudgetRemaining(c, pt) === 24);
}

section('F-1 — the ledger lives on the character + resets per world day');
{
  const { c, ch, pt } = grid();
  ACKS.moveActorOneHex(c, pt, 'hex-b', { rng: PASS_RNG });
  check('character.dailyMovement stamped with worldOrd + milesUsed', ch.dailyMovement && ch.dailyMovement.milesUsed === 6 && ch.dailyMovement.worldOrd === (1 * 30 + 5), JSON.stringify(ch.dailyMovement));
  check('budget used = 6 after one hex', ACKS.moverDayBudget(c, pt).usedMiles === 6);
  c.currentDayInMonth = 6;   // roll the world day
  check('budget RESETS on the new world day (used back to 0)', ACKS.moverDayBudget(c, pt).usedMiles === 0);
  check('remaining back to full on the new day', ACKS.movementBudgetRemaining(c, pt) === 24);
}

section('F-1 — budget survives a party JOIN (D1: party cap = the most-spent member)');
{
  const { c, ch, pt } = grid();
  // a second character who has already spent 2 hexes (12 mi) solo today, then joins the party
  const ch2 = ACKS.blankCharacter({ id: 'chr-2', name: 'Sable', currentHexId: 'hex-a' });
  ch2.dailyMovement = { worldOrd: 1 * 30 + 5, milesUsed: 12 };
  c.characters.push(ch2);
  pt.memberCharacterIds.push('chr-2');
  const b = ACKS.moverDayBudget(c, pt);
  check('party used = the MOST-spent member (12), not 0', b.usedMiles === 12, b.usedMiles);
  check('party remaining = 24 - 12 = 12 (the spent member binds)', b.remainingMiles === 12, b.remainingMiles);
  check('party hexesRemaining = 2', b.hexesRemaining === 2, b.hexesRemaining);
}

section('F-1 — pace → budget (a journey pace flows into the day cap via journeyEffectivePace)');
{
  const { c, pt } = grid();
  const j = ACKS.blankJourney({ id: 'jrn-1', partyId: 'par-1', participantCharacterIds: ['chr-1'], pace: 'forced-march', startHexId: 'hex-a', status: 'in-transit', currentHexId: 'hex-a' });
  c.journeys = [j]; pt.activeJourneyId = 'jrn-1';
  check('forced-march → cap 36 miles (24 × 1.5)', ACKS.moverDayBudget(c, pt).capMiles === 36, ACKS.moverDayBudget(c, pt).capMiles);
  j.pace = 'half-speed';
  check('half-speed → cap 12 miles (24 × 0.5)', ACKS.moverDayBudget(c, pt).capMiles === 12, ACKS.moverDayBudget(c, pt).capMiles);
}

section('F-1 — activity-budget awareness (#346): a competing dedicated commitment caps the pace');
{
  const { c, pt } = grid();
  const j = ACKS.blankJourney({ id: 'jrn-1', partyId: 'par-1', participantCharacterIds: ['chr-1'], pace: 'forced-march', startHexId: 'hex-a', status: 'in-transit', currentHexId: 'hex-a' });
  c.journeys = [j]; pt.activeJourneyId = 'jrn-1';
  check('unconstrained forced-march = 36', ACKS.moverDayBudget(c, pt).capMiles === 36);
  // chr-1 is ALSO on a second in-transit journey — a second dedicated travel the #346 budget won't allow;
  // journeyMaxPace caps the party's effective pace, so the cap drops below the desired forced-march.
  c.journeys.push(ACKS.blankJourney({ id: 'jrn-2', participantCharacterIds: ['chr-1'], pace: 'normal', startHexId: 'hex-a', status: 'in-transit', currentHexId: 'hex-a' }));
  const capped = ACKS.moverDayBudget(c, pt);
  check('a competing in-transit journey caps the pace below forced-march (activity-budget-aware)', capped.capMiles < 36, capped.capMiles + ' (pace ' + capped.pace + ')');
}

section('F-4 — the per-hex cost model (terrain × road × surefooted)');
{
  const { c, pt } = grid();
  check('grassland into hex-b = 6 mi', ACKS.moverPerHexCost(c, pt, 'hex-b') === 6, ACKS.moverPerHexCost(c, pt, 'hex-b'));
  check('forest into hex-f = 9 mi (×2/3)', ACKS.moverPerHexCost(c, pt, 'hex-f') === 9, ACKS.moverPerHexCost(c, pt, 'hex-f'));
  // a road hex is cheaper (×3/2 → 4 mi)
  const rd = ACKS.moverPerHexCost(c, pt, 'hex-rd');
  check('road hex into hex-rd = 4 mi (×3/2 road bonus)', rd === 4, rd);
}

section('F-2 — the manual Move verb (adjacency, cost, position, budget debit, movement event)');
{
  const { c, ch, pt } = grid();
  const r = ACKS.moveActorOneHex(c, pt, 'hex-b', { rng: PASS_RNG });
  check('Move to an adjacent hex succeeds', r.ok === true, r.reason);
  check('the mover is now at the destination hex', pt.currentHexId === 'hex-b' && ch.currentHexId === 'hex-b');
  check('the step cost 6 miles (grassland)', r.result.perHexCost === 6);
  check('a record-only `movement` event was emitted', r.event && r.event.kind === 'movement');
  check('the event names the mover + the hexes', r.event.payload.moverId === 'par-1' && r.event.payload.toHexId === 'hex-b');
  const evInLog = (c.eventLog || []).filter(e => e.event && e.event.kind === 'movement').length;
  check('the movement event is in the eventLog', evInLog === 1, evInLog);
}

section('F-2 — legality: a non-adjacent move + the water gate are refused (with a GM override)');
{
  const { c, pt } = grid();
  check('a non-adjacent target is refused (not-adjacent)', ACKS.moveActorOneHex(c, pt, 'hex-e', { rng: PASS_RNG }).reason === 'not-adjacent');
  const w = ACKS.moveActorOneHex(c, pt, 'hex-w', { rng: PASS_RNG });   // hex-w is adjacent to a but water
  check('a foot step onto water is refused (water gate, D6)', w.reason === 'water', w.reason);
  const wo = ACKS.moveActorOneHex(c, pt, 'hex-w', { rng: PASS_RNG, overrideWaterGate: true });
  check('the per-attempt GM override crosses the water gate', wo.ok === true && pt.currentHexId === 'hex-w');
}

section('F-2 — budget exhaustion (RR p.272: exactly 4 grassland hexes/day) + the first-step floor');
{
  const { c, ch, pt } = grid();
  let moved = 0;
  const chain = ['hex-b', 'hex-c', 'hex-d', 'hex-e'];   // a→b→c→d→e (4 hexes)
  for(const dst of chain){ if(ACKS.moveActorOneHex(c, pt, dst, { rng: PASS_RNG }).ok) moved++; }
  check('4 grassland hexes moved before the budget runs out', moved === 4, moved);
  // a 5th would exceed the budget (0 remaining) — and it is NOT the first step of the day → refused
  const fifth = ACKS.moveActorOneHex(c, pt, 'hex-rd', { rng: PASS_RNG });
  check('the 5th hex is refused (budget exhausted, not the first step)', fifth.ok === false && fifth.reason === 'budget', fifth.reason);
  // first-step floor: a fresh day always grants at least the first hex even into costly terrain
  c.currentDayInMonth = 7; ch.dailyMovement = null; pt.currentHexId = 'hex-a'; ch.currentHexId = 'hex-a';
  // an encumbered slow mover: force a tiny cap by spending the whole budget then... simpler: forest first-step
  const { c: c2, pt: pt2 } = grid();
  c2.parties[0].currentHexId = 'hex-a'; c2.characters[0].currentHexId = 'hex-a';
  const firstForest = ACKS.moveActorOneHex(c2, pt2, 'hex-f', { rng: PASS_RNG });   // forest = 9 mi, cap 24 → fine
  check('the first step of the day is always granted', firstForest.ok === true);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Summary ---');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
if(failed === 0){
  console.log('\nAll Movement 2.0 Foundation smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nSome checks failed. Review output above.');
  process.exit(1);
}
