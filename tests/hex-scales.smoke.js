/* tests/hex-scales.smoke.js — Phase 2.5 Hex Scales & Weather (Phase_2.5_Hex_Scales_and_Weather_Plan.md), HW-4.
 *
 *   node tests/hex-scales.smoke.js   (or via `npm test`)
 *
 * HW-4 = the continental (24-mile) layer + the three interlocked map scales:
 *   - 2 additive hex fields (hexScale / parentHexId) on blankHex; childHexIds is COMPUTED (never stored).
 *   - the cube/4 parent mapping (hexScaleParentCoord) — MUST agree with the shipped weather region key
 *     (ACKS.hexParentCoord), so a continental cell IS a weather region (§5.3).
 *   - the inverse (hexScaleChildCoords) — the idealized ~16 children (15–17 at borders, §2.2).
 *   - containment (hexParentOf — stored parentHexId wins, else derived) + the computed reverse index
 *     (hexChildHexes), Architecture §3.3.
 *   - the aggregation (aggregateContinentalCell / continentalCellsForCampaign) — dominant terrain,
 *     summed families, koppen owned-by-parent / inherited-from-children (resolves Terrain OQ2).
 *   - materializeContinentalHex — idempotent GM-authoring of a continental hex (merges into its region).
 *   - defensive: a legacy hex (no hexScale) reads as a parentless regional hex; sparse campaigns unchanged.
 * The scale-switcher + continental render are the UI (browser-verified, index.html).
 *
 * HW-5 = the local (1.5-mile) drill-down tier (the mirror of HW-4 BELOW the canonical 6-mile hex):
 *   - localChildCoords (the idealized ~16 nesting grid under a regional hex) + localChildHexes
 *     (the authored children, scale-guarded reverse index).
 *   - materializeLocalHex — idempotent GM-authoring of a local hex BOUND to its regional parent
 *     (parentHexId explicit) + domainId:null so it stays OUT of the 6-mile economy + the regional view.
 *   - localDrillView — the map drill render set (idealized grid + authored + addable + aggregate).
 *   - aggregateRegionalCell — the derived roll-up of authored local detail (dominant terrain / families).
 *   - local hexes never pollute the regional tier or continental aggregation (hexScale-filtered).
 * The local scale switch + drill/author overlay are the UI (browser-verified, index.html).
 */
'use strict';
require('./_engine.js').load();
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail) { if (cond) { pass++; } else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t) { console.log('\n— ' + t); }
function eqCoord(a, b) { return !!a && !!b && a.q === b.q && a.r === b.r; }

// Build a small synthetic campaign of regional hexes (+ optional opts per hex). All coords are
// GUARANTEED into a region by drawing them from hexScaleChildCoords(parent).
function mkCampaign(){ return { schemaVersion: 2, currentTurn: 1, hexes: [], domains: [], settlements: [] }; }
// blankHex doesn't take opts.domainId (real code sets hex.domainId AFTER construction —
// generateBlankHexGrid / liftToTopLevelCollections); mirror that so the aggregation sees it.
function addHex(camp, coord, opts){ opts = opts || {}; const h = ACKS.blankHex(Object.assign({ coord: { q: coord.q, r: coord.r } }, opts)); if (opts.domainId !== undefined) h.domainId = opts.domainId; camp.hexes.push(h); return h; }

// =============================================================================
section('module surface + scale metadata (§2.1)');
{
  ok('HEX_SCALES = local/regional/continental', Array.isArray(ACKS.HEX_SCALES) && ACKS.HEX_SCALES.join(',') === 'local,regional,continental');
  ok('HEX_SCALE_MILES 1.5/6/24', ACKS.HEX_SCALE_MILES.local === 1.5 && ACKS.HEX_SCALE_MILES.regional === 6 && ACKS.HEX_SCALE_MILES.continental === 24);
  ok('hexScaleMiles(continental) = 24', ACKS.hexScaleMiles('continental') === 24);
  ok('HEX_SCALE_META has label+icon+sub for each', ['local','regional','continental'].every(s => ACKS.HEX_SCALE_META[s] && ACKS.HEX_SCALE_META[s].label && ACKS.HEX_SCALE_META[s].icon && ACKS.HEX_SCALE_META[s].sub));
  ok('hexScaleLabel(continental)', ACKS.hexScaleLabel('continental') === 'Continental (24 mi)');
  ok('parentScaleOf: local→regional, regional→continental, continental→null', ACKS.parentScaleOf('local') === 'regional' && ACKS.parentScaleOf('regional') === 'continental' && ACKS.parentScaleOf('continental') === null);
  ok('childScaleOf: continental→regional, regional→local, local→null', ACKS.childScaleOf('continental') === 'regional' && ACKS.childScaleOf('regional') === 'local' && ACKS.childScaleOf('local') === null);
}

section('hexScaleOf — defensive (an unset / legacy hex is regional)');
{
  ok('null → regional', ACKS.hexScaleOf(null) === 'regional');
  ok('hex with no hexScale → regional', ACKS.hexScaleOf({ coord: { q: 0, r: 0 } }) === 'regional');
  ok('explicit continental → continental', ACKS.hexScaleOf({ hexScale: 'continental' }) === 'continental');
  ok('explicit local → local', ACKS.hexScaleOf({ hexScale: 'local' }) === 'local');
  ok('garbage hexScale → regional', ACKS.hexScaleOf({ hexScale: 'galactic' }) === 'regional');
}

section('blankHex — the 2 additive scale fields (additive; no migration)');
{
  const h = ACKS.blankHex();
  ok('hexScale defaults "regional"', h.hexScale === 'regional');
  ok('parentHexId defaults null', h.parentHexId === null);
  ok('opts.hexScale=continental passes through', ACKS.blankHex({ hexScale: 'continental' }).hexScale === 'continental');
  ok('opts.hexScale=local passes through', ACKS.blankHex({ hexScale: 'local' }).hexScale === 'local');
  ok('invalid opts.hexScale → regional', ACKS.blankHex({ hexScale: 'xyz' }).hexScale === 'regional');
  ok('opts.parentHexId passes through', ACKS.blankHex({ parentHexId: 'hex-abc' }).parentHexId === 'hex-abc');
  ok('empty parentHexId → null', ACKS.blankHex({ parentHexId: '' }).parentHexId === null);
}

section('hexScaleParentCoord — cube/4, AGREES with the shipped weather region key (§5.3 — the load-bearing invariant)');
{
  // A battery of child coords (incl. negatives + borders): the scale parent MUST equal weather's hexParentCoord.
  const samples = [[0,0],[1,0],[0,1],[1,1],[3,2],[4,0],[8,4],[7,3],[-2,5],[15,-9],[-7,-3],[16,16],[2,-6],[9,9]];
  let agree = true, off = null;
  for (const [q, r] of samples) {
    const a = ACKS.hexScaleParentCoord({ q, r }, 'regional');
    const b = (typeof ACKS.hexParentCoord === 'function') ? ACKS.hexParentCoord({ q, r }) : a;
    if (!eqCoord(a, b)) { agree = false; off = [q, r, a, b]; }
  }
  ok('scale parent === weather hexParentCoord for all samples', agree, off ? JSON.stringify(off) : '');
  ok('weather module loaded (hexParentCoord present)', typeof ACKS.hexParentCoord === 'function');
  // the region-KEY string also matches weather's regionKeyForCoord (so cells === weather regions)
  if (typeof ACKS.regionKeyForCoord === 'function') {
    const p = ACKS.hexScaleParentCoord({ q: 8, r: 4 }, 'regional');
    ok('region key === R<parentQ>,<parentR>', ACKS.regionKeyForCoord({ q: 8, r: 4 }) === 'R' + p.q + ',' + p.r);
  } else { ok('region key check (weather absent — skipped)', true); }
  ok('continental → null parent (top tier)', ACKS.hexScaleParentCoord({ q: 2, r: 1 }, 'continental') === null);
  ok('local → cube/4 (same kernel as regional)', eqCoord(ACKS.hexScaleParentCoord({ q: 8, r: 4 }, 'local'), ACKS.hexScaleParentCoord({ q: 8, r: 4 }, 'regional')));
  ok('default fromScale is regional', eqCoord(ACKS.hexScaleParentCoord({ q: 5, r: 5 }), ACKS.hexScaleParentCoord({ q: 5, r: 5 }, 'regional')));
}

section('hexScaleChildCoords — the idealized ~16 children (15–17 at borders, §2.2)');
{
  const parents = [[0,0],[1,0],[2,1],[-1,2],[3,3],[-2,-2]];
  let allRoundBack = true, allInBand = true, worst = null;
  for (const [Q, R] of parents) {
    const kids = ACKS.hexScaleChildCoords({ q: Q, r: R }, 'continental');
    // every returned child must round back UP to (Q,R)
    if (!kids.every(c => eqCoord(ACKS.hexScaleParentCoord(c, 'regional'), { q: Q, r: R }))) allRoundBack = false;
    // count ~16 (band 13..19 tolerates the honest border imperfection)
    if (kids.length < 13 || kids.length > 19) { allInBand = false; worst = [Q, R, kids.length]; }
  }
  ok('every child rounds back to its parent (correctness)', allRoundBack);
  ok('child count ∈ [13,19] (~16, §2.2)', allInBand, worst ? JSON.stringify(worst) : '');
  ok('typical parent (0,0) has exactly 16 children', ACKS.hexScaleChildCoords({ q: 0, r: 0 }, 'continental').length === 16);
  // completeness: scanning a wide box finds NO other coord mapping to the parent that isn't returned
  {
    const Q = 1, R = 0, set = new Set(ACKS.hexScaleChildCoords({ q: Q, r: R }, 'continental').map(c => c.q + ',' + c.r));
    let complete = true;
    for (let q = Q * 4 - 8; q <= Q * 4 + 8; q++) for (let r = R * 4 - 8; r <= R * 4 + 8; r++) {
      const p = ACKS.hexScaleParentCoord({ q, r }, 'regional');
      if (p.q === Q && p.r === R && !set.has(q + ',' + r)) complete = false;
    }
    ok('child set is COMPLETE (no missed cells in a wide scan)', complete);
  }
  ok('regional→local children also ~16', (() => { const c = ACKS.hexScaleChildCoords({ q: 2, r: 2 }, 'regional'); return c.length >= 13 && c.length <= 19; })());
  ok('local has no children → null', ACKS.hexScaleChildCoords({ q: 0, r: 0 }, 'local') === null);
  ok('hexScaleChildCount mirrors the array length', ACKS.hexScaleChildCount({ q: 0, r: 0 }, 'continental') === 16);
}

section('aggregateContinentalCell — the roll-up (terrain / families / koppen inheritance, §7.2)');
{
  const camp = mkCampaign();
  // 4 regional hexes guaranteed into region (0,0): 3 hills + 1 forest, families 10/20/30/40, 2 with koppen.
  const kids = ACKS.hexScaleChildCoords({ q: 0, r: 0 }, 'continental');
  const a = addHex(camp, kids[0], { terrain: 'hills', families: 10, classification: 'Borderlands', koppen: 'Cfb', domainId: 'dom-1', settlement: { name: 'A' } });
  const b = addHex(camp, kids[1], { terrain: 'hills', families: 20, classification: 'Borderlands', koppen: 'Cfb', domainId: 'dom-1' });
  const c = addHex(camp, kids[2], { terrain: 'hills', families: 30, classification: 'Civilized', domainId: 'dom-2' });
  const d = addHex(camp, kids[3], { terrain: 'forest', families: 40 });
  const cell = ACKS.aggregateContinentalCell(camp, [a, b, c, d], null);
  ok('coord = the cube/4 parent of a child', eqCoord(cell.coord, { q: 0, r: 0 }));
  ok('key = R0,0', cell.key === 'R0,0');
  ok('childCount 4', cell.childCount === 4);
  ok('childHexIds lists the 4', cell.childHexIds.length === 4 && cell.childHexIds.indexOf(a.id) >= 0);
  ok('dominantTerrain = hills (3 of 4)', cell.dominantTerrain === 'hills');
  ok('families summed = 100', cell.families === 100);
  ok('classification = Borderlands (most common)', cell.classification === 'Borderlands');
  ok('koppen inherited from children (Cfb) when no parent', cell.koppen === 'Cfb' && cell.koppenSource === 'children');
  ok('biome derived from the inherited koppen', cell.biome === (ACKS.biomeFromKoppen ? ACKS.biomeFromKoppen('Cfb') : cell.biome));
  ok('domainIds distinct = [dom-1, dom-2]', cell.domainIds.length === 2 && cell.domainIds.indexOf('dom-1') >= 0 && cell.domainIds.indexOf('dom-2') >= 0);
  ok('settlementCount = 1', cell.settlementCount === 1);

  // koppen OWNED by a materialized parent wins over the children's (resolves Terrain OQ2).
  const contHex = ACKS.blankHex({ coord: { q: 0, r: 0 }, hexScale: 'continental', koppen: 'BWh' });
  const cell2 = ACKS.aggregateContinentalCell(camp, [a, b, c, d], contHex);
  ok('parent koppen (BWh) overrides children (Cfb)', cell2.koppen === 'BWh' && cell2.koppenSource === 'parent');
  ok('cell2 carries contHexId', cell2.contHexId === contHex.id);
}

section('continentalCellsForCampaign — one cell per region; sparse/empty unchanged');
{
  ok('empty campaign → []', ACKS.continentalCellsForCampaign({ hexes: [] }).length === 0);
  ok('null campaign → []', ACKS.continentalCellsForCampaign(null).length === 0);
  // two distinct regions
  const camp = mkCampaign();
  ACKS.hexScaleChildCoords({ q: 0, r: 0 }, 'continental').slice(0, 4).forEach(co => addHex(camp, co, { terrain: 'grassland', families: 5 }));
  ACKS.hexScaleChildCoords({ q: 2, r: 1 }, 'continental').slice(0, 3).forEach(co => addHex(camp, co, { terrain: 'desert', families: 7 }));
  const cells = ACKS.continentalCellsForCampaign(camp);
  ok('two regions → two cells', cells.length === 2);
  ok('cell keys are unique', new Set(cells.map(c => c.key)).size === cells.length);
  ok('each key === R<coord>', cells.every(c => c.key === 'R' + c.coord.q + ',' + c.coord.r));
  ok('region (0,0) cell has 4 children, grassland', (() => { const c = cells.find(x => eqCoord(x.coord, { q: 0, r: 0 })); return c && c.childCount === 4 && c.dominantTerrain === 'grassland'; })());
  ok('region (2,1) cell has 3 children, desert', (() => { const c = cells.find(x => eqCoord(x.coord, { q: 2, r: 1 })); return c && c.childCount === 3 && c.dominantTerrain === 'desert'; })());
  // a single lone hex still forms one cell (sparse campaigns unchanged — no materialization needed)
  const lone = mkCampaign(); addHex(lone, { q: 0, r: 0 }, { terrain: 'swamp' });
  ok('a single regional hex → one cell (sparse OK)', ACKS.continentalCellsForCampaign(lone).length === 1);
}

section('hexParentOf / hexChildHexes — containment (stored wins; reverse index computed, §3.3 / §5.2)');
{
  const camp = mkCampaign();
  const kids = ACKS.hexScaleChildCoords({ q: 0, r: 0 }, 'continental');
  const child = addHex(camp, kids[0], { terrain: 'hills' });
  // no continental hex yet → derived-only → hexParentOf null (a region with no authored parent)
  ok('hexParentOf null when no continental hex materialized', ACKS.hexParentOf(camp, child) === null);
  // materialize the parent → hexParentOf resolves it (derived membership)
  const parent = ACKS.materializeContinentalHex(camp, 'R0,0');
  ok('hexParentOf resolves the derived continental parent', ACKS.hexParentOf(camp, child) === parent);
  ok('hexChildHexes (reverse index) includes the child', ACKS.hexChildHexes(camp, parent).some(h => h.id === child.id));
  ok('hexChildHexIds lists the id', ACKS.hexChildHexIds(camp, parent).indexOf(child.id) >= 0);
  ok('continental hex has no parent', ACKS.hexParentOf(camp, parent) === null);

  // STORED parentHexId WINS (the §5.2 GM override): a hex in region (0,0) reassigned to a different
  // continental hex resolves to the stored one, and that continental hex's reverse index includes it.
  const otherParent = ACKS.materializeContinentalHex(camp, 'R5,5');
  const reassigned = addHex(camp, kids[1], { terrain: 'forest' });   // its DERIVED parent is R0,0
  reassigned.parentHexId = otherParent.id;                            // GM override → R5,5
  ok('stored parentHexId wins over derived', ACKS.hexParentOf(camp, reassigned) === otherParent);
  ok('overridden hex appears under its STORED parent, not its derived one', ACKS.hexChildHexes(camp, otherParent).some(h => h.id === reassigned.id));
  ok('overridden hex DROPS OUT of its derived parent', !ACKS.hexChildHexes(camp, parent).some(h => h.id === reassigned.id));
  // a dangling parentHexId self-heals to the derived check (read-time robustness)
  const dangly = addHex(camp, kids[2], { terrain: 'hills', parentHexId: 'hex-does-not-exist' });
  ok('dangling parentHexId falls back to derived parent', ACKS.hexParentOf(camp, dangly) === parent);
}

section('materializeContinentalHex — idempotent GM-authoring; merges into its region');
{
  const camp = mkCampaign();
  ACKS.hexScaleChildCoords({ q: 1, r: 0 }, 'continental').slice(0, 6).forEach(co => addHex(camp, co, { terrain: 'forest', families: 3 }));
  const before = ACKS.continentalCellsForCampaign(camp).length;
  const ch = ACKS.materializeContinentalHex(camp, 'R1,0');
  ok('creates a hexScale:continental hex', ch && ch.hexScale === 'continental');
  ok('at the region coord (1,0)', eqCoord(ch.coord, { q: 1, r: 0 }));
  ok('idempotent — second call returns the same hex', ACKS.materializeContinentalHex(camp, 'R1,0') === ch);
  ok('only one continental hex created', camp.hexes.filter(h => ACKS.hexScaleOf(h) === 'continental').length === 1);
  const after = ACKS.continentalCellsForCampaign(camp);
  ok('cell count unchanged (contHex merges into its region, not a new cell)', after.length === before);
  const merged = after.find(c => c.key === 'R1,0');
  ok('merged cell carries contHexId', merged && merged.contHexId === ch.id);
  ok('merged cell childCount unchanged (6)', merged && merged.childCount === 6);
  // materialize from a CHILD {q,r} derives the parent
  const fromChild = ACKS.materializeContinentalHex(mkCampaign(), { q: 8, r: 4 });
  ok('materialize from a child coord derives the parent coord', fromChild && eqCoord(fromChild.coord, ACKS.hexScaleParentCoord({ q: 8, r: 4 }, 'regional')));
  ok('materialized continental hex defaults domainless (realm-scale)', fromChild.domainId === null);
}

section('defensive — a legacy campaign (hexes with no hexScale) is unchanged');
{
  // hexes built WITHOUT hexScale (simulating an old save) still group + aggregate as regional.
  const camp = mkCampaign();
  ACKS.hexScaleChildCoords({ q: 0, r: 0 }, 'continental').slice(0, 5).forEach(co => {
    const h = ACKS.blankHex({ coord: co, terrain: 'grassland', families: 12 });
    delete h.hexScale; delete h.parentHexId;   // legacy shape: fields absent entirely
    camp.hexes.push(h);
  });
  ok('legacy hexes read as regional', camp.hexes.every(h => ACKS.hexScaleOf(h) === 'regional'));
  const cells = ACKS.continentalCellsForCampaign(camp);
  ok('legacy hexes still aggregate into a cell', cells.length === 1 && cells[0].childCount === 5);
  ok('legacy cell families summed', cells[0].families === 60);
  ok('legacy hex hexParentOf = null (no materialized parent, derived-only)', ACKS.hexParentOf(camp, camp.hexes[0]) === null);
}

// =============================================================================
section('HW-5 — local child coords + authored children (the nesting grid + reverse index)');
{
  const camp = mkCampaign();
  const parent = addHex(camp, { q: 2, r: 1 }, { terrain: 'hills', koppen: 'Cfb' });   // regional (default scale)
  const ideal = ACKS.localChildCoords(parent);
  ok('localChildCoords returns ~16 (regional→local)', ideal.length >= 13 && ideal.length <= 19);
  ok('localChildCoords === hexScaleChildCoords(parent, regional)', ideal.length === ACKS.hexScaleChildCoords(parent.coord, 'regional').length);
  ok('every ideal coord rounds back to the parent', ideal.every(c => eqCoord(ACKS.hexScaleParentCoord(c, 'regional'), parent.coord)));
  ok('localChildCoords [] for a continental hex (not a 1.5-mi parent)', ACKS.localChildCoords({ hexScale: 'continental', coord: { q: 0, r: 0 } }).length === 0);
  ok('localChildCoords [] for a local hex (finest tier)', ACKS.localChildCoords({ hexScale: 'local', coord: { q: 0, r: 0 } }).length === 0);
  ok('no authored local children yet', ACKS.localChildHexes(camp, parent).length === 0);
  ok('localChildHexes [] for a non-regional parent', ACKS.localChildHexes(camp, { hexScale: 'continental', coord: { q: 0, r: 0 }, id: 'c' }).length === 0);
}

section('HW-5 — materializeLocalHex (GM authoring; idempotent; bound to parent; out-of-economy)');
{
  const camp = mkCampaign();
  const parent = addHex(camp, { q: 2, r: 1 }, { terrain: 'hills', koppen: 'Cfb', domainId: 'dom-x' });
  const lc = ACKS.localChildCoords(parent);
  const a = ACKS.materializeLocalHex(camp, parent, lc[0], { hexOpts: { terrain: 'forest', families: 8 } });
  ok('creates a hexScale:local hex', a && a.hexScale === 'local');
  ok('bound to the parent via parentHexId', a.parentHexId === parent.id);
  ok('at the chosen local coord', eqCoord(a.coord, lc[0]));
  ok('domainless by default (out of the 6-mile economy)', a.domainId === null);
  ok('hexOpts pass through (terrain / families)', a.terrain === 'forest' && a.families === 8);
  ok('idempotent — second call returns the same hex', ACKS.materializeLocalHex(camp, parent, lc[0]) === a);
  ok('only one local hex at that coord', camp.hexes.filter(h => ACKS.hexScaleOf(h) === 'local').length === 1);
  ok('authored child appears under the parent (reverse index)', ACKS.localChildHexes(camp, parent).some(h => h.id === a.id));
  ok('and resolves via the generic hexParentOf (stored parentHexId)', ACKS.hexParentOf(camp, a) === parent);
  // guards
  ok('null for a non-regional parent (cannot drill into local/continental)', ACKS.materializeLocalHex(camp, { hexScale: 'continental', id: 'x', coord: { q: 0, r: 0 } }, lc[1]) === null);
  ok('null for a missing coord', ACKS.materializeLocalHex(camp, parent, null) === null);
  ok('null for a non-numeric coord', ACKS.materializeLocalHex(camp, parent, { q: 'a', r: 1 }) === null);
  // domainId override (a GM who wants the local hex to belong to the parent's domain)
  const b = ACKS.materializeLocalHex(camp, parent, lc[1], { domainId: 'dom-x' });
  ok('domainId override honored', b.domainId === 'dom-x');
  // a stray hexScale in hexOpts cannot break the tier (reconciled)
  const c = ACKS.materializeLocalHex(camp, parent, lc[2], { hexOpts: { hexScale: 'continental', parentHexId: 'spoof' } });
  ok('hexOpts cannot override the local tier or the parent binding', c.hexScale === 'local' && c.parentHexId === parent.id);
}

section('HW-5 — localDrillView (the map drill render set) + aggregateRegionalCell (derived summary)');
{
  const camp = mkCampaign();
  const parent = addHex(camp, { q: 0, r: 0 }, { terrain: 'hills', koppen: 'BWh', families: 100, domainId: 'dom-1' });
  const lc = ACKS.localChildCoords(parent);
  ACKS.materializeLocalHex(camp, parent, lc[0], { hexOpts: { terrain: 'forest', families: 4, settlement: { name: 'Hamlet' } } });
  ACKS.materializeLocalHex(camp, parent, lc[1], { hexOpts: { terrain: 'forest', families: 6 } });
  ACKS.materializeLocalHex(camp, parent, lc[2], { hexOpts: { terrain: 'swamp', families: 2 } });
  const view = ACKS.localDrillView(camp, parent);
  ok('view carries parent + parentHexId + parentCoord', view && view.parent === parent && view.parentHexId === parent.id && eqCoord(view.parentCoord, { q: 0, r: 0 }));
  ok('idealizedCount ~16', view.idealizedCount >= 13 && view.idealizedCount <= 19);
  ok('authoredCount 3', view.authoredCount === 3);
  ok('addableCoords = idealized − authored', view.addableCoords.length === view.idealizedCount - 3);
  ok('addable excludes the authored cells', !view.addableCoords.some(c => eqCoord(c, lc[0]) || eqCoord(c, lc[1]) || eqCoord(c, lc[2])));
  ok('authoredByCoordKey maps a coord → its hex', (() => { const h = view.authoredByCoordKey[lc[0].q + ',' + lc[0].r]; return h && h.terrain === 'forest'; })());
  // the derived aggregate of authored detail
  const agg = view.aggregate;
  ok('aggregate dominantTerrain = forest (2 of 3)', agg.dominantTerrain === 'forest');
  ok('aggregate families summed = 12', agg.families === 12);
  ok('aggregate settlementCount = 1', agg.settlementCount === 1);
  ok('aggregate childCount 3, idealizedCount ~16', agg.childCount === 3 && agg.idealizedCount >= 13);
  ok('aggregate key = the parent coord key R0,0', agg.key === 'R0,0');
  ok('aggregate parentHexId = parent.id', agg.parentHexId === parent.id);
  // localDrillView guards
  ok('localDrillView null for a continental hex', ACKS.localDrillView(camp, { hexScale: 'continental', coord: { q: 0, r: 0 }, id: 'c' }) === null);
  ok('localDrillView null for a local hex (no deeper tier)', ACKS.localDrillView(camp, { hexScale: 'local', coord: { q: 0, r: 0 }, id: 'l' }) === null);
  // aggregateRegionalCell standalone (pure; explicit members) — empty + koppen fallback
  const agg2 = ACKS.aggregateRegionalCell(camp, [], parent);
  ok('empty members → childCount 0, families 0', agg2.childCount === 0 && agg2.families === 0);
  ok('empty members → koppen falls back to the parent koppen (BWh)', agg2.koppen === 'BWh' && agg2.koppenSource === 'parent');
  ok('child koppen wins over parent when present', ACKS.aggregateRegionalCell(camp, [{ coord: { q: 0, r: 0 }, koppen: 'Cfb' }], parent).koppen === 'Cfb');
}

section('HW-5 — local hexes do NOT pollute the regional tier or continental aggregation');
{
  const camp = mkCampaign();
  const parent = addHex(camp, { q: 0, r: 0 }, { terrain: 'hills', families: 50, domainId: 'dom-1' });
  ACKS.materializeLocalHex(camp, parent, ACKS.localChildCoords(parent)[0], { hexOpts: { terrain: 'forest', families: 5 } });
  const regionalOnly = camp.hexes.filter(h => ACKS.hexScaleOf(h) === 'regional');
  ok('only the parent is regional (the local child is excluded by scale)', regionalOnly.length === 1 && regionalOnly[0].id === parent.id);
  ok('the local child carries no domainId (invisible to the domain economy)', camp.hexes.find(h => ACKS.hexScaleOf(h) === 'local').domainId === null);
  const cells = ACKS.continentalCellsForCampaign(camp);
  ok('continental aggregation counts only the regional hex (not the local child)', cells.length === 1 && cells[0].childCount === 1);
  ok('continental cell families = the parent only (50, not 55)', cells[0].families === 50);
}

// =============================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — hex-scales.smoke.js: ' + pass + ' passed, ' + fail + ' failed.');
if (fail) { console.log('Failures:\n  ' + failures.join('\n  ')); process.exit(1); }
