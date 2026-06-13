'use strict';
/* tests/_engine.js — the ONE place the engine module load order is declared.
 *
 * Each smoke suite does `require('./_engine.js').load()` instead of repeating the module
 * list. Adding an acks-engine-*.js module is picked up automatically (it loads after the
 * canonical set); only reordering the core needs an edit here. Behaviour-identical to the old
 * per-file preamble: it requires the same modules onto global.ACKS (each is an IIFE that
 * Object.assigns onto it). It does NOT load acks-demo-template.js — suites that need
 * global.ACKS_DEMO_TEMPLATE require it themselves.
 *
 * Authored 2026-06-13 — team-session harness prerequisite (CLAUDE §15.5). Before this, adding
 * an engine module meant editing ~20 test files' load lists; now it's zero edits here.
 */
const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');

// Canonical load order (CLAUDE §2). Load-bearing: catalogs before engine; engine/entities before
// economy (it captures their constants at load); etc. Modules absent on the current branch are
// skipped, so this works before the Military modules (troops/battles/maneuvers) land on main.
const CANONICAL = [
  'acks-engine-catalogs.js',
  'acks-engine-monsters.js',
  'acks-engine-encounter-tables.js',
  'acks-engine-troops.js',
  'acks-engine.js',
  'acks-engine-entities.js',
  'acks-engine-economy.js',
  'acks-engine-entity-registry.js',
  'acks-engine-field-schemas.js',
  'acks-engine-events.js',
  'acks-engine-battles.js',
  'acks-engine-maneuvers.js',
  'acks-engine-subsystems.js',
];

// The engine modules that actually exist, in canonical order, then any new acks-engine-*.js not
// yet in CANONICAL appended (a freshly-added module loads last, after the core it depends on —
// the team-session "add a module, edit nothing" path).
function engineModuleFiles() {
  const present = fs.readdirSync(REPO).filter(f => /^acks-engine.*\.js$/.test(f));
  const presentSet = new Set(present);
  const known = new Set(CANONICAL);
  const ordered = CANONICAL.filter(f => presentSet.has(f));
  const extras = present.filter(f => !known.has(f)).sort();
  return [...ordered, ...extras].map(f => path.join(REPO, f));
}

let loaded = false;
function load() {
  if (!loaded) {
    engineModuleFiles().forEach(abs => require(abs));
    loaded = true;
  }
  return global.ACKS;
}

module.exports = { load, engineModuleFiles, CANONICAL };
