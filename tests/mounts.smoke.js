/* Phase 2.5 Mounts (MO-1..MO-3) smoke test — the Mount entity + journey integration.
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/mounts.smoke.js
 *
 * Covers:
 *   MO-1 — MOUNT_CATALOG (RR p.161 — 11 breeds, speed/load/feed values) + blankMount/createMount +
 *          mnt- prefix + campaign.mounts[] collection + entity-registry + field-schema (⊆ factory) +
 *          load→speed (RR p.161: full ≤ normal, half ≤ max, 0 over) + barding-as-load + traits.
 *   MO-2 — journeyBaseSpeedMilesPerDay: a mounted participant travels at his mount's load-adjusted
 *          expedition speed; pack animals cap the column; an overloaded animal halts it.
 *   MO-3 — resolveMountFeedingDay/applyMountFeedingDay (RR p.276: food=load/10, water=load/5; grazers;
 *          camels; fresh-water; Hungry→Underfed→Starving/Dehydrated ladder) + an end-to-end day-tick
 *          that feeds the herd on commit + the ignore-rations opt-out + migrate-no-op on templates.
 *
 * Authored 2026-06-21 (Mounts MO-1..MO-3).
 */
const fs = require('fs');
const path = require('path');
require('./_engine.js').load();
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){ if(cond){ passed++; } else { console.log('  FAIL ' + label + (detail ? '  -- ' + detail : '')); failed++; } }
function section(t){ console.log('--- ' + t + ' ---'); }

// ─────────────────────────────────────────────────────────────────────────────
section('MO-1 — prefix + collection + catalog');
check('ID_PREFIXES.mount === "mnt"', ACKS.ID_PREFIXES.mount === 'mnt');
check('campaign.mounts[] is importable', ACKS.importableCollections().indexOf('mounts') !== -1);
check('mounts is NOT seeded in blankCampaign (migrate-no-op model)', !Array.isArray(ACKS.blankCampaign({}).mounts));

const CAT = ACKS.MOUNT_CATALOG;
check('MOUNT_CATALOG is a frozen array of 11', Array.isArray(CAT) && CAT.length === 11 && Object.isFrozen(CAT));
// RR p.161 spot-checks (the canonical Animal/Vehicle Speed and Encumbrance table)
const lh = ACKS.findMountClass('horse-light');
check('light horse: 48/24 mi, load 20/40 (RR p.161)', lh.expeditionMi === 48 && lh.expeditionEncMi === 24 && lh.normalLoadSt === 20 && lh.maxLoadSt === 40);
check('light horse: 2 st food / 4 st water (RR p.276)', lh.dailyFoodSt === 2 && lh.dailyWaterSt === 4);
const mh = ACKS.findMountClass('horse-medium');
check('medium horse: 36 mi, load 30, food 3 / water 6', mh.expeditionMi === 36 && mh.normalLoadSt === 30 && mh.dailyFoodSt === 3 && mh.dailyWaterSt === 6);
check('donkey is a grazer + surefooted, not war-trainable', ACKS.findMountClass('donkey').traits.indexOf('grazer') !== -1 && !ACKS.mountCanBeWarTrained('donkey'));
check('medium horse is war-trainable', ACKS.mountCanBeWarTrained('horse-medium'));
check('every breed (bar the RAW-rounded steppe) food=load/10 & water=load/5 (RR p.276)', CAT.filter(c => c.key !== 'horse-steppe').every(c => Math.abs(c.dailyFoodSt - c.normalLoadSt/10) < 0.001 && Math.abs(c.dailyWaterSt - c.normalLoadSt/5) < 0.001));
check('steppe horse is the RAW exception: 2 st* food / 4 st water (RR p.276 efficient grazer)', ACKS.findMountClass('horse-steppe').dailyFoodSt === 2 && ACKS.findMountClass('horse-steppe').dailyWaterSt === 4);
check('cost lookup: medium war horse 250gp (RR p.130)', ACKS.mountTrainingCost('horse-medium', 'war') === 250);

// ─────────────────────────────────────────────────────────────────────────────
section('MO-1 — factory + registry + field schema');
const mb = ACKS.blankMount({ catalogKey: 'horse-medium' });
check('blankMount returns a mnt- id', typeof mb.id === 'string' && mb.id.startsWith('mnt-'));
check('blankMount defaults training to the first allowed (draft for medium horse)', mb.training === 'draft');
check('blankMount defaults role mount / condition healthy / empty cargo', mb.role === 'mount' && mb.condition === 'healthy' && Array.isArray(mb.cargo) && mb.cargo.length === 0);
check('blankMount feeding state present', mb.foodDeficitDays === 0 && mb.waterDeficitDays === 0 && mb.conditionFlags && mb.conditionFlags.hungry === false);
const reg = ACKS.ENTITY_KINDS_LIST.find(e => e.kind === 'mount');
check('entity-registry has the mount kind (🐴)', !!reg && reg.icon === '🐴');
const sch = ACKS.FIELD_SCHEMAS['mount'];
check('field schema present + factory blankMount', !!sch && sch.factory === 'blankMount');
const fk = new Set(Object.keys(ACKS.blankMount({})));
check('every schema field ⊆ blankMount keys', sch.fields.every(f => fk.has(f.name)));

// ─────────────────────────────────────────────────────────────────────────────
section('MO-1 — load → speed (RR p.161)');
function rig(){ const c = { characters: [], mounts: [] }; return c; }
let c = rig();
c.characters.push({ id: 'chr-cav', inventory: [{ name: 'spear', stone: 1 }, { name: 'shield', stone: 1 }, { name: 'leather', stone: 2 }], coins: {} });
const cav = ACKS.createMount(c, { catalogKey: 'horse-light', training: 'riding', role: 'mount', ownerCharacterId: 'chr-cav', riderCharacterId: 'chr-cav' });
check('RR p.161 example: cavalryman = 19 st on his mount', ACKS.mountRiderWeightSt(c, cav) === 19);
check('19 st ≤ normal 20 → full band → 48 mi', ACKS.mountLoadBand(c, cav) === 'full' && ACKS.mountExpeditionMi(c, cav) === 48);
cav.cargo.push({ name: 'loot', encumbranceSt: 3 });            // 22 > 20 normal, ≤ 40 max
check('22 st → half band → 24 mi', ACKS.mountLoadBand(c, cav) === 'half' && ACKS.mountExpeditionMi(c, cav) === 24);
cav.cargo.push({ name: 'ore', encumbranceSt: 20 });            // 42 > 40 max
check('42 st > max → overloaded → 0 mi (cannot move)', ACKS.mountLoadBand(c, cav) === 'overloaded' && ACKS.mountExpeditionMi(c, cav) === 0);
// barding eats load (war-trained only); GM-set load (RR p.128 "Varies")
const wm = ACKS.blankMount({ catalogKey: 'horse-medium', training: 'war', bardingKey: 'chain', bardingLoadSt: 18 });
check('war horse may wear barding; barding AC + load read back', ACKS.mountCanWearBarding(wm) && ACKS.mountBardingAc(wm) === 3 && ACKS.mountBardingLoadSt(wm) === 18);

// ─────────────────────────────────────────────────────────────────────────────
section('MO-2 — journey expedition speed');
function speedRig(mountSpecs, footIds){
  const cc = { characters: [], mounts: [] };
  const pcIds = [];
  (footIds || []).forEach(id => { cc.characters.push({ id, inventory: [], coins: {} }); pcIds.push(id); });
  const packIds = [];
  (mountSpecs || []).forEach(s => {
    if(s.rider){ cc.characters.push({ id: s.rider, inventory: [], coins: {} }); pcIds.push(s.rider); }
    const m = ACKS.createMount(cc, { catalogKey: s.key, role: s.role || 'mount', riderCharacterId: s.rider || null, cargo: s.cargo || [] });
    packIds.push(m.id);
  });
  const j = { participantCharacterIds: pcIds, packAnimalIds: packIds };
  return ACKS.journeyBaseSpeedMilesPerDay(cc, j);
}
check('foot party (2) = 24 mi', speedRig([], ['a', 'b']) === 24);
check('both on light horses = 48 mi', speedRig([{ key: 'horse-light', rider: 'a' }, { key: 'horse-light', rider: 'b' }]) === 48);
check('mixed light + medium = slowest 36 mi', speedRig([{ key: 'horse-light', rider: 'a' }, { key: 'horse-medium', rider: 'b' }]) === 36);
check('foot walker + a pack mule = walker 24 (pack does not speed walkers)', speedRig([{ key: 'mule', role: 'pack' }], ['a']) === 24);
check('mounted party + overloaded pack mule halts the column = 0', speedRig([{ key: 'horse-light', rider: 'a' }, { key: 'mule', role: 'pack', cargo: [{ name: 'x', encumbranceSt: 60 }] }]) === 0);

// ─────────────────────────────────────────────────────────────────────────────
section('MO-3 — feeding resolver (RR p.276)');
function feedRig(key, role, sup){ const cc = { characters: [], mounts: [] }; const m = ACKS.createMount(cc, { catalogKey: key, role: role || 'pack' }); return { cc, m, j: { packAnimalIds: [m.id], supplies: sup || {} } }; }
let f = feedRig('horse-medium', 'pack', { animalFeed: 10, animalWater: 20 });
let r = ACKS.resolveMountFeedingDay(f.cc, f.j, { terrain: 'grassland' });
check('medium horse draws 3 food / 6 water from store', r.foodConsumed === 3 && r.waterConsumed === 6 && r.foodStoreAfter === 7 && r.waterStoreAfter === 14);
check('fed horse: no deficit, no flags', r.mounts[0].fedFood && r.mounts[0].fedWater && r.mounts[0].foodDeficitDays === 0);
ACKS.applyMountFeedingDay(f.cc, f.j, r);
check('apply writes the stores back (idempotent SET)', f.j.supplies.animalFeed === 7 && f.j.supplies.animalWater === 14);
f = feedRig('donkey', 'pack', { animalFeed: 0, animalWater: 0 });
r = ACKS.resolveMountFeedingDay(f.cc, f.j, { terrain: 'grassland' });
check('donkey grazes its food free (grazer, off-march)', r.mounts[0].grazed && r.mounts[0].fedFood && r.foodConsumed === 0);
check('donkey with no water store → dehydrated', !r.mounts[0].fedWater && r.mounts[0].flags.dehydrated);
r = ACKS.resolveMountFeedingDay(f.cc, f.j, { forcedMarch: true, terrain: 'desert' });
check('donkey force-marched in desert cannot graze → hungry', !r.mounts[0].fedFood && r.mounts[0].flags.hungry);
f = feedRig('camel', 'mount', { animalFeed: 99, animalWater: 0 });
r = ACKS.resolveMountFeedingDay(f.cc, f.j, { terrain: 'desert' });
check('camel needs no water (desert dromedary, RR p.276)', r.mounts[0].fedWater && r.waterConsumed === 0);
f = feedRig('horse-light', 'pack', { animalFeed: 0, animalWater: 0 });
r = ACKS.resolveMountFeedingDay(f.cc, f.j, { hasFreshWater: true, terrain: 'grassland' });
check('a fresh-water hex waters the herd free', r.mounts[0].fedWater && r.mounts[0].freeWater && r.waterConsumed === 0);
// starvation ladder
f = feedRig('horse-light', 'pack', { animalFeed: 0, animalWater: 99 });
f.m.foodDeficitDays = 6;
r = ACKS.resolveMountFeedingDay(f.cc, f.j, { terrain: 'grassland' });
check('6 prior short days + 1 = 7 → starving (RR p.276)', r.mounts[0].foodDeficitDays === 7 && r.mounts[0].flags.starving);

// ─────────────────────────────────────────────────────────────────────────────
section('MO-3 — end-to-end day-tick feeds the herd on commit');
function journeyRig(opts){
  opts = opts || {};
  const cc = ACKS.blankCampaign({ name: 'mtest' });
  cc.currentTurn = 1; cc.currentDayInMonth = 1; cc.calendar = { year: 1, month: 1, day: 1 };
  cc.hexes = [
    ACKS.blankHex({ id: 'hex-a', coord: { q: 0, r: 0 }, terrain: 'grassland', hasRoad: true }),
    ACKS.blankHex({ id: 'hex-b', coord: { q: 40, r: 0 }, terrain: 'grassland', hasRoad: true })
  ];
  cc.characters = [ ACKS.blankCharacter({ id: 'chr-1', name: 'Drover' }) ];
  const m = ACKS.createMount(cc, { catalogKey: 'horse-medium', role: 'pack', currentHexId: 'hex-a' });
  const j = ACKS.blankJourney({ id: 'jrn-1', name: 'Drive', participantCharacterIds: ['chr-1'],
    startHexId: 'hex-a', destinationHexId: 'hex-b', mode: 'foot', packAnimalIds: [m.id],
    supplies: Object.assign({ rations: 30, waterRations: 30, animalFeed: 10, animalWater: 20, shipStores: 0 }, opts.supplies || {}) });
  cc.journeys = [j];
  cc.houseRules = Object.assign({ 'auto-pause-on-encounter': false, 'auto-pause-on-navigation-fail': false, 'auto-pause-on-supplies-low': false }, opts.houseRules || {});
  ACKS.startJourney(cc, j);
  return { cc, j, m };
}
let e = journeyRig();
ACKS.advanceJourneyOneDay(e.cc, e.j);
check('a committed travel day drew the herd feed from the store (10→7 food, 20→14 water)', e.j.supplies.animalFeed === 7 && e.j.supplies.animalWater === 14, e.j.supplies.animalFeed + '/' + e.j.supplies.animalWater);
check('the fed pack horse has no deficit after the day', e.m.foodDeficitDays === 0 && e.m.waterDeficitDays === 0);
check('the day record carries a mountFeeding digest', e.j.days.length === 1 && e.j.days[0].mountFeeding && e.j.days[0].mountFeeding.foodConsumed === 3);
// no store + no fresh water → the herd goes hungry + thirsty
e = journeyRig({ supplies: { animalFeed: 0, animalWater: 0 } });
ACKS.advanceJourneyOneDay(e.cc, e.j);
check('an unfed pack horse becomes hungry + dehydrated after a dry day', e.m.foodDeficitDays === 1 && e.m.conditionFlags.hungry && e.m.conditionFlags.dehydrated);
// ignore-rations opts out entirely
e = journeyRig({ supplies: { animalFeed: 0, animalWater: 0 }, houseRules: { 'ignore-rations': true } });
ACKS.advanceJourneyOneDay(e.cc, e.j);
check('ignore-rations: no feeding, the mount is untouched', e.m.foodDeficitDays === 0 && e.m.waterDeficitDays === 0 && !e.m.conditionFlags.hungry);
check('ignore-rations: the store is untouched too', e.j.supplies.animalFeed === 0);

// ─────────────────────────────────────────────────────────────────────────────
section('MO-1 — migrate-no-op on the shipped templates');
const tplDir = path.join(__dirname, '..', 'Templates');
let tplChecked = 0, tplClean = 0;
if(fs.existsSync(tplDir)){
  for(const file of fs.readdirSync(tplDir).filter(x => x.endsWith('.acks.json'))){
    const raw = JSON.parse(fs.readFileSync(path.join(tplDir, file), 'utf8'));
    const had = Array.isArray(raw.mounts);
    const mig = ACKS.migrateCampaign(JSON.parse(JSON.stringify(raw)));
    tplChecked++;
    if(Array.isArray(mig.mounts) === had) tplClean++;
  }
  check('migrate adds no mounts[] to any shipped template (' + tplChecked + ' checked)', tplChecked > 0 && tplClean === tplChecked);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\nmounts.smoke.js — Passed: ' + passed + ', Failed: ' + failed);
if(failed > 0) process.exit(1);
