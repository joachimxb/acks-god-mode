/* tests/activity-budget.smoke.js — Activity Budget (#346) AB-1 smoke suite.
 *
 *   node tests/activity-budget.smoke.js   (or via `npm test`)
 *
 * Covers the per-character activity budget data layer (Phase_2.95_Activity_Budget_Plan.md AB-1;
 * Architecture.md §3.13 derive-don't-store + §7 the actor-time stack):
 *   - the ACTIVITY_BUDGET constants + the ACTIVITY_COSTS taxonomy + activityCostFor()
 *   - the characterActivityBudget() derived accessor: undertaking-derived buckets
 *     (active journeys → travel/rest; domains administered THIS month → domain-admin —
 *     gated on the administers-this-month lever, RR p.344/349, not mere office-holding),
 *     the RAW 1-dedicated-+-4-ancillary over-budget check, and the RR p.279 strenuous→rest read.
 */
'use strict';
const path = require('path');

const DIR = path.join(__dirname, '..');
[
  'acks-engine-catalogs.js',
  'acks-engine.js',
  'acks-engine-entities.js',
  'acks-engine-entity-registry.js',
  'acks-engine-field-schemas.js',
  'acks-engine-events.js',
  'acks-engine-subsystems.js',
].forEach(f => require(path.join(DIR, f)));
const ACKS = global.ACKS;

// ─── tiny assertion harness ───
let pass = 0, fail = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); }
}
function section(t) { console.log('\n— ' + t); }

// minimal hand-built fixture — the accessor reads campaign.characters / .journeys / .domains /
// .houseRules, so we build exactly those (faithful to the real shapes journeysWithParticipant
// reads + the domain.magistrates[role] map the domain-admin gate reads).
function mkCampaign(over) {
  return Object.assign({ characters: [], journeys: [], domains: [], houseRules: {} }, over || {});
}
const mkChar = (id, over) => Object.assign({ id, personalFatigue: 0 }, over || {});
const mkJourney = (id, chars, status) => ({ id, participantCharacterIds: chars, status });
// A domain carrying the administers-this-month lever the budget gates domain-admin on (RR p.344/349):
// domain.administersThisMonth (ruler) + domain.magistrates[role].administersThisMonth (officer).
const mkDomain = (id, over) => Object.assign({ id, rulerCharacterId: null, administersThisMonth: false, magistrates: {} }, over || {});
const mkMagSlot = (chr, administering) => ({ characterId: chr, administersThisMonth: !!administering });

// =============================================================================
section('ACTIVITY_BUDGET constants (RR p.272 / JJ pp.99–100)');
// =============================================================================
ok('budget exported', !!ACKS.ACTIVITY_BUDGET);
ok('1 dedicated/day', ACKS.ACTIVITY_BUDGET.dedicatedPerDay === 1);
ok('4 ancillary alongside a dedicated', ACKS.ACTIVITY_BUDGET.ancillaryPerDedicatedDay === 4);
ok('12 ancillary on a no-dedicated day', ACKS.ACTIVITY_BUDGET.ancillaryMaxPerDay === 12);

// =============================================================================
section('ACTIVITY_COSTS + activityCostFor()');
// =============================================================================
ok('travel = dedicated + strenuous', ACKS.activityCostFor('travel').cost === 'dedicated' && ACKS.activityCostFor('travel').strenuous === true);
ok('rest = dedicated, not strenuous', ACKS.activityCostFor('rest').cost === 'dedicated' && ACKS.activityCostFor('rest').strenuous === false);
ok('domain-admin = dedicated', ACKS.activityCostFor('domain-admin').cost === 'dedicated');
ok('hunt = dedicated + strenuous', ACKS.activityCostFor('hunt').cost === 'dedicated' && ACKS.activityCostFor('hunt').strenuous === true);
ok('forage = ancillary', ACKS.activityCostFor('forage').cost === 'ancillary');
ok('decree = ancillary', ACKS.activityCostFor('decree').cost === 'ancillary');
ok('market-transaction = ancillary + loadMetered', ACKS.activityCostFor('market-transaction').cost === 'ancillary' && ACKS.activityCostFor('market-transaction').loadMetered === true);
ok('venture = dedicated', ACKS.activityCostFor('venture').cost === 'dedicated');
ok('unknown kind → defaulted ancillary', (() => { const c = ACKS.activityCostFor('not-a-real-kind'); return c.cost === 'ancillary' && c.defaulted === true; })());
ok('every cost is a valid slot', Object.values(ACKS.ACTIVITY_COSTS).every(c => ['dedicated', 'ancillary', 'incidental'].includes(c.cost)));

// =============================================================================
section('characterActivityBudget() — empty + single undertakings');
// =============================================================================
const cEmpty = mkCampaign({ characters: [mkChar('chr-a')] });
const bEmpty = ACKS.characterActivityBudget(cEmpty, 'chr-a');
ok('empty: no dedicated', bEmpty.dedicatedUsed === 0);
ok('empty: no ancillary', bEmpty.ancillaryUsed === 0);
ok('empty: not over budget', bEmpty.overBudget === false);
ok('empty: charId echoed', bEmpty.charId === 'chr-a');

const cTravel = mkCampaign({ characters: [mkChar('chr-a')], journeys: [mkJourney('jrn-1', ['chr-a'], 'in-transit')] });
const bTravel = ACKS.characterActivityBudget(cTravel, 'chr-a');
ok('travelling: 1 dedicated', bTravel.dedicatedUsed === 1);
ok('travelling: it is travel', bTravel.dedicated[0].kind === 'travel' && bTravel.dedicated[0].sourceKind === 'journey');
ok('travelling: strenuous flagged', bTravel.dedicated[0].strenuous === true);
ok('travelling: not over budget', bTravel.overBudget === false);

const cRest = mkCampaign({ characters: [mkChar('chr-a')], journeys: [mkJourney('jrn-1', ['chr-a'], 'resting')] });
const bRest = ACKS.characterActivityBudget(cRest, 'chr-a');
ok('resting: 1 dedicated = rest', bRest.dedicatedUsed === 1 && bRest.dedicated[0].kind === 'rest');
ok('resting: not strenuous', bRest.dedicated[0].strenuous === false);

// Holding a magistracy but NOT administering this month → no dedicated day (RAW: the activity is
// administering — the +1-morale lever — not holding the office).
const cHold = mkCampaign({ characters: [mkChar('chr-a')], domains: [mkDomain('dom-1', { magistrates: { steward: mkMagSlot('chr-a', false) } })] });
ok('magistrate holding, NOT administering: no domain-admin', ACKS.characterActivityBudget(cHold, 'chr-a').dedicatedUsed === 0);

// An administering magistrate → 1 dedicated domain-admin.
const cMag = mkCampaign({ characters: [mkChar('chr-a')], domains: [mkDomain('dom-1', { magistrates: { steward: mkMagSlot('chr-a', true) } })] });
const bMag = ACKS.characterActivityBudget(cMag, 'chr-a');
ok('magistrate administering: 1 dedicated = domain-admin', bMag.dedicatedUsed === 1 && bMag.dedicated[0].kind === 'domain-admin');
ok('magistrate administering: source is the domain', bMag.dedicated[0].sourceKind === 'domain' && bMag.dedicated[0].sourceId === 'dom-1');

// An administering RULER also spends the dedicated day (the old version missed rulers entirely).
const cRuler = mkCampaign({ characters: [mkChar('chr-a')], domains: [mkDomain('dom-1', { rulerCharacterId: 'chr-a', administersThisMonth: true })] });
ok('ruler administering: 1 dedicated = domain-admin', ACKS.characterActivityBudget(cRuler, 'chr-a').dedicatedUsed === 1);
// A ruler who hasn't ticked the lever spends nothing.
const cRulerOff = mkCampaign({ characters: [mkChar('chr-a')], domains: [mkDomain('dom-1', { rulerCharacterId: 'chr-a', administersThisMonth: false })] });
ok('ruler NOT administering: no domain-admin', ACKS.characterActivityBudget(cRulerOff, 'chr-a').dedicatedUsed === 0);
// opts.domains overrides campaign.domains (the live-app domains-split): same gate, passed via opts.
ok('opts.domains honored', ACKS.characterActivityBudget(mkCampaign({ characters: [mkChar('chr-a')] }), 'chr-a', { domains: [mkDomain('dom-1', { rulerCharacterId: 'chr-a', administersThisMonth: true })] }).dedicatedUsed === 1);

// =============================================================================
section('characterActivityBudget() — inactive undertakings are not counted');
// =============================================================================
const cPlanning = mkCampaign({ characters: [mkChar('chr-a')], journeys: [mkJourney('jrn-1', ['chr-a'], 'planning')] });
ok('planning journey not counted', ACKS.characterActivityBudget(cPlanning, 'chr-a').dedicatedUsed === 0);
const cArrived = mkCampaign({ characters: [mkChar('chr-a')], journeys: [mkJourney('jrn-1', ['chr-a'], 'arrived')] });
ok('arrived journey not counted', ACKS.characterActivityBudget(cArrived, 'chr-a').dedicatedUsed === 0);
const cOther = mkCampaign({ characters: [mkChar('chr-a'), mkChar('chr-b')], journeys: [mkJourney('jrn-1', ['chr-b'], 'in-transit')] });
ok("another char's journey not mine", ACKS.characterActivityBudget(cOther, 'chr-a').dedicatedUsed === 0);

// =============================================================================
section('characterActivityBudget() — over-budget detection');
// =============================================================================
// travelling AND administering = two dedicated tasks → over budget (RAW: max 1 dedicated/day).
const cTwo = mkCampaign({
  characters: [mkChar('chr-a')],
  journeys: [mkJourney('jrn-1', ['chr-a'], 'in-transit')],
  domains: [mkDomain('dom-1', { rulerCharacterId: 'chr-a', administersThisMonth: true })],
});
const bTwo = ACKS.characterActivityBudget(cTwo, 'chr-a');
ok('two dedicated: counted', bTwo.dedicatedUsed === 2);
ok('two dedicated: over budget', bTwo.overBudget === true);
ok('two dedicated: reason names dedicated cap', /dedicated/.test(bTwo.overReason || ''));

// Ruler AND an administering officer in the SAME domain dedupe to one administration.
const cDup = mkCampaign({
  characters: [mkChar('chr-a')],
  domains: [mkDomain('dom-1', { rulerCharacterId: 'chr-a', administersThisMonth: true, magistrates: { steward: mkMagSlot('chr-a', true) } })],
});
ok('same-domain ruler+officer dedupe to one admin', ACKS.characterActivityBudget(cDup, 'chr-a').dedicatedUsed === 1);
// administering two DIFFERENT domains = two administrations → over budget.
const cTwoDom = mkCampaign({
  characters: [mkChar('chr-a')],
  domains: [mkDomain('dom-1', { rulerCharacterId: 'chr-a', administersThisMonth: true }), mkDomain('dom-2', { magistrates: { steward: mkMagSlot('chr-a', true) } })],
});
ok('two-domain admin = over budget', ACKS.characterActivityBudget(cTwoDom, 'chr-a').overBudget === true);

// =============================================================================
section('characterActivityBudget() — strenuous → rest fatigue (RR p.279)');
// =============================================================================
const cTired = mkCampaign({ characters: [mkChar('chr-a', { personalFatigue: 6 })] });
ok('fatigue counter read from character', ACKS.characterActivityBudget(cTired, 'chr-a').strenuousDays === 6);
ok('6 strenuous days = fatigued (RAW default)', ACKS.characterActivityBudget(cTired, 'chr-a').fatigued === true);
const cFresh = mkCampaign({ characters: [mkChar('chr-a', { personalFatigue: 3 })] });
ok('3 strenuous days = not fatigued', ACKS.characterActivityBudget(cFresh, 'chr-a').fatigued === false);
const cSimpl = mkCampaign({ characters: [mkChar('chr-a', { personalFatigue: 6 })], houseRules: { 'simplified-fatigue': true } });
ok('simplified-fatigue ON → never forced-fatigued', ACKS.characterActivityBudget(cSimpl, 'chr-a').fatigued === false);

// =============================================================================
section('activityRejectAffordance() — the Current Activities reject contract (Joachim 2026-06-05)');
// =============================================================================
// Reject reaches back to the source; the undo differs by the source's temporal nature.
ok('domain admin → reverse (untick the standing commitment)', ACKS.activityRejectAffordance({ sourceKind: 'domain' }).mode === 'reverse');
const affMkt = ACKS.activityRejectAffordance({ sourceKind: 'errand-event', kind: 'market-transaction' });
ok('market errand → reverse, labelled "Refund"', affMkt.mode === 'reverse' && affMkt.label === 'Refund');
ok("journey → navigate (a travelled day can't be rewound)", ACKS.activityRejectAffordance({ sourceKind: 'journey' }).mode === 'navigate');
ok('a non-market errand → none (not reversible yet)', ACKS.activityRejectAffordance({ sourceKind: 'errand-event', kind: 'carouse' }).mode === 'none');
ok('null activity → none', ACKS.activityRejectAffordance(null).mode === 'none');

// =============================================================================
section('characterActivityBudget() — a reversed errand drops out of the day (reverseMarketTransaction)');
// =============================================================================
{
  const entry = (rev) => ({
    appliedAtTurn: 1, appliedAtDay: 1,
    event: { id: 'ev-' + (rev ? 'r' : 'n'), kind: 'market-transaction', appliedAtTurn: 1, appliedAtDay: 1,
      payload: { actorCharacterId: 'chr-a', activityCost: { slot: 'ancillary', units: 1, kind: 'market-transaction' }, reversed: !!rev } }
  });
  const cLive = mkCampaign({ currentTurn: 1, currentDayInMonth: 1, characters: [mkChar('chr-a')], eventLog: [entry(false)] });
  ok('a live errand counts toward the day', ACKS.characterActivityBudget(cLive, 'chr-a').ancillaryUsed === 1);
  const cRev = mkCampaign({ currentTurn: 1, currentDayInMonth: 1, characters: [mkChar('chr-a')], eventLog: [entry(true)] });
  ok('a reversed errand is skipped', ACKS.characterActivityBudget(cRev, 'chr-a').ancillaryUsed === 0);
}

// =============================================================================
console.log('\n' + (fail ? 'FAIL' : 'PASS') + ' — activity-budget.smoke: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('Failures:\n  ' + failures.join('\n  ')); process.exit(1); }
