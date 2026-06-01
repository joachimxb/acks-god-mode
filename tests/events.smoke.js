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
  'acks-engine-catalogs.js',
  'acks-engine.js',
  'acks-engine-entities.js',
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
//   ── further sections appended by later commits in this pass ──
//   P3.7 table-driven event-kind smoke
// =============================================================================

// ─── summary ───
console.log('\n=============================================');
console.log('events.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if (fail > 0) {
  console.log('\nFAILURES:\n  ' + failures.join('\n  '));
  process.exit(1);
}
