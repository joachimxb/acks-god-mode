// =============================================================================
// delves.smoke.js — Delves D2 (the Dungeon + Delve entities) + D3 (the Abstract Dungeon
// foray resolver — JJ ch.12) + D4 (Abstract Wilderness — JJ ch.13) + D5 (the off-screen
// Settlement layer — JJ ch.3: the SettlementVisit + the urban-incident generator + the
// holed-up day-consumer + diseases/casualties via the shipped CL-2 + Delves-D1). Phase 3.5.
// Covers: the dun- (registered) / dlv- (new) prefixes; the blankDungeon (RECONCILED shape,
// Data_Dictionary §13.2 — both facets, single status axis, arcane reserved-null) + blankDelve
// factories; the derived overlays dungeonLifecycleLabel (Q1: attuned > owned > stored status)
// + dungeonEncountersRemaining (Q2: authored count vs living-lair count); the lookups; the
// entity-registry kinds (🕳️ Dungeon / ⛏ Delve — no 🏯 clash) + displayName + schema⊆factory
// invariants; and the load-bearing guard — every shipped template + the demo STAY migrate-
// no-ops (D2 added NOTHING to migrateCampaign; campaign.delves is read defensively, not injected).
// =============================================================================
const fs = require('fs');
const path = require('path');
global.window = global;
require('./_engine.js').load();
const ACKS = global.ACKS;
const REPO = path.join(__dirname, '..');

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('\n--- ' + t + ' ---'); }
const clone = o => JSON.parse(JSON.stringify(o));
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

// =============================================================================
section('ID prefixes (dun- registered · dlv- new)');
// =============================================================================
ok('ID_PREFIXES.dungeon === "dun" (registered since 2026-05-30)', ACKS.ID_PREFIXES.dungeon === 'dun');
ok('ID_PREFIXES.delve === "dlv" (added this lane)', ACKS.ID_PREFIXES.delve === 'dlv');

// =============================================================================
section('blankDungeon — exists + base/lifecycle defaults (the reconciled shape)');
// =============================================================================
ok('blankDungeon is a function', typeof ACKS.blankDungeon === 'function');
const d0 = ACKS.blankDungeon();
ok('blankDungeon id has dun- prefix', /^dun-/.test(d0.id));
ok('blankDungeon schemaVersion 2', d0.schemaVersion === 2);
ok('blankDungeon stores NO entity-kind field (registry carries it — blankLair precedent)', !('kind' in d0));
ok('default name ""', d0.name === '');
ok('default hexId null', d0.hexId === null);
ok('default precisePlacement ""', d0.precisePlacement === '');
ok('default domainId null', d0.domainId === null);
ok('default origin "found"', d0.origin === 'found');
ok('default ownerCharacterId null', d0.ownerCharacterId === null);
ok('default knownToPlayers false', d0.knownToPlayers === false);
ok('default status "known"', d0.status === 'known');
ok('default establishedAtTurn 1', d0.establishedAtTurn === 1);
ok('default history []', Array.isArray(d0.history) && d0.history.length === 0);
ok('default notes ""', d0.notes === '');

// The SINGLE status axis (Q1) — owned/attuned are NOT stored values here.
section('Q1 — single status axis; owned + attuned NOT stored (derived)');
ok('blankDungeon has NO stored attunedCharacterId (derived — §3.3)', !('attunedCharacterId' in d0));
ok('blankDungeon has NO stored attunementIds[] (reverse-index rule)', !('attunementIds' in d0));
(function(){
  // Setting a non-status value via status would be a mis-use; the canonical set excludes owned/attuned.
  const STORED = ['undiscovered','known','being-cleared','cleared','sealed','abandoned','destroyed'];
  ok('owned NOT in the stored status set', !STORED.includes('owned'));
  ok('attuned NOT in the stored status set', !STORED.includes('attuned'));
})();

// =============================================================================
section('blankDungeon — delve-target facet (active; Phase 3.5)');
// =============================================================================
ok('default size "small"', d0.size === 'small');
ok('default dungeonLevel 1', d0.dungeonLevel === 1);
ok('default encountersTotal 0', d0.encountersTotal === 0);
ok('default encountersRemaining 0', d0.encountersRemaining === 0);
ok('encountersRemaining defaults to encountersTotal', ACKS.blankDungeon({ encountersTotal: 7 }).encountersRemaining === 7);
ok('encountersRemaining explicit overrides', ACKS.blankDungeon({ encountersTotal: 7, encountersRemaining: 3 }).encountersRemaining === 3);
ok('default encountersCleared 0', d0.encountersCleared === 0);
ok('default sizeKnown true', d0.sizeKnown === true);
ok('default levelKnown true', d0.levelKnown === true);
ok('sizeKnown:false honored', ACKS.blankDungeon({ sizeKnown: false }).sizeKnown === false);
ok('default multiLevel false', d0.multiLevel === false);
ok('default parentDungeonId null', d0.parentDungeonId === null);
ok('default restockDie null', d0.restockDie === null);
ok('default lastForayAtDayInMonth null', d0.lastForayAtDayInMonth === null);
ok('default lastForayAtTurn null', d0.lastForayAtTurn === null);
ok('opts carried (name/size/level/hexId)', (function(){ const d=ACKS.blankDungeon({ name:'Ruined Fort', size:'large', dungeonLevel:4, hexId:'hex-1' }); return d.name==='Ruined Fort' && d.size==='large' && d.dungeonLevel===4 && d.hexId==='hex-1'; })());

// =============================================================================
section('blankDungeon — arcane facet (reserved-null until Phase 4 Sanctums AD-A)');
// =============================================================================
ok('levels reserved null', d0.levels === null);
ok('areaSqFtPerLevel reserved []', Array.isArray(d0.areaSqFtPerLevel) && d0.areaSqFtPerLevel.length === 0);
ok('areaCount reserved null', d0.areaCount === null);
ok('builtByProjectId reserved null', d0.builtByProjectId === null);
ok('buildValueGp reserved null', d0.buildValueGp === null);
ok('currentShp reserved null', d0.currentShp === null);
ok('maxShp reserved null', d0.maxShp === null);
ok('treasureSeededGp reserved null', d0.treasureSeededGp === null);
ok('isFull reserved false', d0.isFull === false);
ok('sovereignCharacterId reserved null', d0.sovereignCharacterId === null);
ok('subjugatedGroupIds reserved []', Array.isArray(d0.subjugatedGroupIds) && d0.subjugatedGroupIds.length === 0);
ok('subjugatedLeaderCharacterIds reserved []', Array.isArray(d0.subjugatedLeaderCharacterIds) && d0.subjugatedLeaderCharacterIds.length === 0);
ok('arcanePowerThisMonth reserved null', d0.arcanePowerThisMonth === null);
ok('arcanePowerSpentThisMonth reserved null', d0.arcanePowerSpentThisMonth === null);
ok('monsterGarrisonHired reserved null', d0.monsterGarrisonHired === null);
ok('stockedEncounterIds reserved []', Array.isArray(d0.stockedEncounterIds) && d0.stockedEncounterIds.length === 0);

// =============================================================================
section('blankDelve — exists + defaults + opts (mirrors blankJourney)');
// =============================================================================
ok('blankDelve is a function', typeof ACKS.blankDelve === 'function');
const dl0 = ACKS.blankDelve();
ok('blankDelve id has dlv- prefix', /^dlv-/.test(dl0.id));
ok('blankDelve schemaVersion 2', dl0.schemaVersion === 2);
ok('blankDelve stores NO entity-kind field', !('kind' in dl0));
ok('default name ""', dl0.name === '');
ok('default dungeonId null', dl0.dungeonId === null);
ok('default partyId null', dl0.partyId === null);
ok('default participantCharacterIds []', Array.isArray(dl0.participantCharacterIds) && dl0.participantCharacterIds.length === 0);
ok('default status "in-progress"', dl0.status === 'in-progress');
ok('default foraysResolved []', Array.isArray(dl0.foraysResolved) && dl0.foraysResolved.length === 0);
ok('default runningEncountersCleared 0', dl0.runningEncountersCleared === 0);
ok('default runningTreasureGp 0', dl0.runningTreasureGp === 0);
ok('default runningXp 0', dl0.runningXp === 0);
ok('default casualtyCharacterIds []', Array.isArray(dl0.casualtyCharacterIds) && dl0.casualtyCharacterIds.length === 0);
ok('default magicItemRollsPending 0', dl0.magicItemRollsPending === 0);
ok('default isHenchmanDelve false', dl0.isHenchmanDelve === false);
ok('default startedAtTurn null', dl0.startedAtTurn === null);
ok('default startedAtDayInMonth null', dl0.startedAtDayInMonth === null);
ok('default history []', Array.isArray(dl0.history));
ok('opts carried (dungeonId/participants)', (function(){ const dl=ACKS.blankDelve({ dungeonId:'dun-x', participantCharacterIds:['chr-a','chr-b'] }); return dl.dungeonId==='dun-x' && dl.participantCharacterIds.length===2; })());

// =============================================================================
section('Lookups (defensive)');
// =============================================================================
(function(){
  const c = ACKS.blankCampaign({ name: 'Lookups' });
  c.dungeons = [];
  const da = ACKS.blankDungeon({ id:'dun-a', name:'Cave A', hexId:'hex-1', domainId:'dom-1' });
  const db = ACKS.blankDungeon({ id:'dun-b', name:'Cave B', hexId:'hex-1', domainId:'dom-2' });
  const dc = ACKS.blankDungeon({ id:'dun-c', name:'Cave C', hexId:'hex-2' });
  c.dungeons.push(da, db, dc);
  c.delves = [];
  const dlA = ACKS.blankDelve({ id:'dlv-1', dungeonId:'dun-a', status:'in-progress' });
  const dlB = ACKS.blankDelve({ id:'dlv-2', dungeonId:'dun-a', status:'cleared' });
  c.delves.push(dlA, dlB);

  ok('findDungeon by id', ACKS.findDungeon(c, 'dun-b') === db);
  ok('findDungeon missing → null', ACKS.findDungeon(c, 'dun-none') === null);
  ok('findDelve by id', ACKS.findDelve(c, 'dlv-2') === dlB);
  ok('dungeonsAtHex hex-1 → 2', ACKS.dungeonsAtHex(c, 'hex-1').length === 2);
  ok('dungeonsAtHex hex-2 → 1', ACKS.dungeonsAtHex(c, 'hex-2').length === 1);
  ok('dungeonsInDomain dom-1 → [dun-a]', ACKS.dungeonsInDomain(c, 'dom-1').length === 1 && ACKS.dungeonsInDomain(c, 'dom-1')[0] === da);
  ok('delvesForDungeon dun-a → 2', ACKS.delvesForDungeon(c, 'dun-a').length === 2);
  ok('activeDelves → only in-progress (dlv-1)', ACKS.activeDelves(c).length === 1 && ACKS.activeDelves(c)[0] === dlA);

  // defensive: missing collections / args
  const bare = ACKS.blankCampaign({ name: 'Bare' });
  ok('findDungeon on a campaign without dungeons[] → null (no throw)', ACKS.findDungeon(bare, 'dun-x') === null);
  ok('findDelve on a campaign without delves[] → null (no throw)', ACKS.findDelve(bare, 'dlv-x') === null);
  ok('delvesForDungeon with no delves[] → [] (no throw)', Array.isArray(ACKS.delvesForDungeon(bare, 'dun-a')) && ACKS.delvesForDungeon(bare, 'dun-a').length === 0);
})();

// =============================================================================
section('Q1 — dungeonLifecycleLabel overlay (attuned > owned > stored status)');
// =============================================================================
(function(){
  const c = ACKS.blankCampaign({ name: 'Lifecycle' });
  c.dungeons = []; c.attunements = [];
  const d = ACKS.blankDungeon({ id:'dun-l', status:'known' });
  c.dungeons.push(d);

  ok('stored status "known" → "Known"', ACKS.dungeonLifecycleLabel(c, d) === 'Known');
  d.status = 'cleared';
  ok('stored status "cleared" → "Cleared"', ACKS.dungeonLifecycleLabel(c, d) === 'Cleared');
  d.status = 'being-cleared';
  ok('stored status "being-cleared" → "Being Cleared"', ACKS.dungeonLifecycleLabel(c, d) === 'Being Cleared');

  // owned overlays the stored status
  d.status = 'cleared'; d.ownerCharacterId = 'chr-owner';
  ok('owned (ownerCharacterId set) → "Owned" (overlays status)', ACKS.dungeonLifecycleLabel(c, d) === 'Owned');
  ok('dungeonIsOwned true', ACKS.dungeonIsOwned(c, d) === true);

  // attuned overlays owned
  c.attunements.push({ id:'att-1', dungeonId:'dun-l', mageCharacterId:'chr-mage', status:'active' });
  ok('attuned (active attunement) → "Attuned" (overlays owned)', ACKS.dungeonLifecycleLabel(c, d) === 'Attuned');
  ok('dungeonIsAttuned true', ACKS.dungeonIsAttuned(c, d) === true);
  ok('dungeonActiveAttunement returns the relation', ACKS.dungeonActiveAttunement(c, d).id === 'att-1');
  ok('dungeonAttunedCharacterId is DERIVED (= mageCharacterId)', ACKS.dungeonAttunedCharacterId(c, d) === 'chr-mage');

  // a non-active attunement does not count
  c.attunements[0].status = 'relinquished';
  ok('relinquished attunement no longer counts → back to "Owned"', ACKS.dungeonLifecycleLabel(c, d) === 'Owned');
  ok('dungeonIsAttuned false once relinquished', ACKS.dungeonIsAttuned(c, d) === false);
  ok('dungeonAttunedCharacterId null once relinquished', ACKS.dungeonAttunedCharacterId(c, d) === null);

  // status-absent attunement counts as active (status == null)
  c.attunements[0].status = null;
  ok('attunement with status null counts as active', ACKS.dungeonIsAttuned(c, d) === true);

  // un-owned, un-attuned bare dungeon shows its status
  const bare = ACKS.blankDungeon({ id:'dun-bare', status:'undiscovered' });
  c.dungeons.push(bare);
  ok('bare undiscovered → "Undiscovered"', ACKS.dungeonLifecycleLabel(c, bare) === 'Undiscovered');
  ok('dungeonLifecycleLabel(null) → ""', ACKS.dungeonLifecycleLabel(c, null) === '');
})();

// =============================================================================
section('Q2 — dungeonEncountersRemaining (authored count vs living-lair count)');
// =============================================================================
(function(){
  const c = ACKS.blankCampaign({ name: 'Encounters' });
  c.dungeons = []; c.lairs = [];

  // abstract-only dungeon: no anchored lairs → authored encountersRemaining
  const abstract = ACKS.blankDungeon({ id:'dun-abs', encountersTotal:6, encountersRemaining:4 });
  c.dungeons.push(abstract);
  ok('abstract dungeon → authored encountersRemaining (4)', ACKS.dungeonEncountersRemaining(c, abstract) === 4);
  ok('abstract dungeon is NOT stocked', ACKS.dungeonIsStocked(c, abstract) === false);
  ok('lairsInDungeon(abstract) → []', ACKS.lairsInDungeon(c, abstract).length === 0);

  // stocked dungeon: anchored lairs → living-lair count (active + unknown; cleared/abandoned/destroyed vacant).
  // lair.dungeonId is the FORWARD anchor Phase 4 Sanctums sets when it stocks a dungeon (not a blankLair
  // field yet — blankLair drops the unknown opt), so set it explicitly here, the way stocking will.
  const stocked = ACKS.blankDungeon({ id:'dun-stk', encountersTotal:9, encountersRemaining:9 });
  c.dungeons.push(stocked);
  const mkLair = (id, status, dungeonId) => { const l = ACKS.blankLair({ id, status }); l.dungeonId = dungeonId; return l; };
  c.lairs.push(
    mkLair('lai-1', 'active',    'dun-stk'),
    mkLair('lai-2', 'unknown',   'dun-stk'),
    mkLair('lai-3', 'cleared',   'dun-stk'),     // vacant — not counted
    mkLair('lai-4', 'destroyed', 'dun-stk'),     // vacant — not counted
    mkLair('lai-5', 'active',    'dun-other')    // different dungeon — not counted
  );
  ok('stocked dungeon IS stocked', ACKS.dungeonIsStocked(c, stocked) === true);
  ok('lairsInDungeon(stocked) → 4 anchored (by dungeonId)', ACKS.lairsInDungeon(c, stocked).length === 4);
  ok('stocked → living-lair count (active+unknown = 2), authored 9 IGNORED', ACKS.dungeonEncountersRemaining(c, stocked) === 2);

  // clearing a living lair drops the derived count
  c.lairs[0].status = 'cleared';
  ok('after a living lair clears → derived count drops to 1', ACKS.dungeonEncountersRemaining(c, stocked) === 1);

  // accepts an id too
  ok('dungeonEncountersRemaining accepts a dungeon id', ACKS.dungeonEncountersRemaining(c, 'dun-abs') === 4);
  // defensive
  ok('dungeonEncountersRemaining(null) → 0', ACKS.dungeonEncountersRemaining(c, null) === 0);
})();

// =============================================================================
section('Entity registry — dungeon (🕳️) + delve (⛏) kinds; no 🏯 clash');
// =============================================================================
ok('registry has dungeon kind', !!ACKS.entityKind('dungeon'));
ok('registry has delve kind', !!ACKS.entityKind('delve'));
ok('dungeon icon 🕳️ (NOT 🏯 — clashes with siege/stronghold-component)', ACKS.entityIcon('dungeon') === '🕳️' && ACKS.entityIcon('dungeon') !== '🏯');
ok('delve icon ⛏', ACKS.entityIcon('delve') === '⛏');
ok('dungeon label "Dungeon"', ACKS.entityLabel('dungeon') === 'Dungeon');
ok('delve label "Delve"', ACKS.entityLabel('delve') === 'Delve');
ok('dungeon plural "Dungeons"', ACKS.entityPluralLabel('dungeon') === 'Dungeons');
ok('delve plural "Delves"', ACKS.entityPluralLabel('delve') === 'Delves');
(function(){
  const c = ACKS.blankCampaign({ name: 'Registry' });
  c.dungeons = [ ACKS.blankDungeon({ id:'dun-r', name:'The Deeps' }) ];
  c.delves = [ ACKS.blankDelve({ id:'dlv-r', name:'Clear the Deeps' }) ];
  ok('listEntities("dungeon") returns the dungeon', ACKS.listEntities(c, 'dungeon').length === 1);
  ok('listEntities("delve") returns the delve', ACKS.listEntities(c, 'delve').length === 1);
  ok('findEntity("dungeon", id)', ACKS.findEntity(c, 'dungeon', 'dun-r').name === 'The Deeps');
  ok('findEntity("delve", id)', ACKS.findEntity(c, 'delve', 'dlv-r').name === 'Clear the Deeps');
  ok('entityDisplayName dungeon → name', ACKS.entityDisplayName(c, 'dungeon', 'dun-r') === 'The Deeps');
  ok('entityDisplayName delve → name', ACKS.entityDisplayName(c, 'delve', 'dlv-r') === 'Clear the Deeps');
  // displayName ⊆ factory keys (the registry⊆factory invariant — reads only name/id)
  const dunBlank = ACKS.blankDungeon({});
  const dlvBlank = ACKS.blankDelve({});
  ok('dungeon displayName reads only factory keys (name/id)', ('name' in dunBlank) && ('id' in dunBlank));
  ok('delve displayName reads only factory keys (name/id)', ('name' in dlvBlank) && ('id' in dlvBlank));
})();

// =============================================================================
section('Field schemas — dungeon + delve (schema ⊆ factory invariant)');
// =============================================================================
(function(){
  const dunSchema = ACKS.fieldSchemaFor('dungeon');
  const dlvSchema = ACKS.fieldSchemaFor('delve');
  ok('dungeon schema exists', !!dunSchema && dunSchema.factory === 'blankDungeon');
  ok('delve schema exists', !!dlvSchema && dlvSchema.factory === 'blankDelve');
  ok('dungeon schema adminCreate schemaForm', dunSchema.adminCreate === 'schemaForm');
  ok('delve schema adminCreate schemaForm', dlvSchema.adminCreate === 'schemaForm');
  ok('dungeon schema validates clean', ACKS.validateFieldSchema('dungeon', dunSchema).ok);
  ok('delve schema validates clean', ACKS.validateFieldSchema('delve', dlvSchema).ok);
  // schema ⊆ factory (every top-level field is a factory key) — the global drift guard, focused
  function subsetCheck(kind, schema, factoryName){
    const blank = ACKS[factoryName]({});
    const keys = new Set(Object.keys(blank));
    const extras = (schema.fields || []).map(f => f.name).filter(n => !keys.has(n));
    ok(kind + ' schema fields ⊆ ' + factoryName + ' keys', extras.length === 0, 'extras: [' + extras.join(', ') + ']');
  }
  subsetCheck('dungeon', dunSchema, 'blankDungeon');
  subsetCheck('delve', dlvSchema, 'blankDelve');
  // validateAllSchemas is still clean overall (no error introduced by the two new schemas)
  ok('validateAllSchemas() reports no errors', ACKS.validateAllSchemas().length === 0, ACKS.validateAllSchemas().join(' | '));
})();

// =============================================================================
section('D2 GUARD — templates + demo STAY migrate-no-ops (no dungeon/delve lazy-inject)');
// =============================================================================
// D2 added blankDungeon/blankDelve to a NEW module + the dlv- prefix + registry/schema/importer
// entries. It did NOT add anything to migrateCampaign: campaign.dungeons[] was already lazy-
// defaulted (M0); campaign.delves[] is read DEFENSIVELY (not injected). So every shipped template
// + the demo must still be a TRUE migrate-no-op, and migrate must NOT add a delves[] array.
require(path.join(REPO, 'acks-demo-template.js'));
const DEMO = global.ACKS_DEMO_TEMPLATE;
ok('demo template loaded', DEMO && DEMO.kind === 'campaign');
ok('migrate(demo) is a TRUE no-op (JSON-identical)', JSON.stringify(ACKS.migrateCampaign(clone(DEMO))) === JSON.stringify(clone(DEMO)));
ok('migrate did NOT inject campaign.delves on the demo', !('delves' in ACKS.migrateCampaign(clone(DEMO))));
(function(){
  const dir = path.join(REPO, 'Templates');
  let templateFiles = [];
  try { templateFiles = fs.readdirSync(dir).filter(f => f.endsWith('.acks.json')); } catch(_){}
  ok('found shipped templates to check', templateFiles.length === 6, 'found ' + templateFiles.length);
  for(const f of templateFiles){
    let raw;
    try { raw = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')); } catch(e){ ok('template parses: ' + f, false, e.message); continue; }
    const migrated = ACKS.migrateCampaign(clone(raw));
    ok('template is a TRUE migrate-no-op: ' + f, JSON.stringify(migrated) === JSON.stringify(raw));
    ok('template did NOT gain campaign.delves: ' + f, ('delves' in raw) === ('delves' in migrated));
  }
})();

// =============================================================================
// D3 — Abstract Dungeon foray resolver (JJ ch.12). Locked against the four worked examples.
// =============================================================================
// A deterministic rng: dispenses the supplied 0..1 values in order, then 0.5 forever.
// rFor(k, sides) is the value that yields roll k on _rollOne (floor(r*sides)+1) — the midpoint.
function rngOf(vals){ let i = 0; return () => (i < vals.length ? vals[i++] : 0.5); }
const rFor = (k, sides) => (k - 0.5) / sides;

section('D3 — exports + catalogs present');
['partyLevelFor','partySizeBonus','encountersAttemptedModifier','baseResolutionModifier','dungeonResolutionBand',
 'dungeonForayResolutionModifier','rollDungeonEncounters','resolveDungeonForay','commitDungeonForay','realizeDelve',
 'restockDungeon','rollRandomDungeon','startDelve'].forEach(fn => ok('ACKS.' + fn + ' is a function', typeof ACKS[fn] === 'function'));
ok('ENCOUNTERS_BY_DUNGEON_SIZE small 1d3', ACKS.ENCOUNTERS_BY_DUNGEON_SIZE.small === '1d3' && ACKS.ENCOUNTERS_BY_DUNGEON_SIZE.mega === '10d6');
ok('DUNGEON_RESTOCK_DIE medium 2d3-4', ACKS.DUNGEON_RESTOCK_DIE.medium === '2d3-4');
ok('TREASURE_XP D1 = {90,360}', ACKS.TREASURE_XP_BY_DUNGEON_LEVEL[1].xp === 90 && ACKS.TREASURE_XP_BY_DUNGEON_LEVEL[1].gp === 360);
ok('TREASURE_XP D6 = {4795,19180}', ACKS.TREASURE_XP_BY_DUNGEON_LEVEL[6].xp === 4795 && ACKS.TREASURE_XP_BY_DUNGEON_LEVEL[6].gp === 19180);
ok('DUNGEON_MAGIC_ITEMS D1 1000/D', ACKS.DUNGEON_MAGIC_ITEMS[1].gpPerRoll === 1000 && ACKS.DUNGEON_MAGIC_ITEMS[1].type === 'D');
ok('DUNGEON_DIFFICULTY_BANDS = [-8..8]', JSON.stringify(ACKS.DUNGEON_DIFFICULTY_BANDS) === JSON.stringify([-8,-4,-2,0,2,4,8]));

section('D3 — partyLevelFor (JJ p.275 worked examples)');
(function(){
  const c = ACKS.blankCampaign({ name:'PL' });
  const mk = (id, level) => ({ id, name:id, level });
  c.characters = [ mk('a',4), mk('b',3), mk('cc',4), mk('d',2),  // the Claws of the Lioness
                   mk('m',9),                                     // Moruvai alone
                   mk('m1',14), mk('m2',14), mk('m3',14), mk('m4',14) ];
  ok('Claws (4,3,4,2)/4 = 3.25 → 3', ACKS.partyLevelFor(c, ['a','b','cc','d']) === 3);
  ok('Moruvai alone (9)/4 = 2.25 → 2', ACKS.partyLevelFor(c, ['m']) === 2);
  ok('single 14th alone (14)/4 = 3.5 → 4', ACKS.partyLevelFor(c, ['m1']) === 4);
  ok('four 14th /4 = 14', ACKS.partyLevelFor(c, ['m1','m2','m3','m4']) === 14);
  c.characters.push({id:'h1',name:'h1',level:1},{id:'h2',name:'h2',level:1},{id:'h3',name:'h3',level:1},{id:'h4',name:'h4',level:2},{id:'h5',name:'h5',level:2},{id:'h6',name:'h6',level:5});
  ok('Marcus henchmen (1,1,1,2,2,5)/6 = 2', ACKS.partyLevelFor(c, ['h1','h2','h3','h4','h5','h6']) === 2);
  ok('no participants → 0', ACKS.partyLevelFor(c, []) === 0);
})();

section('D3 — partySizeBonus + encountersAttemptedModifier (JJ p.276)');
ok('size 4 → 0', ACKS.partySizeBonus(4) === 0);
ok('size 5 → +1', ACKS.partySizeBonus(5) === 1);
ok('size 7 → +1', ACKS.partySizeBonus(7) === 1);
ok('size 8 → +2', ACKS.partySizeBonus(8) === 2);
ok('enc 1 → +1', ACKS.encountersAttemptedModifier(1) === 1);
ok('enc 2 → 0', ACKS.encountersAttemptedModifier(2) === 0);
ok('enc 5 → -1', ACKS.encountersAttemptedModifier(5) === -1);
ok('enc 8 → -2', ACKS.encountersAttemptedModifier(8) === -2);
ok('enc 11 → -3 (14th-level example)', ACKS.encountersAttemptedModifier(11) === -3);
ok('enc 12 → -3', ACKS.encountersAttemptedModifier(12) === -3);
ok('enc 13 → -4 (each additional 3)', ACKS.encountersAttemptedModifier(13) === -4);
ok('enc 16 → -5', ACKS.encountersAttemptedModifier(16) === -5);

section('D3 — baseResolutionModifier (the grid + off-table rule, JJ p.275)');
const bm = (pl, dl) => ACKS.baseResolutionModifier(pl, dl).modifier;
ok('(3,1) → +2 Easy [Claws in the Buried Temple]', bm(3,1) === 2 && ACKS.baseResolutionModifier(3,1).difficultyLabel === 'Easy');
ok('(2,1) → +2 [Marcus henchmen]', bm(2,1) === 2);
ok('(1,1) → 0 Accessible', bm(1,1) === 0);
ok('(6,1) → +8 Effortless (on-table)', bm(6,1) === 8);
ok('(14,1) → +8 off-table-right, no bonus [14th-level example]', bm(14,1) === 8 && ACKS.baseResolutionModifier(14,1).offRight === true);
ok('(1,2) → -2 Dangerous', bm(1,2) === -2);
ok('(2,5) → -8 Apocalyptic (on-table)', bm(2,5) === -8);
ok('(14,5) → +8 Effortless (single cell)', bm(14,5) === 8);
ok('(14,6) → +4 Simple (Effortless blank on D6)', bm(14,6) === 4);
ok('(3,6) → -16 off-table-left [Claws in Zahar: up 1 row, 1 col off left]', bm(3,6) === -16);
ok('(1,6) → -24 deep off-table-left', bm(1,6) === -24);

section('D3 — dungeonForayResolutionModifier (composed; the named examples)');
(function(){
  const dunD1 = ACKS.blankDungeon({ dungeonLevel:1 });
  const m1 = ACKS.dungeonForayResolutionModifier(dunD1, { partyLevel:2, attemptedEncounters:2, adventurerCount:6 });
  ok('Marcus foray 1: +2 base + 0 enc + 1 size = +3', m1.modifier === 3, 'got ' + m1.modifier);
  const m2 = ACKS.dungeonForayResolutionModifier(dunD1, { partyLevel:14, attemptedEncounters:11, adventurerCount:4 });
  ok('14th-level: +8 base + (-3) enc + 0 size = +5', m2.modifier === 5, 'got ' + m2.modifier);
  const m3 = ACKS.dungeonForayResolutionModifier(dunD1, { partyLevel:2, attemptedEncounters:1, adventurerCount:4 });
  ok('Marcus foray 2 (flat interp): +2 base + 1 enc + 0 size = +3 (RAW prose says +4 via column-shift; outcome unchanged)', m3.modifier === 3, 'got ' + m3.modifier);
  // situational mods are flat
  const m4 = ACKS.dungeonForayResolutionModifier(dunD1, { partyLevel:2, attemptedEncounters:2, adventurerCount:4, situationalKeys:['well-prepared','poorly-prepared'] });
  ok('situational +2 + (-2) nets 0 (base +2, enc 0, size 0)', m4.modifier === 2, 'got ' + m4.modifier);
})();

section('D3 — dungeonResolutionBand (JJ p.276)');
ok('2 → catastrophic', ACKS.dungeonResolutionBand(2).result === 'catastrophic');
ok('5 → dreadful', ACKS.dungeonResolutionBand(5).result === 'dreadful');
ok('8 → unsatisfactory', ACKS.dungeonResolutionBand(8).result === 'unsatisfactory');
ok('12 → indifferent', ACKS.dungeonResolutionBand(12).result === 'indifferent');
ok('16 → satisfactory', ACKS.dungeonResolutionBand(16).result === 'satisfactory');
ok('19 → excellent', ACKS.dungeonResolutionBand(19).result === 'excellent');
ok('20 → stupendous', ACKS.dungeonResolutionBand(20).result === 'stupendous');
ok('25 → stupendous', ACKS.dungeonResolutionBand(25).result === 'stupendous');
ok('catastrophic woundsDie "all", clears false', ACKS.dungeonResolutionBand(2).woundsDie === 'all' && ACKS.dungeonResolutionBand(2).clears === false);
ok('unsatisfactory treasurePct 50', ACKS.dungeonResolutionBand(8).treasurePct === 50);
ok('stupendous treasurePct 200, no wounds', ACKS.dungeonResolutionBand(20).treasurePct === 200 && ACKS.dungeonResolutionBand(20).woundsDie === 0);

section('D3 — startDelve (init-on-write; NO migrate inject)');
(function(){
  const c = ACKS.blankCampaign({ name:'Start' });
  ok('fresh campaign has no delves[] yet', !Array.isArray(c.delves) || c.delves.length === 0);
  c.dungeons = [ ACKS.blankDungeon({ id:'dun-rf', name:'Ruined Fort', size:'small', dungeonLevel:1, encountersTotal:3, encountersRemaining:3 }) ];
  const dl = ACKS.startDelve(c, { dungeonId:'dun-rf', participantCharacterIds:['x','y'], isHenchmanDelve:true });
  ok('startDelve created + registered a Delve', Array.isArray(c.delves) && c.delves.length === 1 && c.delves[0] === dl);
  ok('auto name "Delve into Ruined Fort"', dl.name === 'Delve into Ruined Fort');
  ok('status in-progress', dl.status === 'in-progress');
  ok('isHenchmanDelve carried', dl.isHenchmanDelve === true);
})();

section('D3 — the FULL Marcus ruined-fort henchman delve, end-to-end (JJ pp.277–278)');
(function(){
  const c = ACKS.blankCampaign({ name:'Marcus' });
  c.eventLog = [];
  c.currentTurn = 5; c.currentDayInMonth = 1;
  const mkH = (id, level) => ({ id, name:id, level, abilities:{ CON:10 }, hp:{ hitDice:'1d8', current:5 }, xp:0, coins:{pp:0,gp:0,ep:0,sp:0,cp:0}, lifecycleState:'active', alive:true });
  c.characters = [ mkH('h1',1), mkH('h2',1), mkH('h3',1), mkH('h4',2), mkH('h5',2), mkH('h6',5) ];
  c.dungeons = [ ACKS.blankDungeon({ id:'dun-rf', name:'Ruined Fort', size:'small', dungeonLevel:1, encountersTotal:3, encountersRemaining:3, status:'known' }) ];
  const dl = ACKS.startDelve(c, { dungeonId:'dun-rf', participantCharacterIds:['h1','h2','h3','h4','h5','h6'], isHenchmanDelve:true });

  // FORAY 1 — attempt 2 of 3. d8=1,d12=4 → 5; +3 mod → 8 = Unsatisfactory. (rest 0.5 → 1d4=3 → 2 wounded.)
  const f1 = ACKS.resolveDungeonForay(c, dl, { attemptedEncounters:2, rng: rngOf([rFor(1,8), rFor(4,12)]) });
  ok('foray1 partyLevel 2', f1.partyLevel === 2, 'got ' + f1.partyLevel);
  ok('foray1 modifier +3', f1.modifier === 3, 'got ' + f1.modifier);
  ok('foray1 roll total 8', f1.roll.total === 8, 'got ' + f1.roll.total);
  ok('foray1 result Unsatisfactory', f1.result === 'unsatisfactory');
  ok('foray1 cleared 2', f1.encountersCleared === 2);
  ok('foray1 xpGross 180 (2×90 full)', f1.xpGross === 180, 'got ' + f1.xpGross);
  ok('foray1 treasureGpGross 360 (2×360×50%)', f1.treasureGpGross === 360, 'got ' + f1.treasureGpGross);
  ok('foray1 2 casualties (1d4-1 = 2)', f1.casualtyCount === 2, 'got ' + f1.casualtyCount);
  ok('foray1 each casualty has a Mortal Wound result', f1.casualties.every(x => x.wound && x.wound.conditionLabel));
  const commit1 = ACKS.commitDungeonForay(c, dl.id, f1);
  ok('after foray1: dungeon encountersRemaining 3→1', c.dungeons[0].encountersRemaining === 1, 'got ' + c.dungeons[0].encountersRemaining);
  ok('after foray1: dungeon status being-cleared', c.dungeons[0].status === 'being-cleared');
  ok('after foray1: delve runningXp 180', dl.runningXp === 180);
  ok('after foray1: delve runningTreasureGp 360', dl.runningTreasureGp === 360);
  ok('after foray1: 2 wounded removed from participants (6→4)', dl.participantCharacterIds.length === 4, 'got ' + dl.participantCharacterIds.length);
  ok('after foray1: casualtyCharacterIds length 2', dl.casualtyCharacterIds.length === 2);
  ok('after foray1: survivors are exactly h1,h2,h5,h6 (lvls 1,1,2,5)', JSON.stringify(dl.participantCharacterIds.slice().sort()) === JSON.stringify(['h1','h2','h5','h6']));
  ok('after foray1: a delve-foray event logged', c.eventLog.some(e => e.event && e.event.kind === 'delve-foray'));
  ok('after foray1: wounded chars are incapacitated', c.characters.filter(x => x.lifecycleState === 'incapacitated').length === 2);
  ok('after foray1: foraysResolved has 1 record with eventId', dl.foraysResolved.length === 1 && !!dl.foraysResolved[0].eventId);

  // FORAY 2 — attempt the last encounter. Survivors (1,1,2,5)/4 = 2. d8=7,d12=8 → 15; +3 → 18 = Excellent.
  const f2 = ACKS.resolveDungeonForay(c, dl, { attemptedEncounters:1, rng: rngOf([rFor(7,8), rFor(8,12)]) });
  ok('foray2 partyLevel 2 (survivors)', f2.partyLevel === 2, 'got ' + f2.partyLevel);
  ok('foray2 modifier +3', f2.modifier === 3, 'got ' + f2.modifier);
  ok('foray2 result Excellent (roll 15 +3 = 18)', f2.result === 'excellent', 'got ' + f2.result + ' total ' + f2.roll.total);
  ok('foray2 cleared 1', f2.encountersCleared === 1);
  ok('foray2 xpGross 90', f2.xpGross === 90);
  ok('foray2 treasureGpGross 540 (1×360×150%)', f2.treasureGpGross === 540, 'got ' + f2.treasureGpGross);
  ok('foray2 0 casualties (1d6-5 = -1 → 0)', f2.casualtyCount === 0, 'got ' + f2.casualtyCount);
  ACKS.commitDungeonForay(c, dl.id, f2);
  ok('after foray2: dungeon cleared out (encountersRemaining 0)', c.dungeons[0].encountersRemaining === 0);
  ok('after foray2: running totals 270 XP / 900 gp', dl.runningXp === 270 && dl.runningTreasureGp === 900);

  // REALIZE — fully cleared. magic items: floor(900/1000) = 0. Henchman split: ½ → 450 gp, 135 XP.
  const real = ACKS.realizeDelve(c, dl.id, { outcome:'cleared' });
  ok('realize fullyCleared true', real.fullyCleared === true);
  ok('realize magicItemRolls 0 (900 < 1000gp/roll)', real.magicItemRolls === 0, 'got ' + real.magicItemRolls);
  ok('realize partyTreasure 450 (henchman ½ of 900)', real.partyTreasure === 450, 'got ' + real.partyTreasure);
  ok('realize partyCombatXp 135 (henchman ½ of 270)', real.partyCombatXp === 135, 'got ' + real.partyCombatXp);
  ok('realize delve status cleared', dl.status === 'cleared');
  ok('realize dungeon status cleared', c.dungeons[0].status === 'cleared');
  // disbursement via adventure-result: treasure → first survivor's purse; combat XP split among survivors.
  const h1 = c.characters.find(x => x.id === 'h1');
  ok('realize deposited 450gp into the recipient purse (adventure-result)', h1.coins.gp === 450, 'got ' + h1.coins.gp);
  ok('realize awarded combat XP to a survivor (135/4 = 33 each)', h1.xp === 33, 'got ' + h1.xp);
  ok('realize logged an adventure-result event', c.eventLog.some(e => e.event && e.event.kind === 'adventure-result'));
  ok('realize logged a delve-foray realized event', c.eventLog.some(e => e.event && e.event.kind === 'delve-foray' && e.event.payload && e.event.payload.phase === 'realized'));
})();

section('D3 — withdraw (¼ treasure, no magic items) + restock + random dungeon');
(function(){
  const c = ACKS.blankCampaign({ name:'Withdraw' });
  c.eventLog = []; c.currentTurn = 1; c.currentDayInMonth = 1;
  c.characters = [{ id:'p1', name:'p1', level:5, abilities:{CON:13}, hp:{hitDice:'1d8'}, xp:0, coins:{pp:0,gp:0,ep:0,sp:0,cp:0}, lifecycleState:'active', alive:true }];
  c.dungeons = [ ACKS.blankDungeon({ id:'dun-w', name:'Deep Vault', size:'medium', dungeonLevel:2, encountersTotal:5, encountersRemaining:5 }) ];
  const dl = ACKS.startDelve(c, { dungeonId:'dun-w', participantCharacterIds:['p1'] });
  dl.runningTreasureGp = 2000; dl.runningXp = 280;   // pretend two forays banked this
  const real = ACKS.realizeDelve(c, dl.id, { outcome:'withdrawn' });
  ok('withdraw not fullyCleared (encounters remain)', real.fullyCleared === false);
  ok('withdraw treasure ¼ of 2000 = 500', real.finalTreasure === 500, 'got ' + real.finalTreasure);
  ok('withdraw partyTreasure 500 (PC delve, no split)', real.partyTreasure === 500);
  ok('withdraw XP is FULL (280)', real.partyCombatXp === 280);
  ok('withdraw magicItemRolls 0 (not fully cleared)', real.magicItemRolls === 0);
  ok('withdraw delve status withdrawn', dl.status === 'withdrawn');

  // restock: medium 2d3-4 over 3 days. day1 (2+2=4 → 0), day2 (2+3=5 → 1), day3 (1+1=2 → -2 → 0). added 1.
  const c2 = ACKS.blankCampaign({ name:'Restock' });
  c2.dungeons = [ ACKS.blankDungeon({ id:'dun-r', size:'medium', encountersTotal:5, encountersRemaining:2 }) ];
  const rs = ACKS.restockDungeon(c2, 'dun-r', 3, { rng: rngOf([rFor(2,3),rFor(2,3), rFor(2,3),rFor(3,3), rFor(1,3),rFor(1,3)]) });
  ok('restock added 1 over 3 days [JJ p.277 example]', rs.restocked === 1, 'got ' + rs.restocked);
  ok('restock encountersRemaining 2→3', c2.dungeons[0].encountersRemaining === 3);
  ok('restock caps at encountersTotal', (function(){ const c3=ACKS.blankCampaign({name:'cap'}); c3.dungeons=[ACKS.blankDungeon({id:'dx',size:'large',encountersTotal:4,encountersRemaining:3})]; ACKS.restockDungeon(c3,'dx',10,{rng:rngOf([rFor(3,6),rFor(3,6)])}); return c3.dungeons[0].encountersRemaining <= 4; })());

  // rollRandomDungeon: lvlRoll 1 (→1), sizeRoll 1 (→small), encounters 1d3 (0.5 → 2).
  const rd = ACKS.rollRandomDungeon({ rng: rngOf([rFor(1,100), rFor(1,100)]) });
  ok('rollRandomDungeon → small D1', rd.size === 'small' && rd.dungeonLevel === 1);
  ok('rollRandomDungeon has a dun- id + encounters', /^dun-/.test(rd.id) && rd.encountersTotal >= 1);
})();

section('D3 — catastrophic wipes the delve');
(function(){
  const c = ACKS.blankCampaign({ name:'Wipe' });
  c.eventLog = []; c.currentTurn = 1; c.currentDayInMonth = 1;
  c.characters = [{id:'w1',name:'w1',level:1,abilities:{CON:9},hp:{hitDice:'1d6'},lifecycleState:'active',alive:true},{id:'w2',name:'w2',level:1,abilities:{CON:9},hp:{hitDice:'1d6'},lifecycleState:'active',alive:true}];
  c.dungeons = [ ACKS.blankDungeon({ id:'dun-x', name:'Doom', size:'small', dungeonLevel:6, encountersTotal:3, encountersRemaining:3 }) ];
  const dl = ACKS.startDelve(c, { dungeonId:'dun-x', participantCharacterIds:['w1','w2'] });
  // PL 1 (2×lvl1 /4 = 0.5 → 1... actually (1+1)/4 = 0.5 → round 1), D6 → deeply negative; force roll low → ≤2 catastrophic.
  const f = ACKS.resolveDungeonForay(c, dl, { attemptedEncounters:1, rng: rngOf([rFor(1,8), rFor(1,12)]) });
  ok('catastrophic result', f.result === 'catastrophic', 'got ' + f.result + ' (mod ' + f.modifier + ', total ' + f.roll.total + ')');
  ok('catastrophic clears 0', f.encountersCleared === 0);
  ok('catastrophic wounds ALL adventurers', f.casualtyCount === 2);
  ACKS.commitDungeonForay(c, dl.id, f);
  ok('delve status wiped', dl.status === 'wiped');
})();

// =============================================================================
// D4 — Abstract Wilderness foray resolver (JJ ch.13, pp.281–286). Locked against the JJ
// worked examples: expedition level (58/6→9, 32/6→5), the orc encounter quotient (490→-2,
// 540→-3), the two Army-Adjustment expeditions (+3 vs ML4 → 0, +24 vs ML4 → 3, +24 vs ML1 →
// +2 cap), and the scaling modifier (14 participants → 2.33 × 3 → 7 wounds). The base grid +
// the resolution bands + the magic-item table are the SAME D3 catalogs (JJ p.283 == p.275/276).
// =============================================================================
section('D4 — exports present');
['monsterLevelForXpv','expeditionLevel','expeditionScalingModifier','encounterXPV','ordinaryMonsterXpv',
 'challengeAdjustmentForQuotient','challengeAdjustment','armyAdjustment','wildernessForayDifficulty',
 'resolveWildernessForay','commitWildernessForay'].forEach(fn => ok('ACKS.' + fn + ' is a function', typeof ACKS[fn] === 'function'));
ok('MONSTER_LEVEL_TABLE has 6 bands', Array.isArray(ACKS.MONSTER_LEVEL_TABLE) && ACKS.MONSTER_LEVEL_TABLE.length === 6);

section('D4 — Monster Level table (JJ p.281)');
ok('XPV 10 → L1 / divisor 90', ACKS.monsterLevelForXpv(10).level === 1 && ACKS.monsterLevelForXpv(10).divisor === 90);
ok('XPV 15 → L1 (upper edge)', ACKS.monsterLevelForXpv(15).level === 1);
ok('XPV 20 → L2 / 140', ACKS.monsterLevelForXpv(20).level === 2 && ACKS.monsterLevelForXpv(20).divisor === 140);
ok('XPV 50 → L3 / 320', ACKS.monsterLevelForXpv(50).level === 3 && ACKS.monsterLevelForXpv(50).divisor === 320);
ok('XPV 175 → L4 / 625', ACKS.monsterLevelForXpv(175).level === 4 && ACKS.monsterLevelForXpv(175).divisor === 625);
ok('XPV 500 → L5 / 1835', ACKS.monsterLevelForXpv(500).level === 5 && ACKS.monsterLevelForXpv(500).divisor === 1835);
ok('XPV 1200 → L6 / 4795', ACKS.monsterLevelForXpv(1200).level === 6 && ACKS.monsterLevelForXpv(1200).divisor === 4795);
ok('XPV 5000 → L6', ACKS.monsterLevelForXpv(5000).level === 6);
ok('gap XPV 17 folds down → L1', ACKS.monsterLevelForXpv(17).level === 1);

section('D4 — Expedition level + scaling (JJ p.281, p.284)');
(function(){
  const ex1 = { characters: [
    {id:'a',level:6},{id:'b',level:6},{id:'c',level:6},{id:'d',level:5},{id:'e',level:4},
    {id:'f',level:4},{id:'g',level:4},{id:'h',level:4},{id:'i',level:3},{id:'j',level:3},
    {id:'k',level:3},{id:'l',level:3},{id:'m',level:3},{id:'n',level:2},{id:'o',level:2}] };
  ok('Example 1: Σ58 / 6 → 9 (round down from 9.67)', ACKS.expeditionLevel(ex1, ex1.characters.map(c=>c.id)) === 9);
  const ex2 = { characters: [{id:'p',level:10},{id:'q',level:10},{id:'r',level:6},{id:'s',level:6}] };
  ok('Example 2: Σ32 / 6 → 5 (round down from 5.33)', ACKS.expeditionLevel(ex2, ['p','q','r','s']) === 5);
  ok('empty expedition → 0', ACKS.expeditionLevel({characters:[]}, []) === 0);
  ok('scaling 14 participants → 2.33', Math.abs(ACKS.expeditionScalingModifier(14) - (14/6)) < 1e-9);
  ok('scaling example: round(3 × 14/6) = 7 wounds', Math.round(3 * ACKS.expeditionScalingModifier(14)) === 7);
  ok('scaling 6 participants → 1.0 (neutral)', ACKS.expeditionScalingModifier(6) === 1);
})();

section('D4 — Encounter XPV + Challenge Adjustment (JJ p.281)');
(function(){
  // The orc warband worked example: 35 ordinary (10) + 8 champions (15) + 1 sub-chieftain (20) = 490.
  const orc = { ordinaryXpv:10, count:35, extras:[{xp:15,count:8},{xp:20,count:1}] };
  ok('encounterXPV orc warband = 490', ACKS.encounterXPV(orc) === 490);
  ok('ordinaryMonsterXpv = 10', ACKS.ordinaryMonsterXpv(orc) === 10);
  const ca = ACKS.challengeAdjustment(orc);
  ok('orc → monster level 1, divisor 90', ca.monsterLevel === 1 && ca.divisor === 90);
  ok('orc quotient ≈ 5.44', Math.abs(ca.quotient - 490/90) < 1e-9);
  ok('orc challenge adjustment = -2 (worked example)', ca.challengeAdj === -2);
  // 540 XPV → 6.0 → -3 (the "what if more orcs" example).
  const orc540 = { ordinaryXpv:10, count:54 };
  ok('540 XPV → CA -3', ACKS.challengeAdjustment(orc540).challengeAdj === -3);
  // encounterXPV via the live catalog (orc xp:10).
  ok('encounterXPV via catalog key (10 orcs) = 100', ACKS.encounterXPV({monsterCatalogKey:'orc', count:10}) === 100);
  // Encounter Quotient bands.
  ok('quotient 0.25 → +2', ACKS.challengeAdjustmentForQuotient(0.25) === 2);
  ok('quotient 0.5 → +1', ACKS.challengeAdjustmentForQuotient(0.5) === 1);
  ok('quotient 1.0 → 0', ACKS.challengeAdjustmentForQuotient(1.0) === 0);
  ok('quotient 1.5 → 0', ACKS.challengeAdjustmentForQuotient(1.5) === 0);
  ok('quotient 1.51 → -1', ACKS.challengeAdjustmentForQuotient(1.51) === -1);
  ok('quotient 2 → -1', ACKS.challengeAdjustmentForQuotient(2) === -1);
  ok('quotient 5.44 → -2', ACKS.challengeAdjustmentForQuotient(5.44) === -2);
  ok('quotient 6 → -3', ACKS.challengeAdjustmentForQuotient(6) === -3);
})();

section('D4 — Army Adjustment (JJ p.282)');
(function(){
  // Example 1: 6 leveled chars, 90 light infantry = 3 platoon units BR 1; ML4 encounter, AL 1.
  const aa1 = ACKS.armyAdjustment({ platoonUnits:[{br:1,count:3}], maxUnits:6, monsterLevel:4, armyLevel:1 });
  ok('Ex1 rawAA = +3', aa1.rawAA === 3);
  ok('Ex1 modifiedAA = 0 (halved 3× → 0.375 → 0)', aa1.modifiedAA === 0);
  ok('Ex1 participating units = 3', aa1.participatingUnits === 3);
  // Example 2: 4 leveled chars, best 4 units of heavy cavalry BR 6; ML4, AL 1.
  const aa2 = ACKS.armyAdjustment({ platoonUnits:[{br:6,count:4}], maxUnits:4, monsterLevel:4, armyLevel:1 });
  ok('Ex2 rawAA = +24', aa2.rawAA === 24);
  ok('Ex2 modifiedAA = 3 (24 halved 3× = 3)', aa2.modifiedAA === 3);
  // Example 3: AA +24 vs a ML1 encounter (AL 1) → no halving → 24.
  const aa3 = ACKS.armyAdjustment({ platoonUnits:[{br:6,count:4}], maxUnits:4, monsterLevel:1, armyLevel:1 });
  ok('Ex3 modifiedAA = 24 (no halving, AL == ML)', aa3.modifiedAA === 24);
  // maxUnits cap: 6 units offered (BR 6,6,6,6,1,1), only 4 may participate → best 4 = 24.
  const cap = ACKS.armyAdjustment({ platoonUnits:[{br:6,count:4},{br:1,count:2}], maxUnits:4, monsterLevel:1 });
  ok('maxUnits cap keeps the best 4 (rawAA 24, not 26)', cap.rawAA === 24 && cap.participatingUnits === 4);
})();

section('D4 — foray difficulty in column space (JJ p.283)');
(function(){
  // Base reuse: the wilderness base grid is identical to the dungeon BASE_RESOLUTION_GRID.
  const w = ACKS.wildernessForayDifficulty({ expeditionLevel:3, monsterLevel:1, challengeAdj:0, modifiedArmyAdj:0 });
  const d = ACKS.baseResolutionModifier(3, 1);
  ok('base reuse: expL3 vs ML1 == baseResolutionModifier(3,1)', w.modifier === d.modifier);
  // The CA+AA contribution is capped at +2 steps (JJ p.282).
  const capped = ACKS.wildernessForayDifficulty({ expeditionLevel:1, monsterLevel:1, challengeAdj:-13, modifiedArmyAdj:24 });
  ok('CA(-13)+AA(+24) capped at +2 steps → Accessible(col3)+2 = Simple(+4)', capped.modifier === 4 && capped.combinedCA === 2);
  // Never easier than Effortless (+8).
  const eff = ACKS.wildernessForayDifficulty({ expeditionLevel:6, monsterLevel:1, challengeAdj:2, modifiedArmyAdj:0, situationalSteps:2 });
  ok('never easier than Effortless (+8)', eff.modifier === 8);
  // Off-left: a weak expedition vs a strong, negative-CA monster goes past Apocalyptic (extra -8).
  const grim = ACKS.wildernessForayDifficulty({ expeditionLevel:5, monsterLevel:4, challengeAdj:-3, modifiedArmyAdj:0 });
  ok('off-left past Apocalyptic → -16', grim.modifier === -16);
})();

section('D4 — resolve + commit pipeline');
(function(){
  function mk(){ const c = ACKS.blankCampaign({ name:'AW' }); c.eventLog = []; c.currentTurn = 1; c.currentDayInMonth = 1;
    c.characters = [
      {id:'pc',name:'Aelric',level:5,abilities:{CON:12},hp:{hitDice:'5d8'},lifecycleState:'active',alive:true},
      {id:'h1',name:'Borin',level:3,abilities:{CON:10},hp:{hitDice:'3d8'},lifecycleState:'active',alive:true,socialTier:'henchman'}];
    return c; }
  // STUPENDOUS vs a weak lair (force d8=8, d12=12 → high total). Treasure = 4 × XPV × 200%.
  let c = mk();
  c.lairs = [ ACKS.blankLair({ id:'lai-1', name:'Orc Warren', monsterCatalogKey:'orc', hexId:'hex-1', status:'active', totalInhabitantCount:2, treasureType:'G' }) ];
  let p = ACKS.resolveWildernessForay(c, { participantCharacterIds:['pc','h1'], lairId:'lai-1', rng: rngOf([rFor(8,8), rFor(12,12)]) });
  ok('lair foe is flagged isLair', p.isLair === true);
  ok('stupendous result', p.result === 'stupendous', 'got ' + p.result + ' (total ' + p.roll.total + ')');
  ok('stupendous → 0 wounds', p.totalWounds === 0 && p.casualtyCount === 0);
  ok('lair treasure = 4 × XPV(20) × 200% = 160', p.treasureGp === 160);
  ok('combat XP = encounter XPV (20)', p.combatXp === 20);
  let r = ACKS.commitWildernessForay(c, p, { participantCharacterIds:['pc','h1'], treasureDestinationCharacterId:'pc' });
  ok('commit clears the lair (Wilderness Clearing → securing)', r.lairCleared === true && c.lairs[0].status === 'cleared');
  ok('commit emits wilderness-foray', c.eventLog.some(e => e.event.kind === 'wilderness-foray'));
  ok('commit disburses via adventure-result', c.eventLog.some(e => e.event.kind === 'adventure-result'));
  ok('henchman XP = ½ share (pc 13, h1 6 from 20 / 1.5 shares)', JSON.stringify(r.xpAwarded) === JSON.stringify([{characterId:'pc',xp:13},{characterId:'h1',xp:6}]));

  // Non-lair wandering encounter → no hoard treasure (v1 simple path).
  c = mk();
  p = ACKS.resolveWildernessForay(c, { participantCharacterIds:['pc','h1'], foe:{ monsterCatalogKey:'orc', count:2 }, rng: rngOf([rFor(8,8), rFor(12,12)]) });
  ok('non-lair foe → no treasure', p.isLair === false && p.treasureGp === 0);

  // CATASTROPHIC (force d8=1, d12=1 vs a strong foe) → every participant wounded.
  c = mk();
  p = ACKS.resolveWildernessForay(c, { participantCharacterIds:['pc','h1'], foe:{ monsterCatalogKey:'orc', count:35 }, rng: rngOf([rFor(1,8), rFor(1,12)]) });
  ok('catastrophic result', p.result === 'catastrophic', 'got ' + p.result + ' (total ' + p.roll.total + ')');
  ok('catastrophic wounds all participants', p.casualtyCount === 2);
  r = ACKS.commitWildernessForay(c, p, { participantCharacterIds:['pc','h1'] });
  ok('commit applies Mortal Wounds (pc no longer active)', c.characters[0].lifecycleState !== 'active' && (c.characters[0].mortalWounds||[]).length === 1);

  // Army participation lifts participant count (units join the wound pool).
  c = mk();
  p = ACKS.resolveWildernessForay(c, { participantCharacterIds:['pc','h1'], foe:{ monsterCatalogKey:'orc', count:2 }, platoonUnits:[{br:6,count:2,armyLevel:1}], rng: rngOf([rFor(4,8), rFor(4,12)]) });
  ok('participant count = adventurers + participating units', p.participantCount === p.adventurerCount + p.army.participatingUnits);
  ok('only leveled chars ≥3rd cap the units (pc L5 + h1 L3 → ≤2 units)', p.army.participatingUnits <= 2);
})();

section('D4 — event registration');
ok("'wilderness-foray' in EVENT_KINDS", ACKS.EVENT_KINDS.includes('wilderness-foray'));
ok("'wilderness-foray' has a schema", !!(ACKS.EVENT_SCHEMAS && ACKS.EVENT_SCHEMAS['wilderness-foray']));
ok("'wilderness-foray' is Event-Wizard opt-out", ACKS.EVENT_WIZARD_OPTOUT.has('wilderness-foray'));

// =============================================================================
// D5 — the off-screen Settlement layer (JJ ch.3, the SettlementVisit + the urban-incident
// generator + the holed-up day-consumer; reuses the shipped encounter reaction/tone +
// CL-2 contractDisease + Delves-D1 mortal wounds).
// =============================================================================
function mkVisit(){
  const c = ACKS.blankCampaign({ name:'D5' }); c.eventLog = []; c.currentTurn = 5; c.currentDayInMonth = 3;
  c.settlements = [{ id:'set-sp', name:'Saltspur', hexId:'hex-1' }];
  c.characters = [
    Object.assign(ACKS.blankCharacter({ id:'chr-a', name:'Aelric' }), { abilities:{STR:12,INT:10,WIL:10,DEX:12,CON:14,CHA:13} }),
    Object.assign(ACKS.blankCharacter({ id:'chr-b', name:'Mira' }),   { abilities:{STR:10,INT:12,WIL:11,DEX:13,CON:12,CHA:9} })
  ];
  return c;
}

section('D5 — SettlementVisit entity (svt-) + registration');
ok('ID_PREFIXES.settlementVisit === "svt"', ACKS.ID_PREFIXES.settlementVisit === 'svt');
ok('blankSettlementVisit is a function', typeof ACKS.blankSettlementVisit === 'function');
(function(){
  const v = ACKS.blankSettlementVisit({ settlementId:'set-sp' });
  ok('svt- prefixed id', /^svt-/.test(v.id));
  ok('schemaVersion 2', v.schemaVersion === 2);
  ok('default mode "holed-up"', v.mode === 'holed-up');
  ok('default status "active"', v.status === 'active');
  ok('default incidents []', Array.isArray(v.incidents) && v.incidents.length === 0);
  ok('stores NO entity-kind field (registry carries it — blankLair precedent)', !('kind' in v));
  ok('participantCharacterIds defaults []', Array.isArray(v.participantCharacterIds));
})();
// registry kind + field-schema (both reserved 2026-05-30; this lane mints factory + schema)
(function(){
  const reg = (ACKS.ENTITY_KINDS_LIST || []).find(e => e && e.kind === 'settlementVisit');
  ok('entity-registry kind "settlementVisit" registered (🛤)', !!reg && reg.icon === '🛤');
  ok('registry displayName reads name||id (invariant-safe)', !!reg && reg.displayName({}, { name:'Saltspur stay', id:'svt-x' }) === 'Saltspur stay');
  const schema = ACKS.FIELD_SCHEMAS && ACKS.FIELD_SCHEMAS['settlementVisit'];
  ok('field-schema "settlementVisit" exists', !!schema && schema.factory === 'blankSettlementVisit');
  ok('field-schema adminCreate schemaForm', !!schema && schema.adminCreate === 'schemaForm');
})();

section('D5 — the urban-incident table (JJ pp.81–84) + lookup');
ok('SETTLEMENT_INCIDENTS has 16 rows', (ACKS.SETTLEMENT_INCIDENTS || []).length === 16);
ok('every row has a JJ page cite', (ACKS.SETTLEMENT_INCIDENTS || []).every(e => /^JJ p\.\d+$/.test(e.cite || '')));
(function(){
  // Contiguity: the ranges tile 1..130 with no gaps or overlaps.
  const rows = ACKS.SETTLEMENT_INCIDENTS.slice().sort((a,b) => a.range[0] - b.range[0]);
  let contiguous = rows[0].range[0] === 1;
  for(let i = 1; i < rows.length; i++){ if(rows[i].range[0] !== rows[i-1].range[1] + 1) contiguous = false; }
  ok('ranges tile 1..130 contiguously (no gaps/overlaps)', contiguous && rows[rows.length-1].range[1] === 130);
})();
ok('lookup 1 → stray-animals', ACKS.lookupSettlementIncident(1).key === 'stray-animals');
ok('lookup 75 → town-watch', ACKS.lookupSettlementIncident(75).key === 'town-watch');
ok('lookup 100 → drunken-brawl (top of a daytime d100)', ACKS.lookupSettlementIncident(100).key === 'drunken-brawl');
ok('lookup 112 → plague-cart (after-dark only)', ACKS.lookupSettlementIncident(112).key === 'plague-cart');
ok('lookup 130 → riot', ACKS.lookupSettlementIncident(130).key === 'riot');
ok('lookup 999 → clamps to the most dangerous (riot)', ACKS.lookupSettlementIncident(999).key === 'riot');
ok('the dangerous high band (101–130) holds combat/disease/hazard', (ACKS.SETTLEMENT_INCIDENTS || []).filter(e => e.range[0] >= 101).every(e => e.combatRisk || e.diseaseExposure || e.hazardSave));

section('D5 — rollSettlementIncident (PURE roller)');
(function(){
  const c = mkVisit();
  const v = ACKS.blankSettlementVisit({ settlementId:'set-sp', participantCharacterIds:['chr-a','chr-b'] });
  // town-watch (reaction, intimidating tone), rng 0.3 → affected = participants[0] = Aelric
  const inc = ACKS.rollSettlementIncident(c, v, { forcedRoll:75, rng:()=>0.3 });
  ok('forcedRoll 75 → town-watch', inc.incidentKey === 'town-watch');
  ok('reactionCall true', inc.reactionCall === true);
  ok('reaction rolled (band present)', !!inc.reaction && typeof inc.reaction.band === 'string' && inc.reaction.band.length > 0);
  ok('tone intimidating (the town-watch tone)', inc.tone === 'intimidating');
  ok('affectedCharacterId is a participant', ['chr-a','chr-b'].includes(inc.affectedCharacterId));
  ok('PURE — the roll did NOT push to visit.incidents', v.incidents.length === 0);
  // stray-animals (no reaction)
  const inc2 = ACKS.rollSettlementIncident(c, v, { forcedRoll:1, rng:()=>0.5 });
  ok('forcedRoll 1 → stray-animals, no reaction', inc2.incidentKey === 'stray-animals' && inc2.reactionCall === false && inc2.reaction === null);
  // after-dark shift: base 82 + 30 = 112 → plague-cart (diseaseExposure)
  const inc3 = ACKS.rollSettlementIncident(c, v, { forcedRoll:82, afterDark:true, rng:()=>0.5 });
  ok('after-dark +30: base 82 → roll 112 → plague-cart', inc3.roll === 112 && inc3.incidentKey === 'plague-cart' && inc3.diseaseExposure === true);
  // theft incident (cutpurse, forcedRoll 84): rng 0.5 → save 11 < 14 → failed → gp lifted
  const inc4 = ACKS.rollSettlementIncident(c, v, { forcedRoll:84, rng:()=>0.5 });
  ok('forcedRoll 84 → cutpurse, theft rolled', inc4.incidentKey === 'cutpurse' && !!inc4.theft);
  ok('failed theft save → gpLost > 0', inc4.theft.failed === true && inc4.theft.gpLost > 0);
})();

section('D5 — startSettlementVisit / departSettlementVisit (init-on-write)');
(function(){
  const c = mkVisit(); delete c.settlementVisits;                 // prove init-on-write (no collection present)
  const v = ACKS.startSettlementVisit(c, { settlementId:'set-sp', participantCharacterIds:['chr-a','chr-b'], mode:'holed-up' });
  ok('init-on-write — campaign.settlementVisits created', Array.isArray(c.settlementVisits) && c.settlementVisits.length === 1);
  ok('visit is active + holed-up', v.status === 'active' && v.mode === 'holed-up');
  ok('hexId resolved from the settlement', v.hexId === 'hex-1');
  ok('emits a settlement-visited event', c.eventLog.some(e => e.event.kind === 'settlement-visited'));
  ok('findSettlementVisit returns it', ACKS.findSettlementVisit(c, v.id) === v);
  ok('activeSettlementVisits lists it', ACKS.activeSettlementVisits(c).length === 1);
  ACKS.departSettlementVisit(c, v.id);
  ok('depart → status departed + departedAtTurn', v.status === 'departed' && v.departedAtTurn === 5);
  ok('activeSettlementVisits now empty', ACKS.activeSettlementVisits(c).length === 0);
})();

section('D5 — applySettlementIncident (push + emit + disease via CL-2 contractDisease)');
(function(){
  const c = mkVisit();
  const v = ACKS.startSettlementVisit(c, { settlementId:'set-sp', participantCharacterIds:['chr-a','chr-b'] });
  const before = c.eventLog.length;
  const inc = ACKS.rollSettlementIncident(c, v, { forcedRoll:39, rng:()=>0.5 });  // peddler — benign
  ACKS.applySettlementIncident(c, v, inc, {});
  ok('apply pushes to visit.incidents', v.incidents.length === 1 && v.incidents[0].resolved === true);
  ok('apply emits an urban-incident event', c.eventLog.slice(before).some(e => e.event.kind === 'urban-incident'));
  // disease exposure — INFECT path (low rng → natural-1 Death save → infected; contractDisease emits)
  const mira = c.characters.find(x => x.id === 'chr-b');
  const incD = ACKS.rollSettlementIncident(c, v, { forcedRoll:110, rng:()=>0 });   // plague-cart; rng 0 → affected = chr-a... ensure deterministic affected
  // force the affected to Mira for a clean assertion
  incD.affectedCharacterId = 'chr-b'; incD.affectedName = 'Mira';
  ACKS.applySettlementIncident(c, v, incD, { rng:()=>0.02 });                       // save d20 = 1 → infected
  ok('disease-exposure infects via contractDisease (char.diseases grows)', (mira.diseases || []).length === 1);
  ok('contractDisease emits a disease-contracted event', c.eventLog.some(e => e.event.kind === 'disease-contracted'));
  ok('incident records the disease', incD.disease && incD.disease.infected === true);
  // disease exposure — RESIST path (high save → no infection)
  const c2 = mkVisit();
  const v2 = ACKS.startSettlementVisit(c2, { settlementId:'set-sp', participantCharacterIds:['chr-a'] });
  const aelric = c2.characters.find(x => x.id === 'chr-a');
  const incR = ACKS.rollSettlementIncident(c2, v2, { forcedRoll:110, rng:()=>0 });
  incR.affectedCharacterId = 'chr-a';
  ACKS.applySettlementIncident(c2, v2, incR, { rng:()=>0.99 });                     // save d20 = 20 → resists
  ok('high Death save → resists (no infection)', (aelric.diseases || []).length === 0 && incR.disease.infected === false);
})();

section('D5 — resolveSettlementCasualty (Delves-D1 mortal-wounds reuse)');
(function(){
  const c = mkVisit();
  const v = ACKS.startSettlementVisit(c, { settlementId:'set-sp', participantCharacterIds:['chr-a','chr-b'] });
  const inc = ACKS.rollSettlementIncident(c, v, { forcedRoll:105, rng:()=>0.5 });  // footpad (combatRisk)
  ACKS.applySettlementIncident(c, v, inc, {});
  const aelric = c.characters.find(x => x.id === 'chr-a');
  const cas = ACKS.resolveSettlementCasualty(c, v.id, 'chr-a', { rng:()=>0.02 });   // low d20 → a wound
  ok('a mortal wound is applied (char.mortalWounds grows)', (aelric.mortalWounds || []).length === 1);
  ok('casualty has an outcome', typeof cas.outcome === 'string' && cas.outcome.length > 0);
  ok('the latest combat-risk incident is annotated with the casualty', !!inc.casualty && inc.casualty.characterId === 'chr-a');
  ok('a mortal-wound event is emitted (D1)', c.eventLog.some(e => e.event.kind === 'mortal-wound'));
})();

section('D5 — the holed-up day-consumer (slot 66)');
(function(){
  const cons = ACKS.dayConsumersInOrder().find(x => x.name === 'settlement-incidents');
  ok('registered at order 66', !!cons && cons.order === 66);
  ok('declares the encounter pause trigger', !!cons && cons.pauseTriggers.indexOf('encounter') >= 0);
  ok('slot 66 sits between sage-commission (64) and the encounter stack (80)', !!cons && cons.order > 64 && cons.order < 80);

  const c = mkVisit();
  const v = ACKS.startSettlementVisit(c, { settlementId:'set-sp', participantCharacterIds:['chr-a','chr-b'], mode:'holed-up' });
  // 1d6 → 6 (≥5) → an incident is proposed
  const prop = ACKS.proposeSettlementVisitDay(c, { rng:()=>0.9 });
  ok('1d6 ≥ 5 → 1 pending incident', prop.pendingRecords.length === 1 && prop.pendingRecords[0].type === 'settlement-incident');
  ok('a notable event is surfaced', prop.notableEvents.length === 1);
  ok('PURE — propose did NOT mutate visit.incidents', v.incidents.length === 0);
  const inc0 = v.incidents.length;
  ACKS.commitSettlementVisitRecord(c, prop.pendingRecords[0]);
  ok('commit applies the proposed incident', v.incidents.length === inc0 + 1);
  // 1d6 → 1 (<5) → no incident
  const prop2 = ACKS.proposeSettlementVisitDay(c, { rng:()=>0.1 });
  ok('1d6 < 5 → no incident', prop2.pendingRecords.length === 0);
  // wandering mode is GM-pressed — the day-consumer does NOT auto-fire for it
  const cW = mkVisit();
  ACKS.startSettlementVisit(cW, { settlementId:'set-sp', participantCharacterIds:['chr-a'], mode:'wandering' });
  ok('wandering visits are NOT auto-checked (GM-pressed only)', ACKS.proposeSettlementVisitDay(cW, { rng:()=>0.9 }).pendingRecords.length === 0);
  // departed visits do not fire
  const cD = mkVisit();
  const vD = ACKS.startSettlementVisit(cD, { settlementId:'set-sp', participantCharacterIds:['chr-a'], mode:'holed-up' });
  ACKS.departSettlementVisit(cD, vD.id);
  ok('departed visits do not fire', ACKS.proposeSettlementVisitDay(cD, { rng:()=>0.9 }).pendingRecords.length === 0);
  // dayTickActivityInFlight engages while a holed-up visit is active. Use a day-1 campaign with no
  // other in-flight work, so the SETTLEMENT-VISIT branch is what flips it (day>1 short-circuits first).
  const cF = mkVisit(); cF.currentDayInMonth = 1;
  ok('dayTickActivityInFlight false with no visit (day 1, nothing else in flight)', ACKS.dayTickActivityInFlight(cF) === false);
  ACKS.startSettlementVisit(cF, { settlementId:'set-sp', participantCharacterIds:['chr-a'], mode:'holed-up' });
  ok('dayTickActivityInFlight true with an active holed-up visit', ACKS.dayTickActivityInFlight(cF) === true);
})();

section('D5 — rollAndApplySettlementIncident (the on-demand GM verb)');
(function(){
  const c = mkVisit();
  const v = ACKS.startSettlementVisit(c, { settlementId:'set-sp', participantCharacterIds:['chr-a'], mode:'looking-for-trouble' });
  const rec = ACKS.rollAndApplySettlementIncident(c, v.id, { forcedRoll:49, rng:()=>0.5 });  // preacher
  ok('roll+apply pushes the incident', v.incidents.length === 1 && rec.incidentKey === 'preacher');
  ok('roll+apply emits urban-incident', c.eventLog.some(e => e.event.kind === 'urban-incident'));
})();

section('D5 — event registration');
ok("'settlement-visited' in EVENT_KINDS", ACKS.EVENT_KINDS.includes('settlement-visited'));
ok("'urban-incident' in EVENT_KINDS", ACKS.EVENT_KINDS.includes('urban-incident'));
ok("'settlement-visited' has a schema", !!(ACKS.EVENT_SCHEMAS && ACKS.EVENT_SCHEMAS['settlement-visited']));
ok("'urban-incident' has a schema", !!(ACKS.EVENT_SCHEMAS && ACKS.EVENT_SCHEMAS['urban-incident']));
ok("'settlement-visited' is Event-Wizard opt-out", ACKS.EVENT_WIZARD_OPTOUT.has('settlement-visited'));
ok("'urban-incident' is Event-Wizard opt-out", ACKS.EVENT_WIZARD_OPTOUT.has('urban-incident'));

section('D5 GUARD — D5 added NOTHING to migrateCampaign (templates stay no-ops)');
(function(){
  // settlementVisits[] was RESERVED 2026-05-30 (lazyDefaultV1ScopeReservations) — NOT added by D5.
  // The demo stays a TRUE migrate-no-op; migrate idempotently keeps settlementVisits[] (the reserved
  // backfill), and startSettlementVisit is the init-on-write path (no migrate dependency).
  // DEMO is the top-level const loaded by the D2 guard above.
  ok('migrate(demo) keeps settlementVisits identical', JSON.stringify(ACKS.migrateCampaign(clone(DEMO)).settlementVisits) === JSON.stringify(clone(DEMO).settlementVisits || []));
  // migrate backfills the reserved collection idempotently (a fresh campaign has [], stays [])
  const fresh = ACKS.blankCampaign({ name:'x' });
  ok('fresh blankCampaign has settlementVisits []', Array.isArray(fresh.settlementVisits) && fresh.settlementVisits.length === 0);
  ok('migrate is idempotent on settlementVisits', JSON.stringify(ACKS.migrateCampaign(fresh).settlementVisits) === '[]');
})();

// =============================================================================
section('Summary');
console.log('  Passed: ' + pass);
console.log('  Failed: ' + fail);
if(fail === 0){
  console.log('\nAll Delves D2 + D3 + D4 + D5 smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nFAILURES:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
