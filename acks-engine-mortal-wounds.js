/* =============================================================================
 * acks-engine-mortal-wounds.js — ACKS God Mode · Delves D1
 * The Mortal Wounds resolver — the shared casualty primitive.
 *
 * RAW: RR pp.300–301 ("Effects of Damage" / "Healing" — the 1d20+1d6 roll, the full
 *   modifier set, incapacitation + the bed-rest windows) + RR Appendix C "Wounds and
 *   Woe" pp.517–523 (the per-damage-type Mortal Wounds tables; the **Savage** table on
 *   p.523, used for natural-weapon piercing/slashing — i.e. most monster kills). The
 *   Condition & Recovery ladder is IDENTICAL across every damage table (RAW-verified);
 *   only the 1d6 permanent-wound column differs by damage type.
 *
 * SCOPE (D1): the resolver itself — the RAW table + rollMortalWound + applyMortalWound +
 *   the convalescence day-tick consumer (slot 58) + a minimal Tampering-with-Mortality
 *   side-effect primitive (the mortalityPenalty half). It CREATES the character wound
 *   fields reserved since the recruitment work (permanentWoundPenalty / mortalityPenalty)
 *   and the new character.mortalWounds[] record array.
 *
 *   DELIBERATELY NOT WIRED THIS BURST (post-merge follow-on): the W3 battle aftermath +
 *   the Delves abstract resolvers both CALL applyMortalWound (Plan §5.4 / §6.4; the
 *   integration review §4.2 names this the casualty primitive) — but agent-1 owns the
 *   battle files this burst, so the one-line call is left as a follow-on (see the SUMMARY).
 *   The full restore-life / resurrection ECONOMY (gp costs, the restore-life spell) stays
 *   Phase 6 Tampering (Plan §7.4) — only the side-effect-PENALTY accrual lands here.
 *
 * IP boundary (CLAUDE §13.6 / Plan §7.5): the RAW table CELLS are flavorful prose
 *   ("Your eyes are a delicious treat") — copyrightable EXPRESSION, not mechanical fact.
 *   So this module ships the mechanical SKELETON only: the d20 condition bands + recovery
 *   rules + the modifier set + the 1d6 permanent-wound MECHANICAL effects (paraphrased in
 *   our own words — the MORALE_STATE_TEXT precedent, v0.20.0). No prose flavor is copied;
 *   each table carries a page cite so a GM can read the descriptions in the book.
 *
 * Load order: AFTER acks-engine.js (registerDayConsumer / setEventContext / addCharacterHistory)
 *   and acks-engine-events.js (newEvent + the registered mortal-wound / wound-recovery kinds).
 *   In the test harness it auto-loads after the canonical set (tests/_engine.js glob). The
 *   module self-registers the slot-58 'convalescence' day-consumer (the weather/hijinks pattern).
 *
 * Polarity (CLAUDE §6): Mortal Wounds are CORE RAW — no master house-rule gate.
 * =============================================================================
 */
(function(global){
'use strict';
const ACKS = global.ACKS = global.ACKS || {};

// ── RAW page citations (kept as data so the UI + records can surface them) ──
const MORTAL_WOUNDS_CITE = 'RR pp.300–301 + Appendix C pp.517–523';

// =============================================================================
// The Condition & Recovery ladder (RR p.517). RAW-verified IDENTICAL across all
// eight damage tables, so it lives once here keyed by the MODIFIED 1d20.
//   killed                 — instantly slain (RR: the "-6 or less" + "-5 to 0" rows; the
//                            two rows differ only in corpse flavor, which is mechanically
//                            moot, so they collapse to one band ≤ 0).
//   healToOneHpWindow      — the 1–15 bands DIE unless healed to 1 hp within this window;
//                            if healed, they then need `bedRestDays` of convalescence.
//   recoversAutomatically  — the 16+ bands wake with 1 hp; they need bed rest (which magical
//                            healing can shorten to `magicalShortensToDays`).
// =============================================================================
const MORTAL_WOUND_CONDITIONS = [
  { id:'instantly-killed',  min:-Infinity, max:0,  label:'Instantly killed',
    killed:true,  recoversAutomatically:false, healToOneHpWindow:null, bedRestDays:0,  bedRestLabel:'—' },
  { id:'mortally-wounded',  min:1,  max:5,  label:'Mortally wounded',
    killed:false, recoversAutomatically:false, healToOneHpWindow:'1 round', bedRestDays:30, bedRestLabel:'1 month',
    magicalShortensToDays:null },
  { id:'grievously-wounded',min:6,  max:10, label:'Grievously wounded',
    killed:false, recoversAutomatically:false, healToOneHpWindow:'1 turn',  bedRestDays:14, bedRestLabel:'2 weeks',
    magicalShortensToDays:null },
  { id:'critically-wounded',min:11, max:15, label:'Critically wounded',
    killed:false, recoversAutomatically:false, healToOneHpWindow:'1 day',   bedRestDays:7,  bedRestLabel:'1 week',
    magicalShortensToDays:null },
  { id:'in-shock',          min:16, max:20, label:'In shock',
    killed:false, recoversAutomatically:true,  healToOneHpWindow:null, bedRestDays:7,  bedRestLabel:'1 week',
    magicalShortensToDays:1, magicalShortensLabel:'1 night + magical healing' },
  { id:'knocked-out',       min:21, max:25, label:'Knocked out',
    killed:false, recoversAutomatically:true,  healToOneHpWindow:null, bedRestDays:1,  bedRestLabel:'1 night',
    magicalShortensToDays:0, magicalShortensLabel:'instant with magical healing' },
  { id:'just-dazed',        min:26, max:Infinity, label:'Just dazed',
    killed:false, recoversAutomatically:true,  healToOneHpWindow:null, bedRestDays:0,  bedRestLabel:'none' }
];
function conditionForModifiedD20(n){
  n = Number(n) || 0;
  for(const b of MORTAL_WOUND_CONDITIONS){ if(n >= b.min && n <= b.max) return b; }
  return MORTAL_WOUND_CONDITIONS[0];
}
function conditionById(id){ return MORTAL_WOUND_CONDITIONS.find(b => b.id === id) || null; }

// =============================================================================
// The d20 modifier set (RR pp.300–301 / p.517). The ABSTRACT subset (JJ p.276 / p.284)
// uses ONLY Constitution, Hit-Die value, and equipment (heavy helm) — nothing else.
// =============================================================================
const MORTAL_WOUND_MODIFIERS = Object.freeze({
  // keys present in the FULL roll; the abstract roll restricts to the subset below.
  full: ['con','hd','heavyHelm','hpAtFall','healingMagic','healingProf','horsetail','necromantic','treatmentTiming'],
  abstract: ['con','hd','heavyHelm']
});
// HD value bonus by hit-die size (RR p.300: +2 d6 / +4 d8 / +6 d10 / +8 d12; d4 = 0).
const HIT_DIE_VALUE_BONUS = Object.freeze({ d4:0, d6:2, d8:4, d10:6, d12:8 });
// Treatment-timing modifier (RR p.300/p.517). The keys the Record-a-wound modal offers.
const TREATMENT_TIMING_MODS = Object.freeze({
  'within-1-round': +2, 'within-1-turn': -3, 'within-1-hour': -5, 'within-1-day': -8, 'over-1-day': -10
});
const TREATMENT_TIMING_LABELS = Object.freeze({
  'within-1-round':'Treated within 1 round (+2)', 'within-1-turn':'Treated within 1 turn (−3)',
  'within-1-hour':'Treated within 1 hour (−5)',   'within-1-day':'Treated within 1 day (−8)',
  'over-1-day':'Treated more than 1 day later (−10)'
});

// The 12 RAW damage types → the Appendix-C table that covers them + its page cite. The
// CONDITION ladder is shared, so every type resolves; the 1d6 permanent-wound COLUMN is
// authored for 'savage' (the required table — natural-weapon kills, the abstract default);
// other types share the ladder and page-cite their own column (v1 — see §7.5 / the SUMMARY).
const DAMAGE_TYPE_TABLE = Object.freeze({
  acidic:'energy', acid:'energy', electric:'energy', fire:'energy', luminous:'energy',
  arcane:'concussive', bludgeoning:'concussive', seismic:'concussive',
  cold:'cold', necrotic:'necrotic', piercing:'piercing', poisonous:'poisonous',
  slashing:'savage', savage:'savage'
});
const DAMAGE_TABLE_META = Object.freeze({
  energy:    { label:'Acid / Electrical / Fire / Luminous', cite:'RR p.517' },
  concussive:{ label:'Arcane / Bludgeoning / Seismic',      cite:'RR p.518' },
  cold:      { label:'Cold',      cite:'RR p.519' },
  necrotic:  { label:'Necrotic',  cite:'RR p.520' },
  piercing:  { label:'Piercing',  cite:'RR p.522' },
  poisonous: { label:'Poisonous', cite:'RR p.523' },
  savage:    { label:'Savage',    cite:'RR p.523' }
});
const DAMAGE_TYPES = Object.freeze(Object.keys(DAMAGE_TYPE_TABLE));

// =============================================================================
// The 1d6 permanent-wound column — the MECHANICAL effects (paraphrased facts, our own
// words; the RAW prose flavor is NOT reproduced — §7.5). Keyed by [conditionId][1d6].
// Each cell: { effect, lasting, scarring } — `lasting` = a real disability that accrues a
// standing permanentWoundPenalty (the RR p.166 loyalty ledger); minor scarring / a
// no-game-effect result is NOT lasting. The killed band has no permanent wound (moot).
// Only 'savage' is authored in v1 (the abstract default + the required table).
// =============================================================================
const SAVAGE_PERMANENT_WOUNDS = {
  'mortally-wounded': {
    6:{ effect:'Tongue & lips lost — mute; cannot speak, cast, or use speech-based items; −4 reaction', lasting:true },
    5:{ effect:'Both eyes lost — blinded; −4 attack, no line of sight, move ⅓, −2 surprise', lasting:true },
    4:{ effect:'Both arms lost — cannot climb, wield weapons/items, open locks, or disarm traps', lasting:true },
    3:{ effect:'Both legs lost — DEX 3 for AC, two crutches, move −60′, cannot force march', lasting:true },
    2:{ effect:'Spine snapped at the waist — as both legs lost; cannot reproduce; Death save each year or die', lasting:true },
    1:{ effect:'Spine broken at the neck — DEX 3, cannot move/fight/use items/cast; Death save each month or die', lasting:true }
  },
  'grievously-wounded': {
    6:{ effect:'Throat nearly torn — raspy voice; −2 to throws involving speech', lasting:true },
    5:{ effect:'One eye lost — −2 to missile attack throws', lasting:true },
    4:{ effect:'One arm lost — cannot climb, use a shield, dual-wield, or use two-handed weapons', lasting:true },
    3:{ effect:'One leg lost — crutch; move −30′; DEX −⅓ for AC', lasting:true },
    2:{ effect:'Entrails ruined — rest 2 turns of 6; CON −⅓; −4 save vs poison; −4 reaction', lasting:true },
    1:{ effect:'Half the face gnawed off (eye + ear + nose) — as eye + ear lost, gruesome scarring', lasting:true }
  },
  'critically-wounded': {
    6:{ effect:'Faint fang-marks on the neck — minor scarring (no game effect)', lasting:false, scarring:'minor' },
    5:{ effect:'Bite-marked neck — notable scarring (−2 to impersonate)', lasting:true, scarring:'notable' },
    4:{ effect:'One hand lost — cannot dual-wield or use two-handed weapons', lasting:true },
    3:{ effect:'One foot lost — peg; move −30′; DEX −⅓ for AC', lasting:true },
    2:{ effect:'Genitals lost — cannot reproduce; −3 reaction if known', lasting:true },
    1:{ effect:'Half the face mauled (eye + ear) — as eye clawed out + ear bitten off', lasting:true }
  },
  'in-shock': {
    6:{ effect:'Ghostly visions on waking — no game effect', lasting:false },
    5:{ effect:'Smallest finger lost (3 lost on a hand = useless hand)', lasting:true },
    4:{ effect:'1d3 fingers lost on one hand (3 = useless hand)', lasting:true },
    3:{ effect:'1d3 toes lost on one foot (3 = useless foot)', lasting:true },
    2:{ effect:'One ear lost — −1 Listening, −1 surprise', lasting:true },
    1:{ effect:'Nose lost / lips ruined — gruesome scarring (+1 intimidate, cannot impersonate, −2 other reactions)', lasting:true, scarring:'gruesome' }
  },
  'knocked-out': {
    6:{ effect:'A vision of the afterlife, then waking — no game effect', lasting:false },
    5:{ effect:'Ghostly visions on waking — no game effect', lasting:false },
    4:{ effect:'A fang-mark scar on the hand — minor scarring (no game effect)', lasting:false, scarring:'minor' },
    3:{ effect:'Bite-marked neck — notable scarring (−2 to impersonate)', lasting:true, scarring:'notable' },
    2:{ effect:'Calf nearly chewed through — cannot force march unless mounted', lasting:true },
    1:{ effect:'Ragged wounds heal stiff — −1 to all initiative rolls', lasting:true }
  },
  'just-dazed': {
    6:{ effect:'The Choosers of the Slain pass you by — no game effect', lasting:false },
    5:{ effect:'A vision of the afterlife — no game effect', lasting:false },
    4:{ effect:'Ghostly visions on waking — no game effect', lasting:false },
    3:{ effect:'A claw-mark on the cheek — minor scarring (no game effect)', lasting:false, scarring:'minor' },
    2:{ effect:'Claw & fang scars on the cheek — notable scarring (−2 to impersonate)', lasting:true, scarring:'notable' },
    1:{ effect:'Lasting wounds ache in foul weather — −1 initiative in Cold/Frigid/Drizzly/Rainy weather', lasting:true }
  }
};
// MORTAL_WOUNDS — the authored per-table permanent-wound data. 'savage' is filled; other
// tables fall back to a generic-by-band descriptor + their page cite (the ladder is shared).
const MORTAL_WOUNDS = Object.freeze({ savage: SAVAGE_PERMANENT_WOUNDS });

// Resolve a permanent wound from (conditionId, 1d6) for a damage type. Returns
// { effect, lasting, scarring, cite } — or null for a killed result (moot).
function permanentWoundFor(damageType, conditionId, d6){
  if(conditionId === 'instantly-killed') return null;
  const tableKey = DAMAGE_TYPE_TABLE[damageType] || 'savage';
  const meta = DAMAGE_TABLE_META[tableKey] || DAMAGE_TABLE_META.savage;
  const authored = MORTAL_WOUNDS[tableKey];
  if(authored && authored[conditionId] && authored[conditionId][d6]){
    return Object.assign({ cite: meta.cite }, authored[conditionId][d6]);
  }
  // Generic fallback — the condition ladder is shared, but this table's specific 1d6 column
  // is not authored in v1: a lasting wound at this severity, see the book for the description.
  const severe = (conditionId === 'mortally-wounded' || conditionId === 'grievously-wounded' || conditionId === 'critically-wounded');
  return { effect: 'Permanent wound (1d6 = ' + d6 + ') — see the ' + meta.label + ' table for the description', lasting: severe, cite: meta.cite };
}

// =============================================================================
// Dice + ability helpers (kept local so the module is self-sufficient).
// =============================================================================
function _d(sides, rng){ const r = (typeof rng === 'function') ? rng() : Math.random(); return Math.floor(r * sides) + 1; }
// ACKS II ability modifier (RR p.17): 3→−3, 4–5→−2, 6–8→−1, 9–12→0, 13–15→+1, 16–17→+2, 18→+3.
function abilityMod(score){
  score = Number(score) || 10;
  if(score <= 3) return -3; if(score <= 5) return -2; if(score <= 8) return -1;
  if(score <= 12) return 0; if(score <= 15) return 1; if(score <= 17) return 2; return 3;
}
// Best-effort hit-die size for a character: an explicit opts.hitDieType wins, else parse
// hp.hitDice ('1d8' → 'd8'), else null (no HD bonus — the GM can set it in the modal).
function _hitDieType(character, opts){
  if(opts && opts.hitDieType) return String(opts.hitDieType).toLowerCase();
  const hd = character && character.hp && character.hp.hitDice;
  const m = hd && String(hd).match(/d(\d+)/i);
  return m ? ('d' + m[1]) : null;
}

// Build the d20 modifier breakdown (RR pp.300–301). opts.abstract restricts to CON/HD/helm.
function mortalWoundModifierBreakdown(character, opts){
  opts = opts || {};
  const abstract = opts.abstract === true;
  const allow = abstract ? MORTAL_WOUND_MODIFIERS.abstract : MORTAL_WOUND_MODIFIERS.full;
  const rows = [];
  const add = (key, label, value) => { if(allow.indexOf(key) >= 0 && value) rows.push({ key, label, value }); };

  const con = (opts.conMod != null) ? Number(opts.conMod)
            : abilityMod(character && character.abilities && character.abilities.CON);
  add('con', 'Constitution', con);

  const die = _hitDieType(character, opts);
  const hd = (opts.hdBonus != null) ? Number(opts.hdBonus) : (die ? (HIT_DIE_VALUE_BONUS[die] || 0) : 0);
  if(allow.indexOf('hd') >= 0 && hd) rows.push({ key:'hd', label:'Hit-die value' + (die ? (' (' + die + ')') : ''), value: hd });

  if(opts.heavyHelm) add('heavyHelm', 'Heavy helm', +2);

  // Full-only modifiers.
  if(!abstract){
    if(opts.hpAtFall != null) add('hpAtFall', 'Hit points at fall', Number(opts.hpAtFall));
    if(opts.healingMagicLevel) add('healingMagic', 'Healing magic (+1/level)', Number(opts.healingMagicLevel));
    if(opts.healingProfRank)   add('healingProf', 'Healing proficiency (+1/rank)', Number(opts.healingProfRank));
    if(opts.horsetail)         add('horsetail', 'Horsetail herb', +2);
    if(opts.necromanticSpellLevel) add('necromantic', 'Necromantic trigger (−½ spell level)', -Math.ceil(Number(opts.necromanticSpellLevel)/2));
    if(opts.treatmentTiming && TREATMENT_TIMING_MODS[opts.treatmentTiming] != null){
      add('treatmentTiming', TREATMENT_TIMING_LABELS[opts.treatmentTiming] || 'Treatment timing', TREATMENT_TIMING_MODS[opts.treatmentTiming]);
    }
  }
  const total = rows.reduce((s, r) => s + (Number(r.value) || 0), 0);
  return { rows, total, abstract };
}

// =============================================================================
// rollMortalWound — the PURE resolver (RR p.300). Rolls 1d20 (→ condition) + 1d6 (→
// permanent wound), applies the modifier set, returns a structured result. Does NOT
// mutate. opts.conditionId / opts.forcedD20 / opts.forcedD6 let the GM modal set values
// directly (a manual entry / pick-the-band path) instead of rolling.
//   `rollMortalWounds` is an alias (the handoff spelling).
// =============================================================================
function rollMortalWound(character, opts){
  opts = opts || {};
  const damageType = (opts.damageType || 'savage').toLowerCase();
  const breakdown = mortalWoundModifierBreakdown(character, opts);
  const d20 = (opts.forcedD20 != null) ? Number(opts.forcedD20) : _d(20, opts.rng);
  const d6  = (opts.forcedD6  != null) ? Number(opts.forcedD6)  : _d(6,  opts.rng);
  const modified = d20 + breakdown.total;
  // A GM may pick the band directly (opts.conditionId) without rolling the d20.
  const condition = opts.conditionId ? (conditionById(opts.conditionId) || conditionForModifiedD20(modified))
                                     : conditionForModifiedD20(modified);
  const permanentWound = permanentWoundFor(damageType, condition.id, d6);
  return {
    damageType,
    tableKey: DAMAGE_TYPE_TABLE[damageType] || 'savage',
    cite: (DAMAGE_TABLE_META[DAMAGE_TYPE_TABLE[damageType] || 'savage'] || {}).cite || 'RR p.523',
    abstract: breakdown.abstract,
    d20, d6, modifierTotal: breakdown.total, modifierBreakdown: breakdown.rows, modified,
    conditionId: condition.id, conditionLabel: condition.label,
    killed: !!condition.killed,
    recoversAutomatically: !!condition.recoversAutomatically,
    healToOneHpWindow: condition.healToOneHpWindow || null,
    bedRestDays: condition.bedRestDays || 0,
    bedRestLabel: condition.bedRestLabel || '—',
    magicalShortensToDays: (condition.magicalShortensToDays != null ? condition.magicalShortensToDays : null),
    permanentWound: permanentWound,            // null for a killed result
    lastingWound: !!(permanentWound && permanentWound.lasting)
  };
}

// =============================================================================
// applyMortalWound — mutate the character per a rollMortalWound result. Pushes the wound
// record, sets lifecycleState, accrues the standing permanentWoundPenalty (RR p.166 ledger),
// starts the convalescence clock, and emits the `mortal-wound` event (context envelope).
//   opts.healedToOneHp — for the 1–15 bands (mortal/grievous/critical) the combatant DIES
//     unless healed to 1 hp within the window (RR p.300). Default TRUE (the party stabilised
//     them → incapacitated + bed rest); pass false to record a death in the window.
//   opts.magicalHealing — shortens the 16+ bands' bed rest to magicalShortensToDays.
// Returns the pushed wound record (with `outcome`).
// =============================================================================
function _findCharacter(campaign, id){
  return (campaign && Array.isArray(campaign.characters)) ? (campaign.characters.find(c => c && c.id === id) || null) : null;
}
function applyMortalWound(campaign, characterId, woundResult, opts){
  opts = opts || {};
  const c = (characterId && typeof characterId === 'object') ? characterId : _findCharacter(campaign, characterId);
  if(!c || !woundResult) return null;
  if(!Array.isArray(c.mortalWounds)) c.mortalWounds = [];

  const cond = woundResult.conditionId;
  const needsEmergencyHealing = !woundResult.killed && !woundResult.recoversAutomatically; // the 1–15 bands
  const healedToOneHp = (opts.healedToOneHp === false) ? false : true;
  const died = woundResult.killed || (needsEmergencyHealing && !healedToOneHp);

  // Bed rest: 16+ bands can shorten with magical healing; 1–15 healed bands use the full window.
  let bedRestDays = woundResult.bedRestDays || 0;
  if(!died && woundResult.recoversAutomatically && opts.magicalHealing && woundResult.magicalShortensToDays != null){
    bedRestDays = woundResult.magicalShortensToDays;
  }

  const rec = {
    table: woundResult.tableKey || 'savage',
    damageType: woundResult.damageType || 'savage',
    d20: woundResult.d20, d6: woundResult.d6, modified: woundResult.modified,
    condition: cond, conditionLabel: woundResult.conditionLabel,
    permanentWound: woundResult.permanentWound ? woundResult.permanentWound.effect : null,
    permanentWoundLasting: !!(woundResult.permanentWound && woundResult.permanentWound.lasting),
    healToOneHpWindow: woundResult.healToOneHpWindow || null,
    needsEmergencyHealing, healedToOneHp,
    bedRestDays, bedRestDaysRemaining: died ? 0 : bedRestDays,
    incurredAtTurn: (campaign && campaign.currentTurn) || 1,
    incurredAtDay:  (campaign && campaign.currentDayInMonth) || 1,
    outcome: died ? 'killed' : (bedRestDays > 0 ? 'incapacitated' : 'recovered'),
    resolved: died ? true : (bedRestDays <= 0),   // dazed (0 days) resolves at once; killed needs no convalescence
    eventId: null
  };
  c.mortalWounds.push(rec);

  if(died){
    c.lifecycleState = 'deceased';
    c.alive = false;                              // keep the engine's alive/deceased pair in lockstep
  } else {
    // A LASTING permanent wound carries a standing loyalty penalty until cured (RR p.166;
    // the hireling-restored 'wound' kind resets it). Each lasting wound −1, clamped to −3.
    if(rec.permanentWoundLasting){
      const cur = Number(c.permanentWoundPenalty) || 0;
      c.permanentWoundPenalty = Math.max(-3, cur - 1);
    }
    if(bedRestDays > 0) c.lifecycleState = 'incapacitated';
    // else (dazed) — lifecycleState left as-is (active).
  }

  // History + the record-only event (context envelope: the character as subject).
  const summary = c.name + (died ? (' is slain (' + rec.conditionLabel + ')')
                                  : (' — ' + rec.conditionLabel + (rec.permanentWound ? (': ' + rec.permanentWound) : '')));
  try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'mortal-wound', summary, { conditionId: cond }); } catch(_e){}
  const ev = _emitMortalWoundEvent(campaign, c, 'mortal-wound', {
    characterId: c.id, table: rec.table, damageType: rec.damageType,
    d20: rec.d20, d6: rec.d6, modified: rec.modified, condition: cond,
    permanentWound: rec.permanentWound, outcome: rec.outcome,
    bedRestDays: rec.bedRestDays, narrative: summary
  }, summary);
  if(ev) rec.eventId = ev.id;
  return rec;
}

// =============================================================================
// Tampering with Mortality — the mortality side-effect primitive (RR p.301 / p.524). The
// MINIMAL slice: when a slain character is restored to life, a 1d20 (+ the state-of-body /
// state-of-soul / span-of-life / spellcaster-power modifiers) rolls a permanent side-effect
// whose magnitude accrues to the cumulative mortalityPenalty (RR p.166 ledger; the
// hireling-restored 'mortality-side-effect' kind relieves it). The full resurrection ECONOMY
// (gp costs, the restore-life spell) stays Phase 6 Tampering (Plan §7.4). The alignment-keyed
// side-effect PROSE lives in the book (§7.5) — we ship the penalty magnitude + a page cite.
// =============================================================================
const TAMPERING_BANDS = [
  { id:'severe',   min:-Infinity, max:5,  label:'Severe side effect',   mortalityDelta:-3 },
  { id:'major',    min:6,  max:10, label:'Major side effect',    mortalityDelta:-2 },
  { id:'moderate', min:11, max:15, label:'Moderate side effect', mortalityDelta:-1 },
  { id:'minor',    min:16, max:Infinity, label:'Minor side effect', mortalityDelta:0 }
];
function tamperingBandForModified(n){ n = Number(n)||0; for(const b of TAMPERING_BANDS){ if(n>=b.min && n<=b.max) return b; } return TAMPERING_BANDS[0]; }
function rollTamperingWithMortality(character, opts){
  opts = opts || {};
  const rows = [];
  const wil = (opts.wilMod != null) ? Number(opts.wilMod) : abilityMod(character && character.abilities && character.abilities.WIL);
  if(wil) rows.push({ key:'wil', label:'Will', value: wil });
  if(opts.spellcasterPower)   rows.push({ key:'spellcaster', label:'Spellcaster power', value: Number(opts.spellcasterPower) });
  if(opts.stateOfBody)        rows.push({ key:'body', label:'State of the body', value: Math.max(-10, Number(opts.stateOfBody)) });
  if(opts.daysDead)           rows.push({ key:'days-dead', label:'Days dead (−1/day)', value: -Math.abs(Number(opts.daysDead)) });
  if(opts.priorSideEffects)   rows.push({ key:'prior', label:'Prior side effects (−1 each)', value: -Math.abs(Number(opts.priorSideEffects)) });
  if(opts.stillAlive)         rows.push({ key:'alive', label:'Still alive (+5)', value: +5 });
  const total = rows.reduce((s,r)=>s+(Number(r.value)||0),0);
  const d20 = (opts.forcedD20 != null) ? Number(opts.forcedD20) : _d(20, opts.rng);
  const d6  = (opts.forcedD6  != null) ? Number(opts.forcedD6)  : _d(6,  opts.rng);
  const modified = d20 + total;
  const band = opts.bandId ? (TAMPERING_BANDS.find(b=>b.id===opts.bandId) || tamperingBandForModified(modified)) : tamperingBandForModified(modified);
  return {
    d20, d6, modifierTotal: total, modifierBreakdown: rows, modified,
    bandId: band.id, bandLabel: band.label, mortalityDelta: band.mortalityDelta,
    cite: 'RR pp.301, 524 (Tampering with Mortality)'
  };
}
// Accrue a Tampering side-effect's permanent mortalityPenalty (cumulative, ≤ 0).
function applyTamperingSideEffect(campaign, characterId, result, opts){
  opts = opts || {};
  const c = (characterId && typeof characterId === 'object') ? characterId : _findCharacter(campaign, characterId);
  if(!c || !result) return null;
  const delta = Number(result.mortalityDelta) || 0;
  if(delta) c.mortalityPenalty = (Number(c.mortalityPenalty) || 0) + delta;   // already ≤ 0
  const summary = c.name + ' suffers a Tampering side effect (' + result.bandLabel + (delta ? (', mortality ' + delta) : '') + ')';
  try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'tampering-side-effect', summary, { bandId: result.bandId }); } catch(_e){}
  const ev = _emitMortalWoundEvent(campaign, c, 'mortal-wound', {
    characterId: c.id, tampering: true, bandId: result.bandId,
    mortalityDelta: delta, d20: result.d20, d6: result.d6, narrative: summary
  }, summary);
  return { delta, eventId: ev ? ev.id : null };
}

// =============================================================================
// Convalescence — the recovery cadence (RR p.301 incapacitation + bed rest). A slot-58
// day-tick consumer advances each incapacitated character's wound bed-rest by one day, and
// recovers them (lifecycleState → active) when the rest is done. PURE handler proposes;
// commit applies + the pipeline emits the `wound-recovery` notable (context envelope).
// =============================================================================
function characterActiveWounds(character){
  if(!character || !Array.isArray(character.mortalWounds)) return [];
  return character.mortalWounds.filter(w => w && !w.resolved && w.outcome !== 'killed');
}
function characterConvalescence(character){
  const healing = characterActiveWounds(character).filter(w => (w.bedRestDaysRemaining || 0) > 0);
  const daysRemaining = healing.reduce((m, w) => Math.max(m, w.bedRestDaysRemaining || 0), 0);
  return {
    incapacitated: character && character.lifecycleState === 'incapacitated',
    daysRemaining, woundsHealing: healing
  };
}
// Are any characters convalescing? (Used by the UI to know whether the consumer has work.)
function anyConvalescing(campaign){
  return !!(campaign && Array.isArray(campaign.characters) &&
            campaign.characters.some(c => characterActiveWounds(c).some(w => (w.bedRestDaysRemaining||0) > 0)));
}

// PURE — propose one day of convalescence advance for every recovering character.
function proposeConvalescenceDay(campaign, ctx){
  ctx = ctx || {};
  const days = (typeof ctx.days === 'number' && ctx.days > 0) ? ctx.days : 1;
  const out = { pendingRecords: [], notableEvents: [], encounters: [] };
  (campaign && campaign.characters || []).forEach(c => {
    characterActiveWounds(c).forEach((w, wi) => {
      const remaining = w.bedRestDaysRemaining || 0;
      if(remaining <= 0) return;
      const after = Math.max(0, remaining - days);
      const recovered = after <= 0;
      out.pendingRecords.push({
        type: 'convalescence', characterId: c.id, characterName: c.name,
        woundIndex: wi, conditionLabel: w.conditionLabel,
        remainingBefore: remaining, remainingAfter: after, recovered
      });
      if(recovered){
        const summary = c.name + ' recovers from ' + (w.conditionLabel || 'their wounds');
        out.notableEvents.push({
          kind: 'wound-recovery', type: 'convalescence', label: summary, summary,
          primaryHexId: c.currentHexId || null,
          relatedEntities: [{ kind:'character', id: c.id, role:'subject' }],
          payload: { characterId: c.id, woundIndex: wi, condition: w.condition, narrative: summary }
        });
      } else {
        out.notableEvents.push({
          type: 'convalescence', transient: true,
          label: c.name + ' convalescing — ' + after + ' day(s) of bed rest left',
          summary: c.name + ' convalescing'
        });
      }
    });
  });
  return out;
}
// Apply one ratified convalescence record (commit half).
function commitConvalescenceRecord(campaign, record){
  if(!campaign || !record || record.type !== 'convalescence') return;
  const c = _findCharacter(campaign, record.characterId);
  if(!c || !Array.isArray(c.mortalWounds)) return;
  const w = c.mortalWounds.filter(x => x && !x.resolved && x.outcome !== 'killed')[record.woundIndex]
         || c.mortalWounds[record.woundIndex];
  if(!w) return;
  w.bedRestDaysRemaining = record.remainingAfter;
  if(record.recovered){
    w.resolved = true;
    w.recoveredAtTurn = campaign.currentTurn || 1;
    // If no other wound still needs bed rest, the character is back on their feet.
    if(c.lifecycleState === 'incapacitated' && !characterActiveWounds(c).some(x => (x.bedRestDaysRemaining||0) > 0)){
      c.lifecycleState = 'active';
    }
    try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'wound-recovery', c.name + ' recovers from ' + (w.conditionLabel || 'their wounds'), {}); } catch(_e){}
  }
}
// Direct (non-day-tick) advance — the monthly turn / a GM "rest N days" can call this.
function advanceConvalescence(campaign, days){
  days = (typeof days === 'number' && days > 0) ? days : 1;
  const prop = proposeConvalescenceDay(campaign, { days });
  prop.pendingRecords.forEach(r => commitConvalescenceRecord(campaign, r));
  return prop;
}

// =============================================================================
// Event emit — the record-only audit pattern (the hijinks / banditry idiom). newEvent +
// setEventContext + push (the engine-internal _logAppliedEvent shape, replicated since it
// isn't exported). cadence 'daily'; the character rides the context envelope.
// =============================================================================
function _emitMortalWoundEvent(campaign, c, kind, payload, narrative){
  const A = global.ACKS;
  if(!A || typeof A.newEvent !== 'function') return null;
  const cal = (campaign && campaign.calendar) || {};
  let ev;
  try {
    ev = A.newEvent(kind, {
      submittedBy: 'engine', cadence: 'daily', targetTurn: (campaign && campaign.currentTurn) || 1,
      gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: (campaign && campaign.currentDayInMonth) || 1 },
      payload: Object.assign({ narrative }, payload || {})
    });
  } catch(_e){ return null; }
  if(typeof A.setEventContext === 'function'){
    A.setEventContext(ev, {
      primaryHexId: (c && c.currentHexId) || null,
      domainId: (c && c.currentDomainId) || null,
      relatedEntities: [{ kind:'character', id: c && c.id, role:'subject' }]
    });
  }
  ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
  ev.appliedAtTurn = (campaign && campaign.currentTurn) || 1;
  ev.appliedAtDay  = (campaign && campaign.currentDayInMonth) || 1;
  if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
  campaign.eventLog.push({ event: ev, result: { narrativeSummary: narrative },
    appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
  return ev;
}

// ── self-register the slot-58 'convalescence' day-consumer (the weather/hijinks pattern;
//    registerDayConsumer ships from acks-engine.js, loaded before this module) ──
if(typeof ACKS.registerDayConsumer === 'function'){
  ACKS.registerDayConsumer('convalescence', {
    handler: proposeConvalescenceDay,
    order: 58,
    pauseTriggers: [],
    commit: commitConvalescenceRecord
  });
}

Object.assign(ACKS, {
  // data
  MORTAL_WOUND_CONDITIONS, MORTAL_WOUND_MODIFIERS, MORTAL_WOUNDS, HIT_DIE_VALUE_BONUS,
  DAMAGE_TYPES, DAMAGE_TYPE_TABLE, DAMAGE_TABLE_META, TREATMENT_TIMING_MODS, TREATMENT_TIMING_LABELS,
  MORTAL_WOUNDS_CITE,
  // helpers + resolver
  conditionForModifiedD20, conditionById, permanentWoundFor, mortalWoundModifierBreakdown,
  rollMortalWound, rollMortalWounds: rollMortalWound, applyMortalWound,
  // Tampering (the mortality half)
  TAMPERING_BANDS, rollTamperingWithMortality, applyTamperingSideEffect,
  // convalescence
  characterActiveWounds, characterConvalescence, anyConvalescing,
  proposeConvalescenceDay, commitConvalescenceRecord, advanceConvalescence,
  // mortal-wound ability mod (small but reused by the UI forecast)
  mortalWoundAbilityMod: abilityMod
});

if(typeof module !== 'undefined' && module.exports) module.exports = ACKS;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
