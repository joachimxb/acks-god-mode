'use strict';
/* tests/save-tables.smoke.js — pins the four class saving-throw progressions to ACKS II RAW.
 *
 * Run from the "ACKS God Mode/" directory (or via `npm test`):
 *   node tests/save-tables.smoke.js
 *
 * Stood up 2026-06-14 (audit BUG item). The 2026-06-14 audit's acks-authority lens flagged —
 * tentatively, from recall — that the Fighter L1 saves `[13,14,15,16,17]` looked transposed/shifted.
 * A direct RAW check (ACKS Sources/ACKS-II-Revised-Rulebook.md) shows the engine is CORRECT as
 * written: the column order is Paralysis | Death | Blast | Implements | Spells, exactly as printed,
 * and every value matches. No values were changed. This fixture pins all four progressions so the
 * tables can never silently regress.
 *
 * RAW sources (markdown PDF-page markers in ACKS-II-Revised-Rulebook.md):
 *   Fighter Attack and Saving Throws            — p.25
 *   Thief Attack and Saving Throws              — p.31
 *   Mage Attack and Saving Throws               — p.35
 *   Crusader Attack and Saving Throws           — p.37  (the engine's 'cleric' archetype: the divine
 *                                                          base progression; crusader/bladedancer/shaman/
 *                                                          craftpriest map to it via CLASS_TO_SAVE_ARCHETYPE)
 *
 * Column order everywhere: [Paralysis, Death, Blast, Implements, Spells].
 */
'use strict';
const assert = require('assert');
require('./_engine.js').load();
const ACKS = global.ACKS;

let pass = 0, fail = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(label + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); }
}
function section(t) { console.log('\n--- ' + t + ' ---'); }
function eqRow(a, b) { return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((v, i) => v === b[i]); }

// ── RAW reference tables. One row per character LEVEL (1..14). Columns: Paralysis | Death | Blast | Implements | Spells. ──
// These are transcribed directly from the rulebook tables (level-band rows expanded per level).

// Fighter — RR p.25. Bands: 1 / 2-3 / 4 / 5-6 / 7 / 8-9 / 10 / 11-12 / 13 / 14.
const RAW_FIGHTER = [null,
  [13,14,15,16,17], [12,13,14,15,16], [12,13,14,15,16],
  [11,12,13,14,15], [10,11,12,13,14], [10,11,12,13,14],
  [9,10,11,12,13],  [8,9,10,11,12],   [8,9,10,11,12],
  [7,8,9,10,11],    [6,7,8,9,10],     [6,7,8,9,10],
  [5,6,7,8,9],      [4,5,6,7,8]
];
// Mage — RR p.35. Bands: 1-3 / 4-6 / 7-9 / 10-12 / 13-14.
const RAW_MAGE = [null,
  [13,13,15,11,12], [13,13,15,11,12], [13,13,15,11,12],
  [12,12,14,10,11], [12,12,14,10,11], [12,12,14,10,11],
  [11,11,13,9,10],  [11,11,13,9,10],  [11,11,13,9,10],
  [10,10,12,8,9],   [10,10,12,8,9],   [10,10,12,8,9],
  [9,9,11,7,8],     [9,9,11,7,8]
];
// Crusader (engine 'cleric' archetype) — RR p.37. Bands: 1-2 / 3-4 / 5-6 / 7-8 / 9-10 / 11-12 / 13-14.
const RAW_CLERIC = [null,
  [13,10,16,13,15], [13,10,16,13,15], [12,9,15,12,14],
  [12,9,15,12,14],  [11,8,14,11,13],  [11,8,14,11,13],
  [10,7,13,10,12],  [10,7,13,10,12],  [9,6,12,9,11],
  [9,6,12,9,11],    [8,5,11,8,10],    [8,5,11,8,10],
  [7,4,10,7,9],     [7,4,10,7,9]
];
// Thief — RR p.31. Bands: 1-2 / 3-4 / 5-6 / 7-8 / 9-10 / 11-12 / 13-14.
const RAW_THIEF = [null,
  [13,13,13,14,15], [13,13,13,14,15], [12,12,12,13,14],
  [12,12,12,13,14], [11,11,11,12,13], [11,11,11,12,13],
  [10,10,10,11,12], [10,10,10,11,12], [9,9,9,10,11],
  [9,9,9,10,11],    [8,8,8,9,10],     [8,8,8,9,10],
  [7,7,7,8,9],      [7,7,7,8,9]
];

const RAW = { fighter: RAW_FIGHTER, mage: RAW_MAGE, cleric: RAW_CLERIC, thief: RAW_THIEF };

section('SAVE_TABLES — engine matches RAW for every archetype × level (1..14)');
const ST = ACKS.SAVE_TABLES;
ok('SAVE_TABLES exported', ST && typeof ST === 'object');
for (const arch of Object.keys(RAW)) {
  ok(arch + ' archetype present', Array.isArray(ST[arch]) && ST[arch].length === 15);
  for (let lvl = 1; lvl <= 14; lvl++) {
    ok(arch + ' L' + lvl + ' = RAW', eqRow(ST[arch][lvl], RAW[arch][lvl]),
       'engine ' + JSON.stringify(ST[arch][lvl]) + ' vs RAW ' + JSON.stringify(RAW[arch][lvl]));
  }
}

section('the audit\'s flagged case is RAW-correct (NOT transposed)');
// Fighter L1 = [Paralysis 13, Death 14, Blast 15, Implements 16, Spells 17] — RR p.25, verbatim.
ok('Fighter L1 = [13,14,15,16,17] (RR p.25)', eqRow(ST.fighter[1], [13, 14, 15, 16, 17]));

section('computeSavingThrows maps class → archetype → row correctly');
function saves(cls, lvl) { return ACKS.computeSavingThrows({ class: cls, level: lvl }); }
// Fighter L1 — direct.
let s = saves('Fighter', 1);
ok('Fighter L1 named-field saves', s && s.paralysis === 13 && s.death === 14 && s.blast === 15 && s.implements === 16 && s.spells === 17,
   JSON.stringify(s));
// Explorer maps to fighter (CLASS_TO_SAVE_ARCHETYPE).
s = saves('Explorer', 4);
ok('Explorer L4 → fighter row [11,12,13,14,15]', s && s._archetype === 'fighter' && s.paralysis === 11 && s.death === 12 && s.blast === 13 && s.implements === 14 && s.spells === 15,
   JSON.stringify(s));
// Mage L14 endpoint.
s = saves('Mage', 14);
ok('Mage L14 → [9,9,11,7,8]', s && s._archetype === 'mage' && s.paralysis === 9 && s.death === 9 && s.blast === 11 && s.implements === 7 && s.spells === 8,
   JSON.stringify(s));
// Crusader → cleric archetype.
s = saves('Crusader', 1);
ok('Crusader L1 → cleric row [13,10,16,13,15]', s && s._archetype === 'cleric' && s.paralysis === 13 && s.death === 10 && s.blast === 16 && s.implements === 13 && s.spells === 15,
   JSON.stringify(s));
// Bladedancer also → cleric archetype (Crusader-progression class).
s = saves('Bladedancer', 7);
ok('Bladedancer L7 → cleric row [10,7,13,10,12]', s && s._archetype === 'cleric' && eqRow([s.paralysis, s.death, s.blast, s.implements, s.spells], [10, 7, 13, 10, 12]),
   JSON.stringify(s));
// Thief L1.
s = saves('Thief', 1);
ok('Thief L1 → [13,13,13,14,15]', s && s._archetype === 'thief' && eqRow([s.paralysis, s.death, s.blast, s.implements, s.spells], [13, 13, 13, 14, 15]),
   JSON.stringify(s));
// Assassin → fighter archetype (advances as a fighter).
s = saves('Assassin', 1);
ok('Assassin L1 → fighter row [13,14,15,16,17]', s && s._archetype === 'fighter' && eqRow([s.paralysis, s.death, s.blast, s.implements, s.spells], [13, 14, 15, 16, 17]),
   JSON.stringify(s));

section('level clamping (RAW tables run 1..14)');
ok('level 0 clamps to L1', eqRow(rowOf(saves('Fighter', 0)), [13, 14, 15, 16, 17]));
ok('level 20 clamps to L14', eqRow(rowOf(saves('Fighter', 20)), [4, 5, 6, 7, 8]));
ok('unknown class → null', saves('Peasant Mob', 3) === null);
function rowOf(s) { return s ? [s.paralysis, s.death, s.blast, s.implements, s.spells] : null; }

// ── report ──
console.log('\n=============================================');
console.log('save-tables.smoke.js — ' + pass + ' passed, ' + fail + ' failed');
console.log('=============================================');
if (fail) { console.log('FAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
