/* tests/lifecycle.smoke.js — Character Lifecycle CL-1 aging (RR p.19) + CL-2 disease (JJ p.84)
 *   + CL-3 persistent conditions (RR pp.507–516).
 *
 *   node tests/lifecycle.smoke.js   (or via `npm test`)
 *
 * CL-3 locks the §6 persistent-vs-combat-round classification (the doctrine made data), the two
 * unhomed persistent conditions (hypothermic 1d3 CON/exposure-day → death at 0 effective CON, ends
 * by warming; enervated daily Death save → −1 max hp on a fail, 3 successes end it, death at 0 max hp),
 * the apply/clear verbs (no stacking, warm/restore), the seeded slot-59 day-consumer (the
 * propose-mutates-nothing + stable-preview discipline + the full proposeDayTick→commitDayTick
 * pipeline), the reads, the two record-only events, and the migrate-no-op (the demo carries none).
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
// CL-3 — persistent conditions (RR pp.507–516). Locks the §6 classification (only hypothermic +
// enervated are unhomed → CL-3; the rest are Provisioning/D1/CL-2; combat-round conditions are
// Combat #140, out of scope), the apply/clear verbs, the seeded slot-59 day-consumer, the reads,
// the two events, and the migrate-no-op.
// =============================================================================
section('CL-3 conditions — data layer + registries');
{
  ok('PERSISTENT_CONDITIONS homes exactly hypothermic + enervated', ACKS.PERSISTENT_CONDITIONS.length===2 && !!ACKS.persistentConditionById('hypothermic') && !!ACKS.persistentConditionById('enervated'));
  ok('persistentConditionById returns null for a combat-round condition', ACKS.persistentConditionById('blinded')===null);
  const cl3 = ACKS.CONDITION_CLASSIFICATION.persistent.filter(p=>p.home==='cl3').map(p=>p.id);
  ok('the §6 classification marks hypothermic + enervated as cl3-homed', cl3.length===2 && cl3.indexOf('hypothermic')>=0 && cl3.indexOf('enervated')>=0);
  ok('the persistent set cross-refs the already-homed conditions', ACKS.CONDITION_CLASSIFICATION.persistent.some(p=>p.id==='dehydrated'&&p.home==='provisioning') && ACKS.CONDITION_CLASSIFICATION.persistent.some(p=>p.id==='symptomatic'&&p.home==='cl2-disease') && ACKS.CONDITION_CLASSIFICATION.persistent.some(p=>p.id==='mortally-wounded'&&p.home==='delves-d1'));
  ok('combat-round conditions are OUT of scope (→ Combat #140) + exclude the CL-3 pair', ACKS.CONDITION_CLASSIFICATION.combatRoundOutOfScope.indexOf('blinded')>=0 && ACKS.CONDITION_CLASSIFICATION.combatRoundOutOfScope.indexOf('webbed')>=0 && ACKS.CONDITION_CLASSIFICATION.combatRoundOutOfScope.indexOf('hypothermic')<0);
}
ok("event kind 'condition-applied' is registered", ACKS.isEventKindKnown('condition-applied'));
ok("event kind 'condition-cleared' is registered", ACKS.isEventKindKnown('condition-cleared'));
ok('both condition events opt out of the Event Wizard', !ACKS.isWizardEmittable('condition-applied') && !ACKS.isWizardEmittable('condition-cleared'));
ok('exports the condition verbs + reads + consumer', typeof ACKS.applyCondition==='function' && typeof ACKS.clearCondition==='function' && typeof ACKS.characterConditionInfo==='function' && typeof ACKS.characterEffectiveCon==='function' && typeof ACKS.anyConditioned==='function' && typeof ACKS.proposeConditionDay==='function' && typeof ACKS.advanceConditions==='function');
ok('blankCharacter does NOT seed conditions (init-on-write → migrate-no-op)', ACKS.blankCharacter({}).conditions === undefined);

section('CL-3 conditions — applyCondition (RR pp.507–516)');
{
  const c = mkCampaign(); const ch = mkChar(c, { name:'Frostbit', abilities:{STR:10,INT:10,WIL:10,DEX:10,CON:12,CHA:10} });
  ok('a fresh character has no conditions[] (init-on-write)', ch.conditions === undefined);
  const rec = ACKS.applyCondition(c, ch.id, 'hypothermic');
  ok('applyCondition pushes a record + emits condition-applied', Array.isArray(ch.conditions) && ch.conditions.length===1 && rec.condition==='hypothermic' && rec.conLost===0 && rec.conBase===12 && c.eventLog.some(e=>e.event.kind==='condition-applied'));
  ok('the condition-applied event carries the subject context', (()=>{ const e=c.eventLog.find(x=>x.event.kind==='condition-applied'); return e && e.event.context.relatedEntities[0].id===ch.id && e.event.context.relatedEntities[0].role==='subject'; })());
  const same = ACKS.applyCondition(c, ch.id, 'hypothermic');
  ok('applyCondition does NOT stack a duplicate (returns the active instance)', same===rec && ch.conditions.length===1 && c.eventLog.filter(e=>e.event.kind==='condition-applied').length===1);
  ok('applyCondition returns null for an unknown condition', ACKS.applyCondition(c, ch.id, 'blinded')===null);
}
{
  const c = mkCampaign(); const ch = mkChar(c, { name:'Drained', savingThrows:{death:15} });
  const rec = ACKS.applyCondition(c, ch.id, 'enervated');
  ok('applyCondition(enervated) seeds successes:0 + maxHpLost:0', rec.condition==='enervated' && rec.successes===0 && rec.maxHpLost===0);
  ch.lifecycleState='deceased'; ch.alive=false;
  ok('applyCondition on a deceased character → null', ACKS.applyCondition(c, ch.id, 'hypothermic')===null);
}

section('CL-3 conditions — clearCondition (warm / restore, RR pp.507–516)');
{
  const c = mkCampaign(); const ch = mkChar(c, { name:'Warmed', abilities:{STR:10,INT:10,WIL:10,DEX:10,CON:12,CHA:10} });
  ACKS.applyCondition(c, ch.id, 'hypothermic');
  ACKS.commitConditionRecord(c, ACKS.proposeConditionDay(c, { rng:()=>0.99 }).pendingRecords[0]); // 1d3=3 → conLost 3
  ok('effective CON drops while hypothermic', ACKS.characterEffectiveCon(ch)===9);
  const cl = ACKS.clearCondition(c, ch.id, 'hypothermic', { method:'warmed' });
  ok('warming resolves the condition + restores effective CON', cl.resolved===true && cl.clearedReason==='warmed' && ACKS.characterEffectiveCon(ch)===12 && c.eventLog.some(e=>e.event.kind==='condition-cleared' && e.event.payload.outcome==='warmed'));
  ok('clearCondition on a bad ref → null', ACKS.clearCondition(c, ch.id, 'no-such-id')===null);
}
{
  const c = mkCampaign(); const ch = mkChar(c, { name:'Restored', savingThrows:{death:15}, extra:{ hp:{ current:18, max:18, hitDice:'3d8' } } });
  ACKS.applyCondition(c, ch.id, 'enervated');
  ACKS.commitConditionRecord(c, ACKS.proposeConditionDay(c, { rng:()=>0.0 }).pendingRecords[0]); // nat-1 fail → −1 max hp
  ok('enervation drains a max hp on a fail', ch.hp.max===17 && ch.conditions[0].maxHpLost===1);
  ACKS.clearCondition(c, ch.id, 'enervated', { method:'restore', restoreMaxHp:true });
  ok('clear with restoreMaxHp gives the drained max hp back', ch.hp.max===18 && ch.conditions[0].maxHpLost===0);
}
{
  const c = mkCampaign(); const ch = mkChar(c, { name:'Permadrain', savingThrows:{death:15}, extra:{ hp:{ current:18, max:18, hitDice:'3d8' } } });
  ACKS.applyCondition(c, ch.id, 'enervated');
  ACKS.commitConditionRecord(c, ACKS.proposeConditionDay(c, { rng:()=>0.0 }).pendingRecords[0]);
  ACKS.clearCondition(c, ch.id, 'enervated'); // no restoreMaxHp → the drain is permanent (RR — Restore only)
  ok('clearing without restoreMaxHp leaves the max-hp drain permanent', ch.hp.max===17);
}

section('CL-3 conditions — hypothermia (1d3 CON/exposure-day → death at 0, RR p.510)');
ok('slot-59 conditions day-consumer registered with the condition pause trigger', ACKS.dayConsumersInOrder().some(x=>x.name==='conditions' && x.order===59 && (x.pauseTriggers||[]).indexOf('condition')>=0));
{
  const c = mkCampaign(); const ch = mkChar(c, { name:'Chill', abilities:{STR:10,INT:10,WIL:10,DEX:10,CON:12,CHA:10} });
  ACKS.applyCondition(c, ch.id, 'hypothermic');
  const before = ch.conditions[0].conLost;
  const prop = ACKS.proposeConditionDay(c, { rng:()=>0.99 }); // 1d3 → 3
  ok('proposeConditionDay does NOT mutate + labels the record', ch.conditions[0].conLost===before && prop.pendingRecords.length===1 && prop.pendingRecords[0].conLossThisDay===3 && prop.pendingRecords[0].effConAfter===9 && /hypothermic/.test(prop.pendingRecords[0].label));
  ok('a still-freezing day raises a transient pause notable (deadly)', prop.notableEvents.some(e=>e.pauseTrigger==='condition' && e.transient));
  ACKS.commitConditionRecord(c, prop.pendingRecords[0]);
  ok('commit applies the CON drain (effective CON 9)', ch.conditions[0].conLost===3 && ACKS.characterEffectiveCon(ch)===9);
}
{
  const c = mkCampaign(); const ch = mkChar(c, { name:'Freezing', abilities:{STR:10,INT:10,WIL:10,DEX:10,CON:3,CHA:10} });
  ACKS.applyCondition(c, ch.id, 'hypothermic');
  const prop = ACKS.proposeConditionDay(c, { rng:()=>0.99 }); // 1d3=3 → effCon 3−3 = 0 → death
  ok('effective CON dropping to 0 → outcome died + a condition-cleared death notable', prop.pendingRecords[0].outcome==='died' && prop.notableEvents.some(e=>e.kind==='condition-cleared' && e.payload.died===true));
  ACKS.commitConditionRecord(c, prop.pendingRecords[0]);
  ok('commit → deceased + alive:false', ch.lifecycleState==='deceased' && ch.alive===false && ch.conditions[0].resolved===true);
}

section('CL-3 conditions — enervation (daily Death save → −1 max hp; 3 saves end it, RR p.508)');
{
  // nat-1 always fails (RR pp.9–10) even against a trivially low target.
  const c = mkCampaign(); const ch = mkChar(c, { name:'NatOne', savingThrows:{death:2}, extra:{ hp:{ current:10, max:10, hitDice:'2d8' } } });
  ACKS.applyCondition(c, ch.id, 'enervated');
  const prop = ACKS.proposeConditionDay(c, { rng:()=>0.0 }); // roll 1 → auto-fail
  ok('a natural 1 fails the enervation save even vs a 2+ target', prop.pendingRecords[0].saveRoll===1 && prop.pendingRecords[0].saved===false && prop.pendingRecords[0].maxHpLostAfter===1 && prop.pendingRecords[0].hpMaxAfter===9);
  ok('a failed save raises a max-hp-drain pause notable', prop.notableEvents.some(e=>e.pauseTrigger==='condition' && /maximum hp/.test(e.label)));
  ACKS.commitConditionRecord(c, prop.pendingRecords[0]);
  ok('commit drops max hp + clamps current', ch.hp.max===9 && ch.hp.current<=9 && ch.conditions[0].maxHpLost===1);
}
{
  // three successful saves end it.
  const c = mkCampaign(); const ch = mkChar(c, { name:'Survivor', savingThrows:{death:15}, extra:{ hp:{ current:20, max:20, hitDice:'4d8' } } });
  ACKS.applyCondition(c, ch.id, 'enervated');
  ACKS.advanceConditions(c, 2, { rng:()=>0.99 }); // 2 successes (roll 20)
  ok('two successes do NOT yet end it (no pause, routine progress)', ch.conditions[0].successes===2 && ch.conditions[0].resolved!==true);
  const p3 = ACKS.proposeConditionDay(c, { rng:()=>0.99 });
  ok('the 3rd success → recovered + a recovery notable', p3.pendingRecords[0].outcome==='recovered' && p3.notableEvents.some(e=>e.kind==='condition-cleared' && e.payload.outcome==='recovered'));
  ACKS.commitConditionRecord(c, p3.pendingRecords[0]);
  ok('commit resolves the condition (max hp intact — all saves made)', ch.conditions[0].resolved===true && ch.hp.max===20);
}
{
  // a routine (non-final) success raises NO pause notable (the disease-countdown idiom).
  const c = mkCampaign(); const ch = mkChar(c, { name:'Routine', savingThrows:{death:15}, extra:{ hp:{ current:20, max:20, hitDice:'4d8' } } });
  ACKS.applyCondition(c, ch.id, 'enervated');
  const prop = ACKS.proposeConditionDay(c, { rng:()=>0.99 });
  ok('a routine save success records progress without a pause notable', prop.pendingRecords[0].saved===true && prop.pendingRecords[0].successesAfter===1 && prop.notableEvents.length===0);
}
{
  // 0 max hp → death.
  const c = mkCampaign(); const ch = mkChar(c, { name:'Brink', savingThrows:{death:15}, extra:{ hp:{ current:1, max:1, hitDice:'1d8' } } });
  ACKS.applyCondition(c, ch.id, 'enervated');
  const prop = ACKS.proposeConditionDay(c, { rng:()=>0.0 }); // fail → max 1−1 = 0 → death
  ok('draining to 0 max hp → outcome died', prop.pendingRecords[0].outcome==='died' && prop.notableEvents.some(e=>e.kind==='condition-cleared' && e.payload.died===true));
  ACKS.commitConditionRecord(c, prop.pendingRecords[0]);
  ok('commit → deceased', ch.lifecycleState==='deceased' && ch.alive===false);
}

section('CL-3 conditions — the reads + anyConditioned');
{
  const c = mkCampaign(); const ch = mkChar(c, { name:'Reader', abilities:{STR:10,INT:10,WIL:10,DEX:10,CON:12,CHA:10}, savingThrows:{death:15}, extra:{ hp:{ current:20, max:20, hitDice:'4d8' } } });
  ok('anyConditioned false on a clean campaign', ACKS.anyConditioned(c)===false);
  ACKS.applyCondition(c, ch.id, 'hypothermic');
  ACKS.applyCondition(c, ch.id, 'enervated');
  ACKS.commitConditionRecord(c, ACKS.proposeConditionDay(c, { rng:()=>0.99 }).pendingRecords.find(r=>r.conditionKind==='hypothermic')); // drain 3
  ok('anyConditioned true once a condition is active', ACKS.anyConditioned(c)===true);
  const info = ACKS.characterConditionInfo(ch);
  ok('characterConditionInfo reports count + flags + effective CON + danger lines', info.count===2 && info.hypothermic===true && info.enervated===true && info.effectiveCon===9 && info.conditions.every(x=>typeof x.dangerLine==='string'));
  ok('characterEffectiveCon = base − the hypothermia drain', ACKS.characterEffectiveCon(ch)===9);
}

section('CL-3 conditions — the slot-59 day-tick pipeline + stable preview');
{
  // the full propose→commit pipeline emits condition-cleared (died) with the subject hex context.
  const c = mkCampaign(); const ch = mkChar(c, { name:'Exposed', abilities:{STR:10,INT:10,WIL:10,DEX:10,CON:3,CHA:10}, hexId:'hex-b' });
  ACKS.applyCondition(c, ch.id, 'hypothermic');
  ACKS.commitDayTick(c, ACKS.proposeDayTick(c, 1, { force:true, rng:()=>0.99 }), null); // 1d3=3 → effCon 0 → dies
  ok('the day-tick pipeline emits condition-cleared (died) with the subject hex context', (()=>{ const e=c.eventLog.find(x=>x.event.kind==='condition-cleared'); return e && e.event.payload.died===true && e.event.context.primaryHexId==='hex-b' && ch.lifecycleState==='deceased'; })());
}
{
  // a non-forced multi-day advance PAUSES on a condition (auto-pause-on-condition default-on).
  const c = mkCampaign(); const ch = mkChar(c, { name:'Pauser', abilities:{STR:10,INT:10,WIL:10,DEX:10,CON:12,CHA:10} });
  ACKS.applyCondition(c, ch.id, 'hypothermic');
  const p = ACKS.proposeDayTick(c, 7, {});
  ok('a multi-day advance pauses on the condition (auto-pause-on-condition default-on)', p.paused===true && p.daysAdvanced<7 && p.pauseReasons.some(r=>r.trigger==='condition'));
}
{
  // stable preview: re-proposing the SAME committed state reproduces the IDENTICAL seeded roll.
  const c = mkCampaign(); const ch = mkChar(c, { name:'Stable', savingThrows:{death:15}, extra:{ hp:{ current:20, max:20, hitDice:'4d8' } } });
  ACKS.applyCondition(c, ch.id, 'enervated');
  const a = ACKS.proposeConditionDay(c, {}).pendingRecords[0].saveRoll;
  const b = ACKS.proposeConditionDay(c, {}).pendingRecords[0].saveRoll;
  ok('the seeded preview is stable (re-opening reproduces the same roll)', a===b && typeof a==='number');
}

section('CL-3 conditions — migrate-no-op (the demo carries no conditions)');
{
  require(path.join(__dirname, '..', 'acks-demo-template.js'));
  const demo = ACKS.migrateCampaign(JSON.parse(JSON.stringify(global.ACKS_DEMO_TEMPLATE)));
  ok('no demo character carries a conditions[] field after migrate (init-on-write)', demo.characters.every(c => c.conditions === undefined));
  ok('anyConditioned(demo) is false', ACKS.anyConditioned(demo)===false);
  const elBefore = demo.eventLog.length;
  ACKS.advanceConditions(demo, 5);
  ok('advancing conditions on the demo is a no-op (no condition events)', demo.eventLog.length===elBefore && !demo.eventLog.some(e=>e.event.kind && /condition/.test(e.event.kind)));
}

// =============================================================================
// === Character Lifecycle CL-4a (burst8, team) — death & inheritance (RR pp.311–313) ==========
// Locks: the unified cause-tagged character-died record (recordCharacterDeath — idempotent; the four
// in-module death sites [aging old-age / disease / hypothermia / enervation] route through it cause-
// tagged); the reconcile sweep that back-fills externally-set deaths (D1/fiat); Reserve XP accrual
// (90% of no-benefit spend) + the prior-character cap; the Heroic Funeral (90% of funeral gp, heroic-
// only); the will/heir setters + characterDeathInfo; successionCandidates; resolveSuccession (promote /
// heir / back-up modes + the reserve/funeral XP + the ~10% bank-fee inheritance + no-heir treasure-lost)
// + inheritance-resolved; pendingSuccessions; and the migrate-no-op (the demo carries no death fields).
// =============================================================================
section('CL-4a death — data layer + registries');
{
  const b = ACKS.blankCharacter({});
  ok('blankCharacter seeds reserveXp:0 but NOT heir/will/death fields (migrate-no-op)',
     b.reserveXp === 0 && b.heirCharacterId === undefined && b.will === undefined && b.causeOfDeath === undefined && b.deathRecordedTurn === undefined && b.successionResolved === undefined);
  ok('exports the CL-4a verbs + reads', typeof ACKS.recordCharacterDeath==='function' && typeof ACKS.reconcileCharacterDeaths==='function' && typeof ACKS.addReserveXp==='function' && typeof ACKS.characterReserveXp==='function' && typeof ACKS.setCharacterHeir==='function' && typeof ACKS.setCharacterWill==='function' && typeof ACKS.successionCandidates==='function' && typeof ACKS.resolveSuccession==='function' && typeof ACKS.pendingSuccessions==='function' && typeof ACKS.characterDeathInfo==='function');
  ok('RAW constants (Reserve 90% / Funeral 90% / bank fee 10%)', ACKS.RESERVE_XP_RATE===0.9 && ACKS.FUNERAL_XP_RATE===0.9 && ACKS.INHERITANCE_BANK_FEE_PCT===10);
  ok('DEATH_CAUSES vocabulary includes the cause-tags', Array.isArray(ACKS.DEATH_CAUSES) && ACKS.DEATH_CAUSES.indexOf('old-age')>=0 && ACKS.DEATH_CAUSES.indexOf('wounds')>=0 && ACKS.DEATH_CAUSES.indexOf('fiat')>=0);
}
ok("event kind 'character-died' is registered", ACKS.isEventKindKnown('character-died'));
ok("event kind 'inheritance-resolved' is registered", ACKS.isEventKindKnown('inheritance-resolved'));
ok('both CL-4a events opt out of the Event Wizard', !ACKS.isWizardEmittable('character-died') && !ACKS.isWizardEmittable('inheritance-resolved'));

section('CL-4a death — recordCharacterDeath (the unified record, idempotent)');
{
  const c = mkCampaign({ turn:3 }); const ch = mkChar(c, { name:'Slain', extra:{ xp:5000 } });
  const rec = ACKS.recordCharacterDeath(c, ch.id, { cause:'battle', heroic:true });
  ok('a direct kill sets deceased + alive:false + deceasedTurn', ch.lifecycleState==='deceased' && ch.alive===false && ch.deceasedTurn===3);
  ok('the record tags the cause + heroism + stamps deathRecordedTurn', ch.causeOfDeath==='battle' && ch.diedHeroically===true && ch.deathRecordedTurn===3 && rec.cause==='battle');
  ok('a character-died event fires with the subject context + cause payload', (()=>{ const e=c.eventLog.find(x=>x.event.kind==='character-died'); return e && e.event.payload.cause==='battle' && e.event.payload.heroic===true && e.event.payload.characterId===ch.id && e.event.context.relatedEntities[0].id===ch.id && e.event.context.relatedEntities[0].role==='subject'; })());
  const rec2 = ACKS.recordCharacterDeath(c, ch.id, { cause:'fiat' });
  ok('recordCharacterDeath is idempotent (2nd call → null, no 2nd event, cause unchanged)', rec2===null && c.eventLog.filter(e=>e.event.kind==='character-died').length===1 && ch.causeOfDeath==='battle');
}

section('CL-4a death — the four in-module death sites route through it (cause-tagged at the source)');
{
  // old-age (CL-1 aging) → cause 'old-age'
  const c = mkCampaign(); const ch = mkChar(c, { age:70, ageMonths:11, abilities:{CON:14}, savingThrows:{death:18} });
  advance(c, 1, RNG0); advance(c, 1, RNG0);   // arm, then fail the Death save → die
  ok('an old-age death emits character-died cause "old-age"', ch.lifecycleState==='deceased' && ch.causeOfDeath==='old-age' && c.eventLog.some(e=>e.event.kind==='character-died' && e.event.payload.cause==='old-age' && e.event.payload.characterId===ch.id) && c.eventLog.filter(e=>e.event.kind==='character-died').length===1);
}
{
  // disease (CL-2) → cause 'disease'
  const c = mkCampaign(); const ch = mkChar(c, { name:'Doomed2', savingThrows:{death:15} });
  ACKS.contractDisease(c, ch.id, { diseaseType:'plague', forcedSave:2, forcedOnset:1, forcedSymptom:1 });
  ACKS.advanceDiseases(c, 1); ACKS.advanceDiseases(c, 1);
  ok('a disease death emits character-died cause "disease"', ch.lifecycleState==='deceased' && ch.causeOfDeath==='disease' && c.eventLog.some(e=>e.event.kind==='character-died' && e.event.payload.cause==='disease'));
}
{
  // hypothermia (CL-3) → cause 'exposure'
  const c = mkCampaign(); const ch = mkChar(c, { name:'Frozen2', abilities:{STR:10,INT:10,WIL:10,DEX:10,CON:3,CHA:10} });
  ACKS.applyCondition(c, ch.id, 'hypothermic');
  ACKS.commitConditionRecord(c, ACKS.proposeConditionDay(c, { rng:()=>0.99 }).pendingRecords[0]);  // 1d3=3 → effCon 0 → death
  ok('a hypothermia death emits character-died cause "exposure"', ch.lifecycleState==='deceased' && ch.causeOfDeath==='exposure' && c.eventLog.some(e=>e.event.kind==='character-died' && e.event.payload.cause==='exposure'));
}
{
  // enervation (CL-3) → cause 'enervation'
  const c = mkCampaign(); const ch = mkChar(c, { name:'Drained2', savingThrows:{death:15}, extra:{ hp:{ current:1, max:1, hitDice:'1d8' } } });
  ACKS.applyCondition(c, ch.id, 'enervated');
  ACKS.commitConditionRecord(c, ACKS.proposeConditionDay(c, { rng:()=>0.0 }).pendingRecords[0]);  // fail → 0 max hp → death
  ok('an enervation death emits character-died cause "enervation"', ch.lifecycleState==='deceased' && ch.causeOfDeath==='enervation' && c.eventLog.some(e=>e.event.kind==='character-died' && e.event.payload.cause==='enervation'));
}

section('CL-4a death — reconcileCharacterDeaths (back-fill deaths set outside this module: D1/battle/fiat)');
{
  const c = mkCampaign({ turn:4 });
  const wd = mkChar(c, { id:'wd', name:'Hewn' });   wd.lifecycleState='deceased'; wd.alive=false; wd.mortalWounds=[{ band:'killed' }];
  const fd = mkChar(c, { id:'fd', name:'Vanished' }); fd.lifecycleState='deceased';
  const al = mkChar(c, { id:'al', name:'Hale' });
  const out = ACKS.reconcileCharacterDeaths(c);
  ok('the sweep records exactly the un-recorded dead (not the living)', out.length===2 && al.deathRecordedTurn===undefined);
  ok('a wound death infers cause "wounds" (from mortalWounds[])', wd.causeOfDeath==='wounds' && c.eventLog.some(e=>e.event.kind==='character-died' && e.event.payload.characterId==='wd' && e.event.payload.cause==='wounds'));
  ok('an unattributable death tags cause "unknown" + stamps deathRecordedTurn', fd.causeOfDeath==='unknown' && fd.deathRecordedTurn===4);
  ok('the sweep is idempotent (a re-run records nothing new)', ACKS.reconcileCharacterDeaths(c).length===0);
  // causeByCharId override
  const c2 = mkCampaign(); const x = mkChar(c2, { id:'x', name:'Named' }); x.lifecycleState='deceased';
  ACKS.reconcileCharacterDeaths(c2, { causeByCharId:{ x:'battle' } });
  ok('causeByCharId overrides the inference', x.causeOfDeath==='battle');
}

section('CL-4a death — Reserve XP accrual (RR p.311: 90% of no-benefit spend, carried on the character)');
{
  const c = mkCampaign(); const ch = mkChar(c, { name:'Carouser' });
  ok('reserveXp starts 0', ACKS.characterReserveXp(ch)===0);
  ACKS.addReserveXp(c, ch.id, { gpSpent:1000 });
  ok('gpSpent 1000 → +900 reserve XP (90%)', ch.reserveXp===900);
  ACKS.addReserveXp(c, ch.id, { amount:100 });
  ok('a direct amount accrues + accumulates', ch.reserveXp===1000);
  ok('a reserve-xp history entry is recorded', Array.isArray(ch.history) && ch.history.some(h=>/Reserve XP/.test(h.summary||h.note||JSON.stringify(h))));
  ok('characterReserveXp is defensive (absent → 0)', ACKS.characterReserveXp({})===0 && ACKS.characterReserveXp(null)===0);
}

section('CL-4a death — will / heir setters + characterDeathInfo');
{
  const c = mkCampaign(); const ch = mkChar(c, { name:'Testator' });
  ACKS.setCharacterHeir(c, ch.id, 'chr-heir');
  ACKS.setCharacterWill(c, ch.id, { bequests:[{ kind:'stash', ref:'stash-1' }, { kind:'gp' }] });
  const info = ACKS.characterDeathInfo(ch);
  ok('heir + will set; characterDeathInfo reads them (alive)', ch.heirCharacterId==='chr-heir' && ch.will.bequests.length===2 && info.deceased===false && info.heirCharacterId==='chr-heir' && info.bequestCount===2);
  ACKS.recordCharacterDeath(c, ch.id, { cause:'old-age', heroic:false });
  const info2 = ACKS.characterDeathInfo(ch);
  ok('characterDeathInfo reads the death record (cause/label/recorded)', info2.deceased===true && info2.cause==='old-age' && info2.causeLabel==='old age' && info2.deathRecorded===true && info2.successionResolved===false);
}

section('CL-4a death — successionCandidates (heir / henchmen / party)');
{
  const c = mkCampaign();
  const lord  = mkChar(c, { id:'lord', name:'Lord' });
  const hench = mkChar(c, { id:'h1', name:'Hench' }); hench.liegeCharacterId='lord'; hench.socialTier='henchman';
  const heir  = mkChar(c, { id:'hr', name:'Heir' }); lord.heirCharacterId='hr';
  const other = mkChar(c, { id:'o', name:'Stranger' });
  lord.lifecycleState='deceased';
  const cands = ACKS.successionCandidates(c, 'lord');
  ok('candidates include the henchman + the declared heir, exclude self + strangers', cands.some(x=>x.id==='h1'&&x.relationship==='henchman') && cands.some(x=>x.id==='hr'&&x.relationship==='heir') && !cands.some(x=>x.id==='lord') && !cands.some(x=>x.id==='o'));
}

section('CL-4a death — resolveSuccession: promote a henchman + inheritance (RR pp.311–313)');
{
  const c = mkCampaign();
  const lord  = mkChar(c, { id:'lord', name:'Lord', extra:{ xp:12000, coins:{ pp:0, gp:2000, ep:0, sp:0, cp:0 } } }); lord.reserveXp=9000;
  const hench = mkChar(c, { id:'h1', name:'Hench', extra:{ xp:3000 } }); hench.liegeCharacterId='lord'; hench.socialTier='henchman';
  ACKS.recordCharacterDeath(c, lord, { cause:'battle', heroic:true });
  const res = ACKS.resolveSuccession(c, 'lord', { mode:'promote-henchman', successorCharacterId:'h1', funeralGpSpent:1000 });
  ok('reserveXpApplied = min(reserve 9000, prior XP 12000) = 9000', res.reserveXpApplied===9000);
  ok('heroic funeral = 90% of 1000 = 900 XP', res.funeralXp===900);
  ok('the henchman keeps max(own 3000, reserve 9000) + funeral 900 = 9900 XP + becomes active', hench.xp===9900 && hench.lifecycleState==='active' && hench.successorOf==='lord');
  ok('inheritance: 2000 gp purse passes minus the 10% bank fee → 1800 to the heir', res.transferredGp===1800 && res.bankFeeGp===200 && hench.coins.gp===1800 && hench.personalGp===1800);
  ok("the deceased's purse is emptied (banked treasure passed on)", lord.coins.gp===0 && lord.personalGp===0);
  ok('an inheritance-resolved event fires (subject deceased + beneficiary successor)', (()=>{ const e=c.eventLog.find(x=>x.event.kind==='inheritance-resolved'); return e && e.event.payload.deceasedId==='lord' && e.event.payload.successorId==='h1' && e.event.context.relatedEntities.some(r=>r.role==='beneficiary'&&r.id==='h1'); })());
  ok('the succession is marked resolved + idempotent', lord.successionResolved===true && lord.successorCharacterId==='h1' && ACKS.resolveSuccession(c,'lord',{}).alreadyResolved===true);
  ok('pendingSuccessions no longer lists the resolved lord', !ACKS.pendingSuccessions(c).some(x=>x.id==='lord'));
}

section('CL-4a death — resolveSuccession: a new character at the Reserve-XP floor (capped at the prior XP)');
{
  const c = mkCampaign();
  const poor = mkChar(c, { id:'p2', name:'Poor', extra:{ xp:1000 } }); poor.reserveXp=5000; poor.lifecycleState='deceased'; poor.diedHeroically=false;
  const res = ACKS.resolveSuccession(c, 'p2', { mode:'new-character', newCharacterName:'Backup', funeralGpSpent:5000 });
  ok('reserveXpApplied capped at the prior character XP (min(5000,1000)=1000)', res.reserveXpApplied===1000);
  ok('a non-heroic death earns NO funeral XP even with funeral spend', res.funeralXp===0);
  ok('a fresh successor is minted at the reserve floor + carries the reserve forward', res.createdNew===true && res.successor && res.successor.xp===1000 && res.successor.successorOf==='p2' && res.successor.reserveXp===5000 && c.characters.some(x=>x.id===res.successor.id));
  ok('resolving an un-recorded external death records character-died first', poor.deathRecordedTurn!=null && c.eventLog.some(e=>e.event.kind==='character-died'&&e.event.payload.characterId==='p2'));
}

section('CL-4a death — resolveSuccession: no heir ⇒ banked treasure lost (RR p.313)');
{
  const c = mkCampaign();
  const lonely = mkChar(c, { id:'l3', name:'Lonely', extra:{ xp:5000, coins:{ pp:0, gp:3000, ep:0, sp:0, cp:0 } } });
  lonely.lifecycleState='deceased';
  const res = ACKS.resolveSuccession(c, 'l3', { mode:'new-character', newCharacterName:'B', heirId:null });
  ok('no heir → nothing transferred, the banked treasure is recorded lost', res.transferredGp===0 && res.treasureLost===3000 && res.heirId===null);
}
if(typeof ACKS.changeStashController === 'function'){
  // a will's stash bequest changes the stash's controller to the heir on resolution.
  const c = mkCampaign();
  c.stashes = [{ id:'stash-w', kind:'personal', ownerCharacterId:'l4', ownerPartyId:null, ownerDomainId:null, items:[], history:[] }];
  const lord = mkChar(c, { id:'l4', name:'Willer', extra:{ xp:4000 } }); lord.lifecycleState='deceased';
  const heir = mkChar(c, { id:'h4', name:'Inheritor' });
  ACKS.setCharacterWill(c, 'l4', { bequests:[{ kind:'stash', ref:'stash-w' }] });
  const res = ACKS.resolveSuccession(c, 'l4', { mode:'heir', successorCharacterId:'h4', heirId:'h4' });
  ok('a will stash bequest changes the stash controller to the heir', res.stashesTransferred===1 && c.stashes[0].ownerCharacterId==='h4');
} else {
  ok('will stash-bequest test skipped (stash module not present)', true);
}

section('CL-4a death — migrate-no-op (the demo carries no death fields)');
{
  require(path.join(__dirname, '..', 'acks-demo-template.js'));
  const demo = ACKS.migrateCampaign(JSON.parse(JSON.stringify(global.ACKS_DEMO_TEMPLATE)));
  ok('no demo character carries heir/will/death fields after migrate', demo.characters.every(c => c.heirCharacterId===undefined && c.will===undefined && c.causeOfDeath===undefined && c.deathRecordedTurn===undefined && c.successionResolved===undefined));
  const before = demo.eventLog.length;
  const recs = ACKS.reconcileCharacterDeaths(demo);
  ok('reconcile on the (all-living) demo is a no-op (no deaths, no character-died)', recs.length===0 && demo.eventLog.length===before && !demo.eventLog.some(e=>e.event.kind==='character-died'));
  ok('pendingSuccessions(demo) is empty', ACKS.pendingSuccessions(demo).length===0);
}

// =============================================================================
// Character Lifecycle CL-5 (team) — character transformation (JJ pp.94–95). Locks: the reserved
// transformationState shape + the trigger catalog + the isTransformed predicate; transformCharacter
// (form required, the Spells save → keptClassAbilities, the initial alignment-drift Death save →
// retainedSelf, the lifecycleState 'transformed' flip, the reject-the-gift / After-the-Flesh auto-retain
// exceptions, the dead-can't-transform guard); the monthly drift clock folded into processAgingForTurn
// (countdown → roll-when-due, success re-arms / failure drifts, the age:null subject independence, the
// dryRun-rolls-nothing discipline, drift-emits-no-event); transformationDriftSave (the direct verb);
// revertCharacter (clears the ledger, restores 'active', emits the revert event); the read accessor; the
// two record-only events (registered + wizard-opt-out + validate); and the migrate-no-op (transformationState
// is already a null reservation — the demo carries it, stays null, and the aging pass adds no tx event).
// =============================================================================

section('CL-5 transformation — data layer + catalog + predicate');
{
  const b = ACKS.blankCharacter({});
  ok('blankCharacter reserves transformationState:null', b.transformationState === null);
  ok('isTransformed(fresh) is false', ACKS.isTransformed(b) === false);
  ok('isTransformed(null) is false', ACKS.isTransformed(null) === false);
  ok('TRANSFORMATION_TRIGGERS catalog present (7)', Array.isArray(ACKS.TRANSFORMATION_TRIGGERS) && ACKS.TRANSFORMATION_TRIGGERS.length === 7);
  ok('lycanthropy can be rejected; crossbreed cannot', ACKS.transformationTriggerById('lycanthropy').canReject === true && ACKS.transformationTriggerById('crossbreed').canReject === false);
  ok('necromantic is an After-the-Flesh trigger', ACKS.transformationTriggerById('necromantic').undeadAfterFlesh === true);
  ok('DRIFT_SAVE_DEFAULT_INTERVAL_MONTHS is 12', ACKS.DRIFT_SAVE_DEFAULT_INTERVAL_MONTHS === 12);
  ok('an unknown trigger id → null', ACKS.transformationTriggerById('zzz') === null);
}

section('CL-5 transformation — transformCharacter: form/trigger, Spells save, lifecycleState flip');
{
  const c = mkCampaign({ turn:5 });
  const w = mkChar(c, { id:'w1', name:'Garran', savingThrows:{ paralysis:15, death:11, blast:15, implements:15, spells:14 } });
  const st = ACKS.transformCharacter(c, 'w1', { form:'werewolf', trigger:'lycanthropy', forcedSpellsRoll:20, forcedDriftRoll:20 });
  ok('transformCharacter returns the transformationState', !!st && st.form === 'werewolf' && st.trigger === 'lycanthropy');
  ok('lifecycleState flips to transformed', w.lifecycleState === 'transformed');
  ok('isTransformed(w) is now true', ACKS.isTransformed(w) === true);
  ok('Spells save 20 vs 14+ → keeps class abilities', st.keptClassAbilities === true && st.classAbilitiesSave.roll === 20);
  ok('initial drift 20 vs 11+ → retains self + arms the schedule at the default 12mo', st.retainedSelf === true && st.driftSave && st.driftSave.dueInMonths === 12);
  ok('the initial drift save is recorded (initial:true)', st.alignmentDriftSaves.length === 1 && st.alignmentDriftSaves[0].initial === true);
  ok('reversible defaults true', st.reversible === true);
  ok('emits character-transformed (record-only, the character as subject)', c.eventLog.some(e => e.event.kind === 'character-transformed' && e.event.context.relatedEntities[0].id === 'w1'));
}

section('CL-5 transformation — the Spells save loses abilities; the initial drift fails at once');
{
  const c = mkCampaign();
  const w = mkChar(c, { id:'w2', name:'Mira', savingThrows:{ paralysis:15, death:11, blast:15, implements:15, spells:14 } });
  // spells nat-1 → loses abilities; drift 1 → fails (the mind drifts at the moment of transformation)
  const st = ACKS.transformCharacter(c, 'w2', { form:'wereboar', trigger:'lycanthropy', forcedSpellsRoll:1, forcedDriftRoll:1 });
  ok('Spells natural 1 → loses class abilities (even if ≥ target by total)', st.keptClassAbilities === false);
  ok('initial drift failed → retainedSelf:false + the schedule ends', st.retainedSelf === false && st.driftSave === null);
  ok('a fully-drifted character is no longer a drift subject', ACKS.isTransformed(w) === true && st.alignmentDriftSaves[0].saved === false);
}

section('CL-5 transformation — guards: a form is required; the dead cannot transform');
{
  const c = mkCampaign();
  const w = mkChar(c, { id:'w3', name:'Bran' });
  ok('no form → null (nothing transformed)', ACKS.transformCharacter(c, 'w3', { trigger:'polymorph' }) === null && w.transformationState === null);
  ok('blank form → null', ACKS.transformCharacter(c, 'w3', { form:'   ' }) === null);
  w.lifecycleState = 'deceased'; w.alive = false;
  ok('a deceased character cannot be transformed', ACKS.transformCharacter(c, 'w3', { form:'wight' }) === null);
}

section('CL-5 transformation — the auto-retain exceptions (reject the gift / After the Flesh)');
{
  const c = mkCampaign();
  const lyc = mkChar(c, { id:'r1', name:'Refuser' });
  const st1 = ACKS.transformCharacter(c, 'r1', { form:'werewolf', trigger:'lycanthropy', rejectedGift:true, forcedSpellsRoll:20 });
  ok('a lycanthrope who rejects the gift auto-retains — no drift schedule, no initial save', st1.retainedSelf === true && st1.driftSave === null && st1.rejectedGift === true && st1.alignmentDriftSaves.length === 0);
  const undead = mkChar(c, { id:'r2', name:'Revenant' });
  const st2 = ACKS.transformCharacter(c, 'r2', { form:'wight', trigger:'necromantic', afterTheFlesh:true, forcedSpellsRoll:20 });
  ok('an After-the-Flesh undead auto-retains', st2.retainedSelf === true && st2.driftSave === null && st2.afterTheFlesh === true);
  const cross = mkChar(c, { id:'r3', name:'Chimera' });
  const st3 = ACKS.transformCharacter(c, 'r3', { form:'chimera', trigger:'crossbreed', rejectedGift:true, forcedSpellsRoll:20, forcedDriftRoll:20 });
  ok('rejectedGift is ignored for a non-rejectable trigger (crossbreed still drifts/saves)', st3.rejectedGift === false && st3.driftSave && st3.driftSave.dueInMonths === 12);
}

section('CL-5 transformation — the monthly drift clock (folded into processAgingForTurn)');
{
  const c = mkCampaign({ turn:5 });
  // age:null + an ageless RACE — proves the drift pass is a DIFFERENT subject set than aging.
  const w = mkChar(c, { id:'d1', name:'Drifa', race:'elf', savingThrows:{ paralysis:15, death:15, blast:15, implements:15, spells:15 } });
  ok('the subject is age:null + ageless (not an aging subject)', w.age === null && ACKS.isAgelessRace('elf'));
  ACKS.transformCharacter(c, 'd1', { form:'werewolf', trigger:'lycanthropy', driftSaveIntervalMonths:3, forcedSpellsRoll:20, forcedDriftRoll:20 });
  ok('drift armed at the chosen 3-month interval', w.transformationState.driftSave.dueInMonths === 3);
  // month 1: counts down 3→2, no roll (RNG irrelevant) — and the aging pass surfaces out.transformations
  const r1 = ACKS.processAgingForTurn(c, { rng: RNG_HI });
  ok('processAgingForTurn surfaces out.transformations', r1.transformations && r1.transformations.ran === true);
  ok('month 1: the drift save counts down 3→2, no roll', w.transformationState.driftSave.dueInMonths === 2 && w.transformationState.alignmentDriftSaves.length === 1);
  // month 2: 2→1
  ACKS.processAgingForTurn(c, { rng: RNG_HI });
  ok('month 2: counts down 2→1', w.transformationState.driftSave.dueInMonths === 1);
  // month 3: due → roll a SUCCESS (RNG_HI → nat-20) → keeps self + re-arms to 3
  ACKS.processAgingForTurn(c, { rng: RNG_HI });
  ok('month 3 due → success keeps self + re-arms to 3mo', w.transformationState.retainedSelf === true && w.transformationState.driftSave.dueInMonths === 3 && w.transformationState.alignmentDriftSaves.length === 2);
}

section('CL-5 transformation — a due drift save that FAILS drifts the character (schedule ends)');
{
  const c = mkCampaign({ turn:2 });
  const w = mkChar(c, { id:'d2', name:'Lost', savingThrows:{ paralysis:15, death:15, blast:15, implements:15, spells:15 } });
  ACKS.transformCharacter(c, 'd2', { form:'wereboar', trigger:'lycanthropy', driftSaveIntervalMonths:1, forcedSpellsRoll:20, forcedDriftRoll:20 });
  // interval 1 → due next month; RNG0 → nat-1 → the drift save FAILS
  const r = ACKS.processAgingForTurn(c, { rng: RNG0 });
  ok('the due drift save failed → drifted', r.transformations.drifts.length === 1 && r.transformations.drifts[0].characterId === 'd2');
  ok('retainedSelf:false + the schedule ends (driftSave null)', w.transformationState.retainedSelf === false && w.transformationState.driftSave === null);
  ok('a drift entry was logged for the monthly review', r.logEntries.some(l => /Transformation —/.test(l) && /drifts away/.test(l)));
  // a fully-drifted character makes no further saves — a later month is a no-op for it
  const before = w.transformationState.alignmentDriftSaves.length;
  ACKS.processAgingForTurn(c, { rng: RNG0 });
  ok('a drifted character makes no further drift saves', w.transformationState.alignmentDriftSaves.length === before);
}

section('CL-5 transformation — a drift save emits NO event (only the two bracketing kinds)');
{
  const c = mkCampaign();
  const w = mkChar(c, { id:'d3', name:'Quiet' });
  ACKS.transformCharacter(c, 'd3', { form:'werewolf', trigger:'lycanthropy', driftSaveIntervalMonths:1, forcedSpellsRoll:20, forcedDriftRoll:20 });
  const afterTransform = c.eventLog.length;
  ACKS.processAgingForTurn(c, { rng: RNG0 });   // a due drift save (fails)
  ok('the monthly drift save adds no eventLog entry (ledger + history + log only)', c.eventLog.length === afterTransform);
}

section('CL-5 transformation — dryRun rolls nothing + mutates nothing');
{
  const c = mkCampaign();
  const w = mkChar(c, { id:'d4', name:'Preview', savingThrows:{ paralysis:15, death:15, blast:15, implements:15, spells:15 } });
  ACKS.transformCharacter(c, 'd4', { form:'werewolf', trigger:'lycanthropy', driftSaveIntervalMonths:1, forcedSpellsRoll:20, forcedDriftRoll:20 });
  const dueBefore = w.transformationState.driftSave.dueInMonths;   // 1 → due this month
  const savesBefore = w.transformationState.alignmentDriftSaves.length;
  const logBefore = c.eventLog.length;
  const r = ACKS.processAgingForTurn(c, { dryRun:true, rng: RNG0 });
  ok('dryRun flags the due drift save', r.transformations.driftSaves.some(s => s.characterId === 'd4' && s.dueThisMonth === true));
  ok('dryRun mutates nothing (no countdown, no roll, no event)', w.transformationState.driftSave.dueInMonths === dueBefore && w.transformationState.alignmentDriftSaves.length === savesBefore && c.eventLog.length === logBefore && w.transformationState.retainedSelf === true);
}

section('CL-5 transformation — transformationDriftSave (the direct verb)');
{
  const c = mkCampaign();
  const w = mkChar(c, { id:'v1', name:'Vex', savingThrows:{ paralysis:15, death:15, blast:15, implements:15, spells:15 } });
  ACKS.transformCharacter(c, 'v1', { form:'werewolf', trigger:'lycanthropy', forcedSpellsRoll:20, forcedDriftRoll:20 });
  const res = ACKS.transformationDriftSave(c, 'v1', { forcedRoll:1 });   // fail
  ok('a direct drift save resolves (failed → drifted)', res && res.saved === false && res.drifted === true && w.transformationState.retainedSelf === false);
  ok('a direct drift save on an already-drifted character → null', ACKS.transformationDriftSave(c, 'v1', { forcedRoll:20 }) === null);
  const r2 = mkChar(c, { id:'v2', name:'Refuser2' });
  ACKS.transformCharacter(c, 'v2', { form:'werewolf', trigger:'lycanthropy', rejectedGift:true, forcedSpellsRoll:20 });
  ok('a direct drift save on an auto-retain (rejected gift) character → null', ACKS.transformationDriftSave(c, 'v2') === null);
  const r3 = mkChar(c, { id:'v3', name:'Normal' });
  ok('a direct drift save on a non-transformed character → null', ACKS.transformationDriftSave(c, 'v3') === null);
}

section('CL-5 transformation — revertCharacter');
{
  const c = mkCampaign({ turn:7 });
  const w = mkChar(c, { id:'rv1', name:'Cured' });
  ACKS.transformCharacter(c, 'rv1', { form:'werewolf', trigger:'lycanthropy', forcedSpellsRoll:20, forcedDriftRoll:20 });
  const rev = ACKS.revertCharacter(c, 'rv1', { reason:'cured' });
  ok('revert returns the form/trigger', rev && rev.form === 'werewolf' && rev.trigger === 'lycanthropy');
  ok('revert clears transformationState + restores lifecycleState active', w.transformationState === null && w.lifecycleState === 'active');
  ok('isTransformed(w) is false after revert', ACKS.isTransformed(w) === false);
  ok('revert emits transformation-reverted', c.eventLog.some(e => e.event.kind === 'transformation-reverted' && e.event.payload.reason === 'cured'));
  ok('reverting a non-transformed character → null', ACKS.revertCharacter(c, 'rv1') === null);
  const dead = mkChar(c, { id:'rv2', name:'Corpse' });
  ACKS.transformCharacter(c, 'rv2', { form:'wight', trigger:'necromantic', forcedSpellsRoll:20, forcedDriftRoll:20 });
  dead.lifecycleState = 'deceased'; dead.alive = false;
  ok('a deceased transformed character cannot be reverted', ACKS.revertCharacter(c, 'rv2') === null);
}

section('CL-5 transformation — characterTransformationInfo (the read accessor)');
{
  const c = mkCampaign();
  const w = mkChar(c, { id:'i1', name:'Reader', savingThrows:{ paralysis:15, death:11, blast:15, implements:15, spells:14 } });
  ok('info on a non-transformed character: { transformed:false }', ACKS.characterTransformationInfo(w).transformed === false);
  ACKS.transformCharacter(c, 'i1', { form:'werewolf', trigger:'lycanthropy', driftSaveIntervalMonths:6, forcedSpellsRoll:20, forcedDriftRoll:20 });
  const info = ACKS.characterTransformationInfo(w);
  ok('info reflects form/trigger/kept/retained/reversible', info.transformed === true && info.form === 'werewolf' && info.triggerLabel === 'Lycanthropy' && info.keptClassAbilities === true && info.retainedSelf === true && info.reversible === true);
  ok('info reports the drift schedule + the ledger count', info.driftSaveDueInMonths === 6 && info.driftSaveCount === 1 && info.lastDriftSave && info.lastDriftSave.saved === true && info.drifted === false);
}

section('CL-5 transformation — the two events are registered + wizard-opt-out + validate');
{
  ok('character-transformed + transformation-reverted are known event kinds', ACKS.isEventKindKnown('character-transformed') && ACKS.isEventKindKnown('transformation-reverted'));
  ok('both are opted out of the Event Wizard (engine-owned, record-only)', !ACKS.isWizardEmittable('character-transformed') && !ACKS.isWizardEmittable('transformation-reverted'));
  const c = mkCampaign();
  mkChar(c, { id:'e1', name:'Valid' });
  ACKS.transformCharacter(c, 'e1', { form:'werewolf', trigger:'lycanthropy', forcedSpellsRoll:20, forcedDriftRoll:20 });
  ACKS.revertCharacter(c, 'e1');
  const tx = c.eventLog.find(e => e.event.kind === 'character-transformed').event;
  const rev = c.eventLog.find(e => e.event.kind === 'transformation-reverted').event;
  ok('the emitted transformation events validate against their schemas', ACKS.validateEvent(tx) === true && ACKS.validateEvent(rev) === true);
}

section('CL-5 transformation — migrate-no-op (the demo carries transformationState:null)');
{
  require(path.join(__dirname, '..', 'acks-demo-template.js'));
  const demo = ACKS.migrateCampaign(JSON.parse(JSON.stringify(global.ACKS_DEMO_TEMPLATE)));
  ok('every demo character carries transformationState:null after migrate', demo.characters.every(c => c.transformationState === null));
  ok('no demo character is transformed', demo.characters.every(c => ACKS.isTransformed(c) === false));
  ACKS.processAgingForTurn(demo, { rng: RNG_HI });   // no transformed characters → no drift, no tx event
  ok('the aging+drift pass on the (untransformed) demo adds no transformation event', !demo.eventLog.some(e => e.event.kind === 'character-transformed' || e.event.kind === 'transformation-reverted'));
}

// =============================================================================
console.log('\n' + (fail === 0 ? '✅' : '❌') + ' lifecycle.smoke: ' + pass + ' passed, ' + fail + ' failed');
if (fail) { console.log('   failures: ' + failures.join(' · ')); process.exit(1); }
