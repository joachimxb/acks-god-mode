/* Movement 2.0 Lane D — Provisioning & load smoke test.
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/movement-provisioning.smoke.js
 *
 * Covers the Lane D deliverables (_handoffs/_BUILDER_mv2-4_provisioning.md):
 *   • D4/OQ1 — the individual-vs-unit ration line (ACKS._provisioningDemand): PCs + henchmen + named
 *     companions + hired individuals counted; the dead/absent excluded; mercenary UNITS (Groups) and
 *     animals excluded; an army/band mover → unitScale (no personal ration line). Co-present hires
 *     (via the employer/patron relation) counted even when not a formal member.
 *   • the group food/water-per-day readout (moverConsumptionPerDay) — people + animals (grazers food-free,
 *     camels water-free).
 *   • carrying capacity (groupHaulCapacity extends Foundation's groupCarryingCapacity with animals/hires).
 *   • the per-mover regime (D8) — party-canonical + journey-mirrored two-way sync; shareRations mirrored to
 *     the legacy party.shareProvisions / journey.shareRations; the tri-state skipProvisioning cycle.
 *   • share-load (D5) — groupShareLoadReport ON lowers the slowest band; balanceGroupLoad redistributes
 *     the load (mounted riders excluded from the walker set).
 *   • seam byte-safety — resolveDaySurvival with a group uses the eater set; without one, args.members
 *     governs unchanged (the shipped path).
 *
 * Authored 2026-07-01 (Movement 2.0 Team Session 1, Lane D).
 */

const path = require('path');
require('./_engine.js').load();
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail !== undefined ? '  -- ' + detail : '')); failed++; }
}
function section(t){ console.log('--- ' + t + ' ---'); }

// A minimal campaign: a party (+ its journey) of a PC, a henchman, a hireling, a lone mercenary escort,
// and a dead member; a specialist hired by the PC but NOT a formal member (co-present via the relation).
function build(){
  const mk = (id, name, tier, extra) => Object.assign({ id, name, controlledBy: (tier === 'pc' ? 'player' : 'gm'),
    socialTier: (tier === 'pc' ? 'independent' : tier), currentHexId: 'hex-1', partyId: 'par-1',
    inventory: [], coins: { gp: 0 }, abilities: { CON: 10 } }, extra || {});
  const pc   = mk('chr-pc',   'Sir Alric', 'pc');
  const hen  = mk('chr-hen',  'Bran',      'henchman');
  const hire = mk('chr-hire', 'Digger',    'hireling');
  const merc = mk('chr-merc', 'Scarr',     'mercenary');                          // a LONE mercenary escort (a character) — eats
  const dead = mk('chr-dead', 'Ghost',     'independent', { alive: false });      // excluded
  const spec = mk('chr-spec', 'Vex',       'specialist', { partyId: null });      // co-present (same hex), NOT a formal member
  const party = { id: 'par-1', name: 'The Company',
    memberCharacterIds: ['chr-pc', 'chr-hen', 'chr-hire', 'chr-merc', 'chr-dead'],
    leaderCharacterId: 'chr-pc', currentHexId: 'hex-1', activeJourneyId: 'jry-1' };
  const jry = { id: 'jry-1', partyId: 'par-1',
    participantCharacterIds: ['chr-pc', 'chr-hen', 'chr-hire', 'chr-merc', 'chr-dead'],
    status: 'in-transit', currentDayIndex: 0, currentHexId: 'hex-1', startHexId: 'hex-1', supplies: {} };
  const camp = { characters: [pc, hen, hire, merc, dead, spec], parties: [party], journeys: [jry],
    hexes: [{ id: 'hex-1', terrain: 'grassland' }], mounts: [], houseRules: {},
    specialistContracts: [{ id: 'spc-1', specialistCharacterId: 'chr-spec', employerCharacterId: 'chr-pc', status: 'active' }] };
  return { camp, party, jry, pc, hen, hire, merc, dead, spec };
}

// ─────────────────────────────────────────────────────────────────────────────
section('D4/OQ1 — the individual-vs-unit ration line (ACKS._provisioningDemand)');
{
  const { camp, party } = build();
  const d = ACKS.moverProvisioningDemand(camp, party, {});
  check('the seam is installed as ACKS._provisioningDemand', ACKS._provisioningDemand === ACKS.moverProvisioningDemand);
  check('PC + henchman + hireling + lone-mercenary-escort are counted', ['chr-pc','chr-hen','chr-hire','chr-merc'].every(id => d.eaters.indexOf(id) >= 0));
  check('a dead/absent member is EXCLUDED', d.eaters.indexOf('chr-dead') < 0);
  check('a co-present hire (specialist, employer is a member) is counted though not a formal member', d.eaters.indexOf('chr-spec') >= 0);
  check('perEater is one ration + one water/day (RAW p.276)', d.perEaterFood === 1 && d.perEaterWater === 1);
  // a specialist NOT co-present (different hex, not a participant) is NOT pulled in
  const camp2 = build().camp; camp2.characters.find(c => c.id === 'chr-spec').currentHexId = 'hex-far';
  camp2.specialistContracts = [{ id:'spc-1', specialistCharacterId:'chr-spec', employerCharacterId:'chr-pc', status:'active' }];
  const d2 = ACKS.moverProvisioningDemand(camp2, camp2.parties[0], {});
  check('a hire that is NOT with the group is not fed', d2.eaters.indexOf('chr-spec') < 0);
}

// ─────────────────────────────────────────────────────────────────────────────
section('D4 — mercenary UNITS ride the supply cost, not the ration line (army mover → unitScale)');
{
  const { camp } = build();
  const armyMover = { kind: 'army', entity: { id: 'arm-1', groupTemplate: {}, memberCharacterIds: [] }, memberIds: ['chr-pc'], journey: null, currentHexId: null };
  const d = ACKS.moverProvisioningDemand(camp, armyMover, {});
  check('an army/unit/band mover has NO personal ration line', d.eaters.length === 0);
  check('and is flagged unitScale (fed by the gold weekly supply cost, RR Ch.10)', d.unitScale === true);
}

// ─────────────────────────────────────────────────────────────────────────────
section('group food/water-per-day readout (moverConsumptionPerDay)');
{
  const { camp, party } = build();
  // add a grazer donkey (food-free) + a camel (water-free) + a light horse to the journey
  const feedTracked = typeof ACKS.createMount === 'function';
  if(feedTracked){
    const donkey = ACKS.createMount(camp, { catalogKey: 'donkey', role: 'pack', ownerCharacterId: 'chr-pc', currentHexId: 'hex-1' });
    const camel  = ACKS.createMount(camp, { catalogKey: 'camel',  role: 'pack', ownerCharacterId: 'chr-pc', currentHexId: 'hex-1' });
    camp.journeys[0].packAnimalIds = [donkey.id, camel.id];
  }
  const cons = ACKS.moverConsumptionPerDay(camp, party);
  check('people fed = 5 (pc + henchman + hireling + mercenary + co-present specialist)', cons.people.count === 5);
  check('rations/day = water/day = the head count', cons.people.rationsPerDay === 5 && cons.people.waterPerDay === 5);
  check('the breakdown classifies (1 pc, 1 henchman)', cons.people.breakdown.pcs === 1 && cons.people.breakdown.henchmen === 1);
  check('people food stone = count × 1/6', Math.abs(cons.people.foodSt - (5 / 6)) < 0.02);
  if(feedTracked){
    check('animals counted (donkey + camel)', cons.animals.count === 2);
    check('the grazer donkey draws NO food (grazes), the camel NO water (dromedary)', cons.animals.foodSt < ACKS.mountDailyFoodSt(camp.mounts[0]) + ACKS.mountDailyFoodSt(camp.mounts[1]) && cons.animals.waterSt > 0);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('carrying capacity (groupHaulCapacity extends Foundation groupCarryingCapacity)');
{
  const { camp, party } = build();
  const base = ACKS.groupCarryingCapacity(camp, party);
  check('Foundation groupCarryingCapacity sums the member characters', base.memberSt > 0 && base.memberCount === 5);
  if(typeof ACKS.createMount === 'function'){
    const ox = ACKS.createMount(camp, { catalogKey: 'ox', role: 'pack', ownerCharacterId: 'chr-pc', currentHexId: 'hex-1' });
    camp.journeys[0].packAnimalIds = [ox.id];
  }
  const haul = ACKS.groupHaulCapacity(camp, party);
  check('groupHaulCapacity includes the member sum', haul.memberSt === base.memberSt);
  check('and adds pack animals (the ox), keeping the vehicle hook at 0 (TS2)', haul.animalSt > 0 && haul.vehicleSt === 0);
  check('totalSt = members + hires + animals + vehicles', Math.abs(haul.totalSt - (haul.memberSt + haul.hireSt + haul.animalSt + haul.vehicleSt)) < 0.05);
}

// ─────────────────────────────────────────────────────────────────────────────
section('the per-mover regime (D8) — party-canonical, journey-mirrored two-way sync');
{
  const { camp, party, jry } = build();
  const def = ACKS.moverRegimeState(camp, party);
  check('default = RAW (encounters on, sharing off, opt-outs auto)', def.skipEncounters.value === false && def.shareRations.value === false && def.skipProvisioning.mode === 'auto');
  // toggle shareRations FROM THE JOURNEY → writes party.regime + journey.regime + the legacy fields
  ACKS.setMoverRegimeFlag(camp, jry, 'shareRations', true);
  check('setMoverRegimeFlag writes the canonical party regime', party.regime && party.regime.shareRations === true);
  check('and mirrors onto the journey (D8 two-way)', jry.regime && jry.regime.shareRations === true);
  check('shareRations mirrors to the legacy party.shareProvisions (drives shipped sourcing)', party.shareProvisions === true);
  check('shareRations mirrors to the legacy journey.shareRations', jry.shareRations === true);
  // toggle skipEncounters FROM THE PARTY → the journey sees it (two-way)
  ACKS.setMoverRegimeFlag(camp, party, 'skipEncounters', true);
  check('toggling from the party syncs the journey (skipEncounters)', jry.regime.skipEncounters === true);
  // tri-state skipProvisioning: auto → skip → force → auto (toggle mutates; re-read the structured state)
  ACKS.toggleMoverRegimeFlag(camp, party, 'skipProvisioning');
  check('tri-state 1: auto → skip', ACKS.moverRegimeState(camp, party).skipProvisioning.mode === 'skip');
  ACKS.toggleMoverRegimeFlag(camp, party, 'skipProvisioning');
  check('tri-state 2: skip → force', ACKS.moverRegimeState(camp, party).skipProvisioning.mode === 'force');
  ACKS.toggleMoverRegimeFlag(camp, party, 'skipProvisioning');
  check('tri-state 3: force → auto', ACKS.moverRegimeState(camp, party).skipProvisioning.mode === 'auto');
  // a stationary party (no journey) still takes the toggle
  const solo = { id: 'par-2', name: 'Camp', memberCharacterIds: ['chr-pc'], currentHexId: 'hex-1' };
  camp.parties.push(solo);
  ACKS.setMoverRegimeFlag(camp, solo, 'shareLoad', true);
  check('a stationary party takes the regime toggle (even with no journey)', solo.regime && solo.regime.shareLoad === true);
}

// ─────────────────────────────────────────────────────────────────────────────
section('share-load (D5) — ON lowers the slowest band; balanceGroupLoad redistributes');
{
  // two walkers: Ada carries 10 st (heavy = 12 mi/day), Bo empty (24). Balanced 5/5 → unencumbered/24.
  const a = { id: 'chr-a', name: 'Ada', controlledBy: 'gm', socialTier: 'independent', currentHexId: 'hex-1', partyId: 'par-1', inventory: [{ name: 'pack1', encumbranceSt: 5 }, { name: 'pack2', encumbranceSt: 5 }], coins: { gp: 0 } };
  const b = { id: 'chr-b', name: 'Bo', controlledBy: 'gm', socialTier: 'independent', currentHexId: 'hex-1', partyId: 'par-1', inventory: [], coins: { gp: 0 } };
  const party = { id: 'par-1', name: 'Pair', memberCharacterIds: ['chr-a', 'chr-b'], leaderCharacterId: 'chr-a', currentHexId: 'hex-1' };
  const camp = { characters: [a, b], parties: [party], journeys: [], hexes: [{ id: 'hex-1', terrain: 'grassland' }], mounts: [], houseRules: {} };
  const rep = ACKS.groupShareLoadReport(camp, party);
  check('OFF = the slowest walker sets the pace (Ada heavy = 12 mi/day)', rep.slowestMilesPerDay === 12);
  check('ON (balanced) raises the slowest band above OFF', rep.balanced.slowestMilesPerDay > rep.slowestMilesPerDay);
  check('the report flags the improvement', rep.balanced.improves === true);
  const before = [ACKS.carryEncumbranceInfo(a).totalSt, ACKS.carryEncumbranceInfo(b).totalSt];
  const res = ACKS.balanceGroupLoad(camp, party);
  const after = [ACKS.carryEncumbranceInfo(a).totalSt, ACKS.carryEncumbranceInfo(b).totalSt];
  check('balanceGroupLoad moves an item (faithful redistribution)', res.moved >= 1);
  check('the max carried load drops (10 → 5)', Math.max(after[0], after[1]) < Math.max(before[0], before[1]));
  check('after balancing the shipped speed improves (both bands ≤ 5 st = unencumbered)', ACKS.carryEncumbranceInfo(a).band.milesPerDay === 24 && ACKS.carryEncumbranceInfo(b).band.milesPerDay === 24);
  // a mounted rider is excluded from the walker set (travels at the mount's speed)
  if(typeof ACKS.createMount === 'function'){
    const mtCamp = { characters: [a, b], parties: [party], journeys: [{ id: 'jry-x', partyId: 'par-1', participantCharacterIds: ['chr-a', 'chr-b'], status: 'in-transit', currentDayIndex: 0, currentHexId: 'hex-1', packAnimalIds: [] }], hexes: [{ id: 'hex-1', terrain: 'grassland' }], mounts: [], houseRules: {} };
    party.activeJourneyId = 'jry-x';
    const horse = ACKS.createMount(mtCamp, { catalogKey: 'horse-light', role: 'mount', riderCharacterId: 'chr-a', ownerCharacterId: 'chr-a', currentHexId: 'hex-1' });
    mtCamp.journeys[0].packAnimalIds = [horse.id];
    const rep2 = ACKS.groupShareLoadReport(mtCamp, mtCamp.journeys[0]);
    check('a mounted rider is not counted among the walkers (only Bo walks)', rep2.members.length === 1 && rep2.members[0].id === 'chr-b');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
section('seam byte-safety — resolveDaySurvival uses the eater set only when a group is passed');
{
  const { camp } = build();
  // WITH a group → the eater set governs (the dead member is excluded)
  const survG = ACKS.resolveDaySurvival(camp, { members: camp.characters.slice(), group: camp.parties[0], hex: camp.hexes[0] }, { rng: () => 0.99 });
  check('with a group, the dead member is not among the resolved eaters', !survG.ignored && !survG.members['chr-dead'] && !!survG.members['chr-pc']);
  // WITHOUT a group → args.members governs unchanged (the shipped callers' path)
  const twoMembers = [camp.characters[0], camp.characters[1]];
  const survM = ACKS.resolveDaySurvival(camp, { members: twoMembers, hex: camp.hexes[0] }, { rng: () => 0.99 });
  check('without a group, args.members governs unchanged (byte-identical to shipped callers)', Object.keys(survM.members).length === 2);
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Summary ---');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
if(failed === 0){
  console.log('\nAll Movement 2.0 provisioning/load smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nSome checks failed. Review output above.');
  process.exit(1);
}
