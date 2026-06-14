// =============================================================================
// proficiencies.smoke.js — Proficiency Throws PT-1 (Phase_3.6_Proficiency_Throws_Plan.md).
// Covers: Layer 0 the {key,ranks} PARSER (every legacy string/object form; numeric-vs-text
// parens; trailing number; merge; aliases; unknown preserved); Layer 1 rollProficiencyThrow
// (RR pp.9-10: nat-1 auto-fail / nat-20-auto-success-iff-proficient / autoFailBand 0 & 3 /
// modifiers sum + margin / seeded reproducibility / botch / crit / auto); Layer 2 the catalog
// (roster completeness, every task's prof + every throw-modifier target exists, the RAW worked
// targets Alchemy 11/7/3 · Acrobatics 18-lvl · Dungeonbashing 4xSTR · JJ p.94 rows); Layer 3
// characterProficiencyThrow + characterAvailableThrows (rank/level reduction, throw-modifiers,
// ability x multiplier, min-rank gating, improvised, forecast); throwSuccessChance; and PT-0 — the
// ON-DISK migration (migrateCharacterProficiencies materializes the loose strings to {key,ranks},
// idempotent, custom labels preserved; the 6 templates + demo now carry {key,ranks} and stay
// migrate-no-ops) + the reader sweep (engine officers / magistrate gate / nav / forage read the
// canonical {key,ranks} shape).
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
const fixedRng = v => () => v;  // deterministic d20: natural = 1 + floor(v*20)

// =============================================================================
section('Module loads + exports present');
// =============================================================================
['PROFICIENCY_CATALOG','PROFICIENCY_TASKS','PROFICIENCY_THROW_MODIFIERS','IMPROVISED_THROW_DIFFICULTY','PROFICIENCY_ALIASES','PROFICIENCY_LISTS',
 'parseProficiencyEntry','characterProficiencies','proficiencyRanks','hasProficiency','canonicalProficiencyKey','proficiencyLabel',
 'migrateCharacterProficiencies','migrateAllCharacterProficiencies',
 'rollProficiencyThrow','throwSuccessChance','characterProficiencyThrow','characterAvailableThrows','recordProficiencyThrow']
 .forEach(k => ok('ACKS.' + k + ' exported', ACKS[k] != null));

// =============================================================================
section('Layer 0 — parseProficiencyEntry (every legacy form)');
// =============================================================================
const P = ACKS.parseProficiencyEntry;
ok('numeric parens = rank: "Theology (2)"', (() => { const p = P('Theology (2)'); return p.key === 'theology' && p.ranks === 2 && p.spec === ''; })());
ok('text parens = spec: "Craft (smithing)"', (() => { const p = P('Craft (smithing)'); return p.key === 'craft' && p.ranks === 1 && p.spec === 'smithing'; })());
ok('text parens = spec: "Knowledge (History)"', (() => { const p = P('Knowledge (History)'); return p.key === 'knowledge' && p.spec === 'History'; })());
ok('trailing number = rank: "Military Strategy 2"', (() => { const p = P('Military Strategy 2'); return p.key === 'military-strategy' && p.ranks === 2; })());
ok('bare = rank 1: "Diplomacy"', (() => { const p = P('Diplomacy'); return p.key === 'diplomacy' && p.ranks === 1; })());
ok('object {name}', (() => { const p = P({ name: 'Tracking' }); return p.key === 'tracking' && p.ranks === 1; })());
ok('object {key, ranks}', (() => { const p = P({ key: 'alchemy', ranks: 3 }); return p.key === 'alchemy' && p.ranks === 3; })());
ok('& folds to "and": "Mastery of Conjuration & Summoning"', P('Mastery of Conjuration & Summoning').key === 'mastery-of-conjuration-and-summoning');
ok('alias folds: "Heraldry" -> manual-of-arms', P('Heraldry').key === 'manual-of-arms');
ok('null entry -> null', P(null) === null);
ok('empty string -> null', P('') === null);
ok('unknown label preserved as slug', P('Goat Yoga').key === 'goat-yoga');
ok('label resolves to catalog label', P('theology').label === 'Theology');

// =============================================================================
section('Layer 0 — characterProficiencies + proficiencyRanks (merge, specs, class powers)');
// =============================================================================
ok('repeated bare entries merge to ranks: ["Tracking","Tracking"] -> 2',
  ACKS.proficiencyRanks({ proficiencies: ['Tracking', 'Tracking'] }, 'tracking') === 2);
ok('explicit rank wins: ["Theology (2)"] -> 2', ACKS.proficiencyRanks({ proficiencies: ['Theology (2)'] }, 'theology') === 2);
ok('different specs stay separate craft entries',
  (() => { const g = ACKS.characterProficiencies({ proficiencies: ['Craft (smithing)', 'Craft (carpentry)'] }); return g.filter(x => x.key === 'craft').length === 2; })());
ok('proficiencyRanks(craft) = max across specs',
  ACKS.proficiencyRanks({ proficiencies: ['Craft (smithing)', 'Craft (smithing)', 'Craft (carpentry)'] }, 'craft') === 2);
ok('hasProficiency true when present', ACKS.hasProficiency({ proficiencies: ['Diplomacy'] }, 'diplomacy') === true);
ok('hasProficiency false when absent', ACKS.hasProficiency({ proficiencies: ['Diplomacy'] }, 'tracking') === false);
ok('hasProficiency via alias', ACKS.hasProficiency({ proficiencies: ['Heraldry'] }, 'manual-of-arms') === true);
ok('null character -> 0 ranks', ACKS.proficiencyRanks(null, 'tracking') === 0);
ok('class-power equivalent folds in (Bard Performance power -> Performance rank 1)',
  ACKS.proficiencyRanks({ proficiencies: [], classPowers: ['Performance'] }, 'performance') === 1);
ok('class-power does NOT inflate an unrelated prof',
  ACKS.proficiencyRanks({ proficiencies: [], classPowers: ['Performance'] }, 'tracking') === 0);

// =============================================================================
section('Layer 1 — rollProficiencyThrow (RR pp.9-10)');
// =============================================================================
const R = ACKS.rollProficiencyThrow;
// fixedRng(0) -> natural 1; fixedRng(0.999) -> natural 20
ok('nat-1 ALWAYS fails (even +10 vs 5)', (() => { const r = R({ target: 5, modifiers: [{ source: 'x', value: 10 }], proficient: true, rng: fixedRng(0) }); return r.natural === 1 && r.success === false && r.auto === 'fail' && r.botch === true; })());
ok('nat-20 auto-succeeds IFF proficient (vs 99)', (() => { const r = R({ target: 99, proficient: true, rng: fixedRng(0.999) }); return r.natural === 20 && r.success === true && r.auto === 'success' && r.crit === true; })());
ok('nat-20 NON-proficient = ordinary compare (fails vs 99)', (() => { const r = R({ target: 99, proficient: false, rng: fixedRng(0.999) }); return r.natural === 20 && r.success === false && r.auto === null && r.crit === false; })());
ok('ordinary success when total >= target', (() => { const r = R({ target: 11, modifiers: [{ value: 2 }], rng: fixedRng(0.5) }); return r.natural === 11 && r.total === 13 && r.success === true && r.auto === null; })());
ok('ordinary fail when total < target', (() => { const r = R({ target: 18, rng: fixedRng(0.5) }); return r.natural === 11 && r.total === 11 && r.success === false; })());
ok('modifierTotal sums signed modifiers', R({ target: 10, modifiers: [{ value: 3 }, { value: -1 }, { value: 2 }], rng: fixedRng(0.5) }).modifierTotal === 4);
ok('margin = total - target (signed)', (() => { const r = R({ target: 10, modifiers: [{ value: 4 }], rng: fixedRng(0.5) }); return r.margin === (11 + 4 - 10); })());
ok('autoFailBand 3 fumbles on nat-1..3', (() => { const r = R({ target: 1, autoFailBand: 3, rng: fixedRng(0.1) }); return r.natural === 3 && r.success === false && r.auto === 'fail' && r.botch === true; })());
ok('autoFailBand 3 succeeds on nat-4 vs 1', (() => { const r = R({ target: 1, autoFailBand: 3, rng: fixedRng(0.16) }); return r.natural === 4 && r.success === true; })());
ok('autoFailBand 0 — nat-1 NOT auto-fail (RR p.278 forage)', (() => { const r = R({ target: 5, autoFailBand: 0, proficient: false, rng: fixedRng(0) }); return r.natural === 1 && r.success === false && r.auto === null && r.botch === false; })());
ok('autoFailBand 0 — nat-1 succeeds when target met by mods', (() => { const r = R({ target: 0, autoFailBand: 0, modifiers: [], rng: fixedRng(0) }); return r.natural === 1 && r.success === true; })());
ok('fumbleEffect echoed, not applied', R({ target: 10, fumbleEffect: 'trap-triggers', rng: fixedRng(0) }).fumbleEffect === 'trap-triggers');
ok('die is always d20', R({ target: 10, rng: fixedRng(0.5) }).die === 'd20');
ok('seeded rng reproducible', (() => { const a = R({ target: 10, modifiers: [{ value: 1 }], rng: fixedRng(0.37) }); const b = R({ target: 10, modifiers: [{ value: 1 }], rng: fixedRng(0.37) }); return a.natural === b.natural && a.total === b.total && a.success === b.success; })());

// =============================================================================
section('Layer 1 — throwSuccessChance');
// =============================================================================
ok('target 11, no mods, not proficient -> 10/20 (0.5)', ACKS.throwSuccessChance(11, 0, 1, false) === 0.5);
ok('target 18, +12, autoFailBand 1 -> rolls 6..20 = 15/20 (0.75)', ACKS.throwSuccessChance(18, 12, 1, false) === 0.75);
ok('nat-20 proficient counts even if mods cannot reach target', ACKS.throwSuccessChance(99, 0, 1, true) === 1 / 20);
ok('nat-20 NON-proficient cannot reach -> 0', ACKS.throwSuccessChance(99, 0, 1, false) === 0);

// =============================================================================
section('Layer 2 — catalog integrity + completeness');
// =============================================================================
const slug = s => String(s).toLowerCase().trim().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
ok('catalog has the 44 general-list proficiencies', ACKS.PROFICIENCY_LISTS.general.every(l => ACKS.PROFICIENCY_CATALOG[slug(l)]));
(() => {
  const listed = new Set();
  for(const arr of Object.values(ACKS.PROFICIENCY_LISTS)) for(const l of arr) listed.add(slug(l.replace(/\s*\([^)]*\)\s*/g, '')));
  const missing = [...listed].filter(k => !ACKS.PROFICIENCY_CATALOG[k]);
  ok('every LISTED proficiency is in the catalog', missing.length === 0, missing.join(', '));
})();
ok('catalog roster is large (~110+)', Object.keys(ACKS.PROFICIENCY_CATALOG).length >= 100, 'size ' + Object.keys(ACKS.PROFICIENCY_CATALOG).length);
ok('every catalog type is a known type', Object.values(ACKS.PROFICIENCY_CATALOG).every(c => ACKS.PROFICIENCY_TYPES.includes(c.type)));
ok('every catalog entry has a rawPage', Object.values(ACKS.PROFICIENCY_CATALOG).every(c => typeof c.rawPage === 'string' && c.rawPage.length > 0));
ok('every PROFICIENCY_TASKS proficiency exists in catalog',
  Object.values(ACKS.PROFICIENCY_TASKS).every(t => !!ACKS.PROFICIENCY_CATALOG[t.proficiency]));
ok('every throw-modifier target task exists',
  Object.values(ACKS.PROFICIENCY_THROW_MODIFIERS).every(m => (m.modifies || []).every(x => !!ACKS.PROFICIENCY_TASKS[x.task])));
ok('every throw-modifier proficiency exists in catalog',
  Object.keys(ACKS.PROFICIENCY_THROW_MODIFIERS).every(k => !!ACKS.PROFICIENCY_CATALOG[k]));
ok('general-list entries flagged general', ACKS.PROFICIENCY_CATALOG['theology'].general === true && ACKS.PROFICIENCY_CATALOG['acrobatics'].general === false);

// RAW worked targets (transcribed RR pp.105-121)
const T = ACKS.PROFICIENCY_TASKS;
ok('Adventuring sub-throws present (5)', ['adventuring:dungeonbashing','adventuring:climbing','adventuring:searching','adventuring:trapbreaking','adventuring:listening'].every(k => T[k]));
ok('Dungeonbashing 18+ with STR x4', T['adventuring:dungeonbashing'].baseTarget === 18 && T['adventuring:dungeonbashing'].governingAbility === 'STR' && T['adventuring:dungeonbashing'].abilityMultiplier === 4);
ok('Searching/Trapbreaking/Listening base 18', T['adventuring:searching'].baseTarget === 18 && T['adventuring:trapbreaking'].baseTarget === 18 && T['adventuring:listening'].baseTarget === 18);
ok('Climbing-easy base 8', T['adventuring:climbing'].baseTarget === 8);
ok('Trapbreaking fumble triggers trap', T['adventuring:trapbreaking'].fumbleEffect === 'trap-triggers');
ok('Alchemy identify tiers 11/7/3', JSON.stringify(T['alchemy:identify-substance'].tierTargets) === JSON.stringify({ 1: 11, 2: 7, 3: 3 }));
ok('Alchemy extract-toxin fresh tiers 20/16/12', JSON.stringify(T['alchemy:extract-toxin'].tierTargets) === JSON.stringify({ 1: 20, 2: 16, 3: 12 }));
ok('Alchemy extract-toxin dried tiers 24/20/16', JSON.stringify(T['alchemy:extract-toxin-dried'].tierTargets) === JSON.stringify({ 1: 24, 2: 20, 3: 16 }));
ok('Animal Husbandry diagnose tiers 11/7/3', JSON.stringify(T['animal-husbandry:diagnose'].tierTargets) === JSON.stringify({ 1: 11, 2: 7, 3: 3 }));
ok('Art/Craft identify tiers 11/7/3/2', JSON.stringify(T['art:identify'].tierTargets) === JSON.stringify({ 1: 11, 2: 7, 3: 3, 4: 2 }));
ok('Acrobatics tumble 18+ -1/level', T['acrobatics:tumble'].baseTarget === 18 && T['acrobatics:tumble'].perLevelTargetDelta === -1);
ok('Loremastery decipher 18+ -1/level', T['loremastery:decipher'].baseTarget === 18 && T['loremastery:decipher'].perLevelTargetDelta === -1);
ok('Disguise create 11+ -2/rank', T['disguise:create'].baseTarget === 11 && T['disguise:create'].perRankTargetDelta === -2);
ok('Tracking find-tracks 11+ -4/rank', T['tracking:find-tracks'].baseTarget === 11 && T['tracking:find-tracks'].perRankTargetDelta === -4);
ok('Arcane Dabbling use-item 4+', T['arcane-dabbling:use-item'].baseTarget === 4);
ok('Trapping catch-game 19+ secret', T['trapping:catch-game'].baseTarget === 19 && T['trapping:catch-game'].secretByDefault === true);
ok('Lockpicking pick-lock class-derived (no number)', T['lockpicking:pick-lock'].baseTargetSource === 'class-lockpicking' && T['lockpicking:pick-lock'].baseTarget === undefined);

// JJ p.94 improvised table
const I = ACKS.IMPROVISED_THROW_DIFFICULTY;
ok('improvised luck 11+', I['luck'].target === 11 && I['luck'].abilityMultiplier === 0);
ok('improvised raw-ability 18+ x4', I['raw-ability'].target === 18 && I['raw-ability'].abilityMultiplier === 4);
ok('improvised routine-safe 4/2/2', JSON.stringify(I['routine-safe'].targetByRank) === JSON.stringify({ 0: 4, 1: 2, 2: 2 }));
ok('improvised recall-training 11/7/4', JSON.stringify(I['recall-training'].targetByRank) === JSON.stringify({ 0: 11, 1: 7, 2: 4 }));
ok('improvised difficult-dangerous 18/14/10 + band 3', JSON.stringify(I['difficult-dangerous'].targetByRank) === JSON.stringify({ 0: 18, 1: 14, 2: 10 }) && I['difficult-dangerous'].autoFailBand === 3);

// =============================================================================
section('Layer 3 — characterProficiencyThrow derivation');
// =============================================================================
const C = ACKS.characterProficiencyThrow;
ok('ranks lower the tier target: Theology (2) -> 7', C({}, { proficiencies: ['Theology (2)'] }, 'theology:recognize', { roll: false }).resolvedTarget === 7);
ok('extra ranks lower flat target: Tracking r3 -> 11-8=3', C({}, { proficiencies: ['Tracking', 'Tracking', 'Tracking'] }, 'tracking:find-tracks', { roll: false }).resolvedTarget === 3);
ok('per-level: Acrobatics L5 -> 14', C({}, { level: 5, proficiencies: ['Acrobatics'] }, 'acrobatics:tumble', { roll: false }).resolvedTarget === 14);
ok('tier target by rank: Alchemy r1 -> 11', C({}, { proficiencies: ['Alchemy'] }, 'alchemy:identify-substance', { roll: false }).resolvedTarget === 11);
ok('tier target by rank: Alchemy r3 -> 3', C({}, { proficiencies: ['Alchemy (3)'] }, 'alchemy:identify-substance', { roll: false }).resolvedTarget === 3);
ok('min-rank gating: Animal Husbandry cure unavailable at r1', !!C({}, { proficiencies: ['Animal Husbandry'] }, 'animal-husbandry:cure', { roll: false }).unavailableReason);
ok('min-rank gating: cure available at r2 -> 18', C({}, { proficiencies: ['Animal Husbandry (2)'] }, 'animal-husbandry:cure', { roll: false }).resolvedTarget === 18);
ok('4xSTR ability mod: STR 16 (+2) -> +8 dungeonbashing', (() => { const r = C({}, { abilities: { STR: 16 }, proficiencies: [] }, 'adventuring:dungeonbashing', { roll: false }); return r.modifierTotal === 8 && r.itemizedModifiers.some(m => m.source === 'ability' && m.value === 8); })());
ok('throw-modifier Alertness sets searching to 14', (() => { const r = C({}, { proficiencies: ['Alertness'] }, 'adventuring:searching', { roll: false }); return r.resolvedTarget === 14; })());
ok('throw-modifier Trapfinding +2 to trapbreaking', (() => { const r = C({}, { proficiencies: ['Trapfinding'] }, 'adventuring:trapbreaking', { roll: false }); return r.modifierTotal === 2 && r.itemizedModifiers.some(m => m.source === 'trapfinding'); })());
ok('throw-modifier Lockpicking Expertise +2 to pick-lock (itemized even with class-derived base)', (() => { const r = C({}, { proficiencies: ['Lockpicking', 'Lockpicking Expertise'] }, 'lockpicking:pick-lock', { roll: false }); return r.itemizedModifiers.some(m => m.source === 'lockpicking-expertise' && m.value === 2); })());
ok('Adventuring sub-throws: everyone proficient (no entry needed)', C({}, { proficiencies: [] }, 'adventuring:listening', { roll: false }).proficient === true);
ok('non-Adventuring task: not proficient without the prof', C({}, { proficiencies: [] }, 'theology:recognize', { roll: false }).proficient === false);
ok('situational modifiers itemized', (() => { const r = C({}, { proficiencies: ['Tracking'] }, 'tracking:find-tracks', { roll: false, situational: [{ source: 'soft-ground', value: 4 }] }); return r.modifierTotal === 4; })());
ok('fatiguePenalty itemized (JJ p.95)', (() => { const r = C({}, { proficiencies: ['Tracking'] }, 'tracking:find-tracks', { roll: false, fatiguePenalty: -1 }); return r.itemizedModifiers.some(m => m.source === 'overtime' && m.value === -1); })());
ok('improvised raw-ability WIL 18 -> +12 mod', (() => { const r = C({}, { abilities: { WIL: 18 } }, null, { difficultyClass: 'raw-ability', abilityKeyOverride: 'WIL', roll: false }); return r.modifierTotal === 12; })());
ok('improvised targetByRank uses relevantRanks', C({}, {}, null, { difficultyClass: 'recall-training', relevantRanks: 2, roll: false }).resolvedTarget === 4);
ok('roll:false returns a forecast (no natural)', C({}, { proficiencies: ['Tracking'] }, 'tracking:find-tracks', { roll: false }).natural === undefined);
ok('rolling returns natural + success', (() => { const r = C({}, { proficiencies: ['Tracking'] }, 'tracking:find-tracks', { rng: fixedRng(0.5) }); return r.natural === 11 && typeof r.success === 'boolean'; })());
ok('class-derived task returns forecast even when rolling (no number to roll vs)', C({}, { proficiencies: ['Lockpicking'] }, 'lockpicking:pick-lock', { rng: fixedRng(0.5) }).natural === undefined);
ok('unknown task -> error', !!C({}, {}, 'nonexistent:task', {}).error);
ok('successChance present in forecast', typeof C({}, { proficiencies: ['Theology (2)'] }, 'theology:recognize', { roll: false }).successChance === 'number');

// =============================================================================
section('Layer 3 — characterAvailableThrows');
// =============================================================================
(() => {
  const ch = { level: 8, abilities: { STR: 16 }, proficiencies: ['Theology (2)', 'Tracking'] };
  const rows = ACKS.characterAvailableThrows({}, ch);
  const keys = rows.map(r => r.taskKey);
  ok('includes the 5 universal Adventuring sub-throws', ['adventuring:dungeonbashing','adventuring:climbing','adventuring:searching','adventuring:trapbreaking','adventuring:listening'].every(k => keys.includes(k)));
  ok('includes the character\'s proficiency throws (theology, tracking)', keys.includes('theology:recognize') && keys.includes('tracking:find-tracks'));
  ok('excludes throws the character cannot attempt (no Alchemy)', !keys.includes('alchemy:identify-substance'));
  ok('excludes min-rank-gated tasks at insufficient rank', !ACKS.characterAvailableThrows({}, { proficiencies: ['Animal Husbandry'] }).map(r => r.taskKey).includes('animal-husbandry:cure'));
  ok('rows carry resolved target + group', rows.find(r => r.taskKey === 'theology:recognize').resolvedTarget === 7);
})();

// =============================================================================
section('Optional record-only proficiency-throw event');
// =============================================================================
ok('proficiency-throw is a known event kind', typeof ACKS.isEventKindKnown === 'function' && ACKS.isEventKindKnown('proficiency-throw'));
ok('proficiency-throw is Event-Wizard opt-out', ACKS.EVENT_WIZARD_OPTOUT && ACKS.EVENT_WIZARD_OPTOUT.has('proficiency-throw'));
(() => {
  const camp = { currentTurn: 3, currentDayInMonth: 5, eventLog: [] };
  const ch = { id: 'chr-x', proficiencies: ['Tracking'] };
  const result = ACKS.characterProficiencyThrow(camp, ch, 'tracking:find-tracks', { rng: fixedRng(0.9) });
  const ev = ACKS.recordProficiencyThrow(camp, Object.assign({ actorCharacterId: ch.id }, result));
  ok('record appends one applied eventLog entry', camp.eventLog.length === 1 && camp.eventLog[0].event.kind === 'proficiency-throw');
  ok('record is campaignLogHidden (table chatter)', camp.eventLog[0].event.campaignLogHidden === true);
  ok('record stamps appliedAtTurn/Day', ev.appliedAtTurn === 3 && ev.appliedAtDay === 5);
  ok('record carries the throw in payload', ev.payload.natural === result.natural && ev.payload.target === result.resolvedTarget);
})();

// =============================================================================
section('PT-0 — migrateCharacterProficiencies (legacy strings -> canonical {key,ranks})');
// =============================================================================
const MC = ACKS.migrateCharacterProficiencies;
ok('blankCharacter still seeds proficiencies: []', (() => { const c = ACKS.blankCharacter ? ACKS.blankCharacter() : { proficiencies: [] }; return Array.isArray(c.proficiencies) && c.proficiencies.length === 0; })());
ok('materializes every legacy form to {key,ranks(,spec)}', (() => {
  const c = { proficiencies: ['Theology (2)', 'Tracking', 'Tracking', 'Craft (smithing)', 'Heraldry', 'Diplomacy'] };
  const changed = MC(c);
  return changed === true && JSON.stringify(c.proficiencies) === JSON.stringify([
    { key: 'theology', ranks: 2 }, { key: 'tracking', ranks: 2 },
    { key: 'craft', ranks: 1, spec: 'smithing' }, { key: 'manual-of-arms', ranks: 1 }, { key: 'diplomacy', ranks: 1 }
  ]);
})());
ok('idempotent — second run is a no-op (returns false)', (() => {
  const c = { proficiencies: ['Theology (2)', 'Tracking', 'Tracking'] }; MC(c); return MC(c) === false;
})());
ok('already-canonical {key,ranks} is a no-op', MC({ proficiencies: [{ key: 'diplomacy', ranks: 1 }, { key: 'theology', ranks: 2 }] }) === false);
ok('legacy object {name} migrates', (() => { const c = { proficiencies: [{ name: 'Tracking' }] }; MC(c); return c.proficiencies[0].key === 'tracking' && c.proficiencies[0].ranks === 1; })());
ok('bare {key} (no ranks) -> ranks 1', (() => { const c = { proficiencies: [{ key: 'alchemy' }] }; MC(c); return c.proficiencies[0].ranks === 1; })());
ok('custom off-catalog key preserves human label + idempotent', (() => {
  const c = { proficiencies: ['Goat Yoga'] }; MC(c);
  return JSON.stringify(c.proficiencies) === JSON.stringify([{ key: 'goat-yoga', ranks: 1, label: 'Goat Yoga' }]) && MC(c) === false;
})());
ok('migrateAllCharacterProficiencies counts only changed characters', (() => {
  const camp = { characters: [{ proficiencies: ['Diplomacy'] }, { proficiencies: [{ key: 'theology', ranks: 1 }] }, { proficiencies: [] }] };
  return ACKS.migrateAllCharacterProficiencies(camp) === 1;
})());

// =============================================================================
section('PT-0 — on-disk migration: templates carry {key,ranks} + stay migrate-no-ops');
// =============================================================================
(() => {
  const tdir = path.join(REPO, 'Templates');
  let checked = 0, hadProfs = 0;
  for(const f of fs.readdirSync(tdir).filter(x => x.endsWith('.acks.json'))){
    const raw = JSON.parse(fs.readFileSync(path.join(tdir, f), 'utf8'));
    const before = (raw.characters || []).flatMap(c => c.proficiencies || []);
    // every stored proficiency is now the canonical {key,ranks} object — no strings on disk
    ok('template proficiencies are canonical {key,ranks}: ' + f,
       before.every(p => p && typeof p === 'object' && typeof p.key === 'string' && typeof p.ranks === 'number'));
    // and migrate is a no-op on the proficiencies field
    const migrated = ACKS.migrateCampaign(JSON.parse(JSON.stringify(raw)));
    const after = (migrated.characters || []).flatMap(c => c.proficiencies || []);
    ok('template proficiencies are a migrate-no-op: ' + f, JSON.stringify(before) === JSON.stringify(after));
    checked++; if(before.length) hadProfs++;
  }
  ok('all 6 templates checked, with proficiencies present', checked === 6 && hadProfs >= 4);
})();

// =============================================================================
section('PT-0 — reader sweep: engine readers consume the canonical {key,ranks} shape');
// =============================================================================
// officer table (acks-engine.js) — proficiencyRanks/hasProficiencyNamed delegate to the canonical accessor
ok('officer SA reads {key,ranks} Military Strategy', ACKS.proficiencyRanks({ proficiencies: [{ key: 'military-strategy', ranks: 2 }] }, 'Military Strategy') === 2);
ok('officer SA still reads legacy string Military Strategy 2', ACKS.proficiencyRanks({ proficiencies: ['Military Strategy 2'] }, 'Military Strategy') === 2);
ok('strategicAbility picks up migrated ranks', ACKS.strategicAbility({ abilities: { INT: 10, WIL: 10, CHA: 10 }, proficiencies: [{ key: 'military-strategy', ranks: 3 }] }) === 3);
ok('hasProficiencyNamed(Leadership) on {key,ranks}', ACKS.hasProficiencyNamed({ proficiencies: [{ key: 'leadership', ranks: 1 }] }, 'Leadership') === true);
ok('Commanding Presence != Command on {key,ranks}', ACKS.proficiencyRanks({ proficiencies: [{ key: 'commanding-presence', ranks: 1 }] }, 'Command') === 0);
// magistrate gate (acks-engine-entities.js) — canonical, multi-word + alias aware
ok('isCharacterQualifiedForRole(chaplain): {key:theology} + divine class', ACKS.isCharacterQualifiedForRole({ class: 'Cleric', proficiencies: [{ key: 'theology', ranks: 1 }] }, 'chaplain') === true);
ok('chaplain rejected without the Theology proficiency', ACKS.isCharacterQualifiedForRole({ class: 'Cleric', proficiencies: [{ key: 'diplomacy', ranks: 1 }] }, 'chaplain') === false);
ok('captainOfGuard needs Command + Manual of Arms ({key,ranks})',
   ACKS.isCharacterQualifiedForRole({ proficiencies: [{ key: 'command', ranks: 1 }, { key: 'manual-of-arms', ranks: 1 }] }, 'captainOfGuard') === true
   && ACKS.isCharacterQualifiedForRole({ proficiencies: [{ key: 'command', ranks: 1 }] }, 'captainOfGuard') === false);
ok('steward Bargaining + any(Craft/Profession), spec-tolerant',
   ACKS.isCharacterQualifiedForRole({ proficiencies: [{ key: 'bargaining', ranks: 1 }, { key: 'craft', ranks: 1, spec: 'smithing' }] }, 'steward') === true);
// construction supervisor cap (acks-engine.js) — the hyphenated key must still resolve
ok('Engineering {key} -> 100,000gp supervisor cap', ACKS.constructionSupervisorCapForCharacter({ proficiencies: [{ key: 'engineering', ranks: 1 }] }) === 100000);
ok('Siege Engineering {key:siege-engineering} -> 25,000gp (hyphen fix)', ACKS.constructionSupervisorCapForCharacter({ proficiencies: [{ key: 'siege-engineering', ranks: 1 }] }) === 25000);
// the read layer still parses loose strings (defensive — pre-migration / external data)
ok('read layer still works on loose string proficiencies', ACKS.proficiencyRanks({ proficiencies: ['Theology (2)', 'Healing', 'Diplomacy'] }, 'theology') === 2);

// =============================================================================
section('PT-6 — ad-hoc resolver fold onto Layer 1 (byte-identical delegation)');
// =============================================================================
// The shipped 1d20-vs-target resolvers — rollNavigation (RR p.275), trackingFindThrow (RR p.120),
// forage/hunt/hexSearch (RR pp.276-278, incl. their reroll siblings + the Land-Surveying throw) —
// now route their die + success through rollProficiencyThrow (Layer 1). Same SINGLE rng consumption
// (1 + floor(rng()*20)) + same RAW math = byte-identical. The full byte-identical proof is the
// characterization suites that seed these resolvers (journeys / provisioning / cost-of-living /
// encounters / monster-persistence); these are the targeted delegation + RAW-nuance assertions.

// rollNavigation (RR p.275) — nat-1 auto-fail; the party bonus itemized; folds to Layer 1.
(() => {
  const nv = ACKS.rollNavigation(8, 4, fixedRng(0.5));   // natural 11, +4 → total 15 ≥ 8
  ok('rollNavigation values: rng 0.5 vs 8+ with +4 → 11 / total 15 / success', nv.rolled === 11 && nv.total === 15 && nv.success === true && nv.naturalOne === false);
  const l1 = ACKS.rollProficiencyThrow({ target: 8, modifiers: [{ value: 4 }], autoFailBand: 1, proficient: false, rng: fixedRng(0.5) });
  ok('rollNavigation delegates to Layer 1 (same natural/total/success)', nv.rolled === l1.natural && nv.total === l1.total && nv.success === l1.success);
  const n1 = ACKS.rollNavigation(6, 8, fixedRng(0));     // natural 1 → fail despite +8
  ok('rollNavigation: natural 1 auto-fails even at +8 vs 6+ (autoFailBand:1 preserved)', n1.success === false && n1.naturalOne === true);
})();

// trackingFindThrow (RR p.120) — nat-1 auto-fail; count-band / extra-ranks / ground / age / rain / light itemized.
(() => {
  const tk = ACKS.trackingFindThrow({ ranks: 1, countTracked: 3, rng: fixedRng(0.5) });  // natural 11, count-band +2 → total 13 ≥ 11
  ok('trackingFindThrow values: 3 tracked (+2 band), rng 0.5 → 11 / total 13 / success', tk.natural === 11 && tk.total === 13 && tk.success === true);
  ok('trackingFindThrow itemizes the count band (+2)', Array.isArray(tk.modifiers) && tk.modifiers.some(m => m.source === 'count-band' && m.value === 2));
  const tl1 = ACKS.rollProficiencyThrow({ target: 11, modifiers: [{ source: 'count-band', value: 2 }], autoFailBand: 1, proficient: false, rng: fixedRng(0.5) });
  ok('trackingFindThrow delegates to Layer 1 (same natural/total/success)', tk.natural === tl1.natural && tk.total === tl1.total && tk.success === tl1.success);
  const t1 = ACKS.trackingFindThrow({ ranks: 3, countTracked: 17, rng: fixedRng(0) });   // natural 1 → fail despite +8 ranks +8 band
  ok('trackingFindThrow: natural 1 auto-fails despite +16 of bonuses (autoFailBand:1 preserved)', t1.natural === 1 && t1.success === false);
})();

// forageActivity (RR p.278) — NO auto-fail (autoFailBand:0): the riskiest nuance the fold must
// preserve. Firewood in forest (3+) with Survival (+4) on a natural 1 must SUCCEED.
(() => {
  const fc = ACKS.blankCampaign({ name: 'pt6-forage' });
  fc.hexes = [{ id: 'hx-forest', terrain: 'forest', domainId: null }];
  fc.characters = [ACKS.blankCharacter({ id: 'fgr', name: 'Forager', currentHexId: 'hx-forest', proficiencies: [{ key: 'survival', ranks: 1 }] })];
  const fr = ACKS.forageActivity(fc, { actorCharacterId: 'fgr', forageKind: 'firewood', rng: fixedRng(0) });   // natural 1, +4 vs 3+ → 5 ≥ 3
  ok('forageActivity: firewood (forest, Survival), natural 1 → SUCCESS — RR p.278 forage has NO auto-fail (autoFailBand:0 preserved)', !!fr.ok && fr.rolled === 1 && fr.success === true);
  const fr2 = ACKS.forageActivity(fc, { actorCharacterId: 'fgr', forageKind: 'water', rng: fixedRng(0.3) });    // natural 7, +4 vs 14+ → 11 < 14
  ok('forageActivity: water (no source) 7+4 vs 14+ → fail (compare preserved)', !!fr2.ok && fr2.rolled === 7 && fr2.success === false);
})();

// =============================================================================
section('PT-5 — ford + hijink fold onto Layer 1 (byte-identical)');
// =============================================================================
// The last two ad-hoc 1d20 resolvers fold onto rollProficiencyThrow. journeyFordingThrow
// (RR p.271 Swimming) keeps its EXACT shipped behaviour — autoFailBand:0, NO nat-1 auto-fail —
// so the fold is byte-identical (the RR pp.9–10 nat-1 rule is a separate question, not changed
// here). The hijink throw (RR p.360) sources its d20 from Layer 1; its three-way outcome stays in
// hijinkResolveThrow. Recon is a 2d6 banded roll (RR p.452) — NOT a proficiency throw (DQ7) — and
// is deliberately NOT folded.

// journeyFordingThrow (RR p.271) — delegates to Layer 1; autoFailBand:0 (no nat-1 rule) preserved.
(() => {
  const camp = ACKS.blankCampaign({ name: 'pt5-ford' });
  camp.characters = [ACKS.blankCharacter({ id: 'sw', name: 'Swimmer', proficiencies: [{ key: 'swimming', ranks: 1 }] })];
  const jr = { participantCharacterIds: ['sw'] };
  const f = ACKS.journeyFordingThrow(camp, jr, { rng: fixedRng(0.5) });   // natural 11, +2 Swimming → 13 ≥ 11
  ok('journeyFordingThrow: rng 0.5, +2 Swimming vs 11+ → 11 / total 13 / success', f.rolled === 11 && f.bonus === 2 && f.total === 13 && f.success === true);
  const l1 = ACKS.rollProficiencyThrow({ target: 11, modifiers: [{ value: 2 }], autoFailBand: 0, proficient: false, rng: fixedRng(0.5) });
  ok('journeyFordingThrow delegates to Layer 1 (same natural/total/success)', f.rolled === l1.natural && f.total === l1.total && f.success === l1.success);
  const f1 = ACKS.journeyFordingThrow(camp, jr, { rng: fixedRng(0) });    // natural 1: fails the COMPARE (3<11), not an auto-fail
  ok('journeyFordingThrow: natural 1 fails by compare, not auto-fail (autoFailBand:0 preserved)', f1.rolled === 1 && f1.total === 3 && f1.success === false && f1.botch === undefined);
  const coldF = ACKS.journeyFordingThrow(camp, jr, { rng: fixedRng(0.95), coldWater: true });
  ok('journeyFordingThrow cold water raises the target 11→13', coldF.target === 13);
})();

// hijink d20-source equivalence the fold relies on: _d(rng,20) === rollProficiencyThrow natural.
[0, 0.1, 0.37, 0.5, 0.999].forEach(v => {
  ok('hijink die equivalence at rng ' + v + ': Layer-1 natural === 1+floor(rng*20)',
    ACKS.rollProficiencyThrow({ target: 11, rng: fixedRng(v) }).natural === (Math.floor(v * 20) + 1));
});
// hijinkResolveThrow's bespoke THREE-way outcome is unchanged (the die is sourced from Layer 1 at the
// startHijink roll site; the byte-identical hijinks.smoke seeds startHijink + asserts exact outcomes).
ok('hijinkResolveThrow: nat-1 = caught', ACKS.hijinkResolveThrow(1, { target: 11, bonus: 20 }).outcome === 'caught');
ok('hijinkResolveThrow: fail-by-14 = caught', ACKS.hijinkResolveThrow(2, { target: 18, bonus: 0 }).outcome === 'caught');
ok('hijinkResolveThrow: total>=target = success', ACKS.hijinkResolveThrow(11, { target: 11, bonus: 0 }).outcome === 'success');
ok('hijinkResolveThrow: total<target (no caught band) = fail', ACKS.hijinkResolveThrow(8, { target: 14, bonus: 0 }).outcome === 'fail');

// =============================================================================
section('Summary');
console.log('  Passed: ' + pass);
console.log('  Failed: ' + fail);
if(fail === 0){
  console.log('\nAll Proficiency Throws PT-0 + PT-1 + PT-5 + PT-6 smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nFAILURES:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
