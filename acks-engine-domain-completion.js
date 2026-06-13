/* =============================================================================
 * acks-engine-domain-completion.js — ACKS God Mode Domain Completion (Module: domain-completion)
 *
 * DC-0 — the spatial-query foundation for RR p.340 classification advancement
 * (Domain_Completion_Plan.md §5 + §12). A PURE derivation over the shipped
 * campaign.hexes[] map data — no new canonical data, like Map Mode. It answers
 * the two spatial advancement/growth conditions RAW assumes a Judge with a map
 * settles by eye:
 *   • "road-connected to a small town within 24 miles"  (RR p.340, condition 1)
 *   • "within 72/48 miles of a friendly city or large town" (RR p.340/p.339)
 *
 * Everything here REUSES the shipped primitives (it does NOT reimplement them):
 *   - ACKS.hexAxialDistance / ACKS.hexAtCoord / ACKS.hexesForDomain
 *   - ACKS.settlementForHex / ACKS.lookupSettlementBenchmark  (RR p.352 sizes)
 *   - ACKS.roadBonusForStep / ACKS.hexEdgeBetween / ACKS.hexOppositeEdge /
 *     ACKS.hexNeighborDeltas  (the v0.15.0 §24 per-side road-edge model — so the
 *     road rule matches journeys EXACTLY).
 *
 * The road-to-small-town check is fully derivable (road + distance + size). The
 * friendly-city check derives the DISTANCE band; "friendly" is a diplomacy notion
 * the tool lacks, so it stays GM-asserted (read defensively from domain.nearFriendlyCity,
 * a DC-2 field — absent here ⇒ 'auto' ⇒ derive). Both keep a GM override
 * (canonical-setter discipline, principle #10): the derived value is the truth,
 * domain.roadToTownOverride (null|true|false) overrides it for map-less campaigns.
 * The override is READ DEFENSIVELY (`?? derived`); DC-0 does NOT lazy-inject it into
 * migrateCampaign, so the 6 templates stay true migrate-no-ops.
 *
 * SCOPE: DC-0 is the derived spatial-query layer + a read-only panel ONLY. The
 * classification-advance apply (commitTurn), the effectiveDomainClassification
 * permanence floor, and the morale-effect modifiers are DC-2 / DC-3 (NOT here).
 *
 * Load order: LAST (after acks-engine-subsystems.js, which owns the §24 road-edge
 * model + hexAtCoord helpers). All OUT references resolve at call-time on the
 * shared global.ACKS object — every function runs long after every module loads.
 *
 * Authored 2026-06-13 — world-layer team session (CLAUDE §15), agent-3 lane.
 * =============================================================================
 */
(function(global){
'use strict';
global.ACKS = global.ACKS || {};
const ACKS = global.ACKS;

// Settlement size labels in ascending order (RR p.352 — the SETTLEMENT_BENCHMARKS `type`
// values). Only the ORDINAL sense of the labels lives here; the family→type classification
// itself is ACKS.lookupSettlementBenchmark's job (no duplicated thresholds). 'Small Town' = a
// settlement of ≥500 families; 'Large Town' = ≥625. Duplicated labels (Village ×2, Large City
// ×3) share a rank — indexOf finds the first, which is correct for an ordinal compare.
const _SETTLEMENT_TYPE_RANK = Object.freeze([
  'Hamlet', 'Small Village', 'Village', 'Large Village',
  'Small Town', 'Large Town', 'Small City', 'City', 'Large City', 'Metropolis'
]);

// A settlement of `families` is at least `minType` in size (RR p.352). Reuses
// lookupSettlementBenchmark for the classification; compares by ordinal rank.
function _settlementAtLeast(families, minType){
  const b = ACKS.lookupSettlementBenchmark(families || 0);
  const have = _SETTLEMENT_TYPE_RANK.indexOf(b ? b.type : 'Hamlet');
  const need = _SETTLEMENT_TYPE_RANK.indexOf(minType);
  return have >= 0 && need >= 0 && have >= need;
}

// Resolve a hex by id — canonical top-level store first, then the nested geography mirror.
function _hex(campaign, hexId){
  if(!campaign || !hexId) return null;
  return ACKS.findHex(campaign, hexId) || ACKS.resolveHexAnywhere(campaign, hexId) || null;
}

// The settlement at a hex (embedded hex.settlement wins, else the campaign.settlements[] entry —
// the line-4498 convention) and its family count. A hex with no urban settlement → 0.
function _settlementAtHex(campaign, hex){
  if(!hex) return null;
  return hex.settlement || ACKS.settlementForHex(campaign, hex.id) || null;
}
function _familiesAtHex(campaign, hex){
  const s = _settlementAtHex(campaign, hex);
  return s ? (s.families || 0) : 0;
}

// The domain's controlled (origin) hexes. Canonical: hexes whose domainId === d.id
// (ACKS.hexesForDomain — what settlementsForDomain uses). Fallback: geography.controlledHexList.
function _domainOriginHexes(campaign, domain){
  if(!campaign || !domain) return [];
  const byId = ACKS.hexesForDomain(campaign, domain.id);
  if(byId && byId.length) return byId;
  const list = domain.geography && domain.geography.controlledHexList;
  if(Array.isArray(list) && list.length){
    return list.map(ref => _hex(campaign, typeof ref === 'string' ? ref : (ref && ref.id))).filter(Boolean);
  }
  return [];
}

// =============================================================================
// Hex adjacency + road-edge connectivity (reuses the §24 road-edge model).
// =============================================================================

// Up-to-6 adjacent AUTHORED hexes and the shared edge index (on `hexId`, in HEX_EDGE_DELTAS
// order — same value hexEdgeBetween(hex, nbr) would return). Pure.
function hexNeighbors(campaign, hexId){
  const hex = _hex(campaign, hexId);
  if(!hex || !hex.coord) return [];
  const deltas = ACKS.hexNeighborDeltas();   // [[dq,dr] × 6], edge order
  const out = [];
  for(let side = 0; side < deltas.length; side++){
    const nbr = ACKS.hexAtCoord(campaign, (hex.coord.q || 0) + deltas[side][0], (hex.coord.r || 0) + deltas[side][1]);
    if(nbr) out.push({ hex: nbr, side });
  }
  return out;
}

// Does a road run across the shared edge between hexA (exit edge `side`) and hexB (entry edge
// (side+3)%6)? Reuses roadBonusForStep's entry/exit logic so the rule matches journeys exactly:
// A must carry a road onto the shared edge AND B must carry one off it (or either flags the
// coarse legacy hex.hasRoad, which roadBonusForStep treats as roaded throughout). Pure.
function hexesRoadConnected(campaign, hexA, hexB, side){
  if(!hexA || !hexB || side == null || side < 0) return false;
  const opp = ACKS.hexOppositeEdge(side);
  return ACKS.roadBonusForStep(hexA, null, side) && ACKS.roadBonusForStep(hexB, opp, null);
}

// BFS over hexNeighbors following ROAD edges only, bounded by maxHexes steps. Returns
// Map<hexId, depth> of road-reachable hexes (depth 1..maxHexes; the origin is excluded). Pure.
function _roadReachableDepths(campaign, fromHexId, maxHexes){
  const out = new Map();
  const start = _hex(campaign, fromHexId);
  if(!start || !start.coord || !(maxHexes > 0)) return out;
  const visited = new Set([start.id]);
  let frontier = [start];
  let depth = 0;
  while(frontier.length && depth < maxHexes){
    depth++;
    const next = [];
    for(const hex of frontier){
      for(const { hex: nbr, side } of hexNeighbors(campaign, hex.id)){
        if(visited.has(nbr.id)) continue;
        if(!hexesRoadConnected(campaign, hex, nbr, side)) continue;
        visited.add(nbr.id);
        out.set(nbr.id, depth);
        next.push(nbr);
      }
    }
    frontier = next;
  }
  return out;
}

// Public Set form (Domain_Completion_Plan.md §12.2): the road-reachable hexIds within maxHexes
// steps from fromHexId (excludes the origin). Pure.
function roadReachableHexes(campaign, fromHexId, maxHexes){
  return new Set(_roadReachableDepths(campaign, fromHexId, maxHexes).keys());
}

// =============================================================================
// The two RR p.340 spatial conditions.
// =============================================================================

// "Road-connected to a small town within 24 miles" (RR p.340, condition 1). From each of the
// domain's controlled hexes, BFS the road network and return the NEAREST reached hex holding a
// settlement ≥ minType ('Small Town' ⇒ ≥500 families). 24mi ⇒ 4 six-mile hexes. Pure.
//   → { found:true, witnessHexId, settlementFamilies, miles } | { found:false }
function roadConnectedToSmallTown(campaign, domain, opts){
  opts = opts || {};
  const maxMiles = (opts.maxMiles != null) ? opts.maxMiles : 24;
  const minType  = opts.minType || 'Small Town';
  const maxHexes = Math.floor(maxMiles / 6);
  let best = null;
  for(const origin of _domainOriginHexes(campaign, domain)){
    const depths = _roadReachableDepths(campaign, origin.id, maxHexes);
    for(const [hexId, depth] of depths){
      const fam = _familiesAtHex(campaign, _hex(campaign, hexId));
      if(fam <= 0 || !_settlementAtLeast(fam, minType)) continue;
      const miles = depth * 6;
      if(!best || miles < best.miles) best = { found: true, witnessHexId: hexId, settlementFamilies: fam, miles };
    }
  }
  return best || { found: false };
}

// Nearest settlement ≥ minType within maxMiles by STRAIGHT-LINE hex distance (no road needed) —
// the friendly-city / large-town distance probe (RR p.339/p.340). minType 'Large Town' ⇒ ≥625
// families. Pure. → { found:true, witnessHexId, settlementFamilies, miles } | { found:false }
function nearestSettlementWithin(campaign, fromHexId, opts){
  opts = opts || {};
  const maxMiles = opts.maxMiles || 0;
  const minType  = opts.minType || 'Small Town';
  const maxHexes = Math.floor(maxMiles / 6);
  const from = _hex(campaign, fromHexId);
  if(!from || !from.coord || !(maxHexes > 0) || !Array.isArray(campaign.hexes)) return { found: false };
  let best = null;
  for(const hex of campaign.hexes){
    if(!hex || hex.id === fromHexId || !hex.coord) continue;
    const fam = _familiesAtHex(campaign, hex);
    if(fam <= 0 || !_settlementAtLeast(fam, minType)) continue;
    const dHex = ACKS.hexAxialDistance(from.coord, hex.coord);
    if(dHex > maxHexes) continue;
    const miles = dHex * 6;
    if(!best || miles < best.miles) best = { found: true, witnessHexId: hex.id, settlementFamilies: fam, miles };
  }
  return best || { found: false };
}

// =============================================================================
// Consumers (Domain_Completion_Plan.md §12.3) — the override-aware derived reads.
// =============================================================================

// Is the domain road-connected to a small town within 24mi? GM override (domain.roadToTownOverride,
// null|true|false) wins; null/absent ⇒ derive. Read defensively (`?? derived`) — a domain that
// predates the field (legacy save / template) reads as undefined ⇒ derive, no migration needed.
function effectiveRoadToTown(campaign, domain){
  if(!domain) return false;
  return domain.roadToTownOverride ?? roadConnectedToSmallTown(campaign, domain).found;
}

// The friendly-city distance band, 'within-48mi' | 'within-72mi' | 'none'. The GM overrides
// friendliness via domain.nearFriendlyCity (a DC-2 field — any non-'auto' value wins; absent
// here reads as 'auto' ⇒ derive). Derivation = the nearest Large Town+ within 72mi from any
// controlled hex. Pure.
function effectiveNearFriendlyCity(campaign, domain){
  if(!domain) return 'none';
  const flag = domain.nearFriendlyCity;
  if(flag && flag !== 'auto') return flag;       // GM-asserted band (DC-2 override)
  let nearest = null;
  for(const origin of _domainOriginHexes(campaign, domain)){
    const r = nearestSettlementWithin(campaign, origin.id, { maxMiles: 72, minType: 'Large Town' });
    if(r.found && (!nearest || r.miles < nearest.miles)) nearest = r;
  }
  if(!nearest) return 'none';
  return nearest.miles <= 48 ? 'within-48mi' : 'within-72mi';
}

// Convenience read for the read-only DC-0 panel: both conditions, each with the effective value,
// the raw derived value, an override flag, and a witness (hex + family count + miles) so the panel
// can show "→ Saltcombe · 540 families · 12 mi by road". Pure. The UI resolves witnessHexId → a
// human label (settlement name + col·row) itself, keeping this engine read DOM-free.
function domainSpatialConditions(campaign, domain){
  const rt = roadConnectedToSmallTown(campaign, domain);
  const ov = domain ? domain.roadToTownOverride : undefined;
  const overridden = (ov === true || ov === false);
  let fc = null;
  for(const origin of _domainOriginHexes(campaign, domain)){
    const r = nearestSettlementWithin(campaign, origin.id, { maxMiles: 72, minType: 'Large Town' });
    if(r.found && (!fc || r.miles < fc.miles)) fc = r;
  }
  const fcFlag = domain ? domain.nearFriendlyCity : undefined;
  return {
    roadToTown: {
      effective: effectiveRoadToTown(campaign, domain),
      derived: rt.found,
      overridden,
      overrideValue: overridden ? ov : null,
      witnessHexId: rt.found ? rt.witnessHexId : null,
      settlementFamilies: rt.found ? rt.settlementFamilies : 0,
      miles: rt.found ? rt.miles : null
    },
    friendlyCity: {
      band: effectiveNearFriendlyCity(campaign, domain),
      derivedBand: fc ? (fc.miles <= 48 ? 'within-48mi' : 'within-72mi') : 'none',
      overridden: !!(fcFlag && fcFlag !== 'auto'),
      witnessHexId: fc ? fc.witnessHexId : null,
      settlementFamilies: fc ? fc.settlementFamilies : 0,
      miles: fc ? fc.miles : null
    }
  };
}

Object.assign(ACKS, {
  // Hex adjacency + road connectivity (reuses the §24 road-edge primitives)
  hexNeighbors, hexesRoadConnected, roadReachableHexes,
  // The two RR p.340 spatial conditions
  roadConnectedToSmallTown, nearestSettlementWithin,
  // Override-aware derived consumers + the panel read
  effectiveRoadToTown, effectiveNearFriendlyCity, domainSpatialConditions
});

if(typeof module !== 'undefined' && module.exports){ module.exports = ACKS; }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
