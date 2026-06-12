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
    // object — nested record. Carries fields:[] directly (same shape as an array's
    // itemSchema.fields). One level of nesting (object-of-scalars + enumMulti/idArray);
    // recursively validate each sub-field. (Wave C — the deferred B.6 type.)
    if(field.type === 'object'){
      if(!Array.isArray(field.fields) || field.fields.length === 0){
        errors.push(tag + ': object type requires a non-empty fields[] (the sub-schema)');
      } else {
        for(const sub of field.fields){
          const subResult = validateFieldEntry(sub, tag + '{}');
          if(!subResult.ok) errors.push.apply(errors, subResult.errors);
        }
      }
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
    // RECONCILED 2026-05-31 (Wave B.6 Step 0); items reshaped to the facet model
    // 2026-06-03 (Items I1 / OQ9). Matches blankStash + blankStashItem + the stash
    // setters (depositToStash/withdrawFromStash). Canonical shape: `name` (not label),
    // `kind` (not stashKind), `isHidden` (not hidden), and ONE `items[]` array. An
    // item line carries a multi-valued `facets[]` (coin|valuable|gear|bulk|magical|
    // readable|container) — NOT a coin|bulk|item subtype; coin/valuable value + weight
    // are derived. Every field here is one blankStash emits; every items sub-field is
    // one blankStashItem emits. Guarded by the global schema⊆factory smoke invariant.
    'stash': {
      factory: 'blankStash',
      groups: ['Identity', 'Location', 'Ownership', 'Contents', 'History'],
      fields: [
        { name: 'id',          type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',        type: 'string', required: true,  group: 'Identity', description: 'Display name for this stash' },
        { name: 'kind',        type: 'enum',   enumValues: ['personal','party','domain-treasury','cache'], group: 'Identity', default: 'personal' },
        { name: 'hexId',       type: 'id',     idKind: 'hex', group: 'Location' },
        { name: 'ownerCharacterId', type: 'id', idKind: 'character', group: 'Ownership' },
        { name: 'ownerPartyId',     type: 'id', idKind: 'party', group: 'Ownership' },
        { name: 'ownerDomainId',    type: 'id', idKind: 'domain', group: 'Ownership' },
        { name: 'isHidden',    type: 'boolean', group: 'Ownership', description: 'Gated by the hidden-stashes house rule' },
        // One items array; each line is composed of toggleable facets (Items I1 / OQ9).
        // coin → denomination+qty · valuable → valuableType/Tier+unitValueGp · gear/bulk →
        // name/unit/encumbranceSt · magical|readable → notableItemId promotion pointer.
        { name: 'items',       type: 'array', group: 'Contents', itemSchema: {
          fields: [
            { name: 'facets',       type: 'enumMulti', enumValues: ['coin','valuable','gear','bulk','magical','readable','container'], description: 'composable item facets (≥1)' },
            { name: 'qty',          type: 'number', min: 0, default: 1 },
            { name: 'name',         type: 'string', description: 'gear / valuable / named label' },
            { name: 'denomination', type: 'enum', enumValues: ['cp','sp','ep','gp','pp'], description: 'coin facet' },
            { name: 'valuableType', type: 'enum', enumValues: ['gem','jewelry','special-treasure'], description: 'valuable facet (Treasure Tome §1.3)' },
            { name: 'valuableTier', type: 'string', description: 'gem/jewelry tier (ornamental|gem|brilliant / trinket|jewelry|regalia)' },
            { name: 'unitValueGp',  type: 'gp', description: 'per-unit gp value (valuables)' },
            { name: 'encumbranceSt', type: 'number', min: 0, description: 'stone weight (coin weight is derived: 1,000 coins = 1 st)' },
            { name: 'unit',         type: 'string', description: 'bulk measure (e.g. stones)' },
            { name: 'notableItemId', type: 'id', idKind: 'notableItem', description: 'promotion pointer → a tracked Notable Item' },
            { name: 'containerStashId', type: 'id', idKind: 'stash', description: 'container facet (reserved — nested stashes)' },
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
    },

    // Phase 3 Military W1 (2026-06-12) — Unit: the Group's military sibling kind.
    // Every field is a blankUnit key (global schema⊆factory invariant). Lifted legacy
    // garrison units share this exact shape (the lift lazy-defaults the military fields).
    'unit': {
      factory: 'blankUnit',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Troops', 'Economics', 'Stationing', 'Condition', 'History'],
      fields: [
        { name: 'id',            type: 'string', readonly: true, group: 'Identity' },
        { name: 'displayName',   type: 'string', required: true, group: 'Identity', description: 'Unit name (e.g. "1st Saltspur Heavy Foot")' },
        { name: 'unitTypeKey',   type: 'string', required: true, group: 'Identity', description: "TROOP_CATALOG troop type ('heavy-infantry', 'horse-archers', …; RR pp.438–441)" },
        { name: 'race',          type: 'enum', enumValues: ['man','dwarf','elf','kobold','goblin','orc','hobgoblin','gnoll','lizardman','bugbear','ogre'], group: 'Identity', default: 'man' },
        { name: 'loadout',       type: 'string', group: 'Identity', description: 'Equipment variant letter (A/B/C…) where the catalog lists several; blank = default' },
        { name: 'veteran',       type: 'boolean', group: 'Troops', description: '+1 morale, veteran wage; ≤25% of human mercenaries (RR p.430)' },
        { name: 'elite',         type: 'boolean', group: 'Troops', description: 'RR p.434 — wage surcharge + battle attack bonus (behind the elite-troops rule)' },
        { name: 'count',         type: 'number', min: 0, group: 'Troops', description: 'Roster strength (RR p.435: ≤120 man-sized / 60 large per company unit)' },
        { name: 'casualties',    type: 'number', min: 0, group: 'Troops', description: 'Losses — active strength = count − casualties' },
        { name: 'scale',         type: 'enum', enumValues: ['platoon','company','battalion','brigade'], group: 'Troops', default: 'company', description: 'Unit scale (RR p.437 — by army size)' },
        { name: 'source',        type: 'enum', enumValues: ['mercenary','conscript','militia','clanhold','follower','vassal','slave'], group: 'Troops', description: 'Troop source (RR pp.427–434) — drives wage/loyalty semantics' },
        { name: 'monthlyWage',   type: 'gp', group: 'Economics', description: 'Per-soldier monthly wage — a stored override; 0/blank = read the catalog' },
        { name: 'brPerSoldier',  type: 'number', group: 'Economics', description: 'Per-creature battle rating override; 0/blank = read the catalog (RR p.462)' },
        { name: 'stationedAt',   type: 'object', group: 'Stationing', description: 'Assignment: domain-garrison | character (mercenary company) | army | hex | constructible', fields: [
          { name: 'kind', type: 'enum', enumValues: ['domain-garrison','character','army','hex','constructible'] },
          { name: 'id',   type: 'string', description: 'The station entity id (kind-dependent)' }
        ] },
        { name: 'stationedAtHexId', type: 'id', idKind: 'hex', group: 'Stationing', description: 'Geographic hint (legacy field; the map reads it)' },
        { name: 'commanderCharacterId',  type: 'id', idKind: 'character', group: 'Stationing' },
        { name: 'lieutenantCharacterId', type: 'id', idKind: 'character', group: 'Stationing', description: 'Unit lieutenant (RR p.435; his morale modifier applies in battle)' },
        { name: 'loyalty',       type: 'number', group: 'Condition', description: 'Unit loyalty score (RR p.429 — officers −2 base; ± employer CHA)' },
        { name: 'moraleAdjustment', type: 'number', group: 'Condition', description: 'One-time levy ±1 (domain morale, RR pp.431–433) + GM adjustments, atop the catalog base' },
        { name: 'supplyState',   type: 'enum', enumValues: ['supplied','underfed','starving','dehydrated'], group: 'Condition', default: 'supplied', description: 'RR p.452 out-of-supply ladder' },
        { name: 'calamities',    type: 'array', group: 'Condition', description: 'Unit-loyalty-roll triggers (RR p.430)', itemSchema: { fields: [
          { name: 'kind', type: 'enum', enumValues: ['routed','casualties-25','unsupplied-week','unpaid-month','militia-season-campaigning','carnivore-atrocity','other'] },
          { name: 'atDay', type: 'number' },
          { name: 'note', type: 'string' }
        ] } },
        { name: 'trainingState', type: 'object', group: 'Condition', description: 'Conscript/militia training in progress (RR p.431; W7 runs it) — null when not training', fields: [
          { name: 'targetTroopType', type: 'string' },
          { name: 'startedAtDay',    type: 'number' },
          { name: 'completesAtDay',  type: 'number' }
        ] },
        { name: 'notes',         type: 'string', group: 'History' },
        { name: 'history',       type: 'history', readonly: true, group: 'History' }
      ]
    },

    // Phase 3 Military W1 — Army (embedded divisions; Architecture §3.1).
    'army': {
      factory: 'blankArmy',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Command', 'Campaign', 'Supply', 'History'],
      fields: [
        { name: 'id',                type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',              type: 'string', required: true, group: 'Identity' },
        { name: 'leaderCharacterId', type: 'id', idKind: 'character', group: 'Command', description: 'The army leader — his leadership ability caps divisions (RR p.435)' },
        { name: 'divisions',         type: 'array', group: 'Command', description: 'Embedded divisions — each needs a qualified commander (RR pp.435–437)', itemSchema: { fields: [
          { name: 'name',                 type: 'string' },
          { name: 'commanderCharacterId', type: 'id', idKind: 'character' },
          { name: 'adjutantCharacterId',  type: 'id', idKind: 'character', description: 'Optional — lends SA−1, costs the commander −1 morale modifier (RR p.436)' },
          { name: 'unitIds',              type: 'idArray', idKind: 'unit' },
          { name: 'role',                 type: 'enum', enumValues: ['vanguard','main','rear-guard'], description: '¼–⅓ vanguard + ¼–⅓ rear guard at stance (RR p.448)' }
        ] } },
        { name: 'strategicStance',   type: 'enum', enumValues: ['offensive','defensive','evasive'], group: 'Campaign', default: 'defensive', description: 'RR p.448 — set freely each initiative' },
        { name: 'currentHexId',      type: 'id', idKind: 'hex', group: 'Campaign' },
        { name: 'journeyId',         type: 'id', idKind: 'journey', group: 'Campaign', description: 'Armies march as journeys (W4); null = in garrison' },
        { name: 'lastInitiative',    type: 'number', group: 'Campaign', description: '1d6 + strategic ability (RR p.447)' },
        { name: 'supplyBaseIds',     type: 'idArray', idKind: 'settlement', group: 'Supply', description: 'Supply bases (RR p.450) — settlements; stronghold/border-fort constructible ids also valid by hand' },
        { name: 'supplySimplified',  type: 'boolean', group: 'Supply', default: true, description: 'RR p.452 Supply Simplified — the default automation mode; untick for full line computation (W5)' },
        { name: 'notes',             type: 'string', group: 'History' },
        { name: 'history',           type: 'history', readonly: true, group: 'History' }
      ]
    },

    // Favors & Duties (#230, F&D-1 — 2026-06-08) — relation entity (RR pp.345–348).
    // Inspector-creatable: pick the liege + vassal domain + edict kind; the monthly turn
    // auto-rolls these by default (favor-duty-auto-roll). Every field is a blankFavorDutyObligation
    // key (guarded by the global schema⊆factory invariant).
    'favorDutyObligation': {
      factory: 'blankFavorDutyObligation',
      adminCreate: 'schemaForm',
      groups: ['Parties', 'Edict', 'Economics', 'Lifecycle', 'History'],
      fields: [
        { name: 'id',                     type: 'string', readonly: true, group: 'Parties' },
        { name: 'liegeCharacterId',       type: 'id', idKind: 'character', required: true, group: 'Parties', description: 'The liege granting the favor / demanding the duty' },
        { name: 'vassalDomainId',         type: 'id', idKind: 'domain', required: true, group: 'Parties', description: 'The vassal domain bound by the obligation' },
        { name: 'vassalRulerCharacterId', type: 'id', idKind: 'character', group: 'Parties', description: 'The vassal ruler — the subject of any excess-duty Loyalty roll' },
        { name: 'kind',                   type: 'enum', enumValues: ['construction','scutage','call-to-council','call-to-arms','loan','charter-of-monopoly','gift','office','troops','grant-of-land','custom'], required: true, group: 'Edict', description: 'The Favor/Duty table edict (RR p.348); "custom" = a GM-devised freeform edict (RR p.345)' },
        { name: 'customLabel',            type: 'string', group: 'Edict', description: 'Free-text name for a kind:"custom" edict (blank for table kinds)' },
        { name: 'councilHexId',           type: 'id', idKind: 'hex', group: 'Edict', description: 'Call to Council — the hex (in the lord\'s domain) the vassal must attend; null for other kinds' },
        { name: 'officeTitle',            type: 'string', group: 'Edict', description: 'Office favor (RR p.348) — the free-text ceremonial office granted (e.g. "Knight Marshal"); grants the holder\'s vassals +1 loyalty. \'\' for non-office kinds' },
        { name: 'isFavor',                type: 'boolean', group: 'Edict', description: 'True = a favor the lord grants; false = a duty the lord demands' },
        { name: 'isOngoing',              type: 'boolean', group: 'Edict', description: 'True = recurs until revoked; false = one-time (gift / grant-of-land)' },
        { name: 'musterTitle',            type: 'enum', enumValues: ['','emperor','king','prince','duke','count','viscount','baron'], group: 'Edict', description: "Realm title sizing the muster periods for Call to Arms / Scutage (blank = derive from the suzerain's realm)" },
        { name: 'gpPerMonth',             type: 'gp', group: 'Economics', description: '1gp × families in the vassal realm (for construction = the monthly tribute); 0 for non-gp edicts' },
        { name: 'constructionSpentGp',    type: 'gp', group: 'Economics', description: 'Running gp expended on a Construction duty (auto-revokes at 15,000gp / 6-mile hex)' },
        { name: 'constructionOrders',     type: 'array', group: 'Edict', description: 'Construction-duty orders the liege set (RR p.348) — hex + structure type; target = 15,000gp × distinct ordered hexes', itemSchema: { fields: [
          { name: 'hexId', type: 'id', idKind: 'hex' },
          { name: 'type',  type: 'enum', enumValues: ['generic','bridge','road','fort','tower','structure','vessel'] }
        ] } },
        { name: 'roll',                   type: 'number', group: 'Lifecycle', description: 'The 1d20 that produced this edict (null when GM-picked)' },
        { name: 'status',                 type: 'enum', enumValues: ['active','revoked','one-time-spent'], group: 'Lifecycle' },
        { name: 'grantedAtTurn',          type: 'number', group: 'Lifecycle' },
        { name: 'loanGivenAtTurn',        type: 'number', group: 'Lifecycle', description: 'Turn a demanded Loan was given (vassal→liege); null = not yet given. The repayment check + revoke-repay key off it' },
        { name: 'scutageAutoPay',         type: 'boolean', group: 'Lifecycle', description: 'Scutage auto-pay toggle — when true the vassal pays scutage automatically every monthly turn (Pay Scutage on / Stop Paying off); false = withheld' },
        { name: 'scutageLastPaidTurn',    type: 'number', group: 'Lifecycle', description: 'Audit: the last month scutage actually settled (stamped by the monthly turn while auto-pay is on). null = never settled' },
        { name: 'scutageGpPerFamily',     type: 'number', group: 'Edict', description: 'Scutage rate in gp/family (RR p.347); the monthly amount is derived live = rate × the vassal\'s current realm families, so it tracks population. null = the RAW default 1gp/family' },
        { name: 'revokedAtTurn',          type: 'number', group: 'Lifecycle', description: 'Set on revoke — null while active' },
        { name: 'notes',                  type: 'longText', group: 'History', description: 'GM-resolve note for duties whose cross-subsystem effect is not yet automated' },
        { name: 'history',                type: 'history', readonly: true, group: 'History' }
      ]
    },

    // ─── Wave C schemas (authored against the factories in acks-engine-entities.js).
    // Every field is a key the factory emits (guarded by the global schema⊆factory
    // invariant in tests/smoke.js). Freeform-map fields the factories default to {}
    // (intrinsic, workerCounts, functionData, identification, magicAssist.multipliers)
    // are intentionally omitted — there is no map field-type yet; edit those via Raw JSON.
    // adminCreate:'schemaForm' = the generic Inspector form (the two-verb Admin path).

    // ── Live data layers ──

    'group': {
      factory: 'blankGroup',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Template', 'Strength', 'Classification', 'Location', 'History'],
      fields: [
        { name: 'id',          type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',        type: 'string', group: 'Identity', description: 'Optional descriptive label (e.g. "Gnoll raiding band")' },
        { name: 'groupTemplate', type: 'object', group: 'Template', description: 'Shared template copied into individuated creatures', fields: [
          { name: 'monsterCatalogKey', type: 'string', description: 'Key into the planned MONSTER_CATALOG' },
          { name: 'creatureTypes',     type: 'enumMulti', enumValues: ['humanoid','beastman-humanoid','animal','construct','giant','incarnation','monstrosity','ooze','plant','undead','vermin'] },
          { name: 'hitDice',           type: 'string', description: "RAW HD string e.g. '1-1', '4+1'" }
        ] },
        { name: 'count',       type: 'number', min: 0, group: 'Strength', description: 'Roster strength' },
        { name: 'casualties',  type: 'number', min: 0, group: 'Strength', description: 'Combat losses (active = count − casualties)' },
        { name: 'socialTier',  type: 'enum', enumValues: ['independent','henchman','hireling','mercenary','specialist','follower'], group: 'Classification' },
        { name: 'lifecycleState', type: 'string', group: 'Classification', description: "Same axis as Character (e.g. 'wild', 'active') — not a fixed engine set" },
        { name: 'currentHexId',    type: 'id', idKind: 'hex', group: 'Location' },
        { name: 'currentDomainId', type: 'id', idKind: 'domain', group: 'Location' },
        { name: 'commanderCharacterId', type: 'id', idKind: 'character', group: 'Location', description: 'Optional named commander' },
        { name: 'banditryDomainId', type: 'id', idKind: 'domain', group: 'Classification', description: 'E10 — set = this band is that domain’s own morale-banditry (RR pp.350–351): fenced to the domain, reconciled monthly, disbands when morale recovers' },
        { name: 'notes',       type: 'longText', group: 'History' },
        { name: 'history',     type: 'history', readonly: true, group: 'History' }
      ]
    },

    'notableItem': {
      factory: 'blankNotableItem',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Provenance', 'History'],
      fields: [
        { name: 'id',     type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',   type: 'string', group: 'Identity', description: 'Named-item label (optional)' },
        { name: 'kind',   type: 'enum', enumValues: ['magic-weapon','magic-armor','potion','scroll','wand','rod','staff','misc-magic','book','relic','regalia','masterwork'], group: 'Identity' },
        { name: 'baseCatalogKey', type: 'string', group: 'Identity', description: 'Key into the item catalog (optional)' },
        { name: 'provenance', type: 'object', group: 'Provenance', fields: [
          { name: 'makerCharacterId', type: 'id', idKind: 'character' },
          { name: 'createdAtTurn',    type: 'number' },
          { name: 'originLore',       type: 'longText' },
          { name: 'knownMakeAndAuthenticity', type: 'boolean', description: 'RAW JJ p.130 — 2× sale multiplier when true' }
        ] },
        { name: 'status', type: 'enum', enumValues: ['active','destroyed','lost'], group: 'History' },
        { name: 'history', type: 'history', readonly: true, group: 'History' }
      ]
    },

    'itemCustody': {
      factory: 'blankItemCustody',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Custody', 'Lifecycle'],
      fields: [
        { name: 'id',     type: 'string', readonly: true, group: 'Identity' },
        { name: 'itemId', type: 'id', idKind: 'notableItem', required: true, group: 'Identity', description: 'The Notable Item in custody' },
        { name: 'custodianKind', type: 'enum', enumValues: ['character','group','outpost','stronghold-vault','hex','monster-hoard','merchant-stock','unknown'], group: 'Custody' },
        { name: 'custodianId',   type: 'string', group: 'Custody', description: 'ID into the collection matching custodianKind (chr-/grp-/out-/dom-/hex-/lair-/set-) — polymorphic, so plain text' },
        { name: 'sinceTurn',     type: 'number', group: 'Lifecycle' },
        { name: 'acquiredViaEventId', type: 'string', group: 'Lifecycle', description: 'Event id that created this custody (optional)' },
        { name: 'status',  type: 'enum', enumValues: ['active','ended'], group: 'Lifecycle' },
        { name: 'history', type: 'history', readonly: true, group: 'Lifecycle' }
      ]
    },

    'project': {
      factory: 'blankProject',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Site', 'Owner', 'Repair', 'Budget', 'Workforce', 'State', 'History'],
      fields: [
        { name: 'id',   type: 'string', readonly: true, group: 'Identity' },
        { name: 'name', type: 'string', group: 'Identity', description: 'Flows to the Constructible on completion' },
        { name: 'constructibleKind', type: 'enum', enumValues: ['stronghold-component','agricultural-improvement','vessel','war-machine','settlement-building','sanctum','dungeon','mine','vault','hideout','civic-monument','trap','field-fortification','road'], group: 'Identity' },
        { name: 'constructibleSubtype', type: 'string', group: 'Identity', description: "e.g. 'keep', 'galley-2-rower'" },
        { name: 'siteHexId',          type: 'id', idKind: 'hex', group: 'Site' },
        { name: 'siteSettlementId',   type: 'id', idKind: 'settlement', group: 'Site' },
        { name: 'siteConstructibleId', type: 'id', idKind: 'constructible', group: 'Site', description: 'For sub-projects (naval fitting on a ship, etc.)' },
        { name: 'ownerCharacterId', type: 'id', idKind: 'character', group: 'Owner' },
        { name: 'ownerDomainId',    type: 'id', idKind: 'domain', group: 'Owner' },
        { name: 'isRepair', type: 'boolean', group: 'Repair' },
        { name: 'repairTargetConstructibleId', type: 'id', idKind: 'constructible', group: 'Repair', description: 'The damaged Constructible this repairs' },
        { name: 'totalCost', type: 'gp', group: 'Budget' },
        { name: 'gpSpent',   type: 'gp', group: 'Budget' },
        { name: 'laborInvested', type: 'number', group: 'Workforce', description: 'Worker-days expended' },
        { name: 'laborRequired', type: 'number', group: 'Workforce', description: 'Worker-days to completion (estimate)' },
        { name: 'workerCapPerDay', type: 'number', group: 'Workforce', description: 'Peak worker cap' },
        { name: 'supervisorCharacterIds', type: 'idArray', idKind: 'character', group: 'Workforce' },
        { name: 'requiredSupervisorRating', type: 'number', group: 'Workforce' },
        { name: 'magicAssist', type: 'object', group: 'Workforce', description: 'Magical construction assists (RR/JJ)', fields: [
          { name: 'ditches', type: 'boolean' },
          { name: 'mire',    type: 'boolean' },
          { name: 'walls',   type: 'boolean' }
        ] },
        { name: 'lifecycleState', type: 'enum', enumValues: ['planning','under-construction','paused','complete','abandoned'], group: 'State' },
        { name: 'startedAtTurn',   type: 'number', group: 'State' },
        { name: 'completedAtTurn', type: 'number', group: 'State' },
        { name: 'estimatedCompletionTurn', type: 'number', group: 'State' },
        { name: 'daysElapsed', type: 'number', group: 'State', description: 'Since startedAtTurn — used by the day-tick consumer' },
        { name: 'notes',   type: 'longText', group: 'History' },
        { name: 'history', type: 'history', readonly: true, group: 'History' }
      ]
    },

    'constructible': {
      factory: 'blankConstructible',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Classification', 'Site', 'Owner', 'Economics', 'Combat', 'State', 'History'],
      fields: [
        { name: 'id',   type: 'string', readonly: true, group: 'Identity' },
        { name: 'name', type: 'string', group: 'Identity' },
        // Six-axis classification (Architecture.md §10.3) — each axis independent.
        { name: 'constructibleKind', type: 'enum', enumValues: ['stronghold-component','agricultural-improvement','vessel','war-machine','settlement-building','sanctum','dungeon','mine','vault','hideout','civic-monument','trap','field-fortification','road'], group: 'Classification' },
        { name: 'constructibleSubtype', type: 'string', group: 'Classification', description: "e.g. 'keep', 'sanctum', 'merchant-guildhouse'" },
        { name: 'constructionState', type: 'enum', enumValues: ['planning','under-construction','complete','in-repair','being-demolished'], group: 'Classification' },
        { name: 'damageState',  type: 'enum', enumValues: ['intact','damaged','breached','ruined','destroyed'], group: 'Classification' },
        { name: 'ownership',    type: 'enum', enumValues: ['domain','character','settlement-civic','abandoned','contested'], group: 'Classification' },
        { name: 'siteType',     type: 'enum', enumValues: ['wilderness-hex','settlement-embedded','stronghold-courtyard','sub-structure','naval','special'], group: 'Classification' },
        { name: 'operationalState', type: 'enum', enumValues: ['operational','understaffed','abandoned','contested'], group: 'Classification' },
        { name: 'hexId',        type: 'id', idKind: 'hex', group: 'Site' },
        { name: 'settlementId', type: 'id', idKind: 'settlement', group: 'Site' },
        { name: 'parentConstructibleId', type: 'id', idKind: 'constructible', group: 'Site', description: 'For sub-structures' },
        { name: 'ownerCharacterId', type: 'id', idKind: 'character', group: 'Owner' },
        { name: 'ownerDomainId',    type: 'id', idKind: 'domain', group: 'Owner' },
        { name: 'buildValue', type: 'gp', group: 'Economics', description: 'gp cost at completion — sets stronghold value contribution' },
        { name: 'monthlyMaintenance', type: 'gp', group: 'Economics' },
        { name: 'maxShp',     type: 'number', group: 'Combat', description: 'Structural HP (D@W Battles)' },
        { name: 'currentShp', type: 'number', group: 'Combat', description: 'null = intact (treat as maxShp)' },
        { name: 'armorClass', type: 'number', group: 'Combat' },
        { name: 'subStructures', type: 'array', group: 'Combat', description: 'Multi-story sub-structures, each with own SHP', itemSchema: { fields: [
          { name: 'label',       type: 'string' },
          { name: 'maxShp',      type: 'number' },
          { name: 'currentShp',  type: 'number' },
          { name: 'damageState', type: 'enum', enumValues: ['intact','damaged','breached','ruined','destroyed'] },
          { name: 'level',       type: 'number' }
        ] } },
        { name: 'completedAtTurn', type: 'number', group: 'State' },
        { name: 'notes',   type: 'longText', group: 'History' },
        { name: 'history', type: 'history', readonly: true, group: 'History' }
      ]
    },

    // Phase 2.5 Journeys (#475 — J1). Overland/foot travel. Every field is a key
    // blankJourney emits (global schema⊆factory invariant). Engine-managed logs
    // (days[], encounters[]) are omitted — they're driven by the day-tick consumer,
    // not GM-authored; edit via Raw JSON if ever needed. mode enum reserves sea/air.
    'journey': {
      factory: 'blankJourney',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Participants', 'Route', 'Progress', 'Supplies', 'History'],
      fields: [
        { name: 'id',     type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',   type: 'string', group: 'Identity', description: 'e.g. "Saltspur to the Tablelands"' },
        { name: 'status', type: 'enum', enumValues: ['planning','in-transit','resting','arrived','aborted','lost'], group: 'Identity', description: 'Only in-transit journeys advance on a day-tick' },
        { name: 'purpose', type: 'enum', enumValues: ['expedition','commercial-venture','pilgrimage','embassy','patrol','rescue','courier','hijink-travel','other'], group: 'Identity' },
        { name: 'mode',   type: 'enum', enumValues: ['foot','mounted-light','mounted-medium','mounted-heavy','wagon','voyage-row','voyage-sail','voyage-galley','voyage-longship','aerial-mount','aerial-spell','mixed'], group: 'Identity', description: 'J1 acts on land modes only; sea/air reserved' },
        { name: 'pace',   type: 'enum', enumValues: ['forced-march','normal','half-speed'], group: 'Identity' },
        { name: 'speedOverrideMilesPerDay', type: 'number', min: 0, group: 'Identity', description: '§26 GM speed override — miles/day for the leg, bypassing pace/weather/temperature (per-hex terrain still applies). 0 or blank ⇒ pace governs' },
        { name: 'partyId', type: 'id', idKind: 'party', group: 'Participants', description: 'Optional convenience pointer — participantCharacterIds is the source of truth' },
        { name: 'participantCharacterIds', type: 'idArray', idKind: 'character', group: 'Participants' },
        { name: 'startHexId',       type: 'id', idKind: 'hex', group: 'Route' },
        { name: 'destinationHexId', type: 'id', idKind: 'hex', group: 'Route' },
        { name: 'currentHexId',     type: 'id', idKind: 'hex', group: 'Route', description: 'Advances to the destination on arrival (per-hex stepping is a later slice)' },
        { name: 'waypoints', type: 'array', group: 'Route', description: 'Ordered intermediate stops', itemSchema: { fields: [
          { name: 'hexId',          type: 'id', idKind: 'hex' },
          { name: 'label',          type: 'string' },
          { name: 'plannedPurpose', type: 'string' }
        ] } },
        { name: 'currentDayIndex', type: 'number', group: 'Progress', description: 'Days elapsed into the journey' },
        { name: 'startedAtTurn',   type: 'number', group: 'Progress' },
        { name: 'isLost',          type: 'boolean', group: 'Progress' },
        { name: 'fatigueDays',     type: 'number', group: 'Progress', description: 'Strenuous-day streak (JJ p.84)' },
        { name: 'supplies', type: 'object', group: 'Supplies', description: 'Person-day stores (J1 tracks food + water)', fields: [
          { name: 'rations',      type: 'number', min: 0, description: 'Food rations (person-days)' },
          { name: 'waterRations', type: 'number', min: 0, description: 'Water rations (person-days)' },
          { name: 'animalFeed',   type: 'number', min: 0 },
          { name: 'animalWater',  type: 'number', min: 0 },
          { name: 'shipStores',   type: 'number', min: 0, description: 'Voyage modes only' }
        ] },
        { name: 'notes',   type: 'longText', group: 'History' },
        { name: 'history', type: 'history', readonly: true, group: 'History' }
      ]
    },

    // Phase 2.5 Monster Persistence (#476, M0 — 2026-06-09) — Lair, the first-class placed
    // monster-home entity (RAW core; survey §5, §16.3). Inspector-creatable as the no-frills
    // admin path (the generative Lair Wizard, plan §12.5, lands later). Population is composition:
    // groupIds[] → campaign.groups[], leaderCharacterIds[] → campaign.characters[]. Treasure is
    // lair-only. Every field is a blankLair key (global schema⊆factory invariant); totalInhabitantCount
    // is a derived cache (computed). monsterCatalogKey is a free string until the MONSTER_CATALOG (M2).
    'lair': {
      factory: 'blankLair',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Placement', 'Population', 'Treasure', 'Characteristics', 'Lifecycle', 'History'],
      fields: [
        { name: 'id',                   type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',                 type: 'string', group: 'Identity', default: '', description: 'GM label, e.g. "Bloodfang Cave"' },
        { name: 'status',               type: 'enum',   enumValues: ['active','cleared','abandoned','destroyed','unknown','dynamic'], group: 'Identity', default: 'active', description: 'dynamic = authored-but-unplaced (revealed on a lair roll); unknown = placed-but-undetailed' },
        { name: 'monsterCatalogKey',    type: 'string', group: 'Identity', description: 'Key into the MONSTER_CATALOG (M2) — a free string until then' },
        { name: 'hexId',                type: 'id', idKind: 'hex', group: 'Placement', description: 'The hex this lair sits in — empty while status:dynamic' },
        { name: 'precisePlacement',     type: 'string', group: 'Placement', description: 'e.g. "cave on the eastern slope"' },
        { name: 'knownToPlayers',       type: 'boolean', group: 'Placement', description: 'Discovered via search / tracking?' },
        { name: 'hiddenDC',             type: 'number', group: 'Placement', description: 'Hex-search modifier for a well-hidden lair (null = none)' },
        { name: 'groupIds',             type: 'idArray', idKind: 'group', group: 'Population', description: 'Rank-and-file Groups denning here' },
        { name: 'leaderCharacterIds',   type: 'idArray', idKind: 'character', group: 'Population', description: 'Individuated leaders (chieftain, champions)' },
        { name: 'totalInhabitantCount', type: 'computed', readonly: true, group: 'Population', description: 'Derived — Σ active group counts + leaders (ACKS.lairInhabitantCount)' },
        { name: 'treasureType',         type: 'string', group: 'Treasure', description: "Treasure Type 'A'..'R' (lair-only; '' = none)" },
        { name: 'treasureCustodyId',    type: 'string', group: 'Treasure', readonly: true, description: 'monster-hoard custody record at this lair (set by the treasure generator, M3)' },
        { name: 'lairType',             type: 'enum', enumValues: ['lair','lair-large','hideout','ruin','natural-cave','dungeon-level'], group: 'Characteristics', default: 'lair' },
        { name: 'terrain',              type: 'string', group: 'Characteristics' },
        { name: 'hasFortifications',    type: 'boolean', group: 'Characteristics' },
        { name: 'lairPct',              type: 'number', group: 'Characteristics', description: "The monster's Lair % (0 = never lairs); from the catalog" },
        { name: 'factionKey',           type: 'string', group: 'Characteristics', description: 'Reserved — cross-hex lair network (M10+)' },
        { name: 'establishedAtTurn',    type: 'number', group: 'Lifecycle' },
        { name: 'establishedBy',        type: 'enum', enumValues: ['genesis','hex-seeding','dynamic-reveal','persistent-wanderer','gm-fiat'], group: 'Lifecycle', default: 'gm-fiat' },
        { name: 'lastVisitedTurn',      type: 'number', group: 'Lifecycle' },
        { name: 'clearedAtTurn',        type: 'number', group: 'Lifecycle' },
        { name: 'repopulationChance',   type: 'number', group: 'Lifecycle', description: 'Reserved — lair-repopulation (M10+)' },
        { name: 'notes',                type: 'longText', group: 'History' },
        { name: 'history',              type: 'history', readonly: true, group: 'History' }
      ]
    },

    // #476 Encounter layer E1 (D8) — the reified pre-combat interaction (RR pp.280–287;
    // plan §15.1). The step-state objects (distance / surprise / evasion / reaction /
    // pursuit) and the two side objects are deep dynamic shapes — omitted per the C.3
    // freeform-fields convention (raw-JSON edited; the E2 resolution surface owns them).
    'encounter': {
      factory: 'blankEncounter',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Draw', 'Lifecycle', 'History'],
      fields: [
        { name: 'id',                   type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',                 type: 'string', group: 'Identity', default: '', description: 'GM label; display derives from the monster / hex when empty' },
        { name: 'scale',                type: 'enum', enumValues: ['wilderness','dungeon','sea','settlement','domain'], group: 'Identity', default: 'wilderness', description: 'Only wilderness is live in E1; the rest are reserved scales' },
        { name: 'trigger',              type: 'enum', enumValues: ['journey-travel','hex-search','rest-night','hunt','domain-incursion','gm-authored','pursuit','lair-assault'], group: 'Identity', default: 'gm-authored' },
        { name: 'hexId',                type: 'id', idKind: 'hex', group: 'Identity', description: 'Where the meeting happens' },
        { name: 'category',             type: 'enum', enumValues: ['monster','civilized'], group: 'Draw', description: 'The JJ category-draw result (empty = GM-authored)' },
        { name: 'rarity',               type: 'enum', enumValues: ['common','uncommon','rare','very-rare'], group: 'Draw', description: 'Monster rarity by territory class (JJ p.44)' },
        // E4 — the non-party side is GM-editable here (the admin path beneath the modal's
        // ⟳/pick-from-table affordances). identity/binding/minted stay engine-written.
        { name: 'monsterSide',          type: 'object', group: 'Draw', description: 'The non-party side — who they are, how many, the den they bind to', fields: [
          { name: 'monsterCatalogKey',  type: 'string', description: 'MONSTER_CATALOG key (the E4 identity tables set it; blank = GM-detailed via label)' },
          { name: 'label',              type: 'string', description: 'The printed table cell, verbatim — the display name when no catalog key' },
          { name: 'count',              type: 'number', description: 'Number encountered' },
          { name: 'encounterKind',      type: 'enum', enumValues: ['at-lair','wandering-fragment','wandering'], description: 'at-lair = met at the den; fragment = a band out from a local den; wandering = unbound' },
          { name: 'lairId',             type: 'id', idKind: 'lair', description: 'The den this side belongs to (when bound)' },
          { name: 'pursuitEncounterId', type: 'id', idKind: 'encounter', description: 'E4m — the chase this band IS (a pursuing band met by a third party); dispersing the meeting ends the chase' }
        ] },
        { name: 'status',               type: 'enum', enumValues: ['active','resolved'], group: 'Lifecycle', default: 'active' },
        { name: 'phase',                type: 'enum', enumValues: ['setup','surprise','evasion','interaction','pursuit'], group: 'Lifecycle', default: 'setup' },
        { name: 'outcome',              type: 'enum', enumValues: ['no-encounter','evaded','parleyed','dispersed','combat','settled-as-lair','dismissed'], group: 'Lifecycle', description: 'Set when resolved; combat records "GM resolves" until #141' },
        { name: 'occurredAtTurn',       type: 'number', group: 'Lifecycle' },
        { name: 'occurredOnDayInMonth', type: 'number', group: 'Lifecycle' },
        { name: 'resolvedAtTurn',       type: 'number', readonly: true, group: 'Lifecycle' },
        { name: 'notes',                type: 'longText', group: 'History' },
        { name: 'history',              type: 'history', readonly: true, group: 'History' }
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
