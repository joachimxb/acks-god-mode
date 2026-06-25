#!/usr/bin/env node
'use strict';
/*
 * Cross-module bare-helper-call linter — the engine module-boundary CI backstop.
 *
 * The engine is N IIFE modules (acks-engine*.js); each extends `global.ACKS` via Object.assign.
 * A module-private helper (leading-underscore, NOT exported) defined in module A is in A's closure,
 * so it is reachable from A by its BARE name only — from module B it must be called `ACKS._x` /
 * `A._x` / `global.ACKS._x`. A BARE `_x(` in module B, where `_x` is a private of a DIFFERENT
 * module and not defined in B, is a latent `ReferenceError` that no test necessarily exercises
 * (the `_ruralHexes is not defined` bug class — CLAUDE §8 / `_handoffs/Deferred_Followons.md` §5;
 * the export-boundary doctrine is Architecture.md §9). This linter fails CI on exactly that shape.
 *
 * Static (no parser): for each engine module, strip comments + string/template interiors (newlines
 * preserved so line numbers stay accurate), collect its leading-underscore DEFINITIONS — declarations
 * (`function _x` / `const|let|var _x`), function params, single-arg arrow params, and destructured
 * bindings (`const { _x } = global.ACKS`) — then scan for BARE leading-underscore call sites that
 * resolve to NO local definition but ARE a private of another module. Conservative: a bare call to a
 * name defined nowhere in the engine is OUT of scope (a builtin or a separate typo class — not this
 * footgun). Suppress a false positive with `// cross-module-lint-ignore` on the offending line.
 *
 *   node tools/cross-module-lint.js     (from the repo root; or `npm run lint:engine`)
 *   exit 0 = clean · exit 1 = a bare cross-module private call
 *
 * Also exports { lintSources, definedNames, stripCommentsAndStrings } for the smoke test.
 */
const fs = require('fs');
const path = require('path');

// Strip `//` line comments, `/* */` block comments, and '..'/".."/`..` interiors, preserving every
// newline (and overall length) so line numbers stay exact. Regex literals are NOT handled — a `_x(`
// inside one is vanishingly unlikely, and over-blanking would only MISS a finding, never FALSE-flag.
function stripCommentsAndStrings(src) {
  let out = '', i = 0; const n = src.length;
  let state = 'code'; // code | line | block | sq | dq | tpl
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (state === 'code') {
      if (c === '/' && c2 === '/') { out += '  '; i += 2; state = 'line'; continue; }
      if (c === '/' && c2 === '*') { out += '  '; i += 2; state = 'block'; continue; }
      if (c === "'") { out += ' '; i++; state = 'sq'; continue; }
      if (c === '"') { out += ' '; i++; state = 'dq'; continue; }
      if (c === '`') { out += ' '; i++; state = 'tpl'; continue; }
      out += c; i++; continue;
    }
    if (state === 'line') {
      if (c === '\n') { out += '\n'; i++; state = 'code'; continue; }
      out += (c === '\t' ? '\t' : ' '); i++; continue;
    }
    if (state === 'block') {
      if (c === '*' && c2 === '/') { out += '  '; i += 2; state = 'code'; continue; }
      out += (c === '\n' ? '\n' : ' '); i++; continue;
    }
    // string / template interior: honour escapes, blank the rest, keep newlines.
    if (c === '\\') { out += '  '; i += 2; continue; }
    if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) {
      out += ' '; i++; state = 'code'; continue;
    }
    out += (c === '\n' ? '\n' : ' '); i++;
  }
  return out;
}

// Leading-underscore names DEFINED (declared, param, arrow-param, or destructured) in a module's
// (already-stripped) source. Over-collecting here is SAFE — it can only suppress a finding, never
// create a false positive — so the goal is to never miss a legitimate local binding.
function definedNames(src) {
  const set = new Set(); let m;
  const decl = /\b(?:function\s*\*?|const|let|var)\s+(_\w+)/g;                 // function _x / const _x …
  while ((m = decl.exec(src))) set.add(m[1]);
  const sig = /(?:function\s*\*?\s*\w*\s*\(([^)]*)\))|(?:\(([^)]*)\)\s*=>)/g;  // (…params…) of fn / arrow
  while ((m = sig.exec(src))) {
    for (const raw of (m[1] || m[2] || '').split(',')) {
      const pm = raw.trim().match(/^\.{0,3}\s*(_\w+)/);                        // leading token (…rest / =default ok)
      if (pm) set.add(pm[1]);
    }
  }
  const arrow1 = /(?:^|[^\w$.])(_\w+)\s*=>/g;                                  // _x => …
  while ((m = arrow1.exec(src))) set.add(m[1]);
  const destr = /\b(?:const|let|var)\s*\{([^}]*)\}\s*=/g;                      // const { _x, _y } = global.ACKS
  while ((m = destr.exec(src))) {
    for (const raw of m[1].split(',')) {
      const dm = raw.trim().match(/^(_\w+)/);
      if (dm) set.add(dm[1]);
    }
  }
  return set;
}

// Pure core: `sources` = { filename → rawContent }. Returns { findings[], privateCount, fileCount }.
// A finding = { file, line, name, owners[] }. The negative lookbehind `(?<![\w$.])` makes a match a
// STANDALONE bare identifier (not `obj._x`, not a suffix of `foo_x`). A declaration `function _x(` is
// naturally local (its name is in `defined`), so it is never flagged — only an undefined-here name
// that another module owns trips the lint.
function lintSources(sources) {
  const files = Object.keys(sources).sort();
  const stripped = {}, defined = {};
  const owners = new Map();   // _name → Set(modules that define it)
  for (const f of files) {
    const s = stripCommentsAndStrings(sources[f]);
    stripped[f] = s;
    const d = definedNames(s);
    defined[f] = d;
    for (const name of d) { if (!owners.has(name)) owners.set(name, new Set()); owners.get(name).add(f); }
  }
  const CALL = /(?<![\w$.])(_\w+)\s*\(/g;
  const findings = [];
  for (const f of files) {
    const codeLines = stripped[f].split(/\r?\n/);
    const rawLines = sources[f].split(/\r?\n/);
    for (let i = 0; i < codeLines.length; i++) {
      if (/cross-module-lint-ignore/.test(rawLines[i] || '')) continue;
      let m; CALL.lastIndex = 0;
      while ((m = CALL.exec(codeLines[i]))) {
        const name = m[1];
        if (defined[f].has(name)) continue;               // local definition / param / destructure — fine
        if (!owners.has(name)) continue;                  // defined nowhere in the engine — out of scope
        const ownerFiles = [...owners.get(name)].filter(o => o !== f);
        if (ownerFiles.length === 0) continue;            // (only self-owned — covered by the local check)
        findings.push({ file: f, line: i + 1, name, owners: ownerFiles });
      }
    }
  }
  return { findings, privateCount: owners.size, fileCount: files.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// relatedEntities[].kind registry-membership lint (audit 2026-06-24, lane D3).
//
// An event's context.relatedEntities[] entries — `{kind, id, role}` — drive the per-entity history
// index (acks-engine.js `_filterByRelatedEntity` / `entityChronicle`): an entity E's chronicle lists
// exactly the events whose relatedEntities carry E's kind+id. So a relatedEntities `kind` that ISN'T
// the form the history accessors key on makes the entity INVISIBLE in its own chronicle — a silent bug
// no test necessarily exercises (the 2026-06-24 finding: magic research tagged a crafted artifact
// `notableItem` (camelCase) while `notableItemHistory` filters `notable-item` (kebab) → the artifact
// never appeared in its chronicle). This lint fails CI on any relatedEntities kind not in the canonical
// event-context kind set, so the next camel/kebab slip (or a typo'd kind) can't ship.
//
// The canonical set = the entity-registry kinds, with a small OVERRIDE map for the few kinds whose
// event-context tag intentionally differs from the registry kind. Today there is exactly one: the
// registry kind `notableItem` is tagged `notable-item` in relatedEntities (that's the kebab form the
// history index keys on — see `notableItemHistory` + the acks-engine-sages.js emitter). The valid set
// therefore contains `notable-item` and NOT `notableItem`, so a `notableItem` tag in a relatedEntities
// slot (the bug) FAILS while `notable-item` passes.

// registry kind → event-context relatedEntities tag, for the kebab/camel divergences.
const RELATED_ENTITY_KIND_OVERRIDES = { notableItem: 'notable-item' };

// Build the canonical event-context kind set from the registry's kind list (applies the overrides).
function buildValidRelatedKinds(registryKinds) {
  return new Set((registryKinds || []).map(k => RELATED_ENTITY_KIND_OVERRIDES[k] || k));
}

// Strip `//` and `/* */` comments but KEEP string interiors (we must read the `kind` value) and every
// newline (so line numbers stay exact). Mirrors stripCommentsAndStrings, except strings pass through.
function stripCommentsKeepStrings(src) {
  let out = '', i = 0; const n = src.length;
  let state = 'code'; // code | line | block | sq | dq | tpl
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (state === 'code') {
      if (c === '/' && c2 === '/') { out += '  '; i += 2; state = 'line'; continue; }
      if (c === '/' && c2 === '*') { out += '  '; i += 2; state = 'block'; continue; }
      if (c === "'") { out += c; i++; state = 'sq'; continue; }
      if (c === '"') { out += c; i++; state = 'dq'; continue; }
      if (c === '`') { out += c; i++; state = 'tpl'; continue; }
      out += c; i++; continue;
    }
    if (state === 'line') { if (c === '\n') { out += '\n'; i++; state = 'code'; continue; } out += ' '; i++; continue; }
    if (state === 'block') { if (c === '*' && c2 === '/') { out += '  '; i += 2; state = 'code'; continue; } out += (c === '\n' ? '\n' : ' '); i++; continue; }
    // string / template interior: keep it verbatim (incl. quotes + value) until the closing quote.
    if (c === '\\') { out += c + (c2 || ''); i += 2; continue; }
    if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) { out += c; i++; state = 'code'; continue; }
    out += c; i++;
  }
  return out;
}

// Pure core: `sources` = { filename → rawContent }, `validKinds` = Set of canonical event-context kinds.
// A relatedEntities entry is an inline `{…}` literal (no nested braces) carrying a STRING `kind:'X'`
// plus an `id:` and a `role:` key — the {kind,id,role} signature distinguishes it from a registry
// definition ({kind,label,…}, no id:/role:) and a stationing pointer ({kind,id}, no role:). A finding =
// { file, line, kind }. Suppress one with `// cross-module-lint-ignore` on its line.
function lintRelatedEntityKinds(sources, validKinds) {
  const files = Object.keys(sources).sort();
  const SPAN = /\{[^{}]*\}/g;
  const KIND = /\bkind:\s*'([^']+)'/;
  const findings = [];
  let entryCount = 0;
  for (const f of files) {
    const stripped = stripCommentsKeepStrings(sources[f]);
    const rawLines = sources[f].split(/\r?\n/);
    let m; SPAN.lastIndex = 0;
    while ((m = SPAN.exec(stripped))) {
      const span = m[0];
      if (!/\brole:/.test(span) || !/\bid:/.test(span)) continue;   // not a relatedEntities entry
      const km = span.match(KIND);
      if (!km) continue;                                            // computed kind — out of scope
      entryCount++;
      const kind = km[1];
      if (validKinds.has(kind)) continue;
      const line = stripped.slice(0, m.index).split('\n').length;
      if (/cross-module-lint-ignore/.test(rawLines[line - 1] || '')) continue;
      findings.push({ file: f, line, kind });
    }
  }
  return { findings, entryCount };
}

module.exports = { lintSources, definedNames, stripCommentsAndStrings,
  lintRelatedEntityKinds, stripCommentsKeepStrings, buildValidRelatedKinds, RELATED_ENTITY_KIND_OVERRIDES };

// CLI: lint the real engine modules from the repo root.
if (require.main === module) {
  const REPO = path.resolve(__dirname, '..');
  const FILES = fs.readdirSync(REPO).filter(f => /^acks-engine.*\.js$/.test(f)).sort();   // the tests/_engine.js glob
  const sources = {};
  for (const f of FILES) sources[f] = fs.readFileSync(path.join(REPO, f), 'utf8');
  // (1) the bare cross-module private-call lint.
  const { findings, privateCount, fileCount } = lintSources(sources);
  for (const x of findings) {
    console.log(`CROSS-MODULE ${x.file}:${x.line}  bare \`${x.name}(\` — \`${x.name}\` is a module-private of ${x.owners.join(', ')}; call it as \`ACKS.${x.name}\` (it is not in this module's scope)`);
  }
  console.log(`cross-module-lint: scanned ${fileCount} engine module(s) · ${privateCount} leading-underscore private name(s) · ${findings.length} bare cross-module call(s).`);

  // (2) the relatedEntities[].kind registry-membership lint. The canonical kind set comes from the
  // RUNTIME entity registry (so self-registered kinds like `dynasty` are included), built via the
  // same loader the tests use.
  const ACKS = require('../tests/_engine.js').load();
  const registryKinds = (typeof ACKS.entityKinds === 'function' ? ACKS.entityKinds() : []).map(k => k.kind);
  const validKinds = buildValidRelatedKinds(registryKinds);
  const rel = lintRelatedEntityKinds(sources, validKinds);
  for (const x of rel.findings) {
    const fix = RELATED_ENTITY_KIND_OVERRIDES[x.kind] || (validKinds.has(x.kind) ? null : 'a registered entity kind');
    console.log(`RELATED-ENTITY-KIND ${x.file}:${x.line}  relatedEntities kind '${x.kind}' is not a canonical event-context kind — the entity will be invisible in its own chronicle. Use ${fix ? "'" + fix + "'" : 'a registered entity kind'} (registry kinds${Object.keys(RELATED_ENTITY_KIND_OVERRIDES).length ? ', with the documented override(s): ' + JSON.stringify(RELATED_ENTITY_KIND_OVERRIDES) : ''}).`);
  }
  console.log(`related-entity-kind-lint: ${rel.entryCount} relatedEntities entr(y/ies) · ${registryKinds.length} registry kind(s) · ${rel.findings.length} invalid kind(s).`);

  const total = findings.length + rel.findings.length;
  console.log(total === 0 ? 'PASS.' : "FAIL — see findings above (latent ReferenceError and/or a relatedEntities kind that won't chronicle).");
  process.exit(total === 0 ? 0 : 1);
}
