/* =============================================================================
 * acks-engine-lairs.js — ACKS God Mode Lairs & Wilderness Encounter Generation
 * =============================================================================
 *
 * Extracted from acks-engine.js (T5 monolith decomposition, 2026-06-23) — pure
 * code-motion, no behaviour change. Houses two coupled subsystems:
 *
 *   - Monster Persistence (#476) — the first-class Lair entity (campaign.lairs[]):
 *     lookups, lifecycle setters, terrain-keyed density seeding, securing blockers,
 *     and the legacy hex.lairs[] -> campaign.lairs[] lift (self-registered below as
 *     the "legacy-hex-lairs" load-migration, order 140 — was inline in the engine).
 *   - The Encounter layer (E1) — the Encounter entity + the wilderness encounter
 *     DRAW + identity-binding machinery (createEncounterFromDraw / encounterDraw /
 *     bindEncounterIdentity / looseMonsterBands / ...).
 *
 * Late-bound on global.ACKS (the const A = global.ACKS pattern, per function): the
 * core engine (groupActiveCount), the monster catalog (acks-engine-monsters.js), the
 * identity tables (acks-engine-encounter-tables.js), and the distance/terrain helpers
 * in acks-engine-subsystems.js. _rollDiceStr (a generic dice-string roller) moved
 * here with its primary users and is exported for the one Military caller in the core
 * engine (ACKS._rollDiceStr). Loads AFTER acks-engine.js (needs registerLoadMigration).
 *
 * RAW + IP (CLAUDE.md §13.6): mechanical values only, page-cited; the transcribed
 * encounter / identity tables live in acks-engine-encounter-tables.js.
 * ============================================================================= */
(function(global){
'use strict';
const ACKS = global.ACKS = global.ACKS || {};
// =============================================================================
// Phase 2.5 Monster Persistence (#476, M0 — 2026-06-09) — Lair lookups + the legacy lift.
// Lairs are first-class placed entities (campaign.lairs[]); see blankLair (§3.1). These pure
// finds mirror the Group/Outpost lookup shape; the encounter pipeline (M3) and discovery (M4)
// build on them. RAW core — catalog-free.
// =============================================================================
function findLair(campaign, lairId){
  if(!campaign || !Array.isArray(campaign.lairs)) return null;
  return campaign.lairs.find(l => l && l.id === lairId) || null;
}
// All lairs in a hex, any status (the encounter pool + UI filter by status downstream).
function lairsAtHex(campaign, hexId){
  if(!campaign || !Array.isArray(campaign.lairs) || !hexId) return [];
  return campaign.lairs.filter(l => l && l.hexId === hexId);
}
// All lairs of a given monster type — "where do the dire wolves den in this world?"
function lairsByMonsterKey(campaign, monsterCatalogKey){
  if(!campaign || !Array.isArray(campaign.lairs)) return [];
  return campaign.lairs.filter(l => l && l.monsterCatalogKey === monsterCatalogKey);
}
function activeLairs(campaign){
  if(!campaign || !Array.isArray(campaign.lairs)) return [];
  return campaign.lairs.filter(l => l && l.status === 'active');
}
function clearedLairs(campaign){
  if(!campaign || !Array.isArray(campaign.lairs)) return [];
  return campaign.lairs.filter(l => l && l.status === 'cleared');
}
// Derived inhabitant total = Σ active group counts (count − casualties) + individuated leader
// Characters. Pure; recompute on demand — lair.totalInhabitantCount is only a cache.
function lairInhabitantCount(campaign, lair){
  if(!lair) return 0;
  let n = 0;
  if(Array.isArray(lair.groupIds) && campaign && Array.isArray(campaign.groups)){
    for(const gid of lair.groupIds){
      const g = campaign.groups.find(x => x && x.id === gid);
      if(g) n += ACKS.groupActiveCount(g);
    }
  }
  if(Array.isArray(lair.leaderCharacterIds)) n += lair.leaderCharacterIds.length;
  return n;
}

// Lift legacy nested hex.lairs[] sub-entities ({id,name,creatureType,hd,numberAppearing,description})
// to the first-class campaign.lairs[] collection (blankLair §3.1). Same pattern as the treasury→stash
// lift. No shipped template carries populated nested lairs, so this is purely defensive for old
// community saves — and a no-op (returns 0) on every template, preserving the migrate-no-op invariant.
// Mirrors the migrateAgriculturalToProjects hex-collection idiom (reads BOTH campaign.hexes and each
// domain.geography.hexes; migrateCampaign runs before liftToTopLevelCollections). Idempotent: an
// entry already lifted (id present in campaign.lairs) is dropped, and each hex's nested array is
// cleared once processed, so a second pass finds nothing. Returns the count lifted.
function migrateLegacyHexLairs(campaign){
  if(!campaign || typeof campaign !== 'object') return 0;
  if(!Array.isArray(campaign.lairs)) campaign.lairs = [];
  const existingIds = new Set(campaign.lairs.map(l => l && l.id).filter(Boolean));
  const hexById = Object.create(null);
  const addHexes = (arr) => { if(Array.isArray(arr)){ for(const h of arr){ if(h && h.id && !hexById[h.id]) hexById[h.id] = h; } } };
  addHexes(campaign.hexes);
  if(Array.isArray(campaign.domains)){ for(const d of campaign.domains){ if(d && d.geography) addHexes(d.geography.hexes); } }
  let lifted = 0;
  for(const hexId of Object.keys(hexById)){
    const hex = hexById[hexId];
    if(!hex || !Array.isArray(hex.lairs) || hex.lairs.length === 0) continue;
    for(const legacy of hex.lairs){
      if(!legacy || typeof legacy !== 'object') continue;
      if(legacy.id && existingIds.has(legacy.id)) continue;  // already lifted — drop the nested dup
      // No clean target for creatureType/hd/numberAppearing in the §3.1 shape, so fold them into
      // notes with a citation; description → notes. Authored content → status:'active'.
      const bits = [];
      if(legacy.creatureType)   bits.push('Creature: ' + legacy.creatureType);
      if(legacy.hd)             bits.push('HD: ' + legacy.hd);
      if(legacy.numberAppearing)bits.push('No. appearing: ' + legacy.numberAppearing);
      const noteParts = [];
      if(legacy.description) noteParts.push(legacy.description);
      if(bits.length)        noteParts.push('(legacy ' + bits.join(', ') + ')');
      const lair = global.ACKS.blankLair({
        id: legacy.id || undefined,
        name: legacy.name || '',
        status: 'active',
        hexId: hex.id,
        establishedBy: 'gm-fiat',
        notes: noteParts.join(' ').trim()
      });
      campaign.lairs.push(lair);
      existingIds.add(lair.id);
      lifted++;
    }
    hex.lairs = [];  // canonical home is campaign.lairs[]; clear the nested array once lifted
  }
  return lifted;
}

// =============================================================================
// #476 Monster Persistence M1 — Lair lifecycle setters (Phase_2.5_Monster_Persistence_Plan.md §13).
// These are the CANONICAL mutation primitives for a lair's lifecycle — callers (the Lair Wizard,
// the Inspector, event handlers like adventure-result, the future collision consumer) go through
// them, never mutating campaign.lairs[] directly, so every transition is coherent + audited. Each
// stamps a {turn,type,reason,...} entry on lair.history (the same convention as the Wave A relation
// setters + stash history). Status semantics (blankLair §3.2): active | cleared (inhabitants gone,
// structure remains — RAW §3.2, NOT deleted) | abandoned (left of their own accord) | destroyed
// (the structure itself razed) | unknown (placed, undetailed — the hex-seeding shell) | dynamic
// (authored but unplaced — the JJ p.195 dynamic-lair pool, revealed into a hex on demand). Catalog-
// free: none of this needs MONSTER_CATALOG (that gates generation, M2/M3).
// =============================================================================

// Internal: stamp a lifecycle entry on a lair's history[]. Mirrors the Wave A / stash convention.
function _lairHistory(lair, turn, type, reason, extra){
  if(!lair) return;
  if(!Array.isArray(lair.history)) lair.history = [];
  lair.history.push(Object.assign({ turn: (turn === undefined || turn === null) ? null : turn, type: type, reason: reason || type }, extra || {}));
}

// Author a lair into campaign.lairs[] (the Lair Wizard's / Inspector's create path; also used by
// seedHexLairs + migrateLegacyHexLairs callers). opts is a blankLair opts bag. Stamps a 'created'
// history entry. establishedAtTurn defaults to the campaign's current turn. Returns the new lair.
function createLair(campaign, opts){
  if(!campaign || typeof campaign !== 'object') return null;
  if(!Array.isArray(campaign.lairs)) campaign.lairs = [];
  const o = Object.assign({}, opts || {});
  if(o.establishedAtTurn === undefined) o.establishedAtTurn = campaign.currentTurn || 1;
  const lair = global.ACKS.blankLair(o);
  _lairHistory(lair, lair.establishedAtTurn, 'created', (opts && opts.createReason) || lair.establishedBy || 'created');
  campaign.lairs.push(lair);
  return lair;
}

// Internal: resolve a lair's bound Groups (campaign.groups[] referenced by lair.groupIds).
function _lairBoundGroups(campaign, lair){
  if(!lair || !Array.isArray(lair.groupIds) || !campaign || !Array.isArray(campaign.groups)) return [];
  return lair.groupIds.map(gid => campaign.groups.find(g => g && g.id === gid)).filter(Boolean);
}

// Clear a lair — RAW §3.2: inhabitants are driven off / slain and treasure taken, but the structure
// REMAINS (status:'cleared', not deletion; it can later repopulate). Idempotent (already-cleared →
// no-op return). Stamps clearedAtTurn + clearedByEventId (when an event drove it). The canonical
// setter the adventure-result handler delegates to. Bound Groups take FULL casualties so
// groupsAtHex/groupActiveCount agree with the status (opts.leaveGroups:true skips — e.g. the GM
// narrates a rout that scattered survivors; the persistence layer owns what becomes of them).
// GM-authored leader Characters are NOT auto-killed — too destructive for a setter; GM decides.
function clearLair(campaign, lairId, opts){
  const lair = findLair(campaign, lairId);
  if(!lair) return null;
  if(lair.status === 'cleared') return lair;
  const o = opts || {};
  const turn = (o.atTurn === undefined) ? (campaign.currentTurn || null) : o.atTurn;
  lair.status = 'cleared';
  lair.clearedAtTurn = turn;
  if(o.byEventId) lair.clearedByEventId = o.byEventId;
  if(o.leaveGroups !== true){
    for(const g of _lairBoundGroups(campaign, lair)) g.casualties = Math.max(g.casualties || 0, g.count || 0);
    lair.totalInhabitantCount = lairInhabitantCount(campaign, lair);
  }
  _lairHistory(lair, turn, 'cleared', o.reason || 'cleared', o.byEventId ? { byEventId: o.byEventId } : null);
  return lair;
}

// Mark a lair discovered by the players (hex-search / tracking / GM reveal — §6/§7). Sets
// knownToPlayers + lastVisitedTurn, appends a discoveryHistory entry, and stamps history.
// Idempotent on knownToPlayers (re-discovery just refreshes lastVisitedTurn + logs a visit).
function discoverLair(campaign, lairId, opts){
  const lair = findLair(campaign, lairId);
  if(!lair) return null;
  const o = opts || {};
  const turn = (o.atTurn === undefined) ? (campaign.currentTurn || null) : o.atTurn;
  const firstTime = !lair.knownToPlayers;
  lair.knownToPlayers = true;
  lair.lastVisitedTurn = turn;
  if(!Array.isArray(lair.discoveryHistory)) lair.discoveryHistory = [];
  lair.discoveryHistory.push({ turn: turn, by: o.by || null, method: o.method || 'gm-reveal' });
  _lairHistory(lair, turn, firstTime ? 'discovered' : 'revisited', o.reason || (firstTime ? 'discovered' : 'revisited'), o.by ? { by: o.by } : null);
  return lair;
}

// Abandon a lair — its inhabitants leave of their own accord (migration, depletion, fear). Structure
// remains (status:'abandoned'). Idempotent. Distinct from 'cleared' (driven out by adventurers).
// Bound Groups DEPART alive: counts kept, currentHexId → null (gone somewhere unspecified — v1 is
// hex-local, so "away" has no coordinate; the persistence layer will give them destinations).
// opts.leaveGroups:true keeps them standing at the hex.
function abandonLair(campaign, lairId, opts){
  const lair = findLair(campaign, lairId);
  if(!lair) return null;
  if(lair.status === 'abandoned') return lair;
  const o = opts || {};
  const turn = (o.atTurn === undefined) ? (campaign.currentTurn || null) : o.atTurn;
  lair.status = 'abandoned';
  if(o.leaveGroups !== true){
    for(const g of _lairBoundGroups(campaign, lair)) g.currentHexId = null;
  }
  _lairHistory(lair, turn, 'abandoned', o.reason || 'abandoned');
  return lair;
}

// Destroy a lair — the structure itself is razed/collapsed (status:'destroyed'); the site no longer
// functions as a lair. Idempotent. (Clearing leaves a reoccupiable structure; destroying does not.)
// Destroying a still-ACTIVE lair wipes its bound Groups like clearLair (the inhabitants perish with
// the structure; opts.leaveGroups:true skips); a cleared/abandoned lair's groups are already settled.
function destroyLair(campaign, lairId, opts){
  const lair = findLair(campaign, lairId);
  if(!lair) return null;
  if(lair.status === 'destroyed') return lair;
  const o = opts || {};
  const turn = (o.atTurn === undefined) ? (campaign.currentTurn || null) : o.atTurn;
  const wasActive = (lair.status === 'active' || lair.status === 'unknown');
  lair.status = 'destroyed';
  if(wasActive && o.leaveGroups !== true){
    for(const g of _lairBoundGroups(campaign, lair)) g.casualties = Math.max(g.casualties || 0, g.count || 0);
    lair.totalInhabitantCount = lairInhabitantCount(campaign, lair);
  }
  _lairHistory(lair, turn, 'destroyed', o.reason || 'destroyed');
  return lair;
}

// Reveal a dynamic-pool lair into a hex (the JJ p.195 dynamic lair, §12.5(b) / D5): bind hexId,
// flip status:'dynamic' → 'active', record establishedBy:'dynamic-reveal'. opts.knownToPlayers sets
// discovery (when the party found it on the roll). Returns the lair (or null). Refuses a non-dynamic
// lair (use the other setters for those).
function revealDynamicLair(campaign, lairId, hexId, opts){
  const lair = findLair(campaign, lairId);
  if(!lair || !hexId) return null;
  if(lair.status !== 'dynamic') return lair;  // only pooled dynamic lairs are revealed
  const o = opts || {};
  const turn = (o.atTurn === undefined) ? (campaign.currentTurn || null) : o.atTurn;
  lair.hexId = hexId;
  lair.status = 'active';
  lair.establishedBy = 'dynamic-reveal';
  lair.establishedAtTurn = turn || lair.establishedAtTurn;
  if(o.knownToPlayers === true) lair.knownToPlayers = true;
  // The lair's population moves with it: a pool lair generated while unplaced has its bound Groups
  // (and any GM-authored leader Characters) at currentHexId:null — bind them to the revealed hex.
  for(const g of _lairBoundGroups(campaign, lair)) g.currentHexId = hexId;
  if(Array.isArray(lair.leaderCharacterIds) && Array.isArray(campaign && campaign.characters)){
    for(const cid of lair.leaderCharacterIds){
      const ch = campaign.characters.find(c => c && c.id === cid);
      if(ch) ch.currentHexId = hexId;
    }
  }
  _lairHistory(lair, turn, 'revealed', o.reason || 'dynamic-reveal', { hexId: hexId });
  return lair;
}

// --- M3 catalog-gated generation (Plan §5.3) --------------------------------
// generateLair is the SHARED generation primitive: the M3 collision consumer calls it for a fresh
// lair, the Lair Wizard "Generate from catalog" mode calls it on demand, and revealing an 'unknown'
// seeded shell or a 'dynamic' pool lair populates it via opts.lairId. It rolls the RAW lair
// population (numberAppearing.lair) into a Group bound to the lair (the structured-population model,
// flat-count for v1 — Plan §3.3) and records the Treasure Type from the catalog. NB: full hoard
// CONTENTS materialization (stash + monster-hoard custody + Notable-item promotion, Plan §3.4) is
// DEFERRED to a treasure-generation wave that consumes the Treasure-Type tables (Treasure_Tome
// survey) — v1 records lair.treasureType so the hoard can be rolled later.

// Roll an "XdY±Z" (or plain integer) dice string. rng injectable. Clamped ≥0.
function _rollDiceStr(s, rng){
  const r = rng || Math.random;
  const str = String(s == null ? '' : s).trim();
  if(/^\d+$/.test(str)) return parseInt(str, 10);
  const m = str.match(/^(\d*)d(\d+)\s*([+\-]\s*\d+)?$/i);
  if(!m){ const n = parseInt(str, 10); return isNaN(n) ? 0 : n; }
  const n = m[1] ? parseInt(m[1], 10) : 1, d = parseInt(m[2], 10), mod = m[3] ? parseInt(m[3].replace(/\s+/g, ''), 10) : 0;
  let t = mod; for(let i = 0; i < n; i++) t += 1 + Math.floor(r() * d);
  return Math.max(0, t);
}

// Generate (or populate) a lair from the MONSTER_CATALOG. opts: { monsterCatalogKey, hexId, lairId?,
// establishedBy?, count?, atTurn?, knownToPlayers?, name?, reason? }. With lairId, populates an
// existing lair (e.g. a revealed dynamic/unknown shell); else creates a fresh active lair. Returns
// { lair, group, entry, count } (entry null + group null when the key isn't in the catalog — the
// lair shell is still returned so the GM can author it via the Inspector).
function generateLair(campaign, opts, rng){
  if(!campaign || typeof campaign !== 'object') return null;
  const o = Object.assign({}, opts || {});
  const r = rng || Math.random;
  const turn = (o.atTurn === undefined) ? (campaign.currentTurn || 1) : o.atTurn;
  const entry = global.ACKS.findMonster ? global.ACKS.findMonster(o.monsterCatalogKey) : null;

  // get-or-create the lair. Populating an 'unknown' (placed) shell activates it; a 'dynamic' pool
  // lair STAYS dynamic — populated-but-unplaced (the pre-rolled JJ p.195 drop-in) — until
  // revealDynamicLair binds it to a hex (which also moves its population there).
  let lair;
  if(o.lairId){
    lair = findLair(campaign, o.lairId);
    if(!lair) return null;
    if(o.hexId) lair.hexId = o.hexId;
    if(lair.status === 'unknown') lair.status = 'active';
    if(o.knownToPlayers === true) lair.knownToPlayers = true;
  } else {
    lair = createLair(campaign, {
      hexId: o.hexId || null,
      monsterCatalogKey: o.monsterCatalogKey || '',
      status: 'active',
      establishedBy: o.establishedBy || 'gm-fiat',
      establishedAtTurn: turn,
      knownToPlayers: o.knownToPlayers === true,
      name: o.name || (entry ? entry.name + ' lair' : '')
    });
  }
  if(!lair) return null;

  // record catalog identity + treasure type (hoard contents deferred — see header)
  if(entry){
    lair.monsterCatalogKey = entry.key;
    if(lair.lairPct == null) lair.lairPct = entry.lairPct;
    if(!lair.treasureType) lair.treasureType = entry.treasureType || '';
    if(!(lair.name || '').trim()) lair.name = entry.name + ' lair';   // a populated seeded shell gets the same default name as the fresh path
  }

  // roll the population into a bound Group
  let group = null, count = 0;
  if(entry){
    count = (o.count != null) ? o.count
          : Math.max(1, _rollDiceStr((entry.numberAppearing && (entry.numberAppearing.lair || entry.numberAppearing.wandering)) || '1', r));
    if(!Array.isArray(campaign.groups)) campaign.groups = [];
    group = global.ACKS.blankGroup({
      name: entry.name,
      groupTemplate: { monsterCatalogKey: entry.key, creatureTypes: (entry.creatureTypes || []).slice(), hitDice: entry.hd || null },
      count: count,
      currentHexId: lair.hexId || null,
      socialTier: 'independent',
      lifecycleState: 'wild'
    });
    campaign.groups.push(group);
    if(!Array.isArray(lair.groupIds)) lair.groupIds = [];
    lair.groupIds.push(group.id);
    lair.totalInhabitantCount = lairInhabitantCount(campaign, lair);
  }

  _lairHistory(lair, turn, 'generated', o.reason || (entry ? 'catalog:' + entry.key : 'no-catalog-entry'),
    { monsterCatalogKey: o.monsterCatalogKey || (entry && entry.key) || null, count: count, treasureType: lair.treasureType || '' });
  return { lair: lair, group: group, entry: entry, count: count };
}

// Pool-first encounter selector (Plan §5.2 / D5) — PURE. Given an encounter has fired at a hex,
// decide what it IS by consulting the per-hex POOL before any fresh generation: an existing ACTIVE
// lair populates the encounter (random pick if several — D5); else the hex's seeded-but-undetailed
// 'unknown' SHELLS surface as populate candidates (D4 — the seeded count IS the hex's placed pool,
// Plan §4/§5.2.3; a generateLair {lairId} call fleshes the one the GM picks); else a pooled
// 'dynamic' lair may be revealed into the hex; else it's a fresh roll (the seam Phase 3 #141 /
// a generateLair call fills). Returns a proposal { source:'existing-lair'|'seeded-shell'|
// 'dynamic-pool'|'fresh', hexId, lair?, lairId?, contents?, candidates?, encounterKind?,
// fragment? }; NEVER mutates — the caller (the journey encounter, the GM, or a future all-actor
// slot-80 consumer with the territory-class probability, M8/Vagaries) acts on it.
//
// M4 lair-vs-wandering (RAW, MM p.15 / survey §16.3): meeting the monsters of a lair'd hex is
// usually a WANDERING FRAGMENT of the lair population away from home (no hoard, lair not located),
// and only Lair-% of the time the lair itself. When the picked lair carries a usable lairPct
// (0 < pct < 100) the proposal rolls 1d100: ≤ pct → encounterKind 'at-lair'; > → 'wandering-fragment'
// with a suggested fragment size (the catalog's numberAppearing.wandering when resolvable). A
// fragment encounter is the track-home hook (§6.2): the lair exists but stays undiscovered until
// tracked/searched. No usable pct (null / 0 / ≥100 / GM-authored bare lair) → 'at-lair' (the
// pre-M4 behaviour). rng draws stay deterministic under a seeded preview (same stream → same day).
function lairEncounterProposal(campaign, hexId, opts){
  const o = opts || {};
  const r = o.rng || Math.random;
  const atHex = lairsAtHex(campaign, hexId) || [];
  const here = atHex.filter(l => l && l.status === 'active');
  if(here.length){
    const lair = here.length === 1 ? here[0] : here[Math.floor(r() * here.length)];
    // The lair's own lairPct wins; a GM-authored lair without one falls back to the catalog's
    // (the monster's nature). Pin lairPct:100 on the lair to mean "they're always at home."
    const entry = (typeof global.ACKS.findMonster === 'function') ? global.ACKS.findMonster(lair.monsterCatalogKey) : null;
    const pct = (typeof lair.lairPct === 'number') ? lair.lairPct : ((entry && typeof entry.lairPct === 'number') ? entry.lairPct : null);
    let encounterKind = 'at-lair', fragment = null;
    if(pct != null && pct > 0 && pct < 100){
      const d100 = 1 + Math.floor(r() * 100);
      if(d100 > pct){
        encounterKind = 'wandering-fragment';
        const spec = entry && entry.numberAppearing && entry.numberAppearing.wandering;
        const alive = lairInhabitantCount(campaign, lair);
        let count = spec ? _rollDiceStr(spec, r) : null;
        if(count != null && alive > 0) count = Math.max(1, Math.min(count, alive));  // a fragment can't outnumber the lair's living population
        fragment = { count: count };
      }
    }
    return {
      source: 'existing-lair', hexId: hexId, lairId: lair.id, lair: lair,
      encounterKind: encounterKind, fragment: fragment,
      contents: {
        monsterCatalogKey: lair.monsterCatalogKey || '',
        groupIds: (lair.groupIds || []).slice(),
        totalInhabitantCount: lairInhabitantCount(campaign, lair),
        treasureType: lair.treasureType || '',
        knownToPlayers: !!lair.knownToPlayers
      }
    };
  }
  if(o.includeSeededShells !== false){
    const shells = atHex.filter(l => l && l.status === 'unknown');
    if(shells.length) return { source: 'seeded-shell', hexId: hexId, candidates: shells.slice() };
  }
  if(o.includeDynamicPool !== false){
    const pool = (Array.isArray(campaign && campaign.lairs) ? campaign.lairs : []).filter(l => l && l.status === 'dynamic' && !l.hexId);
    if(pool.length) return { source: 'dynamic-pool', hexId: hexId, candidates: pool.slice() };
  }
  return { source: 'fresh', hexId: hexId };
}

// --- D4 hex-density seeding (JJ p.69; Plan §4) -------------------------------
// The COUNT half of RAW wilderness stocking (catalog-free). lairDiceForTerrain maps a hex's terrain
// → the LAIRS_PER_HEX dice spec (alias-normalized); rollLairCount rolls it; seedHexLairs creates that
// many empty status:'unknown' shells the GM then fleshes (Lair Wizard / Inspector) or the catalog
// populates (M2/M3). Seeding is OPT-IN — never auto-called — and only UNSETTLED hexes seed (a domain
// hex seeds none unless forced; securing clears lairs, RR p.338).

// Roll a lair-count dice spec {n,d,mod}; clamped to ≥0 (steppe 1d3−1 can roll 0). rng injectable.
function rollLairCount(spec, rng){
  if(!spec || !spec.d || !spec.n) return 0;
  const r = rng || Math.random;
  let total = spec.mod || 0;
  for(let i=0;i<spec.n;i++) total += 1 + Math.floor(r()*spec.d);
  return Math.max(0, total);
}

// Resolve a terrain value → { key, spec:{n,d,mod}, label } from LAIRS_PER_HEX (alias-normalized),
// or null for unknown terrain. 'water' resolves to a zero spec (no land lairs). Catalog-sourced, so
// it reads through global.ACKS (set by acks-engine-catalogs.js, which loads first).
function lairDiceForTerrain(terrain){
  const T = global.ACKS.LAIRS_PER_HEX || {};
  const ALIAS = global.ACKS.LAIR_TERRAIN_ALIAS || {};
  let key = String(terrain || '').toLowerCase().trim();
  if(!key) return null;
  if(!(key in T) && (key in ALIAS)) key = ALIAS[key];
  const spec = T[key];
  if(!spec) return null;
  const label = (typeof global.ACKS.lairDiceLabel === 'function') ? global.ACKS.lairDiceLabel(spec) : '';
  return { key: key, spec: spec, label: label };
}

// lairDiceForHex(hex) — the SUB-TYPE-aware lair dice (Phase_2.5_Terrain_Model_Plan.md). Composes the
// hex's (terrain, terrainSubtype) into the LAIRS_PER_HEX key (JJ p.69). Every sub-type of a RAW-SPLIT
// base (desert/grassland/hills/mountains/scrubland) now has its own explicit row, so it resolves to its
// exact RAW count; the fallback to the bare base only fires for a RAW "(any)" base (barrens/forest/swamp
// — one value for all sub-types) or a hex with no sub-type set. Closes the M1 coarse-default gap: a hex
// that carries a sub-type seeds the RAW-correct density (forested mountain 2d4 vs rocky/snowy 1d4+1).
function lairDiceForHex(hex){
  if(!hex) return null;
  const base = (global.ACKS.terrainBase ? global.ACKS.terrainBase(hex.terrain) : String(hex.terrain || '').toLowerCase().trim());
  if(!base) return null;
  let sub = String(hex.terrainSubtype || '').toLowerCase().trim();
  if(sub === 'low') sub = 'sparse';   // RAW "low, sparse" synonyms; LAIRS_PER_HEX keys it 'scrubland-sparse'
  return (sub && lairDiceForTerrain(base + '-' + sub)) || lairDiceForTerrain(base);
}

// Seed a hex's wilderness lairs (D4). Rolls the terrain count and creates that many empty
// status:'unknown' shells (establishedBy:'hex-seeding'). OPT-IN — callers invoke it explicitly
// (a button / wizard mode), never on bulk map generation. Returns the created lairs ([] if the
// hex is missing, belongs to a domain (RAW: domain hexes seed none) without opts.force, has
// unknown terrain, or the count rolls 0). opts: { count? (override the roll), rng?, atTurn?,
// terrain? (override hex.terrain), force? (seed a domain hex anyway) }.
function seedHexLairs(campaign, hexId, opts){
  if(!campaign) return [];
  const o = opts || {};
  const hex = Array.isArray(campaign.hexes) ? campaign.hexes.find(h => h && h.id === hexId) : null;
  if(!hex) return [];
  if(hex.domainId && !o.force) return [];                 // RAW: settled (domain) hexes seed none
  // Sub-type-aware (T1): default reads the hex's full (terrain, terrainSubtype); an explicit
  // opts.terrain override stays the string path. Falls back to the bare terrain if neither resolves.
  const dice = o.terrain ? lairDiceForTerrain(o.terrain) : (lairDiceForHex(hex) || lairDiceForTerrain(hex.terrain));
  if(!dice) return [];
  const count = (o.count !== undefined) ? Math.max(0, o.count|0) : rollLairCount(dice.spec, o.rng);
  const turn = (o.atTurn === undefined) ? (campaign.currentTurn || 1) : o.atTurn;
  const out = [];
  for(let i=0; i<count; i++){
    out.push(createLair(campaign, {
      status: 'unknown',
      hexId: hex.id,
      terrain: dice.key,
      establishedBy: 'hex-seeding',
      establishedAtTurn: turn,
      createReason: 'hex-seeding'
    }));
  }
  return out;
}

// --- §6.3 securing consequence (RR p.338 + p.277; Plan M4) --------------------
// The lairs standing in the way of securing a hex for settlement: every still-live lair record —
// 'active' (inhabited) or 'unknown' (seeded/undetailed; RAW: an UNdiscovered hostile lair "will
// almost certainly disrupt settlement"). Cleared / abandoned / destroyed structures don't block;
// an unplaced 'dynamic' pool entry isn't in any hex. Pure read — the hex card surfaces it now;
// Domain Completion DC-0 consumes it as the securing gate. (Whether a specific harmless lair —
// the RAW lammasu — blocks stays GM judgment: clear it, or mark it cleared/abandoned.)
function hexSecuringBlockers(campaign, hexId){
  return (lairsAtHex(campaign, hexId) || []).filter(l => l && (l.status === 'active' || l.status === 'unknown'));
}

// --- E9 maximum lairs per hex (JJ p.69) ---------------------------------------
// "The maximum number of lairs that theoretically could be present": civilized 33% /
// borderlands 50% / outlands 66% of the unsettled amount; a domainless hex's ceiling is
// the amount itself. The unsettled amount = the terrain's lair-dice MAXIMUM (deterministic
// — a cap can't be a die roll); 🔧 rounding = NEAREST (the printed 33%/66% are ⅓/⅔ —
// civilized grassland 3 × 33% must read 1, not floor's 0). SETTLING monsters respect the
// cap ("it is simply too crowded for them" — they move to another hex): the E3a settle
// offer refuses `hex-full` and an E6 wander-entry never lingers at a full hex. The count
// is LIVING dens (active + unknown shells; cleared / abandoned / destroyed structures are
// vacant real estate, an unplaced dynamic lair sits in no hex). DISCOVERY stays ungated
// (an E4 in-lair verdict / a tracked band's founded den reveal what was already there),
// and GM authoring (Lair Wizard / createLair / Inspector / forced seeding) stays sovereign
// — the cap governs the world's own settlement, not the Judge. Returns null when no lair
// dice resolve (unknown terrain — no cap defined, nothing gates); water's zero dice read
// max 0 (v1: no land lairs in open ocean).

// The maximum of a lair-count dice spec {n,d,mod}, clamped ≥0: 1d4+1 → 5, 2d8 → 16, 1d3−1 → 2.
function lairDiceMax(spec){
  if(!spec || !spec.d || !spec.n) return 0;
  return Math.max(0, (spec.n * spec.d) + (spec.mod || 0));
}

function hexLairCapacity(campaign, hexId){
  if(!campaign) return null;
  const hex = Array.isArray(campaign.hexes) ? campaign.hexes.find(h => h && h.id === hexId) : null;
  if(!hex) return null;
  const dice = lairDiceForHex(hex) || lairDiceForTerrain(hex.terrain);
  if(!dice) return null;                               // unknown terrain — no cap defined
  const A = global.ACKS || {};
  const territoryClass = (typeof A.territoryClassForHex === 'function') ? A.territoryClassForHex(campaign, hex) : 'unsettled';
  const PCT = A.LAIR_CAP_PCT_BY_TERRITORY || {};
  const pct = (typeof PCT[territoryClass] === 'number') ? PCT[territoryClass] : 1.0;
  const diceMax = lairDiceMax(dice.spec);
  const max = Math.round(diceMax * pct);
  const count = (lairsAtHex(campaign, hexId) || []).filter(l => l && (l.status === 'active' || l.status === 'unknown')).length;
  return { count, max, full: count >= max, territoryClass, pct, diceStr: dice.label, diceMax, terrainKey: dice.key };
}

// =============================================================================
// #476 ENCOUNTER LAYER (E1) — the Encounter entity + the draw seam (D8–D12).
// An encounter is a reified COMMITTED INTERACTION between two sides (Architecture
// §3.13's third worked application): the multi-day influence ladder, the stored
// intimidation roll, and the pursuit phase are state with no other home. The RAW
// catalogs + pure resolvers live in acks-engine-catalogs.js; the GM-facing step
// verbs (which emit events) in acks-engine-events.js; the triggers (journey hex-
// entry, search-hour, rest-night) in their owning modules. Resolved encounters
// persist as world memory (D9 derives prior attitude from them at E2).
// =============================================================================

// --- Lookups (pure) -----------------------------------------------------------
function findEncounter(campaign, encounterId){
  return ((campaign && campaign.encounters) || []).find(e => e && e.id === encounterId) || null;
}
function encountersAtHex(campaign, hexId){
  return ((campaign && campaign.encounters) || []).filter(e => e && e.hexId === hexId);
}
function activeEncounters(campaign){
  return ((campaign && campaign.encounters) || []).filter(e => e && e.status === 'active');
}
function encounterDisplayName(campaign, enc){
  if(!enc) return '';
  if(enc.name) return enc.name;
  const mk = enc.monsterSide && enc.monsterSide.monsterCatalogKey;
  const mName = mk && global.ACKS && typeof global.ACKS.monsterDisplayName === 'function'
    ? global.ACKS.monsterDisplayName(mk) : (mk || '');
  const what = mName || (enc.category === 'civilized' ? 'civilized encounter'
    : enc.category === 'monster' ? 'monster encounter' : 'encounter');
  return what + (enc.hexId ? ' at ' + enc.hexId : '');
}
// priorReactionBetween — D9: prior attitude is DERIVED from encounter history, never
// stored on Lair/Group. "The same monsters" = the same lair binding OR an overlapping
// bound Group (a bare catalog key is deliberately NOT identity — any goblin is not THIS
// goblin band); "the same party" = the same party id OR any overlapping character (so
// the memory follows the people across re-formed parties). Returns the most recent
// RESOLVED prior meeting (the subject itself + no-encounter non-meetings excluded)
// with its last standing attitude — or null when these sides have never met.
function priorReactionBetween(campaign, encounter){
  if(!campaign) return null;
  const enc = (typeof encounter === 'string') ? findEncounter(campaign, encounter) : encounter;
  if(!enc) return null;
  const ms0 = enc.monsterSide || {};
  const myLair = ms0.lairId || null;
  const myGroups = ms0.groupIds || [];
  // E4m — a side bound to a pursuing band carries the chase encounter's id: the chase
  // itself IS a prior meeting with that band (the sprung caught-encounter recalls the
  // evade it sprang from), and two meetings referencing the same chase are the same band.
  const myPursuit = ms0.pursuitEncounterId || null;
  if(!myLair && !myGroups.length && !myPursuit) return null;     // unbound fresh monsters — no identity to remember
  const ps0 = enc.partySide || {};
  const myParty = ps0.partyId || null;
  const myChars = ps0.characterIds || [];
  const when = e => ((e.resolvedAtTurn || e.occurredAtTurn || 0) * 100) + (e.resolvedOnDayInMonth || e.occurredOnDayInMonth || 0);
  let best = null;
  for(const e of (campaign.encounters || [])){
    if(!e || e.id === enc.id || e.status !== 'resolved' || e.outcome === 'no-encounter') continue;
    const ms = e.monsterSide || {};
    if(!((myLair && ms.lairId === myLair) || (ms.groupIds || []).some(g => myGroups.includes(g))
         || (myPursuit && (e.id === myPursuit || ms.pursuitEncounterId === myPursuit)))) continue;
    const ps = e.partySide || {};
    if(!((myParty && ps.partyId === myParty) || (ps.characterIds || []).some(c => myChars.includes(c)))) continue;
    if(!best || when(e) >= when(best)) best = e;   // latest wins; array order breaks ties
  }
  if(!best) return null;
  return {
    encounterId: best.id, encounter: best,
    outcome: best.outcome,
    reaction: (best.reaction && best.reaction.current) || null,
    atTurn: best.resolvedAtTurn || best.occurredAtTurn || null,
    onDayInMonth: best.resolvedOnDayInMonth || best.occurredOnDayInMonth || null
  };
}

// --- Creation + resolution (state-only; event emission lives in events.js) ----
// createEncounter — the bare constructor + collection push + history stamp. Most
// callers want createEncounterFromDraw (below), which fills the sides from a draw.
function createEncounter(campaign, opts){
  if(!campaign) return null;
  const o = opts || {};
  if(!Array.isArray(campaign.encounters)) campaign.encounters = [];
  if(o.id){
    const existing = findEncounter(campaign, o.id);
    if(existing) return existing;                       // idempotent on an explicit id (commit replays)
  }
  const enc = global.ACKS.blankEncounter(Object.assign({
    occurredAtTurn: campaign.currentTurn || 1,
    occurredOnDayInMonth: campaign.currentDayInMonth || null
  }, o));
  enc.history.push({ turn: enc.occurredAtTurn, type: 'created', reason: o.createReason || enc.trigger || 'gm-authored' });
  campaign.encounters.push(enc);
  return enc;
}
// resolveEncounter — flip to resolved with an outcome (idempotent). Outcomes:
// no-encounter | evaded | parleyed | dispersed | combat | settled-as-lair | dismissed.
// 'combat' records "GM resolves" until #141; 'settled-as-lair' is E3's linger branch.
function resolveEncounter(campaign, encounterId, outcome, opts){
  const enc = findEncounter(campaign, encounterId);
  if(!enc) return null;
  const o = opts || {};
  if(enc.status === 'resolved') return enc;             // idempotent
  enc.status = 'resolved';
  enc.outcome = outcome || enc.outcome || 'dismissed';
  enc.resolvedAtTurn = (o.atTurn === undefined) ? (campaign.currentTurn || 1) : o.atTurn;
  enc.resolvedOnDayInMonth = (o.onDayInMonth === undefined) ? (campaign.currentDayInMonth || null) : o.onDayInMonth;
  if(o.resolvedByEventId) enc.resolvedByEventId = o.resolvedByEventId;
  enc.history.push({ turn: enc.resolvedAtTurn, type: 'resolved', reason: enc.outcome, note: o.note || '' });
  return enc;
}

// --- The identity roll + the RAW 6a lair binding (E4, revising D12) -------------

// Resolve a hex (or a sparse-route override) to the identity-table inputs and roll the
// JJ 1d100. Returns the identity {natural, label, key, tableKey|columnKey, rarity, page}
// or null when no table maps (water, unknown terrain, tables module absent).
function _drawIdentityForHex(campaign, hexId, ctx, category, rarity, rng){
  const A = global.ACKS;
  if(typeof A.rollEncounterIdentity !== 'function') return null;
  const hex = hexId && Array.isArray(campaign && campaign.hexes) ? campaign.hexes.find(h => h && h.id === hexId) : null;
  const tKey = ctx.terrainKey || (hex && typeof A.terrainKey === 'function' ? A.terrainKey(hex) : null);
  if(!tKey) return null;
  const hasRiver = (ctx.hasRiver !== undefined) ? !!ctx.hasRiver
    : !!(hex && Array.isArray(hex.riverSides) && hex.riverSides.length);
  return A.rollEncounterIdentity({ terrainKey: tKey, hasRiver: hasRiver, category: category, rarity: rarity, rng: rng });
}

// E4m — the world's loose monster bands (derived, never stored): the bands ABROAD that a
// wandering draw can meet — the pool-first principle extended off the lair map (Joachim
// 2026-06-11: "a wandering group that is pursuing someone should be eligible to be found
// by a third party on the same hex — the mechanic like a pre-existing lair being found").
// Two kinds:
//   • pursuer — an active chase (phase 'pursuit', offered|pursuing): the band IS the chase
//     encounter's monster side, placed at the trail's anchor hex (🔧 v1 — the chase model is
//     straight-line; the band itself trails by gapMiles within the hex's reach).
//   • migrant — a living Group housed by no living lair (an abandoned den's survivors, or a
//     free-authored band) standing at its currentHexId. A group bound to an active chase
//     reads as the pursuer row, never twice.
// The ONE derivation both consumers read: the 6a binding (who answers a wandering verdict)
// and the 🐉 Monsters Groups table (what roams the world). Rows carry monsterKey (catalog-
// resolved so aliases fold), the living count, the hex, and the refs the binding records.
function looseMonsterBands(campaign){
  const A = global.ACKS;
  const rows = [];
  if(!campaign) return rows;
  const LIVING = { active: 1, unknown: 1, dynamic: 1 };
  const settled = new Set(), deadHome = {};
  for(const l of (campaign.lairs || [])){
    if(!l) continue;
    for(const gid of (l.groupIds || [])){ if(LIVING[l.status]) settled.add(gid); else if(!(gid in deadHome)) deadHome[gid] = l.id; }
  }
  const chasing = new Set();
  for(const e of (campaign.encounters || [])){
    const p = e && e.pursuit;
    if(!e || e.status !== 'active' || e.phase !== 'pursuit' || !p || p.direction === 'party' || (p.status !== 'offered' && p.status !== 'pursuing')) continue;
    const ms = e.monsterSide || {};
    for(const gid of (ms.groupIds || [])) chasing.add(gid);
    const entry = (ms.monsterCatalogKey && typeof A.findMonster === 'function') ? A.findMonster(ms.monsterCatalogKey) : null;
    rows.push({
      kind: 'pursuer', encounterId: e.id,
      monsterKey: entry ? entry.key : ((ms.monsterCatalogKey) || null),
      label: p.pursuerLabel || ms.label || (entry && entry.name) || '',
      count: (ms.count != null) ? ms.count : null,
      hexId: p.lastPartyHexId || e.hexId || null,
      groupIds: (ms.groupIds || []).slice(),
      lairId: ms.lairId || null,
      pursuitStatus: p.status, gapMiles: (p.gapMiles == null ? null : p.gapMiles),
      quarry: { partyId: (e.partySide && e.partySide.partyId) || null,
                characterIds: ((e.partySide && e.partySide.characterIds) || []).slice() }
    });
  }
  // E5 — a band being TRACKED is abroad too: a definite entity at its trail-head hex, met
  // as itself by anyone else's wandering draw (its own trackers excluded — the catch owns
  // that meeting). A tracked migrant Group reads as the tracked row, never twice.
  const tracked = new Set();
  for(const e of (campaign.encounters || [])){
    const p = e && e.pursuit;
    if(!e || !p || p.direction !== 'party' || p.status !== 'tracking') continue;
    const ms = e.monsterSide || {};
    const q = p.quarry || {};
    if(q.groupId) tracked.add(q.groupId);
    const entry = (ms.monsterCatalogKey && typeof A.findMonster === 'function') ? A.findMonster(ms.monsterCatalogKey) : null;
    rows.push({
      kind: 'tracked', encounterId: e.id,
      monsterKey: entry ? entry.key : ((ms.monsterCatalogKey) || null),
      label: p.quarryLabel || ms.label || (entry && entry.name) || '',
      count: (p.countTracked != null && p.countTracked !== 0) ? p.countTracked : ((ms.count != null) ? ms.count : null),
      hexId: q.hexId || null,
      groupIds: q.groupId ? [q.groupId] : (ms.groupIds || []).slice(),
      lairId: ms.lairId || null,
      quarryCoord: q.coord ? { q: q.coord.q, r: q.coord.r } : null,
      halted: !!q.halted,
      trackedBy: { characterId: p.trackerCharacterId || null, partyId: p.trackerPartyId || null,
                   name: p.trackerName || '', journeyId: p.journeyId || null }
    });
  }
  for(const g of (campaign.groups || [])){
    if(!g || settled.has(g.id) || chasing.has(g.id) || tracked.has(g.id)) continue;
    const alive = (typeof groupActiveCount === 'function') ? ACKS.groupActiveCount(g) : Math.max(0, (g.count || 0) - (g.casualties || 0));
    if(alive <= 0) continue;
    const tpl = g.groupTemplate || {};
    const entry = (tpl.monsterCatalogKey && typeof A.findMonster === 'function') ? A.findMonster(tpl.monsterCatalogKey) : null;
    const ws = g.wanderState || null;
    // E10 — a morale-banditry band (RR pp.350–351): the domain's OWN disaffected men,
    // raiding within their domain. Its own roster kind — the band consumer fences its
    // wander to the domain, it never dens or heads home, and the 6a abroad verdict binds
    // it as 'banditry-band'. Takes precedence over any (defensive) homing state.
    if(g.banditryDomainId){
      const dom = (campaign.domains || []).find(d => d && d.id === g.banditryDomainId);
      rows.push({
        kind: 'banditry', groupId: g.id,
        monsterKey: entry ? entry.key : ((tpl.monsterCatalogKey) || null),
        label: g.name || (entry && entry.name) || '',
        count: alive,
        hexId: g.currentHexId || null,
        groupIds: [g.id],
        lairId: null,
        banditryDomainId: g.banditryDomainId,
        banditryDomainName: (dom && dom.name) || null,
        halted: !!(ws && ws.halted)
      });
      continue;
    }
    // E6 — a post-chase band walking back to its den (pursuitAftermath set the state):
    // its own roster kind, carrying the den ref so a chase sprung from MEETING it re-homes.
    if(ws && ws.mode === 'heading-home' && ws.destLairId){
      rows.push({
        kind: 'homing', groupId: g.id,
        monsterKey: entry ? entry.key : ((tpl.monsterCatalogKey) || null),
        label: g.name || (entry && entry.name) || '',
        count: alive,
        hexId: g.currentHexId || null,
        groupIds: [g.id],
        lairId: ws.destLairId,
        destLairId: ws.destLairId
      });
      continue;
    }
    rows.push({
      kind: 'migrant', groupId: g.id,
      monsterKey: entry ? entry.key : ((tpl.monsterCatalogKey) || null),
      label: g.name || (entry && entry.name) || '',
      count: alive,
      hexId: g.currentHexId || null,
      groupIds: [g.id],
      lairId: null,
      deadHomeLairId: deadHome[g.id] || null,
      halted: !!(ws && ws.halted),                 // E6 — the GM's parking lever (else it wanders)
      // W2 — a band that arrived as a DOMAIN ENCOUNTER carries its verdict (the Groups
      // table + the 6a binding label name the incursion; the band wanders/holds the same).
      incursion: g.incursion ? { domainId: g.incursion.domainId, attitude: g.incursion.attitude,
                                 disposition: g.incursion.disposition, rulerAware: g.incursion.rulerAware !== false } : null
    });
  }
  return rows;
}

// RAW JJ p.43 step 6a: once the table names the creature, roll against its MM Lair
// characteristic to decide whether the meeting is AT its lair or with creatures abroad —
// then bind the verdict to the world. An existing active den of that monster answers
// (the world remembers — D5 as written: "an existing lair populates a lair encounter");
// otherwise an in-lair result DETAILS one of the hex's seeded shells, or REVEALS a
// key-matched pooled dynamic lair (RAW's own parenthetical: "a dynamic lair can be used
// if one is available"), or — monster category only — MINTS a fresh den (the Judge's
// improvised lair, automated; 🔧 civilized folk "at home" with no den entity just count
// at lair size). A wandering result binds FIRST to a LOOSE BAND of that monster at the
// hex (E4m — a pursuing band or migrant Group is a definite entity; it beats the conjured
// fragment; the chase whose own quarry is drawing is excluded — meeting your pursuer is
// the chase's catch, not the table's), then where a den of that monster exists it is a
// FRAGMENT of it (MM p.15 — capped at the living population, no hoard, the lair unlocated).
// PURE — counts + picks pre-rolled into the returned intent; mutation happens at
// createEncounterFromDraw (the trigger's commit point). opts.partySide {partyId,
// characterIds} = the drawing group (the quarry exclusion).
function bindEncounterIdentity(campaign, hexId, identity, opts){
  const o = opts || {};
  const r = o.rng || Math.random;
  const A = global.ACKS;
  const entry = (identity && identity.key && typeof A.findMonster === 'function') ? A.findMonster(identity.key) : null;
  if(!entry) return { mode: 'wandering', inLair: false, lairRoll: null, lairPct: null, count: null };
  const pct = (typeof entry.lairPct === 'number') ? entry.lairPct : 0;
  const lairRoll = 1 + Math.floor(r() * 100);
  const inLair = pct > 0 && lairRoll <= pct;
  const atHex = hexId ? (lairsAtHex(campaign, hexId) || []) : [];
  const sameMonster = l => l && ((A.findMonster(l.monsterCatalogKey) || {}).key === entry.key);
  const densHere = atHex.filter(l => l && l.status === 'active' && sameMonster(l));
  const pick = list => list.length === 1 ? list[0] : list[Math.floor(r() * list.length)];
  const wanderSpec = (entry.numberAppearing && entry.numberAppearing.wandering) || '1';
  const lairSpec = (entry.numberAppearing && (entry.numberAppearing.lair || entry.numberAppearing.wandering)) || '1';
  if(inLair){
    if(densHere.length){
      const lair = pick(densHere);
      return { mode: 'existing-lair', inLair: true, lairRoll, lairPct: pct, lairId: lair.id, count: lairInhabitantCount(campaign, lair) || null };
    }
    const shells = atHex.filter(l => l && l.status === 'unknown');
    if(shells.length && hexId){
      const shell = pick(shells);
      return { mode: 'populate-shell', inLair: true, lairRoll, lairPct: pct, shellLairId: shell.id, count: Math.max(1, _rollDiceStr(lairSpec, r)) };
    }
    const dyn = (Array.isArray(campaign && campaign.lairs) ? campaign.lairs : []).filter(l => l && l.status === 'dynamic' && !l.hexId && sameMonster(l));
    if(dyn.length){
      const lair = pick(dyn);
      return { mode: 'reveal-dynamic', inLair: true, lairRoll, lairPct: pct, lairId: lair.id, count: lairInhabitantCount(campaign, lair) || null };
    }
    if((o.category || 'monster') === 'monster' && hexId)
      return { mode: 'fresh-lair', inLair: true, lairRoll, lairPct: pct, count: Math.max(1, _rollDiceStr(lairSpec, r)) };
    return { mode: 'wandering', inLair: true, lairRoll, lairPct: pct, count: Math.max(1, _rollDiceStr(lairSpec, r)) };
  }
  // E4m — a loose band of this monster standing at the hex answers the abroad verdict
  // first: the band met IS the known band (pursuer or migrant), not a conjured one.
  if(hexId){
    const me = (o.partySide || {});
    const myChars = me.characterIds || [];
    const bands = looseMonsterBands(campaign).filter(band => {
      if(band.hexId !== hexId || !band.monsterKey || band.monsterKey !== entry.key) return false;
      if(band.kind === 'pursuer'){
        const q = band.quarry || {};
        if(me.partyId && q.partyId && me.partyId === q.partyId) return false;
        if((q.characterIds || []).some(id => myChars.includes(id))) return false;
      }
      if(band.kind === 'tracked'){
        // E5 — the trackers never meet their own quarry through the table (the catch owns it).
        const tb = band.trackedBy || {};
        if(me.partyId && tb.partyId && me.partyId === tb.partyId) return false;
        if(tb.characterId && myChars.includes(tb.characterId)) return false;
      }
      return true;
    });
    if(bands.length){
      const band = pick(bands);
      return { mode: 'loose-band', inLair: false, lairRoll, lairPct: pct,
               bandKind: band.kind, encounterId: band.encounterId || null, groupId: band.groupId || null,
               lairId: band.lairId || null, count: (band.count != null) ? band.count : Math.max(1, _rollDiceStr(wanderSpec, r)) };
    }
  }
  if(densHere.length){
    const lair = pick(densHere);
    const alive = lairInhabitantCount(campaign, lair);
    let count = Math.max(1, _rollDiceStr(wanderSpec, r));
    if(alive > 0) count = Math.max(1, Math.min(count, alive));
    return { mode: 'fragment', inLair: false, lairRoll, lairPct: pct, lairId: lair.id, count };
  }
  return { mode: 'wandering', inLair: false, lairRoll: pct > 0 ? lairRoll : null, lairPct: pct, count: Math.max(1, _rollDiceStr(wanderSpec, r)) };
}

// --- The draw seam (§15.2; E4 lands the 1d100 identity tables, revising D12) ----
// encounterDraw(campaign, hexId, context) — ONE function, two identity regimes:
//   • TABLE-FIRST (the default — RAW JJ p.43 steps 4–6a, the travel + rest-night
//     procedure): the 1d20 category draw → monster rarity → the 1d100 identity table
//     for the hex's terrain → the Lair % binding (bindEncounterIdentity above). The
//     hex's lairs participate by MATCHING the rolled monster, not by overriding it.
//   • LAIR-FIRST (context.lairFirst — the RR p.276 search-hour: "stumbled onto one
//     of the lairs in the hex"): the M3 pool answers before any table —
//     lairEncounterProposal unchanged.
// Water / unknown terrain (no table) falls back to the pre-E4 pool-then-gm-pick fill.
// context: { road?, night?, resting?, knownRoute?, rng?, lairFirst?, includeDynamicPool?,
//            territoryClass?, terrainKey?, hasRiver? (sparse-route environment overrides),
//            partySide? {partyId, characterIds} (the drawing group — E4m quarry exclusion) }.
// PURE except rng consumption — no campaign mutation; triggers materialize entities
// from the returned draw at their commit point (createEncounterFromDraw).
function encounterDraw(campaign, hexId, context){
  const ctx = context || {};
  const rng = ctx.rng || Math.random;
  const A = global.ACKS;
  const hex = Array.isArray(campaign && campaign.hexes) ? campaign.hexes.find(h => h && h.id === hexId) : null;
  const territoryClass = ctx.territoryClass
    || (typeof A.territoryClassForHex === 'function' ? A.territoryClassForHex(campaign, hex) : 'unsettled');
  const cat = A.rollEncounterCategory({
    territoryClass, road: !!ctx.road, night: !!ctx.night,
    resting: !!ctx.resting, knownRoute: !!ctx.knownRoute, rng
  });
  const draw = {
    hexId: hexId || null, territoryClass, columnKey: cat.columnKey,
    category: cat.category, demoted: cat.demoted || null, rolls: cat.rolls,
    rarity: null, rarityRoll: null, identity: null, identityRoll: null, binding: null, proposal: null
  };
  // The pre-E4 pool-then-gm-pick fill — kept for the search path + unmappable terrain.
  const poolFill = () => {
    const prop = hexId ? lairEncounterProposal(campaign, hexId, { rng, includeDynamicPool: ctx.includeDynamicPool === true })
                       : { source: 'fresh', hexId: null };
    draw.proposal = prop;
    draw.identity = (prop && prop.source === 'existing-lair') ? 'pool' : 'gm-pick';
  };
  if(cat.category === 'monster'){
    const rar = A.rollEncounterRarity(territoryClass, rng);
    draw.rarity = rar.rarity; draw.rarityRoll = rar.roll;
    if(ctx.lairFirst){
      poolFill();
      // E4n — the hex held nothing to stumble onto (no active den, no seeded shell,
      // no pool candidate): the search-hour's meeting is an ordinary wandering
      // encounter, so the JJ tables name it exactly as the travel/rest draws do.
      // Lair-first PRECEDENCE stands (RR p.276) — only the empty-pool fallback
      // upgrades from the pre-E4 "GM identifies" fill.
      if(draw.proposal && draw.proposal.source === 'fresh'){
        const ident = _drawIdentityForHex(campaign, hexId, ctx, 'monster', rar.rarity, rng);
        if(ident){
          draw.proposal = null;
          draw.identityRoll = ident; draw.identity = 'table';
          draw.binding = bindEncounterIdentity(campaign, hexId, ident, { category: 'monster', rng, partySide: ctx.partySide });
        }
      }
    }
    else {
      const ident = _drawIdentityForHex(campaign, hexId, ctx, 'monster', rar.rarity, rng);
      if(ident){
        draw.identityRoll = ident; draw.identity = 'table';
        draw.binding = bindEncounterIdentity(campaign, hexId, ident, { category: 'monster', rng, partySide: ctx.partySide });
      } else poolFill();
    }
  } else if(cat.category === 'civilized'){
    const ident = _drawIdentityForHex(campaign, hexId, ctx, 'civilized', null, rng);
    if(ident){
      draw.identityRoll = ident; draw.identity = 'table';
      draw.binding = bindEncounterIdentity(campaign, hexId, ident, { category: 'civilized', rng, partySide: ctx.partySide });
    } else draw.identity = 'gm-pick';
  }
  return draw;
}

// --- Apply a 6a binding to a monster side (shared: creation + identity reroll) ---
// MUTATES the campaign for the lair-touching modes: populate-shell details a seeded
// shell (generateLair on it), reveal-dynamic places a pooled lair (RAW's parenthetical),
// fresh-lair mints the Judge's improvised den. Each stamps side.minted — the unwind
// receipt _unwindEncounterMinting reverses (day revert / identity reroll). The party
// meets an in-lair creature AT the den (RR 6c: the distance is to the lair), so a
// detailed/revealed/minted den lands knownToPlayers:true. A shell or pooled lair that
// changed since the preview (GM touched it) degrades to a fresh mint.
function _applyIdentityBinding(campaign, side, identity, binding, opts){
  const o = opts || {};
  const A = global.ACKS;
  const turn = (o.atTurn === undefined) ? ((campaign && campaign.currentTurn) || 1) : o.atTurn;
  side.identity = Object.assign({}, identity);
  side.binding = binding ? { mode: binding.mode, inLair: !!binding.inLair, lairRoll: (binding.lairRoll === undefined ? null : binding.lairRoll), lairPct: (binding.lairPct === undefined ? null : binding.lairPct) } : null;
  side.monsterCatalogKey = (identity && identity.key) || '';
  side.label = (identity && identity.label) || '';
  side.source = 'table';
  side.minted = null;
  side.pursuitEncounterId = null;   // E4m — a rebind away from a pursuing band drops the chase link
  const b = binding || { mode: 'wandering', count: null };
  const bindToLair = (lair, kind, count) => {
    side.lairId = lair.id;
    side.encounterKind = kind;
    side.groupIds = (lair.groupIds || []).slice();
    side.count = (count != null) ? count : (lairInhabitantCount(campaign, lair) || null);
  };
  const wanderingFallback = () => { side.lairId = null; side.groupIds = []; side.encounterKind = 'wandering'; side.count = (b.count == null ? null : b.count); };
  const freshMint = () => {
    if(!identity || !identity.key || !o.hexId){ wanderingFallback(); return; }
    const gen = generateLair(campaign, { hexId: o.hexId, monsterCatalogKey: identity.key, count: b.count,
                                         establishedBy: 'encounter-in-lair', knownToPlayers: true, atTurn: turn }, o.rng);
    if(gen && gen.lair){
      bindToLair(gen.lair, 'at-lair', b.count);
      side.minted = { mode: 'fresh-lair', lairId: gen.lair.id, groupId: gen.group ? gen.group.id : null };
    } else wanderingFallback();
  };
  if(b.mode === 'existing-lair' || b.mode === 'fragment'){
    const lair = findLair(campaign, b.lairId);
    if(lair){
      side.source = 'existing-lair';
      if(b.mode === 'fragment'){ side.lairId = lair.id; side.encounterKind = 'wandering-fragment'; side.count = b.count; }
      else bindToLair(lair, 'at-lair', b.count);
    } else wanderingFallback();
  } else if(b.mode === 'populate-shell'){
    const shell = findLair(campaign, b.shellLairId);
    if(shell && shell.status === 'unknown' && identity && identity.key){
      const prior = { status: shell.status, monsterCatalogKey: shell.monsterCatalogKey || '', treasureType: shell.treasureType || '',
                      name: shell.name || '', lairPct: (shell.lairPct === undefined ? null : shell.lairPct),
                      knownToPlayers: !!shell.knownToPlayers, groupIds: (shell.groupIds || []).slice(), historyLen: (shell.history || []).length };
      const gen = generateLair(campaign, { lairId: shell.id, monsterCatalogKey: identity.key, count: b.count,
                                           knownToPlayers: true, atTurn: turn }, o.rng);
      if(gen && gen.lair){
        bindToLair(gen.lair, 'at-lair', b.count);
        side.minted = { mode: 'populate-shell', lairId: gen.lair.id, groupId: gen.group ? gen.group.id : null, priorLair: prior };
      } else wanderingFallback();
    } else freshMint();
  } else if(b.mode === 'reveal-dynamic'){
    const lair = findLair(campaign, b.lairId);
    if(lair && lair.status === 'dynamic' && o.hexId){
      const priorGroups = _lairBoundGroups(campaign, lair).map(g => ({ groupId: g.id, hexId: g.currentHexId || null }));
      const priorLeaders = (lair.leaderCharacterIds || []).map(cid => {
        const ch = (campaign.characters || []).find(c => c && c.id === cid);
        return { characterId: cid, hexId: ch ? (ch.currentHexId || null) : null };
      });
      const prior = { establishedBy: lair.establishedBy || null, establishedAtTurn: lair.establishedAtTurn || null,
                      knownToPlayers: !!lair.knownToPlayers, historyLen: (lair.history || []).length,
                      groups: priorGroups, leaders: priorLeaders };
      revealDynamicLair(campaign, lair.id, o.hexId, { knownToPlayers: true, atTurn: turn, reason: 'encounter-in-lair' });
      bindToLair(lair, 'at-lair', b.count);
      side.minted = { mode: 'reveal-dynamic', lairId: lair.id, prior: prior };
    } else freshMint();
  } else if(b.mode === 'fresh-lair'){
    freshMint();
  } else if(b.mode === 'loose-band'){
    // E4m — the band met IS a known loose band: a pursuing band (the chase encounter's
    // monster side, linked via pursuitEncounterId so D9 recalls it and the chase can
    // reconcile on resolution) or a migrant Group. Nothing is minted — the identity
    // reroll re-binds freely, no unwind receipt. A stale ref (the GM resolved the chase
    // or the group died between propose and commit) degrades to a plain wandering band.
    let bound = false;
    if(b.bandKind === 'pursuer' && b.encounterId){
      const chase = findEncounter(campaign, b.encounterId);
      const pp = chase && chase.pursuit;
      if(chase && chase.status === 'active' && chase.monsterSide && pp && (pp.status === 'offered' || pp.status === 'pursuing')){
        const cms = chase.monsterSide;
        side.source = 'pursuing-band';
        side.pursuitEncounterId = chase.id;
        side.lairId = cms.lairId || null;          // a fragment-that-pursues keeps its den ref
        side.groupIds = (cms.groupIds || []).slice();
        side.encounterKind = 'wandering';
        side.count = (cms.count != null) ? cms.count : (b.count == null ? null : b.count);
        bound = true;
      }
    } else if(b.bandKind === 'migrant' && b.groupId){
      const g = (campaign.groups || []).find(x => x && x.id === b.groupId);
      const alive = g ? ((typeof groupActiveCount === 'function') ? ACKS.groupActiveCount(g) : Math.max(0, (g.count || 0) - (g.casualties || 0))) : 0;
      if(g && alive > 0){
        side.source = 'migrant-band';
        side.lairId = null;
        side.groupIds = [g.id];
        side.encounterKind = 'wandering';
        side.count = alive;
        bound = true;
      }
    } else if(b.bandKind === 'tracked' && b.encounterId){
      // E5 — the band met IS the quarry of someone else's follow: the tracked meeting's
      // monster side, linked via pursuitEncounterId so D9 recalls it (and a 'dispersed'
      // here ends the follow — the trail has no band left on it).
      const trk = findEncounter(campaign, b.encounterId);
      const tp = trk && trk.pursuit;
      if(trk && trk.monsterSide && tp && tp.direction === 'party' && tp.status === 'tracking'){
        const tms = trk.monsterSide;
        const qg = (tp.quarry && tp.quarry.groupId) || null;
        side.source = 'tracked-band';
        side.pursuitEncounterId = trk.id;
        side.lairId = tms.lairId || null;          // a banded fragment keeps its den ref
        side.groupIds = qg ? [qg] : (tms.groupIds || []).slice();
        side.encounterKind = 'wandering';
        side.count = (b.count != null) ? b.count : (tms.count != null ? tms.count : null);
        bound = true;
      }
    } else if(b.bandKind === 'homing' && b.groupId){
      // E6 — a post-chase band walking home: met as itself, the side keeping the DEN ref —
      // so a chase sprung from this meeting re-homes after it (the directive's "pick up a
      // new pursuit … and return home after that pursuit").
      const g = (campaign.groups || []).find(x => x && x.id === b.groupId);
      const alive = g ? ((typeof groupActiveCount === 'function') ? ACKS.groupActiveCount(g) : Math.max(0, (g.count || 0) - (g.casualties || 0))) : 0;
      if(g && alive > 0){
        side.source = 'homing-band';
        side.lairId = (g.wanderState && g.wanderState.destLairId) || b.lairId || null;
        side.groupIds = [g.id];
        side.encounterKind = 'wandering';
        side.count = alive;
        bound = true;
      }
    } else if(b.bandKind === 'banditry' && b.groupId){
      // E10 — a morale-banditry band (RR pp.350–351): met as itself, the side carrying the
      // plagued domain so the panel names whose men these are. No den ref — it never lairs;
      // the settle offer refuses 'banditry-band'.
      const g = (campaign.groups || []).find(x => x && x.id === b.groupId);
      const alive = g ? ((typeof groupActiveCount === 'function') ? ACKS.groupActiveCount(g) : Math.max(0, (g.count || 0) - (g.casualties || 0))) : 0;
      if(g && alive > 0){
        side.source = 'banditry-band';
        side.banditryDomainId = g.banditryDomainId || null;
        side.lairId = null;
        side.groupIds = [g.id];
        side.encounterKind = 'wandering';
        side.count = alive;
        bound = true;
      }
    }
    if(!bound) wanderingFallback();
  } else {
    wanderingFallback();
    if(b.inLair) side.encounterKind = 'wandering';   // civilized "at home" — no den entity (🔧), count at lair size
  }
  return side;
}

// Reverse what _applyIdentityBinding minted — the journey-day revert + the identity
// reroll/choose verbs. Surgical: a fresh den (+ its group) is removed; a detailed shell
// reverts to its pre-populate snapshot (created group dropped); a revealed pooled lair
// returns to the pool with its population un-placed.
function _unwindEncounterMinting(campaign, minted){
  if(!campaign || !minted) return;
  const lair = findLair(campaign, minted.lairId);
  if(minted.mode === 'fresh-lair'){
    if(Array.isArray(campaign.lairs)) campaign.lairs = campaign.lairs.filter(l => !(l && l.id === minted.lairId));
    if(minted.groupId && Array.isArray(campaign.groups)) campaign.groups = campaign.groups.filter(g => !(g && g.id === minted.groupId));
    return;
  }
  if(minted.mode === 'populate-shell' && lair && minted.priorLair){
    const p = minted.priorLair;
    const createdGroups = (lair.groupIds || []).filter(id => (p.groupIds || []).indexOf(id) < 0);
    lair.status = p.status; lair.monsterCatalogKey = p.monsterCatalogKey; lair.treasureType = p.treasureType;
    lair.name = p.name; lair.lairPct = p.lairPct; lair.knownToPlayers = p.knownToPlayers;
    lair.groupIds = (p.groupIds || []).slice();
    if(createdGroups.length && Array.isArray(campaign.groups)) campaign.groups = campaign.groups.filter(g => !(g && createdGroups.indexOf(g.id) >= 0));
    if(Array.isArray(lair.history) && typeof p.historyLen === 'number') lair.history.length = Math.min(lair.history.length, p.historyLen);
    return;
  }
  if(minted.mode === 'reveal-dynamic' && lair && minted.prior){
    const p = minted.prior;
    lair.status = 'dynamic'; lair.hexId = null;
    lair.establishedBy = p.establishedBy; lair.establishedAtTurn = p.establishedAtTurn; lair.knownToPlayers = p.knownToPlayers;
    for(const gp of (p.groups || [])){ const g = (campaign.groups || []).find(x => x && x.id === gp.groupId); if(g) g.currentHexId = gp.hexId; }
    for(const lp of (p.leaders || [])){ const ch = (campaign.characters || []).find(c => c && c.id === lp.characterId); if(ch) ch.currentHexId = lp.hexId; }
    if(Array.isArray(lair.history) && typeof p.historyLen === 'number') lair.history.length = Math.min(lair.history.length, p.historyLen);
  }
}

// --- Materialize an Encounter entity from a draw -------------------------------
// Called at a trigger's COMMIT point (journey day commit / search verb / rest-night
// consumer commit) — never during a pure propose pass. Only meeting categories
// (monster / civilized) become entities; terrain discoveries (dangerous / valuable /
// unique) have no sides and stay day-log notables. opts: { id? (stable preview id),
// trigger, partySide{}, light?, rng?, atTurn?, onDayInMonth? }.
function createEncounterFromDraw(campaign, draw, opts){
  if(!campaign || !draw) return null;
  if(draw.category !== 'monster' && draw.category !== 'civilized') return null;
  const o = opts || {};
  const A = global.ACKS;
  const monsterSide = { source: 'fresh', lairId: null, groupIds: [], monsterCatalogKey: '', count: null, encounterKind: null, label: '', identity: null, binding: null, minted: null, residentCharacterId: null, residentSettlementId: null, garrisonDomainId: null, garrisonUnitId: null, garrisonTroopTypeKey: null };
  const prop = draw.proposal;
  if(draw.identityRoll){
    // E4 — the table named the creature; the 6a binding rides the draw verbatim
    // (counts + picks pre-rolled with the trigger's seeded rng — preview byte-stable).
    _applyIdentityBinding(campaign, monsterSide, draw.identityRoll, draw.binding, {
      hexId: draw.hexId || null, atTurn: o.atTurn, rng: o.rng
    });
  } else if(prop && prop.source === 'existing-lair'){
    monsterSide.source = 'existing-lair';
    monsterSide.lairId = prop.lairId;
    monsterSide.monsterCatalogKey = (prop.contents && prop.contents.monsterCatalogKey) || '';
    monsterSide.encounterKind = prop.encounterKind || 'at-lair';
    if(prop.encounterKind === 'wandering-fragment'){
      monsterSide.count = (prop.fragment && prop.fragment.count) || null;
    } else {
      monsterSide.groupIds = (prop.contents && prop.contents.groupIds) ? prop.contents.groupIds.slice() : [];
      monsterSide.count = (prop.contents && prop.contents.totalInhabitantCount) || null;
    }
  } else if(prop && prop.source === 'seeded-shell'){
    monsterSide.source = 'seeded-shell';                // GM populates one of the hex's shells
  } else if(prop && prop.source === 'dynamic-pool'){
    monsterSide.source = 'dynamic';
  }
  // SD-5b — a CIVILIZED result near a settlement is grounded to the actual person who lives there
  // (the realized census, plan §8): merchant→venturer / patroller→fighter / pilgrim→crusader. The
  // census stops being a panel and becomes who you meet. Deterministic (the most-notable resident
  // of the bucket) → the preview + commit agree; GM-overridable on the entity. No nearby resident
  // of the profession → no grounding (the generic table label stands). Late-bound — demographics
  // loads after this module; the read is pure.
  if(draw.category === 'civilized' && monsterSide.monsterCatalogKey && typeof A.groundCivilizedEncounter === 'function'){
    const g = A.groundCivilizedEncounter(campaign, { hexId: draw.hexId || null, cellKey: monsterSide.monsterCatalogKey });
    if(g){ monsterSide.residentCharacterId = g.characterId; monsterSide.residentSettlementId = g.settlementId; }
  }
  // garrison-patrols (house rule, default OFF; MM p.226 + RR p.341): a "Man, Patroller" result
  // inside a modelled domain is drawn from that domain's ACTUAL garrison — the troop type best
  // suited to the hex terrain, capped at the garrison's strength. The source unit is recorded so
  // patrollers slain in the meeting subtract from the garrison (the resolution panel's casualty
  // control). The garrison reading supersedes the SD-5b census resident for patrollers. Late-bound
  // (acks-engine-patrols.js loads after this module); the read is pure.
  if(draw.category === 'civilized' && monsterSide.monsterCatalogKey === 'patroller'
     && typeof A.isHouseRuleEnabled === 'function' && A.isHouseRuleEnabled(campaign, 'garrison-patrols')
     && typeof A.groundPatrollerToGarrison === 'function'){
    const gp = A.groundPatrollerToGarrison(campaign, { hexId: draw.hexId || null, label: monsterSide.label });
    if(gp){
      monsterSide.garrisonDomainId = gp.domainId;
      monsterSide.garrisonUnitId = gp.unitId;
      monsterSide.garrisonTroopTypeKey = gp.troopTypeKey;
      monsterSide.label = 'Man, Patroller — ' + gp.troopLabel + ' (' + gp.domainName + ' garrison)';
      monsterSide.count = (monsterSide.count != null) ? Math.min(monsterSide.count, gp.availableCount) : gp.availableCount;
      monsterSide.residentCharacterId = null;   // the garrison interpretation wins for patrollers
      monsterSide.residentSettlementId = null;
    }
  }
  const createOpts = {
    scale: 'wilderness',
    trigger: o.trigger || 'gm-authored',
    hexId: draw.hexId || null,
    category: draw.category,
    rarity: draw.rarity || null,
    partySide: o.partySide || {},
    monsterSide,
    createReason: o.trigger || 'draw'
  };
  if(o.id) createOpts.id = o.id;
  if(o.atTurn !== undefined) createOpts.occurredAtTurn = o.atTurn;
  if(o.onDayInMonth !== undefined) createOpts.occurredOnDayInMonth = o.onDayInMonth;
  const enc = createEncounter(campaign, createOpts);
  if(!enc) return null;
  // Voyages V4 — a sea draw carries its maritime context; attach it defensively so the resolution
  // panel reads "at sea" + the sea evasion (vessels can't evade monsters → combat handoff). No
  // blankEncounter change / no migration — a land encounter lacks draw.atSea, so enc.atSea stays falsy.
  if(draw.atSea){ enc.atSea = true; enc.seaZone = draw.seaZone || null; enc.evasion = draw.evasion || null; }
  // A trigger that pre-rolled the distance with its SEEDED rng (the journey preview) hands it
  // in verbatim — the entity matches the reviewed proposal byte-for-byte.
  if(o.distance && enc.distance == null){
    enc.distance = o.distance;
    enc.history.push({ turn: enc.occurredAtTurn, type: 'distance', reason: (o.distance.distanceFt != null ? o.distance.distanceFt : '?') + " ft (" + (o.distance.terrainRow || 'terrain') + ")" });
  }
  // Pre-roll the distance when the terrain resolves (RR pp.280–281): identity-independent,
  // so it lands at creation; sides' counts refine the visibility cap when known.
  if(enc.distance == null && typeof A.computeEncounterDistance === 'function'){
    const hex = Array.isArray(campaign.hexes) ? campaign.hexes.find(h => h && h.id === enc.hexId) : null;
    const rowKey = hex && typeof A.encounterRowKeyForHex === 'function' ? A.encounterRowKeyForHex(hex) : null;
    if(rowKey){
      enc.distance = A.computeEncounterDistance({
        terrainRow: rowKey,
        light: o.light || 'daylight',
        sideACount: (enc.partySide && enc.partySide.sizeCount) || null,
        sideBCount: (enc.monsterSide && enc.monsterSide.count) || null,
        rng: o.rng || Math.random
      });
      if(enc.distance) enc.history.push({ turn: enc.occurredAtTurn, type: 'distance', reason: enc.distance.distanceFt + " ft (" + (enc.distance.terrainRow || 'terrain') + ")" });
    }
  }
  return enc;
}

// Self-register the legacy hex.lairs[] -> campaign.lairs[] lift (#476 M0). Was an
// inline entry in the engine's load-migration seed array at order 140. Idempotent;
// runs after lazy-default guarantees campaign.lairs[]. (T5, 2026-06-23.)
if (ACKS && typeof ACKS.registerLoadMigration === 'function') {
  ACKS.registerLoadMigration('legacy-hex-lairs', migrateLegacyHexLairs, { order: 140 });
}

Object.assign(ACKS, {
  // #476 Monster Persistence M0 — Lair lookups + the legacy hex.lairs[] lift (2026-06-09)
  findLair, lairsAtHex, lairsByMonsterKey, activeLairs, clearedLairs, lairInhabitantCount, migrateLegacyHexLairs,
  // #476 M1 — Lair lifecycle setters + terrain-keyed density seeding (Plan §13)
  createLair, clearLair, discoverLair, abandonLair, destroyLair, revealDynamicLair,
  generateLair, _rollDiceStr, lairEncounterProposal,
  rollLairCount, lairDiceForTerrain, lairDiceForHex, seedHexLairs, lairDiceMax, hexLairCapacity,
  // #476 M4 — securing consequence (RR p.338): live lairs block settling the hex (DC-0 consumes)
  hexSecuringBlockers,
  // #476 Encounter layer E1 — the Encounter entity + the draw seam (D8–D12, plan §15)
  findEncounter, encountersAtHex, activeEncounters, encounterDisplayName, priorReactionBetween,
  createEncounter, resolveEncounter, encounterDraw, createEncounterFromDraw,
  bindEncounterIdentity, _applyIdentityBinding, _unwindEncounterMinting, looseMonsterBands
});

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
