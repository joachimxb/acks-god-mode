/* tests/monster-persistence.smoke.js — Phase 2.5 Monster Persistence (#476), M0 + M1.
 *
 *   node tests/monster-persistence.smoke.js   (or via `npm test`)
 *
 * M0 = the catalog-free RAW-core data layer: blankLair promoted to the first-class §3.1 entity,
 * campaign.lairs[] collection, the 5 lookups + lairInhabitantCount, the migrateLegacyHexLairs lift
 * (legacy nested hex.lairs[] → first-class), entity-registry + field-schema registration, and the
 * demo's 3 monster-Groups bound as Lairs. Pool-first encounters / generation are M3+.
 *
 * M1 = the lifecycle setters (createLair / clearLair / discoverLair / abandonLair / destroyLair /
 * revealDynamicLair, each idempotent + history-stamped) and the D4 terrain-keyed hex-density seeding
 * (LAIRS_PER_HEX, JJ p.69 — lairDiceForTerrain / rollLairCount / seedHexLairs; the COUNT only, which
 * is catalog-free). The manual Lair Wizard is browser-verified (index.html).
 */
'use strict';
const path = require('path');
const DIR = path.join(__dirname, '..');
[
  'acks-engine-catalogs.js', 'acks-engine-monsters.js', 'acks-engine.js', 'acks-engine-entities.js', 'acks-engine-economy.js',
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
// ===== M1: lifecycle setters =================================================
// =============================================================================
section('M1 createLair — author into campaign.lairs[] + history stamp');
{
  const c = ACKS.blankCampaign({ name: 'create' }); c.currentTurn = 5;
  const l = ACKS.createLair(c, { name: 'Spider Hollow', monsterCatalogKey: 'giant-spider', status: 'active' });
  ok('createLair returns the lair', l && /^lai-/.test(l.id));
  ok('createLair pushes into campaign.lairs', c.lairs.length === 1 && c.lairs[0] === l);
  ok('createLair defaults establishedAtTurn to currentTurn', l.establishedAtTurn === 5);
  ok('createLair stamps a created history entry', l.history.length === 1 && l.history[0].type === 'created');
  ok('createLair honours opts', l.name === 'Spider Hollow' && l.monsterCatalogKey === 'giant-spider');
  ok('createLair defensive on null campaign', ACKS.createLair(null, {}) === null);
}

section('M1 clearLair / abandonLair / destroyLair — status transitions + idempotent + history');
{
  const c = ACKS.blankCampaign({ name: 'transitions' }); c.currentTurn = 7;
  c.lairs = [
    ACKS.blankLair({ id: 'lai-c', status: 'active', hexId: 'hex-1' }),
    ACKS.blankLair({ id: 'lai-a', status: 'active', hexId: 'hex-1' }),
    ACKS.blankLair({ id: 'lai-d', status: 'active', hexId: 'hex-1' }),
  ];
  // clearLair
  const cl = ACKS.clearLair(c, 'lai-c', { byEventId: 'evt-9', reason: 'party raid' });
  ok('clearLair flips to cleared', cl.status === 'cleared');
  ok('clearLair stamps clearedAtTurn (currentTurn)', cl.clearedAtTurn === 7);
  ok('clearLair records byEventId', cl.clearedByEventId === 'evt-9');
  ok('clearLair stamps history (type cleared + byEventId)', cl.history.some(h => h.type === 'cleared' && h.byEventId === 'evt-9'));
  const histLen = cl.history.length;
  ACKS.clearLair(c, 'lai-c');  // idempotent
  ok('clearLair idempotent — no second history entry', cl.history.length === histLen && cl.status === 'cleared');
  // abandonLair
  const ab = ACKS.abandonLair(c, 'lai-a', { atTurn: 3, reason: 'depleted hunting' });
  ok('abandonLair flips to abandoned', ab.status === 'abandoned');
  ok('abandonLair honours atTurn in history', ab.history.some(h => h.type === 'abandoned' && h.turn === 3));
  ACKS.abandonLair(c, 'lai-a');
  ok('abandonLair idempotent', ab.history.filter(h => h.type === 'abandoned').length === 1);
  // destroyLair
  const de = ACKS.destroyLair(c, 'lai-d');
  ok('destroyLair flips to destroyed', de.status === 'destroyed');
  ok('destroyLair stamps history', de.history.some(h => h.type === 'destroyed'));
  // defensive
  ok('transitions on missing id → null', ACKS.clearLair(c, 'lai-none') === null && ACKS.abandonLair(c, 'lai-none') === null && ACKS.destroyLair(c, 'lai-none') === null);
}

section('M1 discoverLair — knownToPlayers + discoveryHistory + first/revisit');
{
  const c = ACKS.blankCampaign({ name: 'discover' }); c.currentTurn = 2;
  c.lairs = [ ACKS.blankLair({ id: 'lai-1', status: 'active', hexId: 'hex-1', knownToPlayers: false }) ];
  const d = ACKS.discoverLair(c, 'lai-1', { by: 'party-1', method: 'hex-search' });
  ok('discoverLair sets knownToPlayers', d.knownToPlayers === true);
  ok('discoverLair sets lastVisitedTurn', d.lastVisitedTurn === 2);
  ok('discoverLair appends discoveryHistory', d.discoveryHistory.length === 1 && d.discoveryHistory[0].by === 'party-1' && d.discoveryHistory[0].method === 'hex-search');
  ok('discoverLair first time → history type discovered', d.history.some(h => h.type === 'discovered'));
  c.currentTurn = 6;
  ACKS.discoverLair(c, 'lai-1', { by: 'party-1' });
  ok('discoverLair second time → revisited + still known', d.history.some(h => h.type === 'revisited') && d.knownToPlayers === true);
  ok('discoverLair re-visit appends discoveryHistory + refreshes lastVisitedTurn', d.discoveryHistory.length === 2 && d.lastVisitedTurn === 6);
  ok('discoverLair on missing id → null', ACKS.discoverLair(c, 'lai-none') === null);
}

section('M1 revealDynamicLair — dynamic pool → placed active');
{
  const c = ACKS.blankCampaign({ name: 'reveal' }); c.currentTurn = 9;
  c.lairs = [
    ACKS.blankLair({ id: 'lai-dyn', status: 'dynamic', hexId: null, monsterCatalogKey: 'ogre' }),
    ACKS.blankLair({ id: 'lai-act', status: 'active', hexId: 'hex-1' }),
  ];
  const r = ACKS.revealDynamicLair(c, 'lai-dyn', 'hex-7', { knownToPlayers: true });
  ok('reveal binds hexId', r.hexId === 'hex-7');
  ok('reveal flips dynamic → active', r.status === 'active');
  ok('reveal sets establishedBy dynamic-reveal', r.establishedBy === 'dynamic-reveal');
  ok('reveal sets establishedAtTurn', r.establishedAtTurn === 9);
  ok('reveal honours knownToPlayers', r.knownToPlayers === true);
  ok('reveal stamps history (revealed + hexId)', r.history.some(h => h.type === 'revealed' && h.hexId === 'hex-7'));
  ok('reveal now appears in lairsAtHex + activeLairs', ACKS.lairsAtHex(c, 'hex-7').length === 1 && ACKS.activeLairs(c).length === 2);
  // refuses a non-dynamic lair (returns it unchanged)
  const no = ACKS.revealDynamicLair(c, 'lai-act', 'hex-9');
  ok('reveal refuses a non-dynamic lair (unchanged)', no.status === 'active' && no.hexId === 'hex-1');
  ok('reveal on missing id / no hex → null', ACKS.revealDynamicLair(c, 'lai-none', 'hex-1') === null && ACKS.revealDynamicLair(c, 'lai-dyn', null) === null);
}

// =============================================================================
// ===== M1: D4 hex-density seeding (Lairs per Hex, JJ p.69) ===================
// =============================================================================
section('M1 LAIRS_PER_HEX table — RAW values (JJ p.69)');
{
  const T = ACKS.LAIRS_PER_HEX;
  ok('20 keys (10 base + finer sub-keys)', Object.keys(T).length === 20);
  const eq = (k, n, d, m) => T[k] && T[k].n === n && T[k].d === d && T[k].mod === m;
  ok('forest 2d4', eq('forest', 2, 4, 0));
  ok('jungle 2d8', eq('jungle', 2, 8, 0));
  ok('swamp 2d4+1', eq('swamp', 2, 4, 1));
  ok('barrens 1d4', eq('barrens', 1, 4, 0));
  ok('grassland-steppe 1d3−1', eq('grassland-steppe', 1, 3, -1));
  ok('hills-forested 2d4 vs hills(rocky) 1d4', eq('hills-forested', 2, 4, 0) && eq('hills', 1, 4, 0));
  ok('mountains default rocky/snowy 1d4+1', eq('mountains', 1, 4, 1) && eq('mountains-forested', 2, 4, 0));
  ok('desert default sandy 1d4 vs rocky 1d2', eq('desert', 1, 4, 0) && eq('desert-rocky', 1, 2, 0));
  ok('scrubland default low 1d2 vs dense 2d4', eq('scrubland', 1, 2, 0) && eq('scrubland-dense', 2, 4, 0));
  ok('water 0 (no land lairs)', eq('water', 0, 0, 0));
  ok('lairDiceLabel formats', ACKS.lairDiceLabel(T.forest) === '2d4' && ACKS.lairDiceLabel(T['grassland-steppe']) === '1d3−1' && ACKS.lairDiceLabel(T.mountains) === '1d4+1' && ACKS.lairDiceLabel(T.water) === '—');
}

section('M1 lairDiceForTerrain — base / alias / finer sub-key / water / unknown');
{
  ok('forest → 2d4', ACKS.lairDiceForTerrain('forest').label === '2d4');
  ok('alias plains → grassland 1d3', ACKS.lairDiceForTerrain('plains').key === 'grassland' && ACKS.lairDiceForTerrain('plains').label === '1d3');
  ok('alias steppe → grassland-steppe 1d3−1', ACKS.lairDiceForTerrain('steppe').key === 'grassland-steppe');
  ok('alias marsh → swamp', ACKS.lairDiceForTerrain('marsh').key === 'swamp');
  ok('finer key hills-forested honoured', ACKS.lairDiceForTerrain('hills-forested').label === '2d4');
  ok('case-insensitive + trim', ACKS.lairDiceForTerrain('  Forest ').label === '2d4');
  ok('water → zero spec', ACKS.lairDiceForTerrain('water').spec.n === 0);
  ok('unknown terrain → null', ACKS.lairDiceForTerrain('tundra') === null);
  ok('empty → null', ACKS.lairDiceForTerrain('') === null && ACKS.lairDiceForTerrain(null) === null);
}

section('M1 rollLairCount — roll, mod, clamp, seeded determinism');
{
  const lo = () => 0.0;    // min die face (1)
  const hi = () => 0.999;  // max die face (= d)
  ok('forest 2d4 min = 2', ACKS.rollLairCount({ n: 2, d: 4, mod: 0 }, lo) === 2);
  ok('forest 2d4 max = 8', ACKS.rollLairCount({ n: 2, d: 4, mod: 0 }, hi) === 8);
  ok('mod +1 applied (1d4+1 max = 5)', ACKS.rollLairCount({ n: 1, d: 4, mod: 1 }, hi) === 5);
  ok('steppe 1d3−1 can be 0 (clamped, not −0)', ACKS.rollLairCount({ n: 1, d: 3, mod: -1 }, lo) === 0);
  ok('steppe 1d3−1 max = 2', ACKS.rollLairCount({ n: 1, d: 3, mod: -1 }, hi) === 2);
  ok('zero spec (water) → 0', ACKS.rollLairCount({ n: 0, d: 0, mod: 0 }, hi) === 0);
  // seeded determinism: same rng sequence → same total
  const seq = () => { let i = 0; const v = [0.1, 0.9, 0.5]; return () => v[i++ % v.length]; };
  ok('deterministic under a fixed rng', ACKS.rollLairCount({ n: 3, d: 6, mod: 0 }, seq()) === ACKS.rollLairCount({ n: 3, d: 6, mod: 0 }, seq()));
}

section('M1 seedHexLairs — D4 opt-in seeding (unsettled hexes only)');
{
  const c = ACKS.blankCampaign({ name: 'seed' }); c.currentTurn = 1;
  c.hexes = [
    ACKS.blankHex({ id: 'hex-wild', terrain: 'forest' }),                  // unsettled (no domainId)
    Object.assign(ACKS.blankHex({ id: 'hex-dom', terrain: 'forest' }), { domainId: 'dom-1' }), // settled (domainId is backfilled by liftToTopLevelCollections in-app)
    ACKS.blankHex({ id: 'hex-odd', terrain: 'tundra' }),                    // unknown terrain
    ACKS.blankHex({ id: 'hex-sea', terrain: 'water' }),                     // open water → 0
  ];
  // count override → exact N empty shells
  const seeded = ACKS.seedHexLairs(c, 'hex-wild', { count: 3 });
  ok('seeds the requested count', seeded.length === 3 && c.lairs.length === 3);
  ok('seeded lairs are status:unknown', seeded.every(l => l.status === 'unknown'));
  ok('seeded lairs establishedBy hex-seeding', seeded.every(l => l.establishedBy === 'hex-seeding'));
  ok('seeded lairs bound to the hex + terrain', seeded.every(l => l.hexId === 'hex-wild' && l.terrain === 'forest'));
  ok('seeded lairs have a created history entry', seeded.every(l => l.history.some(h => h.type === 'created')));
  ok('seeded lairs land in campaign.lairs', ACKS.lairsAtHex(c, 'hex-wild').length === 3);
  // RAW: settled (domain) hexes seed none, unless forced
  ok('domain hex seeds none', ACKS.seedHexLairs(c, 'hex-dom', { count: 2 }).length === 0);
  ok('domain hex with force seeds', ACKS.seedHexLairs(c, 'hex-dom', { count: 2, force: true }).length === 2);
  // unknown terrain + open water + missing hex
  ok('unknown terrain → []', ACKS.seedHexLairs(c, 'hex-odd', { count: 2 }).length === 0);
  ok('open water → [] (0 spec, even with rng)', ACKS.seedHexLairs(c, 'hex-sea', {}).length === 0);
  ok('missing hex → []', ACKS.seedHexLairs(c, 'hex-none', { count: 2 }).length === 0);
  // rng path (no count override): forest 2d4 with a min-rng → exactly 2
  const c2 = ACKS.blankCampaign({ name: 'seed2' });
  c2.hexes = [ ACKS.blankHex({ id: 'hex-f', terrain: 'forest' }) ];
  ok('rng path seeds the rolled count (forest 2d4, min-rng = 2)', ACKS.seedHexLairs(c2, 'hex-f', { rng: () => 0.0 }).length === 2);
}

// =============================================================================
section('M2 MONSTER_CATALOG — module loaded + shape');
{
  const cat = ACKS.MONSTER_CATALOG;
  ok('MONSTER_CATALOG is a non-trivial array', Array.isArray(cat) && cat.length >= 200, 'len=' + (cat && cat.length));
  const RAW_TYPES = ['animal', 'beastman', 'construct', 'enchanted-creature', 'giant', 'humanoid', 'incarnation', 'monstrosity', 'ooze', 'plant', 'undead', 'vermin'];
  ok('every entry has a non-empty key + name', cat.every(m => m.key && m.name));
  ok('keys are unique', new Set(cat.map(m => m.key)).size === cat.length);
  ok('every entry cites an MM page (number)', cat.every(m => typeof m.page === 'number' && m.page >= 9));
  ok('every entry has ≥1 creatureType, all from the 12 RAW types', cat.every(m => m.creatureTypes.length && m.creatureTypes.every(t => RAW_TYPES.includes(t))));
  ok('every entry has hd (string) + ac (number)', cat.every(m => typeof m.hd === 'string' && m.hd && typeof m.ac === 'number'));
  ok('lairPct is 0..100 on every entry', cat.every(m => typeof m.lairPct === 'number' && m.lairPct >= 0 && m.lairPct <= 100));
  ok('alignment is Lawful/Neutral/Chaotic on every entry', cat.every(m => /^(Lawful|Neutral|Chaotic)(\/(Lawful|Neutral|Chaotic))*$/.test(m.alignment)));
  ok('xp is a number on every entry', cat.every(m => typeof m.xp === 'number'));
  ok('numberAppearing has wandering+lair dice strings', cat.every(m => m.numberAppearing && typeof m.numberAppearing.wandering === 'string'));
  ok('canTrack is boolean; ≥1 tracker exists', cat.every(m => typeof m.canTrack === 'boolean') && cat.some(m => m.canTrack));
}

section('M2 catalog lookups');
{
  ok('findMonster(orc) → Orc (HD 1, lair 35%, TT G, Chaotic)', (() => { const m = ACKS.findMonster('orc'); return m && m.name === 'Orc' && m.hd === '1' && m.lairPct === 35 && m.treasureType === 'G' && m.alignment === 'Chaotic'; })());
  ok('findMonster is case-insensitive', ACKS.findMonster('ORC') && ACKS.findMonster('ORC').key === 'orc');
  ok('findMonster(unknown) → null', ACKS.findMonster('definitely-not-a-monster') === null);
  ok('findMonster(null) → null', ACKS.findMonster(null) === null);
  ok('alias giant-spider → giant-crab-spider', ACKS.findMonster('giant-spider') && ACKS.findMonster('giant-spider').key === 'giant-crab-spider');
  ok('alias lizardfolk → lizardman', ACKS.findMonster('lizardfolk') && ACKS.findMonster('lizardfolk').key === 'lizardman');
  ok('monstersByType(beastman) non-empty + all are beastmen', (() => { const ms = ACKS.monstersByType('beastman'); return ms.length >= 4 && ms.every(m => m.creatureTypes.includes('beastman')); })());
  ok('isCatalogMonster(orc)=true / (xyzzy)=false', ACKS.isCatalogMonster('orc') === true && ACKS.isCatalogMonster('xyzzy') === false);
  ok('monsterCanTrack(dire-wolf)=true', ACKS.monsterCanTrack('dire-wolf') === true);
  ok('monsterDisplayName resolves key + falls back', ACKS.monsterDisplayName('orc') === 'Orc' && ACKS.monsterDisplayName('xyzzy') === 'xyzzy');
}

section('M2 demo monster keys resolve');
{
  // The demo + Frontier Barony templates reference these keys; M3 generation needs them resolvable.
  for (const k of ['dire-wolf', 'lizardman', 'giant-spider', 'goblin']) {
    ok('demo key resolves: ' + k, !!ACKS.findMonster(k), 'findMonster returned null');
  }
  ok('lizardman fixup applied (TT J, Chaotic)', (() => { const m = ACKS.findMonster('lizardman'); return m && m.treasureType === 'J' && m.alignment === 'Chaotic'; })());
}

// =============================================================================
section('M3 _rollDiceStr — XdY±Z roller');
{
  ok('plain integer', ACKS._rollDiceStr('3') === 3 && ACKS._rollDiceStr('1') === 1);
  ok('XdY in range (1d10 over 200 rolls)', (() => { for (let i = 0; i < 200; i++) { const v = ACKS._rollDiceStr('1d10'); if (v < 1 || v > 10) return false; } return true; })());
  ok('NdY+M honoured (2d4+1 ∈ [3,9])', (() => { for (let i = 0; i < 200; i++) { const v = ACKS._rollDiceStr('2d4+1'); if (v < 3 || v > 9) return false; } return true; })());
  ok('seeded determinism', (() => { const mk = () => { let s = 7; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }; return ACKS._rollDiceStr('3d6', mk()) === ACKS._rollDiceStr('3d6', mk()); })());
  ok('garbage → 0', ACKS._rollDiceStr('') === 0 && ACKS._rollDiceStr(null) === 0);
}

section('M3 generateLair — catalog-gated generation (Plan §5.3)');
{
  const c = ACKS.blankCampaign({ name: 'gen' });
  c.hexes = [ACKS.blankHex({ id: 'hex-1', terrain: 'hills' })];
  const res = ACKS.generateLair(c, { monsterCatalogKey: 'orc', hexId: 'hex-1', establishedBy: 'dynamic-reveal' });
  ok('returns {lair, group, entry, count}', res && res.lair && res.group && res.entry && res.count >= 1);
  ok('lair lands in campaign.lairs, status active, on the hex', c.lairs.length === 1 && res.lair.status === 'active' && res.lair.hexId === 'hex-1');
  ok('lair records catalog identity (key/lairPct/TT from catalog)', res.lair.monsterCatalogKey === 'orc' && res.lair.lairPct === 35 && res.lair.treasureType === 'G');
  ok('a Group is created in campaign.groups + bound to the lair', c.groups.length === 1 && res.lair.groupIds.length === 1 && res.lair.groupIds[0] === res.group.id);
  ok('Group template carries catalog stats', res.group.groupTemplate.monsterCatalogKey === 'orc' && res.group.groupTemplate.hitDice === '1' && res.group.groupTemplate.creatureTypes.includes('beastman'));
  ok('Group count = rolled population (≥1) at the lair hex; wild/independent', res.group.count >= 1 && res.group.currentHexId === 'hex-1' && res.group.lifecycleState === 'wild');
  ok('totalInhabitantCount derived', res.lair.totalInhabitantCount === ACKS.lairInhabitantCount(c, res.lair));
  ok('history stamps a generated entry', res.lair.history.some(h => h.type === 'generated'));
  ok('count override honoured', ACKS.generateLair(c, { monsterCatalogKey: 'goblin', hexId: 'hex-1', count: 7 }).group.count === 7);

  // populate an existing 'unknown' seeded shell
  const shell = ACKS.createLair(c, { hexId: 'hex-1', status: 'unknown', establishedBy: 'hex-seeding' });
  const r2 = ACKS.generateLair(c, { lairId: shell.id, monsterCatalogKey: 'kobold' });
  ok('populate existing shell → same lair, now active + populated', r2.lair.id === shell.id && r2.lair.status === 'active' && r2.lair.monsterCatalogKey === 'kobold' && r2.group && r2.lair.groupIds.length >= 1);

  // reveal-then-generate a dynamic pool lair
  const dyn = ACKS.createLair(c, { status: 'dynamic', hexId: null, monsterCatalogKey: 'gnoll' });
  ACKS.revealDynamicLair(c, dyn.id, 'hex-1');
  const r3 = ACKS.generateLair(c, { lairId: dyn.id, monsterCatalogKey: 'gnoll' });
  ok('reveal+generate a dynamic lair populates it', r3.lair.status === 'active' && r3.lair.hexId === 'hex-1' && r3.group && r3.group.groupTemplate.monsterCatalogKey === 'gnoll');

  // alias key resolves through generation
  const r4 = ACKS.generateLair(c, { monsterCatalogKey: 'giant-spider', hexId: 'hex-1' });
  ok('alias key generates (giant-spider → giant-crab-spider)', r4.group && r4.lair.monsterCatalogKey === 'giant-crab-spider');

  // unknown key → bare lair shell, no group
  const r5 = ACKS.generateLair(c, { monsterCatalogKey: 'no-such-monster', hexId: 'hex-1' });
  ok('unknown key → lair shell returned, no group/entry', r5.lair && r5.entry === null && r5.group === null && r5.count === 0);
}

// =============================================================================
section('M3 lairEncounterProposal — pool-first selector (Plan §5.2, D5)');
{
  const c = ACKS.blankCampaign({ name: 'pool' });
  c.hexes = [ACKS.blankHex({ id: 'hex-1', terrain: 'hills' }), ACKS.blankHex({ id: 'hex-2', terrain: 'forest' })];
  ok('empty hex → source fresh', ACKS.lairEncounterProposal(c, 'hex-1').source === 'fresh');
  ACKS.generateLair(c, { monsterCatalogKey: 'orc', hexId: 'hex-1' });
  const p = ACKS.lairEncounterProposal(c, 'hex-1');
  ok('hex with an active lair → existing-lair + contents (D5)', p.source === 'existing-lair' && p.lairId && p.contents.monsterCatalogKey === 'orc' && p.contents.totalInhabitantCount >= 1);
  // a cleared lair must NOT be selected (only active)
  ACKS.clearLair(c, p.lairId);
  ok('cleared lair → falls through to fresh', ACKS.lairEncounterProposal(c, 'hex-1').source === 'fresh');
  // ≥2 active lairs at one hex → picks one (pure, rng-driven)
  ACKS.generateLair(c, { monsterCatalogKey: 'goblin', hexId: 'hex-2' });
  ACKS.generateLair(c, { monsterCatalogKey: 'kobold', hexId: 'hex-2' });
  const multi = ACKS.lairEncounterProposal(c, 'hex-2', { rng: () => 0.9 });
  ok('≥2 active lairs → picks one existing-lair', multi.source === 'existing-lair' && ACKS.lairsAtHex(c, 'hex-2').filter(l => l.status === 'active').length === 2);
  // dynamic pool
  const c2 = ACKS.blankCampaign({ name: 'dyn' });
  ACKS.createLair(c2, { status: 'dynamic', hexId: null, monsterCatalogKey: 'ogre' });
  ok('no hex lair but a pooled dynamic lair → dynamic-pool candidates', ACKS.lairEncounterProposal(c2, 'hex-x').source === 'dynamic-pool' && ACKS.lairEncounterProposal(c2, 'hex-x').candidates.length === 1);
  ok('includeDynamicPool:false → fresh (reveal is a GM decision)', ACKS.lairEncounterProposal(c2, 'hex-x', { includeDynamicPool: false }).source === 'fresh');
}

section('M3 journey rollEncounter is pool-aware (D5)');
{
  const c = ACKS.blankCampaign({ name: 'enc' });
  c.hexes = [ACKS.blankHex({ id: 'hex-1', terrain: 'hills' }), ACKS.blankHex({ id: 'hex-2', terrain: 'forest' })];
  ACKS.generateLair(c, { monsterCatalogKey: 'orc', hexId: 'hex-1' });
  const force = () => 0.0; // 0 < 1/6 → encounter always fires
  const r1 = ACKS.rollEncounter(c, { id: 'jrn-1', name: 'Caravan', currentHexId: 'hex-1' }, { rng: force, hasRoad: false, hexId: 'hex-1' });
  ok('encounter at a lair hex → notable references the lair (lairId + name)', r1 && r1.notableEvent.payload.lairId && /orc lair/i.test(r1.notableEvent.label));
  ok('encounterRecord carries lairId + the lair groups', r1.encounterRecord.lairId && r1.encounterRecord.monsters.length >= 1);
  const r2 = ACKS.rollEncounter(c, { id: 'jrn-2', name: 'Caravan', currentHexId: 'hex-2' }, { rng: force, hasRoad: false, hexId: 'hex-2' });
  ok('encounter at an empty hex → generic stub (no lairId)', r2 && r2.notableEvent.payload.lairId === null && /encounter check/.test(r2.notableEvent.label));
  ok('roads stay safe (no encounter)', ACKS.rollEncounter(c, { id: 'jrn-3', name: 'Caravan', currentHexId: 'hex-1' }, { rng: force, hasRoad: true, hexId: 'hex-1' }) === null);
}

// =============================================================================
section('Fixes — seeded shells in the pool, group fates, reveal sync, shell naming');
{
  // (1) seeded 'unknown' shells AT the hex surface as populate candidates (D4→D5, Plan §4/§5.2.3)
  const c = ACKS.blankCampaign({ name: 'shellpool' });
  c.hexes = [ACKS.blankHex({ id: 'hex-s', terrain: 'mountains' })];
  ACKS.seedHexLairs(c, 'hex-s', { count: 3 });
  const p = ACKS.lairEncounterProposal(c, 'hex-s');
  ok('hex with only seeded shells → seeded-shell candidates', p.source === 'seeded-shell' && p.candidates.length === 3);
  ok('includeSeededShells:false → falls through to fresh', ACKS.lairEncounterProposal(c, 'hex-s', { includeSeededShells: false, includeDynamicPool: false }).source === 'fresh');
  ACKS.generateLair(c, { monsterCatalogKey: 'orc', hexId: 'hex-s' });
  ok('an active lair outranks the shells', ACKS.lairEncounterProposal(c, 'hex-s').source === 'existing-lair');
  // the journey encounter surfaces the shells (not a generic stub)
  const cJ = ACKS.blankCampaign({ name: 'shellenc' });
  cJ.hexes = [ACKS.blankHex({ id: 'hex-t', terrain: 'forest' })];
  ACKS.seedHexLairs(cJ, 'hex-t', { count: 2 });
  const enc = ACKS.rollEncounter(cJ, { id: 'jrn-s', name: 'Scouts', currentHexId: 'hex-t' }, { rng: () => 0.0, hasRoad: false, hexId: 'hex-t' });
  ok('journey encounter at a seeded hex names the shells', enc && /unauthored lair/.test(enc.notableEvent.label) && (enc.notableEvent.payload.seededShellLairIds || []).length === 2);
  ok('shell encounter carries no lairId yet (GM picks which shell)', enc.encounterRecord.lairId === null);

  // (2) clearLair wipes bound Groups so groupsAtHex agrees with the status
  const c2 = ACKS.blankCampaign({ name: 'clearfate' });
  c2.hexes = [ACKS.blankHex({ id: 'hex-c', terrain: 'hills' })];
  const gen = ACKS.generateLair(c2, { monsterCatalogKey: 'orc', hexId: 'hex-c' });
  ACKS.clearLair(c2, gen.lair.id);
  ok('clearLair → bound group takes full casualties', ACKS.groupActiveCount(gen.group) === 0);
  ok('clearLair → lairInhabitantCount agrees (0)', ACKS.lairInhabitantCount(c2, gen.lair) === 0 && gen.lair.totalInhabitantCount === 0);
  const gen2 = ACKS.generateLair(c2, { monsterCatalogKey: 'goblin', hexId: 'hex-c' });
  ACKS.clearLair(c2, gen2.lair.id, { leaveGroups: true });
  ok('clearLair leaveGroups:true → group untouched (GM narrates survivors)', ACKS.groupActiveCount(gen2.group) > 0);

  // (2b) destroyLair on a live lair wipes; abandonLair departs alive (hexless, counts kept)
  const c3 = ACKS.blankCampaign({ name: 'fates' });
  c3.hexes = [ACKS.blankHex({ id: 'hex-f', terrain: 'forest' })];
  const g3 = ACKS.generateLair(c3, { monsterCatalogKey: 'kobold', hexId: 'hex-f' });
  ACKS.destroyLair(c3, g3.lair.id);
  ok('destroyLair on an active lair → group perishes', ACKS.groupActiveCount(g3.group) === 0);
  const g4 = ACKS.generateLair(c3, { monsterCatalogKey: 'orc', hexId: 'hex-f' });
  ACKS.abandonLair(c3, g4.lair.id);
  ok('abandonLair → group departs alive (currentHexId null, count kept)', g4.group.currentHexId === null && ACKS.groupActiveCount(g4.group) > 0);

  // (3) a populated dynamic lair STAYS pooled until reveal; reveal binds the population to the hex
  const c4 = ACKS.blankCampaign({ name: 'revealsync' });
  c4.hexes = [ACKS.blankHex({ id: 'hex-r', terrain: 'hills' })];
  const dyn = ACKS.createLair(c4, { status: 'dynamic', hexId: null });
  const gend = ACKS.generateLair(c4, { lairId: dyn.id, monsterCatalogKey: 'ogre' });
  ok('populate a dynamic lair → stays dynamic + unplaced (pre-rolled drop-in)', dyn.status === 'dynamic' && dyn.hexId === null && gend.group.currentHexId === null);
  ok('a populated dynamic lair is still a dynamic-pool candidate', ACKS.lairEncounterProposal(c4, 'hex-r').source === 'dynamic-pool');
  ACKS.revealDynamicLair(c4, dyn.id, 'hex-r');
  ok('revealDynamicLair binds the bound group to the hex', gend.group.currentHexId === 'hex-r' && dyn.status === 'active');
  ok('after reveal the hex pool serves the lair', ACKS.lairEncounterProposal(c4, 'hex-r').source === 'existing-lair');

  // (4) a populated seeded shell gets the fresh-path default name; a GM-set name is never clobbered
  const c5 = ACKS.blankCampaign({ name: 'shellname' });
  c5.hexes = [ACKS.blankHex({ id: 'hex-n', terrain: 'hills' })];
  const shells = ACKS.seedHexLairs(c5, 'hex-n', { count: 2 });
  ACKS.generateLair(c5, { lairId: shells[0].id, monsterCatalogKey: 'orc' });
  ok('populated shell gets a default name', shells[0].name === 'Orc lair');
  shells[1].name = 'The Howling Caves';
  ACKS.generateLair(c5, { lairId: shells[1].id, monsterCatalogKey: 'common-wolf' });
  ok('a GM-set shell name is preserved', shells[1].name === 'The Howling Caves');
}

// =============================================================================
// A sequenced rng for draw-order-sensitive cases: yields the given values in order,
// then repeats the last one.
const seq = (...vals) => { let i = 0; return () => (i < vals.length ? vals[i++] : vals[vals.length - 1]); };

section('M4 wildernessSearchTargetForSpeed — the RR p.276 table');
{
  ok('≤11 mi → 18+', ACKS.wildernessSearchTargetForSpeed(11) === 18 && ACKS.wildernessSearchTargetForSpeed(0) === 18);
  ok('12–23 mi → 17+', ACKS.wildernessSearchTargetForSpeed(12) === 17 && ACKS.wildernessSearchTargetForSpeed(23) === 17);
  ok('32 mi → 16+ (the RAW worked example)', ACKS.wildernessSearchTargetForSpeed(32) === 16);
  ok('180–191 mi → 3+', ACKS.wildernessSearchTargetForSpeed(180) === 3 && ACKS.wildernessSearchTargetForSpeed(191) === 3);
  ok('≥192 mi → 2+ (floor)', ACKS.wildernessSearchTargetForSpeed(192) === 2 && ACKS.wildernessSearchTargetForSpeed(500) === 2);
}

section('M4 hexSecuringBlockers — live lairs block securing (RR p.338)');
{
  const c = ACKS.blankCampaign({ name: 'secure' });
  c.hexes = [ACKS.blankHex({ id: 'hex-b', terrain: 'hills' })];
  const a = ACKS.createLair(c, { status: 'active', hexId: 'hex-b' });
  const u = ACKS.createLair(c, { status: 'unknown', hexId: 'hex-b' });
  ACKS.createLair(c, { status: 'dynamic', hexId: null });
  ok('active + unknown block', ACKS.hexSecuringBlockers(c, 'hex-b').length === 2);
  ACKS.clearLair(c, a.id);
  ok('a cleared lair stops blocking', ACKS.hexSecuringBlockers(c, 'hex-b').length === 1);
  ACKS.destroyLair(c, u.id);
  ok('a destroyed shell stops blocking', ACKS.hexSecuringBlockers(c, 'hex-b').length === 0);
}

section('M4 lair-vs-wandering — the MM p.15 Lair % split in the proposal');
{
  const c = ACKS.blankCampaign({ name: 'split' });
  c.hexes = [ACKS.blankHex({ id: 'hex-w', terrain: 'hills' })];
  const gen = ACKS.generateLair(c, { monsterCatalogKey: 'orc', hexId: 'hex-w' });   // lairPct 35 from the catalog
  // one lair → first rng draw is the d100. 0.0 → 1 ≤ 35 → at-lair.
  const atHome = ACKS.lairEncounterProposal(c, 'hex-w', { rng: seq(0.0) });
  ok('d100 ≤ lairPct → at-lair', atHome.encounterKind === 'at-lair' && atHome.fragment === null);
  // 0.99 → 100 > 35 → wandering fragment, count capped at the living population.
  const frag = ACKS.lairEncounterProposal(c, 'hex-w', { rng: seq(0.99, 0.99) });
  ok('d100 > lairPct → wandering-fragment with a count', frag.encounterKind === 'wandering-fragment' && frag.fragment && frag.fragment.count >= 1);
  ok('fragment never outnumbers the lair\'s living population', frag.fragment.count <= ACKS.lairInhabitantCount(c, gen.lair));
  // a GM lairPct:100 pin → always at home
  gen.lair.lairPct = 100;
  ok('lairPct 100 → always at-lair', ACKS.lairEncounterProposal(c, 'hex-w', { rng: seq(0.99) }).encounterKind === 'at-lair');
  // a bare GM-authored lair with a catalog monster falls back to the CATALOG's pct
  const c2 = ACKS.blankCampaign({ name: 'fallback' });
  c2.hexes = [ACKS.blankHex({ id: 'hex-f', terrain: 'hills' })];
  ACKS.createLair(c2, { status: 'active', hexId: 'hex-f', monsterCatalogKey: 'orc' });   // no lairPct on the lair
  ok('lairPct falls back to the catalog (fragment possible)', ACKS.lairEncounterProposal(c2, 'hex-f', { rng: seq(0.99, 0.5) }).encounterKind === 'wandering-fragment');
  // no catalog key + no pct → the pre-M4 behaviour (at-lair)
  const c3 = ACKS.blankCampaign({ name: 'bare' });
  c3.hexes = [ACKS.blankHex({ id: 'hex-x', terrain: 'hills' })];
  ACKS.createLair(c3, { status: 'active', hexId: 'hex-x' });
  ok('no usable pct → at-lair (back-compat)', ACKS.lairEncounterProposal(c3, 'hex-x', { rng: seq(0.99) }).encounterKind === 'at-lair');
  // the journey encounter labels a fragment + carries encounterKind
  const enc = ACKS.rollEncounter(c, (gen.lair.lairPct = 35, { id: 'jrn-w', name: 'Scouts', currentHexId: 'hex-w' }), { rng: seq(0.0, 0.5, 0.99, 0.5), hasRoad: false, hexId: 'hex-w' });
  ok('journey fragment encounter labelled + tagged', enc && enc.notableEvent.payload.encounterKind === 'wandering-fragment' && /out from an unlocated lair/.test(enc.notableEvent.label));
}

section('M4 hexSearchActivity — the Wilderness Search hour (RR pp.276–277)');
{
  const c = ACKS.blankCampaign({ name: 'search' });
  c.hexes = [ACKS.blankHex({ id: 'hex-s', terrain: 'hills' })];
  const ch = ACKS.blankCharacter({ name: 'Scout' }); ch.currentHexId = 'hex-s';
  c.characters.push(ch);
  const lair = ACKS.createLair(c, { status: 'active', hexId: 'hex-s', name: 'Hidden Den' });
  // unencumbered 24 mi × hills 2/3 = 16 mi → target 17 (RR table)
  const r1 = ACKS.hexSearchActivity(c, { actorCharacterId: ch.id, rng: seq(0.9, 0.0, 0.99) });   // d20 19 ≥ 17 → found
  ok('successful throw finds the undiscovered lair', r1.ok && r1.success && r1.found && r1.found.id === lair.id);
  ok('target derives from expedition speed × terrain (16 mi → 17+)', r1.target === 17 && Math.round(r1.speedMilesPerDay) === 16);
  ok('discovery flips knownToPlayers + stamps discoveryHistory', lair.knownToPlayers === true && lair.discoveryHistory.length === 1 && lair.discoveryHistory[0].method === 'search');
  const log = c.eventLog.map(e => e.event);
  ok('hex-search event logged, campaignLogHidden, with the ancillary cost tag', log.some(e => e.kind === 'hex-search' && e.campaignLogHidden === true && e.payload.activityCost && e.payload.activityCost.kind === 'search-hex'));
  ok('lair-discovered event logged (chronicle-visible, parented on the search)', log.some(e => e.kind === 'lair-discovered' && !e.campaignLogHidden && e.payload.lairId === lair.id && e.parentEventId));
  ok('the #346 budget counts the search hour as 1 ancillary', (function(){
    const b = ACKS.characterActivityBudget(c, ch.id);
    return b && b.ancillary.some(a => /Search/.test(a.label || '')) && b.ancillaryUsed >= 1;
  })());
  // a second search finds nothing (everything known) but the throw still records
  const r2 = ACKS.hexSearchActivity(c, { actorCharacterId: ch.id, rng: seq(0.9, 0.99) });
  ok('nothing left to find → success without a find', r2.success && !r2.found);
  // nat-1 always fails — even vs a trivial target
  const r3 = ACKS.hexSearchActivity(c, { actorCharacterId: ch.id, rng: seq(0.0, 0.99) });
  ok('an unmodified 1 always fails', !r3.success && r3.rolled === 1);
  // Tracking on a cohort member → +4 (RR p.276); specific POI → −4
  ch.proficiencies = ['Tracking'];
  const r4 = ACKS.hexSearchActivity(c, { actorCharacterId: ch.id, specific: true, rng: seq(0.9, 0.99) });
  ok('+4 Tracking / −4 specific are applied', r4.bonus === 4 && r4.mod === -4);
  // hiddenDC raises that lair\'s bar only
  const c5 = ACKS.blankCampaign({ name: 'hidden' });
  c5.hexes = [ACKS.blankHex({ id: 'hex-h', terrain: 'hills' })];
  const ch5 = ACKS.blankCharacter({ name: 'Seeker' }); ch5.currentHexId = 'hex-h'; c5.characters.push(ch5);
  ACKS.createLair(c5, { status: 'unknown', hexId: 'hex-h', hiddenDC: 10 });
  const r5 = ACKS.hexSearchActivity(c5, { actorCharacterId: ch5.id, rng: seq(0.9, 0.99) });   // 19 ≥ 17 but < 27
  ok('a well-hidden lair (hiddenDC) survives an ordinary success', r5.success && !r5.found);
  // the per-hour encounter check fires pool-first ("stumble onto it by way of a random encounter")
  const r6 = ACKS.hexSearchActivity(c, { actorCharacterId: ch.id, rng: seq(0.0, 0.0, 0.0) });   // d20 1 (fail), enc hit, d100 1 → at-lair
  ok('a failed search can still stumble into the lair via the encounter roll', !r6.success && r6.encounter && r6.encounter.lairId === lair.id);
  // Land Surveying assessment (RR p.277)
  const ch6 = ACKS.blankCharacter({ name: 'Surveyor' }); ch6.currentHexId = 'hex-s'; ch6.proficiencies = ['Land Surveying'];
  c.characters.push(ch6);
  const r7 = ACKS.hexSearchActivity(c, { actorCharacterId: ch6.id, rng: seq(0.9, 0.99, 0.95) });   // d20 19 (no find left), no enc, survey 20 ≥ 18
  ok('Land Surveying assesses the true POI count', r7.survey && r7.survey.assessed && !r7.survey.falseReading && r7.survey.count === 1);
  const r8 = ACKS.hexSearchActivity(c, { actorCharacterId: ch6.id, rng: seq(0.9, 0.99, 0.0, 0.9, 0.9) });   // survey nat-1 → false reading
  ok('a survey nat-1 yields a false reading', r8.survey && r8.survey.falseReading && r8.survey.count !== 1);
  ok('guards: unknown actor / no hex', ACKS.hexSearchActivity(c, { actorCharacterId: 'chr-none' }).ok === false
    && ACKS.hexSearchActivity(c, { actorCharacterId: (c.characters.push(ACKS.blankCharacter({ name: 'Nowhere' })), c.characters[c.characters.length-1].id) }).ok === false);
}

section('M4 trackHomeAttempt — Tracking follows a fragment home (RR p.120)');
{
  const c = ACKS.blankCampaign({ name: 'track' });
  c.hexes = [ACKS.blankHex({ id: 'hex-t', terrain: 'forest' })];
  const gen = ACKS.generateLair(c, { monsterCatalogKey: 'orc', hexId: 'hex-t' });
  gen.lair.knownToPlayers = false;
  const ch = ACKS.blankCharacter({ name: 'Hound' }); ch.currentHexId = 'hex-t'; c.characters.push(ch);
  ok('no Tracking → refused', ACKS.trackHomeAttempt(c, { actorCharacterId: ch.id, lairId: gen.lair.id }).error === 'no-tracking');
  ch.proficiencies = ['Tracking', 'Tracking'];   // 2 ranks → +4 to the track throw
  const r = ACKS.trackHomeAttempt(c, { actorCharacterId: ch.id, lairId: gen.lair.id, countTracked: 6, rng: seq(0.45) });   // d20 10 +4 ranks +4 count = 18 ≥ 11
  ok('ranks (+4/extra) + count-tracked band (+4 at 5–8) apply', r.ok && r.bonus === 8 && r.success);
  ok('success discovers the lair (method tracking) + emits lair-discovered', gen.lair.knownToPlayers === true
    && gen.lair.discoveryHistory.some(d => d.method === 'tracking')
    && c.eventLog.some(e => e.event.kind === 'lair-discovered' && e.event.payload.method === 'track-home'));
  ok('an already-known lair → refused', ACKS.trackHomeAttempt(c, { actorCharacterId: ch.id, lairId: gen.lair.id }).error === 'already-known');
  // nat-1 fails regardless of bonuses
  const gen2 = ACKS.generateLair(c, { monsterCatalogKey: 'goblin', hexId: 'hex-t' });
  const r2 = ACKS.trackHomeAttempt(c, { actorCharacterId: ch.id, lairId: gen2.lair.id, countTracked: 20, rng: seq(0.0) });
  ok('an unmodified 1 fails the track', r2.ok && !r2.success && r2.rolled === 1);
}

// =============================================================================
console.log('\n— Summary');
console.log('  Passed: ' + pass);
console.log('  Failed: ' + fail);
if (fail) { console.log('FAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
