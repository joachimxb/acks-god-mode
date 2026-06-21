/* =============================================================================
 * acks-engine-domain-variants.js — ACKS God Mode Domain Variants (Module: domain-variants)
 *
 * Phase 5 — Domain Variants. v1 ships Pastoralist economics (P5-PAST,
 * Phase_5_Domain_Variants_Plan.md §3; JJ ch.21 pp.436–438). Terrain Transformation
 * (P5-TERR) and Transformations (P5-TRANS) are separate later waves.
 *
 * The load-bearing RAW finding (plan §3.1): JJ ch.21 is an econometric *justification
 * essay*, not a domain-revenue ruleset — so the domain-application math is a transparent
 * DERIVATION from the RAW caloric-efficiency + per-head figures, GM-overridable
 * ("cartography before mechanics"). A herding hex feeds far fewer families per acre
 * (caloric efficiency 0.20–0.42 vs farming) at ~the same income/family (94–100% of the
 * "secret ratio") — "a civilization can get rich on cattle but can't feed itself."
 * The structural shape: income/family ≈ same; families/hex ≈ much lower.
 *
 * Activation: the Hex.economyType discriminator (reserved on blankHex, default
 * 'agricultural'). Selecting a 'pastoralist-*' / 'mixed' economyType IS the opt-in —
 * NO master house rule (the §6 RAW-default polarity: agricultural is RAW, the variant
 * is "a component turned on", Architecture §2.2). Agricultural / absent / a reserved
 * non-pastoralist marker (mining/fishing/forestry/magical, owned by other subsystems)
 * ⇒ every accessor is a no-op ⇒ byte-identical (the economy oracle stays green).
 *
 * Integration: the per-hex carrying-capacity density LATE-BINDS into incomeBreakdown's
 * land row via ONE guarded hook in acks-engine-economy.js (the moraleModifiersFor
 * late-bind precedent); the logic lives HERE. Land value/family is untouched — only the
 * families the herding land can feed generate land revenue (a hex over its pastoralist
 * cap loses the surplus's land contribution). In the per-hex land branch the
 * multiplicative factor [Σ min(fam,cap)·val / Σ fam·val] yields the *exact* per-hex
 * capped sum; in the aggregate branch it is a faithful density reduction of the
 * aggregate. The carrying-capacity CAP itself (the growth ceiling) lives in the
 * population-growth consumer (subsystems.js HEX_POP_CEILING) and is out of scope here;
 * this is the cap's current-revenue shadow (a hex below its pastoralist cap is unaffected
 * — RAW: income/family is the same, the difference is only at scale).
 *
 * Seams (pointers, NOT built here, per plan §3.6): the `vulnerability` tags (drought /
 * murrain) a future Calamity/Vagary event reads; the mounted-scout favorable-ratio that a
 * pastoralist economyType informs in Military's Conscript levy (W7). Neither is double-
 * implemented here.
 *
 * Load order: AFTER acks-engine-catalogs.js (terrainBase), acks-engine.js (bankersRound),
 * acks-engine-economy.js (effectiveHexValue / hexesForDomain / settlementForHex) and
 * acks-engine-events.js (newEvent / setEventContext / registerEventKind). All cross-module
 * references are call-time aliases onto global.ACKS, so the function bodies never depend on
 * sibling load order.
 * =============================================================================
 */
(function(global){
'use strict';
global.ACKS = global.ACKS || {};
const ACKS = global.ACKS;

// Call-time aliases (resolve at invocation — sibling load order is irrelevant for the bodies).
const effectiveHexValue = (...a) => ACKS.effectiveHexValue(...a);
const hexesForDomain    = (...a) => ACKS.hexesForDomain(...a);
const settlementForHex  = (...a) => ACKS.settlementForHex(...a);
const bankersRound      = (n) => (typeof ACKS.bankersRound === 'function' ? ACKS.bankersRound(n) : Math.round(n));
const _localTerrainBase = (t) => { const k = String(t || '').trim().toLowerCase(); const d = k.indexOf('-'); return d > 0 ? k.slice(0, d) : k; };
const terrainBaseOf     = (t) => (typeof ACKS.terrainBase === 'function' ? (ACKS.terrainBase(t) || _localTerrainBase(t)) : _localTerrainBase(t));
const hexNameOf         = (hex) => (typeof ACKS.hexName === 'function' ? ACKS.hexName(hex) : '');

// ── RAW reference data ───────────────────────────────────────────────────────

// Per-6-mile-hex agricultural family ceilings by classification (RR p.340). Mirrors the
// (module-local, unexported) HEX_POP_CEILING in subsystems.js — reference data, not a fork;
// the pastoralist cap is this × caloric efficiency.
const AGRICULTURAL_FAMILY_CAP = Object.freeze({ civilized: 780, borderlands: 375, outlands: 185, unsettled: 185 });

// PASTORALIST_ECONOMICS — the per-economy figures (plan §3.5; JJ pp.436–438). IP-clean: values +
// page cites, no rulebook prose (§13.6). Keyed by the Hex.economyType enum value (plan §3.2).
//   caloricEfficiency — caloric return on the same acreage vs farming (the families/hex density
//                       factor; farming = 1.0 baseline).
//   rearableTerrain   — the RAW per-terrain rearing constraint mapped to the 10 TERRAIN_BASES
//                       (a GM hint, never a hard block — plan §3.5).
//   revenuePerHeadGp / herdSize — display/reference only (the income spine is unchanged;
//                       gp/family is untouched — RAW: pastoralist income/family ≈ farming).
//   vulnerability     — reserved tags a future drought/murrain Calamity/Vagary event reads (§3.6).
const PASTORALIST_ECONOMICS = Object.freeze({
  'pastoralist-cattle': Object.freeze({ label: 'Cattle', caloricEfficiency: 0.30, revenuePerHeadGp: 10.41, herdSize: 16,
    rearableTerrain: Object.freeze(['grassland', 'scrubland', 'forest', 'hills']),         // Clear/Grass · Scrub · Woods · Hills
    vulnerability: Object.freeze(['drought', 'murrain']), cite: 'JJ p.436' }),
  'pastoralist-goat':   Object.freeze({ label: 'Goat', caloricEfficiency: 0.37, revenuePerHeadGp: 1.90, herdSize: 16,
    rearableTerrain: Object.freeze(['grassland', 'scrubland', 'forest', 'hills', 'mountains', 'barrens']),
    vulnerability: Object.freeze(['drought', 'murrain']), cite: 'JJ p.437' }),
  'pastoralist-sheep':  Object.freeze({ label: 'Sheep', caloricEfficiency: 0.20, revenuePerHeadGp: 1.58, herdSize: 16,
    rearableTerrain: Object.freeze(['grassland', 'scrubland', 'forest', 'hills', 'mountains']),   // not Barrens
    vulnerability: Object.freeze(['drought', 'murrain', 'wool-market']), cite: 'JJ p.437' }),
  'pastoralist-swine':  Object.freeze({ label: 'Swine', caloricEfficiency: 0.42, revenuePerHeadGp: 1.14, herdSize: 11,
    rearableTerrain: Object.freeze(['grassland', 'scrubland', 'forest', 'hills', 'swamp', 'jungle']),
    vulnerability: Object.freeze(['murrain']), cite: 'JJ p.438' }),
  // Mixed grazing (cattle + one goat/sheep per head on the same acreage — JJ p.436 "different
  // forage niches"): the cattle base + half the small-stock yield (plan §3.4 — 0.30 + 0.5×0.20 ≈
  // 0.40). v1 ships the single default blend; a per-hex mixedGrazingRatio refinement is reserved.
  'mixed':              Object.freeze({ label: 'Mixed grazing', caloricEfficiency: 0.40, revenuePerHeadGp: 0, herdSize: 16,
    rearableTerrain: Object.freeze(['grassland', 'scrubland', 'forest', 'hills']),
    vulnerability: Object.freeze(['drought', 'murrain']), cite: 'JJ p.436' }),
});

// Reserved non-agricultural markers owned by OTHER subsystems (plan §3.2) — valid economyType
// values, but this module is a no-op for them (caloric efficiency 1 ⇒ no density change).
const RESERVED_ECONOMY_TYPES = Object.freeze(['mining', 'fishing', 'forestry', 'magical']);

// ── Catalog accessors ────────────────────────────────────────────────────────

function isPastoralistEconomy(economyType) { return !!PASTORALIST_ECONOMICS[economyType]; }
function pastoralistEconomyInfo(economyType) { return PASTORALIST_ECONOMICS[economyType] || null; }
function pastoralistEconomyTypes() { return Object.keys(PASTORALIST_ECONOMICS); }
function pastoralistEconomyLabel(economyType) {
  if (!economyType || economyType === 'agricultural') return 'Agricultural';
  const e = PASTORALIST_ECONOMICS[economyType];
  if (e) return e.label;
  return economyType.charAt(0).toUpperCase() + economyType.slice(1);
}

// caloric efficiency vs farming. Agricultural (the baseline) + reserved markers + unknown = 1.0
// (a no-op multiplier); pastoralist = 0.20–0.42.
function caloricEfficiencyFor(economyType) {
  const e = PASTORALIST_ECONOMICS[economyType];
  return e ? e.caloricEfficiency : 1;
}

function agriculturalFamilyCapFor(classification) {
  return AGRICULTURAL_FAMILY_CAP[String(classification || '').trim().toLowerCase()] || AGRICULTURAL_FAMILY_CAP.outlands;
}

// pastoralistFamilyCap(classification, economyType) — RR p.340 cap × caloric efficiency, rounded
// (plan §3.3a). Agricultural ⇒ the full agricultural cap. "Land-rich, population-thin."
function pastoralistFamilyCap(classification, economyType) {
  return Math.round(agriculturalFamilyCapFor(classification) * caloricEfficiencyFor(economyType));
}

function rearableTerrainFor(economyType) {
  const e = PASTORALIST_ECONOMICS[economyType];
  return e ? e.rearableTerrain.slice() : null;  // null = agricultural / reserved (no rearing constraint)
}

// Rearability HINT only — GM sovereignty, never a hard block (plan §3.5). Agricultural / reserved
// ⇒ always true (no constraint).
function isTerrainRearable(economyType, terrain) {
  const set = rearableTerrainFor(economyType);
  if (!set) return true;
  return set.indexOf(terrainBaseOf(terrain)) >= 0;
}

// ── Derived per-hex / per-domain readouts (nothing stored beyond economyType) ──

// Per-hex pastoralist readout for the UI + the density factor.
function hexPastoralistInfo(campaign, hex) {
  if (!hex) return null;
  const economyType = hex.economyType || 'agricultural';
  const isPast = isPastoralistEconomy(economyType);
  const families = Math.max(0, Number(hex.families) || 0);
  const cls = hex.classification;
  const agriCap = agriculturalFamilyCapFor(cls);
  const pastCap = isPast ? pastoralistFamilyCap(cls, economyType) : agriCap;
  const effFamilies = Math.min(families, pastCap);
  return {
    hexId: hex.id, economyType, label: pastoralistEconomyLabel(economyType), isPastoralist: isPast,
    hexLabel: hexNameOf(hex) || hex.name || (hex.terrain || 'hex') + (hex.id ? ' · ' + hex.id : ''),
    classification: cls, families,
    caloricEfficiency: caloricEfficiencyFor(economyType),
    agriculturalCap: agriCap, pastoralistCap: pastCap, effectiveFamilies: effFamilies,
    overCap: isPast && families > pastCap, surplus: Math.max(0, families - effFamilies),
    terrainBase: terrainBaseOf(hex.terrain), rearable: isTerrainRearable(economyType, hex.terrain),
    rearableTerrain: rearableTerrainFor(economyType),
    cite: isPast ? PASTORALIST_ECONOMICS[economyType].cite : null,
  };
}

// The pastoralist land-revenue density factor for a domain ∈ (0,1]. Families-weighted across the
// domain's RURAL hexes (rural = no settlement — a hex bearing a settlement is urban, not land): a
// pastoralist hex's land contribution is capped at its carrying capacity (min(families,
// pastoralistCap)); agricultural / reserved hexes contribute identically to numerator + denominator
// (ratio 1). Returns 1.0 ⇒ no pastoralist hex over its cap ⇒ no-op ⇒ byte-identical.
//   In the per-hex land branch of incomeBreakdown (landRow = Σ fam·val), landRow × factor =
//   Σ min(fam,cap)·val EXACTLY. Requires per-hex families; a pure domain-aggregate domain (no
//   per-hex families recorded) ⇒ 1.0 (the carrying-capacity readout still shows; the density bites
//   once per-hex families exist — the v1 boundary, plan §3.3).
function domainPastoralistLandFactor(campaign, d, hexList) {
  if (!campaign || !d) return 1;
  const hexes = (hexList || hexesForDomain(campaign, d.id) || []).filter(h => h && !settlementForHex(campaign, h.id));
  let num = 0, den = 0, hasPastoralist = false;
  for (const h of hexes) {
    const fam = Math.max(0, Number(h.families) || 0);
    if (fam <= 0) continue;
    const val = Number(effectiveHexValue(h)) || 0;
    const economyType = h.economyType || 'agricultural';
    let eff = fam;
    if (isPastoralistEconomy(economyType)) {
      eff = Math.min(fam, pastoralistFamilyCap(h.classification, economyType));
      hasPastoralist = true;
    }
    num += eff * val;
    den += fam * val;
  }
  if (!hasPastoralist || den <= 0) return 1;
  return num / den;
}

// The incomeBreakdown late-bind hook (called via the guarded one-liner in acks-engine-economy.js).
// Returns the land row with its gp scaled by the pastoralist density factor + its label annotated;
// returns the row UNCHANGED when there is no pastoralist effect (factor 1) — byte-identical.
function applyPastoralistLandRevenue(campaign, d, landRow, ctx) {
  if (!landRow || !d) return landRow;
  const factor = domainPastoralistLandFactor(campaign, d, ctx && ctx.hexes);
  if (!(factor < 1)) return landRow;   // factor 1 (or NaN/guard) ⇒ no-op
  const pct = Math.round(factor * 100);
  return {
    label: (landRow.label || 'Land revenue') + ' [pastoralist density ×' + pct + '%]',
    gp: bankersRound((landRow.gp || 0) * factor),
  };
}

// Per-domain pastoralist readout for the UI panel (the rural hex list + the domain density factor).
function domainPastoralistInfo(campaign, d) {
  if (!campaign || !d) return { hasPastoralist: false, hexes: [], factor: 1, densityPct: 100, ruralHexCount: 0, pastoralistHexCount: 0 };
  const all = hexesForDomain(campaign, d.id) || [];
  const rural = all.filter(h => h && !settlementForHex(campaign, h.id));
  const hexInfos = rural.map(h => hexPastoralistInfo(campaign, h)).filter(Boolean);
  const pastoralistHexes = hexInfos.filter(h => h.isPastoralist);
  const factor = domainPastoralistLandFactor(campaign, d, all);
  return {
    hasPastoralist: pastoralistHexes.length > 0,
    factor, densityPct: Math.round(factor * 100),
    hexes: hexInfos,
    pastoralistHexCount: pastoralistHexes.length,
    ruralHexCount: rural.length,
  };
}

// ── The economyType setter + the record-only `economy-type-changed` event ──────

function applyEvent_domainVariantAudit(campaign, event) {
  const p = (event && event.payload) || {};
  return { result: { narrativeSummary: p.narrative || (event && event.kind) || 'economy-type-changed' } };
}

// Record an `economy-type-changed` event (record-only; the §8.9 context envelope — primaryHexId +
// domainId). Mirrors the religion/voyages record-only emit (newEvent → setEventContext → push, status
// APPLIED — no replay handler needed for a record-only audit event).
function _recordEconomyTypeEvent(campaign, hex, from, to, opts) {
  const A = global.ACKS || ACKS;
  if (typeof A.newEvent !== 'function') return null;
  const narrative = (hex.name || hexNameOf(hex) || ('Hex ' + (hex.id || ''))) + ' economy: '
    + pastoralistEconomyLabel(from) + ' → ' + pastoralistEconomyLabel(to);
  const ev = A.newEvent('economy-type-changed', {
    submittedBy: (opts && opts.submittedBy) || 'gm',
    targetTurn: campaign.currentTurn || 1,
    cadence: 'monthly-turn',
    payload: { hexId: hex.id, domainId: hex.domainId || null, from, to, narrative },
  });
  if (typeof A.setEventContext === 'function') A.setEventContext(ev, { primaryHexId: hex.id, domainId: hex.domainId || null });
  ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
  ev.appliedAtTurn = campaign.currentTurn || 1;
  ev.appliedAtDay = campaign.currentDayInMonth || 1;
  if (!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
  campaign.eventLog.push({
    event: ev, result: { narrativeSummary: narrative },
    appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString(),
  });
  return ev;
}

// Set a hex's economyType + record the change. Idempotent (no-op + no event when unchanged).
// Returns { ok, hex, from, to } | { ok:true, unchanged:true, ... } | { ok:false, reason }.
function setHexEconomyType(campaign, hexId, economyType, opts) {
  opts = opts || {};
  const hex = (campaign && Array.isArray(campaign.hexes)) ? campaign.hexes.find(h => h && h.id === hexId) : null;
  if (!hex) return { ok: false, reason: 'no-hex' };
  const valid = economyType === 'agricultural' || isPastoralistEconomy(economyType) || RESERVED_ECONOMY_TYPES.indexOf(economyType) >= 0;
  if (!valid) return { ok: false, reason: 'invalid-economy-type' };
  const from = hex.economyType || 'agricultural';
  if (from === economyType) return { ok: true, hex, from, to: economyType, unchanged: true };
  hex.economyType = economyType;
  _recordEconomyTypeEvent(campaign, hex, from, economyType, opts);
  return { ok: true, hex, from, to: economyType };
}

// ── Self-register the record-only event kind (PR #89 kernel — from THIS module, no events.js edit) ──
if (typeof ACKS.registerEventKind === 'function') {
  ACKS.registerEventKind('economy-type-changed', {
    schema: { R: { hexId: 'string', to: 'string' }, O: { domainId: 'string', from: 'string', narrative: 'string' } },
    wizardOptOut: true, handler: applyEvent_domainVariantAudit,
  });
}

// ── Export onto global.ACKS ───────────────────────────────────────────────────
Object.assign(ACKS, {
  // RAW reference data
  AGRICULTURAL_FAMILY_CAP, PASTORALIST_ECONOMICS, RESERVED_ECONOMY_TYPES,
  // catalog accessors
  isPastoralistEconomy, pastoralistEconomyInfo, pastoralistEconomyTypes, pastoralistEconomyLabel,
  caloricEfficiencyFor, agriculturalFamilyCapFor, pastoralistFamilyCap,
  rearableTerrainFor, isTerrainRearable,
  // derived readouts + the income hook
  hexPastoralistInfo, domainPastoralistLandFactor, applyPastoralistLandRevenue, domainPastoralistInfo,
  // setter + event
  setHexEconomyType, applyEvent_domainVariantAudit,
});

if (typeof module !== 'undefined' && module.exports) { module.exports = ACKS; }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
