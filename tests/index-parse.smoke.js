// =============================================================================
// index-parse.smoke.js — the 1.1 MB index.html actually parses (qa-strategy audit C2).
// A truncated or syntactically broken index.html still "loads" in a browser but silently
// half-renders (Alpine swallows the error), so a typo in domainApp() can ship unnoticed.
// This guards it in CI: the file ends cleanly (</html>) and every INLINE <script> block
// compiles via vm.Script. Compile-only — undefined runtime refs (Alpine, document, window.ACKS)
// are fine; vm.Script throws on a *syntax* error, which is exactly what we want to catch.
// =============================================================================
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); } }

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

ok('index.html is non-trivial in size (not truncated to nothing)', html.length > 500000, html.length + ' bytes');
ok('index.html ends cleanly with </html>', /<\/html>\s*$/.test(html));

// Extract inline <script> blocks (those WITHOUT a src= attribute) and compile each.
const reInline = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
let m, n = 0, compiled = 0;
while((m = reInline.exec(html)) !== null){
  const body = m[1];
  if(!body.trim()) continue;
  n++;
  try { new vm.Script(body, { filename: 'index.html#inline-' + n }); compiled++; }
  catch(e){ ok('inline <script> #' + n + ' compiles', false, (e.message || String(e))); }
}
ok('found the expected inline <script> blocks', n >= 2, 'found ' + n);
ok('every inline <script> compiles (' + compiled + '/' + n + ')', compiled === n);

// The refactor's load-bearing symbols are present (cheap textual canary — not a parse, just a
// guard that a careless delete didn't drop them).
ok('domainApp() is defined', /function\s+domainApp\s*\(/.test(html));
ok('domains getter exists (single home)', /get\s+domains\s*\(\)/.test(html));
ok('_finishLoad helper exists', /_finishLoad\s*\(/.test(html));

console.log('\n=============================================');
console.log('index-parse.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail > 0){ console.log('\nFAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
