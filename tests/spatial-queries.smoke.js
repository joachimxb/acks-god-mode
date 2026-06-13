/* Domain Completion DC-0 — spatial-query foundation smoke test.
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/spatial-queries.smoke.js
 *
 * Covers acks-engine-domain-completion.js (Domain_Completion_Plan.md §5 + §12) — the PURE
 * derivation over campaign.hexes[] that answers the RR p.340 spatial advancement conditions:
 *   - hexNeighbors / hexesRoadConnected / roadReachableHexes — the road-network BFS substrate,
 *     reusing the shipped §24 road-edge model (roadBonusForStep / hexEdgeBetween / hexOppositeEdge)
 *   - roadConnectedToSmallTown — "road-connected to a small town within 24 miles" (condition 1)
 *   - nearestSettlementWithin  — straight-line friendly-city / large-town distance (RR p.339/340)
 *   - effectiveRoadToTown / effectiveNearFriendlyCity — override-aware derived reads (the GM
 *     override on domain.roadToTownOverride wins; absent ⇒ derive — read defensively)
 *   - domainSpatialConditions — the read-only panel's convenience read
 *   - blankDomain.roadToTownOverride default + explicit-override preservation
 *   - "shipped primitives reused, not reimplemented" (source-level assertion)
 *
 * HEX_EDGE_DELTAS = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]] — so along r=0, side 0 → (q+1,r) and
 * its opposite (side 3) → (q-1,r). A straight east-west road chain uses [3,0] on each interior hex.
 *
 * Authored 2026-06-13 — world-layer team session (CLAUDE §15), agent-3 (Domain Completion DC-0).
 */

const fs = require('fs');
const path = require('path');
require('./_engine.js').load();
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail ? '  -- ' + detail : '')); failed++; }
}
function section(t){ console.log('--- ' + t + ' ---'); }

function mkHex(id, q, r, extra){ return Object.assign({ id, schemaVersion: 2, coord: { q, r } }, extra || {}); }

// A straight east-west road chain h0..h5 along r=0. h0 carries domainId 'dom-1' (the only
// controlled hex). Interior hexes get roadSides [3,0] (road back + forward); the ends get the
// one inward side. `townAt` (index) gets a settlement of `townFamilies`; `breakFwd` (index)
// removes that hex's forward (side-0) road, severing the chain at that edge.
function roadChain(opts){
  opts = opts || {};
  const coords = [[0,0],[1,0],[2,0],[3,0],[4,0],[5,0]];
  const hexes = coords.map((c, i) => {
    const sides = [];
    if(i > 0) sides.push(3);
    if(i < coords.length - 1) sides.push(0);
    const extra = { roadSides: sides };
    if(i === 0) extra.domainId = 'dom-1';
    return mkHex('h' + i, c[0], c[1], extra);
  });
  (opts.towns || []).forEach(t => { hexes[t.at].settlement = { id: 'set-' + t.at, name: 'Town' + t.at, families: t.families }; });
  if(opts.breakFwd != null) hexes[opts.breakFwd].roadSides = hexes[opts.breakFwd].roadSides.filter(s => s !== 0);
  return { schemaVersion: 2, kind: 'campaign', hexes, settlements: [], domains: [ ACKS.blankDomain({ id: 'dom-1', name: 'Frontier' }) ] };
}
const dom1 = c => c.domains[0];

// ─────────────────────────────────────────────────────────────────────────
section('Exports on global.ACKS');
['hexNeighbors','hexesRoadConnected','roadReachableHexes','roadConnectedToSmallTown',
 'nearestSettlementWithin','effectiveRoadToTown','effectiveNearFriendlyCity','domainSpatialConditions']
  .forEach(n => check('ACKS.' + n + ' exported', typeof ACKS[n] === 'function'));

// ─────────────────────────────────────────────────────────────────────────
section('hexNeighbors — authored neighbours + shared edge index (HEX_EDGE_DELTAS order)');
(function(){
  const c = roadChain({ towns: [{ at: 3, families: 500 }] });
  const nb = ACKS.hexNeighbors(c, 'h1');
  check('h1 has exactly 2 authored neighbours (h0, h2)', nb.length === 2, JSON.stringify(nb.map(x => x.hex.id)));
  const toH0 = nb.find(x => x.hex.id === 'h0'), toH2 = nb.find(x => x.hex.id === 'h2');
  check('h1→h0 via side 3', toH0 && toH0.side === 3, toH0 && String(toH0.side));
  check('h1→h2 via side 0', toH2 && toH2.side === 0, toH2 && String(toH2.side));
  check('side matches ACKS.hexEdgeBetween', toH2 && toH2.side === ACKS.hexEdgeBetween({ q:1, r:0 }, { q:2, r:0 }));
  check('unknown hex → []', ACKS.hexNeighbors(c, 'nope').length === 0);
  check('null campaign → [] (no throw)', ACKS.hexNeighbors(null, 'h1').length === 0);
})();

// ─────────────────────────────────────────────────────────────────────────
section('hexesRoadConnected — reuses roadBonusForStep (both sides must carry the road)');
(function(){
  const c = roadChain({ towns: [{ at: 3, families: 500 }] });
  const h0 = ACKS.findHex(c, 'h0'), h1 = ACKS.findHex(c, 'h1'), h2 = ACKS.findHex(c, 'h2');
  check('h0—h1 connected (side 0)', ACKS.hexesRoadConnected(c, h0, h1, 0) === true);
  check('h1—h2 connected (side 0)', ACKS.hexesRoadConnected(c, h1, h2, 0) === true);
  const cBroke = roadChain({ towns: [{ at: 3, families: 500 }], breakFwd: 0 }); // h0 loses its forward road
  const b0 = ACKS.findHex(cBroke, 'h0'), b1 = ACKS.findHex(cBroke, 'h1');
  check('road removed on h0→h1 edge → not connected', ACKS.hexesRoadConnected(cBroke, b0, b1, 0) === false);
  check('side < 0 (non-adjacent) → false', ACKS.hexesRoadConnected(c, h0, h2, -1) === false);
  // coarse legacy hex.hasRoad short-circuits (roadBonusForStep treats it as roaded throughout).
  const ca = mkHex('a', 0, 0, { hasRoad: true }), cb = mkHex('b', 1, 0, { hasRoad: true });
  check('legacy hasRoad both → connected', ACKS.hexesRoadConnected(c, ca, cb, 0) === true);
})();

// ─────────────────────────────────────────────────────────────────────────
section('roadReachableHexes — BFS bounded by maxHexes (Set, origin excluded)');
(function(){
  const c = roadChain({ towns: [{ at: 3, families: 500 }] });
  const r4 = ACKS.roadReachableHexes(c, 'h0', 4);
  check('returns a Set', r4 instanceof Set);
  check('reaches h1..h4 within 4 steps', r4.has('h1') && r4.has('h2') && r4.has('h3') && r4.has('h4'));
  check('origin h0 excluded', !r4.has('h0'));
  check('h5 (depth 5) beyond bound', !r4.has('h5'));
  check('size = 4', r4.size === 4, String(r4.size));
  const r2 = ACKS.roadReachableHexes(c, 'h0', 2);
  check('maxHexes 2 → {h1,h2}', r2.has('h1') && r2.has('h2') && !r2.has('h3') && r2.size === 2);
  check('maxHexes 0 → empty', ACKS.roadReachableHexes(c, 'h0', 0).size === 0);
  const cBroke = roadChain({ breakFwd: 1 }); // sever h1→h2
  const rb = ACKS.roadReachableHexes(cBroke, 'h0', 4);
  check('road break stops BFS (only h1 reachable)', rb.has('h1') && !rb.has('h2') && rb.size === 1);
})();

// ─────────────────────────────────────────────────────────────────────────
section('roadConnectedToSmallTown — RR p.340 condition 1 (road + ≤24mi + ≥500 families)');
(function(){
  // Town 3 hexes away by road → found (the §12.4 case).
  const c = roadChain({ towns: [{ at: 3, families: 500 }] });
  const r = ACKS.roadConnectedToSmallTown(c, dom1(c), { maxMiles: 24 });
  check('500-family town 3 hexes by road → found', r.found === true, JSON.stringify(r));
  check('witness = h3', r.witnessHexId === 'h3');
  check('miles = 18 (3 × 6)', r.miles === 18, String(r.miles));
  check('settlementFamilies = 500', r.settlementFamilies === 500);

  // Size gate — 499 families is a Large Village, not a Small Town.
  const cSize = roadChain({ towns: [{ at: 3, families: 499 }] });
  check('499-family settlement → NOT found (size gate)', ACKS.roadConnectedToSmallTown(cSize, dom1(cSize)).found === false);

  // Road gate — break the chain before the town.
  const cBreak = roadChain({ towns: [{ at: 3, families: 500 }], breakFwd: 1 });
  check('road broken before the town → NOT found (road gate)', ACKS.roadConnectedToSmallTown(cBreak, dom1(cBreak)).found === false);

  // Distance gate — town 5 hexes away, 24mi only reaches 4.
  const cFar = roadChain({ towns: [{ at: 5, families: 600 }] });
  check('town 5 hexes away → NOT found at 24mi (distance gate)', ACKS.roadConnectedToSmallTown(cFar, dom1(cFar), { maxMiles: 24 }).found === false);
  const rFar = ACKS.roadConnectedToSmallTown(cFar, dom1(cFar), { maxMiles: 36 });
  check('same town found when maxMiles 36 (depth 5)', rFar.found === true && rFar.witnessHexId === 'h5' && rFar.miles === 30, JSON.stringify(rFar));

  // Nearest of several qualifying towns wins.
  const cTwo = roadChain({ towns: [{ at: 2, families: 500 }, { at: 4, families: 800 }] });
  const rTwo = ACKS.roadConnectedToSmallTown(cTwo, dom1(cTwo), { maxMiles: 24 });
  check('nearest qualifying town wins (h2 over h4)', rTwo.witnessHexId === 'h2' && rTwo.miles === 12, JSON.stringify(rTwo));

  // Settlement read also via campaign.settlements[] (not embedded).
  const cExt = roadChain({});
  cExt.settlements = [{ id: 'set-x', hexId: 'h3', name: 'Extville', families: 520 }];
  check('campaign.settlements[] (non-embedded) is read', ACKS.roadConnectedToSmallTown(cExt, dom1(cExt)).found === true);
})();

// ─────────────────────────────────────────────────────────────────────────
section('nearestSettlementWithin — straight-line, ignores roads, honours minType');
(function(){
  // Origin with NO road. Large Town (625) 2 hexes away; Small Town (500) 1 hex away.
  const c = { schemaVersion: 2, kind: 'campaign', hexes: [
    mkHex('o', 0, 0, { domainId: 'dom-2' }),
    mkHex('st', 1, 0, { settlement: { families: 500 } }),
    mkHex('lt', 2, 0, { settlement: { families: 625 } })
  ], settlements: [], domains: [ ACKS.blankDomain({ id: 'dom-2' }) ] };
  const rLT = ACKS.nearestSettlementWithin(c, 'o', { maxMiles: 12, minType: 'Large Town' });
  check('Large Town 2 hexes (no road) → found straight-line', rLT.found === true && rLT.witnessHexId === 'lt' && rLT.miles === 12, JSON.stringify(rLT));
  check('Small Town skipped under minType Large Town', rLT.witnessHexId !== 'st');
  const rST = ACKS.nearestSettlementWithin(c, 'o', { maxMiles: 12, minType: 'Small Town' });
  check('minType Small Town → nearest (st @ 1 hex) wins', rST.witnessHexId === 'st' && rST.miles === 6, JSON.stringify(rST));
  const rTight = ACKS.nearestSettlementWithin(c, 'o', { maxMiles: 6, minType: 'Large Town' });
  check('Large Town beyond maxMiles 6 → NOT found (distance gate)', rTight.found === false);
  check('missing origin hex → {found:false} (no throw)', ACKS.nearestSettlementWithin(c, 'nope', { maxMiles: 24 }).found === false);
})();

// ─────────────────────────────────────────────────────────────────────────
section('effectiveRoadToTown — GM override (domain.roadToTownOverride) wins; null/absent derives');
(function(){
  const c = roadChain({ towns: [{ at: 3, families: 500 }] });
  check('null override → derived true', ACKS.effectiveRoadToTown(c, dom1(c)) === true);
  dom1(c).roadToTownOverride = false;
  check('override false beats derived true', ACKS.effectiveRoadToTown(c, dom1(c)) === false);
  const cNo = roadChain({ towns: [{ at: 3, families: 499 }] }); // derived false
  check('derived false (no qualifying town)', ACKS.effectiveRoadToTown(cNo, dom1(cNo)) === false);
  dom1(cNo).roadToTownOverride = true;
  check('override true beats derived false', ACKS.effectiveRoadToTown(cNo, dom1(cNo)) === true);
  // Legacy domain object with NO roadToTownOverride field → defensive read derives, no throw.
  const cLegacy = roadChain({ towns: [{ at: 2, families: 700 }] });
  check('absent field (undefined) → derives, no throw', ACKS.effectiveRoadToTown(cLegacy, { id: 'dom-1' }) === true);
  check('null campaign/domain → false (no throw)', ACKS.effectiveRoadToTown(null, null) === false);
})();

// ─────────────────────────────────────────────────────────────────────────
section('effectiveNearFriendlyCity — distance band + GM-asserted override');
(function(){
  function mk(cityQ, fam){ return { schemaVersion: 2, kind: 'campaign', hexes: [
    mkHex('o', 0, 0, { domainId: 'dom-3' }),
    mkHex('city', cityQ, 0, { settlement: { families: fam } })
  ], settlements: [], domains: [ ACKS.blankDomain({ id: 'dom-3' }) ] }; }
  function band(cityQ, fam){ const c = mk(cityQ, fam); return ACKS.effectiveNearFriendlyCity(c, c.domains[0]); }
  check('Large Town 8 hexes (48mi) → within-48mi', band(8, 700) === 'within-48mi');
  check('Large Town 12 hexes (72mi) → within-72mi', band(12, 700) === 'within-72mi');
  check('Large Town 13 hexes (78mi) → none', band(13, 700) === 'none');
  check('only a Small Town (Class < Large Town) → none', band(4, 500) === 'none');
  // GM override (a DC-2 field; absent here ⇒ derive, but an explicit value wins).
  const cNone = mk(99, 700); // city out of range → derived 'none'
  cNone.domains[0].nearFriendlyCity = 'within-48mi';
  check('GM nearFriendlyCity override beats derived none', ACKS.effectiveNearFriendlyCity(cNone, cNone.domains[0]) === 'within-48mi');
  cNone.domains[0].nearFriendlyCity = 'auto';
  check("'auto' falls back to derive", ACKS.effectiveNearFriendlyCity(cNone, cNone.domains[0]) === 'none');
})();

// ─────────────────────────────────────────────────────────────────────────
section('domainSpatialConditions — the read-only panel read');
(function(){
  const c = roadChain({ towns: [{ at: 3, families: 540 }] });
  const sc = ACKS.domainSpatialConditions(c, dom1(c));
  check('roadToTown.effective true', sc.roadToTown.effective === true);
  check('roadToTown.derived true', sc.roadToTown.derived === true);
  check('roadToTown.overridden false', sc.roadToTown.overridden === false);
  check('roadToTown witness + families + miles', sc.roadToTown.witnessHexId === 'h3' && sc.roadToTown.settlementFamilies === 540 && sc.roadToTown.miles === 18);
  check('friendlyCity.band none (no Large Town)', sc.friendlyCity.band === 'none');
  // With an override, the panel surfaces both effective + derived.
  dom1(c).roadToTownOverride = false;
  const sc2 = ACKS.domainSpatialConditions(c, dom1(c));
  check('override surfaces: effective false, derived true, overridden true', sc2.roadToTown.effective === false && sc2.roadToTown.derived === true && sc2.roadToTown.overridden === true && sc2.roadToTown.overrideValue === false);
})();

// ─────────────────────────────────────────────────────────────────────────
section('Sparse / map-less campaign — all queries false, no throw');
(function(){
  const cE = { schemaVersion: 2, kind: 'campaign', hexes: [], settlements: [], domains: [ ACKS.blankDomain({ id: 'dom-x' }) ] };
  check('roadConnectedToSmallTown → {found:false}', ACKS.roadConnectedToSmallTown(cE, cE.domains[0]).found === false);
  check('nearestSettlementWithin → {found:false}', ACKS.nearestSettlementWithin(cE, 'nope', { maxMiles: 24 }).found === false);
  check('roadReachableHexes → empty Set', ACKS.roadReachableHexes(cE, 'nope', 4).size === 0);
  check('effectiveRoadToTown → false', ACKS.effectiveRoadToTown(cE, cE.domains[0]) === false);
  check('effectiveNearFriendlyCity → none', ACKS.effectiveNearFriendlyCity(cE, cE.domains[0]) === 'none');
  const sc = ACKS.domainSpatialConditions(cE, cE.domains[0]);
  check('domainSpatialConditions safe on empty', sc.roadToTown.effective === false && sc.friendlyCity.band === 'none');
  // Domain with hexes but no roads/settlements.
  const cNoRoads = { schemaVersion: 2, kind: 'campaign', hexes: [ mkHex('a', 0, 0, { domainId: 'dom-y' }), mkHex('b', 1, 0, { settlement: { families: 999 } }) ], settlements: [], domains: [ ACKS.blankDomain({ id: 'dom-y' }) ] };
  check('settled neighbour but no road → road-to-town false', ACKS.roadConnectedToSmallTown(cNoRoads, cNoRoads.domains[0]).found === false);
})();

// ─────────────────────────────────────────────────────────────────────────
section('blankDomain.roadToTownOverride — additive field, default null, override preserved');
(function(){
  check('default null', ACKS.blankDomain().roadToTownOverride === null);
  check('explicit false preserved (not coerced to null)', ACKS.blankDomain({ roadToTownOverride: false }).roadToTownOverride === false);
  check('explicit true preserved', ACKS.blankDomain({ roadToTownOverride: true }).roadToTownOverride === true);
})();

// ─────────────────────────────────────────────────────────────────────────
section('Shipped primitives REUSED, not reimplemented (source-level)');
(function(){
  const src = fs.readFileSync(path.join(__dirname, '..', 'acks-engine-domain-completion.js'), 'utf8');
  ['hexAxialDistance','lookupSettlementBenchmark','roadBonusForStep','hexEdgeBetween','hexOppositeEdge','hexNeighborDeltas']
    .forEach(name => {
      check('does NOT redefine ' + name, !(new RegExp('function\\s+' + name + '\\b')).test(src));
      check(name + ' present on shared ACKS (reused)', typeof ACKS[name] === 'function');
    });
})();

// ─────────────────────────────────────────────────────────────────────────
console.log('--- Summary ---');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
if(failed === 0){
  console.log('\nAll Domain Completion DC-0 (spatial-query) smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nSome checks failed. Review output above.');
  process.exit(1);
}
