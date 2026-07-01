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
require('./_engine.js').load();
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
ok('research = dedicated, not strenuous', ACKS.activityCostFor('research').cost === 'dedicated' && ACKS.activityCostFor('research').strenuous === false);
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

// Foraging-for-water on the march adds an ancillary (RR p.272 — a normal-pace day leaves ancillary
// hours free to forage) — but only when the hex has no free source (a river/lake/settlement is free).
const cForageDry = mkCampaign({ characters: [mkChar('chr-a')], hexes: [{ id: 'hex-dry', terrain: 'mountains' }],
  journeys: [{ id: 'jrn-1', participantCharacterIds: ['chr-a'], status: 'in-transit', pace: 'normal', currentHexId: 'hex-dry', forageWaterEnabled: true }] });
const bForageDry = ACKS.characterActivityBudget(cForageDry, 'chr-a');
ok('foraging on a dry hex: travel (1 ded) + forage (1 anc)', bForageDry.dedicatedUsed === 1 && bForageDry.ancillaryUsed === 1 && bForageDry.ancillary.some(a => a.kind === 'forage'));
ok('foraging on a dry hex: not over budget (1 ded + 1 anc fits)', bForageDry.overBudget === false);
const cForageWet = mkCampaign({ characters: [mkChar('chr-a')], hexes: [{ id: 'hex-wet', terrain: 'plains', hasLake: true }],
  journeys: [{ id: 'jrn-1', participantCharacterIds: ['chr-a'], status: 'in-transit', pace: 'normal', currentHexId: 'hex-wet', forageWaterEnabled: true }] });
ok('foraging where water is free: no forage activity', !ACKS.characterActivityBudget(cForageWet, 'chr-a').ancillary.some(a => a.kind === 'forage'));
const cNoForage = mkCampaign({ characters: [mkChar('chr-a')], hexes: [{ id: 'hex-dry', terrain: 'mountains' }],
  journeys: [{ id: 'jrn-1', participantCharacterIds: ['chr-a'], status: 'in-transit', pace: 'normal', currentHexId: 'hex-dry', forageWaterEnabled: false }] });
ok('not foraging: no forage activity', !ACKS.characterActivityBudget(cNoForage, 'chr-a').ancillary.some(a => a.kind === 'forage'));

// "What happened today": a journey that TRAVELLED today still counts its travel for today even after it
// ARRIVES (Complete-Movement-to-arrival keeps the clock on the arrival day; lastTravelWorldOrd === today).
const cArrivedToday = mkCampaign({ characters: [mkChar('chr-a')], currentTurn: 1, currentDayInMonth: 5,
  journeys: [{ id: 'jrn-1', participantCharacterIds: ['chr-a'], status: 'arrived', pace: 'normal', lastTravelWorldOrd: 1 * 30 + 5 }] });
ok('arrived-today journey still counts travel for today', ACKS.characterActivityBudget(cArrivedToday, 'chr-a').dedicated.some(a => a.kind === 'travel'));
// …but a journey that travelled YESTERDAY (a Day-Clock advance moved the clock past the leg) does not.
const cArrivedYesterday = mkCampaign({ characters: [mkChar('chr-a')], currentTurn: 1, currentDayInMonth: 6,
  journeys: [{ id: 'jrn-1', participantCharacterIds: ['chr-a'], status: 'arrived', pace: 'normal', lastTravelWorldOrd: 1 * 30 + 5 }] });
ok('arrived journey that travelled yesterday does NOT count today', !ACKS.characterActivityBudget(cArrivedYesterday, 'chr-a').dedicated.some(a => a.kind === 'travel'));
// the arrived-today journey also carries its forage for that day (dry hex + forageWaterEnabled)
const cArrivedForage = mkCampaign({ characters: [mkChar('chr-a')], currentTurn: 1, currentDayInMonth: 5, hexes: [{ id: 'hex-dry', terrain: 'mountains' }],
  journeys: [{ id: 'jrn-1', participantCharacterIds: ['chr-a'], status: 'arrived', pace: 'normal', currentHexId: 'hex-dry', forageWaterEnabled: true, lastTravelWorldOrd: 1 * 30 + 5 }] });
ok('arrived-today journey still counts its foraging for today', ACKS.characterActivityBudget(cArrivedForage, 'chr-a').ancillary.some(a => a.kind === 'forage'));

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
// Single home (refactor 2026-06-05): the budget reads campaign.domains directly; the legacy
// opts.domains escape hatch is gone, so an opts.domains is IGNORED and campaign.domains wins.
ok('campaign.domains gates domain-admin (opts.domains ignored)', ACKS.characterActivityBudget(mkCampaign({ characters: [mkChar('chr-a')], domains: [mkDomain('dom-1', { rulerCharacterId: 'chr-a', administersThisMonth: true })] }), 'chr-a', { domains: [] }).dedicatedUsed === 1);

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
section('characterActivityBudget() — over-budget detection (non-travel double-booking)');
// =============================================================================
// The cap (below) governs TRAVEL pace, so travel never pushes a character over budget. A genuine
// non-travel double-dedicated (administering two domains) still trips the over-budget check.
const cTwoDom = mkCampaign({
  characters: [mkChar('chr-a')],
  domains: [mkDomain('dom-1', { rulerCharacterId: 'chr-a', administersThisMonth: true }), mkDomain('dom-2', { magistrates: { steward: mkMagSlot('chr-a', true) } })],
});
const bTwoDom = ACKS.characterActivityBudget(cTwoDom, 'chr-a');
ok('two-domain admin: 2 dedicated counted', bTwoDom.dedicatedUsed === 2);
ok('two-domain admin: over budget', bTwoDom.overBudget === true);
ok('two-domain admin: reason names the dedicated cap', /dedicated/.test(bTwoDom.overReason || ''));
// Ruler AND an administering officer in the SAME domain dedupe to one administration.
const cDup = mkCampaign({
  characters: [mkChar('chr-a')],
  domains: [mkDomain('dom-1', { rulerCharacterId: 'chr-a', administersThisMonth: true, magistrates: { steward: mkMagSlot('chr-a', true) } })],
});
ok('same-domain ruler+officer dedupe to one admin', ACKS.characterActivityBudget(cDup, 'chr-a').dedicatedUsed === 1);

// =============================================================================
section('characterActivityBudget() — travel cost by pace (uncapped, solo journey, RR p.272 / JJ)');
// =============================================================================
// full expedition speed = the DEDICATED activity; half speed = 4 ANCILLARY hours (½ of 24); forced
// march = the WHOLE day (1 dedicated + 4 ancillary, +50%); halted = nothing.
const jrnPace = (pace, status, members) => ({ id: 'jrn-1', participantCharacterIds: members || ['chr-a'], status: status || 'in-transit', pace });
const adminD = () => mkDomain('dom-1', { rulerCharacterId: 'chr-a', administersThisMonth: true });
const bNormal = ACKS.characterActivityBudget(mkCampaign({ characters: [mkChar('chr-a')], journeys: [jrnPace('normal')] }), 'chr-a');
ok('normal travel = 1 dedicated, 0 ancillary', bNormal.dedicatedUsed === 1 && bNormal.ancillaryUsed === 0);
ok('normal travel shows in the dedicated bucket', (bNormal.dedicated[0] || {}).cost === 'dedicated');
const bHalf = ACKS.characterActivityBudget(mkCampaign({ characters: [mkChar('chr-a')], journeys: [jrnPace('half-speed')] }), 'chr-a');
ok('half speed = 0 dedicated, 4 ancillary', bHalf.dedicatedUsed === 0 && bHalf.ancillaryUsed === 4);
ok('half speed is ONE entry (not four)', bHalf.ancillary.length === 1 && bHalf.ancillary[0].ancillaryUnits === 4);
ok('half speed alone is within budget', bHalf.overBudget === false);
const bForced = ACKS.characterActivityBudget(mkCampaign({ characters: [mkChar('chr-a')], journeys: [jrnPace('forced-march')] }), 'chr-a');
ok('forced march = 1 dedicated + 4 ancillary (the whole day)', bForced.dedicatedUsed === 1 && bForced.ancillaryUsed === 4);
ok('forced march alone fills the day but is not over', bForced.overBudget === false);
ok('forced march is strenuous', bForced.dedicated[0].strenuous === true);

// =============================================================================
section('travel pace is CAPPED by the day\'s other activities (Joachim 2026-06-05, "like encumbrance")');
// =============================================================================
// journeyMaxPace = fastest pace the PARTY can sustain (slowest traveller's cap); journeyEffectivePace
// = the GM's desired pace, capped. The budget charges the EFFECTIVE pace, so travel never goes over.
const mp = (camp, j) => ACKS.journeyMaxPace(camp, j).maxPace;          // reads campaign.domains (single home)
const eff = (camp, j) => ACKS.journeyEffectivePace(camp, j);          // reads campaign.domains (single home)
const cFree = mkCampaign({ characters: [mkChar('chr-a')], journeys: [jrnPace('forced-march')] });
ok('nobody busy: maxPace = forced-march (no cap)', mp(cFree, cFree.journeys[0]) === 'forced-march');
// administering → the dedicated slot is taken, so full/forced travel is unavailable → capped to half.
const cAdmin = mkCampaign({ characters: [mkChar('chr-a')], journeys: [jrnPace('normal')], domains: [adminD()] });
ok('administering: maxPace = half-speed', mp(cAdmin, cAdmin.journeys[0]) === 'half-speed');
ok('administering: a NORMAL journey is capped to half-speed', eff(cAdmin, cAdmin.journeys[0]) === 'half-speed');
ok('administering + capped journey = within budget (1 ded + 4 anc, NOT over)', (() => { const b = ACKS.characterActivityBudget(cAdmin, 'chr-a', { domains: cAdmin.domains }); return b.overBudget === false && b.dedicatedUsed === 1 && b.ancillaryUsed === 4; })());
const cAdminForced = mkCampaign({ characters: [mkChar('chr-a')], journeys: [jrnPace('forced-march')], domains: [adminD()] });
ok('administering: a FORCED march is capped to half-speed too', eff(cAdminForced, cAdminForced.journeys[0]) === 'half-speed');
// administering + 4 ancillary errands → no room even for half speed's 4 ancillary → capped to HALTED.
const errands = [1, 2, 3, 4].map(i => ({ appliedAtTurn: 1, appliedAtDay: 1, event: { id: 'ev-' + i, kind: 'market-transaction', appliedAtTurn: 1, appliedAtDay: 1, payload: { actorCharacterId: 'chr-a', activityCost: { slot: 'ancillary', units: 1, kind: 'market-transaction' } } } }));
const cFull = mkCampaign({ characters: [mkChar('chr-a')], journeys: [jrnPace('normal')], domains: [adminD()], currentTurn: 1, currentDayInMonth: 1, eventLog: errands });
ok('administering + 4 errands: maxPace = halted', mp(cFull, cFull.journeys[0]) === 'halted');
ok('a halted journey costs nothing (incidental) — admin + 4 errands stay within budget', (() => { const b = ACKS.characterActivityBudget(cFull, 'chr-a', { domains: cFull.domains }); return b.dedicatedUsed === 1 && b.ancillaryUsed === 4 && b.overBudget === false && b.incidental.some(a => a.kind === 'travel'); })());
// the PARTY cap = the slowest traveller: an administering member caps a free companion too.
const cParty = mkCampaign({ characters: [mkChar('chr-a'), mkChar('chr-b')], journeys: [jrnPace('forced-march', 'in-transit', ['chr-a', 'chr-b'])], domains: [adminD()] });
ok('party cap = slowest traveller (an admin member caps the party to half speed)', mp(cParty, cParty.journeys[0]) === 'half-speed');
ok('the free companion travels at the capped half speed too', (() => { const b = ACKS.characterActivityBudget(cParty, 'chr-b', { domains: cParty.domains }); return b.ancillaryUsed === 4 && b.dedicatedUsed === 0; })());

// =============================================================================
section('characterActivityBudget() — magic research (AB-4; budget plan §13)');
// =============================================================================
// An in-progress research project dedicates the researcher's (and each assistant's) day — RR p.388,
// budget plan §13. awaiting-throw / completed are not ongoing work. Derived from campaign.researchProjects.
const mkResearch = (id, researcher, assistants, status) => ({ id, researcherCharacterId: researcher, assistantCharacterIds: assistants || [], status: status || 'in-progress', name: "Vale's Salt-Ward" });
const cRes = mkCampaign({ characters: [mkChar('chr-a'), mkChar('chr-b')], researchProjects: [mkResearch('rsp-1', 'chr-a', ['chr-b'], 'in-progress')] });
const bRes = ACKS.characterActivityBudget(cRes, 'chr-a');
ok('researcher: 1 dedicated = research', bRes.dedicatedUsed === 1 && bRes.dedicated[0].kind === 'research');
ok('researcher: source is the project', bRes.dedicated[0].sourceKind === 'research-project' && bRes.dedicated[0].sourceId === 'rsp-1');
ok('researcher: research is not strenuous', bRes.dedicated[0].strenuous === false);
ok('assistant also dedicates a day', ACKS.characterActivityBudget(cRes, 'chr-b').dedicatedUsed === 1);
ok('assistant label flags assisting', /assisting/.test((ACKS.characterActivityBudget(cRes, 'chr-b').dedicated[0] || {}).label || ''));
const cAwait = mkCampaign({ characters: [mkChar('chr-a')], researchProjects: [mkResearch('rsp-1', 'chr-a', [], 'awaiting-throw')] });
ok('awaiting-throw research is not ongoing → not counted', ACKS.characterActivityBudget(cAwait, 'chr-a').dedicatedUsed === 0);
const cDoneR = mkCampaign({ characters: [mkChar('chr-a')], researchProjects: [mkResearch('rsp-1', 'chr-a', [], 'completed')] });
ok('completed research not counted', ACKS.characterActivityBudget(cDoneR, 'chr-a').dedicatedUsed === 0);
const cResAdmin = mkCampaign({ characters: [mkChar('chr-a')], researchProjects: [mkResearch('rsp-1', 'chr-a', [], 'in-progress')], domains: [mkDomain('dom-1', { rulerCharacterId: 'chr-a', administersThisMonth: true })] });
ok('research + administering a domain = over budget (2 dedicated)', ACKS.characterActivityBudget(cResAdmin, 'chr-a').overBudget === true);
const cResOther = mkCampaign({ characters: [mkChar('chr-a'), mkChar('chr-b')], researchProjects: [mkResearch('rsp-1', 'chr-b', [], 'in-progress')] });
ok("another character's research is not mine", ACKS.characterActivityBudget(cResOther, 'chr-a').dedicatedUsed === 0);

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
section('characterActivityBudget() — ad-hoc Move → travel activity (Movement 2.0 · pace-from-Moves)');
// =============================================================================
// A manual Move debits character.dailyMovement.{milesUsed,dayBaseMiles} but is NOT a journey; the budget
// DERIVES the travel cost from the day-fraction moved (~1 ancillary hour per 1/8 of a full expedition day):
// ≤ half a day charges as that many ancillary (dedicated free), > half escalates to the dedicated block.
// _todayOrd = (currentTurn||1)*30 + (currentDayInMonth||1) = 31 for turn 1 / day 1.
const mvCamp = (miles, base) => mkCampaign({ currentTurn: 1, currentDayInMonth: 1,
  characters: [mkChar('chr-a', { dailyMovement: { worldOrd: 31, milesUsed: miles, dayBaseMiles: base } })] });
const bMove1 = ACKS.characterActivityBudget(mvCamp(6, 24), 'chr-a');       // 1 grassland hex = 6/24 day = 2 h
ok('moved 1 hex (6mi/24): 2 ancillary, dedicated free', bMove1.ancillaryUsed === 2 && bMove1.dedicatedUsed === 0);
ok('moved 1 hex: a movement-sourced travel line', bMove1.ancillary.some(a => a.kind === 'travel' && a.sourceKind === 'movement'));
const bMoveHalf = ACKS.characterActivityBudget(mvCamp(12, 24), 'chr-a');   // half a day = 4 h
ok('moved half a day (12mi/24): 4 ancillary, dedicated free', bMoveHalf.ancillaryUsed === 4 && bMoveHalf.dedicatedUsed === 0);
ok('half a day of moving is within budget', bMoveHalf.overBudget === false);
const bMoveFull = ACKS.characterActivityBudget(mvCamp(18, 24), 'chr-a');   // > half a day → the dedicated block
ok('moved > half a day (18mi/24): the dedicated travel block', bMoveFull.dedicatedUsed === 1 && bMoveFull.ancillaryUsed === 0);
ok('a full march is a dedicated-bucket travel line', bMoveFull.dedicated.some(a => a.kind === 'travel' && a.sourceKind === 'movement'));
ok('excludeMovement omits the movement travel line', ACKS.characterActivityBudget(mvCamp(18, 24), 'chr-a', { excludeMovement: true }).dedicatedUsed === 0);
ok('stale-day (yesterday) movement is ignored', ACKS.characterActivityBudget(mkCampaign({ currentTurn: 1, currentDayInMonth: 2, characters: [mkChar('chr-a', { dailyMovement: { worldOrd: 31, milesUsed: 18, dayBaseMiles: 24 } })] }), 'chr-a').dedicatedUsed === 0);
const cMoveAdmin = mkCampaign({ currentTurn: 1, currentDayInMonth: 1, characters: [mkChar('chr-a', { dailyMovement: { worldOrd: 31, milesUsed: 18, dayBaseMiles: 24 } })], domains: [adminD()] });
ok('a full march + administering a domain = over budget (2 dedicated)', ACKS.characterActivityBudget(cMoveAdmin, 'chr-a').overBudget === true);
const cMoveJrn = mkCampaign({ currentTurn: 1, currentDayInMonth: 1, characters: [mkChar('chr-a', { dailyMovement: { worldOrd: 31, milesUsed: 6, dayBaseMiles: 24 } })], journeys: [jrnPace('normal')] });
const bMoveJrn = ACKS.characterActivityBudget(cMoveJrn, 'chr-a');
ok('journey + moved: ONE travel line (journey wins, no double-count)', bMoveJrn.dedicated.concat(bMoveJrn.ancillary).filter(a => a.kind === 'travel').length === 1);

// =============================================================================
console.log('\n' + (fail ? 'FAIL' : 'PASS') + ' — activity-budget.smoke: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('Failures:\n  ' + failures.join('\n  ')); process.exit(1); }
