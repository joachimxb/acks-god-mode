/* Phase 4 Construction Wave C — STRONGHOLD_CATALOG rebuilt to RR r10 p.132 — smoke.
 *
 * Run from "ACKS God Mode/" (or via `npm test`):  node tests/stronghold-catalog.smoke.js
 *
 * Covers:
 *   1. RAW ORACLE — spot rows match RR r10 p.132 exactly (cost + the new shp/ac/unitCapacity columns).
 *      The shipped catalog was stale: keep 75k (RAW 125k), barbican 38k (RAW 20k), towers ~2× high,
 *      rampart 2500 (RAW 300), building-wood 1500 (RAW 350). This pins the corrected values.
 *   2. SHAPE — 33 atomic structures, unique keys, every row carries key/name/cost/shp/ac/unitCapacity,
 *      category ∈ the four the dropdown groups by.
 *   3. RECONCILE — the atomic keys the shipped templates/demo use now resolve (keep-stone,
 *      tower-small-round, palisade-wooden, chapter-house); the renamed/dropped old keys are gone
 *      (keep-square, palisade, building-stone, gatehouse, rampart).
 *   4. SHIPPED-DATA CROSS-CHECK — every structureKey in the demo + all 6 templates either resolves in
 *      the catalog OR is a documented composite/dwarven descriptor (so a new unknown atomic key is
 *      flagged here rather than silently costing 0 under stronghold-by-buildings).
 *   5. ZERO-DRIFT / RULE GATE — rule OFF: strongholdValue uses the component buildValue (the catalog
 *      cost change is inert on shipped data); rule ON: strongholdValue sums the catalog costs.
 *
 * Authored 2026-06-18 (Wave Construction-C catalog rebuild; CLAUDE §8). The W6 siege engine still
 * estimates shp = buildValue÷10 — wiring it to these RAW shp values is a future siege-engine touch.
 */
'use strict';
const path = require('path');
const fs   = require('fs');
require('./_engine.js').load();
const ACKS = global.ACKS;
const CAT  = ACKS.STRONGHOLD_CATALOG;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail !== undefined ? '  -- ' + detail : '')); failed++; }
}
const byKey = k => CAT.find(s => s.key === k) || null;

// ─────────────────────────────────────────────────────────────────────────────
// 1. RAW oracle — RR r10 p.132 spot rows (cost · shp · ac · unitCapacity)
// ─────────────────────────────────────────────────────────────────────────────
const ORACLE = {
  'keep-stone':         { cost: 125000, shp: 16000, ac: 6, unitCapacity: 6   },
  'barbican':           { cost:  20000, shp:  2750, ac: 6, unitCapacity: 2   },
  'headquarters':       { cost:  25000, shp:  2000, ac: 5, unitCapacity: 2   },
  'tower-small-square': { cost:   6500, shp:   825, ac: 6, unitCapacity: 0.5 },
  'tower-small-round':  { cost:   7500, shp:   650, ac: 8, unitCapacity: 0.5 },
  'tower-medium-round': { cost:  10000, shp:   850, ac: 8, unitCapacity: 0.5 },
  'tower-large-round':  { cost:  18500, shp:  1600, ac: 8, unitCapacity: 1.5 },
  'tower-huge-round':   { cost:  27500, shp:  2400, ac: 8, unitCapacity: 2   },
  'wall-10':            { cost:   2500, shp:   425, ac: 6, unitCapacity: 1.5 },
  'wall-40':            { cost:  15000, shp:  2550, ac: 6, unitCapacity: 1.5 },
  'wall-60':            { cost:  30000, shp:  5100, ac: 6, unitCapacity: 1.5 },
  'gatehouse-20':       { cost:   6000, shp:   750, ac: 6, unitCapacity: 1   },
  'gatehouse-30':       { cost:   7500, shp:  1000, ac: 6, unitCapacity: 1   },
  'drawbridge':         { cost:    300, shp:     6, ac: 3, unitCapacity: 0   },
  'palisade-wooden':    { cost:    125, shp:     9, ac: 2, unitCapacity: 1.5 },
  'palisade-crude':     { cost:   12.5, shp:     3, ac: 2, unitCapacity: 1.5 },
  'rampart-rammed':     { cost:    300, shp:   425, ac: 4, unitCapacity: 1.5 },
  'rampart-piled':      { cost:     30, shp:   135, ac: 3, unitCapacity: 1.5 },
  'battlement':         { cost:    500, shp:   100, ac: 6, unitCapacity: 0   },
  'moat-filled':        { cost:    800, shp:  1000, ac: 3, unitCapacity: 0   },
  'moat-unfilled-crude':{ cost:     40, shp:  1000, ac: 3, unitCapacity: 0   },
  'chapter-house':      { cost:   2400, shp:   200, ac: 5, unitCapacity: 1   },
  'building-concrete':  { cost:   1700, shp:   135, ac: 5, unitCapacity: 1   },
  'building-wood':      { cost:    350, shp:    25, ac: 1, unitCapacity: 1   },
  'wall-walk':          { cost:    125, shp:    10, ac: 2, unitCapacity: 0   }
};
for(const [key, exp] of Object.entries(ORACLE)){
  const row = byKey(key);
  check('oracle row present: ' + key, !!row);
  if(row){
    check(key + ' cost = ' + exp.cost, row.cost === exp.cost, row.cost);
    check(key + ' shp = ' + exp.shp, row.shp === exp.shp, row.shp);
    check(key + ' ac = ' + exp.ac, row.ac === exp.ac, row.ac);
    check(key + ' unitCapacity = ' + exp.unitCapacity, row.unitCapacity === exp.unitCapacity, row.unitCapacity);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Shape — 33 atomic structures, unique keys, full columns, 4 categories
// ─────────────────────────────────────────────────────────────────────────────
check('33 structures (RR r10 p.132 row count)', CAT.length === 33, CAT.length);
check('keys unique', new Set(CAT.map(s => s.key)).size === CAT.length);
const CATEGORIES = new Set(['Towers', 'Walls', 'Gates & barriers', 'Buildings']);
let shapeOk = true, catOk = true;
for(const s of CAT){
  if(typeof s.key !== 'string' || typeof s.name !== 'string' ||
     typeof s.cost !== 'number' || typeof s.shp !== 'number' ||
     typeof s.ac !== 'number' || typeof s.unitCapacity !== 'number' ||
     typeof s.category !== 'string'){ shapeOk = false; console.log('   bad shape @', s.key); }
  if(!CATEGORIES.has(s.category)){ catOk = false; console.log('   bad category @', s.key, s.category); }
}
check('every row has key/name/cost/shp/ac/unitCapacity/category', shapeOk);
check('every category ∈ the four the dropdown groups by', catOk);
check('lookupStrongholdStructure resolves a valid key', !!ACKS.lookupStrongholdStructure('keep-stone'));
check('lookupStrongholdStructure returns null for a bogus key', ACKS.lookupStrongholdStructure('not-a-structure') === null);

// ─────────────────────────────────────────────────────────────────────────────
// 3. Reconcile — the atomic template/demo keys resolve; old keys gone
// ─────────────────────────────────────────────────────────────────────────────
for(const k of ['keep-stone', 'tower-small-round', 'palisade-wooden', 'chapter-house']){
  check('atomic template key resolves: ' + k, !!byKey(k));
}
for(const k of ['keep-square', 'palisade', 'building-stone', 'gatehouse', 'rampart', 'tower']){
  check('stale key removed: ' + k, byKey(k) === null, 'still present');
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Shipped-data cross-check — every structureKey resolves OR is a documented descriptor
// ─────────────────────────────────────────────────────────────────────────────
// Composite whole-stronghold + dwarven descriptors the catalog deliberately does NOT carry
// (their component buildValue is authoritative; stronghold-by-buildings is off by default).
const COMPOSITE_OK = new Set([
  'citadel-stone', 'castle-stone', 'cathedral-fortified', 'keep-stone-small', 'bridge-keep',
  'vault-gates-great', 'vault-halls', 'vault-gates-small', 'vault-halls-small'
]);
function collectStructureKeys(camp, into){
  for(const d of (camp.domains || [])){
    const s = d.stronghold; if(!s) continue;
    const comps = Array.isArray(s.components) ? s.components : [s];
    for(const c of comps) for(const row of (c.structures || [])) if(row.structureKey) into.add(row.structureKey);
  }
}
const allKeys = new Set();
require(path.join(__dirname, '..', 'acks-demo-template.js'));
collectStructureKeys(global.ACKS_DEMO_TEMPLATE, allKeys);
const tplDir = path.join(__dirname, '..', 'Templates');
for(const f of fs.readdirSync(tplDir).filter(x => x.endsWith('.acks.json'))){
  collectStructureKeys(JSON.parse(fs.readFileSync(path.join(tplDir, f), 'utf8')), allKeys);
}
let unknown = [];
for(const k of allKeys){ if(!byKey(k) && !COMPOSITE_OK.has(k)) unknown.push(k); }
check('every shipped structureKey resolves OR is a documented descriptor', unknown.length === 0, 'unknown: ' + unknown.join(', '));
// the demo's three keys specifically now resolve (keep-stone was keep-square pre-rebuild)
for(const k of ['keep-stone', 'tower-small-round', 'chapter-house']){
  check('demo key resolves post-rebuild: ' + k, !!byKey(k));
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Rule gate — OFF uses buildValue (zero-drift on shipped data); ON sums the catalog
// ─────────────────────────────────────────────────────────────────────────────
const dWithStructures = () => ({ stronghold: { components: [
  { buildValue: 60000, structures: [
    { structureKey: 'keep-stone', quantity: 1 },   // catalog 125,000
    { structureKey: 'wall-30',    quantity: 4 }     // catalog 7,500 × 4 = 30,000
  ] }
] } });
check('rule OFF → strongholdValue uses buildValue (catalog inert)',
  ACKS.strongholdValue({ houseRules: {} }, dWithStructures()) === 60000,
  ACKS.strongholdValue({ houseRules: {} }, dWithStructures()));
check('rule ON → strongholdValue sums catalog costs (125000 + 30000)',
  ACKS.strongholdValue({ houseRules: { 'stronghold-by-buildings': { enabled: true } } }, dWithStructures()) === 155000,
  ACKS.strongholdValue({ houseRules: { 'stronghold-by-buildings': { enabled: true } } }, dWithStructures()));

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nstronghold-catalog.smoke: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
