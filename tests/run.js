#!/usr/bin/env node
'use strict';
/* tests/run.js — the glob test runner. `npm test` → this.
 *
 * Discovers every tests/*.js suite (excluding this runner and _-prefixed helpers like _engine.js)
 * and runs each in its OWN Node process (so suites stay isolated — no shared global.ACKS / module
 * cache between them), streams its output, and exits non-zero if any suite fails. Adding a suite
 * needs no edit here (the glob finds it) and no package.json edit.
 *
 * Authored 2026-06-13 — team-session harness prerequisite (CLAUDE §15.5). Replaces the hand-
 * maintained `&&` chain in package.json so a new test file is auto-discovered.
 */
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const TESTS_DIR = __dirname;
const REPO = path.join(TESTS_DIR, '..');
const EXCLUDE = new Set(['run.js']);

// smoke.js first (the core invariant check), then the rest alphabetically — deterministic.
const files = fs.readdirSync(TESTS_DIR)
  .filter(f => f.endsWith('.js') && !f.startsWith('_') && !EXCLUDE.has(f))
  .sort((a, b) => (a === 'smoke.js' ? -1 : b === 'smoke.js' ? 1 : a.localeCompare(b)));

let failed = 0;
const results = [];
for (const f of files) {
  try {
    const out = execFileSync(process.execPath, [path.join(TESTS_DIR, f)],
      { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 32 * 1024 * 1024 });
    process.stdout.write(out);
    results.push({ f, ok: true });
  } catch (e) {
    if (e.stdout) process.stdout.write(e.stdout);
    if (e.stderr) process.stderr.write(e.stderr);
    results.push({ f, ok: false });
    failed++;
  }
}

console.log('\n=============================================');
console.log(`Test suites: ${files.length} · passed ${files.length - failed} · failed ${failed}`);
for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.f}`);
console.log('=============================================');
process.exit(failed ? 1 : 0);
