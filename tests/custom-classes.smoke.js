// =============================================================================
// custom-classes.smoke.js — Custom Classes & Races W1 (data layer + derivation). #154.
// Phase_6_Custom_Classes_Plan.md §5 (W1). RAW: Custom_Classes_RAW_Survey.md.
// Covers: the ccl-/crc- prefixes; the five core category XP tables (JJ pp.290–296);
// THE ORACLE — deriveClassFromTemplate reproduces all 19 RAW seed 2nd-level XP costs
// EXACT (the Ready-For-Play Class Builds table, JJ p.330); coreClassMapping for all 19
// (incl. the explorer/venturer hybrids + Assassin/Bard → fighter); saveProgression incl.
// the Arcane→Divine→Fighting→Thievery tie-break; the 5 race costings (Elf4/Dwarf4/Halfling0);
// blankClassTemplate/blankRaceTemplate + createCustomClass/createCustomRace (init-on-write)
// + JSON round-trip; seedCustomContent idempotency; the lookups; the full derived block +
// the proficiency-list-size / hp-after-9th / prime-requisites derivations; the xpTable shape
// (L1/L2 locked — the per-level table is W2); the registry kinds + the schema⊆factory +
// displayName invariants; the importer wiring (§8.9 mandate, read from index.html); the
// custom-power-compendium gate; AND the load-bearing W1 guard — a custom-content-less
// campaign STAYS so through migrateCampaign (no migrate injector → templates stay no-ops).
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

// =============================================================================
section('ID prefixes (ccl- / crc-)');
// =============================================================================
ok('ID_PREFIXES.customClass === "ccl"', ACKS.ID_PREFIXES.customClass === 'ccl');
ok('ID_PREFIXES.customRace === "crc"', ACKS.ID_PREFIXES.customRace === 'crc');

// =============================================================================
section('Build-point category XP tables (JJ pp.290–296)');
// =============================================================================
ok('HD_VALUE_TABLE: 0→d4/0xp, 2→d8/1000, 4→d12/2000',
  ACKS.HD_VALUE_TABLE[0].hitDie === 'd4' && ACKS.HD_VALUE_TABLE[0].xpCost === 0 &&
  ACKS.HD_VALUE_TABLE[2].hitDie === 'd8' && ACKS.HD_VALUE_TABLE[2].xpCost === 1000 &&
  ACKS.HD_VALUE_TABLE[4].hitDie === 'd12' && ACKS.HD_VALUE_TABLE[4].mortalWoundsMod === 8 && ACKS.HD_VALUE_TABLE[4].xpCost === 2000);
ok('FIGHTING 1a/1b both 500 XP; 2→1000, 4→2000',
  ACKS.FIGHTING_VALUE_TABLE['1a'].xpCost === 500 && ACKS.FIGHTING_VALUE_TABLE['1b'].xpCost === 500 &&
  ACKS.FIGHTING_VALUE_TABLE['2'].xpCost === 1000 && ACKS.FIGHTING_VALUE_TABLE['4'].xpCost === 2000);
ok('FIGHTING 1a = narrow/heavy, 1b = broad/light',
  ACKS.FIGHTING_VALUE_TABLE['1a'].weaponSelection === 'Narrow' && ACKS.FIGHTING_VALUE_TABLE['1a'].armorProf === 'Heavy' &&
  ACKS.FIGHTING_VALUE_TABLE['1b'].weaponSelection === 'Broad' && ACKS.FIGHTING_VALUE_TABLE['1b'].armorProf === 'Light');
ok('THIEVERY 3→750 (12 skills); DIVINE 4→2000; ARCANE 4→2500',
  ACKS.THIEVERY_VALUE_TABLE[3].xpCost === 750 && ACKS.THIEVERY_VALUE_TABLE[3].thiefSkillCount === 12 &&
  ACKS.DIVINE_VALUE_TABLE[4].xpCost === 2000 && ACKS.ARCANE_VALUE_TABLE[4].xpCost === 2500);
ok('ARCANE 1→625, 2→1250, 3→1875 (the asymmetric arcane ladder)',
  ACKS.ARCANE_VALUE_TABLE[1].xpCost === 625 && ACKS.ARCANE_VALUE_TABLE[2].xpCost === 1250 && ACKS.ARCANE_VALUE_TABLE[3].xpCost === 1875);
// the OPEN category registry (survey §4.6 / O3): 5 core categories, each with its save-prime mapping
ok('CLASS_CATEGORIES holds the 5 core categories', ['hd','fighting','thievery','divine','arcane'].every(k => ACKS.CLASS_CATEGORIES[k] && ACKS.CLASS_CATEGORIES[k].isCore));
ok('category→save-prime: fighting=fighter, thievery=thief, divine=crusader, arcane=mage',
  ACKS.CLASS_CATEGORIES.fighting.savePrimeClass === 'fighter' && ACKS.CLASS_CATEGORIES.thievery.savePrimeClass === 'thief' &&
  ACKS.CLASS_CATEGORIES.divine.savePrimeClass === 'crusader' && ACKS.CLASS_CATEGORIES.arcane.savePrimeClass === 'mage');

// =============================================================================
section('THE ORACLE — all 19 RAW seed 2nd-level XP costs derive EXACT (JJ p.330)');
// =============================================================================
// build the seed ENTITIES (the validation oracle); each seed row carries its RAW xp.
const seedEntities = ACKS.seedClassTemplates();
ok('seedClassTemplates() returns 19', seedEntities.length === 19);
ok('CUSTOM_CLASS_SEEDS frozen + keyed', Object.isFrozen(ACKS.CUSTOM_CLASS_SEEDS) && Object.isFrozen(ACKS.CUSTOM_CLASS_SEEDS[0]));
ACKS.CUSTOM_CLASS_SEEDS.forEach((s, i) => {
  const t = seedEntities[i];
  const race = s.raceKey ? ACKS.raceForClassTemplate({}, t) : null;   // {} → falls back to the seed RaceTemplate constant
  const xp = ACKS.customClassSecondLevelXp(t, race);
  ok('XP exact: ' + s.key + ' = ' + s.xp, xp === s.xp, 'derived ' + xp);
});
// spot-check the trade-off-bearing classes carry the +250/+750 penalty (folded in W1, validated W2)
ok('Bard +250 weapon trade-off folded (1500 base + 250)', ACKS.customClassSecondLevelXp(seedEntities.find((_,i)=>ACKS.CUSTOM_CLASS_SEEDS[i].key==='bard')) === 1750);
ok('Paladin +750 weapon trade-off folded (3 powers × 250)', ACKS.customClassSecondLevelXp(seedEntities.find((_,i)=>ACKS.CUSTOM_CLASS_SEEDS[i].key==='paladin')) === 2750);

// =============================================================================
section('coreClassMapping — correct for all 19 (incl. the explorer/venturer hybrids)');
// =============================================================================
const EXPECT_CCM = {
  fighter:'fighter', mage:'mage', thief:'thief', assassin:'fighter', bard:'fighter',
  bladedancer:'crusader', crusader:'crusader', explorer:'explorer', paladin:'fighter',
  priestess:'crusader', venturer:'venturer', witch:'crusader', warlock:'mage',
  'dwarven-vaultguard':'fighter', 'dwarven-craftpriest':'crusader', 'elven-spellsword':'fighter',
  'elven-nightblade':'thief', 'nobiran-wonderworker':'mage', 'zaharan-ruinguard':'fighter'
};
ACKS.CUSTOM_CLASS_SEEDS.forEach((s, i) => {
  ok('coreClassMapping ' + s.key + ' = ' + EXPECT_CCM[s.key], ACKS.customClassCoreClassMapping(seedEntities[i]) === EXPECT_CCM[s.key], 'got ' + ACKS.customClassCoreClassMapping(seedEntities[i]));
});
// Assassin + Explorer share build points (HD1 F2 T1) — the override is what distinguishes them (the stored-wins answer)
const assassin = seedEntities[ACKS.CUSTOM_CLASS_SEEDS.findIndex(s=>s.key==='assassin')];
const explorer = seedEntities[ACKS.CUSTOM_CLASS_SEEDS.findIndex(s=>s.key==='explorer')];
ok('Assassin + Explorer have identical build points', JSON.stringify(assassin.buildPoints) === JSON.stringify(explorer.buildPoints));
ok('…but map differently (fighter vs explorer) via the override', ACKS.customClassCoreClassMapping(assassin) === 'fighter' && ACKS.customClassCoreClassMapping(explorer) === 'explorer');
ok('suggestCoreClassMapping(explorer) is the build-derived save core (fighter) before the override', ACKS.suggestCoreClassMapping(explorer) === 'fighter');

// =============================================================================
section('saveProgression — incl. the Arcane→Divine→Fighting→Thievery tie-break');
// =============================================================================
const EXPECT_SAVE = {
  fighter:'fighter', mage:'mage', thief:'thief', assassin:'fighter', bard:'fighter',
  bladedancer:'crusader', priestess:'crusader', venturer:'thief', warlock:'mage',
  'elven-spellsword':'fighter', 'elven-nightblade':'thief', 'nobiran-wonderworker':'mage'
};
Object.keys(EXPECT_SAVE).forEach(key => {
  const t = seedEntities[ACKS.CUSTOM_CLASS_SEEDS.findIndex(s=>s.key===key)];
  ok('saveProgression ' + key + ' = ' + EXPECT_SAVE[key], ACKS.customClassSaveProgression(t) === EXPECT_SAVE[key]);
});
// Bard (F2 T2 tie) → fighting wins over thievery (tie-break)
ok('Bard F2=T2 tie → fighter (Fighting beats Thievery)', ACKS.customClassSaveProgression(seedEntities[ACKS.CUSTOM_CLASS_SEEDS.findIndex(s=>s.key==='bard')]) === 'fighter');
// a synthetic Arcane=Divine tie → arcane wins (mage)
const tieAD = ACKS.blankClassTemplate({ buildPoints: { hd:0, fighting:0, thievery:0, divine:2, arcane:2 } });
ok('synthetic Arcane=Divine=2 tie → mage (arcane wins)', ACKS.customClassSaveProgression(tieAD) === 'mage');
// Elven Spellsword: Elf3 stacks arcane for SPELLS but the SAVE comparison uses base categories (F2 > A1) → fighter
ok('Elven Spellsword save = fighter (racial stacking does not affect the save category comparison)',
  ACKS.customClassSaveProgression(seedEntities[ACKS.CUSTOM_CLASS_SEEDS.findIndex(s=>s.key==='elven-spellsword')]) === 'fighter');

// =============================================================================
section('Race seeds + the 5 race costings (Elf4/Dwarf4/Halfling0 — survey §6)');
// =============================================================================
ok('seedRaceTemplates() returns 5', ACKS.seedRaceTemplates().length === 5);
ok('CUSTOM_RACE_SEEDS has dwarf/elf/halfling/nobiran/zaharan', ['dwarf','elf','halfling','nobiran','zaharan'].every(k => ACKS.CUSTOM_RACE_SEEDS.find(r=>r.key===k)));
function raceRung(key, value){ const r = ACKS.CUSTOM_RACE_SEEDS.find(x=>x.key===key); const row = (r.racialValueTable||[]).find(x=>x.value===value); return row ? row.xpCost : undefined; }
ok('Elf 4 = 2,500', raceRung('elf', 4) === 2500);
ok('Dwarf 4 = 1,250', raceRung('dwarf', 4) === 1250);
ok('Halfling 0 = −450 (negative XP)', raceRung('halfling', 0) === -450);
// the seed-used rungs (these make the demi-human class XP exact)
ok('Dwarf 0 = 200 (Vaultguard)', raceRung('dwarf', 0) === 200);
ok('Dwarf 3 = 900 (Craftpriest)', raceRung('dwarf', 3) === 900);
ok('Elf 2 = 1,375 (Nightblade)', raceRung('elf', 2) === 1375);
ok('Elf 3 = 1,875 (Spellsword)', raceRung('elf', 3) === 1875);
ok('Nobiran 2 = 625 (Wonderworker)', raceRung('nobiran', 2) === 625);
ok('Zaharan 1 = 825 (Ruinguard)', raceRung('zaharan', 1) === 825);
// category modifiers (the constraints — informative in W1)
ok('Dwarf forbids Arcane', ACKS.CUSTOM_RACE_SEEDS.find(r=>r.key==='dwarf').categoryModifiers.arcaneForbidden === true);
ok('Elf stacks racial value with Arcane', ACKS.CUSTOM_RACE_SEEDS.find(r=>r.key==='elf').categoryModifiers.racialValueStacksWith === 'arcane');

// =============================================================================
section('blankClassTemplate / blankRaceTemplate — shape + init-on-write + round-trip');
// =============================================================================
const c0 = ACKS.blankClassTemplate({});
const CLASS_FIELDS = ['schemaVersion','id','key','displayName','raceTemplateKey','buildPoints','fightingSubtype','choices','customPowers','customDrawbacks','maxLevel','rarity','isSeed','_derived','history'];
ok('blankClassTemplate emits the full field set', CLASS_FIELDS.every(f => f in c0), 'missing: ' + CLASS_FIELDS.filter(f=>!(f in c0)));
ok('blankClassTemplate id has ccl- prefix', /^ccl-/.test(c0.id));
ok('blankClassTemplate buildPoints = 5 core zeros (no racial key)', JSON.stringify(c0.buildPoints) === JSON.stringify({hd:0,fighting:0,thievery:0,divine:0,arcane:0}));
ok('blankClassTemplate defaults: maxLevel 14, rarity common, _derived null', c0.maxLevel === 14 && c0.rarity === 'common' && c0._derived === null);
ok('blankClassTemplate preserves a racial buildPoints key', ACKS.blankClassTemplate({buildPoints:{hd:2,dwarf:0}}).buildPoints.dwarf === 0);
ok('blankClassTemplate normalizes string customPowers', ACKS.blankClassTemplate({customPowers:['Manual of Arms']}).customPowers[0].name === 'Manual of Arms');
const r0 = ACKS.blankRaceTemplate({});
ok('blankRaceTemplate id has crc- prefix', /^crc-/.test(r0.id));
ok('blankRaceTemplate default hitDiceByCombatantStatus ladder', r0.hitDiceByCombatantStatus.noncombatant === 0.25 && r0.hitDiceByCombatantStatus.fighter === 1);

const camp = ACKS.blankCampaign({ name: 'CC Test' });
ok('blankCampaign has NO customClasses collection (defensive-read model)', !('customClasses' in camp) || !Array.isArray(camp.customClasses));
ok('blankCampaign has NO customRaces collection (defensive-read model)', !('customRaces' in camp) || !Array.isArray(camp.customRaces));
const cc = ACKS.createCustomClass(camp, { key: 'gladiator', displayName: 'Gladiator', buildPoints: { hd:1, fighting:3 } });
ok('createCustomClass returns it + init-on-writes campaign.customClasses', cc && Array.isArray(camp.customClasses) && camp.customClasses.length === 1);
const rr = ACKS.createCustomRace(camp, { key: 'gnome', displayName: 'Gnome' });
ok('createCustomRace init-on-writes campaign.customRaces', Array.isArray(camp.customRaces) && camp.customRaces.length === 1);
// JSON round-trip (the data-layer contract)
const rt = clone(camp);
ok('class template survives a JSON round-trip', JSON.stringify(rt.customClasses[0]) === JSON.stringify(cc));
ok('findCustomClass works on the round-tripped campaign', ACKS.findCustomClass(rt, cc.id).displayName === 'Gladiator');

// =============================================================================
section('seedCustomContent — opt-in installer + idempotency');
// =============================================================================
const sc = ACKS.blankCampaign({ name: 'Seed Test' });
const r1 = ACKS.seedCustomContent(sc);
ok('seedCustomContent installs 19 classes + 5 races', r1.classes === 19 && r1.races === 5);
ok('…into campaign.customClasses/customRaces', sc.customClasses.length === 19 && sc.customRaces.length === 5);
const r2 = ACKS.seedCustomContent(sc);
ok('seedCustomContent is idempotent (second run installs nothing)', r2.classes === 0 && r2.races === 0 && sc.customClasses.length === 19);
// the installed Fighter seed derives its RAW XP through the campaign-aware deriveClass
ok('deriveClass(campaign, fighter-seed) reproduces 2,000', ACKS.deriveClass(sc, ACKS.customClassByKey(sc, 'fighter')).secondLevelXp === 2000);
ok('deriveClass(campaign, dwarven-vaultguard) reproduces 2,200 (resolves the race from the campaign)', ACKS.deriveClass(sc, ACKS.customClassByKey(sc, 'dwarven-vaultguard')).secondLevelXp === 2200);

// =============================================================================
section('Lookups');
// =============================================================================
ok('customClassByKey resolves', ACKS.customClassByKey(sc, 'mage').displayName === 'Mage');
ok('customRaceByKey resolves', ACKS.customRaceByKey(sc, 'elf').displayName === 'Elf');
ok('customClassesUsingRace(dwarf) → the 2 dwarven classes', ACKS.customClassesUsingRace(sc, 'dwarf').length === 2);
ok('raceForClassTemplate resolves the campaign race', ACKS.raceForClassTemplate(sc, ACKS.customClassByKey(sc, 'elven-nightblade')).key === 'elf');
ok('raceForClassTemplate falls back to the seed constant (no campaign)', ACKS.raceForClassTemplate({}, ACKS.customClassByKey(sc, 'dwarven-vaultguard')).key === 'dwarf');
ok('findCustomClass(unknown) → null', ACKS.findCustomClass(sc, 'ccl-nope') === null);

// =============================================================================
section('deriveClassFromTemplate — the full derived stat block');
// =============================================================================
const fighterT = ACKS.customClassByKey(sc, 'fighter');
const dF = ACKS.deriveClassFromTemplate(fighterT, null);
ok('Fighter: hitDie d8 (HD2), attack +2/3 levels (F2)', dF.hitDie === 'd8' && dF.attackProgression === '+2/3 levels');
ok('Fighter: save+core fighter, maxLevel 14, proficiencyListSize 28 (42−14)', dF.saveProgression === 'fighter' && dF.coreClassMapping === 'fighter' && dF.maxLevel === 14 && dF.proficiencyListSize === 28);
ok('Fighter: hpAfter9th 2 (fighter), primeRequisites include STR', dF.hpAfter9th === 2 && dF.primeRequisites.indexOf('STR') >= 0);
ok('Fighter: rarity exposed (Generators seam)', dF.rarity === 'common');
const mageT = ACKS.customClassByKey(sc, 'mage');
const dM = ACKS.deriveClassFromTemplate(mageT, null);
ok('Mage: hitDie d4, save+core mage, hpAfter9th 1, primeRequisites include INT, arcane 100%', dM.hitDie === 'd4' && dM.saveProgression === 'mage' && dM.hpAfter9th === 1 && dM.primeRequisites.indexOf('INT') >= 0 && dM.arcaneSpellPowerPct === 100);
const thiefT = ACKS.customClassByKey(sc, 'thief');
const dT = ACKS.deriveClassFromTemplate(thiefT, null);
ok('Thief: 12 thief skills (T3), DEX prime', dT.thiefSkillCount === 12 && dT.primeRequisites.indexOf('DEX') >= 0);
// the xpTable: L1=0, L2=secondLevelXp (W1 locks only the oracle; the per-level table is W2)
const xt = dF.xpTable;
ok('Fighter xpTable L1=0, L2=2000', xt[0] === 0 && xt[1] === 2000);
ok('Fighter xpTable spans maxLevel (14 entries)', xt.length === 14);
ok('Fighter xpTable monotonic non-decreasing', xt.every((v,i) => i === 0 || v >= xt[i-1]));
// racial maxLevel feeds proficiencyListSize
ok('Dwarven Vaultguard maxLevel 13 → proficiencyListSize 29', ACKS.deriveClass(sc, ACKS.customClassByKey(sc, 'dwarven-vaultguard')).proficiencyListSize === 29);

// =============================================================================
section('Entity registry — custom-class + custom-race kinds');
// =============================================================================
ok('entityKind(custom-class) registered, icon 🛠', ACKS.entityKind('custom-class') && ACKS.entityIcon('custom-class') === '🛠');
ok('entityKind(custom-race) registered, icon 🧬', ACKS.entityKind('custom-race') && ACKS.entityIcon('custom-race') === '🧬');
ok('entityPluralLabel(custom-class) = Class Templates', ACKS.entityPluralLabel('custom-class') === 'Class Templates');
ok('listEntities(custom-class) reads campaign.customClasses', ACKS.listEntities(sc, 'custom-class').length === 19);
ok('findEntity(custom-class) resolves', ACKS.findEntity(sc, 'custom-class', fighterT.id) === fighterT);
ok('entityDisplayName(custom-class) uses displayName', ACKS.entityDisplayName(sc, 'custom-class', fighterT.id) === 'Fighter');
// displayName ⊆ factory keys (the registry⊆factory invariant — reads only displayName/key/id)
const cNoName = ACKS.createCustomClass(sc, { key: 'kk' });
ok('displayName falls back to key when unnamed', ACKS.entityDisplayName(sc, 'custom-class', cNoName.id) === 'kk');
ok('listEntities on a content-less campaign → [] (defensive)', ACKS.listEntities(ACKS.blankCampaign({}), 'custom-class').length === 0);

// =============================================================================
section('Field schemas — schema ⊆ factory (local belt-and-suspenders; also global in smoke.js)');
// =============================================================================
['custom-class', 'custom-race'].forEach(kind => {
  const sch = ACKS.fieldSchemaFor(kind);
  const factoryName = sch.factory;
  ok(kind + ' schema present + names the factory', !!sch && sch.factory === ('blank' + (kind === 'custom-class' ? 'ClassTemplate' : 'RaceTemplate')));
  ok(kind + ' is adminCreate schemaForm', sch.adminCreate === 'schemaForm');
  const keys = new Set(Object.keys(ACKS[factoryName]({})));
  const topExtras = sch.fields.filter(f => f.type !== 'computed').map(f => f.name).filter(n => !keys.has(n));
  ok(kind + ' top-level fields ⊆ ' + factoryName + ' keys', topExtras.length === 0, 'extras: [' + topExtras.join(', ') + ']');
  // object sub-fields ⊆ the nested factory keys
  const blank = ACKS[factoryName]({});
  for(const f of sch.fields.filter(f => f.type === 'object')){
    const nested = blank[f.name];
    if(nested && typeof nested === 'object' && !Array.isArray(nested)){
      const nk = new Set(Object.keys(nested));
      const subExtras = (f.fields || []).filter(s => s.type !== 'computed').map(s => s.name).filter(n => !nk.has(n));
      ok(kind + ' object "' + f.name + '" sub-fields ⊆ factory nested keys', subExtras.length === 0, 'extras: [' + subExtras.join(', ') + ']');
    }
  }
  ok(kind + ' validates clean', ACKS.validateFieldSchema(kind, sch).ok === true, JSON.stringify(ACKS.validateFieldSchema(kind, sch).errors));
});
ok('validateAllSchemas() still reports no errors overall', ACKS.validateAllSchemas().length === 0, ACKS.validateAllSchemas().join(' | '));

// =============================================================================
section('Importer wiring (§8.9 mandate — customClasses + customRaces are importable)');
// =============================================================================
// The importer's SIMPLE_ID_COLLECTIONS is now DERIVED from the §15.5 collection registry
// (index.html: window.ACKS.importableCollections()), so the §8.9 mandate is satisfied by
// registering the collection as importable — no edit to an index.html importer literal.
const indexHtml = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
ok("'customClasses' is registered as an importable collection", ACKS.importableCollections().includes('customClasses'));
ok("'customRaces' is registered as an importable collection", ACKS.importableCollections().includes('customRaces'));
ok('index.html loads acks-engine-custom-classes.js', /acks-engine-custom-classes\.js/.test(indexHtml));

// =============================================================================
section('Custom-power compendium — the default-OFF gate');
// =============================================================================
ok('CUSTOM_POWER_COMPENDIUM is a non-empty frozen list of {name,page}', ACKS.CUSTOM_POWER_COMPENDIUM.length > 0 && ACKS.CUSTOM_POWER_COMPENDIUM.every(p => p.name && p.page) && Object.isFrozen(ACKS.CUSTOM_POWER_COMPENDIUM));
ok('compendium gate OFF (no rule) → [] (default-OFF)', ACKS.customPowerCompendium({}).length === 0);
ok('compendium gate OFF (explicit) → []', ACKS.customPowerCompendium({ houseRules: { 'custom-power-compendium': { enabled: false } } }).length === 0);
ok('compendium gate ON → the list', ACKS.customPowerCompendium({ houseRules: { 'custom-power-compendium': { enabled: true } } }).length === ACKS.CUSTOM_POWER_COMPENDIUM.length);
ok('findCustomPower resolves a known power', ACKS.findCustomPower('Mercantile Network') && /RR p\.43/.test(ACKS.findCustomPower('Mercantile Network').page));
ok('compendium one-liners are TERSE (no transcribed prose — ≤140 chars)', ACKS.CUSTOM_POWER_COMPENDIUM.every(p => !p.summary || p.summary.length <= 140));
// the house rule is registered (drift-lint will want it; default-OFF)
const hr = ACKS.lookupHouseRule('custom-power-compendium');
ok('custom-power-compendium house rule registered, characters, default-OFF', hr && hr.category === 'characters' && hr.default === false);

// =============================================================================
section('THE W1 GUARD — a custom-content-less campaign stays so through migrateCampaign');
// =============================================================================
const mc = ACKS.blankCampaign({ name: 'No Custom Content' });
if(typeof ACKS.migrateCampaign === 'function') ACKS.migrateCampaign(mc);
ok('migrateCampaign does NOT inject customClasses (templates stay migrate-no-ops)', !('customClasses' in mc) || !Array.isArray(mc.customClasses));
ok('migrateCampaign does NOT inject customRaces', !('customRaces' in mc) || !Array.isArray(mc.customRaces));

// =============================================================================
console.log('\n=============================================');
console.log('custom-classes.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
if(fail) console.log('FAILURES:\n  ' + failures.join('\n  '));
console.log('=============================================');
process.exit(fail ? 1 : 0);
