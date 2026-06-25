// =============================================================================
// incursion-awareness.smoke.js — D4 Awareness (2026-06-25): the ruler's reconnaissance
// is RE-CHECKED over time, so a band that beat the arrival recon is not invisible forever.
//
//   node tests/incursion-awareness.smoke.js   (or via `npm test`)
//
// RAW (JJ p.103): "a domain ruler may not be aware of a domain encounter until the enemy
// begins pillaging his domain or arrives at his stronghold," with reconnaissance rolls per
// RR p.452 (weekly on campaign, shifting to daily as forces close). The slot-87 consumer
// (proposeIncursionReconDay / commitIncursionReconRecord) re-evaluates rulerAware each day
// for an as-yet-undetected band:
//   • AUTO-DETECT (no roll) — at the STRONGHOLD (any attitude), or PILLAGING (a hostile/
//     unfriendly band ON a settlement hex). A band merely lingering in the wild does NOT
//     auto-reveal (RAW lets monsters settle while the ruler stays oblivious).
//   • RECON RE-ROLL — else re-roll the ruler's recon WEEKLY, or DAILY within 1 hex of any
//     of the domain's settlements. A marginal/success/major detects the band.
// On detection in an auto-defending domain the garrison sorties the SAME tick (the arrival
// path's autoDeployGarrisonReaction). Tested in isolation via direct propose→commit so the
// recon logic is deterministic (the slot-86 incursion draw stays out of it).
// =============================================================================
'use strict';
const path = require('path');
const DIR = path.join(__dirname, '..');
global.window = global;
[
  'acks-engine-catalogs.js', 'acks-engine-monsters.js', 'acks-engine-encounter-tables.js', 'acks-engine-troops.js',
  'acks-engine.js', 'acks-engine-lairs.js', 'acks-engine-stash.js', 'acks-engine-military.js', 'acks-engine-entities.js', 'acks-engine-economy.js',
  'acks-engine-entity-registry.js', 'acks-engine-field-schemas.js', 'acks-engine-events.js', 'acks-engine-battles.js', 'acks-engine-maneuvers.js', 'acks-engine-subsystems.js'
].forEach(f => require(path.join(DIR, f)));
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(label + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('— ' + t); }

// A realm with two settlements (the seat is the stronghold — most families) + wilderness in
// the same domain. vagaries-of-incursion ON (the slot-87 consumer gates on it); persistent-
// wandering OFF so nothing moves the band behind the test. The band arrives UNDETECTED
// (rulerAware:false); o.bandHex places it, o.attitude sets its reaction, o.lastReconOrd seeds
// the weekly cadence (default = arrival day, turn 3 / day 1 = ordinal 91). A light-infantry
// ×120 garrison (platoon BR 4.8) decisively outmatches an orc ×8 (0.25) for the auto-deploy.
function mk(o){
  o = o || {};
  const c = { currentTurn: 3, currentDayInMonth: 1, eventLog: [],
    houseRules: { 'persistent-wandering-monsters': { enabled: false }, 'vagaries-of-incursion': { enabled: true } },
    characters: [{ schemaVersion: 2, id: 'chr-cap', name: 'Captain Vael', alive: true, currentHexId: 'hex-seat', class: 'Fighter', level: 9, abilities: { STR: 13, INT: 10, WIL: 10, DEX: 12, CON: 12, CHA: 13 } }],
    domains: [{ id: 'dom-r', name: 'March', rulerCharacterId: 'chr-cap', classification: 'civilized', type: 'march',
                autoResolveIncursions: o.auto !== false, garrison: { units: [] }, demographics: { peasantFamilies: 1000, morale: 0 } }],
    journeys: [], armies: [], units: [], battles: [], groups: [], lairs: [],
    settlements: [
      { schemaVersion: 2, id: 'set-seat', name: 'Seat', hexId: 'hex-seat', domainId: 'dom-r', families: 800 },
      { schemaVersion: 2, id: 'set-town', name: 'Town', hexId: 'hex-town', domainId: 'dom-r', families: 200 }
    ],
    hexes: [{ id: 'hex-seat', domainId: 'dom-r', coord: { q: 0, r: 0 }, terrain: 'grassland' },
            { id: 'hex-town', domainId: 'dom-r', coord: { q: 1, r: 0 }, terrain: 'grassland' },
            { id: 'hex-wild', domainId: 'dom-r', coord: { q: 2, r: 0 }, terrain: 'grassland' },   // 1 hex from hex-town
            { id: 'hex-far',  domainId: 'dom-r', coord: { q: 9, r: 0 }, terrain: 'grassland' }] };  // far from any settlement
  const gu = (o.garrisonUnits != null) ? o.garrisonUnits : 1;
  for(let i = 0; i < gu; i++){
    ACKS.stationUnit(c, ACKS.blankUnit({ id: 'unit-g' + i, displayName: 'Foot ' + i, unitTypeKey: 'light-infantry',
      count: (o.garrisonCount != null) ? o.garrisonCount : 120, ownerDomainId: 'dom-r' }), { kind: 'domain-garrison', id: 'dom-r' });
  }
  const b = ACKS.blankGroup({ id: 'grp-threat', name: 'Orc raiders',
    groupTemplate: { monsterCatalogKey: 'orc', creatureTypes: ['beastman', 'humanoid'], hitDice: '1' },
    count: (o.count != null) ? o.count : 8, currentHexId: (o.bandHex || 'hex-wild'), currentDomainId: 'dom-r', lifecycleState: 'wild' });
  b.incursion = { domainId: 'dom-r', attitude: o.attitude || 'neutral', disposition: 'lingering',
    fullStrength: false, treasureType: '', rulerAware: false, monstersIntel: false,
    arrivedAtTurn: 3, arrivedOnDay: 1, lastReconOrd: (o.lastReconOrd != null ? o.lastReconOrd : (3 * 30 + 1)) };
  b.wanderState = { coord: null, lastCoord: null, mileRemainder: 0, mode: null, destLairId: null, dissolveOnArrival: false, lastDomainId: 'dom-r', halted: true };
  c.groups.push(b);
  return c;
}
const band = (c) => c.groups.find(g => g && g.id === 'grp-threat');
// One day of the recon re-check, in isolation (direct propose → commit).
const recon = (c, dim) => { const p = ACKS.proposeIncursionReconDay(c, { dayInMonth: dim }); (p.pendingRecords || []).forEach(r => ACKS.commitIncursionReconRecord(c, r)); return p; };
const rxnArmies = (c) => (c.armies || []).filter(a => a && a.reactionTargetGroupId === 'grp-threat');

// ─────────────────────────────────────────────────────────────────────────────
section('registration — the slot-87 reconnaissance consumer, between incursions (86) and military (88)');
const order = ACKS.dayConsumersInOrder().map(c => c.name + ':' + c.order);
ok('incursion-recon registered at order 87', ACKS.dayConsumersInOrder().some(c => c.name === 'incursion-recon' && c.order === 87));
ok('it sits after incursions (86) and before military (88)',
   order.indexOf('incursions:86') >= 0 && order.indexOf('incursion-recon:87') === order.indexOf('incursions:86') + 1 && order.indexOf('military:88') === order.indexOf('incursion-recon:87') + 1);
ok('proposeIncursionReconDay + commitIncursionReconRecord are exported', typeof ACKS.proposeIncursionReconDay === 'function' && typeof ACKS.commitIncursionReconRecord === 'function');

section('auto-detect at the stronghold (JJ p.103 — "arrives at his stronghold"), ANY attitude');
const c1 = mk({ bandHex: 'hex-seat', attitude: 'neutral' });
const p1 = recon(c1, 2);
ok('a NEUTRAL band standing at the stronghold is auto-detected', band(c1).incursion.rulerAware === true);
ok('the trigger is "stronghold" (not a recon roll)', (p1.pendingRecords[0] || {}).trigger === 'stronghold');
ok('lastReconOrd advanced to the check day', band(c1).incursion.lastReconOrd === 3 * 30 + 2);
ok('the band history records the ruler becoming aware', (band(c1).history || []).some(h => /became AWARE/.test(h.reason || '')));

section('auto-detect while pillaging (JJ p.103 — "begins pillaging / loots supplies") — hostile/unfriendly on a settlement');
const c2h = mk({ bandHex: 'hex-town', attitude: 'hostile' });
const p2h = recon(c2h, 2);
ok('a HOSTILE band ON a (non-stronghold) settlement hex is auto-detected', band(c2h).incursion.rulerAware === true);
ok('the trigger is "pillage"', (p2h.pendingRecords[0] || {}).trigger === 'pillage');
const c2u = mk({ bandHex: 'hex-town', attitude: 'unfriendly' });
recon(c2u, 2);
ok('an UNFRIENDLY band looting a settlement is auto-detected', band(c2u).incursion.rulerAware === true);
// a NEUTRAL band on the same settlement hex is NOT treated as pillaging — it falls to the recon roll
const c2n = mk({ bandHex: 'hex-town', attitude: 'neutral' });
const p2n = ACKS.proposeIncursionReconDay(c2n, { dayInMonth: 2 });
ok('a NEUTRAL band on a settlement is NOT pillage-detected (falls to a recon roll)', (p2n.pendingRecords[0] || {}).trigger === 'recon');

section('a band lingering in the deep wild is NOT auto-revealed (RAW: monsters settle while the ruler stays unaware)');
const c3 = mk({ bandHex: 'hex-far', attitude: 'hostile', lastReconOrd: 3 * 30 + 1 });   // hostile, but far from any settlement, recon not yet due
const p3 = recon(c3, 2);                                                                 // day 2: 92 − 91 = 1 < 7, not near a settlement
ok('a hostile band far in the wilds is not auto-detected on arrival day+1', band(c3).incursion.rulerAware === false);
ok('and no recon record is produced (weekly not due, not near a settlement)', p3.pendingRecords.length === 0);

section('the RR p.452 recon cadence — weekly by default');
const c4 = mk({ bandHex: 'hex-far', attitude: 'neutral', lastReconOrd: 3 * 30 + 1 });
ok('not due 1 day after the last check → no record', ACKS.proposeIncursionReconDay(c4, { dayInMonth: 2 }).pendingRecords.length === 0);
const p4 = recon(c4, 8);                                                                 // day 8: 98 − 91 = 7 ≥ 7 → due
ok('due at 7 days → a recon-roll record (trigger "recon")', p4.pendingRecords.length === 1 && p4.pendingRecords[0].trigger === 'recon');
ok('lastReconOrd advances to the check day even if the roll missed', band(c4).incursion.lastReconOrd === 3 * 30 + 8);

section('the RR p.452 recon cadence — DAILY within 1 hex of a settlement, and it eventually detects');
const c5 = mk({ bandHex: 'hex-wild', attitude: 'neutral', lastReconOrd: 3 * 30 + 1 });   // hex-wild is 1 hex from hex-town
ok('within 1 hex of a settlement → due the very next day (daily, not weekly)', ACKS.proposeIncursionReconDay(c5, { dayInMonth: 2 }).pendingRecords.length === 1);
let detectedDay = null;
for(let dim = 2; dim <= 30 && detectedDay === null; dim++){ recon(c5, dim); if(band(c5).incursion.rulerAware === true) detectedDay = dim; }
ok('daily reconnaissance detects the band within the month', detectedDay !== null, 'detectedDay=' + detectedDay);
ok('once aware, the band is no longer re-checked', ACKS.proposeIncursionReconDay(c5, { dayInMonth: 30 }).pendingRecords.length === 0);

section('detection surfaces a notable for the day’s review (gm-narrative — no new event kind)');
const c6 = mk({ bandHex: 'hex-seat', attitude: 'neutral' });
const p6 = ACKS.proposeIncursionReconDay(c6, { dayInMonth: 2 });
ok('a gm-narrative "incursion-detected" notable is emitted', (p6.notableEvents || []).some(e => e.kind === 'gm-narrative' && e.type === 'incursion-detected'));
ok('the notable names the detection in its label', (p6.notableEvents || []).some(e => /reconnaissance detects/.test(e.label || '') && /the stronghold/.test(e.label || '')));

section('SAME-DAY garrison response — an auto-defending domain sorties the tick it detects the band');
const c7 = mk({ bandHex: 'hex-seat', attitude: 'unfriendly', garrisonCount: 120, auto: true });
recon(c7, 2);
ok('detection flips awareness', band(c7).incursion.rulerAware === true);
ok('a reaction force is auto-deployed the same tick (autoReaction)', rxnArmies(c7).length === 1 && rxnArmies(c7)[0].autoReaction === true);
ok('it musters first (the 1-day sortie muster)', rxnArmies(c7)[0].sortieMustering === true);

section('a non-auto-defending domain DETECTS but never auto-deploys (the GM deploys by hand)');
const c8 = mk({ bandHex: 'hex-seat', attitude: 'unfriendly', auto: false });
recon(c8, 2);
ok('the ruler still becomes aware', band(c8).incursion.rulerAware === true);
ok('no reaction force is deployed', rxnArmies(c8).length === 0);

section('robustness — replay, already-aware, rule-OFF, wandered-clear-away');
const c9 = mk({ bandHex: 'hex-seat', attitude: 'unfriendly', auto: true });
const r9 = ACKS.proposeIncursionReconDay(c9, { dayInMonth: 2 }).pendingRecords[0];
ACKS.commitIncursionReconRecord(c9, r9); ACKS.commitIncursionReconRecord(c9, r9);        // replay the same record
ok('replaying a detection commit is idempotent (one reaction force only)', rxnArmies(c9).length === 1);
const cA = mk({ bandHex: 'hex-seat' }); band(cA).incursion.rulerAware = true;
ok('an already-aware band produces no recon record', ACKS.proposeIncursionReconDay(cA, { dayInMonth: 2 }).pendingRecords.length === 0);
const cOff = mk({ bandHex: 'hex-seat' }); cOff.houseRules['vagaries-of-incursion'] = { enabled: false };
ok('rule OFF → the recon re-check is dormant', ACKS.proposeIncursionReconDay(cOff, { dayInMonth: 2 }).pendingRecords.length === 0);
const cGone = mk({ attitude: 'hostile', lastReconOrd: 3 * 30 + 1 });
const bg = band(cGone); bg.currentHexId = null; bg.wanderState = { coord: { q: 40, r: 40 }, halted: false };   // wandered far off the mapped hexes
ok('a band that wandered clear of the domain is not re-checked', ACKS.proposeIncursionReconDay(cGone, { dayInMonth: 8 }).pendingRecords.length === 0);

section('wired into the day-tick pipeline (a full forced tick detects the at-stronghold band)');
const cP = mk({ bandHex: 'hex-seat', attitude: 'unfriendly', auto: false });             // auto off → no deploy noise from the tick
ACKS.commitDayTick(cP, ACKS.proposeDayTick(cP, 1, { force: true }));
ok('the slot-87 consumer runs in proposeDayTick/commitDayTick (band at stronghold → aware)', band(cP).incursion.rulerAware === true);

// ─────────────────────────────────────────────────────────────────────────────
console.log('=============================================');
if(fail === 0) console.log('PASS — ' + pass + ' passed, 0 failed');
else { console.log('FAIL — ' + pass + ' passed, ' + fail + ' failed'); failures.forEach(f => console.log('   ✗ ' + f)); process.exit(1); }
