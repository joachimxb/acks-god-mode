/* Phase 2.5 Map Mode (#225 — M0–M6) smoke test — the SVG hex map's pure helpers.
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/map.smoke.js
 *
 * The map is a PURE VIEW over campaign.hexes[] (Architecture §11; Phase_2.5_Map_Mode_Plan.md).
 * The render/pan/zoom/click wiring lives in index.html (Alpine); the testable surface is the
 * engine geometry + fill-layer accessors in acks-engine-subsystems.js §9.7. This covers:
 *   - hexAxialToPixel  — flat-top projection, determinism + known values
 *   - hexCornerPoints  — 6 corners, flat-top orientation (flat top/bottom edges, points L/R)
 *   - hexPolygonPoints — SVG points string
 *   - hexMapBounds     — bounding box + margin, null on empty, reads .coord OR bare {q,r}
 *   - hexDisplayLabel  — RAW-style column-row label, deterministic, negatives
 *   - hexFillColor     — terrain / domain / land-value / classification layers (M2 DoD)
 *   - hexFillLayers / hexFillLegend — the radio catalog + legend rows
 *
 * Authored 2026-06-02 (Map Mode M0–M2).
 */

const path = require('path');
[
  'acks-engine-catalogs.js',
  'acks-engine.js',
  'acks-engine-entities.js',
  'acks-engine-entity-registry.js',
  'acks-engine-field-schemas.js',
  'acks-engine-events.js',
  'acks-engine-subsystems.js',
].forEach(f => require(path.join(__dirname, '..', f)));
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail ? '  -- ' + detail : '')); failed++; }
}
function section(t){ console.log('--- ' + t + ' ---'); }
const approx = (a, b, eps) => Math.abs(a - b) < (eps == null ? 1e-6 : eps);
const SIZE = 40;
const SQRT3 = Math.sqrt(3);

// ─── exports present ───
section('Exports on global.ACKS');
['hexAxialToPixel','hexCornerPoints','hexPolygonPoints','hexMapBounds','hexDisplayLabel',
 'hexFillColor','hexFillLayers','hexFillLegend','MAP_DEFAULT_HEX_SIZE']
  .forEach(name => check('ACKS.' + name + ' exported', typeof ACKS[name] !== 'undefined'));

// ─── hexAxialToPixel — flat-top projection ───
section('hexAxialToPixel (flat-top)');
const o = ACKS.hexAxialToPixel(0, 0, SIZE);
check('origin → (0,0)', approx(o.x, 0) && approx(o.y, 0));
const q1 = ACKS.hexAxialToPixel(1, 0, SIZE);
check('q=1 → x = size·3/2', approx(q1.x, SIZE * 1.5));        // 60
check('q=1 → y = size·√3·(0+1/2)', approx(q1.y, SIZE * SQRT3 * 0.5)); // 34.64
const r1 = ACKS.hexAxialToPixel(0, 1, SIZE);
check('r=1 → x = 0', approx(r1.x, 0));
check('r=1 → y = size·√3', approx(r1.y, SIZE * SQRT3));
const neg = ACKS.hexAxialToPixel(-2, 1, SIZE);
check('negative coord projects', approx(neg.x, -120) && approx(neg.y, SIZE * SQRT3 * (1 + -1)));
check('determinism — same input, same output',
  JSON.stringify(ACKS.hexAxialToPixel(3, -2, SIZE)) === JSON.stringify(ACKS.hexAxialToPixel(3, -2, SIZE)));
check('default size applies when omitted',
  JSON.stringify(ACKS.hexAxialToPixel(1, 0)) === JSON.stringify(ACKS.hexAxialToPixel(1, 0, ACKS.MAP_DEFAULT_HEX_SIZE)));

// ─── hexCornerPoints — flat-top geometry ───
section('hexCornerPoints (flat-top: 6 corners, flat top/bottom, points L/R)');
const cor = ACKS.hexCornerPoints(0, 0, SIZE);
check('returns 6 corners', Array.isArray(cor) && cor.length === 6);
check('corner 0 is due-right (cx+size, cy)', approx(cor[0].x, SIZE) && approx(cor[0].y, 0));
check('corner 3 is due-left (cx-size, cy)',  approx(cor[3].x, -SIZE) && approx(cor[3].y, 0));
check('bottom edge is flat (corners 1 & 2 share y)', approx(cor[1].y, cor[2].y));
check('top edge is flat (corners 4 & 5 share y)',     approx(cor[4].y, cor[5].y));
check('top & bottom edges symmetric about center', approx(cor[1].y, -cor[4].y));
check('corner 1 below center (SVG y-down)', cor[1].y > 0);
check('flat-edge half-height = size·√3/2', approx(cor[1].y, SIZE * SQRT3 / 2));
check('corner 1 x = cx + size/2', approx(cor[1].x, SIZE / 2));
// centered elsewhere: corners are a pure translation
const cor2 = ACKS.hexCornerPoints(100, 50, SIZE);
check('translation invariance', approx(cor2[0].x, 100 + SIZE) && approx(cor2[0].y, 50));

// ─── hexPolygonPoints — SVG points string ───
section('hexPolygonPoints');
const pts = ACKS.hexPolygonPoints(0, 0, SIZE);
check('6 comma-pairs space-separated', pts.split(' ').length === 6 && pts.split(' ').every(p => /^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/.test(p)));
check('first pair is the due-right corner', pts.split(' ')[0] === '40,0');
check('determinism', ACKS.hexPolygonPoints(2, 3, SIZE) === ACKS.hexPolygonPoints(2, 3, SIZE));

// ─── hexMapBounds — bounding box + margin ───
section('hexMapBounds');
check('null on empty set', ACKS.hexMapBounds([], SIZE, 0) === null);
check('null on null', ACKS.hexMapBounds(null, SIZE, 0) === null);
const b1 = ACKS.hexMapBounds([{ coord: { q: 0, r: 0 } }], SIZE, 0);
check('single hex x-extent ±size', approx(b1.minX, -SIZE) && approx(b1.maxX, SIZE));
check('single hex y-extent ±size·√3/2', approx(b1.minY, -SIZE * SQRT3 / 2) && approx(b1.maxY, SIZE * SQRT3 / 2));
check('width/height derived', approx(b1.width, b1.maxX - b1.minX) && approx(b1.height, b1.maxY - b1.minY));
const b2 = ACKS.hexMapBounds([{ coord: { q: 0, r: 0 } }, { coord: { q: 1, r: 0 } }, { coord: { q: 0, r: 1 } }], SIZE, 60);
check('multi-hex known minX (=-40-60)', approx(b2.minX, -100));
check('multi-hex known maxX (=100+60)', approx(b2.maxX, 160));
// hex (0,1) bottom extent = center.y (size·√3) + halfH (size·√3/2) = size·√3·1.5 = 103.92; +60 margin
check('multi-hex known maxY (~103.92+60)', approx(b2.maxY, SIZE * SQRT3 * 1.5 + 60, 1e-4));
check('margin widens the box symmetrically',
  approx(ACKS.hexMapBounds([{ coord: { q: 0, r: 0 } }], SIZE, 25).minX, -SIZE - 25));
check('reads bare {q,r} too', (() => { const b = ACKS.hexMapBounds([{ q: 0, r: 0 }], SIZE, 0); return b && approx(b.minX, -SIZE); })());
check('default margin applies when omitted', (() => { const b = ACKS.hexMapBounds([{ q: 0, r: 0 }], SIZE); return b && b.minX < -SIZE; })());

// ─── hexDisplayLabel — RAW-style column-row ───
section('hexDisplayLabel (column-row)');
check('(0,0) → "0000"', ACKS.hexDisplayLabel(0, 0) === '0000');
check('(3,1) → "0302" (col 3, odd-q row 1+1)', ACKS.hexDisplayLabel(3, 1) === '0302');
check('(1,0) → "0100"', ACKS.hexDisplayLabel(1, 0) === '0100');
check('(0,1) → "0001"', ACKS.hexDisplayLabel(0, 1) === '0001');
check('negative column carries "-"', ACKS.hexDisplayLabel(-1, 1) === '-0100');
check('two-digit zero pad (even-q: col 8, row 1+4=5)', ACKS.hexDisplayLabel(8, 1) === '0805');
check('determinism', ACKS.hexDisplayLabel(4, -2) === ACKS.hexDisplayLabel(4, -2));

// ─── hexName — the canonical display name (Settlement|Terrain + coords) ───
section('hexName (display naming standard)');
check('settlement hex → "Name (coords)"', ACKS.hexName({ coord:{q:0,r:0}, settlement:{name:'Saltspur'}, terrain:'plains' }) === 'Saltspur (0000)');
check('settlement wins over terrain', ACKS.hexName({ coord:{q:1,r:0}, settlement:{name:'Northwatch'}, terrain:'hills' }) === 'Northwatch (0100)');
check('terrain hex (no settlement) → "Terrain (coords)", Title-cased', ACKS.hexName({ coord:{q:1,r:0}, terrain:'forest' }) === 'Forest (0100)');
check('lowercase terrain is Title-cased', ACKS.hexName({ coord:{q:0,r:1}, terrain:'coast' }) === 'Coast (0001)');
check('no settlement + no terrain → coords only', ACKS.hexName({ coord:{q:-3,r:1} }) === '-03-01');
check('negative coords format', ACKS.hexName({ coord:{q:-1,r:1}, terrain:'swamp' }) === 'Swamp (-0100)');
check('null hex → empty string', ACKS.hexName(null) === '');
check('determinism', ACKS.hexName({ coord:{q:2,r:2}, terrain:'desert' }) === ACKS.hexName({ coord:{q:2,r:2}, terrain:'desert' }));

// ─── hexFillColor — TERRAIN ───
section('hexFillColor — terrain');
check('default layer falls to terrain', ACKS.hexFillColor({ terrain: 'forest' }) === ACKS.hexFillColor({ terrain: 'forest' }, 'terrain'));
check('forest → stable color', ACKS.hexFillColor({ terrain: 'forest' }, 'terrain') === ACKS.hexFillColor({ terrain: 'Forest' }, 'terrain'));
check('case-insensitive', ACKS.hexFillColor({ terrain: 'GRASSLAND' }, 'terrain') === ACKS.hexFillColor({ terrain: 'grassland' }, 'terrain'));
check('MM biome sub-type stripped ("Forest (Taiga)" → forest)', ACKS.hexFillColor({ terrain: 'Forest (Taiga)' }, 'terrain') === ACKS.hexFillColor({ terrain: 'forest' }, 'terrain'));
check('blank terrain → neutral', /^#[0-9a-f]{6}$/i.test(ACKS.hexFillColor({}, 'terrain')));
check('unknown terrain → neutral (same as blank)', ACKS.hexFillColor({ terrain: 'lava' }, 'terrain') === ACKS.hexFillColor({}, 'terrain'));
check('all 9 base terrains map to distinct colors', (() => {
  const names = ['barrens','desert','forest','grassland','hills','jungle','mountains','scrubland','swamp'];
  const set = new Set(names.map(t => ACKS.hexFillColor({ terrain: t }, 'terrain')));
  return set.size === 9;
})());
// synonym aliasing — common GM/author terms (incl. the demo's "plains"/"coast") resolve to the 9
check('alias "plains" → grassland', ACKS.hexFillColor({ terrain: 'plains' }, 'terrain') === ACKS.hexFillColor({ terrain: 'grassland' }, 'terrain'));
check('alias "coast" → grassland (land hex)', ACKS.hexFillColor({ terrain: 'coast' }, 'terrain') === ACKS.hexFillColor({ terrain: 'grassland' }, 'terrain'));
check('alias "woods" → forest', ACKS.hexFillColor({ terrain: 'Woods' }, 'terrain') === ACKS.hexFillColor({ terrain: 'forest' }, 'terrain'));
check('alias "mountain" → mountains', ACKS.hexFillColor({ terrain: 'mountain' }, 'terrain') === ACKS.hexFillColor({ terrain: 'mountains' }, 'terrain'));
check('alias "marsh" → swamp', ACKS.hexFillColor({ terrain: 'marsh' }, 'terrain') === ACKS.hexFillColor({ terrain: 'swamp' }, 'terrain'));
check('still-unknown term stays neutral (alias map is not a catch-all)', ACKS.hexFillColor({ terrain: 'lava' }, 'terrain') === ACKS.hexFillColor({}, 'terrain'));

// ─── hexFillColor — LAND VALUE ───
section('hexFillColor — land value (3..9 distinct buckets)');
check('3..9 give 7 distinct buckets', (() => {
  const set = new Set([3,4,5,6,7,8,9].map(v => ACKS.hexFillColor({ valuePerFamily: v }, 'land-value')));
  return set.size === 7;
})());
check('value < 3 → neutral', ACKS.hexFillColor({ valuePerFamily: 2 }, 'land-value') === ACKS.hexFillColor({}, 'land-value'));
check('value > 9 clamps to the 9 bucket', ACKS.hexFillColor({ valuePerFamily: 12 }, 'land-value') === ACKS.hexFillColor({ valuePerFamily: 9 }, 'land-value'));
check('missing value → neutral', /^#[0-9a-f]{6}$/i.test(ACKS.hexFillColor({}, 'land-value')));
check('determinism', ACKS.hexFillColor({ valuePerFamily: 6 }, 'land-value') === ACKS.hexFillColor({ valuePerFamily: 6 }, 'land-value'));

// ─── hexFillColor — DOMAIN ───
section('hexFillColor — domain (stable hue per id)');
check('same domainId → stable color', ACKS.hexFillColor({ domainId: 'dom-saltspur' }, 'domain') === ACKS.hexFillColor({ domainId: 'dom-saltspur' }, 'domain'));
check('domainId yields an hsl()', /^hsl\(/.test(ACKS.hexFillColor({ domainId: 'dom-saltspur' }, 'domain')));
check('null domainId → neutral grey (unclaimed)', ACKS.hexFillColor({ domainId: null }, 'domain') === ACKS.hexFillColor({}, 'domain'));
check('distinct ids generally differ', ACKS.hexFillColor({ domainId: 'dom-a' }, 'domain') !== ACKS.hexFillColor({ domainId: 'dom-zzz' }, 'domain'));

// ─── hexFillColor — CLASSIFICATION ───
section('hexFillColor — classification (ordinal)');
check('4 classes map to 4 distinct colors', (() => {
  const set = new Set(['Civilized','Borderlands','Outlands','Unsettled'].map(c => ACKS.hexFillColor({ classification: c }, 'classification')));
  return set.size === 4;
})());
check('case-insensitive', ACKS.hexFillColor({ classification: 'CIVILIZED' }, 'classification') === ACKS.hexFillColor({ classification: 'civilized' }, 'classification'));
check('unknown classification → neutral', ACKS.hexFillColor({ classification: 'feywild' }, 'classification') === ACKS.hexFillColor({}, 'land-value'));

// ─── hexFillLayers / hexFillLegend ───
section('hexFillLayers + hexFillLegend');
const layers = ACKS.hexFillLayers();
check('full §4.1 catalog (9 layers)', Array.isArray(layers) && layers.length === 9);
check('terrain is first (default)', layers[0].id === 'terrain');
check('every layer has id + label', layers.every(l => l.id && l.label));
check('the M0–M2 four lead the catalog', layers.slice(0, 4).map(l => l.id).join(',') === 'terrain,domain,land-value,classification');
check('legend(terrain) → 9 rows', ACKS.hexFillLegend('terrain').length === 9);
check('legend(land-value) → 7 rows', ACKS.hexFillLegend('land-value').length === 7);
check('legend(classification) → 4 rows', ACKS.hexFillLegend('classification').length === 4);
const dleg = ACKS.hexFillLegend('domain', [{ id: 'dom-a', name: 'Alpha' }, { id: 'dom-b', name: 'Beta' }]);
check('legend(domain) → one row per domain + unclaimed', dleg.length === 3 && dleg[dleg.length - 1].label === 'Unclaimed');
check('legend(domain) row color matches hexFillColor', dleg[0].color === ACKS.hexFillColor({ domainId: 'dom-a' }, 'domain'));
check('legend rows all carry {label,color}', ACKS.hexFillLegend('terrain').every(r => r.label && /^#/.test(r.color)));

// ─── adjacency sanity — flat-top hexes tile edge-to-edge ───
section('adjacency (flat-top tiling)');
const cA = ACKS.hexAxialToPixel(0, 0, SIZE);
const cB = ACKS.hexAxialToPixel(1, 0, SIZE);   // E-neighbour column
const dist = Math.hypot(cB.x - cA.x, cB.y - cA.y);
check('adjacent columns are size·√3 apart (centers)', approx(dist, SIZE * SQRT3, 1e-4));
const cC = ACKS.hexAxialToPixel(0, 1, SIZE);   // same column, next row
check('same-column neighbours are size·√3 apart vertically', approx(cC.y - cA.y, SIZE * SQRT3, 1e-4));

// ─── M4 adjacency + edge geometry (domain borders / road networks) ───
section('hexNeighborDeltas + hexEdgePoints (M4)');
const deltas = ACKS.hexNeighborDeltas();
check('6 edge deltas', Array.isArray(deltas) && deltas.length === 6);
check('opposite edges are negated deltas (edge i ↔ edge (i+3)%6)',
  [0,1,2].every(i => deltas[(i+3)%6][0] === -deltas[i][0] && deltas[(i+3)%6][1] === -deltas[i][1]));
check('deltas are the 6 distinct unit axial steps',
  new Set(deltas.map(d => d.join(','))).size === 6);
// the strong invariant: a shared edge has the same two endpoints from both adjacent hexes.
// hex (q,r) edge i is hex (q,r)+delta[i] edge (i+3)%6 — endpoints must coincide (as a set).
const sharedEdgeOK = (() => {
  const q = 2, r = -1;
  for (let i = 0; i < 6; i++) {
    const [dq, dr] = deltas[i];
    const a = ACKS.hexEdgePoints(q, r, SIZE, i);
    const b = ACKS.hexEdgePoints(q + dq, r + dr, SIZE, (i + 3) % 6);
    const key = pts => pts.map(p => Math.round(p.x * 100) + ',' + Math.round(p.y * 100)).sort().join('|');
    if (key(a) !== key(b)) return false;
  }
  return true;
})();
check('a shared edge has identical endpoints from both hexes (borders align, no double-draw)', sharedEdgeOK);
check('hexEdgePoints returns 2 points', ACKS.hexEdgePoints(0, 0, SIZE, 0).length === 2);
check('hexEdgePoints wraps negative/large indices', ACKS.hexEdgePoints(0,0,SIZE,6).length === 2 && ACKS.hexEdgePoints(0,0,SIZE,-1).length === 2);

// ─── M3 settlement glyph ramp + layer catalogs ───
section('settlementGlyphScale + symbol/edge catalogs (M3)');
check('glyph scale is non-decreasing with families', (() => {
  const fams = [0, 50, 100, 500, 1250, 5000, 40000];
  const sizes = fams.map(ACKS.settlementGlyphScale);
  return sizes.every((s, i) => i === 0 || s >= sizes[i-1]);
})());
check('a metropolis glyph is larger than a hamlet glyph', ACKS.settlementGlyphScale(40000) > ACKS.settlementGlyphScale(40));
check('5 symbol layers (settlements/strongholds/lairs/dungeons/pois)', ACKS.mapSymbolLayers().length === 5 && ACKS.mapSymbolLayers()[0].id === 'settlements');
check('4 edge layers (borders/roads/rivers/trails)', ACKS.mapEdgeLayers().length === 4 && ACKS.mapEdgeLayers()[0].id === 'borders');
check('mapTerrainTypes: the 9 ACKS base types, value+label', (() => {
  const tt = ACKS.mapTerrainTypes();
  return tt.length === 9 && tt.every(t => t.value && t.label) && tt.find(t => t.value === 'grassland').label === 'Grassland';
})());
check('mapTerrainTypes values are all recognized by hexFillColor (terrain)', ACKS.mapTerrainTypes().every(t => ACKS.hexFillColor({ terrain: t.value }, 'terrain') !== ACKS.hexFillColor({ terrain: 'lava' }, 'terrain')));

// ─── M6 extra fill layers (population / morale / secured / economy / exploration) ───
section('hexFillColor — M6 layers + ctx');
check('catalog now lists all 9 §4.1 fills', ACKS.hexFillLayers().length === 9);
// secured (per-domain via ctx)
const secCtx = { securedStateByDomain: { 'dom-a': 'adequate', 'dom-b': 'critical' } };
check('secured: adequate vs critical differ', ACKS.hexFillColor({ domainId:'dom-a' }, 'secured', secCtx) !== ACKS.hexFillColor({ domainId:'dom-b' }, 'secured', secCtx));
check('secured: unclaimed → neutral grey', ACKS.hexFillColor({ domainId:null }, 'secured', secCtx) === ACKS.hexFillColor({}, 'domain'));
check('secured: missing ctx entry → neutral', /^#[0-9a-f]{6}$/i.test(ACKS.hexFillColor({ domainId:'dom-z' }, 'secured', secCtx)));
// morale (diverging via ctx)
const morCtx = { moraleByDomain: { 'dom-a': 4, 'dom-b': -4, 'dom-c': 0 } };
check('morale: +4, 0, −4 are three distinct colours', new Set(['dom-a','dom-b','dom-c'].map(id => ACKS.hexFillColor({ domainId:id }, 'morale', morCtx))).size === 3);
check('morale: clamps out-of-range', ACKS.hexFillColor({ domainId:'x' }, 'morale', { moraleByDomain:{ x:99 } }) === ACKS.hexFillColor({ domainId:'y' }, 'morale', { moraleByDomain:{ y:4 } }));
// population (families / classification ceiling)
check('population: at-ceiling darker than low', ACKS.hexFillColor({ families:780, classification:'Civilized' }, 'population') !== ACKS.hexFillColor({ families:40, classification:'Civilized' }, 'population'));
check('population: 0 families → neutral', ACKS.hexFillColor({ families:0, classification:'Civilized' }, 'population') === ACKS.hexFillColor({}, 'land-value'));
check('population: same ratio, different ceiling → same bucket (375/borderlands ≈ 780/civilized)', ACKS.hexFillColor({ families:375, classification:'Borderlands' }, 'population') === ACKS.hexFillColor({ families:780, classification:'Civilized' }, 'population'));
// economy + exploration (hex-only)
check('economy: agricultural vs mining differ', ACKS.hexFillColor({ economyType:'agricultural' }, 'economy') !== ACKS.hexFillColor({ economyType:'mining' }, 'economy'));
check('exploration: explored vs unexplored differ', ACKS.hexFillColor({ explored:true }, 'exploration') !== ACKS.hexFillColor({ explored:false }, 'exploration'));
check('legends present for all new layers', ['population','morale','secured','economy','exploration'].every(L => ACKS.hexFillLegend(L).length >= 2));
check('ctx is optional — hex-only layers ignore it', ACKS.hexFillColor({ terrain:'forest' }, 'terrain') === ACKS.hexFillColor({ terrain:'forest' }, 'terrain', undefined));

// ─────────────────────────────────────────────────────────────────────────
console.log('--- Summary ---');
console.log('  Passed: ' + passed);
console.log('  Failed: ' + failed);
if(failed === 0){
  console.log('\nAll Map Mode (Phase 2.5 #225 — M0–M6) smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nSome checks failed. Review output above.');
  process.exit(1);
}
