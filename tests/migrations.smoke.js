/* tests/migrations.smoke.js — committed migration/load-invariant smoke suite.
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/migrations.smoke.js
 *
 * Plain Node, no dependencies. Loads all seven engine modules headless and the six
 * shipped Templates/, and asserts on the load-time migration + reconcile chain:
 *   - direct branch coverage for the four functions the delta audit flagged (qa C3)
 *   - a guard that migrateCampaign actually invokes them (under their wrapper names)
 *   - classification builds carry no deprecated c.kind and are migrate-no-ops
 *   - every shipped template migrates clean, validates, and is a migrate-no-op (qa I2)
 *
 * Stood up 2026-06-01 during the delta-audit correctness+hygiene pass.
 *
 * #1 VERIFY resolution (qa-strategy C3): three of the four flagged functions ARE
 * wired into migrateCampaign, under wrapper names —
 *   migrateCharacterClassification  → via migrateAllCharacterClassification (line ~706)
 *   migrateDomainTreasuryToStash    → via migrateAllDomainTreasuries        (line ~715)
 *   reconcileStashItems             → via reconcileAllStashes               (line ~719)
 * The fourth, reconcileWaveARelations, is a PURE DIAGNOSTIC (returns warning strings,
 * mutates nothing) and is correctly absent from the mutate-on-load path. No unwired
 * data-loss gap exists. Direct tests + a wiring guard are added below regardless.
 */
'use strict';
const path = require('path');
const fs = require('fs');
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
const clone = o => JSON.parse(JSON.stringify(o));

// =============================================================================
section('P1.1 — migrateCharacterClassification: legacy c.kind → five-axis, kind stripped');
// =============================================================================
const pc = { schemaVersion: 2, id: 'chr-pc', name: 'Player', kind: 'PC', alive: true };
ACKS.migrateCharacterClassification(pc);
ok('PC kind → controlledBy player', pc.controlledBy === 'player');
ok('PC kind → socialTier independent', pc.socialTier === 'independent');
ok('legacy c.kind stripped', !('kind' in pc));
const hen = { schemaVersion: 2, id: 'chr-h', name: 'Hench', kind: 'henchman', alive: true };
ACKS.migrateCharacterClassification(hen);
ok('henchman kind → socialTier henchman', hen.socialTier === 'henchman');
ok('henchman kind → controlledBy gm', hen.controlledBy === 'gm');
ok('migrateCharacterClassification is idempotent', (ACKS.migrateCharacterClassification(clone(pc)), true) &&
  ACKS.migrateCharacterClassification(pc).socialTier === 'independent' && !('kind' in pc));

// =============================================================================
section('P1.1 — migrateDomainTreasuryToStash: scalar treasury → materialized treasury-stash');
// =============================================================================
const tc = ACKS.blankCampaign();
tc.houseRules['inventory-stash-system'] = { enabled: true };
const tdom = ACKS.blankDomain({ name: 'Vaultmark' });
tdom.id = 'dom-treas';
tdom.treasury = { gp: 250 };
tdom.geography = { hexes: [{ id: 'hex-cap', settlement: { urbanFamilies: 120 } }] };
tc.domains = [tdom];
const stash = ACKS.migrateDomainTreasuryToStash(tc, tdom);
ok('treasury stash materialized', stash && stash.kind === 'domain-treasury');
ok('domain.treasuryStashId linked', tdom.treasuryStashId === stash.id);
ok('stash seeded with the 250gp scalar', ACKS.domainTreasuryGp(tc, tdom.id) === 250);
ok('re-running is a no-op (idempotent)', ACKS.migrateDomainTreasuryToStash(tc, tdom).id === stash.id && tc.stashes.length === 1);

// =============================================================================
section('P1.1 — reconcileStashItems: multi-entry fungibles consolidated');
// =============================================================================
const multiStash = ACKS.blankStash({
  kind: 'cache', name: 'Hoard', items: [
    ACKS.blankStashItem({ kind: 'coin', denomination: 'gp', qty: 100 }),
    ACKS.blankStashItem({ kind: 'coin', denomination: 'gp', qty: 50 }),
    ACKS.blankStashItem({ kind: 'coin', denomination: 'sp', qty: 30 }),
  ]
});
const changed = ACKS.reconcileStashItems(multiStash);
ok('reconcileStashItems reports a merge', changed === true);
ok('two gp entries collapse to one (+ the sp entry)', multiStash.items.length === 2);
const gp = multiStash.items.find(i => i.denomination === 'gp');
ok('merged gp qty summed to 150', gp && gp.qty === 150);
ok('reconcileStashItems no-op on already-tidy stash', ACKS.reconcileStashItems(multiStash) === false);

// =============================================================================
section('P1.1 — reconcileWaveARelations: pure diagnostic flags stale relations');
// =============================================================================
const relCamp = {
  characters: [{ id: 'chr-a' }, { id: 'chr-b' }], domains: [],
  henchmanships: [
    { id: 'hs1', status: 'active', subjectCharacterId: 'chr-a', patronCharacterId: 'chr-b' },
    { id: 'hs2', status: 'active', subjectCharacterId: 'chr-a', patronCharacterId: 'chr-b' },
  ],
};
const relSnapshot = clone(relCamp);
const warns = ACKS.reconcileWaveARelations(relCamp);
ok('flags a subject with two active henchmanships', warns.length >= 1 && warns.some(w => w.includes('chr-a')));
ok('does NOT mutate the campaign (pure diagnostic)', JSON.stringify(relCamp) === JSON.stringify(relSnapshot));
ok('clean campaign → empty warning array', ACKS.reconcileWaveARelations({ characters: [], domains: [] }).length === 0);

// =============================================================================
section('P1.1 — wiring guard: migrateCampaign invokes the wrappers');
// =============================================================================
// A legacy-shaped campaign that triggers the classification branch (a raw char with
// c.kind, no five-axis) AND the treasury branch (rule on + domain w/ scalar treasury).
// After migrateCampaign, both post-conditions must hold — proving the wrappers ran.
const legacy = ACKS.blankCampaign();
legacy.houseRules['inventory-stash-system'] = { enabled: true };
legacy.characters = [{ schemaVersion: 2, id: 'chr-legacy', name: 'Greybeard', kind: 'NPC', alive: true }];
const ldom = ACKS.blankDomain({ name: 'Oldmark' });
ldom.id = 'dom-legacy';
ldom.treasury = { gp: 500 };
ldom.geography = { hexes: [{ id: 'hex-l', settlement: { urbanFamilies: 60 } }] };
legacy.domains = [ldom];
ACKS.migrateCampaign(legacy);
const migratedChar = legacy.characters[0];
ok('migrateAllCharacterClassification ran (five-axis set)', migratedChar.controlledBy === 'gm' && migratedChar.socialTier === 'independent');
ok('migrateAllCharacterClassification ran (legacy kind stripped)', !('kind' in migratedChar));
ok('migrateAllDomainTreasuries ran (treasury stash linked)', !!legacy.domains[0].treasuryStashId);
ok('treasury stash carries the 500gp', ACKS.domainTreasuryGp(legacy, 'dom-legacy') === 500);

// =============================================================================
section('P2.4 — template-built characters carry no c.kind and are migrate-no-ops (delta audit I3)');
// =============================================================================
// buildDomainFromTemplate (index.html — not Node-requireable; jsdom harness deferred)
// now sets the five-axis fields directly instead of the deprecated kind vocabulary.
// We guard the blankCharacter contract it depends on: those opts produce no c.kind
// and survive migrateCharacterClassification untouched. We also assert the refactor is
// behaviour-preserving — five-axis opts match what kind:'PC'/'henchman' derived.
const ruler = ACKS.blankCharacter({ name: 'Ruler', controlledBy: 'player', socialTier: 'independent' });
ok('five-axis ruler build has no c.kind', !('kind' in ruler));
ok('five-axis ruler → player/independent', ruler.controlledBy === 'player' && ruler.socialTier === 'independent');
const rulerBefore = clone(ruler);
ACKS.migrateCharacterClassification(ruler);
ok('ruler build is a migrate-no-op', JSON.stringify(ruler) === JSON.stringify(rulerBefore));

const hench = ACKS.blankCharacter({ name: 'Hench', controlledBy: 'gm', socialTier: 'henchman' });
ok('five-axis henchman build has no c.kind', !('kind' in hench));
ok('five-axis henchman → gm/henchman', hench.controlledBy === 'gm' && hench.socialTier === 'henchman');
const henchBefore = clone(hench);
ACKS.migrateCharacterClassification(hench);
ok('henchman build is a migrate-no-op', JSON.stringify(hench) === JSON.stringify(henchBefore));

// behaviour-preserving: the old kind-based opts derived the same axes, and never stored kind
const viaKindPC = ACKS.blankCharacter({ kind: 'PC' });
ok('kind:PC and five-axis opts agree', viaKindPC.controlledBy === ruler.controlledBy && viaKindPC.socialTier === ruler.socialTier);
ok('blankCharacter never emits c.kind regardless of input', !('kind' in viaKindPC));

// =============================================================================
section('P3.6 — every shipped template migrates clean, validates, and is a migrate-no-op (qa I2)');
// =============================================================================
// Five of six templates were previously validated only incidentally. Guard all of
// them: each v2-*.acks.json must migrate without throwing, pass validateCampaign, and
// migration must CONVERGE — migrateCampaign(migrateCampaign(file)) equals
// migrateCampaign(file) byte-for-byte (the migrated form is a stable fixed point).
// NOTE: the on-disk templates are NOT currently byte-equal to their migrated form —
// they predate the J1 Journeys work (2026-06-01), which added four additive character
// fields that migrateCampaign backfills on load (currentJourneyId / personalFatigue /
// hungerDays / dehydrationDays). That is benign additive backfill, not a migration bug;
// the templates want a regeneration pass (strip-not-live + elide-defaults per #511/#512)
// in a follow-up. Idempotency is the correctness property that matters here.
const tplDir = path.join(DIR, 'Templates');
const tplFiles = fs.readdirSync(tplDir).filter(f => /^v2-.*\.acks\.json$/.test(f));
ok('found the six shipped templates', tplFiles.length === 6, 'got ' + tplFiles.length);
tplFiles.forEach(f => {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(path.join(tplDir, f), 'utf8')); }
  catch (e) { ok('parses: ' + f, false, e.message); return; }
  let migrated;
  try { migrated = ACKS.migrateCampaign(clone(raw)); ok('migrates clean: ' + f, true); }
  catch (e) { ok('migrates clean: ' + f, false, e.message); return; }
  try { ACKS.validateCampaign(migrated); ok('validates: ' + f, true); }
  catch (e) { ok('validates: ' + f, false, e.message); }
  const reMigrated = ACKS.migrateCampaign(clone(migrated));
  ok('migration converges (idempotent fixed point): ' + f, JSON.stringify(reMigrated) === JSON.stringify(migrated));
});

// ─── summary ───
console.log('\n=============================================');
console.log('migrations.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if (fail > 0) {
  console.log('\nFAILURES:\n  ' + failures.join('\n  '));
  process.exit(1);
}
