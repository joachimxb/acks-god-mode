// =============================================================================
// custom-classes.smoke.js — Custom Classes & Races W1 + W2 (data layer + derivation +
// trade-off / drawback / costing machinery). #154. Phase_6_Custom_Classes_Plan.md §5 (W1+W2).
// RAW: Custom_Classes_RAW_Survey.md.
// W1 covers: the ccl-/crc- prefixes; the five core category XP tables (JJ pp.290–296);
// THE ORACLE — deriveClassFromTemplate reproduces all 21 RAW seed 2nd-level XP costs
// EXACT (the Ready-For-Play Class Builds table, JJ p.330); coreClassMapping for all 21
// (incl. the explorer/venturer hybrids + Assassin/Bard → fighter); saveProgression incl.
// the Arcane→Divine→Fighting→Thievery tie-break; the 5 race costings (Elf4/Dwarf4/Halfling0);
// blankClassTemplate/blankRaceTemplate + createCustomClass/createCustomRace (init-on-write)
// + JSON round-trip; seedCustomContent idempotency; the lookups; the full derived block +
// the proficiency-list-size / hp-after-9th / prime-requisites derivations; the registry
// kinds + the schema⊆factory + displayName invariants; the importer wiring (§8.9 mandate);
// the custom-power-compendium gate; the load-bearing guard — a custom-content-less campaign
// STAYS so through migrateCampaign (no migrate injector → templates stay no-ops).
// W2 covers: Barbarian + Shaman → the complete RAW 21; the FIGHTING_VALUE_TABLE RAW fix (F2 =
// Unrestricted/Heavy/3-styles + hasDamageBonus + the style counts); the Fighting/Thievery/
// Divine trade-off → power engine (fightingTradeOffBreakdown vs Barbarian/Paladin/Explorer/
// Shaman) + the +250 weapon-penalty derivation; the 11 Custom Drawbacks + drawback budget
// ("Weak −1 buys a power at zero XP delta"); the power BUDGET/SPEND/BALANCE machinery with
// level-locking (½); the racial build-point → level-cap derivation (demi-human seeds) + the
// race-value costing function; the Power-Creation hints; the expanded (still-gated) compendium;
// the structured trade-off CHOICES round-trip + the surviving schema⊆factory invariant.
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
section('THE ORACLE — all 21 RAW seed 2nd-level XP costs derive EXACT (JJ p.330)');
// =============================================================================
// build the seed ENTITIES (the validation oracle); each seed row carries its RAW xp.
const seedEntities = ACKS.seedClassTemplates();
ok('seedClassTemplates() returns 21 (W2 added Barbarian + Shaman)', seedEntities.length === 21);
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
section('coreClassMapping — correct for all 21 (incl. the explorer/venturer hybrids)');
// =============================================================================
const EXPECT_CCM = {
  fighter:'fighter', mage:'mage', thief:'thief', assassin:'fighter', bard:'fighter',
  barbarian:'fighter', shaman:'crusader',
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
  barbarian:'fighter', shaman:'crusader',
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
ok('seedCustomContent installs 21 classes + 5 races', r1.classes === 21 && r1.races === 5);
ok('…into campaign.customClasses/customRaces', sc.customClasses.length === 21 && sc.customRaces.length === 5);
const r2 = ACKS.seedCustomContent(sc);
ok('seedCustomContent is idempotent (second run installs nothing)', r2.classes === 0 && r2.races === 0 && sc.customClasses.length === 21);
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
ok('listEntities(custom-class) reads campaign.customClasses', ACKS.listEntities(sc, 'custom-class').length === 21);
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
// =============================  W2  ===========================================
// =============================================================================
const byKey = (k) => seedEntities[ACKS.CUSTOM_CLASS_SEEDS.findIndex(s => s.key === k)];

// =============================================================================
section('W2 — Barbarian + Shaman complete the RAW 21 (JJ p.330)');
// =============================================================================
ok('Barbarian seed present, HD2/F2, XP 2,250 (1 weapon power × 250)', byKey('barbarian') && ACKS.customClassSecondLevelXp(byKey('barbarian')) === 2250);
ok('Shaman seed present, HD1/F1b/D2, XP 1,500 (weapon Broad→Narrow=2 but F1b<2 → no penalty)', byKey('shaman') && ACKS.customClassSecondLevelXp(byKey('shaman')) === 1500);
ok('Barbarian save = fighter, coreClassMapping = fighter', ACKS.customClassSaveProgression(byKey('barbarian')) === 'fighter' && ACKS.customClassCoreClassMapping(byKey('barbarian')) === 'fighter');
ok('Shaman save = crusader (Divine 2 is the highest category, beats Fighting 1)', ACKS.customClassSaveProgression(byKey('shaman')) === 'crusader' && ACKS.customClassCoreClassMapping(byKey('shaman')) === 'crusader');
ok('Barbarian rarity rare, Shaman rarity uncommon (Generators frequency seam)', byKey('barbarian').rarity === 'rare' && byKey('shaman').rarity === 'uncommon');

// =============================================================================
section('W2 — FIGHTING_VALUE_TABLE RAW-correct (JJ p.290): F2 Unrestricted/Heavy/3-styles');
// =============================================================================
const F = ACKS.FIGHTING_VALUE_TABLE;
ok('F2 weaponSelection = Unrestricted (was Broad in the W1 cut — RAW p.290 + trade-off examples)', F['2'].weaponSelection === 'Unrestricted');
ok('F2 armorProf = Heavy (was Medium — RAW p.290)', F['2'].armorProf === 'Heavy');
ok('F3/F4 Unrestricted/Heavy', F['3'].weaponSelection === 'Unrestricted' && F['3'].armorProf === 'Heavy' && F['4'].weaponSelection === 'Unrestricted');
ok('hasDamageBonus: F2/3/4 true, F0/1a/1b false (RAW p.290)', F['2'].hasDamageBonus && F['3'].hasDamageBonus && F['4'].hasDamageBonus && !F['0'].hasDamageBonus && !F['1a'].hasDamageBonus && !F['1b'].hasDamageBonus);
ok('fightingStyleCount (optional styles): F0=1, 1a/1b=2, 2/3/4=3 (RAW p.290 column)',
  F['0'].fightingStyleCount === 1 && F['1a'].fightingStyleCount === 2 && F['1b'].fightingStyleCount === 2 &&
  F['2'].fightingStyleCount === 3 && F['3'].fightingStyleCount === 3 && F['4'].fightingStyleCount === 3);
ok('deriveClassFromTemplate(Fighter).armorProf is now Heavy (the RAW fix flows through)', ACKS.deriveClassFromTemplate(byKey('fighter'), null).armorProf === 'Heavy');

// =============================================================================
section('W2 — the Fighting trade-off tables + breakdown (JJ p.292)');
// =============================================================================
ok('ARMOR_TIERS least→most: None…Heavy', JSON.stringify(ACKS.ARMOR_TIERS) === JSON.stringify(['None','Very Light','Light','Medium','Heavy']));
ok('WEAPON_TIERS least→most: Restricted…Unrestricted', JSON.stringify(ACKS.WEAPON_TIERS) === JSON.stringify(['Restricted','Narrow','Broad','Unrestricted']));
ok('WEAPON_STEP_POWERS non-uniform: U→B 1, B→N 2, N→R 1', ACKS.WEAPON_STEP_POWERS['Unrestricted→Broad'] === 1 && ACKS.WEAPON_STEP_POWERS['Broad→Narrow'] === 2 && ACKS.WEAPON_STEP_POWERS['Narrow→Restricted'] === 1);
// A Barbarian-shaped F2 build with its RAW trade-offs (JJ p.330): armor 1 + weapon 1 + style 1 + damage 1 = 4
const barbBuild = ACKS.blankClassTemplate({ buildPoints:{hd:2,fighting:2}, choices:{ armorReducedTo:'Medium', weaponReducedTo:'Broad', fightingStylesDropped:1, damageTradeOff:'one' } });
const barbBreak = ACKS.fightingTradeOffBreakdown(barbBuild);
ok('Barbarian build: armor 1, weapon 1, style 1, damage 1, total 4 (JJ p.330)', barbBreak.armor === 1 && barbBreak.weapon === 1 && barbBreak.style === 1 && barbBreak.damage === 1 && barbBreak.total === 4);
ok('Barbarian build XP = 2,250 (base 2,000 + 250 for the 1 WEAPON power; armour/style/damage free)', ACKS.customClassSecondLevelXp(barbBuild) === 2250);
// Paladin: Unrestricted→Narrow = 3 weapon powers (1 + 2), damage one = 1 → +750 XP
const palBuild = ACKS.blankClassTemplate({ buildPoints:{hd:2,fighting:2}, choices:{ weaponReducedTo:'Narrow', damageTradeOff:'one' } });
ok('Paladin build: weapon Unrestricted→Narrow = 3 powers; XP 2,750 (+750)', ACKS.fightingTradeOffBreakdown(palBuild).weapon === 3 && ACKS.customClassSecondLevelXp(palBuild) === 2750);
// Explorer: armour 1 + weapon 1 (Unrestricted→Broad) + thievery T1=4 traded → 4; total 6, +250
const expBuild = ACKS.blankClassTemplate({ buildPoints:{hd:1,fighting:2,thievery:1}, choices:{ armorReducedTo:'Medium', weaponReducedTo:'Broad', thiefSkillsTraded:4 } });
ok('Explorer build: 6 powers total (armour 1 + weapon 1 + 4 thief skills), XP 2,000 (+250)',
  (ACKS.fightingTradeOffBreakdown(expBuild).total + ACKS.thieverySkillTradeOffPowers(expBuild)) === 6 && ACKS.customClassSecondLevelXp(expBuild) === 2000);
// Shaman: F1b Broad→Narrow = 2 weapon powers, but Fighting < 2 → NO +250 penalty
const shaBuild = ACKS.blankClassTemplate({ buildPoints:{hd:1,fighting:1,divine:2}, fightingSubtype:'1b', choices:{ weaponReducedTo:'Narrow', rebukeTradeOff:true } });
ok('Shaman build: weapon Broad→Narrow = 2; rebuke (D2) = 2; budget 4', ACKS.fightingTradeOffBreakdown(shaBuild).weapon === 2 && ACKS.divineRebukeTradeOffPowers(shaBuild) === 2 && ACKS.customClassPowerBudget(shaBuild) === 4);
ok('Shaman build XP = 1,500 (F1b weapon trade-off triggers NO penalty — JJ p.292 ≥2 only)', ACKS.customClassSecondLevelXp(shaBuild) === 1500);
// illegal reductions clamp to 0
ok('reducing weapon UP / to the same tier grants 0', ACKS.fightingTradeOffBreakdown(ACKS.blankClassTemplate({ buildPoints:{fighting:2}, choices:{ weaponReducedTo:'Unrestricted' } })).weapon === 0);
ok('a damage trade-off on a no-damage-bonus class (F1a) grants 0', ACKS.fightingTradeOffBreakdown(ACKS.blankClassTemplate({ buildPoints:{fighting:1}, fightingSubtype:'1a', choices:{ damageTradeOff:'both' } })).damage === 0);
ok('dropping more styles than the class has clamps to the available count', ACKS.fightingTradeOffBreakdown(ACKS.blankClassTemplate({ buildPoints:{fighting:0}, choices:{ fightingStylesDropped:9 } })).style === 1);
ok('customClassWeaponTradeOffPowers: stored seed count wins (Paladin 3); derives for a built class', ACKS.customClassWeaponTradeOffPowers(byKey('paladin')) === 3 && ACKS.customClassWeaponTradeOffPowers(palBuild) === 3);

// =============================================================================
section('W2 — the 11 Custom Drawbacks + drawback budget (JJ p.329)');
// =============================================================================
ok('CUSTOM_DRAWBACKS frozen list of 11', ACKS.CUSTOM_DRAWBACKS.length === 11 && Object.isFrozen(ACKS.CUSTOM_DRAWBACKS));
ok('Weak = −1, Short-Statured = −0.5, Unholy = −2 (the three distinct weights)',
  ACKS.findCustomDrawback('Weak').powerWeight === -1 && ACKS.findCustomDrawback('Short-Statured').powerWeight === -0.5 && ACKS.findCustomDrawback('Unholy').powerWeight === -2);
ok('every drawback page-cited + a terse (≤140-char) summary (IP: no transcribed prose)', ACKS.CUSTOM_DRAWBACKS.every(d => d.page && d.summary && d.summary.length <= 140));
// a Weak (−1) drawback adds +1 to the power budget "at the right XP delta" (= no XP change — drawbacks aren't weapon trade-offs)
const noDraw = ACKS.blankClassTemplate({ buildPoints:{hd:2,fighting:2} });
const wDraw  = ACKS.blankClassTemplate({ buildPoints:{hd:2,fighting:2}, customDrawbacks:['Weak'] });
ok('Weak drawback (string) normalizes to {name, powerWeight:-1}', wDraw.customDrawbacks[0].name === 'Weak' && wDraw.customDrawbacks[0].powerWeight === -1);
ok('Weak adds +1 to the power budget', ACKS.customClassDrawbackBudget(wDraw) === 1 && ACKS.customClassPowerBudget(wDraw) === ACKS.customClassPowerBudget(noDraw) + 1);
ok('…at the right XP delta: ZERO (a drawback is not a weapon trade-off)', ACKS.customClassSecondLevelXp(wDraw) === ACKS.customClassSecondLevelXp(noDraw));
ok('Unholy (−2) adds +2 to the budget', ACKS.customClassDrawbackBudget(ACKS.blankClassTemplate({ customDrawbacks:['Unholy'] })) === 2);
ok('a GM-invented drawback name defaults to −1', ACKS.blankClassTemplate({ customDrawbacks:['Cursed Gaze'] }).customDrawbacks[0].powerWeight === -1);

// =============================================================================
section('W2 — power budget / spend / balance + level-locking (JJ p.328)');
// =============================================================================
// effective weight: a power unlocked after 1st level is worth HALF (the "1 initial → 2 later" rule)
ok('effectivePowerWeight: level 1 = full, level 7 = half', ACKS.effectivePowerWeight({ powerWeight:1, levelUnlocked:1 }) === 1 && ACKS.effectivePowerWeight({ powerWeight:1, levelUnlocked:7 }) === 0.5);
const balCls = ACKS.blankClassTemplate({ buildPoints:{hd:2,fighting:2}, customDrawbacks:['Weak','Unholy'],
  customPowers:[{ name:'A', powerWeight:1, levelUnlocked:1 }, { name:'B', powerWeight:1, levelUnlocked:7 }] });   // budget 3, spent 1 + 0.5 = 1.5
const bal = ACKS.customClassBuildBalance(balCls);
ok('build budget = 3 (Weak 1 + Unholy 2), spent = 1.5 (1 + a level-locked ½), surplus 1.5, balanced', bal.budget === 3 && bal.spent === 1.5 && bal.surplus === 1.5 && bal.balanced === true);
const overCls = ACKS.blankClassTemplate({ buildPoints:{hd:2,fighting:2}, customPowers:[{ name:'X', powerWeight:2, levelUnlocked:1 }] });   // budget 0, spent 2
ok('overspent build flagged not balanced (surplus < 0)', ACKS.customClassBuildBalance(overCls).balanced === false && ACKS.customClassBuildBalance(overCls).surplus === -2);
// a real seed (Venturer) carries no structured trade-off choices → budget 0 (the balance read is for GM builds)
ok('a seed with no structured trade-offs reads budget 0 (informational; the XP oracle is the source of record)', ACKS.customClassPowerBudget(byKey('venturer')) === 0);

// =============================================================================
section('W2 — racial build-point → level cap + race-value costing (JJ pp.301/333)');
// =============================================================================
ok('RACE_BUILD_POINT_LEVEL_CAP: 8→8, 7→10, 6→11, 5→12, 4→13', ACKS.RACE_BUILD_POINT_LEVEL_CAP[8] === 8 && ACKS.RACE_BUILD_POINT_LEVEL_CAP[7] === 10 && ACKS.RACE_BUILD_POINT_LEVEL_CAP[6] === 11 && ACKS.RACE_BUILD_POINT_LEVEL_CAP[5] === 12 && ACKS.RACE_BUILD_POINT_LEVEL_CAP[4] === 13);
ok('total build points: Vaultguard 4, Craftpriest 7, Nightblade 6, Ruinguard 5', ACKS.customClassTotalBuildPoints(byKey('dwarven-vaultguard')) === 4 && ACKS.customClassTotalBuildPoints(byKey('dwarven-craftpriest')) === 7 && ACKS.customClassTotalBuildPoints(byKey('elven-nightblade')) === 6 && ACKS.customClassTotalBuildPoints(byKey('zaharan-ruinguard')) === 5);
function derivedCap(k){ const t = byKey(k); return ACKS.customClassDerivedMaxLevel(t, ACKS.raceForClassTemplate({}, t)); }
ok('derived caps: Vaultguard 13, Craftpriest 10, Nightblade 11, Spellsword 10, Ruinguard 12', derivedCap('dwarven-vaultguard') === 13 && derivedCap('dwarven-craftpriest') === 10 && derivedCap('elven-nightblade') === 11 && derivedCap('elven-spellsword') === 10 && derivedCap('zaharan-ruinguard') === 12);
ok('Nobiran Wonderworker derives 11; the seed stores 12 (a +1 Nobiran power — the seed-stored exception)', derivedCap('nobiran-wonderworker') === 11 && byKey('nobiran-wonderworker').maxLevel === 12);
ok('a human class (no race) caps at 14', ACKS.customClassDerivedMaxLevel(byKey('fighter'), null) === 14);
// the race-cost RULE (validated on a clean synthetic; per-rung race data is W3)
ok('raceValueXpFromPowers({powerCount:3}) = 80 (3×40 − 40 level-loss)', ACKS.raceValueXpFromPowers({ powerCount:3 }) === 80);
ok('raceValueXpFromPowers with a spell-like (level 2) = 40 + (65+10) − 40 = 75', ACKS.raceValueXpFromPowers({ powerCount:1, spellLikeSpellLevels:[2] }) === 75);
ok('raceValueXpFromPowers with a mimicked Arcane-2 value (+1250) folds it in', ACKS.raceValueXpFromPowers({ powerCount:1, mimicValueXp:1250 }) === 1250);

// =============================================================================
section('W2 — Custom Power Creation hints + expanded (still-gated) compendium');
// =============================================================================
ok('POWER_CREATION_COSTS: AC +1 = 1 power, all-saves +2 = 1, +3-saves = 2 (JJ pp.306–307)',
  ACKS.POWER_CREATION_COSTS.find(p => /Armour Class/.test(p.effect)).powers === 1 &&
  ACKS.POWER_CREATION_COSTS.find(p => /\+2 \(all\)/.test(p.effect)).powers === 1 &&
  ACKS.POWER_CREATION_COSTS.find(p => /\+3 or better/.test(p.effect)).powers === 2);
ok('SPELL_LIKE_SCHEDULE spans levels 1–6 (the at-will→1/month usage ladder)', ACKS.SPELL_LIKE_SCHEDULE.length === 6 && ACKS.SPELL_LIKE_SCHEDULE[0].level === 1 && ACKS.SPELL_LIKE_SCHEDULE[5].level === 6);
ok('compendium expanded past the W1 seed of 10 (still a representative set, not the full ~250)', ACKS.CUSTOM_POWER_COMPENDIUM.length > 10 && ACKS.CUSTOM_POWER_COMPENDIUM.length < 60);
ok('compendium one-liners stay terse (≤140 chars — IP: no transcribed prose)', ACKS.CUSTOM_POWER_COMPENDIUM.every(p => !p.summary || p.summary.length <= 140));
ok('compendium STILL gated default-OFF (W2 only expanded the content pack)', ACKS.customPowerCompendium({}).length === 0 && ACKS.customPowerCompendium({ houseRules:{ 'custom-power-compendium':{ enabled:true } } }).length === ACKS.CUSTOM_POWER_COMPENDIUM.length);
ok('a new compendium power resolves (Hardy = 3 powers)', ACKS.findCustomPower('Hardy') && /3 powers/.test(ACKS.findCustomPower('Hardy').summary));

// =============================================================================
section('W2 — structured trade-off CHOICES round-trip (derive-don\'t-store)');
// =============================================================================
ok('new choices keys present on blankClassTemplate', ['armorReducedTo','weaponReducedTo','fightingStylesDropped','damageTradeOff','rebukeTradeOff','thiefSkillsTraded'].every(k => k in ACKS.blankClassTemplate({}).choices));
ok('a built class with trade-offs + drawbacks survives a JSON round-trip', (() => { const t = ACKS.blankClassTemplate({ key:'gladiator', buildPoints:{hd:1,fighting:3}, choices:{ armorReducedTo:'Light', weaponReducedTo:'Broad' }, customDrawbacks:['Weak'] }); return JSON.stringify(clone(t)) === JSON.stringify(t); })());
// the W2 factory growth keeps the schema⊆factory invariant (re-assert after adding choices keys)
ok('custom-class schema still ⊆ the (grown) factory after the W2 choices fields', ACKS.validateAllSchemas().length === 0 && (() => { const keys = new Set(Object.keys(ACKS.blankClassTemplate({}).choices)); return ACKS.fieldSchemaFor('custom-class').fields.filter(f=>f.type==='object'&&f.name==='choices').every(f => (f.fields||[]).every(s => keys.has(s.name))); })());

// =============================================================================
console.log('\n=============================================');
console.log('custom-classes.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
if(fail) console.log('FAILURES:\n  ' + failures.join('\n  '));
console.log('=============================================');
process.exit(fail ? 1 : 0);
