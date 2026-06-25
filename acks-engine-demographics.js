/* =============================================================================
 * acks-engine-demographics.js — Settlement Demographics SD-1 (the urban derived core)
 *
 * The JJ Step-3 "Determine Inhabitants" Starting-Settlements roster (JJ pp.214–217)
 * made LEGIBLE to the tool: a settlement carries a derived demographic profile —
 * who lives here, by the six core class-buckets × level — and every named NPC with a
 * home here is reconciled against that expectation (filled / open / exceptional).
 *
 * DERIVE-DON'T-STORE (Architecture §3.13; Settlement_Demographics_Plan.md §4):
 *   - expected  = a PURE function of market class + settlement.families (the RAW Step-3
 *                 distribution, pro-rata scaled). Computed, never stored.
 *   - realized  = the named campaign.characters[] tagged homeSettlementId === here,
 *                 bucketed by class (coreBucketForCharacter). Derived by query.
 *   - delta     = expected − realized per (bucket, level): open slots + exceptional outliers.
 * No new entity / prefix / collection (the §3.1 test fails a census record). The only
 * stored surface is two additive fields elsewhere: character.homeSettlementId (the home
 * pointer) + settlement.demographicOverrides (the RAW p.214 GM override). Both additive,
 * read defensively, migration-free (the 6 templates + demo stay migrate-no-ops).
 *
 * THE MODEL — anchor on all six per-class frequency columns (NOT a single master).
 *   RAW (JJ p.214): "For each class of settlement (I through VI) we have provided the
 *   suggested number of NPCs of each level... If your settlement is smaller or larger
 *   than the listed size, you can scale up or scale down pro rata by population." So the
 *   method is: pick your class's table, pro-rata WITHIN that class's band off its reference
 *   population. expected(bucket,L) = ALL[class][L] × (families / refFamilies[class])
 *   × splitFrac(bucket,L). The six "All" columns are the per-class level-pyramids
 *   (STARTING_SETTLEMENT_ALL); the split is the level-dependent class distribution
 *   (LEVEL_CLASS_SPLIT, derived from the Class-I master — Mage rises / Fighter falls).
 *
 *   ⚠ Build-time correction to Settlement_Demographics_Plan.md §13 OQ-1 (2026-06-16):
 *   the discharge note said a SINGLE Class-I master pro-rata'd by population reproduces
 *   all six tables within ±1. It does NOT — the small-class tables are deliberately
 *   FLATTER: pure Class-I pro-rata gives Class VI ≈35 NPCs vs the printed 49 (its mid
 *   levels — L3 printed 8 vs pro-rata 3 — are far denser; a village always has a few
 *   notable figures a geometric pyramid wouldn't predict). So the model anchors on all
 *   SIX "All" columns (each its own shape), pro-rata within the band. Still DERIVE (the
 *   generative model — six frequency vectors × one split × pro-rata — not the printed
 *   bucket grid), still IP-light. Verified: this reproduces every printed cell within ±1
 *   (the residual ±1s are the printed tables' own rounding). The verdict (DERIVE,
 *   IP-light, no §13.9) holds; the parameter set expands one column → six.
 *
 * IP (CLAUDE §13.6, plan §13 OQ-6 — IP-light, no §13.9 checkpoint for the people layer):
 *   the parameters below are MECHANICAL FACTS (NPC counts) reorganized into a generative
 *   model (six frequency vectors + a split function + a pro-rata rule = ~168 numbers vs
 *   the 588 printed cells) — facts + significant reorganization, no prose, cited JJ
 *   pp.214–217. Far lighter than the already-shipped MONSTER_CATALOG / encounter tables.
 *   The smoke asserts ~6–8 oracle cells; the six printed tables are NOT a committed fixture.
 *
 * BUCKETING — JJ p.214's DEMOGRAPHIC mapping, NOT #154's coreClassMapping (OQ-9, resolved
 *   at build 2026-06-16): they diverge. JJ p.214 buckets assassins/bards/elven-nightblades
 *   as THIEVES (demographic); #154's coreClassMapping derives assassin/bard → FIGHTER (the
 *   save-progression core, for generation). A *census* uses the JJ p.214 Step-3 mapping —
 *   DEMOGRAPHIC_BUCKET_BY_CLASS below. #154's mapping is consulted only as a fallback for a
 *   genuinely-custom class a character references by template (forward-compat).
 *
 * SCOPE (SD-1 — the urban derived core; plan §11). IN: the four derived accessors +
 *   demographicMarketClass + coreBucketForCharacter; the model parameters. OUT (SD-2+):
 *   placementRole; wiring the sources (recruit/generate/encounter auto-set a home); the
 *   reconciliation WORKSPACE + the auto-generate toggle (SD-2); the realm tier + homeDomainId
 *   (SD-3); the rural census (SD-4); the consumer reads — encounters/services/queries (SD-5);
 *   the magic-item + wealth census (SD-6/SD-7). This lane is headless + a settlement read.
 *
 * Load order: LATE (after acks-engine.js for lookupMarketClass + acks-engine-custom-classes.js
 *   for the optional template fallback). All cross-module refs resolve at call-time on the
 *   shared global.ACKS, so load order never matters for the function bodies.
 *
 * SD-1 authored 2026-06-16 (code session) — Settlement_Demographics_Plan.md.
 * =============================================================================
 */
(function(global){
'use strict';
global.ACKS = global.ACKS || {};
const ACKS = global.ACKS;

// Call-time aliases (resolve on global.ACKS at invocation — sibling load order irrelevant).
const lookupMarketClass            = (...a) => ACKS.lookupMarketClass(...a);
const customClassCoreClassMapping  = (...a) => (typeof ACKS.customClassCoreClassMapping === 'function' ? ACKS.customClassCoreClassMapping(...a) : null);
const isHouseRuleEnabled           = (...a) => (typeof ACKS.isHouseRuleEnabled === 'function' ? ACKS.isHouseRuleEnabled(...a) : false);

// The six core demographic buckets, in canonical order (JJ p.214).
const DEMOGRAPHIC_BUCKETS = Object.freeze(['fighter','crusader','thief','mage','explorer','venturer']);
const MAX_NPC_LEVEL = 14;

// JJ Step-3 reference populations — the family count each printed table is anchored to
// (JJ pp.215–216). Pro-rata scales a settlement's families against its class's reference.
const STARTING_SETTLEMENT_REF_FAMILIES = Object.freeze({ I:20000, II:5000, III:2500, IV:625, V:250, VI:80 });

// The six "All" frequency columns — the per-class level pyramids (JJ pp.215–216). Index 0 =
// level 1. MODEL PARAMETERS (the frequency vectors), not the printed bucket grid: the per-bucket
// counts are DERIVED (All × the level split). Each column's sum equals the printed table total
// (I 8885 / II 2245 / III 1142 / IV 305 / V 125 / VI 49). The small-class columns are flatter
// than a geometric pyramid (RAW design — a village keeps a few notable figures), which is why
// the model anchors on all six rather than pro-rata'ing one master (see the header correction).
const STARTING_SETTLEMENT_ALL = Object.freeze({
  I:   Object.freeze([5632,2050,748,276,100,40,16,5,5,4,3,3,2,1]),
  II:  Object.freeze([1408,514,191,72,27,12,5,4,4,3,2,2,1,0]),
  III: Object.freeze([710,258,98,36,17,6,5,4,3,2,2,1,0,0]),
  IV:  Object.freeze([179,69,24,12,7,7,3,2,1,1,0,0,0,0]),
  V:   Object.freeze([74,28,9,5,3,3,2,1,0,0,0,0,0,0]),
  VI:  Object.freeze([23,10,8,4,2,1,1,0,0,0,0,0,0,0])
});

// The level-dependent class split — the demographic distribution by level, derived from the
// Class-I master (JJ p.215, bucket ÷ All). Mage rises / Fighter falls / Explorer falls with
// level; Crusader/Thief hold ~20%, Venturer ~10%. Each row = the 6 bucket fractions in
// DEMOGRAPHIC_BUCKETS order [fighter, crusader, thief, mage, explorer, venturer], index 0 = L1.
// Applied to each class's own "All" column it reproduces the printed bucket cells within ±1
// (exact for Class I, by construction). (Some rows sum slightly under 1.0 — the printed % tail
// is independently rounded; the model preserves that fidelity rather than re-normalizing.)
const LEVEL_CLASS_SPLIT = Object.freeze([
  /*  1 */ Object.freeze([0.268, 0.200, 0.200, 0.100, 0.132, 0.100]),
  /*  2 */ Object.freeze([0.268, 0.200, 0.200, 0.100, 0.132, 0.100]),
  /*  3 */ Object.freeze([0.268, 0.200, 0.200, 0.100, 0.132, 0.100]),
  /*  4 */ Object.freeze([0.268, 0.200, 0.200, 0.100, 0.132, 0.100]),
  /*  5 */ Object.freeze([0.230, 0.200, 0.200, 0.150, 0.120, 0.100]),
  /*  6 */ Object.freeze([0.225, 0.200, 0.200, 0.150, 0.125, 0.100]),
  /*  7 */ Object.freeze([0.250, 0.1875, 0.1875, 0.125, 0.125, 0.125]),
  /*  8 */ Object.freeze([0.200, 0.200, 0.200, 0.150, 0.120, 0.100]),
  /*  9 */ Object.freeze([0.200, 0.200, 0.200, 0.150, 0.120, 0.100]),
  /* 10 */ Object.freeze([0.1675, 0.200, 0.200, 0.1875, 0.0825, 0.100]),
  /* 11 */ Object.freeze([0.1667, 0.200, 0.200, 0.250, 0.0833, 0.100]),
  /* 12 */ Object.freeze([0.1667, 0.200, 0.200, 0.250, 0.0833, 0.100]),
  /* 13 */ Object.freeze([0.170, 0.200, 0.200, 0.250, 0.085, 0.100]),
  /* 14 */ Object.freeze([0.170, 0.200, 0.200, 0.250, 0.080, 0.100])
]);

// JJ p.214's DEMOGRAPHIC class→bucket mapping (the Step-3 source — see the header OQ-9 note;
// distinct from #154's save-progression coreClassMapping). Keys are normalized class names.
const DEMOGRAPHIC_BUCKET_BY_CLASS = Object.freeze({
  // the six core buckets themselves
  fighter:'fighter', mage:'mage', thief:'thief', cleric:'crusader', crusader:'crusader',
  explorer:'explorer', venturer:'venturer',
  // → fighters (JJ p.214)
  barbarian:'fighter', paladin:'fighter', 'dwarven-vaultguard':'fighter', vaultguard:'fighter',
  // → crusaders
  bladedancer:'crusader', 'dwarven-craftpriest':'crusader', craftpriest:'crusader',
  priestess:'crusader', priest:'crusader', shaman:'crusader', witch:'crusader',
  // → thieves
  assassin:'thief', bard:'thief', 'elven-nightblade':'thief', nightblade:'thief',
  // → mages
  warlock:'mage', 'elven-spellsword':'mage', spellsword:'mage',
  'nobiran-wonderworker':'mage', wonderworker:'mage', 'zaharan-ruinguard':'mage', ruinguard:'mage'
});

function _normClassName(s){ return String(s == null ? '' : s).trim().toLowerCase().replace(/\s+/g, '-'); }

// The settlement's market class for demographics: a GM override (settlement.marketClass) wins,
// else derive from families. 'VI*' (hamlet, <75 families) uses the Class VI table pro-rata'd
// below 80 — JJ's smallest table. Mirrors events.js _marketClassRoman.
function demographicMarketClass(settlement){
  let mc = settlement && settlement.marketClass;
  if(!mc){ const row = lookupMarketClass((settlement && settlement.families) || 0); mc = row ? row.class : 'VI'; }
  if(mc === 'VI*') mc = 'VI';
  return STARTING_SETTLEMENT_ALL[mc] ? mc : 'VI';
}

// Which of the six demographic buckets a character counts as (JJ p.214), or null (a monster /
// unclassed / unknown-class NPC is unbucketed — counted as "other", not against a core bucket).
function coreBucketForCharacter(campaign, character){
  if(!character) return null;
  const key = _normClassName(character.class);
  if(key && DEMOGRAPHIC_BUCKET_BY_CLASS[key]) return DEMOGRAPHIC_BUCKET_BY_CLASS[key];
  // Forward-compat: a character that references a #154 custom-class template (not a field
  // characters carry today) → the template's save-derived bucket, as a best-available fallback.
  const tplId = character.customClassId || character.classTemplateId;
  if(tplId && campaign && Array.isArray(campaign.customClasses)){
    const tpl = campaign.customClasses.find(t => t && t.id === tplId);
    if(tpl){ const b = customClassCoreClassMapping(tpl); if(b && DEMOGRAPHIC_BUCKETS.indexOf(b) >= 0) return b; }
  }
  return null;
}

function _emptyBucketMap(){ const m = {}; DEMOGRAPHIC_BUCKETS.forEach(b => { m[b] = 0; }); return m; }

// EXPECTED — the pure RAW Step-3 distribution for a settlement, scaled by population, with the
// GM override applied. Returns fractional expected counts (a value < 1 = the RAW "% chance that
// such a character exists"). overrides: { all?:mult, fighter?:mult, ... } per-bucket multipliers
// (RAW p.214 "city of wizards" = {mage:3}; "denuded" = {all:0.5}). Pure fn of the settlement.
function expectedDemographics(settlement, opts){
  opts = opts || {};
  if(!settlement) return null;
  const families = Number(settlement.families) || 0;
  const mc = demographicMarketClass(settlement);
  const allCol = STARTING_SETTLEMENT_ALL[mc];
  const refFam = STARTING_SETTLEMENT_REF_FAMILIES[mc] || 80;
  const scale = refFam > 0 ? (families / refFam) : 0;
  const ov = settlement.demographicOverrides || opts.overrides || null;
  const allMult = (ov && typeof ov.all === 'number') ? ov.all : 1;
  const byLevel = [];
  const totals = Object.assign({ all: 0 }, _emptyBucketMap());
  for(let i = 0; i < MAX_NPC_LEVEL; i++){
    const expectedAll = allCol[i] * scale * allMult;
    const split = LEVEL_CLASS_SPLIT[i];
    const row = { level: i + 1, all: expectedAll };
    DEMOGRAPHIC_BUCKETS.forEach((b, bi) => {
      const bMult = (ov && typeof ov[b] === 'number') ? ov[b] : 1;
      const v = expectedAll * split[bi] * bMult;
      row[b] = v;
      totals[b] += v;
    });
    totals.all += expectedAll;
    byLevel.push(row);
  }
  return {
    settlementId: settlement.id || null,
    marketClass: mc,
    families,
    referenceFamilies: refFam,
    scale,
    buckets: DEMOGRAPHIC_BUCKETS,
    maxLevel: MAX_NPC_LEVEL,
    overrides: ov || null,
    byLevel,
    totals
  };
}

function _isResident(character, settlementId){
  return !!character && character.homeSettlementId === settlementId && character.lifecycleState !== 'deceased';
}

// REALIZED — the named NPCs that actually have a home here, bucketed + counted per (bucket, level).
// Unbucketed residents (monsters / unclassed) land in `other`. Derived by query over campaign.characters[].
function realizedDemographics(campaign, settlementId){
  const chars = (campaign && Array.isArray(campaign.characters)) ? campaign.characters : [];
  const byLevel = [];
  for(let i = 0; i < MAX_NPC_LEVEL; i++){
    const row = { level: i + 1, all: 0 };
    DEMOGRAPHIC_BUCKETS.forEach(b => { row[b] = 0; row[b + 'Names'] = []; });
    byLevel.push(row);
  }
  const totals = Object.assign({ all: 0 }, _emptyBucketMap());
  const other = [];
  for(const c of chars){
    if(!_isResident(c, settlementId)) continue;
    const lvl = Math.max(1, Math.min(MAX_NPC_LEVEL, Number(c.level) || 1));
    const i = lvl - 1;
    const bucket = coreBucketForCharacter(campaign, c);
    if(bucket){
      byLevel[i][bucket] += 1;
      byLevel[i][bucket + 'Names'].push({ id: c.id, name: c.name || '(unnamed)', level: Number(c.level) || 1 });
      byLevel[i].all += 1;
      totals[bucket] += 1;
      totals.all += 1;
    } else {
      other.push({ id: c.id, name: c.name || '(unnamed)', level: Number(c.level) || 1, class: c.class || '' });
    }
  }
  return { settlementId, byLevel, totals, other, otherCount: other.length, residents: totals.all + other.length };
}

// DELTA — expected vs realized per (bucket, level): open slots + exceptional outliers (a realized
// NPC beyond even the rounded-up expectation, or one existing where the table gives <50% chance —
// the village Fighter-12; RAW invites the exception, so flag-don't-forbid).
function demographicDelta(campaign, settlement){
  if(!settlement) return null;
  const expected = expectedDemographics(settlement);
  const realized = realizedDemographics(campaign, settlement.id);
  const byLevel = [];
  let openTotal = 0, exceptionalTotal = 0;
  for(let i = 0; i < MAX_NPC_LEVEL; i++){
    const e = expected.byLevel[i], r = realized.byLevel[i];
    const row = { level: i + 1 };
    DEMOGRAPHIC_BUCKETS.forEach(b => {
      const exp = e[b], real = r[b];
      const open = Math.max(0, Math.round(exp) - real);
      const exceptional = (real > Math.ceil(exp)) || (exp < 0.5 && real >= 1);
      if(open > 0) openTotal += open;
      if(exceptional && real > 0) exceptionalTotal += real;
      row[b] = { expected: exp, realized: real, open, exceptional: exceptional && real > 0, names: r[b + 'Names'] };
    });
    byLevel.push(row);
  }
  return { settlementId: settlement.id, expected, realized, byLevel, openTotal, exceptionalTotal };
}

// Convenience for the UI / consumers — the full picture in one call.
function settlementDemographics(campaign, settlement){
  if(!settlement) return null;
  return demographicDelta(campaign, settlement);
}

// UI helper: render a fractional expected count — an integer when ≥1, the RAW "% chance" when
// 0 < v < 1, an em-dash at 0.
function formatExpectedCount(v){
  const n = Number(v) || 0;
  if(n <= 0) return '—';
  if(n < 1) return Math.round(n * 100) + '%';
  return String(Math.round(n));
}

// ── PLACEMENT (SD-2, JJ Step 4 p.217) — where in the settlement an NPC belongs ───────────────────
// v1 is a lightweight role string. The rich civic-POI model (Tower of Knowledge / Thieves' Quarter
// / Temple / Emporium as real entities) is Settlement Adventures (Phase 3.5 §5), unshipped — so
// placementRole is a string now and upgrades to a POI id when that lands (plan §6, the project's
// lightweight-now/rich-later path). Auto-suggested from the demographic bucket; a domain ruler sits
// at the municipal seat; the GM override (character.placementRole) wins.
const PLACEMENT_ROLES = Object.freeze([
  'municipal-seat','tower-of-knowledge','temple','thieves-quarter',
  'mercenary-guildhouse','emporium','gatehouse','none'
]);
const PLACEMENT_ROLE_LABELS = Object.freeze({
  'municipal-seat':'Municipal seat', 'tower-of-knowledge':'Tower of Knowledge',
  'temple':'Temple', 'thieves-quarter':"Thieves' Quarter",
  'mercenary-guildhouse':'Mercenary Guildhouse', 'emporium':'Emporium',
  'gatehouse':'Gatehouse / wilds-ward', 'none':'(unassigned)'
});
// Bucket → suggested civic POI (JJ Step 4 p.217: mages→Tower of Knowledge, divine→temple,
// thieves→thieves' quarter, venturers→emporium). The two buckets RAW leaves unnamed get a
// best-effort: fighter→mercenary-guildhouse (the fighting-hireling venue), explorer→gatehouse
// (the wilds-ward — explorers have no named civic POI in RAW).
const BUCKET_PLACEMENT = Object.freeze({
  mage:'tower-of-knowledge', crusader:'temple', thief:'thieves-quarter',
  venturer:'emporium', fighter:'mercenary-guildhouse', explorer:'gatehouse'
});

// The RAW Step-4 default placement for a character: a domain ruler → the municipal seat; else the
// bucket's civic POI; else 'none' (unbucketed). Pure suggestion — character.placementRole overrides.
function suggestedPlacementRole(campaign, character){
  if(!character) return 'none';
  if(campaign && Array.isArray(campaign.domains) && campaign.domains.some(d => d && d.rulerCharacterId === character.id)) return 'municipal-seat';
  const bucket = coreBucketForCharacter(campaign, character);
  return (bucket && BUCKET_PLACEMENT[bucket]) || 'none';
}
// The effective placement = the GM override (character.placementRole, when a known role) else the
// suggestion. The one accessor the UI + consumers read.
function effectivePlacementRole(campaign, character){
  const stored = character && character.placementRole;
  if(stored && PLACEMENT_ROLES.indexOf(stored) >= 0) return stored;
  return suggestedPlacementRole(campaign, character);
}
function placementRoleLabel(role){ return PLACEMENT_ROLE_LABELS[role] || role || '(unassigned)'; }

// ── SD-5a: THE EMERGENT READS — the world's people as a queryable index (plan §8) ─────────────────
// Pure derived reads over the realized roster (realizedDemographics): service legibility + the
// world-people query surface. No new stored surface — every downstream consumer (Sages #147,
// Spellcasting Services, recruitment grounding, and the SD-5b civilized-encounter grounding)
// reads these. The census stops being a panel you look at and becomes something the world uses.

// A flat, level-sorted list of a settlement's named residents — the query base over the roster.
function settlementResidents(campaign, settlementId){
  const chars = (campaign && Array.isArray(campaign.characters)) ? campaign.characters : [];
  const out = [];
  for(const c of chars){
    if(!_isResident(c, settlementId)) continue;
    out.push({ id: c.id, name: c.name || '(unnamed)', level: Number(c.level) || 1,
               class: c.class || '', bucket: coreBucketForCharacter(campaign, c) });
  }
  out.sort((a, b) => b.level - a.level || (a.name || '').localeCompare(b.name || ''));
  return out;
}

// The highest-level resident in each of the six buckets (or null) — substrate for service
// legibility + "notable residents". → { fighter:{id,name,level,class}|null, crusader:…, … }.
function topResidentByBucket(campaign, settlementId){
  const top = {}; DEMOGRAPHIC_BUCKETS.forEach(b => { top[b] = null; });
  for(const r of settlementResidents(campaign, settlementId)){
    if(r.bucket && (!top[r.bucket] || r.level > top[r.bucket].level)) top[r.bucket] = r;
  }
  return top;
}

// What each bucket's presence affords (service legibility — plan §8: "is there a caster high enough
// to Remove Curse / a trainer for this class / a sage here?"). v1 reports the top caster/trainer
// level per bucket + a plain-language service note; the precise per-class spell-level / training
// math belongs to the CONSUMING subsystem (Spellcasting Services / Sages #147 / Training) — this
// layer answers "who's here, and how capable," not the rules engine.
const BUCKET_SERVICE = Object.freeze({
  mage:'arcane spellcasting & research assistance',
  crusader:'divine spellcasting (healing, Remove Curse)',
  thief:'thieving services & a fence',
  venturer:'mercantile dealing & sage lore',
  fighter:'weapon training & mercenary captaincy',
  explorer:'guides & wilderness lore'
});
function settlementServices(campaign, settlementId){
  const top = topResidentByBucket(campaign, settlementId);
  const rows = DEMOGRAPHIC_BUCKETS.map(b => {
    const r = top[b];
    return { bucket: b, topResident: r, level: r ? r.level : 0,
             service: BUCKET_SERVICE[b] || '',
             // ACKS mentor convention — a teacher trains a student of strictly lower level (RR p.122).
             trainsUpToLevel: r ? Math.max(0, r.level - 1) : 0 };
  });
  return { settlementId, rows,
           arcaneCasterLevel: top.mage ? top.mage.level : 0,
           divineCasterLevel: top.crusader ? top.crusader.level : 0 };
}

// A settlement's home-hex coord (defensive — top store first), or null. For near/within-hexes queries.
function _settlementCoord(campaign, settlementId){
  const s = (typeof ACKS.findSettlement === 'function') ? ACKS.findSettlement(campaign, settlementId) : null;
  const hexId = s && s.hexId;
  if(!hexId || !campaign || !Array.isArray(campaign.hexes)) return null;
  const h = campaign.hexes.find(x => x && x.id === hexId);
  return (h && h.coord) ? h.coord : null;
}

// The settlement-id set for a scope — a domain (optionally its whole realm: the domain + its
// sub-vassal chain, RAW realm = ruler + sub-vassals). Defensive over the shipped primitives.
function _settlementIdsForScope(campaign, domainId, includeVassals){
  const ids = new Set();
  const addDomain = dId => {
    const list = (typeof ACKS.settlementsForDomain === 'function') ? ACKS.settlementsForDomain(campaign, dId) : [];
    list.forEach(s => { if(s && s.id) ids.add(s.id); });
  };
  addDomain(domainId);
  if(includeVassals && campaign && Array.isArray(campaign.domains)){
    const dom = campaign.domains.find(d => d && d.id === domainId);
    const rulerId = dom && dom.rulerCharacterId;
    if(rulerId && typeof ACKS.derivedVassalDomainsOf === 'function'){
      (ACKS.derivedVassalDomainsOf(campaign, rulerId) || []).forEach(vd => { if(vd && vd.id) addDomain(vd.id); });
    }
  }
  return ids;
}

// THE QUERY — the named residents matching {bucket, classKey, minLevel, maxLevel} within a scope:
//   settlementId → that settlement; domainId (+includeVassals → the realm) → the domain's settlements;
//   nearHexId + withinHexes → settlements within K hexes of an anchor; else campaign-wide.
// → [{id,name,level,class,bucket,settlementId,settlementName,distance?}] sorted by level desc.
// The "every Mage-9+ within N hexes" / "which settlement could train my thief?" surface.
function findResidents(campaign, query){
  query = query || {};
  const chars = (campaign && Array.isArray(campaign.characters)) ? campaign.characters : [];
  let scopeSet = null;                 // null = unrestricted by scope (campaign-wide)
  let anchorCoord = null, withinHexes = null;
  if(query.settlementId){ scopeSet = new Set([query.settlementId]); }
  else if(query.domainId){ scopeSet = _settlementIdsForScope(campaign, query.domainId, !!query.includeVassals); }
  else if(query.nearHexId && query.withinHexes != null){
    withinHexes = Number(query.withinHexes);
    if(campaign && Array.isArray(campaign.hexes)){
      const ah = campaign.hexes.find(h => h && h.id === query.nearHexId);
      anchorCoord = (ah && ah.coord) ? ah.coord : null;
    }
  }
  const bucket   = query.bucket || null;
  const classKey = query.classKey ? _normClassName(query.classKey) : null;
  const minLevel = (query.minLevel != null) ? Number(query.minLevel) : null;
  const maxLevel = (query.maxLevel != null) ? Number(query.maxLevel) : null;
  const nameCache = {}, coordCache = {};
  const settleName  = sid => { if(!(sid in nameCache)){ const s = (typeof ACKS.findSettlement === 'function') ? ACKS.findSettlement(campaign, sid) : null; nameCache[sid] = (s && s.name) || ''; } return nameCache[sid]; };
  const settleCoord = sid => { if(!(sid in coordCache)) coordCache[sid] = _settlementCoord(campaign, sid); return coordCache[sid]; };
  const out = [];
  for(const c of chars){
    if(!c || !c.homeSettlementId || c.lifecycleState === 'deceased') continue;
    const sid = c.homeSettlementId;
    if(scopeSet && !scopeSet.has(sid)) continue;
    let distance = null;
    if(anchorCoord){
      const cc = settleCoord(sid);
      if(!cc) continue;
      distance = (typeof ACKS.hexAxialDistance === 'function') ? ACKS.hexAxialDistance(anchorCoord, cc) : Infinity;
      if(distance > withinHexes) continue;
    }
    const cb = coreBucketForCharacter(campaign, c);
    if(bucket && cb !== bucket) continue;
    if(classKey && _normClassName(c.class) !== classKey) continue;
    const lvl = Number(c.level) || 1;
    if(minLevel != null && lvl < minLevel) continue;
    if(maxLevel != null && lvl > maxLevel) continue;
    const row = { id: c.id, name: c.name || '(unnamed)', level: lvl, class: c.class || '',
                  bucket: cb, settlementId: sid, settlementName: settleName(sid) };
    if(distance != null) row.distance = distance;
    out.push(row);
  }
  out.sort((a, b) => (b.level - a.level)
    || ((a.distance != null && b.distance != null) ? (a.distance - b.distance) : 0)
    || (a.name || '').localeCompare(b.name || ''));
  return out;
}

// The single most-notable (highest-level) resident across a scope — "the most powerful person here
// / in this domain / realm." opts: {settlementId} | {domainId[, includeVassals]} | {} (anywhere).
function mostNotableResident(campaign, opts){
  const list = findResidents(campaign, opts || {});
  return list.length ? list[0] : null;
}

// ── SD-5b: GROUNDING THE CIVILIZED ENCOUNTER — the census becomes who you meet (plan §8) ─────────
// The Encounter layer's JJ civilized identity tables (acks-engine-encounter-tables.js) name a
// PROFESSION (the catalog/cell key — "Man, Merchant" → 'merchant', "Man, Patroller" → 'patroller',
// …). When that profession maps to a census bucket AND a settlement at/near the hex has a realized
// resident of it, the encounter is GROUNDED to that actual person: not "a merchant," but the
// notable trader who lives in the town you're passing. The map is conservative — only the civilized
// cells that genuinely denote a leveled townsperson who resides nearby:
//   • merchant  → venturer  (the market's notable trader / Venturer)
//   • patroller → fighter   (the town guard / cavalry — a Fighter captain)
//   • pilgrim   → crusader  (🔧 soft: a pilgrim near a temple town reads as the local divine-caster)
// The JJ civilized tables have NO "Man, Mage" / "Man, Thief" / scout cell, so mage/thief/explorer
// residents are NOT reachable via civilized encounters — RAW-faithful (you don't randomly road-meet
// a wizard or a guild thief). bandit/brigand/nomad/tribal-warrior/raider/berserker = outlaws and
// wilderness folk (not residents); commoner/animals/demi-humans/lycanthropes = unmapped → null.
const CIVILIZED_CELL_BUCKET = Object.freeze({
  merchant: 'venturer',
  patroller: 'fighter',
  pilgrim: 'crusader'
});
function bucketForCivilizedCell(cellKey){ return CIVILIZED_CELL_BUCKET[cellKey] || null; }

// groundCivilizedEncounter(campaign, {hexId, cellKey, withinHexes=2}) → the grounded resident
// {characterId, settlementId, name, level, class, bucket, distance} or null. PURE + DETERMINISTIC
// (🔧 v1: the MOST-NOTABLE resident of the bucket — co-located settlement first, else the nearest
// within N hexes; so the preview + commit agree byte-for-byte and the GM may override on the
// entity). A future refinement could weight by level or vary the pick.
function groundCivilizedEncounter(campaign, opts){
  opts = opts || {};
  const bucket = bucketForCivilizedCell(opts.cellKey);
  if(!bucket || !campaign) return null;
  const hexId = opts.hexId || null;
  if(!hexId) return null;
  const within = (opts.withinHexes != null) ? Number(opts.withinHexes) : 2;
  const here = (typeof ACKS.settlementForHex === 'function') ? ACKS.settlementForHex(campaign, hexId) : null;
  // At a settlement's own hex its roster is AUTHORITATIVE — meet its most-notable resident of the
  // profession, or no one (a profession the town lacks reads as a nameless stranger, not an imported
  // neighbour). On the open road (no co-located settlement) → the most-notable of the profession
  // living within N hexes (a townsperson abroad).
  const match = (here && here.id)
    ? (findResidents(campaign, { settlementId: here.id, bucket: bucket })[0] || null)
    : (findResidents(campaign, { nearHexId: hexId, withinHexes: within, bucket: bucket })[0] || null);
  if(!match) return null;
  return { characterId: match.id, settlementId: match.settlementId, name: match.name,
           level: match.level, class: match.class, bucket: bucket,
           distance: (match.distance != null) ? match.distance : 0 };
}

// ── SD-3: THE REALM COMMAND STRUCTURE (T1) — the realm's expected leveled offices, reconciled ──────
// against its ACTUAL office-holders (plan §5 T1, §11). SD-1 is per-settlement; this is per-DOMAIN: a
// realm staffs a command structure — a ruler + the four magistrates + a court entourage — whose levels
// scale with the realm's title (RAW: the Econometrics "A Typical Legature", JJ Ch.9 ruler/entourage
// counts + RR domain rules — a count-tier legate L7–8 keeps a Captain of the Guard L5, a Magister L5–6,
// a Merchant Guildmaster L4, an Annalist L3…). This READS the realm's SHIPPED office-holders
// (domain.rulerCharacterId + domain.magistrates + the homeDomainId entourage + the vassal lords) and
// reconciles them against the expectation — it does NOT re-model them (OQ-4: a view over F&D, not a
// parallel store). Gated by the `living-census` house rule in the UI; the accessor is a pure derived
// read (the SD-1/SD-5a pattern). The rank-and-file (guards / regulars / apprentices, 0th–1st) stay
// COUNTS — they are the urban/rural roster, not named command offices.

// Expected ruler level by realm title — the RAW "Realm Ruler Level" band FLOOR for each realm type
// (JJ p.197 "Realms by Type"; the data corresponds to the RR Ch.8 "Tiers by Realm Size" table). RAW
// bands: Barony 3rd–4th, Viscounty 5th–6th, County 7th–8th, Duchy 9th–10th, Principality 11th–12th,
// Kingdom 13th–14th, Empire 14th. A ruler accrues XP from realm income until his monthly XP threshold
// halts him, so the title is the realm's MINIMUM ruler level; we anchor on the band floor and let the
// actual ruler's level override upward (realmCommandStructure's Math.max). realmTitleForDomain returns
// one of these seven; office levels scale off this floor.
// (Re-anchored to RAW 2026-06-24 — audit acks-authority I1: the prior {baron:6, viscount:7, count:8,
// duke:10, prince:11, king:12, emperor:14} ran +2–3 high at the low titles and 1 low at king.)
const TITLE_RULER_LEVEL = Object.freeze({ baron:3, viscount:5, count:7, duke:9, prince:11, king:13, emperor:14 });
const TITLE_LABELS = Object.freeze({ baron:'Baron', viscount:'Viscount', count:'Count', duke:'Duke', prince:'Prince', king:'King', emperor:'Emperor' });

// The named leveled offices of a realm's command structure (the Econometrics "A Typical Legature" §5 +
// the four shipped magistracies). relLevel = the office's level relative to the ruler's (clamped ≥1).
// mapsTo: 'ruler' → domain.rulerCharacterId; {magistrate} → the shipped magistracy slot; null →
// entourage (filled by a homeDomainId NPC of the bucket, greedily highest-level first).
const REALM_OFFICES = Object.freeze([
  Object.freeze({ key:'ruler',          label:'Ruler',                         bucket:null,       relLevel:0,  mapsTo:'ruler' }),
  Object.freeze({ key:'captainOfGuard', label:'Captain of the Guard',          bucket:'fighter',  relLevel:-3, mapsTo:{ magistrate:'captainOfGuard' } }),
  Object.freeze({ key:'chaplain',       label:'Chaplain (chief hospitalist)',  bucket:'crusader', relLevel:-2, mapsTo:{ magistrate:'chaplain' } }),
  Object.freeze({ key:'steward',        label:'Steward (household)',           bucket:'venturer', relLevel:-4, mapsTo:{ magistrate:'steward' } }),
  Object.freeze({ key:'munerator',      label:'Munerator (games & liturgies)', bucket:'venturer', relLevel:-4, mapsTo:{ magistrate:'munerator' } }),
  Object.freeze({ key:'magister',       label:'Magister (court mage)',         bucket:'mage',     relLevel:-2, mapsTo:null }),
  Object.freeze({ key:'guildmaster',    label:'Merchant Guildmaster',          bucket:'venturer', relLevel:-3, mapsTo:null }),
  Object.freeze({ key:'annalist',       label:'Annalist (court chronicler)',   bucket:'thief',    relLevel:-4, mapsTo:null })
]);

function realmRulerLevel(title){ return TITLE_RULER_LEVEL[String(title || '').toLowerCase()] || TITLE_RULER_LEVEL.baron; }
function realmOfficeLevel(office, rulerLevel){ return Math.max(1, (Number(rulerLevel) || 1) + ((office && office.relLevel) || 0)); }

function _findCharacterById(campaign, id){
  if(!id || !campaign || !Array.isArray(campaign.characters)) return null;
  return campaign.characters.find(c => c && c.id === id) || null;
}
function _holderRow(c){
  return c ? { id: c.id, name: c.name || '(unnamed)', level: Number(c.level) || 1, class: c.class || '' } : null;
}

// realmCommandStructure(campaign, domainId) → the realm's expected vs actual command structure.
// PURE derived read (the UI gates on `living-census`). → { domainId, title, titleLabel, rulerLevel,
// titleLevel, offices:[{key,label,bucket,expectedLevel,mapsTo,holder,filled,underLevel}],
// entourageOther:[…], vassalLords:[…], filledCount, openCount, officeCount }.
function realmCommandStructure(campaign, domainId){
  if(!campaign || !Array.isArray(campaign.domains)) return null;
  const domain = campaign.domains.find(d => d && d.id === domainId);
  if(!domain) return null;
  const title = (typeof ACKS.realmTitleForDomain === 'function') ? ACKS.realmTitleForDomain(domain) : 'baron';
  const rulerChar = _findCharacterById(campaign, domain.rulerCharacterId);
  // Office levels scale off the ruler's level, floored at the title's expected level — so a high-level
  // lord lifts his whole court, but an under-level (or vacant) lord never drops the court below the floor.
  const titleLevel = realmRulerLevel(title);
  const rulerLevel = Math.max(titleLevel, rulerChar ? (Number(rulerChar.level) || 1) : 0);

  // The entourage pool: homeDomainId NPCs that are NOT the ruler or a magistrate (so an office-holder
  // also homed here isn't double-counted). Highest-level first.
  const assignedIds = new Set();
  if(domain.rulerCharacterId) assignedIds.add(domain.rulerCharacterId);
  const mags = domain.magistrates || {};
  Object.keys(mags).forEach(rk => { const cid = mags[rk] && mags[rk].characterId; if(cid) assignedIds.add(cid); });
  const pool = (Array.isArray(campaign.characters) ? campaign.characters : [])
    .filter(c => c && c.homeDomainId === domainId && c.lifecycleState !== 'deceased' && !assignedIds.has(c.id))
    .sort((a, b) => (Number(b.level) || 1) - (Number(a.level) || 1));
  const usedEntourage = new Set();

  const offices = REALM_OFFICES.map(off => {
    const expectedLevel = realmOfficeLevel(off, rulerLevel);
    let holder = null, kind;
    if(off.mapsTo === 'ruler'){ kind = 'ruler'; holder = _holderRow(rulerChar); }
    else if(off.mapsTo && off.mapsTo.magistrate){
      kind = 'magistrate';
      const slot = mags[off.mapsTo.magistrate];
      holder = _holderRow(_findCharacterById(campaign, slot && slot.characterId));
    } else {
      kind = 'entourage';
      const pick = pool.find(c => !usedEntourage.has(c.id) && coreBucketForCharacter(campaign, c) === off.bucket);
      if(pick){ usedEntourage.add(pick.id); holder = _holderRow(pick); }
    }
    return { key: off.key, label: off.label, bucket: off.bucket, expectedLevel, mapsTo: kind,
             holder, filled: !!holder, underLevel: !!holder && holder.level < expectedLevel };
  });

  // Leftover homed NPCs not slotted into a command office — additional retainers.
  const entourageOther = pool.filter(c => !usedEntourage.has(c.id)).map(c => ({
    id: c.id, name: c.name || '(unnamed)', level: Number(c.level) || 1, class: c.class || '',
    bucket: coreBucketForCharacter(campaign, c)
  }));

  // The realm's direct vassal lords (informational — leveled NPCs the realm expects).
  const vassalLords = [];
  if(domain.rulerCharacterId && typeof ACKS.derivedVassalDomainsOf === 'function'){
    (ACKS.derivedVassalDomainsOf(campaign, domain.rulerCharacterId) || []).forEach(vid => {
      const vd = campaign.domains.find(d => d && d.id === vid);
      if(!vd) return;
      const vr = _findCharacterById(campaign, vd.rulerCharacterId);
      vassalLords.push({
        domainId: vd.id, domainName: vd.name || '(domain)',
        rulerId: vr ? vr.id : null, rulerName: vr ? (vr.name || '(unnamed)') : null,
        rulerLevel: vr ? (Number(vr.level) || 1) : null,
        title: (typeof ACKS.realmTitleForDomain === 'function') ? ACKS.realmTitleForDomain(vd) : null
      });
    });
  }

  const filledCount = offices.filter(o => o.filled).length;
  return {
    domainId, title, titleLabel: TITLE_LABELS[title] || title,
    rulerLevel, titleLevel,
    offices, entourageOther, vassalLords,
    filledCount, openCount: offices.length - filledCount, officeCount: offices.length
  };
}

// ── SD-4: THE RURAL / COUNTRYSIDE CENSUS (T2) — "A Typical Hex" (plan §5 T2, §11; Econometrics §5) ──
// SD-1 censuses the TOWN (per settlement, market-class); SD-3 the REALM COMMAND STRUCTURE (per domain).
// SD-4 censuses the COUNTRYSIDE — the leveled NPCs scattered across a domain's rural hexes (hedge
// wizards, robber bands, traveling friars, retired veterans). RAW's countryside generator is the
// Econometrics "A Typical Hex" (survey §5): a dice-rolled per-hex roster the worked example then
// organizes into Groups — exactly this layer's growing-roster + Group-individuation loop, RAW-demonstrated.
//
// DERIVE-DON'T-STORE (the SD-1/SD-3 spine): expected = a PURE function of the hex's rural population
// (the "A Typical Hex" template scaled pro-rata by hex.families, the JJ p.214 rule SD-1 uses);
// realized = the named campaign.characters[] tagged homeHexId === here (the new rural home pointer,
// the homeSettlementId/homeDomainId sibling); delta = open + exceptional. NO new entity / prefix /
// rule / event. The only stored surface is one additive field — character.homeHexId (on blankCharacter,
// defensive, migration-free); hex.demographicOverrides is read defensively if a GM sets it (NOT on
// blankHex — zero per-hex footprint). Gated by the EXISTING `living-census` house rule in the UI (the
// deep "everything" tier, like SD-3); the accessors are pure derived reads (always callable).
//
// THE TEMPLATE (the Econometrics "A Typical Hex", survey §5 — RAW dice expectations):
//   L1: 1d10 fighter, 1d8 cleric, 1d8 thief, 1d4 venturer, 87% mage  → E[5.5, 4.5, 4.5, 0.87, —, 2.5]
//   L2: 1d4 each fighter/cleric/thief, 1 venturer, 50% mage          → E[2.5, 2.5, 2.5, 0.5,  —, 1.0]
//   L3: 1d4 3rd-level (RAW gives only a level-total, no bucket)       → E[2.5 total → split]
//   L4: 20% chance of one 4th-level                                  → E[0.2 total → split]
// L1/L2 carry RAW's per-bucket dice; L3/L4 carry only a level-total (RAW specifies no bucket), which
// expectedRuralDemographics distributes across the rural buckets via the JJ Step-3 split (LEVEL_CLASS_SPLIT,
// explorer-excluded + renormalized) — the SAME demographic split the urban roster uses, so the rural
// tail inherits the established mage-rises/fighter-falls shape rather than a fabricated rule. RAW omits
// EXPLORERS from the countryside (the Econometrics 5-bucket model folds them into "Others"/venturer; an
// explorer is a wilderness/encounter NPC, not a settled rural resident — and, like SD-5b, has no civic
// role) → explorer = 0 in the rural template; a homed explorer reconciles as an exceptional outlier
// (the flag-don't-forbid the urban roster already uses).
//
// SCOPE (SD-4 — the rural derived census + a domain read surface). IN: the per-hex template +
// expected/realized/delta accessors + the domain aggregate + character.homeHexId. OUT (deferred): the
// realized AUTO-FILL (minting rural NPCs to fill the roster — needs the Phase 4.8 NPC generator;
// SD-2b/SD-3 precedent — ship the expectation + reconciliation + hand-assignment, defer auto-mint);
// the Group-individuation of a rolled hex into a robber band / friars (a generator + Group concern);
// rural specialists individuating vs staying counts (OQ-5 — default: counts; individuation on demand).

const RURAL_HEX_REF_FAMILIES   = 114;   // the rural population at which "A Typical Hex" is internally
// consistent with the §3 1st-level frequency: its 17.87 first-level NPCs = 2.666% of ~670 people ÷
// 5.86 people/family ≈ 114 families. A hex's countryside census scales pro-rata by hex.families.
const RURAL_TEMPLATE_MAX_LEVEL = 4;     // the template's depth (RAW's "A Typical Hex" tops out at 4th).

// The "A Typical Hex" template (the Econometrics countryside generator, survey §5). L1/L2 = RAW's
// per-bucket dice expectations; L3/L4 = a level-total RAW gives no bucket for (→ split at compute time).
const RURAL_HEX_TEMPLATE = Object.freeze([
  /* L1 */ Object.freeze({ byBucket: Object.freeze({ fighter:5.5, crusader:4.5, thief:4.5, mage:0.87, explorer:0, venturer:2.5 }) }),
  /* L2 */ Object.freeze({ byBucket: Object.freeze({ fighter:2.5, crusader:2.5, thief:2.5, mage:0.5,  explorer:0, venturer:1.0 }) }),
  /* L3 */ Object.freeze({ allTotal: 2.5 }),   // RAW "1d4 3rd-level" — E[1d4] = 2.5, bucket unspecified
  /* L4 */ Object.freeze({ allTotal: 0.2 })    // RAW "20% chance of one 4th-level"
]);

// Distribute a rural level-total across the five rural buckets (explorer excluded) using the JJ Step-3
// level-class split, renormalized — so the rural tail inherits the urban demographic shape, not a
// fabricated split. DEMOGRAPHIC_BUCKETS order is [fighter, crusader, thief, mage, explorer, venturer].
function _ruralBucketSplit(levelIndex){
  const split = LEVEL_CLASS_SPLIT[Math.max(0, Math.min(LEVEL_CLASS_SPLIT.length - 1, levelIndex))];
  const f = split[0], cr = split[1], th = split[2], m = split[3], v = split[5];   // drop explorer (index 4)
  const sum = f + cr + th + m + v;
  return { fighter:f/sum, crusader:cr/sum, thief:th/sum, mage:m/sum, explorer:0, venturer:v/sum };
}

// EXPECTED — the "A Typical Hex" roster scaled by the hex's rural population. Pure fn of the hex (scales
// by hex.families, or opts.ruralFamilies when a caller resolves it — e.g. the domain aggregate distributing
// a domain-level peasantFamilies across hexes). Returns MAX_NPC_LEVEL rows (the template's L1–4 populated,
// L5–14 zero) so it aligns row-for-row with realizedRuralDemographics + the urban delta shape. overrides
// (opts.overrides | hex.demographicOverrides, defensive — not on blankHex): { all?:mult, mage?:mult, … }.
function expectedRuralDemographics(hex, opts){
  opts = opts || {};
  if(!hex) return null;
  const families = (opts.ruralFamilies != null) ? Number(opts.ruralFamilies) : (Number(hex.families) || 0);
  const scale = RURAL_HEX_REF_FAMILIES > 0 ? (families / RURAL_HEX_REF_FAMILIES) : 0;
  const ov = opts.overrides || hex.demographicOverrides || null;
  const allMult = (ov && typeof ov.all === 'number') ? ov.all : 1;
  const byLevel = [];
  const totals = Object.assign({ all: 0 }, _emptyBucketMap());
  for(let i = 0; i < MAX_NPC_LEVEL; i++){
    const row = { level: i + 1, all: 0 };
    let perBucket = null;
    if(i < RURAL_TEMPLATE_MAX_LEVEL){
      const tpl = RURAL_HEX_TEMPLATE[i];
      if(tpl.byBucket){ perBucket = tpl.byBucket; }
      else { const sp = _ruralBucketSplit(i); perBucket = {}; DEMOGRAPHIC_BUCKETS.forEach(b => { perBucket[b] = tpl.allTotal * (sp[b] || 0); }); }
    }
    DEMOGRAPHIC_BUCKETS.forEach(b => {
      const bMult = (ov && typeof ov[b] === 'number') ? ov[b] : 1;
      const v = (perBucket ? (perBucket[b] || 0) : 0) * scale * allMult * bMult;
      row[b] = v; row.all += v; totals[b] += v;
    });
    totals.all += row.all;
    byLevel.push(row);
  }
  return { hexId: hex.id || null, ruralFamilies: families, referenceFamilies: RURAL_HEX_REF_FAMILIES,
           scale, buckets: DEMOGRAPHIC_BUCKETS, maxLevel: MAX_NPC_LEVEL, templateMaxLevel: RURAL_TEMPLATE_MAX_LEVEL,
           overrides: ov || null, byLevel, totals };
}

function _isRuralResident(character, hexId){
  return !!character && character.homeHexId === hexId && character.lifecycleState !== 'deceased';
}

// REALIZED — the named NPCs homed to a rural hex (homeHexId === here), bucketed + counted per (bucket,
// level). The rural sibling of realizedDemographics (which reads homeSettlementId). A homed NPC of ANY
// level is counted (a retired Fighter-7 in the wilds), so the grid spans MAX_NPC_LEVEL — anything above
// the template's L4 reconciles as exceptional. Unbucketed residents land in `other`.
function realizedRuralDemographics(campaign, hexId){
  const chars = (campaign && Array.isArray(campaign.characters)) ? campaign.characters : [];
  const byLevel = [];
  for(let i = 0; i < MAX_NPC_LEVEL; i++){
    const row = { level: i + 1, all: 0 };
    DEMOGRAPHIC_BUCKETS.forEach(b => { row[b] = 0; row[b + 'Names'] = []; });
    byLevel.push(row);
  }
  const totals = Object.assign({ all: 0 }, _emptyBucketMap());
  const other = [];
  for(const c of chars){
    if(!_isRuralResident(c, hexId)) continue;
    const lvl = Math.max(1, Math.min(MAX_NPC_LEVEL, Number(c.level) || 1));
    const i = lvl - 1;
    const bucket = coreBucketForCharacter(campaign, c);
    if(bucket){
      byLevel[i][bucket] += 1;
      byLevel[i][bucket + 'Names'].push({ id: c.id, name: c.name || '(unnamed)', level: Number(c.level) || 1 });
      byLevel[i].all += 1;
      totals[bucket] += 1;
      totals.all += 1;
    } else {
      other.push({ id: c.id, name: c.name || '(unnamed)', level: Number(c.level) || 1, class: c.class || '' });
    }
  }
  return { hexId, byLevel, totals, other, otherCount: other.length, residents: totals.all + other.length };
}

// Build a per-(bucket, level) delta from an expected + realized pair (the shared shape demographicDelta
// uses) — open slots + exceptional outliers. Returns { byLevel, openTotal, exceptionalTotal }.
function _buildRuralDelta(expected, realized){
  const byLevel = [];
  let openTotal = 0, exceptionalTotal = 0;
  for(let i = 0; i < MAX_NPC_LEVEL; i++){
    const e = expected.byLevel[i], r = realized.byLevel[i];
    const row = { level: i + 1 };
    DEMOGRAPHIC_BUCKETS.forEach(b => {
      const exp = e[b], real = r[b];
      const open = Math.max(0, Math.round(exp) - real);
      const exceptional = (real > Math.ceil(exp)) || (exp < 0.5 && real >= 1);
      if(open > 0) openTotal += open;
      if(exceptional && real > 0) exceptionalTotal += real;
      row[b] = { expected: exp, realized: real, open, exceptional: exceptional && real > 0, names: r[b + 'Names'] || [] };
    });
    byLevel.push(row);
  }
  return { byLevel, openTotal, exceptionalTotal };
}

// DELTA — expected vs realized for one rural hex (the SD-1 demographicDelta, rural). opts.ruralFamilies
// lets a caller (the domain aggregate) supply the resolved per-hex population.
function ruralDemographicDelta(campaign, hex, opts){
  if(!hex) return null;
  const expected = expectedRuralDemographics(hex, opts);
  const realized = realizedRuralDemographics(campaign, hex.id);
  const d = _buildRuralDelta(expected, realized);
  return { hexId: hex.id, expected, realized, byLevel: d.byLevel, openTotal: d.openTotal, exceptionalTotal: d.exceptionalTotal };
}

// A hex is RURAL (countryside) when it has no settlement on it — a settlement-hex is urban (the SD-1
// roster covers it). Mirrors the engine's _ruralHexes definition (peasantFamilies = Σ non-settlement
// hex.families). Checks both the embedded hex.settlement and a top-level settlement at the hex.
function _hexIsRural(campaign, hex){
  if(!hex) return false;
  // T6 single-home — a hex is urban iff a canonical settlement sits on it.
  if(typeof ACKS.settlementForHex === 'function' && ACKS.settlementForHex(campaign, hex.id)) return false;
  return true;
}
function _domainRuralHexes(campaign, domain){
  if(!campaign || !domain) return [];
  const hexes = (typeof ACKS.hexesForDomain === 'function')
    ? ACKS.hexesForDomain(campaign, domain.id)
    : (Array.isArray(campaign.hexes) ? campaign.hexes.filter(h => h && h.domainId === domain.id) : []);
  return hexes.filter(h => _hexIsRural(campaign, h));
}

// A flat, level-sorted list of a domain's rural residents (the workspace base — mirror settlementResidents,
// across all the domain's rural hexes). Each row carries its home hex for the UI.
function ruralResidents(campaign, domain){
  const hexes = _domainRuralHexes(campaign, domain);
  const ids = new Set(hexes.map(h => h.id));
  const nameOf = h => (typeof ACKS.hexName === 'function') ? ACKS.hexName(h, campaign) : (h.id || '');
  const hexById = {}; hexes.forEach(h => { hexById[h.id] = h; });
  const chars = (campaign && Array.isArray(campaign.characters)) ? campaign.characters : [];
  const out = [];
  for(const c of chars){
    if(!c || c.lifecycleState === 'deceased' || !ids.has(c.homeHexId)) continue;
    out.push({ id: c.id, name: c.name || '(unnamed)', level: Number(c.level) || 1, class: c.class || '',
               bucket: coreBucketForCharacter(campaign, c), hexId: c.homeHexId, hexName: nameOf(hexById[c.homeHexId]) });
  }
  out.sort((a, b) => b.level - a.level || (a.name || '').localeCompare(b.name || ''));
  return out;
}

// THE DOMAIN AGGREGATE — the countryside census for a whole domain (the UI's main read). Sums the
// "A Typical Hex" expectation + the realized residents across the domain's rural hexes, with the per-hex
// rural population resolved: hex.families when ANY are authored (Σ>0), else the domain's peasantFamilies
// distributed evenly across the rural hexes (the RAW-default domain-level population — so the census is
// demoable whether or not the families-per-hex rule is on). → { domainId, ruralFamilies, hexCount,
// inhabitedHexCount, byLevel, totals, openTotal, exceptionalTotal, hexes:[per-hex summary], residents }.
function domainRuralDemographics(campaign, domain){
  if(!campaign || !domain) return null;
  const hexes = _domainRuralHexes(campaign, domain);
  const authoredSum = hexes.reduce((s, h) => s + (Number(h.families) || 0), 0);
  const peasantFamilies = (domain.demographics && Number(domain.demographics.peasantFamilies)) || 0;
  const evenShare = hexes.length > 0 ? (peasantFamilies / hexes.length) : 0;
  const nameOf = h => (typeof ACKS.hexName === 'function') ? ACKS.hexName(h, campaign) : (h.id || '');

  // Combined expected + realized grids (MAX_NPC_LEVEL rows), summed across the rural hexes.
  const combExp = []; const combReal = [];
  for(let i = 0; i < MAX_NPC_LEVEL; i++){
    const e = { level: i + 1, all: 0 }; const r = { level: i + 1, all: 0 };
    DEMOGRAPHIC_BUCKETS.forEach(b => { e[b] = 0; r[b] = 0; r[b + 'Names'] = []; });
    combExp.push(e); combReal.push(r);
  }
  const totals = Object.assign({ all: 0 }, _emptyBucketMap());
  const realizedTotals = Object.assign({ all: 0 }, _emptyBucketMap());
  let totalRuralFamilies = 0, inhabited = 0;
  const perHex = [];
  for(const h of hexes){
    const fam = (authoredSum > 0) ? (Number(h.families) || 0) : evenShare;
    const exp = expectedRuralDemographics(h, { ruralFamilies: fam });
    const real = realizedRuralDemographics(campaign, h.id);
    const delta = _buildRuralDelta(exp, real);
    if(fam > 0) inhabited++;
    totalRuralFamilies += fam;
    for(let i = 0; i < MAX_NPC_LEVEL; i++){
      DEMOGRAPHIC_BUCKETS.forEach(b => {
        combExp[i][b] += exp.byLevel[i][b]; combExp[i].all += exp.byLevel[i][b];
        combReal[i][b] += real.byLevel[i][b];
        (real.byLevel[i][b + 'Names'] || []).forEach(n => combReal[i][b + 'Names'].push(Object.assign({ hexId: h.id, hexName: nameOf(h) }, n)));
        combReal[i].all += real.byLevel[i][b];
      });
    }
    DEMOGRAPHIC_BUCKETS.forEach(b => { totals[b] += exp.totals[b]; realizedTotals[b] += real.totals[b]; });
    totals.all += exp.totals.all; realizedTotals.all += real.totals.all;
    perHex.push({ hexId: h.id, hexName: nameOf(h), ruralFamilies: fam,
                  expectedAll: exp.totals.all, realizedResidents: real.residents,
                  openTotal: delta.openTotal, exceptionalTotal: delta.exceptionalTotal });
  }
  perHex.sort((a, b) => b.ruralFamilies - a.ruralFamilies || (a.hexName || '').localeCompare(b.hexName || ''));

  // The combined delta (one grid over the summed expected/realized).
  const d = _buildRuralDelta({ byLevel: combExp }, { byLevel: combReal });
  return {
    domainId: domain.id, ruralFamilies: totalRuralFamilies, referenceFamilies: RURAL_HEX_REF_FAMILIES,
    hexCount: hexes.length, inhabitedHexCount: inhabited,
    populationSource: (authoredSum > 0) ? 'per-hex' : 'domain-distributed',
    byLevel: d.byLevel, totals, realizedTotals, openTotal: d.openTotal, exceptionalTotal: d.exceptionalTotal,
    hexes: perHex, residents: ruralResidents(campaign, domain)
  };
}

// ── SD-2b: AUTO-GENERATION — fill open roster slots from the NPC generator (plan §7, §11) ──────────
// The generator-fed half of SD-2. SD-1/SD-2a made the roster legible + hand-fillable; SD-2b lets the
// tool MINT the notable NPCs an open slot expects, via the shipped generateNPC (Phase 4.8, burst8) —
// auto-homed + bucketed so they reconcile straight back into the roster (the SAME accessors). RAW-default
// polarity (CLAUDE §6): minting is gated behind `demographics-auto-generate` (default OFF) layered ON TOP
// of `living-census` (the deep tier) + requires the generator present. The rank-and-file stay COUNTS —
// only the NOTABLE tier (high-level casters / captains / guild leaders) individuates (plan §7), so the
// bulk fills a level FLOOR, capped, highest-level-first; a targeted verb fills one chosen (bucket, level)
// slot. DERIVE-DON'T-STORE holds: a minted NPC is a normal Character (home pointer + bucket) — no new
// stored surface, no new entity/prefix/event (generateNPC emits the shipped `generation` event).

// The gate — generator present + both rules on (plan §9: auto-gen is "an active behavior on top of an
// opt-in feature; requires the NPC generator + living-census"). → {ok, reason}. The verbs refuse with
// the reason (defensive — a scripted/integrator call can't mint past the gate); the UI mirrors it.
function demographicAutoGenStatus(campaign){
  if(typeof ACKS.generateNPC !== 'function') return { ok:false, reason:'no-generator' };
  if(!isHouseRuleEnabled(campaign, 'living-census')) return { ok:false, reason:'living-census-off' };
  if(!isHouseRuleEnabled(campaign, 'demographics-auto-generate')) return { ok:false, reason:'auto-generate-off' };
  return { ok:true, reason:'' };
}

// Mint ONE resident for a slot via the shipped generateNPC + land it. slot: { bucket, level,
// homeSettlementId? (urban — generateNPC homes it), hexId? (rural — → currentHexId), homeHexId? (rural
// home), homeDomainId? (realm-court home), currentDomainId? }. Passing `bucket` (NOT class) lets
// generateNPC resolve the class via its own tested _BUCKET_TO_CLASS_KEY (identity for the six cores),
// so the minted NPC buckets straight back to `bucket` via coreBucketForCharacter. opts.rng/seed thread a
// deterministic stream for tests; the browser default (Math.random) is fine for a one-shot GM action.
function _generateResident(campaign, slot, opts){
  opts = opts || {};
  if(typeof ACKS.generateNPC !== 'function') return null;
  const ctx = {
    bucket: slot.bucket,
    targetLevel: Math.max(1, Number(slot.level) || 1),
    controlledBy: 'gm', socialTier: 'independent',
    settlementId: slot.homeSettlementId || null,   // generateNPC sets homeSettlementId from this
    hexId: slot.hexId || null,                      // → currentHexId (a rural NPC stands in its hex)
    domainId: slot.currentDomainId || null          // → currentDomainId (geographic, NOT a home pointer)
  };
  const proposal = ACKS.generateNPC(campaign, ctx, { rng: opts.rng, seed: opts.seed });
  if(!proposal || !proposal.character) return null;
  const c = proposal.character;
  // the home pointers generateNPC does not set from ctx (it homes only via settlementId):
  if(slot.homeHexId)    c.homeHexId    = slot.homeHexId;     // the rural roster reads homeHexId
  if(slot.homeDomainId) c.homeDomainId = slot.homeDomainId;  // the realm command structure reads homeDomainId
  if(typeof ACKS.landGeneratedNPC === 'function') ACKS.landGeneratedNPC(campaign, proposal, opts);
  else { if(!Array.isArray(campaign.characters)) campaign.characters = []; campaign.characters.push(c); }
  return c;
}

// The open NOTABLE slots of a settlement's roster — open > 0, level ≥ minLevel — highest-level-first
// (the most notable first), then canonical bucket order. Pure read over demographicDelta.
function demographicOpenNotableSlots(campaign, settlement, opts){
  opts = opts || {};
  const minLevel = (opts.minLevel != null) ? Number(opts.minLevel) : 1;
  const delta = demographicDelta(campaign, settlement);
  if(!delta) return [];
  const slots = [];
  delta.byLevel.forEach(row => {
    if(row.level < minLevel) return;
    DEMOGRAPHIC_BUCKETS.forEach(b => { const cell = row[b]; if(cell && cell.open > 0) slots.push({ bucket:b, level:row.level, open:cell.open }); });
  });
  slots.sort((a, b) => b.level - a.level || DEMOGRAPHIC_BUCKETS.indexOf(a.bucket) - DEMOGRAPHIC_BUCKETS.indexOf(b.bucket));
  return slots;
}

// TARGETED — mint one NPC for a chosen (bucket, level) urban slot ("fill a chosen Mage-5", plan §11).
function fillDemographicSlot(campaign, settlement, bucket, level, opts){
  const gate = demographicAutoGenStatus(campaign);
  if(!gate.ok) return { ok:false, reason:gate.reason, character:null };
  if(!settlement || !settlement.id) return { ok:false, reason:'no-settlement', character:null };
  if(DEMOGRAPHIC_BUCKETS.indexOf(bucket) < 0) return { ok:false, reason:'bad-bucket', character:null };
  const c = _generateResident(campaign, { bucket, level, homeSettlementId: settlement.id }, opts);
  return c ? { ok:true, character:c } : { ok:false, reason:'generate-failed', character:null };
}

// BULK — fill a settlement's open notable slots (level ≥ minLevel, default 5 = the high-level notables;
// the rank-and-file stay counts), highest-level-first, up to maxToFill (default 8). → {ok, created[]}.
function autoFillSettlementRoster(campaign, settlement, opts){
  opts = opts || {};
  const gate = demographicAutoGenStatus(campaign);
  if(!gate.ok) return { ok:false, reason:gate.reason, created:[] };
  if(!settlement || !settlement.id) return { ok:false, reason:'no-settlement', created:[] };
  const minLevel  = (opts.minLevel  != null) ? Number(opts.minLevel)  : 5;
  const maxToFill = (opts.maxToFill != null) ? Number(opts.maxToFill) : 8;
  const slots = demographicOpenNotableSlots(campaign, settlement, { minLevel });
  const created = [];
  for(const s of slots){
    for(let k = 0; k < s.open && created.length < maxToFill; k++){
      const c = _generateResident(campaign, { bucket:s.bucket, level:s.level, homeSettlementId: settlement.id }, opts);
      if(c) created.push(c);
    }
    if(created.length >= maxToFill) break;
  }
  return { ok:true, created, filled: created.length, minLevel, maxToFill };
}

// REALM ENTOURAGE — mint a court entourage office (magister / guildmaster / annalist) the realm command
// structure expects but has open. ONLY the entourage offices auto-fill (the ruler + magistrates are
// appointed via their own UIs); the minted NPC is homed to the realm (homeDomainId) at the office's
// expected level + bucket, so realmCommandStructure picks it up greedily. → {ok, character}.
function fillRealmOffice(campaign, domain, officeKey, opts){
  const gate = demographicAutoGenStatus(campaign);
  if(!gate.ok) return { ok:false, reason:gate.reason, character:null };
  if(!domain || !domain.id) return { ok:false, reason:'no-domain', character:null };
  const off = REALM_OFFICES.find(o => o.key === officeKey);
  if(!off || off.mapsTo !== null || !off.bucket) return { ok:false, reason:'not-an-entourage-office', character:null };
  const rc = realmCommandStructure(campaign, domain.id);
  const rulerLevel = (rc && rc.rulerLevel) || realmRulerLevel(rc && rc.title);
  const lvl = realmOfficeLevel(off, rulerLevel);
  const c = _generateResident(campaign, { bucket:off.bucket, level:lvl, homeDomainId: domain.id, currentDomainId: domain.id }, opts);
  return c ? { ok:true, character:c } : { ok:false, reason:'generate-failed', character:null };
}
function autoFillRealmEntourage(campaign, domain, opts){
  const gate = demographicAutoGenStatus(campaign);
  if(!gate.ok) return { ok:false, reason:gate.reason, created:[] };
  if(!domain || !domain.id) return { ok:false, reason:'no-domain', created:[] };
  const rc = realmCommandStructure(campaign, domain.id);
  if(!rc) return { ok:false, reason:'no-realm', created:[] };
  const created = [];
  rc.offices.filter(o => !o.filled && o.mapsTo === 'entourage' && o.bucket).forEach(o => {
    const r = fillRealmOffice(campaign, domain, o.key, opts);
    if(r.ok && r.character) created.push(r.character);
  });
  return { ok:true, created, filled: created.length };
}

// COUNTRYSIDE — fill a domain's open rural notable slots, homing each to a rural hex (round-robin) via
// homeHexId (the SD-4-deferred auto-fill: SD-4 ships the expectation, SD-2b mints). level ≥ minLevel
// (default 2 — the rural template tops at L4; skip the L1 flood), up to maxToFill (default 8). → {ok, created[]}.
function autoFillDomainCountryside(campaign, domain, opts){
  opts = opts || {};
  const gate = demographicAutoGenStatus(campaign);
  if(!gate.ok) return { ok:false, reason:gate.reason, created:[] };
  if(!domain || !domain.id) return { ok:false, reason:'no-domain', created:[] };
  const ruralHexes = _domainRuralHexes(campaign, domain);
  if(!ruralHexes.length) return { ok:false, reason:'no-rural-hexes', created:[] };
  const minLevel  = (opts.minLevel  != null) ? Number(opts.minLevel)  : 2;
  const maxToFill = (opts.maxToFill != null) ? Number(opts.maxToFill) : 8;
  const agg = domainRuralDemographics(campaign, domain);
  const slots = [];
  agg.byLevel.forEach(row => {
    if(row.level < minLevel) return;
    DEMOGRAPHIC_BUCKETS.forEach(b => { if(row[b] && row[b].open > 0) slots.push({ bucket:b, level:row.level, open:row[b].open }); });
  });
  slots.sort((a, b) => b.level - a.level || DEMOGRAPHIC_BUCKETS.indexOf(a.bucket) - DEMOGRAPHIC_BUCKETS.indexOf(b.bucket));
  const created = []; let hi = 0;
  for(const s of slots){
    for(let k = 0; k < s.open && created.length < maxToFill; k++){
      const hex = ruralHexes[hi % ruralHexes.length]; hi++;
      const c = _generateResident(campaign, { bucket:s.bucket, level:s.level, hexId: hex.id, homeHexId: hex.id, currentDomainId: domain.id }, opts);
      if(c) created.push(c);
    }
    if(created.length >= maxToFill) break;
  }
  return { ok:true, created, filled: created.length };
}

// ── SD-6: THE MAGIC-ITEM CENSUS (plan §8A.1; Econometrics §7) ─────────────────────────────────────
// The resource analog of the class roster: a settlement's expected magic-item AVAILABILITY (by market
// class) vs its REALIZED on-hand stock (placed NotableItems + magical-facet stash lines), plus the
// per-NPC magic-item value (by level). DERIVE-DON'T-STORE — reads the licensed TT availability tables
// shipped in acks-engine-magic-item-availability.js (catalog posture, TT p.27; ⚠ IP §13.6/§13.9).
// ALWAYS-ON RAW tooling (plan OQ-8 — it's the Treasure-Tome availability math, not a house rule).
// All cross-module refs resolve at call-time on global.ACKS (sibling load order irrelevant).

const _ROMAN_CLASS_IDX = Object.freeze({ I:0, II:1, III:2, IV:3, V:4, VI:5 });

// A NotableItem's TT type key / rarity / gp value, classified via the availability + magic-items modules.
function _notableTypeKey(ni){
  const cat = (ni && ni.intrinsic && ni.intrinsic.category) || (ni && ni.kind) || null;
  return (typeof ACKS.magicItemTypeForCategory === 'function') ? ACKS.magicItemTypeForCategory(cat) : null;
}
function _notableRarity(ni){
  const r = ni && ni.intrinsic && ni.intrinsic.rarity;
  if(r) return r;
  const bc = ni && ((ni.intrinsic && ni.intrinsic.baseCost) || ni.baseCost);
  return (bc != null && typeof ACKS.magicItemRarity === 'function') ? ACKS.magicItemRarity(bc) : null;
}
function _notableValueGp(ni){
  const av = ni && ni.intrinsic && (ni.intrinsic.apparentValue != null ? ni.intrinsic.apparentValue : ni.intrinsic.baseCost);
  if(av != null) return Number(av) || 0;
  const r = _notableRarity(ni);
  return (r && typeof ACKS.magicRarityTierValue === 'function') ? ACKS.magicRarityTierValue(r) : 0;
}
function _packAvailCell(cell){
  if(!cell || cell.kind === 'none') return { cellKind:'none', perMarket:0, perParty:0, chancePct:0, perPartyChancePct:0 };
  const pp = (typeof ACKS.magicItemAvailabilityPerParty === 'function') ? ACKS.magicItemAvailabilityPerParty(cell) : { kind:cell.kind, count:0, chancePct:cell.chancePct };
  return {
    cellKind: cell.kind,
    perMarket: cell.kind === 'count' ? cell.count : 0,
    perParty: pp.kind === 'count' ? pp.count : 0,
    chancePct: cell.kind === 'chance' ? cell.chancePct : 100,
    perPartyChancePct: pp.chancePct != null ? pp.chancePct : 0
  };
}

// EXPECTED — the per-settlement magic-item availability (the RAW TT p.27 cells for the class, per-market
// + per-party). byType = the BUY availability (Availability-by-Type); byRarity = the SELL transaction
// cap (Transactions-by-Rarity). The "what enchanted goods can be bought/found here" read.
function expectedSettlementMagicItems(campaign, settlement){
  if(!settlement) return null;
  const mc = demographicMarketClass(settlement);
  const idx = _ROMAN_CLASS_IDX[mc] != null ? _ROMAN_CLASS_IDX[mc] : 5;
  const types = ACKS.MAGIC_ITEM_TYPE_ORDER || [];
  const rarities = ACKS.MAGIC_RARITY_TIER_ORDER || [];
  const byType = {};
  types.forEach(t => { byType[t] = _packAvailCell(ACKS.magicItemTypeAvailabilityCell ? ACKS.magicItemTypeAvailabilityCell(t, idx) : null); });
  const byRarity = {};
  rarities.forEach(r => { byRarity[r] = _packAvailCell(ACKS.magicItemTransactionCell ? ACKS.magicItemTransactionCell(r, idx) : null); });
  return { settlementId: settlement.id || null, marketClass: mc, marketClassIdx: idx, byType, byRarity };
}

// REALIZED — the magic items currently ATTRIBUTED to a settlement: NotableItems on the market shelf
// (merchant-stock custody here) + held by residents (custody = a resident character), bucketed by TT
// type + rarity; plus an aggregate of loose magical-facet stash lines at the settlement's hex.
function realizedSettlementMagicItems(campaign, settlementId){
  const notables = (campaign && Array.isArray(campaign.notableItems)) ? campaign.notableItems : [];
  const custody = (campaign && Array.isArray(campaign.itemCustody)) ? campaign.itemCustody : [];
  const residentIds = new Set();
  (campaign && Array.isArray(campaign.characters) ? campaign.characters : []).forEach(c => { if(_isResident(c, settlementId)) residentIds.add(c.id); });
  const custOf = {};
  custody.forEach(r => { if(r && r.status !== 'ended' && !(r.itemId in custOf)) custOf[r.itemId] = r; });
  const byType = {}; (ACKS.MAGIC_ITEM_TYPE_ORDER || []).forEach(t => { byType[t] = { count:0, names:[] }; });
  const byRarity = {}; (ACKS.MAGIC_RARITY_TIER_ORDER || []).forEach(r => { byRarity[r] = { count:0, valueGp:0 }; });
  let onShelf = 0, heldByResidents = 0, totalCount = 0, totalValueGp = 0;
  for(const ni of notables){
    if(!ni || ni.status === 'destroyed' || ni.status === 'lost') continue;
    const cust = custOf[ni.id];
    const here = cust && ((cust.custodianKind === 'merchant-stock' && cust.custodianId === settlementId)
                       || (cust.custodianKind === 'character' && residentIds.has(cust.custodianId)));
    if(!here) continue;
    if(cust.custodianKind === 'merchant-stock') onShelf++; else heldByResidents++;
    const t = _notableTypeKey(ni), r = _notableRarity(ni), v = _notableValueGp(ni);
    totalCount++; totalValueGp += v;
    if(t && byType[t]){ byType[t].count++; byType[t].names.push({ id: ni.id, name: ni.name || '(unnamed)' }); }
    if(r && byRarity[r]){ byRarity[r].count++; byRarity[r].valueGp += v; }
  }
  let looseMagicalLines = 0;
  const settlement = (campaign && Array.isArray(campaign.settlements)) ? campaign.settlements.find(s => s && s.id === settlementId) : null;
  const hexId = settlement && settlement.hexId;
  if(hexId && campaign && Array.isArray(campaign.stashes)){
    for(const st of campaign.stashes){
      if(!st || st.hexId !== hexId || !Array.isArray(st.items)) continue;
      for(const line of st.items){ if(line && Array.isArray(line.facets) && line.facets.indexOf('magical') >= 0) looseMagicalLines += (Number(line.qty) || 1); }
    }
  }
  return { settlementId, byType, byRarity, totalCount, totalValueGp, onShelf, heldByResidents, looseMagicalLines };
}

// DELTA — expected availability vs realized stock, per type + per rarity (the SD-6 reconciliation, the
// magic-item analog of demographicDelta: availablePerMarket/Party vs placed → unplaced slots).
function settlementMagicItemDelta(campaign, settlement){
  if(!settlement) return null;
  const expected = expectedSettlementMagicItems(campaign, settlement);
  const realized = realizedSettlementMagicItems(campaign, settlement.id);
  const byType = {};
  (ACKS.MAGIC_ITEM_TYPE_ORDER || []).forEach(t => {
    const e = expected.byType[t] || {}, r = realized.byType[t] || {};
    byType[t] = { availablePerMarket: e.perMarket || 0, availablePerParty: e.perParty || 0, chancePct: e.chancePct || 0,
                  placed: r.count || 0, unplaced: Math.max(0, (e.perMarket || 0) - (r.count || 0)), names: r.names || [] };
  });
  const byRarity = {};
  (ACKS.MAGIC_RARITY_TIER_ORDER || []).forEach(rk => {
    const e = expected.byRarity[rk] || {}, r = realized.byRarity[rk] || {};
    byRarity[rk] = { sellableCapPerMarket: e.perMarket || 0, sellableCapPerParty: e.perParty || 0, chancePct: e.chancePct || 0,
                     placed: r.count || 0, valueGp: r.valueGp || 0 };
  });
  return { settlementId: settlement.id, marketClass: expected.marketClass, marketClassIdx: expected.marketClassIdx,
           expected, realized, byType, byRarity, totalCount: realized.totalCount, totalValueGp: realized.totalValueGp };
}
// One-call convenience for the UI (mirrors settlementDemographics).
function settlementMagicItemCensus(campaign, settlement){ return settlement ? settlementMagicItemDelta(campaign, settlement) : null; }

// BY NPC LEVEL (plan §8A.1 — the per-individual facet). Thin reads over the availability module's
// 🔧 IP-light per-level value curve: the magic-item value a leveled NPC holds + its rarity-tier split.
function expectedNpcMagicItemValue(level){ return (typeof ACKS.npcMagicItemValueGp === 'function') ? ACKS.npcMagicItemValueGp(level) : 0; }
function expectedNpcMagicItemTiers(level){ return (typeof ACKS.npcMagicItemTierAllocation === 'function') ? ACKS.npcMagicItemTierAllocation(level) : null; }

// ═══════════════════════════════════════════════════════════════════════════════════
// SD-7a — the WEALTH census (plan §8A.2; Econometrics §7). The third resource facet riding the
// same derive-don't-store population spine as the people roster (expectedDemographics) + the
// magic-item census (expectedSettlementMagicItems). Wealth is censused over the LEVELED NPC
// roster (the per-level distribution), the wealth analog of "how much gold do this town's notable
// NPCs hold" — the 0th-level family masses are the domain economy, not this per-NPC census.
//
// 🔧 IP-LIGHT TOOLING CURVE — the per-level wealth a leveled NPC holds. The Econometrics §7 gives
// the *structure* (wealth follows the demographic pyramid; magic items + treasure follow wealth)
// + two explicit anchors: ≈70gp at 0th level, ≈12,982,800gp at 14th ("as high NPCs accrue
// non-adventuring assets"). The precise per-level cells are ACKS-1-era pending a Treasure-Tome
// reconciliation (plan OQ-7/OQ-8), so this is a FITTED curve, not a transcribed table: a
// constant-ratio interpolation of the two explicit anchors across L0…L14. Mechanical facts only
// (two survey numbers → a fitted curve), page-cited, NO prose; GM-overridable; the §13.9 Autarch
// heads-up folds into the standing catalog heads-up (CLAUDE §13.6/§13.9). The sibling of
// npcMagicItemValueGp (acks-engine-magic-item-availability.js). DERIVE-DON'T-STORE.
// ═══════════════════════════════════════════════════════════════════════════════════
const NPC_WEALTH_ZEROTH_GP = 70;             // Econometrics §7, the explicit 0th-level anchor
const NPC_WEALTH_FOURTEENTH_GP = 12982800;   // Econometrics §7, the explicit 14th-level anchor
const NPC_WEALTH_RATIO = Math.pow(NPC_WEALTH_FOURTEENTH_GP / NPC_WEALTH_ZEROTH_GP, 1 / 14); // ≈ 2.378/level

// Round to ~3 significant figures (readable + monotone; the curve is a GM-overridable estimate).
function _roundWealthGp(gp){
  if(!(gp > 0)) return 0;
  const mag = Math.pow(10, Math.floor(Math.log10(gp)) - 2);
  return Math.round(gp / mag) * mag;
}
function npcWealthGp(level){
  const L = Math.floor(Number(level));
  if(!Number.isFinite(L)) return 0;
  return _roundWealthGp(NPC_WEALTH_ZEROTH_GP * Math.pow(NPC_WEALTH_RATIO, Math.max(0, L)));
}

// REALIZED — one NPC's total gp-equivalent wealth: the multi-denomination coin purse (the canonical
// store) + the gp value of every personal/cache stash they own. Carry inventory is gear-by-weight
// (no value column, v0.16.0), so purse + owned stashes is the full wealth picture. A domain treasury
// is the realm's, not the ruler's personal wealth, so stashesOwnedByCharacter (ownerCharacterId) is
// the right scope — it excludes treasuries.
function realizedCharacterWealthGp(campaign, character){
  if(!character) return 0;
  let gp = (typeof ACKS.characterCoinValueGp === 'function') ? ACKS.characterCoinValueGp(character) : 0;
  if(typeof ACKS.stashesOwnedByCharacter === 'function' && typeof ACKS.stashTotalGp === 'function'){
    for(const st of ACKS.stashesOwnedByCharacter(campaign, character.id)){ gp += ACKS.stashTotalGp(st) || 0; }
  }
  return gp;
}

// EXPECTED — the total wealth held by a settlement's leveled-NPC roster: the demographic byLevel
// counts × the per-level wealth curve, with a per-level breakdown. The wealth analog of the people
// roster + the magic-item availability.
function expectedSettlementWealth(campaign, settlement){
  if(!settlement) return null;
  const exp = expectedDemographics(settlement);
  if(!exp) return null;
  const byLevel = [];
  let totalGp = 0, totalNpcs = 0;
  exp.byLevel.forEach(row => {
    const perNpc = npcWealthGp(row.level);
    const count = row.all || 0;
    const gp = count * perNpc;
    totalGp += gp; totalNpcs += count;
    byLevel.push({ level: row.level, expectedNpcs: count, perNpcGp: perNpc, gp });
  });
  return { settlementId: settlement.id || null, marketClass: exp.marketClass, families: exp.families,
           byLevel, totalGp, totalNpcs };
}

// REALIZED — the wealth actually held by the settlement's homed leveled NPCs (purse + owned
// stashes), bucketed per level, the richest residents named first. Derived by query.
function realizedSettlementWealth(campaign, settlementId){
  const chars = (campaign && Array.isArray(campaign.characters)) ? campaign.characters : [];
  const byLevel = [];
  for(let i = 0; i < MAX_NPC_LEVEL; i++) byLevel.push({ level: i + 1, residents: 0, gp: 0, names: [] });
  let totalGp = 0, residents = 0;
  for(const c of chars){
    if(!_isResident(c, settlementId)) continue;
    const lvl = Math.max(1, Math.min(MAX_NPC_LEVEL, Number(c.level) || 1));
    const gp = realizedCharacterWealthGp(campaign, c);
    const row = byLevel[lvl - 1];
    row.residents += 1; row.gp += gp;
    row.names.push({ id: c.id, name: c.name || '(unnamed)', level: Number(c.level) || 1, gp });
    totalGp += gp; residents += 1;
  }
  byLevel.forEach(row => row.names.sort((a, b) => b.gp - a.gp)); // richest first
  return { settlementId, byLevel, totalGp, residents };
}

// DELTA — expected vs realized wealth per level (the SD-7 reconciliation; the wealth analog of
// demographicDelta / settlementMagicItemDelta).
function settlementWealthDelta(campaign, settlement){
  if(!settlement) return null;
  const expected = expectedSettlementWealth(campaign, settlement);
  const realized = realizedSettlementWealth(campaign, settlement.id);
  const byLevel = [];
  for(let i = 0; i < MAX_NPC_LEVEL; i++){
    const e = expected.byLevel[i], r = realized.byLevel[i];
    byLevel.push({ level: i + 1,
      expectedNpcs: e.expectedNpcs, perNpcGp: e.perNpcGp, expectedGp: e.gp,
      realizedResidents: r.residents, realizedGp: r.gp, names: r.names });
  }
  return { settlementId: settlement.id, marketClass: expected.marketClass,
           expected, realized, byLevel, expectedGp: expected.totalGp, realizedGp: realized.totalGp };
}
// One-call convenience for the UI (mirrors settlementMagicItemCensus).
function settlementWealthCensus(campaign, settlement){ return settlement ? settlementWealthDelta(campaign, settlement) : null; }
// Per-individual read (the wealth a leveled NPC is expected to hold).
function expectedNpcWealth(level){ return npcWealthGp(level); }

// ═══════════════════════════════════════════════════════════════════════════════════
// SD-7b — the PLACEMENT TAXONOMY (plan §8A.3, §11; Econometrics §4/§5). The final demographics
// wave. SD-1/SD-2/SD-5b said WHERE-in-a-settlement an NPC sits (placementRole — a civic POI). This
// is the wider RAW accounting: the Econometrics' master "Distribution of Classed Characters" table
// routes EVERY classed character into one of seven destinations, tying the census to recruitment,
// lifecycle, and encounters as ONE coherent accounting (survey §4):
//   • ruler        — rules a domain (T1 realm command structure)
//   • domain-npc   — lives in a ruler's settlement / court (T0/T1 urban roster)
//   • countryside  — lives in the rural hexes (T2 rural census)
//   • mercenary    — the hired-help / market-availability pool — the RECRUITMENT seam
//   • henchman     — a personal retainer — the RECRUITMENT seam
//   • retired      — aged-out members — the LIFECYCLE (CL-1) seam
//   • available    — active + unaccounted-for: adventurers, brigands, pirates, wanderers — the
//                    ENCOUNTER / adventure seam
// DERIVE-DON'T-STORE (the SD-1 spine): placementCategory is a PURE classifier over the shipped
// five-axis fields + the home pointers + the domain roster — NO new entity / prefix / field / event.
// All cross-module predicate refs (isHenchman/isFollower/…) resolve at call-time on global.ACKS.
//
// ⚠ "retired" is the LIFECYCLE seam, not a live category today: the engine has no persistent retired
// state — retirement is a soft-delete (a `character-death` event, kind:'retirement' → alive=false,
// indistinguishable from a death via that same path; only recordCharacterDeath sets
// lifecycleState:'deceased'). So placementCategory detects 'retired' only from a CLEAN signal
// (lifecycleState:'retired' OR causeOfDeath:'retirement') — which CL-1/CL-4 may set later; an
// ambiguous soft-delete (alive===false, not deceased) is treated as DEPARTED (returns null — gone
// from the live accounting, RAW's "retired members … ignored"). The wiring is ready; the column
// populates when retirement gains a first-class state. A deceased character → null (it's dead, not
// placed). The classifier covers the ACTIVE world; 'retired' rounds out the RAW taxonomy.

const PLACEMENT_CATEGORIES = Object.freeze(['ruler','domain-npc','countryside','mercenary','henchman','retired','available']);
const PLACEMENT_CATEGORY_LABELS = Object.freeze({
  'ruler':'Ruler', 'domain-npc':'Domain NPC', 'countryside':'Countryside',
  'mercenary':'Mercenary / hireling', 'henchman':'Henchman', 'retired':'Retired', 'available':'Available'
});
function placementCategoryLabel(cat){ return PLACEMENT_CATEGORY_LABELS[cat] || cat || ''; }

const _pred = name => (typeof ACKS[name] === 'function') ? ACKS[name] : (() => false);

// placementCategory(campaign, character) → one of the seven, or null (deceased / ambiguously departed).
// A PRIORITY CASCADE — lifecycle (retired) is the most definitive, then the active role/relation
// (ruler → henchman → mercenary, so a bound retainer is accounted by its EMPLOYMENT not its lodging,
// per the Econometrics), then placement (domain-npc → countryside), then the residual 'available'.
function placementCategory(campaign, character){
  if(!character) return null;
  const c = character;
  if(_pred('isDeceased')(c) || c.lifecycleState === 'deceased') return null;       // dead — not a placement
  // retired (the clean lifecycle signal; an ambiguous soft-delete is treated as departed → null)
  if(c.lifecycleState === 'retired' || c.causeOfDeath === 'retirement') return 'retired';
  if(c.alive === false) return null;                                                // soft-deleted, cause unknown → departed
  // ruler — rules a domain (an active, definitive role)
  if(campaign && Array.isArray(campaign.domains) && campaign.domains.some(d => d && d.rulerCharacterId === c.id)) return 'ruler';
  // employment (the recruitment seam) beats lodging (the Econometrics accounts a henchman as a henchman)
  if(_pred('isHenchman')(c) || _pred('isFollower')(c)) return 'henchman';
  if(_pred('isMercenaryOfficer')(c) || _pred('isSpecialist')(c) || _pred('isHireling')(c)) return 'mercenary';
  // placement — homed in a settlement / court → domain-npc; in the wilds → countryside
  if(c.homeSettlementId || c.homeDomainId) return 'domain-npc';
  if(c.homeHexId) return 'countryside';
  return 'available';   // active, unbound, unplaced — the adventurer / brigand / wanderer pool
}

// Whether an NPC belongs to a domain's accounting (for the domain-scoped census): ruler of it,
// homed in its settlements / hexes / court, OR a retainer lieged to its ruler. settlementIds/hexIds
// are pre-resolved by the caller (one query per census, not per character).
function _belongsToDomain(c, domain, settlementIds, hexIds){
  if(!c || !domain) return false;
  if(domain.rulerCharacterId === c.id) return true;
  if(c.homeDomainId === domain.id) return true;
  if(c.homeSettlementId && settlementIds.has(c.homeSettlementId)) return true;
  if(c.homeHexId && hexIds.has(c.homeHexId)) return true;
  if(domain.rulerCharacterId && c.liegeCharacterId === domain.rulerCharacterId) return true;  // a retainer serving the realm
  return false;
}

// THE PLACEMENT CENSUS — the seven-category accounting over a scope (the Econometrics master table for
// the GM's OWN world). opts: { domainId? } → scope to that domain's NPCs (its ruler + homed + court +
// lieged retainers); else campaign-wide (every classed/named character). Pure derived read. →
//   { scope, domainId?, total, categories:{cat:n,…}, byCategory:[{category,label,count,bucketCounts,names:[…top]}],
//     byBucket:{bucket:n,…} }.  The UI surfaces it as "where do this realm's people sit?".
function placementCensus(campaign, opts){
  opts = opts || {};
  const chars = (campaign && Array.isArray(campaign.characters)) ? campaign.characters : [];
  let domain = null, settlementIds = new Set(), hexIds = new Set();
  if(opts.domainId && campaign && Array.isArray(campaign.domains)){
    domain = campaign.domains.find(d => d && d.id === opts.domainId) || null;
    if(domain){
      const sl = (typeof ACKS.settlementsForDomain === 'function') ? ACKS.settlementsForDomain(campaign, domain.id) : [];
      sl.forEach(s => { if(s && s.id) settlementIds.add(s.id); });
      const hl = (typeof ACKS.hexesForDomain === 'function') ? ACKS.hexesForDomain(campaign, domain.id)
               : (Array.isArray(campaign.hexes) ? campaign.hexes.filter(h => h && h.domainId === domain.id) : []);
      hl.forEach(h => { if(h && h.id) hexIds.add(h.id); });
    }
  }
  const categories = {}; const byBucket = {};
  PLACEMENT_CATEGORIES.forEach(cat => { categories[cat] = 0; });
  DEMOGRAPHIC_BUCKETS.forEach(b => { byBucket[b] = 0; }); byBucket.other = 0;
  const examples = {}; PLACEMENT_CATEGORIES.forEach(cat => { examples[cat] = []; });
  const bucketByCat = {}; PLACEMENT_CATEGORIES.forEach(cat => { bucketByCat[cat] = Object.assign({ other:0 }, _emptyBucketMap()); });
  let total = 0;
  for(const c of chars){
    if(!c) continue;
    const cat = placementCategory(campaign, c);
    if(!cat) continue;                                            // deceased / departed — not in the accounting
    if(domain && !_belongsToDomain(c, domain, settlementIds, hexIds)) continue;
    categories[cat] += 1; total += 1;
    const bucket = coreBucketForCharacter(campaign, c);
    if(bucket){ byBucket[bucket] += 1; bucketByCat[cat][bucket] += 1; } else { byBucket.other += 1; bucketByCat[cat].other += 1; }
    const ex = examples[cat];
    if(ex.length < 6) ex.push({ id: c.id, name: c.name || '(unnamed)', level: Number(c.level) || 1, class: c.class || '', bucket });
  }
  PLACEMENT_CATEGORIES.forEach(cat => examples[cat].sort((a, b) => b.level - a.level));
  const byCategory = PLACEMENT_CATEGORIES.map(cat => ({
    category: cat, label: PLACEMENT_CATEGORY_LABELS[cat], count: categories[cat],
    bucketCounts: bucketByCat[cat], names: examples[cat]
  }));
  return { scope: domain ? 'domain' : 'campaign', domainId: domain ? domain.id : null,
           domainName: domain ? (domain.name || null) : null,
           total, categories, byCategory, byBucket };
}

// ── THE REALM PLACEMENT TEMPLATES (Econometrics §5 — "A Typical Legature / Tribunate / Patricianate") ──
// The RAW worked rosters for a realm's stronghold/urban staff, by administrative tier. These are the
// realm/domain analog of JJ Step 3's urban roster — concrete domain-role → class/level lists the GM can
// read as "what staffs a realm of this title." Reference data (faithful to the Econometrics prose, p.
// "A Typical …" lists), surfaced beside the SD-3 derived REALM_OFFICES (which scales generically by
// title; these are the concrete worked examples). The countryside analog — "A Typical Hex" — is the
// SHIPPED SD-4 RURAL_HEX_TEMPLATE (not duplicated here).
//   • Patricianate → a Baron-tier realm (the smallest)   • Tribunate → a Viscount-tier
//   • Legature     → a Count-tier (and the floor for Duke/Prince/King/Emperor — the largest worked tier)
// Each role: { role, count, level (display string), bucket (the dominant demographic bucket), chance?
// (a %-present role, 0<chance<1), note? (the RAW class-mix / composition prose) }.
function _tmplHeadcount(roles){ return roles.reduce((s, r) => s + (r.count || 0) * (r.chance != null ? r.chance : 1), 0); }

const REALM_PLACEMENT_TEMPLATES = Object.freeze({
  legature: Object.freeze({
    key:'legature', label:'A Typical Legature', titleLabel:'Count', forTitles:Object.freeze(['count','duke','prince','king','emperor']),
    note:'The staff of a Count-tier realm (the Econometrics worked roster; the floor for higher titles).',
    roles: Object.freeze([
      Object.freeze({ role:'Legate',              count:1,  level:'7th–8th', bucket:'fighter',  note:'75% explorer/fighter/paladin · 20% bard · 5% bladedancer/cleric' }),
      Object.freeze({ role:'Captain of the Guard',count:1,  level:'5th',     bucket:'fighter',  chance:0.5, note:'explorer/fighter/paladin' }),
      Object.freeze({ role:'Merchant Guildmaster',count:1,  level:'4th',     bucket:'venturer' }),
      Object.freeze({ role:'Subalterns',          count:2,  level:'3rd',     bucket:'fighter' }),
      Object.freeze({ role:'Quartermaster',       count:1,  level:'3rd',     bucket:'fighter' }),
      Object.freeze({ role:'Annalist',            count:1,  level:'3rd',     bucket:'thief',    note:'bard' }),
      Object.freeze({ role:'Elite Guards',        count:8,  level:'2nd',     bucket:'fighter' }),
      Object.freeze({ role:'Veterans',            count:21, level:'1st',     bucket:'fighter',  note:'6 cataphracts, 15 heavy infantry' }),
      Object.freeze({ role:'Regulars',            count:69, level:'0th',     bucket:'fighter',  note:'6 cataphracts, 18 horse archers, 15 composite bow, 30 heavy infantry' }),
      Object.freeze({ role:'Chief Hospitalist',   count:1,  level:'5th–6th', bucket:'crusader', note:'bladedancer/cleric/priestess' }),
      Object.freeze({ role:'Hospitalists',        count:4,  level:'1st',     bucket:'crusader', note:'bladedancer/cleric/priestess' }),
      Object.freeze({ role:'Magister',            count:1,  level:'5th–6th', bucket:'mage',     note:'85% 5th · 15% 6th' }),
      Object.freeze({ role:'Apprentices',         count:4,  level:'1st',     bucket:'mage' })
    ])
  }),
  tribunate: Object.freeze({
    key:'tribunate', label:'A Typical Tribunate', titleLabel:'Viscount', forTitles:Object.freeze(['viscount']),
    note:'The staff of a Viscount-tier realm (a tribune commands four patricianates).',
    roles: Object.freeze([
      Object.freeze({ role:'Tribune',             count:1,  level:'5th–6th', bucket:'fighter',  note:'72% explorer/fighter/paladin · 14% bard · 9% bladedancer/cleric · 5% mage' }),
      Object.freeze({ role:'Subaltern',           count:1,  level:'3rd',     bucket:'fighter' }),
      Object.freeze({ role:'Elite Guards',        count:2,  level:'2nd',     bucket:'fighter' }),
      Object.freeze({ role:'Quartermaster',       count:1,  level:'2nd',     bucket:'fighter' }),
      Object.freeze({ role:'Veterans',            count:11, level:'1st',     bucket:'fighter',  note:'2 cataphracts, 9 heavy infantry' }),
      Object.freeze({ role:'Regulars',            count:33, level:'0th',     bucket:'fighter',  note:'2 cataphracts, 4 horse archers, 9 composite bow, 18 heavy infantry' }),
      Object.freeze({ role:'Annalist',            count:1,  level:'2nd',     bucket:'thief',    note:'bard' }),
      Object.freeze({ role:'Merchant Guildmaster',count:1,  level:'2nd',     bucket:'venturer' }),
      Object.freeze({ role:'Chief Hospitalist',   count:1,  level:'3rd–4th', bucket:'crusader', note:'bladedancer/cleric/priestess' }),
      Object.freeze({ role:'Hospitalists',        count:3,  level:'1st',     bucket:'crusader' }),
      Object.freeze({ role:'Magister',            count:1,  level:'3rd–4th', bucket:'mage',     note:'40% 3rd · 60% 4th' }),
      Object.freeze({ role:'Apprentices',         count:3,  level:'1st',     bucket:'mage' })
    ])
  }),
  patricianate: Object.freeze({
    key:'patricianate', label:'A Typical Patricianate', titleLabel:'Baron', forTitles:Object.freeze(['baron']),
    note:'The staff of a Baron-tier realm (a single fort/stronghold).',
    roles: Object.freeze([
      Object.freeze({ role:'Patrician',           count:1,  level:'4th–5th', bucket:'fighter',  note:'82% explorer/fighter/paladin · 9% bard · 6% bladedancer/cleric · 3% mage' }),
      Object.freeze({ role:'Subaltern',           count:1,  level:'3rd',     bucket:'fighter' }),
      Object.freeze({ role:'Elite Guards',        count:2,  level:'2nd',     bucket:'fighter' }),
      Object.freeze({ role:'Veterans',            count:5,  level:'1st',     bucket:'fighter',  note:'1 cataphract, 4 heavy infantry' }),
      Object.freeze({ role:'Regulars',            count:15, level:'0th',     bucket:'fighter',  note:'1 cataphract, 2 horse archers, 4 composite bow, 8 heavy infantry' }),
      Object.freeze({ role:'Annalist',            count:1,  level:'1st',     bucket:'thief',    note:'bard' }),
      Object.freeze({ role:'Merchant Guildmaster',count:1,  level:'1st',     bucket:'venturer' }),
      Object.freeze({ role:'Hospitalists',        count:2,  level:'1st',     bucket:'crusader', note:'bladedancer/cleric/priestess' }),
      Object.freeze({ role:'Chief Magister',      count:1,  level:'2nd–3rd', bucket:'mage',     note:'62% 2nd · 38% 3rd' }),
      Object.freeze({ role:'Apprentices',         count:2,  level:'1st',     bucket:'mage' })
    ])
  })
});

// title → the worked template (baron→patricianate, viscount→tribunate, count+→legature).
function realmPlacementTemplate(title){
  const t = String(title || '').toLowerCase();
  for(const key of Object.keys(REALM_PLACEMENT_TEMPLATES)){
    if(REALM_PLACEMENT_TEMPLATES[key].forTitles.indexOf(t) >= 0) return REALM_PLACEMENT_TEMPLATES[key];
  }
  return REALM_PLACEMENT_TEMPLATES.legature;   // a higher/unknown title uses the largest worked tier as the floor
}
// The worked roster for a domain (resolves its realm title). headcount = the typical total staff.
function placementTemplateForDomain(campaign, domain){
  if(!domain) return null;
  const title = (typeof ACKS.realmTitleForDomain === 'function') ? ACKS.realmTitleForDomain(domain) : 'baron';
  const tpl = realmPlacementTemplate(title);
  return { title, titleLabel: TITLE_LABELS[title] || tpl.titleLabel,
           template: tpl, headcount: Math.round(_tmplHeadcount(tpl.roles)) };
}

Object.assign(ACKS, {
  // SD-7b — the placement taxonomy (plan §8A.3; pure derive-don't-store, no new entity/field)
  PLACEMENT_CATEGORIES, PLACEMENT_CATEGORY_LABELS, placementCategoryLabel,
  placementCategory, placementCensus,
  REALM_PLACEMENT_TEMPLATES, realmPlacementTemplate, placementTemplateForDomain,
  // SD-6 — the magic-item census (plan §8A.1; reads acks-engine-magic-item-availability.js)
  expectedSettlementMagicItems, realizedSettlementMagicItems, settlementMagicItemDelta,
  settlementMagicItemCensus, expectedNpcMagicItemValue, expectedNpcMagicItemTiers,
  // SD-7a — the wealth census (plan §8A.2; the fitted per-level wealth curve, Econometrics §7)
  npcWealthGp, realizedCharacterWealthGp,
  expectedSettlementWealth, realizedSettlementWealth, settlementWealthDelta,
  settlementWealthCensus, expectedNpcWealth,
  // constants (exported for the smoke + consumers)
  DEMOGRAPHIC_BUCKETS, STARTING_SETTLEMENT_ALL, STARTING_SETTLEMENT_REF_FAMILIES,
  LEVEL_CLASS_SPLIT, DEMOGRAPHIC_BUCKET_BY_CLASS,
  // SD-4 — the rural / countryside census (T2, "A Typical Hex"; gated by `living-census`)
  RURAL_HEX_TEMPLATE, RURAL_HEX_REF_FAMILIES,
  expectedRuralDemographics, realizedRuralDemographics, ruralDemographicDelta,
  ruralResidents, domainRuralDemographics,
  // the derived-accessor family (plan §4)
  demographicMarketClass, coreBucketForCharacter,
  expectedDemographics, realizedDemographics, demographicDelta, settlementDemographics,
  formatExpectedCount,
  // SD-2 — placement (JJ Step 4 p.217)
  PLACEMENT_ROLES, PLACEMENT_ROLE_LABELS,
  suggestedPlacementRole, effectivePlacementRole, placementRoleLabel,
  // SD-5a — the emergent reads (plan §8: the world's people as a queryable index)
  BUCKET_SERVICE,
  settlementResidents, topResidentByBucket, settlementServices,
  findResidents, mostNotableResident,
  // SD-5b — grounding the civilized encounter (plan §8: the census becomes who you meet)
  CIVILIZED_CELL_BUCKET, bucketForCivilizedCell, groundCivilizedEncounter,
  // SD-3 — the realm command structure (T1, plan §5/§11; gated by `living-census`)
  TITLE_RULER_LEVEL, TITLE_LABELS, REALM_OFFICES,
  realmRulerLevel, realmOfficeLevel, realmCommandStructure,
  // SD-2b — auto-generation (the generator-fed roster fill; gated on living-census + demographics-auto-generate)
  demographicAutoGenStatus, demographicOpenNotableSlots,
  fillDemographicSlot, autoFillSettlementRoster,
  fillRealmOffice, autoFillRealmEntourage,
  autoFillDomainCountryside
});

if(typeof module !== 'undefined' && module.exports){ module.exports = ACKS; }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
