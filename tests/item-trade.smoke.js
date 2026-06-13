/* tests/item-trade.smoke.js — Retail Item Trade (#346 flagship) IT-1 smoke suite.
 *
 *   node tests/item-trade.smoke.js   (or via `npm test`)
 *
 * Covers the Equipment Availability by Market Class data layer (Phase_2.9_Item_Trade_Plan.md
 * IT-1; RR pp.123–124 + RR p.413):
 *   - the EQUIPMENT_AVAILABILITY 6×6 matrix reproduces BOTH RR p.124 worked examples exactly
 *   - equipmentPriceBand() classifies the band edges (1/2/10/11/100/101/1,000/1,001/10,000/10,001)
 *   - equipmentAvailability() returns count / chance / none cells + applies the four RAW modifiers
 *   - rollEquipmentUnitsAvailable() is deterministic for count cells and rolls per-unit for chance cells
 * The transaction verb (marketBuy/marketSell) + the price catalog land at IT-2 / a follow-up commit.
 */
'use strict';
const path = require('path');

const DIR = path.join(__dirname, '..');
require('./_engine.js').load();
const ACKS = global.ACKS;

// ─── tiny assertion harness ───
let pass = 0, fail = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); }
}
function section(t) { console.log('\n— ' + t); }
const avail = (p, mc, opts) => ACKS.equipmentAvailability(p, mc, opts);

// =============================================================================
section('Matrix shape (RR p.124 — 6 bands × 6 classes)');
// =============================================================================
ok('EQUIPMENT_AVAILABILITY exported', !!ACKS.EQUIPMENT_AVAILABILITY);
ok('6 price bands', ACKS.EQUIPMENT_AVAILABILITY.bands.length === 6);
ok('each band has 6 class cells', ACKS.EQUIPMENT_AVAILABILITY.bands.every(b => b.cells.length === 6));

// =============================================================================
section('RR p.124 worked example #1 — 700 gp heavy warhorse');
// =============================================================================
// "1 in Class III, 25% in Class IV" (Class III = idx 2, Class IV = idx 3).
const wh3 = avail(700, 2);
ok('warhorse Class III = count 1', wh3.kind === 'count' && wh3.count === 1, JSON.stringify(wh3));
const wh4 = avail(700, 3);
ok('warhorse Class IV = 25% chance of one', wh4.kind === 'chance' && wh4.percent === 25 && wh4.count === 1, JSON.stringify(wh4));

// =============================================================================
section('RR p.124 worked example #2 — a Class III market down the bands');
// =============================================================================
// 425 ≤1gp · 35 at 2–10 · 2 at 11–100 · 1 at 101–1,000 · 25% at 1,001–10,000 · 3% at ≥10,001.
ok('Class III, ≤1 gp = 425', avail(1, 2).count === 425);
ok('Class III, 2–10 gp = 35', avail(10, 2).count === 35);
ok('Class III, 11–100 gp = 2', avail(100, 2).count === 2);
ok('Class III, 101–1,000 gp = 1', avail(1000, 2).count === 1);
ok('Class III, 1,001–10,000 gp = 25%', avail(5000, 2).kind === 'chance' && avail(5000, 2).percent === 25);
ok('Class III, ≥10,001 gp = 3%', avail(20000, 2).kind === 'chance' && avail(20000, 2).percent === 3);

// spot-check the four corners of the matrix.
ok('Class I, ≤1 gp = 2750', avail(1, 0).count === 2750);
ok('Class VI, ≤1 gp = 15', avail(1, 5).count === 15);
ok('Class I, ≥10,001 gp = 25%', avail(50000, 0).kind === 'chance' && avail(50000, 0).percent === 25);
ok('Class V, ≥10,001 gp = none (—)', avail(50000, 4).kind === 'none');
ok('Class VI, ≥10,001 gp = none (—)', avail(50000, 5).kind === 'none');

// =============================================================================
section('Band edges classify correctly (1/2/10/11/100/101/1,000/1,001/10,000/10,001)');
// =============================================================================
const bandLabel = p => ACKS.equipmentPriceBand(p).label;
ok('1 gp → ≤ 1 gp', bandLabel(1) === '≤ 1 gp');
ok('2 gp → 2–10 gp', bandLabel(2) === '2–10 gp');
ok('10 gp → 2–10 gp', bandLabel(10) === '2–10 gp');
ok('11 gp → 11–100 gp', bandLabel(11) === '11–100 gp');
ok('100 gp → 11–100 gp', bandLabel(100) === '11–100 gp');
ok('101 gp → 101–1,000 gp', bandLabel(101) === '101–1,000 gp');
ok('1,000 gp → 101–1,000 gp', bandLabel(1000) === '101–1,000 gp');
ok('1,001 gp → 1,001–10,000 gp', bandLabel(1001) === '1,001–10,000 gp');
ok('10,000 gp → 1,001–10,000 gp', bandLabel(10000) === '1,001–10,000 gp');
ok('10,001 gp → ≥ 10,001 gp', bandLabel(10001) === '≥ 10,001 gp');
// fractional prices fall in the ≤1 band (a torch is 1/12 gp etc).
ok('0.5 gp → ≤ 1 gp', bandLabel(0.5) === '≤ 1 gp');

// =============================================================================
section('Modifiers — visited-market (RR p.413), 12+ dedicated, multi-party ceiling');
// =============================================================================
// visited-before treats the market as one class higher: a Class IV market reads as Class III →
// the warhorse goes from 25% to a flat 1.
ok('visited-before bumps one class higher', (() => { const a = avail(700, 3, { visitedBefore: true }); return a.kind === 'count' && a.count === 1; })());
ok('visited-before clamps at Class I', avail(700, 0, { visitedBefore: true }).count === 7);
// 12+ party spending the dedicated activity doubles a count cell...
ok('12+ dedicated doubles a count cell', avail(1, 2, { partyOf12Dedicated: true }).count === 850);
// ...and doubles a chance percent (capped at 100).
ok('12+ dedicated doubles a chance %', avail(700, 3, { partyOf12Dedicated: true }).percent === 50);
ok('12+ dedicated caps % at 100', avail(20000, 0, { partyOf12Dedicated: true }).percent === 50);
// multi-party campaign ceiling = 10× the listed count.
ok('multi-party ceiling = 10× count', avail(1, 2, { multiParty: true }).count === 4250);

// =============================================================================
section('rollEquipmentUnitsAvailable — deterministic counts, per-unit chance rolls');
// =============================================================================
const roll = (p, mc, opts, rng) => ACKS.rollEquipmentUnitsAvailable(p, mc, opts, rng);
ok('count cell rolls deterministically', roll(1, 0) === 2750);
ok('count cell (warhorse Class III) = 1', roll(700, 2) === 1);
ok('none cell rolls 0', roll(50000, 5) === 0);
// chance cell: a 25% cell — a low d% roll lands the unit, a high one doesn't.
ok('chance cell: low roll → 1 unit', roll(700, 3, {}, () => 0.10) === 1);   // r = 11 ≤ 25
ok('chance cell: boundary roll (r=25) → 1 unit', roll(700, 3, {}, () => 0.24) === 1); // r = 25 ≤ 25
ok('chance cell: high roll → 0 units', roll(700, 3, {}, () => 0.50) === 0);   // r = 51 > 25

// =============================================================================
section('EQUIPMENT_CATALOG — comprehensive, RAW-verified (RR pp.126–130) + generic-by-price');
// =============================================================================
ok('catalog exported, comprehensive', Array.isArray(ACKS.EQUIPMENT_CATALOG) && ACKS.EQUIPMENT_CATALOG.length >= 90);
ok('no duplicate ids', new Set(ACKS.EQUIPMENT_CATALOG.map(e => e.id)).size === ACKS.EQUIPMENT_CATALOG.length);
ok('every row well-formed (stone num or null for mounts)', ACKS.EQUIPMENT_CATALOG.every(e => e.id && e.name && e.category && typeof e.listPriceGp === 'number' && (typeof e.stone === 'number' || e.stone === null)));
ok('all five categories present', ['weapon', 'ammunition', 'armor', 'gear', 'mount'].every(c => ACKS.equipmentByCategory(c).length > 0));
// spot-check verified prices (markdown read, cross-checked vs the PDF raw extract + rulebook prose)
ok('sword = 10 gp / 1/6 st', (() => { const e = ACKS.lookupEquipment('sword'); return e.listPriceGp === 10 && Math.abs(e.stone - 1 / 6) < 1e-9; })());
ok('dagger = 3 gp', ACKS.lookupEquipment('dagger').listPriceGp === 3);
ok('two-handed sword = 15 gp / 1 st', (() => { const e = ACKS.lookupEquipment('two-handed-sword'); return e.listPriceGp === 15 && e.stone === 1; })());
ok('long bow = 7 gp', ACKS.lookupEquipment('long-bow').listPriceGp === 7);
ok('composite bow = 40 gp', ACKS.lookupEquipment('composite-bow').listPriceGp === 40);
ok('plate armor = 60 gp / 6 st', (() => { const e = ACKS.lookupEquipment('plate-armor'); return e.listPriceGp === 60 && e.stone === 6; })());
ok('leather armor = 20 gp / 2 st', (() => { const e = ACKS.lookupEquipment('leather-armor'); return e.listPriceGp === 20 && e.stone === 2; })());
ok('lantern = 10 gp', ACKS.lookupEquipment('lantern').listPriceGp === 10);
ok("thieves' tools = 25 gp", ACKS.lookupEquipment('thieves-tools').listPriceGp === 25);
// the PDF -layout column-drift cases, now correct from the markdown (cross-checked vs PDF prose):
ok('heavy warhorse = 315 gp (list price; the availability example uses 700)', ACKS.lookupEquipment('horse-heavy-war').listPriceGp === 315);
ok('goat = 3 gp (the -layout drift had read 2,000)', ACKS.lookupEquipment('goat').listPriceGp === 3);
ok('heavy draft horse = 40 gp (the -layout drift had read 3)', ACKS.lookupEquipment('horse-heavy-draft').listPriceGp === 40);
ok('mounts are led, not carried (stone = null)', ACKS.lookupEquipment('horse-heavy-war').stone === null);
ok('lookupEquipment(unknown) = null', ACKS.lookupEquipment('no-such-item') === null);
// catalogue → availability: plate armor (60 gp, 11–100 band) is freely stocked (count 1) at Class IV.
ok('catalogued plate armor resolves availability', (() => { const e = ACKS.lookupEquipment('plate-armor'); const a = avail(e.listPriceGp, 3); return a.kind === 'count' && a.count === 1; })());
// reproduce the RR p.124 "Cain" example end-to-end: heavy warhorse (the example's 700 gp), Class IV,
// visited-before → treat as Class III → a flat 1 available, so Cain can buy it.
ok('RR p.124 Cain example reproduces (700 gp, Class IV + visited → 1)', (() => { const a = avail(700, 3, { visitedBefore: true }); return a.kind === 'count' && a.count === 1; })());
// generic-by-price: an off-catalogue item transacts purely off its entered price.
ok('generic-by-price: off-catalogue item availability', avail(250, 2).kind === 'count' && avail(250, 2).count === 1);

// =============================================================================
console.log('\n' + (fail ? 'FAIL' : 'PASS') + ' — item-trade.smoke: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('Failures:\n  ' + failures.join('\n  ')); process.exit(1); }
