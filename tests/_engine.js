'use strict';
/* tests/_engine.js — loads the engine modules into Node for the smoke suites.
 *
 * The load ORDER now lives in tools/build/load-order.js — the ONE source it shares with the
 * index.html <script> generator (tools/build/gen-index-scripts.js), so the order the suite proves
 * safe is the order the browser ships. This file just require()s the modules onto global.ACKS (each
 * is an IIFE that Object.assigns onto it) and memoizes. It does NOT load acks-demo-template.js —
 * suites that need global.ACKS_DEMO_TEMPLATE require it themselves.
 *
 * Adding an acks-engine-*.js module is picked up automatically (it loads after the canonical set);
 * only reordering the core needs an edit — now in tools/build/load-order.js, not here.
 *
 * Authored 2026-06-13 (team-session harness prerequisite, CLAUDE §15.5); load order extracted to
 * tools/build/load-order.js 2026-06-25 (T1).
 */
const path = require('path');
const { REPO, CANONICAL, engineModuleFiles } = require('../tools/build/load-order.js');

// load-order returns repo-relative filenames; require() needs absolute paths. Preserve this file's
// historical contract (engineModuleFiles() → absolute paths) for any caller.
function engineModulePaths() { return engineModuleFiles().map(f => path.join(REPO, f)); }

let loaded = false;
function load() {
  if (!loaded) {
    engineModulePaths().forEach(abs => require(abs));
    loaded = true;
  }
  return global.ACKS;
}

module.exports = { load, engineModuleFiles: engineModulePaths, CANONICAL };
