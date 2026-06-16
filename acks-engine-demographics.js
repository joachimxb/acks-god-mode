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

Object.assign(ACKS, {
  // constants (exported for the smoke + consumers)
  DEMOGRAPHIC_BUCKETS, STARTING_SETTLEMENT_ALL, STARTING_SETTLEMENT_REF_FAMILIES,
  LEVEL_CLASS_SPLIT, DEMOGRAPHIC_BUCKET_BY_CLASS,
  // the derived-accessor family (plan §4)
  demographicMarketClass, coreBucketForCharacter,
  expectedDemographics, realizedDemographics, demographicDelta, settlementDemographics,
  formatExpectedCount
});

if(typeof module !== 'undefined' && module.exports){ module.exports = ACKS; }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
