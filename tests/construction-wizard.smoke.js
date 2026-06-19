/* Phase 4 Construction Wave C — the Construction Wizard ENGINE smoke (creation verb + forecast +
 * completion→stronghold-component wiring).
 *
 * Run from "ACKS God Mode/" (or via `npm test`):  node tests/construction-wizard.smoke.js
 *
 * Covers (acks-engine.js + acks-engine-catalogs.js + acks-engine-events.js):
 *   0. EXPORTS — the new surface is present.
 *   1. CF↔GP — constructionLaborForGp(gp) = gp × CONSTRUCTION_CF_PER_GP (RR p.174: 30 cf/gp).
 *   2. SUPERVISOR — projectRequiresSupervisor (structure yes, agricultural no); projectSupervisorCostAdequacy
 *      (engineer 100k / siege 25k caps, additive, on-site gate, must cover the project cost — RR p.174).
 *   3. startConstructionProject — creates an under-construction Project, computes laborRequired from
 *      totalCost, pushes it; opts.start===false leaves it 'planning'.
 *   4. FORECAST — projectConstructionForecast mirrors the day-tick math: crew cf/day, the worker-count
 *      cap throttle when realistic, mage-assist multiplier, days-to-complete, supervisor-cost gating.
 *   5. ADVANCE — the day-tick consumer (proposeConstructionDay/commitConstructionRecord) accrues labor.
 *   6. COMPLETION → COMPONENT (the payoff) — a domain-owned stronghold-component, on construction-completed,
 *      mints the Constructible AND adds a real stronghold component (so strongholdValue grows) + the
 *      forward/back link pair; migration-safe (re-running the lift adds no duplicate); zero-drift on the
 *      other completion paths (character-owned / repair add no component).
 *   7. LEGACY SEED — a legacy single-stronghold domain seeds its existing value as the first component, so
 *      the new component adds to it rather than dropping it.
 *
 * Authored 2026-06-18 (Wave Construction-C, the Wizard slice; CLAUDE §8).
 */
'use strict';
require('./_engine.js').load();
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail !== undefined ? '  -- ' + detail : '')); failed++; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 0. Exports
// ─────────────────────────────────────────────────────────────────────────────
check('startConstructionProject exported',    typeof ACKS.startConstructionProject === 'function');
check('projectConstructionForecast exported', typeof ACKS.projectConstructionForecast === 'function');
check('projectRequiresSupervisor exported',   typeof ACKS.projectRequiresSupervisor === 'function');
check('projectSupervisorCostAdequacy exported', typeof ACKS.projectSupervisorCostAdequacy === 'function');
check('constructionLaborForGp exported',      typeof ACKS.constructionLaborForGp === 'function');
check('CONSTRUCTION_CF_PER_GP exported',      ACKS.CONSTRUCTION_CF_PER_GP === 30);

// ─────────────────────────────────────────────────────────────────────────────
// 1. cf↔gp conversion (RR p.174 — 30 cf/gp)
// ─────────────────────────────────────────────────────────────────────────────
check('laborForGp 125,000gp → 3,750,000 cf', ACKS.constructionLaborForGp(125000) === 3750000);
check('laborForGp 7,500gp → 225,000 cf',     ACKS.constructionLaborForGp(7500) === 225000);
check('laborForGp 0 → 0',                    ACKS.constructionLaborForGp(0) === 0);
check('laborForGp negative clamps to 0',     ACKS.constructionLaborForGp(-5) === 0);
// Consistency with the agricultural 500gp/day "Typical Laborer": 3,000 laborers = 15,000 cf/day = 500 gp/day.
check('3,000 laborers build 500gp/day',      (3000 * 5) / ACKS.CONSTRUCTION_CF_PER_GP === 500);

// ─────────────────────────────────────────────────────────────────────────────
// Campaign — an engineer (Engineering → 100k cap), a siege engineer (Siege Engineering → 25k),
// a non-supervisor; a components-shaped domain + a legacy single-stronghold domain.
// ─────────────────────────────────────────────────────────────────────────────
function makeCampaign(){
  return {
    schemaVersion: 2, currentTurn: 5, houseRules: {},   // abstract-construction OFF → realistic (RR p.174)
    characters: [
      { id:'chr-eng',   name:'Cassian',  currentHexId:'hex-seat', proficiencies:[{key:'engineering', ranks:1}] },        // 100,000gp cap
      { id:'chr-siege', name:'Brakka',   currentHexId:'hex-seat', proficiencies:[{key:'siege-engineering', ranks:1}] },  // 25,000gp cap
      { id:'chr-eng2',  name:'Vorath',   currentHexId:'hex-seat', proficiencies:[{key:'engineering', ranks:1}] },        // 100,000gp cap
      { id:'chr-eng-away', name:'Distant', currentHexId:'hex-far', proficiencies:[{key:'engineering', ranks:1}] },       // 100k but off-site
      { id:'chr-none',  name:'Aldric',   currentHexId:'hex-seat', proficiencies:[] }                                     // 0 cap
    ],
    hexes: [ { id:'hex-seat', domainId:'dom-x', settlement:{ families:200 } }, { id:'hex-far', domainId:'dom-x' } ],
    constructibles: [],
    domains: [
      // components-shaped domain (the shipped shape) with one existing 75,000gp component
      { id:'dom-x', name:'March X', rulerCharacterId:'chr-eng',
        stronghold: { components:[ { schemaVersion:2, id:'cmp-existing', type:'Castle', name:'Old Castle', buildValue:75000, structures:[] } ] },
        geography: { hexes:[ { id:'hex-seat', domainId:'dom-x' } ] } },
      // legacy single-stronghold domain (no components array) worth 40,000gp
      { id:'dom-legacy', name:'March Legacy', rulerCharacterId:null,
        stronghold: { type:'Keep', name:'Old Keep', buildValue:40000 },
        geography: { hexes:[ { id:'hex-legacy', domainId:'dom-legacy' } ] } }
    ]
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Supervisor adequacy (RR p.174)
// ─────────────────────────────────────────────────────────────────────────────
check('requiresSupervisor: stronghold-component YES', ACKS.projectRequiresSupervisor({ constructibleKind:'stronghold-component' }) === true);
check('requiresSupervisor: agricultural NO',          ACKS.projectRequiresSupervisor({ constructibleKind:'agricultural-improvement' }) === false);
{
  const camp = makeCampaign();
  // 1 engineer (100k) vs a 125k project → cap below cost → NOT ok.
  const a = ACKS.projectSupervisorCostAdequacy(camp, { siteHexId:'hex-seat', totalCost:125000, supervisorCharacterIds:['chr-eng'] });
  check('1 engineer (100k) under-covers 125k', a.ok === false && a.totalCap === 100000, JSON.stringify(a));
  // 2 engineers (additive 200k) cover 125k.
  const b = ACKS.projectSupervisorCostAdequacy(camp, { siteHexId:'hex-seat', totalCost:125000, supervisorCharacterIds:['chr-eng','chr-eng2'] });
  check('2 engineers (200k additive) cover 125k', b.ok === true && b.totalCap === 200000, JSON.stringify(b));
  // siege engineer = 25k cap, covers a 7,500 tower.
  const c = ACKS.projectSupervisorCostAdequacy(camp, { siteHexId:'hex-seat', totalCost:7500, supervisorCharacterIds:['chr-siege'] });
  check('siege engineer (25k) covers 7,500gp', c.ok === true && c.totalCap === 25000);
  // an off-site engineer does not count.
  const d = ACKS.projectSupervisorCostAdequacy(camp, { siteHexId:'hex-seat', totalCost:50000, supervisorCharacterIds:['chr-eng-away'] });
  check('off-site engineer does not count', d.ok === false && d.totalCap === 0, JSON.stringify(d));
  // a non-supervisor (no proficiency) → cap 0.
  const e = ACKS.projectSupervisorCostAdequacy(camp, { siteHexId:'hex-seat', totalCost:1000, supervisorCharacterIds:['chr-none'] });
  check('non-supervisor → cap 0, blocked', e.ok === false && e.totalCap === 0);
  // none assigned.
  const f = ACKS.projectSupervisorCostAdequacy(camp, { siteHexId:'hex-seat', totalCost:1000, supervisorCharacterIds:[] });
  check('no supervisor assigned → blocked', f.ok === false && /no supervisor/.test(f.blockReason));
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. startConstructionProject
// ─────────────────────────────────────────────────────────────────────────────
{
  const camp = makeCampaign();
  const p = ACKS.startConstructionProject(camp, {
    constructibleKind:'stronghold-component', constructibleSubtype:'keep-stone', name:'New Keep',
    siteHexId:'hex-seat', ownerDomainId:'dom-x', totalCost:125000,
    workerCounts:{ laborer:3000 }, supervisorCharacterIds:['chr-eng','chr-eng2'],
    completionSpec:{ componentType:'Keep', structures:[{ structureKey:'keep-stone', quantity:1 }] }
  });
  check('startConstructionProject returns the project', !!p && !!p.id);
  check('  pushed to campaign.projects', camp.projects.length === 1 && camp.projects[0] === p);
  check('  under-construction', p.lifecycleState === 'under-construction');
  check('  startedAtTurn stamped', p.startedAtTurn === 5);
  check('  laborRequired = 125,000 × 30', p.laborRequired === 3750000);
  check('  totalCost carried', p.totalCost === 125000);
  check('  completionSpec carried', p.completionSpec && p.completionSpec.componentType === 'Keep');
  // start:false → planning (the day-tick ignores it)
  const camp2 = makeCampaign();
  const pp = ACKS.startConstructionProject(camp2, { name:'Planned', totalCost:5000, start:false });
  check('start:false → planning', pp.lifecycleState === 'planning' && pp.startedAtTurn === null);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Forecast — cf math + worker-cap throttle + supervisor gating
// ─────────────────────────────────────────────────────────────────────────────
{
  const camp = makeCampaign();
  // 200 laborers, 1 supervisor (worker-cap 100) → realistic throttle ×(100/200) = 500 cf/day.
  const proj = { constructibleKind:'stronghold-component', siteHexId:'hex-seat', totalCost:7500,
    workerCounts:{ laborer:200 }, supervisorCharacterIds:['chr-siege'], laborInvested:0 };
  const f = ACKS.projectConstructionForecast(camp, proj);
  check('forecast laborRequired = 225,000', f.laborRequired === 225000);
  check('forecast workerTotal = 200', f.workerTotal === 200);
  check('forecast workerCap = 100 (1 sup × 100)', f.workerCap === 100);
  check('forecast capLimited true', f.capLimited === true);
  check('forecast dailyCf throttled to 500', f.dailyCf === 500, 'dailyCf=' + f.dailyCf);
  check('forecast dailyGp = 500/30', Math.abs(f.dailyGp - (500/30)) < 1e-9);
  check('forecast dailyWageGp = 200 × 0.1 = 20', Math.abs(f.dailyWageGp - 20) < 1e-9);
  check('forecast daysToComplete = ceil(225000/500) = 450', f.daysToComplete === 450, 'days=' + f.daysToComplete);
  check('forecast pctComplete 0', f.pctComplete === 0);
  check('forecast requiresSupervisor true', f.requiresSupervisor === true);
  check('forecast supervisorOk true (siege 25k ≥ 7,500)', f.supervisorOk === true);
  // raise the cost above the siege engineer's 25k cap → supervisorOk false (realistic)
  const f2 = ACKS.projectConstructionForecast(camp, Object.assign({}, proj, { totalCost:50000 }));
  check('forecast supervisorOk false (cost > cap)', f2.supervisorOk === false && /below project cost/.test(f2.supervisorBlockReason));
  // abstract-construction ON → no throttle, no supervisor gate
  const campA = makeCampaign(); campA.houseRules = { 'abstract-construction': { enabled:true } };
  const fa = ACKS.projectConstructionForecast(campA, Object.assign({}, proj, { totalCost:50000 }));
  check('abstract: no worker-cap throttle (1000 cf/day)', fa.dailyCf === 1000 && fa.capLimited === false);
  check('abstract: supervisorOk true regardless', fa.supervisorOk === true);
  // a crewless project never completes
  const f0 = ACKS.projectConstructionForecast(camp, { constructibleKind:'stronghold-component', siteHexId:'hex-seat', totalCost:7500, workerCounts:{}, supervisorCharacterIds:['chr-siege'] });
  check('no crew → daysToComplete null', f0.daysToComplete === null && f0.dailyCf === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Day-tick advance accrues labor (proposeConstructionDay/commitConstructionRecord)
// ─────────────────────────────────────────────────────────────────────────────
{
  const camp = makeCampaign(); camp.houseRules = { 'abstract-construction': { enabled:true } }; // no throttle for a clean count
  const p = ACKS.startConstructionProject(camp, { constructibleKind:'stronghold-component', name:'Tower',
    siteHexId:'hex-seat', ownerDomainId:'dom-x', totalCost:7500, workerCounts:{ laborer:100 } });  // 100×5 = 500 cf/day
  const out = ACKS.proposeConstructionDay(camp, { days:10 });
  const rec = (out.pendingRecords || []).find(r => r.projectId === p.id);
  check('day-tick proposes a record', !!rec && rec.laborGained === 5000, rec && rec.laborGained);
  ACKS.commitConstructionRecord(camp, rec);
  check('commit accrues laborInvested', p.laborInvested === 5000 && p.daysElapsed === 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. Completion → stronghold component (the payoff) + migration-safety
// ─────────────────────────────────────────────────────────────────────────────
{
  const camp = makeCampaign();
  const before = ACKS.strongholdValue(camp, camp.domains[0]);
  check('strongholdValue before = 75,000 (the existing component)', before === 75000);
  const p = ACKS.startConstructionProject(camp, { constructibleKind:'stronghold-component', name:'New Keep',
    constructibleSubtype:'keep-stone', siteHexId:'hex-seat', ownerDomainId:'dom-x', totalCost:125000,
    workerCounts:{ laborer:3000 }, supervisorCharacterIds:['chr-eng','chr-eng2'],
    completionSpec:{ componentType:'Keep', structures:[{ structureKey:'keep-stone', quantity:1 }] } });
  const ev = ACKS.newEvent('construction-completed', { payload:{ projectId:p.id }, submittedBy:'gm', status:'applied' });
  const out = ACKS.applyEvent(camp, ev);
  // a Constructible was minted
  const csts = camp.constructibles.filter(c => c.constructibleKind === 'stronghold-component');
  check('completion minted a Constructible', csts.length === 1 && csts[0].buildValue === 125000, JSON.stringify(out.result));
  const cst = csts[0];
  // a real stronghold component was added → value grew
  const dom = camp.domains[0];
  check('domain now has 2 components', dom.stronghold.components.length === 2);
  const added = dom.stronghold.components.find(c => c.name === 'New Keep');
  check('  added component buildValue 125,000', added && added.buildValue === 125000);
  check('  added component type "Keep"', added && added.type === 'Keep');
  check('  added component carries structures', added && Array.isArray(added.structures) && added.structures[0] && added.structures[0].structureKey === 'keep-stone');
  check('  forward link comp.constructibleId === cst.id', added && added.constructibleId === cst.id);
  check('  back link cst.functionData.legacyComponentId === comp.id', cst.functionData && cst.functionData.legacyComponentId === added.id);
  check('strongholdValue grew to 200,000', ACKS.strongholdValue(camp, dom) === 200000, ACKS.strongholdValue(camp, dom));
  check('project now complete', p.lifecycleState === 'complete');
  // migration-safety: the lift treats the completion-added component as already-mirrored (its
  // constructibleId is the dedup key) → it is NOT re-minted a second time. (The lift DOES mirror the
  // pre-existing/legacy strongholds the test didn't pre-link — that's the migration doing its normal job.)
  const keepMirrors = () => camp.constructibles.filter(c => c.functionData && c.functionData.legacyComponentId === added.id);
  check('added component has exactly 1 mirror before re-lift', keepMirrors().length === 1);
  const keepCstId = added.constructibleId;
  ACKS.migrateStrongholdComponentsToConstructibles(camp);
  check('re-lift does NOT re-mirror the added component', keepMirrors().length === 1 && added.constructibleId === keepCstId);
  check('strongholdValue unchanged after re-lift', ACKS.strongholdValue(camp, dom) === 200000);
}

// 6b. character-owned / repair completions add NO stronghold component (zero-drift on other paths)
{
  const camp = makeCampaign();
  const p = ACKS.startConstructionProject(camp, { constructibleKind:'stronghold-component', name:'Char Tower',
    siteHexId:'hex-seat', ownerCharacterId:'chr-eng', totalCost:7500, workerCounts:{ laborer:100 } });   // owner = character, no domain
  const before = ACKS.strongholdValue(camp, camp.domains[0]);
  ACKS.applyEvent(camp, ACKS.newEvent('construction-completed', { payload:{ projectId:p.id }, submittedBy:'gm', status:'applied' }));
  check('character-owned completion mints a Constructible', camp.constructibles.some(c => c.name === 'Char Tower'));
  check('character-owned adds NO stronghold component', ACKS.strongholdValue(camp, camp.domains[0]) === before && camp.domains[0].stronghold.components.length === 1);

  const camp2 = makeCampaign();
  const pr = ACKS.startConstructionProject(camp2, { constructibleKind:'stronghold-component', name:'Repair', isRepair:true,
    repairTargetConstructibleId:'cst-x', siteHexId:'hex-seat', ownerDomainId:'dom-x', totalCost:5000, workerCounts:{ laborer:100 } });
  const b2 = ACKS.strongholdValue(camp2, camp2.domains[0]);
  ACKS.applyEvent(camp2, ACKS.newEvent('construction-completed', { payload:{ projectId:pr.id }, submittedBy:'gm', status:'applied' }));
  check('repair completion adds NO stronghold component', ACKS.strongholdValue(camp2, camp2.domains[0]) === b2 && camp2.domains[0].stronghold.components.length === 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Legacy single-stronghold seed — the new component adds to the legacy value, not over it
// ─────────────────────────────────────────────────────────────────────────────
{
  const camp = makeCampaign();
  const dom = camp.domains[1];   // dom-legacy, single-stronghold worth 40,000
  check('legacy strongholdValue = 40,000', ACKS.strongholdValue(camp, dom) === 40000);
  const p = ACKS.startConstructionProject(camp, { constructibleKind:'stronghold-component', name:'New Wall',
    siteHexId:'hex-legacy', ownerDomainId:'dom-legacy', totalCost:5000, workerCounts:{ laborer:100 },
    completionSpec:{ componentType:'', structures:[{ structureKey:'wall-stone-20', quantity:1 }] } });
  ACKS.applyEvent(camp, ACKS.newEvent('construction-completed', { payload:{ projectId:p.id }, submittedBy:'gm', status:'applied' }));
  check('legacy domain now has a components array', Array.isArray(dom.stronghold.components));
  check('  seeded the legacy 40,000 as the first component + added the new 5,000', ACKS.strongholdValue(camp, dom) === 45000, ACKS.strongholdValue(camp, dom));
  check('  two components present (legacy seed + new)', dom.stronghold.components.length === 2);
}

console.log((failed === 0 ? 'PASS' : 'FAIL') + ' construction-wizard.smoke — ' + passed + ' passed, ' + failed + ' failed');
if(failed > 0) process.exit(1);
