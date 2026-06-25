#!/usr/bin/env node
'use strict';
/*
 * scripts/build-schema.js — generate the JSON Schema for a .acks.json campaign file.
 *
 * The schema is DERIVED from the engine's own introspectable metadata, so it can't drift from the
 * code: the Entity Registry (ENTITY_KINDS_LIST) gives every entity kind and the top-level collection
 * it lives in; the Field Schema layer (FIELD_SCHEMAS) gives per-field types for the kinds that have a
 * schema; the event vocabulary (EVENT_KINDS / EVENT_SCHEMAS) gives the typed event log shape. Run this
 * after any change to those and commit the result.
 *
 *   node scripts/build-schema.js            write schema/acks-campaign.schema.json
 *   node scripts/build-schema.js --check     exit 1 if the committed file is stale (CI / pre-release)
 *   node scripts/build-schema.js --stdout    print to stdout, write nothing
 *
 * Scope + posture: this is a STRUCTURAL contract for a third-party consumer (INTEGRATION.md), not a
 * pedantic exhaustive validator. It is deliberately LENIENT — objects allow extra properties and only
 * the `id` discriminator + a handful of root fields are required — so it never rejects a valid save the
 * schema doesn't fully model (the engine evolves additively under one schemaVersion). It is precise
 * where the engine is precise: collection→kind wiring, the ID-prefix-tagged id strings, the field
 * types FIELD_SCHEMAS declares, the event `kind` enum, and the eventLog WRAPPER shape (`event.kind`,
 * not `kind` — the integration trap).
 *
 * Draft: JSON Schema 2020-12. No runtime deps.
 */
const fs = require('fs');
const path = require('path');

const REPO = path.join(__dirname, '..');
const OUT_DIR = path.join(REPO, 'schema');
const OUT_FILE = path.join(OUT_DIR, 'acks-campaign.schema.json');

const ACKS = require(path.join(REPO, 'tests', '_engine.js')).load();

// ── FIELD_SCHEMAS field-type → JSON Schema fragment ──────────────────────────────────────────────
// The 15 locked field types (acks-engine-field-schemas.js §1). Lenient by design: enums become an
// enum constraint; ids become prefix-tagged strings; arrays/objects recurse via itemSchema/fields;
// computed/history are read-only shapes. Anything unmodelled falls through to a permissive {}.
function fieldFragment(field) {
  switch (field.type) {
    case 'string':   return { type: ['string', 'null'] };
    case 'longText': return { type: ['string', 'null'] };
    case 'number':   return { type: ['number', 'null'] };
    case 'gp':       return { type: ['number', 'null'], description: 'gp amount' };
    case 'boolean':  return { type: ['boolean', 'null'] };
    case 'date':     return { type: ['string', 'object', 'null'], description: 'calendar date {year,month,day} or ISO string' };
    case 'enum':
      return Array.isArray(field.enumValues) && field.enumValues.length
        ? { enum: field.enumValues.concat([null]) }
        : { type: ['string', 'null'] };
    case 'enumMulti':
      return {
        type: 'array',
        items: Array.isArray(field.enumValues) && field.enumValues.length ? { enum: field.enumValues } : {}
      };
    case 'id':       return idStringFragment(field.idKind);
    case 'idArray':  return { type: 'array', items: idStringFragment(field.idKind) };
    case 'coord':    return { type: ['object', 'null'], description: 'hex coordinate', properties: { q: { type: 'number' }, r: { type: 'number' } } };
    case 'array': {
      const items = field.itemSchema && Array.isArray(field.itemSchema.fields)
        ? objectFromFields(field.itemSchema.fields)
        : {};
      return { type: 'array', items };
    }
    case 'object': {
      // Nullable nested record (factories default these to null — e.g. unit.trainingState). Build the
      // object body, then widen its `type` to allow null (assign order must NOT let the body's
      // type:'object' clobber the nullability).
      if (!Array.isArray(field.fields)) return { type: ['object', 'null'] };
      const body = objectFromFields(field.fields);
      body.type = ['object', 'null'];
      delete body.required; // a null nested record has no required keys
      return body;
    }
    case 'computed': return { description: 'derived / read-only (not authored)' };
    case 'history':  return { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'append-only event/log entries' };
    default:         return {}; // unknown — permissive
  }
}

// An id reference. Tag it with the kind's registered ID prefix when we can resolve one, as a pattern.
function idStringFragment(idKind) {
  const prefix = idKind && ACKS.ID_PREFIXES ? ACKS.ID_PREFIXES[idKind] : null;
  const frag = { type: ['string', 'null'] };
  if (prefix) {
    // e.g. "chr-..." — a soft hint (templates use readable slugs like chr-marquis-aelric, runtime
    // ids are base36, both share the prefix). Documented, not enforced hard (description, not pattern,
    // so a slug like chr-marquis-aelric never trips it).
    frag.description = (idKind ? idKind + ' id' : 'entity id') + ' — prefix "' + prefix + '-"';
  }
  return frag;
}

// Build an object schema body ({properties, required?}) from a FIELD_SCHEMAS fields[] array.
function objectFromFields(fields) {
  const properties = {};
  const required = [];
  for (const f of fields) {
    if (!f || !f.name) continue;
    properties[f.name] = fieldFragment(f);
    // Only `id` is required across the board — FIELD_SCHEMAS marks domain-specific `required`, but a
    // valid persisted entity may legitimately omit a "required-to-create" field once edited, so we
    // keep the schema lenient and require only the stable discriminator.
    if (f.name === 'id') required.push('id');
  }
  const body = { type: 'object', additionalProperties: true, properties };
  if (required.length) body.required = required;
  return body;
}

// ── Discover the top-level collection key for each entity kind ────────────────────────────────────
// The registry's list closures are `(c) => (c && c.someKey) || []`. Probe each with a campaign that
// has a uniquely-tagged array on each candidate key and see which the closure returns — robust against
// the closures' exact text. Candidate keys = blankCampaign's array fields + the read-defensively
// collections that aren't in blankCampaign (units/armies/encounters/… are lazy or defensive).
function discoverCollections() {
  const blank = ACKS.blankCampaign();
  const candidates = new Set(Object.keys(blank).filter(k => Array.isArray(blank[k])));
  ['units', 'armies', 'encounters', 'battles', 'sieges', 'vessels', 'delves',
   'senates', 'factions', 'senatorships', 'hijinks', 'syndicates', 'lairs',
   'favorDutyObligations'].forEach(k => candidates.add(k));
  const byKind = {};          // kind -> collectionKey
  const nestedKinds = [];     // sub-entities with no top-level collection
  const SENTINEL = '__ACKS_SCHEMA_PROBE__';
  for (const entry of ACKS.ENTITY_KINDS_LIST) {
    let found = null;
    for (const key of candidates) {
      const probe = {}; probe[key] = [SENTINEL];
      try { const r = entry.list(probe); if (Array.isArray(r) && r[0] === SENTINEL) { found = key; break; } } catch (e) { /* skip */ }
    }
    if (found) byKind[entry.kind] = found; else nestedKinds.push(entry.kind);
  }
  return { byKind, nestedKinds, blank, candidates };
}

// ── Build the schema ─────────────────────────────────────────────────────────────────────────────
function buildSchema() {
  const { byKind, nestedKinds, blank, candidates } = discoverCollections();
  const schemaKinds = new Set(ACKS.kindsWithSchema());
  const $defs = {};

  // A $def per entity kind. Typed when FIELD_SCHEMAS has it; a generic id-bearing object otherwise.
  for (const entry of ACKS.ENTITY_KINDS_LIST) {
    const kind = entry.kind;
    if (schemaKinds.has(kind)) {
      const schema = ACKS.fieldSchemaFor(kind);
      $defs[kind] = Object.assign(
        { title: entry.label || kind, description: '"' + kind + '" entity' },
        objectFromFields(schema.fields || [])
      );
    } else {
      $defs[kind] = {
        title: entry.label || kind,
        description: '"' + kind + '" entity (no field schema yet — id-bearing object, fields open)',
        type: 'object',
        additionalProperties: true,
        properties: { id: { type: 'string' } },
        required: ['id']
      };
    }
  }

  // The eventLog WRAPPER (the integration trap). An entry is {event:{kind,payload,…}, result, …};
  // the typed kind lives at entry.event.kind, NOT entry.kind. Enumerate the kinds; keep payload open.
  $defs.eventLogEntry = {
    title: 'Event log entry (wrapper)',
    description: 'WRAPPER: the typed event is at .event (so the kind is entry.event.kind, NOT entry.kind). ' +
      'result holds the applied outcome. See INTEGRATION.md "The typed event log".',
    type: 'object',
    additionalProperties: true,
    required: ['event'],
    properties: {
      event: {
        type: 'object',
        additionalProperties: true,
        required: ['kind'],
        properties: {
          kind:    { enum: ACKS.EVENT_KINDS.slice() },
          id:      { type: 'string' },
          payload: { type: 'object', additionalProperties: true },
          status:  { type: 'string' },
          targetTurn:   { type: ['number', 'null'] },
          appliedAtTurn: { type: ['number', 'null'] },
          appliedAtDay:  { type: ['number', 'null'] },
          gameTimeAt:    { type: ['object', 'null'] },
          parentEventId: { type: ['string', 'null'] },
          cadence:  { type: ['string', 'null'] },
          context:  { type: ['object', 'null'] },
          subdayContext: { type: ['object', 'null'] }
        }
      },
      result:       { type: 'object', additionalProperties: true },
      appliedAtTurn: { type: ['number', 'null'] },
      appliedAtDay:  { type: ['number', 'null'] },
      appliedAt:     { type: ['string', 'null'] }
    }
  };

  // The root campaign object. Required: the discriminators a consumer relies on. Every top-level
  // collection becomes an array of its kind's $def (eventLog → the wrapper; unmapped reserved arrays
  // → open arrays). engineVersion is the SAVE-time generation tag (absent on shipped templates).
  const rootProps = {
    schemaVersion: { const: ACKS.SCHEMA_VERSION, description: 'Breaking save-format version (clean break at 2)' },
    engineVersion: { type: 'string', description: 'Engine release that SAVED the file (ACKS.ENGINE_VERSION). Absent ⇒ written before engineVersion (≤ v0.24); feature-detect, do not assume.' },
    kind: { const: 'campaign' },
    id:   { type: 'string', description: 'campaign id — prefix "' + (ACKS.ID_PREFIXES.campaign) + '-"' },
    name: { type: 'string' },
    currentTurn: { type: 'number' },
    currentDayInMonth: { type: 'number' },
    houseRules: { type: 'object', additionalProperties: true, description: 'kebab-case rule key → { enabled: bool } (absent ⇒ the registry default)' },
    eventLog: { type: 'array', items: { $ref: '#/$defs/eventLogEntry' } }
  };

  // collectionKey → the kind whose $def it holds (invert byKind; first kind wins per key).
  const keyToKind = {};
  for (const [kind, key] of Object.entries(byKind)) { if (!keyToKind[key]) keyToKind[key] = kind; }

  // Every array collection on a blank campaign + the discovered/extra collections.
  const allCollectionKeys = new Set(Object.keys(blank).filter(k => Array.isArray(blank[k])));
  for (const k of candidates) allCollectionKeys.add(k);
  for (const key of [...allCollectionKeys].sort()) {
    if (key === 'eventLog') continue; // already the wrapper above
    const kind = keyToKind[key];
    rootProps[key] = kind
      ? { type: 'array', items: { $ref: '#/$defs/' + kind } }
      : { type: 'array', items: { type: 'object', additionalProperties: true }, description: 'reserved / un-typed collection' };
  }

  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://joachimxb.github.io/acks-god-mode/schema/acks-campaign.schema.json',
    title: 'ACKS God Mode — campaign (.acks.json)',
    description:
      'Structural schema for an ACKS God Mode campaign file, GENERATED from the engine metadata ' +
      '(scripts/build-schema.js). Lenient by design (objects allow extra properties; only id-class ' +
      'discriminators are required) so it accepts any valid save the engine writes. See INTEGRATION.md ' +
      'for the consumer contract, the canonical-home rule, and the eventLog wrapper trap. ' +
      'schemaVersion ' + ACKS.SCHEMA_VERSION + ' · generated against engine ' + ACKS.ENGINE_VERSION + '.',
    type: 'object',
    additionalProperties: true,
    required: ['schemaVersion', 'kind', 'id', 'name'],
    properties: rootProps,
    $defs,
    'x-acks-meta': {
      generatedBy: 'scripts/build-schema.js',
      engineVersionAtGeneration: ACKS.ENGINE_VERSION,
      schemaVersion: ACKS.SCHEMA_VERSION,
      entityKinds: ACKS.ENTITY_KINDS_LIST.length,
      typedKinds: schemaKinds.size,
      eventKinds: ACKS.EVENT_KINDS.length,
      nestedSubEntityKinds: nestedKinds,
      note: 'Regenerate with `node scripts/build-schema.js` after any change to ENTITY_KINDS_LIST / FIELD_SCHEMAS / EVENT_KINDS.'
    }
  };
}

// ── Run ──────────────────────────────────────────────────────────────────────────────────────────
function serialize(schema) { return JSON.stringify(schema, null, 2) + '\n'; }
// Compare ignoring line endings: the repo is core.autocrlf=true, so the committed file is LF in git
// but CRLF in the working copy after checkout, while serialize() emits LF. Normalize both sides so the
// staleness check is the same answer on the author's machine and in CI.
function eolNorm(t) { return (t == null ? '' : String(t)).replace(/\r\n/g, '\n'); }
function isUpToDate(committedText, generatedText) { return eolNorm(committedText) === eolNorm(generatedText); }

function main() {
  const args = new Set(process.argv.slice(2));
  const schema = buildSchema();
  const text = serialize(schema);

  if (args.has('--stdout')) { process.stdout.write(text); return; }

  if (args.has('--check')) {
    let current = null;
    try { current = fs.readFileSync(OUT_FILE, 'utf8'); } catch (e) { /* missing */ }
    if (isUpToDate(current, text)) { console.log('schema up to date: ' + path.relative(REPO, OUT_FILE)); process.exit(0); }
    console.error('STALE: ' + path.relative(REPO, OUT_FILE) + ' differs from generated output. Run `node scripts/build-schema.js` and commit.');
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, text);
  const meta = schema['x-acks-meta'];
  console.log('wrote ' + path.relative(REPO, OUT_FILE) +
    ' (' + meta.entityKinds + ' kinds, ' + meta.typedKinds + ' typed, ' + meta.eventKinds + ' event kinds)');
}

if (require.main === module) main();
module.exports = { buildSchema, serialize, eolNorm, isUpToDate, OUT_FILE };
