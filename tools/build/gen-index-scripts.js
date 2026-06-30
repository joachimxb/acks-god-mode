#!/usr/bin/env node
'use strict';
/* tools/build/gen-index-scripts.js — generate index.html's <script> load blocks.
 *
 * Replaces the hand-maintained `<script src="…?v=<date-tag>">` tags with a GENERATED block driven by
 * tools/build/load-order.js: one source for load order, content-hash cache-busting, and a CI sync
 * guard. NOT a bundler / not an ES-module migration / not a runtime or deploy build — a committed
 * dev-time codegen, exactly like tools/build/build_catalog.js. The served index.html stays directly
 * browser-loadable with no build (delivery property (a), Architecture.md §18).
 *
 *   node tools/build/gen-index-scripts.js           # rewrite the marked regions in index.html
 *   node tools/build/gen-index-scripts.js --check    # exit 1 if the committed regions are stale (CI)
 *
 * Cache-bust = ?v=<first 8 hex of sha256(file bytes)> per project module — it changes iff the file
 * changes, so the per-session hand-bump ritual is gone. Vendor (Tailwind/Alpine) tags are version-
 * pinned in their filenames and are NOT in any region (no ?v=, never rewritten).
 *
 * Only the bytes BETWEEN a region's BEGIN/END markers are ever rewritten — the CSP <meta> and every
 * other byte are physically out of reach, so the 2026-06-24 cache-bust-into-<meta> corruption class
 * cannot recur by construction. Authored 2026-06-25 (T1, Architecture.md §18.2a).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { REPO, DEMO_TEMPLATE, engineModuleFiles, appModuleFiles } = require('./load-order.js');

const INDEX = path.join(REPO, 'index.html');
const CHECK = process.argv.includes('--check');
const EOL = '\r\n';   // index.html is CRLF throughout — preserve it.

// content hash: ?v=<sha256(file bytes)[:8]>. Reads raw bytes, so a module's own CRLF/LF is irrelevant.
function hash(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(path.join(REPO, file))).digest('hex').slice(0, 8);
}
function tag(file) { return `<script src="${file}?v=${hash(file)}"></script>`; }

// The three generated regions, each delimited by marker comments already present in index.html.
const REGIONS = [
  { name: 'engine', files: engineModuleFiles },        // the acks-engine*.js block (the bulk + the order)
  { name: 'demo',   files: () => [DEMO_TEMPLATE] },     // the inlined demo-campaign template
  { name: 'tail',   files: appModuleFiles },            // domain-app.js + the domain-app-*.js mixins
];

function regionBody(region) { return EOL + region.files().map(tag).join(EOL) + EOL; }

function markers(name) {
  return { begin: `<!-- BEGIN generated:scripts:${name} -->`, end: `<!-- END generated:scripts:${name} -->` };
}

// Rewrite every region's inner content; leave the markers + everything outside them byte-for-byte.
function applyRegions(html) {
  let out = html;
  for (const region of REGIONS) {
    const { begin, end } = markers(region.name);
    const bi = out.indexOf(begin), ei = out.indexOf(end);
    if (bi < 0 || ei < 0 || ei < bi) {
      console.error(`gen-index-scripts: missing or malformed markers for region "${region.name}" (begin@${bi}, end@${ei}). Place the BEGIN/END comments before generating.`);
      process.exit(2);
    }
    out = out.slice(0, bi + begin.length) + regionBody(region) + out.slice(ei);
  }
  return out;
}

const current = fs.readFileSync(INDEX, 'utf8');
const next = applyRegions(current);

if (CHECK) {
  if (next === current) { console.log('gen-index-scripts --check: index.html script regions are in sync.'); process.exit(0); }
  const drifted = REGIONS.filter(region => {
    const { begin, end } = markers(region.name);
    return current.slice(current.indexOf(begin) + begin.length, current.indexOf(end)) !== regionBody(region);
  }).map(r => r.name);
  console.error('gen-index-scripts --check: index.html is STALE — run `npm run build:index` and commit.');
  console.error('  drifted region(s): ' + (drifted.join(', ') || '(whitespace/formatting)'));
  process.exit(1);
}

// write mode — atomic (tmp + rename, same dir) + Node readback verify (CLAUDE §3, index.html is the
// 1.7 MB truncation-sensitive file).
if (next === current) { console.log('gen-index-scripts: index.html already up to date (no change).'); process.exit(0); }
const tmp = INDEX + '.tmp';
fs.writeFileSync(tmp, next);
fs.renameSync(tmp, INDEX);
const back = fs.readFileSync(INDEX, 'utf8');
const okSize = back.length > 500000;
const okEnd = /<\/html>\s*$/.test(back);
const okMarkers = REGIONS.every(r => { const { begin, end } = markers(r.name); return back.includes(begin) && back.includes(end); });
if (!okSize || !okEnd || !okMarkers) {
  console.error(`gen-index-scripts: POST-WRITE VERIFY FAILED (size=${okSize} end=${okEnd} markers=${okMarkers}) — restore index.html from git.`);
  process.exit(3);
}
console.log(`gen-index-scripts: index.html written (${back.length} bytes).  regions → ` +
  REGIONS.map(r => `${r.name}:${r.files().length}`).join('  '));
