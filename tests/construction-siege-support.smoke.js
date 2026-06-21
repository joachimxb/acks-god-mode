/* Phase 4 Construction — Siege-support constructions ENGINE smoke (burst14, 2026-06-21).
 *
 * Run from "ACKS God Mode/" (or via `npm test`):  node tests/construction-siege-support.smoke.js
 *
 * Covers the circumvallation-rings (RR p.474) + war-machine field-assembly (RR p.449) + siege-hijinks
 * (RR pp.474–475) layer — buildable kind:'siege-construction' Projects raised via the Construction
 * Wizard machinery that, on completion, feed a target siege (acks-engine-construction.js +
 * acks-engine-sieges.js). The circumvallation MATH (circumvallationFeetToEncircle /
 * blockadeUnitsAfterCircumvallation / circumvallationCostGp) ships in sieges.js and is reused, not rebuilt.
 *
 *   0. EXPORTS — the construction-side + the sieges-side surface is present.
 *   1. CATALOG — the 2 buildable works + cost models (1gp/ft · 1/100 the machine cost).
 *   2. EVENT — siege-construction-built is self-registered (record-only, wizard-opt-out).
 *   3. addCircumvallation (sieges.js) — feet accumulate; RAW-exact unit relief (cap 24 → 6,000'→0 / 3,000'→24).
 *   4. assembleSiegeArtillery (sieges.js) — joins besiegerArtillery → the Sieges-Simplified bonus + bombardment.
 *   5. siegeSmugglingModifier / siegeFullyCircumvallated — −4 vs a complete ring (RR p.474), 0 otherwise.
 *   6. establishBlockade preserves a pre-built ring (the burst14 fix; backward-compatible).
 *   7. materializeSiegeConstruction — direct: circumvallation + assembly; idempotent; guards.
 *   8. DAY CLOCK — a siege-construction Project completes → the slot-51 consumer feeds the siege.
 */
'use strict';
require('./_engine.js').load();
const ACKS = global.ACKS;

let passed = 0, failed = 0;
function check(label, cond, detail){
  if(cond){ passed++; }
  else { console.log('  FAIL ' + label + (detail !== undefined ? '  -- ' + detail : '')); failed++; }
}

// A campaign with a besieging army + a besieged domain (stronghold cap 24), and an investing siege.
// abstract-construction ON so a day-tick accrues clean labor (no supervisor throttle).
function mkSiege(opts){
  opts = opts || {};
  const c = ACKS.blankCampaign();
  c.hexes = []; c.domains = []; c.characters = []; c.armies = []; c.units = []; c.battles = []; c.projects = []; c.constructibles = [];
  c.currentTurn = 1; c.currentDayInMonth = 1; c.houseRules = { 'abstract-construction': { enabled: true } };
  c.hexes.push(ACKS.blankHex({ id: 'hex-keep', coord: { q: 0, r: 0 }, terrain: 'hills' }));
  const dom = ACKS.blankDomain({ name: 'Moruvai’s March' }); dom.id = 'dom-keep';
  dom.stronghold = { buildValue: 185000 }; dom.geography = { hexes: [{ id: 'hex-keep' }] };
  c.domains.push(dom); c.hexes[0].domainId = 'dom-keep';
  for(let i = 0; i < 2; i++){ const u = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'company', count: 120 }); u.stationedAt = { kind: 'domain-garrison', id: 'dom-keep' }; c.units.push(u); }
  const cmd = ACKS.blankCharacter({ name: 'Marcus' }); cmd.id = 'chr-marcus'; c.characters.push(cmd);
  const ids = []; for(let i = 0; i < 5; i++){ const u = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'company', count: 120 }); c.units.push(u); ids.push(u.id); }
  const army = ACKS.createArmy(c, { name: 'Marcus’s Army', leaderCharacterId: 'chr-marcus', currentHexId: 'hex-keep', unitIds: ids });
  const s = ACKS.startSiege(c, { besiegerArmyId: army.id, defenderDomainId: dom.id, strongholdShp: 24000, unitCapacity: 24 }).siege;
  return { c, army, dom, s };
}
function dayTick(c, n){ for(let i = 0; i < n; i++){ const p = ACKS.proposeDayTick(c, 1, { force: true }); ACKS.commitDayTick(c, p, null); } }
// Raise a kind:'siege-construction' Project, wired to a siege via completionSpec.siegeSupport.
function raiseSiegeWork(c, spec){
  return ACKS.startConstructionProject(c, {
    constructibleKind: 'siege-construction', constructibleSubtype: spec.supportType,
    name: spec.name || spec.supportType, siteHexId: 'hex-keep', ownerDomainId: 'dom-keep',
    totalCost: spec.totalCost || 1, workerCounts: { laborer: 999999 },
    completionSpec: { siegeSupport: spec }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 0. Exports
// ─────────────────────────────────────────────────────────────────────────────
check('SIEGE_CONSTRUCTION_CATALOG exported',     Array.isArray(ACKS.SIEGE_CONSTRUCTION_CATALOG));
check('findSiegeConstruction exported',          typeof ACKS.findSiegeConstruction === 'function');
check('siegeConstructionCatalogList exported',   typeof ACKS.siegeConstructionCatalogList === 'function');
check('circumvallationProjectCostGp exported',   typeof ACKS.circumvallationProjectCostGp === 'function');
check('warMachineAssemblyCostGp exported',       typeof ACKS.warMachineAssemblyCostGp === 'function');
check('materializeSiegeConstruction exported',   typeof ACKS.materializeSiegeConstruction === 'function');
check('proposeSiegeConstructionDay exported',    typeof ACKS.proposeSiegeConstructionDay === 'function');
check('commitSiegeConstructionRecord exported',  typeof ACKS.commitSiegeConstructionRecord === 'function');
// sieges.js side (the apply-side writers + read hooks)
check('addCircumvallation exported',             typeof ACKS.addCircumvallation === 'function');
check('assembleSiegeArtillery exported',         typeof ACKS.assembleSiegeArtillery === 'function');
check('siegeFullyCircumvallated exported',       typeof ACKS.siegeFullyCircumvallated === 'function');
check('siegeSmugglingModifier exported',         typeof ACKS.siegeSmugglingModifier === 'function');

// ─────────────────────────────────────────────────────────────────────────────
// 1. SIEGE_CONSTRUCTION_CATALOG + cost models
// ─────────────────────────────────────────────────────────────────────────────
check('2 buildable siege works',                 ACKS.SIEGE_CONSTRUCTION_CATALOG.length === 2, ACKS.SIEGE_CONSTRUCTION_CATALOG.length);
check('circumvallation in catalog',              !!ACKS.findSiegeConstruction('circumvallation'));
check('war-machine-assembly in catalog',         !!ACKS.findSiegeConstruction('war-machine-assembly'));
check('circumvallation costModel per-foot',      ACKS.findSiegeConstruction('circumvallation').costModel === 'per-foot');
check('assembly costModel fraction-of-machine',  ACKS.findSiegeConstruction('war-machine-assembly').costModel === 'fraction-of-machine');
check('isSiegeConstructionSubtype true/false',   ACKS.isSiegeConstructionSubtype('circumvallation') === true && ACKS.isSiegeConstructionSubtype('nope') === false);
// cost helpers — RR p.474 (1gp/ft) + RR p.449 (1/100 build cost)
check('circumvallation 6,000\' = 6,000gp (1gp/ft)', ACKS.circumvallationProjectCostGp(6000) === 6000);
check('circumvallation reuses sieges math',      ACKS.circumvallationProjectCostGp(2500) === ACKS.circumvallationCostGp(2500));
check('heavy-catapult assembly = 4gp (400/100)', ACKS.warMachineAssemblyCostGp('heavy-catapult') === 4, ACKS.warMachineAssemblyCostGp('heavy-catapult'));
check('siege-tower-huge assembly = 400gp (40000/100)', ACKS.warMachineAssemblyCostGp('siege-tower-huge') === 400);
check('ram assembly = 2gp (200/100)',            ACKS.warMachineAssemblyCostGp('ram') === 2);
check('assembly of unknown machine = 0',         ACKS.warMachineAssemblyCostGp('nope') === 0);

// ─────────────────────────────────────────────────────────────────────────────
// 2. siege-construction-built self-registered (record-only, wizard-opt-out)
// ─────────────────────────────────────────────────────────────────────────────
const kinds = (typeof ACKS.registeredEventKinds === 'function') ? ACKS.registeredEventKinds() : (ACKS.EVENT_KINDS || []);
check('siege-construction-built registered',     kinds.indexOf('siege-construction-built') >= 0);
{
  const o = ACKS.EVENT_WIZARD_OPTOUT;
  const isOptOut = o ? (typeof o.has === 'function' ? o.has('siege-construction-built') : (o.indexOf ? o.indexOf('siege-construction-built') >= 0 : false)) : false;
  check('siege-construction-built is wizard-opt-out', isOptOut);
}
check('siege-construction day-consumer registered', ACKS.dayConsumersInOrder().some(c => c.name === 'siege-construction'));

// ─────────────────────────────────────────────────────────────────────────────
// 3. addCircumvallation — RAW-exact unit relief (RR pp.474–475)
// ─────────────────────────────────────────────────────────────────────────────
{
  const { c, s } = mkSiege();
  const r1 = ACKS.addCircumvallation(c, s.id, 3000);
  check('addCircumvallation ok',                 r1.ok === true);
  check('3,000\' total',                         s.blockade.circumvallationFeet === 3000);
  check('3,000\' relieves to 24 units (cap 24)', r1.unitsRequired === 24, r1.unitsRequired);   // 48 base − 24 = 24
  check('3,000\' not a complete ring',           r1.fullyEncircled === false);
  // a second segment accumulates → a complete ring
  const r2 = ACKS.addCircumvallation(c, s.id, 3000);
  check('feet accumulate (6,000\' total)',       s.blockade.circumvallationFeet === 6000);
  check('6,000\' relieves to 0 units',           r2.unitsRequired === 0, r2.unitsRequired);
  check('6,000\' = complete ring (cap 24)',      r2.fullyEncircled === true);
  check('feetToEncircle = 6,000 (cap 24)',       r2.feetToEncircle === 6000);
  check('addCircumvallation refuses a resolved siege', (function(){ s.status = 'resolved'; const x = ACKS.addCircumvallation(c, s.id, 100); s.status = 'investing'; return !x.ok && x.reason === 'resolved'; })());
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. assembleSiegeArtillery — feeds the Sieges-Simplified bonus + bombardment
// ─────────────────────────────────────────────────────────────────────────────
{
  const { c, s } = mkSiege();
  const r = ACKS.assembleSiegeArtillery(c, s.id, 'heavy-catapult', 1);
  check('assembleSiegeArtillery ok',             r.ok === true);
  check('joins besiegerArtillery',               s.besiegerArtillery['heavy-catapult'] === 1);
  check('flips siege to detailed mode',          s.resolutionMode === 'detailed');
  check('1 heavy catapult → 6 bonus units',      ACKS.artilleryBonusUnits(s.besiegerArtillery) === 6, ACKS.artilleryBonusUnits(s.besiegerArtillery));
  check('1 heavy catapult → 275 shp/day vs stone', ACKS.bombardmentPerDay(s.besiegerArtillery, 'stone') === 275, ACKS.bombardmentPerDay(s.besiegerArtillery, 'stone'));
  // accumulate a second machine
  ACKS.assembleSiegeArtillery(c, s.id, 'heavy-catapult', 1);
  check('2 heavy catapults accumulate',          s.besiegerArtillery['heavy-catapult'] === 2);
  check('2 heavy catapults → 12 bonus units',    ACKS.artilleryBonusUnits(s.besiegerArtillery) === 12);
  check('assembleSiegeArtillery needs a machine', ACKS.assembleSiegeArtillery(c, s.id, null).ok === false);
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. siege-hijinks smuggling modifier (the read hook) — RR pp.474–475
// ─────────────────────────────────────────────────────────────────────────────
{
  const { c, s } = mkSiege();
  check('no ring → smuggling modifier 0',        ACKS.siegeSmugglingModifier(c, s) === 0);
  check('no ring → not fully circumvallated',    ACKS.siegeFullyCircumvallated(c, s) === false);
  ACKS.addCircumvallation(c, s.id, 3000);
  check('partial ring → modifier still 0',       ACKS.siegeSmugglingModifier(c, s) === 0);
  ACKS.addCircumvallation(c, s.id, 3000);        // complete (6,000')
  check('complete ring → fully circumvallated',  ACKS.siegeFullyCircumvallated(c, s) === true);
  check('complete ring → −4 smuggling modifier', ACKS.siegeSmugglingModifier(c, s) === -4);
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. establishBlockade preserves a pre-built ring (the burst14 fix)
// ─────────────────────────────────────────────────────────────────────────────
{
  const { c, s } = mkSiege();
  ACKS.addCircumvallation(c, s.id, 6000);                       // ring built before the blockade is formally established
  ACKS.establishBlockade(c, s.id, { weeksPrep: 0 });            // no circumvallationFeet passed
  check('establishBlockade preserves the pre-built ring (6,000\')', s.blockade.circumvallationFeet === 6000, s.blockade.circumvallationFeet);
  // backward-compat: a fresh siege passing circumvallationFeet still sets it
  const f = mkSiege();
  ACKS.establishBlockade(f.c, f.s.id, { weeksPrep: 0, circumvallationFeet: 6000 });
  check('establishBlockade still honors passed feet (backward-compat)', f.s.blockade.circumvallationFeet === 6000);
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. materializeSiegeConstruction — direct + idempotent + guards
// ─────────────────────────────────────────────────────────────────────────────
{
  const { c, s } = mkSiege();
  const proj = raiseSiegeWork(c, { siegeId: s.id, supportType: 'circumvallation', feet: 6000, name: 'The Ring', totalCost: 6000 });
  proj.lifecycleState = 'complete';                            // (the construction consumer flips this on the Day Clock)
  const r = ACKS.materializeSiegeConstruction(c, proj);
  check('materialize circumvallation applied',   r && r.supportType === 'circumvallation' && r.fullyEncircled === true);
  check('  siege feet fed',                      s.blockade.circumvallationFeet === 6000);
  check('  proj.siegeApplied marker set',        proj.siegeApplied === true);
  check('  siege-construction-built logged',     c.eventLog.some(e => e.event && e.event.kind === 'siege-construction-built'));
  check('  idempotent (2nd call → null)',        ACKS.materializeSiegeConstruction(c, proj) === null);
  // war-machine-assembly path + machine linking
  const m = mkSiege();
  const machine = ACKS.materializeWaveDConstructible(m.c, { id: 'prj-wm', constructibleKind: 'war-machine', constructibleSubtype: 'heavy-catapult', name: 'Bertha', ownerDomainId: 'dom-keep', siteHexId: 'hex-keep', totalCost: 400 });
  const projA = raiseSiegeWork(m.c, { siegeId: m.s.id, supportType: 'war-machine-assembly', machineSubtype: 'heavy-catapult', machineConstructibleId: machine.id, name: 'Assemble Bertha', totalCost: 4 });
  projA.lifecycleState = 'complete';
  const rA = ACKS.materializeSiegeConstruction(m.c, projA);
  check('materialize assembly applied',          rA && rA.supportType === 'war-machine-assembly');
  check('  siege artillery fed',                 m.s.besiegerArtillery['heavy-catapult'] === 1);
  check('  source machine tagged assembledAtSiegeId', machine.functionData && machine.functionData.assembledAtSiegeId === m.s.id);
  // guards
  check('no-op for non-siege-construction kind', ACKS.materializeSiegeConstruction(c, { constructibleKind: 'war-machine' }) === null);
  check('no-op without a siegeSupport spec',     ACKS.materializeSiegeConstruction(c, { constructibleKind: 'siege-construction', completionSpec: {} }) === null);
  check('no-op for a missing siege',             ACKS.materializeSiegeConstruction(c, { constructibleKind: 'siege-construction', completionSpec: { siegeSupport: { siegeId: 'sie-nope', supportType: 'circumvallation', feet: 100 } } }) === null);
}

// ─────────────────────────────────────────────────────────────────────────────
// 8. DAY CLOCK — a siege-construction Project completes → the slot-51 consumer feeds the siege
// ─────────────────────────────────────────────────────────────────────────────
{
  const { c, s } = mkSiege();
  const proj = raiseSiegeWork(c, { siegeId: s.id, supportType: 'circumvallation', feet: 3000, name: 'DayRing', totalCost: 3000 });
  dayTick(c, 4);   // complete (day 1) + the slot-51 apply (+1 lag), with margin
  check('day-clock: project complete',           proj.lifecycleState === 'complete');
  check('day-clock: siege fed (siegeApplied)',   proj.siegeApplied === true);
  check('day-clock: 3,000\' on the siege',       s.blockade.circumvallationFeet === 3000);
  check('day-clock: blockade relieved to 24 units', ACKS.blockadeUnitsAfterCircumvallation(24, s.blockade.circumvallationFeet) === 24);
  check('day-clock: siege-construction-built logged', c.eventLog.some(e => e.event && e.event.kind === 'siege-construction-built'));
}

console.log((failed === 0 ? 'PASS' : 'FAIL') + ' construction-siege-support.smoke — ' + passed + ' passed, ' + failed + ' failed');
if(failed > 0) process.exit(1);
