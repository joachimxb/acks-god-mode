// =============================================================================
// palette.smoke.js — the colour-token guard (graphic-designer audit H1, 2026-06-25).
//
// The :root token block is meant to be the only legal source of colour, but the surface had
// drifted across redundant Tailwind palette families for the same semantic role (two greens —
// green + emerald; warning across yellow/amber/orange; danger across red + rose; cool greys on a
// warm ground). The H1 sweep unified the drift families in the markup:
//     emerald → green,   orange → amber,   rose → red,   gray → stone   (+ slate/zinc/neutral stay out)
// and routed the ~280 universal `hover:bg-yellow-100` hovers + the 182 verbatim legacy buttons onto
// the .hover-tint / .btn classes. This test keeps the eliminated families from creeping back.
//
// FORBIDDEN (this pass eliminated them — a re-introduction is the drift returning):
//     emerald, orange, rose, gray, slate, zinc, neutral
// STILL ALLOWED for now (the NEXT convergence target — these raw families still appear and need
// per-node semantic judgment to route onto the tokens; a deferred H1 follow-on, NOT a failure here):
//     green, amber, yellow, red   (+ stone is the warm-neutral target; sky/blue/purple/etc. untouched)
//
// Scope = index.html + the domain-app*.js mixins. The 2026-06-25 follow-on swept the mixins' 14
// straggler utilities (orange→amber, gray→stone) and extended this guard to cover them too.
// (Routing the still-allowed green/amber/yellow/red families onto the --c-* tokens remains the next pass.)
// =============================================================================
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); } }

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// A colour utility is <prefix>-<family>-<shade> (optionally variant-prefixed: hover:, md:, group-hover:…,
// and optionally an /opacity suffix). Requiring the prefix + the trailing shade digits is what keeps this
// from false-positiving on prose ("the emerald-vs-green drift", the word "prose", "…committing grays Pace").
const COLOR_PREFIX = 'bg|text|border|ring|ring-offset|from|via|to|divide|outline|decoration|fill|stroke|placeholder|caret|accent|shadow';
const FORBIDDEN = ['emerald', 'orange', 'rose', 'gray', 'slate', 'zinc', 'neutral'];
const re = new RegExp('\\b(?:' + COLOR_PREFIX + ')-(' + FORBIDDEN.join('|') + ')-\\d{2,3}(?:/\\d{1,3})?\\b', 'g');

// Self-test — prove the detector actually works, so a clean pass means "swept", not "regex broke".
// (A no-op regex would also report 0 hits; this is the guard against that.)
{
  const probe = new RegExp(re.source);  // stateless clone (no /g)
  ok('lint DETECTS a forbidden sample (bg-emerald-700)', probe.test('class="hover:bg-emerald-700 foo"'));
  ok('lint IGNORES allowed families + prose', !probe.test('bg-green-100 bg-amber-200 text-red-700 stone-50') && !probe.test('the emerald-vs-green drift; prose; committing grays Pace'));
}

// Scan index.html + every domain-app*.js mixin for an eliminated family.
const dir = path.join(__dirname, '..');
const files = ['index.html', ...fs.readdirSync(dir).filter(f => /^domain-app.*\.js$/.test(f)).sort()];
const hits = [];
for(const f of files){
  const s = (f === 'index.html') ? html : fs.readFileSync(path.join(dir, f), 'utf8');
  const r = new RegExp(re.source, 'g');  // fresh per file (reset lastIndex)
  let m;
  while((m = r.exec(s)) !== null){
    const line = s.slice(0, m.index).split('\n').length;
    hits.push({ file: f, token: m[0], family: m[1], line });
  }
}

ok('no forbidden raw palette utility (emerald/orange/rose/gray/slate/zinc/neutral) in index.html + the domain-app*.js mixins',
   hits.length === 0,
   hits.length ? (hits.length + ' found — e.g. ' + hits.slice(0, 12).map(h => h.token + '@' + h.file + ':' + h.line).join(', ')) : '');

// Per-family breakdown when something slips in, so the failure points straight at the offender.
if(hits.length){
  const byFam = {};
  hits.forEach(h => { (byFam[h.family] = byFam[h.family] || []).push(h.file + ':' + h.line); });
  for(const fam of FORBIDDEN){
    if(byFam[fam]) ok('family "' + fam + '" is fully swept', false, byFam[fam].length + ' usage(s) at ' + byFam[fam].slice(0, 20).join(', '));
  }
}

// Lock in the H1 deliverables (a silent revert of any of these is the drift returning).
ok('the universal hover was unified — no raw `hover:bg-yellow-100` remains',
   !/hover:bg-yellow-100\b/.test(html));
ok('.hover-tint class is defined (the one universal hover)',
   /\.hover-tint:hover\s*\{/.test(html));
ok('the verbatim legacy button signature is gone (migrated to .btn)',
   !html.includes('border border-ink rounded hover:bg-yellow-100'));
ok('.accent-green routes through the --c-success token (one success green)',
   /\.accent-green\s*\{\s*color:\s*var\(--c-success\)/.test(html));

console.log('\n=============================================');
console.log('palette.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail > 0){ console.log('\nFAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
