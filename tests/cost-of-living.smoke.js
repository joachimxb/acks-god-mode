/* tests/cost-of-living.smoke.js — Phase 2.5 Provisioning §16 / CoL-1 (survival generalization) suite.
 *
 *   node tests/cost-of-living.smoke.js   (or via `npm test`)
 *
 * CoL-1: the settled/field regime predicate (characterProvisioningRegime); the mover-agnostic survival
 * primitive (resolveDaySurvival — settled freeFood/freeWater branch); the off-journey 'survival'
 * day-consumer (field dehydration, settled top-up, journey-participant dedup); and party.shareProvisions
 * pooling. The journey path itself is covered (unchanged) by journeys.smoke.js + provisioning.smoke.js.
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
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — cost-of-living.smoke.js: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { console.log('Failures:\n  ' + failures.join('\n  ')); process.exit(1); }
