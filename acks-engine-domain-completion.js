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
 * SCOPE: DC-0 (above) is the derived spatial-query layer + a read-only panel. DC-2
 * (added below — classificationAdvanceCheck / processClassificationAdvancement) is the
 * RR p.340 classification-advancement apply that consumes DC-0; the commitTurn hook +
 * the effectiveDomainClassification permanence floor live in acks-engine.js. The
 * morale-effect modifiers (DC-3) are still NOT here.
 *
 * Load order: LAST (after acks-engine-subsystems.js, which owns the §24 road-edge
 * model + hexAtCoord helpers). All OUT references resolve at call-time on the
 * shared global.ACKS object — every function runs long after every module loads.
 *
 * DC-0 authored 2026-06-13 — world-layer team session (CLAUDE §15), agent-3 lane.
 * DC-2 added 2026-06-13 — world-front team session (CLAUDE §15), agent-2 lane.
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

// =============================================================================
// DC-2 — classification advancement (RR p.340). Outlands→Borderlands→Civilized,
// checked "at the end of any month", permanent once gained (Domain_Completion_Plan.md §11).
// Builds ON DC-0's override-aware spatial reads (effectiveRoadToTown / effectiveNearFriendlyCity
// above) + the shipped morale + family counts. The permanence floor lives on
// domain.classificationAdvancedTo and is READ DEFENSIVELY (`d.classificationAdvancedTo` absent ⇒
// undefined ⇒ authored value wins): DC-2 does NOT add it to blankDomain or lazy-inject it in
// migrateCampaign, so the 6 templates + demo stay true migrate-no-ops — the floor is written ONLY
// when advancement fires (processClassificationAdvancement, the commitTurn end-of-month hook).
// DC-2 ships AUTO-ADVANCE (the RAW default); the optional GM-confirm prompt + the optional regress
// (both RR p.340 "optional") defer to a later slice (they need house-rule registrations this team
// lane has no slot for — CLAUDE §15 lane discipline).
// =============================================================================

// Peasant families — RAW-consistent: every growth / limits / advancement threshold is
// peasant-density (Domain_Completion_Plan.md §11.11 — 925 = 5×185, the Outlands per-hex cap;
// urban families don't "populate hexes"). Read defensively.
function domainFamilies(domain){
  return (domain && domain.demographics && domain.demographics.peasantFamilies) || 0;
}

// Controlled 6-mile hexes (the territory-path gate). The optional littoral-hex bonus
// (RR p.340) is a DC-1/G5 concern (its own house rule) — out of DC-2 scope, so the count
// is the plain controlledHexes here. Read defensively.
function controlledHexCount(domain){
  return (domain && domain.geography && domain.geography.controlledHexes) || 0;
}

// Any ESTABLISHED urban settlement in the domain — a settlement of ≥75 families (Class VI+).
// RAW condition 3 reads "an urban settlement has been established" (RR p.340), and a settlement
// is FOUNDED by moving 75–249 families (RR p.351); below 75 it dissolves (RR p.352). So the test
// is a raw ≥75 family count — NOT "≥ small town" (≥500; that is the *road* condition's external
// town, Domain_Completion_Plan.md §11.2/§11.11). NB the SETTLEMENT_BENCHMARKS table labels the
// 0–74 bracket "Hamlet" (market class VI*, no market) — a sub-established settlement — so the
// type-rank compare would wrongly accept it; the ≥75 count is the RAW-correct gate. Reuses DC-0's
// origin-hex walk + per-hex family read (embedded hex.settlement OR campaign.settlements[]).
function domainHasUrbanSettlement(campaign, domain){
  for(const hex of _domainOriginHexes(campaign, domain)){
    if(_familiesAtHex(campaign, hex) >= 75) return true;
  }
  return false;
}

// Post-turn domain morale ≥ +1 (the two pop+road and territory advancement gates require it).
function _moraleOK(domain){
  return ((domain && domain.demographics && domain.demographics.morale) || 0) >= 1;
}

// The more-advanced of two classifications = the LOWER DOMAIN_CLASSIFICATIONS index
// (the array is ['Civilized','Borderlands','Outlands'], most→least). Either may be null/absent.
function mostAdvancedClassification(a, b){
  const L = ACKS.DOMAIN_CLASSIFICATIONS || ['Civilized', 'Borderlands', 'Outlands'];
  const ia = L.indexOf(a), ib = L.indexOf(b);
  if(ia < 0) return b;
  if(ib < 0) return a;
  return ia <= ib ? a : b;
}

// The RR p.340 end-of-month advancement check. PURE; reads only shipped + DC-2 fields (all
// defensively). Returns a SINGLE-STEP advance { from, to, reason } or null. Advancement is
// single-step per month (an Outlands domain meeting Civilized-level numbers advances only to
// Borderlands this month). `current` = effectiveDomainClassification (so it already respects an
// earned floor — re-running after an advance returns null, the idempotence the apply relies on).
function classificationAdvanceCheck(campaign, domain){
  if(!campaign || !domain) return null;
  const current  = ACKS.effectiveDomainClassification(domain);
  const fam      = domainFamilies(domain);
  const hexes    = controlledHexCount(domain);
  const road     = ACKS.effectiveRoadToTown(campaign, domain);
  const city     = ACKS.effectiveNearFriendlyCity(campaign, domain); // 'within-48mi'|'within-72mi'|'none'
  const moraleOK = _moraleOK(domain);
  const urban    = domainHasUrbanSettlement(campaign, domain);

  if(current === 'Outlands'){
    if(fam >= 185 && road && moraleOK)               return { from:'Outlands', to:'Borderlands', reason:'pop+road+morale' };
    if(hexes >= 5 && fam >= 925 && moraleOK)         return { from:'Outlands', to:'Borderlands', reason:'territory+pop+morale' };
    if(urban && (city === 'within-72mi' || city === 'within-48mi'))
                                                     return { from:'Outlands', to:'Borderlands', reason:'urban-settlement' };
    return null;
  }
  if(current === 'Borderlands'){
    if(fam >= 375 && road && moraleOK)               return { from:'Borderlands', to:'Civilized', reason:'pop+road+morale' };
    if(hexes >= 7 && fam >= 1200 && moraleOK)        return { from:'Borderlands', to:'Civilized', reason:'territory+pop+morale' };
    if(urban && city === 'within-48mi')              return { from:'Borderlands', to:'Civilized', reason:'urban-settlement' };
    return null;
  }
  return null; // Civilized is the top tier
}

// A human phrase for the event narrative, keyed by the check's reason.
function _advanceReasonPhrase(reason){
  switch(reason){
    case 'pop+road+morale':      return 'its population, a road to a nearby town, and high morale';
    case 'territory+pop+morale': return 'its expansive settled territory and high morale';
    case 'urban-settlement':     return 'an established urban settlement near a friendly city';
    default:                     return 'meeting the conditions for advancement';
  }
}

// Apply advancement for every domain at month-end (RR p.340 "at the end of any month"). For each
// domain that qualifies: raise the PERMANENT floor (domain.classificationAdvancedTo) + record the
// turn, and emit a record-only `domain-advanced` event (the floor is the state; the event is the
// audit + chronicle line). Returns { advanced:[{domainId,from,to,reason}], logEntries:[...] }.
// Single-step per call (one tier per domain per month). Idempotent within a month — re-running
// finds no new advance because the floor already raised effectiveDomainClassification.
function processClassificationAdvancement(campaign, options){
  options = options || {};
  const out = { advanced: [], logEntries: [] };
  if(!campaign || !Array.isArray(campaign.domains)) return out;
  const turn = campaign.currentTurn || 1;
  for(const d of campaign.domains){
    const res = classificationAdvanceCheck(campaign, d);
    if(!res) continue;
    d.classificationAdvancedTo = mostAdvancedClassification(res.to, d.classificationAdvancedTo || null);
    d.classificationLockedAt = turn;
    const narrative = d.name + ' advanced from ' + res.from + ' to ' + res.to + ' — earned through ' + _advanceReasonPhrase(res.reason) + '.';
    out.advanced.push({ domainId: d.id, from: res.from, to: res.to, reason: res.reason });
    out.logEntries.push(narrative);
    _emitDomainAdvanced(campaign, d, res, narrative, turn);
  }
  return out;
}

// Engine-emitted record-only event (mirrors the banditry _banditryEmitEvent pattern). The floor
// was already written by the caller; this keeps an audit + chronicle line with the Event.context
// envelope (the domain + its capital hex). Wrapped in try/catch so an engine build that lacks the
// `domain-advanced` kind (events module without DC-2) silently skips the audit rather than throwing.
function _emitDomainAdvanced(campaign, domain, res, narrative, turn){
  if(typeof ACKS.newEvent !== 'function') return null;
  let ev;
  try {
    ev = ACKS.newEvent('domain-advanced', {
      submittedBy: 'engine', targetTurn: turn, cadence: 'monthly-turn',
      payload: { domainId: domain.id, from: res.from, to: res.to, reason: res.reason, atTurn: turn, narrative }
    });
  } catch(e){ return null; }
  if(typeof ACKS.setEventContext === 'function'){
    const capital = ((campaign.hexes || []).find(h => h && h.domainId === domain.id)) || null;
    ACKS.setEventContext(ev, {
      primaryHexId: capital ? capital.id : null,
      domainId: domain.id,
      relatedEntities: [{ kind: 'domain', id: domain.id, role: 'subject' }]
    });
  }
  ev.status = (ACKS.EVENT_STATUS && ACKS.EVENT_STATUS.APPLIED) || 'applied';
  ev.appliedAtTurn = turn;
  if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
  campaign.eventLog.push({ event: ev, result: { narrativeSummary: narrative }, appliedAtTurn: turn, appliedAt: new Date().toISOString() });
  return ev;
}

Object.assign(ACKS, {
  // Hex adjacency + road connectivity (reuses the §24 road-edge primitives)
  hexNeighbors, hexesRoadConnected, roadReachableHexes,
  // The two RR p.340 spatial conditions
  roadConnectedToSmallTown, nearestSettlementWithin,
  // Override-aware derived consumers + the panel read
  effectiveRoadToTown, effectiveNearFriendlyCity, domainSpatialConditions,
  // DC-2 — classification advancement (RR p.340)
  domainFamilies, controlledHexCount, domainHasUrbanSettlement,
  mostAdvancedClassification, classificationAdvanceCheck, processClassificationAdvancement
});

if(typeof module !== 'undefined' && module.exports){ module.exports = ACKS; }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
