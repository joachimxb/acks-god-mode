'use strict';
/* tools/build/load-order.js — the ONE source of truth for the browser's <script> load order.
 *
 * Two consumers import this:
 *   • tests/_engine.js              — require()s the engine modules into Node, in this order, for
 *                                     every smoke suite.
 *   • tools/build/gen-index-scripts.js — emits the <script src> blocks into index.html
 *                                     (`npm run build:index`).
 * Keeping them on one list guarantees the order the test suite PROVES safe is the order the browser
 * actually loads — the two can never drift.
 *
 * Extracted from tests/_engine.js on 2026-06-25 (T1 / the delivery-manifest generator; the concrete
 * realization of Architecture.md §18.2a). Pure dev-time tooling — no runtime/deploy build step.
 */
const fs = require('fs');
const path = require('path');

// Repo root. This file sits at <repo>/tools/build/load-order.js, so two levels up is the root.
const REPO = path.resolve(__dirname, '..', '..');

// Canonical engine load order (CLAUDE §2). Load-bearing: catalogs before the engine core; the core +
// entities before economy (it captures their constants at load); the registries before events; etc.
// Modules absent on the current branch are skipped, so this stays forward-safe.
const CANONICAL = [
  'acks-engine-catalogs.js',
  'acks-engine-monsters.js',
  'acks-engine-encounter-tables.js',
  'acks-engine-troops.js',
  'acks-engine.js',
  'acks-engine-lairs.js',
  'acks-engine-stash.js',
  'acks-engine-military.js',
  'acks-engine-entities.js',
  'acks-engine-economy.js',
  'acks-engine-entity-registry.js',
  'acks-engine-field-schemas.js',
  'acks-engine-events.js',
  'acks-engine-battles.js',
  'acks-engine-maneuvers.js',
  'acks-engine-subsystems.js',
];

// Modules pinned to load LAST, after the alphabetical middle. acks-engine-player-view.js is the
// redacting serializer: it depends (at call time) on every entity/predicate module, and earlier
// modules reference it only at call time (entities.js / field-schemas.js — verified comments + a
// schema description, no load-time call). A pure leaf consumer, documented "loads last" in five
// places. Its position is empirically free (the Node harness loads it mid-list and the suite is
// green), but pinning it keeps the browser order legible and honours that long-standing intent.
// (Empty = pure alphabetical; populated in T1/W3 as the one deliberate, signed-off reorder.)
const TAIL = [];

// The engine modules that actually exist, in load order: the canonical core (in CANONICAL order),
// then every other acks-engine*.js alphabetically (the "add a module, edit nothing" path — a fresh
// module loads after the core it depends on and late-binds everything else), then the TAIL pins.
function engineModuleFiles() {
  const present = fs.readdirSync(REPO).filter(f => /^acks-engine.*\.js$/.test(f));
  const presentSet = new Set(present);
  const canon = new Set(CANONICAL), tail = new Set(TAIL);
  const core = CANONICAL.filter(f => presentSet.has(f));
  const middle = present.filter(f => !canon.has(f) && !tail.has(f)).sort();
  const tailFiles = TAIL.filter(f => presentSet.has(f));
  return [...core, ...middle, ...tailFiles];
}

// The inlined demo-campaign template — loaded as a sibling <script> so the welcome "Try the demo"
// CTA works under file://, where fetch() of a relative path is blocked.
const DEMO_TEMPLATE = 'acks-demo-template.js';

// The Alpine app: domain-app.js first (it defines domainApp() + the mixin merge), then every
// domain-app-*.js feature mixin alphabetically. Mixin order is irrelevant at runtime — each pushes a
// members object onto a registry that domainApp() merges later — so alphabetical is purely for a
// stable, regeneratable listing.
function appModuleFiles() {
  const present = fs.readdirSync(REPO).filter(f => /^domain-app.*\.js$/.test(f));
  const main = present.filter(f => f === 'domain-app.js');
  const mixins = present.filter(f => f !== 'domain-app.js').sort();
  return [...main, ...mixins];
}

module.exports = { REPO, CANONICAL, TAIL, DEMO_TEMPLATE, engineModuleFiles, appModuleFiles };
