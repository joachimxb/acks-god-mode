// outputs/build_encounter_tables.js — extract the JJ wilderness identity tables and EMIT the
// engine module acks-engine-encounter-tables.js (#476 E4, per Joachim 2026-06-11: "the system
// should roll on the appropriate tables automatically as per RAW").
//
// SOURCE OF TRUTH: the JJ PDF via `pdftotext -table` (positional grid reconstruction). The
// markdown rulebook's conversion of these tables SMEARS columns by a row in places (verified:
// MD Desert rare 03-04 reads "Attercop, Monstrous" where the print has "Attercop, Hideous")
// and DROPS tail rows (Desert + Scrubland Dense lost 99-100) — so the MD is used only as a
// cross-check report, never as the source.
//
// Tables: Civilized Encounter by Terrain Type (printed p.43, 8 columns × 20 rows) + the 18
// Monster Encounter by Terrain Type and Rarity tables (printed pp.45–62, 4 rarity columns ×
// 50 rows each). Labels are kept verbatim (species parentheticals included); each cell is
// resolved to a MONSTER_CATALOG key at BUILD time (alias layer below); cells whose monster
// the catalog excludes (Dragon, Genie, …) keep key:null — the GM identifies the specifics.
//
// Working artifact (outputs/ gitignored); the EMITTED module IS committed.
'use strict';
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// audit A7 (2026-06-24): generator moved outputs/ → tools/build/ (now two levels below the
// repo root). Anchors keep the paths readable from the new depth.
const REPO = path.resolve(__dirname, '..', '..');           // the "ACKS God Mode/" repo root
const SOURCES = path.resolve(REPO, '..', 'ACKS Sources');   // DEV-root RAW PDFs/MDs — NOT in the repo
                                                            // (§13.6 IP). This generator is maintainer-run, not CI.

// Load the (freshly regenerated) catalog for key resolution.
global.window = global;
require(path.resolve(REPO, 'acks-engine-catalogs.js'));
require(path.resolve(REPO, 'acks-engine-monsters.js'));
const ACKS = global.ACKS;

const PDF = path.resolve(SOURCES, 'ACKSII_Judges_Journal_DIGITAL_FINAL_r9_2nd_Printing.pdf');
const MD = path.resolve(SOURCES, 'ACKS-II-Judges-Journal.md');
const PAGE_OFFSET = 2; // physical = printed + 2

function pageText(physical) {
  return execSync(`pdftotext -table -enc UTF-8 -f ${physical} -l ${physical} "${PDF}" -`, { encoding: 'utf8' });
}

// ─── label → catalog key resolution ─────────────────────────────────────────
// Family prefixes the MM folds into the variant name ("Man, Bandit" is catalogued "Bandit").
const FAMILY_DROP = /^(man|beastman|lycan\.?|lycanthrope|equine|swarm|varmint)$/i;
// Abbreviation expansions seen in the printed cells.
function expand(s) {
  return s
    .replace(/\bV\.\s*Large\b/gi, 'Very Large').replace(/\bV\.\s*Lge\.\s*/gi, 'Very Large ')
    .replace(/\bLg\.\s*/gi, 'Large ').replace(/\bMed\.\s*/gi, 'Medium ').replace(/\bSm\.\s*/gi, 'Small ')
    .replace(/\bConstrict(?:ing)?\.\s*/gi, 'Constricting ').replace(/\bConst\.\s*/gi, 'Constricting ');
}
function kebab(s) {
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')             // Báleygr → baleygr
    .toLowerCase().replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
// Explicit label → key aliases, applied AFTER parenthetical-strip + expand. Three classes:
//  (a) the JJ notes' regional cosmetic replacements ("the zebra has the characteristics of the
//      light horse") — each mapping is the PRINTED note under its table, not invention;
//  (b) family-name inversions the candidate generator can't guess;
//  (c) null = expected-unresolved (the catalog's excluded variable/multi-form monsters —
//      Dragon, Genie, fire Elementals, Sphinx) — the cell keeps its label, GM details.
// A '<tableKey>|<label>' entry overrides per table (the print maps the same name differently:
// farmland's adder is a king cobra, the river table's adder is a viper).
const LABEL_ALIASES = {
  // (a) regional cosmetics, per the printed table notes
  'Snake, Black Desert Cobra': 'king-cobra', 'Snake, Giant Sand Boa': 'python-snake',
  'Snake, Giant Smooth': 'python-snake', 'Snake, Giant Steppe Ratsnake': 'python-snake',
  'Snake, Giant Adder': 'king-cobra', 'Snake, Blunt-Nosed Viper': 'king-cobra',
  'Snake, Gaboon Viper': 'king-cobra', 'Snake, Green Mamba': 'king-cobra',
  'Snake, Forest Cobra': 'spitting-cobra-snake',
  'Snake, Asp': 'viper-snake', 'Snake, Puff Adder': 'viper-snake',
  'grassland-farmland-prairie|Snake, Adder': 'king-cobra',
  'river-temperate|Snake, Adder': 'viper-snake',
  'Dog, Freight': 'war-dog', 'Dog, Sled': 'hunting-dog',
  'Faerie, Rusalka': 'nixie', 'Zebra': 'light-horse',
  'Varmint, Giant Birch Mouse': 'giant-rat', 'Varmint, Giant Snow Vole': 'giant-rat',
  'Varmint, Giant Stoat': 'giant-weasel', 'Varmint, Giant Wolverine': 'giant-weasel',
  'Swarm, Army Ant': 'insect-swarm', 'Swarm, Bee': 'insect-swarm', 'Swarm, Black Fly': 'insect-swarm',
  'Swarm, Blackfly': 'insect-swarm', 'Swarm, Dragonfly': 'insect-swarm', 'Swarm, Fire Ant': 'insect-swarm',
  'Swarm, Locust': 'insect-swarm', 'Swarm, Mayfly': 'insect-swarm', 'Swarm, Mosquito': 'insect-swarm',
  'Swarm, Red Fire Ant': 'insect-swarm', 'Swarm, Termite': 'insect-swarm', 'Swarm, Tsetse Fly': 'insect-swarm',
  'Swarm, Wasp': 'insect-swarm', 'Swarm, Quelea': 'bat-swarm',
  // (b) family-name inversions / MM-entry renames
  'Ant, Giant': 'giant-ant-worker', 'Bee, Giant Killer': 'worker-bee', 'Bee. Giant': 'worker-bee',
  'Beetle, Giant Bombardier': 'bombardier-beetle', 'Beetle, Giant Luminous': 'luminous-beetle',
  'Beetle, Giant Tiger': 'tiger-beetle', 'Cat, Saber-Tooth': 'saber-tooth-tiger',
  'Lizard, Giant Horned': 'giant-horned-chameleon',
  'Rhinoceros, Common': 'common-rhino', 'Rhinoceros, Woolly': 'woolly-rhino',
  'Equine, Horse': 'light-horse',
  // (c) expected-unresolved (excluded variable/multi-form monsters)
  'Genie': null, 'Sphinx': null, 'Mold, Mustard': null,
  'Dragon, Black': null, 'Dragon, Blue': null, 'Dragon, Brown': null, 'Dragon, Green': null,
  'Dragon, Metallic': null, 'Dragon, Red': null, 'Dragon, Sea': null, 'Dragon, White': null, 'Dragon, Wyrm': null,
  'Elemental, Petty Fire': null, 'Elemental, Minor Fire': null, 'Elemental, Major Fire': null, 'Elemental, Supreme Fire': null
};
function resolveKey(rawLabel, tableKey) {
  let s = String(rawLabel).replace(/\*+/g, '').trim();           // footnote asterisks (cosmetic replacements)
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim(); // species/dice parentheticals: display-only
  s = expand(s).replace(/\s+$/, '').trim();
  if (tableKey && Object.prototype.hasOwnProperty.call(LABEL_ALIASES, tableKey + '|' + s)) return LABEL_ALIASES[tableKey + '|' + s];
  if (Object.prototype.hasOwnProperty.call(LABEL_ALIASES, s)) return LABEL_ALIASES[s];
  const candidates = [];
  const m = s.match(/^([^,]+),\s*(.+)$/);
  if (m) {
    const fam = m[1].trim(), variant = m[2].trim();
    candidates.push(kebab(variant + ' ' + fam));                 // "Wolf, Dire" → dire-wolf
    if (FAMILY_DROP.test(fam)) candidates.push(kebab(variant));  // "Man, Bandit" → bandit
    candidates.push(kebab(variant));                             // "Beastman, Orc" → orc (generic fallback)
    candidates.push(kebab(fam + ' ' + variant));
    if (/^swarm$/i.test(fam)) candidates.push(kebab(variant + ' swarm'));
    if (/^varmint$/i.test(fam)) candidates.push(kebab(variant)); // "Varmint, Giant Rat" → giant-rat
  }
  candidates.push(kebab(s));
  candidates.push(kebab(s).replace(/s$/, ''));                   // "Neanderthals" → neanderthal
  for (const c of candidates) {
    if (!c) continue;
    const hit = ACKS.findMonster(c);
    if (hit) return hit.key;
  }
  return undefined; // unresolved — reported below
}

// ─── PDF table parsing ───────────────────────────────────────────────────────
const SIDEBAR_RE = /\s{2,}Adventures\s*$/;        // the chapter running-header lands wherever
const SIDEBAR_LEAD_RE = /^\s*Adventures\s{2,}/;   // x-sorting puts it — strip both edges
function parseDataRows(text, pageNo, expectCols) {
  const rows = [];
  const oddities = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(SIDEBAR_RE, '').replace(SIDEBAR_LEAD_RE, '').replace(/\s+$/, '');
    const m = line.match(/^\s*(\d{1,3})-(\d{1,3})\s{2,}(.*)$/);
    if (!m) continue; // non-row lines (headers, notes prose, watermark) — contiguity asserts catch any dropped row
    const lo = +m[1], hi = +m[2];
    const cells = m[3].split(/\s{2,}/).map(c => c.trim()).filter(Boolean);
    if (cells.length !== expectCols) {
      oddities.push(`p.${pageNo} row ${lo}-${hi}: ${cells.length} cells — ${JSON.stringify(cells)}`);
    }
    rows.push({ lo, hi, cells });
  }
  return { rows, oddities };
}
function assertContiguous(rows, label) {
  let prev = 0;
  for (const r of rows) {
    if (r.lo !== prev + 1) throw new Error(`${label}: gap before ${r.lo}-${r.hi} (prev ended ${prev})`);
    prev = r.hi;
  }
  if (prev !== 100) throw new Error(`${label}: ends at ${prev}, not 100`);
}

// ─── 1. The 18 monster tables (physical 47–64) ──────────────────────────────
const MONSTER_TABLE_KEYS = {
  'Barrens (Rocky/Sandy)': 'barrens-rocky-sandy',
  'Barrens (Tundra)': 'barrens-tundra',
  'Desert (Any)': 'desert-any',
  'Grassland (Farmland/Prairie)': 'grassland-farmland-prairie',
  'Grassland (Savannah)': 'grassland-savannah',
  'Forest (Deciduous)': 'forest-deciduous',
  'Forest (Taiga)': 'forest-taiga',
  'Grassland (Steppe)': 'grassland-steppe',
  'Hills (Any)': 'hills-any',
  'Jungle (Any)': 'jungle-any',
  'Mountains (Forested/Rocky)': 'mountains-forested-rocky',
  'Mountains (Snowy)': 'mountains-snowy',
  'Mountains (Volcanic)': 'mountains-volcanic',
  'River (Any but Desert or Jungle)': 'river-temperate',
  'River (Desert and Jungle)': 'river-desert-jungle',
  'Scrubland (Sparse)': 'scrubland-sparse',
  'Scrubland (Dense)': 'scrubland-dense',
  'Swamp (Any)': 'swamp-any'
};
const RARITIES = ['common', 'uncommon', 'rare', 'very-rare'];
const monsterTables = {}; // tableKey → { name, page, columns: { rarity: [{lo,hi,label,key}] } }
const allOddities = [];
const unresolved = new Map(); // cleaned label → [where]

for (let physical = 47; physical <= 64; physical++) {
  const text = pageText(physical);
  const printed = physical - PAGE_OFFSET;
  const headMatch = text.match(/Monster Encounter by Terrain Type and Rarity\s*-\s*(.+)/);
  if (!headMatch) throw new Error(`physical ${physical}: no table heading found`);
  const name = headMatch[1].trim().replace(/\s+/g, ' ');
  const tableKey = MONSTER_TABLE_KEYS[name];
  if (!tableKey) throw new Error(`physical ${physical}: unmapped table name "${name}"`);
  const { rows, oddities } = parseDataRows(text, printed, 4);
  oddities.forEach(o => allOddities.push(`[${tableKey}] ${o}`));
  assertContiguous(rows, tableKey);
  if (rows.length !== 50) throw new Error(`${tableKey}: ${rows.length} rows (expected 50)`);
  const columns = { 'common': [], 'uncommon': [], 'rare': [], 'very-rare': [] };
  for (const r of rows) {
    if (r.cells.length !== 4) continue; // already reported as oddity; patched manually if real
    r.cells.forEach((label, i) => {
      const key = resolveKey(label, tableKey);
      if (key === undefined) {
        const clean = expand(label.replace(/\*+/g, '').replace(/\s*\([^)]*\)\s*/g, ' ')).replace(/\s+/g, ' ').trim();
        if (!unresolved.has(clean)) unresolved.set(clean, []);
        unresolved.get(clean).push(`${tableKey}/${RARITIES[i]} ${r.lo}-${r.hi}`);
      }
      columns[RARITIES[i]].push({ lo: r.lo, hi: r.hi, label, key: key === undefined ? null : key });
    });
  }
  // merge consecutive identical labels into wider ranges
  for (const rar of RARITIES) {
    const merged = [];
    for (const cell of columns[rar]) {
      const last = merged[merged.length - 1];
      if (last && last.label === cell.label && last.hi === cell.lo - 1) last.hi = cell.hi;
      else merged.push({ ...cell });
    }
    columns[rar] = merged;
  }
  monsterTables[tableKey] = { name, page: printed, columns };
}

// ─── 2. The civilized table (physical 45, two stacked 4-column blocks) ───────
const CIV_COLUMNS = [
  { key: 'arid', name: 'Barrens (rocky, sandy), Desert (any), River (desert)' },
  { key: 'temperate', name: 'Grassland (farm, prairie, steppe), Scrubland (sparse), River' },
  { key: 'savanna', name: 'Grassland (savanna), River (jungle)' },
  { key: 'forest', name: 'Forest (deciduous), Scrublands (dense)' },
  { key: 'taiga', name: 'Forest (taiga)' },
  { key: 'hills-mountains', name: 'Hills (any), Mountains (any)' },
  { key: 'jungle', name: 'Jungle (any)' },
  { key: 'swamp', name: 'Swamp (any)' }
];
const civText = pageText(45);
const civParsed = parseDataRows(civText, 43, 4);
civParsed.oddities.forEach(o => allOddities.push(`[civilized] ${o}`));
if (civParsed.rows.length !== 40) throw new Error(`civilized: ${civParsed.rows.length} rows (expected 40 = 2 blocks × 20)`);
const civBlocks = [civParsed.rows.slice(0, 20), civParsed.rows.slice(20)];
civBlocks.forEach((b, i) => assertContiguous(b, `civilized block ${i + 1}`));
const civColumns = {}; // columnKey → { name, rows: [{lo,hi,label,key}] }
civBlocks.forEach((block, bi) => {
  for (let ci = 0; ci < 4; ci++) {
    const def = CIV_COLUMNS[bi * 4 + ci];
    const rows = [];
    for (const r of block) {
      if (r.cells.length !== 4) continue;
      const label = r.cells[ci];
      const key = resolveKey(label, "civilized");
      if (key === undefined) {
        const clean = expand(label.replace(/\*+/g, '').replace(/\s*\([^)]*\)\s*/g, ' ')).replace(/\s+/g, ' ').trim();
        if (!unresolved.has(clean)) unresolved.set(clean, []);
        unresolved.get(clean).push(`civilized/${def.key} ${r.lo}-${r.hi}`);
      }
      const last = rows[rows.length - 1];
      if (last && last.label === label && last.hi === r.lo - 1) last.hi = r.hi;
      else rows.push({ lo: r.lo, hi: r.hi, label, key: key === undefined ? null : key });
    }
    civColumns[def.key] = { name: def.name, rows };
  }
});

// ─── 3. Cross-check vs the markdown (report only — PDF wins) ────────────────
(function mdCrossCheck() {
  const lines = fs.readFileSync(MD, 'utf8').split(/\r?\n/);
  const re = /^# Monster Encounter by Terrain Type and Rarity - (.+)$/;
  let diffs = 0, checked = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    const name = m[1].trim().replace(/Rocky\/sandy/, 'Rocky/Sandy');
    const tableKey = MONSTER_TABLE_KEYS[name] || MONSTER_TABLE_KEYS[m[1].trim()];
    if (!tableKey || !monsterTables[tableKey]) continue;
    let j = i + 1;
    while (j < lines.length && !/^\|\s*\d/.test(lines[j])) { if (/^#/.test(lines[j]) && j > i + 1) break; j++; }
    for (; j < lines.length && /^\|/.test(lines[j]); j++) {
      const cells = lines[j].split('|').map(c => c.trim()).filter((c, idx, a) => idx > 0 && idx < a.length - 1);
      if (cells.length !== 5) continue;
      const rm = cells[0].match(/^(\d+)\s*[-–]\s*(\d+)$/);
      if (!rm) continue;
      const lo = +rm[1];
      for (let ci = 0; ci < 4; ci++) {
        const pdfCell = monsterTables[tableKey].columns[RARITIES[ci]].find(c => lo >= c.lo && lo <= c.hi);
        if (!pdfCell) continue;
        checked++;
        const a = kebab(expand(cells[ci + 1].replace(/\*+/g, '').replace(/\([^)]*\)/g, '')));
        const b = kebab(expand(pdfCell.label.replace(/\*+/g, '').replace(/\([^)]*\)/g, '')));
        if (a !== b && !cells[ci + 1].includes(';')) diffs++;
      }
    }
  }
  console.log(`MD cross-check: ${checked} cells compared, ${diffs} diffs (PDF positional wins; MD is known to smear)`);
})();

// ─── 4. Report ───────────────────────────────────────────────────────────────
if (allOddities.length) {
  console.log('\n--- ODDITIES (rows needing manual patch) ---');
  allOddities.forEach(o => console.log('  ' + o));
}
if (unresolved.size) {
  console.log('\n--- UNRESOLVED labels (need LABEL_ALIASES entries: key, or null = expected-unresolved) ---');
  for (const [label, where] of [...unresolved.entries()].sort()) {
    console.log(`  ${JSON.stringify(label)}: ${where.length}× e.g. ${where[0]}`);
  }
}

// ─── 5. Emit ─────────────────────────────────────────────────────────────────
function cellJs(c) { return `{lo:${c.lo},hi:${c.hi},label:${JSON.stringify(c.label)},key:${c.key === null ? 'null' : JSON.stringify(c.key)}}`; }
function colJs(cells) { return '[\n      ' + cells.map(cellJs).join(',\n      ') + '\n    ]'; }
const tableJs = Object.keys(monsterTables).map(k => {
  const t = monsterTables[k];
  return `  ${JSON.stringify(k)}: { name: ${JSON.stringify(t.name)}, page: ${t.page}, columns: {\n` +
    RARITIES.map(r => `    ${JSON.stringify(r)}: ${colJs(t.columns[r])}`).join(',\n') + '\n  } }';
}).join(',\n');
const civJs = Object.keys(civColumns).map(k => {
  const c = civColumns[k];
  return `  ${JSON.stringify(k)}: { name: ${JSON.stringify(c.name)}, rows: ${colJs(c.rows)} }`;
}).join(',\n');

const totalCells = Object.values(monsterTables).reduce((n, t) => n + RARITIES.reduce((m, r) => m + t.columns[r].length, 0), 0)
  + Object.values(civColumns).reduce((n, c) => n + c.rows.length, 0);

const moduleText = `/* =============================================================================
 * acks-engine-encounter-tables.js — ACKS God Mode wilderness identity tables
 *
 * The JJ "Monster Encounter by Terrain Type and Rarity" tables (18 terrains ×
 * 4 rarities, printed JJ pp.45–62) + the "Civilized Encounter by Terrain Type"
 * table (8 columns, JJ p.43) — the 1d100 identity rolls of the wilderness
 * encounter procedure (JJ p.43 steps 4–5; #476 E4, revising D12's deferral).
 *
 * SOURCE + IP (CLAUDE.md §13.6): mechanical table facts only — die ranges +
 * creature names, restructured to keyed JSON; no prose. Transcribed positionally
 * from the ACKS II Judge's Journal PDF (Imperial Imprint / Autarch), each table
 * cited to its printed page. GENERATED by outputs/build_encounter_tables.js —
 * edit the generator (and re-run), not this file by hand.
 *
 * Load order: AFTER acks-engine-monsters.js, BEFORE acks-engine.js. Cells carry
 * the printed label verbatim (species parentheticals included) + the resolved
 * MONSTER_CATALOG key, or key:null where the catalog excludes the creature
 * (Dragon, Genie, …) — a null-key identity is GM-detailed via the label.
 * ${totalCells} cells (consecutive identical rows merged).
 * =============================================================================
 */
(function (global) {
  'use strict';
  const ACKS = global.ACKS = global.ACKS || {};

  const ENCOUNTER_MONSTER_TABLES = {
${tableJs}
  };

  const ENCOUNTER_CIVILIZED_TABLE = { page: 43, columns: {
${civJs}
  } };

  // terrainKey (base or base-subtype, per terrainKey(hex)) → monster table key.
  // Bare bases default to the common variant (the encounterRowKey doctrine);
  // rivers override at call time via hasRiver (the encounterTerrainForHex rule).
  const ENCOUNTER_MONSTER_TABLE_FOR = ${JSON.stringify(buildMonsterTableFor(), null, 2).replace(/\n/g, '\n  ')};

  // terrainKey → civilized column. 🔧 barrens-tundra has no printed civilized
  // column — mapped to taiga (the nearest cold biome; herders + trappers).
  const ENCOUNTER_CIVILIZED_COLUMN_FOR = ${JSON.stringify(buildCivColumnFor(), null, 2).replace(/\n/g, '\n  ')};

  function _baseOf(terrainKey) { return String(terrainKey || '').split('-')[0]; }

  function encounterMonsterTableKeyFor(terrainKey, hasRiver) {
    if (hasRiver) {
      const b = _baseOf(terrainKey);
      return (b === 'desert' || b === 'jungle') ? 'river-desert-jungle' : 'river-temperate';
    }
    return ENCOUNTER_MONSTER_TABLE_FOR[terrainKey] || ENCOUNTER_MONSTER_TABLE_FOR[_baseOf(terrainKey)] || null;
  }
  function encounterCivilizedColumnKeyFor(terrainKey, hasRiver) {
    if (hasRiver) {
      const b = _baseOf(terrainKey);
      return b === 'desert' ? 'arid' : (b === 'jungle' ? 'savanna' : 'temperate');
    }
    return ENCOUNTER_CIVILIZED_COLUMN_FOR[terrainKey] || ENCOUNTER_CIVILIZED_COLUMN_FOR[_baseOf(terrainKey)] || null;
  }

  // The row list a GM picks from (the choose-from-table affordance). category
  // 'monster' wants rarity; 'civilized' ignores it. Returns [] when unmappable.
  function identityEntriesFor(terrainKey, hasRiver, category, rarity) {
    if (category === 'civilized') {
      const ck = encounterCivilizedColumnKeyFor(terrainKey, hasRiver);
      const col = ck && ENCOUNTER_CIVILIZED_TABLE.columns[ck];
      return col ? col.rows.slice() : [];
    }
    const tk = encounterMonsterTableKeyFor(terrainKey, hasRiver);
    const t = tk && ENCOUNTER_MONSTER_TABLES[tk];
    const col = t && t.columns[rarity || 'common'];
    return col ? col.slice() : [];
  }

  // The RAW 1d100 identity roll (JJ p.43 step 4 [civilized] / 5b [monster]).
  // Returns { natural, label, key, tableKey, columnKey, rarity, page } or null
  // when no table maps (water hex, unknown terrain) — the GM identifies.
  function rollEncounterIdentity(opts) {
    const o = opts || {};
    const rng = o.rng || Math.random;
    const natural = 1 + Math.floor(rng() * 100);
    if (o.category === 'civilized') {
      const ck = encounterCivilizedColumnKeyFor(o.terrainKey, !!o.hasRiver);
      const col = ck && ENCOUNTER_CIVILIZED_TABLE.columns[ck];
      if (!col) return null;
      const cell = col.rows.find(c => natural >= c.lo && natural <= c.hi);
      return cell ? { natural, label: cell.label, key: cell.key, tableKey: null, columnKey: ck, rarity: null, page: ENCOUNTER_CIVILIZED_TABLE.page } : null;
    }
    const tk = encounterMonsterTableKeyFor(o.terrainKey, !!o.hasRiver);
    const t = tk && ENCOUNTER_MONSTER_TABLES[tk];
    const col = t && t.columns[o.rarity || 'common'];
    if (!col) return null;
    const cell = col.find(c => natural >= c.lo && natural <= c.hi);
    return cell ? { natural, label: cell.label, key: cell.key, tableKey: tk, columnKey: null, rarity: o.rarity || 'common', page: t.page } : null;
  }

  Object.assign(ACKS, {
    ENCOUNTER_MONSTER_TABLES, ENCOUNTER_CIVILIZED_TABLE,
    ENCOUNTER_MONSTER_TABLE_FOR, ENCOUNTER_CIVILIZED_COLUMN_FOR,
    encounterMonsterTableKeyFor, encounterCivilizedColumnKeyFor,
    identityEntriesFor, rollEncounterIdentity
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = ACKS;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
`;

// terrain → table resolver maps, built against the shipped TERRAIN_BASES/SUBTYPES so every
// authored combination resolves (totality asserted below).
function buildMonsterTableFor() {
  const base = {
    barrens: 'barrens-rocky-sandy', desert: 'desert-any', grassland: 'grassland-farmland-prairie',
    forest: 'forest-deciduous', hills: 'hills-any', jungle: 'jungle-any',
    mountains: 'mountains-forested-rocky', scrubland: 'scrubland-sparse', swamp: 'swamp-any'
  };
  const subOverride = {
    'barrens-tundra': 'barrens-tundra', 'grassland-savanna': 'grassland-savannah',
    'grassland-steppe': 'grassland-steppe', 'forest-taiga': 'forest-taiga',
    'mountains-snowy': 'mountains-snowy', 'mountains-volcanic': 'mountains-volcanic',
    'scrubland-dense': 'scrubland-dense'
  };
  const map = { ...base, ...subOverride };
  const SUBS = ACKS.TERRAIN_SUBTYPES || {};
  for (const b of Object.keys(SUBS)) {
    for (const sub of SUBS[b] || []) {
      const k = b + '-' + sub;
      if (!map[k] && base[b]) map[k] = subOverride[k] || base[b];
    }
  }
  return map;
}
function buildCivColumnFor() {
  const base = {
    barrens: 'arid', desert: 'arid', grassland: 'temperate', forest: 'forest',
    hills: 'hills-mountains', jungle: 'jungle', mountains: 'hills-mountains',
    scrubland: 'temperate', swamp: 'swamp'
  };
  const subOverride = {
    'barrens-tundra': 'taiga',            // 🔧 no printed column — nearest cold biome
    'grassland-savanna': 'savanna', 'forest-taiga': 'taiga', 'scrubland-dense': 'forest'
  };
  const map = { ...base, ...subOverride };
  const SUBS = ACKS.TERRAIN_SUBTYPES || {};
  for (const b of Object.keys(SUBS)) {
    for (const sub of SUBS[b] || []) {
      const k = b + '-' + sub;
      if (!map[k] && base[b]) map[k] = subOverride[k] || base[b];
    }
  }
  return map;
}

// totality: every shipped base + base-sub resolves to an existing table/column
(function assertTotality() {
  const mt = buildMonsterTableFor(), cc = buildCivColumnFor();
  const bases = (ACKS.TERRAIN_BASES || []).filter(b => b !== 'water');
  const SUBS = ACKS.TERRAIN_SUBTYPES || {};
  for (const b of bases) {
    if (!mt[b]) throw new Error(`monster-table map misses base ${b}`);
    if (!cc[b]) throw new Error(`civilized map misses base ${b}`);
    for (const s of SUBS[b] || []) {
      const k = b + '-' + s;
      if (!mt[k] && !mt[b]) throw new Error(`monster-table map misses ${k}`);
      if (!monsterTables[mt[k] || mt[b]]) throw new Error(`map points ${k} at missing table ${mt[k] || mt[b]}`);
    }
  }
})();

// spot-asserts against hand-verified printed cells
(function spotChecks() {
  function cellAt(tk, rar, n) { return monsterTables[tk].columns[rar].find(c => n >= c.lo && n <= c.hi); }
  const checks = [
    ['barrens-rocky-sandy', 'common', 1, 'Baboon, Rock'],
    ['barrens-rocky-sandy', 'very-rare', 99, /Worm, Giant Black/],
    ['desert-any', 'uncommon', 99, 'Wight'],
    ['desert-any', 'rare', 99, 'Yali'],
    ['desert-any', 'common', 1, /Camel/],
  ];
  for (const [tk, rar, n, want] of checks) {
    const c = cellAt(tk, rar, n);
    const ok = c && (want instanceof RegExp ? want.test(c.label) : c.label === want);
    if (!ok) throw new Error(`spot-check failed: ${tk}/${rar}@${n} = ${c && c.label} (wanted ${want})`);
  }
})();

const outPath = path.resolve(REPO, 'acks-engine-encounter-tables.js');
fs.writeFileSync(outPath, moduleText);
console.log(`\nmodule written: acks-engine-encounter-tables.js (${(moduleText.length / 1024).toFixed(0)} KB, ${totalCells} cells)`);
console.log('tables:', Object.keys(monsterTables).length, 'monster +', Object.keys(civColumns).length, 'civilized columns');
const nullCells = totalCells - Object.values(monsterTables).reduce((n, t) => n + RARITIES.reduce((m, r) => m + t.columns[r].filter(c => c.key).length, 0), 0)
  - Object.values(civColumns).reduce((n, c) => n + c.rows.filter(x => x.key).length, 0);
console.log('cells with key:', totalCells - nullCells, ' null-key (GM-detailed):', nullCells);
