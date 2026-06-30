#!/usr/bin/env node
'use strict';
/* tools/build/bundle-single-file.js — emit a single self-contained acks-god-mode-<version>.html.
 *
 * Inlines every LOCAL `<script src>` in index.html (the vendored Tailwind/Alpine + the ~70 engine,
 * demo, and app modules) into the page, producing one file you can email or open from disk. NOT a
 * bundler/minifier — a literal concatenation that preserves the no-build property (Architecture.md
 * §18.4: "if a minified/bundled artifact is ever shipped it triggers an AGPL obligation"; this is
 * neither — it's the un-minified source, just concatenated). The output is a RELEASE ASSET, written
 * to dist/ (gitignored) and attached to a GitHub Release — it is NOT committed to the served folder.
 *
 *   node tools/build/bundle-single-file.js        # write dist/acks-god-mode-<version>.html
 *   require('./bundle-single-file.js').bundle()    # → { html, inlined, missing, skipped, lazy }
 *
 * Known limitation: the SheetJS (xlsx) library is loaded LAZILY at runtime from a relative
 * vendor/ path (only when the World Import/Export box is opened), so it is NOT inlined here — that
 * one feature needs the served folder / hosted site, not the single file. Everything else works
 * standalone (the CSP already grants 'unsafe-inline' + file:). Authored 2026-06-30 (T2,
 * Architecture.md §18.2a/§18.4 — the follow-on to the T1 load-order generator).
 */
const fs = require('fs');
const path = require('path');
const { REPO } = require('./load-order.js');

const INDEX = path.join(REPO, 'index.html');

// Inline every <script src="LOCAL"></script> (empty-body src tags). Inline <script> blocks (no src)
// and remote srcs (none today) are left untouched. The src may carry a ?v=… cache-bust — strip it.
function bundle() {
  let out = fs.readFileSync(INDEX, 'utf8');
  const re = /<script\b([^>]*?)\bsrc=("|')([^"']+)\2([^>]*?)><\/script>/gi;
  let inlined = 0, deferredCount = 0;
  const missing = [], skipped = [];
  out = out.replace(re, (m, pre, _q, src, post) => {
    if (/^https?:\/\//i.test(src)) { skipped.push(src); return m; }   // remote — leave as-is
    const rel = src.replace(/\?.*$/, '');                              // drop ?v=
    const abs = path.join(REPO, rel);
    if (!fs.existsSync(abs)) { missing.push(rel); return m; }
    // The classic inline-escape: a literal </script> inside JS (always in a string/regex/comment for
    // valid JS) would otherwise close the tag early. <\/script> is byte-equivalent in every such spot.
    const code = fs.readFileSync(abs, 'utf8').replace(/<\/script>/gi, '<\\/script>');
    inlined++;
    // `defer` is IGNORED on inline scripts. The original loads Alpine with `defer` so it initializes
    // only AFTER the whole document (every domain-app mixin) is present. Alpine auto-starts via
    // queueMicrotask with NO DOM-ready guard, so an un-deferred inline Alpine starts mid-parse and the
    // x-data component initializes WITHOUT Alpine's magics ($watch/$el/…) — init() then throws at its
    // first this.$watch(...). Replicate `defer` by wrapping the code to run at DOMContentLoaded.
    const isDefer = /\bdefer\b/i.test(pre) || /\bdefer\b/i.test(post);
    if (isDefer) {
      deferredCount++;
      return `<script>/* @inlined ${rel} — deferred → wrapped to run at DOMContentLoaded */\n` +
        `(function(){var __run=function(){\n${code}\n};` +
        `if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',__run,{once:true});else __run();})();\n</script>`;
    }
    return `<script>/* @inlined ${rel} */\n${code}\n</script>`;
  });
  // Detect the lazy xlsx loader (a runtime-injected relative <script>, not a static tag) so callers
  // can warn that World I/O won't work in the standalone file.
  const lazy = /vendor\/xlsx-[^"')]+/i.test(out) ? ['vendor/xlsx (lazy — World I/O needs the served folder)'] : [];
  return { html: out, inlined, missing, skipped, deferred: deferredCount, lazy };
}

module.exports = { bundle };

if (require.main === module) {
  const pkg = require(path.join(REPO, 'package.json'));
  const { html, inlined, missing, lazy } = bundle();
  if (missing.length) { console.error('bundle-single-file: missing src files: ' + missing.join(', ')); process.exit(1); }
  const okEnd = /<\/html>\s*$/.test(html);
  const leftover = (html.match(/<script\b[^>]*\bsrc=("|')(?!https?:)[^"']+\1/gi) || []).length;
  if (!okEnd || leftover) {
    console.error(`bundle-single-file: VERIFY FAILED (ends</html>=${okEnd}, leftover local src=${leftover}) — not written.`);
    process.exit(1);
  }
  const OUT_DIR = path.join(REPO, 'dist');
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const OUT = path.join(OUT_DIR, `acks-god-mode-${pkg.version}.html`);
  const tmp = OUT + '.tmp';
  fs.writeFileSync(tmp, html);
  fs.renameSync(tmp, OUT);
  console.log(`bundle-single-file: wrote dist/acks-god-mode-${pkg.version}.html (${(Buffer.byteLength(html) / 1048576).toFixed(2)} MB) — inlined ${inlined} scripts.`);
  if (lazy.length) console.log('  note (not inlined): ' + lazy.join('; '));
}
