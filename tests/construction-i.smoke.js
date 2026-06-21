/* Phase 4 Construction Wave I — Vagaries + crude-weather degradation + house rules smoke.
 *
 * Run from "ACKS God Mode/" (or via `npm test`):  node tests/construction-i.smoke.js
 *
 * Covers (acks-engine-construction.js + acks-engine-catalogs.js + acks-engine-events.js):
 *   0. EXPORTS + RULES — CONSTRUCTION_VAGARY_TABLE / rollConstructionVagary /
 *      processConstructionVagariesForTurn; the construction-vagaries + crude-construction-weather rules
 *      registered (category construction) + default OFF.
 *   1. ROLLER — the 1d100 table bands resolve (~55% nothing); the serious band takes a per-kind flavor.
 *   2. VAGARY PROCESSOR — gated (no-op when both rules off); a setback sets a project's labor BACK
 *      (laborInvested ↓) + adds a cost overrun (gpSpent ↑) + emits a construction-vagary event; a windfall
 *      (good-progress) ADDS labor; agricultural projects are skipped; only under-construction projects roll.
 *   3. construction-vagary handler — applies laborLost (a real delay).
 *   4. CRUDE WEATHER — a CRUDE field-fortification Constructible steps one damage band worse each month
 *      (intact→damaged→…→destroyed); a non-crude work doesn't; gated on crude-construction-weather.
 *
 * Authored 2026-06-21 (Wave Construction-I; CLAUDE §8).
 */
'use strict';
require('./_engine.js').load();
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail !== undefined ? '  -- ' + detail : '')); failed++; }
}
const constant = (v) => () => v;   // a deterministic rng

// ─────────────────────────────────────────────────────────────────────────────
// 0. Exports + rules
// ─────────────────────────────────────────────────────────────────────────────
check('CONSTRUCTION_VAGARY_TABLE exported',          Array.isArray(ACKS.CONSTRUCTION_VAGARY_TABLE));
check('rollConstructionVagary exported',             typeof ACKS.rollConstructionVagary === 'function');
check('processConstructionVagariesForTurn exported', typeof ACKS.processConstructionVagariesForTurn === 'function');
check('construction-vagaries rule registered (construction)',
  !!ACKS.lookupHouseRule('construction-vagaries') && ACKS.lookupHouseRule('construction-vagaries').category === 'construction');
check('crude-construction-weather rule registered (construction)',
  !!ACKS.lookupHouseRule('crude-construction-weather') && ACKS.lookupHouseRule('crude-construction-weather').category === 'construction');
check('both rules default OFF',
  ACKS.isHouseRuleEnabled({ houseRules:{} }, 'construction-vagaries') === false && ACKS.isHouseRuleEnabled({ houseRules:{} }, 'crude-construction-weather') === false);

// ─────────────────────────────────────────────────────────────────────────────
// 1. Roller
// ─────────────────────────────────────────────────────────────────────────────
check('rng 0.0 → roll 1 → none',            ACKS.rollConstructionVagary('vessel', constant(0)).key === 'none');
check('rng 0.6 → bad-weather (delay > 0)',  ACKS.rollConstructionVagary('vessel', constant(0.6)).key === 'bad-weather');
check('rng 0.7 → material-short (cost 5%)', ACKS.rollConstructionVagary('vessel', constant(0.7)).key === 'material-short' && ACKS.rollConstructionVagary('vessel', constant(0.7)).costPct === 5);
check('rng 0.96 → good-progress (delay < 0)', (() => { const v = ACKS.rollConstructionVagary('vessel', constant(0.96)); return v.key === 'good-progress' && v.delayDays < 0; })());
check('rng 0.995 → serious + vessel flavor', ACKS.rollConstructionVagary('vessel', constant(0.995)).label === 'A storm wrecks the slipway');
check('serious flavor by kind — mine = cave-in', ACKS.rollConstructionVagary('mine', constant(0.995)).label.includes('cave-in'));

// ─────────────────────────────────────────────────────────────────────────────
// 2. Vagary processor
// ─────────────────────────────────────────────────────────────────────────────
function projCamp(){
  const camp = ACKS.blankCampaign(); camp.currentTurn = 1;
  const p = ACKS.startConstructionProject(camp, { constructibleKind:'vessel', constructibleSubtype:'galley-2-rower', name:'The Wave', siteHexId:'hx', totalCost:10000, workerCounts:{ laborer:1000 } });
  p.laborInvested = 100000;   // mid-build
  return { camp, p };
}
{
  // gated: no rule → no-op
  const { camp, p } = projCamp();
  const r0 = ACKS.processConstructionVagariesForTurn(camp, { rng: constant(0.7) });
  check('no rule on → processor no-ops', r0.ran === false && p.laborInvested === 100000 && p.gpSpent === 0);
}
{
  // a cost+delay setback: labor back + gpSpent up + an event
  const { camp, p } = projCamp();
  camp.houseRules = { 'construction-vagaries': { enabled:true } };
  const r = ACKS.processConstructionVagariesForTurn(camp, { rng: constant(0.7) });   // material-short (delay 1d3, cost 5%)
  check('vagary ran', r.ran && r.vagaryCount === 1);
  check('  labor set back (a real delay)',  p.laborInvested < 100000, p.laborInvested);
  check('  cost overrun applied (5% of 10,000 = 500)', p.gpSpent === 500, p.gpSpent);
  check('  a construction-vagary event logged', (camp.eventLog || []).some(e => e.event && e.event.kind === 'construction-vagary'));
}
{
  // a windfall (good-progress) ADDS labor
  const { camp, p } = projCamp();
  camp.houseRules = { 'construction-vagaries': { enabled:true } };
  ACKS.processConstructionVagariesForTurn(camp, { rng: constant(0.96) });   // good-progress (delay -1d4)
  check('good-progress vagary adds labor', p.laborInvested > 100000, p.laborInvested);
}
{
  // agricultural projects are skipped; a complete project doesn't roll
  const camp = ACKS.blankCampaign(); camp.currentTurn = 1;
  camp.houseRules = { 'construction-vagaries': { enabled:true } };
  const ag = ACKS.startConstructionProject(camp, { constructibleKind:'agricultural-improvement', name:'Ag', siteHexId:'hx', totalCost:5000, workerCounts:{ laborer:10 } }); ag.laborInvested = 1000;
  const done = ACKS.startConstructionProject(camp, { constructibleKind:'settlement-building', name:'Done', siteHexId:'hx', totalCost:5000, workerCounts:{ laborer:10 } }); done.lifecycleState = 'complete'; done.laborInvested = 5000;
  const r = ACKS.processConstructionVagariesForTurn(camp, { rng: constant(0.7) });
  check('agricultural + complete projects are not vagary-rolled', r.vagaryCount === 0 && ag.gpSpent === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. construction-vagary handler — laborLost
// ─────────────────────────────────────────────────────────────────────────────
{
  const camp = ACKS.blankCampaign(); camp.currentTurn = 1;
  const p = ACKS.startConstructionProject(camp, { constructibleKind:'vessel', name:'V', siteHexId:'hx', totalCost:10000, workerCounts:{ laborer:1 } }); p.laborInvested = 5000;
  ACKS.applyEvent(camp, ACKS.newEvent('construction-vagary', { payload:{ projectId:p.id, vagaryKey:'accident', laborLost:2000, costPenaltyGp:200 }, submittedBy:'gm', status:'applied' }));
  check('handler applies laborLost', p.laborInvested === 3000);
  check('handler applies costPenaltyGp', p.gpSpent === 200);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Crude weather
// ─────────────────────────────────────────────────────────────────────────────
function fortCamp(subtype){
  const camp = ACKS.blankCampaign(); camp.currentTurn = 1;
  const c = ACKS.blankConstructible({ id:'f1', constructibleKind:'field-fortification', constructibleSubtype:subtype, name:'The Palisade', damageState:'intact' });
  camp.constructibles.push(c);
  return { camp, c };
}
{
  // gated: weather off → no degradation
  const { camp, c } = fortCamp('palisade-crude');
  ACKS.processConstructionVagariesForTurn(camp, { rng: constant(0.7) });
  check('weather off → crude work intact', c.damageState === 'intact');
}
{
  // a CRUDE work steps one band worse each month, gone after ~4 months
  const { camp, c } = fortCamp('palisade-crude');
  camp.houseRules = { 'crude-construction-weather': { enabled:true } };
  const states = [];
  for(let i=0;i<5;i++){ ACKS.processConstructionVagariesForTurn(camp, { rng: constant(0.5) }); states.push(c.damageState); }
  check('crude work weathers intact→damaged→breached→ruined→destroyed', states.join('>') === 'damaged>breached>ruined>destroyed>destroyed', states.join('>'));
}
{
  // a NON-crude work (proper palisade / the border fort) does NOT weather
  const { camp, c } = fortCamp('palisade-wooden');
  camp.houseRules = { 'crude-construction-weather': { enabled:true } };
  ACKS.processConstructionVagariesForTurn(camp, { rng: constant(0.5) });
  check('non-crude field work persists (no weather damage)', c.damageState === 'intact');
}

console.log((failed === 0 ? 'PASS' : 'FAIL') + ' construction-i.smoke — ' + passed + ' passed, ' + failed + ' failed');
if(failed > 0) process.exit(1);
