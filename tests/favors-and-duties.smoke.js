// =============================================================================
// favors-and-duties.smoke.js — Favors & Duties F&D-1 (#230, RR pp.345–348).
// The monthly liege↔vassal obligation engine: the 1d20 Favor/Duty table, the favor/duty
// balance + cumulative-penalty Loyalty roll (verified vs the RR p.347 worked example), the
// muster-timing table, the relation setters, and the commitTurn-driven monthly roll + gp flows.
// =============================================================================
const path = require('path');
global.window = global;
[
  'acks-engine-catalogs.js', 'acks-engine.js', 'acks-engine-entities.js', 'acks-engine-economy.js',
  'acks-engine-entity-registry.js', 'acks-engine-field-schemas.js', 'acks-engine-events.js', 'acks-engine-subsystems.js',
].forEach(f => require(path.join(__dirname, '..', f)));
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('\n--- ' + t + ' ---'); }

// A scripted RNG: returns queued values in order, then a safe inert fallback (0.999 → 1d20=20
// grant-of-land [a no-gp favor, no further draws], d6=6, d100=100) so over-runs stay deterministic.
function scriptedRng(values){ let i = 0; return () => (i < values.length ? values[i++] : 0.999); }
// Map a desired 1d20 / 1d6 / d100 result to the rng() value that produces it (roll = 1 + floor(rng()*N)).
const d20Val = r => (r - 1) / 20 + 0.0001;
const d6Val  = r => (r - 1) / 6  + 0.0001;
const d100Val= p => (p - 1) / 100 + 0.0001;

// ── Build a minimal liege/vassal campaign (lord 'chr-lord' over vassal domain 'dom-vassal'). ──
function mkCampaign(opts){
  opts = opts || {};
  const lord = ACKS.blankCharacter({ id:'chr-lord', name:'Lord' });
  lord.loyalty = 0; lord.abilities = Object.assign({}, lord.abilities, { CHA: opts.lordCha || 12 });
  const vassal = ACKS.blankCharacter({ id:'chr-vassal', name:'Vassal' });
  vassal.loyalty = opts.vassalLoyalty != null ? opts.vassalLoyalty : 0;
  const lordDomain = ACKS.blankDomain({ id:'dom-lord', name:'Lord Realm' });
  lordDomain.rulerCharacterId = 'chr-lord'; lordDomain.liegeId = null;
  lordDomain.treasury = { gp: 100000 }; lordDomain.demographics.peasantFamilies = 1000;
  lordDomain.tags = ['march'];   // → muster title 'count'
  const vassalDomain = ACKS.blankDomain({ id:'dom-vassal', name:'Vassal Realm' });
  vassalDomain.rulerCharacterId = 'chr-vassal'; vassalDomain.liegeId = 'dom-lord';
  vassalDomain.treasury = { gp: 50000 }; vassalDomain.demographics.peasantFamilies = opts.vassalFamilies || 500;
  vassalDomain.expenses.tributeAuto = true; vassalDomain.tags = ['barony'];
  vassalDomain.geography.hexes = [{ id:'hex-v', coord:{ q:0, r:0 } }];
  return {
    schemaVersion: 2, kind:'campaign', id:'cmp-fd', name:'FD', createdAt:'2026-01-01', lastModifiedAt:'2026-01-01',
    currentTurn: opts.turn || 1, houseRules: opts.houseRules || {},
    domains: [lordDomain, vassalDomain], characters: [lord, vassal],
    hexes: [{ id:'hex-v', domainId:'dom-vassal', coord:{ q:0, r:0 } }],
    vassalages: [{ id:'vas-1', schemaVersion:2, status:'active', vassalRulerCharacterId:'chr-vassal', suzerainCharacterId:'chr-lord', vassalDomainId:'dom-vassal', suzerainDomainId:'dom-lord', history:[] }],
    favorDutyObligations: [], eventLog: [], pendingEvents: [], settlements: [], rumors: [], ventures: [], parties: []
  };
}
const treasuryGp = (c, id) => c.domains.find(d => d.id === id).treasury.gp;

// =============================================================================
section('Data layer — factory / registry / field schema / migration');
// =============================================================================
const ob = ACKS.blankFavorDutyObligation({ liegeCharacterId:'chr-l', vassalDomainId:'dom-v', kind:'loan' });
ok('id carries the fdo- prefix', String(ob.id).startsWith('fdo-'));
ok('status defaults to active', ob.status === 'active');
ok('grantedAtTurn defaults to 1', ob.grantedAtTurn === 1);
ok('revokedAtTurn defaults to null', ob.revokedAtTurn === null);
ok('constructionSpentGp defaults to 0', ob.constructionSpentGp === 0);
ok('history is an array', Array.isArray(ob.history));
ok('registry kind registered', !!ACKS.entityKind('favorDutyObligation'));
ok('registry label', ACKS.entityLabel('favorDutyObligation') === 'Favor / Duty Obligation');
// schema ⊆ factory (also enforced globally in smoke.js; local belt-and-suspenders)
const sch = ACKS.fieldSchemaFor('favorDutyObligation');
ok('field schema present + names the factory', !!sch && sch.factory === 'blankFavorDutyObligation');
const fkeys = new Set(Object.keys(ob));
const extras = sch.fields.filter(f => f.type !== 'computed').map(f => f.name).filter(n => !fkeys.has(n));
ok('schema fields ⊆ factory keys', extras.length === 0, 'extras: [' + extras.join(', ') + ']');
ok('blankCampaign has the collection', Array.isArray(ACKS.blankCampaign({}).favorDutyObligations));
// migration backfills the collection on a legacy save lacking it
const legacy = ACKS.migrateCampaign({ schemaVersion:2, name:'L', houseRules:{}, calendar:{}, domains:[], characters:[] });
ok('migration backfills favorDutyObligations []', Array.isArray(legacy.favorDutyObligations) && legacy.favorDutyObligations.length === 0);

// =============================================================================
section('Catalog — the 1d20 Favor/Duty table (RR p.348)');
// =============================================================================
for(let r = 1; r <= 20; r++){ ok('roll ' + r + ' maps to a table entry', !!ACKS.lookupFavorDuty(r)); }
ok('roll 1 = construction (duty, ongoing, monthly-tribute basis)', (() => { const e = ACKS.lookupFavorDuty(1); return e.kind==='construction' && e.isFavor===false && e.isOngoing===true && e.gpBasis==='monthly-tribute'; })());
ok('roll 2 = scutage (duty, realm-families, muster)', (() => { const e = ACKS.lookupFavorDuty(2); return e.kind==='scutage' && e.gpBasis==='realm-families' && e.muster===true; })());
ok('rolls 3-4 = call-to-council (duty, no gp)', ACKS.lookupFavorDuty(3).kind==='call-to-council' && ACKS.lookupFavorDuty(4).kind==='call-to-council' && ACKS.lookupFavorDuty(3).gpBasis==='none');
ok('rolls 5-6 = call-to-arms (duty, muster)', ACKS.lookupFavorDuty(5).kind==='call-to-arms' && ACKS.lookupFavorDuty(6).kind==='call-to-arms' && ACKS.lookupFavorDuty(5).muster===true);
ok('rolls 7-8 = loan (duty, realm-families)', ACKS.lookupFavorDuty(7).kind==='loan' && ACKS.lookupFavorDuty(8).kind==='loan');
ok('rolls 9-12 = revocation (special, isFavor null)', [9,10,11,12].every(r => ACKS.lookupFavorDuty(r).kind==='revocation') && ACKS.lookupFavorDuty(9).isFavor === null);
ok('rolls 13-14 = charter-of-monopoly (ongoing favor)', ACKS.lookupFavorDuty(13).kind==='charter-of-monopoly' && ACKS.lookupFavorDuty(13).isFavor===true && ACKS.lookupFavorDuty(13).isOngoing===true);
ok('rolls 15-16 = gift (one-time favor, realm-families)', ACKS.lookupFavorDuty(15).kind==='gift' && ACKS.lookupFavorDuty(15).isFavor===true && ACKS.lookupFavorDuty(15).isOngoing===false && ACKS.lookupFavorDuty(15).gpBasis==='realm-families');
ok('rolls 17-18 = office (ongoing favor)', ACKS.lookupFavorDuty(17).kind==='office' && ACKS.lookupFavorDuty(17).isFavor===true && ACKS.lookupFavorDuty(17).isOngoing===true);
ok('roll 19 = troops (ongoing favor, realm-families)', ACKS.lookupFavorDuty(19).kind==='troops' && ACKS.lookupFavorDuty(19).isFavor===true);
ok('roll 20 = grant-of-land (one-time favor)', ACKS.lookupFavorDuty(20).kind==='grant-of-land' && ACKS.lookupFavorDuty(20).isFavor===true && ACKS.lookupFavorDuty(20).isOngoing===false);

// =============================================================================
section('Catalog — muster timing by title (RR p.348: ½ up / ¼ down min1 / remainder)');
// =============================================================================
ok('title period: baron/count/viscount → week', ['baron','count','viscount'].every(t => ACKS.MUSTER_TIME_BY_TITLE[t]==='week'));
ok('title period: prince/duke → month', ACKS.MUSTER_TIME_BY_TITLE.prince==='month' && ACKS.MUSTER_TIME_BY_TITLE.duke==='month');
ok('title period: emperor/king → season', ACKS.MUSTER_TIME_BY_TITLE.emperor==='season' && ACKS.MUSTER_TIME_BY_TITLE.king==='season');
const m100 = ACKS.musterSchedule('baron', 100);
ok('baron 100 → [50,25,25] over weeks', JSON.stringify(m100.periods.map(p=>p.amount))==='[50,25,25]' && m100.unit==='week');
const m10 = ACKS.musterSchedule('duke', 10);
ok('duke 10 → [5,2,3] over months', JSON.stringify(m10.periods.map(p=>p.amount))==='[5,2,3]' && m10.unit==='month');
const m1 = ACKS.musterSchedule('king', 1);
ok('king 1 → [1,0,0] (min-1 cannot apply when nothing remains)', JSON.stringify(m1.periods.map(p=>p.amount))==='[1,0,0]' && m1.unit==='season');
ok('muster periods always sum to the total', [1,2,3,7,10,100,4520].every(t => { const s = ACKS.musterSchedule('baron', t); return s.periods.reduce((a,p)=>a+p.amount,0) === t; }));
ok('realmTitleForDomain reads tags (barony → baron)', ACKS.realmTitleForDomain({ tags:['barony','vassal'] })==='baron');
ok('realmTitleForDomain reads name (March → count)', ACKS.realmTitleForDomain({ name:'March of Saltspur', tags:[] })==='count');
ok('realmTitleForDomain defaults to baron', ACKS.realmTitleForDomain({ name:'Foo', tags:[] })==='baron');

// =============================================================================
section('House rule — favor-duty-auto-roll defaults ON (RAW), explicit-off respected');
// =============================================================================
ok('registry default is true', ACKS.lookupHouseRule('favor-duty-auto-roll').default === true);
ok('absent rule → enabled (registry default)', ACKS.isHouseRuleEnabled({ houseRules:{} }, 'favor-duty-auto-roll') === true);
ok('explicit {enabled:false} → off', ACKS.isHouseRuleEnabled({ houseRules:{ 'favor-duty-auto-roll':{ enabled:false } } }, 'favor-duty-auto-roll') === false);

// =============================================================================
section('Relation setters + lookups');
// =============================================================================
{
  const c = mkCampaign();
  const o1 = ACKS.createFavorDutyObligation(c, { liegeCharacterId:'chr-lord', vassalDomainId:'dom-vassal', kind:'loan', isFavor:false, isOngoing:true, gpPerMonth:500, grantedAtTurn:1 });
  ok('createFavorDutyObligation pushes to the collection', c.favorDutyObligations.length === 1);
  ok('create stamps a created history entry at grantedAtTurn', o1.history.length === 1 && o1.history[0].type === 'created' && o1.history[0].turn === 1);
  ok('activeFavorDutyObligationsFor filters by (liege, vassal) + active', ACKS.activeFavorDutyObligationsFor(c,'chr-lord','dom-vassal').length === 1);
  const rev = ACKS.revokeFavorDutyObligation(c, o1.id, 3, 'test');
  ok('revoke sets status revoked + revokedAtTurn', rev.status === 'revoked' && rev.revokedAtTurn === 3);
  ok('revoke is idempotent (a 2nd revoke is a no-op)', (() => { const before = JSON.stringify(o1); ACKS.revokeFavorDutyObligation(c, o1.id, 9, 'again'); return JSON.stringify(o1) === before; })());
  ok('revoked obligation drops out of the active set', ACKS.activeFavorDutyObligationsFor(c,'chr-lord','dom-vassal').length === 0);
  const o2 = ACKS.createFavorDutyObligation(c, { liegeCharacterId:'chr-lord', vassalDomainId:'dom-vassal', kind:'gift', isFavor:true, isOngoing:false, grantedAtTurn:1 });
  const sp = ACKS.spendOneTimeFavorObligation(c, o2.id, 2, 'lapsed');
  ok('spendOneTimeFavorObligation sets one-time-spent', sp.status === 'one-time-spent');
  ok('favorDutyObligationsForVassalDomain returns all (any status)', ACKS.favorDutyObligationsForVassalDomain(c,'dom-vassal').length === 2);
}

// =============================================================================
section('realmFamiliesForDomain — own domain + sub-vassal realms (RR p.346)');
// =============================================================================
{
  const c = mkCampaign({ vassalFamilies: 500 });
  // Add a sub-vassal under dom-vassal with 200 families.
  const sub = ACKS.blankDomain({ id:'dom-sub', name:'Sub' });
  sub.liegeId = 'dom-vassal'; sub.demographics.peasantFamilies = 200;
  c.domains.push(sub);
  const vassalDomain = c.domains.find(d => d.id === 'dom-vassal');
  ok('vassal alone = 500 families', ACKS.totalFamilies(vassalDomain) === 500);
  ok('realm families = vassal 500 + sub-vassal 200 = 700', ACKS.realmFamiliesForDomain(c, vassalDomain) === 700);
}

// =============================================================================
section('Favor/duty balance — the RR p.347 worked example (Quintus & Cadom)');
// =============================================================================
{
  const c = mkCampaign({ turn: 3 });
  const L = 'chr-lord', D = 'dom-vassal';
  const mk = (kind, isFavor, isOngoing, grantedAtTurn) => ACKS.createFavorDutyObligation(c, { liegeCharacterId:L, vassalDomainId:D, kind, isFavor, isOngoing, grantedAtTurn });
  mk('loan', false, true, 1);
  mk('call-to-arms', false, true, 2);
  let b = ACKS.favorDutyBalance(c, L, D, { turn: 3 });
  ok('2 duties / 0 favors → safe 1, excess 1, modifier 0', b.safeDutyCount===1 && b.excess===1 && b.loyaltyModifier===0);
  mk('call-to-arms', false, true, 3);  // a 3rd duty
  b = ACKS.favorDutyBalance(c, L, D, { turn: 3 });
  ok('3 duties / 0 favors → excess 2, modifier −1 (cumulative)', b.excess===2 && b.loyaltyModifier===-1);
  mk('office', true, true, 3);  // an ongoing favor → safe +1
  b = ACKS.favorDutyBalance(c, L, D, { turn: 3 });
  ok('+1 ongoing favor → safe 2', b.safeDutyCount===2 && b.ongoingFavors===1);
  const gift = mk('gift', true, false, 3);  // a one-time favor THIS month → safe +1
  b = ACKS.favorDutyBalance(c, L, D, { turn: 3 });
  ok('+1 one-time favor this month → safe 3, oneTime 1', b.safeDutyCount===3 && b.oneTimeFavorsThisMonth===1);
  // next month the one-time favor no longer offsets (RR p.347 — "only the month it is given")
  b = ACKS.favorDutyBalance(c, L, D, { turn: 4 });
  ok('one-time favor offsets ONLY its month (next month oneTime 0, safe 2)', b.oneTimeFavorsThisMonth===0 && b.safeDutyCount===2);
}

// =============================================================================
section('Monthly roll — processFavorsAndDutiesForTurn (default ON / off)');
// =============================================================================
{
  const off = mkCampaign({ houseRules: { 'favor-duty-auto-roll': { enabled:false } } });
  const r = ACKS.processFavorsAndDutiesForTurn(off, { rng: scriptedRng([]) });
  ok('rule OFF → ruleOn false, no edicts, no obligations', r.ruleOn===false && off.favorDutyObligations.length===0);

  const on = mkCampaign();   // default ON (registry)
  ACKS.processFavorsAndDutiesForTurn(on, { rng: scriptedRng([ d20Val(15) ]) });  // force a Gift
  ok('rule ON (default) → one edict rolled per active vassalage', on.favorDutyObligations.length === 1);
  ok('forced roll 15 → a gift obligation created', on.favorDutyObligations[0].kind === 'gift');
}

// =============================================================================
section('gp flows — Loan principal / Gift / Scutage recurrence / Loan repayment');
// =============================================================================
{
  // Loan (roll 7): DEMANDED but NOT given on grant — the principal moves only when the vassal gives it
  // (RR p.348). The obligation is created ungiven; treasuries are untouched until giveLoanObligation.
  const c = mkCampaign();
  const lordBefore = treasuryGp(c,'dom-lord'), vassBefore = treasuryGp(c,'dom-vassal');
  ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([ d20Val(7) ]) });
  const loan = c.favorDutyObligations.find(o => o.kind==='loan');
  ok('loan obligation created with gpPerMonth = 1gp × realm families', !!loan && loan.gpPerMonth === ACKS.realmFamiliesForDomain(c, c.domains.find(d=>d.id==='dom-vassal')));
  ok('loan starts NOT given (loanGivenAtTurn null)', loan.loanGivenAtTurn == null);
  ok('NO gp moves on grant (loan is demanded, not yet given)', treasuryGp(c,'dom-vassal') === vassBefore && treasuryGp(c,'dom-lord') === lordBefore);
}
{
  // Gift (roll 15): gp moves lord → vassal, once.
  const c = mkCampaign();
  const lordBefore = treasuryGp(c,'dom-lord'), vassBefore = treasuryGp(c,'dom-vassal');
  ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([ d20Val(15) ]) });
  const gift = c.favorDutyObligations.find(o => o.kind==='gift');
  ok('gift moved lord → vassal (lord −X, vassal +X)', treasuryGp(c,'dom-lord') === lordBefore - gift.gpPerMonth && treasuryGp(c,'dom-vassal') === vassBefore + gift.gpPerMonth);
}
{
  // Scutage (roll 2) — F&D-6 model: a recurring duty with a persistent AUTO-PAY toggle. "Pay Scutage"
  // (payScutageObligation) turns it ON → it bills automatically every monthly turn; "Stop Paying" turns it off.
  const c = mkCampaign({ houseRules:{ 'favor-duty-auto-roll':{ enabled:false } } });
  const scu = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'scutage' }, { rng: scriptedRng([]) }).obligation;
  ok('scutage created (recurring duty)', scu.kind==='scutage' && scu.isOngoing === true);
  ok('scutage moves NO gp on demand', treasuryGp(c,'dom-vassal') === 50000 && treasuryGp(c,'dom-lord') === 100000);
  ok('scutage starts NOT auto-paying (scutageAutoPay false)', scu.scutageAutoPay === false);
  // While auto-pay is OFF: Phase B settles nothing (the lord isn't credited).
  ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([]) });
  ok('auto-pay off → lord NOT credited', treasuryGp(c,'dom-lord') === 100000);
  // Turn auto-pay ON: no gp moves on the click (it settles at the monthly turn).
  ACKS.payScutageObligation(c, scu.id, {});
  ok('payScutageObligation enables auto-pay (scutageAutoPay true)', c.favorDutyObligations.find(o=>o.id===scu.id).scutageAutoPay === true);
  ok('turning auto-pay on moves no gp itself', treasuryGp(c,'dom-vassal') === 50000 && treasuryGp(c,'dom-lord') === 100000);
  // Phase B now CREDITS the lord (one-sided — the vassal debit is the monthly NET, tested in F&D-6 below).
  ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([]) });
  ok('auto-pay on → lord credited the amount', treasuryGp(c,'dom-lord') === 100000 + scu.gpPerMonth);
  ok('Phase B does NOT debit the vassal (that is the monthly net)', treasuryGp(c,'dom-vassal') === 50000);
  ok('the monthly turn stamps scutageLastPaidTurn (audit)', c.favorDutyObligations.find(o=>o.id===scu.id).scutageLastPaidTurn === c.currentTurn);
  ok('scutage is still active (recurs until revoked)', c.favorDutyObligations.find(o => o.id===scu.id).status === 'active');
  // It keeps paying AUTOMATICALLY the next month — no re-click (the whole point of the toggle).
  c.currentTurn = 2;
  const lordM2 = treasuryGp(c,'dom-lord');
  ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([]) });
  ok('auto-pay keeps billing every month with no re-click', treasuryGp(c,'dom-lord') === lordM2 + scu.gpPerMonth);
  // "Stop Paying": withheld going forward — the lord is no longer credited.
  ACKS.stopScutagePayment(c, scu.id, {});
  ok('stopScutagePayment turns auto-pay off', c.favorDutyObligations.find(o=>o.id===scu.id).scutageAutoPay === false);
  c.currentTurn = 3;
  const lordM3 = treasuryGp(c,'dom-lord');
  ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([]) });
  ok('after Stop Paying → lord NOT credited (withheld)', treasuryGp(c,'dom-lord') === lordM3);
  // Idempotent: a second consecutive "Pay Scutage" (already on) adds no history / event.
  ACKS.payScutageObligation(c, scu.id, {});   // re-enable (a real on-transition)
  const onCount1 = c.favorDutyObligations.find(o=>o.id===scu.id).history.filter(h=>h.type==='scutage-autopay-on').length;
  ACKS.payScutageObligation(c, scu.id, {});   // already on → no-op
  const onCount2 = c.favorDutyObligations.find(o=>o.id===scu.id).history.filter(h=>h.type==='scutage-autopay-on').length;
  ok('payScutageObligation idempotent (a second consecutive Pay adds no history)', onCount2 === onCount1);
  // Guarded on a non-scutage obligation.
  const gift = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'gift' }, { rng: scriptedRng([]) }).obligation;
  ACKS.payScutageObligation(c, gift.id, {});
  ok('payScutageObligation on a non-scutage is a no-op (scutageAutoPay stays false)', gift.scutageAutoPay === false);
  ok('payScutageObligation on an unknown id → null', ACKS.payScutageObligation(c, 'fdo-nope', {}) === null);
}
{
  // Loan repayment: a GIVEN loan (funded in a PRIOR month) gets a CHA% repayment check (CHA 100 → always repays).
  const c = mkCampaign({ lordCha: 100, turn: 2 });
  const loan = ACKS.createFavorDutyObligation(c, { liegeCharacterId:'chr-lord', vassalDomainId:'dom-vassal', vassalRulerCharacterId:'chr-vassal', kind:'loan', isFavor:false, isOngoing:true, gpPerMonth:500, grantedAtTurn:1, loanGivenAtTurn:1 });
  const lordBefore = treasuryGp(c,'dom-lord'), vassBefore = treasuryGp(c,'dom-vassal');
  // month-2 roll: force a no-op edict (revocation of a non-existent favor), so only Phase B (repayment) acts.
  ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([ d20Val(9), d6Val(1), d100Val(50) ]) });
  ok('given loan repaid at CHA 100% → status revoked', c.favorDutyObligations.find(o=>o.id===loan.id).status === 'revoked');
  ok('loan repayment moved lord → vassal', treasuryGp(c,'dom-lord') === lordBefore - 500 && treasuryGp(c,'dom-vassal') === vassBefore + 500);
}

// =============================================================================
section('Construction duty — monthly self-spend + auto-revoke at 15,000gp / hex (RR p.348)');
// =============================================================================
{
  const c = mkCampaign();
  // Pre-seed a construction obligation near the 1-hex cap (15,000gp) so one more month trips the auto-revoke.
  const con = ACKS.createFavorDutyObligation(c, { liegeCharacterId:'chr-lord', vassalDomainId:'dom-vassal', vassalRulerCharacterId:'chr-vassal', kind:'construction', isFavor:false, isOngoing:true, gpPerMonth:5000, constructionSpentGp:12000, grantedAtTurn:1 });
  const vassBefore = treasuryGp(c,'dom-vassal');
  // force a no-op edict so Phase B drives the construction
  ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([ d20Val(9), d6Val(1) ]) });
  const after = c.favorDutyObligations.find(o => o.id === con.id);
  ok('construction self-spend debits the vassal treasury (−5000)', treasuryGp(c,'dom-vassal') === vassBefore - 5000);
  ok('constructionSpentGp accumulates (12000 → 17000)', after.constructionSpentGp === 17000);
  ok('auto-revoked at the 15,000gp / 6-mile-hex cap', after.status === 'revoked');
}

// =============================================================================
section('Excess-duty Loyalty roll fires at the cumulative penalty (RR p.347)');
// =============================================================================
{
  // Pre-seed ONE active ongoing duty (this turn), then force a 2nd duty → excess 1 → Loyalty roll at 0.
  const c = mkCampaign({ vassalLoyalty: 0 });
  ACKS.createFavorDutyObligation(c, { liegeCharacterId:'chr-lord', vassalDomainId:'dom-vassal', vassalRulerCharacterId:'chr-vassal', kind:'loan', isFavor:false, isOngoing:true, gpPerMonth:0, grantedAtTurn:1 });
  // force roll 5 (call-to-arms, a 2nd duty) + loyalty 2d6 = 3+3 (natRoll 6 → grudging, delta −1 at modifier 0)
  const r = ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([ d20Val(5), d6Val(3), d6Val(3) ]) });
  ok('over-demand (2 duties vs safe 1) → exactly one Loyalty roll fired', r.loyaltyRolls.length === 1);
  ok('the roll used the correct cumulative modifier (0 at the trigger duty)', r.loyaltyRolls[0].modifier === 0);
  ok('the vassal ruler loyalty changed per the roll band', c.characters.find(x=>x.id==='chr-vassal').loyalty === -1);

  // 3-duty case → the roll fires at −1.
  const c2 = mkCampaign({ vassalLoyalty: 0 });
  ACKS.createFavorDutyObligation(c2, { liegeCharacterId:'chr-lord', vassalDomainId:'dom-vassal', vassalRulerCharacterId:'chr-vassal', kind:'loan', isFavor:false, isOngoing:true, gpPerMonth:0, grantedAtTurn:1 });
  ACKS.createFavorDutyObligation(c2, { liegeCharacterId:'chr-lord', vassalDomainId:'dom-vassal', vassalRulerCharacterId:'chr-vassal', kind:'scutage', isFavor:false, isOngoing:true, gpPerMonth:0, grantedAtTurn:1 });
  const r2 = ACKS.processFavorsAndDutiesForTurn(c2, { rng: scriptedRng([ d20Val(5), d6Val(4), d6Val(4) ]) });  // 3rd duty
  ok('3 duties vs safe 1 → Loyalty roll at modifier −1', r2.loyaltyRolls.length === 1 && r2.loyaltyRolls[0].modifier === -1);
}

// =============================================================================
section('Revocation (9–12) revokes the most-recent favor (1) or duty (2–6)');
// =============================================================================
{
  const c = mkCampaign({ turn: 2 });
  ACKS.createFavorDutyObligation(c, { liegeCharacterId:'chr-lord', vassalDomainId:'dom-vassal', kind:'loan', isFavor:false, isOngoing:true, grantedAtTurn:1 });
  const recent = ACKS.createFavorDutyObligation(c, { liegeCharacterId:'chr-lord', vassalDomainId:'dom-vassal', kind:'scutage', isFavor:false, isOngoing:true, grantedAtTurn:1 });
  // force roll 10 (revocation) + subRoll 3 (2–6 → revoke a duty) → revokes the most-recent duty (scutage)
  const r = ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([ d20Val(10), d6Val(3) ]) });
  ok('revocation revoked one duty', r.revoked.length === 1);
  ok('the MOST-RECENT duty was revoked (scutage, granted last)', c.favorDutyObligations.find(o=>o.id===recent.id).status === 'revoked');
  // revocation of a favor when none exists → nothing-to-revoke (no crash)
  const c2 = mkCampaign();
  const r2 = ACKS.processFavorsAndDutiesForTurn(c2, { rng: scriptedRng([ d20Val(11), d6Val(1) ]) });  // subRoll 1 → favor, none present
  ok('revocation with nothing to revoke is a clean no-op', r2.revoked.length === 0 && c2.favorDutyObligations.length === 0);
}

// =============================================================================
section('favor-duty event — record-only, context envelope, Wizard opt-out, validates');
// =============================================================================
{
  const c = mkCampaign();
  ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([ d20Val(15) ]) });  // gift
  const ev = c.eventLog.find(e => e.event && e.event.kind === 'favor-duty');
  ok('a favor-duty event was emitted to the eventLog', !!ev);
  ok('event status is applied (record-only)', ev.event.status === ACKS.EVENT_STATUS.APPLIED);
  ok('event context.domainId = the vassal domain', ev.event.context.domainId === 'dom-vassal');
  ok('event context.primaryHexId = a hex in the vassal domain', ev.event.context.primaryHexId === 'hex-v');
  ok('event context.relatedEntities carry liege + vassal + subject', (() => { const roles = ev.event.context.relatedEntities.map(r=>r.role).sort(); return roles.join(',') === 'liege,subject,vassal'; })());
  ok('favor-duty is NOT Wizard-emittable (engine-owned)', ACKS.isWizardEmittable('favor-duty') === false);
  ok('the emitted event passes validateEvent', (() => { try { ACKS.validateEvent(ev.event); return true; } catch(_) { return false; } })());
}

// =============================================================================
section('commitTurn integration — F&D rides the monthly turn deterministically (no crash)');
// =============================================================================
{
  // Run a real propose→commit on the demo for several months with a seeded rng; assert it advances
  // cleanly and accumulates obligations (the live monthly-turn path, default-ON).
  require(path.join(__dirname, '..', 'acks-demo-template.js'));
  function lcg(seed){ let s = seed>>>0; return () => { s = (1103515245*s + 12345)>>>0; return s/4294967296; }; }
  const rng = lcg(99);
  const demo = ACKS.migrateCampaign(JSON.parse(JSON.stringify(global.ACKS_DEMO_TEMPLATE)));
  const startTurn = demo.currentTurn;
  let crashed = false;
  for(let i = 0; i < 6; i++){
    try { const p = ACKS.proposeMonthlyTurn(demo, { rng }); const res = ACKS.commitTurn(demo, p, { rng }); if(res.error) { crashed = true; break; } }
    catch(e){ crashed = true; break; }
  }
  ok('6 monthly commits run without error', !crashed);
  ok('the turn counter advanced by 6', demo.currentTurn === startTurn + 6);
  ok('obligations accumulated on the demo (default-ON auto-roll)', demo.favorDutyObligations.length > 0);
  ok('every obligation has a valid status', demo.favorDutyObligations.every(o => ['active','revoked','one-time-spent'].includes(o.status)));
  ok('favor-duty events landed in the eventLog', demo.eventLog.some(e => e.event && e.event.kind === 'favor-duty'));
}

// =============================================================================
section('Manual GM-pick path — applyFavorDutyEdictByKind + revokeFavorDutyEdict (F&D-2 UI)');
// =============================================================================
{
  // Grant a favor (gift) by kind — resolves liege/ruler/domains from the vassalage; roll = null.
  const c = mkCampaign();
  const lordBefore = treasuryGp(c,'dom-lord'), vassBefore = treasuryGp(c,'dom-vassal');
  const realmF = ACKS.realmFamiliesForDomain(c, c.domains.find(d=>d.id==='dom-vassal'));
  const g = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'gift' }, { rng: scriptedRng([]) });
  ok('grant favor by kind returns a result + obligation', !!g && !!g.obligation && g.obligation.kind === 'gift' && g.obligation.isFavor === true);
  ok('manual edict records roll = null (hand-picked, not rolled)', g.obligation.roll === null);
  ok('manual gift lands in the collection, active', c.favorDutyObligations.some(o => o.id === g.obligation.id && o.status === 'active'));
  ok('manual gift moves gp lord → vassal (same core as the monthly pass)', treasuryGp(c,'dom-lord') === lordBefore - realmF && treasuryGp(c,'dom-vassal') === vassBefore + realmF);
  ok('manual edict emits a favor-duty event', c.eventLog.some(e => e.event && e.event.kind === 'favor-duty'));
}
{
  // Demand a duty (call-to-arms) by kind — realm-families gp basis, no over-demand yet.
  const c = mkCampaign();
  const realmF = ACKS.realmFamiliesForDomain(c, c.domains.find(d=>d.id==='dom-vassal'));
  const d = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'call-to-arms' }, { rng: scriptedRng([]) });
  ok('demand duty by kind → duty obligation (isFavor false)', !!d && d.obligation.kind === 'call-to-arms' && d.obligation.isFavor === false);
  ok('call-to-arms gpPerMonth = 1gp × realm families', d.obligation.gpPerMonth === realmF);
  ok('a single duty (no prior) does not over-demand → no Loyalty roll', d.loyaltyResult === null && d.balance.excess === 0);
}
{
  // Manual demand that OVER-demands → fires the Loyalty roll through the shared core.
  const c = mkCampaign({ vassalLoyalty: 0 });
  ACKS.createFavorDutyObligation(c, { liegeCharacterId:'chr-lord', vassalDomainId:'dom-vassal', vassalRulerCharacterId:'chr-vassal', kind:'loan', isFavor:false, isOngoing:true, gpPerMonth:0, grantedAtTurn:1 });
  // demand a 2nd duty → excess 1 → roll at modifier 0; 2d6 = 3+3 → grudging, delta −1 (loyalty 0 → −1)
  const d = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'call-to-council' }, { rng: scriptedRng([ d6Val(3), d6Val(3) ]) });
  ok('manual over-demand fires the excess-duty Loyalty roll', !!d.loyaltyResult && d.balance.excess === 1 && d.balance.loyaltyModifier === 0);
  ok('the vassal ruler loyalty changed per the roll band', c.characters.find(x=>x.id==='chr-vassal').loyalty === -1);
}
{
  // The manual path is RAW-core — available even when favor-duty-auto-roll is OFF.
  const c = mkCampaign({ houseRules: { 'favor-duty-auto-roll': { enabled:false } } });
  const g = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'office' }, { rng: scriptedRng([]) });
  ok('manual grant works with auto-roll OFF (manual is always available)', !!g && c.favorDutyObligations.length === 1 && g.obligation.kind === 'office');
}
{
  // Guards: unknown kind, the roll-only revocation, and a domain with no active liege → null.
  const c = mkCampaign();
  ok('unknown kind → null', ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'not-a-kind' }) === null);
  ok('revocation kind (roll-only) → null', ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'revocation' }) === null);
  ok('domain with no active liege → null', ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-lord', kind:'gift' }) === null);
  ok('no obligations created by the rejected calls', c.favorDutyObligations.length === 0);
}
{
  // revokeFavorDutyEdict — revoke + emit; idempotent (no 2nd event).
  const c = mkCampaign();
  const o = ACKS.createFavorDutyObligation(c, { liegeCharacterId:'chr-lord', vassalDomainId:'dom-vassal', kind:'scutage', isFavor:false, isOngoing:true, grantedAtTurn:1 });
  const evBefore = c.eventLog.length;
  const rev = ACKS.revokeFavorDutyEdict(c, o.id, {});
  ok('revokeFavorDutyEdict sets status revoked', rev && rev.status === 'revoked');
  ok('revokeFavorDutyEdict emits one favor-duty event', c.eventLog.length === evBefore + 1 && c.eventLog[c.eventLog.length-1].event.kind === 'favor-duty');
  ok('revoked obligation drops out of the active set', ACKS.activeFavorDutyObligationsFor(c,'chr-lord','dom-vassal').length === 0);
  const evAfter = c.eventLog.length;
  ACKS.revokeFavorDutyEdict(c, o.id, {});  // 2nd call — already revoked
  ok('revokeFavorDutyEdict is idempotent (no 2nd event)', c.eventLog.length === evAfter);
}

// =============================================================================
section('F&D-3 — configurable amounts (RR p.345 "demand less") + custom edict');
// =============================================================================
// schema reflects the custom kind + label
{
  const fdSchema = ACKS.fieldSchemaFor('favorDutyObligation');
  ok('schema kind enum includes "custom"', fdSchema.fields.find(f=>f.name==='kind').enumValues.includes('custom'));
  ok('schema has the customLabel field', fdSchema.fields.some(f=>f.name==='customLabel'));
  ok('blankFavorDutyObligation seeds customLabel ""', ACKS.blankFavorDutyObligation({}).customLabel === '');
}
// Amount override on a standard gp-duty — "a lord may always choose to demand less" (RR p.345).
{
  const c = mkCampaign();
  const realmF = ACKS.realmFamiliesForDomain(c, c.domains.find(d=>d.id==='dom-vassal'));
  const lordBefore = treasuryGp(c,'dom-lord'), vassBefore = treasuryGp(c,'dom-vassal');
  const less = Math.floor(realmF/2);
  const d = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'loan', gpPerMonth: less }, { rng: scriptedRng([]) });
  ok('override: loan stores the reduced gpPerMonth (< RAW max)', d.obligation.gpPerMonth === less && less < realmF);
  ok('override: nothing moves on grant (loan demanded, not yet given)', treasuryGp(c,'dom-vassal') === vassBefore && treasuryGp(c,'dom-lord') === lordBefore);
  ACKS.giveLoanObligation(c, d.obligation.id, {});
  ok('override: giving the loan moves the reduced amount (vassal→lord)', treasuryGp(c,'dom-vassal') === vassBefore - less && treasuryGp(c,'dom-lord') === lordBefore + less);
}
// The override persists to the recurring Phase B billing (after the loan is given).
{
  const c = mkCampaign({ lordCha: 100, turn: 2 });
  const loan = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'loan', gpPerMonth: 100 }, { atTurn: 1, rng: scriptedRng([]) }).obligation;
  ACKS.giveLoanObligation(c, loan.id, { atTurn: 1 });   // funded in month 1
  const lordBefore = treasuryGp(c,'dom-lord'), vassBefore = treasuryGp(c,'dom-vassal');
  ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([ d20Val(9), d6Val(1), d100Val(50) ]) });  // no-op edict + CHA-100 repay
  ok('override persists: Phase B repays exactly the reduced 100gp (lord→vassal) + revokes', treasuryGp(c,'dom-lord') === lordBefore - 100 && treasuryGp(c,'dom-vassal') === vassBefore + 100 && c.favorDutyObligations.find(o=>o.id===loan.id).status === 'revoked');
}
// A no-gp standard kind ignores an override.
{
  const c = mkCampaign();
  const vassBefore = treasuryGp(c,'dom-vassal');
  const d = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'call-to-council', gpPerMonth: 999 }, { rng: scriptedRng([]) });
  ok('override ignored for a no-gp kind (call-to-council stays 0)', d.obligation.gpPerMonth === 0 && treasuryGp(c,'dom-vassal') === vassBefore);
}
// Custom one-time duty (gp) — moves vassal→lord on grant, counts as a duty.
{
  const c = mkCampaign();
  const lordBefore = treasuryGp(c,'dom-lord'), vassBefore = treasuryGp(c,'dom-vassal');
  const d = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'custom', customLabel:'Hostage exchange', isFavor:false, isOngoing:false, gpPerMonth: 250 }, { rng: scriptedRng([]) });
  ok('custom duty: kind="custom" + customLabel stored + isFavor false', d.obligation.kind==='custom' && d.obligation.customLabel==='Hostage exchange' && d.obligation.isFavor===false);
  ok('custom one-time duty moves gp vassal→lord on grant', treasuryGp(c,'dom-vassal')===vassBefore-250 && treasuryGp(c,'dom-lord')===lordBefore+250);
  ok('custom duty counts toward the favor/duty balance', ACKS.favorDutyBalance(c,'chr-lord','dom-vassal').activeDuties === 1);
}
// Custom one-time favor (gp) — moves lord→vassal on grant, raises the safe count.
{
  const c = mkCampaign();
  const lordBefore = treasuryGp(c,'dom-lord'), vassBefore = treasuryGp(c,'dom-vassal');
  ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'custom', customLabel:'Royal pardon', isFavor:true, isOngoing:false, gpPerMonth: 300 }, { rng: scriptedRng([]) });
  ok('custom one-time favor moves gp lord→vassal on grant', treasuryGp(c,'dom-lord')===lordBefore-300 && treasuryGp(c,'dom-vassal')===vassBefore+300);
  ok('custom favor (one-time, this month) raises the safe duty count', ACKS.favorDutyBalance(c,'chr-lord','dom-vassal').safeDutyCount === 2);
}
// Custom ONGOING duty (gp) — no on-grant flow; recurs vassal→lord in Phase B.
{
  const c = mkCampaign();
  const vassBefore = treasuryGp(c,'dom-vassal'), lordBefore = treasuryGp(c,'dom-lord');
  const d = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'custom', customLabel:'War levy', isFavor:false, isOngoing:true, gpPerMonth: 120 }, { rng: scriptedRng([]) });
  ok('custom ongoing edict does NOT move gp on grant (recurs in Phase B)', treasuryGp(c,'dom-vassal')===vassBefore && treasuryGp(c,'dom-lord')===lordBefore && d.obligation.isOngoing===true);
  ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([ d20Val(9), d6Val(1) ]) });  // no-op edict; Phase B bills the custom duty
  ok('custom ongoing duty recurs vassal→lord on the monthly turn', treasuryGp(c,'dom-vassal')===vassBefore-120 && treasuryGp(c,'dom-lord')===lordBefore+120);
}
// Custom ONGOING favor (gp) — recurs lord→vassal in Phase B.
{
  const c = mkCampaign();
  const vassBefore = treasuryGp(c,'dom-vassal'), lordBefore = treasuryGp(c,'dom-lord');
  ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'custom', customLabel:'Stipend', isFavor:true, isOngoing:true, gpPerMonth: 80 }, { rng: scriptedRng([]) });
  ok('custom ongoing favor: no on-grant move', treasuryGp(c,'dom-vassal')===vassBefore);
  ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([ d20Val(9), d6Val(2) ]) });  // no-op edict (revoke a duty, none); Phase B bills the custom favor
  ok('custom ongoing favor recurs lord→vassal on the monthly turn', treasuryGp(c,'dom-lord')===lordBefore-80 && treasuryGp(c,'dom-vassal')===vassBefore+80);
}
// Custom edict with no gp — pure record; still counts toward the balance.
{
  const c = mkCampaign();
  const vassBefore = treasuryGp(c,'dom-vassal');
  const d = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'custom', customLabel:'Attend the wedding', isFavor:false, isOngoing:false }, { rng: scriptedRng([]) });
  ok('custom edict with no gp: record only, no flow', d.obligation.gpPerMonth===0 && treasuryGp(c,'dom-vassal')===vassBefore);
  ok('no-gp custom edict still counts toward the balance', ACKS.favorDutyBalance(c,'chr-lord','dom-vassal').activeDuties===1);
}
// Blank label falls back to a default; custom revokes like any other.
{
  const c = mkCampaign();
  const d = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'custom', isFavor:true, isOngoing:false }, { rng: scriptedRng([]) });
  ok('blank custom label → falls back to "Custom favor"', d.obligation.customLabel==='Custom favor' && /Custom favor/.test(d.narrative));
  const o = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'custom', customLabel:'Recurring tithe', isFavor:false, isOngoing:true, gpPerMonth:50 }, { rng: scriptedRng([]) }).obligation;
  ACKS.revokeFavorDutyEdict(c, o.id, {});
  ok('a custom obligation revokes like any other', c.favorDutyObligations.find(x=>x.id===o.id).status==='revoked');
}
// Recurring billing (Phase B) runs even with auto-roll OFF — the toggle gates only the auto-roll of
// NEW edicts (Phase A), not the billing of obligations already in force (hand-authored or rolled).
{
  const c = mkCampaign({ houseRules: { 'favor-duty-auto-roll': { enabled:false } } });
  ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'custom', customLabel:'Levy', isFavor:false, isOngoing:true, gpPerMonth: 60 }, { rng: scriptedRng([]) });  // manual works regardless of the toggle
  const vassBefore = treasuryGp(c,'dom-vassal'), lordBefore = treasuryGp(c,'dom-lord');
  const r = ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([]) });
  ok('auto-roll OFF → no new edict rolled (Phase A skipped, ruleOn false)', r.ruleOn===false && r.rolled.length===0);
  ok('auto-roll OFF → an existing custom recurring duty STILL bills (Phase B always runs)', treasuryGp(c,'dom-vassal')===vassBefore-60 && treasuryGp(c,'dom-lord')===lordBefore+60);
}

// =============================================================================
section('F&D-4 — Loan give/repay lifecycle (RR p.348): demand → give → repay');
// =============================================================================
// Schema + factory carry the loanGivenAtTurn lifecycle field.
{
  ok('blankFavorDutyObligation seeds loanGivenAtTurn null', ACKS.blankFavorDutyObligation({}).loanGivenAtTurn === null);
  const fdSchema = ACKS.fieldSchemaFor('favorDutyObligation');
  ok('schema has the loanGivenAtTurn field', fdSchema.fields.some(f=>f.name==='loanGivenAtTurn'));
}
// Demand → ungiven → give: the vassal-side act moves the principal (vassal → lord), once.
{
  const c = mkCampaign();
  const realmF = ACKS.realmFamiliesForDomain(c, c.domains.find(d=>d.id==='dom-vassal'));
  const lordBefore = treasuryGp(c,'dom-lord'), vassBefore = treasuryGp(c,'dom-vassal');
  const d = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'loan' }, { rng: scriptedRng([]) });
  ok('demanded loan: ungiven + no gp moved', d.obligation.loanGivenAtTurn == null && treasuryGp(c,'dom-vassal') === vassBefore && treasuryGp(c,'dom-lord') === lordBefore);
  const evBefore = c.eventLog.length;
  const r = ACKS.giveLoanObligation(c, d.obligation.id, {});
  ok('giveLoanObligation moves the principal vassal → lord', treasuryGp(c,'dom-vassal') === vassBefore - realmF && treasuryGp(c,'dom-lord') === lordBefore + realmF);
  ok('give stamps loanGivenAtTurn + a loan-given history entry', r.loanGivenAtTurn === (c.currentTurn||1) && r.history.some(h=>h.type==='loan-given'));
  ok('give emits a favor-duty event with action loan-given', c.eventLog.length === evBefore + 1 && c.eventLog[c.eventLog.length-1].event.payload.action === 'loan-given');
  // Idempotent — a 2nd give moves nothing more.
  const lordMid = treasuryGp(c,'dom-lord'), vassMid = treasuryGp(c,'dom-vassal');
  ACKS.giveLoanObligation(c, d.obligation.id, {});
  ok('giveLoanObligation is idempotent (no 2nd transfer)', treasuryGp(c,'dom-lord') === lordMid && treasuryGp(c,'dom-vassal') === vassMid);
}
// Guards: a non-loan / inactive / unknown obligation is a guarded no-op.
{
  const c = mkCampaign();
  const vassBefore = treasuryGp(c,'dom-vassal');
  const scu = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'scutage' }, { rng: scriptedRng([]) }).obligation;
  ACKS.giveLoanObligation(c, scu.id, {});
  ok('giveLoanObligation on a non-loan is a no-op (no loanGivenAtTurn)', scu.loanGivenAtTurn == null);
  ok('giveLoanObligation on an unknown id → null', ACKS.giveLoanObligation(c, 'fdo-nope', {}) === null);
}
// Revoke repays a GIVEN loan (lord → vassal); revoking an ungiven loan moves nothing.
{
  const c = mkCampaign();
  const realmF = ACKS.realmFamiliesForDomain(c, c.domains.find(d=>d.id==='dom-vassal'));
  const given = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'loan' }, { rng: scriptedRng([]) }).obligation;
  ACKS.giveLoanObligation(c, given.id, {});
  const lordBefore = treasuryGp(c,'dom-lord'), vassBefore = treasuryGp(c,'dom-vassal');
  ACKS.revokeFavorDutyEdict(c, given.id, {});
  ok('revoking a given loan repays the principal (lord → vassal) + revokes', treasuryGp(c,'dom-lord') === lordBefore - realmF && treasuryGp(c,'dom-vassal') === vassBefore + realmF && c.favorDutyObligations.find(o=>o.id===given.id).status === 'revoked');

  const ungiven = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'loan' }, { rng: scriptedRng([]) }).obligation;
  const lord2 = treasuryGp(c,'dom-lord'), vass2 = treasuryGp(c,'dom-vassal');
  ACKS.revokeFavorDutyEdict(c, ungiven.id, {});
  ok('revoking an UNGIVEN loan moves no gp (nothing to repay) + revokes', treasuryGp(c,'dom-lord') === lord2 && treasuryGp(c,'dom-vassal') === vass2 && c.favorDutyObligations.find(o=>o.id===ungiven.id).status === 'revoked');
}
// The monthly CHA% repayment keys off GIVEN — an ungiven loan is never repaid by Phase B.
{
  const c = mkCampaign({ lordCha: 100, turn: 2 });
  const loan = ACKS.createFavorDutyObligation(c, { liegeCharacterId:'chr-lord', vassalDomainId:'dom-vassal', vassalRulerCharacterId:'chr-vassal', kind:'loan', isFavor:false, isOngoing:true, gpPerMonth:500, grantedAtTurn:1 });  // never given
  const lordBefore = treasuryGp(c,'dom-lord'), vassBefore = treasuryGp(c,'dom-vassal');
  ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([ d20Val(9), d6Val(1) ]) });  // no-op edict; Phase B should skip the ungiven loan
  ok('Phase B does NOT repay an ungiven loan even at CHA 100%', treasuryGp(c,'dom-lord') === lordBefore && treasuryGp(c,'dom-vassal') === vassBefore && c.favorDutyObligations.find(o=>o.id===loan.id).status === 'active');
}
// The 1d20 9–12 table-revocation of a GIVEN loan repays it too (same RAW rule as a manual revoke).
{
  const c = mkCampaign({ turn: 2 });
  const loan = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'loan' }, { atTurn: 1, rng: scriptedRng([]) }).obligation;
  ACKS.giveLoanObligation(c, loan.id, { atTurn: 1 });
  const lordBefore = treasuryGp(c,'dom-lord'), vassBefore = treasuryGp(c,'dom-vassal');
  // month-2: force roll 10 (revocation) + subRoll 3 (2–6 → revoke a duty) → revokes the loan in Phase A (+ repays).
  const r = ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([ d20Val(10), d6Val(3) ]) });
  ok('table-revocation revoked the given loan', c.favorDutyObligations.find(o=>o.id===loan.id).status === 'revoked');
  ok('table-revocation of a given loan repaid the principal (lord → vassal)', treasuryGp(c,'dom-lord') === lordBefore - loan.gpPerMonth && treasuryGp(c,'dom-vassal') === vassBefore + loan.gpPerMonth);
}

// =============================================================================
section('F&D-5 — Call to Council: location + Go-to-Council journey + attendance (RR p.346)');
// =============================================================================
// A campaign with a council hex in the lord's domain + the vassal standing elsewhere.
function mkCouncil(opts){
  const c = mkCampaign(opts);
  c.hexes.push({ id:'hex-court', domainId:'dom-lord',   coord:{ q:1, r:0 } });  // the lord's seat (council)
  c.hexes.push({ id:'hex-far',   domainId:'dom-vassal', coord:{ q:4, r:0 } });  // where the vassal starts
  c.characters.find(x=>x.id==='chr-lord').currentHexId   = 'hex-court';
  c.characters.find(x=>x.id==='chr-vassal').currentHexId = 'hex-far';
  return c;
}
// Default location = where the lord is now (the liege ruler's current hex).
{
  const c = mkCouncil();
  const d = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'call-to-council' }, { rng: scriptedRng([]) });
  ok('call-to-council default location = the liege ruler current hex', d.obligation.councilHexId === 'hex-court');
}
// Explicit location override.
{
  const c = mkCouncil();
  c.hexes.push({ id:'hex-keep', domainId:'dom-lord', coord:{ q:2, r:0 } });
  const d = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'call-to-council', councilHexId:'hex-keep' }, { rng: scriptedRng([]) });
  ok('explicit councilHexId is stored', d.obligation.councilHexId === 'hex-keep');
}
// Auto-rolled call-to-council also gets the default location.
{
  const c = mkCouncil();
  ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([ d20Val(3) ]) });  // roll 3 = call-to-council
  const o = c.favorDutyObligations.find(x=>x.kind==='call-to-council');
  ok('auto-rolled call-to-council defaults the council location', !!o && o.councilHexId === 'hex-court');
}
// sendVassalToCouncil plots a new journey from the vassal's hex to the council hex.
{
  const c = mkCouncil();
  const o = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'call-to-council' }, { rng: scriptedRng([]) }).obligation;
  const r = ACKS.sendVassalToCouncil(c, o.id, {});
  ok('sendVassalToCouncil started a new journey', r.action === 'started' && !!r.journey);
  ok('the journey runs from the vassal hex to the council hex', r.journey.startHexId === 'hex-far' && r.journey.destinationHexId === 'hex-court');
  ok('the vassal ruler is on the journey', c.characters.find(x=>x.id==='chr-vassal').currentJourneyId === r.journey.id);
}
// Attendance: away → en-route (after Go to Council) → at-council (on arrival at the hex).
{
  const c = mkCouncil();
  const o = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'call-to-council' }, { rng: scriptedRng([]) }).obligation;
  ok('before travel: status away', ACKS.councilAttendanceStatus(c, o).status === 'away');
  ACKS.sendVassalToCouncil(c, o.id, {});
  ok('after Go to Council: status en-route', ACKS.councilAttendanceStatus(c, o).status === 'en-route');
  c.characters.find(x=>x.id==='chr-vassal').currentHexId = 'hex-court';   // simulate arrival
  ok('at the council hex: status at-council', ACKS.councilAttendanceStatus(c, o).status === 'at-council');
}
// Already there → no journey is plotted.
{
  const c = mkCouncil();
  c.characters.find(x=>x.id==='chr-vassal').currentHexId = 'hex-court';
  const o = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'call-to-council' }, { rng: scriptedRng([]) }).obligation;
  const r = ACKS.sendVassalToCouncil(c, o.id, {});
  ok('already at the council hex → already-there, no journey', r.action === 'already-there' && (c.journeys||[]).length === 0);
}
// Party-aware: the whole party travels.
{
  const c = mkCouncil();
  const mate = ACKS.blankCharacter({ id:'chr-mate', name:'Retainer' }); mate.currentHexId = 'hex-far'; mate.partyId = 'pty-1';
  c.characters.push(mate);
  c.characters.find(x=>x.id==='chr-vassal').partyId = 'pty-1';
  c.parties = [{ id:'pty-1', name:'Vassal party', currentHexId:'hex-far', activeJourneyId:null }];
  const o = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'call-to-council' }, { rng: scriptedRng([]) }).obligation;
  const r = ACKS.sendVassalToCouncil(c, o.id, {});
  ok('party council trip: journey carries the partyId', r.action === 'started' && r.journey.partyId === 'pty-1');
  ok('party council trip: both members travel', r.journey.participantCharacterIds.includes('chr-vassal') && r.journey.participantCharacterIds.includes('chr-mate'));
}
// Re-route an existing journey instead of plotting a second one.
{
  const c = mkCouncil();
  c.hexes.push({ id:'hex-elsewhere', domainId:'dom-vassal', coord:{ q:6, r:0 } });
  const j = ACKS.blankJourney({ name:'Errand', participantCharacterIds:['chr-vassal'], startHexId:'hex-far', destinationHexId:'hex-elsewhere', mode:'foot', pace:'normal' });
  c.journeys = [j]; ACKS.startJourney(c, j);
  const o = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'call-to-council' }, { rng: scriptedRng([]) }).obligation;
  const r = ACKS.sendVassalToCouncil(c, o.id, {});
  ok('existing journey re-routed (no 2nd journey)', r.action === 'rerouted' && (c.journeys||[]).length === 1);
  ok('the journey destination is now the council hex', c.journeys[0].destinationHexId === 'hex-court');
}
// No origin hex on the vassal → guarded.
{
  const c = mkCouncil();
  c.characters.find(x=>x.id==='chr-vassal').currentHexId = null;
  const o = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'call-to-council' }, { rng: scriptedRng([]) }).obligation;
  const r = ACKS.sendVassalToCouncil(c, o.id, {});
  ok('no vassal origin hex → no-origin (no journey)', r.action === 'no-origin' && (c.journeys||[]).length === 0);
}
// Non-council obligation → not-applicable; attendance kind 'other'.
{
  const c = mkCouncil();
  const o = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'scutage' }, { rng: scriptedRng([]) }).obligation;
  ok('sendVassalToCouncil on a non-council → not-applicable', ACKS.sendVassalToCouncil(c, o.id, {}).action === 'not-applicable');
  ok('councilAttendanceStatus on a non-council → kind other', ACKS.councilAttendanceStatus(c, o).kind === 'other');
}
// Schema + factory.
{
  ok('blankFavorDutyObligation seeds councilHexId null', ACKS.blankFavorDutyObligation({}).councilHexId === null);
  const fdSchema = ACKS.fieldSchemaFor('favorDutyObligation');
  ok('schema has the councilHexId field', fdSchema.fields.some(f=>f.name==='councilHexId'));
}

// =============================================================================
section('F&D-6 — scutage as garrison expense + collection + misappropriation (RR pp.347–348)');
// =============================================================================
// expenseBreakdown: scutage shows as the vassal's garrison expense when paid; withheld (gp 0) when not.
{
  const c = mkCampaign({ houseRules:{ 'favor-duty-auto-roll':{ enabled:false } } });
  const scu = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'scutage' }, { rng: scriptedRng([]) }).obligation;
  const vassalD = () => c.domains.find(d=>d.id==='dom-vassal');
  const unpaidRows = ACKS.expenseBreakdown(c, vassalD());
  ok('unpaid scutage → NOT PAID row (gp 0) in expenseBreakdown', unpaidRows.some(r => /Scutage/.test(r.label) && /NOT PAID/.test(r.label) && r.gp === 0));
  ok('unpaid scutage → scutagePaidThisMonth is 0', ACKS.scutagePaidThisMonth(c, vassalD()) === 0);
  ACKS.payScutageObligation(c, scu.id, {});
  const paidRows = ACKS.expenseBreakdown(c, vassalD());
  ok('paid scutage → garrison expense row (gp = amount)', paidRows.some(r => /Scutage/.test(r.label) && /counts as garrison/.test(r.label) && r.gp === scu.gpPerMonth));
  ok('scutagePaidThisMonth sums paid scutage', ACKS.scutagePaidThisMonth(c, vassalD()) === scu.gpPerMonth);
  // Garrison adequacy (RR p.347 — "counts as garrison expense for the vassal"): scutage lifts gpf.
  const mods = ACKS.moraleModifiersFor(c, vassalD());
  // With 500 families + 500gp scutage, gpf=1; reqRate=2 → still a (smaller) penalty, but scutage is counted:
  // compare to a no-scutage twin where gpf=0.
  const twin = mkCampaign({ houseRules:{ 'favor-duty-auto-roll':{ enabled:false } } });
  const penaltyOf = camp => { const m = ACKS.moraleModifiersFor(camp, camp.domains.find(d=>d.id==='dom-vassal')).find(x=>/Garrison below required/.test(x.label)); return m ? m.value : 0; };
  ok('scutage counts toward garrison adequacy (smaller penalty than the no-scutage twin)', penaltyOf(c) > penaltyOf(twin));
}
// The settlement is a single balanced move: paying scutage lowers the vassal's monthly NET by exactly
// the scutage (it bills as a garrison expense — monthlyNet feeds the vassal debit at the monthly turn),
// and Phase B credits the lord the same amount (no double-debit). (Full commitTurn is exercised by the
// demo integration test above; the minimal campaign isn't commitTurn-complete by design.)
{
  const c = mkCampaign({ houseRules:{ 'favor-duty-auto-roll':{ enabled:false } } });
  const vd = c.domains.find(d=>d.id==='dom-vassal');
  const scu = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'scutage' }, { rng: scriptedRng([]) }).obligation;
  const netUnpaid = ACKS.monthlyNet(c, vd);
  ACKS.payScutageObligation(c, scu.id, {});
  const netPaid = ACKS.monthlyNet(c, vd);
  ok('paying scutage lowers the vassal monthly net by exactly the scutage (garrison expense)', netPaid === netUnpaid - scu.gpPerMonth);
  const lordBefore = treasuryGp(c,'dom-lord');
  ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([]) });
  ok('the lord is credited the same scutage amount (balanced move, no double-debit)', treasuryGp(c,'dom-lord') === lordBefore + scu.gpPerMonth);
}
// Misappropriation (RR p.348) — a lord who does not out-spend the scutage he collects on troops
// provokes his scutage-paying vassals' Henchman Loyalty rolls at -4.
{
  const c = mkCampaign({ houseRules:{ 'favor-duty-auto-roll':{ enabled:false } } });  // lord has no garrison → spends 0 on troops
  const scu = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'scutage' }, { rng: scriptedRng([]) }).obligation;
  ACKS.payScutageObligation(c, scu.id, {});
  const res = ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([]) });
  ok('lord spends 0 on troops → scutage misappropriated (loyalty roll at -4 fired)', res.loyaltyRolls.some(r => r.reason==='scutage-misappropriated' && r.modifier===-4 && r.vassalDomainId==='dom-vassal'));
  ok('the vassal ruler got a scutage-misappropriated loyaltyHistory entry', (c.characters.find(ch=>ch.id==='chr-vassal').loyaltyHistory||[]).some(h => h.reason==='scutage-misappropriated'));
}
{
  const c = mkCampaign({ houseRules:{ 'favor-duty-auto-roll':{ enabled:false } } });
  c.domains.find(d=>d.id==='dom-lord').garrison = { units:[{ id:'gu-l', count:10000, monthlyWage:1, brPerSoldier:0 }] }; // 10,000gp troops ≫ 500gp scutage
  const scu = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'scutage' }, { rng: scriptedRng([]) }).obligation;
  ACKS.payScutageObligation(c, scu.id, {});
  const res = ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([]) });
  ok('lord out-spends scutage on troops → no misappropriation roll', !res.loyaltyRolls.some(r => r.reason==='scutage-misappropriated'));
}
// Scutage is a per-family RATE that tracks population (RR p.347 — "1gp per family in the vassal's realm").
{
  const c = mkCampaign({ vassalFamilies: 500, houseRules:{ 'favor-duty-auto-roll':{ enabled:false } } });
  const vd = () => c.domains.find(d=>d.id==='dom-vassal');
  const scu = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'scutage' }, { rng: scriptedRng([]) }).obligation;
  ok('scutage stores the default rate (1gp/family)', scu.scutageGpPerFamily === 1);
  ok('scutageMonthlyGp = rate × realm families (500)', ACKS.scutageMonthlyGp(c, scu) === 500);
  ok('gpPerMonth snapshot = the demand-month amount (500)', scu.gpPerMonth === 500);
  // Population GROWS → the live amount tracks it (the stored snapshot does not).
  vd().demographics.peasantFamilies = 800;
  ok('families grow → scutageMonthlyGp recomputes UP (800)', ACKS.scutageMonthlyGp(c, scu) === 800);
  ok('the stored gpPerMonth snapshot is unchanged (500)', scu.gpPerMonth === 500);
  ACKS.payScutageObligation(c, scu.id, {});
  const row = ACKS.expenseBreakdown(c, vd()).find(r => /Scutage/.test(r.label) && /counts as garrison/.test(r.label));
  ok('the garrison-expense row bills the LIVE grown amount (800)', row && row.gp === 800);
  ok('scutagePaidThisMonth bills the LIVE grown amount (800)', ACKS.scutagePaidThisMonth(c, vd()) === 800);
  const lordBefore = treasuryGp(c,'dom-lord');
  ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([]) });
  ok('the lord is credited the LIVE grown amount (800)', treasuryGp(c,'dom-lord') === lordBefore + 800);
  // Population SHRINKS → tracks down too.
  vd().demographics.peasantFamilies = 300;
  ok('families shrink → scutageMonthlyGp recomputes DOWN (300)', ACKS.scutageMonthlyGp(c, scu) === 300);
}
// "Demand less" is now a lower per-family RATE (RR p.345); a legacy total override converts to a rate.
{
  const c = mkCampaign({ vassalFamilies: 400, houseRules:{ 'favor-duty-auto-roll':{ enabled:false } } });
  const half = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'scutage', scutageGpPerFamily: 0.5 }, { rng: scriptedRng([]) }).obligation;
  ok('rate override stored (0.5gp/family)', half.scutageGpPerFamily === 0.5);
  ok('scutageMonthlyGp = round(0.5 × 400) = 200', ACKS.scutageMonthlyGp(c, half) === 200);
  ACKS.revokeFavorDutyEdict(c, half.id, {});
  // a legacy total override (gpPerMonth) → converts to an equivalent per-family rate at demand time
  const legacy = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'scutage', gpPerMonth: 200 }, { rng: scriptedRng([]) }).obligation;
  ok('legacy total override converts to a rate (200/400 = 0.5)', Math.abs(legacy.scutageGpPerFamily - 0.5) < 1e-9);
  ok('legacy-rate scutageMonthlyGp = 200 at demand', ACKS.scutageMonthlyGp(c, legacy) === 200);
  // and that converted rate then TRACKS population (the point of the rework)
  c.domains.find(d=>d.id==='dom-vassal').demographics.peasantFamilies = 600;
  ok('converted rate tracks population (0.5 × 600 = 300)', ACKS.scutageMonthlyGp(c, legacy) === 300);
}

// =============================================================================
section('F&D-7 — Construction duty: liege-side orders (hex + type) + target + progress (RR p.348)');
// =============================================================================
// A vassal realm with 3 hexes (hex-b borders a water hex → littoral) + a non-realm sea hex.
function mkConstruction(){
  const c = mkCampaign({ vassalFamilies: 300, houseRules:{ 'favor-duty-auto-roll':{ enabled:false } } });
  c.hexes = [
    { id:'hex-a', domainId:'dom-vassal', coord:{ q:0, r:0 }, terrain:'grassland' },
    { id:'hex-b', domainId:'dom-vassal', coord:{ q:1, r:0 }, terrain:'hills' },   // borders the sea
    { id:'hex-c', domainId:'dom-vassal', coord:{ q:5, r:5 }, terrain:'forest' },  // inland
    { id:'hex-sea', domainId:null, coord:{ q:2, r:0 }, terrain:'water' }          // not in the realm
  ];
  c.domains.find(d=>d.id==='dom-vassal').geography.hexes = c.hexes.filter(h=>h.domainId==='dom-vassal');
  return c;
}
ok('CONSTRUCTION_DUTY_TYPES = 6 types, vessel is littoralOnly', ACKS.CONSTRUCTION_DUTY_TYPES.length===6 && ACKS.CONSTRUCTION_DUTY_TYPES.find(t=>t.value==='vessel').littoralOnly===true);
{
  const c = mkConstruction();
  const vd = c.domains.find(d=>d.id==='dom-vassal');
  ok('isLittoralDomain true (hex-b borders the sea)', ACKS.isLittoralDomain(c, vd) === true);
  ok('vessel allowed on a littoral realm', ACKS.constructionDutyTypeAllowed(c, vd, 'vessel') === true);
  ok('fort allowed (non-littoral type)', ACKS.constructionDutyTypeAllowed(c, vd, 'fort') === true);
  const con = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'construction' }, { rng: scriptedRng([]) }).obligation;
  ok('construction created with empty orders', con.kind==='construction' && Array.isArray(con.constructionOrders) && con.constructionOrders.length===0);
  ok('no orders → target = realm-cap (3 hexes × 15,000 = 45,000)', ACKS.constructionDutyTargetGp(c, con) === 45000);
  ACKS.addConstructionOrder(c, con.id, { hexId:'hex-a', type:'fort' });
  ok('1 order → target 15,000', ACKS.constructionDutyTargetGp(c, con) === 15000);
  ACKS.addConstructionOrder(c, con.id, { hexId:'hex-b', type:'tower' });
  ok('2nd order in a new hex → target 30,000', ACKS.constructionDutyTargetGp(c, con) === 30000);
  ACKS.addConstructionOrder(c, con.id, { hexId:'hex-a', type:'road' });
  ok('3rd order in the SAME hex → target unchanged 30,000, 3 orders', ACKS.constructionDutyTargetGp(c, con)===30000 && con.constructionOrders.length===3);
  ACKS.addConstructionOrder(c, con.id, { hexId:'hex-a', type:'fort' });
  ok('duplicate (hex-a fort) skipped', con.constructionOrders.length===3);
  ACKS.addConstructionOrder(c, con.id, { hexId:'hex-sea', type:'fort' });
  ok('order in a non-realm hex rejected', con.constructionOrders.length===3);
  const p = ACKS.constructionDutyProgress(c, con);
  ok('progress: spent 0 / target 30,000 / remaining 30,000', p.spent===0 && p.target===30000 && p.remaining===30000);
  ok('progress: monthlyMinimum = tribute, minimum not met, target not reached', p.monthlyMinimum > 0 && p.minimumMet===false && p.targetReached===false);
  ok('progress orders carry type labels (Fort)', p.orders.length===3 && p.orders[0].typeLabel==='Fort');
  ACKS.removeConstructionOrder(c, con.id, 1);   // removes the hex-b tower
  ok('remove order → target back to 15,000 (only hex-a remains)', ACKS.constructionDutyTargetGp(c, con)===15000 && con.constructionOrders.length===2);
}
{
  // Landlocked realm → vessel not allowed.
  const c = mkConstruction();
  c.hexes = c.hexes.filter(h => h.id !== 'hex-sea');
  const vd = c.domains.find(d=>d.id==='dom-vassal');
  ok('isLittoralDomain false (no water)', ACKS.isLittoralDomain(c, vd) === false);
  ok('vessel NOT allowed on a landlocked realm', ACKS.constructionDutyTypeAllowed(c, vd, 'vessel') === false);
  const con = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'construction' }, { rng: scriptedRng([]) }).obligation;
  ACKS.addConstructionOrder(c, con.id, { hexId:'hex-a', type:'vessel' });
  ok('a vessel order is rejected on a landlocked realm', con.constructionOrders.length===0);
}
{
  // Phase B auto-revokes at the ORDERED target (1 order → 15,000), not the realm-wide cap.
  const c = mkConstruction();
  c.domains.find(d=>d.id==='dom-vassal').treasury = { gp: 1000000 };
  const con = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'construction' }, { rng: scriptedRng([]) }).obligation;
  ACKS.addConstructionOrder(c, con.id, { hexId:'hex-a', type:'fort' });   // target 15,000
  ok('the monthly self-spend (tribute) is positive', con.gpPerMonth > 0);
  let months = 0;
  while(c.favorDutyObligations.find(o=>o.id===con.id).status==='active' && months < 300){ c.currentTurn = months+1; ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([]) }); months++; }
  const after = c.favorDutyObligations.find(o=>o.id===con.id);
  ok('construction auto-revokes once the ordered 15,000 target is reached', after.status==='revoked');
  ok('total spent ≥ the 15,000 ordered target', after.constructionSpentGp >= 15000);
}

// Schema + factory.
{
  ok('blankFavorDutyObligation seeds scutageAutoPay false', ACKS.blankFavorDutyObligation({}).scutageAutoPay === false);
  ok('blankFavorDutyObligation seeds scutageLastPaidTurn null', ACKS.blankFavorDutyObligation({}).scutageLastPaidTurn === null);
  ok('blankFavorDutyObligation seeds scutageGpPerFamily null', ACKS.blankFavorDutyObligation({}).scutageGpPerFamily === null);
  ok('scutageMonthlyGp on a non-scutage falls back to gpPerMonth', ACKS.scutageMonthlyGp(mkCampaign(), ACKS.blankFavorDutyObligation({ kind:'gift', gpPerMonth: 77 })) === 77);
  const fdSchema = ACKS.fieldSchemaFor('favorDutyObligation');
  ok('schema has the scutageAutoPay field', fdSchema.fields.some(f=>f.name==='scutageAutoPay'));
  ok('schema has the scutageLastPaidTurn field', fdSchema.fields.some(f=>f.name==='scutageLastPaidTurn'));
  ok('schema has the scutageGpPerFamily field', fdSchema.fields.some(f=>f.name==='scutageGpPerFamily'));
  ok('blankFavorDutyObligation seeds constructionOrders []', Array.isArray(ACKS.blankFavorDutyObligation({}).constructionOrders) && ACKS.blankFavorDutyObligation({}).constructionOrders.length===0);
  ok('schema has the constructionOrders array field', fdSchema.fields.some(f=>f.name==='constructionOrders' && f.type==='array'));
}

console.log('\n=============================================');
console.log('favors-and-duties.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail > 0){ console.log('\nFAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
