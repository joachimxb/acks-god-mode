/* ACKS God Mode — acks-engine-delves.js
 * Delves D2 — the Dungeon + Delve entities (data layer). Phase 3.5 (Milestone B).
 *
 * Spec: Phase_3.5_Delves_Plan.md §4 (the entity model) + Data_Dictionary.md §13.2
 * (the RECONCILED blankDungeon — the authoritative shape) + Future_Additions_
 * Integration_Review.md §2 (the Delves⇄Sanctums reconciliation).
 *
 * D2 ships the catalog-free data layer: the factories + lookups + the two derived
 * overlays the reconciliation settled on (dungeonLifecycleLabel + dungeonEncountersRemaining).
 * The abstract-dungeon foray/restock RESOLUTION + its day-tick consumer + the Foray
 * Wizard are D3 — NOT built here.
 *
 * The Dungeon is ONE entity shared by two phases via two facets (composition-over-
 * hierarchy, Architecture §2.2 — the five-axis character + the facet item line are the
 * precedents). Phase 3.5 (this lane, the first implementer) lays down the WHOLE factory:
 *   - the BASE + lifecycle + delve-target facet are active;
 *   - the ARCANE facet (Phase 4 Sanctums, AD-A) is present but reserved-null, so neither
 *     phase migrates the other's saves.
 *
 * The reconciled decisions baked in here (Future_Additions_Integration_Review.md §2,
 * RESOLVED by Joachim 2026-06-13):
 *   - Q1: ONE single `status` axis (NOT the Constructible multi-axis model — a dungeon has
 *     no damage⟂construction orthogonality). Stored values:
 *       undiscovered | known | being-cleared | cleared | sealed | abandoned | destroyed
 *     `owned` + `attuned` are NOT stored — they are DERIVED (owned ⟺ ownerCharacterId;
 *     attuned ⟺ an active campaign.attunements[] relation) and surfaced by the derived
 *     dungeonLifecycleLabel() overlay (attuned > owned > stored status — the Character
 *     lifecycleLabel precedent). This avoids canonical-setter drift (#10) + honors
 *     derive-don't-store (§3.3).
 *   - attunedCharacterId is DERIVED from campaign.attunements[] — never a stored
 *     attunementIds[] (Architecture §3.3 reverse-index rule).
 *   - Q2: encountersRemaining is the AUTHORED count for an abstract-only dungeon and is
 *     DERIVED from the living-lair count for a STOCKED dungeon (lairs anchored by
 *     lair.dungeonId). dungeonEncountersRemaining() unifies the read (the Monster-
 *     Persistence two-layer precedent).
 *
 * The `dun-` prefix is engine-registered (since 2026-05-30); `dlv-` is added this lane.
 * campaign.dungeons[] is already lazy-defaulted; campaign.delves[] is read DEFENSIVELY
 * (NOT lazy-injected into migrateCampaign) so the 6 templates + demo stay true migrate-
 * no-ops — the world-layer team-session convention (the importer + every reader handle
 * the absent array; the create-setter init-on-writes when a Delve is first made).
 *
 * Loads after acks-engine.js (so SCHEMA_VERSION / newId / ID_PREFIXES exist). Self-
 * contained: pure reads over a passed campaign + two factories. No house rule (RAW core).
 */
(function(global){
  'use strict';

  const ACKS = global.ACKS = global.ACKS || {};

  // Factory plumbing — proxy SCHEMA_VERSION / newId / ID_PREFIXES through the namespace
  // at call time (the acks-engine-entities.js idiom). This module loads after acks-engine.js.
  const SCHEMA_VERSION = 2;
  const newId = function(prefix){ return global.ACKS.newId(prefix); };
  const ID_PREFIXES = new Proxy({}, { get(_, key){ return (global.ACKS.ID_PREFIXES || {})[key]; } });

  // ── Defensive collection reads (absent collections read as []) ──
  function _dungeons(campaign){ return (campaign && Array.isArray(campaign.dungeons)) ? campaign.dungeons : []; }
  function _delves(campaign){ return (campaign && Array.isArray(campaign.delves)) ? campaign.delves : []; }
  function _lairs(campaign){ return (campaign && Array.isArray(campaign.lairs)) ? campaign.lairs : []; }
  function _attunements(campaign){ return (campaign && Array.isArray(campaign.attunements)) ? campaign.attunements : []; }

  // ════════════════════════════════════════════════════════════════════════════
  // Factories
  // ════════════════════════════════════════════════════════════════════════════

  // The unified Dungeon — the persistent PLACE: a delve target now, an owned arcane source
  // later. Both facets on one factory; the arcane facet is reserved-null until Phase 4
  // Sanctums (AD-A) activates it. See the header for the reconciled shape + decisions.
  function blankDungeon(opts={}){
    return {
      schemaVersion: SCHEMA_VERSION,
      id: opts.id || newId(ID_PREFIXES.dungeon),       // 'dun-' (engine-registered since 2026-05-30)
      name: opts.name || '',
      // ── Placement (base) ──────────────────────────────────────
      hexId: opts.hexId || null,                        // the hex it sits in (null = unplaced / unknown distance)
      precisePlacement: opts.precisePlacement || '',    // GM narrative
      domainId: opts.domainId || null,                  // the domain whose territory it lies in (when known)
      origin: opts.origin || 'found',                   // constructed | natural | found | conquered | lair-promoted
      ownerCharacterId: opts.ownerCharacterId || null,  // who owns/operates it (RR p.386) — also the derived `owned` overlay
      knownToPlayers: opts.knownToPlayers === true,
      // ── Lifecycle (the SINGLE status axis — Q1) ───────────────
      // owned/attuned are DERIVED, never stored here (see dungeonLifecycleLabel).
      status: opts.status || 'known',                   // undiscovered | known | being-cleared | cleared | sealed | abandoned | destroyed
      // ── DELVE-TARGET FACET (Phase 3.5 owns — active) ──────────
      size: opts.size || 'small',                       // small | medium | large | mega (JJ p.275)
      dungeonLevel: opts.dungeonLevel || 1,             // 1..6 difficulty (JJ p.275)
      encountersTotal: opts.encountersTotal || 0,       // rolled from size, or counted from a stocked map
      encountersRemaining: (opts.encountersRemaining === undefined ? (opts.encountersTotal || 0) : opts.encountersRemaining),
      encountersCleared: opts.encountersCleared || 0,   // running, for the treasure/XP tally
      sizeKnown: opts.sizeKnown !== false,              // false ⇒ Unknown Size & Level rule (JJ p.279)
      levelKnown: opts.levelKnown !== false,
      multiLevel: opts.multiLevel || false,             // RAW: treat each level as a separate Dungeon
      parentDungeonId: opts.parentDungeonId || null,    // for multi-level: this level's parent complex
      restockDie: opts.restockDie || null,              // derived from size; cached (Dungeon Restocking, JJ p.276)
      lastForayAtDayInMonth: opts.lastForayAtDayInMonth || null,  // restocking clock
      lastForayAtTurn: opts.lastForayAtTurn || null,
      // ── ARCANE / OWNERSHIP FACET (Phase 4 Sanctums owns — reserved-null until AD-A) ──
      levels: (opts.levels === undefined ? null : opts.levels),                  // physical level count
      areaSqFtPerLevel: opts.areaSqFtPerLevel || [],                             // RR p.387 attunement-rate basis
      areaCount: (opts.areaCount === undefined ? null : opts.areaCount),         // drives the JJ p.69 1/3-full cap
      builtByProjectId: opts.builtByProjectId || null,
      buildValueGp: (opts.buildValueGp === undefined ? null : opts.buildValueGp),
      currentShp: (opts.currentShp === undefined ? null : opts.currentShp),
      maxShp: (opts.maxShp === undefined ? null : opts.maxShp),
      treasureSeededGp: (opts.treasureSeededGp === undefined ? null : opts.treasureSeededGp),
      isFull: opts.isFull || false,                                              // JJ p.69 1/3-full cap reached
      sovereignCharacterId: opts.sovereignCharacterId || null,
      subjugatedGroupIds: opts.subjugatedGroupIds || [],
      subjugatedLeaderCharacterIds: opts.subjugatedLeaderCharacterIds || [],
      arcanePowerThisMonth: (opts.arcanePowerThisMonth === undefined ? null : opts.arcanePowerThisMonth),
      arcanePowerSpentThisMonth: (opts.arcanePowerSpentThisMonth === undefined ? null : opts.arcanePowerSpentThisMonth),
      monsterGarrisonHired: (opts.monsterGarrisonHired === undefined ? null : opts.monsterGarrisonHired),
      // ── Reserved: detailed (mapped + stocked) dungeon — future (JJ ch.8) ──
      stockedEncounterIds: opts.stockedEncounterIds || [],  // → Lair/Encounter entities when mapped, not just counted
      // ── Standard tail ─────────────────────────────────────────
      establishedAtTurn: opts.establishedAtTurn || 1,
      history: opts.history || [],                       // DF-style; foray/clear/own/attune events surface via Event.context
      notes: opts.notes || ''
    };
  }

  // The Delve — the off-screen multi-foray clear-a-dungeon OPERATION (the Journey/Battle
  // operations sibling, Architecture §3.13). Mirrors blankJourney so the "operations family"
  // can be factored later (§4.6). The running tally is the homeless state that makes it an
  // entity. Treasure/XP realize at withdraw-or-clear (¼ on withdraw) — D3 owns that.
  function blankDelve(opts={}){
    return {
      schemaVersion: SCHEMA_VERSION,
      id: opts.id || newId(ID_PREFIXES.delve),          // NEW prefix: 'dlv-'
      name: opts.name || '',                            // auto: "Delve into <dungeon name>"
      dungeonId: opts.dungeonId || null,
      partyId: opts.partyId || null,                    // optional (mirrors Journey)
      participantCharacterIds: opts.participantCharacterIds || [],  // the delvers (a foray draws ≤8 from these)
      status: opts.status || 'in-progress',             // in-progress | withdrawn | cleared | wiped
      // Running tally (the homeless state that makes this an entity)
      foraysResolved: opts.foraysResolved || [],        // [{ forayIndex, dayInMonth, turn, attemptedEncounters, roll, resolutionModifier, result, encountersCleared, treasureGp, xp, casualties:[charId], eventId }]
      runningEncountersCleared: opts.runningEncountersCleared || 0,
      runningTreasureGp: opts.runningTreasureGp || 0,
      runningXp: opts.runningXp || 0,
      casualtyCharacterIds: opts.casualtyCharacterIds || [],  // mortally wounded / slain this delve
      magicItemRollsPending: opts.magicItemRollsPending || 0, // computed at clear (Treasure-Type rolls per GP/Roll)
      isHenchmanDelve: opts.isHenchmanDelve || false,   // RAW XP/treasure split (JJ p.277 Allocating)
      startedAtTurn: opts.startedAtTurn || null,
      startedAtDayInMonth: opts.startedAtDayInMonth || null,
      history: opts.history || [],
      notes: opts.notes || ''
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Lookups (defensive)
  // ════════════════════════════════════════════════════════════════════════════

  function findDungeon(campaign, dungeonId){
    if(!dungeonId) return null;
    return _dungeons(campaign).find(d => d && d.id === dungeonId) || null;
  }
  function findDelve(campaign, delveId){
    if(!delveId) return null;
    return _delves(campaign).find(d => d && d.id === delveId) || null;
  }
  function dungeonsAtHex(campaign, hexId){
    if(!hexId) return [];
    return _dungeons(campaign).filter(d => d && d.hexId === hexId);
  }
  function dungeonsInDomain(campaign, domainId){
    if(!domainId) return [];
    return _dungeons(campaign).filter(d => d && d.domainId === domainId);
  }
  // Delves underway against a given dungeon.
  function delvesForDungeon(campaign, dungeonId){
    if(!dungeonId) return [];
    return _delves(campaign).filter(d => d && d.dungeonId === dungeonId);
  }
  // Delves that are still being run (in-progress).
  function activeDelves(campaign){
    return _delves(campaign).filter(d => d && d.status === 'in-progress');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Derived overlays (Q1 + Q2 — never stored)
  // ════════════════════════════════════════════════════════════════════════════

  // The Lairs anchored to this dungeon (a STOCKED dungeon — Sanctums populates lairs into a
  // dungeon via lair.dungeonId; an abstract-only dungeon has none). lair.dungeonId is read
  // defensively (it isn't on blankLair yet — it's the forward anchor Sanctums sets).
  function lairsInDungeon(campaign, dungeon){
    const d = (typeof dungeon === 'string') ? findDungeon(campaign, dungeon) : dungeon;
    if(!d || !d.id) return [];
    return _lairs(campaign).filter(l => l && l.dungeonId === d.id);
  }

  // A "living" lair den (the M4/E9 securing set): active or unknown. cleared/abandoned/
  // destroyed are vacant; dynamic is unplaced (not in any hex).
  function _lairIsLiving(l){ return !!l && (l.status === 'active' || l.status === 'unknown'); }

  // Q2: the count is the abstract view, the Lairs the concrete view, of "what's inside."
  // A STOCKED dungeon (≥1 anchored lair) derives encountersRemaining from the living-lair
  // count; an abstract-only dungeon uses its authored encountersRemaining. The Monster-
  // Persistence two-layer precedent. restocking + the foray clear-side branch the same way (D3).
  function dungeonEncountersRemaining(campaign, dungeon){
    const d = (typeof dungeon === 'string') ? findDungeon(campaign, dungeon) : dungeon;
    if(!d) return 0;
    const lairs = lairsInDungeon(campaign, d);
    if(lairs.length) return lairs.filter(_lairIsLiving).length;        // stocked → derived
    return Math.max(0, Number(d.encountersRemaining) || 0);           // abstract → authored
  }
  // True when the dungeon is stocked with first-class Lair entities (vs an abstract count).
  function dungeonIsStocked(campaign, dungeon){
    return lairsInDungeon(campaign, dungeon).length > 0;
  }

  // The active attunement relation on this dungeon (campaign.attunements[]) — or null. One
  // active attunement per dungeon (the RAW invariant Sanctums' setter enforces); we read the
  // first active match. Active = status absent or 'active'.
  function dungeonActiveAttunement(campaign, dungeon){
    const d = (typeof dungeon === 'string') ? findDungeon(campaign, dungeon) : dungeon;
    if(!d || !d.id) return null;
    return _attunements(campaign).find(a => a && a.dungeonId === d.id && (a.status == null || a.status === 'active')) || null;
  }
  // The DERIVED attunedCharacterId (never stored — Architecture §3.3 reverse-index rule).
  function dungeonAttunedCharacterId(campaign, dungeon){
    const a = dungeonActiveAttunement(campaign, dungeon);
    return a ? (a.mageCharacterId || null) : null;
  }
  function dungeonIsAttuned(campaign, dungeon){
    return !!dungeonActiveAttunement(campaign, dungeon);
  }
  function dungeonIsOwned(campaign, dungeon){
    const d = (typeof dungeon === 'string') ? findDungeon(campaign, dungeon) : dungeon;
    return !!(d && d.ownerCharacterId);
  }

  // Human display labels for the stored status axis (Title-Case — the lifecycleLabel precedent).
  const DUNGEON_STATUS_LABEL = Object.freeze({
    'undiscovered':  'Undiscovered',
    'known':         'Known',
    'being-cleared': 'Being Cleared',
    'cleared':       'Cleared',
    'sealed':        'Sealed',
    'abandoned':     'Abandoned',
    'destroyed':     'Destroyed'
  });

  // The derived lifecycle overlay (Q1): attuned > owned > stored status. Mirrors the Character
  // lifecycleLabel precedent (a Title-Case display label) — attuned/owned are NEVER stored on
  // the dungeon, they're surfaced here from the attunement relation + ownerCharacterId.
  function dungeonLifecycleLabel(campaign, dungeon){
    const d = (typeof dungeon === 'string') ? findDungeon(campaign, dungeon) : dungeon;
    if(!d) return '';
    if(dungeonIsAttuned(campaign, d)) return 'Attuned';
    if(d.ownerCharacterId) return 'Owned';
    return DUNGEON_STATUS_LABEL[d.status] || (d.status || 'Unknown');
  }

  // ── Export onto window.ACKS ──
  Object.assign(ACKS, {
    // factories
    blankDungeon,
    blankDelve,
    // lookups
    findDungeon,
    findDelve,
    dungeonsAtHex,
    dungeonsInDomain,
    delvesForDungeon,
    activeDelves,
    // derived overlays (Q1 + Q2)
    lairsInDungeon,
    dungeonEncountersRemaining,
    dungeonIsStocked,
    dungeonActiveAttunement,
    dungeonAttunedCharacterId,
    dungeonIsAttuned,
    dungeonIsOwned,
    DUNGEON_STATUS_LABEL,
    dungeonLifecycleLabel
  });

})(typeof window !== 'undefined' ? window : global);
