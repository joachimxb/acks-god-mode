/* tests/hijinks-hj3.smoke.js — Phase 2.7 Hideouts & Hijinks (HJ-3): syndicate depth.
 *
 *   node tests/hijinks-hj3.smoke.js   (or via `npm test`)
 *
 * The enterprise-depth layer atop HJ-2 (RR pp.358–369): NAMED LIEUTENANTS (a counted
 * member individuated into a real socialTier:'lieutenant' Character bound to the boss),
 * CREWS (multi-perpetrator coordination behind the default-OFF crew-hijinks rule),
 * change-in-management TAKEOVER (the boss flips + the lieutenants rebind + a
 * syndicate-takeover event), criminal GUILDS (an init-on-write syn.guild sub-record that
 * raises the membership cap), and RUMOR AUTO-EMIT for the rumor-bearing hijinks. All
 * additive: no new prefix/entity/collection/migration.
 */
'use strict';
require('./_engine.js').load();
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail) { if (cond) { pass++; } else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t) { console.log('\n— ' + t); }

const HI = () => 0.999;   // every die its maximum (a d20 of 20 → success)
const LO = () => 0.0;     // every die its minimum (a d20 of 1 → caught)

function mkCampaign(opts) {
  opts = opts || {};
  return { schemaVersion: 2, currentTurn: opts.turn || 1, currentDayInMonth: opts.day || 1,
    calendar: { year: 1, month: 1, day: opts.day || 1 }, houseRules: opts.houseRules || {},
    characters: [], settlements: [], domains: [], hexes: [], parties: [], eventLog: [], pendingEvents: [], hijinks: [], syndicates: [] };
}
function mkChar(c, opts) {
  opts = opts || {};
  const ch = { schemaVersion: 2, id: opts.id || ('chr-' + Math.random().toString(36).slice(2, 9)), name: opts.name || 'NPC',
    class: opts.cls || 'Thief', level: opts.level || 1, alive: true, lifecycleState: 'active', controlledBy: 'gm',
    proficiencies: opts.profs || [], classPowers: [], coins: { pp: 0, gp: opts.gp != null ? opts.gp : 0, ep: 0, sp: 0, cp: 0 },
    abilities: { STR: 10, INT: 10, WIL: 10, DEX: 10, CON: 10, CHA: 10 } };
  c.characters.push(ch); return ch;
}
function mkSyndicate(c, opts) {
  opts = opts || {};
  const boss = mkChar(c, { id: opts.bossId || 'chr-boss', name: opts.bossName || 'Viktir', cls: opts.bossClass || 'Thief', level: opts.bossLevel || 9 });
  const res = ACKS.formSyndicate(c, { bossCharacterId: boss.id, marketClass: opts.marketClass || 'III', hideoutValueGp: opts.hideoutValueGp || 75000, name: opts.name || 'The Family' });
  return { boss, syn: res.syndicate };
}
// Drive a hijink to its terminal state by replaying the day-tick commit (rng-free: the
// outcome was locked at launch). The resolution (reward + rumor) fires on the resolve day.
function runHijink(c, h) {
  for (let i = 0; i < 80 && ['planning', 'performing', 'laying-low'].indexOf(h.status) >= 0; i++) {
    ACKS.commitHijinkRecord(c, { kind: 'hijink', hijinkId: h.id });
  }
  return h;
}
const logKinds = (c) => (c.eventLog || []).map(e => e && e.event && e.event.kind);

// =============================================================================
section('house rule + event registration');
ok("house rule 'crew-hijinks' registered", !!ACKS.lookupHouseRule('crew-hijinks'));
ok("'crew-hijinks' is category 'hijinks'", (ACKS.lookupHouseRule('crew-hijinks') || {}).category === 'hijinks');
ok("'crew-hijinks' default OFF (no default key)", !((ACKS.lookupHouseRule('crew-hijinks') || {}).default));
ok("isHouseRuleEnabled('crew-hijinks') false on a fresh campaign", !ACKS.isHouseRuleEnabled(mkCampaign(), 'crew-hijinks'));
ok('crewHijinksEnabled false by default', !ACKS.crewHijinksEnabled(mkCampaign()));
ok('crewHijinksEnabled true when explicitly enabled', ACKS.crewHijinksEnabled(mkCampaign({ houseRules: { 'crew-hijinks': { enabled: true } } })));
['hijink-crew-assigned', 'syndicate-takeover'].forEach(k => {
  ok("event kind '" + k + "' registered", ACKS.isEventKindKnown(k));
  ok("event kind '" + k + "' is Event-Wizard opt-out", !ACKS.isWizardEmittable(k));
});

// =============================================================================
section('named lieutenants (individuation)');
{
  const c = mkCampaign();
  const { boss, syn } = mkSyndicate(c);
  ACKS.addSyndicateMembers(c, syn.id, 2, 5);   // five 2nd-level members
  ok('blankSyndicate has NO lieutenantCharacterIds key (init-on-write)', !('lieutenantCharacterIds' in ACKS.blankSyndicate({})));
  const res = ACKS.individuateLieutenant(c, syn.id, { level: 2, name: 'Reingo', class: 'Assassin' });
  ok('individuateLieutenant ok', res.ok);
  const lt = res.lieutenant;
  ok('the lieutenant is a Character on campaign.characters', !!c.characters.find(x => x.id === lt.id));
  ok("the lieutenant carries socialTier 'lieutenant'", lt.socialTier === 'lieutenant');
  ok('the lieutenant has the given class + level', lt.class === 'Assassin' && lt.level === 2);
  ok('the lieutenant is lieged to the boss', lt.liegeCharacterId === boss.id);
  ok('the lieutenant is added to syn.lieutenantCharacterIds (init-on-write)', (syn.lieutenantCharacterIds || []).indexOf(lt.id) >= 0);
  ok('drawing individuates from the counted bucket (5 → 4)', ACKS.syndicateMemberCount(syn) === 4);
  ok('isSyndicateLieutenant(lt) true', ACKS.isSyndicateLieutenant(lt));
  ok('syndicateLieutenants resolves the roster', ACKS.syndicateLieutenants(c, syn).map(x => x.id).indexOf(lt.id) >= 0);
  ok('syndicateForLieutenant finds the syndicate', (ACKS.syndicateForLieutenant(c, lt.id) || {}).id === syn.id);
  ok('the lieutenant is hijink-eligible (Assassin)', ACKS.hijinkPerpetratorEligible(lt, 'spying'));
  // fromBucket:false → does not touch the counted roster
  const before = ACKS.syndicateMemberCount(syn);
  ACKS.individuateLieutenant(c, syn.id, { level: 1, name: 'Fresh hire', fromBucket: false });
  ok('fromBucket:false leaves the counted roster untouched', ACKS.syndicateMemberCount(syn) === before);
  ok('individuateLieutenant on an unknown syndicate errors', !ACKS.individuateLieutenant(c, 'syn-nope', {}).ok);
}

// =============================================================================
section("a lieutenant's hijink reports to his boss (startHijink boss-derivation)");
{
  const c = mkCampaign();
  const { boss, syn } = mkSyndicate(c);
  const lt = ACKS.individuateLieutenant(c, syn.id, { level: 3, name: 'Lt. Dax' }).lieutenant;
  const r = ACKS.startHijink(c, { type: 'stealing', perpetratorCharacterId: lt.id, rng: HI });
  ok('a lieutenant launching a hijink ok', r.ok);
  ok("the hijink's boss is auto-set to the syndicate boss", r.hijink.bossCharacterId === boss.id);
  // an explicit boss overrides the derivation
  const other = mkChar(c, { id: 'chr-other', name: 'Other', cls: 'Venturer' });
  const r2 = ACKS.startHijink(c, { type: 'stealing', perpetratorCharacterId: lt.id, bossCharacterId: other.id, rng: HI });
  ok('an explicit boss overrides the lieutenant derivation', r2.hijink.bossCharacterId === other.id);
  // a non-lieutenant perpetrator with no boss stays independent
  const solo = mkChar(c, { id: 'chr-solo', name: 'Solo', cls: 'Thief' });
  const r3 = ACKS.startHijink(c, { type: 'stealing', perpetratorCharacterId: solo.id, rng: HI });
  ok('a non-lieutenant with no boss stays independent', r3.hijink.bossCharacterId === null);
}

// =============================================================================
section('crews (gated crew-hijinks)');
ok('crewThrowBonus +1 per member', ACKS.crewThrowBonus(['a', 'b']) === 2);
ok('crewThrowBonus caps at +3', ACKS.crewThrowBonus(['a', 'b', 'c', 'd', 'e']) === 3);
{
  // rule OFF: the crew is ignored entirely (non-functional + no event)
  const c = mkCampaign();
  const perp = mkChar(c, { id: 'chr-p', name: 'Honcho', cls: 'Thief', level: 1 });
  const m1 = mkChar(c, { id: 'chr-m1', cls: 'Thief' }), m2 = mkChar(c, { id: 'chr-m2', cls: 'Thief' });
  const r = ACKS.startHijink(c, { type: 'stealing', perpetratorCharacterId: perp.id, crew: [m1.id, m2.id], rng: HI });
  ok('rule OFF → h.crew is empty', (r.hijink.crew || []).length === 0);
  ok('rule OFF → h.crewBonus 0', r.hijink.crewBonus === 0);
  ok('rule OFF → throw bonus has no crew term (base 0)', r.hijink.throwBonus === 0);
  ok('rule OFF → no hijink-crew-assigned event', logKinds(c).indexOf('hijink-crew-assigned') < 0);
}
{
  // rule ON: each eligible crew member grants +1 (cap 3) + emits the event
  const c = mkCampaign({ houseRules: { 'crew-hijinks': { enabled: true } } });
  const perp = mkChar(c, { id: 'chr-p', name: 'Honcho', cls: 'Thief', level: 1 });
  const m1 = mkChar(c, { id: 'chr-m1', cls: 'Thief' }), m2 = mkChar(c, { id: 'chr-m2', cls: 'Nightblade' });
  const r = ACKS.startHijink(c, { type: 'stealing', perpetratorCharacterId: perp.id, crew: [m1.id, m2.id], rng: HI });
  ok('rule ON → h.crew has the 2 members', (r.hijink.crew || []).length === 2);
  ok('rule ON → h.crewBonus 2', r.hijink.crewBonus === 2);
  ok('rule ON → the crew bonus is in the throw (base 0 + 2)', r.hijink.throwBonus === 2);
  ok('rule ON → a hijink-crew-assigned event is emitted', logKinds(c).indexOf('hijink-crew-assigned') >= 0);
}
{
  // rule ON: ineligible crew (a Fighter, no Streetwise) is dropped; the honcho + dups excluded
  const c = mkCampaign({ houseRules: { 'crew-hijinks': { enabled: true } } });
  const perp = mkChar(c, { id: 'chr-p', cls: 'Thief', level: 1 });
  const good = mkChar(c, { id: 'chr-good', cls: 'Thief' });
  const bad = mkChar(c, { id: 'chr-bad', cls: 'Fighter' });   // not hijink-eligible
  const r = ACKS.startHijink(c, { type: 'stealing', perpetratorCharacterId: perp.id, crew: [good.id, bad.id, perp.id, good.id], rng: HI });
  ok('ineligible + the honcho + dups are dropped → 1 valid crew member', (r.hijink.crew || []).length === 1 && r.hijink.crew[0] === good.id);
  ok('only the eligible member counts toward the bonus', r.hijink.crewBonus === 1);
}

// =============================================================================
section('change-in-management takeover');
{
  const c = mkCampaign();
  const { boss, syn } = mkSyndicate(c);
  const lt1 = ACKS.individuateLieutenant(c, syn.id, { level: 5, name: 'Lt. One', class: 'Thief' }).lieutenant;
  const lt2 = ACKS.individuateLieutenant(c, syn.id, { level: 4, name: 'Lt. Two', class: 'Thief' }).lieutenant;
  const res = ACKS.takeoverSyndicate(c, syn.id, { newBossCharacterId: lt1.id, reason: 'a coup' });
  ok('takeover ok', res.ok);
  ok('the boss flips to the new boss', syn.bossCharacterId === lt1.id);
  ok('takeover reports the old boss', res.oldBossCharacterId === boss.id);
  ok('the new boss (a lieutenant) is removed from the roster', (syn.lieutenantCharacterIds || []).indexOf(lt1.id) < 0);
  ok('the remaining lieutenant rebinds to the new boss', lt2.liegeCharacterId === lt1.id);
  ok('a syndicate-takeover event is emitted', logKinds(c).indexOf('syndicate-takeover') >= 0);
  ok('takeover by the same boss is refused', !ACKS.takeoverSyndicate(c, syn.id, { newBossCharacterId: lt1.id }).ok);
  // an ineligible new boss (Fighter) is refused
  const fighter = mkChar(c, { id: 'chr-f', cls: 'Fighter' });
  ok('an ineligible new boss is refused', ACKS.takeoverSyndicate(c, syn.id, { newBossCharacterId: fighter.id }).error === 'boss-ineligible');
  ok('an unknown new boss is refused', ACKS.takeoverSyndicate(c, syn.id, { newBossCharacterId: 'chr-nope' }).error === 'unknown-boss');
  // candidates: eligible, active, not the current boss
  const cands = ACKS.syndicateTakeoverCandidates(c, syn).map(x => x.id);
  ok('takeover candidates exclude the current boss', cands.indexOf(syn.bossCharacterId) < 0);
  ok('takeover candidates include eligible others (lt2)', cands.indexOf(lt2.id) >= 0);
  ok('takeover candidates exclude an ineligible Fighter', cands.indexOf(fighter.id) < 0);
}

// =============================================================================
section('criminal guilds (init-on-write sub-record)');
ok('blankSyndicate has NO guild key (init-on-write)', !('guild' in ACKS.blankSyndicate({})));
{
  // a Class VI syndicate cannot charter a guild (needs Class III+)
  const c = mkCampaign();
  const small = ACKS.formSyndicate(c, { bossCharacterId: mkChar(c, { id: 'chr-vi', cls: 'Thief' }).id, marketClass: 'VI', hideoutValueGp: 5000 }).syndicate;
  ok('Class VI cannot charter a guild', !ACKS.canCharterGuild(c, small));
  ok('the reason mentions Class III', /Class III/.test(ACKS.canCharterGuildReason(c, small)));
  ok('Class VI @5,000 → 25 members (the HJ-2 invariant, un-chartered)', ACKS.syndicateMaxMembers(small) === 25);
}
{
  const c = mkCampaign();
  const { syn } = mkSyndicate(c, { marketClass: 'III', hideoutValueGp: 75000 });   // base cap 375
  const baseMax = ACKS.syndicateMaxMembers(syn);
  ok('Class III @75,000 base cap 375', baseMax === 375);
  ok('canCharterGuild true for Class III with a boss', ACKS.canCharterGuild(c, syn));
  const res = ACKS.charterGuild(c, syn.id, { name: 'The Honoured Society' });
  ok('charterGuild ok', res.ok);
  ok('syn.guild sub-record is created', !!syn.guild && syn.guild.chartered === true);
  ok('the guild carries the given name', syn.guild.name === 'The Honoured Society');
  ok('guildChartered(syn) true', ACKS.guildChartered(syn));
  ok('a chartered guild raises the membership cap ×1.5 (375 → 562)', ACKS.syndicateMaxMembers(syn) === Math.floor(baseMax * 1.5));
  ok('chartering twice is refused', !ACKS.charterGuild(c, syn.id, {}).ok);
}
{
  // a bossless syndicate cannot charter
  const c = mkCampaign();
  const syn = ACKS.formSyndicate(c, { marketClass: 'III', hideoutValueGp: 75000 }).syndicate;
  ok('a bossless syndicate cannot charter a guild', /needs a boss/.test(ACKS.canCharterGuildReason(c, syn)));
}

// =============================================================================
section('rumor auto-emit (Plan §7 — gated on rumors-auto-emit)');
function rumorCampaign(autoEmit) {
  return mkCampaign({ houseRules: autoEmit ? { 'rumors-auto-emit': { enabled: true } } : {} });
}
{
  // carousing success → a rumor on success (topic 'other', uncommon, mixed)
  const c = rumorCampaign(true);
  const perp = mkChar(c, { id: 'chr-car', name: 'Gossip', cls: 'Thief', level: 1, gp: 0 });
  const h = ACKS.startHijink(c, { type: 'carousing', perpetratorCharacterId: perp.id, settlementId: 'set-1', rng: HI }).hijink;
  ok('carousing locked to success', h.outcome === 'success');
  runHijink(c, h);
  ok('carousing resolved complete', h.status === 'complete');
  ok('h.rumorEmitted true', h.rumorEmitted === true);
  const rumor = (c.pendingEvents || []).find(e => e && e.kind === 'rumor-emit');
  ok('a rumor-emit pending event is queued', !!rumor);
  ok("rumor topic is 'other'", rumor && rumor.payload && rumor.payload.topic === 'other');
  ok("rumor apparentLevel 'uncommon'", rumor && rumor.payload && rumor.payload.apparentLevel === 'uncommon');
  ok('rumor sourceCharacterId is the perpetrator', rumor && rumor.payload && rumor.payload.sourceCharacterId === perp.id);
}
{
  // smuggling emits a rumor on CAUGHT (trigger differs per §7), not on success
  const c = rumorCampaign(true);
  const perp = mkChar(c, { id: 'chr-smu', name: 'Runner', cls: 'Thief', level: 1 });
  const h = ACKS.startHijink(c, { type: 'smuggling', perpetratorCharacterId: perp.id, rng: LO }).hijink;
  ok('smuggling locked to caught', h.outcome === 'caught');
  runHijink(c, h);
  ok('smuggling caught → a rumor on caught (trade)', (c.pendingEvents || []).some(e => e && e.kind === 'rumor-emit' && e.payload && e.payload.topic === 'trade'));
}
{
  // a non-rumor hijink (stealing) emits nothing
  const c = rumorCampaign(true);
  const perp = mkChar(c, { id: 'chr-st', cls: 'Thief', level: 1 });
  const h = ACKS.startHijink(c, { type: 'stealing', perpetratorCharacterId: perp.id, rng: HI }).hijink;
  runHijink(c, h);
  ok('a non-rumor hijink emits no rumor', !(c.pendingEvents || []).some(e => e && e.kind === 'rumor-emit'));
  ok('h.rumorEmitted stays false for a non-rumor hijink', h.rumorEmitted === false);
}
{
  // rule OFF → no rumor even for a rumor-bearing success
  const c = rumorCampaign(false);
  const perp = mkChar(c, { id: 'chr-car2', cls: 'Thief', level: 1 });
  const h = ACKS.startHijink(c, { type: 'carousing', perpetratorCharacterId: perp.id, rng: HI }).hijink;
  runHijink(c, h);
  ok('rumors-auto-emit OFF → no rumor queued', !(c.pendingEvents || []).some(e => e && e.kind === 'rumor-emit'));
}

// =============================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — hijinks-hj3.smoke: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('Failures:\n  - ' + failures.join('\n  - ')); process.exit(1); }
