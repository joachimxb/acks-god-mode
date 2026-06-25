/* Deficit → banditry consequence smoke test (I2, audit 2026-06-24 Lane I).
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/deficit-banditry.smoke.js
 *
 * Proves the RR p.349 unpaid-garrison consequence: a domain that ENDS a month insolvent
 * (treasury < 0) could not pay its garrison, so its garrison expenditure fell below the required
 * rate. Its NEXT monthly morale roll therefore takes a penalty that deepens −1 per consecutive
 * insolvent month to −4, and resets the first solvent month. Sustained insolvency drives morale
 * down (incomeFactor collapses income; bandits rise per RR p.351 — banditry is core RAW, no rule)
 * — so a bleeding treasury finally CREATES something instead of being a number that falls forever.
 * RAW core (no house rule). Trigger is treasury SIGN, not monthly net: a wealthy domain absorbing a
 * small deficit from reserves stays solvent and takes no hit until the reserves run dry. Authored
 * 2026-06-25.
 *
 *   (a) moraleModifiersFor reads d.unpaidGarrisonMonths → the penalty row (value + the −4 cap).
 *   (b) commitTurn sets / escalates / resets the counter, and gates on the domain having peasants.
 *   (c) end-to-end: a sustained forced deficit spirals a demo domain's morale to ≤ −2 (the banditry
 *       threshold) and yields banditCount > 0 — the full insolvency → morale → banditry chain.
 */
const path = require('path');
require('./_engine.js').load();
require(path.join(__dirname, '..', 'acks-demo-template.js'));
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){ if(cond){ passed++; } else { console.log('  FAIL ' + label + (detail ? '  -- ' + detail : '')); failed++; } }
// deterministic rng (mulberry32) — same generator the economy smoke uses for headless turns.
function makeRng(seed){ let s = seed >>> 0; return function(){ s = (s + 0x6D2B79F5)|0; let t = Math.imul(s ^ (s>>>15), 1|s); t = (t + Math.imul(t ^ (t>>>7), 61|t)) ^ t; return ((t ^ (t>>>14))>>>0)/4294967296; }; }

// ── synthetic helpers (mirror tests/economy.smoke.js) ───────────────────────
function mkCampaign(domain){ const c = { schemaVersion:2, currentTurn:1, houseRules:{}, domains:[domain], characters:[], settlements:[], hexes:[], rumors:[] }; ACKS.liftToTopLevelCollections(c); return c; }
function mkDomain(over){
  return Object.assign({
    id:'dom-test', name:'Testmark', liegeId:null, rulerCharacterId:null, administersThisMonth:false, classification:'Civilized',
    demographics:{ peasantFamilies:100, urbanFamilies:0, morale:0 },
    income:{ serviceRevenuePerFamily:4, taxPerFamily:2, landRevenuePerFamily:6, tariffs:0, miscPerFamily:0, miscFlat:0, tributesIn:[], other:[] },
    taxPolicy:{ rate:'standard' },
    expenses:{ liturgyPerFamily:1, tithePaid:true, miscPerFamily:0, miscFlat:0, tributePaid:true, tributeAuto:true, tributeToLiege:0, tithesOut:[] },
    geography:{ hexes:[], controlledHexes:0 },
    garrison:{ units:[] }, stronghold:{ buildValue:0, components:[] }, magistrates:{}
  }, over || {});
}

// ── buildDemoCampaign — the full valid load shape (copied from tests/economy.smoke.js so commitTurn's
// whole pipeline runs). living-expenses + F&D auto-roll disabled so the treasury moves only by the
// economy + our forced deficit (the same isolation economy.smoke uses). ─────────────────────────────
function buildDemoCampaign(){
  let camp = JSON.parse(JSON.stringify(global.ACKS_DEMO_TEMPLATE));
  const m = ACKS.migrateCampaign(camp); if(m) camp = m;
  if(!Array.isArray(camp.domains))       camp.domains = [];
  if(!Array.isArray(camp.pendingEvents)) camp.pendingEvents = [];
  if(!Array.isArray(camp.eventLog))      camp.eventLog = [];
  if(!Array.isArray(camp.hexes))         camp.hexes = [];
  if(!Array.isArray(camp.settlements))   camp.settlements = [];
  if(!Array.isArray(camp.rumors))        camp.rumors = [];
  const ds = camp.domains;
  ACKS.migratePendingPlayerInputToEvents(camp);
  ds.forEach(d => ACKS.migrateStrongholdToComponents(d));
  ds.forEach(d => (d.geography && d.geography.hexes || []).forEach(h => ACKS.migrateHexToAccumulatedImprovement(h)));
  ds.forEach(d => (d.geography && d.geography.hexes || []).forEach(h => ACKS.migrateHexToMultiSupervisor(h)));
  ds.forEach(d => ACKS.ensureMagistratesShape(d));
  const liftSynth = { domains: ds, hexes: camp.hexes, settlements: camp.settlements, rumors: camp.rumors };
  ACKS.liftToTopLevelCollections(liftSynth);
  camp.hexes = liftSynth.hexes; camp.settlements = liftSynth.settlements; camp.rumors = liftSynth.rumors;
  ACKS.migrateAgriculturalToProjects(camp);
  camp.houseRules = camp.houseRules || {};
  camp.houseRules['living-expenses'] = { enabled: false };
  camp.houseRules['favor-duty-auto-roll'] = { enabled: false };
  if(ACKS.stripHexSettlementMirrors) ACKS.stripHexSettlementMirrors(camp);
  return camp;
}
function freshDemoDom(){ const c = buildDemoCampaign(); return { c, d: c.domains[0] }; }

console.log('--- Engine surface ---');
['moraleModifiersFor','proposeMonthlyTurn','commitTurn','banditCount','_applyDomainTreasuryDelta']
  .forEach(fn => check('ACKS.' + fn + ' is a function', typeof ACKS[fn] === 'function', 'got ' + typeof ACKS[fn]));

console.log('--- (a) moraleModifiersFor reads unpaidGarrisonMonths (RR p.349 unpaid garrison) ---');
const insRow = (months) => { const d = mkDomain({ unpaidGarrisonMonths: months }); return ACKS.moraleModifiersFor(mkCampaign(d), d).find(r => /insolvent/i.test(r.label)); };
check('counter 0 → no insolvency row', !insRow(0));
check('counter 1 → row value -1', insRow(1) && insRow(1).value === -1, insRow(1) && ('got ' + insRow(1).value));
check('counter 3 → row value -3', insRow(3) && insRow(3).value === -3, insRow(3) && ('got ' + insRow(3).value));
check('counter 7 → capped at -4', insRow(7) && insRow(7).value === -4, insRow(7) && ('got ' + insRow(7).value));
check('absent counter → no insolvency row', !ACKS.moraleModifiersFor(mkCampaign(mkDomain({})), mkDomain({})).find(r => /insolvent/i.test(r.label)));

console.log('--- (b) commitTurn: set / escalate / reset / peasant-gate ---');
// Force a deep deficit via miscFlat (read by expenseBreakdown) so the domain ends insolvent.
{
  const { c, d } = freshDemoDom();
  d.expenses.miscFlat = 9999999;            // expenses ≫ income → net ≪ 0
  ACKS.commitTurn(c, ACKS.proposeMonthlyTurn(c, { rng: makeRng(7) }), { rng: makeRng(7) });
  check('insolvent month → treasury < 0', (d.treasury.gp || 0) < 0, 'treasury ' + (d.treasury && d.treasury.gp));
  check('insolvent month → unpaidGarrisonMonths = 1', d.unpaidGarrisonMonths === 1, 'got ' + d.unpaidGarrisonMonths);
  // the penalty now flows into the NEXT proposal's moraleMods for this domain
  const p2 = ACKS.proposeMonthlyTurn(c, { rng: makeRng(7) });
  const row = ((p2.turnProposal.find(p => p.domainId === d.id) || {}).moraleMods || []).find(r => /insolvent/i.test(r.label));
  check('next proposal carries the insolvency morale row (-1)', row && row.value === -1, row && ('got ' + JSON.stringify(row)));
  ACKS.commitTurn(c, p2, { rng: makeRng(7) });
  check('second insolvent month → counter escalates to 2', d.unpaidGarrisonMonths === 2, 'got ' + d.unpaidGarrisonMonths);
}
// reset on solvency
{
  const { c, d } = freshDemoDom();
  d.expenses.miscFlat = 9999999;
  ACKS.commitTurn(c, ACKS.proposeMonthlyTurn(c, { rng: makeRng(3) }), { rng: makeRng(3) });
  check('pre-reset: counter is set', (d.unpaidGarrisonMonths || 0) >= 1, 'got ' + d.unpaidGarrisonMonths);
  d.expenses.miscFlat = 0;                                                  // restore solvency …
  ACKS._applyDomainTreasuryDelta(c, d, 20000000, { reason: 'test-topup' }); // … and top up reserves
  ACKS.commitTurn(c, ACKS.proposeMonthlyTurn(c, { rng: makeRng(3) }), { rng: makeRng(3) });
  check('solvent month → treasury ≥ 0', (d.treasury.gp || 0) >= 0, 'treasury ' + (d.treasury && d.treasury.gp));
  check('solvent month → counter resets to 0', (d.unpaidGarrisonMonths || 0) === 0, 'got ' + d.unpaidGarrisonMonths);
}
// peasant gate: a populace-less domain takes no unpaid-GARRISON hit even when insolvent
{
  const { c, d } = freshDemoDom();
  d.demographics.peasantFamilies = 0;
  d.expenses.miscFlat = 9999999;
  ACKS.commitTurn(c, ACKS.proposeMonthlyTurn(c, { rng: makeRng(5) }), { rng: makeRng(5) });
  check('0-peasant domain insolvent → counter NOT set', !(d.unpaidGarrisonMonths > 0), 'got ' + d.unpaidGarrisonMonths);
}

console.log('--- (c) end-to-end: sustained deficit spirals morale into banditry (RR p.351) ---');
{
  const c = buildDemoCampaign();   // banditry is core RAW now — no house rule to enable
  const d = c.domains[0];
  d.expenses.miscFlat = 9999999;                                 // perpetual insolvency
  const startMorale = d.demographics.morale;
  let counterCapHit = false;
  for(let i = 0; i < 12; i++){
    ACKS.commitTurn(c, ACKS.proposeMonthlyTurn(c, { rng: makeRng(100 + i) }), { rng: makeRng(100 + i) });
    if((d.unpaidGarrisonMonths || 0) === 4) counterCapHit = true;
  }
  check('counter caps at 4 under sustained insolvency', counterCapHit && d.unpaidGarrisonMonths === 4, 'got ' + d.unpaidGarrisonMonths);
  check('sustained deficit drives morale below its start', d.demographics.morale < startMorale, startMorale + ' → ' + d.demographics.morale);
  check('morale spirals to ≤ -2 (the banditry threshold)', d.demographics.morale <= -2, 'morale ' + d.demographics.morale);
  check('a bleeding treasury now CREATES bandits (banditCount > 0)', ACKS.banditCount(d) > 0, 'banditCount ' + ACKS.banditCount(d));
}

console.log('');
console.log(passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
