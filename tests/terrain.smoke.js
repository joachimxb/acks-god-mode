/* tests/terrain.smoke.js — Phase 2.5 Terrain Model (Phase_2.5_Terrain_Model_Plan.md), T1.
 *
 *   node tests/terrain.smoke.js   (or via `npm test`)
 *
 * T1 = the four-VALUE terrain taxonomy + resolution layer (stacked on Monster Persistence M1):
 *   - 3 additive hex fields (terrainSubtype / koppen / biomeOverride) on blankHex; biome is DERIVED.
 *   - catalogs: TERRAIN_BASES, TERRAIN_SUBTYPES, BIOMES, KOPPEN_CLIMATE (the JJ p.40 30-code table).
 *   - resolution helpers: terrainBase (folds both legacy alias maps), terrainKey, biomeFromKoppen,
 *     koppenSuggestions, biomeForHex, visibilityFactorForHex (RR p.275), encounterTerrainForHex.
 *   - lairDiceForHex(hex) — sub-type-aware lair dice (closes the M1 default gap); seedHexLairs reads it.
 * The Köppen-led hex creator UI is T2 (browser-verified, index.html).
 */
'use strict';
const path = require('path');
const DIR = path.join(__dirname, '..');
[
  'acks-engine-catalogs.js', 'acks-engine.js', 'acks-engine-entities.js', 'acks-engine-economy.js',
  'acks-engine-entity-registry.js', 'acks-engine-field-schemas.js', 'acks-engine-events.js', 'acks-engine-battles.js', 'acks-engine-subsystems.js',
].forEach(f => require(path.join(DIR, f)));
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail) { if (cond) { pass++; } else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t) { console.log('\n— ' + t); }
function sameSpec(a, b) { return a && b && a.n === b.n && a.d === b.d && a.mod === b.mod; }

// =============================================================================
section('catalogs — taxonomy shape');
{
  ok('TERRAIN_BASES has 10', Array.isArray(ACKS.TERRAIN_BASES) && ACKS.TERRAIN_BASES.length === 10);
  ok('bases are the canonical 10', ['barrens','desert','forest','grassland','hills','jungle','mountains','scrubland','swamp','water'].every(b => ACKS.TERRAIN_BASES.indexOf(b) >= 0));
  // every TERRAIN_SUBTYPES key is a base; jungle + water have none
  ok('TERRAIN_SUBTYPES keyed by bases', Object.keys(ACKS.TERRAIN_SUBTYPES).every(k => ACKS.TERRAIN_BASES.indexOf(k) >= 0));
  ok('jungle has no sub-types', ACKS.TERRAIN_SUBTYPES.jungle.length === 0);
  ok('water has no sub-types', ACKS.TERRAIN_SUBTYPES.water.length === 0);
  ok('mountains: forested/rocky/snowy/volcanic', ['forested','rocky','snowy','volcanic'].every(s => ACKS.TERRAIN_SUBTYPES.mountains.indexOf(s) >= 0));
  ok('swamp: scrubby/forested (RR p.275)', ['scrubby','forested'].every(s => ACKS.TERRAIN_SUBTYPES.swamp.indexOf(s) >= 0));
  ok('grassland: farm/savanna/steppe', ['farm','savanna','steppe'].every(s => ACKS.TERRAIN_SUBTYPES.grassland.indexOf(s) >= 0));
  // allTerrainSubtypes() — the deduped, sorted union the authoring controls offer when terrain is unset
  const allSubs = ACKS.allTerrainSubtypes();
  ok('allTerrainSubtypes is an array', Array.isArray(allSubs) && allSubs.length > 0);
  ok('allTerrainSubtypes deduped', new Set(allSubs).size === allSubs.length);
  ok('allTerrainSubtypes sorted', allSubs.slice().sort().join(',') === allSubs.join(','));
  ok('allTerrainSubtypes covers every base subtype', ACKS.TERRAIN_BASES.every(b => (ACKS.TERRAIN_SUBTYPES[b] || []).every(s => allSubs.indexOf(s) >= 0)));
  ok('allTerrainSubtypes ⊆ some base', allSubs.every(s => ACKS.TERRAIN_BASES.some(b => (ACKS.TERRAIN_SUBTYPES[b] || []).indexOf(s) >= 0)));
  ok('forested (shared by mtn/swamp/hills) appears once', allSubs.filter(s => s === 'forested').length === 1);
  ok('BIOMES has 10', Array.isArray(ACKS.BIOMES) && ACKS.BIOMES.length === 10);
}

section('catalogs — Köppen (JJ p.40), 30 codes, all consistent');
{
  const codes = Object.keys(ACKS.KOPPEN_CLIMATE);
  ok('30 Köppen codes', codes.length === 30, 'got ' + codes.length);
  let biomeOk = true, terrOk = true, subOk = true;
  for (const c of codes) {
    const row = ACKS.KOPPEN_CLIMATE[c];
    if (ACKS.BIOMES.indexOf(row.biome) < 0) { biomeOk = false; }
    if (!Array.isArray(row.suggestions) || !row.suggestions.length) { terrOk = false; continue; }
    for (const s of row.suggestions) {
      if (ACKS.TERRAIN_BASES.indexOf(s.terrain) < 0) terrOk = false;
      if (s.subtype && (ACKS.TERRAIN_SUBTYPES[s.terrain] || []).indexOf(s.subtype) < 0) subOk = false;
    }
  }
  ok('every Köppen biome ∈ BIOMES', biomeOk);
  ok('every suggested terrain ∈ TERRAIN_BASES', terrOk);
  ok('every suggested subtype ∈ that base TERRAIN_SUBTYPES', subOk);
  ok('Csb + Dfd carry two suggestions (the "or" codes)', ACKS.KOPPEN_CLIMATE.Csb.suggestions.length === 2 && ACKS.KOPPEN_CLIMATE.Dfd.suggestions.length === 2);
}

section('terrainBase — the single normalizer (folds both alias maps)');
{
  ok('canonical base passes through', ACKS.terrainBase('forest') === 'forest');
  ok('compound base-subtype → base', ACKS.terrainBase('forest-taiga') === 'forest' && ACKS.terrainBase('mountains-volcanic') === 'mountains');
  ok('HEX alias: plains → grassland', ACKS.terrainBase('plains') === 'grassland');
  ok('HEX alias: woods → forest', ACKS.terrainBase('woods') === 'forest');
  ok('HEX alias: tundra → barrens', ACKS.terrainBase('tundra') === 'barrens');
  ok('HEX alias: sea → water', ACKS.terrainBase('sea') === 'water');
  ok('HEX alias: rainforest → jungle', ACKS.terrainBase('rainforest') === 'jungle');
  ok('LAIR alias compound: prairie → grassland', ACKS.terrainBase('prairie') === 'grassland');
  ok('case + whitespace tolerant', ACKS.terrainBase('  Mountains  ') === 'mountains');
  ok('empty → ""', ACKS.terrainBase('') === '' && ACKS.terrainBase(null) === '');
  ok('unknown → ""', ACKS.terrainBase('xyzzy') === '');
}

section('terrainKey — the lair/encounter compound key');
{
  ok('base only', ACKS.terrainKey({ terrain: 'forest' }) === 'forest');
  ok('base + subtype → compound', ACKS.terrainKey({ terrain: 'mountains', terrainSubtype: 'volcanic' }) === 'mountains-volcanic');
  ok('alias base + subtype', ACKS.terrainKey({ terrain: 'plains', terrainSubtype: 'savanna' }) === 'grassland-savanna');
  ok('blank subtype → base', ACKS.terrainKey({ terrain: 'hills', terrainSubtype: '' }) === 'hills');
  ok('unknown → ""', ACKS.terrainKey({ terrain: 'xyzzy' }) === '');
}

section('biome derivation (Köppen → biome; override wins)');
{
  ok('biomeFromKoppen Af → Rainforest', ACKS.biomeFromKoppen('Af') === 'Rainforest');
  ok('biomeFromKoppen BWh → Desert', ACKS.biomeFromKoppen('BWh') === 'Desert');
  ok('biomeFromKoppen Cfc → Taiga', ACKS.biomeFromKoppen('Cfc') === 'Taiga');
  ok('biomeFromKoppen Dfa → Prairie', ACKS.biomeFromKoppen('Dfa') === 'Prairie');
  ok('biomeFromKoppen ET → Tundra', ACKS.biomeFromKoppen('ET') === 'Tundra');
  ok('biomeFromKoppen unknown → ""', ACKS.biomeFromKoppen('zz') === '' && ACKS.biomeFromKoppen('') === '');
  ok('koppenSuggestions Af → [{jungle,""}]', (() => { const s = ACKS.koppenSuggestions('Af'); return s.length === 1 && s[0].terrain === 'jungle' && s[0].subtype === ''; })());
  ok('koppenSuggestions Csb → 2', ACKS.koppenSuggestions('Csb').length === 2);
  ok('biomeForHex derives from koppen', ACKS.biomeForHex({ koppen: 'Af' }) === 'Rainforest');
  ok('biomeForHex override wins', ACKS.biomeForHex({ koppen: 'Af', biomeOverride: 'Tundra' }) === 'Tundra');
  ok('biomeForHex override alone', ACKS.biomeForHex({ biomeOverride: 'Steppe' }) === 'Steppe');
  ok('biomeForHex empty → ""', ACKS.biomeForHex({}) === '');
}

section('visibilityFactorForHex (RR p.275)');
{
  ok('jungle = 0.5', ACKS.visibilityFactorForHex({ terrain: 'jungle' }) === 0.5);
  ok('forested mountain = 0.5', ACKS.visibilityFactorForHex({ terrain: 'mountains', terrainSubtype: 'forested' }) === 0.5);
  ok('forested swamp = 0.5', ACKS.visibilityFactorForHex({ terrain: 'swamp', terrainSubtype: 'forested' }) === 0.5);
  ok('scrubby swamp = 0.67', ACKS.visibilityFactorForHex({ terrain: 'swamp', terrainSubtype: 'scrubby' }) === 0.67);
  ok('forested hills = 0.67', ACKS.visibilityFactorForHex({ terrain: 'hills', terrainSubtype: 'forested' }) === 0.67);
  ok('barrens = 0.67', ACKS.visibilityFactorForHex({ terrain: 'barrens' }) === 0.67);
  ok('desert = 0.67', ACKS.visibilityFactorForHex({ terrain: 'desert' }) === 0.67);
  ok('forest = 0.67', ACKS.visibilityFactorForHex({ terrain: 'forest' }) === 0.67);
  ok('grassland = 1 (full)', ACKS.visibilityFactorForHex({ terrain: 'grassland' }) === 1);
  ok('rocky mountains = 1 (not forested)', ACKS.visibilityFactorForHex({ terrain: 'mountains', terrainSubtype: 'rocky' }) === 1);
  ok('plain swamp = 1', ACKS.visibilityFactorForHex({ terrain: 'swamp' }) === 1);
}

section('encounterTerrainForHex (sub-table key + river overlay)');
{
  ok('compound key', ACKS.encounterTerrainForHex({ terrain: 'forest', terrainSubtype: 'taiga' }) === 'forest-taiga');
  ok('base only', ACKS.encounterTerrainForHex({ terrain: 'hills' }) === 'hills');
  ok('river over desert → desert-jungle overlay', ACKS.encounterTerrainForHex({ terrain: 'desert', riverSides: [1] }) === 'river-desert-jungle');
  ok('river over jungle → desert-jungle overlay', ACKS.encounterTerrainForHex({ terrain: 'jungle', riverSides: [0, 2] }) === 'river-desert-jungle');
  ok('river over grassland → temperate overlay', ACKS.encounterTerrainForHex({ terrain: 'grassland', riverSides: [3] }) === 'river-temperate');
  ok('empty riverSides → no overlay', ACKS.encounterTerrainForHex({ terrain: 'grassland', riverSides: [] }) === 'grassland');
}

section('lairDiceForHex — sub-type-aware lair dice (closes the M1 gap)');
{
  // base default matches M1's lairDiceForTerrain
  ok('desert base default == lairDiceForTerrain(desert)', sameSpec(ACKS.lairDiceForHex({ terrain: 'desert' }).spec, ACKS.lairDiceForTerrain('desert').spec));
  ok('desert + rocky → 1d2', sameSpec(ACKS.lairDiceForHex({ terrain: 'desert', terrainSubtype: 'rocky' }).spec, { n: 1, d: 2, mod: 0 }));
  ok('desert + sandy → 1d4', sameSpec(ACKS.lairDiceForHex({ terrain: 'desert', terrainSubtype: 'sandy' }).spec, { n: 1, d: 4, mod: 0 }));
  ok('scrubland + sparse → scrubland-sparse 1d2', sameSpec(ACKS.lairDiceForHex({ terrain: 'scrubland', terrainSubtype: 'sparse' }).spec, { n: 1, d: 2, mod: 0 }));
  ok('scrubland + low (RAW synonym) → scrubland-sparse 1d2', sameSpec(ACKS.lairDiceForHex({ terrain: 'scrubland', terrainSubtype: 'low' }).spec, { n: 1, d: 2, mod: 0 }));
  ok('scrubland + dense → 2d4', sameSpec(ACKS.lairDiceForHex({ terrain: 'scrubland', terrainSubtype: 'dense' }).spec, { n: 2, d: 4, mod: 0 }));
  ok('mountains + forested → 2d4', sameSpec(ACKS.lairDiceForHex({ terrain: 'mountains', terrainSubtype: 'forested' }).spec, { n: 2, d: 4, mod: 0 }));
  ok('mountains + rocky → 1d4+1', sameSpec(ACKS.lairDiceForHex({ terrain: 'mountains', terrainSubtype: 'rocky' }).spec, { n: 1, d: 4, mod: 1 }));
  ok('mountains + snowy → mountains-snowy 1d4+1 (RAW rocky/snowy row, now explicit)', sameSpec(ACKS.lairDiceForHex({ terrain: 'mountains', terrainSubtype: 'snowy' }).spec, { n: 1, d: 4, mod: 1 }));
  ok('mountains + volcanic → mountains-volcanic 1d4+1 (🔧 matched to rocky/snowy)', sameSpec(ACKS.lairDiceForHex({ terrain: 'mountains', terrainSubtype: 'volcanic' }).spec, { n: 1, d: 4, mod: 1 }));
  ok('grassland + steppe → 1d3-1', sameSpec(ACKS.lairDiceForHex({ terrain: 'grassland', terrainSubtype: 'steppe' }).spec, { n: 1, d: 3, mod: -1 }));
  ok('grassland + savanna → grassland-savanna 1d3 (🔧 matched to farm/prairie)', sameSpec(ACKS.lairDiceForHex({ terrain: 'grassland', terrainSubtype: 'savanna' }).spec, { n: 1, d: 3, mod: 0 }));
  ok('hills + forested → 2d4', sameSpec(ACKS.lairDiceForHex({ terrain: 'hills', terrainSubtype: 'forested' }).spec, { n: 2, d: 4, mod: 0 }));
  // every RAW-split-base sub-type resolves to its OWN explicit key (not a silent fallback) …
  ok('mountains-snowy is an explicit key', ACKS.lairDiceForTerrain('mountains-snowy').key === 'mountains-snowy');
  ok('grassland-savanna is an explicit key', ACKS.lairDiceForTerrain('grassland-savanna').key === 'grassland-savanna');
  ok('mountains-volcanic is an explicit key', ACKS.lairDiceForTerrain('mountains-volcanic').key === 'mountains-volcanic');
  ok('scrubland-sparse is an explicit key', ACKS.lairDiceForTerrain('scrubland-sparse').key === 'scrubland-sparse');
  // … while a RAW "(any)" base's sub-types correctly fall back to the single base row.
  ok('barrens + tundra → barrens (RAW any) 1d4', ACKS.lairDiceForHex({ terrain: 'barrens', terrainSubtype: 'tundra' }).key === 'barrens');
  ok('forest + taiga → forest (RAW any) 2d4', ACKS.lairDiceForHex({ terrain: 'forest', terrainSubtype: 'taiga' }).key === 'forest');
  ok('swamp + forested → swamp (RAW any) 2d4+1', ACKS.lairDiceForHex({ terrain: 'swamp', terrainSubtype: 'forested' }).key === 'swamp');
  // every TERRAIN_SUBTYPES token resolves to a non-null spec for its base (no expressible gap).
  ok('every (base,subtype) resolves', ACKS.TERRAIN_BASES.every(b => (ACKS.TERRAIN_SUBTYPES[b] || []).every(s => ACKS.lairDiceForHex({ terrain: b, terrainSubtype: s }) !== null) || b === 'water'));
  ok('alias terrain (plains) → grassland 1d3', sameSpec(ACKS.lairDiceForHex({ terrain: 'plains' }).spec, { n: 1, d: 3, mod: 0 }));
  ok('alias terrain (tundra) → barrens 1d4 (broadened via terrainBase; was unknown to M1 lairDiceForTerrain)', sameSpec(ACKS.lairDiceForHex({ terrain: 'tundra' }).spec, { n: 1, d: 4, mod: 0 }));
  ok('water → zero spec', ACKS.lairDiceForHex({ terrain: 'water' }).spec.n === 0);
  ok('unknown terrain → null', ACKS.lairDiceForHex({ terrain: 'xyzzy' }) === null);
  ok('null hex → null', ACKS.lairDiceForHex(null) === null);
}

section('seedHexLairs reads the hex sub-type (RAW-correct count)');
{
  // a mountains+rocky hex (1d4+1) vs a bare-mountains hex both seed via the hex's own dice;
  // with rng=()=>0 the roll is n*1 + mod, so rocky mountains 1d4+1 → 1*1+1 = 2.
  const camp = ACKS.blankCampaign ? ACKS.blankCampaign() : { hexes: [], lairs: [], currentTurn: 1 };
  if (!Array.isArray(camp.hexes)) camp.hexes = [];
  if (!Array.isArray(camp.lairs)) camp.lairs = [];
  const hx = ACKS.blankHex({ id: 'hex-mtn', terrain: 'mountains', terrainSubtype: 'forested' });
  camp.hexes.push(hx);
  const seeded = ACKS.seedHexLairs(camp, 'hex-mtn', { rng: () => 0 });
  // forested mountains = 2d4 → 2*1 = 2 lairs at rng()=0
  ok('forested-mountains seeds 2 (2d4 @ min)', seeded.length === 2, 'got ' + seeded.length);
  ok('seeded lairs are unknown shells', seeded.every(l => l.status === 'unknown'));
  ok('seeded lairs bound to the hex', seeded.every(l => l.hexId === 'hex-mtn'));
}

section('blankHex — the 3 additive axes');
{
  const h = ACKS.blankHex();
  ok('terrainSubtype defaults ""', h.terrainSubtype === '');
  ok('koppen defaults ""', h.koppen === '');
  ok('biomeOverride defaults ""', h.biomeOverride === '');
  ok('terrain unchanged (still "")', h.terrain === '');
  const h2 = ACKS.blankHex({ terrain: 'mountains', terrainSubtype: 'volcanic', koppen: 'Af' });
  ok('opts pass through', h2.terrainSubtype === 'volcanic' && h2.koppen === 'Af');
  ok('biomeForHex on a fresh authored hex derives', ACKS.biomeForHex(h2) === 'Rainforest');
}

section('hexName — sub-type shows in the name; unset is omitted (canonical hexName, Architecture §11.3.1)');
{
  ok('terrain + sub-type → "Barrens (tundra) (0000)"', ACKS.hexName({ terrain: 'barrens', terrainSubtype: 'tundra', coord: { q: 0, r: 0 } }) === 'Barrens (tundra) (0000)');
  ok('forest + taiga', ACKS.hexName({ terrain: 'forest', terrainSubtype: 'taiga', coord: { q: 0, r: 0 } }) === 'Forest (taiga) (0000)');
  ok('unset sub-type omitted', ACKS.hexName({ terrain: 'barrens', coord: { q: 0, r: 0 } }) === 'Barrens (0000)');
  ok('empty-string sub-type omitted', ACKS.hexName({ terrain: 'barrens', terrainSubtype: '', coord: { q: 0, r: 0 } }) === 'Barrens (0000)');
  ok('settlement wins — no sub-type shown', ACKS.hexName({ terrain: 'barrens', terrainSubtype: 'tundra', settlement: { name: 'Keep' }, coord: { q: 0, r: 0 } }) === 'Keep (0000)');
}

// =============================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — terrain.smoke.js: ' + pass + ' passed, ' + fail + ' failed.');
if (fail) { console.log('Failures:\n  ' + failures.join('\n  ')); process.exit(1); }
