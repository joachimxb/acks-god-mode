/* tests/provisioning.smoke.js — Phase 2.5 Provisioning (food / water / foraging) suite.
 *
 *   node tests/provisioning.smoke.js   (or via `npm test`)
 *
 * V1 (data layer): hex water-source flags (hasLake / freshWater) + the lake-alias fix; per-member
 * survival fields on blankCharacter; the ration-item shape (rationType / daysRemaining) + factory;
 * the water-container model (waterskin 1/5 day, barrel 20 days) + waterCapacityDays accessor; the
 * EQUIPMENT_CATALOG provisioning rows (range-priced rations + barrel + animal feed); migrate-no-op
 * preservation. Covers Provisioning §1–§5 + §13 V1. (V2+ resolution waves append below as they land.)
 */
'use strict';
const path = require('path');

const DIR = path.join(__dirname, '..');
[
  'acks-engine-catalogs.js',
  'acks-engine.js',
  'acks-engine-entities.js',
  'acks-engine-entity-registry.js',
  'acks-engine-field-schemas.js',
  'acks-engine-events.js',
  'acks-engine-subsystems.js',
].forEach(f => require(path.join(DIR, f)));
const ACKS = global.ACKS;
require(path.join(DIR, 'acks-demo-template.js'));
const DEMO = global.ACKS_DEMO_TEMPLATE;

// ─── tiny assertion harness ───
let pass = 0, fail = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); }
}
function section(t) { console.log('\n— ' + t); }
const approx = (a, b) => Math.abs(a - b) < 1e-9;

// =============================================================================
section('Hex — fresh-water flags (§3.1)');
const hPlain = ACKS.blankHex({ coord: { q: 0, r: 0 } });
ok('blankHex defaults hasLake=false', hPlain.hasLake === false);
ok('blankHex defaults freshWater=false', hPlain.freshWater === false);
const hLake = ACKS.blankHex({ coord: { q: 1, r: 0 }, terrain: 'grassland', hasLake: true });
ok('hasLake honored from opts', hLake.hasLake === true && hLake.terrain === 'grassland');
const hFresh = ACKS.blankHex({ coord: { q: 2, r: 0 }, terrain: 'water', freshWater: true });
ok('freshWater honored from opts', hFresh.freshWater === true && hFresh.terrain === 'water');
ok('truthy-but-not-true opts.hasLake does not set (strict ===true)', ACKS.blankHex({ hasLake: 1 }).hasLake === false);

section('Hex — "lake" alias no longer salt water (§3.1)');
ok('"lake" terrain fill ≠ salt "water" fill', ACKS.hexFillColor({ terrain: 'lake' }, 'terrain') !== ACKS.hexFillColor({ terrain: 'water' }, 'terrain'));
ok('"sea" still aliases to water (salt)', ACKS.hexFillColor({ terrain: 'sea' }, 'terrain') === ACKS.hexFillColor({ terrain: 'water' }, 'terrain'));

// =============================================================================
section('Character — per-member survival fields (§3.2)');
const c0 = ACKS.blankCharacter({ name: 'Traveller' });
ok('waterDaysCarried defaults 0', c0.waterDaysCarried === 0);
ok('foodDeficitDays defaults 0', c0.foodDeficitDays === 0);
ok('waterDeficitDays defaults 0', c0.waterDeficitDays === 0);
ok('underfed defaults false', c0.underfed === false);
ok('starving defaults false', c0.starving === false);
ok('dehydrated defaults false', c0.dehydrated === false);
ok('conLossHunger defaults 0', c0.conLossHunger === 0);
ok('conLossThirst defaults 0', c0.conLossThirst === 0);
ok('legacy hungerDays/dehydrationDays still present (V1 additive)', c0.hungerDays === 0 && c0.dehydrationDays === 0);
const cSeed = ACKS.blankCharacter({ foodDeficitDays: 3, waterDaysCarried: 2, dehydrated: true, conLossThirst: 4 });
ok('survival fields honored from opts', cSeed.foodDeficitDays === 3 && cSeed.waterDaysCarried === 2 && cSeed.dehydrated === true && cSeed.conLossThirst === 4);

// =============================================================================
section('Water containers — capacity model (§3.4 / §5)');
ok('waterskin = 1/5 day capacity', approx(ACKS.waterContainerDaysFor({ catalogId: 'waterskin' }), 1 / 5));
ok('barrel = 20 days capacity', ACKS.waterContainerDaysFor({ catalogId: 'barrel-20gal' }) === 20);
ok('container detected by name when no catalogId', approx(ACKS.waterContainerDaysFor({ name: 'Waterskin' }), 1 / 5));
ok('explicit waterCapacityDays on a line wins', ACKS.waterContainerDaysFor({ waterCapacityDays: 7 }) === 7);
ok('non-container item = 0 capacity', ACKS.waterContainerDaysFor({ catalogId: 'sword' }) === 0);
ok('null item = 0 capacity', ACKS.waterContainerDaysFor(null) === 0);
// holder capacity = Σ containers
const skinGuy = { inventory: [{ catalogId: 'waterskin' }, { catalogId: 'waterskin' }, { catalogId: 'sword' }] };
ok('character with 2 skins = 2/5 day capacity', approx(ACKS.waterCapacityDays(skinGuy), 2 / 5));
const barrelStash = { items: [{ catalogId: 'barrel-20gal' }, { catalogId: 'waterskin' }] };
ok('stash with a barrel + skin = 20.2 days', approx(ACKS.waterCapacityDays(barrelStash), 20 + 1 / 5));
ok('empty holder = 0 capacity', ACKS.waterCapacityDays({ inventory: [] }) === 0);

// =============================================================================
section('Rations — item shape + factory (§3.3)');
const r = ACKS.makeRationLine({ rationType: 'iron', daysRemaining: 7 });
ok('iron week-pack: name + catalogId', r.name === 'Rations, Iron (one week)' && r.catalogId === 'rations-iron-week');
ok('iron week-pack: rationType + daysRemaining', r.rationType === 'iron' && r.daysRemaining === 7);
ok('fresh week-pack weighs ~1 st (7 × 1/6)', approx(r.stone, 7 / 6));
ok('itemEncumbranceSt reads the ration stone', approx(ACKS.itemEncumbranceSt(r), 7 / 6));
const rHalf = ACKS.makeRationLine({ rationType: 'iron', daysRemaining: 3 });
ok('half-eaten pack weighs less (3 × 1/6)', approx(rHalf.stone, 3 / 6));
ok('makeRationLine defaults to a full iron week', (() => { const d = ACKS.makeRationLine(); return d.rationType === 'iron' && d.daysRemaining === 7; })());
const rStd = ACKS.makeRationLine({ rationType: 'standard', daysRemaining: 7 });
ok('standard week-pack: type + catalogId', rStd.rationType === 'standard' && rStd.catalogId === 'rations-standard-week');
ok('isRationLine true for a ration line', ACKS.isRationLine(r) === true);
ok('isRationLine false for a sword', ACKS.isRationLine({ catalogId: 'sword', name: 'Sword' }) === false);
ok('rationLineDays reads days', ACKS.rationLineDays(rHalf) === 3);
ok('rationDaysAvailable sums a holder', ACKS.rationDaysAvailable({ inventory: [r, rHalf, { catalogId: 'sword' }] }) === 10);
ok('ration daily-weight constants (food 1/6 + water 5/6 = 1 st)', approx(ACKS.RATION_FOOD_ST_PER_DAY + ACKS.RATION_WATER_ST_PER_DAY, 1));

// =============================================================================
section('Catalog — provisioning rows (§2.1)');
const iron = ACKS.lookupEquipment('rations-iron-week');
ok('rations-iron-week in catalog', !!iron && iron.category === 'gear');
ok('iron rations range-priced 1–6 gp (low-end default)', iron.priceMinGp === 1 && iron.priceMaxGp === 6 && iron.listPriceGp === 1);
const std = ACKS.lookupEquipment('rations-standard-week');
ok('standard rations range-priced 0.35–3 gp', std && std.priceMinGp === 0.35 && std.priceMaxGp === 3 && std.listPriceGp === 0.35);
const barrel = ACKS.lookupEquipment('barrel-20gal');
ok('barrel present (15 st, 20-day capacity)', barrel && barrel.stone === 15 && barrel.waterCapacityDays === 20);
ok('waterskin tagged with 1/5-day capacity', approx(ACKS.lookupEquipment('waterskin').waterCapacityDays, 1 / 5));
ok('animal feed superior + inferior present', !!ACKS.lookupEquipment('animal-feed-superior') && !!ACKS.lookupEquipment('animal-feed-inferior'));
ok('provisioning rows show in the gear category', ACKS.equipmentByCategory('gear').some(e => e.id === 'rations-iron-week'));

// =============================================================================
section('Migrate-no-op — V1 adds no fields to existing/template entities');
// blankHex/blankCharacter gained fields, but migrateCampaign must NOT backfill them onto existing
// hexes/characters (defensive reads instead), so the shipped templates stay byte-equal no-ops.
const demo1 = ACKS.migrateCampaign(JSON.parse(JSON.stringify(DEMO)));
const demo2 = ACKS.migrateCampaign(JSON.parse(JSON.stringify(demo1)));
ok('demo migrate is idempotent (no-op on 2nd pass)', JSON.stringify(demo1) === JSON.stringify(demo2));
ok('migrate does NOT stamp hasLake onto legacy hexes (defensive reads)', (demo1.hexes || []).every(h => !('hasLake' in h)));
ok('migrate does NOT stamp waterDaysCarried onto legacy chars (defensive reads)', (demo1.characters || []).every(c => !('waterDaysCarried' in c)));

// ─── summary ───
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — provisioning.smoke.js: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { console.log('Failures:\n  - ' + failures.join('\n  - ')); process.exit(1); }
