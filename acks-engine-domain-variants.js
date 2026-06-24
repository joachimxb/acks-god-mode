/* =============================================================================
 * acks-engine-domain-variants.js — ACKS God Mode Domain Variants (Module: domain-variants)
 *
 * Phase 5 — Domain Variants. This module ships:
 *   • TRIBAL DOMAINS (Phase_5_Tribal_Domains_Plan.md) — the RAW domain-TYPE layer:
 *     Clanhold (RR p.353) · Transitional (RR p.354) · Beastman (clanhold + race tag,
 *     RR p.354) · Demchi (AXIOMS, the cap/income accessors are forward-built here; the
 *     full demchi income ledger + nomad F&D table land in PT-C). On a first-class
 *     Domain.domainType field ('civilized' default | 'clanhold' | 'transitional' | 'demchi')
 *     + Domain.dominantRace (the beastman tag). The field IS the switch — ZERO new house
 *     rules (core-RAW polarity; 'civilized' is byte-identical to today). Headline:
 *     **the domain type owns the per-hex family cap + the levy + the favors/duties set + the
 *     senate gate** (the survey's two-axis finding — pastoralism is a domain TYPE, not a
 *     per-hex economy).
 *   • TERRAIN TRANSFORMATION (P5-TERR; JJ p.412) — unchanged (the lower half of this file).
 *
 * REMOVED 2026-06-24 (Tribal Domains PT-0, Joachim's call): the shipped per-hex Pastoralist
 * economics (the PASTORALIST_ECONOMICS caloric-efficiency catalog, the family-cap-×-efficiency
 * accessors, the incomeBreakdown density late-bind, setHexEconomyType, the `economy-type-changed`
 * event, the 🐄 panel). RAW puts pastoralism in the DOMAIN-TYPE cap (clanhold flat-125 / demchi
 * land-value curve), not a per-hex caloric factor — so the economy layer is retired in favour of
 * the clanhold. A load-migration rewrites any leftover `pastoralist-*`/`mixed` Hex.economyType →
 * 'agricultural'. (The Hex.economyType field stays RESERVED for the still-reserved
 * mining/fishing/forestry/magical markers owned by other subsystems.)
 *
 * Integration (the canonical cap, hexFamilyCap): the domain type's per-hex family cap LATE-BINDS
 * into incomeBreakdown's land row via ONE guarded hook in acks-engine-economy.js
 * (applyDomainTypeLandRevenue — the slot the removed applyPastoralistLandRevenue held). gp/family
 * is untouched (RAW); only the families the capped land sustains generate land revenue. In the
 * per-hex land branch (landRow = Σ fam·val) the hook yields the EXACT capped sum:
 *   clanhold     → Σ min(fam,125)·val
 *   transitional → Σ [min(fam,125)·val + max(0,fam−125)·val·0.5]   (the RR p.354 half-overage)
 *   civilized    → unchanged (factor 1 ⇒ byte-identical — the economy oracle stays green).
 * The −2 vassal-morale-under-clanhold-rule penalty late-binds into moraleModifiersFor (the
 * militia/sanctum precedent). The clanhold conscript/militia ban late-binds into Military W7's
 * levy caps. The senate gate validates Politics' senate-establish path.
 *
 * Load order: AFTER acks-engine-catalogs.js (terrainBase), acks-engine.js (bankersRound /
 * registerLoadMigration), acks-engine-economy.js (effectiveHexValue / hexesForDomain /
 * settlementForHex) and acks-engine-events.js (newEvent / setEventContext / registerEventKind).
 * All cross-module references are call-time aliases onto global.ACKS, so the function bodies
 * never depend on sibling load order.
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

// Per-6-mile-hex agricultural (civilized-type) family ceilings by classification (RR p.340).
// Mirrors the (module-local, unexported) HEX_POP_CEILING in subsystems.js — reference data, not a
// fork. The CIVILIZED branch of the canonical hexFamilyCap (clanhold/transitional use the flat 125,
// demchi the land-value curve).
const AGRICULTURAL_FAMILY_CAP = Object.freeze({ civilized: 780, borderlands: 375, outlands: 185, unsettled: 185 });

// The four RAW domain types (Phase_5_Tribal_Domains_Plan.md §3.1). The Domain.domainType field IS
// the switch (decision 2 — zero new house rules); 'civilized' (the default) is byte-identical to
// today. Demchi's cap/income accessors are forward-built; its full income ledger + nomad F&D table
// land in PT-C.
const DOMAIN_TYPES = Object.freeze(['civilized', 'clanhold', 'transitional', 'demchi']);
const DOMAIN_TYPE_LABELS = Object.freeze({ civilized: 'Civilized', clanhold: 'Barbarian Clanhold', transitional: 'Transitional', demchi: 'Demchi (nomad)' });

// The clanhold flat per-6-mile-hex cap (RR p.353 — always-outlands, extensive subsistence; the
// 24-mile aggregate is 2,000). Transitional uses the same 125 as the FULL-value threshold, with
// overage permitted at half land value (RR p.354).
const CLANHOLD_HEX_FAMILY_CAP = 125;
const CLANHOLD_HEX_FAMILY_CAP_24MILE = 2000;

// Clanhold settlement limits (RR p.353): urban families < 250, Market Class VI max, never > 12.5%
// of the clanhold's peasant population, and NOT raisable by urban investment.
const CLANHOLD_URBAN_FAMILY_HARD_CAP = 250;
const CLANHOLD_URBAN_FRACTION = 0.125;

// Demchi land-value → MAXIMUM population per 6-mile hex (AXIOMS "What is Best in Life" II; the
// inverse of the agricultural "land value → gp/family"). Poor steppe (LV 3) → 10 families/hex.
// PT-C's demchi income ledger reads this; built now so hexFamilyCap is forward-complete.
const DEMCHI_MAX_POP_BY_LAND_VALUE = Object.freeze({ 1: 3, 2: 5, 3: 10, 4: 25, 5: 50 }); // 6+ → 100

// The clanhold restricted Favors & Duties set (RR p.354): a clanhold lord MAY NOT demand a
// call-to-council (except for war), a loan, a charter of monopoly, an office/title, stationed
// troops, scutage/construction, or grant land. He may only call to arms. The standard-table kinds
// NOT in this excluded set remain available. (The full restricted-roll wiring + the demchi 'nomad'
// table are PT-C; PT-A exposes the selector + the excluded set for the UI advisory.)
const CLANHOLD_EXCLUDED_FAVOR_DUTY_KINDS = Object.freeze(['call-to-council', 'loan', 'charter-of-monopoly', 'office', 'troops', 'grant-of-land', 'scutage', 'construction']);

// ── Domain-type accessors (defensive reads — an absent field ⇒ the default) ───

// The domain's type — defensive ('civilized' when absent ⇒ today's behaviour, byte-identical).
function domainTypeOf(d) {
  const t = d && d.domainType;
  return (t && DOMAIN_TYPES.indexOf(t) >= 0) ? t : 'civilized';
}
// The domain's dominant (majority-family) race tag — defensive (null = human/unset).
function dominantRaceOf(d) { return (d && d.dominantRace) || null; }
function domainTypeLabel(t) { return DOMAIN_TYPE_LABELS[t] || DOMAIN_TYPE_LABELS.civilized; }
function isClanhold(d)     { return domainTypeOf(d) === 'clanhold'; }
function isTransitional(d) { return domainTypeOf(d) === 'transitional'; }
function isDemchi(d)       { return domainTypeOf(d) === 'demchi'; }
function isBeastman(d)     { return String(dominantRaceOf(d) || '').toLowerCase() === 'beastman'; }

function agriculturalFamilyCapFor(classification) {
  return AGRICULTURAL_FAMILY_CAP[String(classification || '').trim().toLowerCase()] || AGRICULTURAL_FAMILY_CAP.outlands;
}

// demchiMaxPopulationForLandValue(lv) — AXIOMS WiBiL II (1→3 · 2→5 · 3→10 · 4→25 · 5→50 · 6+→100).
function demchiMaxPopulationForLandValue(lv) {
  const v = Math.max(1, Math.floor(Number(lv) || 1));
  return v >= 6 ? 100 : (DEMCHI_MAX_POP_BY_LAND_VALUE[v] || 100);
}

// The domain a hex belongs to (by hex.domainId). Small local lookup (no shipped domainForHex).
function _domainForHex(campaign, hex) {
  if (!campaign || !hex || !hex.domainId || !Array.isArray(campaign.domains)) return null;
  return campaign.domains.find(d => d && d.id === hex.domainId) || null;
}

// hexFamilyCap(campaign, hex) — THE canonical per-6-mile-hex family cap (plan §5.1). The DOMAIN TYPE
// owns it: clanhold/transitional flat 125 (transitional's overage is handled at half value in the
// income hook), demchi the land-value curve, civilized/unclaimed the RR p.340 classification cap.
// One source of truth for every consumer (the income land-revenue read + any growth/settlement
// readout) ⇒ no double-count.
function hexFamilyCap(campaign, hex) {
  if (!hex) return AGRICULTURAL_FAMILY_CAP.outlands;
  const d = _domainForHex(campaign, hex);
  switch (domainTypeOf(d)) {
    case 'clanhold':
    case 'transitional': return CLANHOLD_HEX_FAMILY_CAP;                                  // 125 (transitional permits overage)
    case 'demchi':       return demchiMaxPopulationForLandValue(effectiveHexValue(hex));  // land-value curve (PT-C)
    default:             return agriculturalFamilyCapFor(hex.classification);             // 185 / 375 / 780
  }
}

// ── Clanhold rules (RR pp.353–354) ───────────────────────────────────────────

// clanholdWarriorCapacity — the clanhold's only levy: 1 clan warrior per peasant family (RR p.433).
function clanholdWarriorCapacity(campaign, d) {
  if (!isClanhold(d)) return 0;
  return Math.max(0, Number(d && d.demographics && d.demographics.peasantFamilies) || 0);
}
// Clanholds CANNOT conscript or levy militia (RR p.433) — only clan warriors. Late-bound into the
// Military W7 levy caps (which return 0 when this is false). Every other type ⇒ true (no change).
function domainAllowsConscription(d) { return !isClanhold(d); }
function domainAllowsMilitia(d)      { return !isClanhold(d); }

// The clanhold urban-family hard cap (RR p.353): min(249, 12.5% of peasants). A clanhold may not
// raise urban families by investment, and its market is Class VI max. Returns null for non-clanholds
// (no special cap). 0 peasants ⇒ 0 urban allowed.
function clanholdMaxUrbanFamilies(d) {
  if (!isClanhold(d)) return null;
  const peasants = Math.max(0, Number(d && d.demographics && d.demographics.peasantFamilies) || 0);
  return Math.min(CLANHOLD_URBAN_FAMILY_HARD_CAP - 1, Math.floor(peasants * CLANHOLD_URBAN_FRACTION));
}

// ── Favors & Duties table selector (plan §5.2 / §7.5) ────────────────────────

// Which F&D table a domain rolls on: clanhold → restricted; demchi → the nomad table (PT-C);
// everything else → the standard RR p.348 table. (PT-A surfaces the selector + the clanhold excluded
// set for the UI advisory; the actual restricted-roll filtering + the nomad table land in PT-C.)
function domainFavorDutyTable(d) {
  if (isClanhold(d)) return 'clanhold-restricted';
  if (isDemchi(d))   return 'nomad';
  return 'standard';
}
// favorDutyKindAllowedForDomain(d, kind) — false only for a clanhold's RR p.354 excluded kinds.
function favorDutyKindAllowedForDomain(d, kind) {
  if (!isClanhold(d)) return true;   // standard/nomad: every kind allowed (nomad detail is PT-C)
  return CLANHOLD_EXCLUDED_FAVOR_DUTY_KINDS.indexOf(kind) < 0;
}

// ── The Politics senate gate (plan §5.5) ─────────────────────────────────────

// A senate (a realm-apex governance mode) cannot sit on a primitive clanhold (RR p.354 — no
// call-to-council except war, no grants of title). Transitional / civilized / demchi may.
function domainTypeAllowsSenate(domainType) {
  return domainType !== 'clanhold';
}

// ── Beastman advisory (RR p.354) ─────────────────────────────────────────────

// Beastman domains are ALWAYS clanholds unless ruled by a Chaotic, non-beastman human/monster of
// great power + intelligence. Modelled as a SOFT advisory (GM override always wins, CLAUDE §5.1):
// returns a {level, message, suggestedType} readout, never a hard block. level: 'ok' | 'advise' |
// 'exception'. A beastman domain set to a non-clanhold type without the chaotic-ruler exception ⇒
// 'advise' (suggest clanhold); the exception met ⇒ 'exception' (ok to be civilized/transitional).
function beastmanDomainTypeAdvisory(campaign, d) {
  if (!isBeastman(d)) return { level: 'ok', message: '', suggestedType: domainTypeOf(d) };
  const t = domainTypeOf(d);
  if (t === 'clanhold' || t === 'demchi') return { level: 'ok', message: 'Beastman clanhold (RR p.354).', suggestedType: 'clanhold' };
  // Non-clanhold beastman domain — check the chaotic-powerful-ruler exception.
  const exception = _meetsBeastmanRulerException(_rulerCharacterOf(campaign, d));
  if (exception) return { level: 'exception', message: 'A Chaotic, powerful, intelligent non-beastman ruler — the RR p.354 exception applies; an ordinary domain is allowed.', suggestedType: t };
  return { level: 'advise', message: 'Beastman domains are normally barbarian clanholds (RR p.354). Only a Chaotic, powerful, intelligent non-beastman ruler makes an ordinary domain. The GM override stands.', suggestedType: 'clanhold' };
}
// The chaotic-powerful-intelligent-non-beastman exception (RR p.354) — a GM-overridable
// interpretation (plan open flag §10.1): Chaotic alignment + name-level (≥9) + high INT (≥13) +
// not a beastman ruler. Read very defensively (it only colours an advisory, never blocks).
function _meetsBeastmanRulerException(ruler) {
  if (!ruler) return false;
  const align = String(ruler.alignment || '').toLowerCase();
  if (align.indexOf('chaotic') < 0 && align.indexOf('chaos') < 0) return false;
  const ab = ruler.abilities || {};
  const intel = Number(ab.int != null ? ab.int : ab.intelligence) || 0;
  const race  = String(ruler.race || '').toLowerCase();
  if (race.indexOf('beastman') >= 0) return false;
  return (Number(ruler.level) || 0) >= 9 && intel >= 13;
}
function _rulerCharacterOf(campaign, d) {
  if (!campaign || !d || !d.rulerCharacterId || !Array.isArray(campaign.characters)) return null;
  return campaign.characters.find(c => c && c.id === d.rulerCharacterId) || null;
}

// ── The income land-revenue hook (the canonical cap's revenue shadow) ─────────

// Per-hex effective land-value contribution under the domain type (plan §5.1–§5.6). gp/family is
// untouched (RAW); the cap limits which families generate land revenue.
//   clanhold     → min(fam,125)·val
//   transitional → min(fam,125)·val + max(0,fam−125)·val·0.5   (RR p.354 — the 126th+ give HALF)
//   demchi / civ → fam·val (demchi's full income ledger is PT-C; here it is unchanged)
function _hexEffectiveLandValue(type, fam, val) {
  if (type === 'clanhold')     return Math.min(fam, CLANHOLD_HEX_FAMILY_CAP) * val;
  if (type === 'transitional') return Math.min(fam, CLANHOLD_HEX_FAMILY_CAP) * val + Math.max(0, fam - CLANHOLD_HEX_FAMILY_CAP) * val * 0.5;
  return fam * val;
}

// domainTypeLandFactor(campaign, d, hexList) ∈ (0,1] — the land-revenue factor for a clanhold /
// transitional domain. Families-weighted across the domain's RURAL hexes (a hex bearing a settlement
// is urban, not land). Returns 1.0 for civilized / demchi / a domain with no over-cap families
// (byte-identical no-op). In the per-hex land branch (landRow = Σ fam·val), landRow × factor =
// Σ effective EXACTLY. (Pure-aggregate domains with no per-hex families ⇒ 1.0 — the v1 boundary; the
// cap readout still shows, the density bites once per-hex families exist.)
function domainTypeLandFactor(campaign, d, hexList) {
  if (!campaign || !d) return 1;
  const type = domainTypeOf(d);
  if (type !== 'clanhold' && type !== 'transitional') return 1;   // civilized / demchi: no cap-shadow here
  const hexes = (hexList || hexesForDomain(campaign, d.id) || []).filter(h => h && !settlementForHex(campaign, h.id));
  let num = 0, den = 0, anyOver = false;
  for (const h of hexes) {
    const fam = Math.max(0, Number(h.families) || 0);
    if (fam <= 0) continue;
    const val = Number(effectiveHexValue(h)) || 0;
    const eff = _hexEffectiveLandValue(type, fam, val);
    if (eff < fam * val) anyOver = true;
    num += eff;
    den += fam * val;
  }
  if (!anyOver || den <= 0) return 1;
  return num / den;
}

// applyDomainTypeLandRevenue(campaign, d, landRow, ctx) — the incomeBreakdown late-bind hook (the slot
// the removed applyPastoralistLandRevenue held; called via the guarded one-liner in
// acks-engine-economy.js). Scales + annotates the land row for a clanhold (125 cap) / transitional
// (½-overage); returns the row UNCHANGED for civilized / demchi / under-cap (factor 1) — byte-identical.
function applyDomainTypeLandRevenue(campaign, d, landRow, ctx) {
  if (!landRow || !d) return landRow;
  const factor = domainTypeLandFactor(campaign, d, ctx && ctx.hexes);
  if (!(factor < 1)) return landRow;   // factor 1 (or NaN/guard) ⇒ no-op
  const tag = isTransitional(d) ? 'transitional ½-overage' : 'clanhold cap 125';
  return {
    label: (landRow.label || 'Land revenue') + ' [' + tag + ' ×' + Math.round(factor * 100) + '%]',
    gp: bankersRound((landRow.gp || 0) * factor),
  };
}

// ── The −2 vassal-morale-under-clanhold-rule penalty (RR p.354) ──────────────

// A civilized / demi-human domain SUBJECTED TO clanhold rule takes −2 base morale (atop any alignment
// penalty). Returns the morale-modifier row (or null) for moraleModifiersFor (late-bound — the
// militia/sanctum precedent). A clanhold / demchi / beastman vassal under a clanhold liege is NOT
// penalised (it is its own kind); only an ordinary domain chafing under a barbarian overlord.
function clanholdVassalMoraleRow(campaign, d) {
  if (!campaign || !d || !d.liegeId) return null;
  if (isClanhold(d) || isDemchi(d) || isBeastman(d)) return null;
  const liege = Array.isArray(campaign.domains) ? campaign.domains.find(x => x && x.id === d.liegeId) : null;
  if (!liege || !isClanhold(liege)) return null;
  return { label: 'Subjected to clanhold rule (RR p.354)', value: -2 };
}

// ── Per-domain readout for the UI panel ──────────────────────────────────────

// domainTypeInfo(campaign, d) — the tribal-domain readout the domain sheet renders: type/label,
// dominant race, the per-hex cap, levy gates, clan-warrior capacity, urban caps, the F&D set, the
// senate gate, the beastman advisory, the transitional clock + land factor.
function domainTypeInfo(campaign, d) {
  if (!d) return null;
  const type = domainTypeOf(d);
  const clanhold = type === 'clanhold', transitional = type === 'transitional', demchi = type === 'demchi';
  const factor = domainTypeLandFactor(campaign, d);
  return {
    domainId: d.id, type, label: domainTypeLabel(type),
    dominantRace: dominantRaceOf(d),
    isClanhold: clanhold, isTransitional: transitional, isDemchi: demchi, isBeastman: isBeastman(d),
    hexFamilyCap: (clanhold || transitional) ? CLANHOLD_HEX_FAMILY_CAP : (demchi ? null : agriculturalFamilyCapFor(d.classification)),
    hexFamilyCap24Mile: clanhold ? CLANHOLD_HEX_FAMILY_CAP_24MILE : null,
    allowsConscription: domainAllowsConscription(d), allowsMilitia: domainAllowsMilitia(d),
    clanWarriorCapacity: clanholdWarriorCapacity(campaign, d),
    maxUrbanFamilies: clanholdMaxUrbanFamilies(d),
    allowsUrbanInvestment: !clanhold,
    favorDutyTable: domainFavorDutyTable(d),
    excludedFavorDutyKinds: clanhold ? CLANHOLD_EXCLUDED_FAVOR_DUTY_KINDS.slice() : [],
    allowsSenate: domainTypeAllowsSenate(type),
    beastmanAdvisory: beastmanDomainTypeAdvisory(campaign, d),
    landRevenueFactor: factor, landRevenuePct: Math.round(factor * 100),
    chiefRaidedThisMonth: !!(d && d.chiefRaidedThisMonth),
    transitionalSince: (d && d.transitionalSince != null) ? d.transitionalSince : null,
    transitionalConversionReady: transitionalConversionReady(campaign, d),
  };
}

// ── setDomainType + decreeTransitional + the record-only events ──────────────

function applyEvent_domainTypeChanged(campaign, event) {
  const p = (event && event.payload) || {};
  return { result: { narrativeSummary: p.narrative || (event && event.kind) || 'domain-type-changed' } };
}
function applyEvent_domainDecreedTransitional(campaign, event) {
  const p = (event && event.payload) || {};
  return { result: { narrativeSummary: p.narrative || (event && event.kind) || 'domain-decreed-transitional' } };
}

// Record-only emit (the §8.9 context envelope — domainId). Mirrors the
// religion/voyages/terrain-transformed record-only pattern (newEvent → setEventContext → push, status
// APPLIED — no replay handler beyond the audit summary).
function _recordDomainTypeEvent(campaign, kind, d, payload, opts) {
  const A = global.ACKS || ACKS;
  if (typeof A.newEvent !== 'function') return null;
  const ev = A.newEvent(kind, {
    submittedBy: (opts && opts.submittedBy) || 'gm',
    targetTurn: campaign.currentTurn || 1,
    cadence: 'monthly-turn',
    payload: Object.assign({ domainId: d.id }, payload),
  });
  if (typeof A.setEventContext === 'function') A.setEventContext(ev, { domainId: d.id });
  ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
  ev.appliedAtTurn = campaign.currentTurn || 1;
  ev.appliedAtDay = campaign.currentDayInMonth || 1;
  if (!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
  campaign.eventLog.push({ event: ev, result: { narrativeSummary: payload.narrative }, appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
  return ev;
}

// setDomainType(campaign, domainId, type, opts) — the canonical domain-type setter (plan §5.4).
// Validates the transition (the senate gate + transitional-is-irrevocable), sets domainType, forces
// classification → Outlands when →clanhold (RR p.353), and emits the record-only `domain-type-changed`
// event. Idempotent (no-op + no event when unchanged). Returns { ok, from, to } | { ok:true,
// unchanged } | { ok:false, reason }. opts.force overrides the soft guards (GM sovereignty).
function setDomainType(campaign, domainId, type, opts) {
  opts = opts || {};
  const d = (campaign && Array.isArray(campaign.domains)) ? campaign.domains.find(x => x && x.id === domainId) : null;
  if (!d) return { ok: false, reason: 'no-domain' };
  if (DOMAIN_TYPES.indexOf(type) < 0) return { ok: false, reason: 'invalid-domain-type' };
  const from = domainTypeOf(d);
  if (from === type) return { ok: true, d, from, to: type, unchanged: true };
  // Transitional is irrevocable: a transitional domain may not revert to clanhold (RR p.354).
  if (from === 'transitional' && type === 'clanhold' && !opts.force) return { ok: false, reason: 'transitional-irrevocable' };
  // Senate gate: a senatorial realm apex cannot become a clanhold (RR p.354). Soft (force overrides).
  if (type === 'clanhold' && !opts.force && _apexHasSenate(campaign, d)) return { ok: false, reason: 'senate-on-apex' };
  d.domainType = type;
  if (type === 'clanhold') d.classification = 'Outlands';   // RR p.353 — clanholds are always outlands
  const narrative = (d.name || domainId) + ' domain type: ' + domainTypeLabel(from) + ' → ' + domainTypeLabel(type);
  _recordDomainTypeEvent(campaign, 'domain-type-changed', d, { from, to: type, narrative }, opts);
  return { ok: true, d, from, to: type };
}

// Whether the domain's realm apex currently runs a senatorial governance (the gate's read). Uses the
// shipped Politics helpers when present (late-bound), else a defensive governance.mode read.
function _apexHasSenate(campaign, d) {
  const A = global.ACKS || ACKS;
  let apex = d;
  if (typeof A.realmApexDomain === 'function') { apex = A.realmApexDomain(campaign, d) || d; }
  const gov = apex && apex.governance;
  if (gov && gov.mode) return gov.mode === 'senatorial';
  if (typeof A.governanceFor === 'function') { const g = A.governanceFor(campaign, apex); return !!g && g.mode === 'senatorial'; }
  return false;
}

// decreeTransitional(campaign, domainId, opts) — a clanhold/civilized domain is decreed transitional
// (RR p.354): irrevocable, stamps transitionalSince (the 20-yr→ordinary clock). The RR criteria
// (ruler is a non-beastman sapient · an urban settlement ≥150 families · adjacent to / in a realm with
// a civilized-or-transitional domain) are returned as an ADVISORY (transitionalDecreeCriteria); GM
// sovereignty — the decree proceeds unless opts.enforceCriteria. Emits `domain-decreed-transitional`.
function decreeTransitional(campaign, domainId, opts) {
  opts = opts || {};
  const d = (campaign && Array.isArray(campaign.domains)) ? campaign.domains.find(x => x && x.id === domainId) : null;
  if (!d) return { ok: false, reason: 'no-domain' };
  if (isTransitional(d)) return { ok: true, d, unchanged: true };
  const crit = transitionalDecreeCriteria(campaign, d);
  if (opts.enforceCriteria && !crit.allMet) return { ok: false, reason: 'criteria-unmet', criteria: crit };
  const from = domainTypeOf(d);
  d.domainType = 'transitional';
  d.transitionalSince = (opts.turn != null) ? opts.turn : (campaign.currentTurn || 1);
  const narrative = (d.name || domainId) + ' decreed Transitional (RR p.354) from ' + domainTypeLabel(from);
  _recordDomainTypeEvent(campaign, 'domain-decreed-transitional', d, { from, transitionalSince: d.transitionalSince, narrative }, opts);
  return { ok: true, d, from, criteria: crit };
}

// The RR p.354 transitional-decree criteria, as an advisory readout (never a hard gate by default).
function transitionalDecreeCriteria(campaign, d) {
  const ruler = _rulerCharacterOf(campaign, d);
  const rulerOk = !isBeastman(d) && (!ruler || String(ruler.race || '').toLowerCase().indexOf('beastman') < 0);
  const urb = Math.max(0, Number(d && d.demographics && d.demographics.urbanFamilies) || 0);
  const urbanOk = urb >= 150;
  // "Adjacent to / in a realm with / vassal to a civilized-or-transitional domain" — approximated by
  // the realm/liege containing a civilized-or-transitional domain (a soft check; GM judgment, plan §6).
  const neighbourOk = _hasCivilizedRealmNeighbour(campaign, d);
  return {
    ruler: rulerOk, urbanSettlement: urbanOk, civilizedNeighbour: neighbourOk,
    allMet: rulerOk && urbanOk && neighbourOk,
    note: 'RR p.354 — advisory; the GM may decree regardless (GM sovereignty).',
  };
}
function _hasCivilizedRealmNeighbour(campaign, d) {
  if (!campaign || !Array.isArray(campaign.domains)) return false;
  const liege = d.liegeId ? campaign.domains.find(x => x && x.id === d.liegeId) : null;
  if (liege && (domainTypeOf(liege) === 'civilized' || domainTypeOf(liege) === 'transitional')) return true;
  return campaign.domains.some(x => x && x.id !== d.id && x.liegeId === d.liegeId && (domainTypeOf(x) === 'civilized' || domainTypeOf(x) === 'transitional'));
}

// transitionalConversionReady(campaign, d) — the 20-game-year clock (RR p.354): a transitional domain
// that has been transitional ≥20 years MAY be ratified to civilized (a GM-prompted conversion, not
// automatic). Returns { ready, yearsElapsed, since } | null (non-transitional). 12 turns = 1 year.
function transitionalConversionReady(campaign, d) {
  if (!isTransitional(d) || d.transitionalSince == null) return null;
  const turn = (campaign && campaign.currentTurn) || 1;
  const years = Math.max(0, (turn - d.transitionalSince) / 12);
  return { ready: years >= 20, yearsElapsed: Math.floor(years), since: d.transitionalSince };
}

// ═══════════════════════════════════════════════════════════════════════════
// TERRAIN TRANSFORMATION (P5-TERR — gap L; JJ p.412)
// ───────────────────────────────────────────────────────────────────────────
// JJ p.412's OPTIONAL rule: as a 6-mile hex's population grows, the LAND ITSELF
// changes (irrigation / deforestation / dredging / terracing). RAW is a POPULATION-
// THRESHOLD crossing, not a rate accrual — the terrain swaps in the month the new
// threshold is reached (plan §4.2; the reserved rate-based shape REVISED). Three
// stages by family count: 0 = natural (1–185) · 1 = 186–325 · 2 = 326–780.
//
// Only HUMAN / HALFLING / HUMANOID(beastman) families transform land (RAW); dwarven /
// gnomish / elven hexes skip (dwarves DESPOIL via mining — a separate driver sharing
// this field, owned by Mines, plan §4.5). v1 reads hex.dominantFamilyRace, default
// human (plan §4.4 — the OQ4 source; defensive-read, no migration).
//
// Reconcile (plan §4.3): writes ONLY hex.terrain / hex.terrainSubtype /
// hex.terrainTransformationState. koppen (the weather key) + biome (derived) +
// hexScale / parentHexId are UNTOUCHED — terrain moves on the terrain axis, weather
// keys off climate; orthogonal by construction. The 2 RAW target sub-types
// hills-terraced / mountains-terraced are added to TERRAIN_SUBTYPES (catalogs.js).
//
// Gated on the `terrain-transformation` house rule (default OFF — JJ p.412's own
// "optional", a legitimate RAW-self-flagged opt-in, plan §6.2/§8). Off ⇒ a no-op ⇒
// byte-identical. Bidirectional: a depopulating hex reverts a stage (plan §4.2).

// TERRAIN_TRANSFORMATION — the JJ p.412 table, keyed by the NATURAL terrainKey (base
// or base-subtype). stages[0] = the natural (display only — reversion echoes the hex's
// actual natural); stages[1]/[2] = the 186–325 / 326–780 targets in OUR taxonomy. RAW
// "prairie" + "farmland" both → grassland-farm (our `farm` token covers both, catalogs
// §TERRAIN_SUBTYPES); the 🔧 best-matches (savanna→farm-like · snowy/volcanic→rocky-like)
// + bare-base defaults mirror the LAIRS_PER_HEX convention. IP-clean: values + cite, no
// prose (§13.6). All 17 RAW rows reproduced.
const TERRAIN_TRANSFORMATION = Object.freeze({
  // Barrens (any: rocky/sandy/tundra) — cultivation/irrigation. RAW "(any)" → one row.
  'barrens':            { driver: 'cultivation/irrigation', cite: 'JJ p.412', stages: [
    { terrain: 'barrens', subtype: '' }, { terrain: 'scrubland', subtype: 'sparse' }, { terrain: 'grassland', subtype: 'farm' } ] },
  // Desert (rocky/sandy) — cultivation/irrigation.
  'desert-rocky':       { driver: 'cultivation/irrigation', cite: 'JJ p.412', stages: [
    { terrain: 'desert', subtype: 'rocky' }, { terrain: 'scrubland', subtype: 'sparse' }, { terrain: 'grassland', subtype: 'farm' } ] },
  'desert-sandy':       { driver: 'cultivation/irrigation', cite: 'JJ p.412', stages: [
    { terrain: 'desert', subtype: 'sandy' }, { terrain: 'scrubland', subtype: 'sparse' }, { terrain: 'grassland', subtype: 'farm' } ] },
  'desert':             { driver: 'cultivation/irrigation', cite: 'JJ p.412', stages: [   // bare default = sandy
    { terrain: 'desert', subtype: 'sandy' }, { terrain: 'scrubland', subtype: 'sparse' }, { terrain: 'grassland', subtype: 'farm' } ] },
  // Forest (deciduous/taiga) — cultivation/deforestation.
  'forest-deciduous':   { driver: 'cultivation/deforestation', cite: 'JJ p.412', stages: [
    { terrain: 'forest', subtype: 'deciduous' }, { terrain: 'scrubland', subtype: 'sparse' }, { terrain: 'grassland', subtype: 'farm' } ] },
  'forest-taiga':       { driver: 'cultivation/deforestation', cite: 'JJ p.412', stages: [
    { terrain: 'forest', subtype: 'taiga' }, { terrain: 'scrubland', subtype: 'sparse' }, { terrain: 'grassland', subtype: 'farm' } ] },
  'forest':             { driver: 'cultivation/deforestation', cite: 'JJ p.412', stages: [   // bare default = deciduous
    { terrain: 'forest', subtype: 'deciduous' }, { terrain: 'scrubland', subtype: 'sparse' }, { terrain: 'grassland', subtype: 'farm' } ] },
  // Grassland (prairie/steppe) — cultivation. prairie + farmland both → our `farm`.
  'grassland-farm':     { driver: 'cultivation', cite: 'JJ p.412', stages: [   // prairie/farmland — already the end-state (no visible change)
    { terrain: 'grassland', subtype: 'farm' }, { terrain: 'grassland', subtype: 'farm' }, { terrain: 'grassland', subtype: 'farm' } ] },
  'grassland-steppe':   { driver: 'cultivation', cite: 'JJ p.412', stages: [
    { terrain: 'grassland', subtype: 'steppe' }, { terrain: 'grassland', subtype: 'farm' }, { terrain: 'grassland', subtype: 'farm' } ] },
  'grassland-savanna':  { driver: 'cultivation', cite: 'JJ p.412', stages: [   // 🔧 no RAW row — matched to prairie (cultivates to farmland)
    { terrain: 'grassland', subtype: 'savanna' }, { terrain: 'grassland', subtype: 'farm' }, { terrain: 'grassland', subtype: 'farm' } ] },
  'grassland':          { driver: 'cultivation', cite: 'JJ p.412', stages: [   // bare default = farm
    { terrain: 'grassland', subtype: 'farm' }, { terrain: 'grassland', subtype: 'farm' }, { terrain: 'grassland', subtype: 'farm' } ] },
  // Hills (forested/rocky) — cultivation/deforestation/terracing → the NEW hills-terraced.
  'hills-forested':     { driver: 'cultivation/deforestation/terracing', cite: 'JJ p.412', stages: [
    { terrain: 'hills', subtype: 'forested' }, { terrain: 'hills', subtype: 'rocky' }, { terrain: 'hills', subtype: 'terraced' } ] },
  'hills-rocky':        { driver: 'cultivation/terracing', cite: 'JJ p.412', stages: [
    { terrain: 'hills', subtype: 'rocky' }, { terrain: 'hills', subtype: 'terraced' }, { terrain: 'hills', subtype: 'terraced' } ] },
  'hills':              { driver: 'cultivation/terracing', cite: 'JJ p.412', stages: [   // bare default = rocky
    { terrain: 'hills', subtype: 'rocky' }, { terrain: 'hills', subtype: 'terraced' }, { terrain: 'hills', subtype: 'terraced' } ] },
  // Jungle — cultivation/deforestation.
  'jungle':             { driver: 'cultivation/deforestation', cite: 'JJ p.412', stages: [
    { terrain: 'jungle', subtype: '' }, { terrain: 'scrubland', subtype: 'dense' }, { terrain: 'scrubland', subtype: 'sparse' } ] },
  // Mountains (forested/rocky/snowy) — cultivation/deforestation/terracing → mountains-terraced.
  'mountains-forested': { driver: 'cultivation/deforestation/terracing', cite: 'JJ p.412', stages: [
    { terrain: 'mountains', subtype: 'forested' }, { terrain: 'mountains', subtype: 'rocky' }, { terrain: 'mountains', subtype: 'terraced' } ] },
  'mountains-rocky':    { driver: 'cultivation/terracing', cite: 'JJ p.412', stages: [
    { terrain: 'mountains', subtype: 'rocky' }, { terrain: 'mountains', subtype: 'rocky' }, { terrain: 'mountains', subtype: 'terraced' } ] },
  'mountains-snowy':    { driver: 'cultivation/terracing', cite: 'JJ p.412', stages: [   // RAW "rocky/snowy" together
    { terrain: 'mountains', subtype: 'snowy' }, { terrain: 'mountains', subtype: 'rocky' }, { terrain: 'mountains', subtype: 'terraced' } ] },
  'mountains-volcanic': { driver: 'cultivation/terracing', cite: 'JJ p.412', stages: [   // 🔧 no RAW row — matched to rocky/snowy
    { terrain: 'mountains', subtype: 'volcanic' }, { terrain: 'mountains', subtype: 'rocky' }, { terrain: 'mountains', subtype: 'terraced' } ] },
  'mountains':          { driver: 'cultivation/terracing', cite: 'JJ p.412', stages: [   // bare default = rocky
    { terrain: 'mountains', subtype: 'rocky' }, { terrain: 'mountains', subtype: 'rocky' }, { terrain: 'mountains', subtype: 'terraced' } ] },
  // Scrubland (sparse/dense) — cultivation/deforestation/irrigation.
  'scrubland-sparse':   { driver: 'cultivation/deforestation/irrigation', cite: 'JJ p.412', stages: [
    { terrain: 'scrubland', subtype: 'sparse' }, { terrain: 'grassland', subtype: 'steppe' }, { terrain: 'grassland', subtype: 'farm' } ] },
  'scrubland-dense':    { driver: 'cultivation/deforestation/irrigation', cite: 'JJ p.412', stages: [
    { terrain: 'scrubland', subtype: 'dense' }, { terrain: 'scrubland', subtype: 'sparse' }, { terrain: 'grassland', subtype: 'farm' } ] },
  'scrubland':          { driver: 'cultivation/deforestation/irrigation', cite: 'JJ p.412', stages: [   // bare default = sparse
    { terrain: 'scrubland', subtype: 'sparse' }, { terrain: 'grassland', subtype: 'steppe' }, { terrain: 'grassland', subtype: 'farm' } ] },
  // Swamp (marshy/scrubby/forested) — dredging/reclamation. RAW prairie → our farm.
  'swamp':              { driver: 'dredging/reclamation', cite: 'JJ p.412', stages: [   // bare = marshy
    { terrain: 'swamp', subtype: '' }, { terrain: 'grassland', subtype: 'farm' }, { terrain: 'grassland', subtype: 'farm' } ] },
  'swamp-scrubby':      { driver: 'deforestation/dredging', cite: 'JJ p.412', stages: [
    { terrain: 'swamp', subtype: 'scrubby' }, { terrain: 'grassland', subtype: 'farm' }, { terrain: 'grassland', subtype: 'farm' } ] },
  'swamp-forested':     { driver: 'deforestation/dredging', cite: 'JJ p.412', stages: [
    { terrain: 'swamp', subtype: 'forested' }, { terrain: 'grassland', subtype: 'farm' }, { terrain: 'grassland', subtype: 'farm' } ] },
});

// The two RAW population-threshold floors (JJ p.412): stage 1 at 186 families, stage 2 at 326.
const TERRAIN_TRANSFORM_THRESHOLDS = Object.freeze([186, 326]);

// terrainTransformStageForFamilies(n) → 0 / 1 / 2 (the RAW 1–185 / 186–325 / 326–780 bands).
function terrainTransformStageForFamilies(families) {
  const f = Math.max(0, Number(families) || 0);
  if (f >= TERRAIN_TRANSFORM_THRESHOLDS[1]) return 2;
  if (f >= TERRAIN_TRANSFORM_THRESHOLDS[0]) return 1;
  return 0;
}

// terrainTransformTargetFor(naturalTerrain, naturalSubtype, stage) → {terrain, subtype} | null.
// stage 0 echoes the natural (the reversion target); stages 1/2 read the JJ p.412 row (base-subtype
// key, falling back to the bare base). null = no transformation defined for this terrain (water/unknown).
function terrainTransformTargetFor(naturalTerrain, naturalSubtype, stage) {
  const base = terrainBaseOf(naturalTerrain);
  const sub = String(naturalSubtype || '').toLowerCase().trim();
  const st = Math.max(0, Math.min(2, stage | 0));
  if (st === 0) return { terrain: base, subtype: sub };  // natural — used for reversion
  const row = TERRAIN_TRANSFORMATION[sub ? (base + '-' + sub) : base] || TERRAIN_TRANSFORMATION[base];
  if (!row || !row.stages[st]) return null;
  return { terrain: row.stages[st].terrain, subtype: row.stages[st].subtype };
}

// The RAW land-transformation restriction (plan §4.4): human/halfling/humanoid(beastman) transform
// land; dwarven/gnomish/elven do not (they despoil via mining — a Mines driver, plan §4.5). Defaults
// to TRUE (human assumption) for an absent/unknown race — the v1 boundary (OQ4), defensive-read.
const _NON_LAND_TRANSFORMING_RACES = Object.freeze(['dwarf', 'dwarven', 'dwarves', 'gnome', 'gnomish', 'gnomes', 'elf', 'elven', 'elves', 'elfblooded']);
function raceTransformsLand(race) {
  const r = String(race == null ? '' : race).toLowerCase().trim();
  if (!r) return true;  // absent/unknown ⇒ human assumption ⇒ transforms (plan §4.4)
  return !_NON_LAND_TRANSFORMING_RACES.some(x => r.indexOf(x) >= 0);
}

// The hex's NATURAL (pre-transformation) terrain — from the stored lineage if present, else the
// current terrain (a never-transformed hex's current terrain IS its natural).
function hexNaturalTerrain(hex) {
  const st = hex && hex.terrainTransformationState;
  if (st && st.naturalTerrain) return { terrain: terrainBaseOf(st.naturalTerrain), subtype: st.naturalSubtype || '' };
  return { terrain: terrainBaseOf(hex && hex.terrain), subtype: (hex && hex.terrainSubtype) || '' };
}

// hexTerrainLineage(hex) → a UI readout: { transformed, natural{}, current{}, stage, history } —
// "this hex is becoming farmland (was desert)". transformed=false ⇒ never transformed (state null).
function hexTerrainLineage(hex) {
  if (!hex) return null;
  const st = hex.terrainTransformationState;
  const nat = hexNaturalTerrain(hex);
  const curBase = terrainBaseOf(hex.terrain), curSub = (hex.terrainSubtype || '');
  const stage = st ? (st.currentStage | 0) : terrainTransformStageForFamilies(hex.families);
  return {
    hexId: hex.id, transformed: !!st,
    natural: nat, current: { terrain: curBase, subtype: curSub },
    stage, families: Math.max(0, Number(hex.families) || 0),
    lastTransformedAtTurn: st ? (st.lastTransformedAtTurn || null) : null,
    history: (st && Array.isArray(st.history)) ? st.history.slice() : [],
  };
}

// A label for a {terrain, subtype} pair, e.g. "Desert (sandy)" / "Grassland (farm)".
function _terrainLabel(t) {
  if (!t || !t.terrain) return '—';
  const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  return cap(t.terrain) + (t.subtype ? ' (' + t.subtype + ')' : '');
}

// ── The terrain-transformed event (record-only, like economy-type-changed) ─────

function applyEvent_terrainTransformed(campaign, event) {
  const p = (event && event.payload) || {};
  return { result: { narrativeSummary: p.narrative || (event && event.kind) || 'terrain-transformed' } };
}

function _recordTerrainTransformedEvent(campaign, hex, rec, opts) {
  const A = global.ACKS || ACKS;
  if (typeof A.newEvent !== 'function') return null;
  const narrative = (hex.name || hexNameOf(hex) || ('Hex ' + (hex.id || ''))) + ': '
    + _terrainLabel({ terrain: rec.fromTerrain, subtype: rec.fromSubtype }) + ' → '
    + _terrainLabel({ terrain: rec.toTerrain, subtype: rec.toSubtype })
    + ' (' + (rec.direction === 'reversion' ? 'depopulation revert' : 'pop. ' + rec.families) + ', JJ p.412)';
  const ev = A.newEvent('terrain-transformed', {
    submittedBy: (opts && opts.submittedBy) || 'engine',
    targetTurn: campaign.currentTurn || 1,
    cadence: 'monthly-turn',
    payload: {
      hexId: hex.id, domainId: hex.domainId || null,
      fromTerrain: rec.fromTerrain, fromSubtype: rec.fromSubtype,
      toTerrain: rec.toTerrain, toSubtype: rec.toSubtype,
      fromStage: rec.fromStage, toStage: rec.toStage, families: rec.families,
      direction: rec.direction, narrative,
    },
  });
  if (typeof A.setEventContext === 'function') {
    const related = rec.demandReviewSettlementId ? [{ kind: 'settlement', id: rec.demandReviewSettlementId }] : [];
    A.setEventContext(ev, { primaryHexId: hex.id, domainId: hex.domainId || null, relatedEntities: related });
  }
  ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
  ev.appliedAtTurn = campaign.currentTurn || 1;
  ev.appliedAtDay = campaign.currentDayInMonth || 1;
  if (!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
  campaign.eventLog.push({ event: ev, result: { narrativeSummary: narrative }, appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
  return ev;
}

// processTerrainTransformationForTurn(campaign, opts) — the monthly consumer (plan §4.4). Gated on the
// `terrain-transformation` house rule (default OFF ⇒ ran:false, no-op). For each land-transforming hex
// whose family count crosses a stage boundary (bidirectional — growth AND depopulation revert), swap
// hex.terrain/terrainSubtype to the JJ p.412 target, update the lineage state, emit a record-only
// terrain-transformed event, and flag any settlement on the hex for a demand-modifier review (RR p.201).
// opts.dryRun ⇒ compute the pending transformations + return them WITHOUT mutating (the UI preview).
// Returns { ran, transformations:[...], logEntries:[...] }.
function processTerrainTransformationForTurn(campaign, opts) {
  opts = opts || {};
  const dryRun = !!opts.dryRun;
  const out = { ran: false, transformations: [], logEntries: [] };
  if (!campaign || !Array.isArray(campaign.hexes)) return out;
  const ruleOn = (typeof ACKS.isHouseRuleEnabled === 'function') ? !!ACKS.isHouseRuleEnabled(campaign, 'terrain-transformation') : false;
  if (!ruleOn) return out;
  out.ran = true;
  const turn = campaign.currentTurn || 1;
  const onlyDomain = opts.domainId || null;                     // scope a manual UI apply to one domain (the monthly commit passes none ⇒ campaign-wide)
  for (const hex of campaign.hexes) {
    if (!hex) continue;
    if (onlyDomain && hex.domainId !== onlyDomain) continue;
    if (terrainBaseOf(hex.terrain) === 'water') continue;       // no transformation for open water
    if (!raceTransformsLand(hex.dominantFamilyRace)) continue;  // dwarven/gnomish/elven skip (RAW)
    const fam = Math.max(0, Number(hex.families) || 0);
    const st = hex.terrainTransformationState;
    const currentStage = st ? (st.currentStage | 0) : 0;
    const targetStage = terrainTransformStageForFamilies(fam);
    if (targetStage === currentStage) continue;                 // no stage crossing
    const nat = hexNaturalTerrain(hex);                         // lineage (stored or current = natural)
    const target = terrainTransformTargetFor(nat.terrain, nat.subtype, targetStage);
    if (!target) continue;                                      // no row for this terrain
    const curBase = terrainBaseOf(hex.terrain), curSub = (hex.terrainSubtype || '');
    if (target.terrain === curBase && (target.subtype || '') === (curSub || '')) {
      // No VISIBLE change (e.g. grassland-farm at every stage) — track the stage silently, no event.
      if (!dryRun) {
        hex.terrainTransformationState = {
          naturalTerrain: nat.terrain, naturalSubtype: nat.subtype, currentStage: targetStage,
          lastTransformedAtTurn: (st && st.lastTransformedAtTurn) || null,
          history: (st && Array.isArray(st.history)) ? st.history.slice() : [],
        };
      }
      continue;
    }
    const settlementId = (typeof settlementForHex === 'function')
      ? (() => { const s = settlementForHex(campaign, hex.id); return s ? s.id : null; })() : null;
    const rec = {
      hexId: hex.id, hexLabel: hexNameOf(hex) || hex.name || (curBase || 'hex') + (hex.id ? ' · ' + hex.id : ''),
      fromStage: currentStage, toStage: targetStage, families: fam,
      fromTerrain: curBase, fromSubtype: curSub, toTerrain: target.terrain, toSubtype: target.subtype,
      naturalTerrain: nat.terrain, naturalSubtype: nat.subtype,
      direction: targetStage > currentStage ? 'growth' : 'reversion',
      driver: (TERRAIN_TRANSFORMATION[nat.subtype ? (nat.terrain + '-' + nat.subtype) : nat.terrain] || TERRAIN_TRANSFORMATION[nat.terrain] || {}).driver || '',
      demandReviewSettlementId: settlementId,
    };
    out.transformations.push(rec);
    if (!dryRun) {
      hex.terrain = target.terrain;
      hex.terrainSubtype = target.subtype;
      hex.terrainTransformationState = {
        naturalTerrain: nat.terrain, naturalSubtype: nat.subtype, currentStage: targetStage,
        lastTransformedAtTurn: turn,
        history: ((st && Array.isArray(st.history)) ? st.history.slice() : []).concat([{
          turn, fromTerrain: curBase + (curSub ? '-' + curSub : ''),
          toTerrain: target.terrain + (target.subtype ? '-' + target.subtype : ''),
          families: fam, threshold: targetStage,
        }]),
      };
      _recordTerrainTransformedEvent(campaign, hex, rec, opts);
      out.logEntries.push('Terrain transformation: ' + rec.hexLabel + ' ' + _terrainLabel({ terrain: rec.fromTerrain, subtype: rec.fromSubtype })
        + ' → ' + _terrainLabel({ terrain: rec.toTerrain, subtype: rec.toSubtype })
        + (rec.direction === 'reversion' ? ' (depopulation)' : '') + (settlementId ? ' — review market demand modifiers (RR p.201)' : '') + ' (JJ p.412)');
    }
  }
  return out;
}

// ── Self-register the record-only event kinds (PR #89 kernel — from THIS module, no events.js edit) ──
if (typeof ACKS.registerEventKind === 'function') {
  ACKS.registerEventKind('domain-type-changed', {
    schema: { R: { domainId: 'string', to: 'string' }, O: { from: 'string', narrative: 'string' } },
    wizardOptOut: true, handler: applyEvent_domainTypeChanged,
  });
  ACKS.registerEventKind('domain-decreed-transitional', {
    schema: { R: { domainId: 'string' }, O: { from: 'string', transitionalSince: 'number', narrative: 'string' } },
    wizardOptOut: true, handler: applyEvent_domainDecreedTransitional,
  });
  ACKS.registerEventKind('terrain-transformed', {
    schema: { R: { hexId: 'string', toTerrain: 'string' }, O: { domainId: 'string', fromTerrain: 'string', fromSubtype: 'string', toSubtype: 'string', fromStage: 'number', toStage: 'number', families: 'number', direction: 'string', narrative: 'string' } },
    wizardOptOut: true, handler: applyEvent_terrainTransformed,
  });
}

// Self-register the `terrain-transformation` house rule (default OFF — JJ p.412 is explicitly
// "optional" + dynastic-timescale content; a legitimate RAW-self-flagged opt-in, NOT a RAW demotion,
// plan §6.2/§8). Registered from THIS module (the §15.5 convention — no catalogs.js edit).
if (typeof ACKS.registerHouseRule === 'function') {
  ACKS.registerHouseRule({
    id: 'terrain-transformation', category: 'domain', name: 'Terrain Transformation (JJ p.412)',
    source: 'ACKS II JJ p.412 (RAW-self-flagged optional)', default: false,
    description: 'OFF by default. JJ p.412’s optional dynastic rule: as a 6-mile hex’s population grows, the LAND ITSELF changes — deserts are irrigated to grassland, forests cut to farmland, swamps dredged, hills/mountains terraced. The monthly turn checks each human/halfling/beastman hex against the RAW family thresholds (186 / 326) and swaps the terrain at a stage crossing (bidirectional — a depopulating hex reverts); a settlement on the hex is flagged for a market demand-modifier review (RR p.201). Dwarven/gnomish/elven hexes do not transform land. When off the data is non-functional + hidden.',
  });
}

// ── PT-0 load-migration: retire the removed pastoralist economyType values ────
// Any leftover `pastoralist-*` / `mixed` Hex.economyType (from the removed P5-PAST layer) → the
// 'agricultural' baseline (the field stays reserved for mining/fishing/forestry/magical). Idempotent;
// a hex without a pastoralist value is untouched ⇒ clean templates stay byte-identical. domainType /
// dominantRace are NOT backfilled (defensive-read covers them — the no-template-churn idiom). Self-
// registered (the §15.5 convention; orders 10..190 are taken, so this slots at 200).
if (typeof ACKS.registerLoadMigration === 'function') {
  ACKS.registerLoadMigration('domain-variants-retire-pastoralist-economy', function(campaign) {
    if (!campaign || !Array.isArray(campaign.hexes)) return;
    for (const hex of campaign.hexes) {
      if (hex && /^(pastoralist-|mixed$)/.test(String(hex.economyType || ''))) hex.economyType = 'agricultural';
    }
  }, { order: 200 });
}

// ── Export onto global.ACKS ───────────────────────────────────────────────────
Object.assign(ACKS, {
  // RAW reference data
  AGRICULTURAL_FAMILY_CAP, DOMAIN_TYPES, DOMAIN_TYPE_LABELS,
  CLANHOLD_HEX_FAMILY_CAP, CLANHOLD_HEX_FAMILY_CAP_24MILE, DEMCHI_MAX_POP_BY_LAND_VALUE,
  CLANHOLD_EXCLUDED_FAVOR_DUTY_KINDS,
  // domain-type accessors
  domainTypeOf, dominantRaceOf, domainTypeLabel, isClanhold, isTransitional, isDemchi, isBeastman,
  agriculturalFamilyCapFor, demchiMaxPopulationForLandValue, hexFamilyCap,
  // clanhold rules + levy gates
  clanholdWarriorCapacity, domainAllowsConscription, domainAllowsMilitia, clanholdMaxUrbanFamilies,
  // favors & duties selector + senate gate + beastman advisory
  domainFavorDutyTable, favorDutyKindAllowedForDomain, domainTypeAllowsSenate, beastmanDomainTypeAdvisory,
  // the income hook + the −2 vassal-morale row + the UI readout
  domainTypeLandFactor, applyDomainTypeLandRevenue, clanholdVassalMoraleRow, domainTypeInfo,
  // setters + events
  setDomainType, decreeTransitional, transitionalDecreeCriteria, transitionalConversionReady,
  applyEvent_domainTypeChanged, applyEvent_domainDecreedTransitional,
  // ── Terrain Transformation (P5-TERR; JJ p.412) ──
  TERRAIN_TRANSFORMATION, TERRAIN_TRANSFORM_THRESHOLDS,
  terrainTransformStageForFamilies, terrainTransformTargetFor, raceTransformsLand,
  hexNaturalTerrain, hexTerrainLineage,
  processTerrainTransformationForTurn, applyEvent_terrainTransformed,
});

if (typeof module !== 'undefined' && module.exports) { module.exports = ACKS; }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
