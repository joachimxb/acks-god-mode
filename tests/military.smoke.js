// =============================================================================
// military.smoke.js — Phase 3 Military W1: Units & Armies + the warfare catalogs.
//
//   node tests/military.smoke.js   (or via `npm test`)
//
// W1 = the foundation everything else in Phase_3_Military_Plan.md reads:
//   - acks-engine-troops.js (GENERATED): TROOP_CATALOG (RR pp.438–444) + MERC_WAGES/
//     MERC_MORALE (p.429) + OFFICER_RANKS (p.171) + ARMY_ORG_SCALE (p.437) +
//     UNIT_SUPPLY_COSTS (p.450) + UNIT_LOYALTY_BANDS (p.430) + VASSAL_TROOPS (p.434) +
//     realm availability/fees (p.428). Spot rows locked against the PRINT.
//   - Unit (the Group's military sibling, campaign.units[]) + Army (embedded divisions),
//     officer characteristics (RR pp.435–437 — the RAW worked examples reproduce),
//     the shared battle interface (unitBattleRating ↔ groupBattleRating),
//     stationUnit/disbandUnit + the garrison/mercenaryCompany reference-unified lift.
//   - The MM supply-cost + battle-rating fields on MONSTER_CATALOG (RR p.450 points there).
// =============================================================================
'use strict';
const path = require('path');
const DIR = path.join(__dirname, '..');
global.window = global;
[
  'acks-engine-catalogs.js', 'acks-engine-monsters.js', 'acks-engine-encounter-tables.js', 'acks-engine-troops.js',
  'acks-engine.js', 'acks-engine-entities.js', 'acks-engine-economy.js',
  'acks-engine-entity-registry.js', 'acks-engine-field-schemas.js', 'acks-engine-events.js', 'acks-engine-battles.js', 'acks-engine-maneuvers.js', 'acks-engine-subsystems.js'
].forEach(f => require(path.join(DIR, f)));
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(label + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('— ' + t); }

// ─────────────────────────────────────────────────────────────────────────────
section('TROOP_CATALOG — shape + printed spot rows (RR pp.438–441)');
const TC = ACKS.TROOP_CATALOG;
ok('95 troop rows', TC.length === 95, 'got ' + TC.length);
ok('25 veteran rows', TC.filter(t => t.veteran).length === 25);
ok('51 human rows', TC.filter(t => t.race === 'man').length === 51);
ok('7 dwarf + 9 elf rows', TC.filter(t => t.race === 'dwarf').length === 7 && TC.filter(t => t.race === 'elf').length === 9);

const hiA = ACKS.findTroopType('heavy-infantry');
ok('man heavy infantry A: the printed row', hiA && hiA.key === 'man-heavy-infantry-a' && hiA.ac === 6 && hiA.moveFt === 60 &&
   hiA.hd === '1-1' && hiA.morale === 0 && hiA.brPerCreature === 0.016 && hiA.wageGpMonth === 12 && hiA.page === 438,
   JSON.stringify(hiA));
ok('… with the p.442 unit values attached', hiA.unitSize === 120 && hiA.unitSupplyWeekly === 60 &&
   hiA.unitBattleRating === 2 && hiA.unitDailyMoveMiles === 12 && hiA.unitWeeklyMoveMiles === 48);
const liA = ACKS.findTroopType('light-infantry');
ok('man light infantry A: 6gp / 0.010 BR / ML −1', liA && liA.wageGpMonth === 6 && liA.brPerCreature === 0.010 && liA.morale === -1);
const dxbow = ACKS.findTroopType('crossbowman', { race: 'dwarf' });
ok('dwarf crossbowmen: 33gp / 0.045 / ML +1', dxbow && dxbow.wageGpMonth === 33 && dxbow.brPerCreature === 0.045 && dxbow.morale === 1);
const ecat = ACKS.findTroopType('cataphract-cavalry', { race: 'elf' });
ok('elf cataphracts: 160gp / 0.263 / ML +3 / unit BR 16', ecat && ecat.wageGpMonth === 160 && ecat.brPerCreature === 0.263 &&
   ecat.morale === 3 && ecat.unitBattleRating === 16 && ecat.category === 'cavalry' && ecat.unitSize === 60);
const vhc = ACKS.findTroopType('heavy-cavalry', { veteran: true });
ok('veteran heavy cavalry: 100gp / 0.169 / ML +3 / unit BR 10', vhc && vhc.wageGpMonth === 100 && vhc.brPerCreature === 0.169 &&
   vhc.morale === 3 && vhc.unitBattleRating === 10);
const wolfR = ACKS.findTroopType('wolf-riders', { race: 'goblin' });
ok('goblin wolf riders: 80gp / 0.161 / supply 480 (carnivorous mounts)', wolfR && wolfR.wageGpMonth === 80 &&
   wolfR.brPerCreature === 0.161 && wolfR.unitSupplyWeekly === 480 && wolfR.unitBattleRating === 9.5);
const ogreHI = ACKS.findTroopType('heavy-infantry', { race: 'ogre' });
ok('ogre heavy infantry: 210gp / 0.310 / LARGE — 60 per unit, supply 240', ogreHI && ogreHI.wageGpMonth === 210 &&
   ogreHI.brPerCreature === 0.310 && ogreHI.category === 'large' && ogreHI.unitSize === 60 && ogreHI.unitSupplyWeekly === 240);
const eleph = ACKS.findTroopType('war-elephants');
ok('war elephants: 360gp / 1.102 / 5 per unit / unit BR 5.5', eleph && eleph.wageGpMonth === 360 &&
   eleph.brPerCreature === 1.102 && eleph.unitSize === 5 && eleph.unitBattleRating === 5.5);
const levy = ACKS.findTroopType('untrained-levy');
ok('untrained conscripts/militia: 3gp / ML −2 / BR 0.004', levy && levy.wageGpMonth === 3 && levy.morale === -2 && levy.brPerCreature === 0.004);
// The RR-internal print quirk, kept as printed: camel lancers 45gp on p.439 + p.429
// (the p.443 unit row's 2,400 disagrees — the catalog follows the two agreeing tables).
const claw = ACKS.findTroopType('camel-lancers');
ok('camel lancers row keeps the p.439/p.429 wage 45', claw && claw.wageGpMonth === 45);

section('findTroopType resolution — aliases, beast riders, race gates');
ok('composite-bow market alias → man-composite-bowman', ACKS.findTroopType('composite-bow').key === 'man-composite-bowman');
ok('beast-riders resolves by race (kobold → weasel)', ACKS.findTroopType('beast-riders', { race: 'kobold' }).key === 'kobold-weasel-riders');
ok('beast-riders resolves by race (orc → boar)', ACKS.findTroopType('beast-riders', { race: 'orc' }).key === 'orc-boar-riders');
ok('loadout narrows (heavy-infantry C: 9gp, 90\')', ACKS.findTroopType('heavy-infantry', { loadout: 'C' }).wageGpMonth === 9);
ok('a race that does not field the type → null (dwarf light infantry)', ACKS.findTroopType('light-infantry', { race: 'dwarf' }) === null);
ok('veteran narrows to the veteran block', ACKS.findTroopType('bowman', { veteran: true }).key === 'man-veteran-bowman');

section('MERC_WAGES / MERC_MORALE matrices (RR p.429)');
ok('wage: elf light infantry 21', ACKS.mercWage('light-infantry', 'elf') === 21);
ok('wage: human war elephants 360', ACKS.mercWage('war-elephants', 'man') === 360);
ok('wage: dwarf mounted crossbowmen 55 (human −)', ACKS.mercWage('mounted-crossbowman', 'dwarf') === 55 && ACKS.mercWage('mounted-crossbowman', 'man') === null);
ok('wage: beast riders gnoll 225 (hyena)', ACKS.mercWage('beast-riders', 'gnoll') === 225);
ok('wage: rider keys route through the beast-riders matrix row', ACKS.mercWage('wolf-riders', 'goblin') === 80);
ok('morale: elf cataphract +3 / human light infantry −1 / kobold bowmen −2',
   ACKS.mercMorale('cataphract-cavalry', 'elf') === 3 && ACKS.mercMorale('light-infantry', 'man') === -1 && ACKS.mercMorale('bowman', 'kobold') === -2);
ok('morale: unavailable cell → null (ogre slingers)', ACKS.mercMorale('slinger', 'ogre') === null);
// The second print quirk, kept as printed on BOTH sides:
ok('hobgoblin horse-archer matrix cell stays the printed 75 (row stays 85)',
   ACKS.MERC_WAGES['horse-archers'].hobgoblin === 75 && ACKS.findTroopType('horse-archers', { race: 'hobgoblin' }).wageGpMonth === 85);

section('OFFICER_RANKS (RR p.171)');
const OR = ACKS.OFFICER_RANKS;
ok('4 ranks at 200/800/3,000/12,000 gp/mo', OR.length === 4 &&
   OR.map(r => r.costGpMonth).join(',') === '200,800,3000,12000');
ok('ranks at 4th/6th/8th/10th level', OR.map(r => r.level).join(',') === '4,6,8,10');
const col = ACKS.findOfficerRank('colonel');
ok('colonel: LA 5 / SA +2 / MM +3 / Command+Leadership+MS2', col && col.leadershipAbility === 5 && col.strategicAbility === 2 &&
   col.moraleModifier === 3 && col.proficiencies.join('|') === 'Command|Leadership|Military Strategy 2');

section('ARMY_ORG_SCALE (RR p.437) + armyScaleForSize');
ok('4 scales with ×¼/×1/×4/×16 multipliers', ACKS.ARMY_ORG_SCALE.map(r => r.multiplier).join(',') === '0.25,1,4,16');
ok('platoon 30/15 — brigade 1,920/960 troops per unit',
   ACKS.scaleRow('platoon').troopsPerUnitInfantry === 30 && ACKS.scaleRow('platoon').troopsPerUnitCavalry === 15 &&
   ACKS.scaleRow('brigade').troopsPerUnitInfantry === 1920 && ACKS.scaleRow('brigade').troopsPerUnitCavalry === 960);
ok('commander quals 4/6/8/10 + monster HD +2/+4/+6/+8',
   ACKS.ARMY_ORG_SCALE.map(r => r.commanderQual.npcLevel).join(',') === '4,6,8,10' &&
   ACKS.ARMY_ORG_SCALE.map(r => r.commanderQual.monsterHdOver).join(',') === '2,4,6,8');
ok('lieutenant quals 3/5/7/9', ACKS.ARMY_ORG_SCALE.map(r => r.lieutenantQual.npcLevel).join(',') === '3,5,7,9');
ok('scale boundaries: 600→platoon, 601→company, 3001→battalion, 12001→brigade',
   ACKS.armyScaleForSize(600) === 'platoon' && ACKS.armyScaleForSize(601) === 'company' &&
   ACKS.armyScaleForSize(3000) === 'company' && ACKS.armyScaleForSize(3001) === 'battalion' &&
   ACKS.armyScaleForSize(12001) === 'brigade');

section('UNIT_SUPPLY_COSTS (RR p.450) + UNIT_LOYALTY_BANDS (p.430)');
ok('15/60/240/960 infantry · 60/240/960/3,840 cavalry',
   ACKS.UNIT_SUPPLY_COSTS.platoon.infantry === 15 && ACKS.UNIT_SUPPLY_COSTS.company.cavalry === 240 &&
   ACKS.UNIT_SUPPLY_COSTS.battalion.infantry === 240 && ACKS.UNIT_SUPPLY_COSTS.brigade.cavalry === 3840);
ok('unitScaleSupplyCost: company cavalry ×4 carnivorous = 960', ACKS.unitScaleSupplyCost('cavalry', 'company', 4) === 960);
ok("'large' supplies as cavalry", ACKS.unitScaleSupplyCost('large', 'company') === 240);
ok('loyalty bands: 2 hostility / 5 resignation / 8 grudging / 11 loyalty / 12 fanatic',
   ACKS.unitLoyaltyBand(2).result === 'hostility' && ACKS.unitLoyaltyBand(5).result === 'resignation' &&
   ACKS.unitLoyaltyBand(8).result === 'grudging-loyalty' && ACKS.unitLoyaltyBand(11).result === 'loyalty' &&
   ACKS.unitLoyaltyBand(14).result === 'fanatic-loyalty');
ok('the 4 core calamity kinds are registered', ['routed','casualties-25','unsupplied-week','unpaid-month']
   .every(k => ACKS.UNIT_CALAMITY_KINDS.includes(k)));

section('VASSAL_TROOPS (RR p.434) + realm availability (p.428)');
ok('7 tiers, Viscount present (not "Marquis")', ACKS.VASSAL_TROOPS.length === 7 &&
   ACKS.VASSAL_TROOPS.some(v => v.key === 'viscount') && !ACKS.VASSAL_TROOPS.some(v => /marquis/i.test(v.title)));
const baronV = ACKS.VASSAL_TROOPS.find(v => v.key === 'baron');
ok('baron: 320gp garrison / weekly muster periods', baronV && baronV.avgPersonalGarrisonWages === 320 && baronV.timePeriod === 'week');
const MAR = ACKS.MERC_AVAILABILITY_REALM;
ok('availability: 16 types × 8 tiers', Object.keys(MAR.types).length === 16 && MAR.tiers.length === 8);
ok('light infantry: continent 340,000 / barony 3', MAR.types['light-infantry'].continent === 340000 && MAR.types['light-infantry'].barony === 3);
ok('horse archers unavailable at barony (−)', MAR.types['horse-archers'].barony === null);
ok('empire population 1.5M / season periods', MAR.populationFamilies.empire === 1500000 && MAR.timePeriod.empire === 'season');
ok('fees: continent 6d10×1,000gp / barony 2d6+1gp',
   ACKS.REALM_RECRUITMENT_FEES.continent.dice === '6d10' && ACKS.REALM_RECRUITMENT_FEES.continent.multiplierGp === 1000 &&
   ACKS.REALM_RECRUITMENT_FEES.barony.dice === '2d6+1' && ACKS.REALM_RECRUITMENT_FEES.barony.multiplierGp === 1);
ok('specialist availability: 16 rows incl. the 4 officer ranks',
   Object.keys(ACKS.MILITARY_SPECIALIST_AVAILABILITY_REALM.types).length === 16 &&
   Object.keys(ACKS.MILITARY_SPECIALIST_AVAILABILITY_REALM.types).filter(k => k.startsWith('mercenary-officer')).length === 4);

// ─────────────────────────────────────────────────────────────────────────────
section('Factories — blankUnit / blankGarrisonUnit delegate / blankArmy');
const u1 = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', count: 120 });
ok('blankUnit derives catalog wage/BR defaults', u1.monthlyWage === 12 && u1.brPerSoldier === 0.016 && u1.displayName === 'Heavy Infantry A');
ok('blankUnit id uses the unit- prefix', /^unit-/.test(u1.id));
ok('blankUnit military fields', u1.race === 'man' && u1.veteran === false && u1.elite === false && u1.casualties === 0 &&
   u1.source === 'mercenary' && u1.scale === 'company' && u1.supplyState === 'supplied' &&
   Array.isArray(u1.calamities) && u1.loyalty === 0 && u1.moraleAdjustment === 0 && u1.stationedAt === null);
ok('blankUnit home fields default null (lazy — old units read null)', u1.homeHexId === null && u1.homeDomainId === null);
ok('explicit opts win over the catalog', ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', monthlyWage: 99 }).monthlyWage === 99);
const gu = ACKS.blankGarrisonUnit({ unitTypeKey: 'light-infantry' });
ok('blankGarrisonUnit delegates (superset shape + catalog defaults, not the old 0.034)',
   gu.brPerSoldier === 0.010 && gu.monthlyWage === 6 && 'supplyState' in gu && 'stationedAt' in gu);
const a1 = ACKS.blankArmy({ name: 'Test Army' });
ok('blankArmy shape', /^army-/.test(a1.id) && a1.divisions.length === 0 && a1.strategicStance === 'defensive' &&
   a1.supplySimplified === true && a1.journeyId === null && Array.isArray(a1.supplyBaseIds));

section('Officer characteristics — the RAW worked examples (RR pp.435–437)');
const marcus = { abilities: { CHA: 16, INT: 14, WIL: 11 }, proficiencies: ['Leadership', 'Military Strategy 2', 'Command'], class: 'Fighter', level: 9, name: 'Marcus' };
const seanan = { abilities: { CHA: 10, INT: 18, WIL: 7 }, proficiencies: ['Military Strategy', 'Military Strategy', 'Military Strategy'], class: 'Mage', level: 7, name: 'Seanan' };
ok('Marcus leadership ability 7 (CHA 16 + Leadership)', ACKS.leadershipAbility(marcus) === 7);
ok('… −1 using an adjutant → 6', ACKS.leadershipAbility(marcus, { usingAdjutant: true }) === 6);
ok('leadership caps at 8', ACKS.leadershipAbility({ abilities: { CHA: 18 }, proficiencies: ['Leadership'] }) === 8);
ok('Marcus strategic ability +3 (INT +1, WIL 0, MS 2)', ACKS.strategicAbility(marcus) === 3);
ok('Seanan strategic ability +5 (INT +3, WIL −1, MS 3 — both mods count)', ACKS.strategicAbility(seanan) === 5);
const eff = ACKS.effectiveStrategicAbility(marcus, seanan);
ok('adjutant loan: Marcus uses Seanan\'s SA −1 = +4', eff.value === 4 && eff.usingAdjutant === true);
const effSolo = ACKS.effectiveStrategicAbility(seanan, marcus);
ok('… but keeps his own when the loan is worse', effSolo.value === 5 && effSolo.usingAdjutant === false);
ok('Marcus morale modifier +5 (CHA +2, prowess +1, Command +2)', ACKS.officerMoraleModifier(marcus) === 5);
ok('… −1 using an adjutant → +4', ACKS.officerMoraleModifier(marcus, { usingAdjutant: true }) === 4);
ok('no prowess below 5th level', ACKS.officerMoraleModifier({ abilities: { CHA: 16 }, class: 'Fighter', level: 4, proficiencies: [] }) === 2);
const chieftain = { hitDice: '4+1', name: 'Orc Chieftain' };
ok('orc chieftain (monster): LA 4 = 3 + 4/4', ACKS.leadershipAbility(chieftain) === 4);
ok('orc chieftain SA −1 (4/5 → 0, sub-human −1)', ACKS.strategicAbility(chieftain, { monsterIntelligence: 'sub' }) === -1);
const dragon = { hitDice: '20' };
ok('venerable dragon: LA 8 (capped) / SA +6 (20/5 + super +2)', ACKS.leadershipAbility(dragon) === 8 &&
   ACKS.strategicAbility(dragon, { monsterIntelligence: 'super' }) === 6);
ok('monster morale modifier = the MM "while alive" bonus', ACKS.officerMoraleModifier(chieftain, { monsterMoraleBonus: 2 }) === 2);
ok('proficiencyRanks: "Military Strategy 2" = 2; repeats sum; prefix-safe',
   ACKS.proficiencyRanks(marcus, 'Military Strategy') === 2 && ACKS.proficiencyRanks(seanan, 'Military Strategy') === 3 &&
   ACKS.proficiencyRanks({ proficiencies: ['Commanding Presence'] }, 'Command') === 0);
ok('qualifies: Marcus (9th) battalion-commander yes, brigade no',
   ACKS.qualifiesAsCommander(marcus, 'battalion') === true && ACKS.qualifiesAsCommander(marcus, 'brigade') === false);
ok('qualifies: 5th level is a company lieutenant, not a company commander',
   ACKS.qualifiesAsLieutenant({ abilities: { CHA: 10 }, level: 5 }, 'company') === true &&
   ACKS.qualifiesAsCommander({ abilities: { CHA: 10 }, level: 5 }, 'company') === false);
ok('monster qualification needs unitAvgHd (else null = Judge decides)',
   ACKS.qualifiesAsCommander(chieftain, 'company') === null &&
   ACKS.qualifiesAsCommander(chieftain, 'company', { unitAvgHd: 1 }) === false &&
   ACKS.qualifiesAsCommander({ hitDice: '5' }, 'company', { unitAvgHd: 1 }) === true);

section('The shared battle interface — unitBattleRating ↔ groupBattleRating');
const camp0 = { units: [], armies: [], domains: [], characters: [], groups: [] };
const fullHI = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', count: 120 });
fullHI.brPerSoldier = 0;   // no override → catalog path
ok('full-strength standard unit uses the PRINTED unit BR (2)', ACKS.unitBattleRating(camp0, fullHI) === 2);
const underHI = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', count: 120, casualties: 60 });
underHI.brPerSoldier = 0;
ok('understrength derives per-creature × active (0.016×60 = 0.96 → 1)', ACKS.unitBattleRating(camp0, underHI) === 1);
const overrideU = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', count: 100, brPerSoldier: 0.05 });
ok('a stored brPerSoldier override wins (0.05×100 = 5)', ACKS.unitBattleRating(camp0, overrideU) === 5);
ok('zero active → 0', ACKS.unitBattleRating(camp0, ACKS.blankUnit({ count: 10, casualties: 10 })) === 0);
const wolfBand = ACKS.blankGroup({ groupTemplate: { monsterCatalogKey: 'common-wolf', creatureTypes: ['animal'], hitDice: '2' }, count: 10 });
ok('groupBattleRating: 10 wolves × 0.039 = 0.39 → 0.5', ACKS.groupBattleRating(camp0, wolfBand) === 0.5);
const banditBand = ACKS.blankGroup({ groupTemplate: { monsterCatalogKey: 'bandit', creatureTypes: ['humanoid'], hitDice: '1' }, count: 47 });
ok('an E10 banditry band prices in as a Group (47 × 0.012 = 0.564 → 0.5 — no promotion)',
   ACKS.groupBattleRating(camp0, banditBand) === 0.5);
ok('keyless group → 0', ACKS.groupBattleRating(camp0, ACKS.blankGroup({ count: 5 })) === 0);

section('Unit wage / supply / morale derived reads');
const hiU = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', count: 120 });
ok('wage bill: 120 × 12 = 1,440 (the printed p.442 unit wage)', ACKS.unitWageMonthly(camp0, hiU) === 1440);
hiU.casualties = 20;
ok('dead soldiers collect no wages (100 × 12)', ACKS.unitWageMonthly(camp0, hiU) === 1200);
const campElite = { units: [], armies: [], domains: [], characters: [], houseRules: { 'elite-troops': { enabled: true } } };
const eliteU = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', count: 120, elite: true });
ok('elite surcharge OFF by default (rule unregistered on the campaign)', ACKS.unitWagePerSoldier(camp0, eliteU) === 12);
ok('elite surcharge ON: 12 + max(3, ⌊12/6⌋) = 15', ACKS.unitWagePerSoldier(campElite, eliteU) === 15);
const eliteOgre = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', race: 'ogre', count: 60, elite: true });
ok('elite ogre heavy infantry: 210 + 35 = 245', ACKS.unitWagePerSoldier(campElite, eliteOgre) === 245);
ok('supply: company heavy infantry 60gp/week', ACKS.unitWeeklySupplyCost(camp0, ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', count: 120 })) === 60);
ok('supply: platoon scale ×¼ → 15', ACKS.unitWeeklySupplyCost(camp0, ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'platoon' })) === 15);
ok('supply: goblin wolf riders carry the printed 480 (carnivore-correct)',
   ACKS.unitWeeklySupplyCost(camp0, ACKS.blankUnit({ unitTypeKey: 'wolf-riders', race: 'goblin' })) === 480);
ok('morale: catalog base + adjustment', ACKS.unitMoraleScore(camp0, ACKS.blankUnit({ unitTypeKey: 'heavy-cavalry', moraleAdjustment: 1 })) === 3);
ok('morale: veteran row resolves the veteran value', ACKS.unitMoraleScore(camp0, ACKS.blankUnit({ unitTypeKey: 'heavy-cavalry', veteran: true })) === 3);

section('Army reads + organization validation');
function mkArmyCampaign(){
  const camp = { units: [], armies: [], domains: [], characters: [], groups: [] };
  camp.characters.push(Object.assign(ACKS.blankCharacter ? ACKS.blankCharacter({ id: 'chr-marcus', name: 'Marcus' }) : { id: 'chr-marcus', name: 'Marcus' }, {
    abilities: { STR: 10, INT: 14, WIL: 11, DEX: 10, CON: 10, CHA: 16 },
    proficiencies: ['Leadership', 'Military Strategy 2', 'Command'], class: 'Fighter', level: 9
  }));
  const army = ACKS.blankArmy({ id: 'army-test', name: 'Test Army', leaderCharacterId: 'chr-marcus' });
  camp.armies.push(army);
  for(let i = 0; i < 4; i++){
    const u = ACKS.blankUnit({ id: 'unit-t' + i, unitTypeKey: 'heavy-infantry', count: 120 });
    ACKS.stationUnit(camp, u, { kind: 'army', id: army.id });
  }
  return { camp, army };
}
{
  const { camp, army } = mkArmyCampaign();
  ok('armyUnits reads stationedAt', ACKS.armyUnits(camp, army).length === 4);
  // Marcus SA +3 → +0.5/unit: 4×2 + 4×0.5 = 10
  ok('armyBattleRating: Σ unit BR + the SA ≥+3 bonus (8 + 2 = 10)', ACKS.armyBattleRating(camp, army) === 10);
  ok('armyWageMonthly 4 × 1,440', ACKS.armyWageMonthly(camp, army) === 5760);
  ok('armyWeeklySupplyCost 4 × 60', ACKS.armyWeeklySupplyCost(camp, army) === 240);
  ok('armyMaxDivisions = the leader\'s leadership ability (7)', ACKS.armyMaxDivisions(camp, army) === 7);
  // organization findings
  army.divisions = [{ name: '1st', commanderCharacterId: 'chr-marcus', adjutantCharacterId: null,
                      unitIds: ['unit-t0', 'unit-t1', 'unit-t2', 'unit-t3'], role: 'main' }];
  ok('a well-formed army validates clean', ACKS.validateArmyOrganization(camp, army).length === 0,
     JSON.stringify(ACKS.validateArmyOrganization(camp, army)));
  army.divisions[0].unitIds = ['unit-t0', 'unit-t1', 'unit-t2'];
  ok('a stationed unit missing from every division is flagged',
     ACKS.validateArmyOrganization(camp, army).some(f => f.code === 'unit-no-division'));
  army.divisions[0].commanderCharacterId = null;
  ok('a commanderless division is flagged', ACKS.validateArmyOrganization(camp, army).some(f => f.code === 'division-no-commander'));
  army.leaderCharacterId = null;
  ok('a leaderless army is flagged', ACKS.validateArmyOrganization(camp, army).some(f => f.code === 'no-leader'));
}
{
  const { camp, army } = mkArmyCampaign();
  // 3,200 troops → battalion scale; Marcus (9th) qualifies at battalion (8th) but a 5th-level doesn't
  camp.characters.push({ id: 'chr-junior', name: 'Junior', abilities: { CHA: 10, INT: 10, WIL: 10 }, proficiencies: [], class: 'Fighter', level: 5 });
  for(const u of ACKS.armyUnits(camp, army)) u.count = 800;
  army.divisions = [{ name: '1st', commanderCharacterId: 'chr-junior', unitIds: ['unit-t0', 'unit-t1', 'unit-t2', 'unit-t3'], role: 'main' }];
  ok('an under-levelled commander is flagged at the army\'s scale (battalion)',
     ACKS.validateArmyOrganization(camp, army).some(f => f.code === 'commander-unqualified'));
}

section('stationUnit / disbandUnit — single home (campaign.units + stationedAt)');
{
  const camp = { units: [], armies: [], characters: [{ id: 'chr-a', name: 'A' }], domains: [{ id: 'dom-a', name: 'A', geography: {} }] };
  const u = ACKS.blankUnit({ unitTypeKey: 'light-infantry', count: 60 });
  ACKS.stationUnit(camp, u, { kind: 'domain-garrison', id: 'dom-a' });
  ok('stationed to garrison: in campaign.units, claimed by stationedAt (no nested mirror)',
     camp.units[0] === u && u.stationedAt.kind === 'domain-garrison' && u.stationedAt.id === 'dom-a' && !('garrison' in camp.domains[0]) &&
     ACKS.unitsStationedAt(camp, { kind: 'domain-garrison', id: 'dom-a' })[0] === u);
  ACKS.stationUnit(camp, u, { kind: 'character', id: 'chr-a' });
  ok('re-stationed to a character: stationedAt updated, still one in campaign.units',
     u.stationedAt.kind === 'character' && u.stationedAt.id === 'chr-a' && camp.units.length === 1 &&
     ACKS.unitsStationedAt(camp, { kind: 'domain-garrison', id: 'dom-a' }).length === 0 &&
     ACKS.unitsStationedAt(camp, { kind: 'character', id: 'chr-a' })[0] === u && !('mercenaryCompany' in camp.characters[0]));
  ACKS.stationUnit(camp, u, { kind: 'army', id: 'army-x' });
  ok('stationed to an army: stationedAt army, still one in campaign.units',
     u.stationedAt.kind === 'army' && u.stationedAt.id === 'army-x' && camp.units[0] === u && camp.units.length === 1);
  ACKS.disbandUnit(camp, u);
  ok('disbandUnit removes it from campaign.units', camp.units.length === 0);
}

section('migrateGarrisonUnitsToUnits — the lift-then-strip (single home)');
function legacyCampaign(){
  return {
    schemaVersion: 2, kind: 'campaign', id: 'cmp-legacy', name: 'Legacy', currentTurn: 3,
    houseRules: {}, eventLog: [], pendingEvents: [], hexes: [], settlements: [], rumors: [],
    characters: [
      { schemaVersion: 2, id: 'chr-cap', name: 'Captain', alive: true,
        mercenaryCompany: { units: [
          { schemaVersion: 2, id: 'gar-comp1', displayName: 'Escort', unitTypeKey: 'light-infantry', count: 20, monthlyWage: 6, brPerSoldier: 0.034, stationedAtHexId: null }
        ] } }
    ],
    domains: [
      { schemaVersion: 2, id: 'dom-l', name: 'Legacy March', garrison: { units: [
          { schemaVersion: 2, id: 'gar-leg1', displayName: 'Foot', unitTypeKey: 'heavy-infantry', count: 60, monthlyWage: 12, brPerSoldier: 0.083, stationedAtHexId: null },
          { schemaVersion: 2, displayName: 'No-id unit', unitTypeKey: 'bowman', count: 30, monthlyWage: 9, brPerSoldier: 0.063, stationedAtHexId: null }
        ] },
        treasury: { gp: 100 }, income: {}, expenses: {}, geography: { hexes: [] } }
    ]
  };
}
{
  const camp = ACKS.migrateCampaign(legacyCampaign());
  ok('lift: 3 first-class units', camp.units.length === 3, 'got ' + camp.units.length);
  const lifted = camp.units.find(x => x.id === 'gar-leg1');
  ok('the unit mirror was stripped (no d.garrison)', !('garrison' in camp.domains[0]));
  ok('gar- ids preserved (id stability)', lifted.id === 'gar-leg1');
  ok('stationedAt stamped from the home', lifted.stationedAt.kind === 'domain-garrison' && lifted.stationedAt.id === 'dom-l');
  ok('unitsStationedAt finds the lifted garrison unit', ACKS.unitsStationedAt(camp, { kind: 'domain-garrison', id: 'dom-l' }).some(x => x.id === 'gar-leg1'));
  const compU = camp.units.find(x => x.id === 'gar-comp1');
  ok('mercenary-company unit stationed to the character', compU && compU.stationedAt.kind === 'character' && compU.stationedAt.id === 'chr-cap');
  ok('the mercenaryCompany mirror was stripped', !('mercenaryCompany' in camp.characters[0]));
  ok('military fields lazy-defaulted (stored wage/BR untouched)', lifted.race === 'man' && lifted.supplyState === 'supplied' &&
     Array.isArray(lifted.calamities) && lifted.brPerSoldier === 0.083 && lifted.monthlyWage === 12);
  ok('a unit without an id got one (lifted to campaign.units)', camp.units.some(x => x.unitTypeKey === 'bowman' && x.id));
  // idempotence
  const before = camp.units.length;
  ACKS.migrateGarrisonUnitsToUnits(camp);
  ok('idempotent re-run adds nothing', camp.units.length === before);
  // JSON round-trip — a re-migrate of the single-home shape is a serialization fixed point
  const reloaded = ACKS.migrateCampaign(JSON.parse(JSON.stringify(camp)));
  ok('a JSON round-trip keeps the unit in campaign.units', reloaded.units.some(x => x.id === 'gar-leg1') && !('garrison' in reloaded.domains[0]));
  ok('… and stays a serialization fixed point', JSON.stringify(ACKS.migrateCampaign(JSON.parse(JSON.stringify(reloaded)))) === JSON.stringify(reloaded));
}
{
  // A first-class unit whose station names a domain — stays in campaign.units, no mirror rebuilt.
  const camp = legacyCampaign();
  delete camp.domains[0].garrison; delete camp.characters[0].mercenaryCompany;
  camp.units = [{ schemaVersion: 2, id: 'unit-solo', displayName: 'Solo', unitTypeKey: 'slinger', count: 10,
                  monthlyWage: 6, brPerSoldier: 0.01, stationedAt: { kind: 'domain-garrison', id: 'dom-l' } }];
  const m = ACKS.migrateCampaign(camp);
  ok('a stationed first-class unit stays in campaign.units (no mirror rebuilt)',
     m.units.some(x => x && x.id === 'unit-solo') && !('garrison' in m.domains[0]) &&
     ACKS.unitsStationedAt(m, { kind: 'domain-garrison', id: 'dom-l' }).some(x => x.id === 'unit-solo'));
}

section('Registry / schemas / prefixes / house rule');
ok('ID_PREFIXES unit- + army-', ACKS.ID_PREFIXES.unit === 'unit' && ACKS.ID_PREFIXES.army === 'army');
ok("registry kinds 'unit' + 'army' registered", !!ACKS.ENTITY_KINDS_LIST.find(k => k.kind === 'unit') && !!ACKS.ENTITY_KINDS_LIST.find(k => k.kind === 'army'));
{
  const camp = { units: [ACKS.blankUnit({ id: 'unit-r', displayName: 'Riders', unitTypeKey: 'light-cavalry', count: 60 })], armies: [ACKS.blankArmy({ id: 'army-r', name: 'Host' })] };
  ok('registry list/find/displayName work', ACKS.listEntities(camp, 'unit').length === 1 &&
     ACKS.findEntity(camp, 'army', 'army-r').name === 'Host' &&
     ACKS.entityDisplayName(camp, 'unit', 'unit-r') === 'Riders (60)');
}
ok('field schemas exist for unit + army (schemaForm)', ACKS.FIELD_SCHEMAS.unit && ACKS.FIELD_SCHEMAS.unit.adminCreate === 'schemaForm' &&
   ACKS.FIELD_SCHEMAS.army && ACKS.FIELD_SCHEMAS.army.adminCreate === 'schemaForm');
const eliteRule = ACKS.lookupHouseRule('elite-troops');
ok('elite-troops registered, military category, default OFF', !!eliteRule && eliteRule.category === 'military' &&
   eliteRule.default !== true && ACKS.isHouseRuleEnabled({ houseRules: {} }, 'elite-troops') === false);
ok('the military house-rule category exists', ACKS.HOUSERULE_CATEGORIES.some(c => c.id === 'military'));

section('MONSTER_CATALOG military fields (MM secondary characteristics)');
const bandit = ACKS.findMonster('bandit');
ok('bandit: BR 0.012 (the E10 plan value) / unit 1.5 / supply 0.5gp', bandit.battleRating === 0.012 &&
   bandit.battleRatingUnit === 1.5 && bandit.supplyCostWeekly === 0.5 && bandit.supplyCarnivorous === false);
ok('wolf: carnivorous 2gp', ACKS.findMonster('common-wolf').supplyCostWeekly === 2 && ACKS.findMonster('common-wolf').supplyCarnivorous === true);
ok('construct (hungerless): supply 0', ACKS.findMonster('amber-golem').supplyCostWeekly === 0);
ok('full BR coverage (284/284)', ACKS.MONSTER_CATALOG.filter(m => typeof m.battleRating === 'number').length === 284);
ok('multi-kit races carry the LOW end (goblin 0.005 = its troop-table light infantry)',
   ACKS.findMonster('goblin').battleRating === 0.005 &&
   ACKS.findMonster('goblin').battleRating === ACKS.findTroopType('light-infantry', { race: 'goblin' }).brPerCreature);

section('createArmy / muster / disbandArmy (the Action + Admin verb engine)');
{
  const camp = {
    currentTurn: 4,
    characters: [{ schemaVersion: 2, id: 'chr-cmd', name: 'Aelric', alive: true }],
    domains: [{ id: 'dom-a', name: 'March' }],
    journeys: [], armies: [], units: []
  };
  for(const [id, n] of [['unit-1', 'Foot'], ['unit-2', 'Bows'], ['unit-3', 'Horse']]){
    ACKS.stationUnit(camp, ACKS.blankUnit({ id, displayName: n, unitTypeKey: 'light-infantry', count: 60, brPerSoldier: 0.01 }), { kind: 'domain-garrison', id: 'dom-a' });
  }
  ok('setup: 3 units in campaign.units, stationed (single home)', camp.units.length === 3 && ACKS.unitsStationedAt(camp, { kind: 'domain-garrison', id: 'dom-a' }).length === 3);

  const army = ACKS.createArmy(camp, { name: 'Field Army', leaderCharacterId: 'chr-cmd', currentHexId: 'hex-x', strategicStance: 'offensive', unitIds: ['unit-1', 'unit-2', 'unit-3'] });
  ok('createArmy pushes to campaign.armies', camp.armies.length === 1 && camp.armies[0] === army);
  ok('army carries name/leader/hex/stance', army.name === 'Field Army' && army.leaderCharacterId === 'chr-cmd' && army.currentHexId === 'hex-x' && army.strategicStance === 'offensive');
  ok('stationed units read via armyUnits', ACKS.armyUnits(camp, army).length === 3);
  ok('stationing PULLED the units out of the garrison (re-stationed to the army)', ACKS.unitsStationedAt(camp, { kind: 'domain-garrison', id: 'dom-a' }).length === 0 && camp.units.every(u => u.stationedAt && u.stationedAt.kind === 'army'));
  ok('auto Main Body division led by the commander holds the roster', army.divisions.length === 1 && army.divisions[0].name === 'Main Body' && army.divisions[0].commanderCharacterId === 'chr-cmd' && army.divisions[0].unitIds.length === 3);
  ok('history stamps a mustered entry', army.history.some(h => h.type === 'mustered'));
  ok('createArmy is id-stable (idempotent)', ACKS.createArmy(camp, { id: army.id }) === army && camp.armies.length === 1);

  const blank = ACKS.createArmy(camp, { name: 'New Army' });
  ok('blank army (Admin verb): no leader, no division', camp.armies.length === 2 && blank.leaderCharacterId === null && blank.divisions.length === 0 && blank.name === 'New Army');

  const small = ACKS.createArmy(camp, { name: 'Patrol', leaderCharacterId: 'chr-cmd' });
  ACKS.stationUnit(camp, ACKS.blankUnit({ id: 'unit-s', displayName: 'Scouts', unitTypeKey: 'light-cavalry', count: 20 }), { kind: 'army', id: small.id });
  ok('validateArmyOrganization flags under-3-units (advisory)', ACKS.validateArmyOrganization(camp, small).some(f => f.code === 'under-3-units'));

  const before = camp.armies.length;
  ACKS.disbandArmy(camp, army.id);
  ok('disbandArmy removes the army', camp.armies.length === before - 1 && !ACKS.findArmy(camp, army.id));
  ok('disbanded units RETURN to their auto-captured home garrison (mustered from dom-a → back to dom-a)', (() => {
    const u = camp.units.find(x => x.id === 'unit-1');
    return !!u && u.homeDomainId === 'dom-a' && u.stationedAt && u.stationedAt.kind === 'domain-garrison' && u.stationedAt.id === 'dom-a';
  })());
}

section('call-up / rally-to-muster (the hard-constraint reinforcement — units march in, no teleport)');
{
  const c = { currentTurn: 3, currentDayInMonth: 1, characters: [], journeys: [], armies: [], units: [],
    domains: [{ id: 'dom-far', name: 'Far Hold', garrison: { units: [] } }],
    hexes: [{ id: 'hex-muster', domainId: null, coord: { q: 0, r: 0 }, terrain: 'grassland' },
            { id: 'hex-far', domainId: 'dom-far', coord: { q: 3, r: 0 }, terrain: 'grassland' }] };
  ACKS.stationUnit(c, ACKS.blankUnit({ id: 'unit-far', displayName: 'Far Bows', unitTypeKey: 'longbowman', count: 60, brPerSoldier: 0.02 }), { kind: 'domain-garrison', id: 'dom-far' });
  ok('unitCurrentHexId resolves a garrison unit to its domain seat', ACKS.unitCurrentHexId(c, c.units[0]) === 'hex-far');
  ok('unitMarchMilesPerDay reads the troop daily move (longbowman 18)', ACKS.unitMarchMilesPerDay(c.units[0]) === 18);

  const army = ACKS.createArmy(c, { name: 'Muster Host', leaderCharacterId: 'chr-x', currentHexId: 'hex-muster' });
  const r = ACKS.callUpUnit(c, 'unit-far', army.id);
  ok('callUpUnit on a DISTANT unit plots a rally march', r.action === 'marching' && !!r.journeyId);
  ok('the called-up unit LEAVES its garrison (un-stationed — marched out)', c.units[0].stationedAt === null && c.domains[0].garrison.units.length === 0);
  ok('it is NOT in the army\'s present strength yet', ACKS.armyUnits(c, army).length === 0);
  ok('rallyingToArmyId marks it incoming', c.units[0].rallyingToArmyId === army.id && c.units[0].rallyJourneyId === r.journeyId);
  const inc = ACKS.armyIncomingUnits(c, army);
  ok('armyIncomingUnits reports it with distance (3 hexes / 18 mi / 1 day)', inc.length === 1 && inc[0].hexesRemaining === 3 && inc[0].milesRemaining === 18 && inc[0].daysRemaining === 1 && inc[0].fromHexId === 'hex-far');

  ACKS.commitDayTick(c, ACKS.proposeDayTick(c, {}));
  ok('on arrival the unit falls in (stationed to the army, markers cleared)', c.units[0].stationedAt && c.units[0].stationedAt.kind === 'army' && c.units[0].rallyingToArmyId == null && c.units[0].rallyJourneyId == null);
  ok('it now counts in the army strength', ACKS.armyUnits(c, army).length === 1 && ACKS.armyIncomingUnits(c, army).length === 0);

  // a CO-LOCATED unit joins at once (no march)
  ACKS.stationUnit(c, ACKS.blankUnit({ id: 'unit-here', displayName: 'Local Foot', unitTypeKey: 'light-infantry', count: 60 }), { kind: 'hex', id: 'hex-muster' });
  const r2 = ACKS.callUpUnit(c, 'unit-here', army.id);
  ok('callUpUnit on a CO-LOCATED unit joins at once (no journey)', r2.action === 'joined' && c.units.find(u => u.id === 'unit-here').stationedAt.kind === 'army');

  // createArmy with callUpUnitIds marches distant units in
  ACKS.stationUnit(c, ACKS.blankUnit({ id: 'unit-far2', displayName: 'Far Horse', unitTypeKey: 'light-cavalry', count: 30 }), { kind: 'domain-garrison', id: 'dom-far' });
  const army2 = ACKS.createArmy(c, { name: 'Second Host', leaderCharacterId: 'chr-y', currentHexId: 'hex-muster', callUpUnitIds: ['unit-far2'] });
  ok('createArmy callUpUnitIds marches distant units in (incoming, not present)', ACKS.armyIncomingUnits(c, army2).length === 1 && ACKS.armyUnits(c, army2).length === 0);
}

section('unit home garrison (2026-06-14) — default station + return-on-task-end');
{
  const c = { currentTurn: 5, currentDayInMonth: 1,
    characters: [{ schemaVersion: 2, id: 'chr-r', name: 'Roric', alive: true }],
    domains: [{ id: 'dom-h', name: 'Hold', rulerCharacterId: 'chr-r', garrison: { units: [] } },
              { id: 'dom-o', name: 'Other', garrison: { units: [] } }],
    journeys: [], armies: [], units: [],
    hexes: [{ id: 'hex-seat', domainId: 'dom-h', coord: { q: 0, r: 0 }, terrain: 'grassland' },
            { id: 'hex-keep', domainId: 'dom-h', coord: { q: 1, r: 0 }, terrain: 'hills' },
            { id: 'hex-free', domainId: null,   coord: { q: 5, r: 0 }, terrain: 'grassland' }] };

  // setUnitHome — validation, set, clear
  const u = ACKS.stationUnit(c, ACKS.blankUnit({ id: 'unit-h', displayName: 'Foot', unitTypeKey: 'light-infantry', count: 60 }), { kind: 'domain-garrison', id: 'dom-h' });
  const sr = ACKS.setUnitHome(c, 'unit-h', 'hex-keep');
  ok('setUnitHome accepts a hex inside a domain', sr.ok === true && u.homeHexId === 'hex-keep' && u.homeDomainId === 'dom-h');
  ok('setUnitHome stamps a home-set history entry', u.history.some(h => h.type === 'home-set'));
  ok('setUnitHome snaps the map hint to the home when not in the field', u.stationedAtHexId === 'hex-keep');
  const bad = ACKS.setUnitHome(c, u, 'hex-free');
  ok('setUnitHome rejects a hex NOT inside a domain', bad.ok === false && bad.reason === 'hex-not-in-domain');
  ok('setUnitHome rejects an unknown hex', ACKS.setUnitHome(c, u, 'hex-nope').reason === 'no-hex');
  ok('setUnitHome(null) clears the home', ACKS.setUnitHome(c, u, null).cleared === true && u.homeHexId === null);

  // unitHomeDomainId resolution order
  ok('unitHomeDomainId reads homeDomainId first', ACKS.unitHomeDomainId(c, { homeDomainId: 'dom-o' }) === 'dom-o');
  ok('unitHomeDomainId falls back to the garrison station', ACKS.unitHomeDomainId(c, { stationedAt: { kind: 'domain-garrison', id: 'dom-h' } }) === 'dom-h');
  ok('unitHomeDomainId derives from the home hex', ACKS.unitHomeDomainId(c, { homeHexId: 'hex-keep' }) === 'dom-h');
  ok('unitHomeDomainId is null for a domain-less unit', ACKS.unitHomeDomainId(c, { stationedAt: { kind: 'hex', id: 'hex-free' } }) === null);

  // auto-capture on leaving the garrison, then return on disband
  const army = ACKS.createArmy(c, { name: 'Sortie', leaderCharacterId: 'chr-r', currentHexId: 'hex-seat', unitIds: ['unit-h'] });
  ok('mustering auto-captures the garrison as home (homeHexId = the seat hex)', u.homeHexId === 'hex-seat' && u.homeDomainId === 'dom-h' && u.stationedAt.kind === 'army');
  ACKS.disbandArmy(c, army.id);
  ok('disband AT home returns the unit to its garrison instantly (stationed + hint snapped)', u.stationedAt.kind === 'domain-garrison' && u.stationedAt.id === 'dom-h' && u.stationedAtHexId === 'hex-seat');
  ok('disband stamps a returned-home history entry', u.history.some(h => h.type === 'returned-home'));

  // return MARCH — disbanded AWAY from home, the unit marches back (not a teleport)
  const exped = ACKS.createArmy(c, { name: 'Expedition', leaderCharacterId: 'chr-r', currentHexId: 'hex-free' });
  const w = ACKS.blankUnit({ id: 'unit-w', displayName: 'Wardens', unitTypeKey: 'light-infantry', count: 50, homeHexId: 'hex-keep', homeDomainId: 'dom-h' });
  ACKS.stationUnit(c, w, { kind: 'army', id: exped.id });           // campaigning with the expedition at hex-free; home is hex-keep
  ACKS.disbandArmy(c, exped.id);
  const wj = (c.journeys || []).find(j => j && j.unitId === 'unit-w' && j.unitReturnHome);
  ok('disband AWAY from home plots a return MARCH (a unit journey home), not a teleport',
     !!wj && wj.destinationHexId === 'hex-keep' && wj.status === 'in-transit' && w.stationedAt === null && w.returnJourneyId === wj.id);
  ok('the unit stamps a marching-home history entry', w.history.some(h => h.type === 'marching-home'));
  let guard = 0;
  while(w.returnJourneyId && guard++ < 15){ ACKS.commitDayTick(c, ACKS.proposeDayTick(c, {})); }
  ok('on arrival the unit falls into its home garrison (it marched home, not teleported)',
     w.stationedAt && w.stationedAt.kind === 'domain-garrison' && w.stationedAt.id === 'dom-h' && w.stationedAtHexId === 'hex-keep' && w.returnJourneyId === null);

  // a unit mustered from no garrison keeps the prior homeless-on-disband behaviour
  const v = ACKS.stationUnit(c, ACKS.blankUnit({ id: 'unit-merc', displayName: 'Sellswords', unitTypeKey: 'light-infantry', count: 40 }), { kind: 'hex', id: 'hex-free' });
  const army2 = ACKS.createArmy(c, { name: 'Free Company', leaderCharacterId: 'chr-r', currentHexId: 'hex-free', unitIds: ['unit-merc'] });
  ok('a unit mustered from no garrison captures no home', !v.homeHexId && !v.homeDomainId);
  ACKS.disbandArmy(c, army2.id);
  ok('a home-less unit disbands UNSTATIONED (re-musterable, as before)', v.stationedAt === null);
}

// ─────────────────────────────────────────────────────────────────────────────
section('add / remove a unit from an army (the Garrison-table membership verbs, 2026-06-17)');
{
  const c = { currentTurn: 4, currentDayInMonth: 1,
    characters: [{ schemaVersion: 2, id: 'chr-cmd', name: 'Cmdr', alive: true }],
    domains: [{ id: 'dom-a', name: 'Hold', rulerCharacterId: 'chr-cmd', garrison: { units: [] } }],
    journeys: [], armies: [], units: [],
    hexes: [{ id: 'hex-seat', domainId: 'dom-a', coord: { q: 0, r: 0 }, terrain: 'grassland' },
            { id: 'hex-away', domainId: 'dom-a', coord: { q: 4, r: 0 }, terrain: 'grassland' }] };
  const army = ACKS.createArmy(c, { name: 'Field Host', leaderCharacterId: 'chr-cmd', currentHexId: 'hex-seat' });
  ok('a fresh army (no roster) has no units + no divisions', ACKS.armyUnits(c, army).length === 0 && (army.divisions || []).length === 0);
  const uFoot = ACKS.stationUnit(c, ACKS.blankUnit({ id: 'unit-foot', displayName: 'Foot', unitTypeKey: 'light-infantry', count: 60 }), { kind: 'domain-garrison', id: 'dom-a' });

  // armiesAtHex — the UI's co-located-army finder
  ok('armiesAtHex finds the army at the seat, none away', ACKS.armiesAtHex(c, 'hex-seat').length === 1 && ACKS.armiesAtHex(c, 'hex-away').length === 0);
  ok('the garrison unit sits at the seat (co-located with the army)', ACKS.unitCurrentHexId(c, uFoot) === 'hex-seat');

  // addUnitToArmy — co-located join + division placement
  const ar = ACKS.addUnitToArmy(c, 'unit-foot', army.id);
  ok('addUnitToArmy: ok + stationed to the army', ar.ok === true && uFoot.stationedAt.kind === 'army' && uFoot.stationedAt.id === army.id);
  ok('addUnitToArmy slots it into a Main Body division (org chart agrees with stationedAt)',
     !!ACKS.armyDivisionForUnit(army, 'unit-foot') && army.divisions.find(d => d.role === 'main').unitIds.includes('unit-foot'));
  ok('it now counts in the army strength', ACKS.armyUnits(c, army).length === 1);
  ok('addUnitToArmy stamps unit + army history', uFoot.history.some(h => h.type === 'joined-army') && army.history.some(h => h.type === 'unit-joined'));
  ok('addUnitToArmy refuses a unit already in the army', ACKS.addUnitToArmy(c, 'unit-foot', army.id).reason === 'already-in-army');

  // not-co-located refusal (RR — no teleport; the army-card call-up marches distant troops in)
  const uFar = ACKS.stationUnit(c, ACKS.blankUnit({ id: 'unit-far', displayName: 'Far Foot', unitTypeKey: 'light-infantry', count: 50 }), { kind: 'hex', id: 'hex-away' });
  ok('addUnitToArmy refuses a unit NOT at the army\'s hex', ACKS.addUnitToArmy(c, 'unit-far', army.id).reason === 'not-co-located' && uFar.stationedAt.kind === 'hex');

  // removeUnitFromArmy — LEFT WHERE THE ARMY STANDS (not marched home)
  const rr = ACKS.removeUnitFromArmy(c, 'unit-foot');
  ok('removeUnitFromArmy: ok + left at the army\'s hex as a free unit (NOT marched home)',
     rr.ok === true && rr.leftAtHexId === 'hex-seat' && uFoot.stationedAt.kind === 'hex' && uFoot.stationedAt.id === 'hex-seat');
  ok('removed unit drops out of the army strength', ACKS.armyUnits(c, army).length === 0);
  ok('removed unit is pulled from the division org chart', !ACKS.armyDivisionForUnit(army, 'unit-foot'));
  ok('removeUnitFromArmy plots NO return journey (left in place, not recalled)', !(c.journeys || []).some(j => j && j.unitId === 'unit-foot'));
  ok('removeUnitFromArmy stamps unit + army history', uFoot.history.some(h => h.type === 'left-army') && army.history.some(h => h.type === 'unit-removed'));
  ok('the army survives empty (a husk the GM may disband)', c.armies.some(a => a.id === army.id));
  ok('removeUnitFromArmy refuses a unit not in an army', ACKS.removeUnitFromArmy(c, 'unit-far').reason === 'not-in-army');

  // a leaderless army stations the unit (it fights) without inventing a division
  const free = ACKS.createArmy(c, { name: 'Free Band', currentHexId: 'hex-seat' });   // no leader
  const ar2 = ACKS.addUnitToArmy(c, 'unit-foot', free.id);   // unit-foot was just left at hex-seat
  ok('addUnitToArmy to a leaderless army stations it (fights) without forcing a division',
     ar2.ok === true && ACKS.armyUnits(c, free).length === 1 && (free.divisions || []).length === 0);

  // marching-in (rallyingToArmyId) → remove CANCELS the call-up + falls home instantly
  const cc = { currentTurn: 2, currentDayInMonth: 1, characters: [{ schemaVersion: 2, id: 'chr-z', alive: true }],
    domains: [{ id: 'dom-z', name: 'Z', garrison: { units: [] } }], journeys: [], armies: [], units: [],
    hexes: [{ id: 'hex-muster', domainId: null, coord: { q: 0, r: 0 }, terrain: 'grassland' },
            { id: 'hex-zseat', domainId: 'dom-z', coord: { q: 3, r: 0 }, terrain: 'grassland' }] };
  ACKS.stationUnit(cc, ACKS.blankUnit({ id: 'unit-march', displayName: 'Marchers', unitTypeKey: 'longbowman', count: 60 }), { kind: 'domain-garrison', id: 'dom-z' });
  const zarmy = ACKS.createArmy(cc, { name: 'Z Host', leaderCharacterId: 'chr-z', currentHexId: 'hex-muster' });
  const cu = ACKS.callUpUnit(cc, 'unit-march', zarmy.id);
  ok('the unit is marching in (rallying, journey live)', cu.action === 'marching' && cc.units[0].rallyingToArmyId === zarmy.id);
  const rrm = ACKS.removeUnitFromArmy(cc, 'unit-march');
  ok('removeUnitFromArmy on a marching unit cancels the call-up', rrm.ok === true && rrm.cancelledRally === true && cc.units[0].rallyingToArmyId == null);
  ok('… the rally journey is stopped (disbanded)', (cc.journeys || []).find(j => j && j.id === cu.journeyId).status === 'disbanded');
  ok('… and the unit falls home to its garrison at once', cc.units[0].stationedAt && cc.units[0].stationedAt.kind === 'domain-garrison' && cc.units[0].stationedAt.id === 'dom-z');
}

// ─────────────────────────────────────────────────────────────────────────────
section('march a garrison unit (the Garrison-table "March" verb, 2026-06-17)');
{
  const c = { currentTurn: 4, currentDayInMonth: 1,
    characters: [{ schemaVersion: 2, id: 'chr-m', name: 'Mcmd', alive: true }],
    domains: [{ id: 'dom-m', name: 'March Hold', rulerCharacterId: 'chr-m', garrison: { units: [] } }],
    journeys: [], armies: [], units: [],
    hexes: [{ id: 'hex-m-seat', domainId: 'dom-m', coord: { q: 0, r: 0 }, terrain: 'grassland' },
            { id: 'hex-m-near', domainId: 'dom-m', coord: { q: 1, r: 0 }, terrain: 'grassland' },
            { id: 'hex-m-far',  domainId: 'dom-m', coord: { q: 5, r: 0 }, terrain: 'grassland' }] };
  const u = ACKS.stationUnit(c, ACKS.blankUnit({ id: 'unit-m', displayName: 'Marchers', unitTypeKey: 'light-infantry', count: 60 }), { kind: 'domain-garrison', id: 'dom-m' });
  ok('the unit starts in its garrison at the seat', ACKS.unitCurrentHexId(c, u) === 'hex-m-seat');

  // startUnitMarch — the free march (a Journey at unit scale)
  const r = ACKS.startUnitMarch(c, 'unit-m', { destinationHexId: 'hex-m-far', pace: 'normal' });
  ok('startUnitMarch: ok + a journey is created', r.ok === true && !!r.journey);
  const jm = r.journey;
  ok('the journey is a unit march (unitId + unitMarch), in transit', jm.unitId === 'unit-m' && jm.unitMarch === true && jm.status === 'in-transit');
  ok('it runs from the unit\'s location to the chosen destination', jm.startHexId === 'hex-m-seat' && jm.destinationHexId === 'hex-m-far');
  ok('the unit leaves its garrison (un-stationed — troops take the road) + marchJourneyId set', u.stationedAt == null && u.marchJourneyId === jm.id);
  ok('home is captured for the return trip', u.homeDomainId === 'dom-m');
  ok('startUnitMarch stamps unit history', u.history.some(h => h.type === 'march-started'));
  ok('groupForJourney resolves the unit (Detail panel is unit-scale → "the unit\'s march pace", no supply)', ACKS.groupForJourney(c, jm) === u && ACKS.groupKindOf(u) === 'unit');
  ok('the marching unit stays home-attributed to its domain (still in the Garrison list)', ACKS.unitHomeDomainId(c, u) === 'dom-m');

  // guards
  ok('startUnitMarch refuses a unit already marching', ACKS.startUnitMarch(c, 'unit-m', { destinationHexId: 'hex-m-near' }).reason === 'already-marching');
  const und = ACKS.stationUnit(c, ACKS.blankUnit({ id: 'unit-mnd', displayName: 'Idle', unitTypeKey: 'light-infantry', count: 10 }), { kind: 'domain-garrison', id: 'dom-m' });
  ok('startUnitMarch refuses with no destination', ACKS.startUnitMarch(c, 'unit-mnd', {}).reason === 'no-destination');

  // already-there + in-army guards
  const u2 = ACKS.stationUnit(c, ACKS.blankUnit({ id: 'unit-m2', displayName: 'Stayers', unitTypeKey: 'light-infantry', count: 40 }), { kind: 'hex', id: 'hex-m-near' });
  ok('startUnitMarch refuses marching to the unit\'s own hex', ACKS.startUnitMarch(c, 'unit-m2', { destinationHexId: 'hex-m-near' }).reason === 'already-there');
  ACKS.createArmy(c, { name: 'Host', leaderCharacterId: 'chr-m', currentHexId: 'hex-m-near', unitIds: ['unit-m2'] });
  ok('startUnitMarch refuses a unit in a field army (it moves with the army)', ACKS.startUnitMarch(c, 'unit-m2', { destinationHexId: 'hex-m-far' }).reason === 'in-army');

  // stopUnitMarch — halt where it stands
  const sr = ACKS.stopUnitMarch(c, 'unit-m');
  ok('stopUnitMarch: ok + the unit halts at a hex + marchJourneyId cleared', sr.ok === true && u.stationedAt && u.stationedAt.kind === 'hex' && !u.marchJourneyId);
  ok('… the march journey is aborted', (c.journeys || []).find(j => j && j.id === jm.id).status === 'aborted');
  ok('stopUnitMarch refuses a unit that is not marching', ACKS.stopUnitMarch(c, 'unit-m2').reason === 'not-marching');

  // arrival — drive a fresh 1-hex garrison march to its destination via the journey day-tick
  const u3 = ACKS.stationUnit(c, ACKS.blankUnit({ id: 'unit-m3', displayName: 'Movers', unitTypeKey: 'light-infantry', count: 60 }), { kind: 'domain-garrison', id: 'dom-m' });
  const r3 = ACKS.startUnitMarch(c, 'unit-m3', { destinationHexId: 'hex-m-near', pace: 'normal' });
  let guard = 0;
  while(c.journeys.find(j => j.id === r3.journey.id).status === 'in-transit' && guard++ < 8){
    const p = ACKS.proposeJourneyDay(c, { dayInMonth: 1, rng: () => 0.5 });
    const rec = (p.pendingRecords || []).find(x => x.journeyId === r3.journey.id);
    if(!rec) break;
    ACKS.commitJourneyRecord(c, rec);
  }
  const u3now = c.units.find(x => x.id === 'unit-m3');
  ok('a unit march ARRIVES + halts the unit at the destination hex (the free-march arrival branch)',
     r3.journey.status === 'arrived' && u3now.stationedAt && u3now.stationedAt.kind === 'hex' && u3now.stationedAt.id === 'hex-m-near');
  ok('marchJourneyId cleared on arrival', !u3now.marchJourneyId);
}

// ─────────────────────────────────────────────────────────────────────────────
section('garrison reaction (2026-06-14) — deploy a force to meet a domain incursion (JJ pp.104–106)');
{
  // A threatened realm: a seat hex (the default rally) + the hex the band stands on, both in
  // dom-r; vagaries + persistent-wandering OFF so only the army marches (slot 30) and the
  // military consumer resolves (slot 88). The band is a real catalog monster (orc) so it has
  // a priced platoon BR. light-infantry ×120 platoon BR = 4.8; orc ×8 = 0.25 (weak); ×400 = 16.
  function mkReaction(o){
    o = o || {};
    const bandHexId = o.bandHexId || 'hex-band';
    const c = { currentTurn: 3, currentDayInMonth: 1, eventLog: [],
      houseRules: { 'persistent-wandering-monsters': { enabled: false }, 'vagaries-of-incursion': { enabled: false } },
      characters: [{ schemaVersion: 2, id: 'chr-cap', name: 'Captain Vael', alive: true, currentHexId: 'hex-seat', class: 'Fighter', level: 9, abilities: { STR: 13, INT: 10, WIL: 10, DEX: 12, CON: 12, CHA: 13 } }],
      domains: [{ id: 'dom-r', name: 'March', rulerCharacterId: 'chr-cap', garrison: { units: [] }, demographics: { peasantFamilies: 500, morale: 0 } }],
      journeys: [], armies: [], units: [], battles: [], groups: [],
      hexes: [{ id: 'hex-seat', domainId: 'dom-r', coord: { q: 0, r: 0 }, terrain: 'grassland' },
              { id: 'hex-band', domainId: 'dom-r', coord: { q: 1, r: 0 }, terrain: 'hills' },
              { id: 'hex-far',  domainId: 'dom-r', coord: { q: 7, r: 0 }, terrain: 'grassland' }] };
    const n = (o.garrisonUnits != null) ? o.garrisonUnits : 1;
    for(let i = 0; i < n; i++){
      ACKS.stationUnit(c, ACKS.blankUnit({ id: 'unit-g' + i, displayName: 'Foot ' + i, unitTypeKey: 'light-infantry',
        count: (o.garrisonCount != null) ? o.garrisonCount : 120, homeHexId: 'hex-seat', homeDomainId: 'dom-r' }),
        { kind: 'domain-garrison', id: 'dom-r' });
    }
    const band = ACKS.blankGroup({ id: 'grp-threat', name: 'Orc raiders',
      groupTemplate: { monsterCatalogKey: (o.catalogKey !== undefined ? o.catalogKey : 'orc'), creatureTypes: ['beastman', 'humanoid'], hitDice: '1' },
      count: (o.count != null) ? o.count : 8, currentHexId: bandHexId, currentDomainId: 'dom-r', lifecycleState: 'wild' });
    band.incursion = { domainId: 'dom-r', attitude: o.attitude || 'unfriendly', disposition: (o.lingering === false ? 'migrating' : 'lingering'),
      fullStrength: false, treasureType: '', rulerAware: true, monstersIntel: false, arrivedAtTurn: 3 };
    band.wanderState = { coord: null, lastCoord: null, mileRemainder: 0, mode: null, destLairId: null, dissolveOnArrival: false, lastDomainId: 'dom-r', halted: true };
    c.groups.push(band);
    return c;
  }
  const allIds = n => Array.from({ length: n }, (_, i) => 'unit-g' + i);

  // ── garrisonReactionPreview (pure BR + RAW outcome) ──
  const cWeak = mkReaction({ attitude: 'unfriendly', count: 8, garrisonUnits: 1 });
  const pWeak = ACKS.garrisonReactionPreview(cWeak, 'grp-threat', ['unit-g0']);
  ok('preview: forceBr = the chosen units’ platoon BR (light-inf ×120 → 4.8)', Math.abs(pWeak.forceBr - 4.8) < 0.001, JSON.stringify(pWeak));
  ok('preview: bandBr = orc ×8 platoon (0.25)', Math.abs(pWeak.bandBr - 0.25) < 0.001);
  ok('preview: weak unfriendly band → driven-off', pWeak.outcome === 'driven-off' && pWeak.effectiveAttitude === 'unfriendly' && pWeak.flips === false);
  ok('preview: attitudeLabel resolves to a label', typeof pWeak.attitudeLabel === 'string' && pWeak.attitudeLabel.length > 0);
  ok('preview: lines explain the verdict', Array.isArray(pWeak.lines) && pWeak.lines.some(l => /DRIVEN OFF/.test(l)));

  const cStrong = mkReaction({ attitude: 'unfriendly', count: 400, garrisonUnits: 1 });
  const pStrong = ACKS.garrisonReactionPreview(cStrong, 'grp-threat', ['unit-g0']);
  ok('preview: strong unfriendly band (BR ≥ force) → battle', pStrong.outcome === 'battle' && pStrong.bandBr >= pStrong.forceBr);

  const cHost = mkReaction({ attitude: 'hostile', count: 8, garrisonUnits: 1 });
  const pHost = ACKS.garrisonReactionPreview(cHost, 'grp-threat', ['unit-g0']);
  ok('preview: hostile band → always battle (even when weak)', pHost.outcome === 'battle' && pHost.flips === false);

  const cNeu = mkReaction({ attitude: 'neutral', count: 8, garrisonUnits: 1 });
  const pNeu = ACKS.garrisonReactionPreview(cNeu, 'grp-threat', ['unit-g0']);
  ok('preview: neutral band flips to unfriendly (JJ p.104), then by BR', pNeu.flips === true && pNeu.effectiveAttitude === 'unfriendly' && pNeu.outcome === 'driven-off' && pNeu.lines.some(l => /UNFRIENDLY/.test(l)));

  const cMerc = mkReaction({ attitude: 'mercantilist', count: 400, garrisonUnits: 1 });
  ok('preview: mercantilist + strong → flips, then battle', (() => { const p = ACKS.garrisonReactionPreview(cMerc, 'grp-threat', ['unit-g0']); return p.flips === true && p.outcome === 'battle'; })());

  const cGm = mkReaction({ attitude: 'unfriendly', count: 8, catalogKey: '__nope__' });
  const pGm = ACKS.garrisonReactionPreview(cGm, 'grp-threat', ['unit-g0']);
  ok('preview: unpriced band (no catalog BR) → priced-by-gm, bandBr null', pGm.outcome === 'priced-by-gm' && pGm.bandBr === null);
  ok('preview: null for a non-incursion group', ACKS.garrisonReactionPreview(cWeak, 'grp-nope', ['unit-g0']) === null);

  // ── reactionForceOrgFindings (the deploy modal's up-front army-org advisory, RR pp.435–437) ──
  const cOrg = mkReaction({ garrisonUnits: 3 });
  const f1 = ACKS.reactionForceOrgFindings(cOrg, { unitIds: ['unit-g0'], commanderCharacterId: 'chr-cap' });
  ok('org: 1 unit → under-3-units "has 1" (the headline)', f1.some(x => x.code === 'under-3-units' && /has 1/.test(x.text)), JSON.stringify(f1));
  const f3 = ACKS.reactionForceOrgFindings(cOrg, { unitIds: allIds(3), commanderCharacterId: 'chr-cap' });
  ok('org: 3 units → no under-3-units finding', !f3.some(x => x.code === 'under-3-units'));
  ok('org: a commander clears the no-leader finding', !f3.some(x => x.code === 'no-leader'));
  ok('org: no commander → no-leader finding', ACKS.reactionForceOrgFindings(cOrg, { unitIds: allIds(3), commanderCharacterId: null }).some(x => x.code === 'no-leader'));
  ok('org: no units + no commander → both findings (has 0)', (() => {
    const f = ACKS.reactionForceOrgFindings(cOrg, { unitIds: [], commanderCharacterId: null });
    return f.some(x => x.code === 'no-leader') && f.some(x => x.code === 'under-3-units' && /has 0/.test(x.text));
  })());
  // The proof that the modal twin matches the army card: deploy a 1-unit force, then
  // validateArmyOrganization on the mustered army reports the SAME under-3-units text.
  const cOrgDep = mkReaction({ bandHexId: 'hex-seat', garrisonUnits: 1 });
  const preText = ACKS.reactionForceOrgFindings(cOrgDep, { unitIds: ['unit-g0'], commanderCharacterId: 'chr-cap' }).find(x => x.code === 'under-3-units').text;
  const depOrg = ACKS.deployGarrisonReaction(cOrgDep, { groupId: 'grp-threat', unitIds: ['unit-g0'], commanderCharacterId: 'chr-cap', rallyHexId: 'hex-seat' });
  ok('org: modal twin matches the army card (same under-3-units text)', ACKS.validateArmyOrganization(cOrgDep, depOrg.army).map(x => x.text).includes(preText));

  // ── deployGarrisonReaction (muster + march) ──
  const cDep = mkReaction({ bandHexId: 'hex-band', attitude: 'unfriendly', count: 8, garrisonUnits: 1 });
  const dep = ACKS.deployGarrisonReaction(cDep, { groupId: 'grp-threat', unitIds: ['unit-g0'], commanderCharacterId: 'chr-cap', rallyHexId: 'hex-seat', stance: 'offensive' });
  ok('deploy: musters a reaction army marked against the band', dep.ok && dep.army && dep.army.reactionTargetGroupId === 'grp-threat' && dep.army.strategicStance === 'offensive');
  ok('deploy: stations the chosen units to the sally army', (ACKS.findUnit(cDep, 'unit-g0').stationedAt || {}).kind === 'army');
  ok('deploy: plots a march to the band when the rally ≠ the band hex', !!dep.journey && dep.journey.armyId === dep.army.id && dep.journey.destinationHexId === 'hex-band' && dep.journey.status === 'in-transit');
  ok('deploy: stamps a deployed-reaction history entry', dep.army.history.some(h => h.type === 'deployed-reaction'));

  const cCo = mkReaction({ bandHexId: 'hex-seat', attitude: 'unfriendly', count: 8 });
  const depCo = ACKS.deployGarrisonReaction(cCo, { groupId: 'grp-threat', unitIds: ['unit-g0'], rallyHexId: 'hex-seat' });
  ok('deploy: co-located (rally == band hex) → no march', depCo.ok && !depCo.journey);
  ok('domainSeatHexId: the ruler’s seat when he stands in the domain', ACKS.domainSeatHexId(cCo, cCo.domains[0]) === 'hex-seat');
  const depDef = ACKS.deployGarrisonReaction(mkReaction({ bandHexId: 'hex-band' }), { groupId: 'grp-threat', unitIds: ['unit-g0'] });
  ok('deploy: defaults the rally to the domain seat', depDef.ok && depDef.rallyHexId === 'hex-seat');
  ok('deploy: no units → {ok:false, no-units}', ACKS.deployGarrisonReaction(mkReaction({}), { groupId: 'grp-threat', unitIds: [] }).reason === 'no-units');
  ok('deploy: unknown band → {ok:false, no-band}', ACKS.deployGarrisonReaction(mkReaction({}), { groupId: 'grp-nope', unitIds: ['unit-g0'] }).reason === 'no-band');

  // ── awareness gate (RAW: a deliberate sally requires the ruler to have DETECTED the band — JJ p.103, RR p.452) ──
  const cUnaware = mkReaction({ bandHexId: 'hex-band', attitude: 'unfriendly', count: 8, garrisonUnits: 1 });
  cUnaware.groups.find(g => g.id === 'grp-threat').incursion.rulerAware = false;
  const depUnaware = ACKS.deployGarrisonReaction(cUnaware, { groupId: 'grp-threat', unitIds: ['unit-g0'], commanderCharacterId: 'chr-cap', rallyHexId: 'hex-seat' });
  ok('deploy: ruler unaware → {ok:false, ruler-unaware}', depUnaware.ok === false && depUnaware.reason === 'ruler-unaware', JSON.stringify(depUnaware));
  ok('deploy: ruler unaware → no army mustered', (cUnaware.armies || []).length === 0);
  ok('deploy: ruler unaware → the units stay home (not stationed to a sally army)', (ACKS.findUnit(cUnaware, 'unit-g0').stationedAt || {}).kind === 'domain-garrison');
  // aware (the fixture default) still deploys — the gate is specific to undetected bands
  const cAware = mkReaction({ bandHexId: 'hex-band', attitude: 'unfriendly', count: 8, garrisonUnits: 1 });
  ok('deploy: ruler aware → still deploys (ok)', ACKS.deployGarrisonReaction(cAware, { groupId: 'grp-threat', unitIds: ['unit-g0'], commanderCharacterId: 'chr-cap', rallyHexId: 'hex-seat' }).ok === true);
  // an unset rulerAware (pre-recon / GM-authored band) defaults to aware → not blocked (matches the display === false convention)
  const cUndef = mkReaction({ bandHexId: 'hex-band', attitude: 'unfriendly', count: 8, garrisonUnits: 1 });
  delete cUndef.groups.find(g => g.id === 'grp-threat').incursion.rulerAware;
  ok('deploy: rulerAware undefined → not blocked (defaults to aware)', ACKS.deployGarrisonReaction(cUndef, { groupId: 'grp-threat', unitIds: ['unit-g0'], rallyHexId: 'hex-seat' }).ok === true);

  // ── arrival resolution (the §6 engine gap) — driven off ──
  const cDrive = mkReaction({ bandHexId: 'hex-seat', attitude: 'unfriendly', count: 8, garrisonUnits: 1, garrisonCount: 120 });
  ACKS.deployGarrisonReaction(cDrive, { groupId: 'grp-threat', unitIds: ['unit-g0'], rallyHexId: 'hex-seat', commanderCharacterId: 'chr-cap' });
  const propD = ACKS.proposeDayTick(cDrive, {});
  const recD = (propD.pendingRecords || []).find(r => r.kind === 'army-band-contact');
  ok('arrival: a co-located reaction proposes an army-band-contact record', !!recD && recD.groupId === 'grp-threat' && recD.outcome === 'driven-off');
  ok('arrival: the record carries the BR comparison', recD && Math.abs(recD.forceBr - 4.8) < 0.001 && Math.abs(recD.bandBr - 0.25) < 0.001);
  ACKS.commitDayTick(cDrive, propD);
  const bandD = cDrive.groups.find(g => g.id === 'grp-threat');
  ok('driven-off: the band is repelled — off the hex, outcome stamped', bandD.currentHexId === null && bandD.wanderState === null && bandD.incursion.outcome === 'driven-off');
  ok('driven-off: army.reactionTargetGroupId cleared (mission done)', cDrive.armies[0].reactionTargetGroupId === null);
  ok('driven-off: the band no longer stands in the domain', ACKS.incursionBandsForDomain(cDrive, 'dom-r').length === 0);
  ok('driven-off: a domain-warfare event was logged', (cDrive.eventLog || []).some(e => e && e.event && e.event.kind === 'domain-warfare' && e.event.payload && e.event.payload.action === 'reaction-driven-off'));

  // ── arrival resolution — a real battle (hostile) ──
  const cBat = mkReaction({ bandHexId: 'hex-seat', attitude: 'hostile', count: 40, garrisonUnits: 1, garrisonCount: 60 });
  const depBat = ACKS.deployGarrisonReaction(cBat, { groupId: 'grp-threat', unitIds: ['unit-g0'], rallyHexId: 'hex-seat', commanderCharacterId: 'chr-cap', stance: 'offensive' });
  const propBat = ACKS.proposeDayTick(cBat, {});
  const recBat = (propBat.pendingRecords || []).find(r => r.kind === 'army-band-contact');
  ok('arrival: hostile band → outcome battle, with a pre-minted battle id', recBat && recBat.outcome === 'battle' && !!recBat.battleProposalId);
  ACKS.commitDayTick(cBat, propBat);
  const battle = (cBat.battles || []).find(b => b.id === recBat.battleProposalId);
  ok('battle: a W3 battle is created at platoon scale', !!battle && battle.scale === 'platoon');
  ok('battle: side A is the reaction army, side B is the band (groups)', battle && battle.sides.a.armyId === depBat.army.id && (battle.sides.b.groupIds || []).includes('grp-threat'));
  ok('battle: army.reactionBattleId stamps the re-fire guard', cBat.armies[0].reactionBattleId === recBat.battleProposalId);
  const propBat2 = ACKS.proposeDayTick(cBat, {});
  ok('battle: the reaction does not re-fire (one battle per reaction)', !(propBat2.pendingRecords || []).some(r => r.kind === 'army-band-contact'));

  // ── arrival resolution — neutral flips to unfriendly on deploy ──
  const cFlip = mkReaction({ bandHexId: 'hex-seat', attitude: 'neutral', count: 8, garrisonUnits: 1 });
  ACKS.deployGarrisonReaction(cFlip, { groupId: 'grp-threat', unitIds: ['unit-g0'], rallyHexId: 'hex-seat' });
  ACKS.commitDayTick(cFlip, ACKS.proposeDayTick(cFlip, {}));
  ok('neutral band: deploying flips it to unfriendly (JJ p.104)', cFlip.groups.find(g => g.id === 'grp-threat').incursion.attitude === 'unfriendly');

  // ── the full march path — sally marches over days, resolves on arrival (band 7 hexes off) ──
  const cMarch = mkReaction({ bandHexId: 'hex-far', attitude: 'unfriendly', count: 8, garrisonUnits: 1, garrisonCount: 120 });
  ACKS.deployGarrisonReaction(cMarch, { groupId: 'grp-threat', unitIds: ['unit-g0'], rallyHexId: 'hex-seat', commanderCharacterId: 'chr-cap' });
  const propM1 = ACKS.proposeDayTick(cMarch, {});
  ok('march path: tick 1 — still en route, no resolution yet', !(propM1.pendingRecords || []).some(r => r.kind === 'army-band-contact'));
  ACKS.commitDayTick(cMarch, propM1);
  let resolved = false, guard = 0;
  while(!resolved && guard++ < 20){
    const p = ACKS.proposeDayTick(cMarch, {});
    if((p.pendingRecords || []).some(r => r.kind === 'army-band-contact')) resolved = true;
    ACKS.commitDayTick(cMarch, p);
  }
  ok('march path: the sally marches to the band and resolves on arrival', resolved);
  ok('march path: the band is dealt with (driven off)', cMarch.groups.find(g => g.id === 'grp-threat').currentHexId === null);

  // ── recall → the units march home (the §7 foundation) ──
  const cRec = mkReaction({ bandHexId: 'hex-seat', attitude: 'unfriendly', count: 8, garrisonUnits: 1 });
  const depRec = ACKS.deployGarrisonReaction(cRec, { groupId: 'grp-threat', unitIds: ['unit-g0'], rallyHexId: 'hex-seat' });
  ACKS.commitDayTick(cRec, ACKS.proposeDayTick(cRec, {}));   // band driven off
  ACKS.recallReactionForce(cRec, depRec.army.id);
  ok('recall: disbands the sally force', !cRec.armies.some(a => a.id === depRec.army.id));
  ok('recall: returns the unit to its home garrison (it deployed from home)', (ACKS.findUnit(cRec, 'unit-g0').stationedAt || {}).kind === 'domain-garrison' && ACKS.findUnit(cRec, 'unit-g0').stationedAt.id === 'dom-r');

  // ── AUTO-CHASE (v2, JJ p.104) — the sally re-routes to follow a band that wanders ──
  // A contiguous authored hex row (hx0..hx5) so every march position is non-null. Wandering
  // is OFF, so the band only moves when the test moves it (deterministic — no rng dependence).
  function mkChase(o){
    o = o || {};
    const c = { currentTurn: 3, currentDayInMonth: 1, eventLog: [],
      houseRules: { 'persistent-wandering-monsters': { enabled: false }, 'vagaries-of-incursion': { enabled: false } },
      characters: [{ schemaVersion: 2, id: 'chr-cap', name: 'Captain Vael', alive: true, currentHexId: 'hx0', class: 'Fighter', level: 9, abilities: { STR: 13, INT: 10, WIL: 10, DEX: 12, CON: 12, CHA: 13 } }],
      domains: [{ id: 'dom-r', name: 'March', rulerCharacterId: 'chr-cap', garrison: { units: [] }, demographics: { peasantFamilies: 500, morale: 0 } }],
      journeys: [], armies: [], units: [], battles: [], groups: [],
      hexes: Array.from({ length: 6 }, (_, q) => ({ id: 'hx' + q, domainId: 'dom-r', coord: { q, r: 0 }, terrain: 'grassland' })) };
    ACKS.stationUnit(c, ACKS.blankUnit({ id: 'unit-g0', displayName: 'Foot', unitTypeKey: 'light-infantry', count: 120, homeHexId: 'hx0', homeDomainId: 'dom-r' }), { kind: 'domain-garrison', id: 'dom-r' });
    const band = ACKS.blankGroup({ id: 'grp-threat', name: 'Orc raiders',
      groupTemplate: { monsterCatalogKey: 'orc', creatureTypes: ['beastman', 'humanoid'], hitDice: '1' },
      count: (o.count != null) ? o.count : 8, currentHexId: o.bandHexId || 'hx5', currentDomainId: 'dom-r', lifecycleState: 'wild' });
    band.incursion = { domainId: 'dom-r', attitude: o.attitude || 'unfriendly', disposition: 'lingering', fullStrength: false, treasureType: '', rulerAware: true, monstersIntel: false, arrivedAtTurn: 3 };
    c.groups.push(band);
    return c;
  }
  const armyJourney = c => (c.journeys || []).find(j => j && c.armies[0] && j.armyId === c.armies[0].id) || null;
  const chaseRec = p => (p.pendingRecords || []).find(r => r.kind === 'army-band-chase') || null;

  // T1 — an in-transit march re-targets when the band moves off the destination (band 5 hexes
  // off; foot covers 4/day so day 1 ends en route at hx4, not arrived → the journey re-targets).
  const cMove = mkChase({ bandHexId: 'hx5' });
  ACKS.deployGarrisonReaction(cMove, { groupId: 'grp-threat', unitIds: ['unit-g0'], rallyHexId: 'hx0', commanderCharacterId: 'chr-cap' });
  cMove.groups[0].currentHexId = 'hx1';                         // the band doubled back (a "wander")
  const pMove = ACKS.proposeDayTick(cMove, {});
  const recMove = chaseRec(pMove);
  ok('auto-chase: a band off the march target proposes an army-band-chase record', !!recMove && recMove.groupId === 'grp-threat' && recMove.newDestinationHexId === 'hx1', JSON.stringify(recMove));
  ACKS.commitDayTick(cMove, pMove);
  ok('auto-chase: commit re-targets the march to the band’s hex', (armyJourney(cMove) || {}).destinationHexId === 'hx1' && armyJourney(cMove).status === 'in-transit' && !!cMove.armies[0].journeyId);
  ok('auto-chase: commit stamps a reaction-chase history entry on the army', cMove.armies[0].history.some(h => h.type === 'reaction-chase'));

  // T2 — a march toward a STATIONARY band on the destination produces no chase record.
  const cStat = mkChase({ bandHexId: 'hx5' });
  ACKS.deployGarrisonReaction(cStat, { groupId: 'grp-threat', unitIds: ['unit-g0'], rallyHexId: 'hx0' });
  ok('auto-chase: a march toward a stationary band proposes no chase record', !chaseRec(ACKS.proposeDayTick(cStat, {})));

  // T3 — an ARRIVED force resumes the pursuit (the re-link path): the band sits 1 hex off, so
  // the army arrives at the stale hex THIS tick (nulling army.journeyId); the chase finds the
  // journey by the id captured at propose, resumes it, and re-links army.journeyId.
  const cArr = mkChase({ bandHexId: 'hx1' });
  ACKS.deployGarrisonReaction(cArr, { groupId: 'grp-threat', unitIds: ['unit-g0'], rallyHexId: 'hx0', commanderCharacterId: 'chr-cap' });
  cArr.groups[0].currentHexId = 'hx4';                          // the band fled onward before the force arrived
  const pArr = ACKS.proposeDayTick(cArr, {});
  ok('auto-chase: an arriving force still proposes the chase', (chaseRec(pArr) || {}).newDestinationHexId === 'hx4');
  ACKS.commitDayTick(cArr, pArr);
  ok('auto-chase: the arrived force re-links its journey and resumes toward the band', !!cArr.armies[0].journeyId && (armyJourney(cArr) || {}).destinationHexId === 'hx4' && armyJourney(cArr).status === 'in-transit');

  // T4 — the re-routed pursuit converges to contact (the band wandered closer, mid-march).
  const cConv = mkChase({ bandHexId: 'hx5', attitude: 'unfriendly', count: 8 });
  ACKS.deployGarrisonReaction(cConv, { groupId: 'grp-threat', unitIds: ['unit-g0'], rallyHexId: 'hx0', commanderCharacterId: 'chr-cap' });
  cConv.groups[0].currentHexId = 'hx2';                         // wandered closer (one manual move; wandering OFF)
  let caught = false, cguard = 0;
  while(!caught && cguard++ < 20){
    const p = ACKS.proposeDayTick(cConv, {});
    if((p.pendingRecords || []).some(r => r.kind === 'army-band-contact')) caught = true;
    ACKS.commitDayTick(cConv, p);
  }
  ok('auto-chase: the re-routed pursuit converges to contact', caught);
  ok('auto-chase: the chased band is dealt with (driven off)', cConv.groups[0].currentHexId === null);

  // T5 — a band with no hex (off-map, e.g. driven off elsewhere) is not chased (recall instead).
  const cGone = mkChase({ bandHexId: 'hx5' });
  ACKS.deployGarrisonReaction(cGone, { groupId: 'grp-threat', unitIds: ['unit-g0'], rallyHexId: 'hx0' });
  cGone.groups[0].currentHexId = null;
  ok('auto-chase: an off-map band (no hex) proposes no chase record', !chaseRec(ACKS.proposeDayTick(cGone, {})));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=============================================');
console.log('military.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(failures.length){ console.log('FAILURES:'); failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
