// =============================================================================
// index-scripts-sync.smoke.js — index.html's generated <script> regions are in sync (T1).
//
// Runs tools/build/gen-index-scripts.js --check: it regenerates the engine / demo / tail script
// blocks from tools/build/load-order.js + the module files on disk and compares them to what's
// committed in index.html. Fails CI if a module was added / removed / renamed, its content changed,
// or the load order changed without re-running `npm run build:index`. This is the structural
// backstop the old hand-bumped ?v= date-tags never had — and the reason the per-session manual
// cache-bump ritual (and the CSP-corruption footgun it caused) is gone.
// =============================================================================
'use strict';
const { execFileSync } = require('child_process');
const path = require('path');
const REPO = path.join(__dirname, '..');
let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); } }

let out = '', code = 0;
try {
  out = execFileSync(process.execPath, [path.join(REPO, 'tools', 'build', 'gen-index-scripts.js'), '--check'],
    { cwd: REPO, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
} catch (e) {
  code = e.status || 1;
  out = (e.stdout || '') + (e.stderr || '');
}
ok('index.html generated <script> regions are in sync — run `npm run build:index` if this fails',
   code === 0, out.trim());

console.log('\n=============================================');
console.log('index-scripts-sync.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail > 0){ console.log('\nFAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
