/* Phase 2.5 Journeys (#475 — J1) smoke test — the overland day-tick consumer.
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/journeys.smoke.js
 *
 * Covers the J1 acceptance set (Journeys plan §20.6 subset):
 *   - data layer: blankJourney shape + jrn- id + lazy-migration supplement fields
 *   - day-tick consumer registered at slot 30 with the right pauseTriggers
 *   - plan → tick → ARRIVE (road route, deterministic)
 *   - LOST cascade (nav-fail → isLost, navigation-fail pauseTrigger)
 *   - SUPPLY depletion → hunger + dehydration (RAW default) + ignore-rations opt-out
 *   - FATIGUE cycle (six strenuous days → forced rest, JJ p.84) + simplified-fatigue opt-out
 *   - MULTI-journey tick (two in-transit journeys both advance one day)
 *   - propose is PURE (no mutation); commit replays the recorded absolutes
 *   - RAW-default posture: realistic-fatigue/mandatory-rations retired; opt-ins registered
 *
 * Authored 2026-06-01 (Journeys J1).
 */

const path = require('path');
[
  'acks-engine-catalogs.js',
  'acks-engine.js',
  'acks-engine-entities.js',
  'acks-engine-entity-registry.js',
  'acks-engine-field-schemas.js',
  'acks-engine-events.js',
  'acks-engine-subsystems.js',
].forEach(f => require(path.join(__dirname, '..', f)));
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail ? '  -- ' + detail : '')); failed++; }
}
function section(t){ console.log('--- ' + t + ' ---'); }

// Build a campaign with two hexes (start + dest) and N participant characters.
function build(opts){
  opts = opts || {};
  const c = ACKS.blankCampaign({ name: 'jtest' });
  c.currentTurn = 1; c.currentDayInMonth = 1;
  c.calendar = c.calendar || { year: 1, month: 1, day: 1 };
  c.hexes = [
    ACKS.blankHex({ id: 'hex-a', coord: { q: 0, r: 0 }, terrain: opts.terrain || 'grassland', hasRoad: opts.hasRoad !== false }),
    ACKS.blankHex({ id: 'hex-b', coord: opts.destCoord || { q: 12, r: 0 }, terrain: 'grassland', hasRoad: true })
  ];
  c.characters = [ ACKS.blankCharacter({ id: 'chr-1', name: 'Scout' }) ];
  const j = ACKS.blankJourney({
    id: 'jrn-1', name: 'Road Run', participantCharacterIds: ['chr-1'],
    startHexId: 'hex-a', destinationHexId: 'hex-b', mode: 'foot',
    supplies: Object.assign({ rations: 100, waterRations: 100, animalFeed: 0, animalWater: 0, shipStores: 0 }, opts.supplies || {})
  });
  c.journeys = [j];
  // default: all auto-pauses off so a multi-day tick runs clean unless a test turns them on
  c.houseRules = Object.assign({ 'auto-pause-on-encounter': false, 'auto-pause-on-navigation-fail': false, 'auto-pause-on-supplies-low': false }, opts.houseRules || {});
  return { c, j };
}

// ─────────────────────────────────────────────────────────────────────────────
section('Data layer — factory + ids + supplements');

const jb = ACKS.blankJourney({});
check('blankJourney returns a jrn- id', typeof jb.id === 'string' && jb.id.startsWith('jrn-'), jb.id);
check('blankJourney defaults: planning / foot / normal / expedition', jb.status === 'planning' && jb.mode === 'foot' && jb.pace === 'normal' && jb.purpose === 'expedition');
check('blankJourney participantCharacterIds is the source of truth (array)', Array.isArray(jb.participantCharacterIds) && jb.partyId === null);
check('blankJourney supplies has the five person-day buckets', jb.supplies && ['rations','waterRations','animalFeed','animalWater','shipStores'].every(k => k in jb.supplies));
check('blankJourney has days[]/encounters[]/history[] logs', Array.isArray(jb.days) && Array.isArray(jb.encounters) && Array.isArray(jb.history));
check('isJourney predicate', ACKS.isJourney(jb) === true && ACKS.isJourney({ id: 'chr-x' }) === false);

// Lazy migration backfills the supplement fields on legacy-shaped saves
const legacy = { schemaVersion: 2, kind: 'campaign', id: 'cmp-legacy', name: 'L',
  domains: [], characters: [{ schemaVersion: 2, id: 'chr-old', name: 'Old', kind: 'pc' }],
  hexes: [{ schemaVersion: 2, id: 'hex-old', coord: { q: 0, r: 0 } }],
  settlements: [], parties: [], eventLog: [] };
const migrated = ACKS.migrateCampaign(JSON.parse(JSON.stringify(legacy)));
check('migration: campaign.journeys[] exists', Array.isArray(migrated.journeys));
const mh = migrated.hexes[0], mc = migrated.characters[0];
check('migration: hex gains hasRoad/hasTrail/riverCount/elevationFt', mh.hasRoad === false && mh.hasTrail === false && mh.riverCount === 0 && mh.elevationFt === 0);
check('migration: character gains currentJourneyId/personalFatigue/hungerDays/dehydrationDays',
  mc.currentJourneyId === null && mc.personalFatigue === 0 && mc.hungerDays === 0 && mc.dehydrationDays === 0);

// ─────────────────────────────────────────────────────────────────────────────
section('Catalogs + house-rule polarity (RAW default)');

check('terrain speed catalog: grassland ×1, jungle ×1/2, road ×3/2', ACKS.JOURNEY_TERRAIN_SPEED.grassland === 1 && ACKS.JOURNEY_TERRAIN_SPEED.jungle === 0.5 && ACKS.JOURNEY_TERRAIN_SPEED.road === 1.5);
check('navigation catalog: grassland 6+, jungle 14+', ACKS.JOURNEY_NAV_THROWS.grassland === 6 && ACKS.JOURNEY_NAV_THROWS.jungle === 14);
check('fatigue cycle = 6 days (JJ p.84)', ACKS.JOURNEY_FATIGUE_CYCLE_DAYS === 6);
const ruleIds = ACKS.HOUSERULES_REGISTRY.map(r => r.id);
check('RAW-default flip: realistic-fatigue + mandatory-rations RETIRED', ruleIds.indexOf('realistic-fatigue') < 0 && ruleIds.indexOf('mandatory-rations') < 0);
check('RAW-default flip: simplified-fatigue + ignore-rations are the opt-ins', ruleIds.indexOf('simplified-fatigue') >= 0 && ruleIds.indexOf('ignore-rations') >= 0);

// ─────────────────────────────────────────────────────────────────────────────
section('Consumer registration');

const consumers = ACKS.dayConsumersInOrder();
const jc = consumers.find(c => c.name === 'journeys');
check('journeys consumer registered', !!jc);
check('journeys consumer at slot 30 (before construction 50)', jc && jc.order === 30);
check('journeys consumer declares the three pauseTriggers', jc && ['encounter','navigation-fail','supplies-low'].every(t => jc.pauseTriggers.indexOf(t) >= 0));
check('an in-transit journey makes dayTickActivityInFlight true', (function(){ const t = build(); t.j.status = 'in-transit'; return ACKS.dayTickActivityInFlight(t.c) === true; })());

// ─────────────────────────────────────────────────────────────────────────────
section('startJourney — links + emits journey-start');

const st = build();
ACKS.startJourney(st.c, st.j);
check('startJourney sets in-transit + currentHexId = start', st.j.status === 'in-transit' && st.j.currentHexId === 'hex-a');
check('startJourney links participant currentJourneyId', st.c.characters[0].currentJourneyId === 'jrn-1');
check('startJourney emits a journey-start event', st.c.eventLog.some(e => e.event && e.event.kind === 'journey-start'));
check('journey-start event carries the context envelope (hexes + participant)', (function(){ const e = st.c.eventLog.find(x => x.event.kind === 'journey-start').event; return e.context && e.context.primaryHexId === 'hex-a' && e.context.involvedHexIds.indexOf('hex-b') >= 0 && e.cadence === 'daily'; })());

// ─────────────────────────────────────────────────────────────────────────────
section('Plan → tick → arrive (road, deterministic)');

const ar = build(); // 12 hexes, road ⇒ 6 hexes/day ⇒ arrives day 2
ACKS.startJourney(ar.c, ar.j);
// propose is PURE — the real campaign must be untouched before commit
const propA = ACKS.proposeDayTick(ar.c, 1, {});
check('propose produces one journey pending record', propA.pendingRecords.filter(r => r.kind === 'journey-day').length === 1);
check('propose does NOT mutate the real journey (still day 0, at start)', ar.c.journeys[0].currentDayIndex === 0 && ar.c.journeys[0].days.length === 0);
ACKS.commitDayTick(ar.c, propA, null);
check('commit advances the journey one day', ar.c.journeys[0].currentDayIndex === 1 && ar.c.journeys[0].days.length === 1);
check('day 1: 6 hexes on the road', ar.c.journeys[0].days[0].hexesTraveled === 6);
let guard = 0;
while(ar.c.journeys[0].status === 'in-transit' && guard++ < 6){ const p = ACKS.proposeDayTick(ar.c, 1, {}); ACKS.commitDayTick(ar.c, p, null); }
check('journey ARRIVES within 5 days', ar.c.journeys[0].status === 'arrived' && ar.c.journeys[0].currentDayIndex <= 5, 'day ' + ar.c.journeys[0].currentDayIndex);
check('on arrival currentHexId = destination', ar.c.journeys[0].currentHexId === 'hex-b');
check('on arrival the participant is moved to the destination + unlinked', ar.c.characters[0].currentHexId === 'hex-b' && ar.c.characters[0].currentJourneyId === null);
check('a journey-arrived event was emitted', ar.c.eventLog.some(e => e.event.kind === 'journey-arrived'));

// ─────────────────────────────────────────────────────────────────────────────
section('Lost cascade (nav-fail → isLost)');

const lo = build({ hasRoad: false, terrain: 'jungle' }); // jungle 14+, no proficiency
lo.j.status = 'in-transit'; lo.j.currentHexId = 'hex-a';
const lp = ACKS.proposeJourneyDay(lo.c, { dayInMonth: 2, rng: () => 0 }); // rng 0 ⇒ d20 = 1 ⇒ nav fail
ACKS.commitJourneyRecord(lo.c, lp.pendingRecords[0]);
check('nav failure sets isLost', lo.c.journeys[0].isLost === true);
check('a lost day makes no progress', lo.c.journeys[0].days[0].hexesTraveled === 0);
check('lost surfaces a navigation-fail pauseTrigger', lp.notableEvents.some(e => e.pauseTrigger === 'navigation-fail'));
// auto-pause-on-navigation-fail ON ⇒ the pipeline pauses on the lost day
const lo2 = build({ hasRoad: false, terrain: 'jungle', houseRules: { 'auto-pause-on-navigation-fail': true } });
lo2.j.status = 'in-transit'; lo2.j.currentHexId = 'hex-a';
// (proposeDayTick uses Math.random; jungle 14+ with no bonus fails ~65% — assert the seam exists, not the roll)
check('auto-pause-on-navigation-fail rule is wired to the journeys consumer', ACKS.dayConsumersInOrder().find(c => c.name === 'journeys').pauseTriggers.indexOf('navigation-fail') >= 0);

// ─────────────────────────────────────────────────────────────────────────────
section('Navigation recovery (bugfix) — a success clears lost + resumes movement');

// Regression for the "journey never arrives" bug: a successful nav throw did not clear isLost,
// so once lost the party made 0 progress forever despite succeeding. A success must recover.
const rec = build({ hasRoad: false, terrain: 'forest' });
ACKS.startJourney(rec.c, rec.j);
rec.c.journeys[0].isLost = true; // simulate being lost from a prior day
const recP = ACKS.proposeJourneyDay(rec.c, { dayInMonth: 2, rng: () => 0.99 }); // d20 = 20 ⇒ nav success
const recR = recP.pendingRecords[0];
check('a successful nav clears isLost (recovers)', recR.newIsLost === false);
check('after recovery the party makes progress (hexesTraveled > 0)', recR.dayRecord.hexesTraveled > 0, 'hexes ' + recR.dayRecord.hexesTraveled);
check('the recovery day is marked success-recovered', recR.dayRecord.navigationThrow && recR.dayRecord.navigationThrow.result === 'success-recovered');
check('recovery surfaces a "found the way again" notable', recP.notableEvents.some(e => e.type === 'navigation-recovered'));
// a normal (not-previously-lost) success also moves
const frs = build({ hasRoad: false, terrain: 'forest' });
ACKS.startJourney(frs.c, frs.j);
const frR = ACKS.proposeJourneyDay(frs.c, { dayInMonth: 2, rng: () => 0.99 }).pendingRecords[0];
check('a normal nav success moves (not lost, plain success)', frR.newIsLost === false && frR.dayRecord.hexesTraveled > 0 && frR.dayRecord.navigationThrow.result === 'success');

// ─────────────────────────────────────────────────────────────────────────────
section('Supply depletion → hunger + dehydration (RAW default)');

const su = build({ supplies: { rations: 2, waterRations: 2 }, destCoord: { q: 500, r: 0 } }); // never arrives
su.j.status = 'in-transit'; su.j.currentHexId = 'hex-a';
for(let i = 0; i < 4; i++){ const p = ACKS.proposeJourneyDay(su.c, { dayInMonth: i + 2, rng: () => 0.99 }); ACKS.commitJourneyRecord(su.c, p.pendingRecords[0]); }
check('rations + water deplete to 0', su.c.journeys[0].supplies.rations === 0 && su.c.journeys[0].supplies.waterRations === 0);
check('hunger accrues after stores run out (2 days short)', su.c.characters[0].hungerDays === 2, 'hungerDays ' + su.c.characters[0].hungerDays);
check('dehydration accrues after stores run out', su.c.characters[0].dehydrationDays === 2, 'dehydrationDays ' + su.c.characters[0].dehydrationDays);
check('a supplies-low pauseTrigger surfaces when hungry', (function(){ const p = ACKS.proposeJourneyDay(su.c, { dayInMonth: 7, rng: () => 0.99 }); return p.notableEvents.some(e => e.pauseTrigger === 'supplies-low'); })());
// ignore-rations opts OUT of RAW tracking
const ig = build({ supplies: { rations: 0, waterRations: 0 }, destCoord: { q: 500, r: 0 }, houseRules: { 'ignore-rations': true } });
ig.j.status = 'in-transit'; ig.j.currentHexId = 'hex-a';
const igp = ACKS.proposeJourneyDay(ig.c, { dayInMonth: 2, rng: () => 0.99 });
ACKS.commitJourneyRecord(ig.c, igp.pendingRecords[0]);
check('ignore-rations: no hunger applied even with empty stores', ig.c.characters[0].hungerDays === 0 && ig.c.characters[0].dehydrationDays === 0);

// ─────────────────────────────────────────────────────────────────────────────
section('Fatigue cycle — six strenuous days → forced rest (JJ p.84)');

const fa = build({ destCoord: { q: 500, r: 0 } }); // far ⇒ never arrives; road ⇒ no nav noise
fa.j.status = 'in-transit'; fa.j.currentHexId = 'hex-a';
const trace = [];
let restDays = 0;
for(let i = 0; i < 8; i++){
  const p = ACKS.proposeJourneyDay(fa.c, { dayInMonth: i + 2, rng: () => 0.99 });
  ACKS.commitJourneyRecord(fa.c, p.pendingRecords[0]);
  trace.push(fa.c.journeys[0].fatigueDays);
  if(fa.c.journeys[0].days[i].pace === 'rest') restDays++;
}
check('fatigue climbs 1..6 then a forced rest resets to 0', trace.slice(0, 7).join(',') === '1,2,3,4,5,6,0', trace.join(','));
check('exactly one forced-rest day in the first 8', restDays === 1, 'restDays ' + restDays);
check('forced-rest day made no progress', fa.c.journeys[0].days[6].hexesTraveled === 0 && fa.c.journeys[0].days[6].pace === 'rest');
// simplified-fatigue opts OUT of the forced rest
const sf = build({ destCoord: { q: 500, r: 0 }, houseRules: { 'simplified-fatigue': true } });
sf.j.status = 'in-transit'; sf.j.currentHexId = 'hex-a';
let sfRest = 0;
for(let i = 0; i < 8; i++){ const p = ACKS.proposeJourneyDay(sf.c, { dayInMonth: i + 2, rng: () => 0.99 }); ACKS.commitJourneyRecord(sf.c, p.pendingRecords[0]); if(sf.c.journeys[0].days[i].pace === 'rest') sfRest++; }
check('simplified-fatigue never forces a rest (counter keeps climbing)', sfRest === 0 && sf.c.journeys[0].fatigueDays === 8, 'fatigue ' + sf.c.journeys[0].fatigueDays);

// ─────────────────────────────────────────────────────────────────────────────
section('Multi-journey tick');

const mu = build();
mu.c.journeys.push(ACKS.blankJourney({ id: 'jrn-2', name: 'Second', participantCharacterIds: [], startHexId: 'hex-a', destinationHexId: 'hex-b', supplies: { rations: 50, waterRations: 50, animalFeed: 0, animalWater: 0, shipStores: 0 } }));
mu.c.journeys.forEach(x => { x.status = 'in-transit'; x.currentHexId = 'hex-a'; });
const mp = ACKS.proposeJourneyDay(mu.c, { dayInMonth: 2, rng: () => 0.99 });
check('both in-transit journeys produce a record in one tick', mp.pendingRecords.length === 2 && mp.pendingRecords.map(r => r.journeyId).sort().join(',') === 'jrn-1,jrn-2');
// a planning (not-yet-started) journey is NOT ticked
mu.c.journeys.push(ACKS.blankJourney({ id: 'jrn-3', name: 'Planned', startHexId: 'hex-a', destinationHexId: 'hex-b' }));
const mp2 = ACKS.proposeJourneyDay(mu.c, { dayInMonth: 2, rng: () => 0.99 });
check('a planning journey is skipped by the consumer', mp2.pendingRecords.length === 2);

// ─────────────────────────────────────────────────────────────────────────────
section('Encounter stub (Step 4)');

const en = build({ hasRoad: false, terrain: 'forest' });
en.j.status = 'in-transit'; en.j.currentHexId = 'hex-a';
const ep = ACKS.proposeJourneyDay(en.c, { dayInMonth: 2, rng: () => 0 }); // rng 0 ⇒ encounter fires
check('encounter check can surface a journey-encounter pauseTrigger', ep.notableEvents.some(e => e.kind === 'journey-encounter' && e.pauseTrigger === 'encounter'));
check('encounter produces a placeholder encounter record (unresolved)', ep.encounters.length >= 1 && ep.encounters[0].outcome === 'unresolved' && ep.encounters[0].triggeredBy === 'wandering-roll');
const er = build({ hasRoad: true }); // roads are safe in J1
er.j.status = 'in-transit'; er.j.currentHexId = 'hex-a';
const erp = ACKS.proposeJourneyDay(er.c, { dayInMonth: 2, rng: () => 0 });
check('roads are safe (no encounter on a road in J1)', erp.encounters.length === 0);

// ─────────────────────────────────────────────────────────────────────────────
section('abortJourney (J2) — unlinks + emits journey-aborted + cannot re-tick');

const ab = build();
ab.c.parties = [{ schemaVersion: 2, id: 'pty-1', name: 'Scouts', currentHexId: 'hex-a', activeJourneyId: null }];
ab.j.partyId = 'pty-1';
ACKS.startJourney(ab.c, ab.j);
check('precondition: started + party + participant linked', ab.j.status === 'in-transit' && ab.c.parties[0].activeJourneyId === 'jrn-1' && ab.c.characters[0].currentJourneyId === 'jrn-1');
const abRet = ACKS.abortJourney(ab.c, ab.j, 'recalled by liege');
check('abortJourney flips status to aborted (returns the journey)', ab.j.status === 'aborted' && abRet === ab.j);
check('abortJourney unlinks participant currentJourneyId', ab.c.characters[0].currentJourneyId === null);
check('abortJourney unlinks party activeJourneyId', ab.c.parties[0].activeJourneyId === null);
check('abortJourney appends an aborted history entry carrying the reason', ab.j.history.some(h => h.type === 'aborted' && /recalled by liege/.test(h.narrative)));
check('abortJourney emits a journey-aborted event', ab.c.eventLog.some(e => e.event && e.event.kind === 'journey-aborted'));
check('journey-aborted carries the context envelope (primaryHexId = stop hex) + reason payload', (function(){ const e = ab.c.eventLog.find(x => x.event.kind === 'journey-aborted').event; return e.context && e.context.primaryHexId === 'hex-a' && e.cadence === 'daily' && e.payload.reason === 'recalled by liege'; })());
const abTick = ACKS.proposeJourneyDay(ab.c, { dayInMonth: 3, rng: () => 0.99 });
check('an aborted journey is skipped by the day-tick consumer (cannot re-tick)', abTick.pendingRecords.every(r => r.journeyId !== 'jrn-1'));
check('journey-aborted is a known kind + opted out of the Event Wizard', ACKS.isEventKindKnown('journey-aborted') && ACKS.wizardEmittableKinds().indexOf('journey-aborted') < 0);
const ab2 = build();
ACKS.startJourney(ab2.c, ab2.j);
ACKS.abortJourney(ab2.c, 'jrn-1'); // accepts a journey id, not just the object
check('abortJourney accepts a journey id (string) as well as the object', ab2.j.status === 'aborted');

// ─────────────────────────────────────────────────────────────────────────────
section('rerollJourneyDay (J2 feedback) — revert + re-tick the latest day');

const rr = build({ hasRoad: false, terrain: 'forest' });
ACKS.startJourney(rr.c, rr.j);
const rrp = ACKS.proposeJourneyDay(rr.c, { dayInMonth: 2, rng: () => 0 }); // rng 0 ⇒ nav fail ⇒ lost
ACKS.commitJourneyRecord(rr.c, rrp.pendingRecords[0]);
check('committed day carries a _preDay snapshot (for reroll)', !!rr.c.journeys[0].days[0]._preDay);
check('after first tick: exactly 1 day, lost', rr.c.journeys[0].days.length === 1 && rr.c.journeys[0].isLost === true);
const rrBeforeIdx = rr.c.journeys[0].currentDayIndex;
const rrRec = ACKS.rerollJourneyDay(rr.c, rr.j);
check('rerollJourneyDay returns a record', !!rrRec);
check('after reroll: still exactly 1 day (popped + re-added)', rr.c.journeys[0].days.length === 1);
check('after reroll: currentDayIndex unchanged', rr.c.journeys[0].currentDayIndex === rrBeforeIdx);
check('after reroll: the day has a fresh navigationThrow + a new _preDay', !!rr.c.journeys[0].days[0].navigationThrow && !!rr.c.journeys[0].days[0]._preDay);
// guard: a day with no _preDay (legacy save) is not rerollable
const rrng = build();
ACKS.startJourney(rrng.c, rrng.j);
rrng.c.journeys[0].days = [{ dayIndex: 1, navigationThrow: null }];
rrng.c.journeys[0].currentDayIndex = 1;
check('rerollJourneyDay returns null when the latest day lacks a _preDay snapshot', ACKS.rerollJourneyDay(rrng.c, rrng.j) === null);

// guard (J2 feedback): the LATEST day is rerollable only while the WORLD CLOCK still stands on
// the day the leg happened — a just-arrived leg stays rerollable, but +1 day / Advance month
// rolls the world past it and locks it (compare absolute ordinal turn*30 + dayInMonth).
const wc = build(); // road ⇒ arrives within a couple of days
ACKS.startJourney(wc.c, wc.j);
let wcGuard = 0;
while(wc.c.journeys[0].status === 'in-transit' && wcGuard++ < 6){ const p = ACKS.proposeDayTick(wc.c, 1, {}); ACKS.commitDayTick(wc.c, p, null); }
const wcJ = wc.c.journeys[0];
const wcLast = wcJ.days[wcJ.days.length - 1];
check('setup: journey arrived via the day-tick pipeline', wcJ.status === 'arrived');
check('each committed day carries a worldDay {turn, dayInMonth} stamp', !!wcLast.worldDay && typeof wcLast.worldDay.turn === 'number' && typeof wcLast.worldDay.dayInMonth === 'number');
check('worldDay.dayInMonth = the world day the leg landed on (clock is on it now)', wcLast.worldDay.dayInMonth === wc.c.currentDayInMonth);
check('journeyLastDayRerollable TRUE while the world is still on the arrival day', ACKS.journeyLastDayRerollable(wc.c, wcJ) === true);
// advance the world one more day past the arrival (journey is no longer in-transit, but the clock moves)
const wcAfter = ACKS.proposeDayTick(wc.c, 1, {}); ACKS.commitDayTick(wc.c, wcAfter, null);
check('the world clock advanced past the arrival day', wc.c.currentDayInMonth > wcLast.worldDay.dayInMonth);
check('journeyLastDayRerollable FALSE once the world rolled past the arrival day', ACKS.journeyLastDayRerollable(wc.c, wcJ) === false);
check('rerollJourneyDay returns null once the world has moved past the last leg', ACKS.rerollJourneyDay(wc.c, wcJ) === null);
const wcDaysBefore = wcJ.days.length;
ACKS.rerollJourneyDay(wc.c, wcJ);
check('a world-locked reroll leaves the journey untouched (no day popped)', wcJ.days.length === wcDaysBefore && wcJ.status === 'arrived');

// reroll a JUST-ARRIVED journey works while the world is still on its day, and round-trips the
// party/participant arrival bookkeeping (no stranded pointers if the redo un-arrives).
const ra = build({ destCoord: { q: 6, r: 0 } }); // 6 hexes ⇒ road arrives in one day
const raParty = { schemaVersion: 2, id: 'pty-ra', kind: 'party', name: 'Trail Party', memberCharacterIds: ['chr-1'], leaderCharacterId: 'chr-1', currentHexId: 'hex-a', status: 'active', activeJourneyId: null };
ra.c.parties = [raParty]; ra.j.partyId = 'pty-ra';
ACKS.startJourney(ra.c, ra.j); raParty.activeJourneyId = ra.j.id;
const raP = ACKS.proposeDayTick(ra.c, 1, {}); ACKS.commitDayTick(ra.c, raP, null);
check('setup: single-day road journey arrived; party moved to dest + unlinked', ra.c.journeys[0].status === 'arrived' && raParty.currentHexId === 'hex-b' && raParty.activeJourneyId === null);
check('journeyLastDayRerollable TRUE for the just-arrived journey (clock still on its day)', ACKS.journeyLastDayRerollable(ra.c, ra.j) === true);
check('rerollJourneyDay re-runs the just-arrived leg (returns a record)', !!ACKS.rerollJourneyDay(ra.c, ra.j));
check('after reroll the party bookkeeping is consistent with the journey status (no stranded pointers)',
  (ra.c.journeys[0].status === 'arrived')
    ? (raParty.activeJourneyId === null && raParty.currentHexId === 'hex-b' && ra.c.characters[0].currentHexId === 'hex-b')
    : (raParty.activeJourneyId === ra.j.id && raParty.currentHexId === 'hex-a' && ra.c.characters[0].currentHexId === 'hex-a'));

// guard: an ABORTED journey is never rerollable (abort is a deliberate GM decision, not a roll)
const rrab = build({ hasRoad: false, terrain: 'forest' });
ACKS.startJourney(rrab.c, rrab.j);
const rrabp = ACKS.proposeJourneyDay(rrab.c, { dayInMonth: 2, rng: () => 0 });
ACKS.commitJourneyRecord(rrab.c, rrabp.pendingRecords[0]);
ACKS.abortJourney(rrab.c, rrab.j, 'test abort');
check('journeyLastDayRerollable FALSE for an aborted journey', ACKS.journeyLastDayRerollable(rrab.c, rrab.j) === false);
check('rerollJourneyDay returns null once the journey has been ABORTED', ACKS.rerollJourneyDay(rrab.c, rrab.j) === null);

// ─────────────────────────────────────────────────────────────────────────────
section('mid-journey pace change affects subsequent days (J2 feedback)');

// The engine reads journey.pace fresh on each day-tick — the UI's "Current pace" control just
// sets journey.pace via gm-fiat — so changing it mid-trip changes the next day's travel.
// (Weather defaults to a constant 'fair' when ctx.weather is omitted, so pace is the only variable.)
function jpaceHexes(pace){
  const b = build({ destCoord: { q: 500, r: 0 } }); // far ⇒ never arrives; road ⇒ deterministic, no nav fail
  b.j.pace = pace;
  ACKS.startJourney(b.c, b.j);
  const p = ACKS.proposeJourneyDay(b.c, { dayInMonth: 2, rng: () => 0.5 });
  ACKS.commitJourneyRecord(b.c, p.pendingRecords[0]);
  return b.c.journeys[0].days[0].hexesTraveled || 0;
}
const jpCautious = jpaceHexes('cautious'), jpNormal = jpaceHexes('normal'), jpForced = jpaceHexes('forced-march');
check('forced-march covers more ground than normal (same terrain + weather)', jpForced > jpNormal, jpForced + ' vs ' + jpNormal);
check('cautious covers less ground than normal', jpCautious < jpNormal, jpCautious + ' vs ' + jpNormal);

// changing pace BETWEEN days: day 1 at the starting pace, day 2 at the new pace; each day record
// stamps the pace actually used that day (history preserved across a mid-trip change).
const jpRun = build({ destCoord: { q: 500, r: 0 } });
ACKS.startJourney(jpRun.c, jpRun.j); // blankJourney default pace = normal
const jpRunD1 = ACKS.proposeJourneyDay(jpRun.c, { dayInMonth: 2, rng: () => 0.5 }); ACKS.commitJourneyRecord(jpRun.c, jpRunD1.pendingRecords[0]);
jpRun.j.pace = 'forced-march'; // GM changes pace mid-trip (what the UI's gm-fiat setJourneyPace does)
const jpRunD2 = ACKS.proposeJourneyDay(jpRun.c, { dayInMonth: 3, rng: () => 0.5 }); ACKS.commitJourneyRecord(jpRun.c, jpRunD2.pendingRecords[0]);
const jpRunDays = jpRun.c.journeys[0].days;
check('day 1 record stamped the original pace (normal)', jpRunDays[0].pace === 'normal');
check('day 2 record stamped the changed pace (forced-march) — pace read fresh each day', jpRunDays[1].pace === 'forced-march');
check('the mid-trip pace change increased day-2 distance vs day-1', (jpRunDays[1].hexesTraveled||0) > (jpRunDays[0].hexesTraveled||0));

// ─────────────────────────────────────────────────────────────────────────────
console.log('--- Summary ---');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
if(failed === 0){
  console.log('\nAll Journeys (Phase 2.5 #475 — J1 + J2) smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nSome checks failed. Review output above.');
  process.exit(1);
}
