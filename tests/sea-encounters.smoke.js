// =============================================================================
// sea-encounters.smoke.js — Voyages V4: the maritime Encounter layer (JJ pp.71–78 + RR p.323).
// Pins the transcribed JJ Sea tables (oracle cells), the sea procedure math (distance / evasion /
// Sea Pursuit Time), the seaEncounterDraw spine (category → rarity[reused] → identity → 6a bind),
// and the integration — a voyage FIRES sea checks (the land loop stands down), the commit
// materializes Encounter entities with the sea context, the per-region cadence, and the load-bearing
// guards: a LAND journey draws no sea encounter; a manned-vessel "Man, …" result is RAW-evadable.
// =============================================================================
const fs = require('fs');
const path = require('path');
global.window = global;
require('./_engine.js').load();
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('\n--- ' + t + ' ---'); }
// rng helpers: nat(k,sides) → the rng value that rolls natural k on 1dSides; rngOf(vals) → a sequence.
const nat = (k, sides) => (k - 0.5) / sides;
const at = (k, sides) => () => nat(k, sides);
const rngOf = vals => { let i = 0; return () => vals[Math.min(i++, vals.length - 1)]; };

// =============================================================================
section('module loads + exports');
// =============================================================================
['seaEncounterDraw','seaTerritoryClassForHex','rollSeaEncounterCategory','seaCategoryColumnIndex',
 'rollSeaCivilized','rollSeaMonster','rollNauticalEncounter','seaEncounterDistance','evasionAtSea',
 'seaPursuitTime','SEA_CATEGORY_COLUMNS','SEA_CIVILIZED_TABLE','SEA_MONSTER_TABLE','SEA_PURSUIT_TIME',
 'NAUTICAL_BENEFICIAL','NAUTICAL_DETRIMENTAL','NAUTICAL_UNIQUE','SEA_ENCOUNTER_FREQUENCY']
 .forEach(k => ok('ACKS.' + k + ' present', ACKS[k] != null));
ok('reuses the shipped land rarity (no sea rarity table)', typeof ACKS.rollEncounterRarity === 'function');

// =============================================================================
section('Sea territory classification (JJ p.71)');
// =============================================================================
ok('open-sea → unsettled', ACKS.seaTerritoryClassForHex({}, null, 'open-sea') === 'unsettled');
ok('coast → borderlands', ACKS.seaTerritoryClassForHex({}, null, 'coast') === 'borderlands');
ok('lake → civilized', ACKS.seaTerritoryClassForHex({}, null, 'lake') === 'civilized');
ok('river → civilized', ACKS.seaTerritoryClassForHex({}, null, 'river') === 'civilized');
ok('unknown zone → unsettled', ACKS.seaTerritoryClassForHex({}, null, 'nonsense') === 'unsettled');

// =============================================================================
section('Sea Encounter by Territory Classification (JJ p.72, 1d20) — column model + cells');
// =============================================================================
ok('column: civilized base → 1', ACKS.seaCategoryColumnIndex('civilized', {}) === 1);
ok('column: civilized + trade route → 0 (safest)', ACKS.seaCategoryColumnIndex('civilized', { tradeRoute: true }) === 0);
ok('column: unsettled base → 4', ACKS.seaCategoryColumnIndex('unsettled', {}) === 4);
ok('column: borderlands + trade route → 1', ACKS.seaCategoryColumnIndex('borderlands', { tradeRoute: true }) === 1);
ok('column: night shifts civilized → 2', ACKS.seaCategoryColumnIndex('civilized', { night: true }) === 2);
ok('column: night does NOT shift unsettled past 4', ACKS.seaCategoryColumnIndex('unsettled', { night: true }) === 4);
// Unsettled column (idx 4): 1–10 no-encounter, 11–17 monster, 18–20 nautical (no civilized, no shift).
ok('unsettled @1 → no-encounter (no shift)', ACKS.rollSeaEncounterCategory({ territoryClass: 'unsettled', rng: at(1, 20) }).category === 'no-encounter');
ok('unsettled @10 → no-encounter', ACKS.rollSeaEncounterCategory({ territoryClass: 'unsettled', rng: at(10, 20) }).category === 'no-encounter');
ok('unsettled @11 → monster', ACKS.rollSeaEncounterCategory({ territoryClass: 'unsettled', rng: at(11, 20) }).category === 'monster');
ok('unsettled @17 → monster', ACKS.rollSeaEncounterCategory({ territoryClass: 'unsettled', rng: at(17, 20) }).category === 'monster');
ok('unsettled @18 → nautical', ACKS.rollSeaEncounterCategory({ territoryClass: 'unsettled', rng: at(18, 20) }).category === 'nautical');
ok('unsettled @20 → nautical', ACKS.rollSeaEncounterCategory({ territoryClass: 'unsettled', rng: at(20, 20) }).category === 'nautical');
// Civilized + trade route (idx 0): 2–13 no-encounter, 14–20 civilized (no monster/nautical — a safe lane).
ok('civ+trade @14 → civilized', ACKS.rollSeaEncounterCategory({ territoryClass: 'civilized', tradeRoute: true, rng: at(14, 20) }).category === 'civilized');
ok('civ+trade @13 → no-encounter', ACKS.rollSeaEncounterCategory({ territoryClass: 'civilized', tradeRoute: true, rng: at(13, 20) }).category === 'no-encounter');
ok('civ+trade has no monster row', !('monster' in ACKS.SEA_CATEGORY_COLUMNS[0].rows));
// Borderlands base (idx 2): 19 = monster, 20 = nautical.
ok('borderlands @19 → monster', ACKS.rollSeaEncounterCategory({ territoryClass: 'borderlands', rng: at(19, 20) }).category === 'monster');
ok('borderlands @20 → nautical', ACKS.rollSeaEncounterCategory({ territoryClass: 'borderlands', rng: at(20, 20) }).category === 'nautical');
// Column-Shift, Roll Again: a natural 1 on cols 0–3 shifts one column right then re-rolls.
{ const r = ACKS.rollSeaEncounterCategory({ territoryClass: 'civilized', rng: rngOf([nat(1, 20), nat(19, 20)]) });
  ok('civ @1 → column shift, re-roll on col 2 → @19 = monster', r.category === 'monster' && r.rolls.length === 2, JSON.stringify(r.rolls)); }
ok('unsettled column does NOT shift on 1', ACKS.SEA_CATEGORY_COLUMNS[4].shiftOn1 === false);

// =============================================================================
section('Sea rarity = the shipped land Monster Rarity table (JJ p.72, identical)');
// =============================================================================
ok('unsettled @8 → common', ACKS.rollEncounterRarity('unsettled', at(8, 20)).rarity === 'common');
ok('unsettled @20 → very-rare', ACKS.rollEncounterRarity('unsettled', at(20, 20)).rarity === 'very-rare');
ok('civilized @20 → rare (no very-rare in civilized)', ACKS.rollEncounterRarity('civilized', at(20, 20)).rarity === 'rare');

// =============================================================================
section('Sea Civilized Encounter (JJ p.73, 1d100) — oracle cells');
// =============================================================================
ok('civilized @01 → commoner (fishers)', (() => { const x = ACKS.rollSeaCivilized('civilized', at(1, 100)); return x.key === 'commoner' && /fishers/.test(x.label); })());
ok('civilized @40 → merchant-mariner', ACKS.rollSeaCivilized('civilized', at(40, 100)).key === 'merchant-mariner');
ok('civilized @85 → naval mariner (label-only)', (() => { const x = ACKS.rollSeaCivilized('civilized', at(85, 100)); return x.key === null && /Naval Mariner/.test(x.label); })());
ok('civilized @90 → pirate', ACKS.rollSeaCivilized('civilized', at(90, 100)).key === 'pirate');
ok('civilized @100 → raider', ACKS.rollSeaCivilized('civilized', at(100, 100)).key === 'raider');
ok('unsettled @75 → pirate (wilder → rougher company)', ACKS.rollSeaCivilized('unsettled', at(75, 100)).key === 'pirate');
ok('unsettled @25 → merchant-mariner', ACKS.rollSeaCivilized('unsettled', at(25, 100)).key === 'merchant-mariner');

// =============================================================================
section('Sea Monster Encounters by Rarity (JJ p.73, 1d100) — oracle cells');
// =============================================================================
ok('common @01 → common-dolphin', ACKS.rollSeaMonster('common', at(1, 100)).key === 'common-dolphin');
ok('common @60 → bull-shark', ACKS.rollSeaMonster('common', at(60, 100)).key === 'bull-shark');
ok('common @100 → sea-turtle', ACKS.rollSeaMonster('common', at(100, 100)).key === 'sea-turtle');
ok('common @20 → Petty Water Elemental (label-only)', (() => { const x = ACKS.rollSeaMonster('common', at(20, 100)); return x.key === null && /Petty Water/.test(x.label); })());
ok('uncommon @51 → raider (a manned vessel on the monster table)', ACKS.rollSeaMonster('uncommon', at(51, 100)).key === 'raider');
ok('uncommon @95 → killer-whale', ACKS.rollSeaMonster('uncommon', at(95, 100)).key === 'killer-whale');
ok('rare @15 → griffon', ACKS.rollSeaMonster('rare', at(15, 100)).key === 'griffon');
ok('rare @75 → Sphinx (label-only, excluded variant)', (() => { const x = ACKS.rollSeaMonster('rare', at(75, 100)); return x.key === null && x.label === 'Sphinx'; })());
ok('very-rare @01 → Damned Mariners (label-only, nauticalRef)', (() => { const x = ACKS.rollSeaMonster('very-rare', at(1, 100)); return x.key === null && x.nauticalRef === true && /Damned/.test(x.label); })());
ok('very-rare @10 → Sea Dragon (label-only, excluded)', (() => { const x = ACKS.rollSeaMonster('very-rare', at(10, 100)); return x.key === null && /Dragon, Sea/.test(x.label); })());
ok('very-rare @50 → Ghost Ship (nauticalRef)', (() => { const x = ACKS.rollSeaMonster('very-rare', at(50, 100)); return x.nauticalRef === true && /Ghost Ship/.test(x.label); })());
ok('very-rare @55 → kraken', ACKS.rollSeaMonster('very-rare', at(55, 100)).key === 'kraken');
ok('very-rare @100 → sperm-whale', ACKS.rollSeaMonster('very-rare', at(100, 100)).key === 'sperm-whale');
// Every non-null catalog key resolves in the Monster Catalog (no broken keys).
{ let broken = []; for(const rar of ['common','uncommon','rare','very-rare']){ for(const cell of ACKS.SEA_MONSTER_TABLE[rar]){ if(cell.key && typeof ACKS.findMonster === 'function' && !ACKS.findMonster(cell.key)) broken.push(rar + ':' + cell.key); } }
  ok('every non-null Sea Monster key resolves in the catalog', broken.length === 0, broken.join(',')); }

// =============================================================================
section('Nautical Encounters (JJ pp.73–78, 1d12 type + sub-tables)');
// =============================================================================
ok('type @1–5 → beneficial', ACKS.rollNauticalEncounter(at(1, 12)).type === 'beneficial' && ACKS.rollNauticalEncounter(at(5, 12)).type === 'beneficial');
ok('type @6–10 → detrimental', ACKS.rollNauticalEncounter(at(6, 12)).type === 'detrimental' && ACKS.rollNauticalEncounter(at(10, 12)).type === 'detrimental');
ok('type @11–12 → unique', ACKS.rollNauticalEncounter(at(11, 12)).type === 'unique' && ACKS.rollNauticalEncounter(at(12, 12)).type === 'unique');
ok('beneficial #3 = Favorable Current (+50% speed)', (() => { const c = ACKS.NAUTICAL_BENEFICIAL.find(x => x.n === 3); return c && /Favorable Current/.test(c.name) && /50%/.test(c.effect); })());
ok('detrimental #6 = Nautical Hazard (persistent)', (() => { const c = ACKS.NAUTICAL_DETRIMENTAL.find(x => x.n === 6); return c && /Nautical Hazard/.test(c.name) && c.persistent === true; })());
ok('unique #2 = Damned Mariners (haugbui/draugr)', (() => { const c = ACKS.NAUTICAL_UNIQUE.find(x => x.n === 2); return c && /Damned Mariners/.test(c.name); })());
ok('unique #9 = Place of Power (persistent)', (() => { const c = ACKS.NAUTICAL_UNIQUE.find(x => x.n === 9); return c && /Place of Power/.test(c.name) && c.persistent === true; })());
ok('rollNautical carries name + effect + persistent', (() => { const r = ACKS.rollNauticalEncounter(rngOf([nat(1, 12), nat(8, 12)])); return r.type === 'beneficial' && r.name === 'Navigational Sign' && r.persistent === true; })());
ok('each sub-table is 1d12 (12 entries)', ACKS.NAUTICAL_BENEFICIAL.length === 12 && ACKS.NAUTICAL_DETRIMENTAL.length === 12 && ACKS.NAUTICAL_UNIQUE.length === 12);
ok('NAUTICAL_VESSELS 1d20 (20 entries)', Array.isArray(ACKS.NAUTICAL_VESSELS) && ACKS.NAUTICAL_VESSELS.length === 20);
ok('treasure-by-territory: civilized L,D / unsettled O', ACKS.NAUTICAL_TREASURE_BY_TERRITORY.civilized === 'L,D' && ACKS.NAUTICAL_TREASURE_BY_TERRITORY.unsettled === 'O');

// =============================================================================
section('Sea-encounter distance → evasion → pursuit (RR p.323)');
// =============================================================================
ok('distance clear → far (5280 ft)', ACKS.seaEncounterDistance({ weatherCondition: 'clear' }).distanceFt === 5280);
ok('distance fog → 20 ft, combat immediately', (() => { const d = ACKS.seaEncounterDistance({ weatherCondition: 'fog' }); return d.distanceFt === 20 && d.combatBeginsImmediately === true; })());
ok('distance clear → combat NOT immediate (range > 1800)', ACKS.seaEncounterDistance({ weatherCondition: 'clear' }).combatBeginsImmediately === false);
ok('combat range = 1800 ft', ACKS.SEA_COMBAT_RANGE_FEET === 1800);
ok('evasion: a true sea creature CANNOT be evaded', ACKS.evasionAtSea({ category: 'monster', identity: { key: 'kraken', label: 'Kraken' } }).canEvade === false);
ok('evasion: a civilized vessel CAN be evaded', ACKS.evasionAtSea({ category: 'civilized' }).canEvade === true);
ok('evasion: a "Man, Raider" on the monster table CAN be evaded (manned vessel)', ACKS.evasionAtSea({ category: 'monster', identity: { key: 'raider', label: 'Man, Raider' } }).canEvade === true);
ok('evasion vessel routes (RR p.323, 5)', ACKS.evasionAtSea({ category: 'civilized' }).routes.length === 5);
ok('pursuit: faster vessel cannot be caught', ACKS.seaPursuitTime(-10).uncatchable === true);
ok('pursuit: equal speed cannot be caught', ACKS.seaPursuitTime(0).uncatchable === true);
ok('pursuit: 30/rd slower → 1d6+2 hours', (() => { const p = ACKS.seaPursuitTime(30, at(1, 6)); return p.band.dice === '1d6+2' && p.unit === 'hours'; })());
ok('pursuit: 45/rd slower → 1d3+1 hours band', ACKS.seaPursuitTime(45, () => 0).band.dice === '1d3+1');
ok('pursuit: 100/rd slower → 2d6+1 turns band', ACKS.seaPursuitTime(100, () => 0).band.unit === 'turns');
ok('pursuit: 150/rd slower → caught (not uncatchable)', ACKS.seaPursuitTime(150, () => 0).uncatchable === false);

// =============================================================================
section('seaEncounterDraw — the maritime mirror of encounterDraw');
// =============================================================================
const dc = { schemaVersion: 2, currentTurn: 1, hexes: [{ id: 'h-sea', domainId: null }], lairs: [], groups: [] };
ok('no-encounter draw (unsettled @1)', ACKS.seaEncounterDraw(dc, 'h-sea', { seaZone: 'open-sea', rng: at(1, 20) }).category === 'no-encounter');
{ const d = ACKS.seaEncounterDraw(dc, 'h-sea', { seaZone: 'open-sea', rng: () => 0.5 });   // unsettled @11 = monster, uncommon @51 = raider
  ok('monster draw: category monster + identity + binding + distance + evasion', d.category === 'monster' && d.identityRoll && d.binding && d.distance && d.evasion, JSON.stringify({ c: d.category, i: !!d.identityRoll, b: !!d.binding }));
  ok('monster draw carries the sea context (atSea/seaZone)', d.atSea === true && d.seaZone === 'open-sea');
  ok('monster draw rarity comes from the (reused) land table', d.rarity === 'uncommon'); }
{ const d = ACKS.seaEncounterDraw(dc, 'h-sea', { seaZone: 'open-sea', rng: () => 0.9 });   // unsettled @19 = nautical
  ok('nautical draw: category nautical + nautical result, no identity', d.category === 'nautical' && d.nautical && !d.identityRoll); }
{ const d = ACKS.seaEncounterDraw(dc, 'h-sea', { seaZone: 'open-sea', rng: () => 0.0 });    // unsettled @1 = no-encounter (already covered) — distance flavor on a meeting
  ok('no-encounter draw has no distance/evasion', d.distance === null && d.evasion === null); }

// =============================================================================
section('Integration — a voyage FIRES sea checks; the commit materializes Encounter entities');
// =============================================================================
function mkVoyage(opts){
  opts = opts || {};
  const c = { schemaVersion: 2, currentTurn: 1, currentDayInMonth: 1, hexes: [], characters: [{ id: 'cap', currentHexId: 'l0' }], parties: [], journeys: [], encounters: [], vessels: [], groups: [], lairs: [] };
  for(let r = 0; r <= 60; r++) c.hexes.push(ACKS.blankHex({ id: 'l' + r, coord: { q: 0, r: r }, terrain: 'water', seaZone: 'open-sea' }));
  const v = ACKS.blankVessel({ name: 'Probe', catalogKey: 'sailing-ship-large' }); c.vessels.push(v);
  const j = ACKS.blankJourney({ name: 'Voyage', mode: 'voyage-sail', shipId: v.id, participantCharacterIds: ['cap'], startHexId: 'l0', destinationHexId: 'l60', currentHexId: 'l0' });
  if(opts.journey) Object.assign(j, opts.journey);   // defensive fields (tradeRoute) — not on blankJourney
  c.journeys.push(j);
  return { c, j, v };
}
const _W = { wind: 'Moderate', windDirection: 0, condition: 'fair', temperature: 'moderate' };
{ const { c, j } = mkVoyage();
  const dr = ACKS.tickJourneyDay(c, j, { rng: () => 0.5, weather: _W });   // 12 hexes; sea roll 11 → monster every check
  const sea = (dr.record.encounterProposals || []).filter(p => p.draw && p.draw.atSea);
  ok('voyage day sails 12 hexes (72 mi)', /\+12 hex/.test(dr.record.label), dr.record.label);
  ok('sea checks fire per 24-mile region (12 hexes → 3)', sea.length === 3, 'got ' + sea.length);
  ok('the sea proposal is a monster meeting (raider)', sea[0] && sea[0].draw.category === 'monster' && sea[0].draw.identityRoll.key === 'raider');
  ok('the sea notable rides dr.notableEvents (pauses via pauseTrigger encounter)', dr.notableEvents.some(n => n.type === 'sea-encounter' && n.pauseTrigger === 'encounter'));
  const before = c.encounters.length;
  ACKS.commitJourneyRecord(c, dr.record);
  const made = c.encounters.slice(before);
  ok('commit materializes 3 Encounter entities', made.length === 3, 'got ' + made.length);
  ok('the materialized entity carries atSea + seaZone', made[0].atSea === true && made[0].seaZone === 'open-sea');
  ok('the entity carries the sea distance (5280 ft, the open sea)', made[0].distance && made[0].distance.distanceFt === 5280 && /open sea/.test(made[0].distance.terrainRow || ''));
  ok('the entity carries the sea evasion verdict (raider = evadable)', made[0].evasion && made[0].evasion.canEvade === true);
  ok('the monster side is the raider with a rolled count', made[0].monsterSide && made[0].monsterSide.monsterCatalogKey === 'raider' && made[0].monsterSide.count > 0); }
// Trade route → per 6-mile hex cadence (12 hexes → 12 checks). A trade route shifts the column LEFT
// (safer), so rng 0.725 (roll 15) lands on the shifted col-3 monster band (15–18) — proving every hex
// fires a check (vs every 4th for the per-region cadence above).
{ const { c, j } = mkVoyage({ journey: { tradeRoute: true } });
  const dr = ACKS.tickJourneyDay(c, j, { rng: () => 0.725, weather: _W });
  ok('trade-route voyage checks per 6-mile hex (12)', (dr.record.encounterProposals || []).filter(p => p.draw && p.draw.atSea).length === 12, 'got ' + (dr.record.encounterProposals || []).filter(p => p.draw && p.draw.atSea).length); }
// A nautical result → a GM-resolve notable, NO entity.
{ const { c, j } = mkVoyage();
  const dr = ACKS.tickJourneyDay(c, j, { rng: () => 0.9, weather: _W });   // sea roll 19 → nautical
  const nau = dr.notableEvents.filter(n => n.type === 'sea-nautical');
  ok('nautical result → a sea-nautical notable', nau.length >= 1, 'got ' + nau.length);
  ok('nautical result mints NO Encounter entity', (dr.record.encounterProposals || []).filter(p => p.draw && p.draw.atSea).length === 0); }
// Control — a LAND journey draws NO sea encounter (the isVoyage gate).
{ const lc = { schemaVersion: 2, currentTurn: 1, currentDayInMonth: 1, hexes: [ACKS.blankHex({ id: 'g0', coord: { q: 0, r: 0 }, terrain: 'grassland' }), ACKS.blankHex({ id: 'g1', coord: { q: 0, r: 1 }, terrain: 'grassland' })], characters: [{ id: 'w', currentHexId: 'g0' }], parties: [], journeys: [], encounters: [] };
  const lj = ACKS.blankJourney({ name: 'Land', participantCharacterIds: ['w'], startHexId: 'g0', destinationHexId: 'g1', currentHexId: 'g0' }); lc.journeys.push(lj);
  const ldr = ACKS.tickJourneyDay(lc, lj, { rng: () => 0.5, weather: { condition: 'fair', temperature: 'moderate' } });
  ok('LAND journey draws no sea proposals', !(ldr.record.encounterProposals || []).some(p => p.draw && p.draw.atSea));
  ok('LAND journey notables carry no sea-encounter', !ldr.notableEvents.some(n => /^sea-/.test(n.type || ''))); }

// =============================================================================
console.log('\n=============================================================');
console.log('  Sea Encounters (V4) smoke: ' + pass + ' pass / ' + fail + ' fail');
console.log('  Passed: ' + pass);
console.log('  Failed: ' + fail);
if(fail === 0){
  console.log('\nAll Voyages V4 sea-encounter smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nFAILURES:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
