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
        { name: 'homeHexId',     type: 'id', idKind: 'hex',    group: 'Stationing', description: 'Home garrison — the default station hex (inside the unit\'s domain); where it returns when a mission ends (2026-06-14)' },
        { name: 'homeDomainId',  type: 'id', idKind: 'domain', group: 'Stationing', description: 'Owning domain (set from the home hex; W7 levies set it directly)' },
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
        // W4 maneuvers (RR pp.447–460) — the GM-editable campaign state
        { name: 'reconModifier',       type: 'number', group: 'Campaign', default: 0, description: 'Standing GM modifier on this army’s reconnaissance rolls — magic, spies, stratagems (RR pp.453–455)' },
        { name: 'concealmentModifier', type: 'number', group: 'Campaign', default: 0, description: 'Standing GM modifier on rolls made AGAINST this army — camouflage magic, screens, deception (RR p.455)' },
        { name: 'alliedLeaderCharacterIds', type: 'idArray', idKind: 'character', group: 'Campaign', description: 'GM-marked allied leaders beyond the realm chain — their armies and domains read as friendly' },
        { name: 'permittedDomainIds',  type: 'idArray', idKind: 'domain', group: 'Campaign', description: 'Domains this army may enter uninvited — no invasion (RR p.458)' },
        { name: 'prisoners',           type: 'number', group: 'Campaign', default: 0, description: 'Held prisoners — ransom 40gp a head or keep as Construction labor (RR p.458)' },
        { name: 'notes',             type: 'string', group: 'History' },
        { name: 'history',           type: 'history', readonly: true, group: 'History' }
      ]
    },

    // Phase 3 Military W3 (2026-06-12) — Battle (RR pp.461–472). The Battles view +
    // the battle panel are the working surface; the Inspector covers the scalar state
    // (sides/forays/turnLog/aftermath are deep working records — Raw-JSON surgery).
    'battle': {
      factory: 'blankBattle',
      groups: ['Identity', 'Situation', 'Options', 'State', 'History'],
      fields: [
        { name: 'id',            type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',          type: 'string', required: true, group: 'Identity' },
        { name: 'hexId',         type: 'id', idKind: 'hex', group: 'Identity', description: 'Where the armies met — the terrain row drives foray distances + reinforcement throws' },
        { name: 'scale',         type: 'enum', enumValues: ['platoon','company','battalion','brigade'], group: 'Identity', default: 'company', description: 'RR p.437 — unit BRs express at this scale' },
        { name: 'awareness',     type: 'enum', enumValues: ['mutual','mutual-unawareness','unilateral-a','unilateral-b'], group: 'Situation', description: 'The reconnaissance state (RR p.461) — with the stances, it fixes the strategic situation' },
        { name: 'situation',     type: 'enum', enumValues: ['pitched-battle','meeting-engagement','rear-guard-action','skirmish','ambush','envelopment','deep-envelopment','rear-guard-envelopment'], group: 'Situation' },
        { name: 'attackerSide',  type: 'enum', enumValues: ['a','b'], group: 'Situation' },
        { name: 'surprisedSide', type: 'enum', enumValues: ['a','b'], group: 'Situation', description: 'The surprised army (no attack throws turn 1; enemies +2) — blank when neither' },
        { name: 'options',       type: 'object', group: 'Options', fields: [
          { name: 'armySizeAsymmetry',   type: 'boolean', description: 'RR p.464 optional rule — a smaller attacker fights before the defender finishes deploying (recommended ON for monster fights)' },
          { name: 'advantageousTerrain', type: 'enum', enumValues: ['a','b'], description: 'Which side holds the hill/ridgeline — attackers against it take −2' },
          { name: 'cannotRetreat',       type: 'enum', enumValues: ['a','b','both'], description: 'Surrounded/trapped — +2 on that side\'s morale rolls' }
        ] },
        { name: 'status',        type: 'enum', enumValues: ['setup','fighting','ended','resolved'], readonly: true, group: 'State' },
        { name: 'turnNumber',    type: 'number', readonly: true, group: 'State', description: 'Battle turns fought (~10 minutes each)' },
        { name: 'notes',         type: 'string', group: 'History' },
        { name: 'history',       type: 'history', readonly: true, group: 'History' }
      ]
    },

    // Phase 3 Military W6 (2026-06-13, burst3) — Siege (RR pp.473–485). The siege panel is the
    // working surface (the simplified resolver + the blockade/reduction/assault verbs); the
    // Inspector covers the scalar state. Every field is a blankSiege key (the global schema⊆
    // factory invariant); the artillery maps + resolution/history are deep records (Raw-JSON).
    'siege': {
      factory: 'blankSiege',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Parties', 'Stronghold', 'Blockade', 'State', 'History'],
      fields: [
        { name: 'id',               type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',             type: 'string', required: true, group: 'Identity' },
        { name: 'status',           type: 'enum', enumValues: ['investing','resolved'], readonly: true, group: 'Identity' },
        { name: 'resolutionMode',   type: 'enum', enumValues: ['simplified','detailed'], group: 'Identity', default: 'simplified', description: 'Sieges Simplified (the duration table) vs the detailed blockade/reduction/assault — a per-instance mode, not a house rule (RR pp.484–485)' },
        { name: 'besiegerArmyId',   type: 'id', idKind: 'army', required: true, group: 'Parties', description: 'The besieging army' },
        { name: 'defenderDomainId', type: 'id', idKind: 'domain', group: 'Parties', description: 'The besieged domain — its garrison defends + its strongholdValue estimates the shp (RR p.474)' },
        { name: 'defenderArmyId',   type: 'id', idKind: 'army', group: 'Parties', description: 'A defending army holed up inside (optional)' },
        { name: 'hexId',            type: 'id', idKind: 'hex', group: 'Parties', description: 'Where the stronghold stands' },
        { name: 'stronghold',       type: 'object', group: 'Stronghold', description: 'The besieged stronghold (authored, or estimated from strongholdValue)', fields: [
          { name: 'material',     type: 'enum', enumValues: ['stone','wood'], description: 'Wooden strongholds have ⅒ the shp (RR p.474)' },
          { name: 'strongholdShp', type: 'number', description: 'Structural hit points — gp value ÷ 10 (stone) / ÷ 100 (wood)' },
          { name: 'shpDamage',    type: 'number', description: 'Reduction damage dealt so far — breaches = ⌊shpDamage / 1000⌋' },
          { name: 'unitCapacity', type: 'number', description: 'Units it can defend = ⌈shp / 1000⌉ (RR p.473)' },
          { name: 'siteType',     type: 'enum', enumValues: ['normal','riverbank','peninsula','island','mountain'], description: 'Inaccessible terrain multiplies the duration (riverbank ×2 … mountain ×5)' }
        ] },
        { name: 'blockade',         type: 'object', group: 'Blockade', description: 'Encirclement + stored-supply depletion (RR pp.474–475)', fields: [
          { name: 'inPlace',           type: 'boolean' },
          { name: 'circumvallationFeet', type: 'number', description: 'Each 250\' replaces 2 blockading units; a full ring → −4 smuggling' },
          { name: 'weeksPrep',         type: 'number', description: 'Weeks of warning before encirclement — more stored supplies (+600/cap per week)' },
          { name: 'storedSuppliesGp',  type: 'number', description: '600gp × unit capacity, +600/cap per prep week, cap 3,000/cap' },
          { name: 'suppliesExhausted', type: 'boolean', readonly: true }
        ] },
        { name: 'daysRequired',     type: 'number', readonly: true, group: 'State', description: 'Sieges-Simplified days to capture (null = the besieger is too weak — blockade only)' },
        { name: 'captureReady',     type: 'boolean', readonly: true, group: 'State', description: 'The simplified clock has run out — the GM resolves the siege' },
        { name: 'assaultBattleId',  type: 'id', idKind: 'battle', readonly: true, group: 'State', description: 'The W3 Battle an assault handed off to' },
        { name: 'notes',            type: 'string', group: 'History' },
        { name: 'history',          type: 'history', readonly: true, group: 'History' }
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
        { name: 'armyId', type: 'id', idKind: 'army', group: 'Participants', description: 'W4 — an ARMY’s march: the army governs speed/weather; no nav throw, no encounter draws, no survival (RR p.448)' },
        // === Voyages V1 (burst4 — 2026-06-14) — surface the reserved blankJourney.shipId (the carrying
        // Vessel; voyage modes). The factory already emits shipId, so the schema⊆factory invariant holds. ===
        { name: 'shipId', type: 'id', idKind: 'vessel', group: 'Participants', description: 'V1 — the carrying Vessel for a voyage-mode journey (Phase 3 Voyages #145); null on land journeys' },
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

    // === Voyages V1 (burst4 — 2026-06-14) — Vessel (Phase 3 Voyages #145, RR Ch.7 Seafarers &
    // Voyages). The Admin verb (Inspector ▸ Create ▸ Vessel → schemaForm + the inspectorCreateBlankVessel
    // dispatch). catalogKey is the picker populated from the 20 RR p.316 VESSEL_CATALOG classes. Every
    // field is a blankVessel key (global schema⊆factory invariant); schemaVersion is factory-only. ===
    'vessel': {
      factory: 'blankVessel',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Class', 'Crew', 'Cargo', 'Condition', 'History'],
      fields: [
        { name: 'id',         type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',       type: 'string', required: true,  group: 'Identity', description: 'Vessel name, e.g. "Sea Wolf"' },
        { name: 'catalogKey', type: 'enum',   group: 'Class', description: 'The RR p.316 Sea Vessels class (immutable stats)',
          enumValues: ['barge-small','barge-large','barge-huge','boat-row','boat-sail','canoe','galley-1-rower','galley-1.5-rower','galley-2-rower','galley-2.5-rower','galley-3-rower','galley-4-rower','galley-5-rower','galley-6-rower','galley-8-rower','longship','raft','sailing-ship-small','sailing-ship-large','sailing-ship-huge'] },
        { name: 'shp',        type: 'number', min: 0, group: 'Class', description: 'Current structural hit points (≤ the class base SHP)' },
        { name: 'ownerId',    type: 'id', idKind: 'character', group: 'Identity', description: 'Owner — a character (the picker) OR a domain (set a domain id via Raw JSON; vesselOwner resolves both)' },
        { name: 'currentHexId', type: 'id', idKind: 'hex', group: 'Identity' },
        { name: 'crewComplement', type: 'object', group: 'Crew', description: 'Current manning vs the class full crew (RR p.316)', fields: [
          { name: 'sailors', type: 'number', min: 0 },
          { name: 'rowers',  type: 'number', min: 0 },
          { name: 'marines', type: 'number', min: 0 }
        ] },
        { name: 'crewGroupIds',        type: 'idArray', idKind: 'group', group: 'Crew', description: 'Counted crew (rowers/sailors/marine units) → campaign.groups[]' },
        { name: 'officerCharacterIds', type: 'idArray', idKind: 'character', group: 'Crew', description: 'Named officers — captain / navigator / master mariner' },
        { name: 'holdStashId', type: 'id', idKind: 'stash', group: 'Cargo', description: 'Cargo hold — a Stash (stashKind:"vessel-hold")' },
        { name: 'warMachines', type: 'array', group: 'Condition', description: 'Fitted naval war machines (RR pp.155–156)', itemSchema: { fields: [
          { name: 'kind', type: 'enum', enumValues: ['naval-ram','boarding-bridge','boarding-ramp','fire-pot-pole','harpoon-ballista','large-tower','small-tower','ballista','catapult','other'] },
          { name: 'note', type: 'string' }
        ] } },
        { name: 'condition',         type: 'enum', enumValues: ['seaworthy','damaged','sinking','beached','wrecked'], group: 'Condition', default: 'seaworthy' },
        { name: 'constructionState', type: 'enum', enumValues: ['planned','under-construction','complete','in-repair'], group: 'Condition', default: 'complete', description: 'complete when bought; a Construction Project drives the lifecycle (Wave D)' },
        { name: 'createdAtTurn', type: 'number', readonly: true, group: 'History' },
        { name: 'history',       type: 'history', readonly: true, group: 'History' }
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
          { name: 'pursuitEncounterId', type: 'id', idKind: 'encounter', description: 'E4m — the chase this band IS (a pursuing band met by a third party); dispersing the meeting ends the chase' },
          { name: 'residentCharacterId', type: 'id', idKind: 'character', description: 'SD-5b — a civilized encounter grounded to the actual townsperson who lives nearby (the census); GM-overridable' },
          { name: 'residentSettlementId', type: 'id', idKind: 'settlement', description: 'SD-5b — the settlement the grounded resident lives in' }
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
    },

    // === Religion R0 (team 2026-06-13 — Phase_4_Religion_Plan.md §4.1–§4.3 + §14) ===
    // Wave E. Every field is a key the matching factory emits (global schema⊆factory
    // invariant in tests/smoke.js). RAW-faithful: DivineFavor has `standing`, NO favorLevel
    // (D1). Polymorphic/deferred shapes (congregation.templeRef, divineFavor.transgressionsLog)
    // are omitted per the Wave-C freeform convention — raw-JSON-edited / owned by R5.
    'deity': {
      factory: 'blankDeity',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Worship', 'History'],
      fields: [
        { name: 'id',                  type: 'string',  readonly: true, group: 'Identity' },
        { name: 'name',                type: 'string',  group: 'Identity', description: 'Generic name, e.g. "the Lawgiver"' },
        { name: 'alignment',           type: 'enum',    enumValues: ['Lawful','Neutral','Chaotic'], group: 'Identity', default: 'Neutral' },
        { name: 'portfolio',           type: 'string',  group: 'Identity', description: 'Free text — "war, the dawn, justice"' },
        { name: 'codeOfBehavior',      type: 'longText', group: 'Worship', description: 'What adherents must uphold (or a Phase 6 code ref)' },
        { name: 'acceptsBloodSacrifice', type: 'enum',  enumValues: ['none','animals-only','sapient'], group: 'Worship', default: 'none', description: 'RR p.422 — Lawful/Neutral → none|animals-only; Chaotic → sapient' },
        { name: 'sacrificeAsDevotion', type: 'boolean', group: 'Worship', description: 'Auran Empyrean rule — animal sacrifice yields the caster nothing (pure devotion)' },
        { name: 'status',              type: 'enum',    enumValues: ['active','dormant'], group: 'Identity', default: 'active' },
        { name: 'notes',               type: 'longText', group: 'History' },
        { name: 'history',             type: 'history', readonly: true, group: 'History' }
      ]
    },

    'congregation': {
      factory: 'blankCongregation',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Faithful', 'Maintenance', 'History'],
      fields: [
        { name: 'id',                    type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',                  type: 'string', group: 'Identity', description: 'e.g. "the Faithful of the Dawn at Saltspur"' },
        { name: 'deityId',               type: 'id', idKind: 'deity', group: 'Identity' },
        { name: 'highPriestCharacterId', type: 'id', idKind: 'character', group: 'Identity', description: 'The divine caster who draws the power' },
        { name: 'personalCongregants',   type: 'number', min: 0, group: 'Faithful', description: 'Proselytized faithful — the full 10gp/50/week rate' },
        { name: 'domainWorshipDomainId', type: 'id', idKind: 'domain', group: 'Faithful', description: 'Ruler/chaplain path; DP from this domain is derived (families × morale), never stored' },
        { name: 'proselytizingValueThisMonthGp', type: 'gp', group: 'Maintenance', description: 'Accumulator → congregant gain at month end' },
        { name: 'maintainedWeeksThisMonth', type: 'number', min: 0, group: 'Maintenance', description: '0..4; un-maintained weeks drive decline' },
        { name: 'lastMaintainedAtTurn',  type: 'number', group: 'Maintenance' },
        { name: 'foundedAtTurn',         type: 'number', group: 'History' },
        { name: 'status',                type: 'enum', enumValues: ['active','declining','abandoned','suppressed'], group: 'Identity', default: 'active' },
        { name: 'history',               type: 'history', readonly: true, group: 'History' }
      ]
    },

    'divineFavor': {
      factory: 'blankDivineFavor',
      adminCreate: 'schemaForm',
      groups: ['Parties', 'Standing', 'History'],
      fields: [
        { name: 'id',                 type: 'string', readonly: true, group: 'Parties' },
        { name: 'characterId',        type: 'id', idKind: 'character', required: true, group: 'Parties' },
        { name: 'deityId',            type: 'id', idKind: 'deity', required: true, group: 'Parties' },
        { name: 'standing',           type: 'enum', enumValues: ['good-standing','lapsed','excommunicate'], group: 'Standing', default: 'good-standing', description: 'RAW relationship state (no numeric score — D1)' },
        { name: 'codeOfBehaviorAck',  type: 'boolean', group: 'Standing', description: 'Does this character uphold the deity\'s code' },
        { name: 'sinceTurn',          type: 'number', group: 'Standing' },
        { name: 'lastSacrificeAtTurn', type: 'number', group: 'Standing' },
        { name: 'lastWorshipAtTurn',  type: 'number', group: 'Standing', description: 'Last pray-and-sacrifice' },
        { name: 'status',             type: 'enum', enumValues: ['active'], group: 'Standing', default: 'active' },
        { name: 'history',            type: 'history', readonly: true, group: 'History' }
      ]
    },
    // === end Religion R0 ===

    // === Hijinks HJ-2 (team 2026-06-13) — the criminal Syndicate (Phase 2.7, RR pp.358–362).
    // Fields ⊆ blankSyndicate keys (the global schema⊆factory invariant). The Admin path. ──
    'syndicate': {
      factory: 'blankSyndicate',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Hideout', 'Membership', 'History'],
      fields: [
        { name: 'id',               type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',             type: 'string', group: 'Identity', description: 'e.g. "The Argollëan Family"' },
        { name: 'bossCharacterId',  type: 'id', idKind: 'character', group: 'Identity', description: 'The boss (analogous to a domain ruler)' },
        { name: 'baseSettlementId', type: 'id', idKind: 'settlement', group: 'Identity', description: 'The urban settlement; its market class caps the syndicate' },
        { name: 'hexId',            type: 'id', idKind: 'hex', group: 'Hideout', description: 'The hideout hex (≤6mi from the base)' },
        { name: 'marketClass',      type: 'enum', enumValues: ['I','II','III','IV','V','VI'], group: 'Hideout', default: 'VI', description: 'Caps size + perpetrator effective level (RR p.359)' },
        { name: 'hideoutType',      type: 'enum', enumValues: ['hideout','guildhouse'], group: 'Hideout', default: 'hideout', description: 'A venturer\'s guildhouse counts at ½ value' },
        { name: 'hideoutValueGp',   type: 'gp', group: 'Hideout', description: 'gp invested; unlocks the membership tier (RR p.359)' },
        { name: 'members',          type: 'array', group: 'Membership', description: 'Members counted by level [{level, count}]',
          itemSchema: { fields: [ { name: 'level', type: 'number', min: 0 }, { name: 'count', type: 'number', min: 0 } ] } },
        { name: 'status',           type: 'enum', enumValues: ['active','disbanded'], group: 'Identity', default: 'active' },
        { name: 'foundedTurn',      type: 'number', group: 'History' },
        { name: 'lastTributeTurn',  type: 'number', readonly: true, group: 'History', description: 'Last monthly tribute collection' },
        { name: 'history',          type: 'history', readonly: true, group: 'History' }
      ]
    },
    // === end Hijinks HJ-2 ===

    // === Sages SG-2 (burst8 b8-sages 2026-06-19) — the multi-week SageCommission (sag-,
    // campaign.sageCommissions[]; Phase_4_Sages_Plan.md §3.3). Fields ⊆ blankSageCommission keys
    // (the global schema⊆factory invariant, tests/smoke.js). resolved (the pre-rolled throw) +
    // result (the delivered envelope) are engine-managed → omitted from the form, raw-JSON-edited
    // (the delve foraysResolved[] precedent). daysElapsed is DERIVED (sageCommissionProgress) off
    // startedAtOrd — no stored mirror, so it is not a field here. adminCreate:'schemaForm' = the
    // generic Admin form (the in-fiction Action verb is the 📜 Commission modal). ──
    'sageCommission': {
      factory: 'blankSageCommission',
      adminCreate: 'schemaForm',
      groups: ['Parties', 'Question', 'Progress', 'History'],
      fields: [
        { name: 'id',                type: 'string', readonly: true, group: 'Parties' },
        { name: 'sageCharacterId',   type: 'id', idKind: 'character', required: true, group: 'Parties', description: 'The consulting sage (an NPC specialist or a PC-scholar)' },
        { name: 'clientCharacterId', type: 'id', idKind: 'character', required: true, group: 'Parties', description: 'Who commissioned the research' },
        { name: 'settlementId',      type: 'id', idKind: 'settlement', group: 'Parties', description: 'Where (the Tower-of-Knowledge POI)' },
        { name: 'subject',           type: 'string', group: 'Question', description: 'Matched vs the sage\'s specialty (in 3+ / out 18+)' },
        { name: 'query',             type: 'longText', group: 'Question', description: 'The GM-framed question (free text)' },
        { name: 'answerText',        type: 'longText', group: 'Question', description: 'Delivered on success (the GM supplies the content; the engine resolves only whether the sage knows)' },
        { name: 'mode',              type: 'string', readonly: true, group: 'Question', description: 'npc-specialist | pc-scholar — resolved at commissioning' },
        { name: 'inSpecialty',       type: 'boolean', readonly: true, group: 'Question' },
        { name: 'target',            type: 'number', readonly: true, group: 'Question', description: 'The resolved throw target (3+/18+ or the PC\'s Knowledge/Loremastery target)' },
        { name: 'daysRequired',      type: 'number', min: 1, group: 'Progress', default: 30, description: 'Research duration (🔧 GM-set; RAW pins none)' },
        { name: 'startedAtOrd',      type: 'number', readonly: true, group: 'Progress', description: 'The day ordinal it began (daysElapsed derives from this — no stored mirror)' },
        { name: 'feeGp',             type: 'gp', group: 'Progress', description: 'The fee (charged upfront, GP Wave B)' },
        { name: 'feePaidGp',         type: 'gp', readonly: true, group: 'Progress' },
        { name: 'status',            type: 'enum', enumValues: ['in-progress','complete','abandoned'], group: 'Progress', default: 'in-progress' },
        { name: 'history',           type: 'history', readonly: true, group: 'History' }
      ]
    },
    // === end Sages SG-2 ===

    // === Delves D2 (burst4) — Dungeon + Delve (Phase_3.5_Delves_Plan.md §4; the RECONCILED shape,
    // Data_Dictionary §13.2). Every field is a key the matching factory emits (the global schema⊆
    // factory invariant, tests/smoke.js). The Dungeon schema covers the BASE + delve-target facet
    // ONLY; the arcane facet (levels/areaSqFtPerLevel/sovereignCharacterId/arcanePowerThisMonth/…)
    // is reserved-null on blankDungeon and ADDED to this schema by Phase 4 Sanctums (AD-A). owned +
    // attuned are NOT status values (Q1) — they're derived via dungeonLifecycleLabel() off
    // ownerCharacterId + the attunement relation. adminCreate:'schemaForm' = the generic Admin form. ──
    'dungeon': {
      factory: 'blankDungeon',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Placement', 'Delve Target', 'Lifecycle', 'History'],
      fields: [
        { name: 'id',                  type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',                type: 'string', group: 'Identity', default: '', description: 'GM label, e.g. "the Ruined Fort of Aelnoth"' },
        { name: 'origin',              type: 'enum', enumValues: ['constructed','natural','found','conquered','lair-promoted'], group: 'Identity', default: 'found' },
        { name: 'knownToPlayers',      type: 'boolean', group: 'Placement', description: 'Discovered by the players?' },
        { name: 'hexId',               type: 'id', idKind: 'hex', group: 'Placement', description: 'The hex it sits in — null = unplaced / unknown distance' },
        { name: 'precisePlacement',    type: 'string', group: 'Placement', description: 'e.g. "the old quarry on the north slope"' },
        { name: 'domainId',            type: 'id', idKind: 'domain', group: 'Placement', description: 'The domain whose territory it lies in (when known)' },
        { name: 'size',                type: 'enum', enumValues: ['small','medium','large','mega'], group: 'Delve Target', default: 'small', description: 'Drives the encounter count (JJ p.275)' },
        { name: 'dungeonLevel',        type: 'number', min: 1, group: 'Delve Target', default: 1, description: 'Difficulty 1..6 (JJ p.275)' },
        { name: 'encountersTotal',     type: 'number', min: 0, group: 'Delve Target', description: 'Rolled from size, or counted from a stocked map' },
        { name: 'encountersRemaining', type: 'number', min: 0, group: 'Delve Target', description: 'Authored for an abstract dungeon; derived from living lairs for a stocked one (dungeonEncountersRemaining)' },
        { name: 'encountersCleared',   type: 'number', min: 0, readonly: true, group: 'Delve Target', description: 'Running, for the treasure/XP tally' },
        { name: 'sizeKnown',           type: 'boolean', group: 'Delve Target', description: 'false ⇒ Unknown Size & Level rule (JJ p.279) — players must scout' },
        { name: 'levelKnown',          type: 'boolean', group: 'Delve Target' },
        { name: 'multiLevel',          type: 'boolean', group: 'Delve Target', description: 'RAW: treat each level as a separate Dungeon' },
        { name: 'parentDungeonId',     type: 'id', idKind: 'dungeon', group: 'Delve Target', description: 'For a multi-level complex — this level\'s parent' },
        { name: 'restockDie',          type: 'string', group: 'Delve Target', description: 'Restock dice (JJ p.276), e.g. "1d3-2"; derived from size' },
        { name: 'status',              type: 'enum', enumValues: ['undiscovered','known','being-cleared','cleared','sealed','abandoned','destroyed'], group: 'Lifecycle', default: 'known', description: 'The single lifecycle axis (Q1); owned/attuned are DERIVED, not stored here' },
        { name: 'ownerCharacterId',    type: 'id', idKind: 'character', group: 'Lifecycle', description: 'Who owns/operates it (RR p.386); set ⇒ the derived "Owned" overlay' },
        { name: 'lastForayAtDayInMonth', type: 'number', readonly: true, group: 'Lifecycle', description: 'Restocking clock' },
        { name: 'lastForayAtTurn',     type: 'number', readonly: true, group: 'Lifecycle' },
        { name: 'establishedAtTurn',   type: 'number', group: 'Lifecycle' },
        { name: 'notes',               type: 'longText', group: 'History' },
        { name: 'history',             type: 'history', readonly: true, group: 'History' }
      ]
    },

    // Delve — the multi-foray clear-a-dungeon operation. foraysResolved[] is an engine-managed
    // deep log (the journey.days[] precedent) — omitted from the schema, raw-JSON-edited; the D3
    // Foray Wizard owns it. Every field below is a blankDelve key.
    'delve': {
      factory: 'blankDelve',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Participants', 'Progress', 'Lifecycle', 'History'],
      fields: [
        { name: 'id',                      type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',                    type: 'string', group: 'Identity', description: 'Auto: "Delve into <dungeon name>"' },
        { name: 'dungeonId',               type: 'id', idKind: 'dungeon', required: true, group: 'Identity' },
        { name: 'status',                  type: 'enum', enumValues: ['in-progress','withdrawn','cleared','wiped'], group: 'Identity', default: 'in-progress' },
        { name: 'partyId',                 type: 'id', idKind: 'party', group: 'Participants', description: 'Optional — participantCharacterIds is the source of truth' },
        { name: 'participantCharacterIds', type: 'idArray', idKind: 'character', group: 'Participants', description: 'The delvers (a foray draws ≤8 from these)' },
        { name: 'isHenchmanDelve',         type: 'boolean', group: 'Participants', description: 'RAW XP/treasure split (JJ p.277)' },
        { name: 'runningEncountersCleared', type: 'number', min: 0, readonly: true, group: 'Progress' },
        { name: 'runningTreasureGp',       type: 'gp', readonly: true, group: 'Progress', description: 'Gross; the ¼-withdraw / full-clear multiplier applies at realize (D3)' },
        { name: 'runningXp',               type: 'number', min: 0, readonly: true, group: 'Progress' },
        { name: 'casualtyCharacterIds',    type: 'idArray', idKind: 'character', group: 'Progress', description: 'Mortally wounded / slain this delve' },
        { name: 'magicItemRollsPending',   type: 'number', min: 0, readonly: true, group: 'Progress', description: 'Computed at clear (Treasure-Type rolls per GP/Roll)' },
        { name: 'startedAtTurn',           type: 'number', group: 'Lifecycle' },
        { name: 'startedAtDayInMonth',     type: 'number', group: 'Lifecycle' },
        { name: 'notes',                   type: 'longText', group: 'History' },
        { name: 'history',                 type: 'history', readonly: true, group: 'History' }
      ]
    },
    // === end Delves D2 ===
    // === Delves D5 (team burst11 2026-06-20) — the SettlementVisit (svt-, campaign.settlementVisits[];
    // Phase_3.5_Delves_Plan.md §4.4). The off-screen settlement-stay record + the urban-incident log.
    // adminCreate:'schemaForm' = the Inspector Admin verb; the in-fiction verb is ACKS.startSettlementVisit
    // (the 🏙 Settlement Visits panel). incidents[] are rolled records (D5 owns the roller) — the
    // itemSchema gives the shape, not a factory. Every top-level field is a blankSettlementVisit key
    // (the schema⊆factory invariant, tests/smoke.js). ──
    'settlementVisit': {
      factory: 'blankSettlementVisit',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Participants', 'Mode', 'Incidents', 'Lifecycle', 'History'],
      fields: [
        { name: 'id',                      type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',                    type: 'string', group: 'Identity', description: 'Optional GM label (else derived from the settlement)' },
        { name: 'settlementId',            type: 'id', idKind: 'settlement', group: 'Identity' },
        { name: 'hexId',                   type: 'id', idKind: 'hex', group: 'Identity', description: "The settlement's hex (incident context + the day-clock)" },
        { name: 'partyId',                 type: 'id', idKind: 'party', group: 'Participants', description: 'Optional — participantCharacterIds is the source of truth' },
        { name: 'participantCharacterIds', type: 'idArray', idKind: 'character', group: 'Participants' },
        { name: 'mode',                    type: 'enum', enumValues: ['holed-up','wandering','looking-for-trouble'], group: 'Mode', default: 'holed-up', description: 'holed-up = the 1/day auto incident check; the others are GM-pressed (JJ p.80)' },
        { name: 'status',                  type: 'enum', enumValues: ['active','departed'], group: 'Mode', default: 'active' },
        // The urban incidents that have occurred — rolled records (D5's rollSettlementIncident owns the shape).
        { name: 'incidents',               type: 'array', group: 'Incidents', description: 'Urban incidents (JJ pp.81–84)', itemSchema: { fields: [
            { name: 'incidentKey',         type: 'string' },
            { name: 'label',               type: 'string' },
            { name: 'category',            type: 'string' },
            { name: 'cite',                type: 'string' },
            { name: 'roll',                type: 'number' },
            { name: 'afterDark',           type: 'boolean' },
            { name: 'dayInMonth',          type: 'number' },
            { name: 'turn',                type: 'number' },
            { name: 'reactionCall',        type: 'boolean' },
            { name: 'tone',                type: 'string' },
            { name: 'diseaseExposure',     type: 'boolean' },
            { name: 'combatRisk',          type: 'boolean' },
            { name: 'rumor',               type: 'boolean' },
            { name: 'rewardGp',            type: 'gp' },
            { name: 'affectedCharacterId', type: 'id', idKind: 'character' },
            { name: 'resolved',            type: 'boolean' },
            { name: 'eventId',             type: 'string' }
          ] } },
        { name: 'arrivedAtTurn',           type: 'number', group: 'Lifecycle' },
        { name: 'arrivedAtDayInMonth',     type: 'number', group: 'Lifecycle' },
        { name: 'departedAtTurn',          type: 'number', group: 'Lifecycle' },
        { name: 'notes',                   type: 'longText', group: 'History' },
        { name: 'history',                 type: 'history', readonly: true, group: 'History' }
      ]
    },
    // === end Delves D5 ===
    // === Phase 4 — The Arcane Domain (Sanctums AD-D) — the Attunement relation (att-,
    // campaign.attunements[]; RR p.387). mage ↔ dungeon, one ACTIVE per dungeon. Every field is a
    // blankAttunement key (the schema⊆factory invariant). adminCreate:'schemaForm' = the generic form;
    // the in-fiction verb is ACKS.attuneToDungeon (the 🔮 Arcane panel). attunementThrow is the conquered-
    // throw record (raw-JSON edited). ──
    'attunement': {
      factory: 'blankAttunement',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Relation', 'Lifecycle', 'History'],
      fields: [
        { name: 'id',                   type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',                 type: 'string', group: 'Identity', description: 'Optional label (the relation describes itself)' },
        { name: 'mageCharacterId',      type: 'id', idKind: 'character', required: true, group: 'Relation', description: 'The attuned arcane caster (subject)' },
        { name: 'dungeonId',            type: 'id', idKind: 'dungeon', required: true, group: 'Relation', description: 'The dungeon (the other end)' },
        { name: 'method',               type: 'enum', enumValues: ['built','conquered'], group: 'Relation', default: 'built', description: 'Auto on completion if built; else the month-residency + throw (RR p.387)' },
        { name: 'ancillaryHoursPerDay', type: 'number', min: 0, group: 'Relation', description: 'RR p.387 — ≥1 hr per 30,000 sq ft each day during the qualifying month' },
        { name: 'attunedAtTurn',        type: 'number', group: 'Lifecycle' },
        { name: 'status',               type: 'enum', enumValues: ['active','relinquished','superseded','lapsed','ended-on-death'], group: 'Lifecycle', default: 'active' },
        { name: 'endedAtTurn',          type: 'number', readonly: true, group: 'Lifecycle' },
        { name: 'history',              type: 'history', readonly: true, group: 'History' }
      ]
    },
    // === Phase 4 — Sanctums AD-B — the Apprenticeship relation (apr-, campaign.apprenticeships[]; RR p.386).
    // Every field is a blankApprenticeship key (the schema⊆factory invariant); lastResearchThrow is a nested
    // object raw-JSON edited + OMITTED here (the attunement-attunementThrow precedent). adminCreate:'schemaForm'
    // = the free-form Admin verb; apprentices normally arrive via attractToSanctum (the Sanctum tab). ──
    'apprenticeship': {
      factory: 'blankApprenticeship',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Relation', 'Study', 'Lifecycle', 'History'],
      fields: [
        { name: 'id',                    type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',                  type: 'string', group: 'Identity', description: 'Optional label (the relation describes itself)' },
        { name: 'apprenticeCharacterId', type: 'id', idKind: 'character', required: true, group: 'Relation', description: 'The L0 apprentice (INT ≥ 9, subject)' },
        { name: 'masterCharacterId',     type: 'id', idKind: 'character', required: true, group: 'Relation', description: 'The sanctum-owning arcane caster' },
        { name: 'sanctumConstructibleId', type: 'id', idKind: 'constructible', group: 'Relation', description: 'The sanctum the apprentice studies at' },
        { name: 'enrolledAtTurn',        type: 'number', group: 'Study' },
        { name: 'yearsStudied',          type: 'number', min: 0, group: 'Study', description: 'A research throw (18+ ± INT) is made each completed year (RR p.386)' },
        { name: 'status',                type: 'enum', enumValues: ['studying','advanced','left'], group: 'Lifecycle', default: 'studying' },
        { name: 'endedAtTurn',           type: 'number', readonly: true, group: 'Lifecycle' },
        { name: 'history',               type: 'history', readonly: true, group: 'History' }
      ]
    },
    // === Phase 4 — Magic Research (AD-M1) — the Research Project (rsp-, campaign.researchProjects[];
    // RR pp.388–393). Every field is a blankResearchProject key (the schema⊆factory invariant); the
    // complex nested objects (config / componentPlan / throwResult / kindResult) are raw-JSON edited +
    // OMITTED here (the attunement-attunementThrow precedent). adminCreate:'schemaForm' = the free-form
    // Admin verb; the guided Action verb is the character-sheet ⚗ Research panel (ACKS.startResearchProject). ──
    'research-project': {
      factory: 'blankResearchProject',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Costs', 'Throw', 'Lifecycle', 'History'],
      fields: [
        { name: 'id',                    type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',                  type: 'string', group: 'Identity', description: 'e.g. "Wand of Fireball"' },
        { name: 'kind',                  type: 'enum', enumValues: ['spell-research','identify','item-creation','construct-design','construct-manufacture','crossbreed','necromancy','ritual-learn','ritual-cast'], group: 'Identity', default: 'spell-research', description: 'AD-M1 ships spell-research / identify / item-creation; the rest land with AD-M2/M3' },
        { name: 'magicDomain',           type: 'enum', enumValues: ['evocation','summoning','enchantment','protection','death','transmog'], group: 'Identity', description: 'For proficiency mods (RR p.389) — nullable' },
        { name: 'researcherCharacterId', type: 'id', idKind: 'character', required: true, group: 'Identity', description: 'The arcane caster leading the project' },
        { name: 'assistantCharacterIds', type: 'idArray', idKind: 'character', group: 'Identity', description: 'Directly-aiding assistants (add their research rate) — RR p.390' },
        { name: 'facilityKind',          type: 'enum', enumValues: ['library','workshop','mortuary','crossbreeding-lab'], group: 'Identity', default: 'library' },
        { name: 'baseCost',              type: 'gp', group: 'Costs' },
        { name: 'componentCostGp',       type: 'gp', group: 'Costs', description: 'Paid at the end in special components (the Sanctums seam, §3)' },
        { name: 'materialCostGp',        type: 'gp', group: 'Costs', description: 'Paid at the start (coin / precious materials)' },
        { name: 'researchCostGp',        type: 'gp', group: 'Costs', description: 'Paid by labor over the duration at the research rate' },
        { name: 'materialPaid',          type: 'boolean', group: 'Costs' },
        { name: 'researchInvestedGp',    type: 'gp', group: 'Costs', description: 'Accrues monthly at the total research rate' },
        { name: 'componentPaid',         type: 'boolean', group: 'Costs' },
        { name: 'substitutionPenalty',   type: 'number', readonly: true, group: 'Throw', description: 'Derived from the component plan (RR p.388)' },
        { name: 'needsThrow',            type: 'boolean', group: 'Throw', default: true, description: 'False = duplicating a common spell / working from a formula' },
        { name: 'fromFormula',           type: 'boolean', group: 'Throw' },
        { name: 'fromSample',            type: 'boolean', group: 'Throw', description: '+4 to the throw (RR p.388)' },
        { name: 'status',                type: 'enum', enumValues: ['planning','in-progress','awaiting-throw','completed','failed','abandoned'], group: 'Lifecycle', default: 'planning' },
        { name: 'startedOnTurn',         type: 'number', group: 'Lifecycle' },
        { name: 'completedOnTurn',       type: 'number', readonly: true, group: 'Lifecycle' },
        { name: 'history',               type: 'history', readonly: true, group: 'History' }
      ]
    },
    // === Politics P-1 (burst4 2026-06-13) — senate / faction / senatorship (RR pp.355–360;
    // Phase_4_Politics_Plan.md §4). Every field ⊆ the matching blankX keys (the global schema⊆
    // factory invariant). rulingFactionId/leadingFactionId + faction ruling/leading standing are
    // DERIVED (§4.4 — senateRulingFactionId / factionStanding) and so are NOT schema fields. ──
    'senate': {
      factory: 'blankSenate',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Composition', 'Requirements of Office', 'State', 'History'],
      fields: [
        { name: 'id',            type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',          type: 'string', group: 'Identity', description: 'e.g. "Senate of Aura"' },
        { name: 'realmDomainId', type: 'id', idKind: 'domain', group: 'Identity', description: 'The realm apex (a domain with no liege) the senate sits on' },
        { name: 'kind',          type: 'enum', enumValues: ['senate','eldermoot','council'], group: 'Identity', default: 'senate', description: 'Eldermoot reuses this scaffolding (Dwarven seam)' },
        { name: 'seats',         type: 'number', min: 0, group: 'Composition', description: 'Total vote pool (RR p.357 size-of-the-senate table)' },
        { name: 'minSenatorLevel', type: 'number', group: 'Composition', description: 'Min level to sit — inverse to seat count (RR p.357)' },
        { name: 'independentMinorSenatorVotes', type: 'number', min: 0, group: 'Composition', description: 'Anonymous remainder — leading influence + this = seats (RR p.357)' },
        { name: 'requirementsOfOffice', type: 'object', group: 'Requirements of Office', description: 'The in-world bar + the bribe-cost-by-period row (RR p.357)', fields: [
          { name: 'minLevel',        type: 'number' },
          { name: 'title',           type: 'string', description: 'Baron / Viscount / Count / Duke / Prince' },
          { name: 'netWorthGp',      type: 'gp' },
          { name: 'landDescription', type: 'string', description: 'e.g. "2 × 6-mile hexes"' },
          { name: 'families',        type: 'number' },
          { name: 'bribeCostDay',    type: 'gp' },
          { name: 'bribeCostWeek',   type: 'gp' },
          { name: 'bribeCostMonth',  type: 'gp' },
          { name: 'bribeCostYear',   type: 'gp' }
        ] },
        { name: 'establishedAtTurn',  type: 'number', group: 'State' },
        { name: 'honeymoonUntilTurn', type: 'number', group: 'State', description: 'RR p.357 — the 1d6-month all-vote-for window for an adventurer-established senate' },
        { name: 'dispute', type: 'object', group: 'State', description: 'Non-null suspends all senate benefits until resolved (RR p.359)', fields: [
          { name: 'defiedTopic', type: 'string' },
          { name: 'sinceTurn',   type: 'number' },
          { name: 'attempts',    type: 'number' }
        ] },
        { name: 'status',  type: 'enum', enumValues: ['active','in-dispute','dissolved'], group: 'State', default: 'active' },
        { name: 'history', type: 'history', readonly: true, group: 'History' }
      ]
    },

    'faction': {
      factory: 'blankFaction',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Platform', 'History'],
      fields: [
        { name: 'id',              type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',            type: 'string', group: 'Identity', description: 'e.g. "The Optimates"' },
        { name: 'senateId',        type: 'id', idKind: 'senate', group: 'Identity', description: 'The senate this faction operates in (nullable — generic factions allowed)' },
        { name: 'realmDomainId',   type: 'id', idKind: 'domain', group: 'Identity' },
        { name: 'platform',        type: 'longText', group: 'Platform', description: 'Free-text platform summary' },
        { name: 'policyObjectives', type: 'enumMulti', enumValues: ['overland-trade-routes','maritime-trade-routes','increase-army','decrease-army','increase-navy','decrease-navy','replace-ruler','preserve-ruler','conquer-neighbor','make-peace','build-border-strongholds','decrease-peasant-taxes','increase-peasant-taxes','eliminate-or-institute-slavery','redistribute-land-to-peasants','support-existing-faith','introduce-new-faith','grow-urban-settlements','grow-personal-realm','gain-merchandise-monopolies'], group: 'Platform', description: 'The 1d20 objective taxonomy (RR p.357)' },
        { name: 'kind',            type: 'enum', enumValues: ['ruling','leading','opposition','minor'], group: 'Identity', default: 'minor', description: 'GM stance; the LIVE ruling/leading standing is derived (ACKS.factionStanding)' },
        { name: 'status',          type: 'enum', enumValues: ['active','dissolved'], group: 'Identity', default: 'active' },
        { name: 'history',         type: 'history', readonly: true, group: 'History' }
      ]
    },

    'senatorship': {
      factory: 'blankSenatorship',
      adminCreate: 'schemaForm',
      groups: ['Parties', 'Influence', 'Disposition', 'Lifecycle', 'History'],
      fields: [
        { name: 'id',                  type: 'string', readonly: true, group: 'Parties' },
        { name: 'senatorCharacterId',  type: 'id', idKind: 'character', required: true, group: 'Parties', description: 'The senator' },
        { name: 'senateId',            type: 'id', idKind: 'senate', required: true, group: 'Parties' },
        { name: 'factionId',           type: 'id', idKind: 'faction', group: 'Parties', description: 'Nullable — an independent leading senator' },
        { name: 'rank',                type: 'enum', enumValues: ['leading','minor'], group: 'Influence', default: 'leading', description: 'leading = named NPC; minor = usually anonymous (senate.independentMinorSenatorVotes)' },
        { name: 'votes',               type: 'number', min: 0, group: 'Influence', description: 'Influence — the votes this seat controls (RR p.357)' },
        { name: 'policyObjectives',    type: 'enumMulti', enumValues: ['overland-trade-routes','maritime-trade-routes','increase-army','decrease-army','increase-navy','decrease-navy','replace-ruler','preserve-ruler','conquer-neighbor','make-peace','build-border-strongholds','decrease-peasant-taxes','increase-peasant-taxes','eliminate-or-institute-slavery','redistribute-land-to-peasants','support-existing-faith','introduce-new-faith','grow-urban-settlements','grow-personal-realm','gain-merchandise-monopolies'], group: 'Influence', description: '1d3 secret objectives (RR p.357)' },
        { name: 'attitudeTowardRuler', type: 'number', group: 'Disposition', description: '2–12 running disposition — the vote baseline' },
        { name: 'isSecretInfluence',   type: 'boolean', group: 'Disposition', description: 'RAW: influence + objectives secret until revealed (RR p.357)' },
        { name: 'bribeCostByPeriod',   type: 'object', group: 'Influence', description: 'Bribe cost per income period (from the requirements-of-office row, RR p.357)', fields: [
          { name: 'day',   type: 'gp' },
          { name: 'week',  type: 'gp' },
          { name: 'month', type: 'gp' },
          { name: 'year',  type: 'gp' }
        ] },
        { name: 'influenceModifiers',  type: 'array', group: 'Influence', description: 'Standing pre-vote modifiers — bribed/intimidated/seduced/owes-favor (P-4 writes these)', itemSchema: { fields: [
          { name: 'source',        type: 'string', description: 'bribe | intimidate | seduce | gift | owes-favor' },
          { name: 'kind',          type: 'string', description: 'favorable | unfavorable' },
          { name: 'value',         type: 'number' },
          { name: 'sinceTurn',     type: 'number' },
          { name: 'byCharacterId', type: 'id', idKind: 'character' }
        ] } },
        { name: 'seatedAtTurn',  type: 'number', group: 'Lifecycle' },
        { name: 'vacatedAtTurn', type: 'number', group: 'Lifecycle', description: 'Set on vacating — null while active' },
        { name: 'status',        type: 'enum', enumValues: ['active','vacated'], group: 'Lifecycle', default: 'active' },
        { name: 'history',       type: 'history', readonly: true, group: 'History' }
      ]
    },
    // === end Politics P-1 ===

    // === Gladiators G1 (b5-gladiators, burst5 2026-06-14) — AXIOMS 4 (#150). Bout / Gladiator
    // School / Game. adminCreate:'schemaForm' = the generic Admin form (the inspectorCreateBlank*
    // dispatch spawns a blank + opens this edit). Every field ⊆ the matching blankX keys (the global
    // schema⊆factory invariant, tests/smoke.js). Deep/engine-written records are omitted (raw-JSON
    // edited): bout.result (the resolver's output), school.uprisingState (G4 transient). The gladiator
    // is a Character (socialTier:'gladiator') — not in FIELD_SCHEMAS (the character sheet owns it). ──
    'bout': {
      factory: 'blankBout',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Combatants', 'Stakes', 'State', 'History'],
      fields: [
        { name: 'id',     type: 'string', readonly: true, group: 'Identity' },
        { name: 'gameId', type: 'id', idKind: 'game', group: 'Identity', description: 'The Game/Munus this bout belongs to (null for a one-off)' },
        { name: 'kind',   type: 'enum', enumValues: ['to-incapacitation','to-death'], group: 'Identity', default: 'to-incapacitation', description: 'A death-bout rents at 2× (RR/AXIOMS 4 p.20)' },
        { name: 'sideA',  type: 'object', group: 'Combatants', description: 'One side of the bout', fields: [
          { name: 'combatantIds', type: 'idArray', idKind: 'character', description: 'Gladiator Character ids (creature/prisoner ids for those side kinds)' },
          { name: 'kind',         type: 'enum', enumValues: ['gladiator','creature','prisoner'] }
        ] },
        { name: 'sideB',  type: 'object', group: 'Combatants', description: 'The other side', fields: [
          { name: 'combatantIds', type: 'idArray', idKind: 'character', description: 'Gladiator Character ids (creature/prisoner ids for those side kinds)' },
          { name: 'kind',         type: 'enum', enumValues: ['gladiator','creature','prisoner'] }
        ] },
        { name: 'rentPaidGp',     type: 'gp', group: 'Stakes', description: 'What the munerator paid to field these combatants' },
        { name: 'resolutionMode', type: 'enum', enumValues: ['abstract','combat'], group: 'Stakes', default: 'abstract', description: 'abstract = the 1d10 resolver (p.25); combat = the round-by-round path (Combat-Option-B, G5)' },
        { name: 'status',         type: 'enum', enumValues: ['scheduled','resolved'], group: 'State', default: 'scheduled' },
        { name: 'createdAtTurn',  type: 'number', readonly: true, group: 'State' },
        { name: 'notes',          type: 'string', group: 'History' },
        { name: 'history',        type: 'history', readonly: true, group: 'History' }
      ]
    },

    'gladiator-school': {
      factory: 'blankGladiatorSchool',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Roster', 'Facilities', 'State', 'History'],
      fields: [
        { name: 'id',                 type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',               type: 'string', group: 'Identity', description: 'e.g. "Ludus Magnus"' },
        { name: 'lanistaCharacterId', type: 'id', idKind: 'character', group: 'Identity', description: 'The owner (the "lanista" role)' },
        { name: 'settlementId',       type: 'id', idKind: 'settlement', group: 'Identity', description: 'Where it operates (≤1 gladiator / 150 families)' },
        { name: 'gladiatorCharacterIds',     type: 'idArray', idKind: 'character', group: 'Roster', description: 'The gladiators (Characters, socialTier:gladiator)' },
        { name: 'staffCharacterIds',         type: 'idArray', idKind: 'character', group: 'Roster', description: 'Trainers / guards / healers / handlers (hirelings)' },
        { name: 'structureConstructibleIds', type: 'idArray', idKind: 'constructible', group: 'Facilities', description: 'The school buildings (Constructibles)' },
        { name: 'treasuryStashId',    type: 'id', idKind: 'stash', group: 'Facilities', description: "The school's coffers (a Stash)" },
        { name: 'status',             type: 'enum', enumValues: ['active','disbanded'], group: 'State', default: 'active' },
        { name: 'foundedAtTurn',      type: 'number', readonly: true, group: 'State' },
        { name: 'notes',              type: 'string', group: 'History' },
        { name: 'history',            type: 'history', readonly: true, group: 'History' }
      ]
    },

    'game': {
      factory: 'blankGame',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Venue', 'Schedule', 'State', 'History'],
      fields: [
        { name: 'id',                          type: 'string', readonly: true, group: 'Identity' },
        { name: 'name',                        type: 'string', group: 'Identity', description: 'The munus name, e.g. "Funeral Games for Lord Aelric"' },
        { name: 'muneratorCharacterId',        type: 'id', idKind: 'character', group: 'Identity', description: 'The sponsor (a role; often the settlement ruler / Munerator magistrate)' },
        { name: 'settlementId',                type: 'id', idKind: 'settlement', group: 'Venue', description: "Where it's held (the amphitheater's settlement)" },
        { name: 'amphitheaterConstructibleId', type: 'id', idKind: 'constructible', group: 'Venue', description: 'The amphitheater (a Constructible)' },
        { name: 'budgetGp',                    type: 'gp', group: 'Schedule', description: '≥ 0.5gp / urban family (the festival/liturgy expense, p.22)' },
        { name: 'scheduledTurn',               type: 'number', group: 'Schedule', description: 'Light G1 scheduling hook (the full calendar-date scheduling is G4)' },
        { name: 'boutIds',                     type: 'idArray', idKind: 'bout', group: 'Schedule', description: '≤12 bouts per day (p.22)' },
        { name: 'status',                      type: 'enum', enumValues: ['planned','held'], group: 'State', default: 'planned' },
        { name: 'createdAtTurn',               type: 'number', readonly: true, group: 'State' },
        { name: 'notes',                       type: 'string', group: 'History' },
        { name: 'history',                     type: 'history', readonly: true, group: 'History' }
      ]
    },
    // === end Gladiators G1 ===
    // === Custom Classes & Races W1 (b5-custom-classes, team burst5) — #154 / Phase_6_Custom_Classes_Plan.md §3.
    // The two catalog/template entities (acks-engine-custom-classes.js). adminCreate:'schemaForm' = the
    // generic Inspector Admin form (the two-verb Admin path; the point-buy Class/Race Builder is W4). Every
    // field is a blankClassTemplate / blankRaceTemplate key (the global schema⊆factory invariant); the
    // _derived stat-block cache + the array choices (weaponSelection/thiefSkills) + the dynamic-key race maps
    // are Raw-JSON-edited in W1 (omitted here — schema⊆factory allows omission). The derived stat block is
    // read via ACKS.deriveClassFromTemplate (the Builder surfaces it live in W4). ──
    'custom-class': {
      factory: 'blankClassTemplate',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Build Points', 'Choices', 'Powers', 'Meta', 'History'],
      fields: [
        { name: 'id',              type: 'string', readonly: true, group: 'Identity' },
        { name: 'key',             type: 'string', group: 'Identity', description: 'Stable key (e.g. "fighter"); resolves character.class strings (W5)' },
        { name: 'displayName',     type: 'string', required: true, group: 'Identity', description: 'Class name — a renameable display string (IP: campaign-class names trend toward Product Identity)' },
        { name: 'raceTemplateKey', type: 'id', idKind: 'custom-race', group: 'Identity', description: 'A RaceTemplate.key, or null for a human class' },
        { name: 'buildPoints',     type: 'object', group: 'Build Points', description: 'The point-buy allocation across the five core categories (JJ pp.290–296). A racial value is buildPoints[raceKey] (Raw JSON in W1).', fields: [
          { name: 'hd',       type: 'number', min: 0, max: 4, description: 'Hit Dice value (d4–d12)' },
          { name: 'fighting', type: 'number', min: 0, max: 4, description: 'Fighting value (1 splits 1a/1b via fightingSubtype)' },
          { name: 'thievery', type: 'number', min: 0, max: 4 },
          { name: 'divine',   type: 'number', min: 0, max: 4 },
          { name: 'arcane',   type: 'number', min: 0, max: 4 }
        ] },
        { name: 'fightingSubtype', type: 'enum', enumValues: ['1a', '1b'], group: 'Build Points', description: 'Only at Fighting 1: 1a = crusader-style (narrow + heavy), 1b = thief-style (broad + light)' },
        { name: 'choices',         type: 'object', group: 'Choices', fields: [
          { name: 'primeRequisite',           type: 'enum', enumValues: ['STR', 'INT', 'WIL', 'DEX', 'CON', 'CHA'] },
          { name: 'coreClassMapping',         type: 'enum', enumValues: ['fighter', 'crusader', 'thief', 'mage', 'explorer', 'venturer'], description: 'Generators bucket (JJ p.214) — OVERRIDE; else derives from the save progression' },
          { name: 'strongholdType',           type: 'string', description: 'Castle / Sanctum / Hideout / Vault / Fastness / Cloister / Fortified-Church (JJ p.298)' },
          { name: 'armorTradeOff',            type: 'string' },
          { name: 'saveProgressionTieBreak',  type: 'string' },
          { name: 'spellListKey',             type: 'string', description: 'A magic category selects a spell list (→ the Magic-layer Spells lane #151)' },
          { name: 'weaponTradeOffPowerCount', type: 'number', min: 0, description: 'Powers gained from weapon trade-offs (+250 XP each at Fighting ≥2)' }
        ] },
        { name: 'customPowers',    type: 'array', group: 'Powers', description: 'Custom powers (free-text names + weight + unlock level — survey §8)', itemSchema: { fields: [
          { name: 'name',         type: 'string' },
          { name: 'powerWeight',  type: 'number' },
          { name: 'levelUnlocked', type: 'number' },
          { name: 'pageRef',      type: 'string' }
        ] } },
        { name: 'customDrawbacks', type: 'array', group: 'Powers', description: 'Custom drawbacks — negative powers that buy extra powers (JJ p.329; W2)', itemSchema: { fields: [
          { name: 'name',        type: 'string' },
          { name: 'powerWeight', type: 'number' }
        ] } },
        { name: 'maxLevel',        type: 'number', min: 1, group: 'Meta', description: 'RAW level cap (humans 14; racials per the build-points→cap table — W3)' },
        { name: 'rarity',          type: 'enum', enumValues: ['common', 'uncommon', 'rare', 'legendary'], group: 'Meta', description: 'Henchman-availability + generator frequency (the Generators seam)' },
        { name: 'isSeed',          type: 'boolean', readonly: true, group: 'Meta', description: 'A shipped RAW seed class vs a GM-authored one' },
        { name: 'history',         type: 'history', readonly: true, group: 'History' }
      ]
    },

    'custom-race': {
      factory: 'blankRaceTemplate',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Build', 'Generators', 'Meta', 'History'],
      fields: [
        { name: 'id',              type: 'string', readonly: true, group: 'Identity' },
        { name: 'key',             type: 'string', group: 'Identity', description: 'Stable key (e.g. "dwarf")' },
        { name: 'displayName',     type: 'string', required: true, group: 'Identity' },
        { name: 'racialValueTable', type: 'array', group: 'Build', description: 'Value 0–4 → racial powers + XP cost (JJ pp.299–305; sparse in W1 — the full table + deriveRaceCost is W3)', itemSchema: { fields: [
          { name: 'value',  type: 'number' },
          { name: 'xpCost', type: 'number' }
        ] } },
        { name: 'hitDiceByCombatantStatus', type: 'object', group: 'Generators', description: 'The ¼/½/1-1/1 ladder (JJ p.252 — the NPC-Generator seam)', fields: [
          { name: 'noncombatant', type: 'number' },
          { name: 'commoner',     type: 'number' },
          { name: 'militia',      type: 'string' },
          { name: 'fighter',      type: 'number' }
        ] },
        { name: 'ageModifierDice', type: 'string', group: 'Generators', description: 'e.g. "+2d8" (dwarf), "+2d20" (elf), "ageless" (nobiran) — the NPC-Generator seam' },
        { name: 'isMonstrous',     type: 'boolean', group: 'Meta' },
        { name: 'isSeed',          type: 'boolean', readonly: true, group: 'Meta' },
        { name: 'history',         type: 'history', readonly: true, group: 'History' }
        // abilityRequirements / categoryModifiers / afterEighthIncrement are dynamic-key maps —
        // Raw-JSON-edited in W1 (the Race Builder W3 surfaces them); omitted here (schema⊆factory).
      ]
    },

    // === Banking (team b7 2026-06-19) — Banking & Loans B1 (#148; RR p.42 + p.313). Every field is
    // a blankLoan / blankBankAccount key (the global schema⊆factory invariant). creditor/debtor/
    // collateral/owner/custodian default null in the factory, so their object sub-fields are not
    // cross-checked (smoke.js only checks a non-null factory object). ventureId/fdObligationId are
    // reserved (B5/B2) and intentionally omitted from the Inspector schema. ──
    'loan': {
      factory: 'blankLoan',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Counterparties', 'Terms', 'Lifecycle'],
      fields: [
        { name: 'id',     type: 'string', readonly: true, group: 'Identity' },
        { name: 'kind',   type: 'enum', enumValues: ['commercial','personal','feudal'], group: 'Identity', description: 'commercial = RR p.42 Access to Capital; personal = a PC↔PC loan; feudal = the F&D liege↔vassal loan (B2 reconcile)' },
        { name: 'creditor', type: 'object', group: 'Counterparties', description: 'The lender — a bank/merchant-guild (off-campaign capital) or a character/domain', fields: [
          { name: 'kind',  type: 'string', description: "'character' | 'domain' | 'bank' | 'merchant-guild'" },
          { name: 'id',    type: 'string', description: 'character/domain id (omit for a bank)' },
          { name: 'label', type: 'string' }
        ] },
        { name: 'debtor', type: 'object', group: 'Counterparties', description: 'The borrower', fields: [
          { name: 'kind', type: 'string', description: "'character' | 'domain'" },
          { name: 'id',   type: 'string' }
        ] },
        { name: 'principalGp',         type: 'gp', group: 'Terms', description: 'The original advance' },
        { name: 'balanceGp',           type: 'gp', group: 'Terms', description: 'Current outstanding (interest capitalizes onto this when unpaid)' },
        { name: 'interestRateMonthly', type: 'number', group: 'Terms', description: 'RR p.42 — 0.03 uncollateralized / 0.01 collateralized' },
        { name: 'collateral', type: 'object', group: 'Terms', description: 'null for an uncollateralized loan', fields: [
          { name: 'kind',        type: 'string' },
          { name: 'label',       type: 'string' },
          { name: 'stashItemId', type: 'string' }
        ] },
        { name: 'marketSettlementId',  type: 'id', idKind: 'settlement', group: 'Terms', description: 'The market the credit was drawn in (capital-pool accounting, RR p.42)' },
        { name: 'status',              type: 'enum', enumValues: ['offered','active','repaid','defaulted','written-off'], group: 'Lifecycle' },
        { name: 'contractedAtTurn',    type: 'number', group: 'Lifecycle' },
        { name: 'settledAtTurn',       type: 'number', group: 'Lifecycle', description: 'Set when repaid/written-off — null while active' },
        { name: 'missedInterestTurns', type: 'number', group: 'Lifecycle', description: 'Consecutive months interest went unpaid (RR p.42)' },
        { name: 'disreputable',        type: 'boolean', group: 'Lifecycle', description: 'Unpaid interest built up → loses Mercantile-network powers (RR p.42)' },
        { name: 'debtOverXp',          type: 'boolean', group: 'Lifecycle', description: 'Balance exceeds the debtor’s XP → bounty-hunter pursuit (RR p.42; flag only in B1)' },
        { name: 'history',             type: 'history', readonly: true, group: 'Lifecycle' }
      ]
    },

    'bankAccount': {
      factory: 'blankBankAccount',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Ownership', 'Terms', 'Lifecycle'],
      fields: [
        { name: 'id', type: 'string', readonly: true, group: 'Identity' },
        { name: 'owner', type: 'object', group: 'Ownership', description: 'The depositor', fields: [
          { name: 'kind', type: 'string', description: "'character' | 'domain' | 'party'" },
          { name: 'id',   type: 'string' }
        ] },
        { name: 'custodian', type: 'object', group: 'Ownership', description: 'The bank / merchant-guild holding the funds', fields: [
          { name: 'kind',               type: 'string', description: "'bank' | 'merchant-guild'" },
          { name: 'label',              type: 'string' },
          { name: 'marketSettlementId', type: 'string' }
        ] },
        { name: 'balanceGp',                   type: 'gp', group: 'Terms' },
        { name: 'custodyFeePctAtConsignment',  type: 'number', group: 'Terms', description: 'RR p.313 — 0.10 at heir-consignment; 0 for a working account' },
        { name: 'depositInterestRateMonthly',  type: 'number', group: 'Terms', description: 'Off by default (no RAW deposit interest); set > 0 to credit a monthly return' },
        { name: 'marketSettlementId',          type: 'id', idKind: 'settlement', group: 'Terms' },
        { name: 'status',                      type: 'enum', enumValues: ['open','closed','forfeited'], group: 'Lifecycle' },
        { name: 'history',                     type: 'history', readonly: true, group: 'Lifecycle' }
      ]
    },

    // === Banking B4/B5 (team burst9 2026-06-20) — the letter of credit (loc-): the inter-market draw
    // primitive. Fields ⊆ blankLetterOfCredit keys (the schema⊆factory invariant). ===
    'letterOfCredit': {
      factory: 'blankLetterOfCredit',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Parties', 'Terms', 'Lifecycle'],
      fields: [
        { name: 'id',              type: 'string', readonly: true, group: 'Identity' },
        { name: 'sourceAccountId', type: 'id', idKind: 'bankAccount', group: 'Identity', description: 'The bank account the letter is drawn against' },
        { name: 'issuer', type: 'object', group: 'Parties', description: 'Who drew it (the account owner)', fields: [
          { name: 'kind', type: 'string', description: "'character' | 'domain' | 'party'" },
          { name: 'id',   type: 'string' }
        ] },
        { name: 'bearer', type: 'object', group: 'Parties', description: 'Who may redeem it (default = the issuer)', fields: [
          { name: 'kind', type: 'string', description: "'character' | 'domain' | 'party'" },
          { name: 'id',   type: 'string' }
        ] },
        { name: 'faceValueGp',               type: 'gp', group: 'Terms', description: 'The amount drawable at the destination market' },
        { name: 'issueFeeGp',                type: 'gp', group: 'Terms', description: 'The one-time issue fee (a reasoned tooling number, not a RAW fee)' },
        { name: 'issuingMarketSettlementId', type: 'id', idKind: 'settlement', group: 'Terms', description: 'Where it was drawn (the account’s market)' },
        { name: 'drawingMarketSettlementId', type: 'id', idKind: 'settlement', group: 'Terms', description: 'Where it is redeemable (a different market; RR p.42 capital pool gates the draw)' },
        { name: 'status',                    type: 'enum', enumValues: ['outstanding','redeemed','cancelled'], group: 'Lifecycle' },
        { name: 'issuedAtTurn',              type: 'number', group: 'Lifecycle' },
        { name: 'settledAtTurn',             type: 'number', group: 'Lifecycle', description: 'Set when redeemed/cancelled — null while outstanding' },
        { name: 'history',                   type: 'history', readonly: true, group: 'Lifecycle' }
      ]
    },
    // === Knowledge Layer Wave A (team burst7 2026-06-19) — Lore fact. The per-knower Knowledge
    // relation (knw-) is accessor-only (surfaced via the Knowledge tab + loreKnownBy), NOT Inspector-
    // edited, so no schema for it. subjectIds + qualityDimensions are mixed-kind / freeform arrays —
    // Raw-JSON-edited, omitted here per the schema⊆factory rule (the custom-race precedent above). ===
    'lore': {
      factory: 'blankLore',
      adminCreate: 'schemaForm',
      groups: ['Identity', 'Fact', 'Provenance', 'History'],
      fields: [
        { name: 'id',                   type: 'string',   readonly: true, group: 'Identity' },
        { name: 'topic',                type: 'string',   group: 'Identity', description: 'A short subject tag for grouping/search' },
        { name: 'text',                 type: 'longText', required: true, group: 'Fact', description: 'The fact as stated (the TRUE statement of it)' },
        { name: 'loreKind',             type: 'enum', enumValues: ['fact','rumor','secret','identity'], group: 'Fact', default: 'fact' },
        { name: 'truthValue',           type: 'enum', enumValues: ['true','false','partial','unknown'], group: 'Fact', default: 'unknown', description: 'Is the statement actually true in the world?' },
        { name: 'createdByCharacterId', type: 'id', idKind: 'character', group: 'Provenance', description: 'Who first recorded it (optional)' },
        { name: 'createdAtTurn',        type: 'number',   readonly: true, group: 'Provenance' },
        { name: 'notes',                type: 'string',   group: 'Fact' },
        { name: 'history',              type: 'history',  readonly: true, group: 'History' }
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
