/* ACKS God Mode — acks-engine-sanctums.js
 * The Arcane Domain — Sanctums & Dungeons (the arcane economy core). Phase 4, Wave AD.
 *
 * Spec: Phase_4_Sanctums_Plan.md (AD-A lookups §3.2/§3.6 + AD-D attunement/sovereignty
 * §3.4/§4.7/§4.8 + AD-E arcane power/harvesting/domain-effects §4.6/§4.9/§4.5 + the §5
 * five-accessor contract that Phase_4_Magic_Research_Plan.md consumes). Built on the SHIPPED
 * Dungeon (Delves D2, acks-engine-delves.js — blankDungeon carries the arcane facet reserved-
 * null; lairsInDungeon / dungeonActiveAttunement / dungeonAttunedCharacterId / dungeonLifecycle
 * Label live there) + Lairs + MONSTER_CATALOG + the Religion sibling (the power-accessor +
 * monthly-consumer + record-event idioms — divinePowerAvailable / spendDivinePower / processReligion
 * ForTurn). The seam contract is AGREED (_handoffs/Arcane_Divine_Seam.md, Q6): this module exposes
 * arcanePowerAvailable / spendArcanePower mirroring the divine pair.
 *
 * THIS SLICE (the arcane economy over hand-placed dungeons/lairs):
 *   AD-A — totalAreaSqFt / dungeonMonsterXp / dungeonSubjugatedXp / dungeonArcanePowerPerDay,PerMonth
 *          / dungeonAreaCount / dungeonLairCapacity / dungeonIsFull + anchorLairToDungeon (+ the
 *          lair.dungeonId/areaIndex/depthRank fields, additive on blankLair in acks-engine-entities.js).
 *   AD-D — blankAttunement (att-, engine-registered) + attuneToDungeon (built-auto + the conquered
 *          month-residency+throw + the one-active-per-dungeon invariant + supersede/relinquish/lapse)
 *          + establishSovereignty (reaction 12+ / recruit-chieftain / slay-strongest / GM-fiat).
 *   AD-E — arcanePowerAvailable / spendArcanePower (vicinity-gated, monthly spent-reset) + the 5
 *          contract accessors (2 real + 3 graceful stubs — facilities/assistants fill at AD-B) +
 *          processArcaneForTurn (the monthly reset+cache+record, hooked into commitTurn) + harvestDungeon
 *          → special-component items + the peasants-and-dungeons garrison penalty (dungeonGarrison
 *          MoralePenalty, late-bound into moraleModifiersFor — the militia/banditry precedent).
 *
 * DEFERRED (later AD-waves, stacked on this branch): AD-B (Sanctum Constructible + apprentice/companion
 * attraction + the apprenticeship relation), AD-C (dungeon construction Project + the Vagaries-of-
 * Incursion auto-population), AD-M (Magic Research — the consumer of the §5 contract), the daily
 * day-tick grain for arcane power (this slice ships the monthly model — the visible-planning-info path,
 * §4.9), and the arcane↔divine co-extraction / become-a-god seam (D2, Religion-owned).
 *
 * RAW-default polarity (D10, §7): NO house rule — sanctums/dungeons/attunement/sovereignty/arcane power
 * are core RAW, dormant-until-used (the data is simply empty until a GM builds/finds a dungeon, like the
 * warfare layer with no army). No new entity/prefix (att- is registered; Attunement is the att- entity;
 * no new house rule).
 *
 * Loads after acks-engine-delves.js (lairsInDungeon / dungeonActiveAttunement) + after the canonical set
 * (newId / ID_PREFIXES / findGroup / groupActiveCount / abilityMod / totalFamilies / MONSTER_CATALOG /
 * newEvent). Self-contained: pure reads + setters over a passed campaign; cross-module helpers resolve at
 * CALL time off global.ACKS (the religion late-bind idiom — every module is present by then).
 */
(function(global){
  'use strict';

  const ACKS = global.ACKS = global.ACKS || {};

  // Factory plumbing — proxy SCHEMA_VERSION / newId / ID_PREFIXES through the namespace at call time
  // (the acks-engine-entities.js idiom).
  const SCHEMA_VERSION = 2;
  const newId = function(prefix){ return global.ACKS.newId(prefix); };
  const ID_PREFIXES = new Proxy({}, { get(_, key){ return (global.ACKS.ID_PREFIXES || {})[key]; } });
  // Late-bound ACKS namespace (freshest export set; these run well after every module loads).
  function _A(){ return global.ACKS || ACKS; }

  // RAW constants (RR p.388).
  const DAYS_PER_MONTH = 30;             // the project's month convention (Calendar §15)
  const ARCANE_EXTRACT_PCT = 0.02;       // 2% of subjugated XP per day (RR p.388)
  const ATTUNE_AREA_PER_PENALTY = 5000;  // −1 to the conquered-attunement throw per 5,000 sq ft (RR p.387)
  const SOVEREIGNTY_TARGET = 12;         // reaction 12+ → sovereignty (RR p.388)
  const SANCTUM_MIN_LEVEL = 9;           // arcane caster L9+ operates a dungeon (RR p.386–388)

  // ── Defensive collection reads (absent collections read as []) ──
  function _dungeons(campaign){ return (campaign && Array.isArray(campaign.dungeons)) ? campaign.dungeons : []; }
  function _attunements(campaign){ return (campaign && Array.isArray(campaign.attunements)) ? campaign.attunements : []; }
  function _lairs(campaign){ return (campaign && Array.isArray(campaign.lairs)) ? campaign.lairs : []; }
  function _chars(campaign){ return (campaign && Array.isArray(campaign.characters)) ? campaign.characters : []; }
  function _groups(campaign){ return (campaign && Array.isArray(campaign.groups)) ? campaign.groups : []; }
  function _findChar(campaign, id){ if(id && typeof id === 'object') return id; return _chars(campaign).find(c => c && c.id === id) || null; }
  function _findDungeon(campaign, id){ const A = _A(); return (typeof A.findDungeon === 'function') ? A.findDungeon(campaign, id) : (_dungeons(campaign).find(d => d && d.id === id) || null); }
  function _findGroup(campaign, id){ const A = _A(); return (typeof A.findGroup === 'function') ? A.findGroup(campaign, id) : (_groups(campaign).find(g => g && g.id === id) || null); }
  function _groupActive(group){ const A = _A(); return (typeof A.groupActiveCount === 'function') ? A.groupActiveCount(group) : Math.max(0, ((group && group.count) || 0) - ((group && group.casualties) || 0)); }
  function _lairsInDungeon(campaign, dungeon){ const A = _A(); if(typeof A.lairsInDungeon === 'function') return A.lairsInDungeon(campaign, dungeon); const id = (typeof dungeon === 'string') ? dungeon : (dungeon && dungeon.id); return _lairs(campaign).filter(l => l && l.dungeonId === id); }
  function _findMonster(key){ const A = _A(); return (key && typeof A.findMonster === 'function') ? A.findMonster(key) : null; }
  function _currentTurn(campaign){ return (campaign && typeof campaign.currentTurn === 'number') ? campaign.currentTurn : 1; }
  function _chaMod(ch){ const A = _A(); const fn = (typeof A.abilityMod === 'function') ? A.abilityMod : (s => Math.floor(((Number(s)||10) - 10) / 3)); return fn((ch && ch.abilities && ch.abilities.CHA) || 10); }
  function _rng(opts){ return (opts && typeof opts.rng === 'function') ? opts.rng : Math.random; }
  function _d6(rng){ return 1 + Math.floor((rng() || 0) * 6); }

  // ════════════════════════════════════════════════════════════════════════════
  // AD-A — Arcane lookups (RR pp.386–388; Phase_4_Sanctums_Plan.md §3.2)
  // ════════════════════════════════════════════════════════════════════════════

  // The arcane classes that build sanctums + operate dungeons (RR p.386). Mirrors religion's
  // DIVINE_CLASSES: explicit GM flag (ch.isArcaneCaster) → class powers → known class names.
  const ARCANE_CLASSES = ['mage','warlock','nobiran wonderworker','wonderworker','cryomancer','elven enchanter','elven nightblade','elven spellsword','witch','occultist','necromancer','elementalist'];
  function isArcaneCaster(character){
    if(!character) return false;
    if(character.isArcaneCaster === true) return true;                 // explicit GM flag
    const powers = Array.isArray(character.classPowers) ? character.classPowers : [];
    if(powers.some(p => /arcane\s*(magic|power|caster)|magic\s*research/i.test(typeof p === 'string' ? p : (p && (p.name || p.key || p.label || ''))))) return true;
    const cls = (character.class || '').toLowerCase();
    return ARCANE_CLASSES.some(d => cls.includes(d));
  }
  // Eligible to operate a dungeon (attune + extract arcane power): an arcane caster of L9+ (RR p.386–388).
  function canOperateDungeon(character){ return isArcaneCaster(character) && (Number(character && character.level) || 0) >= SANCTUM_MIN_LEVEL; }

  // Total contiguous dungeon area (RR p.387 — the attunement-rate basis). Σ areaSqFtPerLevel; an
  // un-detailed dungeon (areaSqFtPerLevel empty) reads 0.
  function totalAreaSqFt(dungeon){
    if(!dungeon) return 0;
    if(Array.isArray(dungeon.areaSqFtPerLevel)) return dungeon.areaSqFtPerLevel.reduce((s, a) => s + (Number(a) || 0), 0);
    return 0;
  }

  // A group's XP value = per-creature catalog XP × active count (the monster's "XP value", RR p.388).
  function _groupMonsterXp(group){
    if(!group) return 0;
    const key = group.groupTemplate && group.groupTemplate.monsterCatalogKey;
    const mon = _findMonster(key);
    const perXp = mon ? (Number(mon.xp) || 0) : (Number(group.xpPerCreature) || 0);
    return perXp * _groupActive(group);
  }
  // A subjugated LEADER character's XP value (the dragon-as-character / chieftain edge case). v1: read an
  // explicit monsterXpValue, else a monsterCatalogKey's catalog XP, else 0 (the power comes from the
  // tribe's groups, which establishSovereignty adds to subjugatedGroupIds — §4.8). 🔧 documented.
  function _leaderMonsterXp(campaign, charId){
    const ch = _findChar(campaign, charId);
    if(!ch) return 0;
    if(ch.monsterXpValue != null) return Math.max(0, Number(ch.monsterXpValue) || 0);
    const mon = _findMonster(ch.monsterCatalogKey);
    return mon ? Math.max(0, Number(mon.xp) || 0) : 0;
  }

  // Σ XP of EVERY active monster lairing in the dungeon (the population total, RR p.387). Drives the
  // peasants-and-dungeons garrison increase (§4.5).
  function dungeonMonsterXp(campaign, dungeon){
    const d = (typeof dungeon === 'string') ? _findDungeon(campaign, dungeon) : dungeon;
    if(!d) return 0;
    let xp = 0;
    for(const lair of _lairsInDungeon(campaign, d)){
      if(!lair || (lair.status && lair.status !== 'active' && lair.status !== 'unknown')) continue;
      for(const gid of (lair.groupIds || [])) xp += _groupMonsterXp(_findGroup(campaign, gid));
      for(const lid of (lair.leaderCharacterIds || [])) xp += _leaderMonsterXp(campaign, lid);
    }
    return xp;
  }

  // Σ XP of only the monsters the caster has SOVEREIGNTY over (the arcane-power base, RR p.388). The
  // subjugated set lags the population (new arrivals aren't auto-subjugated — §4.8).
  function dungeonSubjugatedXp(campaign, dungeon){
    const d = (typeof dungeon === 'string') ? _findDungeon(campaign, dungeon) : dungeon;
    if(!d) return 0;
    let xp = 0;
    for(const gid of (d.subjugatedGroupIds || [])) xp += _groupMonsterXp(_findGroup(campaign, gid));
    for(const lid of (d.subjugatedLeaderCharacterIds || [])) xp += _leaderMonsterXp(campaign, lid);
    return xp;
  }

  // Arcane power per DAY (RR p.388: 2% of subjugated XP, FLOORED — the worked example 4,290 XP → 85.8
  // → 85 gp/day). Per MONTH = perDay × 30 (→ 2,550, RAW). Live-derived — tracks the subjugated set, so
  // culling a monster drops the next read.
  function dungeonArcanePowerPerDay(campaign, dungeon){ return Math.floor(ARCANE_EXTRACT_PCT * dungeonSubjugatedXp(campaign, dungeon)); }
  function dungeonArcanePowerPerMonth(campaign, dungeon){ return dungeonArcanePowerPerDay(campaign, dungeon) * DAYS_PER_MONTH; }

  // The dungeon's distinct-area count (the 1/3-full cap basis, RR p.387). Explicit areaCount wins; else
  // a sensible derive from total area (round(totalAreaSqFt / 5000)), min 1 — 🔧 (RAW gives no sq-ft-per-
  // area constant; OQ2). The Dungeon Builder (Phase 4.8) sets it precisely later.
  function dungeonAreaCount(dungeon){
    if(!dungeon) return 0;
    if(dungeon.areaCount != null) return Math.max(0, Math.round(Number(dungeon.areaCount) || 0));
    const fromArea = Math.round(totalAreaSqFt(dungeon) / 5000);
    return Math.max(1, fromArea || 1);
  }
  // RR p.387 — full when ≥ 1/3 of the areas hold lairing monsters; the rest are buffer zones.
  function dungeonLairCapacity(campaign, dungeon){ const d = (typeof dungeon === 'string') ? _findDungeon(campaign, dungeon) : dungeon; if(!d) return 0; return Math.ceil(dungeonAreaCount(d) / 3); }
  function dungeonIsFull(campaign, dungeon){
    const d = (typeof dungeon === 'string') ? _findDungeon(campaign, dungeon) : dungeon;
    if(!d) return false;
    const living = _lairsInDungeon(campaign, d).filter(l => l && (l.status === 'active' || l.status === 'unknown')).length;
    return living >= dungeonLairCapacity(campaign, d);
  }

  // Anchor a Lair to a Dungeon (§4.4 — the population is Lairs re-anchored to a dungeon room, not a
  // separate model). Sets lair.dungeonId + an areaIndex/depthRank ordinal (the deeper = stronger
  // presentation; a full room-graph is the Dungeon Builder's job). Idempotent.
  function anchorLairToDungeon(campaign, lairId, dungeonId, opts){
    opts = opts || {};
    const lair = _lairs(campaign).find(l => l && l.id === lairId);
    const dungeon = _findDungeon(campaign, dungeonId);
    if(!lair || !dungeon) return { ok: false, reason: 'no-lair-or-dungeon' };
    const priorCount = _lairsInDungeon(campaign, dungeon).filter(l => l && l.id !== lair.id).length;  // OTHER lairs already here
    lair.dungeonId = dungeon.id;
    if(opts.areaIndex != null) lair.areaIndex = Math.max(0, Math.round(Number(opts.areaIndex) || 0));
    else if(lair.areaIndex == null) lair.areaIndex = priorCount;  // next free ordinal (0-based)
    if(opts.depthRank != null) lair.depthRank = Math.max(0, Math.round(Number(opts.depthRank) || 0));
    else if(lair.depthRank == null) lair.depthRank = lair.areaIndex;
    if(!lair.hexId && dungeon.hexId) lair.hexId = dungeon.hexId;   // the lair sits where the dungeon sits
    return { ok: true, lair, dungeon };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // AD-D — Attunement (RR p.387; Phase_4_Sanctums_Plan.md §3.4 / §4.7)
  // ════════════════════════════════════════════════════════════════════════════

  // The Attunement relation (att-, campaign.attunements[]). mage ↔ dungeon, one ACTIVE per dungeon (RAW).
  function blankAttunement(opts={}){
    return {
      schemaVersion: SCHEMA_VERSION,
      id: opts.id || newId(ID_PREFIXES.attunement),       // 'att-' (engine-registered)
      name: opts.name || '',
      mageCharacterId: opts.mageCharacterId || null,      // subject (the attuned caster)
      dungeonId: opts.dungeonId || null,                  // the other end
      method: opts.method || 'built',                     // built | conquered
      attunedAtTurn: (opts.attunedAtTurn != null) ? opts.attunedAtTurn : 1,
      attunementThrow: opts.attunementThrow || null,      // the conquered-attunement throw record (RR p.387)
      ancillaryHoursPerDay: (opts.ancillaryHoursPerDay != null) ? opts.ancillaryHoursPerDay : 1,
      status: opts.status || 'active',                    // active | relinquished | superseded | lapsed | ended-on-death
      endedAtTurn: (opts.endedAtTurn === undefined ? null : opts.endedAtTurn),
      history: opts.history || []
    };
  }

  // The conquered-attunement throw (RR p.387 — a magic research throw at −1 per 5,000 sq ft). Inline 1d20
  // (mirrors religion's rollDivineThrow); graduates to the Layer-1 resolver (Phase 3.6). natural 1 fails.
  function rollArcaneThrow(campaign, casterId, opts){
    opts = opts || {};
    const ch = _findChar(campaign, casterId);
    const A = _A();
    const intMod = ch ? ((typeof A.abilityMod === 'function') ? A.abilityMod((ch.abilities && ch.abilities.INT) || 10) : 0) : 0;
    const levelMod = ch ? Math.floor((ch.level || 1) / 2) : 0;        // research-throw scaling (RR p.388 table approximation)
    const target = (opts.target != null) ? opts.target : 11;
    const mod = (Number(opts.mod) || 0) + intMod + levelMod;
    const rng = _rng(opts);
    const roll = 1 + Math.floor((rng() || 0) * 20);
    const total = roll + mod;
    const natural1 = roll === 1, natural20 = roll === 20;
    const success = natural20 || (!natural1 && total >= target);
    return { roll, mod, total, target, success, natural1, natural20 };
  }

  // Attune a caster to a dungeon (RR p.387). method 'built' → auto (no throw). method 'conquered' → the
  // magic research throw at −1 per 5,000 sq ft (residency precondition assumed met — the GM confirms;
  // month-residency tracking is a calendar concern, deferred). One ACTIVE attunement per dungeon (any
  // overlap prevents — RR p.387); re-attuning the same mage to a DIFFERENT dungeon supersedes the prior.
  // opts: { dungeonId, mageCharacterId, method, gmOverride, rng, target }
  function attuneToDungeon(campaign, opts){
    opts = opts || {};
    const A = _A();
    const dungeon = _findDungeon(campaign, opts.dungeonId);
    const mage = _findChar(campaign, opts.mageCharacterId);
    if(!dungeon) return { ok: false, reason: 'no-dungeon' };
    if(!mage) return { ok: false, reason: 'no-caster' };
    if(!opts.gmOverride && !canOperateDungeon(mage)) return { ok: false, reason: 'caster-not-eligible' };  // arcane L9+
    // One active attunement per dungeon (RR p.387).
    const existing = (typeof A.dungeonActiveAttunement === 'function') ? A.dungeonActiveAttunement(campaign, dungeon) : null;
    if(existing){
      if(existing.mageCharacterId === mage.id) return { ok: true, alreadyAttuned: true, attunement: existing };
      return { ok: false, reason: 'already-attuned', byCharacterId: existing.mageCharacterId };
    }
    const method = (opts.method === 'conquered') ? 'conquered' : (dungeon.origin === 'constructed' ? 'built' : (opts.method || 'conquered'));
    let attunementThrow = null;
    if(method === 'conquered'){
      const penalty = -Math.floor(totalAreaSqFt(dungeon) / ATTUNE_AREA_PER_PENALTY);
      attunementThrow = rollArcaneThrow(campaign, mage.id, { rng: opts.rng, mod: penalty, target: opts.target });
      attunementThrow.penaltyPerArea = penalty;
      if(!attunementThrow.success) return { ok: false, reason: 'throw-failed', throwResult: attunementThrow };
    }
    // Supersede the mage's existing attunement to a DIFFERENT dungeon (RR p.387 lifecycle (b)).
    const priorOfMage = _attunements(campaign).find(a => a && a.mageCharacterId === mage.id && a.dungeonId !== dungeon.id && (a.status == null || a.status === 'active'));
    if(priorOfMage) endAttunement(campaign, priorOfMage.id, 'superseded', 'attuned to ' + (dungeon.name || dungeon.id));
    const att = blankAttunement({
      mageCharacterId: mage.id, dungeonId: dungeon.id, method,
      attunedAtTurn: _currentTurn(campaign), attunementThrow,
      ancillaryHoursPerDay: Math.max(1, Math.ceil(totalAreaSqFt(dungeon) / 30000)) || 1
    });
    if(!Array.isArray(campaign.attunements)) campaign.attunements = [];   // init-on-write
    campaign.attunements.push(att);
    att.history.push({ turn: _currentTurn(campaign), type: 'attuned', reason: method + (attunementThrow ? (' (throw ' + attunementThrow.total + ' vs ' + attunementThrow.target + ')') : '') });
    _recordArcaneEvent(campaign, 'dungeon-attuned',
      { attunementId: att.id, dungeonId: dungeon.id, mageCharacterId: mage.id, method, throwResult: attunementThrow },
      { primaryHexId: dungeon.hexId, narrative: (mage.name || mage.id) + ' attunes to ' + (dungeon.name || 'the dungeon') + ' (' + method + ')',
        relatedEntities: [{ kind: 'character', id: mage.id, role: 'subject' }, { kind: 'dungeon', id: dungeon.id, role: 'site' }] });
    return { ok: true, attunement: att, method, throwResult: attunementThrow };
  }

  // End an attunement (relinquish / supersede / lapse on leaving the vicinity > 1 month / death). Idempotent.
  function endAttunement(campaign, attunementId, status, reason){
    const att = _attunements(campaign).find(a => a && a.id === attunementId);
    if(!att || (att.status && att.status !== 'active')) return att || null;
    att.status = status || 'relinquished';
    att.endedAtTurn = _currentTurn(campaign);
    att.history.push({ turn: att.endedAtTurn, type: 'ended', reason: (status || 'relinquished') + (reason ? (' — ' + reason) : '') });
    const dungeon = _findDungeon(campaign, att.dungeonId);
    _recordArcaneEvent(campaign, 'attunement-ended',
      { attunementId: att.id, dungeonId: att.dungeonId, mageCharacterId: att.mageCharacterId, status: att.status, reason: reason || '' },
      { primaryHexId: dungeon ? dungeon.hexId : null, narrative: 'Attunement to ' + ((dungeon && dungeon.name) || 'the dungeon') + ' ended (' + att.status + ')',
        relatedEntities: [{ kind: 'character', id: att.mageCharacterId, role: 'subject' }].concat(dungeon ? [{ kind: 'dungeon', id: dungeon.id, role: 'site' }] : []) });
    return att;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // AD-D — Sovereignty (RR p.388; Phase_4_Sanctums_Plan.md §4.8)
  // ════════════════════════════════════════════════════════════════════════════

  // The groups eligible to be subjugated in a dungeon (the living lairing monsters not already cowed).
  function _dungeonGroupIds(campaign, dungeon){
    const ids = [];
    for(const lair of _lairsInDungeon(campaign, dungeon)){
      if(!lair || (lair.status && lair.status !== 'active' && lair.status !== 'unknown')) continue;
      for(const gid of (lair.groupIds || [])) if(gid && !ids.includes(gid)) ids.push(gid);
    }
    return ids;
  }
  function _addSubjugated(dungeon, groupIds, leaderIds){
    if(!Array.isArray(dungeon.subjugatedGroupIds)) dungeon.subjugatedGroupIds = [];
    if(!Array.isArray(dungeon.subjugatedLeaderCharacterIds)) dungeon.subjugatedLeaderCharacterIds = [];
    (groupIds || []).forEach(gid => { if(gid && !dungeon.subjugatedGroupIds.includes(gid)) dungeon.subjugatedGroupIds.push(gid); });
    (leaderIds || []).forEach(lid => { if(lid && !dungeon.subjugatedLeaderCharacterIds.includes(lid)) dungeon.subjugatedLeaderCharacterIds.push(lid); });
  }

  // Establish sovereignty over (some of) a dungeon's inhabitants (RR p.388). Methods:
  //   'reaction'  — 2d6 + CHA + tone (intimidation / mystic-aura) vs 12+ (RR p.388). On success, the
  //                 affected groups (opts.groupIds, or all living dungeon groups) are subjugated.
  //   'recruit'   — the tribal chieftain (opts.chieftainCharacterId) becomes a henchman → sovereignty
  //                 over him AND his tribe (the groups he commands / in his lairs).
  //   'slay'      — slay the strongest (opts.slainHd) → sovereignty over the OTHER groups of lower HD
  //                 than both the caster and the slain monster.
  //   'gm-fiat'   — the Judge grants it (opts.groupIds, or all).
  // One sovereign per dungeon (RR p.388): set/refuse unless opts.displace. New arrivals are NOT auto-
  // subjugated (the base lags the population). opts: { dungeonId, casterId, method, groupIds?, chieftain
  // CharacterId?, slainHd?, slainGroupId?, toneMod?, displace?, rng }
  function establishSovereignty(campaign, opts){
    opts = opts || {};
    const dungeon = _findDungeon(campaign, opts.dungeonId);
    const caster = _findChar(campaign, opts.casterId);
    if(!dungeon) return { ok: false, reason: 'no-dungeon' };
    if(!caster) return { ok: false, reason: 'no-caster' };
    if(dungeon.sovereignCharacterId && dungeon.sovereignCharacterId !== caster.id && !opts.displace){
      return { ok: false, reason: 'another-sovereign', byCharacterId: dungeon.sovereignCharacterId };
    }
    const method = opts.method || 'reaction';
    let subjugatedGroupIds = [], subjugatedLeaderIds = [], throwResult = null;

    if(method === 'reaction'){
      const rng = _rng(opts);
      const chaMod = (opts.chaMod != null) ? Number(opts.chaMod) : _chaMod(caster);
      const toneMod = Number(opts.toneMod) || 0;             // Intimidation / Mystic Aura proficiency bonus (GM-supplied)
      const d6a = _d6(rng), d6b = _d6(rng);
      const total = d6a + d6b + chaMod + toneMod;
      const success = total >= SOVEREIGNTY_TARGET;
      throwResult = { d6: [d6a, d6b], chaMod, toneMod, total, target: SOVEREIGNTY_TARGET, success };
      if(!success) return { ok: false, reason: 'reaction-failed', throwResult };
      subjugatedGroupIds = (opts.groupIds && opts.groupIds.length) ? opts.groupIds.slice() : _dungeonGroupIds(campaign, dungeon);
    } else if(method === 'recruit'){
      const chiefId = opts.chieftainCharacterId;
      if(!chiefId) return { ok: false, reason: 'no-chieftain' };
      subjugatedLeaderIds = [chiefId];
      // His tribe = groups he commands + groups in lairs he leads within this dungeon.
      const commanded = _groups(campaign).filter(g => g && g.commanderCharacterId === chiefId).map(g => g.id);
      const inLed = [];
      for(const lair of _lairsInDungeon(campaign, dungeon)){ if(lair && (lair.leaderCharacterIds || []).includes(chiefId)){ (lair.groupIds || []).forEach(gid => inLed.push(gid)); } }
      subjugatedGroupIds = Array.from(new Set(commanded.concat(inLed)));
    } else if(method === 'slay'){
      const slainHd = Number(opts.slainHd) || 0;
      const casterHd = Number(caster.level) || 0;
      const cap = Math.min(casterHd || Infinity, slainHd || Infinity);
      // Subjugate the OTHER living dungeon groups of HD strictly below the cap.
      subjugatedGroupIds = _dungeonGroupIds(campaign, dungeon).filter(gid => {
        if(gid === opts.slainGroupId) return false;
        const g = _findGroup(campaign, gid);
        const hd = g ? (Number((g.groupTemplate && g.groupTemplate.hitDice)) || Number(g.hitDice) || 0) : 0;
        return hd < cap;
      });
      throwResult = { method: 'slay', slainHd, casterHd, cap: (cap === Infinity ? null : cap) };
    } else { // gm-fiat
      subjugatedGroupIds = (opts.groupIds && opts.groupIds.length) ? opts.groupIds.slice() : _dungeonGroupIds(campaign, dungeon);
      subjugatedLeaderIds = (opts.leaderCharacterIds || []).slice();
    }

    dungeon.sovereignCharacterId = caster.id;
    _addSubjugated(dungeon, subjugatedGroupIds, subjugatedLeaderIds);
    if(!Array.isArray(dungeon.history)) dungeon.history = [];
    dungeon.history.push({ turn: _currentTurn(campaign), type: 'sovereignty', reason: method + ' (+' + subjugatedGroupIds.length + ' groups)' });
    _recordArcaneEvent(campaign, 'sovereignty-established',
      { dungeonId: dungeon.id, characterId: caster.id, method, groupIds: subjugatedGroupIds, leaderCharacterIds: subjugatedLeaderIds, throwResult },
      { primaryHexId: dungeon.hexId, narrative: (caster.name || caster.id) + ' establishes sovereignty over ' + (dungeon.name || 'the dungeon') + ' (' + method + ', ' + subjugatedGroupIds.length + ' group' + (subjugatedGroupIds.length === 1 ? '' : 's') + ')',
        relatedEntities: [{ kind: 'character', id: caster.id, role: 'subject' }, { kind: 'dungeon', id: dungeon.id, role: 'site' }] });
    return { ok: true, dungeon, method, subjugatedGroupIds, subjugatedLeaderIds, throwResult,
      subjugatedXp: dungeonSubjugatedXp(campaign, dungeon) };
  }

  // Relinquish sovereignty (the monsters depart, or the caster releases them).
  function loseSovereignty(campaign, dungeonId, opts){
    opts = opts || {};
    const dungeon = _findDungeon(campaign, dungeonId);
    if(!dungeon || !dungeon.sovereignCharacterId) return { ok: false, reason: 'no-sovereign' };
    const prior = dungeon.sovereignCharacterId;
    dungeon.sovereignCharacterId = null;
    if(opts.keepSubjugated !== true){ dungeon.subjugatedGroupIds = []; dungeon.subjugatedLeaderCharacterIds = []; }
    _recordArcaneEvent(campaign, 'sovereignty-lost',
      { dungeonId: dungeon.id, characterId: prior, reason: opts.reason || 'relinquished' },
      { primaryHexId: dungeon.hexId, narrative: 'Sovereignty over ' + (dungeon.name || 'the dungeon') + ' is lost (' + (opts.reason || 'relinquished') + ')',
        relatedEntities: [{ kind: 'character', id: prior, role: 'subject' }, { kind: 'dungeon', id: dungeon.id, role: 'site' }] });
    return { ok: true, dungeon };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // AD-E — Arcane power extraction + the §5 contract accessors (RR p.388)
  // ════════════════════════════════════════════════════════════════════════════

  // Vicinity (RR p.387): the caster's sanctum/facilities must be in the dungeon's 6-mile hex to spend
  // arcane power. Lenient for a tool: satisfied unless BOTH hexes are set and differ (an unplaced dungeon
  // / a caster with no currentHexId is run abstractly). 🔧 documented.
  function _inVicinity(caster, dungeon){
    const ch = caster && caster.currentHexId, dh = dungeon && dungeon.hexId;
    if(ch == null || dh == null) return true;
    return ch === dh;
  }
  // The dungeons a caster can extract arcane power from: attuned (to him) + sovereign (he holds it) +
  // (when requireVicinity) co-located. The eligibility surface §4.9.
  function dungeonsForArcaneCaster(campaign, charId, opts){
    opts = opts || {};
    const A = _A();
    const caster = _findChar(campaign, charId);
    if(!caster) return [];
    return _dungeons(campaign).filter(d => {
      if(!d) return false;
      const attunedTo = (typeof A.dungeonAttunedCharacterId === 'function') ? A.dungeonAttunedCharacterId(campaign, d) : null;
      if(attunedTo !== charId) return false;
      if(d.sovereignCharacterId !== charId) return false;
      if(opts.requireVicinity && !_inVicinity(caster, d)) return false;
      return true;
    });
  }

  // §5 CONTRACT — arcanePowerAvailable (mirror of divinePowerAvailable). Spendable NOW = Σ over the
  // caster's attuned+sovereign+co-located dungeons of (this month's yield − already spent this month).
  // Live-derived (perMonth tracks the subjugated set); the monthly turn only resets the spend.
  function arcanePowerAvailable(campaign, charId){
    let sum = 0;
    for(const d of dungeonsForArcaneCaster(campaign, charId, { requireVicinity: true })){
      sum += Math.max(0, dungeonArcanePowerPerMonth(campaign, d) - (Number(d.arcanePowerSpentThisMonth) || 0));
    }
    return sum;
  }

  // §5 CONTRACT — spendArcanePower (mirror of spendDivinePower). Atomic: if less than `gp` is available,
  // spends NOTHING ({ok:false}). Else draws down across the caster's eligible dungeons (lowest-yield
  // first — use the small wallets before they're lost), writing arcanePowerSpentThisMonth. The component-
  // cost-payment seam for Magic Research (it draws here when the researcher is in a dungeon's vicinity).
  function spendArcanePower(campaign, charId, gp, opts){
    opts = opts || {};
    const want = Math.round(Number(gp) || 0);
    if(want <= 0) return { ok: false, spent: 0, remaining: arcanePowerAvailable(campaign, charId) };
    const available = arcanePowerAvailable(campaign, charId);
    if(available < want) return { ok: false, spent: 0, remaining: available };
    const eligible = dungeonsForArcaneCaster(campaign, charId, { requireVicinity: true })
      .map(d => ({ d, free: Math.max(0, dungeonArcanePowerPerMonth(campaign, d) - (Number(d.arcanePowerSpentThisMonth) || 0)) }))
      .filter(x => x.free > 0)
      .sort((a, b) => a.free - b.free);
    let need = want;
    for(const x of eligible){
      if(need <= 0) break;
      const take = Math.min(x.free, need);
      x.d.arcanePowerSpentThisMonth = (Number(x.d.arcanePowerSpentThisMonth) || 0) + take;
      need -= take;
    }
    return { ok: true, spent: want - need, remaining: arcanePowerAvailable(campaign, charId) };
  }

  // §5 CONTRACT (graceful stub until harvesting fills it) — the special-component items in the character's
  // reach (carry inventory + co-located stashes), filterable by monster magic-type. A special component is
  // an item line carrying a `specialComponent {monsterKey, magicTypes[], valueGp}` tag (harvestDungeon
  // produces them). Returns [{ source:'carry'|'stash', stashId?, index?, item, valueGp }].
  function specialComponentsHeldBy(campaign, charId, opts){
    opts = opts || {};
    const ch = _findChar(campaign, charId);
    if(!ch) return [];
    const matches = (sc) => !opts.magicType || (Array.isArray(sc.magicTypes) && sc.magicTypes.includes(opts.magicType));
    const out = [];
    (ch.inventory || []).forEach((it, i) => { if(it && it.specialComponent && matches(it.specialComponent)) out.push({ source: 'carry', index: i, item: it, valueGp: Number(it.specialComponent.valueGp) || 0 }); });
    // Co-located stashes (the shipped facet-item line carries a `specialComponent` tag the same way).
    const hex = ch.currentHexId;
    (campaign && Array.isArray(campaign.stashes) ? campaign.stashes : []).forEach(st => {
      if(!st || (hex && st.hexId && st.hexId !== hex)) return;
      (st.items || []).forEach(it => { if(it && it.specialComponent && matches(it.specialComponent)) out.push({ source: 'stash', stashId: st.id, item: it, valueGp: Number(it.specialComponent.valueGp) || 0 }); });
    });
    return out;
  }

  // §5 CONTRACT (graceful stub — facilities fill at AD-B) — the best accessible research facility of a
  // kind (library / workshop / mortuary / crossbreeding-lab) on a sanctum (or a guild/temple) the caster
  // can use. Reads constructible.kindSpecific.researchFacilities[]; returns the highest-value match or null.
  function researchFacilityFor(campaign, charId, kind){
    const constructibles = (campaign && Array.isArray(campaign.constructibles)) ? campaign.constructibles : [];
    let best = null;
    for(const cst of constructibles){
      if(!cst || !cst.kindSpecific) continue;
      const owns = cst.kindSpecific.builderCharacterId === charId || cst.ownerCharacterId === charId
        || (Array.isArray(cst.kindSpecific.researchFacilities) && cst.kindSpecific.researchFacilities.some(f => (f.sharedByCharacterIds || []).includes(charId)));
      const facs = Array.isArray(cst.kindSpecific.researchFacilities) ? cst.kindSpecific.researchFacilities : [];
      for(const f of facs){
        if(f && f.kind === kind && (owns || (f.sharedByCharacterIds || []).includes(charId))){
          if(!best || (Number(f.valueGp) || 0) > (Number(best.valueGp) || 0)) best = { constructibleId: cst.id, kind: f.kind, valueGp: Number(f.valueGp) || 0 };
        }
      }
    }
    return best;
  }

  // §5 CONTRACT (graceful stub — apprenticeships fill at AD-B) — the research assistants available to a
  // master: his companions (henchmen — Architecture henchmanship) + apprentices (the apprenticeship
  // relation, AD-B). Returns [{ characterId, level, role:'companion'|'apprentice' }].
  function researchAssistantsFor(campaign, charId){
    const out = [];
    _chars(campaign).forEach(c => {
      if(!c || c.id === charId) return;
      if(c.liegeCharacterId === charId && (c.socialTier === 'henchman' || c.socialTier === 'follower')){
        out.push({ characterId: c.id, level: Number(c.level) || 1, role: 'companion' });
      }
    });
    (campaign && Array.isArray(campaign.apprenticeships) ? campaign.apprenticeships : []).forEach(a => {
      if(a && a.masterCharacterId === charId && (a.status == null || a.status === 'studying')){
        const ap = _findChar(campaign, a.apprenticeCharacterId);
        out.push({ characterId: a.apprenticeCharacterId, level: ap ? (Number(ap.level) || 0) : 0, role: 'apprentice' });
      }
    });
    return out;
  }

  // The monthly arcane consumer (§4.9) — hooked into commitTurn (the religion/aging precedent). Refreshes
  // each eligible dungeon's display cache to the new month's yield + RESETS the spend (the prior month's
  // unspent arcane power is lost — "cannot be stored", RR p.388). Records one arcane-power-extracted per
  // eligible dungeon (campaignLogHidden routine). NB the AVAILABLE amount is live-derived (perMonth −
  // spent) so extraction works mid-month before any commit; this just resets the per-month spend window.
  function processArcaneForTurn(campaign, options){
    const o = options || {};
    const out = { ran: false, logEntries: [], dungeons: 0, totalGp: 0 };
    if(!campaign) return out;
    out.ran = true;
    const A = _A();
    for(const d of _dungeons(campaign)){
      if(!d) continue;
      const sovereign = d.sovereignCharacterId;
      const attunedTo = (typeof A.dungeonAttunedCharacterId === 'function') ? A.dungeonAttunedCharacterId(campaign, d) : null;
      if(!sovereign || attunedTo !== sovereign) { d.arcanePowerThisMonth = 0; d.arcanePowerSpentThisMonth = 0; continue; }
      const monthYield = dungeonArcanePowerPerMonth(campaign, d);
      d.arcanePowerThisMonth = monthYield;          // display cache
      d.arcanePowerSpentThisMonth = 0;              // fresh month's budget
      if(monthYield > 0){
        out.dungeons++; out.totalGp += monthYield;
        const sov = _findChar(campaign, sovereign);
        out.logEntries.push('🔮 ' + ((sov && sov.name) || sovereign) + ' may extract ' + monthYield.toLocaleString() + 'gp of arcane power from ' + (d.name || 'a dungeon') + ' this month');
        _recordArcaneEvent(campaign, 'arcane-power-extracted',
          { dungeonId: d.id, characterId: sovereign, gpValue: monthYield, subjugatedXp: dungeonSubjugatedXp(campaign, d) },
          { primaryHexId: d.hexId, campaignLogHidden: true,
            narrative: (sov && sov.name || sovereign) + ' extracts ' + monthYield.toLocaleString() + 'gp arcane power from ' + (d.name || 'the dungeon'),
            relatedEntities: [{ kind: 'character', id: sovereign, role: 'subject' }, { kind: 'dungeon', id: d.id, role: 'site' }] });
      }
    }
    return out;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // AD-E — Harvesting dungeons for monster parts (RR p.387)
  // ════════════════════════════════════════════════════════════════════════════

  // Harvest special components from a dungeon's monsters (RR p.387) — the renewable component supply for
  // magic research (the §5 component seam). method 'cull' (RAW B — bewitch/cull/gladiatorial; requires
  // sovereignty over the group) or 'bounty' (RAW A — hire adventurers; debit the bounty gp). Both kill
  // `quantity` of the chosen group (casualties += quantity) → produce a special-component item worth the
  // monsters' XP value, tagged componentOf the monster, into the caster's carry inventory. Reduces the
  // dungeon's monster XP (so the arcane yield + the garrison penalty both drop — the renewable tension).
  // opts: { dungeonId, casterId, groupId, quantity, method, bountyGp, magicTypes? }
  function harvestDungeon(campaign, opts){
    opts = opts || {};
    const dungeon = _findDungeon(campaign, opts.dungeonId);
    const caster = _findChar(campaign, opts.casterId);
    const group = _findGroup(campaign, opts.groupId);
    if(!dungeon) return { ok: false, reason: 'no-dungeon' };
    if(!caster) return { ok: false, reason: 'no-caster' };
    if(!group) return { ok: false, reason: 'no-group' };
    const method = (opts.method === 'bounty') ? 'bounty' : 'cull';
    if(method === 'cull' && dungeon.sovereignCharacterId !== caster.id) return { ok: false, reason: 'not-sovereign' };
    const active = _groupActive(group);
    const quantity = Math.max(1, Math.min(Math.round(Number(opts.quantity) || 1), active));
    if(active <= 0) return { ok: false, reason: 'no-monsters-left' };
    const key = group.groupTemplate && group.groupTemplate.monsterCatalogKey;
    const mon = _findMonster(key);
    const perXp = mon ? (Number(mon.xp) || 0) : (Number(group.xpPerCreature) || 0);
    const componentValueGp = perXp * quantity;                     // component value = XP value (RR p.388)
    const monName = (mon && mon.key) || key || 'monster';
    // Method A pays a bounty (debit the caster's purse).
    let bountyGp = 0;
    if(method === 'bounty'){
      bountyGp = Math.max(0, Math.round(Number(opts.bountyGp) || 0));
      if(bountyGp > 0){ if(!caster.coins || typeof caster.coins !== 'object') caster.coins = { pp:0, gp:0, ep:0, sp:0, cp:0 }; caster.coins.gp = (Number(caster.coins.gp) || 0) - bountyGp; }
    }
    // Kill the monsters (the parts come from culled creatures).
    group.casualties = Math.min((Number(group.count) || 0), (Number(group.casualties) || 0) + quantity);
    // Produce the special-component item into the caster's carry inventory (the shipped {name,stone,notes}
    // line + a specialComponent facet the §5 specialComponentsHeldBy accessor reads).
    if(!Array.isArray(caster.inventory)) caster.inventory = [];
    const item = { name: monName + ' parts ×' + quantity, stone: Math.max(1, Math.round(quantity / 6)), notes: 'Special component (harvested)',
      specialComponent: { monsterKey: monName, magicTypes: opts.magicTypes || [], valueGp: componentValueGp } };
    caster.inventory.push(item);
    if(!Array.isArray(dungeon.history)) dungeon.history = [];
    dungeon.history.push({ turn: _currentTurn(campaign), type: 'harvested', reason: method + ' ' + quantity + '× ' + monName + ' (' + componentValueGp + 'gp components)' });
    _recordArcaneEvent(campaign, 'dungeon-harvested',
      { dungeonId: dungeon.id, casterCharacterId: caster.id, monsterKey: monName, quantity, componentValueGp, method, bountyGp },
      { primaryHexId: dungeon.hexId, narrative: (caster.name || caster.id) + ' harvests ' + quantity + '× ' + monName + ' from ' + (dungeon.name || 'the dungeon') + ' (' + componentValueGp.toLocaleString() + 'gp of components' + (bountyGp ? (', ' + bountyGp.toLocaleString() + 'gp bounty') : '') + ')',
        relatedEntities: [{ kind: 'character', id: caster.id, role: 'subject' }, { kind: 'dungeon', id: dungeon.id, role: 'site' }] });
    return { ok: true, dungeon, group, quantity, componentValueGp, bountyGp, item, method };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // AD-E — Peasants and dungeons (RR p.387) — the garrison morale penalty
  // ════════════════════════════════════════════════════════════════════════════

  // The required garrison INCREASE for a domain's owned dungeons (RR p.387 — ceil(Σ dungeonMonsterXp /
  // families) gp per family). A self-garrisoned dungeon (monsterGarrisonHired) is EXCLUDED (the monsters
  // guard themselves) but carries its own −2 row (see dungeonGarrisonMoralePenalty). Owned = the dungeon's
  // owner OR sovereign rules this domain (loose: the dungeon's domainId matches, or its owner is the ruler).
  function _domainOwnedDungeons(campaign, d){
    if(!d) return [];
    return _dungeons(campaign).filter(g => g && (g.status === 'known' || g.status === 'being-cleared' || g.status === 'undiscovered' || g.ownerCharacterId || g.sovereignCharacterId) && (
      g.domainId === d.id || (g.ownerCharacterId && g.ownerCharacterId === d.rulerCharacterId) || (g.sovereignCharacterId && g.sovereignCharacterId === d.rulerCharacterId)
    ));
  }
  function dungeonRequiredGarrisonGpf(campaign, d){
    // Per PEASANT families — the same basis the existing garrison-adequacy morale check uses
    // (moraleModifiersFor), since the dungeon garrison is an ADDITIONAL burden on the same peasants
    // (RR p.387 worked example: 4,290 XP / 1,100 families = 3.9 → 4 gp/family).
    const fam = (d && d.demographics && d.demographics.peasantFamilies) || 0;
    if(fam <= 0) return 0;
    let xp = 0;
    for(const dn of _domainOwnedDungeons(campaign, d)){ if(!dn.monsterGarrisonHired) xp += dungeonMonsterXp(campaign, dn); }
    return Math.ceil(xp / fam);
  }
  // The morale row for moraleModifiersFor (late-bound, the militia/banditry precedent). A negative value:
  //   shortfall  = −max(0, requiredGpf − domain.dungeonGarrisonPaidGpf)   (RR p.387 worked example)
  //   + −2 per self-garrisoned dungeon (monsterGarrisonHired — RR p.387's chaotic-monsters case; v1
  //     applies the −2 flat, the common case, rather than checking the dungeon/peasant alignment — 🔧).
  // Returns { value, label } or null when 0.
  function dungeonGarrisonMoralePenalty(campaign, d){
    if(!campaign || !d) return null;
    const owned = _domainOwnedDungeons(campaign, d);
    if(!owned.length) return null;
    const requiredGpf = dungeonRequiredGarrisonGpf(campaign, d);
    const paidGpf = Math.max(0, Number(d.dungeonGarrisonPaidGpf) || 0);
    const shortfall = Math.max(0, requiredGpf - paidGpf);
    const selfGarrisoned = owned.filter(dn => dn.monsterGarrisonHired).length;
    const value = -(shortfall) - (2 * selfGarrisoned);
    if(value >= 0) return null;
    const bits = [];
    if(shortfall > 0) bits.push('dungeon garrison short ' + shortfall + 'gp/family');
    if(selfGarrisoned > 0) bits.push(selfGarrisoned + ' dungeon' + (selfGarrisoned === 1 ? '' : 's') + ' garrisoned by its own monsters');
    return { value, label: 'Peasants and dungeons (RR p.387) — ' + bits.join('; ') };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Event emit — record-only (mirror religion's _recordReligionEvent): newEvent + setEventContext +
  // status APPLIED + push the eventLog entry. The arcane events are record-only audits (the verbs above
  // already applied state); applyEvent_arcaneAudit (acks-engine-events.js) keeps them well-formed on replay.
  // ════════════════════════════════════════════════════════════════════════════
  function _recordArcaneEvent(campaign, kind, payload, opts){
    const A = _A();
    opts = opts || {};
    if(!campaign || typeof A.newEvent !== 'function') return null;
    const cal = (campaign.calendar) || {};
    let ev;
    try {
      ev = A.newEvent(kind, {
        submittedBy: 'engine', cadence: opts.cadence || 'monthly-turn', targetTurn: _currentTurn(campaign),
        gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: (campaign.currentDayInMonth) || 1 },
        payload: Object.assign({ narrative: opts.narrative }, payload || {})
      });
    } catch(_e){ return null; }
    if(typeof A.setEventContext === 'function'){
      A.setEventContext(ev, { primaryHexId: opts.primaryHexId || null, relatedEntities: opts.relatedEntities || [] });
    }
    if(opts.campaignLogHidden) ev.campaignLogHidden = true;
    ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
    ev.appliedAtTurn = _currentTurn(campaign);
    ev.appliedAtDay = (campaign.currentDayInMonth) || 1;
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: opts.narrative || (kind + ' applied') },
      appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString(),
      ...(opts.campaignLogHidden ? { campaignLogHidden: true } : {}) });
    return ev;
  }

  // ── Export onto window.ACKS ──
  Object.assign(ACKS, {
    // constants
    DAYS_PER_MONTH, ARCANE_EXTRACT_PCT, SANCTUM_MIN_LEVEL, ARCANE_CLASSES,
    // AD-A — predicates + lookups
    isArcaneCaster, canOperateDungeon, totalAreaSqFt,
    dungeonMonsterXp, dungeonSubjugatedXp, dungeonArcanePowerPerDay, dungeonArcanePowerPerMonth,
    dungeonAreaCount, dungeonLairCapacity, dungeonIsFull, anchorLairToDungeon,
    // AD-D — attunement + sovereignty
    blankAttunement, rollArcaneThrow, attuneToDungeon, endAttunement,
    establishSovereignty, loseSovereignty,
    // AD-E — arcane power + the §5 contract accessors
    dungeonsForArcaneCaster, arcanePowerAvailable, spendArcanePower, processArcaneForTurn,
    specialComponentsHeldBy, researchFacilityFor, researchAssistantsFor,
    // AD-E — harvesting + domain effects
    harvestDungeon, dungeonRequiredGarrisonGpf, dungeonGarrisonMoralePenalty
  });

})(typeof window !== 'undefined' ? window : global);
