/* Urban investment (paid over time) smoke test — the 500gp/day drip (RR p.353 / p.351 / p.350).
 *
 * Run from "ACKS God Mode/" (or via `npm test`):  node tests/urban-investment.smoke.js
 *
 * RAW: ordering urban investment is a decree whose cost "is immediately paid" by default, but RAW
 * explicitly allows the Judge to "deduct the expense at a rate of 500gp per day" (RR p.353). ACKS God
 * Mode makes that 500gp/day drip THE behaviour (Joachim 2026-06-23 — the tool does the bookkeeping
 * RAW calls "more than its worth"). The committed budget (settlement.investmentBudgetGp) drips out of
 * the treasury at 500gp/day on the Day Clock (the slot-51 'urban-investment' day consumer), raising
 * total investment → cap (RR p.350); and the FAMILIES FOLLOW THE BUILD — 1d10 per 1,000gp actually
 * paid (RR p.351). The immigration is milestone-seeded (the k-th 1,000gp rolls a FIXED 1d10), so the
 * propose/commit halves agree and the result is independent of how the days are chunked.
 */
require('./_engine.js').load();
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail ? '  -- ' + detail : '')); failed++; }
}

// A minimal modelled domain: one hex (domainId), one settlement linked to it (hexId), scalar treasury.
function fixture(opts){
  opts = opts || {};
  const hex = { id: 'hex-1', domainId: 'dom-1', coord: { q: 0, r: 0 } };
  const d = ACKS.blankDomain({ id: 'dom-1', name: 'Tyr' });
  delete d.treasuryStashId;                                   // scalar-treasury path for clean assertions
  d.treasury = { gp: opts.gp != null ? opts.gp : 50000 };
  d.history = [];
  const s = ACKS.blankSettlement({ id: 'set-1', hexId: 'hex-1', name: 'Tyr City',
    families: opts.fam != null ? opts.fam : 200, totalInvestment: opts.inv != null ? opts.inv : 10000 });
  s.investmentBudgetGp = opts.budget != null ? opts.budget : 0;
  const campaign = { name: 'T', seed: 'fixed-seed', domains: [d], hexes: [hex], settlements: [s],
    currentDayInMonth: 1, calendar: { year: 1, month: 1, day: 1 }, currentTurn: 3 };
  return { campaign, d, s };
}
const runDays = (campaign, n) => { ACKS.commitDayTick(campaign, ACKS.proposeDayTick(campaign, n)); };

// --- (0) plumbing: factory fields + day-consumer registration -------------------------------------
{
  const s = ACKS.blankSettlement({});
  check('blankSettlement seeds investmentBudgetGp = 0', s.investmentBudgetGp === 0);
  check('blankSettlement seeds investmentDripPaid = 0', s.investmentDripPaid === 0);
  check("'urban-investment' day consumer registered at order 51",
    ACKS.dayConsumersInOrder().some(c => c.name === 'urban-investment' && c.order === 51));
  check('the immediate applyUrbanInvestment is gone', typeof ACKS.applyUrbanInvestment === 'undefined');
}

// --- (1) the core drip: 500gp/day, families follow per 1,000gp paid --------------------------------
let fam4 = null;
{
  const { campaign, d, s } = fixture({ budget: 5000, gp: 50000, fam: 200, inv: 10000 });
  check('in-flight: a committed budget engages the Day Clock', ACKS.dayTickActivityInFlight(campaign) === true);
  runDays(campaign, 4);                                       // 4 × 500 = 2,000 paid
  check('treasury 50,000 -> 48,000 (500/day × 4)', d.treasury.gp === 48000, 'got ' + d.treasury.gp);
  check('totalInvestment 10,000 -> 12,000', s.totalInvestment === 12000, 'got ' + s.totalInvestment);
  check('investmentDripPaid = 2,000', s.investmentDripPaid === 2000, 'got ' + s.investmentDripPaid);
  check('budget 5,000 -> 3,000 left', s.investmentBudgetGp === 3000, 'got ' + s.investmentBudgetGp);
  // 2,000gp paid crosses milestones 1 & 2 -> two 1d10 rolls -> +2..+20 families
  const gained = s.families - 200;
  check('families grew by two 1d10 rolls (+2..+20)', gained >= 2 && gained <= 20, 'got +' + gained);
  fam4 = s.families;
}

// --- (2) reproducibility + chunk-independence (the milestone-seed guarantee) -----------------------
{
  const r = fixture({ budget: 5000, gp: 50000, fam: 200, inv: 10000 });
  runDays(r.campaign, 4);
  check('reproducible: same fixture + 4 days -> identical families', r.s.families === fam4, fam4 + ' vs ' + r.s.families);

  const r2 = fixture({ budget: 5000, gp: 50000, fam: 200, inv: 10000 });
  for(let i = 0; i < 4; i++) runDays(r2.campaign, 1);        // 4 × (1 day)
  check('chunk-independent: 4×1-day == 1×4-day families', r2.s.families === fam4, fam4 + ' vs ' + r2.s.families);
  check('chunk-independent: same dripPaid', r2.s.investmentDripPaid === 2000, 'got ' + r2.s.investmentDripPaid);
}

// --- (3) the immigration tracks PAID, not committed (stop early -> only what you paid for) ---------
{
  const { campaign, s } = fixture({ budget: 100000, gp: 1500, fam: 200, inv: 10000 });   // treasury < budget
  runDays(campaign, 10);                                      // can only pay 1,500 total before treasury empties
  check('treasury-limited: paid only what the treasury allowed (<= 1,500)', s.investmentDripPaid <= 1500, 'got ' + s.investmentDripPaid);
  check('treasury-limited: never goes negative', campaign.domains[0].treasury.gp >= 0, 'got ' + campaign.domains[0].treasury.gp);
  check('treasury-limited: budget still has the unpaid remainder', s.investmentBudgetGp > 0);
  // families bounded by the 1 milestone the 1,500 paid can cross (+1..+10)
  const gained = s.families - 200;
  check('treasury-limited: at most one milestone of families so far', gained >= 0 && gained <= 10, 'got +' + gained);
}

// --- (4) raising total investment lifts the cap as it pays (RR p.350 tier crossing) ----------------
{
  const { campaign, s } = fixture({ budget: 4000, gp: 50000, fam: 245, inv: 24000 });   // cap@24k = 249
  check('pre: cap is 249 at 24,000 investment', ACKS.urbanMaxFamilies(s.totalInvestment) === 249);
  runDays(campaign, 5);                                       // +2,000 -> inv 26,000 -> cap 499
  check('post: investment crossed the 25,000 tier', s.totalInvestment >= 25000, 'got ' + s.totalInvestment);
  check('post: cap lifted to 499', ACKS.urbanMaxFamilies(s.totalInvestment) === 499);
  check('post: families could grow past the old 249 cap', s.families >= 245);
  check('post: families never exceed the live cap', s.families <= ACKS.urbanMaxFamilies(s.totalInvestment));
}

// --- (5) flush / "complete now": pay the whole budget at once, roll every crossed milestone --------
{
  const { campaign, d, s } = fixture({ budget: 5000, gp: 50000, fam: 200, inv: 10000 });
  const r = ACKS.flushUrbanInvestment(campaign, d, s);
  check('flush returns a result', !!r);
  check('flush paid the whole 5,000', r.paid === 5000, 'got ' + r.paid);
  check('flush leaves 0 budget', r.remaining === 0, 'got ' + r.remaining);
  check('flush: totalInvestment 10,000 -> 15,000', s.totalInvestment === 15000, 'got ' + s.totalInvestment);
  check('flush: treasury 50,000 -> 45,000', d.treasury.gp === 45000, 'got ' + d.treasury.gp);
  check('flush: 5 milestones rolled (+5..+50 families)', r.families >= 5 && r.families <= 50, 'got +' + r.families);
  check('flush: records a completion history entry', d.history.some(h => h.kind === 'urban-investment-complete'));
}

// --- (6) flush == drip-to-completion (same families, the seed is chunk-independent) ---------------
{
  const flushed = fixture({ budget: 3000, gp: 50000, fam: 100, inv: 10000 });
  ACKS.flushUrbanInvestment(flushed.campaign, flushed.d, flushed.s);
  const dripped = fixture({ budget: 3000, gp: 50000, fam: 100, inv: 10000 });
  for(let i = 0; i < 6; i++) runDays(dripped.campaign, 1);
  check('flush families == drip families (milestone seed is path-independent)',
    flushed.s.families === dripped.s.families, flushed.s.families + ' vs ' + dripped.s.families);
}

// --- (7) idle: no budget -> no drip, no mutation --------------------------------------------------
{
  const { campaign, d, s } = fixture({ budget: 0, gp: 50000, fam: 200, inv: 10000 });
  check('no-budget settlement is NOT in flight', ACKS.dayTickActivityInFlight(campaign) === false);
  runDays(campaign, 5);
  check('no-budget: treasury untouched', d.treasury.gp === 50000);
  check('no-budget: families untouched', s.families === 200);
  const calc = ACKS.computeUrbanInvestmentDrip(campaign, d, s, 1);
  check('computeUrbanInvestmentDrip: 0 paid + blockReason when no budget', calc.paid === 0 && calc.blockReason === 'no budget');
}

// --- clanhold urban cap (RR p.353 — urban families ≤ min(249, 12.5% of peasants), defence-in-depth) -----
{
  const { campaign, d, s } = fixture({ budget: 50000, gp: 100000, fam: 0, inv: 30000 });
  d.demographics.peasantFamilies = 200;                       // clanhold cap = min(249, 12.5%·200) = 25
  const ordCap = ACKS.computeUrbanInvestmentDrip(campaign, d, s, 1).cap;   // ordinary: the investment cap (high)
  check('ordinary domain: urban cap is the investment cap (>25 at 30k investment)', ordCap > 25, 'got ' + ordCap);
  d.domainType = 'clanhold';
  const drip = ACKS.computeUrbanInvestmentDrip(campaign, d, s, 1);
  check('clanhold: urban-investment cap clamped to 12.5% of peasants (25)', drip.cap === 25, 'got ' + drip.cap);
}

console.log('\n=============================================');
console.log('urban-investment.smoke.js — Passed: ' + passed + ', Failed: ' + failed);
console.log('=============================================');
if(failed > 0) process.exit(1);
