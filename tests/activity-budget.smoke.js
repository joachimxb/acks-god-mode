/* tests/activity-budget.smoke.js — Activity Budget (#346) AB-1 smoke suite.
 *
 *   node tests/activity-budget.smoke.js   (or via `npm test`)
 *
 * Covers the per-character activity budget data layer (Phase_2.95_Activity_Budget_Plan.md AB-1;
 * Architecture.md §3.13 derive-don't-store + §7 the actor-time stack):
 *   - the ACTIVITY_BUDGET constants + the ACTIVITY_COSTS taxonomy + activityCostFor()
 *   - the characterActivityBudget() derived accessor: undertaking-derived buckets
 *     (active journeys → travel/rest; magistracies → domain-admin), the RAW
 *     1-dedicated-+-4-ancillary over-budget check, and the RR p.279 strenuous→rest read.
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

// minimal hand-built fixture — the accessor reads only campaign.characters / .journeys /
// .magistracies / .houseRules, so we build exactly those (faithful to the real shapes
// journeysWithParticipant + magistraciesByCharacter read).
function mkCampaign(over) {
  return Object.assign({ characters: [], journeys: [], magistracies: [], houseRules: {} }, over || {});
}
const mkChar = (id, over) => Object.assign({ id, personalFatigue: 0 }, over || {});
const mkJourney = (id, chars, status) => ({ id, participantCharacterIds: chars, status });
const mkMag = (id, chr, dom, role) => ({ id, magistrateCharacterId: chr, domainId: dom, role, status: 'active' });

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

const cMag = mkCampaign({ characters: [mkChar('chr-a')], magistracies: [mkMag('mag-1', 'chr-a', 'dom-1', 'steward')] });
const bMag = ACKS.characterActivityBudget(cMag, 'chr-a');
ok('magistrate: 1 dedicated = domain-admin', bMag.dedicatedUsed === 1 && bMag.dedicated[0].kind === 'domain-admin');
ok('magistrate: source is the domain', bMag.dedicated[0].sourceKind === 'domain' && bMag.dedicated[0].sourceId === 'dom-1');

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
  magistracies: [mkMag('mag-1', 'chr-a', 'dom-1', 'steward')],
});
const bTwo = ACKS.characterActivityBudget(cTwo, 'chr-a');
ok('two dedicated: counted', bTwo.dedicatedUsed === 2);
ok('two dedicated: over budget', bTwo.overBudget === true);
ok('two dedicated: reason names dedicated cap', /dedicated/.test(bTwo.overReason || ''));

// two magistracies in the SAME domain dedupe to one administration.
const cDup = mkCampaign({
  characters: [mkChar('chr-a')],
  magistracies: [mkMag('mag-1', 'chr-a', 'dom-1', 'steward'), mkMag('mag-2', 'chr-a', 'dom-1', 'captain')],
});
ok('same-domain roles dedupe to one admin', ACKS.characterActivityBudget(cDup, 'chr-a').dedicatedUsed === 1);
// two magistracies in DIFFERENT domains = two administrations → over budget.
const cTwoDom = mkCampaign({
  characters: [mkChar('chr-a')],
  magistracies: [mkMag('mag-1', 'chr-a', 'dom-1', 'steward'), mkMag('mag-2', 'chr-a', 'dom-2', 'steward')],
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
console.log('\n' + (fail ? 'FAIL' : 'PASS') + ' — activity-budget.smoke: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('Failures:\n  ' + failures.join('\n  ')); process.exit(1); }
