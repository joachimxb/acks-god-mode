/* =============================================================================
 * acks-engine-hijinks.js — ACKS God Mode Hideouts & Hijinks (HJ-1)
 *
 * Phase 2.7 Hijinks Plan — the FIRST slice: civilian hijinks (RR pp.360–370)
 * resolved as a DAY-TICK CONSUMER (slot 60). A hijink unfolds over days — plan,
 * perform, lay low — exactly like a journey or a recruitment drive; the global Day
 * Clock advances it, and it surfaces in the day-tick review.
 *
 * SCOPE (HJ-1, the first wave): a perpetrator (a single Streetwise-capable
 * character) launches a hijink; it ticks through its RAW phases; on completion the
 * perpetrator makes the RAW proficiency throw, and the outcome (success / failure /
 * caught) + reward is applied. The full plan's syndicate / boss / member-roster /
 * tribute / trial / bandit-captain layers are LATER waves — see Phase_2.7_Hijinks_Plan.md.
 *
 * RAW (RR pp.360–362, "Assigning, Planning, and Perpetrating Hijinks"):
 *   - Only characters with Streetwise can perpetrate (thief/assassin/nightblade/
 *     venturer get it as a class power). The throw is a proficiency throw (or an
 *     attack throw for racketeering). SUCCESS ⇒ the hijink works; FAIL ⇒ it doesn't;
 *     FAIL BY 14+ OR an unmodified 1 ⇒ the perpetrator is CAUGHT.
 *   - Plannable hijinks (arson, assassinating, kidnapping, sabotaging, smuggling,
 *     stealing) need planning (2d8+3 / 2d6+3 / 2d4+3 days by level) → perform (1 day)
 *     → lay low (2d8+3 days). Ongoing hijinks (carousing, racketeering, soliciting,
 *     spying, treasure-hunting) take 3d6+10 / 3d4+8 / 2d6+5 days, no planning/lay-low.
 *
 * THROW MODEL (HJ-1, INLINED — the handoff: "inline your proficiency throws … the
 * later PT sweep unifies the throws"): the per-skill target from the thief-skill
 * progression tables is a v1 SIMPLIFICATION — base 11+ (the canonical ACKS proficiency
 * throw), + the RAW per-hijink special-bonus proficiencies, + the RAW NPC level bonus
 * (+1 at 5th–8th, +2 at 9th+, RR p.363), + the assassination per-victim-level penalty.
 * The d20 + reward dice + phase durations are all rolled AT LAUNCH (stored on the
 * hijink) so the day-tick propose==commit deterministically (the journeys idiom), and
 * the outcome stays HIDDEN until the activity completes (RAW: the perpetrator never
 * knows the result until it's done). 🔧 Mechanic Extensions — the real per-skill target +
 * the market-class effective-level cap are the documented v1 simplifications.
 *
 * Load order: AFTER acks-engine.js (registerDayConsumer / newId), acks-engine-events.js
 * (applyWealthTransfer / newEvent / setEventContext / isHouseRuleEnabled). In index.html
 * the script tag sits below the core modules; in the test harness it auto-loads last
 * (the glob runner). The module self-registers the slot-60 'hijinks' day-consumer at load
 * (the construction/weather-module pattern).
 *
 * Polarity (CLAUDE §6): hijinks are CORE RAW — no master house-rule gate.
 * =============================================================================
 */
(function(global){
'use strict';
const ACKS = global.ACKS = global.ACKS || {};

// hij- IDs minted locally (acks-engine.js ID_PREFIXES is out of this lane's shared set;
// newId's convention is prefix + '-' + 7-char base36, reproduced here exactly).
function _newHijinkId(){ return 'hij-' + Math.random().toString(36).slice(2,9); }

// =============================================================================
// HIJINK_DEFINITIONS — the civilian hijink set (RR p.361 Hijink Outcomes table).
// The military (infiltrating/subverting/arson-for-war), political (slandering),
// and prison (escaping) variants depend on unbuilt subsystems (Military / Politics)
// and are DEFERRED. Each entry:
//   requiredSkill : the thief skill the throw represents (RR p.361)
//   throwType     : 'proficiency' (default) | 'attack-ac6' (racketeering, RR p.361)
//   plannable     : needs planning + lay-low (the * hijinks, RR p.362)
//   targetsVictim : sets a victim level ±2 of the perpetrator (assassinating/kidnapping)
//   victimPenalty : −1 to the throw per victim level (assassinating, RR p.362)
//   special       : proficiencies that each grant +1 to THIS hijink's throw (RR pp.363+)
//   reward        : { dice, perLevel, payoutFactor, unit } — the RAW successful-outcome
//                   formula; gp = sum(dice) × effectiveLevel × payoutFactor (unit 'gp'),
//                   or a descriptive non-gp outcome (unit 'shp'/'supplies')
//   charges       : the 1d6 charge table when caught (RR per-hijink), or a single default
//   classRestrict : classes that may attempt it (assassinating — RR p.362)
//   emitsRumor    : a rumor-bearing hijink (Plan §7 — the auto-emit wiring is a later wave)
//   icon, label
// =============================================================================
const HIJINK_DEFINITIONS = Object.freeze({
  'arson': {
    label: 'Arson', icon: '🔥', requiredSkill: 'Sneaking', plannable: true, emitsRumor: false,
    special: ['Engineering', 'Siege Engineering', 'Survival', 'Skulking'],
    reward: { dice: '4d6', perLevel: 10, payoutFactor: 1, unit: 'shp' },
    charges: { roll: '1d6', table: [[1,3,'vandalism'],[4,5,'mayhem'],[6,'arson']] },
    desc: 'Burn down 4d6 × 10 shp of buildings per perpetrator level.'
  },
  'assassinating': {
    label: 'Assassinating', icon: '🗡', requiredSkill: 'Hiding', plannable: true, emitsRumor: false,
    targetsVictim: true, victimPenalty: true, classRestrict: ['Assassin', 'Nightblade', 'Elven Nightblade'],
    special: ['Acrobatics', 'Disguise', 'Sniping', 'Skulking'],
    reward: { dice: null, perLevel: 1000, payoutFactor: 1, unit: 'gp', perVictimLevel: true },
    charges: { roll: '1d6', table: [[1,3,'assault'],[4,5,'mayhem'],[6,'murder']] },
    desc: 'Victim dies; bounty of 1,000gp per level of victim to the boss.'
  },
  'carousing': {
    label: 'Carousing', icon: '🍺', requiredSkill: 'Listening', plannable: false, emitsRumor: true,
    special: ['Bribery', 'Diplomacy', 'Folkways', 'Lip Reading', 'Performance', 'Revelry', 'Seduction'],
    reward: { dice: '3d12', perLevel: 5, payoutFactor: 1, unit: 'gp' },
    charges: { roll: '1d6', table: [[1,3,'drunkenness'],[4,5,'gambling'],[6,'vandalism']] },
    desc: 'Learn one rumor worth 3d12 × 5gp per perpetrator level to the boss.'
  },
  'kidnapping': {
    label: 'Kidnapping', icon: '👤', requiredSkill: 'Hiding', plannable: true, emitsRumor: false,
    targetsVictim: true,
    special: ['Skulking'],
    reward: { dice: null, perLevel: 500, payoutFactor: 1, unit: 'gp', perVictimLevel: true },
    charges: { default: 'kidnapping' },
    desc: 'Victim abducted; ransom of 500gp per level of victim to the boss.'
  },
  'racketeering': {
    label: 'Racketeering', icon: '💢', requiredSkill: 'Attack AC 6', throwType: 'attack-ac6', plannable: false, emitsRumor: false,
    special: [],
    reward: { dice: '5d6', perLevel: 10, payoutFactor: 0.6, unit: 'gp' },
    charges: { default: 'extortion' },
    desc: 'Extract 5d6 × 10gp per level; 60% of the value goes to the boss.'
  },
  'sabotaging': {
    label: 'Sabotaging', icon: '🔧', requiredSkill: 'Sneaking', plannable: true, emitsRumor: false,
    special: ['Skulking'],
    reward: { dice: null, perLevel: 1000, payoutFactor: 1, unit: 'supplies' },
    charges: { default: 'sabotage' },
    desc: 'Destroy 1,000gp of supplies in a stronghold per perpetrator level.'
  },
  'smuggling': {
    label: 'Smuggling', icon: '📦', requiredSkill: 'Sneaking', plannable: true, emitsRumor: true,
    special: ['Skulking'],
    reward: { dice: null, perLevel: 3000, payoutFactor: 0.1, unit: 'gp' },
    charges: { default: 'smuggling' },
    desc: 'Smuggle goods worth 3,000gp per level; 10% of the value goes to the boss.'
  },
  'soliciting': {
    label: 'Soliciting', icon: '🤝', requiredSkill: 'Listening', plannable: false, emitsRumor: true,
    special: ['Bribery', 'Diplomacy', 'Folkways', 'Lip Reading', 'Performance', 'Revelry', 'Seduction'],
    reward: { dice: '3d12', perLevel: 5, payoutFactor: 1, unit: 'gp' },
    charges: { default: 'solicitation' },
    desc: 'Earn 3d12 × 5gp per level for the boss.'
  },
  'spying': {
    label: 'Spying', icon: '🕵', requiredSkill: 'Hiding', plannable: false, emitsRumor: true,
    special: ['Skulking'],
    reward: { dice: '2d12', perLevel: 100, payoutFactor: 1, unit: 'gp' },
    charges: { default: 'espionage' },
    desc: 'Gain evidence of one secret worth 2d12 × 100gp per level to the boss.'
  },
  'stealing': {
    label: 'Stealing', icon: '💰', requiredSkill: 'Pickpocketing', plannable: true, emitsRumor: false,
    special: [],
    reward: { dice: null, perLevel: 300, payoutFactor: 1, unit: 'gp' },
    charges: { roll: '1d6', table: [[1,3,'theft'],[4,5,'burglary'],[6,'grand larceny']] },
    desc: 'Steal goods worth 300gp per perpetrator level for the boss.'
  },
  'treasure-hunting': {
    label: 'Treasure-Hunting', icon: '🗺', requiredSkill: 'Searching', plannable: false, emitsRumor: true,
    special: [],
    reward: { dice: '1d6', perLevel: 1000, payoutFactor: 1, unit: 'gp' },
    charges: { default: 'trespassing' },
    desc: 'Find a treasure map to a hoard worth 1d6 × 1,000gp per level to the boss.'
  }
});

const HIJINK_TYPES = Object.freeze(Object.keys(HIJINK_DEFINITIONS));

// The thief-skill bonus proficiencies that grant +1 each to a hijink, plus the
// Streetwise gate (RR p.360 — "Only characters with the Streetwise proficiency can
// perpetrate hijinks"). The thieving classes get Streetwise as a class power.
const HIJINK_THIEF_CLASSES = Object.freeze(['Thief', 'Assassin', 'Nightblade', 'Elven Nightblade', 'Venturer']);

function hijinkDefinition(type){ return HIJINK_DEFINITIONS[type] || null; }
function hijinkTypes(){ return HIJINK_TYPES.slice(); }

// ── dice + proficiency helpers (inlined; the ad-hoc pattern, acks-engine-events.js) ──
function _rng(opts){ return (opts && typeof opts.rng === 'function') ? opts.rng : Math.random; }
function _d(rng, sides){ return Math.floor(rng() * sides) + 1; }
// Roll a "NdM" / "NdM+K" dice expression. Pure given rng.
function _rollDice(expr, rng){
  if(typeof expr === 'number') return expr;
  if(!expr) return 0;
  const m = String(expr).match(/^(\d+)d(\d+)([+\-]\d+)?$/i);
  if(!m) return 0;
  const n = parseInt(m[1], 10), sides = parseInt(m[2], 10), mod = m[3] ? parseInt(m[3], 10) : 0;
  let total = 0; for(let i = 0; i < n; i++) total += _d(rng, sides);
  return total + mod;
}
// Does the character carry this proficiency or class power? (string or {name} entries.)
function _hijinkHasProf(ch, name){
  const re = new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
  const scan = (entry) => re.test(typeof entry === 'string' ? entry : ((entry && (entry.name || entry.id || entry.proficiency)) || ''));
  return !!(ch && ((Array.isArray(ch.proficiencies) && ch.proficiencies.some(scan)) ||
                   (Array.isArray(ch.classPowers) && ch.classPowers.some(scan))));
}

// RAW p.360 eligibility: has Streetwise (proficiency or class power) OR is a thieving
// class (those get Streetwise as a class power). A class restriction (assassinating)
// narrows it further.
function hijinkPerpetratorEligible(ch, type){
  if(!ch) return false;
  const def = type ? HIJINK_DEFINITIONS[type] : null;
  if(def && def.classRestrict && def.classRestrict.indexOf(ch.class) < 0) return false;
  if(_hijinkHasProf(ch, 'Streetwise')) return true;
  return HIJINK_THIEF_CLASSES.indexOf(ch.class) >= 0;
}
// Why a character is ineligible (for the UI hint), or '' if eligible.
function hijinkIneligibleReason(ch, type){
  if(!ch) return 'no perpetrator';
  const def = type ? HIJINK_DEFINITIONS[type] : null;
  if(def && def.classRestrict && def.classRestrict.indexOf(ch.class) < 0){
    return 'only ' + def.classRestrict.join(' / ') + ' may attempt ' + def.label.toLowerCase();
  }
  if(hijinkPerpetratorEligible(ch, type)) return '';
  return 'needs the Streetwise proficiency or a thieving class (Thief / Assassin / Nightblade / Venturer)';
}

// The RAW NPC level bonus (RR p.363): +1 at 5th–8th level, +2 at 9th+.
function _hijinkLevelBonus(level){ return level >= 9 ? 2 : level >= 5 ? 1 : 0; }

// The throw target + bonus for a hijink by this perpetrator (HJ-1 inlined model).
// Returns { target, bonus, levelBonus, specialBonus, victimPenalty, throwType, parts[] }.
// 🔧 base target 11 is a v1 simplification of the per-skill thief-skill progression.
function hijinkThrowProfile(campaign, ch, type, opts){
  opts = opts || {};
  const def = HIJINK_DEFINITIONS[type] || {};
  const level = Math.max(1, (ch && ch.level) || 1);   // 0th counts as 1st (RR p.361)
  const parts = [];
  let target = 11;                                     // 🔧 the canonical ACKS proficiency throw (v1)
  if(def.throwType === 'attack-ac6'){
    // Racketeering is an attack throw vs AC 6 (RR p.361). target = the to-hit number for
    // AC 6 = attackThrow − 6 (attackThrow is the character's to-hit-AC-0 number), floored at 2.
    const at = (ch && ch.attackThrow) || 10;
    target = Math.max(2, at - 6);
  }
  const levelBonus = _hijinkLevelBonus(level);
  if(levelBonus) parts.push({ label: 'level ' + level + ' (RR p.363)', value: levelBonus });
  let specialBonus = 0;
  (def.special || []).forEach(p => { if(_hijinkHasProf(ch, p)){ const v = (p === 'Skulking') ? 2 : 1; specialBonus += v; parts.push({ label: p, value: v }); } });
  let victimPenalty = 0;
  const victimLevel = (typeof opts.victimLevel === 'number') ? opts.victimLevel : null;
  if(def.victimPenalty && victimLevel){ victimPenalty = -victimLevel; parts.push({ label: 'victim level ' + victimLevel, value: -victimLevel }); }
  const bonus = levelBonus + specialBonus + victimPenalty + ((typeof opts.gmModifier === 'number') ? opts.gmModifier : 0);
  if(opts.gmModifier) parts.push({ label: 'GM', value: opts.gmModifier });
  return { target, bonus, levelBonus, specialBonus, victimPenalty, throwType: def.throwType || 'proficiency', parts };
}

// Resolve a thrown d20 against a profile (RR p.360): success if total ≥ target;
// CAUGHT if it fails by 14+ OR the die is an unmodified 1. Returns { die, total, target, outcome }.
function hijinkResolveThrow(die, profile){
  const total = die + (profile.bonus || 0);
  const target = profile.target || 11;
  let outcome;
  if(die === 1 || (target - total) >= 14) outcome = 'caught';
  else if(total >= target) outcome = 'success';
  else outcome = 'fail';
  return { die, total, target, outcome };
}

// ── phase-duration rolls (RR p.362 Laying Low table, by level band) ──
function _hijinkPlanDays(level, rng){ return level >= 9 ? _rollDice('2d4+3', rng) : level >= 5 ? _rollDice('2d6+3', rng) : _rollDice('2d8+3', rng); }
function _hijinkPerformOngoingDays(level, rng){ return level >= 9 ? _rollDice('2d6+5', rng) : level >= 5 ? _rollDice('3d4+8', rng) : _rollDice('3d6+10', rng); }
function _hijinkLayLowDays(rng){ return _rollDice('2d8+3', rng); }   // 2d8+3 at all levels

// Roll the charge a caught perpetrator faces (the per-hijink 1d6 table, or the default).
function _hijinkRollCharge(def, rng){
  const c = def && def.charges;
  if(!c) return 'unknown';
  if(c.default) return c.default;
  if(c.roll && Array.isArray(c.table)){
    const r = _rollDice(c.roll, rng);
    for(const row of c.table){
      if(row.length === 3){ if(r >= row[0] && r <= row[1]) return row[2]; }
      else if(r >= row[0]) return row[1];
    }
    return c.table[c.table.length - 1][c.table[c.table.length - 1].length - 1];
  }
  return 'unknown';
}

// =============================================================================
// blankHijink — the persisted hijink-attempt entity (campaign.hijinks[]). All the
// random rolls (durations, the d20, the reward dice) are made AT LAUNCH and stored,
// so the day-tick propose==commit and the outcome stays hidden until completion.
// =============================================================================
function blankHijink(opts){
  opts = opts || {};
  return {
    schemaVersion: 2,
    kind: 'hijink',
    id: opts.id || _newHijinkId(),
    type: opts.type || 'carousing',
    label: opts.label || '',
    perpetratorCharacterId: opts.perpetratorCharacterId || null,
    bossCharacterId: opts.bossCharacterId || null,        // null ⇒ independent operator (RAW p.360)
    hexId: opts.hexId || null,
    settlementId: opts.settlementId || null,
    domainId: opts.domainId || null,
    // lifecycle: planning | performing | laying-low | complete | failed | caught
    status: opts.status || 'planning',
    phase: opts.phase || 'planning',
    daysLeftInPhase: opts.daysLeftInPhase || 0,
    plannable: !!opts.plannable,
    planDaysTotal: opts.planDaysTotal || 0,
    performDaysTotal: opts.performDaysTotal || 1,
    layLowDaysTotal: opts.layLowDaysTotal || 0,
    perpetratorLevel: opts.perpetratorLevel || 1,
    effectiveLevel: opts.effectiveLevel || 1,
    victimLevel: (opts.victimLevel != null) ? opts.victimLevel : null,
    throwDie: opts.throwDie || 0,                         // the rolled 1d20 (hidden until reveal)
    throwTarget: opts.throwTarget || 11,
    throwBonus: opts.throwBonus || 0,
    outcome: opts.outcome || null,                        // 'success' | 'fail' | 'caught' (locked at launch)
    rewardGp: opts.rewardGp || 0,
    rewardUnit: opts.rewardUnit || 'gp',
    rewardText: opts.rewardText || '',
    charge: opts.charge || null,                          // the crime if caught
    resolved: !!opts.resolved,                            // the throw has been revealed + applied
    revealed: !!opts.revealed,
    rumorEmitted: !!opts.rumorEmitted,
    startedTurn: opts.startedTurn || 1,
    startedDayInMonth: opts.startedDayInMonth || 1,
    startedDayOrd: opts.startedDayOrd || 0,
    resolvedTurn: (opts.resolvedTurn != null) ? opts.resolvedTurn : null,
    history: opts.history || []
  };
}

// ── lookups (pure) ──
function findHijink(campaign, id){ return ((campaign && campaign.hijinks) || []).find(h => h && h.id === id) || null; }
function hijinksForPerpetrator(campaign, charId){ return ((campaign && campaign.hijinks) || []).filter(h => h && h.perpetratorCharacterId === charId); }
function hijinksAtSettlement(campaign, setId){ return ((campaign && campaign.hijinks) || []).filter(h => h && h.settlementId === setId); }
function _hijinkTerminal(h){ return !h || ['complete', 'failed', 'caught'].indexOf(h.status) >= 0; }
function activeHijinks(campaign){ return ((campaign && campaign.hijinks) || []).filter(h => h && !_hijinkTerminal(h)); }

// The reward gp the boss/perpetrator collects on success (the RAW per-hijink formula).
function _hijinkComputeReward(def, effectiveLevel, victimLevel, rng){
  const r = def.reward || {};
  const lvl = r.perVictimLevel ? Math.max(1, victimLevel || 1) : effectiveLevel;
  const dicePart = (r.dice != null) ? _rollDice(r.dice, rng) : 1;
  const raw = dicePart * (r.perLevel || 0) * lvl;
  const gp = (r.unit === 'gp') ? Math.round(raw * (r.payoutFactor || 1)) : 0;
  let text;
  if(r.unit === 'gp') text = gp.toLocaleString() + 'gp';
  else if(r.unit === 'shp') text = raw.toLocaleString() + ' shp of structures burned';
  else if(r.unit === 'supplies') text = raw.toLocaleString() + 'gp of supplies destroyed';
  else text = String(raw);
  return { gp, unit: r.unit || 'gp', raw, text };
}

// =============================================================================
// startHijink — the launch verb (a GM/player action, NOT a day-tick). Validates the
// RAW Streetwise gate, rolls the durations + the d20 throw + the reward dice (all
// stored), sets the opening phase, pushes the hijink, and emits a 'hijink-attempted'
// record. Returns { ok, hijink } or { ok:false, error }.
// =============================================================================
function startHijink(campaign, opts){
  opts = opts || {};
  if(!campaign) return { ok:false, error:'no-campaign' };
  const def = HIJINK_DEFINITIONS[opts.type];
  if(!def) return { ok:false, error:'unknown-type' };
  const perp = ((campaign.characters) || []).find(c => c && c.id === opts.perpetratorCharacterId);
  if(!perp) return { ok:false, error:'unknown-perpetrator' };
  if(!hijinkPerpetratorEligible(perp, opts.type)) return { ok:false, error:'not-eligible', detail: hijinkIneligibleReason(perp, opts.type) };
  const rng = _rng(opts);
  const level = Math.max(1, perp.level || 1);
  const effectiveLevel = level;                       // 🔧 market-class effective-level cap deferred (RR p.361)

  // victim level (assassinating / kidnapping): ±2 of the perpetrator (RR p.362).
  let victimLevel = null;
  if(def.targetsVictim){
    if(typeof opts.victimLevel === 'number') victimLevel = Math.max(1, opts.victimLevel);
    else victimLevel = Math.max(1, level + (Math.ceil(_d(rng, 10) / 2) - 3));   // 1d10/2 − 3 + level
  }

  // the throw — rolled now, outcome locked but hidden until the hijink completes.
  const profile = hijinkThrowProfile(campaign, perp, opts.type, { victimLevel, gmModifier: opts.gmModifier });
  const die = _d(rng, 20);
  const res = hijinkResolveThrow(die, profile);
  const reward = (res.outcome === 'success') ? _hijinkComputeReward(def, effectiveLevel, victimLevel, rng) : { gp:0, unit: (def.reward||{}).unit || 'gp', raw:0, text:'' };
  const charge = (res.outcome === 'caught') ? _hijinkRollCharge(def, rng) : null;

  // durations (RR p.362 Laying Low table)
  const plannable = !!def.plannable;
  const planDaysTotal = plannable ? _hijinkPlanDays(level, rng) : 0;
  const performDaysTotal = plannable ? 1 : _hijinkPerformOngoingDays(level, rng);
  const layLowDaysTotal = plannable ? _hijinkLayLowDays(rng) : 0;

  const ord = (((campaign.currentTurn) || 1) - 1) * 30 + ((campaign.currentDayInMonth) || 1);
  const h = blankHijink({
    id: opts.id, type: opts.type,
    label: opts.label || ((perp.name || 'A perpetrator') + ' — ' + def.label),
    perpetratorCharacterId: perp.id,
    bossCharacterId: opts.bossCharacterId || null,
    hexId: opts.hexId || perp.currentHexId || null,
    settlementId: opts.settlementId || null,
    domainId: opts.domainId || perp.currentDomainId || null,
    plannable,
    status: plannable ? 'planning' : 'performing',
    phase: plannable ? 'planning' : 'performing',
    daysLeftInPhase: plannable ? planDaysTotal : performDaysTotal,
    planDaysTotal, performDaysTotal, layLowDaysTotal,
    perpetratorLevel: level, effectiveLevel, victimLevel,
    throwDie: die, throwTarget: res.target, throwBonus: profile.bonus,
    outcome: res.outcome, rewardGp: reward.gp, rewardUnit: reward.unit, rewardText: reward.text, charge,
    startedTurn: campaign.currentTurn || 1, startedDayInMonth: campaign.currentDayInMonth || 1, startedDayOrd: ord
  });
  h.history.push({ turn: h.startedTurn, dayInMonth: h.startedDayInMonth, type: 'launched',
    narrative: (perp.name || 'A perpetrator') + ' sets out to ' + def.label.toLowerCase() + '.' });
  campaign.hijinks = campaign.hijinks || [];
  campaign.hijinks.push(h);

  _emitHijinkEvent(campaign, h, 'hijink-attempted', { type: h.type, perpetratorCharacterId: h.perpetratorCharacterId },
    (perp.name || 'A perpetrator') + ' begins a ' + def.label.toLowerCase() + ' hijink' + (h.settlementId ? '' : '') + '.');
  return { ok:true, hijink: h };
}

// =============================================================================
// The phase machine (one tick = one day). PURE: returns the state AFTER consuming a
// day, plus flags (resolve = the throw happens this day; terminal = the hijink ends).
// Used by BOTH proposeHijinkDay (for the record label) and commitHijinkRecord (to
// apply). Phase flow:
//   plannable: planning (planDaysTotal) → performing (1) →THROW→ (caught ⇒ end | else
//              laying-low (layLowDaysTotal) → complete/failed)
//   ongoing  : performing (performDaysTotal) →THROW→ complete/failed/caught
// =============================================================================
function _hijinkStep(h){
  const phase = h.phase, left = (h.daysLeftInPhase || 0);
  const out = { phase, daysLeftInPhase: left - 1, status: h.status, resolve: false, terminal: false };
  if(out.daysLeftInPhase > 0) return out;               // same phase, one fewer day
  // this day completes the current phase → transition
  if(phase === 'planning'){
    out.phase = 'performing'; out.daysLeftInPhase = 1; out.status = 'performing';
  } else if(phase === 'performing'){
    out.resolve = true;                                 // the proficiency throw resolves now
    if(h.outcome === 'caught'){ out.phase = 'caught'; out.daysLeftInPhase = 0; out.terminal = true; out.status = 'caught'; }
    else if(h.plannable){ out.phase = 'laying-low'; out.daysLeftInPhase = h.layLowDaysTotal || 0; out.status = 'laying-low'; }
    else { out.terminal = true; out.phase = (h.outcome === 'success') ? 'complete' : 'failed'; out.daysLeftInPhase = 0; out.status = out.phase; }
  } else if(phase === 'laying-low'){
    out.terminal = true; out.phase = (h.outcome === 'success') ? 'complete' : 'failed'; out.daysLeftInPhase = 0; out.status = out.phase;
  } else {
    out.terminal = true;                                // already terminal — no-op
  }
  // a laying-low transition with 0 lay-low days would land terminal the same day (defensive)
  if(out.phase === 'laying-low' && out.daysLeftInPhase <= 0){ out.terminal = true; out.phase = (h.outcome === 'success') ? 'complete' : 'failed'; out.status = out.phase; }
  return out;
}

// The current phase label (for the UI / lookups), with days left.
function hijinkPhaseLabel(h){
  if(!h) return '';
  switch(h.status){
    case 'planning':   return 'planning (' + (h.daysLeftInPhase || 0) + 'd left)';
    case 'performing': return 'performing (' + (h.daysLeftInPhase || 0) + 'd left)';
    case 'laying-low': return 'laying low (' + (h.daysLeftInPhase || 0) + 'd left)';
    case 'complete':   return 'complete';
    case 'failed':     return 'failed';
    case 'caught':     return 'caught';
    default:           return h.status || '';
  }
}

// The day-tick record label for a hijink about to take `step` (the projected post-day state).
function _hijinkRecordLabel(campaign, h, step){
  const def = HIJINK_DEFINITIONS[h.type] || {};
  const perp = ((campaign && campaign.characters) || []).find(c => c && c.id === h.perpetratorCharacterId);
  const who = (perp && perp.name) || h.perpetratorCharacterId || 'A perpetrator';
  const verb = (def.label || h.type).toLowerCase();
  if(step.resolve){
    if(h.outcome === 'success') return who + ': ' + verb + ' — ✓ SUCCESS' + (h.rewardText ? (' (' + h.rewardText + (h.rewardUnit === 'gp' ? ' to ' + _hijinkRecipientName(campaign, h) : '') + ')') : '');
    if(h.outcome === 'caught')  return who + ': ' + verb + ' — ✗ CAUGHT' + (h.charge ? (' (' + h.charge + ')') : '');
    return who + ': ' + verb + ' — ✗ failed';
  }
  if(step.status === 'planning')   return who + ': ' + verb + ' — planning (' + step.daysLeftInPhase + 'd left)';
  if(step.status === 'performing') return who + ': ' + verb + ' — performing (' + step.daysLeftInPhase + 'd left)';
  if(step.status === 'laying-low') return who + ': ' + verb + ' — laying low (' + step.daysLeftInPhase + 'd left)';
  if(step.status === 'complete')   return who + ': ' + verb + ' — complete, laid low';
  if(step.status === 'failed')     return who + ': ' + verb + ' — failed, laid low';
  return who + ': ' + verb;
}
function _hijinkRecipientName(campaign, h){
  const id = h.bossCharacterId || h.perpetratorCharacterId;
  const c = ((campaign && campaign.characters) || []).find(x => x && x.id === id);
  return (c && c.name) || (h.bossCharacterId ? 'the boss' : 'the perpetrator');
}

// ── the 'hijinks' day-consumer (Calendar §14, slot 60) ──
// PURE propose: one record per active hijink, projecting one day forward. No
// notableEvents (the resolution event is emitted in commit — avoids the day-tick
// review's same-consumer notable cross-attribution; the record label carries the
// outcome). order 60 (after construction 50, before the slot-80 collision sweep).
function proposeHijinkDay(campaign, ctx){
  const out = { pendingRecords: [], notableEvents: [], encounters: [] };
  for(const h of activeHijinks(campaign)){
    const step = _hijinkStep(h);
    out.pendingRecords.push({ kind: 'hijink', hijinkId: h.id, label: _hijinkRecordLabel(campaign, h, step), resolves: !!step.resolve });
  }
  return out;
}
// Commit: advance the hijink one day; on the resolution day reveal the outcome, apply
// the reward (GP Wave B), and emit the 'hijink-resolved' record. Guarded so the
// resolution fires exactly once even if a record were applied twice.
function commitHijinkRecord(campaign, record){
  if(!record || record.kind !== 'hijink') return;
  const h = findHijink(campaign, record.hijinkId);
  if(!h || _hijinkTerminal(h)) return;
  const step = _hijinkStep(h);
  h.phase = step.phase; h.daysLeftInPhase = step.daysLeftInPhase; h.status = step.status;
  if(step.resolve && !h.resolved){
    h.resolved = true; h.revealed = true; h.resolvedTurn = campaign.currentTurn || 1;
    _applyHijinkResolution(campaign, h);
  }
  if(step.terminal){
    h.history.push({ turn: campaign.currentTurn || 1, dayInMonth: campaign.currentDayInMonth || 1, type: 'ended',
      narrative: 'The hijink ends (' + h.status + ').' });
  }
}

// Apply a resolved hijink's outcome to the world: credit the reward gp (success), record
// the charge (caught), and emit the 'hijink-resolved' event (chronicle-visible).
function _applyHijinkResolution(campaign, h){
  const A = global.ACKS;
  const def = HIJINK_DEFINITIONS[h.type] || {};
  const perp = ((campaign.characters) || []).find(c => c && c.id === h.perpetratorCharacterId);
  const who = (perp && perp.name) || 'The perpetrator';
  let narrative;
  if(h.outcome === 'success'){
    const recipientId = h.bossCharacterId || h.perpetratorCharacterId;
    if(h.rewardUnit === 'gp' && h.rewardGp > 0 && recipientId && typeof A.applyWealthTransfer === 'function'){
      const recip = ((campaign.characters) || []).find(c => c && c.id === recipientId);
      const spec = { amount: h.rewardGp,
        source: { kind: 'external', label: def.label + ' proceeds' },
        destination: { kind: 'character-gp', id: recipientId, label: (recip && recip.name) ? (recip.name + "'s purse") : null },
        reason: def.label + ' hijink', bucket: 'hijinks' };
      try { A.applyWealthTransfer(campaign, spec); if(typeof A.recordWealthTransfer === 'function') A.recordWealthTransfer(campaign, spec, { submittedBy: 'engine' }); } catch(e){}
    }
    narrative = who + ' pulls off the ' + def.label.toLowerCase() + ' hijink — ' + (h.rewardText || 'success') + '.';
    h.history.push({ turn: h.resolvedTurn, type: 'resolved', narrative });
  } else if(h.outcome === 'caught'){
    narrative = who + ' is CAUGHT attempting ' + def.label.toLowerCase() + (h.charge ? (' — charged with ' + h.charge) : '') + '.';
    h.history.push({ turn: h.resolvedTurn, type: 'resolved', narrative });
  } else {
    narrative = who + ' fails the ' + def.label.toLowerCase() + ' hijink.';
    h.history.push({ turn: h.resolvedTurn, type: 'resolved', narrative });
  }
  _emitHijinkEvent(campaign, h, 'hijink-resolved',
    { hijinkId: h.id, outcome: h.outcome, type: h.type, rewardGp: h.rewardGp, charge: h.charge }, narrative);
}

// Emit a hijink event into the eventLog (the record-only audit pattern, the banditry
// idiom). The day-tick consumer's commit and startHijink both route through here.
function _emitHijinkEvent(campaign, h, kind, payload, narrative){
  const A = global.ACKS;
  if(typeof A.newEvent !== 'function') return null;
  const cal = campaign.calendar || {};
  let ev;
  try {
    ev = A.newEvent(kind, {
      submittedBy: 'engine', cadence: 'daily', targetTurn: campaign.currentTurn || 1,
      gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: campaign.currentDayInMonth || 1 },
      payload: Object.assign({ narrative }, payload || {})
    });
  } catch(e){ return null; }
  if(typeof A.setEventContext === 'function'){
    A.setEventContext(ev, {
      primaryHexId: h.hexId || null, settlementId: h.settlementId || null, domainId: h.domainId || null,
      relatedEntities: [{ kind: 'character', id: h.perpetratorCharacterId, role: 'subject' }]
        .concat(h.bossCharacterId ? [{ kind: 'character', id: h.bossCharacterId, role: 'beneficiary' }] : [])
    });
  }
  ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
  ev.appliedAtTurn = campaign.currentTurn || 1;
  ev.appliedAtDay = campaign.currentDayInMonth || 1;
  if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
  campaign.eventLog.push({ event: ev, result: { narrativeSummary: narrative },
    appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
  return ev;
}

// ── self-register the slot-60 'hijinks' day-consumer (the weather/construction-module
// pattern; registerDayConsumer ships from acks-engine.js, loaded before this module) ──
if(typeof ACKS.registerDayConsumer === 'function'){
  ACKS.registerDayConsumer('hijinks', {
    handler: proposeHijinkDay,
    order: 60,
    pauseTriggers: [],
    commit: commitHijinkRecord
  });
}

Object.assign(ACKS, {
  HIJINK_DEFINITIONS, HIJINK_TYPES, HIJINK_THIEF_CLASSES,
  blankHijink, hijinkDefinition, hijinkTypes,
  hijinkPerpetratorEligible, hijinkIneligibleReason, hijinkThrowProfile, hijinkResolveThrow,
  startHijink, proposeHijinkDay, commitHijinkRecord,
  findHijink, hijinksForPerpetrator, hijinksAtSettlement, activeHijinks, hijinkPhaseLabel
});

if(typeof module !== 'undefined' && module.exports) module.exports = ACKS;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
