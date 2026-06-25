// =============================================================================
// bandit-challenger.smoke.js — Phase 3 Military §13.6: the NPC bandit-leader
//   challenger (RR pp.350–351, "Dealing with Bandits").
//
//   node tests/bandit-challenger.smoke.js   (or via `npm test`)
//
// At morale ≤ −2 with banditry active, a CUMULATIVE monthly chance (1% / 5% / 10% at
// −2 / −3 / −4) that an NPC emerges from the bandits to challenge the ruler. He offers
// battle; if the ruler does not meet him in battle he loots/pillages the domain (−4 to
// its morale rolls). Defeating his bandit army (the W3 aftermath) or raising morale
// above −2 (the bands disperse) ends it. RAW-exact: "the NPC will have a level of
// experience sufficient to grant him a personal authority of +0" (RR p.350, Rebellious)
// generalized via personalAuthorityBracketForIncome(income)+1 ⇒ PA = 0 at any income.
//
// Byte-stability: the challenge roll + the generated NPC ride an ISOLATED seeded rng
// (options.challengerRng), so the shared band-reconcile stream (options.rng) is untouched
// — existing banditry suites stay green. generateNPC comes from the generators module
// (loaded here via _engine.js); battles.smoke deliberately omits it, so the spawn no-ops
// there. No new house rule / event kind / prefix / entity / migration.
// =============================================================================
'use strict';
const A = require('./_engine.js').load();

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(label + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('— ' + t); }
function seq(values){ let i = 0; return () => values[Math.min(i++, values.length - 1)]; }
function d20v(r){ return (r - 0.5) / 20; }

function mkCamp(opts){
  opts = opts || {};
  const c = A.blankCampaign();
  c.currentTurn = opts.turn || 1;
  c.houseRules = {};   // banditry is core RAW (RR pp.350–351) — no house rule, always on
  const ruler = A.blankCharacter({ id: 'chr-ruler', name: 'Lord Aldric', level: 8, kind: 'PC' });
  c.characters = [ruler];
  const d = A.blankDomain({ id: 'dom-grey', name: 'Greymarch' });
  d.rulerCharacterId = 'chr-ruler';
  d.demographics = d.demographics || {};
  d.demographics.morale = (opts.morale != null) ? opts.morale : -3;
  d.demographics.peasantFamilies = (opts.families != null) ? opts.families : 1000;
  c.domains = [d];
  c.groups = [];
  return { c, d, ruler };
}
function challengerOf(c, d){ return d.banditryChallenger ? (c.characters || []).find(x => x && x.id === d.banditryChallenger.characterId) : null; }
function lastEventAction(c, action){ return (c.eventLog || []).some(e => e.event && e.event.kind === 'domain-banditry' && e.event.payload && e.event.payload.action === action); }

// ─────────────────────────────────────────────────────────────────────────────
section('A leader emerges (RR p.351) — forced spawn');
{
  const { c, d } = mkCamp({ morale: -3, families: 1000, turn: 4 });
  d.banditryChallengeChance = 100;                                  // guarantee the d100 succeeds
  const res = A.processBanditryForTurn(c, { challengerRng: seq([0.0]) });
  ok('generateNPC is loaded (the spawn path is live)', typeof A.generateNPC === 'function');
  ok('a challenger is recorded on the domain', !!d.banditryChallenger && d.banditryChallenger.status === 'offering' && d.banditryChallenger.pillaging === false);
  const ch = challengerOf(c, d);
  ok('the challenger is a real Character in the roster', !!ch && !!ch.id && (c.characters || []).indexOf(ch) >= 0);
  ok('… gm-controlled + independent', ch && ch.controlledBy === 'gm' && ch.socialTier === 'independent');
  ok('… carries the banditChallenge marker for this domain', ch && ch.banditChallenge && ch.banditChallenge.domainId === 'dom-grey');
  ok('the risen bandit bands answer to the challenger (commanderCharacterId)', (c.groups || []).some(g => g.banditryDomainId === 'dom-grey') && (c.groups || []).filter(g => g.banditryDomainId === 'dom-grey').every(g => g.commanderCharacterId === ch.id));
  ok('the accumulator resets after a spawn', d.banditryChallengeChance === 0);
  ok('a challenger-emerged event was emitted', lastEventAction(c, 'challenger-emerged'));
  ok('the spawn is reported in the result log', (res.logEntries || []).some(l => /bandit lord/i.test(l) && /challenge/i.test(l)));
  // RAW-exact: the challenger's level grants personal authority exactly +0 at the domain's income.
  const income = A.domainIncome(c, d);
  const bracket = A.personalAuthorityBracketForIncome(income);
  ok('challenger level = bracket(income)+1 ⇒ personal authority +0 (RR p.350)',
     ch.level === Math.max(1, Math.min(14, bracket + 1)) && A.computePersonalAuthority(ch.level, income) === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
section('The cumulative monthly chance (RR p.350) — accumulate without spawning');
{
  const { c, d } = mkCamp({ morale: -2, families: 1000, turn: 1 });
  A.processBanditryForTurn(c, { challengerRng: seq([0.99]) });      // d100 = 100 > 1 → no leader
  ok('no challenger on a missed −2 roll', !d.banditryChallenger);
  ok('the chance accumulated +1 at −2 (Turbulent)', d.banditryChallengeChance === 1);
  c.currentTurn = 2;
  A.processBanditryForTurn(c, { challengerRng: seq([0.99]) });
  ok('the chance is cumulative — +1 again → 2', d.banditryChallengeChance === 2);
}
{
  const { c, d } = mkCamp({ morale: -3, families: 1000, turn: 1 });
  A.processBanditryForTurn(c, { challengerRng: seq([0.99]) });
  ok('+5 per month at −3 (Defiant)', d.banditryChallengeChance === 5);
}
{
  const { c, d } = mkCamp({ morale: -4, families: 1000, turn: 1 });
  A.processBanditryForTurn(c, { challengerRng: seq([0.99]) });
  ok('+10 per month at −4 (Rebellious)', d.banditryChallengeChance === 10);
}
{
  const { c, d } = mkCamp({ morale: -1, families: 1000, turn: 1 });   // morale > −2: no banditry
  A.processBanditryForTurn(c, { challengerRng: seq([0.0]) });
  ok('no challenge accrues above −2 (no banditry)', !d.banditryChallenger && (d.banditryChallengeChance || 0) === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
section('Offer battle → loot/pillage if unmet (RR p.351) → the −4 morale penalty');
{
  const { c, d } = mkCamp({ morale: -3, families: 1000, turn: 4 });
  d.banditryChallengeChance = 100;
  A.processBanditryForTurn(c, { challengerRng: seq([0.0]) });        // emerge (offering)
  ok('emerges offering, not yet pillaging', d.banditryChallenger.status === 'offering' && !d.banditryChallenger.pillaging);
  ok('no −4 morale modifier while merely offering', !A.moraleModifiersFor(c, d).some(m => m.value === -4 && /bandit lord/i.test(m.label)));
  c.currentTurn = 5;
  A.processBanditryForTurn(c, { challengerRng: seq([0.0]) });        // next month, unmet → pillage
  ok('escalates to pillaging when the ruler does not meet him', d.banditryChallenger.status === 'pillaging' && d.banditryChallenger.pillaging === true);
  ok('a challenger-pillages event was emitted', lastEventAction(c, 'challenger-pillages'));
  const mods = A.moraleModifiersFor(c, d);
  ok('the −4 pillage penalty now applies to morale rolls (RR p.351)', mods.some(m => m.value === -4 && /bandit lord/i.test(m.label)));
  // steady state — a further month does not re-emit / double-apply
  c.currentTurn = 6;
  const evBefore = (c.eventLog || []).length;
  A.processBanditryForTurn(c, { challengerRng: seq([0.0]) });
  ok('a steady pillaging challenger does not re-escalate (no new event)', (c.eventLog || []).filter(e => e.event && e.event.payload && e.event.payload.action === 'challenger-pillages').length === 1);
  // RR p.354 — the pillage −4 is IN LIEU OF the occupation penalty (they do not stack): with the
  // bandit lord pillaging, the cumulative enemy-army occupation row is suppressed; only the −4 applies.
  d.banditryOccupationMonths = 3;   // would be a −2 occupation row on its own
  const pmods = A.moraleModifiersFor(c, d);
  ok('the pillage −4 still applies while the lord loots', pmods.some(m => m.value === -4 && /bandit lord/i.test(m.label)));
  ok('the occupation row is suppressed while pillaging (in lieu of — RR p.354)', !pmods.some(m => /occupation/i.test(m.label)));
}

// ─────────────────────────────────────────────────────────────────────────────
section('Raise morale above −2 → the challenger disperses (RR p.351)');
{
  const { c, d } = mkCamp({ morale: -3, families: 1000, turn: 4 });
  d.banditryChallengeChance = 100;
  A.processBanditryForTurn(c, { challengerRng: seq([0.0]) });
  const ch = challengerOf(c, d);
  ok('challenger present before recovery', !!ch);
  d.demographics.morale = -1;                                        // banditCount → 0 (no bandits)
  c.currentTurn = 5;
  A.processBanditryForTurn(c, { challengerRng: seq([0.0]) });
  ok('the challenge is cleared once the bandits disperse', d.banditryChallenger == null);
  ok('the dispersed bandit lord is marked departed', ch.lifecycleState === 'departed');
  ok('a challenger-dispersed event was emitted', lastEventAction(c, 'challenger-dispersed'));
}

// ─────────────────────────────────────────────────────────────────────────────
section('Meet him in battle → the challenge is broken (RR p.351; the W3 aftermath hook)');
{
  const { c, d, ruler } = mkCamp({ morale: -3, families: 1600, turn: 2 });
  const lord = A.blankCharacter({ id: 'chr-lord', name: 'Bandit Lord', level: 5, kind: 'NPC', controlledBy: 'gm' });
  c.characters.push(lord);
  d.banditryChallenger = { characterId: 'chr-lord', sinceTurn: 1, status: 'pillaging', pillaging: true };
  const band = A.blankGroup({ id: 'grp-bandit', name: 'Bandits of Greymarch',
    groupTemplate: { monsterCatalogKey: 'bandit', creatureTypes: ['humanoid'], hitDice: '1' },
    count: 800, currentHexId: 'hex-field' });
  band.banditryDomainId = d.id; band.commanderCharacterId = 'chr-lord';
  c.groups = [band];
  ok('the −4 pillage penalty is live before the battle', A.moraleModifiersFor(c, d).some(m => m.value === -4 && /bandit lord/i.test(m.label)));
  const garrisonUnit = { key: 'a0', label: 'Heavy Infantry', sourceKind: 'unit', sourceId: 'unit-g',
    creatures: 60, status: 'active', br: 5, wageMonthlyGp: 720, xpValue: 300, disordered: false };
  const bandUnit = { key: 'b0', label: 'Bandits of Greymarch', sourceKind: 'group', sourceId: 'grp-bandit',
    creatures: 800, status: 'destroyed', br: 0.4, wageMonthlyGp: 0, xpValue: 800, disordered: false };
  c.battles = [{
    id: 'btl-bandit', name: 'Repression of Greymarch', status: 'ended', attackerSide: 'a',
    result: { winner: 'a', loser: 'b', endedBy: 'morale', endedAtTurn: 2 },
    hexId: 'hex-field', turnNumber: 2,
    sides: {
      a: { label: 'Garrison', units: [garrisonUnit], leaderCharacterId: 'chr-ruler', commanders: [], startingBr: 5, stance: 'offensive', groupIds: [], domainId: null },
      b: { label: 'Bandits of Greymarch', units: [bandUnit], leaderCharacterId: null, commanders: [], startingBr: 320, stance: 'defensive', groupIds: ['grp-bandit'] }
    }
  }];
  A.computeBattleAftermath(c, 'btl-bandit', { rng: seq([d20v(1)]) });
  A.applyBattleAftermath(c, 'btl-bandit');
  ok('the domain is healed (banditOutcome — the shipped E10 aftermath still fires)', d.demographics.morale === -2);
  ok('defeating the bandit army clears the challenger', d.banditryChallenger == null);
  ok('the beaten bandit lord is marked departed', lord.lifecycleState === 'departed');
  ok('the −4 pillage penalty is gone once the challenge is broken', !A.moraleModifiersFor(c, d).some(m => m.value === -4 && /bandit lord/i.test(m.label)));
}

// ─────────────────────────────────────────────────────────────────────────────
section('One challenger at a time');
{
  const { c, d } = mkCamp({ morale: -4, families: 1000, turn: 4 });
  d.banditryChallengeChance = 100;
  A.processBanditryForTurn(c, { challengerRng: seq([0.0]) });
  const n1 = (c.characters || []).filter(x => x.banditChallenge).length;
  c.currentTurn = 5;
  d.banditryChallengeChance = 100;
  A.processBanditryForTurn(c, { challengerRng: seq([0.0]) });
  const n2 = (c.characters || []).filter(x => x.banditChallenge).length;
  ok('an existing challenger blocks a second spawn', n1 === 1 && n2 === 1);
}

// ─────────────────────────────────────────────────────────────────────────────
section('applyBanditryQuelled — the shared RR p.351 heal (pitched battle + drive-off)');
{
  const { c, d } = mkCamp({ morale: -3, families: 1000 });
  const r = A.applyBanditryQuelled(c, d, { killed: 0 });
  ok('+1 current morale, clamped (−3 → −2)', d.demographics.morale === -2 && r.moraleBefore === -3 && r.moraleAfter === -2);
  ok('a bloodless rout (killed 0) costs no families', d.demographics.peasantFamilies === 1000);
}
{
  const { c, d } = mkCamp({ morale: -3, families: 1000 });
  A.applyBanditryQuelled(c, d, { killed: 400 });
  ok('the slain reduce the population (RR p.351)', d.demographics.peasantFamilies === 600 && d.demographics.morale === -2);
}
{
  const { c, d } = mkCamp({ morale: 4, families: 1000 });
  A.applyBanditryQuelled(c, d, { killed: 0 });
  ok('morale clamps at +4', d.demographics.morale === 4);
}

// ─────────────────────────────────────────────────────────────────────────────
section('Driving bandits off the field heals the domain too (RR p.351 — parity with the battle)');
{
  const { c, d } = mkCamp({ morale: -3, families: 1000, turn: 4 });
  const lord = A.blankCharacter({ id: 'chr-lord', name: 'Bandit Lord', level: 5, kind: 'NPC', controlledBy: 'gm' });
  c.characters.push(lord);
  d.banditryChallenger = { characterId: 'chr-lord', sinceTurn: 1, status: 'pillaging', pillaging: true };
  const band = A.blankGroup({ id: 'grp-b', name: 'Bandits of Greymarch',
    groupTemplate: { monsterCatalogKey: 'bandit', creatureTypes: ['humanoid'], hitDice: '1' },
    count: 200, currentHexId: 'hex-x' });
  band.banditryDomainId = d.id; band.commanderCharacterId = 'chr-lord';
  c.groups = [band];
  c.armies = [{ id: 'army-g', name: 'Greymarch Garrison', leaderCharacterId: 'chr-ruler',
    currentHexId: 'hex-x', reactionTargetGroupId: 'grp-b', history: [] }];
  ok('the −4 pillage penalty is live before the rout', A.moraleModifiersFor(c, d).some(m => m.value === -4 && /bandit lord/i.test(m.label)));
  A.commitMilitaryRecord(c, { kind: 'army-band-contact', armyId: 'army-g', groupId: 'grp-b',
    domainId: null, outcome: 'driven-off', hexId: 'hex-x' });
  ok('the domain is healed +1 on a rout (RR p.351 — parity with the battle path)', d.demographics.morale === -2);
  ok('a bloodless rout costs no families', d.demographics.peasantFamilies === 1000);
  ok('the routed band disperses', !(c.groups || []).some(g => g.id === 'grp-b'));
  ok('routing the bandits breaks the bandit-lord challenge', d.banditryChallenger == null && lord.lifecycleState === 'departed');
  ok('the −4 pillage penalty is gone once the challenge is broken', !A.moraleModifiersFor(c, d).some(m => m.value === -4 && /bandit lord/i.test(m.label)));
}
{
  // A monster incursion (no banditryDomainId) driven off does NOT heal domain morale — the
  // RR p.351 heal is scoped to the domain's own bandits; orcs are simply repelled off-map.
  const { c, d } = mkCamp({ morale: -3, families: 1000, turn: 4 });
  const orc = A.blankGroup({ id: 'grp-orc', name: 'Orc raiders', count: 30, currentHexId: 'hex-y' });
  orc.incursion = { domainId: d.id, attitude: 'unfriendly' };
  c.groups = [orc];
  c.armies = [{ id: 'army-2', name: 'Garrison', leaderCharacterId: 'chr-ruler',
    currentHexId: 'hex-y', reactionTargetGroupId: 'grp-orc', history: [] }];
  A.commitMilitaryRecord(c, { kind: 'army-band-contact', armyId: 'army-2', groupId: 'grp-orc',
    domainId: d.id, outcome: 'driven-off', hexId: 'hex-y' });
  ok('a monster incursion driven off does NOT heal domain morale', d.demographics.morale === -3);
  ok('the incursion band is repelled off-map (kept, currentHexId null)', (c.groups || []).some(g => g.id === 'grp-orc' && g.currentHexId == null));
}

console.log((fail === 0 ? 'PASS ' : 'FAIL ') + pass + '/' + (pass + fail) + ' bandit-challenger assertions');
if(fail){ console.log(failures.length + ' failure(s):'); failures.forEach(f => console.log('  - ' + f)); process.exit(1); }
