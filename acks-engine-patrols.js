/* =============================================================================
 * acks-engine-patrols.js — ACKS God Mode Garrison Patrols (Module: patrols)
 *
 * The `garrison-patrols` house rule (default OFF). RAW substrate: a "Man, Patroller"
 * civilized wilderness encounter (JJ p.43 Civilized Encounter table; the patrol is
 * "organized groups of soldiers dispatched to keep order in the civilized realms",
 * MM p.226). The MM entry is explicit that its medium-cavalry / composite-bowmen
 * statline is "just an example… the Judge can and should stock his wilderness with
 * patrollers that are trained and equipped in sensible ways for his campaign!" This
 * rule operationalises that invitation: when a patroller is met inside a domain the
 * GM actually models, the patrol is drawn from that domain's REAL garrison (the Units
 * stationed {kind:'domain-garrison'}, RR p.341), choosing the troop type best suited
 * to the hex terrain — and patrollers slain in the meeting are subtracted from the
 * garrison's headcount.
 *
 * Two seams:
 *   1. GROUNDING (read) — groundPatrollerToGarrison() picks the best garrison unit for
 *      the hex. Called from createEncounterFromDraw (acks-engine.js), right after the
 *      SD-5b census grounding, gated on the rule + the 'patroller' catalog key. It
 *      stamps monsterSide.garrison{DomainId,UnitId,TroopTypeKey}, relabels the side, and
 *      caps the patrol count at the garrison's strength (a patrol is a detachment — it
 *      cannot field more soldiers than the garrison holds). Mirrors the SD-5b precedent.
 *   2. CASUALTIES (write) — applyGarrisonPatrolCasualties() permanently reduces the
 *      source unit's count (the RR p.351 bandit-settle "permanent removal" precedent,
 *      not the wounded/return `casualties` accrual). Surfaced on the encounter
 *      resolution panel; the smaller garrison then flows automatically into
 *      garrisonHeadcount / garrisonCost / garrisonBR / adequacy (acks-engine-economy.js).
 *
 * Doctrine: additive only — three lazy, defensive monsterSide fields (no migration); a
 * registry-driven house rule (the ⚙ House Rules ▸ ⚔ Encounters toggle is free); no new
 * entity / prefix / collection / event kind (encounter resolution is direct-mutation +
 * history, not event-sourced — this matches resolveEncounter). When the rule is off the
 * grounding never fires and the fields stay null ⇒ hidden + non-functional (principle 8).
 *
 * Load order: AFTER acks-engine-catalogs.js (terrainBase / registerHouseRule),
 * acks-engine.js (findHex / findEncounter / domainGarrisonUnits / isHouseRuleEnabled) and
 * acks-engine-troops.js (findTroopType). All cross-module references are call-time aliases
 * onto global.ACKS, so the bodies never depend on sibling load order.
 * =============================================================================
 */
(function(global){
'use strict';
global.ACKS = global.ACKS || {};
const ACKS = global.ACKS;

// Call-time aliases (resolve at invocation — sibling load order is irrelevant for the bodies).
const findHex             = (...a) => (typeof ACKS.findHex === 'function' ? ACKS.findHex(...a) : null);
const findEncounter       = (...a) => (typeof ACKS.findEncounter === 'function' ? ACKS.findEncounter(...a) : null);
const domainGarrisonUnits = (...a) => (typeof ACKS.domainGarrisonUnits === 'function' ? ACKS.domainGarrisonUnits(...a) : []);
const findTroopType       = (...a) => (typeof ACKS.findTroopType === 'function' ? ACKS.findTroopType(...a) : null);
const terrainBaseOf       = (t) => { if(typeof ACKS.terrainBase === 'function'){ const b = ACKS.terrainBase(t); if(b) return b; } const k = String(t||'').trim().toLowerCase(); const d = k.indexOf('-'); return d > 0 ? k.slice(0, d) : k; };

// ── Helpers ──────────────────────────────────────────────────────────────────

// Active strength of a unit (RR — count minus the wounded/lost accrual). Garrison units
// at rest carry casualties 0, so this is normally just count; the guard keeps it honest.
function unitActiveCount(u){ return Math.max(0, (u && u.count || 0) - (u && u.casualties || 0)); }

function troopRowForUnit(u){
  if(!u) return null;
  return findTroopType(u.unitTypeKey, { race: u.race || 'man', veteran: !!u.veteran, loadout: u.loadout || null });
}

// The RAW patroller archetype for a hex — 'mounted' or 'foot'. The Civilized Encounter
// table (JJ p.43) already prints it in the cell label ("(camel lancers)" / "(med. cavalry)"
// → mounted; "(bowman)" → foot), so the label is the primary signal; terrain is the fallback
// (MM p.226: barrens/desert/grassland/scrubland → mounted lancers; forest/mountain/etc → foot
// bowmen). The JJ table groups hills + mountains as bowmen, so only the open terrains are mounted.
const _OPEN_TERRAINS = { barrens:1, desert:1, grassland:1, scrubland:1 };
function patrolArchetypeFromLabel(label){
  const s = String(label || '').toLowerCase();
  if(!s) return null;
  if(s.indexOf('bow') >= 0 || s.indexOf('archer') >= 0) return 'foot';
  if(s.indexOf('cav') >= 0 || s.indexOf('lancer') >= 0 || s.indexOf('camel') >= 0 || s.indexOf('horse') >= 0) return 'mounted';
  return null;
}
function patrolArchetypeFromTerrain(hex){
  const base = terrainBaseOf(hex && hex.terrain);
  return _OPEN_TERRAINS[base] ? 'mounted' : 'foot';
}
function patrolArchetypeForHex(hex, label){
  return patrolArchetypeFromLabel(label) || patrolArchetypeFromTerrain(hex);
}

const _MISSILE_RE = /bow|crossbow|archer|sling/;
function isMissileTroop(row){ return !!(row && _MISSILE_RE.test(String(row.typeKey || ''))); }
function isCavalryTroop(row){ return !!(row && row.category === 'cavalry'); }

// How well a garrison unit fits the terrain's patroller archetype (higher = better).
// Mounted terrain wants cavalry; foot terrain wants foot bowmen, then foot melee, then
// (least apt) cavalry. An unknown troop row still scores > 0 so the garrison is never
// disqualified — RAW only says the type should be "sensible", and any garrison beats none.
function patrolFitScore(archetype, row){
  const cav = isCavalryTroop(row), missile = isMissileTroop(row);
  if(archetype === 'mounted') return cav ? 3 : 1;
  // 'foot' (the default)
  if(!cav && missile) return 3;
  if(!cav) return 2;
  return 1;
}

// ── Seam 1 — grounding a patroller to the hex's domain garrison ─────────────────
// groundPatrollerToGarrison(campaign, {hexId, label}) → the chosen garrison detail
// {domainId, domainName, unitId, troopTypeKey, troopLabel, availableCount, archetype}
// or null (no hex / wilderness hex / unmodelled domain / empty garrison ⇒ the generic
// RAW patroller stands). PURE + DETERMINISTIC: the best-fit unit, ties broken by the
// larger active strength then the catalog order — so the preview and the commit agree.
function groundPatrollerToGarrison(campaign, opts){
  opts = opts || {};
  if(!campaign || !opts.hexId) return null;
  const hex = findHex(campaign, opts.hexId);
  if(!hex || !hex.domainId) return null;                       // wilderness / no hex → no garrison to draw on
  const domain = (campaign.domains || []).find(d => d && d.id === hex.domainId);
  if(!domain) return null;
  const units = domainGarrisonUnits(campaign, domain).filter(u => u && unitActiveCount(u) > 0);
  if(!units.length) return null;                               // an unpaid / empty garrison → the generic table stands
  const archetype = patrolArchetypeForHex(hex, opts.label);
  let best = null, bestScore = -1, bestActive = -1;
  for(const u of units){
    const score = patrolFitScore(archetype, troopRowForUnit(u));
    const active = unitActiveCount(u);
    if(score > bestScore || (score === bestScore && active > bestActive)){
      best = u; bestScore = score; bestActive = active;
    }
  }
  if(!best) return null;
  const row = troopRowForUnit(best);
  return {
    domainId: domain.id,
    domainName: domain.name || domain.id,
    unitId: best.id,
    troopTypeKey: best.unitTypeKey,
    troopLabel: best.displayName || (row ? row.label : best.unitTypeKey),
    availableCount: unitActiveCount(best),
    archetype
  };
}

// ── Seam 2 — casualties write back to the garrison ──────────────────────────────
// applyGarrisonPatrolCasualties(campaign, encounterId, killed) → {ok, killed, unitId,
// remaining, domainId} | {ok:false, error}. Permanently subtracts the slain from the
// source garrison unit (count down — RR p.351 bandit-settle precedent), capped at the
// patrol's own strength and the unit's count. Idempotent-ish: each call applies an
// INCREMENT (the survivors shrink too), so a re-click self-limits at the smaller patrol.
function applyGarrisonPatrolCasualties(campaign, encounterId, killed){
  if(!campaign) return { ok:false, error:'no-campaign' };
  const enc = findEncounter(campaign, encounterId);
  if(!enc) return { ok:false, error:'unknown-encounter' };
  const ms = enc.monsterSide || {};
  if(!ms.garrisonUnitId) return { ok:false, error:'not-a-garrison-patrol' };
  const unit = (campaign.units || []).find(u => u && u.id === ms.garrisonUnitId);
  if(!unit) return { ok:false, error:'garrison-unit-gone' };   // disbanded / removed since the meeting
  let n = Math.floor(Number(killed) || 0);
  if(n <= 0) return { ok:false, error:'no-casualties' };
  const patrolMax = (ms.count != null) ? ms.count : (unit.count || 0);
  n = Math.min(n, patrolMax, unit.count || 0);
  if(n <= 0) return { ok:false, error:'nothing-to-apply' };
  unit.count = Math.max(0, (unit.count || 0) - n);
  if(!Array.isArray(unit.history)) unit.history = [];
  unit.history.push({ atTurn: campaign.currentTurn || 1, type: 'patrol-casualties',
    summary: n + ' lost on patrol (encounter ' + enc.id + ')' });
  if(!Array.isArray(enc.history)) enc.history = [];
  enc.history.push({ turn: campaign.currentTurn || 1, type: 'garrison-casualties',
    reason: n + ' patroller(s) slain → ' + (unit.displayName || 'garrison unit') + ' reduced to ' + unit.count });
  if(ms.count != null) ms.count = Math.max(0, ms.count - n);   // the survivors shrink too
  return { ok:true, killed:n, unitId:unit.id, remaining:unit.count, domainId: ms.garrisonDomainId || null };
}

// garrisonPatrolSummary(campaign, encounterId) → the derived display detail for the
// resolution panel {domainId, domainName, unitId, unitPresent, troopTypeKey, troopLabel,
// patrolCount, garrisonRemaining} or null (not a grounded garrison patrol). Read-only.
function garrisonPatrolSummary(campaign, encounterId){
  const enc = findEncounter(campaign, encounterId);
  if(!enc) return null;
  const ms = enc.monsterSide || {};
  if(!ms.garrisonUnitId) return null;
  const unit = (campaign.units || []).find(u => u && u.id === ms.garrisonUnitId);
  const domain = (campaign.domains || []).find(d => d && d.id === ms.garrisonDomainId);
  const row = unit ? troopRowForUnit(unit) : null;
  return {
    domainId: ms.garrisonDomainId || null,
    domainName: domain ? (domain.name || domain.id) : '(unknown domain)',
    unitId: ms.garrisonUnitId,
    unitPresent: !!unit,
    troopTypeKey: ms.garrisonTroopTypeKey || (unit ? unit.unitTypeKey : null),
    troopLabel: unit ? (unit.displayName || (row ? row.label : unit.unitTypeKey))
                     : (ms.garrisonTroopTypeKey || 'troops'),
    patrolCount: (ms.count != null) ? ms.count : null,
    garrisonRemaining: unit ? Math.max(0, unit.count || 0) : 0
  };
}

// ── Self-register the house rule (default OFF — a GM enhancement that operationalises the
// MM p.226 "stock sensible patrollers" invitation over modelled garrisons; NOT a RAW
// demotion, so opt-in is correct, §6 polarity). Registered from THIS module (§15.5). ──
if(typeof ACKS.registerHouseRule === 'function'){
  ACKS.registerHouseRule({
    id: 'garrison-patrols', category: 'encounters',
    name: 'Patrols drawn from the domain garrison',
    source: 'ACKS II MM p.226 (Man, Patroller) + RR p.341 (garrison)', default: false,
    description: 'OFF by default. When a "Man, Patroller" civilized encounter occurs in a hex that lies inside a domain you model, the patrol is drawn from that domain’s ACTUAL garrison instead of the generic table type — the troop type best suited to the hex terrain (mounted in open country, foot bowmen in forest/mountain, per MM p.226), capped at the garrison’s strength. Any patrollers slain in the meeting are subtracted from the garrison’s headcount (RR p.341), which feeds garrison cost / Battle Rating / adequacy. The MM itself invites this — its medium-cavalry/bowman statline is "just an example… the Judge can and should stock his wilderness with patrollers… sensible for his campaign". When off, patrollers use the generic RAW table type and the garrison is never touched (the data stays non-functional + hidden).'
  });
}

// ── Export onto global.ACKS ───────────────────────────────────────────────────
Object.assign(ACKS, {
  // grounding (read) + casualties (write) + the display helper
  groundPatrollerToGarrison, applyGarrisonPatrolCasualties, garrisonPatrolSummary,
  // archetype/fit helpers (exported for the smoke suite + future reuse)
  patrolArchetypeForHex, patrolFitScore,
});

if(typeof module !== 'undefined' && module.exports){ module.exports = ACKS; }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
