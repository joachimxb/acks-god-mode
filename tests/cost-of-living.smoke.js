/* tests/cost-of-living.smoke.js — Phase 2.5 Provisioning §16 / CoL-1 (survival generalization) suite.
 *
 *   node tests/cost-of-living.smoke.js   (or via `npm test`)
 *
 * CoL-1: the settled/field regime predicate (characterProvisioningRegime); the mover-agnostic survival
 * primitive (resolveDaySurvival — settled freeFood/freeWater branch); the off-journey 'survival'
 * day-consumer (field dehydration, settled top-up, journey-participant dedup); and party.shareProvisions
 * pooling. The journey path itself is covered (unchanged) by journeys.smoke.js + provisioning.smoke.js.
 *
 * V4 (Provisioning §1.4/§9): the general forageActivity / huntActivity verbs — throws (+4 Survival,
 * terrain/territory mods), yields, the cost-tagged day-stamped provisioning-activity event, and the
 * activity-budget counting it.
 */
'use strict';
const path = require('path');
const DIR = path.join(__dirname, '..');
[
  'acks-engine-catalogs.js',
  'acks-engine.js',
  'acks-engine-entities.js',
  'acks-engine-economy.js',
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

// minimal field/settled character (blankCharacter so the survival fields + active lifecycle are present)
function mkChar(id, hexId, extra) {
  return Object.assign(ACKS.blankCharacter({ id: id, name: id }), { currentHexId: hexId, abilities: { CON: 12 } }, extra || {});
}
function freshCampaign() {
  return {
    schemaVersion: 2, currentTurn: 1, currentDayInMonth: 1, calendar: { year: 1, month: 1, day: 1 },
    houseRules: {}, characters: [], hexes: [], domains: [], settlements: [], constructibles: [],
    parties: [], journeys: [], projects: [], vassalages: [], eventLog: []
  };
}

// =============================================================================
section('blankParty.shareProvisions (§16.3)');
ok('defaults false', ACKS.blankParty().shareProvisions === false);
ok('honored from opts', ACKS.blankParty({ shareProvisions: true }).shareProvisions === true);

// =============================================================================
section('characterProvisioningRegime (§16.1)');
{
  const camp = freshCampaign();
  camp.hexes = [
    { id: 'hex-wild', terrain: 'forest' },
    { id: 'hex-townE', settlement: { name: 'Embedded' } },
    { id: 'hex-townT' },
    { id: 'hex-own', domainId: 'dom-own' },
    { id: 'hex-vassal', domainId: 'dom-vassal' },
    { id: 'hex-keep' }
  ];
  camp.settlements = [{ id: 'set-1', name: 'Toplevel', hexId: 'hex-townT' }];
  camp.domains = [{ id: 'dom-own', rulerCharacterId: 'chr-lord' }, { id: 'dom-vassal', rulerCharacterId: 'chr-vassal' }];
  camp.constructibles = [{ id: 'cst-1', hexId: 'hex-keep', constructibleKind: 'stronghold-component', constructionState: 'complete' }];
  ACKS.createVassalage(camp, { suzerainCharacterId: 'chr-lord', vassalRulerCharacterId: 'chr-vassal', vassalDomainId: 'dom-vassal', suzerainDomainId: 'dom-own' });
  camp.characters = [
    mkChar('chr-wild', 'hex-wild'),
    mkChar('chr-pcE', 'hex-townE'),
    mkChar('chr-pcT', 'hex-townT'),
    mkChar('chr-lord', 'hex-own'),
    mkChar('chr-keep', 'hex-keep'),
    mkChar('chr-limbo', null)
  ];
  const R = (id) => ACKS.characterProvisioningRegime(camp, id);
  ok('wilderness hex -> field', R('chr-wild') === 'field');
  ok('embedded settlement -> settled', R('chr-pcE') === 'settled');
  ok('top-level settlement (by hexId) -> settled', R('chr-pcT') === 'settled');
  ok('own ruled domain -> settled', R('chr-lord') === 'settled');
  ok('complete stronghold -> settled', R('chr-keep') === 'settled');
  ok('no current hex (limbo) -> settled', R('chr-limbo') === 'settled');
  // suzerain standing in a vassal-realm hex: settled via derivedVassalDomainsOf
  camp.characters.push(mkChar('chr-lord2', 'hex-vassal'));
  camp.domains[0].rulerCharacterId = 'chr-lord2';
  camp.vassalages = [];
  ACKS.createVassalage(camp, { suzerainCharacterId: 'chr-lord2', vassalRulerCharacterId: 'chr-vassal', vassalDomainId: 'dom-vassal', suzerainDomainId: 'dom-own' });
  ok('suzerain in a vassal-realm hex -> settled (chain)', ACKS.characterProvisioningRegime(camp, 'chr-lord2') === 'settled');
  // an unrelated character standing in someone else's domain is NOT settled by it
  ok('outsider in a domain they do not rule -> field', ACKS.characterProvisioningRegime(camp, mkChar('chr-outsider', 'hex-own')) === 'field');
  // an INCOMPLETE stronghold does not shelter
  camp.constructibles[0].constructionState = 'under-construction';
  ok('incomplete stronghold -> field', ACKS.characterProvisioningRegime(camp, 'chr-keep') === 'field');
}

// =============================================================================
// CoL-1 group/companion lifestyle (Joachim 2026-06-06): the own/vassal-domain exemption extends to a
// ruler's party + journey companions; a hex shelters a whole GROUP. Field always consumes.
section('group / companion lifestyle (CoL-1)');
{
  const camp = freshCampaign();
  camp.hexes = [{ id: 'hex-realm', domainId: 'dom-march' }, { id: 'hex-wild', terrain: 'forest' }, { id: 'hex-town', settlement: { name: 'Burg' } }];
  camp.domains = [{ id: 'dom-march', rulerCharacterId: 'chr-lord' }];
  const lord = mkChar('chr-lord', 'hex-realm');
  const hench = mkChar('chr-hench', 'hex-realm');   // rules nothing
  camp.characters = [lord, hench];

  ok('group: a member ruling the hex domain -> settled', ACKS.groupProvisioningRegime(camp, [lord, hench], camp.hexes[0]) === 'settled');
  ok('group info: names the domain host', (() => { const i = ACKS.groupProvisioningInfo(camp, [lord, hench], camp.hexes[0]); return i.kind === 'domain' && i.hostCharacterId === 'chr-lord' && i.domainId === 'dom-march'; })());
  ok('group: non-rulers in wilderness -> field', ACKS.groupProvisioningRegime(camp, [hench], camp.hexes[1]) === 'field');
  ok('group: a settlement shelters anyone (no ruler needed)', ACKS.groupProvisioningRegime(camp, [hench], camp.hexes[2]) === 'settled');

  // per-char primitive vs companion-aware effective regime
  ok('per-char primitive: henchman rules nothing -> field', ACKS.characterProvisioningRegime(camp, 'chr-hench') === 'field');
  ok('effective: henchman alone (no cohort) -> field', ACKS.characterEffectiveRegime(camp, 'chr-hench') === 'field');

  // companion via PARTY at the lord's hex -> settled (party-sharing irrelevant)
  camp.parties = [{ id: 'pty', memberCharacterIds: ['chr-lord', 'chr-hench'], leaderCharacterId: 'chr-lord', currentHexId: 'hex-realm', shareProvisions: false, status: 'active' }];
  lord.partyId = 'pty'; hench.partyId = 'pty';
  ok('companion (party) in lord\'s realm -> settled', ACKS.characterEffectiveRegime(camp, 'chr-hench') === 'settled');
  ok('lord himself -> settled', ACKS.characterEffectiveRegime(camp, 'chr-lord') === 'settled');
  hench.currentHexId = 'hex-wild';
  ok('companion who wandered to another hex -> field', ACKS.characterEffectiveRegime(camp, 'chr-hench') === 'field');
  hench.currentHexId = 'hex-realm';

  // companion via JOURNEY (no party, even an arrived one) -> settled
  camp.parties = []; lord.partyId = null; hench.partyId = null;
  camp.journeys = [{ id: 'jrn', status: 'arrived', participantCharacterIds: ['chr-lord', 'chr-hench'], supplies: {} }];
  ok('companion (journey) in lord\'s realm -> settled', ACKS.characterEffectiveRegime(camp, 'chr-hench') === 'settled');
}
// vassal-chain extends to companions too
{
  const camp = freshCampaign();
  camp.hexes = [{ id: 'hex-v', domainId: 'dom-vassal' }];
  camp.domains = [{ id: 'dom-suz', rulerCharacterId: 'chr-suz' }, { id: 'dom-vassal', rulerCharacterId: 'chr-vas' }];
  const suz = mkChar('chr-suz', 'hex-v'), comp = mkChar('chr-comp', 'hex-v');
  camp.characters = [suz, comp];
  ACKS.createVassalage(camp, { suzerainCharacterId: 'chr-suz', vassalRulerCharacterId: 'chr-vas', vassalDomainId: 'dom-vassal', suzerainDomainId: 'dom-suz' });
  camp.parties = [{ id: 'pty2', memberCharacterIds: ['chr-suz', 'chr-comp'], leaderCharacterId: 'chr-suz', currentHexId: 'hex-v', shareProvisions: false, status: 'active' }];
  suz.partyId = 'pty2'; comp.partyId = 'pty2';
  ok('companion of a suzerain in a vassal realm -> settled (chain)', ACKS.characterEffectiveRegime(camp, 'chr-comp') === 'settled');
}

// =============================================================================
section('journeyDaySurvival — lifestyle exemption in own domain (CoL-1)');
{
  const camp = freshCampaign();
  camp.hexes = [{ id: 'hex-realm', domainId: 'dom-m' }, { id: 'hex-wild', terrain: 'mountains' }];
  camp.domains = [{ id: 'dom-m', rulerCharacterId: 'chr-lord' }];
  const lord = mkChar('chr-lord', 'hex-realm', { waterDaysCarried: 0, inventory: [] });
  const comp = mkChar('chr-comp', 'hex-realm', { waterDaysCarried: 0, inventory: [] });   // a non-ruler companion
  camp.characters = [lord, comp];
  const j = { participantCharacterIds: ['chr-lord', 'chr-comp'], partyId: null, name: 'Patrol', startHexId: 'hex-realm', shareRations: false, supplies: { rations: 0, waterRations: 0 } };
  const inDomain = ACKS.journeyDaySurvival(camp, j, camp.hexes[0], { rng: () => 0.99 });
  ok('travel through own domain: no hunger (food not spent)', inDomain.anyHungry === false);
  ok('travel through own domain: no thirst (water not spent), even for the companion', inDomain.anyThirsty === false);
  const inField = ACKS.journeyDaySurvival(camp, j, camp.hexes[1], { rng: () => 0.99 });
  ok('travel in the field (no water): thirsty', inField.anyThirsty === true);
}

// =============================================================================
section("'survival' day-consumer — arrived party: field consumes, own domain exempt (CoL-1)");
{
  function arrivedAt(hexSpec, domains) {
    const camp = freshCampaign();
    camp.hexes = [hexSpec];
    if (domains) camp.domains = domains;
    const a = mkChar('chr-a', hexSpec.id, { waterDaysCarried: 0, inventory: [] });
    const b = mkChar('chr-b', hexSpec.id, { waterDaysCarried: 0, inventory: [] });
    camp.characters = [a, b];
    camp.parties = [{ id: 'pty', name: 'Band', memberCharacterIds: ['chr-a', 'chr-b'], leaderCharacterId: 'chr-a', currentHexId: hexSpec.id, shareProvisions: true, status: 'active' }];
    a.partyId = 'pty'; b.partyId = 'pty';
    camp.journeys = [{ id: 'jrn', status: 'arrived', participantCharacterIds: ['chr-a', 'chr-b'], partyId: 'pty', currentHexId: hexSpec.id, startHexId: hexSpec.id, supplies: {} }];
    return camp;
  }
  const sv = (camp) => ACKS.proposeSurvivalDay(camp, {}).pendingRecords.filter(r => r.kind === 'survival');
  ok('arrived party in the FIELD is resolved (field always consumes, incl. arrived)', sv(arrivedAt({ id: 'hex-wild', terrain: 'mountains' })).length === 1);
  ok("arrived party in the leader's OWN domain -> no survival records (lifestyle, companions exempt)", sv(arrivedAt({ id: 'hex-home', domainId: 'dom-a' }, [{ id: 'dom-a', rulerCharacterId: 'chr-a' }])).length === 0);
}

// =============================================================================
section('resolveDaySurvival — settled top-up branch (freeFood / freeWater)');
{
  const camp = freshCampaign();
  camp.hexes = [{ id: 'hex-dry', terrain: 'desert' }];   // no fresh source
  const c = mkChar('chr-s', 'hex-dry', { waterDaysCarried: 0, foodDeficitDays: 4, waterDeficitDays: 2, conLossHunger: 1, conLossThirst: 5, underfed: true, dehydrated: true });
  // give a 2-day water capacity so freeWater can top up to a non-zero reserve
  c.inventory = [{ name: 'Waterskin', catalogId: 'waterskin', stone: 0.2 }, { name: 'Waterskin', catalogId: 'waterskin', stone: 0.2 },
                 { name: 'Waterskin', catalogId: 'waterskin', stone: 0.2 }, { name: 'Waterskin', catalogId: 'waterskin', stone: 0.2 }, { name: 'Waterskin', catalogId: 'waterskin', stone: 0.2 }];
  camp.characters = [c];
  const cap = ACKS.waterCapacityDays(c);
  const surv = ACKS.resolveDaySurvival(camp, { members: [c], hex: camp.hexes[0], freeFood: true, freeWater: true, notable: {} });
  const m = surv.members['chr-s'];
  ok('settled: fed food + water despite no source/stores', m.fedFood === true && m.fedWater === true);
  ok('settled: water topped to capacity (' + cap + ')', Math.abs(m.waterDaysCarried - cap) < 1e-9 && cap > 0);
  ok('settled: food deficit cleared', m.foodDeficitDays === 0);
  ok('settled: water deficit cleared', m.waterDeficitDays === 0);
  ok('settled: conLossHunger recovered 1/day', m.conLossHunger === 0);
  ok('settled: conLossThirst recovered 3/day (5->2)', m.conLossThirst === 2);
}

// =============================================================================
section("'survival' day-consumer — field dehydration vs settled top-up (integration)");
{
  const camp = freshCampaign();
  camp.hexes = [{ id: 'hex-wild', terrain: 'forest' }, { id: 'hex-town', settlement: { name: 'Town' } }];
  camp.characters = [
    mkChar('chr-wild', 'hex-wild', { waterDaysCarried: 0, inventory: [] }),                                  // field, no water, no stores
    mkChar('chr-town', 'hex-town', { waterDaysCarried: 0, foodDeficitDays: 3, waterDeficitDays: 1, conLossThirst: 2, inventory: [] })  // settled, carrying deficits
  ];
  const consumerNames = ACKS.dayConsumersInOrder().map(c => c.name);
  ok("'survival' consumer registered", consumerNames.indexOf('survival') >= 0);
  ok('survival runs after journeys, before construction', consumerNames.indexOf('survival') > consumerNames.indexOf('journeys') && consumerNames.indexOf('survival') < consumerNames.indexOf('construction'));
  const prop = ACKS.proposeDayTick(camp, 1, { force: true });
  ACKS.commitDayTick(camp, prop, null);
  const w = camp.characters.find(c => c.id === 'chr-wild');
  const t = camp.characters.find(c => c.id === 'chr-town');
  ok('field char: water deficit accrues', w.waterDeficitDays === 1 && w.dehydrated === true);
  ok('field char: dehydration costs CON (1d6)', w.conLossThirst >= 1 && w.conLossThirst <= 6);
  ok('settled char: deficits cleared on the same tick', t.foodDeficitDays === 0 && t.waterDeficitDays === 0 && t.dehydrated === false);
  ok('settled char: CON recovered (thirst 2 -> 0, recover 3/day)', t.conLossThirst === 0);
}

// =============================================================================
section("'survival' day-consumer — journey participants are deduped (one resolution/char/day)");
{
  const camp = freshCampaign();
  camp.hexes = [{ id: 'hex-wild', terrain: 'forest' }];
  camp.characters = [mkChar('chr-onjourney', 'hex-wild'), mkChar('chr-free', 'hex-wild')];
  camp.journeys = [{ id: 'jrn-1', status: 'in-transit', participantCharacterIds: ['chr-onjourney'], supplies: {} }];
  const out = ACKS.proposeSurvivalDay(camp, {});
  const resolvedIds = [].concat.apply([], out.pendingRecords.map(r => r.memberIds || []));
  ok('free field char IS resolved by survival', resolvedIds.indexOf('chr-free') >= 0);
  ok('journey participant is NOT resolved by survival', resolvedIds.indexOf('chr-onjourney') < 0);
}

// =============================================================================
section('party.shareProvisions — off-journey pooling (camp-first, comrade-next)');
function shareScenario(shareOn) {
  const camp = freshCampaign();
  camp.hexes = [{ id: 'hex-wild', terrain: 'forest' }];   // no source — water drawn from own reserve
  const a = mkChar('chr-a', 'hex-wild', { waterDaysCarried: 5, inventory: [ACKS.makeRationLine({ rationType: 'iron', daysRemaining: 7 })] });
  const b = mkChar('chr-b', 'hex-wild', { waterDaysCarried: 5, inventory: [] });   // no food of their own
  camp.characters = [a, b];
  camp.parties = [{ id: 'pty-1', name: 'Band', memberCharacterIds: ['chr-a', 'chr-b'], leaderCharacterId: 'chr-a', currentHexId: 'hex-wild', shareProvisions: shareOn, status: 'active' }];
  const prop = ACKS.proposeDayTick(camp, 1, { force: true });
  ACKS.commitDayTick(camp, prop, null);
  return { a: camp.characters.find(c => c.id === 'chr-a'), b: camp.characters.find(c => c.id === 'chr-b') };
}
{
  const on = shareScenario(true);
  ok('sharing ON: comrade with no food is fed from the leader\'s pack', on.b.foodDeficitDays === 0);
  ok('sharing ON: leader also fed', on.a.foodDeficitDays === 0);
  const aPack = on.a.inventory.filter(x => ACKS.isRationLine(x)).reduce((s, x) => s + (x.daysRemaining || 0), 0);
  ok('sharing ON: 2 person-days drawn from the shared pack (7 -> 5)', aPack === 5, 'pack=' + aPack);
  const off = shareScenario(false);
  ok('sharing OFF: comrade with no food goes hungry', off.b.foodDeficitDays === 1);
  ok('sharing OFF: well-stocked leader still eats', off.a.foodDeficitDays === 0);
}

// =============================================================================
section('ignore-rations opt-out skips the survival consumer entirely');
{
  const camp = freshCampaign();
  camp.houseRules = { 'ignore-rations': { enabled: true } };
  camp.hexes = [{ id: 'hex-wild', terrain: 'forest' }];
  camp.characters = [mkChar('chr-wild', 'hex-wild', { waterDaysCarried: 0, inventory: [] })];
  const out = ACKS.proposeSurvivalDay(camp, {});
  ok('no survival records when ignore-rations is on', out.pendingRecords.length === 0);
}

// =============================================================================
section('CoL-1 — off-journey survival conditions persist to the eventLog / history (survival-day)');
ok('survival-day is a known event kind', ACKS.isEventKindKnown('survival-day') === true);
ok('survival-day is NOT GM-emittable (Event Wizard opt-out)', ACKS.isWizardEmittable('survival-day') === false);
{
  // a field character with no food + no water → a condition day → recorded AND visible in the Campaign Log
  const camp = freshCampaign();
  camp.hexes = [{ id: 'hex-wild', terrain: 'barrens' }];
  camp.characters = [mkChar('chr-w', 'hex-wild', { name: 'Wanderer', waterDaysCarried: 0, inventory: [] })];
  const prop = ACKS.proposeDayTick(camp, 1, { force: true });
  const sd = (prop.notableEvents || []).filter(e => e.kind === 'survival-day');
  ok('one survival-day notable proposed for the field char', sd.length === 1);
  ok('a hungry/thirsty day is NOT campaignLogHidden', sd[0].campaignLogHidden === false);
  ok('it tags the character in relatedEntities', (sd[0].relatedEntities || []).some(r => r.kind === 'character' && r.id === 'chr-w'));
  ok('it tags the hex as primaryHexId', sd[0].primaryHexId === 'hex-wild');
  ACKS.commitDayTick(camp, prop, null);
  ok('one survival-day entry committed to the eventLog', camp.eventLog.filter(e => e.event && e.event.kind === 'survival-day').length === 1);
  ok('it surfaces in characterHistory', ACKS.characterHistory(camp, 'chr-w').some(e => e.event.kind === 'survival-day'));
  ok('it surfaces in hexHistory', ACKS.hexHistory(camp, 'hex-wild').some(e => e.event.kind === 'survival-day'));
  const ev = camp.eventLog.find(e => e.event && e.event.kind === 'survival-day');
  ok('payload carries the per-member outcome', !!(ev.event.payload && ev.event.payload.members && ev.event.payload.members['chr-w']));
  ok('narrative summary is human-readable', /hungry|dehydrated|CON/i.test(ev.result.narrativeSummary || ''));
}
{
  // a routine fed + watered field day records NOTHING (no eventLog noise)
  const camp = freshCampaign();
  camp.hexes = [{ id: 'hex-wild', terrain: 'forest' }];
  camp.characters = [mkChar('chr-ok', 'hex-wild', { waterDaysCarried: 5, inventory: [ACKS.makeRationLine({ rationType: 'iron', daysRemaining: 7 })] })];
  const prop = ACKS.proposeDayTick(camp, 1, { force: true });
  ok('a routine fed+watered field day records NO survival-day event', (prop.notableEvents || []).filter(e => e.kind === 'survival-day').length === 0);
  ACKS.commitDayTick(camp, prop, null);
  ok('routine day leaves no survival-day in the eventLog', camp.eventLog.filter(e => e.event && e.event.kind === 'survival-day').length === 0);
}
{
  // a settled recovery (clearing a prior deficit) IS recorded — but campaignLogHidden (history, not the log)
  const camp = freshCampaign();
  camp.hexes = [{ id: 'hex-town', settlement: { name: 'Town' } }];
  camp.characters = [mkChar('chr-rec', 'hex-town', { waterDaysCarried: 0, foodDeficitDays: 3, waterDeficitDays: 1, conLossThirst: 2, inventory: [] })];
  const prop = ACKS.proposeDayTick(camp, 1, { force: true });
  const sd = (prop.notableEvents || []).filter(e => e.kind === 'survival-day');
  ok('a settled recovery day IS recorded', sd.length === 1);
  ok('a recovery day is campaignLogHidden', sd[0].campaignLogHidden === true);
  ok('the recovery event is flagged settled', !!(sd[0].payload && sd[0].payload.settled === true));
  ACKS.commitDayTick(camp, prop, null);
  ok('recovery surfaces in characterHistory', ACKS.characterHistory(camp, 'chr-rec').some(e => e.event.kind === 'survival-day'));
}
{
  // a shared party group → ONE event tagging the party (partyHistory) + every member
  const camp = freshCampaign();
  camp.hexes = [{ id: 'hex-wild', terrain: 'barrens' }];
  camp.characters = [mkChar('chr-pa', 'hex-wild', { waterDaysCarried: 0, inventory: [] }), mkChar('chr-pb', 'hex-wild', { waterDaysCarried: 0, inventory: [] })];
  camp.parties = [{ id: 'pty-x', name: 'Band', memberCharacterIds: ['chr-pa', 'chr-pb'], leaderCharacterId: 'chr-pa', currentHexId: 'hex-wild', shareProvisions: true, status: 'active' }];
  const prop = ACKS.proposeDayTick(camp, 1, { force: true });
  const sd = (prop.notableEvents || []).filter(e => e.kind === 'survival-day');
  ok('one survival-day event for the shared party group', sd.length === 1);
  ok('it tags the party (→ partyHistory)', (sd[0].relatedEntities || []).some(r => r.kind === 'party' && r.id === 'pty-x'));
  ok('it tags both members', ['chr-pa', 'chr-pb'].every(id => (sd[0].relatedEntities || []).some(r => r.kind === 'character' && r.id === id)));
  ACKS.commitDayTick(camp, prop, null);
  ok('it surfaces in partyHistory', ACKS.partyHistory(camp, 'pty-x').some(e => e.event.kind === 'survival-day'));
}

// =============================================================================
// V4 — the general Forage / Hunt activity (RR p.278 §1.4)
const HI = () => 0.99;   // d20 = 20
const LO = () => 0;      // d20 = 1
const MID = () => 13 / 20;   // d20 = 14
function provCampaign() {
  const c = freshCampaign();
  c.hexes = [
    { id: 'hex-forest', terrain: 'forest' },
    { id: 'hex-desert', terrain: 'desert' },
    { id: 'hex-river', terrain: 'grassland', riverSides: [0] }
  ];
  return c;
}
const rationDays = ch => (ch.inventory || []).filter(x => ACKS.isRationLine(x)).reduce((s, x) => s + (x.daysRemaining || 0), 0);

section('V4 — forage food (throw, yield, event)');
{
  const c = provCampaign();
  c.characters = [mkChar('chr-f', 'hex-forest', { inventory: [] })];
  const r = ACKS.forageActivity(c, { actorCharacterId: 'chr-f', forageKind: 'food', rng: HI });
  ok('forage food: ok + success on a 20 vs 18+', r.ok && r.success === true);
  ok('forage food success adds 3 day-rations (½ st feeds 3)', rationDays(c.characters[0]) === 3);
  const e = c.eventLog[c.eventLog.length - 1].event;
  ok('event kind = provisioning-activity', e.kind === 'provisioning-activity');
  ok('event cost-tagged ancillary + kind forage', e.payload.activityCost && e.payload.activityCost.slot === 'ancillary' && e.payload.activityCost.kind === 'forage');
  ok('event day-stamped (appliedAtDay)', e.appliedAtDay === 1);
}
section('V4 — forage food fail / +4 Survival / terrain mod');
{
  const c = provCampaign(); c.characters = [mkChar('chr-f', 'hex-forest', { inventory: [] })];
  const r = ACKS.forageActivity(c, { actorCharacterId: 'chr-f', forageKind: 'food', rng: LO });
  ok('forage food fail (1 vs 18): no rations', r.success === false && rationDays(c.characters[0]) === 0);
  const c1 = provCampaign(); c1.characters = [mkChar('chr-n', 'hex-forest', { inventory: [] })];
  ok('food 14 vs 18 without Survival fails', ACKS.forageActivity(c1, { actorCharacterId: 'chr-n', forageKind: 'food', rng: MID }).success === false);
  const c2 = provCampaign(); c2.characters = [mkChar('chr-s', 'hex-forest', { inventory: [], proficiencies: ['Survival'] })];
  const r2 = ACKS.forageActivity(c2, { actorCharacterId: 'chr-s', forageKind: 'food', rng: MID });
  ok('food 14+4 vs 18 WITH Survival succeeds (+4 bonus)', r2.success === true && r2.bonus === 4);
  const c3 = provCampaign(); c3.characters = [mkChar('chr-d', 'hex-desert', { inventory: [], proficiencies: ['Survival'] })];
  ok('food in desert applies −4 terrain mod', ACKS.forageActivity(c3, { actorCharacterId: 'chr-d', forageKind: 'food', rng: HI }).terrMod === -4);
}
section('V4 — forage water (auto at source / no source / firewood)');
{
  const c = provCampaign();
  const ch = mkChar('chr-w', 'hex-river', { waterDaysCarried: 0, inventory: [{ name: 'Waterskin', catalogId: 'waterskin', stone: 0.2 }] });
  c.characters = [ch];
  const r = ACKS.forageActivity(c, { actorCharacterId: 'chr-w', forageKind: 'water' });
  ok('water at a fresh source auto-succeeds (no roll)', r.success === true && r.auto === true);
  ok('water auto fills to capacity', Math.abs(ch.waterDaysCarried - ACKS.waterCapacityDays(ch)) < 1e-9);
  ok('auto water event carries NO activityCost (free)', c.eventLog[c.eventLog.length - 1].event.payload.activityCost == null);
  // no source: 15 waterskins = 3 days capacity
  const c2 = provCampaign();
  const skins = []; for (let i = 0; i < 15; i++) skins.push({ name: 'Waterskin', catalogId: 'waterskin', stone: 0.2 });
  const ch2 = mkChar('chr-w2', 'hex-forest', { waterDaysCarried: 0, inventory: skins });
  c2.characters = [ch2];
  const cap = ACKS.waterCapacityDays(ch2);
  const r2 = ACKS.forageActivity(c2, { actorCharacterId: 'chr-w2', forageKind: 'water', rng: HI });
  ok('water forage (no source) success credits min(cap, 3)', r2.success === true && Math.abs(ch2.waterDaysCarried - Math.min(cap, 3)) < 1e-9, 'cap=' + cap + ' water=' + ch2.waterDaysCarried);
  // firewood in a forest = 3+
  const c3 = provCampaign(); c3.characters = [mkChar('chr-fw', 'hex-forest', { inventory: [] })];
  const r3 = ACKS.forageActivity(c3, { actorCharacterId: 'chr-fw', forageKind: 'firewood', rng: HI });
  ok('firewood success adds a Firewood item', r3.success === true && c3.characters[0].inventory.some(x => x.name === 'Firewood'));
}
section('V4 — hunt + budget counting + error paths');
{
  const c = provCampaign(); c.characters = [mkChar('chr-h', 'hex-forest', { inventory: [] })];
  const r = ACKS.huntActivity(c, { actorCharacterId: 'chr-h', rng: HI });
  ok('hunt success (20 + 4 unsettled vs 14+)', r.ok && r.success === true);
  ok('hunt territory Unsettled = +4', r.terrMod === 4);
  ok('hunt success adds 6 day-rations (1 st feeds 6)', rationDays(c.characters[0]) === 6);
  ok('hunt flags wandering-monster risk', r.wanderingMonsterRisk === true);
  ok('hunt event is dedicated', c.eventLog[c.eventLog.length - 1].event.payload.activityCost.slot === 'dedicated');
  // budget counts a forage (ancillary) + a hunt (dedicated) on the same day
  const c2 = provCampaign(); c2.characters = [mkChar('chr-b', 'hex-forest', { inventory: [] })];
  ACKS.forageActivity(c2, { actorCharacterId: 'chr-b', forageKind: 'food', rng: HI });
  ACKS.huntActivity(c2, { actorCharacterId: 'chr-b', rng: HI });
  const b = ACKS.characterActivityBudget(c2, 'chr-b');
  ok('budget counts forage=1 ancillary + hunt=1 dedicated', b.ancillaryUsed === 1 && b.dedicatedUsed === 1);
  // errors
  ok('unknown actor → error', ACKS.forageActivity(provCampaign(), { actorCharacterId: 'nope', forageKind: 'food' }).error === 'unknown-actor');
  const c3 = provCampaign(); c3.characters = [mkChar('chr-x', 'hex-forest')];
  ok('bad forage kind → error', ACKS.forageActivity(c3, { actorCharacterId: 'chr-x', forageKind: 'gold' }).error === 'bad-forage-kind');
}

// =============================================================================
section('V4 — reroll (rerollProvisioningActivity: flips the yield on a success-state change)');
{
  // fail → reroll success: rations appear
  const c = provCampaign(); c.characters = [mkChar('chr-f', 'hex-forest', { inventory: [] })];
  const r = ACKS.forageActivity(c, { actorCharacterId: 'chr-f', forageKind: 'food', rng: LO });
  ok('food forage fails on a 1', r.success === false && rationDays(c.characters[0]) === 0);
  const rr = ACKS.rerollProvisioningActivity(c, r.event.id, { rng: HI });
  ok('reroll fail→success adds the yield (+3)', rr.ok && rr.success === true && rationDays(c.characters[0]) === 3);
  ok('reroll updates the SAME event in place (no new event)', c.eventLog.length === 1 && c.eventLog[0].event.payload.success === true);
  // success → reroll fail: rations removed
  const rr2 = ACKS.rerollProvisioningActivity(c, r.event.id, { rng: LO });
  ok('reroll success→fail removes the yield (0)', rr2.success === false && rationDays(c.characters[0]) === 0);
}
{
  // two stacked attempts reroll INDEPENDENTLY (surgical by event tag)
  const c = provCampaign(); c.characters = [mkChar('chr-f', 'hex-forest', { inventory: [] })];
  const a = ACKS.forageActivity(c, { actorCharacterId: 'chr-f', forageKind: 'food', rng: HI });
  const b = ACKS.forageActivity(c, { actorCharacterId: 'chr-f', forageKind: 'food', rng: HI });
  ok('two stacked successes = +6 day-rations across 2 events', rationDays(c.characters[0]) === 6 && c.eventLog.length === 2);
  ACKS.rerollProvisioningActivity(c, a.event.id, { rng: LO });
  ok('rerolling only the FIRST to fail leaves the second (3 remain)', rationDays(c.characters[0]) === 3);
}
{
  // water success → reroll fail restores the pre-snapshot
  const c = provCampaign(); const ch = mkChar('chr-w', 'hex-forest', { waterDaysCarried: 0, inventory: [] });
  for (let i = 0; i < 15; i++) ch.inventory.push({ name: 'Waterskin', catalogId: 'waterskin', stone: 0.2 });
  c.characters = [ch];
  const r = ACKS.forageActivity(c, { actorCharacterId: 'chr-w', forageKind: 'water', rng: HI });
  ok('water forage success raises water', r.success === true && ch.waterDaysCarried > 0);
  ACKS.rerollProvisioningActivity(c, r.event.id, { rng: LO });
  ok('reroll water success→fail restores water to 0 (pre)', ch.waterDaysCarried === 0);
}
{
  // auto water (at a source) is not rerollable; unknown event errors
  const c = provCampaign(); c.hexes = [{ id: 'hex-river', terrain: 'grassland', riverSides: [0] }];
  const ch = mkChar('chr-a', 'hex-river', { waterDaysCarried: 0, inventory: [{ name: 'Waterskin', catalogId: 'waterskin', stone: 0.2 }] });
  c.characters = [ch];
  const r = ACKS.forageActivity(c, { actorCharacterId: 'chr-a', forageKind: 'water' });
  ok('auto water = success + auto', r.auto === true);
  ok('auto water is NOT rerollable', ACKS.rerollProvisioningActivity(c, r.event.id, { rng: HI }).error === 'auto-not-rerollable');
  ok('reroll unknown event → error', ACKS.rerollProvisioningActivity(c, 'evt-nope', {}).error === 'event-not-found');
}

// =============================================================================
// CoL-2 — Living Expenses (RR p.173) + henchman wages (RR p.168) + apparent level (RR p.170)
// =============================================================================
const purse = (ch, gp) => { ch.coins = ch.coins || { pp:0, gp:0, ep:0, sp:0, cp:0 }; ch.coins.gp = gp; ch.personalGp = gp; return ch; };

section('CoL-2 — wage table (RR p.168) + effectiveSocialLevelForSpend (RR p.173)');
ok('wage(0)=12',  ACKS.levelMonthlyWage(0) === 12);
ok('wage(6)=800', ACKS.levelMonthlyWage(6) === 800);
ok('wage(9)=7250', ACKS.levelMonthlyWage(9) === 7250);
ok('wage(14)=350000', ACKS.levelMonthlyWage(14) === 350000);
ok('wage clamps >14 to the 14 figure', ACKS.levelMonthlyWage(20) === 350000);
ok('eff(800)=6 (exact wage)', ACKS.effectiveSocialLevelForSpend(800) === 6);
ok('eff(799)=5 (one short of L6)', ACKS.effectiveSocialLevelForSpend(799) === 5);
ok('eff(0)=0 (destitute)', ACKS.effectiveSocialLevelForSpend(0) === 0);
ok('eff(7250)=9', ACKS.effectiveSocialLevelForSpend(7250) === 9);

section('CoL-2 — living-expenses rule defaults ON (registry default)');
ok('absent ⇒ ON', ACKS.isHouseRuleEnabled({ houseRules: {} }, 'living-expenses') === true);
ok('explicit {enabled:false} ⇒ OFF', ACKS.isHouseRuleEnabled({ houseRules: { 'living-expenses': { enabled:false } } }, 'living-expenses') === false);
ok('a non-default rule still absent ⇒ OFF', ACKS.isHouseRuleEnabled({ houseRules: {} }, 'hidden-stashes') === false);
ok('registry entry carries default:true', (ACKS.lookupHouseRule('living-expenses') || {}).default === true);

section('CoL-2 — apparentLevel + apparentLevelLoyaltyPenalty (RR p.170)');
{
  const camp = freshCampaign();
  const emp = mkChar('emp', null, { level: 9 });
  camp.characters = [emp];
  ok('no eff yet (rule on) ⇒ true level', ACKS.apparentLevel(camp, emp) === 9);
  emp.effectiveSocialLevel = 4;
  ok('eff set ⇒ apparent = eff (underspent)', ACKS.apparentLevel(camp, emp) === 4);
  const off = { houseRules: { 'living-expenses': { enabled:false } }, characters:[emp] };
  ok('rule OFF ⇒ apparent = true level (ignores stale eff)', ACKS.apparentLevel(off, emp) === 9);
  const h = mkChar('h', null, { level: 6, socialTier:'henchman', liegeCharacterId:'emp' });
  ok('penalty: h(6) over emp apparent(4) = −2', ACKS.apparentLevelLoyaltyPenalty(camp, h, emp) === -2);
  ok('penalty 0 when employer apparent ≥ henchman', ACKS.apparentLevelLoyaltyPenalty(off, h, emp) === 0);
}

section('CoL-2 — processLivingExpensesForTurn: self + henchman + follower + mercenary');
{
  const camp = freshCampaign();
  const ruler = purse(mkChar('r', null, { level: 6 }), 5000);            // self-supporting L6 → 800
  const hench = mkChar('h', null, { level: 2, socialTier:'henchman', liegeCharacterId:'r', monthlyWage: 50 });
  const foll  = purse(mkChar('f', null, { level: 3, socialTier:'follower' }), 999);
  const merc  = purse(mkChar('m', null, { level: 4, socialTier:'mercenary' }), 999);
  camp.characters = [ruler, hench, foll, merc];
  const res = ACKS.processLivingExpensesForTurn(camp);
  ok('ruleOn', res.ruleOn === true);
  ok('total = 800 living + 50 wage = 850', res.totalGp === 850);
  ok('ruler purse 5000 → 4150 (own keep + henchman wage)', ruler.coins.gp === 4150);
  ok('ruler effectiveSocialLevel = 6', ruler.effectiveSocialLevel === 6);
  ok('ruler lastLivingExpensePaidGp = 800', ruler.lastLivingExpensePaidGp === 800);
  ok('henchman takes NO self-debit (effLevel null)', hench.effectiveSocialLevel === null);
  ok('follower: no debit (purse intact) + effLevel null', foll.coins.gp === 999 && foll.effectiveSocialLevel === null);
  ok('mercenary: skipped (purse intact)', merc.coins.gp === 999);
  ok('two wealth-transfers logged', camp.eventLog.filter(e => e.event && e.event.kind === 'wealth-transfer').length === 2);
  ok('both campaignLogHidden', camp.eventLog.filter(e => e.event && e.event.kind === 'wealth-transfer').every(e => e.event.campaignLogHidden === true));
}

section('CoL-2 — forced down by funds (no debt) + lifestyle target dial-down');
{
  const camp = freshCampaign();
  const broke = purse(mkChar('b', null, { level: 6 }), 300);   // can only afford 300 of the 800 target
  camp.characters = [broke];
  ACKS.processLivingExpensesForTurn(camp);
  ok('pays only what is on hand (300, no debt)', broke.coins.gp === 0 && broke.lastLivingExpensePaidGp === 300);
  ok('forced-down apparent level = 4 (wage 200 ≤ 300 < 400)', broke.effectiveSocialLevel === 4);

  const camp2 = freshCampaign();
  const lord = purse(mkChar('l', null, { level: 9, lifestyleTargetLevel: 6 }), 20000);  // dials down to L6 lifestyle
  camp2.characters = [lord];
  ACKS.processLivingExpensesForTurn(camp2);
  ok('dialled-down target pays the target wage (800), not the L9 wage', lord.lastLivingExpensePaidGp === 800);
  ok('dialled-down apparent level = 6 even at true L9', lord.effectiveSocialLevel === 6);

  // RR p.173 is DOWNWARD-ONLY: overspending (a target above the true level — only reachable via an old
  // save / Inspector; the Survival-tab lever is capped at the true level) does NOT raise apparent level.
  const camp3 = freshCampaign();
  const prof = purse(mkChar('p', null, { level: 3, lifestyleTargetLevel: 9 }), 20000);
  camp3.characters = [prof];
  ACKS.processLivingExpensesForTurn(camp3);
  ok('overspend does NOT raise apparent level above true (capped at 3)', prof.effectiveSocialLevel === 3);
  ok('apparentLevel never exceeds true level', ACKS.apparentLevel(camp3, prof) === 3);
}

section('CoL-2 — rule OFF: no debits + apparent cleared');
{
  const camp = freshCampaign();
  camp.houseRules = { 'living-expenses': { enabled:false } };
  const ruler = purse(mkChar('r', null, { level: 6 }), 5000); ruler.effectiveSocialLevel = 3;   // stale
  camp.characters = [ruler];
  const res = ACKS.processLivingExpensesForTurn(camp);
  ok('ruleOn false + no charges', res.ruleOn === false && res.charges.length === 0);
  ok('purse untouched', ruler.coins.gp === 5000);
  ok('stale effectiveSocialLevel cleared to null', ruler.effectiveSocialLevel === null);
}

section('CoL-2 — RAW carve-out: vassal-ruling henchman, domain income ≥ wage owes no wage');
{
  const camp = freshCampaign();
  const liege = purse(mkChar('lg', null, { level: 9 }), 50000);
  const vh = mkChar('vh', null, { level: 4, socialTier:'henchman', liegeCharacterId:'lg', monthlyWage: 200 });
  camp.characters = [liege, vh];
  camp.domains = [{ id:'dvh', rulerCharacterId:'vh', treasury:{ gp:0 } }];
  const origNet = ACKS.monthlyNet; ACKS.monthlyNet = (c, d) => d.id === 'dvh' ? 500 : 0;   // domain nets 500 ≥ wage 200
  const res = ACKS.processLivingExpensesForTurn(camp);
  ACKS.monthlyNet = origNet;
  const wageRow = res.charges.find(c => c.kind === 'henchman-wage');
  ok('henchman wage waived (paid 0, reason domain-income)', wageRow && wageRow.paid === 0 && wageRow.waived === 'domain-income');
  ok('liege still pays his own L9 living (50000 → 42750)', liege.coins.gp === 42750);
}

section('CoL-2 — dryRun previews without moving gp or setting fields');
{
  const camp = freshCampaign();
  const ruler = purse(mkChar('r', null, { level: 6 }), 5000);
  camp.characters = [ruler];
  const prev = ACKS.processLivingExpensesForTurn(camp, { dryRun: true });
  ok('dryRun returns the projected charge (800)', prev.charges.length === 1 && prev.charges[0].paid === 800);
  ok('dryRun does NOT move gp', ruler.coins.gp === 5000);
  ok('dryRun does NOT set effectiveSocialLevel', ruler.effectiveSocialLevel == null);
  ok('dryRun logs no events', camp.eventLog.length === 0);
}

section('CoL-2 — pay-from-treasury (ruler setting) debits the domain treasury');
{
  const camp = ACKS.blankCampaign ? ACKS.blankCampaign() : freshCampaign();
  camp.currentTurn = 1; camp.currentDayInMonth = 1; camp.houseRules = camp.houseRules || {};
  const ruler = purse(mkChar('king', null, { level: 6, payKeepFromTreasury: true }), 0);   // empty purse
  camp.characters = [ruler];
  const dom = ACKS.blankDomain ? ACKS.blankDomain({ id:'realm', name:'Realm' }) : { id:'realm', name:'Realm', treasury:{ gp:0 }, geography:{ hexes:[] } };
  dom.rulerCharacterId = 'king';
  dom.geography = dom.geography || { hexes: [] };
  dom.geography.hexes = [{ id:'hx', coord:{ q:0, r:0 } }];
  dom.treasury = { gp: 9000 };
  camp.domains = [dom];
  camp.hexes = (camp.hexes || []).concat(dom.geography.hexes);
  if (ACKS.migrateCampaign) ACKS.migrateCampaign(camp);    // materialize the treasury stash from treasury.gp
  const before = ACKS.domainTreasuryGp ? ACKS.domainTreasuryGp(camp, 'realm') : dom.treasury.gp;
  ACKS.processLivingExpensesForTurn(camp);
  const after = ACKS.domainTreasuryGp ? ACKS.domainTreasuryGp(camp, 'realm') : dom.treasury.gp;
  ok('treasury had ≥ 800 before', before >= 800, 'before=' + before);
  ok('keep paid from the treasury (−800)', after === before - 800, 'before=' + before + ' after=' + after);
  ok('purse stayed empty (paid from treasury, not purse)', ruler.coins.gp === 0);
  ok('apparent level still 6 (treasury covered the L6 keep)', ruler.effectiveSocialLevel === 6);
}

section('CoL-2 — headless commitTurn applies the keep + advances the month');
{
  const camp = ACKS.blankCampaign ? ACKS.blankCampaign() : freshCampaign();
  camp.currentTurn = 1; camp.currentDayInMonth = 1; camp.houseRules = camp.houseRules || {};
  const ruler = purse(mkChar('rk', null, { level: 6 }), 5000);
  camp.characters = [ruler];
  const dom = ACKS.blankDomain ? ACKS.blankDomain({ id:'rl', name:'Rl' }) : null;
  if (dom) {
    dom.rulerCharacterId = 'rk';
    dom.geography = dom.geography || { hexes: [] };
    dom.geography.hexes = [{ id:'h0', coord:{ q:0, r:0 } }];
    camp.domains = [dom];
    camp.hexes = (camp.hexes || []).concat(dom.geography.hexes);
    if (ACKS.migrateCampaign) ACKS.migrateCampaign(camp);
    const turn0 = camp.currentTurn;
    const prop = ACKS.proposeMonthlyTurn(camp);
    ok('proposal previews the living expense (dryRun)', !!(prop.livingExpenseProposal && prop.livingExpenseProposal.charges.length));
    const result = ACKS.commitTurn(camp, prop);
    ok('turn advanced', camp.currentTurn === turn0 + 1);
    ok('commit charged the ruler their L6 keep (purse < 5000)', ruler.coins.gp < 5000);
    ok('commit set the ruler effectiveSocialLevel', ruler.effectiveSocialLevel != null);
    ok('commit result carries livingExpenseResult', !!(result.livingExpenseResult && result.livingExpenseResult.ruleOn));
  } else {
    ok('blankDomain available for the integration test', false, 'no blankDomain — skipped');
  }
}

section('CoL-2 — characterExpenseBreakdown (Expenses tab): lifestyle keep + henchman wages + total');
{
  const camp = freshCampaign();
  const ruler = purse(mkChar('lord', null, { level: 6 }), 9000);                                   // self-supporting L6 → 800
  const h1 = mkChar('h1', null, { level: 2, socialTier:'henchman', liegeCharacterId:'lord', monthlyWage: 50 });
  const h2 = mkChar('h2', null, { level: 4, socialTier:'henchman', liegeCharacterId:'lord' });      // no monthlyWage → level wage 200
  const sp = mkChar('sp', null, { level: 1, socialTier:'specialist', liegeCharacterId:'lord', monthlyWage: 25 });
  const other = mkChar('x', null, { level: 1, socialTier:'henchman', liegeCharacterId:'someone' });  // not this liege's
  camp.characters = [ruler, h1, h2, sp, other];
  const ex = ACKS.characterExpenseBreakdown(camp, ruler);
  ok('ruleOn true', ex.ruleOn === true);
  ok('selfSupporting true (a domain-less PC pays his own keep)', ex.selfSupporting === true);
  ok('lifestyleGp = 800 (L6 wage)', ex.lifestyleGp === 800);
  ok('three henchmen/specialists on payroll (others excluded)', ex.henchmen.length === 3);
  ok('henchmenTotal = 50 + 200 + 25 = 275', ex.henchmenTotal === 275);
  ok('total = 800 + 275 = 1075', ex.total === 1075);
  ok('h2 wage derives from level (200)', ex.henchmen.find(h => h.id === 'h2').wage === 200);
  ok('specialist role labelled', ex.henchmen.find(h => h.id === 'sp').role === 'specialist');
  ok('breakdown accepts a char id too', ACKS.characterExpenseBreakdown(camp, 'lord').total === 1075);
  // consistency: the breakdown's wage bill matches the monthly pass's charges for this liege
  const dry = ACKS.processLivingExpensesForTurn(camp, { dryRun: true });
  const passWages = dry.charges.filter(c => c.kind === 'henchman-wage' && c.liegeId === 'lord').reduce((s,c) => s + (c.paid || 0), 0);
  ok('breakdown wage bill == monthly pass wage charges', ex.henchmenTotal === passWages, 'ex=' + ex.henchmenTotal + ' pass=' + passWages);
}

section('CoL-2 — characterExpenseBreakdown: waiver, non-self-supporting, rule OFF, shared wage helpers');
{
  // waiver — a vassal-ruling henchman whose domain income ≥ wage shows due 0 (wage still displayed)
  const camp = freshCampaign();
  const lg = mkChar('lg', null, { level: 9 });
  const vh = mkChar('vh', null, { level: 4, socialTier:'henchman', liegeCharacterId:'lg', monthlyWage: 200 });
  camp.characters = [lg, vh];
  camp.domains = [{ id:'dv', rulerCharacterId:'vh', treasury:{ gp:0 } }];
  const origNet = ACKS.monthlyNet; ACKS.monthlyNet = (c, d) => d.id === 'dv' ? 500 : 0;
  const ex = ACKS.characterExpenseBreakdown(camp, lg);
  ACKS.monthlyNet = origNet;
  ok('waived henchman: wage shown (200) but due 0', ex.henchmen[0].wage === 200 && ex.henchmen[0].waived === 'domain-income' && ex.henchmen[0].due === 0);
  ok('henchmenTotal excludes the waived wage (0)', ex.henchmenTotal === 0);

  // a liege-paid henchman is NOT self-supporting → lifestyleGp 0 (his liege covers his keep)
  const camp2 = freshCampaign();
  const boss = mkChar('boss', null, { level: 8 });
  const mid = mkChar('mid', null, { level: 5, socialTier:'henchman', liegeCharacterId:'boss' });
  const sub = mkChar('sub', null, { level: 2, socialTier:'henchman', liegeCharacterId:'mid', monthlyWage: 40 });
  camp2.characters = [boss, mid, sub];
  const exMid = ACKS.characterExpenseBreakdown(camp2, mid);
  ok('liege-paid henchman: selfSupporting false', exMid.selfSupporting === false);
  ok('liege-paid henchman: lifestyleGp 0 (keep covered by his liege)', exMid.lifestyleGp === 0);
  ok('but he still pays his own sub-henchman (total = 40)', exMid.henchmenTotal === 40 && exMid.total === 40);

  // rule OFF → lifestyleGp 0, henchmen still reported (informational), total = henchmenTotal
  const camp3 = freshCampaign();
  camp3.houseRules = { 'living-expenses': { enabled:false } };
  const r3 = mkChar('r3', null, { level: 6 });
  const h3 = mkChar('h3', null, { level: 3, socialTier:'henchman', liegeCharacterId:'r3', monthlyWage: 100 });
  camp3.characters = [r3, h3];
  const ex3 = ACKS.characterExpenseBreakdown(camp3, r3);
  ok('rule OFF: ruleOn false', ex3.ruleOn === false);
  ok('rule OFF: lifestyleGp 0 (no self-keep counted)', ex3.lifestyleGp === 0);
  ok('rule OFF: wage bill still reported (100)', ex3.henchmenTotal === 100 && ex3.total === 100);

  // shared wage helpers
  ok('henchmanMonthlyWage: explicit monthlyWage wins', ACKS.henchmanMonthlyWage(camp3, { monthlyWage: 77, level: 6 }) === 77);
  ok('henchmanMonthlyWage: falls back to level wage', ACKS.henchmanMonthlyWage(camp3, { level: 6 }) === 800);
  ok('henchmanWageWaiver: null when no ruled domain', ACKS.henchmanWageWaiver(camp3, { id:'nobody', level:3 }) === null);
}

// =============================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — cost-of-living.smoke.js: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { console.log('Failures:\n  ' + failures.join('\n  ')); process.exit(1); }
