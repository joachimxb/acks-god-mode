/* Phase 4 Construction Wave C (data layer) smoke — stronghold components → first-class Constructibles.
 *
 * Run from "ACKS God Mode/" (or via `npm test`):  node tests/construction-c.smoke.js
 *
 * Covers migrateStrongholdComponentsToConstructibles (acks-engine.js):
 *   1. SHAPE — a Constructible mirror per content-bearing stronghold/component, correct six-axis +
 *      buildValue + name + subtype + seat hexId + forward/back links; empty placeholders skipped.
 *   2. ZERO-DRIFT — strongholdValue (the economy read) is byte-identical before/after the migration
 *      (it only ADDS a constructibleId pointer to the source, which the economy ignores). Proven on
 *      hand-built domains AND on the shipped demo template.
 *   3. IDEMPOTENCY — re-running reconciles the existing mirror, never duplicates (the migrate-no-op
 *      invariant the shipped templates rely on once regenerated).
 *   4. RECONCILE — a changed source value (a GM edit, or a W4 pillage of s.buildValue) is re-synced
 *      onto the mirror on the next migrate.
 *   5. LEGACY↔COMPONENTS LINK CARRY — migrateStrongholdToComponents carries the mirror link onto the
 *      new component, so a load→convert→save→reload never duplicates the mirror.
 *   6. migrateCampaign HOOK — the migration runs as part of the load path.
 *
 * Authored 2026-06-18 (Wave Construction-C, data-layer-first; CLAUDE §8).
 */
'use strict';
const path = require('path');
require('./_engine.js').load();
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail !== undefined ? '  -- ' + detail : '')); failed++; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 0. Export present
// ─────────────────────────────────────────────────────────────────────────────
check('migrateStrongholdComponentsToConstructibles exported',
  typeof ACKS.migrateStrongholdComponentsToConstructibles === 'function');

// ─────────────────────────────────────────────────────────────────────────────
// Hand-built campaign: a legacy single-stronghold, a components-shaped stronghold,
// an empty stronghold, and an empty-placeholder component.
// ─────────────────────────────────────────────────────────────────────────────
function makeCampaign(){
  return {
    schemaVersion: 2,
    currentTurn: 5,
    houseRules: {},                                   // stronghold-by-buildings OFF → strongholdValue uses buildValue
    characters: [{ id:'chr-baron-b', currentHexId:'hex-b1' }],
    hexes: [
      // domB hexes live ONLY at top-level (exercises the campaign.hexes seat path)
      { id:'hex-b1', domainId:'dom-b', settlement:{ families:120 } },
      { id:'hex-b2', domainId:'dom-b' }
    ],
    constructibles: [],
    domains: [
      // A — legacy single-stronghold shape; hexes ONLY in geography (exercises the nested seat path)
      { id:'dom-a', name:'March A', rulerCharacterId:null,
        stronghold: { type:'Castle (small)', buildValue:75000, maintenancePerMonth:31,
          structures:[{ schemaVersion:2, id:'str-a-keep', structureKey:'keep-stone', quantity:1 }] },
        geography: { hexes:[ { id:'hex-a1', domainId:'dom-a', settlement:{ families:200 } } ] } },
      // B — components shape, two content components; ruler seats at hex-b1
      { id:'dom-b', name:'Barony B', rulerCharacterId:'chr-baron-b',
        stronghold: { components:[
          { schemaVersion:2, id:'str-b1', type:'Tower', name:'Watchtower', buildValue:7500, structures:[], constructibleId:null },
          { schemaVersion:2, id:'str-b2', type:'Keep',  name:'',           buildValue:30000, structures:[], constructibleId:null }
        ] },
        geography: { hexes:[] } },
      // C — empty stronghold (no components) → no mirror
      { id:'dom-c', name:'County C', stronghold:{ components:[] }, geography:{ hexes:[] } },
      // D — a single empty-placeholder component → no mirror
      { id:'dom-d', name:'County D',
        stronghold:{ components:[ { schemaVersion:2, id:'str-d1', type:'', name:'', buildValue:0, structures:[], constructibleId:null } ] },
        geography:{ hexes:[] } }
    ]
  };
}
const findDom = (c, id) => c.domains.find(d => d.id === id);
const domConstructibles = (c, domId) => c.constructibles.filter(x => x.constructibleKind === 'stronghold-component' && x.ownerDomainId === domId);

// ─────────────────────────────────────────────────────────────────────────────
// 2 (pre). Zero-drift baseline — capture strongholdValue before the migration.
// ─────────────────────────────────────────────────────────────────────────────
const camp = makeCampaign();
const svBefore = {};
for(const d of camp.domains) svBefore[d.id] = ACKS.strongholdValue(camp, d);
check('baseline strongholdValue A = 75000', svBefore['dom-a'] === 75000, svBefore['dom-a']);
check('baseline strongholdValue B = 37500', svBefore['dom-b'] === 37500, svBefore['dom-b']);
check('baseline strongholdValue C = 0', svBefore['dom-c'] === 0, svBefore['dom-c']);

ACKS.migrateStrongholdComponentsToConstructibles(camp);

// ─────────────────────────────────────────────────────────────────────────────
// 1. SHAPE
// ─────────────────────────────────────────────────────────────────────────────
check('total mirrors = 3 (A:1 + B:2 + C:0 + D:0)', camp.constructibles.length === 3, camp.constructibles.length);
check('dom-c (empty stronghold) → 0 mirrors', domConstructibles(camp,'dom-c').length === 0);
check('dom-d (empty-placeholder component) → 0 mirrors', domConstructibles(camp,'dom-d').length === 0);

const aM = domConstructibles(camp,'dom-a')[0];
check('A mirror exists', !!aM);
check('A mirror kind', aM && aM.constructibleKind === 'stronghold-component');
check('A mirror name = type (no name)', aM && aM.name === 'Castle (small)', aM && aM.name);
check('A mirror subtype slugified', aM && aM.constructibleSubtype === 'castle-small', aM && aM.constructibleSubtype);
check('A mirror buildValue = 75000', aM && aM.buildValue === 75000, aM && aM.buildValue);
check('A mirror ownerDomainId', aM && aM.ownerDomainId === 'dom-a');
check('A mirror constructionState complete', aM && aM.constructionState === 'complete');
check('A mirror damageState intact', aM && aM.damageState === 'intact');
check('A mirror ownership domain', aM && aM.ownership === 'domain');
check('A mirror siteType stronghold-courtyard', aM && aM.siteType === 'stronghold-courtyard');
check('A mirror seat hexId = hex-a1 (geography-only path)', aM && aM.hexId === 'hex-a1', aM && aM.hexId);
check('A forward link (legacy stronghold object)', findDom(camp,'dom-a').stronghold.constructibleId === (aM && aM.id));
check('A migrated history entry', aM && aM.history.some(h => h.type === 'migrated'));

const bMs = domConstructibles(camp,'dom-b');
const bWatch = bMs.find(x => x.name === 'Watchtower');
const bKeep  = bMs.find(x => x.name === 'Keep');     // no name → type
check('B → 2 mirrors', bMs.length === 2, bMs.length);
check('B Watchtower buildValue 7500', bWatch && bWatch.buildValue === 7500);
check('B Keep (name from type) buildValue 30000', bKeep && bKeep.buildValue === 30000);
check('B forward link on component b1', findDom(camp,'dom-b').stronghold.components[0].constructibleId === (bWatch && bWatch.id));
check('B back link legacyComponentId = str-b1', bWatch && bWatch.functionData.legacyComponentId === 'str-b1');
check('B seat hexId = hex-b1 (ruler hex, campaign.hexes path)', bWatch && bWatch.hexId === 'hex-b1', bWatch && bWatch.hexId);

// ─────────────────────────────────────────────────────────────────────────────
// 2. ZERO-DRIFT — strongholdValue unchanged after the migration
// ─────────────────────────────────────────────────────────────────────────────
for(const d of camp.domains){
  const after = ACKS.strongholdValue(camp, d);
  check('zero-drift strongholdValue ' + d.id, after === svBefore[d.id], after + ' vs ' + svBefore[d.id]);
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. IDEMPOTENCY — re-run reconciles, never duplicates
// ─────────────────────────────────────────────────────────────────────────────
ACKS.migrateStrongholdComponentsToConstructibles(camp);
check('idempotent — still 3 mirrors after 2nd run', camp.constructibles.length === 3, camp.constructibles.length);

// ─────────────────────────────────────────────────────────────────────────────
// 4. RECONCILE — a changed source value re-syncs onto the mirror
// ─────────────────────────────────────────────────────────────────────────────
findDom(camp,'dom-b').stronghold.components[0].buildValue = 9000;   // GM edit / pillage of the source
ACKS.migrateStrongholdComponentsToConstructibles(camp);
const bWatch2 = domConstructibles(camp,'dom-b').find(x => x.functionData.legacyComponentId === 'str-b1');
check('reconcile — mirror buildValue re-synced to 9000', bWatch2 && bWatch2.buildValue === 9000, bWatch2 && bWatch2.buildValue);
check('reconcile — still 3 mirrors (no dup)', camp.constructibles.length === 3, camp.constructibles.length);

// ─────────────────────────────────────────────────────────────────────────────
// 5. LEGACY → COMPONENTS LINK CARRY — convert dom-a, confirm the link survives + no dup
// ─────────────────────────────────────────────────────────────────────────────
const domA = findDom(camp,'dom-a');
const aMirrorId = domA.stronghold.constructibleId;
ACKS.migrateStrongholdToComponents(domA);                          // the UI's load-time conversion
check('convert — dom-a now components-shaped', Array.isArray(domA.stronghold.components) && domA.stronghold.components.length === 1);
check('convert — legacy s.constructibleId dropped', domA.stronghold.constructibleId === undefined);
check('convert — link carried onto component[0]', domA.stronghold.components[0].constructibleId === aMirrorId, domA.stronghold.components[0].constructibleId);
ACKS.migrateStrongholdComponentsToConstructibles(camp);
check('convert — no duplicate mirror after reload (still 3)', camp.constructibles.length === 3, camp.constructibles.length);

// ─────────────────────────────────────────────────────────────────────────────
// 6. migrateCampaign HOOK — runs as part of the load path
// ─────────────────────────────────────────────────────────────────────────────
const fresh = makeCampaign();
ACKS.migrateCampaign(fresh);
check('migrateCampaign hook — mirrors created on load', fresh.constructibles.filter(x => x.constructibleKind === 'stronghold-component').length === 3,
  fresh.constructibles.length);

// ─────────────────────────────────────────────────────────────────────────────
// 7. REAL DATA — the shipped demo template: strongholds mirrored, strongholdValue unchanged
// ─────────────────────────────────────────────────────────────────────────────
require(path.join(__dirname, '..', 'acks-demo-template.js'));
const demoRaw = JSON.parse(JSON.stringify(global.ACKS_DEMO_TEMPLATE));
const demoSvBefore = {};
for(const d of demoRaw.domains) demoSvBefore[d.id] = ACKS.strongholdValue(demoRaw, d);
const demo = ACKS.migrateCampaign(JSON.parse(JSON.stringify(global.ACKS_DEMO_TEMPLATE)));
let demoMirrors = (demo.constructibles || []).filter(x => x.constructibleKind === 'stronghold-component').length;
check('demo — at least one stronghold mirrored', demoMirrors >= 1, demoMirrors);
let demoDrift = false;
for(const d of demo.domains){
  const after = ACKS.strongholdValue(demo, d);
  if(after !== demoSvBefore[d.id]){ demoDrift = true; console.log('   demo drift @', d.id, after, 'vs', demoSvBefore[d.id]); }
}
check('demo — strongholdValue zero-drift across all domains', !demoDrift);
// idempotent on the migrated demo (the regen relies on this)
const demoCount1 = (demo.constructibles||[]).length;
ACKS.migrateStrongholdComponentsToConstructibles(demo);
check('demo — idempotent (constructibles count stable)', (demo.constructibles||[]).length === demoCount1, (demo.constructibles||[]).length + ' vs ' + demoCount1);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nconstruction-c.smoke: ' + passed + ' passed, ' + failed + ' failed');
process.exit(failed ? 1 : 0);
