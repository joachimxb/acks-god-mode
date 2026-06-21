/* Phase 4 Construction Wave E — Settlement buildings smoke.
 *
 * Run from "ACKS God Mode/" (or via `npm test`):  node tests/construction-e.smoke.js
 *
 * Covers (acks-engine-construction.js + the day-tick completion fix in acks-engine.js):
 *   0. EXPORTS — the Wave-E surface is present.
 *   1. CATALOG — 12 functional buildings; RAW-anchored costs (Public Bath 13,250 / Theater 16,000,
 *      RR p.133) + thresholds (guildhouse minCost 5,000 RR p.43; temple/tower-of-knowledge 15,000);
 *      the no-threshold buildings (emporium/inn/smithy/tradehouse/amphitheater/gladiator-school) have
 *      minCost 0; every entry carries a fn + fnLabel + page; amphitheater is market-class IV+.
 *   2. LOOKUPS — findSettlementBuilding / settlementBuildingLabel; unknown → null.
 *   3. settlementBuildingsAtHex — returns the settlement-building Constructibles at a hex; filters out
 *      other kinds + destroyed / being-demolished; empty hex → [].
 *   4. DAY-CLOCK COMPLETION (the payoff + the root-cause fix) — a settlement-building Project completes
 *      on the Day Clock and spawns a real Constructible (kind/subtype/hex/settlement), which the
 *      function-chip readout (settlementBuildingsAtHex) then finds. Also re-confirms the fix unblocks
 *      the Wave-C stronghold-component day-tick completion (the Constructible + stronghold growth).
 *
 * Authored 2026-06-21 (Wave Construction-E; CLAUDE §8).
 */
'use strict';
require('./_engine.js').load();
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail !== undefined ? '  -- ' + detail : '')); failed++; }
}

// ─────────────────────────────────────────────────────────────────────────────
// 0. Exports
// ─────────────────────────────────────────────────────────────────────────────
check('SETTLEMENT_BUILDING_CATALOG exported',  Array.isArray(ACKS.SETTLEMENT_BUILDING_CATALOG));
check('settlementBuildingCatalogList exported', typeof ACKS.settlementBuildingCatalogList === 'function');
check('findSettlementBuilding exported',        typeof ACKS.findSettlementBuilding === 'function');
check('settlementBuildingLabel exported',       typeof ACKS.settlementBuildingLabel === 'function');
check('settlementBuildingsAtHex exported',      typeof ACKS.settlementBuildingsAtHex === 'function');

// ─────────────────────────────────────────────────────────────────────────────
// 1. Catalog — RAW-anchored costs + thresholds
// ─────────────────────────────────────────────────────────────────────────────
const cat = ACKS.settlementBuildingCatalogList();
check('12 settlement buildings', cat.length === 12, cat.length);
check('every entry has key/label/cost/minCost/fn/fnLabel/page',
  cat.every(b => b.key && b.label && typeof b.cost === 'number' && typeof b.minCost === 'number' && b.fn && b.fnLabel && b.page));
check('Public Bath cost 13,250 (RR p.133)',   ACKS.findSettlementBuilding('public-bath').cost === 13250);
check('Public Theater cost 16,000 (RR p.133)', ACKS.findSettlementBuilding('public-theater').cost === 16000);
check('Mercenary Guildhouse minCost 5,000 (RR p.43)', ACKS.findSettlementBuilding('mercenary-guildhouse').minCost === 5000);
check('Merchant Guildhouse minCost 5,000',     ACKS.findSettlementBuilding('merchant-guildhouse').minCost === 5000);
check('Temple minCost 15,000',                 ACKS.findSettlementBuilding('temple').minCost === 15000);
check('Tower of Knowledge minCost 15,000',     ACKS.findSettlementBuilding('tower-of-knowledge').minCost === 15000);
// The no-RAW-threshold buildings are freely GM-set (minCost 0).
['emporium','inn','smithy','tradehouse','amphitheater','gladiator-school'].forEach(k =>
  check('  ' + k + ' minCost 0 (GM-set)', ACKS.findSettlementBuilding(k).minCost === 0));
check('Amphitheater is market-class IV+ (AXIOMS 4)', ACKS.findSettlementBuilding('amphitheater').marketClassMin === 4);
check('Temple fn = religion + enables Religion',
  ACKS.findSettlementBuilding('temple').fn === 'religion' && /Religion/.test(ACKS.findSettlementBuilding('temple').enables || ''));
check('Merchant Guildhouse fn = banking + enables Banking',
  ACKS.findSettlementBuilding('merchant-guildhouse').fn === 'banking' && /Banking/.test(ACKS.findSettlementBuilding('merchant-guildhouse').enables || ''));

// ─────────────────────────────────────────────────────────────────────────────
// 2. Lookups
// ─────────────────────────────────────────────────────────────────────────────
check("findSettlementBuilding('temple') resolves", ACKS.findSettlementBuilding('temple').label === 'Temple');
check('findSettlementBuilding(unknown) → null',     ACKS.findSettlementBuilding('not-a-building') === null);
check("settlementBuildingLabel('emporium')",        ACKS.settlementBuildingLabel('emporium') === 'Emporium / Agora');
check('settlementBuildingLabel(unknown) → the key', ACKS.settlementBuildingLabel('zzz') === 'zzz');

// ─────────────────────────────────────────────────────────────────────────────
// 3. settlementBuildingsAtHex — filtering
// ─────────────────────────────────────────────────────────────────────────────
{
  const camp = ACKS.blankCampaign();
  camp.constructibles.push(ACKS.blankConstructible({ id:'c1', constructibleKind:'settlement-building', constructibleSubtype:'temple', name:'Temple', hexId:'h1' }));
  camp.constructibles.push(ACKS.blankConstructible({ id:'c2', constructibleKind:'settlement-building', constructibleSubtype:'inn', name:'Inn', hexId:'h1', damageState:'destroyed' }));
  camp.constructibles.push(ACKS.blankConstructible({ id:'c3', constructibleKind:'stronghold-component', name:'Keep', hexId:'h1' }));     // wrong kind
  camp.constructibles.push(ACKS.blankConstructible({ id:'c4', constructibleKind:'settlement-building', constructibleSubtype:'smithy', name:'Smithy', hexId:'h2' })); // other hex
  const at = ACKS.settlementBuildingsAtHex(camp, 'h1');
  check('settlementBuildingsAtHex(h1) returns only the live settlement-building', at.length === 1 && at[0].id === 'c1');
  check('  destroyed building filtered out', !at.some(c => c.id === 'c2'));
  check('  other kind filtered out',         !at.some(c => c.id === 'c3'));
  check('  other hex filtered out',          !at.some(c => c.id === 'c4'));
  check('settlementBuildingsAtHex(empty hex) → []', ACKS.settlementBuildingsAtHex(camp, 'nope').length === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Day-Clock completion (the payoff + the root-cause fix)
// ─────────────────────────────────────────────────────────────────────────────
function rig(kind, subtype, spec){
  const camp = ACKS.blankCampaign();
  camp.currentTurn = 1; camp.currentDayInMonth = 1;
  camp.houseRules = { 'abstract-construction': { enabled: true } };  // skip the supervisor cap so it finishes
  const dom = ACKS.blankDomain({ id:'dom-x', name:'D' }); camp.domains.push(dom); dom.stronghold = { components: [] };
  camp.hexes.push(ACKS.blankHex({ id:'hex-x', domainId:'dom-x' }));
  camp.settlements.push(ACKS.blankSettlement({ id:'set-x', name:'Town', hexId:'hex-x', families:500 }));
  const opts = { constructibleKind:kind, constructibleSubtype:subtype, name:'X', siteHexId:'hex-x', siteSettlementId:'set-x', ownerDomainId:'dom-x', totalCost:15000, workerCounts:{ laborer:100000 } };
  if(spec) opts.completionSpec = spec;
  ACKS.startConstructionProject(camp, opts);
  ACKS.runDayTickToMonthEnd(camp);
  return { camp, dom };
}
{
  const { camp } = rig('settlement-building', 'temple');
  const cst = (camp.constructibles || [])[0];
  check('settlement-building completes on the Day Clock → 1 Constructible', (camp.constructibles || []).length === 1);
  check('  Constructible kind = settlement-building',   cst && cst.constructibleKind === 'settlement-building');
  check('  Constructible subtype = temple',             cst && cst.constructibleSubtype === 'temple');
  check('  Constructible hexId carried',                cst && cst.hexId === 'hex-x');
  check('  Constructible settlementId carried',         cst && cst.settlementId === 'set-x');
  check('  settlementBuildingsAtHex finds it (the chip readout)', ACKS.settlementBuildingsAtHex(camp, 'hex-x').length === 1);
}
{
  // The same fix unblocks the Wave-C stronghold-component completion on the Day Clock.
  const { camp, dom } = rig('stronghold-component', 'keep-stone', { componentType:'Keep', structures:[{ structureKey:'keep-stone', quantity:1 }] });
  check('stronghold-component completes on the Day Clock → 1 Constructible', (camp.constructibles || []).length === 1);
  check('  stronghold value grew to 15,000',  ACKS.strongholdValue(camp, dom) === 15000, ACKS.strongholdValue(camp, dom));
  check('  a real stronghold component added', (dom.stronghold.components || []).length === 1);
}

console.log((failed === 0 ? 'PASS' : 'FAIL') + ' construction-e.smoke — ' + passed + ' passed, ' + failed + ' failed');
if(failed > 0) process.exit(1);
