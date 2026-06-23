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

// T5 chip 4 (2026-06-23): the domainApp() Alpine component was extracted from index.html's main
// inline <script> to an external domain-app.js (loaded via <script src>). It carries the bulk of the
// app logic now, so guard it the same way — non-trivial size + a clean compile via vm.Script.
const appJs = fs.readFileSync(path.join(__dirname, '..', 'domain-app.js'), 'utf8');
ok('domain-app.js is non-trivial in size (not truncated)', appJs.length > 500000, appJs.length + ' bytes');
ok('index.html loads domain-app.js via <script src>', /<script src="domain-app\.js/.test(html));
try { new vm.Script(appJs, { filename: 'domain-app.js' }); ok('domain-app.js compiles', true); }
catch(e){ ok('domain-app.js compiles', false, (e.message || String(e))); }

// T5 chip 5 (2026-06-23): feature method-groups are extracted from domain-app.js to
// domain-app-<feature>.js mixin files (each pushes a members object onto a registry that
// domainApp() merges with descriptor-preservation). Guard each the same way — non-trivial
// size + a clean compile + index.html references it via <script src>.
for (const mixin of ['domain-app-burst5.js', 'domain-app-military-w7.js', 'domain-app-mounts.js', 'domain-app-voyages.js']) {
  const mx = fs.readFileSync(path.join(__dirname, '..', mixin), 'utf8');
  ok(mixin + ' is non-trivial in size (not truncated)', mx.length > 5000, mx.length + ' bytes');
  ok('index.html loads ' + mixin + ' via <script src>', new RegExp('<script src="' + mixin.replace(/\./g, '\\.')).test(html));
  try { new vm.Script(mx, { filename: mixin }); ok(mixin + ' compiles', true); }
  catch(e){ ok(mixin + ' compiles', false, (e.message || String(e))); }
}

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
ok('domainApp() is defined', /function\s+domainApp\s*\(/.test(appJs));
ok('domains getter exists (single home)', /get\s+domains\s*\(\)/.test(appJs));
ok('_finishLoad helper exists', /_finishLoad\s*\(/.test(appJs));

console.log('\n=============================================');
console.log('index-parse.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail > 0){ console.log('\nFAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
