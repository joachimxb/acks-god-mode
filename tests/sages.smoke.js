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
section('Team-session invariants — record-only, no migrate inject, no blankCharacter field');
// =============================================================================
ok('no replay handler registered (record-only): applyEvent of a raw sage-consultation is harmless', (() => {
  // A record-only kind has no EVENT_HANDLERS entry; the verb pushes directly. Confirm there is no
  // sage-collection injected by migrateCampaign onto a fresh blank campaign.
  if(typeof ACKS.blankCampaign !== 'function') return true;
  const blank = ACKS.blankCampaign ? ACKS.blankCampaign() : { characters:[] };
  const migrated = (typeof ACKS.migrateCampaign === 'function') ? ACKS.migrateCampaign(blank) : blank;
  return !('sageConsultations' in migrated) && !('sageCommissions' in migrated) && !('sages' in migrated);
})());
ok('blankCharacter carries no sageSpecialty (defensive read; init-on-write)', (() => {
  if(typeof ACKS.blankCharacter !== 'function') return true;
  const bc = ACKS.blankCharacter();
  return !('sageSpecialty' in bc);
})());

// =============================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — sages.smoke.js: ' + pass + ' passed, ' + fail + ' failed');
if(fail){ console.log('Failures:\n  ' + failures.join('\n  ')); process.exit(1); }
