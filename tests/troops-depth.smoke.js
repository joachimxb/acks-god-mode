// =============================================================================
// troops-depth.smoke.js — Phase 3 Military W7: troops depth (conscripts / militia /
//   training) + the F&D Call-to-Arms duty / Troops-favor materialization.
//
//   node tests/troops-depth.smoke.js   (or via `npm test`)
//
// Locks the RAW worked examples EXACT (ACKS II RR):
//   - Conscript Qualifying Number + Training and Equipment Time & Cost (RR p.431).
//   - Marcus's conscript cap (RR p.430): 1,000 families → 100; 1,200 → 120.
//   - Marcus's militia (RR p.432–433): 1,200 families → 240 militia · revenue as 960 ·
//     morale −2 · trained 120 heavy + 120 light → implicit garrison credit 2,160gp (RR p.341).
//   - Conscript/militia morale coupling (RR p.431/433): Steadfast/Stalwart +1, Apathetic/
//     Demoralized −1; Turbulent+ (morale ≤ −2) cannot levy (RR p.432).
//   - The F&D Call-to-Arms duty musters a vassal levy into the liege's host; the Troops favor
//     stations a wage-waived garrison under the vassal (RR pp.433–434 + p.348); revoke disbands.
// =============================================================================
'use strict';
const A = require('./_engine.js').load();

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(label + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('— ' + t); }

// ─────────────────────────────────────────────────────────────────────────────
section('Conscript Qualifying Number (RR p.431) — the human column + demi-human cells');
ok('light infantry: any conscript (120) for every race', A.conscriptQualifyingNumber('light-infantry', 'man') === 120 && A.conscriptQualifyingNumber('light-infantry', 'orc') === 120 && A.conscriptQualifyingNumber('light-infantry', 'dwarf') === 120);
ok('human heavy infantry 60 (50%)', A.conscriptQualifyingNumber('heavy-infantry', 'man') === 60);
ok('human slingers/bowmen/crossbowmen 60 (50%)', A.conscriptQualifyingNumber('slinger', 'man') === 60 && A.conscriptQualifyingNumber('bowman', 'man') === 60 && A.conscriptQualifyingNumber('crossbowman', 'man') === 60);
ok('human composite/longbowmen/light-cav 30 (25%)', A.conscriptQualifyingNumber('composite-bowman', 'man') === 30 && A.conscriptQualifyingNumber('longbowman', 'man') === 30 && A.conscriptQualifyingNumber('light-cavalry', 'man') === 30);
ok('human medium cav 20 (17%)', A.conscriptQualifyingNumber('medium-cavalry', 'man') === 20);
ok('human horse archers 15 (12.5%)', A.conscriptQualifyingNumber('horse-archers', 'man') === 15);
ok('human heavy cav 10 (8.5%)', A.conscriptQualifyingNumber('heavy-cavalry', 'man') === 10);
ok('human cataphract 6 (5%)', A.conscriptQualifyingNumber('cataphract-cavalry', 'man') === 6);
ok('dwarf heavy infantry 120 (all dwarves)', A.conscriptQualifyingNumber('heavy-infantry', 'dwarf') === 120);
ok('elf bowmen 120 / cataphract 12', A.conscriptQualifyingNumber('bowman', 'elf') === 120 && A.conscriptQualifyingNumber('cataphract-cavalry', 'elf') === 12);
ok('a race that cannot field a type → 0', A.conscriptQualifyingNumber('cataphract-cavalry', 'goblin') === 0 && A.conscriptQualifyingNumber('war-elephants', 'dwarf') === 0);

// ─────────────────────────────────────────────────────────────────────────────
section('Training and Equipment Time & Cost (RR p.431) — perTroop + the printed unit totals');
const tLight = A.trainingCostFor('light-infantry');
ok('light infantry: 1 mo, 88.5gp/troop, 10,620gp/unit', tLight.months === 1 && tLight.perTroopGp === 88.5 && tLight.unitGp === 10620);
const tHeavy = A.trainingCostFor('heavy-infantry');
ok('heavy infantry: 1 mo, 122gp/troop, 14,640gp/unit', tHeavy.months === 1 && tHeavy.perTroopGp === 122 && tHeavy.unitGp === 14640);
const tCat = A.trainingCostFor('cataphract-cavalry');
ok('cataphract: 12 mo, 1,244gp/troop, 74,640gp/unit', tCat.months === 12 && tCat.perTroopGp === 1244 && tCat.unitGp === 74640);
const tLCav = A.trainingCostFor('light-cavalry');
ok('light cavalry: 3 mo, 331gp/troop, 19,860gp/unit (60/unit)', tLCav.months === 3 && tLCav.perTroopGp === 331 && tLCav.unitGp === 19860);
const tEle = A.trainingCostFor('war-elephants');
ok('war elephants: 6 mo, 7,918gp/troop, 39,590gp/unit (5/unit)', tEle.months === 6 && tEle.perTroopGp === 7918 && tEle.unitGp === 39590);
const tWolf = A.trainingCostFor('wolf-riders');
ok('wolf riders: 6 mo, 1,767gp/troop, 106,020gp/unit', tWolf.months === 6 && tWolf.perTroopGp === 1767 && tWolf.unitGp === 106020);
ok('an untrainable type → null', A.trainingCostFor('untrained-levy') === null);
ok('trained light/heavy wage = the mercenary wage (6 / 12)', A.trainedTroopWage('light-infantry', 'man') === 6 && A.trainedTroopWage('heavy-infantry', 'man') === 12);
ok('trainableTroopTypes(man) includes light/heavy/cataphract', (() => { const s = new Set(A.trainableTroopTypes('man')); return s.has('light-infantry') && s.has('heavy-infantry') && s.has('cataphract-cavalry'); })());
// The RR p.433 Marcus example prices heavy 124 / light 94.5 (≠ this systematic table's 122 / 88.5) —
// a known RR-internal print inconsistency. The engine follows the TABLE; this asserts the divergence
// is understood (the example's arithmetic is internally consistent at its own per-troop numbers).
ok('table 120 heavy + 120 light = 25,260 (engine path)', 120 * tHeavy.perTroopGp + 120 * tLight.perTroopGp === 25260);
ok('p.433 example arithmetic (124/94.5) = 26,220 (documented print quirk)', 120 * 124 + 120 * 94.5 === 26220);

// ─────────────────────────────────────────────────────────────────────────────
section('Conscript & militia caps (RR pp.430, 432) — the Marcus examples');
function mkDomain(fam, morale, id){
  const d = A.blankDomain({ id: id || 'dom-m', name: 'March' });
  d.demographics.peasantFamilies = fam; d.demographics.morale = morale != null ? morale : 1;
  return d;
}
function mkCamp(domains, turn){
  return { schemaVersion: 2, currentTurn: turn || 1, houseRules: {}, domains, characters: [], units: [], armies: [],
           hexes: [], favorDutyObligations: [], vassalages: [], eventLog: [], pendingEvents: [], settlements: [] };
}
ok('conscriptLevyMax(1000) = 100', A.conscriptLevyMax(mkDomain(1000)) === 100);
ok('conscriptLevyMax(1200) = 120', A.conscriptLevyMax(mkDomain(1200)) === 120);
ok('militiaLevyMax(1200) = 240 (2 per 10)', A.militiaLevyMax(mkDomain(1200)) === 240);

// ─────────────────────────────────────────────────────────────────────────────
section('Levy setters — conscripts/militia as Units (RR pp.430–433)');
{
  const d = mkDomain(1200, 3, 'dom-c');   // Steadfast (+3) → +1 levy morale
  const camp = mkCamp([d], 5);
  const con = A.levyConscripts(camp, 'dom-c', { count: 100 });
  ok('levied 100 conscripts', con && con.count === 100 && con.source === 'conscript');
  ok('conscript untrained: 3gp wage, type untrained-levy', con.monthlyWage === 3 && con.unitTypeKey === 'untrained-levy');
  ok('conscript morale: −2 base + steadfast +1 (moraleAdjustment +1, loyalty +1)', con.moraleAdjustment === 1 && con.loyalty === 1);
  ok('conscript carries homeDomainId + calledUp + stationed in garrison', con.homeDomainId === 'dom-c' && con.calledUp === true && con.stationedAt && con.stationedAt.kind === 'domain-garrison');
  ok('conscriptCount reads it back', A.conscriptCount(camp, d) === 100);
  ok('in campaign.units AND the garrison mirror', camp.units.some(u => u.id === con.id) && (d.garrison.units || []).some(u => u.id === con.id));
  // over-cap clamps to remaining room (120 cap − 100 = 20), never rejects
  const more = A.levyConscripts(camp, 'dom-c', { count: 50 });
  ok('over-cap levy clamps to remaining 20', more && more.count === 20);
  ok('no room → null', A.levyConscripts(camp, 'dom-c', { count: 5 }) === null);
}
{
  const d = mkDomain(1200, 0, 'dom-a');   // Apathetic (0) → −1 levy morale
  const camp = mkCamp([d], 1);
  const con = A.levyConscripts(camp, 'dom-a', { count: 10 });
  ok('apathetic domain → −1 levy morale', con.moraleAdjustment === -1 && con.loyalty === -1);
}
{
  const turbulent = mkDomain(1200, -2, 'dom-t');   // Turbulent → cannot levy (RR p.432)
  const camp = mkCamp([turbulent], 1);
  ok('Turbulent (morale −2) blocks levying conscripts', A.levyConscripts(camp, 'dom-t', { count: 10 }) === null);
  ok('Turbulent (morale −2) blocks levying militia', A.levyMilitia(camp, 'dom-t', { count: 10 }) === null);
  ok('canLevyFromDomain false at morale −2', A.canLevyFromDomain(turbulent) === false);
}

// ─────────────────────────────────────────────────────────────────────────────
section('Militia — penalty + revenue + the RR p.433 Marcus garrison credit (2,160gp)');
{
  const d = mkDomain(1200, 1, 'dom-mil');
  const camp = mkCamp([d], 1);
  const mil = A.levyMilitia(camp, 'dom-mil', { count: 240 });   // 2 per 10
  ok('levied 240 militia', mil && mil.count === 240 && mil.source === 'militia');
  ok('militiaCalledUpCount = 240', A.militiaCalledUpCount(camp, d) === 240);
  ok('militia morale penalty −2 (2 per 10)', A.militiaDomainMoralePenalty(camp, d) === -2);
  ok('militia revenue penalty = 240 families', A.militiaRevenuePenaltyFamilies(camp, d) === 240);
  ok('revenue families = 1,200 − 240 = 960 (RR p.432)', A.effectivePeasantFamiliesForRevenue(camp, d) === 960);
  // train with the RR p.431 Qualifying-Number cap (W7 + the 2026-06-17 Train modal): only 50% of a
  // militia levy can become heavy infantry — the unqualified remainder splits off as an untrained levy.
  const camp2 = mkCamp([mkDomain(1200, 1, 'dom-mil')], 1);
  const mh = A.levyMilitia(camp2, 'dom-mil', { count: 120 }); const rh = A.trainLevyUnit(camp2, mh, { targetTroopType: 'heavy-infantry' });
  ok('train 120 militia as heavy: capped at 60 (50%), cost 60×122 = 7,320gp', rh.ok && rh.trained === 60 && rh.cost === 7320 && rh.months === 1);
  ok('the trained unit is 60 heavy @ wage 12', mh.unitTypeKey === 'heavy-infantry' && A.unitActiveCount(mh) === 60 && mh.monthlyWage === 12);
  ok('the unqualified 60 split off as an untrained levy', rh.remainder && A.findUnit(camp2, rh.remainder).unitTypeKey === 'untrained-levy' && A.unitActiveCount(A.findUnit(camp2, rh.remainder)) === 60);
  const ml = A.levyMilitia(camp2, 'dom-mil', { count: 120 }); const rl = A.trainLevyUnit(camp2, ml, { targetTroopType: 'light-infantry' });
  ok('train 120 militia as light: all qualify (Q=120), cost 120×88.5 = 10,620gp, no remainder', rl.ok && rl.trained === 120 && rl.cost === 10620 && rl.remainder === null);
  ok('trained light now wage 6 / type light-infantry', ml.monthlyWage === 6 && ml.unitTypeKey === 'light-infantry' && A.unitActiveCount(ml) === 120);
  // an explicit count ≤ the qualifying max trains exactly that many; a count above it is clamped to it
  const campC = mkCamp([mkDomain(1200, 1, 'dom-cap')], 1);
  const cc = A.levyConscripts(campC, 'dom-cap', { count: 120 });
  const rcc = A.trainLevyUnit(campC, cc, { targetTroopType: 'heavy-cavalry', count: 5 });   // Q=10 → max 10; train 5
  ok('explicit count 5 (≤ qualifying max 10): trains 5 heavy cavalry', rcc.ok && rcc.trained === 5 && rcc.qualMax === 10 && A.unitActiveCount(cc) === 5);
  const campD = mkCamp([mkDomain(1200, 1, 'dom-clamp')], 1);
  const cd = A.levyConscripts(campD, 'dom-clamp', { count: 120 });
  ok('a count above the qualifying max is clamped to it', A.trainLevyUnit(campD, cd, { targetTroopType: 'heavy-cavalry', count: 999 }).trained === 10);
  // while called up the trained militia are billed in garrisonCost; the credit is the at-home set
  const d2 = camp2.domains[0];
  const sh = A.sendMilitiaHome(camp2, 'dom-mil');
  ok('send all militia home (2 trained + the untrained remainder = 3)', sh.sentHome === 3 && sh.disbanded === 0);
  ok('trained-militia garrison credit = 60×12 + 120×6 = 1,440gp (the untrained 60 don’t count, RR p.341)', A.domainTrainedMilitiaCredit(camp2, d2) === 1440);
  ok('called-up militia now 0 (no morale/revenue penalty)', A.militiaCalledUpCount(camp2, d2) === 0 && A.militiaDomainMoralePenalty(camp2, d2) === 0);
  ok('domainMilitiaTroopTypeKey reads a trained type (E10 banditry hook)', ['heavy-infantry', 'light-infantry'].includes(A.domainMilitiaTroopTypeKey(camp2, d2)));
}
{
  // 1 per 10 → −1 (RR p.432)
  const d = mkDomain(1000, 1, 'dom-1per');
  const camp = mkCamp([d], 1);
  A.levyMilitia(camp, 'dom-1per', { count: 100 });   // 100 / (1000/10=100) = 1 per 10 → −1
  ok('militia morale penalty −1 (1 per 10)', A.militiaDomainMoralePenalty(camp, d) === -1);
}
{
  // a training cost actually debits the home domain treasury (RR p.431), capped by the qualifying number
  const d = mkDomain(1200, 1, 'dom-pay'); d.treasury = { gp: 100000 };
  const camp = mkCamp([d], 1);
  const u = A.levyConscripts(camp, 'dom-pay', { count: 60 });
  A.trainLevyUnit(camp, u, { targetTroopType: 'heavy-infantry' });   // 60 conscripts → 50% = 30 qualify → 30 × 122 = 3,660gp
  ok('training debits the home domain treasury (cap 30 × 122 = 3,660)', d.treasury.gp === 100000 - 3660);
  ok('a pool too small to yield even one of a type is refused (5 → heavy cavalry, Q=10)', A.trainLevyUnit(camp, A.levyConscripts(camp, 'dom-pay', { count: 5 }), { targetTroopType: 'heavy-cavalry' }).reason === 'too-few-qualify');
  const orcCamp = mkCamp([mkDomain(1000, 1, 'dom-orc')], 1);
  const ou = A.levyConscripts(orcCamp, 'dom-orc', { count: 10, race: 'orc' });
  ok('orc conscript cannot train as cataphract (qualifying 0)', A.trainLevyUnit(orcCamp, ou, { targetTroopType: 'cataphract-cavalry' }).ok === false);
}

// ─────────────────────────────────────────────────────────────────────────────
section('Economy wiring — oracle-safety + the W7 morale/adequacy/revenue terms');
{
  // No militia / wage-waived / scutage → adequacy spend == garrisonCost; revenue == population.
  const d = mkDomain(500, 1, 'dom-clean');
  d.garrison = { units: [A.blankUnit({ unitTypeKey: 'heavy-infantry', count: 60, monthlyWage: 12 })] };
  const camp = mkCamp([d], 1);
  ok('clean domain: garrisonAdequacySpend == garrisonCost', A.garrisonAdequacySpend(camp, d) === A.garrisonCost(d));
  ok('clean domain: revenue families == population', A.effectivePeasantFamiliesForRevenue(camp, d) === 500);
  // a wage-waived lord garrison is excluded from garrisonCost but counts toward adequacy
  const waived = A.blankUnit({ unitTypeKey: 'light-infantry', count: 96, monthlyWage: 6 }); waived.wageWaived = true;
  d.garrison.units.push(waived);
  ok('wage-waived lord troops excluded from garrisonCost', A.garrisonCost(d) === 60 * 12);
  ok('wage-waived lord troops counted in garrisonAdequacySpend', A.garrisonAdequacySpend(camp, d) === 60 * 12 + 96 * 6);
  // moraleModifiersFor surfaces the militia term when militia are called up
  const md = mkDomain(1200, 2, 'dom-mm'); const mcamp = mkCamp([md], 1);
  A.levyMilitia(mcamp, 'dom-mm', { count: 240 });
  const mods = A.moraleModifiersFor(mcamp, md);
  ok('moraleModifiersFor lists the militia-called-up penalty (−2)', mods.some(m => /Militia called up/.test(m.label) && m.value === -2));
}

// ─────────────────────────────────────────────────────────────────────────────
section('F&D materialization (RR pp.433–434 + p.348 + #230) — Call to Arms / Troops');
function mkFeudal(opts){
  opts = opts || {};
  const lord = A.blankCharacter({ id: 'chr-lord', name: 'Lord' }); lord.currentHexId = 'hex-seat';
  const vassal = A.blankCharacter({ id: 'chr-vassal', name: 'Vassal' });
  const lordDomain = A.blankDomain({ id: 'dom-lord', name: 'Lord Realm' });
  lordDomain.rulerCharacterId = 'chr-lord'; lordDomain.liegeId = null; lordDomain.treasury = { gp: 100000 };
  lordDomain.demographics.peasantFamilies = 2000; lordDomain.tags = ['march'];
  const vassalDomain = A.blankDomain({ id: 'dom-vassal', name: 'Vassal Realm' });
  vassalDomain.rulerCharacterId = 'chr-vassal'; vassalDomain.liegeId = 'dom-lord'; vassalDomain.treasury = { gp: 50000 };
  vassalDomain.demographics.peasantFamilies = opts.vassalFamilies || 600; vassalDomain.tags = ['barony'];
  vassalDomain.geography.hexes = [{ id: 'hex-v', coord: { q: 0, r: 0 } }];
  return {
    schemaVersion: 2, currentTurn: 5, houseRules: {}, domains: [lordDomain, vassalDomain], characters: [lord, vassal],
    units: [], armies: [], hexes: [{ id: 'hex-seat', domainId: 'dom-lord' }, { id: 'hex-v', domainId: 'dom-vassal' }],
    vassalages: [{ id: 'vas-1', schemaVersion: 2, status: 'active', vassalRulerCharacterId: 'chr-vassal', suzerainCharacterId: 'chr-lord', vassalDomainId: 'dom-vassal', suzerainDomainId: 'dom-lord', history: [] }],
    favorDutyObligations: [], eventLog: [], pendingEvents: [], settlements: [], rumors: [], ventures: [], parties: []
  };
}
{
  const camp = mkFeudal({ vassalFamilies: 600 });
  const r = A.applyFavorDutyEdictByKind(camp, { kind: 'call-to-arms', vassalDomainId: 'dom-vassal' });
  ok('call-to-arms edict raised', r && r.obligation && r.obligation.kind === 'call-to-arms');
  const budget = r.gpPerMonth;
  ok('budget = 1gp/realm-family (>0)', budget > 0);
  const army = camp.armies.find(a => a.id === r.obligation.materializedArmyId);
  ok('a liege host army was created', !!army && army.leaderCharacterId === 'chr-lord' && army._favorDutyArmy === true);
  ok('host army placed at the liege seat hex', army.currentHexId === 'hex-seat');
  const u = camp.units.find(x => x.id === r.obligation.materializedUnitIds[0]);
  ok('a vassal levy unit was mustered into the host', !!u && u.source === 'vassal' && u.stationedAt && u.stationedAt.kind === 'army');
  ok('levy count = floor(budget / 6gp light infantry), ≥1', u.count === Math.max(1, Math.floor(budget / 6)));
  ok('host army division includes the levy', army.divisions[0] && army.divisions[0].unitIds.includes(u.id));
  ok('armyUnits sees the levy', A.armyUnits(camp, army).some(x => x.id === u.id));
  // revoke → disband the levy + the now-empty host
  A.revokeFavorDutyObligation(camp, r.obligation.id, 6, 'gm-revoked');
  ok('revoke disbands the materialized levy', !camp.units.some(x => x.id === u.id));
  ok('revoke disbands the now-empty F&D host', !camp.armies.some(a => a.id === army.id));
  ok('obligation materialized fields cleared on revoke', (r.obligation.materializedUnitIds || []).length === 0 && r.obligation.materializedArmyId == null);
}
{
  const camp = mkFeudal({ vassalFamilies: 600 });
  const vassalDomain = camp.domains.find(d => d.id === 'dom-vassal');
  const r = A.applyFavorDutyEdictByKind(camp, { kind: 'troops', vassalDomainId: 'dom-vassal' });
  ok('troops favor raised (isFavor)', r && r.obligation.kind === 'troops' && r.obligation.isFavor === true);
  const u = camp.units.find(x => x.id === r.obligation.materializedUnitIds[0]);
  ok('lord troops stationed in the VASSAL garrison', !!u && u.source === 'vassal' && u.stationedAt.kind === 'domain-garrison' && u.stationedAt.id === 'dom-vassal');
  ok('lord troops are wage-waived (vassal pays no wages, RR p.348)', u.wageWaived === true);
  ok('wage-waived troops NOT in the vassal garrisonCost', A.garrisonCost(vassalDomain) === 0);
  ok('wage-waived troops DO count toward the vassal garrison adequacy', A.garrisonAdequacySpend(camp, vassalDomain) >= u.count * 6);
  A.revokeFavorDutyObligation(camp, r.obligation.id, 6, 'gm-revoked');
  ok('revoke disbands the granted garrison', !camp.units.some(x => x.id === u.id));
}
{
  // armyTroopSourceBreakdown (maneuvers W7 read)
  const camp = mkFeudal({ vassalFamilies: 600 });
  A.applyFavorDutyEdictByKind(camp, { kind: 'call-to-arms', vassalDomainId: 'dom-vassal' });
  const army = camp.armies[0];
  const brk = A.armyTroopSourceBreakdown(camp, army);
  ok('armyTroopSourceBreakdown tallies the vassal levy', brk.length === 1 && brk[0].source === 'vassal' && brk[0].soldiers > 0);
}

// ─────────────────────────────────────────────────────────────────────────────
section('Sticky casualties + the available pool (RR p.430 — the Marcus example)');
{
  const d = mkDomain(1000, 1, 'dom-sticky'); const camp = mkCamp([d], 1);
  const con = A.levyConscripts(camp, 'dom-sticky', { count: 100 });
  ok('raised 100 → everRaised 100, available 0', A.levyEverRaised(camp, d, 'conscript') === 100 && A.levyAvailable(camp, d, 'conscript') === 0);
  con.casualties = 50;   // lost 50 in battle
  ok('after 50 casualties: living 50 but everRaised still 100 (sticky)', Math.max(0, (con.count || 0) - (con.casualties || 0)) === 50 && A.levyEverRaised(camp, d, 'conscript') === 100);
  ok('casualties do NOT free a levy slot (available still 0)', A.levyAvailable(camp, d, 'conscript') === 0);
  ok('cannot instantly re-levy the dead', A.levyConscripts(camp, 'dom-sticky', { count: 50 }) === null);
  d.demographics.peasantFamilies = 1200;   // the domain grows
  ok('grown to 1,200 → cap 120 → available 20 (only the new families, RR p.430)', A.levyAvailable(camp, d, 'conscript') === 20);
  const more = A.levyConscripts(camp, 'dom-sticky', { count: 99 });
  ok('a fresh levy clamps to the 20 available', more && more.count === 20);
  ok('now at cap → available 0, no more', A.levyAvailable(camp, d, 'conscript') === 0 && A.levyConscripts(camp, 'dom-sticky', { count: 1 }) === null);
}

// ─────────────────────────────────────────────────────────────────────────────
section("Casualty replenishment over time — 5%/yr of the cap (RR p.430 designer's note)");
{
  const d = mkDomain(1000, 1, 'dom-repl'); const camp = mkCamp([d], 1);
  const con = A.levyConscripts(camp, 'dom-repl', { count: 100 }); con.casualties = 50;
  ok('one month does not yet heal (carry < 1)', A.processLevyReplenishmentForTurn(camp) === 0 && con.casualties === 50);
  let healed = 0; for(let i = 0; i < 11; i++) healed += A.processLevyReplenishmentForTurn(camp);   // 12 total with the one above
  ok('a year (12 turns) heals 5 conscript casualties (cap 100 × 5%)', con.casualties === 45, 'casualties=' + con.casualties);
  ok('living recovered 50 → 55', Math.max(0, (con.count || 0) - (con.casualties || 0)) === 55);
  con.casualties = 0;
  ok('no casualties → replenishment is a no-op (carry resets)', A.processLevyReplenishmentForTurn(camp) === 0);
  // militia heal too (parity): cap 200 × 5% = 10/yr
  const md = mkDomain(1000, 1, 'dom-replm'); const mc = mkCamp([md], 1);
  const mil = A.levyMilitia(mc, 'dom-replm', { count: 100 }); mil.casualties = 40;
  for(let i = 0; i < 12; i++) A.processLevyReplenishmentForTurn(mc);
  ok('militia replenish too — cap 200 × 5% = 10/yr (40 → 30)', mil.casualties === 30, 'casualties=' + mil.casualties);
}

// ─────────────────────────────────────────────────────────────────────────────
section('Per-unit militia send-home / call-up + release (RR pp.430–432)');
{
  const d = mkDomain(1200, 1, 'dom-set'); const camp = mkCamp([d], 1);
  const mil = A.levyMilitia(camp, 'dom-set', { count: 60 });
  A.trainLevyUnit(camp, mil, { targetTroopType: 'light-infantry' });   // light: Q=120, all 60 qualify (no split — this block tests send-home, not the cap)
  ok('called-up militia counts before send-home', A.militiaCalledUpCount(camp, d) === 60);
  const sh = A.sendMilitiaUnitHome(camp, mil);
  ok('sendMilitiaUnitHome: trained → sentHome, stays in campaign.units, calledUp false', sh.sentHome === 1 && mil.calledUp === false && camp.units.some(u => u.id === mil.id) && !mil.stationedAt);
  ok('called-up count now 0; the at-home trained credit reads 360gp (60×6 light)', A.militiaCalledUpCount(camp, d) === 0 && A.domainTrainedMilitiaCredit(camp, d) === 360);
  A.callUpMilitia(camp, mil);
  ok('callUpMilitia: calledUp true, re-stationed to garrison, billed again', mil.calledUp === true && mil.stationedAt && mil.stationedAt.kind === 'domain-garrison' && A.militiaCalledUpCount(camp, d) === 60);
  const raw = A.levyMilitia(camp, 'dom-set', { count: 40 });
  const sh2 = A.sendMilitiaUnitHome(camp, raw);
  ok('untrained militia send-home → stands DOWN (stays on the rolls, calledUp false, not disbanded)', sh2.sentHome === 1 && sh2.disbanded === 0 && camp.units.some(u => u.id === raw.id) && raw.calledUp === false && !raw.stationedAt);
  ok('an untrained militia at home gets NO garrison credit — only trained+equipped does (RR p.341)', A.domainTrainedMilitiaCredit(camp, d) === 0);
  ok('a stood-down militia still occupies its levy slot until released (sticky cap)', A.levyEverRaised(camp, d, 'militia') === 100);
  const con = A.levyConscripts(camp, 'dom-set', { count: 30 });
  const before = A.levyEverRaised(camp, d, 'conscript');
  ok('releaseLevyUnit removes it + frees the slot', A.releaseLevyUnit(camp, con) === true && !camp.units.some(u => u.id === con.id) && A.levyEverRaised(camp, d, 'conscript') === before - 30);
  ok('releaseLevyUnit on a non-levy → false', A.releaseLevyUnit(camp, A.blankUnit({ unitTypeKey: 'heavy-infantry', count: 10 })) === false);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log(fail === 0 ? ('PASS troops-depth.smoke.js — ' + pass + ' assertions') : ('FAIL troops-depth.smoke.js — ' + fail + ' of ' + (pass + fail) + ' failed'));
if(fail > 0){ failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
