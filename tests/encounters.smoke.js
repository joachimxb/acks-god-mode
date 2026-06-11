/* tests/encounters.smoke.js — #476 Encounter layer E1 (D8–D12; plan §15, survey §19).
 *
 *   node tests/encounters.smoke.js   (or via `npm test`)
 *
 * E1 = the RAW pre-combat procedure as engine: the catalogs (RR pp.280–287 — distance /
 * visibility / the Surprise Matrix / evasion / reactions / influence / bribes — and the JJ
 * layer pp.41–44 — the territory-classification category draw, rarity, frequencies), the
 * Encounter entity (campaign.encounters[], enc-), the step verbs, the encounterDraw seam
 * (pool-first D5 → category draw + gm-pick; #141 fills identity later), and the triggers
 * (journey per-hex, search-hour, the slot-80 rest/night day consumer). Combat itself and
 * the 1d100 identity tables stay #141 (D10/D12).
 */
'use strict';
const path = require('path');
const DIR = path.join(__dirname, '..');
[
  'acks-engine-catalogs.js', 'acks-engine-monsters.js', 'acks-engine-encounter-tables.js', 'acks-engine.js', 'acks-engine-entities.js', 'acks-engine-economy.js',
  'acks-engine-entity-registry.js', 'acks-engine-field-schemas.js', 'acks-engine-events.js', 'acks-engine-subsystems.js',
].forEach(f => require(path.join(DIR, f)));
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail) { if (cond) { pass++; } else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t) { console.log('\n— ' + t); }
// Finite dice tape: yields each value once, then repeats the last.
const seq = (...vals) => { let i = 0; return () => (i < vals.length ? vals[i++] : vals[vals.length - 1]); };

// =============================================================================
section('catalog — the Wilderness Encounter Distance table (RR pp.280–281, row-exact)');
{
  const want = {
    'barrens': 'open', 'desert-rocky': 'vast', 'desert-sandy': 'open',
    'forest-deciduous': 'close', 'forest-taiga': 'medium',
    'grassland-other': 'open', 'grassland-steppe': 'vast',
    'hills-forested': 'close', 'hills-rocky': 'open',
    'jungle': 'very-close',
    'mountains-forested': 'close', 'mountains-rocky': 'open',
    'scrubland-sparse': 'open', 'scrubland-dense': 'medium',
    'swamp-marshy': 'medium', 'swamp-scrubby': 'close', 'swamp-forested': 'very-close'
  };
  ok('17 terrain rows', Object.keys(ACKS.ENCOUNTER_TERRAIN_ROWS).length === 17);
  ok('every row distance-class matches RAW', Object.keys(want).every(k => ACKS.ENCOUNTER_TERRAIN_ROWS[k] && ACKS.ENCOUNTER_TERRAIN_ROWS[k].distance === want[k]));
  const C = ACKS.ENCOUNTER_DISTANCE_CLASSES;
  ok("very-close 5d4×3' (avg 38)", C['very-close'].n === 5 && C['very-close'].d === 4 && C['very-close'].multFt === 3 && C['very-close'].avgFt === 38);
  ok("close 5d8×3' (68)",          C['close'].n === 5 && C['close'].d === 8 && C['close'].multFt === 3 && C['close'].avgFt === 68);
  ok("medium 3d6×15' (157)",       C['medium'].n === 3 && C['medium'].d === 6 && C['medium'].multFt === 15 && C['medium'].avgFt === 157);
  ok("open 4d6×30' (420)",         C['open'].n === 4 && C['open'].d === 6 && C['open'].multFt === 30 && C['open'].avgFt === 420);
  ok("vast 6d20×30' (1890)",       C['vast'].n === 6 && C['vast'].d === 20 && C['vast'].multFt === 30 && C['vast'].avgFt === 1890);
  ok("dungeon 2d6×10' (70)",       C['dungeon'].n === 2 && C['dungeon'].d === 6 && C['dungeon'].multFt === 10 && C['dungeon'].avgFt === 70);
  // rollEncounterDistanceFt: 6d20×30 at max rng → 6×20×30 = 3600
  ok('distance roll honours the dice (steppe max 3600)', ACKS.rollEncounterDistanceFt('grassland-steppe', () => 0.999) === 3600);
}

section('catalog — encounterRowKey resolution (RAW folds + bare-base defaults + aliases)');
{
  const k = ACKS.encounterRowKey;
  ok('exact row passes through', k('grassland-steppe') === 'grassland-steppe');
  ok('RAW fold: hills-terraced → hills-rocky', k('hills-terraced') === 'hills-rocky');
  ok('RAW fold: mountains-snowy/terraced → mountains-rocky', k('mountains-snowy') === 'mountains-rocky' && k('mountains-terraced') === 'mountains-rocky');
  ok('🔧 fold: mountains-volcanic → mountains-rocky', k('mountains-volcanic') === 'mountains-rocky');
  ok('grassland farm/prairie/savanna → grassland-other', k('grassland-farm') === 'grassland-other' && k('grassland-savanna') === 'grassland-other');
  ok('scrubland low/high synonyms', k('scrubland-low') === 'scrubland-sparse' && k('scrubland-high') === 'scrubland-dense');
  ok('barrens-*/jungle-* are RAW "(any)"', k('barrens-tundra') === 'barrens' && k('jungle-dense') === 'jungle');
  ok('bare-base defaults (🔧 common variant)', k('forest') === 'forest-deciduous' && k('swamp') === 'swamp-marshy' && k('desert') === 'desert-sandy' && k('hills') === 'hills-rocky' && k('mountains') === 'mountains-rocky' && k('scrubland') === 'scrubland-sparse' && k('grassland') === 'grassland-other');
  ok('legacy terrain aliases fold through terrainBase (tundra → barrens)', k('tundra') === 'barrens');
  ok('water / unknown → null (sea scale reserved)', k('water') === null && k('nonsense') === null);
}

section('catalog — maximum visibility + the colossal-dragon worked example (RR p.281)');
{
  ok('light bases 600/300/150/75', ACKS.VISIBILITY_BASE_FT['daylight'] === 600 && ACKS.VISIBILITY_BASE_FT['full-moon'] === 300 && ACKS.VISIBILITY_BASE_FT['half-moon'] === 150 && ACKS.VISIBILITY_BASE_FT['starlight'] === 75);
  ok('formation multipliers (9→1, 10→1.5, 31→2, 61→3, 241→5)', ACKS.formationVisibilityMult(9) === 1 && ACKS.formationVisibilityMult(10) === 1.5 && ACKS.formationVisibilityMult(31) === 2 && ACKS.formationVisibilityMult(61) === 3 && ACKS.formationVisibilityMult(241) === 5);
  ok('size counting: mounted/large 2, huge 6, gigantic 24, colossal 120', ACKS.ENCOUNTER_SIZE_MEN.mounted === 2 && ACKS.ENCOUNTER_SIZE_MEN.huge === 6 && ACKS.ENCOUNTER_SIZE_MEN.gigantic === 24 && ACKS.ENCOUNTER_SIZE_MEN.colossal === 120);
  // RR p.281: 20 mounted adventurers (=40 men) vs a colossal dragon (=120 men) on the steppe;
  // rolled 1,710'. Party visible to the dragon at 1,200'; dragon visible to the party at 1,800'.
  // The encounter begins at 1,710' with the ADVENTURERS having detected the dragon.
  const d = ACKS.computeEncounterDistance({ terrainRow: 'grassland-steppe', rolledFt: 1710, sideACount: 40, sideBCount: 120 });
  ok('dragon example: caps 1200/1800 → distance 1710', d.capFt === 1800 && d.distanceFt === 1710);
  ok('dragon example: the party detects the dragon', d.detectedBy === 'party');
  // when the roll exceeds every cap, the distance clamps to the larger cap
  const d2 = ACKS.computeEncounterDistance({ terrainRow: 'grassland-steppe', rolledFt: 3000, sideACount: 1, sideBCount: 1 });
  ok('roll past visibility clamps to the cap (600 man vs man, daylight)', d2.distanceFt === 600 && d2.detectedBy === 'both');
}

section('catalog — the Surprise Matrix decomposed (RR pp.281–283, all 16 cells)');
{
  const S = ACKS.SURPRISE_AWARENESS_STATES, key = ACKS.surpriseAwarenessKey, el = ACKS.encounterEvadeEligibility;
  ok('fore+los = not surprised', S['fore+los'].rolls === false);
  ok('fore = roll at +1',  S['fore'].rolls === true && S['fore'].mod === 1);
  ok('los = roll at +0',   S['los'].rolls === true && S['los'].mod === 0);
  ok('none = roll at −1',  S['none'].rolls === true && S['none'].mod === -1);
  ok('awareness key composition', key(true, true) === 'fore+los' && key(true, false) === 'fore' && key(false, true) === 'los' && key(false, false) === 'none');
  // Evade eligibility, cell by cell (adventurer row × monster column):
  const states = ['fore+los', 'fore', 'los', 'none'];
  const want = {
    'fore+los': { 'fore+los': 'cannot', 'fore': 'can', 'los': 'can', 'none': 'always' },
    'fore':     { 'fore+los': 'cannot', 'fore': 'can', 'los': 'can', 'none': 'can' },
    'los':      { 'fore+los': 'cannot', 'fore': 'can', 'los': 'can', 'none': 'can' },
    'none':     { 'fore+los': 'cannot', 'fore': 'cannot', 'los': 'cannot', 'none': 'no-encounter' }
  };
  ok('all 16 matrix cells match RAW', states.every(a => states.every(m => el(a, m) === want[a][m])));
  // the roll: 1d6, 2− surprised
  ok('surprise throw: 2− = surprised', ACKS.rollSurpriseThrow({ mod: 0, rng: () => 0.2 }).surprised === true   // d6 2
    && ACKS.rollSurpriseThrow({ mod: 0, rng: () => 0.4 }).surprised === false                                   // d6 3
    && ACKS.rollSurpriseThrow({ mod: 1, rng: () => 0.2 }).surprised === false                                   // 2+1=3
    && ACKS.rollSurpriseThrow({ mod: -2, rng: () => 0.5 }).surprised === true);                                 // 4−2=2
}

section('catalog — the Evasion Throw by Terrain table (RR pp.284–285, row-exact + bands)');
{
  const base = { 'forest-deciduous': 2, 'jungle': 2, 'swamp-forested': 2,
                 'forest-taiga': 5, 'hills-forested': 5, 'mountains-forested': 5, 'swamp-scrubby': 5,
                 'grassland-other': 9, 'scrubland-dense': 9, 'swamp-marshy': 9,
                 'barrens': 12, 'desert-sandy': 12, 'hills-rocky': 12, 'mountains-rocky': 12, 'scrubland-sparse': 12,
                 'desert-rocky': 16, 'grassland-steppe': 16 };
  ok('every evasion base matches RAW', Object.keys(base).every(k => ACKS.ENCOUNTER_TERRAIN_ROWS[k].evasionBase === base[k]));
  ok('size bands +2 each (6−/14/30/60/61+)', ACKS.evasionTargetFor('jungle', 6).target === 2 && ACKS.evasionTargetFor('jungle', 7).target === 4 && ACKS.evasionTargetFor('jungle', 15).target === 6 && ACKS.evasionTargetFor('jungle', 31).target === 8 && ACKS.evasionTargetFor('jungle', 61).target === 10);
  // RR p.285 worked example: party of 40 on the steppe → 22+
  ok('steppe at party size 40 = 22+ (the worked example)', ACKS.evasionTargetFor('grassland-steppe', 40).target === 22);
  ok('aerial penalty waived in forest/forested-hills/forested-mtns/dense-scrub/jungle/swamp', ['forest-deciduous','forest-taiga','hills-forested','mountains-forested','scrubland-dense','jungle','swamp-marshy','swamp-scrubby','swamp-forested'].every(r => ACKS.EVASION_AERIAL_EXEMPT_ROWS.indexOf(r) >= 0));
  ok('evasion throw: d20 + mods ≥ target', ACKS.attemptEvasionThrow({ target: 17, modifiers: [{ label: 'explorer', value: 5 }], rng: () => 0.6 }).success === true   // 13+5 ≥ 17
    && ACKS.attemptEvasionThrow({ target: 17, rng: () => 0.6 }).success === false);
  ok('autoSuccess short-circuits', ACKS.attemptEvasionThrow({ autoSuccess: true }).success === true && ACKS.attemptEvasionThrow({ autoSuccess: true }).auto === true);
  const am = ACKS.rollEvasionAftermath({ terrainRow: 'grassland-steppe', rng: seq(0.5, 0.5) });
  ok('aftermath: displacement + 1d12 clock + hex face + nav −4', am.distanceFt > 0 && am.clockDirection >= 1 && am.clockDirection <= 12 && am.hexFace === Math.ceil(am.clockDirection / 2) && am.navThrowModifier === -4);
}

section('catalog — reactions + clamps (RR pp.285–286)');
{
  ok('bands: 2− hostile / 3–5 unfriendly / 6–8 neutral / 9–11 indifferent / 12+ friendly',
    ACKS.reactionBandFor(2) === 'hostile' && ACKS.reactionBandFor(3) === 'unfriendly' && ACKS.reactionBandFor(5) === 'unfriendly'
    && ACKS.reactionBandFor(6) === 'neutral' && ACKS.reactionBandFor(8) === 'neutral'
    && ACKS.reactionBandFor(9) === 'indifferent' && ACKS.reactionBandFor(11) === 'indifferent' && ACKS.reactionBandFor(12) === 'friendly');
  // natural 2 never better than Unfriendly (even with a huge bonus)
  const nat2 = ACKS.rollEncounterReaction({ chaMod: 9, rng: () => 0.05 });     // 1+1 = natural 2, total 11
  ok('natural-2 clamp caps at unfriendly', nat2.natural === 2 && nat2.band === 'unfriendly' && nat2.clamped === 'natural-2');
  // natural 12 never worse than Indifferent (even with heavy penalties)
  const nat12 = ACKS.rollEncounterReaction({ chaMod: -9, rng: () => 0.95 });   // 6+6 = natural 12, total 3
  ok('natural-12 clamp floors at indifferent', nat12.natural === 12 && nat12.band === 'indifferent' && nat12.clamped === 'natural-12');
}

section('catalog — influence ladder + shifts + bribes (RR pp.286–287)');
{
  const L = ACKS.INFLUENCE_ATTEMPT_LADDER;
  ok('ladder: round / turn / hour / work-day / 5 work-days', L.length === 5 && /round/.test(L[0].time) && /turn/.test(L[1].time) && /hour/.test(L[2].time) && /work-day/.test(L[3].time) && /5 work-days/.test(L[4].time));
  ok('#346 slots: incidental ×2, ancillary, dedicated, dedicated×5d', L[0].activitySlot === 'incidental' && L[1].activitySlot === 'incidental' && L[2].activitySlot === 'ancillary' && L[3].activitySlot === 'dedicated' && L[4].activitySlot === 'dedicated' && L[4].days === 5);
  ok('attempt 7 reads the 5th+ row', ACKS.influenceAttemptInfo(7).days === 5);
  const sh = ACKS.applyInfluenceShift;
  ok('hostile roll shifts 2 toward hostile', sh('indifferent', 'hostile').to === 'unfriendly');
  ok('friendly roll shifts 2 toward friendly', sh('unfriendly', 'friendly').to === 'indifferent');
  ok('neutral roll pulls toward neutral from both sides', sh('friendly', 'neutral').to === 'indifferent' && sh('hostile', 'neutral').to === 'unfriendly' && sh('neutral', 'neutral').shift === 0);
  ok('shifts clamp at the ends', sh('hostile', 'hostile').to === 'hostile' && sh('friendly', 'friendly').to === 'friendly');
  ok('bribe tiers: week/month/year — day/week/month proficient', ACKS.bribeBonusInfo(2, false).pay === 'month' && ACKS.bribeBonusInfo(2, true).pay === 'week' && ACKS.bribeBonusInfo(3, false).pay === 'year');
  ok('Bribery proficiency removes the backlash', ACKS.bribeBonusInfo(1, false).backlashOnFail === true && ACKS.bribeBonusInfo(1, true).backlashOnFail === false);
}

section('catalog — the category draw (JJ pp.41–42) + rarity (JJ p.44) + frequencies');
{
  const idx = ACKS.encounterCategoryColumnIndex;
  ok('column folding: road one left, night one right', idx('civilized', { road: true }) === 0 && idx('civilized', {}) === 1 && idx('borderlands', { road: true }) === 1 && idx('borderlands', {}) === 2 && idx('outlands', { road: true }) === 2 && idx('outlands', {}) === 3 && idx('unsettled', { road: true }) === 3 && idx('unsettled', {}) === 4);
  ok('night shifts civ/border/outlands right (not unsettled)', idx('civilized', { night: true }) === 2 && idx('outlands', { night: true }) === 4 && idx('unsettled', { night: true }) === 4);
  const roll = (t, o, r) => ACKS.rollEncounterCategory(Object.assign({ territoryClass: t, rng: () => r }, o));
  // Column boundaries (die = 1+floor(r×20)): civilized+road has NO monster row at all.
  ok('civilized+road: 12–20 civilized, 2–11 none, no monster row', roll('civilized', { road: true }, 0.58).category === 'civilized' && roll('civilized', { road: true }, 0.5).category === 'no-encounter' && !ACKS.ENCOUNTER_CATEGORY_COLUMNS[0].rows.monster);
  ok('civilized: 18 monster / 19 dangerous / 20 valuable', roll('civilized', {}, 0.86).category === 'monster' && roll('civilized', {}, 0.92).category === 'dangerous' && roll('civilized', {}, 0.97).category === 'valuable');
  ok('borderlands: 9–13 civ / 14–15 monster / 20 unique', roll('borderlands', {}, 0.42).category === 'civilized' && roll('borderlands', {}, 0.68).category === 'monster' && roll('borderlands', {}, 0.97).category === 'unique');
  ok('outlands: 12–15 monster / 18–19 valuable', roll('outlands', {}, 0.58).category === 'monster' && roll('outlands', {}, 0.9).category === 'valuable');
  ok('unsettled: 1–6 none / 7–12 monster / 19–20 unique', roll('unsettled', {}, 0.25).category === 'no-encounter' && roll('unsettled', {}, 0.5).category === 'monster' && roll('unsettled', {}, 0.95).category === 'unique');
  // natural 1 = column shift + roll again (chains rightward; unsettled has no shift row)
  const chain = ACKS.rollEncounterCategory({ territoryClass: 'civilized', road: true, rng: seq(0.0, 0.0, 0.0, 0.0, 0.25) });
  ok('natural-1 chain walks columns rightward then resolves', chain.rolls.length === 5 && chain.rolls[4].column === 'unsettled' && chain.category === 'no-encounter');
  // resting / known-route demote TERRAIN categories only (JJ p.42 step 7)
  ok('resting demotes a terrain find to no-encounter (flagged)', (function(){ const r = ACKS.rollEncounterCategory({ territoryClass: 'unsettled', resting: true, rng: () => 0.7 }); return r.category === 'no-encounter' && r.demoted === 'dangerous'; })());
  ok('resting does NOT demote a monster', ACKS.rollEncounterCategory({ territoryClass: 'unsettled', resting: true, rng: () => 0.5 }).category === 'monster');
  // rarity (JJ p.44): boundaries per territory class; civilized has no very-rare
  const rar = (t, r) => ACKS.rollEncounterRarity(t, () => r).rarity;
  ok('civilized rarity 1–14 C / 15–19 U / 20 R (no VR)', rar('civilized', 0.65) === 'common' && rar('civilized', 0.72) === 'uncommon' && rar('civilized', 0.97) === 'rare' && ACKS.ENCOUNTER_RARITY_BY_TERRITORY['civilized'].length === 3);
  ok('unsettled rarity 1–8 / 9–14 / 15–18 / 19–20 VR', rar('unsettled', 0.35) === 'common' && rar('unsettled', 0.5) === 'uncommon' && rar('unsettled', 0.78) === 'rare' && rar('unsettled', 0.95) === 'very-rare');
  // frequencies (JJ p.41)
  const F = ACKS.ENCOUNTER_FREQUENCY;
  ok('frequency table matches RAW (resting-night per 7/3 nights / 12h / 12h)', F['resting-night'].civilized === 'per-7-nights' && F['resting-night'].borderlands === 'per-3-nights' && F['resting-night'].outlands === 'per-12-hours' && F['resting-night'].unsettled === 'per-12-hours' && F['resting-day'].unsettled === 'per-12-hours' && F['resting-day'].outlands === null && F['traveling'].civilized === 'per-hex' && F['searching'].unsettled === 'per-hour');
  ok('rest checks: unsettled day+night, outlands nights, borderlands every 3rd, civilized every 7th',
    ACKS.restEncounterChecksForDay('unsettled', 100).length === 2
    && ACKS.restEncounterChecksForDay('outlands', 100).length === 1
    && ACKS.restEncounterChecksForDay('borderlands', 99).length === 1 && ACKS.restEncounterChecksForDay('borderlands', 100).length === 0
    && ACKS.restEncounterChecksForDay('civilized', 98).length === 1 && ACKS.restEncounterChecksForDay('civilized', 99).length === 0);
}

section('catalog — territoryClassForHex (domain classification, else unsettled)');
{
  const c = ACKS.blankCampaign({ name: 'tc' });
  c.domains = [{ id: 'dom-1', classification: 'Civilized', demographics: {} }];
  c.hexes = [ACKS.blankHex({ id: 'hex-c' }), ACKS.blankHex({ id: 'hex-w' })];
  c.hexes[0].domainId = 'dom-1';   // stamped by liftToTopLevelCollections in real loads
  ok('domain hex reads the domain classification (lowercased)', ACKS.territoryClassForHex(c, c.hexes[0]) === 'civilized');
  ok('domainless hex is unsettled', ACKS.territoryClassForHex(c, c.hexes[1]) === 'unsettled');
  ok('null hex is unsettled', ACKS.territoryClassForHex(c, null) === 'unsettled');
}

// =============================================================================
section('entity — blankEncounter (D8) + lifecycle + registry');
{
  const e = ACKS.blankEncounter();
  ok('schemaVersion 2 + enc- prefix', e.schemaVersion === 2 && /^enc-/.test(e.id));
  ok("ID prefix 'encounter' registered as 'enc'", ACKS.ID_PREFIXES.encounter === 'enc');
  ok('defaults: wilderness / gm-authored / active / setup', e.scale === 'wilderness' && e.trigger === 'gm-authored' && e.status === 'active' && e.phase === 'setup' && e.outcome === null);
  ok('sides default empty', e.partySide.characterIds.length === 0 && e.monsterSide.source === 'fresh' && e.monsterSide.groupIds.length === 0);
  ok('step state slots default null', e.distance === null && e.surprise === null && e.evasion === null && e.reaction === null && e.pursuit === null);
  const c = ACKS.blankCampaign({ name: 'ent' });
  ACKS.migrateCampaign(c);
  ok('migrate seeds campaign.encounters[]', Array.isArray(c.encounters));
  const enc = ACKS.createEncounter(c, { trigger: 'gm-authored' });
  ok('createEncounter pushes + history-stamps', c.encounters.length === 1 && enc.history.length === 1 && enc.history[0].type === 'created');
  ok('createEncounter is id-idempotent (commit replays)', ACKS.createEncounter(c, { id: enc.id }) === enc && c.encounters.length === 1);
  ok('lookups: findEncounter / activeEncounters', ACKS.findEncounter(c, enc.id) === enc && ACKS.activeEncounters(c).length === 1);
  const r = ACKS.resolveEncounter(c, enc.id, 'dismissed');
  ok('resolveEncounter flips + stamps + is idempotent', r.status === 'resolved' && r.outcome === 'dismissed' && ACKS.resolveEncounter(c, enc.id, 'combat').outcome === 'dismissed');
  ok('resolved encounters persist (world memory, D9 reads them at E2)', c.encounters.length === 1 && ACKS.activeEncounters(c).length === 0);
  ok('entity-registry kind registered', !!ACKS.entityKinds().find(k => k.kind === 'encounter'));
}

section('the step verbs — awareness → surprise → evasion → reaction → influence (RR pp.281–287)');
{
  const c = ACKS.blankCampaign({ name: 'walk' });
  ACKS.migrateCampaign(c);
  c.hexes = [ACKS.blankHex({ id: 'hex-w', terrain: 'grassland', terrainSubtype: 'steppe' })];
  const face = ACKS.blankCharacter({ name: 'Face' }); face.abilities = { STR: 9, INT: 9, WIL: 9, DEX: 9, CON: 9, CHA: 16 };
  c.characters.push(face);
  const enc = ACKS.createEncounter(c, { trigger: 'gm-authored', hexId: 'hex-w', category: 'monster',
    partySide: { characterIds: [face.id], faceCharacterId: face.id, sizeCount: 5 },
    monsterSide: { monsterCatalogKey: 'orc', count: 6 } });
  // None × None = no encounter — auto-resolved (RR p.281)
  const ghost = ACKS.createEncounter(c, { trigger: 'rest-night' });
  const aw0 = ACKS.encounterSetAwareness(c, ghost.id, {});
  ok('None × None auto-resolves as no-encounter', aw0.noEncounter === true && ghost.status === 'resolved' && ghost.outcome === 'no-encounter');
  ok('the no-encounter resolution event is campaignLogHidden', (function(){ const w = c.eventLog.find(x => x.event.kind === 'encounter-resolved' && x.event.payload.encounterId === ghost.id); return !!(w && w.event.campaignLogHidden); })());
  // party fore+los × monsters none → always evade
  const aw = ACKS.encounterSetAwareness(c, enc.id, { partyForeknowledge: true, partyLineOfSight: true });
  ok('awareness → evade eligibility from the matrix', aw.ok && enc.surprise.evadeEligibility === 'always' && enc.phase === 'surprise');
  const sup = ACKS.encounterRollSurprise(c, enc.id, { rng: () => 0.9 });
  ok('surprise: fore+los side does not roll; the other rolls at −1', sup.ok && enc.surprise.party.roll === null && enc.surprise.party.surprised === false && enc.surprise.monsters.roll && enc.surprise.monsters.roll.mod === -1);
  ok('phase advances to evasion when eligible + unsurprised', enc.phase === 'evasion');
  // evasion: steppe size 5 → 16+; rng 0.9 → d20 19 ≥ 16 → evaded + aftermath + resolved
  const ev = ACKS.encounterAttemptEvasion(c, enc.id, { rng: seq(0.9, 0.5, 0.5) });
  ok('evasion success resolves the encounter as evaded', ev.ok && ev.evasion.success && enc.status === 'resolved' && enc.outcome === 'evaded');
  ok('evasion target = terrain × size (steppe ≤6 → 16+)', ev.evasion.target === 16);
  ok('the aftermath rides the entity (displacement + clock + nav −4)', enc.evasion.aftermath && enc.evasion.aftermath.distanceFt > 0 && enc.evasion.aftermath.clockDirection >= 1 && enc.evasion.aftermath.navThrowModifier === -4);
  // a fresh encounter for the interaction path
  const enc2 = ACKS.createEncounter(c, { trigger: 'gm-authored', hexId: 'hex-w', category: 'monster',
    partySide: { characterIds: [face.id], faceCharacterId: face.id, sizeCount: 5 },
    monsterSide: { monsterCatalogKey: 'orc', count: 6 } });
  ACKS.encounterSetAwareness(c, enc2.id, { partyForeknowledge: true, partyLineOfSight: true, monsterForeknowledge: true, monsterLineOfSight: true });
  ok('monsters fore+los → cannot evade', enc2.surprise.evadeEligibility === 'cannot');
  ACKS.encounterRollSurprise(c, enc2.id, { rng: () => 0.9 });
  ok('phase goes straight to interaction when evasion is off the table', enc2.phase === 'interaction');
  ok('attemptEvasion refuses when ineligible', ACKS.encounterAttemptEvasion(c, enc2.id, {}).error === 'cannot-evade');
  // reaction: 2d6 at 0.5 = 4+4 = 8, +2 CHA (16) = 10 → indifferent; face CHA auto-derived
  const re = ACKS.encounterRollReaction(c, enc2.id, { rng: () => 0.5 });
  ok('reaction auto-derives the face CHA (+2 at 16)', re.ok && re.roll.chaMod === 2 && re.roll.total === 10 && enc2.reaction.current === 'indifferent');
  ok('a second initial roll is refused (use influence)', ACKS.encounterRollReaction(c, enc2.id, {}).error === 'already-rolled-use-influence');
  ok('evasion is barred once interacting (RR p.287)', ACKS.encounterAttemptEvasion(c, enc2.id, {}).error === 'already-interacting');
  // influence: the ladder + the #346 cost event on the 3rd attempt
  const logLen = c.eventLog.length;
  ACKS.encounterAttemptInfluence(c, enc2.id, { rng: () => 0.9 });   // attempt 1 — 1 round (incidental)
  ACKS.encounterAttemptInfluence(c, enc2.id, { rng: () => 0.9 });   // attempt 2 — 1 turn (incidental)
  const i3 = ACKS.encounterAttemptInfluence(c, enc2.id, { rng: () => 0.9 });   // attempt 3 — 1 hour (ancillary)
  ok('influence attempts shift the standing attitude', enc2.reaction.current === 'friendly');
  ok('every attempt emits a record-only, hidden encounter-influence event', c.eventLog.length === logLen + 3 && c.eventLog.slice(logLen).every(w => w.event.kind === 'encounter-influence' && w.event.campaignLogHidden === true));
  ok('the 3rd attempt carries the ancillary #346 cost', i3.event.payload.activityCost && i3.event.payload.activityCost.slot === 'ancillary' && i3.event.payload.activityCost.kind === 'encounter-influence');
  ok('the 1st/2nd attempts carry no cost (incidental)', c.eventLog[logLen].event.payload.activityCost === null);
  ok('subdayContext.encounterId gets its first referent', i3.event.subdayContext && i3.event.subdayContext.cadence === 'encounter' && i3.event.subdayContext.encounterId === enc2.id);
  // the #346 budget actually counts it
  const budget = ACKS.characterActivityBudget(c, face.id);
  ok('the day budget counts the parley hour (1 ancillary)', budget && budget.ancillaryUsed >= 1 && (budget.ancillary || []).some(a => a.kind === 'encounter-influence'));
  // a failed bribe backlashes one step toward hostile (no Bribery proficiency)
  const enc3 = ACKS.createEncounter(c, { trigger: 'gm-authored', hexId: 'hex-w', category: 'monster', partySide: { characterIds: [face.id], faceCharacterId: face.id } });
  ACKS.encounterRollReaction(c, enc3.id, { chaMod: 0, rng: () => 0.5 });            // 8 → neutral
  const ib = ACKS.encounterAttemptInfluence(c, enc3.id, { chaMod: 0, rng: () => 0.4, bribe: { bonus: 1 } });   // 3+3+1 = 7 → neutral → no move toward friendly
  ok('a failed bribe backlashes one step toward hostile', ib.attempt.bribe.backlash === true && enc3.reaction.current === 'unfriendly');
  // resolution: the comprehensive event
  const res = ACKS.recordEncounterResolved(c, enc2.id, 'parleyed');
  ok('recordEncounterResolved emits the comprehensive event + flips the entity', res.ok && enc2.status === 'resolved' && res.event.payload.outcome === 'parleyed' && res.event.payload.reaction.current === 'friendly' && res.event.payload.reaction.attempts === 4);
  ok('the resolution names both sides in the context envelope', res.event.context.relatedEntities.some(r => r.kind === 'encounter' && r.id === enc2.id) && res.event.context.relatedEntities.some(r => r.kind === 'character' && r.id === face.id));
  ok('resolvedByEventId backlinks the event', enc2.resolvedByEventId === res.event.id);
}

// =============================================================================
section('trigger — journey per-hex draw → commit materializes the entity (byte-stable)');
{
  const c = ACKS.blankCampaign({ name: 'jt' });
  ACKS.migrateCampaign(c);
  c.currentTurn = 1; c.currentDayInMonth = 1; c.calendar = { year: 1, month: 1, day: 1 };
  c.hexes = [ACKS.blankHex({ id: 'hex-a', coord: { q: 0, r: 0 }, terrain: 'grassland' }),
             ACKS.blankHex({ id: 'hex-b', coord: { q: 12, r: 0 }, terrain: 'grassland' })];
  c.characters = [ACKS.blankCharacter({ id: 'chr-1', name: 'Scout' })];
  const j = ACKS.blankJourney({ id: 'jrn-1', name: 'Run', participantCharacterIds: ['chr-1'], startHexId: 'hex-a', destinationHexId: 'hex-b',
    supplies: { rations: 12, waterRations: 12, animalFeed: 0, animalWater: 0, shipStores: 0 } });
  c.journeys = [j];
  c.houseRules = { 'auto-pause-on-encounter': false, 'auto-pause-on-navigation-fail': false, 'auto-pause-on-supplies-low': false };
  ACKS.startJourney(c, j);
  // rng 0.5 ⇒ every category d20 = 11 → monster per hex entered (unsettled)
  const prop = ACKS.proposeJourneyDay(c, { dayInMonth: 2, rng: () => 0.5 });
  const rec = prop.pendingRecords[0];
  ok('the day record carries the encounter proposals (draw + distance)', Array.isArray(rec.encounterProposals) && rec.encounterProposals.length >= 1 && rec.encounterProposals[0].draw && rec.encounterProposals[0].distance);
  const epId = rec.encounterProposals[0].id;
  ok('the proposal id is a real enc- id', /^enc-[a-z0-9]{7}/.test(epId));
  // collision-proof minting: a constant rng mints the same BASE for every hex — the batch map
  // suffixes each subsequent mint, so two different encounters can never silently merge.
  ok('a multi-hex day mints DISTINCT proposal ids even on a constant rng', (function(){
    const ids = rec.encounterProposals.map(p => p.id);
    return ids.length === new Set(ids).size;
  })());
  ok('nothing is materialized at propose time', !ACKS.findEncounter(c, epId));
  ACKS.commitJourneyRecord(c, rec);
  const made = ACKS.findEncounter(c, epId);
  ok('commit materializes the entity under the preview id', !!made && made.trigger === 'journey-travel' && made.category === 'monster');
  ok('the pre-rolled distance lands verbatim', made.distance && made.distance.distanceFt === rec.encounterProposals[0].distance.distanceFt);
  ok('the party side carries the journey + travellers', made.partySide.journeyId === 'jrn-1' && made.partySide.characterIds.indexOf('chr-1') >= 0);
  // E2: the committed day-record notable digest KEEPS each notable's payload — the day-log
  // affordances (⚔ Resolve via payload.encounterId; M4's → lair / Track home via payload.lairId)
  // read it off the committed day. (It was being compacted away to {kind,type,text}.)
  ok('the committed day notable keeps its payload (encounterId reachable from the day log)', (function(){
    const dn = (((rec.dayRecord && rec.dayRecord.notableEvents) || rec.notableEvents) || []).filter(n => n && n.type === 'encounter');
    return dn.length >= 1 && dn.every(n => n.payload && /^enc-/.test(n.payload.encounterId || ''));
  })());
  ok('re-commit does not duplicate (id-idempotent)', (function(){ const n = c.encounters.length; ACKS.commitJourneyRecord(c, rec); return c.encounters.length === n; })());
  // reroll-revert drops the day's entities
  const nBefore = c.encounters.length;
  ACKS.rerollJourneyDay(c, j, { rng: () => 0.27 });   // re-run the day at a no-encounter die (d20 6)
  ok('rerollJourneyDay drops the reverted day\'s encounters', !ACKS.findEncounter(c, epId) && c.encounters.length < nBefore);
}

section('trigger — the rest/night consumer (slot 80; JJ p.41 frequencies)');
{
  const c = ACKS.blankCampaign({ name: 'camp' });
  ACKS.migrateCampaign(c);
  c.currentTurn = 1; c.currentDayInMonth = 1; c.calendar = { year: 1, month: 1, day: 1 };
  c.hexes = [ACKS.blankHex({ id: 'hex-wild', coord: { q: 0, r: 0 }, terrain: 'forest' })];
  const camper = ACKS.blankCharacter({ id: 'chr-camp', name: 'Warden' }); camper.currentHexId = 'hex-wild';
  c.characters = [camper];
  c.houseRules = { 'auto-pause-on-navigation-fail': false, 'auto-pause-on-supplies-low': false };
  // rng 0.5 ⇒ monster on both the day and night checks (unsettled = 2 checks/day)
  const prop = ACKS.proposeDayTick(c, 1, { rng: () => 0.5 });
  const recs = prop.pendingRecords.filter(r => r.kind === 'rest-encounter');
  ok('an unsettled camp faces the day AND night checks', recs.length === 2 && recs.some(r => r.period === 'day') && recs.some(r => r.period === 'night'));
  ok('the camp check pauses the tick (auto-pause-on-encounter default ON)', prop.paused === true && prop.pauseReasons.some(r => r.trigger === 'encounter' && r.consumer === 'encounters'));
  ACKS.commitDayTick(c, prop, null);
  const made = ACKS.findEncounter(c, recs[0].encounterId);
  ok('commit materializes the camp encounter (trigger rest-night)', !!made && made.trigger === 'rest-night' && made.partySide.characterIds.indexOf('chr-camp') >= 0);
  // a settled character is exempt (settlement encounters are a different layer — JJ p.41)
  const c2 = ACKS.blankCampaign({ name: 'town' });
  ACKS.migrateCampaign(c2);
  c2.currentTurn = 1; c2.currentDayInMonth = 1; c2.calendar = { year: 1, month: 1, day: 1 };
  c2.hexes = [ACKS.blankHex({ id: 'hex-town', coord: { q: 0, r: 0 }, terrain: 'grassland' })];
  c2.hexes[0].settlement = { id: 'set-1', name: 'Town', urbanFamilies: 100 };
  const townie = ACKS.blankCharacter({ id: 'chr-town', name: 'Burgher' }); townie.currentHexId = 'hex-town';
  c2.characters = [townie];
  ok('a settled character faces no wilderness rest checks', ACKS.proposeDayTick(c2, 1, { rng: () => 0.5 }).pendingRecords.filter(r => r.kind === 'rest-encounter').length === 0);
  // an in-transit traveller is the journeys consumer's (no double check)
  const c3 = ACKS.blankCampaign({ name: 'transit' });
  ACKS.migrateCampaign(c3);
  c3.currentTurn = 1; c3.currentDayInMonth = 1; c3.calendar = { year: 1, month: 1, day: 1 };
  c3.hexes = [ACKS.blankHex({ id: 'hex-a', coord: { q: 0, r: 0 }, terrain: 'grassland' }), ACKS.blankHex({ id: 'hex-b', coord: { q: 12, r: 0 }, terrain: 'grassland' })];
  c3.characters = [ACKS.blankCharacter({ id: 'chr-go', name: 'Mover' })];
  const j3 = ACKS.blankJourney({ id: 'jrn-3', participantCharacterIds: ['chr-go'], startHexId: 'hex-a', destinationHexId: 'hex-b', supplies: { rations: 12, waterRations: 12 } });
  c3.journeys = [j3];
  c3.houseRules = { 'auto-pause-on-encounter': false, 'auto-pause-on-navigation-fail': false, 'auto-pause-on-supplies-low': false };
  ACKS.startJourney(c3, j3);
  ok('an in-transit traveller is excluded from the rest checks', ACKS.proposeDayTick(c3, 1, { rng: () => 0.5 }).pendingRecords.filter(r => r.kind === 'rest-encounter').length === 0);
}

section('the seam — encounterDraw (pool-first D5 → category + gm-pick; #141 fills later)');
{
  const c = ACKS.blankCampaign({ name: 'seam' });
  ACKS.migrateCampaign(c);
  c.hexes = [ACKS.blankHex({ id: 'hex-l', terrain: 'hills' })];
  ACKS.generateLair(c, { monsterCatalogKey: 'orc', hexId: 'hex-l' });
  const d = ACKS.encounterDraw(c, 'hex-l', { rng: seq(0.5, 0.5, 0.0) });   // monster; d100 1 → at-lair
  ok('a monster draw at a lair hex is pool-identified', d.category === 'monster' && d.identity === 'pool' && d.proposal.source === 'existing-lair');
  const c2 = ACKS.blankCampaign({ name: 'fresh' });
  ACKS.migrateCampaign(c2);
  c2.hexes = [ACKS.blankHex({ id: 'hex-e', terrain: 'forest' })];
  const d2 = ACKS.encounterDraw(c2, 'hex-e', { rng: () => 0.5 });
  ok('an empty hex falls to gm-pick (identity tables are #141)', d2.category === 'monster' && d2.identity === 'gm-pick' && d2.proposal.source === 'fresh');
  // a null hexId (an unauthored sparse-route step) must NOT read the dynamic pool
  ACKS.createLair(c2, { status: 'dynamic', hexId: null, monsterCatalogKey: 'ogre' });
  const d3 = ACKS.encounterDraw(c2, null, { territoryClass: 'unsettled', rng: () => 0.5 });
  ok('a null hexId draws fresh (never the unplaced dynamic pool)', d3.category === 'monster' && d3.proposal.source === 'fresh');
}

// =============================================================================
section('priorReactionBetween (D9, E2) — prior attitude DERIVED from resolved meetings');
{
  const c = ACKS.blankCampaign({ name: 'memory' });
  ACKS.migrateCampaign(c);
  // A resolved parley with lair lai-x by chr-a's party, attitude unfriendly.
  const e1 = ACKS.createEncounter(c, { id: 'enc-m1', occurredAtTurn: 3, occurredOnDayInMonth: 5,
    monsterSide: { lairId: 'lai-x', groupIds: ['grp-1'] }, partySide: { partyId: 'pty-1', characterIds: ['chr-a', 'chr-b'] } });
  e1.reaction = { current: 'unfriendly', rolls: [] };
  ACKS.resolveEncounter(c, 'enc-m1', 'parleyed', { atTurn: 3, onDayInMonth: 5 });
  // Same lair, overlapping character in a DIFFERENT party → match (memory follows the people).
  const e2 = ACKS.createEncounter(c, { id: 'enc-m2', monsterSide: { lairId: 'lai-x' }, partySide: { partyId: 'pty-2', characterIds: ['chr-a', 'chr-c'] } });
  const p = ACKS.priorReactionBetween(c, e2);
  ok('lair + character overlap matches across parties', !!p && p.encounterId === 'enc-m1');
  ok('the prior carries outcome + last attitude + when', !!p && p.outcome === 'parleyed' && p.reaction === 'unfriendly' && p.atTurn === 3 && p.onDayInMonth === 5);
  ok('accepts an id as well as the entity', (ACKS.priorReactionBetween(c, 'enc-m2') || {}).encounterId === 'enc-m1');
  // Group overlap with NO lair binding also matches.
  const e3 = ACKS.createEncounter(c, { id: 'enc-m3', monsterSide: { lairId: null, groupIds: ['grp-1'] }, partySide: { characterIds: ['chr-b'] } });
  ok('group overlap matches without a lair binding', (ACKS.priorReactionBetween(c, e3) || {}).encounterId === 'enc-m1');
  // Same party id, disjoint characters → still a party-side match.
  const e4 = ACKS.createEncounter(c, { id: 'enc-m4', monsterSide: { lairId: 'lai-x' }, partySide: { partyId: 'pty-1', characterIds: ['chr-z'] } });
  ok('same party id matches with disjoint characters', (ACKS.priorReactionBetween(c, e4) || {}).encounterId === 'enc-m1');
  // No-matches: a different lair; an unbound fresh monster side; disjoint people.
  const e5 = ACKS.createEncounter(c, { id: 'enc-m5', monsterSide: { lairId: 'lai-OTHER' }, partySide: { characterIds: ['chr-a'] } });
  ok('a different lair is a stranger', ACKS.priorReactionBetween(c, e5) === null);
  const e6 = ACKS.createEncounter(c, { id: 'enc-m6', monsterSide: { source: 'fresh' }, partySide: { characterIds: ['chr-a'] } });
  ok('an unbound fresh monster side has no identity to remember', ACKS.priorReactionBetween(c, e6) === null);
  const e7 = ACKS.createEncounter(c, { id: 'enc-m7', monsterSide: { lairId: 'lai-x' }, partySide: { partyId: 'pty-9', characterIds: ['chr-z'] } });
  ok('disjoint people never met them', ACKS.priorReactionBetween(c, e7) === null);
  // Exclusions: the subject itself; an ACTIVE prior; a no-encounter non-meeting.
  ok('the subject itself is excluded', ACKS.priorReactionBetween(c, e1) === null);   // e1 is the only resolved match for its own sides
  const e8 = ACKS.createEncounter(c, { id: 'enc-m8', occurredAtTurn: 4, monsterSide: { lairId: 'lai-y' }, partySide: { characterIds: ['chr-a'] } });
  const e9 = ACKS.createEncounter(c, { id: 'enc-m9', monsterSide: { lairId: 'lai-y' }, partySide: { characterIds: ['chr-a'] } });
  ok('an ACTIVE prior is not yet memory', ACKS.priorReactionBetween(c, e9) === null);
  ACKS.resolveEncounter(c, 'enc-m8', 'no-encounter', { atTurn: 4 });
  ok('a no-encounter resolution is a non-meeting (excluded)', ACKS.priorReactionBetween(c, e9) === null);
  // Latest wins: a second, later resolved meeting with the same sides supersedes.
  const e10 = ACKS.createEncounter(c, { id: 'enc-m10', occurredAtTurn: 6, occurredOnDayInMonth: 2,
    monsterSide: { lairId: 'lai-x' }, partySide: { characterIds: ['chr-a'] } });
  e10.reaction = { current: 'friendly', rolls: [] };
  ACKS.resolveEncounter(c, 'enc-m10', 'parleyed', { atTurn: 6, onDayInMonth: 2 });
  const latest = ACKS.priorReactionBetween(c, e2);
  ok('the latest resolved meeting wins', !!latest && latest.encounterId === 'enc-m10' && latest.reaction === 'friendly');
}

// =============================================================================
section('E2h — rerolls (every roll re-rollable at its frontier) + itemized records');
{
  const c = ACKS.blankCampaign({ name: 'rr' });
  ACKS.migrateCampaign(c);
  c.hexes = [ACKS.blankHex({ id: 'hex-r', terrain: 'grassland', terrainSubtype: 'steppe' })];
  const face = ACKS.blankCharacter({ name: 'Face' }); face.abilities = { STR: 9, INT: 9, WIL: 9, DEX: 9, CON: 9, CHA: 16 };
  c.characters.push(face);
  const mk = () => ACKS.createEncounter(c, { trigger: 'gm-authored', hexId: 'hex-r', category: 'monster',
    partySide: { characterIds: [face.id], faceCharacterId: face.id, sizeCount: 5 },
    monsterSide: { monsterCatalogKey: 'orc', count: 6 } });

  // ── distance: roll + reroll via the verb; locked once the walk is past it
  const e1 = mk();
  const d1 = ACKS.encounterRollDistance(c, e1.id, { rng: () => 0.5 });
  ok('distance verb rolls + stores + stamps history', d1.ok && !d1.reroll && e1.distance && e1.distance.rolledFt > 0 && e1.history.some(h => h.type === 'distance'));
  const rolled1 = e1.distance.rolledFt;
  const d2 = ACKS.encounterRollDistance(c, e1.id, { rng: () => 0.9 });
  ok('distance reroll replaces the roll', d2.ok && d2.reroll === true && e1.distance.rolledFt !== rolled1 && e1.history.some(h => h.type === 'distance-reroll'));
  ACKS.encounterSetAwareness(c, e1.id, { partyForeknowledge: true, partyLineOfSight: false });   // party fore × monsters none → 'can'
  ok('distance still re-rollable after awareness, before the surprise roll', ACKS.encounterRollDistance(c, e1.id, { rng: () => 0.5 }).ok === true);
  ACKS.encounterRollSurprise(c, e1.id, { partyMod: 2, rng: () => 0.9 });
  ok('distance locked once surprise has been rolled', ACKS.encounterRollDistance(c, e1.id, {}).error === 'walk-past-distance');

  // ── surprise reroll: same awareness, the GM extra recovered from the prior roll
  ok('setup: party rolled at +1 (fore) +2 (GM) = mod 3', e1.surprise.party.roll && e1.surprise.party.roll.mod === 3);
  const sBefore = e1.surprise.party.awareness + 'x' + e1.surprise.monsters.awareness;
  const sr = ACKS.encounterRerollSurprise(c, e1.id, { rng: () => 0.0 });
  ok('surprise reroll re-throws both sides', sr.ok && e1.surprise.party.roll.natural === 1 && e1.surprise.monsters.roll.natural === 1);
  ok('awareness held + the GM extra recovered (mod still 3)', (e1.surprise.party.awareness + 'x' + e1.surprise.monsters.awareness) === sBefore && e1.surprise.party.roll.mod === 3);
  ok('outcomes + phase recompute (monsters 1−1=0 → SURPRISED)', e1.surprise.monsters.surprised === true && e1.history.some(h => h.type === 'surprise-reroll'));
  const sr2 = ACKS.encounterRerollSurprise(c, e1.id, { rng: () => 0.9 });
  ok('a further reroll restores ready (frontier stays open)', sr2.ok && e1.surprise.monsters.surprised === false && e1.surprise.party.surprised === false);
  const eG = mk();
  ok('surprise reroll refused before the roll', ACKS.encounterRerollSurprise(c, eG.id, {}).error === 'not-rolled');

  // ── evasion reroll: failed-only, same target + modifiers; a success resolves
  const ev1 = ACKS.encounterAttemptEvasion(c, e1.id, { modifiers: [{ label: 'explorer guide', value: 5 }], rng: () => 0.2 });   // d20 5 +5 = 10 vs 16+ → failed
  ok('setup: evasion failed at 10 vs 16+', ev1.ok && !ev1.evasion.success && ev1.evasion.target === 16);
  ok('surprise locked once evasion is attempted', ACKS.encounterRerollSurprise(c, e1.id, {}).error === 'walk-past-surprise');
  const evr = ACKS.encounterRerollEvasion(c, e1.id, { rng: () => 0.4 });   // d20 9 +5 = 14 — still failed
  ok('evasion reroll re-throws with the same target + modifiers', evr.ok && e1.evasion.roll.natural === 9 && e1.evasion.roll.modSum === 5 && e1.evasion.roll.total === 14 && !e1.evasion.success && e1.evasion.target === 16);
  ok('history records the still-failed reroll', e1.history.some(h => h.type === 'evasion-reroll' && /still failed/.test(h.reason)));
  const evr2 = ACKS.encounterRerollEvasion(c, e1.id, { rng: () => 0.9 });   // d20 19 +5 = 24 → evaded
  ok('a successful reroll resolves the encounter as evaded (aftermath rolled)', evr2.ok && e1.status === 'resolved' && e1.outcome === 'evaded' && e1.evasion.aftermath && e1.evasion.aftermath.distanceFt > 0);
  ok('a resolved encounter refuses further rerolls', ACKS.encounterRerollEvasion(c, e1.id, {}).error === 'already-resolved');

  // ── reaction reroll: replaces the initial roll (CHA + modifiers held); locked by influence
  const e2 = mk();
  ACKS.encounterSetAwareness(c, e2.id, { partyForeknowledge: true, partyLineOfSight: true, monsterForeknowledge: true, monsterLineOfSight: true });
  ACKS.encounterRollSurprise(c, e2.id, {});
  ok('evasion reroll refused with nothing attempted', ACKS.encounterRerollEvasion(c, e2.id, {}).error === 'not-attempted');
  ACKS.encounterRollReaction(c, e2.id, { modifiers: [{ label: 'GM', value: 1 }], rng: () => 0.5 });   // 2d6 8 +2 CHA +1 = 11 → indifferent
  ok('the initial reaction entry stores the itemized modifiers', Array.isArray(e2.reaction.rolls[0].modifiers) && e2.reaction.rolls[0].modifiers[0].label === 'GM');
  const rr = ACKS.encounterRerollReaction(c, e2.id, { rng: () => 0.0 });   // 2d6 nat 2 +2 +1 = 5 → unfriendly
  ok('reaction reroll replaces the initial roll (same CHA + modifiers)', rr.ok && e2.reaction.rolls.length === 1 && e2.reaction.rolls[0].natural === 2 && e2.reaction.rolls[0].chaMod === 2 && e2.reaction.rolls[0].modSum === 1);
  ok('the standing attitude recomputes', e2.reaction.current === 'unfriendly' && e2.history.some(h => h.type === 'reaction-reroll'));
  ok('influence reroll refused with no attempt yet', ACKS.encounterRerollInfluence(c, e2.id, {}).error === 'no-influence-attempt');

  // ── influence reroll: the same starting attitude, the audit event PATCHED in place
  ACKS.encounterAttemptInfluence(c, e2.id, { rng: () => 0.5 });            // a1: 10 → indifferent band → neutral
  ACKS.encounterAttemptInfluence(c, e2.id, { rng: () => 0.5 });            // a2: → indifferent
  const i3 = ACKS.encounterAttemptInfluence(c, e2.id, { rng: () => 0.9 }); // a3 (ancillary): 14 → friendly
  ok('setup: 3 attempts, the 3rd charged ancillary', i3.ok && i3.event.payload.activityCost && i3.event.payload.activityCost.slot === 'ancillary' && e2.reaction.current === 'friendly');
  ok('reaction reroll refused once influence has begun', ACKS.encounterRerollReaction(c, e2.id, {}).error === 'walk-past-reaction');
  ok('influence entries store modifiers + the eventId backlink', Array.isArray(i3.attempt.modifiers) && i3.attempt.eventId === i3.event.id);
  const logLen = c.eventLog.length;
  const from3 = e2.reaction.rolls[3].from;   // 'indifferent'
  const ir = ACKS.encounterRerollInfluence(c, e2.id, { rng: () => 0.0 });  // 2d6 nat 2 +2 = 4 → unfriendly band → −1
  ok('influence reroll re-throws from the SAME starting attitude', ir.ok && ir.attempt.from === from3 && ir.attempt.natural === 2 && ir.attempt.to === 'neutral' && e2.reaction.current === 'neutral');
  ok('no new event — the attempt count and log length hold', c.eventLog.length === logLen && e2.reaction.rolls.length === 4);
  const patched = c.eventLog.find(w => w.event && w.event.id === ir.attempt.eventId);
  ok('the audit event is patched in place', !!patched && patched.event.payload.roll.natural === 2 && patched.event.payload.to === 'neutral' && /rerolled/.test(patched.event.payload.narrative));
  ok('the #346 charge rides the patched event untouched', patched.event.payload.activityCost && patched.event.payload.activityCost.slot === 'ancillary');

  // ── bribe backlash recomputes on the reroll
  const e3 = mk();
  ACKS.encounterRollReaction(c, e3.id, { chaMod: 0, rng: () => 0.5 });     // 8 → neutral
  const ib = ACKS.encounterAttemptInfluence(c, e3.id, { chaMod: 0, rng: () => 0.9, bribe: { bonus: 1 } });   // nat 12 +1 = 13 → friendly (no backlash)
  ok('setup: the bribed attempt succeeded (no backlash)', ib.ok && ib.attempt.bribe.backlash === false && e3.reaction.current === 'friendly');
  const ibr = ACKS.encounterRerollInfluence(c, e3.id, { rng: () => 0.4 }); // 2d6 6 +1 bribe = 7 → neutral band → shift 0 → backlash
  ok('the reroll recomputes the bribe backlash', ibr.ok && ibr.attempt.bribe.backlash === true && ibr.attempt.to === 'unfriendly' && e3.reaction.current === 'unfriendly');
}

// =============================================================================
section('E2i — the Hidden assert (RR pp.283–284): −2 on opponents + the LOS clamp');
{
  const c = ACKS.blankCampaign({ name: 'hid' });
  ACKS.migrateCampaign(c);
  c.hexes = [ACKS.blankHex({ id: 'hex-h', terrain: 'grassland', terrainSubtype: 'steppe' })];
  const face = ACKS.blankCharacter({ name: 'Thief' }); face.abilities = { STR: 9, INT: 9, WIL: 9, DEX: 9, CON: 9, CHA: 9 };
  c.characters.push(face);
  const mk = () => ACKS.createEncounter(c, { trigger: 'gm-authored', hexId: 'hex-h', category: 'monster',
    partySide: { characterIds: [face.id], faceCharacterId: face.id, sizeCount: 1 },
    monsterSide: { monsterCatalogKey: 'orc', count: 4 } });
  ok('SURPRISE_HIDDEN_PENALTY exported as −2', ACKS.SURPRISE_HIDDEN_PENALTY === -2);

  // The RR p.284 worked example: a hidden thief (fore+los) ambushes orcs (none) —
  // the orcs roll at −1 (none) −2 (hidden): surprised on a natural 5 (5−3=2), ready on a 6.
  const eT = mk();
  ACKS.encounterSetAwareness(c, eT.id, { partyForeknowledge: true, partyLineOfSight: true, partyHidden: true });
  ok('hidden stored on the asserting side only', eT.surprise.party.hidden === true && eT.surprise.monsters.hidden === false);
  ok('the hidden side keeps its own awareness (fore+los)', eT.surprise.party.awareness === 'fore+los');
  ok('the awareness history names the hidden side', eT.history.some(h => h.type === 'awareness' && /party hidden/.test(h.reason)));
  ACKS.encounterRollSurprise(c, eT.id, { rng: () => 0.7 });   // natural 5
  ok('RR p.284: the orcs roll at −1 (none) −2 (hidden) — natural 5 → 2 → SURPRISED',
    eT.surprise.monsters.roll.natural === 5 && eT.surprise.monsters.roll.mod === -3 && eT.surprise.monsters.roll.total === 2 && eT.surprise.monsters.surprised === true);
  ACKS.encounterRerollSurprise(c, eT.id, { rng: () => 0.9 });   // natural 6
  ok('the reroll keeps the hidden −2 (natural 6 → 3 → ready)',
    eT.surprise.monsters.roll.mod === -3 && eT.surprise.monsters.roll.total === 3 && eT.surprise.monsters.surprised === false);

  // Monsters hidden: the party's ASSERTED line of sight is clamped (no LOS on a hidden
  // creature — RR p.284) and its roll takes the −2 alongside its own GM extra.
  const eM = mk();
  ACKS.encounterSetAwareness(c, eM.id, { partyForeknowledge: true, partyLineOfSight: true,
    monsterForeknowledge: true, monsterLineOfSight: true, monsterHidden: true });
  ok('the party cannot claim LOS on hidden monsters (fore+los asserted → fore)', eM.surprise.party.lineOfSight === false && eM.surprise.party.awareness === 'fore');
  ok('evade eligibility recomputes through the clamp (fore × fore+los → cannot)', eM.surprise.evadeEligibility === 'cannot');
  ACKS.encounterRollSurprise(c, eM.id, { partyMod: 1, rng: () => 0.5 });   // natural 4
  ok('party rolls at +1 (fore) −2 (hidden) +1 (GM) = mod 0', eM.surprise.party.roll.mod === 0 && eM.surprise.party.roll.total === 4 && eM.surprise.party.surprised === false);
  ok('the hidden side itself does not roll (fore+los)', eM.surprise.monsters.roll === null && eM.surprise.monsters.surprised === false);
  ACKS.encounterRerollSurprise(c, eM.id, { rng: () => 0.0 });   // natural 1
  ok('the reroll recovers the GM extra net of the hidden −2 (mod still 0)', eM.surprise.party.roll.mod === 0 && eM.surprise.party.roll.natural === 1 && eM.surprise.party.surprised === true);

  // Mutual hiding with no foreknowledge → both sides clamp to none → no encounter.
  const eB = mk();
  const awB = ACKS.encounterSetAwareness(c, eB.id, { partyLineOfSight: true, monsterLineOfSight: true, partyHidden: true, monsterHidden: true });
  ok('mutually hidden strangers pass unaware — no encounter (RR p.281)', awB.noEncounter === true && eB.status === 'resolved' && eB.outcome === 'no-encounter');

  // Re-asserting without hidden restores the asserted LOS.
  const eR = mk();
  ACKS.encounterSetAwareness(c, eR.id, { partyForeknowledge: true, partyLineOfSight: true, monsterForeknowledge: true, monsterHidden: true });
  ACKS.encounterSetAwareness(c, eR.id, { partyForeknowledge: true, partyLineOfSight: true, monsterForeknowledge: true });
  ok('re-assert clears hidden + restores the clamped LOS', eR.surprise.monsters.hidden === false && eR.surprise.party.lineOfSight === true && eR.surprise.party.awareness === 'fore+los');
}

// =============================================================================
section('E3a — settle-as-lair (linger or migrate, JJ p.69 + p.103)');
{
  const c = ACKS.blankCampaign({ name: 'settle' });
  ACKS.migrateCampaign(c);
  c.hexes = [ACKS.blankHex({ id: 'hex-s', terrain: 'hills', terrainSubtype: 'rocky' })];
  const face = ACKS.blankCharacter({ name: 'Scout' }); face.abilities = { STR: 9, INT: 9, WIL: 9, DEX: 9, CON: 9, CHA: 9 };
  c.characters.push(face);
  const mk = (msOver) => ACKS.createEncounter(c, { trigger: 'gm-authored', hexId: 'hex-s', category: 'monster',
    partySide: { characterIds: [face.id], faceCharacterId: face.id, sizeCount: 1 },
    monsterSide: Object.assign({ monsterCatalogKey: 'orc', count: 4 }, msOver || {}) });

  // Eligibility: only an UN-lair-bound monster side with a catalog Lair % can settle.
  const eAt = mk({ lairId: 'lai-x', encounterKind: 'at-lair' });
  ok('at-lair side is home — not eligible', ACKS.encounterSettleEligibility(c, eAt.id).reason === 'already-at-lair');
  const eFr = mk({ lairId: 'lai-x', encounterKind: 'wandering-fragment' });
  ok('a fragment forays FROM a home lair — not eligible', ACKS.encounterSettleEligibility(c, eFr.id).reason === 'fragment-has-home-lair');
  const eNo = mk({ monsterCatalogKey: '' });
  ok('no catalog monster → no Lair % source', ACKS.encounterSettleEligibility(c, eNo.id).reason === 'no-catalog-monster');
  const eOk = mk();
  ok('a fresh wandering band is eligible', ACKS.encounterSettleEligibility(c, eOk.id).eligible === true);

  // Migrate: linger d100 over the Lair % → they move on; confirm resolves DISPERSED.
  // (orc Lair 35%: rng 0.80 → natural 81 > 35.)
  const p1 = ACKS.encounterProposeSettle(c, eOk.id, { rng: seq(0.80, 0.00, 0.50) });
  ok('proposal is pure (encounter untouched)', eOk.status === 'active' && (c.lairs || []).length === 0);
  ok('81 vs 35% → migrates', p1.ok === true && p1.lingerNatural === 81 && p1.effectivePct === 35 && p1.lingers === false && p1.count === null);
  const r1 = ACKS.encounterSettleAsLair(c, eOk.id, { proposal: p1 });
  ok('migration confirms as dispersed (no lair)', r1.ok === true && r1.migrated === true && r1.lair === null
    && eOk.status === 'resolved' && eOk.outcome === 'dispersed' && (c.lairs || []).length === 0);
  ok('the settle-check is stamped on the encounter', eOk.history.some(h => h.type === 'settle-check' && /migrates/.test(h.reason)));

  // Linger at FULL lair strength: both d100s under 35% → the lair dice (orc 1d10) size the
  // den and the hoard letter (G) is recorded. rng: 0.20→21 ✓ · 0.30→31 ✓ · 0.90→d10=10.
  const eFull = mk();
  const p2 = ACKS.encounterProposeSettle(c, eFull.id, { rng: seq(0.20, 0.30, 0.90) });
  ok('21 ≤ 35 lingers · 31 ≤ 35 full strength · 1d10 → 10', p2.lingers === true && p2.fullStrength === true && p2.fullCount === 10 && p2.count === 10);
  const r2 = ACKS.encounterSettleAsLair(c, eFull.id, { proposal: p2, rng: seq(0.5) });
  const lair2 = r2.lair;
  ok('a lair materializes at the hex (active, known — the party met them)', r2.ok === true && lair2 && lair2.hexId === 'hex-s'
    && lair2.status === 'active' && lair2.knownToPlayers === true && lair2.establishedBy === 'encounter-settle');
  ok('full strength records the hoard letter (orc G)', lair2.treasureType === 'G');
  const g2 = (c.groups || []).find(g => g && (lair2.groupIds || []).includes(g.id));
  ok('a Group of the full-strength count binds to the lair', !!g2 && g2.count === 10 && g2.currentHexId === 'hex-s');
  ok("the encounter resolves 'settled-as-lair' and links the den (D9 chains future meetings)",
    eFull.status === 'resolved' && eFull.outcome === 'settled-as-lair' && eFull.monsterSide.lairId === lair2.id
    && (eFull.monsterSide.groupIds || []).includes(g2.id));
  ok('the resolution event carries the lair', (() => {
    const w = (c.eventLog || []).filter(en => en && en.event && en.event.kind === 'encounter-resolved'
      && en.event.payload && en.event.payload.encounterId === eFull.id).pop();
    return !!w && w.event.payload.outcome === 'settled-as-lair' && w.event.payload.lairId === lair2.id;
  })());

  // A later meeting with the settled den recalls this one (priorReactionBetween, D9).
  const eNext = mk({ lairId: lair2.id, encounterKind: 'at-lair', groupIds: [g2.id] });
  const prior = ACKS.priorReactionBetween(c, eNext.id);
  ok('the settled encounter IS the den\'s prior meeting', !!prior && prior.encounterId === eFull.id && prior.outcome === 'settled-as-lair');

  // Linger at WANDERING numbers: second d100 over the plain 35% → the band met (count 4)
  // settles as-is with NO hoard yet (MM p.15 — treasure stays at a lair; this band had none).
  const eWan = mk();
  const p3 = ACKS.encounterProposeSettle(c, eWan.id, { rng: seq(0.20, 0.50, 0.90) });
  ok('21 ≤ 35 lingers · 51 > 35 wandering numbers — the met band settles as-is', p3.lingers === true && p3.fullStrength === false && p3.count === 4);
  const r3 = ACKS.encounterSettleAsLair(c, eWan.id, { proposal: p3 });
  ok('wandering-strength settlers bring no hoard', r3.ok === true && r3.lair.treasureType === '' && eWan.outcome === 'settled-as-lair');
  const g3 = (c.groups || []).find(g => g && (r3.lair.groupIds || []).includes(g.id));
  ok('the Group settles at the met count', !!g3 && g3.count === 4);

  // The dungeon ×2 tick recomputes vs the HELD naturals (the E2h idiom — no re-throw);
  // the second roll stays vs the PLAIN Lair % (JJ p.103 "again against its Lair characteristic").
  const eDun = mk();
  const p4 = ACKS.encounterProposeSettle(c, eDun.id, { rng: seq(0.40, 0.50, 0.90) });   // 41 > 35 → migrates
  ok('41 vs 35% migrates…', p4.lingers === false);
  const p4b = ACKS.settleProposalOutcome(p4, true);
  ok('…but the dungeon ×2 tick flips it on the held natural (41 ≤ 70)', p4b.effectivePct === 70 && p4b.lingerNatural === 41 && p4b.lingers === true);
  ok('the strength roll stays vs the PLAIN Lair % (51 > 35 → wandering even with the dungeon)', p4b.fullStrength === false && p4b.count === 4);
  ok('the effective % caps at 100', ACKS.settleProposalOutcome({ lairPct: 60, lingerNatural: 99, strengthNatural: 1, fullCount: 5, wanderingCount: 2 }, true).effectivePct === 100);

  // A count-less side rolls the wandering dice for its settle size (2d6: 0.5,0.5 → 4+4 = 8).
  const eCl = mk({ count: null });
  const p5 = ACKS.encounterProposeSettle(c, eCl.id, { rng: seq(0.20, 0.50, 0.90, 0.50, 0.50) });
  ok('a count-less band rolls its wandering dice (2d6 → 8)', p5.wanderingCount === 8 && p5.count === 8);

  // Gates: a non-evaded resolution closes the offer.
  ok('resolved (settled) → no propose', ACKS.encounterProposeSettle(c, eFull.id, {}).error === 'already-resolved');
  ok('resolved (settled) → no settle', ACKS.encounterSettleAsLair(c, eFull.id, {}).error === 'already-resolved');

  // ── The EVADED path (per Joachim, 2026-06-11): the party fled — the band may still
  // den behind them. The meeting's outcome STANDS (evaded — that is what happened);
  // a den founded here starts UNKNOWN to the players (they ran; the M4 search /
  // track-home machinery finds it); one settle-check decides it, never re-rolled.
  const mkEvaded = () => {
    const e = mk();
    ACKS.encounterSetAwareness(c, e.id, { partyForeknowledge: true, partyLineOfSight: true });
    ACKS.encounterRollSurprise(c, e.id, { rng: () => 0.9 });
    ACKS.encounterAttemptEvasion(c, e.id, { autoSuccess: true, rng: () => 0.5 });
    return e;
  };
  const evtsFor = (id) => (c.eventLog || []).filter(en => en && en.event && en.event.kind === 'encounter-resolved'
    && en.event.payload && en.event.payload.encounterId === id).length;

  const eEv = mkEvaded();
  ok('an evaded meeting still offers settle', eEv.status === 'resolved' && eEv.outcome === 'evaded'
    && ACKS.encounterSettleEligibility(c, eEv.id).eligible === true);
  const pEv = ACKS.encounterProposeSettle(c, eEv.id, { rng: seq(0.20, 0.50, 0.90) });   // lingers, wandering 4
  const rEv = ACKS.encounterSettleAsLair(c, eEv.id, { proposal: pEv });
  ok('dens behind the fled party — flagged settledAfterEvasion', rEv.ok === true && rEv.settledAfterEvasion === true && !!rEv.lair);
  ok('the meeting outcome STANDS (evaded, not re-resolved)', eEv.status === 'resolved' && eEv.outcome === 'evaded');
  ok('the den starts UNKNOWN to the players (they ran)', rEv.lair.knownToPlayers === false);
  ok('linked for D9 — the den recalls the evaded meeting', eEv.monsterSide.lairId === rEv.lair.id);
  ok('no second resolution event (entity histories carry it)', evtsFor(eEv.id) === 1 && rEv.event === null);
  ok('the offer is consumed once settled', !ACKS.encounterSettleEligibility(c, eEv.id).eligible);

  const eMg = mkEvaded();
  const pMg = ACKS.encounterProposeSettle(c, eMg.id, { rng: seq(0.80, 0.50, 0.90) });   // 81 > 35 → migrates
  const lairsBeforeMg = (c.lairs || []).length;
  const rMg = ACKS.encounterSettleAsLair(c, eMg.id, { proposal: pMg });
  ok('migrate on the evaded path: stamped, no lair, the meeting stays evaded',
    rMg.ok === true && rMg.migrated === true && rMg.settledAfterEvasion === true
    && (c.lairs || []).length === lairsBeforeMg && eMg.outcome === 'evaded'
    && eMg.history.some(h => h.type === 'settle-check' && /migrates/.test(h.reason)));
  ok('one linger roll per meeting — no re-rolling the world\'s answer',
    ACKS.encounterSettleEligibility(c, eMg.id).reason === 'settle-already-decided');
}

// =============================================================================
section('E3b — encounter tone (JJ pp.84–87, D11): catalogs + derivation + intimidation');
{
  const T = ACKS.ENCOUNTER_TONES;
  ok('three tones ship', !!(T && T.diplomatic && T.intimidating && T.seductive));
  ok('row counts match the printed tables (20 / 28 / 22)',
    T.diplomatic.rows.length === 20 && T.intimidating.rows.length === 28 && T.seductive.rows.length === 22);
  ok('no CHA or bribe rows — they ride the roll\'s own terms',
    ['diplomatic', 'intimidating', 'seductive'].every(k => T[k].rows.every(r => !/charisma|bribe/i.test(r.label))));
  ok('toneBandLabel: intimidation wears intimidated/overawed',
    ACKS.toneBandLabel('intimidating', 'indifferent') === 'intimidated' && ACKS.toneBandLabel('intimidating', 'friendly') === 'overawed'
    && ACKS.toneBandLabel('intimidating', 'neutral') === 'neutral' && ACKS.toneBandLabel('diplomatic', 'indifferent') === 'indifferent');

  const c = ACKS.blankCampaign({ name: 'tone' });
  ACKS.migrateCampaign(c);
  c.hexes = [ACKS.blankHex({ id: 'hex-t', terrain: 'hills', terrainSubtype: 'rocky' })];
  const face = ACKS.blankCharacter({ name: 'Envoy' });
  face.abilities = { STR: 9, INT: 9, WIL: 9, DEX: 9, CON: 9, CHA: 9 };
  face.alignment = 'L'; face.proficiencies = ['Diplomacy', 'Intimidation'];
  c.characters.push(face);
  const mk = (msOver) => ACKS.createEncounter(c, { trigger: 'gm-authored', hexId: 'hex-t', category: 'monster',
    partySide: { characterIds: [face.id], faceCharacterId: face.id, sizeCount: 6 },
    monsterSide: Object.assign({ monsterCatalogKey: 'orc', count: 4 }, msOver || {}) });

  // Derivation — diplomatic: a Lawful face vs the Chaotic orc, at the orcs' lair.
  const eD = mk({ lairId: 'lai-t', encounterKind: 'at-lair' });
  const rowsD = ACKS.encounterToneRows(c, eD.id, 'diplomatic');
  const find = (rows, k) => rows.find(r => r.key === k);
  ok('alignment derives (Lawful vs Chaotic → −1 on, the other two off)',
    find(rowsD, 'align-lc').auto && find(rowsD, 'align-lc').on && !find(rowsD, 'align-ll').on && !find(rowsD, 'align-cl').on);
  ok('at-lair derives trespassing −1', find(rowsD, 'lair-tres').auto && find(rowsD, 'lair-tres').on);
  ok('Diplomacy proficiency derives +1', find(rowsD, 'prof-diplomacy').auto && find(rowsD, 'prof-diplomacy').on);
  ok('Mystic Aura not held → off', !find(rowsD, 'prof-mystic').on);
  ok('first meeting → no relationship row asserts', ['rel-hostile', 'rel-unfriendly', 'rel-indifferent', 'rel-friendly'].every(k => !find(rowsD, k).on));
  ok('GM rows stay unticked at their printed defaults', !find(rowsD, 'threat-witnessed').on && find(rowsD, 'threat-witnessed').value === -2);

  // Derivation — intimidating: the party (6) vs the band — 6:4 is exactly 3:2 (+2),
  // 6:5 the plain +1; orc Morale 0; the Intimidation proficiency gate (authority OR
  // numbers) derives via the numbers.
  const rowsI = ACKS.encounterToneRows(c, eD.id, 'intimidating');
  ok('outnumbering derives (6 vs 4 = exactly 3:2 → the +2 row alone)', find(rowsI, 'out-32').on && !find(rowsI, 'out-1').on && !find(rowsI, 'out-31').on && !find(rowsI, 'outd-1').on);
  ok('6 vs 5 derives the plain +1 row', (() => {
    const e5 = mk({ count: 5 });
    const rows = ACKS.encounterToneRows(c, e5.id, 'intimidating');
    return find(rows, 'out-1').on && !find(rows, 'out-32').on;
  })());
  ok('target in own lair derives −1 (intimidating)', find(rowsI, 'lair-target').on);
  ok('Morale derives −score (orc 0 → value 0, off)', find(rowsI, 'morale').auto && find(rowsI, 'morale').value === 0 && !find(rowsI, 'morale').on);
  ok('Intimidation proficiency gated on numbers — derives ON while outnumbering', find(rowsI, 'prof-intimidation').on);
  ok('3:1 derives the +5 row alone', (() => {
    const big = mk({ count: 2 });   // 6 vs 2 = 3:1
    const rows = ACKS.encounterToneRows(c, big.id, 'intimidating');
    return find(rows, 'out-31').on && !find(rows, 'out-32').on && !find(rows, 'out-1').on;
  })());

  // Tone stamping: an intimidating initial roll stores the ORIGINAL roll (JJ p.86 —
  // new allies of the intimidated re-use it); the reroll-at-the-frontier replaces it.
  const eI = mk();
  ACKS.encounterSetAwareness(c, eI.id, { partyForeknowledge: true, partyLineOfSight: true, monsterForeknowledge: true, monsterLineOfSight: true });
  ACKS.encounterRollSurprise(c, eI.id, { rng: () => 0.9 });
  ACKS.encounterRollReaction(c, eI.id, { tone: 'intimidating', rng: () => 0.99 });   // 6+6 = 12 → friendly
  ok('tone stamped on the reaction + the roll', eI.reaction.tone === 'intimidating' && eI.reaction.rolls[0].tone === 'intimidating');
  ok('natural 12 under intimidation = overawed (canonical band stays friendly)',
    eI.reaction.current === 'friendly' && ACKS.toneBandLabel(eI.reaction.tone, eI.reaction.current) === 'overawed');
  ok('the original intimidation roll is stored', eI.reaction.intimidationOriginalRoll
    && eI.reaction.intimidationOriginalRoll.attempt === 0 && eI.reaction.intimidationOriginalRoll.total === 12);
  ACKS.encounterRerollReaction(c, eI.id, { rng: () => 0.0 });   // 1+1 = 2 → hostile
  ok('the frontier reroll replaces the stored original', eI.reaction.intimidationOriginalRoll.total === 2 && eI.reaction.current === 'hostile');

  // The tone may switch per attempt; the first INTIMIDATING roll of the walk is the original.
  const eS = mk();
  ACKS.encounterSetAwareness(c, eS.id, { partyForeknowledge: true, partyLineOfSight: true, monsterForeknowledge: true, monsterLineOfSight: true });
  ACKS.encounterRollSurprise(c, eS.id, { rng: () => 0.9 });
  ACKS.encounterRollReaction(c, eS.id, { tone: 'diplomatic', rng: () => 0.5 });
  ok('a diplomatic walk stores no intimidation roll', eS.reaction.intimidationOriginalRoll === null);
  ACKS.encounterAttemptInfluence(c, eS.id, { tone: 'intimidating', rng: () => 0.99 });
  ok('the first intimidating attempt becomes the stored original (attempt 1)',
    eS.reaction.tone === 'intimidating' && eS.reaction.intimidationOriginalRoll && eS.reaction.intimidationOriginalRoll.attempt === 1);
  const origT = eS.reaction.intimidationOriginalRoll.total;
  ACKS.encounterRerollInfluence(c, eS.id, { rng: () => 0.0 });
  ok('rerolling that attempt updates the stored original', eS.reaction.intimidationOriginalRoll.total !== origT && eS.reaction.intimidationOriginalRoll.attempt === 1);

  // Relationship derivation follows the walk: the CURRENT attitude once interacting,
  // the PRIOR meeting (D9) on a fresh encounter with the same sides.
  const eR = mk({ lairId: 'lai-rel', encounterKind: 'at-lair' });
  ACKS.encounterSetAwareness(c, eR.id, { partyForeknowledge: true, partyLineOfSight: true, monsterForeknowledge: true, monsterLineOfSight: true });
  ACKS.encounterRollSurprise(c, eR.id, { rng: () => 0.9 });
  ACKS.encounterRollReaction(c, eR.id, { tone: 'diplomatic', rng: () => 0.99 });   // 12 → friendly
  const rowsMid = ACKS.encounterToneRows(c, eR.id, 'diplomatic');
  ok('mid-walk the standing attitude asserts its relationship row', find(rowsMid, 'rel-friendly').on && !find(rowsMid, 'rel-indifferent').on);
  ACKS.recordEncounterResolved(c, eR.id, 'parleyed', {});
  const eR2 = mk({ lairId: 'lai-rel', encounterKind: 'at-lair' });
  const rowsNext = ACKS.encounterToneRows(c, eR2.id, 'diplomatic');
  ok('a fresh meeting derives the relationship from the PRIOR encounter (D9)', find(rowsNext, 'rel-friendly').on);
  const rowsNextI = ACKS.encounterToneRows(c, eR2.id, 'intimidating');
  ok('the intimidating catalog maps a friendly memory to no row (RAW prints none)',
    ['rel-hostile', 'rel-unfriendly', 'rel-intimidated'].every(k => !find(rowsNextI, k).on));
}

// =============================================================================
section('E3c — monster pursuit (RR p.285 + p.120; monster-pursuit, default OFF)');
{
  const build = (ruleOn) => {
    const c = ACKS.blankCampaign({ name: 'pursuit' });
    ACKS.migrateCampaign(c);
    if(ruleOn) c.houseRules['monster-pursuit'] = { enabled: true };
    c.hexes = [0, 1, 2, 3, 4, 5].map(q => {
      const h = ACKS.blankHex({ id: 'hex-p' + q, terrain: 'grassland', terrainSubtype: 'steppe' });
      h.coord = { q: q, r: 0 };
      return h;
    });
    const ch = ACKS.blankCharacter({ name: 'Quarry' });
    ch.abilities = { STR: 9, INT: 9, WIL: 9, DEX: 9, CON: 9, CHA: 9 };
    ch.currentHexId = 'hex-p0';
    c.characters.push(ch);
    return { c, ch };
  };
  const mkEnc = (c, ch, msOver) => {
    const e = ACKS.createEncounter(c, { trigger: 'gm-authored', hexId: 'hex-p0', category: 'monster',
      partySide: { characterIds: [ch.id], faceCharacterId: ch.id, sizeCount: 6 },
      monsterSide: Object.assign({ monsterCatalogKey: 'common-wolf', count: 5 }, msOver || {}) });
    // The party sees them first (fore+los × none) — the matrix allows evasion; the
    // monsters roll surprise at −1 (0.9 → natural 6 → ready, so the evasion is thrown).
    ACKS.encounterSetAwareness(c, e.id, { partyForeknowledge: true, partyLineOfSight: true });
    ACKS.encounterRollSurprise(c, e.id, { rng: () => 0.9 });
    return e;
  };

  // Rule OFF (the default): a successful evasion resolves 'evaded' — shipped behavior.
  {
    const { c, ch } = build(false);
    const e = mkEnc(c, ch);
    ACKS.encounterAttemptEvasion(c, e.id, { autoSuccess: true, rng: () => 0.5 });
    ok('rule OFF: evasion resolves evaded (no pursuit state)', e.status === 'resolved' && e.outcome === 'evaded' && !e.pursuit);
  }

  const { c, ch } = build(true);
  // Rule ON but the monster cannot track (orc) → still resolves.
  {
    const e = mkEnc(c, ch, { monsterCatalogKey: 'orc', count: 4 });
    ACKS.encounterAttemptEvasion(c, e.id, { autoSuccess: true, rng: () => 0.5 });
    ok('rule ON, non-tracker: still resolves evaded', e.status === 'resolved' && e.outcome === 'evaded' && !e.pursuit);
  }
  // Rule ON + a tracker (wolf — Acute Olfaction) → the encounter HOLDS in the pursuit offer.
  const eP = mkEnc(c, ch);
  ACKS.encounterAttemptEvasion(c, eP.id, { autoSuccess: true, rng: () => 0.5 });
  ok('rule ON, tracker: evasion holds the encounter open — pursuit offered',
    eP.status === 'active' && eP.phase === 'pursuit' && eP.pursuit && eP.pursuit.status === 'offered');
  ok('half expedition speed derives from the catalog (wolf 36 mi → 18 mi/day)', eP.pursuit.pursuerMilesPerDay === 18);
  ok('the aftermath still rolled (the party DID evade)', !!eP.evasion.aftermath);
  ok('settle waits on the pursuit decision (settle ⊥ chase)',
    ACKS.encounterSettleEligibility(c, eP.id).reason === 'pursuit-in-progress');

  // Decline → resolves evaded exactly as the rule-OFF path.
  {
    const e2 = mkEnc(c, ch);
    ACKS.encounterAttemptEvasion(c, e2.id, { autoSuccess: true, rng: () => 0.5 });
    const r = ACKS.encounterDeclinePursuit(c, e2.id, {});
    ok('waived: resolves evaded', r.ok === true && e2.status === 'resolved' && e2.outcome === 'evaded');
    ok('a declined pursuit opens the evaded settle offer', ACKS.encounterSettleEligibility(c, e2.id).eligible === true);
  }
  // The take-up throw (RR p.120): 11+ with the party-size count bands; natural 1 fails.
  {
    const eF = mkEnc(c, ch);
    ACKS.encounterAttemptEvasion(c, eF.id, { autoSuccess: true, rng: () => 0.5 });
    const rf = ACKS.encounterBeginPursuit(c, eF.id, { rng: () => 0.0 });   // natural 1
    ok('take-up natural 1 fails → resolved evaded', rf.ok === true && rf.takeUp.natural === 1 && !rf.takeUp.success
      && eF.status === 'resolved' && eF.outcome === 'evaded');
  }
  const rB = ACKS.encounterBeginPursuit(c, eP.id, { rng: () => 0.5 });   // natural 11 + 4 (size 6) = 15
  ok('take-up succeeds with the count band (11 +4 [party 6] = 15 vs 11+)',
    rB.ok === true && rB.takeUp.success && rB.takeUp.countBonus === 4
    && eP.pursuit.status === 'pursuing' && eP.pursuit.lastPartyHexId === 'hex-p0');

  // The daily consumer — a stationary party is caught (gap 1 + 0 − 18 ≤ 0); the fresh
  // encounter springs at the party's hex with the same sides + a pre-rolled distance.
  const day1 = ACKS.tickDay ? null : null;   // (the consumer is exercised directly — the orchestrator wraps it)
  const prop1 = (() => {
    const ctx = { dayInMonth: 2, rng: seq(0.5, 0.3, 0.5, 0.5, 0.5, 0.5) };   // trail throw 11✓; then mint + distance dice
    return ACKS.dayConsumersInOrder().find(x => x.name === 'pursuit').handler(c, ctx);
  })();
  ok('the pursuit consumer is registered (slot 82)', !!ACKS.dayConsumersInOrder().find(x => x.name === 'pursuit' && x.order === 82));
  ok('a stationary party is caught', prop1.pendingRecords.length === 1 && prop1.pendingRecords[0].outcome === 'caught'
    && prop1.pendingRecords[0].gapBefore === 1 && prop1.pendingRecords[0].partyMiles === 0);
  ok('the catch pauses the tick (encounter pause trigger)', prop1.notableEvents.some(n => n.pauseTrigger === 'encounter'));
  ok('the fresh meeting pre-rolls its distance with the seeded rng', !!prop1.pendingRecords[0].caughtDistance
    && prop1.pendingRecords[0].caughtDistance.distanceFt > 0);
  const rec1 = prop1.pendingRecords[0];
  ACKS.dayConsumersInOrder().find(x => x.name === 'pursuit').commit(c, rec1);
  const fresh = (c.encounters || []).find(e => e && e.id === rec1.caughtEncounterId);
  ok('commit: the fresh encounter materializes at the party\'s hex (trigger pursuit, same sides)',
    !!fresh && fresh.trigger === 'pursuit' && fresh.hexId === 'hex-p0' && fresh.status === 'active'
    && fresh.monsterSide.monsterCatalogKey === 'common-wolf' && (fresh.partySide.characterIds || [])[0] === ch.id
    && fresh.distance && fresh.distance.distanceFt === rec1.caughtDistance.distanceFt);
  ok('commit: the pursuit encounter resolves evaded with the chase on its record',
    eP.status === 'resolved' && eP.outcome === 'evaded' && eP.pursuit.throws.some(t => t.kind === 'keep-trail')
    && eP.history.some(h => h.type === 'pursuit-caught'));

  // A moving party outruns the pursuer: 5 hexes × 6 mi = 30 > 18 → the gap GROWS.
  {
    const eT = mkEnc(c, ch);
    ACKS.encounterAttemptEvasion(c, eT.id, { autoSuccess: true, rng: () => 0.5 });
    ACKS.encounterBeginPursuit(c, eT.id, { rng: () => 0.5 });
    ch.currentHexId = 'hex-p5';
    const prop = ACKS.dayConsumersInOrder().find(x => x.name === 'pursuit').handler(c, { dayInMonth: 3, rng: seq(0.5) });
    const rec = prop.pendingRecords.find(r => r.encounterId === eT.id);
    ok('the gap tracks the party\'s hex movement (1 + 30 − 18 = 13 mi)', !!rec && rec.outcome === 'tracking' && rec.partyMiles === 30 && rec.gapAfter === 13);
    ACKS.dayConsumersInOrder().find(x => x.name === 'pursuit').commit(c, rec);
    ok('commit updates the chase state', eT.pursuit.gapMiles === 13 && eT.pursuit.lastPartyHexId === 'hex-p5' && eT.status === 'active');

    // A natural 1 on the daily throw loses the trail → resolved evaded at commit.
    const propLost = ACKS.dayConsumersInOrder().find(x => x.name === 'pursuit').handler(c, { dayInMonth: 4, rng: seq(0.0) });
    const recLost = propLost.pendingRecords.find(r => r.encounterId === eT.id);
    ok('natural 1 loses the trail', !!recLost && recLost.outcome === 'lost');
    ACKS.dayConsumersInOrder().find(x => x.name === 'pursuit').commit(c, recLost);
    ok('commit: lost resolves evaded', eT.status === 'resolved' && eT.outcome === 'evaded' && eT.history.some(h => h.type === 'pursuit-lost'));
  }
  // Passing Without Trace (the GM tick) ends it on the next day.
  {
    ch.currentHexId = 'hex-p0';
    const eC = mkEnc(c, ch);
    ACKS.encounterAttemptEvasion(c, eC.id, { autoSuccess: true, rng: () => 0.5 });
    ACKS.encounterBeginPursuit(c, eC.id, { rng: () => 0.5 });
    eC.pursuit.traceConcealed = true;
    const prop = ACKS.dayConsumersInOrder().find(x => x.name === 'pursuit').handler(c, { dayInMonth: 5 });
    const rec = prop.pendingRecords.find(r => r.encounterId === eC.id);
    ok('a concealed trace is lost without a throw', !!rec && rec.outcome === 'lost' && /concealed/.test(rec.reason || ''));
    // …and a running pursuit can simply be broken off.
    const eA = mkEnc(c, ch);
    ACKS.encounterAttemptEvasion(c, eA.id, { autoSuccess: true, rng: () => 0.5 });
    ACKS.encounterBeginPursuit(c, eA.id, { rng: () => 0.5 });
    const rA = ACKS.encounterAbandonPursuit(c, eA.id, { reason: 'the pack gives up' });
    ok('abandon resolves evaded', rA.ok === true && eA.status === 'resolved' && eA.outcome === 'evaded');
  }
  ok('the monster-pursuit rule is registered default-OFF', (() => {
    const reg = (ACKS.HOUSERULES_REGISTRY || []).find(r => r.id === 'monster-pursuit');
    const fresh2 = ACKS.blankCampaign({ name: 'x' });
    return !!reg && !ACKS.isHouseRuleEnabled(fresh2, 'monster-pursuit');
  })());
}

// =============================================================================
console.log('\n— Summary');
console.log('  Passed: ' + pass);
console.log('  Failed: ' + fail);
if (fail) { console.log('\nFAILURES:'); failures.forEach(f => console.log('  ' + f)); process.exit(1); }
console.log('\nAll Encounter layer (#476 E1) smoke checks passed.');
