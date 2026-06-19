// =============================================================================
// weather-war.smoke.js — the RR p.449 weather-on-war coupling (2026-06-18).
//
//   node tests/weather-war.smoke.js   (or via `npm test`)
//
// The shipped weather layer (HW-1..3) generates the day's per-region condition +
// temperature; the warfare layer now consumes the RR p.449 "Effects of Severe Weather"
// table beyond the speed multiplier that already shipped (W4). Locks the four effects:
//   • Sweltering: supply cost +25% (more water consumption) + out-of-supply penalties
//     DOUBLED (heat exhaustion + dehydration).
//   • Disease vagary: frigid 10% / cold 5% EXPOSURE + rainy/snowy 10% WETNESS, each its
//     own weekly roll — core RAW, NOT gated on the optional vagaries-of-war table.
//   • Missile penalties: rainy/snowy −2, windy −2, stormy −4 to missile attack throws in
//     battle (both sides).
// The pure reader is acks-engine-catalogs.js weatherWarEffects(condition, temperature).
// =============================================================================
'use strict';
const A = require('./_engine.js').load();

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail){ if(cond){ pass++; } else { fail++; failures.push(label + (detail ? ' — ' + detail : '')); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t){ console.log('— ' + t); }
function d20v(r){ return (r - 0.5) / 20; }
function d6v(r){ return (r - 0.5) / 6; }
function seq(values){ let i = 0; return () => values[Math.min(i++, values.length - 1)]; }

// A minimal on-campaign army at a coord-bearing hex, with a paying leader + one company.
function mkArmy(opts){
  const o = opts || {};
  const c = A.blankCampaign(); c.hexes = []; c.domains = []; c.characters = []; c.armies = []; c.units = [];
  c.currentTurn = o.turn || 1; c.currentDayInMonth = o.day || 10;
  c.hexes.push(A.blankHex({ id: 'h0', coord: { q: 0, r: 0 }, terrain: o.terrain || 'grassland' }));
  const ld = A.blankCharacter({ name: 'Cmd' }); ld.id = 'cmd'; ld.coins = { pp: 0, gp: o.gp != null ? o.gp : 50000, ep: 0, sp: 0, cp: 0 }; ld.personalGp = o.gp != null ? o.gp : 50000; ld.payKeepFromTreasury = false; c.characters.push(ld);
  const u = A.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'company', count: 120 }); c.units.push(u);
  const ar = A.createArmy(c, { name: 'Field', leaderCharacterId: 'cmd', currentHexId: 'h0', unitIds: [u.id] });
  ar.supplyBaseIds = o.supplyBaseIds || [];
  return { c, ar };
}
function ctxFor(c, weather){ const k = A.regionKeyForCoord({ q: 0, r: 0 }); return { dayInMonth: c.currentDayInMonth, weatherByRegion: { [k]: weather }, weather }; }
// Two opposing 120-troop armies one hex apart (axial distance 1 ≤ recon range 4) — for the
// RR p.449 recon penalty. obsTerrain governs the barrens/desert gate (the OBSERVER's hex).
function mkTwoArmies(opts){
  const o = opts || {};
  const c = A.blankCampaign(); c.hexes = []; c.domains = []; c.characters = []; c.armies = []; c.units = [];
  c.currentTurn = 1; c.currentDayInMonth = 10;
  c.hexes.push(A.blankHex({ id: 'obs', coord: { q: 0, r: 0 }, terrain: o.obsTerrain || 'grassland' }));
  c.hexes.push(A.blankHex({ id: 'opp', coord: { q: 1, r: 0 }, terrain: o.oppTerrain || 'grassland' }));
  const la = A.blankCharacter({ name: 'Aelric' }); la.id = 'la'; c.characters.push(la);
  const lb = A.blankCharacter({ name: 'Brand' });  lb.id = 'lb'; c.characters.push(lb);
  const ua = A.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'company', count: 120 }); c.units.push(ua);
  const ub = A.blankUnit({ unitTypeKey: 'heavy-infantry', scale: 'company', count: 120 }); c.units.push(ub);
  const obs = A.createArmy(c, { name: 'Watch',  leaderCharacterId: 'la', currentHexId: 'obs', unitIds: [ua.id] });
  const opp = A.createArmy(c, { name: 'Quarry', leaderCharacterId: 'lb', currentHexId: 'opp', unitIds: [ub.id] });
  return { c, obs, opp };
}
function reconWeatherMod(rr){ const m = rr.mods.find(x => /weather/.test(x.label)); return m ? m.value : 0; }
function hasReconWeatherMod(rec){ return (rec.recons || []).some(rc => (rc.recon.mods || []).some(m => /weather/.test(m.label))); }

// ─────────────────────────────────────────────────────────────────────────────
section('weatherWarEffects — the RR p.449 catalog reader');
{
  const swel = A.weatherWarEffects('fair', 'sweltering');
  ok('sweltering: +25% supply, doubled, ×½ speed', swel.supplyCostMult === 1.25 && swel.outOfSupplyDoubled === true && swel.speedMult === 0.5);
  ok('sweltering: no missile/recon/disease', swel.missileMod === 0 && swel.reconMod === 0 && swel.conditionDiseasePctWeek === 0 && swel.temperatureDiseasePctWeek === 0);
  const rainy = A.weatherWarEffects('rainy', 'moderate');
  ok('rainy: −2 missile, −2 recon, 10% wetness disease, ×½ speed', rainy.missileMod === -2 && rainy.reconMod === -2 && rainy.conditionDiseasePctWeek === 10 && rainy.speedMult === 0.5);
  ok('rainy: no supply bump / not doubled', rainy.supplyCostMult === 1 && rainy.outOfSupplyDoubled === false);
  const snowy = A.weatherWarEffects('snowy', 'moderate');
  ok('snowy: −2 missile, 10% wetness disease', snowy.missileMod === -2 && snowy.conditionDiseasePctWeek === 10);
  const stormy = A.weatherWarEffects('stormy', 'moderate');
  ok('stormy: −4 missile, ×¼ speed, recon barrens/desert-only', stormy.missileMod === -4 && stormy.speedMult === 0.25 && stormy.reconBarrensDesertOnly === true);
  const windy = A.weatherWarEffects('windy', 'moderate');
  ok('windy: −2 missile, no disease', windy.missileMod === -2 && windy.conditionDiseasePctWeek === 0);
  const frigid = A.weatherWarEffects('fair', 'frigid');
  ok('frigid: 10% exposure disease, ×½ speed', frigid.temperatureDiseasePctWeek === 10 && frigid.speedMult === 0.5);
  const cold = A.weatherWarEffects('fair', 'cold');
  ok('cold: 5% exposure disease only (no speed)', cold.temperatureDiseasePctWeek === 5 && cold.speedMult === 1 && cold.missileMod === 0);
  const both = A.weatherWarEffects('snowy', 'frigid');
  ok('snowy+frigid: ×¼ speed, BOTH disease causes (10% wetness + 10% exposure)', both.speedMult === 0.25 && both.conditionDiseasePctWeek === 10 && both.temperatureDiseasePctWeek === 10);
  const none = A.weatherWarEffects('fair', 'moderate');
  ok('fair/moderate: all no-op', none.supplyCostMult === 1 && none.outOfSupplyDoubled === false && none.missileMod === 0 && none.speedMult === 1 && none.conditionDiseasePctWeek === 0);
  const unknown = A.weatherWarEffects(null, undefined);
  ok('unknown args: safe defaults (×1, no effect)', unknown.supplyCostMult === 1 && unknown.speedMult === 1 && unknown.missileMod === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
section('armyInSupply — sweltering raises supply cost +25% (RR p.449)');
{
  const { c, ar } = mkArmy();
  const base = A.armyInSupply(c, ar, {});
  ok('base company supply cost = 60gp/wk', base.cost === 60 && base.weatherSupplyMult === 1 && base.outOfSupplyDoubled === false);
  const swel = A.armyInSupply(c, ar, { weather: { condition: 'fair', temperature: 'sweltering' } });
  ok('sweltering cost = ceil(60 × 1.25) = 75gp/wk', swel.cost === 75 && swel.weatherSupplyMult === 1.25);
  ok('sweltering flags out-of-supply penalties doubled', swel.outOfSupplyDoubled === true);
  const rainy = A.armyInSupply(c, ar, { weather: { condition: 'rainy', temperature: 'moderate' } });
  ok('rainy weather does NOT change supply cost (only sweltering does)', rainy.cost === 60 && rainy.weatherSupplyMult === 1 && rainy.outOfSupplyDoubled === false);
  // the +25% can flip affordability: 70gp pays the base 60 but not the sweltering 75.
  const tight = mkArmy({ gp: 70 });
  const tb = A.armyInSupply(tight.c, tight.ar, {});
  const ts = A.armyInSupply(tight.c, tight.ar, { weather: { condition: 'fair', temperature: 'sweltering' } });
  ok('the +25% flips affordability: 70gp pays base 60 (canPay) but not sweltering 75', tb.canPay === true && ts.canPay === false && ts.cost === 75);
}

// ─────────────────────────────────────────────────────────────────────────────
section('applyArmySupplyOutcome — sweltering doubles the out-of-supply penalty (RR p.449)');
{
  const { c, ar } = mkArmy();
  A.applyArmySupplyOutcome(c, ar, { inSupply: false, fraction: 0.6, ord: 40, outOfSupplyDoubled: true });
  const u = A.armyUnits(c, ar)[0];
  const cal = (u.calamities || [])[0];
  ok('out-of-supply calamity recorded with doubled flag + note', cal && cal.kind === 'out-of-supply' && cal.doubled === true && /DOUBLED \(sweltering/.test(cal.note));
  ok('unit set to the RR p.452 ladder state (underfed at ≥½ fed)', u.supplyState === 'underfed');
  // a non-sweltering out-of-supply: no doubling
  const { c: c2, ar: ar2 } = mkArmy();
  A.applyArmySupplyOutcome(c2, ar2, { inSupply: false, fraction: 0.2, ord: 40, outOfSupplyDoubled: false });
  const cal2 = (A.armyUnits(c2, ar2)[0].calamities || [])[0];
  ok('non-sweltering: starving, not doubled, no DOUBLED note', A.armyUnits(c2, ar2)[0].supplyState === 'starving' && cal2.doubled === false && !/DOUBLED/.test(cal2.note));
}

// ─────────────────────────────────────────────────────────────────────────────
section('rollArmyWeatherDisease — the weekly disease check (RR p.449, core RAW)');
{
  const { c, ar } = mkArmy();
  const hit = A.rollArmyWeatherDisease(c, ar, { weather: { condition: 'rainy', temperature: 'frigid' }, rng: () => 0 });
  ok('rng=0 hits both causes (rainy 10% wetness + frigid 10% exposure)', hit.chance && hit.contracted && hit.condHit && hit.tempHit && hit.condPct === 10 && hit.tempPct === 10);
  ok('contracted names both causes', hit.causes.length === 2 && /wetness/.test(hit.causes[0]) && /exposure/.test(hit.causes[1]));
  const miss = A.rollArmyWeatherDisease(c, ar, { weather: { condition: 'rainy', temperature: 'frigid' }, rng: () => 0.99 });
  ok('rng=0.99 misses both — a chance existed but no disease', miss.chance === true && miss.contracted === false);
  // cold 5%: rng 0.04 (<0.05) hits, rng 0.06 misses
  const coldHit = A.rollArmyWeatherDisease(c, ar, { weather: { condition: 'fair', temperature: 'cold' }, rng: () => 0.04 });
  const coldMiss = A.rollArmyWeatherDisease(c, ar, { weather: { condition: 'fair', temperature: 'cold' }, rng: () => 0.06 });
  ok('cold 5% threshold: 4% hits, 6% misses', coldHit.contracted === true && coldHit.tempPct === 5 && coldMiss.contracted === false);
  const none = A.rollArmyWeatherDisease(c, ar, { weather: { condition: 'fair', temperature: 'moderate' }, rng: () => 0 });
  ok('fair/moderate: no disease chance at all (no roll)', none.chance === false && none.contracted === false);
  ok('no opts.weather: no chance', A.rollArmyWeatherDisease(c, ar, {}).chance === false);
  // only one axis: rainy alone (no frigid) — only the wetness cause
  const rainOnly = A.rollArmyWeatherDisease(c, ar, { weather: { condition: 'rainy', temperature: 'moderate' }, rng: () => 0 });
  ok('rainy + moderate: only the wetness cause (no exposure)', rainOnly.contracted && rainOnly.condHit && !rainOnly.tempHit && rainOnly.causes.length === 1);
}

// ─────────────────────────────────────────────────────────────────────────────
section('slot-88 consumer — supply weather note + disease record + cadence');
{
  // sweltering supply: the record carries the +25% + the label says so
  const { c, ar } = mkArmy();
  const res = A.proposeMilitaryDay(c, ctxFor(c, { condition: 'fair', temperature: 'sweltering' }));
  const sup = res.pendingRecords.find(r => r.kind === 'army-supply');
  ok('supply record: weatherSupplyMult 1.25 + out-of-supply doubled', sup && sup.weatherSupplyMult === 1.25 && sup.outOfSupplyDoubled === true);
  ok('supply label names the sweltering +25% and the doubled penalty', /sweltering \+25% supply/.test(sup.label) && /penalties DOUBLED/.test(sup.label));
  // fair weather: no weather note on the supply record
  const fair = A.proposeMilitaryDay(mkArmy().c, ctxFor(mkArmy().c, { condition: 'fair', temperature: 'moderate' }));
  const fsup = fair.pendingRecords.find(r => r.kind === 'army-supply');
  ok('fair weather: supply mult 1, no sweltering note in the label', fsup.weatherSupplyMult === 1 && !/sweltering/.test(fsup.label));
}
{
  // disease record appears on a disease-weather week (rainy) and carries the chance %s
  const { c } = mkArmy();
  const res = A.proposeMilitaryDay(c, ctxFor(c, { condition: 'rainy', temperature: 'frigid' }));
  const dz = res.pendingRecords.find(r => r.kind === 'army-disease');
  ok('disease record present on a rainy+frigid week', !!dz && dz.condPct === 10 && dz.tempPct === 10 && typeof dz.contracted === 'boolean');
  // commit it → the weekly cadence advances; a same-week re-propose makes no new disease record
  A.commitMilitaryRecord(c, dz);
  ok('commit advances lastWeatherDiseaseOrd', c.armies[0].lastWeatherDiseaseOrd === dz.ord);
  c.currentDayInMonth = 13;   // +3 days (< 7)
  const res2 = A.proposeMilitaryDay(c, ctxFor(c, { condition: 'rainy', temperature: 'frigid' }));
  ok('within a week of the last check → no new disease record (weekly cadence)', !res2.pendingRecords.some(r => r.kind === 'army-disease'));
}
{
  // fair weather → no disease record at all (no chance)
  const { c } = mkArmy();
  const res = A.proposeMilitaryDay(c, ctxFor(c, { condition: 'fair', temperature: 'moderate' }));
  ok('fair weather: no disease record', !res.pendingRecords.some(r => r.kind === 'army-disease'));
  // no ctx weather at all → no coupling (no on-demand roll); supply mult stays 1
  const bare = A.proposeMilitaryDay(mkArmy().c, { dayInMonth: 10 });
  ok('no ctx weather: no disease record + supply mult 1', !bare.pendingRecords.some(r => r.kind === 'army-disease') && (bare.pendingRecords.find(r => r.kind === 'army-supply') || {}).weatherSupplyMult === 1);
}
{
  // contracted branch (monkeypatch the roll) → a loud notable with a pause; commit advances cadence
  const { c } = mkArmy();
  const orig = A.rollArmyWeatherDisease;
  A.rollArmyWeatherDisease = () => ({ chance: true, contracted: true, condHit: true, tempHit: false, condPct: 10, tempPct: 0, causes: ['Rainy wetness'], condition: 'rainy', temperature: 'moderate' });
  const res = A.proposeMilitaryDay(c, ctxFor(c, { condition: 'rainy', temperature: 'moderate' }));
  A.rollArmyWeatherDisease = orig;
  const rec = res.pendingRecords.find(r => r.kind === 'army-disease');
  const note = res.notableEvents.find(e => e.kind === 'army-disease');
  ok('contracted: record marked contracted, label names the epidemic', rec && rec.contracted === true && /disease breaks out/.test(rec.label));
  ok('contracted: a notable rides with pauseTrigger encounter + a Death-save instruction', note && note.pauseTrigger === 'encounter' && /Death save/.test(note.label) && note.payload.contracted === true);
}
{
  // miss branch (monkeypatch) → a quiet record carries the cadence, NO notable emitted
  const { c } = mkArmy();
  const orig = A.rollArmyWeatherDisease;
  A.rollArmyWeatherDisease = () => ({ chance: true, contracted: false, condPct: 10, tempPct: 10, causes: [] });
  const res = A.proposeMilitaryDay(c, ctxFor(c, { condition: 'rainy', temperature: 'frigid' }));
  A.rollArmyWeatherDisease = orig;
  const rec = res.pendingRecords.find(r => r.kind === 'army-disease');
  ok('miss: a quiet record carries the cadence (no disease)', rec && rec.contracted === false && /no disease this week/.test(rec.label));
  ok('miss: NO army-disease notable emitted', !res.notableEvents.some(e => e.kind === 'army-disease'));
}

// ─────────────────────────────────────────────────────────────────────────────
section('events — army-disease is a registered, record-only, non-wizard kind');
{
  ok('army-disease is a known event kind', A.isEventKindKnown('army-disease'));
  ok('army-disease is NOT wizard-emittable (auto-rolled)', A.isWizardEmittable('army-disease') === false);
}

// ─────────────────────────────────────────────────────────────────────────────
section('battle — RR p.449 missile penalty on missile attack throws (both sides, not melee)');
function mkBowBattle(weather){
  const c = A.migrateCampaign(A.blankCampaign({ name: 'wx' }));
  c.currentTurn = 1; c.currentDayInMonth = 1; c.hexes = [ A.blankHex({ id: 'hex-f', coord: { q: 0, r: 0 }, terrain: 'grassland' }) ];
  if(weather){ c._weatherByRegion = { [A.regionKeyForCoord({ q: 0, r: 0 })]: weather }; }
  const ruler = A.blankCharacter({ id: 'r', name: 'R', level: 8, abilities: { STR: 10, INT: 10, WIL: 10, DEX: 10, CON: 10, CHA: 10 } }); c.characters = [ruler];
  const d = A.blankDomain({ name: 'M' }); d.rulerCharacterId = 'r'; c.domains = [d];
  c.units = [ A.blankUnit({ brPerSoldier: 0, id: 'unit-bow', unitTypeKey: 'bowman', race: 'man', count: 120, stationedAt: { kind: 'domain-garrison', id: d.id } }) ];
  c.groups = [ A.blankGroup({ id: 'grp-w', name: 'Wolves', groupTemplate: { monsterCatalogKey: 'common-wolf', creatureTypes: ['animal'], hitDice: '2+2' }, count: 120, currentHexId: 'hex-f' }) ];
  const b = A.createBattle(c, { hexId: 'hex-f', scale: 'platoon', awareness: 'mutual',
    sideA: { kind: 'garrison', domainId: d.id, stance: 'offensive' },
    sideB: { kind: 'groups', groupIds: ['grp-w'], stance: 'defensive' } });
  A.beginBattle(c, b.id);
  b.sides.a.units.forEach(u => { u.zone = 'right'; });   // pair 0: a.right vs b.left
  b.sides.b.units.forEach(u => { u.zone = 'left'; });
  return { c, b };
}
// the bow's missile throw line (after a "Missile Phase:" header, before the next Phase header)
function missileLine(rec){
  for(let i = 0; i < rec.lines.length; i++){
    if(/Missile Phase:/.test(rec.lines[i])){
      for(let j = i + 1; j < rec.lines.length && !/Phase:/.test(rec.lines[j]); j++){
        if(/throw\(s\) @ 17\+/.test(rec.lines[j])) return rec.lines[j];
      }
    }
  }
  return null;
}
{
  // FAIR: at a flat d20=17, missile target is 17+ → all the bow's throws HIT; no weather line.
  const fair = mkBowBattle(null);
  const recF = A.runBattleTurn(fair.c, fair.b.id, { rng: seq([d20v(17)]) });
  const mlF = missileLine(recF);
  ok('fair: no weather line in the turn log', !recF.lines.some(l => /to missile attack throws \(RR p\.449\)/.test(l)));
  ok('fair: the bow\'s missile throws at 17+ with no −2, and (17 ≥ 17) they HIT', mlF && /@ 17\+(?! -)/.test(mlF) && /→ [1-9]\d* hit/.test(mlF));
}
{
  // RAINY: the same flat d20=17 → 17 − 2 = 15 < 17 → the bow's missile throws MISS.
  const rain = mkBowBattle({ condition: 'rainy', temperature: 'moderate' });
  const recR = A.runBattleTurn(rain.c, rain.b.id, { rng: seq([d20v(17)]) });
  ok('rainy: the turn log carries the weather line (Rainy −2 to missile attack throws)', recR.lines.some(l => /Rainy/.test(l) && /-2 to missile attack throws \(RR p\.449\)/.test(l)));
  const mlR = missileLine(recR);
  ok('rainy: the bow\'s missile throws show @ 17+ -2', mlR && /@ 17\+ -2/.test(mlR));
  ok('rainy: the −2 flips the 17s from hit to MISS → 0 hits', mlR && /→ 0 hit/.test(mlR));
}
{
  // STORMY: −4 missile; and confirm the penalty does NOT touch the melee phase (melee target 16+,
  // d20=17 still hits in melee under stormy).
  const storm = mkBowBattle({ condition: 'stormy', temperature: 'moderate' });
  const recS = A.runBattleTurn(storm.c, storm.b.id, { rng: seq([d20v(17)]) });
  ok('stormy: weather line shows −4 to missile', recS.lines.some(l => /-4 to missile attack throws/.test(l)));
  const meleeHit = recS.lines.some(l => /Melee Phase/.test(l)) && recS.lines.some(l => /@ 16\+(?! -)/.test(l) && /→ [1-9]\d* hit/.test(l));
  ok('stormy: melee throws (16+) are unaffected by the missile penalty — still hit at d20=17', meleeHit);
}
{
  // gm-set-weather: with no committed weather and the GM hand-setting, the battle does NOT
  // on-demand roll → no phantom missile penalty.
  const c = A.migrateCampaign(A.blankCampaign({ name: 'gmw' }));
  c.houseRules = c.houseRules || {}; c.houseRules['gm-set-weather'] = { enabled: true };
  c.currentTurn = 1; c.currentDayInMonth = 1; c.hexes = [ A.blankHex({ id: 'hex-f', coord: { q: 0, r: 0 }, terrain: 'grassland' }) ];
  const ruler = A.blankCharacter({ id: 'r', name: 'R', level: 8 }); c.characters = [ruler];
  const d = A.blankDomain({ name: 'M' }); d.rulerCharacterId = 'r'; c.domains = [d];
  c.units = [ A.blankUnit({ brPerSoldier: 0, id: 'unit-bow', unitTypeKey: 'bowman', race: 'man', count: 120, stationedAt: { kind: 'domain-garrison', id: d.id } }) ];
  c.groups = [ A.blankGroup({ id: 'grp-w', name: 'Wolves', groupTemplate: { monsterCatalogKey: 'common-wolf', creatureTypes: ['animal'], hitDice: '2+2' }, count: 120, currentHexId: 'hex-f' }) ];
  const b = A.createBattle(c, { hexId: 'hex-f', scale: 'platoon', awareness: 'mutual', sideA: { kind: 'garrison', domainId: d.id, stance: 'offensive' }, sideB: { kind: 'groups', groupIds: ['grp-w'], stance: 'defensive' } });
  A.beginBattle(c, b.id);
  const rec = A.runBattleTurn(c, b.id, { rng: seq([d20v(17)]) });
  ok('gm-set-weather + no committed weather: no phantom weather line', !rec.lines.some(l => /to missile attack throws \(RR p\.449\)/.test(l)));
}

// ─────────────────────────────────────────────────────────────────────────────
section('armyReconRoll — RR p.449 weather hampers the OBSERVING army\'s scouting');
{
  // rainy/snowy −2 anywhere; the seeded 2d6 roll (4+4=8) is unchanged by adding the mod.
  const { c, obs, opp } = mkTwoArmies();
  const fair  = A.armyReconRoll(c, obs, opp, { rng: seq([d6v(4), d6v(4)]), obsHexId: 'obs', oppHexId: 'opp' });
  const rainy = A.armyReconRoll(c, obs, opp, { rng: seq([d6v(4), d6v(4)]), obsHexId: 'obs', oppHexId: 'opp', weather: { condition: 'rainy', temperature: 'moderate' } });
  ok('fair: no weather recon mod', reconWeatherMod(fair) === 0);
  ok('rainy: −2 recon mod with a "Rainy weather" label', reconWeatherMod(rainy) === -2 && /Rainy weather/.test(rainy.mods.find(m => /weather/.test(m.label)).label));
  ok('the seeded 2d6 roll is unchanged by adding the mod (4+4=8)', fair.roll === 8 && rainy.roll === 8);
  ok('rainy total = fair total − 2 (the weather mod is the only delta)', rainy.total === fair.total - 2);
  const snowy = A.armyReconRoll(c, obs, opp, { rng: seq([d6v(4), d6v(4)]), obsHexId: 'obs', oppHexId: 'opp', weather: { condition: 'snowy', temperature: 'frigid' } });
  ok('snowy −2 recon (the temperature axis adds no recon mod)', reconWeatherMod(snowy) === -2);
}
{
  // windy/stormy −4 — but ONLY in barrens/desert (the gate reads the OBSERVER's hex).
  const grass = mkTwoArmies({ obsTerrain: 'grassland' });
  const inGrass = A.armyReconRoll(grass.c, grass.obs, grass.opp, { rng: seq([d6v(4), d6v(4)]), obsHexId: 'obs', oppHexId: 'opp', weather: { condition: 'stormy', temperature: 'moderate' } });
  ok('stormy in grassland: NO recon mod (gated to barrens/desert)', reconWeatherMod(inGrass) === 0);
  const desert = mkTwoArmies({ obsTerrain: 'desert' });
  const inDesert = A.armyReconRoll(desert.c, desert.obs, desert.opp, { rng: seq([d6v(4), d6v(4)]), obsHexId: 'obs', oppHexId: 'opp', weather: { condition: 'stormy', temperature: 'moderate' } });
  const dm = inDesert.mods.find(m => /weather/.test(m.label));
  ok('stormy in desert: −4 recon mod, labelled (barrens/desert)', dm && dm.value === -4 && /\(barrens\/desert\)/.test(dm.label));
  const barrens = mkTwoArmies({ obsTerrain: 'barrens' });
  const inBarrens = A.armyReconRoll(barrens.c, barrens.obs, barrens.opp, { rng: seq([d6v(4), d6v(4)]), obsHexId: 'obs', oppHexId: 'opp', weather: { condition: 'windy', temperature: 'moderate' } });
  ok('windy in barrens: −4 recon mod', reconWeatherMod(inBarrens) === -4);
  // the gate reads the OBSERVER's hex, not the opposing army's
  const split = mkTwoArmies({ obsTerrain: 'grassland', oppTerrain: 'desert' });
  const r2 = A.armyReconRoll(split.c, split.obs, split.opp, { rng: seq([d6v(4), d6v(4)]), obsHexId: 'obs', oppHexId: 'opp', weather: { condition: 'windy', temperature: 'moderate' } });
  ok('the barrens/desert gate reads the OBSERVER hex (grassland obs vs desert opp → no mod)', reconWeatherMod(r2) === 0);
  // sub-typed desert still resolves to base 'desert' through the gate
  const subDesert = mkTwoArmies(); subDesert.c.hexes[0].terrainSubtype = 'sandy';
  const sd = A.armyReconRoll(subDesert.c, subDesert.obs, subDesert.opp, { rng: seq([d6v(4), d6v(4)]), obsHexId: 'obs', oppHexId: 'opp', weather: { condition: 'stormy', temperature: 'moderate' } });
  // (obsTerrain default = grassland here, so no mod — sanity that a non-desert sub-type stays gated)
  ok('a grassland obs with a stray sub-type stays gated under stormy', reconWeatherMod(sd) === 0);
}

// ─────────────────────────────────────────────────────────────────────────────
section('slot-88 consumer — the recon penalty threads through the observing army (RR p.449)');
{
  // two opposing armies in recon range; a rainy day → the army-day recon record carries the mod.
  const { c } = mkTwoArmies();
  const res = A.proposeMilitaryDay(c, { dayInMonth: 10, weather: { condition: 'rainy', temperature: 'moderate' } });
  const dayRecs = res.pendingRecords.filter(r => r.kind === 'army-day');
  ok('army-day recon records produced (both armies are in range)', dayRecs.length >= 1);
  const got = dayRecs.some(r => (r.recons || []).some(rc => (rc.recon.mods || []).some(m => /Rainy weather/.test(m.label) && m.value === -2)));
  ok('a recon record carries the Rainy −2 mod (the consumer threads the observer\'s weather)', got);
  // fair weather: no recon weather mod anywhere
  const fair = A.proposeMilitaryDay(mkTwoArmies().c, { dayInMonth: 10, weather: { condition: 'fair', temperature: 'moderate' } });
  ok('fair weather: no recon weather mod in any record', fair.pendingRecords.filter(r => r.kind === 'army-day').every(r => !hasReconWeatherMod(r)));
  // no ctx weather at all: no on-demand roll → no recon weather mod
  const bare = A.proposeMilitaryDay(mkTwoArmies().c, { dayInMonth: 10 });
  ok('no ctx weather: no recon weather mod (no on-demand roll)', bare.pendingRecords.filter(r => r.kind === 'army-day').every(r => !hasReconWeatherMod(r)));
}

// ─────────────────────────────────────────────────────────────────────────────
if(fail){ console.log('\nFAILURES:\n  ' + failures.join('\n  ')); }
console.log((fail ? 'FAIL' : 'PASS') + ' — weather-war.smoke.js: ' + pass + ' passed, ' + fail + ' failed.');
process.exit(fail ? 1 : 0);
