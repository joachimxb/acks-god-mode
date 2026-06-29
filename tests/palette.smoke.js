// =============================================================================
// palette.smoke.js — the colour-token guard (graphic-designer audit H1, 2026-06-25).
//
// The :root token block is meant to be the only legal source of colour, but the surface had
// drifted across redundant Tailwind palette families for the same semantic role (two greens —
// green + emerald; warning across yellow/amber/orange; danger across red + rose; cool greys on a
// warm ground). The H1 sweep unified the drift families in the markup:
//     emerald → green,   orange → amber,   rose → red,   gray/stone → the warm ramp   (+ slate/zinc/neutral stay out)
// and routed the ~280 universal `hover:bg-yellow-100` hovers + the 182 verbatim legacy buttons onto
// the .hover-tint / .btn classes. This test keeps the eliminated families from creeping back.
//
// FORBIDDEN (this pass eliminated them — a re-introduction is the drift returning):
//     emerald, orange, rose, gray, slate, zinc, neutral, stone
// STILL ALLOWED (these raw families still appear and stay allowed — they need per-node judgment):
//     green, amber, yellow, red   (sky/blue/purple/etc. untouched; stone was the warm-neutral target but is
//     now ELIMINATED too — its 32 sites route onto the .bg-warm/.border-hairline/.text-muted ramp, 2026-06-29)
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
//
// TINTS CLOSED + PRINT (2026-06-29): the last 3 raw tints (table/input/scrollbar hairline + the arcane-
// purple bg/fg) became :root tokens (--c-rule-hairline / --c-arcane / --c-arcane-bg) — every inline
// colour now routes through a token — and the one-line print rule became a real @media print block. What
// remains is VISIBLE redesign (typography scale, stone→warm retint, wordmark, emoji de-sat) — out of
// scope here; those need design sign-off.
// =============================================================================
const fs = require('fs'), path = require('path');
let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); } }

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// A colour utility is <prefix>-<family>-<shade> (optionally variant-prefixed: hover:, md:, group-hover:…,
// and optionally an /opacity suffix). Requiring the prefix + the trailing shade digits is what keeps this
// from false-positiving on prose ("the emerald-vs-green drift", the word "prose", "…committing grays Pace").
const COLOR_PREFIX = 'bg|text|border|ring|ring-offset|from|via|to|divide|outline|decoration|fill|stroke|placeholder|caret|accent|shadow';
const FORBIDDEN = ['emerald', 'orange', 'rose', 'gray', 'slate', 'zinc', 'neutral', 'stone'];
const re = new RegExp('\\b(?:' + COLOR_PREFIX + ')-(' + FORBIDDEN.join('|') + ')-\\d{2,3}(?:/\\d{1,3})?\\b', 'g');

// Self-test — prove the detector actually works, so a clean pass means "swept", not "regex broke".
// (A no-op regex would also report 0 hits; this is the guard against that.)
{
  const probe = new RegExp(re.source);  // stateless clone (no /g)
  ok('lint DETECTS forbidden samples (bg-emerald-700, bg-stone-100)', probe.test('class="hover:bg-emerald-700 foo"') && probe.test('class="bg-stone-100"'));
  ok('lint IGNORES allowed families + prose', !probe.test('bg-green-100 bg-amber-200 text-red-700 bg-sky-100') && !probe.test('the emerald-vs-green drift; prose; committing grays Pace'));
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

// Segmented controls (H1, 2026-06-26 → 2026-06-29) — the selected tab/segmented pill is a token-driven
// fill. As of the 2026-06-29 follow-on it is the dark --c-ink (was the mid-brown --c-border); the inline
// active-underline still routes through --c-ink. (raw hex stays out of the rule.)
ok('.tab-active (the universal selected state) is the dark --c-ink token (was --c-border; no raw hex)',
   /\.tab-active\s*\{\s*background:\s*var\(--c-ink\);\s*color:\s*var\(--c-parchment\)/.test(html) &&
   !/\.tab-active\s*\{[^}]*#[0-9a-fA-F]{6}/.test(html));
ok('no raw segmented-control active-underline remains (the border-color:#2a1f12 :style ternary → --c-ink)',
   !/border-color:#2a1f12\b/.test(html));

// Tab strips (H1 follow-on, 2026-06-29) — the SELECTED state is one dark --c-ink fill everywhere (nav
// tabs, the sub-tab strips, the selected Domains/Characters table rows, the in-dialog toggles). The
// underline tab strips (nav sub-tabs + the modal-sheet tabs: stash / ventures / character editor)
// additionally carry .tab-pill = full rounding + no underline, so the selected tab reads as a pill.
ok('.tab-pill renders the underline tab strips as a full pill (radius + no underline)',
   /\.tab-pill\s*\{[^}]*border-radius:\s*9999px[^}]*border-bottom-width:\s*0/.test(html));
ok('every underline tab strip (sub-tabs + modal-sheet tabs) carries tab-pill (>=12)',
   (html.match(/border-b-2[^"]*tab-pill/g) || []).length >= 12);

// Core token colours (H1, 2026-06-26) — the 5 core palette hexes are now used ONLY in their :root
// definitions; everywhere else (<style> rules + inline styles) routes through var(). The bespoke
// one-off tints (no token) are a separate, *visible-change* follow-on needing design decisions.
ok('the 5 core token colours appear only in their :root definitions (not raw in <style>/inline)',
   (html.match(/#7a1f1f/gi)||[]).length === 1 && (html.match(/#f7f1e2/gi)||[]).length === 1 &&
   (html.match(/#2a1f12/gi)||[]).length === 2 && (html.match(/#6b4f24/gi)||[]).length === 1 &&
   (html.match(/#faf6ea/gi)||[]).length === 1);

// Print stylesheet (H1, 2026-06-29) — the one-liner became real @media print rules for the ledgers/
// sheets GMs print: repeat the table header per page, keep rows whole, darken the hairlines to ink.
ok('the print stylesheet repeats ledger headers + keeps ledger rows whole',
   /@media print\b[\s\S]*?display:\s*table-header-group/.test(html) &&
   /@media print\b[\s\S]*?break-inside:\s*avoid/.test(html));

// Decorative neutral + arcane accent (H1, 2026-06-29) — the last 3 raw tints (the warm table/input/
// scrollbar hairline + the categorical arcane-purple bg/fg) are now :root tokens, used ONLY in their
// definitions; everything else routes through var(--c-rule-hairline) / var(--c-arcane) / -bg.
ok('--c-rule-hairline + --c-arcane(-bg) are defined in :root',
   /--c-rule-hairline:\s*#c4b88f/.test(html) && /--c-arcane:\s*#6b21a8/.test(html) && /--c-arcane-bg:\s*#f4eefb/.test(html));
ok('the hairline + arcane hexes appear only in their :root definitions (not raw in <style>/inline)',
   (html.match(/#c4b88f/gi)||[]).length === 1 && (html.match(/#6b21a8/gi)||[]).length === 1 &&
   (html.match(/#f4eefb/gi)||[]).length === 1);

// Bespoke-tint convergence (H1, 2026-06-26; closed 2026-06-29) — the hand-picked inline tints route onto
// role tokens (danger/success/info/warning + creams → parchment/vellum + browns → border). The final
// holdouts (the 2 arcane purples + the table-hairline tan) are now :root tokens too. Lock: NO raw 6-hex
// remains in ANY inline style/:style value — every inline colour is a var() / color-mix() on a token.
{
  const TOKVAL = new Set(['#2f7d32','#d8ead9','#9a6a14','#f4e3bd','#7a1f1f','#f0d6d6','#1f4e6b','#d6e6f0','#2a1f12','#6b4f24','#f7f1e2','#faf6ea','#e7c46c','#3a1414','#c08a3e','#6b21a8','#f4eefb','#c4b88f']);
  let rawTints = 0;
  for (const a of html.matchAll(/(?::style|x-bind:style|style)\s*=\s*("|')([\s\S]*?)\1/g))
    for (const hx of (a[2].match(/#[0-9a-fA-F]{6}/g) || []))
      if (!TOKVAL.has(hx.toLowerCase())) rawTints++;
  ok('no raw tint remains in inline styles (every inline colour routes through a token)',
     rawTints === 0, rawTints + ' raw tint(s) still inline');
}

// Typography scale (H1, 2026-06-29) — h2 (was colliding with h3 at text-lg) bumped to >= text-xl so a
// section heading outranks a sub-section; the 37 sub-12px text-[10px]/[11px] escapes lifted to text-xs.
ok('no sub-12px text-[10px]/[11px] escape remains (lifted to text-xs)',
   !/text-\[1[01]px\]/.test(html));
ok('no h2 still renders at text-lg (h2 now >= text-xl, above h3 text-lg)',
   !/<h2\b[^>]*\btext-lg\b/.test(html));

// Warm-neutral retint (H1, 2026-06-29) — the 32 cool stone-* greys route onto a warm, token-derived ramp
// (.bg-warm/.bg-warm-2 = color-mix on parchment+border, .border-hairline = the tan rule, .text-muted = faded ink).
// (The FORBIDDEN scan above already guards that no raw stone-* utility returns.)
ok('the warm-neutral utilities are defined + token-derived (the stone-* replacements)',
   /\.bg-warm\s*\{[^}]*color-mix\(in srgb, var\(--c-parchment\)/.test(html) &&
   /\.border-hairline\s*\{[^}]*var\(--c-rule-hairline\)/.test(html) &&
   /\.text-muted\s*\{[^}]*color-mix\(in srgb, var\(--c-ink\)/.test(html));

// SVG icon system (H1 path b, 2026-06-29) — emoji → inline-SVG. Identity glyphs are <symbol> defs in the
// sprite after <body>; rendered via <svg class="ico"><use href="#i-NAME"></use></svg> (static) or
// window.acksIcon('NAME') (dynamic x-html). Lock: the class + sprite exist, EVERY #i-NAME reference (static
// <use> + acksIcon() calls, across index.html + the mixins) resolves to a defined <symbol> — a typo'd or
// missing icon fails CI — and each CONVERTED glyph's chrome pattern stays gone (a revert is a regression).
{
  ok('.ico class is defined (1em square, currentColor)',
     /\.ico\s*\{[^}]*fill:\s*currentColor/.test(html));
  const defined = new Set([...html.matchAll(/<symbol\s+id="(i-[a-z0-9-]+)"/g)].map(m => m[1]));
  ok('the icon sprite defines >= 12 identity symbols', defined.size >= 12, defined.size + ' defined');
  // gather every referenced icon id across index.html + the mixins: <use href="#i-X"> and acksIcon('X')
  const referenced = new Set();
  for (const f of files) {                                   // `files` = index.html + the domain-app*.js mixins
    const s = (f === 'index.html') ? html : fs.readFileSync(path.join(dir, f), 'utf8');
    for (const m of s.matchAll(/href="#(i-[a-z0-9-]+)"/g)) referenced.add(m[1]);
    for (const m of s.matchAll(/acksIcon\(\s*['"]([a-z0-9-]+)/g)) referenced.add('i-' + m[1]);
  }
  const dangling = [...referenced].filter(id => !defined.has(id));
  ok('every #i-NAME reference resolves to a defined <symbol> (no dangling icon refs)',
     dangling.length === 0, dangling.length ? 'dangling: ' + dangling.join(', ') : '');
  // Top-nav data-field conversion (H1, 2026-06-29) — the 8 topViews tabs render their icon via a DYNAMIC
  // `:href="'#i-' + v.icon"`, which the static dangling scan above cannot verify; lock the 4 new nav
  // symbols exist + that the data-field split landed (icon: fields present, no leading emoji in labels).
  for (const id of ['i-world', 'i-people', 'i-masks', 'i-gear'])
    ok('nav symbol ' + id + ' is defined (referenced only dynamically by the top tab strip)', defined.has(id));
  const appJs = fs.readFileSync(path.join(dir, 'domain-app.js'), 'utf8');
  ok('the top-nav data-field split landed (icon: fields present, no emoji baked into the tab labels)',
     /icon:'world'/.test(appJs) && /icon:'gear'/.test(appJs) && !/label:'(?:🌍|👥|🎭|⚙)/.test(appJs));
  ok('the nav template renders each tab icon via <use :href>',
     html.includes("<use :href=\"'#i-' + v.icon\""));
  // World sub-tab conversion (H1, 2026-06-29) — the worldSubTabs strip renders its icon via the same
  // DYNAMIC `:href="'#i-' + tab.icon"`; lock the 5 new World glyphs exist + the data-field split landed.
  for (const id of ['i-map', 'i-hex', 'i-pin', 'i-speech', 'i-church'])
    ok('World sub-tab symbol ' + id + ' is defined (referenced only dynamically by the World sub-strip)', defined.has(id));
  ok('the World sub-tab data-field split landed (icon: fields present, no emoji in the worldSubTabs labels)',
     /icon:'map'/.test(appJs) && /icon:'church'/.test(appJs) && !/label:'(?:🗺|⬡|📍|🗣|⛪)/.test(appJs));
  ok('the World sub-tab template renders each tab icon via <use :href>',
     html.includes("<use :href=\"'#i-' + tab.icon\""));
  // Events sub-tab conversion (H1, 2026-06-29) — reviewSubTabs split the same way; 5 new dynamic glyphs
  // + i-book for the static 📖 Annals button (covered by the dangling scan too). scroll/quill/sword reused.
  for (const id of ['i-inbox', 'i-calendar', 'i-envelope', 'i-banner', 'i-siege', 'i-book'])
    ok('Events sub-tab symbol ' + id + ' is defined', defined.has(id));
  ok('the Events sub-tab data-field split landed (icon: fields present, no emoji in the reviewSubTabs labels)',
     /icon:'inbox'/.test(appJs) && /icon:'siege'/.test(appJs) && !/label:'(?:📥|📅|📨|📝|🎌|🏯)/.test(appJs));
  ok('the 📖 Annals button renders #i-book (static use)', html.includes('<use href="#i-book">'));
  // Monthly-Turn sub-tab conversion (H1, 2026-06-29) — monthlyTurnSubTabs split (loop var `t`); 4 new
  // dynamic glyphs + i-castle reused for Domains. (🗡 is still in the unconverted Hijinks tab, so lock the
  // SPECIFIC old labels here, not a glyph-class regex.)
  for (const id of ['i-crane', 'i-wave', 'i-dagger', 'i-house'])
    ok('Monthly-Turn sub-tab symbol ' + id + ' is defined', defined.has(id));
  ok('the Monthly-Turn sub-tab data-field split landed (icon: fields present, the old emoji labels gone)',
     /icon:'crane'/.test(appJs) && /icon:'house'/.test(appJs) &&
     !/label:'🏗 Construction'/.test(appJs) && !/label:'🗡 Syndicates'/.test(appJs));
  ok('the Monthly-Turn sub-tab template renders each tab icon via <use :href> (loop var t)',
     html.includes("<use :href=\"'#i-' + t.icon\""));
  // Activities sub-tab conversion (H1, 2026-06-29) — activitiesSubTabs split (loop var `tab`, shared
  // `<use :href="'#i-' + tab.icon">` template guarded by the World block above); 5 new dynamic glyphs
  // (clipboard/tent/bank/wand/arena) + scales/sword/dagger reused. ⚖/⚔/🗡 recur elsewhere as data, so
  // lock the SPECIFIC old labels here rather than a glyph-class regex.
  for (const id of ['i-clipboard', 'i-tent', 'i-bank', 'i-wand', 'i-arena'])
    ok('Activities sub-tab symbol ' + id + ' is defined', defined.has(id));
  ok('the Activities sub-tab data-field split landed (icon: fields present, the old emoji labels gone)',
     /icon:'clipboard'/.test(appJs) && /icon:'arena'/.test(appJs) &&
     !/label:'📋 Activities'/.test(appJs) && !/label:'🗡 Hijinks'/.test(appJs));
  // Roster + Domains sub-tab conversion (H1, 2026-06-29) — rosterSubTabs split (loop var `tab`); 5 new
  // dynamic glyphs (portrait/beast/village/ship/wizard) + i-people (Groups) / i-book (Knowledge) reused.
  // Monsters (i-beast, a horned face) + wizard are the pictorial pair (clean monochrome silhouettes that
  // survive 16px). Domains is a lone castle-reuse tab (the strip auto-hides at length 1; converted for hygiene).
  for (const id of ['i-portrait', 'i-beast', 'i-village', 'i-ship', 'i-wizard'])
    ok('Roster sub-tab symbol ' + id + ' is defined', defined.has(id));
  ok('the Roster sub-tab data-field split landed (icon: fields present, the old emoji labels gone)',
     /icon:'portrait'/.test(appJs) && /icon:'wizard'/.test(appJs) &&
     !/label:'👤 Characters'/.test(appJs) && !/label:'🐉 Monsters'/.test(appJs));
  ok('the Domains sub-tab data-field split landed (no emoji in the lone Domains label)',
     !/label:'🏰 Domains'/.test(appJs));
  // Inspector ✏/🔒 toggle (H1 dynamic-emitter, 2026-06-29) — the one dynamic edit-chrome button: its
  // x-text emoji label became x-html acksIcon (i-quill/i-lock; i-lock is referenced only via acksIcon('lock'),
  // covered by the dangling scan). Lock that the old emoji x-text literal is gone + the acksIcon form landed.
  ok('the Inspector Edit/Done toggle emits SVG icons via acksIcon (no emoji x-text literal)',
     !html.includes("? '🔒 Done editing' : '✏ Edit'") && html.includes("acksIcon('quill') + ' Edit'"));
  // Per-glyph regression locks — each converted glyph's chrome pattern must stay eliminated.
  // NOTE: use a SPECIFIC converted chrome string per glyph, not the bare `>GLYPH ` — for 📜/🏰 the
  // deliberately-kept prose protections (`<strong>📜 Issue letter</strong>`, `<span>🏰 The monthly
  // turn is staged…`) still legitimately contain `>GLYPH `, so a bare lock would false-fail.
  const CONVERTED = [
    { glyph: '✏', pattern: '>✏</button>',          note: 'edit-pencil buttons → #i-quill' },
    { glyph: '🔍', pattern: '>🔍 Open in Inspector', note: 'search/inspector chrome → #i-glass' },
    { glyph: '📜', pattern: '>📜 Chronicle',         note: 'chronicle/events chrome → #i-scroll' },
    { glyph: '🏰', pattern: '>🏰 Create domain',     note: 'domain/stronghold chrome → #i-castle' },
    { glyph: '💰', pattern: '>💰 Generate treasure',  note: 'treasury/money chrome → #i-bag' },
    { glyph: '🔮', pattern: '>🔮 Arcane</button>',    note: 'magic/arcane chrome → #i-orb' },
    { glyph: '🪖', pattern: '>🪖 Units on the march',  note: 'military/unit chrome → #i-helm' },
    { glyph: '⚖', pattern: '>⚖ Establish oligarchy',  note: 'law/governance chrome → #i-scales' },
    { glyph: '🏛', pattern: '>🏛 Generate a senate',   note: 'building/senate chrome → #i-temple' },
  ];
  for (const c of CONVERTED)
    ok('converted glyph ' + c.glyph + ' stays converted (' + c.note + ')',
       !html.includes(c.pattern), 'chrome pattern "' + c.pattern + '" reappeared');
}

console.log('\n=============================================');
console.log('palette.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail > 0){ console.log('\nFAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
