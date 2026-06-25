// tools/build/build_catalog.js — normalize mm_parsed.json → MONSTER_CATALOG and EMIT the engine
// module acks-engine-monsters.js (mechanical fields only, MM-cited). Run AFTER parse_mm.js.
// Tracked in the repo (audit A7, 2026-06-24): both this generator AND its emitted module are committed.
// Input mm_parsed.json (committed alongside) is mechanical stat-block fields + page refs only — no MM prose (§13.6).
'use strict';
const fs = require('fs');
const path = require('path');

// audit A7 (2026-06-24): generator moved outputs/ → tools/build/ (now two levels below the
// repo root). Anchors keep the paths readable from the new depth.
const REPO = path.resolve(__dirname, '..', '..');           // the "ACKS God Mode/" repo root
const parsed = require('./mm_parsed.json');

const TYPES = ['animal', 'beastman', 'construct', 'enchanted', 'giant', 'humanoid', 'incarnation', 'monstrosity', 'ooze', 'plant', 'undead', 'vermin'];
function fixText(s) { return String(s || '').replace(/Â½/g, '½').replace(/Â¼/g, '¼').replace(/â€™|â€˜/g, "'").replace(/â€“|â€”/g, '–').replace(/[­]/g, '').replace(/�/g, '').replace(/\s+/g, ' ').trim(); }
function slug(name) { return fixText(name).toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }
function creatureTypes(t) { const s = fixText(t).toLowerCase(); const o = []; for (const x of TYPES) if (new RegExp('\\b' + x).test(s)) o.push(x === 'enchanted' ? 'enchanted-creature' : x); return o.length ? o : (s ? ['monstrosity'] : []); }
function intLead(s) { const m = fixText(s).replace(/,/g, '').match(/-?\d+/); return m ? +m[0] : null; }
function hdClean(s) { const m = fixText(s).match(/^\s*([\d½¼]+(?:\/\d+)?(?:\s*[+\-]\s*\d+)?\*{0,3})/); return m ? m[1].replace(/\s+/g, '') : (fixText(s).split(/[\s(]/)[0] || ''); }
function lairPct(s) { const t = fixText(s); if (/nil|none|^0$/i.test(t)) return 0; const m = t.match(/(\d+)\s*%/); return m ? +m[1] : null; }
function treasure(s) { const t = fixText(s); if (/^(nil|none|–|-)?$/i.test(t)) return ''; const m = t.match(/^([A-R](?:\s*\+\s*[A-R])?(?:\s*,\s*[A-R])*)/); return m ? m[1].replace(/\s+/g, '') : ''; }
function dice(s) { const m = fixText(s).match(/\d*d\d+(?:[+\-]\d+)?|\b\d+\b/); return m ? m[0] : ''; }
function naField(wild) { const w = fixText(wild).split('/'); return { wandering: dice(w[0] || ''), lair: dice(w[1] || w[0] || '') }; }
// MM Secondary Characteristics (Phase 3 Military W1, 2026-06-12): weekly army supply
// cost per creature (RR p.450 points here) + per-creature/unit Battle Ratings.
// "None" (constructs/undead — hungerless, RR p.450) → 0; "Varies by Size"/"Special" → null.
function supplyField(s) {
  const t = fixText(s);
  if (/^none$/i.test(t)) return { cost: 0, carnivorous: false };
  const m = t.match(/([\d.]+)\s*(?:gp)?/);
  if (!m) return { cost: null, carnivorous: false };
  return { cost: +m[1], carnivorous: /carnivor/i.test(t) };
}
function brField(s) {
  // "0.236 (individual), 14 (unit)" — plus the MM's quirks: multi-kit races print a RANGE
  // ("0.005 – 0.161 (ind.)" — goblin LI → wolf riders; we take the LOW end = the base
  // unkitted creature; kit-specific values are TROOP_CATALOG / the JJ platoon tables, W2);
  // "(monster)" (hill giant) = individual; "(individual0" OCR glitch; "None" = 0 (no battle
  // value — shrieking fungus). The � mojibake is an en-dash.
  // NB fixText STRIPS the mojibake en-dash entirely, so a range can reach us as two
  // bare space-separated numbers ("0.005 0.161 (ind.)") — whitespace counts as a separator.
  const t = fixText(s);
  if (/^none$/i.test(t)) return { individual: 0, unit: 0 };
  const RANGE = '(?:(?:\\s*(?:[-\\/]|or)\\s*|\\s+)\\.?[\\d.]+)?';
  const ind = t.match(new RegExp('([\\d.]+)' + RANGE + '\\s*\\((?:ind|monster)', 'i'));
  const unit = t.match(new RegExp('([\\d.]+)' + RANGE + '\\s*\\(unit', 'i'));
  const lead = t.match(/^([\d.]+)/);
  return {
    individual: ind ? +ind[1] : (lead && !unit ? +lead[1] : null),
    unit: unit ? +unit[1] : null
  };
}

// Hand corrections for known parse victims (cascade/aquatic + the Men variant-stat blocks the
// validator rejected — "1-1 (regular) or 1 (veteran)", "By armor" AC, field slides). Values are
// the MM's regular/majority kit (the 67–75% line), coarsened to one mechanical row like every
// other Men entry. Applied PRE-validation. (E4: the JJ encounter tables roll these constantly.)
const FIXUPS = {
  lizardman: { treasureType: 'J', alignment: 'Chaotic', numberAppearing: { wandering: '1d8', lair: '1d10' } },
  bandit: { morale: -1 },                                                       // MM p.216 Morale -1 (parser missed it)
  brigand: { hd: '1', ac: 2 },                                                  // MM p.218: HD 1, AC by armor → leather (bowmen regulars); shipped "By"/60 were column slides
  merchant: { numberAppearing: { wandering: '1d4', lair: '1' } },               // MM p.220 Caravan (1d4×10) — the × was lost ("1d410"); coarsened to caravans like the other Men group dice
  nomad: {                                                                      // MM p.224 — variant block + field slide rejected it
    hd: '1-1', ac: 2, save: 'F0', morale: 0, lairPct: 10, alignment: 'Neutral', treasureType: 'G',
    numberAppearing: { wandering: '1d4', lair: '2d6' },                         // Caravan (1d4×10) / Camp (2d6 caravans)
    xp: 5, attacks: '1 (weapon 11+)', damage: 'By weapon', expeditionSpeed: 'By mount'
  },
  patroller: {                                                                  // MM p.224
    hd: '1-1', ac: 2, save: 'F0', morale: 0, lairPct: 10, alignment: 'Lawful', treasureType: 'E',
    numberAppearing: { wandering: '1d10', lair: '2d3' },                        // Band (1d10 patrols) / Camp (2d3 bands)
    xp: 5, attacks: '1 (weapon 11+)', damage: 'By weapon'
  },
  raider: {                                                                     // MM p.228
    hd: '1-1', ac: 2, save: 'F0', morale: 0, lairPct: 10, alignment: 'Neutral', treasureType: 'E',
    numberAppearing: { wandering: '1d8', lair: '1d6' },                         // Warband (1d8 gangs) / Camp (1d6 warbands)
    xp: 5, attacks: '1 (weapon 11+)', damage: 'By weapon'
  },
  centaur: { xp: 80 },                                                          // MM p.84 — XP "80 (warrior), …" rejected by intLead… actually intLead handles it; the variant list tripped validation
  haugbui: { lairPct: 100, morale: 4 },                                         // MM p.173 — Lair "Always"; Morale "N/A when controlled, +4 otherwise"
  'mustard-mold': { ac: 0 }                                                     // MM — AC "None" (a mold); 0 in the mechanical field
};

// Entries the MM prints inside an umbrella block parse_mm.js never split (the Herd Animal page
// stats four sizes; only three landed in mm_parsed.json) or under formats it missed entirely
// (bold-prose blocks, diacritic headings). Hand-built from the MM tables — the JJ encounter
// tables (#476 E4) roll all of these. canTrack per the MM senses (Acute Olfaction → true).
const INJECT = [
  { key: 'large-herd-animal', name: 'Large Herd Animal', page: 180, creatureTypes: ['animal'],
    hd: '3', ac: 2, save: 'F2', morale: -1, speed: "60' / 180'", expeditionSpeed: '36 miles',
    lairPct: 0, treasureType: '', alignment: 'Neutral', xp: 50, canTrack: false,
    numberAppearing: { wandering: '5d10', lair: '5d10' }, attacks: '1 (kick or butt 8+)', damage: '1d4 or 1d8', _bad: [] },
  { key: 'huge-herd-animal', name: 'Huge Herd Animal', page: 182, creatureTypes: ['animal'],
    hd: '5', ac: 2, save: 'F3', morale: 0, speed: "60' / 180'", expeditionSpeed: '36 miles',
    lairPct: 0, treasureType: '', alignment: 'Neutral', xp: 200, canTrack: false,
    numberAppearing: { wandering: '5d10', lair: '5d10' }, attacks: '1 (kick or butt 6+)', damage: '1d8 or 1d12', _bad: [] },
  { key: 'baleygr', name: 'Báleygr', page: 33, creatureTypes: ['incarnation'],
    hd: '12*', ac: 10, save: 'F12', morale: 4, speed: "40' / 120'", expeditionSpeed: '24 miles',
    lairPct: 10, treasureType: 'Q', alignment: 'Chaotic', xp: 5700, canTrack: false,
    numberAppearing: { wandering: '1d4', lair: '2d4' }, attacks: '1 (weapon or whip -1+)', damage: '4d6 or 2d6 + drag', _bad: [] },
  { key: 'child-of-nasga', name: 'Child of Nasga', page: 87, creatureTypes: ['incarnation'],
    hd: '8****', ac: 6, save: 'C8', morale: 4, speed: "40' / 120'", expeditionSpeed: '24 miles',
    lairPct: 90, treasureType: 'N,D', alignment: 'Chaotic', xp: 2600, canTrack: false,
    numberAppearing: { wandering: '1', lair: '1' }, attacks: '2 (bite, constrict 3+)', damage: '1d4 + poison / 2d8', _bad: [] },
  { key: 'doppelganger', name: 'Doppelgänger', page: 103, creatureTypes: ['monstrosity'],
    hd: '4*', ac: 4, save: 'F10', morale: 2, speed: "30' / 90'", expeditionSpeed: '18 miles',
    lairPct: 20, treasureType: 'G', alignment: 'Chaotic', xp: 135, canTrack: false,
    numberAppearing: { wandering: '1d6', lair: '1d6' }, attacks: '1 (bite 7+)', damage: '1d12', _bad: [] },
  { key: 'giant-carnivorous-fly', name: 'Giant Carnivorous Fly', page: 141, creatureTypes: ['animal'],
    hd: '2*', ac: 3, save: 'F1', morale: -2, speed: "40' / 120'", expeditionSpeed: '',
    lairPct: 25, treasureType: 'A', alignment: 'Neutral', xp: 29, canTrack: true,
    numberAppearing: { wandering: '1d4', lair: '1d4' }, attacks: '1 (bite 9+)', damage: '1d4', _bad: [] },
  { key: 'galdrtre', name: 'Galdrtré', page: 145, creatureTypes: ['plant'],
    hd: '8', ac: 7, save: 'F8', morale: -2, speed: "5' / 15'", expeditionSpeed: '3 miles',
    lairPct: 90, treasureType: 'M,P', alignment: 'Neutral', xp: 1600, canTrack: false,    // print: alignment "Varies" — Neutral as the mechanical median
    numberAppearing: { wandering: '1d4', lair: '1d8' }, attacks: '3 (2 roots, 1 branch 3+)', damage: '2d6 / 2d6 / 3d6', _bad: [] },
  { key: 'giant-constricting-viper-snake', name: 'Giant Constricting Viper Snake', page: 284, creatureTypes: ['animal'],
    hd: '15**', ac: 3, save: 'F5', morale: 2, speed: "30' / 90'", expeditionSpeed: '18 Miles',
    lairPct: 25, treasureType: 'P', alignment: 'Neutral', xp: 4200, canTrack: true,
    numberAppearing: { wandering: '1', lair: '1d2' }, attacks: '2 (bite, constrict -4+)', damage: '3d6 + poison / 5d6', _bad: [] }
];

// Military W1 — supply + BR for the hand-built INJECT entries, transcribed from each
// creature's MM Secondary Characteristics block (verified 2026-06-12).
const INJECT_MILITARY = {
  'large-herd-animal':              { supplyCostWeekly: 4,  supplyCarnivorous: false, battleRating: 0.016, battleRatingUnit: 1 },
  'huge-herd-animal':               { supplyCostWeekly: 12, supplyCarnivorous: false, battleRating: 0.034, battleRatingUnit: 0.5 },
  'baleygr':                        { supplyCostWeekly: 0,  supplyCarnivorous: false, battleRating: 9.5,   battleRatingUnit: 185 },
  'child-of-nasga':                 { supplyCostWeekly: 0,  supplyCarnivorous: false, battleRating: 1.927, battleRatingUnit: 115.5 },
  'doppelganger':                   { supplyCostWeekly: 2,  supplyCarnivorous: false, battleRating: 0.592, battleRatingUnit: 71 },
  'giant-carnivorous-fly':          { supplyCostWeekly: 2,  supplyCarnivorous: true,  battleRating: 0.035, battleRatingUnit: 4 },
  'galdrtre':                       { supplyCostWeekly: 0,  supplyCarnivorous: false, battleRating: 1.88,  battleRatingUnit: 24 },
  'giant-constricting-viper-snake': { supplyCostWeekly: 96, supplyCarnivorous: true,  battleRating: 0.515, battleRatingUnit: 2.5 }
};
INJECT.forEach(e => Object.assign(e,
  INJECT_MILITARY[e.key] || { supplyCostWeekly: null, supplyCarnivorous: false, battleRating: null, battleRatingUnit: null }));

const ALIGN_RE = /lawful|neutral|chaotic/i;
const seen = new Map(); const out = [];
for (const m of parsed) {
  const f = m.fields;
  const key = slug(m.name);
  const e = {
    key, name: fixText(m.name), page: m.page || null,
    creatureTypes: creatureTypes(f.Type),
    hd: hdClean(f['Hit Dice']), ac: intLead(f['Armor Class']), save: fixText(f.Save), morale: intLead(f.Morale),
    speed: fixText(f.Speed), expeditionSpeed: fixText(f['Expedition Speed']),
    lairPct: lairPct(f.Lair), alignment: fixText(f.Alignment), treasureType: treasure(f['Treasure Type']),
    numberAppearing: naField(f['Wilderness Enc']), xp: intLead(f.XP),
    attacks: fixText(f.Attacks), damage: fixText(f.Damage),
    canTrack: /olfaction/i.test(fixText(f['Other Senses'])) || /tracking/i.test(fixText(f.Proficiencies))
  };
  // Military W1 — supply + battle-rating secondary characteristics (additive; null = the MM
  // prints "Varies"/"Special" — Dragons, Living Ancestor, Vampire — GM-priced at the table).
  const sup = supplyField(f['Supply Cost']);
  const brv = brField(f['Battle Rating']);
  e.supplyCostWeekly = sup.cost; e.supplyCarnivorous = sup.carnivorous;
  e.battleRating = brv.individual; e.battleRatingUnit = brv.unit;
  if (FIXUPS[key]) Object.assign(e, FIXUPS[key]);
  const bad = [];
  if (!ALIGN_RE.test(e.alignment)) bad.push('align');
  if (e.lairPct === null) bad.push('lair');
  if (e.ac === null) bad.push('ac');
  if (!e.hd || /vary/i.test(e.hd)) bad.push('hd');
  if (e.xp === null) bad.push('xp');
  e._bad = bad;
  if (seen.has(key)) { const p = seen.get(key); if (e._bad.length < p._bad.length) { out[out.indexOf(p)] = e; seen.set(key, e); } continue; }
  seen.set(key, e); out.push(e);
}

const ship = out.filter(e => !e._bad.length).concat(INJECT);
const excluded = out.filter(e => e._bad.length);
// normalize alignment to canonical word(s)
function canonAlign(a) { const s = a.toLowerCase(); const w = []; if (/lawful/.test(s)) w.push('Lawful'); if (/neutral/.test(s)) w.push('Neutral'); if (/chaotic/.test(s)) w.push('Chaotic'); return w.join('/') || 'Neutral'; }

// ---- emit module ----
function jsStr(s) { return JSON.stringify(s == null ? '' : s); }
function entryLine(e) {
  return `  { key:${jsStr(e.key)}, name:${jsStr(e.name)}, page:${e.page || 'null'}, ` +
    `creatureTypes:${JSON.stringify(e.creatureTypes)}, hd:${jsStr(e.hd)}, ac:${e.ac}, save:${jsStr(e.save)}, morale:${e.morale}, ` +
    `speed:${jsStr(e.speed)}, expeditionSpeed:${jsStr(e.expeditionSpeed)}, lairPct:${e.lairPct}, treasureType:${jsStr(e.treasureType)}, ` +
    `alignment:${jsStr(canonAlign(e.alignment))}, xp:${e.xp}, canTrack:${e.canTrack}, ` +
    `numberAppearing:{ wandering:${jsStr(e.numberAppearing.wandering)}, lair:${jsStr(e.numberAppearing.lair)} }, ` +
    `attacks:${jsStr(e.attacks)}, damage:${jsStr(e.damage)}, ` +
    `supplyCostWeekly:${e.supplyCostWeekly == null ? 'null' : e.supplyCostWeekly}, supplyCarnivorous:${!!e.supplyCarnivorous}, ` +
    `battleRating:${e.battleRating == null ? 'null' : e.battleRating}, battleRatingUnit:${e.battleRatingUnit == null ? 'null' : e.battleRatingUnit} }`;
}
ship.sort((a, b) => a.key < b.key ? -1 : 1);
const header = `/* =============================================================================
 * acks-engine-monsters.js — ACKS God Mode Monster Catalog (reference-data module)
 *
 * Mechanical monster statistics for the wilderness/lair encounter + Monster
 * Persistence (#476) generation pipeline (Phase 3 Encounters #141 shares it).
 *
 * SOURCE + IP (CLAUDE.md §13.6): mechanical facts only — Hit Dice, AC, save,
 * morale, speed, Lair %, number appearing, Treasure Type, XP — transcribed from
 * the ACKS II Monstrous Manual (Imperial Imprint / Autarch), each entry cited to
 * its printed MM page. NO descriptive/flavour prose is reproduced. This file is
 * GENERATED by outputs/build_catalog.js from the MM stat blocks — edit the
 * generator (and re-run), not this file by hand.
 *
 * Load order: AFTER acks-engine-catalogs.js, BEFORE acks-engine.js (generation in
 * the engine reads MONSTER_CATALOG via global.ACKS).
 *
 * Fields: lairPct 0 = never lairs; treasureType '' = no hoard; numberAppearing
 * dice are the RAW wilderness wandering/lair sizes; canTrack is DERIVED from the
 * MM senses/proficiencies (Acute Olfaction / Tracking). supplyCostWeekly is the
 * MM secondary characteristic the army supply rules point at (RR p.450; 0 =
 * hungerless, null = "Varies"/"Special" — GM-priced); battleRating /
 * battleRatingUnit are the MM per-creature / preorganized-unit Battle Ratings
 * (groupBattleRating + the JJ pp.104–106 mass-combat layer read them — Phase 3
 * Military W1). ${ship.length} entries.
 * =============================================================================
 */
(function (global) {
  'use strict';
  const ACKS = global.ACKS = global.ACKS || {};

  // Mechanical statistics only (see header). MM page cited per entry.
  const MONSTER_CATALOG = [
${ship.map(entryLine).join(',\n')}
  ];

  // Keys used in shipped templates/saves that map onto a canonical catalog key.
  const MONSTER_ALIASES = { 'giant-spider': 'giant-crab-spider', 'lizardfolk': 'lizardman', 'wolf': 'common-wolf' };

  const _byKey = new Map(MONSTER_CATALOG.map(m => [m.key, m]));
  function findMonster(key) {
    if (!key) return null;
    const k = String(key).toLowerCase();
    return _byKey.get(k) || _byKey.get(MONSTER_ALIASES[k]) || null;
  }
  function monsterCatalogKeys() { return MONSTER_CATALOG.map(m => m.key); }
  function monstersByType(type) { const t = String(type || '').toLowerCase(); return MONSTER_CATALOG.filter(m => m.creatureTypes.indexOf(t) >= 0); }
  function isCatalogMonster(key) { return !!findMonster(key); }
  function monsterCanTrack(key) { const m = findMonster(key); return !!(m && m.canTrack); }
  function monsterDisplayName(key) { const m = findMonster(key); return m ? m.name : (key || ''); }

  Object.assign(ACKS, {
    MONSTER_CATALOG, MONSTER_ALIASES,
    findMonster, monsterCatalogKeys, monstersByType, isCatalogMonster, monsterCanTrack, monsterDisplayName
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = ACKS;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
`;
fs.writeFileSync(process.env.ACKS_CATALOG_OUT || path.resolve(REPO, 'acks-engine-monsters.js'), header);

console.log('SHIPPED entries:', ship.length, ' EXCLUDED:', excluded.length);
console.log('  canTrack:', ship.filter(e => e.canTrack).length, ' pages', Math.min(...ship.map(e => e.page || 999)), '-', Math.max(...ship.map(e => e.page || 0)));
console.log('  module written: acks-engine-monsters.js');
console.log('\n--- EXCLUDED (need manual Inspector authoring; noted in SUMMARY) ---');
console.log(excluded.map(e => `${e.name}[${e._bad.join('/')}]`).join(', '));
console.log('\n--- demo keys resolve? ---');
for (const k of ['dire-wolf', 'lizardman', 'giant-spider', 'goblin']) {
  const e = ship.find(x => x.key === k) || (k === 'giant-spider' ? ship.find(x => x.key === 'giant-crab-spider') : null);
  console.log(`  ${k} -> ${e ? e.key + ' (hd ' + e.hd + ', lair% ' + e.lairPct + ', TT ' + (e.treasureType||'none') + ', ' + e.alignment + ', xp ' + e.xp + ')' : 'MISSING'}`);
}
