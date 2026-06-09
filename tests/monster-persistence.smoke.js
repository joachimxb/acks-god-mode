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
console.log('\n— Summary');
console.log('  Passed: ' + pass);
console.log('  Failed: ' + fail);
if (fail) { console.log('FAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
