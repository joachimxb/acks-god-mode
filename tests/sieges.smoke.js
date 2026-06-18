// =============================================================================
// sieges.smoke.js — Phase 3 Military W6: Sieges (RR pp.473–485).
//
//   node tests/sieges.smoke.js   (or via `npm test`)
//
// Every printed RAW worked example is locked EXACT:
//   · Moruvai's stronghold estimate (185,000gp stone → 18,500 shp, capacity 19; RR p.474)
//   · the Sieges-Simplified bonus units (Marcus's 1 medium trebuchet + 4 light catapult = 23;
//     Moruvai's 4 heavy catapult + 5 heavy ballista + 20 light ballista = 36; RR p.485)
//   · the Artillery Bombardment table (Marcus's 925 shp/day vs stone; RR p.476)
//   · the Duration-of-Siege table (Marcus's unit advantage 25 vs 24,000 shp → 30 days; the
//     island ×4 → 120 days; RR pp.484–485)
//   · the blockade math (Moruvai cap 24 → 48 units, 14,400gp stored = 24 weeks, 6,000' ring; RR p.475)
//   · the breach math (15,000 shp damage = 15 breaches → 24 + 15 = 39 assaulting units; RR p.473)
// plus the lifecycle setters, the assault → W3 battle handoff, and the slot-90 day consumer.
// =============================================================================
'use strict';
require('./_engine.js').load();          // auto-loads acks-engine-sieges.js (the extra module)
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(label + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('— ' + t); }

// A campaign with a besieging army (N units) and a besieged domain (a stronghold + M garrison units).
function mkFixture(opts){
  opts = opts || {};
  const c = ACKS.blankCampaign(); c.hexes = []; c.domains = []; c.characters = []; c.armies = []; c.units = []; c.battles = [];
  c.currentTurn = 1; c.currentDayInMonth = 1;
  c.hexes.push(ACKS.blankHex({ id: 'hex-keep', coord: { q: 0, r: 0 }, terrain: 'hills' }));
  const dom = ACKS.blankDomain({ name: 'Moruvai’s March' }); dom.id = 'dom-keep';
  dom.stronghold = { buildValue: opts.strongholdGp != null ? opts.strongholdGp : 185000 };
  dom.geography = { hexes: [{ id: 'hex-keep' }] };
  c.domains.push(dom); c.hexes[0].domainId = 'dom-keep';
  // garrison units (the defender)
  const defN = opts.defenderUnits != null ? opts.defenderUnits : 2;
  for(let i = 0; i < defN; i++){ const u = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'company', count: 120 }); u.stationedAt = { kind: 'domain-garrison', id: 'dom-keep' }; c.units.push(u); }
  // besieger army
  const cmd = ACKS.blankCharacter({ name: 'Marcus' }); cmd.id = 'chr-marcus'; cmd.coins = { gp: 50000 }; c.characters.push(cmd);
  const besN = opts.besiegerUnits != null ? opts.besiegerUnits : 5;
  const unitIds = [];
  for(let i = 0; i < besN; i++){ const u = ACKS.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'company', count: 120 }); c.units.push(u); unitIds.push(u.id); }
  const army = ACKS.createArmy(c, { name: 'Marcus’s Army', leaderCharacterId: 'chr-marcus', currentHexId: 'hex-keep', unitIds });
  return { c, army, dom };
}

// ─────────────────────────────────────────────────────────────────────────────
section('Entity + wiring — factory / prefix / registry / schema / events / consumer');
{
  const s = ACKS.blankSiege({});
  ok('blankSiege id prefix sie-', s.id.slice(0, 4) === 'sie-');
  ok('blankSiege default status investing', s.status === 'investing');
  ok('blankSiege default mode simplified', s.resolutionMode === 'simplified');
  ok('blankSiege stronghold object', s.stronghold && s.stronghold.material === 'stone' && s.stronghold.strongholdShp === 0);
  ok('blankSiege blockade object', s.blockade && s.blockade.inPlace === false);
  // global schema ⊆ factory invariant (the Inspector schema)
  const keys = new Set(Object.keys(s));
  const schema = ACKS.fieldSchemaFor('siege');
  const topExtras = schema.fields.filter(f => f.type !== 'computed').map(f => f.name).filter(n => !keys.has(n));
  ok('siege schema top-level ⊆ blankSiege', topExtras.length === 0, 'extras: ' + topExtras.join(','));
  for(const f of schema.fields.filter(f => f.type === 'object')){
    const nk = new Set(Object.keys(s[f.name] || {}));
    const sub = (f.fields || []).filter(x => x.type !== 'computed').map(x => x.name).filter(n => !nk.has(n));
    ok('siege object ' + f.name + ' sub ⊆ factory', sub.length === 0, 'extras: ' + sub.join(','));
  }
  ok('siege schema validates clean', ACKS.validateFieldSchema('siege', schema).ok);
  const reg = ACKS.entityKinds().find(e => e.kind === 'siege');
  ok('entity registry has siege kind (🏯)', !!reg && reg.icon === '🏯');
  ok('registry siege displayName reads only factory keys', reg.displayName({}, s) === (s.name || s.id));
  ['siege-started', 'siege-progress', 'siege-resolved'].forEach(k => {
    ok('event kind known: ' + k, ACKS.isEventKindKnown(k));
    ok('event kind wizard-opt-out: ' + k, !ACKS.isWizardEmittable(k));
  });
  const cons = ACKS.dayConsumersInOrder().find(x => x.name === 'siege');
  ok('siege day consumer registered at slot 90', !!cons && cons.order === 90);
  ok('siege consumer pauseTriggers = [encounter]', !!cons && cons.pauseTriggers.indexOf('encounter') >= 0);
}

// ─────────────────────────────────────────────────────────────────────────────
section('Stronghold estimation (RR p.474 — Sieges Without Maps)');
ok('185,000gp stone → 18,500 shp', ACKS.strongholdShpEstimate(185000, 'stone') === 18500);
ok('18,500 shp → capacity 19', ACKS.unitCapacityEstimate(18500) === 19);
ok('wood = ⅒ stone shp (185,000 → 1,850)', ACKS.strongholdShpEstimate(185000, 'wood') === 1850);
ok('estimate rounds up (10,005 stone → 1,001)', ACKS.strongholdShpEstimate(10005, 'stone') === 1001);
ok('0 gp → 0 shp', ACKS.strongholdShpEstimate(0, 'stone') === 0);
ok('capacity rounds up (24,000 shp → 24)', ACKS.unitCapacityEstimate(24000) === 24);

section('Sieges-Simplified bonus units (RR p.485)');
ok('Marcus: 1 medium treb + 4 light catapult = 23', ACKS.artilleryBonusUnits({ 'medium-trebuchet': 1, 'light-catapult': 4 }) === 23);
ok('Moruvai: 4 hcat + 5 hbal + 20 lbal = 36', ACKS.artilleryBonusUnits({ 'heavy-catapult': 4, 'heavy-ballista': 5, 'light-ballista': 20 }) === 36);
ok('light ballista unit size 10 (10 → 1, 9 → 0)', ACKS.artilleryBonusUnits({ 'light-ballista': 10 }) === 1 && ACKS.artilleryBonusUnits({ 'light-ballista': 9 }) === 0);
ok('medium ballista unit size 5 (5 → 1)', ACKS.artilleryBonusUnits({ 'medium-ballista': 5 }) === 1);
ok('ram unit size 6 (6 → 1)', ACKS.artilleryBonusUnits({ 'ram': 6 }) === 1);
ok('heavy trebuchet = 18 per piece', ACKS.artilleryBonusUnits({ 'heavy-trebuchet': 1 }) === 18);
ok('siege tower huge = 8', ACKS.artilleryBonusUnits({ 'siege-tower-huge': 1 }) === 8);
ok('empty map → 0', ACKS.artilleryBonusUnits({}) === 0 && ACKS.artilleryBonusUnits(null) === 0);

section('Artillery Bombardment table (RR p.476)');
ok('Marcus: 1 medium treb + 4 light catapult vs stone = 925/day', ACKS.bombardmentPerDay({ 'medium-trebuchet': 1, 'light-catapult': 4 }, 'stone') === 925);
ok('heavy trebuchet vs stone = 750', ACKS.bombardmentPerDay({ 'heavy-trebuchet': 1 }, 'stone') === 750);
ok('light ballista vs stone = 0 (no stone damage)', ACKS.bombardmentPerDay({ 'light-ballista': 5 }, 'stone') === 0);
ok('light ballista vs wood = 775/each', ACKS.bombardmentPerDay({ 'light-ballista': 2 }, 'wood') === 1550);
ok('medium catapult vs wood = 3,750', ACKS.bombardmentPerDay({ 'medium-catapult': 1 }, 'wood') === 3750);
ok('rams/towers do not bombard', ACKS.bombardmentPerDay({ 'ram': 6, 'siege-tower-huge': 1 }, 'stone') === 0);

section('Duration of Siege table (RR pp.484–485)');
{
  const d = ACKS.siegeDurationDays(24000, 25, 'normal');
  ok('Marcus: 24,000 shp × adv 25 → 30 days', d.days === 30 && d.base === 30 && !d.tooWeak && !d.immediate);
  ok('island ×4 → 120 days', ACKS.siegeDurationDays(24000, 25, 'island').days === 120);
  ok('mountain ×5 → 150 days', ACKS.siegeDurationDays(24000, 25, 'mountain').days === 150);
  ok('riverbank ×2 → 60 days', ACKS.siegeDurationDays(24000, 25, 'riverbank').days === 60);
  ok('adv < 1 → too weak (blockade only)', ACKS.siegeDurationDays(24000, 0, 'normal').tooWeak === true && ACKS.siegeDurationDays(24000, 0, 'normal').days === null);
  ok('weak vs big walls = "−" (18,000 shp, adv 1) → too weak', ACKS.siegeDurationDays(18000, 1, 'normal').tooWeak === true);
  ok('small wall, huge advantage → falls at once (2,000 shp, adv 150 → 0)', ACKS.siegeDurationDays(2000, 150, 'normal').immediate === true && ACKS.siegeDurationDays(2000, 150, 'normal').days === 0);
  ok('immediate result ignores site modifier (×4 stays 0)', ACKS.siegeDurationDays(2000, 150, 'island').days === 0);
  // spot a few more cells exactly
  ok('cell 1–3,000 × adv 1–2 = 45', ACKS.siegeDurationDays(3000, 2, 'normal').base === 45);
  ok('cell 13–15,000 × adv 3–4 = 113', ACKS.siegeDurationDays(15000, 3, 'normal').base === 113);
  ok('cell 301,000+ × adv 601+ = 17', ACKS.siegeDurationDays(500000, 700, 'normal').base === 17);
  ok('cell 76–100,000 × adv 11–15 = 200', ACKS.siegeDurationDays(100000, 12, 'normal').base === 200);
}

section('Breaches + assault capacity (RR p.473)');
ok('15,000 shp damage = 15 breaches', ACKS.siegeBreaches(15000) === 15);
ok('999 damage = 0 breaches', ACKS.siegeBreaches(999) === 0);
ok('Marcus: capacity 24 + 15 breaches → 39 assaulting units', ACKS.assaultUnitsAllowed(24, 15) === 39);
ok('defenders capped at capacity (breaches don’t help)', ACKS.defendUnitsAllowed(24) === 24);

section('Blockade math (RR pp.474–475)');
ok('Moruvai cap 24 → 48 blockading units', ACKS.blockadeUnitsRequired(24) === 48);
ok('minimum 20 units (cap 5 → 20)', ACKS.blockadeUnitsRequired(5) === 20);
ok('cap 24 → 6,000\' circumvallation ring', ACKS.circumvallationFeetToEncircle(24) === 6000);
ok('circumvallation cost = 1gp/ft (6,000\' → 6,000gp)', ACKS.circumvallationCostGp(6000) === 6000);   // RR's example prints 6,250 (apparent slip); the stated rate yields 6,000
ok('6,000\' circumvallation reduces 48 → 0 units (complete ring)', ACKS.blockadeUnitsAfterCircumvallation(24, 6000) === 0);
ok('3,000\' circumvallation reduces 48 → 24 units', ACKS.blockadeUnitsAfterCircumvallation(24, 3000) === 24);
ok('Moruvai cap 24, no prep → 14,400gp stored', ACKS.siegeStoredSupplies(24, 0) === 14400);
ok('cap 24, 2 weeks prep → 43,200gp stored', ACKS.siegeStoredSupplies(24, 2) === 43200);
ok('stored supplies capped at 3,000/cap (cap 24, 10 weeks prep → 72,000)', ACKS.siegeStoredSupplies(24, 10) === 72000);
ok('14,400gp / 600gp/week = 24 weeks of supply', ACKS.siegeWeeksOfSupply(14400, 600) === 24);
ok('zero weekly cost → indefinite supply', ACKS.siegeWeeksOfSupply(14400, 0) === Infinity);

// ─────────────────────────────────────────────────────────────────────────────
section('startSiege — estimate from strongholdValue, compute the simplified clock');
{
  const { c, army, dom } = mkFixture({ strongholdGp: 24000, besiegerUnits: 5, defenderUnits: 2 });
  // 24,000gp stone → 2,400 shp; cap 3. (We exercise the estimation path end-to-end.)
  const res = ACKS.startSiege(c, { besiegerArmyId: army.id, defenderDomainId: dom.id });
  ok('startSiege ok', res.ok && res.siege);
  const s = res.siege;
  ok('campaign.sieges created on first write (no pre-injected array)', Array.isArray(c.sieges) && c.sieges.length === 1);
  ok('stronghold shp estimated 24,000gp/10 = 2,400', s.stronghold.strongholdShp === 2400);
  ok('unit capacity ⌈2,400/1000⌉ = 3', s.stronghold.unitCapacity === 3);
  ok('startedOrd stamped (turn1 day1 = 31)', s.startedOrd === 31);
  ok('besieger 5 units − defender 2 units → advantage +3', ACKS.siegeUnitAdvantage(c, s) === 3);
  ok('daysRequired matches the table (2,400 shp, adv 3 → cell 23)', s.daysRequired === ACKS.siegeDurationDays(2400, 3, 'normal').days && s.daysRequired === 23);
  ok('unitAdvantageAtStart recorded', s.unitAdvantageAtStart === 3);
  const ev = c.eventLog.find(e => e.event && e.event.kind === 'siege-started');
  ok('siege-started event emitted', !!ev && ev.event.payload.siegeId === s.id);
  ok('siege-started event validates against its schema', ACKS.validateEvent(ev.event).valid !== false);
  ok('siege-started context names hex + domain + army', ev.event.context.primaryHexId === 'hex-keep' && ev.event.context.relatedEntities.some(r => r.kind === 'siege') && ev.event.context.relatedEntities.some(r => r.kind === 'army'));
}

section('startSiege — guards + overrides');
{
  const { c, army, dom } = mkFixture({});
  ok('no besieger → fails', ACKS.startSiege(c, { besiegerArmyId: 'nope', defenderDomainId: dom.id }).reason === 'no-besieger');
  ok('no defender → fails', ACKS.startSiege(c, { besiegerArmyId: army.id }).reason === 'no-defender');
  const res = ACKS.startSiege(c, { besiegerArmyId: army.id, defenderDomainId: dom.id, strongholdShp: 25000, unitCapacity: 24, siteType: 'island', material: 'stone', name: 'The Long Siege' });
  ok('shp/cap/site/name overrides honored', res.siege.stronghold.strongholdShp === 25000 && res.siege.stronghold.unitCapacity === 24 && res.siege.stronghold.siteType === 'island' && res.siege.name === 'The Long Siege');
}

section('establishBlockade — stored supplies + circumvallation');
{
  const { c, army, dom } = mkFixture({ defenderUnits: 10 });
  const s = ACKS.startSiege(c, { besiegerArmyId: army.id, defenderDomainId: dom.id, strongholdShp: 24000, unitCapacity: 24 }).siege;
  const r = ACKS.establishBlockade(c, s.id, { weeksPrep: 0, circumvallationFeet: 6000 });
  ok('establishBlockade ok', r.ok);
  ok('blockade in place', s.blockade.inPlace === true);
  ok('mode flips to detailed', s.resolutionMode === 'detailed');
  ok('stored supplies = 14,400 (cap 24, prep 0)', s.blockade.storedSuppliesGp === 14400);
  ok('weekly cost from 10 garrison units (10 × 60 = 600 fallback)', ACKS.siegeDefenderWeeklySupplyCost(c, s) >= 600);
  const prog = ACKS.siegeProgress(c, s);
  ok('progress.supplies.fullyEncircled at 6,000\'', prog.supplies.fullyEncircled === true);
  ok('siege-progress (blockade) event emitted', c.eventLog.some(e => e.event && e.event.kind === 'siege-progress' && e.event.payload.phase === 'blockade'));
}

section('recordBombardment — shp damage → breaches');
{
  const { c, army, dom } = mkFixture({});
  const s = ACKS.startSiege(c, { besiegerArmyId: army.id, defenderDomainId: dom.id, strongholdShp: 25000, unitCapacity: 24 }).siege;
  s.besiegerArtillery = { 'medium-trebuchet': 1, 'light-catapult': 4 };   // 925 shp/day vs stone
  const r = ACKS.recordBombardment(c, s.id, { days: 16 });
  ok('recordBombardment ok', r.ok);
  ok('925/day × 16 = 14,800 shp damage', s.stronghold.shpDamage === 14800);
  ok('14,800 → 14 breaches', r.breaches === 14 && ACKS.siegeBreaches(s.stronghold.shpDamage) === 14);
  ok('damage caps at total shp (no rubble yet)', !r.reducedToRubble);
  // hammer to rubble
  const r2 = ACKS.recordBombardment(c, s.id, { days: 20 });
  ok('further bombardment reduces to rubble (≥25,000)', r2.reducedToRubble === true && s.stronghold.shpDamage === 25000);
  ok('no-artillery siege cannot bombard', ACKS.recordBombardment(c, ACKS.startSiege(c, { besiegerArmyId: army.id, defenderDomainId: dom.id, strongholdShp: 5000 }).siege.id, { days: 1 }).reason === 'no-bombardment');
}

section('launchSiegeAssault — hands off to the W3 battle engine');
{
  const { c, army, dom } = mkFixture({ besiegerUnits: 6, defenderUnits: 3 });
  const s = ACKS.startSiege(c, { besiegerArmyId: army.id, defenderDomainId: dom.id, strongholdShp: 24000, unitCapacity: 24 }).siege;
  const r = ACKS.launchSiegeAssault(c, s.id);
  ok('launchSiegeAssault ok', r.ok && r.battle);
  ok('a Battle was created in campaign.battles', (c.battles || []).some(b => b && b.id === r.battle.id));
  ok('siege.assaultBattleId points at the battle', s.assaultBattleId === r.battle.id);
  const btl = c.battles.find(b => b.id === r.battle.id);
  ok('battle side A = the besieger army (offensive)', btl.sides.a.armyId === army.id && btl.sides.a.stance === 'offensive');
  ok('battle side B = the garrison (defensive)', btl.sides.b.domainId === dom.id && btl.sides.b.stance === 'defensive');
  ok('defender holds the advantageous terrain (the walls)', btl.options.advantageousTerrain === 'b');
  ok('siege-progress (assault) event names the battle', c.eventLog.some(e => e.event && e.event.kind === 'siege-progress' && e.event.payload.phase === 'assault' && e.event.payload.battleId === r.battle.id));
}

section('A siege assault’s officer casualties feed the Mortal Wounds resolver (RR p.485 → W3 → Delves D1)');
{
  // An assault IS a battle (RR p.485), so the defender's officers roll on the same Mortal Wounds
  // table the W3 aftermath now drives — closing the deferral's "same for a siege assault" clause.
  const { c, army, dom } = mkFixture({ besiegerUnits: 6, defenderUnits: 3 });
  const castellan = ACKS.blankCharacter({ id: 'chr-castellan', name: 'Castellan Roht', level: 6 });
  c.characters.push(castellan);
  const s = ACKS.startSiege(c, { besiegerArmyId: army.id, defenderDomainId: dom.id, strongholdShp: 24000, unitCapacity: 24 }).siege;
  const btl = ACKS.findBattle(c, ACKS.launchSiegeAssault(c, s.id).battle.id);
  ok('the assault battle carries the garrison as defending units', (btl.sides.b.units || []).length > 0);
  // the castellan leads a defending unit; the besieger storms the walls and that unit is overrun
  btl.sides.b.units[0].officerCharacterId = 'chr-castellan';
  btl.sides.b.units[0].status = 'destroyed';
  btl.status = 'ended';
  btl.result = { winner: 'a', loser: 'b', endedBy: 'assault', endedAtTurn: 1 };
  const af = ACKS.computeBattleAftermath(c, btl.id);
  ok('the aftermath flags the castellan as a fallen officer', (af.officers || []).some(o => o.characterId === 'chr-castellan'));
  // critically wounded (survives even when the stronghold falls) + captured behind the walls
  ACKS.setOfficerOutcome(c, btl.id, 'chr-castellan', 'critically-wounded', { forcedD6: 4 });   // 1d6=4 → one hand lost (lasting)
  ACKS.applyBattleAftermath(c, btl.id);
  ok('the defender officer took a real Mortal Wound from the assault (record + −1 penalty + convalescing)',
    (castellan.mortalWounds || []).length === 1 && castellan.permanentWoundPenalty === -1 && castellan.lifecycleState === 'incapacitated');
  ok('… captured behind the fallen walls (the disposition is recorded)', (castellan.history || []).some(h => /captured/i.test(h.summary || '')));
}

section('resolveSiege — capture / lift, status + event');
{
  const { c, army, dom } = mkFixture({});
  const s = ACKS.startSiege(c, { besiegerArmyId: army.id, defenderDomainId: dom.id, strongholdShp: 5000, unitCapacity: 5 }).siege;
  const r = ACKS.resolveSiege(c, s.id, { outcome: 'captured' });
  ok('resolveSiege captured ok', r.ok && r.outcome === 'captured');
  ok('status resolved', s.status === 'resolved');
  ok('resolution outcome stamped', s.resolution && s.resolution.outcome === 'captured');
  ok('captureReady cleared on resolution', s.captureReady === false);
  ok('double-resolve guarded', ACKS.resolveSiege(c, s.id, { outcome: 'lifted' }).reason === 'already-resolved');
  const ev = c.eventLog.find(e => e.event && e.event.kind === 'siege-resolved');
  ok('siege-resolved event emitted (besiegerWon true)', !!ev && ev.event.payload.outcome === 'captured' && ev.event.payload.besiegerWon === true);
  ok('siege-resolved validates against its schema', ACKS.validateEvent(ev.event).valid !== false);
  // a lift = the defender wins
  const s2 = ACKS.startSiege(c, { besiegerArmyId: army.id, defenderDomainId: dom.id, strongholdShp: 5000 }).siege;
  ACKS.resolveSiege(c, s2.id, { outcome: 'lifted' });
  ok('lifted → besiegerWon false', c.eventLog.filter(e => e.event && e.event.kind === 'siege-resolved').pop().event.payload.besiegerWon === false);
}

section('siegeProgress — status transitions (derived daysElapsed)');
{
  const { c, army, dom } = mkFixture({ besiegerUnits: 5, defenderUnits: 2 });   // adv +3
  const s = ACKS.startSiege(c, { besiegerArmyId: army.id, defenderDomainId: dom.id, strongholdShp: 24000, unitCapacity: 24 }).siege;
  // adv 3, 24,000 shp → row 21–30,000 × adv-band 3–4 = 225 days
  ok('daysRequired 225 (24,000 shp, adv 3)', s.daysRequired === 225 && s.daysRequired === ACKS.siegeDurationDays(24000, 3, 'normal').days);
  ok('status investing at start', ACKS.siegeProgress(c, s).status === 'investing');
  ok('daysElapsed 0 at start', ACKS.siegeDaysElapsed(c, s) === 0);
  // 2 months on (turn 3 day 1 = ord 91; started 31 → 60 days) — still investing (60 < 225)
  c.currentTurn = 3; c.currentDayInMonth = 1;
  ok('daysElapsed 60 after 2 months', ACKS.siegeDaysElapsed(c, s) === 60);
  ok('status still investing at 60 of 225', ACKS.siegeProgress(c, s).status === 'investing');
  // clock runs out (turn 9 day 1 = ord 271; elapsed 240 ≥ 225)
  c.currentTurn = 9; c.currentDayInMonth = 1;
  ok('daysElapsed 240', ACKS.siegeDaysElapsed(c, s) === 240);
  ok('status capture-ready once the clock runs out', ACKS.siegeProgress(c, s).status === 'capture-ready');
  // a too-weak besieger reads blockade-only
  const weak = mkFixture({ besiegerUnits: 1, defenderUnits: 3 });
  const sw = ACKS.startSiege(weak.c, { besiegerArmyId: weak.army.id, defenderDomainId: weak.dom.id, strongholdShp: 24000, unitCapacity: 24 }).siege;
  ok('too-weak siege → blockade-only', ACKS.siegeProgress(weak.c, sw).status === 'blockade-only' && sw.daysRequired === null);
}

section('slot-90 consumer — proposeSiegeDay fires capture-ready on the crossing day');
{
  const { c, army, dom } = mkFixture({ besiegerUnits: 5, defenderUnits: 2 });
  const s = ACKS.startSiege(c, { besiegerArmyId: army.id, defenderDomainId: dom.id, strongholdShp: 2400, unitCapacity: 3 }).siege;
  ok('daysRequired 23 (2,400 shp, adv 3)', s.daysRequired === 23);
  // startedOrd = 31 (turn1 day1). Crossing = the proposed day with elapsed ≥ 23 first time.
  // ord = turn*30 + day. day 24 → ord 54 → elapsed 23 (the crossing).
  c.currentTurn = 1;
  // yesterday (day 23 → ord 53 → elapsed 22): NO fire
  let res = ACKS.proposeSiegeDay(c, { dayInMonth: 23 });
  ok('day 23 (elapsed 22): no capture-ready proposal', !res.pendingRecords.some(r => r.milestone === 'capture-ready'));
  // crossing (day 24 → ord 54 → elapsed 23): fires
  res = ACKS.proposeSiegeDay(c, { dayInMonth: 24 });
  const rec = res.pendingRecords.find(r => r.milestone === 'capture-ready');
  ok('day 24 (elapsed 23): capture-ready proposed', !!rec && rec.siegeId === s.id);
  ok('crossing notable pauses (trigger encounter)', res.notableEvents.some(n => n.type === 'siege-capture-ready' && n.pauseTrigger === 'encounter'));
  // after the crossing (day 25 → elapsed 24): no second fire
  res = ACKS.proposeSiegeDay(c, { dayInMonth: 25 });
  ok('day 25 (elapsed 24): no second capture-ready proposal', !res.pendingRecords.some(r => r.milestone === 'capture-ready'));
  // commit the crossing record → captureReady set, event emitted
  ACKS.commitSiegeRecord(c, rec);
  ok('commit sets captureReady', s.captureReady === true);
  ok('commit emits siege-progress (capture-ready)', c.eventLog.some(e => e.event && e.event.kind === 'siege-progress' && e.event.payload.phase === 'capture-ready'));
  // a captureReady siege is skipped by the consumer (the GM resolves it)
  ok('captureReady siege not re-proposed', !ACKS.proposeSiegeDay(c, { dayInMonth: 21 }).pendingRecords.some(r => r.siegeId === s.id));
  // resolved sieges are skipped entirely
  ACKS.resolveSiege(c, s.id, { outcome: 'captured' });
  ok('resolved siege not proposed', ACKS.proposeSiegeDay(c, { dayInMonth: 22 }).pendingRecords.length === 0);
}

section('slot-90 consumer — blockade supplies-exhausted milestone');
{
  const { c, army, dom } = mkFixture({ besiegerUnits: 1, defenderUnits: 3 });   // too weak → blockade only
  const s = ACKS.startSiege(c, { besiegerArmyId: army.id, defenderDomainId: dom.id, strongholdShp: 24000, unitCapacity: 24 }).siege;
  // stored 14,400gp, weekly cost ~ 3 units × 60 = 180 → ~80 weeks. Force a short window for the test:
  ACKS.establishBlockade(c, s.id, { weeksPrep: 0 });
  s.blockade.storedSuppliesGp = 360;   // 2 weeks at 180/week
  // crossing: week 2 = day 14 → ord 44 → elapsed 13 (week 1); day 15 → elapsed 14 (week 2). Cross at day 15.
  c.currentTurn = 1;
  let res = ACKS.proposeSiegeDay(c, { dayInMonth: 14 });
  ok('day 14 (week 1): no supplies-exhausted', !res.pendingRecords.some(r => r.milestone === 'supplies-exhausted'));
  res = ACKS.proposeSiegeDay(c, { dayInMonth: 15 });
  const rec = res.pendingRecords.find(r => r.milestone === 'supplies-exhausted');
  ok('day 15 (week 2): supplies-exhausted proposed', !!rec);
  ACKS.commitSiegeRecord(c, rec);
  ok('commit sets blockade.suppliesExhausted', s.blockade.suppliesExhausted === true);
}

section('lookups + no-op safety');
{
  const { c, army, dom } = mkFixture({});
  const s = ACKS.startSiege(c, { besiegerArmyId: army.id, defenderDomainId: dom.id, strongholdShp: 5000 }).siege;
  ok('findSiege', ACKS.findSiege(c, s.id) === s);
  ok('activeSieges', ACKS.activeSieges(c).length === 1);
  ok('siegesAtHex', ACKS.siegesAtHex(c, 'hex-keep').length === 1);
  ok('siegesForDomain', ACKS.siegesForDomain(c, 'dom-keep').length === 1);
  ok('proposeSiegeDay on empty campaign is a no-op', ACKS.proposeSiegeDay(ACKS.blankCampaign(), {}).pendingRecords.length === 0);
  ok('commitSiegeRecord on a foreign record is a no-op', (ACKS.commitSiegeRecord(c, { kind: 'other' }), true));
}

// ─────────────────────────────────────────────────────────────────────────────
console.log('\n=============================================');
console.log('sieges.smoke.js — Passed: ' + pass + ', Failed: ' + fail);
console.log('=============================================');
if(fail){ failures.forEach(f => console.log('  ✗ ' + f)); process.exit(1); }
