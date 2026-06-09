/* Wave Construction-B smoke test — agricultural-improvement on the unified Project model.
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/agricultural-projects.smoke.js
 *
 * Purpose (per _HANDOFF_Wave_Construction_B.md):
 *   1. ZERO-DRIFT ORACLE (the hard requirement). The agricultural land-value math
 *      (treasury debit + landImprovementInvested accumulation + ratchet to
 *      landImprovementBonus) must be byte-identical before and after the refactor.
 *      We drive the REAL commitTurn across K monthly cycles with hand-built
 *      agriculturalOrders and assert every hex's {bonus, invested} and the domain
 *      treasury against an INDEPENDENT reference implementation of the ratchet/clip
 *      logic. If the engine ever drifts from the reference, this fails.
 *   2. RATCHET UNIT SWEEP — ratchetAgriculturalImprovement in isolation.
 *   3. PROJECT MIRROR (feature-gated) — after the refactor, each in-progress hex has a
 *      matching agricultural-improvement Project with the right gpSpent + lifecycleState,
 *      and construction-progress events are recorded with a context envelope.
 *   4. MIGRATION (feature-gated) — migrateAgriculturalToProjects backfills Projects from
 *      campaign.hexes; idempotent.
 *   5. DAY-TICK BRANCH (feature-gated) — proposeConstructionDay treats agricultural as a
 *      monthly-cadence no-op (per-day delta 0), not a worker-cf project.
 *   6. CALENDAR INTEGRATION (feature-gated) — a commitTurn WITH a calendar runs
 *      runDayTickToMonthEnd internally; confirm it does not corrupt the ag Project.
 *
 * Sections 1-2 must pass against the CURRENT engine (they lock the baseline). Sections
 * 3-6 light up as the Wave-B engine work lands; they are guarded so the suite stays green
 * at every commit.
 *
 * Authored 2026-05-31 (Wave Construction-B, test-first).
 */

const path = require('path');
[
  'acks-engine-catalogs.js', 'acks-engine-monsters.js',
  'acks-engine.js',
  'acks-engine-entities.js',
  'acks-engine-economy.js',
  'acks-engine-entity-registry.js',
  'acks-engine-field-schemas.js',
  'acks-engine-events.js',
  'acks-engine-subsystems.js',
].forEach(f => require(path.join(__dirname, '..', f)));
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail ? '  -- ' + detail : '')); failed++; }
}

const COST = 25000;   // AGRICULTURAL_IMPROVEMENT_COST_PER_STEP
const MAXB = 3;       // AGRICULTURAL_IMPROVEMENT_MAX_BONUS
const VCAP = 9;       // AGRICULTURAL_IMPROVEMENT_VALUE_CAP

check('engine constants match test constants',
  ACKS.AGRICULTURAL_IMPROVEMENT_COST_PER_STEP === COST &&
  ACKS.AGRICULTURAL_IMPROVEMENT_MAX_BONUS === MAXB &&
  ACKS.AGRICULTURAL_IMPROVEMENT_VALUE_CAP === VCAP,
  'engine: ' + ACKS.AGRICULTURAL_IMPROVEMENT_COST_PER_STEP + '/' + ACKS.AGRICULTURAL_IMPROVEMENT_MAX_BONUS + '/' + ACKS.AGRICULTURAL_IMPROVEMENT_VALUE_CAP);

// ─────────────────────────────────────────────────────────────────────────────
// Reference model — an INDEPENDENT reimplementation of the engine's agricultural
// commit math (ag block in commitTurn + ratchetAgriculturalImprovement). The oracle
// asserts the engine matches this. realistic-construction OFF => labor cap is Infinity.
// ─────────────────────────────────────────────────────────────────────────────
function refApplyAgOrder(refHex, gpAmount, treasuryRef){
  gpAmount = Math.max(0, Number(gpAmount) || 0);
  if(gpAmount === 0) return 0;
  const base = refHex.base;
  if(refHex.bonus >= MAXB) return 0;
  if(base + refHex.bonus >= VCAP) return 0;
  const affordable = Math.min(gpAmount, Math.max(0, treasuryRef.gp));
  if(affordable <= 0) return 0;
  treasuryRef.gp -= affordable;
  refHex.invested += affordable;
  // ratchet
  while(refHex.invested >= COST && refHex.bonus < MAXB && base + refHex.bonus < VCAP){
    refHex.bonus += 1;
    refHex.invested -= COST;
  }
  if(refHex.bonus >= MAXB || base + refHex.bonus >= VCAP){ refHex.invested = 0; }
  return affordable;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture builders
// ─────────────────────────────────────────────────────────────────────────────
// (The `mockHelpers` callback bag was removed 2026-06-06 — audit batch 3 lifted the economy into the
// engine, so commitTurn(campaign, proposal) computes everything internally. This suite deliberately
// ISOLATES the agricultural-construction block: every buildProposal row carries empty income / expenses
// / moraleMods, so the monthly net is 0 and the only treasury movement is the ag spend — matching the
// independent reference. The full income/expense/morale RAW math is covered by tests/economy.smoke.js.
// Construction mode is now set per-campaign via houseRules: buildOracleCampaign turns 'abstract-
// construction' ON for the instant oracle; the realistic/timed tests use blankCampaign's empty
// houseRules (abstract off ⇒ realistic).)

// Build a synthetic single-domain campaign with hand-placed hexes. No calendar (keeps
// the economic oracle deterministic — calendar/day-tick is exercised separately below).
function buildOracleCampaign(hexSpecs){
  const campaign = ACKS.blankCampaign({ name: 'Ag oracle' });
  // Oracle guards the legacy INSTANT economic math -> opt into the abstract path (post-flip the
  // engine's proposeConstructionDay reads this flag too, so Section 6's calendar run stays instant).
  campaign.houseRules = { 'abstract-construction': { enabled: true } };
  campaign.projects = campaign.projects || [];
  const domain = ACKS.blankDomain({ name: 'Ag March' });
  domain.treasury = { gp: 1000000 };
  domain.demographics = { peasantFamilies: 1000, urbanFamilies: 0, morale: 0, moraleNotes: '' };
  domain.geography = domain.geography || {};
  domain.geography.hexes = hexSpecs.map((spec, i) => {
    const h = ACKS.blankHex({ id: 'hex-ag-' + i, coord: { q: i, r: 0 } });
    h.valuePerFamily = spec.base;
    h.landImprovementBonus = spec.bonus || 0;
    h.landImprovementInvested = spec.invested || 0;
    h.domainId = domain.id;
    h.families = 100;
    return h;
  });
  campaign.domains = [domain];
  return { campaign, domain };
}

function buildProposal(domain, gpByHexIndex){
  return {
    turnEventProposals: [],
    turnVentureProposals: [],
    turnProposal: [{
      domainId: domain.id, skip: false,
      tithePaid: true, tributePaid: true, hasLiege: false,
      administersThisMonth: false,
      incomeFactor: 1, moraleRoll: 0, moraleBefore: 0,
      classification: 'Borderlands', ruler: { name: 'Ruler', level: 1 },
      income: [], expenses: [], moraleMods: [],
      urbanInvestments: [],
      agriculturalOrders: domain.geography.hexes.map((h, idx) => ({
        hexIndex: idx, hexId: h.id,
        coordStr: '(' + idx + ',0)',
        gpAmount: gpByHexIndex[idx] || 0,
        supervisorCharacterIds: []
      }))
    }]
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 2 (run first; it is the heart) — ZERO-DRIFT ORACLE
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Zero-drift oracle: real commitTurn vs independent reference, K turns ---');

// hexes: A room-for-3; B value-capped after one step (base 8); C carries partial invested;
// D one step from the bonus cap (starts bonus 2).
const HEX_SPECS = [
  { base: 6, bonus: 0, invested: 0 },      // A
  { base: 8, bonus: 0, invested: 0 },      // B — 8+1 = 9 hits the value cap
  { base: 6, bonus: 0, invested: 10000 },  // C — carries a partial step
  { base: 6, bonus: 2, invested: 0 },      // D — +1 reaches the bonus cap
];
// Per-turn gp allocations chosen to exercise: partial accrual, single step, multi-step in
// one turn, value cap, bonus cap, at-cap early-return, and reaching both caps.
const TURN_SCRIPT = [
  { 0: 10000, 1: 25000, 2: 15000, 3: 25000 },
  { 0: 40000, 1: 10000, 2: 30000, 3: 10000 },
  { 0: 10000, 1: 5000,  2: 20000, 3: 5000  },
];

const oracle = buildOracleCampaign(HEX_SPECS);
// Reference state mirrors the engine domain.
const refHexes = HEX_SPECS.map(s => ({ base: s.base, bonus: s.bonus || 0, invested: s.invested || 0 }));
const refTreasury = { gp: 1000000 };

let turnNo = 0;
for(const gpByHex of TURN_SCRIPT){
  turnNo++;
  // advance reference
  Object.keys(gpByHex).forEach(k => {
    const idx = Number(k);
    refApplyAgOrder(refHexes[idx], gpByHex[idx], refTreasury);
  });
  // advance engine (real commitTurn)
  const proposal = buildProposal(oracle.domain, gpByHex);
  let threw = null;
  try { ACKS.commitTurn(oracle.campaign, proposal); }
  catch(e){ threw = e; }
  check('turn ' + turnNo + ': commitTurn did not throw', threw === null, threw && (threw.message + '\n' + (threw.stack||'').split('\n').slice(0,3).join('\n')));
  if(threw) break;
  // assert each hex matches the reference
  oracle.domain.geography.hexes.forEach((h, idx) => {
    check('turn ' + turnNo + ' hex ' + idx + ' bonus matches reference',
      (h.landImprovementBonus || 0) === refHexes[idx].bonus,
      'engine ' + (h.landImprovementBonus||0) + ' vs ref ' + refHexes[idx].bonus);
    check('turn ' + turnNo + ' hex ' + idx + ' invested matches reference',
      (h.landImprovementInvested || 0) === refHexes[idx].invested,
      'engine ' + (h.landImprovementInvested||0) + ' vs ref ' + refHexes[idx].invested);
  });
  check('turn ' + turnNo + ' treasury matches reference',
    (oracle.domain.treasury.gp || 0) === refTreasury.gp,
    'engine ' + (oracle.domain.treasury.gp||0) + ' vs ref ' + refTreasury.gp);
}

// Final-state sanity (independent of the reference) — confirms the script exercised caps.
const fin = oracle.domain.geography.hexes;
check('hexA ended bonus 2 invested 10000', (fin[0].landImprovementBonus===2 && fin[0].landImprovementInvested===10000), JSON.stringify({b:fin[0].landImprovementBonus,i:fin[0].landImprovementInvested}));
check('hexB ended at value cap (bonus 1, invested 0)', (fin[1].landImprovementBonus===1 && fin[1].landImprovementInvested===0), JSON.stringify({b:fin[1].landImprovementBonus,i:fin[1].landImprovementInvested}));
check('hexC ended at both caps (bonus 3, invested 0)', (fin[2].landImprovementBonus===3 && fin[2].landImprovementInvested===0), JSON.stringify({b:fin[2].landImprovementBonus,i:fin[2].landImprovementInvested}));
check('hexD ended at bonus cap (bonus 3, invested 0)', (fin[3].landImprovementBonus===3 && fin[3].landImprovementInvested===0), JSON.stringify({b:fin[3].landImprovementBonus,i:fin[3].landImprovementInvested}));

// Treasury-clip case — affordable is min(gpAmount, treasury). Low treasury, big order.
console.log('--- Zero-drift oracle: treasury clipping ---');
{
  const clip = buildOracleCampaign([{ base: 6, bonus: 0, invested: 0 }]);
  clip.domain.treasury = { gp: 10000 };
  const refH = { base: 6, bonus: 0, invested: 0 };
  const refT = { gp: 10000 };
  refApplyAgOrder(refH, 25000, refT);
  let threw = null;
  try { ACKS.commitTurn(clip.campaign, buildProposal(clip.domain, { 0: 25000 })); }
  catch(e){ threw = e; }
  check('clip: commitTurn did not throw', threw === null, threw && threw.message);
  if(!threw){
    const h = clip.domain.geography.hexes[0];
    check('clip: invested == 10000 (clipped to treasury)', (h.landImprovementInvested||0) === refH.invested && refH.invested === 10000, 'got ' + (h.landImprovementInvested||0));
    check('clip: treasury drained to 0', (clip.domain.treasury.gp||0) === refT.gp && refT.gp === 0, 'got ' + (clip.domain.treasury.gp||0));
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 1 — RATCHET UNIT SWEEP (pure helper)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Ratchet unit sweep ---');
function refRatchet(base, bonus, invested){
  let steps = 0;
  while(invested >= COST && bonus < MAXB && base + bonus < VCAP){ bonus++; invested -= COST; steps++; }
  if(bonus >= MAXB || base + bonus >= VCAP) invested = 0;
  return { steps, bonus, invested };
}
[
  { base: 6, bonus: 0, invested: 0 },
  { base: 6, bonus: 0, invested: 24999 },
  { base: 6, bonus: 0, invested: 25000 },
  { base: 6, bonus: 0, invested: 75000 },
  { base: 6, bonus: 0, invested: 100000 },   // 4th step blocked by bonus cap
  { base: 8, bonus: 0, invested: 50000 },    // value cap after 1 step; excess discarded
  { base: 9, bonus: 0, invested: 25000 },    // already at value cap; no step, invested zeroed
  { base: 6, bonus: 2, invested: 25000 },    // one step to bonus cap
].forEach((tc, i) => {
  const hex = { valuePerFamily: tc.base, landImprovementBonus: tc.bonus, landImprovementInvested: tc.invested };
  const steps = ACKS.ratchetAgriculturalImprovement(hex);
  const ref = refRatchet(tc.base, tc.bonus, tc.invested);
  check('ratchet case ' + i + ' steps', steps === ref.steps, 'engine ' + steps + ' vs ref ' + ref.steps);
  check('ratchet case ' + i + ' bonus', hex.landImprovementBonus === ref.bonus, 'engine ' + hex.landImprovementBonus + ' vs ref ' + ref.bonus);
  check('ratchet case ' + i + ' invested', hex.landImprovementInvested === ref.invested, 'engine ' + hex.landImprovementInvested + ' vs ref ' + ref.invested);
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 3 — PROJECT MIRROR (feature-gated on the refactor having landed)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Project mirror (post-refactor) ---');
const agProjects = (oracle.campaign.projects || []).filter(p => p && p.constructibleKind === 'agricultural-improvement');
if(agProjects.length === 0){
  console.log('  (skipped — commitTurn does not yet mirror agricultural Projects)');
} else {
  const byHex = id => agProjects.find(p => p.siteHexId === id);
  const expect = [
    { idx: 0, gpSpent: 2*COST + 10000, state: 'under-construction' }, // A
    { idx: 1, gpSpent: 1*COST + 0,     state: 'complete' },           // B value cap
    { idx: 2, gpSpent: 3*COST + 0,     state: 'complete' },           // C both caps
    { idx: 3, gpSpent: 3*COST + 0,     state: 'complete' },           // D bonus cap
  ];
  expect.forEach(e => {
    const hexId = oracle.domain.geography.hexes[e.idx].id;
    const proj = byHex(hexId);
    check('mirror: Project exists for hex ' + e.idx, !!proj, 'no project for ' + hexId);
    if(proj){
      check('mirror: hex ' + e.idx + ' ownerDomainId', proj.ownerDomainId === oracle.domain.id);
      check('mirror: hex ' + e.idx + ' gpSpent == implied cumulative', proj.gpSpent === e.gpSpent, 'got ' + proj.gpSpent + ' want ' + e.gpSpent);
      check('mirror: hex ' + e.idx + ' lifecycleState', proj.lifecycleState === e.state, 'got ' + proj.lifecycleState + ' want ' + e.state);
      check('mirror: hex ' + e.idx + ' id prefix prj-', typeof proj.id === 'string' && proj.id.startsWith('prj-'));
    }
  });
  // one Project per hex (no duplicates across the 3 turns)
  const counts = {};
  agProjects.forEach(p => { counts[p.siteHexId] = (counts[p.siteHexId]||0) + 1; });
  check('mirror: exactly one Project per hex (idempotent across turns)', Object.values(counts).every(n => n === 1), JSON.stringify(counts));
  // construction-progress events recorded with context envelope
  const cpEvents = (oracle.campaign.eventLog || []).filter(e => e && e.event && e.event.kind === 'construction-progress');
  check('mirror: construction-progress events recorded', cpEvents.length >= 1, 'count ' + cpEvents.length);
  check('mirror: events carry a context primaryHexId', cpEvents.every(e => e.event.context && e.event.context.primaryHexId), 'one or more missing context.primaryHexId');
  check('mirror: events reference the project in relatedEntities', cpEvents.some(e => (e.event.context.relatedEntities||[]).some(r => r.kind === 'project')), 'no project relatedEntity');
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 4 — MIGRATION (feature-gated)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- migrateAgriculturalToProjects (post-refactor) ---');
if(typeof ACKS.migrateAgriculturalToProjects !== 'function'){
  console.log('  (skipped — migrateAgriculturalToProjects not yet exported)');
} else {
  const c = ACKS.blankCampaign({ name: 'Migration' });
  c.projects = [];
  c.hexes = [
    Object.assign(ACKS.blankHex({ id: 'hex-m-inprog', coord: { q:0, r:0 } }), { valuePerFamily: 6, landImprovementBonus: 1, landImprovementInvested: 12500, domainId: 'dom-x' }),
    Object.assign(ACKS.blankHex({ id: 'hex-m-paused', coord: { q:1, r:0 } }), { valuePerFamily: 6, landImprovementBonus: 1, landImprovementInvested: 0,     domainId: 'dom-x' }),
    Object.assign(ACKS.blankHex({ id: 'hex-m-fresh',  coord: { q:2, r:0 } }), { valuePerFamily: 6, landImprovementBonus: 0, landImprovementInvested: 0,     domainId: 'dom-x' }),
  ];
  ACKS.migrateAgriculturalToProjects(c);
  const mProjects = c.projects.filter(p => p.constructibleKind === 'agricultural-improvement');
  check('migration: one Project (only invested>0 hex)', mProjects.length === 1, 'got ' + mProjects.length);
  const mp = mProjects[0];
  if(mp){
    check('migration: Project sited on the in-progress hex', mp.siteHexId === 'hex-m-inprog');
    check('migration: ownerDomainId from hex.domainId', mp.ownerDomainId === 'dom-x');
    check('migration: under-construction', mp.lifecycleState === 'under-construction');
    check('migration: gpSpent == cumulative (1*25000 + 12500)', mp.gpSpent === COST + 12500, 'got ' + mp.gpSpent);
  }
  // idempotent
  ACKS.migrateAgriculturalToProjects(c);
  check('migration: idempotent (still one Project)', c.projects.filter(p => p.constructibleKind === 'agricultural-improvement').length === 1);

  // RECONCILE (canonical-setter doctrine): a Project left 'under-construction' after its hex
  // reached the cap (e.g. via a GM hex edit) is corrected to 'complete' on the next load.
  {
    const rc = ACKS.blankCampaign({ name: 'Reconcile' });
    rc.projects = [];
    const cappedHex = Object.assign(ACKS.blankHex({ id: 'hex-capped', coord: { q:5, r:5 } }),
      { valuePerFamily: 7, landImprovementBonus: 2, landImprovementInvested: 0, domainId: 'dom-x' }); // 7+2 = 9 value cap
    rc.hexes = [cappedHex];
    rc.projects.push(ACKS.blankProject({ id: 'prj-stuck', constructibleKind: 'agricultural-improvement',
      siteHexId: 'hex-capped', ownerDomainId: 'dom-x', lifecycleState: 'under-construction', gpSpent: 0 }));
    ACKS.migrateAgriculturalToProjects(rc);
    const fixed = rc.projects.find(p => p.id === 'prj-stuck');
    check('reconcile: stuck under-construction Project on a capped hex -> complete', fixed && fixed.lifecycleState === 'complete', 'got ' + (fixed && fixed.lifecycleState));
    check('reconcile: gpSpent resynced to cumulative (2*25000)', fixed && fixed.gpSpent === 2*COST, 'got ' + (fixed && fixed.gpSpent));
    check('reconcile: did not duplicate the Project', rc.projects.filter(p => p.constructibleKind === 'agricultural-improvement').length === 1);
  }

  // RECONCILE via domain.geography.hexes when campaign.hexes is empty/stale (the pre-lift,
  // session-restore shape — migrateCampaign runs before liftToTopLevelCollections).
  {
    const rc2 = ACKS.blankCampaign({ name: 'Reconcile-nested' });
    rc2.projects = [];
    rc2.hexes = []; // top-level empty (not yet lifted)
    const dm = ACKS.blankDomain({ name: 'M2' });
    const nestedCapped = Object.assign(ACKS.blankHex({ id: 'hex-nested-cap', coord: { q:9, r:9 } }),
      { valuePerFamily: 6, landImprovementBonus: 3, landImprovementInvested: 0, domainId: dm.id }); // bonus cap
    dm.geography.hexes = [nestedCapped];
    rc2.domains = [dm];
    rc2.projects.push(ACKS.blankProject({ id: 'prj-stuck2', constructibleKind: 'agricultural-improvement',
      siteHexId: 'hex-nested-cap', ownerDomainId: dm.id, lifecycleState: 'under-construction', gpSpent: 0 }));
    ACKS.migrateAgriculturalToProjects(rc2);
    const fixed2 = rc2.projects.find(p => p.id === 'prj-stuck2');
    check('reconcile(nested): finds hex via domain.geography.hexes when campaign.hexes is empty', fixed2 && fixed2.lifecycleState === 'complete', 'got ' + (fixed2 && fixed2.lifecycleState));
  }

  // END-TO-END session-restore shape: domains are stored separately, so migrateCampaign runs with
  // an EMPTY campaign.domains (reconcile sees nothing); the UI then attaches domains + lifts hexes
  // and re-runs migrateAgriculturalToProjects. This guards the exact path that left a capped hex's
  // Project stuck 'under-construction' across reloads (index.html session-restore + open-file paths).
  {
    const dm = ACKS.blankDomain({ name: 'M3' });
    const capHex = Object.assign(ACKS.blankHex({ id: 'hex-sr-cap', coord: { q:0, r:0 } }),
      { valuePerFamily: 7, landImprovementBonus: 2, landImprovementInvested: 0, domainId: dm.id }); // 7+2 = 9 cap
    dm.geography.hexes = [capHex];
    const stuck = ACKS.blankProject({ id: 'prj-sr', constructibleKind: 'agricultural-improvement',
      siteHexId: 'hex-sr-cap', ownerDomainId: dm.id, lifecycleState: 'under-construction', gpSpent: 0 });
    const sess = ACKS.blankCampaign({ name: 'SR' }); sess.domains = []; sess.projects = [stuck]; sess.hexes = [];
    const cc = ACKS.migrateCampaign(sess); // blind (empty domains)
    check('session-restore: migrateCampaign alone leaves it stuck (blind)', cc.projects.find(p => p.id === 'prj-sr').lifecycleState === 'under-construction');
    const ls = { domains: [dm], hexes: cc.hexes, settlements: cc.settlements, rumors: cc.rumors };
    ACKS.liftToTopLevelCollections(ls); cc.hexes = ls.hexes;
    ACKS.migrateAgriculturalToProjects(cc); // the post-lift reconcile the UI now runs
    check('session-restore: post-lift reconcile completes the capped Project', cc.projects.find(p => p.id === 'prj-sr').lifecycleState === 'complete');
  }

  // NORMALIZE: a hex carrying >= one full step of invested gp (authored/legacy) is ratcheted on
  // load (the timed model ratchets at drip time, so banked overflow would otherwise never advance).
  {
    const nc = ACKS.blankCampaign({ name: 'Normalize' }); nc.projects = [];
    nc.hexes = [ Object.assign(ACKS.blankHex({ id: 'hex-ovf', coord:{q:0,r:0} }),
      { valuePerFamily: 6, landImprovementBonus: 0, landImprovementInvested: 37500, domainId: 'dom-x' }) ]; // 37500 = 1 step + 12500
    ACKS.migrateAgriculturalToProjects(nc);
    const h = nc.hexes[0];
    check('normalize: invested>=25000 ratchets bonus +1 on load', h.landImprovementBonus === 1, 'bonus ' + h.landImprovementBonus);
    check('normalize: invested reduced below one step (12500)', h.landImprovementInvested === 12500, 'invested ' + h.landImprovementInvested);
  }

  // BUDGET migration: a hex with only a dripping budget (no invested) gets a Project so the day-tick
  // can find it; a legacy queuedImprovementGp allocation is carried into improvementBudgetGp.
  {
    const bc = ACKS.blankCampaign({ name: 'Budget' }); bc.projects = [];
    bc.hexes = [
      Object.assign(ACKS.blankHex({ id: 'hex-bud', coord:{q:0,r:0} }), { valuePerFamily: 6, improvementBudgetGp: 50000, domainId: 'dom-x' }),
      Object.assign(ACKS.blankHex({ id: 'hex-q',   coord:{q:1,r:0} }), { valuePerFamily: 6, queuedImprovementGp: 30000, domainId: 'dom-x' }),
    ];
    ACKS.migrateAgriculturalToProjects(bc);
    check('budget-migrate: budget-only hex gets a Project', !!ACKS.findAgriculturalProject(bc, 'hex-bud'));
    check('budget-migrate: legacy queue carried into improvementBudgetGp', bc.hexes[1].improvementBudgetGp === 30000 && bc.hexes[1].queuedImprovementGp === 0, JSON.stringify({b:bc.hexes[1].improvementBudgetGp,q:bc.hexes[1].queuedImprovementGp}));
    check('budget-migrate: queue->budget hex also gets a Project', !!ACKS.findAgriculturalProject(bc, 'hex-q'));
    // idempotent
    ACKS.migrateAgriculturalToProjects(bc);
    check('budget-migrate: idempotent (2 ag Projects)', bc.projects.filter(p => p.constructibleKind === 'agricultural-improvement').length === 2);
  }

  // demo template carries hex-saltspur-vale invested=12500 -> migrate yields a live consumer
  try {
    const demoMod = require(path.join(__dirname, '..', 'acks-demo-template.js'));
    const demoRaw = (global.ACKS_DEMO_TEMPLATE || demoMod || null);
    const demoObj = demoRaw && (demoRaw.campaign || demoRaw);
    if(demoObj && typeof demoObj === 'object'){
      const demo = ACKS.migrateCampaign(JSON.parse(JSON.stringify(demoObj)));
      const demoAg = (demo.projects||[]).filter(p => p.constructibleKind === 'agricultural-improvement');
      check('migration: demo template yields >=1 agricultural Project', demoAg.length >= 1, 'count ' + demoAg.length);
      check('migration: demo ag Project is under-construction (Day Clock consumer)', demoAg.some(p => p.lifecycleState === 'under-construction'));
    } else {
      console.log('  (demo template object not resolvable in Node; skipped demo assertion)');
    }
  } catch(e){ console.log('  (demo template assertion skipped: ' + e.message + ')'); }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 5 — DAY-TICK BRANCH (feature-gated by behavior)
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- proposeConstructionDay agricultural branch ---');
{
  const c = ACKS.blankCampaign({ name: 'Day tick' });
  c.projects = [
    ACKS.blankProject({ id: 'prj-ag-1', constructibleKind: 'agricultural-improvement', siteHexId: 'hex-dt', ownerDomainId: 'dom-x', lifecycleState: 'under-construction', name: 'Ag improvement' }),
    ACKS.blankProject({ id: 'prj-wk-1', constructibleKind: 'stronghold-component', constructibleSubtype: 'keep', lifecycleState: 'under-construction', laborRequired: 100000 }),
  ];
  c.projects[1].workerCounts = { laborer: 20 };
  const out = ACKS.proposeConstructionDay(c, { days: 1 });
  const agRec = (out.pendingRecords||[]).find(r => r.projectId === 'prj-ag-1');
  const wkRec = (out.pendingRecords||[]).find(r => r.projectId === 'prj-wk-1');
  check('day-tick: agricultural record present', !!agRec);
  check('day-tick: worker record present', !!wkRec);
  if(agRec){
    check('day-tick: agricultural laborGained is 0 (monthly cadence)', (agRec.laborGained||0) === 0, 'got ' + agRec.laborGained);
    check('day-tick: agricultural willComplete is false', agRec.willComplete === false);
    // The dedicated branch tags its record cadence:'monthly'. Until it lands the existing
    // worker path produces a "+0 cf" label; guard the label assertions so CI stays green.
    if(agRec.cadence === 'monthly'){
      check('day-tick: agricultural label is not the misleading "+0 cf"', !/\+0 cf/.test(agRec.label||''), 'label: ' + agRec.label);
      check('day-tick: agricultural label signals month-end/monthly cadence', /month|monthly/i.test(agRec.label||''), 'label: ' + agRec.label);
    } else {
      console.log('  (skipped — agricultural day-tick branch not yet landed)');
    }
  }
  if(wkRec){
    check('day-tick: worker project still ticks (laborGained > 0)', (wkRec.laborGained||0) > 0, 'got ' + wkRec.laborGained);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 6 — CALENDAR INTEGRATION (feature-gated by behavior)
// runDayTickToMonthEnd runs INSIDE commitTurn when a calendar is present. Confirm an
// agricultural Project is not corrupted (falsely completed / labor advanced) by it.
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Calendar integration (commitTurn drives runDayTickToMonthEnd) ---');
{
  const c = buildOracleCampaign([{ base: 6, bonus: 0, invested: 0 }]);
  c.campaign.calendar = { year: 1, month: 1, day: 1, kind: 'default' };
  c.campaign.currentDayInMonth = 1;
  let threw = null;
  try { ACKS.commitTurn(c.campaign, buildProposal(c.domain, { 0: 25000 })); }
  catch(e){ threw = e; }
  check('calendar: commitTurn-with-calendar did not throw', threw === null, threw && (threw.message + '\n' + (threw.stack||'').split('\n').slice(0,3).join('\n')));
  if(!threw){
    const h = c.domain.geography.hexes[0];
    check('calendar: hex ratcheted to bonus 1 invested 0', (h.landImprovementBonus===1 && h.landImprovementInvested===0), JSON.stringify({b:h.landImprovementBonus,i:h.landImprovementInvested}));
    const agp = (c.campaign.projects||[]).filter(p => p.constructibleKind === 'agricultural-improvement');
    if(agp.length){
      // bonus 1 invested 0, base 6 -> 6+1=7 < 9, bonus 1 < 3 => still under-construction
      check('calendar: ag Project not falsely completed by day-tick', agp[0].lifecycleState === 'under-construction', 'got ' + agp[0].lifecycleState);
      check('calendar: ag Project laborInvested untouched by day-tick (0)', (agp[0].laborInvested||0) === 0, 'got ' + agp[0].laborInvested);
    } else {
      console.log('  (no ag Project yet — mirror not landed; skipped Project-corruption assertions)');
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION 7 — UI CONTRACT. The wave's payoff: the shipped demo carries a live day-tick
// consumer, so the Day Clock auto-engages and lists agricultural improvement as a
// monthly-cadence activity. This exercises the exact engine surface index.html reads
// (dayTickActivityInFlight + proposeDayTick) without needing a browser — the wave touched
// no index.html, so the only question is whether the engine feeds the existing UI correctly.
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- UI contract: Day Clock engages on the agricultural Project (demo) ---');
try {
  require(path.join(__dirname, '..', 'acks-demo-template.js'));
  const demo = ACKS.migrateCampaign(JSON.parse(JSON.stringify(global.ACKS_DEMO_TEMPLATE)));
  check('UI: demo ships an under-construction agricultural Project',
    (demo.projects||[]).some(p => p.constructibleKind === 'agricultural-improvement' && p.lifecycleState === 'under-construction'));
  check('UI: dayTickActivityInFlight(demo) is true (Day Clock auto-engages)',
    ACKS.dayTickActivityInFlight(demo) === true);
  const tick = ACKS.proposeDayTick(demo, 1);
  const recs = (tick && tick.pendingRecords) || [];
  const agRec = recs.find(r => r && /agricultural/i.test((r.label || '') + ''));
  check('UI: proposeDayTick lists the agricultural Project', !!agRec, 'records: ' + JSON.stringify(recs.map(r => r.label)));
  if(agRec){
    // Post-default-flip: the demo is time-based (RAW) out of the box, so the day-tick emits a DRIP
    // record. The demo hex has no budget + no supervisor yet, so it lists as paused/idle (drip 0).
    check('UI: agricultural day record is a time-based drip record', agRec.agriculturalDrip === true, 'agriculturalDrip: ' + agRec.agriculturalDrip);
    check('UI: agricultural day record routed under the construction consumer', agRec.consumer === 'construction', 'consumer: ' + agRec.consumer);
    check('UI: agricultural label is not the misleading "+0 cf"', !/\+0 cf/.test(agRec.label || ''), 'label: ' + agRec.label);
  }
} catch(e){ check('UI: contract section ran without throwing', false, e.message); }

// ─────────────────────────────────────────────────────────────────────────────
// R1 — time-based construction foundation: rate + supervisor adequacy (RR p.174).
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Time-based construction R1: rate + supervisor adequacy (RR p.174) ---');
{
  check('R1: rate constant = 500 gp/day (Typical Laborer)', ACKS.AGRICULTURAL_CONSTRUCTION_RATE_PER_DAY === 500);
  check('R1: 25,000gp step / 500 per day = 50 days', COST / ACKS.AGRICULTURAL_CONSTRUCTION_RATE_PER_DAY === 50);
  check('R1: agriculturalConstructionRatePerDay default is 500', ACKS.agriculturalConstructionRatePerDay({}, {}, {}) === 500);

  const camp = ACKS.blankCampaign({ name: 'sup' });
  const hex = ACKS.blankHex({ id: 'hex-s', coord: { q:0, r:0 } });
  const eng = ACKS.blankCharacter({ name: 'Engy' });
  eng.id = 'chr-eng'; eng.constructionSupervisorCap = 25000; eng.currentHexId = 'hex-s';
  camp.characters = [eng];

  check('R1 sup: none assigned -> not ok', (() => { const r = ACKS.agriculturalSupervisorAdequacy(camp, hex, COST); return r.ok === false && /no supervisor/.test(r.blockReason); })());

  hex.constructionSupervisorCharacterIds = ['chr-eng'];
  let r = ACKS.agriculturalSupervisorAdequacy(camp, hex, COST);
  check('R1 sup: on-site siege engineer (cap 25k) covers a 25k step -> ok', r.ok === true && r.totalCap === 25000, JSON.stringify({ok:r.ok,cap:r.totalCap}));

  r = ACKS.agriculturalSupervisorAdequacy(camp, hex, 30000);
  check('R1 sup: cap below remaining step cost -> not ok', r.ok === false && /below remaining/.test(r.blockReason), r.blockReason);

  eng.currentHexId = 'hex-other';
  r = ACKS.agriculturalSupervisorAdequacy(camp, hex, COST);
  check('R1 sup: off-site supervisor -> not ok', r.ok === false);
  eng.currentHexId = 'hex-s';

  const eng2 = { id: 'chr-eng2', name: 'Engy2', constructionSupervisorCap: 100000, currentHexId: 'hex-s' };
  camp.characters.push(eng2);
  hex.constructionSupervisorCharacterIds = ['chr-eng', 'chr-eng2'];
  r = ACKS.agriculturalSupervisorAdequacy(camp, hex, COST);
  check('R1 sup: multiple supervisors -> caps additive (125k)', r.ok === true && r.totalCap === 125000, JSON.stringify({ok:r.ok,cap:r.totalCap}));

  // Proficiency-derived supervisor cap (RR p.353 — capability comes from the proficiency, not a
  // hired-specialist title; manual constructionSupervisorCap is an NPC fallback).
  check('R1 prof: Engineering proficiency -> 100,000gp cap', ACKS.constructionSupervisorCapForCharacter({ proficiencies:['Engineering'] }) === 100000);
  check('R1 prof: Siege Engineering proficiency -> 25,000gp cap', ACKS.constructionSupervisorCapForCharacter({ proficiencies:['Siege Engineering'] }) === 25000);
  check('R1 prof: {key} proficiency-object form works', ACKS.constructionSupervisorCapForCharacter({ proficiencies:[{ key:'Engineering' }] }) === 100000);
  check('R1 prof: a non-engineering proficiency grants nothing', ACKS.constructionSupervisorCapForCharacter({ proficiencies:['Persuasion'] }) === 0);
  check('R1 prof: manual cap honored as a fallback', ACKS.constructionSupervisorCapForCharacter({ proficiencies:[], constructionSupervisorCap:25000 }) === 25000);
  check('R1 prof: proficiency beats a lower manual cap', ACKS.constructionSupervisorCapForCharacter({ proficiencies:['Engineering'], constructionSupervisorCap:25000 }) === 100000);
  {
    const c2 = ACKS.blankCampaign({ name:'prof' });
    const ruler = ACKS.blankCharacter({ name:'Ruler' }); ruler.id='chr-r'; ruler.proficiencies=['Engineering']; ruler.currentHexId='hex-s';
    c2.characters=[ruler];
    const hx = ACKS.blankHex({ id:'hex-s', coord:{q:0,r:0} }); hx.constructionSupervisorCharacterIds=['chr-r'];
    check('R1 prof: a ruler with Engineering proficiency (no manual cap) qualifies as supervisor', ACKS.agriculturalSupervisorAdequacy(c2, hx, 25000).ok === true);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// R2/R3 — time-based drip + monthly budget accumulation (realistic-construction ON).
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Time-based construction R2/R3: budget + day-tick drip (realistic-construction ON) ---');
{
  const RATE = ACKS.AGRICULTURAL_CONSTRUCTION_RATE_PER_DAY; // 500

  function buildTimed(opts){
    opts = opts || {};
    const c = ACKS.blankCampaign({ name: 'timed' });
    c.houseRules = c.houseRules || {};
    c.houseRules['realistic-construction'] = { enabled: true };
    c.projects = [];
    const d = ACKS.blankDomain({ name: 'D' });
    d.treasury = { gp: opts.treasury == null ? 1000000 : opts.treasury };
    const hex = ACKS.blankHex({ id: 'hex-t', coord: { q:0, r:0 } });
    hex.valuePerFamily = opts.base == null ? 6 : opts.base;
    hex.landImprovementBonus = opts.bonus || 0;
    hex.landImprovementInvested = opts.invested || 0;
    hex.improvementBudgetGp = opts.budget == null ? 25000 : opts.budget;
    hex.domainId = d.id;
    if(opts.supervisor !== false){
      const eng = ACKS.blankCharacter({ name: 'Eng' });
      eng.id = 'chr-eng'; eng.constructionSupervisorCap = 25000; eng.currentHexId = 'hex-t';
      c.characters = [eng];
      hex.constructionSupervisorCharacterIds = ['chr-eng'];
    }
    d.geography.hexes = [hex]; c.hexes = [hex]; c.domains = [d];
    ACKS.syncAgriculturalProject(c, hex, { domainId: d.id });
    return { c, d, hex, project: ACKS.findAgriculturalProject(c, 'hex-t') };
  }
  const drip1 = t => ACKS.commitConstructionRecord(t.c, { projectId: t.project.id, agriculturalDrip: true, daysAdded: 1 });

  // computeAgriculturalDrip clipping
  let t = buildTimed({});
  check('R2 drip: 1 day = 500gp', ACKS.computeAgriculturalDrip(t.c, t.project, 1).drip === RATE);
  check('R2 drip: 10 days = 5000gp', ACKS.computeAgriculturalDrip(t.c, t.project, 10).drip === RATE * 10);
  check('R2 drip: clipped by budget (25000)', ACKS.computeAgriculturalDrip(t.c, t.project, 100).drip === 25000);
  t = buildTimed({ treasury: 300 });
  check('R2 drip: clipped by treasury (300)', ACKS.computeAgriculturalDrip(t.c, t.project, 1).drip === 300);
  t = buildTimed({ supervisor: false });
  check('R2 drip: land improvement needs NO supervisor (RR p.174) — drips at the labor rate', ACKS.computeAgriculturalDrip(t.c, t.project, 1).drip === RATE, 'drip ' + ACKS.computeAgriculturalDrip(t.c, t.project, 1).drip);
  t = buildTimed({ budget: 0 });
  check('R2 drip: no budget -> 0', ACKS.computeAgriculturalDrip(t.c, t.project, 1).drip === 0);
  t = buildTimed({ base: 8 }); // 8+1=9 value cap -> only one step's worth of cost-to-cap
  check('R2 drip: value-cap limits cost-to-cap (drips up to one step)', ACKS.computeAgriculturalDrip(t.c, t.project, 100).drip === 25000);

  // 50-day drip completes a +1 step (direct day-tick simulation, bypassing the 30-day month cap)
  t = buildTimed({});
  for(let day = 0; day < 50; day++) drip1(t);
  check('R2 drip: after 50 days, hex bonus +1', t.hex.landImprovementBonus === 1, 'bonus ' + t.hex.landImprovementBonus);
  check('R2 drip: after 50 days, invested ratcheted to 0', t.hex.landImprovementInvested === 0, 'invested ' + t.hex.landImprovementInvested);
  check('R2 drip: after 50 days, budget drained to 0', t.hex.improvementBudgetGp === 0, 'budget ' + t.hex.improvementBudgetGp);
  check('R2 drip: after 50 days, treasury -25000 (pay-as-you-build)', t.d.treasury.gp === 1000000 - 25000, 'treasury ' + t.d.treasury.gp);
  drip1(t);
  check('R2 drip: budget exhausted -> further ticks are no-ops', t.hex.improvementBudgetGp === 0 && t.d.treasury.gp === 975000);

  // mid-stream partial: 30 days -> 15000 invested, no step yet
  t = buildTimed({});
  for(let day = 0; day < 30; day++) drip1(t);
  check('R2 drip: 30 days -> 15000 invested, bonus still 0', t.hex.landImprovementInvested === 15000 && t.hex.landImprovementBonus === 0, JSON.stringify({ i: t.hex.landImprovementInvested, b: t.hex.landImprovementBonus }));
  check('R2 drip: 30 days -> 10000gp budget left', t.hex.improvementBudgetGp === 10000, 'budget ' + t.hex.improvementBudgetGp);

  // no supervisor required for land improvement: the drip still applies
  t = buildTimed({ supervisor: false });
  drip1(t);
  check('R2 drip: no supervisor -> drip still applies (treasury -500, budget 24500, invested 500)', t.d.treasury.gp === 1000000 - RATE && t.hex.improvementBudgetGp === 25000 - RATE && t.hex.landImprovementInvested === RATE, JSON.stringify({t:t.d.treasury.gp,b:t.hex.improvementBudgetGp,i:t.hex.landImprovementInvested}));

  // monthly commit accumulates budget (no instant spend) when realistic-construction is ON
  {
    const c = ACKS.blankCampaign({ name: 'budget' }); c.projects = []; c.calendar = null; // null the calendar so runDayTickToMonthEnd does NOT drip — isolates the monthly ag block's budget accumulation
    const d = ACKS.blankDomain({ name: 'D' }); d.treasury = { gp: 1000000 }; d.demographics = { peasantFamilies:1000, urbanFamilies:0, morale:0 };
    const hex = ACKS.blankHex({ id: 'hex-b', coord:{q:0,r:0} }); hex.valuePerFamily = 6; hex.domainId = d.id;
    d.geography.hexes = [hex]; c.domains = [d];
    // realistic/timed path: blankCampaign's houseRules are empty ⇒ 'abstract-construction' off ⇒ realistic.
    const proposal = { turnEventProposals: [], turnVentureProposals: [], turnProposal: [{
      domainId: d.id, skip:false, tithePaid:true, tributePaid:true, hasLiege:false, administersThisMonth:false,
      incomeFactor:1, moraleRoll:0, moraleBefore:0, classification:'Borderlands', ruler:{ name:'R', level:1 },
      income:[], expenses:[], moraleMods:[], urbanInvestments:[],
      agriculturalOrders: [{ hexIndex:0, hexId:'hex-b', coordStr:'(0,0)', gpAmount:25000, supervisorCharacterIds:[] }]
    }]};
    ACKS.commitTurn(c, proposal);
    check('R3 monthly: realistic ON accumulates budget (25000)', hex.improvementBudgetGp === 25000, 'budget ' + hex.improvementBudgetGp);
    check('R3 monthly: realistic ON does NOT instant-spend (invested 0, bonus 0)', hex.landImprovementInvested === 0 && hex.landImprovementBonus === 0);
    check('R3 monthly: realistic ON did NOT debit treasury for ag', d.treasury.gp === 1000000);
    check('R3 monthly: an under-construction agricultural Project exists', (c.projects||[]).some(p => p.constructibleKind === 'agricultural-improvement' && p.lifecycleState === 'under-construction'));
  }

  // Day-tick reads campaign.domains to find the treasury. This unit-pins that contract: with no
  // domains on the campaign the drip can't find the treasury and reports 0 ("idle"), even with a
  // budget; with domains attached it drips. (Domains live on the campaign in the app now — single
  // home — so the live drip always sees them; this just locks the dependency.)
  {
    const c = ACKS.blankCampaign({ name: 'split' }); c.projects = [];
    const d = ACKS.blankDomain({ name: 'D' }); d.treasury = { gp: 1000000 };
    const hex = ACKS.blankHex({ id: 'hex-sp', coord:{q:0,r:0} }); hex.valuePerFamily = 6; hex.improvementBudgetGp = 25000; hex.domainId = d.id;
    d.geography.hexes = [hex]; c.hexes = [hex]; c.domains = []; // split shape: hex lifted, domains NOT attached
    ACKS.syncAgriculturalProject(c, hex, { domainId: d.id });
    const proj = ACKS.findAgriculturalProject(c, 'hex-sp');
    check('split-shape: domains NOT attached -> drip 0 (the reported "idle" bug)', ACKS.computeAgriculturalDrip(c, proj, 1).drip === 0);
    c.domains = [d]; // attach (what the UI day-tick now does)
    check('split-shape: domains attached -> drips 500 (the fix)', ACKS.computeAgriculturalDrip(c, proj, 1).drip === 500);
  }

  // ADVANCE MONTH must drip in-flight improvements via runDayTickToMonthEnd. Domains live on the
  // campaign now (single home), so the month-end block finds the treasuries directly — no re-attach.
  // This guards that an Advance Month progresses an in-flight agricultural improvement (the reported
  // "advance month didn't progress it" bug).
  {
    const c = ACKS.blankCampaign({ name: 'advance' }); c.projects = [];
    c.calendar = { year:1, month:1, day:1, kind:'default' }; c.currentDayInMonth = 1;
    const d = ACKS.blankDomain({ name: 'D' }); d.treasury = { gp: 1000000 }; d.demographics = { peasantFamilies:1000, urbanFamilies:0, morale:0 };
    const hex = ACKS.blankHex({ id: 'hex-adv', coord:{q:0,r:0} }); hex.valuePerFamily = 6; hex.improvementBudgetGp = 25000; hex.domainId = d.id;
    d.geography.hexes = [hex]; c.hexes = [hex]; c.domains = [d]; // single home: domains live on the campaign
    ACKS.syncAgriculturalProject(c, hex, { domainId: d.id });
    // all rules off (blankCampaign) ⇒ time-based / realistic construction.
    const proposal = { turnEventProposals: [], turnVentureProposals: [], turnProposal: [{
      domainId: d.id, skip:false, tithePaid:true, tributePaid:true, hasLiege:false, administersThisMonth:false,
      incomeFactor:1, moraleRoll:0, moraleBefore:0, classification:'Borderlands', ruler:{ name:'R', level:1 },
      income:[], expenses:[], moraleMods:[], urbanInvestments:[], agriculturalOrders: []
    }]};
    ACKS.commitTurn(c, proposal);
    // day 1 -> 30 = 29 ticks at 500/day = 14,500 dripped
    check('advance-month: month-end drip ran (invested 14,500)', hex.landImprovementInvested === 14500, 'invested ' + hex.landImprovementInvested);
    check('advance-month: budget reduced to 10,500', hex.improvementBudgetGp === 10500, 'budget ' + hex.improvementBudgetGp);
    check('advance-month: treasury debited 14,500 (pay-as-you-build)', d.treasury.gp === 1000000 - 14500, 'treasury ' + d.treasury.gp);
  }

  // A funded hex with no Project yet engages the Day Clock (the panel writes the budget directly;
  // the Project is materialized just before the tick).
  {
    const c = ACKS.blankCampaign({ name: 'dtaif' }); c.projects = [];
    c.hexes = [ Object.assign(ACKS.blankHex({ id: 'hex-bud2', coord:{q:0,r:0} }), { valuePerFamily:6, improvementBudgetGp: 10000 }) ];
    check('dayClock: a funded hex (no Project yet) engages the Day Clock', ACKS.dayTickActivityInFlight(c) === true);
    c.hexes[0].improvementBudgetGp = 0;
    check('dayClock: no budget + no project -> not in flight', ACKS.dayTickActivityInFlight(c) === false);
  }

  // Stranded budget on a capped hex is cleared on migrate (the drip can't spend past the cap).
  {
    const c = ACKS.blankCampaign({ name: 'capbud' }); c.projects = [];
    c.hexes = [ Object.assign(ACKS.blankHex({ id: 'hex-capbud', coord:{q:0,r:0} }), { valuePerFamily:7, landImprovementBonus:2, improvementBudgetGp: 45500, domainId:'dom-x' }) ]; // 7+2 = 9 cap
    ACKS.migrateAgriculturalToProjects(c);
    check('cap-budget: stranded budget on a capped hex is cleared', c.hexes[0].improvementBudgetGp === 0, 'budget ' + c.hexes[0].improvementBudgetGp);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Full day-tick pipeline end-to-end (proposeDayTick clone -> commitDayTick real campaign).
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Time-based construction: full day-tick pipeline (proposeDayTick + commitDayTick) ---');
{
  const c = ACKS.blankCampaign({ name: 'pipe' });
  c.houseRules = c.houseRules || {};
  c.houseRules['realistic-construction'] = { enabled: true };
  c.projects = []; c.currentDayInMonth = 1; c.calendar = { year:1, month:1, day:1, kind:'default' };
  const d = ACKS.blankDomain({ name: 'D' }); d.treasury = { gp: 1000000 };
  const hex = ACKS.blankHex({ id: 'hex-p', coord:{q:0,r:0} }); hex.valuePerFamily = 6; hex.domainId = d.id; hex.improvementBudgetGp = 25000;
  const eng = ACKS.blankCharacter({ name: 'Eng' }); eng.id = 'chr-e'; eng.constructionSupervisorCap = 25000; eng.currentHexId = 'hex-p';
  c.characters = [eng]; hex.constructionSupervisorCharacterIds = ['chr-e'];
  d.geography.hexes = [hex]; c.hexes = [hex]; c.domains = [d];
  ACKS.syncAgriculturalProject(c, hex, { domainId: d.id });
  ACKS.tickDay(c, 5); // 5 days through the real propose/commit pipeline
  check('pipeline: 5 day-ticks drip 2500gp into invested', hex.landImprovementInvested === 2500, 'invested ' + hex.landImprovementInvested);
  check('pipeline: 5 day-ticks debit treasury 2500 (pay-as-you-build)', d.treasury.gp === 997500, 'treasury ' + d.treasury.gp);
  check('pipeline: 5 day-ticks reduce budget to 22500', hex.improvementBudgetGp === 22500, 'budget ' + hex.improvementBudgetGp);
  check('pipeline: day clock advanced to day 6', c.currentDayInMonth === 6, 'day ' + c.currentDayInMonth);
}

// ─────────────────────────────────────────────────────────────────────────────
// Week/month aggregation — a multi-day tick collapses to ONE summary line per project
// (no per-day spam), and the merged record still commits the correct weekly total.
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Time-based construction: week/month record aggregation ---');
{
  function buildTwo(){
    const c = ACKS.blankCampaign({ name: 'agg' });
    c.houseRules = {}; c.projects = []; c.currentDayInMonth = 1;
    c.calendar = { year:1, month:1, day:1, kind:'default' };
    const d = ACKS.blankDomain({ name: 'D' }); d.treasury = { gp: 1000000 };
    const h1 = ACKS.blankHex({ id: 'hex-a1', coord:{q:0,r:0} }); h1.valuePerFamily = 6; h1.domainId = d.id; h1.improvementBudgetGp = 25000;
    const h2 = ACKS.blankHex({ id: 'hex-a2', coord:{q:1,r:0} }); h2.valuePerFamily = 6; h2.domainId = d.id; h2.improvementBudgetGp = 25000;
    d.geography.hexes = [h1, h2]; c.hexes = [h1, h2]; c.domains = [d];
    ACKS.syncAgriculturalProject(c, h1, { domainId: d.id });
    ACKS.syncAgriculturalProject(c, h2, { domainId: d.id });
    return { c, d, h1, h2, p1: ACKS.findAgriculturalProject(c, 'hex-a1'), p2: ACKS.findAgriculturalProject(c, 'hex-a2') };
  }

  // A 7-day tick over two projects: 14 per-day records collapse to 2 (one per project).
  let t = buildTwo();
  const weekProposal = ACKS.proposeDayTick(t.c, 7);
  const agRecs = weekProposal.pendingRecords.filter(r => r.agriculturalDrip);
  check('week-agg: 7-day tick over 2 projects -> ONE record per project (not 14)', agRecs.length === 2, 'records ' + agRecs.length + ' :: ' + JSON.stringify(weekProposal.pendingRecords.map(r => r.label)));
  const r1 = agRecs.find(r => r.projectId === t.p1.id);
  check('week-agg: merged record daysAdded summed to 7', r1 && r1.daysAdded === 7, r1 && ('days ' + r1.daysAdded));
  check('week-agg: merged record dripProjected summed to 3500 (7×500)', r1 && r1.dripProjected === 3500, r1 && ('drip ' + r1.dripProjected));
  check('week-agg: merged label reads "over 7 days"', r1 && /over 7 days/.test(r1.label || ''), r1 && r1.label);
  check('week-agg: merged label carries the weekly total (+3,?500gp)', r1 && /\+3.?500gp/.test(r1.label || ''), r1 && r1.label);

  // …and the merged record commits the full weekly total (commitConstructionRecord recomputes drip from daysAdded).
  ACKS.commitDayTick(t.c, weekProposal, null);
  check('week-agg: commit applies the weekly total (project 1 invested 3500)', t.h1.landImprovementInvested === 3500, 'invested ' + t.h1.landImprovementInvested);
  check('week-agg: commit applies the weekly total (project 2 invested 3500)', t.h2.landImprovementInvested === 3500, 'invested ' + t.h2.landImprovementInvested);
  check('week-agg: treasury debited 7000 total (2 × 3500 pay-as-you-build)', t.d.treasury.gp === 1000000 - 7000, 'treasury ' + t.d.treasury.gp);
  check('week-agg: day clock advanced to day 8', t.c.currentDayInMonth === 8, 'day ' + t.c.currentDayInMonth);

  // A single-day tick is unchanged: the per-day label is NOT rewritten to "over 1 day".
  t = buildTwo();
  const dayProposal = ACKS.proposeDayTick(t.c, 1);
  const oneRec = dayProposal.pendingRecords.find(r => r.projectId === t.p1.id);
  check('week-agg: single-day tick keeps the per-day label (no "over" rewrite)', oneRec && !/over 1 day/.test(oneRec.label || '') && /\+500gp/.test(oneRec.label || ''), oneRec && oneRec.label);
  check('week-agg: single-day tick still commits 500 into invested', (function(){ ACKS.commitDayTick(t.c, dayProposal, null); return t.h1.landImprovementInvested === 500; })(), 'invested ' + t.h1.landImprovementInvested);
}

// ─────────────────────────────────────────────────────────────────────────────
// Treasury-limited drip — pay-as-you-build clips the drip to the domain's actual cash, and the
// label says so (resolves the "+1,500 over 7 days but 33,500 budget left" confusion).
// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Time-based construction: treasury-limited drip annotation ---');
{
  function buildPoor(treasuryGp){
    const c = ACKS.blankCampaign({ name: 'tlim' });
    c.houseRules = {}; c.projects = []; c.currentDayInMonth = 1;
    c.calendar = { year:1, month:1, day:1, kind:'default' };
    const d = ACKS.blankDomain({ name: 'Poor' }); d.treasury = { gp: treasuryGp };
    const h = ACKS.blankHex({ id:'hex-tl', coord:{q:0,r:0} }); h.valuePerFamily = 6; h.domainId = d.id; h.improvementBudgetGp = 25000;
    d.geography.hexes = [h]; c.hexes = [h]; c.domains = [d];
    ACKS.syncAgriculturalProject(c, h, { domainId: d.id });
    return { c, d, h, proj: ACKS.findAgriculturalProject(c, 'hex-tl') };
  }

  // Single-day: cash ≥ the daily rate is not limited; cash < rate drips the cash and flags it.
  const rich1 = buildPoor(1000000);
  check('treasury-limit: cash ≥ rate → not treasury-limited', ACKS.computeAgriculturalDrip(rich1.c, rich1.proj, 1).treasuryLimited === false);
  const t200 = buildPoor(200);
  const d200 = ACKS.computeAgriculturalDrip(t200.c, t200.proj, 1);
  check('treasury-limit: cash < rate (200) → drips 200 + flags treasuryLimited', d200.drip === 200 && d200.treasuryLimited === true, JSON.stringify({drip:d200.drip, tl:d200.treasuryLimited}));
  const t0 = buildPoor(0);
  const d0 = ACKS.computeAgriculturalDrip(t0.c, t0.proj, 1);
  check('treasury-limit: empty treasury → drip 0, blockReason "treasury empty", flagged', d0.drip === 0 && d0.blockReason === 'treasury empty' && d0.treasuryLimited === true, JSON.stringify({drip:d0.drip, br:d0.blockReason}));

  // A week with 1,200gp: 2 full days (1,000) + a 200 partial, then dry → 1,200 total, flagged + labeled.
  const wk = buildPoor(1200);
  const rec = ACKS.proposeDayTick(wk.c, 7).pendingRecords.find(r => r.agriculturalDrip);
  check('treasury-limit: week drip clipped to treasury (1,200, not 3,500)', rec && rec.dripProjected === 1200, rec && ('drip ' + rec.dripProjected));
  check('treasury-limit: merged record flagged treasuryLimited', rec && rec.treasuryLimited === true, rec && JSON.stringify({tl:rec.treasuryLimited}));
  check('treasury-limit: merged label says "limited by treasury"', rec && /limited by treasury/.test(rec.label || ''), rec && rec.label);
  check('treasury-limit: merged label still shows budget left (budget was NOT the limiter)', rec && /budget left/.test(rec.label || ''), rec && rec.label);

  // A fully-funded week is NOT flagged or annotated (no false positives).
  const richRec = ACKS.proposeDayTick(buildPoor(1000000).c, 7).pendingRecords.find(r => r.agriculturalDrip);
  check('treasury-limit: well-funded week is NOT treasury-limited (3,500, no annotation)', richRec && richRec.dripProjected === 3500 && !richRec.treasuryLimited && !/limited by treasury/.test(richRec.label || ''), richRec && richRec.label);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Summary ---');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
if(failed === 0){
  console.log('\nAll agricultural-projects (Wave Construction-B) smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nSome checks failed. Review output above.');
  process.exit(1);
}
