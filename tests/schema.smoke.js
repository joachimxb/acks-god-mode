'use strict';
/* tests/schema.smoke.js — the data-layer contract (T7, audit 2026-06-14).
 *
 * Guards three things the integration pillar rests on:
 *   1. ENGINE_VERSION matches package.json (the version-detect signal can't silently drift).
 *   2. stampCampaignForSave is a pure save-time stamp that does NOT break the migrate-no-op invariant.
 *   3. The generated JSON Schema (schema/acks-campaign.schema.json) is up to date, valid JSON, and a
 *      shipped template validates against it — using a tiny hand-rolled structural validator (the
 *      project is zero-runtime-dep; we do not pull a JSON-Schema library, only a structural check of
 *      the subset of draft 2020-12 the generator emits: $ref / const / enum / type / items /
 *      properties / required).
 *
 * Run: node tests/schema.smoke.js   (or via npm test).
 */
const fs = require('fs');
const path = require('path');
const { load } = require('./_engine.js');
const ACKS = load();

const REPO = path.join(__dirname, '..');
const SCHEMA_FILE = path.join(REPO, 'schema', 'acks-campaign.schema.json');
const GEN = require(path.join(REPO, 'scripts', 'build-schema.js'));

let passed = 0, failed = 0;
function ok(label, cond, extra) {
  if (cond) { passed++; }
  else { failed++; console.error('  FAIL: ' + label + (extra ? ' — ' + extra : '')); }
}
function section(s) { console.log('\n# ' + s); }

// ── 1. engineVersion ──────────────────────────────────────────────────────────────────────────────
section('ENGINE_VERSION + the generation field');
const pkg = JSON.parse(fs.readFileSync(path.join(REPO, 'package.json'), 'utf8'));
ok('ACKS.ENGINE_VERSION is a non-empty string', typeof ACKS.ENGINE_VERSION === 'string' && ACKS.ENGINE_VERSION.length > 0);
ok('ACKS.ENGINE_VERSION === package.json version (bump both on release)', ACKS.ENGINE_VERSION === pkg.version,
  'engine=' + ACKS.ENGINE_VERSION + ' pkg=' + pkg.version);

// ── 2. stampCampaignForSave ─────────────────────────────────────────────────────────────────────
section('stampCampaignForSave — pure, stamps the generation tag, no migrate-no-op breakage');
const camp = ACKS.blankCampaign({ name: 'Stamp Test' });
camp.domains.push(ACKS.blankDomain({ name: 'D1' }));
const before = JSON.stringify(camp);
const saved = ACKS.stampCampaignForSave(camp);
ok('is pure — does not mutate the input campaign', JSON.stringify(camp) === before);
ok('stamps engineVersion = ENGINE_VERSION', saved.engineVersion === ACKS.ENGINE_VERSION);
ok('stamps savedAt + lastModifiedAt (ISO date)', /^\d{4}-\d{2}-\d{2}$/.test(saved.savedAt) && saved.lastModifiedAt === saved.savedAt);
ok('stamps lastModifiedAt on each domain', saved.domains.every(d => d.lastModifiedAt === saved.savedAt));
ok('honors opts.savedAt', ACKS.stampCampaignForSave(camp, { savedAt: '2026-01-01' }).savedAt === '2026-01-01');
// The load-time path (migrateCampaign) must NOT stamp engineVersion — else every template gains it and
// migrations.smoke P3.6 (on-disk template === migrate(template)) breaks. Re-assert it here too.
const tpl = JSON.parse(fs.readFileSync(path.join(REPO, 'Templates', 'v2-frontier-barony.acks.json'), 'utf8'));
const migrated = ACKS.migrateCampaign(tpl);
ok('migrateCampaign does NOT inject engineVersion (no-op invariant intact)', !('engineVersion' in migrated));
ok('a stamped campaign round-trips through migrate keeping engineVersion', (() => {
  const s = ACKS.stampCampaignForSave(ACKS.blankCampaign({ name: 'RT' }));
  const m = ACKS.migrateCampaign(JSON.parse(JSON.stringify(s)));
  return m.engineVersion === ACKS.ENGINE_VERSION;
})());

// ── 3. the generator + the committed schema ─────────────────────────────────────────────────────
section('JSON Schema generator + the committed schema/acks-campaign.schema.json');
let genText = null, genObj = null;
try { genText = GEN.serialize(GEN.buildSchema()); genObj = JSON.parse(genText); ok('generator runs and emits valid JSON', true); }
catch (e) { ok('generator runs and emits valid JSON', false, e.message); }

let committedText = null, committed = null;
try { committedText = fs.readFileSync(SCHEMA_FILE, 'utf8'); committed = JSON.parse(committedText); ok('committed schema file exists and is valid JSON', true); }
catch (e) { ok('committed schema file exists and is valid JSON', false, e.message); }

// EOL-insensitive: core.autocrlf=true checks the file out as CRLF while serialize() emits LF.
ok('committed schema is up to date (run `node scripts/build-schema.js` if this fails)', genText != null && GEN.isUpToDate(committedText, genText));

if (committed) {
  ok('declares JSON Schema 2020-12', committed.$schema === 'https://json-schema.org/draft/2020-12/schema');
  ok('root pins schemaVersion to the engine constant', committed.properties && committed.properties.schemaVersion && committed.properties.schemaVersion.const === ACKS.SCHEMA_VERSION);
  ok('root documents engineVersion', committed.properties && committed.properties.engineVersion && committed.properties.engineVersion.type === 'string');
  ok('required discriminators present', JSON.stringify((committed.required || []).slice().sort()) === JSON.stringify(['id', 'kind', 'name', 'schemaVersion']));
  ok('a $def per registered entity kind', ACKS.ENTITY_KINDS_LIST.every(k => committed.$defs && committed.$defs[k.kind]));
  ok('eventLog wrapper documents the kind-at-.event trap', committed.$defs.eventLogEntry &&
    committed.$defs.eventLogEntry.properties.event.required.indexOf('kind') >= 0 &&
    Array.isArray(committed.$defs.eventLogEntry.properties.event.properties.kind.enum) &&
    committed.$defs.eventLogEntry.properties.event.properties.kind.enum.length === ACKS.EVENT_KINDS.length);
  ok('characters collection refs the character $def', committed.properties.characters &&
    committed.properties.characters.items && committed.properties.characters.items.$ref === '#/$defs/character');
}

// ── 4. structural validation of shipped data ─────────────────────────────────────────────────────
// A minimal structural validator for the subset of draft 2020-12 this generator emits.
function validate(schema, value, root, pathStr, errors) {
  if (!schema || typeof schema !== 'object') return;
  if (schema.$ref) {
    const def = resolveRef(schema.$ref, root);
    if (def) validate(def, value, root, pathStr, errors);
    return;
  }
  if (Object.prototype.hasOwnProperty.call(schema, 'const')) {
    if (value !== schema.const) errors.push(pathStr + ': expected const ' + JSON.stringify(schema.const) + ', got ' + JSON.stringify(value));
    return;
  }
  if (Array.isArray(schema.enum)) {
    if (schema.enum.indexOf(value) < 0) errors.push(pathStr + ': ' + JSON.stringify(value) + ' not in enum');
    return;
  }
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!matchesType(types, value)) { errors.push(pathStr + ': type ' + JSON.stringify(schema.type) + ' but got ' + jsType(value)); return; }
  }
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    if (Array.isArray(schema.required)) for (const r of schema.required) if (!(r in value)) errors.push(pathStr + ': missing required "' + r + '"');
    if (schema.properties) for (const k of Object.keys(value)) if (schema.properties[k]) validate(schema.properties[k], value[k], root, pathStr + '.' + k, errors);
  }
  if (Array.isArray(value) && schema.items) value.forEach((el, i) => validate(schema.items, el, root, pathStr + '[' + i + ']', errors));
}
function resolveRef(ref, root) {
  const parts = ref.replace(/^#\//, '').split('/');
  let cur = root;
  for (const p of parts) { if (cur == null) return null; cur = cur[p]; }
  return cur;
}
function jsType(v) { return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v; }
function matchesType(types, v) {
  return types.some(t =>
    t === 'null' ? v === null :
    t === 'array' ? Array.isArray(v) :
    t === 'object' ? (v && typeof v === 'object' && !Array.isArray(v)) :
    t === 'integer' ? (typeof v === 'number' && Number.isInteger(v)) :
    typeof v === t);
}

section('a shipped template validates against the committed schema');
for (const tplName of ['v2-established-march.acks.json', 'v2-petty-kingdom.acks.json']) {
  const data = JSON.parse(fs.readFileSync(path.join(REPO, 'Templates', tplName), 'utf8'));
  const errors = [];
  if (committed) validate(committed, data, committed, tplName, errors);
  ok(tplName + ' has no schema violations', errors.length === 0, errors.slice(0, 6).join(' | '));
}

// A stamped, freshly-saved campaign (the path a Node consumer writes) must validate WITH engineVersion.
section('a stamped/saved campaign validates (the consumer write path)');
const savedFull = ACKS.stampCampaignForSave((() => {
  const c = ACKS.blankCampaign({ name: 'Saved' });
  c.domains.push(ACKS.blankDomain({ name: 'Keep' }));
  c.characters.push(ACKS.blankCharacter ? ACKS.blankCharacter({ name: 'Aelric' }) : { id: 'chr-x', kind: 'character' });
  return c;
})());
{
  const errors = [];
  if (committed) validate(committed, savedFull, committed, 'saved', errors);
  ok('a stampCampaignForSave() output validates (engineVersion accepted)', errors.length === 0, errors.slice(0, 6).join(' | '));
}

// A deliberately-broken campaign must FAIL (the validator actually bites).
section('the validator rejects an invalid campaign (negative control)');
{
  const bad = ACKS.blankCampaign({ name: 'Bad' });
  bad.schemaVersion = 999;          // violates const
  delete bad.id;                    // violates required
  bad.eventLog = [{ event: { kind: 'not-a-real-kind' } }]; // violates event.kind enum
  const errors = [];
  validate(committed, bad, committed, 'bad', errors);
  ok('flags the bad schemaVersion / missing id / unknown event kind', errors.length >= 3, errors.slice(0, 6).join(' | '));
}

console.log('\n=============================================');
console.log('schema.smoke.js — Passed: ' + passed + ', Failed: ' + failed);
console.log('=============================================');
process.exit(failed ? 1 : 0);
