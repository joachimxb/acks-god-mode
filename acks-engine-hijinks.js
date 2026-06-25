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

// DC-3 (RR p.351) — hijinks that are NOT operations against the domain's order, so a loyal
// populace's vigilance does not impede them: carousing (overhearing rumors as a tavern patron)
// and treasure-hunting (a dungeon expedition away from the settlement). Every other hijink is a
// covert/criminal act against the local order and is subject to the domain-morale modifier.
const _HIJINK_NOT_VS_DOMAIN = Object.freeze(['carousing', 'treasure-hunting']);

// RR p.359 (Hideout Size, Cost, and Level) — the market class of the urban settlement a hijink
// operates in caps the perpetrator's EFFECTIVE level: a small market cannot sustain a high-level
// operation. The cap governs the level of the target and the amount of earnings; the perpetrator
// STILL uses his full class level to calculate the throw itself (RR p.359). A hamlet (Class VI*)
// folds to the Class VI floor; an unknown / off-map market imposes no cap (the freelance operator).
const _HIJINK_MAX_EFFECTIVE_LEVEL = Object.freeze({ 'I': 14, 'II': 11, 'III': 9, 'IV': 7, 'V': 5, 'VI': 3 });

// The Roman-numeral market class of the settlement a hijink is performed in: the explicit
// settlement, else the largest settlement in the perpetrator's hex, else null (no urban market ⇒
// no cap). economy.js + the core load before hijinks.js, so the late-bound calls resolve.
function _hijinkMarketClass(campaign, opts, perp){
  if(!campaign || typeof ACKS.lookupMarketClass !== 'function') return null;
  const sets = (campaign.settlements) || [];
  let s = opts.settlementId ? sets.find(x => x && x.id === opts.settlementId) : null;
  if(!s){
    const hexId = opts.hexId || (perp && perp.currentHexId) || null;
    if(hexId){ const inHex = sets.filter(x => x && x.hexId === hexId); if(inHex.length) s = inHex.reduce((a, b) => (((b.families || 0) > (a.families || 0)) ? b : a)); }
  }
  return s ? ACKS.lookupMarketClass(s.families || 0).class : null;
}

// The perpetrator's effective level after the RR p.359 market-class cap (no urban market ⇒ the
// full class level). 'VI*' (hamlet) folds to the 'VI' floor (cap 3).
function _hijinkEffectiveLevel(campaign, opts, perp, classLevel){
  const cls = _hijinkMarketClass(campaign, opts, perp);
  const cap = cls ? (_HIJINK_MAX_EFFECTIVE_LEVEL[String(cls).replace('*', '')] || null) : null;
  return cap ? Math.min(classLevel, cap) : classLevel;
}

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
// Does the character carry this proficiency or class power? (canonical {key,ranks}, legacy string,
// or {name} entries.) PT-0: read the {key} slug and de-hyphenate so a multi-word needle still matches.
function _hijinkHasProf(ch, name){
  const re = new RegExp('\\b' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i');
  const scan = (entry) => re.test((typeof entry === 'string' ? entry : ((entry && (entry.key || entry.name || entry.label || entry.proficiency)) || '')).replace(/-/g, ' '));
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
  let crewBonus = 0;   // HJ-3 (gated crew-hijinks; computed in startHijink, passed in here)
  if(typeof opts.crewBonus === 'number' && opts.crewBonus){ crewBonus = opts.crewBonus; parts.push({ label: 'crew', value: crewBonus }); }
  // DC-3 (RR p.351) — a loyal populace resists spies/thieves operating AGAINST the domain. The
  // target domain's morale band sets a penalty on the throw (0 at morale ≤ 0; −1…−4 at +1…+4);
  // benign carousing / treasure-hunting are exempt (not operations against the local order). The
  // modifier is captured at launch (startHijink stores profile.bonus), so it stands even if the
  // domain's morale later moves. domain-completion.js loads before hijinks.js → the call resolves.
  let moraleMod = 0;
  if(_HIJINK_NOT_VS_DOMAIN.indexOf(type) < 0 && typeof ACKS.domainMoraleEffects === 'function'){
    const domId = opts.domainId || (ch && ch.currentDomainId) || null;
    const dom = domId ? (((campaign && campaign.domains) || []).find(d => d && d.id === domId)) : null;
    if(dom){
      moraleMod = ACKS.domainMoraleEffects(campaign, dom).spyThiefThrow || 0;
      if(moraleMod) parts.push({ label: (dom.name || 'domain') + ' populace (RR p.351)', value: moraleMod });
    }
  }
  const bonus = levelBonus + specialBonus + victimPenalty + crewBonus + moraleMod + ((typeof opts.gmModifier === 'number') ? opts.gmModifier : 0);
  if(opts.gmModifier) parts.push({ label: 'GM', value: opts.gmModifier });
  return { target, bonus, levelBonus, specialBonus, victimPenalty, crewBonus, moraleMod, throwType: def.throwType || 'proficiency', parts };
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
    trial: opts.trial || null,                            // HJ-2: the trial result if caught + tried (resolveHijinkTrial)
    rumorEmitted: !!opts.rumorEmitted,
    crew: Array.isArray(opts.crew) ? opts.crew.slice() : [],   // HJ-3: co-perpetrator charIds (gated crew-hijinks)
    crewBonus: opts.crewBonus || 0,                            // HJ-3: the crew's throw bonus (stored with the throw)
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
  // RR p.359 — the market class of the urban settlement the hijink operates in caps the effective
  // level (the target level + the earnings); the throw still uses the full class level. No urban
  // market (the freelance / off-map operator) ⇒ no cap.
  const effectiveLevel = _hijinkEffectiveLevel(campaign, opts, perp, level);

  // victim level (assassinating / kidnapping): ±2 of the perpetrator (RR p.362).
  let victimLevel = null;
  if(def.targetsVictim){
    if(typeof opts.victimLevel === 'number') victimLevel = Math.max(1, opts.victimLevel);
    else victimLevel = Math.max(1, effectiveLevel + (Math.ceil(_d(rng, 10) / 2) - 3));   // ±2 of the (capped) effective level — RR p.359 (the Viktir example)
  }

  // HJ-3 — a lieutenant's hijink reports to his syndicate boss unless an explicit boss is given.
  let bossCharacterId = opts.bossCharacterId || null;
  if(!bossCharacterId){ const synOfPerp = _syndicateForLieutenant(campaign, perp.id); if(synOfPerp && synOfPerp.bossCharacterId) bossCharacterId = synOfPerp.bossCharacterId; }
  // HJ-3 — crew (gated crew-hijinks). When OFF, opts.crew is IGNORED (non-functional + hidden, principle 8).
  let crew = [], crewBonus = 0;
  if(crewHijinksEnabled(campaign) && Array.isArray(opts.crew) && opts.crew.length){
    crew = _validCrew(campaign, opts.crew, opts.type, perp.id);
    crewBonus = crewThrowBonus(crew);
  }

  // the throw — rolled now, outcome locked but hidden until the hijink completes.
  const targetDomainId = opts.domainId || perp.currentDomainId || null;   // DC-3 (RR p.351) — the domain whose populace resists
  const profile = hijinkThrowProfile(campaign, perp, opts.type, { victimLevel, gmModifier: opts.gmModifier, crewBonus, domainId: targetDomainId });
  // PT-5 — the hijink d20 now comes from the canonical Layer-1 roller (ACKS.rollProficiencyThrow)
  // instead of a re-inlined _d(rng,20). Byte-identical: _d(rng,20) === 1+floor(rng()*20) === the
  // resolver's natural — one rng consumption at the same point in the stream, so every downstream
  // roll (reward/charge/durations) is unchanged. The hijink's bespoke THREE-way outcome
  // (success/fail/CAUGHT on a nat-1 or a fail-by-14, RR p.360) stays in hijinkResolveThrow — that
  // is hijink resolution, not the die. (proficiencies.js loads before hijinks.js, so the call resolves;
  // the _d fallback is byte-identical insurance — both consume exactly one rng().)
  const die = (typeof ACKS.rollProficiencyThrow === 'function')
    ? ACKS.rollProficiencyThrow({ target: profile.target, modifiers: [{ value: profile.bonus || 0 }], autoFailBand: 1, proficient: false, rng }).natural
    : _d(rng, 20);
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
    bossCharacterId: bossCharacterId,
    crew, crewBonus,
    hexId: opts.hexId || perp.currentHexId || null,
    settlementId: opts.settlementId || null,
    domainId: targetDomainId,
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
  if(crew.length){
    _emitHijinkEvent(campaign, h, 'hijink-crew-assigned', { hijinkId: h.id, crew: crew.slice(), crewBonus: h.crewBonus },
      (perp.name || 'A perpetrator') + ' assembles a crew of ' + crew.length + ' for the ' + def.label.toLowerCase() + ' (+' + crewBonus + ' to the throw).');
  }
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
  const _ev = _emitHijinkEvent(campaign, h, 'hijink-resolved',
    { hijinkId: h.id, outcome: h.outcome, type: h.type, rewardGp: h.rewardGp, charge: h.charge }, narrative);
  // HJ-3 — the rumor-bearing hijinks push a rumor into pendingEvents on the RAW trigger (Plan §7).
  _maybeAutoEmitHijinkRumor(campaign, h, def, _ev && _ev.id);
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

// =============================================================================
// === Hijinks HJ-2 (team 2026-06-13) — syndicates / tribute / trials (RR pp.358–369) ===
// The criminal-enterprise layer atop HJ-1's per-perpetrator hijinks. A boss runs a
// SYNDICATE (campaign.syndicates[]) out of a hideout near an urban settlement; the
// market class caps its size + the perpetrators' effective level; members the boss does
// not assign a hijink pay him MONTHLY TRIBUTE (the designer's-note shorthand path, RR
// p.362); a CAUGHT hijink (HJ-1 already rolls the charge) opens a TRIAL — await-trial
// languishing then the 2d6 Crime & Punishment roll, with the boss paying the fine.
//
// SCOPE (HJ-2, this wave): the enterprise core — formation, the passive monthly-tribute
// take, and trials/sentencing (fine + outcome band + plead-guilty). 🔧 v1 simplifications,
// documented in Mechanic Extensions: members are counted by level ({level,count}); the
// PHYSICAL punishments (whip / brand / mutilation / execution) are stored as descriptive
// text + left to the GM (the Mortal Wounds tie is agent-2's lane, #141); the per-member
// hijink-FEE / individual member→hijink assignment / change-in-management takeover /
// criminal-guild (multi-syndicate) layers are HJ-3. Tribute is a MANUAL verb (a panel
// button at month-end), NOT auto-wired into commitTurn — that keeps this lane out of the
// shared commitTurn hand-merge zone; auto-collection is a documented follow-on.
//
// campaign.syndicates[] is DEFENSIVE-READ + lazily initialized on first write (the HJ-1
// idiom) — NO blankCampaign / migrateCampaign inject, so templates stay migrate-no-ops.
// =============================================================================

// The Hideout Size, Cost, and Level table (RR p.359). Market class → the max syndicate
// membership the settlement can sustain, the minimum hideout gp to reach that size, and
// the max effective perpetrator level for hijinks based in that market.
const MARKET_SYNDICATE_CAPS = Object.freeze({
  'VI':  { maxMembers: 25,   minHideoutGp: 5000,   maxEffectiveLevel: 3  },
  'V':   { maxMembers: 50,   minHideoutGp: 10000,  maxEffectiveLevel: 5  },
  'IV':  { maxMembers: 100,  minHideoutGp: 20000,  maxEffectiveLevel: 7  },
  'III': { maxMembers: 375,  minHideoutGp: 75000,  maxEffectiveLevel: 9  },
  'II':  { maxMembers: 750,  minHideoutGp: 150000, maxEffectiveLevel: 11 },
  'I':   { maxMembers: 3000, minHideoutGp: 600000, maxEffectiveLevel: 14 }
});
const SYNDICATE_MARKET_ORDER = Object.freeze(['VI', 'V', 'IV', 'III', 'II', 'I']);   // ascending size

// Monthly Member Tribute by member level (RR p.362). index = level, 0..8. 🔧 the RAW
// table tops out at 8th level, so levels above 8 clamp to the level-8 value AND to the
// market's max effective level (RAW: members above the cap pay tribute at the cap).
const MONTHLY_MEMBER_TRIBUTE = Object.freeze([1, 5, 30, 200, 425, 650, 835, 1500, 2000]);

// Classes that can found a syndicate (RR p.358 + p.43). Thief / assassin / (elven)
// nightblade build hideouts; a venturer builds a GUILDHOUSE that counts as a hideout of
// one-half its value when running a syndicate.
const SYNDICATE_BOSS_CLASSES = Object.freeze(['Thief', 'Assassin', 'Nightblade', 'Elven Nightblade', 'Venturer']);
const SYNDICATE_GUILDHOUSE_CLASSES = Object.freeze(['Venturer']);

// ── Crime & Punishment (RR pp.367–368) ──
// CRIME_PROFILES — per the charges a caught hijink produces (HJ-1 _hijinkRollCharge).
//   languishing : the await-trial dice (RR p.367 Awaiting Trial; weeks/months pre-multiplied to days)
//   severity    : the Crime & Punishment die modifier (RR p.368 "Severity of Crime")
//   fine        : { lesser, standard, punitive } gp (RR p.368 Retribution by Crime)
//   physical    : { lesser, standard, punitive } the non-monetary punishment, as GM-resolve text
// 🔧 the physical punishments are descriptive only this wave — the mutilation/execution
// mechanics tie to Mortal Wounds (#141, agent-2's lane) and are not auto-applied.
const CRIME_PROFILES = Object.freeze({
  'drunkenness':  { languishing: '1d2',    severity: 0,  fine: { lesser: 1,    standard: 2,    punitive: 5    }, physical: { lesser: '', standard: '', punitive: '' } },
  'outrage':      { languishing: '1d2',    severity: 0,  fine: { lesser: 1,    standard: 2,    punitive: 5    }, physical: { lesser: '', standard: '', punitive: '' } },
  'eavesdropping':{ languishing: '1d4',    severity: -1, fine: { lesser: 5,    standard: 10,   punitive: 25   }, physical: { lesser: '', standard: '', punitive: 'ear cut off (−1 reaction/listening/surprise)' } },
  'solicitation': { languishing: '1d4',    severity: -1, fine: { lesser: 5,    standard: 10,   punitive: 25   }, physical: { lesser: '', standard: '', punitive: 'ear cut off (−1 reaction/listening/surprise)' } },
  'trespassing':  { languishing: '1d4',    severity: -1, fine: { lesser: 10,   standard: 25,   punitive: 50   }, physical: { lesser: '', standard: '', punitive: 'placed in stocks 2d6 days' } },
  'gambling':     { languishing: '1d4',    severity: -1, fine: { lesser: 10,   standard: 25,   punitive: 50   }, physical: { lesser: '', standard: '', punitive: 'placed in stocks 2d6 days' } },
  'bribery':      { languishing: '1d6',    severity: -2, fine: { lesser: 25,   standard: 50,   punitive: 150  }, physical: { lesser: '', standard: 'stocks 2d6 days', punitive: 'tongue cut off (−4, cannot speak/cast)' } },
  'theft':        { languishing: '1d6',    severity: -2, fine: { lesser: 150,  standard: 300,  punitive: 450  }, physical: { lesser: 'stocks 2d6 days', standard: 'whipped (Death save or scarring)', punitive: 'hand amputated' } },
  'contraband':   { languishing: '1d6',    severity: -2, fine: { lesser: 150,  standard: 300,  punitive: 450  }, physical: { lesser: 'stocks 2d6 days', standard: 'whipped (Death save or scarring)', punitive: 'hand amputated' } },
  'extortion':    { languishing: '1d6',    severity: -2, fine: { lesser: 150,  standard: 300,  punitive: 450  }, physical: { lesser: 'stocks 2d6 days', standard: 'whipped', punitive: 'hand amputated' } },
  'assault':      { languishing: '1d8',    severity: -2, fine: { lesser: 300,  standard: 450,  punitive: 600  }, physical: { lesser: 'whipped', standard: 'whipped', punitive: 'tortured (permanent wound)' } },
  'vandalism':    { languishing: '1d8',    severity: -2, fine: { lesser: 300,  standard: 450,  punitive: 600  }, physical: { lesser: 'whipped', standard: 'whipped', punitive: 'tortured (permanent wound)' } },
  'burglary':     { languishing: '4w',     severity: -3, fine: { lesser: 450,  standard: 600,  punitive: 900  }, physical: { lesser: 'whipped', standard: 'branded (scarring)', punitive: 'both hands amputated' } },
  'smuggling':    { languishing: '4w',     severity: -3, fine: { lesser: 450,  standard: 600,  punitive: 900  }, physical: { lesser: 'whipped', standard: 'branded (scarring)', punitive: 'both hands amputated' } },
  'kidnapping':   { languishing: '4mo',    severity: -3, fine: { lesser: 600,  standard: 750,  punitive: 0    }, physical: { lesser: 'whipped', standard: 'tortured (permanent wound)', punitive: 'tortured + proscribed (exile)' } },
  'manslaughter': { languishing: '4mo',    severity: -4, fine: { lesser: 600,  standard: 750,  punitive: 0    }, physical: { lesser: 'whipped', standard: 'tortured (permanent wound)', punitive: 'tortured + proscribed (exile)' } },
  'mayhem':       { languishing: '4mo',    severity: -4, fine: { lesser: 600,  standard: 750,  punitive: 0    }, physical: { lesser: 'whipped', standard: 'tortured (permanent wound)', punitive: 'tortured + proscribed (exile)' } },
  'robbery':      { languishing: '6mo',    severity: -4, fine: { lesser: 750,  standard: 900,  punitive: 1200 }, physical: { lesser: 'branded (scarring)', standard: 'hand amputated', punitive: 'execution (beheaded or hung)' } },
  'racketeering': { languishing: '6mo',    severity: -4, fine: { lesser: 750,  standard: 900,  punitive: 1200 }, physical: { lesser: 'branded (scarring)', standard: 'hand amputated', punitive: 'execution (beheaded or hung)' } },
  'arson':        { languishing: '12mo',   severity: -5, fine: { lesser: 0,    standard: 0,    punitive: 0    }, physical: { lesser: 'proscribed (exile)', standard: 'execution', punitive: 'agonizing execution' } },
  'murder':       { languishing: '12mo',   severity: -5, fine: { lesser: 0,    standard: 0,    punitive: 0    }, physical: { lesser: 'proscribed (exile)', standard: 'execution', punitive: 'agonizing execution' } },
  'sedition':     { languishing: '12mo',   severity: -4, fine: { lesser: 0,    standard: 0,    punitive: 0    }, physical: { lesser: 'proscribed (exile)', standard: 'execution', punitive: 'agonizing execution' } },
  'sabotage':     { languishing: '1d8',    severity: -2, fine: { lesser: 300,  standard: 450,  punitive: 600  }, physical: { lesser: 'whipped', standard: 'whipped', punitive: 'tortured (permanent wound)' } }
});
// HJ-1's per-hijink charge names that don't match a RAW crime row → resolve to one (RR pp.366–368).
const CRIME_ALIASES = Object.freeze({
  'grand larceny': 'robbery',   // HJ-1 stealing's 6-roll (RAW p.366 names it 'robbery')
  'espionage':     'eavesdropping',
  'unknown':       'trespassing'
});

// The 2d6 Crime & Punishment table (RR p.368). Adjusted die roll → the verdict band.
function crimePunishmentBand(adjustedRoll){
  if(adjustedRoll <= 2)  return { band: 'punitive-conviction',       label: 'Punitive Conviction',        punishmentLevel: 'punitive' };
  if(adjustedRoll <= 5)  return { band: 'conviction',                label: 'Conviction',                 punishmentLevel: 'standard' };
  if(adjustedRoll <= 8)  return { band: 'conviction-lesser',         label: 'Conviction on Lesser Charge', punishmentLevel: 'lesser' };
  if(adjustedRoll <= 11) return { band: 'acquittal',                 label: 'Acquittal',                  punishmentLevel: 'acquitted' };
  return                      { band: 'acquittal-damages',         label: 'Acquittal with Damages',     punishmentLevel: 'acquitted-damages' };
}

// ── syndicate factory (campaign.syndicates[]) ──
function blankSyndicate(opts){
  opts = opts || {};
  return {
    schemaVersion: 2,
    kind: 'syndicate',
    id: opts.id || ((ACKS.ID_PREFIXES && ACKS.newId) ? ACKS.newId(ACKS.ID_PREFIXES.syndicate || 'syn') : ('syn-' + Math.random().toString(36).slice(2, 9))),
    name: opts.name || '',
    bossCharacterId: opts.bossCharacterId || null,        // the boss (analogous to a domain ruler)
    baseSettlementId: opts.baseSettlementId || null,      // the urban settlement (base of operations)
    hexId: opts.hexId || null,                            // the hideout hex (≤6mi from base)
    marketClass: opts.marketClass || 'VI',                // I..VI — caps size + effective level
    hideoutType: opts.hideoutType || 'hideout',           // 'hideout' | 'guildhouse' (venturer ½ value)
    hideoutValueGp: opts.hideoutValueGp || 0,             // gp invested in the hideout
    members: Array.isArray(opts.members) ? opts.members : [],  // [{ level, count }] — 0th ruffians counted in groups
    status: opts.status || 'active',                      // 'active' | 'disbanded'
    foundedTurn: opts.foundedTurn || 1,
    lastTributeTurn: (opts.lastTributeTurn != null) ? opts.lastTributeTurn : null,
    history: opts.history || []
  };
}

// ── syndicate lookups (pure) ──
function findSyndicate(campaign, id){ return ((campaign && campaign.syndicates) || []).find(s => s && s.id === id) || null; }
function syndicatesForBoss(campaign, charId){ return ((campaign && campaign.syndicates) || []).filter(s => s && s.bossCharacterId === charId); }
function syndicatesAtSettlement(campaign, setId){ return ((campaign && campaign.syndicates) || []).filter(s => s && s.baseSettlementId === setId); }
function activeSyndicates(campaign){ return ((campaign && campaign.syndicates) || []).filter(s => s && s.status !== 'disbanded'); }

// ── caps + composition (RR p.359) ──
function syndicateMaxEffectiveLevel(marketClass){ const c = MARKET_SYNDICATE_CAPS[marketClass]; return c ? c.maxEffectiveLevel : 3; }
// The membership tier a hideout VALUE unlocks: the largest max-membership whose minimum
// hideout cost is met (RR p.359 — Viktir's 10,000gp hideout in a Class IV market caps at 50).
function _membershipForHideoutValue(effectiveGp){
  let best = 0;
  for(const mc of SYNDICATE_MARKET_ORDER){ const row = MARKET_SYNDICATE_CAPS[mc]; if(effectiveGp >= row.minHideoutGp && row.maxMembers > best) best = row.maxMembers; }
  return best;
}
// A guildhouse counts as a hideout of one-half its value (RR p.43).
function syndicateEffectiveHideoutGp(syn){ const v = (syn && syn.hideoutValueGp) || 0; return (syn && syn.hideoutType === 'guildhouse') ? Math.floor(v / 2) : v; }
// The effective max membership: the market class's ceiling, further limited by the hideout value.
function syndicateMaxMembers(syn){
  if(!syn) return 0;
  const classMax = (MARKET_SYNDICATE_CAPS[syn.marketClass] || MARKET_SYNDICATE_CAPS['VI']).maxMembers;
  const base = Math.min(classMax, _membershipForHideoutValue(syndicateEffectiveHideoutGp(syn)));
  // HJ-3 🔧 — a chartered criminal guild's formal organization extends its recruiting reach.
  return guildChartered(syn) ? Math.floor(base * GUILD_MEMBERSHIP_FACTOR) : base;
}
function syndicateMemberCount(syn){ return ((syn && syn.members) || []).reduce((n, m) => n + (Math.max(0, (m && m.count) || 0)), 0); }

// RAW p.358: who can found a syndicate. Returns '' if eligible, else the reason.
function syndicateBossIneligibleReason(ch){
  if(!ch) return 'no boss selected';
  if(SYNDICATE_BOSS_CLASSES.indexOf(ch.class) >= 0) return '';
  return 'only ' + SYNDICATE_BOSS_CLASSES.join(' / ') + ' may run a syndicate (RR p.358)';
}
function syndicateBossEligible(ch){ return syndicateBossIneligibleReason(ch) === ''; }

// The market class of a settlement, if recorded (else null → caller falls back to opts).
function _settlementMarketClass(campaign, setId){
  if(!setId) return null;
  const s = ((campaign && campaign.settlements) || []).find(x => x && x.id === setId);
  return (s && (s.marketClass || s.market || null)) || null;
}

// =============================================================================
// formSyndicate — the formation verb (a GM/player action). Validates the boss class +
// derives the market class from the base settlement (RAW: the settlement determines size),
// sets the hideout type (a venturer's guildhouse), pushes the syndicate, and emits a
// 'hijink-syndicate-formed' record. Returns { ok, syndicate } or { ok:false, error }.
// =============================================================================
function formSyndicate(campaign, opts){
  opts = opts || {};
  if(!campaign) return { ok: false, error: 'no-campaign' };
  const boss = opts.bossCharacterId ? ((campaign.characters) || []).find(c => c && c.id === opts.bossCharacterId) : null;
  if(opts.bossCharacterId && !boss) return { ok: false, error: 'unknown-boss' };
  if(boss && !syndicateBossEligible(boss)) return { ok: false, error: 'boss-ineligible', detail: syndicateBossIneligibleReason(boss) };
  // market class: the base settlement's, else an explicit opt, else VI.
  const marketClass = _settlementMarketClass(campaign, opts.baseSettlementId) || opts.marketClass || 'VI';
  if(!MARKET_SYNDICATE_CAPS[marketClass]) return { ok: false, error: 'bad-market-class', detail: marketClass };
  // a venturer's stronghold is a guildhouse (½ value); else a hideout. opts can force it.
  const hideoutType = opts.hideoutType || ((boss && SYNDICATE_GUILDHOUSE_CLASSES.indexOf(boss.class) >= 0) ? 'guildhouse' : 'hideout');
  const syn = blankSyndicate({
    id: opts.id,
    name: opts.name || ((boss && boss.name) ? (boss.name + "'s Syndicate") : 'Unnamed Syndicate'),
    bossCharacterId: opts.bossCharacterId || null,
    baseSettlementId: opts.baseSettlementId || null,
    hexId: opts.hexId || (boss && boss.currentHexId) || null,
    marketClass, hideoutType,
    hideoutValueGp: opts.hideoutValueGp || 0,
    members: Array.isArray(opts.members) ? opts.members : [],
    foundedTurn: campaign.currentTurn || 1
  });
  syn.history.push({ turn: syn.foundedTurn, type: 'founded',
    narrative: (boss && boss.name ? boss.name : 'A boss') + ' founds ' + (syn.name) + ' (Class ' + marketClass + ' ' + hideoutType + ').' });
  campaign.syndicates = campaign.syndicates || [];   // defensive lazy-init (the HJ-1 idiom)
  campaign.syndicates.push(syn);
  _emitSyndicateEvent(campaign, syn, 'hijink-syndicate-formed',
    { syndicateId: syn.id, bossCharacterId: syn.bossCharacterId, baseSettlementId: syn.baseSettlementId, marketClass },
    (boss && boss.name ? boss.name : 'A boss') + ' establishes the syndicate "' + syn.name + '".');
  return { ok: true, syndicate: syn };
}

// Add/remove members (counted by level). Respects the market+hideout max-membership cap.
function addSyndicateMembers(campaign, synId, level, count){
  const syn = findSyndicate(campaign, synId);
  if(!syn) return { ok: false, error: 'unknown-syndicate' };
  const lvl = Math.max(0, Math.floor(level || 0)), add = Math.max(0, Math.floor(count || 0));
  if(!add) return { ok: false, error: 'no-count' };
  if(syndicateMemberCount(syn) + add > syndicateMaxMembers(syn)) return { ok: false, error: 'over-max', detail: 'max ' + syndicateMaxMembers(syn) + ' members for this hideout' };
  const bucket = (syn.members || []).find(m => m && (m.level || 0) === lvl);
  if(bucket) bucket.count = (bucket.count || 0) + add;
  else { syn.members = syn.members || []; syn.members.push({ level: lvl, count: add }); }
  syn.members.sort((a, b) => (a.level || 0) - (b.level || 0));
  return { ok: true, syndicate: syn };
}
function removeSyndicateMembers(campaign, synId, level, count){
  const syn = findSyndicate(campaign, synId);
  if(!syn) return { ok: false, error: 'unknown-syndicate' };
  const lvl = Math.max(0, Math.floor(level || 0)), sub = Math.max(0, Math.floor(count || 0));
  const bucket = (syn.members || []).find(m => m && (m.level || 0) === lvl);
  if(!bucket) return { ok: false, error: 'no-such-level' };
  bucket.count = Math.max(0, (bucket.count || 0) - sub);
  syn.members = (syn.members || []).filter(m => m && (m.count || 0) > 0);
  return { ok: true, syndicate: syn };
}

// =============================================================================
// Tribute — the designer's-note monthly take (RR p.362). The boss collects tribute from
// every member he does NOT assign a hijink; the table is tuned so it equals the average
// hijink profit, so a boss can "sit back and collect his ill-gotten gains." 🔧 this wave
// ships the passive whole-roster take (the detailed per-member assignment path is HJ-3).
// =============================================================================
function memberMonthlyTribute(level, maxEffectiveLevel){
  const cap = (typeof maxEffectiveLevel === 'number') ? maxEffectiveLevel : 8;
  const idx = Math.max(0, Math.min(Math.floor(level || 0), cap, MONTHLY_MEMBER_TRIBUTE.length - 1));
  return MONTHLY_MEMBER_TRIBUTE[idx];
}
// Derived read: the monthly tribute total + the per-level breakdown (the Viktir example).
function syndicateMonthlyTribute(campaign, syn){
  if(!syn) return { totalGp: 0, lines: [], maxEffectiveLevel: 3 };
  const maxEff = syndicateMaxEffectiveLevel(syn.marketClass);
  const lines = ((syn.members) || []).filter(m => m && (m.count || 0) > 0).map(m => {
    const perMember = memberMonthlyTribute(m.level, maxEff);
    return { level: m.level || 0, count: m.count || 0, perMember, subtotal: perMember * (m.count || 0) };
  });
  return { totalGp: lines.reduce((n, l) => n + l.subtotal, 0), lines, maxEffectiveLevel: maxEff };
}
// The collect-tribute verb: routes the monthly take to the boss's purse via the GP Wave B
// grammar (a wealth-transfer, bucket 'hijinks'), emits 'hijink-tribute', stamps the turn.
function collectSyndicateTribute(campaign, synId, opts){
  opts = opts || {};
  const syn = findSyndicate(campaign, synId);
  if(!syn) return { ok: false, error: 'unknown-syndicate' };
  if(!syn.bossCharacterId) return { ok: false, error: 'no-boss' };
  const turn = (opts.atTurn != null) ? opts.atTurn : (campaign.currentTurn || 1);
  if(!opts.force && syn.lastTributeTurn === turn) return { ok: false, error: 'already-collected', detail: 'tribute already collected this turn' };
  const trib = syndicateMonthlyTribute(campaign, syn);
  const boss = ((campaign.characters) || []).find(c => c && c.id === syn.bossCharacterId);
  if(trib.totalGp > 0){
    const A = global.ACKS;
    const spec = { amount: trib.totalGp,
      source: { kind: 'external', label: syn.name + ' tribute' },
      destination: { kind: 'character-gp', id: syn.bossCharacterId, label: (boss && boss.name) ? (boss.name + "'s purse") : null },
      reason: 'syndicate monthly tribute', bucket: 'hijinks' };
    if(typeof A.applyWealthTransfer === 'function'){
      try { A.applyWealthTransfer(campaign, spec); if(typeof A.recordWealthTransfer === 'function') A.recordWealthTransfer(campaign, spec, { submittedBy: 'engine' }); } catch(e){}
    }
  }
  syn.lastTributeTurn = turn;
  const narrative = (boss && boss.name ? boss.name : 'The boss') + ' collects ' + trib.totalGp.toLocaleString() + 'gp in monthly tribute from ' + syndicateMemberCount(syn) + ' members of ' + syn.name + '.';
  syn.history.push({ turn, type: 'tribute', narrative, gp: trib.totalGp });
  _emitSyndicateEvent(campaign, syn, 'hijink-tribute',
    { syndicateId: syn.id, totalGp: trib.totalGp, bossCharacterId: syn.bossCharacterId, turn }, narrative);
  return { ok: true, totalGp: trib.totalGp, lines: trib.lines };
}

// =============================================================================
// processSyndicateTributeForTurn — the monthly auto-take (HJ-2 follow-on, 2026-06-20).
// RAW tribute is MONTHLY (RR p.362, "Monthly Member Tribute"), so a boss "sitting back to
// collect his ill-gotten gains" IS the RAW default — gated on the syndicate-auto-tribute rule
// (default ON via the registry default, the favor-duty-auto-roll precedent). When OFF the GM
// drives the take by hand (the manual Collect button) — useful for a Judge running the detailed
// per-member hijink assignments (HJ-3) who doesn't want the passive whole-roster take on top.
// REUSES collectSyndicateTribute, which is already idempotent within a turn (the lastTributeTurn
// guard) — so a manual collection earlier in the month BLOCKS the auto one (no double-dip) and
// the take routes through the same GP Wave B grammar + 'hijink-tribute' event. dryRun: sum the
// would-be take over the eligible syndicates WITHOUT mutating (the proposeMonthlyTurn preview, the
// livingExpenses precedent). Late-bound into commitTurn (this module loads after acks-engine.js) +
// try-guarded there so a tribute error never fails the monthly commit.
// Returns { ran, ruleOn, totalGp, collections[], logEntries[] }.
// =============================================================================
function processSyndicateTributeForTurn(campaign, opts){
  opts = opts || {};
  const out = { ran: false, ruleOn: false, totalGp: 0, collections: [], logEntries: [] };
  if(!campaign) return out;
  const A = global.ACKS;
  // Absent rule ⇒ ON (the registry default). Only an explicit { enabled:false } turns it off.
  const ruleOn = !(A && typeof A.isHouseRuleEnabled === 'function') || A.isHouseRuleEnabled(campaign, 'syndicate-auto-tribute');
  out.ruleOn = !!ruleOn;
  if(!ruleOn) return out;
  const turn = (opts.atTurn != null) ? opts.atTurn : (campaign.currentTurn || 1);
  for(const syn of activeSyndicates(campaign)){
    if(!syn || !syn.bossCharacterId) continue;
    if(syn.lastTributeTurn === turn) continue;                 // a manual collection already took it this month
    const total = syndicateMonthlyTribute(campaign, syn).totalGp;
    if(total <= 0) continue;                                    // no paying members
    if(opts.dryRun){
      out.collections.push({ syndicateId: syn.id, name: syn.name, bossCharacterId: syn.bossCharacterId, bossName: _tributeBossName(campaign, syn), totalGp: total, memberCount: syndicateMemberCount(syn) });
      out.totalGp += total;
      continue;
    }
    const res = collectSyndicateTribute(campaign, syn.id, { atTurn: turn });
    if(res && res.ok){
      out.ran = true;
      out.totalGp += res.totalGp || 0;
      out.collections.push({ syndicateId: syn.id, name: syn.name, bossCharacterId: syn.bossCharacterId, totalGp: res.totalGp || 0 });
      out.logEntries.push('💰 ' + _tributeBossName(campaign, syn) + ' collects ' + (res.totalGp || 0).toLocaleString() + 'gp in monthly tribute from ' + (syn.name || 'the syndicate') + '.');
    }
  }
  if(opts.dryRun) out.ran = out.collections.length > 0;
  return out;
}
function _tributeBossName(campaign, syn){
  const boss = ((campaign && campaign.characters) || []).find(c => c && c.id === syn.bossCharacterId);
  return (boss && boss.name) ? boss.name : 'The boss';
}

// =============================================================================
// Trials & sentencing (RR pp.367–368). A caught hijink (HJ-1 set h.outcome='caught' and
// rolled h.charge) leads to await-trial languishing, then the 2d6 Crime & Punishment roll
// (or an auto plead-guilty for the first/second offence). The boss pays the fine (RAW:
// "the syndicate boss is expected to pay for the lawyers, bribes, fines… of members who
// get caught"); a perpetrator who can't pay works it off as indenture (3gp/month). 🔧 the
// physical punishments are GM-resolve text (the Mortal Wounds tie is #141).
// =============================================================================
function crimeProfile(charge){
  const key = CRIME_ALIASES[String(charge || '').toLowerCase()] || String(charge || '').toLowerCase();
  const p = CRIME_PROFILES[key];
  return p ? Object.assign({ crime: key }, p) : { crime: key || 'unknown', languishing: '1d4', severity: -1, fine: { lesser: 25, standard: 50, punitive: 100 }, physical: { lesser: '', standard: '', punitive: '' } };
}
// The await-trial languishing duration in days (RR p.367). '4w' = 1d4 weeks, '4mo' =
// 1d4 months, '6mo' = 1d6 months, '12mo' = 1d12 months (a month = 30 days here).
function awaitTrialDays(charge, rng){
  rng = rng || Math.random;
  const code = crimeProfile(charge).languishing;
  if(code === '4w')   return _rollDice('1d4', rng) * 7;
  if(code === '4mo')  return _rollDice('1d4', rng) * 30;
  if(code === '6mo')  return _rollDice('1d6', rng) * 30;
  if(code === '12mo') return _rollDice('1d12', rng) * 30;
  if(code === '24mo') return _rollDice('2d12', rng) * 30;
  return _rollDice(code, rng);
}
// The 2d6 Crime & Punishment modifiers (RR p.368): CHA + Diplomacy/Mystic Aura/Seduction
// proficiencies + crime severity + evidence (1d4 favorable − 1d8 unfavorable) + GM.
function _trialAbilityMod(ch, abil){
  // ACKS ability modifier table (RR p.16): 3→−3 … 18→+3.
  const v = (ch && ch.abilities && (ch.abilities[abil] != null ? ch.abilities[abil] : ch.abilities[abil && abil.toUpperCase()])) || 10;
  if(v <= 3) return -3; if(v <= 5) return -2; if(v <= 8) return -1; if(v <= 12) return 0; if(v <= 15) return 1; if(v <= 17) return 2; return 3;
}
function hijinkTrialModifiers(campaign, h, opts){
  opts = opts || {};
  const perp = ((campaign && campaign.characters) || []).find(c => c && c.id === (h && h.perpetratorCharacterId));
  const parts = [];
  let total = 0;
  const cha = _trialAbilityMod(perp, 'CHA');
  if(cha){ total += cha; parts.push({ label: 'CHA', value: cha }); }
  ['Diplomacy', 'Mystic Aura', 'Seduction'].forEach(p => { if(_hijinkHasProf(perp, p)){ total += 1; parts.push({ label: p, value: 1 }); } });
  const prof = crimeProfile(h && h.charge);
  if(prof.severity){ total += prof.severity; parts.push({ label: 'severity (' + prof.crime + ')', value: prof.severity }); }
  if(typeof opts.evidenceMod === 'number' && opts.evidenceMod){ total += opts.evidenceMod; parts.push({ label: 'evidence', value: opts.evidenceMod }); }
  if(typeof opts.attorneyMod === 'number' && opts.attorneyMod){ total += opts.attorneyMod; parts.push({ label: 'attorney/interpleader', value: opts.attorneyMod }); }
  if(typeof opts.bribeMod === 'number' && opts.bribeMod){ total += opts.bribeMod; parts.push({ label: 'bribe', value: opts.bribeMod }); }
  if(typeof opts.gmModifier === 'number' && opts.gmModifier){ total += opts.gmModifier; parts.push({ label: 'GM', value: opts.gmModifier }); }
  return { total, parts };
}
// Resolve a caught hijink's trial. opts: { plea:'guilty'|'trial', priorOffenses, rng, +trial mods }.
function resolveHijinkTrial(campaign, hijinkId, opts){
  opts = opts || {};
  const h = findHijink(campaign, hijinkId);
  if(!h) return { ok: false, error: 'unknown-hijink' };
  // RAW: a trial follows being CAUGHT — i.e. the hijink has resolved to its caught terminal
  // state (HJ-1 locks the outcome at launch but keeps it hidden until the day-tick reveals it).
  if(h.status !== 'caught') return { ok: false, error: 'not-caught', detail: 'the perpetrator has not been caught (the hijink must resolve as caught first)' };
  if(h.trial && h.trial.resolved) return { ok: false, error: 'already-tried' };
  const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
  const prof = crimeProfile(h.charge);
  const priors = Math.max(0, Math.floor(opts.priorOffenses || 0));
  const languishingDays = awaitTrialDays(h.charge, rng);
  let band, label, punishmentLevel, dieRoll = null, mods = null;
  const plea = (opts.plea === 'trial') ? 'trial' : 'guilty';
  if(plea === 'guilty'){
    // 1st catch → lesser; 2nd → standard; 3rd+ must stand trial (RR p.367).
    if(priors >= 2) return { ok: false, error: 'must-stand-trial', detail: 'a third offence must stand trial' };
    punishmentLevel = (priors === 0) ? 'lesser' : 'standard';
    band = 'plead-guilty'; label = 'Pleaded guilty';
  } else {
    mods = hijinkTrialModifiers(campaign, h, opts);
    dieRoll = _rollDice('2d6', rng);
    const adjusted = dieRoll + mods.total;
    const verdict = crimePunishmentBand(adjusted);
    band = verdict.band; label = verdict.label; punishmentLevel = verdict.punishmentLevel;
  }
  // fines: a conviction debits the fine; acquittal-with-damages awards the would-be fine TO the perpetrator.
  let fineGp = 0, damagesGp = 0;
  if(punishmentLevel === 'acquitted'){ fineGp = 0; }
  else if(punishmentLevel === 'acquitted-damages'){ damagesGp = prof.fine.standard || 0; }
  else { fineGp = prof.fine[punishmentLevel] || 0; }
  const physical = (punishmentLevel === 'acquitted' || punishmentLevel === 'acquitted-damages') ? '' : (prof.physical[punishmentLevel] || '');

  // pay the fine (boss if a syndicate member, else the perpetrator) — clamp to funds, the
  // remainder becomes indenture (RAW 3gp/month); award damages to the perpetrator.
  const A = global.ACKS;
  const payerId = h.bossCharacterId || h.perpetratorCharacterId;
  let paidGp = 0, indentureGp = 0;
  if(fineGp > 0 && payerId && typeof A.applyWealthTransfer === 'function'){
    const payer = ((campaign.characters) || []).find(c => c && c.id === payerId);
    const avail = (payer && payer.coins && Number(payer.coins.gp)) || 0;
    paidGp = Math.min(fineGp, Math.max(0, avail));
    indentureGp = fineGp - paidGp;
    if(paidGp > 0){
      const spec = { amount: paidGp, source: { kind: 'character-gp', id: payerId, label: (payer && payer.name) ? (payer.name + "'s purse") : null },
        destination: { kind: 'external', label: 'court fine (' + prof.crime + ')' }, reason: 'hijink trial fine', bucket: 'hijinks' };
      try { A.applyWealthTransfer(campaign, spec); if(typeof A.recordWealthTransfer === 'function') A.recordWealthTransfer(campaign, spec, { submittedBy: 'engine' }); } catch(e){}
    }
  } else if(damagesGp > 0 && h.perpetratorCharacterId && typeof A.applyWealthTransfer === 'function'){
    const spec = { amount: damagesGp, source: { kind: 'external', label: 'court damages' },
      destination: { kind: 'character-gp', id: h.perpetratorCharacterId, label: null }, reason: 'hijink trial damages', bucket: 'hijinks' };
    try { A.applyWealthTransfer(campaign, spec); if(typeof A.recordWealthTransfer === 'function') A.recordWealthTransfer(campaign, spec, { submittedBy: 'engine' }); } catch(e){}
  }

  const acquitted = (punishmentLevel === 'acquitted' || punishmentLevel === 'acquitted-damages');
  h.trial = { resolved: true, plea, band, label, punishmentLevel, crime: prof.crime, charge: h.charge, severity: prof.severity,
    dieRoll, adjustedRoll: (dieRoll != null && mods) ? (dieRoll + mods.total) : null, modifiers: mods ? mods.parts : [],
    languishingDays, fineGp, paidGp, indentureGp, damagesGp, physical, acquitted,
    resolvedTurn: campaign.currentTurn || 1 };

  const perpName = (() => { const c = ((campaign.characters) || []).find(x => x && x.id === h.perpetratorCharacterId); return (c && c.name) || 'The perpetrator'; })();
  let narrative;
  if(acquitted) narrative = perpName + ' is ' + (punishmentLevel === 'acquitted-damages' ? ('acquitted of ' + prof.crime + ' with ' + damagesGp.toLocaleString() + 'gp damages') : ('acquitted of ' + prof.crime)) + ' after ' + languishingDays + ' days awaiting trial.';
  else narrative = perpName + ' is convicted of ' + prof.crime + ' (' + label + ')' + (fineGp ? (' — fined ' + fineGp.toLocaleString() + 'gp' + (indentureGp ? (' (' + indentureGp.toLocaleString() + 'gp indentured)') : '')) : '') + (physical ? (' — ' + physical) : '') + '.';
  h.history.push({ turn: h.trial.resolvedTurn, type: 'tried', narrative });
  _emitSyndicateEvent(campaign, h, 'hijink-trial',
    { hijinkId: h.id, charge: h.charge, crime: prof.crime, band, punishmentLevel, fineGp, indentureGp, damagesGp, acquitted }, narrative);
  return Object.assign({ ok: true }, h.trial, { narrative });
}

// Emit a syndicate/trial event into the eventLog. Mirrors _emitHijinkEvent but takes the
// context from either a syndicate (formed/tribute) or a hijink (trial). Record-only audit.
function _emitSyndicateEvent(campaign, entity, kind, payload, narrative){
  const A = global.ACKS;
  if(typeof A.newEvent !== 'function') return null;
  const cal = campaign.calendar || {};
  const isSyndicate = entity && entity.kind === 'syndicate';
  let ev;
  try {
    ev = A.newEvent(kind, {
      submittedBy: 'engine', cadence: isSyndicate ? 'monthly-turn' : 'daily', targetTurn: campaign.currentTurn || 1,
      gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: campaign.currentDayInMonth || 1 },
      payload: Object.assign({ narrative }, payload || {})
    });
  } catch(e){ return null; }
  if(typeof A.setEventContext === 'function'){
    const related = [];
    if(isSyndicate){
      if(entity.bossCharacterId) related.push({ kind: 'character', id: entity.bossCharacterId, role: 'subject' });
      related.push({ kind: 'syndicate', id: entity.id, role: 'site' });
    } else {
      if(entity.perpetratorCharacterId) related.push({ kind: 'character', id: entity.perpetratorCharacterId, role: 'subject' });
      if(entity.bossCharacterId) related.push({ kind: 'character', id: entity.bossCharacterId, role: 'beneficiary' });
    }
    A.setEventContext(ev, {
      primaryHexId: (entity && entity.hexId) || null,
      settlementId: (entity && (entity.settlementId || entity.baseSettlementId)) || null,
      domainId: (entity && entity.domainId) || null,
      relatedEntities: related
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

// =============================================================================
// === Hijinks HJ-3 (team 2026-06-20) — syndicate depth (RR pp.358–369) ===
// The enterprise-depth layer atop HJ-2's syndicates:
//   • NAMED LIEUTENANTS — a counted member individuated into a real socialTier:'lieutenant'
//     Character bound to the boss (the gladiator/follower precedent — NO new entity). The
//     roster lives on syn.lieutenantCharacterIds[] (the single source of truth; a scan finds
//     the syndicate, so there is no back-pointer to keep in sync). A lieutenant is a normal
//     Character → startHijink works on him, and his hijink reports to his boss automatically.
//   • CREWS — multi-perpetrator coordination behind the default-OFF crew-hijinks rule. Each
//     eligible co-perpetrator grants +1 to the honcho's throw (cap +3). When the rule is OFF,
//     opts.crew is IGNORED (non-functional + hidden — principle 8).
//   • CHANGE-IN-MANAGEMENT TAKEOVER — a rival/lieutenant seizes the syndicate; the boss flips,
//     the lieutenants rebind to the new chain of command, and a 'syndicate-takeover' fires.
//   • CRIMINAL GUILDS — an init-on-write syn.guild sub-record (the senate.motions precedent; NOT
//     on blankSyndicate, so templates stay migrate-no-ops). A chartered guild's formal reach
//     raises the membership cap ×1.5.
//   • RUMOR AUTO-EMIT — the rumor-bearing hijinks (def.emitsRumor) push a rumor into
//     pendingEvents on the RAW trigger via the shipped _autoEmitRumor (Plan §7).
// OUT of scope: the bandit-captain rural syndicate (it collides with the shipped
// processBanditryForTurn — E10 banditry owns that hex).
// All additive: no new prefix/entity/collection/migration. 🔧 v1 simplifications (Mechanic
// Extensions): the crew bonus is a flat +1/eligible-member (cap +3) — a specialist-weighted
// model is a future refinement; the guild's deeper effects (turf, legal standing) are deferred.
// =============================================================================

const LIEUTENANT_SOCIAL_TIER = 'lieutenant';
const CREW_BONUS_CAP = 3;                  // 🔧 flat +1 per eligible crew member, capped
const GUILD_MIN_MARKET_INDEX = 3;          // SYNDICATE_MARKET_ORDER index of 'III' (a guild needs a substantial base)
const GUILD_MEMBERSHIP_FACTOR = 1.5;       // 🔧 a chartered guild's formal reach

function _hijinkCharActive(c){ const A = global.ACKS; return (A && typeof A.isActive === 'function') ? A.isActive(c) : !!(c && c.alive !== false); }

// ── named lieutenants (individuation) ──
function _syndicateForLieutenant(campaign, charId){
  if(!charId) return null;
  return ((campaign && campaign.syndicates) || []).find(s => s && Array.isArray(s.lieutenantCharacterIds) && s.lieutenantCharacterIds.indexOf(charId) >= 0) || null;
}
function syndicateForLieutenant(campaign, charId){ return _syndicateForLieutenant(campaign, charId); }
function syndicateLieutenants(campaign, syn){
  if(!syn || !Array.isArray(syn.lieutenantCharacterIds)) return [];
  const chars = (campaign && campaign.characters) || [];
  return syn.lieutenantCharacterIds.map(id => chars.find(c => c && c.id === id)).filter(Boolean);
}
function isSyndicateLieutenant(ch){ return !!(ch && ch.socialTier === LIEUTENANT_SOCIAL_TIER); }
function _defaultLieutenantName(syn){
  const n = ((syn && syn.lieutenantCharacterIds) || []).length + 1;
  return 'Lieutenant ' + n + (syn && syn.name ? (' of ' + syn.name) : '');
}
// individuateLieutenant — promote a counted member into a NAMED lieutenant Character (a thieving
// class so he can perpetrate), bound to the boss (liegeCharacterId) + added to the roster. Draws
// from a counted bucket at his level when present (a ruffian rises through the ranks), unless told
// not to. No event (a roster op, like addSyndicateMembers). Returns { ok, lieutenant, syndicate }.
function individuateLieutenant(campaign, synId, opts){
  opts = opts || {};
  const syn = findSyndicate(campaign, synId);
  if(!syn) return { ok:false, error:'unknown-syndicate' };
  const A = global.ACKS;
  const level = Math.max(0, Math.min(14, Math.floor((opts.level != null) ? opts.level : 1)));
  const charLevel = Math.max(1, level || 1);
  const cls = opts.class || 'Thief';
  if(opts.fromBucket !== false){
    const bucket = (syn.members || []).find(m => m && (m.level || 0) === level && (m.count || 0) > 0);
    if(bucket){ bucket.count -= 1; syn.members = (syn.members || []).filter(m => m && (m.count || 0) > 0); }
  }
  const name = opts.name || _defaultLieutenantName(syn);
  let lt;
  if(typeof A.blankCharacter === 'function'){
    lt = A.blankCharacter({ name, class: cls, level: charLevel, socialTier: LIEUTENANT_SOCIAL_TIER,
      controlledBy: 'gm', liegeCharacterId: syn.bossCharacterId || null, currentHexId: syn.hexId || null });
  } else {
    lt = { schemaVersion:2, id:'chr-'+Math.random().toString(36).slice(2,9), name, class: cls, level: charLevel,
      socialTier: LIEUTENANT_SOCIAL_TIER, controlledBy:'gm', liegeCharacterId: syn.bossCharacterId || null, alive:true,
      lifecycleState:'active', proficiencies:[], classPowers:[], abilities:{ STR:10,INT:10,WIL:10,DEX:10,CON:10,CHA:10 },
      coins:{pp:0,gp:0,ep:0,sp:0,cp:0} };
  }
  campaign.characters = campaign.characters || [];
  campaign.characters.push(lt);
  syn.lieutenantCharacterIds = Array.isArray(syn.lieutenantCharacterIds) ? syn.lieutenantCharacterIds : [];   // init-on-write
  syn.lieutenantCharacterIds.push(lt.id);
  syn.history.push({ turn: campaign.currentTurn || 1, type:'lieutenant-individuated',
    narrative: name + ' is named a lieutenant of ' + (syn.name || 'the syndicate') + '.' });
  return { ok:true, lieutenant: lt, syndicate: syn };
}

// ── crews (gated crew-hijinks) ──
function crewHijinksEnabled(campaign){
  const A = global.ACKS;
  return !!(A && typeof A.isHouseRuleEnabled === 'function' && A.isHouseRuleEnabled(campaign, 'crew-hijinks'));
}
// The valid crew for a hijink: distinct, eligible co-perpetrators other than the honcho.
function _validCrew(campaign, crewIds, type, honchoId){
  const chars = (campaign && campaign.characters) || [];
  const seen = {}, out = [];
  (crewIds || []).forEach(id => {
    if(!id || id === honchoId || seen[id]) return;
    const c = chars.find(x => x && x.id === id);
    if(c && hijinkPerpetratorEligible(c, type)){ seen[id] = true; out.push(id); }
  });
  return out;
}
function crewThrowBonus(crew){ return Math.min(CREW_BONUS_CAP, ((crew && crew.length) || 0)); }

// ── change-in-management takeover ──
// Eligible new bosses: any active eligible character other than the current boss (the syndicate's
// own lieutenants qualify — a lieutenant who is a thief/assassin/nightblade/venturer can seize it).
function syndicateTakeoverCandidates(campaign, syn){
  if(!syn) return [];
  const chars = (campaign && campaign.characters) || [];
  return chars.filter(c => c && c.id !== syn.bossCharacterId && _hijinkCharActive(c) && syndicateBossEligible(c));
}
function takeoverSyndicate(campaign, synId, opts){
  opts = opts || {};
  const syn = findSyndicate(campaign, synId);
  if(!syn) return { ok:false, error:'unknown-syndicate' };
  const newBossId = opts.newBossCharacterId;
  const newBoss = newBossId ? ((campaign.characters) || []).find(c => c && c.id === newBossId) : null;
  if(!newBoss) return { ok:false, error:'unknown-boss' };
  if(!syndicateBossEligible(newBoss)) return { ok:false, error:'boss-ineligible', detail: syndicateBossIneligibleReason(newBoss) };
  const oldBossId = syn.bossCharacterId || null;
  if(oldBossId && oldBossId === newBossId) return { ok:false, error:'already-boss' };
  syn.bossCharacterId = newBossId;
  // the new boss, if a lieutenant of this syndicate, is the boss now → drop him from the roster.
  if(Array.isArray(syn.lieutenantCharacterIds)) syn.lieutenantCharacterIds = syn.lieutenantCharacterIds.filter(id => id !== newBossId);
  // rebind the remaining lieutenants to the new chain of command.
  syndicateLieutenants(campaign, syn).forEach(lt => { if(lt) lt.liegeCharacterId = newBossId; });
  const reason = opts.reason || 'change in management';
  const oldName = (() => { const c = ((campaign.characters) || []).find(x => x && x.id === oldBossId); return (c && c.name) || (oldBossId ? 'the former boss' : 'no one'); })();
  const narrative = (newBoss.name || 'A rival') + ' seizes control of ' + (syn.name || 'the syndicate') + ' from ' + oldName + ' (' + reason + ').';
  syn.history.push({ turn: campaign.currentTurn || 1, type:'takeover', narrative, oldBossCharacterId: oldBossId, newBossCharacterId: newBossId });
  _emitSyndicateEvent(campaign, syn, 'syndicate-takeover',
    { syndicateId: syn.id, oldBossCharacterId: oldBossId, newBossCharacterId: newBossId, reason }, narrative);
  return { ok:true, syndicate: syn, oldBossCharacterId: oldBossId, newBossCharacterId: newBossId };
}

// ── criminal guilds (init-on-write sub-record) ──
function guildChartered(syn){ return !!(syn && syn.guild && syn.guild.chartered); }
function canCharterGuildReason(campaign, syn){
  if(!syn) return 'no syndicate';
  if(!syn.bossCharacterId) return 'a guild needs a boss';
  if(guildChartered(syn)) return 'already chartered as a guild';
  if(SYNDICATE_MARKET_ORDER.indexOf(syn.marketClass) < GUILD_MIN_MARKET_INDEX) return 'a criminal guild needs a Class III or larger market (RR pp.358–360)';
  return '';
}
function canCharterGuild(campaign, syn){ return canCharterGuildReason(campaign, syn) === ''; }
function charterGuild(campaign, synId, opts){
  opts = opts || {};
  const syn = findSyndicate(campaign, synId);
  if(!syn) return { ok:false, error:'unknown-syndicate' };
  const reason = canCharterGuildReason(campaign, syn);
  if(reason) return { ok:false, error:'cannot-charter', detail: reason };
  syn.guild = {   // init-on-write — NOT on blankSyndicate (the senate.motions precedent)
    chartered: true,
    name: opts.name || ((syn.name || 'The syndicate') + ' (chartered guild)'),
    charteredTurn: campaign.currentTurn || 1,
    specialties: Array.isArray(opts.specialties) ? opts.specialties.slice() : []
  };
  syn.history.push({ turn: syn.guild.charteredTurn, type:'guild-chartered',
    narrative: (syn.name || 'The syndicate') + ' is chartered as the criminal guild "' + syn.guild.name + '".' });
  return { ok:true, syndicate: syn, guild: syn.guild };
}

// ── rumor auto-emit (Plan §7) ──
// The rumor-bearing hijinks push a rumor into pendingEvents on the RAW trigger (success for most,
// CAUGHT for smuggling). Routes through the shipped _autoEmitRumor, which gates internally on the
// rumors-auto-emit house rule (a no-op when off — so this never affects a campaign that hasn't
// opted into auto-emitted rumors).
const HIJINK_RUMOR_PROFILE = Object.freeze({
  'carousing':        { trigger:'success', topic:'other',  apparentLevel:'uncommon', truthLevel:'mixed' },
  'soliciting':       { trigger:'success', topic:'other',  apparentLevel:'uncommon', truthLevel:'mixed' },
  'spying':           { trigger:'success', topic:'other',  apparentLevel:'rare',     truthLevel:'true'  },
  'treasure-hunting': { trigger:'success', topic:'wealth', apparentLevel:'rare',     truthLevel:'mixed' },
  'smuggling':        { trigger:'caught',  topic:'trade',  apparentLevel:'common',   truthLevel:'true'  }
});
function _maybeAutoEmitHijinkRumor(campaign, h, def, sourceEventId){
  const A = global.ACKS;
  if(!h || !def || !def.emitsRumor || typeof A._autoEmitRumor !== 'function') return;
  const prof = HIJINK_RUMOR_PROFILE[h.type];
  if(!prof || prof.trigger !== h.outcome) return;
  const ev = A._autoEmitRumor(campaign, {
    submittedBy:'engine', settlementId: h.settlementId || null, domainId: h.domainId || null,
    topic: prof.topic, apparentLevel: prof.apparentLevel, truthLevel: prof.truthLevel,
    rumorText:'', sourceCharacterId: h.perpetratorCharacterId || null, sourceEventId: sourceEventId || null
  });
  if(ev) h.rumorEmitted = true;
}

Object.assign(ACKS, {
  HIJINK_DEFINITIONS, HIJINK_TYPES, HIJINK_THIEF_CLASSES,
  blankHijink, hijinkDefinition, hijinkTypes,
  hijinkPerpetratorEligible, hijinkIneligibleReason, hijinkThrowProfile, hijinkResolveThrow,
  startHijink, proposeHijinkDay, commitHijinkRecord,
  findHijink, hijinksForPerpetrator, hijinksAtSettlement, activeHijinks, hijinkPhaseLabel,
  // === Hijinks HJ-2 (team 2026-06-13) — syndicates / tribute / trials ===
  MARKET_SYNDICATE_CAPS, MONTHLY_MEMBER_TRIBUTE, SYNDICATE_BOSS_CLASSES, SYNDICATE_MARKET_ORDER,
  CRIME_PROFILES, CRIME_ALIASES,
  blankSyndicate, formSyndicate, findSyndicate, syndicatesForBoss, syndicatesAtSettlement, activeSyndicates,
  addSyndicateMembers, removeSyndicateMembers,
  syndicateMaxEffectiveLevel, syndicateEffectiveHideoutGp, syndicateMaxMembers, syndicateMemberCount,
  syndicateBossEligible, syndicateBossIneligibleReason,
  memberMonthlyTribute, syndicateMonthlyTribute, collectSyndicateTribute, processSyndicateTributeForTurn,
  crimeProfile, awaitTrialDays, crimePunishmentBand, hijinkTrialModifiers, resolveHijinkTrial,
  // === Hijinks HJ-3 (team 2026-06-20) — syndicate depth (lieutenants / crews / takeover / guilds / rumor) ===
  LIEUTENANT_SOCIAL_TIER, CREW_BONUS_CAP, HIJINK_RUMOR_PROFILE,
  individuateLieutenant, syndicateLieutenants, syndicateForLieutenant, isSyndicateLieutenant,
  crewHijinksEnabled, crewThrowBonus,
  syndicateTakeoverCandidates, takeoverSyndicate,
  guildChartered, canCharterGuild, canCharterGuildReason, charterGuild
});

if(typeof module !== 'undefined' && module.exports) module.exports = ACKS;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
