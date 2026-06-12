/* tests/recruitment.smoke.js — Phase 2.95 Hirelings (#310) day-aware recruitment (R1 + R2).
 *
 *   node tests/recruitment.smoke.js   (or via `npm test`)
 *
 * The engine foundation: the recruitment-drive lifecycle (startRecruitmentDrive rolls the RAW 3-week
 * schedule; advanceRecruitmentDrives / the 'recruitment' day-consumer reveal weeks ½/¼/remainder and
 * charge the per-week fee, RR p.164); the activity-budget contributor (an active drive = 1 ancillary/day
 * per type); and the GP-grammar fee debit from the patron's purse. (The Recruit Wizard rework is R3.)
 */
'use strict';
const path = require('path');
const DIR = path.join(__dirname, '..');
[
  'acks-engine-catalogs.js', 'acks-engine-monsters.js', 'acks-engine-encounter-tables.js', 'acks-engine-troops.js', 'acks-engine.js', 'acks-engine-entities.js', 'acks-engine-economy.js',
  'acks-engine-entity-registry.js', 'acks-engine-field-schemas.js', 'acks-engine-events.js', 'acks-engine-subsystems.js',
].forEach(f => require(path.join(DIR, f)));
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail) { if (cond) { pass++; } else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t) { console.log('\n— ' + t); }

const MERC = ACKS.HIRELING_MERCENARIES[0];   // 'light-infantry'
function mkCampaign(gp) {
  const pat = ACKS.blankCharacter({ id: 'pat', name: 'Patron' });
  pat.coins.gp = (gp == null ? 1000 : gp); pat.personalGp = pat.coins.gp;
  return { schemaVersion: 2, currentTurn: 1, currentDayInMonth: 1, calendar: { year: 1, month: 1, day: 1 },
    houseRules: {}, characters: [pat], settlements: [], domains: [], hexes: [], journeys: [], projects: [], parties: [], eventLog: [] };
}
const HALF = () => 0.5;

// =============================================================================
section('data layer');
ok('blankCharacter.recruitmentDrives defaults []', Array.isArray(ACKS.blankCharacter().recruitmentDrives) && ACKS.blankCharacter().recruitmentDrives.length === 0);
ok("ACTIVITY_COSTS.recruit = ancillary", ACKS.activityCostFor('recruit').cost === 'ancillary');
ok("ID prefix 'rcd' registered", ACKS.ID_PREFIXES.recruitmentDrive === 'rcd');

// =============================================================================
section('startRecruitmentDrive — RAW 3-week schedule (RR p.164)');
{
  const c = mkCampaign();
  const r = ACKS.startRecruitmentDrive(c, { patronCharacterId: 'pat', settlementId: 's1', marketClassIdx: 2, hireCategory: 'mercenary', hireTypeId: MERC.id, rng: HALF });
  ok('ok', r.ok && r.drive);
  const d = r.drive;
  ok('drive id has rcd- prefix', /^rcd-/.test(d.id));
  ok('weekly split = ½ ceil / ¼ floor(min1) / remainder', (() => { const t = d.totalAvailable; const w1 = Math.ceil(t / 2); return d.weekly[0] === w1 && d.weekly[0] + d.weekly[1] + d.weekly[2] === t; })(), JSON.stringify(d.weekly));
  ok('nothing revealed on start (RAW p.164 — candidates arrive after a week of soliciting)', d.weeksRevealed === 0 && d.revealedAvailable === 0);
  ok('status active', d.status === 'active');
  ok('no upfront fee — week 1 is charged when it completes (+7 days)', r.feeOwedGp === 0 && d.feesAccruedGp === 0 && c.characters[0].coins.gp === 1000);
  ok('drive pushed onto the patron', c.characters[0].recruitmentDrives.length === 1);
}
section('startRecruitmentDrive — errors');
ok('unknown patron', ACKS.startRecruitmentDrive(mkCampaign(), { patronCharacterId: 'nope', marketClassIdx: 2, hireCategory: 'mercenary', hireTypeId: MERC.id }).error === 'unknown-patron');
ok('bad market class', ACKS.startRecruitmentDrive(mkCampaign(), { patronCharacterId: 'pat', marketClassIdx: 9, hireCategory: 'mercenary', hireTypeId: MERC.id }).error === 'bad-market-class');

// =============================================================================
section('advanceRecruitmentDrives — weekly trickle + completion');
{
  const c = mkCampaign();
  const d = ACKS.startRecruitmentDrive(c, { patronCharacterId: 'pat', marketClassIdx: 2, hireCategory: 'mercenary', hireTypeId: MERC.id, rng: HALF }).drive;
  c.currentDayInMonth = 5;     // mid week 1 — nothing has had time to come in yet
  ok('mid-week-1 is a no-op (candidates arrive only after a week elapses)', ACKS.advanceRecruitmentDrives(c).length === 0 && d.weeksRevealed === 0 && d.revealedAvailable === 0);
  c.currentDayInMonth = 8;     // +7 days = week 1 complete
  let adv = ACKS.advanceRecruitmentDrives(c);
  ok('day 8 reveals week 1 (½)', adv.length === 1 && d.weeksRevealed === 1 && d.revealedAvailable === d.weekly[0]);
  ok('day 8 accrues the week-1 fee', adv[0].feeOwedGp === d.feeWeekly && !adv[0].completed);
  c.currentDayInMonth = 15;    // +14 days = week 2 complete
  adv = ACKS.advanceRecruitmentDrives(c);
  ok('day 15 reveals week 2 (¼)', d.weeksRevealed === 2 && d.revealedAvailable === d.weekly[0] + d.weekly[1] && !adv[0].completed);
  c.currentDayInMonth = 22;    // +21 days = week 3 complete
  adv = ACKS.advanceRecruitmentDrives(c);
  ok('day 22 reveals week 3 = all', d.weeksRevealed === 3 && d.revealedAvailable === d.totalAvailable);
  ok('week 3 completes the drive', d.status === 'complete' && adv[0].completed);
  ok('three weekly fees accrued in total (one per solicited week)', d.feesAccruedGp === 3 * d.feeWeekly);
  ok('no further advance once complete', ACKS.advanceRecruitmentDrives(c).length === 0);
}

// =============================================================================
section('activity-budget contributor — active drive = 1 ancillary/day per type');
{
  const c = mkCampaign();
  ok('no drive → no recruit activity', !ACKS.characterActivityBudget(c, 'pat').ancillary.some(a => a.kind === 'recruit'));
  ACKS.startRecruitmentDrive(c, { patronCharacterId: 'pat', marketClassIdx: 2, hireCategory: 'mercenary', hireTypeId: MERC.id, rng: HALF });
  let b = ACKS.characterActivityBudget(c, 'pat');
  ok('active drive → 1 ancillary (recruit)', b.ancillaryUsed === 1 && b.ancillary.some(a => a.kind === 'recruit'));
  ok('recruit activity → navigate-to-Recruit reject affordance', (() => { const act = b.ancillary.find(a => a.kind === 'recruit'); const aff = ACKS.activityRejectAffordance(act); return aff && aff.mode === 'navigate' && /recruit/i.test(aff.label); })());
  ACKS.startRecruitmentDrive(c, { patronCharacterId: 'pat', marketClassIdx: 2, hireCategory: 'mercenary', hireTypeId: ACKS.HIRELING_MERCENARIES[1].id, rng: HALF });
  ok('two drives (two types) → 2 ancillary', ACKS.characterActivityBudget(c, 'pat').ancillaryUsed === 2);
  ACKS.stopRecruitmentDrive(c, 'pat', c.characters[0].recruitmentDrives[0].id);
  ok('stopping one → 1 ancillary', ACKS.characterActivityBudget(c, 'pat').ancillaryUsed === 1);
}

// =============================================================================
section('activity-budget contributor — the COMPLETION day still counts as soliciting');
{
  // RR p.164: soliciting runs 3 weeks; the week-3 reveal (the completion) is the LAST of the 21
  // solicitation days, not a separate hiring day — so the budget still reads as soliciting on that day
  // (Joachim 2026-06-08), then it rolls off the next. Mirrors the journey "acted today" rule.
  const c = mkCampaign();
  const d = ACKS.startRecruitmentDrive(c, { patronCharacterId: 'pat', marketClassIdx: 2, hireCategory: 'mercenary', hireTypeId: MERC.id, rng: HALF }).drive;
  c.currentDayInMonth = 22;     // +21 days = week 3 completes the drive
  ACKS.advanceRecruitmentDrives(c);
  ok('drive completed on day 22', d.status === 'complete');
  const bDone = ACKS.characterActivityBudget(c, 'pat');
  ok('completion day still counts as soliciting (1 ancillary)', bDone.ancillaryUsed === 1 && bDone.ancillary.some(a => a.kind === 'recruit'));
  c.currentDayInMonth = 23;     // the next day — soliciting is genuinely over
  ok('the day AFTER completion no longer counts', !ACKS.characterActivityBudget(c, 'pat').ancillary.some(a => a.kind === 'recruit'));
  // a STOPPED drive never counts (the patron pulled out — not a completed solicitation)
  const c2 = mkCampaign();
  const d2 = ACKS.startRecruitmentDrive(c2, { patronCharacterId: 'pat', marketClassIdx: 2, hireCategory: 'mercenary', hireTypeId: MERC.id, rng: HALF }).drive;
  ACKS.stopRecruitmentDrive(c2, 'pat', d2.id);
  ok('a stopped drive does not count, even on its stop day', !ACKS.characterActivityBudget(c2, 'pat').ancillary.some(a => a.kind === 'recruit'));
}

// =============================================================================
section("'recruitment' day-consumer — reveal + fee debit from the purse (GP grammar)");
{
  const c = mkCampaign(1000);
  ACKS.startRecruitmentDrive(c, { patronCharacterId: 'pat', marketClassIdx: 2, hireCategory: 'mercenary', hireTypeId: MERC.id, rng: HALF });
  ok("'recruitment' consumer registered (slot 45)", ACKS.dayConsumersInOrder().some(x => x.name === 'recruitment' && x.order === 45));
  const fee = c.characters[0].recruitmentDrives[0].feeWeekly;
  const prop = ACKS.proposeDayTick(c, 7, { force: true }); ACKS.commitDayTick(c, prop, null);
  const d = c.characters[0].recruitmentDrives[0];
  ok('day-tick (+7 days) reveals week 1', d.weeksRevealed === 1);
  ok('week-1 fee debited from the purse', c.characters[0].coins.gp === 1000 - fee);
  ok('purse mirror (personalGp) synced', c.characters[0].personalGp === 1000 - fee);
  ok('fee logged as a wealth-transfer', c.eventLog.some(e => e.event && e.event.kind === 'wealth-transfer' && e.event.payload.amount === fee));
}

// =============================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — recruitment.smoke.js: ' + pass + ' passed, ' + fail + ' failed');
if (fail > 0) { console.log('Failures:\n  ' + failures.join('\n  ')); process.exit(1); }
