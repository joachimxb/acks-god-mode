/* ACKS God Mode — acks-engine-treasure.js
 * Treasure Generation #142 — T1+T2 (+T3 special treasures + the lair seam).
 * The Treasure Generator: a CATALOG (frozen reference data) + a ROLL ENGINE +
 * a MATERIALIZE-INTO-STASH writer over the SHIPPED item spine.
 *
 * Spec: Phase_3_Treasure_Plan.md (the build view) + Treasure_Tome_RAW_Survey.md
 * Parts 6–9 (the code-facing tables + the #143 boundary + the materialization
 * map + the no-new-entity recommendation).
 *
 * ── Architecture (the load-bearing decisions) ──────────────────────────────
 *  • NO new entity / prefix / collection. A generated hoard = the SHIPPED shapes:
 *    a `cache` Stash of facet item lines (coin/valuable/gear) + promoted
 *    notableItems[] (magic) + captive Characters. The §3.1 entity test fails for
 *    a `hrd-` Hoard (survey Part 9 — 0-of-5); `hrd-`/`trs-` are reserved on PAPER
 *    only (Data_Dictionary), built NEITHER. The generator is a TOOL that writes
 *    the shipped shapes, not a new entity owner.
 *  • RAW-default, NO master toggle (CLAUDE §6 — the Religion/Construction
 *    precedent; treasure generation is core RAW, dormant-until-used). The treasure
 *    MODE (classic|heroic|gritty) is a CAMPAIGN SETTING (campaign.treasureMode,
 *    default 'classic' = RAW), NOT a house rule — read defensively, never injected
 *    into blankCampaign/migrateCampaign (the team-session migrate-no-op enabler).
 *  • The magic-item ECONOMY (identify/use/buy/sell/commission + the CATALOG) is
 *    Magic Items #143's, NOT this lane's. Treasure EMITS magic-item slot requests
 *    ({category,count}) and, until #143 ships, leaves them as GM-fill placeholder
 *    `magical` lines promoted to notableItems[]. The one shared seam: slot → #143's
 *    catalog roll (survey Part 7).
 *  • generateHoardForLair closes the Monster-Persistence M2/M3 hoard-contents
 *    deferral (M1/M2 ship generateLair for the POPULATION + record the Treasure
 *    Type; this rolls the HOARD and lands it as the lair's monster-hoard).
 *
 * ── Honesty notes (🔧 flagged for the doc-pass — see the SUMMARY Doc-delta) ──
 *  • The exact TT pp.22 gem/jewelry value-BAND cutoffs are NOT in the survey
 *    (only the rungs + tier averages). The generator uses the published value
 *    rungs in calibrated weighted tables that reproduce the RAW tier AVERAGES +
 *    RANGES (a higher die → a more valuable piece, monotone — the RAW intent),
 *    and flags the exact per-band distribution as a future data-refinement. Treasure
 *    is high-variance by design — average-faithfulness is the right bar.
 *  • Only the CLASSIC mode table ships (the RAW default). Heroic/Gritty are the
 *    same shape (a data add, TT pp.20–21) — reserved, fall back to Classic.
 *  • The SPECIAL_TREASURE sub-tables are representative (the survey gives examples,
 *    not the full TT pp.23–25 transcription): the MECHANISM is faithful (lot →
 *    substitute an RR-Ch.8-congruent trade good with base value + stone weight;
 *    captives at the top of ep/pp/regalia), the exact good list is a flagged
 *    data-refinement.
 *  • Magic-component gp in the hoard total is the row's stated magic AVG gp when
 *    any slot rolled (a coarse estimate — the real value lands when #143 fills the
 *    slots). T1/T2 magic is GM-fill placeholder.
 *
 * ⚠ IP (CLAUDE §13.6): these are table STRUCTURES + numeric facts (percentages,
 * dice, value rungs, the A–R rows) — facts, reorganized to JSON, NOT the Treasure
 * Tome's per-item prose. Page-cited throughout (TT = ACKS II Treasure Tome).
 *
 * Loads AFTER acks-engine.js (the stash setters + item accessors + _rollDiceStr)
 * and acks-engine-monsters.js (MONSTER_CATALOG, for generateHoardForLair) — every
 * cross-module call resolves through global.ACKS at CALL time, so load order only
 * needs this module after the core (index.html loads it near the end, before the
 * player-view serializer). Self-contained: pure rolls + a writer over a passed
 * campaign. No house rule (RAW core). No new entity.
 */
(function(global){
  'use strict';

  const ACKS = global.ACKS = global.ACKS || {};

  // ── cross-module plumbing — resolved at CALL time through the namespace ──
  function _A(){ return global.ACKS || {}; }
  // The shipped dice roller (NdM / NdM±K / plain int). The ×1,000 coin mult + the
  // captive value mult are applied here (the roller has no × support).
  function _roll(spec, rng){ const f = _A()._rollDiceStr; return f ? f(spec, rng) : 0; }
  function _rollMult(spec, mult, rng){ return _roll(spec, rng) * (mult || 1); }

  // ════════════════════════════════════════════════════════════════════════════
  // 1. CATALOG — frozen reference data (TT pp.13–25; survey §6.1–§6.5)
  // ════════════════════════════════════════════════════════════════════════════

  // Per-letter accumulation category (TT p.17; survey §1.2). Hoarder = even
  // coin/valuables mix; Raider = bulky low-value; Incidental = light, high variance.
  const TREASURE_ACCUMULATION = Object.freeze({
    A:'Incidental', B:'Hoarder', C:'Incidental', D:'Hoarder', E:'Raider',
    F:'Incidental', G:'Raider', H:'Hoarder', I:'Incidental', J:'Raider',
    K:'Incidental', L:'Raider', M:'Incidental', N:'Hoarder', O:'Raider',
    P:'Incidental', Q:'Hoarder', R:'Hoarder'
  });

  // Per-letter average total gp value of the whole hoard (TT pp.17–19; survey §1.2).
  // The planned-generation anchor (nearestTreasureType). Equal across all 3 modes.
  const TREASURE_AVG_GP = Object.freeze({
    A:275, B:500, C:700, D:1000, E:1250, F:1500, G:2000, H:2500, I:3250,
    J:4000, K:5000, L:6000, M:8000, N:9000, O:12000, P:17000, Q:22000, R:45000
  });

  // Item rarity by max base cost (TT p.22). itemRarityForCost maps a gp value → tier.
  const ITEM_RARITY_TIERS = Object.freeze([
    { tier:'common',    maxGp:1000 },
    { tier:'uncommon',  maxGp:5000 },
    { tier:'rare',      maxGp:25000 },
    { tier:'very-rare', maxGp:100000 },
    { tier:'legendary', maxGp:Infinity }
  ]);

  // Coins are always rolled ×1,000 (TT p.17; survey §6.1 "dice ×1,000").
  const COIN_LOT_MULT = 1000;
  const COIN_DENOMINATIONS = Object.freeze(['cp','sp','ep','gp','pp']);

  // ── The Treasure Type table — CLASSIC (TT p.19, the RAW default; survey §6.1) ──
  // Each row: accumulation, avgGp, coins (per-denom {pct,dice}|null, count = dice×1,000),
  // gems/jewelry ({pct,dice,tier}|null, count = dice pieces, value = the tier ladder),
  // magic ({avgGp, slots:[{pct,count,category}]}). category: 'any' | 'weapon-or-armor'
  // (one sword/weapon/armor) | 'potion' | 'scroll'. count is a dice/int string (pieces).
  // The bottom printed "2d4 potions … (250,000gp)" R variant is the upper-largest-hoard
  // line — the generator uses R's printed "1d4 potions; 1d4 scrolls; 50% any 6 (65,000)"
  // (the OQ1 lean; Phase_3_Treasure_Plan.md §9). Heroic/Gritty deltas (TT pp.20–21) are
  // a reserved same-shape data add (§6.2).
  function _coin(pct, dice){ return { pct: pct, dice: dice }; }
  const TREASURE_TYPE_TABLE_CLASSIC = Object.freeze({
    A: { accum:'Incidental', avgGp:275,
         coins:{ cp:null, sp:_coin(30,'1d4'), ep:null, gp:null, pp:null },
         gems:{ pct:30, dice:'1d4', tier:'ornamental' },
         jewelry:{ pct:30, dice:'1d4', tier:'trinket' },
         magic:{ avgGp:150, slots:[ {pct:1, count:'1', category:'any'} ] } },
    B: { accum:'Hoarder', avgGp:500,
         coins:{ cp:null, sp:_coin(80,'1d6'), ep:null, gp:null, pp:null },
         gems:{ pct:70, dice:'1d4', tier:'ornamental' },
         jewelry:{ pct:30, dice:'1d4', tier:'trinket' },
         magic:{ avgGp:1500, slots:[ {pct:5, count:'2', category:'any'} ] } },
    C: { accum:'Incidental', avgGp:700,
         coins:{ cp:null, sp:_coin(80,'1d6'), ep:_coin(15,'1d4'), gp:null, pp:null },
         gems:{ pct:40, dice:'1d6', tier:'gem' },
         jewelry:{ pct:30, dice:'1d6', tier:'trinket' },
         magic:{ avgGp:750, slots:[ {pct:5, count:'1', category:'any'} ] } },
    D: { accum:'Hoarder', avgGp:1000,
         coins:{ cp:null, sp:_coin(70,'3d6'), ep:null, gp:null, pp:null },
         gems:{ pct:80, dice:'1d6', tier:'ornamental' },
         jewelry:{ pct:30, dice:'1d4', tier:'trinket' },
         magic:{ avgGp:4500, slots:[ {pct:15, count:'2', category:'any'} ] } },
    E: { accum:'Raider', avgGp:1250,
         coins:{ cp:_coin(80,'2d20'), sp:_coin(30,'1d4'), ep:null, gp:_coin(15,'1d4'), pp:null },
         gems:{ pct:60, dice:'1d4', tier:'ornamental' },
         jewelry:{ pct:40, dice:'1d4', tier:'trinket' },
         magic:{ avgGp:2500, slots:[ {pct:15, count:'1', category:'weapon-or-armor'},
                                     {pct:15, count:'1', category:'potion'},
                                     {pct:5,  count:'1', category:'any'} ] } },
    F: { accum:'Incidental', avgGp:1500,
         coins:{ cp:null, sp:_coin(70,'3d6'), ep:_coin(50,'1d4'), gp:null, pp:null },
         gems:{ pct:40, dice:'1d6', tier:'gem' },
         jewelry:{ pct:30, dice:'1d4', tier:'jewelry' },
         magic:{ avgGp:1000, slots:[ {pct:7, count:'1', category:'any'} ] } },
    G: { accum:'Raider', avgGp:2000,
         coins:{ cp:_coin(70,'2d20'), sp:_coin(25,'1d6'), ep:_coin(70,'1d6'), gp:null, pp:null },
         gems:{ pct:50, dice:'1d6', tier:'ornamental' },
         jewelry:{ pct:50, dice:'1d6', tier:'trinket' },
         magic:{ avgGp:5500, slots:[ {pct:25, count:'1', category:'weapon-or-armor'},
                                     {pct:25, count:'1', category:'potion'},
                                     {pct:10, count:'1', category:'any'} ] } },
    H: { accum:'Hoarder', avgGp:2500,
         coins:{ cp:null, sp:_coin(25,'1d4'), ep:null, gp:_coin(25,'1d6'), pp:null },
         gems:{ pct:80, dice:'1d6', tier:'gem' },
         jewelry:{ pct:80, dice:'1d6', tier:'trinket' },
         // 25% gates the whole magic line: any 3 + 1 potion + 1 scroll.
         magic:{ avgGp:19000, slots:[ {pct:25, count:'3', category:'any'},
                                      {pct:25, count:'1', category:'potion'},
                                      {pct:25, count:'1', category:'scroll'} ] } },
    I: { accum:'Incidental', avgGp:3250,
         coins:{ cp:null, sp:_coin(70,'2d20'), ep:_coin(70,'1d8'), gp:null, pp:null },
         gems:{ pct:50, dice:'2d4', tier:'gem' },
         jewelry:{ pct:40, dice:'1d8', tier:'jewelry' },
         magic:{ avgGp:3000, slots:[ {pct:20, count:'1', category:'any'} ] } },
    J: { accum:'Raider', avgGp:4000,
         coins:{ cp:_coin(50,'3d6'), sp:null, ep:_coin(30,'1d4'), gp:_coin(25,'1d6'), pp:null },
         gems:{ pct:50, dice:'1d6', tier:'gem' },
         jewelry:{ pct:50, dice:'1d8', tier:'trinket' },
         magic:{ avgGp:11000, slots:[ {pct:50, count:'1', category:'weapon-or-armor'},
                                      {pct:45, count:'1', category:'potion'},
                                      {pct:20, count:'1', category:'any'} ] } },
    K: { accum:'Incidental', avgGp:5000,
         coins:{ cp:null, sp:_coin(60,'2d10'), ep:_coin(75,'3d6'), gp:null, pp:null },
         gems:{ pct:25, dice:'1d4', tier:'brilliant' },
         jewelry:{ pct:50, dice:'1d4', tier:'jewelry' },
         magic:{ avgGp:6000, slots:[ {pct:40, count:'1', category:'any'} ] } },
    L: { accum:'Raider', avgGp:6000,
         coins:{ cp:_coin(40,'3d6'), sp:null, ep:_coin(25,'1d4'), gp:null, pp:_coin(15,'1d4') },
         gems:{ pct:60, dice:'1d6', tier:'gem' },
         jewelry:{ pct:40, dice:'1d4', tier:'jewelry' },
         magic:{ avgGp:6000, slots:[ {pct:40, count:'1', category:'any'} ] } },
    M: { accum:'Incidental', avgGp:8000,
         coins:{ cp:null, sp:_coin(60,'1d8'), ep:_coin(60,'2d4'), gp:_coin(60,'1d6'), pp:null },
         gems:{ pct:30, dice:'1d6', tier:'brilliant' },
         jewelry:{ pct:50, dice:'1d6', tier:'jewelry' },
         magic:{ avgGp:16500, slots:[ {pct:75, count:'1', category:'weapon-or-armor'},
                                      {pct:75, count:'1', category:'potion'},
                                      {pct:30, count:'1', category:'any'} ] } },
    N: { accum:'Hoarder', avgGp:9000,
         coins:{ cp:null, sp:_coin(50,'3d6'), ep:_coin(50,'3d6'), gp:_coin(30,'2d6'), pp:_coin(30,'1d4') },
         gems:{ pct:80, dice:'1d8', tier:'gem' },
         jewelry:{ pct:80, dice:'1d8', tier:'jewelry' },
         magic:{ avgGp:9000, slots:[ {pct:30, count:'2', category:'any'} ] } },
    O: { accum:'Raider', avgGp:12000,
         coins:{ cp:_coin(30,'3d6'), sp:null, ep:_coin(50,'1d8'), gp:_coin(80,'2d6'), pp:_coin(40,'1d4') },
         gems:{ pct:30, dice:'1d4', tier:'brilliant' },
         jewelry:{ pct:60, dice:'1d4', tier:'jewelry' },
         magic:{ avgGp:38000, slots:[ {pct:50, count:'4', category:'any'},
                                      {pct:50, count:'1', category:'potion'},
                                      {pct:50, count:'1', category:'scroll'} ] } },
    P: { accum:'Incidental', avgGp:17000,
         coins:{ cp:null, sp:null, ep:_coin(50,'1d8'), gp:_coin(60,'2d6'), pp:_coin(80,'1d4') },
         gems:{ pct:40, dice:'1d4', tier:'brilliant' },
         jewelry:{ pct:30, dice:'1d4', tier:'regalia' },
         magic:{ avgGp:27000, slots:[ {pct:75, count:'1', category:'weapon-or-armor'},
                                      {pct:75, count:'2', category:'potion'},
                                      {pct:50, count:'2', category:'any'} ] } },
    Q: { accum:'Hoarder', avgGp:22000,
         coins:{ cp:null, sp:null, ep:_coin(50,'1d6'), gp:_coin(60,'1d6'), pp:_coin(80,'1d8') },
         gems:{ pct:60, dice:'1d6', tier:'brilliant' },
         jewelry:{ pct:80, dice:'1d4', tier:'jewelry' },
         magic:{ avgGp:18000, slots:[ {pct:40, count:'3', category:'any'} ] } },
    R: { accum:'Hoarder', avgGp:45000,
         coins:{ cp:null, sp:null, ep:_coin(70,'2d6'), gp:_coin(60,'2d4'), pp:_coin(80,'1d6') },
         gems:{ pct:70, dice:'1d4', tier:'brilliant' },
         jewelry:{ pct:60, dice:'1d4', tier:'regalia' },
         magic:{ avgGp:65000, slots:[ {pct:100, count:'1d4', category:'potion'},
                                      {pct:100, count:'1d4', category:'scroll'},
                                      {pct:50,  count:'6',   category:'any'} ] } }
  });
  const TREASURE_TYPE_LETTERS = Object.freeze(Object.keys(TREASURE_TYPE_TABLE_CLASSIC));

  // Treasure modes (TT pp.19–21; survey §6.2 / §7). A campaign SETTING, not a house
  // rule. v1 ships Classic; Heroic/Gritty are reserved (same shape — fall back to Classic).
  const TREASURE_MODES = Object.freeze(['classic', 'heroic', 'gritty']);
  const TREASURE_TYPE_TABLES = Object.freeze({
    classic: TREASURE_TYPE_TABLE_CLASSIC,
    heroic:  TREASURE_TYPE_TABLE_CLASSIC,  // reserved (TT pp.20–21 data add)
    gritty:  TREASURE_TYPE_TABLE_CLASSIC   // reserved
  });

  // ── Gem value tiers (TT p.22; survey §6.3) ──
  // Calibrated weighted rung tables (published rungs) reproducing the RAW tier
  // averages + ranges; a higher die → a more valuable piece (monotone, the RAW
  // intent). The exact band cutoffs are a flagged data-refinement (header note).
  // table: [[value, weight], …]; convert: 1 brilliant = 20 gems = 140 ornamentals.
  const GEM_VALUE_TIERS = Object.freeze({
    ornamental: { roll:'2d20',     min:2,  max:40,  avg:30,
                  table:[ [10,2], [25,5], [50,3] ] },                 // 29.5 ≈ 30
    gem:        { roll:'1d100',    min:1,  max:100, avg:200,
                  table:[ [75,2], [100,3], [250,4], [500,1] ] },      // 195 ≈ 200
    brilliant:  { roll:'1d100+80', min:81, max:180, avg:4000,
                  table:[ [1000,2], [2000,2], [4000,3], [6000,2], [10000,1] ] } // 4000
  });
  const GEM_TIER_CONVERSION = Object.freeze({ brilliant:1, gem:20, ornamental:140 });

  // ── Jewelry value tiers (TT p.22; survey §6.4) ──
  // 1 regalia = 12 jewelry = 48 trinkets.
  const JEWELRY_VALUE_TIERS = Object.freeze({
    trinket: { roll:'2d20',     min:2,  max:40,  avg:225,
               table:[ [50,2], [100,2], [250,4], [500,2] ] },          // 230 ≈ 225
    jewelry: { roll:'1d100',    min:1,  max:100, avg:1000,
               table:[ [500,4], [1000,3], [1500,2], [2000,1] ] },      // 1000
    regalia: { roll:'1d100+80', min:81, max:180, avg:12000,
               table:[ [2000,2], [6000,3], [10000,2], [18000,2], [40000,1] ] } // 11800 ≈ 12000
  });
  const JEWELRY_TIER_CONVERSION = Object.freeze({ regalia:1, jewelry:12, trinket:48 });

  // ── Special Treasures — the lot-substitution sub-tables (TT pp.23–25; survey §6.5) ──
  // Representative set (the survey gives EXAMPLES; full transcription is flagged).
  // A lot = 1 jewelry | 1 gem | 1,000 coins (per denomination). Roll d20 per lot on
  // the matching table; an entry whose [lo,hi] band contains the roll SUBSTITUTES the
  // good for that lot (a roll outside every band = no substitution, the lot stays).
  // Each entry: _st(band, good, countDice, valueDice, valueMult, perWeightSt, isCaptive).
  //   qty       = _roll(countDice)                       (pieces in the lot)
  //   perPieceGp = _roll(valueDice) × valueMult          (per-piece value; valueMult lets
  //                                                        sub-gp values, e.g. 5 sp = ×0.5)
  // The substituting good's TOTAL value ≈ the lot it replaces (calibrated per denom:
  // cp~10 / sp~100 / ep~500 / gp~1,000 / pp~5,000 gp; gem/jewelry ≈ the piece value), so
  // opting into special treasures keeps the hoard's gp roughly constant (TT p.23 — goods
  // are RR-Ch.8-congruent, sellable at base). Captives are PEOPLE → one Character per
  // individual (not a line), at the top of ep/pp/regalia.
  function _st(band, good, countDice, valueDice, valueMult, perWeightSt, isCaptive){
    return { band: band, good: good, countDice: countDice, valueDice: valueDice,
             valueMult: (valueMult || 1), weightSt: perWeightSt, isCaptive: !!isCaptive };
  }
  const SPECIAL_TREASURE_TABLES = Object.freeze({
    // per-1,000-coin tables (by denomination) — d20.   band  good  count  value ×mult  st/piece
    cp: [ _st([1,4],  '2d20 bags of grain',        '2d20', '1', 0.5, 4),   // 5 sp each
          _st([5,7],  '1d6 bundles of hides',      '1d6',  '3', 1,   2),   // 3 gp each
          _st([8,9],  '1d4 casks of ale',          '1d4',  '4', 1,   6) ],
    sp: [ _st([1,3],  '1d6 bolts of wool cloth',   '1d6',  '30', 1,  2),
          _st([4,6],  '2d6 jars of olive oil',     '2d6',  '15', 1,  1),
          _st([7,8],  '1d4 chests of salt',        '1d4',  '40', 1,  4) ],
    ep: [ _st([1,3],  '1d4 amphorae of wine',      '1d4',  '200', 1, 3),
          _st([4,5],  '1d3 rolls of fine linen',   '1d3',  '250', 1, 1),
          _st([18,20],'enslaved craftsman',        '1d3',  '1d4', 100, 15, true) ],
    gp: [ _st([1,3],  '1d4 bales of fine cloth',   '1d4',  '400', 1, 2),
          _st([4,5],  '1d3 caskets of spices',     '1d3',  '500', 1, 1),
          _st([6,7],  '1d2 illuminated books',     '1d2',  '650', 1, 1) ],
    pp: [ _st([1,2],  '1d4 bolts of silk',         '1d4',  '2000', 1, 1),
          _st([3,4],  '1d3 caskets of rare spice', '1d3',  '2500', 1, 1),
          _st([19,20],'captured squire or enslaved gladiator', '1', '2d4', 1000, 15, true) ],
    // per-tier gem tables — d20 (substitute one piece ≈ the tier value)
    ornamental: [ _st([1,4], '1d6 carved soapstone figurines', '1d6', '10', 1, 1) ],
    gem:        [ _st([1,3], '1d4 lacquered ivory carvings',   '1d4', '80', 1, 1) ],
    brilliant:  [ _st([1,2], 'jade burial mask',               '1',   '1d4', 1500, 2) ],
    // per-tier jewelry tables — d20
    trinket:    [ _st([1,4], '1d6 enameled brooches',          '1d6', '60', 1, 0.5) ],
    jewelryT:   [ _st([1,3], '1d3 gem-set chalices',           '1d3', '500', 1, 1) ],
    regalia:    [ _st([1,2], 'jeweled ceremonial crown',       '1',   '1d8', 3000, 3),
                  _st([19,20],'captured noble (ransomable)',   '1',   '2d6', 1000, 15, true) ]
  });

  // ════════════════════════════════════════════════════════════════════════════
  // 2. LOOKUPS
  // ════════════════════════════════════════════════════════════════════════════

  // The campaign's treasure mode (a setting; read defensively — never injected).
  function treasureModeFor(campaign){
    const m = campaign && campaign.treasureMode;
    return (TREASURE_MODES.indexOf(m) >= 0) ? m : 'classic';
  }
  // The A–R row for a letter + mode (Classic until Heroic/Gritty land).
  function treasureTypeRow(letter, mode){
    const tbl = TREASURE_TYPE_TABLES[mode] || TREASURE_TYPE_TABLE_CLASSIC;
    return (letter && tbl[String(letter).toUpperCase()]) || null;
  }
  function treasureTypeAvgGp(letter){
    return letter ? (TREASURE_AVG_GP[String(letter).toUpperCase()] || 0) : 0;
  }
  function treasureAccumulation(letter){
    return letter ? (TREASURE_ACCUMULATION[String(letter).toUpperCase()] || '') : '';
  }
  // The TT whose avg gp is nearest a target (planned generation, TT p.17; survey §6.4).
  function nearestTreasureType(targetGp){
    const t = Number(targetGp) || 0;
    let best = 'A', bestD = Infinity;
    for(const L of TREASURE_TYPE_LETTERS){
      const d = Math.abs(TREASURE_AVG_GP[L] - t);
      if(d < bestD){ bestD = d; best = L; }
    }
    return best;
  }
  // The master budget (TT p.13): 4 × Σ monster XP.
  function targetTreasureGp(monsterXpSum){ return 4 * (Number(monsterXpSum) || 0); }
  // Item rarity tier for a base gp cost (TT p.22).
  function itemRarityForCost(gp){
    const v = Number(gp) || 0;
    for(const t of ITEM_RARITY_TIERS){ if(v <= t.maxGp) return t.tier; }
    return 'legendary';
  }

  // ── Internal: pick a value from a weighted rung table, monotone in the die roll ──
  // Rolls the tier's die, maps its position in [min,max] into the cumulative-weight
  // ladder (sorted ascending by value), so a higher roll → a more valuable piece.
  function _rollTierValue(tierDef, rng){
    if(!tierDef || !Array.isArray(tierDef.table) || !tierDef.table.length) return 0;
    const roll = _roll(tierDef.roll, rng);
    const span = (tierDef.max - tierDef.min) || 1;
    let frac = (roll - tierDef.min) / span;
    if(frac < 0) frac = 0; if(frac > 1) frac = 1;
    const totalW = tierDef.table.reduce((s, e) => s + e[1], 0);
    let target = frac * totalW, acc = 0;
    for(const e of tierDef.table){ acc += e[1]; if(target <= acc) return e[0]; }
    return tierDef.table[tierDef.table.length - 1][0];
  }
  function rollGemValue(tier, rng){ return _rollTierValue(GEM_VALUE_TIERS[tier], rng); }
  function rollJewelryValue(tier, rng){ return _rollTierValue(JEWELRY_VALUE_TIERS[tier], rng); }

  // ════════════════════════════════════════════════════════════════════════════
  // 3. ROLL ENGINE (pure; rng-injectable for deterministic previews/tests)
  // ════════════════════════════════════════════════════════════════════════════

  // Roll a %-gated cell: returns true iff present (1..100 ≤ pct).
  function _gate(pct, rng){
    const r = rng || Math.random;
    return (1 + Math.floor(r() * 100)) <= (Number(pct) || 0);
  }

  // Roll the magic cell → slot requests for #143 (or GM-fill placeholders until then).
  // Returns { slots:[{category,count,rarityHint}], estGp } — estGp = the row's stated
  // magic avg gp when any slot hit (a coarse placeholder; header note).
  function _rollMagic(magicSpec, rng){
    if(!magicSpec || !Array.isArray(magicSpec.slots)) return { slots: [], estGp: 0 };
    const out = [];
    for(const s of magicSpec.slots){
      if(!_gate(s.pct, rng)) continue;
      const n = Math.max(1, _roll(s.count, rng));
      out.push({ category: s.category, count: n });
    }
    return { slots: out, estGp: out.length ? (magicSpec.avgGp || 0) : 0 };
  }

  // generateHoard(opts) — the core roll.
  // opts = { treasureType:'A'..'R', mode?, rng? } → a hoard object:
  //   { treasureType, mode, accumulation,
  //     coins:{cp,sp,ep,gp,pp},                          // counts
  //     gems:[{tier, valueGp}], jewelry:[{tier, valueGp}],
  //     magicSlots:[{category,count}], magicEstGp,
  //     specialTreasures:[], captives:[],                // empty until applySpecialTreasures
  //     totals: {coinGp, gemGp, jewelryGp, specialGp, magicGp, gp, stone} }
  function generateHoard(opts){
    opts = opts || {};
    const rng = opts.rng || Math.random;
    const mode = (TREASURE_MODES.indexOf(opts.mode) >= 0) ? opts.mode : 'classic';
    const letter = String(opts.treasureType || '').toUpperCase();
    const row = treasureTypeRow(letter, mode);
    const hoard = {
      treasureType: letter, mode: mode, accumulation: row ? row.accum : '',
      coins: { cp:0, sp:0, ep:0, gp:0, pp:0 },
      gems: [], jewelry: [], magicSlots: [], magicEstGp: 0,
      specialTreasures: [], captives: [], totals: null
    };
    if(!row){ hoard.totals = _hoardTotals(hoard); return hoard; }

    // Coins (×1,000 on a hit).
    for(const d of COIN_DENOMINATIONS){
      const cell = row.coins[d];
      if(cell && _gate(cell.pct, rng)) hoard.coins[d] = _rollMult(cell.dice, COIN_LOT_MULT, rng);
    }
    // Gems.
    if(row.gems && _gate(row.gems.pct, rng)){
      const n = Math.max(1, _roll(row.gems.dice, rng));
      for(let i = 0; i < n; i++) hoard.gems.push({ tier: row.gems.tier, valueGp: rollGemValue(row.gems.tier, rng) });
    }
    // Jewelry.
    if(row.jewelry && _gate(row.jewelry.pct, rng)){
      const n = Math.max(1, _roll(row.jewelry.dice, rng));
      for(let i = 0; i < n; i++) hoard.jewelry.push({ tier: row.jewelry.tier, valueGp: rollJewelryValue(row.jewelry.tier, rng) });
    }
    // Magic (slot requests; #143 fills, else GM-fill placeholder).
    const mg = _rollMagic(row.magic, rng);
    hoard.magicSlots = mg.slots; hoard.magicEstGp = mg.estGp;

    hoard.totals = _hoardTotals(hoard);
    return hoard;
  }

  // planHoard(targetGp, mode, opts) — planned generation (TT p.17; survey §6.4).
  // Picks the TT nearest 4×Σ-XP (the GM passes the gp; targetTreasureGp computes it),
  // rolls it, and returns { ...hoard, targetGp, deltaGp } so the GM can adjust up/down
  // or make up the difference with special treasures.
  function planHoard(targetGp, mode, opts){
    const t = Number(targetGp) || 0;
    const letter = nearestTreasureType(t);
    const hoard = generateHoard(Object.assign({}, opts || {}, { treasureType: letter, mode: mode }));
    hoard.planned = true;
    hoard.targetGp = t;
    hoard.deltaGp = (hoard.totals ? hoard.totals.gp : 0) - t;
    return hoard;
  }

  // ── Hoard totals (derived; the shipped coin/value accessors where possible) ──
  function _coinGp(coins){
    const V = _A().COIN_GP_VALUE || { cp:0.01, sp:0.1, ep:0.5, gp:1, pp:5 };
    let g = 0; for(const d of COIN_DENOMINATIONS) g += (coins[d] || 0) * (V[d] || 0);
    return g;
  }
  function _hoardTotals(hoard){
    const coinGp = _coinGp(hoard.coins);
    const coinStone = COIN_DENOMINATIONS.reduce((s, d) => s + (hoard.coins[d] || 0), 0) / 1000; // 1,000 coins = 1 st
    const gemGp = hoard.gems.reduce((s, g) => s + (g.valueGp || 0), 0);
    const jewelryGp = hoard.jewelry.reduce((s, j) => s + (j.valueGp || 0), 0);
    const specialGp = hoard.specialTreasures.reduce((s, x) => s + (x.valueGp || 0) * (x.qty || 1), 0);
    const captiveGp = (hoard.captives || []).reduce((s, c) => s + (c.valueGp || 0), 0);
    const specialStone = hoard.specialTreasures.reduce((s, x) => s + (x.weightSt || 0) * (x.qty || 1), 0);
    const magicGp = hoard.magicEstGp || 0;
    // The MONETARY total (gp) = coin + gems + jewelry + special treasures + captive value.
    // Magic is NOT in `gp` — the RAW "Avg gp" column (TT pp.17–19) measures the liquid haul;
    // magic items are tracked SEPARATELY (their apparent value feeds XP, not the coin total).
    // Verified: row A coin+gem+jewelry ≈ 266 (book 275); R ≈ 44,450 (book 45,000). magicGp is a
    // separate informational field (a coarse placeholder until #143 — header note).
    return {
      coinGp: coinGp, gemGp: gemGp, jewelryGp: jewelryGp,
      specialGp: specialGp + captiveGp, magicGp: magicGp,
      gp: coinGp + gemGp + jewelryGp + specialGp + captiveGp,
      stone: coinStone + specialStone
    };
  }
  function hoardTotalGp(hoard){ return hoard && hoard.totals ? hoard.totals.gp : (hoard ? _hoardTotals(hoard).gp : 0); }
  function hoardTotalStone(hoard){ return hoard && hoard.totals ? hoard.totals.stone : (hoard ? _hoardTotals(hoard).stone : 0); }

  // ── Special treasures — the lot-substitution pass (TT p.23; survey §6.5; T3) ──
  // applySpecialTreasures(hoard, opts?) divides the hoard into lots (1 jewelry | 1 gem
  // | 1,000 coins per denomination), rolls the matching table per lot, and substitutes
  // an RR-Ch.8-congruent good (or a captive) on a hit — removing the substituted lot
  // from coins/gems/jewelry. Opt-in (the wizard's "make up the difference" toggle).
  // Mutates + returns the hoard (specialTreasures[] + captives[] populated, totals re-derived).
  function applySpecialTreasures(hoard, opts){
    if(!hoard) return hoard;
    opts = opts || {};
    const rng = opts.rng || Math.random;

    // Coin lots: each full 1,000 coins of a denomination is a lot.
    for(const d of COIN_DENOMINATIONS){
      let lots = Math.floor((hoard.coins[d] || 0) / COIN_LOT_MULT);
      const table = SPECIAL_TREASURE_TABLES[d] || [];
      for(let i = 0; i < lots; i++){
        const hit = _rollSpecial(table, rng);
        if(hit){ _addSpecial(hoard, hit, rng); hoard.coins[d] -= COIN_LOT_MULT; }
      }
    }
    // Gem lots (per piece) — table keyed by tier.
    hoard.gems = hoard.gems.filter(g => {
      const hit = _rollSpecial(SPECIAL_TREASURE_TABLES[g.tier] || [], rng);
      if(hit){ _addSpecial(hoard, hit, rng); return false; }
      return true;
    });
    // Jewelry lots (per piece) — 'jewelry' tier maps to the jewelryT table (the gem
    // table already owns the 'jewelry' KEY for the gem mid-tier; survey §6.3 vs §6.4).
    hoard.jewelry = hoard.jewelry.filter(j => {
      const key = (j.tier === 'jewelry') ? 'jewelryT' : j.tier;
      const hit = _rollSpecial(SPECIAL_TREASURE_TABLES[key] || [], rng);
      if(hit){ _addSpecial(hoard, hit, rng); return false; }
      return true;
    });
    hoard.totals = _hoardTotals(hoard);
    return hoard;
  }
  function _rollSpecial(table, rng){
    if(!Array.isArray(table) || !table.length) return null;
    const r = rng || Math.random;
    const d20 = 1 + Math.floor(r() * 20);
    for(const e of table){ if(d20 >= e.band[0] && d20 <= e.band[1]) return e; }
    return null;
  }
  function _addSpecial(hoard, entry, rng){
    const qty = Math.max(1, _roll(entry.countDice, rng));
    if(entry.isCaptive){
      // People — one Character per captured individual; each gets its own ransom/slave value.
      for(let i = 0; i < qty; i++){
        hoard.captives.push({ description: entry.good, valueGp: _rollMult(entry.valueDice, entry.valueMult, rng),
          weightSt: entry.weightSt });
      }
    } else {
      // A goods line: qty pieces, each valueGp/weightSt (per-piece; totals derive ×qty).
      hoard.specialTreasures.push({ name: entry.good, qty: qty,
        valueGp: _rollMult(entry.valueDice, entry.valueMult, rng), weightSt: entry.weightSt });
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 4. MATERIALIZER — write the hoard onto the SHIPPED item spine (T2)
  // ════════════════════════════════════════════════════════════════════════════

  // The hoard lands as a `cache` Stash at a hex (or a lair's monster-hoard), reusing
  // the shipped blankStash/findStash + the deposit/promote setters. NO new inventory
  // model (survey Part 8). materializeHoard(campaign, hoard, opts):
  //   opts = { hexId, lairId?, stashId?, stashName?, container?, atTurn?, reason? }
  // Returns { stash, deposited, notables, captives, event }.
  function materializeHoard(campaign, hoard, opts){
    if(!campaign || !hoard) return null;
    const A = _A();
    opts = opts || {};
    const atTurn = opts.atTurn || campaign.currentTurn || 1;
    if(!Array.isArray(campaign.stashes)) campaign.stashes = [];

    // 1) Resolve / create the cache stash (a hex cache, or a passed stashId).
    let stash = opts.stashId ? (A.findStash ? A.findStash(campaign, opts.stashId) : null) : null;
    if(!stash){
      const blankStash = A.blankStash;
      if(!blankStash) return null;
      stash = blankStash({ kind: 'cache', hexId: opts.hexId || null });
      stash.name = opts.stashName || (opts.lairId ? 'Monster hoard' : 'Treasure cache');
      stash.createdAtTurn = atTurn;
      campaign.stashes.push(stash);
    }

    // 2) Build the mundane facet lines (coins + gems + jewelry + special-treasure goods).
    const blankStashItem = A.blankStashItem;
    const lines = [];
    for(const d of COIN_DENOMINATIONS){
      const n = hoard.coins[d] || 0;
      if(n > 0) lines.push(blankStashItem({ facets:['coin'], denomination: d, qty: n }));
    }
    for(const g of (hoard.gems || [])){
      lines.push(blankStashItem({ facets:['valuable'], name: _gemName(g.tier), qty: 1,
        valuableType:'gem', valuableTier: g.tier, unitValueGp: g.valueGp }));
    }
    for(const j of (hoard.jewelry || [])){
      lines.push(blankStashItem({ facets:['valuable'], name: _jewelryName(j.tier), qty: 1,
        valuableType:'jewelry', valuableTier: j.tier, unitValueGp: j.valueGp }));
    }
    for(const s of (hoard.specialTreasures || [])){
      // unitValueGp is per-piece (itemValueGp = qty × unitValueGp); encumbranceSt is the
      // TOTAL line weight (itemEncumbranceSt returns it verbatim, not × qty).
      lines.push(blankStashItem({ facets:['gear','valuable'], name: s.name, qty: s.qty || 1,
        valuableType:'special-treasure', unitValueGp: s.valueGp,
        encumbranceSt: (s.weightSt || 0) * (s.qty || 1) }));
    }
    if(lines.length && A.depositToStash){
      A.depositToStash(campaign, stash.id, lines, {
        atTurn, reason: opts.reason || 'treasure-generated',
        source: { kind:'treasure', id: opts.lairId || null, label: 'generated hoard' }
      });
    }

    // 3) Magic slots → placeholder `magical` lines promoted to notableItems[] (#143 fills later).
    const notables = [];
    if(Array.isArray(hoard.magicSlots) && hoard.magicSlots.length && A.depositToStash && A.promoteLineToNotableItem){
      for(const slot of hoard.magicSlots){
        const n = Math.max(1, slot.count || 1);
        for(let i = 0; i < n; i++){
          const line = blankStashItem({ facets:['magical'], name: _magicSlotName(slot.category),
            notes: 'GM-fill — roll on the Magic Items #143 catalog' });
          A.depositToStash(campaign, stash.id, [line], { atTurn, reason:'treasure-generated-magic',
            source:{ kind:'treasure', id: opts.lairId || null, label:'generated hoard (magic)' } });
          // The deposited copy is the last line in the stash; promote it.
          const placed = stash.items[stash.items.length - 1];
          const ni = A.promoteLineToNotableItem(campaign, placed, {
            kind: _magicSlotKind(slot.category), name: _magicSlotName(slot.category),
            intrinsic: { rarityHint: null, category: slot.category, source:'treasure-generated', filledBy143:false }
          });
          if(ni) notables.push(ni);
        }
      }
    }

    // 4) Captives → Characters at the hex (slave if the rule is on, else imprisoned prisoner).
    const captives = [];
    if(Array.isArray(hoard.captives) && hoard.captives.length && A.blankCharacter){
      if(!Array.isArray(campaign.characters)) campaign.characters = [];
      const slavery = (typeof A.isHouseRuleEnabled === 'function') && A.isHouseRuleEnabled(campaign, 'slavery');
      for(const cap of hoard.captives){
        const ch = A.blankCharacter({
          name: _captiveName(cap.description),
          socialTier: slavery ? 'slave' : 'independent',
          lifecycleState: slavery ? 'active' : 'imprisoned',
          currentHexId: opts.hexId || null,
          notes: 'Captive from a generated hoard — ' + (cap.description || '') +
                 ' · base ' + (slavery ? 'slave' : 'ransom') + ' value ' + (cap.valueGp || 0) + ' gp'
        });
        ch.ransomValueGp = cap.valueGp || 0;   // defensive field; the ransom flow is a future seam
        campaign.characters.push(ch);
        captives.push(ch);
      }
    }

    // 5) Lair seam — link the cache to the lair's monster-hoard custody (survey Part 8/9).
    if(opts.lairId && A.findLair){
      const lair = A.findLair(campaign, opts.lairId);
      if(lair){
        lair.treasureCustodyId = lair.treasureCustodyId || stash.id;
        if(typeof A.addLairHistory === 'function'){
          A.addLairHistory(campaign, lair, 'treasure', { stashId: stash.id, gp: hoardTotalGp(hoard) });
        } else if(Array.isArray(lair.history)){
          lair.history.push({ turn: atTurn, type:'treasure', stashId: stash.id, gp: hoardTotalGp(hoard) });
        }
      }
    }

    // 6) The record-only audit event (Event.context envelope per CLAUDE §8.9).
    const event = _emitTreasureGenerated(campaign, hoard, stash, captives, opts);

    return { stash, deposited: lines, notables, captives, event };
  }

  // generateHoardForLair(campaign, lairId, opts?) — the Monster-Persistence seam (T4).
  // Reads the lair's Treasure Type (its own field, else its monster's catalog
  // treasureType), rolls the hoard, and lands it as the lair's monster-hoard. Closes
  // the M2/M3 hoard-contents deferral. Returns the materializeHoard result + the hoard.
  function generateHoardForLair(campaign, lairId, opts){
    if(!campaign || !lairId) return null;
    const A = _A();
    opts = opts || {};
    const lair = A.findLair ? A.findLair(campaign, lairId) : null;
    if(!lair) return null;
    let tt = lair.treasureType || '';
    if(!tt && lair.monsterCatalogKey && A.findMonster){
      const m = A.findMonster(lair.monsterCatalogKey);
      if(m && m.treasureType) tt = m.treasureType;
    }
    if(!tt) return { stash: null, hoard: null, reason: 'no-treasure-type' };
    const hoard = generateHoard({ treasureType: tt, mode: treasureModeFor(campaign), rng: opts.rng });
    if(opts.withSpecialTreasures) applySpecialTreasures(hoard, { rng: opts.rng });
    const res = materializeHoard(campaign, hoard, {
      hexId: lair.hexId || null, lairId: lair.id, container:'lair-hoard',
      stashName: (lair.name ? (lair.name + ' — hoard') : 'Monster hoard'),
      atTurn: opts.atTurn, reason:'lair-hoard-generated'
    });
    return Object.assign({ hoard }, res || {});
  }

  // ── Internal: the audit event ──
  function _emitTreasureGenerated(campaign, hoard, stash, captives, opts){
    const A = _A();
    if(typeof A.newEvent !== 'function') return null;
    const cal = campaign.calendar || {};
    const totals = hoard.totals || _hoardTotals(hoard);
    let ev;
    try {
      ev = A.newEvent('treasure-generated', {
        submittedBy: 'engine', cadence: 'monthly-turn', targetTurn: campaign.currentTurn || 1,
        gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: campaign.currentDayInMonth || 1 },
        payload: {
          treasureType: hoard.treasureType, mode: hoard.mode,
          totalGp: Math.round(totals.gp), totalStone: Math.round(totals.stone * 100) / 100,
          stashId: stash ? stash.id : null, lairId: opts.lairId || null,
          coins: hoard.coins, gemCount: (hoard.gems || []).length, jewelryCount: (hoard.jewelry || []).length,
          magicSlotCount: (hoard.magicSlots || []).length, captiveCount: (captives || []).length,
          narrative: _hoardNarrative(hoard, totals)
        }
      });
    } catch(e){ return null; }
    if(typeof A.setEventContext === 'function'){
      A.setEventContext(ev, {
        primaryHexId: opts.hexId || (stash && stash.hexId) || null,
        relatedEntities: (opts.lairId ? [{ kind:'lair', id: opts.lairId, role:'site' }] : [])
          .concat((captives || []).map(c => ({ kind:'character', id: c.id, role:'transferred' })))
      });
    }
    ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
    ev.appliedAtTurn = campaign.currentTurn || 1;
    ev.appliedAtDay = campaign.currentDayInMonth || 1;
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    campaign.eventLog.push({ event: ev, result: { narrativeSummary: ev.payload.narrative },
      appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
    return ev;
  }

  // ── Display helpers (flavor; the tool surfaces them, never requires them) ──
  function _gemName(tier){ return tier === 'brilliant' ? 'Brilliant gem' : tier === 'gem' ? 'Gem' : 'Ornamental stone'; }
  function _jewelryName(tier){ return tier === 'regalia' ? 'Regalia' : tier === 'jewelry' ? 'Jewelry' : 'Trinket'; }
  function _magicSlotName(cat){
    return cat === 'potion' ? 'Potion (unidentified)' : cat === 'scroll' ? 'Scroll (unidentified)' :
           cat === 'weapon-or-armor' ? 'Magic weapon or armor (unidentified)' : 'Magic item (unidentified)';
  }
  function _magicSlotKind(cat){ return cat === 'potion' ? 'potion' : cat === 'scroll' ? 'scroll' : 'masterwork'; }
  function _captiveName(desc){ return 'Captive — ' + String(desc || 'unknown'); }
  function _hoardNarrative(hoard, totals){
    const bits = [];
    const coinGp = totals.coinGp;
    if(coinGp > 0) bits.push(Math.round(coinGp).toLocaleString() + ' gp in coin');
    if((hoard.gems || []).length) bits.push((hoard.gems.length) + ' gem' + (hoard.gems.length > 1 ? 's' : ''));
    if((hoard.jewelry || []).length) bits.push((hoard.jewelry.length) + ' piece' + (hoard.jewelry.length > 1 ? 's' : '') + ' of jewelry');
    if((hoard.specialTreasures || []).length) bits.push((hoard.specialTreasures.length) + ' special treasure' + (hoard.specialTreasures.length > 1 ? 's' : ''));
    if((hoard.magicSlots || []).length) bits.push((hoard.magicSlots.length) + ' magic item' + (hoard.magicSlots.length > 1 ? 's' : ''));
    if((hoard.captives || []).length) bits.push((hoard.captives.length) + ' captive' + (hoard.captives.length > 1 ? 's' : ''));
    return 'Generated a Type-' + (hoard.treasureType || '?') + ' hoard (~' +
      Math.round(totals.gp).toLocaleString() + ' gp): ' + (bits.length ? bits.join(', ') : 'empty') + '.';
  }

  // ── Export onto window.ACKS ──
  Object.assign(ACKS, {
    // catalog (frozen reference data)
    TREASURE_TYPE_TABLE_CLASSIC, TREASURE_TYPE_TABLES, TREASURE_TYPE_LETTERS,
    TREASURE_AVG_GP, TREASURE_ACCUMULATION, TREASURE_MODES,
    GEM_VALUE_TIERS, JEWELRY_VALUE_TIERS, GEM_TIER_CONVERSION, JEWELRY_TIER_CONVERSION,
    ITEM_RARITY_TIERS, SPECIAL_TREASURE_TABLES,
    // lookups
    treasureModeFor, treasureTypeRow, treasureTypeAvgGp, treasureAccumulation,
    nearestTreasureType, targetTreasureGp, itemRarityForCost,
    rollGemValue, rollJewelryValue,
    // roll engine
    generateHoard, planHoard, applySpecialTreasures, hoardTotalGp, hoardTotalStone,
    // materializer + lair seam
    materializeHoard, generateHoardForLair
  });

})(typeof window !== 'undefined' ? window : global);
