// =============================================================================
// treasure.smoke.js — Treasure Generation #142 (T1–T3 + the lair seam).
// Covers: the CATALOG (A–R rows, accumulation, avg gp, gem/jewelry value tiers, special-
// treasure tables — frozen reference data, IN the treasure module not catalogs.js); the
// ROLL ENGINE (generateHoard / planHoard / nearestTreasureType / applySpecialTreasures —
// pure, rng-injectable); the per-tier value averages reproducing the survey's stated RAW
// values; the per-row composite averages within the high-variance band; the MATERIALIZER
// (materializeHoard onto a `cache` Stash via the shipped item spine + magic → notableItems[]
// + captives → Characters + the treasure-generated event w/ Event.context); the Monster-
// Persistence seam (generateHoardForLair); the campaign-setting treasureMode (read defensively);
// and the load-bearing guards — NO new entity/prefix/collection (the §3.1 test fails a hrd-
// Hoard; survey Part 9) + the event kind registered + wizard-opt-out + templates stay no-ops.
// =============================================================================
global.window = global;
require('./_engine.js').load();
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(name, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + name + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('\n--- ' + t + ' ---'); }
// Deterministic PRNG (mulberry32) — no Math.random in the suite, so failures reproduce.
function mb(seed){ let a = seed >>> 0; return function(){ a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function freshCampaign(extra){ return Object.assign({ currentTurn:3, currentDayInMonth:1, calendar:{ year:1, month:1, day:1 }, stashes:[], characters:[], confinements:[], eventLog:[], notableItems:[], itemCustody:[], houseRules:{}, lairs:[] }, extra || {}); }
// Find a Type-R hoard that carries at least one captive (R's ep/pp/regalia captive bands miss
// most of the time), deterministically, so the captive assertions are seed-robust.
function captiveHoard(){ for(let s=0;s<800;s++){ const h = ACKS.generateHoard({ treasureType:'R', rng: mb(5000+s) }); ACKS.applySpecialTreasures(h, { rng: mb(6000+s) }); if(h.captives.length) return h; } return null; }

// =============================================================================
section('Exports present (catalog + roll engine + materializer)');
// =============================================================================
['TREASURE_TYPE_TABLE_CLASSIC','TREASURE_TYPE_TABLES','TREASURE_TYPE_LETTERS','TREASURE_AVG_GP',
 'TREASURE_ACCUMULATION','TREASURE_MODES','GEM_VALUE_TIERS','JEWELRY_VALUE_TIERS','SPECIAL_TREASURE_TABLES',
 'ITEM_RARITY_TIERS','treasureModeFor','treasureTypeRow','treasureTypeAvgGp','treasureAccumulation',
 'nearestTreasureType','targetTreasureGp','itemRarityForCost','rollGemValue','rollJewelryValue',
 'generateHoard','planHoard','applySpecialTreasures','hoardTotalGp','hoardTotalStone',
 'materializeHoard','generateHoardForLair'].forEach(k =>
  ok('export ' + k, typeof ACKS[k] !== 'undefined'));

// =============================================================================
section('Catalog integrity — A–R rows (TT pp.17–19; survey §6.1)');
// =============================================================================
const L = ACKS.TREASURE_TYPE_LETTERS;
ok('18 treasure types A–R', L.length === 18 && L[0] === 'A' && L[17] === 'R');
let wellFormed = true, accumOk = true;
const ACC = new Set(['Hoarder','Raider','Incidental']);
for(const x of L){
  const r = ACKS.TREASURE_TYPE_TABLE_CLASSIC[x];
  if(!r || !r.coins || !r.gems && r.gems !== null || !r.magic || !Array.isArray(r.magic.slots)) wellFormed = false;
  if(!ACC.has(r.accum) || r.accum !== ACKS.treasureAccumulation(x)) accumOk = false;
  if(r.avgGp !== ACKS.TREASURE_AVG_GP[x]) accumOk = false;
}
ok('every row well-formed (coins/gems/jewelry/magic.slots)', wellFormed);
ok('accumulation + avg gp consistent (table ↔ lookups)', accumOk);
ok('R avg = 45,000 (largest)', ACKS.TREASURE_AVG_GP.R === 45000);
ok('A avg = 275 (smallest)', ACKS.TREASURE_AVG_GP.A === 275);
ok('the catalog lives in the TREASURE module, not catalogs.js — TREASURE_TYPE_TABLE_CLASSIC defined', !!ACKS.TREASURE_TYPE_TABLE_CLASSIC);

// =============================================================================
section('Per-tier value averages reproduce the survey RAW values (TT p.22; §6.3–§6.4)');
// =============================================================================
const N_TIER = 60000;
function tierMean(fn, tier, seed){ const rng = mb(seed); let s = 0; for(let i=0;i<N_TIER;i++) s += ACKS[fn](tier, rng); return s / N_TIER; }
const GEM_TARGETS = { ornamental:30, gem:200, brilliant:4000 };
const JEW_TARGETS = { trinket:225, jewelry:1000, regalia:12000 };
for(const t of Object.keys(GEM_TARGETS)){
  const m = tierMean('rollGemValue', t, 100 + t.length), ratio = m / GEM_TARGETS[t];
  ok('gem ' + t + ' mean ≈ ' + GEM_TARGETS[t] + ' (got ' + Math.round(m) + ', ' + ratio.toFixed(2) + ')', ratio > 0.88 && ratio < 1.12);
}
for(const t of Object.keys(JEW_TARGETS)){
  const m = tierMean('rollJewelryValue', t, 200 + t.length), ratio = m / JEW_TARGETS[t];
  ok('jewelry ' + t + ' mean ≈ ' + JEW_TARGETS[t] + ' (got ' + Math.round(m) + ', ' + ratio.toFixed(2) + ')', ratio > 0.88 && ratio < 1.12);
}
// gem values stay in range; a higher die → a more valuable piece (monotone — survey §6.3)
let gemInRange = true; for(let i=0;i<5000;i++){ const v = ACKS.rollGemValue('brilliant', mb(i)); if(v < 500 || v > 10000) gemInRange = false; }
ok('brilliant gems stay in [500, 10,000]', gemInRange);

// =============================================================================
section('Per-row composite averages — the high-variance band (the book avg-gp is a rounded target)');
// =============================================================================
// The RAW "Avg gp" column (= coin+gems+jewelry; magic is tracked SEPARATELY, not in the gp total)
// is a rounded DESIGN target — its arithmetic component-sum can differ ~±60% (e.g. J's components
// sum ~2,160 vs book 4,000; P's ~28,300 vs book 17,000). The generator faithfully reproduces the
// per-tier RAW averages (asserted above); the composite lands in a generous variance band. The exact
// TT pp.22 band cutoffs aren't in the survey (a flagged 🔧 — see the module header + the SUMMARY).
const N_ROW = 5000;
let rowsInBand = 0;
for(const x of L){
  const rng = mb(0x5EED + x.charCodeAt(0));
  let s = 0; for(let i=0;i<N_ROW;i++) s += ACKS.hoardTotalGp(ACKS.generateHoard({ treasureType:x, rng }));
  const ratio = (s / N_ROW) / ACKS.TREASURE_AVG_GP[x];
  if(ratio > 0.4 && ratio < 1.9) rowsInBand++;
}
ok('all 18 rows land within the variance band [0.4, 1.9]× book avg', rowsInBand === 18, rowsInBand + '/18');
// A clean LOW-tier row (ornamental/trinket) tracks the book closely (components = book).
const aRng = mb(7); let aSum = 0; for(let i=0;i<N_ROW;i++) aSum += ACKS.hoardTotalGp(ACKS.generateHoard({ treasureType:'A', rng:aRng }));
ok('Type A mean ≈ 275 (low-tier, components = book)', Math.abs((aSum/N_ROW) - 275) < 80, Math.round(aSum/N_ROW));
// Magic is NOT in the monetary gp total (it's items, tracked separately).
const hMagic = ACKS.generateHoard({ treasureType:'H', rng: mb(1) });
ok('hoard.totals.magicGp is a SEPARATE field (not in .gp)', typeof hMagic.totals.magicGp === 'number');
ok('hoard.totals.gp = coin+gem+jewelry+special (excludes magic)', Math.abs(hMagic.totals.gp - (hMagic.totals.coinGp + hMagic.totals.gemGp + hMagic.totals.jewelryGp + hMagic.totals.specialGp)) < 1);

// =============================================================================
section('generateHoard — shape, determinism, gates');
// =============================================================================
const hR = ACKS.generateHoard({ treasureType:'R', rng: mb(99) });
ok('hoard has the documented shape', hR.treasureType === 'R' && hR.coins && Array.isArray(hR.gems) && Array.isArray(hR.jewelry) && Array.isArray(hR.magicSlots) && hR.totals);
ok('hoard.accumulation = Hoarder (R)', hR.accumulation === 'Hoarder');
ok('determinism: same seed → identical total', ACKS.hoardTotalGp(ACKS.generateHoard({ treasureType:'R', rng: mb(42) })) === ACKS.hoardTotalGp(ACKS.generateHoard({ treasureType:'R', rng: mb(42) })));
ok('unknown treasure type → empty hoard, no throw', ACKS.hoardTotalGp(ACKS.generateHoard({ treasureType:'ZZ', rng: mb(1) })) === 0);
ok('coin stone derives (1,000 coins = 1 st)', (() => { const h = ACKS.generateHoard({ treasureType:'R', rng: mb(5) }); const coins = ['cp','sp','ep','gp','pp'].reduce((a,d)=>a+(h.coins[d]||0),0); return Math.abs(h.totals.stone - coins/1000) < 5; })());

// =============================================================================
section('planHoard + nearestTreasureType + the 4×XP budget (TT p.13/p.17; §6.4)');
// =============================================================================
ok('nearestTreasureType(45000) = R', ACKS.nearestTreasureType(45000) === 'R');
ok('nearestTreasureType(280) = A', ACKS.nearestTreasureType(280) === 'A');
ok('nearestTreasureType(2050) = G (avg 2000)', ACKS.nearestTreasureType(2050) === 'G');
ok('targetTreasureGp(Σxp 11250) = 45000 (4×)', ACKS.targetTreasureGp(11250) === 45000);
const plan = ACKS.planHoard(ACKS.targetTreasureGp(11250), 'classic', { rng: mb(7) });
ok('planHoard picks R for a 45,000 target + sets planned flag', plan.treasureType === 'R' && plan.planned === true);
ok('planHoard reports targetGp + deltaGp', plan.targetGp === 45000 && typeof plan.deltaGp === 'number');

// =============================================================================
section('itemRarityForCost (TT p.22)');
// =============================================================================
ok('1000 gp → common', ACKS.itemRarityForCost(1000) === 'common');
ok('5000 gp → uncommon', ACKS.itemRarityForCost(5000) === 'uncommon');
ok('25000 gp → rare', ACKS.itemRarityForCost(25000) === 'rare');
ok('100000 gp → very-rare', ACKS.itemRarityForCost(100000) === 'very-rare');
ok('150000 gp → legendary', ACKS.itemRarityForCost(150000) === 'legendary');

// =============================================================================
section('materializeHoard — a `cache` Stash on the SHIPPED item spine (T2; survey Part 8)');
// =============================================================================
const camp = freshCampaign();
const hoard = ACKS.generateHoard({ treasureType:'R', rng: mb(123) });
const res = ACKS.materializeHoard(camp, hoard, { hexId:'hex-test', reason:'smoke' });
ok('materialize returns { stash, deposited, notables, captives, event }', res && res.stash && Array.isArray(res.deposited) && Array.isArray(res.notables) && Array.isArray(res.captives));
ok('lands a `cache` kind Stash (no new entity — reuses blankStash)', res.stash.kind === 'cache');
ok('stash at the target hex', res.stash.hexId === 'hex-test');
ok('one stash pushed onto campaign.stashes', camp.stashes.length === 1);
ok('stash has facet item lines', res.stash.items.length > 0);
ok('NO new collection — wrote to campaign.stashes (shipped)', Array.isArray(camp.stashes) && camp.stashes[0] === res.stash);
// derived value/weight via the shipped accessors
const stashGp = ACKS.stashTotalGp(res.stash), stashSt = ACKS.stashTotalEncumbrance(res.stash);
ok('stash gp derives via the shipped itemValueGp accessor (> 0)', stashGp > 0);
ok('stash encumbrance derives via the shipped itemEncumbranceSt accessor (> 0)', stashSt > 0);
ok('coin lines carry the coin facet + denomination', res.stash.items.some(it => ACKS.itemHasFacet(it, 'coin') && it.denomination));
// Materialize a hoard KNOWN to carry valuables (R's gem/jewelry gates miss ~30–40% of the time) —
// found deterministically so the valuable-line assertion is seed-robust.
let valHoard = null; for(let s=0;s<200 && !valHoard;s++){ const h = ACKS.generateHoard({ treasureType:'R', rng: mb(8000+s) }); if(h.gems.length && h.jewelry.length) valHoard = h; }
const campV = freshCampaign();
const resV = ACKS.materializeHoard(campV, valHoard, { hexId:'hex-v' });
ok('found a valuable-bearing hoard', !!valHoard && valHoard.gems.length > 0 && valHoard.jewelry.length > 0);
ok('valuable lines carry the valuable facet + valuableType + unitValueGp', resV.stash.items.some(it => ACKS.itemHasFacet(it, 'valuable') && it.valuableType && it.unitValueGp > 0));
ok('gem + jewelry both land as valuable lines', resV.stash.items.filter(it => ACKS.itemHasFacet(it, 'valuable')).length === (valHoard.gems.length + valHoard.jewelry.length));
// magic slots → promoted notable items
ok('magic slots promoted to notableItems[] (count matches notables)', camp.notableItems.length === res.notables.length);
if(res.notables.length){
  ok('a promoted notable carries the treasure-generated provenance', res.notables[0].intrinsic && res.notables[0].intrinsic.source === 'treasure-generated');
  ok('the magical line points at its notableItemId', res.stash.items.some(it => ACKS.itemHasFacet(it, 'magical') && it.notableItemId));
}
// the audit event
ok('treasure-generated event emitted', res.event && res.event.kind === 'treasure-generated');
ok('event in the eventLog (status applied)', camp.eventLog.length === 1 && camp.eventLog[0].event.kind === 'treasure-generated');
ok('Event.context.primaryHexId = the hex (CLAUDE §8.9 envelope)', res.event.context && res.event.context.primaryHexId === 'hex-test');
ok('event payload carries treasureType + totalGp + stashId', res.event.payload.treasureType === 'R' && typeof res.event.payload.totalGp === 'number' && res.event.payload.stashId === res.stash.id);

// =============================================================================
section('Special treasures + captives — the lot-substitution pass (T3; TT p.23; §6.5)');
// =============================================================================
let sawSpecial = false, sawCaptive = false, valuePreserved = true;
for(let s=0; s<300 && (!sawSpecial || !sawCaptive); s++){
  const h = ACKS.generateHoard({ treasureType:'R', rng: mb(1000+s) });
  const before = ACKS.hoardTotalGp(h);
  ACKS.applySpecialTreasures(h, { rng: mb(2000+s) });
  const after = ACKS.hoardTotalGp(h);
  if(h.specialTreasures.length) sawSpecial = true;
  if(h.captives.length) sawCaptive = true;
  // substituting a good ≈ the lot it replaces → total stays roughly constant (within 50%)
  if(before > 0 && (after/before < 0.5 || after/before > 1.8)) valuePreserved = false;
}
ok('special treasures substitute on some R hoards', sawSpecial);
ok('captives appear on some R hoards (ep/pp/regalia)', sawCaptive);
ok('hoard total ≈ preserved across the substitution', valuePreserved);
// a special-treasure goods line carries qty + per-piece value + weight
let goodsHoard = null; for(let s=0;s<500 && !goodsHoard;s++){ const h = ACKS.generateHoard({ treasureType:'R', rng: mb(3000+s) }); ACKS.applySpecialTreasures(h, { rng: mb(3500+s) }); if(h.specialTreasures.length) goodsHoard = h; }
ok('found a goods hoard', !!goodsHoard);
if(goodsHoard){ const g = goodsHoard.specialTreasures[0]; ok('goods line: name + qty + per-piece valueGp + weightSt', g.name && g.qty >= 1 && g.valueGp > 0 && typeof g.weightSt === 'number'); }

// captive → Character (imprisoned by default; no slavery rule)
const campC = freshCampaign();
let capHoard = null; for(let s=0;s<600 && !capHoard;s++){ const h = ACKS.generateHoard({ treasureType:'R', rng: mb(5000+s) }); ACKS.applySpecialTreasures(h, { rng: mb(6000+s) }); if(h.captives.length) capHoard = h; }
ok('found a captive hoard to materialize', !!capHoard);
if(capHoard){
  const rC = ACKS.materializeHoard(campC, capHoard, { hexId:'hex-c' });
  ok('captives → Characters (count matches)', rC.captives.length === capHoard.captives.length && campC.characters.length === capHoard.captives.length);
  const cap = campC.characters[0];
  ok('captive lifecycleState = imprisoned (no slavery rule — RAW-neutral default)', cap.lifecycleState === 'imprisoned' && cap.socialTier === 'independent');
  ok('captive carries a ransom value + currentHexId', typeof cap.ransomValueGp === 'number' && cap.currentHexId === 'hex-c');
  ok('a captive Character is in the Event.context relatedEntities', rC.event.context.relatedEntities.some(e => e.kind === 'character'));
}
// slavery rule on → socialTier slave
const campS = freshCampaign({ houseRules: { slavery: { enabled: true } } });
let capHoard2 = null; for(let s=0;s<600 && !capHoard2;s++){ const h = ACKS.generateHoard({ treasureType:'R', rng: mb(7000+s) }); ACKS.applySpecialTreasures(h, { rng: mb(7500+s) }); if(h.captives.length) capHoard2 = h; }
if(capHoard2){ const rS = ACKS.materializeHoard(campS, capHoard2, { hexId:'hex-s' }); ok('slavery rule ON → captive socialTier slave', campS.characters[0].socialTier === 'slave'); }

// =============================================================================
section('generateHoardForLair — the Monster-Persistence seam (T4; closes M2/M3 deferral)');
// =============================================================================
const campL = freshCampaign();
const lair = ACKS.blankLair({ name:'Bandit Camp', hexId:'hex-lair', monsterCatalogKey:'bandit' });  // bandit catalog TT = E
campL.lairs.push(lair);
const lr = ACKS.generateHoardForLair(campL, lair.id, { rng: mb(321) });
ok('reads the bound monster catalog Treasure Type (bandit = E)', lr && lr.hoard && lr.hoard.treasureType === 'E');
ok('materializes the lair hoard as a stash', lr.stash && campL.stashes.length === 1);
ok('lair.treasureCustodyId linked to the hoard stash', lair.treasureCustodyId === lr.stash.id);
ok('lair history records the treasure', Array.isArray(lair.history) && lair.history.some(h => h.type === 'treasure'));
// explicit lair.treasureType wins over the catalog
const lairQ = ACKS.blankLair({ name:'Dragon Den', hexId:'hex-q', treasureType:'Q', monsterCatalogKey:'bandit' });
campL.lairs.push(lairQ);
const lrQ = ACKS.generateHoardForLair(campL, lairQ.id, { rng: mb(55) });
ok('explicit lair.treasureType (Q) wins over the monster catalog (E)', lrQ.hoard.treasureType === 'Q');
// no treasure type → graceful
const lairE = ACKS.blankLair({ name:'Empty Cave', hexId:'hex-e' });
campL.lairs.push(lairE);
const lrE = ACKS.generateHoardForLair(campL, lairE.id, { rng: mb(1) });
ok('no Treasure Type → graceful (no stash, reason returned)', lrE && lrE.reason === 'no-treasure-type' && !lrE.stash);
ok('unknown lairId → null', ACKS.generateHoardForLair(campL, 'lai-nope', {}) === null);
// with special treasures
const lairR = ACKS.blankLair({ name:'Hoard', hexId:'hex-r', treasureType:'R' });
campL.lairs.push(lairR);
const lrR = ACKS.generateHoardForLair(campL, lairR.id, { withSpecialTreasures:true, rng: mb(9) });
ok('generateHoardForLair honors withSpecialTreasures', lrR && lrR.hoard && lrR.stash);

// =============================================================================
section('treasureMode — a campaign SETTING read defensively (NOT a house rule; CLAUDE §6)');
// =============================================================================
ok('default mode = classic (no setting on the campaign)', ACKS.treasureModeFor(freshCampaign()) === 'classic');
ok('campaign.treasureMode = heroic is read', ACKS.treasureModeFor(freshCampaign({ treasureMode:'heroic' })) === 'heroic');
ok('an invalid mode falls back to classic', ACKS.treasureModeFor(freshCampaign({ treasureMode:'bogus' })) === 'classic');
ok('TREASURE_MODES = [classic, heroic, gritty]', ACKS.TREASURE_MODES.length === 3 && ACKS.TREASURE_MODES[0] === 'classic');
ok('heroic/gritty SHARE the Classic value table (equal value; mode = coin-weight + by-rarity transforms — T5)', ACKS.TREASURE_TYPE_TABLES.heroic === ACKS.TREASURE_TYPE_TABLE_CLASSIC && ACKS.TREASURE_TYPE_TABLES.gritty === ACKS.TREASURE_TYPE_TABLE_CLASSIC);

// =============================================================================
section('No new entity / prefix / collection (the §3.1 test fails a hrd- Hoard; survey Part 9)');
// =============================================================================
ok('NO hrd- prefix registered (reserved on paper only)', !ACKS.ID_PREFIXES || !ACKS.ID_PREFIXES.hoard);
ok('NO trs- prefix registered (reserved on paper only)', !ACKS.ID_PREFIXES || !ACKS.ID_PREFIXES.treasure);
ok('NO blankHoard factory (the generator writes shipped shapes)', typeof ACKS.blankHoard === 'undefined');
ok('treasure-generated is a known event kind', typeof ACKS.isEventKindKnown === 'function' && ACKS.isEventKindKnown('treasure-generated'));
ok('treasure-generated is NOT raw-wizard-emittable (owned by materializeHoard)', typeof ACKS.isWizardEmittable === 'function' && ACKS.isWizardEmittable('treasure-generated') === false);

// =============================================================================
section('T4 — magic slots resolve against the SHIPPED #143 catalog (real NotableItems)');
// =============================================================================
const t4 = ACKS.generateHoard({ treasureType:'R', mode:'classic', rng: mb(123) });
ok('hoard.magicItems is a resolved item list (one per item)', Array.isArray(t4.magicItems) && t4.magicItems.length > 0);
ok('magicItems count = Σ magicSlot counts', t4.magicItems.length === t4.magicSlots.reduce((s,x)=>s+(x.count||0),0));
ok('each resolved item carries a catalog key + kind + rarity + apparentValue', t4.magicItems.every(m => m.key && m.kind && m.rarity && typeof m.apparentValue === 'number'));
ok('every key resolves in the #143 catalog (read-only consume)', typeof ACKS.findMagicItemCatalog === 'function' && t4.magicItems.every(m => !!ACKS.findMagicItemCatalog(m.key)));
ok('magicEstGp = Σ resolved apparent values (not the flat row avg)', t4.magicEstGp === t4.magicItems.reduce((s,m)=>s+(m.apparentValue||0),0));
ok('cursed catalog entries are excluded from random rolls', t4.magicItems.every(m => { const e = ACKS.findMagicItemCatalog(m.key); return e && !e.cursed; }));
// Classic resolves BY TYPE.
const t4potSlots = t4.magicSlots.filter(s => s.category === 'potion').reduce((s,x)=>s+x.count,0);
const t4potItems = t4.magicItems.filter(m => m.category === 'potion');
ok('classic by-type: a potion slot yields kind:potion items', t4potItems.length === t4potSlots && t4potItems.every(m => m.kind === 'potion'));
ok('classic by-type: weapon-or-armor slots yield magic-weapon/armor', t4.magicItems.filter(m => m.category === 'weapon-or-armor').every(m => m.kind === 'magic-weapon' || m.kind === 'magic-armor'));
// Materialize → real NotableItems with the catalog intrinsic shape.
const t4camp = freshCampaign();
const t4res = ACKS.materializeHoard(t4camp, t4, { hexId:'hex-t4' });
ok('materialized notables = resolved item count', t4res.notables.length === t4.magicItems.length && t4camp.notableItems.length === t4.magicItems.length);
const t4ni = t4res.notables[0];
ok('a notable carries the #143 intrinsic shape (rarity + baseCost + pageRef)', !!t4ni && !!t4ni.intrinsic && !!t4ni.intrinsic.rarity && typeof t4ni.intrinsic.baseCost === 'number' && !!t4ni.intrinsic.pageRef);
ok('a notable is tagged treasure-generated + filledFromCatalog', t4ni.intrinsic.source === 'treasure-generated' && t4ni.intrinsic.filledFromCatalog === true);
ok('a notable points back at a real catalog key (baseCatalogKey)', !!t4ni.baseCatalogKey && !!ACKS.findMagicItemCatalog(t4ni.baseCatalogKey));
ok('the magical stash line points at its notable (notableItemId)', t4res.stash.items.some(it => ACKS.itemHasFacet(it,'magical') && it.notableItemId));
ok('the audit event reports magicItemCount', t4res.event && typeof t4res.event.payload.magicItemCount === 'number' && t4res.event.payload.magicItemCount === t4.magicItems.length);
// Determinism — the catalog fill is reproducible with a fixed rng.
ok('magic fill is deterministic (same seed → identical keys)', JSON.stringify(ACKS.generateHoard({treasureType:'R',mode:'classic',rng:mb(123)}).magicItems.map(m=>m.key)) === JSON.stringify(t4.magicItems.map(m=>m.key)));

// =============================================================================
section('T5 — Heroic / Gritty modes: heavier coin (same value) + by-rarity magic');
// =============================================================================
// Same seed → coin VALUE preserved across modes; Heroic/Gritty markedly heavier.
const t5cR = ACKS.generateHoard({ treasureType:'R', mode:'classic', rng: mb(1) });
const t5hR = ACKS.generateHoard({ treasureType:'R', mode:'heroic',  rng: mb(1) });
const t5gR = ACKS.generateHoard({ treasureType:'R', mode:'gritty',  rng: mb(1) });
ok('same seed → gems identical across modes (only coin/magic transform differs)', JSON.stringify(t5cR.gems) === JSON.stringify(t5hR.gems) && JSON.stringify(t5cR.gems) === JSON.stringify(t5gR.gems));
ok('Heroic preserves the gp total (RAW: equal value per type)', Math.abs(ACKS.hoardTotalGp(t5hR) - ACKS.hoardTotalGp(t5cR)) <= 5);
ok('Gritty preserves the gp total', Math.abs(ACKS.hoardTotalGp(t5gR) - ACKS.hoardTotalGp(t5cR)) <= 5);
ok('Heroic coin is markedly heavier than Classic at equal value (≥3× st)', ACKS.hoardTotalStone(t5hR) >= ACKS.hoardTotalStone(t5cR) * 3);
function meanStone(mode){ let st=0; const N=2000; for(let i=0;i<N;i++) st += ACKS.hoardTotalStone(ACKS.generateHoard({treasureType:'R',mode,rng:mb(7000+i)})); return st/N; }
const t5mc = meanStone('classic'), t5mh = meanStone('heroic');
ok('Heroic mean weight ≈ 3–8× Classic (got ' + (t5mh/t5mc).toFixed(1) + '×)', (t5mh/t5mc) >= 3 && (t5mh/t5mc) <= 8);
// By-rarity magic: Heroic spans a spread of rarities; Gritty makes Legendary much rarer.
function rarities(mode, n){ const c={}; for(let i=0;i<n;i++){ const h=ACKS.generateHoard({treasureType:'R',mode,rng:mb(40000+i)}); for(const m of h.magicItems) c[m.rarity]=(c[m.rarity]||0)+1; } return c; }
const heroR = rarities('heroic', 3000), gritR = rarities('gritty', 3000);
ok('Heroic magic spans ≥3 rarity tiers (by rarity, not type-locked)', Object.keys(heroR).length >= 3);
ok('Heroic produces Legendary items on the tail', (heroR.legendary||0) > 0);
ok('Gritty makes Legendary much rarer than Heroic (<1/5)', (gritR.legendary||0) * 5 < (heroR.legendary||0));
ok('Gritty skews to lower rarities (common+uncommon > Heroic)', ((gritR.common||0)+(gritR.uncommon||0)) > ((heroR.common||0)+(heroR.uncommon||0)));
ok('Heroic determinism: same seed → identical hoard', JSON.stringify(ACKS.generateHoard({treasureType:'R',mode:'heroic',rng:mb(5)})) === JSON.stringify(ACKS.generateHoard({treasureType:'R',mode:'heroic',rng:mb(5)})));
// The campaign setting drives the mode (what the wizard reads).
const t5camp = freshCampaign({ treasureMode:'heroic' });
ok('treasureModeFor(campaign) drives generateHoard mode (heroic)', ACKS.generateHoard({ treasureType:'M', mode: ACKS.treasureModeFor(t5camp) }).mode === 'heroic');
ok('Classic (the default) is unchanged — by type, light coin', t5cR.mode === 'classic' && t4.magicItems.some(m => m.category === 'potion'));

// =============================================================================
section('T3 — the TT p.23 Type-L special-treasure example (4 cp + 3 sp + 4 jewelry lots) reproduces');
// =============================================================================
function buildTypeL(){ return { treasureType:'L', mode:'classic', accumulation:'Raider',
  coins:{ cp:4000, sp:3000, ep:0, gp:0, pp:0 }, gems:[],
  jewelry:[0,0,0,0].map(()=>({ tier:'jewelry', valueGp:1000 })),
  magicSlots:[], magicItems:[], magicEstGp:0, specialTreasures:[], captives:[], totals:null }; }
const tlA = buildTypeL(); const tlBefore = ACKS.hoardTotalGp(tlA);
ACKS.applySpecialTreasures(tlA, { rng: mb(2026) });
const tlAfter = ACKS.hoardTotalGp(tlA);
ok('4 cp + 3 sp + 4 jewelry lots → some substituted goods', tlA.specialTreasures.length > 0);
ok('substituted coin lots removed in 1,000-coin increments', (tlA.coins.cp % 1000 === 0) && (tlA.coins.sp % 1000 === 0) && tlA.coins.cp <= 4000 && tlA.coins.sp <= 3000);
ok('value ≈ preserved across the substitution (within band)', tlBefore > 0 && (tlAfter/tlBefore) > 0.5 && (tlAfter/tlBefore) < 1.8);
ok('a substituted good carries name + qty + per-piece valueGp + weightSt (RR-Ch.8-congruent)', tlA.specialTreasures.every(s => s.name && s.qty >= 1 && s.valueGp > 0 && typeof s.weightSt === 'number'));
const tlB = buildTypeL(); ACKS.applySpecialTreasures(tlB, { rng: mb(2026) });
ok('reproduces with fixed rng (deterministic specialTreasures + coins)', JSON.stringify(tlA.specialTreasures) === JSON.stringify(tlB.specialTreasures) && JSON.stringify(tlA.coins) === JSON.stringify(tlB.coins));
// A different seed substitutes a different set (the lot rolls are real, not constant).
const tlC = buildTypeL(); ACKS.applySpecialTreasures(tlC, { rng: mb(99) });
ok('a different rng → a different substitution set (real d20 lot rolls)', JSON.stringify(tlA.specialTreasures) !== JSON.stringify(tlC.specialTreasures) || JSON.stringify(tlA.coins) !== JSON.stringify(tlC.coins));

// =============================================================================
section('Wave-C — confinements: the captive↔captor relation (cnf-) + lifecycle');
// =============================================================================
// Exports + self-registration (FROM the treasure module via the PR #89/#90 kernel).
['blankConfinement','createConfinement','findConfinement','confinementsForCaptive','confinementForCaptive',
 'confinementsForCaptor','activeConfinements','ransomConfinement','releaseConfinement','captiveEscapes',
 'confinementEscapeChance','proposeConfinementEscapeDay','commitConfinementRecord','processConfinementsForTurn']
  .forEach(k => ok('export ' + k, typeof ACKS[k] === 'function'));
ok('self-reg: cnf- prefix registered FROM the module', ACKS.ID_PREFIXES && ACKS.ID_PREFIXES.confinement === 'cnf');
ok('self-reg: confinements collection registered', ACKS.registeredCollections().some(c => c.name === 'confinements'));
ok('self-reg: confinements is defensive-read (NOT migrate-injected — template no-op enabler)',
  !ACKS.lazyDefaultCollections().includes('confinements') && ACKS.seededCollections().includes('confinements'));
ok('self-reg: confinement entity-kind registered (⛓)', !!(ACKS.ENTITY_KINDS && ACKS.ENTITY_KINDS.confinement) && ACKS.entityIcon('confinement') === '⛓');
ok('self-reg: confinement field-schema registered (factory blankConfinement)', ACKS.FIELD_SCHEMAS.confinement && ACKS.FIELD_SCHEMAS.confinement.factory === 'blankConfinement');
['captive-ransomed','captive-released','captive-escaped'].forEach(k => {
  ok('self-reg: event kind ' + k + ' known', typeof ACKS.isEventKindKnown === 'function' && ACKS.isEventKindKnown(k));
  ok('self-reg: ' + k + ' is wizard-opt-out (owned by the verbs)', ACKS.isWizardEmittable(k) === false);
});
// schema ⊆ factory (the local mirror of the global invariant in smoke.js — catches drift here).
{ const fk = new Set(Object.keys(ACKS.blankConfinement({})));
  const extras = ACKS.FIELD_SCHEMAS.confinement.fields.filter(f => f.type !== 'computed').map(f => f.name).filter(n => !fk.has(n));
  ok('confinement schema fields ⊆ blankConfinement keys', extras.length === 0, 'extras: [' + extras.join(', ') + ']'); }

// blankConfinement shape + the relation-end-field invariant (resolvedAtTurn emitted from creation).
const cb = ACKS.blankConfinement({ captiveCharacterId:'chr-x', ransomValueGp:500 });
ok('blankConfinement: kind/status/type defaults + ransom + end-fields-from-creation', cb.kind === 'confinement' && cb.status === 'held' && cb.confinementType === 'ransom' && cb.ransomValueGp === 500 && cb.resolvedAtTurn === null && cb.resolution === null && cb.lastEscapeCheckTurn === null);

// materializeHoard auto-lifts each captive into a confinement.
const cCamp = freshCampaign();
const cHoard = captiveHoard();
ok('found a captive-bearing R hoard', !!cHoard && cHoard.captives.length > 0);
const cRes = ACKS.materializeHoard(cCamp, cHoard, { hexId:'hex-cnf' });
ok('materialize returns a confinements[] (count = captives)', Array.isArray(cRes.confinements) && cRes.confinements.length === cHoard.captives.length);
ok('one confinement per captive on campaign.confinements', cCamp.confinements.length === cHoard.captives.length);
const cf = cCamp.confinements[0];
ok('confinement shape: held + ransom + value + captiveId + hex + confinedAtTurn', cf.status === 'held' && cf.confinementType === 'ransom' && cf.ransomValueGp > 0 && cf.captiveCharacterId === cRes.captives[0].id && cf.hexId === 'hex-cnf' && cf.confinedAtTurn === cCamp.currentTurn);
ok('confinement carries the treasure provenance', cf.source && cf.source.kind === 'treasure');
ok('captive Character is imprisoned + ransomValueGp denormalized', cRes.captives[0].lifecycleState === 'imprisoned' && cRes.captives[0].ransomValueGp === cf.ransomValueGp);
ok('treasure-generated event reports confinementCount', cRes.event.payload.confinementCount === cHoard.captives.length);

// Lookups (reverse indices computed).
ok('findConfinement', ACKS.findConfinement(cCamp, cf.id) === cf);
ok('confinementsForCaptive', ACKS.confinementsForCaptive(cCamp, cf.captiveCharacterId)[0] === cf);
ok('confinementForCaptive (the active one)', ACKS.confinementForCaptive(cCamp, cf.captiveCharacterId) === cf);
ok('activeConfinements lists held ones', ACKS.activeConfinements(cCamp).length === cCamp.confinements.length);

// lair-hoard → the captor is the lair.
const cnfLairCamp = freshCampaign();
const cnfLair = ACKS.blankLair({ name:'Slaver Den', hexId:'hex-l', treasureType:'R' }); cnfLairCamp.lairs.push(cnfLair);
let cnfLr = null; for(let s=0;s<400 && !cnfLr;s++){ const r = ACKS.generateHoardForLair(cnfLairCamp, cnfLair.id, { withSpecialTreasures:true, rng: mb(9000+s) }); if(r && r.confinements && r.confinements.length){ cnfLr = r; } else { cnfLairCamp.confinements = []; cnfLairCamp.characters = []; cnfLairCamp.stashes = []; cnfLairCamp.eventLog = []; } }
ok('generateHoardForLair lifts captives bound to the lair captor', !!cnfLr && cnfLr.confinements[0].captor && cnfLr.confinements[0].captor.kind === 'lair' && cnfLr.confinements[0].captor.id === cnfLair.id);

// Ransom — frees the captive, status ransomed, event, guarded re-ransom.
const r1 = ACKS.ransomConfinement(cCamp, cf.id);
ok('ransom ok', r1.ok === true);
ok('ransom: status ransomed + resolution + resolvedAtTurn', cf.status === 'ransomed' && cf.resolution === 'ransomed' && cf.resolvedAtTurn === cCamp.currentTurn);
ok('ransom frees the captive (imprisoned → active)', cCamp.characters.find(c => c.id === cf.captiveCharacterId).lifecycleState === 'active');
ok('ransom emits captive-ransomed (in the eventLog)', r1.event && r1.event.kind === 'captive-ransomed' && cCamp.eventLog.some(e => e.event.kind === 'captive-ransomed'));
ok('ransom amount = the confinement ransom value by default', r1.amountGp === cf.ransomValueGp);
ok('re-ransoming a resolved confinement is guarded', ACKS.ransomConfinement(cCamp, cf.id).ok === false);

// Ransom → a character captor: gp flows to that captor (GP Wave B).
const rcCamp = freshCampaign();
const captor = ACKS.blankCharacter({ name:'Lord Captor', coins:{ pp:0, gp:0, ep:0, sp:0, cp:0 } });
rcCamp.characters.push(captor);
const prisoner = ACKS.blankCharacter({ name:'Prisoner', lifecycleState:'imprisoned', currentHexId:'hex-y' });
rcCamp.characters.push(prisoner);
const rcConf = ACKS.createConfinement(rcCamp, { captiveCharacterId: prisoner.id, captor:{ kind:'character', id: captor.id, label:'Lord Captor' }, ransomValueGp:1000, hexId:'hex-y' });
const capGpBefore = (captor.coins && captor.coins.gp) || captor.personalGp || 0;
const r2 = ACKS.ransomConfinement(rcCamp, rcConf.id);
const capGpAfter = (rcCamp.characters[0].coins && rcCamp.characters[0].coins.gp) || rcCamp.characters[0].personalGp || 0;
ok('ransom → character captor: gp flows to the captor (+1000)', r2.ok && (capGpAfter - capGpBefore) === 1000);

// Release — frees the captive, no payment.
const relCamp = freshCampaign();
const relP = ACKS.blankCharacter({ name:'RelP', lifecycleState:'imprisoned' }); relCamp.characters.push(relP);
const relConf = ACKS.createConfinement(relCamp, { captiveCharacterId: relP.id, ransomValueGp:200 });
const r3 = ACKS.releaseConfinement(relCamp, relConf.id);
ok('release ok + status released + frees the captive + event', r3.ok && relConf.status === 'released' && relConf.resolution === 'released' && relP.lifecycleState === 'active' && r3.event.kind === 'captive-released');

// Escape — the monthly seeded check (slot-70 day-consumer / processConfinementsForTurn).
const escCamp = freshCampaign();
const escP = ACKS.blankCharacter({ name:'EscP', lifecycleState:'imprisoned', currentHexId:'hex-e' }); escCamp.characters.push(escP);
const escConf = ACKS.createConfinement(escCamp, { captiveCharacterId: escP.id, ransomValueGp:300, escapeChanceMonthly:1 });
const escProp = ACKS.processConfinementsForTurn(escCamp, {});
ok('escape (chance 1): status escaped + frees captive + lastEscapeCheckTurn stamped', escConf.status === 'escaped' && escConf.resolution === 'escaped' && escP.lifecycleState === 'active' && escConf.lastEscapeCheckTurn === escCamp.currentTurn);
ok('escape emits captive-escaped (carries the roll + chance)', escCamp.eventLog.some(e => e.event.kind === 'captive-escaped') && escProp.pendingRecords.length === 1);

// Escape chance 0 → never escapes, but the cadence gate IS stamped (so the month isn't re-rolled).
const noEsc = freshCampaign();
const neP = ACKS.blankCharacter({ name:'NeP', lifecycleState:'imprisoned' }); noEsc.characters.push(neP);
const neConf = ACKS.createConfinement(noEsc, { captiveCharacterId: neP.id, escapeChanceMonthly:0 });
ACKS.processConfinementsForTurn(noEsc, {});
ok('escape chance 0: stays held + lastEscapeCheckTurn stamped', neConf.status === 'held' && neConf.lastEscapeCheckTurn === noEsc.currentTurn);
ok('confinementEscapeChance clamps to [0,1]', ACKS.confinementEscapeChance(noEsc, { escapeChanceMonthly:5 }) === 1 && ACKS.confinementEscapeChance(noEsc, { escapeChanceMonthly:0 }) === 0);

// Monthly cadence — re-running the same turn proposes nothing (the lastEscapeCheckTurn gate).
const cadCamp = freshCampaign();
const cadP = ACKS.blankCharacter({ name:'CadP', lifecycleState:'imprisoned' }); cadCamp.characters.push(cadP);
const cadConf = ACKS.createConfinement(cadCamp, { captiveCharacterId: cadP.id, escapeChanceMonthly:0.5 });
ACKS.processConfinementsForTurn(cadCamp, {});
const reRun = ACKS.processConfinementsForTurn(cadCamp, { dryRun:true });
ok('cadence: re-running the same turn proposes nothing (once-per-month gate)', reRun.pendingRecords.length === 0);
cadCamp.currentTurn = 4;   // next month → the gate re-opens (if still held)
ok('cadence: a new turn re-opens the check', cadConf.status !== 'held' || ACKS.processConfinementsForTurn(cadCamp, { dryRun:true }).pendingRecords.length === 1);

// Seeded determinism — a dry-run reproduces the identical roll (byte-stable preview).
const seedCamp = freshCampaign();
const seedP = ACKS.blankCharacter({ name:'SeedP', lifecycleState:'imprisoned' }); seedCamp.characters.push(seedP);
ACKS.createConfinement(seedCamp, { captiveCharacterId: seedP.id, escapeChanceMonthly:0.5 });
const d1 = ACKS.processConfinementsForTurn(seedCamp, { dryRun:true }).pendingRecords[0];
const d2 = ACKS.processConfinementsForTurn(seedCamp, { dryRun:true }).pendingRecords[0];
ok('escape preview is seeded byte-stable (dry-run twice → identical roll, no mutation)', d1.roll === d2.roll && seedCamp.confinements[0].status === 'held' && seedCamp.confinements[0].lastEscapeCheckTurn === null);

// Slavery rule → confinementType slave; freeing a slave manumits (socialTier → independent).
const slvCamp = freshCampaign({ houseRules: { slavery: { enabled: true } } });
let slvH = null; for(let s=0;s<800 && !slvH;s++){ const h = ACKS.generateHoard({ treasureType:'R', rng: mb(7000+s) }); ACKS.applySpecialTreasures(h, { rng: mb(7500+s) }); if(h.captives.length) slvH = h; }
ok('found a captive hoard (slavery)', !!slvH);
const slvRes = ACKS.materializeHoard(slvCamp, slvH, { hexId:'hex-slv' });
const slvConf = slvCamp.confinements[0];
ok('slavery rule ON → confinementType slave + captive socialTier slave', slvConf.confinementType === 'slave' && slvRes.captives[0].socialTier === 'slave');
ACKS.releaseConfinement(slvCamp, slvConf.id);
ok('freeing a slave manumits (socialTier slave → independent)', slvCamp.characters.find(c => c.id === slvConf.captiveCharacterId).socialTier === 'independent');

// No new HOUSE RULE from this lane (RAW core — the escape check is tooling, not a gated rule).
ok('NO confinement/captive/ransom house rule (RAW core; the lane adds none)', !ACKS.HOUSERULES_REGISTRY || !ACKS.HOUSERULES_REGISTRY.some(r => /confine|captiv|ransom/i.test(r.id)));

// =============================================================================
section('Summary');
console.log('  Passed: ' + pass);
console.log('  Failed: ' + fail);
if(fail === 0){
  console.log('\nAll Treasure Generation (#142) smoke checks passed.');
  process.exit(0);
} else {
  console.log('\nFAILURES:\n  - ' + failures.join('\n  - '));
  process.exit(1);
}
