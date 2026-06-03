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
section('Global schema ⊆ factory invariant (Wave C Step 2 — closes the drift bug class)');
// =============================================================================
// For every kind with a field-schema: the named factory must exist, and every schema
// field (top-level + object sub-fields, excluding computed/derived) must be a key the
// factory actually emits. Generalizes the B.6/Step-0 stash check so schema↔factory drift
// (the WIS/label/coins/blankOutpost class of bug) can never recur silently.
(function () {
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  for (const kind of ACKS.kindsWithSchema()) {
    const schema = ACKS.fieldSchemaFor(kind);
    const factoryName = schema.factory || ('blank' + cap(kind));
    const factory = ACKS[factoryName];
    ok('schema "' + kind + '" names a real factory (' + factoryName + ')', typeof factory === 'function');
    if (typeof factory !== 'function') continue;
    let blank;
    try { blank = factory({}); } catch (e) { ok('factory ' + factoryName + '({}) constructs', false, e.message); continue; }
    const keys = new Set(Object.keys(blank));
    const topExtras = schema.fields.filter(f => f.type !== 'computed').map(f => f.name).filter(n => !keys.has(n));
    ok('schema "' + kind + '" top-level fields ⊆ ' + factoryName + ' keys', topExtras.length === 0, 'extras: [' + topExtras.join(', ') + ']');
    // object sub-fields ⊆ the factory's nested object keys (when the factory pre-populates one)
    for (const f of schema.fields.filter(f => f.type === 'object')) {
      const nested = blank[f.name];
      if (nested && typeof nested === 'object' && !Array.isArray(nested)) {
        const nestedKeys = new Set(Object.keys(nested));
        const subExtras = (f.fields || []).filter(s => s.type !== 'computed').map(s => s.name).filter(n => !nestedKeys.has(n));
        ok('schema "' + kind + '" object "' + f.name + '" sub-fields ⊆ factory nested keys', subExtras.length === 0, 'extras: [' + subExtras.join(', ') + ']');
      }
    }
  }
})();

// =============================================================================
section('object field-type validator + convention (Wave C Step 1)');
// =============================================================================
ok('object is a valid field type', ACKS.isValidFieldType('object'));
// A well-formed object field carries a non-empty fields[] (sub-schema), recursively validated.
const goodObjSchema = { fields: [
  { name: 'groupTemplate', type: 'object', fields: [
    { name: 'monsterCatalogKey', type: 'string' },
    { name: 'creatureTypes', type: 'enumMulti', enumValues: ['humanoid', 'beast', 'dragon'] },
    { name: 'hitDice', type: 'number' },
  ] },
] };
const goodObj = ACKS.validateFieldSchema('test', goodObjSchema);
ok('valid object-field schema passes', goodObj.ok === true, (goodObj.errors || []).join('; '));
// Malformed: object with no fields[] is rejected.
const noFields = ACKS.validateFieldSchema('test', { fields: [{ name: 'tmpl', type: 'object' }] });
ok('object without fields[] rejected', noFields.ok === false && noFields.errors.some(e => /object type requires/.test(e)));
// Malformed: empty fields[] is rejected.
ok('object with empty fields[] rejected', ACKS.validateFieldSchema('test', { fields: [{ name: 'tmpl', type: 'object', fields: [] }] }).ok === false);
// A bad sub-field inside an object is caught recursively.
const badSub = ACKS.validateFieldSchema('test', { fields: [{ name: 'tmpl', type: 'object', fields: [{ name: 'x', type: 'notatype' }] }] });
ok('bad sub-field type inside object rejected', badSub.ok === false && badSub.errors.some(e => /invalid type/.test(e)));

// =============================================================================
// -----------------------------------------------------------------------------
// Calendar day-tick pipeline (Phase 2.95 C3/C4/C6/C7)
// -----------------------------------------------------------------------------
section('Calendar day-tick pipeline (Phase 2.95)');
(function dayTickTests(){
  function mkCamp(){
    const c = ACKS.blankCampaign({ name: 'day-tick' });
    if(!c.calendar) c.calendar = { year:1, month:1, day:1 };
    c.currentDayInMonth = 1; c.calendar.day = 1;
    c.projects = c.projects || [];
    c.eventLog = c.eventLog || [];
    c.houseRules = c.houseRules || {};
    return c;
  }
  function mkProject(over){
    return Object.assign({ id:'prj-'+Math.random().toString(36).slice(2,8), constructibleKind:'tower', lifecycleState:'under-construction', workerCounts:{ laborers:10 }, laborInvested:0, laborRequired:1e9, daysElapsed:0 }, over||{});
  }

  ok('day-tick: registerDayConsumer exported', typeof ACKS.registerDayConsumer === 'function');
  ok('day-tick: proposeDayTick exported', typeof ACKS.proposeDayTick === 'function');
  ok('day-tick: commitDayTick exported', typeof ACKS.commitDayTick === 'function');
  ok('day-tick: runDayTickToMonthEnd exported', typeof ACKS.runDayTickToMonthEnd === 'function');
  ok('day-tick: advanceCalendarOneDay exported', typeof ACKS.advanceCalendarOneDay === 'function');
  ok('day-tick: 10 day-tick house rules registered', ACKS.HOUSERULES_REGISTRY.filter(function(r){return r.category==='world' && /pause|journey|weather|fatigue|wandering|rations|subsumes/.test(r.id);}).length >= 10);

  // advanceCalendarOneDay increments + clamps at 30, no month rollover
  const ca = mkCamp();
  ACKS.advanceCalendarOneDay(ca);
  ok('advanceCalendarOneDay: 1 -> 2', ca.currentDayInMonth === 2);
  ca.currentDayInMonth = 30; ACKS.advanceCalendarOneDay(ca);
  ok('advanceCalendarOneDay: clamps at 30 (no rollover)', ca.currentDayInMonth === 30);

  // Construction advances via the day-tick: propose is non-mutating, commit applies
  const cc = mkCamp();
  cc.projects.push(mkProject({ id:'prj-c1', laborRequired:1000 }));
  const prop = ACKS.proposeDayTick(cc, 1, {});
  ok('day-tick: one pending construction record after Tick Day', prop.pendingRecords.length === 1);
  ok('day-tick: propose does NOT mutate the real campaign', cc.projects[0].laborInvested === 0);
  ACKS.commitDayTick(cc, prop, null);
  ok('day-tick: commit advances construction (daysElapsed)', cc.projects[0].daysElapsed === 1);
  ok('day-tick: commit advances the day clock 1 -> 2', cc.currentDayInMonth === 2);

  // A campaign with no day-aware activity is unchanged (idle state)
  const ci = mkCamp();
  const pi = ACKS.proposeDayTick(ci, 1, {});
  ok('day-tick: idle campaign produces no pending records', pi.pendingRecords.length === 0);
  ok('day-tick: idle campaign not in-flight', ACKS.dayTickActivityInFlight(ci) === false);

  // Tick Week advances up to 7 days; the per-day construction records collapse to ONE
  // summary line per project (no per-day spam), summing daysAdded for the commit.
  const cw = mkCamp();
  cw.projects.push(mkProject({ id:'prj-w' }));
  const pw = ACKS.proposeDayTick(cw, 7, {});
  ok('day-tick: Tick Week advances 7 days', pw.daysAdvanced === 7);
  ok('day-tick: 7 per-day records collapse to 1 summary record per project', pw.pendingRecords.length === 1);
  ok('day-tick: the merged record sums daysAdded to 7', pw.pendingRecords[0].daysAdded === 7);
  ok('day-tick: the merged label reads "over 7 days"', /over 7 days/.test(pw.pendingRecords[0].label || ''));
  ACKS.commitDayTick(cw, pw, null);
  ok('day-tick: clock at day 8 after Tick Week from day 1', cw.currentDayInMonth === 8);
  ok('day-tick: clock past day 1 => in-flight', ACKS.dayTickActivityInFlight(cw) === true);

  // tick -> pause -> resume -> commit cycle (mock consumer surfaces an encounter on day 3)
  const cp = mkCamp();
  ACKS.registerDayConsumer('test-pauser', {
    order: 35, pauseTriggers: ['encounter'],
    handler: function(camp, ctx){
      return {
        pendingRecords: [{ kind:'test', label:'day ' + ctx.dayInMonth }],
        notableEvents: (ctx.dayInMonth === 3) ? [{ kind:'encounter-check', type:'encounter', pauseTrigger:'encounter', primaryHexId:'hex-1', label:'goblins ambush!' }] : [],
        encounters: []
      };
    },
    commit: function(){}
  });
  const pp = ACKS.proposeDayTick(cp, 7, {});
  ok('day-tick: pipeline pauses when an encounter fires + auto-pause on', pp.paused === true);
  ok('day-tick: a pause reason was recorded', pp.pauseReasons.length >= 1);
  ok('day-tick: paused on the encounter day (day 3)', pp.toDay === 3);
  const cr = ACKS.commitDayTick(cp, pp, null);
  ok('day-tick: commit emits the encounter event to the log', cr.eventsEmitted >= 1);
  ok('day-tick: event landed in eventLog', (cp.eventLog || []).length >= 1);
  const lastEv = cp.eventLog[cp.eventLog.length - 1].event;
  ok('day-tick: emitted event carries the Event.context envelope', !!(lastEv && lastEv.context && ('primaryHexId' in lastEv.context)));
  ok('day-tick: context.primaryHexId populated from the record', lastEv.context.primaryHexId === 'hex-1');
  ok('day-tick: emitted event carries the gameTimeAt day stamp', !!(lastEv && lastEv.gameTimeAt && typeof lastEv.gameTimeAt.day === 'number'));
  ok('day-tick: emitted event uses the daily cadence', lastEv.cadence === 'daily');
  const pp2 = ACKS.proposeDayTick(cp, 7, {});
  ok('day-tick: resume advances further after a pause', pp2.daysAdvanced >= 1);
  ACKS.unregisterDayConsumer('test-pauser');

  // auto-pause OFF -> no pause (house rule gates the pause)
  const cn = mkCamp();
  cn.houseRules['auto-pause-on-encounter'] = false;
  ACKS.registerDayConsumer('test-pauser2', {
    order: 35, pauseTriggers: ['encounter'],
    handler: function(camp, ctx){ return { pendingRecords:[], notableEvents:[{ kind:'encounter-check', pauseTrigger:'encounter', label:'x' }], encounters:[] }; },
    commit: function(){}
  });
  const pn = ACKS.proposeDayTick(cn, 5, {});
  ok('day-tick: no pause when auto-pause-on-encounter is OFF', pn.paused === false);
  ok('day-tick: full 5 days advance when not paused', pn.daysAdvanced === 5);
  ACKS.unregisterDayConsumer('test-pauser2');

  // month-end subsume + currentDayInMonth lands on day 30
  const cm = mkCamp();
  cm.projects.push(mkProject({ id:'prj-m' }));
  cm.currentDayInMonth = 5; cm.calendar.day = 5;
  const beforeLabor = cm.projects[0].laborInvested;
  ACKS.runDayTickToMonthEnd(cm);
  ok('day-tick: runDayTickToMonthEnd advances construction (daysElapsed)', cm.projects[0].daysElapsed > 0);
  ok('day-tick: runDayTickToMonthEnd lands the clock on day 30', cm.currentDayInMonth === 30);
})();

// =============================================================================
section('families-per-hex-tracking — reconcile canonical direction (RR p.340 + CLAUDE #10)');
// =============================================================================
(function () {
  function mk(on) {
    const c = ACKS.blankCampaign();
    if (on) c.houseRules['families-per-hex-tracking'] = true;
    const d = ACKS.blankDomain({ name: 'Saltmark' });
    d.geography.hexes = [{ id: 'h1', families: 50 }, { id: 'h2', families: 30 }];
    d.demographics.peasantFamilies = 80; // initially consistent (80 == 50 + 30)
    c.domains = [d];
    return { c, d };
  }
  const hexFams = d => d.geography.hexes.map(h => h.families);
  const hexSum = d => d.geography.hexes.reduce((s, h) => s + (h.families || 0), 0);

  // Rule ON: a GM per-hex edit is canonical — reconcile derives the domain total from
  // the hexes and must NOT rescale them back to the stale peasantFamilies (the bug).
  let { c, d } = mk(true);
  d.geography.hexes[0].families = 100; // GM edits h1 50 -> 100 (hexSum now 130, pf stale 80)
  ACKS.reconcileRuralPopulation(c);
  ok('ON: per-hex edit preserved (not rescaled away)', hexFams(d)[0] === 100 && hexFams(d)[1] === 30);
  ok('ON: peasantFamilies derived from hex sum (130)', d.demographics.peasantFamilies === 130);

  // Rule ON but hexes still empty (just enabled): seed from the domain total, never zero it.
  ({ c, d } = mk(true));
  d.geography.hexes.forEach(h => h.families = 0);
  d.demographics.peasantFamilies = 200;
  ACKS.reconcileRuralPopulation(c);
  ok('ON + empty hexes: population seeded, not lost', hexSum(d) === 200 && d.demographics.peasantFamilies === 200);

  // Rule OFF (RAW default): peasantFamilies is canonical — redistribute across hexes (unchanged).
  ({ c, d } = mk(false));
  d.geography.hexes[0].families = 100;
  ACKS.reconcileRuralPopulation(c);
  ok('OFF: domain total stays canonical (80)', d.demographics.peasantFamilies === 80);
  ok('OFF: hexes redistributed to sum to the domain total', hexSum(d) === 80);

  // Canonical inverse setter.
  ({ c, d } = mk(true));
  d.geography.hexes = [{ id: 'h1', families: 11 }, { id: 'h2', families: 22 }];
  ok('syncRuralPopulationFromHexes sets pf = Σ(hex.families)',
    ACKS.syncRuralPopulationFromHexes(d) === 33 && d.demographics.peasantFamilies === 33);
  ACKS.reconcileRuralPopulation(c);
  ok('ON: a synced campaign is a reconcile no-op', d.demographics.peasantFamilies === 33 && hexSum(d) === 33);
})();

// =============================================================================
section('isHouseRuleEnabled — canonical accessor accepts every stored shape');
// =============================================================================
// The UI's isHouseRuleEnabled delegates to this engine accessor, so it MUST treat a
// bare boolean (how the templates store some rules, e.g. families-per-hex-tracking:true)
// the same as {enabled:bool}. A UI that only read `.enabled` rendered bare-true rules as
// OFF — the families-per-hex columns never showed and the toggle couldn't flip them.
(function () {
  const mk = (val) => { const c = ACKS.blankCampaign(); if (val !== undefined) c.houseRules['x'] = val; return c; };
  ok('bare true → enabled', ACKS.isHouseRuleEnabled(mk(true), 'x') === true);
  ok('{enabled:true} → enabled', ACKS.isHouseRuleEnabled(mk({ enabled: true }), 'x') === true);
  ok('bare false → disabled', ACKS.isHouseRuleEnabled(mk(false), 'x') === false);
  ok('{enabled:false} → disabled', ACKS.isHouseRuleEnabled(mk({ enabled: false }), 'x') === false);
  ok('absent rule → disabled', ACKS.isHouseRuleEnabled(mk(undefined), 'x') === false);
  ok('null campaign → disabled (no throw)', ACKS.isHouseRuleEnabled(null, 'x') === false);
})();

// =============================================================================
section('Party membership reconcile — mirror derived from character.partyId (#521 follow-up)');
// =============================================================================
// character.partyId is the canonical membership truth (Architecture §3.3); party.memberCharacterIds
// is a derived self-describing mirror that reconcilePartyMembership rebuilds, and the leader is
// always an actual member (or null). The stash-access consumer reads the partyId truth directly.
(function () {
  function setup() {
    const c = ACKS.blankCampaign();
    if (!Array.isArray(c.characters)) c.characters = [];
    if (!Array.isArray(c.parties)) c.parties = [];
    const a = ACKS.blankCharacter({ name: 'Aelric' });
    const b = ACKS.blankCharacter({ name: 'Tomas' });
    const pt = ACKS.blankParty({ name: "Aelric's party" });
    a.partyId = pt.id; b.partyId = pt.id;
    pt.memberCharacterIds = [];          // deliberately stale
    pt.leaderCharacterId = a.id;
    c.characters.push(a, b); c.parties.push(pt);
    return { c, a, b, pt };
  }
  const { c, a, b, pt } = setup();
  ACKS.reconcilePartyMembership(c);
  ok('rebuilds memberCharacterIds from partyId truth', pt.memberCharacterIds.length === 2 && pt.memberCharacterIds.includes(a.id) && pt.memberCharacterIds.includes(b.id));
  ok('keeps a still-valid leader', pt.leaderCharacterId === a.id);
  const before = JSON.stringify(pt);
  ACKS.reconcilePartyMembership(c);
  ok('reconcile is idempotent', JSON.stringify(pt) === before);

  const s2 = setup();
  s2.pt.leaderCharacterId = 'chr-ghost';   // leader who is not a member
  ACKS.reconcilePartyMembership(s2.c);
  ok('invalid leader reassigned to a current member', s2.pt.leaderCharacterId === s2.a.id);

  const s3 = setup();
  s3.a.partyId = null; s3.b.partyId = null;
  ACKS.reconcilePartyMembership(s3.c);
  ok('no members → empty mirror + null leader', s3.pt.memberCharacterIds.length === 0 && s3.pt.leaderCharacterId === null);

  const s4 = setup();
  s4.c.stashes = [{ id: 'stash-party', ownerPartyId: s4.pt.id }];   // mirror still stale here
  ok('member reaches the party stash via partyId (pre-reconcile)', ACKS.stashesAccessibleToCharacter(s4.c, s4.a.id).map(x => x.id).includes('stash-party'));
  const stranger = ACKS.blankCharacter({ name: 'Stranger' }); s4.c.characters.push(stranger);
  ok('non-member cannot reach the party stash', !ACKS.stashesAccessibleToCharacter(s4.c, stranger.id).map(x => x.id).includes('stash-party'));

  const s5 = setup();
  ACKS.migrateCampaign(s5.c);
  ok('migrateCampaign runs the reconcile (mirror populated on load)', s5.c.parties[0].memberCharacterIds.length === 2);
})();

// =============================================================================
section('liftToTopLevelCollections — backfills domainId on the SURVIVING canonical hex (CLAUDE #10)');
// =============================================================================
// Regression for the "header says March of Saltspur, Domain dropdown says Unclaimed" bug. When
// campaign.hexes already holds a hex (a save round-trip / pre-backfill session cache / shared
// .acks.json whose top-level hexes lack domainId), lift used to backfill only the geography COPY,
// then discard it in re-unification for the top-level copy that never got the scalar. Membership in
// a domain's geography.hexes[] IS the claim — the surviving canonical hex must adopt domainId.
(() => {
  // Two SEPARATE objects with the same id (the post-JSON-parse shape): one nested in the domain's
  // geography, one already in campaign.hexes — both WITHOUT domainId.
  const geoHex = { schemaVersion: 2, id: 'hex-reunify', coord: { q: -1, r: 1 }, terrain: 'coast' };
  const topHex = { schemaVersion: 2, id: 'hex-reunify', coord: { q: -1, r: 1 }, terrain: 'coast' };
  const camp = {
    schemaVersion: 2, kind: 'campaign', id: 'cmp-lift', name: 'Lift Fixture',
    domains: [{ id: 'dom-x', name: 'March X', geography: { hexes: [geoHex] } }],
    hexes: [topHex], settlements: [], rumors: [],
  };
  ACKS.liftToTopLevelCollections(camp);
  const top = camp.hexes.find(h => h.id === 'hex-reunify');
  const geo = camp.domains[0].geography.hexes.find(h => h.id === 'hex-reunify');
  ok('surviving top-level hex got domainId backfilled', top && top.domainId === 'dom-x', 'got ' + (top && JSON.stringify(top.domainId)));
  ok('geography hex is re-unified to the same object', geo === top);
  ok('geography hex therefore reports the same domainId', geo && geo.domainId === 'dom-x');
  // A genuine wilderness hex (in campaign.hexes, in NO domain's geography) keeps a null/absent domainId.
  camp.hexes.push({ schemaVersion: 2, id: 'hex-wild', coord: { q: 9, r: 9 }, terrain: 'waste' });
  ACKS.liftToTopLevelCollections(camp);
  ok('wilderness hex (no geography membership) is NOT claimed', !camp.hexes.find(h => h.id === 'hex-wild').domainId);
  // Idempotent: a second lift doesn't churn the now-correct scalar.
  ACKS.liftToTopLevelCollections(camp);
  ok('lift is idempotent on the healed scalar', camp.hexes.find(h => h.id === 'hex-reunify').domainId === 'dom-x');
})();

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
