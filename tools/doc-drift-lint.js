#!/usr/bin/env node
'use strict';
/*
 * Doc-drift linter — in-repo CI variant.
 *
 * Guards the PUBLIC docs that ship in this repo (README / CHANGELOG / CONTRIBUTING) against
 * referencing an engine token that was REMOVED — e.g. a house rule that no longer exists but is
 * still described as live. Loads the engine + the CHANGELOG's `### Removed` blocks (plus a small
 * explicit supplement) to build the removed-set, then flags any removed token still referenced as
 * live. Memory-independent; runs in CI on every push.
 *
 * The BROAD check over the DEV-root *design* docs lives OUTSIDE this repo at
 * `_audits/doc_drift_lint.js` (those docs aren't version-controlled here, so CI can't see them);
 * it runs as a step in the §8.9 doc-pass. This thin variant is the always-on backstop for the
 * docs that DO ship in the repo. See `_handoffs/Doc_Drift_Prevention_Spec.md`.
 *
 *   node tools/doc-drift-lint.js      (from the repo root; or `npm run lint:docs`)
 *   exit 0 = clean · exit 1 = a removed token is referenced as live
 */
const fs = require('fs');
const path = require('path');
const REPO = path.resolve(__dirname, '..');
const KEBAB = '[a-z][a-z0-9]*(?:-[a-z0-9]+)+';
const BT = new RegExp('`(' + KEBAB + ')`', 'g');
const HISTORICAL = /\b(removed?|superseded|retired?|deprecated|formerly|renamed|no longer|legacy|placeholder|unused)\b/i;
// Removals not (yet) recorded in a CHANGELOG `### Removed` block. Per the removal protocol
// (CLAUDE §8.9), add a token here when you remove it from the engine if it isn't changelogged.
const EXPLICIT_REMOVED = ['realistic-construction', 'immediate-construction'];

// Load the engine headless (proves it still loads, as a bonus) — kept for parity with the broad
// linter and to allow future engine-truth checks here.
global.window = global;
global.ACKS = global.ACKS || {};
for (const m of ['acks-engine-catalogs.js', 'acks-engine.js', 'acks-engine-entities.js',
                 'acks-engine-entity-registry.js', 'acks-engine-field-schemas.js',
                 'acks-engine-events.js', 'acks-engine-subsystems.js']) {
  require(path.join(REPO, m));
}

function removedSet() {
  const set = new Set(EXPLICIT_REMOVED);
  const p = path.join(REPO, 'CHANGELOG.md');
  if (fs.existsSync(p)) {
    let inRemoved = false;
    for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
      if (/^###\s+Removed/i.test(line)) { inRemoved = true; continue; }
      if (/^#{2,3}\s/.test(line)) { inRemoved = false; continue; }
      if (inRemoved) { let m; BT.lastIndex = 0; while ((m = BT.exec(line))) set.add(m[1]); }
    }
  }
  return set;
}

const removed = removedSet();
const findings = [];
for (const f of ['README.md', 'CHANGELOG.md', 'CONTRIBUTING.md']) {
  const p = path.join(REPO, f);
  if (!fs.existsSync(p)) continue;
  const lines = fs.readFileSync(p, 'utf8').split(/\r?\n/);
  let inCode = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*```/.test(line)) { inCode = !inCode; continue; }
    if (inCode || HISTORICAL.test(line)) continue;
    let m; BT.lastIndex = 0;
    while ((m = BT.exec(line))) {
      if (removed.has(m[1])) findings.push(`STALE ${f}:${i + 1}  \`${m[1]}\`  — removed from the engine but referenced here as live`);
    }
  }
}

findings.forEach(s => console.log(s));
console.log(`doc-drift (in-repo public docs): ${findings.length} stale · removed-set ${removed.size}. ` +
  `Broad DEV-root check: node _audits/doc_drift_lint.js (run in the doc-pass).`);
console.log(findings.length === 0 ? 'PASS.' : 'FAIL — a removed token is referenced as live.');
process.exit(findings.length === 0 ? 0 : 1);
