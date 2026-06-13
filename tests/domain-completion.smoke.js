/* Domain Completion DC-2 — classification advancement smoke test.
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/domain-completion.smoke.js
 *
 * Covers the DC-2 layer added to acks-engine-domain-completion.js + acks-engine.js (the
 * effectiveDomainClassification permanence floor + the commitTurn hook) + acks-engine-events.js
 * (the domain-advanced event). Implements RR p.340 Outlands→Borderlands→Civilized advancement
 * (Domain_Completion_Plan.md §11.9). DC-0's spatial-query layer has its own suite
 * (spatial-queries.smoke.js); here the road / friendly-city conditions are exercised via the GM
 * overrides (roadToTownOverride / nearFriendlyCity) so the check logic is isolated from the BFS.
 *
 * Authored 2026-06-13 — world-front team session (CLAUDE §15), agent-2 (Domain Completion DC-2).
 */

const path = require('path');
global.window = global;
require('./_engine.js').load();
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail !== undefined ? '  -- ' + detail : '')); failed++; }
}
function section(t){ console.log('--- ' + t + ' ---'); }

// A domain in the given state. blankDomain gives the full shape; we tweak the advancement inputs.
// roadOverride / nearFriendlyCity / floor are set only when provided (so "absent" cases test the
// defensive reads). classification defaults to Outlands so the Outlands→Borderlands gates apply.
function mkDomain(opts){
  opts = opts || {};
  const d = ACKS.blankDomain({ id: opts.id || 'dom-1', name: opts.name || 'Frontier',
    classification: opts.classification || 'Outlands' });
  d.demographics.peasantFamilies = opts.fam != null ? opts.fam : 0;
  d.demographics.morale = opts.morale != null ? opts.morale : 0;
  d.geography.controlledHexes = opts.hexes != null ? opts.hexes : 1;
  if('roadOverride' in opts) d.roadToTownOverride = opts.roadOverride;
  if('nearFriendlyCity' in opts) d.nearFriendlyCity = opts.nearFriendlyCity;
  if('floor' in opts) d.classificationAdvancedTo = opts.floor;
  return d;
}
function mkCampaign(domains, hexes){
  return { schemaVersion: 2, kind: 'campaign', currentTurn: 5, domains: domains || [],
           hexes: hexes || [], settlements: [], eventLog: [] };
}
// A hex in `domainId` holding an urban settlement of `families` (for the urban-settlement path).
function mkUrbanHex(domainId, families){
  return { id: 'h-' + domainId, schemaVersion: 2, coord: { q: 0, r: 0 }, domainId,
           settlement: { id: 'set-' + domainId, name: 'Town', families } };
}
// Resolve the kind of an eventLog entry (entries are wrapped { event, result, … }).
function evKind(e){ return ((e && e.event) || e || {}).kind; }
function evOf(e){ return (e && e.event) || e; }

// ─────────────────────────────────────────────────────────────────────────
section('Exports on global.ACKS');
['domainFamilies', 'controlledHexCount', 'domainHasUrbanSettlement', 'mostAdvancedClassification',
 'classificationAdvanceCheck', 'processClassificationAdvancement']
  .forEach(n => check('ACKS.' + n + ' exported', typeof ACKS[n] === 'function'));

// ─────────────────────────────────────────────────────────────────────────
section('mostAdvancedClassification (lower DOMAIN_CLASSIFICATIONS index wins; nulls tolerated)');
check('Borderlands vs Outlands → Borderlands', ACKS.mostAdvancedClassification('Borderlands', 'Outlands') === 'Borderlands');
check('Outlands vs Civilized → Civilized',     ACKS.mostAdvancedClassification('Outlands', 'Civilized') === 'Civilized');
check('Civilized vs null → Civilized',         ACKS.mostAdvancedClassification('Civilized', null) === 'Civilized');
check('null vs Borderlands → Borderlands',     ACKS.mostAdvancedClassification(null, 'Borderlands') === 'Borderlands');
check('equal → same',                          ACKS.mostAdvancedClassification('Outlands', 'Outlands') === 'Outlands');

// ─────────────────────────────────────────────────────────────────────────
section('effectiveDomainClassification — permanence floor (most-advanced of authored, floor)');
check('authored Outlands + floor Borderlands → Borderlands',
  ACKS.effectiveDomainClassification(mkDomain({ classification: 'Outlands', floor: 'Borderlands' })) === 'Borderlands');
check('authored Civilized + floor null → Civilized (defensive read of absent floor)',
  ACKS.effectiveDomainClassification(mkDomain({ classification: 'Civilized' })) === 'Civilized');
check('authored Civilized + floor Borderlands → Civilized (engine never lowers below authored)',
  ACKS.effectiveDomainClassification(mkDomain({ classification: 'Civilized', floor: 'Borderlands' })) === 'Civilized');
check('domain with NO DC-2 fields → no throw, returns authored',
  ACKS.effectiveDomainClassification({ classification: 'Borderlands', demographics: {}, geography: {} }) === 'Borderlands');
check('blankDomain() has NO classificationAdvancedTo key (no factory field ⇒ templates stay migrate-no-ops)',
  !('classificationAdvancedTo' in ACKS.blankDomain()));

// ─────────────────────────────────────────────────────────────────────────
section('domainHasUrbanSettlement — RAW ≥75 families gate (not the type-rank "Hamlet" 0–74)');
(function(){
  const dYes = mkDomain({ id: 'dom-u1' }), dNo = mkDomain({ id: 'dom-u2' }), dDis = mkDomain({ id: 'dom-u3' });
  check('≥75 families ⇒ established settlement',
    ACKS.domainHasUrbanSettlement(mkCampaign([dYes], [mkUrbanHex('dom-u1', 75)]), dYes) === true);
  check('74 families ⇒ NOT established (dissolves, RR p.352)',
    ACKS.domainHasUrbanSettlement(mkCampaign([dNo], [mkUrbanHex('dom-u2', 74)]), dNo) === false);
  check('50-family "Hamlet" (Class VI*, no market) ⇒ NOT established',
    ACKS.domainHasUrbanSettlement(mkCampaign([dDis], [mkUrbanHex('dom-u3', 50)]), dDis) === false);
  const dNone = mkDomain({ id: 'dom-u4' });
  check('no in-domain settlement ⇒ false',
    ACKS.domainHasUrbanSettlement(mkCampaign([dNone], []), dNone) === false);
})();

// ─────────────────────────────────────────────────────────────────────────
section('classificationAdvanceCheck — Outlands→Borderlands, each gate independently');
(function(){
  // pop+road+morale
  let d = mkDomain({ classification: 'Outlands', fam: 185, morale: 1, roadOverride: true });
  let r = ACKS.classificationAdvanceCheck(mkCampaign([d]), d);
  check('185 fam + road + morale +1 → Borderlands (pop+road+morale)', r && r.to === 'Borderlands' && r.reason === 'pop+road+morale', JSON.stringify(r));

  d = mkDomain({ classification: 'Outlands', fam: 184, morale: 1, roadOverride: true });
  check('184 fam → none (family gate)', ACKS.classificationAdvanceCheck(mkCampaign([d]), d) === null);

  d = mkDomain({ classification: 'Outlands', fam: 300, morale: 0, roadOverride: true });
  check('morale 0 → none (morale gate)', ACKS.classificationAdvanceCheck(mkCampaign([d]), d) === null);

  d = mkDomain({ classification: 'Outlands', fam: 300, morale: 1, roadOverride: false });
  check('no road → none (road gate)', ACKS.classificationAdvanceCheck(mkCampaign([d]), d) === null);

  // territory path: 5 hexes + 925 fam + morale +1 (no road needed)
  d = mkDomain({ classification: 'Outlands', fam: 925, morale: 1, hexes: 5, roadOverride: false });
  r = ACKS.classificationAdvanceCheck(mkCampaign([d]), d);
  check('5 hexes + 925 fam + morale +1 → Borderlands (territory path, no road)', r && r.reason === 'territory+pop+morale', JSON.stringify(r));

  d = mkDomain({ classification: 'Outlands', fam: 925, morale: 1, hexes: 4, roadOverride: false });
  check('4 hexes + 925 fam → none (territory hex gate)', ACKS.classificationAdvanceCheck(mkCampaign([d]), d) === null);

  // urban path: established settlement + friendly city within 72mi (no road/family/morale needed)
  d = mkDomain({ id: 'dom-up', classification: 'Outlands', fam: 0, morale: -2, roadOverride: false, nearFriendlyCity: 'within-72mi' });
  r = ACKS.classificationAdvanceCheck(mkCampaign([d], [mkUrbanHex('dom-up', 80)]), d);
  check('urban settlement + within-72mi → Borderlands (urban path, ignores fam/morale/road)', r && r.reason === 'urban-settlement', JSON.stringify(r));

  d = mkDomain({ id: 'dom-up2', classification: 'Outlands', nearFriendlyCity: 'none' });
  check('urban settlement + no friendly city → none', ACKS.classificationAdvanceCheck(mkCampaign([d], [mkUrbanHex('dom-up2', 80)]), d) === null);
})();

// ─────────────────────────────────────────────────────────────────────────
section('classificationAdvanceCheck — Borderlands→Civilized mirrors');
(function(){
  let d = mkDomain({ classification: 'Borderlands', fam: 375, morale: 1, roadOverride: true });
  let r = ACKS.classificationAdvanceCheck(mkCampaign([d]), d);
  check('375 fam + road + morale +1 → Civilized', r && r.to === 'Civilized' && r.reason === 'pop+road+morale', JSON.stringify(r));

  d = mkDomain({ classification: 'Borderlands', fam: 374, morale: 1, roadOverride: true });
  check('374 fam → none', ACKS.classificationAdvanceCheck(mkCampaign([d]), d) === null);

  d = mkDomain({ classification: 'Borderlands', fam: 1200, morale: 1, hexes: 7, roadOverride: false });
  r = ACKS.classificationAdvanceCheck(mkCampaign([d]), d);
  check('7 hexes + 1,200 fam + morale +1 → Civilized (territory path)', r && r.reason === 'territory+pop+morale', JSON.stringify(r));

  d = mkDomain({ classification: 'Borderlands', fam: 1200, morale: 1, hexes: 6, roadOverride: false });
  check('6 hexes + 1,200 fam → none', ACKS.classificationAdvanceCheck(mkCampaign([d]), d) === null);

  // urban path needs within-48mi for Civilized; within-72mi does NOT satisfy it.
  d = mkDomain({ id: 'dom-c1', classification: 'Borderlands', nearFriendlyCity: 'within-48mi' });
  r = ACKS.classificationAdvanceCheck(mkCampaign([d], [mkUrbanHex('dom-c1', 80)]), d);
  check('urban + within-48mi → Civilized (urban path)', r && r.reason === 'urban-settlement', JSON.stringify(r));

  d = mkDomain({ id: 'dom-c2', classification: 'Borderlands', nearFriendlyCity: 'within-72mi' });
  check('urban + within-72mi does NOT satisfy Civilized', ACKS.classificationAdvanceCheck(mkCampaign([d], [mkUrbanHex('dom-c2', 80)]), d) === null);
})();

// ─────────────────────────────────────────────────────────────────────────
section('Civilized is the top tier — never advances further');
(function(){
  const d = mkDomain({ classification: 'Civilized', fam: 5000, morale: 4, hexes: 20, roadOverride: true, nearFriendlyCity: 'within-48mi' });
  check('Civilized + everything → null', ACKS.classificationAdvanceCheck(mkCampaign([d]), d) === null);
})();

// ─────────────────────────────────────────────────────────────────────────
section('Single-step per month — Outlands meeting Civilized-level numbers advances only to Borderlands');
(function(){
  const d = mkDomain({ classification: 'Outlands', fam: 2000, morale: 2, hexes: 10, roadOverride: true });
  const c = mkCampaign([d]);
  const r = ACKS.classificationAdvanceCheck(c, d);
  check('check returns to:Borderlands (not Civilized)', r && r.to === 'Borderlands', JSON.stringify(r));
  ACKS.processClassificationAdvancement(c);
  check('after one apply: effective = Borderlands (single step)', ACKS.effectiveDomainClassification(d) === 'Borderlands');
  // A SECOND apply (same month) now sees Borderlands → can advance to Civilized (its numbers qualify).
  // RAW checks "at the end of any month"; single-step is per-call, so a re-run is a fresh month's worth.
  ACKS.processClassificationAdvancement(c);
  check('a second apply advances Borderlands → Civilized (next step)', ACKS.effectiveDomainClassification(d) === 'Civilized');
})();

// ─────────────────────────────────────────────────────────────────────────
section('processClassificationAdvancement — floor + lockedAt + event + idempotence + onlyDomainId');
(function(){
  const d1 = mkDomain({ id: 'dom-a', name: 'Aldland', classification: 'Outlands', fam: 200, morale: 2, roadOverride: true });
  const d2 = mkDomain({ id: 'dom-b', name: 'Borvik',  classification: 'Outlands', fam: 200, morale: 2, roadOverride: true });
  const c = mkCampaign([d1, d2]); c.currentTurn = 7;
  const out = ACKS.processClassificationAdvancement(c);
  check('both qualifying domains advanced', out.advanced.length === 2);
  check('floor set on d1', d1.classificationAdvancedTo === 'Borderlands');
  check('lockedAt records the committed turn (7)', d1.classificationLockedAt === 7);
  check('a log entry per advance', out.logEntries.length === 2 && /Aldland advanced from Outlands to Borderlands/.test(out.logEntries[0]));
  check('domain-advanced events emitted (one per domain)', c.eventLog.filter(e => evKind(e) === 'domain-advanced').length === 2);
  const ev = c.eventLog.find(e => evKind(e) === 'domain-advanced' && evOf(e).payload.domainId === 'dom-a');
  check('event payload from/to/reason correct', ev && ev.event.payload.from === 'Outlands' && ev.event.payload.to === 'Borderlands' && ev.event.payload.reason === 'pop+road+morale');
  check('event carries the Event.context envelope (domainId)', ev && ev.event.context && ev.event.context.domainId === 'dom-a');
  check('event status applied + appliedAtTurn', ev && ev.event.status === (ACKS.EVENT_STATUS.APPLIED || 'applied') && ev.event.appliedAtTurn === 7);
  // Idempotent within the month — re-running finds nothing new (floor already raised the tier).
  const again = ACKS.processClassificationAdvancement(c);
  check('idempotent re-run: nothing new advances', again.advanced.length === 0);
  check('no extra events on the no-op re-run', c.eventLog.filter(e => evKind(e) === 'domain-advanced').length === 2);
})();
(function(){
  // onlyDomainId scopes to a single domain.
  const d1 = mkDomain({ id: 'dom-s1', classification: 'Outlands', fam: 200, morale: 2, roadOverride: true });
  const d2 = mkDomain({ id: 'dom-s2', classification: 'Outlands', fam: 200, morale: 2, roadOverride: true });
  const c = mkCampaign([d1, d2]);
  const out = ACKS.processClassificationAdvancement(c, { onlyDomainId: 'dom-s1' });
  check('onlyDomainId advances just that domain', out.advanced.length === 1 && out.advanced[0].domainId === 'dom-s1');
  check('the other domain is untouched', !d2.classificationAdvancedTo && ACKS.effectiveDomainClassification(d2) === 'Outlands');
})();

// ─────────────────────────────────────────────────────────────────────────
section('Permanence end-to-end — advance, then lose the conditions, tier stays');
(function(){
  const d = mkDomain({ classification: 'Outlands', fam: 200, morale: 2, roadOverride: true });
  const c = mkCampaign([d]);
  ACKS.processClassificationAdvancement(c);
  check('advanced to Borderlands', ACKS.effectiveDomainClassification(d) === 'Borderlands');
  d.demographics.peasantFamilies = 10; d.demographics.morale = -4; d.roadToTownOverride = false;
  check('conditions lost but effective stays Borderlands (permanent — RR p.340)', ACKS.effectiveDomainClassification(d) === 'Borderlands');
  check('classificationAdvanceCheck now returns null (no further advance qualifies)', ACKS.classificationAdvanceCheck(c, d) === null);
})();

// ─────────────────────────────────────────────────────────────────────────
section('Defensive — sparse / map-less campaign + missing fields never throw');
(function(){
  let threw = false, r;
  try {
    const d = mkDomain({ classification: 'Outlands', fam: 300, morale: 2 }); // no road override, no hexes authored
    r = ACKS.classificationAdvanceCheck(mkCampaign([d], []), d);             // derive over empty hexes
  } catch(e){ threw = true; }
  check('classificationAdvanceCheck on a sparse campaign does not throw', !threw);
  check('… and returns null when no gate is met (no road derivable, no urban, <925 fam)', r === null);

  threw = false;
  try { ACKS.processClassificationAdvancement({ schemaVersion: 2, kind: 'campaign' }); } catch(e){ threw = true; }
  check('processClassificationAdvancement on a campaign with no domains array does not throw', !threw);
})();

// ─────────────────────────────────────────────────────────────────────────
section('commitTurn integration — a qualifying Outlands domain advances on the monthly turn');
(function(){
  require(path.join(__dirname, '..', 'acks-demo-template.js'));
  const demo = JSON.parse(JSON.stringify(global.ACKS_DEMO_TEMPLATE));
  ACKS.migrateCampaign(demo);
  function lcg(seed){ let s = seed >>> 0; return () => { s = (1103515245 * s + 12345) >>> 0; return s / 4294967296; }; }
  const rng = lcg(424242);
  const startTurn = demo.currentTurn || 1;
  // Rig domain[0] to a guaranteed-advancing Outlands state. morale 4 ⇒ post-turn morale ∈ [2,4]
  // (moraleChange ∈ [-2,+2], clamped) so the morale ≥+1 gate holds whatever the seeded roll does;
  // 300 peasant families ⇒ well above 185 even after a month's birth/death swing.
  const d = demo.domains[0];
  d.classification = 'Outlands';
  delete d.classificationAdvancedTo;
  delete d.classificationLockedAt;
  d.demographics.peasantFamilies = 300;
  d.demographics.morale = 4;
  d.roadToTownOverride = true;
  check('rigged domain reads Outlands before the turn', ACKS.effectiveDomainClassification(d) === 'Outlands');

  const proposal = ACKS.proposeMonthlyTurn(demo, { rng });
  const res = ACKS.commitTurn(demo, proposal, { rng });
  check('commitTurn ran without error', !res.error, res.error);
  check('the turn counter advanced', demo.currentTurn === startTurn + 1);
  check('the rigged Outlands domain advanced to Borderlands', ACKS.effectiveDomainClassification(d) === 'Borderlands', 'fam=' + d.demographics.peasantFamilies + ' morale=' + d.demographics.morale);
  check('the permanent floor is recorded', d.classificationAdvancedTo === 'Borderlands');
  check('classificationLockedAt records the committed turn', d.classificationLockedAt === startTurn);
  check('a domain-advanced event was logged for it', demo.eventLog.some(e => evKind(e) === 'domain-advanced' && evOf(e).payload.domainId === d.id));
  check('the advancement narrative reached the commit logEntries', (res.logEntries || []).some(l => /advanced from Outlands to Borderlands/.test(l)));
})();

// ─────────────────────────────────────────────────────────────────────────
console.log('\n=============================================');
console.log('domain-completion.smoke.js (DC-2) — Passed: ' + passed + ', Failed: ' + failed);
console.log('=============================================');
process.exit(failed ? 1 : 0);
