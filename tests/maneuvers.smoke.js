// =============================================================================
// maneuvers.smoke.js — Phase 3 Military W4: the campaign layer (RR pp.447–460).
//
//   node tests/maneuvers.smoke.js   (or via `npm test`)
//
// Locks the printed worked examples EXACTLY: Tarkaun's 40-brigade army (48 →
// 72 → 24 mi/week, 12 → 18 → 6 mi/day, 12-mile column reduced to its speed,
// p.448), the elven/goblin reconnaissance modifier composition (p.453), the
// Marcus/Sarotem occupation 9.6gp > 2gp (p.458), the Sarotem pillage (3d6=13 →
// 6,500gp; 1d10=5 → 12,500gp supplies; 1d10=4 → 200 prisoners + 200 families,
// p.458), Luseatum salted (7,500 + 12,000 + 30,000 + 700 prisoners, p.459),
// and the 600-orc 25% proportional pillage (p.459). Plus: army marches on the
// journey engine (army speed, the army weather table, no nav/encounters/
// survival, river hold, contact halt), fatigue (3-of-7 + forced march),
// initiative, the recon results matrix + prisoners + interrogation, the
// slot-88 campaign cycle end-to-end (initiative/recon records, contact →
// battle, invasion → the immediate morale roll, occupation flip + ending),
// conquest (both modes), occupation economics (the monthly split + the
// occupier morale machinery), and the event/schema/registry locks.
// =============================================================================
'use strict';
const path = require('path');
const DIR = path.join(__dirname, '..');
global.window = global;
[
  'acks-engine-catalogs.js', 'acks-engine-monsters.js', 'acks-engine-encounter-tables.js', 'acks-engine-troops.js',
  'acks-engine.js', 'acks-engine-entities.js', 'acks-engine-economy.js',
  'acks-engine-entity-registry.js', 'acks-engine-field-schemas.js', 'acks-engine-events.js', 'acks-engine-battles.js', 'acks-engine-maneuvers.js', 'acks-engine-subsystems.js'
].forEach(f => require(path.join(DIR, f)));
const ACKS = global.ACKS;

let pass = 0, fail = 0;
function ok(label, cond, detail){ if(cond){ pass++; } else { fail++; console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('— ' + t); }
function d6v(r){ return (r - 0.5) / 6; }
function d3v(r){ return (r - 0.5) / 3; }
function d10v(r){ return (r - 0.5) / 10; }
function seq(values){ let i = 0; return () => values[Math.min(i++, values.length - 1)]; }

// ── fixture builders ─────────────────────────────────────────────────────────
function mkCampaign(){
  const c = ACKS.blankCampaign();
  c.currentTurn = 5; c.currentDayInMonth = 1;
  c.calendar = c.calendar || {}; c.calendar.day = 1;
  c.hexes = []; c.armies = []; c.units = []; c.characters = []; c.journeys = []; c.battles = []; c.domains = []; c.eventLog = [];
  c.houseRules = c.houseRules || {};
  return c;
}
function lineHexes(c, n, terrain){
  for(let q = 0; q < n; q++) c.hexes.push({ id: 'hx' + q, coord: { q, r: 0 }, terrain: terrain || 'grassland', domainId: null });
}
function mkLeader(c, id, name, opts){
  const ch = Object.assign({ id, name, level: 8, abilities: { STR: 10, INT: 16, WIL: 12, DEX: 10, CON: 10, CHA: 14 }, proficiencies: [], coins: { gp: 0 } }, opts || {});
  c.characters.push(ch);
  return ch;
}
function mkArmy(c, id, name, leaderId, hexId, unitSpecs){
  const a = ACKS.blankArmy({ id, name, leaderCharacterId: leaderId, currentHexId: hexId });
  c.armies.push(a);
  for(const us of (unitSpecs || [])){
    const u = ACKS.blankUnit(Object.assign({ race: 'man' }, us));
    c.units.push(u);
    ACKS.stationUnit(c, u, { kind: 'army', id: a.id });
  }
  return a;
}

// ─────────────────────────────────────────────────────────────────────────────
section('Catalogs — large armies, war machines, the army weather table (RR pp.448–449)');
ok('large-army rows: <16 ×1 / 16–26 ×2/3 / 27–32 ×1/2 / 33+ ×1/3',
  ACKS.armyLargeMultiplierRow(15).mult === 1 && ACKS.armyLargeMultiplierRow(16).mult === 2 / 3 &&
  ACKS.armyLargeMultiplierRow(27).mult === 1 / 2 && ACKS.armyLargeMultiplierRow(33).mult === 1 / 3);
ok('column miles 3/6/9/12', ACKS.armyLargeMultiplierRow(10).columnMiles === 3 && ACKS.armyLargeMultiplierRow(40).columnMiles === 12);
ok('war machines: assembled 6 mi/day, disassembled 12', ACKS.WAR_MACHINE_SPEED.assembled === 6 && ACKS.WAR_MACHINE_SPEED.disassembled === 12);
ok('army weather: rain/snow ×½ (the column suffers where the party shrugs)',
  ACKS.armyWeatherSpeedMult('rainy', 'moderate') === 0.5 && ACKS.armyWeatherSpeedMult('snowy', 'moderate') === 0.5);
ok('army weather: storm ×¼', ACKS.armyWeatherSpeedMult('stormy', 'moderate') === 0.25);
ok('army weather: frigid/sweltering ×½; cumulative rainy+frigid = ×¼ (the printed example)',
  ACKS.armyWeatherSpeedMult('fair', 'frigid') === 0.5 && ACKS.armyWeatherSpeedMult('rainy', 'frigid') === 0.25);
ok('rain/snow recon −2 missile −2; storm −4 missiles', ACKS.ARMY_WEATHER_EFFECTS.conditions.rainy.reconMod === -2 &&
  ACKS.ARMY_WEATHER_EFFECTS.conditions.rainy.missileMod === -2 && ACKS.ARMY_WEATHER_EFFECTS.conditions.stormy.missileMod === -4);

section('The Tarkaun worked example (RR p.448) — 40 brigades on a road');
{
  // 40 brigade-scale units: daily 12 (heavy infantry's 48 mi/week base = move 60' →
  // 12 mi/day) → road ×1.5 = 18 → ×1/3 = 6 mi/day; weekly 48 → 72 → 24.
  const c = mkCampaign();
  lineHexes(c, 2, 'grassland');
  mkLeader(c, 'chr-t', 'Audarius Tarkaun');
  const specs = [];
  for(let i = 0; i < 32; i++) specs.push({ unitTypeKey: 'heavy-infantry', count: 1920, scale: 'brigade' });
  for(let i = 0; i < 8; i++) specs.push({ unitTypeKey: 'heavy-cavalry', count: 960, scale: 'brigade' });
  const a = mkArmy(c, 'army-t', 'Host of Tarkaun', 'chr-t', 'hx0', specs);
  const prof = ACKS.armyMarchProfile(c, a);
  ok('brigade equivalents = 40', prof.brigadeEquivalents === 40, String(prof.brigadeEquivalents));
  ok('slowest unit = heavy infantry, 12 mi/day base', prof.baseMilesPerDay === 12, String(prof.baseMilesPerDay));
  ok('×1/3 large-army multiplier → 4 mi/day open ground', prof.milesPerDay === 4, String(prof.milesPerDay));
  // the printed daily figure: 12 → road 18 → size 6. The road multiplies per hex in
  // the walk (×1.5), so the engine expresses it as 4 mi/day × the road's 1.5 = 6.
  ok('… × the road 1.5 = the printed 6 mi/day', Math.round(prof.milesPerDay * 1.5) === 6);
  ok('… weekly = daily × 4 = the printed 24 mi/week', prof.milesPerDay * 1.5 * 4 === 24);
  ok('column 12 miles, reduced to the modified speed (p.448)', prof.columnMiles === Math.min(12, Math.max(1, prof.milesPerDay)), String(prof.columnMiles));
  // war machines cap
  a.warMachines = { count: 3, assembled: true };
  ok('hauling assembled war machines caps at 6 mi/day', ACKS.armyMarchProfile(c, a).warMachineCap === 6);
  a.warMachines = { count: 3, assembled: false };
  ok('disassembled cap 12 mi/day', ACKS.armyMarchProfile(c, a).warMachineCap === 12);
  a.warMachines = null;
}

section('Rest & fatigue (RR pp.448–449) — 3-of-7 + the forced-march rest day');
{
  const c = mkCampaign();
  mkLeader(c, 'chr-f', 'Fatigue Test');
  const a = mkArmy(c, 'army-f', 'Column', 'chr-f', null, [{ unitTypeKey: 'light-infantry', count: 120 }]);
  const base = 600;
  for(let d = 0; d < 4; d++) ACKS.recordArmyMarchDay(a, base + d, 'normal');
  ok('4 of 7 marched → not fatigued', ACKS.armyFatigued(c, a, base + 6).fatigued === false);
  ACKS.recordArmyMarchDay(a, base + 4, 'normal');
  ok('5 of 7 marched → FATIGUED (rest 3 in 7, RR p.448)', ACKS.armyFatigued(c, a, base + 6).fatigued === true);
  ok('… clears once the window drops back to ≤4', ACKS.armyFatigued(c, a, base + 9).fatigued === false);
  // forced march: rest the day after or fatigued until a rest day
  const b = mkArmy(c, 'army-g', 'Vanguard', 'chr-f', null, [{ unitTypeKey: 'light-infantry', count: 120 }]);
  ACKS.recordArmyMarchDay(b, base, 'forced-march');
  ACKS.recordArmyMarchDay(b, base + 1, 'normal');   // marched the day after — no rest
  ok('no rest after a forced march → fatigued (RR p.449)', ACKS.armyFatigued(c, b, base + 1).fatigued === true);
  ok('… stays fatigued until a rest day happens', ACKS.armyFatigued(c, b, base + 2).fatigued === true);
  ACKS.recordArmyMarchDay(b, base + 3, 'normal');   // base+2 was a rest day
  ok('… a rest day clears it', ACKS.armyFatigued(c, b, base + 3).fatigued === false);
  const r = mkArmy(c, 'army-r', 'Rested', 'chr-f', null, [{ unitTypeKey: 'light-infantry', count: 120 }]);
  ACKS.recordArmyMarchDay(r, base, 'forced-march');
  ok('rested the day after a forced march → fine', ACKS.armyFatigued(c, r, base + 2).fatigued === false);
}

section('Allegiance — realms, allies, permitted ground');
{
  const c = mkCampaign();
  const apex = mkLeader(c, 'chr-apex', 'The King');
  const vass = mkLeader(c, 'chr-vass', 'The Baron');
  const foe = mkLeader(c, 'chr-foe', 'The Invader');
  c.domains.push({ id: 'dom-k', name: 'Kingdom', rulerCharacterId: 'chr-apex', liegeId: null, demographics: { peasantFamilies: 100, urbanFamilies: 0, morale: 0 }, geography: { hexes: [] }, garrison: { units: [] }, income: {}, expenses: {}, treasury: { gp: 0 } });
  c.domains.push({ id: 'dom-b', name: 'Barony', rulerCharacterId: 'chr-vass', liegeId: 'dom-k', demographics: { peasantFamilies: 100, urbanFamilies: 0, morale: 0 }, geography: { hexes: [] }, garrison: { units: [] }, income: {}, expenses: {}, treasury: { gp: 0 } });
  ok('liege and vassal share a realm — not opposed', ACKS.leadersOpposed(c, 'chr-apex', 'chr-vass') === false);
  ok('a stranger is opposed', ACKS.leadersOpposed(c, 'chr-apex', 'chr-foe') === true);
  const a1 = mkArmy(c, 'army-1', 'Royal Host', 'chr-apex', null, []);
  const a2 = mkArmy(c, 'army-2', 'Free Company', 'chr-foe', null, []);
  ok('their armies are opposed', ACKS.armiesOpposed(c, a1, a2) === true);
  a1.alliedLeaderCharacterIds = ['chr-foe'];
  ok('a GM-marked ally is not opposed', ACKS.armiesOpposed(c, a1, a2) === false);
  a1.alliedLeaderCharacterIds = [];
  const domB = c.domains[1];
  ok('a realm-mate army is friendly ground', ACKS.domainFriendlyToArmy(c, domB, a1) === true);
  ok('a stranger army is not', ACKS.domainFriendlyToArmy(c, domB, a2) === false);
  a2.permittedDomainIds = ['dom-b'];
  ok('… unless the GM marked permission', ACKS.domainFriendlyToArmy(c, domB, a2) === true);
}

section('Reconnaissance catalogs (RR pp.452–455)');
ok('range by opposing size: ≤120 → 1×24mi … 3001+ → 4', ACKS.reconRange24(120) === 1 && ACKS.reconRange24(600) === 2 && ACKS.reconRange24(3000) === 3 && ACKS.reconRange24(3001) === 4);
ok('size mods −2 … +3', ACKS.reconSizeMod(600) === -2 && ACKS.reconSizeMod(3000) === -1 && ACKS.reconSizeMod(12000) === 0 && ACKS.reconSizeMod(36000) === 1 && ACKS.reconSizeMod(72000) === 2 && ACKS.reconSizeMod(72001) === 3);
ok('proximity: same hex +2, adjacent +1, same 24mi 0, −1/24mi after', ACKS.reconProximityMod(0) === 2 && ACKS.reconProximityMod(1) === 1 && ACKS.reconProximityMod(4) === 0 && ACKS.reconProximityMod(8) === -1 && ACKS.reconProximityMod(12) === -2);
ok('terrain: open +1 / concealing −1 / else 0', ACKS.reconTerrainMod('grassland') === 1 && ACKS.reconTerrainMod('hills-rocky') === -1 && ACKS.reconTerrainMod('jungle') === 0 && ACKS.reconTerrainMod('forest-taiga') === -1);
ok('scouting brackets: 6–20 +1 / 21–100 +2 / 101+ +3', ACKS.reconScoutingMod(5) === 0 && ACKS.reconScoutingMod(6) === 1 && ACKS.reconScoutingMod(21) === 2 && ACKS.reconScoutingMod(101) === 3);
ok('result bands shared with W2 (RR p.452)', ACKS.reconRollBand(2).key === 'catastrophe' && ACKS.reconRollBand(5).key === 'failure' && ACKS.reconRollBand(8).key === 'marginal' && ACKS.reconRollBand(11).key === 'success' && ACKS.reconRollBand(12).key === 'major');
{
  const r6 = ACKS.reconResultsFor(0, 'major');
  ok('same-6 major: location 6-mi + strengths + a very valuable prisoner', r6.location === '6-mile hex' && r6.reveals.indexOf('unit-strengths') >= 0 && r6.prisoner === 'very-valuable');
  const r24 = ACKS.reconResultsFor(3, 'success');
  ok('same-24 success: 6-mi location + units/division + a common prisoner', r24.location === '6-mile hex' && r24.reveals.indexOf('units-per-division') >= 0 && r24.prisoner === 'common');
  const far = ACKS.reconResultsFor(12, 'marginal');
  ok('far marginal: a 4×24-mi swath + size only, no prisoner', /within 4/.test(far.location) && far.reveals.length === 1 && far.prisoner === null);
}
ok('prisoner info: 8 topics × 3 grades', ACKS.PRISONER_INFORMATION.length === 8 && /leader/.test(ACKS.prisonerInformationText(1, 'common')));
ok('interrogation bands: 2− false / 3–5 nothing / 6–8 one / 9–11 two / 12+ all', ACKS.interrogationBand(2).key === 'false' && ACKS.interrogationBand(5).key === 'nothing' && ACKS.interrogationBand(8).pieces === 1 && ACKS.interrogationBand(11).pieces === 2 && ACKS.interrogationBand(13).key === 'all');

section('The elven/goblin reconnaissance example (RR p.453) — modifier composition');
{
  // Elves (1,200 troops, 3 cavalry/flyer companies, SA +2, familiar, woods) observe
  // goblins (4,320 troops, 16 wolf-rider companies, SA −1, unfamiliar). The printed
  // composition: −1 screen (6–20), −1 fewer cavalry, +1 SA, +1 familiar, +2 aerial,
  // −1 their-woods = +1. The engine derives every row it has state for; the aerial
  // +2 is the GM's standing reconModifier (no flying units yet 🔧).
  const c = mkCampaign();
  // The goblins stand in the elves' own woods (forest-taiga); the elven army watches
  // from 3 hexes off — the same 24-mile hex (proximity 0), as the printed example.
  c.hexes.push({ id: 'hx-w', coord: { q: 0, r: 0 }, terrain: 'forest', terrainSubtype: 'taiga', domainId: 'dom-e' });
  c.hexes.push({ id: 'hx-e', coord: { q: 3, r: 0 }, terrain: 'forest', terrainSubtype: 'taiga', domainId: 'dom-e' });
  c.domains.push({ id: 'dom-e', name: 'Elfhome', rulerCharacterId: 'chr-e', liegeId: null, demographics: { peasantFamilies: 50, urbanFamilies: 0, morale: 0 }, geography: { hexes: [] }, garrison: { units: [] }, income: {}, expenses: {}, treasury: { gp: 0 } });
  const elf = mkLeader(c, 'chr-e', 'Elf General', { abilities: { STR: 10, INT: 18, WIL: 14, DEX: 10, CON: 10, CHA: 10 }, proficiencies: [{ name: 'Military Strategy' }] });
  const gob = mkLeader(c, 'chr-g', 'Goblin King', { abilities: { STR: 10, INT: 9, WIL: 8, DEX: 10, CON: 10, CHA: 10 } });
  const elves = mkArmy(c, 'army-e', 'Elven Host', 'chr-e', 'hx-e', [
    { unitTypeKey: 'horse-archers', count: 120 }, { unitTypeKey: 'horse-archers', count: 120 },
    { unitTypeKey: 'longbowmen', count: 960, scale: 'battalion' }
  ]);
  const goblins = mkArmy(c, 'army-g', 'Goblin Horde', 'chr-g', 'hx-w', [
    { unitTypeKey: 'beast-riders', race: 'goblin', count: 240, scale: 'battalion' },
    { unitTypeKey: 'beast-riders', race: 'goblin', count: 240, scale: 'battalion' },
    { unitTypeKey: 'beast-riders', race: 'goblin', count: 240, scale: 'battalion' },
    { unitTypeKey: 'beast-riders', race: 'goblin', count: 240, scale: 'battalion' },
    { unitTypeKey: 'light-infantry', race: 'goblin', count: 480, scale: 'battalion' },
    { unitTypeKey: 'light-infantry', race: 'goblin', count: 480, scale: 'battalion' },
    { unitTypeKey: 'light-infantry', race: 'goblin', count: 480, scale: 'battalion' },
    { unitTypeKey: 'light-infantry', race: 'goblin', count: 480, scale: 'battalion' },
    { unitTypeKey: 'slingers', race: 'goblin', count: 480, scale: 'battalion' }
  ]);
  elves.reconModifier = 2;   // observing from the air (giant hawks) — GM-asserted 🔧
  ok('goblin horde ≈ 4,320 troops (the printed example)', ACKS.armyTroopCount(c, goblins) >= 3001 && ACKS.armyTroopCount(c, goblins) <= 12000, String(ACKS.armyTroopCount(c, goblins)));
  ok('goblin cavalry = 16 company equivalents (4 wolf-rider battalions)', ACKS.armyCavalryCompanyEquivalents(c, goblins) === 16, String(ACKS.armyCavalryCompanyEquivalents(c, goblins)));
  const rr = ACKS.armyReconRoll(c, elves, goblins, { rng: seq([d6v(4), d6v(4)]) });
  const modOf = label => { const m = rr.mods.find(x => x.label.indexOf(label) >= 0); return m ? m.value : 0; };
  ok('size row 0 (3,001–12,000)', modOf('opposing army of') === 0);
  ok('higher strategic ability +1', modOf('higher strategic ability') === 1);
  ok('screened by 16 cavalry companies −1', modOf('screened by') === -1);
  ok('fewer cavalry overall −1', modOf('fewer cavalry') === -1);
  ok('their woods conceal −1 (forest-taiga)', modOf('their terrain') === -1);
  ok('more familiar with the region +1 (their realm’s ground)', modOf('more familiar') === 1);
  ok('the GM aerial bonus +2 rides reconModifier', modOf('magic / spies / stratagems') === 2);
  ok('2d6=8 + net +1 = 9 → success (the printed elven roll)', rr.roll === 8 && rr.total === 9 && rr.result === 'success', rr.roll + '→' + rr.total + ' ' + rr.result);
}

section('Intel reports + prisoners + interrogation (RR pp.455–457)');
{
  const c = mkCampaign();
  lineHexes(c, 2, 'grassland');
  mkLeader(c, 'chr-a', 'Observer');
  mkLeader(c, 'chr-b', 'Observed');
  const a = mkArmy(c, 'army-a', 'Eyes', 'chr-a', 'hx0', [{ unitTypeKey: 'light-cavalry', count: 60 }]);
  const b = mkArmy(c, 'army-b', 'Quarry', 'chr-b', 'hx0', [{ unitTypeKey: 'heavy-infantry', count: 120 }, { unitTypeKey: 'bowmen', count: 120 }]);
  b.divisions = [{ name: '1st', commanderCharacterId: 'chr-b', unitIds: ACKS.armyUnits(c, b).map(u => u.id), role: 'main' }];
  // same hex + major success → everything incl. a very valuable prisoner
  const recon = { roll: 12, total: 14, mods: [], result: 'major', resultLabel: 'Major success', hexDistance: 0 };
  const rep = ACKS.buildIntelReport(c, a, b, recon, { rng: seq([d3v(2), (1 - 0.5) / 8, (1 - 0.5) / 8]) });
  ok('report reveals the 6-mile hex', rep.revealed.locationPrecision === '6-mile hex' && rep.revealed.locationHexId === 'hx0');
  ok('size band + divisions + unit types + strengths', rep.revealed.sizeBand != null && rep.revealed.divisions === 1 && rep.revealed.unitTypes.length === 2 && rep.revealed.unitStrengths.length === 2);
  ok('a very valuable prisoner with 2 pieces', rep.prisoner && rep.prisoner.grade === 'very-valuable' && rep.prisoner.pieces.length === 2);
  ok('a repeated topic shifts a grade right — already at the top stays', rep.prisoner.pieces[0].d8 === 1 && rep.prisoner.pieces[1].d8 === 1 && rep.prisoner.pieces[1].grade === 'very-valuable');
  a.intelReports = [rep];
  ok('latestIntelOn finds it', ACKS.latestIntelOn(c, a, 'army-b') === rep);
  // interrogation: 2d6=8 + CHA(14→+1) + GM +3 = 12 → all known information
  const out = ACKS.interrogatePrisoner(c, { armyId: 'army-a', reportIndex: 0, interrogatorCharacterId: 'chr-a', gmMod: 3, rng: seq([d6v(4), d6v(4)]) });
  ok('interrogation 8 + CHA + bribe = all known', out.ok && out.result === 'all' && out.revealedPieces.length === 2, JSON.stringify({ r: out.result, n: out.revealedPieces.length }));
  ok('revealed pieces are remembered on the report', rep.prisoner.revealedPieceIdxs.length === 2 && rep.interrogations.length === 1);
  const again = ACKS.interrogatePrisoner(c, { armyId: 'army-a', reportIndex: 0, interrogatorCharacterId: 'chr-a', gmMod: 3, rng: seq([d6v(4), d6v(4)]) });
  ok('nothing left to reveal on a second pass', again.ok && again.revealedPieces.length === 0);
  // catastrophe → false intel flagged for the Judge, presented as marginal
  const cat = ACKS.buildIntelReport(c, a, b, { roll: 3, total: 2, mods: [], result: 'catastrophe', resultLabel: 'Catastrophe', hexDistance: 0 }, { rng: seq([d3v(1), (5 - 0.5) / 8]) });
  ok('catastrophe stores FALSE intel (marginal-shaped, GM-flagged)', cat.falseIntel === true && cat.revealed != null);
}
ok('contact awareness: both located → mutual; one → unilateral; neither/catastrophe → unaware',
  ACKS.contactAwareness({ result: 'success' }, { result: 'marginal' }) === 'mutual' &&
  ACKS.contactAwareness({ result: 'success' }, { result: 'failure' }) === 'unilateral-a' &&
  ACKS.contactAwareness({ result: 'catastrophe' }, { result: 'failure' }) === 'mutual-unawareness');

section('Initiative (RR p.447) — 1d6 + SA, +2 forced march declared before');
{
  const c = mkCampaign();
  lineHexes(c, 3, 'grassland');
  mkLeader(c, 'chr-i', 'Init Leader', { abilities: { STR: 10, INT: 18, WIL: 16, DEX: 10, CON: 10, CHA: 10 }, proficiencies: [{ name: 'Military Strategy' }, { name: 'Military Strategy' }] });
  const a = mkArmy(c, 'army-i', 'Column', 'chr-i', 'hx0', [{ unitTypeKey: 'light-infantry', count: 120 }]);
  const r1 = ACKS.rollArmyInitiative(c, a, { rng: seq([d6v(4)]) });
  ok('1d6 + SA', r1.roll === 4 && r1.sa > 0 && r1.total === 4 + r1.sa && r1.forcedBonus === 0);
  const m = ACKS.startArmyMarch(c, a.id, { destinationHexId: 'hx2', pace: 'forced-march' });
  ok('march started at forced-march pace', m.ok === true);
  const r2 = ACKS.rollArmyInitiative(c, a, { rng: seq([d6v(4)]) });
  ok('forced march declared before the roll → +2', r2.forcedBonus === 2 && r2.total === r1.total + 2);
}

section('Army marches on the journey engine — speed, weather, no party machinery');
{
  const c = mkCampaign();
  lineHexes(c, 8, 'forest');   // forest ×2/3: a 12 mi/day army pays 9 mi per hex
  mkLeader(c, 'chr-m', 'Marcher');
  const a = mkArmy(c, 'army-m', 'Foot Column', 'chr-m', 'hx0', [{ unitTypeKey: 'heavy-infantry', count: 120 }]);
  const res = ACKS.startArmyMarch(c, a.id, { destinationHexId: 'hx7' });
  ok('startArmyMarch builds an in-transit journey owned by the army', res.ok && res.journey.armyId === 'army-m' && res.journey.status === 'in-transit' && a.journeyId === res.journey.id);
  ok('the journey base speed IS the army speed', ACKS.journeyBaseSpeedMilesPerDay(c, res.journey) === 12);
  ok('army journeys carry no character participants', (res.journey.participantCharacterIds || []).length === 0);
  // guards
  ok('a second march refuses (already-marching)', ACKS.startArmyMarch(c, a.id, { destinationHexId: 'hx3' }).reason === 'already-marching');
  const empty = mkArmy(c, 'army-e0', 'Empty', 'chr-m', 'hx0', []);
  ok('an army with no troops refuses (no-units)', ACKS.startArmyMarch(c, empty.id, { destinationHexId: 'hx3' }).reason === 'no-units');
  // one ticked day: forest costs 9 mi/hex → 1 hex on a 12-mile day (first-hex floor + can't afford the 2nd)
  const out = ACKS.tickJourneyDay(c, res.journey, { rng: () => 0.5 });
  ok('no navigation throw for an army (mapped regions, scouting screens)', out.record.dayRecord.navigationThrow === null);
  ok('no per-hex encounter draws', (out.record.encounterProposals || []).length === 0 && out.record.dayRecord.encounters.length === 0);
  ok('no survival resolution (army supply is W5)', out.record.survival === null);
  ok('the day record carries the armyId', out.record.dayRecord.armyId === 'army-m');
  ACKS.commitJourneyRecord(c, out.record);
  ok('the army position mirrors the march', a.currentHexId === res.journey.currentHexId);
  ok('the marched-day window stamped', (a.marchedOrds || []).length === 1);
  // weather: an army in rain marches at half speed (the party would not)
  const out2 = ACKS.tickJourneyDay(c, res.journey, { rng: () => 0.5, weather: { condition: 'rainy', temperature: 'moderate', rolledOrSet: 'gm-fiat' } });
  ok('rain halves the army day (6 mi budget → forest still 1 hex via the first-hex floor)', out2.record.dayRecord.hexesTraveled === 1);
  // arrival releases the march link
  let guard = 0;
  while(a.journeyId && guard++ < 20){
    const t = ACKS.tickJourneyDay(c, ACKS.findJourney(c, a.journeyId), { rng: () => 0.5 });
    ACKS.commitJourneyRecord(c, t.record);
  }
  ok('arrival clears army.journeyId + the army stands at the destination', a.journeyId === null && a.currentHexId === 'hx7');
}

section('An army holds at an unbridged river (no swimming a column) 🔧');
{
  const c = mkCampaign();
  c.hexes.push({ id: 'hxa', coord: { q: 0, r: 0 }, terrain: 'grassland', domainId: null });
  c.hexes.push({ id: 'hxb', coord: { q: 1, r: 0 }, terrain: 'grassland', domainId: null, riverSides: [3] });   // river on the west face of hxb
  mkLeader(c, 'chr-r', 'River Marcher');
  const a = mkArmy(c, 'army-r2', 'Column', 'chr-r', 'hxa', [{ unitTypeKey: 'light-infantry', count: 120 }]);
  const res = ACKS.startArmyMarch(c, a.id, { destinationHexId: 'hxb' });
  const out = ACKS.tickJourneyDay(c, res.journey, { rng: () => 0.99 });   // a party would FAIL the swim too, but armies never roll
  const f = out.record.dayRecord.fording;
  ok('held at the near bank — crossingType army-held, no throw rolled', f && f.result === 'failed' && f.crossingType === 'army-held' && f.rolled === null);
  ok('a fording pause rides the notables', out.notableEvents.some(e => e.pauseTrigger === 'fording'));
  ok('no movement past the bank', out.record.dayRecord.hexesTraveled === 0);
}

section('The slot-88 campaign cycle — initiative/recon records, contact → battle');
{
  const c = mkCampaign();
  lineHexes(c, 6, 'grassland');
  mkLeader(c, 'chr-a', 'Marcus');
  mkLeader(c, 'chr-b', 'Moruvai', { abilities: { STR: 10, INT: 10, WIL: 10, DEX: 10, CON: 10, CHA: 10 } });
  const a = mkArmy(c, 'army-a', 'Host of Marcus', 'chr-a', 'hx0', [{ unitTypeKey: 'heavy-infantry', count: 120 }]);
  const b = mkArmy(c, 'army-b', 'Horde of Moruvai', 'chr-b', 'hx3', [{ unitTypeKey: 'light-infantry', count: 120 }]);
  a.strategicStance = 'offensive';
  ACKS.startArmyMarch(c, a.id, { destinationHexId: 'hx5' });
  // day 1: A marches 2 hexes (12 mi), recon both ways, no contact yet
  const t1 = ACKS.proposeDayTick(c, 1, { rng: () => 0.5 });
  const dayRecs = t1.pendingRecords.filter(r => r.consumer === 'military' && r.kind === 'army-day');
  ok('day 1: an army-day record per army in range', dayRecs.length === 2);
  ok('… initiative itemized (1d6 + SA + forced bonus)', dayRecs.every(r => r.initiative && typeof r.initiative.total === 'number'));
  ok('… recon rolls itemized per opposing army', dayRecs.every(r => r.recons.length === 1 && r.recons[0].recon.mods != null));
  ok('day 1: no contact yet', !t1.pendingRecords.some(r => r.kind === 'army-contact'));
  ACKS.commitDayTick(c, t1);
  ok('commit stamps lastInitiative + stores the intel reports', a.lastInitiative != null && (a.intelReports || []).length === 1 && (b.intelReports || []).length === 1);
  ok('routine recon emits NO events (state, not chronicle)', !(c.eventLog || []).some(e => e.event.kind === 'army-recon'));
  // day 2: A marches into B's hex → contact halts the walk → battle proposal + pause
  const t2 = ACKS.proposeDayTick(c, 1, { rng: () => 0.5 });
  const contact = t2.pendingRecords.find(r => r.kind === 'army-contact');
  ok('day 2: the march halts on the opposing army → a contact record', !!contact);
  ok('… the tick PAUSES for the GM (auto-pause-on-encounter)', t2.paused === true);
  ok('… both contact recon rolls ride the record', contact.reconActing && contact.reconOther && contact.awareness != null);
  ok('… offensive vs defensive at mutual awareness → Pitched Battle', contact.situation === 'pitched-battle' && contact.battle === true);
  ok('… the battle id is pre-minted', /^btl-/.test(contact.battleProposalId));
  const beforeBattles = (c.battles || []).length;
  ACKS.commitDayTick(c, t2);
  ok('commit creates the Battle in setup at the contact hex', (c.battles || []).length === beforeBattles + 1 && c.battles[c.battles.length - 1].status === 'setup' && c.battles[c.battles.length - 1].hexId === 'hx3');
  ok('… under the pre-minted id', c.battles[c.battles.length - 1].id === contact.battleProposalId);
  ok('… the army-contact event narrates with both armies in the envelope',
    (c.eventLog || []).some(e => e.event.kind === 'army-contact' && (e.event.context.relatedEntities || []).filter(x => x.kind === 'army').length === 2));
  ok('the army stands at the contact hex (the march halted)', a.currentHexId === 'hx3');
  // day 3: the standing co-location does NOT re-propose (fresh contact only)
  const t3 = ACKS.proposeDayTick(c, 1, { rng: () => 0.5 });
  ok('day 3: no duplicate contact while the battle stands', !t3.pendingRecords.some(r => r.kind === 'army-contact'));
}

section('Invasion (RR p.458) — the immediate domain morale roll, once per army-domain');
{
  const c = mkCampaign();
  lineHexes(c, 3, 'grassland');
  c.hexes.push({ id: 'hx-d1', coord: { q: 3, r: 0 }, terrain: 'grassland', domainId: 'dom-v' });
  c.hexes.push({ id: 'hx-d2', coord: { q: 4, r: 0 }, terrain: 'grassland', domainId: 'dom-v' });
  mkLeader(c, 'chr-inv', 'Invader');
  mkLeader(c, 'chr-own', 'Owner');
  c.domains.push({ id: 'dom-v', name: 'Victim March', rulerCharacterId: 'chr-own', liegeId: null, classification: 'Civilized',
    demographics: { peasantFamilies: 500, urbanFamilies: 0, morale: 1 }, geography: { hexes: [] },
    garrison: { units: [] }, income: {}, expenses: { tithePaid: true }, treasury: { gp: 0 }, stronghold: { components: [] } });
  const a = mkArmy(c, 'army-inv', 'Invasion Force', 'chr-inv', 'hx0', [{ unitTypeKey: 'light-cavalry', count: 60 }]);
  ACKS.startArmyMarch(c, a.id, { destinationHexId: 'hx-d2' });
  const t1 = ACKS.proposeDayTick(c, 1, { rng: () => 0.5 });
  // light cavalry = 48 mi/day → reaches hx-d2 day 1, crossing into dom-v at hx-d1
  const inv = t1.pendingRecords.find(r => r.kind === 'domain-invasion');
  ok('crossing into the unfriendly domain proposes the invasion', !!inv && inv.domainId === 'dom-v');
  ok('… the immediate morale roll rides the record, itemized', inv.morale && typeof inv.morale.roll === 'number' && Array.isArray(inv.morale.mods));
  ok('… the tick pauses', t1.paused === true);
  ACKS.commitDayTick(c, t1);
  const domV = c.domains.find(d => d.id === 'dom-v');
  ok('commit applies the morale result', domV.demographics.morale === inv.morale.after);
  ok('… stamps the once-per-domain invasion', (a.invasions || {})['dom-v'] != null);
  ok('… emits domain-warfare action=invaded', (c.eventLog || []).some(e => e.event.kind === 'domain-warfare' && e.event.payload.action === 'invaded'));
  // marching on inside the same domain re-rolls nothing
  const t2 = ACKS.proposeDayTick(c, 1, { rng: () => 0.5 });
  ok('no second invasion record for the same domain', !t2.pendingRecords.some(r => r.kind === 'domain-invasion'));
}

section('The Marcus/Sarotem occupation example (RR p.458) — 9.6gp > 2gp');
{
  const c = mkCampaign();
  c.hexes.push({ id: 'hx-s', coord: { q: 0, r: 0 }, terrain: 'grassland', domainId: 'dom-s' });
  mkLeader(c, 'chr-m', 'Marcus');
  mkLeader(c, 'chr-s', 'Lord of Sarotem');
  c.domains.push({ id: 'dom-s', name: 'Sarotem', rulerCharacterId: 'chr-s', liegeId: null, classification: 'Civilized',
    demographics: { peasantFamilies: 500, urbanFamilies: 0, morale: 2 }, geography: { hexes: [] },
    garrison: { units: [{ id: 'g1', displayName: 'Town Watch', count: 200, monthlyWage: 6 }] },
    income: {}, expenses: { tithePaid: true }, treasury: { gp: 0 }, stronghold: { components: [] } });
  const a = mkArmy(c, 'army-occ', 'Host of Marcus', 'chr-m', 'hx-s', [{ unitTypeKey: 'heavy-cavalry', count: 100 }]);
  const st = ACKS.domainOccupationStatus(c, c.domains[0]);
  ok('100 heavy cavalry = 6,000gp/month wages', st.occupyingWages === 6000, String(st.occupyingWages));
  ok('200 light infantry garrison = 1,200gp/month', st.defendingWages === 1200, String(st.defendingWages));
  ok('(6,000 − 1,200) / 500 = 9.6gp per family', st.netPerFamily === 9.6, String(st.netPerFamily));
  ok('9.6 > the 2gp civilized garrison cost → OCCUPIED (the printed verdict)', st.threshold === 2 && st.occupied === true);
  // the daily flip via the consumer
  const t = ACKS.proposeDayTick(c, 1, { rng: () => 0.5 });
  const occ = t.pendingRecords.find(r => r.kind === 'domain-occupation');
  ok('the consumer proposes the occupation flip', !!occ && occ.occupierLeaderId === 'chr-m');
  ACKS.commitDayTick(c, t);
  const dom = c.domains[0];
  ok('commit stamps occupiedBy with the prior morale', dom.occupiedBy && dom.occupiedBy.leaderCharacterId === 'chr-m' && dom.occupiedBy.priorMorale === 2);
  ok('the occupier penalty = −max(1, prior morale) = −2 (RR p.458)', dom.occupiedBy.moralePenalty === -2);
  ok('moraleModifiersFor carries the occupation row', ACKS.moraleModifiersFor(c, dom).some(m => /occupation/i.test(m.label) && m.value === -2));
  ok('domain-warfare action=occupied emitted', (c.eventLog || []).some(e => e.event.kind === 'domain-warfare' && e.event.payload.action === 'occupied'));
  // a hated prior ruler still costs −1 (min penalty)
  const r = ACKS.occupyDomain(c, 'dom-s', {});
  ok('a second occupy refuses (already-occupied)', r.reason === 'already-occupied');
  // the occupier leaves → the occupation breaks
  a.currentHexId = null;
  const t2 = ACKS.proposeDayTick(c, 1, { rng: () => 0.5 });
  const end = t2.pendingRecords.find(r2 => r2.kind === 'occupation-end');
  ok('the occupier gone → an occupation-end record', !!end);
  ACKS.commitDayTick(c, t2);
  ok('the owner resumes at his prior morale (RR p.458)', dom.occupiedBy === null && dom.demographics.morale === 2);
  ok('… with the −1/month one-shot pending', dom.postOccupationPenaltyMonths === 1 &&
    ACKS.moraleModifiersFor(c, dom).some(m => /Recovering from/.test(m.label) && m.value === -1));
}

section('Occupation economics — the monthly split + the occupier morale machinery');
{
  const c = mkCampaign();
  c.hexes.push({ id: 'hx-o', coord: { q: 0, r: 0 }, terrain: 'grassland', domainId: 'dom-o' });
  mkLeader(c, 'chr-occ', 'Occupier', { payKeepFromTreasury: false });
  mkLeader(c, 'chr-prior', 'Deposed Lord');
  const dom = { id: 'dom-o', name: 'Held March', rulerCharacterId: 'chr-prior', liegeId: null, classification: 'Civilized',
    demographics: { peasantFamilies: 400, urbanFamilies: 100, morale: 0 }, geography: { hexes: [] },
    garrison: { units: [] }, income: { landRevenuePerFamily: 6, serviceRevenuePerFamily: 4, taxPerFamily: 2 },
    expenses: { tithePaid: true }, treasury: { gp: 1000 }, stronghold: { components: [] }, history: [] };
  c.domains.push(dom);
  const share = ACKS.peasantIncomeShare(c, dom);
  ok('peasant income share ∈ (0,1) — land is peasant-only, service/tax prorated', share > 0.5 && share < 1, String(share));
  ACKS.occupyDomain(c, 'dom-o', { leaderCharacterId: 'chr-occ' });
  ok('occupierRulerSummary reads the occupier', ACKS.occupierRulerSummary(c, dom).name === 'Occupier' && ACKS.occupierRulerSummary(c, dom).occupier === true);
  // a monthly turn: the occupier takes the peasant share of the net, the owner keeps the rest
  const occ = c.characters.find(x => x.id === 'chr-occ');
  const purseBefore = occ.coins.gp || 0;
  const treasuryBefore = dom.treasury.gp;
  const shareBefore = ACKS.peasantIncomeShare(c, dom);   // commit splits with PRE-mutation population
  const proposal = ACKS.proposeMonthlyTurn(c, {});
  const p = proposal.turnProposal.find(x => x.domainId === 'dom-o');
  ok('the monthly proposal runs under the occupier’s authority', p && p.ruler && p.ruler.name === 'Occupier');
  ok('… with the occupation penalty row in its morale mods', p.moraleMods.some(m => /occupation/i.test(m.label)));
  ACKS.commitTurn(c, proposal, {});
  const gained = (occ.coins.gp || 0) - purseBefore;
  const net = (function(){ const gross = ACKS.incomeSum(p); const adj = Math.round(gross * p.incomeFactor); return adj - ACKS.expenseSum(p); })();
  ok('the occupier received the peasant share of the net (to his purse)', net > 0 && gained === Math.round(net * shareBefore), gained + ' of ' + net);
  ok('the owner’s treasury got the remainder', dom.treasury.gp === treasuryBefore + (net - gained), String(dom.treasury.gp));
}

section('Conquest (RR p.458) — both dispositions; defenders block it');
{
  const c = mkCampaign();
  c.hexes.push({ id: 'hx-c', coord: { q: 0, r: 0 }, terrain: 'grassland', domainId: 'dom-c' });
  mkLeader(c, 'chr-conq', 'Conqueror');
  mkLeader(c, 'chr-old', 'Old Ruler');
  mkLeader(c, 'chr-new', 'New Vassal');
  // the conqueror's own seat (the suzerain domain for grant-to-vassal)
  c.domains.push({ id: 'dom-seat', name: 'Conqueror’s Seat', rulerCharacterId: 'chr-conq', liegeId: null, classification: 'Civilized',
    demographics: { peasantFamilies: 300, urbanFamilies: 0, morale: 0 }, geography: { hexes: [] }, garrison: { units: [] },
    income: {}, expenses: {}, treasury: { gp: 0 }, stronghold: { components: [] }, history: [] });
  const dom = { id: 'dom-c', name: 'Conquered March', rulerCharacterId: 'chr-old', liegeId: null, classification: 'Civilized',
    demographics: { peasantFamilies: 200, urbanFamilies: 0, morale: 0 }, geography: { hexes: [] },
    garrison: { units: [] }, income: {}, expenses: {}, treasury: { gp: 0 }, stronghold: { components: [] }, history: [] };
  c.domains.push(dom);
  ok('an unoccupied domain refuses conquest', ACKS.conquerDomain(c, 'dom-c', { leaderCharacterId: 'chr-conq' }).reason === 'not-occupied');
  ACKS.occupyDomain(c, 'dom-c', { leaderCharacterId: 'chr-conq' });
  // a live defending garrison unit blocks it (the stronghold holds — sieges are W6)
  const g = ACKS.blankUnit({ unitTypeKey: 'light-infantry', count: 60 });
  c.units.push(g);
  ACKS.stationUnit(c, g, { kind: 'domain-garrison', id: 'dom-c' });
  ok('defenders hold the strongholds → blocked', ACKS.conquerDomain(c, 'dom-c', { leaderCharacterId: 'chr-conq' }).reason === 'defenders-hold-strongholds');
  g.casualties = g.count;   // the garrison falls (a W3 battle's aftermath would do this)
  const r = ACKS.conquerDomain(c, 'dom-c', { leaderCharacterId: 'chr-conq', mode: 'rule-directly' });
  ok('rule-directly: the conqueror replaces the ruler', r.ok && dom.rulerCharacterId === 'chr-conq' && dom.occupiedBy === null);
  ok('… domain-warfare action=conquered emitted', (c.eventLog || []).some(e => e.event.kind === 'domain-warfare' && e.event.payload.action === 'conquered'));
  // grant-to-vassal on a second conquest
  const dom2 = { id: 'dom-c2', name: 'Second March', rulerCharacterId: 'chr-old', liegeId: null, classification: 'Civilized',
    demographics: { peasantFamilies: 200, urbanFamilies: 0, morale: 0 }, geography: { hexes: [] },
    garrison: { units: [] }, income: {}, expenses: {}, treasury: { gp: 0 }, stronghold: { components: [] }, history: [] };
  c.domains.push(dom2);
  c.hexes.push({ id: 'hx-c2', coord: { q: 1, r: 0 }, terrain: 'grassland', domainId: 'dom-c2' });
  ACKS.occupyDomain(c, 'dom-c2', { leaderCharacterId: 'chr-conq' });
  const r2 = ACKS.conquerDomain(c, 'dom-c2', { leaderCharacterId: 'chr-conq', mode: 'grant-to-vassal', newRulerCharacterId: 'chr-new' });
  ok('grant-to-vassal: the new ruler installed under the conqueror', r2.ok && dom2.rulerCharacterId === 'chr-new' && dom2.liegeId === 'dom-seat');
  ok('… a vassalage relation created', (c.vassalages || []).some(v => v && v.vassalDomainId === 'dom-c2' && v.suzerainCharacterId === 'chr-conq' && !v.endedAtTurn));
}

section('The Sarotem pillage example (RR p.458) — one roll × families');
{
  const c = mkCampaign();
  mkLeader(c, 'chr-p', 'Pillager');
  const dom = { id: 'dom-p', name: 'Sarotem', rulerCharacterId: 'chr-p', liegeId: null, classification: 'Civilized',
    demographics: { peasantFamilies: 500, urbanFamilies: 0, morale: 0 }, geography: { hexes: [] },
    garrison: { units: [] }, income: {}, expenses: {}, treasury: { gp: 0 },
    stronghold: { components: [{ name: 'Keep', buildValue: 10000 }] }, history: [] };
  c.domains.push(dom);
  // 3d6 = 13 (5,4,4) → 6,500gp; 1d10 = 5 → 12,500gp supplies; 1d10 = 4 → 200 prisoners; 1d10 = 4 → 200 families lost
  const rng = seq([d6v(5), d6v(4), d6v(4), d10v(5), d10v(4), d10v(4)]);
  const res = ACKS.rollPillageResults(c, dom, { rng });
  ok('3d6=13 → 13gp × 500 = 6,500gp plundered (the printed example)', res.gold === 6500, String(res.gold));
  ok('1d10=5 → 5×5×500 = 12,500gp of supplies', res.supplies === 12500, String(res.supplies));
  ok('1d10=4 → 4 × 500/10 = 200 prisoners', res.prisoners === 200, String(res.prisoners));
  ok('1d10=4 → 200 families lost', res.familiesLost === 200, String(res.familiesLost));
  // the 600-orc proportional pillage (RR p.459): 2,000 families want 2,400 troops; 600/2,400 = 25%
  const dom2 = { id: 'dom-p2', name: 'Orc Find', rulerCharacterId: 'chr-p', liegeId: null, classification: 'Civilized',
    demographics: { peasantFamilies: 2000, urbanFamilies: 0, morale: 0 }, geography: { hexes: [] },
    garrison: { units: [] }, income: {}, expenses: {}, treasury: { gp: 0 }, stronghold: { components: [] }, history: [] };
  c.domains.push(dom2);
  const req = ACKS.pillageRequirementRow(2000);
  ok('2,000 families → 2,400 troops, 1d3 days', req.troops === 2400 && req.timeLabel === '1d3 days');
  // 3d6=10 → 20,000gp; supplies 1d10=5 → 50,000; prisoners 1d10=4 → 800 — ×25% = 5,000 / 12,500 / 200 (the printed orc haul)
  const rng2 = seq([d6v(4), d6v(3), d6v(3), d10v(5), d10v(4), d10v(4)]);
  const res2 = ACKS.rollPillageResults(c, dom2, { rng: rng2, proportionUnits: 600 / 2400 });
  ok('the 600 orcs take 25%: 5,000gp', res2.gold === 5000, String(res2.gold));
  ok('… 12,500gp supplies', res2.supplies === 12500, String(res2.supplies));
  ok('… 200 prisoners ("about 40gp each — the orcs feel rich!")', res2.prisoners === 200, String(res2.prisoners));
  ok('… but the families lost stay full (the wreckage is not discounted)', res2.familiesLost === 800, String(res2.familiesLost));
}

section('The Luseatum salt-the-earth example (RR p.459)');
{
  const c = mkCampaign();
  mkLeader(c, 'chr-s', 'Salter');
  const dom = { id: 'dom-l', name: 'Luseatum', rulerCharacterId: 'chr-s', liegeId: null, classification: 'Civilized',
    demographics: { peasantFamilies: 600, urbanFamilies: 100, morale: 0 }, geography: { hexes: [] },
    garrison: { units: [] }, income: {}, expenses: {}, treasury: { gp: 0 }, stronghold: { components: [] }, history: [] };
  c.domains.push(dom);
  const res = ACKS.rollPillageResults(c, dom, { saltTheEarth: true, rng: () => 0.5 });
  ok('urban plunder 100 × 75 = 7,500gp', res.gold - 600 * 20 === 7500, String(res.gold));
  ok('peasant plunder 600 × 20 = 12,000gp (total 19,500)', res.gold === 19500, String(res.gold));
  ok('supplies 600 × 50 = 30,000gp', res.supplies === 30000, String(res.supplies));
  ok('1 prisoner per family = 700', res.prisoners === 700, String(res.prisoners));
  ok('the domain is destroyed — every family lost', res.destroyed === true && res.familiesLost === 700);
}

section('Pillage end-to-end — begin → the consumer ticks → the world writes');
{
  const c = mkCampaign();
  c.hexes.push({ id: 'hx-pp', coord: { q: 0, r: 0 }, terrain: 'grassland', domainId: 'dom-pp' });
  const leader = mkLeader(c, 'chr-pl', 'Plunder Lord', { payKeepFromTreasury: false, xp: 0 });
  const dom = { id: 'dom-pp', name: 'Prize March', rulerCharacterId: 'chr-pl', liegeId: null, classification: 'Civilized',
    demographics: { peasantFamilies: 400, urbanFamilies: 0, morale: 0 }, geography: { hexes: [{ id: 'hx-pp', coord: { q: 0, r: 0 }, terrain: 'grassland', families: 400 }] },
    garrison: { units: [] }, income: {}, expenses: {}, treasury: { gp: 0 },
    stronghold: { components: [{ name: 'Tower', buildValue: 3000 }] }, history: [] };
  c.domains.push(dom);
  const a = mkArmy(c, 'army-pp', 'Plunder Host', 'chr-pl', 'hx-pp', [{ unitTypeKey: 'light-infantry', count: 600 }]);
  // gates: pillage wants the domain CONQUERED by this leader — here he already rules it (post-conquest)
  const beg = ACKS.beginPillage(c, { armyId: 'army-pp', domainId: 'dom-pp', rng: () => 0.5 });
  ok('beginPillage rolls the duration (≤500 fam = 1 day)', beg.ok && a.pillage && a.pillage.daysRequired === 1);
  ok('a pillaging army cannot march (RR p.459)', ACKS.startArmyMarch(c, 'army-pp', { destinationHexId: 'hx-pp' }).reason === 'pillaging');
  const t = ACKS.proposeDayTick(c, 1, { rng: seq([d6v(3), d6v(3), d6v(3), d10v(2), d10v(2), d10v(2), d6v(3), d6v(3)]) });
  const rec = t.pendingRecords.find(r => r.kind === 'pillage-complete');
  ok('the consumer proposes the completion with rolled results', !!rec && rec.results.gold === 9 * 400);
  ACKS.commitDayTick(c, t);
  ok('the leader’s purse received the plunder (GP Wave B)', (leader.coins.gp || 0) === 3600, String(leader.coins.gp));
  ok('… and the spoils XP (1/gp, RR p.459)', leader.xp === 3600, String(leader.xp));
  ok('prisoners ride the army', a.prisoners === rec.results.prisoners && a.prisoners === Math.round(2 * 400 / 10));
  ok('families fell via the canonical setter (hex sync)', dom.demographics.peasantFamilies === 400 - rec.results.familiesLost && dom.geography.hexes[0].families === dom.demographics.peasantFamilies);
  ok('the stronghold lost 1gp per 1gp plundered', dom.stronghold.components[0].buildValue === 0, String(dom.stronghold.components[0].buildValue));
  ok('the pillage state cleared', a.pillage === null);
  ok('… the −4 morale roll applied', rec.morale && dom.demographics.morale === rec.morale.after);
  ok('… domain-warfare action=pillaged emitted', (c.eventLog || []).some(e => e.event.kind === 'domain-warfare' && e.event.payload.action === 'pillaged'));
  // ransom: 40gp a head + spoils XP
  const xpBefore = leader.xp, purseBefore = leader.coins.gp;
  const ran = ACKS.ransomPrisoners(c, { armyId: 'army-pp', count: 10 });
  ok('ransom 10 × 40 = 400gp + 400 XP', ran.ok && leader.coins.gp === purseBefore + 400 && leader.xp === xpBefore + 400 && a.prisoners === rec.results.prisoners - 10);
}

section('Pillage gates — conquest first, presence, the march hold');
{
  const c = mkCampaign();
  c.hexes.push({ id: 'hx-g1', coord: { q: 0, r: 0 }, terrain: 'grassland', domainId: 'dom-g' });
  mkLeader(c, 'chr-g1', 'Gate Tester');
  mkLeader(c, 'chr-g2', 'Foreign Lord');
  const dom = { id: 'dom-g', name: 'Gated March', rulerCharacterId: 'chr-g2', liegeId: null, classification: 'Civilized',
    demographics: { peasantFamilies: 100, urbanFamilies: 0, morale: 0 }, geography: { hexes: [] },
    garrison: { units: [] }, income: {}, expenses: {}, treasury: { gp: 0 }, stronghold: { components: [] }, history: [] };
  c.domains.push(dom);
  const a = mkArmy(c, 'army-g1', 'Gate Host', 'chr-g1', 'hx-g1', [{ unitTypeKey: 'light-infantry', count: 600 }]);
  ok('an unconquered domain refuses pillage (loot/requisition is W5)', ACKS.beginPillage(c, { armyId: 'army-g1', domainId: 'dom-g' }).reason === 'not-conquered');
  ACKS.occupyDomain(c, 'dom-g', { leaderCharacterId: 'chr-g1' });
  ok('occupied-but-not-conquered still refuses', ACKS.beginPillage(c, { armyId: 'army-g1', domainId: 'dom-g' }).reason === 'not-conquered');
  dom.occupiedBy = null; dom.rulerCharacterId = 'chr-g1';   // conquered
  a.currentHexId = 'hx0-elsewhere';
  ok('not standing in the domain refuses', ACKS.beginPillage(c, { armyId: 'army-g1', domainId: 'dom-g' }).reason === 'not-in-domain');
  a.currentHexId = 'hx-g1';
  ok('conquered + present → the pillage begins', ACKS.beginPillage(c, { armyId: 'army-g1', domainId: 'dom-g', rng: () => 0.5 }).ok === true);
}

section('Registry / schema / event locks (§5.6 mandates)');
{
  ok('army-contact + domain-warfare are registered event kinds', ACKS.EVENT_KINDS.indexOf('army-contact') >= 0 && ACKS.EVENT_KINDS.indexOf('domain-warfare') >= 0);
  ok('… with schemas', !!ACKS.EVENT_SCHEMAS['army-contact'] && !!ACKS.EVENT_SCHEMAS['domain-warfare']);
  ok('… opted out of the Event Wizard (engine-owned)', !ACKS.wizardEmittableKinds().some(k => k === 'army-contact' || k === 'domain-warfare'));
  const ev = ACKS.newEvent('domain-warfare', { payload: { action: 'invaded', domainId: 'dom-x' } });
  ok('newEvent accepts domain-warfare', ev && ev.kind === 'domain-warfare');
  // schema ⊆ factory for the new army fields
  const fields = (ACKS.fieldSchemaFor('army') || { fields: [] }).fields.map(f => f.name);
  const factory = ACKS.blankArmy({});
  ok('the W4 army schema fields all exist on blankArmy', ['reconModifier', 'concealmentModifier', 'alliedLeaderCharacterIds', 'permittedDomainIds', 'prisoners'].every(n => fields.indexOf(n) >= 0 && (n in factory)));
  const jf = (ACKS.fieldSchemaFor('journey') || { fields: [] }).fields.map(f => f.name);
  ok('journey.armyId in the schema + the factory', jf.indexOf('armyId') >= 0 && ('armyId' in ACKS.blankJourney({})));
  ok('the military day consumer is registered at slot 88', (function(){
    const cs = ACKS.dayConsumersInOrder ? ACKS.dayConsumersInOrder() : [];
    const m = cs.find(x => x.name === 'military');
    return m && m.order === 88 && cs[cs.length - 1].name === 'military';
  })());
  ok('blankArmy seeds the W4 lazy fields', Array.isArray(factory.marchedOrds) && Array.isArray(factory.intelReports) && factory.pillage === null && factory.prisoners === 0 && factory.warMachines === null);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log('=============================================');
console.log('maneuvers.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail > 0) process.exit(1);
