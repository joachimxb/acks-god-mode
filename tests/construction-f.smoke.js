/* Phase 4 Construction Wave F — Damage + Repair smoke.
 *
 * Run from "ACKS God Mode/" (or via `npm test`):  node tests/construction-f.smoke.js
 *
 * Covers (acks-engine-construction.js + acks-engine-events.js):
 *   0. EXPORTS — constructionRepairCost / constructibleNeedsRepair.
 *   1. REPAIR COST (RR p.339) — (shpLost / maxShp) × buildValue when SHP is tracked; a damageState-fraction
 *      estimate (damaged 25% / breached 50% / ruined 75% / destroyed 100%) when it isn't.
 *   2. needsRepair — true for any non-intact damageState.
 *   3. REPAIR COMPLETION (the real fix) — a completed isRepair Project RESTORES its target's SHP +
 *      damageState (→ intact) rather than spawning a spurious new Constructible. Via the event-apply path
 *      AND the Day Clock (the Wave-E completion fix carries repair completion to the day-tick).
 *   4. MULTI-STORY CASCADE — destroying a sub-structure story collapses every story above it; a structure
 *      reduced to 0 SHP takes all its sub-structures with it.
 *
 * Authored 2026-06-21 (Wave Construction-F; CLAUDE §8).
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
check('constructionRepairCost exported',   typeof ACKS.constructionRepairCost === 'function');
check('constructibleNeedsRepair exported', typeof ACKS.constructibleNeedsRepair === 'function');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Repair cost (RR p.339)
// ─────────────────────────────────────────────────────────────────────────────
check('40% SHP lost of 15,000gp → 6,000gp', ACKS.constructionRepairCost(ACKS.blankConstructible({ buildValue:15000, maxShp:1000, currentShp:600 })) === 6000);
check('full SHP → 0 repair cost',           ACKS.constructionRepairCost(ACKS.blankConstructible({ buildValue:15000, maxShp:1000, currentShp:1000 })) === 0);
check('destroyed (no SHP) → full buildValue', ACKS.constructionRepairCost(ACKS.blankConstructible({ buildValue:10000, damageState:'destroyed' })) === 10000);
check('breached (no SHP) → 50%',            ACKS.constructionRepairCost(ACKS.blankConstructible({ buildValue:10000, damageState:'breached' })) === 5000);
check('damaged (no SHP) → 25%',             ACKS.constructionRepairCost(ACKS.blankConstructible({ buildValue:10000, damageState:'damaged' })) === 2500);
check('intact → 0',                         ACKS.constructionRepairCost(ACKS.blankConstructible({ buildValue:10000, damageState:'intact' })) === 0);

// ─────────────────────────────────────────────────────────────────────────────
// 2. needsRepair
// ─────────────────────────────────────────────────────────────────────────────
check('needsRepair(intact) false',   ACKS.constructibleNeedsRepair(ACKS.blankConstructible({ damageState:'intact' })) === false);
check('needsRepair(damaged) true',   ACKS.constructibleNeedsRepair(ACKS.blankConstructible({ damageState:'damaged' })) === true);
check('needsRepair(destroyed) true', ACKS.constructibleNeedsRepair(ACKS.blankConstructible({ damageState:'destroyed' })) === true);

// ─────────────────────────────────────────────────────────────────────────────
// 3. Repair completion — restore the target, no spurious duplicate
// ─────────────────────────────────────────────────────────────────────────────
function damagedCamp(){
  const camp = ACKS.blankCampaign(); camp.currentTurn = 1; camp.currentDayInMonth = 1;
  camp.houseRules = { 'abstract-construction': { enabled: true } };
  const cst = ACKS.blankConstructible({ id:'c1', constructibleKind:'settlement-building', constructibleSubtype:'temple', name:'Temple', hexId:'hex-x', buildValue:15000, maxShp:1000, currentShp:400, damageState:'breached',
    subStructures:[{ key:'g', level:0, maxShp:500, currentShp:200, damageState:'damaged' }] });
  camp.constructibles.push(cst);
  return { camp, cst };
}
{
  // (a) the event-apply path
  const { camp, cst } = damagedCamp();
  const p = ACKS.startConstructionProject(camp, { constructibleKind:'settlement-building', name:'Repair Temple', isRepair:true, repairTargetConstructibleId:'c1', totalCost: ACKS.constructionRepairCost(cst), workerCounts:{ laborer:1 } });
  ACKS.applyEvent(camp, ACKS.newEvent('construction-completed', { payload:{ projectId:p.id }, submittedBy:'gm', status:'applied' }));
  check('repair completion restores currentShp to maxShp', cst.currentShp === 1000);
  check('  damageState → intact',                          cst.damageState === 'intact');
  check('  sub-structure restored too',                    cst.subStructures[0].currentShp === 500 && cst.subStructures[0].damageState === 'intact');
  check('  NO spurious duplicate Constructible',           camp.constructibles.length === 1);
}
{
  // (b) the Day Clock path (the Wave-E completion fix carries repair to the day-tick)
  const { camp, cst } = damagedCamp();
  ACKS.startConstructionProject(camp, { constructibleKind:'settlement-building', name:'Repair Temple', isRepair:true, repairTargetConstructibleId:'c1', totalCost:6000, workerCounts:{ laborer:100000 } });
  ACKS.runDayTickToMonthEnd(camp);
  check('repair completes on the Day Clock → target intact', cst.damageState === 'intact' && cst.currentShp === 1000);
  check('  no spurious duplicate on the day-tick path',      camp.constructibles.length === 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Multi-story cascade
// ─────────────────────────────────────────────────────────────────────────────
function tower(){
  const camp = ACKS.blankCampaign(); camp.currentTurn = 1;
  const t = ACKS.blankConstructible({ id:'t1', name:'Tower', maxShp:0, currentShp:0,
    subStructures:[ { key:'g', level:0, maxShp:100, currentShp:100, damageState:'intact' },
                    { key:'u1', level:1, maxShp:80, currentShp:80, damageState:'intact' },
                    { key:'u2', level:2, maxShp:60, currentShp:60, damageState:'intact' } ] });
  camp.constructibles.push(t);
  return { camp, t };
}
{
  const { camp, t } = tower();
  ACKS.applyEvent(camp, ACKS.newEvent('construction-damaged', { payload:{ constructibleId:'t1', subStructureKey:'g', shpLost:100 }, submittedBy:'gm', status:'applied' }));
  check('destroying the ground story collapses every upper story',
    t.subStructures.every(s => s.damageState === 'destroyed'));
}
{
  // Destroying an UPPER story does NOT cascade downward.
  const { camp, t } = tower();
  ACKS.applyEvent(camp, ACKS.newEvent('construction-damaged', { payload:{ constructibleId:'t1', subStructureKey:'u1', shpLost:80 }, submittedBy:'gm', status:'applied' }));
  check('destroying an upper story leaves lower stories standing',
    t.subStructures[0].damageState === 'intact' && t.subStructures[1].damageState === 'destroyed' && t.subStructures[2].damageState === 'destroyed');
}
{
  // A structure reduced to 0 SHP takes every sub-structure with it.
  const camp = ACKS.blankCampaign();
  const t = ACKS.blankConstructible({ id:'t2', name:'Keep', maxShp:1000, currentShp:1000,
    subStructures:[ { key:'g', level:0, maxShp:100, currentShp:100, damageState:'intact' }, { key:'u', level:1, maxShp:80, currentShp:80, damageState:'intact' } ] });
  camp.constructibles.push(t);
  ACKS.applyEvent(camp, ACKS.newEvent('construction-damaged', { payload:{ constructibleId:'t2', shpLost:1000 }, submittedBy:'gm', status:'applied' }));
  check('a structure at 0 SHP destroys all its sub-structures', t.damageState === 'destroyed' && t.subStructures.every(s => s.damageState === 'destroyed'));
}

console.log((failed === 0 ? 'PASS' : 'FAIL') + ' construction-f.smoke — ' + passed + ' passed, ' + failed + ' failed');
if(failed > 0) process.exit(1);
