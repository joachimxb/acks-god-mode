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
 *  • All three modes SHARE one value table (the RAW "equal total value per type"
 *    invariant). The MODE governs two post-roll transforms, NOT a different table (T5):
 *    (a) coin WEIGHT — Heroic/Gritty push value one denomination step DOWN (≈×6 heavier
 *    at TT R, same gp); (b) magic RESOLUTION — Classic by TYPE, Heroic/Gritty by RARITY
 *    (Gritty makes Legendary much rarer). 🔧 The exact TT pp.20–21 per-row dice + the
 *    per-tier rarity COUNTS are a flagged data-refinement (a single derived rarity per
 *    row, not the RAW per-tier spread); the mechanism (equal value, heavier coin,
 *    by-rarity) is faithful.
 *  • The SPECIAL_TREASURE sub-tables are representative (the survey gives examples,
 *    not the full TT pp.23–25 transcription): the MECHANISM is faithful (lot →
 *    substitute an RR-Ch.8-congruent trade good with base value + stone weight;
 *    captives at the top of ep/pp/regalia), the exact good list is a flagged
 *    data-refinement.
 *  • Magic slots resolve against the SHIPPED Magic-Items #143 catalog (T4): each slot
 *    becomes a real NotableItem (the catalog's `intrinsic` shape — rarity / baseCost /
 *    charges / page-ref) via the shipped promoteLineFromCatalog. magicEstGp is the SUM
 *    of the resolved items' apparent values. If #143 isn't loaded (treasure standalone),
 *    resolution is empty + the materializer falls back to GM-fill placeholder `magical`
 *    lines. Treasure NEVER edits #143 (read-only consume).
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
  // rule. All three SHARE one value table (RAW: equal total value per type); the mode
  // applies two post-roll transforms in generateHoard (T5) — coin demotion (heavier) +
  // by-rarity magic — NOT a different value table. So heroic/gritty point at the Classic
  // table by design (the exact per-row dice are a flagged data-refinement, header note).
  const TREASURE_MODES = Object.freeze(['classic', 'heroic', 'gritty']);
  const TREASURE_TYPE_TABLES = Object.freeze({
    classic: TREASURE_TYPE_TABLE_CLASSIC,
    heroic:  TREASURE_TYPE_TABLE_CLASSIC,  // shared value table; mode = coin-weight + by-rarity transforms
    gritty:  TREASURE_TYPE_TABLE_CLASSIC
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

  // ── Mode transforms — Heroic/Gritty (TT pp.20–21; survey §6.2) — T5 ──────────
  // Heroic/Gritty keep the SAME total value per row (the value tables are shared) but
  // (a) push coin value DOWN the denomination ladder (heavier) and (b) roll magic BY
  // RARITY not by type. `mode` governs these post-roll transforms in generateHoard.
  const COIN_DEMOTE_ONE = Object.freeze({ pp:'gp', gp:'ep', ep:'sp', sp:'cp', cp:'cp' });
  function _modeIsByRarity(mode){ return mode === 'heroic' || mode === 'gritty'; }
  // Move each denomination's VALUE down `steps` rungs, preserving total gp (new count :=
  // value ÷ the lower denom's gp). Mutates + returns the coins map. heroic/gritty = 1 step
  // → ~×6 heavier at TT R (the RAW weight consequence; exact per-row dice flagged).
  function _demoteCoins(coins, steps){
    const V = _A().COIN_GP_VALUE || { cp:0.01, sp:0.1, ep:0.5, gp:1, pp:5 };
    const n = Math.max(0, steps || 0);
    if(!n) return coins;
    const out = { cp:0, sp:0, ep:0, gp:0, pp:0 };
    for(const d of COIN_DENOMINATIONS){
      const c = coins[d] || 0; if(!c) continue;
      let denom = d; for(let i = 0; i < n; i++) denom = COIN_DEMOTE_ONE[denom];
      out[denom] += Math.round((c * (V[d] || 0)) / (V[denom] || 1));
    }
    for(const d of COIN_DENOMINATIONS) coins[d] = out[d];
    return coins;
  }

  // ── Magic-slot resolution against the SHIPPED Magic-Items #143 catalog — T4 ──
  // Treasure EMITS slot requests; #143's catalog says what a magic item IS. Read-only:
  // we call ACKS.magicItemCatalog() + promoteLineFromCatalog, never edit #143. Cursed
  // entries are excluded from random rolls (RAW's `^` cursed items are placed by hand,
  // not the default roll). If the catalog isn't loaded, resolution returns [] and the
  // materializer falls back to GM-fill placeholders.
  let _magicPoolCache = null;
  function _magicPoolAll(){
    const A = _A();
    if(_magicPoolCache && _magicPoolCache.src === A.MAGIC_ITEM_CATALOG) return _magicPoolCache.all;
    const all = (typeof A.magicItemCatalog === 'function') ? A.magicItemCatalog() : [];
    const usable = all.filter(e => e && !e.cursed);
    _magicPoolCache = { src: A.MAGIC_ITEM_CATALOG, all: usable };
    return usable;
  }
  function _magicPoolForCategory(cat){
    const all = _magicPoolAll();
    if(cat === 'potion') return all.filter(e => e.kind === 'potion');
    if(cat === 'scroll') return all.filter(e => e.kind === 'scroll');
    if(cat === 'weapon-or-armor') return all.filter(e => e.kind === 'magic-weapon' || e.kind === 'magic-armor');
    return all; // 'any'
  }
  const _RARITY_ORDER = Object.freeze(['common','uncommon','rare','very-rare','legendary']);
  function _magicPoolForRarity(rarity){
    const all = _magicPoolAll();
    const exact = all.filter(e => e.rarity === rarity);
    if(exact.length) return exact;
    const idx = _RARITY_ORDER.indexOf(rarity);
    for(let d = 1; d < _RARITY_ORDER.length; d++){
      const lo = (idx - d >= 0) ? all.filter(e => e.rarity === _RARITY_ORDER[idx - d]) : [];
      if(lo.length) return lo;
      const hi = (idx + d < _RARITY_ORDER.length) ? all.filter(e => e.rarity === _RARITY_ORDER[idx + d]) : [];
      if(hi.length) return hi;
    }
    return all;
  }
  function _pickEntry(pool, rng){
    if(!pool || !pool.length) return null;
    const r = rng || Math.random;
    return pool[Math.min(pool.length - 1, Math.floor((r() || 0) * pool.length))];
  }
  // Per-item rarity draw (by-rarity mode): a spread CENTERED on the row's baseRarity, so
  // a rich hoard yields a mix (some common, some rare, occasionally legendary) rather than
  // one flat tier. Heroic spreads ~symmetrically (reaches Legendary on the tail); Gritty
  // biases DOWN — Legendary almost never, more low-rarity items (survey §6.2). 🔧 the
  // spread weights are calibrated tooling, NOT the RAW per-tier counts (header note).
  function _drawRarity(baseRarity, mode, rng){
    const r = (rng || Math.random)();
    const baseIdx = Math.max(0, _RARITY_ORDER.indexOf(baseRarity));
    let shift;
    if(mode === 'gritty') shift = r < 0.45 ? 0 : r < 0.80 ? -1 : r < 0.95 ? 1 : -2;             // Legendary almost never
    else                  shift = r < 0.40 ? 0 : r < 0.65 ? -1 : r < 0.88 ? 1 : r < 0.97 ? 2 : -2; // Heroic — full spread
    let idx = baseIdx + shift;
    if(idx < 0) idx = 0; if(idx > _RARITY_ORDER.length - 1) idx = _RARITY_ORDER.length - 1;
    return _RARITY_ORDER[idx];
  }
  // Resolve the rolled magicSlots → a FLAT list of catalog-backed item descriptors (one
  // per item). Classic = by category (type); Heroic/Gritty = by rarity (the per-item
  // rarity drawn around the row's avg-per-item value). The materializer mints these.
  function _resolveMagicItems(magicSlots, mode, avgGp, rng){
    const A = _A();
    if(!Array.isArray(magicSlots) || !magicSlots.length) return [];
    if(typeof A.magicItemCatalog !== 'function' || !_magicPoolAll().length) return [];
    const byRarity = _modeIsByRarity(mode);
    const totalCount = magicSlots.reduce((s, x) => s + (x.count || 0), 0) || 1;
    const perItemGp = (Number(avgGp) || 0) / totalCount;
    const baseRarity = (typeof A.magicItemRarity === 'function') ? A.magicItemRarity(perItemGp) : 'uncommon';
    const out = [];
    for(const slot of magicSlots){
      const n = Math.max(1, slot.count || 1);
      for(let i = 0; i < n; i++){
        let entry;
        if(byRarity){
          const rar = _drawRarity(baseRarity, mode, rng);
          entry = _pickEntry(_magicPoolForRarity(rar), rng);
        } else {
          entry = _pickEntry(_magicPoolForCategory(slot.category), rng);
        }
        if(entry) out.push({ key: entry.key, name: entry.name, kind: entry.kind, rarity: entry.rarity,
          apparentValue: entry.apparentValue, baseCost: entry.baseCost, category: slot.category });
      }
    }
    return out;
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
      gems: [], jewelry: [], magicSlots: [], magicItems: [], magicEstGp: 0,
      specialTreasures: [], captives: [], totals: null
    };
    if(!row){ hoard.totals = _hoardTotals(hoard); return hoard; }

    // Coins (×1,000 on a hit).
    for(const d of COIN_DENOMINATIONS){
      const cell = row.coins[d];
      if(cell && _gate(cell.pct, rng)) hoard.coins[d] = _rollMult(cell.dice, COIN_LOT_MULT, rng);
    }
    // T5 — Heroic/Gritty push coin value DOWN one denomination step (same total gp,
    // markedly heavier). A pure post-roll redistribution (no rng) so gems/jewelry below
    // roll identically across modes; Classic = no shift.
    if(_modeIsByRarity(mode)) _demoteCoins(hoard.coins, 1);
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
    // Magic slot requests (TT pp.29–31) — count/category rolled here.
    const mg = _rollMagic(row.magic, rng);
    hoard.magicSlots = mg.slots; hoard.magicEstGp = mg.estGp;
    // T4 — resolve the slots against the #143 catalog → real item descriptors (one per
    // item): Classic by TYPE, Heroic/Gritty by RARITY. Resolved LAST so the coin/gem/
    // jewelry rolls above are byte-identical regardless of #143; empty if #143 isn't
    // loaded (the materializer then writes GM-fill placeholders).
    hoard.magicItems = _resolveMagicItems(hoard.magicSlots, mode, (row.magic && row.magic.avgGp) || 0, rng);
    if(hoard.magicItems.length) hoard.magicEstGp = hoard.magicItems.reduce((s, m) => s + (m.apparentValue || 0), 0);

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

    // 3) Magic items → notableItems[] (T4). The hoard's resolved magicItems[] (filled
    //    against #143's catalog at roll time) mint as real NotableItems via the shipped
    //    promoteLineFromCatalog (kind + baseCatalogKey + the #143 `intrinsic` shape). If
    //    #143 wasn't loaded, magicItems[] is empty → fall back to GM-fill placeholders
    //    over the raw magicSlots. NEVER edits #143 (read-only consume).
    const notables = [];
    const resolved = Array.isArray(hoard.magicItems) ? hoard.magicItems : [];
    function _depositMagicLine(name, notes){
      const line = blankStashItem(notes ? { facets:['magical'], name, notes } : { facets:['magical'], name });
      A.depositToStash(campaign, stash.id, [line], { atTurn, reason:'treasure-generated-magic',
        source:{ kind:'treasure', id: opts.lairId || null, label:'generated hoard (magic)' } });
      return stash.items[stash.items.length - 1];   // the deposited copy is the last line
    }
    if(resolved.length && A.depositToStash && typeof A.promoteLineFromCatalog === 'function'){
      for(const mi of resolved){
        const placed = _depositMagicLine(mi.name);
        const ni = A.promoteLineFromCatalog(campaign, placed, mi.key, { name: mi.name });
        if(ni){
          ni.intrinsic = ni.intrinsic || {};
          ni.intrinsic.source = 'treasure-generated';     // provenance (the smoke + the doc-pass read this)
          ni.intrinsic.filledFromCatalog = true;
          notables.push(ni);
        }
      }
    } else if(Array.isArray(hoard.magicSlots) && hoard.magicSlots.length && A.depositToStash && A.promoteLineToNotableItem){
      // Fallback — #143 not loaded: GM-fill placeholder `magical` lines (the pre-T4 path).
      for(const slot of hoard.magicSlots){
        const n = Math.max(1, slot.count || 1);
        for(let i = 0; i < n; i++){
          const placed = _depositMagicLine(_magicSlotName(slot.category), 'GM-fill — roll on the Magic Items #143 catalog');
          const ni = A.promoteLineToNotableItem(campaign, placed, {
            kind: _magicSlotKind(slot.category), name: _magicSlotName(slot.category),
            intrinsic: { rarityHint: null, category: slot.category, source:'treasure-generated', filledBy143:false }
          });
          if(ni) notables.push(ni);
        }
      }
    }

    // 4) Captives → Characters at the hex (slave if the rule is on, else imprisoned prisoner),
    //    EACH lifted into a first-class CONFINEMENT relation (Wave-C) that carries the
    //    ransom / release / escape lifecycle (createConfinement below). The ransomValueGp on
    //    the Character is kept as a denormalized convenience (the relation is the canonical
    //    home for the lifecycle). The captor is the lair when the hoard is a lair-hoard, else
    //    opts.captor (GM-assigned) or unknown — a hoard's finder is the GM's call.
    const captives = [], confinements = [];
    if(Array.isArray(hoard.captives) && hoard.captives.length && A.blankCharacter){
      if(!Array.isArray(campaign.characters)) campaign.characters = [];
      const slavery = (typeof A.isHouseRuleEnabled === 'function') && A.isHouseRuleEnabled(campaign, 'slavery');
      const captor = opts.lairId ? { kind:'lair', id: opts.lairId, label:'lair' } : (opts.captor || null);
      for(const cap of hoard.captives){
        const ch = A.blankCharacter({
          name: _captiveName(cap.description),
          socialTier: slavery ? 'slave' : 'independent',
          lifecycleState: slavery ? 'active' : 'imprisoned',
          currentHexId: opts.hexId || null,
          notes: 'Captive from a generated hoard — ' + (cap.description || '') +
                 ' · base ' + (slavery ? 'slave' : 'ransom') + ' value ' + (cap.valueGp || 0) + ' gp'
        });
        ch.ransomValueGp = cap.valueGp || 0;   // denormalized convenience; the confinement relation owns the lifecycle
        campaign.characters.push(ch);
        captives.push(ch);
        const conf = createConfinement(campaign, {
          captiveCharacterId: ch.id, captor: captor,
          confinementType: slavery ? 'slave' : 'ransom', ransomValueGp: cap.valueGp || 0,
          hexId: opts.hexId || null, confinedAtTurn: atTurn,
          source: { kind:'treasure', id: opts.lairId || null, label:'generated hoard' },
          notes: cap.description || ''
        });
        if(conf) confinements.push(conf);
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
    const event = _emitTreasureGenerated(campaign, hoard, stash, captives, opts, confinements);

    return { stash, deposited: lines, notables, captives, confinements, event };
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
  function _emitTreasureGenerated(campaign, hoard, stash, captives, opts, confinements){
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
          magicSlotCount: (hoard.magicSlots || []).length, magicItemCount: (hoard.magicItems || []).length,
          captiveCount: (captives || []).length, confinementCount: (confinements || []).length,
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
    const magicN = (hoard.magicItems || []).length || (hoard.magicSlots || []).reduce((s, x) => s + (x.count || 0), 0);
    if(magicN) bits.push(magicN + ' magic item' + (magicN > 1 ? 's' : ''));
    if((hoard.captives || []).length) bits.push((hoard.captives.length) + ' captive' + (hoard.captives.length > 1 ? 's' : ''));
    return 'Generated a Type-' + (hoard.treasureType || '?') + ' hoard (~' +
      Math.round(totals.gp).toLocaleString() + ' gp): ' + (bits.length ? bits.join(', ') : 'empty') + '.';
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 5. CONFINEMENTS — captives lifted into a first-class relation (Wave-C; cnf-)
  // ════════════════════════════════════════════════════════════════════════════
  // A generated hoard's captives (TT p.23 — at the top of the ep/pp/regalia special-
  // treasure tables) are PEOPLE: they materialize as Characters (above), and each is
  // bound to a CONFINEMENT relation that owns the ransom / release / escape lifecycle.
  // The survey (Treasure_Tome_RAW_Survey.md §6.5) names this exact home: "a captive →
  // a Character (not a line); ransom value on the (Wave-C) confinements relation."
  //
  // Why a relation, not a field (Architecture §3.1): the ransom value + status + escape
  // chance + captor are state with no other home (not the captive's, not the captor's),
  // the captive AND the captor point at it, and it persists through capture → ransom /
  // release / escape — three checks pass → lift to campaign.confinements[]. Reverse
  // indices stay computed (§3.3): confinementsForCaptive / -ForCaptor / activeConfinements.
  //
  // RAW grounding: the ransom/slave VALUE is RAW (TT p.23, rolled at capture). The ransom
  // PAYMENT routes through GP Wave B (wealth-transfer). The monthly ESCAPE check has NO
  // RAW basis (captives-as-treasure carry no escape rule) — it is a 🔧 tooling lifecycle
  // (a modest, per-confinement-tunable monthly chance; 0 disables; the GM tunes it).
  //
  // Self-registers cnf- + the confinement entity-kind + field-schema + the collection +
  // the 3 audit event kinds + the slot-70 escape day-consumer, all FROM this module via
  // the PR #89/#90 kernel (no central-registry edits). RAW core — no house rule.

  // 🔧 No RAW basis — a held captive's default monthly escape chance (a prisoner under
  // guard, awaiting ransom). GM-tunable per confinement (escapeChanceMonthly); 0 disables.
  const DEFAULT_ESCAPE_CHANCE = 0.05;

  function _cnfPrefix(){ const A = _A(); return (A.ID_PREFIXES && A.ID_PREFIXES.confinement) || 'cnf'; }
  function _cnfNewId(){ const A = _A(); return A.newId ? A.newId(_cnfPrefix()) : (_cnfPrefix() + '-' + Math.random().toString(36).slice(2,9)); }

  // blankConfinement(opts) — the captive↔captor relation. Emits ALL lifecycle fields from
  // creation (incl. resolvedAtTurn:null — the relation-end-field invariant, Inspector C.2)
  // so the global schema⊆factory invariant holds.
  function blankConfinement(opts){
    opts = opts || {};
    const A = _A();
    return {
      id: opts.id || _cnfNewId(),
      kind: 'confinement',
      schemaVersion: (A.SCHEMA_VERSION != null) ? A.SCHEMA_VERSION : 2,
      captiveCharacterId: opts.captiveCharacterId || null,   // the prisoner (a Character) — relation primary key
      captor: opts.captor || null,                           // { kind:'character'|'party'|'domain'|'lair'|'unknown', id, label }
      confinementType: opts.confinementType || 'ransom',     // 'ransom' | 'slave' (mirrors the captive's tier at capture)
      ransomValueGp: Number(opts.ransomValueGp) || 0,        // base ransom/slave value (TT p.23, rolled at capture)
      status: opts.status || 'held',                         // 'held' | 'ransomed' | 'released' | 'escaped'
      hexId: opts.hexId || null,                             // where the captive is held
      escapeChanceMonthly: (opts.escapeChanceMonthly != null) ? Number(opts.escapeChanceMonthly) : DEFAULT_ESCAPE_CHANCE, // 🔧 no RAW basis; 0 disables
      confinedAtTurn: (opts.confinedAtTurn != null) ? opts.confinedAtTurn : null,
      resolvedAtTurn: (opts.resolvedAtTurn != null) ? opts.resolvedAtTurn : null,  // set on ransom/release/escape — null while held
      resolution: opts.resolution || null,                   // null | 'ransomed' | 'released' | 'escaped'
      lastEscapeCheckTurn: (opts.lastEscapeCheckTurn != null) ? opts.lastEscapeCheckTurn : null,  // the monthly-cadence gate
      source: opts.source || null,                           // { kind:'treasure', id, label } provenance
      notes: opts.notes || '',
      history: Array.isArray(opts.history) ? opts.history : []
    };
  }

  // ── Lookups (reverse indices computed; Architecture §3.3) ──
  function findConfinement(campaign, id){
    if(!campaign || !id || !Array.isArray(campaign.confinements)) return null;
    return campaign.confinements.find(c => c && c.id === id) || null;
  }
  function confinementsForCaptive(campaign, characterId){
    if(!campaign || !characterId || !Array.isArray(campaign.confinements)) return [];
    return campaign.confinements.filter(c => c && c.captiveCharacterId === characterId);
  }
  function confinementForCaptive(campaign, characterId){   // the single active confinement of a captive
    return confinementsForCaptive(campaign, characterId).find(c => c.status === 'held') || null;
  }
  function confinementsForCaptor(campaign, captorKind, captorId){
    if(!campaign || !Array.isArray(campaign.confinements)) return [];
    return campaign.confinements.filter(c => c && c.captor && c.captor.kind === captorKind &&
      (captorId == null || c.captor.id === captorId));
  }
  function activeConfinements(campaign){
    if(!campaign || !Array.isArray(campaign.confinements)) return [];
    return campaign.confinements.filter(c => c && c.status === 'held');
  }

  // createConfinement(campaign, opts) — the canonical setter (used by materializeHoard +
  // GM/Inspector authoring). Pushes a blankConfinement, stamps confinedAtTurn + history.
  function createConfinement(campaign, opts){
    if(!campaign) return null;
    opts = opts || {};
    if(!Array.isArray(campaign.confinements)) campaign.confinements = [];
    const atTurn = (opts.confinedAtTurn != null) ? opts.confinedAtTurn : (campaign.currentTurn || 1);
    const conf = blankConfinement(Object.assign({}, opts, { confinedAtTurn: atTurn }));
    conf.history.push({ turn: atTurn, type:'confined',
      note: (conf.confinementType === 'slave' ? 'enslaved' : 'taken captive') +
            (conf.ransomValueGp ? (' · ' + conf.confinementType + ' value ' + conf.ransomValueGp + ' gp') : '') });
    campaign.confinements.push(conf);
    return conf;
  }

  // ── Internal: free the captive Character (imprisoned → active; slave → independent) ──
  function _freeCaptive(campaign, captiveId, how){
    const A = _A();
    const ch = (Array.isArray(campaign.characters) ? campaign.characters : []).find(x => x && x.id === captiveId);
    if(!ch) return null;
    if(ch.lifecycleState === 'imprisoned') ch.lifecycleState = 'active';
    if(ch.socialTier === 'slave') ch.socialTier = 'independent';
    try {
      if(typeof A.addCharacterHistory === 'function')
        A.addCharacterHistory(campaign, ch, 'freed', ch.name + ' is ' + (how || 'freed'), {});
    } catch(_e){}
    return ch;
  }

  // ── Internal: map a captor to a GP-Wave-B wealth handle (the ransom recipient) ──
  function _captorWealthHandle(captor){
    if(!captor || !captor.id) return null;
    if(captor.kind === 'character') return { kind:'character', id: captor.id };
    if(captor.kind === 'domain')    return { kind:'treasury',  id: captor.id };
    return null;   // lair / party / unknown — the GM passes opts.recipient explicitly
  }

  // ── Internal: the record-only audit event (the mortal-wound / hijinks idiom) ──
  function _emitConfinementEvent(campaign, conf, kind, payload, narrative){
    const A = _A();
    if(typeof A.newEvent !== 'function') return null;
    const cal = (campaign && campaign.calendar) || {};
    let ev;
    try {
      ev = A.newEvent(kind, {
        submittedBy:'engine', cadence:'monthly-turn', targetTurn: campaign.currentTurn || 1,
        gameTimeAt:{ year: cal.year || 1, month: cal.month || 1, day: campaign.currentDayInMonth || 1 },
        payload: Object.assign({ confinementId: conf.id, captiveCharacterId: conf.captiveCharacterId, narrative }, payload || {})
      });
    } catch(_e){ return null; }
    if(typeof A.setEventContext === 'function'){
      const rel = [{ kind:'character', id: conf.captiveCharacterId, role:'subject' }];
      if(conf.captor && conf.captor.kind === 'character' && conf.captor.id) rel.push({ kind:'character', id: conf.captor.id, role:'captor' });
      A.setEventContext(ev, { primaryHexId: conf.hexId || null, relatedEntities: rel });
    }
    ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
    ev.appliedAtTurn = campaign.currentTurn || 1;
    ev.appliedAtDay  = campaign.currentDayInMonth || 1;
    if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
    campaign.eventLog.push({ event: ev, result:{ narrativeSummary: narrative },
      appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
    return ev;
  }
  // Replay handler (record-only — the verb already applied the state).
  function applyEvent_confinementAudit(campaign, event){
    const p = (event && event.payload) || {};
    return { result:{ narrativeSummary: p.narrative || (event && event.kind) || 'confinement event' } };
  }

  function _captiveLabel(campaign, conf){
    const ch = (Array.isArray(campaign.characters) ? campaign.characters : []).find(x => x && x.id === conf.captiveCharacterId);
    return (ch && ch.name) || conf.captiveCharacterId || 'the captive';
  }

  // ── Lifecycle verbs ──────────────────────────────────────────────────────────
  // ransomConfinement(campaign, id, { amountGp?, payer?, recipient?, atTurn?, allowOverdraft? })
  //   Pays the ransom (payer → recipient via GP Wave B), frees the captive, status → ransomed.
  //   payer defaults to external (the captive's people, off-campaign); recipient defaults to the
  //   captor's wealth handle (a character/domain holder) else external. A gated payer that can't
  //   pay → { ok:false, reason:'insufficient-funds' } and the captive is NOT freed.
  function ransomConfinement(campaign, id, opts){
    const conf = findConfinement(campaign, id);
    if(!conf) return { ok:false, reason:'not-found' };
    if(conf.status !== 'held') return { ok:false, reason:'not-held', confinement: conf };
    opts = opts || {};
    const A = _A();
    const atTurn = (opts.atTurn != null) ? opts.atTurn : (campaign.currentTurn || 1);
    const amount = (opts.amountGp != null) ? (Number(opts.amountGp) || 0) : (conf.ransomValueGp || 0);
    const payer = opts.payer || { kind:'external' };
    const recipient = opts.recipient || _captorWealthHandle(conf.captor) || { kind:'external' };
    let transfer = null;
    if(amount > 0 && typeof A.applyWealthTransfer === 'function'){
      try {
        transfer = A.applyWealthTransfer(campaign, { amount, source: payer, destination: recipient,
          reason:'ransom', bucket:'ransom', allowOverdraft: !!opts.allowOverdraft });
      } catch(e){ return { ok:false, reason:'insufficient-funds', error: String((e && e.message) || e), confinement: conf }; }
    }
    _freeCaptive(campaign, conf.captiveCharacterId, 'ransomed');
    conf.status = 'ransomed'; conf.resolution = 'ransomed'; conf.resolvedAtTurn = atTurn;
    conf.history.push({ turn: atTurn, type:'ransomed', note: amount + ' gp', payer, recipient });
    const who = _captiveLabel(campaign, conf);
    const narrative = who + ' is ransomed for ' + amount.toLocaleString() + ' gp.';
    const event = _emitConfinementEvent(campaign, conf, 'captive-ransomed',
      { amountGp: amount, payer, recipient, hexId: conf.hexId, confinementType: conf.confinementType }, narrative);
    return { ok:true, confinement: conf, amountGp: amount, transfer, event };
  }

  // releaseConfinement(campaign, id, opts) — the captor lets the captive go (no payment).
  function releaseConfinement(campaign, id, opts){
    const conf = findConfinement(campaign, id);
    if(!conf) return { ok:false, reason:'not-found' };
    if(conf.status !== 'held') return { ok:false, reason:'not-held', confinement: conf };
    opts = opts || {};
    const atTurn = (opts.atTurn != null) ? opts.atTurn : (campaign.currentTurn || 1);
    _freeCaptive(campaign, conf.captiveCharacterId, 'released');
    conf.status = 'released'; conf.resolution = 'released'; conf.resolvedAtTurn = atTurn;
    conf.history.push({ turn: atTurn, type:'released', note: opts.reason || '' });
    const who = _captiveLabel(campaign, conf);
    const narrative = who + ' is released.';
    const event = _emitConfinementEvent(campaign, conf, 'captive-released',
      { hexId: conf.hexId, confinementType: conf.confinementType }, narrative);
    return { ok:true, confinement: conf, event };
  }

  // captiveEscapes(campaign, id, opts) — the captive escapes (flees; the monthly check or a GM call).
  function captiveEscapes(campaign, id, opts){
    const conf = findConfinement(campaign, id);
    if(!conf) return { ok:false, reason:'not-found' };
    if(conf.status !== 'held') return { ok:false, reason:'not-held', confinement: conf };
    opts = opts || {};
    const atTurn = (opts.atTurn != null) ? opts.atTurn : (campaign.currentTurn || 1);
    _freeCaptive(campaign, conf.captiveCharacterId, 'escaped');
    conf.status = 'escaped'; conf.resolution = 'escaped'; conf.resolvedAtTurn = atTurn;
    conf.history.push({ turn: atTurn, type:'escaped', note: (opts.roll != null ? ('roll ' + opts.roll.toFixed(3) + ' < ' + (opts.chance != null ? opts.chance : '?')) : '') });
    const who = _captiveLabel(campaign, conf);
    const narrative = who + ' escapes confinement!';
    const event = _emitConfinementEvent(campaign, conf, 'captive-escaped',
      { hexId: conf.hexId, escapeChance: (opts.chance != null ? opts.chance : null), roll: (opts.roll != null ? opts.roll : null) }, narrative);
    return { ok:true, confinement: conf, event };
  }

  // ── The monthly escape check — a slot-70 day-consumer (rides the Day Clock + commitTurn's
  //    runDayTickToMonthEnd). Seeded byte-stable previews: the roll is fixed per (confinement,
  //    turn), so re-opening the day-tick review reproduces it. Gated once per month per held
  //    confinement (lastEscapeCheckTurn !== currentTurn). 🔧 no RAW basis — escapeChanceMonthly
  //    (0 disables) is the GM's lever. ──
  function _cnfHash32(str){
    let h = 2166136261 >>> 0;                                  // FNV-1a
    for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function _cnfMulberry32(seed){
    let a = seed >>> 0;
    return function(){
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function _cnfEscapeRng(conf, turn){ return _cnfMulberry32(_cnfHash32('cnf-escape|' + conf.id + '|' + turn)); }
  function confinementEscapeChance(campaign, conf){
    if(!conf) return 0;
    let p = Number(conf.escapeChanceMonthly);
    if(!(p > 0)) return 0;
    return Math.min(1, p);
  }
  // PURE day-handler (no mutation) — proposes the escape check for each held confinement
  // not yet checked this turn. ctx.rng overrides the seeded rng (tests).
  function proposeConfinementEscapeDay(campaign, ctx){
    ctx = ctx || {};
    const out = { pendingRecords: [], notableEvents: [] };
    if(!campaign || !Array.isArray(campaign.confinements)) return out;
    const turn = campaign.currentTurn || 1;
    for(const conf of campaign.confinements){
      if(!conf || conf.status !== 'held') continue;
      if(conf.lastEscapeCheckTurn === turn) continue;          // already checked this month
      const chance = confinementEscapeChance(campaign, conf);
      const rng = ctx.rng || _cnfEscapeRng(conf, turn);
      const roll = (chance > 0) ? rng() : 1;
      const escaped = chance > 0 && roll < chance;
      out.pendingRecords.push({ type:'confinement-escape', confinementId: conf.id, turn, roll, chance, escaped });
      if(escaped){
        out.notableEvents.push({ type:'confinement-escape', transient: true,
          label: _captiveLabel(campaign, conf) + ' escapes confinement!',
          summary: _captiveLabel(campaign, conf) + ' escapes' });
      }
    }
    return out;
  }
  // Apply one ratified escape record (commit half). Always stamps lastEscapeCheckTurn (so the
  // month isn't re-rolled); frees the captive when escaped.
  function commitConfinementRecord(campaign, record){
    if(!campaign || !record || record.type !== 'confinement-escape') return;
    const conf = findConfinement(campaign, record.confinementId);
    if(!conf || conf.status !== 'held') return;
    conf.lastEscapeCheckTurn = record.turn;
    if(record.escaped) captiveEscapes(campaign, conf.id, { roll: record.roll, chance: record.chance, atTurn: record.turn });
  }
  // Direct (non-day-tick) monthly run — a headless commitTurn / a test / a preview can call it.
  // opts.dryRun returns the proposal without committing. opts.rng injects a deterministic stream.
  function processConfinementsForTurn(campaign, opts){
    opts = opts || {};
    const prop = proposeConfinementEscapeDay(campaign, { rng: opts.rng });
    if(opts.dryRun) return prop;
    prop.pendingRecords.forEach(r => commitConfinementRecord(campaign, r));
    return prop;
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
    materializeHoard, generateHoardForLair,
    // Confinements (Wave-C) — the captive↔captor relation + ransom/release/escape lifecycle
    blankConfinement, createConfinement,
    findConfinement, confinementsForCaptive, confinementForCaptive, confinementsForCaptor, activeConfinements,
    ransomConfinement, releaseConfinement, captiveEscapes,
    confinementEscapeChance, proposeConfinementEscapeDay, commitConfinementRecord, processConfinementsForTurn
  });

  // ════════════════════════════════════════════════════════════════════════════
  // SELF-REGISTRATION (the PR #89/#90 kernel) — cnf- prefix + the confinements collection +
  // the confinement entity-kind + field-schema + the 3 audit event kinds + the slot-70 escape
  // day-consumer, ALL from this module (no central-registry edits — CLAUDE §15.5 / §9.4). The
  // registrars are defined in the core (acks-engine.js / events.js / entity-registry.js /
  // field-schemas.js), all loaded before this module — each call is typeof-guarded so a partial
  // load never throws. RAW core: no house rule.
  // ════════════════════════════════════════════════════════════════════════════
  if(typeof ACKS.registerPrefix === 'function') ACKS.registerPrefix('confinement', 'cnf');
  // Defensive-read collection (the default): seeded in a fresh campaign, NOT migrate-injected
  // (so templates stay byte-level migrate-no-ops — the team-session enabler), walked by Import-Domain.
  if(typeof ACKS.registerCollection === 'function') ACKS.registerCollection('confinements');

  // The 3 record-only audit event kinds — emitted by the ransom/release/escape verbs (NOT
  // hand-emittable via the Event Wizard → wizardOptOut). The handler is record-only (the verb
  // already applied the state); it keeps the event well-formed on replay.
  if(typeof ACKS.registerEventKind === 'function'){
    ACKS.registerEventKind('captive-ransomed', {
      schema: { R:{ confinementId:'string', captiveCharacterId:'string' },
                O:{ amountGp:'number', payer:'object', recipient:'object', hexId:'string', confinementType:'string', narrative:'string' } },
      wizardOptOut: true, handler: applyEvent_confinementAudit });
    ACKS.registerEventKind('captive-released', {
      schema: { R:{ confinementId:'string', captiveCharacterId:'string' },
                O:{ hexId:'string', confinementType:'string', narrative:'string' } },
      wizardOptOut: true, handler: applyEvent_confinementAudit });
    ACKS.registerEventKind('captive-escaped', {
      schema: { R:{ confinementId:'string', captiveCharacterId:'string' },
                O:{ hexId:'string', escapeChance:'number', roll:'number', narrative:'string' } },
      wizardOptOut: true, handler: applyEvent_confinementAudit });
  }

  // The confinement entity-kind (Inspector ▸ Browse/Create gets it for free).
  if(typeof ACKS.registerEntityKind === 'function'){
    ACKS.registerEntityKind({ kind:'confinement', label:'Confinement', pluralLabel:'Confinements', icon:'⛓',
      addressable: true, chronicleable: true,
      list: (c) => (c && c.confinements) || [],
      find: (c, id) => ((c && c.confinements) || []).find(x => x && x.id === id),
      displayName: (c, obj) => obj ? (((obj.confinementType === 'slave') ? 'Slave ' : 'Captive ') +
        (obj.captiveCharacterId || '?') + ' · ' + (obj.status || 'held')) : '' });
  }

  // The Inspector field-schema (every non-computed field is a blankConfinement key — the global
  // schema⊆factory invariant; captor/source are object-typed with a null default, so their
  // sub-fields aren't checked — the loan.collateral pattern).
  if(typeof ACKS.registerFieldSchema === 'function'){
    ACKS.registerFieldSchema('confinement', {
      factory: 'blankConfinement', adminCreate: 'schemaForm',
      groups: ['Identity','Parties','Terms','Lifecycle'],
      fields: [
        { name:'id',                 type:'string', readonly:true, group:'Identity' },
        { name:'captiveCharacterId', type:'id', idKind:'character', required:true, readonly:true, group:'Identity', description:'The prisoner — relation primary key (free + re-create to change)' },
        { name:'captor',             type:'object', group:'Parties', description:'Who holds the captive', fields:[
          { name:'kind',  type:'string', description:"'character' | 'party' | 'domain' | 'lair' | 'unknown'" },
          { name:'id',    type:'string' },
          { name:'label', type:'string' } ] },
        { name:'source',             type:'object', group:'Parties', description:'Provenance (a generated hoard)', fields:[
          { name:'kind',  type:'string' },
          { name:'id',    type:'string' },
          { name:'label', type:'string' } ] },
        { name:'confinementType',    type:'enum', enumValues:['ransom','slave'], group:'Terms' },
        { name:'ransomValueGp',      type:'gp', group:'Terms', description:'Base ransom/slave value (TT p.23)' },
        { name:'escapeChanceMonthly',type:'number', group:'Terms', description:'🔧 Monthly escape chance (0–1); 0 disables. No RAW basis.' },
        { name:'status',             type:'enum', enumValues:['held','ransomed','released','escaped'], group:'Lifecycle' },
        { name:'resolution',         type:'string', readonly:true, group:'Lifecycle', description:'How it ended (set by the verb)' },
        { name:'hexId',              type:'id', idKind:'hex', group:'Lifecycle', description:'Where held' },
        { name:'confinedAtTurn',     type:'number', group:'Lifecycle' },
        { name:'resolvedAtTurn',     type:'number', readonly:true, group:'Lifecycle', description:'Set on ransom/release/escape — null while held' },
        { name:'lastEscapeCheckTurn',type:'number', readonly:true, group:'Lifecycle', description:'The monthly-cadence gate' },
        { name:'notes',              type:'longText', group:'Lifecycle' },
        { name:'isActive',           type:'computed', readonly:true, group:'Lifecycle', description:'True while status === held' }
      ]
    });
  }

  // The slot-70 escape day-consumer (the convalescence / settlement-incident idiom). Monthly
  // cadence via the per-confinement lastEscapeCheckTurn gate; rides commitTurn's runDayTickToMonthEnd.
  if(typeof ACKS.registerDayConsumer === 'function'){
    ACKS.registerDayConsumer('confinements', {
      handler: proposeConfinementEscapeDay,
      order: 70,
      pauseTriggers: [],
      commit: commitConfinementRecord
    });
  }

})(typeof window !== 'undefined' ? window : global);
