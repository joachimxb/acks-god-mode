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
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — cost-of-living.smoke.js: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { console.log('Failures:\n  ' + failures.join('\n  ')); process.exit(1); }
