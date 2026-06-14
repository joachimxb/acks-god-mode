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

  // ════════════════════════════════════════════════════════════════════════════
  // Delves D3 — the Abstract Dungeon foray resolver (JJ ch.12, pp.275–280).
  //
  // RAW: "a set of rules that can be used to quickly and abstractly clear out dungeons."
  // A delve = one or more forays; a foray = one day of strenuous dedicated activity that
  // resolves a party against some of a dungeon's encounters on a single 1d8+1d12 roll.
  // Casualties route through the SHIPPED Mortal Wounds resolver (D1, ACKS.rollMortalWound /
  // applyMortalWound — the abstract subset: only CON / HD / equipment, JJ p.276). Treasure +
  // XP accumulate as a running tally on the Delve and REALIZE at withdraw-or-clear (¼ treasure
  // on withdraw, full on clear; full XP always — RAW p.276); realize disburses via the shipped
  // adventure-result event (treasure → a recipient's purse / a domain treasury via GP Wave B;
  // combat XP → the participants). On-demand only — NO commitTurn / NO day-tick consumer.
  //
  // All values are mechanical facts transcribed from the JJ tables (no RAW prose) — verified
  // against the four worked examples: the Claws of the Lioness (party level 3.25→3; D1 → +2
  // Easy; in Zahar D6 → −16), Moruvai-alone (9/4 → 2), the four-14th-level party in a D1 dungeon
  // (off-table-right → +8, with 11 encounters −3 → +5), and the Marcus ruined-fort henchman delve
  // (party level 2, D1 → +2; 6 advs → +1; foray totals 270 XP / 900 gp / 0 magic-item rolls).
  //
  // ⚠ One RAW ambiguity, decided + documented: the "Resolution Modifier by Encounters Attempted"
  // is described in the JJ prose as a *column shift* of the base difficulty, and the Marcus
  // 2nd-foray example reads it that way (Easy +2 → Simple +4 for 1 encounter). BUT the named
  // 14th-level example computes it as a FLAT add ("8 – 3 = +5"), and the table itself is titled
  // a "Resolution Modifier". We apply it FLAT (it matches the explicit-arithmetic example + the
  // table title; a column model is ill-defined off-table anyway). The only affected example is
  // Marcus foray 2, whose OUTCOME (Excellent) is identical under either reading (+3→18 vs +4→19).
  // The breakdown is surfaced so a GM can adjust.
  // ════════════════════════════════════════════════════════════════════════════

  // ── Catalogs (JJ pp.275–280) ──
  const ENCOUNTERS_BY_DUNGEON_SIZE = Object.freeze({ small:'1d3', medium:'2d3', large:'2d6', mega:'10d6' });        // JJ p.275
  const DUNGEON_RESTOCK_DIE        = Object.freeze({ small:'1d3-2', medium:'2d3-4', large:'2d6-7', mega:'2d12-13' }); // JJ p.276 (per gap day; each roll clamped ≥0, capped at the original total)
  const DUNGEON_TRAVEL_TIME        = Object.freeze({ small:'1d6 days', medium:'2d6 days', large:'1d6 weeks', mega:'1d6 months' }); // JJ p.278 (×4 Civilized / ×2 Borderlands / ×1 Outlands start; one-way)

  // The Base Resolution Modifier grid (JJ p.275). Columns = the 7 difficulty bands; the cell value
  // is the listed party-level range. "-" = blank (off the table on that side). Transcribed verbatim.
  const DUNGEON_DIFFICULTY_BANDS  = Object.freeze([-8, -4, -2, 0, 2, 4, 8]);
  const DUNGEON_DIFFICULTY_LABELS = Object.freeze(['Apocalyptic', 'Horrifying', 'Dangerous', 'Accessible', 'Easy', 'Simple', 'Effortless']);
  const _C = (a, b) => ({ plMin: a, plMax: b });
  const BASE_RESOLUTION_GRID = Object.freeze({               // dungeonLevel → [col0..col6] of {plMin,plMax}|null
    1: [ null,      null,      null,      _C(1,1),   _C(2,3),   _C(4,5),   _C(6,7)   ],
    2: [ null,      null,      _C(1,1),   _C(2,3),   _C(4,5),   _C(6,7),   _C(8,9)   ],
    3: [ null,      _C(1,1),   _C(2,3),   _C(4,5),   _C(6,7),   _C(8,9),   _C(10,11) ],
    4: [ _C(1,1),   _C(2,3),   _C(4,5),   _C(6,7),   _C(8,9),   _C(10,11), _C(12,13) ],
    5: [ _C(2,3),   _C(4,5),   _C(6,7),   _C(8,9),   _C(10,11), _C(12,13), _C(14,14) ],
    6: [ _C(4,5),   _C(6,7),   _C(8,9),   _C(10,11), _C(12,13), _C(14,14), null      ]
  });

  // The party-size roll bonus (JJ p.276) — by ADVENTURER COUNT, not level.
  function partySizeBonus(advCount){ advCount = Math.max(0, Math.round(Number(advCount) || 0)); return advCount >= 8 ? 2 : (advCount >= 5 ? 1 : 0); }

  // Resolution Modifier by Encounters Attempted (JJ p.276) — applied FLAT (see the ⚠ note above).
  function encountersAttemptedModifier(n){
    n = Math.max(0, Math.round(Number(n) || 0));
    if(n <= 1) return +1;
    if(n === 2) return 0;
    if(n <= 5) return -1;
    if(n <= 8) return -2;
    if(n <= 12) return -3;
    return -3 - Math.ceil((n - 12) / 3);                     // "each additional 3 → additional -1"
  }

  // The Abstract Dungeon Resolution table (JJ p.276) — 1d8+1d12 (+ modifiers) → outcome band.
  // clears = whether the attempted encounters are defeated (catastrophic = party wiped → none).
  // XP is FULL for cleared encounters; treasurePct scales only the TREASURE (RAW p.276).
  const DUNGEON_RESOLUTION = Object.freeze([
    { max: 2,           result: 'catastrophic',   woundsDie: 'all',    treasurePct: 0,   clears: false }, // every adventurer slain
    { range: [3, 5],    result: 'dreadful',       woundsDie: '1d6',    treasurePct: 0,   clears: true  }, // mortal wounds, no treasure
    { range: [6, 8],    result: 'unsatisfactory', woundsDie: '1d4-1',  treasurePct: 50,  clears: true  },
    { range: [9, 12],   result: 'indifferent',    woundsDie: '1d3-2',  treasurePct: 100, clears: true  },
    { range: [13, 16],  result: 'satisfactory',   woundsDie: '1d4-3',  treasurePct: 125, clears: true  },
    { range: [17, 19],  result: 'excellent',      woundsDie: '1d6-5',  treasurePct: 150, clears: true  },
    { min: 20,          result: 'stupendous',     woundsDie: 0,        treasurePct: 200, clears: true  }  // no casualties
  ]);
  function dungeonResolutionBand(total){
    total = Number(total) || 0;
    for(const b of DUNGEON_RESOLUTION){
      if(b.max != null && total <= b.max) return b;
      if(b.min != null && total >= b.min) return b;
      if(b.range && total >= b.range[0] && total <= b.range[1]) return b;
    }
    return DUNGEON_RESOLUTION[0];
  }

  const TREASURE_XP_BY_DUNGEON_LEVEL = Object.freeze({       // per defeated encounter (JJ p.276)
    1:{ xp:90, gp:360 }, 2:{ xp:140, gp:560 }, 3:{ xp:320, gp:1280 }, 4:{ xp:625, gp:2500 }, 5:{ xp:1835, gp:7340 }, 6:{ xp:4795, gp:19180 }
  });
  const DUNGEON_MAGIC_ITEMS = Object.freeze({                // roll once per × full gp found, treasure type only (JJ p.276)
    1:{ gpPerRoll:1000, type:'D' }, 2:{ gpPerRoll:1250, type:'E' }, 3:{ gpPerRoll:3250, type:'I' }, 4:{ gpPerRoll:6000, type:'L' }, 5:{ gpPerRoll:22000, type:'Q' }, 6:{ gpPerRoll:45000, type:'R' }
  });
  const RANDOM_DUNGEON_LEVEL = Object.freeze([               // 1d100 (JJ p.278)
    { level:1, range:[1,51] }, { level:2, range:[52,77] }, { level:3, range:[78,90] }, { level:4, range:[91,96] }, { level:5, range:[97,99] }, { level:6, range:[100,100] }
  ]);
  const RANDOM_DUNGEON_SIZE = Object.freeze([                // 1d100 (JJ p.278)
    { size:'small', range:[1,54] }, { size:'medium', range:[55,81] }, { size:'large', range:[82,98] }, { size:'mega', range:[99,100] }
  ]);
  const DUNGEON_SITUATIONAL_MODS = Object.freeze([           // flat roll modifiers (JJ p.278 — "affect the resolution roll directly")
    { key:'missing-key-role',  mod:-1, label:'Missing a key role (−1)' },          // -1 per missing role (v1: applied once per toggle)
    { key:'well-balanced',     mod:+1, label:'Well-balanced party (+1)' },
    { key:'well-prepared',     mod:+2, label:'Well prepared for the threats (+2)' },
    { key:'poorly-prepared',   mod:-2, label:'Poorly prepared (−2)' },
    { key:'unexpected-magic',  mod:+1, label:'Unexpectedly powerful magic (+1)' }
  ]);

  // ── Local dice + character helpers (self-sufficient; mirror the mortal-wounds module) ──
  function _rng(rng){ return (typeof rng === 'function') ? rng() : Math.random(); }
  function _rollOne(sides, rng){ return Math.floor(_rng(rng) * sides) + 1; }
  // Parse + roll 'NdM', 'NdM+K', 'NdM-K', or a plain integer. Returns the summed value (NOT clamped).
  function _rollDice(spec, rng){
    const m = String(spec).trim().match(/^(\d+)d(\d+)\s*([+-]\s*\d+)?$/i);
    if(!m){ const v = parseInt(spec, 10); return isNaN(v) ? 0 : v; }
    const count = parseInt(m[1], 10), sides = parseInt(m[2], 10);
    const mod = m[3] ? parseInt(m[3].replace(/\s/g, ''), 10) : 0;
    let total = mod;
    for(let i = 0; i < count; i++) total += _rollOne(sides, rng);
    return total;
  }
  function _findCharacter(campaign, id){
    if(id && typeof id === 'object') return id;
    return (campaign && Array.isArray(campaign.characters)) ? (campaign.characters.find(c => c && c.id === id) || null) : null;
  }

  // ── Party level (JJ p.275): sum of levels / max(count, 4), round .5+ up. ──
  function partyLevelFor(campaign, charIds){
    const ids = Array.isArray(charIds) ? charIds : [];
    const chars = ids.map(id => _findCharacter(campaign, id)).filter(Boolean);
    const n = chars.length;
    if(n === 0) return 0;
    const sum = chars.reduce((s, c) => s + (Number(c.level) || 1), 0);
    return Math.round(sum / Math.max(n, 4));                 // Math.round: positive .5 rounds up (RAW)
  }
  function rollDungeonEncounters(size, opts){ return Math.max(0, _rollDice(ENCOUNTERS_BY_DUNGEON_SIZE[size] || '1d3', opts && opts.rng)); }

  // ── Base resolution modifier (JJ p.275) + the Under/Over-Strength off-table rule. ──
  // Returns { modifier, difficultyLabel, offTable, offRight?, offLeft?, rowsUp? }.
  function baseResolutionModifier(partyLevel, dungeonLevel){
    const PL = Math.max(1, Math.round(Number(partyLevel) || 0));
    const DL = Math.max(1, Math.min(6, Math.round(Number(dungeonLevel) || 1)));
    const bands = DUNGEON_DIFFICULTY_BANDS, labels = DUNGEON_DIFFICULTY_LABELS;
    const row = d => BASE_RESOLUTION_GRID[d];
    const colOf = (d, pl) => { const r = row(d); if(!r) return null; for(let c = 0; c < 7; c++){ const cell = r[c]; if(cell && pl >= cell.plMin && pl <= cell.plMax) return c; } return null; };
    const rowMaxPl = d => { const r = row(d); let m = -Infinity; for(const c of r){ if(c) m = Math.max(m, c.plMax); } return m; };
    const rightmostCol = d => { const r = row(d); let rc = 6; while(rc >= 0 && !r[rc]) rc--; return rc; };

    let c = colOf(DL, PL);
    if(c !== null) return { modifier: bands[c], difficultyLabel: labels[c], offTable: false };
    // Off the table to the right (party too strong) → the rightmost listed band, NO bonus (JJ p.275).
    if(PL > rowMaxPl(DL)){ const rc = rightmostCol(DL); return { modifier: bands[rc], difficultyLabel: labels[rc], offTable: true, offRight: true }; }
    // Off the table to the left (party too weak) → move UP rows until PL is listed, shifting one
    // column left per row moved; each column past the left edge applies an extra -8 (JJ p.275).
    let rowsUp = 0, d = DL;
    while(d > 1){
      d--; rowsUp++;
      const cc = colOf(d, PL);
      if(cc !== null){
        const effCol = cc - rowsUp;
        if(effCol >= 0) return { modifier: bands[effCol], difficultyLabel: labels[effCol], offTable: true, offLeft: true, rowsUp };
        const extra = -effCol;                              // columns off the left edge
        return { modifier: bands[0] - 8 * extra, difficultyLabel: labels[0] + ' (off-table −' + (8 * extra) + ')', offTable: true, offLeft: true, rowsUp, extraColumnsLeft: extra };
      }
    }
    // Below everything even at D1 (party level < 1 after clamp shouldn't reach here) — deep off-left.
    return { modifier: bands[0] - 8 * (DL - 1), difficultyLabel: labels[0] + ' (deep off-table)', offTable: true, offLeft: true, rowsUp: DL - 1 };
  }

  // ── The composed foray resolution modifier (base + encounters + party-size + situational + foray penalty). ──
  function dungeonForayResolutionModifier(dungeon, opts){
    opts = opts || {};
    const partyLevel = Number(opts.partyLevel) || 0;
    const dungeonLevel = (dungeon && dungeon.dungeonLevel) || opts.dungeonLevel || 1;
    const attempted = Math.max(0, Math.round(Number(opts.attemptedEncounters) || 0));
    const advCount = Math.max(0, Math.round(Number(opts.adventurerCount) || 0));
    const base = baseResolutionModifier(partyLevel, dungeonLevel);
    const breakdown = [{ key:'base', label:'Base difficulty — party ' + partyLevel + ' vs dungeon ' + dungeonLevel + ' (' + base.difficultyLabel + ')', value: base.modifier }];
    // Multiple forays in one day (JJ p.279): the encounters modifier uses the CUMULATIVE encounters
    // that day, and there's an extra -1 per foray already made today.
    const foraysBefore = Math.max(0, Math.round(Number(opts.foraysAlreadyTodayCount) || 0));
    const cumulative = foraysBefore > 0 ? (Math.max(0, Number(opts.cumulativeEncountersToday) || 0) + attempted) : attempted;
    let encMod = encountersAttemptedModifier(cumulative);
    if(opts.soleRemainingUnknown && attempted === 1) encMod = 0;   // unknown-size: a sole unknown encounter gives +0 not +1 (JJ p.279)
    breakdown.push({ key:'encounters', label:'Encounters attempted (' + attempted + (foraysBefore ? (' · ' + cumulative + ' today') : '') + ')', value: encMod });
    if(foraysBefore > 0) breakdown.push({ key:'foray-penalty', label:'Foray ' + (foraysBefore + 1) + ' of the day (−1 each after the first)', value: -foraysBefore });
    const sizeBonus = partySizeBonus(advCount);
    if(sizeBonus) breakdown.push({ key:'party-size', label:'Party size (' + advCount + ' adventurers)', value: sizeBonus });
    (opts.situationalKeys || []).forEach(k => { const m = DUNGEON_SITUATIONAL_MODS.find(x => x.key === k); if(m){ breakdown.push({ key:'sit:' + k, label: m.label, value: m.mod }); } });
    const modifier = breakdown.reduce((s, r) => s + (Number(r.value) || 0), 0);
    return { modifier, difficultyLabel: base.difficultyLabel, base, breakdown };
  }

  // ── resolveDungeonForay — the PURE proposal (rolls; does NOT mutate). ──
  function resolveDungeonForay(campaign, delve, opts){
    opts = opts || {};
    const dl = (typeof delve === 'string') ? findDelve(campaign, delve) : delve;
    if(!dl) return null;
    const dungeon = findDungeon(campaign, dl.dungeonId);
    if(!dungeon) return null;
    const rng = opts.rng;
    const remaining = dungeonEncountersRemaining(campaign, dungeon);
    const forayParticipants = (dl.participantCharacterIds || []).map(id => _findCharacter(campaign, id)).filter(Boolean).slice(0, 8); // ≤8 per foray (JJ p.275)
    const advCount = forayParticipants.length;
    const partyLevel = partyLevelFor(campaign, forayParticipants.map(c => c.id));
    let attempted = Math.max(1, Math.round(Number(opts.attemptedEncounters) || Math.max(1, remaining)));
    attempted = Math.min(attempted, Math.max(1, remaining));   // declaring more than remain uses the remaining count (JJ p.279)
    const modInfo = dungeonForayResolutionModifier(dungeon, {
      partyLevel, dungeonLevel: dungeon.dungeonLevel, attemptedEncounters: attempted, adventurerCount: advCount,
      situationalKeys: opts.situationalKeys, foraysAlreadyTodayCount: opts.foraysAlreadyTodayCount,
      cumulativeEncountersToday: opts.cumulativeEncountersToday, soleRemainingUnknown: opts.soleRemainingUnknown
    });
    const d8 = _rollOne(8, rng), d12 = _rollOne(12, rng);
    const rollTotal = d8 + d12 + modInfo.modifier;
    const band = dungeonResolutionBand(rollTotal);
    const encountersCleared = band.clears ? Math.min(attempted, remaining) : 0;
    // Casualties — how many adventurers suffer a mortal wound.
    let casualtyCount = 0;
    if(band.woundsDie === 'all') casualtyCount = advCount;
    else if(band.woundsDie && band.woundsDie !== 0) casualtyCount = Math.max(0, _rollDice(band.woundsDie, rng));
    casualtyCount = Math.min(casualtyCount, advCount);
    // Pick the wounded randomly + roll each on the Mortal Wounds (Savage) table, abstract subset (D1).
    const pool = forayParticipants.slice();
    const casualties = [];
    for(let i = 0; i < casualtyCount && pool.length; i++){
      const idx = Math.floor(_rng(rng) * pool.length);
      const c = pool.splice(idx, 1)[0];
      let wound = null;
      if(typeof global.ACKS.rollMortalWound === 'function') wound = global.ACKS.rollMortalWound(c, { table:'savage', abstract:true, rng });
      casualties.push({ characterId: c.id, name: c.name, wound, conditionLabel: wound ? wound.conditionLabel : null, killed: wound ? !!wound.killed : false });
    }
    const perEnc = TREASURE_XP_BY_DUNGEON_LEVEL[dungeon.dungeonLevel] || TREASURE_XP_BY_DUNGEON_LEVEL[1];
    const xpGross = encountersCleared * perEnc.xp;                                       // FULL combat XP
    const treasureGpGross = Math.round(encountersCleared * perEnc.gp * (band.treasurePct / 100)); // treasure % applies to GP only
    return {
      delveId: dl.id, dungeonId: dungeon.id, dungeonName: dungeon.name,
      partyLevel, adventurerCount: advCount, encountersRemaining: remaining,
      attemptedEncounters: attempted, encountersCleared,
      modifier: modInfo.modifier, modifierBreakdown: modInfo.breakdown, difficultyLabel: modInfo.difficultyLabel,
      roll: { d8, d12, total: rollTotal },
      band: { result: band.result, treasurePct: band.treasurePct, woundsDie: band.woundsDie }, result: band.result, treasurePct: band.treasurePct,
      casualties, casualtyCount: casualties.length, treasureGpGross, xpGross, wipes: band.result === 'catastrophic'
    };
  }

  // ── commitDungeonForay — apply a ratified proposal (mutates). ──
  function commitDungeonForay(campaign, delveId, proposal, opts){
    opts = opts || {};
    const dl = (typeof delveId === 'object') ? delveId : findDelve(campaign, delveId);
    if(!dl || !proposal) return null;
    const dungeon = findDungeon(campaign, dl.dungeonId);
    if(!dungeon) return null;
    const A = global.ACKS;
    // Decrement the dungeon's authored count (abstract dungeon). A STOCKED dungeon's encounters-
    // remaining is derived from its living lairs (Q2) — clearing those is the Lair/Encounter path,
    // so we don't touch the authored count there.
    if(!dungeonIsStocked(campaign, dungeon)){
      dungeon.encountersRemaining = Math.max(0, (Number(dungeon.encountersRemaining) || 0) - proposal.encountersCleared);
    }
    dungeon.encountersCleared = (Number(dungeon.encountersCleared) || 0) + proposal.encountersCleared;
    dungeon.lastForayAtDayInMonth = (campaign.currentDayInMonth) || 1;
    dungeon.lastForayAtTurn = (campaign.currentTurn) || 1;
    if(dungeon.status === 'known' || dungeon.status === 'undiscovered') dungeon.status = 'being-cleared';
    // Running tally on the Delve (the homeless state — realizes at withdraw/clear).
    dl.runningEncountersCleared = (Number(dl.runningEncountersCleared) || 0) + proposal.encountersCleared;
    dl.runningTreasureGp = (Number(dl.runningTreasureGp) || 0) + (Number(proposal.treasureGpGross) || 0);
    dl.runningXp = (Number(dl.runningXp) || 0) + (Number(proposal.xpGross) || 0);
    if(!Array.isArray(dl.casualtyCharacterIds)) dl.casualtyCharacterIds = [];
    // Apply casualties via the Mortal Wounds resolver (D1). A wounded/slain adventurer leaves the
    // delve until recovered (RAW p.276). A henchman casualty also warrants a calamity + loyalty
    // check (RAW p.277) — left to the GM via the shipped hireling-calamity flow (noted, not auto-fired).
    const woundRecords = [];
    (proposal.casualties || []).forEach(cas => {
      if(cas.wound && typeof A.applyMortalWound === 'function'){
        const rec = A.applyMortalWound(campaign, cas.characterId, cas.wound, { healedToOneHp: opts.healedToOneHp !== false });
        woundRecords.push({ characterId: cas.characterId, outcome: rec ? rec.outcome : null, conditionLabel: rec ? rec.conditionLabel : null });
      }
      dl.participantCharacterIds = (dl.participantCharacterIds || []).filter(id => id !== cas.characterId);
      if(!dl.casualtyCharacterIds.includes(cas.characterId)) dl.casualtyCharacterIds.push(cas.characterId);
    });
    const forayIndex = (dl.foraysResolved || []).length;
    if(!Array.isArray(dl.foraysResolved)) dl.foraysResolved = [];
    dl.foraysResolved.push({
      forayIndex, dayInMonth: dungeon.lastForayAtDayInMonth, turn: dungeon.lastForayAtTurn,
      attemptedEncounters: proposal.attemptedEncounters, encountersCleared: proposal.encountersCleared,
      roll: proposal.roll.total, resolutionModifier: proposal.modifier, result: proposal.result,
      treasureGp: proposal.treasureGpGross, xp: proposal.xpGross,
      casualties: (proposal.casualties || []).map(c => c.characterId), eventId: null
    });
    if(proposal.wipes) dl.status = 'wiped';
    const narrative = ((dungeon.name) || 'the dungeon') + ': foray ' + (forayIndex + 1) + ' — ' + proposal.result
      + ' (' + proposal.encountersCleared + ' cleared, ' + proposal.treasureGpGross + 'gp, ' + (proposal.casualties || []).length + ' wounded)';
    const ev = _emitDelveEvent(campaign, 'delve-foray', {
      delveId: dl.id, dungeonId: dungeon.id, phase: 'foray', forayIndex, result: proposal.result,
      encountersCleared: proposal.encountersCleared, treasureGp: proposal.treasureGpGross, xp: proposal.xpGross,
      casualties: (proposal.casualties || []).map(c => c.characterId)
    }, {
      primaryHexId: dungeon.hexId, narrative,
      relatedEntities: [{ kind:'dungeon', id: dungeon.id, role:'site' }, { kind:'delve', id: dl.id, role:'subject' }]
        .concat((proposal.casualties || []).map(c => ({ kind:'character', id: c.characterId, role:'casualty' })))
    });
    if(ev) dl.foraysResolved[forayIndex].eventId = ev.id;
    return { delve: dl, dungeon, foray: dl.foraysResolved[forayIndex], woundRecords };
  }

  // ── realizeDelve — finalize at withdraw-or-clear (¼ treasure on withdraw; full on clear). ──
  function realizeDelve(campaign, delveId, opts){
    opts = opts || {};
    const dl = (typeof delveId === 'object') ? delveId : findDelve(campaign, delveId);
    if(!dl) return null;
    const dungeon = findDungeon(campaign, dl.dungeonId);
    const remaining = dungeon ? dungeonEncountersRemaining(campaign, dungeon) : 0;
    const cleared = opts.outcome === 'cleared';
    const fullyCleared = cleared && remaining <= 0;
    const grossTreasure = Number(dl.runningTreasureGp) || 0;
    const finalTreasure = fullyCleared ? grossTreasure : Math.floor(grossTreasure * 0.25);   // ¼ on withdraw (RAW p.276)
    const combatXp = Number(dl.runningXp) || 0;                                                // full XP either way
    const level = (dungeon && dungeon.dungeonLevel) || 1;
    const mi = DUNGEON_MAGIC_ITEMS[level] || DUNGEON_MAGIC_ITEMS[1];
    const magicItemRolls = fullyCleared ? Math.floor(finalTreasure / mi.gpPerRoll) : 0;        // only on a full clear (RAW p.276)
    dl.magicItemRollsPending = magicItemRolls;
    // Henchman-delve split (RAW p.277): henchmen keep ½ combat XP + ½ treasure; the employer gets
    // the other ½ as campaign XP (via the normal GP-threshold path at the monthly turn).
    const isHench = !!dl.isHenchmanDelve;
    const partyTreasure = isHench ? Math.floor(finalTreasure / 2) : finalTreasure;
    const partyCombatXp = isHench ? Math.floor(combatXp / 2) : combatXp;
    dl.status = fullyCleared ? 'cleared' : 'withdrawn';
    if(dungeon && fullyCleared) dungeon.status = 'cleared';
    // Disburse via the shipped adventure-result (treasure → a recipient; combat XP split among
    // the surviving participants). The treasure-as-XP (campaign XP via GP thresholds) is the
    // monthly-turn machinery — not double-counted here.
    const survivors = (dl.participantCharacterIds || []).slice();
    const xpEach = survivors.length ? Math.floor(partyCombatXp / survivors.length) : 0;
    const xpAwarded = survivors.map(id => ({ characterId: id, xp: xpEach }));
    const treasureDest = opts.treasureDestinationCharacterId || (survivors[0] || null);
    const treasureAwarded = [];
    if(partyTreasure > 0){
      treasureAwarded.push({ kind:'gp', amount: partyTreasure,
        destinationCharacterId: opts.treasureDestinationDomainId ? null : treasureDest,
        destinationDomainId: opts.treasureDestinationDomainId || null,
        label: 'Delve: ' + ((dungeon && dungeon.name) || 'dungeon') });
    }
    const narrative = ((dungeon && dungeon.name) || 'The delve') + ' — ' + (fullyCleared ? 'cleared' : 'withdrawn')
      + ': ' + partyTreasure + 'gp, ' + partyCombatXp + ' XP' + (magicItemRolls ? (', ' + magicItemRolls + ' magic-item roll(s) [type ' + mi.type + ']') : '');
    if(treasureAwarded.length || xpAwarded.length){
      _emitDelveEvent(campaign, 'adventure-result', { outcome: fullyCleared ? 'cleared' : 'partial', treasureAwarded, xpAwarded, narrativeSummary: narrative },
        { primaryHexId: (dungeon && dungeon.hexId) || null, narrative, relatedEntities: survivors.map(id => ({ kind:'character', id, role:'beneficiary' })) });
    }
    _emitDelveEvent(campaign, 'delve-foray', { delveId: dl.id, dungeonId: dungeon ? dungeon.id : null, phase:'realized', outcome: dl.status, treasureGp: partyTreasure, xp: partyCombatXp, magicItemRolls },
      { primaryHexId: (dungeon && dungeon.hexId) || null, narrative, relatedEntities: [{ kind:'delve', id: dl.id, role:'subject' }].concat(dungeon ? [{ kind:'dungeon', id: dungeon.id, role:'site' }] : []) });
    return { delve: dl, finalTreasure, partyTreasure, combatXp, partyCombatXp, magicItemRolls, magicItemType: mi.type, fullyCleared, narrative };
  }

  // ── restockDungeon — add encounters back over the gap days between forays (JJ p.276). ──
  function restockDungeon(campaign, dungeonId, daysElapsed, opts){
    opts = opts || {};
    const d = findDungeon(campaign, dungeonId);
    if(!d) return null;
    if(dungeonIsStocked(campaign, d)) return { restocked: 0, added: 0, note: 'stocked dungeon — restocking is the lair layer' };
    const days = Math.max(0, Math.round(Number(daysElapsed) || 0));
    const spec = DUNGEON_RESTOCK_DIE[d.size] || DUNGEON_RESTOCK_DIE.small;
    let added = 0;
    for(let i = 0; i < days; i++) added += Math.max(0, _rollDice(spec, opts.rng));   // each day's roll clamped ≥0 (RAW: a roll of ≤0 = no new arrivals)
    const before = Number(d.encountersRemaining) || 0;
    const cap = Number(d.encountersTotal) || before;
    d.encountersRemaining = Math.min(cap, before + added);
    return { restocked: d.encountersRemaining - before, added, daysElapsed: days };
  }

  // ── rollRandomDungeon — roll size + level (+ encounters) into a fresh Dungeon (JJ p.278). ──
  function rollRandomDungeon(opts){
    opts = opts || {};
    const lvlRoll = _rollOne(100, opts.rng), sizeRoll = _rollOne(100, opts.rng);
    const lvl = RANDOM_DUNGEON_LEVEL.find(r => lvlRoll >= r.range[0] && lvlRoll <= r.range[1]);
    const sz = RANDOM_DUNGEON_SIZE.find(r => sizeRoll >= r.range[0] && sizeRoll <= r.range[1]);
    const dungeonLevel = lvl ? lvl.level : 1, size = sz ? sz.size : 'small';
    const encountersTotal = rollDungeonEncounters(size, opts);
    return blankDungeon(Object.assign({}, opts.dungeon || {}, { size, dungeonLevel, encountersTotal, encountersRemaining: encountersTotal }));
  }

  // ── startDelve — create + register the multi-foray operation (init-on-write; NO migrate inject). ──
  function startDelve(campaign, opts){
    opts = opts || {};
    const dungeon = findDungeon(campaign, opts.dungeonId);
    const dl = blankDelve({
      dungeonId: opts.dungeonId || null,
      name: opts.name || ('Delve into ' + ((dungeon && dungeon.name) || 'a dungeon')),
      partyId: opts.partyId || null,
      participantCharacterIds: (opts.participantCharacterIds || []).slice(),
      isHenchmanDelve: !!opts.isHenchmanDelve,
      startedAtTurn: (campaign.currentTurn) || 1,
      startedAtDayInMonth: (campaign.currentDayInMonth) || 1
    });
    if(!Array.isArray(campaign.delves)) campaign.delves = [];     // init-on-write — D2 reads delves[] defensively
    campaign.delves.push(dl);
    return dl;
  }

  // ── Event emit — the record-only audit pattern (mirrors the mortal-wounds module). newEvent +
  //    setEventContext + applyEvent (which hits the registered handler) + push the eventLog entry.
  //    Used for the record-only `delve-foray` (an audit handler) AND the `adventure-result`
  //    disbursement (the real shipped handler moves the gp/XP). cadence 'daily'. ──
  function _emitDelveEvent(campaign, kind, payload, opts){
    opts = opts || {};
    const A = global.ACKS;
    if(!A || typeof A.newEvent !== 'function' || !campaign) return null;
    const cal = (campaign.calendar) || {};
    let ev;
    try {
      ev = A.newEvent(kind, {
        submittedBy: 'engine', cadence: 'daily', targetTurn: (campaign.currentTurn) || 1,
        gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: (campaign.currentDayInMonth) || 1 },
        payload: Object.assign({ narrative: opts.narrative }, payload || {})
      });
    } catch(_e){ return null; }
    if(typeof A.setEventContext === 'function'){
      A.setEventContext(ev, { primaryHexId: opts.primaryHexId || null, relatedEntities: opts.relatedEntities || [] });
    }
    let result = { narrativeSummary: opts.narrative };
    try { if(typeof A.applyEvent === 'function'){ const out = A.applyEvent(campaign, ev); if(out && out.result) result = out.result; } } catch(_e){}
    ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
    ev.appliedAtTurn = (campaign.currentTurn) || 1;
    ev.appliedAtDay = (campaign.currentDayInMonth) || 1;
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    campaign.eventLog.push({ event: ev, result, appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
    return ev;
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
    dungeonLifecycleLabel,
    // ── D3 — Abstract Dungeon foray resolver (JJ ch.12) ──
    // catalogs (the UI reads these for forecasts + pickers)
    ENCOUNTERS_BY_DUNGEON_SIZE, DUNGEON_RESTOCK_DIE, DUNGEON_TRAVEL_TIME,
    DUNGEON_DIFFICULTY_BANDS, DUNGEON_DIFFICULTY_LABELS, BASE_RESOLUTION_GRID,
    DUNGEON_RESOLUTION, TREASURE_XP_BY_DUNGEON_LEVEL, DUNGEON_MAGIC_ITEMS,
    RANDOM_DUNGEON_LEVEL, RANDOM_DUNGEON_SIZE, DUNGEON_SITUATIONAL_MODS,
    // math helpers
    partyLevelFor, partySizeBonus, encountersAttemptedModifier, baseResolutionModifier,
    dungeonResolutionBand, dungeonForayResolutionModifier, rollDungeonEncounters,
    // resolver + lifecycle setters
    resolveDungeonForay, commitDungeonForay, realizeDelve, restockDungeon,
    rollRandomDungeon, startDelve
  });

})(typeof window !== 'undefined' ? window : global);
