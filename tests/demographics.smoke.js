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

// ── 10. SD-5b — grounding the civilized encounter (the census becomes who you meet, plan §8) ──────
section('SD-5b — civilized-encounter grounding');
['CIVILIZED_CELL_BUCKET','bucketForCivilizedCell','groundCivilizedEncounter'].forEach(n =>
  ok('ACKS.' + n + ' exported', ACKS[n] !== undefined));

// the cell→bucket map — conservative: only cells that denote a leveled townsperson
ok('map: merchant → venturer',  ACKS.bucketForCivilizedCell('merchant')  === 'venturer');
ok('map: patroller → fighter',  ACKS.bucketForCivilizedCell('patroller') === 'fighter');
ok('map: pilgrim → crusader',   ACKS.bucketForCivilizedCell('pilgrim')   === 'crusader');
ok('map: commoner → null (the population base, not a class bucket)', ACKS.bucketForCivilizedCell('commoner') === null);
ok('map: bandit → null (an outlaw, not a resident)',  ACKS.bucketForCivilizedCell('bandit') === null);
ok('map: elf → null (a demi-human, not grounded)',    ACKS.bucketForCivilizedCell('elf') === null);
ok('map: blank/undefined cell → null', ACKS.bucketForCivilizedCell('') === null && ACKS.bucketForCivilizedCell(undefined) === null);
ok('map: exactly the three reachable buckets', Object.keys(ACKS.CIVILIZED_CELL_BUCKET).length === 3);
ok('map: mage/thief/explorer have NO civilized cell (RAW: you don\'t road-meet a wizard)',
  !Object.values(ACKS.CIVILIZED_CELL_BUCKET).some(b => b === 'mage' || b === 'thief' || b === 'explorer'));

// a small civilized world: a town with a trader/guard/cleric/mage, a thinner town with only a guard,
// an empty hex between them, and far wilderness.
const gc = ACKS.blankCampaign({ name:'grounding' });
gc.hexes.push({ id:'hex-town', coord:{q:0,r:0},  domainId:'dom-x' });
gc.hexes.push({ id:'hex-thin', coord:{q:2,r:0},  domainId:'dom-x' });
gc.hexes.push({ id:'hex-near', coord:{q:1,r:0},  domainId:'dom-x' });  // no co-located settlement
gc.hexes.push({ id:'hex-wild', coord:{q:20,r:0}, domainId:null     }); // far, settlement-less
gc.settlements.push({ id:'set-town', name:'Bellhaven', hexId:'hex-town', families:1000 });
gc.settlements.push({ id:'set-thin', name:'Crook',     hexId:'hex-thin', families:200  });
gc.domains.push({ id:'dom-x', name:'Marches', rulerCharacterId:null });
const gmk = (name, cls, lvl, sid) => { const c = ACKS.blankCharacter({ name, class:cls, level:lvl, homeSettlementId:sid }); gc.characters.push(c); return c; };
const goss = gmk('Master Trader Goss', 'Venturer', 5, 'set-town');
const borr = gmk('Captain Borr',       'Fighter',  6, 'set-town');
const ans  = gmk('Sister Ans',          'Cleric',   4, 'set-town');
gmk('Ymir the Adept',  'Mage',    8, 'set-town');   // a mage lives here — civilized never grounds to her
const tace = gmk('Tace the Sentry',   'Fighter', 3, 'set-thin');

// co-located at the town → its most-notable resident of the profession
ok('ground: merchant @ town → the venturer Goss', (ACKS.groundCivilizedEncounter(gc, { hexId:'hex-town', cellKey:'merchant' }) || {}).characterId === goss.id);
ok('ground: patroller @ town → the fighter Borr', (ACKS.groundCivilizedEncounter(gc, { hexId:'hex-town', cellKey:'patroller' }) || {}).characterId === borr.id);
ok('ground: pilgrim @ town → the cleric Ans',     (ACKS.groundCivilizedEncounter(gc, { hexId:'hex-town', cellKey:'pilgrim' }) || {}).characterId === ans.id);
const gm = ACKS.groundCivilizedEncounter(gc, { hexId:'hex-town', cellKey:'merchant' });
ok('ground: carries settlementId + bucket + distance 0', gm.settlementId === 'set-town' && gm.bucket === 'venturer' && gm.distance === 0);
ok('ground: a non-mapped cell (commoner) → null', ACKS.groundCivilizedEncounter(gc, { hexId:'hex-town', cellKey:'commoner' }) === null);
ok('ground: no hexId → null', ACKS.groundCivilizedEncounter(gc, { cellKey:'merchant' }) === null);

// a town that lacks the profession → no grounding (the generic label stands)
ok('ground: merchant @ a town with no venturer → null', ACKS.groundCivilizedEncounter(gc, { hexId:'hex-thin', cellKey:'merchant' }) === null);
ok('ground: patroller @ the thin town → its fighter Tace', (ACKS.groundCivilizedEncounter(gc, { hexId:'hex-thin', cellKey:'patroller' }) || {}).characterId === tace.id);

// near-fallback: an empty hex draws on a town within N hexes
const near = ACKS.groundCivilizedEncounter(gc, { hexId:'hex-near', cellKey:'merchant' });   // default within 2
ok('ground: near an empty hex → the nearby town\'s venturer (distance 1)', near && near.characterId === goss.id && near.distance === 1);
ok('ground: withinHexes 0 from the empty hex → null (town is 1 away)', ACKS.groundCivilizedEncounter(gc, { hexId:'hex-near', cellKey:'merchant', withinHexes:0 }) === null);
ok('ground: far wilderness (no town in range) → null', ACKS.groundCivilizedEncounter(gc, { hexId:'hex-wild', cellKey:'merchant' }) === null);

// createEncounterFromDraw INTEGRATION — a civilized draw at the town grounds the monster side
const cdraw = { category:'civilized', hexId:'hex-town', identity:'table',
  identityRoll: { key:'merchant', label:'Man, Merchant', natural:50, columnKey:'temperate', page:43 },
  binding: { mode:'wandering', inLair:false, count:1, lairPct:0, lairRoll:99 }, proposal:null };
const cenc = ACKS.createEncounterFromDraw(gc, cdraw, { id:'enc-g1', trigger:'rest-night', partySide:{}, atTurn:1, rng:()=>0.5 });
ok('integration: a civilized merchant draw materializes an encounter', cenc && cenc.monsterSide);
ok('integration: monsterSide.residentCharacterId = Goss', cenc.monsterSide.residentCharacterId === goss.id);
ok('integration: monsterSide.residentSettlementId = set-town', cenc.monsterSide.residentSettlementId === 'set-town');
ok('integration: the table label/key are preserved', cenc.monsterSide.monsterCatalogKey === 'merchant');
const ndraw = { category:'civilized', hexId:'hex-town', identity:'table',
  identityRoll: { key:'commoner', label:'Man, Commoner', natural:40, columnKey:'temperate', page:43 },
  binding: { mode:'wandering', inLair:false, count:3, lairPct:0, lairRoll:99 }, proposal:null };
const nenc = ACKS.createEncounterFromDraw(gc, ndraw, { id:'enc-g2', trigger:'rest-night', partySide:{}, atTurn:1, rng:()=>0.5 });
ok('integration: a non-mapped civilized cell (commoner) is NOT grounded', nenc.monsterSide.residentCharacterId === null);
const wdraw = { category:'civilized', hexId:'hex-wild', identity:'table',
  identityRoll: { key:'merchant', label:'Man, Merchant', natural:50, columnKey:'temperate', page:43 },
  binding: { mode:'wandering', inLair:false, count:1, lairPct:0, lairRoll:99 }, proposal:null };
const wenc = ACKS.createEncounterFromDraw(gc, wdraw, { id:'enc-g3', trigger:'rest-night', partySide:{}, atTurn:1, rng:()=>0.5 });
ok('integration: a civilized merchant in town-less wilderness is NOT grounded', wenc.monsterSide.residentCharacterId === null);

// the factory carries the two new fields (schema⊆factory + defensive read on old saves)
const be = ACKS.blankEncounter().monsterSide;
ok('blankEncounter monsterSide has residentCharacterId (null)', 'residentCharacterId' in be && be.residentCharacterId === null);
ok('blankEncounter monsterSide has residentSettlementId (null)', 'residentSettlementId' in be && be.residentSettlementId === null);

// ── 11. SD-3 — the realm command structure (T1) ───────────────────────────────────────────────────
section('SD-3 — the realm command structure (T1)');

['realmCommandStructure','realmRulerLevel','realmOfficeLevel'].forEach(fn =>
  ok('ACKS.' + fn + ' exported', typeof ACKS[fn] === 'function'));
ok('REALM_OFFICES = 8 named offices', Array.isArray(ACKS.REALM_OFFICES) && ACKS.REALM_OFFICES.length === 8);
ok('living-census registered (domain category, default OFF)', (() => {
  const r = ACKS.lookupHouseRule && ACKS.lookupHouseRule('living-census');
  return !!r && r.category === 'domain' && r.default !== true;
})());
ok('blankCharacter carries homeDomainId (null)', ACKS.blankCharacter().homeDomainId === null);

// title → ruler level
ok('realmRulerLevel: count = 8',         ACKS.realmRulerLevel('count')   === 8);
ok('realmRulerLevel: baron = 6',         ACKS.realmRulerLevel('baron')   === 6);
ok('realmRulerLevel: emperor = 14',      ACKS.realmRulerLevel('emperor') === 14);
ok('realmRulerLevel: unknown → baron 6', ACKS.realmRulerLevel('xyz')     === 6);

// office-level scaling (relLevel off the ruler, clamped ≥1)
const capOff = ACKS.REALM_OFFICES.find(o => o.key === 'captainOfGuard');
ok('realmOfficeLevel: captain at ruler 8 = 5 (−3)', ACKS.realmOfficeLevel(capOff, 8) === 5);
ok('realmOfficeLevel: clamps ≥ 1',                   ACKS.realmOfficeLevel(capOff, 2) === 1);

// reconciliation fixture — a count-tier march with ruler + 2 magistrates + 3 homed entourage + a vassal
const rcm = {
  domains: [
    { id:'dom-march', name:'March of Saltspur', rulerCharacterId:'chr-aelric',
      magistrates: { captainOfGuard:{ characterId:'chr-cap', administersThisMonth:false },
                     chaplain:{ characterId:'chr-chap', administersThisMonth:false },
                     steward:{ characterId:null }, munerator:{ characterId:null } } },
    { id:'dom-north', name:'Barony of Northwatch', rulerCharacterId:'chr-yorick', magistrates:{} }
  ],
  characters: [
    { id:'chr-aelric', name:'Aelric',       class:'Fighter',  level:8 },
    { id:'chr-cap',    name:'Sir Borrim',   class:'Fighter',  level:4 },                          // captain — under L5
    { id:'chr-chap',   name:'Mother Cael',  class:'Cleric',   level:6 },                          // chaplain (crusader)
    { id:'chr-magus',  name:'Vexil',        class:'Mage',     level:6, homeDomainId:'dom-march' },// → magister
    { id:'chr-guild',  name:'Tace',         class:'Venturer', level:5, homeDomainId:'dom-march' },// → guildmaster
    { id:'chr-extra',  name:'Odo',          class:'Fighter',  level:2, homeDomainId:'dom-march' },// → entourageOther
    { id:'chr-yorick', name:'Baron Yorick', class:'Fighter',  level:6 }
  ],
  vassalages: []
};
ACKS.createVassalage(rcm, { suzerainCharacterId:'chr-aelric', vassalRulerCharacterId:'chr-yorick',
                            vassalDomainId:'dom-north', suzerainDomainId:'dom-march' });

const rcs = ACKS.realmCommandStructure(rcm, 'dom-march');
const byKey = k => rcs.offices.find(o => o.key === k);
ok('realm: title count (read from "March")',           rcs.title === 'count' && rcs.titleLabel === 'Count');
ok('realm: ruler L8 lifts the court (≥ count floor 8)', rcs.rulerLevel === 8);
ok('realm: ruler office filled by Aelric',             byKey('ruler').holder && byKey('ruler').holder.id === 'chr-aelric');
ok('realm: captain expected L5, held by L4 → underLevel',
   byKey('captainOfGuard').expectedLevel === 5 && byKey('captainOfGuard').holder.level === 4 && byKey('captainOfGuard').underLevel === true);
ok('realm: chaplain filled from the magistracy slot, not under (L6)',
   byKey('chaplain').mapsTo === 'magistrate' && byKey('chaplain').holder.id === 'chr-chap' && byKey('chaplain').underLevel === false);
ok('realm: steward office open (slot vacant)',         byKey('steward').filled === false && byKey('steward').mapsTo === 'magistrate');
ok('realm: magister filled by the homed mage (entourage)',
   byKey('magister').mapsTo === 'entourage' && byKey('magister').holder.id === 'chr-magus');
ok('realm: guildmaster filled by the homed venturer',  byKey('guildmaster').holder.id === 'chr-guild');
ok('realm: annalist open (no homed thief)',            byKey('annalist').filled === false);
ok('realm: filled 5 / open 3 of 8 offices',            rcs.filledCount === 5 && rcs.openCount === 3 && rcs.officeCount === 8);
ok('realm: entourageOther = the unslotted homed fighter (Odo)',
   rcs.entourageOther.length === 1 && rcs.entourageOther[0].id === 'chr-extra');
ok('realm: vassal lords list Northwatch under Baron Yorick',
   rcs.vassalLords.length === 1 && rcs.vassalLords[0].rulerId === 'chr-yorick' && rcs.vassalLords[0].domainId === 'dom-north' && rcs.vassalLords[0].title === 'baron');

// a homed magistrate isn't double-counted in the entourage
rcm.characters.find(c => c.id === 'chr-chap').homeDomainId = 'dom-march';
const rcs2 = ACKS.realmCommandStructure(rcm, 'dom-march');
ok('realm: a homed magistrate is NOT double-counted in entourageOther',
   !rcs2.entourageOther.some(e => e.id === 'chr-chap') && rcs2.offices.find(o => o.key === 'chaplain').holder.id === 'chr-chap');

// a deceased homed NPC is excluded
rcm.characters.find(c => c.id === 'chr-extra').lifecycleState = 'deceased';
ok('realm: a deceased homed NPC is excluded from the entourage',
   !ACKS.realmCommandStructure(rcm, 'dom-march').entourageOther.some(e => e.id === 'chr-extra'));

// a vacant baron realm uses the title floor
const rcs4 = ACKS.realmCommandStructure(
  { domains:[{ id:'dom-b', name:'Barony of X', rulerCharacterId:null, magistrates:{} }], characters:[], vassalages:[] }, 'dom-b');
ok('realm: a vacant baron realm uses the title floor (ruler level 6)',
   rcs4.rulerLevel === 6 && rcs4.offices.find(o => o.key === 'ruler').filled === false);
ok('realm: baron captain expected L3 (6−3)', rcs4.offices.find(o => o.key === 'captainOfGuard').expectedLevel === 3);
ok('realm: unknown domainId → null', ACKS.realmCommandStructure(rcm, 'dom-nope') === null);

// ── 12. SD-4 — the rural / countryside census (T2, "A Typical Hex") ────────────────────────────────
section('SD-4 — the rural / countryside census (T2)');

['expectedRuralDemographics','realizedRuralDemographics','ruralDemographicDelta','ruralResidents','domainRuralDemographics'].forEach(fn =>
  ok('ACKS.' + fn + ' exported', typeof ACKS[fn] === 'function'));
ok('RURAL_HEX_TEMPLATE = 4 RAW level rows', Array.isArray(ACKS.RURAL_HEX_TEMPLATE) && ACKS.RURAL_HEX_TEMPLATE.length === 4);
ok('RURAL_HEX_REF_FAMILIES = 114', ACKS.RURAL_HEX_REF_FAMILIES === 114);
ok('blankCharacter carries homeHexId (default null)', ACKS.blankCharacter({}).homeHexId === null);
ok('blankCharacter honors opts.homeHexId', ACKS.blankCharacter({ homeHexId:'hex-x' }).homeHexId === 'hex-x');

// EXPECTED — the "A Typical Hex" template (survey §5). A 114-family hex = scale 1.0 = the full template.
section('SD-4 — expectedRuralDemographics (the "A Typical Hex" oracle)');
const rE = ACKS.expectedRuralDemographics({ id:'hex-1', families:114 });
ok('114-family rural hex → scale 1.0', Math.abs(rE.scale - 1) < 1e-9, 'got ' + rE.scale);
ok('rural grid spans MAX_NPC_LEVEL (14 rows)', rE.byLevel.length === 14 && rE.maxLevel === 14);
ok('rural L1 = RAW dice [5.5,4.5,4.5,0.87,0(no explorer),2.5] (1d10/1d8/1d8/87%/—/1d4)',
  [rE.byLevel[0].fighter,rE.byLevel[0].crusader,rE.byLevel[0].thief,rE.byLevel[0].mage,rE.byLevel[0].explorer,rE.byLevel[0].venturer].join(',') === '5.5,4.5,4.5,0.87,0,2.5');
ok('rural L2 = RAW dice [2.5,2.5,2.5,0.5,0,1] (1d4×3/50%/1)',
  [rE.byLevel[1].fighter,rE.byLevel[1].crusader,rE.byLevel[1].thief,rE.byLevel[1].mage,rE.byLevel[1].explorer,rE.byLevel[1].venturer].join(',') === '2.5,2.5,2.5,0.5,0,1');
ok('rural L3 = the 1d4 total (2.5) split via the JJ split (sum 2.5)', Math.abs(rE.byLevel[2].all - 2.5) < 1e-9, 'got ' + rE.byLevel[2].all);
ok('rural L3 split is fighter-led, mage<fighter (renormalized JJ split, explorer 0)',
  rE.byLevel[2].fighter > rE.byLevel[2].mage && rE.byLevel[2].explorer === 0 && Math.round(rE.byLevel[2].fighter*1000) === 772);
ok('rural L4 = the 20%-of-one total (0.2) split (sum 0.2)', Math.abs(rE.byLevel[3].all - 0.2) < 1e-9, 'got ' + rE.byLevel[3].all);
ok('rural L5+ is zero (template tops out at L4)', rE.byLevel[4].all === 0 && rE.byLevel[13].all === 0);
ok('rural explorer = 0 at every level (RAW omits the countryside explorer)', rE.byLevel.every(r => r.explorer === 0));
ok('rural template grand total ≈ 29.57', Math.abs(rE.totals.all - 29.57) < 0.01, 'got ' + rE.totals.all);

// pro-rata scaling + overrides (the JJ p.214 rule SD-1 uses)
const rHalf = ACKS.expectedRuralDemographics({ id:'hex-h', families:57 });
ok('57-family hex → scale 0.5, L1 fighter = 2.75', Math.abs(rHalf.scale - 0.5) < 1e-9 && Math.abs(rHalf.byLevel[0].fighter - 2.75) < 1e-9);
ok('a 0-family hex → empty census (no countryside)', ACKS.expectedRuralDemographics({ id:'hex-empty', families:0 }).totals.all === 0);
const rOv = ACKS.expectedRuralDemographics({ id:'hex-o', families:114, demographicOverrides:{ mage:3 } });
ok('hex demographicOverrides {mage:3} triples mages (0.87→2.61), fighter untouched',
  Math.abs(rOv.byLevel[0].mage - 2.61) < 1e-9 && rOv.byLevel[0].fighter === 5.5);
ok('opts.ruralFamilies overrides hex.families (the domain-aggregate fallback path)',
  ACKS.expectedRuralDemographics({ id:'hex-z', families:0 }, { ruralFamilies:114 }).byLevel[0].fighter === 5.5);

// REALIZED + DELTA — homeHexId residents reconciled against the template
section('SD-4 — realized + delta (homeHexId residents, open / exceptional)');
const ruc = ACKS.blankCampaign({ name:'rural' });
const HEX = 'hex-wild';
ruc.characters.push(ACKS.blankCharacter({ name:'Hedge-Witch Mab', class:'Mage',    level:3, homeHexId:HEX }));        // a hedge wizard
ruc.characters.push(ACKS.blankCharacter({ name:'Old Sarge',      class:'Fighter', level:7, homeHexId:HEX }));        // retired veteran — exceptional (L7 > template L4)
ruc.characters.push(ACKS.blankCharacter({ name:'Silk',           class:'Assassin',level:1, homeHexId:HEX }));        // → thief bucket (OQ-9)
ruc.characters.push(ACKS.blankCharacter({ name:'The Brute',      class:'',         level:1, homeHexId:HEX }));        // unclassed → other
ruc.characters.push(ACKS.blankCharacter({ name:'Elsewhere',      class:'Thief',   level:1, homeHexId:'hex-other' })); // different hex
const ghost = ACKS.blankCharacter({ name:'Ghost', class:'Mage', level:1, homeHexId:HEX }); ghost.lifecycleState = 'deceased'; ruc.characters.push(ghost);
const rReal = ACKS.realizedRuralDemographics(ruc, HEX);
ok('rural realized: 1 mage + 1 fighter + 1 thief (Assassin demographic) homed here', rReal.totals.mage === 1 && rReal.totals.fighter === 1 && rReal.totals.thief === 1);
ok('rural realized: excludes other-hex + deceased; counts 3 bucketed + 1 other', rReal.totals.all === 3 && rReal.otherCount === 1 && rReal.residents === 4);
ok('rural realized: the L3 mage is Hedge-Witch Mab', rReal.byLevel[2].mage === 1 && rReal.byLevel[2].mageNames[0].name === 'Hedge-Witch Mab');
const rD = ACKS.ruralDemographicDelta(ruc, { id:HEX, families:114 });
ok('rural delta: L3 mage is exceptional (template expects <0.5, realized 1)', rD.byLevel[2].mage.exceptional === true && rD.byLevel[2].mage.realized === 1);
ok('rural delta: the L7 fighter is exceptional (template expects 0 above L4)', rD.byLevel[6].fighter.exceptional === true && rD.byLevel[6].fighter.realized === 1);
ok('rural delta: open L1 slots remain (114-fam hex expects ~5 fighters)', rD.byLevel[0].fighter.open >= 4, 'open=' + rD.byLevel[0].fighter.open);
ok('rural delta: exceptionalTotal counts both outliers', rD.exceptionalTotal >= 2);

// THE DOMAIN AGGREGATE — the countryside census across a domain's rural hexes
section('SD-4 — domainRuralDemographics (the countryside census)');
// (a) even-distribution fallback: peasantFamilies 75 over 3 rural hexes (no per-hex authored); a town-hex excluded.
const da = ACKS.blankCampaign({ name:'frontier' });
da.domains.push({ id:'dom-1', name:'Frontier March', demographics:{ peasantFamilies:75 } });
da.hexes.push({ id:'h1', coord:{q:0,r:0}, domainId:'dom-1', families:0 });
da.hexes.push({ id:'h2', coord:{q:1,r:0}, domainId:'dom-1', families:0 });
da.hexes.push({ id:'h3', coord:{q:2,r:0}, domainId:'dom-1', families:0 });
da.hexes.push({ id:'h-town', coord:{q:3,r:0}, domainId:'dom-1', families:200, settlement:{ name:'Saltspur' } });
da.characters.push(ACKS.blankCharacter({ name:'Friar Tom', class:'Cleric', level:3, homeHexId:'h2' }));
da.characters.push(ACKS.blankCharacter({ name:'Townsman',  class:'Venturer', level:2, homeHexId:'h-town' }));   // homed to the town-hex — NOT rural
const agg = ACKS.domainRuralDemographics(da, da.domains[0]);
ok('aggregate: excludes the settlement-hex (3 rural hexes, not 4)', agg.hexCount === 3);
ok('aggregate: even-distribution fallback (no per-hex families authored)', agg.populationSource === 'domain-distributed' && agg.ruralFamilies === 75);
ok('aggregate: expected total ≈ 75/114 × 29.57 ≈ 19', Math.round(agg.totals.all) === 19, 'got ' + agg.totals.all);
ok('aggregate: counts the rural resident (Friar Tom), not the townsman', agg.realizedTotals.all === 1 && agg.byLevel[2].crusader.realized === 1);
ok('aggregate: residents list carries the home-hex name', agg.residents.length === 1 && agg.residents[0].name === 'Friar Tom' && /0100|h2/.test(agg.residents[0].hexName + agg.residents[0].hexId));
ok('aggregate: realized name in the grid is tagged with its hex', (agg.byLevel[2].crusader.names[0] || {}).hexId === 'h2');
ok('aggregate: per-hex summary rows for each rural hex', agg.hexes.length === 3 && agg.hexes.every(h => h.ruralFamilies === 25));
// (b) authored per-hex path: a 114-family rural hex = the full template; a 0-family sibling adds nothing.
const db = ACKS.blankCampaign({ name:'settled' });
db.domains.push({ id:'dom-2', name:'Settled Vale', demographics:{ peasantFamilies:0 } });
db.hexes.push({ id:'ha', coord:{q:0,r:0}, domainId:'dom-2', families:114 });
db.hexes.push({ id:'hb', coord:{q:1,r:0}, domainId:'dom-2', families:0 });
const agg2 = ACKS.domainRuralDemographics(db, db.domains[0]);
ok('aggregate (authored): per-hex families win when any are authored', agg2.populationSource === 'per-hex' && agg2.ruralFamilies === 114);
ok('aggregate (authored): inhabitedHexCount counts only the populated hex', agg2.inhabitedHexCount === 1);
ok('aggregate (authored): a 114-family hex = the full template (~30)', Math.round(agg2.totals.all) === 30);
// (c) ruralResidents — the flat workspace list
ok('ruralResidents: lists the domain\'s rural residents, level-sorted', (() => { const r = ACKS.ruralResidents(da, da.domains[0]); return r.length === 1 && r[0].name === 'Friar Tom' && r[0].bucket === 'crusader'; })());
ok('domainRuralDemographics: a domain with no rural hexes → 0 hexCount, no crash',
  (() => { const c = ACKS.blankCampaign({ name:'empty' }); c.domains.push({ id:'dom-e', name:'Empty', demographics:{ peasantFamilies:50 } }); const a = ACKS.domainRuralDemographics(c, c.domains[0]); return a.hexCount === 0 && a.totals.all === 0; })());

// ── 13. SD-2b — auto-generation (the generator-fed roster fill) ─────────────────────────────────────
section('SD-2b — auto-generation (open-slot fill via the NPC generator)');
function mkRng(seed){ let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

['demographicAutoGenStatus','demographicOpenNotableSlots','fillDemographicSlot','autoFillSettlementRoster',
 'fillRealmOffice','autoFillRealmEntourage','autoFillDomainCountryside'].forEach(fn =>
  ok('ACKS.' + fn + ' exported', typeof ACKS[fn] === 'function'));
ok('demographics-auto-generate registered (domain, default OFF)', (() => {
  const r = ACKS.lookupHouseRule && ACKS.lookupHouseRule('demographics-auto-generate');
  return !!r && r.category === 'domain' && r.default !== true;
})());
ok('generateNPC is available (the generator module loaded)', typeof ACKS.generateNPC === 'function');

// the gate — generator present + BOTH rules on (plan §9: auto-gen layers on living-census)
const gg = ACKS.blankCampaign({ name:'gate' });
ok('gate: no rules → living-census-off (checked before auto-generate)', ACKS.demographicAutoGenStatus(gg).ok === false && ACKS.demographicAutoGenStatus(gg).reason === 'living-census-off');
gg.houseRules['living-census'] = { enabled:true };
ok('gate: living-census on, auto-generate off → auto-generate-off', ACKS.demographicAutoGenStatus(gg).reason === 'auto-generate-off');
gg.houseRules['demographics-auto-generate'] = { enabled:true };
ok('gate: both rules on + generator → ok', ACKS.demographicAutoGenStatus(gg).ok === true);

// URBAN — open-slot reads + targeted + bulk fill
const ac = ACKS.blankCampaign({ name:'autofill' });
ac.houseRules['living-census'] = { enabled:true }; ac.houseRules['demographics-auto-generate'] = { enabled:true };
ac.hexes.push({ id:'hex-cap', coord:{q:0,r:0}, domainId:'dom-a' });
ac.settlements.push({ id:'set-cap', name:'Highcastle', hexId:'hex-cap', families:2500 });   // Class III
ac.domains.push({ id:'dom-a', name:'Aldland', rulerCharacterId:null });
const setCap = ac.settlements[0];

const slots5 = ACKS.demographicOpenNotableSlots(ac, setCap, { minLevel:5 });
ok('open notable slots (L≥5): level-floored', slots5.length > 0 && slots5.every(s => s.level >= 5));
ok('open notable slots: highest-level-first', slots5.every((s,i,a) => i === 0 || a[i-1].level >= s.level));
ok('open notable slots default floor 1 includes the low tail', ACKS.demographicOpenNotableSlots(ac, setCap, {}).some(s => s.level === 1));

const fr = ACKS.fillDemographicSlot(ac, setCap, 'mage', 5, { rng: mkRng(1) });
ok('targeted fill: ok + a character', fr.ok && !!fr.character);
ok('targeted fill: homed to the settlement', fr.character.homeSettlementId === 'set-cap');
ok('targeted fill: it is L5', fr.character.level === 5);
ok('targeted fill: it is a gm-controlled real roster entry', fr.character.controlledBy === 'gm' && ac.characters.indexOf(fr.character) >= 0);
ok('targeted fill: round-trips — the minted NPC buckets back as mage', ACKS.coreBucketForCharacter(ac, fr.character) === 'mage');
ok('targeted fill: a generation event was logged', ac.eventLog.some(e => (e.event && e.event.kind) === 'generation'));
ok('targeted fill: realizedDemographics now counts it (L5 mage)', ACKS.realizedDemographics(ac, 'set-cap').byLevel[4].mage >= 1);
// the crusader bucket ≠ class name ("cleric"/"crusader") — the round-trip that proves the bucket→class→bucket loop
const cr = ACKS.fillDemographicSlot(ac, setCap, 'crusader', 6, { rng: mkRng(2) });
ok('targeted fill: crusader bucket round-trips (Crusader class → crusader)', cr.ok && ACKS.coreBucketForCharacter(ac, cr.character) === 'crusader');
ok('targeted fill: bad bucket refused', ACKS.fillDemographicSlot(ac, setCap, 'wizard', 5, { rng: mkRng(2) }).ok === false);

// BULK — cap + floor + highest-first
const ab = ACKS.blankCampaign({ name:'bulk' });
ab.houseRules['living-census'] = { enabled:true }; ab.houseRules['demographics-auto-generate'] = { enabled:true };
ab.hexes.push({ id:'hx', coord:{q:0,r:0}, domainId:'dom-b' });
ab.settlements.push({ id:'set-b', name:'Bigtown', hexId:'hx', families:5000 });   // Class II — many notables
ab.domains.push({ id:'dom-b', name:'B', rulerCharacterId:null });
const bulk = ACKS.autoFillSettlementRoster(ab, ab.settlements[0], { minLevel:5, maxToFill:6, rng: mkRng(3) });
ok('bulk fill: ok + capped at maxToFill (6)', bulk.ok && bulk.created.length === 6, 'got ' + (bulk.created || []).length);
ok('bulk fill: every minted NPC is L≥5 + homed here', bulk.created.every(c => c.level >= 5 && c.homeSettlementId === 'set-b'));
ok('bulk fill: highest-level-first', bulk.created[0].level >= bulk.created[bulk.created.length - 1].level);

// gate OFF refuses defensively (past the UI) + mints nothing
const offc = ACKS.blankCampaign({ name:'off' });
offc.hexes.push({ id:'hh', coord:{q:0,r:0}, domainId:'dom-o' });
offc.settlements.push({ id:'set-o', name:'O', hexId:'hh', families:2500 });
offc.domains.push({ id:'dom-o', name:'O', rulerCharacterId:null });
const offR = ACKS.autoFillSettlementRoster(offc, offc.settlements[0], { rng: mkRng(4) });
ok('gate OFF: autoFill refuses (living-census-off) + mints nothing', offR.ok === false && offR.reason === 'living-census-off' && offc.characters.length === 0);

// REALM ENTOURAGE — homed via homeDomainId, picked up by realmCommandStructure
const rf = ACKS.blankCampaign({ name:'realm-fill' });
rf.houseRules['living-census'] = { enabled:true }; rf.houseRules['demographics-auto-generate'] = { enabled:true };
rf.domains.push({ id:'dom-r', name:'County of R', rulerCharacterId:'chr-lord', magistrates:{} });
rf.characters.push(ACKS.blankCharacter({ id:'chr-lord', name:'Lord R', class:'Fighter', level:8 }));
const rEnt = ACKS.autoFillRealmEntourage(rf, rf.domains[0], { rng: mkRng(5) });
ok('realm entourage fill: minted the 3 open entourage offices', rEnt.ok && rEnt.created.length === 3, 'got ' + (rEnt.created || []).length);
ok('realm entourage fill: each homed to the realm (homeDomainId)', rEnt.created.every(c => c.homeDomainId === 'dom-r'));
const rcsF = ACKS.realmCommandStructure(rf, 'dom-r');
ok('realm entourage fill: reconciles — magister/guildmaster/annalist now filled', ['magister','guildmaster','annalist'].every(k => rcsF.offices.find(o => o.key === k).filled));
ok('realm entourage fill: the ruler + magistracy offices were left alone (still open)', rcsF.offices.find(o => o.key === 'captainOfGuard').filled === false);
// targeted realm office + the non-entourage refusal
const ro = ACKS.blankCampaign({ name:'ro' });
ro.houseRules['living-census'] = { enabled:true }; ro.houseRules['demographics-auto-generate'] = { enabled:true };
ro.domains.push({ id:'dom-ro', name:'Ro', rulerCharacterId:null, magistrates:{} });
const roR = ACKS.fillRealmOffice(ro, ro.domains[0], 'annalist', { rng: mkRng(6) });
ok('fillRealmOffice: mints one annalist (thief) homed to the realm', roR.ok && roR.character.homeDomainId === 'dom-ro' && ACKS.coreBucketForCharacter(ro, roR.character) === 'thief');
ok('fillRealmOffice: a magistracy office is NOT auto-fillable (appointed elsewhere)', ACKS.fillRealmOffice(ro, ro.domains[0], 'captainOfGuard', { rng: mkRng(7) }).ok === false);

// COUNTRYSIDE — homed via homeHexId, round-robin across rural hexes (the SD-4-deferred mint)
const rr = ACKS.blankCampaign({ name:'rural-fill' });
rr.houseRules['living-census'] = { enabled:true }; rr.houseRules['demographics-auto-generate'] = { enabled:true };
rr.domains.push({ id:'dom-c', name:'Countryside', demographics:{ peasantFamilies:228 } });
rr.hexes.push({ id:'rh1', coord:{q:0,r:0}, domainId:'dom-c', families:0 });
rr.hexes.push({ id:'rh2', coord:{q:1,r:0}, domainId:'dom-c', families:0 });
const ruR = ACKS.autoFillDomainCountryside(rr, rr.domains[0], { minLevel:2, maxToFill:5, rng: mkRng(8) });
ok('rural fill: ok + minted up to maxToFill', ruR.ok && ruR.created.length > 0 && ruR.created.length <= 5);
ok('rural fill: each homed to a rural hex (homeHexId), NOT homeDomainId', ruR.created.every(c => (c.homeHexId === 'rh1' || c.homeHexId === 'rh2') && !c.homeDomainId));
ok('rural fill: round-robins across both rural hexes', ruR.created.some(c => c.homeHexId === 'rh1') && ruR.created.some(c => c.homeHexId === 'rh2'));
ok('rural fill: each L≥2 (the floor)', ruR.created.every(c => c.level >= 2));
ok('rural fill: realizedRuralDemographics now counts them', ACKS.realizedRuralDemographics(rr, 'rh1').residents > 0);
ok('rural fill: a domain with no rural hexes refuses', (() => {
  const c = ACKS.blankCampaign({ name:'norural' });
  c.houseRules['living-census'] = { enabled:true }; c.houseRules['demographics-auto-generate'] = { enabled:true };
  c.domains.push({ id:'dom-nr', name:'NR', demographics:{ peasantFamilies:50 } });
  return ACKS.autoFillDomainCountryside(c, c.domains[0], { rng: mkRng(9) }).reason === 'no-rural-hexes';
})());

// ── 14. SD-7a — the wealth census (plan §8A.2; Econometrics §7) ────────────────────────────────────
section('SD-7a — the wealth census');
{   // block scope — keep these locals out of the file's shared script scope (wc/setW/etc.)
['npcWealthGp','realizedCharacterWealthGp','expectedSettlementWealth','realizedSettlementWealth',
 'settlementWealthDelta','settlementWealthCensus','expectedNpcWealth'].forEach(fn =>
  ok('ACKS.' + fn + ' exported', typeof ACKS[fn] === 'function'));

// the fitted per-level wealth curve — the two explicit §7 anchors + monotonicity
ok('npcWealthGp(0) = 70 (the explicit 0th-level anchor)', ACKS.npcWealthGp(0) === 70, 'got ' + ACKS.npcWealthGp(0));
ok('npcWealthGp(14) ≈ 12,982,800 (the 14th-level anchor, within ±2%)', Math.abs(ACKS.npcWealthGp(14) - 12982800) / 12982800 < 0.02, 'got ' + ACKS.npcWealthGp(14));
let wmono = true; for(let l = 1; l <= 14; l++){ if(!(ACKS.npcWealthGp(l) > ACKS.npcWealthGp(l - 1))) wmono = false; }
ok('npcWealthGp is strictly monotonic L0..L14', wmono);
ok('npcWealthGp(7) is mid-curve (1k < v < 100k)', ACKS.npcWealthGp(7) > 1000 && ACKS.npcWealthGp(7) < 100000, 'got ' + ACKS.npcWealthGp(7));
ok('npcWealthGp tolerates a non-number → 0', ACKS.npcWealthGp(undefined) === 0 && ACKS.npcWealthGp('x') === 0);
ok('expectedNpcWealth(L) === npcWealthGp(L)', ACKS.expectedNpcWealth(5) === ACKS.npcWealthGp(5));

// realizedCharacterWealthGp — the multi-denomination coin purse (canonical) + owned stashes
const wc = ACKS.blankCampaign({ name:'wealth' });
const wChar = { id:'chr-w', name:'Crassus', level:5, class:'Venturer', homeSettlementId:'set-w',
  coins:{ pp:2, gp:100, ep:0, sp:20, cp:0 } };   // 2×5 + 100 + 20×0.1 = 112 gp-equiv
wc.characters.push(wChar);
ok('realizedCharacterWealthGp: the multi-denomination purse gp-equiv (112)', ACKS.realizedCharacterWealthGp(wc, wChar) === 112, 'got ' + ACKS.realizedCharacterWealthGp(wc, wChar));
// a personal cache stash he owns adds its gp value (stashTotalGp is the oracle — robust vs the item model)
wc.stashes.push({ id:'stash-w', kind:'cache', ownerCharacterId:'chr-w', hexId:null,
  items:[ { facets:['coin'], denomination:'gp', qty:500 } ] });
const stashGp = ACKS.stashTotalGp(wc.stashes[0]);
const realW = ACKS.realizedCharacterWealthGp(wc, wChar);
ok('the cache stash has positive gp value', stashGp > 0, 'got ' + stashGp);
ok('realizedCharacterWealthGp: purse + owned-stash gp (112 + ' + stashGp + ')', realW === 112 + stashGp, 'got ' + realW);
ok('realizedCharacterWealthGp(no char) = 0', ACKS.realizedCharacterWealthGp(wc, null) === 0);

// settlement census — expected from the roster × the curve; realized from homed residents
const setW = { id:'set-w', families:80 };   // Class VI
wc.settlements.push(setW);
const expW = ACKS.expectedSettlementWealth(wc, setW);
ok('expectedSettlementWealth: 14 level rows', expW.byLevel.length === 14);
ok('expectedSettlementWealth: per-level gp = expected count × the curve', Math.abs(expW.byLevel[0].gp - (expW.byLevel[0].expectedNpcs * ACKS.npcWealthGp(1))) < 1e-6);
ok('expectedSettlementWealth: totalGp = Σ per-level gp', Math.abs(expW.totalGp - expW.byLevel.reduce((s, r) => s + r.gp, 0)) < 1e-6);
ok('expectedSettlementWealth: a populated Class VI town expects some leveled-NPC wealth', expW.totalGp > 0);

const realSettW = ACKS.realizedSettlementWealth(wc, 'set-w');
ok('realizedSettlementWealth: counts the one homed resident', realSettW.residents === 1 && realSettW.totalGp === realW, 'got ' + JSON.stringify({ r: realSettW.residents, gp: realSettW.totalGp }));
ok('realizedSettlementWealth: the resident lands on his level row (L5)', realSettW.byLevel[4].residents === 1 && realSettW.byLevel[4].gp === realW);

const delW = ACKS.settlementWealthCensus(wc, setW);
ok('settlementWealthCensus: marketClass + expectedGp + realizedGp surfaced', delW.marketClass === 'VI' && delW.expectedGp > 0 && delW.realizedGp === realW);
ok('settlementWealthCensus: a per-level row carries expected + realized', delW.byLevel[4].realizedResidents === 1 && delW.byLevel[4].realizedGp === realW && typeof delW.byLevel[4].expectedNpcs === 'number');
ok('settlementWealthCensus: names the richest residents (sorted desc)', Array.isArray(delW.byLevel[4].names) && delW.byLevel[4].names[0].name === 'Crassus');

// a deceased resident is excluded (the _isResident gate)
wChar.lifecycleState = 'deceased';
ok('settlementWealthCensus: a deceased resident is excluded', ACKS.realizedSettlementWealth(wc, 'set-w').residents === 0);
wChar.lifecycleState = undefined;

// derive-don't-store: the accessors are pure — no campaign mutation (no new field / migration)
const wBefore = JSON.stringify(wc);
ACKS.settlementWealthCensus(wc, setW); ACKS.expectedSettlementWealth(wc, setW); ACKS.npcWealthGp(9);
ok('the wealth census is pure (no campaign mutation)', JSON.stringify(wc) === wBefore);
}

console.log('\n=============================================');
console.log('demographics.smoke.js — Passed: ' + passed + ', Failed: ' + failed);
console.log('=============================================');
process.exit(failed ? 1 : 0);
