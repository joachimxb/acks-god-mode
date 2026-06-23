/* =============================================================================
 * domain-app-banking.js — ACKS God Mode app mixin: Banking & Loans UI
 * =============================================================================
 *
 * Banking & Loans UI, extracted from domain-app.js (T5 chip 8, 2026-06-23) — pure code-motion: a
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

  bankingSubView: 'loans',            // 'loans' | 'accounts'
  bankLoanDebtorId: '', bankLoanCreditorId: 'bank', bankLoanAmount: '', bankLoanMarketId: '', bankLoanCollateral: false,
  bankAcctOwnerId: '', bankAcctMarketId: '', bankAcctInitial: '',
  bankingLoans(){ return (this.currentCampaign && this.currentCampaign.loans) || []; },
  bankingAccounts(){ return (this.currentCampaign && this.currentCampaign.bankAccounts) || []; },
  bankingActiveChars(){ return ((this.currentCampaign && this.currentCampaign.characters) || []).filter(c => c && c.alive !== false && c.lifecycleState !== 'deceased' && c.lifecycleState !== 'candidate'); },
  bankingSettlements(){ return (this.currentCampaign && this.currentCampaign.settlements) || []; },
  bankingPartyName(ref){
    if(!ref) return '—';
    if(ref.kind === 'character'){ const ch = ((this.currentCampaign && this.currentCampaign.characters) || []).find(x => x && x.id === ref.id); return ch ? ch.name : (ref.id || '?'); }
    if(ref.kind === 'domain'){ const d = ((this.currentCampaign && this.currentCampaign.domains) || []).find(x => x && x.id === ref.id); return d ? d.name : (ref.id || '?'); }
    return ref.label || ref.kind || '?';
  },
  bankingMarketName(id){ const s = this.bankingSettlements().find(x => x && x.id === id); return s ? s.name : '—'; },
  bankingCapText(){ const id = this.bankLoanMarketId; if(!id || this.bankLoanCreditorId !== 'bank') return ''; return 'Market capital left here: ' + ((window.ACKS.marketCapitalRemaining(this.currentCampaign, id)) || 0).toLocaleString() + 'gp'; },
  bankingPct(n){ return (Math.round((Number(n) || 0) * 1000) / 10) + '%'; },
  bankingTakeLoan(){
    if(!this.bankLoanDebtorId){ this.showToast('Pick a borrower first.'); return; }
    const amt = Math.round(Number(this.bankLoanAmount) || 0);
    if(amt <= 0){ this.showToast('Enter a loan amount.'); return; }
    const isBank = (this.bankLoanCreditorId === 'bank' || !this.bankLoanCreditorId);
    const opts = { debtor:{ kind:'character', id: this.bankLoanDebtorId }, principalGp: amt,
      collateral: this.bankLoanCollateral ? { kind:'note', label:'collateral' } : null };
    if(isBank){ opts.kind = 'commercial'; opts.creditor = { kind:'bank', label:'Bank' }; if(this.bankLoanMarketId) opts.marketSettlementId = this.bankLoanMarketId; }
    else { opts.kind = 'personal'; opts.creditor = { kind:'character', id: this.bankLoanCreditorId }; }
    const r = window.ACKS.takeLoan(this.currentCampaign, opts);
    if(!r.ok){ this.showToast('Loan refused: ' + r.reason + (r.remaining != null ? (' (pool ' + r.remaining.toLocaleString() + 'gp left)') : ''), 4000); return; }
    this.bankLoanAmount = ''; this.bankLoanCollateral = false;
    this.markDirty(); this.schedulePersist();
    this.showToast('Loan issued: ' + amt.toLocaleString() + 'gp.');
  },
  bankingRepay(loanId){
    const loan = this.bankingLoans().find(l => l && l.id === loanId); if(!loan) return;
    const raw = window.prompt('Repay how much? (blank = full balance ' + (loan.balanceGp || 0).toLocaleString() + 'gp)', String(loan.balanceGp || 0));
    if(raw === null) return;
    const opts = {}; const n = Math.round(Number(raw) || 0); if(String(raw).trim() !== '' && n > 0) opts.amount = n;
    const r = window.ACKS.repayLoan(this.currentCampaign, loanId, opts);
    if(!r.ok){ this.showToast('Repayment failed: ' + r.reason, 4000); return; }
    this.markDirty(); this.schedulePersist();
    this.showToast('Repaid ' + (r.paid || 0).toLocaleString() + 'gp' + (loan.status === 'repaid' ? ' — settled.' : '.'));
  },
  bankingOpenAccount(){
    if(!this.bankAcctOwnerId){ this.showToast('Pick an account owner first.'); return; }
    const opts = { owner:{ kind:'character', id: this.bankAcctOwnerId } };
    if(this.bankAcctMarketId){ opts.marketSettlementId = this.bankAcctMarketId; opts.custodian = { kind:'bank', label:'Bank', marketSettlementId: this.bankAcctMarketId }; }
    const init = Math.round(Number(this.bankAcctInitial) || 0); if(init > 0) opts.initialDepositGp = init;
    const intr = Number(this.bankAcctInterest) || 0; if(intr > 0) opts.depositInterestRateMonthly = intr / 100;
    if(this.bankAcctConsign){ opts.custodyFeePctAtConsignment = 0.10; opts.consignment = true; }   // RR p.313 — 10% custody fee on the initial deposit
    const r = window.ACKS.openBankAccount(this.currentCampaign, opts);
    if(!r.ok){ this.showToast('Could not open account: ' + r.reason, 4000); return; }
    this.bankAcctInitial = ''; this.bankAcctInterest = ''; this.bankAcctConsign = false;
    this.markDirty(); this.schedulePersist();
    this.showToast('Bank account opened.');
  },
  // B5 (team burst9) — deposit/withdraw now open the unified bank modal (was prompt()-based in B1);
  // any deep-link caller gets the modal too.
  bankingDeposit(accId){ this.bankOpenModal('deposit', accId); },
  bankingWithdraw(accId){ this.bankOpenModal('withdraw', accId); },
  // === @b8-banking    (team) — Banking B2: state + methods ===
  // F&D feudal-loan reconcile (promote-link) + commercial-loan depth (Phase_4_Banking_Plan.md B3, RR p.42 + p.348).
  bankingReconcileFeudal(){
    const r = window.ACKS.reconcileFeudalLoans(this.currentCampaign, {});
    this.markDirty(); this.schedulePersist();
    if(r.created > 0) this.showToast('🔗 Reconciled ' + r.created + ' feudal loan' + (r.created === 1 ? '' : 's') + ' from Favors & Duties.', 3500);
    else if(r.synced > 0) this.showToast('Synced ' + r.synced + ' feudal loan' + (r.synced === 1 ? '' : 's') + '.', 3000);
    else this.showToast('No new feudal loans to reconcile (demand + give a Loan duty on a vassal first).', 4000);
  },
  bankingLedgerText(){
    const L = window.ACKS.loanLedgerFor(this.currentCampaign, {});
    const parts = [L.activeCount + ' active', (L.totalOutstandingGp || 0).toLocaleString() + 'gp outstanding'];
    if(L.totalMonthlyInterestGp > 0) parts.push((L.totalMonthlyInterestGp).toLocaleString() + 'gp interest/mo');
    if(L.feudalCount > 0) parts.push('🤝 ' + L.feudalCount + ' feudal');
    if(L.disreputableCount > 0) parts.push('⚠ ' + L.disreputableCount + ' disreputable');
    if(L.debtOverXpCount > 0) parts.push('🗡 ' + L.debtOverXpCount + ' debt>XP');
    return parts.join(' · ');
  },
  bankingLoanKindLabel(loan){ if(!loan) return '—'; if(loan.kind === 'feudal') return '🤝 feudal'; if(loan.kind === 'personal') return '👤 personal'; return '🏦 commercial'; },
  bankingLoanStatus(loan){ return window.ACKS.loanStatusLabel(loan); },
  bankingLoanInterest(loan){ const n = window.ACKS.loanInterestDueNextMonth(loan); return n > 0 ? (n.toLocaleString() + ' gp') : '—'; },
  bankingBountyTip(loan){ const b = window.ACKS.loanBountyNote(this.currentCampaign, loan); return b ? b.note : "Balance exceeds the borrower's XP — bounty hunters (RR p.42)"; },
  bankingRestructure(loanId){
    const loan = this.bankingLoans().find(l => l && l.id === loanId); if(!loan) return;
    const has = !!loan.collateral;
    if(!window.confirm(has ? 'Drop the collateral on this loan? The rate returns to 3%/mo (RR p.42).' : 'Post collateral on this loan? The rate drops to 1%/mo (RR p.42).')) return;
    const r = window.ACKS.restructureLoan(this.currentCampaign, loanId, { collateral: has ? null : { kind:'note', label:'collateral' } });
    if(!r.ok){ this.showToast('Restructure failed: ' + r.reason, 3500); return; }
    this.markDirty(); this.schedulePersist();
    this.showToast('Loan restructured → ' + this.bankingPct(r.loan.interestRateMonthly) + '/mo.', 3000);
  },
  bankingDefault(loanId){
    if(!window.confirm('Call this loan in default? It stops accruing interest; the creditor may send bounty hunters (RR p.42).')) return;
    const r = window.ACKS.markLoanDefaulted(this.currentCampaign, loanId, {});
    if(!r.ok){ this.showToast('Could not mark default: ' + r.reason, 3500); return; }
    this.markDirty(); this.schedulePersist();
    this.showToast('Loan called in default' + (r.bountyNote ? ' — bounty hunters at ~' + r.bountyNote.monthlyWagesGp.toLocaleString() + 'gp/mo (RR p.42).' : '.'), 4500);
  },
  bankingWriteOff(loanId){
    if(!window.confirm('Write off this loan? The creditor forgives the remaining balance.')) return;
    const r = window.ACKS.writeOffLoan(this.currentCampaign, loanId, {});
    if(!r.ok){ this.showToast('Could not write off: ' + r.reason, 3500); return; }
    this.markDirty(); this.schedulePersist();
    this.showToast('Loan written off.', 3000);
  },
  // === @b9-banking    (team) — Banking B4/B5 deposits + letters of credit: state + methods ===
  // Open-account extras (deposit interest + the RR p.313 consignment custody fee), a unified Bank
  // modal (deposit / withdraw / issue-letter) replacing the B1 prompt() flows, and the letters-of-
  // credit panel (issue against an account, redeem at a different market, cancel). B1 shipped the
  // BankAccount (bnk-) + deposit/withdraw setters; B5 adds the inter-market letter of credit (loc-).
  bankAcctInterest: '',          // optional monthly deposit-interest % on a new account (0 = none — no RAW deposit interest)
  bankAcctConsign: false,        // open with the RR p.313 10% consignment custody fee on the initial deposit
  bankModal: { open:false, mode:'deposit', accountId:'', amount:'', consignment:false, drawingMarketId:'', feePct:1 },
  bankModalAccount(){ return this.bankingAccounts().find(a => a && a.id === this.bankModal.accountId) || null; },
  bankModalTitle(){ return ({ 'deposit':'💰 Deposit', 'withdraw':'💸 Withdraw', 'issue-loc':'📜 Issue letter of credit' })[this.bankModal.mode] || 'Bank'; },
  bankOpenModal(mode, accountId){
    const acc = this.bankingAccounts().find(a => a && a.id === accountId) || null;
    let drawDefault = '';
    if(mode === 'issue-loc'){ const others = this.bankingSettlements().filter(s => s && s.id !== (acc && acc.marketSettlementId)); if(others.length) drawDefault = others[0].id; }
    this.bankModal = { open:true, mode, accountId, amount:'', consignment:false, drawingMarketId: drawDefault, feePct: 1 };
  },
  bankModalClose(){ this.bankModal.open = false; },
  bankModalCanSubmit(){
    const m = this.bankModal; const amt = Math.round(Number(m.amount) || 0);
    if(amt <= 0) return false;
    if(m.mode === 'issue-loc' && !m.drawingMarketId) return false;
    return true;
  },
  bankModalSubmit(){
    const m = this.bankModal; const amt = Math.round(Number(m.amount) || 0);
    if(amt <= 0){ this.showToast('Enter an amount.'); return; }
    const A = window.ACKS; let r;
    if(m.mode === 'deposit'){ r = A.depositToBankAccount(this.currentCampaign, m.accountId, amt, { consignment: !!m.consignment }); }
    else if(m.mode === 'withdraw'){ r = A.withdrawFromBankAccount(this.currentCampaign, m.accountId, amt, {}); }
    else if(m.mode === 'issue-loc'){
      if(!m.drawingMarketId){ this.showToast('Pick a destination market.'); return; }
      r = A.issueLetterOfCredit(this.currentCampaign, { accountId: m.accountId, faceValueGp: amt, drawingMarketSettlementId: m.drawingMarketId, feePct: (Number(m.feePct) || 0) / 100 });
    }
    if(!r || !r.ok){ this.showToast(this.bankModalTitle() + ' failed: ' + ((r && r.reason) || '?') + ((r && r.balanceGp != null) ? (' (balance ' + r.balanceGp.toLocaleString() + 'gp)') : ((r && r.needed != null) ? (' (need ' + r.needed.toLocaleString() + 'gp)') : '')), 4500); return; }
    this.markDirty(); this.schedulePersist(); this.bankModalClose();
    if(m.mode === 'deposit') this.showToast('Deposited ' + amt.toLocaleString() + 'gp' + (r.custodyFeeGp ? (' (−' + r.custodyFeeGp.toLocaleString() + 'gp custody fee)') : '') + '.');
    else if(m.mode === 'withdraw') this.showToast('Withdrew ' + amt.toLocaleString() + 'gp.');
    else this.showToast('📜 Letter of credit issued: ' + amt.toLocaleString() + 'gp.');
  },
  // Letters of credit (B5)
  bankingLetters(){ return (this.currentCampaign && this.currentCampaign.lettersOfCredit) || []; },
  bankingLetterStatus(loc){ return window.ACKS.letterStatusLabel(loc); },
  bankLettersLedgerText(){ const L = window.ACKS.letterLedgerFor(this.currentCampaign, {}); const parts = [L.outstandingCount + ' outstanding']; if(L.totalOutstandingGp > 0) parts.push(L.totalOutstandingGp.toLocaleString() + 'gp in transit'); if(L.redeemedCount > 0) parts.push(L.redeemedCount + ' redeemed'); return parts.join(' · '); },
  bankRedeemLetter(letterId){
    const loc = this.bankingLetters().find(l => l && l.id === letterId); if(!loc) return;
    const A = window.ACKS;
    let r = A.redeemLetterOfCredit(this.currentCampaign, letterId, {});
    if(!r.ok && r.reason === 'over-capital-pool'){
      if(!window.confirm('The destination market can only honor ' + (r.remaining || 0).toLocaleString() + 'gp this month (its capital pool, RR p.42), but this letter is for ' + (loc.faceValueGp || 0).toLocaleString() + 'gp. Honor it anyway (the GM overrides the pool)?')) return;
      r = A.redeemLetterOfCredit(this.currentCampaign, letterId, { force: true });
    }
    if(!r.ok){ this.showToast('Redeem failed: ' + r.reason, 4000); return; }
    this.markDirty(); this.schedulePersist();
    this.showToast('📜 Letter redeemed: ' + (r.paid || 0).toLocaleString() + 'gp drawn at ' + (this.bankingMarketName(loc.drawingMarketSettlementId) || 'the market') + '.');
  },
  bankCancelLetter(letterId){
    if(!window.confirm('Cancel this letter? The face value is refunded to the source account; the issue fee is forfeit.')) return;
    const r = window.ACKS.cancelLetterOfCredit(this.currentCampaign, letterId, {});
    if(!r.ok){ this.showToast('Cancel failed: ' + r.reason, 4000); return; }
    this.markDirty(); this.schedulePersist();
    this.showToast('Letter cancelled — face value refunded.');
  },
  });
})();
