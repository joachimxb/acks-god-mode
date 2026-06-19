// =============================================================================
// banking.smoke.js — Banking & Loans B1 (#148, RR p.42 Access to Capital + RR p.313 custody).
// The shared Loan relation (lon-) + the BankAccount relation/wealth-handle (bnk-), the per-market
// capital pool (keyed on the shipped market class), takeLoan/repayLoan + deposit/withdraw through
// the GP Wave B grammar, and the monthly interest-accrual consumer (processBankingForTurn): 3%/1%
// interest, shortfall capitalization + disrepute, debt-over-XP, capital-pool reset.
// =============================================================================
const path = require('path');
global.window = global;
require('./_engine.js').load();
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('\n--- ' + t + ' ---'); }

// ── A minimal campaign: a debtor + a creditor (both with purses), a domain treasury, a market
//    settlement. settlementMarketClass reads s.families → 1000 = Class IV (capital pool 5,000gp). ──
function mkCampaign(opts){
  opts = opts || {};
  const debtor = Object.assign(ACKS.blankCharacter({ id:'chr-d', name:'Debtor' }),
    { coins:{ pp:0, gp: opts.debtorGp != null ? opts.debtorGp : 2000, ep:0, sp:0, cp:0 }, xp: opts.debtorXp != null ? opts.debtorXp : 5000 });
  const creditor = Object.assign(ACKS.blankCharacter({ id:'chr-c', name:'Creditor' }),
    { coins:{ pp:0, gp: opts.creditorGp != null ? opts.creditorGp : 10000, ep:0, sp:0, cp:0 } });
  const dom = ACKS.blankDomain({ id:'dom-1', name:'Realm' }); dom.treasury = { gp: opts.domGp != null ? opts.domGp : 20000 };
  const town = { id:'set-1', name:'Town', families: opts.families != null ? opts.families : 1000 };
  return { schemaVersion:2, kind:'campaign', id:'cmp-bank', name:'Bank', createdAt:'2026-01-01', lastModifiedAt:'2026-01-01',
    currentTurn: opts.turn || 1, currentDayInMonth: 1, houseRules: opts.houseRules || {},
    characters:[debtor, creditor], domains:[dom], settlements:[town],
    loans:[], bankAccounts:[], eventLog:[], parties:[], rumors:[], hexes:[] };
}
const charGp = (c, id) => (c.characters.find(x => x && x.id === id) || { coins:{} }).coins.gp;
const eventKinds = (c) => c.eventLog.map(e => e.event.kind);

// =============================================================================
section('Data layer — factories / prefixes / registry / field schemas');
// =============================================================================
const loan = ACKS.blankLoan({ principalGp: 1000 });
ok('loan id carries the lon- prefix', String(loan.id).startsWith('lon-'));
ok('loan kind defaults to commercial', loan.kind === 'commercial');
ok('loan balanceGp mirrors principalGp', loan.balanceGp === 1000);
ok('loan interest defaults to 3% uncollateralized (RR p.42)', loan.interestRateMonthly === 0.03);
ok('loan status defaults to active', loan.status === 'active');
ok('loan missedInterestTurns/disreputable/debtOverXp default off', loan.missedInterestTurns === 0 && loan.disreputable === false && loan.debtOverXp === false);
ok('loan history is an array', Array.isArray(loan.history));
ok('loan reserves fdObligationId (B2) + ventureId (B5) null', loan.fdObligationId === null && loan.ventureId === null);

const acct = ACKS.blankBankAccount({});
ok('account id carries the bnk- prefix', String(acct.id).startsWith('bnk-'));
ok('account balanceGp defaults to 0', acct.balanceGp === 0);
ok('account status defaults to open', acct.status === 'open');
ok('account deposit interest defaults to 0 (no RAW deposit interest)', acct.depositInterestRateMonthly === 0);

ok('ID_PREFIXES.loan = lon', ACKS.ID_PREFIXES.loan === 'lon');
ok('ID_PREFIXES.bankAccount = bnk', ACKS.ID_PREFIXES.bankAccount === 'bnk');
ok('blankCampaign seeds loans[] + bankAccounts[]', (() => { const b = ACKS.blankCampaign({}); return Array.isArray(b.loans) && b.loans.length === 0 && Array.isArray(b.bankAccounts) && b.bankAccounts.length === 0; })());

// Registry
ok('entity registry has the loan kind (💰)', !!ACKS.entityKind && !!ACKS.entityKind('loan') && ACKS.entityKind('loan').icon === '💰');
ok('entity registry has the bankAccount kind (🏦)', !!ACKS.entityKind && !!ACKS.entityKind('bankAccount') && ACKS.entityKind('bankAccount').icon === '🏦');
ok('registry loan.list reads campaign.loans', (() => { const c = mkCampaign(); c.loans.push(loan); return ACKS.entityKind('loan').list(c).length === 1; })());

// Field schemas
ok('field schema "loan" exists + validates clean', (() => { const s = ACKS.fieldSchemaFor('loan'); return s && ACKS.validateFieldSchema('loan', s).ok; })(), JSON.stringify((ACKS.fieldSchemaFor('loan') && ACKS.validateFieldSchema('loan', ACKS.fieldSchemaFor('loan')).errors) || []));
ok('field schema "bankAccount" exists + validates clean', (() => { const s = ACKS.fieldSchemaFor('bankAccount'); return s && ACKS.validateFieldSchema('bankAccount', s).ok; })(), JSON.stringify((ACKS.fieldSchemaFor('bankAccount') && ACKS.validateFieldSchema('bankAccount', ACKS.fieldSchemaFor('bankAccount')).errors) || []));
ok('validateAllSchemas() still reports no errors overall', ACKS.validateAllSchemas().length === 0, ACKS.validateAllSchemas().slice(0,3).join(' | '));
// schema ⊆ factory (the global invariant, locally re-asserted)
for(const kind of ['loan','bankAccount']){
  const sch = ACKS.fieldSchemaFor(kind);
  const blank = ACKS[sch.factory]({});
  const keys = new Set(Object.keys(blank));
  const extras = sch.fields.filter(f => f.type !== 'computed').map(f => f.name).filter(n => !keys.has(n));
  ok('schema "' + kind + '" top-level fields ⊆ ' + sch.factory + ' keys', extras.length === 0, 'extras: [' + extras.join(', ') + ']');
}

// =============================================================================
section('Event registry — 5 record-only kinds, all opted out of the Event Wizard');
// =============================================================================
for(const k of ['loan-issued','loan-repaid','loan-interest','bank-deposit','bank-withdrawal']){
  ok('EVENT_KINDS knows "' + k + '"', ACKS.isEventKindKnown(k));
  ok('"' + k + '" is in EVENT_SCHEMAS', !!ACKS.EVENT_SCHEMAS[k]);
  ok('"' + k + '" is opted out of the Event Wizard (record-only)', ACKS.EVENT_WIZARD_OPTOUT.has(k));
}

// =============================================================================
section('Capital pool (RR p.42) — keyed on the shipped market class');
// =============================================================================
{
  const c = mkCampaign({ families: 1000 });   // Class IV
  ok('Class IV market pool = 5,000gp', ACKS.marketCapitalPool(c, 'set-1') === 5000);
  ok('remaining = full pool before any lending', ACKS.marketCapitalRemaining(c, 'set-1') === 5000);
  const big = mkCampaign({ families: 30000 }); // Class I
  ok('Class I market pool = 100,000gp', ACKS.marketCapitalPool(big, 'set-1') === 100000);
  const tiny = mkCampaign({ families: 100 });  // Class VI
  ok('Class VI market pool = 1,000gp', ACKS.marketCapitalPool(tiny, 'set-1') === 1000);
  ok('unknown settlement → 0 pool', ACKS.marketCapitalPool(c, 'set-nope') === 0);
}

// =============================================================================
section('takeLoan — advance the principal through the GP grammar');
// =============================================================================
{
  const c = mkCampaign({ debtorGp: 200, families: 1000 });
  const r = ACKS.takeLoan(c, { debtor:{ kind:'character', id:'chr-d' }, principalGp: 1000, marketSettlementId:'set-1' });
  ok('commercial loan succeeds', r.ok);
  ok('debtor purse +principal (200 → 1200)', charGp(c, 'chr-d') === 1200);
  ok('the loan landed in campaign.loans[]', c.loans.length === 1 && c.loans[0].id === r.loan.id);
  ok('balance = principal, status active, rate 3%', r.loan.balanceGp === 1000 && r.loan.status === 'active' && r.loan.interestRateMonthly === 0.03);
  ok('capital pool tracked (5000 − 1000 = 4000 remaining)', ACKS.marketCapitalRemaining(c, 'set-1') === 4000);
  ok('a loan-issued event was recorded', eventKinds(c).includes('loan-issued'));
  const ev = c.eventLog.find(e => e.event.kind === 'loan-issued');
  ok('loan-issued event carries the loanId + Event.context debtor', ev.event.payload.loanId === r.loan.id && (ev.event.context.relatedEntities || []).some(e => e.role === 'debtor' && e.id === 'chr-d'));
}
{
  const c = mkCampaign({ families: 1000 });
  const r = ACKS.takeLoan(c, { debtor:{ kind:'character', id:'chr-d' }, principalGp: 1000, collateral:{ kind:'note', label:'deed' }, marketSettlementId:'set-1' });
  ok('collateralized loan → 1% rate (RR p.42)', r.ok && r.loan.interestRateMonthly === 0.01);
}
{
  // personal PC → PC loan: gp moves creditor → debtor (real gp, not external)
  const c = mkCampaign({ debtorGp: 0, creditorGp: 5000 });
  const r = ACKS.takeLoan(c, { kind:'personal', creditor:{ kind:'character', id:'chr-c' }, debtor:{ kind:'character', id:'chr-d' }, principalGp: 1500 });
  ok('personal loan succeeds', r.ok && r.loan.kind === 'personal');
  ok('creditor purse −principal (5000 → 3500)', charGp(c, 'chr-c') === 3500);
  ok('debtor purse +principal (0 → 1500)', charGp(c, 'chr-d') === 1500);
}
{
  const c = mkCampaign({ families: 100 });  // Class VI — pool only 1,000gp
  const r = ACKS.takeLoan(c, { debtor:{ kind:'character', id:'chr-d' }, principalGp: 5000, marketSettlementId:'set-1' });
  ok('over the market capital pool → refused-with-reason', !r.ok && r.reason === 'over-capital-pool');
  ok('refusal reports the remaining pool', r.remaining === 1000);
  ok('no loan was created on refusal', c.loans.length === 0);
}
{
  const c = mkCampaign();
  ok('no debtor → refused', !ACKS.takeLoan(c, { principalGp: 100 }).ok);
  ok('zero/negative principal → refused', !ACKS.takeLoan(c, { debtor:{ kind:'character', id:'chr-d' }, principalGp: 0 }).ok);
}

// =============================================================================
section('repayLoan — debtor → creditor; full payoff settles');
// =============================================================================
{
  const c = mkCampaign({ debtorGp: 200 });
  const loanR = ACKS.takeLoan(c, { debtor:{ kind:'character', id:'chr-d' }, principalGp: 1000 });  // debtor 200 → 1200
  // partial repayment
  const r1 = ACKS.repayLoan(c, loanR.loan.id, { amount: 400 });
  ok('partial repayment ok', r1.ok && r1.paid === 400);
  ok('balance reduced (1000 → 600)', loanR.loan.balanceGp === 600);
  ok('debtor purse −400 (1200 → 800)', charGp(c, 'chr-d') === 800);
  ok('loan still active after partial', loanR.loan.status === 'active');
  ok('a loan-repaid event was recorded', eventKinds(c).includes('loan-repaid'));
  // full payoff
  const r2 = ACKS.repayLoan(c, loanR.loan.id);   // amount omitted → whole balance (600)
  ok('full payoff ok', r2.ok && r2.paid === 600);
  ok('loan settled (status repaid, settledAtTurn set)', loanR.loan.status === 'repaid' && loanR.loan.settledAtTurn === 1);
  ok('debtor purse −600 (800 → 200)', charGp(c, 'chr-d') === 200);
  // can't repay a settled loan
  ok('repaying a settled loan → refused', !ACKS.repayLoan(c, loanR.loan.id, { amount: 100 }).ok);
}
{
  // repayment clamps to the debtor's available gp
  const c = mkCampaign({ debtorGp: 0 });
  const loanR = ACKS.takeLoan(c, { debtor:{ kind:'character', id:'chr-d' }, principalGp: 1000 });  // debtor 0 → 1000
  c.characters[0].coins.gp = 250;   // only 250 on hand
  const r = ACKS.repayLoan(c, loanR.loan.id, { amount: 1000 });
  ok('repayment clamps to available funds (paid 250)', r.ok && r.paid === 250);
  ok('balance reduced by the clamped amount (1000 → 750)', loanR.loan.balanceGp === 750);
  c.characters[0].coins.gp = 0;
  ok('repaying with no funds → refused (insufficient-funds)', (() => { const x = ACKS.repayLoan(c, loanR.loan.id, { amount: 100 }); return !x.ok && x.reason === 'insufficient-funds'; })());
}

// =============================================================================
section('processBankingForTurn — monthly interest accrual (the engine heart)');
// =============================================================================
{
  // a funded debtor pays interest in full; balance unchanged
  const c = mkCampaign({ debtorGp: 200 });
  const lr = ACKS.takeLoan(c, { debtor:{ kind:'character', id:'chr-d' }, principalGp: 1000 });  // debtor 200 → 1200, 3%
  const out = ACKS.processBankingForTurn(c, {});
  ok('interest billed = 3% of balance (30gp)', out.totalInterestGp === 30);
  ok('funded debtor pays in full (1200 → 1170)', charGp(c, 'chr-d') === 1170);
  ok('balance unchanged when interest is paid (1000)', lr.loan.balanceGp === 1000);
  ok('not disreputable when paid', lr.loan.disreputable === false);
  ok('a loan-interest event was recorded (campaignLogHidden)', (() => { const e = c.eventLog.find(x => x.event.kind === 'loan-interest'); return e && e.event.campaignLogHidden === true; })());
}
{
  // an unfunded debtor capitalizes the shortfall + goes disreputable
  const c = mkCampaign({ debtorGp: 0 });
  const lr = ACKS.takeLoan(c, { debtor:{ kind:'character', id:'chr-d' }, principalGp: 1000 });  // debtor 0 → 1000
  c.characters[0].coins.gp = 10;   // can only pay 10 of the 30 interest
  const out = ACKS.processBankingForTurn(c, {});
  ok('interest still computed at 30', out.totalInterestGp === 30);
  ok('debtor pays what it can (10 → 0)', charGp(c, 'chr-d') === 0);
  ok('shortfall capitalized onto balance (1000 → 1020)', lr.loan.balanceGp === 1020);
  ok('missedInterestTurns incremented', lr.loan.missedInterestTurns === 1);
  ok('debtor flagged disreputable (RR p.42)', lr.loan.disreputable === true);
}
{
  // debt over XP → debtOverXp flag (RR p.42 bounty-hunter trigger; flag-only in B1)
  const c = mkCampaign({ debtorGp: 5000, debtorXp: 500 });
  const lr = ACKS.takeLoan(c, { debtor:{ kind:'character', id:'chr-d' }, principalGp: 2000 });  // balance 2000 > xp 500
  ACKS.processBankingForTurn(c, {});
  ok('balance over the debtor’s XP → debtOverXp flagged', lr.loan.debtOverXp === true);
}
{
  // dryRun previews without moving gp or mutating
  const c = mkCampaign({ debtorGp: 5000 });
  const lr = ACKS.takeLoan(c, { debtor:{ kind:'character', id:'chr-d' }, principalGp: 1000 });
  const gpBefore = charGp(c, 'chr-d'), balBefore = lr.loan.balanceGp, evBefore = c.eventLog.length;
  const out = ACKS.processBankingForTurn(c, { dryRun: true });
  ok('dryRun reports the accrual (30gp interest)', out.dryRun === true && out.totalInterestGp === 30);
  ok('dryRun moves no gp', charGp(c, 'chr-d') === gpBefore);
  ok('dryRun mutates no balance', lr.loan.balanceGp === balBefore);
  ok('dryRun emits no event', c.eventLog.length === evBefore);
}
{
  // capital-pool reset on the monthly tick
  const c = mkCampaign({ families: 1000 });
  ACKS.takeLoan(c, { debtor:{ kind:'character', id:'chr-d' }, principalGp: 3000, marketSettlementId:'set-1' });
  ok('pool used this month (5000 − 3000 = 2000)', ACKS.marketCapitalRemaining(c, 'set-1') === 2000);
  ACKS.processBankingForTurn(c, {});
  ok('monthly tick resets the market capital pool', ACKS.marketCapitalRemaining(c, 'set-1') === 5000);
}
{
  // no-op when there are no loans/accounts (RAW-core, dormant-until-used)
  const c = mkCampaign();
  const out = ACKS.processBankingForTurn(c, {});
  ok('no loans/accounts → a clean no-op (0 interest)', out.ran === true && out.totalInterestGp === 0 && out.accruals.length === 0);
  ok('no-op emits no events', c.eventLog.length === 0);
}
{
  // feudal loans are interest-free (RR p.348) — the B2 reconcile owns them; the consumer skips them
  const c = mkCampaign({ debtorGp: 2000 });
  const lr = ACKS.takeLoan(c, { kind:'feudal', creditor:{ kind:'domain', id:'dom-1' }, debtor:{ kind:'character', id:'chr-d' }, principalGp: 1000, interestRateMonthly: 0 });
  const before = charGp(c, 'chr-d');
  ACKS.processBankingForTurn(c, {});
  ok('feudal loan accrues no interest', lr.loan.balanceGp === 1000 && charGp(c, 'chr-d') === before);
}
{
  // a deposit-bearing account credits a monthly return when depositInterestRateMonthly > 0
  const c = mkCampaign();
  const ar = ACKS.openBankAccount(c, { owner:{ kind:'character', id:'chr-d' }, depositInterestRateMonthly: 0.01, initialDepositGp: 1000 });
  ACKS.processBankingForTurn(c, {});
  ok('deposit return credited at 1% (1000 → 1010)', ar.account.balanceGp === 1010);
}

// =============================================================================
section('Bank accounts — deposit/withdraw via the bank-account wealth-handle');
// =============================================================================
ok('bank-account is a registered GP-Wave-B wealth handle', (() => {
  // a direct wealth-transfer using a bank-account handle must not be rejected as a bad kind
  const c = mkCampaign({ debtorGp: 1000 });
  const ar = ACKS.openBankAccount(c, { owner:{ kind:'character', id:'chr-d' } });
  let threw = null; try { ACKS.applyWealthTransfer(c, { amount: 100, source:{ kind:'character-gp', id:'chr-d' }, destination:{ kind:'bank-account', id: ar.account.id }, allowOverdraft:false, reason:'t' }); } catch(e){ threw = e.message; }
  return threw === null && ar.account.balanceGp === 100;
})());
{
  const c = mkCampaign({ debtorGp: 1000 });
  const ar = ACKS.openBankAccount(c, { owner:{ kind:'character', id:'chr-d' } });
  ok('openBankAccount succeeds + lands in campaign.bankAccounts[]', ar.ok && c.bankAccounts.length === 1);
  const d = ACKS.depositToBankAccount(c, ar.account.id, 600, {});
  ok('deposit moves gp purse → account', d.ok && charGp(c, 'chr-d') === 400 && ar.account.balanceGp === 600);
  ok('a bank-deposit event was recorded', eventKinds(c).includes('bank-deposit'));
  const w = ACKS.withdrawFromBankAccount(c, ar.account.id, 250, {});
  ok('withdraw moves gp account → purse', w.ok && charGp(c, 'chr-d') === 650 && ar.account.balanceGp === 350);
  ok('a bank-withdrawal event was recorded', eventKinds(c).includes('bank-withdrawal'));
  ok('over-balance withdrawal → refused', !ACKS.withdrawFromBankAccount(c, ar.account.id, 9999, {}).ok);
  // a deposit beyond the owner's funds → refused (the gated character handle)
  ok('deposit beyond funds → refused (insufficient-funds)', (() => { const x = ACKS.depositToBankAccount(c, ar.account.id, 99999, {}); return !x.ok && x.reason === 'insufficient-funds'; })());
}
{
  // RR p.313 — the 10% custody fee at consignment (opt-in)
  const c = mkCampaign({ debtorGp: 2000 });
  const ar = ACKS.openBankAccount(c, { owner:{ kind:'character', id:'chr-d' }, custodyFeePctAtConsignment: 0.10 });
  const d = ACKS.depositToBankAccount(c, ar.account.id, 1000, { consignment: true });
  ok('consignment deposit takes the 10% custody fee (RR p.313)', d.ok && d.custodyFeeGp === 100 && ar.account.balanceGp === 900);
}
{
  // openBankAccount with a failed funding deposit rolls back the empty account
  const c = mkCampaign({ debtorGp: 50 });
  const ar = ACKS.openBankAccount(c, { owner:{ kind:'character', id:'chr-d' }, initialDepositGp: 5000 });
  ok('open with an unaffordable initial deposit → refused + no orphan account', !ar.ok && c.bankAccounts.length === 0);
}

// =============================================================================
console.log('\n=============================================');
console.log('banking.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail > 0){ console.log('\nFAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
