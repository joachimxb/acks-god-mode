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
  'acks-engine-catalogs.js',
  'acks-engine.js',
  'acks-engine-entities.js',
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
function mockHelpers(){
  return {
    incomeSum: () => 0,
    expenseSum: () => 0,
    moraleModSum: () => 0,
    totalFamilies: (d) => (d.demographics && d.demographics.peasantFamilies) || 0,
    effectiveUrbanFamilies: (d) => (d.demographics && d.demographics.urbanFamilies) || 0,
    domainXpFromNet: () => 0,
    rulerCharacter: () => null,
    addCharacterHistory: () => {},
    applyVagaryToVenture: () => '',
    processPassiveInvestmentsForTurn: () => ({ totalGp: 0, payouts: [] }),
    checkAllCharacterLevelUps: () => [],
    isHouseRuleEnabled: () => false,
  };
}

// Build a synthetic single-domain campaign with hand-placed hexes. No calendar (keeps
// the economic oracle deterministic — calendar/day-tick is exercised separately below).
function buildOracleCampaign(hexSpecs){
  const campaign = ACKS.blankCampaign({ name: 'Ag oracle' });
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
const helpers = mockHelpers();
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
  try { ACKS.commitTurn(oracle.campaign, oracle.campaign.domains, proposal, helpers); }
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
  try { ACKS.commitTurn(clip.campaign, clip.campaign.domains, buildProposal(clip.domain, { 0: 25000 }), mockHelpers()); }
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
  try { ACKS.commitTurn(c.campaign, c.campaign.domains, buildProposal(c.domain, { 0: 25000 }), mockHelpers()); }
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
