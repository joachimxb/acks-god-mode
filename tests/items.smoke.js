/* tests/items.smoke.js — Items I1 (OQ9) item-model smoke suite.
 *
 *   node tests/items.smoke.js   (or via `npm test`)
 *
 * Covers the resolved facet item model (composition over hierarchy —
 * Architecture.md §2.2 + §3.7; DF_Study_2 §3.5): the blankStashItem facet shape,
 * the facet/valuation/encumbrance accessors, the legacy coin|bulk|item → facets[]
 * migration, the promotion path (line → NotableItem), and the deferred Stash A.5
 * idempotency round-trip (migrate → JSON round-trip → re-migrate, totals stable).
 */
'use strict';
const path = require('path');
const fs = require('fs');

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
section('Factory — facet shape + back-compat sugar');
// =============================================================================
const coin = ACKS.blankStashItem({ kind: 'coin', denomination: 'gp', qty: 50 });
ok('coin: facets=[coin]', Array.isArray(coin.facets) && coin.facets.length === 1 && coin.facets[0] === 'coin');
ok('coin: no legacy kind key', !('kind' in coin));
ok('coin: superset fields present', ['facets','qty','name','denomination','valuableType','valuableTier','unitValueGp','encumbranceSt','unit','notableItemId','containerStashId','notes'].every(k => k in coin));
const gear = ACKS.blankStashItem({ kind: 'item', name: 'rope', qty: 2 });
ok('item kind → gear facet', gear.facets[0] === 'gear');
const bulk = ACKS.blankStashItem({ kind: 'bulk', label: 'salt', qty: 20, unit: 'stones', encumbranceSt: 20 });
ok('bulk: facets=[bulk]', bulk.facets[0] === 'bulk');
ok('bulk: label sugar → name', bulk.name === 'salt');
const facetItem = ACKS.blankStashItem({ facets: ['gear', 'valuable'], name: 'gilded idol', unitValueGp: 300, qty: 1 });
ok('explicit facets[] wins over kind', facetItem.facets.length === 2 && facetItem.facets.includes('valuable'));
const mag = ACKS.blankStashItem({ kind: 'item', name: '+1 sword', magicItemId: 'itm-x' });
ok('magicItemId → notableItemId', mag.notableItemId === 'itm-x' && !('magicItemId' in mag));
ok('notableItemId implies magical facet', mag.facets.includes('magical'));

// =============================================================================
section('Accessors — facet / value / encumbrance');
// =============================================================================
ok('itemHasFacet', ACKS.itemHasFacet(coin, 'coin') && !ACKS.itemHasFacet(coin, 'gear'));
ok('primaryFacet coin', ACKS.primaryFacet(coin) === 'coin');
ok('primaryFacet of gear+valuable = valuable', ACKS.primaryFacet(facetItem) === 'valuable');
// Coin weight: 1,000 coins = 1 stone, any denomination (RR p.83)
ok('coin weight 1000gp = 1 st', approx(ACKS.itemEncumbranceSt(ACKS.blankStashItem({ kind: 'coin', denomination: 'gp', qty: 1000 })), 1));
ok('coin weight 500sp = 0.5 st', approx(ACKS.itemEncumbranceSt(ACKS.blankStashItem({ kind: 'coin', denomination: 'sp', qty: 500 })), 0.5));
// Multi-denomination value (1 pp = 5 gp; 1 gp = 10 sp = 100 cp; 1 ep = 0.5 gp)
ok('value 500 sp = 50 gp', approx(ACKS.itemValueGp(ACKS.blankStashItem({ kind: 'coin', denomination: 'sp', qty: 500 })), 50));
ok('value 10 pp = 50 gp', approx(ACKS.itemValueGp(ACKS.blankStashItem({ kind: 'coin', denomination: 'pp', qty: 10 })), 50));
ok('value 200 cp = 2 gp', approx(ACKS.itemValueGp(ACKS.blankStashItem({ kind: 'coin', denomination: 'cp', qty: 200 })), 2));
ok('value 4 ep = 2 gp', approx(ACKS.itemValueGp(ACKS.blankStashItem({ kind: 'coin', denomination: 'ep', qty: 4 })), 2));
// Valuables (Treasure Tome §1.3) — value = qty × unitValueGp
ok('valuable value = qty × unitValueGp', ACKS.itemValueGp(ACKS.blankStashItem({ facets: ['valuable'], valuableType: 'gem', valuableTier: 'brilliant', unitValueGp: 4000, qty: 3 })) === 12000);
ok('gear carries no liquid gp value', ACKS.itemValueGp(gear) === 0);
// Bulk weight: stones → qty; gear default 1 st
ok('bulk in stones weighs qty', ACKS.itemEncumbranceSt(bulk) === 20);
ok('gear default weight 1 st when unset', ACKS.itemEncumbranceSt(ACKS.blankStashItem({ kind: 'item', name: 'torch' })) === 1);

// =============================================================================
section('Stash / carry aggregates');
// =============================================================================
const aggStash = { items: [
  ACKS.blankStashItem({ kind: 'coin', denomination: 'gp', qty: 1000 }),
  ACKS.blankStashItem({ kind: 'coin', denomination: 'sp', qty: 500 }),
  ACKS.blankStashItem({ facets: ['valuable'], unitValueGp: 200, qty: 2 }),
  ACKS.blankStashItem({ kind: 'item', name: 'tent', encumbranceSt: 5 }),
] };
ok('stashTotalGp = coins (gp-equiv) + valuables', approx(ACKS.stashTotalGp(aggStash), 1000 + 50 + 400));
ok('stashTotalEncumbrance sums derived weights', approx(ACKS.stashTotalEncumbrance(aggStash), 1 + 0.5 + 0 + 5));
ok('carryTotalEncumbrance over character.inventory', approx(ACKS.carryTotalEncumbrance({ inventory: aggStash.items }), 1 + 0.5 + 0 + 5));

// =============================================================================
section('Deposit — facet-aware coin merge (sugar + explicit facets interop)');
// =============================================================================
const c = ACKS.blankCampaign();
c.stashes.push(ACKS.blankStash({ kind: 'cache', name: 'Vault' }));
const sid = c.stashes[0].id;
ACKS.depositToStash(c, sid, [{ facets: ['coin'], denomination: 'gp', qty: 100 }], { reason: 't' });
ACKS.depositToStash(c, sid, [{ kind: 'coin', denomination: 'gp', qty: 50 }], { reason: 't' });  // sugar path
const vault = ACKS.findStash(c, sid);
const gpLines = vault.items.filter(it => ACKS.itemHasFacet(it, 'coin') && it.denomination === 'gp');
ok('gp coin merged across facet + sugar deposits', gpLines.length === 1 && gpLines[0].qty === 150);
ACKS.depositToStash(c, sid, [{ facets: ['coin'], denomination: 'sp', qty: 20 }], { reason: 't' });
ok('different denomination stays a separate line', vault.items.filter(it => ACKS.itemHasFacet(it, 'coin')).length === 2);
ok('stashTotalGp after mixed deposits = 152', approx(ACKS.stashTotalGp(vault), 152));

// =============================================================================
section('Promotion — fungible/gear line → tracked NotableItem (§3.7)');
// =============================================================================
const pc = ACKS.blankCampaign();
const line = ACKS.blankStashItem({ facets: ['readable'], name: "Plutarch's Lives", qty: 1 });
const ni = ACKS.promoteLineToNotableItem(pc, line, { kind: 'book', name: "Plutarch's Lives" });
ok('promotion creates a NotableItem', !!ni && pc.notableItems.length === 1);
ok('line now points at the notable', line.notableItemId === ni.id);
ok('book promotion tags the readable facet', line.facets.includes('readable'));
const ni2 = ACKS.promoteLineToNotableItem(pc, line);
ok('promotion is idempotent (returns same notable, no duplicate)', ni2 === ni && pc.notableItems.length === 1);
ok('notableItemFacets bridge: book → readable', ACKS.notableItemFacets({ kind: 'book' }).includes('readable'));
ok('notableItemFacets bridge: magic-weapon → gear+magical', ACKS.notableItemFacets({ kind: 'magic-weapon' }).join() === 'gear,magical');

// =============================================================================
section('Migration — legacy coin|bulk|item → facets[] (idempotent)');
// =============================================================================
const legacyStash = { id: 'stash-legacy', kind: 'cache', name: 'Old', hexId: null, createdAtTurn: 1, history: [], items: [
  { id: 'si-1', kind: 'coin', denomination: 'gp', qty: 1000 },
  { id: 'si-2', kind: 'coin', denomination: 'sp', qty: 500 },
  { id: 'si-3', kind: 'bulk', label: 'salt cargo', qty: 20, unit: 'stones', encumbranceSt: 20 },
  { id: 'si-4', kind: 'item', name: 'rope', qty: 2, encumbranceSt: 1 },
  { id: 'si-5', kind: 'item', name: '+1 sword', qty: 1, magicItemId: 'itm-legacy' },
] };
const lc = ACKS.blankCampaign();
lc.stashes.push(legacyStash);
lc.characters.push({ id: 'chr-1', name: 'Hauler', inventory: [
  { id: 'si-6', kind: 'coin', denomination: 'gp', qty: 30 },
  'a free-text inventory string',   // must be skipped, not crash
] });
const changed = ACKS.migrateAllStashItemShapes(lc);
ok('migration reports changed-line count', changed === 6);
const s = lc.stashes[0];
ok('coin line migrated to facets', s.items[0].facets[0] === 'coin' && !('kind' in s.items[0]));
ok('bulk label → name', s.items[2].name === 'salt cargo' && !('label' in s.items[2]));
ok('magic item → notableItemId + magical facet', s.items[4].notableItemId === 'itm-legacy' && s.items[4].facets.includes('magical') && !('magicItemId' in s.items[4]));
ok('free-text inventory string left untouched', lc.characters[0].inventory[1] === 'a free-text inventory string');
ok('carry coin line migrated', lc.characters[0].inventory[0].facets[0] === 'coin');
ok('migrated stashTotalGp = 1000 + 50', approx(ACKS.stashTotalGp(s), 1050));
const changed2 = ACKS.migrateAllStashItemShapes(lc);
ok('migration idempotent (0 changes on second pass)', changed2 === 0);

// Phase 2.6 carry-inventory shape ({name,qty,stone,gp}) is left untouched, weighed by `stone`
const p26 = ACKS.blankCampaign();
p26.characters.push({ id: 'chr-2', name: 'Porter', inventory: [{ name: 'rope', qty: 1, stone: 3, gp: 5 }] });
const ch26 = ACKS.migrateCampaign(JSON.parse(JSON.stringify(p26))).characters[0];
ok('Phase 2.6 inventory item NOT facet-migrated (left as-is)', !('facets' in ch26.inventory[0]));
ok('itemEncumbranceSt reads the legacy `stone` field', ACKS.itemEncumbranceSt(ch26.inventory[0]) === 3);
ok('carryTotalEncumbrance over Phase 2.6 inventory uses stone', ACKS.carryTotalEncumbrance(ch26) === 3);

// =============================================================================
section('Stash A.5 — idempotency round-trip (migrate → JSON → re-migrate)');
// =============================================================================
// Synthetic campaign carrying mixed-shape stashes: migrate, snapshot totals, JSON
// round-trip (the save/load boundary), re-migrate, assert totals + counts stable.
function totalsFingerprint(camp) {
  const stashGp = (camp.stashes || []).map(st => Math.round(ACKS.stashTotalGp(st) * 100) / 100);
  const itemCount = (camp.stashes || []).reduce((n, st) => n + (st.items ? st.items.length : 0), 0);
  return JSON.stringify({ stashGp, itemCount, stashes: (camp.stashes || []).length });
}
const a5 = ACKS.migrateCampaign({
  schemaVersion: 2,
  stashes: [JSON.parse(JSON.stringify(legacyStash))],
  characters: [], domains: [], hexes: [], settlements: [],
});
const fp1 = totalsFingerprint(a5);
const a5b = ACKS.migrateCampaign(JSON.parse(JSON.stringify(a5)));
const fp2 = totalsFingerprint(a5b);
ok('A.5 synthetic: totals + item counts stable across round-trip', fp1 === fp2, fp1 + ' vs ' + fp2);
ok('A.5 synthetic: no legacy kind survives the round-trip', a5b.stashes[0].items.every(it => !('kind' in it) && Array.isArray(it.facets)));

// Templates (+ demo) round-trip — they ship stash-free, so this proves migrate is a
// stable no-op on real shipped data and never throws on the item pass.
const tmplDir = path.join(DIR, 'Templates');
const tmplFiles = fs.existsSync(tmplDir) ? fs.readdirSync(tmplDir).filter(f => f.endsWith('.acks.json')) : [];
ok('found shipped templates to round-trip', tmplFiles.length >= 1, tmplFiles.length + ' found');
let tmplStable = 0;
for (const f of tmplFiles) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(path.join(tmplDir, f), 'utf8')); }
  catch (e) { ok('template parses: ' + f, false, e.message); continue; }
  const m1 = ACKS.migrateCampaign(raw);
  const before = totalsFingerprint(m1);
  const m2 = ACKS.migrateCampaign(JSON.parse(JSON.stringify(m1)));
  const after = totalsFingerprint(m2);
  const idempotentItems = ACKS.migrateAllStashItemShapes(m2) === 0;
  if (before === after && idempotentItems) tmplStable++;
  else ok('template round-trip stable: ' + f, false, before + ' vs ' + after);
}
ok('all templates round-trip stable + item-migrate idempotent', tmplStable === tmplFiles.length);
if (DEMO) {
  const d1 = ACKS.migrateCampaign(JSON.parse(JSON.stringify(DEMO)));
  const d2 = ACKS.migrateCampaign(JSON.parse(JSON.stringify(d1)));
  ok('demo template round-trip stable', totalsFingerprint(d1) === totalsFingerprint(d2));
  ok('demo template item-migrate idempotent', ACKS.migrateAllStashItemShapes(d2) === 0);
}

// =============================================================================
section('Stash B engine — carry↔stash · controller · find-or-create · RAW bands');
// =============================================================================
// RAW carry-encumbrance bands (RR pp.83–84)
const bandLevel = st => ACKS.carryEncumbranceLevel({ inventory: [ACKS.blankStashItem({ facets: ['gear'], encumbranceSt: st, qty: 1 })] });
ok('band ≤5 st = unencumbered', bandLevel(5) === 'unencumbered');
ok('band 6 st = light', bandLevel(6) === 'light');
ok('band 9 st = heavy', bandLevel(9) === 'heavy');
ok('band 15 st = severe', bandLevel(15) === 'severe');
ok('band 25 st = overloaded', bandLevel(25) === 'overloaded');
ok('empty inventory = unencumbered', ACKS.carryEncumbranceLevel({ inventory: [] }) === 'unencumbered');
const unencBand = ACKS.carryEncumbranceBandFor(3);
ok('unencumbered band = 24 mi/day, 40 ft combat', unencBand.milesPerDay === 24 && unencBand.combatFeet === 40);
ok('overloaded band = 0 mi/day', ACKS.carryEncumbranceBandFor(99).milesPerDay === 0);
const encInfo = ACKS.carryEncumbranceInfo({ inventory: [ACKS.blankStashItem({ facets: ['gear'], encumbranceSt: 8 })] });
ok('carryEncumbranceInfo returns totalSt + band', encInfo.totalSt === 8 && encInfo.band.level === 'heavy');

// find-or-create (one per owner per hex)
const sb = ACKS.blankCampaign();
sb.characters.push({ id: 'chr-h', name: 'Hilda', inventory: [] });
const st1 = ACKS.findOrCreateStashAt(sb, { characterId: 'chr-h' }, 'hex-1', { kind: 'cache' });
const st1b = ACKS.findOrCreateStashAt(sb, { characterId: 'chr-h' }, 'hex-1', { kind: 'cache' });
ok('findOrCreateStashAt returns the same stash for same owner+hex+kind', st1 && st1b && st1.id === st1b.id && sb.stashes.length === 1);
const st2 = ACKS.findOrCreateStashAt(sb, { characterId: 'chr-h' }, 'hex-2', { kind: 'cache' });
ok('different hex → different stash', st2.id !== st1.id && sb.stashes.length === 2);

// carry → stash (partial then full), totals conserved + coin merged
const ch = sb.characters[0];
ch.inventory = [ACKS.blankStashItem({ facets: ['coin'], denomination: 'gp', qty: 100, id: 'si-c1' }), ACKS.blankStashItem({ facets: ['gear'], name: 'sword', id: 'si-g1' })];
ACKS.transferCarryToStash(sb, 'chr-h', st1.id, [{ itemId: 'si-c1', qty: 40 }]);
ok('carry→stash partial: carry retains 60 gp', ch.inventory.find(i => i.id === 'si-c1').qty === 60);
ok('carry→stash partial: stash holds 40 gp', ACKS.stashTotalGp(st1) === 40);
ACKS.transferCarryToStash(sb, 'chr-h', st1.id, [{ itemId: 'si-c1' }]);
ok('carry→stash full: stash now holds 100 gp (merged)', ACKS.stashTotalGp(st1) === 100);
ok('carry→stash full: coin removed from carry', !ch.inventory.find(i => i.id === 'si-c1'));

// stash → carry + over-encumbrance warning (never blocks)
const heavyStash = ACKS.findOrCreateStashAt(sb, { characterId: 'chr-h' }, 'hex-3', { kind: 'cache' });
ACKS.depositToStash(sb, heavyStash.id, [{ facets: ['coin'], denomination: 'gp', qty: 25000 }], { reason: 't' });
const coinLineId = heavyStash.items.find(i => ACKS.itemHasFacet(i, 'coin')).id;
const back = ACKS.transferStashToCarry(sb, heavyStash.id, 'chr-h', [{ itemId: coinLineId }]);
ok('stash→carry moves the coin to inventory', !!ch.inventory.find(i => ACKS.itemHasFacet(i, 'coin') && i.qty === 25000));
ok('stash→carry flags over-encumbrance (25 st), never blocks', back.overEncumbered === true && back.band.level === 'overloaded');

// controller change — domain-treasury keeps ownerDomainId; personal swaps owner
const treasury = ACKS.blankStash({ kind: 'domain-treasury', name: 'Realm Treasury', hexId: 'hex-1' });
treasury.ownerDomainId = 'dom-1';
sb.stashes.push(treasury);
ACKS.changeStashController(sb, treasury.id, { characterId: 'chr-new-ruler' }, { reason: 'succession' });
ok('domain-treasury controller change keeps ownerDomainId', treasury.ownerDomainId === 'dom-1');
ok('controller change stamps a controllerChanged history entry', treasury.history.some(h => h.type === 'controllerChanged'));
ACKS.changeStashController(sb, st1.id, { characterId: 'chr-new' });
ok('personal stash controller change swaps ownerCharacterId', st1.ownerCharacterId === 'chr-new');

// RAW-default polarity flip — enforce-carry-encumbrance → ignore-encumbrance
const reg = ACKS.HOUSERULES_REGISTRY || [];
if (reg.length) {
  ok('ignore-encumbrance house rule exists (RAW-default opt-out)', reg.some(r => r.id === 'ignore-encumbrance'));
  ok('enforce-carry-encumbrance retired', !reg.some(r => r.id === 'enforce-carry-encumbrance'));
}

// ─── summary ───
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — items.smoke.js: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { console.log('Failures:\n  - ' + failures.join('\n  - ')); process.exit(1); }
