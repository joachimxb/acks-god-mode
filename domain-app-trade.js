/* =============================================================================
 * domain-app-trade.js — ACKS God Mode app mixin: Trade Wizard (buy/sell at market) UI
 * =============================================================================
 *
 * Trade Wizard (buy/sell at market) UI, extracted from domain-app.js (T5 chip 8, 2026-06-23) — pure code-motion: a
 * reorder-gather of the feature’s members, which the team-session append-zones
 * (@b8..@b14) had scattered across the component literal. Registers a members object
 * on window.__ACKS_APP_MIXINS__; domainApp() merges it into the component
 * (descriptor-preserving, so getters survive). Members use this.* / window.ACKS.* only.
 * Loaded via <script src> after domain-app.js, before Alpine’s deferred init.
 * ============================================================================= */
(function(){
  'use strict';
  var M = (window.__ACKS_APP_MIXINS__ = window.__ACKS_APP_MIXINS__ || []);
  M.push({
  // Trade Wizard (Item Trade IT-4) — the retail buy/sell Action Wizard over ACKS.marketBuy/marketSell.
  trade:{
    open:false, actorId:null, settlementId:null, armyId:null, dir:'buy',   // armyId = a camp-seated trade (RR p.452 baggage-train market); mutually exclusive with settlementId
    search:'', category:'all',
    buyCart:[],                              // [{key, catalogId|null, name, unitPriceGp, stone, qty, availKind, availPercent, availableUnits, band}]
    sellRows:{},                             // inventoryIndex → { sel, qty, priceGp, name, heldQty, stone }
    gName:'', gPrice:null, gStone:null,      // generic-by-price entry
    visitedBefore:false, partyOf12Dedicated:false
  },

  // Mercantile Network (RR p.43) is a Venturer class power — the "visited before" +1-class bonus is
  // shown ONLY to venturers, and auto-set when this venturer has previously entered this market.
  tradeActorIsVenturer(){ return window.ACKS.hasMercantileNetwork(this.tradeActor()); },
  _tradeDeriveVisited(actorId, settlementId){
    const ch = actorId ? (this.currentCampaign?.characters||[]).find(c => c && c.id === actorId) : null;
    if(!window.ACKS.hasMercantileNetwork(ch)) return false;             // non-venturers never get it (engine enforces this too)
    if(!settlementId) return false;
    return window.ACKS.previouslyEnteredMarket(this.currentCampaign, actorId, settlementId);
  },
  tradeActor(){ return this.trade.actorId ? (this.currentCampaign?.characters||[]).find(c => c && c.id === this.trade.actorId) : null; },
  tradeSettlement(){ return this.trade.settlementId ? (this.currentCampaign?.settlements||[]).find(s => s && s.id === this.trade.settlementId) : null; },
  tradeArmy(){ return this.trade.armyId ? (this.currentCampaign?.armies||[]).find(a => a && a.id === this.trade.armyId) : null; },   // a camp-seated trade (RR p.452)
  tradeCharacters(){ return (this.currentCampaign?.characters||[]).filter(c => c && c.id); },
  tradeSettlements(){ return (this.currentCampaign?.settlements||[]).filter(s => s && s.id); },
  tradeCharactersAtSettlement(sid){
    const s = (this.currentCampaign?.settlements||[]).find(x => x && x.id === sid); if(!s) return [];
    return (this.currentCampaign?.characters||[]).filter(c => c && c.currentHexId && c.currentHexId === s.hexId);
  },
  tradeSetActor(id){ this.trade.actorId = id || null; this.trade.partyOf12Dedicated = false; this.trade.visitedBefore = this._tradeDeriveVisited(this.trade.actorId, this.trade.settlementId); this.trade.buyCart = []; this.tradeInitSellRows(); },
  tradePartySize(){
    const ch = this.tradeActor(); if(!ch) return 0; if(!ch.partyId) return 1;
    return (this.currentCampaign?.characters||[]).filter(c => c && c.partyId === ch.partyId).length;
  },
  tradeSetSettlement(id){ this.trade.settlementId = id || null; this.trade.armyId = null; this.trade.visitedBefore = this._tradeDeriveVisited(this.trade.actorId, this.trade.settlementId); this.tradeRecomputeCart(); },
  tradeSetDir(dir){ this.trade.dir = dir; if(dir === 'sell') this.tradeInitSellRows(); },
  tradeMarketClassRoman(){
    const army = this.tradeArmy();
    if(army){ try { return window.ACKS.armyMarketClass(this.currentCampaign, army); } catch(e){ return null; } }   // the camp's baggage-train class (null below 1,200 or while the line is cut)
    const s = this.tradeSettlement(); return s ? this.settlementMarketClass(s) : null;
  },
  tradeMarketClassIdx(){
    const r = this.tradeMarketClassRoman(); const m = { 'I':0, 'II':1, 'III':2, 'IV':3, 'V':4, 'VI':5 };
    if(typeof r === 'string'){ const k = r.replace('*',''); if(m[k] != null) return m[k]; }
    return 5;                                               // default to the smallest market
  },
  tradeNormalLoadSt(){ const b = window.ACKS.carryEncumbranceBandFor(0); return (b && b.maxSt) || 5; },
  tradeAvailOpts(){ return { visitedBefore: !!this.trade.visitedBefore, partyOf12Dedicated: !!this.trade.partyOf12Dedicated }; },
  tradeAvailFor(priceGp){ return window.ACKS.equipmentAvailability(priceGp, this.tradeMarketClassIdx(), this.tradeAvailOpts()); },
  _tradeRollUnits(priceGp){
    const a = this.tradeAvailFor(priceGp);
    if(a.kind === 'none') return 0;
    if(a.kind === 'count') return a.count;
    return window.ACKS.rollEquipmentUnitsAvailable(priceGp, this.tradeMarketClassIdx(), this.tradeAvailOpts());
  },
  tradeAvailLabel(a){
    if(!a) return '';
    if(a.kind === 'none') return 'not stocked';
    if(a.kind === 'count') return a.count.toLocaleString() + ' avail';
    return a.percent + '% · 1 unit';
  },
  tradeCartAvailLabel(l){
    if(l.availKind === 'chance') return l.availableUnits > 0 ? ('1 · rolled ' + l.availPercent + '%') : ('0 · not stocked (' + l.availPercent + '%)');
    if(l.availKind === 'none') return 'not stocked';
    return Number(this.tradeCartEffectiveAvail(l)).toLocaleString() + ' avail';
  },
  tradeCategories(){ return ['all','weapon','ammunition','armor','gear','mount']; },
  tradeCatalog(){
    let list = window.ACKS.EQUIPMENT_CATALOG || [];
    if(this.trade.category !== 'all') list = list.filter(e => e.category === this.trade.category);
    const q = (this.trade.search||'').trim().toLowerCase();
    if(q) list = list.filter(e => e.name.toLowerCase().includes(q));
    return list;
  },
  tradeAddCatalog(item){
    const a = this.tradeAvailFor(item.listPriceGp);
    this.trade.buyCart.push({ key:'c-'+item.id+'-'+this.trade.buyCart.length, catalogId:item.id, name:item.name,
      unitPriceGp:item.listPriceGp, stone:item.stone, qty:1,
      availKind:a.kind, availPercent:a.percent, availableUnits:this._tradeRollUnits(item.listPriceGp), band:a.band });
  },
  tradeAddGeneric(){
    const price = Number(this.trade.gPrice); const name = (this.trade.gName||'').trim();
    if(!name || !(price >= 0)){ this.showToast('Enter a name and a price for the generic item.', 3500); return; }
    const stone = (this.trade.gStone === '' || this.trade.gStone == null) ? 0 : Number(this.trade.gStone);
    const a = this.tradeAvailFor(price);
    this.trade.buyCart.push({ key:'g-'+this.trade.buyCart.length+'-'+Math.random().toString(36).slice(2,6), catalogId:null, name,
      unitPriceGp:price, stone, qty:1, availKind:a.kind, availPercent:a.percent, availableUnits:this._tradeRollUnits(price), band:a.band });
    this.trade.gName = ''; this.trade.gPrice = null; this.trade.gStone = null;
  },
  tradeRemoveCart(key){ this.trade.buyCart = this.trade.buyCart.filter(l => l.key !== key); },
  tradeRecomputeCart(){
    this.trade.buyCart = this.trade.buyCart.map(l => {
      const a = this.tradeAvailFor(l.unitPriceGp);
      return { ...l, availKind:a.kind, availPercent:a.percent, availableUnits:this._tradeRollUnits(l.unitPriceGp), band:a.band };
    });
  },
  tradeInitSellRows(){
    const ch = this.tradeActor(); const rows = {};
    if(ch && Array.isArray(ch.inventory)){
      ch.inventory.forEach((it, ix) => {
        let defPrice = 0;
        const m = (window.ACKS.EQUIPMENT_CATALOG||[]).find(e => e.name.toLowerCase() === (it.name||'').toLowerCase());
        if(m) defPrice = m.listPriceGp;
        const heldQty = (it.qty != null) ? it.qty : 1;
        rows[ix] = { sel:false, qty:heldQty, priceGp:defPrice, name:(it.name||'(unnamed)'), heldQty, stone:it.stone };
      });
    }
    this.trade.sellRows = rows;
  },
  tradeSellRowsList(){ return Object.keys(this.trade.sellRows).map(k => ({ ix:Number(k), ...this.trade.sellRows[k] })); },
  tradeSellSelectedRows(){
    return this.tradeSellRowsList().filter(r => r.sel).map(r => {
      const a = this.tradeAvailFor(r.priceGp);
      let availableUnits = (a.kind === 'none') ? 0 : (a.kind === 'count' ? a.count : 1);   // sell cap (chance → the market absorbs 1)
      const rem = this.tradeMonthlyRemaining(r.name, r.priceGp);                            // RR p.124 — 10× monthly ceiling
      if(Number.isFinite(rem)) availableUnits = Math.min(availableUnits, rem);
      return { ...r, availKind:a.kind, availPercent:a.percent, availableUnits };
    });
  },
  tradePurseGp(){ const ch = this.tradeActor(); return (ch && ch.coins && Number(ch.coins.gp)) || 0; },
  tradeBuyTotalGp(){ return this.trade.buyCart.reduce((s,l) => s + (Number(l.unitPriceGp)||0)*(Number(l.qty)||0), 0); },
  tradeBuyTotalStone(){ return this.trade.buyCart.reduce((s,l) => s + (Number(l.stone)||0)*(Number(l.qty)||0), 0); },
  tradeSellTotalGp(){ return this.tradeSellSelectedRows().reduce((s,r) => s + (Number(r.priceGp)||0)*(Number(r.qty)||0), 0); },
  tradeSellTotalStone(){
    return this.tradeSellSelectedRows().reduce((s,r) => {
      const heldStone = Number(r.stone)||0; const heldQty = Number(r.heldQty)||1; const qty = Number(r.qty)||0;
      return s + heldStone*(qty/heldQty);
    }, 0);
  },
  // Mirrors the engine _marketActivityCost: core RAW = 1 ancillary; a real 12+ party = 1 dedicated
  // (RR p.124); the M&M load-metering (⌈stone÷normal-load⌉) only when the house rule is on.
  tradeActivityCost(){
    const stone = (this.trade.dir === 'buy') ? this.tradeBuyTotalStone() : this.tradeSellTotalStone();
    const dedicated = !!this.trade.partyOf12Dedicated && this.tradePartySize() >= 12;
    return window.ACKS._marketActivityCost(this.currentCampaign, stone, { partyOf12Dedicated: dedicated });
  },
  tradeActivityLabel(){
    const ac = this.tradeActivityCost();
    if(ac.slot === 'dedicated') return '1 dedicated activity';
    return ac.units + ' ancillary errand' + (ac.units === 1 ? '' : 's');
  },
  tradeActivityTitle(){
    if(!!this.trade.partyOf12Dedicated && this.tradePartySize() >= 12) return 'A 12+ party devoting a dedicated activity to shopping (RR p.124).';
    if(this.isHouseRuleEnabled('markets-load-metered-activity')) return 'M&M p.15 (house rule on): one ancillary covers up to a normal load (~5 st); a bigger haul costs ⌈stone ÷ normal-load⌉ ancillary errands.';
    return 'Core RAW: a market transaction is one ancillary activity (JJ Campaign-Activities list, RR p.123). The M&M load-metering is behind the markets-load-metered-activity house rule (default off).';
  },
  // RR p.124 — the 10× campaign-wide monthly ceiling for this item at this market (count cells only).
  tradeMonthlyRemaining(name, priceGp){
    const s = this.tradeSettlement(); if(!s) return Infinity;
    return window.ACKS.marketMonthlyRemaining(this.currentCampaign, s, { name, listPriceGp: priceGp }, this.trade.dir);
  },
  tradeCartEffectiveAvail(l){
    const rem = this.tradeMonthlyRemaining(l.name, l.unitPriceGp);
    return Math.min(Number(l.availableUnits), Number.isFinite(rem) ? rem : Number(l.availableUnits));
  },
  tradeSubmitDisabledReason(){
    const ch = this.tradeActor(); if(!ch) return 'Pick a character.';
    const army = this.tradeArmy();
    if(army){ if(!this.tradeMarketClassRoman()) return 'This army is too small to be its own market (needs 1,200+ troops, RR p.452) — or its supply line is cut.'; }
    else { const s = this.tradeSettlement(); if(!s) return 'Pick a settlement (the market).'; }
    if(this.trade.dir === 'buy'){
      if(!this.trade.buyCart.length) return 'Add an item to buy.';
      for(const l of this.trade.buyCart){
        if(!(Number(l.qty) > 0)) return l.name + ': set a quantity.';
        const eff = this.tradeCartEffectiveAvail(l);
        if(Number(l.qty) > eff) return l.name + ': only ' + Number(eff).toLocaleString() + ' available this month at Class ' + this.tradeMarketClassRoman() + '.';
      }
      const total = this.tradeBuyTotalGp();
      if(total > this.tradePurseGp()) return 'Not enough coin in the purse (have ' + this.tradePurseGp().toLocaleString() + ', need ' + total.toLocaleString() + ' gp).';
      return '';
    }
    const rows = this.tradeSellSelectedRows();
    if(!rows.length) return 'Select an item to sell.';
    for(const r of rows){
      if(!(Number(r.priceGp) >= 0)) return r.name + ': set a market price.';
      if(!(Number(r.qty) > 0)) return r.name + ': set a quantity.';
      if(Number(r.qty) > Number(r.heldQty)) return r.name + ': only ' + r.heldQty + ' held.';
      if(Number(r.qty) > Number(r.availableUnits)) return r.name + ': the market will take only ' + Number(r.availableUnits).toLocaleString() + ' this month.';
    }
    return '';
  },
  tradeCanSubmit(){ return this.tradeSubmitDisabledReason() === ''; },
  tradeSubmit(){
    if(!this.tradeCanSubmit()){ this.showToast(this.tradeSubmitDisabledReason(), 4000); return; }
    const ch = this.tradeActor(); const s = this.tradeSettlement(); const army = this.tradeArmy();
    const market = army
      ? { marketClassIdx: this.tradeMarketClassIdx(), marketClassRoman: this.tradeMarketClassRoman() }   // a settlement-less camp market (RR p.452)
      : { settlementId: s.id };
    const common = { actorCharacterId:ch.id, ...market, visitedBefore:!!this.trade.visitedBefore, partyOf12Dedicated:!!this.trade.partyOf12Dedicated, submittedBy:'gm' };
    let res;
    if(this.trade.dir === 'buy'){
      const lines = this.trade.buyCart.map(l => l.catalogId
        ? ({ catalogId:l.catalogId, qty:Number(l.qty), availableUnits:Number(l.availableUnits) })
        : ({ name:l.name, priceGp:Number(l.unitPriceGp), stone:Number(l.stone)||0, qty:Number(l.qty), availableUnits:Number(l.availableUnits) }));
      res = window.ACKS.marketBuy(this.currentCampaign, { ...common, lines, payFrom:'purse', itemTo:'carry' });
    } else {
      const lines = this.tradeSellSelectedRows().map(r => ({ inventoryIndex:r.ix, name:r.name, priceGp:Number(r.priceGp), qty:Number(r.qty), availableUnits:Number(r.availableUnits) }));
      res = window.ACKS.marketSell(this.currentCampaign, { ...common, lines, payFrom:'purse', itemFrom:'carry' });
    }
    if(!res || !res.ok){ this.showToast(this._tradeErr(res && res.error, res && res.detail), 4800); return; }
    this.markDirty(); this.schedulePersist();
    const mt = res.result && res.result.marketTransaction;
    let msg = (this.trade.dir === 'buy' ? 'Bought ' : 'Sold ') + res.lines.length + ' line' + (res.lines.length === 1 ? '' : 's') + ' for ' + Number(res.totalGp).toLocaleString() + ' gp.';
    if(mt && mt.activityCost) msg += ' · ' + mt.activityCost.units + ' ancillary errand' + (mt.activityCost.units === 1 ? '' : 's') + ' (#346).';
    if(mt && mt.notable) msg += ' ★ Notable transaction.';
    this.showToast(msg, 5500);
    this.trade.buyCart = [];                                // reset the order; keep the modal open for more
    this.tradeInitSellRows();
  },
  _tradeErr(code, detail){
    const m = {
      'unknown-actor':'Character not found.',
      'no-lines':'Nothing selected.',
      'no-price':'That item has no price — enter one.',
      'bad-qty':'Bad quantity.',
      'unavailable':'The market doesn’t stock that many' + (detail && detail.name ? (' ' + detail.name) : '') + ' this month' + (detail && detail.availableUnits != null ? (' (only ' + detail.availableUnits + ').') : '.'),
      'monthly-ceiling':'The market is tapped out of' + (detail && detail.name ? (' ' + detail.name) : ' that item') + ' for the month' + (detail && detail.remaining != null ? (' (' + detail.remaining + ' left — RR p.124 10× ceiling).') : '.'),
      'insufficient-funds':'Not enough coin' + (detail ? (' (have ' + Number(detail.have).toLocaleString() + ', need ' + Number(detail.need).toLocaleString() + ').') : '.'),
      'bad-index':'That inventory line is gone — reopen the wizard.',
      'apply-failed':'Transaction failed' + (detail ? (' (' + detail + ')') : '.')
    };
    return m[code] || ('Trade failed' + (code ? (' (' + code + ')') : '') + '.');
  },
  tradeRevenuePerFamily(d){return window.ACKS.tradeRevenuePerFamily(this.currentCampaign, d);},
  });
})();
