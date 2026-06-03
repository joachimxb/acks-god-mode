/* =============================================================================
 * acks-engine-events.js — ACKS God Mode Typed-Event System (Module 3)
 *
 * Extracted from acks-engine.js §9.5 on 2026-05-28 as part of the engine-split.
 * Contains: kind catalog, status lifecycle, payload schemas, submitter
 * conventions, event factory, validator, query helpers, apply-order sort,
 * applyEvent dispatch, registerEventHandler, lazy migration, and all
 * registered event handlers (player-plan, gm-fiat, treasury-grant, treasury-debit,
 * character-update, adventure-result, daw-result, venture-result, claude-event,
 * engine-standard-turn, character-level-up, character-death, passive-investment-*,
 * venture-launch).
 *
 * The handlers need newId + various factories from acks-engine.js. They are
 * accessed via local aliases pointing at global.ACKS at runtime.
 *
 * Load order: AFTER acks-engine-catalogs.js, AFTER acks-engine.js so engine
 * helpers are available when handlers run.
 * =============================================================================
 */
(function(global){
'use strict';

// Aliases for engine helpers consumed by event handlers at runtime.
const newId               = function(...a){ return global.ACKS.newId(...a); };
const addRumorReach       = function(...a){ return global.ACKS.addRumorReach ? global.ACKS.addRumorReach(...a) : undefined; };
const blankCharacter      = function(...a){ return global.ACKS.blankCharacter(...a); };
const blankParty          = function(...a){ return global.ACKS.blankParty(...a); };
const blankPassiveInvestment = function(...a){ return global.ACKS.blankPassiveInvestment(...a); };
const blankVenture        = function(...a){ return global.ACKS.blankVenture(...a); };
const bankersRound        = function(...a){ return global.ACKS.bankersRound(...a); };
// settlementsForDomain lives in acks-engine.js; the adventure-result handler resolves
// the nearest settlement for treasure/rumor placement. Missing alias made the handler
// throw under strict Node (the live tool tolerated it via the window.ACKS global) —
// caught by the turn-cycle smoke after the 2026-05-28 module split. (Foundation audit fix.)
const settlementsForDomain = function(...a){ return global.ACKS.settlementsForDomain ? global.ACKS.settlementsForDomain(...a) : []; };
const SCHEMA_VERSION = 2; // mirror of acks-engine.js core constant
const ID_PREFIXES = new Proxy({}, { get(_, key){ return (global.ACKS.ID_PREFIXES||{})[key]; } });

// =============================================================================
// 9.5 TYPED-EVENT SYSTEM (Turn Cycle v2 — Foundation #178)
// =============================================================================
// See Turn_Cycle_v2_Plan.md for the architectural design.
//
// Vocabulary:
//   - "Event" is a typed intent submitted by any author (GM, player, tool, AI agent)
//     that proposes a change to world state. Events live in campaign.pendingEvents
//     until reviewed by the GM at Advance Month, then move to campaign.eventLog.
//   - The engine never auto-applies events. The GM is always the ratifier.
//   - applyEvent(campaign, event) is the single mutation primitive. Companion tools
//     and the UI both go through it.
//
// Adding a new event kind:
//   1. Append the kind string to EVENT_KINDS.
//   2. Add a payload schema entry to EVENT_SCHEMAS.
//   3. Add a handler function and register it in EVENT_HANDLERS.
//   4. Document in Data_Dictionary.md and Integration_Guide.md.

// 9.5.1 — Kind catalog. Frozen. Adding a kind is non-breaking; removing one is
// a major schema bump.
const EVENT_KINDS = Object.freeze([
  'player-plan',
  'gm-fiat',
  'treasury-grant',
  'treasury-debit',
  'character-update',
  'adventure-result',
  'daw-result',
  'claude-event',
  'rumor-emit',
  'venture-result',
  'population-shock',
  'domain-transfer',
  'engine-standard-turn',
  // Phase 2.95 — Hirelings & Loyalty
  'recruit-hireling',
  'loyalty-check',
  'hireling-calamity',
  'hireling-restored',
  // Foundation #234 — typed events for previously un-typed operations. Surfaced
  // when collapsing the parallel campaign.log[] into a derived view of eventLog.
  'character-level-up',          // covers both engine auto-leveling and GM-forced level-ups
  'character-death',             // soft-delete / retirement
  'passive-investment-create',   // new passive investment registered to the campaign
  'passive-investment-delete',   // existing passive investment removed
  'venture-launch',               // in-transit venture begins; venture-result covers completion/abort
  // Phase 4 Construction Wave A (Architecture.md §10.7 — 2026-05-30) — 7 event kinds
  'construction-project-started',
  'construction-progress',
  'construction-completed',
  'construction-vagary',
  'construction-damaged',
  'construction-repair-started',
  'construction-demolished',
  // Phase 2.5 Journeys (#475 — J1) — overland travel day-tick events. Engine-emitted
  // (day-tick consumer + startJourney); opted out of the Event Wizard below.
  'journey-start',
  'journey-day-tick',
  'journey-arrived',
  'journey-lost',
  'journey-resupply',
  'journey-encounter',
  'journey-aborted',
  'journey-rerouted',
  // #551 Wave Entity-B (2026-05-31) — Chronicle Entry freeform GM narrative
  'gm-narrative'
]);

// 9.5.2 — Status lifecycle. Events progress pending → accepted/rejected → applied (or stay rejected).
// "superseded" handles the conflict policy (Decision 6 in plan §12): later event overrides earlier.
const EVENT_STATUS = Object.freeze({
  PENDING:    'pending',
  ACCEPTED:   'accepted',
  REJECTED:   'rejected',
  APPLIED:    'applied',
  SUPERSEDED: 'superseded'
});

// 9.5.3 — Payload schemas. Each entry lists required (R) and optional (O) fields with
// a short type hint. validateEvent enforces the required set. Companion tools should
// consult Integration_Guide.md for the canonical reference; this is engine-side.
const EVENT_SCHEMAS = Object.freeze({
  'player-plan': {
    R: { domainId: 'string' },
    O: { intendedActions: 'array', freeformNotes: 'string', proposedBudget: 'object' }
  },
  'gm-fiat': {
    R: { target: 'object', mutation: 'object' },
    // target = { kind:"domain"|"character"|"hex"|"settlement"|"campaign", id:string }
    // mutation = { fieldPath:"a.b.c", newValue: any, reason:string }
    O: { reason: 'string' }
  },
  'treasury-grant': {
    R: { domainId: 'string', amount: 'number', label: 'string' },
    O: { sourceCharacterId: 'string', sourceEventId: 'string' }
  },
  'treasury-debit': {
    R: { domainId: 'string', amount: 'number', label: 'string', reason: 'string' },
    O: { destinationCharacterId: 'string' }
  },
  'character-update': {
    R: { characterId: 'string', fieldUpdates: 'object' },
    // fieldUpdates is a flat map of fieldPath → newValue, e.g. { "hp.current": 12, "alive": false }
    O: { reason: 'string' }
  },
  'adventure-result': {
    R: { outcome: 'string' },
    // outcome = "cleared" | "partial" | "failed" | "fled" | "narrative-only"
    O: {
      hexId: 'string', lairId: 'string', dungeonId: 'string',
      treasureAwarded: 'array',        // [{ kind:"gp"|"magic-item"|"gem", amount?, label? }]
      xpAwarded: 'array',              // [{ characterId, xp }]
      casualties: 'array',             // [{ characterId, outcome:"wounded"|"killed", hp? }]
      narrativeSummary: 'string'
    }
  },
  'daw-result': {
    R: { outcome: 'string' },
    O: {
      resolvedAt: 'object',            // { hexId? }
      attackerDomainId: 'string', defenderDomainId: 'string',
      attackerLosses: 'array',         // [{ unitId, count }]
      defenderLosses: 'array',
      captured: 'object',              // { domainId?, hexIds?, treasure? }
      narrativeSummary: 'string'
    }
  },
  'claude-event': {
    R: { scope: 'string', title: 'string', narrativeText: 'string' },
    // scope = "campaign" | "domain" | "character" | "hex" | "settlement"
    O: {
      targetId: 'string',
      mechanicalEffect: 'object'       // itself a typed event payload — applied if accepted
    }
  },
  'rumor-emit': {
    R: { scope: 'string', rumorText: 'string', apparentLevel: 'string' },
    // scope = "campaign" | "settlement" | "domain"
    // apparentLevel = "common" | "uncommon" | "rare" | "obscure"
    O: { settlementId: 'string', domainId: 'string', sourceEventId: 'string', truthLevel: 'string' }
  },
  'venture-result': {
    R: { ventureId: 'string', outcome: 'string' },
    // outcome = "arrived" | "failed" | "annihilated"
    O: { finalSalePrice: 'number', vagariesApplied: 'array' }
  },
  'population-shock': {
    R: { domainId: 'string', deltaFamilies: 'number', label: 'string', kind: 'string' },
    // kind = "plague" | "migration" | "famine" | "boom" | "purge" | "other"
    O: { reason: 'string', urban: 'boolean' }   // urban=true affects urban families; default peasants
  },
  'domain-transfer': {
    R: { domainId: 'string', reason: 'string' },
    O: { newLiegeId: 'string', newRulerCharacterId: 'string', oldLiegeId: 'string', oldRulerCharacterId: 'string' }
  },
  'engine-standard-turn': {
    // Synthetic event emitted by commitTurn to log the standard monthly math pass per domain.
    R: { domainId: 'string', turnSnapshot: 'object' },
    O: {}
  },
  'recruit-hireling': {
    // Phase 2.95 §4.2 — full recruitment workflow. The patron solicits in a
    // market, individuates candidates as Character records (kind='candidate'),
    // negotiates per-candidate Reaction-to-Hiring rolls, and hires/rejects.
    // This event records the outcome of one full hiring session: typically
    // 0–N hires plus 0–N rejections. Auto-applies on commit; upgrades the
    // hired candidates' kind, sets liegeCharacterId, fills role slots,
    // and writes history entries to all candidates touched (including the
    // rejections — Joachim's 2026-05-28 design call).
    R: {
      patronCharacterId: 'string',
      hireCategory: 'string',         // 'mercenary' | 'henchman' | 'specialist'
      hireTypeId: 'string'            // e.g. 'engineer', 'henchman-3', 'heavy-infantry'
    },
    O: {
      settlementId: 'string',
      monthlyOffer: 'number',
      count: 'number',                // mercenary count-level hire
      candidateIds: 'array',          // Character ids of HIRED candidates (henchman/specialist)
      rejectedCandidateIds: 'array',  // Character ids of REJECTED candidates — recorded for history
      roleToFill: 'string',           // magistrate slot key or 'unit-command'
      roleDomainId: 'string',         // domain whose magistrate slot is being filled
      commandUnitId: 'string',        // unit id for unit-command assignment
      reactionBandKey: 'string',      // 'accept' | 'accept-elan' | etc. — informs élan loyalty bonus
      rollResult: 'object',           // full rollReactionToHiring return for traceability
      signingBonusTier: 'string',     // 'none' | 'week' | 'month' | 'year'
      persuasionProficiency: 'string',// 'diplomacy' | 'intimidation' | 'mystic-aura' | 'seduction'
      narrativeNotes: 'string',
      // GP Wave A.2 — record gp amounts even though no transfer fires today.
      // When Phase 2.95 Stash #263 lands, these numbers feed wealth-transfer
      // events. ratio = {none:0, week:0.25, month:1.0, year:12.0}.
      signingBonusGp: 'number',       // Σ over hired candidates of monthlyOffer × ratio[tier]
      solicitFeesGp: 'number'         // Σ of fees rolled across this session's solicit weeks
    }
  },
  'loyalty-check': {
    // Loyalty Roll per RR p.168. Pending events (auto-emitted on henchman
    // level-up, or on Judge-discretion calamity) carry just characterId +
    // reason. The GM resolves via the Roll Loyalty modal which rolls 2d6 +
    // loyalty + modifier (RAW floors applied) and fills rollResult before
    // commit. Handler then applies loyaltyDelta to character.loyalty
    // (clamped -4..+4 per RAW p.166).
    R: { characterId: 'string' },
    O: {
      reason: 'string',           // 'calamity' | 'level-up' | 'other'
      reasonNote: 'string',       // free-text description
      modifier: 'number',         // situational, -2..+2 per RAW p.168
      rollResult: 'object',       // { d1, d2, natRoll, loyaltyScore, situationalModifier, adjusted, bandKey, bandLabel, loyaltyDelta, accent, note }
      consequences: 'object'      // legacy field kept for backward compat
    }
  },
  'hireling-restored': {
    // §310.6 — reverses ledger entries when a hireling is cured/restored.
    // 'wound' resets permanentWoundPenalty to 0. 'mortality-side-effect'
    // reduces mortalityPenalty toward 0 (delta supplied). 'curse' / 'disease' /
    // 'wage-paid' are placeholder kinds that record the restoration without
    // mutating ledger fields (history-only — for the GM's audit trail).
    R: {
      characterId: 'string',
      restoredKind: 'string'    // 'wound' | 'mortality-side-effect' | 'curse' | 'disease' | 'wage-paid' | 'other'
    },
    O: {
      delta: 'number',           // for mortality-side-effect: how much penalty to remove (positive)
      severity: 'string',
      narrativeNotes: 'string'
    }
  },
  'hireling-calamity': {
    // Calamity event per RR p.166 (rations / wages / enervation / curse /
    // magical-disease / hp-zero / other) and RR p.165 (transfer-of-employment,
    // hidden-comrades). On apply: pushes to character.calamities[], pushes a
    // CharacterHistoryEntry, and auto-emits a follow-on loyalty-check event
    // with reason='calamity' + a reasonNote describing the calamity. For
    // 'transfer-of-employment', additionally rebases loyalty + morale on the
    // new employer's CHA/proficiencies/class powers and updates
    // liegeCharacterId before the follow-on loyalty-check fires.
    R: {
      characterId: 'string',
      kind: 'string'              // 'rations' | 'wages' | 'enervation' | 'curse' | 'magical-disease' | 'hp-zero' | 'transfer-of-employment' | 'hidden-comrades' | 'other'
    },
    O: {
      reasonNote: 'string',                // free-text description (e.g. "missed wages for Iuvinus")
      severity: 'string',                  // 'minor' | 'normal' | 'severe' — Judge's call; informs ledger delta
      newEmployerCharacterId: 'string',    // required when kind === 'transfer-of-employment'
      previousEmployerCharacterId: 'string', // optional, populated automatically on transfer
      loyaltyCheckEventId: 'string'        // populated on apply with the id of the auto-emitted follow-on loyalty-check
    }
  },
  // Foundation #234 — typed events for previously un-typed operations.
  'character-level-up': {
    R: { characterId: 'string', newLevel: 'number' },
    // source = "auto" (engine auto-leveling during commit) | "gm-fiat" (GM forced)
    O: { oldLevel: 'number', hpGained: 'number', source: 'string', reason: 'string', narrativeSummary: 'string' }
  },
  'character-death': {
    R: { characterId: 'string' },
    // kind = "death" | "retirement" — both soft-delete via alive=false
    O: { kind: 'string', reason: 'string', narrativeSummary: 'string' }
  },
  'passive-investment-create': {
    R: { investmentId: 'string', ownerCharacterId: 'string', capital: 'number', type: 'string' },
    O: { name: 'string', riskTier: 'string', destinationDomainId: 'string', narrativeSummary: 'string' }
  },
  'passive-investment-delete': {
    R: { investmentId: 'string' },
    O: { reason: 'string', narrativeSummary: 'string' }
  },
  'venture-launch': {
    R: { ventureId: 'string', venturerCharacterId: 'string', totalInvestment: 'number' },
    O: { originDomainId: 'string', destinationDomainId: 'string', expectedArrivalTurn: 'number', cargo: 'array', narrativeSummary: 'string' }
  },
  // Phase 4 Construction Wave A (Architecture.md §10.7 — 2026-05-30)
  'construction-project-started': {
    R: { projectId: 'string' },
    O: { ownerCharacterId: 'string', ownerDomainId: 'string', siteHexId: 'string', constructibleKind: 'string', constructibleSubtype: 'string', totalCost: 'number', laborRequired: 'number' }
  },
  'construction-progress': {
    R: { projectId: 'string' },
    O: { daysElapsed: 'number', laborInvested: 'number', narrative: 'string' }
  },
  'construction-completed': {
    R: { projectId: 'string' },
    O: { constructibleId: 'string', buildValue: 'number', narrative: 'string' }
  },
  'construction-vagary': {
    R: { projectId: 'string', vagaryKey: 'string' },
    O: { delayDays: 'number', costPenaltyGp: 'number', narrative: 'string' }
  },
  'construction-damaged': {
    R: { constructibleId: 'string', shpLost: 'number' },
    O: { source: 'string', narrative: 'string', subStructureKey: 'string' }
  },
  'construction-repair-started': {
    R: { projectId: 'string', repairTargetConstructibleId: 'string' },
    O: { totalCost: 'number', laborRequired: 'number' }
  },
  'construction-demolished': {
    R: { constructibleId: 'string' },
    O: { reason: 'string', narrative: 'string' }
  },
  // Phase 2.5 Journeys (#475 — J1). All carry journeyId; context envelope carries the hex(es).
  'journey-start': {
    R: { journeyId: 'string' },
    O: { startHexId: 'string', destinationHexId: 'string', narrative: 'string' }
  },
  'journey-day-tick': {
    R: { journeyId: 'string' },
    O: { dayIndex: 'number', milesTraveled: 'number', hexesTraveled: 'number', narrative: 'string' }
  },
  'journey-arrived': {
    R: { journeyId: 'string' },
    O: { destinationHexId: 'string', narrative: 'string' }
  },
  'journey-lost': {
    R: { journeyId: 'string' },
    O: { dayIndex: 'number', narrative: 'string' }
  },
  'journey-resupply': {
    R: { journeyId: 'string' },
    O: { rations: 'number', waterRations: 'number', narrative: 'string' }
  },
  'journey-encounter': {
    R: { journeyId: 'string' },
    O: { dayIndex: 'number', hexId: 'string', narrative: 'string' }
  },
  'journey-aborted': {
    R: { journeyId: 'string' },
    O: { reason: 'string', narrative: 'string' }
  },
  'journey-rerouted': {
    R: { journeyId: 'string' },
    O: { destinationHexId: 'string', waypointHexIds: 'array', narrative: 'string' }
  },
  // #551 Wave Entity-B Chronicle Entry. Title + body + attached entities via context envelope.
  'gm-narrative': {
    R: { title: 'string', body: 'string' },
    O: { notes: 'string' }
  }
});

// 9.5.4 — Submitter string conventions. Documented here, enforced loosely.
// Format: "<kind>:<id>" or bare "gm". Patterns:
//   "gm"                              — the GM operating the desktop tool
//   "player:<characterId>"            — player acting as a specific character
//   "tool:<tool-name>"                — automated tool (dungeon delver, DaW frontend, Discord bot)
//   "agent:<agent-name>"              — AI agent (claude-oracle, claude-sub-ruler, etc.)
//   "engine"                          — synthetic events emitted by the engine itself
const EVENT_SUBMITTER_PATTERN = /^(gm|engine|(player|tool|agent):[a-z0-9_\-:]+)$/i;

function isEventKindKnown(kind){
  return EVENT_KINDS.indexOf(kind) >= 0;
}

function isEventStatusValid(status){
  return Object.values(EVENT_STATUS).indexOf(status) >= 0;
}

// 9.5.5 — Factory. Returns a fresh pending event with id, timestamp, status set.
function newEvent(kind, opts){
  if(!isEventKindKnown(kind)) throw new Error('newEvent: unknown kind "'+kind+'"');
  opts = opts || {};
  return {
    schemaVersion: SCHEMA_VERSION,
    id: opts.id || newId(ID_PREFIXES.event),
    kind: kind,
    submittedBy: opts.submittedBy || 'gm',
    submittedAt: opts.submittedAt || new Date().toISOString(),
    gameTimeAt: opts.gameTimeAt || null,
    targetTurn: opts.targetTurn != null ? opts.targetTurn : 1,
    status: opts.status || EVENT_STATUS.PENDING,
    payload: opts.payload || {},
    gmNotes: opts.gmNotes || '',
    appliedAtTurn: null,
    parentEventId: opts.parentEventId || null,
    supersededBy: null,
    // 2026-05-30 post-survey reservations — Architecture.md §7 cadence-typed dispatch.
    // `cadence` routes the event to the matching registered handler family.
    // Default 'monthly-turn' for back-compat with all pre-2026-05-30 events.
    // 'daily' fires for Calendar day-tick consumers (Phase 2.95 #478); 'intra-encounter'
    // covers Phase 3 Combat round-cadence + Phase 3.5 Delves hour-cadence events;
    // 'decadal' covers Domain Wizard pre-history generation (#435).
    cadence: opts.cadence || 'monthly-turn',
    // 2026-05-30 — Event context envelope (#528). Every event carries the canonical
    // location + the full set of entity ids it touches. Populated at event-creation
    // time by per-kind _deriveEventContext helpers. Powers derived history accessors
    // (hexHistory, settlementHistory, etc.) per Architecture.md §3.5 Wave Hex-history.
    // Pre-existing events without context degrade gracefully — accessors use optional
    // chaining and return only contextualized events.
    context: opts.context || {
      primaryHexId:     null,
      involvedHexIds:   [],
      settlementId:     null,
      domainId:         null,
      relatedEntities:  []  // [{kind: 'character'|'group'|'constructible'|..., id, role}]
    },
    // `gameTimeAt` stays calendar-pure ({year, month, day}). Sub-day temporal context
    // (encounter id, round number, turn number, initiative order) lives in this parallel
    // namespace. Null for day-cadence events. Architecture.md §7 schema decision (Joachim 2026-05-30).
    subdayContext: opts.subdayContext || null
  };
}

// 9.5.6 — Validation. Throws with a helpful message on schema violation.
// Callers should try/catch and surface the error to the submitting actor.
function validateEvent(event){
  if(!event || typeof event !== 'object') throw new Error('validateEvent: not an object');
  if(!event.id || typeof event.id !== 'string') throw new Error('validateEvent: missing or non-string id');
  if(!isEventKindKnown(event.kind)) throw new Error('validateEvent: unknown kind "'+event.kind+'"');
  if(!event.submittedBy || !EVENT_SUBMITTER_PATTERN.test(event.submittedBy)){
    throw new Error('validateEvent: submittedBy "'+event.submittedBy+'" does not match expected pattern (gm|engine|player:X|tool:X|agent:X)');
  }
  if(!event.submittedAt) throw new Error('validateEvent: missing submittedAt');
  if(typeof event.targetTurn !== 'number') throw new Error('validateEvent: targetTurn must be a number');
  if(!isEventStatusValid(event.status)) throw new Error('validateEvent: invalid status "'+event.status+'"');
  if(!event.payload || typeof event.payload !== 'object') throw new Error('validateEvent: payload must be an object');
  // Schema check
  const schema = EVENT_SCHEMAS[event.kind];
  if(schema && schema.R){
    Object.keys(schema.R).forEach(field => {
      const v = event.payload[field];
      if(v === undefined || v === null) throw new Error('validateEvent: '+event.kind+' missing required payload field "'+field+'"');
      const expected = schema.R[field];
      if(expected === 'array' && !Array.isArray(v)) throw new Error('validateEvent: '+event.kind+'.'+field+' must be an array');
      else if(expected === 'object' && (typeof v !== 'object' || Array.isArray(v))) throw new Error('validateEvent: '+event.kind+'.'+field+' must be an object');
      else if(expected !== 'array' && expected !== 'object' && typeof v !== expected) throw new Error('validateEvent: '+event.kind+'.'+field+' must be '+expected+', got '+typeof v);
    });
  }
  // Field-path safety — any event carrying a dotted write path (gm-fiat's
  // mutation.fieldPath, character-update's fieldUpdates keys) must use only the
  // allowlisted grammar and never a prototype-pollution segment. Rejecting at
  // validation time keeps a crafted shared .acks.json from reaching _setByPath.
  // (Security: appsec audit C1, 2026-05-31.)
  function checkFieldPath(fp, where){
    if(typeof fp !== 'string' || !SAFE_FIELDPATH_RE.test(fp)){
      throw new Error('validateEvent: '+where+' "'+fp+'" is not a valid field path (allowed: '+SAFE_FIELDPATH_RE.source+')');
    }
    fp.split('.').forEach(seg => {
      if(DANGEROUS_PATH_SEGMENTS.indexOf(seg) !== -1){
        throw new Error('validateEvent: '+where+' "'+fp+'" contains forbidden segment "'+seg+'" (prototype-pollution guard)');
      }
    });
  }
  if(event.kind === 'gm-fiat' && event.payload && event.payload.mutation && event.payload.mutation.fieldPath != null){
    checkFieldPath(event.payload.mutation.fieldPath, 'gm-fiat mutation.fieldPath');
  }
  if(event.kind === 'character-update' && event.payload && event.payload.fieldUpdates && typeof event.payload.fieldUpdates === 'object'){
    Object.keys(event.payload.fieldUpdates).forEach(fp => checkFieldPath(fp, 'character-update fieldUpdates key'));
  }
  // gameTimeAt validation when present
  if(event.gameTimeAt){
    const gt = event.gameTimeAt;
    if(typeof gt !== 'object') throw new Error('validateEvent: gameTimeAt must be null or an object');
    ['year','month','day'].forEach(k => {
      if(gt[k] != null && typeof gt[k] !== 'number') throw new Error('validateEvent: gameTimeAt.'+k+' must be a number when present');
    });
  }
  return true;
}

// 9.5.7 — Query helpers. Used by the UI to slice the pendingEvents and eventLog.

function eventsTargetingTurn(campaign, turn){
  if(!campaign || !Array.isArray(campaign.pendingEvents)) return [];
  return campaign.pendingEvents.filter(e => (e.targetTurn||0) <= turn && e.status === EVENT_STATUS.PENDING);
}

function eventsTargetingDomain(campaign, domainId, turn){
  if(!campaign || !Array.isArray(campaign.pendingEvents)) return [];
  return campaign.pendingEvents.filter(e => {
    if(turn != null && (e.targetTurn||0) > turn) return false;
    const p = e.payload || {};
    return p.domainId === domainId ||
           (p.target && p.target.kind === 'domain' && p.target.id === domainId) ||
           p.attackerDomainId === domainId ||
           p.defenderDomainId === domainId ||
           (p.resolvedAt && p.resolvedAt.domainId === domainId);
  });
}

function eventsByKind(campaign, kind, options){
  options = options || {};
  const src = options.fromLog ? (campaign.eventLog || []) : (campaign.pendingEvents || []);
  return src.filter(entry => {
    const e = entry.event || entry;
    return e.kind === kind;
  });
}

function eventsBySubmitter(campaign, submitterPattern, options){
  options = options || {};
  const src = options.fromLog ? (campaign.eventLog || []) : (campaign.pendingEvents || []);
  const re = (submitterPattern instanceof RegExp) ? submitterPattern : new RegExp(submitterPattern);
  return src.filter(entry => {
    const e = entry.event || entry;
    return re.test(e.submittedBy || '');
  });
}

function pendingEventCount(campaign){
  if(!campaign || !Array.isArray(campaign.pendingEvents)) return 0;
  return campaign.pendingEvents.filter(e => e.status === EVENT_STATUS.PENDING).length;
}

// 9.5.8 — Apply-order sort (Decision 2, locked). Timed events sort first by
// gameTimeAt ascending; untimed events follow in submittedAt order. Ties fall
// through to submittedAt then id for stable tiebreaks.
function compareEventOrder(a, b){
  const aTimed = !!a.gameTimeAt;
  const bTimed = !!b.gameTimeAt;
  if(aTimed && !bTimed) return -1;
  if(!aTimed && bTimed) return 1;
  if(aTimed && bTimed){
    const ay = a.gameTimeAt.year || 0, by = b.gameTimeAt.year || 0;
    if(ay !== by) return ay - by;
    const am = a.gameTimeAt.month || 0, bm = b.gameTimeAt.month || 0;
    if(am !== bm) return am - bm;
    const ad = a.gameTimeAt.day || 0, bd = b.gameTimeAt.day || 0;
    if(ad !== bd) return ad - bd;
    const ah = a.gameTimeAt.hour, bh = b.gameTimeAt.hour;
    // nulls in hour sort before non-nulls within the same day
    if(ah == null && bh != null) return -1;
    if(ah != null && bh == null) return 1;
    if(ah != null && bh != null && ah !== bh) return ah - bh;
  }
  // Fall through: insertion order via submittedAt then id
  if(a.submittedAt < b.submittedAt) return -1;
  if(a.submittedAt > b.submittedAt) return 1;
  if(a.id < b.id) return -1;
  if(a.id > b.id) return 1;
  return 0;
}

function sortEventsForApply(events){
  return (events || []).slice().sort(compareEventOrder);
}

// 9.5.9 — applyEvent dispatch. Handlers are registered in EVENT_HANDLERS below.
// Each handler signature: function(campaign, event) → { result, narrativeSummary }
// where result is the shape documented in Turn_Cycle_v2_Plan.md §6.3.

const EVENT_HANDLERS = {}; // populated below — kept as a mutable map for additive registration

function registerEventHandler(kind, fn){
  if(!isEventKindKnown(kind)) throw new Error('registerEventHandler: unknown kind "'+kind+'"');
  EVENT_HANDLERS[kind] = fn;
}

// Deep clone / in-place restore helpers backing the transactional dispatch below.
// Campaign state is pure JSON data (the .acks.json contract), so structuredClone
// (or its JSON fallback) is lossless. _restoreCampaignInPlace mutates the SAME
// campaign object reference back to the snapshot so callers holding the reference
// (and Alpine's reactive proxy) see the rolled-back state.
function _cloneForRollback(c){
  try { if(typeof structuredClone === 'function') return structuredClone(c); } catch(e){}
  return JSON.parse(JSON.stringify(c));
}
function _restoreCampaignInPlace(target, snap){
  if(!target || !snap || typeof snap !== 'object') return;
  for(const k of Object.keys(target)){ if(!(k in snap)) delete target[k]; }
  for(const k of Object.keys(snap)){ target[k] = snap[k]; }
}

function applyEvent(campaign, event){
  validateEvent(event);
  const handler = EVENT_HANDLERS[event.kind];
  if(!handler){
    // Stub for kinds without a registered handler — record the event but apply no state change.
    return {
      result: {
        domainsChanged: [], charactersChanged: [], hexesChanged: [],
        treasuryDelta: 0,
        narrativeSummary: '['+event.kind+'] handler not yet implemented; event logged with no state change.'
      }
    };
  }
  // Transactional dispatch (delta audit C2, 2026-06-01). A multi-step handler
  // (e.g. adventure-result: treasure → XP → casualties → rumor) that throws
  // partway must not leave partial mutations behind — reject ≠ rollback. Snapshot
  // the campaign, run the handler in place (the success path is unchanged, so
  // fine-grained reactivity at the call sites is preserved), and on throw restore
  // the pre-event state before re-throwing. The existing catch at the call site
  // (commitTurn ~3114 / resolvePendingEvent ~11916) then marks the event rejected,
  // logs the engine error, and toasts — now with no orphaned partial state.
  const _snapshot = _cloneForRollback(campaign);
  try {
    return handler(campaign, event);
  } catch(err){
    _restoreCampaignInPlace(campaign, _snapshot);
    throw err;
  }
}

// Helper used by handlers to apply a treasury delta and return change metadata.
//
// Stash C.1 (2026-05-29): When inventory-stash-system is on AND the domain has
// a treasuryStashId linked, route the mutation through depositToStash with a
// signed amount. Positive = grant, negative = debit. The A.4 canonical-setter
// invariant (_syncTreasuryScalarFor inside depositToStash) keeps domain.treasury.gp
// in sync with the stash sum. Without this routing, treasury-grant events would
// drift from the stash and reconcileTreasuryScalars would CLOBBER them on load.
//
// When the rule is off (or migration hasn't run yet so no treasuryStashId), fall
// through to the legacy direct-scalar mutation. This is the gating-doctrine path:
// stash data is non-existent when the rule is off.
function _applyTreasuryDelta(campaign, domainId, amount, label){
  const d = (campaign.domains||[]).find(x => x.id === domainId);
  if(!d) throw new Error('Event references unknown domainId: '+domainId);

  const A = (typeof global !== 'undefined' ? global.ACKS : (typeof window !== 'undefined' ? window.ACKS : null)) || {};
  const stashSystemOn = A.isHouseRuleEnabled && A.isHouseRuleEnabled(campaign, 'inventory-stash-system');
  if(stashSystemOn && d.treasuryStashId && A.findStash && A.depositToStash){
    const stash = A.findStash(campaign, d.treasuryStashId);
    if(stash){
      // Compute 'before' from canonical stash sum (pre-mutation).
      const before = (A.domainTreasuryGp ? A.domainTreasuryGp(campaign, d.id) : ((d.treasury && d.treasury.gp) || 0));
      A.depositToStash(campaign, stash.id, [{ kind:'coin', denomination:'gp', qty: amount }], {
        reason: amount >= 0 ? 'treasury-grant' : 'treasury-debit',
        source: label ? { kind:'label', label } : null
      });
      // _syncTreasuryScalarFor inside depositToStash updated d.treasury.gp already.
      const after = (d.treasury && d.treasury.gp) || 0;
      return { domainId, before, after, delta: amount, label: label || '' };
    }
  }

  // Legacy fallback — stash system off, or treasury hasn't been migrated yet.
  if(!d.treasury) d.treasury = { gp: 0 };
  const beforeLegacy = d.treasury.gp || 0;
  d.treasury.gp = beforeLegacy + amount;
  return { domainId, before: beforeLegacy, after: d.treasury.gp, delta: amount, label: label || '' };
}

// Helper: drop a rumor-emit event into pendingEvents from inside another handler.
// Gated by the rumors-auto-emit house rule. Used by adventure-result, treasury-grant
// (notable transactions), venture-result, and domain-transfer to feed the rumor inbox
// when a mechanically-significant outcome happens. The GM still ratifies at Advance Month.
function _autoEmitRumor(campaign, opts){
  if(!campaign) return null;
  if(!global.ACKS || !global.ACKS.isHouseRuleEnabled || !global.ACKS.isHouseRuleEnabled(campaign, 'rumors-auto-emit')) return null;
  if(!Array.isArray(campaign.pendingEvents)) campaign.pendingEvents = [];
  try {
    const ev = newEvent('rumor-emit', {
      submittedBy: opts.submittedBy || 'engine',
      targetTurn: (campaign.currentTurn || 1) + 1,    // surface next turn for review
      payload: {
        scope: opts.settlementId ? 'settlement' : (opts.domainId ? 'domain' : 'campaign'),
        settlementId: opts.settlementId || null,
        domainId: opts.domainId || null,
        rumorText: opts.rumorText || '',
        apparentLevel: opts.apparentLevel || 'uncommon',
        truthLevel: opts.truthLevel || 'true',
        topic: opts.topic || 'other',
        sourceEventId: opts.sourceEventId || null,
        sourceCharacterId: opts.sourceCharacterId || null
      }
    });
    campaign.pendingEvents.push(ev);
    return ev;
  } catch(e) {
    // Auto-emit failures must never break the parent handler.
    return null;
  }
}

// Path segments that must never be written through — writing to __proto__/constructor/
// prototype lets a crafted gm-fiat / character-update event (e.g. inside a shared
// .acks.json) poison Object.prototype. (Security: appsec audit C1, 2026-05-31.)
const DANGEROUS_PATH_SEGMENTS = Object.freeze(['__proto__', 'constructor', 'prototype']);
// Allowlist for a well-formed dotted field path. The audit's suggested grammar was
// [A-Za-z0-9_]; widened to also allow '-' because real paths address kebab-case keys
// (e.g. magistrates.captain-of-the-guard.administersThisMonth) and numeric array
// indices (inventory.0.gp). Safety is preserved by the separate DANGEROUS_PATH_SEGMENTS
// blacklist — none of __proto__/constructor/prototype contain a hyphen.
const SAFE_FIELDPATH_RE = /^[A-Za-z0-9_-]+(\.[A-Za-z0-9_-]+)*$/;

function assertSafeFieldPath(path){
  const parts = String(path == null ? '' : path).split('.');
  for(const seg of parts){
    if(DANGEROUS_PATH_SEGMENTS.indexOf(seg) !== -1){
      throw new Error('_setByPath: refusing to write through dangerous path segment "' + seg + '" in "' + path + '" (prototype-pollution guard)');
    }
  }
}

// Helper: walk a dotted fieldPath on a target object and set the value.
// Returns the previous value (for audit / undo).
function _setByPath(obj, path, value){
  assertSafeFieldPath(path);
  const parts = (path||'').split('.');
  let cur = obj;
  for(let i=0; i<parts.length-1; i++){
    if(cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  const last = parts[parts.length-1];
  const prev = cur[last];
  cur[last] = value;
  return prev;
}

// 9.5.10 — Lazy migration of legacy domain.pendingPlayerInput → player-plan event.
// Called during loadCampaignFromObject. Idempotent: runs once per domain that has the field.
function migratePendingPlayerInputToEvents(campaign){
  if(!campaign || !Array.isArray(campaign.domains)) return;
  if(!Array.isArray(campaign.pendingEvents)) campaign.pendingEvents = [];
  campaign.domains.forEach(d => {
    if(!d.pendingPlayerInput) return;
    const e = newEvent('player-plan', {
      submittedBy: 'player:legacy-migration',
      targetTurn: campaign.currentTurn || 1,
      payload: {
        domainId: d.id,
        freeformNotes: (typeof d.pendingPlayerInput === 'string') ? d.pendingPlayerInput :
                       (d.pendingPlayerInput.notes || JSON.stringify(d.pendingPlayerInput)),
        intendedActions: Array.isArray(d.pendingPlayerInput.intendedActions) ? d.pendingPlayerInput.intendedActions : []
      },
      gmNotes: 'Auto-migrated from legacy domain.pendingPlayerInput field on '+new Date().toISOString().slice(0,10)+'.'
    });
    campaign.pendingEvents.push(e);
    d.pendingPlayerInput = null;
  });
}

// 9.5.11 — Event handlers. Each handler accepts (campaign, event) and returns
// { result: {...} }. The result shape is per Turn_Cycle_v2_Plan.md §6.3:
//   { domainsChanged:[], charactersChanged:[], hexesChanged:[], treasuryDelta:number, narrativeSummary:string, ...kind-specific }
// Handlers may add additional summary fields beyond the four standard ones.

// --- player-plan ---
// The player's submitted plan for a domain. The engine doesn't auto-apply structured actions
// at v12.3 launch — it records the plan, returns a narrative summary for the modal, and lets
// the GM ratify by clicking through. Future phases (especially Phase 5 player self-service)
// will teach the engine to interpret intendedActions structurally.
function applyEvent_playerPlan(campaign, event){
  const p = event.payload || {};
  const d = (campaign.domains||[]).find(x => x.id === p.domainId);
  if(!d) throw new Error('player-plan event references unknown domainId: '+p.domainId);
  const actionCount = Array.isArray(p.intendedActions) ? p.intendedActions.length : 0;
  const summary = 'Plan for '+d.name+': '+
    (p.freeformNotes ? '"'+p.freeformNotes.substring(0,160)+(p.freeformNotes.length>160?'...':'')+'"' : '(no notes)')+
    (actionCount > 0 ? ' · '+actionCount+' structured action'+(actionCount===1?'':'s') : '');
  return {
    result: {
      domainsChanged: [d.id], charactersChanged: [], hexesChanged: [],
      treasuryDelta: 0,
      narrativeSummary: summary,
      actionsRecorded: actionCount
    }
  };
}
registerEventHandler('player-plan', applyEvent_playerPlan);

// Humanize known GM-fiat mutation patterns into prose for the eventLog / Campaign Log.
// Returns null when no pattern matches; caller falls through to the generic template.
// Add new branches here as subsystems land — magistracy was first; future: henchmen
// dismissal, garrison-unit transfers, etc. Each branch reads from the same (campaign,
// target, entity, mutation, p, previousValue) context the gm-fiat handler already has.
const MAGISTRATE_ROLE_LABELS = {
  captainOfGuard: 'Captain of the Guard',
  chaplain: 'Chaplain',
  munerator: 'Munerator',
  steward: 'Steward'
};
function _humanizeFiatNarrative(campaign, target, entity, mutation, p, previousValue){
  if(!target || !mutation) return null;
  const reasonNote = (mutation.reason || p.reason) ? ' (' + (mutation.reason || p.reason) + ')' : '';
  // ----- Magistracy slot: domain.magistrates.{role}.characterId -----
  if(target.kind === 'domain'){
    const m = String(mutation.fieldPath || '').match(/^magistrates\.([a-zA-Z]+)\.characterId$/);
    if(m){
      const roleKey = m[1];
      const roleLabel = MAGISTRATE_ROLE_LABELS[roleKey] || roleKey;
      const domainName = (entity && entity.name) || target.id;
      const lookup = function(id){
        if(!id) return null;
        const list = (campaign && campaign.characters) || [];
        for(let i=0;i<list.length;i++){ if(list[i] && list[i].id === id) return list[i]; }
        return null;
      };
      const newChar = lookup(mutation.newValue);
      const oldChar = lookup(previousValue);
      if(mutation.newValue == null){
        if(oldChar) return 'Dismissed ' + (oldChar.name || oldChar.id) + ' as ' + roleLabel + ' of ' + domainName + reasonNote;
        return 'Vacated ' + roleLabel + ' slot of ' + domainName + reasonNote;
      } else {
        const newName = (newChar && newChar.name) || mutation.newValue;
        if(oldChar && oldChar.id !== mutation.newValue){
          return 'Replaced ' + (oldChar.name || oldChar.id) + ' with ' + newName + ' as ' + roleLabel + ' of ' + domainName + reasonNote;
        }
        return 'Appointed ' + newName + ' as ' + roleLabel + ' of ' + domainName + reasonNote;
      }
    }
  }
  // ----- Party location: party.currentHexId (GM moves a party between hexes) -----
  if(target.kind === 'party' && mutation.fieldPath === 'currentHexId'){
    const partyName = (entity && entity.name) || target.id;
    const A = (typeof global !== 'undefined' && global.ACKS) ? global.ACKS : null;
    const hexLabel = function(id){
      if(!id) return null;
      const h = (A && A.resolveHexAnywhere) ? A.resolveHexAnywhere(campaign, id) : null;
      if(h && h.coord) return (A && A.hexDisplayLabel ? A.hexDisplayLabel(h.coord.q, h.coord.r) : ('(' + (h.coord.q || 0) + ',' + (h.coord.r || 0) + ')')) + (h.settlement && h.settlement.name ? ' · ' + h.settlement.name : '');
      return id;
    };
    if(mutation.newValue == null) return 'Cleared the location of ' + partyName + reasonNote;
    if(previousValue == null) return 'Placed ' + partyName + ' at ' + hexLabel(mutation.newValue) + reasonNote;
    return 'Moved ' + partyName + ' to ' + hexLabel(mutation.newValue) + ' (from ' + hexLabel(previousValue) + ')' + reasonNote;
  }
  // ----- Party leader: party.leaderCharacterId (GM hands command to a member) -----
  if(target.kind === 'party' && mutation.fieldPath === 'leaderCharacterId'){
    const partyName = (entity && entity.name) || target.id;
    const lookup = function(id){
      if(!id) return null;
      const list = (campaign && campaign.characters) || [];
      for(let i=0;i<list.length;i++){ if(list[i] && list[i].id === id) return list[i]; }
      return null;
    };
    const newLeader = lookup(mutation.newValue);
    const oldLeader = lookup(previousValue);
    if(mutation.newValue == null) return 'Cleared the leader of ' + partyName + reasonNote;
    const newName = (newLeader && newLeader.name) || mutation.newValue;
    if(oldLeader && oldLeader.id !== mutation.newValue) return 'Made ' + newName + ' leader of ' + partyName + ' (replacing ' + (oldLeader.name || oldLeader.id) + ')' + reasonNote;
    return 'Made ' + newName + ' leader of ' + partyName + reasonNote;
  }
  // ----- Hex domain reassignment: hex.domainId (GM moves a hex between domains / to the wild) -----
  if(target.kind === 'hex' && mutation.fieldPath === 'domainId'){
    const A = (typeof global !== 'undefined' && global.ACKS) ? global.ACKS : null;
    const hexLabel = (entity && entity.coord && A && A.hexDisplayLabel) ? A.hexDisplayLabel(entity.coord.q, entity.coord.r) : ((entity && entity.id) || target.id);
    const domName = function(id){ if(!id) return null; const d = ((campaign && campaign.domains) || []).find(x => x && x.id === id); return d ? (d.name || d.id) : id; };
    const from = domName(previousValue), to = domName(mutation.newValue);
    if(!mutation.newValue) return 'Released hex ' + hexLabel + (from ? ' from ' + from : '') + ' to unclaimed wilderness' + reasonNote;
    if(previousValue) return 'Moved hex ' + hexLabel + ' from ' + from + ' to ' + to + reasonNote;
    return 'Assigned hex ' + hexLabel + ' to ' + to + reasonNote;
  }
  // ----- Journey pace: journey.pace (GM changes the marching pace mid-trip) -----
  if(target.kind === 'journey' && mutation.fieldPath === 'pace'){
    const jName = (entity && entity.name) || target.id;
    const paceLabel = function(v){ return v ? (({ 'forced-march':'forced march', 'half-speed':'half speed' })[v] || String(v)) : v; };
    const to = paceLabel(mutation.newValue);
    if(previousValue && previousValue !== mutation.newValue) return 'Set ' + jName + ' to ' + to + ' pace (was ' + paceLabel(previousValue) + ')' + reasonNote;
    return 'Set ' + jName + ' to ' + to + ' pace' + reasonNote;
  }
  return null;
}

// --- gm-fiat ---
// Arbitrary GM mutation with audit trail. The mutation's fieldPath is dotted; newValue replaces.
// Captures previous value so the eventLog can support eventual revertEvent (deferred).
function applyEvent_gmFiat(campaign, event){
  const p = event.payload || {};
  const target = p.target || {};
  const mutation = p.mutation || {};
  if(!target.kind || !target.id) throw new Error('gm-fiat event missing target.kind or target.id');
  if(!mutation.fieldPath) throw new Error('gm-fiat event missing mutation.fieldPath');
  let entity = null;
  switch(target.kind){
    case 'campaign':   entity = campaign; break;
    case 'domain':     entity = (campaign.domains||[]).find(x => x.id === target.id); break;
    case 'character':  entity = (campaign.characters||[]).find(x => x.id === target.id); break;
    case 'hex':
      // Top-level collection first (Foundation #14/#193 — domainless wilderness hexes live ONLY
      // here; domained hexes are reference-unified, same object). Then walk legacy nested storage.
      entity = (campaign.hexes||[]).find(h => h.id === target.id) || null;
      if(!entity){
        (campaign.domains||[]).forEach(d => {
          const h = (d.geography?.hexes||[]).find(h => h.id === target.id);
          if(h) entity = h;
        });
      }
      break;
    case 'settlement':
      // Check top-level collection first (Foundation #14), then walk legacy nested storage.
      entity = (campaign.settlements||[]).find(s => s.id === target.id) || null;
      if(!entity){
        (campaign.domains||[]).forEach(d => {
          (d.geography?.hexes||[]).forEach(h => {
            if(h.settlement && h.settlement.id === target.id) entity = h.settlement;
          });
        });
      }
      break;
    case 'rumor':
      entity = (campaign.rumors||[]).find(r => r.id === target.id) || null;
      break;
    case 'garrison-unit':
      // §310.3f-fix7 — garrison units live two places: domain.garrison.units
      // (the domain's garrison) and character.mercenaryCompany.units (a
      // patron's private retinue). Walk both.
      (campaign.domains||[]).forEach(d => {
        const u = (d.garrison && d.garrison.units || []).find(u => u.id === target.id);
        if(u) entity = u;
      });
      if(!entity){
        (campaign.characters||[]).forEach(c => {
          const u = (c.mercenaryCompany && c.mercenaryCompany.units || []).find(u => u.id === target.id);
          if(u) entity = u;
        });
      }
      break;
    default: {
      // Entity Registry fallback (#562 — 2026-05-31). The Registry (acks-engine-entity-registry.js,
      // shipped #550) provides findEntity(campaign, kind, id) for all 28 registered kinds.
      // This lets the gm-fiat handler accept ANY registered kind without needing a per-kind
      // switch case here. Future kinds added to the Registry get gm-fiat support for free.
      if(typeof global !== 'undefined' && global.ACKS && global.ACKS.findEntity){
        entity = global.ACKS.findEntity(campaign, target.kind, target.id);
        if(!entity) throw new Error('gm-fiat: target '+target.kind+':'+target.id+' not found (via Entity Registry)');
        break;
      }
      throw new Error('gm-fiat: unknown target.kind "'+target.kind+'" (Entity Registry not loaded)');
    }
  }
  if(!entity) throw new Error('gm-fiat: target '+target.kind+':'+target.id+' not found');
  const previousValue = _setByPath(entity, mutation.fieldPath, mutation.newValue);
  // Foundation #241 — keep peasantFamilies and hex.families in sync. If the GM edited either,
  // reconcile the other side automatically. Without this, an inline edit on the Demographics
  // tab would re-introduce the drift this Foundation step exists to prevent.
  // These MUST route through the EXPORTED engine setters: the underlying redistribution helpers
  // (_redistributeRuralFamilies / _ruralHexes) are private to acks-engine.js and are NOT on the
  // ACKS namespace, so a bare reference from this module throws ReferenceError. The bug was
  // dormant until the families-per-hex per-hex editor became reachable. (2026-06-01.)
  const _eng = (typeof global !== 'undefined' ? global.ACKS : (typeof window !== 'undefined' ? window.ACKS : null)) || {};
  if(target.kind === 'domain' && mutation.fieldPath === 'demographics.peasantFamilies'){
    if(_eng.setPeasantPopulation) _eng.setPeasantPopulation(entity, mutation.newValue);
  } else if(target.kind === 'hex' && mutation.fieldPath === 'families'){
    const owningDomain = (campaign.domains||[]).find(dd =>
      (dd.geography?.hexes||[]).some(h => h.id === target.id));
    if(owningDomain && _eng.syncRuralPopulationFromHexes) _eng.syncRuralPopulationFromHexes(owningDomain);
  } else if(target.kind === 'hex' && mutation.fieldPath === 'domainId'){
    // Canonical setter (#10): a hex's domainId is the truth; moving it must move its geography.hexes
    // mirror too. Routes through the exported reconciler so the hex panel, the Inspector, the Event
    // Wizard, and any integrator that sets domainId all re-home the hex (not just the map editor).
    if(_eng.reconcileHexDomainMembership) _eng.reconcileHexDomainMembership(campaign, entity);
  } else if(target.kind === 'character' && typeof mutation.fieldPath === 'string' && mutation.fieldPath.indexOf('coins.') === 0){
    // Canonical setter (#10): coins.gp is the truth; refresh the personalGp mirror after any coins.*
    // edit so the award handler + external readers stay in lockstep. Every purse-editing surface —
    // the character sheet's Coins section, the Inspector, the Event Wizard — routes through here.
    if(_eng.reconcileCharacterCoins) _eng.reconcileCharacterCoins(entity);
  } else if(target.kind === 'party' && mutation.fieldPath === 'currentHexId'){
    // The party's camp stash travels with it (Items I1 / Stash B) — keep the camp at the
    // party's hex whenever the GM moves the party by fiat. The journey day-tick syncs too.
    if(_eng.syncPartyCampHex) _eng.syncPartyCampHex(campaign, entity);
  }
  return {
    result: {
      domainsChanged: target.kind === 'domain' ? [target.id] : [],
      charactersChanged: target.kind === 'character' ? [target.id] : [],
      hexesChanged: target.kind === 'hex' ? [target.id] : [],
      treasuryDelta: 0,
      narrativeSummary: (_humanizeFiatNarrative(campaign, target, entity, mutation, p, previousValue) || ('GM fiat on '+target.kind+':'+target.id+': set '+mutation.fieldPath+' = '+JSON.stringify(mutation.newValue)+(mutation.reason||p.reason ? ' ('+(mutation.reason||p.reason)+')' : ''))),
      previousValue: previousValue
    }
  };
}
registerEventHandler('gm-fiat', applyEvent_gmFiat);

// --- treasury-grant ---
// Adjusts a domain's treasury by `amount` (positive = grant, negative = debit).
// If sourceCharacterId is set, the grant is logged as coming from that character — useful for
// adventure-result handlers wanting to split treasure into "deposited to domain coffers".
function applyEvent_treasuryGrant(campaign, event){
  const p = event.payload || {};
  if(typeof p.amount !== 'number') throw new Error('treasury-grant: amount must be a number');
  const change = _applyTreasuryDelta(campaign, p.domainId, p.amount, p.label);
  const source = p.sourceCharacterId ? ' (from character '+p.sourceCharacterId+')' : '';
  // Foundation #14 auto-emit hook: when a grant exceeds a settlement's transaction threshold,
  // notable-transaction rumors emit. Gated by both markets-transaction-threshold (so the
  // threshold mechanic is on) and rumors-auto-emit (so the engine is allowed to push events).
  // Delta audit I1 (2026-06-01): route through isHouseRuleEnabled — a raw houseRules[id]
  // truthiness check fires when the rule is {enabled:false} (the object is truthy). This was
  // the last instance of the pattern the project's conventions forbid (feedback-house-rule-shape).
  if(global.ACKS.isHouseRuleEnabled(campaign, 'markets-transaction-threshold') && Math.abs(p.amount) > 0){
    const primarySet = settlementsForDomain(campaign, p.domainId)[0];
    if(primarySet){
      const threshold = global.ACKS.computeTransactionThreshold(primarySet);
      if(threshold > 0 && Math.abs(p.amount) >= threshold){
        const dName = (campaign.domains||[]).find(x=>x.id===p.domainId)?.name || p.domainId;
        _autoEmitRumor(campaign, {
          settlementId: primarySet.id,
          rumorText: 'A notable transaction has stirred '+primarySet.name+': '+Math.abs(p.amount).toLocaleString()+'gp '+(p.amount>=0?'arrived in':'left')+' the coffers of '+dName+'.',
          apparentLevel: 'common',
          truthLevel: 'true',
          topic: 'wealth',
          sourceEventId: event.id,
          sourceCharacterId: p.sourceCharacterId || null
        });
      }
    }
  }
  return {
    result: {
      domainsChanged: [p.domainId], charactersChanged: [], hexesChanged: [],
      treasuryDelta: p.amount,
      narrativeSummary: 'Treasury '+(p.amount >= 0 ? 'grant' : 'debit')+' to '+p.domainId+': '+(p.amount >= 0 ? '+' : '')+p.amount+'gp · '+(p.label||'no label')+source,
      treasuryChange: change
    }
  };
}
registerEventHandler('treasury-grant', applyEvent_treasuryGrant);

// --- treasury-debit ---
// Same engine path as treasury-grant but conventionally negative-signed. Validator allows positive
// numbers; the handler inverts so submitters who write `amount: 500, kind:"treasury-debit"` work
// intuitively. If submitters pass negative on a debit, they get the negative-of-negative they
// intended only if they pass a positive number — defensive: take absolute value, then negate.
function applyEvent_treasuryDebit(campaign, event){
  const p = event.payload || {};
  if(typeof p.amount !== 'number') throw new Error('treasury-debit: amount must be a number');
  const absDelta = -Math.abs(p.amount);
  const change = _applyTreasuryDelta(campaign, p.domainId, absDelta, p.label);
  return {
    result: {
      domainsChanged: [p.domainId], charactersChanged: [], hexesChanged: [],
      treasuryDelta: absDelta,
      narrativeSummary: 'Treasury debit from '+p.domainId+': '+absDelta+'gp · '+(p.label||'no label')+' · reason: '+(p.reason||'(none)'),
      treasuryChange: change
    }
  };
}
registerEventHandler('treasury-debit', applyEvent_treasuryDebit);

// --- character-update ---
// Apply a flat map of fieldPath → newValue to a single character. Used by external tools that
// want to push state changes from off-system play (XP, HP, inventory, location).
function applyEvent_characterUpdate(campaign, event){
  const p = event.payload || {};
  const ch = (campaign.characters||[]).find(x => x.id === p.characterId);
  if(!ch) throw new Error('character-update event references unknown characterId: '+p.characterId);
  const fields = p.fieldUpdates || {};
  const previousValues = {};
  Object.keys(fields).forEach(path => {
    previousValues[path] = _setByPath(ch, path, fields[path]);
  });
  return {
    result: {
      domainsChanged: [], charactersChanged: [ch.id], hexesChanged: [],
      treasuryDelta: 0,
      narrativeSummary: 'Character '+ch.name+' updated: '+Object.keys(fields).join(', ')+(p.reason ? ' ('+p.reason+')' : ''),
      previousValues: previousValues
    }
  };
}
registerEventHandler('character-update', applyEvent_characterUpdate);

// --- adventure-result ---
// Outcome of an adventure resolved off-system (RPG Maker dungeon delver, tabletop session, etc).
// Effects: marks hex as explored, clears named lair from the hex (outcome === 'cleared'), awards gp
// to a destination (domain treasury or a named character's personalGp), awards XP to listed
// characters, applies casualties (HP changes, alive=false, deceasedTurn). All optional — narrative-only
// events are valid (only `outcome` is required).
function applyEvent_adventureResult(campaign, event){
  const p = event.payload || {};
  const changed = { domainsChanged: [], charactersChanged: [], hexesChanged: [] };
  let treasuryDelta = 0;
  const summaryParts = [];

  // Locate the hex (if specified) and the domain it belongs to.
  let targetHex = null;
  let targetDomainId = null;
  if(p.hexId){
    (campaign.domains||[]).forEach(d => {
      const h = (d.geography?.hexes||[]).find(x => x.id === p.hexId);
      if(h){ targetHex = h; targetDomainId = d.id; }
    });
    if(!targetHex) throw new Error('adventure-result: hex not found: '+p.hexId);
    if(!targetHex.explored){ targetHex.explored = true; changed.hexesChanged.push(targetHex.id); summaryParts.push('hex '+targetHex.id+' marked explored'); }
  }

  // Clear named lair when outcome is "cleared".
  if(p.lairId && targetHex && p.outcome === 'cleared'){
    const before = (targetHex.lairs||[]).length;
    targetHex.lairs = (targetHex.lairs||[]).filter(l => l.id !== p.lairId);
    if(targetHex.lairs.length < before){
      changed.hexesChanged.push(targetHex.id);
      summaryParts.push('lair '+p.lairId+' cleared');
    }
  }
  // Clear named dungeon when outcome is "cleared".
  if(p.dungeonId && targetHex && p.outcome === 'cleared'){
    const before = (targetHex.dungeons||[]).length;
    targetHex.dungeons = (targetHex.dungeons||[]).filter(d => d.id !== p.dungeonId);
    if(targetHex.dungeons.length < before){
      changed.hexesChanged.push(targetHex.id);
      summaryParts.push('dungeon '+p.dungeonId+' cleared');
    }
  }

  // Treasure awards. Each entry can route to a character's personalGp or to a domain's treasury.
  // Default destination: if `destinationDomainId` is set on the entry, treasury; if `destinationCharacterId`,
  // character; otherwise default to the hex's owning domain treasury.
  (p.treasureAwarded||[]).forEach(t => {
    if(t.kind === 'gp' && typeof t.amount === 'number'){
      if(t.destinationCharacterId){
        const ch = (campaign.characters||[]).find(x => x.id === t.destinationCharacterId);
        if(ch){
          // Items I1 — route to the coin purse (coins.gp canonical) + keep the personalGp mirror (rule #10).
          if(!ch.coins || typeof ch.coins !== 'object') ch.coins = { pp:0, gp:(Number(ch.personalGp)||0), ep:0, sp:0, cp:0 };
          ch.coins.gp = (Number(ch.coins.gp) || 0) + t.amount;
          ch.personalGp = ch.coins.gp;
          changed.charactersChanged.push(ch.id);
          summaryParts.push('+'+t.amount+'gp to '+ch.name);
        }
      } else {
        const destDom = t.destinationDomainId || targetDomainId;
        if(destDom){
          const change = _applyTreasuryDelta(campaign, destDom, t.amount, t.label || 'adventure treasure');
          changed.domainsChanged.push(destDom);
          treasuryDelta += t.amount;
          summaryParts.push('+'+t.amount+'gp to '+destDom);
        }
      }
    }
    // Non-gp treasure (magic items, gems) just gets logged in the narrative; full inventory hooks come later.
  });

  // XP awards.
  (p.xpAwarded||[]).forEach(award => {
    const ch = (campaign.characters||[]).find(x => x.id === award.characterId);
    if(ch && typeof award.xp === 'number'){
      ch.xp = (ch.xp || 0) + award.xp;
      changed.charactersChanged.push(ch.id);
      summaryParts.push('+'+award.xp+'XP to '+ch.name);
    }
  });

  // Casualties.
  (p.casualties||[]).forEach(cas => {
    const ch = (campaign.characters||[]).find(x => x.id === cas.characterId);
    if(!ch) return;
    if(cas.outcome === 'killed'){
      ch.alive = false;
      ch.deceasedTurn = event.targetTurn || event.appliedAtTurn || campaign.currentTurn || 1;
      summaryParts.push(ch.name+' killed');
    } else if(cas.outcome === 'wounded'){
      if(typeof cas.hp === 'number' && ch.hp){
        ch.hp.current = cas.hp;
      }
      summaryParts.push(ch.name+' wounded'+(typeof cas.hp === 'number' ? ' (HP '+cas.hp+')' : ''));
    }
    changed.charactersChanged.push(ch.id);
  });

  const narrative = 'Adventure: '+p.outcome+
    (summaryParts.length ? ' · '+summaryParts.join(', ') : '')+
    (p.narrativeSummary ? ' · "'+p.narrativeSummary.substring(0,120)+(p.narrativeSummary.length>120?'..."':'"') : '');
  // Foundation #14 auto-emit hook: significant adventure outcomes generate rumors at the
  // nearest settlement of the affected hex's owning domain.
  if(targetDomainId && p.outcome === 'cleared' && (p.lairId || p.dungeonId)){
    const nearby = settlementsForDomain(campaign, targetDomainId)[0];
    if(nearby){
      const what = p.lairId ? 'lair' : 'dungeon';
      _autoEmitRumor(campaign, {
        settlementId: nearby.id,
        rumorText: 'Word arrives in '+nearby.name+': the '+what+' at '+(targetHex?.notes || p.hexId)+' has been cleared.',
        apparentLevel: 'uncommon',
        truthLevel: 'true',
        topic: 'monster',
        sourceEventId: event.id
      });
    }
  }
  // Notable casualty rumors — if a named character died, the news travels
  (p.casualties||[]).forEach(cas => {
    if(cas.outcome !== 'killed') return;
    const ch = (campaign.characters||[]).find(x => x.id === cas.characterId);
    if(!ch) return;
    // Find a settlement in the character's currentDomainId, or in the target domain
    const dForRumor = ch.currentDomainId || targetDomainId;
    const settlement = dForRumor ? settlementsForDomain(campaign, dForRumor)[0] : null;
    if(settlement){
      _autoEmitRumor(campaign, {
        settlementId: settlement.id,
        rumorText: ch.name+' has fallen. Word reaches '+settlement.name+' within days.',
        apparentLevel: 'uncommon',
        truthLevel: 'true',
        topic: 'scandal',
        sourceEventId: event.id,
        sourceCharacterId: ch.id
      });
    }
  });
  return {
    result: Object.assign({}, changed, {
      treasuryDelta: treasuryDelta,
      narrativeSummary: narrative
    })
  };
}
registerEventHandler('adventure-result', applyEvent_adventureResult);

// --- daw-result (stub) ---
// Receiver-only for Phase 3 Domains-at-War subsystem (#144). Applies unit losses to the named
// domain's garrison.units by decrementing counts. Full DaW resolution (combat rolls, supply,
// morale, command, maneuvers) lives in #144 — this handler just absorbs whatever a DaW frontend
// emits and records the outcome.
function applyEvent_dawResult(campaign, event){
  const p = event.payload || {};
  const changed = { domainsChanged: [], charactersChanged: [], hexesChanged: [] };
  function applyLossesToDomain(domainId, losses){
    if(!domainId) return;
    const d = (campaign.domains||[]).find(x => x.id === domainId);
    if(!d || !d.garrison) return;
    (losses||[]).forEach(loss => {
      const u = (d.garrison.units||[]).find(x => x.id === loss.unitId);
      if(u){
        u.count = Math.max(0, (u.count||0) - (loss.count||0));
        changed.domainsChanged.push(d.id);
      }
    });
  }
  applyLossesToDomain(p.attackerDomainId, p.attackerLosses);
  applyLossesToDomain(p.defenderDomainId, p.defenderLosses);
  return {
    result: Object.assign({}, changed, {
      treasuryDelta: 0,
      narrativeSummary: 'Battle outcome: '+(p.outcome||'(unknown)')+
        (p.attackerDomainId ? ' · attacker '+p.attackerDomainId : '')+
        (p.defenderDomainId ? ' vs defender '+p.defenderDomainId : '')+
        (p.narrativeSummary ? ' · "'+p.narrativeSummary.substring(0,100)+(p.narrativeSummary.length>100?'..."':'"') : '')
    })
  };
}
registerEventHandler('daw-result', applyEvent_dawResult);

// --- venture-result ---
// Records the outcome of a mercantile venture (Phase 2b) and emits rumors at the destination
// settlement for notable outcomes. The actual venture-state mutation (status, finalSalePrice,
// vagaries) lives in the Phase 2b commitTurn machinery; this handler is mostly a synthetic event
// the engine emits OR a tool emits when it wants to push a venture outcome from off-system play.
function applyEvent_ventureResult(campaign, event){
  const p = event.payload || {};
  const venture = (campaign.ventures||[]).find(v => v.id === p.ventureId);
  const changed = { domainsChanged: [], charactersChanged: [], hexesChanged: [] };
  let narrative = 'Venture '+p.ventureId+' outcome: '+p.outcome;
  if(venture){
    venture.status = p.outcome === 'arrived' ? 'completed' : (p.outcome === 'annihilated' ? 'failed' : (p.outcome || venture.status));
    if(typeof p.finalSalePrice === 'number') venture.finalSalePrice = p.finalSalePrice;
    if(venture.destinationDomainId) changed.domainsChanged.push(venture.destinationDomainId);
    narrative = 'Venture "'+(venture.label||venture.id)+'" '+p.outcome+(p.finalSalePrice?' at '+p.finalSalePrice.toLocaleString()+'gp':'');
    // Rumor emission at the destination settlement
    const destDomainId = venture.destinationDomainId;
    if(destDomainId){
      const destSet = settlementsForDomain(campaign, destDomainId)[0];
      if(destSet){
        let rumorText;
        let topic = 'trade';
        let apparent = 'uncommon';
        if(p.outcome === 'arrived'){
          rumorText = 'A laden caravan has arrived at '+destSet.name+(p.finalSalePrice ? ' — '+p.finalSalePrice.toLocaleString()+'gp changed hands.' : '.');
        } else if(p.outcome === 'annihilated'){
          rumorText = 'A merchant venture bound for '+destSet.name+' has been lost entirely. The cargo is gone.';
          topic = 'scandal'; apparent = 'common';
        } else if(p.outcome === 'failed'){
          rumorText = 'The venture toward '+destSet.name+' has foundered. Modest losses are whispered.';
        } else {
          rumorText = 'Word of a venture\'s fate reaches '+destSet.name+'.';
        }
        _autoEmitRumor(campaign, {
          settlementId: destSet.id,
          rumorText: rumorText,
          apparentLevel: apparent,
          truthLevel: 'true',
          topic: topic,
          sourceEventId: event.id,
          sourceCharacterId: venture.venturerCharacterId || null
        });
      }
    }
  }
  return {
    result: Object.assign({}, changed, {
      treasuryDelta: 0,
      narrativeSummary: narrative
    })
  };
}
registerEventHandler('venture-result', applyEvent_ventureResult);

// --- claude-event (stub) ---
// AI-suggested narrative event. The handler records the narrative; if payload.mechanicalEffect is
// present (and itself a valid event payload with `kind` and embedded payload), it dispatches recursively.
// Full Claude oracle integration is Phase 6.
function applyEvent_claudeEvent(campaign, event){
  const p = event.payload || {};
  const narrative = '['+p.scope+'] '+(p.title||'Claude event')+': '+(p.narrativeText||'').substring(0,160);
  // If a mechanical effect is attached, build a child event and apply it.
  let childResult = null;
  if(p.mechanicalEffect && p.mechanicalEffect.kind && isEventKindKnown(p.mechanicalEffect.kind)){
    const childEvent = newEvent(p.mechanicalEffect.kind, {
      submittedBy: event.submittedBy,
      targetTurn: event.targetTurn,
      payload: p.mechanicalEffect.payload || p.mechanicalEffect,
      parentEventId: event.id
    });
    try{
      childResult = applyEvent(campaign, childEvent);
    }catch(e){
      childResult = { result: { domainsChanged:[], charactersChanged:[], hexesChanged:[], treasuryDelta:0, narrativeSummary:'mechanical effect failed: '+e.message } };
    }
  }
  return {
    result: {
      domainsChanged: childResult?.result?.domainsChanged || [],
      charactersChanged: childResult?.result?.charactersChanged || [],
      hexesChanged: childResult?.result?.hexesChanged || [],
      treasuryDelta: childResult?.result?.treasuryDelta || 0,
      narrativeSummary: narrative + (childResult ? ' · effect: '+childResult.result.narrativeSummary : '')
    }
  };
}
registerEventHandler('claude-event', applyEvent_claudeEvent);

// --- gm-narrative handler (#551 Wave Entity-B — 2026-05-31) ---
// Pure narrative event: no state change. Records title + body + (optional) notes.
// Used by the Chronicle Entry sub-tab. Attached entities live on event.context.relatedEntities[].
function applyEvent_gmNarrative(campaign, event){
  const p = event.payload || {};
  const title = (p.title || '').trim() || '(untitled chronicle)';
  const body = (p.body || '').trim();
  const summary = body ? (title + ' — ' + body.slice(0, 120) + (body.length > 120 ? '…' : '')) : title;
  return { result: {
    domainsChanged: [], charactersChanged: [], hexesChanged: [],
    treasuryDelta: 0,
    narrativeSummary: summary
  }};
}
registerEventHandler('gm-narrative', applyEvent_gmNarrative);

// engine-standard-turn handler — synthetic event emitted by commitTurn to record what the
// standard monthly math did for a domain this turn. Stored as-is in the event log; no further
// state change at apply time. (The actual math runs in the Alpine commitTurn; this just
// captures the summary for the audit log.)
function applyEvent_engineStandardTurn(campaign, event){
  const p = event.payload || {};
  return {
    result: {
      domainsChanged: p.domainId ? [p.domainId] : [],
      charactersChanged: [], hexesChanged: [],
      treasuryDelta: (p.turnSnapshot?.treasuryDelta) || 0,
      narrativeSummary: 'Standard month-end pass for '+(p.domainId||'(campaign)')+' — turn '+(event.targetTurn||0)
    }
  };
}
registerEventHandler('engine-standard-turn', applyEvent_engineStandardTurn);

// --- character-level-up handler --- (Foundation #234)
// Engine auto-leveling already writes character state inline during commit; this handler
// exists for tools/admins that submit a level-up externally (e.g., GM-forced via Player Portal).
// Idempotent: re-applying with the same newLevel is a no-op.
function applyEvent_characterLevelUp(campaign, event){
  const p = event.payload || {};
  if(!p.characterId) throw new Error('character-level-up: missing characterId');
  if(typeof p.newLevel !== 'number') throw new Error('character-level-up: missing or invalid newLevel');
  const ch = (campaign.characters || []).find(c => c.id === p.characterId);
  if(!ch) throw new Error('character-level-up: character not found: ' + p.characterId);
  const oldLevel = p.oldLevel != null ? p.oldLevel : (ch.level || 1);
  if((ch.level || 1) < p.newLevel) ch.level = p.newLevel;
  if(p.hpGained && typeof ch.hpMax === 'number') ch.hpMax = (ch.hpMax || 0) + p.hpGained;
  return {
    result: {
      domainsChanged: [], hexesChanged: [],
      charactersChanged: [p.characterId],
      treasuryDelta: 0,
      narrativeSummary: p.narrativeSummary
        || ('Level up: ' + (ch.name||p.characterId) + ' — ' + (ch.class||'?') + ' L' + oldLevel + ' → L' + p.newLevel + (p.hpGained?' (+'+p.hpGained+' HP)':'') + (p.source==='gm-fiat'?' (GM override)':''))
    }
  };
}
registerEventHandler('character-level-up', applyEvent_characterLevelUp);

// --- character-death handler --- (Foundation #234)
// Soft-delete via alive=false. Records death turn for the per-character history.
function applyEvent_characterDeath(campaign, event){
  const p = event.payload || {};
  if(!p.characterId) throw new Error('character-death: missing characterId');
  const ch = (campaign.characters || []).find(c => c.id === p.characterId);
  if(!ch) throw new Error('character-death: character not found: ' + p.characterId);
  ch.alive = false;
  ch.deceasedTurn = event.appliedAtTurn || event.targetTurn || (campaign.currentTurn || 1);
  const kindWord = p.kind === 'retirement' ? 'retired' : 'died';
  return {
    result: {
      domainsChanged: [], hexesChanged: [],
      charactersChanged: [p.characterId],
      treasuryDelta: 0,
      narrativeSummary: p.narrativeSummary
        || ((ch.name||p.characterId) + ' ' + kindWord + (p.reason?' — '+p.reason:'') + '.')
    }
  };
}
registerEventHandler('character-death', applyEvent_characterDeath);

// --- passive-investment-create handler --- (Foundation #234)
// Records a passive investment. The Alpine UI may have already pushed to
// campaign.passiveInvestments at the emit site — this handler is idempotent: only inserts
// if no entry with the given id is present (so external tool submission works too).
function applyEvent_passiveInvestmentCreate(campaign, event){
  const p = event.payload || {};
  if(!p.investmentId) throw new Error('passive-investment-create: missing investmentId');
  if(!Array.isArray(campaign.passiveInvestments)) campaign.passiveInvestments = [];
  const existing = campaign.passiveInvestments.find(i => i.id === p.investmentId);
  if(!existing){
    campaign.passiveInvestments.push({
      id: p.investmentId,
      ownerCharacterId: p.ownerCharacterId,
      type: p.type,
      capital: p.capital,
      name: p.name || '',
      riskTier: p.riskTier || 'standard',
      destinationDomainId: p.destinationDomainId || null,
      enabled: true
    });
  }
  return {
    result: {
      domainsChanged: [], charactersChanged: [], hexesChanged: [],
      treasuryDelta: 0,
      narrativeSummary: p.narrativeSummary
        || ('Passive investment created — ' + (p.name||p.type) + ' (' + (p.capital||0).toLocaleString() + 'gp).')
    }
  };
}
registerEventHandler('passive-investment-create', applyEvent_passiveInvestmentCreate);

// --- passive-investment-delete handler --- (Foundation #234)
function applyEvent_passiveInvestmentDelete(campaign, event){
  const p = event.payload || {};
  if(!p.investmentId) throw new Error('passive-investment-delete: missing investmentId');
  if(!Array.isArray(campaign.passiveInvestments)) campaign.passiveInvestments = [];
  const idx = campaign.passiveInvestments.findIndex(i => i.id === p.investmentId);
  const removedName = idx >= 0 ? (campaign.passiveInvestments[idx].name || campaign.passiveInvestments[idx].type) : p.investmentId;
  if(idx >= 0) campaign.passiveInvestments.splice(idx, 1);
  return {
    result: {
      domainsChanged: [], charactersChanged: [], hexesChanged: [],
      treasuryDelta: 0,
      narrativeSummary: p.narrativeSummary
        || ('Passive investment deleted — ' + removedName + (p.reason?' ('+p.reason+')':'') + '.')
    }
  };
}
registerEventHandler('passive-investment-delete', applyEvent_passiveInvestmentDelete);

// --- venture-launch handler --- (Foundation #234)
// Records a venture going in-transit. Like passive-investment-create, the Alpine emit site
// has already pushed to campaign.ventures; handler is idempotent for external submissions.
function applyEvent_ventureLaunch(campaign, event){
  const p = event.payload || {};
  if(!p.ventureId) throw new Error('venture-launch: missing ventureId');
  if(!Array.isArray(campaign.ventures)) campaign.ventures = [];
  const existing = campaign.ventures.find(v => v.id === p.ventureId);
  if(!existing){
    // External submission: create the venture record. Internal emits (Alpine UI) skip this.
    campaign.ventures.push({
      id: p.ventureId,
      venturerCharacterId: p.venturerCharacterId,
      originDomainId: p.originDomainId || null,
      destinationDomainId: p.destinationDomainId || null,
      totalInvestment: p.totalInvestment || 0,
      expectedArrivalTurn: p.expectedArrivalTurn || (campaign.currentTurn || 1) + 1,
      cargo: p.cargo || [],
      status: 'in-transit',
      vagaries: []
    });
  }
  return {
    result: {
      domainsChanged: [], charactersChanged: [], hexesChanged: [],
      treasuryDelta: -(p.totalInvestment || 0),  // capital outlay records as negative delta
      narrativeSummary: p.narrativeSummary
        || ('Venture launched — ' + (p.totalInvestment||0).toLocaleString() + 'gp investment, expected Turn ' + (p.expectedArrivalTurn||'?'))
    }
  };
}
registerEventHandler('venture-launch', applyEvent_ventureLaunch);

// ─── Phase 4 Construction Wave A — 7 event handlers (Architecture.md §10.7) ───

// Helper: ensure history array on entity exists, append entry, return entity.
function _pushConstructionHistory(entity, entry){
  if(!entity) return entity;
  if(!Array.isArray(entity.history)) entity.history = [];
  entity.history.push(entry);
  return entity;
}

// Helper: find a project by id within the campaign.
function _findProjectInternal(campaign, id){
  return (campaign && Array.isArray(campaign.projects)) ? (campaign.projects.find(p => p && p.id === id) || null) : null;
}
function _findConstructibleInternal(campaign, id){
  return (campaign && Array.isArray(campaign.constructibles)) ? (campaign.constructibles.find(c => c && c.id === id) || null) : null;
}

// 1. construction-project-started — record the Project as under-construction.
function applyEvent_constructionProjectStarted(campaign, event){
  const p = event.payload || {};
  const proj = _findProjectInternal(campaign, p.projectId);
  if(!proj){
    return { result: { narrativeSummary: 'construction-project-started: project ' + p.projectId + ' not found; logged but no state change.' } };
  }
  // Apply optional payload overrides
  if(p.ownerCharacterId) proj.ownerCharacterId = p.ownerCharacterId;
  if(p.ownerDomainId)    proj.ownerDomainId    = p.ownerDomainId;
  if(p.siteHexId)        proj.siteHexId        = p.siteHexId;
  if(p.constructibleKind)    proj.constructibleKind    = p.constructibleKind;
  if(p.constructibleSubtype) proj.constructibleSubtype = p.constructibleSubtype;
  if(typeof p.totalCost === 'number')      proj.totalCost      = p.totalCost;
  if(typeof p.laborRequired === 'number')  proj.laborRequired  = p.laborRequired;
  proj.lifecycleState = 'under-construction';
  proj.startedAtTurn = campaign.currentTurn || null;
  _pushConstructionHistory(proj, {
    turn: campaign.currentTurn || null,
    type: 'started',
    narrative: 'Project started: ' + (proj.name || proj.constructibleSubtype || proj.constructibleKind)
  });
  return {
    result: {
      projectId: proj.id,
      narrativeSummary: 'Construction begun on ' + (proj.name || proj.constructibleSubtype || proj.constructibleKind) + ' — estimated ' + (proj.laborRequired || '?') + ' worker-days.'
    }
  };
}
registerEventHandler('construction-project-started', applyEvent_constructionProjectStarted);

// 2. construction-progress — advance a project (manual emit or day-tick driven).
function applyEvent_constructionProgress(campaign, event){
  const p = event.payload || {};
  const proj = _findProjectInternal(campaign, p.projectId);
  if(!proj){ return { result: { narrativeSummary: 'construction-progress: project not found' } }; }
  if(typeof p.laborInvested === 'number') proj.laborInvested = (proj.laborInvested||0) + p.laborInvested;
  if(typeof p.daysElapsed === 'number')   proj.daysElapsed   = (proj.daysElapsed||0) + p.daysElapsed;
  _pushConstructionHistory(proj, {
    turn: campaign.currentTurn || null,
    type: 'progress',
    narrative: p.narrative || ('+' + (p.laborInvested||0) + ' worker-days; ' + (proj.laborInvested||0) + '/' + (proj.laborRequired||'?'))
  });
  return { result: { projectId: proj.id, narrativeSummary: 'Construction progress on ' + (proj.name||proj.constructibleKind) + ': ' + (proj.laborInvested||0) + '/' + (proj.laborRequired||'?') + ' worker-days.' } };
}
registerEventHandler('construction-progress', applyEvent_constructionProgress);

// 3. construction-completed — spawn the Constructible (Wave C will populate per-kind details).
function applyEvent_constructionCompleted(campaign, event){
  const p = event.payload || {};
  const proj = _findProjectInternal(campaign, p.projectId);
  if(!proj){ return { result: { narrativeSummary: 'construction-completed: project not found' } }; }
  proj.lifecycleState = 'complete';
  proj.completedAtTurn = campaign.currentTurn || null;
  // Spawn the Constructible. Wave A pattern — minimal viable Constructible.
  // Wave C+ populates per-kind functionData + subStructures.
  const A = (typeof global !== 'undefined' && global.ACKS) || (typeof window !== 'undefined' && window.ACKS) || null;
  const factory = (A && A.blankConstructible) || null;
  let cst = p.constructibleId ? _findConstructibleInternal(campaign, p.constructibleId) : null;
  if(!cst && factory){
    cst = factory({
      id: p.constructibleId,
      constructibleKind: proj.constructibleKind,
      constructibleSubtype: proj.constructibleSubtype,
      name: proj.name || (proj.constructibleSubtype || proj.constructibleKind),
      hexId: proj.siteHexId,
      settlementId: proj.siteSettlementId,
      parentConstructibleId: proj.siteConstructibleId,
      ownerCharacterId: proj.ownerCharacterId,
      ownerDomainId: proj.ownerDomainId,
      buildValue: p.buildValue || proj.totalCost || 0,
      completedAtTurn: campaign.currentTurn || null
    });
    campaign.constructibles = campaign.constructibles || [];
    campaign.constructibles.push(cst);
  }
  _pushConstructionHistory(cst, {
    turn: campaign.currentTurn || null,
    type: 'completed',
    narrative: p.narrative || ('Constructed: ' + (cst ? cst.name : proj.name) + ' (' + (cst ? cst.buildValue : proj.totalCost) + ' gp)')
  });
  _pushConstructionHistory(proj, { turn: campaign.currentTurn || null, type: 'completed', narrative: 'Spawned Constructible ' + (cst ? cst.id : '') });
  return { result: { projectId: proj.id, constructibleId: cst ? cst.id : null, narrativeSummary: 'Completed construction of ' + (cst ? cst.name : proj.name) + ' — ' + ((cst && cst.buildValue) || 0).toLocaleString() + ' gp value.' } };
}
registerEventHandler('construction-completed', applyEvent_constructionCompleted);

// 4. construction-vagary — apply per-kind vagary effect (delay + cost penalty).
function applyEvent_constructionVagary(campaign, event){
  const p = event.payload || {};
  const proj = _findProjectInternal(campaign, p.projectId);
  if(!proj){ return { result: { narrativeSummary: 'construction-vagary: project not found' } }; }
  if(typeof p.delayDays === 'number'){
    proj.daysElapsed = (proj.daysElapsed||0) - p.delayDays;  // negative tick — delay
  }
  if(typeof p.costPenaltyGp === 'number'){
    proj.gpSpent = (proj.gpSpent||0) + p.costPenaltyGp;
  }
  _pushConstructionHistory(proj, {
    turn: campaign.currentTurn || null,
    type: 'vagary',
    vagaryKey: p.vagaryKey,
    narrative: p.narrative || ('Vagary: ' + p.vagaryKey)
  });
  return { result: { projectId: proj.id, vagaryKey: p.vagaryKey, narrativeSummary: 'Vagary on ' + (proj.name||proj.constructibleKind) + ': ' + (p.narrative||p.vagaryKey) } };
}
registerEventHandler('construction-vagary', applyEvent_constructionVagary);

// 5. construction-damaged — apply SHP loss to a Constructible.
function applyEvent_constructionDamaged(campaign, event){
  const p = event.payload || {};
  const cst = _findConstructibleInternal(campaign, p.constructibleId);
  if(!cst){ return { result: { narrativeSummary: 'construction-damaged: constructible not found' } }; }
  // Optional sub-structure path (multi-story per §10.9).
  if(p.subStructureKey && Array.isArray(cst.subStructures)){
    const sub = cst.subStructures.find(s => s && s.key === p.subStructureKey);
    if(sub){
      sub.currentShp = Math.max(0, (sub.currentShp ?? sub.maxShp ?? 0) - (p.shpLost||0));
      sub.damageState = sub.currentShp === 0 ? 'destroyed' : (sub.currentShp <= (sub.maxShp||0)/2 ? 'breached' : 'damaged');
    }
  } else {
    cst.currentShp = Math.max(0, (cst.currentShp ?? cst.maxShp ?? 0) - (p.shpLost||0));
    const max = cst.maxShp || 0;
    if(max > 0){
      cst.damageState = cst.currentShp === 0 ? 'destroyed' : (cst.currentShp <= max/4 ? 'ruined' : (cst.currentShp <= max/2 ? 'breached' : 'damaged'));
    } else {
      cst.damageState = 'damaged';
    }
  }
  _pushConstructionHistory(cst, {
    turn: campaign.currentTurn || null,
    type: 'damaged',
    source: p.source,
    shpLost: p.shpLost,
    narrative: p.narrative || ('Damaged: -' + (p.shpLost||0) + ' SHP')
  });
  return { result: { constructibleId: cst.id, damageState: cst.damageState, narrativeSummary: (cst.name || displayConstructibleKindLocal(cst)) + ' damaged: -' + (p.shpLost||0) + ' SHP → ' + cst.damageState } };
}
// Local label helper for damage events when ACKS may not be globally available.
function displayConstructibleKindLocal(c){
  if(!c) return '';
  return c.constructibleSubtype || c.constructibleKind || 'structure';
}
registerEventHandler('construction-damaged', applyEvent_constructionDamaged);

// 6. construction-repair-started — kick off a repair Project against a damaged Constructible.
function applyEvent_constructionRepairStarted(campaign, event){
  const p = event.payload || {};
  const proj = _findProjectInternal(campaign, p.projectId);
  if(!proj){ return { result: { narrativeSummary: 'construction-repair-started: project not found' } }; }
  proj.isRepair = true;
  proj.repairTargetConstructibleId = p.repairTargetConstructibleId;
  proj.lifecycleState = 'under-construction';
  proj.startedAtTurn = campaign.currentTurn || null;
  if(typeof p.totalCost === 'number')     proj.totalCost     = p.totalCost;
  if(typeof p.laborRequired === 'number') proj.laborRequired = p.laborRequired;
  _pushConstructionHistory(proj, {
    turn: campaign.currentTurn || null,
    type: 'repair-started',
    repairTargetConstructibleId: p.repairTargetConstructibleId,
    narrative: 'Repair begun on ' + p.repairTargetConstructibleId
  });
  const target = _findConstructibleInternal(campaign, p.repairTargetConstructibleId);
  if(target){
    target.constructionState = 'in-repair';
    _pushConstructionHistory(target, { turn: campaign.currentTurn || null, type: 'repair-started', projectId: proj.id, narrative: 'Repair scheduled' });
  }
  return { result: { projectId: proj.id, narrativeSummary: 'Repair work begun on ' + (target ? target.name : p.repairTargetConstructibleId) + '.' } };
}
registerEventHandler('construction-repair-started', applyEvent_constructionRepairStarted);

// 7. construction-demolished — deliberate demolition or 0-SHP destruction.
function applyEvent_constructionDemolished(campaign, event){
  const p = event.payload || {};
  const cst = _findConstructibleInternal(campaign, p.constructibleId);
  if(!cst){ return { result: { narrativeSummary: 'construction-demolished: constructible not found' } }; }
  cst.constructionState = 'being-demolished';
  cst.damageState = 'destroyed';
  cst.operationalState = 'abandoned';
  _pushConstructionHistory(cst, {
    turn: campaign.currentTurn || null,
    type: 'demolished',
    reason: p.reason,
    narrative: p.narrative || ('Demolished: ' + (cst.name || displayConstructibleKindLocal(cst)) + (p.reason ? ' (' + p.reason + ')' : ''))
  });
  return { result: { constructibleId: cst.id, narrativeSummary: 'Demolished ' + (cst.name || displayConstructibleKindLocal(cst)) + '.' } };
}
registerEventHandler('construction-demolished', applyEvent_constructionDemolished);

// ─── Phase 2.5 Journeys (#475 — J1) — defensive event handlers ───
// The Journey day-tick consumer mutates journey state in its commit() and emits these
// events as an audit trail via emitDayTickEvents (which constructs + pushes the event
// directly, NOT through applyEvent). These handlers exist only so the events are
// well-formed and self-describing if ever replayed through the apply pipeline (e.g. a
// future Portal log replay). They DO NOT re-advance the journey — that already happened
// in the consumer commit — so applying one is a safe no-op beyond recording a narrative.
function applyEvent_journeyAudit(campaign, event){
  const p = (event && event.payload) || {};
  return { result: { journeyId: p.journeyId || null, narrativeSummary: p.narrative || (event && event.kind) || 'journey event' } };
}
registerEventHandler('journey-start', applyEvent_journeyAudit);
registerEventHandler('journey-day-tick', applyEvent_journeyAudit);
registerEventHandler('journey-arrived', applyEvent_journeyAudit);
registerEventHandler('journey-lost', applyEvent_journeyAudit);
registerEventHandler('journey-resupply', applyEvent_journeyAudit);
registerEventHandler('journey-encounter', applyEvent_journeyAudit);
registerEventHandler('journey-aborted', applyEvent_journeyAudit);
registerEventHandler('journey-rerouted', applyEvent_journeyAudit);



// ─── #541 Event Wizard support (Architecture.md §10.12 — 2026-05-30) ───
// Per feedback-event-wizard-as-gm-surface: every event kind is GM-emittable through
// the Event Wizard by default. Subsystems opt OUT here when they own a dedicated flow
// that would skip important logic if emitted raw.
const EVENT_WIZARD_OPTOUT = Object.freeze(new Set([
  'engine-standard-turn',  // engine internal flow — emitting raw would create chaos
  'recruit-hireling',      // owned by Recruiting Wizard — skips candidate individuation
  'venture-launch',        // owned by Launch Venture modal — skips investment validation
  'character-level-up',    // owned by level-up auto-flow — skips XP/class progression
  'character-death',       // owned by character sheet retire/delete — too consequential for raw emit
  'gm-narrative',          // owned by Chronicle Entry sub-tab — has its own rich UI
  // Phase 2.5 Journeys (#475 — J1) — emitted by the day-tick consumer + startJourney,
  // not authored raw (raw emit would skip the journey state transitions).
  'journey-start', 'journey-day-tick', 'journey-arrived', 'journey-lost', 'journey-resupply', 'journey-encounter', 'journey-aborted', 'journey-rerouted'
]));

function isWizardEmittable(kind){ return isEventKindKnown(kind) && !EVENT_WIZARD_OPTOUT.has(kind); }
function wizardEmittableKinds(){ return EVENT_KINDS.filter(isWizardEmittable); }

// Returns a scaffolded payload object for the given kind, prefilling required fields
// with null and optional fields with sensible defaults from the schema. Used by the
// Event Wizard to seed its JSON editor when a new kind is picked.
function defaultPayloadFor(kind){
  const schema = EVENT_SCHEMAS[kind];
  if(!schema) return {};
  const out = {};
  const fill = (obj, descriptors) => {
    for(const [name, type] of Object.entries(descriptors || {})){
      switch(type){
        case 'string':  obj[name] = ''; break;
        case 'number':  obj[name] = 0;  break;
        case 'array':   obj[name] = []; break;
        case 'object':  obj[name] = {}; break;
        default:        obj[name] = null;
      }
    }
  };
  fill(out, schema.R);
  return out;
}

// ─── Attach to ACKS namespace ────────────────────────────────────────────
const ACKS = global.ACKS = global.ACKS || {};
Object.assign(ACKS, {
  EVENT_KINDS, EVENT_STATUS, EVENT_SCHEMAS, EVENT_WIZARD_OPTOUT, isWizardEmittable, wizardEmittableKinds, defaultPayloadFor, EVENT_SUBMITTER_PATTERN, newEvent, validateEvent, isEventKindKnown, isEventStatusValid, eventsTargetingTurn, eventsTargetingDomain, eventsByKind, eventsBySubmitter, pendingEventCount, compareEventOrder, sortEventsForApply, applyEvent, registerEventHandler, migratePendingPlayerInputToEvents,
  // Safe dotted-path writer + its guard (prototype-pollution hardening, appsec C1).
  // Exposed so the safe-write contract is testable + reusable by integrators.
  _setByPath, assertSafeFieldPath, SAFE_FIELDPATH_RE, DANGEROUS_PATH_SEGMENTS,
  // Exposed so handlers in other modules (acks-engine-subsystems.js) can
  // auto-emit rumors. Gated internally on the 'rumors-auto-emit' house rule.
  _autoEmitRumor
});

if(typeof module !== 'undefined' && module.exports){
  module.exports = ACKS;
}

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
