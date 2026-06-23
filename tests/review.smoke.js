// =============================================================================
// review.smoke.js — the Review tab's engine surface (2026-06-13).
//
//   node tests/review.smoke.js   (or via `npm test`)
//
// Three pieces:
//   1. dailyAdvanceBlockers — what holds the world clock (active Encounters +
//      Battles in motion); month-grained pendingEvents deliberately do NOT.
//   2. calendarShiftMonths / calendarDayShift — the Pending Events tables'
//      calendar cursors (12-month / 30-day clock, turn in lockstep).
//   3. eventsOnCalendarDay / monthlyEventsForReview — the dated event reads
//      behind the Daily Events / Monthly Events tables.
// =============================================================================
'use strict';
const path = require('path');
const DIR = path.join(__dirname, '..');
global.window = global;
[
  'acks-engine-catalogs.js', 'acks-engine-monsters.js', 'acks-engine-encounter-tables.js', 'acks-engine-troops.js',
  'acks-engine.js', 'acks-engine-lairs.js', 'acks-engine-stash.js', 'acks-engine-entities.js', 'acks-engine-economy.js',
  'acks-engine-entity-registry.js', 'acks-engine-field-schemas.js', 'acks-engine-events.js', 'acks-engine-battles.js', 'acks-engine-maneuvers.js', 'acks-engine-subsystems.js'
].forEach(f => require(path.join(DIR, f)));
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(label + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('— ' + t); }

function mkCamp(){
  const camp = ACKS.blankCampaign();
  ['encounters', 'battles', 'pendingEvents', 'eventLog'].forEach(k => { if(!Array.isArray(camp[k])) camp[k] = []; });
  camp.currentTurn = 5;
  camp.currentDayInMonth = 1;
  camp.calendar = camp.calendar || {};
  camp.calendar.year = 2; camp.calendar.month = 3; camp.calendar.day = 1;
  return camp;
}

// ─── 1. dailyAdvanceBlockers ─────────────────────────────────────────────────
section('dailyAdvanceBlockers — what holds the clock');
{
  const camp = mkCamp();
  ok('exported', typeof ACKS.dailyAdvanceBlockers === 'function');
  ok('fresh campaign: nothing holds the clock', ACKS.dailyAdvanceBlockers(camp).length === 0);
  ok('null campaign → []', Array.isArray(ACKS.dailyAdvanceBlockers(null)) && ACKS.dailyAdvanceBlockers(null).length === 0);

  // an ACTIVE encounter holds it
  const enc = ACKS.blankEncounter({ id: 'enc-block1', hexId: null });
  enc.status = 'active';
  camp.encounters.push(enc);
  let b = ACKS.dailyAdvanceBlockers(camp);
  ok('active encounter blocks', b.length === 1 && b[0].kind === 'encounter' && b[0].id === 'enc-block1');
  ok('blocker carries a label', typeof b[0].label === 'string' && b[0].label.length > 0);

  // resolving it releases the clock
  enc.status = 'resolved';
  ok('resolved encounter releases', ACKS.dailyAdvanceBlockers(camp).length === 0);

  // a battle in motion holds it — in every in-motion status
  const battle = ACKS.blankBattle({ id: 'btl-block1', name: 'Test Field' });
  camp.battles.push(battle);
  ['setup', 'fighting', 'ended'].forEach(st => {
    battle.status = st;
    const bb = ACKS.dailyAdvanceBlockers(camp);
    ok('battle status "' + st + '" blocks', bb.length === 1 && bb[0].kind === 'battle' && bb[0].id === 'btl-block1');
  });
  battle.status = 'ended';
  ok('awaiting-aftermath labelled', /awaiting aftermath/.test(ACKS.dailyAdvanceBlockers(camp)[0].label));
  battle.status = 'resolved';
  ok('resolved battle releases', ACKS.dailyAdvanceBlockers(camp).length === 0);

  // both at once → both listed
  enc.status = 'active'; battle.status = 'fighting';
  b = ACKS.dailyAdvanceBlockers(camp);
  ok('encounter + battle both listed', b.length === 2 && b.some(x => x.kind === 'encounter') && b.some(x => x.kind === 'battle'));

  // month-grained pending events do NOT hold the day clock
  enc.status = 'resolved'; battle.status = 'resolved';
  camp.pendingEvents.push(ACKS.newEvent('player-plan', { targetTurn: 5, payload: { domainId: 'dom-x', plan: 'raise taxes' } }));
  ok('a due pending (monthly) event does NOT block the day clock', ACKS.dailyAdvanceBlockers(camp).length === 0);
  ok('…but it IS due at the month gate (eventsTargetingTurn)', ACKS.eventsTargetingTurn(camp, 5).length === 1);
}

// ─── 2. calendar cursors ─────────────────────────────────────────────────────
section('calendarShiftMonths / calendarDayShift — the table cursors');
{
  const camp = mkCamp();   // Year 2, Month 3, Day 1, Turn 5
  const m0 = ACKS.calendarShiftMonths(camp, 0);
  ok('month offset 0 = this month', m0.year === 2 && m0.month === 3 && m0.turn === 5);
  ok('month label names the month', /Year 2$/.test(m0.label));
  const m1 = ACKS.calendarShiftMonths(camp, 1);
  ok('month +1', m1.year === 2 && m1.month === 4 && m1.turn === 6);
  const mBack = ACKS.calendarShiftMonths(camp, -3);
  ok('month −3 wraps the year', mBack.year === 1 && mBack.month === 12 && mBack.turn === 2);
  const mFwd = ACKS.calendarShiftMonths(camp, 10);
  ok('month +10 wraps forward', mFwd.year === 3 && mFwd.month === 1 && mFwd.turn === 15);

  const d0 = ACKS.calendarDayShift(camp, 0);
  ok('day offset 0 = today', d0.year === 2 && d0.month === 3 && d0.day === 1 && d0.turn === 5 && d0.isToday === true);
  const dBack = ACKS.calendarDayShift(camp, -1);
  ok('day −1 from day 1 = day 30 of last month', dBack.month === 2 && dBack.day === 30 && dBack.turn === 4 && dBack.isToday === false);
  camp.currentDayInMonth = 30; camp.calendar.day = 30;
  const dFwd = ACKS.calendarDayShift(camp, 1);
  ok('day +1 from day 30 = day 1 of next month', dFwd.month === 4 && dFwd.day === 1 && dFwd.turn === 6);
  camp.currentDayInMonth = 15;
  const dBig = ACKS.calendarDayShift(camp, -45);
  ok('day −45 from day 15 = day 30, two months back', dBig.month === 1 && dBig.day === 30 && dBig.turn === 3);
  const dYear = ACKS.calendarDayShift(camp, -75);
  ok('day −75 crosses the year boundary', dYear.year === 1 && dYear.month === 12 && dYear.day === 30 && dYear.turn === 2);
}

// ─── 3. dated event reads ────────────────────────────────────────────────────
section('eventsOnCalendarDay / monthlyEventsForReview — the table reads');
{
  const camp = mkCamp();   // Year 2, Month 3, Turn 5
  camp.currentDayInMonth = 4; camp.calendar.day = 4;

  // a day-tick emission (full game-date stamp) on day 4
  const dayEv = ACKS.newEvent('gm-narrative', {
    status: 'applied', cadence: 'daily', targetTurn: 5,
    gameTimeAt: { year: 2, month: 3, day: 4 },
    payload: { label: 'the party crossed the pass' }
  });
  camp.eventLog.push({ event: dayEv, result: { narrativeSummary: 'The party crossed the pass.' }, appliedAtTurn: 5 });

  // an errand stamped via appliedAtDay (the #346 shape — no gameTimeAt)
  const errand = ACKS.newEvent('gm-narrative', { status: 'applied', targetTurn: 5, payload: { label: 'bought rope' } });
  errand.appliedAtDay = 2;
  camp.eventLog.push({ event: errand, result: { narrativeSummary: 'Bought rope at the market.' }, appliedAtTurn: 5 });

  // a month-grained applied event (no day stamp at all)
  const moEv = ACKS.newEvent('gm-narrative', { status: 'applied', targetTurn: 5, payload: { label: 'monthly morale' } });
  camp.eventLog.push({ event: moEv, result: { narrativeSummary: 'Morale held steady.' }, appliedAtTurn: 5 });

  // a month-grained PENDING event due this turn + one targeting next turn
  camp.pendingEvents.push(ACKS.newEvent('player-plan', { targetTurn: 5, payload: { plan: 'build a mill' } }));
  camp.pendingEvents.push(ACKS.newEvent('player-plan', { targetTurn: 6, payload: { plan: 'next month plan' } }));
  // an OVERDUE pending event from two turns ago
  camp.pendingEvents.push(ACKS.newEvent('player-plan', { targetTurn: 3, payload: { plan: 'forgotten petition' } }));

  const today = ACKS.calendarDayShift(camp, 0);                       // day 4
  const d4 = ACKS.eventsOnCalendarDay(camp, today);
  ok('day 4 sees the day-tick event', d4.length === 1 && d4[0].kind === 'gm-narrative' && /crossed the pass/.test(d4[0].summary));
  ok('day rows are not pending', d4[0].isPending === false && d4[0].status === 'applied');

  const d2 = ACKS.eventsOnCalendarDay(camp, ACKS.calendarDayShift(camp, -2));   // day 2
  ok('day 2 sees the appliedAtDay errand', d2.length === 1 && /rope/.test(d2[0].summary));

  const d9 = ACKS.eventsOnCalendarDay(camp, ACKS.calendarDayShift(camp, 5));    // day 9
  ok('an empty day reads empty', d9.length === 0);

  ok('month-grained events stay out of the daily table',
    !d4.concat(d2).some(r => /Morale held/.test(r.summary)));

  const thisMonth = ACKS.monthlyEventsForReview(camp, ACKS.calendarShiftMonths(camp, 0));
  ok('this month: due pending events lead', thisMonth.length >= 2 && thisMonth[0].isPending === true);
  ok('this month includes the overdue petition (due NOW)', thisMonth.some(r => r.isPending && r.targetTurn === 3));
  ok('this month includes the applied monthly event', thisMonth.some(r => !r.isPending && /Morale held/.test(r.summary)));
  ok('this month excludes next month\'s plan', !thisMonth.some(r => r.isPending && r.targetTurn === 6));
  ok('day-dated entries stay out of the monthly table', !thisMonth.some(r => /crossed the pass|rope/.test(r.summary || '')));

  const nextMonth = ACKS.monthlyEventsForReview(camp, ACKS.calendarShiftMonths(camp, 1));
  ok('next month: the future-targeted plan shows', nextMonth.some(r => r.isPending && r.targetTurn === 6));
  ok('next month: the overdue petition does NOT ride forward past today', !nextMonth.some(r => r.targetTurn === 3));

  const lastMonth = ACKS.monthlyEventsForReview(camp, ACKS.calendarShiftMonths(camp, -1));
  ok('last month reads empty (nothing applied at turn 4)', lastMonth.length === 0);

  // the overdue petition shows on its OWN month when navigating back to it
  const turn3Month = ACKS.monthlyEventsForReview(camp, ACKS.calendarShiftMonths(camp, -2));
  ok('the overdue petition shows on its own target month', turn3Month.some(r => r.isPending && r.targetTurn === 3));
}

// ─── result ──────────────────────────────────────────────────────────────────
console.log('\nreview.smoke: ' + pass + ' passed, ' + fail + ' failed.');
if(fail){ console.log(failures.map(f => '  ✗ ' + f).join('\n')); process.exit(1); }
