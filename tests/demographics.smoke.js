'use strict';
/* tests/demographics.smoke.js — Settlement Demographics SD-1 (the urban derived core).
 *
 * Locks the derived Step-3 roster (JJ pp.214–217): the model reproduces the printed tables
 * (via the ~6–8 OQ-1 oracle cells — NOT a committed copy of the six tables, CLAUDE §13.6),
 * the anchor-on-six correction (Class VI total 49, not the single-master-pro-rata 35), the
 * JJ p.214 demographic bucketing (OQ-9: assassin/bard → THIEF, not #154's fighter), and the
 * realized/delta accessors. Run: node tests/demographics.smoke.js  (or via npm test).
 */
const { load } = require('./_engine.js');
const ACKS = load();

let passed = 0, failed = 0;
function ok(label, cond, extra){ if(cond){ passed++; } else { failed++; console.error('  FAIL: ' + label + (extra ? ' — ' + extra : '')); } }
function section(s){ console.log('\n# ' + s); }
const R = v => Math.round(v);

// ── 1. exports + model-parameter integrity ──────────────────────────────────────────────────────
section('exports + model parameters');
['expectedDemographics','realizedDemographics','demographicDelta','settlementDemographics',
 'demographicMarketClass','coreBucketForCharacter','formatExpectedCount'].forEach(fn =>
  ok('ACKS.' + fn + ' exported', typeof ACKS[fn] === 'function'));
ok('DEMOGRAPHIC_BUCKETS = the six core buckets', JSON.stringify(ACKS.DEMOGRAPHIC_BUCKETS) === JSON.stringify(['fighter','crusader','thief','mage','explorer','venturer']));

// Each "All" frequency column sums to the printed table total (JJ pp.215–216). These sums are
// the oracle — not a committed copy of the bucket grid.
const ALL = ACKS.STARTING_SETTLEMENT_ALL;
const colSum = c => ALL[c].reduce((a,b) => a + b, 0);
ok('Class I  All-column sums to 8885', colSum('I')   === 8885, 'got ' + colSum('I'));
ok('Class II All-column sums to 2245', colSum('II')  === 2245, 'got ' + colSum('II'));
ok('Class III All-column sums to 1142', colSum('III')=== 1142, 'got ' + colSum('III'));
ok('Class IV All-column sums to 305',  colSum('IV')  === 305,  'got ' + colSum('IV'));
ok('Class V  All-column sums to 125',  colSum('V')   === 125,  'got ' + colSum('V'));
ok('Class VI All-column sums to 49',   colSum('VI')  === 49,   'got ' + colSum('VI'));
ok('split table has 14 level rows of 6 buckets', ACKS.LEVEL_CLASS_SPLIT.length === 14 && ACKS.LEVEL_CLASS_SPLIT.every(r => r.length === 6));

// ── 2. expectedDemographics — the OQ-1 oracle cells (reproduce the printed tables within ±1) ──────
section('expectedDemographics — oracle cells (JJ pp.215–216)');
const classI  = ACKS.expectedDemographics({ id:'set-1', families:20000 });
const classII = ACKS.expectedDemographics({ id:'set-2', families:5000  });
const classIII= ACKS.expectedDemographics({ id:'set-3', families:2500  });
const classVI = ACKS.expectedDemographics({ id:'set-6', families:80    });

ok('Class I derives market class I', classI.marketClass === 'I');
ok('Class I L1 All = 5632',        R(classI.byLevel[0].all) === 5632, 'got ' + classI.byLevel[0].all);
ok('Class I L1 Fighter = 1509',    R(classI.byLevel[0].fighter) === 1509, 'got ' + classI.byLevel[0].fighter);
ok('Class I L1 Mage = 563',        R(classI.byLevel[0].mage) === 563, 'got ' + classI.byLevel[0].mage);
ok('Class I L5 = [23,20,20,15,12,10] (the migration row)',
  [R(classI.byLevel[4].fighter),R(classI.byLevel[4].crusader),R(classI.byLevel[4].thief),R(classI.byLevel[4].mage),R(classI.byLevel[4].explorer),R(classI.byLevel[4].venturer)].join(',') === '23,20,20,15,12,10');
ok('Class I L14 Mage % = 25% (tail probability)', R(classI.byLevel[13].mage * 100) === 25, 'got ' + (classI.byLevel[13].mage*100));

ok('Class II derives market class II', classII.marketClass === 'II');
ok('Class II L1 All = 1408 (exact ÷4 of Class I)', R(classII.byLevel[0].all) === 1408, 'got ' + classII.byLevel[0].all);

ok('Class III derives market class III', classIII.marketClass === 'III');
ok('Class III L1 All = 710', R(classIII.byLevel[0].all) === 710, 'got ' + classIII.byLevel[0].all);
ok('Class III L3 Mage = 10', R(classIII.byLevel[2].mage) === 10, 'got ' + classIII.byLevel[2].mage);

ok('Class VI derives market class VI', classVI.marketClass === 'VI');
ok('Class VI L1 buckets = [6,5,5,2,3,2]',
  [R(classVI.byLevel[0].fighter),R(classVI.byLevel[0].crusader),R(classVI.byLevel[0].thief),R(classVI.byLevel[0].mage),R(classVI.byLevel[0].explorer),R(classVI.byLevel[0].venturer)].join(',') === '6,5,5,2,3,2');
// The anchor-on-six correction: Class VI total is the printed 49, NOT the ~35 a single Class-I
// master pro-rata'd by 80/20000 would give (its mid-levels are deliberately flatter).
ok('Class VI total All = 49 (anchor-on-six, not single-master pro-rata ~35)', R(classVI.totals.all) === 49, 'got ' + classVI.totals.all);

// ── 3. pro-rata within the class band + overrides (RAW p.214) ─────────────────────────────────────
section('pro-rata scaling + GM overrides');
// Force the Class III table at 5,000 families via the GM market-class override (5,000 is
// naturally Class II — the shipped band II = 5000–19999 — so this also tests override + pro-rata).
const bigIII = ACKS.expectedDemographics({ id:'set-b', families:5000, marketClass:'III' });
ok('Class III override @ 5000 families → market class III', bigIII.marketClass === 'III');
ok('Class III @ 5000 → scale 2.0 (5000 / 2500 ref)', Math.abs(bigIII.scale - 2.0) < 1e-9, 'got ' + bigIII.scale);
ok('Class III @ 5000 L1 All = 1420 (710 × 2)', R(bigIII.byLevel[0].all) === 1420, 'got ' + bigIII.byLevel[0].all);
// A natural in-band pro-rata: 3,750 families is Class III (band 2500–4999), scale 1.5.
const midIII = ACKS.expectedDemographics({ id:'set-m', families:3750 });
ok('3750 families → natural class III, scale 1.5', midIII.marketClass === 'III' && Math.abs(midIII.scale - 1.5) < 1e-9, 'class ' + midIII.marketClass + ' scale ' + midIII.scale);

const cityOfWizards = ACKS.expectedDemographics({ id:'set-w', families:2500, demographicOverrides:{ mage:3 } });
ok('override {mage:3} triples mages (L1 71 → 213)', R(cityOfWizards.byLevel[0].mage) === R(classIII.byLevel[0].mage * 3), 'got ' + cityOfWizards.byLevel[0].mage);
ok('override {mage:3} leaves fighters untouched', R(cityOfWizards.byLevel[0].fighter) === R(classIII.byLevel[0].fighter));
const denuded = ACKS.expectedDemographics({ id:'set-d', families:2500, demographicOverrides:{ all:0.5 } });
ok('override {all:0.5} halves the whole roster', R(denuded.totals.all) === R(classIII.totals.all * 0.5), 'got ' + denuded.totals.all);

// hamlet (VI*) folds onto the Class VI table; an explicit marketClass override wins.
ok('50-family hamlet (VI*) uses the Class VI table', ACKS.demographicMarketClass({ families:50 }) === 'VI');
ok('20000-family settlement → class I', ACKS.demographicMarketClass({ families:20000 }) === 'I');
ok('explicit marketClass override wins over families', ACKS.demographicMarketClass({ families:20000, marketClass:'IV' }) === 'IV');

// ── 4. coreBucketForCharacter — JJ p.214 DEMOGRAPHIC bucketing (OQ-9) ─────────────────────────────
section('coreBucketForCharacter — JJ p.214 demographic mapping (OQ-9)');
const bucket = cls => ACKS.coreBucketForCharacter(null, { class: cls });
ok('Fighter → fighter', bucket('Fighter') === 'fighter');
ok('Mage → mage', bucket('Mage') === 'mage');
ok('Thief → thief', bucket('Thief') === 'thief');
ok('Cleric → crusader', bucket('Cleric') === 'crusader');
ok('Explorer → explorer', bucket('Explorer') === 'explorer');
ok('Venturer → venturer', bucket('Venturer') === 'venturer');
// The OQ-9 divergence: JJ p.214 demographic = THIEF (NOT #154's save-derived fighter).
ok('Assassin → thief (JJ p.214 demographic, not #154 fighter)', bucket('Assassin') === 'thief');
ok('Bard → thief (JJ p.214 demographic)', bucket('Bard') === 'thief');
ok('Bladedancer → crusader', bucket('Bladedancer') === 'crusader');
ok('Warlock → mage', bucket('Warlock') === 'mage');
ok('Paladin → fighter', bucket('Paladin') === 'fighter');
ok('"Dwarven Vaultguard" (display name, spaces) → fighter', bucket('Dwarven Vaultguard') === 'fighter');
ok('unknown class → null (unbucketed)', bucket('Goblin Shaman of Yeenoghu') === null);
ok('empty class → null', bucket('') === null);
ok('null character → null', ACKS.coreBucketForCharacter(null, null) === null);

// ── 5. realizedDemographics — the resident roster, derived by query ───────────────────────────────
section('realizedDemographics — named residents bucketed by home');
const camp = ACKS.blankCampaign({ name:'demo-test' });
const SET = 'set-home';
camp.characters.push(ACKS.blankCharacter({ name:'Aria the Wise', class:'Mage',   level:5, homeSettlementId:SET }));
camp.characters.push(ACKS.blankCharacter({ name:'Bryn',         class:'Mage',   level:1, homeSettlementId:SET }));
camp.characters.push(ACKS.blankCharacter({ name:'Cuthbert',     class:'Fighter',level:1, homeSettlementId:SET }));
camp.characters.push(ACKS.blankCharacter({ name:'Silk',         class:'Assassin',level:1, homeSettlementId:SET }));   // → thief bucket
camp.characters.push(ACKS.blankCharacter({ name:'Elsewhere',    class:'Mage',   level:1, homeSettlementId:'set-other' })); // different home
const dead = ACKS.blankCharacter({ name:'Ghost', class:'Mage', level:1, homeSettlementId:SET }); dead.lifecycleState = 'deceased';
camp.characters.push(dead);
camp.characters.push(ACKS.blankCharacter({ name:'The Beast', class:'', level:1, homeSettlementId:SET }));  // unclassed → other

const real = ACKS.realizedDemographics(camp, SET);
ok('counts 2 resident mages (L5 + L1; excludes other-home + deceased)', real.totals.mage === 2, 'got ' + real.totals.mage);
ok('L5 has 1 mage (Aria)', real.byLevel[4].mage === 1 && real.byLevel[4].mageNames[0].name === 'Aria the Wise');
ok('L1 has 1 mage (Bryn)', real.byLevel[0].mage === 1);
ok('1 resident fighter', real.totals.fighter === 1);
ok('Assassin counted in the thief bucket (demographic)', real.totals.thief === 1);
ok('unclassed resident lands in "other"', real.otherCount === 1 && real.other[0].name === 'The Beast');
ok('deceased + other-home residents excluded', real.totals.all === 4 && real.residents === 5);

// ── 6. demographicDelta — open slots + exceptional outliers ───────────────────────────────────────
section('demographicDelta — open / exceptional');
// A Class VI village (80 families) with one resident: a Fighter-12 (the RAW "city of wizards"
// style exception — the village table gives 0% chance of an L12 fighter).
const village = { id:'set-vil', families:80 };
const camp2 = ACKS.blankCampaign({ name:'village' });
camp2.characters.push(ACKS.blankCharacter({ name:'Old Hilda the Terror', class:'Fighter', level:12, homeSettlementId:'set-vil' }));
const delta = ACKS.demographicDelta(camp2, village);
ok('village expects open L1 fighter slots', delta.byLevel[0].fighter.open >= 5, 'open=' + delta.byLevel[0].fighter.open);
ok('the L12 fighter is flagged exceptional (0% expected, 1 realized)', delta.byLevel[11].fighter.exceptional === true && delta.byLevel[11].fighter.realized === 1);
ok('delta.exceptionalTotal counts it', delta.exceptionalTotal >= 1);
ok('settlementDemographics is the one-call alias', !!ACKS.settlementDemographics(camp2, village).byLevel);

// ── 7. formatExpectedCount + the additive factory fields ─────────────────────────────────────────
section('formatExpectedCount + additive fields');
ok('format ≥1 → rounded integer', ACKS.formatExpectedCount(9.8) === '10');
ok('format 0<v<1 → "% chance"', ACKS.formatExpectedCount(0.75) === '75%');
ok('format 0 → em-dash', ACKS.formatExpectedCount(0) === '—');
ok('blankCharacter emits homeSettlementId (default null)', ACKS.blankCharacter({}).homeSettlementId === null);
ok('blankSettlement emits demographicOverrides (default null)', ACKS.blankSettlement({}).demographicOverrides === null);
ok('blankCharacter honors opts.homeSettlementId', ACKS.blankCharacter({ homeSettlementId:'set-x' }).homeSettlementId === 'set-x');

// ── 8. SD-2 — placement (JJ Step 4 p.217) + recruit wires the home (plan §6/§7) ───────────────────
section('SD-2 — placement + recruit-home wiring');
['PLACEMENT_ROLES','PLACEMENT_ROLE_LABELS','suggestedPlacementRole','effectivePlacementRole','placementRoleLabel'].forEach(n =>
  ok('ACKS.' + n + ' exported', ACKS[n] !== undefined));
ok('blankCharacter emits placementRole (default null)', ACKS.blankCharacter({}).placementRole === null);
ok('blankCharacter honors opts.placementRole', ACKS.blankCharacter({ placementRole:'temple' }).placementRole === 'temple');

// suggested placement by demographic bucket (JJ Step 4 p.217)
const sug = cls => ACKS.suggestedPlacementRole(null, { class: cls });
ok('mage → tower-of-knowledge',                  sug('Mage') === 'tower-of-knowledge');
ok('cleric (crusader) → temple',                 sug('Cleric') === 'temple');
ok('thief → thieves-quarter',                    sug('Thief') === 'thieves-quarter');
ok('venturer → emporium',                        sug('Venturer') === 'emporium');
ok('fighter → mercenary-guildhouse',             sug('Fighter') === 'mercenary-guildhouse');
ok('explorer → gatehouse',                       sug('Explorer') === 'gatehouse');
ok('assassin (thief bucket, OQ-9) → thieves-quarter', sug('Assassin') === 'thieves-quarter');
ok('unbucketed class → none',                    sug('Goblin Thing') === 'none');
ok('null character → none',                      ACKS.suggestedPlacementRole(null, null) === 'none');

// a domain ruler sits at the municipal seat (overrides the bucket)
const pc = ACKS.blankCampaign({ name:'placement' });
const king = ACKS.blankCharacter({ name:'The King', class:'Fighter', level:9 });
pc.characters.push(king);
pc.domains.push({ id:'dom-1', name:'Realm', rulerCharacterId: king.id });
ok('a domain ruler → municipal-seat (overrides fighter→mercenary-guildhouse)', ACKS.suggestedPlacementRole(pc, king) === 'municipal-seat');

// effectivePlacementRole — the GM override wins; an unknown stored role falls through; null → suggestion
ok('effective: stored override wins',                   ACKS.effectivePlacementRole(null, { class:'Mage', placementRole:'temple' }) === 'temple');
ok('effective: null → the suggestion',                  ACKS.effectivePlacementRole(null, { class:'Mage', placementRole:null }) === 'tower-of-knowledge');
ok('effective: unknown stored role → falls through',    ACKS.effectivePlacementRole(null, { class:'Mage', placementRole:'bogus' }) === 'tower-of-knowledge');
ok('placementRoleLabel maps the role', ACKS.placementRoleLabel('thieves-quarter') === "Thieves' Quarter");

// recruit-hireling wires homeSettlementId to the recruitment market (plan §7) + does not clobber a GM-set home
const rc = ACKS.blankCampaign({ name:'recruit' });
const patron = ACKS.blankCharacter({ name:'Lord Patron', class:'Fighter', level:5 });
rc.characters.push(patron);
const candA = ACKS.blankCharacter({ name:'Hench A', class:'Thief', level:1, socialTier:'candidate', lifecycleState:'candidate' });
rc.characters.push(candA);
ACKS.applyEvent(rc, ACKS.newEvent('recruit-hireling', { payload: { patronCharacterId:patron.id, hireCategory:'henchman', hireTypeId:'henchman-thief', candidateIds:[candA.id], settlementId:'set-market', monthlyOffer:25 } }));
ok('recruit sets the hireling home = the recruitment market', candA.homeSettlementId === 'set-market');
const candB = ACKS.blankCharacter({ name:'Hench B', class:'Mage', level:1, homeSettlementId:'set-original', socialTier:'candidate', lifecycleState:'candidate' });
rc.characters.push(candB);
ACKS.applyEvent(rc, ACKS.newEvent('recruit-hireling', { payload: { patronCharacterId:patron.id, hireCategory:'henchman', hireTypeId:'henchman-mage', candidateIds:[candB.id], settlementId:'set-market', monthlyOffer:25 } }));
ok('recruit does not clobber a GM-set home', candB.homeSettlementId === 'set-original');

// ── 9. SD-5a — the emergent reads (the world's people as a queryable index, plan §8) ──────────────
section('SD-5a — service legibility + world-people queries');
['settlementResidents','topResidentByBucket','settlementServices','findResidents','mostNotableResident','BUCKET_SERVICE'].forEach(n =>
  ok('ACKS.' + n + ' exported', ACKS[n] !== undefined));

// A small world: two settlements in dom-march (hexes 3 apart), one in dom-vassal (8 hexes off).
const wc = ACKS.blankCampaign({ name:'world-reads' });
wc.hexes.push({ id:'hex-cap',  coord:{q:0,r:0}, domainId:'dom-march' });
wc.hexes.push({ id:'hex-port', coord:{q:3,r:0}, domainId:'dom-march' });
wc.hexes.push({ id:'hex-far',  coord:{q:8,r:0}, domainId:'dom-vassal' });
wc.settlements.push({ id:'set-cap',  name:'Saltspur',  hexId:'hex-cap',  families:2500 });
wc.settlements.push({ id:'set-port', name:'Tidewrack', hexId:'hex-port', families:250  });
wc.settlements.push({ id:'set-far',  name:'Farhold',   hexId:'hex-far',  families:80   });
wc.domains.push({ id:'dom-march',  name:'March',  rulerCharacterId:null });
wc.domains.push({ id:'dom-vassal', name:'Vassal', rulerCharacterId:null });
const mk = (name, cls, lvl, sid) => { const c = ACKS.blankCharacter({ name, class:cls, level:lvl, homeSettlementId:sid }); wc.characters.push(c); return c; };
const archmage = mk('Vextra the Wise', 'Mage',   11, 'set-cap');  // the realm's top caster
mk('Brother Cael',     'Cleric',  7, 'set-cap');                  // top divine
mk('Sgt. Borin',       'Fighter', 6, 'set-cap');
mk('Quill the Fence',  'Thief',   4, 'set-cap');
const mab = mk('Hedge-Witch Mab', 'Mage', 3, 'set-port');         // a lesser caster at the port (d3)
mk('Old Tom',          'Fighter', 2, 'set-port');
const farmage = mk('Distant Dabbler', 'Mage', 9, 'set-far');      // a Mage-9 a domain (8 hexes) away

// settlementResidents — flat, level-sorted
const capRes = ACKS.settlementResidents(wc, 'set-cap');
ok('settlementResidents counts the 4 homed at the capital', capRes.length === 4, 'got ' + capRes.length);
ok('settlementResidents is level-sorted desc (top = the archmage)', capRes[0].id === archmage.id && capRes[0].level === 11);
ok('settlementResidents tags the bucket', capRes[0].bucket === 'mage');

// topResidentByBucket
const top = ACKS.topResidentByBucket(wc, 'set-cap');
ok('topResidentByBucket.mage = the archmage',  top.mage && top.mage.id === archmage.id);
ok('topResidentByBucket.crusader = Cael (L7)', top.crusader && top.crusader.level === 7);
ok('topResidentByBucket.venturer = null (none here)', top.venturer === null);

// settlementServices — service legibility
const svc = ACKS.settlementServices(wc, 'set-cap');
ok('services: arcaneCasterLevel = 11', svc.arcaneCasterLevel === 11, 'got ' + svc.arcaneCasterLevel);
ok('services: divineCasterLevel = 7',  svc.divineCasterLevel === 7);
const mageRow = svc.rows.find(r => r.bucket === 'mage');
ok('services: mage row trainsUpToLevel = 10 (mentor − 1)', mageRow.trainsUpToLevel === 10);
ok('services: mage row carries the service note', /arcane/.test(mageRow.service));
const venRow = svc.rows.find(r => r.bucket === 'venturer');
ok('services: an empty bucket row → level 0 / null resident', venRow.level === 0 && venRow.topResident === null);

// findResidents — scopes + filters
ok('find: settlement+bucket → just the archmage', (() => { const r = ACKS.findResidents(wc, { settlementId:'set-cap', bucket:'mage' }); return r.length === 1 && r[0].id === archmage.id; })());
ok('find: settlement+bucket+minLevel excludes below', ACKS.findResidents(wc, { settlementId:'set-cap', bucket:'fighter', minLevel:7 }).length === 0);
const domMages = ACKS.findResidents(wc, { domainId:'dom-march', bucket:'mage', minLevel:3 });
ok('find: domain scope spans both settlements (2 mages), sorted desc', domMages.length === 2 && domMages[0].id === archmage.id && domMages[1].id === mab.id);
ok('find: domain scope excludes the other domain (no farmage)', !domMages.some(r => r.id === farmage.id));
ok('find: domain rows carry the settlement name', domMages[1].settlementName === 'Tidewrack');
const near3 = ACKS.findResidents(wc, { nearHexId:'hex-cap', withinHexes:3, bucket:'mage' });
ok('find: within 3 hexes → capital + port mages (d0 + d3), with distance', near3.length === 2 && near3.every(r => typeof r.distance === 'number'));
ok('find: the port mage is at distance 3', (near3.find(r => r.id === mab.id) || {}).distance === 3);
ok('find: within 2 hexes drops the port (d3>2)', ACKS.findResidents(wc, { nearHexId:'hex-cap', withinHexes:2, bucket:'mage' }).length === 1);
ok('find: within 8 hexes reaches the far mage', ACKS.findResidents(wc, { nearHexId:'hex-cap', withinHexes:8, bucket:'mage' }).length === 3);
ok('find: classKey filter (cleric) campaign-wide → just Cael', (() => { const r = ACKS.findResidents(wc, { classKey:'Cleric' }); return r.length === 1 && r[0].name === 'Brother Cael'; })());
ok('find: campaign-wide (no scope) returns every homed resident', ACKS.findResidents(wc, {}).length === 7);

// mostNotableResident
ok('mostNotable: settlement scope = the archmage', (ACKS.mostNotableResident(wc, { settlementId:'set-cap' }) || {}).id === archmage.id);
ok('mostNotable: domain scope = the archmage',      (ACKS.mostNotableResident(wc, { domainId:'dom-march' }) || {}).id === archmage.id);
ok('mostNotable: campaign-wide = the L11 archmage',  (ACKS.mostNotableResident(wc, {}) || {}).id === archmage.id);
ok('mostNotable: an empty settlement → null',        ACKS.mostNotableResident(wc, { settlementId:'set-nobody' }) === null);

// deceased residents are excluded
farmage.lifecycleState = 'deceased';
ok('find: a deceased resident drops out of the query', ACKS.findResidents(wc, { settlementId:'set-far' }).length === 0);
farmage.lifecycleState = null;

// includeVassals is additive + non-crashing (no vassalage relation here → equals the base domain set)
ok('find: includeVassals on a vassal-less domain = the base set (no crash)',
  ACKS.findResidents(wc, { domainId:'dom-march', bucket:'mage', minLevel:3, includeVassals:true }).length === domMages.length);

console.log('\n=============================================');
console.log('demographics.smoke.js — Passed: ' + passed + ', Failed: ' + failed);
console.log('=============================================');
process.exit(failed ? 1 : 0);
