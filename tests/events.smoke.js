/* tests/events.smoke.js — committed event-system smoke suite.
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/events.smoke.js
 *
 * Plain Node, no dependencies. Loads all seven engine modules headless (each is an
 * IIFE that accumulates onto global.ACKS) and asserts on the typed-event layer:
 *   - house-rule gating of auto-emit hooks (delta audit I1, 2026-06-01)
 *   - applyEvent transactional rollback (delta audit C2, 2026-06-01)
 *   - table-driven validate/apply coverage across every EVENT_KINDS kind (qa C2)
 *
 * Stood up 2026-06-01 during the delta-audit correctness+hygiene pass.
 */
'use strict';
const path = require('path');
const assert = require('assert');

const DIR = path.join(__dirname, '..');
[
  'acks-engine-catalogs.js', 'acks-engine-monsters.js',
  'acks-engine.js',
  'acks-engine-entities.js',
  'acks-engine-economy.js',
  'acks-engine-entity-registry.js',
  'acks-engine-field-schemas.js',
  'acks-engine-events.js',
  'acks-engine-subsystems.js',
].forEach(f => require(path.join(DIR, f)));
const ACKS = global.ACKS;

// ─── tiny assertion harness (mirrors tests/smoke.js) ───
let pass = 0, fail = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(label + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); }
}
function section(t) { console.log('\n--- ' + t + ' ---'); }
function throws(label, fn) {
  let threw = false;
  try { fn(); } catch (e) { threw = true; }
  ok(label, threw, 'expected a throw');
}
function doesNotThrow(label, fn) {
  try { fn(); ok(label, true); } catch (e) { ok(label, false, e.message); }
}
const clone = o => JSON.parse(JSON.stringify(o));
function deepEq(label, a, b) {
  let eq = true, msg = '';
  try { assert.deepStrictEqual(a, b); } catch (e) { eq = false; msg = (e.message || '').split('\n').slice(0, 4).join(' '); }
  ok(label, eq, msg);
}

// =============================================================================
section('P2.3 — markets-transaction-threshold gate routes through isHouseRuleEnabled (delta audit I1)');
// =============================================================================
// A {enabled:false} house rule is a truthy object — the old raw
// `campaign.houseRules?.['markets-transaction-threshold']` check fired anyway.
// The auto-emit hook in applyEvent_treasuryGrant must now stay silent when the
// rule is explicitly disabled, and emit when it is enabled. We hold the downstream
// rumor gate (rumors-auto-emit) constant ON so the only variable is the gate
// under test, then count rumor-emit events pushed to pendingEvents.
function gateFixture(thresholdRule) {
  const c = ACKS.blankCampaign();
  c.currentTurn = 1;
  c.houseRules['rumors-auto-emit'] = { enabled: true }; // downstream gate held constant
  c.houseRules['markets-transaction-threshold'] = thresholdRule;
  c.domains = [{ id: 'dom-1', name: 'Saltmarch', treasury: { gp: 0 } }];
  c.hexes = [{ id: 'hex-1', domainId: 'dom-1' }];
  // floor(families * 0.5) = 500 threshold
  c.settlements = [{ id: 'set-1', hexId: 'hex-1', name: 'Saltport', families: 1000 }];
  c.pendingEvents = [];
  return c;
}
function grantAndCountRumors(thresholdRule) {
  const c = gateFixture(thresholdRule);
  const ev = ACKS.newEvent('treasury-grant', {
    submittedBy: 'gm',
    payload: { domainId: 'dom-1', amount: 1000, label: 'tribute haul' } // 1000 >= 500 threshold
  });
  ACKS.applyEvent(c, ev);
  return (c.pendingEvents || []).filter(e => e.kind === 'rumor-emit').length;
}
ok('isHouseRuleEnabled false for {enabled:false}', ACKS.isHouseRuleEnabled(gateFixture({ enabled: false }), 'markets-transaction-threshold') === false);
ok('isHouseRuleEnabled true for {enabled:true}', ACKS.isHouseRuleEnabled(gateFixture({ enabled: true }), 'markets-transaction-threshold') === true);
ok('{enabled:false} → auto-emit hook does NOT fire (regression guard for I1)', grantAndCountRumors({ enabled: false }) === 0);
ok('{enabled:true}  → auto-emit hook fires (one rumor-emit)', grantAndCountRumors({ enabled: true }) === 1);
ok('absent rule → does NOT fire (off by default)', grantAndCountRumors(undefined) === 0);

// =============================================================================
section('P1.2 — applyEvent is transactional: rolls back partial mutations on handler throw (delta audit C2)');
// =============================================================================
// adventure-result marks the target hex explored (mutation #1, line ~994), then
// walks treasureAwarded; an entry whose destinationDomainId names a non-existent
// domain throws inside _applyTreasuryDelta (line ~607) AFTER the hex mutation.
// Pre-fix, hex.explored stayed true once the handler threw (reject ≠ rollback).
function txnFixture() {
  const c = ACKS.blankCampaign();
  c.currentTurn = 1;
  c.domains = [{
    id: 'dom-1', name: 'Mark', treasury: { gp: 0 },
    geography: { hexes: [{ id: 'hex-1', explored: false }] }
  }];
  c.pendingEvents = [];
  return c;
}
const throwingEv = ACKS.newEvent('adventure-result', {
  submittedBy: 'gm',
  payload: {
    outcome: 'cleared', hexId: 'hex-1',
    treasureAwarded: [{ kind: 'gp', amount: 1000, destinationDomainId: 'dom-DOES-NOT-EXIST', label: 'loot' }]
  }
});
const cThrow = txnFixture();
const before = clone(cThrow);
throws('adventure-result with unknown destinationDomainId throws', () => ACKS.applyEvent(cThrow, throwingEv));
deepEq('campaign fully unchanged after the throw (no partial mutation)', cThrow, before);
ok('  → target hex.explored rolled back to false', cThrow.domains[0].geography.hexes[0].explored === false);

// Success path is preserved: a well-formed adventure-result still mutates in place.
const cOk = txnFixture();
ACKS.applyEvent(cOk, ACKS.newEvent('adventure-result', {
  submittedBy: 'gm',
  payload: {
    outcome: 'cleared', hexId: 'hex-1',
    treasureAwarded: [{ kind: 'gp', amount: 500, destinationDomainId: 'dom-1', label: 'loot' }]
  }
}));
ok('success path: hex marked explored', cOk.domains[0].geography.hexes[0].explored === true);
ok('success path: treasury credited 500gp', cOk.domains[0].treasury.gp === 500);

// =============================================================================
section('P3.7 — table-driven smoke across every EVENT_KINDS kind (qa C2)');
// =============================================================================
// For every kind: (1) it has an EVENT_SCHEMAS entry, (2) a minimal valid payload
// passes validateEvent, (3) dropping a required field is rejected, (4) the context
// envelope round-trips, and (5) applyEvent runs without throwing on a shared fixture.
// applyEvent is deferred for kinds already exercised by a dedicated suite (the
// construction + journey families) and for the heavy-individuation recruit/calamity
// handlers — listed explicitly so adding a NEW kind forces a coverage decision here.
const EVENT_KINDS = ACKS.EVENT_KINDS;
const EVENT_SCHEMAS = ACKS.EVENT_SCHEMAS;

function eventFixture() {
  const c = ACKS.blankCampaign();
  c.currentTurn = 1;
  c.houseRules['rumors-auto-emit'] = { enabled: true };
  const dom = ACKS.blankDomain({ name: 'Testmark' });
  dom.id = 'dom-1';
  dom.treasury = { gp: 1000 };
  dom.geography = { hexes: [{ id: 'hex-1', explored: true, domainId: 'dom-1' }] };
  c.domains = [dom];
  c.hexes = [{ id: 'hex-1', domainId: 'dom-1' }];
  c.settlements = [ACKS.blankSettlement({ id: 'set-1', hexId: 'hex-1', name: 'Town', families: 800 })];
  c.characters = [
    ACKS.blankCharacter({ id: 'chr-1', name: 'Aldric', controlledBy: 'gm', socialTier: 'independent', level: 3, currentDomainId: 'dom-1' }),
    ACKS.blankCharacter({ id: 'chr-2', name: 'Mira', socialTier: 'henchman', liegeCharacterId: 'chr-1', level: 2, currentDomainId: 'dom-1' }),
  ];
  c.ventures = [ACKS.blankVenture({ id: 'vnt-1', venturerCharacterId: 'chr-1', originDomainId: 'dom-1', destinationDomainId: 'dom-1' })];
  c.passiveInvestments = [ACKS.blankPassiveInvestment({ id: 'inv-1', ownerCharacterId: 'chr-1' })];
  c.pendingEvents = [];
  return c;
}

const FIXTURE_IDS = {
  domainId: 'dom-1', characterId: 'chr-1', settlementId: 'set-1', hexId: 'hex-1',
  ownerCharacterId: 'chr-1', venturerCharacterId: 'chr-1', patronCharacterId: 'chr-1',
  ventureId: 'vnt-1', investmentId: 'inv-1', projectId: 'prj-1', constructibleId: 'cst-1',
  journeyId: 'jrn-1', repairTargetConstructibleId: 'cst-1',
};
const PAYLOAD_OVERRIDES = {
  'gm-fiat': { target: { kind: 'domain', id: 'dom-1' }, mutation: { fieldPath: 'notes', newValue: 'fiat', reason: 'test' } },
  'character-update': { characterId: 'chr-1', fieldUpdates: { notes: 'updated' } },
  'adventure-result': { outcome: 'narrative-only' },
  'daw-result': { outcome: 'narrative-only' },
  'claude-event': { scope: 'campaign', title: 'T', narrativeText: 'N' },
  'rumor-emit': { scope: 'campaign', rumorText: 'whispers in the market', apparentLevel: 'common' },
  'population-shock': { domainId: 'dom-1', deltaFamilies: -5, label: 'plague', kind: 'plague' },
  'venture-result': { ventureId: 'vnt-1', outcome: 'arrived' },
  'venture-launch': { ventureId: 'vnt-2', venturerCharacterId: 'chr-1', totalInvestment: 500 },
  'passive-investment-create': { investmentId: 'inv-2', ownerCharacterId: 'chr-1', capital: 1000, type: 'workshop' },
  'passive-investment-delete': { investmentId: 'inv-1' },
  'character-level-up': { characterId: 'chr-1', newLevel: 4 },
  'character-death': { characterId: 'chr-1' },
  'loyalty-check': { characterId: 'chr-1' },
  'hireling-restored': { characterId: 'chr-1', restoredKind: 'wound' },
  'hireling-calamity': { characterId: 'chr-2', kind: 'rations' },
  'recruit-hireling': { patronCharacterId: 'chr-1', hireCategory: 'henchman', hireTypeId: 'henchman-1' },
  'domain-transfer': { domainId: 'dom-1', reason: 'conquest' },
  'engine-standard-turn': { domainId: 'dom-1', turnSnapshot: {} },
  'gm-narrative': { title: 'Chronicle', body: 'Something happened in the realm.' },
};
function buildPayload(kind) {
  if (PAYLOAD_OVERRIDES[kind]) return clone(PAYLOAD_OVERRIDES[kind]);
  const R = (EVENT_SCHEMAS[kind] && EVENT_SCHEMAS[kind].R) || {};
  const p = {};
  for (const field of Object.keys(R)) {
    const type = R[field];
    if (FIXTURE_IDS[field]) p[field] = FIXTURE_IDS[field];
    else if (type === 'number') p[field] = 1;
    else if (type === 'array') p[field] = [];
    else if (type === 'object') p[field] = {};
    else if (type === 'boolean') p[field] = false;
    else p[field] = 'x';
  }
  return p;
}
function ctxEnvelope() {
  return { primaryHexId: 'hex-1', involvedHexIds: ['hex-1'], settlementId: 'set-1', domainId: 'dom-1', relatedEntities: [] };
}

// applyEvent deferred — with an explicit reason (no silent caps):
const APPLY_DEFERRED = new Set([
  // Construction family — exercised through applyEvent by tests/agricultural-projects.smoke.js
  'construction-project-started', 'construction-progress', 'construction-completed',
  'construction-vagary', 'construction-damaged', 'construction-repair-started', 'construction-demolished',
  // Journey family — exercised through the day-tick pipeline by tests/journeys.smoke.js
  'journey-start', 'journey-day-tick', 'journey-arrived', 'journey-lost', 'journey-resupply', 'journey-encounter',
  // Heavy individuation fixtures (candidate generation / employment transfer) — out of scope for a table smoke
  'recruit-hireling', 'hireling-calamity',
  // GP Wave B grammar — typed source/destination handles + real inventory/coin movement;
  // exercised through applyEvent + marketBuy/marketSell by tests/gp-wave-b.smoke.js.
  'wealth-transfer', 'item-transfer', 'market-transaction',
]);

let applyExercised = 0;
EVENT_KINDS.forEach(kind => {
  ok('EVENT_SCHEMAS has an entry: ' + kind, !!EVENT_SCHEMAS[kind]);
  const ev = ACKS.newEvent(kind, { submittedBy: 'gm', payload: buildPayload(kind), context: ctxEnvelope() });
  doesNotThrow('validateEvent passes: ' + kind, () => ACKS.validateEvent(ev));
  ok('context envelope round-trips: ' + kind, ev.context && ev.context.domainId === 'dom-1' && ev.context.primaryHexId === 'hex-1');
  const reqFields = Object.keys((EVENT_SCHEMAS[kind] && EVENT_SCHEMAS[kind].R) || {});
  if (reqFields.length) {
    const badPayload = clone(buildPayload(kind)); delete badPayload[reqFields[0]];
    const bad = ACKS.newEvent(kind, { submittedBy: 'gm', payload: badPayload });
    throws('validateEvent rejects missing "' + reqFields[0] + '": ' + kind, () => ACKS.validateEvent(bad));
  }
  if (!APPLY_DEFERRED.has(kind)) {
    const fresh = eventFixture();
    const ae = ACKS.newEvent(kind, { submittedBy: 'gm', payload: buildPayload(kind), context: ctxEnvelope() });
    let threw = null;
    try { ACKS.applyEvent(fresh, ae); } catch (e) { threw = e.message; }
    ok('applyEvent no-throw: ' + kind, threw === null, threw);
    if (threw === null) applyExercised++;
  }
});
console.log('  applyEvent exercised on ' + applyExercised + ' kinds; deferred (own suite / out of scope): ' + APPLY_DEFERRED.size);
ok('every kind is validate-tested; apply-tested unless explicitly deferred',
  EVENT_KINDS.every(k => EVENT_SCHEMAS[k]) && (applyExercised + APPLY_DEFERRED.size) === EVENT_KINDS.length);

// =============================================================================
section('gm-fiat population sync — hex.families / peasantFamilies route through exported setters');
// =============================================================================
// Regression for `ReferenceError: _ruralHexes is not defined` (2026-06-01). applyEvent_gmFiat's
// Foundation #241 sync hook called the private acks-engine.js helpers (_ruralHexes /
// _redistributeRuralFamilies) by bare name — they aren't on the ACKS namespace, so the reference
// threw once the families-per-hex per-hex editor made this path reachable. The hook must use the
// EXPORTED setters (syncRuralPopulationFromHexes / setPeasantPopulation). The P3.7 table above only
// exercises gm-fiat on `notes`, so this branch had no coverage.
(function () {
  function fixture() {
    const c = ACKS.blankCampaign();
    c.domains = [{
      id: 'dom-1', name: 'Mark', demographics: { peasantFamilies: 80 },
      geography: { hexes: [{ id: 'h1', families: 50 }, { id: 'h2', families: 30 }] }
    }];
    return c;
  }
  // Editing a hex's families must not throw, and must sync peasantFamilies = Σ(rural hexes).
  const c1 = fixture();
  const ev1 = ACKS.newEvent('gm-fiat', { submittedBy: 'gm', payload: { target: { kind: 'hex', id: 'h1' }, mutation: { fieldPath: 'families', newValue: 100 } } });
  doesNotThrow('gm-fiat hex.families edit applies without ReferenceError', () => ACKS.applyEvent(c1, ev1));
  ok('  hex.families set to 100', c1.domains[0].geography.hexes[0].families === 100);
  ok('  peasantFamilies synced to hex sum (130)', c1.domains[0].demographics.peasantFamilies === 130);
  // Editing domain peasantFamilies must not throw, and must redistribute across the hexes.
  const c2 = fixture();
  const ev2 = ACKS.newEvent('gm-fiat', { submittedBy: 'gm', payload: { target: { kind: 'domain', id: 'dom-1' }, mutation: { fieldPath: 'demographics.peasantFamilies', newValue: 160 } } });
  doesNotThrow('gm-fiat peasantFamilies edit applies without ReferenceError', () => ACKS.applyEvent(c2, ev2));
  ok('  peasantFamilies set to 160', c2.domains[0].demographics.peasantFamilies === 160);
  ok('  hexes redistributed to sum to 160', c2.domains[0].geography.hexes.reduce((s, h) => s + (h.families || 0), 0) === 160);
})();

// =============================================================================
section('gm-fiat on a top-level / domainless hex (the Map create/edit-hex flow reaches these)');
// The hex case must check campaign.hexes[] (Foundation #14/#193) — domainless wilderness hexes live
// ONLY there, never in a domain.geography. Before the fix the handler walked only domain geography
// and threw "target hex:… not found", so editing a map-created wilderness hex silently failed.
// Regression guard for Map Mode #225 (create-hex into unclaimed wilderness + Edit/Add hex).
(function () {
  const c = ACKS.blankCampaign();
  c.hexes = [{ id: 'wild-1', domainId: null, coord: { q: 5, r: 5 }, terrain: 'grassland', notes: '' }];
  const ev = ACKS.newEvent('gm-fiat', { submittedBy: 'gm', payload: { target: { kind: 'hex', id: 'wild-1' }, mutation: { fieldPath: 'terrain', newValue: 'jungle' } } });
  doesNotThrow('gm-fiat on a domainless top-level hex applies (not "not found")', () => ACKS.applyEvent(c, ev));
  ok('  domainless hex.terrain set to jungle', c.hexes[0].terrain === 'jungle');
  // a domained hex still resolves (reference-unified: same object in campaign.hexes + domain geo)
  const c2 = ACKS.blankCampaign();
  const h = { id: 'h-shared', domainId: 'dom-9', coord: { q: 0, r: 0 }, notes: '' };
  c2.hexes = [h];
  c2.domains = [{ id: 'dom-9', name: 'D', geography: { hexes: [h] } }];
  const ev2 = ACKS.newEvent('gm-fiat', { submittedBy: 'gm', payload: { target: { kind: 'hex', id: 'h-shared' }, mutation: { fieldPath: 'notes', newValue: 'edited' } } });
  doesNotThrow('gm-fiat on a domained hex still applies', () => ACKS.applyEvent(c2, ev2));
  ok('  domained hex edit reflected in both views (reference-unified)', c2.hexes[0].notes === 'edited' && c2.domains[0].geography.hexes[0].notes === 'edited');
})();

// =============================================================================
section('gm-fiat party location — emits a logged event with a humane narrative');
// =============================================================================
// A GM moving a party between hexes routes through commitStatEdit -> gm-fiat, so the move lands
// in the log. The party resolves via the Entity Registry default case in applyEvent_gmFiat;
// _humanizeFiatNarrative renders "Placed/Moved/Cleared <party> ... <col·row> · Settlement" rather than
// the raw-id generic template.
(function () {
  function fixture() {
    const c = ACKS.blankCampaign();
    c.hexes = [
      { id: 'hex-a', coord: { q: 0, r: 0 }, settlement: { id: 'set-a', name: 'Saltspur' } },
      { id: 'hex-b', coord: { q: 2, r: -1 } }
    ];
    c.parties = [{ id: 'prt-1', name: "Aelric's party", currentHexId: null }];
    return c;
  }
  // null -> hex : applies + "Placed ... at 0000 · Saltspur"
  const c1 = fixture();
  const ev1 = ACKS.newEvent('gm-fiat', { submittedBy: 'gm', payload: { target: { kind: 'party', id: 'prt-1' }, mutation: { fieldPath: 'currentHexId', newValue: 'hex-a' } } });
  let r1;
  doesNotThrow('gm-fiat party currentHexId applies (party resolves via Entity Registry)', () => { r1 = ACKS.applyEvent(c1, ev1); });
  ok('  party.currentHexId set to hex-a', c1.parties[0].currentHexId === 'hex-a');
  ok('  narrative: Placed ... at 0000 · Saltspur', /^Placed .* at 0000 · Saltspur/.test((r1 && r1.result && r1.result.narrativeSummary) || ''), (r1 && r1.result && r1.result.narrativeSummary));
  // hex -> hex : "Moved ... to 0200 (from 0000 · Saltspur)"
  const c2 = fixture(); c2.parties[0].currentHexId = 'hex-a';
  const ev2 = ACKS.newEvent('gm-fiat', { submittedBy: 'gm', payload: { target: { kind: 'party', id: 'prt-1' }, mutation: { fieldPath: 'currentHexId', newValue: 'hex-b' } } });
  const r2 = ACKS.applyEvent(c2, ev2);
  ok('  party moved to hex-b', c2.parties[0].currentHexId === 'hex-b');
  ok('  narrative: Moved ... to 0200 (from 0000 · Saltspur)', /^Moved .* to 0200.*from 0000 · Saltspur/.test((r2 && r2.result && r2.result.narrativeSummary) || ''), (r2 && r2.result && r2.result.narrativeSummary));
  // hex -> null : "Cleared the location of ..."
  const c3 = fixture(); c3.parties[0].currentHexId = 'hex-a';
  const ev3 = ACKS.newEvent('gm-fiat', { submittedBy: 'gm', payload: { target: { kind: 'party', id: 'prt-1' }, mutation: { fieldPath: 'currentHexId', newValue: null } } });
  const r3 = ACKS.applyEvent(c3, ev3);
  ok('  party location cleared', !c3.parties[0].currentHexId);
  ok('  narrative: Cleared the location of ...', /^Cleared the location of /.test((r3 && r3.result && r3.result.narrativeSummary) || ''), (r3 && r3.result && r3.result.narrativeSummary));
})();

// =============================================================================
section('gm-fiat party leader — humane narrative on leaderCharacterId');
// =============================================================================
// "Make leader" routes through commitStatEdit -> gm-fiat on party.leaderCharacterId.
// _humanizeFiatNarrative renders "Made <new> leader of <party> (replacing <old>)".
(function () {
  const c = ACKS.blankCampaign();
  c.characters = [{ id: 'chr-a', name: 'Aelric' }, { id: 'chr-b', name: 'Tomas' }];
  c.parties = [{ id: 'prt-1', name: "Aelric's party", leaderCharacterId: 'chr-a' }];
  const ev = ACKS.newEvent('gm-fiat', { submittedBy: 'gm', payload: { target: { kind: 'party', id: 'prt-1' }, mutation: { fieldPath: 'leaderCharacterId', newValue: 'chr-b' } } });
  let r;
  doesNotThrow('gm-fiat party leaderCharacterId applies (resolves via Entity Registry)', () => { r = ACKS.applyEvent(c, ev); });
  ok('  leaderCharacterId set to chr-b', c.parties[0].leaderCharacterId === 'chr-b');
  ok('  narrative: Made Tomas leader of … (replacing Aelric)', /^Made Tomas leader of .*\(replacing Aelric\)/.test((r && r.result && r.result.narrativeSummary) || ''), (r && r.result && r.result.narrativeSummary));
  // null -> a leader : "Made … leader of …" with no "(replacing …)"
  const c2 = ACKS.blankCampaign();
  c2.characters = [{ id: 'chr-a', name: 'Aelric' }];
  c2.parties = [{ id: 'prt-1', name: 'Scouts', leaderCharacterId: null }];
  const ev2 = ACKS.newEvent('gm-fiat', { submittedBy: 'gm', payload: { target: { kind: 'party', id: 'prt-1' }, mutation: { fieldPath: 'leaderCharacterId', newValue: 'chr-a' } } });
  const r2 = ACKS.applyEvent(c2, ev2);
  ok('  narrative: Made Aelric leader of Scouts (no "replacing")', /^Made Aelric leader of Scouts/.test((r2 && r2.result && r2.result.narrativeSummary) || '') && !/replacing/.test((r2 && r2.result && r2.result.narrativeSummary) || ''), (r2 && r2.result && r2.result.narrativeSummary));
})();

section('gm-fiat journey pace — humane narrative on journey.pace');
// =============================================================================
// "Current pace" (changeable mid-journey) routes through commitStatEdit -> gm-fiat on
// journey.pace. _humanizeFiatNarrative renders "Set <journey> to <pace> pace (was <old>)".
(function () {
  const c = ACKS.blankCampaign();
  c.journeys = [{ schemaVersion: 2, kind: 'journey', id: 'jrn-1', name: 'Saltspur Run', pace: 'normal', status: 'in-transit', participantCharacterIds: [], days: [] }];
  const ev = ACKS.newEvent('gm-fiat', { submittedBy: 'gm', payload: { target: { kind: 'journey', id: 'jrn-1' }, mutation: { fieldPath: 'pace', newValue: 'forced-march' } } });
  let r;
  doesNotThrow('gm-fiat journey pace applies (resolves via Entity Registry)', () => { r = ACKS.applyEvent(c, ev); });
  ok('  journey.pace set to forced-march', c.journeys[0].pace === 'forced-march');
  ok('  narrative: Set Saltspur Run to forced march pace (was normal)', /^Set Saltspur Run to forced march pace \(was normal\)/.test((r && r.result && r.result.narrativeSummary) || ''), (r && r.result && r.result.narrativeSummary));
  // no prior pace recorded : "Set … to … pace" with no "(was …)"
  const c2 = ACKS.blankCampaign();
  c2.journeys = [{ schemaVersion: 2, kind: 'journey', id: 'jrn-1', name: 'Trail', pace: null, status: 'in-transit', participantCharacterIds: [], days: [] }];
  const ev2 = ACKS.newEvent('gm-fiat', { submittedBy: 'gm', payload: { target: { kind: 'journey', id: 'jrn-1' }, mutation: { fieldPath: 'pace', newValue: 'half-speed' } } });
  const r2 = ACKS.applyEvent(c2, ev2);
  ok('  narrative: Set Trail to half speed pace (no "was")', /^Set Trail to half speed pace/.test((r2 && r2.result && r2.result.narrativeSummary) || '') && !/\(was/.test((r2 && r2.result && r2.result.narrativeSummary) || ''), (r2 && r2.result && r2.result.narrativeSummary));
})();

// =============================================================================
section('Hex domain reassignment — gm-fiat moves the geography.hexes mirror + logs (2026-06-03)');
// =============================================================================
// hex.domainId is the canonical truth; each domain's geography.hexes[] is the mirror. Setting domainId
// via gm-fiat (the hex panel / Inspector / an integrator) must re-home the hex AND read cleanly in the log.
function domainMoveFixture() {
  const c = ACKS.blankCampaign();
  c.currentTurn = 1;
  const hex = { id: 'hex-1', schemaVersion: 2, coord: { q: 151, r: 24 }, domainId: 'dom-a', terrain: 'plains' };
  c.domains = [
    { id: 'dom-a', name: 'March of Saltspur', geography: { hexes: [hex] } },
    { id: 'dom-b', name: 'Barony of Vale',    geography: { hexes: [] } },
  ];
  c.hexes = [hex];
  return { c, hex };
}
(() => { // direct reconciler
  const { c, hex } = domainMoveFixture();
  hex.domainId = 'dom-b';
  ACKS.reconcileHexDomainMembership(c, hex);
  ok('reconcile: removed from old domain geography', !c.domains[0].geography.hexes.some(h => h.id === 'hex-1'));
  ok('reconcile: added to new domain geography', c.domains[1].geography.hexes.some(h => h.id === 'hex-1'));
  ok('reconcile: still in campaign.hexes', c.hexes.some(h => h.id === 'hex-1'));
  ACKS.reconcileHexDomainMembership(c, hex); // idempotent
  ok('reconcile: idempotent (no duplicate)', c.domains[1].geography.hexes.filter(h => h.id === 'hex-1').length === 1);
  hex.domainId = null;
  ACKS.reconcileHexDomainMembership(c, hex);
  ok('reconcile → wild: in no domain geography', !c.domains[0].geography.hexes.some(h => h.id === 'hex-1') && !c.domains[1].geography.hexes.some(h => h.id === 'hex-1'));
  ok('reconcile → wild: still in campaign.hexes', c.hexes.some(h => h.id === 'hex-1'));
})();
(() => { // via gm-fiat (the path the hex panel + Inspector use)
  const { c } = domainMoveFixture();
  const ev = ACKS.newEvent('gm-fiat', { submittedBy: 'gm', payload: { target: { kind: 'hex', id: 'hex-1' }, mutation: { fieldPath: 'domainId', newValue: 'dom-b' }, reason: 'Hex reassigned' } });
  const r = ACKS.applyEvent(c, ev);
  ok('gm-fiat: hex.domainId set to dom-b', c.hexes[0].domainId === 'dom-b');
  ok('gm-fiat: moved out of dom-a geography', !c.domains[0].geography.hexes.some(h => h.id === 'hex-1'));
  ok('gm-fiat: moved into dom-b geography', c.domains[1].geography.hexes.some(h => h.id === 'hex-1'));
  const narr = (r && r.result && r.result.narrativeSummary) || '';
  ok('gm-fiat: clean narrative (Moved hex 151099 from … to …)', /^Moved hex 151099 from March of Saltspur to Barony of Vale/.test(narr), narr);
})();
(() => { // via gm-fiat to unclaimed wilderness
  const { c } = domainMoveFixture();
  const ev = ACKS.newEvent('gm-fiat', { submittedBy: 'gm', payload: { target: { kind: 'hex', id: 'hex-1' }, mutation: { fieldPath: 'domainId', newValue: null } } });
  const r = ACKS.applyEvent(c, ev);
  ok('gm-fiat → wild: removed from dom-a geography', !c.domains[0].geography.hexes.some(h => h.id === 'hex-1'));
  ok('gm-fiat → wild: domainId cleared', !c.hexes[0].domainId);
  const narr = (r && r.result && r.result.narrativeSummary) || '';
  ok('gm-fiat → wild: narrative mentions unclaimed wilderness', /Released hex 151099 .*unclaimed wilderness/.test(narr), narr);
})();

// ─── summary ───
console.log('\n=============================================');
console.log('events.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if (fail > 0) {
  console.log('\nFAILURES:\n  ' + failures.join('\n  '));
  process.exit(1);
}
