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
section('Notability — off by default (deterministic); no rumor without the rule');
// =============================================================================
{
  const { c } = fixture();
  const res = ACKS.marketBuy(c, { settlementId: 'set-1', actorCharacterId: 'chr-buyer', lines: [{ catalogId: 'sword', qty: 1 }] });
  ok('notable=false when markets-transaction-threshold is off', res.result.marketTransaction.notable === false);
  ok('no rumor queued', (c.pendingEvents || []).every(e => e.kind !== 'rumor-emit'));
}

// =============================================================================
// Summary
// =============================================================================
console.log('\n=============================================');
console.log('gp-wave-b.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if (fail) { console.log('\nFAILURES:'); failures.forEach(f => console.log('  ' + f)); process.exit(1); }
