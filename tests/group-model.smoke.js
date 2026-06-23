// =============================================================================
// group-model.smoke.js — §12 The Group model (Architecture.md §12).
//
//   node tests/group-model.smoke.js   (or via `npm test`)
//
// The shared behavioral interface over the collective-actor kinds (Party / Army /
// Unit / Band; Caravan reserved). Distinct entities, one contract: groupKindOf,
// groupMembers (individuated channel), groupFormations (counted channel),
// groupHeadcount, groupPosition, groupContainer/groupIsAutonomous (containment →
// the merged-view tables), groupRow, worldGroups, looseUnits, and the
// musterArmyFromParty transformation (party → army).
// =============================================================================
'use strict';
const path = require('path');
const DIR = path.join(__dirname, '..');
global.window = global;
[
  'acks-engine-catalogs.js', 'acks-engine-monsters.js', 'acks-engine-encounter-tables.js', 'acks-engine-troops.js',
  'acks-engine.js', 'acks-engine-lairs.js', 'acks-engine-stash.js', 'acks-engine-entities.js', 'acks-engine-economy.js',
  'acks-engine-entity-registry.js', 'acks-engine-field-schemas.js', 'acks-engine-events.js', 'acks-engine-battles.js', 'acks-engine-maneuvers.js', 'acks-engine-subsystems.js'
].forEach(f => require(path.join(DIR, f)));
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(label + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('— ' + t); }

// ─── a campaign with one of each kind ────────────────────────────────────────
function mkCamp(){
  const camp = ACKS.blankCampaign ? ACKS.blankCampaign() : {};
  ['characters','parties','armies','units','groups','journeys','domains','hexes','lairs'].forEach(k => { if(!Array.isArray(camp[k])) camp[k] = []; });
  camp.currentTurn = 5;
  const mkc = (id, name, hex) => {
    const c = ACKS.blankCharacter ? ACKS.blankCharacter({ id, name }) : { id, name };
    c.currentHexId = hex || null;
    camp.characters.push(c);
    return c;
  };
  // hexes so unitCurrentHexId resolves a garrison seat
  camp.hexes.push({ id: 'hex-a', domainId: null });
  camp.hexes.push({ id: 'hex-b', domainId: null });
  camp.hexes.push({ id: 'hex-c', domainId: null });
  camp.hexes.push({ id: 'hex-gar', domainId: 'dom-x' });
  camp.domains.push({ id: 'dom-x', name: 'Marchland' });

  // a PARTY of two, leader carries a mercenary company of 40
  mkc('chr-leader', 'Aldric', 'hex-a');
  mkc('chr-mate', 'Bree', 'hex-a');
  const party = ACKS.blankParty({ id: 'par-1', name: 'Aldric’s Band', memberCharacterIds: ['chr-leader', 'chr-mate'], leaderCharacterId: 'chr-leader', currentHexId: 'hex-a' });
  camp.parties.push(party);
  camp.characters.find(c => c.id === 'chr-leader').partyId = 'par-1';
  camp.characters.find(c => c.id === 'chr-mate').partyId = 'par-1';
  ACKS.stationUnit(camp, ACKS.blankUnit({ id: 'unit-merc', displayName: 'Sellswords', unitTypeKey: 'light-infantry', count: 40, brPerSoldier: 0 }), { kind: 'character', id: 'chr-leader' });

  // a loose GARRISON unit
  ACKS.stationUnit(camp, ACKS.blankUnit({ id: 'unit-gar', displayName: 'Wardens', unitTypeKey: 'heavy-infantry', count: 60, brPerSoldier: 0 }), { kind: 'domain-garrison', id: 'dom-x' });

  // an ARMY led by a general, one unit stationed in
  mkc('chr-gen', 'Marcus', 'hex-b');
  ACKS.stationUnit(camp, ACKS.blankUnit({ id: 'unit-army', displayName: 'Legion', unitTypeKey: 'heavy-infantry', count: 120, brPerSoldier: 0 }), { kind: 'domain-garrison', id: 'dom-x' });
  const army = ACKS.createArmy(camp, { id: 'army-1', name: 'Host', leaderCharacterId: 'chr-gen', currentHexId: 'hex-b', unitIds: ['unit-army'] });

  // a BAND
  camp.groups.push(ACKS.blankGroup({ id: 'grp-1', name: 'Grey Pack', count: 8, currentHexId: 'hex-c', groupTemplate: { monsterCatalogKey: 'wolf', creatureTypes: ['animal'], hitDice: '2+2' } }));

  return { camp, party, army };
}

const { camp, party, army } = mkCamp();
const unitMerc = ACKS.findUnit(camp, 'unit-merc');
const unitGar = ACKS.findUnit(camp, 'unit-gar');
const unitArmy = ACKS.findUnit(camp, 'unit-army');
const band = camp.groups.find(g => g.id === 'grp-1');

// ─────────────────────────────────────────────────────────────────────────────
section('groupKindOf — signature discrimination (army before party)');
ok('party → party', ACKS.groupKindOf(party) === 'party');
ok('army → army (despite memberCharacterIds)', ACKS.groupKindOf(army) === 'army');
ok('unit → unit', ACKS.groupKindOf(unitMerc) === 'unit');
ok('band → band', ACKS.groupKindOf(band) === 'band');
ok('null-ish → null', ACKS.groupKindOf(null) === null && ACKS.groupKindOf({}) === null);

section('groupKindMeta + groupDisplayName');
ok('meta icons/labels', ACKS.groupKindMeta('army').icon === '🎖' && ACKS.groupKindMeta('unit').label === 'Unit');
ok('display names per kind', ACKS.groupDisplayName(party) === 'Aldric’s Band' && ACKS.groupDisplayName(unitGar) === 'Wardens' &&
   ACKS.groupDisplayName(army) === 'Host' && ACKS.groupDisplayName(band) === 'Grey Pack');

section('groupMembers — the individuated channel');
ok('party → its members', ACKS.groupMembers(camp, party).map(c => c.id).join(',') === 'chr-leader,chr-mate');
ok('army → leader + division commander, deduped', ACKS.groupMembers(camp, army).map(c => c.id).join(',') === 'chr-gen');
ok('unit (no officer) → []', ACKS.groupMembers(camp, unitMerc).length === 0);
ok('band (no commander) → []', ACKS.groupMembers(camp, band).length === 0);

section('groupLeader');
ok('party leader', ACKS.groupLeader(camp, party).id === 'chr-leader');
ok('army leader', ACKS.groupLeader(camp, army).id === 'chr-gen');
ok('band → null', ACKS.groupLeader(camp, band) === null);

section('groupFormations — the counted channel');
ok('army → its stationed units', ACKS.groupFormations(camp, army).map(u => u.id).join(',') === 'unit-army');
ok('party → members’ mercenary units', ACKS.groupFormations(camp, party).map(u => u.id).join(',') === 'unit-merc');
ok('unit → itself', ACKS.groupFormations(camp, unitGar)[0] === unitGar);
ok('band → itself', ACKS.groupFormations(camp, band)[0] === band);

section('groupHeadcount — natural size per kind');
ok('party → 2 chars + 40 merc = 42', ACKS.groupHeadcount(camp, party) === 42);
ok('army → 120 troops', ACKS.groupHeadcount(camp, army) === 120);
ok('unit → active soldiers', ACKS.groupHeadcount(camp, unitMerc) === 40);
ok('band → active creatures', ACKS.groupHeadcount(camp, band) === 8);
ok('casualties reduce headcount', ACKS.groupHeadcount(camp, ACKS.blankUnit({ count: 50, casualties: 20, brPerSoldier: 0 })) === 30);

section('groupPosition — incl. nested resolves to container');
ok('party hex', ACKS.groupPosition(camp, party) === 'hex-a');
ok('army hex', ACKS.groupPosition(camp, army) === 'hex-b');
ok('band hex', ACKS.groupPosition(camp, band) === 'hex-c');
ok('merc unit → its patron’s hex', ACKS.groupPosition(camp, unitMerc) === 'hex-a');
ok('garrison unit → the domain seat hex', ACKS.groupPosition(camp, unitGar) === 'hex-gar');
ok('army-stationed unit → the army’s hex', ACKS.groupPosition(camp, unitArmy) === 'hex-b');

section('containment governs visibility (§12.5)');
ok('party autonomous', ACKS.groupIsAutonomous(camp, party) === true);
ok('army autonomous', ACKS.groupIsAutonomous(camp, army) === true);
ok('garrison unit autonomous (loose)', ACKS.groupIsAutonomous(camp, unitGar) === true);
ok('army-stationed unit NOT autonomous', ACKS.groupIsAutonomous(camp, unitArmy) === false);
ok('wandering band autonomous', ACKS.groupIsAutonomous(camp, band) === true);
ok('groupContainer: army-stationed unit → the army', ACKS.groupContainer(camp, unitArmy) === army);
ok('groupContainer: garrison unit → null', ACKS.groupContainer(camp, unitGar) === null);

section('a lair-bound band is nested');
camp.lairs.push({ id: 'lai-1', groupIds: ['grp-1'] });
ok('band with a lair holding it → NOT autonomous', ACKS.groupIsAutonomous(camp, band) === false);
camp.lairs.length = 0;

section('looseUnits + worldGroups — the merged-view feeds');
ok('looseUnits excludes army-stationed', ACKS.looseUnits(camp).map(u => u.id).sort().join(',') === 'unit-gar,unit-merc');
const wg = ACKS.worldGroups(camp);
ok('worldGroups: 1 party + 1 army + 2 loose units (no nested unit)', wg.length === 4 &&
   wg.filter(x => x.kind === 'party').length === 1 && wg.filter(x => x.kind === 'army').length === 1 && wg.filter(x => x.kind === 'unit').length === 2,
   'got ' + wg.length + ' [' + wg.map(x => x.kind).join(',') + ']');
ok('worldGroups kinds filter', ACKS.worldGroups(camp, { kinds: ['army'] }).length === 1);
ok('worldGroups includeNested adds the army unit', ACKS.worldGroups(camp, { kinds: ['unit'], includeNested: true }).length === 3);

section('groupForJourney — the inverse (a journey’s owning group)');
camp.journeys = [
  { id: 'jrn-army', armyId: 'army-1' },
  { id: 'jrn-unit', unitId: 'unit-gar' },
  { id: 'jrn-party', partyId: 'par-1' },
  { id: 'jrn-solo', participantCharacterIds: ['chr-leader'] }
];
ok('army journey → the army', ACKS.groupForJourney(camp, camp.journeys[0]) === army);
ok('unit journey → the unit (by id)', ACKS.groupForJourney(camp, 'jrn-unit') === unitGar);
ok('party journey → the party', ACKS.groupForJourney(camp, camp.journeys[2]) === party);
ok('lone-traveller journey → null', ACKS.groupForJourney(camp, camp.journeys[3]) === null);
ok('unknown journey id → null', ACKS.groupForJourney(camp, 'jrn-nope') === null);

section('groupRow — the shared table descriptor');
const prow = ACKS.groupRow(camp, party), arow = ACKS.groupRow(camp, army);
ok('party row', prow.kind === 'party' && prow.name === 'Aldric’s Band' && prow.leaderName === 'Aldric' && prow.headcount === 42 && prow.hexId === 'hex-a' && prow.memberCount === 2);
ok('army row', arow.kind === 'army' && arow.name === 'Host' && arow.leaderName === 'Marcus' && arow.headcount === 120 && arow.hexId === 'hex-b');

section('groupLogistics — the tagged consumption model');
ok('party eats rations + water', ACKS.groupLogistics(camp, party).model === 'rations-water');
ok('army draws supplies', ACKS.groupLogistics(camp, army).model === 'supplies');
ok('band forages', ACKS.groupLogistics(camp, band).model === 'forage');

// ─────────────────────────────────────────────────────────────────────────────
section('musterArmyFromParty — the party → army transformation (§12.6)');
const { camp: c2 } = (function(){
  const camp = ACKS.blankCampaign ? ACKS.blankCampaign() : {};
  ['characters','parties','armies','units','groups','journeys','domains','hexes','lairs'].forEach(k => { if(!Array.isArray(camp[k])) camp[k] = []; });
  camp.currentTurn = 7;
  const mk = (id, name, hex) => { const c = ACKS.blankCharacter ? ACKS.blankCharacter({ id, name }) : { id, name }; c.currentHexId = hex; camp.characters.push(c); return c; };
  mk('chr-x', 'Xanthe', 'hex-d'); mk('chr-y', 'Yorick', 'hex-d');
  const party = ACKS.blankParty({ id: 'par-2', name: 'Xanthe’s Company', memberCharacterIds: ['chr-x', 'chr-y'], leaderCharacterId: 'chr-x', currentHexId: 'hex-d' });
  camp.parties.push(party);
  camp.characters.find(c => c.id === 'chr-x').partyId = 'par-2';
  camp.characters.find(c => c.id === 'chr-y').partyId = 'par-2';
  ACKS.stationUnit(camp, ACKS.blankUnit({ id: 'unit-xmerc', unitTypeKey: 'light-infantry', count: 30, brPerSoldier: 0 }), { kind: 'character', id: 'chr-x' });
  return { camp };
})();
const newArmy = ACKS.musterArmyFromParty(c2, 'par-2');
ok('returns an army', newArmy && ACKS.groupKindOf(newArmy) === 'army');
ok('commander = the party leader', newArmy.leaderCharacterId === 'chr-x');
ok('army inherits the party hex', newArmy.currentHexId === 'hex-d');
ok('members become the army roster', (newArmy.memberCharacterIds || []).slice().sort().join(',') === 'chr-x,chr-y');
ok('groupMembers(army) shows both', ACKS.groupMembers(c2, newArmy).map(c => c.id).sort().join(',') === 'chr-x,chr-y');
ok('the mercenary unit is now stationed to the army', ACKS.findUnit(c2, 'unit-xmerc').stationedAt.kind === 'army' && ACKS.findUnit(c2, 'unit-xmerc').stationedAt.id === newArmy.id);
ok('it left the patron’s mercenary company', ACKS.unitsStationedAt(c2, { kind: 'character', id: 'chr-x' }).length === 0);
ok('army troops = the unit’s soldiers (30)', ACKS.groupHeadcount(c2, newArmy) === 30);
ok('a Main Body division was auto-built', Array.isArray(newArmy.divisions) && newArmy.divisions.length === 1 && newArmy.divisions[0].commanderCharacterId === 'chr-x');
ok('the party is CONSUMED (removed)', !c2.parties.some(p => p && p.id === 'par-2'));
ok('members’ partyId cleared', c2.characters.find(c => c.id === 'chr-x').partyId == null && c2.characters.find(c => c.id === 'chr-y').partyId == null);
ok('history stamped', newArmy.history.some(h => h.type === 'mustered-from-party'));
ok('id-stable when opts.id given', ACKS.musterArmyFromParty(c2, 'par-missing', { id: 'army-1' }) === null);

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log(fail === 0 ? ('group-model.smoke: ' + pass + ' assertions, ALL PASS') : ('group-model.smoke: ' + fail + ' FAIL of ' + (pass + fail)));
if(fail > 0){ failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
