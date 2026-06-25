/* tests/fog-of-war.smoke.js — B3 (audit 2026-06-24): fog-of-war from travel.
 *
 *   node tests/fog-of-war.smoke.js   (or via `npm test`)
 *
 * (a) Travel reveals the map: a journey entering a hex flips hex.explored false→true and emits a
 *     hex-discovered event.
 * (b) The player view ships only the DISCOVERED map: _publicWorld filters world.hexes to
 *     explored !== false, and hides settlements / lairs floating on a fogged hex.
 * (c) Back-compat: with nothing marked explored:false, NOTHING is hidden (the prior behaviour).
 */
'use strict';
const ACKS = require('./_engine.js').load();

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('\n— ' + t); }

// =============================================================================
section('the hex-discovered event kind is registered (engine-emitted, wizard-opt-out)');
ok('hex-discovered is a known kind', ACKS.EVENT_KINDS.includes('hex-discovered'));
ok('hex-discovered has a schema (requires hexIds)', !!(ACKS.EVENT_SCHEMAS['hex-discovered'] && ACKS.EVENT_SCHEMAS['hex-discovered'].R.hexIds));
ok('hex-discovered is opted out of the Event Wizard', ACKS.EVENT_WIZARD_OPTOUT.has('hex-discovered'));

// =============================================================================
section('player view ships only the DISCOVERED map (hexes + dependent settlements/lairs)');
{
  const c = ACKS.blankCampaign({ name: 'fog' });
  c.hexes = [
    ACKS.blankHex({ id: 'hex-seen', coord: { q: 0, r: 0 }, terrain: 'grassland' }),   // explored default true
    ACKS.blankHex({ id: 'hex-fog',  coord: { q: 5, r: 5 }, terrain: 'forest' })
  ];
  c.hexes[1].explored = false;                                                        // a fogged hex
  c.settlements = [
    ACKS.blankSettlement({ id: 'set-seen', hexId: 'hex-seen', name: 'Town' }),
    ACKS.blankSettlement({ id: 'set-fog',  hexId: 'hex-fog',  name: 'Hidden Hamlet' })
  ];
  c.lairs = [
    { schemaVersion: 2, id: 'lai-seen',  hexId: 'hex-seen', knownToPlayers: true },
    { schemaVersion: 2, id: 'lai-fog',   hexId: 'hex-fog',  knownToPlayers: true },   // known but on a fogged hex
    { schemaVersion: 2, id: 'lai-secret', hexId: 'hex-seen', knownToPlayers: false }
  ];
  const pub = ACKS.projectCampaignForPlayer(c, null);
  const hexIds = pub.hexes.map(h => h.id);
  ok('the explored hex ships', hexIds.includes('hex-seen'));
  ok('the fogged hex is withheld (no map leak)', !hexIds.includes('hex-fog'));
  const setIds = pub.settlements.map(s => s.id);
  ok('a settlement on an explored hex ships', setIds.includes('set-seen'));
  ok('a settlement floating on a fogged hex is hidden', !setIds.includes('set-fog'));
  const lairIds = pub.lairs.map(l => l.id);
  ok('a known lair on an explored hex ships', lairIds.includes('lai-seen'));
  ok('a known lair on a fogged hex is hidden (knownToPlayers reconciled with explored)', !lairIds.includes('lai-fog'));
  ok('an unknown lair stays hidden regardless', !lairIds.includes('lai-secret'));
}

// =============================================================================
section('back-compat — with nothing fogged, every hex ships');
{
  const c = ACKS.blankCampaign({ name: 'nofog' });
  c.hexes = [
    ACKS.blankHex({ id: 'h1', coord: { q: 0, r: 0 }, terrain: 'grassland' }),
    ACKS.blankHex({ id: 'h2', coord: { q: 1, r: 0 }, terrain: 'grassland' })
  ];
  const pub = ACKS.projectCampaignForPlayer(c, null);
  ok('all hexes ship when none is explored:false', pub.hexes.length === 2);
}

// =============================================================================
section('travel reveals a hex — journey entering a fogged hex flips explored + emits hex-discovered');
{
  const c = ACKS.blankCampaign({ name: 'travel' });
  c.currentTurn = 1; c.currentDayInMonth = 1;
  c.calendar = { year: 1, month: 1, day: 1 };
  c.hexes = [
    ACKS.blankHex({ id: 'hex-a', coord: { q: 0, r: 0 }, terrain: 'grassland', hasRoad: true }),   // start
    ACKS.blankHex({ id: 'hex-b', coord: { q: 3, r: 0 }, terrain: 'grassland', hasRoad: true })    // destination — fog it
  ];
  c.hexes[1].explored = false;
  c.characters = [ ACKS.blankCharacter({ id: 'chr-1', name: 'Scout' }) ];
  c.journeys = [ ACKS.blankJourney({
    id: 'jrn-1', name: 'Scouting Run', participantCharacterIds: ['chr-1'],
    startHexId: 'hex-a', destinationHexId: 'hex-b', mode: 'foot',
    supplies: { rations: 12, waterRations: 12, animalFeed: 0, animalWater: 0, shipStores: 0 }
  }) ];
  c.houseRules = { 'auto-pause-on-encounter': false, 'auto-pause-on-navigation-fail': false, 'auto-pause-on-supplies-low': false };

  ACKS.startJourney(c, c.journeys[0]);   // resolves day 1
  for(let i = 0; i < 6 && c.journeys[0].status === 'in-transit'; i++) ACKS.advanceJourneyOneDay(c, c.journeys[0]);

  const hexB = c.hexes.find(h => h.id === 'hex-b');
  ok('the party reached / passed the destination hex', c.journeys[0].currentHexId === 'hex-b' || c.journeys[0].status === 'arrived');
  ok('the entered fogged hex flipped to explored', hexB.explored === true);
  ok('it stamped firstExploredTurn', typeof hexB.firstExploredTurn === 'number');
  ok('a hex-discovered event was emitted naming hex-b',
    c.eventLog.some(e => (e.event || e).kind === 'hex-discovered' && ((e.event || e).payload.hexIds || []).includes('hex-b')));
}

// =============================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — fog-of-war.smoke.js: ' + pass + ' passed, ' + fail + ' failed.');
if (fail) { console.log('  failing: ' + failures.join(' · ')); process.exit(1); }
