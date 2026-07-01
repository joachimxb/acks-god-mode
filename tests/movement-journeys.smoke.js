/* Movement 2.0 — Lane B (Journeys autopilot) smoke test.
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/movement-journeys.smoke.js
 *
 * Lane B is UI (domain-app-journeys.js + index.html) over the AS-BUILT Foundation engine. This suite
 * locks the ENGINE CONTRACT the Lane-B advance controls + pause tickbox + drag panel depend on — the
 * exact behaviours the buttons call — so a future engine change that would break the UI fails here:
 *   ▶ One hex        = advanceJourneyOneHex(…, { ignorePaused:true })   (a deliberate hand-step; overrides a pause)
 *   ⏩ The day        = advanceJourneyDay(…, {})                          (refuses a paused journey)
 *   ⏭ To destination = advanceJourneyToDestination(…, {})               (refuses a paused journey; fast-forward)
 *   the readout      = moverDayBudget(…).hexesRemaining                  (drives the "≈ N hexes left today" + budget-spent gating)
 *   the drag panel   = startJourney → ensureTravelParty (D9)            (the Traveling column IS the ephemeral party)
 * The per-hex mechanics themselves are covered by movement.smoke.js (the Foundation primitive); this
 * suite is the Lane-B-facing contract only. UI-only: no engine edit, no new rule/event/entity/slot.
 *
 * Authored 2026-07-01 (Movement 2.0 TS1, Lane B).
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

// A straight authored grassland row hex-0..hex-N + a started party journey along it (mirrors movement.smoke).
function journeyGrid(n){
  const c = ACKS.blankCampaign({ name: 'lanebgrid' });
  c.currentTurn = 1; c.currentDayInMonth = 5; c.calendar = { year: 1, month: 1, day: 5 };
  c.hexes = [];
  for(let i = 0; i <= n; i++) c.hexes.push(ACKS.blankHex({ id: 'hex-' + i, coord: { q: i, r: 0 }, terrain: 'grassland' }));
  const ch = ACKS.blankCharacter({ id: 'chr-1', currentHexId: 'hex-0' });
  c.characters = [ch];
  const pt = ACKS.blankParty({ id: 'par-1', memberCharacterIds: ['chr-1'], currentHexId: 'hex-0' });
  c.parties = [pt];
  const j = ACKS.blankJourney({ id: 'jrn-1', partyId: 'par-1', participantCharacterIds: ['chr-1'], startHexId: 'hex-0', destinationHexId: 'hex-' + n, status: 'planning', currentHexId: 'hex-0', pace: 'normal' });
  c.journeys = [j];
  ACKS.startJourney(c, j);
  return { c, j, pt, ch };
}

section('the Foundation advance verbs the Lane-B buttons call are all exported');
{
  check('advanceJourneyOneHex present (▶ One hex)', typeof ACKS.advanceJourneyOneHex === 'function');
  check('advanceJourneyDay present (⏩ The day)', typeof ACKS.advanceJourneyDay === 'function');
  check('advanceJourneyToDestination present (⏭ To destination)', typeof ACKS.advanceJourneyToDestination === 'function');
  check('moverDayBudget present (the hexes-left readout)', typeof ACKS.moverDayBudget === 'function');
  check('ensureTravelParty present (the drag panel D9 party)', typeof ACKS.ensureTravelParty === 'function');
}

section('▶ One hex — advances a people-journey one hex directly (not delegated to whole-day)');
{
  const { c, j } = journeyGrid(8);
  const r = ACKS.advanceJourneyOneHex(c, j, { ignorePaused: true, rng: PASS_RNG });
  check('one hex stepped', r.ok && r.stepped === true && r.toHexId === 'hex-1', JSON.stringify(r));
  check('the per-hex path handled it (not delegated to the whole-day resolver)', !r.delegated);
  check('the journey moved to the next hex', j.currentHexId === 'hex-1');
}

section('the hexes-left readout — moverDayBudget(journey) drives "≈ N hexes left today" + the budget-spent gate');
{
  const { c, j } = journeyGrid(11);
  const b0 = ACKS.moverDayBudget(c, j);
  check('a fresh in-transit journey reports 4 grassland hexes left (RR p.272)', b0.hexesRemaining === 4, b0.hexesRemaining);
  check('the budget is NOT spent at the start of a day', b0.hexesRemaining > 0);
  ACKS.advanceJourneyDay(c, j, { rng: PASS_RNG });   // spend the whole day (4 hexes)
  const b1 = ACKS.moverDayBudget(c, j);
  check('after ⏩ the day, 0 hexes remain (the ▶/⏩ budget-spent gate fires)', b1.hexesRemaining === 0, b1.hexesRemaining);
  // the UI greys ▶/⏩ here; the engine confirms a further step won't move (reason budget)
  const again = ACKS.advanceJourneyOneHex(c, j, { ignorePaused: true, rng: PASS_RNG });
  check('a further ▶ on a spent day does not move (reason budget)', again.stepped !== true && again.reason === 'budget', JSON.stringify(again));
}

section('the pause contract — ⏩/⏭ REFUSE a held journey; ▶ (ignorePaused) OVERRIDES it (the hand-step)');
{
  const { c, j } = journeyGrid(8);
  j.paused = true;
  // ⏩ The day + ⏭ To destination call the engine WITHOUT ignorePaused → they must refuse.
  check('⏩ The day refuses a paused journey', ACKS.advanceJourneyDay(c, j, { rng: PASS_RNG }).reason === 'paused');
  check('the journey did not move under ⏩', j.currentHexId === 'hex-0');
  const dest = ACKS.advanceJourneyToDestination(c, j, { rng: PASS_RNG });
  check('⏭ To destination refuses + halts a paused journey', dest.reason === 'paused' && dest.halted === true, JSON.stringify(dest));
  check('the journey did not move under ⏭', j.currentHexId === 'hex-0');
  // ▶ One hex passes ignorePaused → a deliberate hand-step overrides the hold (act-each-hex workflow).
  const hand = ACKS.advanceJourneyOneHex(c, j, { ignorePaused: true, rng: PASS_RNG });
  check('▶ One hex (ignorePaused) steps a HELD journey', hand.ok && hand.stepped === true && j.currentHexId === 'hex-1', JSON.stringify(hand));
  check('the journey stays held after a hand-step (paused flag untouched)', j.paused === true);
}

section('⏭ To destination — a per-journey fast-forward that does NOT move the campaign Day Clock');
{
  const { c, j } = journeyGrid(11);
  const day0 = c.currentDayInMonth, turn0 = c.currentTurn;
  const r = ACKS.advanceJourneyToDestination(c, j, { rng: PASS_RNG });
  check('the journey arrived', r.arrived === true && j.status === 'arrived');
  check('the campaign Day Clock is unchanged by the fast-forward', c.currentDayInMonth === day0 && c.currentTurn === turn0);
  check('the party reached the destination hex', j.currentHexId === 'hex-11');
}

section('the drag panel premise (D9) — starting a multi-traveller journey forms the ephemeral "Traveling" party');
{
  const c = ACKS.blankCampaign({ name: 'laneb-d9' });
  c.currentTurn = 1; c.currentDayInMonth = 5; c.calendar = { year: 1, month: 1, day: 5 };
  c.hexes = [ACKS.blankHex({ id: 'h0', coord: { q: 0, r: 0 }, terrain: 'grassland' }), ACKS.blankHex({ id: 'h1', coord: { q: 1, r: 0 }, terrain: 'grassland' })];
  c.characters = [ACKS.blankCharacter({ id: 'chr-1', currentHexId: 'h0' }), ACKS.blankCharacter({ id: 'chr-2', currentHexId: 'h0' })];
  // the wizard's Traveling column = journey.participantCharacterIds; on Start, startJourney → ensureTravelParty.
  const j = ACKS.blankJourney({ id: 'jrn-1', participantCharacterIds: ['chr-1', 'chr-2'], startHexId: 'h0', destinationHexId: 'h1', status: 'planning' });
  c.journeys = [j];
  ACKS.startJourney(c, j);
  check('an ephemeral party was formed from the two loose travellers', !!j.partyId && (c.parties || []).length === 1 && c.parties[0].autoFormed === true);
  check('the drag "Traveling" set became the party membership', c.parties[0].memberCharacterIds.length === 2);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Summary ---');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
if(failed === 0){
  console.log('\nAll Movement 2.0 Lane B (Journeys autopilot) smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nSome checks failed. Review output above.');
  process.exit(1);
}
