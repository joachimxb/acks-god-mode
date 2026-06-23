/* tests/hijinks.smoke.js — Phase 2.7 Hideouts & Hijinks (HJ-1).
 *
 *   node tests/hijinks.smoke.js   (or via `npm test`)
 *
 * The first slice: civilian hijinks (RR pp.360–370) resolved as a slot-60 day-tick
 * consumer. Covers the data layer + registries, the RAW definitions, the Streetwise
 * eligibility gate, the inlined throw math (base 11 + level/special bonuses + the
 * fail-by-14/nat-1 caught rule), the plan→perform→lay-low phase machine, the day-tick
 * propose==commit consistency (incl. cross-month), and the RAW reward formulas.
 */
'use strict';
require('./_engine.js').load();
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail) { if (cond) { pass++; } else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t) { console.log('\n— ' + t); }

// A campaign + a perpetrator. Streetwise by default so most tests can launch.
function mk(opts) {
  opts = opts || {};
  const c = { schemaVersion: 2, currentTurn: opts.turn || 1, currentDayInMonth: opts.day || 1,
    calendar: { year: 1, month: 1, day: opts.day || 1 }, houseRules: {},
    characters: [], settlements: [], domains: [], hexes: [], journeys: [], projects: [], parties: [], eventLog: [], hijinks: [] };
  const perp = { schemaVersion: 2, id: opts.id || 'chr-p', name: opts.name || 'Reingo',
    class: opts.cls || 'Thief', level: opts.level || 1, alive: true,
    proficiencies: opts.profs || ['Streetwise'], classPowers: opts.powers || [],
    currentHexId: opts.hexId || null, currentDomainId: null, coins: { gp: 0 }, personalGp: 0 };
  c.characters.push(perp);
  return c;
}
const HI = () => 0.99;   // → d20 20, high dice, long durations (success path)
const LO = () => 0.0;    // → d20 1 (caught), low dice
function runToTerminal(c, hijinkId, maxMonths) {
  const term = ['complete', 'failed', 'caught'];
  let months = 0;
  while (months < (maxMonths || 4)) {
    const h = ACKS.findHijink(c, hijinkId);
    if (!h || term.indexOf(h.status) >= 0) break;
    ACKS.runDayTickToMonthEnd(c);
    c.currentTurn++; c.currentDayInMonth = 1; c.calendar.day = 1;   // simulate the monthly rollover
    months++;
  }
  return ACKS.findHijink(c, hijinkId);
}

// =============================================================================
section('data layer + registries');
ok('HIJINK_DEFINITIONS has the 11 civilian hijinks', ACKS.hijinkTypes().length === 11, ACKS.hijinkTypes().join(','));
ok('blankHijink constructs with schemaVersion 2 + kind hijink', (() => { const h = ACKS.blankHijink({}); return h.schemaVersion === 2 && h.kind === 'hijink'; })());
ok('blankHijink mints a hij- id', /^hij-/.test(ACKS.blankHijink({}).id));
ok("the 'hijinks' day-consumer is registered at slot 60", (() => { const c = ACKS.dayConsumersInOrder().find(x => x.name === 'hijinks'); return c && c.order === 60; })());
ok('blankCampaign seeds hijinks: []', Array.isArray(ACKS.blankCampaign({}).hijinks));
ok("entity-registry knows kind 'hijink'", !!ACKS.entityKind('hijink') && ACKS.entityKind('hijink').icon === '🗡');
ok('registry hijink displayName reads label/type/id (factory keys)', ACKS.entityKind('hijink').displayName({}, ACKS.blankHijink({ label: 'X' })) === 'X');
ok("event kinds 'hijink-attempted' + 'hijink-resolved' registered", ACKS.isEventKindKnown('hijink-attempted') && ACKS.isEventKindKnown('hijink-resolved'));
ok('both event kinds are Event-Wizard opt-out', !ACKS.isWizardEmittable('hijink-attempted') && !ACKS.isWizardEmittable('hijink-resolved'));
ok('migrateCampaign does NOT lazy-inject hijinks (templates stay no-ops)', (() => { const c = ACKS.blankCampaign({}); delete c.hijinks; ACKS.migrateCampaign(c); return c.hijinks === undefined; })());

// =============================================================================
section('RAW definitions (RR pp.361–363)');
ok('the * (plannable) set = arson/assassinating/kidnapping/sabotaging/smuggling/stealing',
  ['arson', 'assassinating', 'kidnapping', 'sabotaging', 'smuggling', 'stealing'].every(t => ACKS.hijinkDefinition(t).plannable)
  && ['carousing', 'racketeering', 'soliciting', 'spying', 'treasure-hunting'].every(t => !ACKS.hijinkDefinition(t).plannable));
ok('carousing requires Listening', ACKS.hijinkDefinition('carousing').requiredSkill === 'Listening');
ok('stealing requires Pickpocketing', ACKS.hijinkDefinition('stealing').requiredSkill === 'Pickpocketing');
ok('racketeering is an attack-vs-AC6 throw', ACKS.hijinkDefinition('racketeering').throwType === 'attack-ac6');
ok('carousing lists its 7 RAW special-bonus proficiencies', ACKS.hijinkDefinition('carousing').special.length === 7);
ok('assassinating is class-restricted to Assassin/Nightblade', (ACKS.hijinkDefinition('assassinating').classRestrict || []).indexOf('Assassin') >= 0);

// =============================================================================
section('eligibility gate (RR p.360 — Streetwise required)');
ok('Streetwise proficiency ⇒ eligible', ACKS.hijinkPerpetratorEligible({ class: 'Fighter', proficiencies: ['Streetwise'] }));
ok('thieving class ⇒ eligible (class power)', ACKS.hijinkPerpetratorEligible({ class: 'Thief', proficiencies: [] }));
ok('Streetwise as a classPower ⇒ eligible', ACKS.hijinkPerpetratorEligible({ class: 'Fighter', classPowers: ['Streetwise'] }));
ok('plain Fighter (no Streetwise) ⇒ NOT eligible', !ACKS.hijinkPerpetratorEligible({ class: 'Fighter', proficiencies: ['Leadership'] }));
ok('Thief cannot assassinate (class restriction)', !ACKS.hijinkPerpetratorEligible({ class: 'Thief', proficiencies: ['Streetwise'] }, 'assassinating'));
ok('Assassin can assassinate', ACKS.hijinkPerpetratorEligible({ class: 'Assassin', proficiencies: ['Streetwise'] }, 'assassinating'));
ok('ineligible reason is descriptive', /Streetwise/i.test(ACKS.hijinkIneligibleReason({ class: 'Fighter', proficiencies: [] })));

// =============================================================================
section('throw math (HJ-1 inlined — RR p.360 + p.363)');
{
  const c = mk({ level: 1, profs: ['Streetwise'] });
  const p1 = ACKS.hijinkThrowProfile(c, c.characters[0], 'carousing', {});
  ok('base target 11, level-1 no bonus', p1.target === 11 && p1.bonus === 0);
  const c5 = mk({ level: 5, profs: ['Streetwise'] });
  ok('level 5–8 ⇒ +1 NPC bonus (RR p.363)', ACKS.hijinkThrowProfile(c5, c5.characters[0], 'carousing', {}).bonus === 1);
  const c9 = mk({ level: 9, profs: ['Streetwise', 'Bribery', 'Diplomacy'] });
  ok('level 9 (+2) + Bribery (+1) + Diplomacy (+1) = +4', ACKS.hijinkThrowProfile(c9, c9.characters[0], 'carousing', {}).bonus === 4);
  const cs = mk({ level: 1, profs: ['Streetwise', 'Skulking'] });
  ok('Skulking grants +2 (not +1) to a Hiding hijink', ACKS.hijinkThrowProfile(cs, cs.characters[0], 'spying', {}).specialBonus === 2);
  ok('victim level imposes −level (assassinating)', ACKS.hijinkThrowProfile(mk({ cls: 'Assassin' }), { class: 'Assassin', level: 5, proficiencies: ['Streetwise'] }, 'assassinating', { victimLevel: 3 }).victimPenalty === -3);
  const cr = mk({ level: 1 }); cr.characters[0].attackThrow = 10;
  ok('racketeering target = attackThrow − 6 (AC 6)', ACKS.hijinkThrowProfile(cr, cr.characters[0], 'racketeering', {}).target === 4);
}
ok('resolveThrow: total ≥ target ⇒ success', ACKS.hijinkResolveThrow(15, { target: 11, bonus: 0 }).outcome === 'success');
ok('resolveThrow: below target ⇒ fail', ACKS.hijinkResolveThrow(8, { target: 11, bonus: 0 }).outcome === 'fail');
ok('resolveThrow: natural 1 ⇒ caught', ACKS.hijinkResolveThrow(1, { target: 11, bonus: 20 }).outcome === 'caught');
ok('resolveThrow: fail by 14+ ⇒ caught', ACKS.hijinkResolveThrow(2, { target: 18, bonus: 0 }).outcome === 'caught');

// =============================================================================
section('DC-3 domain-morale resistance (RR p.351 — a loyal populace resists infiltration)');
{
  // a perpetrator operating IN a domain whose morale governs the populace's vigilance.
  // Skulking ⇒ +2 to a Hiding hijink, so the net throw exposes how the morale band folds in.
  function mkDom(morale) {
    const c = mk({ level: 1, profs: ['Streetwise', 'Skulking'] });
    c.domains.push({ schemaVersion: 2, id: 'dom-x', name: 'Loyalia', demographics: { morale: morale } });
    c.characters[0].currentDomainId = 'dom-x';
    return c;
  }
  const hi = mkDom(3);
  const sp = ACKS.hijinkThrowProfile(hi, hi.characters[0], 'spying', {});
  ok('+3 morale ⇒ spyThiefThrow −3 on a covert hijink (moraleMod)', sp.moraleMod === -3);
  ok('the morale penalty nets the bonus (+2 Skulking −3 morale = −1)', sp.bonus === -1);
  ok('the breakdown shows a named domain-populace part', sp.parts.some(p => /populace \(RR p\.351\)/.test(p.label) && p.value === -3));
  const hi4 = mkDom(4);
  ok('+4 morale ⇒ −4 (max penalty)', ACKS.hijinkThrowProfile(hi4, hi4.characters[0], 'spying', {}).moraleMod === -4);
  ok('0 morale ⇒ no modifier', ACKS.hijinkThrowProfile(mkDom(0), mkDom(0).characters[0], 'spying', {}).moraleMod === 0);
  ok('rebellious (−4) populace gives no bonus (table is 0 at ≤0)', ACKS.hijinkThrowProfile(mkDom(-4), mkDom(-4).characters[0], 'spying', {}).moraleMod === 0);
  // benign hijinks are exempt
  ok('carousing is exempt (overheard as a tavern patron)', ACKS.hijinkThrowProfile(hi, hi.characters[0], 'carousing', {}).moraleMod === 0);
  ok('treasure-hunting is exempt (a dungeon expedition, not vs the settlement)', ACKS.hijinkThrowProfile(hi, hi.characters[0], 'treasure-hunting', {}).moraleMod === 0);
  // domain resolution: perp.currentDomainId, explicit opts.domainId, or none
  const plain = mk({ level: 1, profs: ['Streetwise'] });
  ok('no domain context ⇒ no morale modifier', ACKS.hijinkThrowProfile(plain, plain.characters[0], 'spying', {}).moraleMod === 0);
  ok('explicit opts.domainId resolves the morale target', ACKS.hijinkThrowProfile(hi, hi.characters[0], 'stealing', { domainId: 'dom-x' }).moraleMod === -3);
  // captured at LAUNCH in the stored throwBonus (the outcome is locked even if morale later moves)
  const launch = mkDom(3);
  const r = ACKS.startHijink(launch, { perpetratorCharacterId: 'chr-p', type: 'spying', rng: () => 0.99 });
  ok('startHijink stores the morale-adjusted throwBonus', r.ok && launch.hijinks[0].throwBonus === -1);
}

// =============================================================================
section('startHijink — launch verb');
{
  const c = mk({ level: 1 });
  const r = ACKS.startHijink(c, { type: 'carousing', perpetratorCharacterId: 'chr-p', rng: HI });
  ok('ok + pushed to campaign.hijinks', r.ok && c.hijinks.length === 1);
  ok('ongoing hijink opens in performing phase', r.hijink.status === 'performing' && r.hijink.plannable === false);
  ok('the d20 + outcome are rolled + stored at launch (hidden)', r.hijink.throwDie >= 1 && r.hijink.throwDie <= 20 && r.hijink.outcome);
  ok("launch emits a 'hijink-attempted' event", c.eventLog.some(e => e.event.kind === 'hijink-attempted' && e.event.payload.perpetratorCharacterId === 'chr-p'));
  ok('attempt event carries the context envelope (perpetrator)', (() => { const e = c.eventLog.find(x => x.event.kind === 'hijink-attempted'); return e.event.context && e.event.context.relatedEntities[0].id === 'chr-p'; })());
}
{
  const c = mk({ level: 1, cls: 'Thief', profs: ['Streetwise'] });
  const s = ACKS.startHijink(c, { type: 'stealing', perpetratorCharacterId: 'chr-p', rng: HI });
  ok('plannable hijink opens in planning phase', s.hijink.status === 'planning' && s.hijink.plannable === true && s.hijink.planDaysTotal > 0 && s.hijink.layLowDaysTotal > 0);
}
ok('startHijink rejects an ineligible perpetrator', (() => { const c = mk({ cls: 'Fighter', profs: ['Leadership'] }); return ACKS.startHijink(c, { type: 'carousing', perpetratorCharacterId: 'chr-p' }).error === 'not-eligible'; })());
ok('startHijink rejects an unknown type', ACKS.startHijink(mk({}), { type: 'nope', perpetratorCharacterId: 'chr-p' }).error === 'unknown-type');
ok('assassinating rolls a victim level ±2 of the perpetrator', (() => {
  const c = mk({ cls: 'Assassin', level: 5 });
  const r = ACKS.startHijink(c, { type: 'assassinating', perpetratorCharacterId: 'chr-p', rng: () => 0.5 });
  return r.ok && r.hijink.victimLevel >= 3 && r.hijink.victimLevel <= 7;
})());

// =============================================================================
section('phase machine + resolution (ongoing)');
{
  const c = mk({ level: 1 });
  const r = ACKS.startHijink(c, { type: 'carousing', perpetratorCharacterId: 'chr-p', rng: HI });
  const h = runToTerminal(c, r.hijink.id);
  ok('an ongoing success resolves to complete', h.status === 'complete' && h.resolved === true);
  ok('the reward is credited to the perpetrator purse', c.characters[0].coins.gp === h.rewardGp && h.rewardGp > 0);
  ok('purse mirror (personalGp) synced', c.characters[0].personalGp === h.rewardGp);
  ok("resolution emits exactly one 'hijink-resolved' event", c.eventLog.filter(e => e.event.kind === 'hijink-resolved').length === 1);
  ok('the resolved event records the outcome', c.eventLog.find(e => e.event.kind === 'hijink-resolved').event.payload.outcome === 'success');
}
{ // caught: nat-1 ⇒ no reward, charge recorded, no laying low
  const c = mk({ level: 1 });
  const r = ACKS.startHijink(c, { type: 'carousing', perpetratorCharacterId: 'chr-p', rng: LO });
  ok('a nat-1 locks outcome=caught at launch', r.hijink.outcome === 'caught' && r.hijink.charge);
  const h = runToTerminal(c, r.hijink.id);
  ok('a caught hijink ends caught, no reward', h.status === 'caught' && c.characters[0].coins.gp === 0);
}

// =============================================================================
section('phase machine (plannable: plan → perform → lay low → complete)');
{
  const c = mk({ level: 1 });
  const r = ACKS.startHijink(c, { type: 'stealing', perpetratorCharacterId: 'chr-p', rng: () => 0.95 });
  ok('plannable launches success (high roll)', r.hijink.outcome === 'success');
  const seen = new Set(); const term = ['complete', 'failed', 'caught'];
  // step the phase machine directly (calendar-independent) so we observe every phase
  for (let i = 0; i < 80 && term.indexOf(ACKS.findHijink(c, r.hijink.id).status) < 0; i++) {
    ACKS.commitHijinkRecord(c, { kind: 'hijink', hijinkId: r.hijink.id });
    seen.add(ACKS.findHijink(c, r.hijink.id).status);
  }
  const h = ACKS.findHijink(c, r.hijink.id);
  ok('passes through planning, performing, laying-low', seen.has('planning') && seen.has('performing') && seen.has('laying-low'));
  ok('plannable success ⇒ complete after laying low', h.status === 'complete');
  ok('stealing reward = 300gp × level (no dice)', h.rewardGp === 300 * 1 && c.characters[0].coins.gp === 300);
}

// =============================================================================
section('day-tick consumer — propose==commit (no double credit)');
{
  // a +1-day tick projects a record; a multi-day force advance must credit exactly once
  const c1 = mk({ level: 1 });
  ACKS.startHijink(c1, { type: 'carousing', perpetratorCharacterId: 'chr-p', rng: HI });
  const prop = ACKS.proposeDayTick(c1, 1, {});
  ok('proposeHijinkDay emits a record for an active hijink', (prop.pendingRecords || []).some(r => r.consumer === 'hijinks' && /carous/i.test(r.label)));
  const c2 = mk({ level: 1 });
  const r2 = ACKS.startHijink(c2, { type: 'carousing', perpetratorCharacterId: 'chr-p', rng: HI });
  const full = ACKS.proposeDayTick(c2, 30, { force: true }); ACKS.commitDayTick(c2, full, null);
  // carousing at level 1 = 3d6+10 days; rng 0.99 ⇒ 28 days (≤30) ⇒ resolves within the month
  ok('a 30-day force advance resolves + credits exactly once', ACKS.findHijink(c2, r2.hijink.id).status === 'complete' && c2.characters[0].coins.gp === r2.hijink.rewardGp);
}
{ // cross-month: a 39-day plannable resolves after the monthly rollover
  const c = mk({ level: 1 });
  const r = ACKS.startHijink(c, { type: 'stealing', perpetratorCharacterId: 'chr-p', rng: () => 0.95 });
  const h = runToTerminal(c, r.hijink.id);
  ok('a plannable hijink spanning a month boundary still resolves once', h.status === 'complete' && c.characters[0].coins.gp === 300);
}

// =============================================================================
section('RAW reward formulas');
function rewardOf(type, level, rng, cls) {
  const c = mk({ level, cls: cls || 'Thief', profs: ['Streetwise'] });
  const r = ACKS.startHijink(c, { type, perpetratorCharacterId: 'chr-p', rng });
  return r.hijink;
}
ok('smuggling = 10% of 3000gp/level (= 300/level): level 3 ⇒ 900gp', rewardOf('smuggling', 3, HI).rewardGp === 900);
ok('stealing = 300gp/level: level 4 ⇒ 1200gp', rewardOf('stealing', 4, HI).rewardGp === 1200);
ok('assassination bounty = 1000gp × victim level', (() => { const h = rewardOf('assassinating', 5, HI, 'Assassin'); return h.rewardGp === 1000 * h.victimLevel; })());
ok('kidnapping ransom = 500gp × victim level', (() => { const h = rewardOf('kidnapping', 4, HI, 'Assassin'); return h.rewardGp === 500 * h.victimLevel; })());
ok('arson has no gp value (shp destroyed)', rewardOf('arson', 3, HI).rewardGp === 0 && rewardOf('arson', 3, HI).rewardUnit === 'shp');
ok('sabotaging has no gp value (supplies destroyed)', rewardOf('sabotaging', 3, HI).rewardUnit === 'supplies' && rewardOf('sabotaging', 3, HI).rewardGp === 0);
ok('carousing 3d12×5/level: level 2 within [30,360]', (() => { const g = rewardOf('carousing', 2, HI).rewardGp; return g >= 30 && g <= 360; })());
ok('racketeering 5d6×10/level ×60%: level 1 within [18,180]', (() => { const g = rewardOf('racketeering', 1, HI).rewardGp; return g >= 18 && g <= 180; })());
ok('boss collects the proceeds when set (independent ⇒ perpetrator keeps it)', (() => {
  const c = mk({ level: 1 }); c.characters.push({ id: 'chr-boss', name: 'Boss', class: 'Thief', level: 9, alive: true, proficiencies: ['Streetwise'], classPowers: [], coins: { gp: 0 }, personalGp: 0 });
  const r = ACKS.startHijink(c, { type: 'carousing', perpetratorCharacterId: 'chr-p', bossCharacterId: 'chr-boss', rng: HI });
  runToTerminal(c, r.hijink.id);
  const boss = c.characters.find(x => x.id === 'chr-boss');
  return boss.coins.gp === r.hijink.rewardGp && c.characters[0].coins.gp === 0;
})());

// =============================================================================
section('lookups');
{
  const c = mk({ level: 1 });
  const r = ACKS.startHijink(c, { type: 'carousing', perpetratorCharacterId: 'chr-p', rng: HI });
  ok('findHijink', ACKS.findHijink(c, r.hijink.id) === r.hijink);
  ok('activeHijinks includes the in-progress one', ACKS.activeHijinks(c).length === 1);
  ok('hijinksForPerpetrator', ACKS.hijinksForPerpetrator(c, 'chr-p').length === 1);
}

// =============================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — hijinks.smoke.js: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { console.log('Failures:\n  ' + failures.join('\n  ')); process.exit(1); }
