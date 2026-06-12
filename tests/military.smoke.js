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
  'acks-engine-entity-registry.js', 'acks-engine-field-schemas.js', 'acks-engine-events.js', 'acks-engine-battles.js', 'acks-engine-subsystems.js'
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

section('stationUnit / disbandUnit — both homes, one object');
{
  const camp = { units: [], armies: [], characters: [{ id: 'chr-a', name: 'A' }], domains: [{ id: 'dom-a', name: 'A', garrison: { units: [] } }] };
  const u = ACKS.blankUnit({ unitTypeKey: 'light-infantry', count: 60 });
  ACKS.stationUnit(camp, u, { kind: 'domain-garrison', id: 'dom-a' });
  ok('stationed to garrison: first-class + mirror share the object',
     camp.units[0] === u && camp.domains[0].garrison.units[0] === u && u.stationedAt.kind === 'domain-garrison');
  ACKS.stationUnit(camp, u, { kind: 'character', id: 'chr-a' });
  ok('re-stationed to a character: garrison mirror drops it, company mirror gains it',
     camp.domains[0].garrison.units.length === 0 && camp.characters[0].mercenaryCompany.units[0] === u &&
     camp.units.length === 1);
  ACKS.stationUnit(camp, u, { kind: 'army', id: 'army-x' });
  ok('stationed to an army: no nested mirror (the army org chart owns it)',
     camp.characters[0].mercenaryCompany.units.length === 0 && camp.units[0] === u && u.stationedAt.kind === 'army');
  ACKS.disbandUnit(camp, u);
  ok('disbandUnit removes from every home', camp.units.length === 0);
}

section('migrateGarrisonUnitsToUnits — the reference-unified lift');
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
  ok('lifted unit IS the nested object (reference-unified)', lifted === camp.domains[0].garrison.units[0]);
  ok('gar- ids preserved (id stability)', lifted.id === 'gar-leg1');
  ok('stationedAt stamped from the home', lifted.stationedAt.kind === 'domain-garrison' && lifted.stationedAt.id === 'dom-l');
  const compU = camp.units.find(x => x.id === 'gar-comp1');
  ok('mercenary-company unit stationed to the character', compU && compU.stationedAt.kind === 'character' && compU.stationedAt.id === 'chr-cap');
  ok('military fields lazy-defaulted (stored wage/BR untouched)', lifted.race === 'man' && lifted.supplyState === 'supplied' &&
     Array.isArray(lifted.calamities) && lifted.brPerSoldier === 0.083 && lifted.monthlyWage === 12);
  ok('a unit without an id got one', camp.domains[0].garrison.units[1].id && camp.units.includes(camp.domains[0].garrison.units[1]));
  // idempotence
  const before = camp.units.length;
  ACKS.migrateGarrisonUnitsToUnits(camp);
  ok('idempotent re-run adds nothing', camp.units.length === before);
  // JSON round-trip re-unification (a save duplicates the shared objects)
  const reloaded = ACKS.migrateCampaign(JSON.parse(JSON.stringify(camp)));
  ok('a JSON round-trip re-unifies by id', reloaded.units.find(x => x.id === 'gar-leg1') === reloaded.domains[0].garrison.units[0]);
  ok('… and stays a serialization fixed point', JSON.stringify(ACKS.migrateCampaign(JSON.parse(JSON.stringify(reloaded)))) === JSON.stringify(reloaded));
}
{
  // reverse heal: a first-class unit with a garrison station missing from the mirror
  const camp = legacyCampaign();
  camp.units = [{ schemaVersion: 2, id: 'unit-solo', displayName: 'Solo', unitTypeKey: 'slinger', count: 10,
                  monthlyWage: 6, brPerSoldier: 0.01, stationedAt: { kind: 'domain-garrison', id: 'dom-l' } }];
  const m = ACKS.migrateCampaign(camp);
  ok('reverse pass pushes a stationed first-class unit into its mirror',
     m.domains[0].garrison.units.some(x => x && x.id === 'unit-solo'));
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

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=============================================');
console.log('military.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(failures.length){ console.log('FAILURES:'); failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
