// outputs/build_troop_catalog.js — parse the ACKS II RR markdown warfare tables and EMIT the
// engine module acks-engine-troops.js (mechanical fields only, RR-cited). Phase 3 Military W1.
//
// Sources parsed (ACKS Sources/ACKS-II-Revised-Rulebook.md, printed pages via <!-- page N --> markers):
//   - Troop Characteristics Summary (RR pp.438-441): demi-human / human regular / human veteran /
//     beastman troop rows -> TROOP_CATALOG (per-creature AC/move/HD/hp/attacks/damage/save/morale/BR/wage)
//   - Unit Characteristics Summary (RR pp.442-444): per-unit daily/weekly move, monthly wage, weekly
//     supply, printed unit BR -> attached to TROOP_CATALOG rows + used as a VERIFICATION oracle
//     (wage x unitSize must equal the printed unit wage; BR x size vs printed flags designer-note rows)
//   - Mercenary Gp Wage per Month + Mercenary Morale (RR p.429) -> MERC_WAGES / MERC_MORALE matrices
//   - Mercenary Officer Characteristics (RR p.171) -> OFFICER_RANKS
//   - Army Organization and Size (RR p.437) -> ARMY_ORG_SCALE
//   - Supply Cost (RR p.450) -> UNIT_SUPPLY_COSTS
//   - Vassal Troops by Realm Size (RR p.434) -> VASSAL_TROOPS
//   - Mercenary Availability by Realm Size + fees + Military Specialist Availability (RR p.428)
//     -> MERC_AVAILABILITY_REALM / REALM_RECRUITMENT_FEES / MILITARY_SPECIALIST_AVAILABILITY_REALM
//
// Working artifact (outputs/ gitignored); the EMITTED module IS committed (the shipped catalog).
'use strict';
const fs = require('fs');
const path = require('path');

// audit A7 (2026-06-24): generator moved outputs/ → tools/build/ (now two levels below the
// repo root). Anchors keep the paths readable from the new depth.
const REPO = path.resolve(__dirname, '..', '..');           // the "ACKS God Mode/" repo root
const SOURCES = path.resolve(REPO, '..', 'ACKS Sources');   // DEV-root RAW PDFs/MDs — NOT in the repo
                                                            // (§13.6 IP). This generator is maintainer-run, not CI.

const SRC = path.resolve(SOURCES, 'ACKS-II-Revised-Rulebook.md');
const md = fs.readFileSync(SRC, 'utf8');
const lines = md.split('\n');

// ---------- generic helpers ----------
const warnings = [];
function warn(msg){ warnings.push(msg); }
function die(msg){ console.error('FATAL: ' + msg); process.exit(1); }
function fixText(s){
  return String(s == null ? '' : s)
    .replace(/[′’]/g, "'")     // prime / curly apostrophe -> '
    .replace(/[–—]/g, '-')      // en/em dash -> hyphen (numeric ranges)
    .replace(/\/;\s*/g, ' / ')            // the "/;" OCR separator artifact
    .replace(/la m ellar/g, 'lamellar')   // hobgoblin medium cavalry smear
    .replace(/\s+/g, ' ')
    .trim();
}
function num(s){ const m = fixText(s).replace(/,/g, '').match(/-?\d+(\.\d+)?/); return m ? +m[0] : null; }
function gp(s){ const t = fixText(s).replace(/,/g, ''); const m = t.match(/(-?\d+(?:\.\d+)?)\s*g/i) || t.match(/^(-?\d+(?:\.\d+)?)$/); return m ? +m[1] : null; }
function signedInt(s){ const t = fixText(s); if(t === '' || t === '-') return null; const m = t.replace(/\s+/g,'').match(/^([+-]?\d+)$/); return m ? +m[1] : null; }
function cellOrNull(s){ const t = fixText(s).replace(/,/g, ''); if(t === '' || t === '-') return null; const m = t.match(/^\d+$/); return m ? +m[0] : null; }

// Find the line index of an exact heading (first occurrence at/after `from`).
function findHeading(text, from){
  for(let i = from || 0; i < lines.length; i++){
    if(lines[i].trim() === text) return i;
  }
  return -1;
}
// Parse the first markdown pipe table at/after line index `from`. Returns {rows, endIdx}
// where rows are arrays of raw cell strings (header row included; separator skipped).
function parseTable(from){
  let i = from;
  while(i < lines.length && !lines[i].trim().startsWith('|')) i++;
  if(i >= lines.length) die('no table found after line ' + from);
  const rows = [];
  for(; i < lines.length; i++){
    const t = lines[i].trim();
    if(!t.startsWith('|')){
      // tolerate page-marker comments + blank lines INSIDE a table (the RR tables span pages)
      if(t === '' || /^<!--\s*page\s+\d+\s*-->$/.test(t)){
        // only continue if the next non-blank line is still a table row
        let j = i + 1;
        while(j < lines.length && (lines[j].trim() === '' || /^<!--\s*page\s+\d+\s*-->$/.test(lines[j].trim()))) j++;
        if(j < lines.length && lines[j].trim().startsWith('|')){ continue; }
      }
      break;
    }
    if(/^\|[\s\-|]+\|$/.test(t)) continue;            // separator row
    const cells = t.slice(1, t.endsWith('|') ? -1 : undefined).split('|').map(c => c.trim());
    rows.push(cells);
  }
  return { rows, endIdx: i };
}
// Printed page for a given line index (last <!-- page N --> marker at/before it).
function pageAt(lineIdx){
  for(let i = lineIdx; i >= 0; i--){
    const m = lines[i].match(/<!--\s*page\s+(\d+)\s*-->/);
    if(m) return +m[1];
  }
  return null;
}

// ---------- troop-type vocabulary ----------
// Canonical typeKeys align with the shipped HIRELING_MERCENARIES ids where one exists
// ('slinger', 'bowman', 'crossbowman', ...); the market umbrella ids that cover several
// troop types ('composite-bow', 'beast-riders') resolve via aliases / the race map.
const TYPE_MAP = {
  'untrained conscripts/militia': 'untrained-levy',
  'trained militia':              'trained-militia',
  'light infantry':               'light-infantry',
  'heavy infantry':               'heavy-infantry',
  'slingers':                     'slinger',
  'bowmen':                       'bowman',
  'composite bowmen':             'composite-bowman',
  'composite bowman':             'composite-bowman',
  'crossbowmen':                  'crossbowman',
  'longbowmen':                   'longbowman',
  'light cavalry':                'light-cavalry',
  'horse archers':                'horse-archers',
  'mounted crossbowmen':          'mounted-crossbowman',
  'medium cavalry':               'medium-cavalry',
  'heavy cavalry':                'heavy-cavalry',
  'cataphracts':                  'cataphract-cavalry',
  'cataphract cavalry':           'cataphract-cavalry',
  'camel archers':                'camel-archers',
  'camel lancers':                'camel-lancers',
  'war elephant':                 'war-elephants',
  'war elephants':                'war-elephants',
  'weasel riders':                'weasel-riders',
  'wolf riders':                  'wolf-riders',
  'boar riders':                  'boar-riders',
  'hyena riders':                 'hyena-riders'
};
const RACE_MAP = {
  'dwarven': 'dwarf', 'elven': 'elf', 'kobold': 'kobold', 'goblin': 'goblin', 'orc': 'orc',
  'hobgoblin': 'hobgoblin', 'gnoll': 'gnoll', 'lizardman': 'lizardmen', // normalized below
  'bugbear': 'bugbear', 'ogre': 'ogre'
};
function raceKeyFromHeader(label){
  const t = fixText(label).toLowerCase().replace(/\s*troops\s*$/, '');
  if(t.startsWith('dwarv')) return 'dwarf';
  if(t.startsWith('elv')) return 'elf';
  if(t.startsWith('kobold')) return 'kobold';
  if(t.startsWith('goblin')) return 'goblin';
  if(t.startsWith('orc')) return 'orc';
  if(t.startsWith('hobgoblin')) return 'hobgoblin';
  if(t.startsWith('gnoll')) return 'gnoll';
  if(t.startsWith('lizard')) return 'lizardman';
  if(t.startsWith('bugbear')) return 'bugbear';
  if(t.startsWith('ogre')) return 'ogre';
  return null;
}

// Parse a troop label cell -> { typeKey, loadout, variantLabel, veteran, equipment, label }
function parseTroopLabel(cell){
  let t = fixText(cell);
  let equipment = '';
  const paren = t.match(/\(([^)]*)\)\s*$/);
  if(paren){ equipment = paren[1].trim(); t = t.slice(0, paren.index).trim(); }
  let veteran = false;
  if(/^vet(\.|eran)?\s+/i.test(t)){ veteran = true; t = t.replace(/^vet(\.|eran)?\s+/i, ''); }
  let variantLabel = null, loadout = null;
  let typeKey = TYPE_MAP[t.toLowerCase()];                    // full-label hit ("Untrained Conscripts/Militia")
  if(!typeKey){
    const slash = t.match(/\s*\/\s*([A-Za-z ]+)$/);           // "Light Infantry E / Hunters"
    if(slash && !/^[A-H]$/.test(slash[1].trim())){ variantLabel = slash[1].trim(); t = t.slice(0, slash.index).trim(); }
    typeKey = TYPE_MAP[t.toLowerCase()];
  }
  if(!typeKey){
    const lo = t.match(/\s([A-H])$/);
    if(lo){ loadout = lo[1]; t = t.slice(0, lo.index).trim(); }
    typeKey = TYPE_MAP[t.toLowerCase()];
  }
  if(!typeKey) die('unknown troop label: "' + cell + '" (normalized "' + t + '")');
  return { typeKey, loadout, variantLabel, veteran, equipment, label: fixText(cell) };
}

// ---------- 1. Troop Characteristics Summary (RR pp.438-441) ----------
const tcsIdx = findHeading('# Troop Characteristics Summary');
if(tcsIdx < 0) die('Troop Characteristics Summary heading not found');
const troopSections = [
  { heading: '# Demi-Human Troops',      defaultRace: null,  veteranTable: false },
  { heading: '# Human Troops (Regular)', defaultRace: 'man', veteranTable: false },
  { heading: '# Human Troops (Veteran)', defaultRace: 'man', veteranTable: true },
  { heading: '# Beastman Troops',        defaultRace: null,  veteranTable: false }
];

// FIXUPS for OCR smears in specific troop rows, keyed by emitted catalog key.
const TROOP_FIXUPS = {
  'gnoll-hyena-riders':          { wageGpMonth: 225 },     // "225g" cell (gp() handles it; kept as a guard)
  'hobgoblin-medium-cavalry':    { attacks: '1' }          // Att. cell printed "- 1"
};

const TROOP_CATALOG = [];
for(const sec of troopSections){
  const hIdx = findHeading(sec.heading, tcsIdx);
  if(hIdx < 0) die(sec.heading + ' not found');
  const { rows } = parseTable(hIdx + 1);
  const page = pageAt(hIdx);
  let race = sec.defaultRace;
  let rowPageBase = hIdx;
  for(let r = 1; r < rows.length; r++){           // rows[0] = header
    const cells = rows[r];
    const bodyEmpty = cells.slice(1).every(c => fixText(c) === '');
    if(bodyEmpty){
      const rk = raceKeyFromHeader(cells[0]);
      if(rk) race = rk; else warn('unrecognized race header row: ' + cells[0]);
      continue;
    }
    if(!race) die('troop row before any race header: ' + cells[0]);
    const lab = parseTroopLabel(cells[0]);
    const veteran = sec.veteranTable || lab.veteran;
    const isCavalry = /\//.test(fixText(cells[1]));          // AC "4/2" = rider/mount
    const isElephant = lab.typeKey === 'war-elephants';
    const isLargeCreature = (race === 'ogre');               // ogres fight as large creatures (60/unit)
    const category = isElephant ? 'large' : (isCavalry ? 'cavalry' : (isLargeCreature ? 'large' : 'infantry'));
    const unitSize = isElephant ? 5 : (category === 'infantry' ? 120 : 60);
    const key = race + '-' + (veteran ? 'veteran-' : '') + lab.typeKey + (lab.loadout ? '-' + lab.loadout.toLowerCase() : '');
    const entry = {
      key, race, typeKey: lab.typeKey, loadout: lab.loadout, veteran,
      variantLabel: lab.variantLabel,
      label: (veteran ? 'Veteran ' : '') + lab.typeKey.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' ')
             + (lab.loadout ? ' ' + lab.loadout : '') + (lab.variantLabel ? ' (' + lab.variantLabel + ')' : ''),
      equipment: lab.equipment,
      ac: num(cells[1] && cells[1].split('/')[0]),
      acMount: isCavalry ? num(cells[1].split('/')[1]) : null,
      moveFt: num(cells[2]),
      hd: fixText(cells[3]), hp: fixText(cells[4]),
      attacks: fixText(cells[5]), damage: fixText(cells[6]),
      save: fixText(cells[7]), morale: signedInt(cells[8]),
      brPerCreature: num(cells[9]),
      wageGpMonth: gp(cells[10]),
      category, unitSize,
      page: pageAt(rowPageBase) || page
    };
    if(TROOP_FIXUPS[key]) Object.assign(entry, TROOP_FIXUPS[key]);
    if(entry.morale === null && fixText(cells[8]) !== '') warn(key + ': unparsed morale "' + cells[8] + '"');
    if(entry.brPerCreature == null) die(key + ': missing BR');
    if(entry.wageGpMonth == null) die(key + ': missing wage (cell "' + cells[10] + '")');
    TROOP_CATALOG.push(entry);
  }
}

// ---------- 2. Unit Characteristics Summary (RR pp.442-444) — attach + verify ----------
const ucsIdx = findHeading('# Unit Characteristics Summary');
if(ucsIdx < 0) die('Unit Characteristics Summary heading not found');
const unitSections = [
  { heading: '# Demi-Human Units', defaultRace: null,  from: ucsIdx },
  { heading: '# Human Units',      defaultRace: 'man', from: ucsIdx },
  { heading: '# Beastman Units',   defaultRace: null,  from: ucsIdx }
];
// Parse a unit-summary label: "120 Heavy Infantry A / B", "120 Vet. Light Infantry (any)",
// "5 War Elephants (w/ 30 Riders)*", "120 Untrained Conscripts/Militia"
function parseUnitLabel(cell){
  let t = fixText(cell).replace(/\*+$/, '').trim();
  const cm = t.match(/^([\d,]+)\s+(.*)$/);
  if(!cm) return null;
  const count = +cm[1].replace(/,/g, '');
  t = cm[2].trim();
  t = t.replace(/\(w\/[^)]*\)/i, '').trim();                 // "(w/ 30 Riders)"
  let anyLoadout = false;
  if(/\(any\)/i.test(t)){ anyLoadout = true; t = t.replace(/\(any\)/i, '').trim(); }
  let veteran = false;
  if(/^vet(\.|eran)?\s+/i.test(t)){ veteran = true; t = t.replace(/^vet(\.|eran)?\s+/i, ''); }
  if(/^veteran\s+/i.test(t)){ veteran = true; t = t.replace(/^veteran\s+/i, ''); }
  let loadouts = null;
  const lm = t.match(/\s([A-H](?:\s*\/\s*[A-H])*)$/);        // "A / B"
  if(lm){ loadouts = lm[1].split('/').map(x => x.trim()); t = t.slice(0, lm.index).trim(); }
  const typeKey = TYPE_MAP[t.toLowerCase()];
  if(!typeKey) return null;
  return { count, typeKey, loadouts, anyLoadout, veteran };
}
let unitRowCount = 0, wageVerified = 0, brDerivedMatch = 0, brDerivedMismatch = [];
function roundHalf(x){ return Math.round(x * 2) / 2; }
for(const sec of unitSections){
  const hIdx = findHeading(sec.heading, sec.from);
  if(hIdx < 0) die(sec.heading + ' not found');
  const { rows } = parseTable(hIdx + 1);
  let race = sec.defaultRace;
  for(let r = 1; r < rows.length; r++){
    const cells = rows[r];
    const bodyEmpty = cells.slice(1).every(c => fixText(c) === '');
    if(bodyEmpty){ const rk = raceKeyFromHeader(cells[0]); if(rk) race = rk; continue; }
    const ul = parseUnitLabel(cells[0]);
    if(!ul){ warn('unit-summary row skipped (unparsed label): ' + cells[0]); continue; }
    unitRowCount++;
    const daily = num(cells[1]), weekly = num(cells[2]);
    const wage = num(cells[3]), supply = num(cells[4]), specialist = num(cells[5]);
    const field = num(cells[6]), br = num(cells[7]);
    // matching troop rows: same race + typeKey + veteran; loadout in loadouts (or any)
    const matches = TROOP_CATALOG.filter(t =>
      t.race === race && t.typeKey === ul.typeKey && t.veteran === ul.veteran &&
      (ul.anyLoadout || !ul.loadouts || ul.loadouts.includes(t.loadout) || (!t.loadout && !ul.loadouts)));
    if(!matches.length){ warn('unit-summary row matched NO troop rows: ' + cells[0] + ' (race ' + race + ')'); continue; }
    // VERIFY: at least one matching troop row's wage x count equals the printed unit wage
    const wageHit = matches.some(t => Math.abs(t.wageGpMonth * ul.count - wage) < 0.5);
    if(wageHit) wageVerified++;
    else warn('WAGE MISMATCH: ' + cells[0] + ' printed ' + wage + ' vs derived ' +
              matches.map(t => t.key + '=' + (t.wageGpMonth * ul.count)).join(', '));
    for(const t of matches){
      t.unitDailyMoveMiles = daily;
      t.unitWeeklyMoveMiles = weekly;
      t.unitSupplyWeekly = supply;
      t.unitSpecialistMonthly = specialist;
      t.unitCostToField = field;
      t.unitBattleRating = br;
      if(t.unitSize !== ul.count) warn('unit size disagreement: ' + t.key + ' inferred ' + t.unitSize + ' vs summary ' + ul.count);
      // derivation checks (informational)
      if(t.moveFt != null && Math.abs(t.moveFt / 5 - daily) > 0.01)
        warn('daily-move not moveFt/5: ' + t.key + ' (' + t.moveFt + "' vs " + daily + ' mi)');
      const derivedBr = roundHalf(t.brPerCreature * ul.count);
      if(Math.abs(derivedBr - br) < 0.01) brDerivedMatch++;
      else brDerivedMismatch.push(t.key + ' derived ' + derivedBr + ' vs printed ' + br);
    }
  }
}

// ---------- 3. Mercenary wage + morale matrices (RR p.429) ----------
const MATRIX_RACES = ['man','dwarf','elf','kobold','goblin','orc','hobgoblin','gnoll','lizardman','bugbear','ogre'];
const MATRIX_TYPE_MAP = Object.assign({}, TYPE_MAP, {
  'comp. bowmen/longbowmen': 'composite-bowman',
  'war elephants (riders)': 'war-elephants',
  'beast riders': 'beast-riders',
  'mounted crossbowmen': 'mounted-crossbowman'
});
function parseMatrix(headingText){
  const hIdx = findHeading(headingText);
  if(hIdx < 0) die(headingText + ' not found');
  const { rows } = parseTable(hIdx + 1);
  const out = {};
  for(let r = 1; r < rows.length; r++){
    const cells = rows[r];
    const t = fixText(cells[0]).toLowerCase();
    const typeKey = MATRIX_TYPE_MAP[t];
    if(!typeKey){ warn(headingText + ': unrecognized row "' + cells[0] + '"'); continue; }
    const vals = {};
    for(let c = 0; c < MATRIX_RACES.length; c++){
      const cell = fixText(cells[c + 1]);
      vals[MATRIX_RACES[c]] = (cell === '' || cell === '-') ? null : (signedInt(cell) != null ? signedInt(cell) : num(cell));
    }
    out[typeKey] = vals;
  }
  return out;
}
const MERC_WAGES = parseMatrix('# Mercenary Gp Wage per Month');
const MERC_MORALE = parseMatrix('#### Mercenary Morale');

// Cross-check: matrix wage equals the default-loadout regular troop row's wage.
const BEAST_RIDER_BY_RACE = { kobold: 'weasel-riders', goblin: 'wolf-riders', orc: 'boar-riders', gnoll: 'hyena-riders' };
let matrixChecks = 0;
for(const typeKey of Object.keys(MERC_WAGES)){
  for(const race of MATRIX_RACES){
    const w = MERC_WAGES[typeKey][race];
    if(w == null) continue;
    const realType = typeKey === 'beast-riders' ? BEAST_RIDER_BY_RACE[race] : typeKey;
    const rows = TROOP_CATALOG.filter(t => t.race === race && t.typeKey === realType && !t.veteran);
    if(!rows.length){ warn('wage matrix names (' + typeKey + ', ' + race + ') = ' + w + ' but no troop row exists'); continue; }
    matrixChecks++;
    if(!rows.some(t => t.wageGpMonth === w))
      warn('wage matrix mismatch (' + typeKey + ', ' + race + '): matrix ' + w + ' vs rows ' + rows.map(t => t.wageGpMonth).join('/'));
  }
}

// ---------- 4. Officer ranks (RR p.171) ----------
const offIdx = findHeading('#### Mercenary Officer Characteristics');
if(offIdx < 0) die('Mercenary Officer Characteristics not found');
const offRows = parseTable(offIdx + 1).rows;
const OFFICER_RANKS = [];
for(let r = 1; r < offRows.length; r++){
  const c = offRows[r];
  const label = fixText(c[0]);
  OFFICER_RANKS.push({
    key: label.toLowerCase(),
    label,
    level: num(c[1]),
    costGpMonth: gp(c[2]),
    leadershipAbility: num(c[3]),
    strategicAbility: signedInt(c[4]) != null ? signedInt(c[4]) : num(c[4]),
    moraleModifier: signedInt(c[5]) != null ? signedInt(c[5]) : num(c[5]),
    proficiencies: fixText(c[6]).split(',').map(s => s.trim()).filter(Boolean),
    page: 171
  });
}
if(OFFICER_RANKS.length !== 4) die('expected 4 officer ranks, got ' + OFFICER_RANKS.length);

// ---------- 5. Army Organization and Size (RR p.437) ----------
const orgIdx = findHeading('# Army Organization and Size');
if(orgIdx < 0) die('Army Organization and Size not found');
const orgRows = parseTable(orgIdx + 1).rows;
const SCALE_KEYS = ['platoon','company','battalion','brigade'];
const ARMY_ORG_SCALE = [];
for(let r = 1; r < orgRows.length; r++){
  const c = orgRows[r];
  const sizeText = fixText(c[0]);
  const sizes = sizeText.replace(/,/g, '').match(/\d+/g) || [];
  const scale = fixText(c[1]).toLowerCase();
  if(!SCALE_KEYS.includes(scale)) die('unknown scale "' + c[1] + '"');
  const tpu = fixText(c[2]);
  const multM = tpu.match(/[x×]\s*([\d/]+)/i);
  const infM = tpu.match(/([\d,]+)\s*infantry/i);
  const cavM = tpu.match(/([\d,]+)\s*cavalry/i);
  function qual(cell){
    const t = fixText(cell);
    const lvl = t.match(/(\d+)(?:st|nd|rd|th)\s*level/i);
    const hd = t.match(/HD\s*\+\s*(\d+)/i);
    return { npcLevel: lvl ? +lvl[1] : null, monsterHdOver: hd ? +hd[1] : null };
  }
  ARMY_ORG_SCALE.push({
    scale,
    armySizeMin: sizes[0] ? +sizes[0] : null,
    armySizeMax: /or more/i.test(sizeText) ? null : (sizes[1] ? +sizes[1] : null),
    multiplier: multM ? (multM[1].includes('/') ? (+multM[1].split('/')[0] / +multM[1].split('/')[1]) : +multM[1]) : null,
    troopsPerUnitInfantry: infM ? +infM[1].replace(/,/g, '') : null,
    troopsPerUnitCavalry: cavM ? +cavM[1].replace(/,/g, '') : null,
    commanderQual: qual(c[3]),
    lieutenantQual: qual(c[4]),
    page: 437
  });
}
if(ARMY_ORG_SCALE.length !== 4) die('expected 4 scale rows, got ' + ARMY_ORG_SCALE.length);

// ---------- 6. Supply Cost (RR p.450) ----------
const supIdx = findHeading('# Supplying Armies');
if(supIdx < 0) die('Supplying Armies not found');
const supRows = parseTable(supIdx + 1).rows;
const UNIT_SUPPLY_COSTS = {};
for(let r = 1; r < supRows.length; r++){
  const c = supRows[r];
  const scale = fixText(c[0]).toLowerCase();
  if(!SCALE_KEYS.includes(scale)) continue;
  UNIT_SUPPLY_COSTS[scale] = { infantry: gp(c[1]), cavalry: gp(c[2]) };
}
if(Object.keys(UNIT_SUPPLY_COSTS).length !== 4) die('expected 4 supply-cost scales, got ' + Object.keys(UNIT_SUPPLY_COSTS).length);

// ---------- 7. Vassal Troops by Realm Size (RR p.434) ----------
const vasIdx = findHeading('# Vassal Troops by Realm Size');
if(vasIdx < 0) die('Vassal Troops by Realm Size not found');
const vasRows = parseTable(vasIdx + 1).rows;
function rangeParse(s){
  const t = fixText(s).replace(/,/g, '');
  const nums = [];
  const re = /(\d+(?:\.\d+)?)\s*(M|K)?/gi;
  let m;
  while((m = re.exec(t)) !== null){
    let v = +m[1];
    if(m[2] && m[2].toUpperCase() === 'M') v *= 1000000;
    if(m[2] && m[2].toUpperCase() === 'K') v *= 1000;
    nums.push(v);
  }
  return { min: nums[0] != null ? nums[0] : null, max: nums[1] != null ? nums[1] : (nums[0] != null ? nums[0] : null), openEnded: /\+/.test(t), text: fixText(s) };
}
const VASSAL_TROOPS = [];
for(let r = 1; r < vasRows.length; r++){
  const c = vasRows[r];
  VASSAL_TROOPS.push({
    title: fixText(c[0]),
    key: fixText(c[0]).toLowerCase().replace(/[^a-z]+/g, '-'),
    domains: rangeParse(c[1]),
    realmFamilies: rangeParse(c[2]),
    avgPersonalGarrisonWages: gp(c[3]),
    maxRealmTroopsWages: rangeParse(c[4]),
    maxStandingArmy: rangeParse(c[5]),
    timePeriod: fixText(c[6]).toLowerCase(),
    page: 434
  });
}
if(VASSAL_TROOPS.length !== 7) die('expected 7 vassal-troop tiers, got ' + VASSAL_TROOPS.length);
if(!VASSAL_TROOPS.some(v => v.key === 'viscount')) die('Viscount tier missing (the old "Marquis" error?)');

// ---------- 8. Realm availability + fees (RR p.428) ----------
const REALM_TIERS = ['continent','empire','kingdom','principality','duchy','county','viscounty','barony'];
const availIdx = findHeading('#### Mercenary Availability by Realm Size');
if(availIdx < 0) die('Mercenary Availability by Realm Size not found');
const availRows = parseTable(availIdx + 1).rows;
const MERC_AVAILABILITY_REALM = { tiers: REALM_TIERS, populationFamilies: {}, timePeriod: {}, types: {} };
const AVAIL_TYPE_MAP = Object.assign({}, MATRIX_TYPE_MAP, { 'mtd. crossbowman': 'mounted-crossbowman' });
for(let r = 1; r < availRows.length; r++){
  const c = availRows[r];
  const lbl = fixText(c[0]).toLowerCase();
  if(lbl.startsWith('population')){
    REALM_TIERS.forEach((t, i) => { MERC_AVAILABILITY_REALM.populationFamilies[t] = cellOrNull(c[i + 1]); });
    continue;
  }
  if(lbl.startsWith('time period')){
    REALM_TIERS.forEach((t, i) => { MERC_AVAILABILITY_REALM.timePeriod[t] = fixText(c[i + 1]).toLowerCase(); });
    continue;
  }
  const typeKey = AVAIL_TYPE_MAP[lbl];
  if(!typeKey){ warn('realm availability: unrecognized row "' + c[0] + '"'); continue; }
  const vals = {};
  REALM_TIERS.forEach((t, i) => { vals[t] = cellOrNull(c[i + 1]); });
  MERC_AVAILABILITY_REALM.types[typeKey] = vals;
}
// fee table sits just above the availability table ("| Realm Size | Cost Per Time Period ... |")
const feeIdx = findHeading('#### Availability of Mercenaries from the Realm');
const feeRows = parseTable(feeIdx + 1).rows;
const REALM_RECRUITMENT_FEES = {};
for(let r = 1; r < feeRows.length; r++){
  const c = feeRows[r];
  const tier = fixText(c[0]).toLowerCase();
  if(!REALM_TIERS.includes(tier === 'viscounty' ? 'viscounty' : tier)) continue;
  const t = fixText(c[1]).replace(/,/g, '');
  const m = t.match(/^([\dd+\-]+)\s*(?:[x×]\s*([\d]+))?\s*gp/i) || t.match(/^([\dd+\-]+)gp/i);
  if(m) REALM_RECRUITMENT_FEES[tier] = { dice: m[1], multiplierGp: m[2] ? +m[2] : 1, text: fixText(c[1]) };
  else warn('fee row unparsed: ' + c[1]);
}
if(Object.keys(REALM_RECRUITMENT_FEES).length !== 8) warn('expected 8 fee tiers, got ' + Object.keys(REALM_RECRUITMENT_FEES).length);

// ---------- 9. Military specialist availability (RR p.428) ----------
const specIdx = findHeading('# Military Specialist Availability by Realm Size', 16000);
if(specIdx < 0) die('Military Specialist Availability heading not found');
const specRows = parseTable(specIdx + 1).rows;
const MILITARY_SPECIALIST_AVAILABILITY_REALM = { tiers: REALM_TIERS, types: {} };
for(let r = 1; r < specRows.length; r++){
  const c = specRows[r];
  const lbl = fixText(c[0]);
  if(/^population|^time period/i.test(lbl)) continue;
  const key = lbl.toLowerCase().replace(/—|–/g, '-').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  const vals = {};
  REALM_TIERS.forEach((t, i) => { vals[t] = cellOrNull(c[i + 1]); });
  MILITARY_SPECIALIST_AVAILABILITY_REALM.types[key] = { label: lbl, availability: vals };
}

// ---------- 10. JJ Mass Combat for Domain Encounters (JJ pp.106-109) — W2 ----------
// The whole MM priced at platoon scale: per-creature BR + preorganized wandering/lair
// platoon counts + tags (Leaders/Aerial/Aquatic/Invisible) + the Lingering/Lair %.
// Parsed from the JJ markdown (these tables are clean there, unlike the 1d100 identity
// tables); cross-validated at build against the MONSTER_CATALOG battleRating + lairPct
// (the strongest independent oracle — both fields transcribed separately from the MM).
require(path.resolve(REPO, 'acks-engine-catalogs.js'));
require(path.resolve(REPO, 'acks-engine-monsters.js'));
const MONS = global.ACKS;
if(typeof MONS.findMonster !== 'function') die('acks-engine-monsters.js did not expose findMonster');

const JJ_SRC = path.resolve(SOURCES, 'ACKS-II-Judges-Journal.md');
const jjLines = fs.readFileSync(JJ_SRC, 'utf8').split('\n');
function jjFindHeading(text){ for(let i = 0; i < jjLines.length; i++){ if(jjLines[i].trim() === text) return i; } return -1; }
const mcStart = jjFindHeading('# Mass Combat For Domain Encounters Tables');
const mcEnd = jjFindHeading('# The Vagaries of Recruitment');
if(mcStart < 0 || mcEnd < 0 || mcEnd <= mcStart) die('JJ mass-combat table block not found');

// Label → catalog-key resolution, ported from outputs/build_encounter_tables.js (the
// same comma-inverted MM naming). Aliases: family-name inversions the candidate walk
// can't guess + null = expected-unresolved (the catalog's excluded variable monsters —
// Dragons etc. — keep their label; the GM prices them).
const MC_FAMILY_DROP = /^(man|beastman|lycan\.?|lycanthrope|equine|swarm|varmint)$/i;
function mcExpand(s){
  return s
    .replace(/\bV\.\s*Large\b/gi, 'Very Large')
    .replace(/\bVen\./gi, 'Venerable').replace(/\bMat\.\s*/gi, 'Mature ')
    .replace(/\bConstrict(?:ing)?\.\s*/gi, 'Constricting ').replace(/\bConst\.\s*/gi, 'Constricting ');
}
function mcKebab(s){
  return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/['’.]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const MC_LABEL_ALIASES = {
  // family-name inversions / MM-entry renames (the same set the encounter tables carry)
  'Cat, Saber-Tooth': 'saber-tooth-tiger',
  'Ant, Giant': 'giant-ant-worker', 'Bee, Giant Killer': 'worker-bee',
  'Beetle, Giant Bombardier': 'bombardier-beetle', 'Beetle, Giant Luminous': 'luminous-beetle',
  'Beetle, Giant Tiger': 'tiger-beetle', 'Lizard, Giant Horned': 'giant-horned-chameleon',
  'Rhinoceros, Common': 'common-rhino', 'Rhinoceros, Woolly': 'woolly-rhino',
  'Fish, Giant Rockfish': 'rockfish', 'Fish, Giant Sturgeon': 'sturgeon',
  'Spider, Black Widow': 'giant-black-widow', 'Spider, Crab': 'giant-crab-spider',
  'Spider, Tarantula': 'giant-tarantula',
  // expected-unresolved: variants of a single catalog entry (the entry prices the base) …
  'Elephant, War': null, 'Crab, Giant, Hunting': null, 'Wild Huntsman, Lord': null,
  'Hydra, 12 Head': null, 'Hydra, 11 Head': null, 'Hydra, 10 Head': null, 'Hydra, 9 Head': null,
  'Hydra, 8 Head': null, 'Hydra, 7 Head': null, 'Hydra, 6 Head': null, 'Hydra, 5 Head': null,
  // … and the catalog's excluded variable monsters (Dragons, Sphinx, demon manes).
  // NB alias keys are matched AFTER abbreviation expansion ("Ven." → "Venerable").
  'Sphinx': null, 'Manes': null,
  'Dragon, Huge Venerable': null, 'Dragon, Venerable': null, 'Dragon, Ancient': null,
  'Dragon, Very Old': null, 'Dragon, Old': null, 'Dragon, Mature Adult': null, 'Dragon, Adult': null,
  'Dragon, Juvenile': null, 'Dragon, Young': null, 'Dragon, Very Young': null, 'Dragon, Spawn': null
};
function mcResolveKey(rawLabel){
  let s = fixText(rawLabel).replace(/\*+/g, '').trim();
  s = s.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  s = mcExpand(s).replace(/\s+/g, ' ').trim();
  if(Object.prototype.hasOwnProperty.call(MC_LABEL_ALIASES, s)) return MC_LABEL_ALIASES[s];
  const candidates = [];
  const m = s.match(/^([^,]+),\s*(.+)$/);
  if(m){
    const fam = m[1].trim(), variant = m[2].trim();
    candidates.push(mcKebab(variant + ' ' + fam));                  // "Wolf, Dire" → dire-wolf
    if(MC_FAMILY_DROP.test(fam)) candidates.push(mcKebab(variant)); // "Man, Bandit" → bandit
    candidates.push(mcKebab(variant));                              // "Beastman, Orc" → orc
    candidates.push(mcKebab(fam + ' ' + variant));
  }
  candidates.push(mcKebab(s));
  candidates.push(mcKebab(s).replace(/s$/, ''));
  for(const c of candidates){
    if(!c) continue;
    const hit = MONS.findMonster(c);
    if(hit) return hit.key;
  }
  return undefined;   // unresolved — reported below
}
function mcPlatoonSpec(s){
  const t = fixText(s);
  if(!t || /^n\/?a$/i.test(t)) return null;
  const m = t.match(/^(\d+)\s+of\s+(\d+)$/i);
  return m ? { platoons: +m[1], size: +m[2] } : null;
}
function mcBrCell(s){
  const t = fixText(s).replace(/,/g, '');
  if(!t || /^n\/?a$/i.test(t)) return null;
  return /^-?\d+(\.\d+)?$/.test(t) ? +t : null;
}

const JJ_MASS_COMBAT = [];
const mcUnresolved = [];
let mcCategory = null;
for(let i = mcStart + 1; i < mcEnd; i++){
  const t = jjLines[i].trim();
  if(!t.startsWith('|')) continue;
  const cells = t.split('|').slice(1, -1).map(c => c.trim());
  if(cells.length < 7) continue;
  if(/^-{3,}$/.test(cells[0])) continue;                               // separator row
  if(/^br$/i.test(fixText(cells[1]))){ mcCategory = mcKebab(fixText(cells[0])); continue; }  // header → category
  const label = fixText(cells[0]).replace(/\*+/g, '').trim();
  if(!label) continue;
  const br = mcBrCell(cells[1]);
  if(br == null){ warn('JJ mass-combat: unparseable BR for "' + label + '" — row skipped'); continue; }
  const wand = mcPlatoonSpec(cells[2]);
  const wandBr = mcBrCell(cells[3]);
  const lair = mcPlatoonSpec(cells[4]);
  const lairBr = mcBrCell(cells[5]);
  const notes = fixText(cells[6] || '');
  const lingerM = notes.match(/(\d+)\s*%\s*Lingering\/Lair/i);
  const tags = [];
  if(/Leaders/i.test(notes)) tags.push('leaders');
  if(/Aerial/i.test(notes)) tags.push('aerial');
  if(/Aquatic/i.test(notes)) tags.push('aquatic');
  if(/Invisible/i.test(notes)) tags.push('invisible');
  const key = mcResolveKey(label);
  if(key === undefined) mcUnresolved.push(label);
  JJ_MASS_COMBAT.push({
    key: key === undefined ? null : key, label, category: mcCategory, br,
    platoons: wand ? wand.platoons : null, platoonSize: wand ? wand.size : null,
    platoonBr: wand ? wandBr : null,
    lairPlatoons: lair ? lair.platoons : null, lairPlatoonSize: lair ? lair.size : null,
    lairPlatoonBr: lair ? lairBr : null,
    lingerPct: lingerM ? +lingerM[1] : null, tags
  });
}
if(JJ_MASS_COMBAT.length < 150) die('JJ mass-combat parse suspiciously small: ' + JJ_MASS_COMBAT.length + ' rows');
// duplicate-key guard (the pre-marker EXAMPLE table is excluded by the heading range)
{
  const seen = new Set();
  for(const r of JJ_MASS_COMBAT){
    if(!r.key) continue;
    if(seen.has(r.key)) warn('JJ mass-combat: duplicate key ' + r.key + ' (' + r.label + ')');
    seen.add(r.key);
  }
}
// cross-validations vs the MONSTER_CATALOG (informational; printed values kept as printed)
let mcBrExact = 0; const mcBrDiff = [];
let mcLingerMatch = 0; const mcLingerDiff = [];
for(const r of JJ_MASS_COMBAT){
  if(!r.key) continue;
  const m = MONS.findMonster(r.key);
  if(!m) continue;
  if(typeof m.battleRating === 'number'){
    if(Math.abs(m.battleRating - r.br) < 0.0005) mcBrExact++;
    else mcBrDiff.push(r.label + ': JJ ' + r.br + ' vs MM ' + m.battleRating);
  }
  if(r.lingerPct != null && typeof m.lairPct === 'number'){
    if(m.lairPct === r.lingerPct) mcLingerMatch++;
    else mcLingerDiff.push(r.label + ': JJ ' + r.lingerPct + '% vs MM Lair ' + m.lairPct + '%');
  }
}

// ---------- emit ----------
function jsv(v){ return JSON.stringify(v); }
function troopLine(t){
  const parts = [
    'key:' + jsv(t.key), 'race:' + jsv(t.race), 'typeKey:' + jsv(t.typeKey),
    'loadout:' + jsv(t.loadout), 'veteran:' + t.veteran,
    'label:' + jsv(t.label), 'equipment:' + jsv(t.equipment),
    'ac:' + t.ac + (t.acMount != null ? ', acMount:' + t.acMount : ''),
    'moveFt:' + t.moveFt, 'hd:' + jsv(t.hd), 'hp:' + jsv(t.hp),
    'attacks:' + jsv(t.attacks), 'damage:' + jsv(t.damage), 'save:' + jsv(t.save),
    'morale:' + t.morale, 'brPerCreature:' + t.brPerCreature, 'wageGpMonth:' + t.wageGpMonth,
    'category:' + jsv(t.category), 'unitSize:' + t.unitSize,
    'unitDailyMoveMiles:' + (t.unitDailyMoveMiles != null ? t.unitDailyMoveMiles : 'null'),
    'unitWeeklyMoveMiles:' + (t.unitWeeklyMoveMiles != null ? t.unitWeeklyMoveMiles : 'null'),
    'unitSupplyWeekly:' + (t.unitSupplyWeekly != null ? t.unitSupplyWeekly : 'null'),
    'unitBattleRating:' + (t.unitBattleRating != null ? t.unitBattleRating : 'null'),
    'page:' + t.page
  ];
  if(t.variantLabel) parts.splice(5, 0, 'variantLabel:' + jsv(t.variantLabel));
  return '  { ' + parts.join(', ') + ' }';
}
TROOP_CATALOG.sort((a, b) => a.key < b.key ? -1 : 1);
function mcLine(r){
  const n = v => (v != null ? v : 'null');
  return '  { key:' + jsv(r.key) + ', label:' + jsv(r.label) + ', category:' + jsv(r.category)
    + ', br:' + r.br
    + ', platoons:' + n(r.platoons) + ', platoonSize:' + n(r.platoonSize) + ', platoonBr:' + n(r.platoonBr)
    + ', lairPlatoons:' + n(r.lairPlatoons) + ', lairPlatoonSize:' + n(r.lairPlatoonSize) + ', lairPlatoonBr:' + n(r.lairPlatoonBr)
    + ', lingerPct:' + n(r.lingerPct) + ', tags:' + JSON.stringify(r.tags) + ' }';
}

const module_src = `/* =============================================================================
 * acks-engine-troops.js — ACKS God Mode Troop & Army Catalogs (reference-data module)
 *
 * The ACKS II warfare layer's reference tables (Phase 3 Military W1). Mechanical
 * facts only, transcribed from the ACKS II Revised Rulebook (Imperial Imprint /
 * Autarch), each table cited to its printed RR page. NO rule prose is reproduced.
 * GENERATED by outputs/build_troop_catalog.js from the RR markdown tables — edit
 * the generator (and re-run), not this file by hand.
 *
 * SOURCE + IP (CLAUDE.md §13.6): same posture as acks-engine-monsters.js / the
 * encounter tables — mechanical values, page-cited, no prose.
 *
 * Load order: AFTER acks-engine-encounter-tables.js, BEFORE acks-engine.js
 * (the engine's unit/army derived reads consume these via global.ACKS).
 *
 * Catalogs:
 *   TROOP_CATALOG          — RR pp.438–441 Troop Characteristics (per creature) +
 *                            the RR pp.442–444 Unit Characteristics values attached
 *                            (unit move / weekly supply / printed unit BR).
 *                            brPerCreature is the RR per-creature Battle Rating;
 *                            unitBattleRating is the PRINTED unit value (a few
 *                            veteran rows differ from brPerCreature × unitSize by
 *                            design — RR p.443 designer's note).
 *   MERC_WAGES/MERC_MORALE — RR p.429 type × race matrices (null = not fielded).
 *                            Two RR-internal print inconsistencies, kept as printed:
 *                            camel-lancer unit wage p.443 reads 2,400 (≠ 45gp×60 = 2,700
 *                            per p.439 + p.429 — the catalog follows the two agreeing
 *                            tables); hobgoblin horse-archer matrix p.429 reads 75
 *                            (≠ 85gp per p.441 + p.444 — each table kept as printed).
 *   OFFICER_RANKS          — RR p.171 mercenary officer characteristics.
 *   ARMY_ORG_SCALE         — RR p.437 platoon/company/battalion/brigade.
 *   UNIT_SUPPLY_COSTS      — RR p.450 weekly gp per unit by scale (×4 carnivorous;
 *                            hungerless troops e.g. constructs cost 0).
 *   UNIT_LOYALTY_BANDS     — RR p.430 unit loyalty results + calamity kinds.
 *   VASSAL_TROOPS          — RR p.434 realm tiers (Emperor → Viscount → Baron).
 *   MERC_AVAILABILITY_REALM / REALM_RECRUITMENT_FEES /
 *   MILITARY_SPECIALIST_AVAILABILITY_REALM — RR p.428 realm-scale recruitment.
 *   JJ_MASS_COMBAT         — JJ pp.106–109 Mass Combat for Domain Encounters (W2):
 *                            the Monstrous Manual priced at platoon scale (platoon BR
 *                            = 4× the company per-creature BR; platoons of 30 men /
 *                            15 large) with preorganized wandering + lair platoon
 *                            counts, the Lingering/Lair %, and tags. Sourced from the
 *                            ACKS II Judge's Journal; same IP posture.
 * =============================================================================
 */
(function (global) {
  'use strict';
  const ACKS = global.ACKS = global.ACKS || {};

  // RR pp.438–441 (troop rows) + pp.442–444 (unit values). Per-creature stats; page cited.
  const TROOP_CATALOG = [
${TROOP_CATALOG.map(troopLine).join(',\n')}
  ];

  // Market-umbrella ids (HIRELING_MERCENARIES) → canonical troop typeKeys.
  const TROOP_TYPE_ALIASES = {
    'composite-bow': 'composite-bowman',   // the market row covers composite bow OR longbow
    'slingers': 'slinger', 'bowmen': 'bowman', 'crossbowmen': 'crossbowman',
    'longbowmen': 'longbowman', 'cataphracts': 'cataphract-cavalry'
  };
  // The market's generic 'beast-riders' resolves per race (RR pp.440–441 rider rows).
  const BEAST_RIDER_BY_RACE = ${jsv(BEAST_RIDER_BY_RACE)};

  // RR p.429 — type × race wage + morale matrices (regular mercenaries; null = not fielded).
  const MERC_WAGES = ${JSON.stringify(MERC_WAGES, null, 2).replace(/\n/g, '\n  ')};
  const MERC_MORALE = ${JSON.stringify(MERC_MORALE, null, 2).replace(/\n/g, '\n  ')};

  // RR p.171 — Mercenary Officer Characteristics.
  const OFFICER_RANKS = ${JSON.stringify(OFFICER_RANKS, null, 2).replace(/\n/g, '\n  ')};

  // RR p.437 — Army Organization and Size (unit scale by army size + officer qualifications).
  const ARMY_ORG_SCALE = ${JSON.stringify(ARMY_ORG_SCALE, null, 2).replace(/\n/g, '\n  ')};

  // RR p.450 — weekly supply cost per unit by scale. Carnivorous troops/mounts generally ×4;
  // hungerless troops (constructs etc.) cost 0 and never check supply.
  const UNIT_SUPPLY_COSTS = ${JSON.stringify(UNIT_SUPPLY_COSTS, null, 2).replace(/\n/g, '\n  ')};

  // RR p.430 — Unit Loyalty table (2d6 ± loyalty, on each calamity) + the RAW calamity kinds.
  const UNIT_LOYALTY_BANDS = [
    { max: 2,          result: 'hostility',        label: 'Hostility' },
    { min: 3, max: 5,  result: 'resignation',      label: 'Resignation' },
    { min: 6, max: 8,  result: 'grudging-loyalty', label: 'Grudging Loyalty' },
    { min: 9, max: 11, result: 'loyalty',          label: 'Loyalty' },
    { min: 12,         result: 'fanatic-loyalty',  label: 'Fanatic Loyalty' }
  ];
  // Routing from battle / ≥25% casualties / out of supply for a week / unpaid for a month
  // (RR p.430); militia add each full season of campaigning (RR p.433); a non-Chaotic unit
  // seeing same-race casualties/prisoners fed to carnivores (RR p.450). −2 per extra
  // simultaneous calamity. Fanatic Loyalty can never result from going unpaid (treat as Loyalty).
  const UNIT_CALAMITY_KINDS = ['routed', 'casualties-25', 'unsupplied-week', 'unpaid-month',
    'militia-season-campaigning', 'carnivore-atrocity', 'other'];

  // RR p.434 — Vassal Troops by Realm Size (note: Viscount, not "Marquis").
  const VASSAL_TROOPS = ${JSON.stringify(VASSAL_TROOPS, null, 2).replace(/\n/g, '\n  ')};

  // RR p.434 — the realm tier (Vassal Troops by Realm Size) for a given realm-family count.
  // VASSAL_TROOPS is ordered largest→smallest (Emperor → Viscount → Baron); return the largest
  // tier whose realmFamilies.min the realm meets, flooring at the smallest (Baron). NB this keys
  // on VASSAL_TROOPS' OWN family thresholds (the p.434 table), distinct from realmRecruitTier's
  // MERC_AVAILABILITY_REALM thresholds (the p.428 recruitment table — a different tier set).
  function vassalTroopsForRealmFamilies(families){
    const f = Math.max(0, Number(families) || 0);
    for(const tier of VASSAL_TROOPS){
      if(f >= ((tier.realmFamilies && tier.realmFamilies.min) || 0)) return tier;
    }
    return VASSAL_TROOPS[VASSAL_TROOPS.length - 1] || null;
  }

  // RR p.428 — realm-scale recruitment (availability replenishes after the 4th period;
  // arrivals ½ / ¼ / remainder per period; one recruiter per realm at a time).
  const MERC_AVAILABILITY_REALM = ${JSON.stringify(MERC_AVAILABILITY_REALM, null, 2).replace(/\n/g, '\n  ')};
  const REALM_RECRUITMENT_FEES = ${JSON.stringify(REALM_RECRUITMENT_FEES, null, 2).replace(/\n/g, '\n  ')};
  const MILITARY_SPECIALIST_AVAILABILITY_REALM = ${JSON.stringify(MILITARY_SPECIALIST_AVAILABILITY_REALM, null, 2).replace(/\n/g, '\n  ')};

  // JJ pp.106–109 — Mass Combat for Domain Encounters (Phase 3 Military W2): per-creature
  // BR + the preorganized wandering/lair platoon counts + printed platoon BRs (kept as
  // printed — a few diverge from size × br × 4; "some encounter sizes have been adjusted
  // slightly for ease of play", JJ p.106) + the Lingering/Lair % + tags (leaders = foray
  // NPCs not in the unit BR · aerial = +2 reconnaissance · aquatic = land units cannot
  // attack · invisible). key = MONSTER_CATALOG key, resolved at build; null = the
  // catalog's excluded variable monsters (Dragons …) — label kept, the GM prices them.
  const JJ_MASS_COMBAT = [
${JJ_MASS_COMBAT.map(mcLine).join(',\n')}
  ];

  // =========================================================================
  // === Military W7 (burst4) — Conscripts, militia & training (RR pp.430–433)
  //     Hand-authored from the RR p.431 tables (the unit/wage/officer catalogs
  //     above are parsed from the RAW dump; these two W7 tables are literal
  //     constants the generator emits verbatim — keep them here when editing it).
  // =========================================================================

  // RR p.431 — Conscript Qualifying Number (per 120 conscripts), by troop type × race.
  // How many of each troop type a pool of 120 conscripts of a given race yields. The HUMAN
  // column is the systematic source the worked examples use (full + clean); the demi-human/
  // humanoid cells are transcribed where the printed table is legible (a race with no entry
  // for a type simply can't field it). Light infantry: any able-bodied conscript qualifies,
  // so 120 for every race (RR p.430). Human percentages: heavy inf 50% (60), slingers/bowmen/
  // crossbowmen 50% (60), composite bowmen/longbowmen/light cav 25% (30), medium cav 17% (20),
  // horse archers 12.5% (15), heavy cav 8.5% (10), cataphracts 5% (6).
  const CONSCRIPT_QUALIFYING = {
    'light-infantry':    { man:120, dwarf:120, elf:120, kobold:120, goblin:120, orc:120, hobgoblin:120, gnoll:120, lizardman:120, bugbear:120, ogre:120 },
    'heavy-infantry':    { man:60,  dwarf:120, elf:60,  orc:90, hobgoblin:90, gnoll:90, lizardman:90, bugbear:90, ogre:60 },
    'slinger':           { man:60,  goblin:60 },
    'bowman':            { man:60,  elf:120, kobold:60, goblin:60, orc:60, bugbear:60 },
    'composite-bowman':  { man:30,  hobgoblin:60 },
    'crossbowman':       { man:60,  dwarf:60, orc:60 },
    'longbowman':        { man:30,  elf:60, gnoll:60 },
    'light-cavalry':     { man:30,  elf:60, hobgoblin:30 },
    'horse-archers':     { man:15,  elf:30, hobgoblin:15 },
    'medium-cavalry':    { man:20,  hobgoblin:20 },
    'heavy-cavalry':     { man:10 },
    'cataphract-cavalry':{ man:6,   elf:12 },
    'camel-archers':     { man:15 },
    'camel-lancers':     { man:6 },
    'war-elephants':     { man:15 },
    'mounted-crossbowman':{ dwarf:15 },
    'beast-riders':      { kobold:6, goblin:6, orc:6, gnoll:6 }
  };

  // RR p.431 — Training and Equipment Time and Cost (default troop types). perTroopGp is the
  // printed TOTAL COST (TROOP) column (marshal + training + equipment); the unit total = perTroopGp
  // × the troop type's unitSize (e.g. light infantry 88.5 × 120 = 10,620gp — matches the printed
  // Total Cost (Unit) column). Trained conscripts/militia become mercenaries of their type and are
  // paid that type's wage thereafter (RR p.431). ⚠ The RR p.433 Marcus militia EXAMPLE prices heavy
  // infantry at 124gp and light infantry at 94.5gp (≠ this table's 122 / 88.5) — a known RR-internal
  // print inconsistency; the engine follows this systematic table (which the plan §6 cites).
  const TRAINING_COSTS = {
    'light-infantry':    { months:1,  marshalGp:0.5, trainingGp:3,   equipmentGp:85,   perTroopGp:88.5 },
    'heavy-infantry':    { months:1,  marshalGp:1,   trainingGp:6,   equipmentGp:115,  perTroopGp:122 },
    'slinger':           { months:1.5,marshalGp:1.5, trainingGp:4.5, equipmentGp:64,   perTroopGp:70 },
    'bowman':            { months:2,  marshalGp:2,   trainingGp:9,   equipmentGp:76,   perTroopGp:87 },
    'composite-bowman':  { months:3,  marshalGp:3,   trainingGp:27,  equipmentGp:113,  perTroopGp:140 },
    'crossbowman':       { months:1,  marshalGp:1,   trainingGp:9,   equipmentGp:154,  perTroopGp:164 },
    'longbowman':        { months:3,  marshalGp:3,   trainingGp:27,  equipmentGp:100,  perTroopGp:130 },
    'light-cavalry':     { months:3,  marshalGp:3,   trainingGp:45,  equipmentGp:283,  perTroopGp:331 },
    'horse-archers':     { months:6,  marshalGp:12,  trainingGp:135, equipmentGp:298,  perTroopGp:445 },
    'medium-cavalry':    { months:4,  marshalGp:8,   trainingGp:90,  equipmentGp:480,  perTroopGp:578 },
    'heavy-cavalry':     { months:6,  marshalGp:12,  trainingGp:180, equipmentGp:565,  perTroopGp:757 },
    'cataphract-cavalry':{ months:12, marshalGp:48,  trainingGp:450, equipmentGp:746,  perTroopGp:1244 },
    'camel-archers':     { months:6,  marshalGp:12,  trainingGp:90,  equipmentGp:248,  perTroopGp:350 },
    'camel-lancers':     { months:12, marshalGp:48,  trainingGp:270, equipmentGp:273,  perTroopGp:591 },
    'war-elephants':     { months:6,  marshalGp:72,  trainingGp:1080,equipmentGp:6766, perTroopGp:7918 },
    'mounted-crossbowman':{ months:4, marshalGp:8,   trainingGp:110, equipmentGp:226,  perTroopGp:344 },
    'weasel-riders':     { months:6,  marshalGp:12,  trainingGp:210, equipmentGp:1277, perTroopGp:1487 },
    'wolf-riders':       { months:6,  marshalGp:12,  trainingGp:240, equipmentGp:1620, perTroopGp:1767 },
    'boar-riders':       { months:6,  marshalGp:12,  trainingGp:255, equipmentGp:1797, perTroopGp:2064 },
    'hyena-riders':      { months:6,  marshalGp:12,  trainingGp:675, equipmentGp:4497, perTroopGp:5172 }
  };

  // ─── lookups ───
  function normalizeTroopTypeKey(typeKey){
    const k = String(typeKey || '').toLowerCase();
    return TROOP_TYPE_ALIASES[k] || k;
  }
  /**
   * Resolve a TROOP_CATALOG row. findTroopType('heavy-infantry') → the human regular
   * loadout-A row; opts narrow by race / veteran / loadout. The market umbrella ids
   * ('composite-bow', 'beast-riders') resolve through the alias/race maps. Returns null
   * when the race doesn't field the type.
   */
  function findTroopType(typeKey, opts){
    const o = opts || {};
    const race = o.race || 'man';
    let k = normalizeTroopTypeKey(typeKey);
    if(k === 'beast-riders'){ k = BEAST_RIDER_BY_RACE[race] || k; }
    const pool = TROOP_CATALOG.filter(t => t.typeKey === k && t.race === race && t.veteran === !!o.veteran);
    if(!pool.length) return null;
    if(o.loadout){
      const lo = String(o.loadout).toUpperCase();
      const hit = pool.find(t => t.loadout === lo);
      if(hit) return hit;
    }
    return pool.find(t => t.loadout === 'A') || pool[0];
  }
  function troopTypeKeys(){ const s = new Set(TROOP_CATALOG.map(t => t.typeKey)); return Array.from(s).sort(); }
  function troopTypesForRace(race, opts){
    const o = opts || {};
    return TROOP_CATALOG.filter(t => t.race === (race || 'man') && (o.veteran == null || t.veteran === !!o.veteran));
  }
  function mercWage(typeKey, race){
    const k = normalizeTroopTypeKey(typeKey);
    const row = MERC_WAGES[k] || (k === 'weasel-riders' || k === 'wolf-riders' || k === 'boar-riders' || k === 'hyena-riders' ? MERC_WAGES['beast-riders'] : null);
    return row ? (row[race || 'man'] != null ? row[race || 'man'] : null) : null;
  }
  function mercMorale(typeKey, race){
    const k = normalizeTroopTypeKey(typeKey);
    const row = MERC_MORALE[k] || (k === 'weasel-riders' || k === 'wolf-riders' || k === 'boar-riders' || k === 'hyena-riders' ? MERC_MORALE['beast-riders'] : null);
    return row ? (row[race || 'man'] != null ? row[race || 'man'] : null) : null;
  }
  function findOfficerRank(key){ const k = String(key || '').toLowerCase(); return OFFICER_RANKS.find(r => r.key === k) || null; }
  function scaleRow(scale){ const k = String(scale || 'company').toLowerCase(); return ARMY_ORG_SCALE.find(r => r.scale === k) || null; }
  /** RR p.437 — the unit scale an army of N troops should organize at. */
  function armyScaleForSize(totalTroops){
    const n = Math.max(0, Number(totalTroops) || 0);
    for(const r of ARMY_ORG_SCALE){
      if(r.armySizeMax == null || n <= r.armySizeMax) return r.scale;
    }
    return 'brigade';
  }
  /** RR p.450 — weekly supply cost for one unit. category 'infantry'|'cavalry'|'large'
   *  ('large' supplies as cavalry); carnivorousMult defaults 1 (RAW guidance ×4). */
  function unitScaleSupplyCost(category, scale, carnivorousMult){
    const sc = UNIT_SUPPLY_COSTS[String(scale || 'company').toLowerCase()];
    if(!sc) return null;
    const cat = (category === 'infantry') ? 'infantry' : 'cavalry';
    return sc[cat] * (carnivorousMult || 1);
  }
  /** RR p.430 — band a unit-loyalty roll result. */
  function unitLoyaltyBand(total){
    for(const b of UNIT_LOYALTY_BANDS){
      if((b.min == null || total >= b.min) && (b.max == null || total <= b.max)) return b;
    }
    return null;
  }
  /** JJ pp.106–109 — the mass-combat row for a creature (a MONSTER_CATALOG key, an
   *  alias the catalog folds, or the printed label). Null when the creature isn't
   *  tabled (the GM prices it off its MM stats). */
  function massCombatRow(keyOrLabel){
    if(keyOrLabel == null) return null;
    const raw = String(keyOrLabel).toLowerCase();
    if(!raw) return null;
    const viaCatalog = (typeof ACKS.findMonster === 'function') ? ACKS.findMonster(raw) : null;
    const k = viaCatalog ? viaCatalog.key : raw;
    return JJ_MASS_COMBAT.find(r => r.key === k)
      || JJ_MASS_COMBAT.find(r => (r.label || '').toLowerCase() === raw)
      || null;
  }

  // ─── Military W7 (burst4) — conscript/militia/training lookups (RR pp.430–433) ───
  /** RR p.431 — number of \`typeKey\` troops a 120-conscript pool of \`race\` yields (0 = the
   *  race can't field that type). Aliases (composite-bow, beast-riders) fold first. */
  function conscriptQualifyingNumber(typeKey, race){
    const k = normalizeTroopTypeKey(typeKey);
    // beast-riders is its own row in the qualifying table (the per-race rider is resolved later).
    const row = CONSCRIPT_QUALIFYING[k] || (BEAST_RIDER_BY_RACE[k] ? CONSCRIPT_QUALIFYING['beast-riders'] : null);
    if(!row) return 0;
    const v = row[race || 'man'];
    return typeof v === 'number' ? v : 0;
  }
  /** RR p.431 — the MAX of \`typeKey\` a levy of \`count\` (living) recruits of \`race\` can yield:
   *  floor(count × QualifyingNumber / 120). 0 = the pool is too small to field even one (e.g. 5
   *  conscripts → 0 heavy cavalry). The cap the Train action enforces; the unqualified rest stay levy. */
  function conscriptQualifyingMax(count, typeKey, race){
    const q = conscriptQualifyingNumber(typeKey, race);
    return Math.floor(Math.max(0, Number(count) || 0) * q / 120);
  }
  /** RR p.431 — {months, perTroopGp, unitGp} to train + equip one conscript/militiaman as
   *  \`typeKey\` (unitGp = perTroopGp × the type's unitSize). null when the type isn't trainable. */
  function trainingCostFor(typeKey, race){
    const k = normalizeTroopTypeKey(typeKey);
    const t = TRAINING_COSTS[k] || (BEAST_RIDER_BY_RACE[k] ? TRAINING_COSTS[BEAST_RIDER_BY_RACE[k]] : null);
    if(!t) return null;
    const lookupKey = k === 'beast-riders' ? (BEAST_RIDER_BY_RACE[race] || k) : k;
    // unitSize is a property of the troop type (cavalry 60 / infantry 120 / large 5…), consistent
    // across races; fall back to ANY catalog row of the type when the race row isn't found (e.g.
    // wolf-riders are goblin-only, so the default 'man' lookup misses — the printed Unit total uses
    // the type's natural unit size, RR p.443).
    let row = findTroopType(lookupKey, { race: race || 'man' });
    if(!row) row = TROOP_CATALOG.find(x => x.typeKey === lookupKey && !x.veteran) || TROOP_CATALOG.find(x => x.typeKey === lookupKey);
    const unitSize = (row && row.unitSize) || 120;
    return { months: t.months, marshalGp: t.marshalGp, trainingGp: t.trainingGp, equipmentGp: t.equipmentGp,
             perTroopGp: t.perTroopGp, unitGp: t.perTroopGp * unitSize };
  }
  /** Training months for a troop type (RR p.431), or null. */
  function trainingMonthsFor(typeKey){ const c = trainingCostFor(typeKey); return c ? c.months : null; }
  /** The monthly wage a TRAINED conscript/militiaman of \`typeKey\` is paid (= the mercenary wage of
   *  that type/race — RR p.431). Falls back to the catalog row's wage. */
  function trainedTroopWage(typeKey, race, veteran){
    const w = mercWage(typeKey, race || 'man');
    if(typeof w === 'number') return w;
    const row = findTroopType(typeKey, { race: race || 'man', veteran: !!veteran });
    return row ? row.wageGpMonth : 0;
  }
  /** Troop types a race can be trained into (qualifying number > 0), sorted. */
  function trainableTroopTypes(race){
    const r = race || 'man';
    return Object.keys(TRAINING_COSTS).filter(k => conscriptQualifyingNumber(k, r) > 0).sort();
  }

  // ─── Military W7-continuation — realm-scale recruitment lookups (RR p.428) ───
  /** RR p.428 — the realm recruitment tier for a realm of \`families\` (continent→barony), by the
   *  catalog's own population-family thresholds. Floors at 'barony' (the smallest recruiting tier). */
  function realmRecruitTier(families){
    const f = Math.max(0, Number(families) || 0);
    const pf = MERC_AVAILABILITY_REALM.populationFamilies;
    for(const tier of MERC_AVAILABILITY_REALM.tiers){          // ordered continent→barony (largest first)
      if(f >= (pf[tier] || 0)) return tier;
    }
    return 'barony';                                           // floor (RR p.428)
  }
  /** The recruitable mercenary type keys (RR p.428 realm-availability table). */
  function realmRecruitMercTypes(){ return Object.keys(MERC_AVAILABILITY_REALM.types); }
  /** RR p.428 — how many of \`typeKey\` a realm of \`tier\` can recruit per time period (0 = not fielded). */
  function realmMercAvailable(tier, typeKey){
    const row = MERC_AVAILABILITY_REALM.types[normalizeTroopTypeKey(typeKey)];
    const v = row ? row[tier] : null;
    return (typeof v === 'number') ? v : 0;
  }
  /** RR p.428 — the one-time recruitment fee spec ({dice, multiplierGp, text}) for a realm \`tier\`. */
  function realmRecruitFeeSpec(tier){ return REALM_RECRUITMENT_FEES[tier] || null; }
  /** RR p.428 — the length in days of a realm tier's recruitment time period (week/month/season/year). */
  function realmRecruitPeriodDays(tier){
    const p = (MERC_AVAILABILITY_REALM.timePeriod || {})[tier];
    return p === 'year' ? 360 : p === 'season' ? 90 : p === 'month' ? 30 : 7;   // week (default)
  }
  /** The recruitable military-specialist type keys (RR p.428 — artillerists / armorers / creature
   *  handlers / marshals / mercenary officers / quartermaster / siege engineer). */
  function realmSpecialistTypes(){ return Object.keys(MILITARY_SPECIALIST_AVAILABILITY_REALM.types); }
  /** RR p.428 — how many of military-specialist \`typeKey\` a realm of \`tier\` can recruit per period
   *  (0 = not fielded at that tier). NB the specialist catalog nests counts under \`.availability\`
   *  (unlike MERC_AVAILABILITY_REALM, which stores them directly on the type row). */
  function realmSpecialistAvailable(tier, typeKey){
    const row = MILITARY_SPECIALIST_AVAILABILITY_REALM.types[String(typeKey || '').toLowerCase()];
    const v = (row && row.availability) ? row.availability[tier] : null;
    return (typeof v === 'number') ? v : 0;
  }
  /** RR p.428 / p.171 — the hire profile for a military specialist \`typeKey\`:
   *  { label, isOfficer, level, wageGp, proficiencies[], [leadershipAbility, strategicAbility, moraleModifier] }.
   *  Mercenary officers (mercenary-officer-*) carry EXACT RR p.171 characteristics (OFFICER_RANKS — level /
   *  wage / LA / SA / MM / Command + Military Strategy). Other specialists get level 0 + a best-effort wage
   *  (an exact HIRELING_SPECIALISTS id match — e.g. armorer→75gp; else 0 = GM-set, the lightweight stub's
   *  point). 🔧 v1: officer wages exact; the rest GM-set (the RR p.428 specialist wages aren't in the shipped
   *  catalog — transcribing them is a follow-on, not invented here). Returns null for an unknown type. */
  function realmSpecialistProfile(typeKey){
    const key = String(typeKey || '').toLowerCase();
    const cat = MILITARY_SPECIALIST_AVAILABILITY_REALM.types[key];
    if(!cat) return null;
    const officerKey = key.indexOf('mercenary-officer-') === 0 ? key.slice('mercenary-officer-'.length) : null;
    const rank = officerKey ? findOfficerRank(officerKey) : null;
    if(rank){
      return { label: cat.label, isOfficer: true, level: rank.level, wageGp: rank.costGpMonth,
               leadershipAbility: rank.leadershipAbility, strategicAbility: rank.strategicAbility,
               moraleModifier: rank.moraleModifier, proficiencies: (rank.proficiencies || []).slice() };
    }
    const hs = ((ACKS && ACKS.HIRELING_SPECIALISTS) || []).find(s => s.id === key);
    const wageGp = (hs && typeof hs.wage === 'number') ? hs.wage : 0;
    return { label: cat.label, isOfficer: false, level: 0, wageGp: wageGp, proficiencies: [] };
  }

  Object.assign(ACKS, {
    TROOP_CATALOG, TROOP_TYPE_ALIASES, BEAST_RIDER_BY_RACE,
    MERC_WAGES, MERC_MORALE, OFFICER_RANKS, ARMY_ORG_SCALE,
    UNIT_SUPPLY_COSTS, UNIT_LOYALTY_BANDS, UNIT_CALAMITY_KINDS, VASSAL_TROOPS,
    MERC_AVAILABILITY_REALM, REALM_RECRUITMENT_FEES, MILITARY_SPECIALIST_AVAILABILITY_REALM,
    JJ_MASS_COMBAT, massCombatRow,
    normalizeTroopTypeKey, findTroopType, troopTypeKeys, troopTypesForRace,
    mercWage, mercMorale, findOfficerRank, scaleRow, armyScaleForSize,
    unitScaleSupplyCost, unitLoyaltyBand,
    // W7 — conscripts/militia/training
    CONSCRIPT_QUALIFYING, TRAINING_COSTS,
    conscriptQualifyingNumber, conscriptQualifyingMax, trainingCostFor, trainingMonthsFor, trainedTroopWage, trainableTroopTypes,
    // W7-continuation — realm-scale recruitment (RR p.428)
    realmRecruitTier, realmRecruitMercTypes, realmMercAvailable, realmRecruitFeeSpec, realmRecruitPeriodDays,
    realmSpecialistTypes, realmSpecialistAvailable, realmSpecialistProfile,
    // W7-continuation — standing-army capacity (RR p.434)
    vassalTroopsForRealmFamilies
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = ACKS;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
`;

fs.writeFileSync(path.resolve(REPO, 'acks-engine-troops.js'), module_src);

// ---------- report ----------
console.log('TROOP_CATALOG rows:', TROOP_CATALOG.length,
  '(veteran ' + TROOP_CATALOG.filter(t => t.veteran).length + ')');
const byRace = {};
TROOP_CATALOG.forEach(t => { byRace[t.race] = (byRace[t.race] || 0) + 1; });
console.log('  by race:', JSON.stringify(byRace));
console.log('Unit-summary rows parsed:', unitRowCount, '| wage-verified:', wageVerified);
console.log('BR derivation: match', brDerivedMatch, '| designer-note divergence', brDerivedMismatch.length);
brDerivedMismatch.forEach(m => console.log('   BR÷ ', m));
console.log('Wage-matrix cells cross-checked:', matrixChecks);
console.log('Officer ranks:', OFFICER_RANKS.map(r => r.key + '@' + r.costGpMonth).join(', '));
console.log('Org scales:', ARMY_ORG_SCALE.map(r => r.scale + '≤' + (r.armySizeMax || '∞')).join(', '));
console.log('Supply costs:', JSON.stringify(UNIT_SUPPLY_COSTS));
console.log('Vassal tiers:', VASSAL_TROOPS.map(v => v.title).join(', '));
console.log('Realm availability types:', Object.keys(MERC_AVAILABILITY_REALM.types).length,
  '| specialists:', Object.keys(MILITARY_SPECIALIST_AVAILABILITY_REALM.types).length);
console.log('JJ_MASS_COMBAT rows:', JJ_MASS_COMBAT.length,
  '| keyed:', JJ_MASS_COMBAT.filter(r => r.key).length,
  '| label-only:', JJ_MASS_COMBAT.filter(r => !r.key).length);
const mcByCat = {};
JJ_MASS_COMBAT.forEach(r => { mcByCat[r.category] = (mcByCat[r.category] || 0) + 1; });
console.log('  by category:', JSON.stringify(mcByCat));
console.log('  BR vs MM battleRating: exact', mcBrExact, '| divergent', mcBrDiff.length);
mcBrDiff.forEach(d => console.log('    BR≠ ', d));
console.log('  Linger%% vs MM lairPct: match', mcLingerMatch, '| divergent', mcLingerDiff.length);
mcLingerDiff.forEach(d => console.log('    L%≠ ', d));
console.log('\n--- JJ mass-combat UNRESOLVED labels (' + mcUnresolved.length + ') — add MC_LABEL_ALIASES (key, or null = expected) ---');
mcUnresolved.forEach(u => console.log('  ?? ' + u));
console.log('\nWARNINGS (' + warnings.length + '):');
warnings.forEach(w => console.log('  ⚠ ' + w));
console.log('\nmodule written: acks-engine-troops.js');
