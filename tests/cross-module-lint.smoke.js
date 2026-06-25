/* tests/cross-module-lint.smoke.js — the cross-module bare-helper-call linter (tools/cross-module-lint.js).
 *
 *   node tests/cross-module-lint.smoke.js   (or via `npm test`)
 *
 * The engine is N IIFE modules; a leading-underscore private of module A is reachable from module B
 * only as `ACKS._x` — a BARE `_x(` in B is a latent ReferenceError (the `_ruralHexes` bug class,
 * Deferred_Followons §5 / Architecture §9). This proves the linter (a) CATCHES that shape and (b)
 * does NOT false-flag the legitimate shapes (same-module / qualified / param / destructure / unknown
 * / comment / string / ignore), and (c) the REAL engine is clean — the live regression guard.
 */
'use strict';
const path = require('path');
const fs = require('fs');
const { lintSources, definedNames, stripCommentsAndStrings,
  lintRelatedEntityKinds, stripCommentsKeepStrings, buildValidRelatedKinds } = require('../tools/cross-module-lint.js');

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail) { if (cond) { pass++; } else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t) { console.log('\n— ' + t); }

// =============================================================================
section('stripCommentsAndStrings — blanks comments/strings, preserves newlines');
ok('line comment blanked', !/_secret/.test(stripCommentsAndStrings('a(); // _secret()')));
ok('block comment blanked', !/_secret/.test(stripCommentsAndStrings('/* _secret() */ a();')));
ok('string interior blanked', !/_secret/.test(stripCommentsAndStrings('x = "_secret()";')));
ok('template interior blanked', !/_secret/.test(stripCommentsAndStrings('x = `_secret()`;')));
ok('escaped quote inside a string does not end it', !/_secret/.test(stripCommentsAndStrings('x = "a\\"_secret()";')));
ok('preserves line count', stripCommentsAndStrings('a\n/* x\ny */\nb').split('\n').length === 4);
ok('preserves real code outside comments', /foo\(\)/.test(stripCommentsAndStrings('foo(); // bar')));

// =============================================================================
section('definedNames — collects every local binding shape');
ok('function decl', definedNames('function _x(){}').has('_x'));
ok('const decl', definedNames('const _y = 1;').has('_y'));
ok('function param', definedNames('function f(a, _p){}').has('_p'));
ok('arrow param (parens)', definedNames('const f = (_q) => _q;').has('_q'));
ok('arrow param (bare)', definedNames('const f = _r => _r;').has('_r'));
ok('rest param', definedNames('function f(..._rest){}').has('_rest'));
ok('destructure binding', definedNames('const { _z, other } = global.ACKS;').has('_z'));

// The bug fixture: module A defines a private; module B calls it BARE.
const SRC_A = "function _ruralHexes(d){ return d.hexes; }\nObject.assign(global.ACKS, { foo: 1 });";
function moduleB(body) {
  return "const A = global.ACKS;\nfunction applyEvent_gmFiat(c){\n" + body + "\n}\nObject.assign(global.ACKS, { applyEvent_gmFiat });";
}

// =============================================================================
section('lintSources — CATCHES the bare cross-module private call (the _ruralHexes bug)');
{
  const r = lintSources({ 'acks-engine-a.js': SRC_A, 'acks-engine-b.js': moduleB('  return _ruralHexes(c);') });
  ok('flags exactly the one bare cross-module call', r.findings.length === 1, JSON.stringify(r.findings));
  const f = r.findings[0] || {};
  ok('names the offending module + private', f.file === 'acks-engine-b.js' && f.name === '_ruralHexes');
  ok('names the owning module', (f.owners || []).includes('acks-engine-a.js'));
}

// =============================================================================
section('lintSources — the legitimate shapes are NOT flagged');
ok('same-module bare private is fine', lintSources({ 'acks-engine-a.js': SRC_A + "\nfunction g(){ return _ruralHexes({ hexes: [] }); }" }).findings.length === 0);
ok('qualified A._x call is fine', lintSources({ 'acks-engine-a.js': SRC_A, 'acks-engine-b.js': moduleB('  return A._ruralHexes(c);') }).findings.length === 0);
ok('qualified global.ACKS._x call is fine', lintSources({ 'acks-engine-a.js': SRC_A, 'acks-engine-b.js': moduleB('  return global.ACKS._ruralHexes(c);') }).findings.length === 0);
ok('a local param shadow is fine', lintSources({ 'acks-engine-a.js': SRC_A, 'acks-engine-b.js': "function f(_ruralHexes){ return _ruralHexes(); }" }).findings.length === 0);
ok('a local destructure is fine', lintSources({ 'acks-engine-a.js': SRC_A, 'acks-engine-b.js': moduleB('  const { _ruralHexes } = A; return _ruralHexes(c);') }).findings.length === 0);
ok('a name defined nowhere is out of scope (not flagged)', lintSources({ 'acks-engine-b.js': moduleB('  return _neverDefinedAnywhere(c);') }).findings.length === 0);
ok('a property access (this._x) is not a bare call', lintSources({ 'acks-engine-a.js': SRC_A, 'acks-engine-b.js': moduleB('  return this._ruralHexes(c);') }).findings.length === 0);
ok('a call inside a // comment is stripped', lintSources({ 'acks-engine-a.js': SRC_A, 'acks-engine-b.js': moduleB('  // _ruralHexes(c) — a note\n  return 1;') }).findings.length === 0);
ok('a call inside a string is stripped', lintSources({ 'acks-engine-a.js': SRC_A, 'acks-engine-b.js': moduleB('  return "_ruralHexes(c)";') }).findings.length === 0);
ok('the // cross-module-lint-ignore comment suppresses', lintSources({ 'acks-engine-a.js': SRC_A, 'acks-engine-b.js': moduleB('  return _ruralHexes(c); // cross-module-lint-ignore') }).findings.length === 0);
ok('a private owned only by THIS module is fine (no cross-module owner)', lintSources({ 'acks-engine-b.js': "function _only(){} function g(){ return _only(); }" }).findings.length === 0);

// =============================================================================
section('lintSources — line number accuracy across a multi-line comment');
{
  const b = moduleB("  /* a\n     multi\n     line */\n  return _ruralHexes(c);");
  const expectedLine = b.split('\n').findIndex(l => /return _ruralHexes/.test(l)) + 1;
  const r = lintSources({ 'acks-engine-a.js': SRC_A, 'acks-engine-b.js': b });
  ok('finding line points at the real call line (not the comment)', r.findings.length === 1 && r.findings[0].line === expectedLine, JSON.stringify({ got: r.findings, expectedLine }));
}

// =============================================================================
section('integration — the REAL engine is clean (the live regression guard)');
{
  const REPO = path.join(__dirname, '..');
  const files = fs.readdirSync(REPO).filter(f => /^acks-engine.*\.js$/.test(f));
  const sources = {};
  for (const f of files) sources[f] = fs.readFileSync(path.join(REPO, f), 'utf8');
  const r = lintSources(sources);
  ok('38+ engine modules scanned', r.fileCount >= 38, 'scanned ' + r.fileCount);
  ok('the engine has many module-private names (>100)', r.privateCount > 100, 'privates ' + r.privateCount);
  ok('ZERO bare cross-module private calls in the engine', r.findings.length === 0,
    r.findings.slice(0, 5).map(x => x.file + ':' + x.line + ' ' + x.name).join(' · '));
}

// =============================================================================
section('stripCommentsKeepStrings — blanks comments but KEEPS string values');
ok('keeps a string interior (needed to read the kind value)', /notableItem/.test(stripCommentsKeepStrings("x = 'notableItem';")));
ok('blanks a line comment', !/_secret/.test(stripCommentsKeepStrings('a(); // _secret')));
ok('blanks a block comment', !/_secret/.test(stripCommentsKeepStrings('/* _secret */ a();')));
ok('preserves line count', stripCommentsKeepStrings('a\n/* x\ny */\nb').split('\n').length === 4);

// =============================================================================
section('buildValidRelatedKinds — registry kinds + the notableItem→notable-item override');
{
  const v = buildValidRelatedKinds(['character', 'domain', 'notableItem']);
  ok('passes the kebab event-context tag notable-item', v.has('notable-item'));
  ok('the camel registry kind notableItem is NOT a valid relatedEntities tag', !v.has('notableItem'));
  ok('a plain kind passes through unchanged', v.has('character') && v.has('domain'));
}

// =============================================================================
section('lintRelatedEntityKinds — catches a relatedEntities kind that will not chronicle');
{
  const valid = buildValidRelatedKinds(['character', 'notableItem', 'domain']);
  const camel = { 'acks-engine-x.js': "e = { relatedEntities: [{ kind: 'notableItem', id: it.id, role: 'produced' }] };" };
  const r = lintRelatedEntityKinds(camel, valid);
  ok('flags the camelCase notableItem slip (the 2026-06-24 bug)', r.findings.length === 1 && r.findings[0].kind === 'notableItem');
  ok('reports the right file', (r.findings[0] || {}).file === 'acks-engine-x.js');

  ok('the kebab notable-item is NOT flagged',
    lintRelatedEntityKinds({ 'a.js': "e = [{ kind:'notable-item', id: x, role:'produced' }];" }, valid).findings.length === 0);
  ok('a typo / bogus kind is flagged',
    lintRelatedEntityKinds({ 'a.js': "e = [{ kind:'widget', id: x, role:'t' }];" }, valid).findings.length === 1);

  // shape discrimination — only {kind,id,role} entries are scanned.
  ok('a registry definition {kind,label,…} (no id:/role:) is NOT scanned',
    lintRelatedEntityKinds({ 'a.js': "{ kind: 'widget', label: 'Widget', icon: 'x' }" }, valid).findings.length === 0);
  ok('a stationing pointer {kind,id} (no role:) is NOT scanned',
    lintRelatedEntityKinds({ 'a.js': "stationedAt: { kind: 'domain-garrison', id: d.id }" }, valid).findings.length === 0);
  ok('a kind inside a // comment is not scanned',
    lintRelatedEntityKinds({ 'a.js': "// { kind:'widget', id:x, role:'t' }\ncode();" }, valid).findings.length === 0);
  ok('the // cross-module-lint-ignore comment suppresses',
    lintRelatedEntityKinds({ 'a.js': "e = [{ kind:'widget', id:x, role:'t' }]; // cross-module-lint-ignore" }, valid).findings.length === 0);
  ok('a computed (non-literal) kind is out of scope',
    lintRelatedEntityKinds({ 'a.js': "e = [{ kind: someVar, id:x, role:'t' }];" }, valid).findings.length === 0);
}

// =============================================================================
section('integration — the REAL engine has ZERO unchronicleable relatedEntities kinds (live guard)');
{
  const REPO = path.join(__dirname, '..');
  const ACKS = require('./_engine.js').load();
  const registryKinds = ACKS.entityKinds().map(k => k.kind);
  const validKinds = buildValidRelatedKinds(registryKinds);
  const files = fs.readdirSync(REPO).filter(f => /^acks-engine.*\.js$/.test(f));
  const sources = {};
  for (const f of files) sources[f] = fs.readFileSync(path.join(REPO, f), 'utf8');
  const r = lintRelatedEntityKinds(sources, validKinds);
  ok('the engine has many relatedEntities entries (>100)', r.entryCount > 100, 'entries ' + r.entryCount);
  ok('ZERO relatedEntities kinds outside the canonical set', r.findings.length === 0,
    r.findings.slice(0, 5).map(x => x.file + ':' + x.line + " '" + x.kind + "'").join(' · '));
}

// =============================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — cross-module-lint.smoke.js: ' + pass + ' passed, ' + fail + ' failed.');
if (fail) { console.log('  failing: ' + failures.join(' · ')); process.exit(1); }
