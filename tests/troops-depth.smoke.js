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

// W7 levy-arrival staging (RR p.430): A.levyConscripts / A.levyMilitia now DEFER by default — the
// levied troops arrive ½/¼/remainder over 3 weeks via the 'levy-muster' day-consumer. The suites
// below assert the levy's END-STATE mechanics (caps, training, casualties, send-home, the F&D
// materialization), not the muster TIMING, so they go through these instant:true wrappers (the whole
// levy at once — the legacy path). The staging contract itself is exercised with the real deferred
// A.levyConscripts / A.levyMilitia in the "Levying takes TIME" section below.
const _origLevyC = A.levyConscripts, _origLevyM = A.levyMilitia;
const levyC = (c, id, opts) => _origLevyC(c, id, Object.assign({ instant: true }, opts || {}));
const levyM = (c, id, opts) => _origLevyM(c, id, Object.assign({ instant: true }, opts || {}));

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
  const con = levyC(camp, 'dom-c', { count: 100 });
  ok('levied 100 conscripts', con && con.count === 100 && con.source === 'conscript');
  ok('conscript untrained: 3gp wage, type untrained-levy', con.monthlyWage === 3 && con.unitTypeKey === 'untrained-levy');
  ok('conscript morale: −2 base + steadfast +1 (moraleAdjustment +1, loyalty +1)', con.moraleAdjustment === 1 && con.loyalty === 1);
  ok('conscript carries homeDomainId + calledUp + stationed in garrison', con.homeDomainId === 'dom-c' && con.calledUp === true && con.stationedAt && con.stationedAt.kind === 'domain-garrison');
  ok('conscriptCount reads it back', A.conscriptCount(camp, d) === 100);
  ok('in campaign.units, stationed to the garrison (single home)', camp.units.some(u => u.id === con.id) && A.unitsStationedAt(camp, { kind: 'domain-garrison', id: d.id }).some(u => u.id === con.id));
  // over-cap clamps to remaining room (120 cap − 100 = 20), never rejects
  const more = levyC(camp, 'dom-c', { count: 50 });
  ok('over-cap levy clamps to remaining 20', more && more.count === 20);
  ok('no room → null', levyC(camp, 'dom-c', { count: 5 }) === null);
}
{
  const d = mkDomain(1200, 0, 'dom-a');   // Apathetic (0) → −1 levy morale
  const camp = mkCamp([d], 1);
  const con = levyC(camp, 'dom-a', { count: 10 });
  ok('apathetic domain → −1 levy morale', con.moraleAdjustment === -1 && con.loyalty === -1);
}
{
  const turbulent = mkDomain(1200, -2, 'dom-t');   // Turbulent → cannot levy (RR p.432)
  const camp = mkCamp([turbulent], 1);
  ok('Turbulent (morale −2) blocks levying conscripts', levyC(camp, 'dom-t', { count: 10 }) === null);
  ok('Turbulent (morale −2) blocks levying militia', levyM(camp, 'dom-t', { count: 10 }) === null);
  ok('canLevyFromDomain false at morale −2', A.canLevyFromDomain(turbulent) === false);
}

// ─────────────────────────────────────────────────────────────────────────────
section('Militia — penalty + revenue + the RR p.433 Marcus garrison credit (2,160gp)');
{
  const d = mkDomain(1200, 1, 'dom-mil');
  const camp = mkCamp([d], 1);
  const mil = levyM(camp, 'dom-mil', { count: 240 });   // 2 per 10
  ok('levied 240 militia', mil && mil.count === 240 && mil.source === 'militia');
  ok('militiaCalledUpCount = 240', A.militiaCalledUpCount(camp, d) === 240);
  ok('militia morale penalty −2 (2 per 10)', A.militiaDomainMoralePenalty(camp, d) === -2);
  ok('militia revenue penalty = 240 families', A.militiaRevenuePenaltyFamilies(camp, d) === 240);
  ok('revenue families = 1,200 − 240 = 960 (RR p.432)', A.effectivePeasantFamiliesForRevenue(camp, d) === 960);
  // train with the RR p.431 Qualifying-Number cap (W7 + the 2026-06-17 Train modal): only 50% of a
  // militia levy can become heavy infantry — the unqualified remainder splits off as an untrained levy.
  // (instant:true asserts the converted END-STATE — type/wage/garrison-credit; the W7 training TIMER —
  // training deferred to the 'levy-training' day-consumer — is exercised in its own section below.)
  const camp2 = mkCamp([mkDomain(1200, 1, 'dom-mil')], 1);
  const mh = levyM(camp2, 'dom-mil', { count: 120 }); const rh = A.trainLevyUnit(camp2, mh, { targetTroopType: 'heavy-infantry', instant: true });
  ok('train 120 militia as heavy: capped at 60 (50%), cost 60×122 = 7,320gp', rh.ok && rh.trained === 60 && rh.cost === 7320 && rh.months === 1);
  ok('the trained unit is 60 heavy @ wage 12', mh.unitTypeKey === 'heavy-infantry' && A.unitActiveCount(mh) === 60 && mh.monthlyWage === 12);
  ok('the unqualified 60 split off as an untrained levy', rh.remainder && A.findUnit(camp2, rh.remainder).unitTypeKey === 'untrained-levy' && A.unitActiveCount(A.findUnit(camp2, rh.remainder)) === 60);
  const ml = levyM(camp2, 'dom-mil', { count: 120 }); const rl = A.trainLevyUnit(camp2, ml, { targetTroopType: 'light-infantry', instant: true });
  ok('train 120 militia as light: all qualify (Q=120), cost 120×88.5 = 10,620gp, no remainder', rl.ok && rl.trained === 120 && rl.cost === 10620 && rl.remainder === null);
  ok('trained light now wage 6 / type light-infantry', ml.monthlyWage === 6 && ml.unitTypeKey === 'light-infantry' && A.unitActiveCount(ml) === 120);
  // an explicit count ≤ the qualifying max trains exactly that many; a count above it is clamped to it
  const campC = mkCamp([mkDomain(1200, 1, 'dom-cap')], 1);
  const cc = levyC(campC, 'dom-cap', { count: 120 });
  const rcc = A.trainLevyUnit(campC, cc, { targetTroopType: 'heavy-cavalry', count: 5 });   // Q=10 → max 10; train 5
  ok('explicit count 5 (≤ qualifying max 10): trains 5 heavy cavalry', rcc.ok && rcc.trained === 5 && rcc.qualMax === 10 && A.unitActiveCount(cc) === 5);
  const campD = mkCamp([mkDomain(1200, 1, 'dom-clamp')], 1);
  const cd = levyC(campD, 'dom-clamp', { count: 120 });
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
  levyM(camp, 'dom-1per', { count: 100 });   // 100 / (1000/10=100) = 1 per 10 → −1
  ok('militia morale penalty −1 (1 per 10)', A.militiaDomainMoralePenalty(camp, d) === -1);
}
{
  // a training cost actually debits the home domain treasury (RR p.431), capped by the qualifying number
  const d = mkDomain(1200, 1, 'dom-pay'); d.treasury = { gp: 100000 };
  const camp = mkCamp([d], 1);
  const u = levyC(camp, 'dom-pay', { count: 60 });
  A.trainLevyUnit(camp, u, { targetTroopType: 'heavy-infantry' });   // 60 conscripts → 50% = 30 qualify → 30 × 122 = 3,660gp
  ok('training debits the home domain treasury (cap 30 × 122 = 3,660)', d.treasury.gp === 100000 - 3660);
  // the cap is pool-wide (RR p.431) — a domain whose WHOLE conscript pool is too small yields 0 of a type
  const tiny = mkCamp([mkDomain(1200, 1, 'dom-tiny')], 1);
  ok('a 5-conscript pool yields 0 heavy cavalry (Q=10) → refused', A.trainLevyUnit(tiny, levyC(tiny, 'dom-tiny', { count: 5 }), { targetTroopType: 'heavy-cavalry' }).reason === 'too-few-qualify');
  const orcCamp = mkCamp([mkDomain(1000, 1, 'dom-orc')], 1);
  const ou = levyC(orcCamp, 'dom-orc', { count: 10, race: 'orc' });
  ok('orc conscript cannot train as cataphract (qualifying 0)', A.trainLevyUnit(orcCamp, ou, { targetTroopType: 'cataphract-cavalry' }).ok === false);
}

// ─────────────────────────────────────────────────────────────────────────────
section('Training qualifying cap is POOL-WIDE, not per-unit (RR p.431, 2026-06-17)');
{
  // Splitting a levy before training must NOT change how many of a type the domain can ultimately field.
  const camp = mkCamp([mkDomain(1200, 1, 'dom-split')], 1);
  const a = levyC(camp, 'dom-split', { count: 60 });   // a 120 levy split into two 60-units up front
  const b = levyC(camp, 'dom-split', { count: 60 });
  ok('pool = 120 conscripts across two units', A.domainLevyPoolCount(camp, 'dom-split', 'conscript') === 120);
  ok('heavy-infantry allowance from the 120 pool = 60', A.conscriptQualifyingRemaining(camp, 'dom-split', 'conscript', 'heavy-infantry', 'man') === 60);
  const ra = A.trainLevyUnit(camp, a, { targetTroopType: 'heavy-infantry' });
  ok('train unit A (60) as heavy: all 60 qualify against the 120 pool (NOT 30 per-unit)', ra.ok && ra.trained === 60 && A.unitActiveCount(a) === 60);
  ok('no remainder split from unit A — all 60 fit the pool allowance', ra.remainder === null);
  ok('heavy already trained from the pool = 60', A.domainLevyTrainedOfType(camp, 'dom-split', 'conscript', 'heavy-infantry') === 60);
  const rb = A.trainLevyUnit(camp, b, { targetTroopType: 'heavy-infantry' });
  ok('train unit B (60) as heavy: refused — the pool’s 60 heavy slots are used up', rb.ok === false && rb.reason === 'too-few-qualify');
  ok('unit B can still train as light infantry (Q=120, uncapped)', A.trainLevyUnit(camp, b, { targetTroopType: 'light-infantry' }).trained === 60);
  // the cap is SHARED across units: 30+30 heavy from two units = 60 total ≤ the 120-pool cap (never 120)
  const camp2 = mkCamp([mkDomain(1200, 1, 'dom-share')], 1);
  const x = levyC(camp2, 'dom-share', { count: 60 });
  const y = levyC(camp2, 'dom-share', { count: 60 });
  const rx = A.trainLevyUnit(camp2, x, { targetTroopType: 'heavy-infantry', count: 30 });
  const ry = A.trainLevyUnit(camp2, y, { targetTroopType: 'heavy-infantry', count: 30 });
  ok('two units 30+30 heavy = 60 total fits the shared 120-pool cap', rx.trained === 30 && ry.trained === 30 && A.domainLevyTrainedOfType(camp2, 'dom-share', 'conscript', 'heavy-infantry') === 60);
  const leftover = camp2.units.find(u => u.homeDomainId === 'dom-share' && u.unitTypeKey === 'untrained-levy' && !u.trainingState);   // a true untrained remainder, not an in-training cohort (still typed untrained-levy until it completes)
  ok('a leftover untrained unit can’t add more heavy (pool cap 60 reached)', leftover && A.trainLevyUnit(camp2, leftover, { targetTroopType: 'heavy-infantry' }).reason === 'too-few-qualify');
}

// ─────────────────────────────────────────────────────────────────────────────
section('Training takes TIME (RR p.431; W7 training timer)');
{
  ok('the training-timer helpers are exported', typeof A.unitTrainingDaysLeft === 'function' && typeof A.proposeLevyTrainingDay === 'function' && typeof A.commitLevyTrainingRecord === 'function');

  // Training a levy now DEFERS: the cost is paid up front + the unqualified remainder splits off, but the
  // unit stays an untrained levy (can't fight or be re-trained) until the 'levy-training' day-consumer
  // completes it after the type's training months (heavy infantry = 1 month = 30 days).
  const camp = mkCamp([mkDomain(1200, 1, 'dom-tt')], 1); const d = camp.domains[0]; d.treasury = { gp: 100000 };
  const u = levyC(camp, 'dom-tt', { count: 120 });
  const r = A.trainLevyUnit(camp, u, { targetTroopType: 'heavy-infantry' });   // 60 qualify · heavy = 1 month
  ok('train defers: inTraining true, trained 60, months 1', r.ok && r.inTraining === true && r.trained === 60 && r.months === 1);
  ok('the unit is STILL an untrained levy @ wage 3 (not yet converted)', u.unitTypeKey === 'untrained-levy' && u.monthlyWage === 3);
  ok('trainingState set: target heavy, count 60, completes 30 days out', u.trainingState && u.trainingState.targetTroopType === 'heavy-infantry' && u.trainingState.count === 60 && u.trainingState.completesAtOrd === u.trainingState.startedAtOrd + 30);
  ok('the cost is debited UP FRONT (60 × 122 = 7,320gp)', d.treasury.gp === 100000 - 7320);
  ok('days left at the start = 30', A.unitTrainingDaysLeft(camp, u) === 30);
  ok('an in-training cohort RESERVES the pool cap — no more heavy can be started', A.conscriptQualifyingRemaining(camp, 'dom-tt', 'conscript', 'heavy-infantry', 'man') === 0);
  ok('cannot re-train a unit that is already in training', A.trainLevyUnit(camp, u, { targetTroopType: 'light-infantry' }).reason === 'already-in-training');

  // advance the Day Clock to the end of month 1 — heavy needs 30 days, so still in training
  A.runDayTickToMonthEnd(camp);
  ok('end of month 1 (day 30): still in training, not converted', camp.currentDayInMonth === 30 && u.unitTypeKey === 'untrained-levy' && !!u.trainingState);
  ok('days left at day 30 = 1', A.unitTrainingDaysLeft(camp, u) === 1);

  // the monthly commit rolls the clock to turn 2 / day 1 (commitTurn does this) → the consumer finishes it
  camp.currentTurn = 2; camp.currentDayInMonth = 1;
  A.runDayTickToMonthEnd(camp);
  ok('month 2 → the levy-training consumer completes it: heavy @ wage 12, trainingState cleared', u.unitTypeKey === 'heavy-infantry' && u.monthlyWage === 12 && u.trainingState === null && A.unitActiveCount(u) === 60);
  ok('days left after completion = null', A.unitTrainingDaysLeft(camp, u) === null);
  ok('the completed heavy now counts toward the pool cap', A.domainLevyTrainedOfType(camp, 'dom-tt', 'conscript', 'heavy-infantry') === 60);

  // opts.instant completes immediately (the legacy/expedite path the end-state tests above use)
  const ci = mkCamp([mkDomain(1200, 1, 'dom-ti')], 1); ci.domains[0].treasury = { gp: 100000 };
  const ui = levyC(ci, 'dom-ti', { count: 120 });
  const ri = A.trainLevyUnit(ci, ui, { targetTroopType: 'light-infantry', instant: true });
  ok('instant:true converts at once (inTraining false, light @ wage 6, no trainingState)', ri.ok && ri.inTraining === false && ui.unitTypeKey === 'light-infantry' && ui.monthlyWage === 6 && ui.trainingState === null);

  // a longer training carries the right completion ordinal: cataphract = 12 months = 360 days
  const cl = mkCamp([mkDomain(2400, 1, 'dom-tl')], 1); cl.domains[0].treasury = { gp: 1000000 };
  const ul = levyC(cl, 'dom-tl', { count: 120 });   // cataphract Q=6 → 6 qualify
  const rl2 = A.trainLevyUnit(cl, ul, { targetTroopType: 'cataphract-cavalry' });
  ok('cataphract (12 mo): completesAtOrd = start + 360, months 12', rl2.ok && rl2.months === 12 && rl2.completesAtOrd === ul.trainingState.startedAtOrd + 360);
}

// ─────────────────────────────────────────────────────────────────────────────
section('Economy wiring — oracle-safety + the W7 morale/adequacy/revenue terms');
{
  // No militia / wage-waived / scutage → adequacy spend == garrisonCost; revenue == population.
  const d = mkDomain(500, 1, 'dom-clean');
  const camp = mkCamp([d], 1);
  // T6 single-home — station units into campaign.units[] (the canonical home garrisonCost reads).
  A.stationUnit(camp, A.blankUnit({ unitTypeKey: 'heavy-infantry', count: 60, monthlyWage: 12 }), { kind: 'domain-garrison', id: d.id });
  ok('clean domain: garrisonAdequacySpend == garrisonCost', A.garrisonAdequacySpend(camp, d) === A.garrisonCost(camp, d));
  ok('clean domain: revenue families == population', A.effectivePeasantFamiliesForRevenue(camp, d) === 500);
  // a wage-waived lord garrison is excluded from garrisonCost but counts toward adequacy
  const waived = A.blankUnit({ unitTypeKey: 'light-infantry', count: 96, monthlyWage: 6 }); waived.wageWaived = true;
  A.stationUnit(camp, waived, { kind: 'domain-garrison', id: d.id });
  ok('wage-waived lord troops excluded from garrisonCost', A.garrisonCost(camp, d) === 60 * 12);
  ok('wage-waived lord troops counted in garrisonAdequacySpend', A.garrisonAdequacySpend(camp, d) === 60 * 12 + 96 * 6);
  // moraleModifiersFor surfaces the militia term when militia are called up
  const md = mkDomain(1200, 2, 'dom-mm'); const mcamp = mkCamp([md], 1);
  levyM(mcamp, 'dom-mm', { count: 240 });
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
  ok('wage-waived troops NOT in the vassal garrisonCost', A.garrisonCost(camp, vassalDomain) === 0);
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
  const con = levyC(camp, 'dom-sticky', { count: 100 });
  ok('raised 100 → everRaised 100, available 0', A.levyEverRaised(camp, d, 'conscript') === 100 && A.levyAvailable(camp, d, 'conscript') === 0);
  con.casualties = 50;   // lost 50 in battle
  ok('after 50 casualties: living 50 but everRaised still 100 (sticky)', Math.max(0, (con.count || 0) - (con.casualties || 0)) === 50 && A.levyEverRaised(camp, d, 'conscript') === 100);
  ok('casualties do NOT free a levy slot (available still 0)', A.levyAvailable(camp, d, 'conscript') === 0);
  ok('cannot instantly re-levy the dead', levyC(camp, 'dom-sticky', { count: 50 }) === null);
  d.demographics.peasantFamilies = 1200;   // the domain grows
  ok('grown to 1,200 → cap 120 → available 20 (only the new families, RR p.430)', A.levyAvailable(camp, d, 'conscript') === 20);
  const more = levyC(camp, 'dom-sticky', { count: 99 });
  ok('a fresh levy clamps to the 20 available', more && more.count === 20);
  ok('now at cap → available 0, no more', A.levyAvailable(camp, d, 'conscript') === 0 && levyC(camp, 'dom-sticky', { count: 1 }) === null);
}

// ─────────────────────────────────────────────────────────────────────────────
section("Casualty replenishment over time — 5%/yr of the cap (RR p.430 designer's note)");
{
  const d = mkDomain(1000, 1, 'dom-repl'); const camp = mkCamp([d], 1);
  const con = levyC(camp, 'dom-repl', { count: 100 }); con.casualties = 50;
  ok('one month does not yet heal (carry < 1)', A.processLevyReplenishmentForTurn(camp) === 0 && con.casualties === 50);
  let healed = 0; for(let i = 0; i < 11; i++) healed += A.processLevyReplenishmentForTurn(camp);   // 12 total with the one above
  ok('a year (12 turns) heals 5 conscript casualties (cap 100 × 5%)', con.casualties === 45, 'casualties=' + con.casualties);
  ok('living recovered 50 → 55', Math.max(0, (con.count || 0) - (con.casualties || 0)) === 55);
  con.casualties = 0;
  ok('no casualties → replenishment is a no-op (carry resets)', A.processLevyReplenishmentForTurn(camp) === 0);
  // militia heal too (parity): cap 200 × 5% = 10/yr
  const md = mkDomain(1000, 1, 'dom-replm'); const mc = mkCamp([md], 1);
  const mil = levyM(mc, 'dom-replm', { count: 100 }); mil.casualties = 40;
  for(let i = 0; i < 12; i++) A.processLevyReplenishmentForTurn(mc);
  ok('militia replenish too — cap 200 × 5% = 10/yr (40 → 30)', mil.casualties === 30, 'casualties=' + mil.casualties);
}

// ─────────────────────────────────────────────────────────────────────────────
section('Per-unit militia send-home / call-up + release (RR pp.430–432)');
{
  const d = mkDomain(1200, 1, 'dom-set'); const camp = mkCamp([d], 1);
  const mil = levyM(camp, 'dom-set', { count: 60 });
  A.trainLevyUnit(camp, mil, { targetTroopType: 'light-infantry', instant: true });   // light: Q=120, all 60 qualify (instant — this block tests send-home + the trained at-home credit, not the timer)
  ok('called-up militia counts before send-home', A.militiaCalledUpCount(camp, d) === 60);
  const sh = A.sendMilitiaUnitHome(camp, mil);
  ok('sendMilitiaUnitHome: trained → sentHome, stays in campaign.units, calledUp false', sh.sentHome === 1 && mil.calledUp === false && camp.units.some(u => u.id === mil.id) && !mil.stationedAt);
  ok('called-up count now 0; the at-home trained credit reads 360gp (60×6 light)', A.militiaCalledUpCount(camp, d) === 0 && A.domainTrainedMilitiaCredit(camp, d) === 360);
  A.callUpMilitia(camp, mil);
  ok('callUpMilitia: calledUp true, re-stationed to garrison, billed again', mil.calledUp === true && mil.stationedAt && mil.stationedAt.kind === 'domain-garrison' && A.militiaCalledUpCount(camp, d) === 60);
  const raw = levyM(camp, 'dom-set', { count: 40 });
  const sh2 = A.sendMilitiaUnitHome(camp, raw);
  ok('untrained militia send-home → stands DOWN (stays on the rolls, calledUp false, not disbanded)', sh2.sentHome === 1 && sh2.disbanded === 0 && camp.units.some(u => u.id === raw.id) && raw.calledUp === false && !raw.stationedAt);
  ok('an untrained militia at home gets NO garrison credit — only trained+equipped does (RR p.341)', A.domainTrainedMilitiaCredit(camp, d) === 0);
  ok('a stood-down militia still occupies its levy slot until released (sticky cap)', A.levyEverRaised(camp, d, 'militia') === 100);
  const con = levyC(camp, 'dom-set', { count: 30 });
  const before = A.levyEverRaised(camp, d, 'conscript');
  ok('releaseLevyUnit removes it + frees the slot', A.releaseLevyUnit(camp, con) === true && !camp.units.some(u => u.id === con.id) && A.levyEverRaised(camp, d, 'conscript') === before - 30);
  ok('releaseLevyUnit on a non-levy → false', A.releaseLevyUnit(camp, A.blankUnit({ unitTypeKey: 'heavy-infantry', count: 10 })) === false);
}

// ─────────────────────────────────────────────────────────────────────────────
section('Levying takes TIME (RR p.430; W7 levy-arrival staging)');
{
  ok('the levy-arrival helpers are exported', typeof A.unitMusterDaysLeft === 'function' && typeof A.proposeLevyMusterDay === 'function' && typeof A.commitLevyMusterRecord === 'function');

  // The DEFAULT levy DEFERS: count starts at 0 (none arrived yet), musterPending holds the full commit,
  // and a 3-batch schedule lands ½/¼/remainder at +7/+14/+21 days (the barony WEEK period, RR pp.430/434).
  const camp = mkCamp([mkDomain(1200, 1, 'dom-mus')], 5);
  const u = A.levyConscripts(camp, 'dom-mus', { count: 48 });
  ok('a staged levy starts with 0 arrived (it takes time)', A.unitActiveCount(u) === 0 && u.count === 0);
  ok('musterPending holds the full commit (48)', u.musterPending === 48);
  ok('musterState: total 48, 3 batches ½/¼/remainder = 24/12/12', u.musterState && u.musterState.total === 48 && u.musterState.schedule.length === 3 && u.musterState.schedule[0].count === 24 && u.musterState.schedule[1].count === 12 && u.musterState.schedule[2].count === 12);
  ok('the batches land at +7 / +14 / +21 days', (() => { const s = u.musterState, st = s.startedAtOrd; return s.schedule[0].atOrd === st + 7 && s.schedule[1].atOrd === st + 14 && s.schedule[2].atOrd === st + 21; })());
  ok('still an untrained levy, called up, stationed in the garrison', u.unitTypeKey === 'untrained-levy' && u.calledUp === true && u.stationedAt && u.stationedAt.kind === 'domain-garrison');
  ok('days left at levy-time = 21', A.unitMusterDaysLeft(camp, u) === 21);

  // the FULL commit reserves the cap even though none have arrived (everRaised counts musterPending)
  ok('everRaised counts the still-mustering commit (48); available = conscript cap 120 − 48 = 72', A.levyEverRaised(camp, camp.domains[0], 'conscript') === 48 && A.levyAvailable(camp, camp.domains[0], 'conscript') === 120 - 48);

  // can't train, and the training pool counts only the ARRIVED soldiers while mustering
  ok('a still-mustering levy cannot be trained yet', A.trainLevyUnit(camp, u, { targetTroopType: 'heavy-infantry' }).reason === 'still-mustering');
  ok('the training pool counts only arrived soldiers (0 so far)', A.domainLevyPoolCount(camp, 'dom-mus', 'conscript') === 0);

  // advance the Day Clock to month end — the 'levy-muster' consumer tops up `count` as each weekly batch lands
  A.runDayTickToMonthEnd(camp);   // ticks days 2..30 of turn 5 → batches at days 8 (½) / 15 (¼) / 22 (rest)
  ok('after a full month the levy is fully mustered (48 arrived, musterState cleared)', A.unitActiveCount(u) === 48 && u.count === 48 && u.musterPending === 0 && u.musterState === null);
  ok('days left after full muster = null', A.unitMusterDaysLeft(camp, u) === null);
  ok('fully mustered → now trainable', A.trainLevyUnit(camp, u, { targetTroopType: 'light-infantry' }).ok === true);

  // partial muster across ONE week: only the first batch (½) has arrived — and the pure peek doesn't mutate
  const camp2 = mkCamp([mkDomain(1200, 1, 'dom-mus2')], 5);
  const u2 = A.levyConscripts(camp2, 'dom-mus2', { count: 48 });
  A.proposeDayTick(camp2, 7);   // PURE peek (no commit) — must not mutate the real campaign
  ok('a pure proposeDayTick peek does not mutate the real levy', A.unitActiveCount(u2) === 0 && u2.musterPending === 48);
  A.commitDayTick(camp2, A.proposeDayTick(camp2, 7, { force: true }));   // advance to day 8 (batch 1)
  ok('after week 1 (day 8): ½ = 24 arrived, 24 still mustering', A.unitActiveCount(u2) === 24 && u2.musterPending === 24 && u2.musterState && u2.musterState.arrivedSoFar === 24);
  ok('after week 1: days left = 14 (to the +21 batch)', A.unitMusterDaysLeft(camp2, u2) === 14);
  ok('the 24 arrived count toward the pool; everRaised stays the full 48', A.domainLevyPoolCount(camp2, 'dom-mus2', 'conscript') === 24 && A.levyEverRaised(camp2, camp2.domains[0], 'conscript') === 48);

  // a tiny levy: the whole of it (½ rounded up = 1) lands in the first batch
  const camp3 = mkCamp([mkDomain(20, 1, 'dom-one')], 5);   // cap 2
  const u3 = A.levyConscripts(camp3, 'dom-one', { count: 1 });
  ok('a 1-conscript levy schedules a single batch of 1', u3.musterState.schedule.length === 1 && u3.musterState.schedule[0].count === 1);

  // militia stage too ("Militia arrive at the same rate as conscripts" — RR p.432)
  const camp4 = mkCamp([mkDomain(1200, 1, 'dom-musm')], 5);
  const m = A.levyMilitia(camp4, 'dom-musm', { count: 100 });
  ok('a staged militia levy: 0 arrived, schedule 50/25/25', A.unitActiveCount(m) === 0 && m.musterState.schedule[0].count === 50 && m.musterState.schedule[1].count === 25 && m.musterState.schedule[2].count === 25);

  // opts.instant skips staging (the legacy/expedite path the wrapper'd suites above use)
  const camp5 = mkCamp([mkDomain(1200, 1, 'dom-inst')], 5);
  const u5 = A.levyConscripts(camp5, 'dom-inst', { count: 30, instant: true });
  ok('instant:true skips staging — 30 arrive at once, no musterState', A.unitActiveCount(u5) === 30 && u5.count === 30 && !u5.musterState && !(u5.musterPending > 0));
}

// ─────────────────────────────────────────────────────────────────────────────
section('Realm-scale mercenary recruitment (RR p.428; W7-continuation)');
{
  const seq = () => 0.5;   // deterministic rng for the fee roll

  ok('realm-recruit helpers exported', typeof A.realmRecruitTier === 'function' && typeof A.realmMercAvailable === 'function' && typeof A.realmRecruitFeeSpec === 'function' && typeof A.realmRecruitPeriodDays === 'function' && typeof A.recruitRealmTroops === 'function' && typeof A.domainRealmRecruitAvailable === 'function' && typeof A.realmRecruitTierForDomain === 'function');

  // tier by realm family count (the catalog's own populationFamilies thresholds, RR p.428)
  ok('tier: 160 → barony (floor), 100 → barony', A.realmRecruitTier(160) === 'barony' && A.realmRecruitTier(100) === 'barony');
  ok('tier: 960 → viscounty, 4600 → county', A.realmRecruitTier(960) === 'viscounty' && A.realmRecruitTier(4600) === 'county');
  ok('tier: 20000 → duchy, 364000 → kingdom', A.realmRecruitTier(20000) === 'duchy' && A.realmRecruitTier(364000) === 'kingdom');
  ok('tier: 1.5M → empire, 16M → continent', A.realmRecruitTier(1500000) === 'empire' && A.realmRecruitTier(16000000) === 'continent');

  // per-period availability (RR p.428 table cells)
  ok('county availability: light-inf 85 / heavy-inf 40 / horse-archers 10', A.realmMercAvailable('county', 'light-infantry') === 85 && A.realmMercAvailable('county', 'heavy-infantry') === 40 && A.realmMercAvailable('county', 'horse-archers') === 10);
  ok('barony availability: light-inf 3 / heavy-inf 2 / horse-archers null → 0', A.realmMercAvailable('barony', 'light-infantry') === 3 && A.realmMercAvailable('barony', 'heavy-infantry') === 2 && A.realmMercAvailable('barony', 'horse-archers') === 0);
  ok('continent light-infantry 340,000', A.realmMercAvailable('continent', 'light-infantry') === 340000);

  // fee spec + period days
  ok('fee spec: continent 6d10×1000, county 4d10×10, barony ×1', A.realmRecruitFeeSpec('continent').multiplierGp === 1000 && A.realmRecruitFeeSpec('continent').dice === '6d10' && A.realmRecruitFeeSpec('county').dice === '4d10' && A.realmRecruitFeeSpec('county').multiplierGp === 10 && A.realmRecruitFeeSpec('barony').multiplierGp === 1);
  ok('period days: barony/county week=7, duchy month=30, kingdom season=90, continent year=360', A.realmRecruitPeriodDays('barony') === 7 && A.realmRecruitPeriodDays('county') === 7 && A.realmRecruitPeriodDays('duchy') === 30 && A.realmRecruitPeriodDays('kingdom') === 90 && A.realmRecruitPeriodDays('continent') === 360);

  // a domain's tier from its realm families
  const dc = mkDomain(4600, 1, 'dom-rc'); dc.treasury = { gp: 1000000 };
  const camp = mkCamp([dc], 5);
  ok('realmRecruitTierForDomain: a 4,600-family domain → county', A.realmRecruitTierForDomain(camp, 'dom-rc') === 'county');
  ok('domainRealmRecruitAvailable: county light-infantry = 85 (fresh period)', A.domainRealmRecruitAvailable(camp, 'dom-rc', 'light-infantry') === 85);

  // recruit (instant) — a real equipped mercenary unit + the fee debited from the treasury
  const r = A.recruitRealmTroops(camp, 'dom-rc', { typeKey: 'light-infantry', count: 50, instant: true, rng: seq });
  ok('recruited 50 — a real light-infantry mercenary unit (not untrained-levy)', r && r.recruited === 50 && r.unit.unitTypeKey === 'light-infantry' && r.unit.source === 'mercenary' && r.unit.count === 50);
  ok('the merc unit draws the RAW mercenary wage (light-infantry = 6gp/mo)', r.unit.monthlyWage === 6);
  ok('stationed in the garrison + homeDomainId set + calledUp', r.unit.homeDomainId === 'dom-rc' && r.unit.calledUp === true && r.unit.stationedAt && r.unit.stationedAt.kind === 'domain-garrison');
  ok('a realm fee was rolled (4d10×10 = 40..400, multiple of 10) + debited from the treasury', r.feeGp >= 40 && r.feeGp <= 400 && r.feeGp % 10 === 0 && (1000000 - dc.treasury.gp) === r.feeGp);
  ok('availability decremented: 85 − 50 = 35 left this period', A.domainRealmRecruitAvailable(camp, 'dom-rc', 'light-infantry') === 35);

  // per-period cap: a second recruit clamps to what's left, then the period is exhausted
  const r2 = A.recruitRealmTroops(camp, 'dom-rc', { typeKey: 'light-infantry', count: 40, instant: true, rng: seq });
  ok('a 2nd recruit clamps to the 35 remaining this period', r2 && r2.recruited === 35);
  ok('the period is now exhausted for light-infantry → null', A.recruitRealmTroops(camp, 'dom-rc', { typeKey: 'light-infantry', count: 10, instant: true, rng: seq }) === null);

  // the availability REFRESHES next period (county period = a week)
  camp.currentDayInMonth = 9;   // > periodStartOrd(day 1) + 7
  ok('availability refreshes after the tier period — county light-infantry back to 85', A.domainRealmRecruitAvailable(camp, 'dom-rc', 'light-infantry') === 85);

  // recruiting is NOT blocked by domain morale — you hire FOREIGN mercenaries (RR distinction vs a levy)
  const reb = mkDomain(4600, -2, 'dom-reb'); reb.treasury = { gp: 100000 };
  const campReb = mkCamp([reb], 1);
  ok('a Turbulent realm (morale −2) can still recruit mercenaries (a levy could not)', A.canLevyFromDomain(reb) === false && !!A.recruitRealmTroops(campReb, 'dom-reb', { typeKey: 'heavy-infantry', count: 5, instant: true, rng: seq }));

  // a type the tier cannot field → null
  const bar = mkDomain(160, 1, 'dom-bar'); bar.treasury = { gp: 10000 };
  const campBar = mkCamp([bar], 1);
  ok('barony cannot field horse-archers (availability null) → recruit returns null', A.recruitRealmTroops(campBar, 'dom-bar', { typeKey: 'horse-archers', count: 1, instant: true, rng: seq }) === null);

  // STAGED arrival (the default) — ½/¼/remainder, riding the slot-46 muster consumer
  const dcS = mkDomain(4600, 1, 'dom-rs'); dcS.treasury = { gp: 1000000 };
  const campS = mkCamp([dcS], 5);
  const rs = A.recruitRealmTroops(campS, 'dom-rs', { typeKey: 'light-infantry', count: 50, rng: seq });
  ok('staged recruit starts with 0 arrived (it takes time)', A.unitActiveCount(rs.unit) === 0 && rs.unit.count === 0 && rs.unit.musterPending === 50);
  ok('county (week) schedule: 25/12/13 at +7/+14/+21', (() => { const s = rs.unit.musterState, st = s.startedAtOrd; return s.total === 50 && s.schedule.length === 3 && s.schedule[0].count === 25 && s.schedule[1].count === 12 && s.schedule[2].count === 13 && s.schedule[0].atOrd === st + 7 && s.schedule[1].atOrd === st + 14 && s.schedule[2].atOrd === st + 21; })());
  A.runDayTickToMonthEnd(campS);   // the source-agnostic slot-46 muster consumer tops them up over the month
  ok('after a month the recruited mercenaries are fully mustered (50 arrived)', A.unitActiveCount(rs.unit) === 50 && rs.unit.count === 50 && rs.unit.musterState === null);
  ok('the muster history names them "mercenaries" (the generalized noun)', rs.unit.history.some(h => h.type === 'mustered' && /mercenaries/.test(h.text)));

  // a DUCHY (month period) stages over MONTHS, not weeks — the period-aware schedule
  const dd = mkDomain(20000, 1, 'dom-du'); dd.treasury = { gp: 1000000 };
  const campD = mkCamp([dd], 1);
  const rd = A.recruitRealmTroops(campD, 'dom-du', { typeKey: 'light-infantry', count: 100, rng: seq });
  ok('duchy (month) schedule: 50/25/25 at +30/+60/+90', (() => { const s = rd.unit.musterState, st = s.startedAtOrd; return s.schedule[0].count === 50 && s.schedule[1].count === 25 && s.schedule[2].count === 25 && s.schedule[0].atOrd === st + 30 && s.schedule[1].atOrd === st + 60 && s.schedule[2].atOrd === st + 90; })());

  // the levy schedule is UNCHANGED (byte-identical) — a barony levy still stages over weeks (+7/+14/+21)
  const dl = mkDomain(1200, 1, 'dom-lvy'); const campL = mkCamp([dl], 5);
  const lv = A.levyConscripts(campL, 'dom-lvy', { count: 48 });
  ok('the levy path is unchanged: a 48-conscript levy still schedules 24/12/12 at +7/+14/+21', lv.musterState.schedule[0].count === 24 && lv.musterState.schedule[0].atOrd === lv.musterState.startedAtOrd + 7 && lv.musterState.schedule[2].atOrd === lv.musterState.startedAtOrd + 21);
}

// ─────────────────────────────────────────────────────────────────────────────
section('Realm-scale military-specialist recruitment + the lightweight↔full NPC doctrine (RR p.428/p.171; W7-continuation)');
{
  const seq = () => 0.5;   // deterministic 3d6: floor(0.5*6)+1 = 4 each → an ability rolls to 12

  ok('helpers exported', typeof A.realmSpecialistTypes === 'function' && typeof A.realmSpecialistAvailable === 'function' && typeof A.realmSpecialistProfile === 'function' && typeof A.recruitRealmSpecialist === 'function' && typeof A.domainRealmSpecialistAvailable === 'function' && typeof A.expandCharacterToFull === 'function');

  // catalog reads (RR p.428 specialist-availability — counts NEST under .availability, unlike the merc table)
  ok('realmSpecialistAvailable: county artillerist 10 / armorer 7; viscounty artillerist 2; barony armorer null→0', A.realmSpecialistAvailable('county', 'artillerist') === 10 && A.realmSpecialistAvailable('county', 'armorer') === 7 && A.realmSpecialistAvailable('viscounty', 'artillerist') === 2 && A.realmSpecialistAvailable('barony', 'armorer') === 0);
  ok('realmSpecialistTypes lists officers + specialists', (() => { const t = A.realmSpecialistTypes(); return t.includes('artillerist') && t.includes('armorer') && t.includes('mercenary-officer-captain') && t.includes('siege-engineer'); })());

  // the hire profile — mercenary officers carry EXACT RR p.171 characteristics (OFFICER_RANKS)
  const cap = A.realmSpecialistProfile('mercenary-officer-captain');
  ok('officer profile (Captain): isOfficer, L6, 800gp/mo, LA 4, SA 2 (RR p.171)', cap && cap.isOfficer === true && cap.level === 6 && cap.wageGp === 800 && cap.leadershipAbility === 4 && cap.strategicAbility === 2);
  ok('officer profile carries Command + Military Strategy proficiencies', Array.isArray(cap.proficiencies) && cap.proficiencies.some(p => /Command/.test(p)) && cap.proficiencies.some(p => /Military Strategy/.test(p)));
  const gen = A.realmSpecialistProfile('mercenary-officer-general');
  ok('officer profile (General): L10, 12,000gp/mo, LA 5, SA 3', gen.level === 10 && gen.wageGp === 12000 && gen.leadershipAbility === 5 && gen.strategicAbility === 3);
  // non-officer specialists: level 0 + best-effort wage (an exact HIRELING_SPECIALISTS id match → armorer 75; else 0/GM-set)
  const arm = A.realmSpecialistProfile('armorer');
  ok('armorer profile: not an officer, L0, wage 75 (HIRELING_SPECIALISTS match)', arm && arm.isOfficer === false && arm.level === 0 && arm.wageGp === 75);
  const art = A.realmSpecialistProfile('artillerist');
  ok('artillerist profile: not an officer, L0, wage 25 (best-effort HIRELING_SPECIALISTS match)', art && art.isOfficer === false && art.level === 0 && art.wageGp === 25);
  const chg = A.realmSpecialistProfile('creature-handler-giant-prehistoric');
  ok('an unmatched specialist → wage 0 (GM-set, not invented)', chg && chg.isOfficer === false && chg.level === 0 && chg.wageGp === 0);
  ok('unknown specialist type → null profile', A.realmSpecialistProfile('not-a-specialist') === null);

  // a domain's specialist availability (its own per-period ledger)
  const d = mkDomain(4600, 1, 'dom-sp');     // county
  const camp = mkCamp([d], 5); camp.specialistContracts = []; camp.currentDayInMonth = 1;
  const ruler = A.blankCharacter({ id: 'chr-ruler', name: 'The Count' }); camp.characters.push(ruler); d.rulerCharacterId = 'chr-ruler';
  ok('domainRealmSpecialistAvailable: county artillerist = 10 (fresh period)', A.domainRealmSpecialistAvailable(camp, 'dom-sp', 'artillerist') === 10);

  // recruit a LIGHTWEIGHT officer — a Character stub + a specialist contract, availability decremented
  const r = A.recruitRealmSpecialist(camp, 'dom-sp', { typeKey: 'mercenary-officer-captain', detailLevel: 'lightweight' });
  ok('recruited a lightweight Captain — a Character stub (socialTier specialist)', r && r.character && r.detailLevel === 'lightweight' && r.character.detailLevel === 'lightweight' && r.character.socialTier === 'specialist');
  ok('the captain stub carries the RAW wage (800) + level 6 + parsed officer profs', r.character.monthlyWage === 800 && r.character.level === 6 && Array.isArray(r.character.proficiencies) && r.character.proficiencies.some(p => p && p.key === 'command'));
  ok('lightweight = abilities left at the 10-default (unrolled)', r.character.abilities && r.character.abilities.STR === 10 && r.character.abilities.CHA === 10);
  ok('homed to the realm + lieged to the ruler', r.character.homeDomainId === 'dom-sp' && r.character.liegeCharacterId === 'chr-ruler');
  ok('a specialistContract was created to the ruler (wage stream + military category)', r.contract && r.contract.specialistCharacterId === r.character.id && r.contract.employerCharacterId === 'chr-ruler' && r.contract.wageStreamGpMo === 800 && r.contract.serviceCategory === 'military' && r.contract.status === 'active');
  ok('the character is on the campaign roster', camp.characters.includes(r.character));
  ok('availability decremented: county captain = 1 → none left', A.domainRealmSpecialistAvailable(camp, 'dom-sp', 'mercenary-officer-captain') === 0);

  // EXPAND the lightweight stub to full — the reusable doctrine primitive (seq 0.5 → each ability = 12)
  A.expandCharacterToFull(camp, r.character, { rng: seq });
  ok('expandCharacterToFull flips the flag to full', r.character.detailLevel === 'full');
  ok('expand rolled the abilities (seq 0.5 → 12 each)', r.character.abilities.STR === 12 && r.character.abilities.WIL === 12 && r.character.abilities.CHA === 12);
  ok('expand stamps the character history', r.character.history.some(h => h.type === 'expanded'));
  const snap = r.character.abilities.STR; A.expandCharacterToFull(camp, r.character, { rng: () => 0.99 });
  ok('expandCharacterToFull is idempotent on a full character (no re-roll)', r.character.abilities.STR === snap);

  // recruit a FULL specialist — rolled at creation
  const rf = A.recruitRealmSpecialist(camp, 'dom-sp', { typeKey: 'armorer', detailLevel: 'full', rng: seq });
  ok('a full-chargen armorer is created already-full with rolled abilities (12 each)', rf && rf.detailLevel === 'full' && rf.character.detailLevel === 'full' && rf.character.abilities.STR === 12);
  ok('the armorer carries the best-effort wage 75 + its own active contract', rf.character.monthlyWage === 75 && !!A.activeSpecialistContractFor(camp, rf.character.id));

  // a type the tier cannot field → null
  const bar = mkDomain(160, 1, 'dom-spb'); const campBar = mkCamp([bar], 1); campBar.specialistContracts = [];
  ok('a barony cannot field an armorer (availability null) → recruit returns null', A.recruitRealmSpecialist(campBar, 'dom-spb', { typeKey: 'armorer', detailLevel: 'lightweight' }) === null);

  // the specialist ledger is SEPARATE from the merc ledger — neither rollover wipes the other
  const d2 = mkDomain(4600, 1, 'dom-both'); d2.treasury = { gp: 1000000 }; const campB = mkCamp([d2], 5); campB.specialistContracts = []; campB.currentDayInMonth = 1;
  const r2 = A.blankCharacter({ id: 'chr-r2', name: 'Count Two' }); campB.characters.push(r2); d2.rulerCharacterId = 'chr-r2';
  A.recruitRealmSpecialist(campB, 'dom-both', { typeKey: 'artillerist', detailLevel: 'lightweight' });
  A.recruitRealmTroops(campB, 'dom-both', { typeKey: 'light-infantry', count: 50, instant: true, rng: seq });
  ok('a merc recruit did not wipe the specialist ledger (artillerist 10 − 1 = 9 left)', A.domainRealmSpecialistAvailable(campB, 'dom-both', 'artillerist') === 9);
  ok('a specialist recruit did not wipe the merc ledger (light-infantry 85 − 50 = 35 left)', A.domainRealmRecruitAvailable(campB, 'dom-both', 'light-infantry') === 35);

  // per-period refresh (county = a week)
  campB.currentDayInMonth = 9;
  ok('specialist availability refreshes after the tier period (artillerist back to 10)', A.domainRealmSpecialistAvailable(campB, 'dom-both', 'artillerist') === 10);
}

// ─────────────────────────────────────────────────────────────────────────────
section('Standing-army capacity (RR p.434 — Vassal Troops by Realm Size)');
{
  // vassalTroopsForRealmFamilies — tier from realm-family count (VASSAL_TROOPS' own thresholds).
  ok('1,150 families → Viscount (960 ≤ f < 4,600)', A.vassalTroopsForRealmFamilies(1150).key === 'viscount');
  ok('4,600 (the min) → Earl/Count', A.vassalTroopsForRealmFamilies(4600).key === 'earl-count');
  ok('20,000 → Duke', A.vassalTroopsForRealmFamilies(20000).key === 'duke');
  ok('1,500,000 → Emperor', A.vassalTroopsForRealmFamilies(1500000).key === 'emperor');
  ok('150 → Baron (120 ≤ f < 960)', A.vassalTroopsForRealmFamilies(150).key === 'baron');
  ok('50 (below Baron min) → floors at Baron', A.vassalTroopsForRealmFamilies(50).key === 'baron');
  const visc = A.vassalTroopsForRealmFamilies(1150);
  ok('Viscount carries the RAW caps (army 130 / budget 2,560 / garrison 640)',
     visc.maxStandingArmy.max === 130 && visc.maxRealmTroopsWages.max === 2560 && visc.avgPersonalGarrisonWages === 640);

  // realmStandingArmyCapacity — tier caps + the realm's current fielded force.
  const d = mkDomain(1150, 1, 'dom-realm'); const camp = mkCamp([d], 1);
  const u1 = A.blankUnit({ unitTypeKey: 'light-infantry', count: 80, displayName: 'Foot' }); u1.homeDomainId = 'dom-realm'; u1.count = 80;
  const u2 = A.blankUnit({ unitTypeKey: 'heavy-infantry', count: 30, displayName: 'Heavy' }); u2.homeDomainId = 'dom-realm'; u2.count = 30;
  camp.units.push(u1, u2);
  const cap = A.realmStandingArmyCapacity(camp, 'dom-realm');
  ok('capacity read: Viscount tier', cap && cap.tier === 'viscount' && cap.title === 'Viscount');
  ok('capacity read: realm families 1,150', cap.realmFamilies === 1150);
  ok('capacity read: RAW caps surfaced (army 130 / budget 2,560 / garrison 640)',
     cap.maxStandingArmy === 130 && cap.maxRealmTroopsWages === 2560 && cap.avgPersonalGarrisonWages === 640);
  ok('capacity read: current realm troops = 110 (80 + 30)', cap.currentRealmTroops === 110);
  ok('capacity read: a positive monthly wage bill', cap.currentRealmTroopWages > 0);
  ok('capacity read: 110 ≤ 130 fits the army cap', cap.fitsArmyCap === true);
  ok('capacity read: text fields carried (maxStandingArmyText)', cap.maxStandingArmyText === '100 - 130');

  // over the RAW capacity — a baron fielding 50 (max standing army 20).
  const db = mkDomain(150, 1, 'dom-baron'); const campB = mkCamp([db], 1);
  const ub = A.blankUnit({ unitTypeKey: 'light-infantry', count: 50 }); ub.homeDomainId = 'dom-baron'; ub.count = 50; campB.units.push(ub);
  const capB = A.realmStandingArmyCapacity(campB, 'dom-baron');
  ok('over-cap: Baron tier, 50 troops > the RAW max 20 → fitsArmyCap false',
     capB.tier === 'baron' && capB.currentRealmTroops === 50 && capB.maxStandingArmy === 20 && capB.fitsArmyCap === false);

  // a unit homed in a NON-realm domain is not counted.
  const uOther = A.blankUnit({ unitTypeKey: 'light-infantry', count: 40 }); uOther.homeDomainId = 'dom-elsewhere'; uOther.count = 40; camp.units.push(uOther);
  ok('a foreign-homed unit is not counted in the realm force (still 110)',
     A.realmStandingArmyCapacity(camp, 'dom-realm').currentRealmTroops === 110);

  ok('unknown domain → null', A.realmStandingArmyCapacity(camp, 'dom-nope') === null);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('');
console.log(fail === 0 ? ('PASS troops-depth.smoke.js — ' + pass + ' assertions') : ('FAIL troops-depth.smoke.js — ' + fail + ' of ' + (pass + fail) + ' failed'));
if(fail > 0){ failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
