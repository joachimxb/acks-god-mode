/* ACKS God Mode — acks-engine-banking.js
 * Banking & Loans — B1 (the credit + custody data layer). Phase 4, Wave B (#148).
 *
 * Spec: Phase_4_Banking_Plan.md (B1 the commercial loan + B2 the interest-accrual consumer,
 * bundled here per the burst7 manifest) · RAW substrate: Banking_RAW_Survey.md. ACKS has no
 * dedicated banking chapter — the credit instrument is *Access to Capital* (RR p.42); custody
 * is RR p.313. A THIN economic layer over the SHIPPED GP Wave B grammar (applyWealthTransfer /
 * recordWealthTransfer + the typed wealth-handle vocabulary) + the SHIPPED monthly-turn
 * consumer pattern (processLivingExpensesForTurn) — NOT a parallel system, NOT a monetary
 * simulation.
 *
 * THIS SLICE (B1 — standalone commercial + personal loans + interest + the bank account):
 *   • blankLoan (lon-) — the shared Loan relation (campaign.loans[]); kind commercial|personal|
 *     feudal. B1 builds commercial + personal; the F&D feudal-loan reconcile is B2 (DEFERRED —
 *     this module does NOT touch the F&D obligation code or acks-engine-religion.js).
 *   • blankBankAccount (bnk-) — a deposit/custody relation (campaign.bankAccounts[]) that DOUBLES
 *     as a GP Wave B wealth-handle ({ kind:'bank-account', id }), so deposit/withdraw reuse the
 *     whole shipped money-movement machinery (the one engine-events touch: the resolver case).
 *   • takeLoan / repayLoan — advance the principal (creditor → debtor) + repay, via the grammar;
 *     the per-market capital pool (RR p.42, keyed on the shipped market class) caps commercial credit.
 *   • openBankAccount / depositToBankAccount / withdrawFromBankAccount — via the bank-account handle.
 *   • processBankingForTurn(campaign,{rng,dryRun}) — the monthly interest-accrual consumer (the §4
 *     engine heart): bill 3%/1% interest (RR p.42) debtor → creditor, capitalize the shortfall +
 *     flag disrepute / debt-over-XP (RR p.42), credit any deposit return, reset the per-market
 *     capital pool. Hooked into commitTurn after the F&D pass (the ONE commitTurn touch this burst).
 *
 * Loads after the canonical set (newId / ID_PREFIXES / settlementMarketClass / domainTreasuryGp /
 * applyWealthTransfer / recordWealthTransfer / newEvent / setEventContext). Self-contained: pure
 * reads + setters over a passed campaign; cross-module helpers resolve at CALL time off global.ACKS.
 *
 * RAW-default polarity (CLAUDE §6): the credit + custody mechanics are RAW core, default-on,
 * dormant-until-used (processBankingForTurn is a no-op with no loans/accounts) — NO house rule
 * registered this round (the manifest allocates none; the optional `banking`/`simplified-banking`
 * toggles are deferred to a later wave, see the SUMMARY doc-delta). +0 house rules.
 */
(function(global){
  'use strict';

  const ACKS = global.ACKS = global.ACKS || {};

  // Factory plumbing — proxy SCHEMA_VERSION / newId / ID_PREFIXES through the namespace at call
  // time (the acks-engine-entities.js idiom; the sanctums/politics late-loaded-module precedent).
  const SCHEMA_VERSION = 2;
  const newId = function(prefix){ return global.ACKS.newId(prefix); };
  const ID_PREFIXES = new Proxy({}, { get(_, key){ return (global.ACKS.ID_PREFIXES || {})[key]; } });
  // Late-bound ACKS namespace (freshest export set; these run well after every module loads).
  function _A(){ return global.ACKS || ACKS; }

  // ── RAW constants (RR p.42 Access to Capital; RR p.313 custody) ──
  const INTEREST_UNCOLLATERALIZED = 0.03;   // 3% / month, uncollateralized loan (RR p.42)
  const INTEREST_COLLATERALIZED   = 0.01;   // 1% / month, collateralized loan (RR p.42)
  const CUSTODY_FEE_AT_CONSIGNMENT = 0.10;  // 10% one-time custody fee at consignment (RR p.313)
  // RR p.42 — the maximum capital a market can lend per month, keyed on the SHIPPED market class
  // (settlementMarketClass → 'I'…'VI'). The credit-availability dial. 'VI*' (a hamlet) reads as VI.
  const MARKET_CAPITAL_POOL = Object.freeze({ 'I':100000, 'II':25000, 'III':10000, 'IV':5000, 'V':2000, 'VI':1000, 'VI*':1000 });

  // ── Defensive collection reads (absent collections read as []) ──
  function _loans(c){ return (c && Array.isArray(c.loans)) ? c.loans : []; }
  function _accounts(c){ return (c && Array.isArray(c.bankAccounts)) ? c.bankAccounts : []; }
  function _chars(c){ return (c && Array.isArray(c.characters)) ? c.characters : []; }
  function _settlements(c){ return (c && Array.isArray(c.settlements)) ? c.settlements : []; }
  function _currentTurn(c){ return (c && c.currentTurn) || 1; }
  function _round(n){ return Math.round(Number(n) || 0); }

  // ════════════════════════════════════════════════════════════════════════════
  // Factories
  // ════════════════════════════════════════════════════════════════════════════

  // The shared Loan relation (Architecture §2.2 composition-over-hierarchy; §3.1 entity test:
  // homeless state [balance/rate/status], pointed-at-by-many [creditor + debtor + market],
  // identity-through-change [balance shrinks, interest accrues, offered→active→repaid/defaulted]).
  function blankLoan(opts){
    opts = opts || {};
    const principal = _round(opts.principalGp);
    return {
      schemaVersion: SCHEMA_VERSION,
      id: opts.id || newId(ID_PREFIXES.loan),                 // 'lon-…'
      kind: opts.kind || 'commercial',                        // commercial | personal | feudal (feudal = B2 reconcile)
      // Counterparties — exactly one creditor + one debtor.
      creditor: opts.creditor || null,   // { kind:'character'|'domain'|'bank'|'merchant-guild', id?, label? }
      debtor:   opts.debtor   || null,   // { kind:'character'|'domain', id }
      principalGp: principal,                                 // the original advance
      balanceGp: (opts.balanceGp != null) ? _round(opts.balanceGp) : principal,   // current outstanding
      interestRateMonthly: (opts.interestRateMonthly != null) ? Number(opts.interestRateMonthly) : INTEREST_UNCOLLATERALIZED,
      collateral: opts.collateral || null,   // null | { stashItemId } | { kind:'note', label }  (1% vs 3%, RR p.42)
      status: opts.status || 'active',       // offered | active | repaid | defaulted | written-off
      contractedAtTurn: opts.contractedAtTurn || 1,
      settledAtTurn: (opts.settledAtTurn != null) ? opts.settledAtTurn : null,
      marketSettlementId: opts.marketSettlementId || null,    // the market the credit was drawn in (capital-pool accounting)
      // Default tracking (commercial, RR p.42)
      missedInterestTurns: opts.missedInterestTurns || 0,
      disreputable: opts.disreputable || false,               // unpaid interest built up — loses Mercantile-network powers (a flag others read)
      debtOverXp: opts.debtOverXp || false,                   // balance > the debtor's XP → bounty-hunter trigger (B5; flag only in B1)
      // Cross-system links (reserved — set in later waves; NOT used in B1)
      ventureId: opts.ventureId || null,                      // B5 trade-route financing
      fdObligationId: opts.fdObligationId || null,            // B2 F&D feudal-loan reconcile (promote-and-link)
      history: opts.history || []
    };
  }

  // A deposit/account: a relation (owner + custodian, lifetime-bearing balance) AND a money
  // LOCATION, so it doubles as a GP Wave B wealth-handle ({ kind:'bank-account', id }).
  function blankBankAccount(opts){
    opts = opts || {};
    return {
      schemaVersion: SCHEMA_VERSION,
      id: opts.id || newId(ID_PREFIXES.bankAccount),          // 'bnk-…'
      owner:     opts.owner     || null,   // { kind:'character'|'domain'|'party', id }
      custodian: opts.custodian || null,   // { kind:'bank'|'merchant-guild', label, marketSettlementId }
      balanceGp: _round(opts.balanceGp),
      custodyFeePctAtConsignment: (opts.custodyFeePctAtConsignment != null) ? Number(opts.custodyFeePctAtConsignment) : 0,  // RR p.313 = 0.10 at heir-consignment; 0 for a working account
      depositInterestRateMonthly: (opts.depositInterestRateMonthly != null) ? Number(opts.depositInterestRateMonthly) : 0,  // off by default (no RAW deposit interest)
      status: opts.status || 'open',       // open | closed | forfeited
      marketSettlementId: opts.marketSettlementId || null,
      history: opts.history || []
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Lookups
  // ════════════════════════════════════════════════════════════════════════════
  function findLoan(c, id){ if(id && typeof id === 'object') return id; return _loans(c).find(l => l && l.id === id) || null; }
  function findBankAccount(c, id){ if(id && typeof id === 'object') return id; return _accounts(c).find(a => a && a.id === id) || null; }
  function activeLoans(c){ return _loans(c).filter(l => l && l.status === 'active'); }
  function loansForDebtor(c, debtorId){ return _loans(c).filter(l => l && l.debtor && l.debtor.id === debtorId); }
  function loansForCreditor(c, creditorId){ return _loans(c).filter(l => l && l.creditor && l.creditor.id === creditorId); }
  function bankAccountsForOwner(c, ownerId){ return _accounts(c).filter(a => a && a.owner && a.owner.id === ownerId); }

  // ════════════════════════════════════════════════════════════════════════════
  // Wealth-handle helpers — map a loan/account counterparty to a GP Wave B handle
  // ════════════════════════════════════════════════════════════════════════════

  // A debtor / owner ({ kind:'character'|'domain'|'party', id }) → a movable wealth-handle.
  function _partyHandle(party){
    if(!party || !party.id) return null;
    if(party.kind === 'domain') return { kind:'treasury', id: party.id };
    return { kind:'character-gp', id: party.id };   // character (or party — its leader's purse is out of B1 scope; treat as a character handle)
  }
  // A creditor → a handle. A bank/merchant-guild lends off-campaign capital (an 'external' handle —
  // the principal enters / leaves the campaign at the world boundary); a character/domain creditor
  // moves real gp (a personal/realm loan).
  function _creditorHandle(creditor){
    if(!creditor) return { kind:'external', label:'lender' };
    if(creditor.kind === 'character') return { kind:'character-gp', id: creditor.id };
    if(creditor.kind === 'domain')    return { kind:'treasury', id: creditor.id };
    return { kind:'external', label: creditor.label || (creditor.kind || 'bank') };   // bank | merchant-guild
  }
  // How much gp a handle can currently provide (mirrors events.js _wealthLegAvailable; 'external'
  // is unbounded). Used to compute the affordable interest payment vs the capitalized shortfall.
  function _handleAvailableGp(c, handle){
    const A = _A();
    if(!handle) return 0;
    if(handle.kind === 'external') return Infinity;
    if(handle.kind === 'treasury') return A.domainTreasuryGp ? (Number(A.domainTreasuryGp(c, handle.id)) || 0) : 0;
    if(handle.kind === 'character-gp' || handle.kind === 'character'){
      const ch = _chars(c).find(x => x && x.id === handle.id);
      return ch ? (Number(ch.coins && ch.coins.gp) || 0) : 0;
    }
    if(handle.kind === 'bank-account'){ const a = findBankAccount(c, handle.id); return a ? (Number(a.balanceGp) || 0) : 0; }
    return 0;
  }
  // Move `amount` gp source → destination through the SHIPPED GP Wave B grammar (atomic
  // validate-then-apply; throws on an insufficient gated source). Returns the gp moved.
  function _move(c, amount, source, destination, reason, bucket){
    const A = _A();
    const amt = _round(amount);
    if(amt <= 0) return 0;
    if(typeof A.applyWealthTransfer === 'function'){
      A.applyWealthTransfer(c, { amount: amt, source, destination, allowOverdraft: false, reason: reason, bucket: bucket });
    }
    return amt;
  }
  // relatedEntities for the Event.context envelope (only character/domain counterparties are
  // real entities; a 'bank'/'merchant-guild' creditor is off-campaign — excluded).
  function _loanEntities(loan){
    const e = [];
    if(loan && loan.creditor && loan.creditor.id && (loan.creditor.kind === 'character' || loan.creditor.kind === 'domain'))
      e.push({ kind: loan.creditor.kind, id: loan.creditor.id, role: 'creditor' });
    if(loan && loan.debtor && loan.debtor.id)
      e.push({ kind: loan.debtor.kind || 'character', id: loan.debtor.id, role: 'debtor' });
    return e;
  }
  function _accountEntities(acc){
    const e = [];
    if(acc && acc.owner && acc.owner.id && (acc.owner.kind === 'character' || acc.owner.kind === 'domain' || acc.owner.kind === 'party'))
      e.push({ kind: acc.owner.kind, id: acc.owner.id, role: 'subject' });
    return e;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Capital pool (RR p.42) — credit availability keyed on the shipped market class
  // ════════════════════════════════════════════════════════════════════════════
  function marketCapitalPool(c, settlementId){
    const A = _A();
    const s = _settlements(c).find(x => x && x.id === settlementId);
    if(!s) return 0;
    const cls = A.settlementMarketClass ? A.settlementMarketClass(s) : null;
    return (cls && MARKET_CAPITAL_POOL[cls]) || 0;
  }
  function _capitalUsedThisMonth(c, settlementId){
    const m = (c && c._bankingCapitalUsed) || {};
    return Number(m[settlementId]) || 0;
  }
  function marketCapitalRemaining(c, settlementId){
    return Math.max(0, marketCapitalPool(c, settlementId) - _capitalUsedThisMonth(c, settlementId));
  }
  function _trackCapitalUsed(c, settlementId, amount){
    if(!c._bankingCapitalUsed || typeof c._bankingCapitalUsed !== 'object') c._bankingCapitalUsed = {};
    c._bankingCapitalUsed[settlementId] = _capitalUsedThisMonth(c, settlementId) + _round(amount);
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Setters — loans
  // ════════════════════════════════════════════════════════════════════════════

  // Take a loan: mint a Loan + advance the principal creditor → debtor through the grammar.
  // opts: { kind?, creditor?, debtor:{kind,id}, principalGp, collateral?, marketSettlementId?, interestRateMonthly? }
  function takeLoan(c, opts){
    opts = opts || {};
    if(!c) return { ok:false, reason:'no-campaign' };
    const debtor = opts.debtor;
    if(!debtor || !debtor.id) return { ok:false, reason:'no-debtor' };
    const principalGp = _round(opts.principalGp);
    if(principalGp <= 0) return { ok:false, reason:'bad-principal' };
    const kind = (opts.kind === 'personal') ? 'personal' : (opts.kind === 'feudal' ? 'feudal' : 'commercial');
    const creditor = opts.creditor || { kind:'bank', label:'Bank' };
    const marketSettlementId = opts.marketSettlementId || null;
    // RR p.42 — a commercial loan drawn at a market is capped by that market's monthly capital pool.
    if(kind === 'commercial' && marketSettlementId){
      const remaining = marketCapitalRemaining(c, marketSettlementId);
      if(principalGp > remaining) return { ok:false, reason:'over-capital-pool', remaining, requested: principalGp };
    }
    const collateralized = !!opts.collateral;
    const rate = (opts.interestRateMonthly != null) ? Number(opts.interestRateMonthly)
               : (collateralized ? INTEREST_COLLATERALIZED : INTEREST_UNCOLLATERALIZED);
    const src = _creditorHandle(creditor);
    const dst = _partyHandle(debtor);
    if(!dst) return { ok:false, reason:'bad-debtor' };
    // Advance the principal (atomic; a personal/realm creditor who can't afford it fails here).
    try { _move(c, principalGp, src, dst, 'Loan advance', 'loan-principal'); }
    catch(e){ return { ok:false, reason:'transfer-failed', detail: e.message }; }
    const loan = blankLoan({ kind, creditor, debtor, principalGp, balanceGp: principalGp,
      interestRateMonthly: rate, collateral: opts.collateral || null, marketSettlementId,
      contractedAtTurn: _currentTurn(c), status: 'active' });
    loan.history.push({ turn: _currentTurn(c), type:'issued', reason: principalGp.toLocaleString() + 'gp @ ' + (rate * 100) + '%/mo' + (collateralized ? ' (collateralized)' : '') });
    if(!Array.isArray(c.loans)) c.loans = [];
    c.loans.push(loan);
    if(kind === 'commercial' && marketSettlementId) _trackCapitalUsed(c, marketSettlementId, principalGp);
    _recordBankingEvent(c, 'loan-issued',
      { loanId: loan.id, kind, principalGp, interestRateMonthly: rate, collateralized, creditor, debtor, marketSettlementId },
      { narrative: (debtorName(c, debtor) || 'A debtor') + ' takes a ' + principalGp.toLocaleString() + 'gp loan (' + (rate * 100) + '%/mo' + (collateralized ? ', collateralized' : '') + ')',
        relatedEntities: _loanEntities(loan) });
    return { ok:true, loan };
  }

  // Repay a loan (debtor → creditor). Pays min(amount, balance, the debtor's available gp); a
  // full payoff settles it. amount omitted ⇒ repay the whole balance.
  function repayLoan(c, loanId, opts){
    opts = opts || {};
    const loan = findLoan(c, loanId);
    if(!loan) return { ok:false, reason:'no-loan' };
    if(loan.status !== 'active') return { ok:false, reason:'not-active' };
    const want = (opts.amount != null) ? _round(opts.amount) : (Number(loan.balanceGp) || 0);
    if(want <= 0) return { ok:false, reason:'bad-amount' };
    const src = _partyHandle(loan.debtor);
    const dst = _creditorHandle(loan.creditor);
    if(!src) return { ok:false, reason:'bad-debtor' };
    const avail = _handleAvailableGp(c, src);
    const pay = Math.min(want, Number(loan.balanceGp) || 0, avail === Infinity ? want : Math.max(0, avail));
    if(pay <= 0) return { ok:false, reason:'insufficient-funds', available: (avail === Infinity ? null : avail) };
    try { _move(c, pay, src, dst, 'Loan repayment', 'loan-repayment'); }
    catch(e){ return { ok:false, reason:'transfer-failed', detail: e.message }; }
    loan.balanceGp = Math.max(0, (Number(loan.balanceGp) || 0) - pay);
    if(loan.balanceGp <= 0){ loan.status = 'repaid'; loan.settledAtTurn = _currentTurn(c); loan.disreputable = false; loan.debtOverXp = false; }
    loan.history.push({ turn: _currentTurn(c), type:'repaid', reason: pay.toLocaleString() + 'gp (balance ' + loan.balanceGp.toLocaleString() + ')' });
    _recordBankingEvent(c, 'loan-repaid',
      { loanId: loan.id, amount: pay, balanceGp: loan.balanceGp, settled: loan.status === 'repaid' },
      { narrative: 'Loan repayment: ' + pay.toLocaleString() + 'gp (balance ' + loan.balanceGp.toLocaleString() + ')' + (loan.status === 'repaid' ? ' — settled' : ''),
        relatedEntities: _loanEntities(loan) });
    return { ok:true, loan, paid: pay };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Setters — bank accounts (deposit / custody)
  // ════════════════════════════════════════════════════════════════════════════
  function openBankAccount(c, opts){
    opts = opts || {};
    if(!c) return { ok:false, reason:'no-campaign' };
    const owner = opts.owner;
    if(!owner || !owner.id) return { ok:false, reason:'no-owner' };
    const acc = blankBankAccount({
      owner,
      custodian: opts.custodian || { kind:'bank', label:'Bank', marketSettlementId: opts.marketSettlementId || null },
      marketSettlementId: opts.marketSettlementId || null,
      custodyFeePctAtConsignment: (opts.custodyFeePctAtConsignment != null) ? opts.custodyFeePctAtConsignment : 0,
      depositInterestRateMonthly: opts.depositInterestRateMonthly || 0
    });
    if(!Array.isArray(c.bankAccounts)) c.bankAccounts = [];
    c.bankAccounts.push(acc);
    acc.history.push({ turn: _currentTurn(c), type:'opened', reason:'account opened' });
    const initial = _round(opts.initialDepositGp);
    if(initial > 0){
      const r = depositToBankAccount(c, acc.id, initial, { owner, consignment: !!opts.consignment });
      if(!r.ok){ // roll back the empty account if the funding deposit failed
        c.bankAccounts = c.bankAccounts.filter(x => x !== acc);
        return { ok:false, reason: r.reason, detail: r.detail };
      }
    }
    return { ok:true, account: acc };
  }

  function depositToBankAccount(c, accountId, amount, opts){
    opts = opts || {};
    const acc = findBankAccount(c, accountId);
    if(!acc) return { ok:false, reason:'no-account' };
    const amt = _round(amount);
    if(amt <= 0) return { ok:false, reason:'bad-amount' };
    const owner = opts.owner || acc.owner;
    const src = _partyHandle(owner);
    if(!src) return { ok:false, reason:'no-owner' };
    try { _move(c, amt, src, { kind:'bank-account', id: acc.id }, 'Bank deposit', 'deposit'); }
    catch(e){ return { ok:false, reason:'insufficient-funds', detail: e.message }; }
    // RR p.313 — a one-time custody fee is taken at consignment (opt-in via opts.consignment).
    let feeGp = 0;
    if(opts.consignment && acc.custodyFeePctAtConsignment > 0){
      feeGp = _round(amt * acc.custodyFeePctAtConsignment);
      if(feeGp > 0){ try { _move(c, feeGp, { kind:'bank-account', id: acc.id }, { kind:'external', label:'custody fee' }, 'Custody fee', 'custody-fee'); } catch(e){ feeGp = 0; } }
    }
    acc.history.push({ turn: _currentTurn(c), type:'deposit', reason: amt.toLocaleString() + 'gp' + (feeGp ? (' (−' + feeGp.toLocaleString() + ' custody)') : '') });
    _recordBankingEvent(c, 'bank-deposit',
      { accountId: acc.id, amount: amt, custodyFeeGp: feeGp, balanceGp: acc.balanceGp },
      { narrative: 'Deposit: ' + amt.toLocaleString() + 'gp' + (feeGp ? (' (−' + feeGp.toLocaleString() + 'gp custody fee)') : '') + ' → balance ' + (Number(acc.balanceGp) || 0).toLocaleString(),
        relatedEntities: _accountEntities(acc) });
    return { ok:true, account: acc, deposited: amt, custodyFeeGp: feeGp };
  }

  function withdrawFromBankAccount(c, accountId, amount, opts){
    opts = opts || {};
    const acc = findBankAccount(c, accountId);
    if(!acc) return { ok:false, reason:'no-account' };
    const amt = _round(amount);
    if(amt <= 0) return { ok:false, reason:'bad-amount' };
    if(amt > (Number(acc.balanceGp) || 0)) return { ok:false, reason:'insufficient-balance', balanceGp: Number(acc.balanceGp) || 0 };
    const owner = opts.owner || acc.owner;
    const dst = _partyHandle(owner);
    if(!dst) return { ok:false, reason:'no-owner' };
    try { _move(c, amt, { kind:'bank-account', id: acc.id }, dst, 'Bank withdrawal', 'withdrawal'); }
    catch(e){ return { ok:false, reason:'transfer-failed', detail: e.message }; }
    acc.history.push({ turn: _currentTurn(c), type:'withdrawal', reason: amt.toLocaleString() + 'gp' });
    _recordBankingEvent(c, 'bank-withdrawal',
      { accountId: acc.id, amount: amt, balanceGp: acc.balanceGp },
      { narrative: 'Withdrawal: ' + amt.toLocaleString() + 'gp → balance ' + (Number(acc.balanceGp) || 0).toLocaleString(),
        relatedEntities: _accountEntities(acc) });
    return { ok:true, account: acc, withdrawn: amt };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // The monthly interest-accrual consumer (the §4 engine heart, RR p.42 + p.313)
  // ════════════════════════════════════════════════════════════════════════════
  // Hooked into commitTurn after the F&D pass. Bills interest on each active commercial/personal
  // loan (3% / 1%), capitalizes the unpaid shortfall + flags disrepute, flags debt-over-XP, credits
  // any deposit return, and resets each market's monthly capital pool. RAW-core, default-on,
  // dormant-until-used (no loan/account ⇒ a no-op). dryRun computes the numbers without moving gp
  // or mutating (the proposeMonthlyTurn preview). rng reserved (no dice in B1; symmetry with siblings).
  function processBankingForTurn(c, opts){
    opts = opts || {};
    const dryRun = !!opts.dryRun;
    const out = { ran: true, dryRun, accruals: [], totalInterestGp: 0, logEntries: [] };
    if(!c){ out.ran = false; return out; }
    for(const loan of activeLoans(c)){
      if(!loan || loan.kind === 'feudal') continue;   // feudal = interest-free (RR p.348); the B2 reconcile owns it
      const balance = Number(loan.balanceGp) || 0;
      const rate = Number(loan.interestRateMonthly) || 0;
      if(balance <= 0 || rate <= 0) continue;
      const interest = _round(balance * rate);
      if(interest <= 0) continue;
      const debtorHandle = _partyHandle(loan.debtor);
      const avail = _handleAvailableGp(c, debtorHandle);
      let paid = Math.min(interest, avail === Infinity ? interest : Math.max(0, avail));
      let capitalized = interest - paid;
      const accrual = { loanId: loan.id, interestGp: interest, paidGp: paid, capitalizedGp: capitalized,
        balanceBefore: balance, balanceAfter: balance + capitalized, disreputable: !!loan.disreputable, debtOverXp: !!loan.debtOverXp };
      if(!dryRun){
        // Bill the affordable part debtor → creditor.
        if(paid > 0){ try { _move(c, paid, debtorHandle, _creditorHandle(loan.creditor), 'Loan interest', 'loan-interest'); }
          catch(e){ paid = 0; capitalized = interest; accrual.paidGp = 0; accrual.capitalizedGp = interest; } }
        // Capitalize the shortfall onto the balance (RR p.42 — "if interest payments build up…").
        if(capitalized > 0){
          loan.balanceGp = balance + capitalized;
          loan.missedInterestTurns = (loan.missedInterestTurns || 0) + 1;
          loan.disreputable = true; accrual.disreputable = true;
        }
        accrual.balanceAfter = Number(loan.balanceGp) || balance;
        // RR p.42 — a character debtor whose balance exceeds his XP triggers the bounty-hunter
        // pursuit. B1 sets the flag + records it; the spawned-force trigger is B5 (OQ8 flag-only).
        if(loan.debtor && loan.debtor.kind === 'character'){
          const ch = _chars(c).find(x => x && x.id === loan.debtor.id);
          const xp = ch ? (Number(ch.xp != null ? ch.xp : ch.totalXp) || 0) : 0;
          if((Number(loan.balanceGp) || 0) > xp){ loan.debtOverXp = true; accrual.debtOverXp = true; }
        }
        _recordBankingEvent(c, 'loan-interest',
          { loanId: loan.id, interestGp: interest, paidGp: accrual.paidGp, capitalizedGp: accrual.capitalizedGp,
            balanceGp: loan.balanceGp, disreputable: loan.disreputable, debtOverXp: loan.debtOverXp },
          { narrative: 'Loan interest: ' + interest.toLocaleString() + 'gp (' + accrual.paidGp.toLocaleString() + ' paid'
              + (accrual.capitalizedGp ? (', ' + accrual.capitalizedGp.toLocaleString() + ' capitalized') : '') + ')',
            campaignLogHidden: true, relatedEntities: _loanEntities(loan) });
      }
      out.accruals.push(accrual);
      out.totalInterestGp += interest;
    }
    // Deposit returns (off by default — depositInterestRateMonthly is 0 unless set; no RAW interest).
    for(const acc of _accounts(c)){
      if(!acc || acc.status !== 'open') continue;
      const r = Number(acc.depositInterestRateMonthly) || 0;
      if(r <= 0) continue;
      const ret = _round((Number(acc.balanceGp) || 0) * r);
      if(ret <= 0) continue;
      if(!dryRun){
        acc.balanceGp = (Number(acc.balanceGp) || 0) + ret;
        acc.history.push({ turn: _currentTurn(c), type:'interest', reason: '+' + ret.toLocaleString() + 'gp' });
      }
      out.accruals.push({ accountId: acc.id, depositReturnGp: ret });
    }
    // RR p.42 — the capital pool is per-month; reset each market's monthly usage at the tick.
    if(!dryRun) c._bankingCapitalUsed = {};
    const loanN = out.accruals.filter(a => a.loanId).length;
    if(out.totalInterestGp > 0) out.logEntries.push('Banking: ' + out.totalInterestGp.toLocaleString() + 'gp interest billed on ' + loanN + ' loan' + (loanN === 1 ? '' : 's'));
    return out;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Event emit — record-only (mirror sanctums' _recordArcaneEvent: newEvent + setEventContext +
  // status APPLIED + push the eventLog entry). The banking events are record-only audits (the
  // setters above already moved the gp through the grammar); applyEvent_bankingAudit (events.js)
  // keeps them well-formed on replay (a no-op beyond the recorded narrative).
  // ════════════════════════════════════════════════════════════════════════════
  function _recordBankingEvent(c, kind, payload, opts){
    const A = _A();
    opts = opts || {};
    if(!c || typeof A.newEvent !== 'function') return null;
    const cal = (c.calendar) || {};
    let ev;
    try {
      ev = A.newEvent(kind, {
        submittedBy: 'engine', cadence: opts.cadence || 'monthly-turn', targetTurn: _currentTurn(c),
        gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: (c.currentDayInMonth) || 1 },
        payload: Object.assign({ narrative: opts.narrative }, payload || {})
      });
    } catch(_e){ return null; }
    if(typeof A.setEventContext === 'function'){
      A.setEventContext(ev, { primaryHexId: opts.primaryHexId || null, settlementId: opts.settlementId || null, domainId: opts.domainId || null, relatedEntities: opts.relatedEntities || [] });
    }
    if(opts.campaignLogHidden) ev.campaignLogHidden = true;
    ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
    ev.appliedAtTurn = _currentTurn(c);
    ev.appliedAtDay = (c.currentDayInMonth) || 1;
    if(!Array.isArray(c.eventLog)) c.eventLog = [];
    c.eventLog.push({ event: ev, result: { narrativeSummary: opts.narrative || (kind + ' applied') },
      appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString(),
      ...(opts.campaignLogHidden ? { campaignLogHidden: true } : {}) });
    return ev;
  }

  // A loan/account counterparty's display name (for narratives) — resolved off the campaign.
  function debtorName(c, debtor){
    if(!debtor || !debtor.id) return null;
    if(debtor.kind === 'domain'){ const d = (c.domains || []).find(x => x && x.id === debtor.id); return d ? (d.name || d.id) : debtor.id; }
    const ch = _chars(c).find(x => x && x.id === debtor.id); return ch ? (ch.name || ch.id) : debtor.id;
  }

  // ── Export onto window.ACKS ──
  Object.assign(ACKS, {
    // constants
    INTEREST_UNCOLLATERALIZED, INTEREST_COLLATERALIZED, CUSTODY_FEE_AT_CONSIGNMENT, MARKET_CAPITAL_POOL,
    // factories
    blankLoan, blankBankAccount,
    // lookups
    findLoan, findBankAccount, activeLoans, loansForDebtor, loansForCreditor, bankAccountsForOwner,
    // capital pool
    marketCapitalPool, marketCapitalRemaining,
    // setters — loans
    takeLoan, repayLoan,
    // setters — bank accounts
    openBankAccount, depositToBankAccount, withdrawFromBankAccount,
    // the monthly consumer
    processBankingForTurn
  });

})(typeof window !== 'undefined' ? window : global);
