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
  'acks-engine-catalogs.js', 'acks-engine-monsters.js', 'acks-engine.js', 'acks-engine-entities.js', 'acks-engine-economy.js',
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
console.log('\n— Summary');
console.log('  Passed: ' + pass);
console.log('  Failed: ' + fail);
if (fail) { console.log('\nFAILURES:'); failures.forEach(f => console.log('  ' + f)); process.exit(1); }
console.log('\nAll Encounter layer (#476 E1) smoke checks passed.');
