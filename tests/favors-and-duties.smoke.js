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
  // Loan (roll 7): principal moves vassal → lord, once, on grant.
  const c = mkCampaign();
  const lordBefore = treasuryGp(c,'dom-lord'), vassBefore = treasuryGp(c,'dom-vassal');
  ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([ d20Val(7) ]) });
  const loan = c.favorDutyObligations.find(o => o.kind==='loan');
  ok('loan obligation created with gpPerMonth = 1gp × realm families', !!loan && loan.gpPerMonth === ACKS.realmFamiliesForDomain(c, c.domains.find(d=>d.id==='dom-vassal')));
  ok('loan principal moved vassal → lord (vassal −X, lord +X)', treasuryGp(c,'dom-vassal') === vassBefore - loan.gpPerMonth && treasuryGp(c,'dom-lord') === lordBefore + loan.gpPerMonth);
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
  // Scutage (roll 2): recurs every month (vassal → lord), including the grant month.
  const c = mkCampaign();
  const vassStart = treasuryGp(c,'dom-vassal');
  ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([ d20Val(2) ]) });  // month 1: create scutage + 1st payment
  const scutage = c.favorDutyObligations.find(o => o.kind==='scutage');
  ok('scutage created (recurring duty)', !!scutage && scutage.isOngoing === true);
  ok('scutage 1st installment paid in the grant month (vassal −X)', treasuryGp(c,'dom-vassal') === vassStart - scutage.gpPerMonth);
  // month 2: roll a revocation-of-a-favor (none present) so no new duty is added; scutage recurs.
  c.currentTurn = 2;
  ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([ d20Val(9), d6Val(1) ]) });
  ok('scutage recurs in month 2 (vassal −2X total)', treasuryGp(c,'dom-vassal') === vassStart - 2 * scutage.gpPerMonth);
  ok('scutage is still active (recurs until revoked)', c.favorDutyObligations.find(o => o.kind==='scutage').status === 'active');
}
{
  // Loan repayment: a loan granted in a PRIOR month gets a CHA% repayment check (CHA 100 → always repays).
  const c = mkCampaign({ lordCha: 100, turn: 2 });
  const loan = ACKS.createFavorDutyObligation(c, { liegeCharacterId:'chr-lord', vassalDomainId:'dom-vassal', vassalRulerCharacterId:'chr-vassal', kind:'loan', isFavor:false, isOngoing:true, gpPerMonth:500, grantedAtTurn:1 });
  const lordBefore = treasuryGp(c,'dom-lord'), vassBefore = treasuryGp(c,'dom-vassal');
  // month-2 roll: force a no-op edict (revocation of a non-existent favor), so only Phase B (repayment) acts.
  ACKS.processFavorsAndDutiesForTurn(c, { rng: scriptedRng([ d20Val(9), d6Val(1), d100Val(50) ]) });
  ok('loan repaid at CHA 100% → status revoked', c.favorDutyObligations.find(o=>o.id===loan.id).status === 'revoked');
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
  ok('override: on-grant principal moved the reduced amount (vassal→lord)', treasuryGp(c,'dom-vassal') === vassBefore - less && treasuryGp(c,'dom-lord') === lordBefore + less);
}
// The override persists to the recurring Phase B billing.
{
  const c = mkCampaign({ lordCha: 100, turn: 2 });
  const loan = ACKS.applyFavorDutyEdictByKind(c, { vassalDomainId:'dom-vassal', kind:'loan', gpPerMonth: 100 }, { atTurn: 1, rng: scriptedRng([]) }).obligation;
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

console.log('\n=============================================');
console.log('favors-and-duties.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail > 0){ console.log('\nFAILURES:\n  ' + failures.join('\n  ')); process.exit(1); }
