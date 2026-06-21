/* =============================================================================
 * acks-engine-magic-item-availability.js — the licensed Treasure-Tome magic-item
 *   availability + value reference tables (burst12 @b12-census; SD-6 + MI-3-per-Class).
 *
 * WHAT THIS IS: frozen REFERENCE DATA + pure resolvers for the magic-item *market* —
 *   the two TT per-market-per-month tables (Transactions by Rarity + Availability by
 *   Type, TT p.27), the rarity-tier representative values (reconciled to the TT base-cost
 *   bands), and an Econometrics-derived by-NPC-level magic-item-value curve. Three lanes
 *   consume it: MI-3 (the 🪄 magic-item market gate — acks-engine-magic-items.js) reads
 *   the per-Class cells; SD-6 (the magic-item census — acks-engine-demographics.js) reads
 *   the per-settlement availability + the per-NPC value. It is the magic-item analog of
 *   the demographic Starting-Settlements roster.
 *
 * CATALOG POSTURE (Joachim's call 2026-06-21; CLAUDE §13.6 / §13.9 ckpt 3): MECHANICAL
 *   FACTS ONLY — the printed per-Class counts + % chances + value ladders, page-cited,
 *   NO rulebook prose — exactly like the shipped 284-monster MONSTER_CATALOG + the JJ
 *   identity tables. These two tables are facts (numbers in a grid), reorganized into
 *   JSON. The §13.9 Autarch courtesy heads-up applies (Joachim folds it into the catalog
 *   heads-up); the module is self-contained + excisable. NO new entity / prefix / event /
 *   house rule / collection — pure data + accessors (DERIVE-DON'T-STORE).
 *
 * RAW source: ACKS II Treasure Tome p.27 (the two availability tables — "Buying and
 *   Selling Magic Items"); rarity bands TT p.20; the by-NPC-level value structure from
 *   The Econometrics of Aurëpos Part III (§7) reconciled to the TT bands (OQ-7/OQ-8).
 *   Treasure_Tome_RAW_Survey.md §1.4 + Econometrics_of_Aurepos_Survey.md §7/§9.
 *
 * Load order: anywhere in the engine block (pure data; consumers call its accessors at
 *   CALL time on the shared global.ACKS — sibling load order never matters). The test
 *   harness (tests/_engine.js) auto-discovers it (the acks-engine-*.js glob).
 *
 * Authored 2026-06-21 (burst12, the @b12-census lane).
 * =============================================================================
 */
(function(global){
'use strict';
global.ACKS = global.ACKS || {};
const ACKS = global.ACKS;

// Market classes I…VI map to column index 0…5 throughout.
const MARKET_CLASS_LABEL = Object.freeze(['I','II','III','IV','V','VI']);

// ── The five rarity tiers (TT p.20, by max base cost; mirrors acks-engine-magic-items.js
//    RARITY_TIERS — kept here so this module is self-standing reference data). ──
const MAGIC_RARITY_TIER_ORDER = Object.freeze(['common','uncommon','rare','very-rare','legendary']);
const MAGIC_RARITY_TIER_LABEL = Object.freeze({
  common:'Common', uncommon:'Uncommon', rare:'Rare', 'very-rare':'Very Rare', legendary:'Legendary'
});

// ═══════════════════════════════════════════════════════════════════════════════════
// THE TWO TT AVAILABILITY TABLES (TT p.27) — mechanical facts, columns = Class I…VI (0…5).
// A cell is:  a positive integer  (the per-MARKET, per-MONTH count),
//             a string 'N%'       (the % CHANCE that even one is available/sellable that month),
//             or null ('–' in the book) (NOT dealable in a market of that class).
// Per PARTY = per-market ÷ 10 (TT p.27: "divide the number or percentages below by 10!").
// ═══════════════════════════════════════════════════════════════════════════════════

// Magic Item Transactions by Rarity — the MAXIMUM number of each rarity that can be SOLD
// in a market each month (the SELL gate; keyed by rarity). TT p.27.
const MAGIC_ITEM_TRANSACTIONS_BY_RARITY = Object.freeze({
  //            I    II   III  IV    V      VI
  common:      Object.freeze([60,  15,  8,   3,   1,     '25%']),
  uncommon:    Object.freeze([54,  13,  6,   2,   '70%', '20%']),
  rare:        Object.freeze([22,  6,   3,   1,   '30%', '8%' ]),
  'very-rare': Object.freeze([10,  3,   1,   '33%','15%', '5%' ]),
  legendary:   Object.freeze([1,   '25%','12%','3%', '1%',  null])
});

// Magic Item Availability by Type — the NUMBER of each item type that can be BOUGHT in a
// market each month (the BUY gate; keyed by item type). TT p.27.
const MAGIC_ITEM_AVAILABILITY_BY_TYPE = Object.freeze({
  //              I    II     III    IV     V      VI
  potion:        Object.freeze([44,  11,    6,     2,     '60%', '20%']),
  ring:          Object.freeze([2,   '45%', '20%', '5%',  '2%',  '1%' ]),
  scroll:        Object.freeze([82,  21,    10,    3,     1,     '33%']),
  implement:     Object.freeze([9,   2,     1,     '25%', '10%', '3%' ]),
  'misc-weapon': Object.freeze([2,   '55%', '25%', '7%',  '3%',  '1%' ]),
  sword:         Object.freeze([2,   '55%', '25%', '7%',  '3%',  '1%' ]),
  'misc-item':   Object.freeze([4,   1,     '50%', '15%', '5%',  '2%' ]),
  armor:         Object.freeze([2,   '55%', '25%', '7%',  '3%',  '1%' ])
});

const MAGIC_ITEM_TYPE_ORDER = Object.freeze(['potion','ring','scroll','implement','misc-weapon','sword','misc-item','armor']);
const MAGIC_ITEM_TYPE_LABEL = Object.freeze({
  potion:'Potion', ring:'Ring', scroll:'Scroll', implement:'Implement',
  'misc-weapon':'Miscellaneous Weapon', sword:'Sword', 'misc-item':'Miscellaneous Item', armor:'Armor & Shield'
});

// Map the magic-items.js item kind (intrinsic.category / notable.kind) → the TT type key.
// The shipped catalog uses: potion / scroll / wand / rod / staff (→ implement) / magic-weapon
// (→ misc-weapon) / magic-armor (→ armor) / misc-magic (→ misc-item); ring / sword are TT types
// with no shipped catalog entry yet but mapped for completeness. Unknown → null (the caller then
// falls back to the rarity gate). Tolerant of label/alias spellings.
function magicItemTypeForCategory(category){
  const k = String(category == null ? '' : category).trim().toLowerCase().replace(/\s*&\s*/g, '-').replace(/\s+/g, '-');
  switch(k){
    case 'potion': return 'potion';
    case 'scroll': return 'scroll';
    case 'ring': return 'ring';
    case 'wand': case 'rod': case 'staff': case 'rod-wand-staff': case 'implement': return 'implement';
    case 'sword': return 'sword';
    case 'magic-weapon': case 'weapon': case 'misc-weapon': case 'miscellaneous-weapon': return 'misc-weapon';
    case 'magic-armor': case 'armor': case 'shield': case 'armor-shield': return 'armor';
    case 'magic-item': case 'misc-magic': case 'misc-item': case 'miscellaneous-item': case 'wondrous': case 'misc': return 'misc-item';
    default: return null;
  }
}

// ── cell normalization ──────────────────────────────────────────────────────────────
// A normalized cell: { kind:'count'|'chance'|'none', count, chancePct, raw }.
//   count  cell → a guaranteed per-month count   (chancePct 100).
//   chance cell → 0 guaranteed; a chancePct% chance of one this month.
//   none   cell → not dealable in this market class.
function _normCell(raw){
  if(raw == null) return { kind:'none', count:0, chancePct:0, raw:null };
  if(typeof raw === 'number') return { kind:'count', count:raw, chancePct:100, raw };
  const m = /^(\d+(?:\.\d+)?)%$/.exec(String(raw).trim());
  if(m) return { kind:'chance', count:0, chancePct:Number(m[1]), raw };
  return { kind:'none', count:0, chancePct:0, raw };
}
function _classIdx(i){ const n = Number(i); return (Number.isFinite(n)) ? Math.max(0, Math.min(5, n|0)) : 5; }
function _cellAt(table, key, classIdx){
  const row = table[key];
  if(!row) return _normCell(null);
  return _normCell(row[_classIdx(classIdx)]);
}

// Public cell resolvers (normalized). classIdx 0 = Class I … 5 = Class VI.
function magicItemTransactionCell(rarity, classIdx){
  return _cellAt(MAGIC_ITEM_TRANSACTIONS_BY_RARITY, String(rarity || '').toLowerCase(), classIdx);
}
function magicItemTypeAvailabilityCell(itemType, classIdx){
  const key = magicItemTypeForCategory(itemType) || String(itemType || '').toLowerCase();
  return _cellAt(MAGIC_ITEM_AVAILABILITY_BY_TYPE, key, classIdx);
}

// Per-PARTY view of a normalized cell — RAW divides by 10 (TT p.27). A count floors at 1 when the
// market deals in it at all (a market with ≥1 still lets a single party transact ≥1); a chance cell
// keeps a probabilistic per-party chance = chancePct ÷ 10 (and "one if it appears").
function magicItemAvailabilityPerParty(cell){
  if(!cell || cell.kind === 'none') return { kind:'none', count:0, chancePct:0 };
  if(cell.kind === 'count') return { kind:'count', count: Math.max(1, Math.round(cell.count / 10)), chancePct:100 };
  return { kind:'chance', count:0, chancePct: cell.chancePct / 10 };
}

// Convenience: the resolved transactable count for the gate. A count cell → its count (per-market, or
// per-party when opts.perParty); a chance cell → 1 (the chance-item, if present, is one transaction);
// a none cell → 0. (For probabilistic semantics read magicItem*Cell directly.)
function _limit(cell, perParty){
  if(!cell || cell.kind === 'none') return 0;
  if(cell.kind === 'chance') return 1;
  return perParty ? Math.max(1, Math.round(cell.count / 10)) : cell.count;
}
function magicItemTransactionLimit(rarity, classIdx, opts){
  return _limit(magicItemTransactionCell(rarity, classIdx), !!(opts && opts.perParty));
}
function magicItemTypeAvailabilityLimit(itemType, classIdx, opts){
  return _limit(magicItemTypeAvailabilityCell(itemType, classIdx), !!(opts && opts.perParty));
}

// ═══════════════════════════════════════════════════════════════════════════════════
// RARITY-TIER REPRESENTATIVE VALUES (OQ-7 — reconciled to the TT base-cost bands).
// The representative gp value of an item of each rarity, ≈ the band's half-max (Common 1,000 → 500,
// Uncommon 5,000 → 2,500, Rare 25,000 → 12,500, Very Rare 100,000 → 60,000, Legendary open → 300,000).
// These = the HFH/Econometrics §7 tier values, which sit consistently inside the TT bands (TT p.20) —
// so the reconciliation is a confirmation, not a change. Used by the per-NPC value composition + the
// SD-6 census to weigh a tier's stock by value (RAW: total gp value matters more than the count).
// ═══════════════════════════════════════════════════════════════════════════════════
const MAGIC_RARITY_TIER_VALUES = Object.freeze({
  common:500, uncommon:2500, rare:12500, 'very-rare':60000, legendary:300000
});
function magicRarityTierValue(rarity){ return MAGIC_RARITY_TIER_VALUES[String(rarity || '').toLowerCase()] || 0; }
function magicRarityTierLabel(rarity){ return MAGIC_RARITY_TIER_LABEL[String(rarity || '').toLowerCase()] || (rarity || ''); }

// ═══════════════════════════════════════════════════════════════════════════════════
// BY-NPC-LEVEL magic-item value (Econometrics §7 — the per-individual facet; SD-6's per-NPC read +
// the NPC Generator's magic-item step).
//
// 🔧 IP-LIGHT TOOLING CURVE. The Econometrics gives the *structure* (magic-item value follows wealth
// follows the demographic pyramid) + one explicit anchor: a 7th-level NPC holds ≈ 7,000gp of items
// (≈ 4 common + 2 uncommon), and a 0th-level NPC holds only ⅓ of its wealth-implied items. The
// precise per-level cells are ACKS-1-era + need a Treasure-Tome reconciliation (plan OQ-7/OQ-8), so
// this is a FITTED curve, not a transcribed table: linear at 1,000gp/level through the explicit 7th
// anchor (the "linear-ish at low levels" region), then accelerating ×1.4/level above 7th ("as high
// NPCs accrue non-adventuring assets"). GM-overridable; reconciling the exact cells is a follow-on.
// ═══════════════════════════════════════════════════════════════════════════════════
const NPC_MAGIC_ITEM_VALUE_ANCHOR_GP = 7000;   // a 7th-level NPC (Econometrics §7, the explicit anchor)
const NPC_MAGIC_ITEM_ZEROTH_FRACTION = 1/3;     // a 0th-level NPC holds ⅓ of the level-1-implied value

function npcMagicItemValueGp(level){
  const L = Math.floor(Number(level));
  if(!Number.isFinite(L)) return 0;
  if(L <= 0) return Math.round(1000 * NPC_MAGIC_ITEM_ZEROTH_FRACTION); // ⅓ of L1's 1,000 ≈ 333
  if(L <= 7) return 1000 * L;                                          // linear → exact 7,000 at L7
  return Math.round((NPC_MAGIC_ITEM_VALUE_ANCHOR_GP * Math.pow(1.4, L - 7)) / 10) * 10; // accelerating, rounded to 10
}

// Compose an NPC's magic-item value budget into rarity-tier counts. RAW preference (TT p.27 Designer's
// Note + §7): "fewer items of great power, more of lesser power" → a greedy DESCENDING fill (take whole
// items from the highest affordable tier down, so the count grows toward the small tiers). This
// reproduces the Econometrics example exactly: a 7,000gp 7th-level NPC → 2 uncommon + 4 common. The
// sub-tier leftover becomes a % chance of one more common (the RAW "% chance such an item exists" tail).
function npcMagicItemTierAllocation(level){
  const valueGp = npcMagicItemValueGp(level);
  const tiers = {}; MAGIC_RARITY_TIER_ORDER.forEach(t => { tiers[t] = 0; });
  let rem = valueGp;
  for(let t = MAGIC_RARITY_TIER_ORDER.length - 1; t >= 0; t--){
    const key = MAGIC_RARITY_TIER_ORDER[t];
    const v = MAGIC_RARITY_TIER_VALUES[key];
    if(v <= 0) continue;
    const n = Math.floor(rem / v);
    if(n > 0){ tiers[key] = n; rem -= n * v; }
  }
  const chancePct = rem > 0 ? Math.min(100, Math.round((rem / MAGIC_RARITY_TIER_VALUES.common) * 100)) : 0;
  return { level: Math.floor(Number(level)) || 0, valueGp, tiers, leftoverGp: rem,
           chanceOfOneMore: chancePct > 0 ? { tier:'common', chancePct } : null };
}

// ── Export ───────────────────────────────────────────────────────────────────────────
Object.assign(ACKS, {
  // the two TT availability tables + their keys/labels (mechanical facts, TT p.27)
  MAGIC_ITEM_TRANSACTIONS_BY_RARITY, MAGIC_ITEM_AVAILABILITY_BY_TYPE,
  MAGIC_ITEM_TYPE_ORDER, MAGIC_ITEM_TYPE_LABEL, MARKET_CLASS_LABEL,
  MAGIC_RARITY_TIER_ORDER, MAGIC_RARITY_TIER_LABEL,
  // resolvers
  magicItemTypeForCategory,
  magicItemTransactionCell, magicItemTypeAvailabilityCell,
  magicItemTransactionLimit, magicItemTypeAvailabilityLimit,
  magicItemAvailabilityPerParty,
  // rarity-tier values (OQ-7 reconciled to the TT bands)
  MAGIC_RARITY_TIER_VALUES, magicRarityTierValue, magicRarityTierLabel,
  // by-NPC-level value (🔧 IP-light tooling curve, Econometrics §7)
  npcMagicItemValueGp, npcMagicItemTierAllocation
});

if(typeof module !== 'undefined' && module.exports){ module.exports = ACKS; }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
