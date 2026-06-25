// =============================================================================
// garrison-defense.smoke.js — D4 (2026-06-25): garrison AUTO-DEPLOY against low-threat
// incursions (the 2026-06-24 audit's solo-sim finding — an autonomous run must DRAIN the
// incursion queue, not grow it; Joachim 2026-06-25 — the garrison must visibly RESPOND, not
// silently clear the band).
//
//   node tests/garrison-defense.smoke.js   (or via `npm test`)
//
// The opt-in (domain.autoResolveIncursions — the ⚔ Active Threats checkbox) makes a domain's
// garrison AUTO-DEPLOY a reaction force (the GM's ⚔ Deploy flow, triggered for them) against a
// DECISIVELY-outmatched (platoon BR ≥ 2×) incursion band, via the slot-89 day consumer. The band
// stays VISIBLE on the threats list as "responding" while the force musters + marches; the shipped
// slot-88 army-band-contact path drives it off on arrival, then the force is auto-recalled (units
// re-garrison) and takes light proportional sortie casualties. Verifies:
//   - the deploy (a reaction force, autoReaction-flagged, targets the band; the band stays standing)
//   - the resolution on arrival (band driven off, force recalled, units re-garrisoned + casualties)
//   - the 2× gate; toggle/no-garrison/unaware/GM-priced/settled/already-responding/hostile skips
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
const adv = (c) => ACKS.commitDayTick(c, ACKS.proposeDayTick(c, 1, { force: true }));   // one forced day-tick
const reactionArmies = (c, gid) => (c.armies || []).filter(a => a && a.reactionTargetGroupId === gid);

// A threatened realm: seat hex (the rally) + a near hex + a far hex, all in dom-r; vagaries +
// persistent-wandering OFF so nothing mints/moves bands behind the test (only the garrison acts).
// The ruler (chr-cap) sits at the seat so domainSeatHexId rallies there. light-infantry ×120 platoon
// BR = 4.8; orc ×8 = 0.25. autoResolveIncursions defaults ON (o.auto:false turns it off). o.bandHex
// places the band(s); o.bandIds plants several.
function mk(o){
  o = o || {};
  const c = { currentTurn: 3, currentDayInMonth: 1, eventLog: [],
    houseRules: { 'persistent-wandering-monsters': { enabled: false }, 'vagaries-of-incursion': { enabled: false } },
    characters: [{ schemaVersion: 2, id: 'chr-cap', name: 'Captain Vael', alive: true, currentHexId: 'hex-seat', class: 'Fighter', level: 9, abilities: { STR: 13, INT: 10, WIL: 10, DEX: 12, CON: 12, CHA: 13 } }],
    domains: [{ id: 'dom-r', name: 'March', rulerCharacterId: 'chr-cap', autoResolveIncursions: o.auto !== false, garrison: { units: [] }, demographics: { peasantFamilies: 500, morale: 0 } }],
    journeys: [], armies: [], units: [], battles: [], groups: [], lairs: [],
    hexes: [{ id: 'hex-seat', domainId: 'dom-r', coord: { q: 0, r: 0 }, terrain: 'grassland' },
            { id: 'hex-band', domainId: 'dom-r', coord: { q: 1, r: 0 }, terrain: 'hills' },
            { id: 'hex-far',  domainId: 'dom-r', coord: { q: 7, r: 0 }, terrain: 'grassland' }] };
  const n = (o.garrisonUnits != null) ? o.garrisonUnits : 1;
  for(let i = 0; i < n; i++){
    ACKS.stationUnit(c, ACKS.blankUnit({ id: 'unit-g' + i, displayName: 'Foot ' + i, unitTypeKey: 'light-infantry',
      count: (o.garrisonCount != null) ? o.garrisonCount : 120, ownerDomainId: 'dom-r' }), { kind: 'domain-garrison', id: 'dom-r' });
  }
  const ids = o.bandIds || ['grp-threat'];
  const hex = o.bandHex || 'hex-band';
  for(const id of ids){
    const band = ACKS.blankGroup({ id, name: 'Orc raiders',
      groupTemplate: { monsterCatalogKey: (o.catalogKey !== undefined ? o.catalogKey : 'orc'), creatureTypes: ['beastman', 'humanoid'], hitDice: '1' },
      count: (o.count != null) ? o.count : 8, currentHexId: hex, currentDomainId: 'dom-r', lifecycleState: 'wild' });
    band.incursion = { domainId: 'dom-r', attitude: o.attitude || 'unfriendly', disposition: 'lingering',
      fullStrength: false, treasureType: '', rulerAware: true, monstersIntel: false, arrivedAtTurn: 3 };
    band.wanderState = { coord: null, lastCoord: null, mileRemainder: 0, mode: null, destLairId: null, dissolveOnArrival: false, lastDomainId: 'dom-r', halted: true };
    c.groups.push(band);
  }
  return c;
}

// ─────────────────────────────────────────────────────────────────────────────
section('auto-deploy — the garrison RESPONDS (mustering), and the band stays visible while it does');
const c1 = mk({ count: 8, garrisonCount: 120, bandHex: 'hex-seat' });   // co-located → muster (d1) → march (d2) → resolve (d3)
adv(c1);                                                                 // day 1: slot-89 auto-deploys — the force MUSTERS at the seat
const army1 = reactionArmies(c1, 'grp-threat')[0];
ok('a reaction force is auto-deployed against the band', !!army1 && army1.autoReaction === true);
ok('the force is MUSTERING on the deploy day (the 1-day sortie muster — not yet in the field)', !!army1 && army1.sortieMustering === true);
ok('the band STILL stands (visible as "responding", not vanished)', ACKS.incursionBandsForDomain(c1, 'dom-r').length === 1);
ok('the garrison mustered out into the sortie force', ACKS.domainGarrisonUnits(c1, 'dom-r').length === 0 && ACKS.armyUnits(c1, army1).length === 1);
ok('the army history records the auto-sortie', (army1.history || []).some(h => h.type === 'auto-deployed-reaction'));

section('muster completes the next day — the force marches out (the 1-day sortie muster, RR p.434/JJ p.104)');
adv(c1);                                                                 // day 2: slot-89 muster-completion — the force marches out
ok('the force finished mustering (marches out the NEXT day, not the deploy day)', army1.sortieMustering === false);
ok('the band still stands while the force closes in', ACKS.incursionBandsForDomain(c1, 'dom-r').length === 1);

section('resolution on arrival — driven off, recalled, light sortie casualties');
adv(c1);                                                                 // day 3: slot-88 resolves the co-located contact
ok('the band is driven off (queue drained)', ACKS.incursionBandsForDomain(c1, 'dom-r').length === 0);
const band1 = c1.groups.find(g => g && g.id === 'grp-threat');
ok('band repelled — currentHexId null, outcome driven-off', band1 && band1.currentHexId === null && band1.incursion.outcome === 'driven-off');
ok('the sortie force was recalled (army gone)', !reactionArmies(c1, 'grp-threat').length && !(c1.armies || []).some(a => a && a.id === army1.id));
ok('the units re-garrisoned after the sortie', ACKS.domainGarrisonUnits(c1, 'dom-r').length === 1);
const u1 = ACKS.domainGarrisonUnits(c1, 'dom-r')[0];
ok('light sortie casualties on the garrison (≈1 of 120 for a 19× fight)', u1 && u1.casualties >= 1 && u1.casualties <= 3, 'casualties=' + (u1 && u1.casualties));
ok('a reaction-driven-off event was logged', (c1.eventLog || []).some(e => e && e.event && e.event.kind === 'domain-warfare' && e.event.payload && e.event.payload.action === 'reaction-driven-off'));

section('the toggle + garrison gates');
const c2 = mk({ count: 8, auto: false, bandHex: 'hex-seat' });
adv(c2);
ok('toggle OFF → no reaction deployed', !reactionArmies(c2, 'grp-threat').length);
ok('toggle OFF → the band still stands unchanged', ACKS.incursionBandsForDomain(c2, 'dom-r').length === 1);
const c2b = mk({ count: 8, garrisonUnits: 0, bandHex: 'hex-seat' });
adv(c2b);
ok('no garrison → nothing deploys', !(c2b.armies || []).length);

section('the 2× gate — a 1×–2× edge stays the GM’s call');
const c3 = mk({ count: 90, garrisonCount: 120, bandHex: 'hex-seat' });
const prev3 = ACKS.garrisonReactionPreview(c3, 'grp-threat', ['unit-g0']);
ok('fixture: a near-match band (force > band, but force < 2× band)', prev3.bandBr > prev3.forceBr / 2 && prev3.bandBr < prev3.forceBr, 'force=' + prev3.forceBr + ' band=' + prev3.bandBr);
adv(c3);
ok('a 1×–2× margin does NOT auto-deploy (left for the GM)', !(c3.armies || []).some(a => a && a.autoReaction));

section('never auto-deploys what the garrison shouldn’t handle on its own');
const c4 = mk({ count: 8, attitude: 'hostile', garrisonCount: 120, bandHex: 'hex-seat' });
adv(c4);
ok('a hostile band → NOT auto-deployed (it gives battle — the GM adjudicates)', !(c4.armies || []).some(a => a && a.autoReaction) && ACKS.incursionBandsForDomain(c4, 'dom-r').length === 1);
const c5 = mk({ count: 8, catalogKey: '__nope__', bandHex: 'hex-seat' });
adv(c5);
ok('a GM-priced band (no catalog BR — a dragon) → no auto-deploy', !(c5.armies || []).some(a => a && a.autoReaction));
const c6 = mk({ count: 8, garrisonCount: 120, bandHex: 'hex-seat' });
c6.lairs = [{ id: 'lair-x', hexId: 'hex-seat', groupIds: ['grp-threat'], status: 'active' }];
adv(c6);
ok('a settled band (housed in a lair) → not auto-deployed', !(c6.armies || []).some(a => a && a.autoReaction));
const c7 = mk({ count: 8, garrisonCount: 120, bandHex: 'hex-seat' });
c7.groups.find(g => g.id === 'grp-threat').incursion.rulerAware = false;
adv(c7);
ok('an undetected band (failed recon, JJ p.103) → no auto-deploy', !(c7.armies || []).some(a => a && a.autoReaction));

section('idempotent — no double-deploy while a force is already responding');
const c8 = mk({ count: 8, garrisonCount: 120, bandHex: 'hex-seat' });
adv(c8);                                                                 // deploys once
const reprop = ACKS.proposeGarrisonDefenseDay(c8, { dayInMonth: c8.currentDayInMonth });
ok('a band already being responded to proposes no new deploy', reactionArmies(c8, 'grp-threat').length === 1 && !reprop.pendingRecords.some(r => r.kind === 'garrison-defense' && r.groupId === 'grp-threat'));

section('THE HEADLINE — a force advance drains a domain full of low-threat bands to zero');
const cDrain = mk({ count: 8, garrisonCount: 200, bandHex: 'hex-seat', bandIds: ['grp-a', 'grp-b', 'grp-c'] });
ok('fixture: three bands stand in the domain', ACKS.incursionBandsForDomain(cDrain, 'dom-r').length === 3);
ACKS.runDayTickToMonthEnd(cDrain);
ok('after the advance, the incursion queue is empty (the audit’s drain — via real sorties)', ACKS.incursionBandsForDomain(cDrain, 'dom-r').length === 0, 'still standing: ' + ACKS.incursionBandsForDomain(cDrain, 'dom-r').length);
ok('three bands were driven off by garrison sorties', (cDrain.eventLog || []).filter(e => e && e.event && e.event.kind === 'domain-warfare' && e.event.payload && e.event.payload.action === 'reaction-driven-off').length === 3);
ok('the garrison stood down again after the sorties (no lingering reaction armies)', !(cDrain.armies || []).some(a => a && a.reactionTargetGroupId));

// ─────────────────────────────────────────────────────────────────────────────
// SAME-DAY arrival (D4 follow-up, 2026-06-25): a band materialized by the incursion path
// (commitIncursionRecord — slot-86's commit) is met the SAME tick it appears, not the next.
// The slot-89 consumer alone reacts a day late (the band materializes after slot-89's propose
// has run); folding the trigger into the arrival commit closes that one-day muster lag.
section('same-day arrival — a band met via the incursion path sorties the SAME tick');
function arrive(o){
  o = o || {};
  const c = mk({ garrisonCount: 200, bandIds: [] });                 // garrison, NO band pre-planted
  if(o.auto === false) c.domains[0].autoResolveIncursions = false;
  ACKS.commitIncursionRecord(c, { kind: 'incursion', domainId: 'dom-r', groupId: 'grp-arr', hexId: 'hex-seat',
    identity: { key: o.key || 'orc', label: o.label || 'Orc' },
    reaction: { attitude: o.attitude || 'unfriendly', attitudeLabel: (o.attitude || 'unfriendly') },
    count: (o.count != null ? o.count : 8), lingering: !!o.lingering, fullStrength: false, treasureType: '',
    recon: { rulerAware: o.rulerAware !== false, monstersIntel: false }, dayInMonth: 1 });
  return c;
}
const cArrU = arrive({ attitude: 'unfriendly', lingering: true, count: 8 });
ok('an UNFRIENDLY arrival is met the SAME tick (no 1-day lag)', reactionArmies(cArrU, 'grp-arr').length === 1 && reactionArmies(cArrU, 'grp-arr')[0].autoReaction === true);
ok('the arrived band still stands (responding), not vanished', ACKS.incursionBandsForDomain(cArrU, 'dom-r').length === 1);
const cArrN = arrive({ attitude: 'neutral', lingering: false, key: 'brown-bear', label: 'Brown Bear', count: 2 });   // the demo case
ok('a NEUTRAL MIGRATING arrival (the demo case) is met the SAME tick', reactionArmies(cArrN, 'grp-arr').length === 1);
ok('auto-deploying a neutral band reassures the peasants (no xenophobia −1)', cArrN.domains[0].incursionXenophobiaPending !== true);
const cArrH = arrive({ attitude: 'hostile', lingering: true, count: 8 });
ok('a HOSTILE arrival is NOT same-day deployed (it gives battle — the GM adjudicates)', !reactionArmies(cArrH, 'grp-arr').length && ACKS.incursionBandsForDomain(cArrH, 'dom-r').length === 1);
const cArrGm = arrive({ attitude: 'unfriendly', lingering: true, key: '__nope__', count: 8 });
ok('a GM-priced arrival (no catalog BR — a dragon) is NOT same-day deployed', !reactionArmies(cArrGm, 'grp-arr').length);
const cArrOff = arrive({ attitude: 'unfriendly', lingering: true, count: 8, auto: false });
ok('auto-defense OFF → an arrival is NOT same-day deployed', !reactionArmies(cArrOff, 'grp-arr').length);

// ─────────────────────────────────────────────────────────────────────────────
// Home garrison (D4 follow-up, 2026-06-25): a reaction force defending its OWN domain is fed by
// that domain (its garrison cost, RR p.341) — it is NOT an army on campaign, so it never reads
// out of supply (RR p.450) nor "occupies" its own land (RR p.458). The reaction force is often
// LEADERLESS (the auto-sortie), which is exactly what used to mis-classify it as an enemy invader.
section('home garrison — a reaction force in its OWN domain is fed by it, never out of supply / occupying');
const cHome = mk({ count: 8, garrisonCount: 200, bandHex: 'hex-band' });   // band 1 hex off → the force marches within the domain
let oosSeen = false, occSeen = false, supHomeSeen = false;
for(let i = 0; i < 8; i++){
  const prop = ACKS.proposeDayTick(cHome, 1, { force: true });
  const flat = JSON.stringify(prop.pendingRecords || []);
  if(/OUT OF SUPPLY|starving/i.test(flat)) oosSeen = true;
  if(/OCCUPIED|occupies/i.test(flat)) occSeen = true;
  const a = reactionArmies(cHome, 'grp-threat')[0];
  if(a && typeof ACKS.armyInSupply === 'function'){ const s = ACKS.armyInSupply(cHome, a, {}); if(s && s.inSupply && s.homeSupplied) supHomeSeen = true; }
  ACKS.commitDayTick(cHome, prop);
}
ok('a home reaction force is NEVER flagged out of supply (it is fed by its domain)', !oosSeen);
ok('a home reaction force never "occupies" its own domain (it is friendly to it, even leaderless)', !occSeen);
ok('the domain is not stamped occupied by its own sortie', !cHome.domains[0].occupiedBy);
ok('armyInSupply reads the home reaction force as in-supply, home-fed', supHomeSeen);
// the auto-sortie's mandate is its DOMAIN (RR p.341): when its band LEAVES the domain (migrates out),
// the force stands down (recalls home) rather than chase it across the map — so it never goes on campaign.
const cLeave = mk({ count: 8, garrisonCount: 200, bandHex: 'hex-band' });
cLeave.hexes.push({ id: 'hex-foreign', domainId: 'dom-other', coord: { q: 9, r: 0 }, terrain: 'grassland' });
adv(cLeave); adv(cLeave);                                                  // deploy + muster completes — the force is afield
ok('fixture: an auto reaction force is afield', reactionArmies(cLeave, 'grp-threat').length === 1 && reactionArmies(cLeave, 'grp-threat')[0].autoReaction === true);
cLeave.groups.find(g => g && g.id === 'grp-threat').currentHexId = 'hex-foreign';   // the band migrates OUT of the domain
adv(cLeave);
ok('the auto-sortie STANDS DOWN when its band leaves the domain (recalled, not chasing out of supply)', !reactionArmies(cLeave, 'grp-threat').length);
ok('the units re-garrisoned after standing down', ACKS.domainGarrisonUnits(cLeave, 'dom-r').length === 1);

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — ' + pass + ' passed, ' + fail + ' failed');
if(fail > 0){ console.log(failures.map(f => '  • ' + f).join('\n')); process.exit(1); }
