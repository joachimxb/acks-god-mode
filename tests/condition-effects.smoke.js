/* tests/condition-effects.smoke.js — Condition Effects CE-1..CE-3 (Condition_Effects_Plan.md;
 *   doctrine Architecture.md §17). RR p.516 (Fatigued = a cumulative -1 on attack / proficiency /
 *   saving throws / damage) + RR p.21/p.279 (onset at 6 un-rested strenuous days; a rest day clears it).
 *
 *   node tests/condition-effects.smoke.js   (or via `npm test`)
 *
 * Locks: the CONDITION_EFFECTS registry (folds in CONDITION_CLASSIFICATION + PERSISTENT_CONDITIONS;
 * fatigued carries the full throwMod+derive; the two intrinsic CL-3 conds keep their flags); the
 * broadened applyCondition gate (fatigued now applies, a typo still returns null) + the source/magnitude
 * fields; conditionModifiers (derive-on-read, per-roll-type, cumulative magnitude, side-effect-free);
 * conditionFlags (hypothermia capability flags); reconcileConditions (materialize / refresh / clear /
 * backfill, idempotent + naturally quiet via the verbs); the CE-3 wire (the Fatigued -N reaches a
 * proficiency throw, distinct from the JJ-p.95 overtime hook); and the migrate-no-op (the demo carries
 * no fatigued/derived condition). No new house rule / event kind / prefix / entity / migration bump.
 */
'use strict';
require('./_engine.js').load();
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail) { if (cond) { pass++; } else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t) { console.log('\n— ' + t); }

function mkCampaign() {
  return { schemaVersion: 2, currentTurn: 1, currentDayInMonth: 1, calendar: { year: 1, month: 1, day: 1 },
    houseRules: {}, characters: [], domains: [], hexes: [], eventLog: [] };
}
function mkChar(c, opts) {
  opts = opts || {};
  const ch = ACKS.blankCharacter(Object.assign({
    id: opts.id || 'chr-1', name: opts.name || 'Borin', race: 'human',
    abilities: { STR: 13, INT: 10, WIL: 10, DEX: 13, CON: 10, CHA: 10 }
  }, opts.extra || {}));
  c.characters.push(ch);
  return ch;
}
const profTotal = (c, ch, rt) => ACKS.conditionModifiers(c, ch, { rollType: rt || 'proficiency' }).total;

// ─────────────────────────────────────────────────────────────────────────
section('CE-1 — the registry + the broadened def lookup');
{
  const REG = ACKS.CONDITION_EFFECTS;
  ok('CONDITION_EFFECTS exported + frozen', REG && typeof REG === 'object' && Object.isFrozen(REG));
  ok('folds in fatigued + the two intrinsic CL-3 conds', REG.fatigued && REG.hypothermic && REG.enervated);
  ok('folds in the classified provisioning/disease/wound ids', REG.hungry && REG.starving && REG.symptomatic && REG['mortally-wounded']);
  ok('fatigued declares the RR-p.516 four-roll-type -1 + cumulative', REG.fatigued.effects.throwMod.attack === -1 &&
     REG.fatigued.effects.throwMod.proficiency === -1 && REG.fatigued.effects.throwMod.save === -1 &&
     REG.fatigued.effects.throwMod.damage === -1 && REG.fatigued.effects.cumulative === true);
  ok('fatigued carries a derive() + a derived source', typeof REG.fatigued.derive === 'function' && REG.fatigued.source === 'derived:personalFatigue');
  ok('hypothermia carries its capability flags', REG.hypothermic.effects.flags.indexOf('cannot-force-march') >= 0 && REG.hypothermic.effects.flags.indexOf('cannot-heal') >= 0);
  ok('conditionDefById resolves a registry id', ACKS.conditionDefById('fatigued') && ACKS.conditionDefById('fatigued').label === 'Fatigued');
  ok('conditionDefById returns null on an unknown id (the gate widened, not removed)', ACKS.conditionDefById('nonsense-xyz') === null);
}

section('CE-1 — applyCondition broadened + source/magnitude stamped');
{
  const c = mkCampaign(); const ch = mkChar(c);
  const rec = ACKS.applyCondition(c, ch, 'fatigued', { source: 'derived:personalFatigue', magnitude: 2 });
  ok('applyCondition now accepts fatigued (was refused pre-CE-1)', !!rec && rec.condition === 'fatigued');
  ok('source + magnitude stamped on the record', rec.source === 'derived:personalFatigue' && rec.magnitude === 2);
  ok('a typo still returns null (gate intact)', ACKS.applyCondition(c, ch, 'nonsense-xyz') === null);
  const rec2 = ACKS.applyCondition(c, ch, 'hypothermic');
  ok('an intrinsic apply with no source defaults to intrinsic', rec2 && rec2.source === 'intrinsic');
}

section('CE-2 — conditionModifiers (derive-on-read) + conditionFlags');
{
  const c = mkCampaign(); const ch = mkChar(c);
  ch.personalFatigue = 0; ok('pf 0 -> no modifier', profTotal(c, ch) === 0);
  ch.personalFatigue = 5; ok('pf 5 (below onset 6) -> no modifier', profTotal(c, ch) === 0);
  ch.personalFatigue = 6; ok('pf 6 -> -1 (onset, magnitude 1)', profTotal(c, ch) === -1);
  ch.personalFatigue = 8; ok('pf 8 -> -3 (cumulative per additional active day, OQ2)', profTotal(c, ch) === -3);
  ok('-3 across attack / save / damage too (RR p.516 four roll types)',
     profTotal(c, ch, 'attack') === -3 && profTotal(c, ch, 'save') === -3 && profTotal(c, ch, 'damage') === -3);
  ok("'proficiency-throw' rollType is an alias for 'proficiency'", profTotal(c, ch, 'proficiency-throw') === -3);
  const cm = ACKS.conditionModifiers(c, ch, { rollType: 'proficiency' });
  ok('itemized carries the condition / value / cite / label', cm.itemized.length === 1 && cm.itemized[0].condition === 'fatigued' &&
     cm.itemized[0].value === -3 && cm.itemized[0].cite === 'RR p.516' && cm.itemized[0].label === 'Fatigued');
  ch.personalFatigue = 0; ok('no character / pf 0 -> empty itemized', ACKS.conditionModifiers(c, ch, {}).itemized.length === 0);
  // flags via a present intrinsic condition
  const ch2 = mkChar(c, { id: 'chr-2', name: 'Cold' });
  ACKS.applyCondition(c, ch2, 'hypothermic');
  const fl = ACKS.conditionFlags(c, ch2);
  ok('conditionFlags returns a Set of the present condition flags', fl instanceof Set && fl.has('cannot-force-march') && fl.has('cannot-heal'));
  ok('conditionFlags empty for an unconditioned character', ACKS.conditionFlags(c, mkChar(c, { id: 'chr-3' })).size === 0);
}

section('CE-1 — reconcileConditions (materialize / refresh / clear / backfill, idempotent + quiet)');
{
  const c = mkCampaign(); const ch = mkChar(c);
  ch.personalFatigue = 8;
  const evBefore = c.eventLog.length;
  const r1 = ACKS.reconcileConditions(c);
  ok('materializes the derived fatigued row', r1.applied === 1 && ACKS.characterActiveConditions(ch).length === 1);
  const rec = ACKS.characterActiveConditions(ch)[0];
  ok('the row carries the derived source + magnitude', rec.condition === 'fatigued' && rec.source === 'derived:personalFatigue' && rec.magnitude === 3);
  ok('onset emitted exactly one condition-applied event', c.eventLog.length === evBefore + 1);
  const r2 = ACKS.reconcileConditions(c);
  ok('idempotent — a second reconcile applies/clears nothing + emits nothing', r2.applied === 0 && r2.cleared === 0 && c.eventLog.length === evBefore + 1);
  ch.personalFatigue = 10; const r3 = ACKS.reconcileConditions(c);
  ok('refreshes magnitude on a pf change (no new row, no event)', r3.refreshed === 1 && ACKS.characterActiveConditions(ch)[0].magnitude === 5 && ACKS.characterActiveConditions(ch).length === 1);
  ch.personalFatigue = 3; const r4 = ACKS.reconcileConditions(c);
  ok('clears the derived row when pf falls below onset', r4.cleared === 1 && ACKS.characterActiveConditions(ch).length === 0);
  // backfill: a legacy intrinsic record applied before the source field existed
  const ch2 = mkChar(c, { id: 'chr-2' });
  const legacy = ACKS.applyCondition(c, ch2, 'hypothermic'); delete legacy.source;
  const r5 = ACKS.reconcileConditions(c, ch2);
  ok('backfills source:intrinsic on a legacy record', r5.backfilled === 1 && legacy.source === 'intrinsic');
}

section('CE-3 — the Fatigued -N reaches a proficiency throw (SR-3 lands) + forecast-safe');
{
  const c = mkCampaign(); const ch = mkChar(c);
  const tk = ACKS.characterAvailableThrows(c, ch).filter(t => t.universal)[0].taskKey;
  ch.personalFatigue = 0; const t0 = ACKS.characterProficiencyThrow(c, ch, tk, { roll: false });
  ch.personalFatigue = 7; const t7 = ACKS.characterProficiencyThrow(c, ch, tk, { roll: false });
  ok('the throw modifierTotal drops by the fatigue penalty', (t0.modifierTotal - t7.modifierTotal) === 2);
  const fItem = (t7.itemizedModifiers || []).filter(m => m.source === 'fatigued');
  ok('the itemized breakdown carries the cited Fatigued entry', fItem.length === 1 && fItem[0].value === -2 && /RR p\.516/.test(fItem[0].label));
  ok('the JJ-p.95 overtime hook stays distinct from the RAW condition', (() => {
    const t = ACKS.characterProficiencyThrow(c, ch, tk, { roll: false, fatiguePenalty: -1 });
    return t.itemizedModifiers.some(m => m.source === 'overtime') && t.itemizedModifiers.some(m => m.source === 'fatigued');
  })());
  const evBefore = c.eventLog.length;
  ACKS.characterProficiencyThrow(c, ch, tk, { roll: false });
  ACKS.characterProficiencyThrow(c, ch, tk, { rng: () => 0.5 });
  ok('a throw (forecast or rolled) emits no event — derive-on-read is side-effect-free', c.eventLog.length === evBefore);
  ok('a fresh (unfatigued) actor is unaffected', (() => { const x = mkChar(c, { id: 'chr-fresh' }); const t = ACKS.characterProficiencyThrow(c, x, tk, { roll: false }); return !t.itemizedModifiers.some(m => m.source === 'fatigued'); })());
}

section('CE-4 — capability flags reach the journey + heal paths (hypothermia, RR p.510)');
{
  // force-march gate: a cannot-force-march traveller caps the party at normal pace (journeyMaxPace / EffectivePace).
  const c = mkCampaign(); c.encounters = []; c.parties = []; c.journeys = [];
  const ch = mkChar(c, { id: 'chr-march' });
  const j = { id: 'jny-1', status: 'in-transit', pace: 'forced-march', participantCharacterIds: ['chr-march'] };
  c.journeys.push(j);
  ok('an unconditioned party can force-march (no cap)', ACKS.journeyMaxPace(c, j).maxPace === 'forced-march' && ACKS.journeyEffectivePace(c, j) === 'forced-march');
  ACKS.applyCondition(c, ch, 'hypothermic');
  const mp = ACKS.journeyMaxPace(c, j);
  ok('a cannot-force-march traveller caps the party at normal', mp.maxPace === 'normal' && mp.binding && mp.binding.reason === 'cannot-force-march');
  ok('journeyEffectivePace downgrades the forced march to normal', ACKS.journeyEffectivePace(c, j) === 'normal');
  ACKS.clearCondition(c, ch, 'hypothermic', { method: 'warmed' });
  ok('warming restores the forced march', ACKS.journeyEffectivePace(c, j) === 'forced-march');

  // heal gate: a cannot-heal convalescent does not advance bed-rest until warmed.
  const c2 = mkCampaign();
  const w = mkChar(c2, { id: 'chr-conv', name: 'Wounded' });
  w.lifecycleState = 'incapacitated';
  w.mortalWounds = [{ resolved: false, outcome: 'incapacitated', condition: 'broken-arm', conditionLabel: 'Broken arm', bedRestDaysRemaining: 5 }];
  const p1 = ACKS.advanceConvalescence(c2, 1);
  ok('a normal convalescent advances bed-rest 5 -> 4', w.mortalWounds[0].bedRestDaysRemaining === 4 && p1.pendingRecords.length === 1);
  ACKS.applyCondition(c2, w, 'hypothermic');
  const p2 = ACKS.advanceConvalescence(c2, 1);
  ok('a cannot-heal convalescent does NOT advance (bed-rest unchanged + no record)', w.mortalWounds[0].bedRestDaysRemaining === 4 && p2.pendingRecords.length === 0);
  ok('the suspended convalescence surfaces a transient note', p2.notableEvents.some(e => /cannot heal/i.test(e.label || '')));
  ACKS.clearCondition(c2, w, 'hypothermic', { method: 'warmed' });
  ACKS.advanceConvalescence(c2, 1);
  ok('warming resumes convalescence 4 -> 3', w.mortalWounds[0].bedRestDaysRemaining === 3);

  // cannot-cast is in the flag vocabulary but has NO v1 producer (reserved seam — Combat #140 / a future condition).
  ok('no shipped condition produces cannot-cast (reserved seam)',
     Object.keys(ACKS.CONDITION_EFFECTS).every(id => !(((ACKS.CONDITION_EFFECTS[id].effects || {}).flags) || []).includes('cannot-cast')));
}

section('CE-5 — the save / attack / damage seam is RESERVED + the resolver is deferred (OQ3/OQ4/OQ5)');
{
  // The accessor already returns save/attack/damage from CE-2; CE-5 adds NO engine change — it pins the
  // reservation so Combat #140 inherits a proven, CI-locked contract (and can't silently regress it).
  const c = mkCampaign(); const ch = mkChar(c); ch.personalFatigue = 8;   // onset+2 => magnitude 3
  const sv = ACKS.conditionModifiers(c, ch, { rollType: 'save' });
  ok('the save seam returns the cumulative -N (RR p.516 four-roll-type)', sv.total === -3);
  ok('the save itemized carries condition/value/cite/label (the Combat #140 contract shape)',
     sv.itemized.length === 1 && sv.itemized[0].condition === 'fatigued' && sv.itemized[0].value === -3 &&
     sv.itemized[0].cite === 'RR p.516' && sv.itemized[0].label === 'Fatigued');
  const at2 = ACKS.conditionModifiers(c, ch, { rollType: 'attack' });
  ok('the attack seam is symmetric (RR p.516)', at2.total === -3 && at2.itemized.length === 1 && at2.itemized[0].condition === 'fatigued');
  ok('an unconditioned actor gets an inert save seam (0, empty)', (() => { const x = mkChar(c, { id: 'chr-fit' }); const s = ACKS.conditionModifiers(c, x, { rollType: 'save' }); return s.total === 0 && s.itemized.length === 0; })());

  // OQ3 — the consolidating characterSavingThrow resolver is NOT built speculatively. It lands at its first
  // real consumer (Combat #140), wiring conditionModifiers({rollType:'save'}) at that point. If this fails,
  // a save resolver was added — wire the save seam into it (and update this lock).
  ok('characterSavingThrow is deferred — not built yet (OQ3)', typeof ACKS.characterSavingThrow === 'undefined');

  // OQ4 — the ~30 combat-round condition ids ship as a reserved list (acks-engine-lifecycle.js); they gain
  // effects when Combat #140 lands, so none is in CONDITION_EFFECTS yet (contributes no modifier today).
  const cr = ACKS.CONDITION_CLASSIFICATION && ACKS.CONDITION_CLASSIFICATION.combatRoundOutOfScope;
  ok('the combat-round id list ships (reserved for Combat #140, OQ4)', Array.isArray(cr) && cr.length >= 20 && cr.indexOf('paralyzed') >= 0);
  ok('no combat-round id carries effects yet (reserved, not consumed)', cr.every(id => !ACKS.CONDITION_EFFECTS[id]));

  // OQ5 — the accessor is scoped to throwMod (+ flags via conditionFlags); NO numeric AC / movement modifier
  // in v1 (acMod/moveMod slots are reserved in the descriptor, not surfaced by the accessor).
  ok('conditionModifiers returns only {total,itemized} — no acMod/moveMod (OQ5 reserved)',
     !('acMod' in sv) && !('moveMod' in sv) && Object.keys(sv).sort().join(',') === 'itemized,total');
}

section('CE-6 — the character-sheet condition strip (characterConditionStrip, derive-inclusive)');
{
  const c = mkCampaign();
  // fatigued: derived-present (no materialized row mid-session), resolved -N summary, severity warning, not clearable.
  const f = mkChar(c, { id: 'chr-strip-f' }); f.personalFatigue = 8;   // onset+2 => magnitude 3
  const sf = ACKS.characterConditionStrip(c, f);
  const fr = sf.find(r => r.condition === 'fatigued');
  ok('a fatigued character shows on the strip even unmaterialized (derive-inclusive)', !!fr && sf.length === 1);
  ok('the fatigued row resolves the cumulative effect + a human summary',
     fr.magnitude === 3 && fr.throwMod.save === -3 && /-3 to /.test(fr.summary) && /saving throws/.test(fr.summary));
  ok('fatigued severity is warning + not clearable (cleared by rest, not a verb)', fr.severity === 'warning' && fr.clearable === false);
  // hypothermic: intrinsic, capability-flag summary, severity danger, clearable (carries the record id).
  const h = mkChar(c, { id: 'chr-strip-h' }); ACKS.applyCondition(c, h, 'hypothermic');
  const hr = ACKS.characterConditionStrip(c, h).find(r => r.condition === 'hypothermic');
  ok('a hypothermic character shows with a capability-flag summary', !!hr && /cannot force-march/.test(hr.summary) && /cannot heal/.test(hr.summary));
  ok('hypothermic severity is danger + clearable (intrinsic CL-3 verb, has the record id)', hr.severity === 'danger' && hr.clearable === true && !!hr.id);
  // unconditioned: empty strip; the accessor is a pure read (no events).
  const fit = mkChar(c, { id: 'chr-strip-fit' });
  const evBefore = c.eventLog.length;
  ok('an unconditioned character has an empty strip', ACKS.characterConditionStrip(c, fit).length === 0);
  ACKS.characterConditionStrip(c, f); ACKS.characterConditionStrip(c, h);
  ok('the strip is a pure read (emits no event)', c.eventLog.length === evBefore);
}

section('CE-6 full-fold — the provisioning hunger/thirst ladder fires its RAW effects (RR p.276)');
{
  const c = mkCampaign();
  // hungry: -1 attack/proficiency/save (NOT damage); reaches a proficiency throw; warning; not clearable.
  const hg = mkChar(c, { id: 'chr-hungry' }); hg.foodDeficitDays = 1;
  ok('hungry => -1 proficiency/attack/save (RR p.276)',
     profTotal(c, hg, 'proficiency') === -1 && profTotal(c, hg, 'attack') === -1 && profTotal(c, hg, 'save') === -1);
  ok('hungry leaves DAMAGE untouched (RR p.276 is three throws, unlike Fatigued)', profTotal(c, hg, 'damage') === 0);
  const hgRow = ACKS.characterConditionStrip(c, hg).find(r => r.condition === 'hungry');
  ok('hungry shows on the strip (warning, derived, not clearable)', !!hgRow && hgRow.severity === 'warning' && hgRow.clearable === false);
  const tk = ACKS.characterAvailableThrows(c, hg).filter(t => t.universal)[0].taskKey;
  const tBase = ACKS.characterProficiencyThrow(c, mkChar(c, { id: 'chr-fed' }), tk, { roll:false }).modifierTotal;
  const tHungry = ACKS.characterProficiencyThrow(c, hg, tk, { roll:false }).modifierTotal;
  ok('the hungry -1 reaches a real proficiency throw (modifierTotal drops by 1)', (tBase - tHungry) === 1);
  // ladder is mutually exclusive — exactly one of hungry/underfed/starving at a time.
  const ud = mkChar(c, { id: 'chr-underfed' }); ud.foodDeficitDays = 3;
  const udStrip = ACKS.characterConditionStrip(c, ud);
  ok('foodDeficit 3 => exactly underfed (not hungry/starving)', udStrip.length === 1 && udStrip[0].condition === 'underfed');
  ok('underfed keeps the -1 AND adds the capability flags', profTotal(c, ud, 'proficiency') === -1 &&
     ACKS.conditionFlags(c, ud).has('cannot-force-march') && ACKS.conditionFlags(c, ud).has('cannot-heal'));
  const sv = mkChar(c, { id: 'chr-starving' }); sv.foodDeficitDays = 8;
  const svRow = ACKS.characterConditionStrip(c, sv).find(r => r.condition === 'starving');
  ok('foodDeficit 8 => starving, danger severity, the -1 + flags', !!svRow && svRow.severity === 'danger' &&
     profTotal(c, sv, 'proficiency') === -1 && ACKS.conditionFlags(c, sv).has('cannot-force-march'));
  // dehydrated: flags only (no throwMod), danger; legacy field name also works.
  const dh = mkChar(c, { id: 'chr-dry' }); dh.waterDeficitDays = 2;
  ok('dehydrated => the capability flags, no throw penalty, danger', ACKS.conditionFlags(c, dh).has('cannot-heal') &&
     profTotal(c, dh, 'proficiency') === 0 && ACKS.characterConditionStrip(c, dh)[0].severity === 'danger');
  const dhLegacy = mkChar(c, { id: 'chr-dry-legacy' }); delete dhLegacy.waterDeficitDays; dhLegacy.dehydrationDays = 1;
  ok('the legacy dehydrationDays field still derives dehydrated', ACKS.conditionFlags(c, dhLegacy).has('cannot-force-march'));
  // the flags reach the CE-4 gates: an underfed traveller cannot force-march; a starving convalescent cannot heal.
  const cj = mkCampaign(); cj.encounters = []; cj.parties = []; cj.journeys = [];
  const trav = mkChar(cj, { id: 'chr-march-ud' }); trav.foodDeficitDays = 3;
  const j = { id: 'jny-ud', status: 'in-transit', pace: 'forced-march', participantCharacterIds: ['chr-march-ud'] };
  cj.journeys.push(j);
  ok('an underfed traveller caps the party at normal pace (CE-4 gate)', ACKS.journeyMaxPace(cj, j).maxPace === 'normal');
  const cw = mkCampaign(); const wc = mkChar(cw, { id: 'chr-starv-conv' }); wc.foodDeficitDays = 8;
  wc.mortalWounds = [{ resolved:false, outcome:'incapacitated', condition:'broken-arm', bedRestDaysRemaining:5 }];
  ACKS.advanceConvalescence(cw, 1);
  ok('a starving convalescent does NOT heal (bed-rest unchanged — CE-4 gate)', wc.mortalWounds[0].bedRestDaysRemaining === 5);
  // a fed/watered character is wholly unaffected.
  ok('a fed, watered character has no provisioning condition', ACKS.characterConditionStrip(c, mkChar(c, { id:'chr-ok' })).length === 0);
}

section('Polarity / data-model — no new house rule; the demo is a reconcile no-op');
{
  ok('Condition Effects adds no house rule (pure infrastructure)', !(ACKS.HOUSERULES_REGISTRY || []).some(r => /condition-effect/.test(r.id || '')));
  require('../acks-demo-template.js');   // _engine.js does not load the demo — suites require it themselves
  const demo = ACKS.migrateCampaign(JSON.parse(JSON.stringify(global.ACKS_DEMO_TEMPLATE)));
  ok('no demo character gains a materialized condition (migrate-no-op invariant)',
     demo.characters.every(ch => ACKS.characterActiveConditions(ch).length === 0));
}

// =============================================================================
console.log('\n' + (fail === 0 ? '✅' : '❌') + ' condition-effects.smoke: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('   failures: ' + failures.join(' · ')); process.exit(1); }
