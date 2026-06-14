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
  // Phase 2.5 Provisioning V4 (2026-06-06) — the general Forage/Hunt activity record. Emitted by
  // forageActivity/huntActivity (record-only; the verb already applied the yield) — opted out of the
  // Event Wizard below. Carries payload.activityCost so the #346 day budget counts it (forage=ancillary,
  // hunt=dedicated).
  'provisioning-activity',
  // CoL-1 (Phase 2.5 Provisioning §16.2, 2026-06-08) — off-journey survival day record. Engine-emitted
  // by the 'survival' day-consumer (the field/settled counterpart of journey-day-tick); record-only,
  // campaignLogHidden on a recovery-only day, surfaced when a condition is active. Event Wizard opt-out.
  'survival-day',
  // #476 M4/E5 (2026-06-10/11) — a Wilderness Search hour (RR pp.276–277) or a search for
  // tracks (RR p.120). Emitted by hexSearchActivity/beginTracking (record-only; the verb already
  // rolled + applied). Carries payload.activityCost (one ancillary) for the #346 day budget.
  // ALWAYS campaignLogHidden — the audit + budget record; discovery is narrated by lair-discovered.
  'hex-search',
  // #476 M4 — the players learn of a lair (search / tracking / GM reveal). The chronicle-visible
  // counterpart of the hex-search record; emitted alongside discoverLair (which owns the state flip).
  'lair-discovered',
  // #476 E10 (2026-06-12) — domain-morale banditry (RR pp.350–351): the monthly reconcile's record.
  // Emitted by processBanditryForTurn when something CHANGED (bands rose / swelled / waned /
  // disbanded, or casualties settled as population loss); a no-change plague month emits nothing.
  // Record-only (the processor already applied the world changes); chronicle-visible.
  'domain-banditry',
  // Phase 3 Military W2 (2026-06-12) — one Vagaries of Incursion domain encounter (JJ
  // pp.100–106): the daily probability struck, monsters arrived. The payload carries the
  // whole verdict bundle (probability + identity + linger/migrate + the domain reaction +
  // recon-lite + the platoon-scale BR comparison); the context envelope carries the entry
  // hex + the domain + the materialized Group. Record-only (the incursion day consumer's
  // commit already placed the band); chronicle-visible.
  'domain-incursion',
  // Phase 3 Military W3 (2026-06-12) — the battle engine (RR pp.461–472). All three are
  // record-only audits emitted by acks-engine-battles.js, stamping subdayContext =
  // {cadence:'battle-turn', battleId, turnNumber} (the reserved field's second referent).
  // battle-started: the engagement is joined (beginBattle); chronicle-visible.
  'battle-started',
  // battle-turn: one ~10-minute battle turn's digest (the lines ride the payload).
  // Always campaignLogHidden — the audit trail; battle-resolved narrates.
  'battle-turn',
  // battle-resolved: the ONE comprehensive outcome record (applyBattleAftermath) —
  // winner, casualties, spoils, XP; chronicle-visible.
  'battle-resolved',
  // Phase 3 Military W4 (2026-06-12) — the campaign cycle (RR pp.447–460). Both are
  // record-only audits emitted through the day-tick notable channel (the slot-88
  // military consumer); the commits write the state.
  // army-contact: two opposing armies met in a 6-mile hex — both contact recon
  // results, the derived awareness, the strategic situation, and (when stances make
  // a battle) the created Battle's id. Chronicle-visible.
  'army-contact',
  // domain-warfare: the invasion/occupation/conquest/pillage lifecycle, action-
  // discriminated (payload.action: invaded | occupied | occupation-ended |
  // conquered | pillaged | requisitioned | looted — the F&D/E10 one-kind-many-actions pattern).
  // Chronicle-visible.
  'domain-warfare',
  // Phase 3 Military W5 (2026-06-13) — the weekly supply check outcome (type: army-supplied |
  // army-out-of-supply). Owned by the slot-88 military consumer's commit (applyArmySupplyOutcome
  // pays the cost / sets the RR p.452 ladder); routine "in supply" records are campaign-log-hidden.
  'army-supply',
  // Phase 3 Military W6 (2026-06-13, burst3 team session) — the siege lifecycle (RR pp.473–485),
  // record-only audits owned by acks-engine-sieges.js (the Siege entity + the slot-90 consumer
  // hold the state). siege-started: the investment begins (chronicle-visible). siege-progress:
  // a method milestone — blockade established / bombardment / assault joined / capture-ready /
  // supplies-exhausted (routine reduction days are campaignLogHidden). siege-resolved: the
  // stronghold is captured / destroyed / surrenders, or the siege is lifted (chronicle-visible).
  'siege-started',
  'siege-progress',
  'siege-resolved',
  // #476 Encounter layer E1 (2026-06-10) — the ONE comprehensive resolution record per encounter
  // (the travel-day idiom): outcome + the whole step walk in the payload, both sides in the context
  // envelope, subdayContext.encounterId stamped. Emitted by recordEncounterResolved (which owns the
  // entity flip); campaignLogHidden when the outcome is no-encounter.
  'encounter-resolved',
  // #476 E1 — one influence attempt on a standing encounter (RR pp.286–287). Record-only + always
  // campaignLogHidden (table chatter; the resolution event narrates). Carries payload.activityCost
  // for the #346 day budget on the 3rd+ attempts (1 hour = ancillary, a work-day+ = dedicated).
  'encounter-influence',
  // Favors & Duties (#230, F&D-1 — 2026-06-08) — the monthly liege↔vassal edict record
  // (grant / demand / revoke / recurring gp flow). Engine-emitted by the monthly turn's
  // auto-roll; record-only (audit). Event Wizard opt-out (the GM authors the OBLIGATION via
  // Inspector Create, not the event). Carries the Event.context envelope.
  'favor-duty',
  // #551 Wave Entity-B (2026-05-31) — Chronicle Entry freeform GM narrative
  'gm-narrative',
  // GP Wave B (2026-06-04, Architecture.md §4.3) — the wealth/item movement grammar.
  // wealth-transfer = the canonical coin/gp PRIMITIVE; item-transfer = the symmetric
  // item-line PRIMITIVE; market-transaction = the semantic COMPOUND that composes both
  // (a priced buy/sell at a market). The primitives carry typed source/destination handles.
  'wealth-transfer',
  'item-transfer',
  'market-transaction',
  // === Proficiency PT-1 (team) ===
  // A stand-alone GM proficiency throw (RR pp.9-10). Record-only + always campaignLogHidden
  // (a die roll is table chatter — DQ6); emitted by ACKS.recordProficiencyThrow only when the
  // GM ticks "record" in the throw modal. The throw itself is ephemeral by default.
  'proficiency-throw',
  // === DC-2 (team) ===
  // Domain Completion DC-2 (2026-06-13) — RR p.340 classification advancement
  // (Outlands→Borderlands→Civilized) fired by the monthly turn. Record-only (the floor was
  // already applied by processClassificationAdvancement); chronicle-visible. Carries the
  // Event.context envelope (the domain + its capital hex).
  'domain-advanced',
  // === Religion R1 (team 2026-06-13) — divine-power accrual + consumers (RR pp.421–425, #146) ===
  // Engine-emitted record-only events (the verbs in acks-engine-religion.js already applied state).
  'divine-power-accrued',   // a divine caster's expiring ledger gains DP (congregation / domain-worship / gm-grant)
  'consecration',           // DP spent on a consecration act (consecrate-fields / a generic divine spend)
  'divine-favor-changed',   // the character↔deity relation changes (favor established / standing / pray-and-sacrifice)
  // === Religion R2 (team 2026-06-14) — blood sacrifice (the Chaotic path, RR pp.421–422) ===
  'blood-sacrifice',        // a divine/arcane caster sacrifices a victim for divine/arcane power
  // === Hijinks HJ-1 (team) ===
  // Phase 2.7 (RR pp.360–370) — hijink lifecycle, engine-emitted by startHijink (launch)
  // + the slot-60 'hijinks' day-consumer commit (resolution). Record-only audit; Event
  // Wizard opt-out below. Carry the Event.context envelope (perpetrator + hex + settlement).
  'hijink-attempted',
  'hijink-resolved',
  // === Delves D1 — Mortal Wounds (team burst3 2026-06-13) ===
  // RR pp.300–301 + Appendix C pp.517–523. Record-only audit — the wound/recovery state is
  // applied by ACKS.applyMortalWound + the slot-58 convalescence consumer (acks-engine-mortal-
  // wounds.js); these events keep the eventLog well-formed on replay. Carry the Event.context
  // envelope (the wounded character as subject). 'mortal-wound' also records a Tampering side effect.
  'mortal-wound',
  'wound-recovery',
  // === Hijinks HJ-2 (team 2026-06-13) === — syndicate/tribute/trial lifecycle (RR pp.358–369),
  // engine-emitted by formSyndicate / collectSyndicateTribute / resolveHijinkTrial. Record-only.
  'hijink-syndicate-formed',
  'hijink-tribute',
  'hijink-trial',
  // === Character Lifecycle CL-1 (burst4) === — aging (RR p.19). Record-only audit: the age/category
  // /attribute state is applied by ACKS.processAgingForTurn (acks-engine-lifecycle.js, the monthly pass
  // hooked into commitTurn); these keep the eventLog well-formed + carry the Event.context envelope
  // (the aging character as subject). 'death-from-old-age' carries the Death-save result (died bool).
  'aging-milestone',
  'death-from-old-age',
  // === Treasure Generation #142 (burst5 2026-06-14) === — record-only audit of a generated hoard's
  // materialization (ACKS.materializeHoard, acks-engine-treasure.js). The state is applied by the stash
  // setters (depositToStash / promoteLineToNotableItem) + minted captive Characters; this keeps the
  // eventLog well-formed + carries the Event.context envelope (primaryHexId = the hoard's hex,
  // relatedEntities = the lair + any captives). Treasure generation is GM authoring, never a character activity.
  'treasure-generated',
  // === Sages SG-1 (burst5 b5-sages, #147) === — a sage consultation (RR p.171 / p.112): a lore
  // query resolved on the shipped Proficiency-Throws Layer-1 die (in-specialty 3+ / out 18+, or a
  // PC-sage's Knowledge/Loremastery throw), the fee via GP Wave B. Record-only (the consultSage
  // verb already rolled + debited the fee); chronicle-visible (the answer narrates). Carries the
  // §528 envelope (sage = source, client = beneficiary) + payload.activityCost (the #346 day).
  'sage-consultation',
  // === Politics P-2 (burst5 2026-06-14) === — the senate engine (RR pp.355–360, #147). Engine-emitted,
  // record-only audit: senateVote / enactPolicy (acks-engine-politics.js) already applied state (the vote
  // is a derived consultation; enactPolicy sets/clears senate.dispute). These keep the eventLog well-formed
  // + carry the Event.context envelope (apex hex + ruler + the voting senators). Wizard opt-out below.
  'senate-vote',
  'policy-enacted'
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
  },
  // Phase 2.5 Provisioning V4 — Forage/Hunt record. activity = 'forage'|'hunt'; forageKind =
  // 'water'|'food'|'firewood' (forage only). Carries the resolved throw + yield + the activityCost tag.
  'provisioning-activity': {
    R: { actorCharacterId: 'string', activity: 'string' },
    O: { forageKind: 'string', rolled: 'number', target: 'number', bonus: 'number', terrMod: 'number',
         success: 'boolean', auto: 'boolean', yieldDays: 'number', yieldStone: 'number',
         wanderingMonsterRisk: 'boolean', encounter: 'object', hexId: 'string', activityCost: 'object', narrative: 'string' }
  },
  // CoL-1 (Phase 2.5 Provisioning §16.2) — off-journey survival day record (engine-emitted, record-only).
  'survival-day': {
    R: {},
    O: { survivalDay: 'boolean', partyId: 'string', hexId: 'string', settled: 'boolean',
         anyHungry: 'boolean', anyThirsty: 'boolean', anyCritical: 'boolean',
         members: 'object', narrative: 'string' }
  },
  // #476 M4 — a Wilderness Search hour (RR pp.276–277) / track-home attempt (RR p.122). method =
  // 'search'|'search-specific'|'track-home'. Record-only + always campaignLogHidden (the GM's
  // secret roll — RR p.276); a discovery is narrated by the paired lair-discovered event.
  'hex-search': {
    R: { actorCharacterId: 'string', hexId: 'string', method: 'string' },
    O: { rolled: 'number', target: 'number', bonus: 'number', mod: 'number', success: 'boolean',
         foundLairId: 'string', speedMilesPerDay: 'number', specificLairId: 'string',
         encounter: 'object', survey: 'object', trackedLairId: 'string',
         activityCost: 'object', narrative: 'string' }
  },
  // #476 M4 — the players learn of a lair (the chronicle-visible discovery record; discoverLair
  // owns the knownToPlayers flip + the lair's own history stamp).
  'lair-discovered': {
    R: { lairId: 'string', hexId: 'string' },
    O: { method: 'string', byCharacterId: 'string', lairName: 'string',
         monsterCatalogKey: 'string', narrative: 'string' }
  },
  // #476 E10 — the domain-morale banditry reconcile (RR pp.350–351; engine-emitted, record-only).
  // action: 'rise' | 'swell' | 'wane' | 'disbanded' (plus killed > 0 when casualties settled as
  // population loss). bands = the live band roster after the reconcile [{groupId,count,hexId}].
  'domain-banditry': {
    R: { domainId: 'string' },
    O: { action: 'string', morale: 'number', target: 'number', killed: 'number',
         familiesLost: 'number', occupationMonths: 'number', bands: 'object', narrative: 'string' }
  },
  // Phase 3 Military W2 — the Vagaries of Incursion domain encounter (JJ pp.100–106).
  // groupId = the materialized band; chance/roll = the daily probability; identity =
  // {label,key,rarity}; disposition = lingering|migrating (+ fullStrength/treasureType);
  // reaction = {roll,total,attitude,mods}; recon = {ruler:{...},monsters:{...}};
  // brComparison = {monsterBr,garrisonBr,verdict}.
  'domain-incursion': {
    R: { domainId: 'string' },
    O: { groupId: 'string', hexId: 'string', chance: 'object', identity: 'object',
         count: 'number', disposition: 'string', fullStrength: 'boolean', treasureType: 'string',
         reaction: 'object', recon: 'object', brComparison: 'object', narrative: 'string' }
  },
  // Phase 3 Military W3 — the battle engine audits (RR pp.461–472). Emitted by
  // acks-engine-battles.js; the entity (campaign.battles[]) is the working state.
  'battle-started': {
    R: { battleId: 'string' },
    O: { hexId: 'string', name: 'string', situation: 'string', scale: 'string',
         sideA: 'object', sideB: 'object', narrative: 'string' }
  },
  'battle-turn': {
    R: { battleId: 'string', turnNumber: 'number' },
    O: { lines: 'object', narrative: 'string' }
  },
  'battle-resolved': {
    R: { battleId: 'string' },
    O: { winner: 'string', endedBy: 'string', turns: 'number', spoilsGp: 'number',
         prisoners: 'number', casualties: 'object', xp: 'object', narrative: 'string' }
  },
  // Phase 3 Military W4 — the campaign-cycle audits (RR pp.447–460). Emitted through
  // the day-tick notable channel; the military consumer's commit writes the state.
  // army-contact: both recon summaries + awareness + the strategic situation; when
  // stances make a battle, battleId points at the created W3 Battle (setup state).
  'army-contact': {
    R: { actingArmyId: 'string', otherArmyId: 'string' },
    O: { hexId: 'string', awareness: 'string', situation: 'string', situationLabel: 'string',
         battle: 'boolean', battleId: 'string', reconActing: 'object', reconOther: 'object',
         narrative: 'string' }
  },
  // domain-warfare: action ∈ invaded | occupied | occupation-ended | conquered | pillaged |
  // requisitioned | looted (the W5 requisition/loot verbs) | reaction-battle |
  // reaction-driven-off (the garrison-reaction resolution, JJ pp.104–106, 2026-06-14).
  'domain-warfare': {
    R: { action: 'string', domainId: 'string' },
    O: { armyId: 'string', hexId: 'string', occupierLeaderId: 'string', months: 'number',
         moraleRoll: 'object', math: 'object', mode: 'string', newRulerCharacterId: 'string',
         saltTheEarth: 'boolean', results: 'object',
         requisitionedGp: 'number', lootedGp: 'number', familiesLost: 'number', gp: 'number',
         groupId: 'string', battleId: 'string', forceBr: 'number', bandBr: 'number',
         attitude: 'string', effectiveAttitude: 'string',
         narrative: 'string' }
  },
  // army-supply (W5): the weekly supply check outcome.
  'army-supply': {
    R: { armyId: 'string', inSupply: 'boolean' },
    O: { cost: 'number', baseValue: 'number', lineStatus: 'string', reasons: 'object',
         condition: 'string', narrative: 'string' }
  },
  // Phase 3 Military W6 — the siege audits (RR pp.473–485). acks-engine-sieges.js owns the state.
  'siege-started': {
    R: { siegeId: 'string', besiegerArmyId: 'string' },
    O: { defenderDomainId: 'string', defenderArmyId: 'string', strongholdShp: 'number',
         unitCapacity: 'number', unitAdvantage: 'number', daysRequired: 'number',
         siteType: 'string', resolutionMode: 'string', narrative: 'string' }
  },
  'siege-progress': {
    R: { siegeId: 'string', phase: 'string' },
    O: { circumvallationFeet: 'number', storedSuppliesGp: 'number', weeksOfSupply: 'number',
         shpDealt: 'number', shpDamage: 'number', breaches: 'number', reducedToRubble: 'boolean',
         battleId: 'string', daysElapsed: 'number', daysRequired: 'number',
         campaignLogHidden: 'boolean', narrative: 'string' }
  },
  'siege-resolved': {
    R: { siegeId: 'string', outcome: 'string' },
    O: { besiegerWon: 'boolean', battleId: 'string', besiegerArmyId: 'string',
         defenderDomainId: 'string', narrative: 'string' }
  },
  // #476 E1 — the comprehensive encounter resolution record (recordEncounterResolved owns the
  // entity flip; the payload carries the whole step walk compactly).
  'encounter-resolved': {
    R: { encounterId: 'string', outcome: 'string' },
    O: { category: 'string', rarity: 'string', trigger: 'string', hexId: 'string',
         lairId: 'string', monsterCatalogKey: 'string', encounterKind: 'string',
         distanceFt: 'number', surprise: 'object', evasion: 'object', reaction: 'object',
         narrative: 'string' }
  },
  // #476 E1 — one influence attempt (record-only, always campaignLogHidden; the 3rd+ attempts
  // carry payload.activityCost for the #346 day budget per the RAW time ladder).
  'encounter-influence': {
    R: { encounterId: 'string', attemptNumber: 'number' },
    O: { actorCharacterId: 'string', roll: 'object', from: 'string', to: 'string',
         bribe: 'object', timeRequired: 'string', activityCost: 'object', narrative: 'string' }
  },
  // Favors & Duties (#230, F&D-1) — the monthly liege↔vassal edict record (RR pp.345–348).
  // Engine-emitted (record-only); the obligation lives in campaign.favorDutyObligations[].
  'favor-duty': {
    R: { kind: 'string', vassalDomainId: 'string' },
    O: { action: 'string',           // 'granted' | 'revoked' | 'recurring' | 'repaid' | 'auto-revoked' | 'nothing-to-revoke'
         obligationId: 'string', liegeCharacterId: 'string', vassalRulerCharacterId: 'string',
         isFavor: 'boolean', isOngoing: 'boolean', roll: 'number', subRoll: 'number',
         gpPerMonth: 'number', gpFlows: 'array',   // [{ from, to, amount, reason }]
         balance: 'object',          // favorDutyBalance() snapshot at grant time
         loyaltyResult: 'object',    // the excess-duty Loyalty roll, when one fired
         musterTitle: 'string', musterSchedule: 'object', narrative: 'string' }
  },
  // GP Wave B (2026-06-04, Architecture.md §4.3). source/destination are typed handles:
  //   { kind:'treasury'|'character-gp'|'character-stash'|'hex-stash'|'stash'|'party-stash'|'external', id?, label? }
  'wealth-transfer': {
    R: { amount: 'number', source: 'object', destination: 'object' },
    O: { currency: 'string', reason: 'string', bucket: 'string' }
  },
  // lines = item-line refs; their shape depends on the source/destination kind
  // (external→ : full item specs to materialise; →external / internal: held-line refs).
  'item-transfer': {
    R: { source: 'object', destination: 'object', lines: 'array' },
    O: { reason: 'string', bucket: 'string' }
  },
  // The compound. direction = 'buy'|'sell'. Composes a wealth-transfer + an item-transfer.
  'market-transaction': {
    R: { direction: 'string', actorCharacterId: 'string', lines: 'array' },
    O: { settlementId: 'string', marketClass: 'string', totalGp: 'number', currency: 'string',
         notable: 'boolean', activityCost: 'object', payFrom: 'string', itemTo: 'string', itemFrom: 'string' }
  },
  // === Proficiency PT-1 (team) ===
  // A stand-alone GM proficiency throw (RR pp.9-10). Record-only (recordProficiencyThrow logs
  // it directly as applied); no required fields beyond the actor + throw breakdown.
  'proficiency-throw': {
    R: {},
    O: { actorCharacterId: 'string', taskKey: 'string', label: 'string', target: 'number',
         natural: 'number', modifierTotal: 'number', total: 'number', success: 'boolean',
         secret: 'boolean', modifiers: 'array', narrative: 'string' }
  },
  // === DC-2 (team) ===
  // Domain Completion DC-2 — the RR p.340 classification-advancement record (engine-emitted,
  // record-only; the floor lives on domain.classificationAdvancedTo). reason ∈
  // 'pop+road+morale' | 'territory+pop+morale' | 'urban-settlement'.
  'domain-advanced': {
    R: { domainId: 'string', from: 'string', to: 'string' },
    O: { reason: 'string', atTurn: 'number', narrative: 'string' }
  },
  // === Religion R1 (team 2026-06-13) — divine-power accrual + consumers (RR pp.421–425) ===
  'divine-power-accrued': {
    R: { characterId: 'string', amountGp: 'number', source: 'string' },
    O: { deityId: 'string' }
  },
  'consecration': {
    R: { casterCharacterId: 'string', kind: 'string', divinePowerSpentGp: 'number' },
    O: { domainId: 'string', familiesConsecrated: 'number', throwResult: 'object', landValueDelta: 'number', purpose: 'string' }
  },
  'divine-favor-changed': {
    R: { characterId: 'string', action: 'string' },
    O: { deityId: 'string', standing: 'string', previousStanding: 'string', reason: 'string', divinePowerReturnedGp: 'number' }
  },
  // === Religion R2 (team 2026-06-14) — blood sacrifice (RR pp.421–422) ===
  'blood-sacrifice': {
    R: { casterCharacterId: 'string', componentValueGp: 'number' },
    O: { victimRef: 'object', multipliers: 'object', throwResult: 'object', divinePowerGained: 'number', arcaneStoredGp: 'number', yieldsNothing: 'boolean', deityId: 'string' }
  },
  // === Hijinks HJ-1 (team) === (RR pp.360–370; engine-emitted, record-only)
  'hijink-attempted': {
    R: { hijinkId: 'string', type: 'string', perpetratorCharacterId: 'string' },
    O: { bossCharacterId: 'string', settlementId: 'string', hexId: 'string', narrative: 'string' }
  },
  'hijink-resolved': {
    R: { hijinkId: 'string', outcome: 'string' },
    O: { type: 'string', rewardGp: 'number', charge: 'string', narrative: 'string' }
  },
  // === Delves D1 — Mortal Wounds (team burst3 2026-06-13) === (RR pp.300–301 + Appendix C pp.517–523)
  // A combatant felled to 0 hp rolls on the Mortal Wounds table (or a slain character rolls the
  // Tampering with Mortality side-effect — tampering:true). outcome ∈ killed|incapacitated|recovered.
  'mortal-wound': {
    R: { characterId: 'string' },
    O: { table: 'string', damageType: 'string', d20: 'number', d6: 'number', modified: 'number',
         condition: 'string', permanentWound: 'string', outcome: 'string', bedRestDays: 'number',
         tampering: 'boolean', bandId: 'string', mortalityDelta: 'number', narrative: 'string' }
  },
  // An incapacitated character finishes convalescence (emitted by the slot-58 consumer's commit).
  'wound-recovery': {
    R: { characterId: 'string' },
    O: { woundIndex: 'number', condition: 'string', narrative: 'string' }
  },
  // === Hijinks HJ-2 (team 2026-06-13) === (RR pp.358–369; engine-emitted, record-only)
  'hijink-syndicate-formed': {
    R: { syndicateId: 'string', bossCharacterId: 'string' },
    O: { baseSettlementId: 'string', marketClass: 'string', narrative: 'string' }
  },
  'hijink-tribute': {
    R: { syndicateId: 'string', totalGp: 'number' },
    O: { bossCharacterId: 'string', turn: 'number', narrative: 'string' }
  },
  'hijink-trial': {
    R: { hijinkId: 'string', crime: 'string', punishmentLevel: 'string' },
    O: { charge: 'string', band: 'string', fineGp: 'number', indentureGp: 'number', damagesGp: 'number', acquitted: 'boolean', narrative: 'string' }
  },
  // === Character Lifecycle CL-1 (burst4) === (RR p.19; engine-emitted by processAgingForTurn, record-only)
  // A character crosses into a new age category (the progressive attribute adjustment) — or, with
  // thresholdArmed, enters a death-from-old-age window.
  'aging-milestone': {
    R: { characterId: 'string' },
    O: { fromCategory: 'string', toCategory: 'string', ageNow: 'number', attributeDeltas: 'object',
         thresholdArmed: 'string', dueInMonths: 'number', narrative: 'string' }
  },
  // The death-from-old-age Death save result (died ∈ true|false). On death the pass sets
  // lifecycleState 'deceased'. threshold ∈ old|ancient|max.
  'death-from-old-age': {
    R: { characterId: 'string', died: 'boolean' },
    O: { threshold: 'string', save: 'number', target: 'number', narrative: 'string' }
  },
  // === Treasure Generation #142 (burst5 2026-06-14) === — record-only audit (see EVENT_KINDS).
  'treasure-generated': {
    R: { treasureType: 'string' },
    O: { mode: 'string', totalGp: 'number', totalStone: 'number', stashId: 'string', lairId: 'string',
         coins: 'object', gemCount: 'number', jewelryCount: 'number', magicSlotCount: 'number',
         captiveCount: 'number', narrative: 'string' }
  },
  // === Sages SG-1 (burst5 b5-sages, #147) === — a sage consultation (consultSage; RR p.171 / p.112).
  // Record-only (the verb already rolled the throw + debited the fee); the answer narrates. throw =
  // { natural, total, target, success, margin, secret }; activityCost = the #346 day tag.
  'sage-consultation': {
    R: { sageCharacterId: 'string', clientCharacterId: 'string' },
    O: { settlementId: 'string', query: 'string', subject: 'string', mode: 'string',
         inSpecialty: 'boolean', target: 'number', throw: 'object', feeGp: 'number',
         answerText: 'string', loreId: 'string', activityCost: 'object' }
  },
  // === Politics P-2 (burst5 2026-06-14) === (RR pp.355–360; engine-emitted, record-only)
  // A senate consultation result (the 2d6-per-senator vote tally). outcome ∈ approved|rejected|no-majority.
  'senate-vote': {
    R: { senateId: 'string' },
    O: { matter: 'string', mode: 'string', outcome: 'string', approved: 'boolean',
         forVotes: 'number', againstVotes: 'number', abstainVotes: 'number',
         totalVotes: 'number', majorityThreshold: 'number', rollCount: 'number', narrative: 'string' }
  },
  // The ruler's enactment of a policy (sets/clears senate.dispute). outcome ∈ enacted|defied|dispute-cleared.
  'policy-enacted': {
    R: { senateId: 'string' },
    O: { matter: 'string', restricted: 'boolean', consulted: 'boolean', approved: 'boolean',
         outcome: 'string', disputed: 'boolean', cleared: 'boolean', narrative: 'string' }
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
    // The game day (1..30 within the turn) the event was applied on — set at apply time,
    // mirrors appliedAtTurn. The per-character activity budget (#346) windows cost-tagged
    // errands by (appliedAtTurn, appliedAtDay) so the RAW 1+4 / 12 day-budget refreshes each
    // game day, not each monthly turn (RR Activities; the budget is per-day). Null until applied.
    appliedAtDay: null,
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
// Stash C.1 (2026-05-29): the Domain Treasury IS a stash. When the domain has a
// treasuryStashId linked, route the mutation through depositToStash with a signed
// amount. Positive = grant, negative = debit. The A.4 canonical-setter invariant
// (_syncTreasuryScalarFor inside depositToStash) keeps domain.treasury.gp in sync
// with the stash sum. Without this routing, treasury-grant events would drift from
// the stash and reconcileTreasuryScalars would CLOBBER them on load.
//
// The Stash subsystem is always-on core (the inventory-stash-system toggle was removed
// v0.17.0). The legacy direct-scalar mutation below is now only the pre-migration
// fallback — a domain with no treasuryStashId yet (created before migrateAllDomainTreasuries ran).
function _applyTreasuryDelta(campaign, domainId, amount, label){
  const d = (campaign.domains||[]).find(x => x.id === domainId);
  if(!d) throw new Error('Event references unknown domainId: '+domainId);

  const A = (typeof global !== 'undefined' ? global.ACKS : (typeof window !== 'undefined' ? window.ACKS : null)) || {};
  if(d.treasuryStashId && A.findStash && A.depositToStash){
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
  // GP Wave B (Architecture.md §4.3.2/§4.3.3) — the mutation happened once above; emit the
  // wealth-transfer decomposition child so the event log carries the grammar. A negative
  // grant is a debit (treasury → external); a positive one credits the treasury.
  if(Math.abs(p.amount) > 0){
    const into = p.amount >= 0;
    recordWealthTransfer(campaign, {
      source:      into ? { kind:'external', label: p.sourceCharacterId ? ('character ' + p.sourceCharacterId) : (p.label || 'grant') } : { kind:'treasury', id: p.domainId },
      destination: into ? { kind:'treasury', id: p.domainId } : { kind:'external', label: p.label || 'debit' },
      amount: Math.abs(p.amount), bucket: into ? 'grant' : 'debit', reason: p.label || ''
    }, { parentEvent: event });
  }
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
  // GP Wave B — decomposition child: treasury → external (a debit always leaves the coffers).
  if(Math.abs(p.amount) > 0){
    recordWealthTransfer(campaign, {
      source: { kind:'treasury', id: p.domainId },
      destination: { kind:'external', label: p.destinationCharacterId ? ('character ' + p.destinationCharacterId) : (p.reason || p.label || 'debit') },
      amount: Math.abs(p.amount), bucket: 'debit', reason: p.reason || p.label || ''
    }, { parentEvent: event });
  }
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

  // Clear named lair when outcome is "cleared". Lairs are first-class (campaign.lairs[], #476 M0):
  // flip the lair to status 'cleared' — RAW §3.2: inhabitants wiped + treasure taken, structure
  // remains (the lair is NOT deleted) — and stamp the lifecycle audit. Also filter any legacy nested
  // hex.lairs[] copy (defensive — migrateLegacyHexLairs lifts nested lairs to campaign.lairs on load,
  // but a stale nested entry is cleaned up here too). Found by lairId; targetHex not required.
  if(p.lairId && p.outcome === 'cleared'){
    let cleared = false;
    // Delegate to the canonical setter (#476 M1 clearLair) — flips status:'cleared', stamps
    // clearedAtTurn / clearedByEventId AND the lifecycle history entry. Read the prior status first
    // so the summary flag only fires on a real transition (clearLair is idempotent — a re-clear
    // returns the lair unchanged).
    const A = (typeof global !== 'undefined' && global.ACKS) ? global.ACKS : null;
    if(A && typeof A.clearLair === 'function'){
      const existing = (typeof A.findLair === 'function') ? A.findLair(campaign, p.lairId) : null;
      const wasCleared = existing && existing.status === 'cleared';
      const lair = A.clearLair(campaign, p.lairId, { atTurn: campaign.currentTurn || null, byEventId: event.id || null, reason: 'adventure-cleared' });
      if(lair && !wasCleared) cleared = true;
    }
    if(targetHex && Array.isArray(targetHex.lairs)){
      const before = targetHex.lairs.length;
      targetHex.lairs = targetHex.lairs.filter(l => l.id !== p.lairId);
      if(targetHex.lairs.length < before){ changed.hexesChanged.push(targetHex.id); cleared = true; }
    }
    if(cleared) summaryParts.push('lair '+p.lairId+' cleared');
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
          // GP Wave B — decomposition child: loot recovered (external) → the character's purse.
          if(t.amount) recordWealthTransfer(campaign, {
            source: { kind:'external', label: t.label || 'adventure loot' },
            destination: { kind:'character-gp', id: ch.id, label: ch.name + "'s purse" },
            amount: t.amount, bucket: 'adventure-loot', reason: t.label || ''
          }, { parentEvent: event });
        }
      } else {
        const destDom = t.destinationDomainId || targetDomainId;
        if(destDom){
          const change = _applyTreasuryDelta(campaign, destDom, t.amount, t.label || 'adventure treasure');
          changed.domainsChanged.push(destDom);
          treasuryDelta += t.amount;
          summaryParts.push('+'+t.amount+'gp to '+destDom);
          // GP Wave B — decomposition child: loot recovered (external) → the domain treasury.
          if(t.amount) recordWealthTransfer(campaign, {
            source: { kind:'external', label: t.label || 'adventure loot' },
            destination: { kind:'treasury', id: destDom },
            amount: t.amount, bucket: 'adventure-loot', reason: t.label || ''
          }, { parentEvent: event });
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
// CoL-1 (Provisioning §16.2) — the off-journey survival day record shares the same audit posture:
// the survival absolutes were already applied in the 'survival' consumer commit; this handler exists
// only so the event is well-formed if ever replayed (a no-op beyond recording the narrative).
function applyEvent_survivalAudit(campaign, event){
  const p = (event && event.payload) || {};
  return { result: { narrativeSummary: p.narrative || (event && event.kind) || 'survival day' } };
}
registerEventHandler('survival-day', applyEvent_survivalAudit);
// #476 E10 — the domain-banditry reconcile shares the audit posture: processBanditryForTurn
// already moved the bands + population; this handler only keeps the event well-formed on replay.
function applyEvent_domainBanditryAudit(campaign, event){
  const p = (event && event.payload) || {};
  return { result: { narrativeSummary: p.narrative || 'domain banditry' } };
}
registerEventHandler('domain-banditry', applyEvent_domainBanditryAudit);
// Phase 3 Military W2 — the domain-incursion record shares the audit posture: the
// incursion day consumer's commit already materialized the band; this handler only
// keeps the event well-formed on replay.
function applyEvent_domainIncursionAudit(campaign, event){
  const p = (event && event.payload) || {};
  return { result: { narrativeSummary: p.narrative || 'domain encounter (Vagaries of Incursion)' } };
}
registerEventHandler('domain-incursion', applyEvent_domainIncursionAudit);
// Phase 3 Military W3 — the battle audits share the posture: acks-engine-battles.js
// owns the world state (the Battle entity + the aftermath's casualty/XP writes); these
// handlers only keep the events well-formed on replay.
function applyEvent_battleAudit(campaign, event){
  const p = (event && event.payload) || {};
  return { result: { narrativeSummary: p.narrative || (event && event.kind) || 'battle record' } };
}
registerEventHandler('battle-started', applyEvent_battleAudit);
registerEventHandler('battle-turn', applyEvent_battleAudit);
registerEventHandler('battle-resolved', applyEvent_battleAudit);
// Phase 3 Military W4 — the campaign-cycle audits share the posture: the slot-88
// military consumer's commit (and the conquest/pillage verbs) own the world state;
// these handlers only keep the events well-formed on replay.
function applyEvent_warfareAudit(campaign, event){
  const p = (event && event.payload) || {};
  return { result: { narrativeSummary: p.narrative || (event && event.kind) || 'campaign record' } };
}
registerEventHandler('army-contact', applyEvent_warfareAudit);
registerEventHandler('domain-warfare', applyEvent_warfareAudit);
registerEventHandler('army-supply', applyEvent_warfareAudit);   // W5 — record-only (the consumer commit owns state)
// Phase 3 Military W6 — the siege audits share the posture: acks-engine-sieges.js (the Siege
// entity + the slot-90 consumer + the setters) owns the world state; these handlers only keep
// the events well-formed on replay.
function applyEvent_siegeAudit(campaign, event){
  const p = (event && event.payload) || {};
  return { result: { narrativeSummary: p.narrative || (event && event.kind) || 'siege record' } };
}
registerEventHandler('siege-started', applyEvent_siegeAudit);
registerEventHandler('siege-progress', applyEvent_siegeAudit);
registerEventHandler('siege-resolved', applyEvent_siegeAudit);
// Favors & Duties (#230, F&D-1) — the monthly edict record shares the audit posture: the
// obligation + gp flows + Loyalty roll were already applied by processFavorsAndDutiesForTurn;
// this handler exists only so the event is well-formed if ever replayed (a no-op beyond the narrative).
function applyEvent_favorDutyAudit(campaign, event){
  const p = (event && event.payload) || {};
  return { result: { narrativeSummary: p.narrative || (event && event.kind) || 'favor/duty edict' } };
}
registerEventHandler('favor-duty', applyEvent_favorDutyAudit);
// === DC-2 (team) ===
// Domain Completion DC-2 — the classification-advancement record shares the audit posture:
// processClassificationAdvancement (commitTurn end-of-month) already raised the permanent floor
// (domain.classificationAdvancedTo); this handler exists only so the event is well-formed if ever
// replayed (a no-op beyond recording the narrative).
function applyEvent_domainAdvancedAudit(campaign, event){
  const p = (event && event.payload) || {};
  return { result: { narrativeSummary: p.narrative ||
    (p.domainId ? ('domain advanced to ' + (p.to || '?')) : 'domain advanced') } };
}
registerEventHandler('domain-advanced', applyEvent_domainAdvancedAudit);
// === Religion R1 (team 2026-06-13) — record-only audit posture. The religion verbs in
// acks-engine-religion.js (accrueDivinePower / consecrateFields / prayAndSacrifice / …) already
// applied the ledger + domain state; these handlers exist only so the events are well-formed if
// ever replayed (a no-op beyond the recorded narrative). Mirrors favor-duty / banditry / survival.
function applyEvent_religionAudit(campaign, event){
  const p = (event && event.payload) || {};
  return { result: { narrativeSummary: p.narrative || (event && event.kind) || 'religion event' } };
}
registerEventHandler('divine-power-accrued', applyEvent_religionAudit);
registerEventHandler('consecration', applyEvent_religionAudit);
registerEventHandler('divine-favor-changed', applyEvent_religionAudit);
// === Religion R2 (team 2026-06-14) — blood sacrifice shares the record-only audit posture
// (bloodSacrifice already applied the ledger/arcane store; the handler keeps the event well-formed). ===
registerEventHandler('blood-sacrifice', applyEvent_religionAudit);
// === Hijinks HJ-1 (team) === — the hijink lifecycle events share the audit posture:
// startHijink / the 'hijinks' day-consumer commit already applied the reward + state; the
// handler keeps the event well-formed on replay (a no-op beyond recording the narrative).
function applyEvent_hijinkAudit(campaign, event){
  const p = (event && event.payload) || {};
  return { result: { narrativeSummary: p.narrative || (event && event.kind) || 'hijink' } };
}
registerEventHandler('hijink-attempted', applyEvent_hijinkAudit);
registerEventHandler('hijink-resolved', applyEvent_hijinkAudit);
// === Delves D1 — Mortal Wounds (team burst3 2026-06-13) === — record-only audit posture: the
// wound/recovery state is applied by ACKS.applyMortalWound + the slot-58 convalescence consumer
// (acks-engine-mortal-wounds.js); these handlers keep the events well-formed on replay (a no-op
// beyond the recorded narrative). Mirrors survival / banditry / hijink.
function applyEvent_mortalWoundAudit(campaign, event){
  const p = (event && event.payload) || {};
  return { result: { narrativeSummary: p.narrative || (event && event.kind) || 'mortal wound' } };
}
registerEventHandler('mortal-wound', applyEvent_mortalWoundAudit);
registerEventHandler('wound-recovery', applyEvent_mortalWoundAudit);
// === Hijinks HJ-2 (team 2026-06-13) === — syndicate/tribute/trial events share the audit
// posture: formSyndicate / collectSyndicateTribute / resolveHijinkTrial already moved the gp
// + state; the handler keeps the event well-formed on replay (records the narrative only).
registerEventHandler('hijink-syndicate-formed', applyEvent_hijinkAudit);
registerEventHandler('hijink-tribute', applyEvent_hijinkAudit);
registerEventHandler('hijink-trial', applyEvent_hijinkAudit);
// === Character Lifecycle CL-1 (burst4) === — aging events share the record-only audit posture:
// ACKS.processAgingForTurn already advanced the age/category/attributes; the handler keeps the event
// well-formed on replay (records the narrative only). Mirrors mortal-wound / survival / banditry.
function applyEvent_agingAudit(campaign, event){
  const p = (event && event.payload) || {};
  return { result: { narrativeSummary: p.narrative || (event && event.kind) || 'aging' } };
}
registerEventHandler('aging-milestone', applyEvent_agingAudit);
registerEventHandler('death-from-old-age', applyEvent_agingAudit);
// === Treasure Generation #142 (burst5 2026-06-14) === — record-only audit posture: the hoard's
// state is applied by ACKS.materializeHoard (the stash deposit + notable promotion + minted captive
// Characters, acks-engine-treasure.js); this handler keeps the event well-formed on replay (records
// the narrative only). Mirrors aging / mortal-wound / survival.
function applyEvent_treasureAudit(campaign, event){
  const p = (event && event.payload) || {};
  return { result: { narrativeSummary: p.narrative || (event && event.kind) || 'treasure generated' } };
}
registerEventHandler('treasure-generated', applyEvent_treasureAudit);
// === Politics P-2 (burst5 2026-06-14) === — the senate events share the record-only audit posture:
// ACKS.senateVote / ACKS.enactPolicy (acks-engine-politics.js) already computed the tally + set/cleared
// senate.dispute; the handler keeps the event well-formed on replay (records the narrative only).
function applyEvent_senateAudit(campaign, event){
  const p = (event && event.payload) || {};
  return { result: { narrativeSummary: p.narrative || (event && event.kind) || 'senate event' } };
}
registerEventHandler('senate-vote', applyEvent_senateAudit);
registerEventHandler('policy-enacted', applyEvent_senateAudit);

// =============================================================================
// GP Wave B — the wealth/item movement grammar (Architecture.md §4.3, 2026-06-04)
// =============================================================================
// Three event kinds form a layered model (§4.3.6):
//   • wealth-transfer    — the canonical coin/gp PRIMITIVE ("amount gp moved from
//     {source} to {destination} for {bucket}"). Typed source/destination handles.
//   • item-transfer      — the symmetric item-line PRIMITIVE (non-coin lines move
//     between inventories/stashes, or in/out of the world via an 'external' handle).
//   • market-transaction — a semantic COMPOUND (a priced buy/sell at a market) that
//     COMPOSES a wealth-transfer (coin leg) + an item-transfer (goods leg) and adds the
//     market context (price/availability/notability/the #346 activity cost). It is the
//     unit the Campaign Log narrates; the two legs ride beneath it as child records.
//
// Two contracts, kept distinct to avoid double-application:
//   • _doWealthTransfer / _doItemTransfer MOVE state (validate-then-apply, atomic) and
//     return a change record. The standalone handlers + the market compound call these.
//   • recordWealthTransfer / recordItemTransfer LOG an applied event WITHOUT moving — for
//     flows that already moved through their own setters (commitTurn, treasury-grant,
//     adventure-result, cache/draw) and want to emit the audit decomposition. A child of
//     a parent (parentEvent given) is flagged campaignLogHidden — the parent narrates.
//
// gp only in v1; `currency` is carried on the payload but only 'gp' actually moves.

const _WEALTH_HANDLE_KINDS = Object.freeze(['treasury','character-gp','character','character-stash','hex-stash','stash','party-stash','external']);
function _gpwACKS(){ return (typeof global !== 'undefined' && global.ACKS) || (typeof window !== 'undefined' && window.ACKS) || {}; }

// How much gp a handle can currently provide. { available, gated } — gated:true means a
// debit beyond `available` is a real overdraft and should fail; gated:false (treasury)
// preserves today's behaviour (a domain treasury can run negative across a lean month).
// null for 'external' (an off-campaign counterparty — unbounded).
function _wealthLegAvailable(campaign, handle){
  if(!handle || handle.kind === 'external') return null;
  const A = _gpwACKS();
  switch(handle.kind){
    case 'treasury':
      return { available: (A.domainTreasuryGp ? A.domainTreasuryGp(campaign, handle.id) : 0), gated:false };
    case 'character-gp':
    case 'character': {
      const ch = (campaign.characters||[]).find(c => c && c.id === handle.id);
      return { available: ch ? (Number(ch.coins && ch.coins.gp) || 0) : 0, gated:true };
    }
    case 'character-stash': case 'hex-stash': case 'party-stash': case 'stash': {
      const st = A.findStash ? A.findStash(campaign, handle.id) : null;
      let gp = 0;
      if(st && Array.isArray(st.items)) for(const it of st.items){
        if(it && (it.facets||[]).indexOf('coin') >= 0 && (it.denomination||'gp') === 'gp') gp += (Number(it.qty)||0);
      }
      return { available: gp, gated:true };
    }
    default: return { available: 0, gated:true };
  }
}

// Move signedAmount gp into (+) or out of (−) one handle. Mutates; returns a change record.
// Reuses the shipped movers so the canonical invariants hold (treasury↔stash sync, purse
// mirror). 'external' is a no-op (the gp left/entered the campaign).
function _applyWealthLeg(campaign, handle, signedAmount, ctx){
  if(!handle || handle.kind === 'external' || !signedAmount) return null;
  const A = _gpwACKS();
  const label = (ctx && (ctx.reason || ctx.bucket)) || 'wealth-transfer';
  switch(handle.kind){
    case 'treasury':
      return A._applyTreasuryDelta ? A._applyTreasuryDelta(campaign, handle.id, signedAmount, label)
                                   : _applyTreasuryDelta(campaign, handle.id, signedAmount, label);
    case 'character-gp': case 'character': {
      const ch = (campaign.characters||[]).find(c => c && c.id === handle.id);
      if(!ch) throw new Error('wealth-transfer: unknown character '+handle.id);
      if(!ch.coins || typeof ch.coins !== 'object') ch.coins = { pp:0, gp:0, ep:0, sp:0, cp:0 };
      const before = Number(ch.coins.gp) || 0;
      ch.coins.gp = before + signedAmount;
      if(A.reconcileCharacterCoins) A.reconcileCharacterCoins(ch);
      return { kind:'character', id: handle.id, before, after: ch.coins.gp, delta: signedAmount };
    }
    case 'character-stash': case 'hex-stash': case 'party-stash': case 'stash': {
      const st = A.findStash ? A.findStash(campaign, handle.id) : null;
      if(!st) throw new Error('wealth-transfer: unknown stash '+handle.id);
      if(signedAmount >= 0){
        if(A.depositToStash) A.depositToStash(campaign, st.id, [{ kind:'coin', denomination:'gp', qty: signedAmount }], { reason: label });
      } else {
        const coinLine = (st.items||[]).find(it => it && (it.facets||[]).indexOf('coin') >= 0 && (it.denomination||'gp') === 'gp');
        if(!coinLine || (Number(coinLine.qty)||0) < -signedAmount) throw new Error('wealth-transfer: stash '+st.id+' has insufficient gp');
        if(A.withdrawFromStash) A.withdrawFromStash(campaign, st.id, [{ itemId: coinLine.id, qty: -signedAmount }], { reason: label });
      }
      return { kind:'stash', id: handle.id, delta: signedAmount };
    }
    default: return null;
  }
}

// Move `amount` gp from source → destination. Validate-then-apply: the debit side is
// checked before any mutation (atomic). amount is non-negative; direction is carried by
// the handles. Returns a change record.
function _doWealthTransfer(campaign, spec){
  spec = spec || {};
  const amount = Number(spec.amount) || 0;
  const src = spec.source || { kind:'external' };
  const dst = spec.destination || { kind:'external' };
  if(amount < 0) throw new Error('wealth-transfer: amount must be ≥ 0 (direction is carried by source/destination)');
  if(src.kind && _WEALTH_HANDLE_KINDS.indexOf(src.kind) < 0) throw new Error('wealth-transfer: bad source kind '+src.kind);
  if(dst.kind && _WEALTH_HANDLE_KINDS.indexOf(dst.kind) < 0) throw new Error('wealth-transfer: bad destination kind '+dst.kind);
  if(!spec.allowOverdraft && amount > 0){
    const avail = _wealthLegAvailable(campaign, src);
    if(avail && avail.gated && amount > avail.available)
      throw new Error('wealth-transfer: insufficient funds in '+src.kind+(src.id?(' '+src.id):'')+' ('+avail.available+'gp < '+amount+'gp)');
  }
  const sourceChange = _applyWealthLeg(campaign, src, -amount, spec);
  const destChange   = _applyWealthLeg(campaign, dst, +amount, spec);
  return { amount, currency: spec.currency || 'gp', source: src, destination: dst, sourceChange, destChange,
           bucket: spec.bucket || 'other', reason: spec.reason || '' };
}

// A buy line → a Phase-2.6 carry inventory entry ({name, qty, stone, notes}). The line's
// `stone`/`encumbranceSt` is the PER-UNIT weight; a carry line's `stone` is the TOTAL for
// the line (itemEncumbranceSt reads it directly, no qty multiply — RR p.83), so multiply.
function _marketLineToCarry(line){
  const qty = (line.qty != null) ? line.qty : 1;
  const unitSt = (line.stone != null) ? line.stone : (line.encumbranceSt != null ? line.encumbranceSt : 0);
  const out = {
    name: line.name || line.label || 'item',
    qty,
    stone: (unitSt != null ? unitSt : 0) * qty,   // TOTAL weight of the line
    notes: line.notes || ''
  };
  if(line.notableItemId) out.notableItemId = line.notableItemId;   // magic routing is IT-5
  return out;
}
// A buy line → a stash item spec (facet line). encumbranceSt is the TOTAL line weight too.
function _marketLineToStashItem(line){
  if(Array.isArray(line.facets) && line.facets.length) return Object.assign({}, line, { id: undefined });
  const qty = (line.qty != null) ? line.qty : 1;
  const unitSt = (line.stone != null) ? line.stone : (line.encumbranceSt != null ? line.encumbranceSt : null);
  return {
    facets: ['gear'], name: line.name || line.label || 'item', qty,
    encumbranceSt: (unitSt != null) ? unitSt * qty : null,
    notes: line.notes || ''
  };
}

// Move item lines source → destination. Dispatches on the (source.kind, destination.kind)
// pair: external→ materialises new lines (buy); →external removes held lines (sell); the
// internal routes wrap the shipped setters (cache/draw/transfer). Returns { moved, count }.
function _doItemTransfer(campaign, spec){
  spec = spec || {};
  const A = _gpwACKS();
  const src = spec.source || { kind:'external' };
  const dst = spec.destination || { kind:'external' };
  const lines = Array.isArray(spec.lines) ? spec.lines : [];
  const reason = spec.reason || spec.bucket || 'item-transfer';
  const srcK = src.kind, dstK = dst.kind;
  const isCh = k => (k === 'character' || k === 'character-gp');
  const isStash = k => (k === 'stash' || k === 'character-stash' || k === 'hex-stash' || k === 'party-stash');

  // external → inventory (BUY into carry)
  if(srcK === 'external' && isCh(dstK)){
    const ch = (campaign.characters||[]).find(c => c && c.id === dst.id);
    if(!ch) throw new Error('item-transfer: unknown character '+dst.id);
    if(!Array.isArray(ch.inventory)) ch.inventory = [];
    const moved = [];
    for(const ln of lines){ const carry = _marketLineToCarry(ln); ch.inventory.push(carry); moved.push(carry); }
    return { moved, count: moved.length };
  }
  // external → stash (BUY into a stash)
  if(srcK === 'external' && isStash(dstK)){
    const items = lines.map(_marketLineToStashItem);
    if(A.depositToStash) A.depositToStash(campaign, dst.id, items, { reason });
    return { moved: items, count: items.length };
  }
  // inventory → external (SELL from carry) — lines ref carry indices
  if(isCh(srcK) && dstK === 'external'){
    const ch = (campaign.characters||[]).find(c => c && c.id === src.id);
    if(!ch) throw new Error('item-transfer: unknown character '+src.id);
    if(!Array.isArray(ch.inventory)) ch.inventory = [];
    const idxs = lines.map(l => l.inventoryIndex).filter(i => Number.isInteger(i));
    for(const i of idxs){ if(i < 0 || i >= ch.inventory.length) throw new Error('item-transfer: bad inventory index '+i); }
    const moved = [];
    for(const i of idxs.slice().sort((a,b) => b - a)){ moved.push(ch.inventory[i]); ch.inventory.splice(i, 1); }
    return { moved, count: moved.length };
  }
  // stash → external (SELL from a stash) — lines ref itemIds
  if(isStash(srcK) && dstK === 'external'){
    const withdrawals = lines.map(l => ({ itemId: l.itemId, qty: l.qty }));
    const out = A.withdrawFromStash ? A.withdrawFromStash(campaign, src.id, withdrawals, { reason }) : null;
    if(!out) throw new Error('item-transfer: stash withdrawal failed');
    return { moved: out.withdrawn, count: out.withdrawn.length };
  }
  // internal moves wrap the shipped setters (the cache/draw retrofit + integrators).
  if(isCh(srcK) && isStash(dstK)){
    const itemIndices = lines.map(l => l.inventoryIndex).filter(Number.isInteger);
    const res = A.cacheToStash ? A.cacheToStash(campaign, src.id, dst.id, { itemIndices }, { reason, suppressEvent: true }) : null;
    if(!res || !res.ok) throw new Error('item-transfer: cacheToStash failed'+(res ? (' '+res.error) : ''));
    return { moved: lines, count: itemIndices.length };
  }
  if(isStash(srcK) && isCh(dstK)){
    const itemIds = lines.map(l => l.itemId).filter(Boolean);
    const res = A.drawFromStash ? A.drawFromStash(campaign, src.id, dst.id, { itemIds }, { reason, suppressEvent: true }) : null;
    if(!res || !res.ok) throw new Error('item-transfer: drawFromStash failed'+(res ? (' '+res.error) : ''));
    return { moved: lines, count: itemIds.length };
  }
  if(isStash(srcK) && isStash(dstK)){
    const withdrawals = lines.map(l => ({ itemId: l.itemId, qty: l.qty }));
    const res = A.transferBetweenStashes ? A.transferBetweenStashes(campaign, src.id, dst.id, withdrawals, { reason }) : null;
    if(!res) throw new Error('item-transfer: stash→stash transfer failed');
    return { moved: withdrawals, count: withdrawals.length };
  }
  throw new Error('item-transfer: unsupported route '+srcK+' → '+dstK);
}

// ── Applied-event logging (record-only; the mover already moved) ──────────────
// Push an APPLIED event wrapper onto campaign.eventLog (the {event,result,…} shape used
// throughout — see startJourney / commitTurn).
function _logAppliedEvent(campaign, ev, result){
  if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
  ev.status = EVENT_STATUS.APPLIED;
  ev.appliedAtTurn = campaign.currentTurn || 1;
  ev.appliedAtDay = campaign.currentDayInMonth || 1;   // the game day — the activity budget (#346) windows errands by this so it refreshes daily
  campaign.eventLog.push({ event: ev, result: result || {}, appliedAtTurn: campaign.currentTurn || 1, appliedAtDay: campaign.currentDayInMonth || 1, appliedAt: new Date().toISOString() });
  return ev;
}
function _wealthHandleLabel(h){ if(!h) return '?'; return h.label || (h.kind + (h.id ? (' ' + h.id) : '')); }
function _wealthTransferNarrative(spec){
  return (Number(spec.amount)||0) + 'gp · ' + _wealthHandleLabel(spec.source) + ' → ' + _wealthHandleLabel(spec.destination) +
         (spec.bucket ? (' (' + spec.bucket + ')') : '');
}
// Log a wealth-transfer WITHOUT moving (the caller already moved). A child of a parent is
// hidden from the narrative Campaign Log; standalone records (no parent) are visible.
function recordWealthTransfer(campaign, spec, opts){
  opts = opts || {};
  const parent = opts.parentEvent || null;
  const ev = newEvent('wealth-transfer', {
    submittedBy: opts.submittedBy || 'engine', status: EVENT_STATUS.APPLIED,
    cadence: opts.cadence || (parent ? parent.cadence : 'monthly-turn'),
    targetTurn: campaign.currentTurn || 1,
    gameTimeAt: opts.gameTimeAt || (parent ? parent.gameTimeAt : null),
    parentEventId: parent ? parent.id : (opts.parentEventId || null),
    context: opts.context || (parent ? parent.context : null) || null,
    payload: {
      source: spec.source || { kind:'external' }, destination: spec.destination || { kind:'external' },
      amount: Number(spec.amount) || 0, currency: spec.currency || 'gp',
      bucket: spec.bucket || 'other', reason: spec.reason || ''
    }
  });
  if(parent || opts.campaignLogHidden) ev.campaignLogHidden = true;
  return _logAppliedEvent(campaign, ev, { narrativeSummary: opts.narrativeSummary || _wealthTransferNarrative(spec) });
}
// Log an item-transfer WITHOUT moving (the caller already moved).
function recordItemTransfer(campaign, spec, opts){
  opts = opts || {};
  const parent = opts.parentEvent || null;
  const lines = Array.isArray(spec.lines) ? spec.lines : [];
  const ev = newEvent('item-transfer', {
    submittedBy: opts.submittedBy || 'engine', status: EVENT_STATUS.APPLIED,
    cadence: opts.cadence || (parent ? parent.cadence : 'monthly-turn'),
    targetTurn: campaign.currentTurn || 1,
    gameTimeAt: opts.gameTimeAt || (parent ? parent.gameTimeAt : null),
    parentEventId: parent ? parent.id : (opts.parentEventId || null),
    context: opts.context || (parent ? parent.context : null) || null,
    payload: {
      source: spec.source || { kind:'external' }, destination: spec.destination || { kind:'external' },
      lines: lines.map(l => ({ name: l.name || l.label || null, qty: (l.qty != null ? l.qty : 1) })),
      bucket: spec.bucket || 'other', reason: spec.reason || ''
    }
  });
  if(parent || opts.campaignLogHidden) ev.campaignLogHidden = true;
  const summary = (opts.narrativeSummary) || (lines.length + ' item line(s) · ' + _wealthHandleLabel(spec.source) + ' → ' + _wealthHandleLabel(spec.destination));
  return _logAppliedEvent(campaign, ev, { narrativeSummary: summary });
}

// ── Standalone primitive handlers (dispatched via applyEvent — these MOVE) ─────
function applyEvent_wealthTransfer(campaign, event){
  const p = event.payload || {};
  const change = _doWealthTransfer(campaign, p);
  return { result: {
    domainsChanged: [p.source, p.destination].filter(h => h && h.kind === 'treasury').map(h => h.id),
    charactersChanged: [p.source, p.destination].filter(h => h && (h.kind === 'character' || h.kind === 'character-gp')).map(h => h.id),
    hexesChanged: [], treasuryDelta: 0,
    narrativeSummary: _wealthTransferNarrative(p), wealthTransfer: change
  } };
}
registerEventHandler('wealth-transfer', applyEvent_wealthTransfer);

function applyEvent_itemTransfer(campaign, event){
  const p = event.payload || {};
  const moved = _doItemTransfer(campaign, p);
  return { result: {
    domainsChanged: [], hexesChanged: [],
    charactersChanged: [p.source, p.destination].filter(h => h && (h.kind === 'character' || h.kind === 'character-gp')).map(h => h.id),
    treasuryDelta: 0,
    narrativeSummary: (moved.count + ' item line(s) · ' + _wealthHandleLabel(p.source) + ' → ' + _wealthHandleLabel(p.destination)),
    itemTransfer: { count: moved.count }
  } };
}
registerEventHandler('item-transfer', applyEvent_itemTransfer);

// ── market-transaction: the semantic compound (composes the two primitives) ────
function _settlementName(campaign, settlementId){
  const s = (campaign.settlements||[]).find(x => x && x.id === settlementId);
  return s ? (s.name || settlementId) : settlementId;
}
function _marketLinesSummary(lines){
  if(!Array.isArray(lines) || !lines.length) return 'goods';
  const parts = lines.slice(0, 3).map(l => ((l.qty && l.qty !== 1) ? (l.qty + '× ') : '') + (l.name || 'item'));
  return parts.join(', ') + (lines.length > 3 ? (' +' + (lines.length - 3) + ' more') : '');
}
// pay-from / deposit-to → a wealth handle. Default the actor's purse.
function _marketCoinHandle(campaign, p, ch){
  const v = p.payFrom || 'purse';
  if(typeof v === 'string' && v.indexOf('stash:') === 0)    return { kind:'stash', id: v.slice(6) };
  if(typeof v === 'string' && v.indexOf('treasury:') === 0) return { kind:'treasury', id: v.slice(9) };
  return { kind:'character-gp', id: ch ? ch.id : p.actorCharacterId, label: ch ? (ch.name + "'s purse") : null };
}
// where items land (buy: itemTo) / come from (sell: itemFrom). Default the actor's carry.
function _marketItemHandle(campaign, p, ch){
  const v = (p.direction === 'sell') ? (p.itemFrom || 'carry') : (p.itemTo || 'carry');
  if(typeof v === 'string' && v.indexOf('stash:') === 0) return { kind:'stash', id: v.slice(6) };
  return { kind:'character', id: ch ? ch.id : p.actorCharacterId, label: ch ? (ch.name + "'s pack") : null };
}
// Notability hook (M&M) — mirrors the treasury-grant notable-transaction rumor.
function _marketNotabilityCheck(campaign, event, p, totalGp){
  const A = _gpwACKS();
  if(!A.isHouseRuleEnabled || !A.isHouseRuleEnabled(campaign, 'markets-transaction-threshold')) return false;
  const sId = p.settlementId; if(!sId || !(totalGp > 0)) return false;
  const set = (campaign.settlements||[]).find(s => s && s.id === sId); if(!set) return false;
  const threshold = A.computeTransactionThreshold ? A.computeTransactionThreshold(set) : 0;
  if(!(threshold > 0 && totalGp >= threshold)) return false;
  _autoEmitRumor(campaign, {
    settlementId: sId,
    rumorText: 'A notable transaction stirred ' + (set.name || sId) + ': ' + totalGp.toLocaleString() + 'gp '
             + (p.direction === 'sell' ? 'of goods sold' : 'spent on goods') + '.',
    apparentLevel: 'common', truthLevel: 'true', topic: 'wealth', sourceEventId: event.id,
    sourceCharacterId: p.actorCharacterId || null
  });
  return true;
}
function applyEvent_marketTransaction(campaign, event){
  const p = event.payload || {};
  const dir = (p.direction === 'sell') ? 'sell' : 'buy';
  const lines = Array.isArray(p.lines) ? p.lines : [];
  const totalGp = (p.totalGp != null) ? Number(p.totalGp)
                : lines.reduce((s,l) => s + (Number(l.totalGp) || (Number(l.unitPriceGp)||0) * (Number(l.qty)||1)), 0);
  const actorId = p.actorCharacterId;
  const ch = (campaign.characters||[]).find(c => c && c.id === actorId) || null;
  const coinHandle = _marketCoinHandle(campaign, p, ch);
  const itemHandle = _marketItemHandle(campaign, p, ch);
  const ext = { kind:'external', label: p.settlementId ? ('market · ' + _settlementName(campaign, p.settlementId)) : 'market' };

  if(dir === 'buy'){
    _doWealthTransfer(campaign, { source: coinHandle, destination: ext, amount: totalGp, bucket:'purchase', reason:'market purchase' });
    _doItemTransfer(campaign,  { source: ext, destination: itemHandle, lines, bucket:'purchase', reason:'market purchase' });
    recordWealthTransfer(campaign, { source: coinHandle, destination: ext, amount: totalGp, bucket:'purchase', reason:'market purchase' }, { parentEvent: event });
    recordItemTransfer(campaign,  { source: ext, destination: itemHandle, lines, bucket:'purchase', reason:'market purchase' }, { parentEvent: event });
  } else {
    _doItemTransfer(campaign,  { source: itemHandle, destination: ext, lines, bucket:'sale', reason:'market sale' });
    _doWealthTransfer(campaign, { source: ext, destination: coinHandle, amount: totalGp, bucket:'sale', reason:'market sale' });
    recordItemTransfer(campaign,  { source: itemHandle, destination: ext, lines, bucket:'sale', reason:'market sale' }, { parentEvent: event });
    recordWealthTransfer(campaign, { source: ext, destination: coinHandle, amount: totalGp, bucket:'sale', reason:'market sale' }, { parentEvent: event });
  }
  const notable = _marketNotabilityCheck(campaign, event, p, totalGp);
  const summary = (dir === 'buy' ? 'Bought ' : 'Sold ') + _marketLinesSummary(lines)
                + (p.settlementId ? (' at ' + _settlementName(campaign, p.settlementId)) : '') + ' for ' + totalGp + 'gp'
                + (ch ? (' — ' + (ch.name || actorId)) : '');
  return { result: {
    domainsChanged: [], hexesChanged: [], charactersChanged: actorId ? [actorId] : [],
    treasuryDelta: 0, narrativeSummary: summary,
    marketTransaction: { direction: dir, totalGp, lineCount: lines.length, notable, activityCost: p.activityCost || null }
  } };
}
registerEventHandler('market-transaction', applyEvent_marketTransaction);

// ── marketBuy / marketSell — the ergonomic builders (validate → dispatch → log) ─
// IT-2 (Phase_2.9_Item_Trade_Plan.md). Validate availability (RR p.124 matrix) + funds,
// build the market-transaction event, apply it (legs move + children record), log the
// parent. Returns { ok, event, totalGp, lines } | { ok:false, error, detail? }.
// A settlement's market class (Roman). It is DERIVED from family count via
// lookupSettlementBenchmark (RR p.351) — NOT a stored field (Item Trade plan §2.1 / OQ6).
// An explicit settlement.marketClass (a GM override) wins if present.
function _marketClassRoman(settlement){
  if(!settlement) return null;
  if(settlement.marketClass) return settlement.marketClass;
  const A = _gpwACKS();
  if(A.lookupSettlementBenchmark){ const b = A.lookupSettlementBenchmark(settlement.families || 0); return b ? b.marketClass : null; }
  return null;
}
function _marketClassIdx(settlement){
  const map = { 'I':0, 'II':1, 'III':2, 'IV':3, 'V':4, 'VI':5 };
  const roman = _marketClassRoman(settlement);
  if(typeof roman === 'string'){ const key = roman.replace('*',''); if(map[key] != null) return map[key]; }
  return 5;   // default to the smallest market
}
function _resolveEquipmentLine(line){
  const A = _gpwACKS();
  let cat = null;
  if(line.catalogId && Array.isArray(A.EQUIPMENT_CATALOG)) cat = A.EQUIPMENT_CATALOG.find(e => e.id === line.catalogId);
  const listPriceGp = (line.priceGp != null) ? Number(line.priceGp) : (cat ? cat.listPriceGp : null);
  const name  = line.name || (cat ? cat.name : null) || 'item';
  const stone = (line.stone != null) ? line.stone : (cat ? cat.stone : 0);
  return { name, listPriceGp, stone, source: cat ? 'catalog' : 'generic' };
}
// The M&M p.15 load-metered activity cost (the #346 tie — Item Trade plan §2.5, IT-3):
// buying/selling up to a normal load (the unencumbered ceiling, RR pp.83–84 — 5 st) is ONE
// ancillary; each further normal-load is another ("the time packing and lugging"). A goods-
// less deal (a led warhorse, 0 st) is still one ancillary. Stamped on the payload now; the
// budget READER (characterActivityBudget) unions it in at AB-4, once the entity-less errand
// store fork is decided (budget plan §14 / OQ1) — until then the cost-tag rides on the event.
function _marketNormalLoadSt(){
  const A = _gpwACKS();
  if(A.carryEncumbranceBandFor){ const b = A.carryEncumbranceBandFor(0); if(b && b.maxSt) return b.maxSt; }
  return 5;
}
// The activity-budget cost of a market transaction. RAW DEFAULT (core): ONE ancillary activity
// (JJ Campaign-Activities list "Buy equipment in the market", RR p.123). A 12+ party may instead
// devote a DEDICATED activity (RR p.124 — for double availability), so the whole trip is one
// dedicated activity. The M&M p.15 LOAD-METERING (⌈stone ÷ normal-load⌉ ancillary activities) is a
// SUPPLEMENT refinement behind the `markets-load-metered-activity` house rule (default OFF, CLAUDE §6).
function _marketActivityCost(campaign, totalStone, opts){
  opts = opts || {};
  const st = Number(totalStone) || 0;
  const A = _gpwACKS();
  if(opts.partyOf12Dedicated){
    return { kind:'market-transaction', slot:'dedicated', units:1, totalStone: st };
  }
  if(campaign && A.isHouseRuleEnabled && A.isHouseRuleEnabled(campaign, 'markets-load-metered-activity')){
    const normalLoadSt = _marketNormalLoadSt();
    return { kind:'market-transaction', slot:'ancillary', units: Math.max(1, Math.ceil(st / normalLoadSt)), totalStone: st, normalLoadSt, loadMetered:true };
  }
  return { kind:'market-transaction', slot:'ancillary', units:1, totalStone: st };
}
// The acting character's party size (member characters by the partyId truth — Architecture §3.3).
// Gates the RR p.124 "12 or more adventurers" dedicated-shop benefit so a lone character can't
// claim it (the UI also disables the tick; this is the engine-side guard).
function _actorPartySize(campaign, charId){
  const ch = (campaign && Array.isArray(campaign.characters)) ? campaign.characters.find(c => c && c.id === charId) : null;
  if(!ch || !ch.partyId) return 1;
  return campaign.characters.filter(c => c && c.partyId === ch.partyId).length;
}
// RR p.124 — the campaign-wide monthly maximum for any one item at a single market is 10× the
// per-party "value shown". DERIVED (not stored, Architecture §3.13): sum the units of this item
// moved THIS accounting month (turn) in this direction at this settlement, from the eventLog.
function marketUnitsTransactedThisMonth(campaign, settlementId, nameKey, direction){
  const turn = (campaign && campaign.currentTurn) || 1;
  const log = (campaign && Array.isArray(campaign.eventLog)) ? campaign.eventLog : [];
  const key = String(nameKey || '').toLowerCase();
  let units = 0;
  for(const entry of log){
    const ev = entry && entry.event; if(!ev || ev.kind !== 'market-transaction') continue;
    const at = (entry.appliedAtTurn != null) ? entry.appliedAtTurn : ev.appliedAtTurn;
    if(at != null && at !== turn) continue;
    const p = ev.payload || {};
    if(p.reversed || p.isReversal) continue;   // a reversed buy + its compensating reversal net to zero — the RR p.124 ceiling frees up
    if(p.settlementId !== settlementId) continue;
    if(direction && p.direction !== direction) continue;
    for(const ln of (p.lines || [])){ if(String(ln.name || '').toLowerCase() === key) units += (Number(ln.qty) || 0); }
  }
  return units;
}
// Units of `item` ({name, listPriceGp}) still transactable this month at `settlement` in `direction`
// under the 10× ceiling (RR p.124). Count cells only — for a chance cell the per-roll gate governs,
// so there is no separate monthly count ceiling (returns Infinity).
function marketMonthlyRemaining(campaign, settlement, item, direction){
  if(!settlement) return Infinity;
  const A = _gpwACKS();
  const mcIdx = _marketClassIdx(settlement);
  const base = A.equipmentAvailability ? A.equipmentAvailability(item.listPriceGp, mcIdx, {}) : { kind:'count', count: Infinity };
  if(base.kind !== 'count' || !Number.isFinite(base.count)) return Infinity;
  const ceiling = 10 * base.count;
  return Math.max(0, ceiling - marketUnitsTransactedThisMonth(campaign, settlement.id, item.name, direction));
}
// Has this character "previously entered" this market (settlement) — the RAW condition for a
// venturer's Mercantile Network bonus (RR p.43)? Derived (the canonical settlementVisits tracker,
// Wave F, isn't built yet): true if the character has a prior RETAIL market-transaction at this
// settlement, OR a mercantile VENTURE that bought at it (its origin domain) or sold at it (an
// arrived destination domain). Per Joachim 2026-06-04 venture buying counts as entering. Domain-level
// match (a venture targets a domain's market). This only answers "entered before?" — the wizard
// pairs it with hasMercantileNetwork() to decide the auto-tick, and the GM can override.
function previouslyEnteredMarket(campaign, charId, settlementId){
  if(!campaign || !charId || !settlementId) return false;
  // 1) a prior retail trade at this settlement by this character
  for(const entry of (campaign.eventLog || [])){
    const ev = entry && entry.event;
    if(!ev || ev.kind !== 'market-transaction') continue;
    const p = ev.payload || {};
    if(p.settlementId === settlementId && p.actorCharacterId === charId) return true;
  }
  // 2) a prior venture by this character touching this market's domain
  const set = (campaign.settlements || []).find(s => s && s.id === settlementId);
  const domId = set && set.domainId;
  if(domId){
    for(const v of (campaign.ventures || [])){
      if(!v || v.venturerCharacterId !== charId) continue;
      if(v.originDomainId === domId) return true;                                  // bought here (the venture departed this market)
      if(v.destinationDomainId === domId &&
         (v.status === 'selling' || v.status === 'complete' || v.arrivalTurn != null)) return true;  // sold here (arrived)
    }
  }
  return false;
}
function marketBuy(campaign, opts){
  opts = opts || {};
  const A = _gpwACKS();
  const ch = (campaign.characters||[]).find(c => c && c.id === opts.actorCharacterId);
  if(!ch) return { ok:false, error:'unknown-actor' };
  const set = opts.settlementId ? (campaign.settlements||[]).find(s => s && s.id === opts.settlementId) : null;
  const mcIdx = set ? _marketClassIdx(set) : (opts.marketClassIdx != null ? opts.marketClassIdx : 5);
  const inLines = Array.isArray(opts.lines) ? opts.lines : [];
  if(!inLines.length) return { ok:false, error:'no-lines' };
  const effectiveDedicated = !!opts.partyOf12Dedicated && _actorPartySize(campaign, ch.id) >= 12;   // RR p.124 — a REAL 12+ party only
  const visitedBefore = !!opts.visitedBefore && A.hasMercantileNetwork(ch);   // RAW: only a venturer's Mercantile Network grants the +1 market class (RR p.43); dropped for everyone else
  const availOpts = { partyOf12Dedicated: effectiveDedicated, visitedBefore };
  const lines = []; let totalGp = 0, totalStone = 0;
  for(const raw of inLines){
    const r = _resolveEquipmentLine(raw);
    if(r.listPriceGp == null || !(r.listPriceGp >= 0)) return { ok:false, error:'no-price', detail:{ name: r.name } };
    const qty = (raw.qty != null) ? raw.qty : 1;
    if(!(qty > 0)) return { ok:false, error:'bad-qty', detail:{ name: r.name } };
    // Availability gate (RR p.124). Deterministic for count cells; chance cells need an
    // explicit availableUnits (rolled by the wizard) else they gate to 0.
    const a = A.equipmentAvailability ? A.equipmentAvailability(r.listPriceGp, mcIdx, availOpts) : { kind:'count', count: Infinity };
    const availableUnits = (raw.availableUnits != null) ? raw.availableUnits : (a.kind === 'count' ? a.count : 0);
    if(qty > availableUnits) return { ok:false, error:'unavailable', detail:{ name: r.name, availableUnits, requested: qty, band: a.band } };
    // Campaign-wide monthly ceiling (RR p.124 — 10× the value shown; count cells only). Account for
    // same-item lines earlier in THIS order (the ledger only sees committed events).
    const remaining = marketMonthlyRemaining(campaign, set, { name: r.name, listPriceGp: r.listPriceGp }, 'buy');
    if(Number.isFinite(remaining)){
      const priorThisOrder = lines.reduce((s,l)=> s + (String(l.name||'').toLowerCase() === String(r.name||'').toLowerCase() ? (l.qty||0) : 0), 0);
      if(qty + priorThisOrder > remaining) return { ok:false, error:'monthly-ceiling', detail:{ name: r.name, remaining, requested: qty } };
    }
    const lineTotal = r.listPriceGp * qty;
    totalGp += lineTotal;
    totalStone += (r.stone || 0) * qty;   // per-unit catalogue weight × qty (the #346 load meter)
    lines.push({ name: r.name, qty, unitPriceGp: r.listPriceGp, totalGp: lineTotal, stone: r.stone, source: r.source });
  }
  // Funds gate (the wealth leg re-checks, but return a clean error here).
  const coinHandle = _marketCoinHandle(campaign, { payFrom: opts.payFrom, actorCharacterId: ch.id }, ch);
  const avail = _wealthLegAvailable(campaign, coinHandle);
  if(avail && avail.gated && totalGp > avail.available) return { ok:false, error:'insufficient-funds', detail:{ have: avail.available, need: totalGp } };

  const ev = newEvent('market-transaction', {
    submittedBy: opts.submittedBy || 'gm', status: EVENT_STATUS.PENDING,
    targetTurn: campaign.currentTurn || 1,
    context: { primaryHexId: (set && set.hexId) || ch.currentHexId || null, involvedHexIds: [], settlementId: opts.settlementId || null, domainId: (set && set.domainId) || null, relatedEntities: [{ kind:'character', id: ch.id, role:'subject' }] },
    payload: { direction:'buy', actorCharacterId: ch.id, settlementId: opts.settlementId || null,
               marketClass: _marketClassRoman(set), totalGp, currency:'gp', lines,
               activityCost: _marketActivityCost(campaign, totalStone, { partyOf12Dedicated: effectiveDedicated }),
               partyOf12Dedicated: effectiveDedicated,
               payFrom: opts.payFrom || 'purse', itemTo: opts.itemTo || 'carry' }
  });
  let out;
  try { out = applyEvent(campaign, ev); } catch(e){ return { ok:false, error: 'apply-failed', detail: String(e && e.message || e) }; }
  _logAppliedEvent(campaign, ev, out.result);
  return { ok:true, event: ev, totalGp, lines, result: out.result };
}
function marketSell(campaign, opts){
  opts = opts || {};
  const A = _gpwACKS();
  const ch = (campaign.characters||[]).find(c => c && c.id === opts.actorCharacterId);
  if(!ch) return { ok:false, error:'unknown-actor' };
  if(!Array.isArray(ch.inventory)) ch.inventory = [];
  const set = opts.settlementId ? (campaign.settlements||[]).find(s => s && s.id === opts.settlementId) : null;
  const mcIdx = set ? _marketClassIdx(set) : (opts.marketClassIdx != null ? opts.marketClassIdx : 5);
  const inLines = Array.isArray(opts.lines) ? opts.lines : [];
  if(!inLines.length) return { ok:false, error:'no-lines' };
  const effectiveDedicated = !!opts.partyOf12Dedicated && _actorPartySize(campaign, ch.id) >= 12;   // RR p.124 — a REAL 12+ party only
  const visitedBefore = !!opts.visitedBefore && A.hasMercantileNetwork(ch);   // RAW: only a venturer's Mercantile Network grants the +1 market class (RR p.43); dropped for everyone else
  const availOpts = { partyOf12Dedicated: effectiveDedicated, visitedBefore };
  const lines = []; let totalGp = 0, totalStone = 0;
  for(const raw of inLines){
    const ix = raw.inventoryIndex;
    if(!Number.isInteger(ix) || ix < 0 || ix >= ch.inventory.length) return { ok:false, error:'bad-index', detail:{ inventoryIndex: ix } };
    const held = ch.inventory[ix];
    const qty = (raw.qty != null) ? raw.qty : (held.qty != null ? held.qty : 1);
    const r = _resolveEquipmentLine({ catalogId: raw.catalogId, name: raw.name || held.name, priceGp: raw.priceGp, stone: held.stone });
    if(r.listPriceGp == null || !(r.listPriceGp >= 0)) return { ok:false, error:'no-price', detail:{ name: r.name } };
    // Selling is the mirror of buying — same availability gate (RR p.124).
    const a = A.equipmentAvailability ? A.equipmentAvailability(r.listPriceGp, mcIdx, availOpts) : { kind:'count', count: Infinity };
    const availableUnits = (raw.availableUnits != null) ? raw.availableUnits : (a.kind === 'count' ? a.count : 0);
    if(qty > availableUnits) return { ok:false, error:'unavailable', detail:{ name: r.name, availableUnits, requested: qty, band: a.band } };
    // Campaign-wide monthly ceiling (RR p.124 — 10× the value shown; count cells only).
    const remaining = marketMonthlyRemaining(campaign, set, { name: r.name, listPriceGp: r.listPriceGp }, 'sell');
    if(Number.isFinite(remaining)){
      const priorThisOrder = lines.reduce((s,l)=> s + (String(l.name||'').toLowerCase() === String(r.name||'').toLowerCase() ? (l.qty||0) : 0), 0);
      if(qty + priorThisOrder > remaining) return { ok:false, error:'monthly-ceiling', detail:{ name: r.name, remaining, requested: qty } };
    }
    const lineTotal = r.listPriceGp * qty;
    totalGp += lineTotal;
    totalStone += (Number(held.stone) || 0) * (qty / (held.qty || 1));   // proportional held-line weight (#346 load meter)
    lines.push({ name: r.name, qty, unitPriceGp: r.listPriceGp, totalGp: lineTotal, inventoryIndex: ix });
  }
  const ev = newEvent('market-transaction', {
    submittedBy: opts.submittedBy || 'gm', status: EVENT_STATUS.PENDING,
    targetTurn: campaign.currentTurn || 1,
    context: { primaryHexId: (set && set.hexId) || ch.currentHexId || null, involvedHexIds: [], settlementId: opts.settlementId || null, domainId: (set && set.domainId) || null, relatedEntities: [{ kind:'character', id: ch.id, role:'subject' }] },
    payload: { direction:'sell', actorCharacterId: ch.id, settlementId: opts.settlementId || null,
               marketClass: _marketClassRoman(set), totalGp, currency:'gp', lines,
               activityCost: _marketActivityCost(campaign, totalStone, { partyOf12Dedicated: effectiveDedicated }),
               partyOf12Dedicated: effectiveDedicated,
               payFrom: opts.payFrom || 'purse', itemFrom: opts.itemFrom || 'carry' }
  });
  let out;
  try { out = applyEvent(campaign, ev); } catch(e){ return { ok:false, error:'apply-failed', detail: String(e && e.message || e) }; }
  _logAppliedEvent(campaign, ev, out.result);
  return { ok:true, event: ev, totalGp, lines, result: out.result };
}

// ── reverseMarketTransaction — the rollback verb behind the Current Activities "Refund" reject ─
// (Joachim 2026-06-05). A market-transaction is a completed atomic act; "rejecting" it from the
// Activities view REVERSES it (the opposite of the day-tick "reject", which merely skips a
// not-yet-applied record). The reversal is a compensating counter-trade on the GP Wave B grammar:
// a refunded BUY returns the goods to the market + the coins to the purse; an unwound SELL takes
// the proceeds back + returns the goods. We mark the original payload.reversed (so it drops from
// today's activity budget AND frees the RR p.124 monthly ceiling — both readers skip reversed/
// reversal events) and log a flipped-direction market-transaction with NO activityCost (a reversal
// isn't itself a new activity). Refuse-with-reason (Joachim's call) rather than a partial unwind:
// a buy needs its goods still in the pack, a sell needs the proceeds still in the purse.
//
// v1 scope: the purse↔carry route only — the single route the Trade Wizard (IT-4) produces. A
// stash/treasury-routed trade refuses with a reason (reverse those from the stash view). Returns
// { ok:true, reversalEvent, narrativeSummary } | { ok:false, reason }.
function _reverseBuyFromCarry(ch, lines, opts){
  opts = opts || {};
  const inv = Array.isArray(ch.inventory) ? ch.inventory : (ch.inventory = []);
  // Atomic check first: every bought line must still be in the pack (aggregate qty by name).
  for(const ln of lines){
    const nm = ln.name || ln.label || 'item';
    const need = (ln.qty != null) ? ln.qty : 1;
    let have = 0;
    for(const it of inv){ if(it && it.name === nm) have += (it.qty != null ? it.qty : 1); }
    if(have < need) return { ok:false, reason:'the ' + nm + (have > 0 ? (' (only ' + have + ' of ' + need + ' left)') : '') + ' is no longer in ' + (ch.name || 'the pack') };
  }
  if(opts.dryRun) return { ok:true };
  for(const ln of lines){
    const nm = ln.name || ln.label || 'item';
    let need = (ln.qty != null) ? ln.qty : 1;
    for(let i = inv.length - 1; i >= 0 && need > 0; i--){
      const it = inv[i]; if(!it || it.name !== nm) continue;
      const q = (it.qty != null) ? it.qty : 1;
      const unitSt = q ? ((Number(it.stone) || 0) / q) : 0;
      const take = Math.min(q, need);
      if(take >= q){ inv.splice(i, 1); } else { it.qty = q - take; it.stone = unitSt * it.qty; }
      need -= take;
    }
  }
  return { ok:true };
}
function reverseMarketTransaction(campaign, eventId, opts){
  opts = opts || {};
  const entries = Array.isArray(campaign.eventLog) ? campaign.eventLog : [];
  const entry = entries.find(e => e && e.event && e.event.id === eventId);
  if(!entry) return { ok:false, reason:'That transaction is no longer in the event log.' };
  const ev = entry.event;
  if(ev.kind !== 'market-transaction') return { ok:false, reason:'That event is not a market transaction.' };
  const p = ev.payload || {};
  if(p.isReversal) return { ok:false, reason:'That entry is itself a reversal.' };
  if(p.reversed)   return { ok:false, reason:'This transaction was already reversed.' };
  const dir = (p.direction === 'sell') ? 'sell' : 'buy';
  const lines = Array.isArray(p.lines) ? p.lines : [];
  const totalGp = Number(p.totalGp) || 0;
  const actorId = p.actorCharacterId;
  const ch = (campaign.characters || []).find(c => c && c.id === actorId);
  if(!ch) return { ok:false, reason:'The acting character is no longer in the campaign.' };

  // v1 route guard: only the default purse↔carry route is auto-reversible.
  const coinV = p.payFrom || 'purse';
  const itemV = (dir === 'buy') ? (p.itemTo || 'carry') : (p.itemFrom || 'carry');
  if(coinV !== 'purse') return { ok:false, reason:'Paid from a stash/treasury — reverse it from that stash instead.' };
  if(itemV !== 'carry') return { ok:false, reason:'Goods routed through a stash — reverse it from that stash instead.' };

  const coinHandle = { kind:'character', id: ch.id, label: (ch.name || actorId) + "'s purse" };
  const name = ch.name || actorId;

  if(dir === 'buy'){
    // Refund a purchase: goods leave the pack (must still be there), coins return.
    const plan = _reverseBuyFromCarry(ch, lines, { dryRun:true });
    if(!plan.ok) return { ok:false, reason: 'Can’t refund — ' + plan.reason + '.' };
    _reverseBuyFromCarry(ch, lines, {});
    _applyWealthLeg(campaign, coinHandle, +totalGp, { reason:'market refund' });
  } else {
    // Unwind a sale: proceeds leave the purse (must still be there), goods return.
    const purseGp = Number(ch.coins && ch.coins.gp) || 0;
    if(purseGp < totalGp) return { ok:false, reason: 'Can’t unwind — ' + name + ' no longer holds the ' + totalGp.toLocaleString() + 'gp from that sale.' };
    _applyWealthLeg(campaign, coinHandle, -totalGp, { reason:'market unwind' });
    if(!Array.isArray(ch.inventory)) ch.inventory = [];
    for(const ln of lines){ ch.inventory.push(_marketLineToCarry(ln)); }
  }

  // Void the original (drops it from today's budget + frees the monthly ceiling) and log the
  // compensating market-transaction — flipped direction, same lines/value, NO activityCost.
  p.reversed = true;
  const rev = newEvent('market-transaction', {
    submittedBy:'gm', status: EVENT_STATUS.APPLIED, targetTurn: campaign.currentTurn || 1,
    context: ev.context || null,
    payload: {
      direction: (dir === 'buy' ? 'sell' : 'buy'), isReversal:true, reverses: ev.id,
      actorCharacterId: actorId, settlementId: p.settlementId || null,
      totalGp, currency:'gp', lines,
      payFrom: p.payFrom || 'purse', itemTo: p.itemTo, itemFrom: p.itemFrom
    }
  });
  const summary = (dir === 'buy' ? 'Refunded the purchase of ' : 'Unwound the sale of ') + _marketLinesSummary(lines)
                + (p.settlementId ? (' at ' + _settlementName(campaign, p.settlementId)) : '')
                + ' — ' + totalGp.toLocaleString() + 'gp ' + (dir === 'buy' ? 'returned to ' : 'taken back from ') + name;
  _logAppliedEvent(campaign, rev, { narrativeSummary: summary, marketReversal: { reverses: ev.id, direction: dir, totalGp } });
  p.reversedByEventId = rev.id;
  return { ok:true, reversalEvent: rev, narrativeSummary: summary };
}



// ─── #541 Event Wizard support (Architecture.md §10.12 — 2026-05-30) ───
// Per feedback-event-wizard-as-gm-surface: every event kind is GM-emittable through
// the Event Wizard by default. Subsystems opt OUT here when they own a dedicated flow
// that would skip important logic if emitted raw.
// ─── Phase 2.5 Provisioning V4 — the general Forage / Hunt activity (RR p.278 §1.4) ───────────────
// Any character can forage (firewood / water / food — ancillary) or hunt (food — dedicated), on or off a
// journey. The verb rolls the throw, applies the yield to the character's inventory/water IMMEDIATELY,
// and logs a RECORD-only 'provisioning-activity' event carrying payload.activityCost so the #346 day
// budget counts it (forage = ancillary, hunt = dedicated). +4 with the Survival proficiency (hunt also
// honors a Hunting proficiency). Terrain/territory modifiers apply to FOOD + HUNT, not water (RR p.278);
// foraged water is free + automatic at a fresh source. No replay handler — like marketBuy, the event is
// the audit record of a move the verb already made.

function _provHasProf(ch, re){
  // PT-0: read the canonical {key} (slug) as well as legacy strings / {name}; the single-word
  // forage/hunt regexes (/survival/i, /hunting/i) match the slug keys directly.
  return !!(ch && Array.isArray(ch.proficiencies)) && ch.proficiencies.some(p => re.test(typeof p === 'string' ? p : (p && (p.key || p.name || p.label)) || ''));
}
// Territory class for forage/hunt modifiers: a hex's domain classification, else 'Unsettled' (wilderness).
function _provTerritoryClass(campaign, hex){
  const A = _gpwACKS();
  if(hex && hex.domainId){
    const d = (campaign.domains || []).find(x => x && x.id === hex.domainId);
    if(d){ const cls = (typeof A.effectiveDomainClassification === 'function') ? A.effectiveDomainClassification(d) : (d.classification || null); if(cls) return cls; }
  }
  return 'Unsettled';
}
// Apply the SUCCESS yield for `kind`, tagging any added inventory line with `evId` so a reroll can
// surgically reverse JUST this attempt (independent of other stacked forages). Returns
// { yieldDays, yieldStone, pre } — `pre` (water only) is the snapshot a reverse restores.
function _provApplyYield(campaign, ch, kind, evId){
  const A = _gpwACKS();
  ch.inventory = ch.inventory || [];
  if(kind === 'water'){
    const cap = (typeof A.waterCapacityDays === 'function') ? A.waterCapacityDays(ch) : 0;
    const pre = { waterDaysCarried: Number(ch.waterDaysCarried) || 0, waterDeficitDays: ch.waterDeficitDays, dehydrated: ch.dehydrated };
    ch.waterDaysCarried = Math.min(cap, Math.max(pre.waterDaysCarried, 3));   // 3 days/forager, capped at containers
    ch.waterDeficitDays = 0; ch.dehydrated = false;
    return { yieldDays: 3, yieldStone: 0, pre: pre };
  }
  if(kind === 'firewood'){
    ch.inventory.push({ name: 'Firewood', stone: 8, notes: 'foraged', _provEventId: evId });
    return { yieldDays: 0, yieldStone: 8 };
  }
  const days = (kind === 'hunt') ? 6 : 3;   // 1 st game feeds 6 / ½ st food feeds 3
  const line = (typeof A.makeRationLine === 'function')
    ? A.makeRationLine({ rationType: 'iron', daysRemaining: days })
    : { name: 'Foraged food', rationType: 'iron', daysRemaining: days, stone: days * (1 / 6) };
  line._provEventId = evId;
  ch.inventory.push(line);
  return { yieldDays: days, yieldStone: (kind === 'hunt') ? 1 : 0.5 };
}
// Reverse a previously-applied success yield: drop the tagged line(s); restore water from payload._pre.
function _provReverseYield(campaign, ch, ev){
  const kind = (ev.payload.activity === 'hunt') ? 'hunt' : (ev.payload.forageKind || 'food');
  if(kind === 'water'){
    const pre = ev.payload._pre || {};
    if(pre.waterDaysCarried != null) ch.waterDaysCarried = pre.waterDaysCarried;
    if(pre.waterDeficitDays != null) ch.waterDeficitDays = pre.waterDeficitDays;
    if(pre.dehydrated != null) ch.dehydrated = pre.dehydrated;
    return;
  }
  if(Array.isArray(ch.inventory)){
    for(let i = ch.inventory.length - 1; i >= 0; i--){ const it = ch.inventory[i]; if(it && it._provEventId === ev.id) ch.inventory.splice(i, 1); }
  }
}
function _provNarrative(ch, p){
  const who = ch.name || 'A character';
  if(p.activity === 'hunt'){
    let s = who + (p.success ? ' hunts and brings down game (6 days’ food).' : ' hunts but finds no game.');
    // The RR p.278 wandering-monster draw rode the hunt (payload.encounter) — chronicle it.
    if(p.encounter && p.encounter.encounterId){
      s += ' The hunt crosses paths with ' + (p.encounter.label || 'a wandering encounter')
         + (p.encounter.encounterKind === 'at-lair' ? ' at their lair' : '') + '.';
    } else if(p.encounter && p.encounter.category){
      s += ' The hunt turns up a ' + p.encounter.category + ' terrain encounter — GM details.';
    }
    return s;
  }
  const k = p.forageKind || 'food';
  if(p.auto) return who + ' tops up at a fresh-water source.';
  if(!p.success) return who + ' forages for ' + k + ' but comes up empty.';
  if(k === 'water') return who + ' forages and finds water (' + (p.yieldDays || 3) + ' days’ worth).';
  if(k === 'firewood') return who + ' gathers firewood (8 st).';
  return who + ' forages and gathers food (3 days’ worth).';
}
// Build (UNLOGGED) the provisioning-activity event with the throw payload + the #346 cost tag (unless
// auto/free). The event is created BEFORE the yield is applied so the yield can be tagged with ev.id.
function _provBuildEvent(campaign, ch, hex, p){
  const slot = (p.activity === 'hunt') ? 'dedicated' : 'ancillary';
  const label = (p.activity === 'hunt') ? 'Hunt' : ('Forage ' + (p.forageKind || 'food'));
  const payload = Object.assign({ actorCharacterId: ch.id, hexId: (hex && hex.id) || ch.currentHexId || null }, p);
  if(!p.auto) payload.activityCost = { slot: slot, units: 1, kind: p.activity, strenuous: (p.activity === 'hunt'), label: label };
  return newEvent('provisioning-activity', {
    submittedBy: 'gm', status: EVENT_STATUS.PENDING, targetTurn: campaign.currentTurn || 1,
    context: { primaryHexId: (hex && hex.id) || ch.currentHexId || null, involvedHexIds: [], settlementId: null,
               domainId: (hex && hex.domainId) || null, relatedEntities: [{ kind: 'character', id: ch.id, role: 'subject' }] },
    payload: payload
  });
}
// Create the event, apply the yield on success (tagged with ev.id so a reroll reverses just this one),
// and log it (record-only — no replay handler, like marketBuy). Returns the logged event.
function _provCommit(campaign, ch, hex, p){
  const kind = (p.activity === 'hunt') ? 'hunt' : (p.forageKind || 'food');
  const ev = _provBuildEvent(campaign, ch, hex, p);
  if(p.success && !p.auto){
    const y = _provApplyYield(campaign, ch, kind, ev.id);
    ev.payload.yieldDays = y.yieldDays; ev.payload.yieldStone = y.yieldStone;
    if(y.pre) ev.payload._pre = y.pre;
  }
  return _logAppliedEvent(campaign, ev, { narrativeSummary: _provNarrative(ch, ev.payload) });
}

function forageActivity(campaign, opts){
  opts = opts || {};
  const A = _gpwACKS();
  const ch = (campaign.characters || []).find(c => c && c.id === opts.actorCharacterId);
  if(!ch) return { ok: false, error: 'unknown-actor' };
  const kind = opts.forageKind || 'food';
  if(['water', 'food', 'firewood'].indexOf(kind) < 0) return { ok: false, error: 'bad-forage-kind' };
  const hex = (typeof A.findHex === 'function') ? A.findHex(campaign, ch.currentHexId) : null;
  const rng = opts.rng || Math.random;
  const dry = !!(hex && (hex.terrain === 'barrens' || hex.terrain === 'desert'));
  const forest = !!(hex && hex.terrain === 'forest');
  const bonus = _provHasProf(ch, /survival/i) ? 4 : 0;

  if(kind === 'water'){
    if(typeof A.hasFreshSource === 'function' && A.hasFreshSource(campaign, hex)){
      const cap = (typeof A.waterCapacityDays === 'function') ? A.waterCapacityDays(ch) : 0;
      ch.waterDaysCarried = cap; ch.waterDeficitDays = 0; ch.dehydrated = false;   // auto/free — applied here, _provCommit skips the yield
      const ev = _provCommit(campaign, ch, hex, { activity: 'forage', forageKind: 'water', success: true, auto: true, yieldDays: cap });
      return { ok: true, success: true, auto: true, event: ev, newWaterDays: ch.waterDaysCarried };
    }
    const target = dry ? 18 : 14;
    // PT-6 → Layer 1: autoFailBand 0 — RR p.278 forage has NO natural-1 auto-fail (must be preserved).
    const fr = A.rollProficiencyThrow({ target: target, modifiers: [{ source: 'survival', value: bonus }], autoFailBand: 0, proficient: false, rng: rng });
    const rolled = fr.natural, success = fr.success;
    const ev = _provCommit(campaign, ch, hex, { activity: 'forage', forageKind: 'water', rolled, target, bonus, terrMod: 0, success });
    return { ok: true, success, rolled, target, bonus, event: ev, newWaterDays: ch.waterDaysCarried };
  }

  if(kind === 'firewood'){
    const target = forest ? 3 : 14;
    const fr = A.rollProficiencyThrow({ target: target, modifiers: [{ source: 'survival', value: bonus }], autoFailBand: 0, proficient: false, rng: rng });  // PT-6 → Layer 1 (no auto-fail, RR p.278)
    const rolled = fr.natural, success = fr.success;
    const ev = _provCommit(campaign, ch, hex, { activity: 'forage', forageKind: 'firewood', rolled, target, bonus, terrMod: 0, success });
    return { ok: true, success, rolled, target, bonus, event: ev };
  }

  // food (18+, +4 Survival, −4 barrens/desert, territory −4 Civilized / −2 Borderlands)
  const territory = _provTerritoryClass(campaign, hex);
  let terrMod = 0;
  if(dry) terrMod -= 4;
  if(territory === 'Civilized') terrMod -= 4; else if(territory === 'Borderlands') terrMod -= 2;
  const target = 18;
  // PT-6 → Layer 1: bonus (Survival) + terrMod (terrain/territory) itemized; autoFailBand 0 (no auto-fail, RR p.278).
  const fr = A.rollProficiencyThrow({ target: target, modifiers: [{ source: 'survival', value: bonus }, { source: 'territory', value: terrMod }], autoFailBand: 0, proficient: false, rng: rng });
  const rolled = fr.natural, success = fr.success;
  const ev = _provCommit(campaign, ch, hex, { activity: 'forage', forageKind: 'food', rolled, target, bonus, terrMod, success });
  return { ok: true, success, rolled, target, bonus, terrMod, event: ev };
}

// RR p.278: "Adventurers who hunt risk encountering wandering monsters, however, with the
// Judge rolling on his encounter table based on the terrain." One draw per hunt attempt
// (ENCOUNTER_FREQUENCY 'hunting' = per-attempt in every territory class), the standard
// TABLE-FIRST chain the travel/rest triggers use (#476 E1/E4) — a hunter prowls the hex's
// wilds, so terrain finds apply (no resting demotion) and no road column folds. partySide
// threads the hunter's cohort so a band hunting THEM never answers their own draw (E4m).
// A meeting (monster/civilized) materializes its Encounter entity at once — the hunt is a
// live GM verb, like the search-hour. Returns the compact record the payload carries, or
// null (no-encounter, or no authored hex — an unauthored coord draws nothing, the E6 rule).
function _huntWanderingDraw(campaign, ch, hex, rng){
  const A = _gpwACKS();
  if(!hex || typeof A.encounterDraw !== 'function') return null;
  const cohort = (typeof A.characterCohort === 'function') ? A.characterCohort(campaign, ch) : [ch];
  const ids = cohort.map(c => c && c.id).filter(Boolean);
  const draw = A.encounterDraw(campaign, hex.id, { rng: rng,
    partySide: { partyId: ch.partyId || null, characterIds: ids } });
  if(!draw || draw.category === 'no-encounter') return null;
  const prop = draw.proposal || null;
  const rec = {
    category: draw.category, rarity: draw.rarity || null, columnKey: draw.columnKey,
    source: (prop && prop.source) || null, lairId: (prop && prop.lairId) || null,
    encounterKind: (prop && prop.encounterKind) || null,
    encounterId: null, label: ''
  };
  if((draw.category === 'monster' || draw.category === 'civilized') && typeof A.createEncounterFromDraw === 'function'){
    const entity = A.createEncounterFromDraw(campaign, draw, {
      trigger: 'hunt',
      partySide: { partyId: ch.partyId || null, journeyId: null,
                   characterIds: ids, faceCharacterId: ch.id, sizeCount: ids.length || 1 },
      rng: rng
    });
    if(entity){
      rec.encounterId = entity.id;
      const ms = entity.monsterSide || {};
      rec.lairId = ms.lairId || rec.lairId;
      rec.encounterKind = ms.encounterKind || rec.encounterKind;
      const name = (ms.monsterCatalogKey && typeof A.monsterDisplayName === 'function' && A.monsterDisplayName(ms.monsterCatalogKey))
        || ms.label || (draw.category === 'civilized' ? 'civilized folk (GM identifies)' : 'monsters (GM identifies)');
      rec.label = (ms.count ? ms.count + ' ' : '') + name;
    }
  }
  return rec;
}

function huntActivity(campaign, opts){
  opts = opts || {};
  const A = _gpwACKS();
  const ch = (campaign.characters || []).find(c => c && c.id === opts.actorCharacterId);
  if(!ch) return { ok: false, error: 'unknown-actor' };
  const hex = (typeof A.findHex === 'function') ? A.findHex(campaign, ch.currentHexId) : null;
  const rng = opts.rng || Math.random;
  const territory = _provTerritoryClass(campaign, hex);
  const bonus = _provHasProf(ch, /hunting|survival/i) ? 4 : 0;
  let terrMod = 0;
  if(territory === 'Civilized') terrMod -= 4; else if(territory === 'Outlands') terrMod += 2; else if(territory === 'Unsettled') terrMod += 4;
  const target = 14;
  // PT-6 → Layer 1: Survival/Hunting bonus + territory terrMod itemized; autoFailBand 0 (no auto-fail,
  // RR p.278). The throw consumes ONE rng BEFORE the wandering draw — order preserved (byte-identical).
  const fr = A.rollProficiencyThrow({ target: target, modifiers: [{ source: 'survival', value: bonus }, { source: 'territory', value: terrMod }], autoFailBand: 0, proficient: false, rng: rng });
  const rolled = fr.natural, success = fr.success;
  const encounter = _huntWanderingDraw(campaign, ch, hex, rng);
  const ev = _provCommit(campaign, ch, hex, { activity: 'hunt', rolled, target, bonus, terrMod, success, wanderingMonsterRisk: true, encounter: encounter });
  return { ok: true, success, rolled, target, bonus, terrMod, wanderingMonsterRisk: true, encounter: encounter, event: ev };
}

// Re-roll a logged forage/hunt (the GM's "that throw was unlucky" affordance, per Joachim). Re-throws the
// die against the SAME target/bonus/territory, then flips the yield only if the success state changed:
// success→fail reverses the yield (drops the tagged ration/firewood line, or restores water from _pre);
// fail→success applies a fresh yield. Updates the event record in place (no new event). Auto/free water
// has no throw → not rerollable. NB tags are session-scoped — after a save/reload merges ration lines the
// surgical reverse may no longer find the line, so reroll is a same-session affordance.
function rerollProvisioningActivity(campaign, eventId, opts){
  opts = opts || {};
  const wrap = (campaign.eventLog || []).find(e => e && e.event && e.event.id === eventId);
  if(!wrap) return { ok: false, error: 'event-not-found' };
  const ev = wrap.event;
  if(ev.kind !== 'provisioning-activity') return { ok: false, error: 'not-provisioning' };
  if(ev.payload.auto) return { ok: false, error: 'auto-not-rerollable' };
  const ch = (campaign.characters || []).find(c => c && c.id === ev.payload.actorCharacterId);
  if(!ch) return { ok: false, error: 'unknown-actor' };
  const kind = (ev.payload.activity === 'hunt') ? 'hunt' : (ev.payload.forageKind || 'food');
  const oldSuccess = !!ev.payload.success;
  const bonus = Number(ev.payload.bonus) || 0;
  const terrMod = Number(ev.payload.terrMod) || 0;
  const target = Number(ev.payload.target) || 14;
  // PT-6 → Layer 1 (the forage/hunt reroll re-throws the same throw): autoFailBand 0, no auto-fail (RR p.278).
  const fr = _gpwACKS().rollProficiencyThrow({ target: target, modifiers: [{ source: 'bonus', value: bonus }, { source: 'territory', value: terrMod }], autoFailBand: 0, proficient: false, rng: opts.rng || Math.random });
  const rolled = fr.natural;
  const success = fr.success;
  if(oldSuccess && !success){
    _provReverseYield(campaign, ch, ev);
  } else if(!oldSuccess && success){
    const y = _provApplyYield(campaign, ch, kind, ev.id);
    ev.payload.yieldDays = y.yieldDays; ev.payload.yieldStone = y.yieldStone;
    if(y.pre) ev.payload._pre = y.pre;
  }
  ev.payload.rolled = rolled;
  ev.payload.success = success;
  if(!success){ ev.payload.yieldDays = 0; ev.payload.yieldStone = 0; }
  wrap.result = wrap.result || {};
  wrap.result.narrativeSummary = _provNarrative(ch, ev.payload);
  return { ok: true, success, rolled, target, bonus, terrMod, event: ev, kind: kind, activity: ev.payload.activity, forageKind: ev.payload.forageKind, wanderingMonsterRisk: ev.payload.wanderingMonsterRisk, encounter: ev.payload.encounter || null };
}

// ─── #476 M4 — Wilderness Search + track-home (RR pp.276–277 + p.120; Plan §6) ────────────────────
// hexSearchActivity = ONE search-hour: the party's Wilderness Search throw against the hex's
// undiscovered lairs, the RAW per-hour encounter check, and (when a cohort member knows Land
// Surveying) the POI-count assessment. beginTracking (E5, further below) = the RAW Tracking find
// throw (RR p.120) that opens a multi-day follow. Both are GM-facing verbs — the Judge
// rolls secretly; failure reveals nothing (RR p.276) — and both log a record-only, ALWAYS-
// campaignLogHidden 'hex-search' event carrying payload.activityCost (one ancillary; RR p.276
// names the search-hour an ancillary activity) so the #346 day budget counts it. A discovery
// additionally emits the chronicle-visible 'lair-discovered' event (discoverLair owns the flip).

// The party's expedition speed for the search target: the actor's cohort (party / journey
// co-members at the hex — characterCohort), slowest member's encumbrance mi/day, × the hex's
// terrain multiplier (the same factor travel uses; RAW's worked example: hills ×2/3, 48 → 32 mi).
function _searchExpeditionSpeed(campaign, ch, hex){
  const A = _gpwACKS();
  const cohort = (typeof A.characterCohort === 'function') ? A.characterCohort(campaign, ch) : [ch];
  let slowest = Infinity;
  for(const m of cohort){
    const mpd = (typeof A.carryEncumbranceInfo === 'function') ? A.carryEncumbranceInfo(m).band.milesPerDay : 24;
    if(typeof mpd === 'number' && mpd < slowest) slowest = mpd;
  }
  if(slowest === Infinity) slowest = 24;
  // Raw key first (JOURNEY_TERRAIN_SPEED carries finer-than-base keys like 'swamp-forested'),
  // then terrain's base normalizer so alias terrains (tundra→barrens, forested→forest) pace right.
  let tMult = 1;
  if(hex && A.JOURNEY_TERRAIN_SPEED){
    const raw = String(hex.terrain || '').toLowerCase().trim();
    if(A.JOURNEY_TERRAIN_SPEED[raw] != null) tMult = A.JOURNEY_TERRAIN_SPEED[raw];
    else {
      const base = (typeof A.terrainBase === 'function') ? A.terrainBase(raw) : '';
      if(base && A.JOURNEY_TERRAIN_SPEED[base] != null) tMult = A.JOURNEY_TERRAIN_SPEED[base];
    }
  }
  return { speed: slowest * tMult, cohort: cohort };
}
function _cohortHasProf(cohort, re){ return (cohort || []).some(m => _provHasProf(m, re)); }
// Undiscovered POIs at the hex: every placed lair the players haven't found — live or not (a
// cleared ruin is still a point of interest); the unplaced dynamic pool is in no hex.
function _undiscoveredLairsAt(campaign, hexId){
  const A = _gpwACKS();
  return (A.lairsAtHex(campaign, hexId) || []).filter(l => l && !l.knownToPlayers && l.status !== 'dynamic');
}
// Emit the chronicle-visible discovery record (paired with a discoverLair call the caller made).
function _emitLairDiscovered(campaign, lair, ch, method, parentEv){
  const A = _gpwACKS();
  const hex = (typeof A.findHex === 'function') ? A.findHex(campaign, lair.hexId) : null;
  const ev = newEvent('lair-discovered', {
    submittedBy: 'gm', status: EVENT_STATUS.PENDING, targetTurn: campaign.currentTurn || 1,
    parentEventId: parentEv ? parentEv.id : null,
    context: { primaryHexId: lair.hexId || null, involvedHexIds: [], settlementId: null,
               domainId: (hex && hex.domainId) || null,
               relatedEntities: [
                 ch ? { kind: 'character', id: ch.id, role: 'subject' } : null,
                 { kind: 'lair', id: lair.id, role: 'target' }
               ].filter(Boolean) },
    payload: { lairId: lair.id, hexId: lair.hexId || null, method: method || 'gm-reveal',
               byCharacterId: ch ? ch.id : null, lairName: lair.name || '',
               monsterCatalogKey: lair.monsterCatalogKey || '' }
  });
  const who = (ch && ch.name) || 'The party';
  const what = lair.name || ((typeof A.monsterDisplayName === 'function') && A.monsterDisplayName(lair.monsterCatalogKey)) || 'a lair';
  const how = method === 'track-home' ? 'tracks the creatures home to' : (method === 'gm-reveal' ? 'learns of' : 'discovers');
  return _logAppliedEvent(campaign, ev, { narrativeSummary: who + ' ' + how + ' ' + what + '.' });
}
// The M7 "Mark discovered" button's record half (the UI calls discoverLair first): GM reveal.
function recordLairDiscovered(campaign, lairId, opts){
  opts = opts || {};
  const A = _gpwACKS();
  const lair = (typeof A.findLair === 'function') ? A.findLair(campaign, lairId) : null;
  if(!lair) return null;
  const ch = opts.byCharacterId ? (campaign.characters || []).find(c => c && c.id === opts.byCharacterId) : null;
  return _emitLairDiscovered(campaign, lair, ch || null, opts.method || 'gm-reveal', null);
}

// Apply a search find: snapshot the lair's pre-discovery state into the search event's payload
// (so a reroll can reverse JUST this discovery), then discover + emit the chronicle record.
// hexSearchActivity only finds UNdiscovered lairs, so the pre knownToPlayers is false by construction.
function _applySearchDiscovery(campaign, ev, ch, lair){
  const A = _gpwACKS();
  ev.payload._pre = {
    lastVisitedTurn: (lair.lastVisitedTurn === undefined) ? null : lair.lastVisitedTurn,
    discoveryHistoryLen: Array.isArray(lair.discoveryHistory) ? lair.discoveryHistory.length : 0,
    historyLen: Array.isArray(lair.history) ? lair.history.length : 0
  };
  if(typeof A.discoverLair === 'function') A.discoverLair(campaign, lair.id, { by: ch.id, method: ev.payload.method });
  _emitLairDiscovered(campaign, lair, ch, ev.payload.method, ev);
}
// Reverse a search find (reroll lost it): restore the lair from the payload's _pre snapshot and
// drop the child lair-discovered record — a same-session affordance, like the forage line-tag reverse.
function _reverseSearchDiscovery(campaign, ev){
  const A = _gpwACKS();
  const lair = (typeof A.findLair === 'function') ? A.findLair(campaign, ev.payload.foundLairId) : null;
  if(lair){
    const pre = ev.payload._pre || {};
    lair.knownToPlayers = false;
    lair.lastVisitedTurn = (pre.lastVisitedTurn === undefined) ? null : pre.lastVisitedTurn;
    if(Array.isArray(lair.discoveryHistory) && pre.discoveryHistoryLen != null) lair.discoveryHistory.length = Math.min(lair.discoveryHistory.length, pre.discoveryHistoryLen);
    if(Array.isArray(lair.history) && pre.historyLen != null) lair.history.length = Math.min(lair.history.length, pre.historyLen);
  }
  if(Array.isArray(campaign.eventLog)){
    for(let i = campaign.eventLog.length - 1; i >= 0; i--){
      const w = campaign.eventLog[i];
      if(w && w.event && w.event.kind === 'lair-discovered' && w.event.parentEventId === ev.id) campaign.eventLog.splice(i, 1);
    }
  }
  delete ev.payload._pre;
}

// Re-roll a logged search hour (the GM's "that throw was unlucky" redo — the forage-reroll sibling).
// Re-throws ONLY the search d20 vs the SAME target/bonus/mod; the hour's encounter check + Land
// Surveying assessment are HELD (separate dice with their own outcomes — same philosophy as the
// journey day log's split nav/forage rerolls). Flips the discovery if the success state changes:
// a lost find is reversed surgically (knownToPlayers back, discovery/history stamps truncated, the
// child lair-discovered record dropped) and a fresh success re-picks from the hex's CURRENT
// undiscovered pool. Updates the event in place — the hour was already spent, so the #346 budget
// is unchanged (a reroll works even when the day is full). Track-home attempts are not rerollable.
function rerollHexSearch(campaign, eventId, opts){
  opts = opts || {};
  const wrap = (campaign.eventLog || []).find(e => e && e.event && e.event.id === eventId);
  if(!wrap) return { ok: false, error: 'event-not-found' };
  const ev = wrap.event;
  if(ev.kind !== 'hex-search') return { ok: false, error: 'not-a-search' };
  if(ev.payload.method === 'track-home' || ev.payload.method === 'begin-tracking') return { ok: false, error: 'track-not-rerollable' };
  const ch = (campaign.characters || []).find(c => c && c.id === ev.payload.actorCharacterId);
  if(!ch) return { ok: false, error: 'unknown-actor' };
  const rng = opts.rng || Math.random;
  const target = Number(ev.payload.target) || 18;
  const bonus = Number(ev.payload.bonus) || 0;
  const mod = Number(ev.payload.mod) || 0;
  // E8 — a landmark-search hour (RR p.285): re-throw the d20 and flip the JOURNEY's lost
  // state with the success (no lair pool here). Defensive — the flip applies only when the
  // journey still holds the expected state (a same-session affordance, like the lair reverse).
  if(ev.payload.method === 'landmark-search'){
    // PT-6 → Layer 1 (the landmark-search reroll, RR p.285): nat-1 auto-fail (autoFailBand 1).
    const lr = _gpwACKS().rollProficiencyThrow({ target: target, modifiers: [{ source: 'tracking', value: bonus }, { source: 'specific', value: mod }], autoFailBand: 1, proficient: false, rng: rng });
    const lRolled = lr.natural;
    const lScore = lr.total;
    const lSuccess = lr.success;
    const lj = (campaign.journeys || []).find(x => x && x.id === ev.payload.landmarkJourneyId) || null;
    if(lj){
      if(lSuccess && !ev.payload.landmarkFound && lj.status === 'lost'){
        lj.status = 'in-transit'; lj.lostEncounterId = null;
      } else if(!lSuccess && ev.payload.landmarkFound && lj.status === 'in-transit'){
        lj.status = 'lost'; lj.lostEncounterId = ev.payload.lostEncounterId || null;
      }
    }
    ev.payload.rolled = lRolled;
    ev.payload.success = lSuccess;
    ev.payload.landmarkFound = lSuccess;
    wrap.result = wrap.result || {};
    wrap.result.narrativeSummary = (ch.name || 'The party') + ' searches for the party’s last landmark — ' + (lSuccess ? 'finds it; bearings recovered.' : 'no luck yet.');
    return { ok: true, rolled: lRolled, target: target, bonus: bonus, mod: mod, success: lSuccess,
             found: null, landmarkFound: lSuccess, event: ev };
  }
  if(ev.payload.foundLairId) _reverseSearchDiscovery(campaign, ev);   // the old find returns to the pool before the re-pick
  // PT-6 → Layer 1 (the search reroll): nat-1 auto-fail (autoFailBand 1).
  const sr = _gpwACKS().rollProficiencyThrow({ target: target, modifiers: [{ source: 'tracking', value: bonus }, { source: 'specific', value: mod }], autoFailBand: 1, proficient: false, rng: rng });
  const rolled = sr.natural;
  const score = sr.total;
  const success = sr.success;
  let found = null;
  if(success){
    let pool = _undiscoveredLairsAt(campaign, ev.payload.hexId).filter(l => score >= target + (Number(l.hiddenDC) || 0));
    if(ev.payload.specificLairId) pool = pool.filter(l => l.id === ev.payload.specificLairId);
    if(pool.length) found = pool[Math.floor(rng() * pool.length)];
  }
  ev.payload.rolled = rolled;
  ev.payload.success = success;
  ev.payload.foundLairId = found ? found.id : null;
  if(found) _applySearchDiscovery(campaign, ev, ch, found);
  wrap.result = wrap.result || {};
  wrap.result.narrativeSummary = (ch.name || 'The party') + ' searches the hex — ' + (found ? ('finds ' + (found.name || 'a lair') + '.') : 'finds nothing.');
  return { ok: true, rolled: rolled, target: target, bonus: bonus, mod: mod, success: success, found: found || null, event: ev };
}

// One search-hour (RR pp.276–277). opts: { actorCharacterId, hexId? (default: the actor's),
// specific? (−4, a particular POI), specificLairId? (only that lair can be found),
// landmarkJourneyId? (E8 — the RR p.285 last-known-landmark search: the recovery for a
// knowingly-lost journey; always a SPECIFIC point of interest [−4], finds the landmark
// instead of a lair — success flips the journey back to in-transit), rng? }.
function hexSearchActivity(campaign, opts){
  opts = opts || {};
  const A = _gpwACKS();
  const ch = (campaign.characters || []).find(c => c && c.id === opts.actorCharacterId);
  if(!ch) return { ok: false, error: 'unknown-actor' };
  const hexId = opts.hexId || ch.currentHexId || null;
  if(!hexId) return { ok: false, error: 'no-hex' };
  const hex = (typeof A.findHex === 'function') ? A.findHex(campaign, hexId) : null;
  const rng = opts.rng || Math.random;
  const landmarkJourney = opts.landmarkJourneyId
    ? (((campaign.journeys || []).find(j => j && j.id === opts.landmarkJourneyId)) || null) : null;
  if(opts.landmarkJourneyId && !landmarkJourney) return { ok: false, error: 'unknown-journey' };
  const sp = _searchExpeditionSpeed(campaign, ch, hex);
  const target = (typeof A.wildernessSearchTargetForSpeed === 'function') ? A.wildernessSearchTargetForSpeed(sp.speed) : 18;
  const bonus = _cohortHasProf(sp.cohort, /tracking/i) ? 4 : 0;   // any member with Tracking → +4 (extra ranks do NOT add here — RR p.120)
  const mod = (opts.specific || landmarkJourney) ? -4 : 0;        // the landmark IS a specific point of interest (RR p.285 ¶3)
  // PT-6 → Layer 1 (the search throw, RR pp.276–277): nat-1 auto-fail (autoFailBand 1); the Tracking
  // +4 and specific/landmark −4 carry as itemized modifiers. Byte-identical to the inline 1d20.
  const sr = A.rollProficiencyThrow({ target: target, modifiers: [{ source: 'tracking', value: bonus }, { source: 'specific', value: mod }], autoFailBand: 1, proficient: false, rng: rng });
  const rolled = sr.natural;
  const score = sr.total;
  const throwSuccess = sr.success;                                 // unmodified 1 always fails (ACKS-general)
  // What a successful throw finds: an undiscovered lair whose hiddenDC the score also clears
  // (hiddenDC raises that one lair's bar — well-hidden). The Judge picks among qualifiers (RR
  // p.276 "the Judge will decide which one"); v1 picks randomly. In landmark mode the hour
  // seeks the LANDMARK, not a lair — success recovers the journey's bearings instead.
  let found = null;
  if(throwSuccess && !landmarkJourney){
    let pool = _undiscoveredLairsAt(campaign, hexId).filter(l => score >= target + (Number(l.hiddenDC) || 0));
    if(opts.specificLairId) pool = pool.filter(l => l.id === opts.specificLairId);
    if(pool.length) found = pool[Math.floor(rng() * pool.length)];
  }
  // E8 — the landmark recovery (RR p.285): finding the last known landmark re-orients the
  // party; the lost journey resumes. The prior lostEncounterId is stashed on the payload so
  // the reroll's success→fail flip can re-lose it surgically (same-session affordance).
  let landmarkFound = false;
  const priorLostEncounterId = (landmarkJourney && landmarkJourney.lostEncounterId) || null;
  if(landmarkJourney && throwSuccess){
    landmarkFound = true;
    if(landmarkJourney.status === 'lost') landmarkJourney.status = 'in-transit';
    landmarkJourney.lostEncounterId = null;
    (landmarkJourney.history = landmarkJourney.history || []).push({
      turn: campaign.currentTurn || null, dayIndex: landmarkJourney.currentDayIndex || 0, type: 'recovered',
      narrative: (ch.name || 'The party') + ' found the last known landmark — bearings recovered; the journey resumes (RR p.285).' });
  }
  // RAW p.277 + JJ p.41: searching triggers one encounter THROW per hour — the full category
  // draw (#476 E1, replacing the J1 1/6 stub; terrain finds apply while searching — only
  // RESTING demotes them, JJ p.42 step 7). A meeting category (monster / civilized)
  // materializes an Encounter entity at once — the search is a live GM verb, no propose/
  // commit dance — and the draw rides the search payload. The search draw keeps
  // LAIR-FIRST PRECEDENCE (RR p.276: an encounter while searching means the party has
  // "stumbled onto" the hex's lairs) — but a hex with nothing to stumble onto falls
  // through to the same JJ identity tables as the travel/rest draws (E4n): a search-hour
  // wandering encounter is an ordinary wandering encounter. partySide threads the
  // searchers so a band hunting THEM never answers their own draw (E4m).
  let encounter = null;
  if(typeof A.encounterDraw === 'function'){
    const draw = A.encounterDraw(campaign, hexId, { rng: rng, lairFirst: true,
      partySide: { partyId: ch.partyId || null, characterIds: (sp.cohort || []).map(c => c && c.id).filter(Boolean) } });
    if(draw && draw.category !== 'no-encounter'){
      const prop = draw.proposal || null;
      encounter = {
        category: draw.category, rarity: draw.rarity || null, columnKey: draw.columnKey,
        source: (prop && prop.source) || null, lairId: (prop && prop.lairId) || null,
        encounterKind: (prop && prop.encounterKind) || null,
        fragmentCount: (prop && prop.fragment && prop.fragment.count) || null,
        seededShellLairIds: (prop && prop.source === 'seeded-shell') ? prop.candidates.map(l => l.id) : null,
        encounterId: null
      };
      if((draw.category === 'monster' || draw.category === 'civilized') && typeof A.createEncounterFromDraw === 'function'){
        const entity = A.createEncounterFromDraw(campaign, draw, {
          trigger: 'hex-search',
          partySide: { partyId: ch.partyId || null, journeyId: null,
                       characterIds: (sp.cohort || []).map(c => c && c.id).filter(Boolean),
                       faceCharacterId: ch.id, sizeCount: (sp.cohort || []).length || 1 },
          rng: rng
        });
        if(entity) encounter.encounterId = entity.id;
      }
    }
  }
  // Land Surveying (RR p.277): assess the hex's POI count — 18+, cumulative +4 per successful
  // search conducted here, nat-1 → a false reading the Judge reveals as if true. Skipped in
  // landmark mode (the hour is spent on the landmark, not surveying the hex).
  let survey = null;
  if(!landmarkJourney && _cohortHasProf(sp.cohort, /land.?surveying/i)){
    const prior = (campaign.eventLog || []).filter(e => e && e.event && e.event.kind === 'hex-search'
      && e.event.payload && e.event.payload.hexId === hexId && e.event.payload.success
      && e.event.payload.method !== 'track-home').length;
    const sBonus = prior * 4;
    // PT-6 → Layer 1 (RR p.277 Land Surveying): nat-1 (sr.botch) → a false reading; else sr.success
    // (≥ 18). sBonus is rng-free so moving it before the roll preserves rng order → byte-identical.
    const sr = A.rollProficiencyThrow({ target: 18, modifiers: [{ source: 'prior-searches', value: sBonus }], autoFailBand: 1, proficient: false, fumbleEffect: 'false-reading', rng: rng });
    const sRoll = sr.natural;
    const trueCount = ((typeof A.lairsAtHex === 'function') ? (A.lairsAtHex(campaign, hexId) || []) : []).filter(l => l && l.status !== 'dynamic').length;
    if(sr.botch){
      let fake = trueCount + ((rng() < 0.5 ? 1 : -1) * (1 + Math.floor(rng() * 3)));
      if(fake < 0 || fake === trueCount) fake = trueCount + 1;
      survey = { assessed: true, falseReading: true, count: fake, rolled: sRoll, target: 18, bonus: sBonus };
    } else if(sr.success){
      survey = { assessed: true, falseReading: false, count: trueCount, rolled: sRoll, target: 18, bonus: sBonus };
    } else {
      survey = { assessed: false, rolled: sRoll, target: 18, bonus: sBonus };
    }
  }
  const ev = newEvent('hex-search', {
    submittedBy: 'gm', status: EVENT_STATUS.PENDING, targetTurn: campaign.currentTurn || 1,
    context: { primaryHexId: hexId, involvedHexIds: [], settlementId: null,
               domainId: (hex && hex.domainId) || null,
               relatedEntities: [{ kind: 'character', id: ch.id, role: 'subject' }] },
    payload: {
      actorCharacterId: ch.id, hexId: hexId,
      method: landmarkJourney ? 'landmark-search' : (opts.specific ? 'search-specific' : 'search'),
      rolled: rolled, target: target, bonus: bonus, mod: mod, success: throwSuccess,
      foundLairId: found ? found.id : null,
      speedMilesPerDay: Math.round(sp.speed * 10) / 10,
      specificLairId: opts.specificLairId || null,
      landmarkJourneyId: landmarkJourney ? landmarkJourney.id : null,
      landmarkFound: landmarkJourney ? landmarkFound : null,
      lostEncounterId: priorLostEncounterId,
      encounter: encounter, survey: survey,
      activityCost: { slot: 'ancillary', units: 1, kind: 'search-hex',
                      label: landmarkJourney ? 'Search for the landmark' : 'Search the hex' }
    }
  });
  ev.campaignLogHidden = true;   // the Judge's secret roll — audit + budget only; discovery narrates via lair-discovered
  const who = ch.name || 'The party';
  const summary = landmarkJourney
    ? (who + ' searches for the party’s last landmark — ' + (landmarkFound ? 'finds it; bearings recovered.' : 'no luck yet.'))
    : (who + ' searches the hex — ' + (found ? ('finds ' + (found.name || 'a lair') + '.') : 'finds nothing.'));
  _logAppliedEvent(campaign, ev, { narrativeSummary: summary });
  if(found) _applySearchDiscovery(campaign, ev, ch, found);
  return { ok: true, rolled: rolled, target: target, bonus: bonus, mod: mod, success: throwSuccess,
           found: found || null, landmarkFound: landmarkJourney ? landmarkFound : null,
           encounter: encounter, survey: survey, speedMilesPerDay: sp.speed, event: ev };
}

// ── #476 E5 — universal tracking (RR p.120 in FULL; Joachim 2026-06-11: "allow all creatures
// who are met (and the encounter is evaded or passed) to be tracked, even if they don't have
// a lair… They are followed until caught or the trail is lost"). The RAW split: FINDING
// tracks is the throw — Tracking proficiency 11+ after one turn's search, modified by the
// band's numbers (+2 at 2–4 / +4 at 5–8 / +6 at 9–16 / +8 at 17+), the ground (+4 soft/muddy
// / −8 hard/rocky), the trail's age (−1 per 12 hours of good weather since it was made),
// rain/snow (−4 per hour since it was made) and dim light (−4); extra Tracking ranks add +4
// each. FOLLOWING needs NO throw — the party moves at HALF expedition speed along the
// quarry's path — and the trail breaks only on events: it enters water, or an hour of
// rain/snow falls; then the tracker must SEARCH AGAIN (a fresh find throw). So a track is a
// multi-day FOLLOW, not a one-throw discovery: beginTracking rolls the find and opens a
// pursuit with direction 'party' on the resolved meeting — the E3c monster-chase's mirror,
// the same enc.pursuit field, the same slot-82 day consumer, inspected on the same panel —
// and steers the trackers' Journey after it (one is started, or the active one re-routed;
// pace capped at half-speed by journeyMaxPace; no Navigation throw while the spoor leads).
// The quarry WALKS the map (🔧 v1 world-model: a band with a den heads home at full
// expedition speed and waits there; a den-less or migrant band roams at HALF expedition
// speed on a seeded heading for a seeded 1d4 days, then camps; civilized folk head for the
// nearest settlement — dwellings, never dens; a tracked migrant Group's currentHexId moves
// with the follow). CAUGHT — the trackers reach the quarry — springs a FRESH encounter at
// its hex (trigger 'pursuit', createReason 'tracking-caught-up', monsterSide.
// pursuitEncounterId → D9 recalls the original meeting); a quarry caught AT its den is an
// at-lair meeting against the whole den, and the arrival IS the discovery (discoverLair
// method 'tracking'). This REPLACES the E4i/M4 one-throw trackHomeAttempt — the same-hex
// cases (a settled-after-evasion band, a den in the meeting hex) still resolve at once,
// because the quarry is already halted where the trackers stand.

// The RR p.120 find-the-tracks throw, itemized (the E2h convention). opts: { ranks (≥1),
// countTracked, groundMod (+4 soft/muddy | 0 | −8 hard/rocky), trailAgeDays (−2 per full day
// — RAW's −1 per 12 hours of good weather), rainHours (−4 each), dimLight (−4), gmMod, rng }.
// Natural 1 auto-fails (the house convention on these throws). Shared by beginTracking and
// the slot-82 consumer's re-find after a loss event (rain/snow, the trail entering water).
function trackingFindThrow(opts){
  const o = opts || {};
  const rng = o.rng || Math.random;
  const ranks = Math.max(1, Number(o.ranks) || 1);
  const n = Number(o.countTracked) || 0;
  const countBonus = (n >= 17) ? 8 : (n > 8) ? 6 : (n > 4) ? 4 : (n >= 2) ? 2 : 0;
  const mods = [];
  if(countBonus)          mods.push({ source: 'count-band',  value: countBonus });
  if(ranks > 1)           mods.push({ source: 'extra-ranks', value: (ranks - 1) * 4 });
  if(Number(o.groundMod)) mods.push({ source: 'ground',      value: Number(o.groundMod) });
  const ageDays = Math.max(0, Number(o.trailAgeDays) || 0);
  if(ageDays)             mods.push({ source: 'trail-age',   value: -2 * ageDays });
  const rainH = Math.max(0, Number(o.rainHours) || 0);
  if(rainH)               mods.push({ source: 'rain-snow',   value: -4 * rainH });
  if(o.dimLight)          mods.push({ source: 'dim-light',   value: -4 });
  if(Number(o.gmMod))     mods.push({ source: 'gm',          value: Number(o.gmMod) });
  // PT-6 — folded onto Layer 1 (ACKS.rollProficiencyThrow): nat-1 auto-fail (autoFailBand 1, the
  // house convention on these throws), no nat-20 rule (proficient false), target 11. The itemized
  // mods carry through unchanged → the {natural,target,modifiers,total,success} shape is byte-
  // identical to the inline 1d20 it replaces (this resolver was already the unified shape).
  const r = _gpwACKS().rollProficiencyThrow({ target: 11, modifiers: mods, autoFailBand: 1, proficient: false, rng: rng });
  return { natural: r.natural, target: r.target, modifiers: mods, total: r.total, success: r.success };
}

// Begin a follow. opts: { encounterId? OR lairId? (a fragment row's den — resolved to its
// latest concluded meeting), actorCharacterId (the tracker — Tracking proficiency, standing
// at the trail's start = the meeting hex), countTracked?, groundMod?, rainHoursSince?,
// dimLight?, gmMod?, rng? }. The find throw is rolled; on success the pursuit opens, the
// journey is steered, and a quarry already halted where the trackers stand is caught at once.
function beginTracking(campaign, opts){
  opts = opts || {};
  const A = _gpwACKS();
  const ch = (campaign.characters || []).find(c => c && c.id === opts.actorCharacterId);
  if(!ch) return { ok: false, error: 'unknown-actor' };
  // Resolve the meeting whose parting left the trail.
  let enc = null;
  if(opts.encounterId){
    enc = (typeof A.findEncounter === 'function') ? A.findEncounter(campaign, opts.encounterId) : null;
    if(!enc) return { ok: false, error: 'unknown-encounter' };
  } else if(opts.lairId){
    const list = (campaign.encounters || []).filter(e => e && e.status === 'resolved' && e.monsterSide && e.monsterSide.lairId === opts.lairId);
    enc = list.length ? list[list.length - 1] : null;
    if(!enc) return { ok: false, error: 'no-encounter' };
  } else return { ok: false, error: 'no-target' };
  const ms = enc.monsterSide || {};
  // Only a CONCLUDED, real meeting leaves a trail (the band must have parted — E4k gate).
  if(enc.status !== 'resolved') return { ok: false, error: 'encounter-still-active' };
  if(enc.outcome === 'no-encounter' || enc.outcome === 'dismissed') return { ok: false, error: 'no-meeting' };
  if(!enc.hexId) return { ok: false, error: 'no-hex' };
  // A band mid-hunt presses on after its quarry — meet it through its chase (E4m), don't
  // double-model its motion. The gate lifts when that chase ends.
  if(ms.pursuitEncounterId){
    const chase = (typeof A.findEncounter === 'function') ? A.findEncounter(campaign, ms.pursuitEncounterId) : null;
    if(chase && chase.status === 'active' && chase.pursuit && chase.pursuit.direction !== 'party' && (chase.pursuit.status === 'offered' || chase.pursuit.status === 'pursuing'))
      return { ok: false, error: 'band-mid-hunt' };
  }
  // A den already discovered = you know where they live; the → lair link replaces the trail.
  let homeLair = null;
  if(ms.lairId){
    homeLair = (typeof A.findLair === 'function') ? A.findLair(campaign, ms.lairId) : null;
    if(homeLair && homeLair.knownToPlayers) return { ok: false, error: 'already-known' };
  }
  if(enc.pursuit && enc.pursuit.direction === 'party' && enc.pursuit.status === 'tracking')
    return { ok: false, error: 'already-tracking' };
  // The tracker: Tracking proficiency (RR p.120 — the throw IS a Tracking throw), standing
  // where the trail starts. A party that moved on must return to the meeting hex first.
  // PT-0: the canonical rank count (merges ["Tracking","Tracking"] AND {key:'tracking',ranks:2} → 2,
  // matching the pre-migration count-entries value). Fallback: shape-aware count-entries.
  const ranks = (typeof A.proficiencyRanks === 'function')
    ? A.proficiencyRanks(ch, 'tracking')
    : ((ch.proficiencies || []).filter(p => /tracking/i.test(typeof p === 'string' ? p : (p && (p.key || p.name || p.label)) || ''))).length;
  if(ranks < 1) return { ok: false, error: 'no-tracking' };
  if(ch.currentHexId !== enc.hexId) return { ok: false, error: 'not-at-trail-hex' };
  const meetHex = (typeof A.findHex === 'function') ? A.findHex(campaign, enc.hexId) : null;
  if(!meetHex || !meetHex.coord) return { ok: false, error: 'no-hex' };
  // The trail's age: full days since the meeting concluded (−1 per 12 h of good weather);
  // rain hours + ground + light are the GM's (the modal suggests ground from the hex).
  const nowOrd = ((campaign.currentTurn || 1) * 30) + (campaign.currentDayInMonth || 1);
  const resOrd = ((enc.resolvedAtTurn || campaign.currentTurn || 1) * 30) + (enc.resolvedOnDayInMonth || campaign.currentDayInMonth || 1);
  const trailAgeDays = Math.max(0, nowOrd - resOrd);
  const rng = opts.rng || Math.random;
  const countTracked = (opts.countTracked != null && opts.countTracked !== '') ? Number(opts.countTracked) : (ms.count || 0);
  const t = trackingFindThrow({ ranks: ranks, countTracked: countTracked, groundMod: opts.groundMod,
                                trailAgeDays: trailAgeDays, rainHours: opts.rainHoursSince,
                                dimLight: opts.dimLight, gmMod: opts.gmMod, rng: rng });
  // The audit record (success or fail) — the Judge's secret search, one search-hour (#346).
  const ev = newEvent('hex-search', {
    submittedBy: 'gm', status: EVENT_STATUS.PENDING, targetTurn: campaign.currentTurn || 1,
    context: { primaryHexId: enc.hexId, involvedHexIds: [], settlementId: null,
               domainId: (meetHex && meetHex.domainId) || null,
               relatedEntities: [{ kind: 'character', id: ch.id, role: 'subject' }] },
    payload: {
      actorCharacterId: ch.id, hexId: enc.hexId, method: 'begin-tracking',
      rolled: t.natural, target: t.target, modifiers: t.modifiers, total: t.total, success: t.success,
      trackedEncounterId: enc.id, trailAgeDays: trailAgeDays, countTracked: countTracked,
      activityCost: { slot: 'ancillary', units: 1, kind: 'track', label: 'Search for tracks' }
    }
  });
  ev.campaignLogHidden = true;
  const entry = (ms.monsterCatalogKey && typeof A.findMonster === 'function') ? A.findMonster(ms.monsterCatalogKey) : null;
  const label = ms.label || (entry && entry.name) || (enc.category === 'civilized' ? 'the locals' : 'the creatures');
  const who = ch.name || 'The tracker';
  _logAppliedEvent(campaign, ev, { narrativeSummary: who + (t.success
    ? (' finds the trail of ' + label + ' — the follow begins (half expedition speed, RR p.120).')
    : (' finds no usable trail of ' + label + ' (no retry here for an hour — RR p.120).')) });
  if(!t.success) return { ok: true, success: false, find: t, encounter: enc, event: ev };
  // ── The quarry (🔧 v1 world-model) ──
  const exp = entry ? parseFloat(String(entry.expeditionSpeed || '')) : NaN;
  const fullSpeed = (isFinite(exp) && exp > 0) ? exp : 24;   // 🔧 an unknown creature walks at the human norm
  const quarry = { coord: { q: meetHex.coord.q, r: meetHex.coord.r }, hexId: enc.hexId,
                   milesPerDay: fullSpeed, plan: 'wanders',
                   destCoord: null, destLairId: null, destSettlementHexId: null,
                   heading: null, walkDaysLeft: null, lastCoord: null,
                   halted: false, groupId: null, mileRemainder: 0 };
  // An E4m band bound to a living Group — the world entity moves with the follow.
  const aliveOf = g => (typeof A.groupActiveCount === 'function') ? A.groupActiveCount(g) : Math.max(0, (g.count || 0) - (g.casualties || 0));
  for(const gid of (ms.groupIds || [])){
    const g = (campaign.groups || []).find(x => x && x.id === gid);
    if(g && aliveOf(g) > 0){ quarry.groupId = g.id; break; }
  }
  if(homeLair && homeLair.hexId){
    const denHex = (typeof A.findHex === 'function') ? A.findHex(campaign, homeLair.hexId) : null;
    if(denHex && denHex.coord){
      quarry.plan = 'heads-home';
      quarry.destCoord = { q: denHex.coord.q, r: denHex.coord.r };
      quarry.destLairId = homeLair.id;
    }
  } else if(enc.category === 'civilized'){
    // Folk head for the nearest settlement (dwellings, never dens — the E4 rule).
    let best = null, bestD = Infinity;
    for(const h of (campaign.hexes || [])){
      if(!h || !h.coord || !h.settlement) continue;
      const d = (typeof A.hexAxialDistance === 'function') ? A.hexAxialDistance(meetHex.coord, h.coord) : Infinity;
      if(d < bestD){ best = h; bestD = d; }
    }
    if(best){ quarry.plan = 'heads-to-settlement'; quarry.destCoord = { q: best.coord.q, r: best.coord.r }; quarry.destSettlementHexId = best.id; }
  }
  if(quarry.plan === 'wanders'){
    quarry.milesPerDay = fullSpeed / 2;   // the E6 wander activity — migration is half expedition speed
  }
  if(quarry.destCoord && quarry.destCoord.q === quarry.coord.q && quarry.destCoord.r === quarry.coord.r) quarry.halted = true;
  // Head start: the band has been walking since the meeting (the find already paid the age
  // penalty; 🔧 pre-begin water crossings are folded into the GM's modifiers on the find).
  // A destination-less quarry wanders (random face per 6-mile step, never directly back).
  for(let d = 0; d < trailAgeDays && !quarry.halted; d++){
    if(typeof A.trackingQuarryWalkDay === 'function') A.trackingQuarryWalkDay(campaign, quarry, rng);
  }
  // ── The pursuit (the E3c chase's mirror — direction 'party') ──
  const pt = ch.partyId ? ((campaign.parties || []).find(p => p && p.id === ch.partyId) || null) : null;
  enc.history = enc.history || [];
  if(enc.pursuit && enc.pursuit.status){
    enc.history.push({ turn: campaign.currentTurn || 1, type: 'pursuit-superseded',
      reason: 'a prior pursuit record (' + (enc.pursuit.direction === 'party' ? 'a follow, ' : 'a chase, ') + enc.pursuit.status + ') gives way to the new follow' });
  }
  enc.pursuit = {
    direction: 'party',
    status: 'tracking',
    quarryLabel: label,
    trackerCharacterId: ch.id, trackerName: ch.name || '', trackerRanks: ranks,
    trackerPartyId: pt ? pt.id : null, journeyId: null,
    countTracked: countTracked,
    quarry: quarry,
    weatherLostPending: false,   // GM lever until the weather layer (T4): "rain/snow ≥1 h fell today"
    gmMod: 0,
    startedAtTurn: campaign.currentTurn || 1, startedOnDayInMonth: campaign.currentDayInMonth || null,
    throws: [Object.assign({ kind: 'find', atTurn: campaign.currentTurn || 1, atDay: campaign.currentDayInMonth || null }, t)]
  };
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'tracking-started',
    reason: who + ' finds the trail of ' + label + ' (find ' + (t.natural === 1 ? 'natural 1' : (t.total + ' vs 11+')) + ') — the party takes up the follow at half expedition speed (RR p.120)' });
  // Already standing where the quarry is halted (a settled-after-evasion band, a den in this
  // hex) → caught at once: the one-throw resolution preserved for the same-hex cases.
  if(quarry.halted && quarry.coord.q === meetHex.coord.q && quarry.coord.r === meetHex.coord.r){
    const caught = (typeof A.trackingSpringCatch === 'function') ? A.trackingSpringCatch(campaign, enc, { rng: rng }) : null;
    return { ok: true, success: true, find: t, pursuit: enc.pursuit, encounter: enc,
             journeyAction: 'none', journey: null, caughtNow: caught, event: ev };
  }
  // ── Steer the journey (Joachim: "begins to track changes the destination of their journey
  // — or effectively starts a journey if they are not already on one") ──
  const qHex = (typeof A.hexAtCoord === 'function') ? A.hexAtCoord(campaign, quarry.coord.q, quarry.coord.r) : null;
  const targetHexId = (qHex && qHex.id) || enc.hexId;
  let journeyAction = 'none', journey = null;
  const activeJourneyId = ch.currentJourneyId || (pt && pt.activeJourneyId) || null;
  const aj = activeJourneyId ? ((campaign.journeys || []).find(x => x && x.id === activeJourneyId) || null) : null;
  if(aj && ['in-transit', 'resting', 'lost', 'planning'].indexOf(aj.status) >= 0){
    if(typeof A.reRouteJourney === 'function') A.reRouteJourney(campaign, aj, { destinationHexId: targetHexId });
    enc.pursuit.journeyId = aj.id; journeyAction = 'rerouted'; journey = aj;
  } else {
    const participantIds = pt
      ? (campaign.characters || []).filter(c => c && c.partyId === pt.id).map(c => c.id)
      : [ch.id];
    if(participantIds.indexOf(ch.id) < 0) participantIds.push(ch.id);
    const j = (typeof A.blankJourney === 'function') ? A.blankJourney({
      name: ((typeof A.journeyDefaultName === 'function') ? A.journeyDefaultName(campaign, { partyId: pt ? pt.id : null, participantCharacterIds: participantIds }) : '') || ('Tracking ' + label),
      participantCharacterIds: participantIds, partyId: pt ? pt.id : null,
      startHexId: enc.hexId, destinationHexId: targetHexId,
      mode: 'foot', pace: 'half-speed'
    }) : null;
    if(j){
      campaign.journeys = campaign.journeys || [];
      campaign.journeys.push(j);
      if(typeof A.startJourney === 'function') A.startJourney(campaign, j);
      enc.pursuit.journeyId = j.id; journeyAction = 'started'; journey = j;
    }
  }
  return { ok: true, success: true, find: t, pursuit: enc.pursuit, encounter: enc,
           journeyAction: journeyAction, journey: journey, caughtNow: null, event: ev };
}

// Give up an active follow (GM call). The meeting is already resolved, so nothing
// re-resolves — the follow just ends; the steering journey keeps its last destination
// (Stop Journey is the GM's if the party should halt where it stands).
function encounterAbandonTracking(campaign, encounterId, opts){
  const A = _gpwACKS();
  const enc = A.findEncounter(campaign, encounterId);
  if(!enc) return { ok: false, error: 'unknown-encounter' };
  if(!enc.pursuit || enc.pursuit.direction !== 'party' || enc.pursuit.status !== 'tracking') return { ok: false, error: 'not-tracking' };
  const o = opts || {};
  enc.pursuit.status = 'abandoned';
  enc.history = enc.history || [];
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'tracking-abandoned',
    reason: o.reason || 'the trackers gave up the trail' });
  return { ok: true, encounter: enc, pursuit: enc.pursuit };
}

// ═══════════════════════════════════════════════════════════════════════════
// #476 ENCOUNTER LAYER (E1) — the GM-facing step verbs (RR pp.280–287; plan §15).
// Each verb advances one RAW step on an Encounter entity: it computes through the
// catalogs' pure resolvers, stamps the entity + its history, and emits the audit
// events where due (encounter-influence per costed attempt; encounter-resolved as
// the comprehensive umbrella — Event.subdayContext.encounterId gets its first
// referent). rng injectable throughout. The E2 resolution surface walks these;
// until it lands they run headless (tests / console / Inspector).
// ═══════════════════════════════════════════════════════════════════════════

function _encChaMod(campaign, characterId){
  const A = _gpwACKS();
  const ch = (campaign.characters || []).find(c => c && c.id === characterId);
  const score = ch && ch.abilities && ch.abilities.CHA;
  return (typeof score === 'number' && typeof A.abilityMod === 'function') ? A.abilityMod(score) : 0;
}
// RR pp.283–284 — the opponents of a side asserted HIDDEN roll surprise at
// SURPRISE_HIDDEN_PENALTY (applied automatically; own bonuses stay GM extras).
function _encOppHiddenPenalty(sur, side){
  const A = _gpwACKS();
  const opp = side === 'party' ? 'monsters' : 'party';
  return (sur && sur[opp] && sur[opp].hidden) ? ((A.SURPRISE_HIDDEN_PENALTY != null) ? A.SURPRISE_HIDDEN_PENALTY : -2) : 0;
}
// The standard related-entities set for an encounter's events.
function _encRelatedEntities(enc){
  const out = [{ kind: 'encounter', id: enc.id, role: 'subject' }];
  ((enc.partySide && enc.partySide.characterIds) || []).forEach(id => out.push({ kind: 'character', id, role: 'subject' }));
  if(enc.partySide && enc.partySide.partyId)   out.push({ kind: 'party',   id: enc.partySide.partyId,   role: 'subject' });
  if(enc.partySide && enc.partySide.journeyId) out.push({ kind: 'journey', id: enc.partySide.journeyId, role: 'subject' });
  if(enc.monsterSide && enc.monsterSide.lairId) out.push({ kind: 'lair', id: enc.monsterSide.lairId, role: 'target' });
  ((enc.monsterSide && enc.monsterSide.groupIds) || []).forEach(id => out.push({ kind: 'group', id, role: 'target' }));
  return out;
}
function _encMonsterLabel(enc){
  const A = _gpwACKS();
  const mk = enc.monsterSide && enc.monsterSide.monsterCatalogKey;
  return (mk && typeof A.monsterDisplayName === 'function' && A.monsterDisplayName(mk))
    || (enc.category === 'civilized' ? 'the locals' : 'the creatures');
}

// Step 2 input — the GM asserts each side's foreknowledge + line of sight (and, RR
// pp.283–284, whether a side is HIDDEN — a GM assertion, no Hiding throw rolled: the
// opponents take SURPRISE_HIDDEN_PENALTY on their rolls AND cannot claim line of sight
// on the hidden side, so the asserted LOS is clamped here). The matrix gives evade
// eligibility, and None × None means NO ENCOUNTER (auto-resolved as such).
function encounterSetAwareness(campaign, encounterId, opts){
  const A = _gpwACKS();
  const enc = A.findEncounter(campaign, encounterId);
  if(!enc) return { ok: false, error: 'unknown-encounter' };
  if(enc.status === 'resolved') return { ok: false, error: 'already-resolved' };
  const o = opts || {};
  const pHidden = !!o.partyHidden, mHidden = !!o.monsterHidden;
  const pLos = !!o.partyLineOfSight && !mHidden;    // no LOS on a hidden creature (RR p.284)
  const mLos = !!o.monsterLineOfSight && !pHidden;
  const pKey = A.surpriseAwarenessKey(!!o.partyForeknowledge, pLos);
  const mKey = A.surpriseAwarenessKey(!!o.monsterForeknowledge, mLos);
  enc.surprise = {
    party:    { awareness: pKey, foreknowledge: !!o.partyForeknowledge,   lineOfSight: pLos, hidden: pHidden, roll: null, surprised: null },
    monsters: { awareness: mKey, foreknowledge: !!o.monsterForeknowledge, lineOfSight: mLos, hidden: mHidden, roll: null, surprised: null },
    evadeEligibility: A.encounterEvadeEligibility(pKey, mKey),
    noEncounter: (pKey === 'none' && mKey === 'none')
  };
  enc.phase = 'surprise';
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'awareness',
    reason: 'party ' + pKey + ' × monsters ' + mKey
      + (pHidden ? ' · party hidden' : '') + (mHidden ? ' · monsters hidden' : '')
      + ' → evade: ' + enc.surprise.evadeEligibility });
  if(enc.surprise.noEncounter){
    recordEncounterResolved(campaign, enc.id, 'no-encounter', { note: 'Surprise Matrix: neither side aware — no encounter (RR p.281)' });
    return { ok: true, encounter: enc, surprise: enc.surprise, noEncounter: true };
  }
  return { ok: true, encounter: enc, surprise: enc.surprise };
}

// Step 2 roll — one 1d6 per SIDE (RAW allows rolling by side to speed play; per-creature
// granularity is the GM's at the table). Surprised on 2− → vulnerable, no round-1 actions.
// opts: { partyMod?, monsterMod? (own bonuses − opponents' smallest stealth penalty), rng? }.
function encounterRollSurprise(campaign, encounterId, opts){
  const A = _gpwACKS();
  const enc = A.findEncounter(campaign, encounterId);
  if(!enc) return { ok: false, error: 'unknown-encounter' };
  if(enc.status === 'resolved') return { ok: false, error: 'already-resolved' };
  if(!enc.surprise) return { ok: false, error: 'set-awareness-first' };
  const o = opts || {};
  const rng = o.rng || Math.random;
  for(const side of ['party', 'monsters']){
    const s = enc.surprise[side];
    const state = A.SURPRISE_AWARENESS_STATES[s.awareness];
    if(!state.rolls){ s.roll = null; s.surprised = false; continue; }   // fore+los — not surprised
    const hiddenPen = _encOppHiddenPenalty(enc.surprise, side);         // opponents hidden → −2 (RR pp.283–284)
    const extra = (side === 'party') ? (Number(o.partyMod) || 0) : (Number(o.monsterMod) || 0);
    const r = A.rollSurpriseThrow({ mod: state.mod + hiddenPen + extra, rng });
    s.roll = r;
    s.surprised = r.surprised;
  }
  // Phase: evasion is on the table when the matrix allows it and the party isn't surprised
  // (an explorer's party can evade even surprised — the GM forces that via attemptEvasion).
  const el = enc.surprise.evadeEligibility;
  enc.phase = ((el === 'can' || el === 'always') && !enc.surprise.party.surprised) ? 'evasion' : 'interaction';
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'surprise',
    reason: 'party ' + (enc.surprise.party.surprised ? 'SURPRISED' : 'ready') + ' · monsters ' + (enc.surprise.monsters.surprised ? 'SURPRISED' : 'ready') });
  return { ok: true, encounter: enc, surprise: enc.surprise };
}

// E8 — the party's active journey, resolved from the encounter's party side: the stamped
// journeyId first (the journey trigger sets it), else any underway journey sharing the
// party or a participant (a resting journey's camp meeting carries no journeyId). Only
// in-transit/resting RECEIVE the known-lost carry (a planning/arrived/aborted journey has
// no travel state to lose; an already-'lost' one is already carried).
function _encActiveJourneyForPartySide(campaign, enc){
  const js = (campaign && campaign.journeys) || [];
  const ps = (enc && enc.partySide) || {};
  const live = (j) => j && (j.status === 'in-transit' || j.status === 'resting');
  if(ps.journeyId){
    const j = js.find(x => x && x.id === ps.journeyId);
    if(live(j)) return j;
  }
  const ids = ps.characterIds || [];
  return js.find(j => live(j) && (
    (ps.partyId && j.partyId && j.partyId === ps.partyId) ||
    (j.participantCharacterIds || []).some(id => ids.indexOf(id) >= 0)
  )) || null;
}

// E8 — RR p.285: "Once the party comes to a halt, it must IMMEDIATELY make a Navigation
// throw at −4 to see if it has gotten lost… If the throw fails, the party or group is
// lost and knows it." Rolled here (itemized, the E2h convention: the hex's terrain nav
// target, the party's collective +4/+8 Navigation/Pathfinding bonus — RR p.275 — and the
// −4; natural 1 fails) so the aftermath carries the verdict — and CARRIED to the party's
// active journey: `status = 'lost'` (the registered journey status nothing set until now)
// + `lostEncounterId`. A 'lost' journey HOLDS — the day consumer ticks only in-transit;
// the party knows it's lost, so it does NOT stray-walk like the §27 unknowing travel-lost
// — and its members count as a stationary field group (off-journey survival + the
// rest-night camp checks pick them up; lost camps stay dangerous). Recovery = the RAW
// landmark search (hexSearchActivity landmark mode — RR p.285 ¶3), a GM re-route, or an
// Inspector edit. No journey → the verdict stays on the encounter (a camped party's
// "lost" has no travel state to mark).
function _evasionNavAndCarry(campaign, enc, rng){
  const A = _gpwACKS();
  const hex = (typeof A.findHex === 'function') ? A.findHex(campaign, enc.hexId) : null;
  const terrain = (hex && hex.terrain) || '';
  const target = (A.JOURNEY_NAV_THROWS && A.JOURNEY_NAV_THROWS[terrain] != null) ? A.JOURNEY_NAV_THROWS[terrain] : 6;
  const ids = (enc.partySide && enc.partySide.characterIds) || [];
  let hasNav = false, hasPath = false;
  const scan = (entry) => {       // PT-0: read the canonical {key} slug as well as legacy strings / {name}
    const name = (typeof entry === 'string') ? entry : ((entry && (entry.key || entry.name || entry.label || entry.id || entry.proficiency)) || '');
    if(/\bnavigation\b/i.test(name)) hasNav = true;
    if(/\bpathfinding\b/i.test(name)) hasPath = true;
  };
  for(const c of (campaign.characters || [])){
    if(!c || ids.indexOf(c.id) < 0) continue;
    for(const p of (c.proficiencies || [])) scan(p);
    for(const cp of (c.classPowers || [])) scan(cp);
  }
  const bonus = (hasNav && hasPath) ? 8 : (hasNav || hasPath) ? 4 : 0;
  const mods = [];
  if(bonus) mods.push({ source: 'party-proficiency', value: bonus });
  mods.push({ source: 'evasion-displaced', value: -4 });
  const natural = 1 + Math.floor(rng() * 20);
  const total = mods.reduce((s, m) => s + m.value, natural);
  const nav = { natural: natural, target: target, modifiers: mods, total: total,
                success: (natural !== 1) && (total >= target) };
  enc.evasion.aftermath.navThrow = nav;
  enc.evasion.aftermath.knownLost = !nav.success;
  enc.evasion.aftermath.journeyId = null;
  if(!nav.success){
    const j = _encActiveJourneyForPartySide(campaign, enc);
    if(j){
      j.status = 'lost';
      j.lostEncounterId = enc.id;
      enc.evasion.aftermath.journeyId = j.id;
      (j.history = j.history || []).push({ turn: campaign.currentTurn || null, dayIndex: j.currentDayIndex || 0, type: 'lost',
        narrative: 'Evaded an encounter — displaced ' + (enc.evasion.aftermath.distanceFt != null ? enc.evasion.aftermath.distanceFt : '?')
          + ' ft toward ' + (enc.evasion.aftermath.clockDirection != null ? (enc.evasion.aftermath.clockDirection + " o'clock") : '?')
          + ', then failed the Navigation throw at −4 (' + natural + (bonus ? ('+' + bonus) : '') + '−4 = ' + total + ' vs ' + target
          + '+). The party is lost — and knows it. The journey holds until it finds its last landmark (RR p.285).' });
    }
  }
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'evasion-navigation',
    reason: 'nav ' + natural + (bonus ? ('+' + bonus) : '') + '−4 = ' + total + ' vs ' + target + '+ → '
      + (nav.success ? 'bearings kept' : ('LOST — and knows it' + (enc.evasion.aftermath.journeyId ? ' (the journey holds)' : ''))) });
  return nav;
}

// Step 3 — Evasion (wilderness only; RR pp.284–285). Auto-succeeds when the matrix says
// 'always' or ALL monsters are surprised; otherwise the terrain × party-size throw.
// Refused once the party is interacting (a reaction roll exists) — RAW. On success the
// aftermath is rolled (displacement + 1d12 clock direction), the RR p.285 Navigation
// throw at −4 resolves on the spot (_evasionNavAndCarry — a failure marks the party
// LOST, knowingly, and holds its active journey), and the encounter resolves 'evaded'.
// opts: { modifiers?: [{label, value}], sizeCount?, allowSurprised? (the explorer rule),
//         autoSuccess?, rng? }.
function encounterAttemptEvasion(campaign, encounterId, opts){
  const A = _gpwACKS();
  const enc = A.findEncounter(campaign, encounterId);
  if(!enc) return { ok: false, error: 'unknown-encounter' };
  if(enc.status === 'resolved') return { ok: false, error: 'already-resolved' };
  if(enc.reaction) return { ok: false, error: 'already-interacting' };       // RR p.287
  const o = opts || {};
  const sur = enc.surprise;
  const eligibility = (sur && sur.evadeEligibility) || 'can';
  if(eligibility === 'cannot' || eligibility === 'no-encounter') return { ok: false, error: 'cannot-evade' };
  if(sur && sur.party && sur.party.surprised && !o.allowSurprised) return { ok: false, error: 'party-surprised' };
  const rng = o.rng || Math.random;
  const hex = (typeof A.findHex === 'function') ? A.findHex(campaign, enc.hexId) : null;
  const rowKey = (enc.distance && enc.distance.terrainRow)
    || (hex && typeof A.encounterRowKeyForHex === 'function' ? A.encounterRowKeyForHex(hex) : null);
  const sizeCount = (o.sizeCount != null) ? o.sizeCount
    : (enc.partySide && enc.partySide.sizeCount != null) ? enc.partySide.sizeCount
    : (((enc.partySide && enc.partySide.characterIds) || []).length || 1);
  const auto = !!o.autoSuccess
    || eligibility === 'always'
    || !!(sur && sur.monsters && sur.monsters.surprised);                    // all monsters surprised → automatic
  const targetInfo = rowKey ? A.evasionTargetFor(rowKey, sizeCount) : null;
  const throwRes = A.attemptEvasionThrow({
    autoSuccess: auto,
    target: targetInfo ? targetInfo.target : 20,
    modifiers: o.modifiers || [],
    rng
  });
  enc.evasion = {
    eligibility, sizeCount,
    target: targetInfo ? targetInfo.target : null,
    targetInfo: targetInfo,
    modifiers: (o.modifiers || []).slice(),
    roll: throwRes,
    success: throwRes.success,
    aftermath: null
  };
  if(throwRes.success){
    enc.evasion.aftermath = A.rollEvasionAftermath({ terrainRow: rowKey || undefined, distanceClass: rowKey ? undefined : 'open', rng });
    enc.history.push({ turn: campaign.currentTurn || 1, type: 'evaded',
      reason: 'displaced ' + enc.evasion.aftermath.distanceFt + " ft toward " + enc.evasion.aftermath.clockDirection + " o'clock" });
    _evasionNavAndCarry(campaign, enc, rng);   // RR p.285 — the immediate Navigation throw at −4 + the journey carry (E8)
    // E3c — a tracking-capable band may pursue ('monster-pursuit' ON): hold the
    // encounter open for the GM's intent call instead of resolving (RR p.285).
    if(_encPursuitPossible(campaign, enc)) _encOfferPursuit(campaign, enc);
    else recordEncounterResolved(campaign, enc.id, 'evaded', { note: 'evaded — aftermath displacement rolled' });
  } else {
    enc.phase = 'interaction';
    enc.history.push({ turn: campaign.currentTurn || 1, type: 'evasion-failed',
      reason: (throwRes.total != null ? (throwRes.total + ' vs ' + (targetInfo ? targetInfo.target : '?') + '+') : 'failed') + ' — proceed to reactions (a failed evasion is not necessarily a fight)' });
  }
  return { ok: true, encounter: enc, evasion: enc.evasion };
}

// Step 4 — the initial Reaction roll (RR pp.285–286): 2d6 + the face's CHA modifier +
// circumstance modifiers; natural-2/12 clamps applied by the resolver. Rolled only when
// the outcome isn't obvious (the GM's call to invoke this at all). Sets reaction.current;
// further attempts go through encounterAttemptInfluence.
// opts: { faceCharacterId?, chaMod? (override), modifiers?: [{label, value}], rng? }.
function encounterRollReaction(campaign, encounterId, opts){
  const A = _gpwACKS();
  const enc = A.findEncounter(campaign, encounterId);
  if(!enc) return { ok: false, error: 'unknown-encounter' };
  if(enc.status === 'resolved') return { ok: false, error: 'already-resolved' };
  if(enc.reaction) return { ok: false, error: 'already-rolled-use-influence' };
  const o = opts || {};
  // E3b — the tone (JJ pp.84–87): the spokesperson's approach; defaults diplomatic.
  const tone = (o.tone && A.ENCOUNTER_TONES && A.ENCOUNTER_TONES[o.tone]) ? o.tone : 'diplomatic';
  const faceId = o.faceCharacterId || (enc.partySide && enc.partySide.faceCharacterId) || null;
  const chaMod = (o.chaMod != null) ? Number(o.chaMod) : (faceId ? _encChaMod(campaign, faceId) : 0);
  const roll = A.rollEncounterReaction({ chaMod, modifiers: o.modifiers || [], rng: o.rng });
  if(faceId && enc.partySide) enc.partySide.faceCharacterId = faceId;
  enc.reaction = {
    current: roll.band,
    tone,
    rolls: [{ attempt: 0, kind: 'initial', tone, natural: roll.natural, chaMod: roll.chaMod, modSum: roll.modSum,
              modifiers: (o.modifiers || []).slice(),   // itemized — every modifier visible + reusable on a reroll
              total: roll.total, band: roll.band, clamped: roll.clamped,
              atTurn: campaign.currentTurn || 1, atDay: campaign.currentDayInMonth || null }],
    // Intimidation's gains are temporary, and a meeting with NEW ALLIES of the
    // intimidated creature re-uses the ORIGINAL roll (JJ p.86) — so it is stored.
    intimidationOriginalRoll: (tone === 'intimidating')
      ? { attempt: 0, natural: roll.natural, total: roll.total, band: roll.band, atTurn: campaign.currentTurn || 1 }
      : null
  };
  enc.phase = 'interaction';
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'reaction',
    reason: roll.total + ' → ' + (A.toneBandLabel ? A.toneBandLabel(tone, roll.band) : roll.band) + (tone !== 'diplomatic' ? (' (' + tone + ')') : '') + (roll.clamped ? (' (' + roll.clamped + ' clamp)') : '') });
  return { ok: true, encounter: enc, reaction: enc.reaction, roll };
}

// Step 5 — an attempt to influence (RR pp.286–287): a fresh reaction roll whose BAND
// shifts the standing attitude (2 → two steps toward Hostile … 12 → two toward
// Friendly). The time ladder escalates by attempt — round, turn, hour, work-day, week —
// and the 3rd+ attempts cost the actor's #346 day budget (ancillary / dedicated),
// carried on a record-only encounter-influence event. A bribe adds +1..+3 (week/month/
// year of pay — or day/week/month with Bribery proficiency); a bribe that fails to move
// the target toward friendly backlashes one step toward Hostile (no backlash when
// proficient). Once interacting the party can no longer evade.
// opts: { actorCharacterId?, chaMod?, modifiers?: [{label, value}],
//         bribe?: { bonus: 1|2|3, proficient?: boolean }, rng? }.
function encounterAttemptInfluence(campaign, encounterId, opts){
  const A = _gpwACKS();
  const enc = A.findEncounter(campaign, encounterId);
  if(!enc) return { ok: false, error: 'unknown-encounter' };
  if(enc.status === 'resolved') return { ok: false, error: 'already-resolved' };
  if(!enc.reaction) return { ok: false, error: 'roll-reaction-first' };
  const o = opts || {};
  const attemptNumber = enc.reaction.rolls.filter(r => r && r.kind === 'influence').length + 1;
  const info = A.influenceAttemptInfo(attemptNumber);
  // E3b — the tone may switch between attempts (the speaker's approach); defaults to standing.
  const tone = (o.tone && A.ENCOUNTER_TONES && A.ENCOUNTER_TONES[o.tone]) ? o.tone : ((enc.reaction && enc.reaction.tone) || 'diplomatic');
  const actorId = o.actorCharacterId || (enc.partySide && enc.partySide.faceCharacterId) || null;
  const chaMod = (o.chaMod != null) ? Number(o.chaMod) : (actorId ? _encChaMod(campaign, actorId) : 0);
  const mods = (o.modifiers || []).slice();
  let bribe = null;
  if(o.bribe && o.bribe.bonus){
    bribe = A.bribeBonusInfo(o.bribe.bonus, !!o.bribe.proficient);
    mods.push({ label: 'bribe (' + bribe.pay + "'s pay)", value: bribe.bonus });
  }
  const roll = A.rollEncounterReaction({ chaMod, modifiers: mods, rng: o.rng });
  const from = enc.reaction.current;
  let shift = A.applyInfluenceShift(from, roll.band);
  let backlash = false;
  if(bribe && bribe.backlashOnFail && shift.shift <= 0){
    // RAW: a failed bribe shifts the target one (additional) step toward Hostile.
    const order = A.ENCOUNTER_ATTITUDES;
    const idx = Math.max(0, order.indexOf(shift.to) - 1);
    shift = { from: shift.from, to: order[idx], shift: idx - order.indexOf(shift.from) };
    backlash = true;
  }
  enc.reaction.current = shift.to;
  enc.reaction.tone = tone;
  const entry = {
    attempt: attemptNumber, kind: 'influence', tone, actorCharacterId: actorId,
    natural: roll.natural, chaMod: roll.chaMod, modSum: roll.modSum, total: roll.total,
    modifiers: mods.slice(),   // itemized (incl. the bribe line) — visible + reusable on a reroll
    band: roll.band, clamped: roll.clamped, from, to: shift.to,
    bribe: bribe ? { bonus: bribe.bonus, pay: bribe.pay, proficient: bribe.proficient, backlash } : null,
    timeRequired: info.time, days: info.days,
    atTurn: campaign.currentTurn || 1, atDay: campaign.currentDayInMonth || null
  };
  enc.reaction.rolls.push(entry);
  // The FIRST intimidating roll of the walk is the stored original (JJ p.86).
  if(tone === 'intimidating' && !enc.reaction.intimidationOriginalRoll){
    enc.reaction.intimidationOriginalRoll = { attempt: attemptNumber, natural: roll.natural, total: roll.total, band: roll.band, atTurn: campaign.currentTurn || 1 };
  }
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'influence',
    reason: 'attempt ' + attemptNumber + ' (' + info.time + (tone !== 'diplomatic' ? (', ' + tone) : '') + '): ' + roll.total + ' → ' + (A.toneBandLabel ? A.toneBandLabel(tone, roll.band) : roll.band) + ' — ' + from + ' → ' + shift.to + (backlash ? ' (bribe backlash)' : '') });
  // The audit + budget record (record-only, always campaignLogHidden — the table chatter
  // isn't a chronicle beat; the resolution event narrates the outcome).
  const hex = (typeof A.findHex === 'function') ? A.findHex(campaign, enc.hexId) : null;
  const ev = newEvent('encounter-influence', {
    submittedBy: 'gm', status: EVENT_STATUS.PENDING, targetTurn: campaign.currentTurn || 1,
    context: { primaryHexId: enc.hexId || null, involvedHexIds: [], settlementId: null,
               domainId: (hex && hex.domainId) || null, relatedEntities: _encRelatedEntities(enc) },
    payload: {
      encounterId: enc.id, attemptNumber, actorCharacterId: actorId,
      roll: { natural: roll.natural, total: roll.total, band: roll.band, clamped: roll.clamped },
      from, to: shift.to,
      bribe: entry.bribe, timeRequired: info.time,
      activityCost: (info.activitySlot === 'ancillary' || info.activitySlot === 'dedicated')
        ? { slot: info.activitySlot, units: 1, kind: 'encounter-influence', label: 'Parley — influence reaction', days: info.days || undefined }
        : null,
      narrative: 'Influence attempt ' + attemptNumber + ' (' + info.time + '): ' + from + ' → ' + shift.to
    }
  });
  ev.campaignLogHidden = true;
  ev.subdayContext = { cadence: 'encounter', encounterId: enc.id, roundNumber: null, turnNumber: null, initiativeOrder: null };
  _logAppliedEvent(campaign, ev, { narrativeSummary: ev.payload.narrative });
  entry.eventId = ev.id;   // the reroll patches this event in place (the budget charge rides it)
  return { ok: true, encounter: enc, attempt: entry, event: ev };
}

// ═══ E2h — rerolls (every roll in the walk re-rollable at its frontier) ═══════
// The project's reroll idiom (journey day log / search modal): re-throw the ONE die,
// hold everything else, update dependent state surgically, stamp history. A step is
// re-rollable while it is still the FRONTIER — before a later step has consumed it
// (distance until surprise concludes; surprise until evasion/reaction; a FAILED
// evasion until reaction; the initial reaction until the first influence attempt;
// always the latest influence attempt). Earlier-state surgery = the Inspector.

// Surprise has concluded once the roll verb has run (it sets surprised on both sides;
// a fore+los side concludes with no die). Mirrors the UI's encSurpriseRolled().
function _encSurpriseConcluded(enc){
  const sur = enc && enc.surprise;
  return !!(sur && sur.party && sur.party.surprised !== null);
}

// Step 1 (roll + reroll) — the encounter-distance roll (RR p.281): terrain dice capped
// at maximum visibility. The triggers pre-roll it; this verb serves gm-authored
// encounters AND the GM's reroll. Locked once the walk is past it (surprise concluded
// or evasion/reaction exist — the distance frames those steps). opts: { light?, rng? }.
function encounterRollDistance(campaign, encounterId, opts){
  const A = _gpwACKS();
  const enc = A.findEncounter(campaign, encounterId);
  if(!enc) return { ok: false, error: 'unknown-encounter' };
  if(enc.status === 'resolved') return { ok: false, error: 'already-resolved' };
  if(_encSurpriseConcluded(enc) || enc.evasion || enc.reaction) return { ok: false, error: 'walk-past-distance' };
  const o = opts || {};
  const hex = (typeof A.findHex === 'function') ? A.findHex(campaign, enc.hexId) : null;
  const rowKey = (enc.distance && enc.distance.terrainRow)
    || (hex && typeof A.encounterRowKeyForHex === 'function' ? A.encounterRowKeyForHex(hex) : null);
  const d = A.computeEncounterDistance({
    terrainRow: rowKey || undefined, distanceClass: rowKey ? undefined : 'open',
    light: o.light || (enc.distance && enc.distance.light) || undefined,
    sideACount: (enc.partySide && (enc.partySide.sizeCount || ((enc.partySide.characterIds || []).length))) || 1,
    sideBCount: (enc.monsterSide && enc.monsterSide.count) || 1,
    rng: o.rng
  });
  if(!d) return { ok: false, error: 'no-distance-class' };
  const reroll = !!enc.distance;
  enc.distance = d;
  enc.history.push({ turn: campaign.currentTurn || 1, type: reroll ? 'distance-reroll' : 'distance',
    reason: d.distanceFt + ' ft (rolled ' + d.rolledFt + ', cap ' + d.capFt + ')' });
  return { ok: true, encounter: enc, distance: d, reroll };
}

// ─── E4 — identity ⟳ + choose-from-table (Joachim: "the GM should be given a chance
// to (a) reroll and (b) choose from the appropriate table"). Both gate like distance —
// while active with the walk not yet past it (once surprise concludes, the side IS who
// you met). Both unwind any minted lair first (_unwindEncounterMinting — a detailed
// shell reverts, a revealed pooled lair returns to the pool, a fresh den is removed),
// then re-bind the new identity through the same 6a machinery, so the world never keeps
// a den from a discarded roll. Re-rolls happen ON the stored table (identity.tableKey /
// columnKey) — robust for sparse-route encounters whose hex was never authored.

// E4n — the table an identity-LESS side would roll/pick on, derived from the
// encounter's own hex (monster: tableKey × the encounter's rarity; civilized: the
// hex's column). Serves the pre-E4n search fill, gm-authored meetings, and legacy
// saves — the verbs + the panel affordances both read it (one derivation). Returns
// { tableKey, columnKey, rarity, page } or null (no hex / unmappable terrain).
function encounterDerivedTablePrior(campaign, encounterOrId){
  const A = _gpwACKS();
  const enc = (typeof encounterOrId === 'string') ? A.findEncounter(campaign, encounterOrId) : encounterOrId;
  if(!enc || !enc.hexId) return null;
  const hex = Array.isArray(campaign && campaign.hexes) ? campaign.hexes.find(h => h && h.id === enc.hexId) : null;
  if(!hex || typeof A.terrainKey !== 'function') return null;
  const tKey = A.terrainKey(hex);
  if(!tKey) return null;
  const hasRiver = !!(Array.isArray(hex.riverSides) && hex.riverSides.length);
  if(enc.category === 'civilized'){
    const ck = (typeof A.encounterCivilizedColumnKeyFor === 'function') ? A.encounterCivilizedColumnKeyFor(tKey, hasRiver) : null;
    return ck ? { tableKey: null, columnKey: ck, rarity: null, page: (A.ENCOUNTER_CIVILIZED_TABLE && A.ENCOUNTER_CIVILIZED_TABLE.page) || 43 } : null;
  }
  if(enc.category !== 'monster') return null;
  const tk = (typeof A.encounterMonsterTableKeyFor === 'function') ? A.encounterMonsterTableKeyFor(tKey, hasRiver) : null;
  const t = tk && A.ENCOUNTER_MONSTER_TABLES && A.ENCOUNTER_MONSTER_TABLES[tk];
  return t ? { tableKey: tk, columnKey: null, rarity: enc.rarity || 'common', page: t.page } : null;
}

function _encIdentityGate(campaign, encounterId){
  const A = _gpwACKS();
  const enc = A.findEncounter(campaign, encounterId);
  if(!enc) return { error: 'unknown-encounter' };
  if(enc.status === 'resolved') return { error: 'already-resolved' };
  if(_encSurpriseConcluded(enc) || enc.evasion || enc.reaction) return { error: 'walk-past-identity' };
  if(!enc.monsterSide) return { error: 'no-table-identity' };
  // E4n — no stored identity yet: derive the hex's own table so the GM can roll/pick
  // on it anyway (the ⟳ is then the FIRST roll, not a reroll).
  if(!enc.monsterSide.identity){
    const derived = encounterDerivedTablePrior(campaign, enc);
    if(!derived) return { error: 'no-table-identity' };
    return { enc, prior: derived };
  }
  return { enc, prior: enc.monsterSide.identity };
}

// Roll 1d100 on the encounter's OWN table (monster: tableKey × rarity; civilized: columnKey).
function _rollOnStoredTable(A, identity, rarity, rng){
  const natural = 1 + Math.floor(rng() * 100);
  if(identity.columnKey){
    const col = A.ENCOUNTER_CIVILIZED_TABLE && A.ENCOUNTER_CIVILIZED_TABLE.columns[identity.columnKey];
    const cell = col && col.rows.find(c => natural >= c.lo && natural <= c.hi);
    return cell ? { natural, label: cell.label, key: cell.key, tableKey: null, columnKey: identity.columnKey,
                    rarity: null, page: (A.ENCOUNTER_CIVILIZED_TABLE && A.ENCOUNTER_CIVILIZED_TABLE.page) || 43 } : null;
  }
  const t = A.ENCOUNTER_MONSTER_TABLES && A.ENCOUNTER_MONSTER_TABLES[identity.tableKey];
  const col = t && t.columns[rarity || identity.rarity || 'common'];
  const cell = col && col.find(c => natural >= c.lo && natural <= c.hi);
  return cell ? { natural, label: cell.label, key: cell.key, tableKey: identity.tableKey, columnKey: null,
                  rarity: rarity || identity.rarity || 'common', page: t.page } : null;
}

function _encApplyNewIdentity(campaign, enc, identity, opts){
  const A = _gpwACKS();
  const o = opts || {};
  const r = o.rng || Math.random;
  if(enc.monsterSide.minted && typeof A._unwindEncounterMinting === 'function')
    A._unwindEncounterMinting(campaign, enc.monsterSide.minted);
  // E4m quarry exclusion on a REBIND too — the encounter's own party threads through,
  // so a reroll/pick never binds a side to the very chase hunting these characters.
  const ps = enc.partySide || {};
  const binding = A.bindEncounterIdentity(campaign, enc.hexId || null, identity, { category: enc.category || 'monster', rng: r,
    partySide: { partyId: ps.partyId || null, characterIds: (ps.characterIds || []).slice() } });
  A._applyIdentityBinding(campaign, enc.monsterSide, identity, binding, { hexId: enc.hexId || null, atTurn: campaign.currentTurn || 1, rng: r });
  if(o.rarity && enc.category === 'monster') enc.rarity = o.rarity;
  return binding;
}

// ⟳ Identity — re-roll the 1d100 on the same table (a new rarity column may be passed:
// the GM dialing the encounter up/down stays a table pick, recorded). opts: { rarity?, rng? }.
function encounterRerollIdentity(campaign, encounterId, opts){
  const g = _encIdentityGate(campaign, encounterId);
  if(g.error) return { ok: false, error: g.error };
  const enc = g.enc;
  const A = _gpwACKS();
  const o = opts || {};
  const rng = o.rng || Math.random;
  const prior = g.prior;   // the stored identity, or the hex-derived table for an identity-less side (E4n)
  const rarity = (enc.category === 'monster') ? (o.rarity || enc.rarity || prior.rarity || 'common') : null;
  const identity = _rollOnStoredTable(A, prior, rarity, rng);
  if(!identity) return { ok: false, error: 'no-table' };
  const binding = _encApplyNewIdentity(campaign, enc, identity, { rng, rarity });
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'identity-reroll',
    reason: (identity.label || '?') + ' (1d100 ' + identity.natural + (rarity ? ' · ' + rarity : '') + ')' });
  return { ok: true, encounter: enc, identity, binding };
}

// GM pick from the appropriate table (the E4c picker hands in the chosen cell).
// opts: { label, key (null = a catalog-excluded creature the GM details), rarity?, rng? }.
function encounterChooseIdentity(campaign, encounterId, opts){
  const g = _encIdentityGate(campaign, encounterId);
  if(g.error) return { ok: false, error: g.error };
  const enc = g.enc;
  const o = opts || {};
  if(!o.label && !o.key) return { ok: false, error: 'no-pick' };
  const prior = g.prior;   // stored, or hex-derived for an identity-less side (E4n)
  const rarity = (enc.category === 'monster') ? (o.rarity || enc.rarity || prior.rarity || 'common') : null;
  const identity = { natural: null, gmChosen: true, label: o.label || '', key: (o.key === undefined ? null : o.key),
                     tableKey: prior.tableKey || null, columnKey: prior.columnKey || null,
                     rarity: rarity, page: prior.page || null };
  const binding = _encApplyNewIdentity(campaign, enc, identity, { rng: o.rng, rarity });
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'identity-chosen',
    reason: (identity.label || identity.key || '?') + ' (GM pick from the table)' });
  return { ok: true, encounter: enc, identity, binding };
}

// ⟳ Surprise — re-throw the side dice at the frontier (no evasion attempt, no reaction).
// Same awareness; the GM extras default to those baked into the prior rolls (recovered
// as roll.mod − the awareness-state mod). opts: { partyMod?, monsterMod?, rng? }.
function encounterRerollSurprise(campaign, encounterId, opts){
  const A = _gpwACKS();
  const enc = A.findEncounter(campaign, encounterId);
  if(!enc) return { ok: false, error: 'unknown-encounter' };
  if(enc.status === 'resolved') return { ok: false, error: 'already-resolved' };
  if(!_encSurpriseConcluded(enc)) return { ok: false, error: 'not-rolled' };
  if(enc.evasion || enc.reaction) return { ok: false, error: 'walk-past-surprise' };
  const o = opts || {};
  const rng = o.rng || Math.random;
  for(const side of ['party', 'monsters']){
    const s = enc.surprise[side];
    const state = A.SURPRISE_AWARENESS_STATES[s.awareness];
    if(!state.rolls){ s.roll = null; s.surprised = false; continue; }
    const hiddenPen = _encOppHiddenPenalty(enc.surprise, side);
    const passed = (side === 'party') ? o.partyMod : o.monsterMod;
    const extra = (passed != null) ? (Number(passed) || 0)
      : (s.roll ? (Number(s.roll.mod) || 0) - state.mod - hiddenPen : 0);   // recover the GM extra net of the hidden −2
    const r = A.rollSurpriseThrow({ mod: state.mod + hiddenPen + extra, rng });
    s.roll = r; s.surprised = r.surprised;
  }
  const el = enc.surprise.evadeEligibility;
  enc.phase = ((el === 'can' || el === 'always') && !enc.surprise.party.surprised) ? 'evasion' : 'interaction';
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'surprise-reroll',
    reason: 'party ' + (enc.surprise.party.surprised ? 'SURPRISED' : 'ready') + ' · monsters ' + (enc.surprise.monsters.surprised ? 'SURPRISED' : 'ready') });
  return { ok: true, encounter: enc, surprise: enc.surprise };
}

// ⟳ Evasion — re-throw a FAILED evasion at the frontier (no reaction yet): the same
// target + the recorded modifiers. A success on the re-throw resolves 'evaded' exactly
// as the original attempt would have (aftermath + the resolution event). opts: { rng? }.
function encounterRerollEvasion(campaign, encounterId, opts){
  const A = _gpwACKS();
  const enc = A.findEncounter(campaign, encounterId);
  if(!enc) return { ok: false, error: 'unknown-encounter' };
  if(enc.status === 'resolved') return { ok: false, error: 'already-resolved' };
  if(!enc.evasion) return { ok: false, error: 'not-attempted' };
  if(enc.evasion.success) return { ok: false, error: 'already-evaded' };
  if(enc.reaction) return { ok: false, error: 'walk-past-evasion' };
  const o = opts || {};
  const rng = o.rng || Math.random;
  const throwRes = A.attemptEvasionThrow({
    target: (enc.evasion.target != null) ? enc.evasion.target : 20,
    modifiers: enc.evasion.modifiers || [], rng
  });
  enc.evasion.roll = throwRes;
  enc.evasion.success = throwRes.success;
  if(throwRes.success){
    const hex = (typeof A.findHex === 'function') ? A.findHex(campaign, enc.hexId) : null;
    const rowKey = (enc.distance && enc.distance.terrainRow)
      || (hex && typeof A.encounterRowKeyForHex === 'function' ? A.encounterRowKeyForHex(hex) : null);
    enc.evasion.aftermath = A.rollEvasionAftermath({ terrainRow: rowKey || undefined, distanceClass: rowKey ? undefined : 'open', rng });
    enc.history.push({ turn: campaign.currentTurn || 1, type: 'evasion-reroll',
      reason: 'rerolled → evaded; displaced ' + enc.evasion.aftermath.distanceFt + " ft toward " + enc.evasion.aftermath.clockDirection + " o'clock" });
    _evasionNavAndCarry(campaign, enc, rng);   // RR p.285 — same as the original attempt (E8)
    if(_encPursuitPossible(campaign, enc)) _encOfferPursuit(campaign, enc);   // E3c — same fork as the original attempt
    else recordEncounterResolved(campaign, enc.id, 'evaded', { note: 'evaded (on the reroll) — aftermath displacement rolled' });
  } else {
    enc.phase = 'interaction';
    enc.history.push({ turn: campaign.currentTurn || 1, type: 'evasion-reroll',
      reason: throwRes.total + ' vs ' + ((enc.evasion.target != null) ? enc.evasion.target : '?') + '+ — still failed' });
  }
  return { ok: true, encounter: enc, evasion: enc.evasion };
}

// ⟳ Reaction — re-throw the INITIAL 2d6 at the frontier (no influence attempts yet):
// the same face CHA + the recorded modifiers; the standing attitude recomputes.
// opts: { rng? }.
function encounterRerollReaction(campaign, encounterId, opts){
  const A = _gpwACKS();
  const enc = A.findEncounter(campaign, encounterId);
  if(!enc) return { ok: false, error: 'unknown-encounter' };
  if(enc.status === 'resolved') return { ok: false, error: 'already-resolved' };
  if(!enc.reaction || !(enc.reaction.rolls || []).length) return { ok: false, error: 'not-rolled' };
  if(enc.reaction.rolls.some(r => r && r.kind === 'influence')) return { ok: false, error: 'walk-past-reaction' };
  const o = opts || {};
  const prev = enc.reaction.rolls[0];
  const mods = Array.isArray(prev.modifiers) ? prev.modifiers
    : (prev.modSum ? [{ label: 'modifiers', value: prev.modSum }] : []);
  const roll = A.rollEncounterReaction({ chaMod: prev.chaMod || 0, modifiers: mods, rng: o.rng });
  enc.reaction.rolls[0] = Object.assign({}, prev, {
    natural: roll.natural, chaMod: roll.chaMod, modSum: roll.modSum, modifiers: mods.slice(),
    total: roll.total, band: roll.band, clamped: roll.clamped,
    atTurn: campaign.currentTurn || 1, atDay: campaign.currentDayInMonth || null
  });
  enc.reaction.current = roll.band;
  // E3b — an intimidating initial roll IS the stored original; the re-throw replaces it.
  if((prev.tone || enc.reaction.tone) === 'intimidating'){
    enc.reaction.intimidationOriginalRoll = { attempt: 0, natural: roll.natural, total: roll.total, band: roll.band, atTurn: campaign.currentTurn || 1 };
  }
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'reaction-reroll',
    reason: roll.total + ' → ' + roll.band + (roll.clamped ? (' (' + roll.clamped + ' clamp)') : '') });
  return { ok: true, encounter: enc, reaction: enc.reaction, roll };
}

// ⟳ Influence — re-throw the LATEST attempt: the same speaker / modifiers / bribe, the
// shift recomputed from the same starting attitude; the attempt's encounter-influence
// event is PATCHED in place (same attempt number, same time, same budget charge — a
// reroll is not a second parley hour). opts: { rng? }.
function encounterRerollInfluence(campaign, encounterId, opts){
  const A = _gpwACKS();
  const enc = A.findEncounter(campaign, encounterId);
  if(!enc) return { ok: false, error: 'unknown-encounter' };
  if(enc.status === 'resolved') return { ok: false, error: 'already-resolved' };
  const rolls = (enc.reaction && enc.reaction.rolls) || [];
  const last = rolls[rolls.length - 1];
  if(!last || last.kind !== 'influence') return { ok: false, error: 'no-influence-attempt' };
  const o = opts || {};
  const mods = Array.isArray(last.modifiers) ? last.modifiers
    : (function(){   // legacy entry — reconstruct (the bribe was folded into modSum)
        const bribeBonus = (last.bribe && last.bribe.bonus) || 0;
        const rest = (last.modSum || 0) - bribeBonus;
        const out = [];
        if(rest) out.push({ label: 'modifiers', value: rest });
        if(bribeBonus) out.push({ label: 'bribe (' + ((last.bribe && last.bribe.pay) || '?') + "'s pay)", value: bribeBonus });
        return out;
      })();
  const roll = A.rollEncounterReaction({ chaMod: last.chaMod || 0, modifiers: mods, rng: o.rng });
  const from = last.from;
  let shift = A.applyInfluenceShift(from, roll.band);
  let backlash = false;
  const bribeInfo = last.bribe ? A.bribeBonusInfo(last.bribe.bonus, !!last.bribe.proficient) : null;
  if(bribeInfo && bribeInfo.backlashOnFail && shift.shift <= 0){
    const order = A.ENCOUNTER_ATTITUDES;
    const idx = Math.max(0, order.indexOf(shift.to) - 1);
    shift = { from: shift.from, to: order[idx], shift: idx - order.indexOf(shift.from) };
    backlash = true;
  }
  enc.reaction.current = shift.to;
  Object.assign(last, {
    natural: roll.natural, modSum: roll.modSum, modifiers: mods.slice(),
    total: roll.total, band: roll.band, clamped: roll.clamped, to: shift.to,
    bribe: last.bribe ? Object.assign({}, last.bribe, { backlash }) : null
  });
  // E3b — if this attempt is the stored original intimidation roll, the re-throw replaces it.
  if(last.tone === 'intimidating' && enc.reaction.intimidationOriginalRoll && enc.reaction.intimidationOriginalRoll.attempt === last.attempt){
    enc.reaction.intimidationOriginalRoll = { attempt: last.attempt, natural: roll.natural, total: roll.total, band: roll.band, atTurn: campaign.currentTurn || 1 };
  }
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'influence-reroll',
    reason: 'attempt ' + last.attempt + ' rerolled: ' + roll.total + ' → ' + roll.band + ' — ' + from + ' → ' + shift.to + (backlash ? ' (bribe backlash)' : '') });
  // Patch the attempt's audit event in place (found by the stamped eventId; legacy
  // fallback by encounterId + attemptNumber). The activityCost stays untouched.
  const wrappers = campaign.eventLog || [];
  const wrap = (last.eventId && wrappers.find(en => en && en.event && en.event.id === last.eventId))
    || wrappers.filter(en => en && en.event && en.event.kind === 'encounter-influence'
        && en.event.payload && en.event.payload.encounterId === enc.id
        && en.event.payload.attemptNumber === last.attempt).pop();
  if(wrap){
    const ev = wrap.event;
    ev.payload.roll = { natural: roll.natural, total: roll.total, band: roll.band, clamped: roll.clamped };
    ev.payload.to = shift.to;
    ev.payload.bribe = last.bribe;
    ev.payload.narrative = 'Influence attempt ' + last.attempt + ' (' + last.timeRequired + ', rerolled): ' + from + ' → ' + shift.to;
    if(wrap.result) wrap.result.narrativeSummary = ev.payload.narrative;
  }
  return { ok: true, encounter: enc, attempt: last, event: wrap ? wrap.event : null };
}

// ═══ E3b — encounter tone (JJ pp.84–87, D11) ══════════════════════════════════════
// Walk the tone's modifier catalog (ENCOUNTER_TONES) and compute which rows the
// engine can pre-assert from shipped state: alignment (face vs catalog monster),
// lair-binding (at-lair = the party trespasses / the target is home), side counts →
// outnumbering (a lair-bound target's count already includes its lair-mates — the
// JJ p.86 footnote), catalog Morale, HD/level gap (3+), the face's proficiencies,
// and the standing relationship (the CURRENT attitude once interacting, else the
// prior meeting via priorReactionBetween — D9). Returns [{...row, auto, on, value}]:
// auto rows arrive ticked with their computed value; everything else unticked at
// its printed default. The GM overrides freely; ticked rows compose into the roll's
// modifiers[] (the E2h itemization carries them through display + rerolls).
function encounterToneRows(campaign, encounterId, tone, opts){
  const A = _gpwACKS();
  const enc = A.findEncounter(campaign, encounterId);
  const toneDef = A.ENCOUNTER_TONES && A.ENCOUNTER_TONES[tone];
  if(!enc || !toneDef) return [];
  const o = opts || {};
  const faceId = o.faceCharacterId || (enc.partySide && enc.partySide.faceCharacterId)
    || ((enc.partySide && enc.partySide.characterIds) || [])[0] || null;
  const face = faceId ? (((campaign && campaign.characters) || []).find(c => c && c.id === faceId) || null) : null;
  const entry = (typeof A.findMonster === 'function') ? A.findMonster(enc.monsterSide && enc.monsterSide.monsterCatalogKey) : null;

  const al = v => (v == null ? '' : String(v).trim().charAt(0).toUpperCase());   // 'Lawful'/'L' → 'L'
  const fa = al(face && face.alignment), ma = al(entry && entry.alignment);
  let alignKey = null;
  if(fa && ma){
    if(fa === 'L' && (ma === 'L' || ma === 'N')) alignKey = 'align-ll';
    else if(fa === 'L' && ma === 'C') alignKey = 'align-lc';
    else if(fa === 'C' && (ma === 'L' || ma === 'N')) alignKey = 'align-cl';
  }

  const atLair = !!(enc.monsterSide && enc.monsterSide.encounterKind === 'at-lair');

  const pCount = (enc.partySide && (enc.partySide.sizeCount || ((enc.partySide.characterIds || []).length))) || 0;
  const mCount = (enc.monsterSide && enc.monsterSide.count) || 0;
  let outKey = null;
  if(pCount > 0 && mCount > 0){
    if(pCount >= mCount * 3) outKey = 'out-31';
    else if(pCount * 2 >= mCount * 3) outKey = 'out-32';
    else if(pCount > mCount) outKey = 'out-1';
    else if(mCount >= pCount * 3) outKey = 'outd-31';
    else if(mCount * 2 >= pCount * 3) outKey = 'outd-32';
    else if(mCount > pCount) outKey = 'outd-1';
  }

  const hdOf = h => { const m = String(h == null ? '' : h).match(/^(\d+(?:\.\d+)?)/); return m ? Number(m[1]) : null; };
  const fLvl = face ? (Number(face.level) || 0) : null;
  const mHd = entry ? hdOf(entry.hd) : null;
  let gapKey = null;
  if(face && fLvl != null && mHd != null){
    if(fLvl - mHd >= 3) gapKey = 'up';
    else if(mHd - fLvl >= 3) gapKey = 'down';
  }

  // PT-0: read the canonical {key} slug as well as legacy strings / {name}; de-hyphenate so a
  // 'Mystic Aura' needle matches the slug key 'mystic-aura' under the substring indexOf below.
  const profs = face ? [].concat(face.proficiencies || [], face.classPowers || [])
    .map(p => String((p && (p.key || p.name || p.label)) || p || '').toLowerCase().replace(/-/g, ' ')) : [];
  const hasProf = name => profs.some(p => p.indexOf(name.toLowerCase()) >= 0);

  let rel = (enc.reaction && enc.reaction.current) || null;
  if(!rel && typeof A.priorReactionBetween === 'function'){
    const prior = A.priorReactionBetween(campaign, enc.id);
    rel = (prior && prior.reaction) || null;
  }

  return toneDef.rows.map(row => {
    const r = { key: row.key, group: row.group, label: row.label, value: row.value,
                variable: !!row.variable, derive: row.derive || null, note: row.note || '', auto: false, on: false };
    switch(row.derive){
      case 'alignment':   if(alignKey === row.key){ r.auto = true; r.on = true; } break;
      case 'lair-target': if(atLair){ r.auto = true; r.on = true; } break;
      case 'morale':      if(entry && typeof entry.morale === 'number'){ r.auto = true; r.on = entry.morale !== 0; r.value = -entry.morale; } break;
      case 'outnumber':   if(row.key === outKey){ r.auto = true; r.on = true; } break;
      case 'hd-gap':      if((row.key === 'hd-up' && gapKey === 'up') || (row.key === 'hd-down' && gapKey === 'down')){ r.auto = true; r.on = true; } break;
      case 'level-gap':   if((row.key === 'level-up' && gapKey === 'up') || (row.key === 'level-down' && gapKey === 'down')){ r.auto = true; r.on = true; } break;
      case 'relationship': {
        if(!rel) break;
        const want = row.key.replace(/^rel-/, '');
        // 'intimidated' is the canonical indifferent band worn by the intimidating tone
        if(want === 'intimidated' ? (rel === 'indifferent') : (rel === want)){ r.auto = true; r.on = true; }
        break;
      }
      case 'prof-intimidation-gated':
        // RAW gate: the proficiency counts only with legal authority over, or numbers on,
        // the target — the numbers half derives; authority stays the GM's tick.
        if(hasProf('Intimidation')){ r.auto = true; r.on = !!(outKey && outKey.indexOf('out-') === 0); }
        break;
      case 'prof-performance-art':
        if((hasProf('Seduction') || hasProf('Mystic Aura')) && (hasProf('Performance') || hasProf('Art'))){ r.auto = true; r.on = true; }
        break;
      default:
        if(row.derive && row.derive.indexOf('prof:') === 0 && hasProf(row.derive.slice(5))){ r.auto = true; r.on = true; }
    }
    return r;
  }).concat((() => {
    // Phase 3 Military W2 — JJ p.104: a band that arrived as a DOMAIN ENCOUNTER carries
    // its attitude toward the domain into individual meetings with adventurers (−2
    // hostile / −1 unfriendly / +1 mercantilist / +2 friendly; neutral adds nothing).
    // Auto-derived from the bound Group's incursion verdict; a reaction-roll circumstance,
    // so it surfaces under every tone.
    const incGrp = ((enc.monsterSide && enc.monsterSide.groupIds) || [])
      .map(gid => (((campaign && campaign.groups) || []).find(g => g && g.id === gid)) || null)
      .find(g => g && g.incursion && g.incursion.attitude);
    if(!incGrp) return [];
    const att = String(incGrp.incursion.attitude);
    const val = att === 'hostile' ? -2 : att === 'unfriendly' ? -1 : att === 'mercantilist' ? 1 : att === 'friendly' ? 2 : 0;
    if(!val) return [];
    const dom = ((campaign && campaign.domains) || []).find(d => d && d.id === incGrp.incursion.domainId) || null;
    return [{ key: 'incursion-attitude', group: 'Relationship',
      label: 'The band is ' + att + ' toward ' + ((dom && dom.name) || 'the domain') + ' — a domain-encounter arrival (JJ p.104)',
      value: val, variable: false, derive: 'incursion-attitude',
      note: 'the domain-encounter attitude carries into individual meetings', auto: true, on: true }];
  })());
}

// ═══ E3a — settle-as-lair (the RAW linger-or-migrate branch, JJ p.69 + p.103) ═════
// Encounter → creation: wandering monsters met in the wild may LINGER (chance = the
// monster's Lair %, DOUBLED when treasure beckons in an un/partly-occupied dungeon —
// a GM-asserted tick v1, dungeons aren't live entities) and den at the hex, else
// they MIGRATE onward. A lingerer rolls PLAIN Lair % again: second success = it
// settles at FULL wilderness-lair strength (hoard letter recorded; contents stay the
// treasure wave), else at its wandering numbers (no hoard yet — MM p.15, treasure
// stays at a lair, and this band had none). Eligibility: an active encounter whose
// monster side is NOT lair-bound (an at-lair side is home; a wandering-fragment
// forays FROM a home lair — it returns, it does not found a second den) with a
// catalog-resolvable monster (the Lair % source). Propose-ratify: the proposal is
// PURE (rng-injectable; the NATURALS are rolled once and held so the dungeon ×2
// tick recomputes without re-throwing — the E2h idiom; ⟳ re-proposes); the confirm
// verb materializes and links monsterSide.lairId so priorReactionBetween (D9)
// chains future meetings with the den back to this one.

function encounterSettleEligibility(campaign, encounterId){
  const A = _gpwACKS();
  // ⚙️ The whole settle branch is the persistent-wandering-monsters house rule (default
  // ON): JJ p.103 prints the linger roll for DOMAIN encounters (Vagaries of Incursion);
  // applying it to random wilderness encounters is the extension, hence the toggle.
  // OFF ⇒ the offer hides AND the verbs refuse (principle 8 — non-functional + hidden);
  // propose and confirm both route through this eligibility, so one gate covers all three.
  if(!(typeof A.isHouseRuleEnabled === 'function' && A.isHouseRuleEnabled(campaign, 'persistent-wandering-monsters')))
    return { eligible: false, reason: 'rule-off' };
  const enc = A.findEncounter(campaign, encounterId);
  if(!enc) return { eligible: false, reason: 'unknown-encounter' };
  // A resolved meeting can still take the linger roll on the EVADED path (per Joachim,
  // 2026-06-11): the party fled — the band remains in the area and may den behind them.
  // Any other resolution closes the offer; one settle-check decides it (no re-rolling
  // the world's answer); a pending pursuit decision comes first (settle ⊥ chase).
  if(enc.status === 'resolved'){
    if(enc.outcome !== 'evaded') return { eligible: false, reason: 'already-resolved' };
    if((enc.history || []).some(h => h && h.type === 'settle-check')) return { eligible: false, reason: 'settle-already-decided' };
  }
  if(enc.pursuit && (enc.pursuit.status === 'offered' || enc.pursuit.status === 'pursuing'))
    return { eligible: false, reason: 'pursuit-in-progress' };
  const ms = enc.monsterSide || {};
  // E4m — a band met mid-hunt (the side IS another chase's pursuing band) does not den:
  // it presses on after its quarry. The gate is live-derived — once that chase ends
  // (lost / abandoned / caught / scattered), the settle offer stands again.
  if(ms.pursuitEncounterId){
    const chase = A.findEncounter(campaign, ms.pursuitEncounterId);
    if(chase && chase.status === 'active' && chase.pursuit && (chase.pursuit.status === 'offered' || chase.pursuit.status === 'pursuing'))
      return { eligible: false, reason: 'band-mid-hunt' };
  }
  // E10 — a morale-banditry band never dens: these are the domain's own disaffected men
  // (RR pp.350–351) — they melt back to their fields when morale recovers; they do not
  // found a monster lair.
  if(ms.source === 'banditry-band'
     || (ms.groupIds || []).some(gid => { const g = ((campaign && campaign.groups) || []).find(x => x && x.id === gid); return !!(g && g.banditryDomainId); }))
    return { eligible: false, reason: 'banditry-band' };
  if(ms.lairId) return { eligible: false, reason: (ms.encounterKind === 'wandering-fragment') ? 'fragment-has-home-lair' : 'already-at-lair' };
  if(!enc.hexId) return { eligible: false, reason: 'no-hex' };
  // E9 — the JJ p.69 maximum-lairs cap: a band never settles a hex past its cap ("it is
  // simply too crowded for them") — it moves on instead. Living dens count; clearing or
  // removing one re-opens the offer. GM authoring stays exempt (the Lair Wizard / Inspector).
  const cap = (typeof A.hexLairCapacity === 'function') ? A.hexLairCapacity(campaign, enc.hexId) : null;
  if(cap && cap.full) return { eligible: false, reason: 'hex-full', capacity: cap };
  const entry = (typeof A.findMonster === 'function') ? A.findMonster(ms.monsterCatalogKey) : null;
  if(!entry) return { eligible: false, reason: 'no-catalog-monster' };
  if(typeof entry.lairPct !== 'number' || !(entry.lairPct > 0)) return { eligible: false, reason: 'no-lair-pct' };
  return { eligible: true, encounter: enc, entry };
}

// Derive the outcome from a proposal's held naturals (pure; lets the dungeon ×2 tick
// flip linger/migrate without re-throwing). Second roll is vs PLAIN Lair % (JJ p.103
// "roll 1d100 again against its Lair characteristic" — the doubling is linger-only).
function settleProposalOutcome(proposal, dungeonBeckons){
  const p = Object.assign({}, proposal);
  if(dungeonBeckons !== undefined) p.dungeonBeckons = !!dungeonBeckons;
  p.effectivePct = Math.min(100, p.lairPct * (p.dungeonBeckons ? 2 : 1));
  p.lingers = p.lingerNatural <= p.effectivePct;
  p.fullStrength = p.lingers && (p.strengthNatural <= p.lairPct);
  p.count = p.lingers ? (p.fullStrength ? p.fullCount : p.wanderingCount) : null;
  return p;
}

// PURE proposal — rolls the naturals once (linger d100, strength d100, both count
// rolls); no campaign mutation. opts: { dungeonBeckons?, rng? }.
function encounterProposeSettle(campaign, encounterId, opts){
  const A = _gpwACKS();
  const o = opts || {};
  const elig = encounterSettleEligibility(campaign, encounterId);
  if(!elig.eligible) return { ok: false, error: elig.reason };
  const enc = elig.encounter, entry = elig.entry;
  const rng = o.rng || Math.random;
  const lairSpec = (entry.numberAppearing && entry.numberAppearing.lair) || null;
  const wanderSpec = (entry.numberAppearing && entry.numberAppearing.wandering) || null;
  const msCount = (enc.monsterSide && enc.monsterSide.count != null) ? enc.monsterSide.count : null;
  return settleProposalOutcome({
    ok: true, encounterId: enc.id, monsterCatalogKey: entry.key, monsterName: entry.name,
    lairPct: entry.lairPct, dungeonBeckons: !!o.dungeonBeckons,
    lingerNatural: 1 + Math.floor(rng() * 100),
    strengthNatural: 1 + Math.floor(rng() * 100),
    fullCount: Math.max(1, A._rollDiceStr((lairSpec || wanderSpec || '1'), rng)),
    // the band met IS the wandering group — its size settles as-is (else roll the wandering dice)
    wanderingCount: (msCount != null) ? Math.max(1, msCount) : Math.max(1, A._rollDiceStr((wanderSpec || '1'), rng))
  });
}

// Materialize the GM-confirmed proposal. On an ACTIVE meeting: lingers → a Lair at
// the hex (active; KNOWN — the party met the band that denned) + a bound Group via
// generateLair, the hoard letter only at full strength; the encounter resolves
// 'settled-as-lair' with monsterSide.lairId linked; migrates → resolves 'dispersed'.
// On a resolved-EVADED meeting (per Joachim, 2026-06-11) the outcome stands — the
// meeting truthfully ended with the party fleeing: lingers → the same den, but
// UNKNOWN to the players (they ran; the band dens unobserved — the M4 search /
// track-home machinery's natural prey) and no second resolution event (the entity
// histories carry it — the createLair/Wizard precedent); migrates → just the
// settle-check stamp. monsterSide.lairId links either way, so a later meeting at
// ⚔ Begin a lair assault (E4j — Joachim 2026-06-11: "a lair that is known to the party should
// be able to be attacked; at the moment that is a GM-resolved thing, but the button should
// exist"). Creates a first-class Encounter at the den — trigger 'lair-assault', the monster
// side bound at-lair (the living population + its Groups), the party side = every active
// character standing at the lair's hex (their shared party when they have one) — and hands it
// to the step-walking panel: roll the distance and surprise (a den can be caught off guard),
// demand surrender via reaction/influence, or ⚔ to-combat and record the outcome as an
// adventure-result (a cleared result flips the lair — the shipped M0 chain). Resolution stays
// the GM's; this verb only OPENS the meeting. Gates: the lair must be active + placed + KNOWN
// to the players (the party can't march on a den it hasn't found — discover it via search,
// tracking, or Mark discovered); someone must stand at the hex; one open assault per den.
// opts: { id? (idempotent create), characterIds? (override the at-hex roster) }.
function beginLairAssault(campaign, lairId, opts){
  const A = _gpwACKS();
  const o = opts || {};
  const lair = (typeof A.findLair === 'function') ? A.findLair(campaign, lairId) : null;
  if(!lair) return { ok: false, error: 'unknown-lair' };
  if(lair.status !== 'active') return { ok: false, error: 'lair-not-active' };
  if(!lair.hexId) return { ok: false, error: 'no-hex' };
  if(!lair.knownToPlayers) return { ok: false, error: 'not-known-to-players' };
  const open = (campaign.encounters || []).find(e => e && e.status === 'active' && e.trigger === 'lair-assault'
    && e.monsterSide && e.monsterSide.lairId === lair.id);
  if(open) return { ok: false, error: 'assault-in-progress', encounter: open };
  const chars = o.characterIds
    ? (campaign.characters || []).filter(ch => ch && o.characterIds.indexOf(ch.id) >= 0)
    : (campaign.characters || []).filter(ch => ch && ch.currentHexId === lair.hexId
        && (typeof A.isActive !== 'function' || A.isActive(ch)));
  if(!chars.length) return { ok: false, error: 'no-attackers' };
  const partyIds = Array.from(new Set(chars.map(ch => ch.partyId).filter(Boolean)));
  const count = (typeof A.lairInhabitantCount === 'function') ? A.lairInhabitantCount(campaign, lair) : null;
  const enc = A.createEncounter(campaign, {
    id: o.id, trigger: 'lair-assault', hexId: lair.hexId, category: 'monster',
    occurredAtTurn: campaign.currentTurn || 1, occurredOnDayInMonth: campaign.currentDayInMonth || null,
    partySide: { partyId: (partyIds.length === 1) ? partyIds[0] : null,
                 characterIds: chars.map(ch => ch.id), sizeCount: chars.length },
    monsterSide: { source: 'existing-lair', lairId: lair.id, monsterCatalogKey: lair.monsterCatalogKey || '',
                   count: (count || null), encounterKind: 'at-lair', groupIds: (lair.groupIds || []).slice(),
                   label: lair.name || '' }
  });
  enc.history = enc.history || [];
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'assault-begun',
    reason: 'the party moves on ' + (lair.name || 'the den') + ' — ' + chars.length + ' attacker(s)' });
  return { ok: true, encounter: enc, lair: lair };
}

// the den recalls this one (D9: "met before — evaded").
// opts: { proposal? (else proposes internally), dungeonBeckons?, note?, rng? }.
function encounterSettleAsLair(campaign, encounterId, opts){
  const A = _gpwACKS();
  const o = opts || {};
  const elig = encounterSettleEligibility(campaign, encounterId);
  if(!elig.eligible) return { ok: false, error: elig.reason };
  const enc = elig.encounter, entry = elig.entry;
  const afterEvasion = enc.status === 'resolved';   // eligibility guarantees outcome 'evaded'
  const p = o.proposal ? settleProposalOutcome(o.proposal, o.proposal.dungeonBeckons) : encounterProposeSettle(campaign, encounterId, o);
  if(!p.ok) return p;
  const turn = campaign.currentTurn || 1;
  if(!p.lingers){
    enc.history.push({ turn, type: 'settle-check',
      reason: 'Lair % ' + p.lingerNatural + ' vs ' + p.effectivePct + (p.dungeonBeckons ? ' (×2 dungeon)' : '') + ' — migrates onward' });
    if(afterEvasion) return { ok: true, migrated: true, proposal: p, lair: null, encounter: enc, settledAfterEvasion: true, event: null };
    const res = recordEncounterResolved(campaign, enc.id, 'dispersed', {
      note: 'Rolled vs Lair % (' + p.lingerNatural + ' vs ' + p.effectivePct + '%) — the ' + (entry.name || 'monsters') + ' migrate onward (JJ p.103).'
    });
    return Object.assign({ migrated: true, proposal: p, lair: null }, res);
  }
  // E4m — when the band met IS a persistent Group (a migrant — the Groups-table footer's
  // promise: "a band settling down again becomes a lair"), the den ADOPTS it; minting a
  // second generateLair population would double-count the band. Full strength = the den
  // GATHERS to the rolled lair-size count (the group grows; casualties stand). A side
  // with no live group settles via generateLair exactly as before.
  const aliveOf = g => (typeof A.groupActiveCount === 'function') ? A.groupActiveCount(g) : Math.max(0, (g.count || 0) - (g.casualties || 0));
  const msGroups = (enc.monsterSide.groupIds || [])
    .map(gid => (campaign.groups || []).find(g => g && g.id === gid))
    .filter(g => g && aliveOf(g) > 0);
  let lair = null, gen = null;
  if(msGroups.length){
    lair = A.createLair(campaign, {
      hexId: enc.hexId, monsterCatalogKey: entry.key, status: 'active',
      establishedBy: 'encounter-settle', establishedAtTurn: turn,
      knownToPlayers: !afterEvasion, name: o.name || (entry.name + ' lair')
    });
    if(!lair) return { ok: false, error: 'lair-create-failed' };
    if(lair.lairPct == null) lair.lairPct = entry.lairPct;
    lair.treasureType = p.fullStrength ? (entry.treasureType || '') : '';
    lair.groupIds = msGroups.map(g => g.id);
    for(const g of msGroups) g.currentHexId = enc.hexId;
    if(p.fullStrength){
      const alive = msGroups.reduce((s, g) => s + aliveOf(g), 0);
      if(p.count > alive) msGroups[0].count = (msGroups[0].count || 0) + (p.count - alive);
    }
    lair.totalInhabitantCount = (typeof A.lairInhabitantCount === 'function') ? A.lairInhabitantCount(campaign, lair) : null;
  } else {
    gen = A.generateLair(campaign, {
      hexId: enc.hexId, monsterCatalogKey: entry.key, count: p.count,
      establishedBy: 'encounter-settle', knownToPlayers: !afterEvasion, atTurn: turn,
      name: o.name
    }, o.rng || Math.random);
    lair = gen && gen.lair;
    if(!lair) return { ok: false, error: 'lair-create-failed' };
    if(!p.fullStrength) lair.treasureType = '';   // wandering-size settlers bring no hoard yet
  }
  lair.history.push({ turn, type: 'settled',
    reason: 'lingered after an encounter — ' + (p.fullStrength ? 'full lair strength (' + p.count + ')' : 'wandering numbers (' + p.count + ', no hoard yet)')
      + (msGroups.length ? '; the met band settles as the den’s population' : '')
      + (afterEvasion ? '; the party had evaded — the den is unknown to the players' : '') });
  enc.monsterSide.lairId = lair.id;
  const newGroupId = gen && gen.group ? gen.group.id : ((!msGroups.length && lair.groupIds && lair.groupIds.length) ? lair.groupIds[lair.groupIds.length - 1] : null);
  if(newGroupId && !(enc.monsterSide.groupIds || []).includes(newGroupId)){
    enc.monsterSide.groupIds = (enc.monsterSide.groupIds || []).concat([newGroupId]);
  }
  if(enc.monsterSide.count == null) enc.monsterSide.count = p.count;
  enc.history.push({ turn, type: 'settle-check',
    reason: 'Lair % ' + p.lingerNatural + ' vs ' + p.effectivePct + (p.dungeonBeckons ? ' (×2 dungeon)' : '') + ' — lingers; strength ' + p.strengthNatural + ' vs ' + p.lairPct + ' — ' + (p.fullStrength ? 'full lair strength' : 'wandering numbers') });
  if(afterEvasion) return { ok: true, migrated: false, proposal: p, lair, encounter: enc, settledAfterEvasion: true, event: null };
  const res = recordEncounterResolved(campaign, enc.id, 'settled-as-lair', {
    note: p.fullStrength
      ? ('Settled at full lair strength — ' + p.count + ' (hoard type ' + (lair.treasureType || '—') + ' recorded).' + (o.note ? ' ' + o.note : ''))
      : ('Settled at wandering strength — ' + p.count + ' (no hoard yet).' + (o.note ? ' ' + o.note : ''))
  });
  return Object.assign({ migrated: false, proposal: p, lair }, res);
}

// ═══ E3c — monster pursuit (absorbs M5; RR p.285 + p.120; 'monster-pursuit', default OFF) ═══
// "Adventurers who evade might be tracked by some monsters, depending on their
// abilities and intent" (RR p.285). With the rule ON, a successful evasion against a
// tracking-capable band (catalog canTrack — Tracking / Acute Olfaction) does NOT
// resolve: the encounter holds in phase 'pursuit', status 'offered', and the GM
// adjudicates INTENT — take up the trail (the pursuer's Tracking throw, RR p.120:
// 11+ with the count bands for the party's numbers, natural 1 fails) or waive
// (resolves 'evaded' as before). A pursuing band follows at HALF its expedition
// speed via the daily 'pursuit' day-consumer (slot 82, acks-engine-subsystems.js).
// Pursuit state lives ON the Encounter (D8 — the M5 fork resolved). Rule OFF =
// shipped behavior byte-identical (RAW frames pursuit as GM judgment — the
// automation is the opt-in, §6 polarity).

function _encPursuitPossible(campaign, enc){
  const A = _gpwACKS();
  if(!(typeof A.isHouseRuleEnabled === 'function' && A.isHouseRuleEnabled(campaign, 'monster-pursuit'))) return false;
  const key = enc && enc.monsterSide && enc.monsterSide.monsterCatalogKey;
  return !!(key && typeof A.monsterCanTrack === 'function' && A.monsterCanTrack(key));
}

// Where the pursued party is NOW (party → first located member → the meeting hex).
function encounterPartyHexId(campaign, enc){
  const ps = (enc && enc.partySide) || {};
  if(ps.partyId){
    const p = ((campaign && campaign.parties) || []).find(x => x && x.id === ps.partyId);
    if(p && p.currentHexId) return p.currentHexId;
  }
  for(const cid of (ps.characterIds || [])){
    const ch = ((campaign && campaign.characters) || []).find(x => x && x.id === cid);
    if(ch && ch.currentHexId) return ch.currentHexId;
  }
  return (enc && enc.hexId) || null;
}

// Open the pursuit offer on a successful evasion (called from the evasion verbs).
function _encOfferPursuit(campaign, enc){
  const A = _gpwACKS();
  const entry = (typeof A.findMonster === 'function') ? A.findMonster(enc.monsterSide.monsterCatalogKey) : null;
  const exp = entry ? parseFloat(String(entry.expeditionSpeed || '')) : NaN;   // "36 miles" → 36
  enc.phase = 'pursuit';
  enc.pursuit = {
    status: 'offered',
    pursuerLabel: (entry && entry.name) || 'the monsters',
    pursuerMilesPerDay: isFinite(exp) && exp > 0 ? exp / 2 : 12,   // follow at ½ expedition speed (RR p.120)
    gapMiles: 1,           // the evasion displacement is yards, not miles — they are right behind
    lastPartyHexId: null,  // set when the trail is taken up
    traceConcealed: false, // GM lever — Passing Without Trace defeats scent + spoor
    gmMod: 0,              // standing modifier on the daily keep-the-trail throws (rain/snow, terrain…)
    startedAtTurn: null, startedOnDayInMonth: null,
    throws: []
  };
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'pursuit-offered',
    reason: enc.pursuit.pursuerLabel + ' can track — does it pursue? (monster-pursuit; GM adjudicates intent)' });
}

// The take-up throw (RR p.120): the pursuer finds the trail at 11+, + the count bands
// for the party's numbers (the M4 bands), natural 1 auto-fails, ± the GM's modifier.
// Success → 'pursuing' (the daily consumer takes over); fail → resolves 'evaded'.
// opts: { mod?, rng? }.
function encounterBeginPursuit(campaign, encounterId, opts){
  const A = _gpwACKS();
  const enc = A.findEncounter(campaign, encounterId);
  if(!enc) return { ok: false, error: 'unknown-encounter' };
  if(enc.status === 'resolved') return { ok: false, error: 'already-resolved' };
  if(!enc.pursuit || enc.pursuit.status !== 'offered') return { ok: false, error: 'no-pursuit-offered' };
  const o = opts || {};
  const rng = o.rng || Math.random;
  const n = (enc.partySide && (enc.partySide.sizeCount || ((enc.partySide.characterIds || []).length))) || 1;
  const countBonus = (n >= 17) ? 8 : (n > 8) ? 6 : (n > 4) ? 4 : (n >= 2) ? 2 : 0;
  const mod = Number(o.mod) || 0;
  const natural = 1 + Math.floor(rng() * 20);
  const target = 11;
  const success = (natural !== 1) && (natural + countBonus + mod >= target);
  const t = { kind: 'take-up', natural, countBonus, mod, total: natural + countBonus + mod, target, success,
              atTurn: campaign.currentTurn || 1, atDay: campaign.currentDayInMonth || null };
  enc.pursuit.throws.push(t);
  if(success){
    enc.pursuit.status = 'pursuing';
    enc.pursuit.startedAtTurn = campaign.currentTurn || 1;
    enc.pursuit.startedOnDayInMonth = campaign.currentDayInMonth || null;
    enc.pursuit.lastPartyHexId = encounterPartyHexId(campaign, enc);
    enc.history.push({ turn: campaign.currentTurn || 1, type: 'pursuit-taken-up',
      reason: 'take-up ' + t.total + ' vs 11+ — on the trail at ' + enc.pursuit.pursuerMilesPerDay + ' mi/day (half expedition speed), ' + enc.pursuit.gapMiles + ' mi behind' });
    return { ok: true, encounter: enc, pursuit: enc.pursuit, takeUp: t };
  }
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'pursuit-failed',
    reason: 'take-up ' + (natural === 1 ? 'natural 1' : (t.total + ' vs 11+')) + ' — the trail was never found' });
  const res = recordEncounterResolved(campaign, enc.id, 'evaded', {
    note: enc.pursuit.pursuerLabel + ' tried to track the party and failed (' + (natural === 1 ? 'natural 1' : t.total + ' vs 11+') + ').'
  });
  return Object.assign({ pursuit: enc.pursuit, takeUp: t }, res);
}

// ⟳ Reroll the pursuit take-up throw (E4l — Joachim 2026-06-11: "Pursuit needs a reroll";
// the E2h latest-step rule). Re-throws JUST the 1d20 — the count band + the GM modifier are
// HELD from the recorded throw — and reconciles the state both ways: a failed take-up that
// becomes a success UN-resolVES the encounter (the 'evaded' resolution event is dropped from
// the eventLog — the world keeps no resolution from a discarded die) and the chase starts;
// a success that becomes a failure resolves 'evaded' exactly as the original failure path.
// Latest-step gated: once a daily keep-the-trail throw exists the chase has moved on; a band
// that already made its settle choice stays settled (the linger roll is never re-opened by a
// chase die); and a chase that ended any other way (declined / abandoned / caught) stays ended.
function encounterRerollPursuitTakeUp(campaign, encounterId, opts){
  const A = _gpwACKS();
  const enc = A.findEncounter(campaign, encounterId);
  if(!enc) return { ok: false, error: 'unknown-encounter' };
  const p = enc.pursuit;
  const throws = (p && p.throws) || [];
  if(throws.some(x => x && x.kind === 'keep-trail')) return { ok: false, error: 'chase-under-way' };
  const t = throws.length ? throws[throws.length - 1] : null;
  if(!t || t.kind !== 'take-up') return { ok: false, error: 'no-take-up' };
  if((enc.history || []).some(h => h && h.type === 'settle-check')) return { ok: false, error: 'settle-decided' };
  const wasSuccess = !!t.success;
  // A resolved encounter is reversible ONLY when the failed take-up itself resolved it.
  if(enc.status === 'resolved' && (wasSuccess || enc.outcome !== 'evaded')) return { ok: false, error: 'chase-ended' };
  const o = opts || {};
  const rng = o.rng || Math.random;
  const natural = 1 + Math.floor(rng() * 20);
  const target = t.target || 11;
  const success = (natural !== 1) && (natural + (t.countBonus || 0) + (t.mod || 0) >= target);
  t.natural = natural; t.total = natural + (t.countBonus || 0) + (t.mod || 0); t.success = success;
  t.rerolled = (t.rerolled || 0) + 1;
  enc.history = enc.history || [];
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'pursuit-takeup-reroll',
    reason: 'rerolled → take-up ' + (natural === 1 ? 'natural 1' : (t.total + ' vs ' + target + '+')) + ' — ' + (success ? 'on the trail' : 'the trail was never found') });
  if(success === wasSuccess) return { ok: true, encounter: enc, pursuit: p, takeUp: t, changed: false };
  if(success){
    // failure → success: un-resolve (the discarded die's resolution never happened) + start the chase.
    if(enc.resolvedByEventId && Array.isArray(campaign.eventLog)){
      const evId = enc.resolvedByEventId;
      campaign.eventLog = campaign.eventLog.filter(en => !(en && en.event && en.event.id === evId));
    }
    enc.status = 'active'; enc.outcome = null;
    enc.resolvedAtTurn = null; enc.resolvedOnDayInMonth = null; enc.resolvedByEventId = null;
    p.status = 'pursuing';
    p.startedAtTurn = campaign.currentTurn || 1;
    p.startedOnDayInMonth = campaign.currentDayInMonth || null;
    p.lastPartyHexId = encounterPartyHexId(campaign, enc);
    enc.history.push({ turn: campaign.currentTurn || 1, type: 'pursuit-taken-up',
      reason: 'take-up ' + t.total + ' vs ' + target + '+ — on the trail at ' + p.pursuerMilesPerDay + ' mi/day (half expedition speed), ' + p.gapMiles + ' mi behind' });
    return { ok: true, encounter: enc, pursuit: p, takeUp: t, changed: true };
  }
  // success → failure: un-start + resolve 'evaded' exactly as the original failure path.
  p.status = 'offered';
  p.startedAtTurn = null; p.startedOnDayInMonth = null; p.lastPartyHexId = null;
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'pursuit-failed',
    reason: 'take-up ' + (natural === 1 ? 'natural 1' : (t.total + ' vs ' + target + '+')) + ' — the trail was never found' });
  const res = recordEncounterResolved(campaign, enc.id, 'evaded', {
    note: p.pursuerLabel + ' tried to track the party and failed (' + (natural === 1 ? 'natural 1' : t.total + ' vs ' + target + '+') + ').'
  });
  return Object.assign({ pursuit: p, takeUp: t, changed: true }, res);
}

// The GM waives the offer (no intent) — resolves 'evaded' exactly as the rule-OFF path.
function encounterDeclinePursuit(campaign, encounterId, opts){
  const A = _gpwACKS();
  const enc = A.findEncounter(campaign, encounterId);
  if(!enc) return { ok: false, error: 'unknown-encounter' };
  if(enc.status === 'resolved') return { ok: false, error: 'already-resolved' };
  if(!enc.pursuit || enc.pursuit.status !== 'offered') return { ok: false, error: 'no-pursuit-offered' };
  enc.pursuit.status = null;
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'pursuit-waived', reason: 'no pursuit — the band lets them go' });
  return recordEncounterResolved(campaign, enc.id, 'evaded', { note: (opts && opts.note) || 'evaded — no pursuit.' });
}

// Break off a RUNNING pursuit (GM call, or the trail concealed) — resolves 'evaded'.
function encounterAbandonPursuit(campaign, encounterId, opts){
  const A = _gpwACKS();
  const enc = A.findEncounter(campaign, encounterId);
  if(!enc) return { ok: false, error: 'unknown-encounter' };
  if(enc.status === 'resolved') return { ok: false, error: 'already-resolved' };
  if(!enc.pursuit || enc.pursuit.status !== 'pursuing') return { ok: false, error: 'not-pursuing' };
  const o = opts || {};
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'pursuit-abandoned', reason: o.reason || 'the pursuit broke off' });
  const res = recordEncounterResolved(campaign, enc.id, 'evaded', { note: 'The pursuit broke off' + (o.reason ? ' — ' + o.reason : '') + '.' });
  pursuitAftermath(campaign, enc, {});   // E6 — the hunt over, the band heads home / wanders
  return res;
}

// ═══ E6 — the pursuit aftermath: a chase that ends with the band still standing ═══
// Joachim 2026-06-11: "a pursuing monster/group that loses its trail (or succeeds in
// catching up and survives) returns home to its lair (if they have one). They essentially
// plot a journey back to their home lair. If they don't have a home lair, they become
// migrants and wander." Fired when the chase's trail is lost / broken off, and when the
// chase's SPRUNG meeting (the catch) resolves with the band surviving — parleyed / evaded /
// combat / dismissed; 'dispersed' = scattered, no band left to walk anywhere. The band
// gets a world presence: a living un-housed Group from the chase side is reused (the E4m
// migrant-chaser), else a transient walk token is minted (count = the side's; it dissolves
// into the den on arrival — a fragment's hunters never left the den's population). Home =
// a living, PLACED lair on the side's lairId → wanderState 'heading-home' (full expedition
// speed, straight line, no stops, no domain disposition — the E6 monster-bands consumer
// walks it; still E4m-findable, so it can pick up a NEW pursuit en route and re-home
// after). No home → a wandering migrant (the E6 wander activity). Gated on
// persistent-wandering-monsters (OFF = bands evaporate — the shipped behavior). A failed
// TAKE-UP deliberately does NOT fire (the chase never began; the band stands at its
// meeting hex, where the settle-as-lair offer already governs whether it stays) — that
// also keeps the E4l take-up reroll's two-way reconcile clean.
function pursuitAftermath(campaign, encounterOrId, opts){
  const A = _gpwACKS();
  const o = opts || {};
  const enc = (typeof encounterOrId === 'string') ? A.findEncounter(campaign, encounterOrId) : encounterOrId;
  if(!enc || !enc.pursuit || enc.pursuit.direction === 'party') return null;
  if(!(typeof A.isHouseRuleEnabled === 'function' && A.isHouseRuleEnabled(campaign, 'persistent-wandering-monsters'))) return null;
  const p = enc.pursuit;
  if(p.aftermath) return null;                     // once per chase
  const ms = enc.monsterSide || {};
  // 🔧 v1 position: the chase trails the party's straight line, so the band stands at the
  // trail's anchor (the catch hands the sprung meeting's hex in).
  const hexId = o.hexId || p.lastPartyHexId || enc.hexId || null;
  const hex = hexId ? ((campaign.hexes || []).find(h => h && h.id === hexId) || null) : null;
  if(!hex || !hex.coord) return null;              // nowhere to stand — the band slips off the map
  const turn = campaign.currentTurn || 1;
  const lair = (ms.lairId && typeof A.findLair === 'function') ? A.findLair(campaign, ms.lairId) : null;
  const home = (lair && (lair.status === 'active' || lair.status === 'unknown') && lair.hexId) ? lair : null;
  const denHex = home ? ((campaign.hexes || []).find(h => h && h.id === home.hexId) || null) : null;
  const aliveOf = g => (typeof A.groupActiveCount === 'function') ? A.groupActiveCount(g) : Math.max(0, (g.count || 0) - (g.casualties || 0));
  const housed = gid => (campaign.lairs || []).some(l => l && (l.status === 'active' || l.status === 'unknown' || l.status === 'dynamic') && (l.groupIds || []).indexOf(gid) >= 0);
  let g = null;
  for(const gid of (ms.groupIds || [])){
    const cand = (campaign.groups || []).find(x => x && x.id === gid);
    if(cand && aliveOf(cand) > 0 && !housed(cand.id)){ g = cand; break; }
  }
  let minted = false;
  if(!g){
    const entry = (ms.monsterCatalogKey && typeof A.findMonster === 'function') ? A.findMonster(ms.monsterCatalogKey) : null;
    g = (typeof A.blankGroup === 'function') ? A.blankGroup({
      name: p.pursuerLabel || ms.label || (entry && entry.name) || 'A wandering band',
      groupTemplate: { monsterCatalogKey: (entry && entry.key) || ms.monsterCatalogKey || null,
                       creatureTypes: (entry && entry.creatureTypes) ? entry.creatureTypes.slice() : ['monster'],
                       hitDice: (entry && entry.hd) || null },
      count: ms.count || 1,
      currentHexId: hexId
    }) : null;
    if(!g) return null;
    campaign.groups = campaign.groups || [];
    campaign.groups.push(g);
    minted = true;
  } else {
    g.currentHexId = hexId;
  }
  const prior = g.wanderState || {};
  g.history = g.history || [];
  enc.history = enc.history || [];
  if(home && denHex && denHex.coord){
    g.wanderState = { coord: { q: hex.coord.q, r: hex.coord.r }, lastCoord: null, mileRemainder: 0,
                      mode: 'heading-home', destLairId: home.id,
                      dissolveOnArrival: minted || !!prior.dissolveOnArrival,
                      lastDomainId: hex.domainId || null, halted: false };
    p.aftermath = 'heading-home';
    enc.history.push({ turn, type: 'pursuit-aftermath',
      reason: 'the band turns for home — ' + (home.name || home.id) + ' (full expedition speed; it will not stop, though it may pick up a new hunt on the way)' });
    g.history.push({ turn, type: 'homing', reason: 'the hunt over, the band heads home to ' + (home.name || home.id) });
  } else {
    g.wanderState = { coord: { q: hex.coord.q, r: hex.coord.r }, lastCoord: null, mileRemainder: 0,
                      mode: null, destLairId: null, dissolveOnArrival: false,
                      lastDomainId: hex.domainId || null, halted: false };
    p.aftermath = 'migrant';
    enc.history.push({ turn, type: 'pursuit-aftermath',
      reason: 'no den to return to — the band becomes a migrant and wanders (half speed, never doubling straight back)' });
    g.history.push({ turn, type: 'wander', reason: 'the hunt over and denless, the band wanders as a migrant' });
  }
  return { group: g, minted, mode: p.aftermath };
}

// Resolution — flip the entity + emit the ONE comprehensive encounter-resolved event
// (the travel-day idiom: the whole walk in the payload, the context envelope carrying
// hex + both sides, subdayContext.encounterId stamped). outcome: no-encounter | evaded |
// parleyed | dispersed | combat ("GM resolves" until #141) | settled-as-lair (E3) |
// dismissed. A no-encounter resolution is campaignLogHidden (not a chronicle beat).
function recordEncounterResolved(campaign, encounterId, outcome, opts){
  const A = _gpwACKS();
  const o = opts || {};
  const enc = A.findEncounter(campaign, encounterId);
  if(!enc) return { ok: false, error: 'unknown-encounter' };
  if(enc.status === 'resolved' && enc.resolvedByEventId) return { ok: true, encounter: enc, event: null, alreadyResolved: true };
  const hex = (typeof A.findHex === 'function') ? A.findHex(campaign, enc.hexId) : null;
  const mLabel = _encMonsterLabel(enc);
  const out = outcome || 'dismissed';
  let narrative;
  if(out === 'no-encounter')        narrative = 'No encounter — neither side became aware of the other.';
  else if(out === 'evaded')         narrative = 'The party evaded ' + mLabel + '.';
  else if(out === 'parleyed')       narrative = 'The party parleyed with ' + mLabel + (enc.reaction && enc.reaction.current ? (' — ' + enc.reaction.current) : '') + '.';
  else if(out === 'dispersed')      narrative = 'The meeting with ' + mLabel + ' broke up without consequence.';
  else if(out === 'combat')         narrative = 'Combat with ' + mLabel + ' — GM resolves (record the result as an adventure outcome).';
  else if(out === 'settled-as-lair') narrative = mLabel + ' settled and denned here (lingered — JJ p.103).';
  else                              narrative = 'Encounter with ' + mLabel + ' dismissed.';
  if(o.note) narrative += ' ' + o.note;
  const ev = newEvent('encounter-resolved', {
    submittedBy: o.submittedBy || 'gm', status: EVENT_STATUS.PENDING, targetTurn: campaign.currentTurn || 1,
    context: { primaryHexId: enc.hexId || null, involvedHexIds: [], settlementId: null,
               domainId: (hex && hex.domainId) || null, relatedEntities: _encRelatedEntities(enc) },
    payload: {
      encounterId: enc.id, outcome: out, category: enc.category || null, rarity: enc.rarity || null,
      trigger: enc.trigger || null, hexId: enc.hexId || null,
      lairId: (enc.monsterSide && enc.monsterSide.lairId) || null,
      monsterCatalogKey: (enc.monsterSide && enc.monsterSide.monsterCatalogKey) || null,
      encounterKind: (enc.monsterSide && enc.monsterSide.encounterKind) || null,
      distanceFt: (enc.distance && enc.distance.distanceFt) || null,
      surprise: enc.surprise ? { party: enc.surprise.party.surprised, monsters: enc.surprise.monsters.surprised, evadeEligibility: enc.surprise.evadeEligibility } : null,
      evasion: enc.evasion ? { success: enc.evasion.success, target: enc.evasion.target, aftermath: enc.evasion.aftermath } : null,
      reaction: enc.reaction ? { current: enc.reaction.current, attempts: enc.reaction.rolls.length } : null,
      narrative
    }
  });
  if(out === 'no-encounter') ev.campaignLogHidden = true;
  ev.subdayContext = { cadence: 'encounter', encounterId: enc.id, roundNumber: null, turnNumber: null, initiativeOrder: null };
  _logAppliedEvent(campaign, ev, { narrativeSummary: narrative });
  A.resolveEncounter(campaign, enc.id, out, { resolvedByEventId: ev.id, note: o.note });
  // E4m — scattering a band that was mid-hunt ends its chase: when this meeting's monster
  // side IS a pursuing band (pursuitEncounterId), 'dispersed' is the one outcome whose
  // engine meaning is "the band breaks up / moves on" — the quarry's chase resolves
  // 'evaded' behind it. Parley/evade leave the hunt running (the band presses on).
  // E5 — the same for a band being TRACKED: scattered, there is no band left on the trail,
  // so the follow ends (its host meeting is already resolved — only the pursuit flips).
  if(out === 'dispersed' && enc.monsterSide && enc.monsterSide.pursuitEncounterId){
    const src = A.findEncounter(campaign, enc.monsterSide.pursuitEncounterId);
    const sp = src && src.pursuit;
    if(src && src.status === 'active' && sp && sp.direction !== 'party' && (sp.status === 'offered' || sp.status === 'pursuing')){
      const ps = enc.partySide || {};
      const party = ps.partyId ? ((campaign.parties || []).find(p => p && p.id === ps.partyId)) : null;
      const firstCh = ((ps.characterIds || []).length) ? ((campaign.characters || []).find(c => c && c.id === ps.characterIds[0])) : null;
      const who = (party && party.name) || (firstCh && firstCh.name) || 'another party';
      src.history = src.history || [];
      src.history.push({ turn: campaign.currentTurn || 1, type: 'pursuit-broken',
        reason: 'the band was scattered in a meeting with ' + who + ' — the hunt ends' });
      recordEncounterResolved(campaign, src.id, 'evaded', {
        note: 'The pursuing band was scattered by ' + who + ' — the hunt ends.'
      });
    } else if(src && sp && sp.direction === 'party' && sp.status === 'tracking'){
      src.history = src.history || [];
      src.history.push({ turn: campaign.currentTurn || 1, type: 'tracking-broken',
        reason: 'the quarry was scattered in another meeting — the trail ends' });
      sp.status = 'lost';
    }
  }
  // E6 — the chase's SPRUNG meeting (the catch — trigger 'pursuit') concluded with the
  // band still standing: the hunters turn for home, or — denless — become wandering
  // migrants (pursuitAftermath; idempotent, rule-gated). 'dispersed' = scattered (handled
  // above), and a follow's sprung meeting (the chase link pointing at a direction-'party'
  // pursuit) is the TRACKERS' catch — the quarry's own model governs it, not this hook.
  if(out !== 'dispersed' && out !== 'no-encounter' && enc.trigger === 'pursuit'
     && enc.monsterSide && enc.monsterSide.pursuitEncounterId){
    const chase = A.findEncounter(campaign, enc.monsterSide.pursuitEncounterId);
    if(chase && chase.pursuit && chase.pursuit.direction !== 'party'){
      pursuitAftermath(campaign, chase, { hexId: enc.hexId });
    }
  }
  return { ok: true, encounter: enc, event: ev };
}

const EVENT_WIZARD_OPTOUT = Object.freeze(new Set([
  'engine-standard-turn',  // engine internal flow — emitting raw would create chaos
  'recruit-hireling',      // owned by Recruiting Wizard — skips candidate individuation
  'venture-launch',        // owned by Launch Venture modal — skips investment validation
  'character-level-up',    // owned by level-up auto-flow — skips XP/class progression
  'character-death',       // owned by character sheet retire/delete — too consequential for raw emit
  'gm-narrative',          // owned by Chronicle Entry sub-tab — has its own rich UI
  // Phase 2.5 Journeys (#475 — J1) — emitted by the day-tick consumer + startJourney,
  // not authored raw (raw emit would skip the journey state transitions).
  'journey-start', 'journey-day-tick', 'journey-arrived', 'journey-lost', 'journey-resupply', 'journey-encounter', 'journey-aborted', 'journey-rerouted',
  // GP Wave B — owned by marketBuy/marketSell (raw emit would skip the availability + funds
  // gate). The wealth-transfer + item-transfer primitives stay emittable (legit GM move verbs).
  'market-transaction',
  // Phase 2.5 Provisioning V4 — owned by forageActivity/huntActivity (raw emit would skip the
  // throw + yield application; the event is a record of what the verb already did).
  'provisioning-activity',
  // CoL-1 — owned by the 'survival' day-consumer (a record of the day's resolution, not a GM verb).
  'survival-day',
  // #476 M4/E5 — owned by hexSearchActivity / beginTracking (raw emit would skip the throw +
  // discovery flip) and by the discovery flows (lair-discovered pairs with a discoverLair call;
  // raw emit would narrate a discovery the lair state doesn't show).
  'hex-search', 'lair-discovered',
  // #476 E1 — owned by the encounter step verbs (recordEncounterResolved / encounterAttemptInfluence);
  // raw emit would narrate a walk the Encounter entity's state doesn't show.
  'encounter-resolved', 'encounter-influence',
  // Favors & Duties (#230, F&D-1) — emitted by the monthly auto-roll as an audit of the obligation
  // it just created/revoked. The GM authors an obligation via Inspector Create, not this raw event.
  'favor-duty',
  // #476 E10 — owned by processBanditryForTurn (the monthly reconcile already moved the bands +
  // population; raw emit would narrate a change the world state doesn't show).
  'domain-banditry',
  // === Proficiency PT-1 (team) ===
  // owned by ACKS.recordProficiencyThrow (the throw modal) — a raw emit would carry no real
  // throw breakdown; the GM rolls via the modal, not the Event Wizard.
  'proficiency-throw',
  // === DC-2 (team) ===
  // Domain Completion DC-2 — owned by processClassificationAdvancement (the monthly turn already
  // raised the permanent floor; raw emit would narrate an advance the domain state doesn't show).
  'domain-advanced',
  // === Religion R1 (team 2026-06-13) — owned by the religion verbs + the monthly consumer
  // (processReligionForTurn). Raw emit would narrate a divine-power/consecration change the ledger
  // + domain state don't show; the GM authors deities/congregations via Inspector Create + the
  // ⛪ Religion view's actions, not these raw events.
  'divine-power-accrued', 'consecration', 'divine-favor-changed',
  // === Religion R2 (team 2026-06-14) — owned by bloodSacrifice (raw emit would record a sacrifice
  // the divine/arcane ledgers don't show; the GM performs it via the ⛪ Religion view's action). ===
  'blood-sacrifice',
  // === Hijinks HJ-1 (team) === — owned by startHijink / the 'hijinks' day-consumer (raw emit
  // would record a hijink the campaign.hijinks[] lifecycle doesn't show).
  'hijink-attempted', 'hijink-resolved',
  // === Hijinks HJ-2 (team 2026-06-13) === — owned by formSyndicate / collectSyndicateTribute /
  // resolveHijinkTrial (raw emit would record an enterprise change the syndicate/hijink doesn't show).
  'hijink-syndicate-formed', 'hijink-tribute', 'hijink-trial',
  // Phase 3 Military W2 — owned by the incursion day consumer (its commit materializes
  // the band; raw emit would narrate an arrival the world doesn't show).
  'domain-incursion',
  // Phase 3 Military W3 — owned by the battle engine (beginBattle / runBattleTurn /
  // applyBattleAftermath emit these; raw emit would narrate a fight the entity doesn't hold).
  'battle-started', 'battle-turn', 'battle-resolved',
  // Phase 3 Military W4 + W5 — owned by the slot-88 military consumer + the conquest/pillage/
  // requisition verbs (their commits write the state; raw emit would narrate a campaign move the
  // armies/domains don't show).
  'army-contact', 'domain-warfare', 'army-supply',
  // === Delves D1 — Mortal Wounds (team burst3 2026-06-13) === — owned by ACKS.applyMortalWound +
  // the slot-58 convalescence consumer (raw emit would narrate a wound/recovery the character's
  // mortalWounds[] + lifecycleState don't show). The GM records a wound via the character-sheet
  // Record-a-wound modal, not the Event Wizard.
  'mortal-wound', 'wound-recovery',
  // Phase 3 Military W6 (burst3) — owned by acks-engine-sieges.js (the setters + the slot-90
  // consumer write the Siege state); a raw emit would narrate an investment the entity doesn't hold.
  'siege-started', 'siege-progress', 'siege-resolved',
  // === Character Lifecycle CL-1 (burst4) === — owned by ACKS.processAgingForTurn (the monthly pass);
  // a raw emit would narrate an aging/death the character's age/lifecycleState don't show. The GM sets
  // an age via the character sheet, not the Event Wizard.
  'aging-milestone', 'death-from-old-age',
  // === Treasure Generation #142 (burst5 2026-06-14) === — owned by ACKS.materializeHoard (the
  // Treasure Wizard); a raw emit would record a hoard the stashes/notables/captives don't show. The
  // GM rolls + places a hoard via the wizard, not the Event Wizard.
  'treasure-generated',
  // === Sages SG-1 (burst5 b5-sages, #147) === — owned by consultSage (the consult modal); a raw
  // emit would carry no real throw/fee breakdown. The GM consults a sage via the modal, not here.
  'sage-consultation',
  // === Politics P-2 (burst5 2026-06-14) === — owned by ACKS.senateVote / ACKS.enactPolicy (the Senate
  // tab's Consult + Enact actions); a raw emit would record a vote/dispute the senate state doesn't show.
  'senate-vote', 'policy-enacted'
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
  _autoEmitRumor,
  // GP Wave B (2026-06-04, Architecture.md §4.3) — the wealth/item movement grammar.
  // Movers (apply state): _doWealthTransfer / _doItemTransfer (aliased applyWealthTransfer /
  // applyItemTransfer). Record-only loggers (the caller already moved): recordWealthTransfer /
  // recordItemTransfer — used by commitTurn / treasury-grant / adventure-result / cache-draw to
  // emit the audit decomposition. The retail verbs: marketBuy / marketSell.
  _doWealthTransfer, _doItemTransfer,
  applyWealthTransfer: _doWealthTransfer, applyItemTransfer: _doItemTransfer,
  recordWealthTransfer, recordItemTransfer, _wealthLegAvailable,
  marketBuy, marketSell, _marketActivityCost, marketUnitsTransactedThisMonth, marketMonthlyRemaining,
  previouslyEnteredMarket,
  // Rollback verb behind the Current Activities "Refund" reject (Joachim 2026-06-05) — a
  // compensating counter-trade that voids the original (dropping it from the budget + ceiling).
  reverseMarketTransaction,
  // Phase 2.5 Provisioning V4 — the general Forage / Hunt activity verbs (RR p.278 §1.4) + reroll.
  forageActivity, huntActivity, rerollProvisioningActivity,
  // #476 M4 — Wilderness Search + track-home discovery verbs (RR pp.276–277 + p.120; Plan §6).
  hexSearchActivity, trackingFindThrow, beginTracking, encounterAbandonTracking, recordLairDiscovered, rerollHexSearch,
  // #476 Encounter layer E1 — the step verbs over the Encounter entity (RR pp.280–287; plan §15).
  encounterSetAwareness, encounterRollSurprise, encounterAttemptEvasion,
  encounterRollReaction, encounterAttemptInfluence, recordEncounterResolved,
  // E2h — the distance verb + the per-step rerolls (every roll re-rollable at its frontier)
  encounterRollDistance, encounterRerollIdentity, encounterChooseIdentity, encounterDerivedTablePrior,
  encounterRerollSurprise, encounterRerollEvasion,
  encounterRerollReaction, encounterRerollInfluence,
  // E3a — settle-as-lair (the RAW linger-or-migrate branch, JJ p.69 + p.103)
  encounterSettleEligibility, encounterProposeSettle, settleProposalOutcome, encounterSettleAsLair, beginLairAssault,
  // E3b — the tone derivation (JJ pp.84–87, D11): catalog rows pre-asserted from shipped state
  encounterToneRows,
  // E3c — monster pursuit (RR p.285 + p.120; 'monster-pursuit', default OFF; absorbs M5)
  encounterPartyHexId, encounterBeginPursuit, encounterRerollPursuitTakeUp, encounterDeclinePursuit, encounterAbandonPursuit,
  // E6 — the pursuit aftermath: a chase over with the band standing → home / migrant
  pursuitAftermath
});

if(typeof module !== 'undefined' && module.exports){
  module.exports = ACKS;
}

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
