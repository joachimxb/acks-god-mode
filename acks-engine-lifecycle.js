/* =============================================================================
 * acks-engine-lifecycle.js — ACKS God Mode · Character Lifecycle CL-1 (aging)
 * The monthly aging pass — the individual-scale analog of the domain layer.
 *
 * RAW: RR p.19 ("Character Starting Age" / "Character Aging" / "Attribute Adjustments
 *   by Age" / "Death From Old Age"). The five age categories by race; the progressive
 *   attribute adjustments applied as a character ENTERS each category; the death-from-old-
 *   age Death saves within 1d12 months of reaching Old+CON / Ancient+CON / the racial
 *   maximum (and each year after). Elves & Nobirans are ageless (never progress past Adult).
 *   The Reserve XP fund (RR p.311) is reserved on the character here for CL-4a.
 *
 * SCOPE (CL-1): aging only — the orphan #7 of the persistent-character-state model
 *   (Character_Lifecycle_RAW_Survey.md §2). Disease (CL-2), persistent conditions (CL-3),
 *   the death economy (CL-4a), and transformation coordination (CL-5) are later waves.
 *   This is the cleanest first slice (greenfield, no cross-subsystem dependency) and it
 *   demonstrates the persistent-state model end-to-end: stored-on-the-character (age) +
 *   a clock driver (the monthly turn) + a RAW resolver (the aging table / the Death save) +
 *   propose→ratify (the monthly-turn review) + a history trail (the two events).
 *
 * The pass is the MONTHLY counterpart of acks-engine-mortal-wounds.js (the day-tick
 *   convalescence consumer) — same record-only event idiom + the same propose/commit shape,
 *   hooked into commitTurn like processLivingExpensesForTurn (RR p.173). It is NOT a day-tick
 *   consumer (CLAUDE §15: no new day-tick slots this burst; aging is slow state → monthly).
 *
 * Load order: AFTER acks-engine.js (newEvent / setEventContext / addCharacterHistory; commitTurn
 *   late-binds global.ACKS.processAgingForTurn) and acks-engine-events.js (the registered
 *   aging-milestone / death-from-old-age kinds). The test harness (tests/_engine.js glob) auto-
 *   loads it after the canonical set — no package.json / _engine.js edit needed.
 *
 * Polarity (CLAUDE §6): aging is CORE RAW — default-on, no master house-rule gate. It is
 *   dormant-until-relevant: a character with age:null is SKIPPED (opt-in seeding — the GM sets
 *   an age on the characters he cares about; the 6 templates + demo carry no age, so they never
 *   age and stay migrate-no-ops). Ageless races (elf / nobiran) never undergo aging effects.
 * =============================================================================
 */
(function(global){
'use strict';
const ACKS = global.ACKS = global.ACKS || {};

const AGING_CITE = 'RR p.19';

// =============================================================================
// Character Aging (RR p.19). Per-race age bands [min..max]. The LAST band is open-ended
// (an age beyond `max` still maps to it — RAW keeps rolling yearly Death saves past the
// racial maximum). `ageless:true` races (Elf / Nobiran) have only Youth + Adult — they never
// progress past Adult and never make a death-from-old-age save. Zaharan tracks Human.
//   Categories, in order (deepening): youth < adult < middle-aged < old < ancient.
// =============================================================================
const AGE_CATEGORY_ORDER = Object.freeze(['youth', 'adult', 'middle-aged', 'old', 'ancient']);
const AGE_CATEGORY_INDEX = Object.freeze({ youth:0, adult:1, 'middle-aged':2, old:3, ancient:4 });
const AGE_CATEGORY_LABEL = Object.freeze({
  youth:'Youth', adult:'Adult', 'middle-aged':'Middle Aged', old:'Old', ancient:'Ancient'
});

// Each race → ordered bands. `min` is the inclusive lower bound; `max` is the RAW upper bound of
// that band (the last band's `max` is the racial maximum age — the third death threshold). Ageless
// races carry only youth+adult. An age below the first band's min reads as the first band (youth).
const AGE_CATEGORIES = Object.freeze({
  human:    { ageless:false, bands:[ {id:'youth',min:13,max:17},{id:'adult',min:18,max:35},{id:'middle-aged',min:36,max:55},{id:'old',min:56,max:75},{id:'ancient',min:76,max:95} ] },
  zaharan:  { ageless:false, bands:[ {id:'youth',min:13,max:17},{id:'adult',min:18,max:35},{id:'middle-aged',min:36,max:55},{id:'old',min:56,max:75},{id:'ancient',min:76,max:95} ] },
  beastman: { ageless:false, bands:[ {id:'youth',min:12,max:15},{id:'adult',min:16,max:30},{id:'middle-aged',min:31,max:45},{id:'old',min:46,max:60},{id:'ancient',min:61,max:75} ] },
  dwarf:    { ageless:false, bands:[ {id:'youth',min:15,max:25},{id:'adult',min:26,max:50},{id:'middle-aged',min:51,max:75},{id:'old',min:76,max:115},{id:'ancient',min:116,max:150} ] },
  elf:      { ageless:true,  bands:[ {id:'youth',min:15,max:50},{id:'adult',min:51,max:200} ] },
  nobiran:  { ageless:true,  bands:[ {id:'youth',min:13,max:17},{id:'adult',min:18,max:200} ] }
});

// Race aliases → the canonical AGE_CATEGORIES key. An unrecognized race falls back to 'human'
// (the aging pass only runs on a non-null age — an explicit GM choice — so the human lifespan is
// a sane default a GM can override by setting a recognized race).
const _RACE_ALIASES = Object.freeze({
  human:'human', man:'human', men:'human',
  zaharan:'zaharan',
  beastman:'beastman', 'beastman-humanoid':'beastman', beastmen:'beastman',
  dwarf:'dwarf', dwarven:'dwarf', dwarves:'dwarf',
  elf:'elf', elven:'elf', elves:'elf',
  nobiran:'nobiran', nobir:'nobiran'
});
function _normalizeRace(race){
  const r = String(race || 'human').toLowerCase().trim();
  return _RACE_ALIASES[r] || 'human';
}
function isAgelessRace(race){ return !!(AGE_CATEGORIES[_normalizeRace(race)] || {}).ageless; }

// =============================================================================
// Attribute Adjustments by Age (RR p.19) — PROGRESSIVE form, applied as the character ENTERS
// each category. (The cumulative form is for generating an already-aged character — that's a
// character-gen choice, not the in-play pass, so it is not applied here.) Adjustments cannot drop
// an attribute below a class minimum, and in no case below 3 (we clamp at 3 — the class-minimum
// floor is a GM-ratify concern, see Plan §11 / the SUMMARY).
//   Youth        −2 STR, −2 INT, −2 WIL        (reversed on maturing to Adult)
//   Adult        +2 STR, +2 INT, +2 WIL
//   Middle Aged  −2 STR, −2 DEX, −2 CON
//   Old          −2 STR, −2 DEX, −2 CON, −2 CHA
//   Ancient      −2 STR, −2 DEX, −2 CON, −2 CHA
// In-play crossings (age only ever increases) are adult→middle-aged→old→ancient (and youth→adult
// for a character who began as a youth); the deltas keyed by the NEW category entered:
// =============================================================================
const AGE_ATTRIBUTE_ADJUSTMENTS = Object.freeze({
  youth:        Object.freeze({ STR:-2, INT:-2, WIL:-2 }),
  adult:        Object.freeze({ STR:+2, INT:+2, WIL:+2 }),
  'middle-aged':Object.freeze({ STR:-2, DEX:-2, CON:-2 }),
  old:          Object.freeze({ STR:-2, DEX:-2, CON:-2, CHA:-2 }),
  ancient:      Object.freeze({ STR:-2, DEX:-2, CON:-2, CHA:-2 })
});
const ATTR_FLOOR = 3;   // RR p.19 — never below 3 (class-minimum floor deferred to GM ratify).

// =============================================================================
// Character Starting Age (RR p.19) — class-keyed dice. Reference data + a roller for the UI's
// "🎲 roll a starting age" affordance (the aging pass never auto-seeds — age stays null until the
// GM sets one). class is free-text in the data model, so the lookup normalizes loosely; an
// unrecognized class falls back to the 17+1d6 baseline most classes use.
// =============================================================================
const CHARACTER_STARTING_AGE = Object.freeze({
  assassin:'17+1d6', barbarian:'17+1d6', bard:'17+1d6', bladedancer:'17+1d6', crusader:'17+1d6',
  explorer:'17+1d6', fighter:'17+1d6', paladin:'17+1d6', priestess:'17+1d6', shaman:'17+1d6',
  thief:'17+1d6', witch:'17+1d6',
  venturer:'17+2d4',
  mage:'17+3d6', 'nobiran wonderworker':'17+3d6',
  warlock:'17+2d6', 'zaharan ruinguard':'17+2d6',
  'dwarven craftpriest':'25+2d8', 'dwarven vaultguard':'23+3d4',
  'elven nightblade':'75+5d4', 'elven spellsword':'75+5d4'
});
function _d(sides, rng){ const r = (typeof rng === 'function') ? rng() : Math.random(); return Math.floor(r * sides) + 1; }
function startingAgeSpecFor(className){
  const c = String(className || '').toLowerCase().trim();
  return CHARACTER_STARTING_AGE[c] || '17+1d6';
}
// Roll a class's starting age. Parses "base+CdS" (the only form in the RAW table).
function rollStartingAge(className, rng){
  const spec = startingAgeSpecFor(className);
  const m = String(spec).match(/(\d+)\s*\+\s*(\d+)d(\d+)/i);
  if(!m) return parseInt(spec, 10) || 17;
  const base = parseInt(m[1], 10), count = parseInt(m[2], 10), sides = parseInt(m[3], 10);
  let total = base;
  for(let i = 0; i < count; i++) total += _d(sides, rng);
  return total;
}

// =============================================================================
// ageCategoryFor — the canonical race+age → category derivation (rule #10; the stored
// character.ageCategory is a reconciled display cache the pass keeps current). Returns one of the
// AGE_CATEGORY_ORDER ids, or null when age is unset. Ageless races return youth/adult only.
// =============================================================================
function _categoryForRaceAge(race, age){
  if(age == null || isNaN(age)) return null;
  const def = AGE_CATEGORIES[_normalizeRace(race)] || AGE_CATEGORIES.human;
  const bands = def.bands;
  // Below the first band's min ⇒ the first band (a child is a youth). At/above the last band's
  // min ⇒ the last band (open-ended past the racial maximum). Otherwise the band that contains age.
  if(age < bands[0].min) return bands[0].id;
  for(const b of bands){ if(age >= b.min && age <= b.max) return b.id; }
  return bands[bands.length - 1].id;   // beyond the listed maximum
}
function ageCategoryFor(char){
  if(!char) return null;
  return _categoryForRaceAge(char.race, char.age);
}
function ageCategoryLabel(catId){ return AGE_CATEGORY_LABEL[catId] || null; }
function _catIndex(catId){ return (catId in AGE_CATEGORY_INDEX) ? AGE_CATEGORY_INDEX[catId] : -1; }

// =============================================================================
// Death From Old Age (RR p.19). The three thresholds — Old min + CON, Ancient min + CON, and the
// racial maximum (then each year). CON is the CURRENT (age-adjusted) score, read live (the example:
// Marcus' falling CON lowers his own thresholds). Returns [] for an ageless race / unset age.
//   opts.con — override the CON used (the pass passes the post-this-pass-adjustment CON so a dry-run
//   and the commit agree at the exact crossing month, when CON has just dropped).
// =============================================================================
function oldAgeThresholdsFor(char, opts){
  opts = opts || {};
  if(!char || char.age == null) return [];
  const def = AGE_CATEGORIES[_normalizeRace(char.race)];
  if(!def || def.ageless) return [];
  const con = (opts.con != null) ? Number(opts.con)
            : Number(char.abilities && char.abilities.CON);
  const conVal = isNaN(con) ? 10 : Math.max(ATTR_FLOOR, con);
  const oldBand = def.bands.find(b => b.id === 'old');
  const ancientBand = def.bands.find(b => b.id === 'ancient');
  const maxAge = ancientBand ? ancientBand.max : null;
  const out = [];
  if(oldBand)     out.push({ key:'old',     age: oldBand.min + conVal,     label:'Old age (min Old + CON)' });
  if(ancientBand) out.push({ key:'ancient', age: ancientBand.min + conVal, label:'Ancient age (min Ancient + CON)' });
  if(maxAge != null) out.push({ key:'max',  age: maxAge, annual:true, label:'Maximum age (then each year)' });
  return out;
}

// A small read accessor for the character sheet — the age line + the next old-age-save threshold.
function characterAgingInfo(char){
  if(!char) return { age:null };
  const age = (typeof char.age === 'number') ? char.age : null;
  const ageless = isAgelessRace(char.race);
  const category = ageCategoryFor(char);
  const out = {
    age, ageMonths: char.ageMonths || 0, ageless,
    race: _normalizeRace(char.race),
    category, categoryLabel: ageCategoryLabel(category),
    nextOldAgeSave: null, pendingSave: null
  };
  if(age == null || ageless) return out;
  // A save already scheduled?
  const ds = char.agingDeathSave;
  if(ds && ds.dueInMonths != null){
    out.pendingSave = { thresholdKey: ds.thresholdKey, dueInMonths: ds.dueInMonths };
  }
  // The next (lowest-age) UNREACHED threshold, for "next danger" display.
  const future = oldAgeThresholdsFor(char).filter(t => age < t.age).sort((a, b) => a.age - b.age);
  out.nextOldAgeSave = future[0] || null;
  return out;
}

// =============================================================================
// Apply one category-crossing's progressive attribute adjustment (RR p.19). Clamps at ATTR_FLOOR.
// Returns { deltas (nominal), applied (per-attr actual change after clamp), abilitiesAfter }.
// =============================================================================
function _applyAttributeAdjustment(char, catId){
  const deltas = AGE_ATTRIBUTE_ADJUSTMENTS[catId] || {};
  if(!char.abilities) char.abilities = { STR:10, INT:10, WIL:10, DEX:10, CON:10, CHA:10 };
  const applied = {};
  for(const k of Object.keys(deltas)){
    const before = Number(char.abilities[k]); const base = isNaN(before) ? 10 : before;
    const after = Math.max(ATTR_FLOOR, base + deltas[k]);
    char.abilities[k] = after;
    applied[k] = after - base;
  }
  return { deltas, applied, abilitiesAfter: Object.assign({}, char.abilities) };
}

// Format an attribute-delta map ({STR:-2,DEX:-2,...}) as "−2 STR, −2 DEX" for logs/UI.
function _fmtDeltas(deltas){
  return Object.keys(deltas || {}).map(k => (deltas[k] >= 0 ? '+' : '') + deltas[k] + ' ' + k).join(', ');
}

// =============================================================================
// processAgingForTurn — the monthly aging pass. Hooked into commitTurn (gated committed>0, try-
// guarded, late-bound) AND called dryRun:true from proposeMonthlyTurn for the GM preview (the
// monthly-turn review is the propose-ratify gate — Plan §7 / §13.2). One commit = one month
// (advanceCalendarOneMonth); each character accrues 1 month, rolling to age+1 at 12.
//   Per character (skipped if age==null OR race is ageless OR already deceased):
//     1. advance ageMonths (→ age++ on a year rollover) + reconcile ageCategory
//     2. on a category crossing → the progressive attribute adjustment + an aging-milestone event
//     3. death-from-old-age: a scheduled save's 1d12-month counter ticks → the Death save when due
//        (1d20 ≥ savingThrows.death); else arm the first reached-but-unresolved threshold (1d12 mo).
//   dryRun reports the deterministic facts (age advance, crossing deltas, a save DUE this month, a
//   threshold newly ENTERED) but rolls NO dice + mutates nothing — the dice live only at commit, so
//   there is no dry-run/commit divergence (the living-expenses preview discipline).
// =============================================================================
function _isAgingSubject(c){
  if(!c) return false;
  if(c.age == null || typeof c.age !== 'number') return false;     // opt-in seeding
  if(c.lifecycleState === 'deceased' || c.alive === false) return false;
  if(c.lifecycleState === 'candidate') return false;
  if(isAgelessRace(c.race)) return false;                          // elves / nobirans never age
  return true;
}
function processAgingForTurn(campaign, opts){
  opts = opts || {};
  const dryRun = !!opts.dryRun;
  const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
  const out = { ran:true, dryRun, advances:[], crossings:[], deathSaves:[], deaths:[], logEntries:[] };
  const chars = (campaign && campaign.characters) || [];
  const turn = (campaign && campaign.currentTurn) || 1;

  for(const c of chars){
    if(!_isAgingSubject(c)) continue;
    const race = _normalizeRace(c.race);

    // (1) Advance age with the calendar (one turn = one month).
    const ageBefore = c.age;
    const monthsBefore = c.ageMonths || 0;
    let monthsAfter = monthsBefore + 1;
    let ageAfter = ageBefore;
    if(monthsAfter >= 12){ monthsAfter -= 12; ageAfter = ageBefore + 1; }
    const catBefore = _categoryForRaceAge(race, ageBefore);
    const catAfter  = _categoryForRaceAge(race, ageAfter);
    const crossed   = _catIndex(catAfter) > _catIndex(catBefore);
    out.advances.push({ characterId:c.id, name:c.name, ageBefore, ageAfter, monthsBefore, monthsAfter, crossedYear: ageAfter !== ageBefore, crossing: crossed ? { from:catBefore, to:catAfter } : null });

    if(!dryRun){ c.age = ageAfter; c.ageMonths = monthsAfter; c.ageCategory = catAfter; }

    // (2) Category crossing → the progressive attribute adjustment (RR p.19).
    let adj = null;
    if(crossed){
      const deltas = AGE_ATTRIBUTE_ADJUSTMENTS[catAfter] || {};
      const crossingRec = { characterId:c.id, name:c.name, fromCategory:catBefore, toCategory:catAfter, ageNow:ageAfter, attributeDeltas:deltas };
      out.crossings.push(crossingRec);
      if(!dryRun){
        adj = _applyAttributeAdjustment(c, catAfter);
        const summary = c.name + ' grows ' + (AGE_CATEGORY_LABEL[catAfter] || catAfter) + ' (' + _fmtDeltas(deltas) + ')';
        out.logEntries.push('Aging — ' + summary + '.');
        try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'aging-milestone', summary, { fromCategory:catBefore, toCategory:catAfter, ageNow:ageAfter }); } catch(_e){}
        _emitAgingEvent(campaign, c, 'aging-milestone', { characterId:c.id, fromCategory:catBefore, toCategory:catAfter, ageNow:ageAfter, attributeDeltas:deltas, narrative:summary }, summary);
      }
    }

    // (3) Death from old age (RR p.19). CON for thresholds = the CON the character would have AFTER
    // this pass's crossing (so dry-run + commit agree at the exact crossing month).
    const baseCon = Number(c.abilities && c.abilities.CON);
    const conNow = isNaN(baseCon) ? 10 : (crossed ? Math.max(ATTR_FLOOR, baseCon + ((AGE_ATTRIBUTE_ADJUSTMENTS[catAfter] || {}).CON || 0)) : baseCon);
    // (In commit, the adjustment is already applied to c.abilities.CON, so read it back; in dry-run
    // it isn't, so use the computed conNow. Use the live value when we mutated.)
    const conForThreshold = (!dryRun && crossed && adj) ? Number(c.abilities.CON) : conNow;
    const thresholds = oldAgeThresholdsFor(c, { con: conForThreshold });

    const ds = c.agingDeathSave;
    const saveTarget = (c.savingThrows && c.savingThrows.death != null) ? Number(c.savingThrows.death) : 15;

    if(ds && ds.dueInMonths != null){
      // A scheduled save is counting down — tick it; roll when it elapses.
      const dueAfter = ds.dueInMonths - 1;
      if(dueAfter > 0){
        if(!dryRun) c.agingDeathSave = Object.assign({}, ds, { dueInMonths: dueAfter });
      } else {
        // Due this month → the Death save fires (commit rolls; dry-run only flags it).
        if(dryRun){
          out.deathSaves.push({ characterId:c.id, name:c.name, thresholdKey: ds.thresholdKey, dueThisMonth:true, target:saveTarget });
        } else {
          const roll = _d(20, rng);
          const died = roll < saveTarget;
          out.deathSaves.push({ characterId:c.id, name:c.name, thresholdKey: ds.thresholdKey, target:saveTarget, roll, died });
          const tLabel = ds.thresholdKey === 'old' ? 'old age' : ds.thresholdKey === 'ancient' ? 'extreme old age' : 'the weight of years';
          if(died){
            c.lifecycleState = 'deceased'; c.alive = false; c.deceasedTurn = turn;
            c.agingDeathSave = Object.assign({}, ds, { dueInMonths:null, thresholdKey:null });
            const summary = c.name + ' dies of ' + tLabel + ' (Death save ' + roll + ' vs ' + saveTarget + '+).';
            out.deaths.push({ characterId:c.id, name:c.name, thresholdKey: ds.thresholdKey });
            out.logEntries.push('Death from old age — ' + summary);
            try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'death-from-old-age', summary, { thresholdKey: ds.thresholdKey }); } catch(_e){}
            _emitAgingEvent(campaign, c, 'death-from-old-age', { characterId:c.id, threshold: ds.thresholdKey, save: roll, target: saveTarget, died:true, narrative:summary }, summary);
            // CL-4a — the unified cause-tagged death record (an old-age death is never a "heroic" death).
            recordCharacterDeath(campaign, c, { cause:'old-age', heroic:false });
          } else {
            // Survived: a one-time threshold is now resolved; the annual 'max' re-arms next year.
            const resolved = Array.isArray(ds.resolved) ? ds.resolved.slice() : [];
            if((ds.thresholdKey === 'old' || ds.thresholdKey === 'ancient') && resolved.indexOf(ds.thresholdKey) < 0) resolved.push(ds.thresholdKey);
            const lastMaxSaveAge = (ds.thresholdKey === 'max') ? c.age : (ds.lastMaxSaveAge != null ? ds.lastMaxSaveAge : null);
            c.agingDeathSave = { dueInMonths:null, thresholdKey:null, resolved, lastMaxSaveAge };
            const summary = c.name + ' endures ' + tLabel + ' (Death save ' + roll + ' vs ' + saveTarget + '+ — survives).';
            out.logEntries.push('Death from old age — ' + summary);
            try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'death-from-old-age', summary, { thresholdKey: ds.thresholdKey, survived:true }); } catch(_e){}
            _emitAgingEvent(campaign, c, 'death-from-old-age', { characterId:c.id, threshold: ds.thresholdKey, save: roll, target: saveTarget, died:false, narrative:summary }, summary);
          }
        }
      }
    } else {
      // No save scheduled — arm the first REACHED + UNRESOLVED threshold (priority old → ancient → max).
      const resolved = (ds && Array.isArray(ds.resolved)) ? ds.resolved : [];
      const lastMaxSaveAge = (ds && ds.lastMaxSaveAge != null) ? ds.lastMaxSaveAge : null;
      const ageNow = dryRun ? ageAfter : c.age;
      let arm = null;
      for(const t of thresholds){
        if(ageNow < t.age) continue;
        if(t.key === 'max'){ if(lastMaxSaveAge !== ageNow){ arm = t; break; } continue; }
        if(resolved.indexOf(t.key) < 0){ arm = t; break; }
      }
      if(arm){
        if(dryRun){
          out.deathSaves.push({ characterId:c.id, name:c.name, thresholdKey: arm.key, entering:true });
        } else {
          const due = _d(12, rng);   // RR p.19 — within 1d12 months of reaching the threshold
          c.agingDeathSave = { dueInMonths: due, thresholdKey: arm.key, resolved: resolved.slice(), lastMaxSaveAge };
          const summary = c.name + ' enters the shadow of ' + (arm.key === 'old' ? 'old age' : arm.key === 'ancient' ? 'extreme old age' : 'the maximum span') + ' — a Death save falls due within ' + due + ' month' + (due === 1 ? '' : 's') + ' (RR p.19).';
          out.deathSaves.push({ characterId:c.id, name:c.name, thresholdKey: arm.key, armedDueInMonths: due });
          out.logEntries.push('Aging — ' + summary);
          try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'aging-milestone', summary, { thresholdArmed: arm.key, dueInMonths: due }); } catch(_e){}
          // Arming is recorded on history only (not its own event kind — the save's resolution is the event).
        }
      }
    }
  }

  // CL-5 (team) — the alignment-drift schedule rides this same monthly lifecycle hook. commitTurn AND
  // the proposeMonthlyTurn preview both call processAgingForTurn (the one monthly hook this lane has —
  // it cannot add a named hook to acks-engine.js), so folding the transformation drift pass in here makes
  // it ride the monthly turn. It loops the TRANSFORMED characters (a different subject set than aging —
  // a transformed character with age:null or an ageless race still drifts), so it runs AFTER the aging
  // loop, not inside it. Its result is surfaced under out.transformations + its log lines merge in.
  try {
    const tx = processTransformationsForTurn(campaign, { dryRun, rng });
    out.transformations = tx;
    (tx.logEntries || []).forEach(l => out.logEntries.push(l));
  } catch(_e){ /* never let a transformation drift-save fail the aging pass */ }

  return out;
}

// =============================================================================
// Event emit — the record-only audit pattern (the mortal-wounds / banditry idiom). newEvent +
// setEventContext + push (the engine-internal _logAppliedEvent shape). cadence 'monthly-turn';
// the aging character rides the context envelope as subject.
// =============================================================================
function _emitAgingEvent(campaign, c, kind, payload, narrative){
  const A = global.ACKS;
  if(!A || typeof A.newEvent !== 'function') return null;
  const cal = (campaign && campaign.calendar) || {};
  let ev;
  try {
    ev = A.newEvent(kind, {
      submittedBy: 'engine', cadence: 'monthly-turn', targetTurn: (campaign && campaign.currentTurn) || 1,
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

Object.assign(ACKS, {
  // data
  AGE_CATEGORIES, AGE_CATEGORY_ORDER, AGE_CATEGORY_INDEX, AGE_CATEGORY_LABEL,
  AGE_ATTRIBUTE_ADJUSTMENTS, CHARACTER_STARTING_AGE, AGING_CITE,
  // derivations
  ageCategoryFor, ageCategoryLabel, isAgelessRace, oldAgeThresholdsFor, characterAgingInfo,
  startingAgeSpecFor, rollStartingAge,
  // the monthly pass
  processAgingForTurn
});

// =============================================================================
// === Character Lifecycle CL-2 (burst5) — disease (JJ p.84) ===================
// The disease engine — persistent-character-state class #8 (Character_Lifecycle_Plan §11 CL-2).
// A self-contained, timer-driven model: contraction (a 1d100 Disease Type + a Death save) →
// infected (onset) → symptomatic (incapacitated) → recover / die. The DAY-TICK counterpart of
// CL-1's monthly aging pass (disease timers are in days): a slot-57 'disease' day-consumer
// advances every infected/symptomatic character one day. Supersedes the `magical-disease`
// hireling-calamity STUB with a real progression engine.
//
// SHAPE (the §2 persistent-state model): stored — character.diseases[] (init-on-write, like
//   mortalWounds[]; NO blankCharacter seed, so the 6 templates + demo stay migrate-no-ops, the
//   team-session discipline); driver — the slot-57 day-consumer; resolver — the JJ p.84 Disease
//   Type table + the Death save; propose→ratify — the day-tick review; history — the two events.
// Shares Delves D1's `incapacitated` lifecycleState (a symptomatic disease sets it; recovery
//   clears it only if no wound bed-rest / other symptomatic disease still holds it).
//
// Polarity (CLAUDE §6): disease is CORE RAW — default-on, no master house-rule gate. Dormant
//   until a character is exposed (the GM's "expose to disease" action / the `magical-disease`
//   calamity in v1; terrain-encounter + diseased-monster triggers wire later — Plan §11 / §10).
// =============================================================================
const DISEASE_CITE = 'JJ p.84';

// The Disease Type table (JJ p.84). 1d100 (context modifiers apply — e.g. −10 in a jungle hex; a
// LOWER roll is a WORSE disease, so a negative modifier worsens it). `max` = inclusive upper bound
// of the band; `saveBonus` = the Death-save bonus; `onset`/`symptom` = duration specs in DAYS
// resolved by _rollDuration ('NdM' = NdM days; 'NdMw' = NdM weeks ×7; a number = that many days);
// `deathThreshold` = the margin of failure (target − total) at/above which the disease KILLS
// (Infinity = only a natural 1 kills — Bloody Flux); `disfiguring` = a permanent cosmetic effect
// (Spotted Pox — flagged for a future scarring/appearance tie; NOT wired here, scarring is D1).
const DISEASE_TYPES = Object.freeze([
  { id:'plague',        label:'Plague',        max:5,   saveBonus:0, onset:'1d4', symptom:'1d8',  deathThreshold:6 },
  { id:'putrid-fever',  label:'Putrid Fever',  max:15,  saveBonus:0, onset:'2d4', symptom:14,     deathThreshold:7 },
  { id:'spotted-pox',   label:'Spotted Pox',   max:30,  saveBonus:1, onset:'2d6', symptom:21,     deathThreshold:8, disfiguring:true },
  { id:'bilious-fever', label:'Bilious Fever', max:50,  saveBonus:2, onset:'2d6', symptom:28,     deathThreshold:8 },
  { id:'ague',          label:'Ague',          max:75,  saveBonus:3, onset:'2d4', symptom:'1d4w', deathThreshold:10 },
  { id:'bloody-flux',   label:'Bloody Flux',   max:100, saveBonus:4, onset:'1d4', symptom:7,      deathThreshold:Infinity }
]);
const DISEASE_BY_ID = Object.freeze(DISEASE_TYPES.reduce((m, d) => { m[d.id] = d; return m; }, {}));

// Resolve a duration spec to a number of DAYS. A number → itself; 'NdM' → NdM days; 'NdMw' → NdM
// weeks ×7. Reuses the module-local _d roller (defined above for the aging dice).
function _rollDuration(spec, rng){
  if(typeof spec === 'number') return spec;
  const m = String(spec).trim().match(/^(\d+)d(\d+)(w)?$/i);
  if(!m) return parseInt(spec, 10) || 1;
  let total = 0; const count = parseInt(m[1], 10), sides = parseInt(m[2], 10);
  for(let i = 0; i < count; i++) total += _d(sides, rng);
  return m[3] ? total * 7 : total;
}
// 1d100 (+ context modifier) → the Disease Type band. The table is open at both ends: a modified
// roll below 1 still reads Plague (the worst), above 100 still reads Bloody Flux (the gentlest).
function diseaseTypeForRoll(roll){
  let n = Number(roll); if(isNaN(n)) n = 1;
  for(const d of DISEASE_TYPES){ if(n <= d.max) return d; }
  return DISEASE_TYPES[DISEASE_TYPES.length - 1];
}
function diseaseTypeById(id){ return DISEASE_BY_ID[id] || null; }

function _findCharacterLC(campaign, id){
  return (campaign && Array.isArray(campaign.characters)) ? (campaign.characters.find(c => c && c.id === id) || null) : null;
}
function _findDisease(c, ref){
  if(!c || !Array.isArray(c.diseases)) return null;
  if(ref && typeof ref === 'object') return ref;
  if(typeof ref === 'number') return c.diseases[ref] || null;
  return c.diseases.find(d => d && d.id === ref) || null;
}
function _diseasePhaseLabel(phase, onsetRem, sympRem){
  if(phase === 'infected')    return 'incubating — symptoms in ' + onsetRem + ' day' + (onsetRem === 1 ? '' : 's');
  if(phase === 'symptomatic') return 'symptomatic — ' + sympRem + ' day' + (sympRem === 1 ? '' : 's') + ' left';
  if(phase === 'recovered')   return 'recovered';
  if(phase === 'died')        return 'died';
  return String(phase || '');
}

// =============================================================================
// contractDisease — the contraction verb (JJ p.84). A DIRECT call (a trigger, not the daily
// advance): the GM's "expose to disease" action / the `magical-disease` calamity. Rolls 1d100 →
// Disease Type (opts.modifier for context), then a Death save (1d20 + the disease's save bonus vs
// the character's death save target). A natural 1 always fails (RR pp.9–10). Save succeeds → the
// character shrugs it off (no infection). Save fails → infected: willDie is fixed NOW (a natural-1
// failure OR a margin of failure ≥ the disease's death-threshold). Pushes a diseases[] record and
// emits `disease-contracted`. Returns the record (or { infected:false, … } on a save).
//   opts: { rng, modifier, diseaseType (force a type), forcedD100, forcedSave, saveTarget,
//           forcedOnset, forcedSymptom }.
// =============================================================================
function contractDisease(campaign, characterId, opts){
  opts = opts || {};
  const c = (characterId && typeof characterId === 'object') ? characterId : _findCharacterLC(campaign, characterId);
  if(!c) return null;
  const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;

  // 1d100 Disease Type (context modifier — a jungle hex is −10, worsening it).
  const modifier = Number(opts.modifier) || 0;
  const d100 = (opts.forcedD100 != null) ? Number(opts.forcedD100) : _d(100, rng);
  const typeRoll = d100 + modifier;
  const disease = opts.diseaseType ? (diseaseTypeById(opts.diseaseType) || diseaseTypeForRoll(typeRoll))
                                   : diseaseTypeForRoll(typeRoll);

  // The Death save: 1d20 + the disease's save bonus vs the character's death save target.
  const saveTarget = (opts.saveTarget != null) ? Number(opts.saveTarget)
                   : ((c.savingThrows && c.savingThrows.death != null) ? Number(c.savingThrows.death) : 15);
  const saveRoll = (opts.forcedSave != null) ? Number(opts.forcedSave) : _d(20, rng);
  const naturalOne = saveRoll === 1;
  const saveTotal = saveRoll + (disease.saveBonus || 0);
  const saved = (saveTotal >= saveTarget) && !naturalOne;   // a natural 1 always fails (RR pp.9–10)

  if(saved){
    return { infected:false, diseaseType:disease.id, diseaseLabel:disease.label,
             saveRoll, saveBonus:disease.saveBonus, saveTotal, saveTarget, naturalOne, narrative:(c.name + ' resists ' + disease.label + ' (Death save ' + saveTotal + ' vs ' + saveTarget + '+).') };
  }

  // Infected. willDie is fixed at contraction (a natural-1 failure OR margin ≥ death-threshold).
  const failedBy = saveTarget - saveTotal;
  const willDie = naturalOne || (failedBy >= disease.deathThreshold);
  const onsetDays   = (opts.forcedOnset   != null) ? Number(opts.forcedOnset)   : _rollDuration(disease.onset, rng);
  const symptomDays = (opts.forcedSymptom != null) ? Number(opts.forcedSymptom) : _rollDuration(disease.symptom, rng);
  const turn = (campaign && campaign.currentTurn) || 1;
  const day  = (campaign && campaign.currentDayInMonth) || 1;
  if(!Array.isArray(c.diseases)) c.diseases = [];   // init-on-write (no blankCharacter seed)
  const rec = {
    id: 'd' + turn + '_' + day + '_' + c.diseases.length,   // internal record id (no top-level prefix)
    diseaseType: disease.id, diseaseLabel: disease.label,
    contractedAtDay: day, contractedAtTurn: turn,
    saveRoll, saveBonus: disease.saveBonus, saveTotal, saveTarget, failedBy, naturalOne,
    onsetDays, symptomDays, onsetRemaining: onsetDays, symptomRemaining: symptomDays,
    phase: 'infected', willDie, disfiguring: !!disease.disfiguring, deathThreshold: disease.deathThreshold,
    identifiedLevel: null, prognosisKnown: false,
    curedAtDay: null, resolved: false, eventId: null
  };
  c.diseases.push(rec);

  const summary = c.name + ' contracts ' + disease.label + ' (Death save ' + saveTotal + ' vs ' + saveTarget + '+ — failed; symptoms in ' + onsetDays + ' day' + (onsetDays === 1 ? '' : 's') + ').';
  try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'disease-contracted', summary, { diseaseType: disease.id }); } catch(_e){}
  const ev = _emitDiseaseEvent(campaign, c, 'disease-contracted', {
    characterId: c.id, diseaseType: disease.id, diseaseLabel: disease.label,
    onsetDays, symptomDays, willDie, saveRoll, saveTotal, saveTarget, narrative: summary
  }, summary);
  if(ev) rec.eventId = ev.id;
  return rec;
}

// =============================================================================
// The day-tick consumer (slot 57 — beside D1's convalescence at 58; disease progresses before
// bed-rest convalescence). PURE proposeDiseaseDay advances each infected/symptomatic disease one
// day on the working copy (carrying ABSOLUTE after-values, like convalescence — safe under the
// multi-day clone-commit); commitDiseaseRecord applies one ratified record. Meaningful transitions
// (onset→symptomatic, the recover/die resolution) carry pauseTrigger:'disease' so a multi-day
// advance stops for GM review (auto-pause-on-disease defaults ON); routine onset-countdown days do
// not. The resolution rides a `disease-recovered` notable the pipeline emits (outcome ∈ recovered|
// died — like death-from-old-age carrying died:bool; the eventLog narrative reads correctly either
// way). Records carry a `label` so the day-tick review renders them cleanly.
// =============================================================================
function characterActiveDiseases(character){
  if(!character || !Array.isArray(character.diseases)) return [];
  return character.diseases.filter(d => d && !d.resolved && d.phase !== 'recovered' && d.phase !== 'died');
}
function anyDiseased(campaign){
  return !!(campaign && Array.isArray(campaign.characters) && campaign.characters.some(c => characterActiveDiseases(c).length));
}
// Does anything still hold this character's `incapacitated` state? (a symptomatic disease OR a
// wound still needing bed rest — D1's characterActiveWounds, read defensively across the module).
function _diseaseStillIncapacitated(c){
  if(characterActiveDiseases(c).some(d => d.phase === 'symptomatic')) return true;
  try {
    const A = global.ACKS;
    if(A && typeof A.characterActiveWounds === 'function'){
      return A.characterActiveWounds(c).some(w => (w.bedRestDaysRemaining || 0) > 0);
    }
  } catch(_e){}
  return false;
}

function proposeDiseaseDay(campaign, ctx){
  ctx = ctx || {};
  const days = (typeof ctx.days === 'number' && ctx.days > 0) ? ctx.days : 1;
  const out = { pendingRecords: [], notableEvents: [], encounters: [] };
  (campaign && campaign.characters || []).forEach(c => {
    if(c.lifecycleState === 'deceased' || c.alive === false) return;
    characterActiveDiseases(c).forEach((d, di) => {
      // Compute the transition WITHOUT mutating (the pure-handler contract).
      let phase = d.phase, onsetRem = d.onsetRemaining, sympRem = d.symptomRemaining;
      let transition = 'advance', outcome = null, rem = days;
      if(phase === 'infected'){
        if(onsetRem > rem){ onsetRem -= rem; rem = 0; }
        else { rem -= onsetRem; onsetRem = 0; phase = 'symptomatic'; transition = 'symptomatic'; }
      }
      if(phase === 'symptomatic' && rem > 0){
        if(sympRem > rem){ sympRem -= rem; rem = 0; }
        else { sympRem = 0; phase = d.willDie ? 'died' : 'recovered'; transition = 'resolve'; outcome = d.willDie ? 'died' : 'recovered'; }
      }
      const label = c.name + ' — ' + d.diseaseLabel + ' (' + _diseasePhaseLabel(phase, onsetRem, sympRem) + ')';
      out.pendingRecords.push({
        kind: 'disease', type: 'disease', characterId: c.id, characterName: c.name,
        diseaseId: d.id, diseaseIndex: di, diseaseType: d.diseaseType, diseaseLabel: d.diseaseLabel,
        transition, outcome, phaseAfter: phase, onsetRemainingAfter: onsetRem, symptomRemainingAfter: sympRem,
        willDie: d.willDie, label
      });
      if(transition === 'symptomatic'){
        const s = c.name + ' falls gravely ill with ' + d.diseaseLabel + ' — incapacitated (JJ p.84)';
        out.notableEvents.push({ type:'disease', transient:true, pauseTrigger:'disease', label:s, summary:s,
          payload:{ characterId:c.id, diseaseType:d.diseaseType, phase:'symptomatic' } });
      } else if(transition === 'resolve'){
        const died = outcome === 'died';
        const s = died ? (c.name + ' dies of ' + d.diseaseLabel + ' (JJ p.84)') : (c.name + ' recovers from ' + d.diseaseLabel);
        out.notableEvents.push({ kind:'disease-recovered', type:'disease', pauseTrigger:'disease', label:s, summary:s,
          primaryHexId: c.currentHexId || null,
          relatedEntities:[{ kind:'character', id:c.id, role:'subject' }],
          payload:{ characterId:c.id, diseaseType:d.diseaseType, diseaseLabel:d.diseaseLabel, outcome, died, narrative:s } });
      }
    });
  });
  return out;
}
function commitDiseaseRecord(campaign, record){
  if(!campaign || !record || record.type !== 'disease') return;
  const c = _findCharacterLC(campaign, record.characterId);
  if(!c || !Array.isArray(c.diseases)) return;
  const d = c.diseases.find(x => x && x.id === record.diseaseId);
  if(!d || d.resolved) return;
  d.onsetRemaining = record.onsetRemainingAfter;
  d.symptomRemaining = record.symptomRemainingAfter;
  d.phase = record.phaseAfter;
  if(record.transition === 'symptomatic'){
    c.lifecycleState = 'incapacitated';                       // symptomatic ⇒ incapacitated (JJ p.84)
  } else if(record.transition === 'resolve'){
    d.resolved = true;
    d.resolvedAtTurn = campaign.currentTurn || 1;
    d.resolvedAtDay  = campaign.currentDayInMonth || 1;
    if(record.outcome === 'died'){
      d.phase = 'died';
      c.lifecycleState = 'deceased'; c.alive = false; c.deceasedTurn = campaign.currentTurn || 1;
      recordCharacterDeath(campaign, c, { cause:'disease', heroic:false });   // CL-4a — unified death record
    } else {
      d.phase = 'recovered';
      if(c.lifecycleState === 'incapacitated' && !_diseaseStillIncapacitated(c)) c.lifecycleState = 'active';
    }
    const s = record.outcome === 'died' ? (c.name + ' dies of ' + d.diseaseLabel) : (c.name + ' recovers from ' + d.diseaseLabel);
    try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'disease-recovered', s, { diseaseType:d.diseaseType, outcome:record.outcome }); } catch(_e){}
  }
}
// Direct (non-day-tick) advance — a GM "rest N days" / a future monthly subsume can call this.
function advanceDiseases(campaign, days){
  days = (typeof days === 'number' && days > 0) ? days : 1;
  const prop = proposeDiseaseDay(campaign, { days });
  prop.pendingRecords.forEach(r => commitDiseaseRecord(campaign, r));
  return prop;
}

// =============================================================================
// Healing-proficiency identification + cure (JJ p.84). v1: the GM rolls the Healing throw (or a
// future Proficiency-Throws wire) and marks the result here — propose-ratify / GM-judgment-first.
//   identifyDisease — on infected → 'sensed' ("coming down with something"); on symptomatic →
//     'identified' (the exact disease); opts.level:'prognosis' adds the will-recover/will-die read.
//     (GM-facing reads are always truthful; identifiedLevel tracks what the PARTY has worked out —
//     for the player-facing / Portal view later.)
//   cureDisease — Healing proficiency or `cure disease` magic, while infected or symptomatic.
//     Resolves the disease as recovered, clears incapacitation if nothing else holds it, emits
//     disease-recovered (outcome 'cured').
// =============================================================================
function identifyDisease(campaign, characterId, diseaseRef, opts){
  opts = opts || {};
  const c = (characterId && typeof characterId === 'object') ? characterId : _findCharacterLC(campaign, characterId);
  if(!c) return null;
  const d = _findDisease(c, diseaseRef);
  if(!d || d.resolved) return null;
  const level = opts.level || (d.phase === 'symptomatic' ? 'identified' : 'sensed');
  d.identifiedLevel = level;
  if(level === 'prognosis'){ d.identifiedLevel = 'prognosis'; d.prognosisKnown = true; }
  return d;
}
function cureDisease(campaign, characterId, diseaseRef, opts){
  opts = opts || {};
  const c = (characterId && typeof characterId === 'object') ? characterId : _findCharacterLC(campaign, characterId);
  if(!c) return null;
  const d = _findDisease(c, diseaseRef);
  if(!d || d.resolved) return null;
  d.phase = 'recovered'; d.resolved = true; d.willDie = false;
  d.curedAtDay = (campaign && campaign.currentDayInMonth) || 1;
  d.resolvedAtTurn = (campaign && campaign.currentTurn) || 1;
  if(c.lifecycleState === 'incapacitated' && !_diseaseStillIncapacitated(c)) c.lifecycleState = 'active';
  const summary = c.name + ' is cured of ' + d.diseaseLabel + (opts.method ? (' (' + opts.method + ')') : '');
  try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'disease-recovered', summary, { diseaseType:d.diseaseType, cured:true }); } catch(_e){}
  _emitDiseaseEvent(campaign, c, 'disease-recovered', {
    characterId:c.id, diseaseType:d.diseaseType, diseaseLabel:d.diseaseLabel,
    outcome:'cured', died:false, cured:true, narrative:summary
  }, summary);
  return d;
}

// A read accessor for the character-sheet Health panel — the active diseases, phase, days
// remaining, prognosis (GM-truthful), and the worst phase. (the truth is always shown; the
// identifiedLevel/prognosisKnown flags annotate what the party has diagnosed.)
function characterDiseaseInfo(character){
  const active = characterActiveDiseases(character);
  return {
    count: active.length,
    symptomatic: active.some(d => d.phase === 'symptomatic'),
    diseases: active.map(d => ({
      id:d.id, diseaseType:d.diseaseType, diseaseLabel:d.diseaseLabel, phase:d.phase,
      daysRemaining: d.phase === 'infected' ? d.onsetRemaining : (d.phase === 'symptomatic' ? d.symptomRemaining : 0),
      phaseLabel: _diseasePhaseLabel(d.phase, d.onsetRemaining, d.symptomRemaining),
      willDie:d.willDie, prognosisKnown:d.prognosisKnown, identifiedLevel:d.identifiedLevel, disfiguring:d.disfiguring
    }))
  };
}

// =============================================================================
// Event emit — the record-only audit pattern (the aging / mortal-wounds idiom). For the DIRECT
// verbs (contractDisease / cureDisease); the day-tick resolution rides the pipeline's emit via the
// `disease-recovered` notable kind. cadence 'daily'; the character rides the context envelope.
// =============================================================================
function _emitDiseaseEvent(campaign, c, kind, payload, narrative){
  const A = global.ACKS;
  if(!A || typeof A.newEvent !== 'function') return null;
  const cal = (campaign && campaign.calendar) || {};
  let ev;
  try {
    ev = A.newEvent(kind, {
      submittedBy:'engine', cadence:'daily', targetTurn:(campaign && campaign.currentTurn) || 1,
      gameTimeAt:{ year:cal.year || 1, month:cal.month || 1, day:(campaign && campaign.currentDayInMonth) || 1 },
      payload: Object.assign({ narrative }, payload || {})
    });
  } catch(_e){ return null; }
  if(typeof A.setEventContext === 'function'){
    A.setEventContext(ev, {
      primaryHexId:(c && c.currentHexId) || null,
      domainId:(c && c.currentDomainId) || null,
      relatedEntities:[{ kind:'character', id:c && c.id, role:'subject' }]
    });
  }
  ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
  ev.appliedAtTurn = (campaign && campaign.currentTurn) || 1;
  ev.appliedAtDay  = (campaign && campaign.currentDayInMonth) || 1;
  if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
  campaign.eventLog.push({ event: ev, result:{ narrativeSummary:narrative },
    appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
  return ev;
}

// ── self-register the slot-57 'disease' day-consumer (the weather/convalescence pattern;
//    registerDayConsumer ships from acks-engine.js, loaded before this module) ──
if(typeof ACKS.registerDayConsumer === 'function'){
  ACKS.registerDayConsumer('disease', {
    handler: proposeDiseaseDay,
    order: 57,
    pauseTriggers: ['disease'],
    commit: commitDiseaseRecord
  });
}

Object.assign(ACKS, {
  // data
  DISEASE_TYPES, DISEASE_CITE,
  // catalog lookups
  diseaseTypeForRoll, diseaseTypeById,
  // verbs
  contractDisease, cureDisease, identifyDisease,
  // reads
  characterActiveDiseases, anyDiseased, characterDiseaseInfo,
  // the day-tick consumer (also self-registered above) + a direct advance
  proposeDiseaseDay, commitDiseaseRecord, advanceDiseases
});
// === end Character Lifecycle CL-2 (burst5) ===================================

// =============================================================================
// === Character Lifecycle CL-3 (burst7, team) — persistent conditions (RR pp.507–516) =========
// The persistent half of the Conditions glossary — persistent-character-state class #9
// (Character_Lifecycle_Plan §11 CL-3 / survey §6). A self-contained, timer-driven model: the GM
// (or, later, the Weather/level-drain cause) APPLIES a persistent condition → a slot-59 day-tick
// consumer advances it each day → it resolves (warmed / 3 successful saves / death). The DAILY
// counterpart that completes the lifecycle trio (CL-1 aging monthly · CL-2 disease day · CL-3
// conditions day).
//
// THE SCOPE CUT (survey §6, the load-bearing classification). A condition is IN scope iff it
//   PERSISTS between sessions under its own duration (the world advancing a day is what changes it);
//   a round/turn/effect-duration condition (Blinded/Stunned/Webbed/…) is COMBAT-ROUND state →
//   Combat #140, out of scope. Of the persistent set, most are ALREADY homed — Provisioning owns
//   hungry/underfed/starving/dehydrated; the activity budget owns fatigued; Delves D1 owns the
//   wound-recovery conditions (a permanent wound that imposes "blinded/mute" rides the mortalWounds[]
//   record, NOT a standalone condition — survey §13.8); CL-2 owns infected/symptomatic. That leaves
//   exactly TWO unhomed persistent conditions for CL-3: HYPOTHERMIC and ENERVATED.
//
// SHAPE (the §2 persistent-state model, the CL-2 idiom): stored — character.conditions[] (init-on-
//   write, like diseases[]/mortalWounds[]; NO blankCharacter seed, so the 6 templates + demo stay
//   migrate-no-ops — the team-session discipline); driver — the slot-59 day-consumer; resolver — the
//   RR per-condition rule (the 1d3 CON/hour exposure drain · the daily Death save); propose→ratify —
//   the day-tick review (the dice are seeded-in-propose for a stable preview, the survival idiom);
//   history — the two events + per-day character.history entries. Hypothermia ⇄ the `incapacitated`
//   state is NOT set here (RR makes it a "can't force-march/heal" debuff, not incapacitation); a
//   symptomatic disease / wound owns that flag (CL-2 / D1).
//
// Polarity (CLAUDE §6): conditions are CORE RAW — default-on, no master house-rule gate. Dormant
//   until a condition is applied (the GM's "apply condition" action in v1; the Weather cold-exposure
//   trigger + the level-drain cause wire later — survey §6 / §15 / Q7). The slot-59 consumer's pause
//   is governed by the default-ON `auto-pause-on-condition` day-tick rule (no rule registration —
//   it rides the isDayTickRuleOn absent⇒ON fallback, the auto-pause-* family).
// =============================================================================
const CONDITION_CITE = 'RR pp.507–516';

// The persistent conditions CL-3 homes (the two unhomed members of the §6 persistent set). Mechanical
// fields only (the RAW posture); `cite` is the glossary page, `effect` an own-words gloss.
//   hypothermic — cannot force-march/heal; 1d3 CON lost per hour of continued exposure; death at 0
//     effective CON; ENDS BY WARMING (clearCondition). v1 models the per-hour drain as one 1d3 tick
//     per still-exposed day-tick (the day clock is the granularity; the hourly rate arrives with the
//     hour loop — the same deferral disease/encounters make). The drain is a RECOVERABLE exposure
//     accumulator (conLost on the record; effective CON = base − conLost), not permanent ability
//     damage — warming clears the condition and restores it (survey §6; the Provisioning conLoss idiom).
//   enervated — a Death save each day on waking; a FAILED save drains 1 MAXIMUM hp PERMANENTLY (level
//     drain — restored only by Restore Life & Limb, a future #155/D1 wire); THREE successful saves
//     end it; death at 0 maximum hp. Cause = undead/Magic level drain (Combat/Magic owns the trigger);
//     the daily-save STATE is lifecycle.
const PERSISTENT_CONDITIONS = Object.freeze([
  { id:'hypothermic', label:'Hypothermic', cite:'RR p.510', cadence:'per-exposure-day',
    conLossDice:'1d3', endsBy:'warming', recoverable:true, cause:'cold exposure (Weather)',
    effect:'Cannot force-march or heal; loses 1d3 CON per hour of continued exposure (death at 0 effective CON); ends by warming for an hour.' },
  { id:'enervated', label:'Enervated', cite:'RR p.508', cadence:'daily-save', requiresSaves:3,
    permanentMaxHp:true, cause:'level drain (undead / Magic)',
    effect:'A Death save each day on waking; a failed save permanently drains 1 maximum hit point; three successful saves end it; death at 0 maximum hp.' }
]);
const PERSISTENT_CONDITION_BY_ID = Object.freeze(PERSISTENT_CONDITIONS.reduce((m, c) => { m[c.id] = c; return m; }, {}));
function persistentConditionById(id){ return PERSISTENT_CONDITION_BY_ID[id] || null; }

// The §6 classification doctrine made data — every PERSISTENT (between-session) condition + where it
// is homed, so the split is explicit + testable. `home:'cl3'` are the two CL-3 manages; the rest are
// cross-references (already shipped). COMBAT_ROUND_CONDITIONS are a representative slice of the
// round/effect-duration glossary that is OUT of scope (→ Combat #140) — deliberately not managed here.
const CONDITION_CLASSIFICATION = Object.freeze({
  persistent: Object.freeze([
    Object.freeze({ id:'hungry',          home:'provisioning' }),
    Object.freeze({ id:'underfed',        home:'provisioning' }),
    Object.freeze({ id:'starving',        home:'provisioning' }),
    Object.freeze({ id:'dehydrated',      home:'provisioning' }),
    Object.freeze({ id:'fatigued',        home:'activity-budget' }),
    Object.freeze({ id:'hypothermic',     home:'cl3' }),
    Object.freeze({ id:'enervated',       home:'cl3' }),
    Object.freeze({ id:'infected',        home:'cl2-disease' }),
    Object.freeze({ id:'symptomatic',     home:'cl2-disease' }),
    Object.freeze({ id:'incapacitated',   home:'delves-d1 / cl2-disease' }),
    Object.freeze({ id:'mortally-wounded',home:'delves-d1' }),
    Object.freeze({ id:'grievously-wounded',home:'delves-d1' }),
    Object.freeze({ id:'critically-wounded',home:'delves-d1' })
  ]),
  // Round/turn/effect-duration — resolved live at the table; never carried between sessions.
  combatRoundOutOfScope: Object.freeze([
    'blinded','confused','cowering','deafened','disordered','dominated','drowning','engaged','enthralled',
    'faltering','flanked','frightened','grabbed','helpless','hidden','mute','paralyzed','petrified','prone',
    'restrained','slumbering','sneaking','stuck','stunned','surprised','vexed','vulnerable','webbed','winded','wrestled'
  ])
});

// ── module-local seeded PRNG (FNV-1a + mulberry32) — kept self-contained (the subsystems.js
//    _jHash32/_jMulberry32 are module-private). Used to make the slot-59 consumer's dice
//    preview-stable: re-opening the day-tick review reproduces the IDENTICAL roll (the survival
//    "don't pull from the future" fix), and it changes only when the committed state changes. ──
function _lcHash32(str){
  let h = 0x811c9dc5;
  for(let i = 0; i < str.length; i++){ h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return h >>> 0;
}
function _lcMulberry32(seed){
  let a = seed >>> 0;
  return function(){ a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// =============================================================================
// applyCondition — the application verb (the contractDisease idiom). A DIRECT call (a trigger, not
// the daily advance): the GM's "apply condition" action in v1 (the Weather cold-exposure trigger +
// the level-drain cause wire later). Pushes a character.conditions[] record (init-on-write, no
// blankCharacter seed) + emits `condition-applied`. Idempotent per condition id: an already-active
// instance is returned without stacking a duplicate. Returns the record (or null on a bad ref).
//   opts: { atDay, atTurn } (mostly for tests; defaults read the campaign clock).
// =============================================================================
function applyCondition(campaign, characterId, conditionId, opts){
  opts = opts || {};
  const c = (characterId && typeof characterId === 'object') ? characterId : _findCharacterLC(campaign, characterId);
  if(!c) return null;
  const def = persistentConditionById(conditionId);
  if(!def) return null;
  if(c.lifecycleState === 'deceased' || c.alive === false) return null;
  if(!Array.isArray(c.conditions)) c.conditions = [];                 // init-on-write (no blankCharacter seed)
  const existing = c.conditions.find(x => x && x.condition === conditionId && !x.resolved);
  if(existing) return existing;                                       // no stacking — one instance per condition
  const turn = (opts.atTurn != null) ? opts.atTurn : ((campaign && campaign.currentTurn) || 1);
  const day  = (opts.atDay  != null) ? opts.atDay  : ((campaign && campaign.currentDayInMonth) || 1);
  const rec = {
    id: 'cond' + turn + '_' + day + '_' + c.conditions.length,       // internal record id (no top-level prefix)
    condition: conditionId, conditionLabel: def.label,
    incurredAtDay: day, incurredAtTurn: turn,
    resolved: false, clearedAtDay: null, clearedReason: null, eventId: null
  };
  if(conditionId === 'hypothermic'){ rec.conLost = 0; rec.conBase = Number(c.abilities && c.abilities.CON) || 10; }
  if(conditionId === 'enervated'){ rec.successes = 0; rec.maxHpLost = 0; }
  c.conditions.push(rec);
  const summary = c.name + ' is ' + def.label.toLowerCase() + ' (' + def.cite + ').';
  try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'condition-applied', summary, { condition: conditionId }); } catch(_e){}
  const ev = _emitConditionEvent(campaign, c, 'condition-applied', {
    characterId: c.id, condition: conditionId, conditionLabel: def.label, effect: def.effect, narrative: summary
  }, summary);
  if(ev) rec.eventId = ev.id;
  return rec;
}

// =============================================================================
// clearCondition — the resolution verb (the cureDisease idiom): the GM warms a hypothermic character
// / a Restore ends enervation / a generic "this condition is over". Marks the record resolved, emits
// `condition-cleared` (outcome 'warmed'|'cured'|'cleared'). For enervation the permanent max-hp loss
// PERSISTS unless opts.restoreMaxHp (a future Restore-Life-and-Limb wire); for hypothermia the
// recoverable CON drain is released (effective CON returns to base — nothing to undo, the accumulator
// just no longer counts once resolved). Returns the record (or null on a bad ref).
// =============================================================================
function clearCondition(campaign, characterId, conditionRef, opts){
  opts = opts || {};
  const c = (characterId && typeof characterId === 'object') ? characterId : _findCharacterLC(campaign, characterId);
  if(!c || !Array.isArray(c.conditions)) return null;
  const rec = (conditionRef && typeof conditionRef === 'object') ? conditionRef
            : (typeof conditionRef === 'number') ? c.conditions[conditionRef]
            : c.conditions.find(x => x && (x.id === conditionRef || (x.condition === conditionRef && !x.resolved)));
  if(!rec || rec.resolved) return null;
  rec.resolved = true;
  rec.clearedAtDay = (campaign && campaign.currentDayInMonth) || 1;
  rec.clearedAtTurn = (campaign && campaign.currentTurn) || 1;
  const outcome = opts.method === 'warmed' ? 'warmed' : opts.method === 'restore' ? 'cured' : (opts.method || 'cleared');
  rec.clearedReason = outcome;
  // Enervation: restore the drained max hp only on an explicit Restore (RAW — the −1/save is permanent).
  if(rec.condition === 'enervated' && opts.restoreMaxHp && rec.maxHpLost > 0 && c.hp){
    c.hp.max = (Number(c.hp.max) || 0) + rec.maxHpLost; rec.maxHpLost = 0;
  }
  const def = persistentConditionById(rec.condition) || { label: rec.conditionLabel || rec.condition };
  const summary = c.name + ' is no longer ' + (def.label || rec.condition).toLowerCase() +
    (outcome === 'warmed' ? ' (warmed)' : outcome === 'cured' ? ' (restored)' : '') + '.';
  try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'condition-cleared', summary, { condition: rec.condition, outcome }); } catch(_e){}
  _emitConditionEvent(campaign, c, 'condition-cleared', {
    characterId: c.id, condition: rec.condition, conditionLabel: def.label || rec.condition,
    outcome, died: false, narrative: summary
  }, summary);
  return rec;
}

// =============================================================================
// The slot-59 day-tick consumer (the conditions cluster: disease 57 / convalescence 58 / conditions 59).
// PURE proposeConditionDay advances each active condition one day, carrying ABSOLUTE after-values (the
// convalescence/disease idiom — safe under the multi-day clone-commit); commitConditionRecord applies
// one ratified record. The dice (the 1d3 exposure drain · the daily Death save) are SEEDED in propose
// from the character's committed pre-state (the survival "stable preview" fix) so re-opening the review
// reproduces the identical day; an injected ctx.rng (tests / the reroll path) overrides.
//   hypothermic — each still-exposed day: lose 1d3 CON; death at 0 effective CON. (The GM warms via
//     clearCondition; the consumer is the backstop.) Pauses every day (deadly; the GM must decide).
//   enervated — each day a Death save (1d20 ≥ death target; a natural 1 always fails, RR pp.9–10):
//     fail → −1 max hp (permanent) + a pause; success → +1 toward the 3 needed (a routine non-final
//     success doesn't pause); the 3rd success → cleared; 0 max hp → death.
// =============================================================================
function characterActiveConditions(character){
  if(!character || !Array.isArray(character.conditions)) return [];
  return character.conditions.filter(c => c && !c.resolved);
}
function anyConditioned(campaign){
  return !!(campaign && Array.isArray(campaign.characters) && campaign.characters.some(c => characterActiveConditions(c).length));
}
// Effective CON = base − the CON drained by any active hypothermic condition (the recoverable
// exposure accumulator; survey §6). Does NOT read Provisioning's conLossHunger/Thirst — each
// subsystem tracks its own drain in v1 (cross-subsystem CON-loss stacking is a noted refinement).
function characterEffectiveCon(character){
  const base = Number(character && character.abilities && character.abilities.CON) || 10;
  let lost = 0;
  characterActiveConditions(character).forEach(c => { if(c.condition === 'hypothermic') lost += (Number(c.conLost) || 0); });
  return base - lost;
}
function _conditionFingerprint(campaign, c, cond, ctx){
  const cal = (campaign && campaign.calendar) || {};
  return JSON.stringify({
    d: (ctx && ctx.dayInMonth) || (campaign && campaign.currentDayInMonth) || 1, y: cal.year || 1, m: cal.month || 1,
    id: c.id, k: cond.condition, cl: cond.conLost || 0, s: cond.successes || 0, mh: cond.maxHpLost || 0,
    con: Number(c.abilities && c.abilities.CON) || 0, hp: Number(c.hp && c.hp.max) || 0
  });
}
function _seededConditionRng(campaign, c, cond, ctx){
  return _lcMulberry32(_lcHash32(_conditionFingerprint(campaign, c, cond, ctx)));
}
function proposeConditionDay(campaign, ctx){
  ctx = ctx || {};
  const out = { pendingRecords: [], notableEvents: [], encounters: [] };
  (campaign && campaign.characters || []).forEach(c => {
    if(c.lifecycleState === 'deceased' || c.alive === false) return;
    characterActiveConditions(c).forEach((cond, ci) => {
      const rng = (ctx.rng) || _seededConditionRng(campaign, c, cond, ctx);
      if(cond.condition === 'hypothermic'){
        const loss = _d(3, rng);                                        // 1d3 CON this exposure-day
        const conBase = (cond.conBase != null) ? cond.conBase : (Number(c.abilities && c.abilities.CON) || 10);
        const conLostAfter = (Number(cond.conLost) || 0) + loss;
        const effConAfter = conBase - conLostAfter;
        const died = effConAfter <= 0;
        const label = c.name + ' — hypothermic (−' + loss + ' CON' + (died ? ' · dies of exposure' : ', effective CON ' + effConAfter) + ')';
        out.pendingRecords.push({ kind:'condition', type:'condition', characterId:c.id, characterName:c.name,
          conditionId:cond.id, conditionIndex:ci, conditionKind:'hypothermic',
          conLossThisDay:loss, conLostAfter, effConAfter, outcome: died ? 'died' : 'advance', label });
        if(died){
          const s = c.name + ' dies of exposure (hypothermia — RR p.510)';
          out.notableEvents.push({ kind:'condition-cleared', type:'condition', pauseTrigger:'condition', label:s, summary:s,
            primaryHexId: c.currentHexId || null, relatedEntities:[{ kind:'character', id:c.id, role:'subject' }],
            payload:{ characterId:c.id, condition:'hypothermic', conditionLabel:'Hypothermic', outcome:'died', died:true, narrative:s } });
        } else {
          // Still freezing — a transient pause line (deadly; the GM warms or rides it). Not its own eventLog entry.
          const s = c.name + ' suffers hypothermia (−' + loss + ' CON; effective CON ' + effConAfter + ' — warm them or it kills)';
          out.notableEvents.push({ type:'condition', transient:true, pauseTrigger:'condition', label:s, summary:s,
            payload:{ characterId:c.id, condition:'hypothermic', effCon:effConAfter } });
        }
      } else if(cond.condition === 'enervated'){
        const target = (c.savingThrows && c.savingThrows.death != null) ? Number(c.savingThrows.death) : 15;
        const roll = _d(20, rng);
        const saved = roll !== 1 && roll >= target;                    // a natural 1 always fails (RR pp.9–10)
        let successesAfter = Number(cond.successes) || 0;
        let maxHpLostAfter = Number(cond.maxHpLost) || 0;
        const maxBefore = Number(c.hp && c.hp.max) || 0;
        let hpMaxAfter = maxBefore, outcome = 'advance', died = false, cleared = false;
        if(saved){
          successesAfter += 1;
          if(successesAfter >= 3){ outcome = 'recovered'; cleared = true; }
        } else {
          maxHpLostAfter += 1;
          if(maxBefore > 0){ hpMaxAfter = maxBefore - 1; if(hpMaxAfter <= 0){ outcome = 'died'; died = true; } }
        }
        const label = c.name + ' — enervated (Death save ' + roll + ' vs ' + target + '+ → ' +
          (saved ? (cleared ? 'recovers (3 saves)' : 'save ' + successesAfter + '/3') : (died ? 'dies — 0 max hp' : '−1 max hp')) + ')';
        out.pendingRecords.push({ kind:'condition', type:'condition', characterId:c.id, characterName:c.name,
          conditionId:cond.id, conditionIndex:ci, conditionKind:'enervated',
          saveRoll:roll, saveTarget:target, saved, successesAfter, maxHpLostAfter, hpMaxAfter, outcome, label });
        if(died){
          const s = c.name + ' succumbs to enervation — drained to 0 maximum hp (RR p.508)';
          out.notableEvents.push({ kind:'condition-cleared', type:'condition', pauseTrigger:'condition', label:s, summary:s,
            primaryHexId: c.currentHexId || null, relatedEntities:[{ kind:'character', id:c.id, role:'subject' }],
            payload:{ characterId:c.id, condition:'enervated', conditionLabel:'Enervated', outcome:'died', died:true, narrative:s } });
        } else if(cleared){
          const s = c.name + ' shakes off the enervation (three saves — RR p.508)';
          out.notableEvents.push({ kind:'condition-cleared', type:'condition', pauseTrigger:'condition', label:s, summary:s,
            primaryHexId: c.currentHexId || null, relatedEntities:[{ kind:'character', id:c.id, role:'subject' }],
            payload:{ characterId:c.id, condition:'enervated', conditionLabel:'Enervated', outcome:'recovered', died:false, narrative:s } });
        } else if(!saved){
          // A permanent max-hp drain — pause + a transient line (the cumulative loss shows on the sheet).
          const s = c.name + ' is drained by enervation (−1 maximum hp — RR p.508)';
          out.notableEvents.push({ type:'condition', transient:true, pauseTrigger:'condition', label:s, summary:s,
            payload:{ characterId:c.id, condition:'enervated', maxHpLost:maxHpLostAfter } });
        }
        // a routine non-final success: a pendingRecord only (no notable / no pause) — the disease-countdown idiom.
      }
    });
  });
  return out;
}
function commitConditionRecord(campaign, record){
  if(!campaign || !record || record.type !== 'condition') return;
  const c = _findCharacterLC(campaign, record.characterId);
  if(!c || !Array.isArray(c.conditions)) return;
  const cond = c.conditions.find(x => x && x.id === record.conditionId);
  if(!cond || cond.resolved) return;
  if(record.conditionKind === 'hypothermic'){
    cond.conLost = record.conLostAfter;
    if(record.outcome === 'died'){
      cond.resolved = true; cond.clearedReason = 'died';
      cond.resolvedAtTurn = campaign.currentTurn || 1; cond.resolvedAtDay = campaign.currentDayInMonth || 1;
      c.lifecycleState = 'deceased'; c.alive = false; c.deceasedTurn = campaign.currentTurn || 1;
      try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'condition-cleared', c.name + ' dies of exposure.', { condition:'hypothermic', outcome:'died' }); } catch(_e){}
      recordCharacterDeath(campaign, c, { cause:'exposure', heroic:false });   // CL-4a — unified death record
    } else {
      try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'condition-applied', c.name + ' loses ' + record.conLossThisDay + ' CON to hypothermia (effective CON ' + record.effConAfter + ').', { condition:'hypothermic', conLost: cond.conLost }); } catch(_e){}
    }
  } else if(record.conditionKind === 'enervated'){
    cond.successes = record.successesAfter;
    cond.maxHpLost = record.maxHpLostAfter;
    if(!record.saved && c.hp && (Number(c.hp.max) || 0) > 0){
      c.hp.max = record.hpMaxAfter;
      if((Number(c.hp.current) || 0) > c.hp.max) c.hp.current = c.hp.max;
    }
    if(record.outcome === 'died'){
      cond.resolved = true; cond.clearedReason = 'died';
      cond.resolvedAtTurn = campaign.currentTurn || 1; cond.resolvedAtDay = campaign.currentDayInMonth || 1;
      c.lifecycleState = 'deceased'; c.alive = false; c.deceasedTurn = campaign.currentTurn || 1;
      try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'condition-cleared', c.name + ' succumbs to enervation.', { condition:'enervated', outcome:'died' }); } catch(_e){}
      recordCharacterDeath(campaign, c, { cause:'enervation', heroic:false });   // CL-4a — unified death record
    } else if(record.outcome === 'recovered'){
      cond.resolved = true; cond.clearedReason = 'recovered';
      cond.resolvedAtTurn = campaign.currentTurn || 1; cond.resolvedAtDay = campaign.currentDayInMonth || 1;
      try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'condition-cleared', c.name + ' shakes off the enervation (three saves).', { condition:'enervated', outcome:'recovered' }); } catch(_e){}
    } else if(!record.saved){
      try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'condition-applied', c.name + ' is drained by enervation (−1 maximum hp).', { condition:'enervated', maxHpLost: cond.maxHpLost }); } catch(_e){}
    }
  }
}
// Direct (non-day-tick) advance — a GM "rest N days" / a test helper. Mirrors advanceDiseases.
function advanceConditions(campaign, days, opts){
  days = (typeof days === 'number' && days > 0) ? days : 1;
  let last = null;
  for(let i = 0; i < days; i++){
    const prop = proposeConditionDay(campaign, opts || {});
    prop.pendingRecords.forEach(r => commitConditionRecord(campaign, r));
    last = prop;
  }
  return last;
}

// A read accessor for the character-sheet Health panel — the active persistent conditions + their
// progress (effective CON for hypothermia, saves/max-hp-drain for enervation) + a danger line.
function characterConditionInfo(character){
  const active = characterActiveConditions(character);
  const effCon = characterEffectiveCon(character);
  return {
    count: active.length,
    hypothermic: active.some(c => c.condition === 'hypothermic'),
    enervated: active.some(c => c.condition === 'enervated'),
    effectiveCon: effCon,
    conditions: active.map(c => {
      const def = persistentConditionById(c.condition) || { label: c.conditionLabel || c.condition, effect:'' };
      const o = { id:c.id, condition:c.condition, label:def.label, effect:def.effect, cite:def.cite };
      if(c.condition === 'hypothermic'){ o.conLost = Number(c.conLost) || 0; o.effectiveCon = effCon;
        o.dangerLine = 'effective CON ' + effCon + ' (death at 0) — warm them to end it'; }
      if(c.condition === 'enervated'){ o.successes = Number(c.successes) || 0; o.maxHpLost = Number(c.maxHpLost) || 0;
        o.dangerLine = (Number(c.successes)||0) + ' / 3 saves · −' + (Number(c.maxHpLost)||0) + ' max hp so far'; }
      return o;
    })
  };
}

// =============================================================================
// Event emit — the record-only audit pattern (the disease/aging idiom). For the DIRECT verbs
// (applyCondition / clearCondition); the day-tick resolution (death / 3-save recovery) rides the
// pipeline's emit via the `condition-cleared` notable kind. cadence 'daily'; the character rides the
// context envelope as subject.
// =============================================================================
function _emitConditionEvent(campaign, c, kind, payload, narrative){
  const A = global.ACKS;
  if(!A || typeof A.newEvent !== 'function') return null;
  const cal = (campaign && campaign.calendar) || {};
  let ev;
  try {
    ev = A.newEvent(kind, {
      submittedBy:'engine', cadence:'daily', targetTurn:(campaign && campaign.currentTurn) || 1,
      gameTimeAt:{ year:cal.year || 1, month:cal.month || 1, day:(campaign && campaign.currentDayInMonth) || 1 },
      payload: Object.assign({ narrative }, payload || {})
    });
  } catch(_e){ return null; }
  if(typeof A.setEventContext === 'function'){
    A.setEventContext(ev, {
      primaryHexId:(c && c.currentHexId) || null,
      domainId:(c && c.currentDomainId) || null,
      relatedEntities:[{ kind:'character', id:c && c.id, role:'subject' }]
    });
  }
  ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
  ev.appliedAtTurn = (campaign && campaign.currentTurn) || 1;
  ev.appliedAtDay  = (campaign && campaign.currentDayInMonth) || 1;
  if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
  campaign.eventLog.push({ event: ev, result:{ narrativeSummary:narrative },
    appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
  return ev;
}

// ── self-register the slot-59 'conditions' day-consumer (disease 57 / convalescence 58 / conditions 59) ──
if(typeof ACKS.registerDayConsumer === 'function'){
  ACKS.registerDayConsumer('conditions', {
    handler: proposeConditionDay,
    order: 59,
    pauseTriggers: ['condition'],
    commit: commitConditionRecord
  });
}

Object.assign(ACKS, {
  // data
  PERSISTENT_CONDITIONS, CONDITION_CLASSIFICATION, CONDITION_CITE,
  // catalog lookup
  persistentConditionById,
  // verbs
  applyCondition, clearCondition,
  // reads
  characterActiveConditions, anyConditioned, characterEffectiveCon, characterConditionInfo,
  // the day-tick consumer (also self-registered above) + a direct advance
  proposeConditionDay, commitConditionRecord, advanceConditions
});
// === end Character Lifecycle CL-3 (burst7, team) =============================

// =============================================================================
// === Character Lifecycle CL-4a (burst8, team) — death & inheritance (RR pp.311–313) ==========
// The TERMINAL lifecycle transition — persistent-character-state class #13 (Plan CL-4a / survey §10).
// The RAW-CORE death economy: the unified cause-tagged death record + Reserve XP + the Heroic Funeral
// + a will / heir + the succession flow. Completes the lifecycle (CL-1 aging · CL-2 disease · CL-3
// conditions · CL-4a death) — each is "run the person forward," and this is "what happens when the
// run ends."
//
// EVENT-DRIVEN, not a clock pass (Plan §7 / the task): death is whatever sets lifecycleState:'deceased'
//   (wounds Delves D1 / disease CL-2 / old-age CL-1 / exposure-enervation CL-3 / GM fiat). recordCharacterDeath
//   is the SINGLE canonical death-applier + `character-died` emitter; the three in-module death sites
//   (the aging death branch + the disease/condition commit-died branches) route through it so their
//   deaths are cause-tagged at the source. reconcileCharacterDeaths sweeps deaths set OUTSIDE this
//   module (D1 / battle / fiat — files this lane can't touch) and back-fills the unified record (a
//   best-effort cause; GM-overridable). There is NO commitTurn / day-tick hook — the economy + the
//   succession flow hang off the death, surfaced as a GM action on the char-sheet Health cluster.
//
// SHAPE (the §2 persistent-state model): stored — character fields, ALL defensive-read / init-on-write
//   (reserveXp is the one CL-1 already seeds on blankCharacter; heirCharacterId / will / causeOfDeath /
//   diedHeroically / deathRecordedTurn / successionResolved / successorCharacterId / successorOf are
//   NOT seeded → the 6 templates + demo stay migrate-no-ops, the team-session discipline; no entities.js
//   touch, no migration); resolver — the RR pp.311–313 economy (Reserve XP = 90% of no-benefit spend,
//   capped at the prior character's XP; Heroic Funeral = 90% of funeral gp, only for a heroic death;
//   inheritance via a will/heir with a ~10% bank fee, else banked treasure is lost); propose→ratify —
//   the GM drives the succession flow (principle #1); history — the two events (character-died /
//   inheritance-resolved) + character.history.
//
// Polarity (CLAUDE §6): the death economy is CORE RAW — default-on, no master house-rule gate. Dormant
//   until a character dies. The optional AXIOMS-19 dynasty layer (CL-4b — a dynasty entity + kinship
//   relations + succession laws) is a SEPARATE default-OFF wave built with/after Politics; NOT here.
// =============================================================================
const CL4A_CITE = 'RR pp.311–313';
const RESERVE_XP_RATE = 0.9;          // Reserve XP = 90% of gp spent to no lasting benefit (RR p.311)
const FUNERAL_XP_RATE = 0.9;          // Heroic Funeral = 90% of the gp spent on the funeral (RR p.312)
const INHERITANCE_BANK_FEE_PCT = 10;  // a bank passes inherited treasure for ~10% (RR p.313)

// The cause vocabulary the unified death record is tagged with (the death sites pass their own cause;
// any string is accepted — these are the canonical ones the UI + reconcile know how to label).
const DEATH_CAUSES = Object.freeze(['wounds', 'disease', 'old-age', 'exposure', 'enervation', 'battle', 'fiat', 'unknown']);
const DEATH_CAUSE_LABEL = Object.freeze({
  wounds:'wounds', disease:'disease', 'old-age':'old age', exposure:'exposure', enervation:'enervation',
  battle:'battle', fiat:'GM ruling', unknown:'unknown causes'
});

// gp-equivalent of a multi-denomination coin purse (RAW: pp 5 / gp 1 / ep ½ / sp 1⁄10 / cp 1⁄100).
const COIN_GP = Object.freeze({ pp:5, gp:1, ep:0.5, sp:0.1, cp:0.01 });
function _purseGpValue(coins){
  if(!coins || typeof coins !== 'object') return 0;
  let v = 0; for(const k in COIN_GP){ v += (Number(coins[k]) || 0) * COIN_GP[k]; }
  return Math.round(v * 100) / 100;
}
function _zeroPurse(c){ if(c){ c.coins = { pp:0, gp:0, ep:0, sp:0, cp:0 }; c.personalGp = 0; } }
function _addGpToPurse(c, gp){
  if(!c) return;
  if(!c.coins || typeof c.coins !== 'object') c.coins = { pp:0, gp:0, ep:0, sp:0, cp:0 };
  c.coins.gp = (Number(c.coins.gp) || 0) + (Number(gp) || 0);
  c.personalGp = c.coins.gp;   // keep the synced mirror (canonical-setter rule #10)
}
function _charXp(c){ return Math.max(0, Math.floor(Number(c && c.xp) || 0)); }

// characterReserveXp — the read accessor (defensive: absent ⇒ 0; reserveXp IS seeded on blankCharacter
// by CL-1, but legacy/external characters may lack it).
function characterReserveXp(c){ return Math.max(0, Math.floor(Number(c && c.reserveXp) || 0)); }

// =============================================================================
// recordCharacterDeath — the SINGLE canonical death-applier + `character-died` emitter. Idempotent
// per character (guarded on the new deathRecordedTurn field) so it's safe to call from a death site
// that already set deceased, from the reconcile sweep, or directly as a GM "kill this character."
//   opts: { cause, heroic, sourceEventId, narrative, atTurn }.
// Sets the deceased state if not already (lifecycleState/alive/deceasedTurn), tags the cause + heroism,
// stamps deathRecordedTurn, records history, and emits the cause-tagged record-only `character-died`.
// =============================================================================
function recordCharacterDeath(campaign, charOrId, opts){
  opts = opts || {};
  const c = (charOrId && typeof charOrId === 'object') ? charOrId : _findCharacterLC(campaign, charOrId);
  if(!c) return null;
  if(c.deathRecordedTurn != null) return null;          // idempotent — one character-died per character
  const turn = (opts.atTurn != null) ? opts.atTurn : ((campaign && campaign.currentTurn) || 1);
  const cause = opts.cause || 'unknown';
  const heroic = opts.heroic === true;
  // Apply the deceased state (a death site may have set it already; this also serves a direct GM kill).
  if(c.lifecycleState !== 'deceased') c.lifecycleState = 'deceased';
  c.alive = false;
  if(c.deceasedTurn == null) c.deceasedTurn = turn;
  c.causeOfDeath = cause;
  c.diedHeroically = heroic;
  c.deathRecordedTurn = turn;
  const reserveXp = characterReserveXp(c);
  const causeLabel = DEATH_CAUSE_LABEL[cause] || cause;
  const summary = opts.narrative || (c.name + ' dies (' + causeLabel + ').');
  try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'character-died', summary, { cause, heroic }); } catch(_e){}
  const ev = _emitDeathEvent(campaign, c, 'character-died', {
    characterId: c.id, cause, heroic, reserveXp, deceasedTurn: c.deceasedTurn,
    sourceEventId: opts.sourceEventId || null, narrative: summary
  }, summary);
  return { characterId: c.id, cause, heroic, reserveXp, deceasedTurn: c.deceasedTurn, eventId: ev && ev.id };
}

// _inferDeathCause — a best-effort cause for a death set outside this module (the reconcile sweep).
function _inferDeathCause(c){
  if(c && Array.isArray(c.mortalWounds) && c.mortalWounds.length) return 'wounds';
  if(c && Array.isArray(c.diseases) && c.diseases.some(d => d && d.phase === 'died')) return 'disease';
  if(c && Array.isArray(c.conditions) && c.conditions.some(x => x && x.clearedReason === 'died')) return 'exposure';
  return 'unknown';
}

// reconcileCharacterDeaths — sweep characters set deceased OUTSIDE this module (Delves D1 wounds, the
// battle aftermath, GM fiat — files this lane can't touch) and back-fill the unified `character-died`
// record. Idempotent (skips any with deathRecordedTurn set). The UI calls this before the succession
// surface so every death — however caused — has a record. opts.causeByCharId overrides the inference.
function reconcileCharacterDeaths(campaign, opts){
  opts = opts || {};
  const byId = opts.causeByCharId || {};
  const out = [];
  ((campaign && campaign.characters) || []).forEach(c => {
    if(!c) return;
    const dead = (c.lifecycleState === 'deceased') || (c.alive === false);
    if(!dead || c.deathRecordedTurn != null) return;
    const cause = byId[c.id] || _inferDeathCause(c) || 'unknown';
    const rec = recordCharacterDeath(campaign, c, { cause, heroic: opts.heroic === true });
    if(rec) out.push(rec);
  });
  return out;
}

// =============================================================================
// addReserveXp — accrue the Reserve XP fund (RR p.311: 90% of the gp value of money spent to no
// tangible game benefit — carousing, anonymous tithes, memorials). A verb a GM (or a future
// wealth-transfer hook) calls; carried ON the character (Q3) + inherited by the successor. Quiet
// (history-only — no event kind; reserve accrual isn't one of CL-4a's two events). Returns the new total.
//   opts: { gpSpent (→ ×0.9), amount (a direct XP add — wins over gpSpent), reason }.
// =============================================================================
function addReserveXp(campaign, charOrId, opts){
  opts = opts || {};
  const c = (charOrId && typeof charOrId === 'object') ? charOrId : _findCharacterLC(campaign, charOrId);
  if(!c) return 0;
  const amt = (opts.amount != null) ? Math.max(0, Math.floor(Number(opts.amount) || 0))
            : Math.max(0, Math.floor(RESERVE_XP_RATE * (Number(opts.gpSpent) || 0)));
  if(amt <= 0) return characterReserveXp(c);
  c.reserveXp = characterReserveXp(c) + amt;
  const reason = opts.reason || 'spent to no lasting benefit';
  const summary = c.name + ' banks ' + amt + ' Reserve XP (' + reason + ').';
  try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'reserve-xp', summary, { amount: amt, reason }); } catch(_e){}
  return c.reserveXp;
}

// Will / heir setters — quiet planning fields (defensive-read, init-on-write; no event). The will is
// { bequests:[{ kind:'stash'|'item'|'gp', ref, ... }], funeralGp? } | null (Plan §4).
function setCharacterHeir(campaign, charOrId, heirId){
  const c = (charOrId && typeof charOrId === 'object') ? charOrId : _findCharacterLC(campaign, charOrId);
  if(!c) return null;
  c.heirCharacterId = heirId || null;
  return c;
}
function setCharacterWill(campaign, charOrId, will){
  const c = (charOrId && typeof charOrId === 'object') ? charOrId : _findCharacterLC(campaign, charOrId);
  if(!c) return null;
  c.will = will || null;
  return c;
}

// =============================================================================
// successionCandidates — who can succeed the deceased (RR p.311: a henchman to promote / the declared
// heir / a party member). The declared heir leads; henchmen (lieged to the deceased) + followers; then
// party members. Excludes the deceased + the dead. For the succession flow's "promote a henchman" picker.
// =============================================================================
function successionCandidates(campaign, deceasedId){
  const out = []; const seen = new Set();
  const dec = _findCharacterLC(campaign, deceasedId);
  if(!dec) return out;
  const add = (c, rel) => {
    if(!c || seen.has(c.id) || c.id === dec.id) return;
    if(c.lifecycleState === 'deceased' || c.alive === false) return;
    seen.add(c.id);
    out.push({ id:c.id, name:c.name, relationship:rel, level:(Number(c.level)||0), xp:_charXp(c), reserveXp:characterReserveXp(c) });
  };
  if(dec.heirCharacterId) add(_findCharacterLC(campaign, dec.heirCharacterId), 'heir');
  ((campaign && campaign.characters) || []).forEach(c => {
    if(c && c.liegeCharacterId === dec.id && (c.socialTier === 'henchman' || c.socialTier === 'follower')) add(c, c.socialTier);
  });
  if(dec.partyId){ ((campaign && campaign.characters) || []).forEach(c => { if(c && c.partyId === dec.partyId) add(c, 'party'); }); }
  return out;
}

// pendingSuccessions — deceased characters whose succession hasn't been resolved (the GM work queue).
function pendingSuccessions(campaign){
  return ((campaign && campaign.characters) || []).filter(c => c && (c.lifecycleState === 'deceased' || c.alive === false) && !c.successionResolved);
}

// =============================================================================
// resolveSuccession — the heart of CL-4a (RR pp.311–313). One GM action resolves a death's economy:
//   • the SUCCESSOR (mode: 'promote-henchman' | 'heir' | 'existing' [an existing character] OR
//     'back-up' | 'new-character' [mint a fresh PC]). A promoted/heir successor keeps its own XP +
//     the heroic-funeral bonus, floored at the reserve; a fresh successor starts at reserve + funeral.
//   • RESERVE XP (RR p.311): reserveXpApplied = min(the deceased's reserveXp, the deceased's XP) —
//     "a new character can never enter with more XP than the prior character had." The reserve itself
//     carries onward to the successor (undepleted by use).
//   • the HEROIC FUNERAL (RR p.312): heroic ? floor(0.9 × funeralGpSpent) : 0 — only a heroic death
//     earns it (a cowardly/frightened/retreating death does not; heroic defaults from the death record,
//     GM-overridable per opts.heroic).
//   • INHERITANCE (RR p.313): with a will + heir, the deceased's purse passes (valued in gp, minus the
//     ~10% bank fee) + the will's bequeathed stashes change controller to the heir. With NO heir, the
//     banked treasure is LOST (seized — only personal property on the body passes, to the looters).
// Idempotent (successionResolved). Ensures the death is recorded first. Emits `inheritance-resolved`.
//   opts: { mode, successorCharacterId, newCharacterName, funeralGpSpent, heroic, heirId, bankFeePct,
//           transferTreasure (default true), cause, rng }.
// =============================================================================
function resolveSuccession(campaign, deceasedId, opts){
  opts = opts || {};
  const dec = (deceasedId && typeof deceasedId === 'object') ? deceasedId : _findCharacterLC(campaign, deceasedId);
  if(!dec) return null;
  if(dec.successionResolved) return { alreadyResolved:true, deceasedId: dec.id, successorCharacterId: dec.successorCharacterId || null };

  // Ensure the death is recorded (a GM resolving an externally-killed character gets character-died first).
  if(dec.deathRecordedTurn == null && (dec.lifecycleState === 'deceased' || dec.alive === false)){
    recordCharacterDeath(campaign, dec, { cause: opts.cause || _inferDeathCause(dec) || 'unknown', heroic: opts.heroic === true });
  }

  const mode = opts.mode || 'new-character';
  const deceasedXp = _charXp(dec);
  const reserve = characterReserveXp(dec);
  const reserveXpApplied = Math.min(reserve, deceasedXp);     // RAW: never more than the prior character had
  const heroic = (opts.heroic != null) ? !!opts.heroic : (dec.diedHeroically === true);
  const funeralGpSpent = Math.max(0, Number(opts.funeralGpSpent) || 0);
  const funeralXp = (heroic && funeralGpSpent > 0) ? Math.floor(FUNERAL_XP_RATE * funeralGpSpent) : 0;
  const startXp = reserveXpApplied + funeralXp;

  let successor = null, createdNew = false;
  if(mode === 'promote-henchman' || mode === 'heir' || mode === 'existing'){
    successor = _findCharacterLC(campaign, opts.successorCharacterId);
    if(successor){
      successor.xp = Math.max(_charXp(successor), reserveXpApplied) + funeralXp;   // keep its XP, floored at the reserve, + funeral
      if(successor.lifecycleState !== 'deceased' && successor.alive !== false) successor.lifecycleState = 'active';
      successor.successorOf = dec.id;
      if(reserve > characterReserveXp(successor)) successor.reserveXp = reserve;     // the reserve floor carries on
    }
  } else if(typeof ACKS.blankCharacter === 'function'){
    // back-up / new-character — mint a fresh PC at the reserve+funeral starting floor.
    successor = ACKS.blankCharacter({ name: opts.newCharacterName || (dec.name + "'s successor"),
      xp: startXp, controlledBy: dec.controlledBy || 'player', race: dec.race || 'human' });
    successor.successorOf = dec.id;
    successor.reserveXp = reserve;             // the reserve carries to the successor (undepleted)
    if(!Array.isArray(campaign.characters)) campaign.characters = [];
    campaign.characters.push(successor);
    createdNew = true;
  }
  const successorId = successor ? successor.id : null;

  // Inheritance (RR pp.312–313) — will + heir; ~10% bank fee; no heir ⇒ banked treasure lost.
  const heirId = opts.heirId || dec.heirCharacterId || ((mode === 'heir' || mode === 'promote-henchman') ? successorId : null);
  const heir = heirId ? _findCharacterLC(campaign, heirId) : null;
  const bankFeePct = (opts.bankFeePct != null) ? Number(opts.bankFeePct) : INHERITANCE_BANK_FEE_PCT;
  const purseGp = _purseGpValue(dec.coins);
  let transferredGp = 0, bankFeeGp = 0, treasureLost = 0, stashesTransferred = 0;
  const transfer = opts.transferTreasure !== false;
  if(transfer && heir){
    if(purseGp > 0){
      bankFeeGp = Math.floor(purseGp * (Math.max(0, bankFeePct) / 100));
      transferredGp = Math.round((purseGp - bankFeeGp) * 100) / 100;
      _zeroPurse(dec);
      _addGpToPurse(heir, transferredGp);
    }
    const bequests = (dec.will && Array.isArray(dec.will.bequests)) ? dec.will.bequests : [];
    bequests.forEach(b => {
      if(b && b.kind === 'stash' && b.ref && typeof ACKS.changeStashController === 'function'){
        try { if(ACKS.changeStashController(campaign, b.ref, { characterId: heir.id }, { reason:'inheritance' })) stashesTransferred++; } catch(_e){}
      }
    });
  } else if(purseGp > 0){
    treasureLost = purseGp;       // no will/heir → banked treasure seized (RAW p.313)
  }

  dec.successionResolved = true;
  dec.successorCharacterId = successorId;

  const summary = _successionNarrative(dec, successor, mode, { reserveXpApplied, funeralXp, transferredGp, bankFeeGp, treasureLost });
  try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, dec, 'inheritance-resolved', summary, { successorId, heirId: heir ? heir.id : null }); } catch(_e){}
  const ev = _emitDeathEvent(campaign, dec, 'inheritance-resolved', {
    deceasedId: dec.id, successorId, successorMode: mode, heirId: heir ? heir.id : null,
    reserveXpApplied, funeralXp, funeralGpSpent, heroic,
    transferredGp, bankFeeGp, bankFeePct, treasureLost, stashesTransferred,
    successorStartXp: createdNew ? startXp : (successor ? _charXp(successor) : 0), narrative: summary
  }, summary);

  return { deceasedId: dec.id, successorId, successorMode: mode, createdNew, heirId: heir ? heir.id : null,
    reserveXpApplied, funeralXp, transferredGp, bankFeeGp, treasureLost, stashesTransferred,
    eventId: ev && ev.id, successor };
}

function _successionNarrative(dec, successor, mode, x){
  const bits = [];
  if(successor) bits.push((mode === 'promote-henchman' ? 'promotes ' : mode === 'heir' ? 'is succeeded by the heir ' : 'is succeeded by ') + successor.name);
  else bits.push('leaves no successor');
  if(x.reserveXpApplied) bits.push(x.reserveXpApplied + ' reserve XP');
  if(x.funeralXp) bits.push(x.funeralXp + ' heroic-funeral XP');
  if(x.transferredGp) bits.push(x.transferredGp + ' gp inherited' + (x.bankFeeGp ? (' (after a ' + x.bankFeeGp + ' gp bank fee)') : ''));
  if(x.treasureLost) bits.push(x.treasureLost + ' gp of banked treasure lost (no heir)');
  return dec.name + ' — ' + bits.join('; ') + '.';
}

// characterDeathInfo — the char-sheet read accessor (the Lifecycle/Health-cluster card): the death
// state + cause + heroism + the Reserve XP / heir / will planning fields + the succession status.
function characterDeathInfo(c){
  if(!c) return { deceased:false };
  const deceased = (c.lifecycleState === 'deceased') || (c.alive === false);
  return {
    deceased,
    cause: c.causeOfDeath || null,
    causeLabel: c.causeOfDeath ? (DEATH_CAUSE_LABEL[c.causeOfDeath] || c.causeOfDeath) : null,
    heroic: c.diedHeroically === true,
    deceasedTurn: (c.deceasedTurn != null) ? c.deceasedTurn : null,
    deathRecorded: c.deathRecordedTurn != null,
    reserveXp: characterReserveXp(c),
    heirCharacterId: c.heirCharacterId || null,
    will: c.will || null,
    bequestCount: (c.will && Array.isArray(c.will.bequests)) ? c.will.bequests.length : 0,
    successionResolved: c.successionResolved === true,
    successorCharacterId: c.successorCharacterId || null
  };
}

// =============================================================================
// Event emit — the record-only audit pattern (the aging/disease/condition idiom). Both CL-4a kinds
// (`character-died` / `inheritance-resolved`) ride it. The deceased is the context subject; a
// successor/heir rides as beneficiary/recipient so the death surfaces in their histories too.
// =============================================================================
function _emitDeathEvent(campaign, c, kind, payload, narrative){
  const A = global.ACKS;
  if(!A || typeof A.newEvent !== 'function') return null;
  const cal = (campaign && campaign.calendar) || {};
  let ev;
  try {
    ev = A.newEvent(kind, {
      submittedBy:'engine', cadence:'monthly-turn', targetTurn:(campaign && campaign.currentTurn) || 1,
      gameTimeAt:{ year:cal.year || 1, month:cal.month || 1, day:(campaign && campaign.currentDayInMonth) || 1 },
      payload: Object.assign({ narrative }, payload || {})
    });
  } catch(_e){ return null; }
  if(typeof A.setEventContext === 'function'){
    const related = [{ kind:'character', id:c && c.id, role:'subject' }];
    if(payload && payload.successorId) related.push({ kind:'character', id:payload.successorId, role:'beneficiary' });
    if(payload && payload.heirId && payload.heirId !== payload.successorId) related.push({ kind:'character', id:payload.heirId, role:'recipient' });
    A.setEventContext(ev, { primaryHexId:(c && c.currentHexId) || null, domainId:(c && c.currentDomainId) || null, relatedEntities: related });
  }
  ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
  ev.appliedAtTurn = (campaign && campaign.currentTurn) || 1;
  ev.appliedAtDay  = (campaign && campaign.currentDayInMonth) || 1;
  if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
  campaign.eventLog.push({ event: ev, result:{ narrativeSummary:narrative },
    appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
  return ev;
}

Object.assign(ACKS, {
  // data
  DEATH_CAUSES, CL4A_CITE, RESERVE_XP_RATE, FUNERAL_XP_RATE, INHERITANCE_BANK_FEE_PCT,
  // the canonical death record + the reconcile sweep
  recordCharacterDeath, reconcileCharacterDeaths,
  // the death economy
  addReserveXp, characterReserveXp, setCharacterHeir, setCharacterWill,
  // succession
  successionCandidates, resolveSuccession, pendingSuccessions,
  // reads
  characterDeathInfo
});
// === end Character Lifecycle CL-4a (burst8, team) ============================

// =============================================================================
// === Character Lifecycle CL-5 (team) — character transformation (JJ pp.94–95) ================
// The transformation ledger + the alignment-drift save schedule — persistent-character-state class
// #10 (Character_Lifecycle_Plan §11 CL-5 / survey §9). An adventurer turned into an intelligent
// monster (lycanthropy / crossbreeding / necromantic ritual / polymorph) RETAINS their attributes,
// makes a Spells save to KEEP their class abilities (fail = lost), and then DRIFTS toward the new
// form's alignment & personality — a Death save on transformation and at each age/HD step (success =
// keep your old self), with two exceptions (a lycanthrope who REJECTS the gift, and an "After the
// Flesh" undead, keep their own minds — no drift).
//
// THE SCOPE BOUNDARY (the task): this layer owns the LEDGER + the drift-save SCHEDULE, NOT the full
//   effect resolution. transformationState records WHETHER class abilities were kept (the Spells save)
//   + the alignment-drift saves; it does NOT rewrite the character's class/HD/AC/attacks/creatureTypes
//   — that is the Phase-5 / Magic resolver's job (JJ pp.94–95 full effects). The CAUSE (how you got
//   infected/crossbred/ritualized) is a Magic STUB seam: transformCharacter is the manual GM verb v1;
//   the Magic cause-side calls it (or transformationDriftSave at an HD step) when it lands. The reserved
//   blankCharacter `transformationState` field (seeded null) is the contract this shapes (survey §9 /
//   Plan §4): { form, trigger, keptClassAbilities, alignmentDriftSaves[], retainedSelf, transformedAtTurn,
//   reversible, history[] } + the operational drift-schedule fields.
//
// SHAPE (the §2 persistent-state model): stored — character.transformationState (a single object, set by
//   transformCharacter, cleared to null by revertCharacter; the eventLog IS the cross-character history);
//   driver — the MONTHLY drift-save pass (processTransformationsForTurn, folded into processAgingForTurn
//   so it rides the one monthly lifecycle hook commitTurn/proposeMonthlyTurn already call — this lane
//   cannot add a hook to acks-engine.js); resolver — the JJ pp.94–95 Spells save (keep abilities) + the
//   alignment-drift Death save; propose→ratify — the monthly-turn review (dryRun rolls nothing); history
//   — the two events (character-transformed / transformation-reverted) + the alignmentDriftSaves[] ledger.
//   The five-axis lifecycleState flips active→'transformed' on transform, back to 'active' on revert.
//
// v1 SIMPLIFICATIONS (Mechanic Extensions): the drift cadence is a configurable monthly interval
//   (driftSaveIntervalMonths, default 12 — ≈ "each age/HD step"); the precise per-HD-step trigger is a
//   Magic/Phase-5 refinement that can call transformationDriftSave directly. A single drift FAILURE means
//   the mind has drifted to the new form (retainedSelf:false, the schedule ends) — RAW frames each save
//   as "keep your old self", so one failure loses it. Class-ability LOSS / the monster's stat block are
//   recorded as flags for the resolver, not auto-applied. Drift saves emit NO event (only the two
//   bracketing kinds are allocated) — they ride the ledger + character.history + the monthly log.
//
// Polarity (CLAUDE §6): transformation is CORE RAW — default-on, no master house-rule gate. Dormant
//   until a character is transformed (the GM's "transform" action in v1; the Magic cause wires later).
// =============================================================================
const TRANSFORMATION_CITE = 'JJ pp.94–95';
const DRIFT_SAVE_DEFAULT_INTERVAL_MONTHS = 12;   // v1 schedule cadence (≈ each age/HD step); GM-settable.

// The transformation triggers (JJ pp.94–95). Reference data for the UI picker + the cause-seam. `canReject`
// marks a trigger whose subject may REJECT it (a lycanthrope keeps their human-form morality → no drift);
// `undeadAfterFlesh` marks the "After the Flesh" undead exception (keeps their own mind). Mechanical
// flags only (the RAW posture); `form` is free-text / a monster-catalog key the GM supplies.
const TRANSFORMATION_TRIGGERS = Object.freeze([
  { id:'lycanthropy',  label:'Lycanthropy',          canReject:true,  cite:'JJ p.94' },
  { id:'crossbreed',   label:'Magical crossbreeding', canReject:false, cite:'JJ p.94' },
  { id:'necromantic',  label:'Necromantic ritual',    canReject:false, undeadAfterFlesh:true, cite:'JJ p.95' },
  { id:'polymorph',    label:'Polymorph',             canReject:false, cite:'JJ p.94' },
  { id:'possession',   label:'Possession',            canReject:false, cite:'JJ p.94' },
  { id:'awakening',    label:'Awakening',             canReject:false, cite:'JJ p.94' },
  { id:'other',        label:'Other',                 canReject:false, cite:'JJ pp.94–95' }
]);
const TRANSFORMATION_TRIGGER_BY_ID = Object.freeze(TRANSFORMATION_TRIGGERS.reduce((m, t) => { m[t.id] = t; return m; }, {}));
function transformationTriggerById(id){ return TRANSFORMATION_TRIGGER_BY_ID[id] || null; }

// isTransformed — the predicate (defensive: absent/null ⇒ false). A transformed character carries a
// non-null transformationState; the five-axis lifecycleState reads 'transformed'.
function isTransformed(c){ return !!(c && c.transformationState && typeof c.transformationState === 'object'); }

// _spellsSaveTarget / _deathSaveTarget — the save targets (default 15; + a GM modifier). A natural 1
// always fails (RR pp.9–10) — applied at the roll sites, the disease/condition idiom.
function _spellsSaveTarget(c, opts){
  const base = (c && c.savingThrows && c.savingThrows.spells != null) ? Number(c.savingThrows.spells) : 15;
  return base - (Number(opts && opts.spellsSaveMod) || 0);   // a positive mod EASES the save (lowers the target)
}
function _driftSaveTarget(c, opts){
  const base = (c && c.savingThrows && c.savingThrows.death != null) ? Number(c.savingThrows.death) : 15;
  return base - (Number(opts && opts.driftSaveMod) || 0);
}

// _applyDriftSave — roll + apply ONE alignment-drift Death save (JJ pp.94–95). Mutates the state: pushes
// the save to alignmentDriftSaves[], and on a FAIL flips retainedSelf:false + ends the schedule (the mind
// has drifted to the new form); on a PASS keeps retainedSelf + RE-ARMS the next interval. Records a
// history line + returns { roll, target, saved, drifted }. Shared by the monthly clock (commit) + the
// direct transformationDriftSave verb. forcedRoll (tests / a Magic-side roll) overrides the die.
function _applyDriftSave(campaign, c, rng, opts){
  opts = opts || {};
  const st = c.transformationState;
  const target = _driftSaveTarget(c, opts);
  const roll = (opts.forcedRoll != null) ? Number(opts.forcedRoll) : _d(20, rng);
  const saved = roll !== 1 && roll >= target;             // a natural 1 always fails (RR pp.9–10)
  const turn = (campaign && campaign.currentTurn) || 1;
  if(!Array.isArray(st.alignmentDriftSaves)) st.alignmentDriftSaves = [];
  st.alignmentDriftSaves.push({ atTurn: turn, roll, target, saved, initial: !!opts.initial });
  let drifted = false;
  if(saved){
    st.retainedSelf = true;
    const interval = Number(st.driftSaveIntervalMonths) || DRIFT_SAVE_DEFAULT_INTERVAL_MONTHS;
    st.driftSave = { dueInMonths: interval };              // re-arm for the next age/HD step
    _txHistory(st, turn, 'drift-resisted', c.name + ' resists the drift toward ' + st.form + ' (Death save ' + roll + ' vs ' + target + '+).');
  } else {
    st.retainedSelf = false;
    st.driftSave = null;                                   // the mind is the new form's now — no more saves
    drifted = true;
    _txHistory(st, turn, 'drifted', c.name + ' drifts away — now thinks and feels as a ' + st.form + ' (Death save ' + roll + ' vs ' + target + '+ — failed).');
  }
  return { roll, target, saved, drifted };
}
function _txHistory(st, turn, type, note){
  if(!Array.isArray(st.history)) st.history = [];
  st.history.push({ atTurn: turn, type, note });
}

// =============================================================================
// transformCharacter — the transformation verb (JJ pp.94–95). The manual GM action in v1 (the Magic
// cause-side calls it when it lands). Rolls the Spells save (keep class abilities) + the INITIAL
// alignment-drift Death save (unless the subject rejects the gift / is an After-the-Flesh undead), arms
// the drift schedule, flips lifecycleState→'transformed', sets transformationState, emits the record-only
// `character-transformed`. Overwrites any prior transformation (a new form supersedes; the prior rides
// the eventLog). Returns the transformationState (or null on a bad char / missing form).
//   opts: { form (required — monster key / free text), trigger ('lycanthropy'|…), rng, reversible (default
//           true), rejectedGift, afterTheFlesh, driftSaveIntervalMonths, spellsSaveMod, driftSaveMod,
//           forcedSpellsRoll, forcedDriftRoll }.
// =============================================================================
function transformCharacter(campaign, characterId, opts){
  opts = opts || {};
  const c = (characterId && typeof characterId === 'object') ? characterId : _findCharacterLC(campaign, characterId);
  if(!c) return null;
  if(c.lifecycleState === 'deceased' || c.alive === false) return null;     // the dead don't transform
  const form = String(opts.form || '').trim();
  if(!form) return null;                                                    // a form is required
  const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
  const triggerId = opts.trigger || 'other';
  const trig = transformationTriggerById(triggerId) || transformationTriggerById('other');
  const turn = (campaign && campaign.currentTurn) || 1;

  // (1) The Spells save to KEEP class abilities (fail = lost — recorded, the resolver applies the loss).
  const spellsTarget = _spellsSaveTarget(c, opts);
  const spellsRoll = (opts.forcedSpellsRoll != null) ? Number(opts.forcedSpellsRoll) : _d(20, rng);
  const keptClassAbilities = spellsRoll !== 1 && spellsRoll >= spellsTarget;   // natural 1 always fails

  // (2) The exceptions (JJ pp.94–95): a lycanthrope who REJECTS the gift, or an After-the-Flesh undead,
  //     keeps their own mind — no alignment drift. (rejectedGift only honored for a can-reject trigger.)
  const rejectedGift = opts.rejectedGift === true && !!trig.canReject;
  const afterTheFlesh = opts.afterTheFlesh === true && !!trig.undeadAfterFlesh;
  const autoRetain = rejectedGift || afterTheFlesh;
  const interval = (opts.driftSaveIntervalMonths != null) ? Math.max(1, Math.floor(Number(opts.driftSaveIntervalMonths)) || DRIFT_SAVE_DEFAULT_INTERVAL_MONTHS) : DRIFT_SAVE_DEFAULT_INTERVAL_MONTHS;

  const st = {
    form, trigger: triggerId, triggerLabel: trig.label,
    keptClassAbilities, classAbilitiesSave: { roll: spellsRoll, target: spellsTarget, saved: keptClassAbilities },
    retainedSelf: true, rejectedGift, afterTheFlesh,
    reversible: opts.reversible !== false,
    transformedAtTurn: turn, driftSaveIntervalMonths: interval,
    driftSave: null, alignmentDriftSaves: [], history: []
  };
  c.transformationState = st;
  c.lifecycleState = 'transformed';                                          // the five-axis flip
  _txHistory(st, turn, 'transformed', c.name + ' is transformed into a ' + form + ' (' + trig.label + ').');

  // (3) The INITIAL alignment-drift Death save on transformation (skipped for the auto-retain exceptions).
  let initialDrift = null;
  if(autoRetain){
    st.retainedSelf = true; st.driftSave = null;                            // keeps their own mind, no schedule
  } else {
    initialDrift = _applyDriftSave(campaign, c, rng, { initial: true, driftSaveMod: opts.driftSaveMod, forcedRoll: opts.forcedDriftRoll });
  }

  const abilityBit = keptClassAbilities ? 'keeps their class abilities' : 'loses their class abilities';
  const selfBit = autoRetain ? (rejectedGift ? 'rejects the gift — keeps their own mind' : 'keeps their own mind (After the Flesh)')
                : (st.retainedSelf ? 'keeps their own mind (for now)' : 'their mind drifts to the beast at once');
  const summary = c.name + ' is transformed into a ' + form + ' (' + trig.label + ') — ' + abilityBit + '; ' + selfBit + '.';
  try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'character-transformed', summary, { form, trigger: triggerId }); } catch(_e){}
  const ev = _emitTransformationEvent(campaign, c, 'character-transformed', {
    characterId: c.id, form, trigger: triggerId, triggerLabel: trig.label,
    keptClassAbilities, spellsSave: spellsRoll, spellsTarget,
    retainedSelf: st.retainedSelf, rejectedGift, afterTheFlesh, reversible: st.reversible,
    initialDriftSave: initialDrift ? initialDrift.roll : null, initialDriftSaved: initialDrift ? initialDrift.saved : null,
    narrative: summary
  }, summary);
  if(ev) st.eventId = ev.id;
  return st;
}

// =============================================================================
// revertCharacter — reverse the transformation (JJ pp.94–95: cured lycanthropy / dispelled polymorph).
// Restores lifecycleState→'active', emits the record-only `transformation-reverted`, then CLEARS
// transformationState to null (the eventLog is the history). A bad char / a non-transformed char / a
// deceased char → null (you can't revert the dead). The class-ability restoration + the monster stat-block
// removal are the resolver's effects (this clears the ledger). Returns { characterId, form, trigger }.
//   opts: { reason ('cured'|'dispelled'|'reverted'|…), atTurn }.
// =============================================================================
function revertCharacter(campaign, characterId, opts){
  opts = opts || {};
  const c = (characterId && typeof characterId === 'object') ? characterId : _findCharacterLC(campaign, characterId);
  if(!c || !isTransformed(c)) return null;
  if(c.lifecycleState === 'deceased' || c.alive === false) return null;     // can't revert the dead
  const st = c.transformationState;
  const form = st.form, trigger = st.trigger, triggerLabel = st.triggerLabel;
  const reason = opts.reason || 'reverted';
  const summary = c.name + ' reverts from ' + form + ' to their original form' + (reason && reason !== 'reverted' ? (' (' + reason + ')') : '') + '.';
  try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'transformation-reverted', summary, { form, trigger, reason }); } catch(_e){}
  _emitTransformationEvent(campaign, c, 'transformation-reverted', {
    characterId: c.id, form, trigger, triggerLabel, reason,
    keptSelf: st.retainedSelf === true, driftSaveCount: (st.alignmentDriftSaves || []).length, narrative: summary
  }, summary);
  if(c.lifecycleState === 'transformed') c.lifecycleState = 'active';
  c.transformationState = null;
  return { characterId: c.id, form, trigger };
}

// =============================================================================
// transformationDriftSave — roll ONE alignment-drift save NOW (the direct verb). A GM "roll a drift save"
// action, or the Magic/Phase-5 cause-side firing it at an HD step (the precise RAW trigger). Skips a
// non-transformed / already-drifted / auto-retain character. Returns the save result (or null).
// =============================================================================
function transformationDriftSave(campaign, characterId, opts){
  opts = opts || {};
  const c = (characterId && typeof characterId === 'object') ? characterId : _findCharacterLC(campaign, characterId);
  if(!c || !isTransformed(c)) return null;
  const st = c.transformationState;
  if(st.retainedSelf === false) return null;                                // already drifted — no self left to lose
  if(st.rejectedGift || st.afterTheFlesh) return null;                      // the auto-retain exceptions never drift
  const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
  const res = _applyDriftSave(campaign, c, rng, { driftSaveMod: opts.driftSaveMod, forcedRoll: opts.forcedRoll });
  const summary = res.drifted ? (c.name + ' drifts away — now thinks as a ' + st.form + '.')
                              : (c.name + ' holds on to their own mind (drift save ' + res.roll + ' vs ' + res.target + '+).');
  try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'character-transformed', summary, { form: st.form, drift: true }); } catch(_e){}
  return res;
}

// =============================================================================
// processTransformationsForTurn — the MONTHLY drift-save pass. Folded into processAgingForTurn (the one
// monthly lifecycle hook commitTurn / proposeMonthlyTurn call — this lane cannot edit acks-engine.js), so
// it rides the monthly turn. Loops the TRANSFORMED characters (a different subject set than aging), ticking
// each armed driftSave's 1d12-style countdown; when due, rolls the alignment-drift Death save (success →
// keep self + re-arm; failure → drift). dryRun reports the deterministic facts (a save DUE / counting down)
// + rolls NO dice + mutates nothing — the dice live only at commit (the aging dry-run discipline). Drift
// saves emit no event (only the two bracketing kinds are allocated) — recorded on the ledger + history + the
// monthly log, surfaced under processAgingForTurn's out.transformations.
// =============================================================================
function _isTransformationSubject(c){
  if(!c || !isTransformed(c)) return false;
  if(c.lifecycleState === 'deceased' || c.alive === false) return false;
  const st = c.transformationState;
  if(st.retainedSelf === false) return false;                              // already fully drifted
  if(!st.driftSave || st.driftSave.dueInMonths == null) return false;      // no armed schedule (auto-retain / not-yet-armed)
  return true;
}
function processTransformationsForTurn(campaign, opts){
  opts = opts || {};
  const dryRun = !!opts.dryRun;
  const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
  const out = { ran:true, dryRun, driftSaves:[], drifts:[], logEntries:[] };
  const chars = (campaign && campaign.characters) || [];
  for(const c of chars){
    if(!_isTransformationSubject(c)) continue;
    const st = c.transformationState;
    const dueAfter = Number(st.driftSave.dueInMonths) - 1;
    if(dueAfter > 0){
      // Counting down — not due this month.
      if(!dryRun) st.driftSave = { dueInMonths: dueAfter };
      out.driftSaves.push({ characterId:c.id, name:c.name, form:st.form, dueInMonths:dueAfter });
    } else {
      // Due this month → the alignment-drift Death save fires (commit rolls; dry-run only flags it).
      if(dryRun){
        out.driftSaves.push({ characterId:c.id, name:c.name, form:st.form, dueThisMonth:true, target:_driftSaveTarget(c, opts) });
      } else {
        const res = _applyDriftSave(campaign, c, rng, { driftSaveMod: opts.driftSaveMod });
        out.driftSaves.push({ characterId:c.id, name:c.name, form:st.form, roll:res.roll, target:res.target, saved:res.saved, drifted:res.drifted });
        const summary = res.drifted
          ? (c.name + ' drifts away — now thinks and feels as a ' + st.form + ' (drift save ' + res.roll + ' vs ' + res.target + '+ — failed; JJ pp.94–95).')
          : (c.name + ' resists the pull of the ' + st.form + ' (drift save ' + res.roll + ' vs ' + res.target + '+ — keeps their own mind).');
        out.logEntries.push('Transformation — ' + summary);
        if(res.drifted) out.drifts.push({ characterId:c.id, name:c.name, form:st.form });
        try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, c, 'character-transformed', summary, { form:st.form, drift:true, drifted:res.drifted }); } catch(_e){}
        // No event kind for a drift save (only the two bracketing kinds are allocated) — the aging-arm idiom.
      }
    }
  }
  return out;
}

// characterTransformationInfo — the char-sheet read accessor (the Lifecycle/Health-cluster card): the
// transformed state + form + trigger + whether class abilities were kept + the drift status (retained /
// drifted / next save) + the drift-save ledger count.
function characterTransformationInfo(c){
  if(!c || !isTransformed(c)) return { transformed:false };
  const st = c.transformationState;
  const saves = Array.isArray(st.alignmentDriftSaves) ? st.alignmentDriftSaves : [];
  const last = saves.length ? saves[saves.length - 1] : null;
  return {
    transformed:true, form:st.form, trigger:st.trigger, triggerLabel:st.triggerLabel,
    keptClassAbilities: st.keptClassAbilities === true,
    retainedSelf: st.retainedSelf !== false,
    drifted: st.retainedSelf === false,
    rejectedGift: st.rejectedGift === true, afterTheFlesh: st.afterTheFlesh === true,
    reversible: st.reversible !== false,
    transformedAtTurn: st.transformedAtTurn != null ? st.transformedAtTurn : null,
    driftSaveIntervalMonths: Number(st.driftSaveIntervalMonths) || DRIFT_SAVE_DEFAULT_INTERVAL_MONTHS,
    driftSaveDueInMonths: (st.driftSave && st.driftSave.dueInMonths != null) ? st.driftSave.dueInMonths : null,
    driftSaveCount: saves.length,
    lastDriftSave: last ? { roll:last.roll, target:last.target, saved:last.saved } : null
  };
}

// =============================================================================
// Event emit — the record-only audit pattern (the aging/disease/condition/death idiom). Both CL-5 kinds
// (`character-transformed` / `transformation-reverted`) ride it. cadence 'monthly-turn' (transformation +
// its drift rides the monthly cadence); the character rides the context envelope as subject.
// =============================================================================
function _emitTransformationEvent(campaign, c, kind, payload, narrative){
  const A = global.ACKS;
  if(!A || typeof A.newEvent !== 'function') return null;
  const cal = (campaign && campaign.calendar) || {};
  let ev;
  try {
    ev = A.newEvent(kind, {
      submittedBy:'engine', cadence:'monthly-turn', targetTurn:(campaign && campaign.currentTurn) || 1,
      gameTimeAt:{ year:cal.year || 1, month:cal.month || 1, day:(campaign && campaign.currentDayInMonth) || 1 },
      payload: Object.assign({ narrative }, payload || {})
    });
  } catch(_e){ return null; }
  if(typeof A.setEventContext === 'function'){
    A.setEventContext(ev, {
      primaryHexId:(c && c.currentHexId) || null,
      domainId:(c && c.currentDomainId) || null,
      relatedEntities:[{ kind:'character', id:c && c.id, role:'subject' }]
    });
  }
  ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
  ev.appliedAtTurn = (campaign && campaign.currentTurn) || 1;
  ev.appliedAtDay  = (campaign && campaign.currentDayInMonth) || 1;
  if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
  campaign.eventLog.push({ event: ev, result:{ narrativeSummary:narrative },
    appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
  return ev;
}

Object.assign(ACKS, {
  // data
  TRANSFORMATION_TRIGGERS, TRANSFORMATION_CITE, DRIFT_SAVE_DEFAULT_INTERVAL_MONTHS,
  // catalog lookup
  transformationTriggerById,
  // verbs
  transformCharacter, revertCharacter, transformationDriftSave,
  // the monthly drift-save pass (folded into processAgingForTurn — rides the monthly turn)
  processTransformationsForTurn,
  // reads
  isTransformed, characterTransformationInfo
});
// === end Character Lifecycle CL-5 (team) =====================================

if(typeof module !== 'undefined' && module.exports) module.exports = ACKS;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
