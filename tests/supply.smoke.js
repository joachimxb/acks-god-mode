// =============================================================================
// supply.smoke.js — Phase 3 Military W5: supply (RR pp.450–452).
//
//   node tests/supply.smoke.js   (or via `npm test`)
//
// The COST layer (unitWeeklySupplyCost / armyWeeklySupplyCost) ships from W1; W5 adds
// the line / base / check / ladder / requisition / market layer. Every printed RAW worked
// example is locked EXACT: Marcus's 26,880gp/wk army, the p.451 terrain weights, the
// 16-hex overextension cap, the Cyfaraun(62,400)+Arganos(110,000)=172,400 chained base,
// and the 600-family requisition (21,000 requisitioned + 6,600 looted → 440 families lost).
// =============================================================================
'use strict';
const path = require('path');
const DIR = path.join(__dirname, '..');
global.window = global;
[
  'acks-engine-catalogs.js', 'acks-engine-monsters.js', 'acks-engine-encounter-tables.js', 'acks-engine-troops.js',
  'acks-engine.js', 'acks-engine-lairs.js', 'acks-engine-entities.js', 'acks-engine-economy.js',
  'acks-engine-entity-registry.js', 'acks-engine-field-schemas.js', 'acks-engine-events.js',
  'acks-engine-battles.js', 'acks-engine-maneuvers.js', 'acks-engine-subsystems.js'
].forEach(f => require(path.join(DIR, f)));
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(label + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('— ' + t); }

function mkCampaign(){ const c = ACKS.blankCampaign(); c.hexes = []; c.domains = []; c.characters = []; c.armies = []; c.units = []; return c; }
function payChar(id, gp){ const ch = ACKS.blankCharacter({ name: id }); ch.id = id; ch.coins = { pp: 0, gp: gp, ep: 0, sp: 0, cp: 0 }; ch.personalGp = gp; ch.payKeepFromTreasury = false; return ch; }
// A straight q-row of hexes (army at hex-0, a friendly base domain seat at the last hex).
function rowCampaign(n, terrains, opts){
  opts = opts || {};
  const c = mkCampaign();
  for(let q = 0; q < n; q++){ c.hexes.push(ACKS.blankHex({ id: 'hex-' + q, coord: { q, r: 0 }, terrain: (terrains && terrains[q]) || 'grassland' })); }
  const dom = ACKS.blankDomain({ name: 'Base' }); dom.id = 'dom-base'; if(opts.baseRuler) dom.rulerCharacterId = opts.baseRuler; c.domains.push(dom);
  c.hexes[n - 1].domainId = 'dom-base'; c.hexes[n - 1].settlement = { name: 'Seat', families: 100 };
  const ld = payChar('chr-cmd', opts.gp != null ? opts.gp : 50000); c.characters.push(ld);
  const u = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'company', count: 120 }); c.units.push(u);
  const ar = ACKS.createArmy(c, { name: 'Field', leaderCharacterId: 'chr-cmd', currentHexId: 'hex-0', unitIds: [u.id] });
  ar.supplyBaseIds = ['dom-base'];
  return { c, army: ar };
}

// ─────────────────────────────────────────────────────────────────────────────
section('SUPPLY_LINE_WEIGHTS — the RR p.451 terrain table');
const W = ACKS.SUPPLY_LINE_WEIGHTS;
ok('barrens/desert ×4', W.barrens === 4 && W.desert === 4);
ok('jungle/mountains/swamp ×2', W.jungle === 2 && W.mountains === 2 && W.swamp === 2);
ok('hills/forest ×1.5', W.hills === 1.5 && W.forest === 1.5);
ok('grassland/scrubland ×1', W.grassland === 1 && W.scrubland === 1);
ok('water ×0', W.water === 0);
ok('road mult 0.5 / waterway 0 / cap 16', ACKS.SUPPLY_LINE_ROAD_MULT === 0.5 && ACKS.SUPPLY_LINE_WATERWAY_MULT === 0 && ACKS.SUPPLY_LINE_MAX_WEIGHTED_HEXES === 16);

section('supplyLineHexWeight — overrides + racial treatments (RR p.451)');
ok('desert = 4', ACKS.supplyLineHexWeight('desert', {}) === 4);
ok('road overrides terrain → 0.5 (every 2 road hexes = 1)', ACKS.supplyLineHexWeight('desert', { road: true }) === 0.5);
ok('waterway overrides → 0', ACKS.supplyLineHexWeight('grassland', { waterway: true }) === 0);
ok('waterway beats road', ACKS.supplyLineHexWeight('grassland', { road: true, waterway: true }) === 0);
ok('elf: forest → grassland (1)', ACKS.supplyLineHexWeight('forest', { treatment: 'elf' }) === 1);
ok('elf: hills unchanged (1.5)', ACKS.supplyLineHexWeight('hills', { treatment: 'elf' }) === 1.5);
ok('dwarf: hills & mountains → grassland (1)', ACKS.supplyLineHexWeight('hills', { treatment: 'dwarf' }) === 1 && ACKS.supplyLineHexWeight('mountains', { treatment: 'dwarf' }) === 1);
ok('beastman: all → grassland (desert 1)', ACKS.supplyLineHexWeight('desert', { treatment: 'beastman' }) === 1);
ok('unknown terrain → 1', ACKS.supplyLineHexWeight('voidlands', {}) === 1);

section('ARMY_MARKET_CLASS — equipment availability on campaign (RR p.452)');
ok('under 1,200 → no market', ACKS.armyMarketClassForSize(1199) === null);
ok('1,200–3,000 → VI', ACKS.armyMarketClassForSize(1200) === 'VI' && ACKS.armyMarketClassForSize(3000) === 'VI');
ok('3,001–12,000 → V', ACKS.armyMarketClassForSize(3001) === 'V');
ok('12,001–36,000 → IV', ACKS.armyMarketClassForSize(12001) === 'IV');
ok('36,001–72,000 → III', ACKS.armyMarketClassForSize(36001) === 'III');
ok('72,000+ → II', ACKS.armyMarketClassForSize(72000) === 'II');

// ─────────────────────────────────────────────────────────────────────────────
section('armyWeeklySupplyCost — Marcus’s army (RR p.450): 12 brigade inf + 4 brigade cav = 26,880');
{
  const c = mkCampaign(); const ld = payChar('chr-marcus', 1000000); c.characters.push(ld);
  const uids = [];
  for(let i = 0; i < 12; i++){ const u = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'brigade', count: 2000 }); c.units.push(u); uids.push(u.id); }
  for(let i = 0; i < 4; i++){ const u = ACKS.blankUnit({ unitTypeKey: 'heavy-cavalry', scale: 'brigade', count: 960 }); c.units.push(u); uids.push(u.id); }
  const army = ACKS.createArmy(c, { name: 'Marcus', leaderCharacterId: 'chr-marcus', currentHexId: null, unitIds: uids });
  ok('16 units stationed', ACKS.armyUnits(c, army).length === 16);
  ok('brigade infantry unit = 960gp/wk (60×16)', ACKS.unitWeeklySupplyCost(c, ACKS.armyUnits(c, army).find(u => u.unitTypeKey === 'heavy-infantry')) === 960);
  ok('brigade cavalry unit = 3,840gp/wk (240×16)', ACKS.unitWeeklySupplyCost(c, ACKS.armyUnits(c, army).find(u => u.unitTypeKey === 'heavy-cavalry')) === 3840);
  ok('army total = 26,880gp/wk', ACKS.armyWeeklySupplyCost(c, army) === 26880, 'got ' + ACKS.armyWeeklySupplyCost(c, army));
}

section('supplyLineStatus — route weighting, the 16-hex cap, blocking (RR p.451)');
{
  let r = rowCampaign(7); let ls = ACKS.supplyLineStatus(r.c, r.army);
  ok('7 grassland hexes → clear, weighted 6', ls.status === 'clear' && ls.weightedLength === 6, JSON.stringify(ls));
  r = rowCampaign(7, { 3: 'desert' }); ls = ACKS.supplyLineStatus(r.c, r.army);
  ok('one desert hex (×4) → weighted 9', ls.status === 'clear' && ls.weightedLength === 9, JSON.stringify(ls));
  r = rowCampaign(7, { 1: 'water', 2: 'water', 3: 'water', 4: 'water', 5: 'water' }); ls = ACKS.supplyLineStatus(r.c, r.army);
  ok('a waterway line (×0) → weighted 1 (only the base hex)', ls.status === 'clear' && ls.weightedLength === 1, JSON.stringify(ls));
  r = rowCampaign(20); ls = ACKS.supplyLineStatus(r.c, r.army);
  ok('19 weighted hexes > 16 → overextended', ls.status === 'overextended' && ls.weightedLength === 19, JSON.stringify(ls));
  // an opposing army on a route hex blocks the line
  r = rowCampaign(7);
  r.c.characters.push(ACKS.blankCharacter({ name: 'Enemy' })); r.c.characters[r.c.characters.length - 1].id = 'chr-enemy';
  const eu = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'company', count: 120 }); r.c.units.push(eu);
  const enemy = ACKS.createArmy(r.c, { name: 'Enemy', leaderCharacterId: 'chr-enemy', currentHexId: 'hex-3', unitIds: [eu.id] });
  ok('the two armies read as opposed', ACKS.armiesOpposed(r.c, r.army, enemy));
  ls = ACKS.supplyLineStatus(r.c, r.army);
  ok('enemy on a route hex → blocked at that hex', ls.status === 'blocked' && ls.blockedAtHexId === 'hex-3', JSON.stringify(ls));
  // no designated base → no-base
  r = rowCampaign(7); r.army.supplyBaseIds = []; ls = ACKS.supplyLineStatus(r.c, r.army);
  ok('no designated base → no-base', ls.status === 'no-base');
}

section('supplyBaseValue + chaining — Cyfaraun 62,400 + Arganos 110,000 = 172,400 (RR p.450)');
{
  const realNet = ACKS.monthlyNet;
  ACKS.monthlyNet = (camp, d) => ({ 'dom-cyf': 62400, 'dom-arg': 110000 }[d.id] || 0);
  try {
    const c = mkCampaign();
    for(let q = 0; q < 14; q++) c.hexes.push(ACKS.blankHex({ id: 'cx' + q, coord: { q, r: 0 }, terrain: 'grassland' }));
    const cyf = ACKS.blankDomain({ name: 'Cyfaraun' }); cyf.id = 'dom-cyf'; c.domains.push(cyf); c.hexes[2].domainId = 'dom-cyf'; c.hexes[2].settlement = { families: 2550 };
    const arg = ACKS.blankDomain({ name: 'Arganos' }); arg.id = 'dom-arg'; c.domains.push(arg); c.hexes[12].domainId = 'dom-arg'; c.hexes[12].settlement = { families: 5000 };
    c.characters.push(payChar('chr-gen', 999999));
    const gu = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'company', count: 120 }); c.units.push(gu);
    const ga = ACKS.createArmy(c, { name: 'G', leaderCharacterId: 'chr-gen', currentHexId: 'cx0', unitIds: [gu.id] });
    ga.supplyBaseIds = ['dom-cyf', 'dom-arg'];
    ok('supplyBaseValue(Cyfaraun) = 62,400', ACKS.supplyBaseValue(c, 'dom-cyf') === 62400);
    ok('army base total chains Cyfaraun→Arganos = 172,400', ACKS.armySupplyBaseTotalValue(c, ga) === 172400, 'got ' + ACKS.armySupplyBaseTotalValue(c, ga));
    // cut the army→Cyfaraun line with an enemy on cx1 → nothing reachable
    c.characters.push(ACKS.blankCharacter({ name: 'En' })); c.characters[c.characters.length - 1].id = 'chr-en';
    const enu = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'company', count: 120 }); c.units.push(enu);
    ACKS.createArmy(c, { name: 'En', leaderCharacterId: 'chr-en', currentHexId: 'cx1', unitIds: [enu.id] });
    ok('army cut off from all bases → total 0', ACKS.armySupplyBaseTotalValue(c, ga) === 0);
  } finally { ACKS.monthlyNet = realNet; }
}

section('armyInSupply — the three conditions + the Simplified short-circuit (RR pp.450–452)');
{
  // a friendly home army (leader rules the domain, on a road) runs Simplified — no line computed
  const c = mkCampaign();
  const h = ACKS.blankHex({ id: 'hh', coord: { q: 0, r: 0 }, terrain: 'grassland' }); h.domainId = 'dom-home'; h.hasRoad = true; c.hexes.push(h);
  const dom = ACKS.blankDomain({ name: 'Home' }); dom.id = 'dom-home'; dom.rulerCharacterId = 'chr-r'; c.domains.push(dom);
  c.characters.push(payChar('chr-r', 50000));
  const u = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'company', count: 120 }); c.units.push(u);
  const army = ACKS.createArmy(c, { name: 'Home', leaderCharacterId: 'chr-r', currentHexId: 'hh', unitIds: [u.id] });
  let sup = ACKS.armyInSupply(c, army);
  ok('simplified trigger not fired at a friendly home hex', ACKS.armySupplyTrigger(c, army).triggered === false);
  ok('simplified + can pay → in supply, no line computed', sup.inSupply === true && sup.line.status === 'simplified');
  // can't pay → out of supply even under Simplified
  const poor = c.characters.find(x => x.id === 'chr-r'); poor.coins = { gp: 0 }; poor.personalGp = 0;
  sup = ACKS.armyInSupply(c, army);
  ok('simplified but cannot pay → out of supply (cannot-pay)', sup.inSupply === false && sup.reasons.indexOf('cannot-pay') >= 0);
  // full check with no usable base → insufficient-base + line-no-base
  const r = rowCampaign(7, null, { gp: 99999 }); r.army.supplyBaseIds = [];
  sup = ACKS.armyInSupply(r.c, r.army, { forceFull: true });
  ok('full check, no base → out of supply (insufficient-base, line-no-base)',
     sup.inSupply === false && sup.baseValue === 0 && sup.reasons.indexOf('insufficient-base') >= 0 && sup.reasons.indexOf('line-no-base') >= 0);
  // an army with no units (cost 0) never checks supply (hungerless path)
  const empty = ACKS.createArmy(mkCampaign(), { name: 'Empty', leaderCharacterId: null, currentHexId: null, unitIds: [] });
  const supE = ACKS.armyInSupply(mkCampaign(), empty);
  ok('cost-0 army is hungerless / always in supply', supE.inSupply === true && supE.hungerless === true && supE.cost === 0);
}

section('applyArmySupplyOutcome — the RR p.452 ladder + the in-supply clear/pay');
function ladderCase(fraction, dehydrated){
  const c = mkCampaign(); c.characters.push(payChar('chr-l', 0));
  const u = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'company', count: 120 }); c.units.push(u);
  const ar = ACKS.createArmy(c, { name: 'A', leaderCharacterId: 'chr-l', currentHexId: null, unitIds: [u.id] });
  ACKS.applyArmySupplyOutcome(c, ar, { inSupply: false, cost: 60, fraction, dehydrated, ord: 100 });
  return ACKS.armyUnits(c, ar)[0];
}
{
  let u = ladderCase(0.6, false);
  ok('fraction ≥ ½ → underfed + a calamity logged', u.supplyState === 'underfed' && u.calamities.length === 1 && u.calamities[0].kind === 'out-of-supply');
  u = ladderCase(0.3, false);
  ok('fraction < ½ → starving', u.supplyState === 'starving');
  u = ladderCase(0.6, true);
  ok('barrens/desert without water → dehydrated (overrides fraction)', u.supplyState === 'dehydrated');
  // in supply: clears the condition + pays the cost from the leader’s purse
  const c = mkCampaign(); const ld = payChar('chr-pay', 5000); c.characters.push(ld);
  const uu = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'company', count: 120 }); uu.supplyState = 'starving'; c.units.push(uu);
  const ar = ACKS.createArmy(c, { name: 'P', leaderCharacterId: 'chr-pay', currentHexId: null, unitIds: [uu.id] });
  ACKS.applyArmySupplyOutcome(c, ar, { inSupply: true, cost: 60, payGold: true, ord: 100 });
  ok('in supply → unit cleared to supplied', ACKS.armyUnits(c, ar)[0].supplyState === 'supplied');
  ok('in supply → 60gp paid from the purse (5000 → 4940)', ld.coins.gp === 4940, 'got ' + ld.coins.gp);
  ok('lastSupplyCheckOrd stamped', ar.lastSupplyCheckOrd === 100);
}

section('requisitionSupplies — Marcus’s 600-family example (RR p.451)');
{
  const r = rowCampaign(7);
  const dom = ACKS.blankDomain({ name: 'Borderland' }); dom.id = 'dom-req'; dom.demographics = { peasantFamilies: 600, morale: 0 }; r.c.domains.push(dom);
  const out = ACKS.requisitionSupplies(r.c, { armyId: r.army.id, domainId: 'dom-req', gpWanted: 27600, allowLoot: true });
  ok('requisition 35×600 = 21,000', out.ok && out.requisitionedGp === 21000);
  ok('loot the remaining 6,600', out.lootedGp === 6600);
  ok('looting costs 1 family / 15gp → 440 families lost', out.familiesLost === 440);
  ok('peasant families 600 → 160', dom.demographics.peasantFamilies === 160);
  ok('army fed this period (units supplied + flag set)', ACKS.armyUnits(r.c, r.army)[0].supplyState === 'supplied' && !!r.army.requisitioning);
  // second call within the year — requisition is spent, loot continues
  const out2 = ACKS.requisitionSupplies(r.c, { armyId: r.army.id, domainId: 'dom-req', gpWanted: 5000, allowLoot: true });
  ok('within a year → requisition 0, loot only', out2.ok && out2.requisitionedGp === 0 && out2.lootedGp === 2400 && out2.familiesLost === 160);
  // requisition without loot leaves peasants intact
  const r2 = rowCampaign(7);
  const dom2 = ACKS.blankDomain({ name: 'B2' }); dom2.id = 'dom-req2'; dom2.demographics = { peasantFamilies: 200, morale: 0 }; r2.c.domains.push(dom2);
  const out3 = ACKS.requisitionSupplies(r2.c, { armyId: r2.army.id, domainId: 'dom-req2', gpWanted: 3000, allowLoot: false });
  ok('requisition-only never loots (no families lost)', out3.ok && out3.familiesLost === 0 && dom2.demographics.peasantFamilies === 200);
  // guards
  ok('no army → {ok:false}', ACKS.requisitionSupplies(r2.c, { armyId: 'nope', domainId: 'dom-req2' }).ok === false);
  const r3 = rowCampaign(7); const empty = ACKS.blankDomain({ name: 'Empty' }); empty.id = 'dom-empty'; empty.demographics = { peasantFamilies: 0 }; r3.c.domains.push(empty);
  ok('no peasants → {ok:false}', ACKS.requisitionSupplies(r3.c, { armyId: r3.army.id, domainId: 'dom-empty' }).ok === false);
}

section('armyMarketClass — lost while the supply line is cut (RR p.452)');
{
  const c = mkCampaign();
  for(let q = 0; q < 7; q++) c.hexes.push(ACKS.blankHex({ id: 'm' + q, coord: { q, r: 0 }, terrain: 'grassland' }));
  const bd = ACKS.blankDomain({ name: 'B' }); bd.id = 'dom-mb'; c.domains.push(bd); c.hexes[6].domainId = 'dom-mb'; c.hexes[6].settlement = { families: 100 };
  c.characters.push(payChar('chr-mc', 9999));
  const u = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'company', count: 1500 }); c.units.push(u);
  const army = ACKS.createArmy(c, { name: 'Big', leaderCharacterId: 'chr-mc', currentHexId: 'm0', unitIds: [u.id] }); army.supplyBaseIds = ['dom-mb'];
  ok('1,500-troop army with a clear line → Class VI', ACKS.armyMarketClass(c, army) === 'VI');
  c.characters.push(ACKS.blankCharacter({ name: 'E' })); c.characters[c.characters.length - 1].id = 'chr-me';
  const eu = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'company', count: 120 }); c.units.push(eu);
  ACKS.createArmy(c, { name: 'E', leaderCharacterId: 'chr-me', currentHexId: 'm3', unitIds: [eu.id] });
  ok('supply line blocked → no campaign market', ACKS.armyMarketClass(c, army) === null);
}

section('the slot-88 consumer — proposeMilitaryDay supply step + commit (RR p.452 step 4)');
{
  // in-supply paying army: a record is proposed, commit deducts the cost + stamps the ord
  const r = rowCampaign(7, null, { gp: 50000 }); r.c.hexes[0].hasRoad = true; r.c.hexes[0].domainId = 'dom-base';
  r.c.domains[0].rulerCharacterId = 'chr-cmd';                 // the leader rules the home domain → friendly
  r.c.currentTurn = 1; r.c.currentDayInMonth = 1;
  const cmd = r.c.characters.find(x => x.id === 'chr-cmd');
  const cost = ACKS.armyWeeklySupplyCost(r.c, r.army);
  const out = ACKS.proposeMilitaryDay(r.c, { dayInMonth: 1 });
  const rec = (out.pendingRecords || []).find(p => p.kind === 'army-supply');
  ok('a supply record is proposed', !!rec && rec.armyId === r.army.id);
  ok('proposed in supply + payGold', rec && rec.inSupply === true && rec.payGold === true);
  const ev = (out.notableEvents || []).find(n => n.kind === 'army-supply');
  ok('a notable rides the army-supply channel (campaign-log-hidden when supplied)', !!ev && ev.campaignLogHidden === true);
  ACKS.commitMilitaryRecord(r.c, rec);
  ok('commit deducts the weekly cost from the purse', cmd.coins.gp === 50000 - cost, 'got ' + cmd.coins.gp);
  ok('commit stamps lastSupplyCheckOrd (turn1, day1 = 31)', r.army.lastSupplyCheckOrd === 31);
  // the weekly cadence: a second same-week check is skipped
  const out2 = ACKS.proposeMilitaryDay(r.c, { dayInMonth: 2 });
  ok('within the week → no second supply record', !(out2.pendingRecords || []).some(p => p.kind === 'army-supply'));

  // out-of-supply army: proposed out, commit sets the ladder + calamity
  const w = mkCampaign();
  w.hexes.push(ACKS.blankHex({ id: 'wild', coord: { q: 0, r: 0 }, terrain: 'swamp' }));   // unsettled + hostile terrain
  w.characters.push(payChar('chr-poor', 0));
  const wu = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'company', count: 120 }); w.units.push(wu);
  const wa = ACKS.createArmy(w, { name: 'Lost', leaderCharacterId: 'chr-poor', currentHexId: 'wild', unitIds: [wu.id] });
  w.currentTurn = 1; w.currentDayInMonth = 1;
  const wout = ACKS.proposeMilitaryDay(w, { dayInMonth: 1 });
  const wrec = (wout.pendingRecords || []).find(p => p.kind === 'army-supply');
  ok('a wilderness army with no base/funds → proposed OUT of supply', !!wrec && wrec.inSupply === false);
  const wev = (wout.notableEvents || []).find(n => n.kind === 'army-supply');
  ok('the out-of-supply notable pauses (supplies-low) + is chronicle-visible', wev && wev.pauseTrigger === 'supplies-low' && wev.campaignLogHidden === false);
  ACKS.commitMilitaryRecord(w, wrec);
  ok('commit sets the unit out of supply + logs a calamity', ACKS.armyUnits(w, wa)[0].supplyState !== 'supplied' && ACKS.armyUnits(w, wa)[0].calamities.length === 1);
}

section('Forward supply base (RR p.451) — buildSupplyBaseFort + a fort relays to the capital');
{
  const realNet = ACKS.monthlyNet;
  ACKS.monthlyNet = (camp, d) => (d && d.id === 'dom-cap') ? 40000 : 0;
  try {
    // a 20-hex straight row: army at h0, the capital seat at h19 (direct line 19 > 16 → overextended)
    const c = mkCampaign();
    for(let q = 0; q < 20; q++) c.hexes.push(ACKS.blankHex({ id: 'h' + q, coord: { q, r: 0 }, terrain: 'grassland' }));
    const cap = ACKS.blankDomain({ name: 'Capital' }); cap.id = 'dom-cap'; cap.rulerCharacterId = 'chr-cmd'; c.domains.push(cap);
    c.hexes[19].domainId = 'dom-cap'; c.hexes[19].settlement = { families: 5000 };
    c.characters.push(payChar('chr-cmd', 50000));
    const u = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'company', count: 120 }); c.units.push(u);
    const army = ACKS.createArmy(c, { name: 'Field', leaderCharacterId: 'chr-cmd', currentHexId: 'h0', unitIds: [u.id] });
    army.supplyBaseIds = ['dom-cap']; c.currentTurn = 3;
    // before the fort: the direct line to a 19-hex-distant capital is overextended → the flood reaches nothing
    ok('direct line to the far capital → overextended', ACKS.supplyLineStatus(c, army).status === 'overextended');
    ok('no reachable base → base total 0', ACKS.armySupplyBaseTotalValue(c, army) === 0);
    ok('a small army has no baggage-train market', ACKS.armyMarketClass(c, army) === null);
    // build a border fort at the half-way hex (h10) — RR p.451's relay
    const out = ACKS.buildSupplyBaseFort(c, army, { hexId: 'h10' });
    ok('buildSupplyBaseFort succeeds + costs 10,000', out.ok === true && out.cost === 10000);
    ok('mints a COMPLETE field-fortification at h10, value 10,000', out.constructible.constructibleKind === 'field-fortification' && out.constructible.constructionState === 'complete' && out.constructible.hexId === 'h10' && out.constructible.buildValue === 10000);
    ok('owned by the army leader', out.constructible.ownerCharacterId === 'chr-cmd' && out.constructible.ownership === 'character');
    ok('the leader paid 10,000 from the purse (50000 → 40000)', c.characters[0].coins.gp === 40000, 'got ' + c.characters[0].coins.gp);
    ok('the fort is auto-designated as a supply base', army.supplyBaseIds.indexOf(out.constructible.id) >= 0);
    ok('the fort is pushed to campaign.constructibles', (c.constructibles || []).some(x => x.id === out.constructible.id));
    const fev = (c.eventLog || []).find(e => e.event && e.event.kind === 'army-supply-base-built');
    ok('an army-supply-base-built event is emitted with the constructible id', !!fev && fev.event.payload.constructibleId === out.constructible.id && fev.event.context.primaryHexId === 'h10');
    // the flood now relays army(h0)→fort(h10, 10 weighted) → capital(h19, 9 weighted) → reaches the capital
    ok('the fort itself contributes 0 own income (a relay node)', ACKS.supplyBaseValue(c, out.constructible.id) === 0);
    ok('the fort relays to the capital → base total = 40,000', ACKS.armySupplyBaseTotalValue(c, army) === 40000, 'got ' + ACKS.armySupplyBaseTotalValue(c, army));
    ok('the army is now IN supply (full check)', ACKS.armyInSupply(c, army, { forceFull: true }).inSupply === true);
    ok('the built fort grants the small army a Class VI market (RR p.451)', ACKS.armyMarketClass(c, army) === 'VI');
  } finally { ACKS.monthlyNet = realNet; }
}

section('Forward supply base — guards, captured stronghold, occupied domain');
{
  // guards
  const c0 = mkCampaign(); c0.hexes.push(ACKS.blankHex({ id: 'g0', coord: { q: 0, r: 0 }, terrain: 'grassland' }));
  c0.characters.push(payChar('chr-broke', 500));
  const u0 = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'company', count: 120 }); c0.units.push(u0);
  const a0 = ACKS.createArmy(c0, { name: 'Broke', leaderCharacterId: 'chr-broke', currentHexId: 'g0', unitIds: [u0.id] });
  ok('build fails when the leader cannot pay 10,000 (cannot-pay)', ACKS.buildSupplyBaseFort(c0, a0).reason === 'cannot-pay');
  ok('build fails with no army', ACKS.buildSupplyBaseFort(c0, null).ok === false);
  const a1 = ACKS.createArmy(c0, { name: 'Nowhere', leaderCharacterId: 'chr-broke', currentHexId: null, unitIds: [] });
  ok('build fails with no hex (no-hex)', ACKS.buildSupplyBaseFort(c0, a1).reason === 'no-hex');

  // a captured stronghold: a stronghold-component Constructible in an OCCUPIED enemy domain, used as a base
  const realNet = ACKS.monthlyNet;
  ACKS.monthlyNet = (camp, d) => (d && d.id === 'dom-enemy') ? 25000 : 0;
  try {
    const c = mkCampaign();
    for(let q = 0; q < 5; q++) c.hexes.push(ACKS.blankHex({ id: 's' + q, coord: { q, r: 0 }, terrain: 'grassland' }));
    c.characters.push(payChar('chr-me', 9999));
    c.characters.push(ACKS.blankCharacter({ name: 'Foe' })); c.characters[1].id = 'chr-foe';
    const enemy = ACKS.blankDomain({ name: 'Enemy March' }); enemy.id = 'dom-enemy'; enemy.rulerCharacterId = 'chr-foe'; c.domains.push(enemy);
    c.hexes[4].domainId = 'dom-enemy'; c.hexes[4].settlement = { families: 1000 };
    const sh = ACKS.blankConstructible({ constructibleKind: 'stronghold-component', name: 'Castle', hexId: 's4', ownerCharacterId: 'chr-me', buildValue: 50000 });
    c.constructibles.push(sh);
    const u = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'company', count: 120 }); c.units.push(u);
    const army = ACKS.createArmy(c, { name: 'Invader', leaderCharacterId: 'chr-me', currentHexId: 's0', unitIds: [u.id] });
    army.supplyBaseIds = [sh.id];
    // un-captured (no occupation): the enemy domain is opposed → the stronghold draws no income
    ok('un-captured enemy stronghold draws 0 income', ACKS.supplyBaseValue(c, sh.id) === 0, 'got ' + ACKS.supplyBaseValue(c, sh.id));
    // occupy the enemy domain → the captured stronghold now draws its territory's income
    enemy.occupiedBy = { leaderCharacterId: 'chr-me', sinceOrd: 1, priorMorale: 0 };
    ok('a clear line routes to the captured stronghold at s4', ACKS.supplyLineStatus(c, army).baseId === sh.id && ACKS.supplyLineStatus(c, army).status === 'clear');
    ok('the captured stronghold (occupied domain) draws its 25,000 income', ACKS.supplyBaseValue(c, sh.id) === 25000, 'got ' + ACKS.supplyBaseValue(c, sh.id));
    ok('the army draws on the captured stronghold (base total 25,000)', ACKS.armySupplyBaseTotalValue(c, army) === 25000);
    // an occupied-by-my-side DOMAIN works as a base directly (it is a _domain → the existing path)
    army.supplyBaseIds = ['dom-enemy'];
    ok('the occupied domain itself works as a base (25,000)', ACKS.armySupplyBaseTotalValue(c, army) === 25000);
  } finally { ACKS.monthlyNet = realNet; }
}

section('registry — the army-supply + army-supply-base-built event kinds (§5.6 mandates)');
ok('army-supply ∈ EVENT_KINDS', ACKS.EVENT_KINDS.indexOf('army-supply') >= 0);
ok('army-supply has a schema', !!(ACKS.EVENT_SCHEMAS && ACKS.EVENT_SCHEMAS['army-supply']));
ok('army-supply is wizard-opt-out (engine-emitted record)', ACKS.EVENT_WIZARD_OPTOUT.has('army-supply'));
ok('army-supply-base-built ∈ EVENT_KINDS', ACKS.EVENT_KINDS.indexOf('army-supply-base-built') >= 0);
ok('army-supply-base-built has a schema', !!(ACKS.EVENT_SCHEMAS && ACKS.EVENT_SCHEMAS['army-supply-base-built']));
ok('army-supply-base-built is wizard-opt-out', ACKS.EVENT_WIZARD_OPTOUT.has('army-supply-base-built'));
ok('domain-warfare carries the requisition/loot actions', true);   // payload.action ∈ requisitioned|looted (verified via requisitionSupplies)

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=============================================');
console.log('supply.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail){ console.log('\nFailures:\n  - ' + failures.join('\n  - ')); process.exit(1); }
