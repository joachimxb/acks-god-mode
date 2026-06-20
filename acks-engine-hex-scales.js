/* =============================================================================
 * acks-engine-hex-scales.js — ACKS God Mode three interlocked hex scales (HW-4 + HW-5)
 *
 * Phase 2.5 Hex Scales & Weather Plan §2 + §5 + §7 + §10 (HW-4 — the continental
 * 24-mile layer + multi-scale map). RAW = JJ p.467 (the 16:1 nesting figure). The
 * nesting is a LOGICAL CONTAINMENT (a coarse hex aggregates ~16 fine children), NOT
 * a geometric tessellation (§2.2 — a regular hexagon can't be tiled by 16 same-
 * orientation hexagons; "16" is an AREA count, 4:1 linear). So the continental layer
 * is a sparse AGGREGATION tier over the canonical 6-mile (regional) hexes: it owns the
 * climate + weather, and rolls up its children's terrain / population / realm for the
 * continental map view. Everything domain-facing stays 6-mile, unchanged.
 *
 * COORDINATE SYSTEM — shared with the weather region key. The 6-mile→24-mile parent
 * mapping is cube/4 round-to-nearest (≈16 children/parent, 15–17 at borders — the
 * honest §2.2 imperfection). acks-engine-weather.js (HW-3, shipped) already groups its
 * per-region weather roll by exactly this mapping (ACKS.hexParentCoord / regionKeyForCoord).
 * This module CONSUMES those at call-time when present (so a continental cell IS a weather
 * region — §5.3 "the region key becomes a real parentHexId"), with an IDENTICAL local
 * fallback for load-order safety (in the test harness this module sorts BEFORE weather;
 * in index.html it loads after). It deliberately does NOT re-export hexParentCoord /
 * regionKeyForCoord — weather owns those names; the scale-aware helpers here are new names.
 *
 * Load order: AFTER acks-engine.js (findHex / hexAtCoord / hexAxialDistance / blankHex via
 * acks-engine-entities.js). In index.html the script tag sits after acks-engine.js; in the
 * test harness it auto-loads as an "extra" (after the canonical core). Self-contained:
 * references shipped helpers lazily via global.ACKS, never at module-load time.
 *
 * Additive / no migration (§9): hexScale ('regional' default) + parentHexId (null) are on
 * blankHex; an old hex with neither reads as a parentless regional hex (defensive). No field
 * is lazy-injected into migrateCampaign → the 6 templates + demo stay migrate-no-ops. No new
 * house rule, event kind, ID prefix, or entity kind (RAW core; the scale tier is data).
 *
 * HW-5 (the 1.5-mile LOCAL drill-down tier — the JJ p.467 nesting grid INTO a 6-mile hex) lands
 * below (the second labelled section): localDrillView (the render set the map drills into),
 * materializeLocalHex (GM authoring — a local hex bound to its regional parent, domainless so it
 * stays out of the 6-mile economy), and aggregateRegionalCell (the derived roll-up of authored
 * detail). The map scale switch (HW-4 ⬢/⬣) gains the third ⬡ Local tier (index.html). The seam
 * was reserved at HW-4; HW-5 builds the authoring on it. Still additive / no migration.
 * =============================================================================
 */
(function(global){
'use strict';
const ACKS = global.ACKS = global.ACKS || {};

// The three tiers, fine → coarse (§2.1). 4:1 linear / 16:1 area at each step.
const HEX_SCALES = Object.freeze(['local', 'regional', 'continental']);
const HEX_SCALE_MILES = Object.freeze({ local: 1.5, regional: 6, continental: 24 });
// Display metadata for the map scale selector (§7.2). Icons: nested hex glyphs fine→coarse.
const HEX_SCALE_META = Object.freeze({
  local:       { id:'local',       label:'Local',       miles:1.5, icon:'⬡', sub:'1.5 mi' },
  regional:    { id:'regional',    label:'Regional',    miles:6,   icon:'⬢', sub:'6 mi'   },
  continental: { id:'continental', label:'Continental', miles:24,  icon:'⬣', sub:'24 mi'  }
});

function _isScale(s){ return s === 'local' || s === 'regional' || s === 'continental'; }
// Defensive: an unset / legacy hex reads as a parentless regional hex (the canonical tier).
function hexScaleOf(hex){ return (hex && _isScale(hex.hexScale)) ? hex.hexScale : 'regional'; }
function hexScaleLabel(scale){ const m = HEX_SCALE_META[scale]; return m ? (m.label + ' (' + m.sub + ')') : String(scale || ''); }
function hexScaleMiles(scale){ return HEX_SCALE_MILES[scale] != null ? HEX_SCALE_MILES[scale] : 6; }
// One tier coarser / finer (null at the ends — continental has no parent, local no children).
function parentScaleOf(scale){ const i = HEX_SCALES.indexOf(scale); return (i >= 0 && i < HEX_SCALES.length - 1) ? HEX_SCALES[i + 1] : null; }
function childScaleOf(scale){ const i = HEX_SCALES.indexOf(scale); return (i > 0) ? HEX_SCALES[i - 1] : null; }

// ── The cube/4 coarsening — the ONE coordinate-conversion kernel (§2.2 / §5.2 / §5.4). ──
// Identical to acks-engine-weather.js hexParentCoord. Kept local so this module is self-
// contained regardless of load order; a smoke test asserts it agrees with weather's when both
// are loaded (so they can never drift). axial {q,r} → cube → /4 → round-to-nearest-hex.
function _cubeRoundDiv4(coord){
  const q = (coord && coord.q) || 0, r = (coord && coord.r) || 0;
  let x = q / 4, z = r / 4, y = (-q - r) / 4;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if(dx > dy && dx > dz) rx = -ry - rz;
  else if(dy > dz)       ry = -rx - rz;
  else                   rz = -rx - ry;
  return { q: rx, r: rz };
}
// Format a (PARENT/continental) coord as its region-key string. A continental cell's key IS
// its own coord stringified — never re-coarsened. 'R<Q>,<R>'.
function _coordKey(coord){ return coord ? ('R' + (coord.q || 0) + ',' + (coord.r || 0)) : null; }
// The region key for a CHILD (6-mile) coord — coarsen child → parent, then format. PREFERS
// weather's canonical ACKS.regionKeyForCoord at call-time (so a continental cell IS the weather
// region — §5.3), else an identical local fallback. Equals _coordKey(hexScaleParentCoord(coord)).
function _regionKey(coord){
  if(!coord) return null;
  const A = global.ACKS || {};
  if(typeof A.regionKeyForCoord === 'function') return A.regionKeyForCoord(coord);
  return _coordKey(_cubeRoundDiv4(coord));
}

// =============================================================================
// §5.4 — the cross-tier coordinate boundary (the single place scales convert).
// hexScaleParentCoord(coord, fromScale): the parent coordinate one tier COARSER.
//   'local'      → its regional parent (cube/4)
//   'regional'   → its continental parent (cube/4)   [== the weather region's coord]
//   'continental'→ null (top tier, no parent)
// The cube/4 ratio is the same at every step (each tier is 4× linear), so the kernel is shared;
// only the top-tier null differs. Pure.
// =============================================================================
function hexScaleParentCoord(coord, fromScale){
  fromScale = fromScale || 'regional';
  if(fromScale === 'continental') return null;
  if(!coord) return null;
  return _cubeRoundDiv4(coord);
}

// hexScaleChildCoords(coord, fromScale): the IDEALIZED ~16 child coordinates one tier FINER —
// the inverse of the cube/4 rounding (the cells that round UP to `coord`). The JJ p.467 nesting
// grid (used for HW-5 "drill into an unauthored hex shows the addable cells", and the ~16 count).
//   'continental'→ regional children · 'regional' → local children · 'local' → null (finest tier)
// Honestly imperfect (15–17 at borders, §2.2). Pure; scans a generous box around the centre child
// (4× the parent coord) and keeps those whose cube/4 parent === `coord`.
function hexScaleChildCoords(coord, fromScale){
  fromScale = fromScale || 'continental';
  if(fromScale === 'local') return null;            // finest tier — no children
  if(!coord) return [];
  const Q = coord.q || 0, R = coord.r || 0;
  const cq = Q * 4, cr = R * 4;                     // the centre child (4× the parent coord)
  const out = [];
  for(let q = cq - 5; q <= cq + 5; q++){
    for(let r = cr - 5; r <= cr + 5; r++){
      const p = _cubeRoundDiv4({ q, r });
      if(p.q === Q && p.r === R) out.push({ q, r });
    }
  }
  return out;
}
function hexScaleChildCount(coord, fromScale){ const c = hexScaleChildCoords(coord, fromScale); return c ? c.length : 0; }

// ── hex resolution (lazy via shipped helpers; local fallbacks for headless safety) ──
function _allHexes(campaign){
  const out = [], seen = {};
  const push = arr => { if(Array.isArray(arr)) arr.forEach(h => { if(h && h.id && !seen[h.id]){ seen[h.id] = true; out.push(h); } }); };
  if(campaign){ push(campaign.hexes); }   // T6 single-home — campaign.hexes is the complete hex set
  return out;
}
function _findHexById(campaign, hexId){
  if(!campaign || !hexId) return null;
  const A = global.ACKS || {};
  if(typeof A.resolveHexAnywhere === 'function') return A.resolveHexAnywhere(campaign, hexId);
  return _allHexes(campaign).find(h => h.id === hexId) || null;
}
function _continentalHexAtCoord(campaign, coord){
  if(!campaign || !coord) return null;
  return _allHexes(campaign).find(h => h && hexScaleOf(h) === 'continental' && h.coord && h.coord.q === coord.q && h.coord.r === coord.r) || null;
}
function _terrainBase(t){
  const A = global.ACKS || {};
  if(typeof A.terrainBase === 'function') return A.terrainBase(t);
  return String(t || '').split('(')[0].trim().toLowerCase();
}

// =============================================================================
// §5.2 — containment: STORED parentHexId wins, the cube/4-derived parent suggests.
// hexParentOf(campaign, hex): the MATERIALIZED coarser hex that contains `hex`, or null
// (derived-only — a region with no authored continental hex still groups, it just isn't a
// stored entity). Resolution order: a valid stored parentHexId → else the continental hex
// sitting at the derived parent coord → else null.
// =============================================================================
function hexParentOf(campaign, hex){
  if(!campaign || !hex) return null;
  const scale = hexScaleOf(hex);
  if(scale === 'continental') return null;          // top tier
  if(hex.parentHexId){
    const stored = _findHexById(campaign, hex.parentHexId);
    if(stored) return stored;                       // stored wins (the GM override, §5.2)
  }
  const pc = hexScaleParentCoord(hex.coord, scale);
  if(!pc) return null;
  // a local hex's derived parent is a regional hex; a regional hex's is a continental hex.
  const wantScale = parentScaleOf(scale);
  return _allHexes(campaign).find(h => h && hexScaleOf(h) === wantScale && h.coord && h.coord.q === pc.q && h.coord.r === pc.r) || null;
}
// Does `hex` belong to the parent at coord `pCoord` (scale `parentScale`)? Stored-wins, else derived.
function _belongsToParentCoord(campaign, hex, pCoord, parentScale){
  const scale = hexScaleOf(hex);
  if(parentScaleOf(scale) !== parentScale) return false;   // wrong tier
  if(hex.parentHexId){
    const stored = _findHexById(campaign, hex.parentHexId);
    if(stored) return stored.coord && stored.coord.q === pCoord.q && stored.coord.r === pCoord.r;
    // a dangling parentHexId falls through to the derived check (self-healing read)
  }
  const pc = hexScaleParentCoord(hex.coord, scale);
  return !!pc && pc.q === pCoord.q && pc.r === pCoord.r;
}

// hexChildHexes(campaign, coarseHex): the COMPUTED reverse index (Architecture §3.3 — never
// stored). The finer hexes whose resolved parent is `coarseHex` (by stored parentHexId, else by
// the cube/4-derived parent coord). Returns []. Used for the drill viewport + the aggregation.
function hexChildHexes(campaign, coarseHex){
  if(!campaign || !coarseHex || !coarseHex.coord) return [];
  const parentScale = hexScaleOf(coarseHex);
  const childScale = childScaleOf(parentScale);
  if(!childScale) return [];                        // local has no children
  return _allHexes(campaign).filter(h => h && h.id !== coarseHex.id && hexScaleOf(h) === childScale && _belongsToParentCoord(campaign, h, coarseHex.coord, parentScale));
}
function hexChildHexIds(campaign, coarseHex){ return hexChildHexes(campaign, coarseHex).map(h => h.id); }

// ── aggregation helpers ──
function _mostCommon(values){
  const counts = {}; let best = null, bestN = 0;
  for(const v of values){ if(v == null || v === '') continue; counts[v] = (counts[v] || 0) + 1; if(counts[v] > bestN){ bestN = counts[v]; best = v; } }
  return { value: best, counts };
}

// =============================================================================
// §7.2 — the continental cell aggregate (the roll-up the continental map renders). One per
// 24-mile region. The cell's own land value / families are AGGREGATES of its 6-mile children,
// not stored. koppen comes from the materialized continental hex if present (§5.2 — climate
// lives on the parent; resolves Terrain OQ2), else the most-common child koppen (regional
// inherits). Pure.
// =============================================================================
function aggregateContinentalCell(campaign, members, contHex){
  members = (members || []).filter(h => h && h.coord);
  const coord = contHex && contHex.coord ? { q: contHex.coord.q, r: contHex.coord.r }
              : (members.length ? hexScaleParentCoord(members[0].coord, 'regional') : { q:0, r:0 });
  const terr = _mostCommon(members.map(h => _terrainBase(h.terrain)).filter(Boolean));
  const klass = _mostCommon(members.map(h => String(h.classification || '').trim()).filter(Boolean));
  const childKoppen = _mostCommon(members.map(h => String(h.koppen || '').trim()).filter(Boolean));
  const parentKoppen = (contHex && String(contHex.koppen || '').trim()) || '';
  const families = members.reduce((s, h) => s + (Number(h.families) || 0), 0);
  const domainIds = Array.from(new Set(members.map(h => h.domainId).filter(Boolean)));
  const settlementCount = members.filter(h => h && global.ACKS.settlementForHex && global.ACKS.settlementForHex(campaign, h.id)).length;   // T6 single-home
  const A = global.ACKS || {};
  const koppen = parentKoppen || childKoppen.value || '';
  // biome derives from the resolved koppen (shipped biomeFromKoppen), for the Biome fill layer.
  const biome = (koppen && typeof A.biomeFromKoppen === 'function') ? A.biomeFromKoppen(koppen) : '';
  return {
    key: _coordKey(coord),                           // the cell's OWN (parent) coord — never re-coarsened
    coord: coord,
    contHexId: (contHex && contHex.id) || null,     // null = derived-only (no authored continental hex)
    childHexIds: members.map(h => h.id),
    childCount: members.length,
    dominantTerrain: terr.value || '',
    terrainCounts: terr.counts,
    classification: klass.value || '',
    families: families,
    koppen: koppen,
    koppenSource: parentKoppen ? 'parent' : (childKoppen.value ? 'children' : 'none'),
    biome: biome,
    domainIds: domainIds,
    settlementCount: settlementCount
  };
}

// continentalCellsForCampaign(campaign): the continental render set — one aggregate per 24-mile
// region holding ≥1 regional hex, PLUS any authored childless continental hex (so a GM who
// materialized a continental hex to set its climate still sees it). Sparse: a campaign with no
// hexes yields []; a sparse campaign is unchanged (regional hexes just group by their derived
// parent — no materialization needed). Pure.
function continentalCellsForCampaign(campaign){
  if(!campaign) return [];
  const all = _allHexes(campaign);
  const regional = all.filter(h => h && h.coord && hexScaleOf(h) === 'regional');
  const contHexes = all.filter(h => h && h.coord && hexScaleOf(h) === 'continental');
  const byKey = {};                                  // regionKey → { members:[], contHex }
  regional.forEach(h => {
    const k = _regionKey(h.coord);
    if(!k) return;
    (byKey[k] || (byKey[k] = { members: [], contHex: null })).members.push(h);
  });
  contHexes.forEach(ch => {
    const k = _coordKey(ch.coord);                   // a continental hex's coord IS the region's parent coord — don't re-coarsen
    if(!k) return;
    (byKey[k] || (byKey[k] = { members: [], contHex: null })).contHex = ch;
  });
  return Object.keys(byKey).map(k => aggregateContinentalCell(campaign, byKey[k].members, byKey[k].contHex));
}

// =============================================================================
// §5.2 / §7.2 — materialize a continental (24-mile) hex (the GM-authoring path: HW-4). Idempotent
// — returns the existing continental hex at the region's parent coord if one is there, else creates
// a hexScale:'continental' hex (via the shipped blankHex). regionKeyOrCoord is a region key
// ('R<Q>,<R>') OR a child {q,r} (its parent is derived). The cell otherwise stays purely derived;
// materializing lets the GM set the region's koppen / weather and override membership. Mutates
// campaign.hexes. NB: does NOT auto-rewrite children's parentHexId (children resolve by derived
// coord; a GM sets parentHexId explicitly only to OVERRIDE the derived membership, §5.2).
// =============================================================================
function _coordFromRegionKey(k){
  const m = /^R(-?\d+),(-?\d+)$/.exec(String(k || ''));
  return m ? { q: parseInt(m[1], 10), r: parseInt(m[2], 10) } : null;
}
function materializeContinentalHex(campaign, regionKeyOrCoord, opts){
  if(!campaign) return null;
  opts = opts || {};
  let coord = null;
  if(typeof regionKeyOrCoord === 'string') coord = _coordFromRegionKey(regionKeyOrCoord);
  else if(regionKeyOrCoord && typeof regionKeyOrCoord.q === 'number'){
    // a {q,r}: if it looks like a child coord, derive its parent; if already a parent coord, use it.
    coord = (opts.isParentCoord) ? { q: regionKeyOrCoord.q, r: regionKeyOrCoord.r } : hexScaleParentCoord(regionKeyOrCoord, 'regional');
  }
  if(!coord) return null;
  const existing = _continentalHexAtCoord(campaign, coord);
  if(existing) return existing;
  const A = global.ACKS || {};
  if(typeof A.blankHex !== 'function') return null;
  if(!Array.isArray(campaign.hexes)) campaign.hexes = [];
  const hex = A.blankHex(Object.assign({
    coord: { q: coord.q, r: coord.r }, hexScale: 'continental', explored: true
  }, opts.hexOpts || {}));
  hex.domainId = (opts.domainId !== undefined ? opts.domainId : null);  // continental tier is realm-scale; default unclaimed
  campaign.hexes.push(hex);
  return hex;
}
// =============================================================================
// HW-5 — the local (1.5-mile) drill-down tier: derivation + AUTHORING.
//
// The continental layer (HW-4 above) is a sparse AGGREGATION tier ABOVE the canonical 6-mile
// hexes (rolling ~16 regional children up). The local layer is its mirror BELOW: a sparse
// DRILL-DOWN tier, authored only where a GM wants in-hex detail (terrain-transformation
// proportions, settlement surroundings, fine line-of-sight — §2.3). A local hex's parent is a
// REGIONAL hex; the nesting is the same logical containment (~16:1 area, §2.2), so the cube/4
// kernel + stored-parentHexId-wins containment already shipped (HW-4) carry the local tier
// unchanged — this section adds the local-scoped render set (localDrillView) + the GM authoring
// path (materializeLocalHex) + the derived roll-up of authored detail (aggregateRegionalCell).
//
// CRITICAL — local hexes default domainId:null (the materializeContinentalHex pattern), so they
// are pure drill-down DETAIL, INVISIBLE to the 6-mile domain economy (which filters by domainId)
// and to the regional map view (mapHexEntries filters hexScale==='regional'). The 6-mile parent
// already counts the full hex's families/value; a local child must never double-count. Containment
// is the EXPLICIT parentHexId (a local hex is authored INSIDE one regional parent's drill view).
// Additive / no migration (hexScale/parentHexId ship on blankHex via HW-4). No new house rule,
// event kind, ID prefix, or entity kind (the local tier is data, like the continental tier).
// =============================================================================

// localChildCoords(regionalHex): the idealized ~16 local (1.5-mile) child coords under a regional
// hex — the JJ p.467 nesting grid the drill view shows (incl. the still-empty addable cells). []
// for a non-regional hex / no coord. Thin scale-guarded wrapper over hexScaleChildCoords.
function localChildCoords(regionalHex){
  if(!regionalHex || !regionalHex.coord || hexScaleOf(regionalHex) !== 'regional') return [];
  return hexScaleChildCoords(regionalHex.coord, 'regional') || [];
}

// localChildHexes(campaign, regionalHex): the AUTHORED local hexes under a regional parent (the
// computed reverse index, scale-guarded). [] for a non-regional hex. hexChildHexes is the generic
// primitive (HW-4); this names the intent + guards the tier for the UI.
function localChildHexes(campaign, regionalHex){
  if(!campaign || !regionalHex || hexScaleOf(regionalHex) !== 'regional') return [];
  return hexChildHexes(campaign, regionalHex);
}

// _localHexAtCoord(campaign, coord): the authored local hex at a local-tier coord, or null. A local
// coord rounds to exactly ONE regional parent (cube/4 is a function), so a coord match is unique
// across parents — used for idempotent authoring + addable-cell detection.
function _localHexAtCoord(campaign, coord){
  if(!campaign || !coord) return null;
  return _allHexes(campaign).find(h => h && hexScaleOf(h) === 'local' && h.coord && h.coord.q === coord.q && h.coord.r === coord.r) || null;
}

// =============================================================================
// aggregateRegionalCell(campaign, members, regionalHex): the roll-up SUMMARY of a regional hex's
// authored local children (the mirror of aggregateContinentalCell at the regional←local tier). NB
// this is a DERIVED summary of authored DETAIL — NOT a canonical roll-up that feeds the economy
// (the 6-mile parent owns the canonical families/value; local hexes are domainless detail). koppen
// falls back to the parent's when no child sets one. Pure.
// =============================================================================
function aggregateRegionalCell(campaign, members, regionalHex){
  members = (members || []).filter(h => h && h.coord);
  const coord = (regionalHex && regionalHex.coord) ? { q: regionalHex.coord.q, r: regionalHex.coord.r } : { q:0, r:0 };
  const terr = _mostCommon(members.map(h => _terrainBase(h.terrain)).filter(Boolean));
  const klass = _mostCommon(members.map(h => String(h.classification || '').trim()).filter(Boolean));
  const childKoppen = _mostCommon(members.map(h => String(h.koppen || '').trim()).filter(Boolean));
  const parentKoppen = (regionalHex && String(regionalHex.koppen || '').trim()) || '';
  const families = members.reduce((s, h) => s + (Number(h.families) || 0), 0);
  const domainIds = Array.from(new Set(members.map(h => h.domainId).filter(Boolean)));
  const settlementCount = members.filter(h => h && global.ACKS.settlementForHex && global.ACKS.settlementForHex(campaign, h.id)).length;   // T6 single-home
  const A = global.ACKS || {};
  const koppen = childKoppen.value || parentKoppen || '';
  const biome = (koppen && typeof A.biomeFromKoppen === 'function') ? A.biomeFromKoppen(koppen) : '';
  return {
    key: _coordKey(coord),
    coord: coord,
    parentHexId: (regionalHex && regionalHex.id) || null,
    childHexIds: members.map(h => h.id),
    childCount: members.length,
    idealizedCount: regionalHex ? hexScaleChildCount(coord, 'regional') : 0,
    dominantTerrain: terr.value || '',
    terrainCounts: terr.counts,
    classification: klass.value || '',
    families: families,
    koppen: koppen,
    koppenSource: childKoppen.value ? 'children' : (parentKoppen ? 'parent' : 'none'),
    biome: biome,
    domainIds: domainIds,
    settlementCount: settlementCount
  };
}

// =============================================================================
// §7.2 — the local drill view: what the map renders when you drill a 6-mile hex → local. The
// idealized nesting grid (~16 cells), the authored local hexes, the still-empty (addable) cells,
// and a derived aggregate of the authored detail. Pure; null for a non-regional parent (you can
// only drill INTO a 6-mile hex — local is the finest tier, continental is rendered by its own cells).
// =============================================================================
function localDrillView(campaign, regionalHex){
  if(!campaign || !regionalHex || !regionalHex.coord || hexScaleOf(regionalHex) !== 'regional') return null;
  const idealized = localChildCoords(regionalHex);
  const authored = localChildHexes(campaign, regionalHex);
  const authoredByCoordKey = {};
  authored.forEach(h => { if(h && h.coord) authoredByCoordKey[h.coord.q + ',' + h.coord.r] = h; });
  const addable = idealized.filter(c => !authoredByCoordKey[c.q + ',' + c.r] && !_localHexAtCoord(campaign, c));
  return {
    parent: regionalHex,
    parentHexId: regionalHex.id,
    parentCoord: { q: regionalHex.coord.q, r: regionalHex.coord.r },
    idealizedCoords: idealized,
    idealizedCount: idealized.length,
    authored: authored,
    authoredByCoordKey: authoredByCoordKey,
    authoredCount: authored.length,
    addableCoords: addable,
    aggregate: aggregateRegionalCell(campaign, authored, regionalHex)
  };
}

// =============================================================================
// §5.2 / §7.2 — materialize a local (1.5-mile) hex under a regional parent (the GM-authoring path,
// HW-5). Idempotent — returns the existing local hex at `localCoord` if one is there, else creates a
// hexScale:'local' hex bound to the parent (parentHexId = regionalParent.id — explicit, since a local
// hex is authored INSIDE one parent's drill view). domainId defaults null (drill-down detail, OUT of
// the 6-mile economy — the materializeContinentalHex pattern; opts.domainId overrides). Mutates
// campaign.hexes. Returns null if `regionalParent` isn't a regional hex / no local coord. NB: any
// hex authored via blankHex hexOpts is reconciled so the binding + scale always hold.
// =============================================================================
function materializeLocalHex(campaign, regionalParent, localCoord, opts){
  if(!campaign || !regionalParent || hexScaleOf(regionalParent) !== 'regional') return null;
  if(!localCoord || typeof localCoord.q !== 'number' || typeof localCoord.r !== 'number') return null;
  opts = opts || {};
  const existing = _localHexAtCoord(campaign, localCoord);
  if(existing) return existing;
  const A = global.ACKS || {};
  if(typeof A.blankHex !== 'function') return null;
  if(!Array.isArray(campaign.hexes)) campaign.hexes = [];
  const hex = A.blankHex(Object.assign({
    coord: { q: localCoord.q, r: localCoord.r }, hexScale: 'local', parentHexId: regionalParent.id, explored: true
  }, opts.hexOpts || {}));
  hex.hexScale = 'local';                                       // reconcile (a stray hexOpts can't break the tier)
  hex.parentHexId = regionalParent.id;                          // explicit containment (§5.2 stored-wins)
  hex.domainId = (opts.domainId !== undefined ? opts.domainId : null);  // drill-down detail — out of the economy
  campaign.hexes.push(hex);
  return hex;
}

Object.assign(ACKS, {
  HEX_SCALES, HEX_SCALE_MILES, HEX_SCALE_META,
  hexScaleOf, hexScaleLabel, hexScaleMiles, parentScaleOf, childScaleOf,
  hexScaleParentCoord, hexScaleChildCoords, hexScaleChildCount,
  hexParentOf, hexChildHexes, hexChildHexIds,
  aggregateContinentalCell, continentalCellsForCampaign, materializeContinentalHex,
  // HW-5 — the local (1.5-mile) drill-down tier
  localChildCoords, localChildHexes, localDrillView, aggregateRegionalCell, materializeLocalHex
});

if(typeof module !== 'undefined' && module.exports) module.exports = ACKS;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
