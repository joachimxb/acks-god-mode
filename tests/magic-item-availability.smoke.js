'use strict';
/* tests/magic-item-availability.smoke.js — burst12 @b12-census.
 *
 * The licensed Treasure-Tome magic-item availability/value reference tables (catalog posture,
 * TT p.27, mechanical facts only) + the two consumers wired to them:
 *   - the new module acks-engine-magic-item-availability.js (the two TT tables + rarity-tier values
 *     + the by-NPC-level value curve + the cell resolvers);
 *   - MI-3-per-Class — magicItemMarketAvailability now reads the real cells (buy-by-type, sell-by-rarity);
 *   - SD-6 — the magic-item census (expected availability vs realized stock + per-NPC value).
 * Run: node tests/magic-item-availability.smoke.js  (or via npm test).
 */
const { load } = require('./_engine.js');
const ACKS = load();

let passed = 0, failed = 0;
function ok(label, cond, extra){ if(cond){ passed++; } else { failed++; console.error('  FAIL: ' + label + (extra ? ' — ' + extra : '')); } }
function section(s){ console.log('\n# ' + s); }

// ── 1. exports + table structural integrity ──────────────────────────────────────────────────────
section('exports + table structure');
['MAGIC_ITEM_TRANSACTIONS_BY_RARITY','MAGIC_ITEM_AVAILABILITY_BY_TYPE','MAGIC_RARITY_TIER_VALUES',
 'magicItemTypeForCategory','magicItemTransactionCell','magicItemTypeAvailabilityCell',
 'magicItemTransactionLimit','magicItemTypeAvailabilityLimit','magicItemAvailabilityPerParty',
 'magicRarityTierValue','npcMagicItemValueGp','npcMagicItemTierAllocation'].forEach(fn =>
  ok('ACKS.' + fn + ' exported', typeof ACKS[fn] === 'function' || typeof ACKS[fn] === 'object'));

const TBR = ACKS.MAGIC_ITEM_TRANSACTIONS_BY_RARITY, TAT = ACKS.MAGIC_ITEM_AVAILABILITY_BY_TYPE;
const cellOk = v => v == null || typeof v === 'number' || /^\d+(\.\d+)?%$/.test(String(v));
ok('Transactions-by-Rarity has 5 rows × 6 columns of valid cells',
   ['common','uncommon','rare','very-rare','legendary'].every(r => Array.isArray(TBR[r]) && TBR[r].length === 6 && TBR[r].every(cellOk)));
ok('Availability-by-Type has 8 rows × 6 columns of valid cells',
   ['potion','ring','scroll','implement','misc-weapon','sword','misc-item','armor'].every(t => Array.isArray(TAT[t]) && TAT[t].length === 6 && TAT[t].every(cellOk)));

// ── 2. oracle cells — TT p.27 (mechanical facts; the licensed-cells contract) ─────────────────────
section('oracle cells (TT p.27)');
// Transactions by Rarity (SELL): I II III IV V VI
ok('sell common = 60/15/8/3/1/25%', JSON.stringify(TBR.common) === JSON.stringify([60,15,8,3,1,'25%']));
ok('sell uncommon = 54/13/6/2/70%/20%', JSON.stringify(TBR.uncommon) === JSON.stringify([54,13,6,2,'70%','20%']));
ok('sell rare = 22/6/3/1/30%/8%', JSON.stringify(TBR.rare) === JSON.stringify([22,6,3,1,'30%','8%']));
ok('sell very-rare = 10/3/1/33%/15%/5%', JSON.stringify(TBR['very-rare']) === JSON.stringify([10,3,1,'33%','15%','5%']));
ok('sell legendary = 1/25%/12%/3%/1%/–', JSON.stringify(TBR.legendary) === JSON.stringify([1,'25%','12%','3%','1%',null]));
// Availability by Type (BUY)
ok('buy potion = 44/11/6/2/60%/20%', JSON.stringify(TAT.potion) === JSON.stringify([44,11,6,2,'60%','20%']));
ok('buy scroll = 82/21/10/3/1/33%', JSON.stringify(TAT.scroll) === JSON.stringify([82,21,10,3,1,'33%']));
ok('buy ring = 2/45%/20%/5%/2%/1%', JSON.stringify(TAT.ring) === JSON.stringify([2,'45%','20%','5%','2%','1%']));
ok('buy implement = 9/2/1/25%/10%/3%', JSON.stringify(TAT.implement) === JSON.stringify([9,2,1,'25%','10%','3%']));
ok('buy misc-item = 4/1/50%/15%/5%/2%', JSON.stringify(TAT['misc-item']) === JSON.stringify([4,1,'50%','15%','5%','2%']));
ok('sword/armor/misc-weapon share 2/55%/25%/7%/3%/1%', ['sword','armor','misc-weapon'].every(t => JSON.stringify(TAT[t]) === JSON.stringify([2,'55%','25%','7%','3%','1%'])));

// ── 3. cell resolvers + normalization ─────────────────────────────────────────────────────────────
section('cell resolvers — count / chance / none');
ok('transactionCell common @I = count 60', (() => { const c = ACKS.magicItemTransactionCell('common',0); return c.kind==='count' && c.count===60; })());
ok('transactionCell uncommon @V = chance 70%', (() => { const c = ACKS.magicItemTransactionCell('uncommon',4); return c.kind==='chance' && c.chancePct===70; })());
ok('transactionCell legendary @VI = none (the "–" cell)', ACKS.magicItemTransactionCell('legendary',5).kind === 'none');
ok('typeAvailabilityCell scroll @I = count 82', (() => { const c = ACKS.magicItemTypeAvailabilityCell('scroll',0); return c.kind==='count' && c.count===82; })());
ok('typeAvailabilityCell ring @II = chance 45%', ACKS.magicItemTypeAvailabilityCell('ring',1).chancePct === 45);
ok('classIdx clamps out-of-range to 0..5', ACKS.magicItemTransactionCell('common',9).count === ACKS.magicItemTransactionCell('common',5).count);

// ── 4. per-party = per-market ÷ 10 (TT p.27 "divide the number or percentages below by 10!") ──────
section('per-party ÷ 10');
ok('count cell: common@I 60 → per-party 6', ACKS.magicItemAvailabilityPerParty(ACKS.magicItemTransactionCell('common',0)).count === 6);
ok('small count floors at 1: rare@III 3 → per-party 1', ACKS.magicItemAvailabilityPerParty(ACKS.magicItemTransactionCell('rare',2)).count === 1);
ok('chance cell: uncommon@V 70% → per-party 7%', ACKS.magicItemAvailabilityPerParty(ACKS.magicItemTransactionCell('uncommon',4)).chancePct === 7);
ok('none cell → per-party none', ACKS.magicItemAvailabilityPerParty(ACKS.magicItemTransactionCell('legendary',5)).kind === 'none');
ok('limit helper: typeAvailabilityLimit potion@I per-party = 4', ACKS.magicItemTypeAvailabilityLimit('potion',0,{perParty:true}) === 4);
ok('limit helper: transactionLimit common@I per-market = 60', ACKS.magicItemTransactionLimit('common',0) === 60);

// ── 5. type mapping (catalog kind → TT type) ──────────────────────────────────────────────────────
section('magicItemTypeForCategory');
ok('potion→potion, scroll→scroll, ring→ring', ACKS.magicItemTypeForCategory('potion')==='potion' && ACKS.magicItemTypeForCategory('scroll')==='scroll' && ACKS.magicItemTypeForCategory('ring')==='ring');
ok('wand/rod/staff → implement', ['wand','rod','staff'].every(k => ACKS.magicItemTypeForCategory(k)==='implement'));
ok('magic-weapon → misc-weapon, magic-armor → armor, misc-magic → misc-item',
   ACKS.magicItemTypeForCategory('magic-weapon')==='misc-weapon' && ACKS.magicItemTypeForCategory('magic-armor')==='armor' && ACKS.magicItemTypeForCategory('misc-magic')==='misc-item');
ok('unknown category → null (caller falls back to rarity)', ACKS.magicItemTypeForCategory('xyzzy') === null && ACKS.magicItemTypeForCategory(null) === null);

// ── 6. rarity-tier values (OQ-7 — reconciled to the TT base-cost bands) ────────────────────────────
section('rarity-tier values');
ok('values = 500/2500/12500/60000/300000', ACKS.magicRarityTierValue('common')===500 && ACKS.magicRarityTierValue('uncommon')===2500 &&
   ACKS.magicRarityTierValue('rare')===12500 && ACKS.magicRarityTierValue('very-rare')===60000 && ACKS.magicRarityTierValue('legendary')===300000);
ok('each tier value sits inside / at its TT band max (Common 1000 … VeryRare 100000)',
   ACKS.magicRarityTierValue('common') <= 1000 && ACKS.magicRarityTierValue('uncommon') <= 5000 &&
   ACKS.magicRarityTierValue('rare') <= 25000 && ACKS.magicRarityTierValue('very-rare') <= 100000);

// ── 7. by-NPC-level value (🔧 Econometrics §7 anchor; the per-individual facet) ────────────────────
section('by-NPC-level magic-item value');
ok('L7 = 7000 (the explicit Econometrics anchor)', ACKS.npcMagicItemValueGp(7) === 7000);
ok('linear at low levels (L1=1000, L4=4000)', ACKS.npcMagicItemValueGp(1) === 1000 && ACKS.npcMagicItemValueGp(4) === 4000);
ok('L0 = ⅓ of L1 (≈333)', ACKS.npcMagicItemValueGp(0) === Math.round(1000/3));
ok('accelerates above L7 (L8 > linear-8000)', ACKS.npcMagicItemValueGp(8) > 8000 && ACKS.npcMagicItemValueGp(14) > ACKS.npcMagicItemValueGp(13));
// the decomposition reproduces the Econometrics example exactly: 7000gp → 4 common + 2 uncommon
const alloc7 = ACKS.npcMagicItemTierAllocation(7);
ok('L7 tier allocation = 4 common + 2 uncommon (the Econometrics §7 example)',
   alloc7.tiers.common === 4 && alloc7.tiers.uncommon === 2 && alloc7.tiers.rare === 0, JSON.stringify(alloc7.tiers));
const alloc10 = ACKS.npcMagicItemTierAllocation(10);
ok('greedy-descending "fewer great, more lesser" (L10 has a rare + lesser tiers)', alloc10.tiers.rare >= 1 && (alloc10.tiers.common + alloc10.tiers.uncommon) >= 1);

// ── 8. MI-3-per-Class — the market gate reads the new cells (buy-by-type, sell-by-rarity) ──────────
section('MI-3 gate over the TT cells');
function mkMarket(mc){ return { currentTurn:1, eventLog:[], settlements:[{ id:'s', name:'Mkt', marketClass:mc, families:20000 }] }; }
const potion = { id:'ni-p', kind:'potion', intrinsic:{ category:'potion', rarity:'common', baseCost:500 } };
const sword  = { id:'ni-l', kind:'magic-weapon', intrinsic:{ category:'magic-weapon', rarity:'legendary', baseCost:200000 } };
{
  const m1 = mkMarket('I'), s = m1.settlements[0];
  const buy = ACKS.magicItemMarketAvailability(m1, potion, s, { direction:'buy' });
  ok('BUY gates by TYPE: potion@I → per-market 44, per-party 4', buy.transactable && buy.itemType==='potion' && buy.perMarketMax===44 && buy.perPartyMax===4);
  const sell = ACKS.magicItemMarketAvailability(m1, potion, s, { direction:'sell' });
  ok('SELL gates by RARITY: common@I → per-market 60, per-party 6', sell.transactable && sell.perMarketMax===60 && sell.perPartyMax===6);
}
{
  // RAW correction: legendary IS transactable at a smaller market at a % chance (was hard-refused).
  const m3 = mkMarket('III'), s3 = m3.settlements[0];
  const sellL = ACKS.magicItemMarketAvailability(m3, sword, s3, { direction:'sell' });
  ok('legendary SELL @III = chance 12% (the licensed-cells correction)', sellL.transactable && sellL.cellKind==='chance' && sellL.chancePct===12);
  // …but legendary SELL @VI = the TT "–" → market-too-small-for-rarity
  const m6 = mkMarket('VI'), s6 = m6.settlements[0];
  const sellV = ACKS.magicItemMarketAvailability(m6, sword, s6, { direction:'sell' });
  ok('legendary SELL @VI refused (TT "–")', !sellV.transactable && sellV.reason==='market-too-small-for-rarity');
  // BUY legendary magic-weapon @VI = by-type misc-weapon 1% chance → transactable
  const buyV = ACKS.magicItemMarketAvailability(m6, sword, s6, { direction:'buy' });
  ok('legendary magic-weapon BUY @VI = by-type chance 1%', buyV.transactable && buyV.itemType==='misc-weapon' && buyV.chancePct===1);
}
{
  // per-month headroom: a sell consumes the per-party cap (counted from the eventLog by rarity).
  const m = mkMarket('III'), s = m.settlements[0];
  // rare@III sell = 3 → per-party 1; a prior sell this month exhausts it
  const rareItem = { id:'ni-r', kind:'magic-weapon', intrinsic:{ category:'magic-weapon', rarity:'rare', baseCost:15000 } };
  ok('rare@III sell per-party 1, monthly remaining 1', (() => { const a = ACKS.magicItemMarketAvailability(m, rareItem, s, { direction:'sell' }); return a.perPartyMax===1 && a.monthlyRemaining===1; })());
  m.eventLog.push({ event:{ kind:'magic-item-sold', payload:{ settlementId:'s', direction:'sell', rarity:'rare', qty:1 }, appliedAtTurn:1 }, appliedAtTurn:1 });
  ok('after one rare sell this month, ceiling hit (not available)', (() => { const a = ACKS.magicItemMarketAvailability(m, rareItem, s, { direction:'sell' }); return a.transactable && !a.available && a.reason==='monthly-ceiling'; })());
}

// ── 9. SD-6 — the magic-item census (expected availability vs realized stock + per-NPC) ────────────
section('SD-6 magic-item census');
['expectedSettlementMagicItems','realizedSettlementMagicItems','settlementMagicItemDelta','settlementMagicItemCensus','expectedNpcMagicItemValue','expectedNpcMagicItemTiers'].forEach(fn =>
  ok('ACKS.' + fn + ' exported', typeof ACKS[fn] === 'function'));
{
  const camp = {
    currentTurn:1,
    settlements:[{ id:'s1', name:'Cyfaraun', marketClass:'I', families:20000, hexId:'hx1' }],
    characters:[{ id:'c1', name:'Mage', class:'mage', level:9, homeSettlementId:'s1', lifecycleState:'active' }],
    notableItems:[
      { id:'ni1', kind:'potion', name:'Healing', intrinsic:{ category:'potion', rarity:'common', baseCost:500, apparentValue:500 } },
      { id:'ni2', kind:'magic-weapon', name:'Flametongue', intrinsic:{ category:'magic-weapon', rarity:'rare', baseCost:20000, apparentValue:18000 } }
    ],
    itemCustody:[
      { id:'cu1', itemId:'ni1', custodianKind:'merchant-stock', custodianId:'s1', status:'active' },
      { id:'cu2', itemId:'ni2', custodianKind:'character', custodianId:'c1', status:'active' }
    ],
    stashes:[{ id:'st1', hexId:'hx1', items:[{ name:'Glowing dust', facets:['magical'], qty:2 }] }]
  };
  const s1 = camp.settlements[0];
  const exp = ACKS.expectedSettlementMagicItems(camp, s1);
  ok('expected availability @I: potion buy 44/party4, common sell 60/party6', exp.byType.potion.perMarket===44 && exp.byType.potion.perParty===4 && exp.byRarity.common.perMarket===60 && exp.byRarity.common.perParty===6);
  const real = ACKS.realizedSettlementMagicItems(camp, 's1');
  ok('realized: 2 items (1 on shelf, 1 held), value 18500', real.totalCount===2 && real.onShelf===1 && real.heldByResidents===1 && real.totalValueGp===18500);
  ok('realized by type/rarity: potion×1, misc-weapon×1, common×1, rare×1', real.byType.potion.count===1 && real.byType['misc-weapon'].count===1 && real.byRarity.common.count===1 && real.byRarity.rare.count===1);
  ok('realized counts loose magical stash lines at the hex', real.looseMagicalLines===2);
  const d = ACKS.settlementMagicItemDelta(camp, s1);
  ok('delta: potion available 44 vs placed 1 → 43 unplaced', d.byType.potion.availablePerMarket===44 && d.byType.potion.placed===1 && d.byType.potion.unplaced===43);
  ok('delta carries per-rarity placed + value', d.byRarity.rare.placed===1 && d.byRarity.rare.valueGp===18000);
  // per-NPC read
  ok('expectedNpcMagicItemValue(9) matches the curve', ACKS.expectedNpcMagicItemValue(9) === ACKS.npcMagicItemValueGp(9));
  ok('expectedNpcMagicItemTiers(7) = 4 common + 2 uncommon', (() => { const t = ACKS.expectedNpcMagicItemTiers(7).tiers; return t.common===4 && t.uncommon===2; })());
  // a Class VI hamlet has far less availability than Class I
  const vi = ACKS.expectedSettlementMagicItems(camp, { id:'s2', marketClass:'VI', families:80 });
  ok('Class VI potion availability < Class I (20% chance vs 44 count)', vi.byType.potion.cellKind==='chance' && vi.byType.potion.chancePct===20);
}

// ── 10. catalog posture / no-data-layer-change invariant ──────────────────────────────────────────
section('no new entity / prefix / collection (derive-don\'t-store)');
ok('availability module adds NO id prefix (ID_PREFIXES has no magic-availability prefix)', (() => {
  const p = ACKS.ID_PREFIXES || {}; return !Object.keys(p).some(k => /avail|magic-item-avail/i.test(k));
})());
ok('tables are frozen reference data', Object.isFrozen(TBR) && Object.isFrozen(TAT) && Object.isFrozen(ACKS.MAGIC_RARITY_TIER_VALUES));

console.log('\n=============================================');
console.log('magic-item-availability.smoke.js — Passed: ' + passed + ', Failed: ' + failed);
console.log('=============================================');
process.exit(failed ? 1 : 0);
