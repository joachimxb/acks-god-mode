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
section('Domain classification — stored wins, derived is a suggestion (RR p.340)');
// =============================================================================
ok('effectiveDomainClassification exported', typeof ACKS.effectiveDomainClassification === 'function');
ok('suggestDomainClassification exported', typeof ACKS.suggestDomainClassification === 'function');
// A domain whose families/morale/hexes would DERIVE Civilized, but is authored Borderlands.
const authoredBorder = { classification: 'Borderlands', demographics: { peasantFamilies: 400, morale: 1 }, geography: { controlledHexes: 8 } };
ok('derived suggestion would be Civilized', ACKS.suggestDomainClassification(authoredBorder) === 'Civilized');
ok('stored Borderlands wins over derived Civilized', ACKS.effectiveDomainClassification(authoredBorder) === 'Borderlands');
ok('Borderlands → garrison rate 3 (not 2)', ACKS.REQUIRED_GARRISON_PER_FAMILY[ACKS.effectiveDomainClassification(authoredBorder)] === 3);
ok('Borderlands → base morale -1 (not 0)', ACKS.baseMoraleFromClassification(ACKS.effectiveDomainClassification(authoredBorder), { personalAuthority: 0 }) === -1);
// No stored value → falls back to the suggestion.
const noStored = { demographics: { peasantFamilies: 400, morale: 1 }, geography: { controlledHexes: 8 } };
ok('no stored classification → uses suggestion (Civilized)', ACKS.effectiveDomainClassification(noStored) === 'Civilized');
// Invalid stored value is ignored (falls back to suggestion).
ok('invalid stored value ignored', ACKS.effectiveDomainClassification({ classification: 'Atlantis', demographics: { peasantFamilies: 10 } }) === 'Outlands');
// Suggestion thresholds (preserve prior heuristic exactly).
ok('suggest Outlands when sparse', ACKS.suggestDomainClassification({ demographics: { peasantFamilies: 40 } }) === 'Outlands');
ok('suggest Borderlands at fam>=75 low morale', ACKS.suggestDomainClassification({ demographics: { peasantFamilies: 200, morale: 0 } }) === 'Borderlands');

// =============================================================================
section('Stronghold-inadequacy morale penalty (RR p.349 — acks-authority Critical)');
// =============================================================================
ok('strongholdMoralePenalty exported', typeof ACKS.strongholdMoralePenalty === 'function');
ok('no hexes / req 0 → 0', ACKS.strongholdMoralePenalty(0, 0) === 0);
ok('at minimum → 0', ACKS.strongholdMoralePenalty(150000, 150000) === 0);
ok('above minimum → 0', ACKS.strongholdMoralePenalty(200000, 150000) === 0);
ok('half (>=½ min) → -1', ACKS.strongholdMoralePenalty(80000, 150000) === -1);
ok('exactly half → -1', ACKS.strongholdMoralePenalty(75000, 150000) === -1);
ok('quarter (>=¼ min) → -2', ACKS.strongholdMoralePenalty(40000, 150000) === -2);
ok('exactly quarter → -2', ACKS.strongholdMoralePenalty(37500, 150000) === -2);
// acks-authority worked example: a 5,000gp tower over 10 hexes (req 150,000gp) → -3
ok('5,000gp tower over 10 hexes → -3 (audit example)', ACKS.strongholdMoralePenalty(5000, 10 * ACKS.STRONGHOLD_VALUE_PER_HEX) === -3);
ok('just below quarter → -3', ACKS.strongholdMoralePenalty(37499, 150000) === -3);

// =============================================================================
section('Security — prototype-pollution guard (appsec C1)');
// =============================================================================
ok('_setByPath exported', typeof ACKS._setByPath === 'function');
throws('_setByPath blocks __proto__.x', () => ACKS._setByPath({}, '__proto__.polluted', 'PWNED'));
ok('Object.prototype not polluted via __proto__', ({}).polluted === undefined);
throws('_setByPath blocks constructor.prototype.x', () => ACKS._setByPath({}, 'constructor.prototype.polluted2', 'PWNED'));
ok('Object.prototype not polluted via constructor', ({}).polluted2 === undefined);
doesNotThrow('_setByPath allows a normal nested path', () => { const o = {}; ACKS._setByPath(o, 'a.b.c', 1); ok('normal path wrote', o.a.b.c === 1); });
// validateEvent fieldPath checks
throws('validateEvent rejects __proto__ in gm-fiat mutation.fieldPath', () => ACKS.validateEvent(ACKS.newEvent('gm-fiat', { payload: { target: { kind: 'campaign', id: 'x' }, mutation: { fieldPath: '__proto__.polluted', newValue: 1 } } })));
throws('validateEvent rejects __proto__ in character-update fieldUpdates key', () => ACKS.validateEvent(ACKS.newEvent('character-update', { payload: { characterId: 'chr-x', fieldUpdates: { '__proto__.x': 1 } } })));
doesNotThrow('validateEvent allows a legit hyphenated gm-fiat path', () => ACKS.validateEvent(ACKS.newEvent('gm-fiat', { payload: { target: { kind: 'domain', id: 'd' }, mutation: { fieldPath: 'magistrates.captain-of-the-guard.administersThisMonth', newValue: true } } })));
doesNotThrow('validateEvent allows a numeric-index gm-fiat path', () => ACKS.validateEvent(ACKS.newEvent('gm-fiat', { payload: { target: { kind: 'character', id: 'c' }, mutation: { fieldPath: 'inventory.0.gp', newValue: 5 } } })));
// end-to-end: applyEvent (which calls validateEvent) refuses the pollution event
throws('applyEvent refuses __proto__ gm-fiat end-to-end', () => {
  const c = ACKS.blankCampaign({ name: 'sec' });
  ACKS.applyEvent(c, ACKS.newEvent('gm-fiat', { payload: { target: { kind: 'campaign', id: c.id }, mutation: { fieldPath: '__proto__.polluted3', newValue: 'x' } } }));
});
ok('Object.prototype still clean after end-to-end attempt', ({}).polluted3 === undefined);

// =============================================================================
section('Data integrity — demo is a migrate no-op; registry matches factories');
// =============================================================================
// The shipped demo was regenerated through migrateCampaign, so loading it and migrating
// again must change nothing (integration audit Critical: the sample must agree with the loader).
deepEq('migrate(demo) is a no-op (demo === migrate(demo))', ACKS.migrateCampaign(clone(DEMO)), clone(DEMO));
ok('demo ships WIL, not WIS', /"WIL"/.test(JSON.stringify(DEMO)) && !/"WIS"/.test(JSON.stringify(DEMO)));
ok('demo settlements have array entryways/regulatedAssets', (DEMO.settlements || []).every(s => Array.isArray(s.entryways) && Array.isArray(s.regulatedAssets)));
ok('demo eventLog entries all carry a known kind (no kind:undefined)', (DEMO.eventLog || []).every(e => ACKS.EVENT_KINDS.includes((e.event && e.event.kind) || e.kind)));

// Entity Registry displayName accessors must only reference fields the matching blankX()
// factory emits (integration audit: stash/venture/henchmanship/tributaryAgreement read
// fields the factory didn't write → undefined/'?'). General check via an access-recording Proxy.
(function () {
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const entries = ACKS.ENTITY_KINDS_LIST || [];
  let checked = 0, bad = 0;
  for (const e of entries) {
    if (!e || !e.kind || typeof e.displayName !== 'function') continue;
    const factory = ACKS['blank' + cap(e.kind)];
    if (typeof factory !== 'function') continue; // kinds without a blankX factory (campaign-level collections etc.)
    let blank; try { blank = factory({}); } catch (_) { continue; }
    const factoryKeys = new Set(Object.keys(blank));
    const accessed = new Set();
    const proxy = new Proxy(blank, { get(t, k) { if (typeof k === 'string') accessed.add(k); return t[k]; } });
    try { e.displayName({}, proxy); } catch (_) { /* nested access on a null field */ }
    const extras = [...accessed].filter(k => !factoryKeys.has(k));
    checked++;
    if (extras.length) { bad++; ok('registry ' + e.kind + ' displayName reads only factory fields', false, 'reads [' + extras.join(', ') + '] not emitted by blank' + cap(e.kind)); }
  }
  ok('all registry displayName accessors match their factories (' + checked + ' kinds checked)', bad === 0);
})();

// =============================================================================
section('Stash field-schema ↔ factory reconciliation (Wave B.6 Step 0)');
// =============================================================================
// The Inspector's stash editor writes through the field-schema, so every field it
// references must be one blankStash/blankStashItem actually emits — else the GM edits
// phantom fields the setters never read. (Mirrors the registry-vs-factory invariant.)
const stashSchema = ACKS.fieldSchemaFor('stash');
ok('stash field-schema exists', !!stashSchema);
const stashKeys = new Set(Object.keys(ACKS.blankStash({})));
const stashFieldNames = ((stashSchema && stashSchema.fields) || []).map(f => f.name);
const stashExtras = stashFieldNames.filter(n => !stashKeys.has(n));
ok('stash schema fields ⊆ blankStash keys', stashExtras.length === 0, 'extras: [' + stashExtras.join(', ') + ']');
ok('stash uses canonical name (not label)', stashFieldNames.includes('name') && !stashFieldNames.includes('label'));
ok('stash uses canonical kind (not stashKind)', stashFieldNames.includes('kind') && !stashFieldNames.includes('stashKind'));
ok('stash uses canonical isHidden (not hidden)', stashFieldNames.includes('isHidden') && !stashFieldNames.includes('hidden'));
ok('stash has no separate coins[] (coins are items with kind:coin)', !stashFieldNames.includes('coins'));
// items itemSchema sub-fields ⊆ the union of blankStashItem's coin/bulk/item variant keys
const stashItemKeys = new Set([
  ...Object.keys(ACKS.blankStashItem({ kind: 'coin' })),
  ...Object.keys(ACKS.blankStashItem({ kind: 'bulk' })),
  ...Object.keys(ACKS.blankStashItem({ kind: 'item' })),
]);
const itemsField = ((stashSchema && stashSchema.fields) || []).find(f => f.name === 'items');
ok('stash items is an array field with an itemSchema', !!itemsField && itemsField.type === 'array' && !!(itemsField.itemSchema && itemsField.itemSchema.fields));
const stashSubNames = ((itemsField && itemsField.itemSchema && itemsField.itemSchema.fields) || []).map(f => f.name);
const stashSubExtras = stashSubNames.filter(n => !stashItemKeys.has(n));
ok('stash items itemSchema sub-fields ⊆ blankStashItem keys', stashSubExtras.length === 0, 'extras: [' + stashSubExtras.join(', ') + ']');
ok('stash field-schema validates clean', ACKS.validateFieldSchema('stash', stashSchema).ok);

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
