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
    const out = { ran: true, dryRun, accruals: [], totalInterestGp: 0, logEntries: [], feudalReconciled: 0, feudalSynced: 0 };
    if(!c){ out.ran = false; return out; }
    // B2 — materialize/sync the shipped F&D feudal loan onto the shared Loan FIRST (idempotent;
    // moves no gp — the principal already moved in giveLoanObligation). The accrual loop below then
    // skips feudal loans (interest-free, RR p.348). Skipped in a dry-run preview (no mutation).
    if(!dryRun){ const rec = reconcileFeudalLoans(c, { rng: opts.rng }); out.feudalReconciled = rec.created; out.feudalSynced = rec.synced; if(rec.created > 0) out.logEntries.push('Banking: ' + rec.created + ' feudal loan' + (rec.created === 1 ? '' : 's') + ' reconciled from Favors & Duties'); }
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

  // ════════════════════════════════════════════════════════════════════════════
  // B2 — the F&D feudal-loan reconcile (promote-and-link; Phase_4_Banking_Plan.md B3, Option A)
  // ════════════════════════════════════════════════════════════════════════════
  // RR p.348 — the shipped Favors & Duties Loan duty (F&D-4): a lord *demands* a loan; the vassal
  // *gives* it (giveLoanObligation moves the principal vassal → lord), and it is repaid (lord →
  // vassal) on revoke or the monthly CHA% check. That whole lifecycle stays in the F&D consumer.
  // B2 PROMOTES each given F&D loan onto the shared Loan relation as a `kind:'feudal'` Loan that
  // POINTS BACK via fdObligationId, so the 🏦 Banking view shows feudal credit alongside commercial.
  //
  // Counterparties (RR p.348 — the vassal advanced the principal, the lord owes it back):
  //   creditor = the vassal's realm (it is owed) · debtor = the liege's realm (it owes).
  //   interestRateMonthly = 0 (feudal is interest-free) → processBankingForTurn's accrual loop skips it.
  //
  // ADDITIVE + DECOUPLED — this does NOT touch acks-engine.js / the F&D obligation code at all
  // (no give-hook, no migrateCampaign hook). It runs from processBankingForTurn (monthly, !dryRun)
  // + the 🏦 Banking-tab "🔗 Reconcile" button. So giveLoanObligation stays byte-for-byte pristine
  // (its eventLog stays exactly the one favor-duty event — the F&D smoke is untouched). The reconcile
  // moves ZERO gp (the principal already moved in giveLoanObligation) — it only materializes the record.

  // Resolve (vassalDomain, liegeDomain) for a loan obligation from its active vassalage — replicates
  // the F&D private _favorDutyDomainsFor (kept decoupled: no dependency on an F&D private export).
  function _feudalDomainsFor(c, obl){
    const domains = (c && c.domains) || [];
    const vassalDomain = domains.find(d => d && d.id === obl.vassalDomainId) || null;
    const v = ((c && c.vassalages) || []).find(x => x && x.status === 'active'
      && x.vassalDomainId === obl.vassalDomainId && x.suzerainCharacterId === obl.liegeCharacterId);
    const liegeDomain = v ? (domains.find(d => d && d.id === v.suzerainDomainId) || null) : null;
    return { vassalDomain, liegeDomain };
  }
  // The materialized feudal Loan linked to a given F&D obligation (the idempotency key).
  function feudalLoanForObligation(c, obligationId){
    if(!obligationId) return null;
    return _loans(c).find(l => l && l.kind === 'feudal' && l.fdObligationId === obligationId) || null;
  }

  // Reconcile ONE F&D loan obligation: mint its linked feudal Loan (if given + active + not yet
  // materialized), or sync an existing one (active → repaid when the obligation has been closed).
  // Idempotent. Returns { loan, created, synced } or null (not a given loan obligation).
  function reconcileFeudalLoan(c, obligation, opts){
    opts = opts || {};
    if(!c || !obligation || obligation.kind !== 'loan') return null;
    if(obligation.loanGivenAtTurn == null) return null;       // not yet given — nothing to materialize
    let loan = feudalLoanForObligation(c, obligation.id);
    const active = obligation.status === 'active';
    if(!loan){
      if(!active) return null;                                // given-then-closed before any sweep saw it active — no ghost row
      const { vassalDomain, liegeDomain } = _feudalDomainsFor(c, obligation);
      const principal = _round(obligation.gpPerMonth);        // the F&D loan principal (gpPerMonth is its legacy field name)
      const creditor = vassalDomain ? { kind:'domain', id: vassalDomain.id }
        : (obligation.vassalDomainId ? { kind:'domain', id: obligation.vassalDomainId } : null);   // vassal = owed
      const debtor = liegeDomain ? { kind:'domain', id: liegeDomain.id }
        : (obligation.liegeCharacterId ? { kind:'character', id: obligation.liegeCharacterId } : null);  // lord = owes
      loan = blankLoan({ kind:'feudal', creditor, debtor, principalGp: principal, balanceGp: principal,
        interestRateMonthly: 0, status:'active', fdObligationId: obligation.id,
        contractedAtTurn: obligation.loanGivenAtTurn || obligation.grantedAtTurn || _currentTurn(c) });
      loan.history.push({ turn: _currentTurn(c), type:'reconciled',
        reason: 'feudal loan reconciled from F&D obligation ' + obligation.id + ' (' + principal.toLocaleString() + 'gp, interest-free, RR p.348)' });
      if(!Array.isArray(c.loans)) c.loans = [];
      c.loans.push(loan);
      _recordBankingEvent(c, 'loan-reconciled',
        { loanId: loan.id, fdObligationId: obligation.id, kind:'feudal', principalGp: principal, creditor, debtor },
        { narrative: 'Feudal loan reconciled onto Banking: ' + principal.toLocaleString() + 'gp from ' + (debtorName(c, creditor) || 'the vassal') + ' to its liege (interest-free, RR p.348)',
          campaignLogHidden: true, relatedEntities: _loanEntities(loan) });
      return { loan, created: true, synced: false };
    }
    // sync an existing linked loan to the obligation's lifecycle (no event; history audit only)
    let synced = false;
    if(loan.status === 'active' && !active){
      // the F&D obligation was revoked / one-time-spent → the principal was returned (lord → vassal); settle.
      loan.balanceGp = 0; loan.status = 'repaid'; loan.settledAtTurn = _currentTurn(c);
      loan.disreputable = false; loan.debtOverXp = false;
      loan.history.push({ turn: _currentTurn(c), type:'repaid', reason: 'F&D obligation closed (' + obligation.status + ') — principal returned (RR p.348)' });
      synced = true;
    }
    return { loan, created: false, synced };
  }

  // Bulk-reconcile every given F&D feudal loan (idempotent). Called from processBankingForTurn
  // (monthly) + the Banking-tab "🔗 Reconcile feudal loans" button. Returns { created, synced, loans }.
  function reconcileFeudalLoans(c, opts){
    opts = opts || {};
    const out = { created: 0, synced: 0, loans: [] };
    if(!c || !Array.isArray(c.favorDutyObligations)) return out;
    for(const obl of c.favorDutyObligations){
      if(!obl || obl.kind !== 'loan' || obl.loanGivenAtTurn == null) continue;
      const r = reconcileFeudalLoan(c, obl, opts);
      if(!r) continue;
      if(r.created) out.created++;
      if(r.synced) out.synced++;
      if(r.loan) out.loans.push(r.loan);
    }
    return out;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // B2 — commercial-loan depth (the lifecycle + the GM/portfolio reads, RR p.42)
  // ════════════════════════════════════════════════════════════════════════════
  // B1 issues / repays / accrues / capitalizes / flags disrepute + debt-over-XP. B2 completes the
  // lifecycle (offered → active → repaid | defaulted | written-off all reachable) + the derived reads
  // the panel renders. History-only audits (no new event kinds beyond loan-reconciled; loan-defaulted
  // / loan-written-off are deferred event kinds — see the SUMMARY). Feudal loans are F&D-owned + skip
  // these (interest-free; their lifecycle is reconcileFeudalLoan above).

  // Renegotiate an active commercial/personal loan: post collateral → 1%, drop collateral → 3% (RR
  // p.42), or set an explicit rate. opts: { collateral?, interestRateMonthly? }. History-only.
  function restructureLoan(c, loanId, opts){
    opts = opts || {};
    const loan = findLoan(c, loanId);
    if(!loan) return { ok:false, reason:'no-loan' };
    if(loan.status !== 'active') return { ok:false, reason:'not-active' };
    if(loan.kind === 'feudal') return { ok:false, reason:'feudal-loan' };   // interest-free, F&D-owned
    const beforeRate = Number(loan.interestRateMonthly) || 0;
    if('collateral' in opts){
      loan.collateral = opts.collateral || null;
      if(opts.interestRateMonthly == null) loan.interestRateMonthly = loan.collateral ? INTEREST_COLLATERALIZED : INTEREST_UNCOLLATERALIZED;
    }
    if(opts.interestRateMonthly != null) loan.interestRateMonthly = Number(opts.interestRateMonthly);
    loan.history.push({ turn: _currentTurn(c), type:'restructured',
      reason: 'rate ' + (beforeRate*100) + '% → ' + ((Number(loan.interestRateMonthly)||0)*100) + '%' + (loan.collateral ? ' (collateralized, RR p.42)' : ' (uncollateralized)') });
    return { ok:true, loan };
  }

  // The creditor writes off a bad/defaulted loan (status → 'written-off'; it stops accruing — the
  // accrual loop only touches 'active' loans). History-only. opts: { reason? }.
  function writeOffLoan(c, loanId, opts){
    opts = opts || {};
    const loan = findLoan(c, loanId);
    if(!loan) return { ok:false, reason:'no-loan' };
    if(loan.status === 'repaid' || loan.status === 'written-off') return { ok:false, reason:'already-settled' };
    if(loan.kind === 'feudal') return { ok:false, reason:'feudal-loan' };
    const forgiven = Number(loan.balanceGp) || 0;
    loan.status = 'written-off'; loan.settledAtTurn = _currentTurn(c);
    loan.history.push({ turn: _currentTurn(c), type:'written-off',
      reason: (opts.reason || 'creditor wrote off the debt') + ' (balance ' + forgiven.toLocaleString() + 'gp forgiven)' });
    _recordBankingEvent(c, 'loan-written-off',
      { loanId: loan.id, forgivenGp: forgiven, reason: opts.reason || null },
      { narrative: 'Loan written off: ' + forgiven.toLocaleString() + 'gp forgiven', relatedEntities: _loanEntities(loan) });
    return { ok:true, loan };
  }

  // Call an active commercial loan in default (status → 'defaulted'; stops accruing). Surfaces the
  // RR p.42 bounty-hunter enforcement (the spawned force is the deferred Encounter/Military seam,
  // OQ8 flag-only). History-only. Returns the loan + the bounty note.
  function markLoanDefaulted(c, loanId, opts){
    opts = opts || {};
    const loan = findLoan(c, loanId);
    if(!loan) return { ok:false, reason:'no-loan' };
    if(loan.status !== 'active') return { ok:false, reason:'not-active' };
    if(loan.kind === 'feudal') return { ok:false, reason:'feudal-loan' };
    loan.status = 'defaulted'; loan.disreputable = true; loan.settledAtTurn = _currentTurn(c);
    loan.history.push({ turn: _currentTurn(c), type:'defaulted', reason: opts.reason || 'loan called in default (RR p.42)' });
    const bountyNote = loanBountyNote(c, loan);   // B5 OQ8 — flag + note only; the spawned bounty-hunter force is the deferred Encounter/Military seam
    _recordBankingEvent(c, 'loan-defaulted',
      { loanId: loan.id, balanceGp: Number(loan.balanceGp) || 0, debtOverXp: !!loan.debtOverXp, bountyTriggered: !!bountyNote },
      { narrative: 'Loan called in default: ' + (Number(loan.balanceGp) || 0).toLocaleString() + 'gp outstanding'
          + (bountyNote ? (' — bounty hunters at ~' + bountyNote.monthlyWagesGp.toLocaleString() + 'gp/mo (RR p.42)') : ''),
        relatedEntities: _loanEntities(loan) });
    return { ok:true, loan, bountyNote };
  }

  // ── Derived reads (pure; drive the panel + integrators) ──
  function loanStatusLabel(loan){
    if(!loan) return '—';
    if(loan.status === 'repaid') return 'repaid';
    if(loan.status === 'written-off') return 'written off';
    if(loan.status === 'defaulted') return 'defaulted';
    if(loan.status === 'offered') return 'offered';
    if(loan.kind === 'feudal') return 'active (feudal)';
    if(loan.debtOverXp) return 'active — default risk';
    if(loan.disreputable) return 'active — disreputable';
    return 'active';
  }
  function loanInterestDueNextMonth(loan){
    if(!loan || loan.status !== 'active' || loan.kind === 'feudal') return 0;
    return _round((Number(loan.balanceGp)||0) * (Number(loan.interestRateMonthly)||0));
  }
  // RR p.42 — when a debtor's balance exceeds his XP the creditor may send bounty hunters (a force at
  // wages-by-level ≈ the monthly interest). v1 surfaces the trigger; the spawned force is the deferred
  // Encounter/Military seam (OQ8). null when the loan isn't over-XP.
  function loanBountyNote(c, loan){
    if(!loan || !loan.debtOverXp) return null;
    const monthly = loanInterestDueNextMonth(loan) || _round((Number(loan.balanceGp)||0) * (Number(loan.interestRateMonthly)||0));
    return { balanceGp: Number(loan.balanceGp)||0, monthlyWagesGp: monthly,
      note: "Balance exceeds the borrower's XP — the creditor may send bounty hunters at wages ≈ " + monthly.toLocaleString() + 'gp/mo (RR p.42).' };
  }
  // A portfolio summary over the loans (optionally scoped to one debtor / creditor). Pure.
  function loanLedgerFor(c, opts){
    opts = opts || {};
    let loans = _loans(c);
    if(opts.debtorId)   loans = loans.filter(l => l && l.debtor   && l.debtor.id   === opts.debtorId);
    if(opts.creditorId) loans = loans.filter(l => l && l.creditor && l.creditor.id === opts.creditorId);
    const active = loans.filter(l => l && l.status === 'active');
    return {
      count: loans.length,
      activeCount: active.length,
      totalOutstandingGp: active.reduce((s,l) => s + (Number(l.balanceGp)||0), 0),
      totalMonthlyInterestGp: active.reduce((s,l) => s + loanInterestDueNextMonth(l), 0),
      disreputableCount: active.filter(l => l.disreputable).length,
      debtOverXpCount: active.filter(l => l.debtOverXp).length,
      feudalCount: loans.filter(l => l.kind === 'feudal').length
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // B4/B5 (burst9 b9-banking 2026-06-20) — letters of credit (loc-)
  // ════════════════════════════════════════════════════════════════════════════
  // B1 shipped the BankAccount (bnk-) deposit/custody relation + deposit/withdraw + the bank-account
  // wealth-handle; this slice adds the inter-market draw primitive (RR p.42 Access to Capital; the
  // merchant bill-of-exchange — a reasoned tooling extension grounded in RR pp.375–376 + history,
  // flagged not-RAW-verbatim). The GOLD NEVER TRAVELS — that is the whole point of a letter of credit:
  // issuing DEBITS the source account → the banking network (an 'external' handle, the abstraction
  // boundary the GP grammar already supports); redeeming CREDITS the bearer FROM the network at the
  // drawing market, gated by that market's RR p.42 capital pool (the drawing bank advances the cash).
  // Net gp-neutral (face leaves at A, face arrives at B) minus the one-time issue fee.
  // Additive + DECOUPLED: NO migrateCampaign hook — campaign.lettersOfCredit[] is read defensively
  // (?? []) + seeded on first write (the B1 banking precedent); blankCampaign seeds it for new campaigns.

  const LOC_ISSUE_FEE_PCT = 0.01;   // 1% bill-of-exchange fee at issue — a reasoned tooling number (no RAW fee); overridable per-issue, 0 allowed.

  function _letters(c){ return (c && Array.isArray(c.lettersOfCredit)) ? c.lettersOfCredit : []; }
  function settlementName(c, id){ if(!id) return null; const s = _settlements(c).find(x => x && x.id === id); return s ? (s.name || s.id) : id; }

  function blankLetterOfCredit(opts){
    opts = opts || {};
    const face = _round(opts.faceValueGp);
    return {
      schemaVersion: SCHEMA_VERSION,
      id: opts.id || newId(ID_PREFIXES.letterOfCredit),       // 'loc-…'
      sourceAccountId: opts.sourceAccountId || null,          // the bnk- account it's drawn against
      issuer: opts.issuer || null,   // { kind:'character'|'domain'|'party', id } — who drew it (the account owner)
      bearer: opts.bearer || null,   // { kind:'character'|'domain'|'party', id } — who may redeem it (default = issuer)
      faceValueGp: face,                                      // the amount drawable at the destination
      issueFeeGp: _round(opts.issueFeeGp),                    // the fee taken at issue (face × feePct)
      issuingMarketSettlementId: opts.issuingMarketSettlementId || null,   // where it was drawn (the account's market)
      drawingMarketSettlementId: opts.drawingMarketSettlementId || null,   // where it's redeemable (a different market)
      status: opts.status || 'outstanding',  // outstanding | redeemed | cancelled
      issuedAtTurn: opts.issuedAtTurn || 1,
      settledAtTurn: (opts.settledAtTurn != null) ? opts.settledAtTurn : null,
      history: opts.history || []
    };
  }
  function findLetterOfCredit(c, id){ if(id && typeof id === 'object') return id; return _letters(c).find(l => l && l.id === id) || null; }
  function outstandingLettersOfCredit(c){ return _letters(c).filter(l => l && l.status === 'outstanding'); }
  function lettersForBearer(c, bearerId){ return _letters(c).filter(l => l && l.bearer && l.bearer.id === bearerId); }
  function _letterEntities(loc){
    const e = [];
    if(loc && loc.issuer && loc.issuer.id && (loc.issuer.kind === 'character' || loc.issuer.kind === 'domain')) e.push({ kind: loc.issuer.kind, id: loc.issuer.id, role: 'subject' });
    if(loc && loc.bearer && loc.bearer.id && (loc.bearer.kind === 'character' || loc.bearer.kind === 'domain') && (!loc.issuer || loc.bearer.id !== loc.issuer.id)) e.push({ kind: loc.bearer.kind, id: loc.bearer.id, role: 'recipient' });
    return e;
  }

  // Issue a letter of credit against a bank account at the issuing (account's) market, drawable at a
  // DIFFERENT market. Debits face + fee from the account → the banking network. The bearer defaults
  // to the account owner. opts: { accountId, faceValueGp, drawingMarketSettlementId, bearer?, feePct? }.
  function issueLetterOfCredit(c, opts){
    opts = opts || {};
    if(!c) return { ok:false, reason:'no-campaign' };
    const acc = findBankAccount(c, opts.accountId);
    if(!acc) return { ok:false, reason:'no-account' };
    if(acc.status !== 'open') return { ok:false, reason:'account-not-open' };
    const face = _round(opts.faceValueGp);
    if(face <= 0) return { ok:false, reason:'bad-amount' };
    const feePct = (opts.feePct != null) ? Math.max(0, Number(opts.feePct)) : LOC_ISSUE_FEE_PCT;
    const fee = _round(face * feePct);
    if(face + fee > (Number(acc.balanceGp) || 0)) return { ok:false, reason:'insufficient-balance', balanceGp: Number(acc.balanceGp) || 0, needed: face + fee };
    const drawingMarket = opts.drawingMarketSettlementId || null;
    const bearer = opts.bearer || acc.owner;
    // Debit face + fee from the account → the banking network ('external').
    try { _move(c, face + fee, { kind:'bank-account', id: acc.id }, { kind:'external', label:'letter of credit' }, 'Letter of credit issued', 'letter-of-credit'); }
    catch(e){ return { ok:false, reason:'transfer-failed', detail: e.message }; }
    const loc = blankLetterOfCredit({ sourceAccountId: acc.id, issuer: acc.owner, bearer, faceValueGp: face,
      issueFeeGp: fee, issuingMarketSettlementId: acc.marketSettlementId || null, drawingMarketSettlementId: drawingMarket,
      issuedAtTurn: _currentTurn(c), status:'outstanding' });
    loc.history.push({ turn: _currentTurn(c), type:'issued', reason: face.toLocaleString() + 'gp' + (fee ? (' (−' + fee.toLocaleString() + 'gp fee)') : '') + ' drawable at ' + (settlementName(c, drawingMarket) || 'another market') });
    if(!Array.isArray(c.lettersOfCredit)) c.lettersOfCredit = [];
    c.lettersOfCredit.push(loc);
    acc.history.push({ turn: _currentTurn(c), type:'letter-of-credit', reason: 'issued ' + face.toLocaleString() + 'gp letter (−' + (face + fee).toLocaleString() + 'gp)' });
    _recordBankingEvent(c, 'letter-of-credit-issued',
      { letterId: loc.id, accountId: acc.id, faceValueGp: face, issueFeeGp: fee, issuingMarketSettlementId: loc.issuingMarketSettlementId, drawingMarketSettlementId: drawingMarket },
      { narrative: 'Letter of credit issued: ' + face.toLocaleString() + 'gp drawable at ' + (settlementName(c, drawingMarket) || 'another market') + (fee ? (' (−' + fee.toLocaleString() + 'gp fee)') : ''),
        settlementId: loc.issuingMarketSettlementId, relatedEntities: _letterEntities(loc) });
    return { ok:true, letter: loc };
  }

  // Redeem an outstanding letter at its drawing market: credit the bearer the face value from the
  // banking network, gated by the drawing market's RR p.42 capital pool. opts: { atMarketSettlementId?, bearer?, force? }.
  function redeemLetterOfCredit(c, letterId, opts){
    opts = opts || {};
    const loc = findLetterOfCredit(c, letterId);
    if(!loc) return { ok:false, reason:'no-letter' };
    if(loc.status !== 'outstanding') return { ok:false, reason:'not-outstanding' };
    const atMarket = opts.atMarketSettlementId || loc.drawingMarketSettlementId || null;
    // RR p.42 — the drawing bank advances the cash from its monthly capital pool (reuses the shipped
    // per-market pool the loan engine tracks). force:true lets the GM honor it regardless.
    if(loc.drawingMarketSettlementId && atMarket && !opts.force){
      const remaining = marketCapitalRemaining(c, atMarket);
      if(loc.faceValueGp > remaining) return { ok:false, reason:'over-capital-pool', remaining, requested: loc.faceValueGp };
    }
    const bearer = opts.bearer || loc.bearer;
    const dst = _partyHandle(bearer);
    if(!dst) return { ok:false, reason:'no-bearer' };
    try { _move(c, loc.faceValueGp, { kind:'external', label:'letter of credit' }, dst, 'Letter of credit redeemed', 'letter-of-credit'); }
    catch(e){ return { ok:false, reason:'transfer-failed', detail: e.message }; }
    if(atMarket) _trackCapitalUsed(c, atMarket, loc.faceValueGp);
    loc.status = 'redeemed'; loc.settledAtTurn = _currentTurn(c);
    loc.history.push({ turn: _currentTurn(c), type:'redeemed', reason: loc.faceValueGp.toLocaleString() + 'gp drawn at ' + (settlementName(c, atMarket) || 'the drawing market') });
    _recordBankingEvent(c, 'letter-of-credit-redeemed',
      { letterId: loc.id, faceValueGp: loc.faceValueGp, atMarketSettlementId: atMarket, bearer },
      { narrative: 'Letter of credit redeemed: ' + loc.faceValueGp.toLocaleString() + 'gp drawn at ' + (settlementName(c, atMarket) || 'the drawing market'),
        settlementId: atMarket, relatedEntities: _letterEntities(loc) });
    return { ok:true, letter: loc, paid: loc.faceValueGp };
  }

  // Cancel an outstanding letter before it is drawn — refund the face value to the source account
  // (the issue fee is forfeit). opts: { reason? }.
  function cancelLetterOfCredit(c, letterId, opts){
    opts = opts || {};
    const loc = findLetterOfCredit(c, letterId);
    if(!loc) return { ok:false, reason:'no-letter' };
    if(loc.status !== 'outstanding') return { ok:false, reason:'not-outstanding' };
    const acc = findBankAccount(c, loc.sourceAccountId);
    if(acc && acc.status === 'open'){
      try { _move(c, loc.faceValueGp, { kind:'external', label:'letter of credit' }, { kind:'bank-account', id: acc.id }, 'Letter of credit cancelled', 'letter-of-credit'); }
      catch(e){ /* refund best-effort */ }
      acc.history.push({ turn: _currentTurn(c), type:'letter-of-credit', reason: 'cancelled — ' + loc.faceValueGp.toLocaleString() + 'gp refunded (fee forfeit)' });
    }
    loc.status = 'cancelled'; loc.settledAtTurn = _currentTurn(c);
    loc.history.push({ turn: _currentTurn(c), type:'cancelled', reason: (opts.reason || 'cancelled') + ' — ' + loc.faceValueGp.toLocaleString() + 'gp refunded (fee forfeit)' });
    return { ok:true, letter: loc };
  }

  // ── Derived reads (pure; drive the panel) ──
  function letterStatusLabel(loc){ if(!loc) return '—'; if(loc.status === 'redeemed') return 'redeemed'; if(loc.status === 'cancelled') return 'cancelled'; return 'outstanding'; }
  function letterLedgerFor(c, opts){
    opts = opts || {};
    let letters = _letters(c);
    if(opts.bearerId) letters = letters.filter(l => l && l.bearer && l.bearer.id === opts.bearerId);
    const out = letters.filter(l => l && l.status === 'outstanding');
    return { count: letters.length, outstandingCount: out.length,
      totalOutstandingGp: out.reduce((s,l) => s + (Number(l.faceValueGp) || 0), 0),
      redeemedCount: letters.filter(l => l.status === 'redeemed').length };
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
    processBankingForTurn,
    // B2 — F&D feudal-loan reconcile (promote-link)
    reconcileFeudalLoans, reconcileFeudalLoan, feudalLoanForObligation,
    // B2 — commercial-loan depth (lifecycle + derived reads)
    restructureLoan, writeOffLoan, markLoanDefaulted,
    loanStatusLabel, loanInterestDueNextMonth, loanBountyNote, loanLedgerFor,
    // B4/B5 (burst9) — letters of credit (loc-)
    LOC_ISSUE_FEE_PCT, blankLetterOfCredit,
    findLetterOfCredit, outstandingLettersOfCredit, lettersForBearer,
    issueLetterOfCredit, redeemLetterOfCredit, cancelLetterOfCredit,
    letterStatusLabel, letterLedgerFor
  });

})(typeof window !== 'undefined' ? window : global);
