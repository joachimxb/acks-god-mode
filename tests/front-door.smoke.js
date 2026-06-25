'use strict';
/* tests/front-door.smoke.js — keeps the front door (README + in-app welcome banner) from going stale.
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/front-door.smoke.js
 *
 * Stood up 2026-06-14 (audit T1-C). The "README is a full release behind" finding had recurred for
 * THREE consecutive audits because nothing enforced it. The README was made version-AGNOSTIC (it no
 * longer states a version number in prose — it points at CHANGELOG.md + the Releases page), so the
 * durable guard is fail-closed: assert the README + welcome banner carry NO hard-coded `vX.Y.Z`
 * version string that can drift. (package.json stays the single source of the version; the GitHub
 * release flow stamps it — see CONTRIBUTING.md.)
 *
 * Plain Node, no dependencies. Reads the files as text — no engine load needed.
 */
const fs = require('fs');
const path = require('path');
const REPO = path.join(__dirname, '..');

let pass = 0, fail = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(label + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); }
}
function section(t) { console.log('\n--- ' + t + ' ---'); }

const README = fs.readFileSync(path.join(REPO, 'README.md'), 'utf8');
const INDEX = fs.readFileSync(path.join(REPO, 'index.html'), 'utf8');
const PKG = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));

// A version-string regex that matches a SemVer reference in prose: "v0.24.0", "version 0.24.0",
// "Current release: 0.24.0". Deliberately NOT matching bare "0.24.0"-style numbers that could be a
// page reference or a count — we anchor on the `v`/`version`/`release:` lead-in.
const VERSION_IN_PROSE = /\b(?:v\d+\.\d+\.\d+|version\s+\d+\.\d+\.\d+|release[:\s]+\*{0,2}v?\d+\.\d+\.\d+)/i;

section('package.json carries the single source of the version');
ok('package.json has a SemVer version', /^\d+\.\d+\.\d+$/.test(String(PKG.version)), 'got ' + PKG.version);

section('README states no hard-coded version (it points at CHANGELOG + Releases instead)');
// Scan only the prose ABOVE the License section's link refs; allow the CHANGELOG/Releases links.
const readmeProse = README;
const rm = readmeProse.match(VERSION_IN_PROSE);
ok('README contains no vX.Y.Z version string in prose', !rm,
   rm ? 'found "' + rm[0] + '" — make it version-agnostic (point at CHANGELOG.md / Releases) so it can\'t go stale' : '');
ok('README points at the changelog', /CHANGELOG\.md/.test(README));
ok('README points at the Releases page', /\/releases\b/i.test(README));

section('README scope claims match shipped subsystems (no "not yet built" for shipped features)');
// These subsystems are shipped (per CHANGELOG). The old README listed them as "not yet built".
// Guard: the README must NOT describe any of them as unbuilt/coming/sketched.
const SHIPPED = ['mass warfare', 'battle', 'siege', 'hijink', 'religion', 'encounter', 'persistent',
                 'arcane', 'magic research', 'sea voyage', 'voyage', 'construction', 'senate', 'politic', 'banking'];
const NOT_BUILT_PHRASE = /\b(not yet built|sketched in the data layer|·\s*coming|isn['’]t built|doesn['’]t (?:ship|exist))\b/gi;
// Pull the sentences/lines that use a "not built" phrase and make sure none of them names a shipped feature.
const lines = README.split(/\r?\n/);
let mislabelled = [];
for (const ln of lines) {
  if (NOT_BUILT_PHRASE.test(ln)) {
    const low = ln.toLowerCase();
    for (const s of SHIPPED) {
      if (low.indexOf(s) >= 0) mislabelled.push(s + ' :: ' + ln.trim().slice(0, 90));
    }
  }
  NOT_BUILT_PHRASE.lastIndex = 0;
}
ok('no shipped subsystem is described as not-yet-built', mislabelled.length === 0, mislabelled.join(' | '));

section('the in-app welcome banner carries no hard-coded version string');
// Isolate the welcome banner block (the first-run card) and check it for a version string.
const bannerStart = INDEX.indexOf('Welcome to ACKS God Mode');
ok('welcome banner present in index.html', bannerStart > 0);
if (bannerStart > 0) {
  const bannerBlock = INDEX.slice(bannerStart, bannerStart + 4000);
  const bm = bannerBlock.match(VERSION_IN_PROSE);
  ok('welcome banner has no vX.Y.Z version string', !bm,
     bm ? 'found "' + bm[0] + '" in the banner — keep onboarding copy version-agnostic' : '');
}

// ── report ──
console.log('\n=============================================');
console.log('front-door.smoke.js — ' + pass + ' passed, ' + fail + ' failed');
console.log('=============================================');
if (fail) { console.log('FAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
