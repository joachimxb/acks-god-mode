'use strict';
/* tests/vagaries.smoke.js — Phase 3 Military W8: the Vagaries of Recruitment / War / Battle
 * (JJ pp.110–117). Three OPTIONAL d100 event tables behind three default-OFF house rules.
 *
 * Locks: the three tables are contiguous 1–100 (the RAW print-overlaps fixed — Siege Train
 * 33-36, Deserters 46-50, Piles of Dead 76-80) with the right RAW cells; rollVagaryTable's
 * mod / clamp / best-worst flag; vagaryRealmUnitSize (company/battalion/brigade by realm tier);
 * the recruitment monthly driver (drive / levy / muster detection + rule gating + event shape);
 * the war weekly driver (cadence, siege double-take-worse, the Good/Ill Omen ±10-to-next-roll
 * carry, the commit-branch state mutation); the battle 1d4 driver; and the registry/event wiring.
 * Run: node tests/vagaries.smoke.js  (or via npm test).
 */
const { load } = require('./_engine.js');
const ACKS = load();

let passed = 0, failed = 0;
function ok(label, cond, extra){ if(cond){ passed++; } else { failed++; console.error('  FAIL: ' + label + (extra ? ' — ' + extra : '')); } }
function section(s){ console.log('\n# ' + s); }
// rng that yields an exact 1d100 roll R: floor(((R-0.5)/100)*100)+1 === R
const rngFor = R => () => (R - 0.5) / 100;
// sequence rng — successive scripted values
function seqRng(arr){ let i = 0; return () => arr[(i++) % arr.length]; }

// ── 1. exports + table integrity ────────────────────────────────────────────────────────────────
section('exports + table integrity');
['VAGARY_OF_RECRUITMENT','VAGARY_OF_WAR','VAGARY_OF_BATTLE','VAGARY_TABLES','lookupVagaryRow',
 'rollVagaryTable','vagaryNarrative','vagaryRealmUnitSize','rulersRecruitingThisMonth',
 'processRecruitmentVagariesForTurn','warVagaryDue','armyInSiege','rollWarVagary','rollBattleVagaries']
  .forEach(fn => ok('ACKS.' + fn + ' exported', typeof ACKS[fn] === 'function' || (fn.startsWith('VAGARY') && ACKS[fn])));

function contiguous(table){
  let prev = 0;
  for(const r of table){ if(r.min !== prev + 1) return false; prev = r.max; }
  return prev === 100;
}
ok('Recruitment table contiguous 1–100', contiguous(ACKS.VAGARY_OF_RECRUITMENT));
ok('War table contiguous 1–100',         contiguous(ACKS.VAGARY_OF_WAR));
ok('Battle table contiguous 1–100',      contiguous(ACKS.VAGARY_OF_BATTLE));
ok('Recruitment = 19 rows', ACKS.VAGARY_OF_RECRUITMENT.length === 19, 'got ' + ACKS.VAGARY_OF_RECRUITMENT.length);
ok('War = 27 rows',         ACKS.VAGARY_OF_WAR.length === 27, 'got ' + ACKS.VAGARY_OF_WAR.length);
ok('Battle = 21 rows',      ACKS.VAGARY_OF_BATTLE.length === 21, 'got ' + ACKS.VAGARY_OF_BATTLE.length);
// every row has key/name/brief/effect.category + a JJ cite
const allRows = [].concat(ACKS.VAGARY_OF_RECRUITMENT, ACKS.VAGARY_OF_WAR, ACKS.VAGARY_OF_BATTLE);
ok('every row has key/name/brief/effect.category', allRows.every(r => r.key && r.name && r.brief && r.effect && r.effect.category));
ok('every row cites a JJ page', allRows.every(r => /JJ p/.test(r.effect.cite || '')));
ok('every key is unique', new Set(allRows.map(r => r.key)).size === allRows.length);

// ── 2. RAW spot cells (incl. the print-overlap fixes) ────────────────────────────────────────────
section('RAW spot cells');
const lr = (t, n) => ACKS.lookupVagaryRow(t, n);
ok('Recruitment 1 → War Declared',        lr(ACKS.VAGARY_OF_RECRUITMENT, 1).key === 'war-declared');
ok('Recruitment 15 → Bidding War',        lr(ACKS.VAGARY_OF_RECRUITMENT, 15).key === 'bidding-war');
ok('Recruitment 51 → All Quiet (none)',   lr(ACKS.VAGARY_OF_RECRUITMENT, 51).effect.category === 'none');
ok('Recruitment 60 → Tribute (gp-grant)', lr(ACKS.VAGARY_OF_RECRUITMENT, 60).effect.category === 'gp-grant');
ok('Recruitment 100 → Alliance Offered',  lr(ACKS.VAGARY_OF_RECRUITMENT, 100).key === 'alliance-offered');
ok('War 1 → Disease',                     lr(ACKS.VAGARY_OF_WAR, 1).key === 'disease');
ok('War 32 → War Profiteers (overlap-fix lower side)', lr(ACKS.VAGARY_OF_WAR, 32).key === 'war-profiteers-war');
ok('War 33 → Siege Train Problems (overlap-fix)',      lr(ACKS.VAGARY_OF_WAR, 33).key === 'siege-train-problems');
ok('War 41 → Ill Omen (−10 next roll)',   lr(ACKS.VAGARY_OF_WAR, 41).effect.category === 'next-roll-mod' && lr(ACKS.VAGARY_OF_WAR, 41).effect.delta === -10);
ok('War 50 → All Quiet (none)',           lr(ACKS.VAGARY_OF_WAR, 50).effect.category === 'none');
ok('War 56 → Good Omen (+10 next roll)',  lr(ACKS.VAGARY_OF_WAR, 56).effect.category === 'next-roll-mod' && lr(ACKS.VAGARY_OF_WAR, 56).effect.delta === 10);
ok('War 96 → Defection (enemy → you)',    lr(ACKS.VAGARY_OF_WAR, 96).key === 'defection-enemy');
ok('War 100 → Plans Discovered',          lr(ACKS.VAGARY_OF_WAR, 100).key === 'plans-discovered');
ok('Battle 1 → Ambush',                   lr(ACKS.VAGARY_OF_BATTLE, 1).key === 'ambush');
ok('Battle 24 → Calm (none)',             lr(ACKS.VAGARY_OF_BATTLE, 24).effect.category === 'none');
ok('Battle 45 → Debris Heavy (overlap-fix upper)', lr(ACKS.VAGARY_OF_BATTLE, 45).key === 'debris-heavy');
ok('Battle 46 → Deserters (overlap-fix)', lr(ACKS.VAGARY_OF_BATTLE, 46).key === 'deserters');
ok('Battle 75 → Monsters',                lr(ACKS.VAGARY_OF_BATTLE, 75).key === 'monsters');
ok('Battle 76 → Piles of Dead (overlap-fix)', lr(ACKS.VAGARY_OF_BATTLE, 76).key === 'piles-of-dead');
ok('Battle 100 → Volley of Arrows',       lr(ACKS.VAGARY_OF_BATTLE, 100).key === 'volley-of-arrows');

// ── 3. rollVagaryTable — mod / clamp / best-worst flag ────────────────────────────────────────────
section('rollVagaryTable');
let r = ACKS.rollVagaryTable(ACKS.VAGARY_OF_WAR, { rng: rngFor(50) });
ok('roll 50 → raw 50, total 50, All Quiet', r.roll === 50 && r.total === 50 && r.row.key === 'all-quiet-war', JSON.stringify({ roll:r.roll, total:r.total, key:r.row.key }));
r = ACKS.rollVagaryTable(ACKS.VAGARY_OF_WAR, { rng: rngFor(50), mod: -10 });
ok('roll 50 −10 → total 40 → Bad Weather', r.total === 40 && r.row.key === 'bad-weather', 'got ' + r.row.key);
r = ACKS.rollVagaryTable(ACKS.VAGARY_OF_RECRUITMENT, { rng: rngFor(95), mod: 10 });
ok('roll 95 +10 → 105 → pickBest + clamped to 100 (Alliance)', r.total === 105 && r.pickBest === true && r.clamped === 100 && r.row.key === 'alliance-offered', JSON.stringify({ total:r.total, pickBest:r.pickBest, key:r.row.key }));
r = ACKS.rollVagaryTable(ACKS.VAGARY_OF_RECRUITMENT, { rng: rngFor(3), mod: -10 });
ok('roll 3 −10 → −7 → pickWorst + clamped to 1 (War Declared)', r.total === -7 && r.pickWorst === true && r.clamped === 1 && r.row.key === 'war-declared', JSON.stringify({ total:r.total, pickWorst:r.pickWorst, key:r.row.key }));

// ── 4. vagaryRealmUnitSize (JJ p.111 note) ────────────────────────────────────────────────────────
section('vagaryRealmUnitSize');
const u = (tags) => ACKS.vagaryRealmUnitSize({}, { name:'X', tags });
ok('baron → company (120/60)',   u(['barony']).scale === 'company'   && u(['barony']).infantry === 120 && u(['barony']).cavalry === 60);
ok('viscount → company',         u(['viscounty']).scale === 'company');
ok('count → company',            u(['county']).scale === 'company');
ok('duke → battalion (480/240)', u(['duchy']).scale === 'battalion' && u(['duchy']).infantry === 480 && u(['duchy']).cavalry === 240);
ok('prince → battalion',         u(['principality']).scale === 'battalion');
ok('king → brigade (1920/960)',  u(['kingdom']).scale === 'brigade'  && u(['kingdom']).infantry === 1920 && u(['kingdom']).cavalry === 960);
ok('emperor → brigade',          u(['empire']).scale === 'brigade');
ok('null domain → company',      ACKS.vagaryRealmUnitSize({}, null).scale === 'company');

// ── 5. recruitment driver (monthly) ──────────────────────────────────────────────────────────────
section('recruitment driver — rulersRecruitingThisMonth + processRecruitmentVagariesForTurn');
function recruitCampaign(){
  return {
    currentTurn: 5, currentDayInMonth: 1, houseRules: {},
    characters: [
      { id:'chr-merc', name:'Lord Merc', schemaVersion:2, recruitmentDrives:[{ id:'rcd-1', status:'active' }] },
      { id:'chr-levy', name:'Lord Levy', schemaVersion:2 },
      { id:'chr-mus',  name:'Lord Muster', schemaVersion:2 }
    ],
    domains: [
      { id:'dom-merc', name:'Barony Merc', tags:['barony'], rulerCharacterId:'chr-merc', schemaVersion:2 },
      { id:'dom-levy', name:'County Levy', tags:['county'], rulerCharacterId:'chr-levy', schemaVersion:2 },
      { id:'dom-mus',  name:'Duchy Muster', tags:['duchy'], rulerCharacterId:'chr-mus', schemaVersion:2 },
      { id:'dom-idle', name:'Barony Idle', tags:['barony'], rulerCharacterId:null, schemaVersion:2 }
    ],
    units: [ { id:'unit-1', source:'militia', homeDomainId:'dom-levy', count:20, history:[{ turn:5, type:'levied' }], schemaVersion:2 } ],
    armies: [ { id:'army-1', name:'Muster Host', leaderCharacterId:'chr-mus', history:[{ turn:5, type:'mustered' }], schemaVersion:2 } ],
    eventLog: []
  };
}
let camp = recruitCampaign();
const recruiting = ACKS.rulersRecruitingThisMonth(camp, 5);
ok('3 rulers detected recruiting', recruiting.length === 3, 'got ' + recruiting.length);
const byRuler = id => recruiting.find(e => e.ruler.id === id);
ok('chr-merc detected via active recruitment drive', byRuler('chr-merc') && byRuler('chr-merc').kinds.has('mercenaries'));
ok('chr-levy detected via militia levied this turn',  byRuler('chr-levy') && byRuler('chr-levy').kinds.has('militia'));
ok('chr-mus detected via army mustered this turn',    byRuler('chr-mus') && byRuler('chr-mus').kinds.has('vassal-troops'));
// a unit levied LAST turn is not "this month"
camp.units[0].history = [{ turn:4, type:'levied' }];
ok('levy last turn → not recruiting this month', !ACKS.rulersRecruitingThisMonth(camp, 5).find(e => e.ruler.id === 'chr-levy'));

// rule OFF → no-op
camp = recruitCampaign(); camp.houseRules['vagaries-of-recruitment'] = { enabled:false };
let res = ACKS.processRecruitmentVagariesForTurn(camp, { rng: rngFor(60) });
ok('rule OFF → ruleOn false, 0 events, eventLog empty', res.ruleOn === false && res.events === 0 && camp.eventLog.length === 0);

// rule ON → one event per recruiting ruler
camp = recruitCampaign(); camp.houseRules['vagaries-of-recruitment'] = { enabled:true };
res = ACKS.processRecruitmentVagariesForTurn(camp, { rng: rngFor(60) });   // 60 → Tribute
ok('rule ON → ruleOn true, 3 events', res.ruleOn === true && res.events === 3, JSON.stringify({ ruleOn:res.ruleOn, events:res.events }));
ok('3 vagary-of-recruitment events in the log', camp.eventLog.filter(e => e.event.kind === 'vagary-of-recruitment').length === 3);
const ev = camp.eventLog.find(e => e.event.kind === 'vagary-of-recruitment');
ok('event payload carries vagaryKey + effect descriptor', ev.event.payload.vagaryKey === 'tribute' && ev.event.payload.effect.category === 'gp-grant');
ok('event payload carries realmUnitScale', !!ev.event.payload.realmUnitScale);
ok('the duchy ruler\'s event scales to battalion', camp.eventLog.find(e => e.event.payload.rulerCharacterId === 'chr-mus').event.payload.realmUnitScale === 'battalion');
ok('event has a context envelope (subject = ruler)', (ev.event.context.relatedEntities || []).some(re => re.role === 'subject' && re.kind === 'character'));

// ── 6. war driver (weekly per army) ──────────────────────────────────────────────────────────────
section('war driver — warVagaryDue + rollWarVagary + armyInSiege');
ok('due when never rolled', ACKS.warVagaryDue({}, { id:'a' }, 160) === true);
ok('not due 5 days after a roll', ACKS.warVagaryDue({}, { id:'a', lastWarVagaryOrd:160 }, 165) === false);
ok('due 7 days after a roll',     ACKS.warVagaryDue({}, { id:'a', lastWarVagaryOrd:160 }, 167) === true);
const army = { id:'army-w', name:'Field Host', leaderCharacterId:null };
let wv = ACKS.rollWarVagary({}, army, { rng: rngFor(41) });
ok('war roll 41 → Ill Omen, nextMod −10', wv.row.key === 'ill-omen' && wv.nextMod === -10);
wv = ACKS.rollWarVagary({}, army, { rng: rngFor(56) });
ok('war roll 56 → Good Omen, nextMod +10', wv.row.key === 'good-omen' && wv.nextMod === 10);
wv = ACKS.rollWarVagary({}, { id:'a', vagaryWarNextMod:-10 }, { rng: rngFor(50) });
ok('carried −10 applied (raw 50 → total 40 → Bad Weather)', wv.mod === -10 && wv.total === 40 && wv.row.key === 'bad-weather', JSON.stringify({ mod:wv.mod, total:wv.total, key:wv.row.key }));
// siege double-take-worse: two draws (raw 50 → All Quiet, raw 1 → Disease) → keep Disease (lower total)
wv = ACKS.rollWarVagary({}, army, { rng: seqRng([(50 - 0.5)/100, (1 - 0.5)/100]), siege:true });
ok('siege → 2 draws, takes the worse (Disease over All Quiet)', wv.siege === true && wv.draws.length === 2 && wv.row.key === 'disease', JSON.stringify({ draws:wv.draws.length, key:wv.row.key }));
ok('armyInSiege false with no sieges', ACKS.armyInSiege({ sieges:[] }, army) === false);
ok('armyInSiege true when besieging', ACKS.armyInSiege({ sieges:[{ status:'active', besiegerArmyId:'army-w' }] }, army) === true);
ok('armyInSiege false when siege resolved', ACKS.armyInSiege({ sieges:[{ status:'resolved', besiegerArmyId:'army-w' }] }, army) === false);

// war commit branch (commitMilitaryRecord) — advances the weekly cadence + carries the omen mod
section('war driver — commit branch (army-vagary)');
const wcamp = { armies:[{ id:'army-c', name:'C', history:[] }], currentTurn:6, currentDayInMonth:10 };
ACKS.commitMilitaryRecord(wcamp, { kind:'army-vagary', armyId:'army-c', ord:190, nextMod:10, vagaryName:'Good Omen', vagaryKey:'good-omen' });
ok('commit sets lastWarVagaryOrd', wcamp.armies[0].lastWarVagaryOrd === 190);
ok('commit carries the next-roll mod', wcamp.armies[0].vagaryWarNextMod === 10);
ok('commit stamps army history', (wcamp.armies[0].history || []).some(h => h.type === 'vagary-of-war'));
ACKS.commitMilitaryRecord(wcamp, { kind:'army-vagary', armyId:'army-c', ord:197, nextMod:0, vagaryName:'All Quiet', vagaryKey:'all-quiet-war' });
ok('a non-omen commit clears the carried mod (→ 0)', wcamp.armies[0].vagaryWarNextMod === 0);

// ── 7. battle driver (1d4 per foray) ─────────────────────────────────────────────────────────────
section('battle driver — rollBattleVagaries');
let bv = ACKS.rollBattleVagaries({}, { rng: seqRng([(2 - 0.5)/4, (1 - 0.5)/100]) });  // count = 1+floor(0.375*4)=2? -> ensure deterministic
// count uses 1 + floor(rng()*4); use 0.0 → count 1, then a fixed cell
bv = ACKS.rollBattleVagaries({}, { rng: seqRng([0.0, (1 - 0.5)/100]) });
ok('battle 1d4 → count 1 (rng 0.0) → Ambush', bv.length === 1 && bv[0].vagaryKey === 'ambush', JSON.stringify(bv.map(v => v.vagaryKey)));
bv = ACKS.rollBattleVagaries({}, { rng: seqRng([0.99, (24 - 0.5)/100, (51 - 0.5)/100, (100 - 0.5)/100, (1 - 0.5)/100]) });  // count 1+floor(3.96)=4
ok('battle 1d4 → count 4 (rng 0.99)', bv.length === 4, 'got ' + bv.length);
ok('battle vagaries carry vagaryKey/name/effect', bv.every(v => v.vagaryKey && v.name && v.effect && v.effect.category));
ok('battle Calm has effect.category none', ACKS.rollBattleVagaries({}, { rng: seqRng([0.0, (24 - 0.5)/100]) })[0].effect.category === 'none');

// ── 8. registry + event wiring ────────────────────────────────────────────────────────────────────
section('registry + event wiring');
['vagaries-of-recruitment','vagaries-of-war','vagaries-of-battle'].forEach(id => {
  const rule = ACKS.lookupHouseRule(id);
  ok(id + ' registered in HOUSERULES_REGISTRY', !!rule);
  ok(id + ' category = military', rule && rule.category === 'military');
  ok(id + ' default OFF', !rule || rule.default === undefined || rule.default === false);
});
['vagary-of-recruitment','vagary-of-war','vagary-of-battle'].forEach(k => {
  ok(k + ' is a known event kind', ACKS.isEventKindKnown(k));
  ok(k + ' has a schema', !!ACKS.EVENT_SCHEMAS[k]);
  ok(k + ' is wizard-opt-out (auto-rolled, not hand-emitted)', !ACKS.isWizardEmittable(k));
});

console.log('\n=============================================');
console.log('vagaries.smoke.js — Passed: ' + passed + ', Failed: ' + failed);
console.log('=============================================');
process.exit(failed ? 1 : 0);
