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
require('./_engine.js').load();
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

section('the seam — encounterDraw (E4 table-first, JJ p.43; the pool binds by MATCH; search stays lair-first)');
{
  const c = ACKS.blankCampaign({ name: 'seam' });
  ACKS.migrateCampaign(c);
  c.hexes = [ACKS.blankHex({ id: 'hex-l', terrain: 'hills' })];
  ACKS.generateLair(c, { monsterCatalogKey: 'orc', hexId: 'hex-l' });
  // (a) the travel draw rolls the JJ identity table — the den no longer overrides it
  //     [cat d20 11 → monster] [rarity d20 11 → uncommon] [identity d100 1] [lair%] [count…]
  const d = ACKS.encounterDraw(c, 'hex-l', { rng: seq(0.5, 0.5, 0.0, 0.99, 0.5) });
  ok('a monster draw rolls the terrain identity table (table-first)', d.category === 'monster' && d.identity === 'table'
    && d.identityRoll && d.identityRoll.tableKey === 'hills-any' && d.identityRoll.rarity === 'uncommon');
  // (b) the table rolling THE den's monster IN-LAIR → the existing den answers (D5 by match)
  //     orc sits at hills-any COMMON 13-14: [cat 11] [rarity d20 1 → common] [d100 13 → orc] [lair% 1 ≤ 35 → in-lair]
  const dOrc = ACKS.encounterDraw(c, 'hex-l', { rng: seq(0.5, 0.0, 0.125, 0.0) });
  ok("the den's monster rolled in-lair → the existing den answers", dOrc.identityRoll.key === 'orc'
    && dOrc.binding && dOrc.binding.mode === 'existing-lair' && dOrc.binding.inLair === true);
  // (c) the den's monster rolled ABROAD → a fragment of it (MM p.15)
  const dFrag = ACKS.encounterDraw(c, 'hex-l', { rng: seq(0.5, 0.0, 0.125, 0.99, 0.5) });
  ok("the den's monster rolled abroad → a fragment of the den", dFrag.binding.mode === 'fragment' && !!dFrag.binding.lairId && dFrag.binding.count >= 1);
  // (d) an empty hex rolls a NAMED monster from its terrain table
  const c2 = ACKS.blankCampaign({ name: 'fresh' });
  ACKS.migrateCampaign(c2);
  c2.hexes = [ACKS.blankHex({ id: 'hex-e', terrain: 'forest' })];
  const d2 = ACKS.encounterDraw(c2, 'hex-e', { rng: seq(0.5, 0.0, 0.0, 0.99, 0.5) });   // forest common 1-2 = Bat, Common; lair% 100 > 35 → wandering
  ok('an empty hex rolls a named monster (wandering band)', d2.identity === 'table'
    && d2.identityRoll.key === 'common-bat' && d2.binding.mode === 'wandering' && d2.binding.count >= 1);
  // (e) lairFirst (the RR p.276 search-hour) keeps the pool-first PRECEDENCE — an
  //     existing den answers before any table (the empty-hex fallback is E4n, below)
  const dS = ACKS.encounterDraw(c, 'hex-l', { rng: seq(0.5, 0.5, 0.0), lairFirst: true });
  ok('lairFirst (the search path) stays pool-identified', dS.identity === 'pool' && dS.proposal.source === 'existing-lair');
  // (f) a null hexId with no terrain context falls to gm-pick fresh (never the unplaced pool)
  ACKS.createLair(c2, { status: 'dynamic', hexId: null, monsterCatalogKey: 'ogre' });
  const d3 = ACKS.encounterDraw(c2, null, { territoryClass: 'unsettled', rng: () => 0.5 });
  ok('a null hexId with no terrain context draws gm-pick fresh', d3.category === 'monster' && d3.identity === 'gm-pick' && d3.proposal.source === 'fresh');
  // (g) a sparse-route step WITH the env terrain override rolls the table (the §24 fallback)
  const d4 = ACKS.encounterDraw(c2, null, { territoryClass: 'unsettled', terrainKey: 'forest', hasRiver: false, rng: seq(0.5, 0.0, 0.0, 0.99, 0.5) });
  ok('a sparse-route step with the env override rolls its table', d4.identity === 'table' && d4.identityRoll.tableKey === 'forest-deciduous');
}

// =============================================================================
section('E4n — a search-hour meeting with nothing to stumble onto rolls the tables (Joachim 2026-06-11)');
{
  // (a) an EMPTY authored hex: lairFirst falls through to the same table + 6a chain
  //     as travel/rest — [cat 11 monster] [rarity 1 common] (pool: fresh) [d100 13 → orc] [lair% 100 → abroad] [count]
  const c = ACKS.blankCampaign({ name: 'searchdraw' });
  ACKS.migrateCampaign(c);
  c.hexes = [ACKS.blankHex({ id: 'hex-em', terrain: 'hills' })];
  const d = ACKS.encounterDraw(c, 'hex-em', { rng: seq(0.5, 0.0, 0.125, 0.99, 0.5), lairFirst: true });
  ok('an empty hex: the search draw rolls the identity table', d.identity === 'table'
    && d.identityRoll && d.identityRoll.tableKey === 'hills-any' && d.identityRoll.key === 'orc'
    && d.binding && d.binding.mode === 'wandering' && d.proposal === null);
  // (b) seeded shells still answer FIRST (RR p.276 — the party stumbled onto the hex's lairs)
  const cS = ACKS.blankCampaign({ name: 'shells' });
  ACKS.migrateCampaign(cS);
  cS.hexes = [ACKS.blankHex({ id: 'hex-sh', terrain: 'hills' })];
  ACKS.createLair(cS, { hexId: 'hex-sh', status: 'unknown' });
  const dSh = ACKS.encounterDraw(cS, 'hex-sh', { rng: seq(0.5, 0.0, 0.5), lairFirst: true });
  ok('seeded shells keep precedence (no table override)', dSh.identity === 'gm-pick' && dSh.proposal && dSh.proposal.source === 'seeded-shell');
  // (c) unmappable terrain (water) keeps the documented gm-pick fallback
  const cW = ACKS.blankCampaign({ name: 'water' });
  ACKS.migrateCampaign(cW);
  cW.hexes = [ACKS.blankHex({ id: 'hex-wa', terrain: 'water' })];
  const dW = ACKS.encounterDraw(cW, 'hex-wa', { rng: seq(0.5, 0.0, 0.5), lairFirst: true, territoryClass: 'unsettled' });
  ok('unmappable terrain stays gm-pick', dW.identity === 'gm-pick' && dW.proposal && dW.proposal.source === 'fresh');

  // ── the verbs derive the hex's table for an identity-LESS side (the screenshot case) ──
  const scout = ACKS.blankCharacter({ name: 'Searcher' }); scout.currentHexId = 'hex-em';
  c.characters.push(scout);
  const mkBare = (over) => ACKS.createEncounter(c, Object.assign({ trigger: 'hex-search', hexId: 'hex-em', category: 'monster', rarity: 'rare',
    partySide: { characterIds: [scout.id], faceCharacterId: scout.id, sizeCount: 1 },
    monsterSide: { source: 'fresh', encounterKind: 'wandering' } }, over || {}));
  const eNo = mkBare();
  ok('encounterDerivedTablePrior derives the hex table + the encounter rarity', (() => {
    const p = ACKS.encounterDerivedTablePrior(c, eNo.id);
    return !!p && p.tableKey === 'hills-any' && p.columnKey === null && p.rarity === 'rare';
  })());
  // ⟳ on the identity-less side = the FIRST roll, on the derived table (rarity overridable)
  const rr = ACKS.encounterRerollIdentity(c, eNo.id, { rarity: 'common', rng: seq(0.125, 0.99, 0.5) });
  ok('the ⟳ verb rolls the derived table (orc named, side bound)', rr.ok === true
    && eNo.monsterSide.identity && eNo.monsterSide.identity.natural === 13 && eNo.monsterSide.identity.tableKey === 'hills-any'
    && eNo.monsterSide.monsterCatalogKey === 'orc' && eNo.monsterSide.encounterKind === 'wandering');
  // pick-from-table likewise
  const ePick = mkBare();
  const pk = ACKS.encounterChooseIdentity(c, ePick.id, { label: 'Orc', key: 'orc', rarity: 'common', rng: seq(0.99, 0.5) });
  ok('the pick verb applies on the derived table', pk.ok === true && ePick.monsterSide.identity.gmChosen === true
    && ePick.monsterSide.identity.tableKey === 'hills-any' && ePick.monsterSide.monsterCatalogKey === 'orc');
  // no hex (or unmappable) → the old refusal stands
  const eNoHex = ACKS.createEncounter(c, { trigger: 'gm-authored', hexId: null, category: 'monster',
    partySide: { characterIds: [scout.id], sizeCount: 1 }, monsterSide: { source: 'fresh' } });
  ok('a placeless encounter still refuses no-table-identity', ACKS.encounterRerollIdentity(c, eNoHex.id, {}).error === 'no-table-identity');

  // ── E4m on a REBIND — an identity ⟳ never binds the quarry to its own pursuer ──
  const cQ = ACKS.blankCampaign({ name: 'rebind' });
  ACKS.migrateCampaign(cQ);
  cQ.houseRules['monster-pursuit'] = { enabled: true };
  cQ.hexes = [{ id: 'hex-q', coord: { q: 0, r: 0 }, terrain: 'hills', domainId: null }];
  const q = ACKS.blankCharacter({ name: 'Quarry' }); q.currentHexId = 'hex-q';
  const t3 = ACKS.blankCharacter({ name: 'Third' }); t3.currentHexId = 'hex-q';
  cQ.characters.push(q, t3);
  const chase = ACKS.createEncounter(cQ, { id: 'enc-q-chase', trigger: 'rest-night', hexId: 'hex-q', category: 'monster', rarity: 'common',
    partySide: { characterIds: [q.id], sizeCount: 1 },
    monsterSide: { source: 'fresh', monsterCatalogKey: 'common-wolf', count: 5, encounterKind: 'wandering' } });
  chase.phase = 'pursuit';
  chase.pursuit = { status: 'pursuing', pursuerLabel: 'Common Wolf', pursuerMilesPerDay: 18, gapMiles: 1,
                    lastPartyHexId: 'hex-q', traceConcealed: false, gmMod: 0, startedAtTurn: 1, startedOnDayInMonth: 1, throws: [{ kind: 'take-up', success: true }] };
  const mkMeet = (who) => ACKS.createEncounter(cQ, { trigger: 'gm-authored', hexId: 'hex-q', category: 'monster', rarity: 'common',
    partySide: { characterIds: [who.id], faceCharacterId: who.id, sizeCount: 1 },
    monsterSide: { source: 'fresh', encounterKind: 'wandering' } });
  // wolf = hills-any common 95–98 → natural 96 (rng 0.955); lair% 0.99 → abroad
  const eQ = mkMeet(q);
  const rQ = ACKS.encounterRerollIdentity(cQ, eQ.id, { rng: seq(0.955, 0.99, 0.5) });
  ok('the quarry\'s own reroll never binds its pursuer (falls to wandering)', rQ.ok === true
    && eQ.monsterSide.identity.key === 'common-wolf' && !eQ.monsterSide.pursuitEncounterId && eQ.monsterSide.encounterKind === 'wandering');
  const eT = mkMeet(t3);
  const rT = ACKS.encounterRerollIdentity(cQ, eT.id, { rng: seq(0.955, 0.99, 0.5) });
  ok('a third party\'s identical reroll DOES bind the hunting band', rT.ok === true
    && eT.monsterSide.pursuitEncounterId === 'enc-q-chase' && eT.monsterSide.source === 'pursuing-band' && eT.monsterSide.count === 5);
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
section('E3c — monster pursuit (RR p.285 + p.120; monster-pursuit, default ON — explicit untick wins)');
{
  const build = (ruleOn) => {
    const c = ACKS.blankCampaign({ name: 'pursuit' });
    ACKS.migrateCampaign(c);
    // Default ON since the HR-Enc move (2026-06-11) — the OFF path needs an explicit untick.
    c.houseRules['monster-pursuit'] = { enabled: !!ruleOn };
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

  // Rule explicitly OFF (the GM untick): a successful evasion resolves 'evaded' at once.
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
  ok('the monster-pursuit rule is registered default-ON (absent ⇒ enabled; HR-Enc 2026-06-11)', (() => {
    const reg = (ACKS.HOUSERULES_REGISTRY || []).find(r => r.id === 'monster-pursuit');
    const fresh2 = ACKS.blankCampaign({ name: 'x' });
    return !!reg && reg.default === true && ACKS.isHouseRuleEnabled(fresh2, 'monster-pursuit');
  })());
}

// =============================================================================
section('HR-Enc — the ⚔ Encounters house-rule tab (Joachim 2026-06-11)');
{
  // The category exists and both rules live in it, default ON.
  ok('HOUSERULE_CATEGORIES carries the encounters tab', (ACKS.HOUSERULE_CATEGORIES || []).some(cat => cat.id === 'encounters'));
  const pwm = (ACKS.HOUSERULES_REGISTRY || []).find(r => r.id === 'persistent-wandering-monsters');
  const mp  = (ACKS.HOUSERULES_REGISTRY || []).find(r => r.id === 'monster-pursuit');
  ok('persistent-wandering-monsters: category encounters, default ON', !!pwm && pwm.category === 'encounters' && pwm.default === true);
  ok('its description leads with the placed-entities sentence',
    !!pwm && /^Wandering-encounter survivors become placed entities on the world map\./.test(pwm.description));
  ok('monster-pursuit: category encounters, default ON', !!mp && mp.category === 'encounters' && mp.default === true);

  // E3a gates behind persistent-wandering-monsters: explicit OFF ⇒ the offer + verbs refuse.
  const c = ACKS.blankCampaign({ name: 'hr-enc' });
  ACKS.migrateCampaign(c);
  c.hexes = [ACKS.blankHex({ id: 'hex-hr', terrain: 'hills', terrainSubtype: 'rocky' })];
  const face = ACKS.blankCharacter({ name: 'Scout' }); face.abilities = { STR: 9, INT: 9, WIL: 9, DEX: 9, CON: 9, CHA: 9 };
  c.characters.push(face);
  const e = ACKS.createEncounter(c, { trigger: 'gm-authored', hexId: 'hex-hr', category: 'monster',
    partySide: { characterIds: [face.id], faceCharacterId: face.id, sizeCount: 1 },
    monsterSide: { monsterCatalogKey: 'orc', count: 4 } });
  ok('rule absent ⇒ ON (registry fallback) — the settle offer stands', ACKS.encounterSettleEligibility(c, e.id).eligible === true);
  c.houseRules['persistent-wandering-monsters'] = { enabled: false };
  ok('explicit OFF: eligibility refuses rule-off', ACKS.encounterSettleEligibility(c, e.id).reason === 'rule-off');
  const pOff = ACKS.encounterProposeSettle(c, e.id, { rng: seq(0.10) });
  ok('explicit OFF: propose refuses rule-off', !!pOff && pOff.ok === false && pOff.error === 'rule-off');
  const rOff = ACKS.encounterSettleAsLair(c, e.id, { proposal: { ok: true, lingers: true } });
  ok('explicit OFF: confirm refuses rule-off (no lair written)', !!rOff && rOff.ok === false && rOff.error === 'rule-off' && (c.lairs || []).length === 0);
  // Re-tick ⇒ the offer is live again (the gate is read live, no stored consequence).
  c.houseRules['persistent-wandering-monsters'] = { enabled: true };
  ok('re-ticked: eligible again', ACKS.encounterSettleEligibility(c, e.id).eligible === true);
}

// =============================================================================
section('E4 identity tables — integrity (every column covers 01–100; every key resolves)');
{
  const RARITIES = ['common', 'uncommon', 'rare', 'very-rare'];
  const MT = ACKS.ENCOUNTER_MONSTER_TABLES, CT = ACKS.ENCOUNTER_CIVILIZED_TABLE;
  ok('18 monster tables + 8 civilized columns ship', Object.keys(MT).length === 18 && Object.keys(CT.columns).length === 8);
  let badCover = 0, badKey = 0, nullLabels = new Set();
  const walk = (cells) => {
    let prev = 0;
    for(const c of cells){
      if(c.lo !== prev + 1) badCover++;
      prev = c.hi;
      if(c.key && !ACKS.findMonster(c.key)) badKey++;
      if(!c.key) nullLabels.add(c.label.replace(/\s*\([^)]*\)\s*/g, '').trim());
    }
    if(prev !== 100) badCover++;
  };
  for(const tk of Object.keys(MT)) for(const r of RARITIES) walk(MT[tk].columns[r]);
  for(const ck of Object.keys(CT.columns)) walk(CT.columns[ck].rows);
  ok('all 80 columns cover 01–100 contiguously (no gaps, no overlaps)', badCover === 0);
  ok('every keyed cell resolves in the MONSTER_CATALOG', badKey === 0);
  ok('null-key cells are exactly the excluded variable monsters (Dragon/Genie/Elemental/Sphinx/Mustard Mold)',
    [...nullLabels].every(l => /^(Dragon,|Genie|Sphinx|Elemental,|Mold, Mustard)/.test(l)));
  // row-exact spot cells, hand-verified against the printed JJ pages (incl. the two rows the
  // markdown conversion LOST — the PDF positional extraction is the source of truth)
  const at = (tk, r, n) => MT[tk].columns[r].find(c => n >= c.lo && n <= c.hi);
  ok('Barrens (Rocky/Sandy) common 01 = Baboon, Rock', at('barrens-rocky-sandy', 'common', 1).label === 'Baboon, Rock');
  ok('Desert uncommon 99–100 = Wight (the row the MD lost)', at('desert-any', 'uncommon', 99).label === 'Wight');
  ok('Desert rare 99–100 = Yali', at('desert-any', 'rare', 99).label === 'Yali');
  ok('Hills common 13–14 = Beastman, Orc → orc', at('hills-any', 'common', 13).key === 'orc');
  ok('the civilized swamp column 31–35 = Man, Bandit → bandit', (function(){
    const cell = CT.columns['swamp'].rows.find(c => 33 >= c.lo && 33 <= c.hi);
    return cell.label === 'Man, Bandit' && cell.key === 'bandit';
  })());
  // the regional cosmetic notes drive the aliases (printed mappings, not invention)
  ok('the zebra is a light horse (savanna note)', (function(){
    const cell = MT['grassland-savannah'].columns['common'].find(c => /Zebra/.test(c.label));
    return cell && cell.key === 'light-horse';
  })());
  // the terrain resolvers fold like the rest of the encounter layer
  ok('bare bases default to the common variant; rivers override', ACKS.encounterMonsterTableKeyFor('mountains', false) === 'mountains-forested-rocky'
    && ACKS.encounterMonsterTableKeyFor('forest-taiga', true) === 'river-temperate'
    && ACKS.encounterMonsterTableKeyFor('jungle', true) === 'river-desert-jungle'
    && ACKS.encounterMonsterTableKeyFor('water', false) === null);
  ok('barrens-tundra civilized column maps to taiga (🔧 no printed column)', ACKS.encounterCivilizedColumnKeyFor('barrens-tundra', false) === 'taiga');
}

section('E4 catalog growth — the Men/herd/missed entries the tables roll');
{
  const want = ['nomad', 'patroller', 'raider', 'large-herd-animal', 'huge-herd-animal', 'baleygr',
                'child-of-nasga', 'doppelganger', 'giant-carnivorous-fly', 'galdrtre',
                'giant-constricting-viper-snake', 'centaur', 'haugbui'];
  ok('all 13 new/rescued entries are in the catalog with usable mechanics', want.every(k => {
    const m = ACKS.findMonster(k);
    return m && typeof m.lairPct === 'number' && m.xp != null && m.numberAppearing && m.numberAppearing.wandering !== undefined;
  }));
  const brig = ACKS.findMonster('brigand');
  ok('brigand repaired (MM p.218: HD 1, leather kit — the shipped "By"/60 were column slides)', brig.hd === '1' && brig.ac === 2);
  ok('haugbui lairs always (MM: Lair "Always")', ACKS.findMonster('haugbui').lairPct === 100);
}

section('E4 binding materialization — shells detailed, pooled lairs revealed, dens minted (+ unwind)');
{
  const mkSide = () => ({ source: 'fresh', lairId: null, groupIds: [], monsterCatalogKey: '', count: null, encounterKind: null, label: '', identity: null, binding: null, minted: null });
  const orcIdent = { natural: 13, label: 'Beastman, Orc', key: 'orc', tableKey: 'hills-any', columnKey: null, rarity: 'common', page: 53 };
  // (a) populate-shell: the in-lair roll DETAILS one of the hex's seeded shells
  const c = ACKS.blankCampaign({ name: 'mat' });
  ACKS.migrateCampaign(c);
  c.hexes = [ACKS.blankHex({ id: 'hx', terrain: 'hills' })];
  const shell = ACKS.createLair(c, { hexId: 'hx', status: 'unknown', establishedBy: 'hex-seeding' });
  let b = ACKS.bindEncounterIdentity(c, 'hx', orcIdent, { category: 'monster', rng: () => 0.10 });   // d100 11 ≤ 35 → in-lair
  ok('in-lair + a shell → populate-shell with a pre-rolled lair count', b.mode === 'populate-shell' && b.shellLairId === shell.id && b.count >= 1);
  let side = mkSide();
  ACKS._applyIdentityBinding(c, side, orcIdent, b, { hexId: 'hx', atTurn: 3 });
  ok('the shell becomes the active, KNOWN orc den, bound to the encounter', shell.status === 'active' && shell.monsterCatalogKey === 'orc'
    && shell.knownToPlayers === true && side.lairId === shell.id && side.encounterKind === 'at-lair' && side.minted.mode === 'populate-shell');
  ACKS._unwindEncounterMinting(c, side.minted);
  ok('unwind restores the shell exactly (status, key, groups)', shell.status === 'unknown' && shell.monsterCatalogKey === '' && shell.groupIds.length === 0
    && (c.groups || []).length === 0);
  // (b) reveal-dynamic: the key-matched pooled lair places into the hex (RAW's parenthetical)
  c.lairs = []; c.groups = [];
  const dyn = ACKS.generateLair(c, { monsterCatalogKey: 'orc' }, () => 0.5);   // unplaced → stays dynamic? (fresh path creates active) — pin it
  dyn.lair.status = 'dynamic'; dyn.lair.hexId = null; dyn.group.currentHexId = null;
  b = ACKS.bindEncounterIdentity(c, 'hx', orcIdent, { category: 'monster', rng: () => 0.10 });
  ok('in-lair + a key-matched pooled lair → reveal-dynamic', b.mode === 'reveal-dynamic' && b.lairId === dyn.lair.id);
  side = mkSide();
  ACKS._applyIdentityBinding(c, side, orcIdent, b, { hexId: 'hx', atTurn: 3 });
  ok('the pooled lair reveals into the hex with its population', dyn.lair.status === 'active' && dyn.lair.hexId === 'hx' && dyn.group.currentHexId === 'hx');
  ACKS._unwindEncounterMinting(c, side.minted);
  ok('unwind returns it to the pool, population un-placed', dyn.lair.status === 'dynamic' && dyn.lair.hexId === null && dyn.group.currentHexId === null);
  // (c) fresh mint + unwind
  c.lairs = []; c.groups = [];
  b = ACKS.bindEncounterIdentity(c, 'hx', orcIdent, { category: 'monster', rng: () => 0.10 });
  ok('in-lair + nothing to match → fresh-lair', b.mode === 'fresh-lair');
  side = mkSide();
  ACKS._applyIdentityBinding(c, side, orcIdent, b, { hexId: 'hx', atTurn: 3 });
  ok('a new den is minted (establishedBy encounter-in-lair)', c.lairs.length === 1 && c.lairs[0].establishedBy === 'encounter-in-lair' && side.minted.mode === 'fresh-lair');
  ACKS._unwindEncounterMinting(c, side.minted);
  ok('unwind removes the den + its group', c.lairs.length === 0 && c.groups.length === 0);
  // (d) civilized folk never mint dens
  const civIdent = { natural: 20, label: 'Man, Bandit', key: 'bandit', tableKey: null, columnKey: 'hills-mountains', rarity: null, page: 43 };
  b = ACKS.bindEncounterIdentity(c, 'hx', civIdent, { category: 'civilized', rng: () => 0.10 });   // 11 ≤ 25 → in-lair, no den
  side = mkSide();
  ACKS._applyIdentityBinding(c, side, civIdent, b, { hexId: 'hx' });
  ok('civilized in-lair with no den → no mint (at their dwelling, lair-size count)', b.inLair === true && side.encounterKind === 'wandering' && c.lairs.length === 0 && side.minted === null);
  // (e) a null-key identity (Dragon, Genie…) → label-only wandering side, GM details
  const nullIdent = { natural: 50, label: 'Dragon, Red', key: null, tableKey: 'barrens-rocky-sandy', columnKey: null, rarity: 'very-rare', page: 45 };
  b = ACKS.bindEncounterIdentity(c, 'hx', nullIdent, { category: 'monster', rng: () => 0.10 });
  side = mkSide();
  ACKS._applyIdentityBinding(c, side, nullIdent, b, { hexId: 'hx' });
  ok('a null-key identity keeps the printed label, mints nothing', side.label === 'Dragon, Red' && side.monsterCatalogKey === '' && side.encounterKind === 'wandering' && c.lairs.length === 0);
}

section('E4 identity ⟳ + choose-from-table — same table, gated until the walk passes, mints unwound');
{
  const c = ACKS.blankCampaign({ name: 'verbs' });
  ACKS.migrateCampaign(c);
  c.currentTurn = 2;
  c.hexes = [ACKS.blankHex({ id: 'hx', terrain: 'hills' })];
  const mk = (rngVals) => {
    const draw = ACKS.encounterDraw(c, 'hx', { rng: seq(...rngVals) });
    return ACKS.createEncounterFromDraw(c, draw, { trigger: 'rest-night', partySide: { characterIds: [], sizeCount: 3 } });
  };
  // a wandering table encounter (hills uncommon @1; lair% fails)
  const e1 = mk([0.5, 0.5, 0.0, 0.99, 0.5]);
  ok('the entity carries the table identity', e1.monsterSide.identity && e1.monsterSide.identity.tableKey === 'hills-any' && e1.monsterSide.source === 'table');
  const before = e1.monsterSide.identity.label;
  const rr = ACKS.encounterRerollIdentity(c, e1.id, { rng: seq(0.40, 0.99, 0.5) });   // d100 41 on the same column
  ok('⟳ rerolls 1d100 on the SAME table + rarity', rr.ok === true && rr.identity.tableKey === 'hills-any'
    && rr.identity.natural === 41 && e1.monsterSide.identity.label !== undefined);
  ok('the reroll is stamped on the history', e1.history.some(h => h.type === 'identity-reroll'));
  // rarity switch on the reroll is allowed (a table pick, recorded)
  const rr2 = ACKS.encounterRerollIdentity(c, e1.id, { rarity: 'very-rare', rng: seq(0.10, 0.99, 0.5) });
  ok('a rarity switch rerolls that column', rr2.ok === true && rr2.identity.rarity === 'very-rare' && e1.rarity === 'very-rare');
  // choose-from-table: pick a null-key cell — the GM details the specifics
  const ch = ACKS.encounterChooseIdentity(c, e1.id, { label: 'Dragon, Red', key: null, rng: () => 0.99 });
  ok('choose applies the picked cell (label kept, no key, gmChosen)', ch.ok === true && e1.monsterSide.label === 'Dragon, Red'
    && e1.monsterSide.monsterCatalogKey === '' && e1.monsterSide.identity.gmChosen === true);
  ok('the choice is stamped on the history', e1.history.some(h => h.type === 'identity-chosen'));
  // a reroll whose prior identity MINTED a den unwinds it first
  c.lairs = []; c.groups = [];
  const e2 = mk([0.5, 0.0, 0.125, 0.0, 0.5]);   // orc (hills common 13) in-lair → fresh mint
  ok('the in-lair commit minted a den', c.lairs.length === 1 && e2.monsterSide.minted && e2.monsterSide.minted.mode === 'fresh-lair');
  const rr3 = ACKS.encounterRerollIdentity(c, e2.id, { rng: seq(0.0, 0.99, 0.5) });   // a new monster, wandering
  ok('the reroll unwound the discarded den', rr3.ok === true && c.lairs.length === 0 && e2.monsterSide.minted === null);
  // gates
  ACKS.encounterSetAwareness(c, e2.id, { partyForeknowledge: true, partyLineOfSight: true, monsterForeknowledge: true, monsterLineOfSight: true });
  ACKS.encounterRollSurprise(c, e2.id, { rng: () => 0.5 });
  ok('once surprise concludes, identity is locked', ACKS.encounterRerollIdentity(c, e2.id, { rng: () => 0.5 }).error === 'walk-past-identity');
  // E4n (2026-06-11) — an identity-less side at a mappable hex no longer refuses: the
  // verb derives the hex's own table and the ⟳ is the FIRST roll on it.
  const eGm = ACKS.createEncounter(c, { hexId: 'hx', category: 'monster' });
  const rGm = ACKS.encounterRerollIdentity(c, eGm.id, { rng: seq(0.40, 0.99, 0.5) });
  ok('a gm-authored identity-less encounter rolls the HEX-derived table (E4n)', rGm.ok === true
    && eGm.monsterSide.identity && eGm.monsterSide.identity.tableKey === 'hills-any' && eGm.monsterSide.identity.natural === 41);
  const eOff = ACKS.createEncounter(c, { hexId: null, category: 'monster' });
  ok('…while a placeless one still refuses with a reason', ACKS.encounterRerollIdentity(c, eOff.id, { rng: () => 0.5 }).error === 'no-table-identity');
}

section('E4 journey day revert — a den minted by the reverted day is unwound');
{
  const c = ACKS.blankCampaign({ name: 'revert' });
  ACKS.migrateCampaign(c);
  c.currentTurn = 1; c.currentDayInMonth = 1; c.calendar = { year: 1, month: 1, day: 1 };
  // adjacent grassland hexes: day 1 ENTERS hex-b (authored). At constant 0.5 the draw rolls
  // farmland-prairie uncommon @51 = Halfling (lair% 90) IN-LAIR → a fresh den mints at commit.
  c.hexes = [ACKS.blankHex({ id: 'hex-a', coord: { q: 0, r: 0 }, terrain: 'grassland' }),
             ACKS.blankHex({ id: 'hex-b', coord: { q: 1, r: 0 }, terrain: 'grassland' })];
  c.characters = [ACKS.blankCharacter({ id: 'chr-1', name: 'Scout' })];
  const j = ACKS.blankJourney({ id: 'jrn-m', name: 'Mint run', participantCharacterIds: ['chr-1'], startHexId: 'hex-a', destinationHexId: 'hex-b',
    supplies: { rations: 12, waterRations: 12, animalFeed: 0, animalWater: 0, shipStores: 0 } });
  c.journeys = [j];
  c.houseRules = { 'auto-pause-on-encounter': false, 'auto-pause-on-navigation-fail': false, 'auto-pause-on-supplies-low': false };
  ACKS.startJourney(c, j);
  const prop = ACKS.proposeJourneyDay(c, { dayInMonth: 2, rng: () => 0.5 });
  const rec = prop.pendingRecords[0];
  ok('the proposed day carries the halfling in-lair binding', rec.encounterProposals.length >= 1
    && rec.encounterProposals[0].draw.identityRoll.key === 'halfling' && rec.encounterProposals[0].draw.binding.mode === 'fresh-lair');
  ACKS.commitJourneyRecord(c, rec);
  const made = ACKS.findEncounter(c, rec.encounterProposals[0].id);
  ok('commit minted the den at the entered hex', !!made && made.monsterSide.minted && made.monsterSide.minted.mode === 'fresh-lair'
    && (c.lairs || []).some(l => l.hexId === 'hex-b' && l.monsterCatalogKey === 'halfling' && l.establishedBy === 'encounter-in-lair'));
  ACKS.rerollJourneyDay(c, j, { rng: () => 0.27 });   // re-run the day at a no-encounter die (d20 6)
  ok('the day revert removed the minted den + its group', !(c.lairs || []).some(l => l.monsterCatalogKey === 'halfling')
    && !(c.groups || []).some(g => g && g.currentHexId === 'hex-b'));
}

// =============================================================================
section('E5 — beginTracking: the find opens a FOLLOW (RR p.120 in full; replaces E4i\'s one-throw founding)');
{
  const c = ACKS.blankCampaign({ name: 'parted' });
  c.hexes = [{ id: 'hex-p', coord: { q: 0, r: 0 }, terrain: 'hills', domainId: null }];
  const tracker = ACKS.blankCharacter({ name: 'Hode' });
  tracker.currentHexId = 'hex-p'; tracker.proficiencies = ['Tracking'];
  const idler = ACKS.blankCharacter({ name: 'Unskilled' }); idler.currentHexId = 'hex-p';
  const away = ACKS.blankCharacter({ name: 'Faraway' }); away.currentHexId = 'hex-elsewhere'; away.proficiencies = ['Tracking'];
  c.characters.push(tracker, idler, away);
  const mk = (over) => ACKS.createEncounter(c, Object.assign({
    trigger: 'rest-night', hexId: 'hex-p', category: 'monster', rarity: 'common',
    partySide: { characterIds: [tracker.id], sizeCount: 2 },
    monsterSide: { source: 'fresh', monsterCatalogKey: 'orc', count: 5, encounterKind: 'wandering' }
  }, over || {}));

  // ── the gates ──
  mk({ id: 'enc-p-active' });
  let r = ACKS.beginTracking(c, { actorCharacterId: tracker.id, encounterId: 'enc-p-active' });
  ok('an un-resolved meeting refuses — they have not parted', !r.ok && r.error === 'encounter-still-active');
  const dis = mk({ id: 'enc-p-dismissed' }); dis.status = 'resolved'; dis.outcome = 'dismissed';
  r = ACKS.beginTracking(c, { actorCharacterId: tracker.id, encounterId: 'enc-p-dismissed' });
  ok('a dismissed/no-encounter meeting refuses — no trail', !r.ok && r.error === 'no-meeting');
  const parley = mk({ id: 'enc-p-parley' }); parley.status = 'resolved'; parley.outcome = 'parleyed';
  r = ACKS.beginTracking(c, { actorCharacterId: idler.id, encounterId: 'enc-p-parley' });
  ok('a tracker-less actor refuses (no Tracking — RR p.120 is a Tracking throw)', !r.ok && r.error === 'no-tracking');
  r = ACKS.beginTracking(c, { actorCharacterId: away.id, encounterId: 'enc-p-parley' });
  ok('a tracker elsewhere refuses — the trail starts at the meeting hex', !r.ok && r.error === 'not-at-trail-hex');

  // ── a failed find opens nothing ──
  const lairsBefore = (c.lairs || []).length;
  r = ACKS.beginTracking(c, { actorCharacterId: tracker.id, encounterId: 'enc-p-parley', countTracked: 5, rng: () => 0 });   // natural 1
  ok('a failed find returns ok + no success — no follow opens, nothing founded', r.ok && !r.success && !parley.pursuit
    && (c.lairs || []).length === lairsBefore && !parley.monsterSide.lairId);
  ok('…and the audit event records the failed search-hour', r.event && r.event.payload.method === 'begin-tracking'
    && r.event.payload.success === false && r.event.payload.activityCost && r.event.payload.activityCost.kind === 'track');

  // ── the success: a FOLLOW opens — the band is followed, no den is conjured ──
  r = ACKS.beginTracking(c, { actorCharacterId: tracker.id, encounterId: 'enc-p-parley', countTracked: 5, rng: seq(0.999, 0.2, 0.5) });
  ok('a successful find opens the follow (direction party, status tracking)', r.ok && r.success
    && parley.pursuit && parley.pursuit.direction === 'party' && parley.pursuit.status === 'tracking'
    && (c.lairs || []).length === lairsBefore);   // the den is found by ARRIVING, never by the throw
  ok('…a den-less band WANDERS (the E6 migration movement): half its speed, no fixed heading, no camp countdown',
    parley.pursuit.quarry.plan === 'wanders'
    && parley.pursuit.quarry.heading === null && parley.pursuit.quarry.walkDaysLeft === null
    && parley.pursuit.quarry.milesPerDay === 12);   // orc 24 mi expedition → wanders at 12
  ok('…the trackers\' journey starts at once, paced at half (RR p.120)', r.journeyAction === 'started'
    && r.journey && r.journey.status === 'in-transit' && r.journey.pace === 'half-speed'
    && parley.pursuit.journeyId === r.journey.id);
  ok('…and the pace cap holds whatever the GM sets (journeyMaxPace binding)', (function(){
    const cap = ACKS.journeyMaxPace(c, r.journey);
    return cap.maxPace === 'half-speed' && cap.binding && cap.binding.reason === 'tracking';
  })());
  const evp = r.event && r.event.payload;
  ok('…the hex-search event records the find', !!evp && evp.method === 'begin-tracking' && evp.success === true
    && evp.trackedEncounterId === 'enc-p-parley' && evp.activityCost && evp.activityCost.kind === 'track');
  r = ACKS.beginTracking(c, { actorCharacterId: tracker.id, encounterId: 'enc-p-parley' });
  ok('one live follow per meeting (already-tracking)', !r.ok && r.error === 'already-tracking');

  // ── civilized folk + label-only sides track too (Joachim: "all creatures who are met") ──
  const civ = mk({ id: 'enc-p-civ', category: 'civilized', monsterSide: { source: 'fresh', monsterCatalogKey: 'merchant', count: 3, encounterKind: 'wandering' } });
  civ.status = 'resolved'; civ.outcome = 'parleyed';
  r = ACKS.beginTracking(c, { actorCharacterId: tracker.id, encounterId: 'enc-p-civ', countTracked: 3, rng: seq(0.999, 0.2, 0.5) });
  ok('civilized folk are trackable — toward a dwelling, never a den (no settlement here → they roam)', r.ok && r.success
    && civ.pursuit.quarry.plan === 'wanders' && civ.pursuit.quarry.destLairId === null);
  const nameless = mk({ id: 'enc-p-nameless', monsterSide: { source: 'fresh', monsterCatalogKey: '', label: 'Dragon, Blue', count: 1, encounterKind: 'wandering' } });
  nameless.status = 'resolved'; nameless.outcome = 'parleyed';
  r = ACKS.beginTracking(c, { actorCharacterId: tracker.id, encounterId: 'enc-p-nameless', countTracked: 1, rng: seq(0.999, 0.2, 0.5) });
  ok('an unidentified/label-only side tracks at the fallback walking rate (24 🔧, halved roaming)', r.ok && r.success
    && nameless.pursuit.quarry.plan === 'wanders' && nameless.pursuit.quarry.milesPerDay === 12);

  // ── a fragment whose den is THIS hex: the quarry is already home — caught at once ──
  const hidden = ACKS.createLair(c, { hexId: 'hex-p', monsterCatalogKey: 'orc', status: 'active', name: 'The Hidden Warren' });
  hidden.knownToPlayers = false;
  const frag = mk({ id: 'enc-p-frag', monsterSide: { source: 'existing-lair', lairId: hidden.id, monsterCatalogKey: 'orc', count: 2, encounterKind: 'wandering-fragment' } });
  frag.status = 'resolved'; frag.outcome = 'evaded';
  const lairsBeforeFrag = (c.lairs || []).length;
  r = ACKS.beginTracking(c, { actorCharacterId: tracker.id, encounterId: 'enc-p-frag', countTracked: 2, rng: () => 0.999 });
  ok('a same-hex den is caught at once — the arrival IS the discovery, nothing new founded', r.ok && r.success
    && !!(r.caughtNow && r.caughtNow.denCatch) && r.caughtNow.lair.id === hidden.id
    && hidden.knownToPlayers === true && (hidden.discoveryHistory || []).some(d => d && d.method === 'tracking' && d.by === tracker.id)
    && (c.lairs || []).length === lairsBeforeFrag && r.journeyAction === 'none');
  ok('…the catch is an at-lair meeting against the den, D9-linked (an unpopulated shell falls back to the band)', r.caughtNow.encounter
    && r.caughtNow.encounter.monsterSide.encounterKind === 'at-lair'
    && r.caughtNow.encounter.monsterSide.lairId === hidden.id
    && r.caughtNow.encounter.monsterSide.pursuitEncounterId === 'enc-p-frag'
    && r.caughtNow.encounter.monsterSide.count === (ACKS.lairInhabitantCount(c, hidden) || 2));
  ok('…and D9 recalls the evaded meeting from the sprung catch', (function(){
    const prior = ACKS.priorReactionBetween(c, r.caughtNow.encounter);
    return !!prior && prior.encounterId === 'enc-p-frag' && prior.outcome === 'evaded';
  })());
  r = ACKS.beginTracking(c, { actorCharacterId: tracker.id, encounterId: 'enc-p-frag' });
  ok('tracking the same meeting again refuses — the den is known', !r.ok && r.error === 'already-known');

  // ── Joachim's flow (2026-06-11): "Den here" on an EVADED meeting first, THEN track. The settle
  //    links lairId (players-unknown); the band sits at its den in this hex — caught at once,
  //    discovering THAT den, never founding a second one. ──
  const sett = mk({ id: 'enc-p-settled', monsterSide: { source: 'fresh', monsterCatalogKey: 'orc', count: 6, encounterKind: 'wandering' } });
  sett.status = 'resolved'; sett.outcome = 'evaded';
  const sr = ACKS.encounterSettleAsLair(c, 'enc-p-settled', { rng: seq(0.01, 0.01) });   // lingers + full strength
  ok('settle-on-evaded founds an UNKNOWN den; the side keeps kind wandering', sr.ok && !sr.migrated && !!sr.lair
    && sr.lair.knownToPlayers === false && sett.monsterSide.lairId === sr.lair.id
    && sett.monsterSide.encounterKind === 'wandering' && sett.outcome === 'evaded');
  const lairsBeforeSettled = (c.lairs || []).length;
  r = ACKS.beginTracking(c, { actorCharacterId: tracker.id, encounterId: 'enc-p-settled', countTracked: 6, rng: () => 0.999 });
  ok('…and tracking the parted band catches it AT that den — no second den founded', r.ok && r.success
    && !!(r.caughtNow && r.caughtNow.denCatch) && r.caughtNow.lair.id === sr.lair.id
    && sr.lair.knownToPlayers === true && (c.lairs || []).length === lairsBeforeSettled);

  // ── the trail ages: −1 per 12 h of good weather (−2 per full day) on the find ──
  const old = mk({ id: 'enc-p-old' });
  ACKS.resolveEncounter(c, old.id, 'parleyed', {});
  c.currentDayInMonth = (c.currentDayInMonth || 1) + 2;   // two days pass before anyone searches
  r = ACKS.beginTracking(c, { actorCharacterId: tracker.id, encounterId: 'enc-p-old', countTracked: 5, rng: seq(0.999, 0.2, 0.5) });
  ok('a two-day-old trail finds at −4 (trail-age, itemized)', r.ok
    && r.find.modifiers.some(m => m.source === 'trail-age' && m.value === -4));
}

// =============================================================================
section('E4j — ⚔ Attack a known lair: beginLairAssault opens the meeting (Joachim 2026-06-11)');
{
  const c = ACKS.blankCampaign({ name: 'assault' });
  c.hexes = [{ id: 'hex-a', coord: { q: 0, r: 0 }, terrain: 'hills', domainId: null }];
  const a1 = ACKS.blankCharacter({ name: 'Vald' });  a1.currentHexId = 'hex-a'; a1.partyId = 'pty-raiders';
  const a2 = ACKS.blankCharacter({ name: 'Imre' });  a2.currentHexId = 'hex-a'; a2.partyId = 'pty-raiders';
  const far = ACKS.blankCharacter({ name: 'Far' });  far.currentHexId = 'hex-elsewhere';
  c.characters.push(a1, a2, far);
  const gen = ACKS.generateLair(c, { hexId: 'hex-a', monsterCatalogKey: 'orc' }, () => 0.5);
  const den = gen.lair;
  const living = ACKS.lairInhabitantCount(c, den);

  // ── the gates ──
  let r = ACKS.beginLairAssault(c, 'lai-nope');
  ok('unknown lair refuses', !r.ok && r.error === 'unknown-lair');
  r = ACKS.beginLairAssault(c, den.id);
  ok('an UNDISCOVERED den refuses — the party cannot march on what it has not found', !r.ok && r.error === 'not-known-to-players');
  den.knownToPlayers = true;
  const ghost = ACKS.createLair(c, { hexId: 'hex-a', monsterCatalogKey: 'orc', status: 'active', name: 'Old warren' });
  ghost.knownToPlayers = true;
  ACKS.clearLair(c, ghost.id, { reason: 'test' });
  r = ACKS.beginLairAssault(c, ghost.id);
  ok('a cleared lair refuses — nothing lives there', !r.ok && r.error === 'lair-not-active');
  a1.currentHexId = 'hex-elsewhere'; a2.currentHexId = 'hex-elsewhere';
  r = ACKS.beginLairAssault(c, den.id);
  ok('nobody at the hex refuses — travel there first', !r.ok && r.error === 'no-attackers');
  a1.currentHexId = 'hex-a'; a2.currentHexId = 'hex-a';

  // ── the assault opens as a first-class Encounter ──
  r = ACKS.beginLairAssault(c, den.id, { id: 'enc-assault-1' });
  ok('the assault opens', r.ok && !!r.encounter && r.encounter.id === 'enc-assault-1');
  const enc = r.encounter;
  ok('…trigger lair-assault, at the den’s hex, monster category', enc.trigger === 'lair-assault' && enc.hexId === 'hex-a' && enc.category === 'monster' && enc.status === 'active');
  ok('…the den’s side bound at-lair: lairId + key + the living count + its groups', enc.monsterSide.lairId === den.id
    && enc.monsterSide.monsterCatalogKey === 'orc' && enc.monsterSide.encounterKind === 'at-lair'
    && enc.monsterSide.count === living && JSON.stringify(enc.monsterSide.groupIds) === JSON.stringify(den.groupIds));
  ok('…the party side = everyone standing at the hex (their shared party kept)', JSON.stringify((enc.partySide.characterIds || []).slice().sort()) === JSON.stringify([a1.id, a2.id].sort())
    && enc.partySide.partyId === 'pty-raiders' && enc.partySide.sizeCount === 2);
  ok('…stamped on the encounter history', (enc.history || []).some(h => h && h.type === 'assault-begun'));
  ok('…and it shows in the den’s encounter list (monsterSide.lairId)', (c.encounters || []).filter(e => e && e.monsterSide && e.monsterSide.lairId === den.id).some(e => e.id === 'enc-assault-1'));

  // ── one open assault per den; resolving frees the gate + D9 remembers ──
  r = ACKS.beginLairAssault(c, den.id);
  ok('a second assault refuses while one is open', !r.ok && r.error === 'assault-in-progress' && r.encounter && r.encounter.id === 'enc-assault-1');
  ACKS.recordEncounterResolved(c, 'enc-assault-1', 'combat', { note: 'steel in the warren — GM resolves' });
  r = ACKS.beginLairAssault(c, den.id, { id: 'enc-assault-2' });
  ok('after resolution a new assault can open', r.ok && r.encounter.id === 'enc-assault-2');
  const prior = ACKS.priorReactionBetween(c, r.encounter);
  ok('…and D9 recalls the first assault (met before — combat)', !!prior && prior.encounterId === 'enc-assault-1' && prior.outcome === 'combat');
}

// =============================================================================
section('E4l — the pursuit take-up ⟳: reroll with two-way state reconcile (Joachim 2026-06-11)');
{
  const c = ACKS.blankCampaign({ name: 'takeup' });
  c.hexes = [{ id: 'hex-t', coord: { q: 0, r: 0 }, terrain: 'hills', domainId: null }];
  const ch = ACKS.blankCharacter({ name: 'Quarry' }); ch.currentHexId = 'hex-t';
  c.characters.push(ch);
  const mkChase = (id) => {
    const e = ACKS.createEncounter(c, { id, trigger: 'rest-night', hexId: 'hex-t', category: 'monster', rarity: 'common',
      partySide: { characterIds: [ch.id], sizeCount: 1 },
      monsterSide: { source: 'fresh', monsterCatalogKey: 'common-wolf', count: 4, encounterKind: 'wandering' } });
    e.phase = 'pursuit';
    e.pursuit = { status: 'offered', pursuerLabel: 'Common Wolf', pursuerMilesPerDay: 18, gapMiles: 1,
                  lastPartyHexId: null, traceConcealed: false, gmMod: 0, startedAtTurn: null, startedOnDayInMonth: null, throws: [] };
    return e;
  };

  // The failed take-up (nat 2, size 1 → band 0) resolves evaded with its event — Joachim's screenshot.
  const e1 = mkChase('enc-t1');
  let r = ACKS.encounterBeginPursuit(c, 'enc-t1', { rng: () => 0.05 });
  const evId = e1.resolvedByEventId;
  ok('the failed take-up resolves evaded with its event', e1.status === 'resolved' && e1.outcome === 'evaded'
    && !!evId && (c.eventLog || []).some(en => en && en.event && en.event.id === evId));
  // ⟳ → success: un-resolved, the event GONE, the chase starts.
  r = ACKS.encounterRerollPursuitTakeUp(c, 'enc-t1', { rng: () => 0.999 });
  ok('fail→success un-resolves and starts the chase', r.ok && r.changed === true && e1.status === 'active' && e1.outcome === null
    && e1.resolvedByEventId === null && e1.pursuit.status === 'pursuing'
    && e1.pursuit.startedAtTurn != null && e1.pursuit.lastPartyHexId === 'hex-t');
  ok('…the discarded resolution event is dropped from the eventLog', !(c.eventLog || []).some(en => en && en.event && en.event.id === evId));
  ok('…the throw rerolled in place (nat 20, success, rerolled 1)', e1.pursuit.throws.length === 1
    && e1.pursuit.throws[0].natural === 20 && e1.pursuit.throws[0].success === true && e1.pursuit.throws[0].rerolled === 1);
  ok('…history carries the reroll + the taken-up line', (e1.history || []).some(h => h && h.type === 'pursuit-takeup-reroll')
    && (e1.history || []).some(h => h && h.type === 'pursuit-taken-up'));
  // ⟳ again → failure: back to resolved evaded with a FRESH event; the pursuit un-started.
  r = ACKS.encounterRerollPursuitTakeUp(c, 'enc-t1', { rng: () => 0 });
  ok('success→fail resolves evaded again (a fresh event)', r.ok && r.changed === true && e1.status === 'resolved' && e1.outcome === 'evaded'
    && !!e1.resolvedByEventId && e1.resolvedByEventId !== evId
    && e1.pursuit.status === 'offered' && e1.pursuit.startedAtTurn === null && e1.pursuit.lastPartyHexId === null);
  // A same-outcome reroll changes only the die.
  r = ACKS.encounterRerollPursuitTakeUp(c, 'enc-t1', { rng: () => 0.1 });
  ok('a same-outcome reroll changes nothing but the die', r.ok && r.changed === false && e1.status === 'resolved' && e1.outcome === 'evaded');

  // Held modifiers: a band of 17+ men (+8) at GM −3 — the reroll holds both.
  const e2 = mkChase('enc-t2'); e2.partySide.sizeCount = 20;
  ACKS.encounterBeginPursuit(c, 'enc-t2', { mod: -3, rng: () => 0 });        // nat 1 auto-fails
  r = ACKS.encounterRerollPursuitTakeUp(c, 'enc-t2', { rng: () => 0.3 });    // nat 7 → 7+8−3 = 12 ≥ 11
  ok('the count band + GM modifier are held on the reroll', r.ok && r.takeUp.countBonus === 8 && r.takeUp.mod === -3
    && r.takeUp.total === 12 && r.takeUp.success === true && e2.pursuit.status === 'pursuing');

  // ── the gates ──
  e2.pursuit.throws.push({ kind: 'keep-trail', success: true });
  r = ACKS.encounterRerollPursuitTakeUp(c, 'enc-t2');
  ok('a daily keep-the-trail throw retires the ⟳ (chase under way)', !r.ok && r.error === 'chase-under-way');
  const e3 = mkChase('enc-t3');
  ACKS.encounterBeginPursuit(c, 'enc-t3', { rng: () => 0.05 });
  e3.history.push({ turn: 5, type: 'settle-check', reason: 'lingered' });
  r = ACKS.encounterRerollPursuitTakeUp(c, 'enc-t3');
  ok('a settle decision retires the ⟳ (the linger roll is never re-opened)', !r.ok && r.error === 'settle-decided');
  const e4 = mkChase('enc-t4');
  ACKS.encounterBeginPursuit(c, 'enc-t4', { rng: () => 0.999 });             // success → pursuing
  ACKS.encounterAbandonPursuit(c, 'enc-t4');                                 // the GM breaks off → evaded
  r = ACKS.encounterRerollPursuitTakeUp(c, 'enc-t4');
  ok('an abandoned chase stays ended (the success was not the resolver)', !r.ok && r.error === 'chase-ended');
  r = ACKS.encounterRerollPursuitTakeUp(c, 'enc-nope');
  ok('unknown encounter refuses', !r.ok && r.error === 'unknown-encounter');
}

// =============================================================================
section('E4m — loose bands abroad answer the wandering draw (Joachim 2026-06-11)');
{
  const c = ACKS.blankCampaign({ name: 'loose' });
  c.hexes = [{ id: 'hex-w', coord: { q: 0, r: 0 }, terrain: 'hills', domainId: null },
             { id: 'hex-x', coord: { q: 3, r: 0 }, terrain: 'hills', domainId: null }];
  const quarry = ACKS.blankCharacter({ name: 'Pellam' }); quarry.currentHexId = 'hex-w'; quarry.partyId = 'pty-q';
  const third  = ACKS.blankCharacter({ name: 'Third' });  third.currentHexId = 'hex-w';
  c.characters.push(quarry, third);
  const wolfIdent = { natural: 30, label: 'Wolf, Common', key: 'common-wolf', tableKey: 'hills-any', columnKey: null, rarity: 'common', page: 55 };
  const orcIdent  = { natural: 13, label: 'Orc',          key: 'orc',         tableKey: 'hills-any', columnKey: null, rarity: 'common', page: 55 };
  const mkChase = (id, over) => {
    const e = ACKS.createEncounter(c, Object.assign({ id, trigger: 'rest-night', hexId: 'hex-w', category: 'monster', rarity: 'common',
      partySide: { partyId: 'pty-q', characterIds: [quarry.id], sizeCount: 1 },
      monsterSide: { source: 'fresh', monsterCatalogKey: 'common-wolf', count: 5, encounterKind: 'wandering' } }, over || {}));
    e.phase = 'pursuit';
    e.pursuit = { status: 'pursuing', pursuerLabel: 'Common Wolf', pursuerMilesPerDay: 18, gapMiles: 1,
                  lastPartyHexId: 'hex-w', traceConcealed: false, gmMod: 0, startedAtTurn: 1, startedOnDayInMonth: 1, throws: [{ kind: 'take-up', success: true }] };
    return e;
  };

  // ── looseMonsterBands — the ONE derivation (binding + the 🐉 Monsters Groups table) ──
  ok('looseMonsterBands is exported', typeof ACKS.looseMonsterBands === 'function');
  const chase = mkChase('enc-w-chase');
  let bands = ACKS.looseMonsterBands(c);
  ok('a pursuing chase rows as a pursuer band at the trail hex', bands.length === 1 && bands[0].kind === 'pursuer'
    && bands[0].encounterId === 'enc-w-chase' && bands[0].monsterKey === 'common-wolf' && bands[0].count === 5
    && bands[0].hexId === 'hex-w' && bands[0].quarry.partyId === 'pty-q' && bands[0].quarry.characterIds[0] === quarry.id);
  const mig = ACKS.blankGroup({ name: 'The Scattered Fangs', groupTemplate: { monsterCatalogKey: 'common-wolf', creatureTypes: ['beast'], hitDice: '2' },
    count: 4, casualties: 1, currentHexId: 'hex-w' });
  c.groups.push(mig);
  const housedG = ACKS.blankGroup({ name: 'Housed', groupTemplate: { monsterCatalogKey: 'orc' }, count: 6, casualties: 0, currentHexId: 'hex-w' });
  c.groups.push(housedG);
  const den0 = ACKS.createLair(c, { hexId: 'hex-w', monsterCatalogKey: 'orc', status: 'active', name: 'Housing den' });
  den0.groupIds = [housedG.id];
  const fledG = ACKS.blankGroup({ name: 'Out of the warren', groupTemplate: { monsterCatalogKey: 'orc' }, count: 3, casualties: 0, currentHexId: 'hex-x' });
  c.groups.push(fledG);
  const deadDen = ACKS.createLair(c, { hexId: 'hex-x', monsterCatalogKey: 'orc', status: 'active', name: 'The fallen warren' });
  deadDen.groupIds = [fledG.id];
  ACKS.abandonLair(c, deadDen.id, { reason: 'test' });
  const deadG = ACKS.blankGroup({ name: 'All dead', groupTemplate: { monsterCatalogKey: 'orc' }, count: 2, casualties: 2, currentHexId: 'hex-w' });
  c.groups.push(deadG);
  bands = ACKS.looseMonsterBands(c);
  ok('migrants row (living, un-housed); housed + dead bands do not', bands.length === 3
    && bands.some(b => b.kind === 'migrant' && b.groupId === mig.id && b.count === 3 && b.hexId === 'hex-w')
    && !bands.some(b => b.groupId === housedG.id) && !bands.some(b => b.groupId === deadG.id));
  ok('a group out of a dead den rows with its provenance', bands.some(b => b.kind === 'migrant' && b.groupId === fledG.id && b.deadHomeLairId === deadDen.id));

  // ── the binding: a matching loose band answers the abroad verdict ──
  const ps3 = { characterIds: [third.id] };
  let b = ACKS.bindEncounterIdentity(c, 'hex-w', wolfIdent, { category: 'monster', rng: seq(0.99, 0.0), partySide: ps3 });
  ok('abroad + a matching band at the hex → mode loose-band', b.mode === 'loose-band' && b.inLair === false);
  ok('…the pick is deterministic on the seeded rng (pursuer first in the roster)', b.bandKind === 'pursuer' && b.encounterId === 'enc-w-chase' && b.count === 5);
  const b2 = ACKS.bindEncounterIdentity(c, 'hex-w', wolfIdent, { category: 'monster', rng: seq(0.99, 0.0), partySide: ps3 });
  const snapshot = JSON.stringify(c);
  ok('…pure + byte-stable (same rng → identical verdict, campaign untouched)', JSON.stringify(b) === JSON.stringify(b2) && JSON.stringify(c) === snapshot);
  b = ACKS.bindEncounterIdentity(c, 'hex-w', orcIdent, { category: 'monster', rng: seq(0.99, 0.5), partySide: ps3 });
  ok('key match required — an orc draw skips the wolf band (falls to the orc den\'s fragment)', b.mode === 'fragment' && b.lairId === den0.id);
  b = ACKS.bindEncounterIdentity(c, 'hex-w', wolfIdent, { category: 'monster', rng: seq(0.99, 0.0), partySide: { characterIds: [quarry.id] } });
  ok('the quarry never randomly meets its own pursuer (character overlap) — the migrant answers instead', b.mode === 'loose-band' && b.bandKind === 'migrant' && b.groupId === mig.id);
  mig.currentHexId = 'hex-x';   // move the migrant away — only the chase band remains at hex-w
  b = ACKS.bindEncounterIdentity(c, 'hex-w', wolfIdent, { category: 'monster', rng: seq(0.99, 0.5), partySide: { characterIds: [quarry.id] } });
  ok('…and with no other band it falls through to plain wandering', b.mode === 'wandering');
  b = ACKS.bindEncounterIdentity(c, 'hex-w', wolfIdent, { category: 'monster', rng: seq(0.99, 0.5), partySide: { partyId: 'pty-q', characterIds: [] } });
  ok('…the party-id overlap excludes likewise', b.mode === 'wandering');
  mig.currentHexId = 'hex-w';   // back for the rest
  // band beats fragment: a wolf DEN here too — the definite band still answers abroad
  const wolfDen = ACKS.generateLair(c, { hexId: 'hex-w', monsterCatalogKey: 'common-wolf' }, seq(0.5));
  b = ACKS.bindEncounterIdentity(c, 'hex-w', wolfIdent, { category: 'monster', rng: seq(0.99, 0.0), partySide: ps3 });
  ok('a loose band beats the den-fragment on the abroad verdict', b.mode === 'loose-band');
  ACKS.clearLair(c, wolfDen.lair.id, { reason: 'test' });

  // ── materialization: the side carries the band refs; nothing is minted ──
  const mkSide = () => ({ source: 'fresh', lairId: null, groupIds: [], monsterCatalogKey: '', count: null, encounterKind: null, label: '', identity: null, binding: null, minted: null, pursuitEncounterId: null });
  let side = mkSide();
  b = ACKS.bindEncounterIdentity(c, 'hex-w', wolfIdent, { category: 'monster', rng: seq(0.99, 0.0), partySide: ps3 });
  ACKS._applyIdentityBinding(c, side, wolfIdent, b, { hexId: 'hex-w' });
  ok('a pursuer binding: source pursuing-band + the chase link, wandering kind, no mint', side.source === 'pursuing-band'
    && side.pursuitEncounterId === 'enc-w-chase' && side.encounterKind === 'wandering' && side.count === 5 && side.minted === null);
  const draw = { hexId: 'hex-w', territoryClass: 'unsettled', columnKey: 'unsettled', category: 'monster', rarity: 'common',
                 identity: 'table', identityRoll: wolfIdent, binding: b, proposal: null };
  const met = ACKS.createEncounterFromDraw(c, draw, { trigger: 'journey-travel', partySide: { characterIds: [third.id], sizeCount: 1 } });
  ok('createEncounterFromDraw rides the verdict verbatim (the journey/rest commit shape)', !!met
    && met.monsterSide.source === 'pursuing-band' && met.monsterSide.pursuitEncounterId === 'enc-w-chase' && met.monsterSide.count === 5);
  side = mkSide();
  const bMig = ACKS.bindEncounterIdentity(c, 'hex-w', wolfIdent, { category: 'monster', rng: seq(0.99, 0.0), partySide: { characterIds: [quarry.id] } });
  ACKS._applyIdentityBinding(c, side, wolfIdent, bMig, { hexId: 'hex-w' });
  ok('a migrant binding: source migrant-band + the Group, the living count', side.source === 'migrant-band'
    && JSON.stringify(side.groupIds) === JSON.stringify([mig.id]) && side.count === 3 && side.pursuitEncounterId === null);
  ACKS._applyIdentityBinding(c, side, orcIdent, { mode: 'wandering', inLair: false, count: 2 }, { hexId: 'hex-w' });
  ok('a rebind away from a band drops its refs (pursuitEncounterId + groupIds cleared)', side.pursuitEncounterId === null
    && side.groupIds.length === 0 && side.source === 'table');
  // a stale ref degrades: resolve the chase, then apply its pre-rolled verdict
  const staleChase = mkChase('enc-w-stale');
  const bStale = ACKS.bindEncounterIdentity(c, 'hex-w', wolfIdent, { category: 'monster', rng: seq(0.99, 0.999), partySide: ps3 });
  ACKS.recordEncounterResolved(c, 'enc-w-stale', 'evaded', { note: 'GM closed it between propose and commit' });
  side = mkSide();
  const bForStale = (bStale.encounterId === 'enc-w-stale') ? bStale
    : { mode: 'loose-band', inLair: false, lairRoll: 99, lairPct: 25, bandKind: 'pursuer', encounterId: 'enc-w-stale', groupId: null, lairId: null, count: 5 };
  ACKS._applyIdentityBinding(c, side, wolfIdent, bForStale, { hexId: 'hex-w' });
  ok('a chase resolved between propose and commit degrades to plain wandering', side.source === 'table'
    && side.pursuitEncounterId === null && side.encounterKind === 'wandering');

  // ── D9 — the chase link IS identity ──
  ACKS.recordEncounterResolved(c, met.id, 'parleyed', { note: 'words on the trail' });
  const met2 = ACKS.createEncounterFromDraw(c, draw, { id: 'enc-w-met2', trigger: 'rest-night', partySide: { characterIds: [third.id], sizeCount: 1 } });
  const prior = ACKS.priorReactionBetween(c, met2);
  ok('a re-meeting with the same hunting band recalls the parley (D9 via the chase link)', !!prior && prior.encounterId === met.id && prior.outcome === 'parleyed');

  // ── the sprung caught-encounter carries the chase link (and recalls the evade) ──
  const chase2 = mkChase('enc-w-chase2');
  ACKS.commitPursuitRecord(c, { kind: 'pursuit-day', encounterId: 'enc-w-chase2', outcome: 'caught',
    trailThrow: { natural: 15, countBonus: 0, mod: 0, total: 15, target: 11, success: true },
    partyMiles: 0, pursuerMiles: 18, gapBefore: 1, gapAfter: 0, newPartyHexId: 'hex-w',
    caughtEncounterId: 'enc-w-sprung', caughtDistance: null, dayInMonth: 2, primaryHexId: 'hex-w' });
  const sprung = ACKS.findEncounter(c, 'enc-w-sprung');
  ok('the sprung encounter stamps pursuitEncounterId = the chase it sprang from', !!sprung
    && sprung.monsterSide.pursuitEncounterId === 'enc-w-chase2' && chase2.status === 'resolved' && chase2.outcome === 'evaded');
  const priorSprung = ACKS.priorReactionBetween(c, sprung);
  ok('…so the quarry recalls the evade it sprang from (a den-less, group-less band)', !!priorSprung && priorSprung.encounterId === 'enc-w-chase2' && priorSprung.outcome === 'evaded');

  // ── dispersed ends the chase; parley leaves the hunt running ──
  const chase3 = mkChase('enc-w-chase3');
  const meetA = ACKS.createEncounter(c, { id: 'enc-w-meetA', trigger: 'rest-night', hexId: 'hex-w', category: 'monster',
    partySide: { characterIds: [third.id], sizeCount: 1 },
    monsterSide: { source: 'pursuing-band', pursuitEncounterId: 'enc-w-chase3', monsterCatalogKey: 'common-wolf', count: 5, encounterKind: 'wandering' } });
  ACKS.recordEncounterResolved(c, 'enc-w-meetA', 'parleyed', {});
  ok('parleying with the hunters leaves the chase running', chase3.status === 'active' && chase3.pursuit.status === 'pursuing');
  const meetB = ACKS.createEncounter(c, { id: 'enc-w-meetB', trigger: 'rest-night', hexId: 'hex-w', category: 'monster',
    partySide: { characterIds: [third.id], sizeCount: 1 },
    monsterSide: { source: 'pursuing-band', pursuitEncounterId: 'enc-w-chase3', monsterCatalogKey: 'common-wolf', count: 5, encounterKind: 'wandering' } });
  ACKS.recordEncounterResolved(c, 'enc-w-meetB', 'dispersed', {});
  ok('scattering the hunters (dispersed) ends the chase — the quarry\'s evade resolves', chase3.status === 'resolved'
    && chase3.outcome === 'evaded' && (chase3.history || []).some(h => h && h.type === 'pursuit-broken'));

  // ── settle gates: mid-hunt refuses; the gate lifts when the chase ends ──
  const chase4 = mkChase('enc-w-chase4');
  const meetC = ACKS.createEncounter(c, { id: 'enc-w-meetC', trigger: 'rest-night', hexId: 'hex-w', category: 'monster',
    partySide: { characterIds: [third.id], sizeCount: 1 },
    monsterSide: { source: 'pursuing-band', pursuitEncounterId: 'enc-w-chase4', monsterCatalogKey: 'common-wolf', count: 5, encounterKind: 'wandering' } });
  let elig = ACKS.encounterSettleEligibility(c, 'enc-w-meetC');
  ok('a band mid-hunt does not den — settle refuses with band-mid-hunt', !elig.eligible && elig.reason === 'band-mid-hunt');
  ACKS.encounterAbandonPursuit(c, 'enc-w-chase4');
  elig = ACKS.encounterSettleEligibility(c, 'enc-w-meetC');
  ok('…and the offer stands again once that chase ends', elig.eligible === true);

  // ── settle ADOPTS a migrant band (no second population) ──
  const meetM = ACKS.createEncounter(c, { id: 'enc-w-meetM', trigger: 'rest-night', hexId: 'hex-w', category: 'monster',
    partySide: { characterIds: [third.id], sizeCount: 1 },
    monsterSide: { source: 'migrant-band', groupIds: [mig.id], monsterCatalogKey: 'common-wolf', count: 3, encounterKind: 'wandering' } });
  const groupsBefore = c.groups.length;
  const aliveBefore = ACKS.groupActiveCount(mig);
  const sr = ACKS.encounterSettleAsLair(c, 'enc-w-meetM', { rng: seq(0.01, 0.01, 0.5, 0.5) });   // lingers + full strength
  ok('a migrant-bound settle adopts the band — no new Group is minted', sr.ok && !sr.migrated && !!sr.lair
    && c.groups.length === groupsBefore && JSON.stringify(sr.lair.groupIds) === JSON.stringify([mig.id]));
  ok('…the den holds the band (grown to full strength when the second roll says so)', mig.currentHexId === 'hex-w'
    && ACKS.lairInhabitantCount(c, sr.lair) === Math.max(aliveBefore, sr.proposal.count)
    && sr.lair.treasureType === (sr.proposal.fullStrength ? ((ACKS.findMonster('common-wolf') || {}).treasureType || '') : ''));
  ok('…and the band leaves the loose roster (settled again — the Groups-table promise)', !ACKS.looseMonsterBands(c).some(x => x.groupId === mig.id));

  // ── tracking gates (E5): mid-hunt refuses; once the chase ends, the follow opens; and a
  //    roaming migrant Group is trackable too (Joachim: "they are migrating, whatever the
  //    circumstances") — the Group itself becomes the followed quarry ──
  const tracker = ACKS.blankCharacter({ name: 'Hode' }); tracker.currentHexId = 'hex-w'; tracker.proficiencies = ['Tracking'];
  c.characters.push(tracker);
  const chase5 = mkChase('enc-w-chase5');
  const meetH = ACKS.createEncounter(c, { id: 'enc-w-meetH', trigger: 'rest-night', hexId: 'hex-w', category: 'monster',
    partySide: { characterIds: [third.id], sizeCount: 1 },
    monsterSide: { source: 'pursuing-band', pursuitEncounterId: 'enc-w-chase5', monsterCatalogKey: 'common-wolf', count: 5, encounterKind: 'wandering' } });
  ACKS.recordEncounterResolved(c, 'enc-w-meetH', 'parleyed', {});
  let r = ACKS.beginTracking(c, { actorCharacterId: tracker.id, encounterId: 'enc-w-meetH', countTracked: 5, rng: () => 0.999 });
  ok('tracking a band mid-hunt refuses — its motion belongs to the chase', !r.ok && r.error === 'band-mid-hunt');
  ACKS.encounterAbandonPursuit(c, 'enc-w-chase5');
  r = ACKS.beginTracking(c, { actorCharacterId: tracker.id, encounterId: 'enc-w-meetH', countTracked: 5, rng: seq(0.999, 0.2, 0.5) });
  ok('…once that chase ends, the follow opens (E5 — no instant founding)', r.ok && r.success
    && meetH.pursuit && meetH.pursuit.direction === 'party' && meetH.pursuit.status === 'tracking'
    && r.journeyAction === 'started');
  const roam = ACKS.blankGroup({ name: 'Roamers', groupTemplate: { monsterCatalogKey: 'orc' }, count: 4, casualties: 0, currentHexId: 'hex-w' });
  c.groups.push(roam);
  const meetR = ACKS.createEncounter(c, { id: 'enc-w-meetR', trigger: 'rest-night', hexId: 'hex-w', category: 'monster',
    partySide: { characterIds: [third.id], sizeCount: 1 },
    monsterSide: { source: 'migrant-band', groupIds: [roam.id], monsterCatalogKey: 'orc', count: 4, encounterKind: 'wandering' } });
  ACKS.recordEncounterResolved(c, 'enc-w-meetR', 'parleyed', {});
  // the tracker is mid-follow from meetH — use a second tracker for the migrant
  const tracker2 = ACKS.blankCharacter({ name: 'Sif' }); tracker2.currentHexId = 'hex-w'; tracker2.proficiencies = ['Tracking'];
  c.characters.push(tracker2);
  r = ACKS.beginTracking(c, { actorCharacterId: tracker2.id, encounterId: 'enc-w-meetR', countTracked: 4, rng: seq(0.999, 0.2, 0.5) });
  ok('a roaming migrant Group is trackable — the Group itself is the quarry', r.ok && r.success
    && meetR.pursuit && meetR.pursuit.quarry.groupId === roam.id && meetR.pursuit.quarry.plan === 'wanders');
  ok('…and the tracked Group leaves the migrant roster, listed as a tracked band instead', (function(){
    const rows = ACKS.looseMonsterBands(c);
    return !rows.some(x => x.kind === 'migrant' && x.groupId === roam.id)
      && rows.some(x => x.kind === 'tracked' && x.encounterId === 'enc-w-meetR' && (x.groupIds || []).indexOf(roam.id) >= 0);
  })());
}

// =============================================================================
section('E5 — the follow day by day: the quarry walks, loss events break the trail, the catch springs the meeting');
{
  const mkWorld = () => {
    const c = ACKS.blankCampaign({ name: 'follow' });
    c.currentTurn = 5; c.currentDayInMonth = 10;
    const mh = (id, q, r, extra) => Object.assign(ACKS.blankHex({ id, coord: { q, r }, terrain: 'hills' }), extra || {});
    c.hexes = [mh('fx-a', 0, 0), mh('fx-b', 1, 0), mh('fx-c', 2, 0), mh('fx-d', 3, 0), mh('fx-e', 4, 0), mh('fx-f', 5, 0), mh('fx-g', 6, 0)];
    const t = ACKS.blankCharacter({ name: 'Tess' }); t.currentHexId = 'fx-a'; t.proficiencies = ['Tracking'];
    c.characters = [t];
    return { c, t };
  };
  const mkMeet = (c, t, over) => {
    const e = ACKS.createEncounter(c, Object.assign({
      trigger: 'journey', hexId: 'fx-a', category: 'monster', rarity: 'common',
      partySide: { characterIds: [t.id], sizeCount: 1 },
      monsterSide: { source: 'fresh', monsterCatalogKey: 'common-wolf', label: 'Common Wolf', count: 5, encounterKind: 'wandering', lairId: null, groupIds: [] }
    }, over || {}));
    ACKS.resolveEncounter(c, e.id, (over && over._outcome) || 'parleyed', {});
    return e;
  };

  // ── A: a fragment heads home (full speed) — the journey is steered quietly; the party
  //      arrives; the catch is an at-lair meeting and the arrival discovers the den ──
  {
    const { c, t } = mkWorld();
    const gen = ACKS.generateLair(c, { hexId: 'fx-d', monsterCatalogKey: 'common-wolf' }, () => 0.5);
    const den = gen.lair; den.knownToPlayers = false;
    const e = mkMeet(c, t, { id: 'enc-f-home', _outcome: 'evaded',
      monsterSide: { source: 'existing-lair', monsterCatalogKey: 'common-wolf', label: 'Common Wolf', count: 4, encounterKind: 'wandering-fragment', lairId: den.id, groupIds: [] } });
    const r = ACKS.beginTracking(c, { actorCharacterId: t.id, encounterId: 'enc-f-home', countTracked: 4, rng: seq(0.7, 0.5) });
    ok('A: the banded fragment heads home at FULL expedition speed', r.ok && r.success
      && e.pursuit.quarry.plan === 'heads-home' && e.pursuit.quarry.destLairId === den.id
      && e.pursuit.quarry.milesPerDay === 36);
    const evtsBefore = (c.eventLog || []).filter(x => x.event.kind === 'journey-rerouted').length;
    let out = ACKS.proposePursuitDay(c, { dayInMonth: 11, rng: () => 0.5 });
    const rec1 = out.pendingRecords.find(x => x.kind === 'tracking-day');
    ok('A: day 1 — the wolves reach their den (3 hexes at 36 mi) and go to ground', !!rec1 && rec1.outcome === 'tracking'
      && rec1.newQuarry.halted === true && rec1.newQuarry.hexId === 'fx-d' && rec1.quarryWalk.arrived === true);
    ACKS.commitPursuitRecord(c, rec1);
    ok('A: the journey is steered to the trail head QUIETLY (no journey-rerouted spam)', r.journey.destinationHexId === 'fx-d'
      && (c.eventLog || []).filter(x => x.event.kind === 'journey-rerouted').length === evtsBefore);
    // the party closes over the following days — stand them at the den hex
    r.journey.currentHexId = 'fx-d';
    out = ACKS.proposePursuitDay(c, { dayInMonth: 12, rng: () => 0.5 });
    const rec2 = out.pendingRecords.find(x => x.kind === 'tracking-day');
    ok('A: day 2 — caught, with the meeting pre-minted + the distance pre-rolled', !!rec2 && rec2.outcome === 'caught'
      && !!rec2.caughtEncounterId && !!rec2.caughtDistance);
    ok('A: the caught day pauses the tick (encounter trigger)', out.notableEvents.some(n => n.pauseTrigger === 'encounter' && n.payload && n.payload.encounterId === 'enc-f-home'));
    ACKS.commitPursuitRecord(c, rec2);
    const fresh = ACKS.findEncounter(c, rec2.caughtEncounterId);
    ok('A: the catch is an at-lair meeting against the den\'s living population', !!fresh
      && fresh.trigger === 'pursuit' && fresh.hexId === 'fx-d'
      && fresh.monsterSide.encounterKind === 'at-lair' && fresh.monsterSide.lairId === den.id
      && fresh.monsterSide.count === ACKS.lairInhabitantCount(c, den)
      && fresh.distance && fresh.distance.distanceFt === rec2.caughtDistance.distanceFt);
    ok('A: the arrival IS the discovery (method tracking) + the follow closes caught', den.knownToPlayers === true
      && (den.discoveryHistory || []).some(d => d && d.method === 'tracking')
      && e.pursuit.status === 'caught'
      && (c.eventLog || []).some(x => x.event.kind === 'lair-discovered' && x.event.payload.lairId === den.id));
    ok('A: D9 recalls the evaded meeting from the sprung catch', (function(){
      const p = ACKS.priorReactionBetween(c, fresh);
      return !!p && p.encounterId === 'enc-f-home' && p.outcome === 'evaded';
    })());
  }

  // ── B: rain/snow — ONE hour destroys the trail; the re-find answers it (RR p.120) ──
  {
    const { c, t } = mkWorld();
    const e = mkMeet(c, t, { id: 'enc-f-rain' });
    ACKS.beginTracking(c, { actorCharacterId: t.id, encounterId: 'enc-f-rain', countTracked: 5, rng: seq(0.7, 0.2, 0.5) });
    e.pursuit.weatherLostPending = true;                      // the GM lever: rain fell for an hour today
    let out = ACKS.proposePursuitDay(c, { dayInMonth: 11, rng: () => 0.95 });   // re-find 20 − 4 rain + 4 count = 20 ≥ 11
    let rec = out.pendingRecords.find(x => x.kind === 'tracking-day');
    ok('B: a rain day forces a re-find — success keeps the follow alive', !!rec && rec.outcome === 'tracking'
      && rec.refind && rec.refind.success === true
      && rec.refind.modifiers.some(m => m.source === 'rain-snow' && m.value === -4));
    ACKS.commitPursuitRecord(c, rec);
    ok('B: the re-find is recorded on the pursuit + the lever is consumed', e.pursuit.status === 'tracking'
      && e.pursuit.throws.some(x => x.kind === 're-find' && x.cause === 'rain')
      && e.pursuit.weatherLostPending === false);
    e.pursuit.weatherLostPending = true;                      // it rains again — and the search fails
    out = ACKS.proposePursuitDay(c, { dayInMonth: 12, rng: () => 0 });   // natural 1
    rec = out.pendingRecords.find(x => x.kind === 'tracking-day');
    ok('B: a failed re-find LOSES the trail — the follow ends, the tick pauses (navigation-fail)', !!rec && rec.outcome === 'lost'
      && out.notableEvents.some(n => n.pauseTrigger === 'navigation-fail'));
    ACKS.commitPursuitRecord(c, rec);
    ok('B: lost is terminal — and beginTracking may search again from the meeting', e.pursuit.status === 'lost'
      && (e.history || []).some(h => h && h.type === 'tracking-lost')
      && ACKS.beginTracking(c, { actorCharacterId: t.id, encounterId: 'enc-f-rain', countTracked: 5, rng: seq(0.999, 0.2, 0.5) }).success === true);
  }

  // ── C: the trail enters water — lost at the bank unless re-found (RR p.120) ──
  {
    const { c, t } = mkWorld();
    // a water hex on the quarry's path: the wolves head for a den beyond the river
    c.hexes[2].terrain = 'water';   // fx-c
    const gen = ACKS.generateLair(c, { hexId: 'fx-f', monsterCatalogKey: 'common-wolf' }, () => 0.5);
    gen.lair.knownToPlayers = false;
    const e = mkMeet(c, t, { id: 'enc-f-water', _outcome: 'evaded',
      monsterSide: { source: 'existing-lair', monsterCatalogKey: 'common-wolf', label: 'Common Wolf', count: 4, encounterKind: 'wandering-fragment', lairId: gen.lair.id, groupIds: [] } });
    ACKS.beginTracking(c, { actorCharacterId: t.id, encounterId: 'enc-f-water', countTracked: 4, rng: seq(0.7, 0.5) });
    const out = ACKS.proposePursuitDay(c, { dayInMonth: 11, rng: () => 0 });   // re-find natural 1 → lost
    const rec = out.pendingRecords.find(x => x.kind === 'tracking-day');
    ok('C: the quarry crossing water breaks the trail — the failed re-find loses it', !!rec
      && rec.quarryWalk.waterCrossed === true && rec.lossCause === 'water' && rec.outcome === 'lost');
    ACKS.commitPursuitRecord(c, rec);
    ok('C: …and the follow ends at the bank', e.pursuit.status === 'lost');
  }

  // ── D: a tracked migrant Group MOVES with the follow; third parties can meet it; a
  //      'dispersed' on that meeting ends the follow (the trail has no band left on it) ──
  {
    const { c, t } = mkWorld();
    const roam = ACKS.blankGroup({ name: 'Grey Drift', groupTemplate: { monsterCatalogKey: 'common-wolf' }, count: 5, casualties: 0, currentHexId: 'fx-a' });
    c.groups.push(roam);
    const e = mkMeet(c, t, { id: 'enc-f-mig',
      monsterSide: { source: 'migrant-band', monsterCatalogKey: 'common-wolf', label: 'Common Wolf', count: 5, encounterKind: 'wandering', lairId: null, groupIds: [roam.id] } });
    ACKS.beginTracking(c, { actorCharacterId: t.id, encounterId: 'enc-f-mig', countTracked: 5, rng: seq(0.7, 0.0, 0.9) });   // heading 0, 4 walk days
    ok('D: the Group itself is the quarry', e.pursuit.quarry.groupId === roam.id);
    const out = ACKS.proposePursuitDay(c, { dayInMonth: 11, rng: () => 0.5 });
    const rec = out.pendingRecords.find(x => x.kind === 'tracking-day');
    ACKS.commitPursuitRecord(c, rec);
    ok('D: the committed day moves the Group with the quarry (world stays consistent)',
      e.pursuit.quarry.hexId === roam.currentHexId || (e.pursuit.quarry.hexId === null && roam.currentHexId === 'fx-a'));
    // a third party at the quarry's hex draws — the tracked band answers; its own trackers never do
    if(e.pursuit.quarry.hexId){
      const third = ACKS.blankCharacter({ name: 'Else' }); third.currentHexId = e.pursuit.quarry.hexId; c.characters.push(third);
      const ident = { key: 'common-wolf', label: 'Wolf, Common' };
      const bThird = ACKS.bindEncounterIdentity(c, e.pursuit.quarry.hexId, ident, { category: 'monster', rng: seq(0.99, 0.5), partySide: { partyId: null, characterIds: [third.id] } });
      ok('D: a third party\'s abroad verdict binds the TRACKED band', bThird.mode === 'loose-band' && bThird.bandKind === 'tracked' && bThird.encounterId === 'enc-f-mig');
      const bSelf = ACKS.bindEncounterIdentity(c, e.pursuit.quarry.hexId, ident, { category: 'monster', rng: seq(0.99, 0.5), partySide: { partyId: null, characterIds: [t.id] } });
      ok('D: the trackers themselves never meet their quarry through the table (the catch owns it)', !(bSelf.mode === 'loose-band' && bSelf.bandKind === 'tracked'));
      // the bound side carries the link — and scattering the band ends the follow
      const side = { source: null, pursuitEncounterId: null, lairId: null, groupIds: [], encounterKind: null, count: null, minted: null };
      ACKS._applyIdentityBinding(c, side, ident, bThird, { hexId: e.pursuit.quarry.hexId });
      ok('D: the bound side carries source tracked-band + the follow link', side.source === 'tracked-band'
        && side.pursuitEncounterId === 'enc-f-mig' && JSON.stringify(side.groupIds) === JSON.stringify([roam.id]));
      const meet3 = ACKS.createEncounter(c, { id: 'enc-f-third', trigger: 'rest-night', hexId: e.pursuit.quarry.hexId, category: 'monster',
        partySide: { characterIds: [third.id], sizeCount: 1 },
        monsterSide: { source: 'tracked-band', pursuitEncounterId: 'enc-f-mig', monsterCatalogKey: 'common-wolf', count: 5, encounterKind: 'wandering', groupIds: [roam.id] } });
      ACKS.recordEncounterResolved(c, 'enc-f-third', 'dispersed', {});
      ok('D: scattering the tracked band ends the follow — no band left on the trail', e.pursuit.status === 'lost'
        && (e.history || []).some(h => h && h.type === 'tracking-broken'));
    }
  }

  // ── E: giving up + the RAW reliefs while following ──
  {
    const { c, t } = mkWorld();
    const e = mkMeet(c, t, { id: 'enc-f-quit' });
    const r = ACKS.beginTracking(c, { actorCharacterId: t.id, encounterId: 'enc-f-quit', countTracked: 5, rng: seq(0.7, 0.2, 0.5) });
    // following the spoor: NO Navigation throw (RR p.120 — following needs no throw)
    const tick = ACKS.tickJourneyDay(c, r.journey, { rng: () => 0.0 });   // a die that would FAIL navigation
    ok('E: a following party makes no Navigation throw — the spoor leads (RR p.120)',
      tick.record.dayRecord.navigation == null && tick.record.newIsLost === false);
    ok('E: journeyEffectivePace caps the GM\'s pace at half while following', (function(){
      r.journey.pace = 'forced-march';
      const p = ACKS.journeyEffectivePace(c, r.journey);
      r.journey.pace = 'half-speed';
      return p === 'half-speed';
    })());
    const q = ACKS.encounterAbandonTracking(c, 'enc-f-quit', { reason: 'night falls' });
    ok('E: giving up ends the follow (abandoned) — the meeting stays resolved as it was', q.ok
      && e.pursuit.status === 'abandoned' && e.status === 'resolved' && e.outcome === 'parleyed'
      && (e.history || []).some(h => h && h.type === 'tracking-abandoned'));
    ok('E: an abandoned follow frees the meeting for a fresh find', ACKS.beginTracking(c, { actorCharacterId: t.id, encounterId: 'enc-f-quit', countTracked: 5, rng: seq(0.999, 0.2, 0.5) }).success === true);
  }
}

// =============================================================================
section('E6 — the wander activity: migrants move on the Day Clock (half speed, random, never directly back)');
{
  // A 8×3 field; q≥5 is a domain. The wolf Group is a free migrant (no lair).
  const mkWorld = () => {
    const c = ACKS.blankCampaign({ name: 'E6 wander' });
    c.houseRules = {};
    for(let q = 0; q < 8; q++) for(let r = 0; r < 3; r++)
      c.hexes.push(Object.assign(ACKS.blankHex({}), { id: 'hex-' + q + '-' + r, coord: { q, r }, terrain: 'grassland' }, q >= 5 ? { domainId: 'dom-east' } : null));
    c.domains = [{ id: 'dom-east', name: 'Eastmarch' }];
    return c;
  };
  let c = mkWorld();
  const g = ACKS.blankGroup({ name: 'The Grey Pack',
    groupTemplate: { monsterCatalogKey: 'common-wolf', creatureTypes: ['animal'], hitDice: '2+2' },
    count: 6, currentHexId: 'hex-1-1' });
  c.groups.push(g);
  ok('blankGroup carries the lazy wanderState seam (null = the defaults govern)', 'wanderState' in g && g.wanderState === null);

  let res = ACKS.proposeMonsterBandDay(c, { dayInMonth: 2 });
  let rec = res.pendingRecords[0];
  ok('a placed migrant wanders: one record, half expedition speed (wolf 36 → 18 mi = 3 hexes)',
    res.pendingRecords.length === 1 && rec.groupId === g.id && rec.outcome === 'moving' && rec.path.length === 3);
  const res2 = ACKS.proposeMonsterBandDay(c, { dayInMonth: 2 });
  ok('the preview is byte-stable (seeded per band + world day — re-opening reproduces it)',
    JSON.stringify(res2.pendingRecords[0].newWanderState) === JSON.stringify(rec.newWanderState));
  ACKS.commitMonsterBandRecord(c, rec);
  ok('commit moves the Group + persists the walk state (coord, lastCoord, remainder)',
    g.currentHexId === rec.newHexId && g.wanderState && g.wanderState.coord
    && g.wanderState.coord.q === rec.newWanderState.coord.q && g.wanderState.lastCoord !== null);

  // never directly back — within a day AND across the day boundary (lastCoord persists)
  let backtracked = false;
  for(let d = 3; d < 16; d++){
    const rr = ACKS.proposeMonsterBandDay(c, { dayInMonth: ((d - 1) % 28) + 1 });
    const r1 = rr.pendingRecords.find(x => x.groupId === g.id);
    if(!r1) break;
    const pts = [{ q: g.wanderState.coord.q, r: g.wanderState.coord.r }].concat(r1.path);
    if(g.wanderState.lastCoord && pts.length > 1
       && pts[1].q === g.wanderState.lastCoord.q && pts[1].r === g.wanderState.lastCoord.r) backtracked = true;
    for(let i = 2; i < pts.length; i++) if(pts[i].q === pts[i - 2].q && pts[i].r === pts[i - 2].r) backtracked = true;
    ACKS.commitMonsterBandRecord(c, r1);
    if(r1.outcome !== 'moving') break;
  }
  ok('the wander never steps directly back into the hex it just left (across days too)', backtracked === false);

  // the GM's parking lever + the GM-move reseed
  g.wanderState.halted = true;
  ok('wanderState.halted parks the band (no record)', ACKS.proposeMonsterBandDay(c, { dayInMonth: 20 }).pendingRecords.length === 0);
  g.wanderState.halted = false;
  g.currentHexId = 'hex-0-0';   // the GM moved the band — the hex is the placement truth
  res = ACKS.proposeMonsterBandDay(c, { dayInMonth: 21 });
  rec = res.pendingRecords[0];
  ok('a GM move reseeds the walk from the new hex (lastCoord cleared)',
    rec && rec.newWanderState && (Math.abs(rec.path[0].q - 0) + Math.abs(rec.path[0].r - 0)) <= 2);

  // exclusions: housed, chase-side, rule OFF
  c = mkWorld();
  const den = ACKS.createLair(c, { hexId: 'hex-0-0', monsterCatalogKey: 'common-wolf', status: 'active', name: 'Den' });
  const housed = ACKS.blankGroup({ groupTemplate: { monsterCatalogKey: 'common-wolf', creatureTypes: ['animal'], hitDice: '2+2' }, count: 4, currentHexId: 'hex-0-0' });
  c.groups.push(housed); den.groupIds = [housed.id];
  const chaser = ACKS.blankGroup({ groupTemplate: { monsterCatalogKey: 'common-wolf', creatureTypes: ['animal'], hitDice: '2+2' }, count: 4, currentHexId: 'hex-1-1' });
  c.groups.push(chaser);
  const chaseE = ACKS.createEncounter(c, { trigger: 'journey', hexId: 'hex-1-1', category: 'monster',
    partySide: { characterIds: [], sizeCount: 2 },
    monsterSide: { monsterCatalogKey: 'common-wolf', count: 4, groupIds: [chaser.id], lairId: null } });
  chaseE.pursuit = { direction: 'monsters', status: 'pursuing', pursuerLabel: 'wolves', pursuerMilesPerDay: 18, gapMiles: 6, lastPartyHexId: 'hex-2-1', gmMod: 0, throws: [] };
  chaseE.phase = 'pursuit';
  res = ACKS.proposeMonsterBandDay(c, { dayInMonth: 2 });
  ok('housed populations + chase-side bands do not wander (the lair / the chase owns them)',
    res.pendingRecords.length === 0);
  c.houseRules['persistent-wandering-monsters'] = { enabled: false };
  const free = ACKS.blankGroup({ groupTemplate: { monsterCatalogKey: 'common-wolf', creatureTypes: ['animal'], hitDice: '2+2' }, count: 4, currentHexId: 'hex-1-0' });
  c.groups.push(free);
  ok('rule OFF: nothing moves (the static shipped world)', ACKS.proposeMonsterBandDay(c, { dayInMonth: 2 }).pendingRecords.length === 0);
}

section('E6 — wandering into a domain: the entry counts + the JJ p.103 disposition (linger settles, migrate moves on)');
{
  const mkWorld = () => {
    const c = ACKS.blankCampaign({ name: 'E6 incursion' });
    c.houseRules = {};
    for(let q = 0; q < 8; q++) for(let r = 0; r < 3; r++)
      c.hexes.push(Object.assign(ACKS.blankHex({}), { id: 'hex-' + q + '-' + r, coord: { q, r }, terrain: 'grassland' }, q >= 3 ? { domainId: 'dom-east' } : null));
    c.domains = [{ id: 'dom-east', name: 'Eastmarch' }];
    return c;
  };
  // forced rng: step e-ward into the domain; linger 1d100 low → LINGERS; strength low → FULL; lair dice high
  let c = mkWorld();
  let g = ACKS.blankGroup({ name: 'Wolves', groupTemplate: { monsterCatalogKey: 'common-wolf', creatureTypes: ['animal'], hitDice: '2+2' }, count: 4, currentHexId: 'hex-2-1' });
  c.groups.push(g);
  let res = ACKS.proposeMonsterBandDay(c, { dayInMonth: 2, rng: seq(0.0, 0.001, 0.001, 0.9, 0.9, 0.9) });
  let rec = res.pendingRecords[0];
  ok('the border crossing is recorded as a positive Daily-Domain-Encounter occurrence (the Vagaries stub)',
    rec.domainEntries.length === 1 && rec.domainEntries[0].occurrence === true
    && rec.domainEntries[0].domainId === 'dom-east' && rec.domainEntries[0].lairPct === 10);
  ok('…and the JJ p.103 disposition rolled AT the entry: linger + full strength, the walk stops there',
    rec.outcome === 'settled' && rec.settle && rec.settle.fullStrength === true
    && rec.settle.hexId === rec.domainEntries[0].hexId && rec.settle.count === 18);   // 3d6 at 0.9 ⇒ 18
  ACKS.commitMonsterBandRecord(c, rec);
  const lair = c.lairs[0];
  ok('the settle ADOPTS the Group (no second population): the den binds it, full strength gathers it',
    !!lair && lair.establishedBy === 'wander-settle' && lair.status === 'active' && lair.knownToPlayers === false
    && (lair.groupIds || []).join(',') === g.id && g.count === 18 && g.currentHexId === lair.hexId
    && g.wanderState === null);
  ok('…wolves hoard nothing — the Treasure Type follows the catalog even at full strength',
    lair.treasureType === '');
  ok('a settled band leaves the loose roster (housed)', ACKS.looseMonsterBands(c).length === 0);

  // migrate: linger roll HIGH → keeps wandering; the occurrence is still recorded
  c = mkWorld();
  g = ACKS.blankGroup({ name: 'Wolves', groupTemplate: { monsterCatalogKey: 'common-wolf', creatureTypes: ['animal'], hitDice: '2+2' }, count: 4, currentHexId: 'hex-2-1' });
  c.groups.push(g);
  res = ACKS.proposeMonsterBandDay(c, { dayInMonth: 2, rng: seq(0.0, 0.999, 0.5, 0.0, 0.0, 0.0) });
  rec = res.pendingRecords[0];
  ok('migrate: the disposition fails the linger → the band keeps wandering (the entry still counts)',
    rec.outcome === 'moving' && rec.domainEntries.length >= 1 && rec.domainEntries[0].lingers === false && !rec.settle);
  ACKS.commitMonsterBandRecord(c, rec);
  ok('…the occurrence lands in the Group\'s history (the trace Vagaries will consume — Phase 3 Military)',
    (g.history || []).some(h => h && h.type === 'incursion' && /domain encounter occurrence/.test(h.reason)));
  ok('…and no den was founded', c.lairs.length === 0);

  // within-domain steps do NOT re-roll (one disposition per border crossing): the band is
  // now INSIDE dom-east (lastDomainId carries it) — force the next day east, deeper in.
  res = ACKS.proposeMonsterBandDay(c, { dayInMonth: 3, rng: seq(0.0, 0.0, 0.0, 0.0, 0.0, 0.0) });
  rec = res.pendingRecords[0];
  ok('steps WITHIN the same domain roll no new disposition (entry = the border crossing)',
    !!rec && (rec.domainEntries || []).length === 0 && rec.outcome === 'moving');
}

section('E6 — the pursuit aftermath: a chase over with the band standing → home, or a wandering migrant');
{
  const mkWorld = () => {
    const c = ACKS.blankCampaign({ name: 'E6 aftermath' });
    c.houseRules = {};
    for(let q = 0; q < 9; q++) for(let r = 0; r < 3; r++)
      c.hexes.push(Object.assign(ACKS.blankHex({}), { id: 'hex-' + q + '-' + r, coord: { q, r }, terrain: 'grassland' }, (q >= 2 && q <= 4) ? { domainId: 'dom-mid' } : null));
    c.domains = [{ id: 'dom-mid', name: 'Midmark' }];
    return c;
  };
  const mkChase = (c, over) => {
    const e = ACKS.createEncounter(c, Object.assign({
      trigger: 'journey', hexId: 'hex-6-1', category: 'monster',
      partySide: { characterIds: [], sizeCount: 2 },
      monsterSide: Object.assign({ monsterCatalogKey: 'common-wolf', label: 'Common Wolf', count: 5, groupIds: [], lairId: null }, (over && over.monsterSide) || {})
    }, (over && over.enc) || {}));
    e.pursuit = { direction: 'monsters', status: 'pursuing', pursuerLabel: '5 Common Wolf',
                  pursuerMilesPerDay: 18, gapMiles: 6, lastPartyHexId: 'hex-7-1', gmMod: 0, throws: [] };
    return e;
  };

  // 1) the trail LOST (the daily consumer's commit) → a denless band becomes a wandering migrant
  let c = mkWorld();
  let e = mkChase(c);
  ACKS.commitPursuitRecord(c, { kind: 'pursuit-day', encounterId: e.id, outcome: 'lost',
    trailThrow: { natural: 1, countBonus: 2, mod: 0, total: 3, target: 11, success: false },
    newPartyHexId: 'hex-7-1', dayInMonth: 3 });
  ok('a lost chase mints the band as a wandering migrant at the trail\'s end', e.status === 'resolved'
    && e.pursuit.aftermath === 'migrant' && c.groups.length === 1
    && c.groups[0].currentHexId === 'hex-7-1' && c.groups[0].wanderState && c.groups[0].wanderState.mode === null);
  ok('…it rows as a migrant and wanders on the next Day Clock tick', (function(){
    const rows = ACKS.looseMonsterBands(c);
    const day = ACKS.proposeMonsterBandDay(c, { dayInMonth: 4 });
    return rows.length === 1 && rows[0].kind === 'migrant' && day.pendingRecords.length === 1 && day.pendingRecords[0].outcome === 'moving';
  })());
  ok('…the aftermath fires once (idempotent)', ACKS.pursuitAftermath(c, e, {}) === null && c.groups.length === 1);

  // 2) the band has a living placed den → it HEADS HOME (full speed, straight, no stops),
  //    crossing a domain with NO disposition, and dissolves into the den on arrival
  c = mkWorld();
  const den = ACKS.createLair(c, { hexId: 'hex-0-1', monsterCatalogKey: 'common-wolf', status: 'active', name: 'The Old Den', knownToPlayers: false });
  e = mkChase(c, { monsterSide: { lairId: den.id, encounterKind: 'wandering-fragment', count: 3 } });
  ACKS.commitPursuitRecord(c, { kind: 'pursuit-day', encounterId: e.id, outcome: 'lost',
    trailThrow: { natural: 1, countBonus: 2, mod: 0, total: 3, target: 11, success: false },
    newPartyHexId: 'hex-7-1', dayInMonth: 3 });
  const tok = c.groups[0];
  ok('a denned band turns for home: a transient walk token, full expedition speed, dissolve-on-arrival',
    e.pursuit.aftermath === 'heading-home' && tok && tok.wanderState.mode === 'heading-home'
    && tok.wanderState.destLairId === den.id && tok.wanderState.dissolveOnArrival === true);
  ok('…it rows as 🏠 homing (kind + den ref carried)', (function(){
    const rows = ACKS.looseMonsterBands(c);
    return rows.length === 1 && rows[0].kind === 'homing' && rows[0].lairId === den.id;
  })());
  let homeDays = 0, sawDomainEntry = false, arrived = false;
  while(homeDays < 5 && c.groups.some(x => x.id === tok.id)){
    const rr = ACKS.proposeMonsterBandDay(c, { dayInMonth: 4 + homeDays });
    const r1 = rr.pendingRecords.find(x => x.groupId === tok.id);
    if(!r1) break;
    if((r1.domainEntries || []).length) sawDomainEntry = true;
    ACKS.commitMonsterBandRecord(c, r1);
    homeDays++;
    if(r1.outcome === 'arrived-home') arrived = true;
  }
  ok('…it walks the straight line home in 2 days (7 hexes at 36 mi/day) and the token dissolves',
    arrived && homeDays === 2 && !c.groups.some(x => x.id === tok.id));
  ok('…NO domain disposition en route (homers do not stop or change behaviour)', sawDomainEntry === false);
  ok('…the den remembers the return', (den.history || []).some(h => h && h.type === 'returned'));

  // 3) the CAUGHT path: the sprung meeting (trigger pursuit) resolving parleyed fires it;
  //    dispersed = scattered, nothing
  c = mkWorld();
  e = mkChase(c);
  ACKS.commitPursuitRecord(c, { kind: 'pursuit-day', encounterId: e.id, outcome: 'caught',
    trailThrow: { natural: 15, countBonus: 2, mod: 0, total: 17, target: 11, success: true },
    partyMiles: 0, pursuerMiles: 18, gapBefore: 6, gapAfter: 0, newPartyHexId: 'hex-7-1', dayInMonth: 3 });
  const sprung = (c.encounters || []).find(x => x.trigger === 'pursuit' && x.monsterSide && x.monsterSide.pursuitEncounterId === e.id);
  ok('the catch springs the meeting; the chase has NO aftermath until that meeting concludes',
    !!sprung && !e.pursuit.aftermath && c.groups.length === 0);
  ACKS.recordEncounterResolved(c, sprung.id, 'parleyed', {});
  ok('the sprung meeting parleyed → the band survives → it walks off as a migrant (denless)',
    e.pursuit.aftermath === 'migrant' && c.groups.length === 1 && c.groups[0].currentHexId === sprung.hexId);
  c = mkWorld();
  e = mkChase(c);
  ACKS.commitPursuitRecord(c, { kind: 'pursuit-day', encounterId: e.id, outcome: 'caught',
    trailThrow: { natural: 15, countBonus: 2, mod: 0, total: 17, target: 11, success: true },
    partyMiles: 0, pursuerMiles: 18, gapBefore: 6, gapAfter: 0, newPartyHexId: 'hex-7-1', dayInMonth: 3 });
  const sprung2 = (c.encounters || []).find(x => x.trigger === 'pursuit');
  ACKS.recordEncounterResolved(c, sprung2.id, 'dispersed', {});
  ok('dispersed = scattered: NO aftermath, no band persists', !e.pursuit.aftermath && c.groups.length === 0);

  // 4) abandoning a running chase fires it; a failed TAKE-UP does not (the chase never began)
  c = mkWorld();
  e = mkChase(c);
  ACKS.encounterAbandonPursuit(c, e.id, { reason: 'dusk' });
  ok('a broken-off chase sends the band home / wandering too', e.pursuit.aftermath === 'migrant' && c.groups.length === 1);
  c = mkWorld();
  c.houseRules['monster-pursuit'] = { enabled: true };
  e = mkChase(c); e.pursuit.status = 'offered'; e.pursuit.gapMiles = 0;
  ACKS.encounterBeginPursuit(c, e.id, { rng: () => 0 });   // natural 1 — the trail was never found
  ok('a failed take-up does NOT fire (the band stands at its meeting — the settle offer governs it)',
    e.status === 'resolved' && !e.pursuit.aftermath && c.groups.length === 0);

  // 5) the E4m migrant-chaser: its OWN Group is reused (no mint) and wanders again
  c = mkWorld();
  const roam = ACKS.blankGroup({ name: 'The Grey Pack', groupTemplate: { monsterCatalogKey: 'common-wolf', creatureTypes: ['animal'], hitDice: '2+2' }, count: 5, currentHexId: 'hex-6-1' });
  c.groups.push(roam);
  e = mkChase(c, { monsterSide: { groupIds: [roam.id] } });
  ACKS.commitPursuitRecord(c, { kind: 'pursuit-day', encounterId: e.id, outcome: 'lost',
    trailThrow: { natural: 1, countBonus: 2, mod: 0, total: 3, target: 11, success: false },
    newPartyHexId: 'hex-7-1', dayInMonth: 3 });
  ok('a chasing migrant Group is REUSED (no second band): it stands at the trail end and wanders',
    c.groups.length === 1 && roam.currentHexId === 'hex-7-1' && roam.wanderState && roam.wanderState.mode === null);

  // 6) rule OFF = the shipped behavior, byte-identical (no group, no aftermath)
  c = mkWorld();
  c.houseRules['persistent-wandering-monsters'] = { enabled: false };
  e = mkChase(c);
  ACKS.commitPursuitRecord(c, { kind: 'pursuit-day', encounterId: e.id, outcome: 'lost',
    trailThrow: { natural: 1, countBonus: 2, mod: 0, total: 3, target: 11, success: false },
    newPartyHexId: 'hex-7-1', dayInMonth: 3 });
  ok('rule OFF: the band evaporates exactly as before (no group, no aftermath mark)',
    !e.pursuit.aftermath && c.groups.length === 0 && e.status === 'resolved');
}

section('E6 — a homing band abroad: findable (E4m), and a chase sprung from meeting it re-homes after');
{
  const c = ACKS.blankCampaign({ name: 'E6 rehome' });
  c.houseRules = {};
  for(let q = 0; q < 9; q++) for(let r = 0; r < 3; r++)
    c.hexes.push(Object.assign(ACKS.blankHex({}), { id: 'hex-' + q + '-' + r, coord: { q, r }, terrain: 'grassland' }));
  const den = ACKS.createLair(c, { hexId: 'hex-0-1', monsterCatalogKey: 'common-wolf', status: 'active', name: 'The Old Den', knownToPlayers: false });
  // a homing token mid-walk at hex-5-1
  const tok = ACKS.blankGroup({ name: '3 Common Wolf', groupTemplate: { monsterCatalogKey: 'common-wolf', creatureTypes: ['animal'], hitDice: '2+2' }, count: 3, currentHexId: 'hex-5-1' });
  tok.wanderState = { coord: { q: 5, r: 1 }, lastCoord: null, mileRemainder: 0, mode: 'heading-home',
                      destLairId: den.id, dissolveOnArrival: true, lastDomainId: null, halted: false };
  c.groups.push(tok);
  // a third party's wandering draw at its hex binds it AS ITSELF, the den ref carried
  const ident = { key: 'common-wolf', label: 'Wolf, Common', natural: 50 };
  const binding = ACKS.bindEncounterIdentity(c, 'hex-5-1', ident, { rng: seq(0.99, 0.5), partySide: { partyId: null, characterIds: [] } });
  ok('the abroad verdict binds the homing band first (mode loose-band, kind homing)',
    binding.mode === 'loose-band' && binding.bandKind === 'homing' && binding.groupId === tok.id);
  const side = { groupIds: [], lairId: null };
  ACKS._applyIdentityBinding ? ACKS._applyIdentityBinding(c, side, ident, binding, { hexId: 'hex-5-1' }) : null;
  ok('…the bound side carries source homing-band + the DEN ref (so a new chase re-homes)',
    side.source === 'homing-band' && side.lairId === den.id && (side.groupIds || []).join(',') === tok.id && side.count === 3);
  // a chase sprung from THAT meeting ends → the band re-homes (the directive's "return home after that pursuit")
  const meet = ACKS.createEncounter(c, { trigger: 'journey', hexId: 'hex-5-1', category: 'monster',
    partySide: { characterIds: [], sizeCount: 2 }, monsterSide: side });
  meet.pursuit = { direction: 'monsters', status: 'pursuing', pursuerLabel: '3 Common Wolf',
                   pursuerMilesPerDay: 18, gapMiles: 6, lastPartyHexId: 'hex-6-1', gmMod: 0, throws: [] };
  meet.phase = 'pursuit';
  ok('…while it chases, the wander consumer leaves it alone (the chase owns its motion)',
    ACKS.proposeMonsterBandDay(c, { dayInMonth: 2 }).pendingRecords.length === 0);
  ACKS.commitPursuitRecord(c, { kind: 'pursuit-day', encounterId: meet.id, outcome: 'lost',
    trailThrow: { natural: 1, countBonus: 2, mod: 0, total: 3, target: 11, success: false },
    newPartyHexId: 'hex-6-1', dayInMonth: 3 });
  ok('the new hunt over, the band turns for home AGAIN (reused, dissolve preserved)',
    meet.pursuit.aftermath === 'heading-home' && c.groups.length === 1
    && tok.wanderState.mode === 'heading-home' && tok.wanderState.destLairId === den.id
    && tok.wanderState.dissolveOnArrival === true && tok.currentHexId === 'hex-6-1');
}

// =============================================================================
section('E7 — the hunt rolls the wandering-monster draw (RR p.278, Joachim 2026-06-11)');
{
  // RR p.278: "Adventurers who hunt risk encountering wandering monsters, however, with the
  // Judge rolling on his encounter table based on the terrain." One TABLE-FIRST draw per
  // attempt (ENCOUNTER_FREQUENCY 'hunting' = per-attempt in every territory class); a meeting
  // (monster/civilized) materializes its Encounter entity at once — the hunt is a live GM verb,
  // like the search-hour. The draw rides the provisioning event's payload; the reroll holds it.
  const mkHuntWorld = () => {
    const c = ACKS.blankCampaign({ name: 'hunt' });
    c.hexes = [{ id: 'hex-h', coord: { q: 0, r: 0 }, terrain: 'forest', domainId: null }];
    const hunter = ACKS.blankCharacter({ name: 'Hunter' }); hunter.currentHexId = 'hex-h'; hunter.partyId = 'pty-h';
    const mate = ACKS.blankCharacter({ name: 'Mate' }); mate.currentHexId = 'hex-h'; mate.partyId = 'pty-h';
    c.characters.push(hunter, mate);
    return { c, hunter, mate };
  };
  const chaseAtHexH = (c, id, quarryCharacterId) => {
    const e = ACKS.createEncounter(c, { id, trigger: 'rest-night', hexId: 'hex-h', category: 'monster', rarity: 'common',
      partySide: { partyId: 'pty-h', characterIds: [quarryCharacterId], sizeCount: 1 },
      monsterSide: { source: 'fresh', monsterCatalogKey: 'common-jackal', count: 5, encounterKind: 'wandering' } });
    e.phase = 'pursuit';
    e.pursuit = { status: 'pursuing', pursuerLabel: 'Common Jackal', pursuerMilesPerDay: 24, gapMiles: 1,
                  lastPartyHexId: 'hex-h', traceConcealed: false, gmMod: 0, startedAtTurn: 1, startedOnDayInMonth: 1,
                  throws: [{ kind: 'take-up', success: true }] };
    return e;
  };
  // The shared meeting tape (unsettled column, the hex has no domain): hunt d20 20 → success;
  // category d20 10 → monster; rarity d20 1 → common; identity d100 51 on the forest table
  // (bare base folds to forest-deciduous) = Common Jackal; lair d100 100 → abroad (wandering).
  const meetingTape = () => seq(0.99, 0.45, 0.0, 0.50, 0.99, 0.5);

  // ── a quiet day: the unsettled column's 1–6 = No Encounter → null, nothing materialized ──
  let W = mkHuntWorld();
  let r = ACKS.huntActivity(W.c, { actorCharacterId: W.hunter.id, rng: seq(0.99, 0.25) });
  ok('a quiet hunt: throw resolved, encounter null, nothing materialized', r.ok && r.success === true
    && r.encounter === null && (W.c.encounters || []).length === 0 && r.event.payload.encounter == null);

  // ── a meeting materializes at once ──
  W = mkHuntWorld();
  r = ACKS.huntActivity(W.c, { actorCharacterId: W.hunter.id, rng: meetingTape() });
  const ent = (W.c.encounters || [])[0] || null;
  ok('a meeting materializes the Encounter entity (trigger hunt, active)', !!ent && ent.trigger === 'hunt' && ent.status === 'active');
  ok('…the table named the side (common-jackal ×4, wandering, source table)', !!ent
    && ent.monsterSide.monsterCatalogKey === 'common-jackal' && ent.monsterSide.count === 4
    && ent.monsterSide.encounterKind === 'wandering' && ent.monsterSide.source === 'table');
  ok('…partySide = the hunter cohort (party co-members at the hex), face = the hunter', !!ent
    && ent.partySide.characterIds.length === 2 && ent.partySide.characterIds.indexOf(W.hunter.id) >= 0
    && ent.partySide.characterIds.indexOf(W.mate.id) >= 0 && ent.partySide.faceCharacterId === W.hunter.id);
  ok('…the payload carries the compact record (id + label)', r.encounter && r.encounter.encounterId === ent.id
    && r.encounter.label === '4 Common Jackal' && r.event.payload.encounter.encounterId === ent.id);
  ok('…the provisioning event is the last log entry + its narrative names the meeting',
    W.c.eventLog[W.c.eventLog.length - 1].event.id === r.event.id
    && /crosses paths with 4 Common Jackal/.test(W.c.eventLog[W.c.eventLog.length - 1].result.narrativeSummary));

  // ── the reroll re-throws ONLY the hunting die — the draw is held (the search-reroll philosophy) ──
  const rr = ACKS.rerollProvisioningActivity(W.c, r.event.id, { rng: () => 0 });
  ok('reroll holds the encounter: same entity, same record, only the hunt die moved', rr.ok && rr.rolled === 1
    && rr.success === false && rr.encounter && rr.encounter.encounterId === ent.id
    && (W.c.encounters || []).length === 1 && r.event.payload.encounter.encounterId === ent.id);

  // ── a terrain category (unsettled 19–20 = unique) records with no entity ──
  W = mkHuntWorld();
  r = ACKS.huntActivity(W.c, { actorCharacterId: W.hunter.id, rng: seq(0.99, 0.99) });
  ok('a terrain find: recorded (category unique), nothing materialized', r.encounter
    && r.encounter.category === 'unique' && r.encounter.encounterId === null && (W.c.encounters || []).length === 0);
  ok('…and the narrative says so', /unique terrain encounter/.test(W.c.eventLog[W.c.eventLog.length - 1].result.narrativeSummary));

  // ── E4m: the hunter never draws the band hunting HIM — a third party does ──
  W = mkHuntWorld();
  chaseAtHexH(W.c, 'enc-hunt-chase', W.hunter.id);
  const third = ACKS.blankCharacter({ name: 'Third' }); third.currentHexId = 'hex-h';
  W.c.characters.push(third);
  r = ACKS.huntActivity(W.c, { actorCharacterId: third.id, rng: meetingTape() });
  let side = (W.c.encounters || []).find(e => e.trigger === 'hunt');
  ok('a third party hunt draws the chasing band AS ITSELF (E4m)', !!side
    && side.monsterSide.source === 'pursuing-band' && side.monsterSide.pursuitEncounterId === 'enc-hunt-chase'
    && side.monsterSide.count === 5);
  W = mkHuntWorld();
  chaseAtHexH(W.c, 'enc-hunt-chase2', W.hunter.id);
  r = ACKS.huntActivity(W.c, { actorCharacterId: W.hunter.id, rng: meetingTape() });
  side = (W.c.encounters || []).find(e => e.trigger === 'hunt');
  ok('the quarry own hunt falls through to plain wandering (never its pursuer)', !!side
    && side.monsterSide.source === 'table' && !side.monsterSide.pursuitEncounterId && side.monsterSide.count === 4);

  // ── no authored hex → no draw (the E6 unauthored rule) ──
  W = mkHuntWorld();
  W.hunter.currentHexId = null;
  r = ACKS.huntActivity(W.c, { actorCharacterId: W.hunter.id, rng: seq(0.99) });
  ok('a hexless hunter rolls no draw (encounter null)', r.ok && r.encounter === null && (W.c.encounters || []).length === 0);
}

// =============================================================================
section('E8 — the evasion aftermath carries to the journey (RR p.285, Joachim 2026-06-11)');
{
  // RR p.285: "Once the party comes to a halt, it must IMMEDIATELY make a Navigation throw
  // at −4… If the throw fails, the party or group is lost and knows it." The throw is rolled
  // at the evasion (itemized) and CARRIED: the party's active journey goes to status 'lost'
  // (KNOWINGLY — it HOLDS, unlike the §27 unknowing stray) until the RAW landmark search
  // (a Wilderness Searching throw "as if it were a point of interest"), a re-route, or the
  // GM recovers it. The forest navigation target is 8+ (JOURNEY_NAV_THROWS).
  const mkEvadeWorld = (withJourney) => {
    const c = ACKS.blankCampaign({ name: 'evade' });
    c.hexes = [{ id: 'hex-e', coord: { q: 0, r: 0 }, terrain: 'forest', domainId: null },
               { id: 'hex-f', coord: { q: 3, r: 0 }, terrain: 'forest', domainId: null }];
    const trav = ACKS.blankCharacter({ name: 'Traveller' }); trav.currentHexId = 'hex-e';
    c.characters.push(trav);
    let j = null;
    if(withJourney){
      j = ACKS.blankJourney({ id: 'jrn-e8', name: 'The trek', status: 'in-transit',
        participantCharacterIds: [trav.id], startHexId: 'hex-e', destinationHexId: 'hex-f', currentHexId: 'hex-e' });
      c.journeys.push(j);
    }
    const enc = ACKS.createEncounter(c, { id: 'enc-e8', trigger: 'journey-travel', hexId: 'hex-e', category: 'monster', rarity: 'common',
      partySide: { journeyId: j ? j.id : null, partyId: null, characterIds: [trav.id], faceCharacterId: trav.id, sizeCount: 1 },
      monsterSide: { source: 'fresh', monsterCatalogKey: 'common-wolf', count: 3, encounterKind: 'wandering' } });
    enc.surprise = { party: { surprised: false }, monsters: { surprised: true }, evadeEligibility: 'can' };
    return { c, trav, j, enc };
  };

  // ── the throw rides the aftermath: success keeps the bearings (constant 0.7 → nav d20 15, 15−4=11 ≥ 8) ──
  let W = mkEvadeWorld(true);
  let r = ACKS.encounterAttemptEvasion(W.c, 'enc-e8', { rng: () => 0.7 });
  let a = W.enc.evasion.aftermath;
  ok('evaded: the RR p.285 nav throw rides the aftermath, itemized', r.ok && W.enc.evasion.success
    && a.navThrow && a.navThrow.natural === 15 && a.navThrow.target === 8
    && a.navThrow.modifiers.some(m => m.source === 'evasion-displaced' && m.value === -4) && a.navThrow.total === 11);
  ok('…success → bearings kept: knownLost false, the journey untouched', a.knownLost === false
    && a.journeyId === null && W.j.status === 'in-transit' && !W.j.lostEncounterId);

  // ── failure carries: status lost + lostEncounterId + journey history (constant 0.10 → nav 3−4=−1) ──
  W = mkEvadeWorld(true);
  r = ACKS.encounterAttemptEvasion(W.c, 'enc-e8', { rng: () => 0.10 });
  a = W.enc.evasion.aftermath;
  ok('failure → LOST and knows it, carried to the journey', a.knownLost === true && a.journeyId === 'jrn-e8'
    && W.j.status === 'lost' && W.j.lostEncounterId === 'enc-e8');
  ok('…the journey history records the displacement + the failed throw', (W.j.history || []).some(h =>
    h.type === 'lost' && /knows it/.test(h.narrative) && /Navigation throw at −4/.test(h.narrative)));
  ok('…and the encounter history stamps the verdict', (W.enc.history || []).some(h =>
    h.type === 'evasion-navigation' && /LOST/.test(h.reason)));

  // ── the party's nav proficiency counts (+4 Navigation: nav d20 3 +4 −4 = 3 < 8 still lost; 0.35 → 8 +4 −4 = 8 ✓) ──
  W = mkEvadeWorld(true);
  W.trav.proficiencies = ['Navigation'];
  r = ACKS.encounterAttemptEvasion(W.c, 'enc-e8', { rng: () => 0.35 });
  a = W.enc.evasion.aftermath;
  ok('the party +4 Navigation bonus itemizes and clears the throw (8+4−4 = 8 vs 8+)', a.navThrow
    && a.navThrow.natural === 8 && a.navThrow.modifiers.some(m => m.source === 'party-proficiency' && m.value === 4)
    && a.navThrow.total === 8 && a.knownLost === false);

  // ── natural 1 always fails (constant 0 → d20 1, even with +8) ──
  W = mkEvadeWorld(true);
  W.trav.proficiencies = ['Navigation']; W.trav.classPowers = ['Pathfinding'];
  ACKS.encounterAttemptEvasion(W.c, 'enc-e8', { rng: () => 0 });
  a = W.enc.evasion.aftermath;
  ok('natural 1 auto-fails the nav throw (+8 notwithstanding)', a.navThrow.natural === 1 && a.knownLost === true && W.j.status === 'lost');

  // ── the overlap fallback: no journeyId on the partySide, the journey found via the participant ──
  W = mkEvadeWorld(true);
  W.enc.partySide.journeyId = null;
  ACKS.encounterAttemptEvasion(W.c, 'enc-e8', { rng: () => 0.10 });
  ok('no stamped journeyId → the carry resolves the journey via the participant overlap',
    W.j.status === 'lost' && W.enc.evasion.aftermath.journeyId === 'jrn-e8');

  // ── no journey → the verdict stays on the encounter (panel-only) ──
  W = mkEvadeWorld(false);
  ACKS.encounterAttemptEvasion(W.c, 'enc-e8', { rng: () => 0.10 });
  a = W.enc.evasion.aftermath;
  ok('a journeyless party: knownLost recorded, nothing to carry', a.knownLost === true && a.journeyId === null);

  // ── the reroll path (a FAILED evasion rerolled into success rolls the same aftermath + carry) ──
  W = mkEvadeWorld(true);
  W.enc.surprise.monsters.surprised = false;                       // no auto-success → the throw can fail
  ACKS.encounterAttemptEvasion(W.c, 'enc-e8', { rng: () => 0 });   // evasion fails (natural 1)
  ok('the failed evasion did not roll an aftermath', !W.enc.evasion.success && !W.enc.evasion.aftermath);
  ACKS.encounterRerollEvasion(W.c, 'enc-e8', { rng: () => 0.10 }); // succeeds the evasion (vs the forest party-size target), nav 3−4 fails
  a = W.enc.evasion.aftermath;
  ok('the evasion ⟳ rolls the aftermath + the nav throw + the carry, same as the original',
    W.enc.evasion.success && a && a.navThrow && a.knownLost === true && W.j.status === 'lost');

  // ── the held journey: no travel days; its members are a stationary field group ──
  W = mkEvadeWorld(true);
  ACKS.encounterAttemptEvasion(W.c, 'enc-e8', { rng: () => 0.10 });
  ACKS.resolveEncounter(W.c, 'enc-e8', 'evaded');                  // close the meeting so no pause noise
  W.trav.waterDaysCarried = 0;                                     // thirsty → the survival consumer records
  const sd = ACKS.proposeSurvivalDay(W.c, {});
  ok('a lost journey member is a stationary FIELD group (the survival consumer owns him)',
    (sd.pendingRecords || []).some(rec => (rec.memberIds || []).indexOf(W.trav.id) >= 0));
  W.j.status = 'in-transit';
  ok('…while in-transit the journey path owns him (excluded here)',
    !(ACKS.proposeSurvivalDay(W.c, {}).pendingRecords || []).some(rec => (rec.memberIds || []).indexOf(W.trav.id) >= 0));
  W.j.status = 'lost';
  const jd = ACKS.proposeJourneyDay(W.c, { dayInMonth: 2 });
  ok('…and the journeys consumer leaves the held journey alone (no travel day)',
    !((jd && jd.pendingRecords) || []).some(rec => rec.journeyId === 'jrn-e8' || (rec.payload && rec.payload.journeyId === 'jrn-e8')));
  const bud = ACKS.characterActivityBudget(W.c, W.trav.id);
  ok('…the day budget shows the hold and charges nothing', bud.dedicatedUsed === 0 && bud.ancillaryUsed === 0
    && (bud.incidental || []).some(x => x.sourceKind === 'journey' && /lost — holding position/.test(x.label)));

  // ── the landmark search (RR p.285 ¶3): a specific-POI Wilderness Search; success recovers ──
  W = mkEvadeWorld(true);
  ACKS.encounterAttemptEvasion(W.c, 'enc-e8', { rng: () => 0.10 });
  W.trav.proficiencies = ['Tracking'];                              // +4 on the search throw
  const den = ACKS.createLair(W.c, { hexId: 'hex-e', monsterCatalogKey: 'orc', status: 'active', name: 'Hidden den' });
  den.knownToPlayers = false;
  let ls = ACKS.hexSearchActivity(W.c, { actorCharacterId: W.trav.id, landmarkJourneyId: 'jrn-e8', rng: seq(0.25, 0.5) });
  ok('a failed landmark hour leaves the party lost (d20 6 +4 −4 = 6)', ls.ok && ls.success === false
    && ls.landmarkFound === false && W.j.status === 'lost' && ls.event.payload.method === 'landmark-search');
  ls = ACKS.hexSearchActivity(W.c, { actorCharacterId: W.trav.id, landmarkJourneyId: 'jrn-e8', rng: seq(0.99, 0.5) });
  ok('a successful landmark hour recovers the journey (the −4 specific applies; no lair is found)',
    ls.success === true && ls.landmarkFound === true && ls.found === null && ls.event.payload.mod === -4
    && W.j.status === 'in-transit' && W.j.lostEncounterId === null);
  ok('…the journey history records the recovery', (W.j.history || []).some(h => h.type === 'recovered'));
  ok('…the hour charged 1 ancillary (the search-hour cost)', ls.event.payload.activityCost
    && ls.event.payload.activityCost.slot === 'ancillary' && ls.event.payload.activityCost.units === 1);
  // the reroll flips both ways, surgically
  let rr = ACKS.rerollHexSearch(W.c, ls.event.id, { rng: () => 0 });
  ok('reroll success→fail re-loses the journey (the original encounter restored)', rr.ok && rr.success === false
    && W.j.status === 'lost' && W.j.lostEncounterId === 'enc-e8');
  rr = ACKS.rerollHexSearch(W.c, ls.event.id, { rng: () => 0.99 });
  ok('reroll fail→success recovers it again', rr.success === true && rr.landmarkFound === true
    && W.j.status === 'in-transit' && W.j.lostEncounterId === null);

  // ── a re-route also re-orients a knowingly-lost party (the GM's "we push on" lever) ──
  W = mkEvadeWorld(true);
  ACKS.encounterAttemptEvasion(W.c, 'enc-e8', { rng: () => 0.10 });
  ok('(pre) the journey is lost', W.j.status === 'lost');
  ACKS.reRouteJourney(W.c, 'jrn-e8', { destinationHexId: 'hex-f' });
  ok('reRouteJourney clears the known-lost state', W.j.status === 'in-transit' && W.j.lostEncounterId === null);

  // ── E3c interplay: a canTrack band's pursuit fork AND the nav throw both apply ──
  W = mkEvadeWorld(true);
  W.enc.monsterSide.monsterCatalogKey = 'common-wolf';             // canTrack
  ACKS.encounterAttemptEvasion(W.c, 'enc-e8', { rng: () => 0.10 });
  ok('pursuit offered AND the nav verdict rolled on the same success', W.enc.phase === 'pursuit'
    && W.enc.pursuit && W.enc.evasion.aftermath.navThrow && W.j.status === 'lost');
}

// =============================================================================
section('E9 — maximum lairs per hex (JJ p.69): the capacity read');
{
  ok('LAIR_CAP_PCT_BY_TERRITORY registered (civilized 33% / borderlands 50% / outlands 66% / unsettled 100%)', (() => {
    const P = ACKS.LAIR_CAP_PCT_BY_TERRITORY;
    return !!P && P.civilized === 0.33 && P.borderlands === 0.50 && P.outlands === 0.66 && P.unsettled === 1.0;
  })());
  ok('lairDiceMax: 1d4+1 → 5 · 2d8 → 16 · 1d3−1 → 2 · zero/none → 0',
    ACKS.lairDiceMax({ n: 1, d: 4, mod: 1 }) === 5 && ACKS.lairDiceMax({ n: 2, d: 8, mod: 0 }) === 16
    && ACKS.lairDiceMax({ n: 1, d: 3, mod: -1 }) === 2 && ACKS.lairDiceMax({ n: 0, d: 0, mod: 0 }) === 0
    && ACKS.lairDiceMax(null) === 0);

  const c = ACKS.blankCampaign({ name: 'E9 cap' });
  ACKS.migrateCampaign(c);
  c.domains = [{ id: 'dom-c', name: 'Capland', classification: 'Civilized' }];
  c.hexes = [
    Object.assign(ACKS.blankHex({ id: 'hx-grass' }),  { coord: { q: 0, r: 0 }, terrain: 'grassland', domainId: 'dom-c' }),
    Object.assign(ACKS.blankHex({ id: 'hx-mtn' }),    { coord: { q: 1, r: 0 }, terrain: 'mountains', terrainSubtype: 'rocky' }),
    Object.assign(ACKS.blankHex({ id: 'hx-jungle' }), { coord: { q: 2, r: 0 }, terrain: 'jungle' }),
    Object.assign(ACKS.blankHex({ id: 'hx-water' }),  { coord: { q: 3, r: 0 }, terrain: 'water' }),
    Object.assign(ACKS.blankHex({ id: 'hx-weird' }),  { coord: { q: 4, r: 0 }, terrain: 'crystal-wastes' })
  ];
  const cap = id => ACKS.hexLairCapacity(c, id);
  ok('civilized grassland: 33% of the 1d3 max 3 reads 1 (🔧 nearest — the printed ⅓ intent, never floor’s 0)', (() => {
    const x = cap('hx-grass'); return !!x && x.max === 1 && x.territoryClass === 'civilized' && x.diceMax === 3 && !x.full;
  })());
  ok('unsettled territory’s ceiling is the dice max itself (mountains-rocky 1d4+1 → 5)', (() => {
    const x = cap('hx-mtn'); return !!x && x.max === 5 && x.territoryClass === 'unsettled' && x.pct === 1;
  })());
  ok('borderlands halve it (round .5 up: 5 → 3)', (() => {
    c.domains[0].classification = 'Borderlands'; c.hexes[1].domainId = 'dom-c';
    const x = cap('hx-mtn'); c.hexes[1].domainId = null; c.domains[0].classification = 'Civilized';
    return !!x && x.max === 3 && x.territoryClass === 'borderlands';
  })());
  ok('outlands jungle: 66% of the 2d8 max 16 → 11', (() => {
    c.domains[0].classification = 'Outlands'; c.hexes[2].domainId = 'dom-c';
    const x = cap('hx-jungle'); c.hexes[2].domainId = null; c.domains[0].classification = 'Civilized';
    return !!x && x.max === 11;
  })());
  ok('water: zero dice → max 0, full at once (v1 — no land lairs in open ocean)', (() => {
    const x = cap('hx-water'); return !!x && x.max === 0 && x.full === true;
  })());
  ok('unknown terrain → null (no cap defined — nothing gates)', cap('hx-weird') === null);

  // The count is LIVING dens only (active + unknown shells); cleared / abandoned structures
  // are vacant real estate and never crowd a hex.
  ACKS.createLair(c, { hexId: 'hx-mtn', status: 'active', name: 'A' });
  ACKS.createLair(c, { hexId: 'hx-mtn', status: 'unknown', name: 'B' });
  const dead = ACKS.createLair(c, { hexId: 'hx-mtn', status: 'active', name: 'C' });
  ACKS.clearLair(c, dead.id);
  const gone = ACKS.createLair(c, { hexId: 'hx-mtn', status: 'active', name: 'D' });
  ACKS.abandonLair(c, gone.id);
  ok('living dens count (active + unknown); cleared + abandoned do not', (() => {
    const x = cap('hx-mtn'); return !!x && x.count === 2 && x.max === 5 && !x.full;
  })());
}

section('E9 — settling monsters respect the cap: E3a refuses hex-full; vacancy re-opens it; the Judge stays exempt');
{
  const c = ACKS.blankCampaign({ name: 'E9 settle gate' });
  ACKS.migrateCampaign(c);
  c.domains = [{ id: 'dom-c', name: 'Capland', classification: 'Civilized' }];
  c.hexes = [Object.assign(ACKS.blankHex({ id: 'hx-full' }), { coord: { q: 0, r: 0 }, terrain: 'grassland', domainId: 'dom-c' })];  // civ grassland: max 1
  const blocker = ACKS.createLair(c, { hexId: 'hx-full', status: 'active', name: 'The One Den' });
  const face = ACKS.blankCharacter({ name: 'Scout' }); face.abilities = { STR: 9, INT: 9, WIL: 9, DEX: 9, CON: 9, CHA: 9 };
  c.characters.push(face);
  const e = ACKS.createEncounter(c, { trigger: 'gm-authored', hexId: 'hx-full', category: 'monster',
    partySide: { characterIds: [face.id], faceCharacterId: face.id, sizeCount: 1 },
    monsterSide: { monsterCatalogKey: 'orc', count: 4 } });
  const elig = ACKS.encounterSettleEligibility(c, e.id);
  ok('the settle offer refuses hex-full and carries the numbers', elig.eligible === false && elig.reason === 'hex-full'
    && !!elig.capacity && elig.capacity.count === 1 && elig.capacity.max === 1 && elig.capacity.territoryClass === 'civilized');
  ok('propose + confirm both refuse through the same gate',
    ACKS.encounterProposeSettle(c, e.id, { rng: seq(0.1) }).error === 'hex-full'
    && ACKS.encounterSettleAsLair(c, e.id, {}).error === 'hex-full');
  ACKS.clearLair(c, blocker.id);
  ok('clearing the blocking den re-opens the offer (vacant real estate)', ACKS.encounterSettleEligibility(c, e.id).eligible === true);
  // The boundary: the cap governs the world’s own SETTLEMENT — discovery + GM authoring stay
  // ungated (a generated/authored den reveals or decrees what the Judge says is there).
  ACKS.createLair(c, { hexId: 'hx-full', status: 'active', name: 'Refill' });          // back to full (1 of 1)
  const gmLair = ACKS.createLair(c, { hexId: 'hx-full', status: 'active', name: 'Decreed past the cap' });
  const gen = ACKS.generateLair(c, { hexId: 'hx-full', monsterCatalogKey: 'orc' }, seq(0.5));
  ok('createLair + generateLair stay sovereign past the cap (authoring/discovery, not settlement)',
    !!gmLair && !!gen && ACKS.hexLairCapacity(c, 'hx-full').count >= 3);
}

section('E9 — an E6 wander-entry never lingers at a full hex (the entry still counts; the band moves on)');
{
  const mkWorld = () => {
    const c = ACKS.blankCampaign({ name: 'E9 incursion cap' });
    c.houseRules = {};
    for(let q = 0; q < 8; q++) for(let r = 0; r < 3; r++)
      c.hexes.push(Object.assign(ACKS.blankHex({}), { id: 'hex-' + q + '-' + r, coord: { q, r }, terrain: 'grassland' }, q >= 3 ? { domainId: 'dom-east' } : null));
    c.domains = [{ id: 'dom-east', name: 'Eastmarch', classification: 'Civilized' }];   // civ grassland: cap 1/hex
    return c;
  };
  // Fill the whole border column so whichever hex the band crosses into is at its cap.
  let c = mkWorld();
  ['hex-3-0', 'hex-3-1', 'hex-3-2'].forEach(id => ACKS.createLair(c, { hexId: id, status: 'active', name: 'Den ' + id }));
  let g = ACKS.blankGroup({ name: 'Wolves', groupTemplate: { monsterCatalogKey: 'common-wolf', creatureTypes: ['animal'], hitDice: '2+2' }, count: 4, currentHexId: 'hex-2-1' });
  c.groups.push(g);
  // The same forced tape that LINGERED in the E6 test — at a full hex the linger roll is never taken.
  let res = ACKS.proposeMonsterBandDay(c, { dayInMonth: 2, rng: seq(0.0, 0.001, 0.001, 0.9, 0.9, 0.9) });
  let rec = res.pendingRecords[0];
  ok('the entry still counts as the day’s occurrence, but NO linger roll is taken (too crowded)',
    !!rec && rec.domainEntries.length >= 1 && rec.domainEntries[0].occurrence === true
    && rec.domainEntries[0].hexFull === true && rec.domainEntries[0].lingerRoll === null
    && rec.domainEntries[0].lingers === false && !!rec.domainEntries[0].lairCap && rec.domainEntries[0].lairCap.max === 1);
  ok('the band moves on instead of settling', rec.outcome === 'moving' && !rec.settle);
  ok('the day label names the crowding', /lair cap/.test(rec.label));
  const lairsBefore = c.lairs.length;
  ACKS.commitMonsterBandRecord(c, rec);
  ok('commit: no den founded; the band keeps wandering', c.lairs.length === lairsBefore && g.wanderState !== null);
  ok('the Group history names the cap on the incursion line',
    (g.history || []).some(h => h && h.type === 'incursion' && /lair cap/.test(h.reason)));

  // The commit re-check: a ratified settle whose hex FILLED between propose and commit (a second
  // band denned it the same day, or the GM authored one) skips — the band moves on.
  c = mkWorld();
  g = ACKS.blankGroup({ name: 'Wolves', groupTemplate: { monsterCatalogKey: 'common-wolf', creatureTypes: ['animal'], hitDice: '2+2' }, count: 4, currentHexId: 'hex-2-1' });
  c.groups.push(g);
  res = ACKS.proposeMonsterBandDay(c, { dayInMonth: 2, rng: seq(0.0, 0.001, 0.001, 0.9, 0.9, 0.9) });
  rec = res.pendingRecords[0];
  ok('(pre) the tape lingers when the hex has room', !!rec && rec.outcome === 'settled' && !!rec.settle);
  ACKS.createLair(c, { hexId: rec.settle.hexId, status: 'active', name: 'Beat them to it' });   // fills it (1 of 1)
  const lairsB4 = c.lairs.length;
  ACKS.commitMonsterBandRecord(c, rec);
  ok('commit re-checks the cap: the den is NOT founded — the band moves on', c.lairs.length === lairsB4
    && (g.history || []).some(h => h && h.type === 'wander' && /lair cap/.test(h.reason))
    && g.wanderState !== null);
}

// =============================================================================
section('E10 — domain-morale banditry (RR pp.350–351): the monthly materialization');
{
  const rule = (ACKS.HOUSERULES_REGISTRY || []).find(r => r && r.id === 'domain-morale-banditry');
  ok('domain-morale-banditry registered (category encounters, default ON, RR pp.350–351 cited)',
    !!rule && rule.category === 'encounters' && rule.default === true && /350/.test(rule.source || ''));
  ok('the event kind domain-banditry is known + Event-Wizard opted out',
    ACKS.isEventKindKnown('domain-banditry') && !ACKS.wizardEmittableKinds().includes('domain-banditry'));
  ok('blankGroup emits banditryDomainId (lazy null)', ACKS.blankGroup().banditryDomainId === null);

  const mkB = () => {
    const c = ACKS.blankCampaign({ name: 'E10 banditry' });
    ACKS.migrateCampaign(c);
    c.domains = [{ id: 'dom-b', name: 'Marchland',
      demographics: { peasantFamilies: 1000, morale: 0 },
      expenses: { tithePaid: true, liturgyPerFamily: 1 }, taxPolicy: {} }];
    c.hexes = [];
    const hx = (id, q, r, dom) => c.hexes.push(Object.assign(ACKS.blankHex({ id }), { coord: { q, r }, terrain: 'grassland', domainId: dom || null }));
    hx('hx-a', 0, 0, 'dom-b'); hx('hx-b', 1, 0, 'dom-b'); hx('hx-c', 0, 1, 'dom-b'); hx('hx-d', 1, 1, 'dom-b');
    hx('hx-w1', 2, 0); hx('hx-w2', -1, 0); hx('hx-w3', 0, -1); hx('hx-w4', 2, 1); hx('hx-w5', 0, 2);
    hx('hx-w6', 1, -1); hx('hx-w7', -1, 1); hx('hx-w8', -1, 2); hx('hx-w9', 1, 2); hx('hx-w10', 2, -1);
    c.currentTurn = 5;
    return c;
  };
  const sumOf = (c) => ACKS.banditryBandsForDomain(c, 'dom-b').reduce((s, g) => s + Math.max(0, (g.count || 0) - (g.casualties || 0)), 0);
  const banditryEvents = (c) => (c.eventLog || []).filter(e => e && e.event && e.event.kind === 'domain-banditry');

  // Healthy domain — nothing happens.
  let c = mkB();
  let r = ACKS.processBanditryForTurn(c, { rng: seq(0.5) });
  ok('rule resolves ON via the registry default (nothing stored)', r.ruleOn === true);
  ok('a healthy domain (morale 0) raises nothing — no bands, no counter, no events',
    ACKS.banditryBandsForDomain(c, 'dom-b').length === 0 && (c.domains[0].banditryOccupationMonths || 0) === 0 && banditryEvents(c).length === 0);

  // The RAW counts (RR p.350).
  c.domains[0].demographics.morale = -2;
  ok('banditCount: −2 → 1 per 5 families (1000 → 200)', ACKS.banditCount(c.domains[0]) === 200);
  c.domains[0].demographics.morale = -3;
  ok('banditCount: −3 → 1 per 2 (500)', ACKS.banditCount(c.domains[0]) === 500);
  c.domains[0].demographics.morale = -4;
  ok('banditCount: −4 → every able-bodied man (1000)', ACKS.banditCount(c.domains[0]) === 1000);

  // Month 1 — the rise.
  c.domains[0].demographics.morale = -2;
  r = ACKS.processBanditryForTurn(c, { rng: seq(0.3, 0.7, 0.1, 0.9) });
  let bands = ACKS.banditryBandsForDomain(c, 'dom-b');
  ok('Turbulent rise: 🔧 one band per domain hex (4), summing to the RAW 200',
    bands.length === 4 && sumOf(c) === 200 && bands.every(g => g.count === 50));
  ok('each band is placed on one of the domain’s own hexes, marked + named + historied',
    bands.every(g => g.banditryDomainId === 'dom-b'
      && c.hexes.some(h => h.id === g.currentHexId && h.domainId === 'dom-b')
      && /Bandits of Marchland/.test(g.name)
      && (g.history || []).some(h => h.type === 'banditry')));
  ok('the rise is recorded: one domain-banditry event (action rise) naming the muster', (() => {
    const evs = banditryEvents(c);
    return evs.length === 1 && evs[0].event.payload.action === 'rise' && evs[0].event.payload.target === 200
      && /turned bandit/.test(evs[0].result.narrativeSummary) && (evs[0].event.context || {}).domainId === 'dom-b';
  })());
  ok('the enemy-army occupation counter starts (month 1)', c.domains[0].banditryOccupationMonths === 1);

  // Month 2 — unchanged plague: no new event, the counter builds.
  r = ACKS.processBanditryForTurn(c, { rng: seq(0.5) });
  ok('a no-change plague month records nothing but the occupation builds (month 2)',
    banditryEvents(c).length === 1 && c.domains[0].banditryOccupationMonths === 2 && sumOf(c) === 200);

  // Month 3 — morale worsens: the SAME band set swells.
  const idsBefore = bands.map(g => g.id).sort().join(',');
  c.domains[0].demographics.morale = -3;
  r = ACKS.processBanditryForTurn(c, { rng: seq(0.5) });
  bands = ACKS.banditryBandsForDomain(c, 'dom-b');
  ok('Defiant swell: the same 4 bands resize to 500 (no new groups)',
    bands.map(g => g.id).sort().join(',') === idsBefore && sumOf(c) === 500
    && banditryEvents(c).some(e => e.event.payload.action === 'swell'));

  // Month 4 — casualties settle as population loss (RR p.351).
  bands[0].casualties = 30;
  r = ACKS.processBanditryForTurn(c, { rng: seq(0.5) });
  ok('killed bandits are the domain’s own men: 30 casualties → 970 families, casualties zeroed',
    c.domains[0].demographics.peasantFamilies === 970
    && ACKS.banditryBandsForDomain(c, 'dom-b').every(g => (g.casualties || 0) === 0));
  ok('…and the target re-derives off the post-settlement books (floor(970/2) = 485)',
    sumOf(c) === 485 && banditryEvents(c).some(e => e.event.payload.killed === 30 && /loses 30 families/.test(e.result.narrativeSummary)));

  // A wholly-wiped band is gone; the muster re-covers the target without it.
  bands = ACKS.banditryBandsForDomain(c, 'dom-b');
  const wipedId = bands[1].id;
  bands[1].casualties = bands[1].count;
  r = ACKS.processBanditryForTurn(c, { rng: seq(0.5) });
  ok('a wholly-wiped band disbands (its dead reduce the population); the survivors re-cover the target', (() => {
    const now = ACKS.banditryBandsForDomain(c, 'dom-b');
    return !now.some(g => g.id === wipedId) && now.length === 3 && sumOf(c) === ACKS.banditCount(c.domains[0]);
  })());

  // The occupation morale modifier (RR p.349 "0, then −1 per month" — RR p.351 ties it to bandits).
  ok('moraleModifiersFor reads the occupation: month 1 shows the row at 0; month N at −(N−1)', (() => {
    const d2 = { id: 'dom-occ', name: 'Occland', banditryOccupationMonths: 1,
      demographics: { peasantFamilies: 100, morale: -2 }, expenses: { tithePaid: true, liturgyPerFamily: 1 }, taxPolicy: {} };
    const cc = mkB(); cc.domains.push(d2);
    const row1 = ACKS.moraleModifiersFor(cc, d2).find(m => /occupation/.test(m.label));
    d2.banditryOccupationMonths = 4;
    const row4 = ACKS.moraleModifiersFor(cc, d2).find(m => /occupation/.test(m.label));
    d2.banditryOccupationMonths = 0;
    const row0 = ACKS.moraleModifiersFor(cc, d2).find(m => /occupation/.test(m.label));
    return !!row1 && row1.value === 0 && !!row4 && row4.value === -3 && !row0;
  })());

  // Recovery — the men return to their fields WITHOUT population loss.
  const famBefore = c.domains[0].demographics.peasantFamilies;
  c.domains[0].demographics.morale = -1;
  r = ACKS.processBanditryForTurn(c, { rng: seq(0.5) });
  ok('morale at −1 disbands every band — population untouched, the occupation counter resets',
    ACKS.banditryBandsForDomain(c, 'dom-b').length === 0
    && c.domains[0].demographics.peasantFamilies === famBefore
    && c.domains[0].banditryOccupationMonths === 0
    && banditryEvents(c).some(e => e.event.payload.action === 'disbanded' && /return to their fields/.test(e.result.narrativeSummary)));

  // Rule OFF — no muster; already-risen bands stay as world entities (the founded-dens precedent).
  c = mkB();
  c.domains[0].demographics.morale = -3;
  ACKS.processBanditryForTurn(c, { rng: seq(0.5) });
  ok('(pre) the plague is live', ACKS.banditryBandsForDomain(c, 'dom-b').length > 0);
  c.houseRules['domain-morale-banditry'] = { enabled: false };
  const frozen = ACKS.banditryBandsForDomain(c, 'dom-b').length;
  c.domains[0].demographics.morale = -1;   // would disband if the rule ran
  r = ACKS.processBanditryForTurn(c, { rng: seq(0.5) });
  ok('an explicit untick stops the reconcile — existing bands freeze in place (no disband, no muster)',
    r.ruleOn === false && ACKS.banditryBandsForDomain(c, 'dom-b').length === frozen);
  ok('…and the occupation row hides while the rule is off (principle 8)', (() => {
    c.domains[0].banditryOccupationMonths = 3;
    const row = ACKS.moraleModifiersFor(c, c.domains[0]).find(m => /occupation/.test(m.label));
    delete c.houseRules['domain-morale-banditry'];
    const rowOn = ACKS.moraleModifiersFor(c, c.domains[0]).find(m => /occupation/.test(m.label));
    return !row && !!rowOn && rowOn.value === -2;
  })());
}

// =============================================================================
section('E10 — banditry bands in the world: the fenced wander + the encounter layer');
{
  const mkB = () => {
    const c = ACKS.blankCampaign({ name: 'E10 world' });
    ACKS.migrateCampaign(c);
    c.domains = [{ id: 'dom-b', name: 'Marchland',
      demographics: { peasantFamilies: 1000, morale: -2 },
      expenses: { tithePaid: true, liturgyPerFamily: 1 }, taxPolicy: {} }];
    c.hexes = [];
    const hx = (id, q, r, dom) => c.hexes.push(Object.assign(ACKS.blankHex({ id }), { coord: { q, r }, terrain: 'grassland', domainId: dom || null }));
    hx('hx-a', 0, 0, 'dom-b'); hx('hx-b', 1, 0, 'dom-b'); hx('hx-c', 0, 1, 'dom-b'); hx('hx-d', 1, 1, 'dom-b');
    hx('hx-w1', 2, 0); hx('hx-w2', -1, 0); hx('hx-w3', 0, -1); hx('hx-w4', 2, 1); hx('hx-w5', 0, 2);
    hx('hx-w6', 1, -1); hx('hx-w7', -1, 1); hx('hx-w8', -1, 2); hx('hx-w9', 1, 2); hx('hx-w10', 2, -1);
    c.currentTurn = 5;
    ACKS.processBanditryForTurn(c, { rng: seq(0.3, 0.7, 0.1, 0.9) });
    return c;
  };

  let c = mkB();
  const rows = ACKS.looseMonsterBands(c).filter(b => b.kind === 'banditry');
  ok('banditry bands row on the loose roster as their own kind, carrying the domain',
    rows.length === 4 && rows.every(b => b.banditryDomainId === 'dom-b' && b.banditryDomainName === 'Marchland' && b.count === 50 && b.monsterKey === 'bandit'));

  // The 6a abroad verdict binds the band as itself (E4m extended).
  const bandHex = rows[0].hexId;
  const banditIdent = { key: 'bandit', label: 'Man, Bandit' };
  let b = ACKS.bindEncounterIdentity(c, bandHex, banditIdent, { category: 'monster', rng: seq(0.99, 0.0), partySide: { characterIds: ['chr-x'] } });
  ok('an abroad bandit draw at the band’s hex binds the banditry band', b.mode === 'loose-band' && b.bandKind === 'banditry' && b.count === 50);
  const side = { source: 'fresh', lairId: null, groupIds: [], monsterCatalogKey: '', count: null, encounterKind: null, label: '', identity: null, binding: null, minted: null, pursuitEncounterId: null };
  ACKS._applyIdentityBinding(c, side, banditIdent, b, { hexId: bandHex });
  ok('the side carries source banditry-band + the plagued domain + the Group, nothing minted',
    side.source === 'banditry-band' && side.banditryDomainId === 'dom-b'
    && side.groupIds.length === 1 && side.count === 50 && side.minted === null && side.lairId === null);
  const draw = { hexId: bandHex, territoryClass: 'borderlands', columnKey: 'borderlands', category: 'monster', rarity: 'common',
                 identity: 'table', identityRoll: banditIdent, binding: b, proposal: null };
  const met = ACKS.createEncounterFromDraw(c, draw, { trigger: 'journey-travel', partySide: { characterIds: ['chr-x'], sizeCount: 1 } });
  ok('createEncounterFromDraw rides the banditry verdict verbatim', !!met && met.monsterSide.source === 'banditry-band' && met.monsterSide.banditryDomainId === 'dom-b');
  ok('the settle offer refuses a banditry band — the men melt back to their fields, they never den',
    ACKS.encounterSettleEligibility(c, met.id).reason === 'banditry-band');
  ok('…and the group-pointer alone refuses too (an Inspector-authored side without the source tag)', (() => {
    const g = ACKS.banditryBandsForDomain(c, 'dom-b')[0];
    c.encounters.push(ACKS.blankEncounter({ id: 'enc-raw-side', hexId: bandHex, status: 'active',
      monsterSide: { monsterCatalogKey: 'bandit', label: 'Bandits', count: 10, encounterKind: 'wandering', groupIds: [g.id] } }));
    return ACKS.encounterSettleEligibility(c, 'enc-raw-side').reason === 'banditry-band';
  })());

  // The fenced wander: many proposed days, every walked coord stays on the domain's hexes,
  // and a banditry band never takes the domain-entry disposition (it IS the domain's own).
  c = mkB();
  const inDomain = co => c.hexes.some(h => h.coord.q === co.q && h.coord.r === co.r && h.domainId === 'dom-b');
  let allFenced = true, anyMoved = false, anyEntries = false;
  for(let day = 2; day <= 7; day++){
    const res = ACKS.proposeMonsterBandDay(c, { dayInMonth: day, rng: seq(0.13, 0.61, 0.37, 0.83, 0.29, 0.71) });
    const recs = res.pendingRecords.filter(x => /Bandits of Marchland/.test(x.label || ''));
    if(recs.length !== 4) allFenced = false;
    for(const rec of recs){
      if((rec.path || []).length) anyMoved = true;
      if(!(rec.path || []).every(inDomain)) allFenced = false;
      if((rec.domainEntries || []).length) anyEntries = true;
      ACKS.commitMonsterBandRecord(c, rec);
    }
  }
  ok('six committed wander days: every step lands on the domain’s own hexes (the fence)', allFenced && anyMoved);
  ok('…no domain-entry disposition ever fires (no linger roll, no Vagaries occurrence, nothing settles)',
    !anyEntries && (c.lairs || []).length === 0 && ACKS.banditryBandsForDomain(c, 'dom-b').every(g => !g.wanderState || g.wanderState.mode === null));
  ok('the day label flies the colours', (() => {
    const res = ACKS.proposeMonsterBandDay(c, { dayInMonth: 9, rng: seq(0.4) });
    const rec = res.pendingRecords.find(x => /Bandits of Marchland/.test(x.label || ''));
    return !!rec && /🏴/.test(rec.label) && /raids within Marchland|holds its ground in Marchland/.test(rec.label);
  })());

  // A one-hex domain: the fence allows no step — the band holds its ground (no crash).
  ok('a one-hex domain’s band holds its ground (the fence beats the walk)', (() => {
    const c1 = ACKS.blankCampaign({ name: 'E10 one-hex' });
    ACKS.migrateCampaign(c1);
    c1.domains = [{ id: 'dom-1', name: 'Spur', demographics: { peasantFamilies: 100, morale: -2 }, expenses: { tithePaid: true, liturgyPerFamily: 1 }, taxPolicy: {} }];
    c1.hexes = [Object.assign(ACKS.blankHex({ id: 'hx-only' }), { coord: { q: 0, r: 0 }, terrain: 'grassland', domainId: 'dom-1' })];
    c1.currentTurn = 3;
    ACKS.processBanditryForTurn(c1, { rng: seq(0.5) });
    const res = ACKS.proposeMonsterBandDay(c1, { dayInMonth: 2, rng: seq(0.4) });
    const rec = res.pendingRecords.find(x => /Bandits of Spur/.test(x.label || ''));
    if(!rec || !/holds its ground/.test(rec.label) || (rec.path || []).length !== 0) return false;
    ACKS.commitMonsterBandRecord(c1, rec);
    return ACKS.banditryBandsForDomain(c1, 'dom-1')[0].currentHexId === 'hx-only';
  })());

  // The persistence gate: pwm OFF parks all band motion (banditry included) — the static world.
  ok('persistent-wandering-monsters off ⇒ no band motion proposes (banditry included)', (() => {
    c.houseRules['persistent-wandering-monsters'] = { enabled: false };
    const res = ACKS.proposeMonsterBandDay(c, { dayInMonth: 10, rng: seq(0.4) });
    delete c.houseRules['persistent-wandering-monsters'];
    return res.pendingRecords.length === 0;
  })());
}

// =============================================================================
console.log('\n— Summary');
console.log('  Passed: ' + pass);
console.log('  Failed: ' + fail);
if (fail) { console.log('\nFAILURES:'); failures.forEach(f => console.log('  ' + f)); process.exit(1); }
console.log('\nAll Encounter layer (#476 E1) smoke checks passed.');
