/* tests/smoke.js — committed engine smoke suite.
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/smoke.js
 *
 * Plain Node, no dependencies. Loads all seven engine modules headless (each is an
 * IIFE that accumulates onto global.ACKS) plus the demo template, and asserts on the
 * PURE functions + the load/migration/validation invariants the tool depends on.
 *
 * Stood up 2026-05-31 during the post-audit Foundation course-correction: the prior
 * smoke harnesses lived in a gitignored scratch dir and were never runnable from the
 * repo, so every "N assertions passing" claim was unreproducible. This file is the
 * runnable replacement. Each subsequent foundation fix adds its own assertions here
 * so the fix is protected against regression.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const assert = require('assert');

const DIR = path.join(__dirname, '..');
// Load order matters (catalogs → engine → entities → entity-registry →
// field-schemas → events → subsystems); each module extends global.ACKS.
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

// The demo template self-registers global.ACKS_DEMO_TEMPLATE.
require(path.join(DIR, 'acks-demo-template.js'));
const DEMO = global.ACKS_DEMO_TEMPLATE;

// ─── tiny assertion harness ───
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
section('Engine loads headless');
// =============================================================================
ok('ACKS namespace present', ACKS && typeof ACKS === 'object');
ok('SCHEMA_VERSION is 2', ACKS.SCHEMA_VERSION === 2);
ok('exports > 300 symbols', Object.keys(ACKS).length > 300, 'got ' + Object.keys(ACKS).length);
ok('demo template loaded', DEMO && DEMO.kind === 'campaign');

// =============================================================================
section('bankersRound — round-half-to-even (RR r4 banker\'s rounding)');
// =============================================================================
ok('2.5 → 2 (down to even)', ACKS.bankersRound(2.5) === 2);
ok('3.5 → 4 (up to even)', ACKS.bankersRound(3.5) === 4);
ok('0.5 → 0', ACKS.bankersRound(0.5) === 0);
ok('1.5 → 2', ACKS.bankersRound(1.5) === 2);
ok('4.5 → 4', ACKS.bankersRound(4.5) === 4);
ok('2.4 → 2 (normal down)', ACKS.bankersRound(2.4) === 2);
ok('2.6 → 3 (normal up)', ACKS.bankersRound(2.6) === 3);
ok('integer passthrough 7 → 7', ACKS.bankersRound(7) === 7);

// =============================================================================
section('roundToNearest5 — tribute rounding policy (RR r4 errata §1.2)');
// =============================================================================
ok('roundToNearest5 exported', typeof ACKS.roundToNearest5 === 'function');
ok('12 → 10', ACKS.roundToNearest5(12) === 10);
ok('13 → 15', ACKS.roundToNearest5(13) === 15);
ok('17 → 15', ACKS.roundToNearest5(17) === 15);
ok('18 → 20', ACKS.roundToNearest5(18) === 20);
ok('0 → 0', ACKS.roundToNearest5(0) === 0);
ok('exact 25 → 25', ACKS.roundToNearest5(25) === 25);
ok('null/undefined → 0', ACKS.roundToNearest5(undefined) === 0 && ACKS.roundToNearest5(null) === 0);

// =============================================================================
section('Economic / morale math boundaries (pure engine fns)');
// =============================================================================
// Garrison required rate by classification (RR p.350-351)
ok('garrison rate Civilized = 2', ACKS.REQUIRED_GARRISON_PER_FAMILY.Civilized === 2);
ok('garrison rate Borderlands = 3', ACKS.REQUIRED_GARRISON_PER_FAMILY.Borderlands === 3);
ok('garrison rate Outlands = 4', ACKS.REQUIRED_GARRISON_PER_FAMILY.Outlands === 4);
// Base morale from classification + ruler PA (RR p.349)
ok('baseMorale Civilized PA0 = 0', ACKS.baseMoraleFromClassification('Civilized', { personalAuthority: 0 }) === 0);
ok('baseMorale Borderlands PA0 = -1', ACKS.baseMoraleFromClassification('Borderlands', { personalAuthority: 0 }) === -1);
ok('baseMorale Outlands PA0 = -2', ACKS.baseMoraleFromClassification('Outlands', { personalAuthority: 0 }) === -2);
ok('baseMorale Borderlands PA+2 = +1', ACKS.baseMoraleFromClassification('Borderlands', { personalAuthority: 2 }) === 1);
// Morale change from adjusted roll (RR p.350 morale check bands)
ok('moraleChange adjusted<=2 → -2', ACKS.moraleChangeFromRoll(2, 0, 0) === -2);
ok('moraleChange adjusted 3..5 → -1', ACKS.moraleChangeFromRoll(5, 0, 0) === -1);
ok('moraleChange adjusted 6..8 at base → 0', ACKS.moraleChangeFromRoll(8, 0, 0) === 0);
ok('moraleChange adjusted 9..11 → +1', ACKS.moraleChangeFromRoll(11, 0, 0) === 1);
ok('moraleChange adjusted >=12 → +2', ACKS.moraleChangeFromRoll(12, 0, 0) === 2);
// Personal-authority bracket from domain income (RR p.423)
ok('PA bracket monotonic non-decreasing', (() => {
  let prev = -1, mono = true;
  for (const gp of [0, 100, 1000, 10000, 100000, 1000000]) {
    const b = ACKS.personalAuthorityBracketForIncome(gp);
    if (b < prev) mono = false;
    prev = b;
  }
  return mono;
})());

// =============================================================================
section('migrateCampaign — idempotent + collection-preserving (demo template)');
// =============================================================================
const demoM1 = ACKS.migrateCampaign(clone(DEMO));
const demoM2 = ACKS.migrateCampaign(clone(demoM1));
deepEq('migrate(migrate(demo)) === migrate(demo)', demoM2, demoM1);
['domains', 'characters', 'settlements', 'rumors', 'ventures'].forEach(c => {
  ok('demo preserves ' + c + ' count (no silent drop)', (clone(DEMO)[c] || []).length === (demoM1[c] || []).length,
    (clone(DEMO)[c] || []).length + ' → ' + (demoM1[c] || []).length);
});
ok('demo abilities migrated WIS → WIL', !/"WIS"/.test(JSON.stringify(demoM1)) && /"WIL"/.test(JSON.stringify(demoM1)));
ok('demo top-level settlement entryways are arrays', (demoM1.settlements || []).every(s => Array.isArray(s.entryways) && Array.isArray(s.regulatedAssets)));

// =============================================================================
section('migrateCampaign — idempotent on a hand-built legacy-shaped fixture');
// =============================================================================
function legacyFixture() {
  return {
    schemaVersion: 2, kind: 'campaign', id: 'cmp-legacy-fixture', name: 'Legacy Fixture',
    createdAt: '2026-01-01', lastModifiedAt: '2026-01-01', currentTurn: 3,
    houseRules: {},
    domains: [{
      schemaVersion: 2, id: 'dom-legacy', name: 'Old March', classification: 'Borderlands',
      demographics: { peasantFamilies: 200, morale: 0, urbanFamilies: 0 },
      income: { landRevenuePerFamily: 5, serviceRevenuePerFamily: 4 },
      expenses: { tithePaid: true, liturgyPerFamily: 1 },
      taxPolicy: { rate: 'normal' },
      treasury: { gp: 1000 },
      garrison: { units: [] },
      stronghold: { buildValue: 45000 },
      liegeId: null, magistrates: {},
      geography: {
        controlledHexes: 3,
        hexes: [
          { id: 'hex-legacy-1', coord: { q: 0, r: 0 }, families: 60 },
          { id: 'hex-legacy-2', coord: { q: 1, r: 0 }, families: 70 },
          { id: 'hex-legacy-3', coord: { q: 0, r: 1 }, families: 70 },
        ],
      },
    }],
    characters: [{
      schemaVersion: 2, id: 'chr-legacy', name: 'Old Ruler', kind: 'pc',
      abilities: { STR: 10, INT: 10, WIS: 13, DEX: 10, CON: 10, CHA: 10 },
      hp: { current: 20, max: 20 }, xp: 50000, level: 5,
    }],
    settlements: [{ schemaVersion: 2, id: 'set-legacy', name: 'Old Town', hexId: 'hex-legacy-1', entryways: null, regulatedAssets: null }],
    parties: [{ schemaVersion: 2, id: 'pty-legacy', name: 'Old Party' }],
    ventures: [], passiveInvestments: [],
    hexes: [], rumors: [], pendingEvents: [], eventLog: [],
  };
}
doesNotThrow('legacy fixture migrates without throwing', () => ACKS.migrateCampaign(legacyFixture()));
const legM1 = ACKS.migrateCampaign(legacyFixture());
const legM2 = ACKS.migrateCampaign(clone(legM1));
deepEq('migrate(migrate(legacy)) === migrate(legacy)', legM2, legM1);
ok('legacy WIS → WIL', legM1.characters[0].abilities.WIL === 13 && legM1.characters[0].abilities.WIS === undefined);
ok('legacy settlement entryways null → []', Array.isArray(legM1.settlements[0].entryways) && legM1.settlements[0].entryways.length === 0);
ok('legacy settlement regulatedAssets null → []', Array.isArray(legM1.settlements[0].regulatedAssets));
ok('legacy party gets status field', legM1.parties[0].status === 'active');
ok('legacy preserves domain count', legM1.domains.length === 1);
ok('legacy preserves character count', legM1.characters.length === 1);

// =============================================================================
section('validateCampaign — flags duplicate ids + non-unique hex coords');
// =============================================================================
doesNotThrow('validateCampaign(migrated demo) ok', () => {
  const r = ACKS.validateCampaign(demoM1);
  ok('migrated demo is valid', r.ok === true, (r.errors || []).join('; '));
});
// duplicate entity id
const dupId = legacyFixture();
dupId.characters.push(clone(dupId.characters[0])); // same id chr-legacy twice
const rDup = ACKS.validateCampaign(dupId);
ok('duplicate character id flagged', rDup.ok === false && rDup.errors.some(e => /Duplicate id/.test(e)), (rDup.errors || []).join('; '));
// non-unique hex coords
const dupHex = legacyFixture();
dupHex.domains[0].geography.hexes[1].coord = { q: 0, r: 0 }; // collide with hex-legacy-1
const rHex = ACKS.validateCampaign(dupHex);
ok('duplicate hex coord flagged', rHex.ok === false && rHex.errors.some(e => /Duplicate hex coord/.test(e)), (rHex.errors || []).join('; '));
// missing required collections
const noColl = { kind: 'campaign', schemaVersion: 2, id: 'cmp-x' };
ok('missing domains array flagged', ACKS.validateCampaign(noColl).ok === false);

// =============================================================================
section('validateEvent — rejects malformed / bad payloads');
// =============================================================================
const goodEv = ACKS.newEvent('treasury-grant', { payload: { domainId: 'dom-x', amount: 100, label: 'ok' } });
doesNotThrow('well-formed event passes', () => ACKS.validateEvent(goodEv));
throws('unknown kind rejected', () => ACKS.validateEvent({ id: 'evt-x', kind: 'no-such-kind', submittedBy: 'gm', submittedAt: 'now', targetTurn: 1, status: 'pending', payload: {} }));
throws('missing id rejected', () => ACKS.validateEvent({ kind: 'treasury-grant', submittedBy: 'gm', submittedAt: 'now', targetTurn: 1, status: 'pending', payload: { domainId: 'd', amount: 1, label: 'x' } }));
throws('missing required payload field rejected', () => ACKS.validateEvent(ACKS.newEvent('treasury-grant', { payload: { domainId: 'dom-x' } })));
throws('bad submittedBy rejected', () => ACKS.validateEvent({ id: 'evt-y', kind: 'treasury-grant', submittedBy: 'hacker!!', submittedAt: 'now', targetTurn: 1, status: 'pending', payload: { domainId: 'd', amount: 1, label: 'x' } }));

// =============================================================================
section('Summary');
// =============================================================================
console.log('  Passed: ' + pass);
console.log('  Failed: ' + fail);
if (fail === 0) {
  console.log('\nAll engine smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nFAILURES:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
