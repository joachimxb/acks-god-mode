/* tests/weather.smoke.js — Phase 2.5 Weather HW-1 + HW-2 + HW-3
 * (Phase_2.5_Hex_Scales_and_Weather_Plan.md §3 + §6 + §7).
 *
 *   node tests/weather.smoke.js   (or via `npm test`)
 *
 * HW-1: WEATHER_BY_CLIMATE_SEASON (JJ p.41, 30×4) + DAILY_WEATHER_TABLE (JJ p.40) +
 *   rollDailyWeather (3×2d6 + the weather-front shift + the §3.3 interactions) +
 *   WEATHER_GAMEPLAY_FLAGS + the region-key helpers + weatherConditionEffects.
 * HW-2: the slot-1 day-tick weather consumer — rolls per region/day, stamps the
 *   journey day record, deterministic by fingerprint, transient cache on commit,
 *   gm-set-weather skips generation, multi-region correctness (the subsystems touch).
 * HW-3 map helpers (weatherForHex / weatherMapForCampaign / weatherFillColor / legend).
 *
 * The "JJ worked examples" are computed BY HAND from the published tables (a real
 * RAW-fidelity check, not a tautology): a Cfa spring roll, the cold→Snowy / cold→Flurry
 * / still→Foggy / still→Misty interactions, and the fast-travel climate-changed re-roll.
 */
'use strict';
require('./_engine.js').load();
const ACKS = global.ACKS;

let pass = 0, fail = 0; const failures = [];
function ok(label, cond, detail) { if (cond) { pass++; } else { fail++; failures.push(label); console.log('  FAIL ' + label + (detail ? ' — ' + detail : '')); } }
function section(t) { console.log('\n— ' + t); }
// A deterministic rng. const(x) → every roll the same; seq([...]) → a fixed sequence (cycling).
function constRng(x) { return () => x; }
function seqRng(vals) { let i = 0; return () => vals[(i++) % vals.length]; }
// 2d6 helpers for documenting expected rolls: const(0.5)→8, const(0.95)→12, const(0.05)→2.

// =============================================================================
section('HW-1 catalogs — completeness (30 Köppen × 4 seasons; the JJ p.40 roll table)');
{
  const W = ACKS.WEATHER_BY_CLIMATE_SEASON;
  const codes = Object.keys(W);
  ok('30 climate codes', codes.length === 30, 'got ' + codes.length);
  // the 30 codes match KOPPEN_CLIMATE exactly (the shipped climate input)
  const kopp = Object.keys(ACKS.KOPPEN_CLIMATE);
  ok('codes match KOPPEN_CLIMATE', codes.length === kopp.length && codes.every(c => kopp.indexOf(c) >= 0));
  const SEASONS = ['winter', 'spring', 'summer', 'fall'];
  let everySeason = true, everyField = true;
  codes.forEach(c => {
    SEASONS.forEach(s => {
      const cell = W[c] && W[c][s];
      if (!cell) { everySeason = false; return; }
      ['td', 'tn', 'p', 'w'].forEach(f => { if (typeof cell[f] !== 'number') everyField = false; });
    });
  });
  ok('every code has all 4 seasons', everySeason);
  ok('every season cell has numeric td/tn/p/w', everyField);
  // pin a few transcribed cells against the plan §3.2(a)
  ok('Cfa spring = +2/+0,−2,+0', W.Cfa.spring.td === 2 && W.Cfa.spring.tn === 0 && W.Cfa.spring.p === -2 && W.Cfa.spring.w === 0);
  ok('EF winter = −11/−11,−5,−2', W.EF.winter.td === -11 && W.EF.winter.tn === -11 && W.EF.winter.p === -5 && W.EF.winter.w === -2);
  ok('BWh summer = +7/+2,−5,+0', W.BWh.summer.td === 7 && W.BWh.summer.tn === 2 && W.BWh.summer.p === -5 && W.BWh.summer.w === 0);
  ok('Am summer = +6/+0,+4,+0', W.Am.summer.td === 6 && W.Am.summer.tn === 0 && W.Am.summer.p === 4 && W.Am.summer.w === 0);

  const T = ACKS.DAILY_WEATHER_TABLE;
  let allMods = true;
  for (let i = -7; i <= 19; i++) { if (!T[String(i)]) allMods = false; }
  ok('DAILY_WEATHER_TABLE has all mods −7..19', allMods);
  ok('idx −7 col1 = Frigid ≤−75', T['-7'].tempCol1.band === 'Frigid' && T['-7'].tempCol1.hi === -75 && T['-7'].tempCol1.lo === null);
  ok('idx 12 col1 = Balmy 69–72', T['12'].tempCol1.band === 'Balmy' && T['12'].tempCol1.lo === 69 && T['12'].tempCol1.hi === 72);
  ok('idx 19 col2 = Sweltering ≥121', T['19'].tempCol2.band === 'Sweltering' && T['19'].tempCol2.lo === 121 && T['19'].tempCol2.hi === null);
  ok('idx 13 col1 is null (— in the table)', T['13'].tempCol1 === null);
  ok('idx 7 precip = Drizzly, idx 10 = Rainy, idx −7 = Sunbaked, idx 0 = Clear', T['7'].precip === 'Drizzly' && T['10'].precip === 'Rainy' && T['-7'].precip === 'Sunbaked' && T['0'].precip === 'Clear');
  ok('idx 4 wind = Still, 12 = Windy, 14 = Stormy', T['4'].wind === 'Still' && T['12'].wind === 'Windy' && T['14'].wind === 'Stormy');

  const F = ACKS.WEATHER_GAMEPLAY_FLAGS;
  ok('gameplay flags name the bolded extremes', F.temperature.indexOf('Frigid') >= 0 && F.temperature.indexOf('Sweltering') >= 0
    && F.precipitation.indexOf('Rainy') >= 0 && F.precipitation.indexOf('Snowy') >= 0 && F.precipitation.indexOf('Foggy') >= 0
    && F.wind.indexOf('Windy') >= 0 && F.wind.indexOf('Stormy') >= 0);
}

// =============================================================================
section('HW-1 — JJ worked examples (computed by hand from the tables)');
{
  // Cfa spring, rolls 8/8/8 (rng const 0.5). mods td+2 tn+0 p−2 w+0.
  //   day temp idx 8+2=10 col2 → Warm 83–86 ; night idx 8+0=8 col1 → Chilly 51–55
  //   precip idx 8−2=6 → Overcast ; wind idx 8 → Moderate ; no interactions
  const r = ACKS.rollDailyWeather('Cfa', 'spring', { rng: constRng(0.5) });
  ok('Cfa spring 8/8/8 → Warm day', r.temperature === 'Warm' && r.temperatureF[0] === 83 && r.temperatureF[1] === 86);
  ok('Cfa spring 8/8/8 → Chilly night', r.nightTemperature === 'Chilly' && r.nightTemperatureF[0] === 51 && r.nightTemperatureF[1] === 55);
  ok('Cfa spring 8/8/8 → Overcast precip', r.precipitation === 'Overcast');
  ok('Cfa spring 8/8/8 → Moderate wind', r.wind === 'Moderate');
  ok('Cfa spring 8/8/8 → condition fair, band moderate, no prevailing', r.condition === 'fair' && r.temperatureBand === 'moderate' && r.prevailing.length === 0);
  ok('Cfa spring 8/8/8 → mods recorded', r.mods.tempDay === 2 && r.mods.tempNight === 0 && r.mods.precip === -2 && r.mods.wind === 0);

  // fast-travel / climate-changed re-roll (§3.3 rule 4): SAME climate + SAME seed → identical;
  // a DIFFERENT climate (rain shadow crossed) → a different result.
  const a1 = ACKS.rollDailyWeather('Cfa', 'spring', { rng: constRng(0.5) });
  const a2 = ACKS.rollDailyWeather('Cfa', 'spring', { rng: constRng(0.5) });
  ok('same climate + same rng → identical (no re-roll)', JSON.stringify(a1) === JSON.stringify(a2));
  const b = ACKS.rollDailyWeather('BWh', 'spring', { rng: constRng(0.5) });
  ok('climate changed (Cfa→BWh) → different weather (the re-roll)', JSON.stringify(a1) !== JSON.stringify(b));
}

// =============================================================================
section('HW-1 — §3.3 interaction rules');
{
  // cold + Drizzly → Flurry. EF winter (td−11), rolls 12/12/12 (rng 0.95).
  //   day idx 12−11=1 col1 → Frigid ; precip idx 12−5=7 → Drizzly → (frigid) Flurry
  const ef = ACKS.rollDailyWeather('EF', 'winter', { rng: constRng(0.95) });
  ok('cold + Drizzly → Flurry (EF winter)', ef.temperature === 'Frigid' && ef.precipitation === 'Flurry');
  ok('Flurry is prevailing; Frigid is prevailing', ef.prevailing.indexOf('Flurry') >= 0 && ef.prevailing.indexOf('Frigid') >= 0);

  // cold + Rainy → Snowy + Stormy. ET winter (td−8, p−2, w+2), rolls 12/12/12.
  //   day idx 12−8=4 col1 → Cold ; precip idx 12−2=10 → Rainy → (cold) Snowy ; wind idx 12+2=14 → Stormy
  const et = ACKS.rollDailyWeather('ET', 'winter', { rng: constRng(0.95) });
  ok('cold + Rainy → Snowy (ET winter)', et.temperature === 'Cold' && et.precipitation === 'Snowy');
  ok('ET winter → Stormy wind + condition snowy', et.wind === 'Stormy' && et.condition === 'snowy');
  ok('ET winter prevailing = Snowy + Stormy', et.prevailing.indexOf('Snowy') >= 0 && et.prevailing.indexOf('Stormy') >= 0);

  // still + Drizzly → Misty (no game effect). Am summer (td+6, p+4, w+0); temp=8, precip=4, wind=2.
  //   day idx 8+6=14 col2 → Sweltering (warm, not cold) ; precip idx 4+4=8 → Drizzly ; wind idx 2 → Still → Misty
  const misty = ACKS.rollDailyWeather('Am', 'summer', { rng: seqRng([0.5, 0.5, 0.3, 0.3, 0.05, 0.05]) });
  ok('still + Drizzly → Misty (Am summer)', misty.wind === 'Still' && misty.precipitation === 'Misty');
  ok('Misty is NOT prevailing (no game effect)', misty.prevailing.indexOf('Misty') < 0 && misty.condition === 'fair');

  // still + Rainy → Foggy. Am summer; temp=8, precip=6, wind=2.
  //   precip idx 6+4=10 → Rainy ; wind Still → Foggy
  const foggy = ACKS.rollDailyWeather('Am', 'summer', { rng: seqRng([0.5, 0.5, 0.4, 0.4, 0.05, 0.05]) });
  ok('still + Rainy → Foggy (Am summer)', foggy.wind === 'Still' && foggy.precipitation === 'Foggy');
  ok('Foggy is prevailing + condition foggy', foggy.prevailing.indexOf('Foggy') >= 0 && foggy.condition === 'foggy');
}

// =============================================================================
section('HW-1 — weather-front shift (§3.3 rule 3)');
{
  // priorRoll 12 > raw 8 → shift +1 → 9 ; priorRoll 2 < raw 8 → shift −1 → 7.
  const up = ACKS.rollDailyWeather('Cfb', 'summer', { rng: constRng(0.5), priorResult: { rolls: { tempRoll: 12, precipRoll: 12, windRoll: 12 } } });
  ok('front shifts the raw 8 +1 toward a prior 12', up.rolls.tempRoll === 9 && up.rolls.precipRoll === 9 && up.rolls.windRoll === 9);
  const down = ACKS.rollDailyWeather('Cfb', 'summer', { rng: constRng(0.5), priorResult: { rolls: { tempRoll: 2, precipRoll: 2, windRoll: 2 } } });
  ok('front shifts the raw 8 −1 toward a prior 2', down.rolls.tempRoll === 7);
  // an unmodified raw 2 or 12 does NOT shift.
  const lock2 = ACKS.rollDailyWeather('Cfb', 'summer', { rng: constRng(0.05), priorResult: { rolls: { tempRoll: 12, precipRoll: 12, windRoll: 12 } } });
  ok('raw 2 does not shift (locked extreme)', lock2.rolls.tempRoll === 2);
  const lock12 = ACKS.rollDailyWeather('Cfb', 'summer', { rng: constRng(0.95), priorResult: { rolls: { tempRoll: 2, precipRoll: 2, windRoll: 2 } } });
  ok('raw 12 does not shift (locked extreme)', lock12.rolls.tempRoll === 12);
  const noprior = ACKS.rollDailyWeather('Cfb', 'summer', { rng: constRng(0.5) });
  ok('no prior → no shift (raw 8 stays 8)', noprior.rolls.tempRoll === 8);
}

// =============================================================================
section('HW-1 — season normalization + default climate');
{
  // the default calendar names autumn 'autumn'; the table is 'fall' — they must agree.
  const autumn = ACKS.rollDailyWeather('Cfa', 'autumn', { rng: constRng(0.5) });
  const fall = ACKS.rollDailyWeather('Cfa', 'fall', { rng: constRng(0.5) });
  ok("season 'autumn' normalizes to 'fall'", JSON.stringify(autumn) === JSON.stringify(fall) && autumn.season === 'fall');
  // an absent / unknown climate falls back to the temperate default (so weather still rolls).
  const unset = ACKS.rollDailyWeather('', 'spring', { rng: constRng(0.5) });
  ok('empty koppen → DEFAULT_WEATHER_KOPPEN', unset.climate === ACKS.DEFAULT_WEATHER_KOPPEN);
  const bogus = ACKS.rollDailyWeather('Zz9', 'spring', { rng: constRng(0.5) });
  ok('unknown koppen → default', bogus.climate === ACKS.DEFAULT_WEATHER_KOPPEN);
}

// =============================================================================
section('HW-1 — region key (cube/4 round; §5.2/§5.3)');
{
  ok('{0,0} → R0,0', ACKS.regionKeyForCoord({ q: 0, r: 0 }) === 'R0,0');
  // adjacent 6-mile hexes share a 24-mile region
  ok('{2,1} and {3,1} share a region', ACKS.regionKeyForCoord({ q: 2, r: 1 }) === ACKS.regionKeyForCoord({ q: 3, r: 1 }));
  // 8 hexes apart → a different region
  ok('{0,0} and {8,0} are different regions', ACKS.regionKeyForCoord({ q: 0, r: 0 }) !== ACKS.regionKeyForCoord({ q: 8, r: 0 }));
  ok('{8,0} → R2,0', ACKS.regionKeyForCoord({ q: 8, r: 0 }) === 'R2,0');
  ok('null coord → null', ACKS.regionKeyForCoord(null) === null);
  const p = ACKS.hexParentCoord({ q: 8, r: 0 });
  ok('hexParentCoord is a valid {q,r}', typeof p.q === 'number' && typeof p.r === 'number');
}

// =============================================================================
section('HW-1 — weatherConditionEffects (RR p.277 reconciliation)');
{
  const snowy = ACKS.weatherConditionEffects({ condition: 'snowy', temperatureBand: 'cold', precipitation: 'Snowy', wind: 'Strong', prevailing: ['Snowy'] });
  ok('snowy → ×½ speed', Math.abs(snowy.speedMultiplier - 0.5) < 1e-9);
  const swelt = ACKS.weatherConditionEffects({ condition: 'fair', temperatureBand: 'sweltering', precipitation: 'Clear', wind: 'Gentle', prevailing: ['Sweltering'] });
  ok('sweltering → ×½ speed, ×2 dehydration, +25% water', Math.abs(swelt.speedMultiplier - 0.5) < 1e-9 && swelt.dehydrationX === 2 && swelt.waterUsePct === 25);
  const fog = ACKS.weatherConditionEffects({ condition: 'foggy', temperatureBand: 'moderate', precipitation: 'Foggy', wind: 'Still', prevailing: ['Foggy'] });
  ok('foggy → 20ft visibility, −4 nav, ×½ speed', fog.visibilityFt === 20 && fog.navPenalty === -4 && Math.abs(fog.speedMultiplier - 0.5) < 1e-9);
  const windy = ACKS.weatherConditionEffects({ condition: 'windy', temperatureBand: 'moderate', precipitation: 'Clear', wind: 'Windy', prevailing: ['Windy'] });
  ok('windy → missile −2, no base-speed change', windy.missilePenalty === -2 && Math.abs(windy.speedMultiplier - 1) < 1e-9);
  ok("windy enum is in JOURNEY_WEATHER_SPEED (×1)", ACKS.JOURNEY_WEATHER_SPEED.windy === 1);
}

// =============================================================================
// Shared fixture for the HW-2 consumer tests.
function mkCampaign(opts) {
  opts = opts || {};
  return {
    schemaVersion: 2, kind: 'campaign', id: 'cmp-w', currentTurn: 1, currentDayInMonth: 1,
    calendar: { year: 1, month: 4, day: 1, season: 'spring' },
    houseRules: opts.houseRules || {},
    characters: [{ id: 'chr-1', name: 'Scout', schemaVersion: 2 }, { id: 'chr-2', name: 'Ranger', schemaVersion: 2 }],
    hexes: [
      { id: 'hex-a', coord: { q: 0, r: 0 }, terrain: 'grassland', koppen: 'Cfa' },
      { id: 'hex-b', coord: { q: 1, r: 0 }, terrain: 'grassland', koppen: 'Cfa' },
      { id: 'hex-c', coord: { q: 8, r: 0 }, terrain: 'barrens', koppen: 'EF' },
      { id: 'hex-d', coord: { q: 9, r: 0 }, terrain: 'barrens', koppen: 'EF' }
    ],
    journeys: opts.journeys || [],
    domains: [], settlements: [], rumors: [], eventLog: []
  };
}
function mkJourney(id, startHexId, routeCoords) {
  return {
    id: id, status: 'in-transit', participantCharacterIds: [id === 'jrn-1' ? 'chr-1' : 'chr-2'],
    startHexId: startHexId, currentHexId: startHexId, currentDayIndex: 0, pace: 'normal',
    routeCoords: routeCoords, supplies: { rations: 30, waterRations: 30 }, dayRecords: []
  };
}

section('HW-2 — the consumer stamps the journey day record (rolledOrSet "rolled")');
{
  const camp = mkCampaign({ journeys: [mkJourney('jrn-1', 'hex-a', [{ q: 0, r: 0 }, { q: 1, r: 0 }])] });
  const prop = ACKS.proposeDayTick(camp, 1, {});
  const wRec = prop.pendingRecords.filter(r => r.consumer === 'weather');
  ok('weather consumer produced 1 record', wRec.length === 1);
  ok('weather record carries a region key + result', wRec[0] && wRec[0].regionKey === 'R0,0' && wRec[0].weather && wRec[0].weather.condition);
  const jRec = prop.pendingRecords.find(r => r.consumer === 'journeys');
  ok('journey day record exists', !!(jRec && jRec.dayRecord));
  ok('journey day record weather is rolled (not gm-fiat)', jRec.dayRecord.weather && jRec.dayRecord.weather.rolledOrSet === 'rolled');
  ok('journey day record condition is a JOURNEY_WEATHER_SPEED key', ACKS.JOURNEY_WEATHER_SPEED[jRec.dayRecord.weather.condition] != null);
}

section('HW-2 — deterministic by fingerprint (re-opening reproduces the same weather)');
{
  const camp = mkCampaign({ journeys: [mkJourney('jrn-1', 'hex-a', [{ q: 0, r: 0 }, { q: 1, r: 0 }])] });
  const p1 = ACKS.proposeDayTick(camp, 1, {});
  const p2 = ACKS.proposeDayTick(camp, 1, {});
  const w1 = p1.pendingRecords.find(r => r.consumer === 'weather').weather;
  const w2 = p2.pendingRecords.find(r => r.consumer === 'weather').weather;
  ok('re-propose from the same state → identical weather', JSON.stringify(w1) === JSON.stringify(w2));
  // a different world day → a (potentially) different roll, but still deterministic
  camp.currentDayInMonth = 5; camp.calendar.day = 5;
  const p3a = ACKS.proposeDayTick(camp, 1, {});
  const p3b = ACKS.proposeDayTick(camp, 1, {});
  ok('a later day is itself deterministic', JSON.stringify(p3a.pendingRecords.find(r => r.consumer === 'weather').weather) === JSON.stringify(p3b.pendingRecords.find(r => r.consumer === 'weather').weather));
}

section('HW-2 — commit writes the transient cache + advances the clock');
{
  const camp = mkCampaign({ journeys: [mkJourney('jrn-1', 'hex-a', [{ q: 0, r: 0 }, { q: 1, r: 0 }])] });
  const prop = ACKS.proposeDayTick(camp, 1, {});
  ACKS.commitDayTick(camp, prop);
  ok('_weatherByRegion cached after commit', camp._weatherByRegion && camp._weatherByRegion['R0,0'] && camp._weatherByRegion['R0,0'].condition);
  ok('day clock advanced to 2', camp.currentDayInMonth === 2);
}

section('HW-2 — gm-set-weather (the §6.5 opt-out) skips generation');
{
  const off = mkCampaign({ journeys: [mkJourney('jrn-1', 'hex-a', [{ q: 0, r: 0 }, { q: 1, r: 0 }])] });
  ok('default (rule off) → weather rolls', ACKS.proposeDayTick(off, 1, {}).pendingRecords.some(r => r.consumer === 'weather'));
  const on = mkCampaign({ houseRules: { 'gm-set-weather': true }, journeys: [mkJourney('jrn-1', 'hex-a', [{ q: 0, r: 0 }, { q: 1, r: 0 }])] });
  ok('gm-set-weather ON → no weather records', !ACKS.proposeDayTick(on, 1, {}).pendingRecords.some(r => r.consumer === 'weather'));
  ok('gm-set-weather registered (category world, default off)', !!ACKS.lookupHouseRule('gm-set-weather') && ACKS.lookupHouseRule('gm-set-weather').category === 'world' && !ACKS.isHouseRuleEnabled(mkCampaign({}), 'gm-set-weather'));
}

section('HW-2 — weather rolls only on an expedition; multi-region is per-region');
{
  const none = mkCampaign({ journeys: [] });
  ok('no journey in flight → no weather records', !ACKS.proposeDayTick(none, 1, {}).pendingRecords.some(r => r.consumer === 'weather'));

  // two journeys in two DIFFERENT regions (R0,0 Cfa vs R2,0 EF). Each journey's day record
  // must carry ITS OWN region's weather — the region-aware ctx.weatherByRegion read.
  const multi = mkCampaign({ journeys: [
    mkJourney('jrn-1', 'hex-a', [{ q: 0, r: 0 }, { q: 1, r: 0 }]),   // R0,0 — Cfa
    mkJourney('jrn-2', 'hex-c', [{ q: 8, r: 0 }, { q: 9, r: 0 }])    // R2,0 — EF (polar, always Frigid)
  ] });
  const prop = ACKS.proposeDayTick(multi, 1, {});
  const wRecs = prop.pendingRecords.filter(r => r.consumer === 'weather');
  ok('two distinct regions rolled', wRecs.length === 2 && wRecs.some(r => r.regionKey === 'R0,0') && wRecs.some(r => r.regionKey === 'R2,0'));
  const jr = {};
  prop.pendingRecords.filter(r => r.consumer === 'journeys').forEach(r => { jr[r.journeyId || (r.dayRecord && r.record && r.record.journeyId)] = r; });
  // map each journey record by its journeyId off the day record
  const byJourney = {};
  prop.pendingRecords.filter(r => r.consumer === 'journeys' && r.dayRecord).forEach(r => { byJourney[r.journeyId] = r.dayRecord; });
  const j1 = byJourney['jrn-1'], j2 = byJourney['jrn-2'];
  ok('both journeys produced day records', !!j1 && !!j2);
  // the EF (polar) journey is Frigid; the Cfa journey is not — proves region-aware stamping
  ok('the polar-region journey is frigid', j2.weather.temperature === 'frigid');
  ok('the temperate-region journey is NOT frigid', j1.weather.temperature !== 'frigid');
  ok('the two journeys got DIFFERENT region weather', JSON.stringify(j1.weather) !== JSON.stringify(j2.weather));
}

// =============================================================================
section('HW-3 — map helpers (weatherForHex / weatherMapForCampaign / fill / legend)');
{
  const camp = mkCampaign({ journeys: [] });
  // before any tick: weatherForHex computes an on-demand deterministic current-day roll
  const wh = ACKS.weatherForHex(camp, camp.hexes[0]);
  ok('weatherForHex returns a result (on-demand)', wh && wh.condition && wh.regionKey === 'R0,0');
  ok('weatherForHex is deterministic', JSON.stringify(ACKS.weatherForHex(camp, camp.hexes[0])) === JSON.stringify(wh));
  const map = ACKS.weatherMapForCampaign(camp);
  ok('weatherMapForCampaign covers the authored regions', !!map['R0,0'] && !!map['R2,0']);
  // after a tick, the map prefers the cached region weather
  const camp2 = mkCampaign({ journeys: [mkJourney('jrn-1', 'hex-a', [{ q: 0, r: 0 }, { q: 1, r: 0 }])] });
  const prop = ACKS.proposeDayTick(camp2, 1, {});
  ACKS.commitDayTick(camp2, prop);
  ok('map prefers the cached region weather after a tick', JSON.stringify(ACKS.weatherMapForCampaign(camp2)['R0,0']) === JSON.stringify(camp2._weatherByRegion['R0,0']));
  ok('weatherFillColor returns a color', /^#[0-9a-f]{6}$/i.test(ACKS.weatherFillColor(wh)));
  ok('weatherFillColor null-safe', /^#[0-9a-f]{6}$/i.test(ACKS.weatherFillColor(null)));
  const legend = ACKS.weatherMapLegend();
  ok('weatherMapLegend is non-empty rows {label,color}', Array.isArray(legend) && legend.length > 0 && legend.every(r => r.label && /^#/.test(r.color)));
  ok('weatherSummaryText is a string', typeof ACKS.weatherSummaryText(wh) === 'string' && ACKS.weatherSummaryText(wh).length > 0);
}

// =============================================================================
console.log('\n' + (fail === 0 ? 'PASS' : 'FAIL') + ' — weather.smoke.js: ' + pass + ' passed, ' + fail + ' failed.');
if (fail) { console.log('Failures:\n  ' + failures.join('\n  ')); process.exit(1); }
