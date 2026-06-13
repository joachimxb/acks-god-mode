/* tests/mortal-wounds.smoke.js — Delves D1: the Mortal Wounds resolver.
 *
 *   node tests/mortal-wounds.smoke.js   (or via `npm test`)
 *
 * The shared casualty primitive (RR pp.300–301 + Appendix C pp.517–523). Covers the
 * data layer + registries (the 2 event kinds, the slot-58 convalescence consumer,
 * blankCharacter.mortalWounds[]), the condition/recovery ladder, the modifier set (full +
 * the abstract CON/HD/helm subset), the resolver outcomes, applyMortalWound's mutation
 * (deceased / incapacitated, the permanentWoundPenalty accrual), the Tampering side-effect
 * (the mortalityPenalty accrual), and the convalescence consumer firing on the Day Clock.
 */
'use strict';
require('./_engine.js').load();
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail) { if (cond) { pass++; } else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t) { console.log('\n— ' + t); }

function mkCampaign(opts) {
  opts = opts || {};
  return { schemaVersion: 2, currentTurn: opts.turn || 1, currentDayInMonth: opts.day || 1,
    calendar: { year: 1, month: 1, day: opts.day || 1 }, houseRules: {},
    characters: [], domains: [], hexes: [], journeys: [], projects: [], parties: [], eventLog: [] };
}
function mkChar(c, opts) {
  opts = opts || {};
  const ch = ACKS.blankCharacter(Object.assign({
    id: opts.id || 'chr-1', name: opts.name || 'Borin',
    abilities: opts.abilities || { STR:10, INT:10, WIL:10, DEX:10, CON:10, CHA:10 },
    hp: opts.hp || { current: 0, max: 20, hitDice: '1d8' },
    currentHexId: opts.hexId || 'hex-a'
  }, opts.extra || {}));
  c.characters.push(ch);
  return ch;
}

// =============================================================================
section('data layer + registries');
ok('blankCharacter seeds mortalWounds: []', Array.isArray(ACKS.blankCharacter({}).mortalWounds) && ACKS.blankCharacter({}).mortalWounds.length === 0);
ok("event kind 'mortal-wound' is registered", ACKS.isEventKindKnown('mortal-wound'));
ok("event kind 'wound-recovery' is registered", ACKS.isEventKindKnown('wound-recovery'));
ok('both events opt out of the Event Wizard', !ACKS.isWizardEmittable('mortal-wound') && !ACKS.isWizardEmittable('wound-recovery'));
ok("the 'convalescence' day-consumer is registered at slot 58", (() => { const c = ACKS.dayConsumersInOrder().find(x => x.name === 'convalescence'); return c && c.order === 58; })());
ok('the convalescence consumer exposes handler + commit', (() => { const c = ACKS.dayConsumersInOrder().find(x => x.name === 'convalescence'); return c && typeof c.handler === 'function' && typeof c.commit === 'function'; })());
ok('rollMortalWounds is an alias of rollMortalWound', ACKS.rollMortalWounds === ACKS.rollMortalWound);

// =============================================================================
section('the condition / recovery ladder (RR p.517 — shared across all damage tables)');
const C = ACKS.conditionForModifiedD20;
ok('modified ≤ 0 → instantly killed', C(0).id === 'instantly-killed' && C(-6).id === 'instantly-killed' && C(0).killed === true);
ok('1–5 → mortally wounded (1 round window, 1 month rest)', C(3).id === 'mortally-wounded' && C(3).healToOneHpWindow === '1 round' && C(3).bedRestDays === 30);
ok('6–10 → grievously wounded (1 turn, 2 weeks)', C(8).id === 'grievously-wounded' && C(8).healToOneHpWindow === '1 turn' && C(8).bedRestDays === 14);
ok('11–15 → critically wounded (1 day, 1 week)', C(13).id === 'critically-wounded' && C(13).healToOneHpWindow === '1 day' && C(13).bedRestDays === 7);
ok('16–20 → in shock (auto-recover, 1 week / 1 night magical)', C(18).id === 'in-shock' && C(18).recoversAutomatically === true && C(18).bedRestDays === 7 && C(18).magicalShortensToDays === 1);
ok('21–25 → knocked out (auto-recover, 1 night)', C(23).id === 'knocked-out' && C(23).recoversAutomatically === true && C(23).bedRestDays === 1);
ok('26+ → just dazed (auto-recover, no bed rest)', C(30).id === 'just-dazed' && C(30).bedRestDays === 0);
ok('boundary: 15 critical, 16 shock', C(15).id === 'critically-wounded' && C(16).id === 'in-shock');

// =============================================================================
section('the modifier set (RR pp.300–301)');
const con18 = { abilities: { CON: 18 } };
const bdFull = ACKS.mortalWoundModifierBreakdown({ abilities:{CON:18}, hp:{hitDice:'1d8'} }, { abstract:false, heavyHelm:true, treatmentTiming:'within-1-round' });
ok('full breakdown sums CON +3, HD(d8) +4, helm +2, timing +2 = +11', bdFull.total === 11, 'got ' + bdFull.total);
const bdAbs = ACKS.mortalWoundModifierBreakdown({ abilities:{CON:18}, hp:{hitDice:'1d8'} }, { abstract:true, heavyHelm:true, treatmentTiming:'within-1-round', healingMagicLevel:3 });
ok('abstract breakdown uses ONLY CON/HD/helm (ignores timing + healing magic)', bdAbs.total === 9 && bdAbs.abstract === true, 'got ' + bdAbs.total);
ok('HD value bonus by die: d6 +2, d8 +4, d10 +6, d12 +8', ACKS.HIT_DIE_VALUE_BONUS.d6 === 2 && ACKS.HIT_DIE_VALUE_BONUS.d8 === 4 && ACKS.HIT_DIE_VALUE_BONUS.d10 === 6 && ACKS.HIT_DIE_VALUE_BONUS.d12 === 8);
ok('ACKS ability mod table: 18→+3, 13→+1, 9→0, 6→−1, 3→−3', ACKS.mortalWoundAbilityMod(18)===3 && ACKS.mortalWoundAbilityMod(13)===1 && ACKS.mortalWoundAbilityMod(9)===0 && ACKS.mortalWoundAbilityMod(6)===-1 && ACKS.mortalWoundAbilityMod(3)===-3);

// the RR p.301 Marcus worked example: 18 CON (+3), d8 HD (+4), cure serious (+4), within 1 round (+2),
// hp at −12 of 36 max (−2) → +11; rolls a 6 → 17 → in shock. (We feed the rolled d20 + the modifiers.)
const marcus = ACKS.rollMortalWound({ abilities:{CON:18}, hp:{hitDice:'1d8',max:36} }, {
  damageType:'fire', forcedD20:6, forcedD6:2, abstract:false,
  heavyHelm:false, hpAtFall:-2, healingMagicLevel:4, treatmentTiming:'within-1-round'
});
ok('RR p.301 Marcus example: 6 + 11 = 17 → in shock', marcus.modified === 17 && marcus.conditionId === 'in-shock', 'modified ' + marcus.modified + ' cond ' + marcus.conditionId);

// =============================================================================
section('rollMortalWound — outcomes + permanent wounds');
const wKill = ACKS.rollMortalWound({ abilities:{CON:10} }, { forcedD20:1, conMod:-10, hdBonus:0, abstract:true });
ok('a deep-negative modified roll is killed (no permanent wound)', wKill.killed === true && wKill.permanentWound === null);
const wMortal = ACKS.rollMortalWound({}, { conditionId:'mortally-wounded', forcedD6:4, damageType:'savage' });
ok('mortally wounded → permanent wound from the Savage table, lasting', wMortal.lastingWound === true && /arms lost/i.test(wMortal.permanentWound.effect), wMortal.permanentWound.effect);
const wDazedScar = ACKS.rollMortalWound({}, { conditionId:'just-dazed', forcedD6:3 });
ok('dazed minor scarring is NOT lasting (no game effect)', wDazedScar.lastingWound === false);
ok('rollMortalWound carries the page cite', /RR p\.523/.test(ACKS.rollMortalWound({}, { conditionId:'in-shock', forcedD6:1, damageType:'savage' }).cite));
ok('a non-savage damage type still resolves (shared ladder + page cite)', (() => { const w = ACKS.rollMortalWound({}, { conditionId:'grievously-wounded', forcedD6:3, damageType:'cold' }); return w.conditionId === 'grievously-wounded' && /RR p\.519/.test(w.cite); })());

// =============================================================================
section('applyMortalWound — mutation + the permanentWoundPenalty accrual');
{
  const c = mkCampaign(); const ch = mkChar(c, { name:'Slain', id:'chr-k' });
  const w = ACKS.rollMortalWound(ch, { conditionId:'instantly-killed' });
  const rec = ACKS.applyMortalWound(c, 'chr-k', w);
  ok('killed → lifecycleState deceased + alive false', ch.lifecycleState === 'deceased' && ch.alive === false);
  ok('killed → a mortalWounds record with outcome killed', ch.mortalWounds.length === 1 && rec.outcome === 'killed');
  ok('applyMortalWound emits a mortal-wound event into the eventLog', c.eventLog.length === 1 && c.eventLog[0].event.kind === 'mortal-wound');
  ok('the event carries the character in its context envelope', c.eventLog[0].event.context.relatedEntities.some(r => r.id === 'chr-k' && r.role === 'subject'));
  ok('the event is stamped on the hex (context.primaryHexId)', c.eventLog[0].event.context.primaryHexId === 'hex-a');
}
{
  const c = mkCampaign(); const ch = mkChar(c, { name:'Maimed', id:'chr-m', abilities:{CON:13} });
  const w = ACKS.rollMortalWound(ch, { conditionId:'critically-wounded', forcedD6:4, damageType:'savage' }); // one hand lost (lasting)
  ACKS.applyMortalWound(c, 'chr-m', w, { healedToOneHp:true });
  ok('a healed 11–15 wound → incapacitated (not deceased)', ch.lifecycleState === 'incapacitated' && ch.alive !== false);
  ok('a lasting permanent wound accrues permanentWoundPenalty −1', ch.permanentWoundPenalty === -1);
  ok('the convalescence clock is set to the band bed-rest (1 week = 7)', ch.mortalWounds[0].bedRestDaysRemaining === 7);
  // a second lasting wound stacks, clamped to −3
  const w2 = ACKS.rollMortalWound(ch, { conditionId:'mortally-wounded', forcedD6:4 });
  ACKS.applyMortalWound(c, 'chr-m', w2, { healedToOneHp:true });
  const w3 = ACKS.rollMortalWound(ch, { conditionId:'mortally-wounded', forcedD6:3 });
  ACKS.applyMortalWound(c, 'chr-m', w3, { healedToOneHp:true });
  ok('the standing wound penalty clamps at −3', ch.permanentWoundPenalty === -3);
}
{
  const c = mkCampaign(); const ch = mkChar(c, { name:'Doomed', id:'chr-d' });
  const w = ACKS.rollMortalWound(ch, { conditionId:'mortally-wounded', forcedD6:1 });
  const rec = ACKS.applyMortalWound(c, 'chr-d', w, { healedToOneHp:false }); // NOT healed in the window → dies
  ok('a 1–15 wound NOT healed in the window → deceased', ch.lifecycleState === 'deceased' && rec.outcome === 'killed');
}
{
  const c = mkCampaign(); const ch = mkChar(c, { name:'Dazed', id:'chr-z' });
  const w = ACKS.rollMortalWound(ch, { conditionId:'just-dazed', forcedD6:6 });
  ACKS.applyMortalWound(c, 'chr-z', w);
  ok('a dazed wound resolves at once (active, no convalescence)', ch.lifecycleState !== 'incapacitated' && ch.mortalWounds[0].resolved === true);
}
{
  const c = mkCampaign(); const ch = mkChar(c, { name:'Shock', id:'chr-s' });
  const w = ACKS.rollMortalWound(ch, { conditionId:'in-shock', forcedD6:6 });
  ACKS.applyMortalWound(c, 'chr-s', w, { magicalHealing:true });
  ok('magical healing shortens an in-shock wound to 1 day bed rest', ch.mortalWounds[0].bedRestDaysRemaining === 1);
}

// =============================================================================
section('Tampering with Mortality — the mortalityPenalty accrual');
{
  const c = mkCampaign(); const ch = mkChar(c, { name:'Risen', id:'chr-r', abilities:{WIL:10} });
  const t = ACKS.rollTamperingWithMortality(ch, { forcedD20:8, wilMod:0 }); // 8 → major (−2)
  ok('Tampering 8 → major band (−2 mortality)', t.bandId === 'major' && t.mortalityDelta === -2);
  ACKS.applyTamperingSideEffect(c, 'chr-r', t);
  ok('applyTamperingSideEffect accrues mortalityPenalty cumulatively', ch.mortalityPenalty === -2);
  const t2 = ACKS.rollTamperingWithMortality(ch, { forcedD20:13, wilMod:0 }); // 13 → moderate (−1)
  ACKS.applyTamperingSideEffect(c, 'chr-r', t2);
  ok('a second side effect stacks (−2 + −1 = −3)', ch.mortalityPenalty === -3);
  ok('a minor Tampering band accrues nothing', ACKS.rollTamperingWithMortality(ch, { forcedD20:18 }).mortalityDelta === 0);
  ok('Tampering emits a mortal-wound event flagged tampering', c.eventLog.some(e => e.event.kind === 'mortal-wound' && e.event.payload && e.event.payload.tampering === true));
}

// =============================================================================
section('convalescence consumer firing on the Day Clock');
{
  const c = mkCampaign({ day: 1 });
  const ch = mkChar(c, { name:'Healer', id:'chr-h' });
  const w = ACKS.rollMortalWound(ch, { conditionId:'knocked-out', forcedD6:6 }); // 1 night = 1 day bed rest
  ACKS.applyMortalWound(c, 'chr-h', w);
  ok('knocked-out → incapacitated with 1 day left', ch.lifecycleState === 'incapacitated' && ch.mortalWounds[0].bedRestDaysRemaining === 1);
  ok('characterConvalescence reports the clock', ACKS.characterConvalescence(ch).incapacitated === true && ACKS.characterConvalescence(ch).daysRemaining === 1);
  ok('anyConvalescing(campaign) is true while a clock runs', ACKS.anyConvalescing(c) === true);
  // advance ONE day via the day-tick pipeline (propose → commit) — the Day Clock path.
  const prop = ACKS.proposeDayTick(c, 1, { force: true });
  const convRec = prop.pendingRecords.find(r => r.consumer === 'convalescence');
  ok('the day-tick proposes a convalescence record', !!convRec && convRec.recovered === true);
  ACKS.commitDayTick(c, prop);
  ok('after one Day-Clock day → recovered + back to active', ch.lifecycleState === 'active' && ch.mortalWounds[0].resolved === true);
  ok('a wound-recovery event is emitted on the Day Clock', c.eventLog.some(e => e.event.kind === 'wound-recovery' && e.event.payload.characterId === 'chr-h'));
  ok('anyConvalescing(campaign) is false once recovered', ACKS.anyConvalescing(c) === false);
}
{
  // multi-day: a 1-week wound recovers after 7 Day-Clock days (and not before).
  const c = mkCampaign({ day: 1 });
  const ch = mkChar(c, { name:'Patient', id:'chr-p' });
  ACKS.applyMortalWound(c, 'chr-p', ACKS.rollMortalWound(ch, { conditionId:'critically-wounded', forcedD6:1 }), { healedToOneHp:true }); // 1 week
  const after3 = ACKS.proposeDayTick(c, 3, { force:true }); ACKS.commitDayTick(c, after3);
  ok('still incapacitated after 3 days of a 1-week wound', ch.lifecycleState === 'incapacitated' && ch.mortalWounds[0].bedRestDaysRemaining === 4);
  const after4 = ACKS.proposeDayTick(c, 4, { force:true }); ACKS.commitDayTick(c, after4);
  ok('recovered after the full 7 days', ch.lifecycleState === 'active' && ch.mortalWounds[0].resolved === true);
}
{
  // advanceConvalescence (the direct / monthly-turn path) recovers identically.
  const c = mkCampaign(); const ch = mkChar(c, { name:'Rester', id:'chr-rr' });
  ACKS.applyMortalWound(c, 'chr-rr', ACKS.rollMortalWound(ch, { conditionId:'grievously-wounded', forcedD6:6 }), { healedToOneHp:true }); // 2 weeks
  ACKS.advanceConvalescence(c, 14);
  ok('advanceConvalescence(14) recovers a 2-week wound', ch.lifecycleState === 'active' && ch.mortalWounds[0].resolved === true);
}

// =============================================================================
console.log('\n' + (fail === 0 ? '✅' : '❌') + ' mortal-wounds.smoke: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('   failures: ' + failures.join(' · ')); process.exit(1); }
