// =============================================================================
// bundle-single-file.smoke.js — the single-file release artifact builds correctly (T2).
//
// Calls tools/build/bundle-single-file.js's bundle() (in-memory, no file write) and asserts the
// produced single-file HTML is self-contained + valid: every local <script src> was inlined (none
// left), it ends cleanly, the expected module count was inlined, and load-bearing engine + app
// symbols survived the inline-escape. Guards the bundler against a future index.html change that
// breaks inlining. Glob-discovered by tests/run.js — no harness edit.
// =============================================================================
'use strict';
const { bundle } = require('../tools/build/bundle-single-file.js');
let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); } }

const r = bundle();

ok('no missing src files', r.missing.length === 0, r.missing.join(', '));
ok('every local <script src> was inlined (none left)',
   !/<script\b[^>]*\bsrc=("|')(?!https?:)[^"']+\1/i.test(r.html),
   'a local src= remains');
ok('the single file ends cleanly with </html>', /<\/html>\s*$/.test(r.html));
ok('inlined the expected number of modules (>= 70)', r.inlined >= 70, 'inlined ' + r.inlined);
// Load-bearing symbols survived the </script> inline-escape (a botched escape would corrupt them).
ok('engine symbols present (blankCampaign + MONSTER_CATALOG)', r.html.includes('blankCampaign') && r.html.includes('MONSTER_CATALOG'));
ok('app entry present (domainApp)', r.html.includes('function domainApp'));
// The deferred Alpine must be wrapped to run at DOMContentLoaded (inline scripts ignore `defer`;
// Alpine auto-starts via queueMicrotask with no DOM-ready guard, so an un-wrapped inline Alpine
// initializes the component without its magics — the $watch/init bug this guards).
ok('a deferred script was detected + wrapped', r.deferred >= 1, 'deferred=' + r.deferred);
ok('the deferred (Alpine) inline is wrapped to run at DOMContentLoaded (replicating defer)',
   /deferred → wrapped to run at DOMContentLoaded/.test(r.html) && r.html.includes("addEventListener('DOMContentLoaded',__run"));

console.log('\n=============================================');
console.log('bundle-single-file.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail > 0){ console.log('\nFAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
