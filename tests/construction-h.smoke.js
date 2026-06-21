/* Phase 4 Construction Wave H — Civic monuments / traps / field fortifications / roads smoke.
 *
 * Run from "ACKS God Mode/" (or via `npm test`):  node tests/construction-h.smoke.js
 *
 * Covers (acks-engine-construction.js — the Wave-H catalogs + the generic subtype lookup):
 *   0. EXPORTS — the 4 catalogs + constructionSubtypeCatalog + findConstructionSubtype.
 *   1. CIVIC MONUMENTS (RR p.133) — statues ×5 (200 / 3,125 / 25,000 / 200,000 / 3,125,000) + the
 *      quadrifrontal triumphal arch (10,000); colorModifier flagged.
 *   2. TRAPS (RR p.133) — 14 traps with RAW costs (arrow 400 / ceiling-collapse 1,200 / whipping-branch 10).
 *   3. FIELD FORTIFICATIONS (RR p.133 + the W5 border fort RR p.451) — the 10,000gp border fort + the crude
 *      works flagged (palisade-crude / rampart-piled / ditch-crude).
 *   4. ROADS (RR p.133) — per-mile costs by surface (leveled 100/125, gravel 200/250, paved 400/500),
 *      perMile flagged.
 *   5. GENERIC LOOKUP — constructionSubtypeCatalog(kind) returns the editable-cost catalog for each Wave-E/H
 *      kind; vessel/war-machine are NOT in it (null); findConstructionSubtype resolves + unknown → null.
 *   6. DAY-CLOCK COMPLETION — a civic-monument + a road Project complete on the Day Clock and spawn a
 *      Constructible of the right kind/subtype (the Wave-E completion fix carries every kind).
 *
 * Authored 2026-06-21 (Wave Construction-H; CLAUDE §8).
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
check('CIVIC_MONUMENT_CATALOG exported',      Array.isArray(ACKS.CIVIC_MONUMENT_CATALOG));
check('TRAP_CATALOG exported',                Array.isArray(ACKS.TRAP_CATALOG));
check('FIELD_FORTIFICATION_CATALOG exported', Array.isArray(ACKS.FIELD_FORTIFICATION_CATALOG));
check('ROAD_CATALOG exported',                Array.isArray(ACKS.ROAD_CATALOG));
check('constructionSubtypeCatalog exported',  typeof ACKS.constructionSubtypeCatalog === 'function');
check('findConstructionSubtype exported',     typeof ACKS.findConstructionSubtype === 'function');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Civic monuments (RR p.133)
// ─────────────────────────────────────────────────────────────────────────────
check('6 civic monuments', ACKS.CIVIC_MONUMENT_CATALOG.length === 6);
const fc = (kind, key) => ACKS.findConstructionSubtype(kind, key);
check("statue-10 cost 200",        fc('civic-monument','statue-10').cost === 200);
check("statue-25 cost 3,125",      fc('civic-monument','statue-25').cost === 3125);
check("statue-50 cost 25,000",     fc('civic-monument','statue-50').cost === 25000);
check("statue-100 cost 200,000",   fc('civic-monument','statue-100').cost === 200000);
check("statue-250 cost 3,125,000", fc('civic-monument','statue-250').cost === 3125000);
check("triumphal arch cost 10,000", fc('civic-monument','triumphal-arch').cost === 10000);
check('monuments carry colorModifier', ACKS.CIVIC_MONUMENT_CATALOG.every(m => m.colorModifier === true));

// ─────────────────────────────────────────────────────────────────────────────
// 2. Traps (RR p.133)
// ─────────────────────────────────────────────────────────────────────────────
check('14 traps', ACKS.TRAP_CATALOG.length === 14);
check('arrow-firing 400',     fc('trap','arrow-firing').cost === 400);
check('ceiling-collapse 1,200', fc('trap','ceiling-collapse').cost === 1200);
check('portcullis 1,850',     fc('trap','portcullis').cost === 1850);
check('whipping-branch 10',   fc('trap','whipping-branch').cost === 10);
check('every trap has a cost + page', ACKS.TRAP_CATALOG.every(t => typeof t.cost === 'number' && t.page));

// ─────────────────────────────────────────────────────────────────────────────
// 3. Field fortifications (RR p.133 + p.451)
// ─────────────────────────────────────────────────────────────────────────────
check('7 field fortifications', ACKS.FIELD_FORTIFICATION_CATALOG.length === 7);
check('border-fort cost 10,000 (RR p.451)', fc('field-fortification','border-fort').cost === 10000);
check('palisade-wooden cost 125',           fc('field-fortification','palisade-wooden').cost === 125);
check('rampart-rammed cost 300',            fc('field-fortification','rampart-rammed').cost === 300);
['palisade-crude','rampart-piled','ditch-crude'].forEach(k =>
  check('  ' + k + ' flagged crude', fc('field-fortification', k).crude === true));
check('non-crude works are NOT flagged crude', !fc('field-fortification','border-fort').crude && !fc('field-fortification','palisade-wooden').crude);

// ─────────────────────────────────────────────────────────────────────────────
// 4. Roads (RR p.133)
// ─────────────────────────────────────────────────────────────────────────────
check('6 roads', ACKS.ROAD_CATALOG.length === 6);
check('leveled-earth-8 100/mi',  fc('road','leveled-earth-8').cost === 100);
check('leveled-earth-10 125/mi', fc('road','leveled-earth-10').cost === 125);
check('gravel-8 200/mi',         fc('road','gravel-8').cost === 200);
check('paved-10 500/mi',         fc('road','paved-10').cost === 500);
check('roads flagged perMile', ACKS.ROAD_CATALOG.every(r => r.perMile === true));

// ─────────────────────────────────────────────────────────────────────────────
// 5. Generic lookup
// ─────────────────────────────────────────────────────────────────────────────
['settlement-building','civic-monument','trap','field-fortification','road'].forEach(k =>
  check('constructionSubtypeCatalog(' + k + ') is the editable-cost catalog', Array.isArray(ACKS.constructionSubtypeCatalog(k)) && ACKS.constructionSubtypeCatalog(k).length > 0));
check('constructionSubtypeCatalog(vessel) → null (own fixed-cost path)',      ACKS.constructionSubtypeCatalog('vessel') === null);
check('constructionSubtypeCatalog(war-machine) → null',                       ACKS.constructionSubtypeCatalog('war-machine') === null);
check('constructionSubtypeCatalog(stronghold-component) → null',              ACKS.constructionSubtypeCatalog('stronghold-component') === null);
check('findConstructionSubtype(trap, deadfall) resolves',                     fc('trap','deadfall').label === 'Deadfall');
check('findConstructionSubtype(trap, unknown) → null',                        fc('trap','nope') === null);
check('findConstructionSubtype(unknown-kind, x) → null',                      fc('not-a-kind','x') === null);

// ─────────────────────────────────────────────────────────────────────────────
// 6. Day-Clock completion (the Wave-E fix carries every kind)
// ─────────────────────────────────────────────────────────────────────────────
function rig(kind, subtype){
  const camp = ACKS.blankCampaign();
  camp.currentTurn = 1; camp.currentDayInMonth = 1;
  camp.houseRules = { 'abstract-construction': { enabled: true } };
  const dom = ACKS.blankDomain({ id:'dom-x', name:'D' }); camp.domains.push(dom);
  camp.hexes.push(ACKS.blankHex({ id:'hex-x', domainId:'dom-x' }));
  ACKS.startConstructionProject(camp, { constructibleKind:kind, constructibleSubtype:subtype, name:'X', siteHexId:'hex-x', ownerDomainId:'dom-x', totalCost:10000, workerCounts:{ laborer:100000 } });
  ACKS.runDayTickToMonthEnd(camp);
  return camp;
}
{
  const camp = rig('civic-monument', 'triumphal-arch');
  const c = (camp.constructibles || [])[0];
  check('civic-monument completes on the Day Clock → Constructible', (camp.constructibles || []).length === 1 && c && c.constructibleKind === 'civic-monument' && c.constructibleSubtype === 'triumphal-arch');
}
{
  const camp = rig('road', 'paved-10');
  const c = (camp.constructibles || [])[0];
  check('road completes on the Day Clock → Constructible', (camp.constructibles || []).length === 1 && c && c.constructibleKind === 'road' && c.constructibleSubtype === 'paved-10');
}

console.log((failed === 0 ? 'PASS' : 'FAIL') + ' construction-h.smoke — ' + passed + ' passed, ' + failed + ' failed');
if(failed > 0) process.exit(1);
