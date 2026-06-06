/* Economy smoke test (audit batch 3 — engine↔UI boundary lift, thermonuclear.md C1 / R1).
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/economy.smoke.js
 *
 * This is the proof the engine now owns the ACKS domain economy and can run a monthly turn
 * with NO UI / NO DOM. Three parts:
 *   (a) Characterization oracle — the lifted engine reproduces the PRE-LIFT browser economy
 *       byte-for-byte on the pristine demo (tests/fixtures/economy-demo-oracle.json).
 *   (b) Hand-computed RAW fixtures — land value (cap 9, RR p.341), service 4gp + tax 2gp on
 *       BOTH peasant and urban families (RR Urban Settlements ▸ Collecting Revenue — codifies the
 *       audit's I2 rebuttal as a test), trade revenue by market class, garrison 2/3/4gp by
 *       classification, the 9-band morale income factor, RAW tribute anchors, and the
 *       henchman-wage subtraction in domainXpFromNet (errata §1.1).
 *   (c) A full HEADLESS turn — proposeMonthlyTurn + commitTurn on the demo with a seeded rng,
 *       no DOM: deterministic (same seed → same treasury/morale/population), treasury deltas
 *       equal the computed monthly net, plus the no-arg-rng default path runs without throwing.
 *
 * The economy lives in acks-engine-economy.js; the orchestration tail (level-ups / passive /
 * vagary / event summaries / char history) in acks-engine.js §9.8a. Authored 2026-06-06.
 */
const path = require('path');
// Load all engine modules in order; each accumulates onto global.ACKS. acks-engine-economy.js
// captures its constants from catalogs/engine/entities at load, so it loads after those three.
[
  'acks-engine-catalogs.js',
  'acks-engine.js',
  'acks-engine-entities.js',
  'acks-engine-economy.js',
  'acks-engine-entity-registry.js',
  'acks-engine-field-schemas.js',
  'acks-engine-events.js',
  'acks-engine-subsystems.js',
  'acks-demo-template.js',
].forEach(f => require(path.join(__dirname, '..', f)));
const ACKS = global.ACKS;
const ORACLE = require(path.join(__dirname, 'fixtures', 'economy-demo-oracle.json'));

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail ? '  -- ' + detail : '')); failed++; }
}

// Deep-equal with a 1e-9 numeric epsilon (one float artifact: garrisonBR). Returns null on match,
// else the dotted path + the two values at the first difference.
function deepDiff(a, b, p){
  p = p || '';
  if(typeof a === 'number' && typeof b === 'number'){
    return Math.abs(a - b) < 1e-9 ? null : (p + ': ' + a + ' !== ' + b);
  }
  if(typeof a === 'string' && typeof b === 'string'){
    // Labels embed gp values via .toLocaleString(), whose digit-group separator is runtime-locale
    // dependent: the browser (where the oracle was captured) groups with commas ("1,880"); Node's
    // default locale uses a space/NBSP ("1 880"). The NUMBER is identical and the live tool always
    // runs in the browser, so strip group separators between digits before comparing — this catches
    // a wrong number (1880 vs 1890) but tolerates the cosmetic separator. (Engine logic is unchanged.)
    const norm = s => s.replace(/(\d)[,\u0020\u00a0\u202f\u2009\u2007](?=\d)/g, '$1');
    return norm(a) === norm(b) ? null : (p + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b));
  }
  if(a === b) return null;
  if(a === null || b === null || typeof a !== 'object' || typeof b !== 'object'){
    return p + ': ' + JSON.stringify(a) + ' !== ' + JSON.stringify(b);
  }
  if(Array.isArray(a) || Array.isArray(b)){
    if(!Array.isArray(a) || !Array.isArray(b)) return p + ': array/non-array mismatch';
    if(a.length !== b.length) return p + ': length ' + a.length + ' !== ' + b.length;
    for(let i = 0; i < a.length; i++){ const d = deepDiff(a[i], b[i], p + '[' + i + ']'); if(d) return d; }
    return null;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for(const k of keys){ const d = deepDiff(a[k], b[k], p ? p + '.' + k : k); if(d) return d; }
  return null;
}

// Rebuild the pristine demo campaign exactly as the loader does: migrateCampaign + the UI's
// _finishLoad post-migrate steps (all engine functions — index.html loadCampaignFromObject / _finishLoad).
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
  return camp;
}

// The lifted engine's full economy snapshot for one domain (mirrors the fixture's 'expected' shape).
function computeDomainEconomy(camp, d){
  const inc = ACKS.incomeBreakdown(camp, d), exp = ACKS.expenseBreakdown(camp, d), mm = ACKS.moraleModifiersFor(camp, d);
  const net = ACKS.monthlyNet(camp, d);
  return {
    name: d.name, income: inc, expenses: exp, moraleMods: mm,
    incomeSum: ACKS.incomeSum({income:inc}), expenseSum: ACKS.expenseSum({expenses:exp}), moraleModSum: ACKS.moraleModSum({moraleMods:mm}),
    monthlyGrossIncome: ACKS.monthlyGrossIncome(camp, d), monthlyExpenses: ACKS.monthlyExpenses(camp, d), monthlyNet: net,
    incomeFactor: ACKS.incomeFactor(d.demographics.morale), tributeOwed: ACKS.tributeOwed(camp, d), domainXpFromNet: ACKS.domainXpFromNet(camp, d, net),
    totalFamilies: ACKS.totalFamilies(d), effectiveUrbanFamilies: ACKS.effectiveUrbanFamilies(d), banditCount: ACKS.banditCount(d),
    garrisonHeadcount: ACKS.garrisonHeadcount(d), garrisonCost: ACKS.garrisonCost(d), garrisonBR: ACKS.garrisonBR(d), requiredGarrison: ACKS.requiredGarrison(camp, d),
    effectiveClassification: ACKS.effectiveDomainClassification(d), effectiveRuler: ACKS.effectiveRuler(camp, d),
    strongholdRequired: ACKS.strongholdRequired(d), strongholdValue: ACKS.strongholdValue(camp, d), domainTotalLandImprovementBonus: ACKS.domainTotalLandImprovementBonus(d),
    marketClass: ACKS.marketClass(d), tradeRevenuePerFamily: ACKS.tradeRevenuePerFamily(d),
    magistrateSalaries: { captainOfGuard: ACKS.magistrateSalaryForRole(camp,d,'captainOfGuard'), chaplain: ACKS.magistrateSalaryForRole(camp,d,'chaplain'), munerator: ACKS.magistrateSalaryForRole(camp,d,'munerator'), steward: ACKS.magistrateSalaryForRole(camp,d,'steward') },
    magistrateAdminCandidates: ACKS.magistrateAdminCandidates(camp, d),
    hexEffectiveValues: ((d.geography && d.geography.hexes) || []).map(h => ({ id:h.id, eff: ACKS.effectiveHexValue(h) })),
    settlements: ACKS.hexSettlements(d).map(x => ({ name:x.settlement.name, marketClass: ACKS.settlementMarketClass(x.settlement), tradeRate: ACKS.settlementTradeRate(x.settlement), capacity: ACKS.settlementCapacity(x.settlement) }))
  };
}

// deterministic rng (mulberry32) for the scriptable headless turn.
function makeRng(seed){ let s = seed >>> 0; return function(){ s = (s + 0x6D2B79F5)|0; let t = Math.imul(s ^ (s>>>15), 1|s); t = (t + Math.imul(t ^ (t>>>7), 61|t)) ^ t; return ((t ^ (t>>>14))>>>0)/4294967296; }; }

console.log('--- Engine surface ---');
['incomeBreakdown','expenseBreakdown','moraleModifiersFor','incomeSum','expenseSum','moraleModSum','monthlyNet','incomeFactor','domainXpFromNet','tributeOwed','effectiveHexValue','domainTotalLandImprovementBonus','settlementTradeRate','settlementMarketClass','settlementCapacity','hexSettlements','totalFamilies','effectiveUrbanFamilies','banditCount','garrisonHeadcount','garrisonCost','garrisonBR','requiredGarrison','strongholdValue','rulerCharacter','effectiveRuler','magistrateSalaryForRole','vassalChainUnder','proposeMonthlyTurn','commitTurn']
  .forEach(fn => check('ACKS.' + fn + ' is a function', typeof ACKS[fn] === 'function', 'got ' + typeof ACKS[fn]));

console.log('--- (a) Characterization oracle: campaign-build fidelity (invariants) ---');
const demo = buildDemoCampaign();
const byId = {};
demo.domains.forEach(d => byId[d.id] = d);
check('demo rebuilt with 4 domains', demo.domains.length === 4, 'got ' + demo.domains.length);
Object.keys(ORACLE.invariants).forEach(id => {
  const d = byId[id], inv = ORACLE.invariants[id];
  if(!d){ check('invariant domain present: ' + id, false); return; }
  check('invariant ' + inv.name, d.demographics.peasantFamilies === inv.peasantFamilies
    && (d.demographics.urbanFamilies||0) === inv.urbanFamiliesRaw
    && d.demographics.morale === inv.morale
    && (d.treasury.gp||0) === inv.treasuryGp
    && ((d.geography&&d.geography.hexes)||[]).length === inv.nestedHexCount
    && ((d.garrison&&d.garrison.units)||[]).length === inv.garrisonUnitCount
    && (d.liegeId||null) === inv.liegeId
    && (d.rulerCharacterId||null) === inv.rulerCharacterId,
    'rebuilt campaign drifted from the captured one for ' + id);
});

console.log('--- (a) Characterization oracle: economy is byte-exact (per domain) ---');
Object.keys(ORACLE.expected).forEach(id => {
  const d = byId[id];
  if(!d){ check('economy domain present: ' + id, false); return; }
  const got = computeDomainEconomy(demo, d);
  const diff = deepDiff(got, ORACLE.expected[id], id);
  check('economy reproduces oracle: ' + ORACLE.expected[id].name, diff === null, diff || '');
});

console.log('--- (b) Hand-computed RAW fixtures ---');
// Land value cap (RR p.341): base + bonus, capped at 9gp/family.
check('effectiveHexValue caps at 9 (8+3 → 9)', ACKS.effectiveHexValue({valuePerFamily:8, landImprovementBonus:3}) === 9);
check('effectiveHexValue 6+1 → 7', ACKS.effectiveHexValue({valuePerFamily:6, landImprovementBonus:1}) === 7);
check('effectiveHexValue 0 → 0', ACKS.effectiveHexValue({}) === 0);

// 9-band morale income factor (RR p.350): -4 → 0, -3 → 0.5, -2 → 0.8, -1..4 → 1.
check('incomeFactor(-4) === 0 (rebellion)', ACKS.incomeFactor(-4) === 0);
check('incomeFactor(-3) === 0.5', ACKS.incomeFactor(-3) === 0.5);
check('incomeFactor(-2) === 0.8', ACKS.incomeFactor(-2) === 0.8);
check('incomeFactor(-1) === 1', ACKS.incomeFactor(-1) === 1);
check('incomeFactor(0) === 1', ACKS.incomeFactor(0) === 1);
check('incomeFactor(4) === 1', ACKS.incomeFactor(4) === 1);
check('incomeFactor clamps out-of-range (99 → 1)', ACKS.incomeFactor(99) === 1);

// Synthetic domain: service 4gp + tax 2gp on peasant AND urban families (RR Collecting Revenue —
// codifies the audit I2 rebuttal), and trade revenue by market class.
function mkCampaign(domain){ return { houseRules:{}, domains:[domain], characters:[], settlements:[], hexes:[] }; }
function mkDomain(over){
  return Object.assign({
    id:'dom-test', name:'Testmark', liegeId:null, rulerCharacterId:null, administersThisMonth:false, classification:'Borderlands',
    demographics:{ peasantFamilies:100, urbanFamilies:0, morale:0 },
    income:{ serviceRevenuePerFamily:4, taxPerFamily:2, landRevenuePerFamily:6, tariffs:0, miscPerFamily:0, miscFlat:0, tributesIn:[], other:[] },
    taxPolicy:{ rate:'standard' },
    expenses:{ liturgyPerFamily:1, tithePaid:true, miscPerFamily:0, miscFlat:0, tributePaid:true, tributeAuto:true, tributeToLiege:0, tithesOut:[] },
    geography:{ hexes:[], controlledHexes:0 },
    garrison:{ units:[] }, stronghold:{ buildValue:0, components:[] }, magistrates:{}
  }, over || {});
}
// fam 100 + urb 220 (a 220-family settlement → Class VI, trade 1gp/family). I2: service + tax on BOTH.
const tradeDom = mkDomain({ demographics:{ peasantFamilies:100, urbanFamilies:0, morale:0 },
  geography:{ controlledHexes:1, hexes:[ { id:'hex-t', valuePerFamily:6, landImprovementBonus:0, families:100, settlement:{ name:'Markettown', families:220, totalInvestment:0 } } ] } });
const tradeRows = ACKS.incomeBreakdown(mkCampaign(tradeDom), tradeDom);
const svcRow = tradeRows.find(r => /^Service revenue/.test(r.label));
const taxRow = tradeRows.find(r => /^Tax /.test(r.label));
const tradeRow = tradeRows.find(r => /^Trade revenue/.test(r.label));
check('service revenue = 4 × (peasant+urban) = 4 × 320 = 1280', svcRow && svcRow.gp === 1280, svcRow && ('got ' + svcRow.gp));
check('tax = 2 × (peasant+urban) = 2 × 320 = 640 (I2 rebuttal: urban families ARE taxed)', taxRow && taxRow.gp === 640, taxRow && ('got ' + taxRow.gp));
check('trade revenue = Class VI rate 1 × 220 = 220', tradeRow && tradeRow.gp === 220 && /Class VI/.test(tradeRow.label), tradeRow && ('got ' + JSON.stringify(tradeRow)));
check('effectiveUrbanFamilies reads the settlement (220)', ACKS.effectiveUrbanFamilies(tradeDom) === 220);

// Garrison required = per-family rate by classification × peasant + 2 × urban (RR p.351).
check('requiredGarrison Civilized = 2 × 100', ACKS.requiredGarrison(mkCampaign(mkDomain({classification:'Civilized'})), mkDomain({classification:'Civilized'})) === 200);
check('requiredGarrison Borderlands = 3 × 100', ACKS.requiredGarrison(mkCampaign(mkDomain({classification:'Borderlands'})), mkDomain({classification:'Borderlands'})) === 300);
check('requiredGarrison Outlands = 4 × 100', ACKS.requiredGarrison(mkCampaign(mkDomain({classification:'Outlands'})), mkDomain({classification:'Outlands'})) === 400);

// RAW tribute anchors (RR p.346 — 18 × realm-families^0.6, round to 5gp). Verified vs the RR table.
check('rawTributeForRealmFamilies(100) === 285', ACKS.rawTributeForRealmFamilies(100) === 285);
check('rawTributeForRealmFamilies(1000) === 1135', ACKS.rawTributeForRealmFamilies(1000) === 1135);
check('rawTributeForRealmFamilies(10000) === 4520', ACKS.rawTributeForRealmFamilies(10000) === 4520);
check('rawTributeForRealmFamilies(100000) === 18000', ACKS.rawTributeForRealmFamilies(100000) === 18000);

// domainXpFromNet (RR p.423 + errata §1.1): max(0, net − henchmanWage − threshold). Non-henchman:
// wage = 0. computeGpThreshold(8) = 5000 (matches the demo's L8 Aelric).
const pcRuler = { id:'chr-pc', name:'PC', level:8, socialTier:'noble', monthlyWage:500 };
const pcDom = mkDomain({ id:'dom-pc', rulerCharacterId:'chr-pc' });
const pcCamp = mkCampaign(pcDom); pcCamp.characters = [pcRuler];
check('computeGpThreshold(8) === 5000 (sanity)', ACKS.computeGpThreshold(8) === 5000);
check('domainXpFromNet non-henchman = max(0, 6000 − 0 − 5000) = 1000', ACKS.domainXpFromNet(pcCamp, pcDom, 6000) === 1000, 'got ' + ACKS.domainXpFromNet(pcCamp, pcDom, 6000));
const henchRuler = { id:'chr-h', name:'Henchman Ruler', level:8, socialTier:'henchman', monthlyWage:500 };
const hDom = mkDomain({ id:'dom-h', rulerCharacterId:'chr-h' });
const hCamp = mkCampaign(hDom); hCamp.characters = [henchRuler];
check('isHenchman(henchRuler) is true (sanity)', ACKS.isHenchman(henchRuler) === true);
check('domainXpFromNet henchman SUBTRACTS the wage = max(0, 6000 − 500 − 5000) = 500', ACKS.domainXpFromNet(hCamp, hDom, 6000) === 500, 'got ' + ACKS.domainXpFromNet(hCamp, hDom, 6000));
check('domainXpFromNet floors at 0 (net below threshold)', ACKS.domainXpFromNet(pcCamp, pcDom, 3000) === 0);

console.log('--- (c) Headless monthly turn (no DOM) ---');
// No-rng default path runs without throwing — the 5-line "engine runs a turn headless" snippet.
let snippetOk = true;
try {
  const c0 = buildDemoCampaign();
  const prop0 = ACKS.proposeMonthlyTurn(c0);
  const res0 = ACKS.commitTurn(c0, prop0);
  snippetOk = !prop0.error && !res0.error && res0.committed === 4 && c0.currentTurn === 6;
} catch(e){ snippetOk = false; console.log('  (snippet threw: ' + e.message + ')'); }
check('default-rng headless turn runs: propose + commit, 4 committed, turn 5 → 6', snippetOk);

// Seeded turn — deterministic + treasury deltas equal the monthly net.
function runSeededTurn(seed){
  const camp = buildDemoCampaign();
  const before = {}; camp.domains.forEach(d => before[d.id] = d.treasury.gp || 0);
  const prop = ACKS.proposeMonthlyTurn(camp, { rng: makeRng(seed) });
  const res = ACKS.commitTurn(camp, prop, { rng: makeRng(seed) });
  return { camp, before, prop, res };
}
const r1 = runSeededTurn(424242);
check('seeded propose has no error + 4 domain rows', !r1.prop.error && r1.prop.turnProposal.length === 4);
check('seeded commit: 4 committed, no error, turn advanced to 6', r1.res.committed === 4 && !r1.res.error && r1.camp.currentTurn === 6);
// Treasury delta == monthly net (incomeFactor 1, no construction queued) PLUS any passive-investment
// payout credited to the domain (the demo's "Saltspur Distillery" pays 30,000 × 1% = 300/mo to
// Saltspur — exercises the lifted processPassiveInvestmentsForTurn in the headless turn). So
// Saltspur: 18000 + net 5595 + 300 = 23895; Northwatch 1930; Saltcombe 3065; Tidewrack 3820.
const passiveByDomain = {};
(buildDemoCampaign().passiveInvestments||[]).forEach(pi => {
  if(pi.enabled && pi.destinationDomainId){ passiveByDomain[pi.destinationDomainId] = (passiveByDomain[pi.destinationDomainId]||0) + ACKS.passiveInvestmentMonthlyGp(pi); }
});
Object.keys(ORACLE.expected).forEach(id => {
  const d = r1.camp.domains.find(x => x.id === id);
  const want = ORACLE.invariants[id].treasuryGp + ORACLE.expected[id].monthlyNet + (passiveByDomain[id]||0);
  check('treasury after turn = before + net (+passive) for ' + ORACLE.expected[id].name + ' (= ' + want + ')', d && (d.treasury.gp||0) === want, d && ('got ' + d.treasury.gp));
});
// Determinism: same seed → identical treasury / morale / population.
const r2 = runSeededTurn(424242);
let deterministic = true;
r1.camp.domains.forEach((d1) => {
  const d2 = r2.camp.domains.find(x => x.id === d1.id);
  if(!d2 || d1.treasury.gp !== d2.treasury.gp || d1.demographics.morale !== d2.demographics.morale || d1.demographics.peasantFamilies !== d2.demographics.peasantFamilies) deterministic = false;
});
check('same seed → identical treasury + morale + population (scriptable)', deterministic);
// A different seed perturbs population/morale (rng actually drives the turn).
const r3 = runSeededTurn(999);
let anyDiff = false;
r1.camp.domains.forEach((d1) => {
  const d3 = r3.camp.domains.find(x => x.id === d1.id);
  if(d3 && (d1.demographics.peasantFamilies !== d3.demographics.peasantFamilies || d1.demographics.morale !== d3.demographics.morale)) anyDiff = true;
});
check('a different seed changes population/morale outcomes', anyDiff);

console.log('\n=============================================');
console.log('economy.smoke.js — Passed: ' + passed + ', Failed: ' + failed);
console.log('=============================================');
if(failed > 0) process.exit(1);
