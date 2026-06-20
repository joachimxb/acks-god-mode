// =============================================================================
// sages.smoke.js — Sages #147, SG-1 + SG-2 (Phase_4_Sages_Plan.md + Sages_Knowledge_RAW_Survey.md).
// SG-2 (burst8 b8-sages) adds the multi-week SageCommission (sag-, campaign.sageCommissions[]; §3.3):
// a work-in-progress research entity advanced on the SHIPPED day-tick (slot 64, the Construction-
// Project propose-review-commit pattern) and resolved on the SAME Layer-1 die (REUSES sageConsult-
// Resolve). Covers: the entity/prefix/registry/field-schema/event registrations + the slot-64
// consumer; blankSageCommission + sageCommissionProgress (derive daysElapsed off startedAtOrd — no
// drift); commissionSage (pre-rolled throw, GP-Wave-B fee + child, npc/pc paths, secret, guards,
// insufficient-funds abort); the day-tick consumer (direct + via the real orchestrator — completion,
// the resolved event + §528 envelope, idempotency, failed-research-no-answer); abandonSageCommission;
// and the migrate-no-op invariant (blankCampaign SEEDS the collection, migrate does NOT inject it).
// =============================================================================
// sages.smoke.js — Sages #147, SG-1 (Phase_4_Sages_Plan.md + Sages_Knowledge_RAW_Survey.md).
// A sage consultation is an EVENT (`sage-consultation`), NOT an entity — a thin service over the
// shipped Proficiency-Throws Layer-1 die (RR p.171 in-specialty 3+ / out 18+; RR p.112/p.110 the
// PC-as-sage Knowledge/Loremastery throw), GP Wave B (the fee), the §528 envelope, and #346 (the
// activityCost day tag). Covers: exports + event-kind registration (known, wizard opt-out, schema);
// isSage / subjectInSpecialty; sageConsultResolve + sageConsultForecast (npc-specialist in/out,
// pc-scholar Knowledge by rank + Loremastery by level, overrides, not-a-sage); consultSage end-to-
// end (throw resolution, the §528 context envelope, the narrative, day-stamping + activityCost,
// the GP-Wave-B fee child under the parent, insufficient-funds abort, fee 0, self-consult, secret,
// guards); and the team-session migrate-no-op invariant (no collection inject, no blankCharacter
// field, no applyEvent handler — record-only).
// =============================================================================
const path = require('path');
global.window = global;
require('./_engine.js').load();
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('\n--- ' + t + ' ---'); }
const rng = v => () => v;   // deterministic d20: natural = 1 + floor(v*20). 0->1, .1->3, .3->7, .5->11, .85->18, .95->20

function camp(chars){ return { schemaVersion:2, currentTurn:1, currentDayInMonth:1, characters:(chars||[]), eventLog:[] }; }
function scholar(over){ return Object.assign({ id:'chr-sch', name:'Sera the Learned', class:'Mage', level:3, abilities:{INT:13}, proficiencies:[{key:'knowledge',ranks:2}], coins:{pp:0,gp:200,ep:0,sp:0,cp:0}, currentHexId:'hex-1' }, over||{}); }
function specialist(over){ return Object.assign({ id:'chr-sage', name:'Master Olen', class:'Sage', level:1, abilities:{}, proficiencies:[], sageSpecialty:'history', coins:{gp:0} }, over||{}); }
function client(over){ return Object.assign({ id:'chr-cli', name:'Aelric', coins:{pp:0,gp:500,ep:0,sp:0,cp:0}, currentHexId:'hex-2' }, over||{}); }

// =============================================================================
section('Module loads + exports present');
// =============================================================================
['isSage','subjectInSpecialty','sageConsultResolve','sageConsultForecast','consultSage']
  .forEach(k => ok('ACKS.' + k + ' exported', typeof ACKS[k] === 'function'));

// =============================================================================
section('Event-kind registration (sage-consultation)');
// =============================================================================
ok('sage-consultation is a known event kind', ACKS.isEventKindKnown('sage-consultation'));
ok('sage-consultation opted out of the Event Wizard', ACKS.isWizardEmittable && !ACKS.isWizardEmittable('sage-consultation'));
ok('EVENT_SCHEMAS has a sage-consultation schema', ACKS.EVENT_SCHEMAS && !!ACKS.EVENT_SCHEMAS['sage-consultation']);
ok('schema requires sageCharacterId + clientCharacterId', (() => { const s = ACKS.EVENT_SCHEMAS['sage-consultation']; return s && s.R && s.R.sageCharacterId === 'string' && s.R.clientCharacterId === 'string'; })());
ok('schema declares throw + activityCost optional objects', (() => { const s = ACKS.EVENT_SCHEMAS['sage-consultation']; return s && s.O && s.O.throw === 'object' && s.O.activityCost === 'object'; })());

// =============================================================================
section('isSage + subjectInSpecialty');
// =============================================================================
ok('isSage: a stated specialty → sage', ACKS.isSage(specialist()));
ok('isSage: Knowledge proficiency → sage', ACKS.isSage(scholar()));
ok('isSage: Loremastery proficiency → sage', ACKS.isSage({ proficiencies:[{key:'loremastery',ranks:1}] }));
ok('isSage: a plain character → not a sage', !ACKS.isSage({ proficiencies:[{key:'swimming',ranks:1}] }));
ok('isSage: null → false', !ACKS.isSage(null));
ok('subjectInSpecialty: exact match', ACKS.subjectInSpecialty('History','history'));
ok('subjectInSpecialty: subject ⊂ specialty', ACKS.subjectInSpecialty('history','Auran history'));
ok('subjectInSpecialty: specialty ⊂ subject', ACKS.subjectInSpecialty('ancient history of dragons','history'));
ok('subjectInSpecialty: no overlap → false', !ACKS.subjectInSpecialty('dragon anatomy','history'));
ok('subjectInSpecialty: empty → false', !ACKS.subjectInSpecialty('','history') && !ACKS.subjectInSpecialty('history',''));

// =============================================================================
section('sageConsultResolve / Forecast — npc-specialist (RR p.171)');
// =============================================================================
const inSpec = ACKS.sageConsultResolve(camp(), specialist(), { subject:'ancient history' });
ok('npc in-specialty → mode npc-specialist', inSpec.mode === 'npc-specialist');
ok('npc in-specialty → target 3', inSpec.target === 3, 'got ' + inSpec.target);
ok('npc in-specialty → inSpecialty true', inSpec.inSpecialty === true);
ok('npc specialist is proficient (nat-20 auto-succeeds)', inSpec.proficient === true);
const outSpec = ACKS.sageConsultResolve(camp(), specialist(), { subject:'dragon anatomy' });
ok('npc out-of-specialty → target 18', outSpec.target === 18, 'got ' + outSpec.target);
ok('npc out-of-specialty → inSpecialty false', outSpec.inSpecialty === false);
const ovr = ACKS.sageConsultResolve(camp(), specialist(), { subject:'dragon anatomy', inSpecialty:true });
ok('GM inSpecialty override forces 3+', ovr.target === 3 && ovr.inSpecialty === true);
const fc = ACKS.sageConsultForecast(camp(), specialist(), { subject:'ancient history' });
ok('forecast: success chance for 3+ proficient = 18/20 = 0.9', Math.abs(fc.successChance - 0.9) < 1e-9, 'got ' + fc.successChance);
const fcOut = ACKS.sageConsultForecast(camp(), specialist(), { subject:'dragon anatomy' });
ok('forecast: success chance for 18+ proficient = 3/20 = 0.15 (18,19 + nat-20)', Math.abs(fcOut.successChance - 0.15) < 1e-9, 'got ' + fcOut.successChance);

// =============================================================================
section('sageConsultResolve — pc-scholar (RR p.112/p.110)');
// =============================================================================
const k1 = ACKS.sageConsultResolve(camp(), scholar({ proficiencies:[{key:'knowledge',ranks:1}] }), { subject:'anything' });
ok('pc Knowledge rank 1 → mode pc-scholar', k1.mode === 'pc-scholar');
ok('pc Knowledge rank 1 → target 11 (Student)', k1.target === 11, 'got ' + k1.target);
ok('pc-scholar carries the proficiency {key,ranks}', k1.proficiency && k1.proficiency.key === 'knowledge' && k1.proficiency.ranks === 1);
const k2 = ACKS.sageConsultResolve(camp(), scholar({ proficiencies:[{key:'knowledge',ranks:2}] }), {});
ok('pc Knowledge rank 2 → target 7 (Expert)', k2.target === 7, 'got ' + k2.target);
const k3 = ACKS.sageConsultResolve(camp(), scholar({ proficiencies:[{key:'knowledge',ranks:3}] }), {});
ok('pc Knowledge rank 3 → target 3 (Scholar)', k3.target === 3, 'got ' + k3.target);
const lm = ACKS.sageConsultResolve(camp(), { id:'chr-lm', level:1, proficiencies:[{key:'loremastery',ranks:1}] }, {});
ok('pc Loremastery L1 → mode pc-scholar, task loremastery:decipher', lm.mode === 'pc-scholar' && lm.taskKey === 'loremastery:decipher');
ok('pc Loremastery L1 → target 18', lm.target === 18, 'got ' + lm.target);
const lm6 = ACKS.sageConsultResolve(camp(), { id:'chr-lm6', level:6, proficiencies:[{key:'loremastery',ranks:1}] }, {});
ok('pc Loremastery L6 → target 13 (18 −1/level)', lm6.target === 13, 'got ' + lm6.target);
const both = ACKS.sageConsultResolve(camp(), { id:'chr-b', level:1, proficiencies:[{key:'knowledge',ranks:1},{key:'loremastery',ranks:1}] }, {});
ok('pc with both → Knowledge preferred', both.taskKey === 'knowledge:recall');
const preferLore = ACKS.sageConsultResolve(camp(), { id:'chr-b2', level:1, proficiencies:[{key:'knowledge',ranks:1},{key:'loremastery',ranks:1}] }, { preferTask:'loremastery' });
ok('pc preferTask:loremastery → loremastery:decipher', preferLore.taskKey === 'loremastery:decipher');
const preferProf = ACKS.sageConsultResolve(camp(), scholar({ sageSpecialty:'history', proficiencies:[{key:'knowledge',ranks:2}] }), { subject:'history', preferProficiency:true });
ok('preferProficiency forces the scholar path even with a specialty', preferProf.mode === 'pc-scholar' && preferProf.target === 7);
const notSage = ACKS.sageConsultResolve(camp(), { id:'chr-z', proficiencies:[] }, { subject:'x' });
ok('a plain character → available:false, reason not-a-sage', notSage.available === false && notSage.reason === 'not-a-sage');
const specNoProf = ACKS.sageConsultResolve(camp(), { id:'chr-sp', proficiencies:[], sageSpecialty:'metaphysics' }, { subject:'metaphysics' });
ok('a specialty but no proficiency → specialist path (3+)', specNoProf.mode === 'npc-specialist' && specNoProf.target === 3);

// =============================================================================
section('consultSage — pc-scholar end to end');
// =============================================================================
let c = camp([scholar()]);
let r = ACKS.consultSage(c, { sageId:'chr-sch', subject:'the Auran dynasties', query:'who ruled?', feeGp:50, answerText:'The Tarkauns held the throne.', rng: rng(0.5) });
ok('consult ok', r.ok === true);
ok('mode pc-scholar', r.mode === 'pc-scholar');
ok('target 7 (Knowledge rank 2)', r.target === 7, 'got ' + r.target);
ok('natural 11 → success', r.success === true && r.throw.natural === 11);
ok('self-consult: client defaults to the sage', r.clientId === 'chr-sch');
ok('fee debited 200 → 150', c.characters[0].coins.gp === 150, 'got ' + c.characters[0].coins.gp);
ok('two events logged (parent + fee child)', c.eventLog.length === 2);
const ev = c.eventLog[0].event;
ok('parent kind = sage-consultation', ev.kind === 'sage-consultation');
ok('parent applied', ev.status === 'applied');
ok('parent day-stamped (turn 1, day 1)', ev.appliedAtTurn === 1 && ev.appliedAtDay === 1);
ok('payload.activityCost = ancillary 1 (the #346 day tag)', ev.payload.activityCost && ev.payload.activityCost.slot === 'ancillary' && ev.payload.activityCost.units === 1);
ok('payload.loreId reserved null (SG-4)', ev.payload.loreId === null);
ok('payload.throw breakdown present', ev.payload.throw && ev.payload.throw.total === 11 && ev.payload.throw.target === 7 && ev.payload.throw.success === true);
// §528 envelope
ok('context.relatedEntities has sage as source', (ev.context.relatedEntities||[]).some(e => e.id === 'chr-sch' && e.role === 'source'));
ok('context.relatedEntities has client as beneficiary', (ev.context.relatedEntities||[]).some(e => e.id === 'chr-sch' && e.role === 'beneficiary'));
ok('context.primaryHexId = the client hex', ev.context.primaryHexId === 'hex-1');
ok('narrative names the answer on success', /The Tarkauns held the throne/.test(c.eventLog[0].result.narrativeSummary));
// fee child
const child = c.eventLog[1].event;
ok('fee child = wealth-transfer', child.kind === 'wealth-transfer');
ok('fee child rides under the parent (parentEventId)', child.parentEventId === ev.id);
ok('fee child campaignLogHidden', child.campaignLogHidden === true);
ok('fee child moves 50gp from the client', child.payload.amount === 50 && child.payload.source.id === 'chr-sch');

// failure path
c = camp([scholar({ proficiencies:[{key:'knowledge',ranks:1}] })]);   // target 11
r = ACKS.consultSage(c, { sageId:'chr-sch', subject:'obscure lore', rng: rng(0.45) });   // natural 10 < 11
ok('a failed throw → success false', r.success === false && r.throw.natural === 10);
ok('failure narrative says "cannot answer"', /cannot answer/.test(c.eventLog[0].result.narrativeSummary));

// =============================================================================
section('consultSage — npc-specialist in/out + the GP-Wave-B fee');
// =============================================================================
c = camp([specialist(), client()]);
let inR = ACKS.consultSage(c, { sageId:'chr-sage', clientId:'chr-cli', subject:'ancient history', feeGp:30, rng: rng(0.1) });   // 3 ≥ 3
ok('npc in-specialty: target 3, success', inR.target === 3 && inR.success === true && inR.inSpecialty === true);
let outR = ACKS.consultSage(c, { sageId:'chr-sage', clientId:'chr-cli', subject:'dragon anatomy', feeGp:30, rng: rng(0.5) });   // 11 < 18
ok('npc out-of-specialty: target 18, fail', outR.target === 18 && outR.success === false && outR.inSpecialty === false);
ok('client charged 2× 30gp fee (500 → 440)', c.characters.find(x => x.id === 'chr-cli').coins.gp === 440, 'got ' + c.characters.find(x => x.id === 'chr-cli').coins.gp);
// the client (asker) is the beneficiary in the envelope
ok('npc consult: client is the beneficiary', (c.eventLog[0].event.context.relatedEntities||[]).some(e => e.id === 'chr-cli' && e.role === 'beneficiary'));

// insufficient funds aborts (nothing logged)
c = camp([specialist(), client({ id:'chr-poor', coins:{gp:10} })]);
let ins = ACKS.consultSage(c, { sageId:'chr-sage', clientId:'chr-poor', subject:'history', feeGp:50, rng: rng(0.5) });
ok('insufficient funds → ok:false insufficient-funds', ins.ok === false && ins.error === 'insufficient-funds');
ok('insufficient funds → nothing logged', c.eventLog.length === 0);
ok('insufficient funds → no gp moved', c.characters.find(x => x.id === 'chr-poor').coins.gp === 10);

// fee 0 → no wealth-transfer child
c = camp([specialist(), client()]);
ACKS.consultSage(c, { sageId:'chr-sage', clientId:'chr-cli', subject:'history', feeGp:0, rng: rng(0.1) });
ok('fee 0 → only the parent event (no fee child)', c.eventLog.length === 1 && c.eventLog[0].event.kind === 'sage-consultation');

// secret throw flag carried
c = camp([scholar()]);
r = ACKS.consultSage(c, { sageId:'chr-sch', subject:'x', secret:true, rng: rng(0.5) });
ok('secret throw → payload.throw.secret true', c.eventLog[0].event.payload.throw.secret === true);

// guards
ok('no campaign → ok:false', ACKS.consultSage(null, { sageId:'x' }).ok === false);
ok('unknown sage → ok:false unknown-sage', ACKS.consultSage(camp([scholar()]), { sageId:'nope' }).error === 'unknown-sage');
ok('not-a-sage character → ok:false not-a-sage', ACKS.consultSage(camp([{ id:'chr-pl', proficiencies:[] }]), { sageId:'chr-pl', subject:'x' }).error === 'not-a-sage');

// =============================================================================
section('#346 — the consultation counts against the asker day budget (if the reader is present)');
// =============================================================================
if(typeof ACKS.characterActivityBudget === 'function'){
  c = camp([scholar()]);
  ACKS.consultSage(c, { sageId:'chr-sch', subject:'x', feeGp:0, rng: rng(0.5) });
  const budget = ACKS.characterActivityBudget(c, 'chr-sch');
  const consultRows = (budget.ancillary || []).filter(a => a.kind === 'sage-consult');
  ok('the consultation surfaces as a sage-consult ancillary errand in the day budget', consultRows.length >= 1, 'got ' + consultRows.length);
  ok('the consultation consumes one ancillary slot', budget.ancillaryUsed >= 1, 'ancillaryUsed=' + budget.ancillaryUsed);
} else {
  ok('characterActivityBudget present (skipped — engine-side reader not loaded headless)', true);
}

// =============================================================================
section('SG-2 — exports + entity/event registration');
// =============================================================================
['blankSageCommission','sageCommissions','findSageCommission','sageCommissionsForCharacter','sageCommissionProgress','commissionSage','abandonSageCommission','proposeSageCommissionDay','commitSageCommissionRecord']
  .forEach(k => ok('ACKS.' + k + ' exported', typeof ACKS[k] === 'function'));
ok('sag- prefix registered', ACKS.ID_PREFIXES && ACKS.ID_PREFIXES.sageCommission === 'sag');
ok('blankCampaign seeds sageCommissions[]', Array.isArray(ACKS.blankCampaign().sageCommissions));
ok('blankSageCommission mints a sag- id', String(ACKS.blankSageCommission({}).id).slice(0,4) === 'sag-');
ok('registry has the sageCommission kind (chronicleable, 📜)', (ACKS.ENTITY_KINDS_LIST||[]).some(e => e.kind === 'sageCommission' && e.chronicleable));
ok('registry displayName reads only factory fields', (() => { const e = (ACKS.ENTITY_KINDS_LIST||[]).find(x => x.kind === 'sageCommission'); return e && e.displayName({}, { subject:'dragons', id:'sag-1' }) === 'Research: dragons'; })());
ok('field-schema names blankSageCommission', ACKS.fieldSchemaFor('sageCommission') && ACKS.fieldSchemaFor('sageCommission').factory === 'blankSageCommission');
ok('field-schema fields ⊆ blankSageCommission keys', (() => { const sch = ACKS.fieldSchemaFor('sageCommission'); const keys = new Set(Object.keys(ACKS.blankSageCommission({}))); return sch.fields.filter(f=>f.type!=='computed').every(f => keys.has(f.name)); })());
ok('field-schema validates clean', ACKS.validateFieldSchema('sageCommission', ACKS.fieldSchemaFor('sageCommission')).ok);
ok('sage-commission-started is a known event kind', ACKS.isEventKindKnown('sage-commission-started'));
ok('sage-commission-resolved is a known event kind', ACKS.isEventKindKnown('sage-commission-resolved'));
ok('both commission kinds opt out of the Event Wizard', ACKS.isWizardEmittable && !ACKS.isWizardEmittable('sage-commission-started') && !ACKS.isWizardEmittable('sage-commission-resolved'));
ok('schemas require sageCommissionId + sage + client', (() => { const s = ACKS.EVENT_SCHEMAS['sage-commission-started'], r = ACKS.EVENT_SCHEMAS['sage-commission-resolved']; return s && s.R.sageCommissionId === 'string' && s.R.sageCharacterId === 'string' && r && r.R.clientCharacterId === 'string'; })());
ok('resolved schema declares success + throw', (() => { const r = ACKS.EVENT_SCHEMAS['sage-commission-resolved']; return r && r.O.success === 'boolean' && r.O.throw === 'object'; })());
ok('day-consumer registered at slot 64 (with a commit)', (() => { const c = (ACKS.dayConsumersInOrder()||[]).find(x => x.name === 'sage-commission'); return c && c.order === 64 && typeof c.commit === 'function' && (c.pauseTriggers||[]).length === 0; })());

// =============================================================================
section('SG-2 — blankSageCommission factory + sageCommissionProgress (derive, no drift)');
// =============================================================================
const bc2 = ACKS.blankSageCommission({ sageCharacterId:'chr-s', clientCharacterId:'chr-c', subject:'history', daysRequired:10, feeGp:200 });
ok('factory defaults status in-progress', bc2.status === 'in-progress');
ok('factory carries the spec fields', bc2.sageCharacterId === 'chr-s' && bc2.clientCharacterId === 'chr-c' && bc2.subject === 'history' && bc2.daysRequired === 10 && bc2.feeGp === 200);
ok('factory has resolved + result null, history []', bc2.resolved === null && bc2.result === null && Array.isArray(bc2.history));
ok('factory defaults daysRequired 30 when absent', ACKS.blankSageCommission({}).daysRequired === 30);
ok('factory has NO stored daysElapsed (derived, Architecture §3.3)', !('daysElapsed' in bc2));
// progress derives elapsed from startedAtOrd (the truth)
const pcom = ACKS.blankSageCommission({ daysRequired:10, startedAtOrd:1, status:'in-progress' });
const prog = ACKS.sageCommissionProgress({ currentTurn:1, currentDayInMonth:5, sageCommissions:[] }, pcom);   // nowOrd 5 → elapsed 4
ok('progress derives daysElapsed from startedAtOrd', prog.daysElapsed === 4 && prog.daysRemaining === 6 && prog.completesOnOrd === 11);
ok('progress completesNow false before the completion day', prog.completesNow === false);
ok('progress completesNow true on/after the completion day', ACKS.sageCommissionProgress({ currentTurn:1, currentDayInMonth:11, sageCommissions:[] }, pcom).completesNow === true);
ok('progress clamps daysElapsed at daysRequired', ACKS.sageCommissionProgress({ currentTurn:5, currentDayInMonth:1, sageCommissions:[] }, pcom).daysElapsed === 10);

// =============================================================================
section('SG-2 — commissionSage (npc-specialist + pc-scholar) + the GP-Wave-B fee');
// =============================================================================
let cc = camp([specialist(), client()]);
let cr = ACKS.commissionSage(cc, { sageId:'chr-sage', clientId:'chr-cli', subject:'ancient history', daysRequired:5, feeGp:120, answerText:'The Tarkauns ruled.', rng: rng(0.5) });
ok('commission ok', cr.ok === true);
ok('mode npc-specialist, target 3 (in-specialty)', cr.mode === 'npc-specialist' && cr.target === 3);
ok('startedAtOrd = 1 (turn 1 day 1)', cr.startedAtOrd === 1);
ok('commission stored, status in-progress', cc.sageCommissions.length === 1 && cc.sageCommissions[0].status === 'in-progress');
ok('throw PRE-ROLLED at commissioning (resolved.success, nat-11 ≥ 3)', cc.sageCommissions[0].resolved && cc.sageCommissions[0].resolved.success === true && cc.sageCommissions[0].resolved.natural === 11);
ok('result still null while in-progress', cc.sageCommissions[0].result === null);
ok('fee debited 500 → 380', cc.characters.find(x=>x.id==='chr-cli').coins.gp === 380, 'got ' + cc.characters.find(x=>x.id==='chr-cli').coins.gp);
ok('two events: started + fee child', cc.eventLog.length === 2);
const sev = cc.eventLog[0].event;
ok('started event kind = sage-commission-started', sev.kind === 'sage-commission-started');
ok('started day-stamped (turn 1, day 1)', sev.appliedAtTurn === 1 && sev.appliedAtDay === 1);
ok('started §528 envelope: sage source, client beneficiary, commission subject', (() => { const re = sev.context.relatedEntities||[]; return re.some(e=>e.id==='chr-sage'&&e.role==='source') && re.some(e=>e.id==='chr-cli'&&e.role==='beneficiary') && re.some(e=>e.kind==='sageCommission'&&e.id===cc.sageCommissions[0].id&&e.role==='subject'); })());
ok('started payload carries daysRequired + target', sev.payload.daysRequired === 5 && sev.payload.target === 3);
const fchild = cc.eventLog[1].event;
ok('fee child = wealth-transfer under the parent (campaignLogHidden)', fchild.kind === 'wealth-transfer' && fchild.parentEventId === sev.id && fchild.campaignLogHidden === true);
// out-of-specialty
let cc2 = camp([specialist(), client()]);
ACKS.commissionSage(cc2, { sageId:'chr-sage', clientId:'chr-cli', subject:'dragon anatomy', daysRequired:5, feeGp:0, rng: rng(0.5) });
ok('out-of-specialty → target 18, pre-rolled FAIL (nat-11 < 18)', cc2.sageCommissions[0].target === 18 && cc2.sageCommissions[0].resolved.success === false);
ok('fee 0 → only the started event (no fee child)', cc2.eventLog.length === 1);
// pc-scholar + self-commission
let cc3 = camp([scholar()]);   // Knowledge rank 2 → 7+
let cr3 = ACKS.commissionSage(cc3, { sageId:'chr-sch', subject:'lore', daysRequired:5, feeGp:0, rng: rng(0.5) });
ok('pc-scholar mode + target 7 + self-commission (client defaults to sage)', cr3.mode === 'pc-scholar' && cr3.target === 7 && cc3.sageCommissions[0].clientCharacterId === 'chr-sch');
// secret
let cc4 = camp([scholar()]);
ACKS.commissionSage(cc4, { sageId:'chr-sch', subject:'x', daysRequired:5, secret:true, rng: rng(0.5) });
ok('secret stored on resolved', cc4.sageCommissions[0].resolved.secret === true);
// insufficient funds aborts (nothing created)
let cc5 = camp([specialist(), client({ id:'chr-poor', coins:{gp:10} })]);
let cins = ACKS.commissionSage(cc5, { sageId:'chr-sage', clientId:'chr-poor', subject:'history', daysRequired:5, feeGp:100, rng: rng(0.5) });
ok('insufficient funds → ok:false insufficient-funds', cins.ok === false && cins.error === 'insufficient-funds');
ok('insufficient funds → nothing created, no events, no gp moved', !(cc5.sageCommissions && cc5.sageCommissions.length) && cc5.eventLog.length === 0 && cc5.characters.find(x=>x.id==='chr-poor').coins.gp === 10);
// guards
ok('no campaign → ok:false', ACKS.commissionSage(null, {}).ok === false);
ok('unknown sage → unknown-sage', ACKS.commissionSage(camp([scholar()]), { sageId:'nope' }).error === 'unknown-sage');
ok('not-a-sage → not-a-sage', ACKS.commissionSage(camp([{ id:'chr-pl', proficiencies:[] }]), { sageId:'chr-pl', subject:'x' }).error === 'not-a-sage');

// =============================================================================
section('SG-2 — the slot-64 day-tick consumer (direct + via the orchestrator)');
// =============================================================================
// direct: propose on the completion day → 1 record + 1 TRANSIENT notable → commit resolves
let dc = camp([specialist(), client()]);
ACKS.commissionSage(dc, { sageId:'chr-sage', clientId:'chr-cli', subject:'ancient history', daysRequired:3, feeGp:0, answerText:'Yes.', rng: rng(0.1) });   // in-spec 3+, nat-3 → success
ok('propose BEFORE completion → 0 records', ACKS.proposeSageCommissionDay(dc, { dayInMonth: 2 }).pendingRecords.length === 0);
dc.currentDayInMonth = 4;   // ord 4 = startedAtOrd(1) + daysRequired(3)
let propD = ACKS.proposeSageCommissionDay(dc, { dayInMonth: 4 });
ok('propose ON the completion day → 1 record', propD.pendingRecords.filter(r=>r.kind==='sage-commission-complete').length === 1);
ok('propose → 1 TRANSIENT review notable (not logged as its own event)', propD.notableEvents.length === 1 && propD.notableEvents[0].transient === true && propD.notableEvents[0].type === 'sage-commission');
ACKS.commitSageCommissionRecord(dc, propD.pendingRecords[0]);
ok('commit → status complete', dc.sageCommissions[0].status === 'complete');
ok('commit → result set + answer delivered on success', dc.sageCommissions[0].result && dc.sageCommissions[0].result.success === true && dc.sageCommissions[0].result.answerText === 'Yes.');
let drev = dc.eventLog.find(e => e.event.kind === 'sage-commission-resolved');
ok('commit emits sage-commission-resolved', !!drev);
ok('resolved §528 envelope (sage source + commission subject)', !!drev && (drev.event.context.relatedEntities||[]).some(e=>e.id==='chr-sage'&&e.role==='source') && (drev.event.context.relatedEntities||[]).some(e=>e.kind==='sageCommission'&&e.role==='subject'));
ok('resolved payload carries success + throw', !!drev && drev.event.payload.success === true && drev.event.payload.throw && drev.event.payload.throw.total != null);
// idempotent
let beforeLen = dc.eventLog.length;
ACKS.commitSageCommissionRecord(dc, propD.pendingRecords[0]);
ok('commit is idempotent (no second resolved event)', dc.eventLog.length === beforeLen);
// a FAILED research delivers no answer
let dcF = camp([specialist(), client()]);
ACKS.commissionSage(dcF, { sageId:'chr-sage', clientId:'chr-cli', subject:'dragon anatomy', daysRequired:2, feeGp:0, answerText:'Should not deliver.', rng: rng(0.5) });   // out-spec 18+, nat-11 → fail
dcF.currentDayInMonth = 3;
let pF = ACKS.proposeSageCommissionDay(dcF, { dayInMonth:3 });
ACKS.commitSageCommissionRecord(dcF, pF.pendingRecords[0]);
ok('failed research → complete, success false, empty answer', dcF.sageCommissions[0].status === 'complete' && dcF.sageCommissions[0].result.success === false && dcF.sageCommissions[0].result.answerText === '');
// end-to-end via the real orchestrator (proves slot-64 registration fires)
let oc = camp([specialist(), client()]);
ACKS.commissionSage(oc, { sageId:'chr-sage', clientId:'chr-cli', subject:'ancient history', daysRequired:3, feeGp:0, answerText:'Delivered.', rng: rng(0.1) });
let prop = ACKS.proposeDayTick(oc, 3, { force:true });   // ticks days 2,3,4 — the slot-64 consumer fires on day 4
ok('orchestrator surfaces the slot-64 completion record', prop.pendingRecords.some(r => r.consumer === 'sage-commission' && r.kind === 'sage-commission-complete'));
ACKS.commitDayTick(oc, prop);
ok('orchestrator commit resolves the commission + logs the event', oc.sageCommissions[0].status === 'complete' && !!oc.eventLog.find(e=>e.event.kind==='sage-commission-resolved'));
ok('resolved stamps the COMPLETION day (record.dayInMonth, not the pre-tick day) — day 4', oc.sageCommissions[0].result.deliveredAtDay === 4, 'got ' + oc.sageCommissions[0].result.deliveredAtDay);

// =============================================================================
section('SG-2 — abandonSageCommission + lookups');
// =============================================================================
let abc = camp([specialist(), client()]);
let ar = ACKS.commissionSage(abc, { sageId:'chr-sage', clientId:'chr-cli', subject:'metaphysics', daysRequired:30, feeGp:0, rng: rng(0.85) });
let ab = ACKS.abandonSageCommission(abc, ar.commission.id);
ok('abandon ok → status abandoned (no refund)', ab.ok === true && abc.sageCommissions[0].status === 'abandoned');
ok('re-abandon refused (not-in-progress)', ACKS.abandonSageCommission(abc, ar.commission.id).error === 'not-in-progress');
ok('abandon unknown → unknown-commission', ACKS.abandonSageCommission(abc, 'sag-nope').error === 'unknown-commission');
ok('findSageCommission resolves by id', ACKS.findSageCommission(abc, ar.commission.id) === abc.sageCommissions[0]);
ok('sageCommissionsForCharacter finds by sage OR client', ACKS.sageCommissionsForCharacter(abc, 'chr-cli').length === 1 && ACKS.sageCommissionsForCharacter(abc, 'chr-sage').length === 1);

// =============================================================================
section('SG-3 — exports + event registration (the periodic-fee retainer)');
// =============================================================================
['retainSage','endSageRetainer','sageRetainerFor','sageRetainersForCharacter','isSageRetained','retainerConsultFee']
  .forEach(k => ok('ACKS.' + k + ' exported', typeof ACKS[k] === 'function'));
['sage-retainer-started','sage-retainer-ended','sage-retainer-fee-paid'].forEach(k => {
  ok(k + ' is a known event kind', ACKS.isEventKindKnown(k));
  ok(k + ' opts out of the Event Wizard', ACKS.isWizardEmittable && !ACKS.isWizardEmittable(k));
  ok(k + ' schema requires sageRetainerId + sage + client', (() => { const s = ACKS.EVENT_SCHEMAS[k]; return s && s.R && s.R.sageRetainerId === 'string' && s.R.sageCharacterId === 'string' && s.R.clientCharacterId === 'string'; })());
});
ok('SG-3 adds NO new id prefix (reuses sag-)', !(ACKS.ID_PREFIXES && ACKS.ID_PREFIXES.sageRetainer));

// =============================================================================
section('SG-3 — retainSage (the standing arrangement; first month upfront)');
// =============================================================================
let rc = camp([specialist(), client({ coins:{gp:2000} })]);
let rr = ACKS.retainSage(rc, { sageId:'chr-sage', clientId:'chr-cli' });
ok('retain ok', rr.ok === true);
ok('retainer recorded on the CLIENT (client.sageRetainers[])', Array.isArray(rc.characters.find(x=>x.id==='chr-cli').sageRetainers) && rc.characters.find(x=>x.id==='chr-cli').sageRetainers.length === 1);
ok('retainer id reuses the sag- prefix', String(rr.retainer.id).slice(0,4) === 'sag-');
ok('status active · monthsPaid 1 · default fee 500 (RR p.171 wage) · discount 1 (free consults)', rr.retainer.status === 'active' && rr.retainer.monthsPaid === 1 && rr.retainer.feeGpPerMonth === 500 && rr.retainer.consultDiscount === 1);
ok('startedAtOrd 1 (turn 1 day 1) → nextBillOrd 31', rr.retainer.startedAtOrd === 1 && rr.retainer.nextBillOrd === 31);
ok('specialty snapshot from the sage', rr.retainer.specialty === 'history');
ok('first month debited upfront 2000 → 1500', rc.characters.find(x=>x.id==='chr-cli').coins.gp === 1500, 'got ' + rc.characters.find(x=>x.id==='chr-cli').coins.gp);
ok('two events: started + fee child', rc.eventLog.length === 2);
const rev = rc.eventLog[0].event;
ok('started kind = sage-retainer-started, applied, day-stamped', rev.kind === 'sage-retainer-started' && rev.status === 'applied' && rev.appliedAtTurn === 1 && rev.appliedAtDay === 1);
ok('started §528 envelope (sage source, client beneficiary)', (rev.context.relatedEntities||[]).some(e=>e.id==='chr-sage'&&e.role==='source') && (rev.context.relatedEntities||[]).some(e=>e.id==='chr-cli'&&e.role==='beneficiary'));
ok('started payload carries the terms', rev.payload.sageRetainerId === rr.retainer.id && rev.payload.feeGpPerMonth === 500 && rev.payload.consultDiscount === 1);
const rfee = rc.eventLog[1].event;
ok('fee child = wealth-transfer under the parent (campaignLogHidden)', rfee.kind === 'wealth-transfer' && rfee.parentEventId === rev.id && rfee.campaignLogHidden === true && rfee.payload.amount === 500);
// custom terms
let rc2 = camp([specialist(), client({ coins:{gp:2000} })]);
let rr2 = ACKS.retainSage(rc2, { sageId:'chr-sage', clientId:'chr-cli', feeGpPerMonth:300, consultDiscount:0.5 });
ok('custom feeGpPerMonth + consultDiscount honored, debited 300', rr2.retainer.feeGpPerMonth === 300 && rr2.retainer.consultDiscount === 0.5 && rc2.characters.find(x=>x.id==='chr-cli').coins.gp === 1700);
// guards
ok('self-retain refused', ACKS.retainSage(camp([scholar()]), { sageId:'chr-sch', clientId:'chr-sch' }).error === 'self-retain');
ok('already-retained refused (no second debit)', (() => { const c = camp([specialist(), client({coins:{gp:2000}})]); ACKS.retainSage(c, {sageId:'chr-sage', clientId:'chr-cli'}); const again = ACKS.retainSage(c, {sageId:'chr-sage', clientId:'chr-cli'}); return again.error === 'already-retained' && c.characters.find(x=>x.id==='chr-cli').coins.gp === 1500; })());
ok('not-a-sage refused', ACKS.retainSage(camp([{id:'chr-pl',proficiencies:[]}, client({coins:{gp:2000}})]), { sageId:'chr-pl', clientId:'chr-cli' }).error === 'not-a-sage');
ok('unknown sage → unknown-sage', ACKS.retainSage(camp([client({coins:{gp:2000}})]), { sageId:'nope', clientId:'chr-cli' }).error === 'unknown-sage');
ok('no campaign → ok:false', ACKS.retainSage(null, {}).ok === false);
// insufficient funds aborts (nothing created)
let rcPoor = camp([specialist(), client({ id:'chr-poor', coins:{gp:10} })]);
let rIns = ACKS.retainSage(rcPoor, { sageId:'chr-sage', clientId:'chr-poor' });
ok('insufficient funds → ok:false insufficient-funds', rIns.ok === false && rIns.error === 'insufficient-funds');
ok('insufficient funds → nothing created, no events, no gp moved', !(rcPoor.characters.find(x=>x.id==='chr-poor').sageRetainers||[]).length && rcPoor.eventLog.length === 0 && rcPoor.characters.find(x=>x.id==='chr-poor').coins.gp === 10);
// fee 0 → only the started event
let rcFree = camp([specialist(), client({ coins:{gp:2000} })]);
ACKS.retainSage(rcFree, { sageId:'chr-sage', clientId:'chr-cli', feeGpPerMonth:0 });
ok('feeGpPerMonth 0 → only the started event (no fee child)', rcFree.eventLog.length === 1 && rcFree.eventLog[0].event.kind === 'sage-retainer-started');

// =============================================================================
section('SG-3 — a retainer discounts/covers consultSage (the priority/discount benefit)');
// =============================================================================
let dc1 = camp([specialist(), client({ coins:{gp:2000} })]);
ACKS.retainSage(dc1, { sageId:'chr-sage', clientId:'chr-cli' });   // discount 1 = free consults
let beforeGp = dc1.characters.find(x=>x.id==='chr-cli').coins.gp;   // 1500
let beforeLog = dc1.eventLog.length;
ACKS.consultSage(dc1, { sageId:'chr-sage', clientId:'chr-cli', subject:'ancient history', feeGp:50, rng: rng(0.1) });
ok('retained consult: fee waived → no gp moved', dc1.characters.find(x=>x.id==='chr-cli').coins.gp === beforeGp);
ok('retained consult: payload coveredByRetainer + baseFeeGp 50 + feeGp 0 + retainerId', (() => { const ev = dc1.eventLog[beforeLog].event; return ev.payload.coveredByRetainer === true && ev.payload.baseFeeGp === 50 && ev.payload.feeGp === 0 && !!ev.payload.retainerId; })());
ok('retained consult: only the parent event (no fee child)', dc1.eventLog.length === beforeLog + 1);
// half discount
let dc2 = camp([specialist(), client({ coins:{gp:2000} })]);
ACKS.retainSage(dc2, { sageId:'chr-sage', clientId:'chr-cli', consultDiscount:0.5 });
let g2 = dc2.characters.find(x=>x.id==='chr-cli').coins.gp;
ACKS.consultSage(dc2, { sageId:'chr-sage', clientId:'chr-cli', subject:'history', feeGp:40, rng: rng(0.1) });
ok('half-discount retainer → fee 20 of 40', dc2.characters.find(x=>x.id==='chr-cli').coins.gp === g2 - 20, 'got ' + dc2.characters.find(x=>x.id==='chr-cli').coins.gp);
// ignoreRetainer forces the full fee
let dc3 = camp([specialist(), client({ coins:{gp:2000} })]);
ACKS.retainSage(dc3, { sageId:'chr-sage', clientId:'chr-cli' });
let g3 = dc3.characters.find(x=>x.id==='chr-cli').coins.gp;
ACKS.consultSage(dc3, { sageId:'chr-sage', clientId:'chr-cli', subject:'history', feeGp:30, ignoreRetainer:true, rng: rng(0.1) });
ok('opts.ignoreRetainer → full fee charged despite the retainer', dc3.characters.find(x=>x.id==='chr-cli').coins.gp === g3 - 30);
// no retainer → the shipped SG-1 path unchanged
let dc4 = camp([specialist(), client({ coins:{gp:2000} })]);
ACKS.consultSage(dc4, { sageId:'chr-sage', clientId:'chr-cli', subject:'history', feeGp:30, rng: rng(0.1) });
ok('no retainer → coveredByRetainer false, baseFeeGp == feeGp', dc4.eventLog[0].event.payload.coveredByRetainer === false && dc4.eventLog[0].event.payload.baseFeeGp === 30 && dc4.eventLog[0].event.payload.feeGp === 30);
// the modal preview helper
let dc5 = camp([specialist(), client({ coins:{gp:2000} })]);
ACKS.retainSage(dc5, { sageId:'chr-sage', clientId:'chr-cli', consultDiscount:0.25 });
const rcf = ACKS.retainerConsultFee(dc5, 'chr-cli', 'chr-sage', 100);
ok('retainerConsultFee: covered, 75 of 100 at 0.25 discount', rcf.covered === true && rcf.feeGp === 75 && rcf.baseFeeGp === 100 && rcf.discount === 0.25);
ok('retainerConsultFee: no retainer → not covered, base fee', ACKS.retainerConsultFee(camp([scholar()]), 'chr-sch', 'chr-x', 60).covered === false && ACKS.retainerConsultFee(camp([scholar()]), 'chr-sch', 'chr-x', 60).feeGp === 60);

// =============================================================================
section('SG-3 — lookups + endSageRetainer');
// =============================================================================
let lc = camp([specialist(), client({ coins:{gp:2000} })]);
let lr = ACKS.retainSage(lc, { sageId:'chr-sage', clientId:'chr-cli' });
ok('sageRetainerFor finds the active retainer', ACKS.sageRetainerFor(lc, 'chr-cli', 'chr-sage') === lr.retainer);
ok('isSageRetained true for a retained sage', ACKS.isSageRetained(lc, 'chr-sage') === true);
ok('isSageRetained false otherwise', ACKS.isSageRetained(lc, 'chr-cli') === false);
ok('sageRetainersForCharacter finds by client OR sage', ACKS.sageRetainersForCharacter(lc, 'chr-cli').length === 1 && ACKS.sageRetainersForCharacter(lc, 'chr-sage').length === 1);
ACKS.endSageRetainer(lc, lr.retainer.id);
ok('endSageRetainer → status ended', lr.retainer.status === 'ended');
ok('ended retainer drops from sageRetainerFor / isSageRetained / -ForCharacter', ACKS.sageRetainerFor(lc, 'chr-cli', 'chr-sage') === null && ACKS.isSageRetained(lc, 'chr-sage') === false && ACKS.sageRetainersForCharacter(lc, 'chr-cli').length === 0);
ok('end emits sage-retainer-ended', !!lc.eventLog.find(e=>e.event.kind==='sage-retainer-ended'));
ok('re-end refused (not-active)', ACKS.endSageRetainer(lc, lr.retainer.id).error === 'not-active');
ok('end unknown → unknown-retainer', ACKS.endSageRetainer(lc, 'sag-nope').error === 'unknown-retainer');
ok('end by {clientId,sageId} selector', (() => { const c = camp([specialist(), client({coins:{gp:2000}})]); ACKS.retainSage(c, {sageId:'chr-sage', clientId:'chr-cli'}); const r = ACKS.endSageRetainer(c, {clientId:'chr-cli', sageId:'chr-sage'}); return r.ok === true && r.retainer.status === 'ended'; })());

// =============================================================================
section('SG-3 — monthly billing rides the slot-64 consumer (direct + orchestrator + lapse)');
// =============================================================================
// direct: a retainer started turn 1 day 1 (nextBillOrd 31) bills at turn 2 day 1 (ord 31)
let bc = camp([specialist(), client({ coins:{gp:2000} })]);
ACKS.retainSage(bc, { sageId:'chr-sage', clientId:'chr-cli' });   // 2000 → 1500 (month 1, upfront)
ok('propose BEFORE the bill is due → 0 retainer-bill records', ACKS.proposeSageCommissionDay(bc, { dayInMonth: 5 }).pendingRecords.filter(r=>r.kind==='sage-retainer-bill').length === 0);
bc.currentTurn = 2; bc.currentDayInMonth = 1;   // nowOrd 31 = nextBillOrd
let bp = ACKS.proposeSageCommissionDay(bc, { dayInMonth: 1 });
let billRecs = bp.pendingRecords.filter(r=>r.kind==='sage-retainer-bill');
ok('propose ON the bill day → 1 retainer-bill record (forOrd 31)', billRecs.length === 1 && billRecs[0].forOrd === 31);
ok('propose → 1 TRANSIENT review notable (sage-retainer)', bp.notableEvents.some(e => e.transient === true && e.type === 'sage-retainer'));
ACKS.commitSageCommissionRecord(bc, billRecs[0]);
const retB = bc.characters.find(x=>x.id==='chr-cli').sageRetainers[0];
ok('commit → month 2 billed (1500 → 1000) · monthsPaid 2 · nextBillOrd 61', bc.characters.find(x=>x.id==='chr-cli').coins.gp === 1000 && retB.monthsPaid === 2 && retB.nextBillOrd === 61);
let fpEv = bc.eventLog.find(e=>e.event.kind==='sage-retainer-fee-paid');
ok('commit emits sage-retainer-fee-paid (campaignLogHidden — routine bill)', !!fpEv && fpEv.event.campaignLogHidden === true);
ok('fee-paid has its GP-Wave-B child under it', !!bc.eventLog.find(e=>e.event.kind==='wealth-transfer' && e.event.parentEventId === fpEv.event.id));
// idempotent (re-commit the same record → no double-bill)
let gpBefore = bc.characters.find(x=>x.id==='chr-cli').coins.gp;
ACKS.commitSageCommissionRecord(bc, billRecs[0]);
ok('commit idempotent (forOrd guard — no double-bill)', bc.characters.find(x=>x.id==='chr-cli').coins.gp === gpBefore && retB.monthsPaid === 2);
// orchestrator: proves the slot-64 consumer routes retainer records
let roc = camp([specialist(), client({ coins:{gp:2000} })]);
ACKS.retainSage(roc, { sageId:'chr-sage', clientId:'chr-cli' });
roc.currentTurn = 2; roc.currentDayInMonth = 1;
let oprop = ACKS.proposeDayTick(roc, 2, { force:true });   // ticks day 2 (ord 32 ≥ 31) → bills
ok('orchestrator surfaces the retainer-bill via slot-64', oprop.pendingRecords.some(r => r.consumer === 'sage-commission' && r.kind === 'sage-retainer-bill'));
ACKS.commitDayTick(roc, oprop);
ok('orchestrator commit bills the retainer', roc.characters.find(x=>x.id==='chr-cli').sageRetainers[0].monthsPaid === 2 && !!roc.eventLog.find(e=>e.event.kind==='sage-retainer-fee-paid'));
// lapse: a client who can no longer pay → the retainer lapses
let lpc = camp([specialist(), client({ coins:{gp:510} })]);
ACKS.retainSage(lpc, { sageId:'chr-sage', clientId:'chr-cli' });   // 510 → 10 (month 1)
lpc.currentTurn = 2; lpc.currentDayInMonth = 1;
let lprop = ACKS.proposeSageCommissionDay(lpc, { dayInMonth: 1 });
ACKS.commitSageCommissionRecord(lpc, lprop.pendingRecords.find(r=>r.kind==='sage-retainer-bill'));
const retL = lpc.characters.find(x=>x.id==='chr-cli').sageRetainers[0];
ok('unpaid bill → retainer lapses (status lapsed, reason unpaid)', retL.status === 'lapsed' && retL.endedReason === 'unpaid');
ok('lapse → no gp moved (still 10), no fee-paid event, an ended event reason unpaid', lpc.characters.find(x=>x.id==='chr-cli').coins.gp === 10 && !lpc.eventLog.find(e=>e.event.kind==='sage-retainer-fee-paid') && !!lpc.eventLog.find(e=>e.event.kind==='sage-retainer-ended' && e.event.payload.reason==='unpaid'));
ok('a lapsed retainer no longer discounts consultSage', ACKS.consultSage(lpc, { sageId:'chr-sage', clientId:'chr-cli', subject:'history', feeGp:0, rng: rng(0.1) }).event.payload.coveredByRetainer === false);

// =============================================================================
section('Team-session invariants — record-only, no migrate inject, no blankCharacter field');
// =============================================================================
ok('SG-1 record-only: migrate injects no sage-consultation collection', (() => {
  // The everyday consultation is an EVENT, not an entity — no collection at all.
  if(typeof ACKS.migrateCampaign !== 'function') return true;
  const bare = ACKS.migrateCampaign({ schemaVersion:2, characters:[] });
  return !('sageConsultations' in bare) && !('sages' in bare);
})());
ok('SG-2: blankCampaign SEEDS sageCommissions[] (the multi-week commission collection is real)', Array.isArray(ACKS.blankCampaign().sageCommissions));
ok('SG-2: migrate does NOT inject sageCommissions onto a campaign that lacks it (migrate-no-op, templates unchanged)', (() => {
  if(typeof ACKS.migrateCampaign !== 'function') return true;
  return !('sageCommissions' in ACKS.migrateCampaign({ schemaVersion:2, characters:[] }));
})());
ok('blankCharacter carries no sageSpecialty (defensive read; init-on-write)', (() => {
  if(typeof ACKS.blankCharacter !== 'function') return true;
  const bc = ACKS.blankCharacter();
  return !('sageSpecialty' in bc);
})());
ok('SG-3: blankCharacter carries no sageRetainers (a character field, defensive read; init-on-write)', (() => {
  if(typeof ACKS.blankCharacter !== 'function') return true;
  return !('sageRetainers' in ACKS.blankCharacter());
})());
ok('SG-3: migrate injects no sageRetainers collection (the retainer is a character field, not a campaign collection)', (() => {
  if(typeof ACKS.migrateCampaign !== 'function') return true;
  const bare = ACKS.migrateCampaign({ schemaVersion:2, characters:[] });
  return !('sageRetainers' in bare);
})());

// =============================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — sages.smoke.js: ' + pass + ' passed, ' + fail + ' failed');
if(fail){ console.log('Failures:\n  ' + failures.join('\n  ')); process.exit(1); }
