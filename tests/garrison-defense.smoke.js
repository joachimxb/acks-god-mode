// =============================================================================
// garrison-defense.smoke.js — D4 (2026-06-25): garrison auto-defense of low-threat
// incursions (the 2026-06-24 audit's solo-sim finding — an autonomous run must DRAIN
// the incursion queue, not grow it).
//
//   node tests/garrison-defense.smoke.js   (or via `npm test`)
//
// The opt-in (domain.autoResolveIncursions — the ⚔ Active Threats checkbox) lets a
// domain's garrison clear DECISIVELY-outmatched (platoon BR ≥ 2×) incursion bands on its
// own, via the slot-89 day consumer, WITHOUT a GM-deployed reaction army. Verifies:
//   - the 2× gate (a 1×–2× edge still pauses for the GM); the toggle gates everything
//   - the proportional garrison casualties (a tooling extension; ≤5% at the margin)
//   - the band is cleared (the JJ p.104 drive-off) + a domain-warfare event is logged
//   - skips: GM-priced (a dragon, no BR), settled (laired), already-deployed-against
//   - the headline: a force advance drains a domain full of low-threat bands to zero
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

// A threatened realm: a seat hex + the hex a band stands on, both in dom-r; vagaries +
// persistent-wandering OFF so nothing mints/moves bands behind the test (only the garrison
// acts). light-infantry ×120 platoon BR = 4.8; orc ×8 = 0.25. autoResolveIncursions defaults
// ON in the fixture (o.auto:false turns it off). o.bandIds plants several standing bands.
function mk(o){
  o = o || {};
  const c = { currentTurn: 3, currentDayInMonth: 1, eventLog: [],
    houseRules: { 'persistent-wandering-monsters': { enabled: false }, 'vagaries-of-incursion': { enabled: false } },
    characters: [{ schemaVersion: 2, id: 'chr-cap', name: 'Captain Vael', alive: true, currentHexId: 'hex-seat', class: 'Fighter', level: 9, abilities: { STR: 13, INT: 10, WIL: 10, DEX: 12, CON: 12, CHA: 13 } }],
    domains: [{ id: 'dom-r', name: 'March', rulerCharacterId: 'chr-cap', autoResolveIncursions: o.auto !== false, garrison: { units: [] }, demographics: { peasantFamilies: 500, morale: (o.morale != null ? o.morale : 0) } }],
    journeys: [], armies: [], units: [], battles: [], groups: [], lairs: [],
    hexes: [{ id: 'hex-seat', domainId: 'dom-r', coord: { q: 0, r: 0 }, terrain: 'grassland' },
            { id: 'hex-band', domainId: 'dom-r', coord: { q: 1, r: 0 }, terrain: 'hills' }] };
  const n = (o.garrisonUnits != null) ? o.garrisonUnits : 1;
  for(let i = 0; i < n; i++){
    ACKS.stationUnit(c, ACKS.blankUnit({ id: 'unit-g' + i, displayName: 'Foot ' + i, unitTypeKey: 'light-infantry',
      count: (o.garrisonCount != null) ? o.garrisonCount : 120, ownerDomainId: 'dom-r' }), { kind: 'domain-garrison', id: 'dom-r' });
  }
  const ids = o.bandIds || ['grp-threat'];
  for(const id of ids){
    const band = ACKS.blankGroup({ id, name: 'Orc raiders',
      groupTemplate: { monsterCatalogKey: (o.catalogKey !== undefined ? o.catalogKey : 'orc'), creatureTypes: ['beastman', 'humanoid'], hitDice: '1' },
      count: (o.count != null) ? o.count : 8, currentHexId: 'hex-band', currentDomainId: 'dom-r', lifecycleState: 'wild' });
    band.incursion = { domainId: 'dom-r', attitude: o.attitude || 'unfriendly', disposition: 'lingering',
      fullStrength: false, treasureType: '', rulerAware: true, monstersIntel: false, arrivedAtTurn: 3 };
    band.wanderState = { coord: null, lastCoord: null, mileRemainder: 0, mode: null, destLairId: null, dissolveOnArrival: false, lastDomainId: 'dom-r', halted: true };
    c.groups.push(band);
  }
  return c;
}
const recOf = prop => (prop.pendingRecords || []).find(r => r.kind === 'garrison-defense');
const hasRec = prop => (prop.pendingRecords || []).some(r => r.kind === 'garrison-defense');

// ─────────────────────────────────────────────────────────────────────────────
section('decisive auto-resolve (force 4.8 vs band 0.25 = 19×) — toggle ON');
const c1 = mk({ count: 8, garrisonCount: 120 });
const prop1 = ACKS.proposeDayTick(c1, {});
const rec1 = recOf(prop1);
ok('proposes a garrison-defense record', !!rec1 && rec1.groupId === 'grp-threat' && rec1.domainId === 'dom-r', JSON.stringify(rec1));
ok('the record is tagged to the slot-89 consumer', rec1 && rec1.consumer === 'garrison-defense');
ok('the record carries the BR comparison (force 4.8 vs band 0.25)', rec1 && Math.abs(rec1.forceBr - 4.8) < 0.001 && Math.abs(rec1.bandBr - 0.25) < 0.001);
ok('a domain-warfare/garrison-defense notable is emitted, NO pause', (prop1.notableEvents || []).some(e => e.kind === 'domain-warfare' && e.payload && e.payload.action === 'garrison-defense' && !e.pauseTrigger));
ACKS.commitDayTick(c1, prop1);
ok('committed: the band no longer stands in the domain (queue drained)', ACKS.incursionBandsForDomain(c1, 'dom-r').length === 0);
const band1 = c1.groups.find(g => g && g.id === 'grp-threat');
ok('committed: band repelled — currentHexId null, outcome driven-off', band1 && band1.currentHexId === null && band1.wanderState === null && band1.incursion.outcome === 'driven-off');
ok('committed: a domain-warfare event was logged (action garrison-defense)', (c1.eventLog || []).some(e => e && e.event && e.event.kind === 'domain-warfare' && e.event.payload && e.event.payload.action === 'garrison-defense'));
const u1 = ACKS.findUnit(c1, 'unit-g0');
ok('committed: light garrison casualties applied (≈1 of 120)', u1 && u1.casualties >= 1 && u1.casualties <= 3, 'casualties=' + (u1 && u1.casualties));
ok('committed: a unit history line records the loss', u1 && (u1.history || []).some(h => h.type === 'garrison-defense'));

section('the toggle gates the behavior');
const c2 = mk({ count: 8, auto: false });
ok('toggle OFF → NO garrison-defense record (default behavior unchanged)', !hasRec(ACKS.proposeDayTick(c2, {})));
const c2b = mk({ count: 8, garrisonUnits: 0 });
ok('no garrison (no units) → nothing sallies', !hasRec(ACKS.proposeDayTick(c2b, {})));

section('the 2× gate — a 1×–2× edge stays the GM’s call');
const c3 = mk({ count: 90, garrisonCount: 120 });
const prev3 = ACKS.garrisonReactionPreview(c3, 'grp-threat', ['unit-g0']);
ok('fixture: a near-match band (force > band, but force < 2× band)', prev3.bandBr > prev3.forceBr / 2 && prev3.bandBr < prev3.forceBr, 'force=' + prev3.forceBr + ' band=' + prev3.bandBr);
ok('a 1×–2× margin does NOT auto-resolve (left for the GM)', !hasRec(ACKS.proposeDayTick(c3, {})));

section('hostile but decisively-outmatched → repelled (the gate subsumes attitude)');
const c4 = mk({ count: 8, attitude: 'hostile', garrisonCount: 120 });
const rec4 = recOf(ACKS.proposeDayTick(c4, {}));
ok('a weak hostile band auto-resolves (BR ≥ 2×), labelled "repels"', !!rec4 && rec4.effectiveAttitude === 'hostile' && /repels/.test(rec4.label), rec4 && rec4.label);

section('never auto-resolves what the garrison cannot cleanly price/handle');
const c5 = mk({ count: 8, catalogKey: '__nope__' });
ok('a GM-priced band (no catalog BR — a dragon) is never auto-resolved', !hasRec(ACKS.proposeDayTick(c5, {})));
const c6 = mk({ count: 8, garrisonCount: 120 });
c6.lairs = [{ id: 'lair-x', hexId: 'hex-band', groupIds: ['grp-threat'], status: 'active' }];
ok('a settled band (housed in a lair) is NOT auto-attacked', !hasRec(ACKS.proposeDayTick(c6, {})));
const c7 = mk({ count: 8, garrisonCount: 120 });
c7.armies = [{ id: 'arm-x', name: 'Sally', reactionTargetGroupId: 'grp-threat' }];
ok('a band a deployed reaction force already targets is left to the slot-88 path', !hasRec(ACKS.proposeDayTick(c7, {})));

section('proportional casualties — a closer fight costs the garrison more');
const cClose = mk({ count: 50, garrisonCount: 120 });
const recClose = recOf(ACKS.proposeDayTick(cClose, {}));
const prevClose = ACKS.garrisonReactionPreview(cClose, 'grp-threat', ['unit-g0']);
ok('fixture: the closer band is still decisive (≥ 2×)', prevClose.forceBr >= 2 * prevClose.bandBr, 'force=' + prevClose.forceBr + ' band=' + prevClose.bandBr);
ok('a closer fight costs ≥ the overwhelming one (and the cap holds at ≤5%)', recClose && rec1 && recClose.lossHead >= rec1.lossHead && recClose.lossHead <= Math.ceil(120 * 0.05), 'close=' + (recClose && recClose.lossHead) + ' overwhelming=' + (rec1 && rec1.lossHead));

section('THE HEADLINE — a force advance drains a domain full of low-threat bands to zero');
const cDrain = mk({ count: 8, garrisonCount: 200, bandIds: ['grp-a', 'grp-b', 'grp-c'] });
ok('fixture: three bands stand in the domain', ACKS.incursionBandsForDomain(cDrain, 'dom-r').length === 3);
const propDrain = ACKS.runDayTickToMonthEnd(cDrain);
ok('after the advance, the incursion queue is empty (the audit’s drain)', ACKS.incursionBandsForDomain(cDrain, 'dom-r').length === 0, 'still standing: ' + ACKS.incursionBandsForDomain(cDrain, 'dom-r').length);
ok('three garrison-defense events were logged', (cDrain.eventLog || []).filter(e => e && e.event && e.event.kind === 'domain-warfare' && e.event.payload && e.event.payload.action === 'garrison-defense').length === 3);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
if(fail > 0){ console.log(failures.map(f => '  • ' + f).join('\n')); process.exit(1); }
