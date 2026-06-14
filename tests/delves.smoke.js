// =============================================================================
// delves.smoke.js — Delves D2 (the Dungeon + Delve entities). Phase 3.5 (Milestone B).
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
section('Summary');
console.log('  Passed: ' + pass);
console.log('  Failed: ' + fail);
if(fail === 0){
  console.log('\nAll Delves D2 smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nFAILURES:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
