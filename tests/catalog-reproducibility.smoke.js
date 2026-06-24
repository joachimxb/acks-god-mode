// =============================================================================
// catalog-reproducibility.smoke.js — the committed catalogs match their generators (audit A7).
//
// ~465 KB of source-of-truth catalog data ships as GENERATED engine modules. Before this
// remediation the generators lived in a gitignored outputs/ folder — unrebuildable by anyone
// but the maintainer, unrecoverable after disk loss (audit T4 / pm C2). They now live tracked
// under tools/build/. This guard proves the committed output still matches what the generator
// produces, so the two can't silently drift.
//
// SCOPE: only the MONSTER catalog is CI-reproducible. build_catalog.js reads a committed,
// prose-free input (tools/build/mm_parsed.json — mechanical stat-block fields + page refs only,
// §13.6) and is self-contained. The encounter-table and troop generators read the ACKS II RAW
// PDFs/Markdown under the DEV-root "ACKS Sources/" folder, which is NOT in the repo (IP, §13.6)
// and is absent in CI — so they are maintainer-run (`npm run build:catalogs`), not CI-checked.
// Comparison is CR-normalized (the committed blob is LF; a Windows working tree may be CRLF).
// =============================================================================
'use strict';
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); } }

const REPO = path.join(__dirname, '..');
const gen = path.join(REPO, 'tools', 'build', 'build_catalog.js');
const committed = path.join(REPO, 'acks-engine-monsters.js');

ok('build_catalog.js is tracked under tools/build/', fs.existsSync(gen));
ok('mm_parsed.json input is committed alongside the generator', fs.existsSync(path.join(REPO, 'tools', 'build', 'mm_parsed.json')));

if (fs.existsSync(gen) && fs.existsSync(committed)) {
  const tmp = path.join(os.tmpdir(), 'acks-monsters-repro-' + process.pid + '.js');
  try {
    execFileSync(process.execPath, [gen], { env: { ...process.env, ACKS_CATALOG_OUT: tmp }, stdio: ['ignore', 'ignore', 'pipe'] });
    const regen = fs.readFileSync(tmp, 'utf8').replace(/\r/g, '');
    const have = fs.readFileSync(committed, 'utf8').replace(/\r/g, '');
    ok('committed acks-engine-monsters.js is reproducible from tools/build/build_catalog.js + mm_parsed.json',
       regen === have, regen === have ? '' : 'regen ' + regen.length + 'B vs committed ' + have.length + 'B — run `npm run build:catalogs` and commit the result');
  } catch (e) {
    ok('build_catalog.js ran cleanly', false, (e.message || String(e)).split('\n')[0]);
  } finally {
    try { fs.unlinkSync(tmp); } catch (_) {}
  }
}

console.log('\n=============================================');
console.log('catalog-reproducibility.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail > 0){ console.log('\nFAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
