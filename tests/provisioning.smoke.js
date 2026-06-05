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

// =============================================================================
// V2/V3 — per-member daily survival resolution (§4 / §6)
// =============================================================================
function mkSurv(opts) {
  opts = opts || {};
  const c = ACKS.blankCampaign({ name: 'surv' });
  c.currentTurn = 1; c.currentDayInMonth = 1;
  c.hexes = [ACKS.blankHex(Object.assign({ id: 'h0', coord: { q: 0, r: 0 }, terrain: 'grassland' }, opts.hex || {}))];
  const chars = opts.chars || [{ id: 'c1' }];
  c.characters = chars.map(o => ACKS.blankCharacter(Object.assign({ name: o.id }, o)));
  const j = ACKS.blankJourney(Object.assign({ id: 'j1', participantCharacterIds: chars.map(o => o.id), startHexId: 'h0', currentHexId: 'h0', destinationHexId: 'h0', supplies: { rations: 0, waterRations: 0 } }, opts.journey || {}));
  c.journeys = [j];
  return { c, j, hex: c.hexes[0] };
}
const SURV0 = mkSurv().c;   // a throwaway campaign for hex-literal source tests

section('hasFreshSource — the water-source test (§4.1)');
ok('river hex has a source', ACKS.hasFreshSource(SURV0, { riverSides: [0] }) === true);
ok('lake hex has a source', ACKS.hasFreshSource(SURV0, { hasLake: true }) === true);
ok('freshwater "water" hex has a source', ACKS.hasFreshSource(SURV0, { terrain: 'water', freshWater: true }) === true);
ok('salt "water" hex has NO source (decision #11)', ACKS.hasFreshSource(SURV0, { terrain: 'water' }) === false);
ok('settlement hex has a source (🔧)', ACKS.hasFreshSource(SURV0, { settlement: { id: 's1' } }) === true);
ok('plain grassland has NO source', ACKS.hasFreshSource(SURV0, { terrain: 'grassland' }) === false);
// neighbour-bordering: fresh body grants, salt sea does not
const bordF = mkSurv(); bordF.c.hexes.push(ACKS.blankHex({ id: 'hN', coord: { q: 1, r: 0 }, terrain: 'water', freshWater: true }));
ok('bordering a FRESH body → source', ACKS.hasFreshSource(bordF.c, bordF.hex) === true);
const bordS = mkSurv(); bordS.c.hexes.push(ACKS.blankHex({ id: 'hN', coord: { q: 1, r: 0 }, terrain: 'water' }));
ok('bordering a SALT sea → no source', ACKS.hasFreshSource(bordS.c, bordS.hex) === false);

section('seedJourneyProvisions — abstract pool → tight inventory (§3.5)');
const seedJ = mkSurv({ chars: [{ id: 'c1' }], journey: { supplies: { rations: 7, waterRations: 5 } } });
ACKS.seedJourneyProvisions(seedJ.c, seedJ.j);
ok('seed zeroes the abstract pool', seedJ.j.supplies.rations === 0 && seedJ.j.supplies.waterRations === 0);
ok('seed lands ration days on the participant', ACKS.rationDaysAvailable(seedJ.c.characters[0]) === 7);
ok('seed lands water on the participant', seedJ.c.characters[0].waterDaysCarried === 5);
ACKS.seedJourneyProvisions(seedJ.c, seedJ.j);
ok('seed is idempotent (no double-seed)', ACKS.rationDaysAvailable(seedJ.c.characters[0]) === 7);

section('Water resolution (§4.1)');
const wSrc = mkSurv({ hex: { riverSides: [0] }, chars: [{ id: 'c1', inventory: [{ catalogId: 'barrel-20gal' }], waterDaysCarried: 0 }] });
const sSrc = ACKS.journeyDaySurvival(wSrc.c, wSrc.j, wSrc.hex, { rng: () => 0.5 });
ok('a source tops water to capacity', sSrc.waterSourced === true && sSrc.members.c1.waterDaysCarried === 20);
ok('a source feeds water + clears deficit', sSrc.members.c1.fedWater === true && sSrc.members.c1.waterDeficitDays === 0);
const wDrink = mkSurv({ chars: [{ id: 'c1', waterDaysCarried: 3 }] });
const sDrink = ACKS.journeyDaySurvival(wDrink.c, wDrink.j, wDrink.hex, { rng: () => 0.5 });
ok('no source → drinks 1 day from own reserve', sDrink.members.c1.fedWater === true && sDrink.members.c1.waterDaysCarried === 2);
const wDry = mkSurv({ chars: [{ id: 'c1', waterDaysCarried: 0 }] });
const sDry = ACKS.journeyDaySurvival(wDry.c, wDry.j, wDry.hex, { rng: () => 0 });   // rng 0 → 1d6 = 1
ok('no source + empty → dehydrated', sDry.members.c1.dehydrated === true && sDry.members.c1.waterDeficitDays === 1);
ok('dehydration costs 1d6 CON (rng 0 → 1)', sDry.members.c1.conLossThirst === 1 && sDry.members.c1.conLostThirst === 1);
const wForage = mkSurv({ chars: [{ id: 'c1', waterDaysCarried: 0, inventory: [{ catalogId: 'waterskin' }] }], journey: { forageWaterEnabled: true } });
const sForage = ACKS.journeyDaySurvival(wForage.c, wForage.j, wForage.hex, { rng: () => 0.99 });  // d20 = 20 → 14+ success
ok('forage-water success feeds the party', sForage.waterForage && sForage.waterForage.success === true && sForage.members.c1.fedWater === true);

section('Food resolution + ladders (§4.2 / §1.2)');
const fEat = mkSurv({ chars: [{ id: 'c1', waterDaysCarried: 3, inventory: [ACKS.makeRationLine({ daysRemaining: 5 })] }] });
const sEat = ACKS.journeyDaySurvival(fEat.c, fEat.j, fEat.hex, { rng: () => 0.5 });
ok('eats 1 ration day from the pack', sEat.members.c1.fedFood === true);
ok('the ration line decremented 5 → 4', sEat.inventoryUpdates.c1.find(x => ACKS.isRationLine(x)).daysRemaining === 4);
const fUnder = mkSurv({ chars: [{ id: 'c1', waterDaysCarried: 5, foodDeficitDays: 1 }] });
const sUnder = ACKS.journeyDaySurvival(fUnder.c, fUnder.j, fUnder.hex, { rng: () => 0.5 });
ok('2nd no-food day → underfed (not starving)', sUnder.members.c1.underfed === true && sUnder.members.c1.starving === false);
const fStarve = mkSurv({ chars: [{ id: 'c1', waterDaysCarried: 5, foodDeficitDays: 6 }] });
const sStarve = ACKS.journeyDaySurvival(fStarve.c, fStarve.j, fStarve.hex, { rng: () => 0.5 });
ok('7th no-food day → starving + 1 CON/day', sStarve.members.c1.starving === true && sStarve.members.c1.foodDeficitDays === 7 && sStarve.members.c1.conLossHunger === 1);
const fRecover = mkSurv({ chars: [{ id: 'c1', waterDaysCarried: 5, foodDeficitDays: 3, conLossHunger: 2, conLossThirst: 5, inventory: [ACKS.makeRationLine({ daysRemaining: 3 })] }] });
const sRecover = ACKS.journeyDaySurvival(fRecover.c, fRecover.j, fRecover.hex, { rng: () => 0.5 });
ok('a fed day resets food deficit', sRecover.members.c1.foodDeficitDays === 0);
ok('hunger CON recovers 1/day', sRecover.members.c1.conLossHunger === 1);
ok('thirst CON recovers 3/day', sRecover.members.c1.conLossThirst === 2);

section('Per-member independence + sharing (§6)');
const indep = mkSurv({ chars: [{ id: 'c1', waterDaysCarried: 3, inventory: [ACKS.makeRationLine({ daysRemaining: 3 })] }, { id: 'c2', waterDaysCarried: 0 }], journey: { shareRations: false } });
const sIndep = ACKS.journeyDaySurvival(indep.c, indep.j, indep.hex, { rng: () => 0 });
ok('self-only: provisioned member is fed', sIndep.members.c1.fedFood === true && sIndep.members.c1.fedWater === true);
ok('self-only: empty member goes without (no comrade auto-help)', sIndep.members.c2.fedFood === false && sIndep.members.c2.dehydrated === true);
// sharing: camp-first, leader-priority on a shortfall (only 1 ration for 2)
const shareC = mkSurv({ chars: [{ id: 'leader', waterDaysCarried: 5 }, { id: 'other', waterDaysCarried: 5 }], journey: { shareRations: true, partyId: 'p1' } });
shareC.c.parties = [{ id: 'p1', name: 'Band', leaderCharacterId: 'leader', currentHexId: 'h0', memberCharacterIds: ['leader', 'other'] }];
ACKS.ensurePartyCampStash(shareC.c, shareC.c.parties[0]);
ACKS.partyCampStash(shareC.c, 'p1').items = [ACKS.makeRationLine({ daysRemaining: 1 })];   // only enough for ONE
const sShare = ACKS.journeyDaySurvival(shareC.c, shareC.j, shareC.hex, { rng: () => 0.5 });
ok('sharing draws the camp stash first (leader fed)', sShare.members.leader.fedFood === true);
ok('on a shortfall the non-leader goes without (leader-priority, decision #8)', sShare.members.other.fedFood === false);
ok('the camp ration line was consumed', sShare.campItems && sShare.campItems.filter(x => ACKS.isRationLine(x)).length === 0);

section('Apply + ignore-rations (§4)');
const applyC = mkSurv({ chars: [{ id: 'c1', waterDaysCarried: 0 }] });
const sApply = ACKS.journeyDaySurvival(applyC.c, applyC.j, applyC.hex, { rng: () => 0 });
ACKS.applyJourneyDaySurvival(applyC.c, applyC.j, sApply);
ok('apply persists per-member dehydration + CON to the character', applyC.c.characters[0].dehydrated === true && applyC.c.characters[0].waterDeficitDays === 1 && applyC.c.characters[0].conLossThirst === 1);
ok('apply mirrors the legacy dehydrationDays alias', applyC.c.characters[0].dehydrationDays === 1);
const ign = mkSurv({ chars: [{ id: 'c1', waterDaysCarried: 0 }], journey: {} });
ign.c.houseRules = { 'ignore-rations': { enabled: true } };
const sIgn = ACKS.journeyDaySurvival(ign.c, ign.j, ign.hex, { rng: () => 0 });
ok('ignore-rations → resolution is a no-op', sIgn.ignored === true && Object.keys(sIgn.members).length === 0);

section('Day-log forage roll + the forage reroll');
(function () {
  const c = ACKS.blankCampaign({ name: 'forage' });
  c.currentTurn = 1; c.currentDayInMonth = 1; c.calendar = { year: 1, month: 1, day: 1 };
  c.hexes = [ACKS.blankHex({ id: 'f0', coord: { q: 0, r: 0 }, terrain: 'grassland' }), ACKS.blankHex({ id: 'f9', coord: { q: 9, r: 0 }, terrain: 'grassland' })];
  c.characters = [ACKS.blankCharacter({ id: 'fc', name: 'Forager', inventory: [{ catalogId: 'waterskin' }] })];
  const j = ACKS.blankJourney({ id: 'fj', participantCharacterIds: ['fc'], startHexId: 'f0', destinationHexId: 'f9', forageWaterEnabled: true, supplies: { rations: 0, waterRations: 0 } });
  c.journeys = [j]; c.houseRules = {};
  ACKS.startJourney(c, j);
  ACKS.commitJourneyRecord(c, ACKS.proposeJourneyDay(c, { dayInMonth: 2, rng: () => 0.99 }).pendingRecords[0]);
  const day = j.days[j.days.length - 1];
  ok('the committed day records the water-forage throw', !!(day.waterForage && day.waterForage.attempted === true));
  ok('a sourceless grassland day → a 14+ forage throw', day.waterForage.target === 14);
  const wf = ACKS.rerollJourneyForage(c, j);
  ok('rerollJourneyForage returns a fresh forage record', !!(wf && typeof wf.rolled === 'number' && wf.rolled >= 1 && wf.rolled <= 20 && wf.attempted === true));
  ok('the reroll updates the day record in place', j.days[j.days.length - 1].waterForage === wf);
  // a water-source day records NO forage → the reroll is unavailable
  const c2 = ACKS.blankCampaign({ name: 'nf' });
  c2.currentTurn = 1; c2.currentDayInMonth = 1; c2.calendar = { year: 1, month: 1, day: 1 };
  c2.hexes = [ACKS.blankHex({ id: 'r0', coord: { q: 0, r: 0 }, terrain: 'grassland', hasLake: true }), ACKS.blankHex({ id: 'r9', coord: { q: 9, r: 0 }, terrain: 'grassland' })];
  c2.characters = [ACKS.blankCharacter({ id: 'rc', inventory: [{ catalogId: 'waterskin' }] })];
  const j2 = ACKS.blankJourney({ id: 'rj', participantCharacterIds: ['rc'], startHexId: 'r0', destinationHexId: 'r9', forageWaterEnabled: true, supplies: { rations: 0, waterRations: 0 } });
  c2.journeys = [j2]; c2.houseRules = {};
  ACKS.startJourney(c2, j2);
  ACKS.commitJourneyRecord(c2, ACKS.proposeJourneyDay(c2, { dayInMonth: 2, rng: () => 0.99 }).pendingRecords[0]);
  ok('a fresh-source day (lake hex) records no forage throw', !j2.days[j2.days.length - 1].waterForage);
  ok('rerollJourneyForage is null when no forage happened', ACKS.rerollJourneyForage(c2, j2) === null);
  // the forage reroll must REFRESH the day's survival notables (not just waterForage) — else a re-rolled
  // "water found" day keeps a stale "a traveller is dehydrated" bullet (Joachim 2026-06-05: the current-day
  // reroll updates conditions in place). Set up a FAILED day, reroll until it finds water, assert it cleared.
  const c3 = ACKS.blankCampaign({ name: 'foragenotable' });
  c3.currentTurn = 1; c3.currentDayInMonth = 1; c3.calendar = { year: 1, month: 1, day: 1 };
  c3.hexes = [ACKS.blankHex({ id: 'g0', coord: { q: 0, r: 0 }, terrain: 'grassland' }), ACKS.blankHex({ id: 'g9', coord: { q: 9, r: 0 }, terrain: 'grassland' })];
  c3.characters = [ACKS.blankCharacter({ id: 'gc', inventory: [{ catalogId: 'waterskin' }], waterDaysCarried: 0 })];
  const j3 = ACKS.blankJourney({ id: 'gj', participantCharacterIds: ['gc'], startHexId: 'g0', destinationHexId: 'g9', forageWaterEnabled: true, supplies: { rations: 0, waterRations: 0 } });
  c3.journeys = [j3]; c3.houseRules = {};
  ACKS.startJourney(c3, j3);
  ACKS.commitJourneyRecord(c3, ACKS.proposeJourneyDay(c3, { dayInMonth: 2, rng: () => 0 }).pendingRecords[0]);
  const d3 = j3.days[j3.days.length - 1];
  const hasDehydr = d => (d.notableEvents || []).some(ne => ne.type === 'dehydration');
  ok('a failed-forage day starts with a dehydration notable', d3.waterForage.success === false && hasDehydr(d3));
  let found = false;
  for (let i = 0; i < 300 && !found; i++) { const w = ACKS.rerollJourneyForage(c3, j3); if (w && w.success) found = true; }
  ok('forage reroll eventually finds water (sanity)', found);
  ok('a re-rolled water-found day has NO stale dehydration notable', d3.waterForage.success === true && !hasDehydr(d3));
})();

section('Day-log rows — nav reroll holds provisioning + notable type routing');
(function () {
  const c = ACKS.blankCampaign({ name: 'navreroll' });
  c.currentTurn = 1; c.currentDayInMonth = 1; c.calendar = { year: 1, month: 1, day: 1 };
  c.hexes = [ACKS.blankHex({ id: 'n0', coord: { q: 0, r: 0 }, terrain: 'grassland' }), ACKS.blankHex({ id: 'n9', coord: { q: 9, r: 0 }, terrain: 'grassland' })];
  c.characters = [ACKS.blankCharacter({ id: 'nc', name: 'Walker', inventory: [{ catalogId: 'waterskin' }], waterDaysCarried: 0 })];
  const j = ACKS.blankJourney({ id: 'nj', participantCharacterIds: ['nc'], startHexId: 'n0', destinationHexId: 'n9', forageWaterEnabled: true, supplies: { rations: 0, waterRations: 0 } });
  c.journeys = [j]; c.houseRules = {};
  ACKS.startJourney(c, j);
  // rng 0 → forage d20 = 1 fails → no water → dehydrated; a sourceless off-road day also makes a nav throw.
  ACKS.commitJourneyRecord(c, ACKS.proposeJourneyDay(c, { dayInMonth: 2, rng: () => 0 }).pendingRecords[0]);
  const day0 = j.days[j.days.length - 1];
  ok('committed day records a FAILED forage (dehydration scenario)', !!(day0.waterForage && day0.waterForage.success === false));
  ok('day notables carry a type (for row routing)', (day0.notableEvents || []).some(ne => !!ne.type));
  ok('a dehydration notable is present + typed', (day0.notableEvents || []).some(ne => ne.type === 'dehydration'));
  // capture the held provisioning outcome
  const heldForage = JSON.stringify(day0.waterForage);
  const ch = c.characters[0];
  const heldSurv = JSON.stringify({ d: ch.dehydrated, wd: ch.waterDeficitDays, ct: ch.conLossThirst, wc: ch.waterDaysCarried });
  const beforeIdx = day0.dayIndex;
  const rec = ACKS.rerollJourneyNav(c, j);
  ok('rerollJourneyNav returns the re-rolled record', !!(rec && rec.newDayIndex === beforeIdx));
  const day1 = j.days[j.days.length - 1];
  ok('nav reroll HOLDS the forage throw (byte-equal)', JSON.stringify(day1.waterForage) === heldForage);
  ok('nav reroll HOLDS the member survival (dehydration + CON + water)', JSON.stringify({ d: ch.dehydrated, wd: ch.waterDeficitDays, ct: ch.conLossThirst, wc: ch.waterDaysCarried }) === heldSurv);
  ok('the held dehydration notable still rides the new day', (day1.notableEvents || []).some(ne => ne.type === 'dehydration'));
  ok('nav reroll does not stamp a phantom survival field on the day', !('survival' in day1));
  // gate: a journey with no committed day cannot nav-reroll
  const cE = ACKS.blankCampaign({ name: 'empty' });
  const jE = ACKS.blankJourney({ id: 'je', participantCharacterIds: [], startHexId: 'x', destinationHexId: 'y' });
  cE.journeys = [jE];
  ok('rerollJourneyNav null when there is no committed day', ACKS.rerollJourneyNav(cE, jE) === null);
})();

section('Forage reroll survives a hex that re-resolves to water (arrival / unauthored-day-start)');
(function () {
  const c = ACKS.blankCampaign({ name: 'forageDiverge' });
  c.currentTurn = 1; c.currentDayInMonth = 1; c.calendar = { year: 1, month: 1, day: 1 };
  c.hexes = [
    ACKS.blankHex({ id: 'dry0', coord: { q: 0, r: 0 }, terrain: 'grassland' }),
    ACKS.blankHex({ id: 'wet0', coord: { q: 1, r: 0 }, terrain: 'grassland', settlement: { id: 'town' } }),  // a fresh source
    ACKS.blankHex({ id: 'dry9', coord: { q: 9, r: 0 }, terrain: 'grassland' })
  ];
  c.characters = [ACKS.blankCharacter({ id: 'dc', name: 'Drifter', inventory: [{ catalogId: 'waterskin' }], waterDaysCarried: 0 })];
  const j = ACKS.blankJourney({ id: 'dj', participantCharacterIds: ['dc'], startHexId: 'dry0', destinationHexId: 'dry9', forageWaterEnabled: true, supplies: { rations: 0, waterRations: 0 } });
  c.journeys = [j]; c.houseRules = {};
  ACKS.startJourney(c, j);
  ACKS.commitJourneyRecord(c, ACKS.proposeJourneyDay(c, { dayInMonth: 2, rng: () => 0 }).pendingRecords[0]);
  const day = j.days[j.days.length - 1];
  ok('day foraged on the sourceless hex (target 14)', !!(day.waterForage && day.waterForage.attempted && day.waterForage.target === 14));
  // the bug: a reroll re-resolves day.hexId; on an arrival / unauthored-day-start it can land on a watered
  // hex (a settlement / the last authored hex), where the source branch would silently NULL the throw.
  day.hexId = 'wet0';
  ok('hasFreshSource true for the re-resolved hex', ACKS.hasFreshSource(c, c.hexes.find(h => h.id === 'wet0')) === true);
  const wf = ACKS.rerollJourneyForage(c, j);
  ok('forage reroll still returns a throw despite the watered hex', !!(wf && wf.attempted === true));
  ok('the reroll keeps the original throw target (14, not a source-skip)', wf.target === 14);
  ok('the day still carries waterForage after the reroll (line + button persist)', !!j.days[j.days.length - 1].waterForage);
})();

section('Supply toggle re-resolves the latest day (reapplyLatestDaySurvival)');
(function () {
  // flip forage ON after a thirsty day → today re-resolves with a forage throw
  const c = ACKS.blankCampaign({ name: 'reapply' });
  c.currentTurn = 1; c.currentDayInMonth = 1; c.calendar = { year: 1, month: 1, day: 1 };
  c.hexes = [ACKS.blankHex({ id: 'p0', coord: { q: 0, r: 0 }, terrain: 'grassland' }), ACKS.blankHex({ id: 'p9', coord: { q: 9, r: 0 }, terrain: 'grassland' })];
  c.characters = [ACKS.blankCharacter({ id: 'rc', name: 'Ranger', inventory: [{ catalogId: 'waterskin' }], waterDaysCarried: 0 })];
  const j = ACKS.blankJourney({ id: 'rj', participantCharacterIds: ['rc'], startHexId: 'p0', currentHexId: 'p0', destinationHexId: 'p9', forageWaterEnabled: false, supplies: { rations: 0, waterRations: 0 } });
  c.journeys = [j]; c.houseRules = {};
  ACKS.startJourney(c, j);
  ACKS.commitJourneyRecord(c, ACKS.proposeJourneyDay(c, { dayInMonth: 2, rng: () => 0.5 }).pendingRecords[0]);
  const day = j.days[j.days.length - 1];
  ok('forage-off day records no forage throw', !day.waterForage);
  ok('forage-off + empty water → dehydrated', c.characters[0].dehydrated === true);
  j.forageWaterEnabled = true;            // GM flips forage ON
  const surv = ACKS.reapplyLatestDaySurvival(c, j);
  ok('reapply returns the re-resolved survival', !!surv);
  const d1 = j.days[j.days.length - 1];
  ok('the latest day now records a forage throw', !!(d1.waterForage && d1.waterForage.attempted));
  ok('dehydration now matches the forage outcome', c.characters[0].dehydrated === !d1.waterForage.success);
  ok('the day notables carry the re-resolved survival (typed)', (d1.notableEvents || []).every(ne => !ne.type || ['hunger','dehydration','survival-critical','supplies-low','navigation-fail','navigation-recovered','arrived','fording-fail','fording-success','halted','forced-rest'].indexOf(ne.type) >= 0));

  // day 0 / no committed day → reapply is a no-op (the toggle just sets the order)
  const c2 = ACKS.blankCampaign({ name: 'reapply0' });
  const j2 = ACKS.blankJourney({ id: 'rj2', participantCharacterIds: [], startHexId: 'x', destinationHexId: 'y' });
  c2.journeys = [j2];
  ok('reapply null when no day committed (day 0)', ACKS.reapplyLatestDaySurvival(c2, j2) === null);

  // a share-rations flip preserves the forage die (forageReuse — the water is undisturbed)
  const c3 = ACKS.blankCampaign({ name: 'reapply3' });
  c3.currentTurn = 1; c3.currentDayInMonth = 1; c3.calendar = { year: 1, month: 1, day: 1 };
  c3.hexes = [ACKS.blankHex({ id: 's0', coord: { q: 0, r: 0 }, terrain: 'grassland' }), ACKS.blankHex({ id: 's9', coord: { q: 9, r: 0 }, terrain: 'grassland' })];
  c3.characters = [ACKS.blankCharacter({ id: 'sc', inventory: [{ catalogId: 'waterskin' }], waterDaysCarried: 0 })];
  const j3 = ACKS.blankJourney({ id: 'rj3', participantCharacterIds: ['sc'], startHexId: 's0', currentHexId: 's0', destinationHexId: 's9', forageWaterEnabled: true, supplies: { rations: 0, waterRations: 0 } });
  c3.journeys = [j3]; c3.houseRules = {};
  ACKS.startJourney(c3, j3);
  ACKS.commitJourneyRecord(c3, ACKS.proposeJourneyDay(c3, { dayInMonth: 2, rng: () => 0.7 }).pendingRecords[0]);
  const rolledBefore = c3.journeys[0].days[c3.journeys[0].days.length - 1].waterForage.rolled;
  ok('forage-on day has a throw', typeof rolledBefore === 'number');
  j3.shareRations = !j3.shareRations;     // flip an UNRELATED toggle
  ACKS.reapplyLatestDaySurvival(c3, j3);
  ok('a share-rations flip preserves the forage die (no re-roll)', c3.journeys[0].days[c3.journeys[0].days.length - 1].waterForage.rolled === rolledBefore);
})();

section('Day-tick review attribution — every journey notable carries its own dayIndex');
(function () {
  // The day-tick review matches a record's notables by (journeyId, dayIndex). The survival signals from
  // journeyDaySurvival formerly carried only journeyId, so a multi-day advance showed every day's notables
  // (incl. a LATER day's dehydration) under each day's record. tickJourneyDay now stamps the day index.
  const c = ACKS.blankCampaign({ name: 'attrib' });
  c.currentTurn = 1; c.currentDayInMonth = 1; c.calendar = { year: 1, month: 1, day: 1 };
  c.hexes = [ACKS.blankHex({ id: 'a0', coord: { q: 0, r: 0 }, terrain: 'grassland' }), ACKS.blankHex({ id: 'a9', coord: { q: 9, r: 0 }, terrain: 'grassland' })];
  c.characters = [ACKS.blankCharacter({ id: 'ac', name: 'A', waterDaysCarried: 0, foodDeficitDays: 6 })];  // will go hungry + thirsty
  const j = ACKS.blankJourney({ id: 'aj', participantCharacterIds: ['ac'], startHexId: 'a0', currentHexId: 'a0', destinationHexId: 'a9', forageWaterEnabled: false, supplies: { rations: 0, waterRations: 0 } });
  c.journeys = [j]; c.houseRules = {};
  ACKS.startJourney(c, j);
  const out = ACKS.tickJourneyDay(c, j, {});
  ok('tickJourneyDay returns notables', (out.notableEvents || []).length > 0);
  ok('every journey notable carries this day’s dayIndex (incl. survival signals)', (out.notableEvents || []).every(e => e && e.payload && e.payload.dayIndex === out.record.newDayIndex));
  const surv = (out.notableEvents || []).filter(e => e.type === 'hunger' || e.type === 'dehydration');
  ok('the survival notables (formerly un-stamped) are present + stamped', surv.length > 0 && surv.every(e => e.payload.dayIndex === out.record.newDayIndex));
  // a second day stamps a DIFFERENT index — so a per-(journeyId,dayIndex) filter separates the two days
  ACKS.commitJourneyRecord(c, out.record);
  const out2 = ACKS.tickJourneyDay(c, j, {});
  ok('day 2 notables stamp a distinct dayIndex', (out2.notableEvents || []).every(e => e && e.payload && e.payload.dayIndex === out2.record.newDayIndex) && out2.record.newDayIndex !== out.record.newDayIndex);
  const day1Only = [...out.notableEvents, ...out2.notableEvents].filter(e => e.payload.journeyId === j.id && e.payload.dayIndex === out.record.newDayIndex);
  ok('filtering the combined notables by day 1 excludes day 2', day1Only.length === out.notableEvents.length && day1Only.every(e => e.payload.dayIndex === out.record.newDayIndex));
})();

section('Day-tick PREVIEW determinism — re-proposing the same state is identical (Joachim 2026-06-05)');
(function () {
  // The floating Day-tick review previews the upcoming journey day. It must NOT re-roll on
  // re-open: proposeJourneyDay (the preview path, no injected rng) seeds the day's dice from the
  // journey's committed-state fingerprint, so the same state always previews the same day. It
  // re-previews only when something real changes (a supply toggle), and an explicit ctx.rng still
  // forces genuine randomness (the reroll path).
  function freshC() {
    const c = ACKS.blankCampaign({ name: 'det' });
    c.currentTurn = 1; c.currentDayInMonth = 1; c.calendar = { year: 1, month: 1, day: 1 }; c.houseRules = {};
    // no water source (plain grassland), no supplies → the day rolls nav + forage + survival.
    c.hexes = [ACKS.blankHex({ id: 'd0', coord: { q: 0, r: 0 }, terrain: 'grassland' }),
               ACKS.blankHex({ id: 'd9', coord: { q: 9, r: 0 }, terrain: 'grassland' })];
    c.characters = [ACKS.blankCharacter({ id: 'dc', name: 'D', waterDaysCarried: 0, foodDeficitDays: 0 })];
    const j = ACKS.blankJourney({ id: 'dj', participantCharacterIds: ['dc'], startHexId: 'd0', currentHexId: 'd0', destinationHexId: 'd9', forageWaterEnabled: false, supplies: { rations: 0, waterRations: 0 } });
    c.journeys = [j]; ACKS.startJourney(c, j);
    return c;
  }
  const jRec = (prop) => JSON.stringify((prop.pendingRecords || []).filter(r => r && (r.kind === 'journey-day' || r.consumer === 'journeys'))[0] || null);

  // 1) proposeJourneyDay (the preview handler) — no rng → seeded → stable across re-proposes.
  const cA = freshC();
  const p1 = ACKS.proposeJourneyDay(cA, { dayInMonth: 2 });
  const p2 = ACKS.proposeJourneyDay(cA, { dayInMonth: 2 });
  ok('proposeJourneyDay (no rng) is identical on re-propose', jRec(p1) === jRec(p2) && jRec(p1) !== 'null');

  // 2) proposeDayTick (the UI's actual path, via _proposeDayTick) — same stability end-to-end.
  const cB = freshC();
  const d1 = ACKS.proposeDayTick(cB, 1, {});
  const d2 = ACKS.proposeDayTick(cB, 1, {});
  ok('proposeDayTick is identical on re-propose (UI path)', jRec(d1) === jRec(d2) && jRec(d1) !== 'null');
  ok('proposeDayTick did NOT mutate the real campaign (still day 1, journey un-advanced)',
     cB.currentDayInMonth === 1 && (cB.journeys[0].currentDayIndex || 0) === 0);

  // 3) a REAL change (toggle forage-for-water) re-previews to a different upcoming day.
  const cC = freshC();
  const before = jRec(ACKS.proposeJourneyDay(cC, { dayInMonth: 2 }));
  cC.journeys[0].forageWaterEnabled = true;                       // the GM flips a supply lever
  const after = jRec(ACKS.proposeJourneyDay(cC, { dayInMonth: 2 }));
  ok('toggling forage-for-water re-previews (fingerprint changed)', before !== after);

  // 4) an explicit ctx.rng still overrides the seed (genuine-randomness path preserved).
  const cD = freshC();
  const lo = jRec(ACKS.proposeJourneyDay(cD, { dayInMonth: 2, rng: () => 0.01 }));
  const hi = jRec(ACKS.proposeJourneyDay(cD, { dayInMonth: 2, rng: () => 0.99 }));
  ok('an injected ctx.rng still drives the roll (overrides the seed)', lo !== hi);

  // 5) advancing the world day re-seeds (day 5 ≠ day 6 even from an identical journey shape).
  const cE = freshC();
  const dayX = jRec(ACKS.proposeJourneyDay(cE, { dayInMonth: 2 }));
  const dayY = jRec(ACKS.proposeJourneyDay(cE, { dayInMonth: 3 }));
  ok('a different world day re-seeds the preview', dayX !== dayY);
})();

section('Members-table preview — dayRecord.memberSurvival carries the proposed per-member survival (Joachim 2026-06-05)');
(function () {
  // The members table previews the proposed day's conditions while a day-tick proposal is open, so it
  // agrees with the day review. The day record carries a compact per-member post-day survival snapshot.
  const c = ACKS.blankCampaign({ name: 'ms' });
  c.currentTurn = 1; c.currentDayInMonth = 1; c.calendar = { year: 1, month: 1, day: 1 }; c.houseRules = {};
  c.hexes = [ACKS.blankHex({ id: 'm0', coord: { q: 0, r: 0 }, terrain: 'grassland' }), ACKS.blankHex({ id: 'm9', coord: { q: 9, r: 0 }, terrain: 'grassland' })];
  c.characters = [ACKS.blankCharacter({ id: 'mc', name: 'M', waterDaysCarried: 0, foodDeficitDays: 0 })];
  const j = ACKS.blankJourney({ id: 'mj', participantCharacterIds: ['mc'], startHexId: 'm0', currentHexId: 'm0', destinationHexId: 'm9', forageWaterEnabled: true, supplies: { rations: 0, waterRations: 0 } });
  c.journeys = [j]; ACKS.startJourney(c, j);
  // no water source + forage FAILS (rng → low roll) + no rations → the proposed day dehydrates + starves
  const out = ACKS.tickJourneyDay(c, j, { rng: () => 0 });
  const ms = out.record.dayRecord.memberSurvival;
  ok('dayRecord carries memberSurvival', !!ms && typeof ms === 'object');
  ok('memberSurvival keyed by participant id', !!(ms && ms['mc']));
  const m = (ms && ms['mc']) || {};
  ok('memberSurvival has the 4 condition fields', ['foodDeficitDays', 'waterDeficitDays', 'conLossHunger', 'conLossThirst'].every(k => k in m));
  ok('forage-fail day → waterDeficitDays > 0 (Dehydrated in the preview)', m.waterDeficitDays > 0);
  ok('no-rations day → foodDeficitDays > 0 (Hungry/Underfed in the preview)', m.foodDeficitDays > 0);
  ok('the pure tick does NOT mutate the real character (snapshot only — applies on commit)', (c.characters[0].waterDeficitDays || 0) === 0);
})();

// ─── summary ───
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — provisioning.smoke.js: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { console.log('Failures:\n  - ' + failures.join('\n  - ')); process.exit(1); }
