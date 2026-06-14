/* tests/lifecycle.smoke.js — Character Lifecycle CL-1 aging (RR p.19) + CL-2 disease (JJ p.84).
 *
 *   node tests/lifecycle.smoke.js   (or via `npm test`)
 *
 * Locks the RR p.19 RAW: the five age-category boundaries per race (incl. the ageless
 * Elf/Nobiran + the open-ended-past-maximum band), the progressive attribute adjustments on
 * a category crossing (and the clamp at 3), the death-from-old-age thresholds (Old+CON /
 * Ancient+CON / max-age-and-yearly — incl. the Marcus worked example numbers + the CON-feedback),
 * the 1d12-month save scheduling + the Death save (survive / die / annual re-arm), the opt-in
 * (age:null) + ageless skips, the dry-run-mutates-nothing discipline, the commitTurn + propose
 * integration (the hook fires on a real month), the two record-only events, and rollStartingAge.
 */
'use strict';
const path = require('path');
require('./_engine.js').load();
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail) { if (cond) { pass++; } else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t) { console.log('\n— ' + t); }

function mkCampaign(opts) {
  opts = opts || {};
  return { schemaVersion: 2, currentTurn: opts.turn || 1, currentDayInMonth: opts.day || 1,
    calendar: { year: 1, month: 1, day: opts.day || 1 }, houseRules: {},
    characters: [], domains: [], hexes: [], eventLog: [] };
}
function mkChar(c, opts) {
  opts = opts || {};
  const ch = ACKS.blankCharacter(Object.assign({
    id: opts.id || 'chr-1', name: opts.name || 'Aelric', race: opts.race || 'human',
    abilities: opts.abilities || { STR:12, INT:10, WIL:10, DEX:12, CON:12, CHA:10 },
    savingThrows: opts.savingThrows || { paralysis:15, death:15, blast:15, implements:15, spells:15 },
    currentHexId: opts.hexId || 'hex-a'
  }, opts.extra || {}));
  if(opts.age !== undefined) ch.age = opts.age;
  if(opts.ageMonths !== undefined) ch.ageMonths = opts.ageMonths;
  c.characters.push(ch);
  return ch;
}
// advance N monthly passes (commit) with a fixed rng; returns the last result.
function advance(c, n, rng) { let r; for (let i = 0; i < (n||1); i++) r = ACKS.processAgingForTurn(c, { rng: rng || (() => 0.5) }); return r; }
const RNG0 = () => 0.0;     // 1dN → 1 (min: arm due 1; a Death save → natural 1)
const RNG_HI = () => 0.99;  // 1dN → N (a Death save → natural 20)

// =============================================================================
section('data layer + registries');
{
  const b = ACKS.blankCharacter({});
  ok('blankCharacter seeds age:null (opt-in)', b.age === null);
  ok('blankCharacter seeds ageMonths:0', b.ageMonths === 0);
  ok('blankCharacter seeds ageCategory:null', b.ageCategory === null);
  ok('blankCharacter seeds agingDeathSave:null', b.agingDeathSave === null);
  ok('blankCharacter seeds reserveXp:0 (CL-4a)', b.reserveXp === 0);
}
ok("event kind 'aging-milestone' is registered", ACKS.isEventKindKnown('aging-milestone'));
ok("event kind 'death-from-old-age' is registered", ACKS.isEventKindKnown('death-from-old-age'));
ok('both aging events opt out of the Event Wizard', !ACKS.isWizardEmittable('aging-milestone') && !ACKS.isWizardEmittable('death-from-old-age'));
ok('exports the derivations + the pass', typeof ACKS.ageCategoryFor === 'function' && typeof ACKS.oldAgeThresholdsFor === 'function' && typeof ACKS.processAgingForTurn === 'function' && typeof ACKS.characterAgingInfo === 'function');

// =============================================================================
section('Character Aging — the five categories by race (RR p.19)');
const cat = (race, age) => ACKS.ageCategoryFor({ race, age });
ok('human 13–17 youth, 18 adult', cat('human',13)==='youth' && cat('human',17)==='youth' && cat('human',18)==='adult');
ok('human 35 adult, 36 middle-aged', cat('human',35)==='adult' && cat('human',36)==='middle-aged');
ok('human 55 middle-aged, 56 old', cat('human',55)==='middle-aged' && cat('human',56)==='old');
ok('human 75 old, 76 ancient', cat('human',75)==='old' && cat('human',76)==='ancient');
ok('human 95 ancient, 200 still ancient (open-ended past max)', cat('human',95)==='ancient' && cat('human',200)==='ancient');
ok('human below youth-min reads youth', cat('human',5)==='youth');
ok('Zaharan tracks the human bands', cat('zaharan',56)==='old' && cat('zaharan',76)==='ancient');
ok('beastman 15 youth, 16 adult, 46 old, 61 ancient', cat('beastman',15)==='youth' && cat('beastman',16)==='adult' && cat('beastman',46)==='old' && cat('beastman',61)==='ancient');
ok('dwarf 25 youth, 26 adult, 76 old, 116 ancient, 150 ancient', cat('dwarf',25)==='youth' && cat('dwarf',26)==='adult' && cat('dwarf',76)==='old' && cat('dwarf',116)==='ancient' && cat('dwarf',150)==='ancient');
ok('elf 50 youth, 51 adult, 250 still adult (ageless — no MA/Old/Ancient)', cat('elf',50)==='youth' && cat('elf',51)==='adult' && cat('elf',250)==='adult');
ok('nobiran 17 youth, 18 adult, 300 adult (ageless)', cat('nobiran',17)==='youth' && cat('nobiran',18)==='adult' && cat('nobiran',300)==='adult');
ok('age unset → null category', ACKS.ageCategoryFor({ race:'human', age:null }) === null && ACKS.ageCategoryFor({ race:'human' }) === null);
ok('isAgelessRace: elf + nobiran true; human/dwarf/beastman/zaharan false', ACKS.isAgelessRace('elf') && ACKS.isAgelessRace('nobiran') && !ACKS.isAgelessRace('human') && !ACKS.isAgelessRace('dwarf') && !ACKS.isAgelessRace('beastman') && !ACKS.isAgelessRace('zaharan'));
ok('race aliases: man/elven/dwarven normalize', ACKS.isAgelessRace('elven') && !ACKS.isAgelessRace('man') && !ACKS.isAgelessRace('dwarven'));

// =============================================================================
section('Attribute Adjustments by Age — the progressive deltas (RR p.19)');
const ADJ = ACKS.AGE_ATTRIBUTE_ADJUSTMENTS;
ok('Youth = −2 STR/INT/WIL', ADJ.youth.STR===-2 && ADJ.youth.INT===-2 && ADJ.youth.WIL===-2);
ok('Adult = +2 STR/INT/WIL', ADJ.adult.STR===2 && ADJ.adult.INT===2 && ADJ.adult.WIL===2);
ok('Middle Aged = −2 STR/DEX/CON', ADJ['middle-aged'].STR===-2 && ADJ['middle-aged'].DEX===-2 && ADJ['middle-aged'].CON===-2 && ADJ['middle-aged'].CHA===undefined);
ok('Old = −2 STR/DEX/CON/CHA', ADJ.old.STR===-2 && ADJ.old.DEX===-2 && ADJ.old.CON===-2 && ADJ.old.CHA===-2);
ok('Ancient = −2 STR/DEX/CON/CHA', ADJ.ancient.STR===-2 && ADJ.ancient.DEX===-2 && ADJ.ancient.CON===-2 && ADJ.ancient.CHA===-2);

// =============================================================================
section('the monthly pass — age advances with the calendar (one turn = one month)');
{
  const c = mkCampaign(); const ch = mkChar(c, { age:30, ageMonths:0 });
  advance(c, 11);
  ok('after 11 months: still age 30, ageMonths 11', ch.age === 30 && ch.ageMonths === 11);
  advance(c, 1);
  ok('the 12th month rolls over → age 31, ageMonths 0', ch.age === 31 && ch.ageMonths === 0);
  ok('ageCategory cache reconciled (adult)', ch.ageCategory === 'adult');
}

// =============================================================================
section('category crossings apply the progressive attribute adjustment (RR p.19)');
{
  // adult → middle-aged: −2 STR/DEX/CON (the Marcus example: CON 18 → 16 entering Middle Aged).
  const c = mkCampaign(); const ch = mkChar(c, { age:35, ageMonths:11, abilities:{STR:14,INT:12,WIL:11,DEX:13,CON:18,CHA:10} });
  const r = advance(c, 1);
  ok('age 35→36 crosses into middle-aged', ch.age === 36 && ch.ageCategory === 'middle-aged');
  ok('Middle Aged applies −2 STR/DEX/CON', ch.abilities.STR===12 && ch.abilities.DEX===11 && ch.abilities.CON===16);
  ok('untouched attributes unchanged (INT/WIL/CHA)', ch.abilities.INT===12 && ch.abilities.WIL===11 && ch.abilities.CHA===10);
  ok('the crossing is reported', r.crossings.length===1 && r.crossings[0].toCategory==='middle-aged');
  ok('an aging-milestone event is emitted (context subject = the character)', (() => { const e = c.eventLog.find(x => x.event.kind==='aging-milestone'); return e && e.event.context.relatedEntities[0].id===ch.id && e.event.context.relatedEntities[0].role==='subject' && e.event.context.primaryHexId==='hex-a'; })());
  ok('a log entry records the milestone', r.logEntries.some(l => /Aging .* Middle Aged/.test(l)));
}
{
  // middle-aged → old: adds −2 CHA. (CON 16 → 14 — Marcus' CON by Old age.)
  const c = mkCampaign(); const ch = mkChar(c, { age:55, ageMonths:11, abilities:{STR:12,INT:12,WIL:11,DEX:11,CON:16,CHA:10} });
  advance(c, 1);
  ok('age 55→56 crosses into old; CON 16→14, CHA 10→8', ch.ageCategory==='old' && ch.abilities.CON===14 && ch.abilities.CHA===8);
}
{
  // old → ancient: CON 14 → 12 (Marcus' CON by Ancient age).
  const c = mkCampaign(); const ch = mkChar(c, { age:75, ageMonths:11, abilities:{STR:10,INT:12,WIL:11,DEX:9,CON:14,CHA:8} });
  advance(c, 1);
  ok('age 75→76 crosses into ancient; CON 14→12', ch.ageCategory==='ancient' && ch.abilities.CON===12);
}
{
  // attribute floor: never below 3 (RR p.19).
  const c = mkCampaign(); const ch = mkChar(c, { age:35, ageMonths:11, abilities:{STR:4,INT:10,WIL:10,DEX:3,CON:5,CHA:10} });
  advance(c, 1); // middle-aged: −2 STR/DEX/CON
  ok('attribute clamps at 3 (STR 4→3, DEX 3→3, CON 5→3)', ch.abilities.STR===3 && ch.abilities.DEX===3 && ch.abilities.CON===3);
}

// =============================================================================
section('Death From Old Age — thresholds (RR p.19, the Marcus worked example)');
{
  // RAW example: Marcus by Old (56) has CON 14 → saves at 70; by Ancient (76) CON 12 → saves at 88; then 95+.
  const marcusOld = { race:'human', age:56, abilities:{CON:14} };
  const thr = ACKS.oldAgeThresholdsFor(marcusOld);
  ok('Old threshold = min Old (56) + CON 14 = 70', thr.find(t=>t.key==='old').age === 70);
  ok('Ancient threshold (at CON 14) = 76 + 14 = 90', thr.find(t=>t.key==='ancient').age === 90);
  ok('max-age threshold = 95, annual', (() => { const m = thr.find(t=>t.key==='max'); return m.age===95 && m.annual===true; })());
  // CON-feedback: by the time he's Ancient his CON is 12 → ancient threshold reads 88 (the example).
  ok('CON-feedback: at CON 12 the Ancient threshold = 88 (Marcus)', ACKS.oldAgeThresholdsFor({ race:'human', age:76, abilities:{CON:12} }).find(t=>t.key==='ancient').age === 88);
  ok('dwarf thresholds (CON 15): old 91, ancient 131, max 150', (() => { const t = ACKS.oldAgeThresholdsFor({race:'dwarf',age:80,abilities:{CON:15}}); return t.find(x=>x.key==='old').age===91 && t.find(x=>x.key==='ancient').age===131 && t.find(x=>x.key==='max').age===150; })());
  ok('ageless races have NO old-age thresholds', ACKS.oldAgeThresholdsFor({race:'elf',age:300,abilities:{CON:14}}).length===0 && ACKS.oldAgeThresholdsFor({race:'nobiran',age:300,abilities:{CON:14}}).length===0);
}

// =============================================================================
section('Death From Old Age — the 1d12 schedule + the Death save');
{
  // Reaching the Old threshold (age 70, CON 14) arms a save within 1d12 months.
  const c = mkCampaign(); const ch = mkChar(c, { age:69, ageMonths:11, abilities:{CON:14}, savingThrows:{death:8} });
  const r = advance(c, 1, RNG0); // → age 70; old-threshold 70 reached → arm 1d12 (rng0 → 1)
  ok('reaching Old+CON arms a death-from-old-age save', ch.agingDeathSave && ch.agingDeathSave.thresholdKey==='old' && ch.agingDeathSave.dueInMonths===1);
  ok('the arming is reported', r.deathSaves.some(d => d.thresholdKey==='old' && d.armedDueInMonths===1));
  // next month: due elapses → the save fires; rng_hi → natural 20 ≥ 8 → SURVIVES.
  const r2 = advance(c, 1, RNG_HI);
  ok('the save fires when the counter elapses (survive on 20 vs 8+)', r2.deathSaves.some(d => d.roll===20 && d.died===false));
  ok('a survived one-time threshold is marked resolved', ch.lifecycleState!=='deceased' && ch.agingDeathSave.resolved.indexOf('old')>=0 && ch.agingDeathSave.dueInMonths===null);
  ok('a death-from-old-age event records the survival (died:false)', c.eventLog.some(e => e.event.kind==='death-from-old-age' && e.event.payload.died===false));
}
{
  // A failed save kills (deceased + lifecycleState + event died:true).
  const c = mkCampaign(); const ch = mkChar(c, { age:70, ageMonths:11, abilities:{CON:14}, savingThrows:{death:18} });
  advance(c, 1, RNG0); // age 71, arm old (due 1)
  const r = advance(c, 1, RNG0); // fire: natural 1 < 18 → die
  ok('a failed Death save → deceased', ch.lifecycleState==='deceased' && ch.alive===false);
  ok('the death is reported + deceasedTurn stamped', r.deaths.some(d=>d.characterId===ch.id) && ch.deceasedTurn != null);
  ok('a death-from-old-age event records the death (died:true)', c.eventLog.some(e => e.event.kind==='death-from-old-age' && e.event.payload.died===true && e.event.payload.characterId===ch.id));
  ok('a deceased character is no longer an aging subject (the pass skips it)', advance(c,1).advances.every(a => a.characterId !== ch.id));
}
{
  // The max-age threshold is ANNUAL: it re-arms each year past the racial maximum. A character who
  // aged normally to the maximum has already resolved Old + Ancient along the way (only max remains;
  // a GM who SETS an old character instead cascades through the unresolved thresholds — RAW: a save
  // within 1d12 months of reaching EACH — which the prior blocks already exercise).
  const c = mkCampaign(); const ch = mkChar(c, { age:94, ageMonths:11, abilities:{CON:6}, savingThrows:{death:4},
    extra:{ agingDeathSave:{ dueInMonths:null, thresholdKey:null, resolved:['old','ancient'], lastMaxSaveAge:null } } });
  advance(c, 1, RNG0);  // → age 95 = max; arm 'max' (due 1)
  ok('reaching the racial maximum arms the annual max save', ch.agingDeathSave.thresholdKey==='max');
  advance(c, 1, RNG_HI); // survive at 95 (this pass also advances ageMonths 0→1)
  ok('surviving the max save records lastMaxSaveAge = 95 (no immediate re-arm)', ch.agingDeathSave.dueInMonths===null && ch.agingDeathSave.lastMaxSaveAge===95);
  advance(c, 10, RNG_HI); // ageMonths 1→11 — still within age 95, no re-arm
  ok('no re-arm within the same year (still 95)', ch.age===95 && ch.agingDeathSave.dueInMonths===null);
  advance(c, 1, RNG_HI); // ageMonths 11→12 → age 96: re-arm 'max'
  ok('the next year (age 96) re-arms the max save', ch.age===96 && ch.agingDeathSave.thresholdKey==='max' && ch.agingDeathSave.dueInMonths!=null);
}

// =============================================================================
section('skips — opt-in seeding, ageless races, the deceased + candidates');
{
  const c = mkCampaign();
  const none = mkChar(c, { id:'n', name:'Unaged', race:'human' });          // age:null
  const elf  = mkChar(c, { id:'e', name:'Elf', race:'elf', age:75, abilities:{CON:12} });
  const dead = mkChar(c, { id:'d', name:'Corpse', race:'human', age:60, extra:{ lifecycleState:'deceased' } });
  const cand = mkChar(c, { id:'k', name:'Candidate', race:'human', age:40, extra:{ lifecycleState:'candidate' } });
  const r = advance(c, 12);
  ok('age:null is skipped (never ages)', none.age===null && none.ageMonths===0);
  ok('ageless elf is skipped (age unchanged)', elf.age===75 && elf.ageMonths===0);
  ok('deceased is skipped', dead.age===60);
  ok('candidate is skipped', cand.age===40);
  ok('none of the skipped characters appear in advances[]', r.advances.length===0);
}

// =============================================================================
section('dry-run reports the deterministic facts but mutates nothing + rolls no dice');
{
  const c = mkCampaign(); const ch = mkChar(c, { age:35, ageMonths:11, abilities:{STR:14,DEX:13,CON:18} });
  const dr = ACKS.processAgingForTurn(c, { dryRun:true });
  ok('dry-run leaves age/ageMonths/abilities untouched', ch.age===35 && ch.ageMonths===11 && ch.abilities.CON===18);
  ok('dry-run reports the projected advance + crossing', dr.advances[0].ageAfter===36 && dr.advances[0].crossing && dr.advances[0].crossing.to==='middle-aged');
  ok('dry-run writes nothing to the eventLog', c.eventLog.length===0);
}
{
  // dry-run flags a death save DUE / ENTERING without rolling it.
  const c = mkCampaign(); const ch = mkChar(c, { age:70, ageMonths:0, abilities:{CON:14}, savingThrows:{death:8} });
  const dr = ACKS.processAgingForTurn(c, { dryRun:true });
  ok('dry-run flags a threshold being ENTERED (no roll, no mutation)', dr.deathSaves.some(d=>d.entering===true && d.thresholdKey==='old') && ch.agingDeathSave===null);
  // arm for real, then a dry-run with the counter at 1 flags "due this month".
  advance(c, 1, RNG0); // arm due 1 (no — age 70→71? ageMonths 0→1, no rollover; threshold reached → arm)
  const dr2 = ACKS.processAgingForTurn(c, { dryRun:true });
  ok('dry-run flags a save DUE this month without rolling', dr2.deathSaves.some(d=>d.dueThisMonth===true) && ch.lifecycleState!=='deceased');
}

// =============================================================================
section('characterAgingInfo — the sheet read accessor');
{
  ok('null age → {age:null}', ACKS.characterAgingInfo({ race:'human', age:null }).age === null);
  const info = ACKS.characterAgingInfo({ race:'human', age:40, abilities:{CON:12} });
  ok('reports category + label + next old-age save', info.category==='middle-aged' && info.categoryLabel==='Middle Aged' && info.nextOldAgeSave && info.nextOldAgeSave.key==='old' && info.nextOldAgeSave.age===68);
  ok('ageless elf flagged ageless', ACKS.characterAgingInfo({ race:'elf', age:80 }).ageless === true);
  const pend = { race:'human', age:71, abilities:{CON:14}, agingDeathSave:{ dueInMonths:3, thresholdKey:'old', resolved:[] } };
  ok('reports a pending scheduled save', ACKS.characterAgingInfo(pend).pendingSave.dueInMonths===3);
}

// =============================================================================
section('rollStartingAge (RR p.19 — class-keyed)');
{
  ok('fighter spec is 17+1d6', ACKS.startingAgeSpecFor('Fighter')==='17+1d6');
  ok('mage spec is 17+3d6', ACKS.startingAgeSpecFor('Mage')==='17+3d6');
  ok('elven nightblade spec is 75+5d4', ACKS.startingAgeSpecFor('Elven Nightblade')==='75+5d4');
  ok('unknown class falls back to 17+1d6', ACKS.startingAgeSpecFor('Squire')==='17+1d6');
  ok('rollStartingAge fighter is in [18..23]', (() => { for(let i=0;i<50;i++){ const a=ACKS.rollStartingAge('fighter', Math.random); if(a<18||a>23) return false; } return true; })());
  ok('rollStartingAge fighter with rng 0.5 → 21 (17 + a 4)', ACKS.rollStartingAge('fighter', ()=>0.5)===21);
}

// =============================================================================
section('commitTurn + proposeMonthlyTurn integration (the demo — the hook fires on a real month)');
{
  require(path.join(__dirname, '..', 'acks-demo-template.js'));
  function lcg(seed){ let s = seed>>>0; return () => { s = (1103515245*s + 12345)>>>0; return s/4294967296; }; }
  const rng = lcg(42);
  const demo = ACKS.migrateCampaign(JSON.parse(JSON.stringify(global.ACKS_DEMO_TEMPLATE)));
  const ch = demo.characters[0];
  ch.age = 35; ch.ageMonths = 11; ch.race = 'human';
  const conBefore = ch.abilities.CON;
  const p = ACKS.proposeMonthlyTurn(demo, { rng });
  ok('proposeMonthlyTurn surfaces an agingProposal (the propose-ratify preview)', !!p.agingProposal && Array.isArray(p.agingProposal.advances));
  ok('the proposal previews the crossing without mutating', p.agingProposal.advances.some(a => a.characterId===ch.id && a.crossing && a.crossing.to==='middle-aged') && ch.age===35);
  const res = ACKS.commitTurn(demo, p, { rng });
  ok('commitTurn runs the aging pass (agingResult.ran)', res.agingResult && res.agingResult.ran === true);
  ok('the demo character aged 35→36 with the −2 CON adjustment', ch.age===36 && ch.ageCategory==='middle-aged' && ch.abilities.CON===conBefore-2);
  ok('an aging-milestone event landed in the demo eventLog', demo.eventLog.some(e => e.event.kind==='aging-milestone' && e.event.payload.characterId===ch.id));
  ok('demo characters left unseeded (age undefined/null) are skipped — migrate-no-op safe', demo.characters.slice(1).every(x => x.age == null));
}

// =============================================================================
// === Character Lifecycle CL-2 (burst5) — disease (JJ p.84) ===================
// Locks the JJ p.84 disease engine: the six-disease table (save bonuses / onset+symptom / death
// thresholds), the 1d100 Disease Type roll (open at both ends), contractDisease (made save → no
// infection; a failed save → infected; willDie by margin AND by natural-1), the slot-57 day-tick
// consumer (infected → symptomatic [incapacitated] → recover [back to active] / die [deceased]),
// the pure-handler-mutates-nothing discipline, the full proposeDayTick→commitDayTick pipeline
// emitting disease-recovered, the auto-pause-on-disease pause, cure / identify, the reads, the
// D1 incapacitation interplay, and the migrate-no-op (the demo carries no diseases).
// =============================================================================
section('CL-2 disease — the Disease Type table (JJ p.84)');
{
  const DT = ACKS.DISEASE_TYPES; const by = id => DT.find(d => d.id === id);
  ok('six diseases in the table', Array.isArray(DT) && DT.length === 6);
  ok('Plague: max 5, save +0, onset 1d4, symptom 1d8, death by 6+', by('plague').max===5 && by('plague').saveBonus===0 && by('plague').onset==='1d4' && by('plague').symptom==='1d8' && by('plague').deathThreshold===6);
  ok('Putrid Fever: max 15, +0, onset 2d4, symptom 14d, death by 7+', by('putrid-fever').max===15 && by('putrid-fever').saveBonus===0 && by('putrid-fever').onset==='2d4' && by('putrid-fever').symptom===14 && by('putrid-fever').deathThreshold===7);
  ok('Spotted Pox: max 30, +1, symptom 21d, death by 8+, disfiguring', by('spotted-pox').max===30 && by('spotted-pox').saveBonus===1 && by('spotted-pox').symptom===21 && by('spotted-pox').deathThreshold===8 && by('spotted-pox').disfiguring===true);
  ok('Bilious Fever: max 50, +2, symptom 28d, death by 8+', by('bilious-fever').max===50 && by('bilious-fever').saveBonus===2 && by('bilious-fever').symptom===28 && by('bilious-fever').deathThreshold===8);
  ok('Ague: max 75, +3, symptom 1d4w, death by 10+', by('ague').max===75 && by('ague').saveBonus===3 && by('ague').symptom==='1d4w' && by('ague').deathThreshold===10);
  ok('Bloody Flux: max 100, +4, onset 1d4, symptom 7d, death only on a natural 1', by('bloody-flux').max===100 && by('bloody-flux').saveBonus===4 && by('bloody-flux').symptom===7 && by('bloody-flux').deathThreshold===Infinity);
}
ok("event kind 'disease-contracted' is registered", ACKS.isEventKindKnown('disease-contracted'));
ok("event kind 'disease-recovered' is registered", ACKS.isEventKindKnown('disease-recovered'));
ok('both disease events opt out of the Event Wizard', !ACKS.isWizardEmittable('disease-contracted') && !ACKS.isWizardEmittable('disease-recovered'));
ok('exports the disease verbs + reads + consumer', typeof ACKS.contractDisease==='function' && typeof ACKS.cureDisease==='function' && typeof ACKS.identifyDisease==='function' && typeof ACKS.characterDiseaseInfo==='function' && typeof ACKS.proposeDiseaseDay==='function' && typeof ACKS.advanceDiseases==='function');
ok('blankCharacter does NOT seed diseases (init-on-write, migrate-no-op)', ACKS.blankCharacter({}).diseases === undefined);

section('CL-2 disease — diseaseTypeForRoll (1d100, open at both ends)');
{
  const t = r => ACKS.diseaseTypeForRoll(r).id;
  ok('5→plague, 6→putrid, 16→pox, 31→bilious, 51→ague, 76→flux', t(5)==='plague' && t(6)==='putrid-fever' && t(16)==='spotted-pox' && t(31)==='bilious-fever' && t(51)==='ague' && t(76)==='bloody-flux');
  ok('upper boundaries: 15→putrid, 30→pox, 50→bilious, 75→ague, 100→flux', t(15)==='putrid-fever' && t(30)==='spotted-pox' && t(50)==='bilious-fever' && t(75)==='ague' && t(100)==='bloody-flux');
  ok('open ends: a negative modified roll → Plague (worst); >100 → Bloody Flux', t(-7)==='plague' && t(0)==='plague' && t(150)==='bloody-flux');
}

section('CL-2 disease — contractDisease (the Death save + willDie, JJ p.84)');
{
  // a made save → no infection.
  const c = mkCampaign(); const ch = mkChar(c, { name:'Aelric', savingThrows:{death:11} });
  const r = ACKS.contractDisease(c, ch.id, { diseaseType:'ague', forcedSave:20 }); // ague +3 → 23 vs 11 → saved
  ok('a made save → no infection (infected:false), nothing pushed', r.infected===false && (ch.diseases===undefined || ch.diseases.length===0));
  ok('no disease-contracted event on a made save', !c.eventLog.some(e=>e.event.kind==='disease-contracted'));
}
{
  // a failed save by a wide margin → infected + willDie.
  const c = mkCampaign(); const ch = mkChar(c, { name:'Mira', savingThrows:{death:15} });
  const r = ACKS.contractDisease(c, ch.id, { diseaseType:'plague', forcedSave:2, forcedOnset:3, forcedSymptom:5 }); // total 2 vs 15 → failed by 13 ≥ 6
  ok('a failed save → infected, record pushed (init-on-write)', r.phase==='infected' && Array.isArray(ch.diseases) && ch.diseases.length===1);
  ok('willDie when the margin ≥ the death threshold (failed by 13 ≥ 6)', r.willDie===true && r.failedBy===13);
  ok('onset/symptom set (forced 3/5)', r.onsetRemaining===3 && r.symptomRemaining===5);
  ok('a disease-contracted event lands with the character as subject', (()=>{ const e=c.eventLog.find(x=>x.event.kind==='disease-contracted'); return e && e.event.context.relatedEntities[0].id===ch.id && e.event.context.relatedEntities[0].role==='subject' && e.event.payload.willDie===true; })());
}
{
  // failed by LESS than the threshold → infected but will recover.
  const c = mkCampaign(); const ch = mkChar(c, { name:'Tomas', savingThrows:{death:15} });
  const r = ACKS.contractDisease(c, ch.id, { diseaseType:'plague', forcedSave:12 }); // failed by 3 < 6 → recover
  ok('failed by less than the threshold → infected but willDie:false', r.phase==='infected' && r.willDie===false && r.failedBy===3);
}
{
  // a NATURAL 1 always fails AND kills (even Bloody Flux, which otherwise only kills on a nat 1).
  const c = mkCampaign(); const ch = mkChar(c, { name:'Cassian', savingThrows:{death:4} });
  const r = ACKS.contractDisease(c, ch.id, { diseaseType:'bloody-flux', forcedSave:1 }); // nat 1: total 5 ≥ 4 but fails → infected + willDie
  ok('a natural 1 fails despite a made total → infected + willDie', r.phase==='infected' && r.naturalOne===true && r.willDie===true);
}
{
  // the context modifier shifts the Disease Type roll (−10 jungle on a d100=12 → 2 → Plague).
  const c = mkCampaign(); const ch = mkChar(c, { name:'Nessa', savingThrows:{death:20} });
  const r = ACKS.contractDisease(c, ch.id, { forcedD100:12, modifier:-10, forcedSave:1 });
  ok('a context modifier shifts the Disease Type roll (−10 → Plague)', r.diseaseType==='plague');
}

section('CL-2 disease — the slot-57 day-tick consumer (onset → symptomatic → resolve)');
ok('slot-57 disease day-consumer registered with the disease pause trigger', ACKS.dayConsumersInOrder().some(x=>x.name==='disease' && x.order===57 && (x.pauseTriggers||[]).indexOf('disease')>=0));
{
  // infected (onset 2) → symptomatic [incapacitated] → recovered [back to active] (willDie:false).
  const c = mkCampaign(); const ch = mkChar(c, { name:'Halvard', savingThrows:{death:15} });
  ACKS.contractDisease(c, ch.id, { diseaseType:'putrid-fever', forcedSave:12, forcedOnset:2, forcedSymptom:3 });
  ACKS.advanceDiseases(c, 2);
  ok('after onset elapses → symptomatic + incapacitated', ch.diseases[0].phase==='symptomatic' && ch.lifecycleState==='incapacitated');
  ACKS.advanceDiseases(c, 3);
  ok('after symptom elapses (willDie:false) → recovered + back to active', ch.diseases[0].phase==='recovered' && ch.diseases[0].resolved===true && ch.lifecycleState==='active');
}
{
  // willDie path → died + deceased.
  const c = mkCampaign(); const ch = mkChar(c, { name:'Doomed', savingThrows:{death:15} });
  ACKS.contractDisease(c, ch.id, { diseaseType:'plague', forcedSave:2, forcedOnset:1, forcedSymptom:1 });
  ACKS.advanceDiseases(c, 1); ACKS.advanceDiseases(c, 1);
  ok('a willDie disease resolves to died → deceased + alive:false', ch.diseases[0].phase==='died' && ch.lifecycleState==='deceased' && ch.alive===false);
}
{
  // the PURE handler proposes without mutating + labels the record.
  const c = mkCampaign(); const ch = mkChar(c, { name:'Pure', savingThrows:{death:15} });
  ACKS.contractDisease(c, ch.id, { diseaseType:'ague', forcedSave:8, forcedOnset:4, forcedSymptom:7 });
  const before = ch.diseases[0].onsetRemaining;
  const prop = ACKS.proposeDiseaseDay(c, {});
  ok('proposeDiseaseDay does NOT mutate + labels the record', ch.diseases[0].onsetRemaining===before && prop.pendingRecords.length===1 && /Ague/.test(prop.pendingRecords[0].label));
}
{
  // the full day-tick pipeline (propose → commit) emits disease-recovered with the subject context.
  const c = mkCampaign(); const ch = mkChar(c, { name:'Pipeline', savingThrows:{death:15}, hexId:'hex-b' });
  ACKS.contractDisease(c, ch.id, { diseaseType:'plague', forcedSave:12, forcedOnset:1, forcedSymptom:1 });
  ACKS.commitDayTick(c, ACKS.proposeDayTick(c, 2, { force:true }), null);
  ok('the day-tick pipeline emits disease-recovered (recovered)', c.eventLog.some(e=>e.event.kind==='disease-recovered' && e.event.payload.outcome==='recovered'));
  ok('the recovery narrative + subject hex context', (()=>{ const e=c.eventLog.find(x=>x.event.kind==='disease-recovered'); return e && /recovers from Plague/.test(e.result.narrativeSummary) && e.event.context.primaryHexId==='hex-b'; })());
}
{
  // a non-forced multi-day advance PAUSES on the symptomatic flip (auto-pause-on-disease default-on).
  const c = mkCampaign(); const ch = mkChar(c, { name:'Pauser', savingThrows:{death:15} });
  ACKS.contractDisease(c, ch.id, { diseaseType:'bilious-fever', forcedSave:12, forcedOnset:1, forcedSymptom:9 });
  const p = ACKS.proposeDayTick(c, 12, {});
  ok('a multi-day advance pauses on the symptomatic transition', p.paused===true && p.daysAdvanced<12 && p.pauseReasons.some(r=>r.trigger==='disease'));
}

section('CL-2 disease — cure, identify, the reads, the D1 interplay');
{
  const c = mkCampaign(); const ch = mkChar(c, { name:'Curable', savingThrows:{death:15} });
  const rec = ACKS.contractDisease(c, ch.id, { diseaseType:'plague', forcedSave:2, forcedOnset:2, forcedSymptom:9 }); // willDie:true
  ACKS.advanceDiseases(c, 2);
  ok('symptomatic + incapacitated before the cure', ch.diseases[0].phase==='symptomatic' && ch.lifecycleState==='incapacitated');
  ACKS.cureDisease(c, ch.id, rec.id, { method:'cure disease' });
  ok('cure → resolved (recovered) + incapacitation cleared + willDie reset', ch.diseases[0].resolved===true && ch.diseases[0].phase==='recovered' && ch.diseases[0].willDie===false && ch.lifecycleState==='active');
  ok('a cure emits disease-recovered (cured:true)', c.eventLog.some(e=>e.event.kind==='disease-recovered' && e.event.payload.cured===true));
}
{
  const c = mkCampaign(); const ch = mkChar(c, { name:'Diagnosed', savingThrows:{death:15} });
  const rec = ACKS.contractDisease(c, ch.id, { diseaseType:'ague', forcedSave:8, forcedOnset:2, forcedSymptom:7 });
  ACKS.identifyDisease(c, ch.id, rec.id);
  ok('identify on an infected character → sensed', ch.diseases[0].identifiedLevel==='sensed' && ch.diseases[0].prognosisKnown===false);
  ACKS.advanceDiseases(c, 2);
  ACKS.identifyDisease(c, ch.id, rec.id);
  ok('identify on a symptomatic character → identified', ch.diseases[0].identifiedLevel==='identified');
  ACKS.identifyDisease(c, ch.id, rec.id, { level:'prognosis' });
  ok('a further throw → prognosis (prognosisKnown)', ch.diseases[0].identifiedLevel==='prognosis' && ch.diseases[0].prognosisKnown===true);
}
{
  const c = mkCampaign(); const a = mkChar(c, { id:'a', name:'A', savingThrows:{death:15} }); mkChar(c, { id:'b', name:'B', savingThrows:{death:15} });
  ok('anyDiseased false on a clean campaign', ACKS.anyDiseased(c)===false);
  ACKS.contractDisease(c, 'a', { diseaseType:'plague', forcedSave:2, forcedOnset:3, forcedSymptom:5 });
  ok('anyDiseased true once a character is infected', ACKS.anyDiseased(c)===true);
  const info = ACKS.characterDiseaseInfo(a);
  ok('characterDiseaseInfo reports the active disease + phase + days remaining', info.count===1 && info.diseases[0].diseaseType==='plague' && info.diseases[0].phase==='infected' && info.diseases[0].daysRemaining===3);
  ACKS.cureDisease(c, 'a', info.diseases[0].id);
  ok('characterActiveDiseases excludes a resolved disease', ACKS.characterActiveDiseases(a).length===0);
}
if(typeof ACKS.applyMortalWound === 'function' && typeof ACKS.rollMortalWound === 'function'){
  // a disease recovery does NOT clear incapacitation while a wound still holds it (D1 interplay).
  const c = mkCampaign(); const ch = mkChar(c, { name:'Both', savingThrows:{death:15}, abilities:{STR:10,INT:10,WIL:10,DEX:10,CON:12,CHA:10}, extra:{ hp:{ current:5, max:10, hitDice:'1d8' } } });
  const wres = ACKS.rollMortalWound(ch, { abstract:true, conditionId:'critically-wounded', forcedD6:6 });
  ACKS.applyMortalWound(c, ch.id, wres, { healedToOneHp:true });
  ok('the wound incapacitates the character', ch.lifecycleState==='incapacitated');
  const drec = ACKS.contractDisease(c, ch.id, { diseaseType:'ague', forcedSave:8, forcedOnset:1, forcedSymptom:9 });
  ACKS.advanceDiseases(c, 1);
  ACKS.cureDisease(c, ch.id, drec.id);
  ok('curing the disease keeps the character incapacitated while a wound bed-rest remains', ch.lifecycleState==='incapacitated');
} else {
  ok('D1 wound-interplay test skipped (mortal-wounds module not present)', true);
}

section('CL-2 disease — migrate-no-op (the demo carries no diseases)');
{
  require(path.join(__dirname, '..', 'acks-demo-template.js'));
  const demo = ACKS.migrateCampaign(JSON.parse(JSON.stringify(global.ACKS_DEMO_TEMPLATE)));
  ok('no demo character carries a diseases[] field after migrate (init-on-write)', demo.characters.every(c => c.diseases === undefined));
  ok('anyDiseased(demo) is false', ACKS.anyDiseased(demo)===false);
  const elBefore = demo.eventLog.length;
  ACKS.advanceDiseases(demo, 5);
  ok('advancing diseases on the demo is a no-op (no disease events)', demo.eventLog.length===elBefore && !demo.eventLog.some(e=>e.event.kind && /disease/.test(e.event.kind)));
}

// =============================================================================
console.log('\n' + (fail === 0 ? '✅' : '❌') + ' lifecycle.smoke: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('   failures: ' + failures.join(' · ')); process.exit(1); }
