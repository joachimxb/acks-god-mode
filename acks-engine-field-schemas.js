/* ACKS God Mode — acks-engine-field-schemas.js
 * Field Schema layer for the Entity Inspector (#554 — 2026-05-31).
 *
 * Sits on top of the Entity Registry (acks-engine-entity-registry.js).
 * For each entity kind, FIELD_SCHEMAS holds:
 *   - factory:  the blankX() function name on window.ACKS
 *   - groups:   ordered list of section headers for the Inspector form
 *   - fields:   array of field descriptors (name, type, group, etc.)
 *
 * Per Phase_4.7_Entity_Inspector_Plan.md §3 the field-type vocabulary is locked
 * at 15 types. Computed-field rendering, custom inputs, and player-visibility
 * are deferred per the plan's OQ1/OQ3/OQ5 defaults.
 *
 * Contributor mandate (CLAUDE §8.9 extension after Wave H):
 *   When a new entity kind ships, author its field schema HERE in the same
 *   delivery (alongside registering the kind + extending the importer).
 */
(function(global){
  'use strict';

  const ACKS = global.ACKS = global.ACKS || {};

  // ─── 1. Field-type vocabulary (locked per plan §3) ───
  const FIELD_TYPES = Object.freeze(new Set([
    'string',     // single-line text
    'longText',   // textarea
    'number',     // int or float
    'boolean',    // toggle
    'enum',       // pick-one from enumValues[]
    'enumMulti',  // pick-many from enumValues[]
    'id',         // single id reference; idKind restricts the picker
    'idArray',    // array of id references
    'coord',      // hex coordinate {q, r}
    'gp',         // number formatted as gp
    'date',       // calendar date (Auran cadence-aware later)
    'array',      // generic array of sub-records (itemSchema gives shape)
    'object',     // nested record (sub-fields rendered as a section)
    'computed',   // derived / read-only; v1 renders placeholder only (plan OQ1)
    'history'     // append-only log array — read-only, chronological list
  ]));

  function isValidFieldType(t){ return typeof t === 'string' && FIELD_TYPES.has(t); }

  // ─── 2. Field-schema validation ───

  /**
   * Validate that a field-schema entry is well-formed.
   * Returns { ok: bool, errors: string[] }.
   *
   * Catches the common authoring mistakes: missing name/type, unknown type,
   * enum without enumValues, id without idKind, array without itemSchema, etc.
   */
  function validateFieldEntry(field, ctx){
    const errors = [];
    if(!field || typeof field !== 'object'){ errors.push((ctx||'') + 'field is not an object'); return { ok: false, errors }; }
    const tag = (ctx ? ctx + '.' : '') + (field.name || '(unnamed)');
    if(!field.name || typeof field.name !== 'string') errors.push(tag + ': missing or non-string name');
    if(!isValidFieldType(field.type)) errors.push(tag + ': invalid type "' + field.type + '" (must be one of: ' + Array.from(FIELD_TYPES).join(', ') + ')');
    if((field.type === 'enum' || field.type === 'enumMulti') && (!Array.isArray(field.enumValues) || field.enumValues.length === 0)){
      errors.push(tag + ': type "' + field.type + '" requires non-empty enumValues array');
    }
    if((field.type === 'id' || field.type === 'idArray') && !field.idKind){
      errors.push(tag + ': type "' + field.type + '" should specify idKind (any-kind ids are allowed but discouraged — leave a comment if intentional)');
    }
    if(field.type === 'array' && field.itemSchema){
      // Recursively validate item-schema fields
      if(!Array.isArray(field.itemSchema.fields)){
        errors.push(tag + ': array itemSchema missing fields[]');
      } else {
        for(const sub of field.itemSchema.fields){
          const subResult = validateFieldEntry(sub, tag + '[]');
          if(!subResult.ok) errors.push.apply(errors, subResult.errors);
        }
      }
    }
    if(field.type === 'array' && !field.itemSchema){
      errors.push(tag + ': array type requires itemSchema');
    }
    if(field.group != null && typeof field.group !== 'string') errors.push(tag + ': group must be a string when set');
    return { ok: errors.length === 0, errors };
  }

  /**
   * Validate a full field-schema for an entity kind.
   * Returns { ok: bool, errors: string[] }.
   */
  function validateFieldSchema(kind, schema){
    const errors = [];
    if(!schema || typeof schema !== 'object'){ return { ok: false, errors: [kind + ': schema is not an object'] }; }
    if(schema.factory != null && typeof schema.factory !== 'string') errors.push(kind + ': factory must be a string (a window.ACKS function name) when set');
    if(schema.groups != null){
      if(!Array.isArray(schema.groups)) errors.push(kind + ': groups must be an array of strings');
      else for(const g of schema.groups) if(typeof g !== 'string') errors.push(kind + ': group entries must be strings');
    }
    if(!Array.isArray(schema.fields) || schema.fields.length === 0){
      errors.push(kind + ': schema must have fields[] (non-empty array)');
    } else {
      for(const field of schema.fields){
        const r = validateFieldEntry(field, kind);
        if(!r.ok) errors.push.apply(errors, r.errors);
      }
      // Cross-check: every field.group should appear in schema.groups (if both are defined)
      if(Array.isArray(schema.groups) && schema.groups.length > 0){
        const declared = new Set(schema.groups);
        const used = new Set();
        for(const f of schema.fields) if(f.group) used.add(f.group);
        for(const g of used) if(!declared.has(g)) errors.push(kind + ': field group "' + g + '" not declared in schema.groups[]');
      }
    }
    return { ok: errors.length === 0, errors };
  }

  // ─── 3. FIELD_SCHEMAS map — the 3 Wave A worked examples (plan §4) ───

  const FIELD_SCHEMAS = {

    // Worked example 4.1 — simple primitive-only entity
    'outpost': {
      factory: 'blankOutpost',
      groups: ['Identity', 'Location', 'Garrison', 'History'],
      fields: [
        { name: 'id',                  type: 'string',  readonly: true, group: 'Identity', description: 'Stable id — auto-assigned' },
        { name: 'name',                type: 'string',  required: true, group: 'Identity', default: '' },
        { name: 'kind',                type: 'enum',    enumValues: ['watchtower','waypoint','trading-post','forward-camp','signal-station'], group: 'Identity', default: 'watchtower' },
        { name: 'hexId',               type: 'id',      idKind: 'hex', required: true, group: 'Location' },
        { name: 'controllingDomainId', type: 'id',      idKind: 'domain', group: 'Location', description: 'Owning domain — empty for wilderness outposts' },
        { name: 'commanderCharacterId',type: 'id',      idKind: 'character', group: 'Garrison' },
        { name: 'garrisonGroupId',     type: 'id',      idKind: 'group', group: 'Garrison', description: 'Group/Unit stationed here' },
        { name: 'foundedAtTurn',       type: 'number',  readonly: true, group: 'History', description: 'Turn the outpost was founded' },
        { name: 'history',             type: 'history', readonly: true, group: 'History' }
      ]
    },

    // Worked example 4.2 — complex entity with a nested array.
    // RECONCILED 2026-05-31 (Wave B.6 Step 0) to match blankStash + blankStashItem +
    // the stash setters (depositToStash/withdrawFromStash). Canonical shape: `name`
    // (not label), `kind` (not stashKind), `isHidden` (not hidden), and ONE `items[]`
    // array — coins are NOT a separate array; they are items with kind:'coin' +
    // denomination + qty (see depositToStash's coin-merge-by-denomination). Every field
    // here is one blankStash emits; every items sub-field is one blankStashItem emits
    // (union across its coin/bulk/item variants). Guarded by a smoke invariant.
    'stash': {
      factory: 'blankStash',
      groups: ['Identity', 'Location', 'Ownership', 'Contents', 'History'],
      fields: [
        { name: 'id',          type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',        type: 'string', required: true,  group: 'Identity', description: 'Display name for this stash' },
        { name: 'kind',        type: 'enum',   enumValues: ['treasury','personal','hex-cache','outpost-cache','venture-payload','party-loot','custom'], group: 'Identity', default: 'personal' },
        { name: 'hexId',       type: 'id',     idKind: 'hex', group: 'Location' },
        { name: 'ownerCharacterId', type: 'id', idKind: 'character', group: 'Ownership' },
        { name: 'ownerPartyId',     type: 'id', idKind: 'party', group: 'Ownership' },
        { name: 'ownerDomainId',    type: 'id', idKind: 'domain', group: 'Ownership' },
        { name: 'isHidden',    type: 'boolean', group: 'Ownership', description: 'Gated by the hidden-stashes house rule' },
        // One heterogeneous items array, discriminated by `kind`: coin {denomination, qty},
        // bulk {label, qty, unit, encumbranceSt}, item {name, qty, encumbranceSt, magicItemId, notes}.
        { name: 'items',       type: 'array', group: 'Contents', itemSchema: {
          fields: [
            { name: 'kind',         type: 'enum', enumValues: ['coin','bulk','item'], default: 'item', description: 'coin = currency · bulk = measured goods · item = discrete object' },
            { name: 'denomination', type: 'enum', enumValues: ['gp','sp','cp','pp','ep'], default: 'gp', description: 'coin entries' },
            { name: 'name',         type: 'string', description: 'item entries' },
            { name: 'label',        type: 'string', description: 'bulk entries' },
            { name: 'qty',          type: 'number', min: 0, default: 1 },
            { name: 'unit',         type: 'string', description: 'bulk entries (e.g. stones)' },
            { name: 'encumbranceSt', type: 'number', min: 0, description: 'encumbrance in stone' },
            { name: 'magicItemId',  type: 'id', idKind: 'notableItem', description: 'set if this is a tracked Notable Item' },
            { name: 'notes',        type: 'string' }
          ]
        }},
        { name: 'notes',       type: 'string', group: 'Contents' },
        { name: 'createdAtTurn', type: 'number', readonly: true, group: 'History' },
        { name: 'history',     type: 'history', readonly: true, group: 'History' }
      ]
    },

    // Worked example 4.3 — relation entity
    'magistracy': {
      factory: 'blankMagistracy',
      groups: ['Identity', 'Parties', 'Lifecycle'],
      fields: [
        { name: 'id',                    type: 'string', readonly: true, group: 'Identity' },
        { name: 'role',                  type: 'enum',   enumValues: ['captain-of-the-guard','chaplain','munerator','steward'], required: true, readonly: true, group: 'Identity', description: 'Relation primary key — dismiss + recreate to change' },
        { name: 'magistrateCharacterId', type: 'id', idKind: 'character', required: true, group: 'Parties', description: 'The officer in this role — editable so GMs can replace the magistrate without dismissing the slot' },
        { name: 'domainId',              type: 'id', idKind: 'domain', required: true, readonly: true, group: 'Parties', description: 'The domain the role is in — dismiss + recreate to change' },
        { name: 'appointedAtTurn',       type: 'number', group: 'Lifecycle', description: 'Editable for state repair (correcting a misrecorded appointment turn)' },
        { name: 'endedAtTurn',           type: 'number', group: 'Lifecycle', description: 'Set on dismissal — null while active' },
        { name: 'isActive',              type: 'computed', readonly: true, group: 'Lifecycle', description: 'True when endedAtTurn is null' }
      ]
    }
  };

  // ─── 4. Public API ───

  function fieldSchemaFor(kind){ return FIELD_SCHEMAS[kind] || null; }
  function kindsWithSchema(){ return Object.keys(FIELD_SCHEMAS); }

  function entityFieldGroups(kind){
    const schema = FIELD_SCHEMAS[kind];
    if(!schema) return [];
    // Prefer schema.groups; fall back to deriving from field.group values
    if(Array.isArray(schema.groups) && schema.groups.length > 0) return schema.groups.slice();
    const seen = new Set();
    const out = [];
    for(const f of (schema.fields || [])){
      const g = f.group || '(uncategorized)';
      if(!seen.has(g)){ seen.add(g); out.push(g); }
    }
    return out;
  }

  function entityFieldsInGroup(kind, group){
    const schema = FIELD_SCHEMAS[kind];
    if(!schema) return [];
    return (schema.fields || []).filter(f => (f.group || '(uncategorized)') === group);
  }

  // Run a validation pass over every registered schema. Returns the full error
  // list as a single array. Useful for the smoke test + dev diagnostics.
  function validateAllSchemas(){
    const errors = [];
    for(const [kind, schema] of Object.entries(FIELD_SCHEMAS)){
      const r = validateFieldSchema(kind, schema);
      if(!r.ok) errors.push.apply(errors, r.errors);
    }
    return errors;
  }

  // Export onto window.ACKS
  Object.assign(ACKS, {
    FIELD_TYPES,
    FIELD_SCHEMAS,
    isValidFieldType,
    validateFieldEntry,
    validateFieldSchema,
    validateAllSchemas,
    fieldSchemaFor,
    kindsWithSchema,
    entityFieldGroups,
    entityFieldsInGroup
  });

})(typeof window !== 'undefined' ? window : global);
