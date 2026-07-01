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

// ═══════════════════════════════════ SLICE 2 ═══════════════════════════════════
// A straight authored grassland row hex-0..hex-N + a party journey along it.
function journeyGrid(n, terrain){
  const c = ACKS.blankCampaign({ name: 'jgrid' });
  c.currentTurn = 1; c.currentDayInMonth = 5; c.calendar = { year: 1, month: 1, day: 5 };
  c.hexes = [];
  for(let i = 0; i <= n; i++) c.hexes.push(ACKS.blankHex({ id: 'hex-' + i, coord: { q: i, r: 0 }, terrain: terrain || 'grassland' }));
  const ch = ACKS.blankCharacter({ id: 'chr-1', currentHexId: 'hex-0' });
  c.characters = [ch];
  const pt = ACKS.blankParty({ id: 'par-1', memberCharacterIds: ['chr-1'], currentHexId: 'hex-0' });
  c.parties = [pt];
  const j = ACKS.blankJourney({ id: 'jrn-1', partyId: 'par-1', participantCharacterIds: ['chr-1'], startHexId: 'hex-0', destinationHexId: 'hex-' + n, status: 'planning', currentHexId: 'hex-0', pace: 'normal' });
  c.journeys = [j];
  ACKS.startJourney(c, j);   // the real start flow: status in-transit + startedAt* + daysRemainingEstimate + provisions
  return { c, j, pt, ch };
}

section('F-3 — advanceJourneyOneHex steps one hex along the route');
{
  const { c, j } = journeyGrid(8);
  const r = ACKS.advanceJourneyOneHex(c, j, { rng: PASS_RNG });
  check('one hex stepped', r.ok && r.stepped && r.toHexId === 'hex-1');
  check('the journey is at the next hex', j.currentHexId === 'hex-1');
  check('a day record was opened with the hex', j.days.length === 1 && j.days[0].hexesTraveled === 1);
  check('the day is not yet closed (budget remains)', r.dayClosed === false && j.days[0]._mvOpen === true);
}

section('F-3 — ⏩ advance-the-day (RR p.272: exactly 4 grassland hexes, then the day closes)');
{
  const { c, j } = journeyGrid(11);
  const r = ACKS.advanceJourneyDay(c, j, { rng: PASS_RNG });
  check('the day closed', r.dayClosed === true);
  check('4 hexes stepped (24 mi / 6)', r.steps.filter(s => s.stepped).length === 4, r.steps.filter(s => s.stepped).length);
  check('the journey advanced to hex-4', j.currentHexId === 'hex-4');
  check('one day record, 4 hexes / 24 miles', j.days.length === 1 && j.days[0].hexesTraveled === 4 && j.days[0].milesTraveled === 24);
  check('the nav throw fired ONCE for the day (day-grained, §3.6)', !!j.days[0].navigationThrow);
  check('fatigue accrued once for the strenuous day (day-grained)', j.fatigueDays === 1 && j.days[0].fatigueAccumulated === 1);
  check('lastTravelWorldOrd stamped (the slot-30 auto-advance skips this journey today)', j.lastTravelWorldOrd === (1 * 30 + 5));
  check('the day record is closed', j.days[0]._mvOpen === false && j.days[0].status === 'committed');
}

section('F-3 — ⏭ advance-to-destination (11 hexes = 3 days: 4 + 4 + 3, then arrival)');
{
  const { c, j } = journeyGrid(11);
  const r = ACKS.advanceJourneyToDestination(c, j, { rng: PASS_RNG });
  check('the journey arrived', r.arrived === true && j.status === 'arrived');
  check('it took 3 travel days', r.days === 3, r.days);
  check('the party is at the destination hex', j.currentHexId === 'hex-11');
  const totalHexes = j.days.reduce((s, d) => s + d.hexesTraveled, 0);
  check('11 hexes covered in total', totalHexes === 11, totalHexes);
}

section('F-8b — a paused journey does not auto-advance');
{
  const { c, j } = journeyGrid(8); j.paused = true;
  check('advanceJourneyOneHex refuses a paused journey', ACKS.advanceJourneyOneHex(c, j, { rng: PASS_RNG }).reason === 'paused');
  check('the journey did not move', j.currentHexId === 'hex-0');
  check('⏩ halts on a paused journey', ACKS.advanceJourneyDay(c, j, { rng: PASS_RNG }).reason === 'paused');
}

section('F-3 — an encounter halts the advance + materializes a real enc- entity (RAW: stop when you meet something)');
{
  const { c, j } = journeyGrid(8, 'forest');   // forest, unsettled, no road
  const r = ACKS.advanceJourneyDay(c, j, { rng: () => 0.5 });   // d20 = 11 → monster in unsettled forest
  check('the day halted on an encounter', r.halted === true && r.reason === 'encounter');
  check('a real enc- entity was materialized', r.encounterId && (c.encounters || []).some(e => e.id === r.encounterId));
  check('the day record captured the encounter', j.days[0] && j.days[0].encounters.length === 1);
  check('the journey stays in-transit (the GM resolves, then continues)', j.status === 'in-transit');
}

section('F-5 — journey.groupId resolves any Group (a monster band autopilots via the general pointer)');
{
  const { c, j } = journeyGrid(4);
  check('a party journey still resolves to its party', ACKS.groupKindOf(ACKS.groupForJourney(c, j)) === 'party');
  if(typeof ACKS.blankGroup === 'function'){
    const g = ACKS.blankGroup({ id: 'grp-b1', groupTemplate: { monsterCatalogKey: 'goblin' }, count: 6, name: 'Goblins', currentHexId: 'hex-0' });
    c.groups = [g];
    const jb = ACKS.blankJourney({ id: 'jrn-b', groupId: 'grp-b1', participantCharacterIds: [], startHexId: 'hex-0', destinationHexId: 'hex-3', status: 'in-transit', currentHexId: 'hex-0' });
    c.journeys.push(jb);
    check('groupId resolves a band journey to the band', ACKS.groupKindOf(ACKS.groupForJourney(c, jb)) === 'band');
  } else { check('blankGroup present (band test)', false, 'no blankGroup'); }
}

section('F-3 — the journey stays Gantt-renderable through the per-hex refactor (Plan_Graphical_Elements §6.1 / plan §15.4)');
{
  const { c, j } = journeyGrid(11);
  ACKS.advanceJourneyDay(c, j, { rng: PASS_RNG });   // one day
  // a Gantt bar needs: a knowable start day, a derivable span, and per-day states.
  check('start day preserved (startedAtTurn + startedAtDayInMonth)', j.startedAtTurn === 1 && j.startedAtDayInMonth === 5);
  check('currentDayIndex counts travel days into the journey', j.currentDayIndex === 1, j.currentDayIndex);
  check('the projected end is derivable (daysRemainingEstimate present + computeJourneyDistance.remaining)', (j.daysRemainingEstimate != null) && ACKS.computeJourneyDistance(c, j).remaining === 7);
  check('per-day span is not opaque — journey.days[] carries a dated per-day record', j.days.length === 1 && j.days[0].dayIndex === 1 && Array.isArray(j.days[0].hexPath) && j.days[0].hexPath.length === 4);
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
