/* tests/monster-persistence.smoke.js — Phase 2.5 Monster Persistence (#476), M0 Foundations.
 *
 *   node tests/monster-persistence.smoke.js   (or via `npm test`)
 *
 * M0 = the catalog-free RAW-core data layer: blankLair promoted to the first-class §3.1 entity,
 * campaign.lairs[] collection, the 5 lookups + lairInhabitantCount, the migrateLegacyHexLairs lift
 * (legacy nested hex.lairs[] → first-class), entity-registry + field-schema registration, and the
 * demo's 3 monster-Groups bound as Lairs. Pool-first encounters / discovery / generation are M3+.
 */
'use strict';
const path = require('path');
const DIR = path.join(__dirname, '..');
[
  'acks-engine-catalogs.js', 'acks-engine.js', 'acks-engine-entities.js', 'acks-engine-economy.js',
  'acks-engine-entity-registry.js', 'acks-engine-field-schemas.js', 'acks-engine-events.js', 'acks-engine-subsystems.js',
].forEach(f => require(path.join(DIR, f)));
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail) { if (cond) { pass++; } else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t) { console.log('\n— ' + t); }

// =============================================================================
section('factory — blankLair §3.1 shape');
{
  const l = ACKS.blankLair();
  ok('schemaVersion 2', l.schemaVersion === 2);
  ok('id has lai- prefix', /^lai-/.test(l.id));
  ok("ID prefix 'lair' registered as 'lai'", ACKS.ID_PREFIXES.lair === 'lai');
  ok('status defaults active', l.status === 'active');
  ok('hexId defaults null', l.hexId === null);
  ok('knownToPlayers defaults false', l.knownToPlayers === false);
  ok('hiddenDC defaults null', l.hiddenDC === null);
  ok('lairPct defaults null', l.lairPct === null);
  ok('groupIds defaults []', Array.isArray(l.groupIds) && l.groupIds.length === 0);
  ok('leaderCharacterIds defaults []', Array.isArray(l.leaderCharacterIds) && l.leaderCharacterIds.length === 0);
  ok('totalInhabitantCount defaults 0', l.totalInhabitantCount === 0);
  ok('treasureType defaults ""', l.treasureType === '');
  ok('treasureCustodyId defaults null', l.treasureCustodyId === null);
  ok('lairType defaults lair', l.lairType === 'lair');
  ok('hasFortifications defaults false', l.hasFortifications === false);
  ok('establishedBy defaults gm-fiat', l.establishedBy === 'gm-fiat');
  ok('repopulationChance defaults null', l.repopulationChance === null);
  ok('history defaults []', Array.isArray(l.history));
  // opts honoured
  const l2 = ACKS.blankLair({ id: 'lai-x', status: 'dynamic', hexId: null, monsterCatalogKey: 'orc', groupIds: ['grp-1'], knownToPlayers: true, lairPct: 35 });
  ok('opts honoured (status/monsterCatalogKey/lairPct/knownToPlayers)', l2.status === 'dynamic' && l2.monsterCatalogKey === 'orc' && l2.lairPct === 35 && l2.knownToPlayers === true);
}
ok('blankCampaign.lairs defaults []', Array.isArray(ACKS.blankCampaign().lairs) && ACKS.blankCampaign().lairs.length === 0);

// =============================================================================
section('lookups — findLair / lairsAtHex / lairsByMonsterKey / activeLairs / clearedLairs');
{
  const c = ACKS.blankCampaign({ name: 'lookups' });
  c.groups = [
    { id: 'grp-a', count: 8, casualties: 2, currentHexId: 'hex-1', groupTemplate: { monsterCatalogKey: 'orc' } },
  ];
  c.lairs = [
    ACKS.blankLair({ id: 'lai-1', hexId: 'hex-1', monsterCatalogKey: 'orc', status: 'active', groupIds: ['grp-a'], leaderCharacterIds: ['chr-chief'] }),
    ACKS.blankLair({ id: 'lai-2', hexId: 'hex-1', monsterCatalogKey: 'kobold', status: 'cleared' }),
    ACKS.blankLair({ id: 'lai-3', hexId: 'hex-2', monsterCatalogKey: 'orc', status: 'active' }),
  ];
  ok('findLair by id', ACKS.findLair(c, 'lai-2') && ACKS.findLair(c, 'lai-2').monsterCatalogKey === 'kobold');
  ok('findLair miss → null', ACKS.findLair(c, 'lai-nope') === null);
  ok('lairsAtHex returns all statuses at the hex', ACKS.lairsAtHex(c, 'hex-1').length === 2);
  ok('lairsAtHex other hex', ACKS.lairsAtHex(c, 'hex-2').length === 1);
  ok('lairsAtHex empty for unknown hex', ACKS.lairsAtHex(c, 'hex-none').length === 0);
  ok('lairsByMonsterKey across hexes', ACKS.lairsByMonsterKey(c, 'orc').length === 2);
  ok('activeLairs excludes cleared', ACKS.activeLairs(c).length === 2);
  ok('clearedLairs only cleared', ACKS.clearedLairs(c).length === 1 && ACKS.clearedLairs(c)[0].id === 'lai-2');
  // lairInhabitantCount: active group count (8-2=6) + 1 leader = 7
  ok('lairInhabitantCount = Σ active group + leaders', ACKS.lairInhabitantCount(c, ACKS.findLair(c, 'lai-1')) === 7);
  ok('lairInhabitantCount empty lair = 0', ACKS.lairInhabitantCount(c, ACKS.findLair(c, 'lai-3')) === 0);
  // defensive: bad inputs
  ok('lookups defensive on null campaign', ACKS.lairsAtHex(null, 'hex-1').length === 0 && ACKS.findLair(null, 'x') === null);
}

// =============================================================================
section('migrateLegacyHexLairs — lift legacy nested hex.lairs[] → campaign.lairs[]');
{
  const c = ACKS.blankCampaign({ name: 'lift' });
  delete c.lairs;                              // simulate a legacy save with no top-level collection
  c.domains = [ { id: 'dom-1', name: 'D', geography: { hexes: [
    { id: 'hex-1', lairs: [ { id: 'lai-legacy-1', name: 'Old Warren', creatureType: 'kobolds', hd: '1-1', numberAppearing: '2d6', description: 'A badger-sett warren.' } ] },
    { id: 'hex-2', lairs: [] },
  ] } } ];
  const n = ACKS.migrateLegacyHexLairs(c);
  ok('lifted 1 lair', n === 1);
  ok('campaign.lairs created + populated', Array.isArray(c.lairs) && c.lairs.length === 1);
  const lifted = c.lairs[0];
  ok('lifted lair keeps id', lifted.id === 'lai-legacy-1');
  ok('lifted lair keeps name', lifted.name === 'Old Warren');
  ok('lifted lair gets hexId from its hex', lifted.hexId === 'hex-1');
  ok('lifted lair status active', lifted.status === 'active');
  ok('lifted lair has full §3.1 shape (groupIds key present)', Array.isArray(lifted.groupIds) && 'lairPct' in lifted);
  ok('legacy creatureType/hd/numberAppearing folded into notes', /badger-sett warren/.test(lifted.notes) && /Creature: kobolds/.test(lifted.notes) && /HD: 1-1/.test(lifted.notes));
  ok('nested hex.lairs cleared after lift', c.domains[0].geography.hexes[0].lairs.length === 0);
  // idempotent
  const n2 = ACKS.migrateLegacyHexLairs(c);
  ok('re-running lifts nothing (idempotent)', n2 === 0 && c.lairs.length === 1);
}

// =============================================================================
section('migrateLegacyHexLairs via full migrateCampaign (lazy-default + lift integration)');
{
  const c = ACKS.blankCampaign({ name: 'full migrate' });
  delete c.lairs;
  const hex = ACKS.blankHex({ id: 'hex-x', domainId: 'dom-x' });
  hex.lairs = [ { id: 'lai-legacy-2', name: 'Cliff Aerie', creatureType: 'harpies', description: 'A cliffside aerie.' } ];
  c.hexes = [ hex ];                          // top-level hex carries the legacy nested lair
  const m = ACKS.migrateCampaign(c);
  ok('migrateCampaign guarantees campaign.lairs[]', Array.isArray(m.lairs));
  ok('migrateCampaign lifts the nested lair', m.lairs.length === 1 && m.lairs[0].id === 'lai-legacy-2');
  ok('lifted lair hexId set', m.lairs[0].hexId === 'hex-x');
  ok('migrateCampaign is idempotent on lairs', ACKS.migrateCampaign(JSON.parse(JSON.stringify(m))).lairs.length === 1);
}

// =============================================================================
section('entity registry — lair kind');
{
  ok('lair kind registered', ACKS.entityKinds().some(k => k.kind === 'lair'));
  ok('entityIcon(lair)', ACKS.entityIcon('lair') === '🏚');
  ok('entityLabel(lair)', ACKS.entityLabel('lair') === 'Lair');
  const c = ACKS.blankCampaign({ name: 'reg' });
  c.lairs = [ ACKS.blankLair({ id: 'lai-1', name: 'Bloodfang Cave' }) ];
  ok('listEntities(lair)', ACKS.listEntities(c, 'lair').length === 1);
  ok('findEntity(lair, id)', ACKS.findEntity(c, 'lair', 'lai-1').name === 'Bloodfang Cave');
  ok('entityDisplayName uses name', ACKS.entityDisplayName(c, 'lair', 'lai-1') === 'Bloodfang Cave');
  const c2 = ACKS.blankCampaign({ name: 'reg2' });
  c2.lairs = [ ACKS.blankLair({ id: 'lai-2', name: '', monsterCatalogKey: 'manticore' }) ];
  ok('entityDisplayName falls back to monsterCatalogKey', ACKS.entityDisplayName(c2, 'lair', 'lai-2') === 'manticore');
}

// =============================================================================
section('field schema — lair (Inspector) ⊆ blankLair');
{
  const schema = ACKS.fieldSchemaFor('lair');
  ok('lair field-schema exists', !!schema && schema.factory === 'blankLair');
  ok('lair schema validates clean', ACKS.validateFieldSchema('lair', schema).ok);
  const keys = new Set(Object.keys(ACKS.blankLair({})));
  const extras = schema.fields.filter(f => f.type !== 'computed').map(f => f.name).filter(n => !keys.has(n));
  ok('lair schema fields ⊆ blankLair keys', extras.length === 0, 'extras: [' + extras.join(', ') + ']');
  ok('totalInhabitantCount is computed (derived)', schema.fields.find(f => f.name === 'totalInhabitantCount').type === 'computed');
}

// =============================================================================
section('demo template — 3 monster-Groups bound as Lairs');
{
  delete require.cache[require.resolve(path.join(DIR, 'acks-demo-template.js'))];
  require(path.join(DIR, 'acks-demo-template.js'));
  const demo = global.ACKS_DEMO_TEMPLATE;
  ok('demo carries 3 lairs', Array.isArray(demo.lairs) && demo.lairs.length === 3);
  const byId = Object.fromEntries(demo.lairs.map(l => [l.id, l]));
  const groupIds = new Set(demo.groups.map(g => g.id));
  for (const l of demo.lairs) {
    ok('demo lair ' + l.id + ' has a hexId that exists', !!demo.hexes.find(h => h.id === l.hexId));
    ok('demo lair ' + l.id + ' groupIds resolve to real groups', l.groupIds.length > 0 && l.groupIds.every(g => groupIds.has(g)));
    ok('demo lair ' + l.id + ' is active + known', l.status === 'active' && l.knownToPlayers === true);
  }
  // the Grey Pack lair binds grp-greypack at its den; inhabitant count = the group's active count (8)
  const grey = byId['lai-greypack-den'];
  ok('Grey Pack lair binds grp-greypack', grey && grey.groupIds.includes('grp-greypack'));
  ok('Grey Pack lairInhabitantCount = group active count (8)', ACKS.lairInhabitantCount(demo, grey) === 8);
  ok('demo is a migrate-no-op (lairs survive round-trip)', JSON.stringify(demo) === JSON.stringify(ACKS.migrateCampaign(JSON.parse(JSON.stringify(demo)))));
}

// =============================================================================
section('adventure-result clears a lair → status flips to cleared (campaign.lairs)');
{
  const c = ACKS.blankCampaign({ name: 'clear' });
  c.currentTurn = 4;
  c.domains = [ { id: 'dom-1', name: 'D', geography: { hexes: [ ACKS.blankHex({ id: 'hex-1', domainId: 'dom-1' }) ] } } ];
  c.lairs = [ ACKS.blankLair({ id: 'lai-1', hexId: 'hex-1', status: 'active', monsterCatalogKey: 'goblin' }) ];
  const ev = ACKS.newEvent('adventure-result', { submittedBy: 'tool:test', payload: { outcome: 'cleared', hexId: 'hex-1', lairId: 'lai-1' } });
  ACKS.applyEvent(c, ev);
  const after = ACKS.findLair(c, 'lai-1');
  ok('lair flipped to cleared (not deleted — structure remains)', after && after.status === 'cleared');
  ok('cleared lair stamped clearedAtTurn', after.clearedAtTurn === 4);
  ok('cleared lair stamped clearedByEventId', after.clearedByEventId === ev.id);
  ok('cleared lair no longer in activeLairs', ACKS.activeLairs(c).length === 0 && ACKS.clearedLairs(c).length === 1);
}

// =============================================================================
console.log('\n— Summary');
console.log('  Passed: ' + pass);
console.log('  Failed: ' + fail);
if (fail) { console.log('FAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
