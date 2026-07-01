// =============================================================================
// entity-involvement.smoke.js — the entity↔encounter involvement accessor (2026-07-01).
//
//   node tests/entity-involvement.smoke.js   (or via `npm test`)
//
// Powers the standardized "in an encounter" resolve strip that appears on the
// character / party / monster / lair sheets: encounterInvolvesEntity (predicate)
// + encountersInvolvingEntity (filter, activeOnly optional). A character counts
// as involved directly (partySide.characterIds / monsterSide.residentCharacterId)
// OR as a current member/leader of the involved party.
// =============================================================================
'use strict';
const path = require('path');
const DIR = path.join(__dirname, '..');
global.window = global;
[
  'acks-engine-catalogs.js', 'acks-engine-monsters.js', 'acks-engine-encounter-tables.js', 'acks-engine-troops.js',
  'acks-engine.js', 'acks-engine-lairs.js', 'acks-engine-stash.js', 'acks-engine-military.js', 'acks-engine-entities.js'
].forEach(f => require(path.join(DIR, f)));
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(label + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('— ' + t); }
const ids = arr => arr.map(e => e.id);

section('encounterInvolvesEntity / encountersInvolvingEntity');
{
  ok('both exported', typeof ACKS.encounterInvolvesEntity === 'function' && typeof ACKS.encountersInvolvingEntity === 'function');

  const camp = {
    parties: [{ id: 'prt-a', memberCharacterIds: ['chr-lead', 'chr-mem'], leaderCharacterId: 'chr-lead' }],
    encounters: [
      { id: 'enc-1', status: 'active',   partySide: { partyId: 'prt-a', characterIds: ['chr-lead'] }, monsterSide: { lairId: 'lair-1', groupIds: ['grp-9'] }, hexId: 'hex-7' },
      { id: 'enc-2', status: 'resolved', partySide: { partyId: 'prt-a' }, monsterSide: {} },
      { id: 'enc-3', status: 'active',   partySide: {}, monsterSide: { residentCharacterId: 'chr-npc', lairId: 'lair-2' }, hexId: 'hex-9' },
    ],
  };

  // party
  ok('party — active only', ids(ACKS.encountersInvolvingEntity(camp, 'party', 'prt-a', { activeOnly: true })).join(',') === 'enc-1');
  ok('party — incl. resolved', ids(ACKS.encountersInvolvingEntity(camp, 'party', 'prt-a')).join(',') === 'enc-1,enc-2');

  // character — direct, via-member, resident
  ok('character direct (on partySide)', ids(ACKS.encountersInvolvingEntity(camp, 'character', 'chr-lead', { activeOnly: true })).join(',') === 'enc-1');
  ok('character via party membership', ids(ACKS.encountersInvolvingEntity(camp, 'character', 'chr-mem', { activeOnly: true })).join(',') === 'enc-1');
  ok('character resident on monster side', ids(ACKS.encountersInvolvingEntity(camp, 'character', 'chr-npc', { activeOnly: true })).join(',') === 'enc-3');
  ok('unrelated character → none', ACKS.encountersInvolvingEntity(camp, 'character', 'chr-nobody', { activeOnly: true }).length === 0);

  // monster kinds
  ok('group', ids(ACKS.encountersInvolvingEntity(camp, 'group', 'grp-9', { activeOnly: true })).join(',') === 'enc-1');
  ok('lair', ids(ACKS.encountersInvolvingEntity(camp, 'lair', 'lair-1', { activeOnly: true })).join(',') === 'enc-1');
  ok('lair 2 (resident-side)', ids(ACKS.encountersInvolvingEntity(camp, 'lair', 'lair-2', { activeOnly: true })).join(',') === 'enc-3');
  ok('hex', ids(ACKS.encountersInvolvingEntity(camp, 'hex', 'hex-7', { activeOnly: true })).join(',') === 'enc-1');

  // predicate edge cases
  ok('predicate: null enc → false', ACKS.encounterInvolvesEntity(camp, null, 'party', 'prt-a') === false);
  ok('predicate: missing id → false', ACKS.encounterInvolvesEntity(camp, camp.encounters[0], 'party', null) === false);
  ok('predicate: unknown kind → false', ACKS.encounterInvolvesEntity(camp, camp.encounters[0], 'widget', 'prt-a') === false);
  ok('filter: null campaign → []', Array.isArray(ACKS.encountersInvolvingEntity(null, 'party', 'prt-a')) && ACKS.encountersInvolvingEntity(null, 'party', 'prt-a').length === 0);

  // works over a real blankEncounter shape
  const be = ACKS.blankEncounter({ status: 'active', hexId: 'hex-x', partySide: { partyId: 'prt-a', characterIds: ['chr-lead'] } });
  const camp2 = { parties: camp.parties, encounters: [be] };
  ok('real blankEncounter — party matches', ACKS.encountersInvolvingEntity(camp2, 'party', 'prt-a', { activeOnly: true }).length === 1);
  ok('real blankEncounter — member matches', ACKS.encountersInvolvingEntity(camp2, 'character', 'chr-mem', { activeOnly: true }).length === 1);
}

console.log((fail ? '✗' : '✅') + ' entity-involvement.smoke: ' + pass + ' passed, ' + fail + ' failed');
if(fail){ console.log('FAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
