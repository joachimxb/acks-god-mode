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
// STILL ALLOWED (these raw families still appear and stay allowed — they need per-node judgment):
//     green, amber, yellow, red   (+ stone is the warm-neutral target; sky/blue/purple/etc. untouched)
//
// Scope = index.html + the domain-app*.js mixins. The 2026-06-25 follow-on swept the mixins' 14
// straggler utilities (orange→amber, gray→stone) and extended this guard to cover them too.
//
// TOKEN-ROUTING (2026-06-26): the high-confidence STATIC green/amber/red utilities were routed onto the
// --c-* tokens via a small class layer — text→.accent-{green,red,amber} (color), bg→.tint-{…} (the -bg
// token), border→.bdr-{…} (the role colour). This guard now LOCKS those classes (a silent revert is the
// drift returning). What remains green/amber/yellow/red-raw (and still allowed above) is the deferred
// follow-on: the :class ternary literals (incl. shade-gradients), variant-prefixed (hover:/focus:),
// opacity-suffixed, the yellow highlight/selection family (not a semantic role), and the mixins.
//
// MODAL SURFACE (2026-06-26): the 66 sized content dialogs hand-styled the same inline skeleton
// (vellum + ink border + rounded + shadow) — routed to ONE token-driven .modal-card; the pre-existing
// wide Action-Wizard .modal-panel pair had its hardcoded hex routed to tokens. This guard LOCKS both.
//
// COLOUR LONG-TAIL (2026-06-26): the translucent borders/tints (`/opacity`) + hover states that still
// bypassed the tokens route onto color-mix opacity variants (.bdr-*/NN, .tint-*/NN) + .hover-accent/.hover-tint.
// This guard locks the vocabulary + that no routable opacity/hover raw utility returns (the strong
// hover:bg-red-400 is the one intentional keep). Remaining raw colour = 69 yellow (highlight, not a role)
// + ~16 intentional gradients/categorical/ring — all correctly out of scope.
//
// MODAL BACKDROP (2026-06-26): the modal overlays dimmed the page three ways (inline rgba .45/.4, the
// Tailwind black-opacity class, the wizard .modal-backdrop .55) at three alphas. Routed onto two tokens —
// --c-backdrop (.45 standard, converging the .40 drift) + --c-backdrop-strong (.55, the wider Action-
// Wizard, kept heavier like its .modal-panel). z-index/alignment/scroll stay per-modal (functional).
// This guard locks the tokens + that no raw dim returns AND the faint bg-black/5 + rgba(0,0,0,.03|.04)
// surface tints survive (they are NOT backdrops and must not be swept).
//
// SEGMENTED CONTROLS (2026-06-26): the selected tab/segmented pill (.tab-active, was raw hex) + the
// inline active-underline that sub-tab strips add (a :style ternary, was border-color:#2a1f12) route
// onto the --c-border / --c-parchment / --c-ink tokens. (The activity-row fills + the broader raw hex
// still in <style> rules + other inline styles are a named follow-on — "route the remaining raw hex".)
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

// Token-routing (2026-06-26) — lock the semantic class layer the static green/amber/red utilities route onto.
ok('.accent-red routes through the --c-danger token (was the hardcoded #7a1f1f)',
   /\.accent-red\s*\{\s*color:\s*var\(--c-danger\)/.test(html));
ok('.accent-amber routes through the --c-warning token',
   /\.accent-amber\s*\{\s*color:\s*var\(--c-warning\)/.test(html));
ok('the .tint-{green,amber,red} background classes route through the --c-*-bg tokens',
   /\.tint-green\s*\{\s*background-color:\s*var\(--c-success-bg\)/.test(html) &&
   /\.tint-amber\s*\{\s*background-color:\s*var\(--c-warning-bg\)/.test(html) &&
   /\.tint-red\s*\{\s*background-color:\s*var\(--c-danger-bg\)/.test(html));
ok('the .bdr-{green,amber,red} border classes route through the --c-* tokens',
   /\.bdr-green\s*\{\s*border-color:\s*var\(--c-success\)/.test(html) &&
   /\.bdr-amber\s*\{\s*border-color:\s*var\(--c-warning\)/.test(html) &&
   /\.bdr-red\s*\{\s*border-color:\s*var\(--c-danger\)/.test(html));

// Modal surface (H1, 2026-06-26) — the 66 sized content dialogs hand-styled the same inline skeleton
// (vellum + border-ink + rounded + shadow) across two eras; routed to ONE token-driven .modal-card.
// The pre-existing Action-Wizard pair (.modal-backdrop/.modal-panel, wide 60vw) kept its distinct look
// but had its hardcoded hex routed to the tokens. Lock both (a silent revert is the drift returning).
ok('.modal-card is defined and token-driven (vellum bg + 1px --c-border)',
   /\.modal-card\s*\{[^}]*background:\s*var\(--c-vellum\)/.test(html) &&
   /\.modal-card\s*\{[^}]*border:\s*1px solid var\(--c-border\)/.test(html));
ok('the sized modals use .modal-card (>= 60 usages — guards a mass-revert)',
   (html.match(/class="modal-card\b/g) || []).length >= 60);
ok('no inline modal skeleton remains (the canonical `vellum border border-ink rounded shadow-lg` is routed)',
   !html.includes('vellum border border-ink rounded shadow-lg'));
ok('the Action-Wizard .modal-panel bg is routed to --c-parchment (hardcoded #f7f1e2 gone from the rule)',
   /\.modal-panel\s*\{[^}]*background:\s*var\(--c-parchment\)/.test(html) &&
   !/\.modal-panel\s*\{[^}]*#f7f1e2/.test(html));

// Opacity + hover token vocabulary (H1 long-tail, 2026-06-26) — the translucent borders/tints + hover
// states that bypassed the tokens route onto color-mix opacity variants + .hover-accent/.hover-tint.
ok('the opacity-variant role classes are defined with color-mix on the --c-* tokens',
   html.includes('.bdr-green\\/30 { border-color: color-mix(in srgb, var(--c-success) 30%') &&
   html.includes('.bdr-amber\\/60 { border-color: color-mix(in srgb, var(--c-warning) 60%') &&
   html.includes('.tint-green\\/60 { background-color: color-mix(in srgb, var(--c-success-bg) 60%'));
ok('the hover role classes route through the --c-* tokens',
   /\.hover-accent-red:hover\s*\{\s*color:\s*var\(--c-danger\)/.test(html) &&
   /\.hover-tint-green:hover\s*\{\s*background-color:\s*var\(--c-success-bg\)/.test(html));
ok('no routable opacity colour utility remains (border/bg green|amber|red with /opacity)',
   !/\b(?:border|bg)-(?:green|amber|red)-\d{2,3}\/\d{1,3}\b/.test(html));
ok('no routable hover colour utility remains (hover:text-red|amber, light hover:bg-red|green; the strong hover:bg-red-400 is intentionally kept)',
   !/\bhover:text-(?:red|amber)-\d{2,3}\b/.test(html) &&
   !/\bhover:bg-(?:red|green)-(?:50|100|200)\b/.test(html));

// Modal backdrop dim (H1, 2026-06-26) — the three overlay-dim conventions (inline rgba .45/.4, the
// Tailwind black-opacity class, the wizard .modal-backdrop .55) route onto two tokens: --c-backdrop
// (the .45 standard, converging the .40 drift) + --c-backdrop-strong (.55, the wider Action-Wizard).
ok('the backdrop dim tokens are defined in :root',
   /--c-backdrop:\s*rgba\(0,0,0,0?\.45\)/.test(html) &&
   /--c-backdrop-strong:\s*rgba\(0,0,0,0?\.55\)/.test(html));
ok('.modal-dim carries the standard dim from the token',
   /\.modal-dim\s*\{\s*background-color:\s*var\(--c-backdrop\)/.test(html));
ok('the centered overlays use .modal-dim (>= 16 — guards a mass-revert)',
   (html.match(/\bmodal-dim\b/g) || []).length >= 16);
ok('the Action-Wizard .modal-backdrop dims from --c-backdrop-strong (raw rgba gone from the rule)',
   /\.modal-backdrop\s*\{[^}]*background:\s*var\(--c-backdrop-strong\)/.test(html) &&
   !/\.modal-backdrop\s*\{[^}]*rgba\(/.test(html));
ok('no raw modal backdrop dim remains (inline rgba(0,0,0,.4|.45) + the Tailwind bg-black/40 class)',
   !/background:rgba\(0,0,0,\.45?\)/.test(html) &&
   !/\bbg-black\/40\b/.test(html));
ok('the faint surface tints are untouched (bg-black/5 + rgba(0,0,0,.03|.04) survive — not over-swept)',
   /\bbg-black\/5\b/.test(html) && /rgba\(0,0,0,\.0[34]\)/.test(html));

// Overlay shell (H1, 2026-06-29) — the 50 scrolling dialogs each repeated the same 6-class Tailwind
// shell + an inline backdrop dim; extracted to ONE .modal-overlay class (the dim rides along via
// var(--c-backdrop)). z-index + padding stay inline (per-modal/functional); the items-center centered
// dialogs (.modal-dim) are a separate archetype, untouched. Lock the class + that the shell isn't
// re-inlined and no Family-A inline backdrop pairing returns.
ok('.modal-overlay is defined and token-driven (fixed/flex top-aligned scroll + the --c-backdrop dim)',
   /\.modal-overlay\s*\{[^}]*position:\s*fixed/.test(html) &&
   /\.modal-overlay\s*\{[^}]*align-items:\s*flex-start/.test(html) &&
   /\.modal-overlay\s*\{[^}]*overflow-y:\s*auto/.test(html) &&
   /\.modal-overlay\s*\{[^}]*background:\s*var\(--c-backdrop\)/.test(html));
ok('the scrolling dialogs use .modal-overlay (>= 50 — guards a mass-revert)',
   (html.match(/class="modal-overlay\b/g) || []).length >= 50);
ok('the raw scrolling-overlay shell is not re-inlined (the 6-class Tailwind shell is routed)',
   !/fixed inset-0 flex items-start justify-center overflow-y-auto/.test(html));
ok('no Family-A inline backdrop pairing remains (z-index + background:var(--c-backdrop) folded into the class)',
   !/z-index:\d+; background:var\(--c-backdrop\)/.test(html));

// Segmented controls (H1, 2026-06-26) — the selected tab/segmented pill + its inline active-underline
// route through the --c-border / --c-parchment / --c-ink tokens (were raw hex).
ok('.tab-active (the selected segmented control) is token-driven (raw hex gone from the rule)',
   /\.tab-active\s*\{\s*background:\s*var\(--c-border\);\s*color:\s*var\(--c-parchment\)/.test(html) &&
   !/\.tab-active\s*\{[^}]*#[0-9a-fA-F]{6}/.test(html));
ok('no raw segmented-control active-underline remains (the border-color:#2a1f12 :style ternary → --c-ink)',
   !/border-color:#2a1f12\b/.test(html));

// Core token colours (H1, 2026-06-26) — the 5 core palette hexes are now used ONLY in their :root
// definitions; everywhere else (<style> rules + inline styles) routes through var(). The bespoke
// one-off tints (no token) are a separate, *visible-change* follow-on needing design decisions.
ok('the 5 core token colours appear only in their :root definitions (not raw in <style>/inline)',
   (html.match(/#7a1f1f/gi)||[]).length === 1 && (html.match(/#f7f1e2/gi)||[]).length === 1 &&
   (html.match(/#2a1f12/gi)||[]).length === 2 && (html.match(/#6b4f24/gi)||[]).length === 1 &&
   (html.match(/#faf6ea/gi)||[]).length === 1);

// Bespoke-tint convergence (H1, 2026-06-26) — the ~45 hand-picked inline tints route onto role tokens
// (danger/success/info/warning + the neutral creams → parchment/vellum + structural browns → border).
// The 2 off-palette purples + the decorative scrollbar/border tan stay raw. Lock: no convergeable raw
// hex remains in ANY inline style/:style value (the only raw inline hexes left are the 3 keeps + tokens).
{
  const TOKVAL = new Set(['#2f7d32','#d8ead9','#9a6a14','#f4e3bd','#7a1f1f','#f0d6d6','#1f4e6b','#d6e6f0','#2a1f12','#6b4f24','#f7f1e2','#faf6ea','#e7c46c','#3a1414','#c08a3e']);
  const KEEP = new Set(['#6b21a8','#f4eefb','#c4b88f']);
  let rawTints = 0;
  for (const a of html.matchAll(/(?::style|x-bind:style|style)\s*=\s*("|')([\s\S]*?)\1/g))
    for (const hx of (a[2].match(/#[0-9a-fA-F]{6}/g) || []))
      if (!TOKVAL.has(hx.toLowerCase()) && !KEEP.has(hx.toLowerCase())) rawTints++;
  ok('no bespoke raw tint remains in inline styles (all 7 families converged to tokens; 3 keeps allowed)',
     rawTints === 0, rawTints + ' raw tint(s) still inline');
}

console.log('\n=============================================');
console.log('palette.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail > 0){ console.log('\nFAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
