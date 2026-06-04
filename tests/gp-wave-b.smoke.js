/* tests/gp-wave-b.smoke.js — GP Wave B: the wealth/item movement grammar + IT-2.
 *
 *   node tests/gp-wave-b.smoke.js   (or via `npm test`)
 *
 * Covers the layered GP grammar (Architecture.md §4.3 / §4.3.6, 2026-06-04):
 *   • wealth-transfer  — the coin/gp PRIMITIVE (typed source/destination handles)
 *   • item-transfer    — the symmetric item-line PRIMITIVE (in/out/between inventories)
 *   • market-transaction — the COMPOUND composing both, driven by marketBuy / marketSell
 *     (Phase_2.9_Item_Trade_Plan.md IT-2): buy/sell run THROUGH real inventory + the coin
 *     purse, gated by the RR p.124 availability matrix + funds.
 * Asserts the move-vs-record split (a flow moves ONCE; the audit decomposition is logged,
 * not re-applied), atomicity, and the child-event linkage (parentEventId + campaignLogHidden).
 */
'use strict';
const path = require('path');
const DIR = path.join(__dirname, '..');
[
  'acks-engine-catalogs.js', 'acks-engine.js', 'acks-engine-entities.js',
  'acks-engine-entity-registry.js', 'acks-engine-field-schemas.js',
  'acks-engine-events.js', 'acks-engine-subsystems.js',
].forEach(f => require(path.join(DIR, f)));
const ACKS = global.ACKS;

// ─── tiny assertion harness ───
let pass = 0, fail = 0;
const failures = [];
function ok(label, cond, detail) {
  if (cond) { pass++; }
  else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); }
}
function section(t) { console.log('\n— ' + t); }
function threws(label, fn) { let t = false; try { fn(); } catch (e) { t = true; } ok(label, t); }
const approx = (a, b) => Math.abs(a - b) < 1e-9;

// ─── fixture ───
function fixture() {
  const c = ACKS.blankCampaign({ name: 'GP Wave B', currentTurn: 3 });
  const buyer = ACKS.blankCharacter({ id: 'chr-buyer', name: 'Aelric', coins: { gp: 1000 }, currentHexId: 'hex-1' });
  buyer.inventory = [];
  const payee = ACKS.blankCharacter({ id: 'chr-payee', name: 'Mira', coins: { gp: 0 } });
  c.characters.push(buyer, payee);
  // City (2,500 families) → market class III (generous availability)
  const set = ACKS.blankSettlement({ id: 'set-1', name: 'Cyfaraun', families: 2500, hexId: 'hex-1' });
  c.settlements.push(set);
  const dom = ACKS.blankDomain({ id: 'dom-1', name: 'March' });
  c.domains.push(dom);
  const treasury = ACKS.blankStash({ id: 'stash-treasury', kind: 'domain-treasury', ownerDomainId: 'dom-1',
    items: [ ACKS.blankStashItem({ kind: 'coin', denomination: 'gp', qty: 5000 }) ] });
  c.stashes.push(treasury);
  dom.treasuryStashId = treasury.id; dom.treasury = { gp: 5000 };
  const cache = ACKS.blankStash({ id: 'stash-cache', kind: 'cache', hexId: 'hex-1',
    items: [ ACKS.blankStashItem({ kind: 'coin', denomination: 'gp', qty: 200 }) ] });
  c.stashes.push(cache);
  return { c, buyer, payee, set, dom, treasury, cache };
}
const H = {
  treasury: id => ({ kind: 'treasury', id }),
  charGp:   id => ({ kind: 'character-gp', id }),
  stash:    id => ({ kind: 'stash', id }),
  ext:      (label) => ({ kind: 'external', label: label || 'external' }),
};

// =============================================================================
section('Market class is DERIVED, not stored (RR p.351 / Item Trade plan §2.1, OQ6)');
// =============================================================================
{
  // blankSettlement carries no marketClass field — it comes from family count.
  const s = ACKS.blankSettlement({ families: 2500 });
  ok('blankSettlement has no stored marketClass', s.marketClass === undefined);
  ok('2,500 families → Class III via lookupSettlementBenchmark', ACKS.lookupSettlementBenchmark(2500).marketClass === 'III');
  ok('75 families → Class VI', ACKS.lookupSettlementBenchmark(75).marketClass === 'VI');
}

// =============================================================================
section('wealth-transfer primitive — typed handles move gp through the shipped movers');
// =============================================================================
{
  const { c, treasury } = fixture();
  // character-gp → treasury
  const r1 = ACKS._doWealthTransfer(c, { source: H.charGp('chr-buyer'), destination: H.treasury('dom-1'), amount: 300, bucket: 'deposit' });
  const buyer = c.characters.find(x => x.id === 'chr-buyer');
  ok('buyer.coins.gp = 700', buyer.coins.gp === 700);
  ok('personalGp mirror synced to 700', buyer.personalGp === 700);
  ok('treasury grew 5000→5300', ACKS.domainTreasuryGp(c, 'dom-1') === 5300);
  ok('treasury scalar in sync', c.domains[0].treasury.gp === 5300);
  ok('change record returned', r1 && r1.amount === 300 && r1.currency === 'gp');
}
{
  const { c } = fixture();
  // treasury → character-gp (pay a salary out of the treasury)
  ACKS._doWealthTransfer(c, { source: H.treasury('dom-1'), destination: H.charGp('chr-payee'), amount: 250, bucket: 'wage' });
  ok('payee purse credited 250', c.characters.find(x => x.id === 'chr-payee').coins.gp === 250);
  ok('treasury shrank 5000→4750', ACKS.domainTreasuryGp(c, 'dom-1') === 4750);
}
{
  const { c } = fixture();
  // external → character-gp (windfall) and character-gp → external (spend offscreen)
  ACKS._doWealthTransfer(c, { source: H.ext('found'), destination: H.charGp('chr-buyer'), amount: 100, bucket: 'windfall' });
  ok('external→character credits with no source debit', c.characters.find(x => x.id === 'chr-buyer').coins.gp === 1100);
  ACKS._doWealthTransfer(c, { source: H.charGp('chr-buyer'), destination: H.ext('spent'), amount: 600, bucket: 'expense' });
  ok('character→external debits the purse', c.characters.find(x => x.id === 'chr-buyer').coins.gp === 500);
}
{
  const { c } = fixture();
  // gated overdraft: a character can't transfer more gp than the purse holds
  threws('insufficient purse funds throws', () => ACKS._doWealthTransfer(c, { source: H.charGp('chr-buyer'), destination: H.ext(), amount: 5000 }));
  ok('failed transfer left the purse untouched (atomic — checked before mutation)', c.characters.find(x => x.id === 'chr-buyer').coins.gp === 1000);
}
{
  const { c } = fixture();
  // treasury is NOT gated (a domain can run a lean month negative — preserves today's behaviour)
  ACKS._doWealthTransfer(c, { source: H.treasury('dom-1'), destination: H.ext(), amount: 6000, allowOverdraft: false });
  ok('treasury overdraft allowed (gated:false)', ACKS.domainTreasuryGp(c, 'dom-1') === -1000);
}
{
  const { c } = fixture();
  // a cache stash provides gp; debit beyond its coin line throws
  ACKS._doWealthTransfer(c, { source: H.stash('stash-cache'), destination: H.charGp('chr-payee'), amount: 150 });
  ok('cache stash → character moves 150', c.characters.find(x => x.id === 'chr-payee').coins.gp === 150);
  ok('cache stash gp reduced 200→50', ACKS._wealthLegAvailable(c, H.stash('stash-cache')).available === 50);
  threws('cache overdraft throws', () => ACKS._doWealthTransfer(c, { source: H.stash('stash-cache'), destination: H.ext(), amount: 999 }));
}

// =============================================================================
section('item-transfer primitive — lines move in/out/between inventories');
// =============================================================================
{
  const { c } = fixture();
  // external → character (materialise a bought line with weight)
  ACKS._doItemTransfer(c, { source: H.ext('market'), destination: { kind: 'character', id: 'chr-buyer' },
    lines: [{ name: 'Sword', qty: 1, stone: 1/6 }], bucket: 'purchase' });
  const buyer = c.characters.find(x => x.id === 'chr-buyer');
  ok('a real carry line landed', buyer.inventory.length === 1 && buyer.inventory[0].name === 'Sword');
  ok('the carry line carries its weight', approx(buyer.inventory[0].stone, 1/6));
  // character → external (remove a held line by index)
  ACKS._doItemTransfer(c, { source: { kind: 'character', id: 'chr-buyer' }, destination: H.ext('market'),
    lines: [{ inventoryIndex: 0 }], bucket: 'sale' });
  ok('the held line was removed on sell', buyer.inventory.length === 0);
  // can't sell at a bad index
  threws('bad inventory index throws', () => ACKS._doItemTransfer(c, { source: { kind: 'character', id: 'chr-buyer' }, destination: H.ext(), lines: [{ inventoryIndex: 9 }] }));
}
{
  const { c } = fixture();
  // character ↔ stash wraps the shipped cache/draw setters
  const buyer = c.characters.find(x => x.id === 'chr-buyer');
  buyer.inventory = [{ name: 'Tent', stone: 5, notes: '' }];
  ACKS._doItemTransfer(c, { source: { kind: 'character', id: 'chr-buyer' }, destination: H.stash('stash-cache'), lines: [{ inventoryIndex: 0 }] });
  ok('cacheToStash route emptied carry', buyer.inventory.length === 0);
  const cache = c.stashes.find(s => s.id === 'stash-cache');
  ok('the item landed in the stash', cache.items.some(it => it.name === 'Tent'));
}

// =============================================================================
section('record-only loggers — log the audit decomposition WITHOUT moving');
// =============================================================================
{
  const { c } = fixture();
  const before = c.characters.find(x => x.id === 'chr-buyer').coins.gp;
  const ev = ACKS.recordWealthTransfer(c, { source: H.charGp('chr-buyer'), destination: H.treasury('dom-1'), amount: 50, bucket: 'note' });
  ok('recordWealthTransfer did NOT move gp', c.characters.find(x => x.id === 'chr-buyer').coins.gp === before);
  ok('it logged an applied wealth-transfer', c.eventLog.some(e => e.event.kind === 'wealth-transfer' && e.event.id === ev.id));
  ok('standalone record is visible in the Campaign Log (no parent)', !ev.campaignLogHidden);
  // child of a parent → campaignLogHidden + parentEventId
  const parent = ACKS.newEvent('market-transaction', { payload: { direction: 'buy', actorCharacterId: 'chr-buyer', lines: [] } });
  const child = ACKS.recordItemTransfer(c, { source: H.ext('market'), destination: { kind: 'character', id: 'chr-buyer' }, lines: [{ name: 'Sword', qty: 1 }] }, { parentEvent: parent });
  ok('child carries parentEventId', child.parentEventId === parent.id);
  ok('child is hidden from the Campaign Log (parent narrates)', child.campaignLogHidden === true);
}

// =============================================================================
section('standalone dispatch — applyEvent on the primitives moves state');
// =============================================================================
{
  const { c } = fixture();
  const ev = ACKS.newEvent('wealth-transfer', { payload: { amount: 200, source: H.treasury('dom-1'), destination: H.charGp('chr-buyer') } });
  const out = ACKS.applyEvent(c, ev);
  ok('dispatched wealth-transfer credited the purse', c.characters.find(x => x.id === 'chr-buyer').coins.gp === 1200);
  ok('result carries a wealthTransfer change', out.result && out.result.wealthTransfer && out.result.wealthTransfer.amount === 200);
  // applyEvent is transactional — an insufficient transfer rolls back
  const bad = ACKS.newEvent('wealth-transfer', { payload: { amount: 99999, source: H.charGp('chr-buyer'), destination: H.ext() } });
  threws('insufficient dispatched transfer throws', () => ACKS.applyEvent(c, bad));
  ok('rollback left the purse at 1200', c.characters.find(x => x.id === 'chr-buyer').coins.gp === 1200);
}

// =============================================================================
section('IT-2 — marketBuy: pay coins, receive a REAL inventory line, gated by availability + funds');
// =============================================================================
{
  const { c } = fixture();
  const res = ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 2 }] });
  const buyer = c.characters.find(x => x.id === 'chr-buyer');
  ok('marketBuy ok', res.ok, JSON.stringify(res));
  ok('a sword costs 10gp → total 20gp', res.totalGp === 20);
  ok('purse debited EXACTLY once (1000→980, not double-applied)', buyer.coins.gp === 980);
  ok('a real carry line landed (one line, qty 2)', buyer.inventory.length === 1 && buyer.inventory[0].name === 'Sword' && buyer.inventory[0].qty === 2);
  ok('the line carries its TOTAL weight (2 × 1/6 st)', approx(buyer.inventory[0].stone, 2/6));
  ok('the gear weight counts toward encumbrance', approx(buyer.inventory.reduce((s, it) => s + ACKS.itemEncumbranceSt(it), 0), 2/6));
  // the compound + its two children are in the log, linked
  const parent = c.eventLog.find(e => e.event.kind === 'market-transaction');
  ok('a market-transaction parent is logged', !!parent);
  const kids = c.eventLog.filter(e => e.event.parentEventId === parent.event.id);
  ok('it has a wealth-transfer + an item-transfer child', kids.some(e => e.event.kind === 'wealth-transfer') && kids.some(e => e.event.kind === 'item-transfer'));
  ok('both children are campaignLogHidden (the parent narrates)', kids.length >= 2 && kids.every(e => e.event.campaignLogHidden));
  ok('the parent narrates the purchase', /Bought/.test(parent.result.narrativeSummary));
}
{
  const { c } = fixture();
  // availability gate — a Class III market stocks only 35 swords/month; 40 is unavailable
  const res = ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 40 }] });
  ok('over-availability buy rejected', !res.ok && res.error === 'unavailable', JSON.stringify(res));
  ok('rejected buy left the purse untouched', c.characters.find(x => x.id === 'chr-buyer').coins.gp === 1000);
  ok('rejected buy added no inventory', c.characters.find(x => x.id === 'chr-buyer').inventory.length === 0);
}
{
  const { c } = fixture();
  // funds gate — a 315gp heavy warhorse ×4 = 1260gp > 1000gp purse
  const res = ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'horse-heavy-war', qty: 4, availableUnits: 99 }] });
  ok('insufficient-funds buy rejected', !res.ok && res.error === 'insufficient-funds', JSON.stringify(res));
  ok('no coins moved on a funds rejection', c.characters.find(x => x.id === 'chr-buyer').coins.gp === 1000);
}
{
  const { c } = fixture();
  // generic-by-price — any off-catalogue item transacts off its list price
  const res = ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ name: 'Curiosity', priceGp: 8, stone: 0.5, qty: 1 }] });
  ok('generic-by-price buy ok', res.ok, JSON.stringify(res));
  ok('priced off the given list price', res.totalGp === 8);
  ok('a line with no price is rejected', !ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ name: 'Mystery' }] }).ok);
}

// =============================================================================
section('IT-2 — marketSell: remove a held line, credit the purse (mirror gate)');
// =============================================================================
{
  const { c } = fixture();
  const buyer = c.characters.find(x => x.id === 'chr-buyer');
  buyer.inventory = [{ name: 'Plate Armor', stone: 6, notes: '' }];
  const res = ACKS.marketSell(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ inventoryIndex: 0, priceGp: 60 }] });
  ok('marketSell ok', res.ok, JSON.stringify(res));
  ok('the held line was removed', buyer.inventory.length === 0);
  ok('the purse was credited at market price (1000→1060)', buyer.coins.gp === 1060);
  ok('a sale logs a market-transaction', c.eventLog.some(e => e.event.kind === 'market-transaction' && e.event.payload.direction === 'sell'));
  // can't sell what you don't hold
  ok('selling a non-held index is rejected', !ACKS.marketSell(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ inventoryIndex: 7, priceGp: 10 }] }).ok);
}

// =============================================================================
section('IT-3 — activity cost: RAW default = 1 ancillary; M&M load-metering is a house rule');
// =============================================================================
{
  // CORE RAW (no house rule): a market transaction is ONE ancillary activity, regardless of load
  // (JJ Campaign-Activities list "Buy equipment in the market", RR p.123).
  const { c } = fixture();
  const r35 = ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 35 }] });
  ok('35 swords (5.83 st) → 1 ancillary by default (core RAW, flat)', r35.ok && r35.event.payload.activityCost.units === 1 && r35.event.payload.activityCost.slot === 'ancillary', JSON.stringify(r35.ok && r35.event.payload.activityCost));
  const { c: c2 } = fixture();
  const rBig = ACKS.marketBuy(c2, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ name: 'Crates', priceGp: 1, stone: 100, qty: 1 }] });
  ok('a 100-st haul is still 1 ancillary by default (no load-metering)', rBig.ok && rBig.event.payload.activityCost.units === 1, JSON.stringify(rBig.ok && rBig.event.payload.activityCost));
}
{
  // M&M p.15 (house rule ON): the load-metering kicks in — ⌈stone ÷ 5-st normal load⌉ ancillary
  const { c } = fixture(); c.houseRules['markets-load-metered-activity'] = { enabled: true };
  const r30 = ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 30 }] });
  ok('rule on: 30 swords (5 st) → 1 ancillary', r30.ok && r30.event.payload.activityCost.units === 1, JSON.stringify(r30.ok && r30.event.payload.activityCost));
  const { c: c2 } = fixture(); c2.houseRules['markets-load-metered-activity'] = { enabled: true };
  const r35 = ACKS.marketBuy(c2, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 35 }] });
  ok('rule on: 35 swords (5.83 st) → 2 ancillaries (M&M p.15)', r35.ok && r35.event.payload.activityCost.units === 2 && r35.result.marketTransaction.activityCost.units === 2, JSON.stringify(r35.ok && r35.event.payload.activityCost));
}
{
  // a led warhorse carries 0 st — ONE ancillary either way (you spend time at the market)
  const { c } = fixture();
  const rh = ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'horse-heavy-war', qty: 1 }] });
  ok('a 0-stone led mount is 1 ancillary', rh.ok && rh.event.payload.activityCost.units === 1 && rh.event.payload.activityCost.totalStone === 0, JSON.stringify(rh.ok && rh.event.payload.activityCost));
}
{
  // a 12+ party may devote a DEDICATED activity to shopping (RR p.124) — and only a REAL 12+ party.
  const { c } = fixture();
  const rLone = ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 2 }], partyOf12Dedicated: true });
  ok('the 12+ flag is ignored for a lone character (RR p.124 guard)', rLone.ok && rLone.event.payload.activityCost.slot === 'ancillary' && rLone.event.payload.partyOf12Dedicated === false, JSON.stringify(rLone.event.payload.activityCost));
  const { c: c2 } = fixture();
  c2.characters.find(x => x.id === 'chr-buyer').partyId = 'party-1';
  for (let i = 0; i < 11; i++) c2.characters.push(ACKS.blankCharacter({ id: 'm' + i, name: 'Member ' + i, partyId: 'party-1' }));
  const r12 = ACKS.marketBuy(c2, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 2 }], partyOf12Dedicated: true });
  ok('a real 12+ party (dedicated shop) → 1 dedicated activity', r12.ok && r12.event.payload.activityCost.slot === 'dedicated' && r12.event.payload.activityCost.units === 1, JSON.stringify(r12.event.payload.activityCost));
}
{
  ok('market-transaction is the load-meterable cost-tag ACTIVITY_COSTS knows (IT-1)', ACKS.activityCostFor('market-transaction').loadMetered === true);
}

// =============================================================================
section('RR p.124 — the 10× campaign-wide monthly availability ceiling (per settlement, per item)');
// =============================================================================
{
  const { c, set } = fixture();
  set.families = 100;   // → Class VI: a sword (10gp, band 2–10) has per-party availability 1, so the campaign ceiling is 10
  ok('nothing sold this month', ACKS.marketUnitsTransactedThisMonth(c, 'set-1', 'sword', 'buy') === 0);
  ok('monthly remaining starts at 10× the per-party 1', ACKS.marketMonthlyRemaining(c, set, { name: 'Sword', listPriceGp: 10 }, 'buy') === 10);
  let allOk = true;
  for (let i = 0; i < 10; i++) { const r = ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 1 }] }); allOk = allOk && r.ok; }
  ok('ten single-sword buys succeed up to the ceiling', allOk);
  ok('the month is now depleted (10 sold)', ACKS.marketUnitsTransactedThisMonth(c, 'set-1', 'sword', 'buy') === 10);
  ok('monthly remaining is 0', ACKS.marketMonthlyRemaining(c, set, { name: 'Sword', listPriceGp: 10 }, 'buy') === 0);
  const r11 = ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 1 }] });
  ok('the 11th sword is blocked by the monthly ceiling', !r11.ok && r11.error === 'monthly-ceiling', JSON.stringify(r11));
  const rAxe = ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'battle-axe', qty: 1 }] });
  ok('a different item is independent (per-item ceiling)', rAxe.ok, JSON.stringify(rAxe));
  c.currentTurn = 4;
  ok('the ceiling resets next month', ACKS.marketMonthlyRemaining(c, set, { name: 'Sword', listPriceGp: 10 }, 'buy') === 10);
}

// =============================================================================
section('IT-3 reader — the budget COUNTS the shopping trip (OQ1: cost-tagged events + undertakings)');
// =============================================================================
{
  const { c } = fixture();   // currentTurn 3; buyer has no journeys/magistracies
  const b0 = ACKS.characterActivityBudget(c, 'chr-buyer');
  ok('empty budget before any activity', b0.ancillary.length === 0 && b0.dedicated.length === 0);
  // buy 35 swords = 1 ancillary by default (core RAW)
  ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 35 }] });
  const b1 = ACKS.characterActivityBudget(c, 'chr-buyer');
  ok('the budget counts the shopping trip (1 ancillary by default)', b1.ancillary.filter(a => a.kind === 'market-transaction').length === 1, JSON.stringify(b1.ancillary.map(a => a.kind)));
  ok('sourced from the cost-tagged event, not a parallel ledger', b1.ancillary.filter(a => a.kind === 'market-transaction').every(a => a.sourceKind === 'errand-event'));
  ok('within budget (1 ≤ 4 ancillary, no dedicated)', !b1.overBudget);
}
{
  // attribution: a co-located character who didn't shop sees nothing
  const { c } = fixture();
  ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 1 }] });
  ok('the errand attributes only to the acting character', ACKS.characterActivityBudget(c, 'chr-payee').ancillary.length === 0);
}
{
  // over-budget needs the M&M load-metering ON: a 100-stone haul = 20 ancillaries > the 12/day cap
  const { c } = fixture();
  c.houseRules['markets-load-metered-activity'] = { enabled: true };
  ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ name: 'Crates', priceGp: 1, stone: 100, qty: 1 }] });
  const b = ACKS.characterActivityBudget(c, 'chr-buyer');
  ok('rule on: a 100-st haul = 20 ancillaries → over the 12/day cap', b.overBudget && b.ancillary.length === 20, JSON.stringify({ over: b.overBudget, n: b.ancillary.length }));
}
{
  // window: an errand from a PRIOR turn is not in this month's budget
  const { c } = fixture();
  ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 30 }] });
  c.currentTurn = 4;   // advance the accounting month
  ok("last month's shopping isn't in this month's budget", ACKS.characterActivityBudget(c, 'chr-buyer').ancillary.filter(a => a.kind === 'market-transaction').length === 0);
}

// =============================================================================
section('IT-3 reader — the budget REFRESHES each game DAY (RR: the 1+4 / 12 allowance is per-day)');
// =============================================================================
{
  // the day-stamp lands on the applied event + its eventLog wrapper
  const { c } = fixture();   // currentTurn 3, currentDayInMonth 1
  const r = ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 1 }] });
  ok('the applied market-transaction is day-stamped (appliedAtDay = currentDayInMonth)', r.ok && r.event.appliedAtDay === 1, JSON.stringify({ day: r.event && r.event.appliedAtDay }));
  ok('the eventLog wrapper carries appliedAtDay too', c.eventLog[c.eventLog.length - 1].appliedAtDay === 1);
}
{
  // two trips on the SAME game day accumulate (each market visit is its own errand)
  const { c } = fixture();
  ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 1 }] });
  ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 1 }] });
  ok('two trips on the same game day = 2 ancillary errands', ACKS.characterActivityBudget(c, 'chr-buyer').ancillary.filter(a => a.kind === 'market-transaction').length === 2);
}
{
  // advancing the Day Clock clears yesterday's errands — the core fix
  const { c } = fixture();
  ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 1 }] });
  ok('day 1: the shopping shows', ACKS.characterActivityBudget(c, 'chr-buyer').ancillary.filter(a => a.kind === 'market-transaction').length === 1);
  c.currentDayInMonth = 2;   // a day ticks
  ok("day 2: yesterday's shopping is gone — the budget refreshed", ACKS.characterActivityBudget(c, 'chr-buyer').ancillary.filter(a => a.kind === 'market-transaction').length === 0);
}
{
  // per-DAY window, not a per-month tally: shopping on 13 different days never stacks past the day's cap
  const { c } = fixture();
  for (let day = 1; day <= 13; day++) {
    c.currentDayInMonth = day;
    ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 1 }] });
  }
  const b = ACKS.characterActivityBudget(c, 'chr-buyer');   // still day 13
  ok("on day 13 only day 13's errand counts (not 13 — which would falsely blow the 12/day cap)", b.ancillary.filter(a => a.kind === 'market-transaction').length === 1, JSON.stringify({ n: b.ancillary.length }));
  ok('…so the day stays within budget', !b.overBudget);
}
{
  // the monthly 10× availability ceiling is INDEPENDENT of the daily budget — it stays MONTH-windowed
  const { c, set } = fixture();
  set.families = 100;   // Class VI: sword ceiling = 10 for the month
  for (let i = 0; i < 6; i++) ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 1 }] });
  c.currentDayInMonth = 2;   // a new DAY (not a new month) — refreshes the activity budget, NOT availability
  let allOk = true;
  for (let i = 0; i < 4; i++) { const r = ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 1 }] }); allOk = allOk && r.ok; }
  ok('the ceiling spans days within the month (6 on day 1 + 4 on day 2 = 10 ok)', allOk);
  const r11 = ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 1 }] });
  ok('the 11th is still blocked though a day ticked (availability is monthly, the budget is daily)', !r11.ok && r11.error === 'monthly-ceiling', JSON.stringify(r11));
}

// =============================================================================
section('Notability — off by default (deterministic); no rumor without the rule');
// =============================================================================
{
  const { c } = fixture();
  const res = ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 1 }] });
  ok('notable=false when markets-transaction-threshold is off', res.result.marketTransaction.notable === false);
  ok('no rumor queued', (c.pendingEvents || []).every(e => e.kind !== 'rumor-emit'));
}

// =============================================================================
section('Phase 2 — migration sweep: shipped GP flows emit the grammar as children');
// =============================================================================
{
  // treasury-grant → a wealth-transfer child (external → treasury), hidden from the Campaign Log
  const { c } = fixture();
  const ev = ACKS.newEvent('treasury-grant', { payload: { domainId: 'dom-1', amount: 400, label: 'royal gift' } });
  ACKS.applyEvent(c, ev);
  const child = c.eventLog.find(e => e.event.kind === 'wealth-transfer' && e.event.parentEventId === ev.id);
  ok('treasury-grant emitted a wealth-transfer child', !!child);
  ok('child: external → treasury, 400gp', child && child.event.payload.destination.kind === 'treasury' && child.event.payload.amount === 400);
  ok('child is campaignLogHidden (the grant narrates)', child && child.event.campaignLogHidden === true);
  ok('treasury moved exactly once (5000→5400, not doubled by the record)', ACKS.domainTreasuryGp(c, 'dom-1') === 5400);
}
{
  const { c } = fixture();
  const ev = ACKS.newEvent('treasury-debit', { payload: { domainId: 'dom-1', amount: 250, label: 'repairs', reason: 'wall repairs' } });
  ACKS.applyEvent(c, ev);
  const child = c.eventLog.find(e => e.event.kind === 'wealth-transfer' && e.event.parentEventId === ev.id);
  ok('treasury-debit emitted a treasury → external child', !!child && child.event.payload.source.kind === 'treasury' && child.event.payload.amount === 250);
  ok('treasury debited once (5000→4750)', ACKS.domainTreasuryGp(c, 'dom-1') === 4750);
}
{
  // adventure-result → a wealth-transfer per gp award (a character purse + a domain treasury)
  const { c } = fixture();
  const ev = ACKS.newEvent('adventure-result', { payload: { outcome: 'cleared', treasureAwarded: [
    { kind: 'gp', amount: 300, destinationCharacterId: 'chr-buyer', label: 'loot' },
    { kind: 'gp', amount: 700, destinationDomainId: 'dom-1', label: 'coffer share' },
  ] } });
  ACKS.applyEvent(c, ev);
  const kids = c.eventLog.filter(e => e.event.kind === 'wealth-transfer' && e.event.parentEventId === ev.id);
  ok('adventure-result emitted a wealth-transfer per gp award', kids.length === 2);
  ok('loot reached the buyer purse + a character-gp child', c.characters.find(x => x.id === 'chr-buyer').coins.gp === 1300 && kids.some(k => k.event.payload.destination.kind === 'character-gp'));
  ok('coffer share reached the treasury + a treasury child', ACKS.domainTreasuryGp(c, 'dom-1') === 5700 && kids.some(k => k.event.payload.destination.kind === 'treasury'));
}
{
  // cacheToStash / drawFromStash now emit standalone item-transfer (+ a wealth-transfer coin leg)
  const { c } = fixture();
  const buyer = c.characters.find(x => x.id === 'chr-buyer');
  buyer.inventory = [{ name: 'Lantern', stone: 1, notes: '' }];
  ACKS.cacheToStash(c, 'chr-buyer', 'stash-cache', { itemIndices: [0], coins: { gp: 100 } });
  ok('cache emits an item-transfer (character → stash, item line only)', c.eventLog.some(e => e.event.kind === 'item-transfer' && e.event.payload.source.kind === 'character' && e.event.payload.destination.kind === 'stash' && e.event.payload.lines.some(l => l.name === 'Lantern')));
  ok('cache emits a wealth-transfer for the coin leg', c.eventLog.some(e => e.event.kind === 'wealth-transfer' && e.event.payload.amount === 100 && e.event.payload.bucket === 'cache'));
  ok('cache moved coins once (purse 1000→900)', buyer.coins.gp === 900);
  ok('cache/draw events are visible in the Campaign Log (a narratable action, no parent)', c.eventLog.filter(e => e.event.kind === 'item-transfer').every(e => !e.event.campaignLogHidden));
  const cache = c.stashes.find(s => s.id === 'stash-cache');
  const lantern = cache.items.find(it => it.name === 'Lantern');
  ACKS.drawFromStash(c, 'stash-cache', 'chr-buyer', { itemIds: [lantern.id], coins: { gp: 50 } });
  ok('draw emits an item-transfer (stash → character)', c.eventLog.some(e => e.event.kind === 'item-transfer' && e.event.payload.source.kind === 'stash' && e.event.payload.destination.kind === 'character'));
}

// =============================================================================
// Summary
// =============================================================================
console.log('\n=============================================');
console.log('gp-wave-b.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if (fail) { console.log('\nFAILURES:'); failures.forEach(f => console.log('  ' + f)); process.exit(1); }
