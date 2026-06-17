/* =============================================================================
 * acks-engine-weather.js — ACKS God Mode Weather model (HW-1 + HW-2 + HW-3)
 *
 * Phase 2.5 Hex Scales & Weather Plan §3 + §6 + §7 + §10. The RAW daily-weather
 * model: the JJ generation tables + a pure generator + a slot-1 day-tick consumer
 * + the map weather view. Rides on the shipped `koppen` (per 6-mile hex, Terrain
 * T1+T2) + `season` (campaign.calendar) + a COORDINATE-DERIVED 24-mile region key
 * (§5.3) — no continental map layer required first (HW-4/HW-5 are the follow-on).
 *
 * SOURCE + IP (CLAUDE.md §13.6): mechanical facts only — the JJ p.41 climate ×
 * season modifier table (WEATHER_BY_CLIMATE_SEASON) and the JJ p.40 roll → condition
 * table (DAILY_WEATHER_TABLE) are transcribed as keyed JSON, no descriptive prose.
 * RR p.277 supplies the conditions' EFFECTS (weatherConditionEffects). Each table
 * cites its printed page. Imperial Imprint / Autarch.
 *
 * Load order: AFTER acks-engine-catalogs.js (KOPPEN_CLIMATE, JOURNEY_WEATHER_SPEED),
 * acks-engine.js (registerDayConsumer, findHex, isHouseRuleEnabled), and
 * acks-engine-subsystems.js (seasonFor). In index.html the script tag sits below the
 * core modules; in the test harness it auto-loads last. The module self-registers
 * the slot-1 weather day-consumer at load (the construction-module pattern).
 *
 * Polarity (§6.5, RESOLVED Joachim 2026-06-13 Q3): weather generation is RAW-default
 * CORE behaviour — it only fires on an expedition (a day-aware journey in flight), so
 * it is not burdensome. The only optional rule is the default-OFF OPT-OUT
 * `gm-set-weather` (a table that prefers to narrate weather by hand). There is no
 * `realistic-weather` opt-in.
 * =============================================================================
 */
(function(global){
'use strict';
const ACKS = global.ACKS = global.ACKS || {};

// When a hex carries no `koppen`, weather still generates against this temperate,
// unremarkable default (so an expedition on an unmapped-climate hex — e.g. the demo,
// which ships no koppen — still has weather). Documented per §6.1.
const DEFAULT_WEATHER_KOPPEN = 'Cfb';

// =============================================================================
// HW-1 (a) — WEATHER_BY_CLIMATE_SEASON (JJ p.41). 30 Köppen codes × 4 seasons →
// { td: temperature DAY modifier, tn: temperature NIGHT modifier, p: precipitation
// modifier, w: wind modifier }. Kept as its OWN map here (NOT attached to
// KOPPEN_CLIMATE) per the build mandate. The 30 codes match KOPPEN_CLIMATE exactly.
// =============================================================================
const WEATHER_BY_CLIMATE_SEASON = Object.freeze({
  Af:  { winter:{td:+3,tn:+0,p:-3,w:+2}, spring:{td:+2,tn:+0,p:-2,w:+0}, summer:{td:+2,tn:+0,p:-2,w:+0}, fall:{td:+1,tn:+0,p:-1,w:+0} },
  Am:  { winter:{td:+2,tn:+0,p:-1,w:+2}, spring:{td:+7,tn:+0,p:-1,w:+0}, summer:{td:+6,tn:+0,p:+4,w:+0}, fall:{td:+4,tn:+0,p:-1,w:+0} },
  Aw:  { winter:{td:+5,tn:+0,p:-5,w:+2}, spring:{td:+4,tn:+0,p:-4,w:+0}, summer:{td:+3,tn:+0,p:-1,w:+0}, fall:{td:+3,tn:+0,p:-4,w:+0} },
  As:  { winter:{td:+4,tn:+0,p:-1,w:+2}, spring:{td:+4,tn:+0,p:-2,w:+0}, summer:{td:+4,tn:+0,p:-5,w:+0}, fall:{td:+4,tn:+0,p:-3,w:+0} },
  BWh: { winter:{td:+1,tn:+0,p:-5,w:+2}, spring:{td:+6,tn:+0,p:-5,w:+0}, summer:{td:+7,tn:+2,p:-5,w:+0}, fall:{td:+4,tn:+0,p:+0,w:+0} },
  BWk: { winter:{td:+0,tn:-4,p:-4,w:+2}, spring:{td:+0,tn:+0,p:-5,w:+0}, summer:{td:+2,tn:+0,p:-4,w:+0}, fall:{td:+0,tn:-1,p:-5,w:+0} },
  BSh: { winter:{td:+6,tn:+0,p:-5,w:+2}, spring:{td:+7,tn:+3,p:-3,w:+0}, summer:{td:+6,tn:+2,p:-2,w:+0}, fall:{td:+6,tn:+2,p:-5,w:+0} },
  BSk: { winter:{td:+0,tn:-1,p:-4,w:+2}, spring:{td:+1,tn:+0,p:-4,w:+0}, summer:{td:+4,tn:+0,p:-5,w:+0}, fall:{td:+0,tn:+0,p:-4,w:+0} },
  Csa: { winter:{td:+0,tn:+0,p:-4,w:+2}, spring:{td:+1,tn:+0,p:-4,w:+0}, summer:{td:+3,tn:+0,p:-4,w:+0}, fall:{td:+1,tn:+0,p:-3,w:+0} },
  Csb: { winter:{td:+0,tn:+0,p:-2,w:+2}, spring:{td:+0,tn:+0,p:-3,w:+0}, summer:{td:+2,tn:+0,p:-4,w:+0}, fall:{td:+0,tn:+0,p:-1,w:+0} },
  Csc: { winter:{td:+0,tn:+0,p:+2,w:+2}, spring:{td:+0,tn:+0,p:-3,w:+0}, summer:{td:+0,tn:+0,p:-3,w:+0}, fall:{td:+0,tn:+0,p:-2,w:+0} },
  Cwa: { winter:{td:+1,tn:+0,p:-3,w:+2}, spring:{td:+3,tn:+0,p:-2,w:+0}, summer:{td:+4,tn:+2,p:-1,w:+2}, fall:{td:+2,tn:+0,p:-3,w:+0} },
  Cwb: { winter:{td:+1,tn:+0,p:-3,w:+2}, spring:{td:+1,tn:+0,p:-2,w:+0}, summer:{td:+1,tn:+0,p:-1,w:+2}, fall:{td:+1,tn:+0,p:-5,w:+0} },
  Cwc: { winter:{td:+0,tn:+0,p:-3,w:+2}, spring:{td:+0,tn:+0,p:+0,w:+0}, summer:{td:+0,tn:+0,p:+2,w:+2}, fall:{td:+0,tn:+0,p:-2,w:+0} },
  Cfa: { winter:{td:+0,tn:+0,p:-3,w:+2}, spring:{td:+2,tn:+0,p:-2,w:+0}, summer:{td:+4,tn:+1,p:-1,w:+0}, fall:{td:+1,tn:+0,p:-4,w:+0} },
  Cfb: { winter:{td:+0,tn:+0,p:-1,w:+2}, spring:{td:+1,tn:+0,p:-1,w:+0}, summer:{td:+3,tn:+1,p:-1,w:+0}, fall:{td:+0,tn:+0,p:-2,w:+0} },
  Cfc: { winter:{td:+0,tn:-1,p:-3,w:+2}, spring:{td:+0,tn:+0,p:-3,w:+0}, summer:{td:+0,tn:+0,p:-3,w:+0}, fall:{td:+0,tn:+0,p:-3,w:+0} },
  Dsa: { winter:{td:+0,tn:-2,p:-3,w:+2}, spring:{td:+3,tn:+1,p:-4,w:+0}, summer:{td:+5,tn:+3,p:-5,w:+0}, fall:{td:+2,tn:+1,p:-4,w:+0} },
  Dsb: { winter:{td:-2,tn:-5,p:-4,w:+2}, spring:{td:+1,tn:-2,p:-2,w:+0}, summer:{td:+3,tn:+1,p:-3,w:+0}, fall:{td:+0,tn:-1,p:-3,w:+0} },
  Dsc: { winter:{td:-2,tn:-3,p:-2,w:+2}, spring:{td:+1,tn:-1,p:-3,w:+0}, summer:{td:+2,tn:-1,p:-2,w:+0}, fall:{td:-1,tn:-1,p:-1,w:+0} },
  Dwa: { winter:{td:+0,tn:-3,p:-5,w:+2}, spring:{td:+1,tn:+0,p:-4,w:+0}, summer:{td:+3,tn:+0,p:-2,w:+0}, fall:{td:+0,tn:+0,p:-1,w:+0} },
  Dwb: { winter:{td:-1,tn:-3,p:-4,w:+2}, spring:{td:+2,tn:+0,p:-3,w:+0}, summer:{td:+3,tn:+1,p:-2,w:+0}, fall:{td:+0,tn:+0,p:-3,w:+0} },
  Dwc: { winter:{td:-1,tn:-5,p:-4,w:+2}, spring:{td:+0,tn:-3,p:-4,w:+0}, summer:{td:+1,tn:-1,p:-2,w:+0}, fall:{td:+0,tn:-2,p:-3,w:+0} },
  Dwd: { winter:{td:-9,tn:-11,p:-3,w:+2}, spring:{td:+0,tn:-4,p:-4,w:+0}, summer:{td:+2,tn:-2,p:-3,w:+2}, fall:{td:-4,tn:-7,p:-5,w:+0} },
  Dfa: { winter:{td:-2,tn:-4,p:-3,w:+2}, spring:{td:+3,tn:-1,p:-2,w:+0}, summer:{td:+4,tn:+2,p:-4,w:+2}, fall:{td:+2,tn:-2,p:-3,w:+0} },
  Dfb: { winter:{td:-3,tn:-4,p:-3,w:+2}, spring:{td:+2,tn:-2,p:-2,w:+0}, summer:{td:+3,tn:+1,p:-3,w:+2}, fall:{td:+0,tn:-2,p:-3,w:+0} },
  Dfc: { winter:{td:-3,tn:-5,p:-4,w:+2}, spring:{td:+1,tn:-2,p:-4,w:+0}, summer:{td:+2,tn:+0,p:-3,w:+0}, fall:{td:-1,tn:-2,p:-3,w:+0} },
  Dfd: { winter:{td:-9,tn:-11,p:-4,w:+2}, spring:{td:+0,tn:-4,p:-4,w:+0}, summer:{td:+2,tn:-2,p:-4,w:+0}, fall:{td:-5,tn:-6,p:-5,w:+0} },
  ET:  { winter:{td:-8,tn:-11,p:-2,w:+2}, spring:{td:+0,tn:-1,p:-3,w:+0}, summer:{td:+0,tn:+0,p:-2,w:+0}, fall:{td:-1,tn:-2,p:-1,w:+0} },
  EF:  { winter:{td:-11,tn:-11,p:-5,w:-2}, spring:{td:-11,tn:-11,p:-5,w:+0}, summer:{td:-11,tn:-11,p:-5,w:+0}, fall:{td:-11,tn:-11,p:-5,w:+0} }
});

// =============================================================================
// HW-1 (b) — DAILY_WEATHER_TABLE (JJ p.40). The MODIFIED 2d6 result (clamped to the
// −7 / +19 ends) reads down three columns. Temperature has two columns: t1 (read when
// the temperature modifier is +0 or LESS) and t2 (read when +1 or MORE). Each temp
// cell = [band, loF, hiF] (loF/hiF null = open-ended). precip + wind are condition
// names; the bolded "prevailing" ones (Windy/Stormy) are stored under their gameplay
// names. Keyed by the integer modifier −7..19.
// =============================================================================
function _t(band, lo, hi){ return { band: band, lo: lo, hi: hi }; }
const DAILY_WEATHER_TABLE = Object.freeze({
  '-7': { tempCol1:_t('Frigid', null, -75), tempCol2:null,                 precip:'Sunbaked',       wind:'Still' },
  '-6': { tempCol1:_t('Frigid', -74, -65),  tempCol2:null,                 precip:'Sunbaked',       wind:'Still' },
  '-5': { tempCol1:_t('Frigid', -64, -55),  tempCol2:null,                 precip:'Sunbaked',       wind:'Still' },
  '-4': { tempCol1:_t('Frigid', -54, -50),  tempCol2:null,                 precip:'Sunbaked',       wind:'Still' },
  '-3': { tempCol1:_t('Frigid', -49, -40),  tempCol2:null,                 precip:'Sunbaked',       wind:'Still' },
  '-2': { tempCol1:_t('Frigid', -39, -25),  tempCol2:null,                 precip:'Sunbaked',       wind:'Still' },
  '-1': { tempCol1:_t('Frigid', -24, -12),  tempCol2:null,                 precip:'Clear',          wind:'Still' },
  '0':  { tempCol1:_t('Frigid', -11, -6),   tempCol2:_t('Very Chilly', 33, 36), precip:'Clear',     wind:'Still' },
  '1':  { tempCol1:_t('Frigid', 0, -5),     tempCol2:_t('Very Chilly', 37, 40), precip:'Clear',     wind:'Still' },
  '2':  { tempCol1:_t('Cold', 6, 15),       tempCol2:_t('Chilly', 41, 50), precip:'Clear',          wind:'Still' },
  '3':  { tempCol1:_t('Cold', 16, 25),      tempCol2:_t('Chilly', 51, 56), precip:'Clear',          wind:'Still' },
  '4':  { tempCol1:_t('Cold', 26, 32),      tempCol2:_t('Chilly', 57, 62), precip:'Partly Cloudy',  wind:'Still' },
  '5':  { tempCol1:_t('Very Chilly', 33, 36), tempCol2:_t('Brisk', 63, 67), precip:'Mostly Cloudy', wind:'Gentle' },
  '6':  { tempCol1:_t('Very Chilly', 37, 40), tempCol2:_t('Balmy', 68, 71), precip:'Overcast',      wind:'Gentle' },
  '7':  { tempCol1:_t('Chilly', 41, 50),    tempCol2:_t('Balmy', 72, 74), precip:'Drizzly',         wind:'Moderate' },
  '8':  { tempCol1:_t('Chilly', 51, 55),    tempCol2:_t('Balmy', 75, 79), precip:'Drizzly',         wind:'Moderate' },
  '9':  { tempCol1:_t('Brisk', 56, 60),     tempCol2:_t('Warm', 80, 82),  precip:'Drizzly',         wind:'Moderate' },
  '10': { tempCol1:_t('Brisk', 61, 65),     tempCol2:_t('Warm', 83, 86),  precip:'Rainy',           wind:'Strong' },
  '11': { tempCol1:_t('Balmy', 66, 68),     tempCol2:_t('Hot', 87, 90),   precip:'Rainy',           wind:'Strong' },
  '12': { tempCol1:_t('Balmy', 69, 72),     tempCol2:_t('Hot', 91, 94),   precip:'Rainy',           wind:'Windy' },
  '13': { tempCol1:null,                    tempCol2:_t('Sweltering', 95, 99),   precip:'Rainy',    wind:'Windy' },
  '14': { tempCol1:null,                    tempCol2:_t('Sweltering', 100, 104), precip:'Rainy',    wind:'Stormy' },
  '15': { tempCol1:null,                    tempCol2:_t('Sweltering', 105, 108), precip:'Rainy',    wind:'Stormy' },
  '16': { tempCol1:null,                    tempCol2:_t('Sweltering', 109, 112), precip:'Rainy',    wind:'Stormy' },
  '17': { tempCol1:null,                    tempCol2:_t('Sweltering', 113, 115), precip:'Rainy',    wind:'Stormy' },
  '18': { tempCol1:null,                    tempCol2:_t('Sweltering', 116, 120), precip:'Rainy',    wind:'Stormy' },
  '19': { tempCol1:null,                    tempCol2:_t('Sweltering', 121, null), precip:'Rainy',   wind:'Stormy' }
});

// =============================================================================
// HW-1 (c) — WEATHER_GAMEPLAY_FLAGS (§3.3). The "prevailing" subset: the conditions
// JJ BOLDS because they affect play. Everything else (Clear, Balmy, Gentle, Drizzly,
// Misty, …) is narration. Consumers + the map filter to "weather that matters today"
// against this set.
// =============================================================================
const WEATHER_GAMEPLAY_FLAGS = Object.freeze({
  temperature: Object.freeze(['Frigid', 'Sweltering']),
  precipitation: Object.freeze(['Sunbaked', 'Rainy', 'Snowy', 'Foggy', 'Flurry']),
  wind: Object.freeze(['Windy', 'Stormy'])
});
function _isPrevailing(axis, value){ return WEATHER_GAMEPLAY_FLAGS[axis] && WEATHER_GAMEPLAY_FLAGS[axis].indexOf(value) >= 0; }

// =============================================================================
// HW-3 wind DIRECTION (RR p.318 — the reserved wind-direction axis, made real for
// Voyages V2). RAW rolls 1d12/12h → 8 compass points (+ a prevailing bias by
// locale/season). v1: 8 compass points, uniform — the prevailing-wind weighting +
// the day-to-day momentum are deferred Voyages augmentations (Maritime survey §18 OQ2).
// Wind DIRECTION is the bearing the wind blows FROM (a "north wind" comes from the
// north). Degrees are compass bearings (N=0° clockwise); Voyages owns the point-of-sail
// function that reads heading vs this. Direction is independent of the weather-front
// shift (no prevailing momentum in v1). Stored on the weather result so the map's
// reserved wind-arrow layer (HW-3) + the journeys voyage branch both read one home.
// =============================================================================
const WIND_DIRECTION_LABELS = Object.freeze(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']);
function _rollWindDirection(rng){
  const i = Math.floor(rng() * 8) % 8;            // 8 compass points, 45° apart
  return { deg: i * 45, label: WIND_DIRECTION_LABELS[i] };
}

// ── PRNG: local FNV-1a + mulberry32 (the same shape the subsystems day-consumers
// use for seeded deterministic previews; kept local so the module is self-contained). ──
function _wHash32(str){
  let h = 2166136261 >>> 0;
  for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function _wMulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function _2d6(rng){ return 2 + Math.floor(rng() * 6) + Math.floor(rng() * 6); }
function _clampMod(n){ return Math.max(-7, Math.min(19, n | 0)); }

// Weather front (§3.3 rule 3): shift the day's RAW roll ±1 TOWARD the prior day's raw
// roll. An unmodified 2 or 12 does NOT shift (the extremes lock). priorRoll null ⇒ no shift.
function _frontShift(roll, priorRoll){
  if(roll === 2 || roll === 12) return roll;
  if(priorRoll == null) return roll;
  if(priorRoll > roll) return roll + 1;
  if(priorRoll < roll) return roll - 1;
  return roll;
}

function _normalizeSeason(season){
  const s = String(season || '').trim().toLowerCase();
  if(s === 'autumn' || s === 'fall') return 'fall';   // the default calendar names it 'autumn'; the table is 'fall'
  if(s === 'spring' || s === 'summer' || s === 'winter') return s;
  return 'summer';   // 'unknown' / unrecognised → a neutral default (rare: the calendar covers all 12 months)
}
function _normalizeKoppen(code){
  const c = String(code || '').trim();
  return WEATHER_BY_CLIMATE_SEASON[c] ? c : DEFAULT_WEATHER_KOPPEN;
}
function _tempCell(modIndex, useHotColumn){
  const row = DAILY_WEATHER_TABLE[String(_clampMod(modIndex))];
  const cell = useHotColumn ? (row.tempCol2 || row.tempCol1) : (row.tempCol1 || row.tempCol2);
  return cell || _t('Balmy', 68, 72);
}

// The fine temperature band → the shipped JOURNEY_TEMPERATURE_SPEED key (the ×½
// extremes are Frigid + Sweltering; the rest don't slow travel — RR p.277).
function _temperatureBandKey(band){
  if(band === 'Frigid') return 'frigid';
  if(band === 'Sweltering') return 'sweltering';
  if(band === 'Cold' || band === 'Very Chilly' || band === 'Chilly') return 'cold';
  return 'moderate';   // Brisk / Balmy / Warm / Hot
}
// precip + wind → the single JOURNEY_WEATHER_SPEED condition key, worst-first. Only
// foggy + snowy halve base speed (catalogs); the rest are ×1 but distinct for the
// map + effects (+ the future ARMY_WEATHER_EFFECTS reconciliation).
function _conditionKey(precip, wind){
  if(precip === 'Snowy') return 'snowy';
  if(precip === 'Foggy') return 'foggy';
  if(wind === 'Stormy') return 'stormy';
  if(precip === 'Rainy') return 'rainy';
  if(wind === 'Windy') return 'windy';
  if(precip === 'Flurry') return 'flurry';
  if(precip === 'Sunbaked') return 'sunbaked';
  if(precip === 'Drizzly') return 'drizzly';
  return 'fair';   // Clear / Partly Cloudy / Mostly Cloudy / Overcast / Misty
}

// =============================================================================
// HW-1 — the generator (§6.2). PURE + deterministic given rng. Three 2d6 rolls
// (temperature, precipitation, wind), the weather-front shift, the day/night re-read,
// and the §3.3 interactions.
// =============================================================================
function rollDailyWeather(koppen, season, opts){
  opts = opts || {};
  const rng = opts.rng || Math.random;
  const prior = opts.priorResult || null;
  const code = _normalizeKoppen(koppen);
  const seas = _normalizeSeason(season);
  const mods = (WEATHER_BY_CLIMATE_SEASON[code] && WEATHER_BY_CLIMATE_SEASON[code][seas]) || { td:0, tn:0, p:0, w:0 };

  // 1) three raw 2d6 rolls (order: temperature, precipitation, wind)
  let tempRoll = _2d6(rng), precipRoll = _2d6(rng), windRoll = _2d6(rng);

  // 2) weather front (§3.3 rule 3): shift each toward the prior day's raw roll
  if(prior && prior.rolls){
    tempRoll   = _frontShift(tempRoll,   prior.rolls.tempRoll);
    precipRoll = _frontShift(precipRoll, prior.rolls.precipRoll);
    windRoll   = _frontShift(windRoll,   prior.rolls.windRoll);
  }

  // 3) temperature — column by the sign of the relevant modifier (day vs night),
  // night re-reads the SAME temp roll with the night modifier (§3.2(b) / §6.2).
  const dayCell   = _tempCell(tempRoll + mods.td, mods.td >= 1);
  const nightCell = _tempCell(tempRoll + mods.tn, mods.tn >= 1);

  // 4) precipitation + wind — the modified rolls read straight down their columns
  let precipitation = DAILY_WEATHER_TABLE[String(_clampMod(precipRoll + mods.p))].precip;
  let wind          = DAILY_WEATHER_TABLE[String(_clampMod(windRoll   + mods.w))].wind;

  // 5) interactions (§3.3 rule 1). Temperature uses the DAY band.
  const coldOrFrigid = (dayCell.band === 'Frigid' || dayCell.band === 'Cold');
  if(coldOrFrigid){
    if(precipitation === 'Drizzly') precipitation = 'Flurry';
    else if(precipitation === 'Rainy') precipitation = 'Snowy';
  } else if(wind === 'Still'){
    if(precipitation === 'Drizzly') precipitation = 'Misty';   // no game effect
    else if(precipitation === 'Rainy') precipitation = 'Foggy'; // game effect
  }

  // 6) prevailing (the bolded, mechanically-significant subset)
  const prevailing = [];
  if(_isPrevailing('temperature', dayCell.band)) prevailing.push(dayCell.band);
  if(_isPrevailing('precipitation', precipitation)) prevailing.push(precipitation);
  if(_isPrevailing('wind', wind)) prevailing.push(wind);

  // 7) wind DIRECTION (HW-3 / RR p.318) — one extra draw AFTER the three 2d6 rolls,
  // so existing weather outputs (temperature/precip/wind) are unchanged. Not front-
  // shifted (no prevailing momentum in v1). The bearing the wind blows FROM.
  const windDir = _rollWindDirection(rng);

  return {
    temperature: dayCell.band, temperatureF: [dayCell.lo, dayCell.hi],
    nightTemperature: nightCell.band, nightTemperatureF: [nightCell.lo, nightCell.hi],
    precipitation: precipitation,
    wind: wind,
    windDirection: windDir.deg,            // bearing the wind blows FROM, compass degrees (N=0°, CW)
    windDirectionLabel: windDir.label,     // N | NE | E | SE | S | SW | W | NW
    condition: _conditionKey(precipitation, wind),       // JOURNEY_WEATHER_SPEED key
    temperatureBand: _temperatureBandKey(dayCell.band),  // JOURNEY_TEMPERATURE_SPEED key
    prevailing: prevailing,
    rolls: { tempRoll: tempRoll, precipRoll: precipRoll, windRoll: windRoll },  // post-front-shift raw rolls (the next day's front reads these)
    mods: { tempDay: mods.td, tempNight: mods.tn, precip: mods.p, wind: mods.w },
    climate: code, season: seas,
    rolledOrSet: 'rolled'
  };
}

// =============================================================================
// HW-2 — effects reconciliation (§6.4 / RR p.277). The generated result → the
// cumulative effect set, reconciled onto the SHIPPED JOURNEY_WEATHER_SPEED +
// JOURNEY_TEMPERATURE_SPEED enums. (The ARMY_WEATHER_EFFECTS reconciliation — the
// per-condition recon/missile/disease the W-layer wants — lands when feature/
// military-w1 merges; it is NOT on this base. TODO: army reconciliation on merge.)
// =============================================================================
function weatherConditionEffects(result){
  result = result || {};
  const A = global.ACKS || {};
  const cond = result.condition || 'fair';
  const tband = result.temperatureBand || 'moderate';
  const wsMap = A.JOURNEY_WEATHER_SPEED || {};
  const tsMap = A.JOURNEY_TEMPERATURE_SPEED || {};
  const condMult = (wsMap[cond] != null) ? wsMap[cond] : 1;
  const tempMult = (tsMap[tband] != null) ? tsMap[tband] : 1;
  const notes = [];
  let visibilityFt = null, missilePenalty = 0, navPenalty = 0, waterUsePct = 0, dehydrationX = 1;

  if(result.precipitation === 'Foggy'){ visibilityFt = 20; navPenalty = -4; notes.push('Foggy: 20ft visibility, ½ speed, −4 Land-Surveying/Navigation/Searching/Tracking'); }
  if(result.precipitation === 'Snowy'){ notes.push('Snowy: snow terrain, ½ speed'); }
  if(result.precipitation === 'Rainy'){ notes.push('Rainy: ½ visibility, mud forms, crude structures degrade'); }
  if(result.precipitation === 'Sunbaked'){ notes.push('Sunbaked: sunburn risk'); }
  if(result.wind === 'Windy'){ missilePenalty = -2; notes.push('Windy: missile −2 (20ft visibility in barrens/desert)'); }
  if(result.wind === 'Stormy'){ missilePenalty = -2; notes.push('Stormy: heavy winds, missile −2'); }
  if(tband === 'sweltering'){ waterUsePct = 25; dehydrationX = 2; notes.push('Sweltering: ½ speed, heavy-armor fatigue, +25% water, ×2 dehydration'); }
  if(tband === 'frigid'){ notes.push('Frigid: ½ speed, hypothermia risk'); }

  return {
    speedMultiplier: condMult * tempMult,
    visibilityFt: visibilityFt,
    missilePenalty: missilePenalty,
    navPenalty: navPenalty,
    waterUsePct: waterUsePct,
    dehydrationX: dehydrationX,
    prevailing: (result.prevailing && result.prevailing.length > 0),
    notes: notes
  };
}

// =============================================================================
// Region key (§5.3 / §5.4). 6-mile hex axial {q,r} → its 24-mile parent coordinate
// via cube/4 round-to-nearest (≈16 children/parent, 15–17 at borders — the honest
// §2.2 imperfection). Until the continental layer (HW-4) materializes a parentHexId,
// this coordinate-derived key groups the per-region weather roll.
// =============================================================================
function hexParentCoord(coord){
  const q = (coord && coord.q) || 0, r = (coord && coord.r) || 0;
  // axial → cube, /4
  let x = q / 4, z = r / 4, y = (-q - r) / 4;
  let rx = Math.round(x), ry = Math.round(y), rz = Math.round(z);
  const dx = Math.abs(rx - x), dy = Math.abs(ry - y), dz = Math.abs(rz - z);
  if(dx > dy && dx > dz) rx = -ry - rz;
  else if(dy > dz) ry = -rx - rz;
  else rz = -rx - ry;
  return { q: rx, r: rz };
}
function regionKeyForCoord(coord){
  if(!coord) return null;
  const p = hexParentCoord(coord);
  return 'R' + p.q + ',' + p.r;
}

// ── hex/journey resolution helpers ──
function _resolveHex(campaign, hexId){
  if(!campaign || !hexId) return null;
  const A = global.ACKS || {};
  if(typeof A.resolveHexAnywhere === 'function') return A.resolveHexAnywhere(campaign, hexId);
  if(typeof A.findHex === 'function'){
    const h = A.findHex(campaign, hexId);
    if(h) return h;
  }
  if(Array.isArray(campaign.hexes)){ const h = campaign.hexes.find(x => x && x.id === hexId); if(h) return h; }
  if(Array.isArray(campaign.domains)){
    for(const d of campaign.domains){
      const gh = d && d.geography && d.geography.hexes;
      if(Array.isArray(gh)){ const h = gh.find(x => x && x.id === hexId); if(h) return h; }
    }
  }
  return null;
}
function _allHexes(campaign){
  const out = [], seen = {};
  const push = arr => { if(Array.isArray(arr)) arr.forEach(h => { if(h && h.id && !seen[h.id]){ seen[h.id] = true; out.push(h); } }); };
  if(campaign){ push(campaign.hexes); if(Array.isArray(campaign.domains)) campaign.domains.forEach(d => push(d && d.geography && d.geography.hexes)); }
  return out;
}
function _journeyCurrentHex(campaign, journey){
  if(!journey) return null;
  return _resolveHex(campaign, journey.currentHexId || journey.startHexId);
}
// The 24-mile region key for a journey's CURRENT hex (used by the journeys day-handler
// to read its own region's weather out of ctx.weatherByRegion).
function journeyRegionKey(campaign, journey){
  const hex = _journeyCurrentHex(campaign, journey);
  if(!hex || !hex.coord) return null;
  return regionKeyForCoord(hex.coord);
}
function _koppenForHex(hex){
  return (hex && hex.koppen && WEATHER_BY_CLIMATE_SEASON[String(hex.koppen).trim()]) ? String(hex.koppen).trim() : DEFAULT_WEATHER_KOPPEN;
}
function _seasonForCampaign(campaign, ctx){
  const cal = (campaign && campaign.calendar) || {};
  const A = global.ACKS || {};
  let s = cal.season;
  if(!s && typeof A.seasonFor === 'function') s = A.seasonFor(campaign, (ctx && ctx.month) || cal.month || 1);
  if(!s) s = _seasonFromMonth((ctx && ctx.month) || cal.month || 1);  // last-ditch (default calendar)
  return _normalizeSeason(s);
}
function _seasonFromMonth(m){
  m = ((m - 1) % 12) + 1;
  if(m >= 3 && m <= 5) return 'spring';
  if(m >= 6 && m <= 8) return 'summer';
  if(m >= 9 && m <= 11) return 'fall';
  return 'winter';   // 12,1,2
}
// Monotonic day ordinal for the deterministic seed (year/month/day).
function _worldOrd(campaign, ctx){
  const cal = (campaign && campaign.calendar) || {};
  const y = cal.year || 1;
  const m = (ctx && ctx.month) || cal.month || 1;
  const d = (ctx && ctx.dayInMonth) || (campaign && campaign.currentDayInMonth) || 1;
  return ((y * 12 + (m - 1)) * 30) + d;
}
// Stable per-(region, day, climate, season) seed → re-opening the day-tick review
// reproduces the same weather (the day-tick preview fingerprint pattern).
function _seededWeatherRng(regionKey, worldOrd, koppen, season){
  return _wMulberry32(_wHash32('weather|' + regionKey + '|' + worldOrd + '|' + koppen + '|' + season));
}

// The consumer-facing weather shape the journeys day-handler reads (ctx.weather):
// .condition (JOURNEY_WEATHER_SPEED) + .temperature (JOURNEY_TEMPERATURE_SPEED) + the
// full rich result for the day record + the map.
function _consumerWeather(result){
  if(!result) return null;
  return {
    condition: result.condition, temperature: result.temperatureBand,
    rolledOrSet: 'rolled',
    precipitation: result.precipitation, wind: result.wind, band: result.temperature,
    windDirection: result.windDirection, windDirectionLabel: result.windDirectionLabel,  // HW-3 — Voyages V2 reads these
    prevailing: result.prevailing || [], result: result
  };
}
function _weatherRecordLabel(result, regionKey){
  const bits = [result.temperature];
  if(result.temperatureF && result.temperatureF[0] != null) bits.push(_fmtF(result.temperatureF));
  let precip = result.precipitation;
  if(result.precipitation === 'Misty') precip = 'Drizzly → Misty';
  if(result.precipitation === 'Foggy') precip = 'Rainy → Foggy';
  if(result.precipitation === 'Flurry') precip = 'Drizzly → Flurry';
  if(result.precipitation === 'Snowy') precip = 'Rainy → Snowy';
  const head = '🌦 Weather (region ' + (regionKey || '?').replace(/^R/, '') + '): ' + bits.join(' ') + ', ' + precip + ', ' + result.wind;
  const tail = (result.prevailing && result.prevailing.length) ? (' — ' + result.prevailing.join(', ')) : ' — no game effect';
  return head + tail;
}
function _fmtF(range){
  if(!range) return '';
  const lo = range[0], hi = range[1];
  if(lo != null && hi != null) return lo + '–' + hi + '°F';
  if(hi != null) return '≤' + hi + '°F';
  if(lo != null) return '≥' + lo + '°F';
  return '';
}
// A one-line GM summary of a weather result (hex card / day log).
function weatherSummaryText(result){
  if(!result) return 'No weather rolled';
  const eff = weatherConditionEffects(result);
  let precip = result.precipitation;
  if(result.precipitation === 'Misty') precip = 'Drizzly → Misty';
  else if(result.precipitation === 'Foggy') precip = 'Rainy → Foggy';
  else if(result.precipitation === 'Flurry') precip = 'Drizzly → Flurry';
  else if(result.precipitation === 'Snowy') precip = 'Rainy → Snowy';
  const head = result.temperature + ' ' + _fmtF(result.temperatureF) + ' · ' + precip + ' · ' + result.wind + ' wind';
  const tail = (result.prevailing && result.prevailing.length)
    ? ' — ' + (eff.speedMultiplier < 1 ? ('×' + eff.speedMultiplier.toFixed(2).replace(/\.?0+$/, '') + ' speed') : 'prevailing')
    : ' — no game effect';
  return head + tail;
}

// =============================================================================
// HW-2 — the slot-1 day-tick weather consumer (Calendar §10.2 slot 1, reserved).
// PURE handler: rolls per distinct region per day, hands the day's weather to
// downstream consumers via ctx.weather + ctx.weatherByRegion (the journeys handler
// reads it into the journey day record), and proposes one record per region for the
// GM review + the transient-cache commit. Weather rolls only where an expedition is
// in flight (RAW only cares about weather on an expedition).
// =============================================================================
function proposeWeatherDay(campaign, ctx){
  const out = { pendingRecords: [], notableEvents: [], encounters: [] };
  if(!campaign) return out;
  ctx = ctx || {};
  const A = global.ACKS || {};
  // §6.5 opt-out: gm-set-weather ON → skip generation, the GM hand-sets the day.
  if(typeof A.isHouseRuleEnabled === 'function' && A.isHouseRuleEnabled(campaign, 'gm-set-weather')) return out;
  const journeys = Array.isArray(campaign.journeys)
    ? campaign.journeys.filter(j => j && (j.status === 'in-transit' || j.status === 'resting' || j.status === 'lost'))
    : [];
  if(!journeys.length) return out;
  const season = _seasonForCampaign(campaign, ctx);
  const worldOrd = _worldOrd(campaign, ctx);
  const byRegion = {}, consumerByRegion = {};
  for(const j of journeys){
    const key = journeyRegionKey(campaign, j);
    if(!key || byRegion[key]) continue;   // one roll per distinct region (parties in the same region share it)
    const hex = _journeyCurrentHex(campaign, j);
    const koppen = _koppenForHex(hex);
    const prior = (campaign._weatherByRegion && campaign._weatherByRegion[key]) || null;   // §3.3 rule 3 + fast-travel re-roll (rule 4): a region with no prior is a fresh roll
    const rng = ctx.rng || _seededWeatherRng(key, worldOrd, koppen, season);
    const result = rollDailyWeather(koppen, season, { priorResult: prior, rng: rng });
    result.regionKey = key; result.worldOrd = worldOrd;
    byRegion[key] = result;
    consumerByRegion[key] = _consumerWeather(result);
    out.pendingRecords.push({
      kind: 'weather-day', consumer: 'weather', regionKey: key, weather: result,
      hexId: (hex && hex.id) || null, label: _weatherRecordLabel(result, key)
    });
  }
  // Hand the day's weather to downstream consumers. The journeys handler (slot 30)
  // reads ctx.weatherByRegion[itsRegion] (its own region) falling back to ctx.weather.
  ctx.weatherByRegion = Object.assign({}, ctx.weatherByRegion || {}, consumerByRegion);
  const firstKey = Object.keys(consumerByRegion)[0];
  if(firstKey) ctx.weather = consumerByRegion[firstKey];   // single-region fallback (the common case)
  return out;
}
// COMMIT: write the transient day-scoped cache (the map reads it). On the working copy
// during a multi-day propose this accumulates, so day N+1's front rule reads day N.
function commitWeatherRecord(campaign, record){
  if(!campaign || !record || record.kind !== 'weather-day' || !record.regionKey) return;
  campaign._weatherByRegion = campaign._weatherByRegion || {};
  campaign._weatherByRegion[record.regionKey] = record.weather;
}

// =============================================================================
// HW-3 — map weather view helpers. weatherForHex resolves a single hex's region
// weather (cache-preferring, else an on-demand deterministic roll of the CURRENT day,
// so the map is meaningful even before a tick). weatherMapForCampaign builds the
// region → result map once per render. Plus the categorical fill palette + legend.
// =============================================================================
function _currentDayResult(campaign, regionKey, koppen, season, worldOrd){
  const rng = _seededWeatherRng(regionKey, worldOrd, koppen, season);
  const r = rollDailyWeather(koppen, season, { priorResult: null, rng: rng });
  r.regionKey = regionKey; r.worldOrd = worldOrd;
  return r;
}
function weatherForHex(campaign, hex){
  if(!campaign || !hex || !hex.coord) return null;
  const key = regionKeyForCoord(hex.coord);
  const cache = campaign._weatherByRegion || {};
  if(cache[key]) return cache[key];
  return _currentDayResult(campaign, key, _koppenForHex(hex), _seasonForCampaign(campaign, {}), _worldOrd(campaign, {}));
}
function weatherMapForCampaign(campaign){
  const map = {};
  if(!campaign) return map;
  const cache = campaign._weatherByRegion || {};
  const season = _seasonForCampaign(campaign, {});
  const worldOrd = _worldOrd(campaign, {});
  for(const h of _allHexes(campaign)){
    if(!h || !h.coord) continue;
    const key = regionKeyForCoord(h.coord);
    if(map[key]) continue;
    map[key] = cache[key] || _currentDayResult(campaign, key, _koppenForHex(h), season, worldOrd);
  }
  return map;
}

// Categorical fill palette (worst-condition-first, mirrors _conditionKey precedence,
// + the temperature extremes). Translucent-friendly hexes inherit their region's color.
const WEATHER_FILL_COLORS = Object.freeze({
  snowy:      '#e8f0f7', foggy: '#b8bcc2', stormy: '#5b4a6e', rainy: '#5a7fa8',
  windy:      '#9fd0c8', flurry: '#cfe6f2', sunbaked: '#e09a3e', drizzly: '#aac6e0',
  frigid:     '#3f63b0', sweltering: '#c0432f', fair: '#f0e4a8'
});
function _weatherPaletteKey(result){
  if(!result) return 'fair';
  // temperature extremes dominate the palette (they're the harshest);
  // else the precipitation/wind condition key.
  if(result.temperatureBand === 'frigid' && result.condition === 'fair') return 'frigid';
  if(result.temperatureBand === 'sweltering' && result.condition === 'fair') return 'sweltering';
  return result.condition || 'fair';
}
function weatherFillColor(result){
  return WEATHER_FILL_COLORS[_weatherPaletteKey(result)] || WEATHER_FILL_COLORS.fair;
}
function weatherMapLegend(){
  return [
    { label:'Clear/mild', color:WEATHER_FILL_COLORS.fair },
    { label:'Frigid', color:WEATHER_FILL_COLORS.frigid },
    { label:'Snowy', color:WEATHER_FILL_COLORS.snowy },
    { label:'Foggy', color:WEATHER_FILL_COLORS.foggy },
    { label:'Drizzly', color:WEATHER_FILL_COLORS.drizzly },
    { label:'Rainy', color:WEATHER_FILL_COLORS.rainy },
    { label:'Windy', color:WEATHER_FILL_COLORS.windy },
    { label:'Stormy', color:WEATHER_FILL_COLORS.stormy },
    { label:'Sunbaked', color:WEATHER_FILL_COLORS.sunbaked },
    { label:'Sweltering', color:WEATHER_FILL_COLORS.sweltering }
  ];
}

// ── self-register the slot-1 weather day-consumer (the construction-module pattern;
// registerDayConsumer ships from acks-engine.js, loaded before this module) ──
if(typeof ACKS.registerDayConsumer === 'function'){
  ACKS.registerDayConsumer('weather', {
    handler: proposeWeatherDay,
    order: 1,
    pauseTriggers: [],
    commit: commitWeatherRecord
  });
}

Object.assign(ACKS, {
  WEATHER_BY_CLIMATE_SEASON, DAILY_WEATHER_TABLE, WEATHER_GAMEPLAY_FLAGS, WEATHER_FILL_COLORS,
  WIND_DIRECTION_LABELS, DEFAULT_WEATHER_KOPPEN,
  rollDailyWeather, weatherConditionEffects,
  hexParentCoord, regionKeyForCoord, journeyRegionKey,
  proposeWeatherDay, commitWeatherRecord,
  weatherForHex, weatherMapForCampaign, weatherFillColor, weatherMapLegend, weatherSummaryText
});

if(typeof module !== 'undefined' && module.exports) module.exports = ACKS;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
