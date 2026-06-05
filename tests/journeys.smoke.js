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
check('migration: hex gains hasRoad/hasTrail/elevationFt; riverCount dropped (#225)', mh.hasRoad === false && mh.hasTrail === false && mh.elevationFt === 0 && !('riverCount' in mh));
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
section('Catalogs — RAW corrections (weather / temperature / ground / nav split / pace)');
// 2026-06-02 RAW audit (Fix A + B + C5), storm corrected 2026-06-02 (deeper RAW re-check).
// A1/A2 weather speed: foggy + snowy halve; rain AND stormy do NOT slow base travel (RR
// pp.277-278 / JJ p.38 — the halving set is Frigid/Foggy/Muddy/Snowy/Sweltering; "stormy" is
// a JJ activity-penalty condition, not a speed reducer, and no RAW weather imposes ×1/4).
check('weather speed: stormy ×1 — RAW activity-penalty, not a speed reducer (was wrongly ×1/4)', ACKS.JOURNEY_WEATHER_SPEED.stormy === 1);
check('weather speed: foggy ×1/2 (was wrongly ×1)', ACKS.JOURNEY_WEATHER_SPEED.foggy === 0.5);
check('weather speed: snowy ×1/2, rain + fair ×1', ACKS.JOURNEY_WEATHER_SPEED.snowy === 0.5 && ACKS.JOURNEY_WEATHER_SPEED.rainy === 1 && ACKS.JOURNEY_WEATHER_SPEED.fair === 1);
// A3 temperature: frigid + sweltering halve speed (RR pp.277-278).
check('temperature speed: frigid + sweltering ×1/2, temperate ×1', ACKS.JOURNEY_TEMPERATURE_SPEED.frigid === 0.5 && ACKS.JOURNEY_TEMPERATURE_SPEED.sweltering === 0.5 && ACKS.JOURNEY_TEMPERATURE_SPEED.moderate === 1 && ACKS.JOURNEY_TEMPERATURE_SPEED.cold === 1);
// A4 ground condition: mud/snow underfoot ×1/2 (RR p.272).
check('ground speed: mud + snow ×1/2, clear ×1', ACKS.JOURNEY_GROUND_SPEED.mud === 0.5 && ACKS.JOURNEY_GROUND_SPEED.snow === 0.5 && ACKS.JOURNEY_GROUND_SPEED.clear === 1);
// B5 nav split: dense scrubland 8+, forested swamp 14+ (RR p.275); bare keys keep the easy throw.
check('nav split: scrubland 6+ / scrubland-dense 8+', ACKS.JOURNEY_NAV_THROWS.scrubland === 6 && ACKS.JOURNEY_NAV_THROWS['scrubland-dense'] === 8);
check('nav split: swamp 10+ / swamp-forested 14+', ACKS.JOURNEY_NAV_THROWS.swamp === 10 && ACKS.JOURNEY_NAV_THROWS['swamp-forested'] === 14);
check('terrain split shares speed: scrubland-dense ×1, swamp-forested ×1/2', ACKS.JOURNEY_TERRAIN_SPEED['scrubland-dense'] === 1 && ACKS.JOURNEY_TERRAIN_SPEED['swamp-forested'] === 0.5);
// B6 road driver rate ×2 (RR p.272) — present in the catalog, selected once vehicle modes land.
check('terrain: road-driving ×2 (vehicle + Driving)', ACKS.JOURNEY_TERRAIN_SPEED['road-driving'] === 2);
// C5 pace set is now pure RAW: forced-march / normal / half-speed; cautious + half-ancillary retired.
check('pace catalog: forced-march 3/2, normal 1, half-speed 1/2', ACKS.JOURNEY_PACE_SPEED['forced-march'] === 1.5 && ACKS.JOURNEY_PACE_SPEED.normal === 1 && ACKS.JOURNEY_PACE_SPEED['half-speed'] === 0.5);
check('pace catalog: cautious + half-ancillary RETIRED', ACKS.JOURNEY_PACE_SPEED.cautious === undefined && ACKS.JOURNEY_PACE_SPEED['half-ancillary'] === undefined);

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
section('Travel pivot — comprehensive per-day event + characterHistory (2026-06-04)');

// Every committed travel day now emits ONE comprehensive journey-day-tick (or journey-arrived) event
// carrying the whole day — every hex crossed (involvedHexIds), where the party ENDED (primaryHexId, not
// the origin), the travellers (relatedEntities role 'traveller') + the journey, and the full day record
// in the payload. The per-thing signals (lost/hunger/fording/…) become transient (pause + day-log only),
// folded into the one event. Routine days are campaignLogHidden. ACKS.characterHistory derives per-person.
const tp = build(); // road ⇒ deterministic routine day (nav skipped on road; encounter chance 0 on road)
ACKS.startJourney(tp.c, tp.j);
const tpEvLen = tp.c.eventLog.length;
ACKS.commitDayTick(tp.c, ACKS.proposeDayTick(tp.c, 1, {}), null);
const tpDayEvs = tp.c.eventLog.slice(tpEvLen).filter(e => e.event && (e.event.kind === 'journey-day-tick' || e.event.kind === 'journey-arrived'));
check('exactly ONE comprehensive journey day event emitted per committed day', tpDayEvs.length === 1, 'got ' + tpDayEvs.length);
const tpEv = tpDayEvs[0].event;
check('day event involvedHexIds lists the hexes crossed', Array.isArray(tpEv.context.involvedHexIds) && tpEv.context.involvedHexIds.length >= 1);
check('day event primaryHexId = the party\'s current position (held at last authored hex on a sparse route)', tpEv.context.primaryHexId === tp.c.journeys[0].currentHexId);
check('on arrival the comprehensive event primaryHexId = destination (ended), NOT a hardcoded origin', (function(){ const e = ar.c.eventLog.filter(x => x.event.kind === 'journey-arrived').pop(); return !!(e && e.event.context && e.event.context.primaryHexId === 'hex-b'); })());
check('day event tags every traveller (role traveller) + the journey', tpEv.context.relatedEntities.some(r => r.kind === 'character' && r.id === 'chr-1' && r.role === 'traveller') && tpEv.context.relatedEntities.some(r => r.kind === 'journey' && r.id === 'jrn-1'));
check('day event payload carries the full day record (hexPath + miles)', tpEv.payload && tpEv.payload.day && Array.isArray(tpEv.payload.day.hexPath) && tpEv.payload.day.milesTraveled > 0);
check('a routine travel day is campaignLogHidden (in Event Log + history, out of Campaign Log)', tpDayEvs[0].campaignLogHidden === true);
check('characterHistory(traveller) surfaces the travel day', ACKS.characterHistory(tp.c, 'chr-1').some(e => e.event && (e.event.kind === 'journey-day-tick' || e.event.kind === 'journey-arrived')));
check('characterHistory(non-traveller) is empty', ACKS.characterHistory(tp.c, 'chr-nobody').length === 0);

// The character-sheet Travel box (2026-06-04) renders characterHistory filtered to journey-* kinds — the
// WHOLE per-person trip (set out → each day → arrived / stopped / re-routed), not just the per-day ticks.
// Confirm the lifecycle events tag the traveller too, so the box shows the full timeline.
const tl = build();
ACKS.startJourney(tl.c, tl.j);
check('characterHistory surfaces journey-start (the "set out" row)', ACKS.characterHistory(tl.c, 'chr-1').some(e => e.event && e.event.kind === 'journey-start'));
ACKS.commitDayTick(tl.c, ACKS.proposeDayTick(tl.c, 1, {}), null);
ACKS.abortJourney(tl.c, tl.j, 'recalled');
check('characterHistory surfaces journey-aborted after Stop Moving', ACKS.characterHistory(tl.c, 'chr-1').some(e => e.event && e.event.kind === 'journey-aborted'));
check('every characterHistory entry is a journey-* travel event (the Travel box filter holds)', ACKS.characterHistory(tl.c, 'chr-1').length > 0 && ACKS.characterHistory(tl.c, 'chr-1').every(e => e.event && /^journey-/.test(e.event.kind)));
const rr2 = build();
ACKS.startJourney(rr2.c, rr2.j);
ACKS.commitDayTick(rr2.c, ACKS.proposeDayTick(rr2.c, 1, {}), null);
ACKS.reRouteJourney(rr2.c, rr2.j, { destinationHexId: 'hex-a' });
check('characterHistory surfaces journey-rerouted after a re-route', ACKS.characterHistory(rr2.c, 'chr-1').some(e => e.event && e.event.kind === 'journey-rerouted'));

// A NOTABLE day folds its per-thing signals into the single umbrella event (transient → not emitted
// separately). Proposal-level: confirm the per-thing notables are transient + exactly one umbrella.
const np = build({ hasRoad: false, terrain: 'grassland', supplies: { rations: 0, waterRations: 0 } });
ACKS.startJourney(np.c, np.j);
const npProp = ACKS.proposeJourneyDay(np.c, { dayInMonth: 2, rng: () => 0.99 }); // d20=20 (nav ok), no encounter; supplies 0 ⇒ hunger+thirst
const npPerThing = npProp.notableEvents.filter(e => e.type !== 'travel-day');
const npUmbrella = npProp.notableEvents.filter(e => e.type === 'travel-day');
check('a notable day still yields exactly ONE umbrella event', npUmbrella.length === 1);
check('per-thing notables (hunger/dehydration) are flagged transient (folded, not separately emitted)', npPerThing.length >= 1 && npPerThing.every(e => e.transient === true));
check('the umbrella event is the ONLY non-transient notable', npProp.notableEvents.filter(e => !e.transient).length === 1);
check('a NOTABLE day umbrella is NOT campaignLogHidden', npUmbrella[0].campaignLogHidden === false);
check('the umbrella payload digest records the hunger happening', Array.isArray(npUmbrella[0].payload.day.happenings) && npUmbrella[0].payload.day.happenings.some(h => /hungr|food/i.test(h.text || '')));
// End-to-end emission on a NON-road day: still exactly one journey event (everything folds), not hidden.
const ne = build({ hasRoad: false, terrain: 'grassland', supplies: { rations: 0, waterRations: 0 } });
ACKS.startJourney(ne.c, ne.j);
const neEvLen = ne.c.eventLog.length;
ACKS.commitDayTick(ne.c, ACKS.proposeDayTick(ne.c, 1, {}), null);
const neDayEvs = ne.c.eventLog.slice(neEvLen).filter(e => e.event && (e.event.kind === 'journey-day-tick' || e.event.kind === 'journey-arrived'));
check('a notable day emits exactly ONE journey event (fragmented signals folded in)', neDayEvs.length === 1, 'got ' + neDayEvs.length);
check('the notable day event is NOT campaignLogHidden', !neDayEvs[0].campaignLogHidden);

// ── journey naming: WHO travels, not the route (Travel pivot) ──
section('Travel pivot — journey naming (who, not route)');
const nm = build(); // chr-1 'Scout', no party
check('single traveller → the character name', ACKS.journeyDefaultName(nm.c, nm.c.journeys[0]) === 'Scout');
nm.c.characters.push(ACKS.blankCharacter({ id:'chr-2', name:'Brand' }));
nm.c.journeys[0].participantCharacterIds = ['chr-1','chr-2'];
check('≥2 travellers (no party) → "<first to join>\'s travelling group"', ACKS.journeyDefaultName(nm.c, nm.c.journeys[0]) === "Scout's travelling group");
nm.c.parties = [{ id:'pty-1', name:'The Iron Hand', currentHexId:'hex-a' }];
nm.c.journeys[0].partyId = 'pty-1';
check('a party journey → the party name (wins over the character set)', ACKS.journeyDefaultName(nm.c, nm.c.journeys[0]) === 'The Iron Hand');
check('no named traveller → null (caller falls back to route)', ACKS.journeyDefaultName(nm.c, { participantCharacterIds: [] }) === null);
// migration re-derives an auto-route name, preserves a GM-set one
const nmig = build(); nmig.c.journeys[0].name = 'hex-a → hex-b';   // looks auto-route (contains ' → ')
ACKS.migrateCampaign(nmig.c);
check('migration re-derives an auto-route journey name to the who-name', nmig.c.journeys[0].name === 'Scout');
const nmig2 = build(); nmig2.c.journeys[0].name = 'The Long March'; // GM-set, no arrow
ACKS.migrateCampaign(nmig2.c);
check('migration PRESERVES a GM-set journey name (no route arrow)', nmig2.c.journeys[0].name === 'The Long March');

// ─────────────────────────────────────────────────────────────────────────────
section('Lost cascade (nav-fail → unknowing-lost, strays — RR p.275)');

// RAW (RR p.275): a failed Navigation throw means the party gets lost AND DOESN'T KNOW IT — it strays
// toward a random hex face and keeps moving (its full distance, the WRONG way), unaware, until a later
// successful throw. Scripted rng: nav d20 (0 ⇒ rolled 1, auto-fail) · stray face (0.5 ⇒ floor(3) = face 3
// = −q, AWAY from the +q destination at (12,0)) · then 0.99 (no wandering encounter).
const seqRng = (vals) => { let i = 0; return () => (i < vals.length ? vals[i++] : 0.99); };
const lo = build({ hasRoad: false, terrain: 'jungle' }); // jungle 14+, no proficiency
lo.j.status = 'in-transit'; lo.j.currentHexId = 'hex-a';
const remBefore = ACKS.computeJourneyDistance(lo.c, lo.c.journeys[0]).remaining;
const lp = ACKS.proposeJourneyDay(lo.c, { dayInMonth: 2, rng: seqRng([0, 0.5]) });
ACKS.commitJourneyRecord(lo.c, lp.pendingRecords[0]);
const lj = lo.c.journeys[0];
check('nav failure sets isLost', lj.isLost === true);
check('a lost party STILL MOVES (strays) — not the old halt (RR p.275)', lj.days[0].hexesTraveled > 0, 'hexes ' + lj.days[0].hexesTraveled);
check('lost is UNKNOWING (fail-unknown-lost), not the old fail-known-lost', lj.days[0].navigationThrow.result === 'fail-unknown-lost');
check('a stray heading (0..5) is recorded + persisted on the journey', typeof lj.strayHeading === 'number' && lj.strayHeading >= 0 && lj.strayHeading <= 5);
check('no progress toward the goal — route epoch re-anchored (covered = 0)', ACKS.computeJourneyDistance(lo.c, lj).covered === 0);
check('straying the wrong way pushes the destination FURTHER away', ACKS.computeJourneyDistance(lo.c, lj).remaining > remBefore, 'rem ' + remBefore + '→' + ACKS.computeJourneyDistance(lo.c, lj).remaining);
check('lost surfaces a navigation-fail pauseTrigger', lp.notableEvents.some(e => e.pauseTrigger === 'navigation-fail'));
check('auto-pause-on-navigation-fail rule is wired to the journeys consumer', ACKS.dayConsumersInOrder().find(c => c.name === 'journeys').pauseTriggers.indexOf('navigation-fail') >= 0);
// RR p.275: an unmodified natural 1 ALWAYS fails — even with the +8 both-proficiencies bonus.
check('rollNavigation: natural 1 auto-fails even at +8 vs 6+', ACKS.rollNavigation(6, 8, () => 0).success === false && ACKS.rollNavigation(6, 8, () => 0).naturalOne === true);
check('rollNavigation: a 20 clears a hard target (jungle 14+)', ACKS.rollNavigation(14, 0, () => 0.99).success === true);

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
section('§27 getting-lost — RAW nav bonus (RR p.275) + stray persistence + recovery re-route');

// +4 for the Navigation proficiency OR the Pathfinding class power; +8 for BOTH; nothing else helps a
// land getting-lost throw (Adventuring / Survival / Land Surveying / Seafaring do NOT). Read the bonus
// the integrated tick recorded on the day's navigationThrow.
function navBonusOf(setup){
  const t = build({ hasRoad: false, terrain: 'forest' });
  Object.assign(t.c.characters[0], setup);
  t.j.status = 'in-transit'; t.j.currentHexId = 'hex-a';
  const r = ACKS.proposeJourneyDay(t.c, { dayInMonth: 2, rng: () => 0.5 }).pendingRecords[0];
  const b = r.dayRecord.navigationThrow && r.dayRecord.navigationThrow.bonuses[0];
  return b ? b.value : 0;
}
check('nav bonus +4 for the Navigation proficiency', navBonusOf({ proficiencies: ['Navigation'] }) === 4);
check('nav bonus +4 for the Pathfinding class power', navBonusOf({ classPowers: ['Pathfinding'] }) === 4);
check('nav bonus +8 for BOTH Navigation + Pathfinding', navBonusOf({ proficiencies: ['Navigation'], classPowers: ['Pathfinding'] }) === 8);
check('nav bonus 0 — Adventuring/Survival/Land Surveying do NOT help (RR p.275)', navBonusOf({ proficiencies: ['Adventuring', 'Survival', 'Land Surveying'] }) === 0);

// strayHeading persists while lost ("blithely continues on") — a second failed day keeps the heading.
const per = build({ hasRoad: false, terrain: 'jungle' });
per.j.status = 'in-transit'; per.j.currentHexId = 'hex-a';
ACKS.commitJourneyRecord(per.c, ACKS.proposeJourneyDay(per.c, { dayInMonth: 2, rng: seqRng([0, 0.5]) }).pendingRecords[0]);
const h1 = per.c.journeys[0].strayHeading;
ACKS.commitJourneyRecord(per.c, ACKS.proposeJourneyDay(per.c, { dayInMonth: 3, rng: seqRng([0]) }).pendingRecords[0]); // fails again — no re-roll
check('a still-lost party keeps the same stray heading (RR p.275)', typeof h1 === 'number' && per.c.journeys[0].strayHeading === h1);
check('each lost day re-anchors — covered stays 0 while lost', ACKS.computeJourneyDistance(per.c, per.c.journeys[0]).covered === 0);

// Recovery (RR p.275): a later success re-orients the party — it resumes toward the destination from
// wherever it strayed to (the route is already anchored there).
const remLost = ACKS.computeJourneyDistance(per.c, per.c.journeys[0]).remaining;
const recDay = ACKS.proposeJourneyDay(per.c, { dayInMonth: 4, rng: () => 0.99 }).pendingRecords[0]; // d20 = 20 ⇒ recover
ACKS.commitJourneyRecord(per.c, recDay);
check('recovery clears lost + the stray heading', per.c.journeys[0].isLost === false && per.c.journeys[0].strayHeading === null);
check('recovery day is marked success-recovered', recDay.dayRecord.navigationThrow.result === 'success-recovered');
check('after recovery the party heads to the destination again (remaining shrinks)', ACKS.computeJourneyDistance(per.c, per.c.journeys[0]).remaining < remLost, 'rem ' + remLost + '→' + ACKS.computeJourneyDistance(per.c, per.c.journeys[0]).remaining);

// Migration backfills the §27 fields on legacy-shaped journeys.
const lj2 = ACKS.migrateCampaign({ schemaVersion: 2, kind: 'campaign', id: 'cmp-lj', name: 'LJ',
  domains: [], characters: [], hexes: [], settlements: [], parties: [], eventLog: [],
  journeys: [{ schemaVersion: 2, id: 'jrn-old', startHexId: 'hex-a', destinationHexId: 'hex-b', pace: 'normal', days: [] }] });
check('migration backfills strayHeading=null + routeAnchorCoord=null on legacy journeys', lj2.journeys[0].strayHeading === null && lj2.journeys[0].routeAnchorCoord === null);

// The route + distance resolve from routeAnchorCoord (a strayed, possibly-UNauthored position) when set.
const ac = build({ hasRoad: false, terrain: 'grassland' });
ac.c.journeys[0].routeAnchorCoord = { q: 3, r: 0 }; ac.c.journeys[0].coveredBaseline = 0;
const acRoute = ACKS.journeyRoute(ac.c, ac.c.journeys[0]);
check('journeyRoute anchors at routeAnchorCoord when set', acRoute.length > 0 && acRoute[0].coord.q === 3 && acRoute[0].coord.r === 0);
check('computeJourneyDistance measures from the coord anchor ((3,0)→(12,0) = 9)', ACKS.computeJourneyDistance(ac.c, ac.c.journeys[0]).total === 9);

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
const jpHalf = jpaceHexes('half-speed'), jpNormal = jpaceHexes('normal'), jpForced = jpaceHexes('forced-march');
check('forced-march covers more ground than normal (same terrain + weather)', jpForced > jpNormal, jpForced + ' vs ' + jpNormal);
check('half-speed covers less ground than normal', jpHalf < jpNormal, jpHalf + ' vs ' + jpNormal);

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
section('RAW speed factors — weather / temperature / ground compound (Fix A)');

// Drive weather/temperature via ctx; ground via the start hex. Road grassland = 24 × 3/2 = 36
// mi/day base ⇒ 6 hexes at fair/moderate/clear. Each ×1/2 factor halves it; rain + stormy don't slow.
// (A travel day always covers ≥1 hex, so sub-6-mile days clamp to 1.)
function jdistW(weather, ground){
  const b = build({ destCoord: { q: 500, r: 0 } }); // road grassland, far dest ⇒ deterministic, no nav
  if(ground) b.c.hexes[0].groundCondition = ground;
  ACKS.startJourney(b.c, b.j);
  const p = ACKS.proposeJourneyDay(b.c, { dayInMonth: 2, rng: () => 0.5, weather: weather });
  ACKS.commitJourneyRecord(b.c, p.pendingRecords[0]);
  return b.c.journeys[0].days[0].hexesTraveled || 0;
}
const wFair = jdistW({ condition: 'fair', temperature: 'moderate' });
check('fair/moderate/clear: 6 hexes on a road (baseline)', wFair === 6, String(wFair));
check('stormy does NOT slow base travel — still 6 hexes (RAW: activity-penalty, not speed)', jdistW({ condition: 'stormy', temperature: 'moderate' }) === 6);
check('foggy halves speed (6 → 3 hexes)', jdistW({ condition: 'foggy', temperature: 'moderate' }) === 3);
check('snowy halves speed (6 → 3 hexes)', jdistW({ condition: 'snowy', temperature: 'moderate' }) === 3);
check('rain does NOT slow travel (still 6 hexes)', jdistW({ condition: 'rainy', temperature: 'moderate' }) === 6);
check('frigid temperature halves speed (6 → 3 hexes)', jdistW({ condition: 'fair', temperature: 'frigid' }) === 3);
check('sweltering temperature halves speed (6 → 3 hexes)', jdistW({ condition: 'fair', temperature: 'sweltering' }) === 3);
check('mud underfoot halves speed (6 → 3 hexes)', jdistW({ condition: 'fair', temperature: 'moderate' }, 'mud') === 3);
check('factors compound: foggy + mud (36 × ½ × ½ = 9 mi → 1 hex)', jdistW({ condition: 'foggy', temperature: 'moderate' }, 'mud') === 1);

// ─────────────────────────────────────────────────────────────────────────────
section('Forced march = fatigued at once (Fix C1, RR p.279)');

// RAW: a single forced march jumps the fatigue streak straight to the cycle cap; the next
// strenuous day is then a forced rest. Normal travel only accrues +1/day.
const fmN = build({ destCoord: { q: 500, r: 0 } }); ACKS.startJourney(fmN.c, fmN.j);
ACKS.commitJourneyRecord(fmN.c, ACKS.proposeJourneyDay(fmN.c, { dayInMonth: 2, rng: () => 0.5 }).pendingRecords[0]);
check('normal travel accrues +1 fatigue day', fmN.c.journeys[0].fatigueDays === 1, String(fmN.c.journeys[0].fatigueDays));

const fmF = build({ destCoord: { q: 500, r: 0 } }); fmF.j.pace = 'forced-march'; ACKS.startJourney(fmF.c, fmF.j);
ACKS.commitJourneyRecord(fmF.c, ACKS.proposeJourneyDay(fmF.c, { dayInMonth: 2, rng: () => 0.5 }).pendingRecords[0]);
check('one forced march jumps fatigue to the 6-day cap', fmF.c.journeys[0].fatigueDays === 6, String(fmF.c.journeys[0].fatigueDays));
check('the forced-march day still moved (×3/2)', (fmF.c.journeys[0].days[0].hexesTraveled || 0) > 6);
// the next forced-march day ⇒ forced rest (RR p.279): streak resets, no movement
ACKS.commitJourneyRecord(fmF.c, ACKS.proposeJourneyDay(fmF.c, { dayInMonth: 3, rng: () => 0.5 }).pendingRecords[0]);
const fmF2 = fmF.c.journeys[0].days[1];
check('the day after a forced march is a forced rest (pace=rest, 0 hexes)', fmF2.pace === 'rest' && (fmF2.hexesTraveled || 0) === 0);
check('the forced rest cleared the streak back to 0', fmF.c.journeys[0].fatigueDays === 0);

// simplified-fatigue opt-out: forced march still maxes the counter but NEVER forces a rest
const fmS = build({ destCoord: { q: 500, r: 0 }, houseRules: { 'simplified-fatigue': true } }); fmS.j.pace = 'forced-march'; ACKS.startJourney(fmS.c, fmS.j);
ACKS.commitJourneyRecord(fmS.c, ACKS.proposeJourneyDay(fmS.c, { dayInMonth: 2, rng: () => 0.5 }).pendingRecords[0]);
ACKS.commitJourneyRecord(fmS.c, ACKS.proposeJourneyDay(fmS.c, { dayInMonth: 3, rng: () => 0.5 }).pendingRecords[0]);
check('simplified-fatigue: forced march never forces a rest (both days moved)', (fmS.c.journeys[0].days[0].hexesTraveled || 0) > 0 && (fmS.c.journeys[0].days[1].hexesTraveled || 0) > 0 && fmS.c.journeys[0].days[1].pace !== 'rest');

// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
section('§24 — hex geometry + route derivation');

(function(){
  const line = ACKS.hexLineDraw({ q: 0, r: 0 }, { q: 5, r: 0 });
  check('hexLineDraw spans distance+1 hexes', line.length === 6, String(line.length));
  check('hexLineDraw runs a→b inclusive', line[0].q === 0 && line[0].r === 0 && line[5].q === 5 && line[5].r === 0);
  let adj = true; for(let i = 0; i < line.length - 1; i++){ if(ACKS.hexEdgeBetween(line[i], line[i+1]) < 0) adj = false; }
  check('hexLineDraw: every consecutive pair is edge-adjacent (walkable)', adj);
  const diag = ACKS.hexLineDraw({ q: 0, r: 0 }, { q: 3, r: -3 });
  let adj2 = true; for(let i = 0; i < diag.length - 1; i++){ if(ACKS.hexEdgeBetween(diag[i], diag[i+1]) < 0) adj2 = false; }
  check('hexLineDraw adjacency holds on a diagonal route', adj2 && diag.length === 4, String(diag.length));
})();
check('hexEdgeBetween: +q neighbour is edge 0', ACKS.hexEdgeBetween({q:0,r:0},{q:1,r:0}) === 0);
check('hexEdgeBetween: non-adjacent → -1', ACKS.hexEdgeBetween({q:0,r:0},{q:2,r:0}) === -1);
check('hexOppositeEdge: 0↔3, 1↔4, 2↔5', ACKS.hexOppositeEdge(0)===3 && ACKS.hexOppositeEdge(1)===4 && ACKS.hexOppositeEdge(2)===5 && ACKS.hexOppositeEdge(5)===2);
(function(){
  const c = ACKS.blankCampaign({ name: 'coord' });
  c.hexes = [ ACKS.blankHex({ id:'h0', coord:{q:0,r:0} }), ACKS.blankHex({ id:'h1', coord:{q:1,r:0} }) ];
  check('hexAtCoord finds an authored hex by (q,r)', !!ACKS.hexAtCoord(c, 1, 0) && ACKS.hexAtCoord(c, 1, 0).id === 'h1');
  check('hexAtCoord accepts a {q,r} object', ACKS.hexAtCoord(c, {q:0,r:0}).id === 'h0');
  check('hexAtCoord returns null for an unauthored coord', ACKS.hexAtCoord(c, 9, 9) === null);
})();

// Authored straight line of hexes (0,0)..(n,0): each step is exit-edge 0 / entry-edge 3.
function lineCampaign(n, perHex){
  const c = ACKS.blankCampaign({ name: 'route' });
  c.currentTurn = 1; c.currentDayInMonth = 1; c.calendar = { year:1, month:1, day:1 };
  c.hexes = [];
  for(let q = 0; q <= n; q++){
    const o = (perHex && perHex(q)) || {};
    c.hexes.push(ACKS.blankHex(Object.assign({ id: 'hx-' + q, coord: { q, r: 0 }, terrain: 'grassland', hasRoad: false }, o)));
  }
  c.characters = [ ACKS.blankCharacter({ id:'chr-1', name:'Scout' }) ];
  const j = ACKS.blankJourney({ id:'jrn-1', name:'Trek', participantCharacterIds:['chr-1'], startHexId:'hx-0', destinationHexId:'hx-'+n, mode:'foot', supplies:{ rations:100, waterRations:100, animalFeed:0, animalWater:0, shipStores:0 } });
  c.journeys = [j]; c.houseRules = {};
  return { c, j };
}
// A scripted rng: returns each value in turn (last repeats). nav rolls first, then a ford, then the encounter check.
function seq(arr){ let i = 0; return () => arr[Math.min(i++, arr.length - 1)]; }

(function(){
  const { c, j } = lineCampaign(4);
  const route = ACKS.journeyRoute(c, j);
  check('journeyRoute length = distance + 1', route.length === 5, String(route.length));
  check('journeyRoute resolves authored hexIds along the line', route.every(s => s.hexId && s.hex));
  check('journeyRoute: start has no entrySide, end has no exitSide', route[0].entrySide === null && route[4].exitSide === null);
  check('journeyRoute: interior step enters via 3, exits via 0 (a +q line)', route[2].entrySide === 3 && route[2].exitSide === 0);
  const c2 = ACKS.blankCampaign({ name:'gap' });
  c2.hexes = [ ACKS.blankHex({ id:'g0', coord:{q:0,r:0} }), ACKS.blankHex({ id:'g3', coord:{q:3,r:0} }) ];
  c2.characters = [ ACKS.blankCharacter({ id:'chr-1' }) ];
  const jg = ACKS.blankJourney({ id:'jrn-1', startHexId:'g0', destinationHexId:'g3', participantCharacterIds:['chr-1'] });
  c2.journeys = [jg];
  const rg = ACKS.journeyRoute(c2, jg);
  check('journeyRoute spans UNauthored coords (hexId null mid-route, ends resolved)', rg.length === 4 && rg[0].hexId === 'g0' && rg[1].hexId === null && rg[3].hexId === 'g3');
})();

section('§24 — roadBonusForStep (the per-traversal rule)');
check('through-hex: road on BOTH entry+exit → bonus', ACKS.roadBonusForStep({ roadSides:[0,3] }, 3, 0) === true);
check('through-hex: road on only one side → no bonus', ACKS.roadBonusForStep({ roadSides:[0] }, 3, 0) === false);
check('end-hex (no exit side): road on the entered side → bonus', ACKS.roadBonusForStep({ roadSides:[3] }, 3, null) === true);
check('start-hex (no entry side): road on the exit side → bonus', ACKS.roadBonusForStep({ roadSides:[0] }, null, 0) === true);
check('no roadSides + no flag → no bonus', ACKS.roadBonusForStep({ roadSides:[] }, 3, 0) === false);
check('coarse hasRoad flag → bonus regardless of sides (back-compat)', ACKS.roadBonusForStep({ hasRoad:true, roadSides:[] }, 3, 0) === true);

section('§24 — riverCrossingForStep (barrier / ford / implicit bridge / swim)');
check('river edge → barrier + swim needed', (() => { const x = ACKS.riverCrossingForStep({ riverSides:[0] }, { riverSides:[3] }, 0); return x.barrier && x.crossingType === 'swim' && x.swimmingThrowNeeded; })());
check('no river → no barrier', ACKS.riverCrossingForStep({}, {}, 0).barrier === false);
check('river detected from EITHER hex (editor mirrors the edge)', ACKS.riverCrossingForStep({}, { riverSides:[3] }, 0).barrier === true);
check('a ford/bridge mark negates the barrier (free, no swim)', (() => { const x = ACKS.riverCrossingForStep({ riverSides:[0], crossingSides:[0] }, { riverSides:[3] }, 0); return x.barrier && x.crossingType === 'ford' && !x.swimmingThrowNeeded; })());
check('a road across the river edge is an implicit bridge (free)', (() => { const x = ACKS.riverCrossingForStep({ riverSides:[0], roadSides:[0] }, { riverSides:[3] }, 0); return x.crossingType === 'implicit-bridge' && !x.swimmingThrowNeeded; })());

section('§24 — journeyFordingThrow (RR p.271 Swimming, simplified)');
(function(){
  const c = ACKS.blankCampaign({ name:'ford' }); c.characters = [ ACKS.blankCharacter({ id:'chr-1', name:'Scout' }) ];
  const j = ACKS.blankJourney({ id:'jrn-1', participantCharacterIds:['chr-1'] });
  check('base Swimming target is 11+', ACKS.journeyFordingThrow(c, j, { rng:()=>0.5 }).target === 11);
  check('cold water raises the target by 2 (→13)', ACKS.journeyFordingThrow(c, j, { rng:()=>0.5, coldWater:true }).target === 13);
  check('rough/fast water raises the target by 4 (→15)', ACKS.journeyFordingThrow(c, j, { rng:()=>0.5, roughWater:true }).target === 15);
  check('roll 1 fails the base throw', ACKS.journeyFordingThrow(c, j, { rng:()=>0 }).success === false);
  check('roll 20 passes the base throw', ACKS.journeyFordingThrow(c, j, { rng:()=>0.999 }).success === true);
  const c2 = ACKS.blankCampaign({ name:'ford2' }); c2.characters = [ ACKS.blankCharacter({ id:'chr-1', name:'Otter', proficiencies:['Swimming'] }) ];
  const j2 = ACKS.blankJourney({ id:'jrn-1', participantCharacterIds:['chr-1'] });
  check('a Swimming-proficient party gets +2 to the throw', ACKS.journeyFordingThrow(c2, j2, { rng:()=>0.5 }).bonus === 2);
})();

section('§24 — integration: per-hex terrain + per-side roads (deterministic tickJourneyDay)');
(function(){
  const PASS = () => 0.95; // roll 20 — clears even jungle nav (14+), and skips wandering encounters
  const jg = lineCampaign(6, () => ({ terrain:'jungle' }));
  ACKS.startJourney(jg.c, jg.j);
  const dJ = ACKS.tickJourneyDay(jg.c, jg.c.journeys[0], { rng: PASS, weather:{ condition:'fair', temperature:'moderate' } });
  check('authored jungle line: 2 hexes on day 1 (per-hex terrain ×½)', dJ.record.dayRecord.hexesTraveled === 2, String(dJ.record.dayRecord.hexesTraveled));
  const rd = lineCampaign(6, q => ({ terrain:'jungle', roadSides: q === 0 ? [0] : (q === 6 ? [3] : [0,3]) }));
  ACKS.startJourney(rd.c, rd.j);
  const dR = ACKS.tickJourneyDay(rd.c, rd.c.journeys[0], { rng: PASS, weather:{ condition:'fair', temperature:'moderate' } });
  check('a per-side road through jungle speeds the trek (×3/2 → 6 hexes, arrives)', dR.record.dayRecord.hexesTraveled === 6 && dR.record.newStatus === 'arrived', String(dR.record.dayRecord.hexesTraveled));
  check('a fully-roaded day rolls no navigation throw', dR.record.dayRecord.navigationThrow === null);
})();

section('Halted pace (×0) — the activity budget can cap a journey to no travel (Joachim 2026-06-05)');
(function(){
  const { c, j } = lineCampaign(6);
  ACKS.startJourney(c, j);
  c.journeys[0].pace = 'halted';   // effective pace also 'halted' (no other activities cap it lower)
  const d = ACKS.tickJourneyDay(c, c.journeys[0], { rng: () => 0.5 });
  check('a halted day travels 0 hexes', d.record.dayRecord.hexesTraveled === 0, String(d.record.dayRecord.hexesTraveled));
  check('a halted day surfaces a non-pausing "halted" notable', !!d.notableEvents.find(e => e.type === 'halted' && !e.pauseTrigger));
  check('a halted day does not arrive (no progress)', d.record.newStatus !== 'arrived');
  check('a halted day rolls no navigation throw', d.record.dayRecord.navigationThrow === null);
})();

section('§24 — integration: fording an unbridged river (deterministic)');
(function(){
  const mkRiver = () => lineCampaign(2, q => (q === 0 ? { riverSides:[0] } : (q === 1 ? { riverSides:[3] } : {})));
  // (a) guaranteed-fail ford: nav passes (0.95), the Swimming throw fails (0), encounter skipped (0.95)
  const fb = mkRiver(); ACKS.startJourney(fb.c, fb.j);
  const dF = ACKS.tickJourneyDay(fb.c, fb.c.journeys[0], { rng: seq([0.95, 0, 0.95]) });
  check('an unfordable river blocks movement (0 hexes that day)', dF.record.dayRecord.hexesTraveled === 0, String(dF.record.dayRecord.hexesTraveled));
  check('a failed ford surfaces a fording-fail with the fording pause trigger', !!dF.notableEvents.find(e => e.kind === 'journey-fording' && e.type === 'fording-fail' && e.pauseTrigger === 'fording'));
  check('the day record carries the failed Swimming throw', !!(dF.record.dayRecord.fording && dF.record.dayRecord.fording.result === 'failed'));
  // (b) guaranteed-success swim: crosses one hex, then the day ends (swim speed ¼)
  const fs = mkRiver(); ACKS.startJourney(fs.c, fs.j);
  const dS = ACKS.tickJourneyDay(fs.c, fs.c.journeys[0], { rng: seq([0.95, 0.999, 0.95]) });
  check('a successful swim crosses exactly one hex then ends the day', dS.record.dayRecord.hexesTraveled === 1 && dS.record.dayRecord.fording.result === 'forded-swim', String(dS.record.dayRecord.hexesTraveled));
  // (c) a ford/bridge mark negates the barrier — free crossing, no throw, normal progress
  const fc = lineCampaign(2, q => (q === 0 ? { riverSides:[0], crossingSides:[0] } : (q === 1 ? { riverSides:[3], crossingSides:[3] } : {})));
  ACKS.startJourney(fc.c, fc.j);
  const dC = ACKS.tickJourneyDay(fc.c, fc.c.journeys[0], { rng: () => 0.5 }); // nav passes; the ford needs no Swimming throw
  check('a ford/bridge lets the party cross freely (arrives, no fording record)', dC.record.newStatus === 'arrived' && !dC.record.dayRecord.fording, String(dC.record.dayRecord.hexesTraveled));
})();

section('§24 — per-day hex path + traveller placement (commit)');
(function(){
  // authored grassland line hx-0..hx-6; day 1 covers 4 hexes (24mi/6), reaching hx-4 mid-journey.
  const { c, j } = lineCampaign(6);
  c.characters[0].currentHexId = 'hx-0';
  ACKS.startJourney(c, j);
  const r1 = ACKS.tickJourneyDay(c, c.journeys[0], { rng: () => 0.5 }); // nav passes grassland 6+
  const path = r1.record.dayRecord.hexPath || [];
  check('day record carries hexPath of the hexes entered (4)', path.length === 4, JSON.stringify(path.map(s => s.hexId)));
  check('hexPath entries carry hexId + coord', path.every(s => s.hexId && typeof s.q === 'number' && typeof s.r === 'number'));
  check('hexPath last entry is the day-end hex (hx-4)', path[3] && path[3].hexId === 'hx-4');
  ACKS.commitJourneyRecord(c, r1.record);
  check('mid-journey: journey.currentHexId advanced to the authored hex reached (hx-4)', c.journeys[0].currentHexId === 'hx-4', c.journeys[0].currentHexId);
  check('mid-journey: the traveller is PLACED at the journey current hex (not only on arrival)', c.characters[0].currentHexId === 'hx-4', c.characters[0].currentHexId);
  check('mid-journey: still in-transit (6-hex trip, 4 covered)', c.journeys[0].status === 'in-transit');
  // party placement: the party tracks the journey current hex each day too
  const cp = lineCampaign(6);
  cp.c.characters[0].currentHexId = 'hx-0';
  cp.c.parties = [{ id: 'pty-1', name: 'Band', currentHexId: 'hx-0', activeJourneyId: null, memberCharacterIds: [], status: 'active' }];
  cp.j.partyId = 'pty-1';
  ACKS.startJourney(cp.c, cp.j);
  ACKS.commitJourneyRecord(cp.c, ACKS.tickJourneyDay(cp.c, cp.c.journeys[0], { rng: () => 0.5 }).record);
  check('party is placed at the journey current hex each day too (hx-4)', cp.c.parties[0].currentHexId === 'hx-4', cp.c.parties[0].currentHexId);
  // a blocked/rest day records an empty hexPath (no hexes entered)
  const rb = lineCampaign(2, q => (q === 0 ? { riverSides: [0] } : (q === 1 ? { riverSides: [3] } : {})));
  ACKS.startJourney(rb.c, rb.j);
  const dB = ACKS.tickJourneyDay(rb.c, rb.c.journeys[0], { rng: seq([0.95, 0, 0.95]) }); // fail the ford → 0 hexes
  check('a blocked day records an empty hexPath', Array.isArray(dB.record.dayRecord.hexPath) && dB.record.dayRecord.hexPath.length === 0);
})();

// routeCoords snapshot stamped at startJourney (informational path cache)
(function(){
  const { c, j } = lineCampaign(4);
  ACKS.startJourney(c, j);
  check('startJourney stamps routeCoords (path snapshot for UI/integrators)', Array.isArray(c.journeys[0].routeCoords) && c.journeys[0].routeCoords.length === 5, String((c.journeys[0].routeCoords||[]).length));
})();

section('§24 — waypoint distance is via-waypoint (not direct)');
(function(){
  // A waypoint OFF the direct line makes the journey travel its FULL via-waypoint route, not stop at the
  // direct start→dest hex count (the pre-fix early-arrival/teleport bug). Direct (0,0)→(4,0)=4; via (2,-2)=6.
  const c = ACKS.blankCampaign({ name:'wp' });
  c.currentTurn = 1; c.currentDayInMonth = 1; c.calendar = { year:1, month:1, day:1 }; c.houseRules = {};
  c.hexes = [ ACKS.blankHex({ id:'hx-s', coord:{q:0,r:0}, terrain:'grassland' }),
              ACKS.blankHex({ id:'hx-w', coord:{q:2,r:-2}, terrain:'grassland' }),
              ACKS.blankHex({ id:'hx-d', coord:{q:4,r:0}, terrain:'grassland' }) ];
  c.characters = [ ACKS.blankCharacter({ id:'chr-1', name:'Scout' }) ];
  const j = ACKS.blankJourney({ id:'jrn-1', name:'Detour', participantCharacterIds:['chr-1'], startHexId:'hx-s', destinationHexId:'hx-d', waypoints:[{hexId:'hx-w'}], supplies:{ rations:100, waterRations:100 } });
  c.journeys = [j];
  const directDist = ACKS.hexAxialDistance({q:0,r:0},{q:4,r:0});
  const route = ACKS.journeyRoute(c, j);
  const dist = ACKS.computeJourneyDistance(c, j);
  check('waypoint detour routes VIA the waypoint (longer than direct)', route.length - 1 > directDist, (route.length-1) + ' vs ' + directDist);
  check('computeJourneyDistance.total = via-waypoint route length, not direct', dist.total === route.length - 1 && dist.total === 6, String(dist.total));
  ACKS.startJourney(c, j);
  let guard = 0, walked = 0;
  while(c.journeys[0].status === 'in-transit' && guard++ < 20){
    const r = ACKS.tickJourneyDay(c, c.journeys[0], { rng:()=>0.5 });
    walked += r.record.dayRecord.hexesTraveled;
    ACKS.commitJourneyRecord(c, r.record);
  }
  check('a waypointed journey travels its WHOLE route before arriving', walked === 6 && c.journeys[0].status === 'arrived', 'walked ' + walked);
  check('…and ends at the destination', c.journeys[0].currentHexId === 'hx-d');
})();

section('§24 — mid-journey re-route (reRouteJourney)');
(function(){
  // Party reaches hx-4 on day 1, then the GM re-routes to a vertical branch. They CONTINUE from hx-4
  // (no teleport), startHexId stays the true origin, and epoch-covered resets so the new leg counts fresh.
  const c = ACKS.blankCampaign({ name:'rr' });
  c.currentTurn = 2; c.currentDayInMonth = 1; c.calendar = { year:1, month:1, day:1 }; c.houseRules = {};
  c.hexes = [];
  for(let q = 0; q <= 6; q++) c.hexes.push(ACKS.blankHex({ id:'hx-'+q, coord:{q,r:0}, terrain:'grassland' }));
  c.hexes.push(ACKS.blankHex({ id:'hx-u1', coord:{q:4,r:1}, terrain:'grassland' }));
  c.hexes.push(ACKS.blankHex({ id:'hx-u2', coord:{q:4,r:2}, terrain:'grassland' }));
  c.characters = [ ACKS.blankCharacter({ id:'chr-1', name:'Scout', currentHexId:'hx-0' }) ];
  const j = ACKS.blankJourney({ id:'jrn-1', name:'Saltspur run', participantCharacterIds:['chr-1'], startHexId:'hx-0', destinationHexId:'hx-6', supplies:{ rations:100, waterRations:100 } });
  c.journeys = [j];
  ACKS.startJourney(c, j);
  ACKS.commitJourneyRecord(c, ACKS.tickJourneyDay(c, c.journeys[0], { rng:()=>0.5 }).record); // day 1: 4 grassland hexes → hx-4
  check('precondition: party reached hx-4 (covered 4)', c.journeys[0].currentHexId === 'hx-4' && ACKS.computeJourneyDistance(c, c.journeys[0]).covered === 4, c.journeys[0].currentHexId);
  const evBefore = (c.eventLog || []).length;
  ACKS.reRouteJourney(c, j.id, { destinationHexId:'hx-u2' });
  const jj = c.journeys[0];
  check('re-route re-anchors the route to the current hex', jj.routeAnchorHexId === 'hx-4', jj.routeAnchorHexId);
  check('re-route banks the covered baseline (epoch covered resets to 0)', jj.coveredBaseline === 4 && ACKS.computeJourneyDistance(c, jj).covered === 0, jj.coveredBaseline + '/' + ACKS.computeJourneyDistance(c, jj).covered);
  check('re-route preserves startHexId as the TRUE origin', jj.startHexId === 'hx-0');
  check('re-route sets the new destination', jj.destinationHexId === 'hx-u2');
  check('re-routed journeyRoute begins at the anchor (hx-4)', ACKS.journeyRoute(c, jj)[0].hexId === 'hx-4');
  check('re-route emits a journey-rerouted event', (c.eventLog || []).length === evBefore + 1 && c.eventLog[c.eventLog.length - 1].event.kind === 'journey-rerouted');
  ACKS.commitJourneyRecord(c, ACKS.tickJourneyDay(c, c.journeys[0], { rng:()=>0.5 }).record); // continue from hx-4 → hx-u2 (dist 2)
  check('after re-route the party CONTINUES from hx-4 and reaches the new dest (no teleport)', c.journeys[0].currentHexId === 'hx-u2' && c.journeys[0].status === 'arrived', c.journeys[0].currentHexId);
})();
(function(){
  // Editing a NOT-yet-started journey just sets the fields — no re-anchor.
  const c = ACKS.blankCampaign({ name:'plan' }); c.houseRules = {};
  c.hexes = [ ACKS.blankHex({ id:'a', coord:{q:0,r:0} }), ACKS.blankHex({ id:'b', coord:{q:3,r:0} }), ACKS.blankHex({ id:'w', coord:{q:1,r:0} }) ];
  c.characters = [ ACKS.blankCharacter({ id:'chr-1' }) ];
  const j = ACKS.blankJourney({ id:'jrn-1', startHexId:'a', destinationHexId:'b', participantCharacterIds:['chr-1'] }); // status 'planning'
  c.journeys = [j];
  ACKS.reRouteJourney(c, j.id, { waypointIds:['w'], destinationHexId:'b' });
  check('planning-status edit sets waypoints without re-anchoring', j.waypoints.length === 1 && j.waypoints[0].hexId === 'w' && j.routeAnchorHexId === null && j.coveredBaseline === 0);
})();

section('§26 — GM speed override (speedOverrideMilesPerDay)');
(function(){
  const PASS = () => 0.95; // roll ~19: clears nav, skips wandering encounters
  check('blankJourney: speedOverrideMilesPerDay defaults to null', ACKS.blankJourney({}).speedOverrideMilesPerDay === null);

  // baseline (no override): grassland + normal pace = 4 hexes/day (24-mi budget ÷ 6-mi hexes)
  const base = lineCampaign(10); ACKS.startJourney(base.c, base.j);
  const dBase = ACKS.tickJourneyDay(base.c, base.c.journeys[0], { rng:PASS, weather:{condition:'fair',temperature:'moderate'} });
  check('baseline grassland/normal = 4 hexes (24 mi/day)', dBase.record.dayRecord.hexesTraveled === 4, String(dBase.record.dayRecord.hexesTraveled));
  check('baseline day record carries no override (null)', dBase.record.dayRecord.speedOverrideMilesPerDay === null);

  // override is a base RATE — PACE STILL MULTIPLIES it (§26 revised): override 36 × half-speed ×0.5 = 18 mi → 3 hexes
  const ovp = lineCampaign(10); ACKS.startJourney(ovp.c, ovp.j);
  ovp.c.journeys[0].pace = 'half-speed'; ovp.c.journeys[0].speedOverrideMilesPerDay = 36;
  const dOvp = ACKS.tickJourneyDay(ovp.c, ovp.c.journeys[0], { rng:PASS, weather:{condition:'fair',temperature:'moderate'} });
  check('override 36 × half-speed pace = 18 mi → 3 hexes (pace multiplies the override)', dOvp.record.dayRecord.hexesTraveled === 3, String(dOvp.record.dayRecord.hexesTraveled));
  check('day record stamps the override value (36)', dOvp.record.dayRecord.speedOverrideMilesPerDay === 36);

  // override is a base RATE — WEATHER STILL MULTIPLIES it: override 24 × foggy ×½ = 12 mi → 2 hexes
  const ovw = lineCampaign(10); ACKS.startJourney(ovw.c, ovw.j);
  ovw.c.journeys[0].speedOverrideMilesPerDay = 24;
  const dOvw = ACKS.tickJourneyDay(ovw.c, ovw.c.journeys[0], { rng:PASS, weather:{condition:'foggy',temperature:'moderate'} });
  check('override 24 × foggy ×½ = 12 mi → 2 hexes (weather multiplies the override)', dOvw.record.dayRecord.hexesTraveled === 2, String(dOvw.record.dayRecord.hexesTraveled));

  // terrain STILL applies per hex: jungle ×½, override 48 → 4 hexes (grassland 48 would be 8)
  const ovt = lineCampaign(10, () => ({ terrain:'jungle' })); ACKS.startJourney(ovt.c, ovt.j);
  ovt.c.journeys[0].speedOverrideMilesPerDay = 48;
  const dOvt = ACKS.tickJourneyDay(ovt.c, ovt.c.journeys[0], { rng:PASS, weather:{condition:'fair',temperature:'moderate'} });
  check('override 48 through jungle ×½ → 4 hexes (per-hex terrain still applies, §24)', dOvt.record.dayRecord.hexesTraveled === 4, String(dOvt.record.dayRecord.hexesTraveled));

  // pace STILL drives fatigue: forced-march + override → fatigue jumps to the cycle cap (RR p.279)
  const ovf = lineCampaign(10); ACKS.startJourney(ovf.c, ovf.j);
  ovf.c.journeys[0].pace = 'forced-march'; ovf.c.journeys[0].speedOverrideMilesPerDay = 18;
  const dOvf = ACKS.tickJourneyDay(ovf.c, ovf.c.journeys[0], { rng:PASS, weather:{condition:'fair',temperature:'moderate'} });
  check('forced-march pace + override still fatigues at once (newFatigueDays = 6)', dOvf.record.newFatigueDays === 6, String(dOvf.record.newFatigueDays));

  // a zero / non-positive override is ignored — pace governs
  const ovz = lineCampaign(10); ACKS.startJourney(ovz.c, ovz.j);
  ovz.c.journeys[0].speedOverrideMilesPerDay = 0;
  const dOvz = ACKS.tickJourneyDay(ovz.c, ovz.c.journeys[0], { rng:PASS, weather:{condition:'fair',temperature:'moderate'} });
  check('override 0 ignored → normal 4 hexes, day record override null', dOvz.record.dayRecord.hexesTraveled === 4 && dOvz.record.dayRecord.speedOverrideMilesPerDay === null);

  // lazy migration backfills the field on a legacy journey
  const cm = ACKS.blankCampaign({ name:'legacy' });
  const legacy = ACKS.blankJourney({ id:'jrn-x', participantCharacterIds:[] }); delete legacy.speedOverrideMilesPerDay;
  cm.journeys = [legacy];
  ACKS.migrateCampaign(cm);
  check('migrateCampaign backfills speedOverrideMilesPerDay = null on legacy journeys', cm.journeys[0].speedOverrideMilesPerDay === null);
})();

section('Current speed = slowest member (RR pp.83-84)');
(function(){
  const PASS = () => 0.95;
  // unencumbered party → 24 mi/day (= the flat base)
  const u = lineCampaign(10); ACKS.startJourney(u.c, u.j);
  check('journeyBaseSpeedMilesPerDay: unencumbered party = 24', ACKS.journeyBaseSpeedMilesPerDay(u.c, u.c.journeys[0]) === 24);

  // one heavily-loaded member (9 st → heavy band → 12 mi/day) slows the whole party
  const h = lineCampaign(10);
  h.c.characters[0].inventory = [{ name:'lead bars', encumbranceSt: 9 }];
  ACKS.startJourney(h.c, h.j);
  check('heavily-loaded member → base 12 mi/day', ACKS.journeyBaseSpeedMilesPerDay(h.c, h.c.journeys[0]) === 12);
  const dh = ACKS.tickJourneyDay(h.c, h.c.journeys[0], { rng:PASS, weather:{condition:'fair',temperature:'moderate'} });
  check('heavily-loaded party travels 2 hexes/day (12 mi ÷ 6)', dh.record.dayRecord.hexesTraveled === 2, String(dh.record.dayRecord.hexesTraveled));

  // slowest-of-two: a heavy member + an unencumbered one → the party is bounded by the heavy one (12)
  const s = lineCampaign(10);
  s.c.characters[0].inventory = [{ name:'lead', encumbranceSt: 9 }];
  s.c.characters.push(ACKS.blankCharacter({ id:'chr-2', name:'Light' }));
  s.c.journeys[0].participantCharacterIds = ['chr-1','chr-2'];
  ACKS.startJourney(s.c, s.j);
  check('slowest member governs (heavy 12 vs light 24 → 12)', ACKS.journeyBaseSpeedMilesPerDay(s.c, s.c.journeys[0]) === 12);

  // no participant characters → the flat base (24)
  const n0 = lineCampaign(10); n0.c.journeys[0].participantCharacterIds = [];
  check('no participants → flat base 24', ACKS.journeyBaseSpeedMilesPerDay(n0.c, n0.c.journeys[0]) === 24);

  // override REPLACES the base but PACE STILL MULTIPLIES: heavy party + override 24 + forced-march ×1.5 = 36 mi → 6 hexes
  const o = lineCampaign(10);
  o.c.characters[0].inventory = [{ name:'lead', encumbranceSt: 9 }];
  ACKS.startJourney(o.c, o.j);
  o.c.journeys[0].pace = 'forced-march'; o.c.journeys[0].speedOverrideMilesPerDay = 24;
  const dO = ACKS.tickJourneyDay(o.c, o.c.journeys[0], { rng:PASS, weather:{condition:'fair',temperature:'moderate'} });
  check('override 24 × forced-march ×1.5 = 36 mi → 6 hexes (override is the base; pace multiplies)', dO.record.dayRecord.hexesTraveled === 6, String(dO.record.dayRecord.hexesTraveled));
})();

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
