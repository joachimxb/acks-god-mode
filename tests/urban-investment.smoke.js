/* Urban investment smoke test — ACKS.applyUrbanInvestment (RR p.351 / p.350 / p.353).
 *
 * Run from "ACKS God Mode/" (or via `npm test`):  node tests/urban-investment.smoke.js
 *
 * Locks the RAW-verified IMMEDIATE urban-investment action introduced 2026-06-23 for the domain
 * Investment tab. RAW (verified against ACKS-II-Revised-Rulebook.md): urban investment is an
 * immediate action, NOT a construction project — "the gp cost is immediately paid" (RR p.353
 * Issuing Decrees); for every 1,000gp, 1d10 new urban families immigrate that month (RR p.351,
 * plain 1d10); the spend raises the settlement's total investment, lifting its max-population cap
 * (RR p.350). The function applies ONLY the investment component (no natural increase/decrease —
 * those stay on the monthly turn), so it does not double-count growth.
 */
require('./_engine.js').load();
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail ? '  -- ' + detail : '')); failed++; }
}

function fixture(opts){
  opts = opts || {};
  const c = { name:'T', domains:[], settlements:[], currentTurn: 3 };
  const d = ACKS.blankDomain({ name:'Tyr' });
  delete d.treasuryStashId;                 // force the scalar-treasury path for clean assertions
  d.treasury = { gp: opts.gp != null ? opts.gp : 50000 };
  d.history = [];
  c.domains = [d];
  const s = ACKS.blankSettlement({ name:'Tyr City', families: opts.fam != null ? opts.fam : 200,
                                   totalInvestment: opts.inv != null ? opts.inv : 10000, hexId:'hex-x' });
  c.settlements = [s];
  return { c, d, s };
}

// --- (1) the core RAW math: deterministic rng = 0.5 -> 1+floor(0.5*10)=6 families per 1,000gp ----
{
  const { c, d, s } = fixture();
  const r = ACKS.applyUrbanInvestment(c, d, s, 3000, { rng: () => 0.5 });   // 3 × 6 = 18 immigrants
  check('returns a result object', r && typeof r === 'object', JSON.stringify(r));
  check('immigrants = 18 (3 × 1d10@6)', r.immigrants === 18, 'got ' + r.immigrants);
  check('families 200 -> 218', s.families === 218, 'got ' + s.families);
  check('gained = 18', r.gained === 18, 'got ' + r.gained);
  check('totalInvestment 10,000 -> 13,000 (full amount banked)', s.totalInvestment === 13000, 'got ' + s.totalInvestment);
  check('treasury 50,000 -> 47,000 (debited the spend)', d.treasury.gp === 47000, 'got ' + d.treasury.gp);
  check('not capped (218 < cap 249)', r.capped === false && r.cap === 249, JSON.stringify({capped:r.capped, cap:r.cap}));
  check('history records one urban-investment entry', d.history.length === 1 && d.history[0].kind === 'urban-investment');
  check('history entry carries the numbers', d.history[0].immigrants === 18 && d.history[0].gpSpent === 3000 && d.history[0].familiesAfter === 218);
}

// --- (2) cap clamp (RR p.350): investing lifts the cap THIS action, then clamps to the new cap ----
{
  const { c, d, s } = fixture({ fam: 240, inv: 10000 });
  // invest 1,000 -> totalInvestment 11,000 (cap still 249); rng 0.99 -> 10 immigrants -> 250 -> clamp 249
  const r = ACKS.applyUrbanInvestment(c, d, s, 1000, { rng: () => 0.99 });
  check('cap clamp: families clamped to 249', s.families === 249, 'got ' + s.families);
  check('cap clamp: result.capped = true', r.capped === true);
  check('cap clamp: gained reflects the clamp (240 -> 249 = 9, not 10)', r.gained === 9, 'got ' + r.gained);
}

// --- (3) crossing a cap TIER raises the ceiling so the families are NOT clamped ------------------
{
  // 480 fam at 24,000 inv (cap 249 would already be exceeded — use 240 fam to stay legal first),
  // then invest 1,000 to cross 25,000 -> cap jumps to 499, so growth is uncapped.
  const { c, d, s } = fixture({ fam: 245, inv: 24500 });
  const r = ACKS.applyUrbanInvestment(c, d, s, 1000, { rng: () => 0.5 });   // +6 -> 251; inv 25,500 -> cap 499
  check('tier crossing: totalInvestment 24,500 -> 25,500', s.totalInvestment === 25500, 'got ' + s.totalInvestment);
  check('tier crossing: cap is now 499', r.cap === 499, 'got ' + r.cap);
  check('tier crossing: 245 + 6 = 251, uncapped', s.families === 251 && r.capped === false, 'got ' + s.families);
}

// --- (4) sub-1,000 spend: 0 families immigrate but the full amount still banks toward the cap -----
{
  const { c, d, s } = fixture({ fam: 100, inv: 10000 });
  const r = ACKS.applyUrbanInvestment(c, d, s, 500, { rng: () => 0.5 });
  check('sub-1,000: 0 immigrants', r.immigrants === 0 && s.families === 100, 'got ' + s.families);
  check('sub-1,000: totalInvestment still rises by 500', s.totalInvestment === 10500, 'got ' + s.totalInvestment);
  check('sub-1,000: treasury debited 500', d.treasury.gp === 49500, 'got ' + d.treasury.gp);
}

// --- (5) guards: non-positive / bad args return null and mutate nothing --------------------------
{
  const { c, d, s } = fixture();
  const snap = { fam: s.families, inv: s.totalInvestment, gp: d.treasury.gp };
  check('zero spend -> null', ACKS.applyUrbanInvestment(c, d, s, 0, {}) === null);
  check('negative spend -> null', ACKS.applyUrbanInvestment(c, d, s, -1000, {}) === null);
  check('missing settlement -> null', ACKS.applyUrbanInvestment(c, d, null, 1000, {}) === null);
  check('guards mutated nothing', s.families === snap.fam && s.totalInvestment === snap.inv && d.treasury.gp === snap.gp);
}

// --- (6) RAW is plain 1d10 (1..10), NOT exploding — bounds over many random rolls ----------------
{
  let lo = 99, hi = -99;
  for(let i = 0; i < 2000; i++){
    const { c, d, s } = fixture({ fam: 0, inv: 2500000 });   // huge cap so nothing clamps
    const r = ACKS.applyUrbanInvestment(c, d, s, 1000, {});   // one 1d10
    lo = Math.min(lo, r.immigrants); hi = Math.max(hi, r.immigrants);
  }
  check('1d10 per 1,000gp stays within [1,10] (plain, not exploding)', lo >= 1 && hi <= 10, 'observed [' + lo + ',' + hi + ']');
  check('1d10 actually spans the range (saw 1 and 10)', lo === 1 && hi === 10, 'observed [' + lo + ',' + hi + ']');
}

// --- (7) the RR p.350 investment->cap tiers the function relies on -------------------------------
{
  check('cap tier <10,000 = 0', ACKS.urbanMaxFamilies(9999) === 0, 'got ' + ACKS.urbanMaxFamilies(9999));
  check('cap tier 10,000 = 249', ACKS.urbanMaxFamilies(10000) === 249);
  check('cap tier 25,000 = 499', ACKS.urbanMaxFamilies(25000) === 499);
  check('cap tier 75,000 = 2,499', ACKS.urbanMaxFamilies(75000) === 2499);
}

console.log('\n=============================================');
console.log('urban-investment.smoke.js — Passed: ' + passed + ', Failed: ' + failed);
console.log('=============================================');
if(failed > 0) process.exit(1);
