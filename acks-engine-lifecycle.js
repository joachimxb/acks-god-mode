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

  // CL-4b (burst12, team) — the dynasty succession-law-change clock rides this same monthly hook (the
  // CL-5 fold pattern — this lane cannot add a named hook to acks-engine.js). processDynastyForTurn is
  // gated INSIDE on the dynasty-tracking house rule (it no-ops when off / when no law change is due), so
  // folding it here is inert for every campaign that isn't using the optional layer. Surfaced under
  // out.dynasty + its log lines merge in.
  try {
    const dyn = processDynastyForTurn(campaign, { dryRun, rng });
    out.dynasty = dyn;
    (dyn.logEntries || []).forEach(l => out.logEntries.push(l));
  } catch(_e){ /* never let a dynasty law-change fail the aging pass */ }

  // CL-4b DEEPENING (b13, team) — the monthly family pass (per-year fertility → conception/gestation/birth
  // + the heir-education XP accrual) rides this same monthly hook (the CL-5/CL-4b fold — no new day-tick
  // slot). processFamilyForTurn is gated INSIDE on the dynasty-tracking house rule (it no-ops when off),
  // so this is inert for every campaign not using the optional layer. Surfaced under out.family.
  try {
    const fam = processFamilyForTurn(campaign, { dryRun, rng });
    out.family = fam;
    (fam.logEntries || []).forEach(l => out.logEntries.push(l));
  } catch(_e){ /* never let a fertility/education pass fail the aging pass */ }

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

// =============================================================================
// === Character Lifecycle CL-4b (burst12, team) — the optional DYNASTY layer (AXIOMS 19) ======
// "Cohorts and Dynasties" (Revised v2), the dynasty half — RUN THE BLOODLINE FORWARD. Where CL-4a
// (RR pp.311–313) is the RAW-core death economy on one character, CL-4b is the AXIOMS-19 supplement
// that makes the DYNASTY the unit of play: a first-class Dynasty entity + kinship relations + the
// succession laws + bloodline traits, over the shipped lifecycle spine (CL-1 aging / CL-4a death).
//
// THE SCOPE (the manifest + Plan §11 CL-4b "first slice"): the Dynasty entity (dyn-) + kinship
//   relations (kin-) + the 10 succession laws (incl. the elective vassal-loyalty bonuses + the
//   realm-type starting-law table + the 2d4-month law change) + bloodline traits (the 3-generation
//   rule → 4d6-keep-best-3 children) + a light breeding slice (the racial pregnancy caps + birthChild
//   + the bastard rule). DEFERRED (noted, not built): education/leveling-over-years, campaign-task
//   delegation, twins/triplets, the per-active-year fertility roll (birthChild is a manual GM verb).
//   The AXIOMS-19 "Cohorts" half is NOT lifecycle (a Manual-of-Arms unit → Phase 3 Military).
//
// STANDALONE (the manifest): the succession-law half overlaps Politics (electors, vassal loyalty),
//   but this builds the dynasty/kinship/succession core WITHOUT depending on the Politics lane. The
//   senatorial-succession seam (a senate approving a law change in a senatorial realm) is a DEFERRED
//   forward pointer, surfaced as a note, never a build dependency. resolveDynastySuccession PICKS +
//   RETURNS the heir per the law; the GM (or CL-4a's resolveSuccession, the same module) consumes it —
//   the two verbs stay composable (principle #1), no auto-coupling.
//
// SHAPE (the §2 persistent-state model + the team-session self-registration discipline): a NEW
//   first-class entity (campaign.dynasties[], dyn-) + a relation collection (campaign.kinships[], kin-,
//   accessor-only — NOT a registry-browsed kind, the knowledge/itemCustody idiom), both self-registered
//   FROM THIS MODULE via the PR #89 kernel (registerPrefix / registerCollection / registerEntityKind /
//   registerFieldSchema / registerHouseRule / registerEventKind) — NO central-file edit. blankDynasty
//   lives HERE (not entities.js) so the schema⊆factory invariant resolves against it. The character
//   fields (dynastyId / noble / title / bastard / pregnancies / birthTurn) are ALL defensive-read /
//   init-on-write — NO blankCharacter seed (the CL-4a heirCharacterId precedent) → the 6 templates +
//   demo stay migrate-no-ops, no migration. The dynasties/kinships collections default defensive-read
//   (seedInBlank, NOT lazy-injected) → migrateCampaign never adds them, the no-op invariant holds.
//   The law-change clock rides processAgingForTurn (the one monthly lifecycle hook this lane has — the
//   CL-5 drift-clock fold), gated INSIDE on the house rule.
//
// Polarity (CLAUDE §6): the dynasty layer is a SUPPLEMENT (AXIOMS 19) → a default-OFF house rule
//   (`dynasty-tracking`), the elite-troops/AXIOMS-4 + notable-items/AXIOMS-14 precedent. The data is
//   non-functional AND hidden when off (principle 8): the law-change clock no-ops, and the UI gates.
//
// ⚠ IP (§13.6): AXIOMS is a separate Autarch product — the mechanical facts only (the law set + the
//   vassal-loyalty bonuses + the d6 starting-law table + the fertility caps + the 3-generation rule),
//   cited AXIOMS 19; never the prose. Same boundary as every other supplement.
// =============================================================================
const CL4B_CITE = 'AXIOMS 19';
const ABILITY_IDS = Object.freeze(['STR', 'INT', 'WIL', 'DEX', 'CON', 'CHA']);   // ACKS abilities (WIL, not WIS)
const LAW_CHANGE_DICE = '2d4';            // AXIOMS 19 — a succession-law change takes 2d4 months
const BLOODLINE_GENERATIONS = 3;          // AXIOMS 19 — shared high stat over ≥3 generations earns it
const BLOODLINE_HIGH_THRESHOLD = 13;      // "a high stat" — ACKS exceptional is 13+ (the GM may tune)

// ── Succession laws (AXIOMS 19) ──────────────────────────────────────────────────────────────────
// elective (the heir is elected from any dynasty member) vs inheritance (by birthright). Three carry a
// vassal-loyalty bonus (feudal elective +2 — "making the realm more stable"; gavelkind elective +1;
// tanistry +1). `heirRule` drives resolveDynastySuccession; `divides` marks the gavelkind laws (the
// primary heir takes the main title, siblings inherit claims + land — "the perfect conditions for
// succession crises"). Mechanical facts only (the RAW posture); `rule` is an own-words gloss.
const SUCCESSION_LAWS = Object.freeze([
  { id:'feudal-elective',     label:'Feudal Elective',     type:'elective',    vassalLoyaltyBonus:2, heirRule:'elected',        divides:false, cite:CL4B_CITE,
    rule:'All titles pass to one elected heir (any claimant or dynasty member). Each elector vassal gets one vote; the ruler votes and breaks ties. The most stable system.' },
  { id:'gavelkind-elective',  label:'Gavelkind Elective',  type:'elective',    vassalLoyaltyBonus:1, heirRule:'elected',        divides:true,  cite:CL4B_CITE,
    rule:'The primary title passes to an elected heir; other eligible children divide the demesne. Electors vote, the ruler breaks ties.' },
  { id:'tanistry',            label:'Tanistry',            type:'elective',    vassalLoyaltyBonus:1, heirRule:'elected',        divides:false, cite:CL4B_CITE,
    rule:'One elected dynasty member inherits all titles; usually more electors than feudal elective. Common among nomads and barbarian tribes.' },
  { id:'patrician-elective',  label:'Patrician Elective',  type:'elective',    vassalLoyaltyBonus:0, heirRule:'elected',        divides:false, cite:CL4B_CITE,
    rule:'A council (one member per family) elects one of its own as their leader (doge).' },
  { id:'gavelkind',           label:'Gavelkind',           type:'inheritance', vassalLoyaltyBonus:0, heirRule:'eldest-child',   divides:true,  cite:CL4B_CITE,
    rule:'Titles are divided amongst the heirs — the perfect conditions for succession crises (siblings inherit claims and land).' },
  { id:'primogeniture',       label:'Primogeniture',       type:'inheritance', vassalLoyaltyBonus:0, heirRule:'eldest-child',   divides:false, cite:CL4B_CITE,
    rule:'The eldest child of the dynasty inherits all titles (by gender law; default: eldest child).' },
  { id:'ultimogeniture',      label:'Ultimogeniture',      type:'inheritance', vassalLoyaltyBonus:0, heirRule:'youngest-child', divides:false, cite:CL4B_CITE,
    rule:'The youngest child of the dynasty inherits all titles (by gender law; default: youngest child).' },
  { id:'seniority',           label:'Seniority',           type:'inheritance', vassalLoyaltyBonus:0, heirRule:'eldest-member',  divides:false, cite:CL4B_CITE,
    rule:'The eldest member of the dynasty inherits all titles (by gender law).' },
  { id:'patrician-seniority', label:'Patrician Seniority', type:'inheritance', vassalLoyaltyBonus:0, heirRule:'eldest-member',  divides:false, cite:CL4B_CITE,
    rule:'The oldest member of the families/council is the leader (doge).' },
  { id:'open',                label:'Open',                type:'inheritance', vassalLoyaltyBonus:0, heirRule:'most-powerful',   divides:false, cite:CL4B_CITE,
    rule:'The most powerful descendant inherits all — often combined with polygamy and an unusual number of claimants.' }
]);
const SUCCESSION_LAW_BY_ID = Object.freeze(SUCCESSION_LAWS.reduce((m, l) => { m[l.id] = l; return m; }, {}));
function successionLawById(id){ return SUCCESSION_LAW_BY_ID[id] || null; }
function successionLawsList(){ return SUCCESSION_LAWS.slice(); }
const SUCCESSION_LAW_IDS = Object.freeze(SUCCESSION_LAWS.map(l => l.id));

// The realm-type → starting succession-law d6 table (AXIOMS 19). Each realm type's rows cover 1–6.
const DYNASTY_STARTING_LAW_BY_REALM = Object.freeze({
  'beastman-tribal':         [ { max:4, law:'tanistry' },        { max:6, law:'open' } ],
  'human-standard':          [ { max:1, law:'tanistry' },        { max:4, law:'feudal-elective' }, { max:5, law:'gavelkind-elective' }, { max:6, law:'gavelkind' } ],
  'dwarven-vault':           [ { max:3, law:'seniority' },        { max:6, law:'patrician-seniority' } ],
  'elven-fastness':          [ { max:6, law:'seniority' } ],
  'senatorial':              [ { max:3, law:'patrician-elective' },{ max:6, law:'patrician-seniority' } ],
  'syndicate':               [ { max:4, law:'open' },             { max:6, law:'feudal-elective' } ],
  'religious-organization':  [ { max:2, law:'feudal-elective' },  { max:3, law:'open' }, { max:6, law:'patrician-elective' } ]
});
const _REALM_TYPE_ALIASES = Object.freeze({
  'human-standard':'human-standard', human:'human-standard', humans:'human-standard', standard:'human-standard', feudal:'human-standard',
  'beastman-tribal':'beastman-tribal', beastman:'beastman-tribal', beastmen:'beastman-tribal', tribal:'beastman-tribal', tribe:'beastman-tribal', nomad:'beastman-tribal', nomadic:'beastman-tribal', barbarian:'beastman-tribal',
  'dwarven-vault':'dwarven-vault', dwarf:'dwarven-vault', dwarven:'dwarven-vault', dwarves:'dwarven-vault', vault:'dwarven-vault',
  'elven-fastness':'elven-fastness', elf:'elven-fastness', elven:'elven-fastness', elves:'elven-fastness', fastness:'elven-fastness',
  senatorial:'senatorial', senate:'senatorial', republic:'senatorial',
  syndicate:'syndicate', criminal:'syndicate', guild:'syndicate',
  'religious-organization':'religious-organization', religious:'religious-organization', theocracy:'religious-organization', church:'religious-organization', temple:'religious-organization', clerical:'religious-organization'
});
function _normalizeRealmType(rt){ return _REALM_TYPE_ALIASES[String(rt || '').toLowerCase().trim()] || 'human-standard'; }
function startingLawTableForRealm(realmType){ return DYNASTY_STARTING_LAW_BY_REALM[_normalizeRealmType(realmType)] || DYNASTY_STARTING_LAW_BY_REALM['human-standard']; }
function rollStartingSuccessionLaw(realmType, rng){
  const table = startingLawTableForRealm(realmType);
  const roll = _d(6, rng);
  for(const row of table){ if(roll <= row.max) return row.law; }
  return table[table.length - 1].law;
}

// Lifetime pregnancy caps (AXIOMS 19): humans & beastmen 12; dwarves/gnomes/halflings 4; elves 2.
const PREGNANCY_CAPS_BY_RACE = Object.freeze({ human:12, beastman:12, zaharan:12, nobiran:12, dwarf:4, gnome:4, halfling:4, elf:2 });
const _PREG_RACE_ALIASES = Object.freeze({
  human:'human', man:'human', men:'human', zaharan:'zaharan', nobiran:'nobiran',
  beastman:'beastman', beastmen:'beastman', dwarf:'dwarf', dwarven:'dwarf', dwarves:'dwarf',
  gnome:'gnome', gnomes:'gnome', halfling:'halfling', halflings:'halfling', elf:'elf', elven:'elf', elves:'elf'
});
function pregnancyCapForRace(race){
  const key = _PREG_RACE_ALIASES[String(race || 'human').toLowerCase().trim()] || 'human';
  return PREGNANCY_CAPS_BY_RACE[key] != null ? PREGNANCY_CAPS_BY_RACE[key] : 12;
}

// Family-tree markers (AXIOMS 19 — for the UI): a PC '#', an heir '♥', a bastard '○'.
const FAMILY_TREE_MARKERS = Object.freeze({ pc:'#', heir:'♥', bastard:'○' });

// ── factory ───────────────────────────────────────────────────────────────────────────────────────
function blankDynasty(opts){
  opts = opts || {};
  return {
    id: opts.id || (global.ACKS && global.ACKS.newId ? global.ACKS.newId('dyn') : 'dyn-' + Math.random().toString(36).slice(2, 9)),
    kind: 'dynasty',
    schemaVersion: 2,
    name: opts.name || '',                                  // the surname / house name
    coatOfArms: opts.coatOfArms || '',                       // a free-text blazon
    founderCharacterId: opts.founderCharacterId || null,
    successionLaw: opts.successionLaw || 'gavelkind',         // RAW default: "your dynasty begins with gavelkind"
    pendingSuccessionLaw: opts.pendingSuccessionLaw || null,  // an in-progress law change (flips at lawChangeCompletesTurn)
    lawChangeCompletesTurn: (opts.lawChangeCompletesTurn != null) ? opts.lawChangeCompletesTurn : null,
    bloodlineTraits: Array.isArray(opts.bloodlineTraits) ? opts.bloodlineTraits.slice() : [],   // ≤1 ability id (AXIOMS: one stat per dynasty)
    memberCharacterIds: Array.isArray(opts.memberCharacterIds) ? opts.memberCharacterIds.slice() : [],
    heirLine: Array.isArray(opts.heirLine) ? opts.heirLine.slice() : [],   // ordered succession line (founder first) — drives the 3-gen bloodline check
    realmType: opts.realmType || 'human-standard',
    status: opts.status || 'extant',                         // 'extant' | 'extinct' (no heirs ⇒ the game ends)
    foundedAtTurn: (opts.foundedAtTurn != null) ? opts.foundedAtTurn : null,
    history: Array.isArray(opts.history) ? opts.history.slice() : []
  };
}

// ── small internals ─────────────────────────────────────────────────────────────────────────────
function _dynHistory(dyn, turn, type, note){ if(!Array.isArray(dyn.history)) dyn.history = []; dyn.history.push({ atTurn: turn, type, note }); }
function dynastyById(campaign, id){ return ((campaign && campaign.dynasties) || []).find(d => d && d.id === id) || null; }
function dynastiesInCampaign(campaign){ return (campaign && Array.isArray(campaign.dynasties)) ? campaign.dynasties : []; }
function characterDynasty(campaign, charOrId){
  const c = (charOrId && typeof charOrId === 'object') ? charOrId : _findCharacterLC(campaign, charOrId);
  if(!c || !c.dynastyId) return null;
  return dynastyById(campaign, c.dynastyId);
}
// eldest-first comparator: higher age = older; absent age → earlier birthTurn = older; else stable.
function _eldestFirst(a, b){
  const aA = (typeof a.age === 'number') ? a.age : null, bA = (typeof b.age === 'number') ? b.age : null;
  if(aA != null && bA != null && aA !== bA) return bA - aA;
  const aB = (typeof a.birthTurn === 'number') ? a.birthTurn : null, bB = (typeof b.birthTurn === 'number') ? b.birthTurn : null;
  if(aB != null && bB != null && aB !== bB) return aB - bB;
  if(aA != null && bA == null) return -1;
  if(bA != null && aA == null) return 1;
  return 0;
}

// ── kinship reads ─────────────────────────────────────────────────────────────────────────────────
// A kinship record: { id (kin-), kind:'kinship', kinType:'parent-child'|'marriage', aCharacterId, bCharacterId,
//   matrilineal? (marriage), recordedAtTurn }. For parent-child a = parent, b = child.
function characterKinships(campaign, charId){
  return ((campaign && campaign.kinships) || []).filter(k => k && (k.aCharacterId === charId || k.bCharacterId === charId));
}
function _kinships(campaign){ return (campaign && Array.isArray(campaign.kinships)) ? campaign.kinships : []; }
function charactersChildren(campaign, parentId){
  const ids = _kinships(campaign).filter(k => k && k.kinType === 'parent-child' && k.aCharacterId === parentId).map(k => k.bCharacterId);
  return ids.map(id => _findCharacterLC(campaign, id)).filter(Boolean);
}
function characterParents(campaign, childId){
  const ids = _kinships(campaign).filter(k => k && k.kinType === 'parent-child' && k.bCharacterId === childId).map(k => k.aCharacterId);
  return ids.map(id => _findCharacterLC(campaign, id)).filter(Boolean);
}
function characterSpouses(campaign, charId){
  const out = [];
  _kinships(campaign).forEach(k => {
    if(!k || k.kinType !== 'marriage' || k.endedAtTurn != null) return;
    if(k.aCharacterId === charId) out.push(_findCharacterLC(campaign, k.bCharacterId));
    else if(k.bCharacterId === charId) out.push(_findCharacterLC(campaign, k.aCharacterId));
  });
  return out.filter(Boolean);
}
function _areSpouses(campaign, aId, bId){
  return _kinships(campaign).some(k => k && k.kinType === 'marriage' && k.endedAtTurn == null &&
    ((k.aCharacterId === aId && k.bCharacterId === bId) || (k.aCharacterId === bId && k.bCharacterId === aId)));
}
function _matrilinealMarriage(campaign, aId, bId){
  return _kinships(campaign).some(k => k && k.kinType === 'marriage' && k.matrilineal === true &&
    ((k.aCharacterId === aId && k.bCharacterId === bId) || (k.aCharacterId === bId && k.bCharacterId === aId)));
}

// dynastyMembers — the resolved member Characters (alive + dead), founder first when present.
function dynastyMembers(campaign, dynastyId){
  const dyn = dynastyById(campaign, dynastyId);
  if(!dyn) return [];
  return (dyn.memberCharacterIds || []).map(id => _findCharacterLC(campaign, id)).filter(Boolean);
}
function _livingMembers(campaign, dyn){
  return (dyn.memberCharacterIds || []).map(id => _findCharacterLC(campaign, id))
    .filter(c => c && c.lifecycleState !== 'deceased' && c.alive !== false);
}

// dynastyFamilyTree — a flat node list for the UI (each member + its marker + parent ids).
function dynastyFamilyTree(campaign, dynastyId){
  const dyn = dynastyById(campaign, dynastyId);
  if(!dyn) return [];
  const heirSet = new Set(dyn.heirLine || []);
  return (dyn.memberCharacterIds || []).map(id => {
    const c = _findCharacterLC(campaign, id);
    if(!c) return null;
    const marker = (c.controlledBy === 'player') ? FAMILY_TREE_MARKERS.pc
                 : c.bastard ? FAMILY_TREE_MARKERS.bastard
                 : heirSet.has(id) ? FAMILY_TREE_MARKERS.heir : '';
    return { id: c.id, name: c.name, marker, bastard: c.bastard === true, isHeir: heirSet.has(id),
      isFounder: dyn.founderCharacterId === id, deceased: (c.lifecycleState === 'deceased' || c.alive === false),
      title: c.title || null, level: Number(c.level) || 0, age: (typeof c.age === 'number') ? c.age : null, birthTurn: (typeof c.birthTurn === 'number') ? c.birthTurn : null,
      parentIds: characterParents(campaign, id).map(p => p.id) };
  }).filter(Boolean);
}

// ── foundDynasty ─────────────────────────────────────────────────────────────────────────────────
// A titled character founds a dynasty (coat of arms + surname). A lowborn character who receives a title
// is raised to nobility, becoming the founder of a new dynasty (AXIOMS 19) — so the act ennobles them.
// Refuses if the character already belongs to a dynasty. successionLaw: opts.successionLaw, else (if a
// realmType is given) the rolled d6 starting law, else the RAW default 'gavelkind'. Emits dynasty-founded.
function foundDynasty(campaign, founderCharOrId, opts){
  opts = opts || {};
  const founder = (founderCharOrId && typeof founderCharOrId === 'object') ? founderCharOrId : _findCharacterLC(campaign, founderCharOrId);
  if(!founder) return null;
  if(founder.dynastyId) return { error:'already-in-dynasty', dynastyId: founder.dynastyId };
  if(founder.lifecycleState === 'deceased' || founder.alive === false) return { error:'founder-deceased' };
  const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
  const turn = (campaign && campaign.currentTurn) || 1;
  const realmType = _normalizeRealmType(opts.realmType || 'human-standard');
  let law = opts.successionLaw && SUCCESSION_LAW_BY_ID[opts.successionLaw] ? opts.successionLaw
          : (opts.realmType ? rollStartingSuccessionLaw(realmType, rng) : 'gavelkind');
  const dyn = blankDynasty({
    name: opts.name || (founder.name ? (founder.name.split(/\s+/).slice(-1)[0]) : 'House'),
    coatOfArms: opts.coatOfArms || '', founderCharacterId: founder.id,
    successionLaw: law, realmType, foundedAtTurn: turn,
    memberCharacterIds: [founder.id], heirLine: [founder.id]
  });
  if(!Array.isArray(campaign.dynasties)) campaign.dynasties = [];   // init-on-write (defensive collection)
  campaign.dynasties.push(dyn);
  founder.dynastyId = dyn.id;
  founder.noble = true;                                     // founding raises the line to nobility
  if(opts.title) founder.title = opts.title;
  const lawLabel = (SUCCESSION_LAW_BY_ID[law] || {}).label || law;
  const summary = founder.name + ' founds the dynasty of ' + (dyn.name || '(unnamed house)') + ' (' + lawLabel + ' succession).';
  _dynHistory(dyn, turn, 'founded', summary);
  try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, founder, 'dynasty-founded', summary, { dynastyId: dyn.id }); } catch(_e){}
  _emitDynastyEvent(campaign, 'dynasty-founded', {
    dynastyId: dyn.id, founderCharacterId: founder.id, name: dyn.name, successionLaw: law, realmType, narrative: summary
  }, summary, { dynastyId: dyn.id, characters:[{ id: founder.id, role:'subject' }], primaryHexId: founder.currentHexId || null, domainId: founder.currentDomainId || null });
  return dyn;
}

// ── recordKinship ────────────────────────────────────────────────────────────────────────────────
// Record a parent-child or marriage relation (the kin- relation; AXIOMS 19's family tree). For a
// parent-child relation aCharacterId = parent, bCharacterId = child. A marriage may be matrilineal
// (children take the mother's dynasty). Idempotent for an identical parent-child link. Emits kinship-recorded.
function recordKinship(campaign, opts){
  opts = opts || {};
  const kinType = opts.kinType;
  if(kinType !== 'parent-child' && kinType !== 'marriage') return null;
  const a = _findCharacterLC(campaign, opts.aCharacterId), b = _findCharacterLC(campaign, opts.bCharacterId);
  if(!a || !b || a.id === b.id) return null;
  if(!Array.isArray(campaign.kinships)) campaign.kinships = [];   // init-on-write (defensive collection)
  if(kinType === 'parent-child'){
    const dup = campaign.kinships.find(k => k && k.kinType === 'parent-child' && k.aCharacterId === a.id && k.bCharacterId === b.id);
    if(dup) return dup;
  }
  const turn = (campaign && campaign.currentTurn) || 1;
  const rec = {
    id: (global.ACKS && global.ACKS.newId ? global.ACKS.newId('kin') : 'kin-' + Math.random().toString(36).slice(2, 9)),
    kind: 'kinship', schemaVersion: 2, kinType, aCharacterId: a.id, bCharacterId: b.id,
    matrilineal: kinType === 'marriage' ? (opts.matrilineal === true) : false,
    recordedAtTurn: turn, endedAtTurn: null
  };
  campaign.kinships.push(rec);
  // opts.quiet — birthChild creates the two parent-child links quietly (its own birth event is the
  // canonical record; the link events would just be noise). A direct GM recordKinship call emits.
  if(opts.quiet) return rec;
  const summary = kinType === 'marriage'
    ? (a.name + ' weds ' + b.name + (rec.matrilineal ? ' (matrilineal)' : '') + '.')
    : (b.name + ' is recorded as a child of ' + a.name + '.');
  _emitDynastyEvent(campaign, 'kinship-recorded', {
    kinType, aCharacterId: a.id, bCharacterId: b.id, matrilineal: rec.matrilineal, narrative: summary
  }, summary, { characters:[{ id:a.id, role:'subject' }, { id:b.id, role:'recipient' }], primaryHexId: a.currentHexId || null });
  return rec;
}

// ── bloodline-trait dice ───────────────────────────────────────────────────────────────────────────
// A child of a bloodline-trait dynasty rolls 4d6-keep-best-3 for that ability; if BOTH parents' dynasties
// carry the SAME trait → 5d6-keep-best-3; two DIFFERENT traits → the child benefits from both (AXIOMS 19).
function _dynastyTraits(campaign, charOrId){
  const dyn = characterDynasty(campaign, charOrId);
  return (dyn && Array.isArray(dyn.bloodlineTraits)) ? dyn.bloodlineTraits : [];
}
function dynastyChildAbilityDice(campaign, motherId, fatherId, abilityId){
  const mom = _dynastyTraits(campaign, motherId), dad = _dynastyTraits(campaign, fatherId);
  const inMom = mom.indexOf(abilityId) >= 0, inDad = dad.indexOf(abilityId) >= 0;
  if(inMom && inDad) return '5d6k3';     // both dynasties share the trait
  if(inMom || inDad) return '4d6k3';     // one parent's dynasty carries it (or the two differ — each applies)
  return '3d6';
}
function _rollAbilityDice(spec, rng){
  const m = String(spec).match(/^(\d+)d6(?:k(\d+))?$/i);
  const n = m ? parseInt(m[1], 10) : 3;
  const keep = (m && m[2]) ? parseInt(m[2], 10) : 3;
  const rolls = [];
  for(let i = 0; i < n; i++) rolls.push(_d(6, rng));
  rolls.sort((a, b) => b - a);                               // best first
  return rolls.slice(0, keep).reduce((s, v) => s + v, 0);
}

// dynastyEligibleBloodlineTrait — the 3-generation rule (AXIOMS 19). Over the last BLOODLINE_GENERATIONS
// consecutive members of the dynasty's heir-line, find an ability ALL of them score ≥ threshold for.
// Returns the ability id (or null). A dynasty already carries ≤1 trait (the AXIOMS cap), so a dynasty
// with a trait is not re-eligible.
function dynastyEligibleBloodlineTrait(campaign, dynastyId, opts){
  opts = opts || {};
  const dyn = dynastyById(campaign, dynastyId);
  if(!dyn) return null;
  if((dyn.bloodlineTraits || []).length >= 1) return null;   // one stat per dynasty (AXIOMS 19)
  const gens = opts.generations || BLOODLINE_GENERATIONS;
  const threshold = (opts.threshold != null) ? opts.threshold : BLOODLINE_HIGH_THRESHOLD;
  const line = (dyn.heirLine || []).map(id => _findCharacterLC(campaign, id)).filter(Boolean);
  if(line.length < gens) return null;
  const recent = line.slice(-gens);
  for(const ab of ABILITY_IDS){
    if(recent.every(c => Number(c.abilities && c.abilities[ab]) >= threshold)) return ab;
  }
  return null;
}

// ── birthChild ──────────────────────────────────────────────────────────────────────────────────
// A light breeding slice (AXIOMS 19). Determines the child's dynasty (the father's, the mother's if the
// marriage is matrilineal, or — for an unacknowledged bastard — the mother's), the bastard flag (a child
// whose parents are not spouses), rolls ability scores (3d6 in order, or 4d6/5d6-keep-best-3 for a
// bloodline-trait ability), checks the mother's lifetime pregnancy cap by race, mints a child Character,
// records the parent-child kinships, and adds the child to the dynasty. A manual GM verb; the automatic
// per-active-year fertility roll (b13 deepening) drives it via processFamilyForTurn + the birthChildren
// litter wrapper (opts.skipCapCheck / opts.skipPregnancyIncrement let a litter count as ONE pregnancy).
// Returns the child Character (or { error }).
//   opts: { motherCharacterId, fatherCharacterId, name, race, alignment, controlledBy, sex, rng, forcedAbilities }.
function birthChild(campaign, opts){
  opts = opts || {};
  const mother = _findCharacterLC(campaign, opts.motherCharacterId);
  const father = _findCharacterLC(campaign, opts.fatherCharacterId);
  if(!mother) return { error:'no-mother' };
  const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
  const turn = (campaign && campaign.currentTurn) || 1;

  // Lifetime pregnancy cap by race (AXIOMS 19). A litter sibling (skipCapCheck) bypasses it — a litter
  // is ONE pregnancy, the cap was already checked + incremented for the first child of the litter.
  const cap = pregnancyCapForRace(mother.race);
  const had = Number(mother.pregnancies) || 0;
  if(!opts.skipCapCheck && had >= cap) return { error:'pregnancy-cap-reached', cap, had };

  // Spouse / bastard / dynasty determination.
  const spouses = father ? _areSpouses(campaign, mother.id, father.id) : false;
  const bastard = !spouses;                                  // a child whose parents are not spouses is a bastard
  const matrilineal = father ? _matrilinealMarriage(campaign, mother.id, father.id) : false;
  let dynastyId = null;
  if(bastard || matrilineal) dynastyId = mother.dynastyId || null;     // unacknowledged bastards + matrilineal children take the mother's dynasty
  else dynastyId = (father && father.dynastyId) || mother.dynastyId || null;

  // Ability scores — per-ability dice (the bloodline-trait 4d6/5d6-keep-best-3).
  const abilities = {};
  ABILITY_IDS.forEach(ab => {
    if(opts.forcedAbilities && opts.forcedAbilities[ab] != null){ abilities[ab] = Number(opts.forcedAbilities[ab]); return; }
    const spec = dynastyChildAbilityDice(campaign, mother.id, (father && father.id) || null, ab);
    abilities[ab] = _rollAbilityDice(spec, rng);
  });

  const race = opts.race || (father && !bastard && !matrilineal ? father.race : mother.race) || mother.race || 'human';
  const childName = opts.name || ((mother.name ? mother.name.split(/\s+/)[0] : 'Child') + "'s child");
  let child;
  if(typeof ACKS.blankCharacter === 'function'){
    child = ACKS.blankCharacter({ name: childName, race, abilities,
      controlledBy: opts.controlledBy || 'gm', alignment: opts.alignment || (father && father.alignment) || mother.alignment || 'N' });
  } else {
    child = { id: 'chr-' + Math.random().toString(36).slice(2, 9), kind:'character', schemaVersion:2, name: childName, race, abilities, level:1, lifecycleState:'active', alive:true };
  }
  child.dynastyId = dynastyId;
  child.bastard = bastard;
  child.noble = !!((mother.noble) || (father && father.noble));   // a noble's children are never lowborn
  child.birthTurn = turn;
  child.pregnancies = 0;
  if(!Array.isArray(campaign.characters)) campaign.characters = [];
  campaign.characters.push(child);

  if(!opts.skipPregnancyIncrement) mother.pregnancies = had + 1;   // a litter sibling does not re-count (one pregnancy)

  // Kinship + dynasty membership. The two parent-child links are recorded quietly — the single
  // birth event below is the canonical record (avoids 3 kinship-recorded events per birth).
  recordKinship(campaign, { aCharacterId: mother.id, bCharacterId: child.id, kinType:'parent-child', quiet:true });
  if(father) recordKinship(campaign, { aCharacterId: father.id, bCharacterId: child.id, kinType:'parent-child', quiet:true });
  const dyn = dynastyId ? dynastyById(campaign, dynastyId) : null;
  if(dyn && (dyn.memberCharacterIds || []).indexOf(child.id) < 0){ dyn.memberCharacterIds.push(child.id); }

  const summary = childName + ' is born to ' + mother.name + (father ? (' and ' + father.name) : '') + (bastard ? ' (a bastard)' : '') + (dyn ? (' of ' + (dyn.name || 'the dynasty')) : '') + '.';
  try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, child, 'kinship-recorded', summary, { birth:true, bastard, dynastyId }); } catch(_e){}
  _emitDynastyEvent(campaign, 'kinship-recorded', {
    kinType:'parent-child', aCharacterId: mother.id, bCharacterId: child.id, childId: child.id,
    dynastyId, bastard, birth:true, narrative: summary
  }, summary, { dynastyId: dynastyId || null, characters:[{ id: mother.id, role:'subject' }, { id: child.id, role:'beneficiary' }], primaryHexId: mother.currentHexId || null });
  return child;
}

// ── setSuccessionLaw ──────────────────────────────────────────────────────────────────────────────
// Change a dynasty's succession law (AXIOMS 19: takes 2d4 months before it takes effect; until then the
// old law is in effect). opts.immediate applies it now (a GM expedite / a test). The pending change flips
// in processDynastyForTurn (the monthly fold). Returns { months, completesTurn } (pending) or { applied }.
// NOTE (deferred Politics seam): in a senatorial realm the senate must approve the change — surfaced as
// a note, not enforced (Politics owns the senate; CL-4b is standalone).
function setSuccessionLaw(campaign, dynastyId, lawId, opts){
  opts = opts || {};
  const dyn = dynastyById(campaign, dynastyId);
  if(!dyn) return { error:'no-dynasty' };
  if(!SUCCESSION_LAW_BY_ID[lawId]) return { error:'unknown-law' };
  const turn = (campaign && campaign.currentTurn) || 1;
  if(lawId === dyn.successionLaw && dyn.pendingSuccessionLaw == null) return { applied:true, law:lawId, unchanged:true };
  if(opts.immediate){
    const prev = dyn.successionLaw;
    dyn.successionLaw = lawId; dyn.pendingSuccessionLaw = null; dyn.lawChangeCompletesTurn = null;
    _dynHistory(dyn, turn, 'law-changed', 'Succession law changed from ' + prev + ' to ' + lawId + '.');
    return { applied:true, law:lawId, previousLaw:prev };
  }
  const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
  const months = _d(4, rng) + _d(4, rng);                   // 2d4 months
  dyn.pendingSuccessionLaw = lawId;
  dyn.lawChangeCompletesTurn = turn + months;
  _dynHistory(dyn, turn, 'law-change-begun', 'Begins changing succession law to ' + lawId + ' — takes ' + months + ' month' + (months === 1 ? '' : 's') + ' (AXIOMS 19).');
  return { months, completesTurn: dyn.lawChangeCompletesTurn, pending:lawId };
}

// ── processDynastyForTurn — the monthly law-change clock (folded into processAgingForTurn) ─────────
// Gated on the dynasty-tracking house rule (no-ops when off — principle 8). For each dynasty whose
// pending law change is due (currentTurn ≥ lawChangeCompletesTurn), flips successionLaw → pending. dryRun
// reports the deterministic facts + mutates nothing (the aging dry-run discipline; no dice here).
function processDynastyForTurn(campaign, opts){
  opts = opts || {};
  const dryRun = !!opts.dryRun;
  const out = { ran:true, dryRun, lawChanges:[], logEntries:[] };
  if(!ACKS.isHouseRuleEnabled || !ACKS.isHouseRuleEnabled(campaign, 'dynasty-tracking')) return out;
  const turn = (campaign && campaign.currentTurn) || 1;
  ((campaign && campaign.dynasties) || []).forEach(dyn => {
    if(!dyn || dyn.pendingSuccessionLaw == null || dyn.lawChangeCompletesTurn == null) return;
    if(turn < dyn.lawChangeCompletesTurn) return;            // not due yet
    const from = dyn.successionLaw, to = dyn.pendingSuccessionLaw;
    out.lawChanges.push({ dynastyId: dyn.id, name: dyn.name, fromLaw: from, toLaw: to });
    if(!dryRun){
      dyn.successionLaw = to; dyn.pendingSuccessionLaw = null; dyn.lawChangeCompletesTurn = null;
      const summary = (dyn.name || 'A dynasty') + ' adopts ' + ((SUCCESSION_LAW_BY_ID[to] || {}).label || to) + ' succession (was ' + from + ').';
      _dynHistory(dyn, turn, 'law-changed', summary);
      out.logEntries.push('Dynasty — ' + summary);
    }
  });
  return out;
}

// ── resolveDynastySuccession ──────────────────────────────────────────────────────────────────────
// Pick the heir per the dynasty's succession law (AXIOMS 19) when a member dies. STANDALONE: it selects +
// records + returns the heir (+ the vassal-loyalty bonus + the divides flag); it does NOT mutate the
// deceased / the successor's XP — that is CL-4a's resolveSuccession (the GM/UI feeds heirId to it). Appends
// the heir to the dynasty's heir-line and awards a bloodline trait if the 3-generation rule is newly met.
// No living heir ⇒ the dynasty goes extinct ("if you have no heirs, the game ends" — AXIOMS 19). Emits
// succession-resolved.
//   opts: { deceasedId, nominee (for elective laws), rng }.
function resolveDynastySuccession(campaign, dynastyId, opts){
  opts = opts || {};
  const dyn = dynastyById(campaign, dynastyId);
  if(!dyn) return { error:'no-dynasty' };
  const law = SUCCESSION_LAW_BY_ID[dyn.successionLaw] || SUCCESSION_LAW_BY_ID['gavelkind'];
  const turn = (campaign && campaign.currentTurn) || 1;
  const deceased = opts.deceasedId ? _findCharacterLC(campaign, opts.deceasedId) : null;

  const living = _livingMembers(campaign, dyn).filter(c => !deceased || c.id !== deceased.id);
  let heir = null;
  if(living.length){
    const children = deceased ? charactersChildren(campaign, deceased.id).filter(c => living.indexOf(c) >= 0) : [];
    switch(law.heirRule){
      case 'elected': {
        if(opts.nominee){ const n = _findCharacterLC(campaign, opts.nominee); if(n && living.indexOf(n) >= 0) heir = n; }
        if(!heir) heir = (children.slice().sort(_eldestFirst)[0]) || (living.slice().sort(_eldestFirst)[0]);
        break;
      }
      case 'eldest-child':   heir = (children.slice().sort(_eldestFirst)[0]) || (living.slice().sort(_eldestFirst)[0]); break;
      case 'youngest-child': heir = (children.slice().sort(_eldestFirst).slice(-1)[0]) || (living.slice().sort(_eldestFirst).slice(-1)[0]); break;
      case 'eldest-member':  heir = living.slice().sort(_eldestFirst)[0]; break;
      case 'most-powerful':  heir = living.slice().sort((a, b) => (Number(b.level) || 0) - (Number(a.level) || 0) || (Number(b.xp) || 0) - (Number(a.xp) || 0))[0]; break;
      default:               heir = living.slice().sort(_eldestFirst)[0];
    }
  }

  if(!heir){
    dyn.status = 'extinct';
    const summary = (dyn.name || 'The dynasty') + ' ends — no living heir remains (AXIOMS 19).';
    _dynHistory(dyn, turn, 'extinct', summary);
    _emitDynastyEvent(campaign, 'succession-resolved', {
      dynastyId: dyn.id, deceasedId: deceased ? deceased.id : null, heirId: null, law: dyn.successionLaw,
      vassalLoyaltyBonus: 0, divides: !!law.divides, dynastyExtinct: true, narrative: summary
    }, summary, { dynastyId: dyn.id, characters: deceased ? [{ id: deceased.id, role:'subject' }] : [] });
    return { heirId: null, dynastyExtinct: true, law: dyn.successionLaw, vassalLoyaltyBonus: 0, divides: !!law.divides, candidates: [] };
  }

  if((dyn.heirLine || []).indexOf(heir.id) < 0) dyn.heirLine.push(heir.id);

  // Bloodline trait — the 3-generation rule (AXIOMS 19), checked after the line extends.
  let awardedTrait = null;
  const elig = dynastyEligibleBloodlineTrait(campaign, dyn.id);
  if(elig){ dyn.bloodlineTraits.push(elig); awardedTrait = elig;
    _dynHistory(dyn, turn, 'bloodline-trait', (dyn.name || 'The dynasty') + ' earns a ' + elig + ' bloodline trait (3 generations — AXIOMS 19).'); }

  const lawLabel = law.label || dyn.successionLaw;
  let summary = (heir.name) + ' succeeds' + (deceased ? (' ' + deceased.name) : '') + ' under ' + lawLabel + ' succession';
  if(law.divides) summary += ' (the demesne divides among the heirs)';
  if(law.vassalLoyaltyBonus) summary += ' — vassals +' + law.vassalLoyaltyBonus + ' loyalty';
  if(awardedTrait) summary += '; the line earns a ' + awardedTrait + ' bloodline trait';
  summary += '.';
  _dynHistory(dyn, turn, 'succession', summary);
  try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, heir, 'succession-resolved', summary, { dynastyId: dyn.id }); } catch(_e){}
  _emitDynastyEvent(campaign, 'succession-resolved', {
    dynastyId: dyn.id, deceasedId: deceased ? deceased.id : null, heirId: heir.id, law: dyn.successionLaw,
    vassalLoyaltyBonus: law.vassalLoyaltyBonus, divides: !!law.divides, dynastyExtinct: false, narrative: summary
  }, summary, { dynastyId: dyn.id, characters: (deceased ? [{ id: deceased.id, role:'subject' }] : []).concat([{ id: heir.id, role:'beneficiary' }]),
    primaryHexId: heir.currentHexId || null, domainId: heir.currentDomainId || null });

  return { heirId: heir.id, heir, law: dyn.successionLaw, vassalLoyaltyBonus: law.vassalLoyaltyBonus, divides: !!law.divides,
    dynastyExtinct: false, awardedTrait, candidates: living.map(c => ({ id: c.id, name: c.name, level: Number(c.level) || 0 })) };
}

// dynastyVassalLoyaltyBonus — the loyalty modifier a dynasty's current succession law confers on its
// vassals (feudal elective +2, gavelkind elective +1, tanistry +1; else 0) — for Politics/loyalty reads.
function dynastyVassalLoyaltyBonus(campaign, dynastyId){
  const dyn = dynastyById(campaign, dynastyId);
  if(!dyn) return 0;
  const law = SUCCESSION_LAW_BY_ID[dyn.successionLaw];
  return law ? (law.vassalLoyaltyBonus || 0) : 0;
}

// characterDynastyInfo — the char-sheet read accessor (the Lifecycle-cluster Dynasty card): the dynasty
// name + law + the character's noble/title/bastard/pregnancy status + the trait list + member/heir counts.
function characterDynastyInfo(campaign, char){
  if(!char) return { inDynasty:false };
  const dyn = char.dynastyId ? dynastyById(campaign, char.dynastyId) : null;
  const cap = pregnancyCapForRace(char.race);
  const out = {
    inDynasty: !!dyn, dynastyId: char.dynastyId || null,
    noble: char.noble === true, title: char.title || null, bastard: char.bastard === true,
    pregnancies: Number(char.pregnancies) || 0, pregnancyCap: cap, canBear: (Number(char.pregnancies) || 0) < cap,
    childrenCount: charactersChildren(campaign, char.id).length,
    spouseCount: characterSpouses(campaign, char.id).length
  };
  if(dyn){
    const law = SUCCESSION_LAW_BY_ID[dyn.successionLaw];
    out.dynastyName = dyn.name; out.coatOfArms = dyn.coatOfArms || null;
    out.successionLaw = dyn.successionLaw; out.successionLawLabel = law ? law.label : dyn.successionLaw;
    out.pendingSuccessionLaw = dyn.pendingSuccessionLaw || null;
    out.lawChangeCompletesTurn = (dyn.lawChangeCompletesTurn != null) ? dyn.lawChangeCompletesTurn : null;
    out.vassalLoyaltyBonus = law ? (law.vassalLoyaltyBonus || 0) : 0;
    out.bloodlineTraits = (dyn.bloodlineTraits || []).slice();
    out.realmType = dyn.realmType; out.status = dyn.status;
    out.memberCount = (dyn.memberCharacterIds || []).length;
    out.isFounder = dyn.founderCharacterId === char.id;
    out.isHeir = (dyn.heirLine || []).indexOf(char.id) >= 0;
  }
  return out;
}

// =============================================================================
// Event emit — the record-only audit pattern (the aging/disease/condition/death/transformation idiom).
// All three CL-4b kinds ride it. cadence 'monthly-turn'; the dynasty + the relevant characters ride the
// context envelope (the dynasty as subject + the founder/heir as subject/beneficiary).
// =============================================================================
function _emitDynastyEvent(campaign, kind, payload, narrative, opts){
  opts = opts || {};
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
    const related = [];
    if(opts.dynastyId) related.push({ kind:'dynasty', id:opts.dynastyId, role:'subject' });
    (opts.characters || []).forEach(rc => { if(rc && rc.id) related.push({ kind:'character', id:rc.id, role:rc.role || 'subject' }); });
    A.setEventContext(ev, { primaryHexId: opts.primaryHexId || null, domainId: opts.domainId || null, relatedEntities: related });
  }
  ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
  ev.appliedAtTurn = (campaign && campaign.currentTurn) || 1;
  ev.appliedAtDay  = (campaign && campaign.currentDayInMonth) || 1;
  if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
  campaign.eventLog.push({ event: ev, result:{ narrativeSummary:narrative },
    appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
  return ev;
}

// ── self-registration (the PR #89 kernel — from THIS module, no central-file edit) ────────────────
// Guarded calls (the registerDayConsumer idiom): each registrar ships from a module that loads BEFORE
// this one (prefixes/collections = acks-engine.js; house rules = catalogs.js; entity kind = entity-
// registry.js; field schema = field-schemas.js; event kinds = events.js). A new entity self-registers
// its prefix + collection + registry kind + field schema + rule + event kinds here (CLAUDE §15.5).
if(typeof ACKS.registerPrefix === 'function'){
  ACKS.registerPrefix('dynasty', 'dyn');
  ACKS.registerPrefix('kinship', 'kin');
}
if(typeof ACKS.registerCollection === 'function'){
  ACKS.registerCollection('dynasties');   // defensive-read default: seeded in blankCampaign, NOT migrate-injected
  ACKS.registerCollection('kinships');    // (the kin- relation; accessor-only, importable)
}
if(typeof ACKS.registerHouseRule === 'function'){
  ACKS.registerHouseRule({ id:'dynasty-tracking', category:'characters', name:'Dynasties (AXIOMS 19)',
    source:'AXIOMS 19 "Cohorts and Dynasties" (Revised v2)', default:false,
    description:'OFF by default. The optional AXIOMS-19 dynasty layer: play the bloodline, not just the character. Founds first-class Dynasties (coat of arms, surname, succession law, bloodline traits) with kinship relations, births, succession laws (incl. the elective vassal-loyalty bonuses + the 2d4-month law change), and the 3-generation bloodline-trait rule. A supplement, so default off (the elite-troops / notable-items precedent). When off the data is non-functional + hidden.' });
}
if(typeof ACKS.registerEntityKind === 'function'){
  ACKS.registerEntityKind({ kind:'dynasty', label:'Dynasty', pluralLabel:'Dynasties', icon:'👑',
    addressable:true, chronicleable:true,
    list: (c) => (c && c.dynasties) || [],
    find: (c, id) => ((c && c.dynasties) || []).find(x => x && x.id === id),
    displayName: (c, obj) => (obj && obj.name) || (obj && obj.id) });
}
if(typeof ACKS.registerFieldSchema === 'function'){
  ACKS.registerFieldSchema('dynasty', {
    factory: 'blankDynasty',
    groups: ['Identity', 'Succession', 'Bloodline', 'Members', 'History'],
    fields: [
      { name:'id',                     type:'string',  readonly:true, group:'Identity' },
      { name:'name',                   type:'string',  required:true, group:'Identity', description:'Surname / house name' },
      { name:'coatOfArms',             type:'longText', group:'Identity', description:'A free-text blazon' },
      { name:'realmType',              type:'enum',    enumValues:['human-standard','beastman-tribal','dwarven-vault','elven-fastness','senatorial','syndicate','religious-organization'], group:'Identity', default:'human-standard' },
      { name:'status',                 type:'enum',    enumValues:['extant','extinct'], group:'Identity', default:'extant' },
      { name:'founderCharacterId',     type:'id',      idKind:'character', group:'Identity' },
      { name:'successionLaw',          type:'enum',    enumValues:SUCCESSION_LAW_IDS.slice(), group:'Succession', default:'gavelkind' },
      { name:'pendingSuccessionLaw',   type:'enum',    enumValues:SUCCESSION_LAW_IDS.slice(), group:'Succession', description:'A law change in progress (flips at the completion turn)' },
      { name:'lawChangeCompletesTurn', type:'number',  readonly:true, group:'Succession' },
      { name:'bloodlineTraits',        type:'enumMulti', enumValues:ABILITY_IDS.slice(), group:'Bloodline', description:'≤1 ability earned over 3 generations (AXIOMS 19)' },
      { name:'memberCharacterIds',     type:'idArray', idKind:'character', group:'Members' },
      { name:'heirLine',               type:'idArray', idKind:'character', group:'Members', description:'Ordered succession line (founder first)' },
      { name:'foundedAtTurn',          type:'number',  readonly:true, group:'History' },
      { name:'history',                type:'history', readonly:true, group:'History' }
    ]
  });
}
// The three CL-4b event kinds — record-only audit (the verbs already applied state; the handler keeps the
// event well-formed on replay). All three are Event-Wizard opt-outs (engine-owned). The kernel's `handler`
// forwards to registerEventHandler.
function applyEvent_dynastyAudit(campaign, event){
  const p = (event && event.payload) || {};
  return { result: { narrativeSummary: p.narrative || (event && event.kind) || 'dynasty' } };
}
if(typeof ACKS.registerEventKind === 'function'){
  ACKS.registerEventKind('dynasty-founded', {
    schema: { R:{ dynastyId:'string', founderCharacterId:'string' },
              O:{ name:'string', successionLaw:'string', realmType:'string', narrative:'string' } },
    wizardOptOut: true, handler: applyEvent_dynastyAudit });
  ACKS.registerEventKind('kinship-recorded', {
    schema: { R:{ kinType:'string' },
              O:{ aCharacterId:'string', bCharacterId:'string', childId:'string', dynastyId:'string', bastard:'boolean', birth:'boolean', matrilineal:'boolean', narrative:'string' } },
    wizardOptOut: true, handler: applyEvent_dynastyAudit });
  ACKS.registerEventKind('succession-resolved', {
    schema: { R:{ dynastyId:'string' },
              O:{ deceasedId:'string', heirId:'string', law:'string', vassalLoyaltyBonus:'number', divides:'boolean', dynastyExtinct:'boolean', narrative:'string' } },
    wizardOptOut: true, handler: applyEvent_dynastyAudit });
}

Object.assign(ACKS, {
  // data / catalogs
  SUCCESSION_LAWS, DYNASTY_STARTING_LAW_BY_REALM, PREGNANCY_CAPS_BY_RACE, FAMILY_TREE_MARKERS, CL4B_CITE, LAW_CHANGE_DICE,
  // catalog lookups
  successionLawById, successionLawsList, startingLawTableForRealm, rollStartingSuccessionLaw, pregnancyCapForRace,
  // factory
  blankDynasty,
  // verbs
  foundDynasty, recordKinship, birthChild, setSuccessionLaw, resolveDynastySuccession,
  // the monthly law-change clock (folded into processAgingForTurn)
  processDynastyForTurn,
  // bloodline
  dynastyEligibleBloodlineTrait, dynastyChildAbilityDice,
  // reads
  dynastyById, dynastiesInCampaign, characterDynasty, dynastyMembers, dynastyFamilyTree,
  characterKinships, charactersChildren, characterParents, characterSpouses,
  dynastyVassalLoyaltyBonus, characterDynastyInfo
});
// === end Character Lifecycle CL-4b (burst12, team) ===========================

// === Character Lifecycle CL-4b DEEPENING (b13, team) — fertility / education / delegation =====
// The three DEFERRED AXIOMS-19 dynasty mechanics (survey §10.1; Plan §11 CL-4b "Deferred:"), built over
// the shipped CL-4b core (the dyn-/kin- entities + the manual birthChild). RUN THE BLOODLINE FORWARD:
//   • Per-active-year FERTILITY — a monthly conception roll → a ~9-month gestation → an automatic birth,
//     with twins/triplets on extreme rolls (and the elf "roll two, keep the favored" rule). The shipped
//     birthChild becomes the verb the fertility clock drives (via the birthChildren litter wrapper).
//   • EDUCATION — an heir is leveled up by education over years (~1 year to level 1, scaling); wealthy/
//     highborn pay for better tutors; reserve XP (the CL-4a fund) starts an heir higher.
//   • DELEGATION — Hands-On / Overseer / Delegation governance: a titled ruler delegates the realm to a
//     regent/steward (a CL-4b governance hook; the activity-budget/magistrate/Politics CONSUMER — the
//     freed activity, the realm running itself — is a deferred forward POINTER, surfaced not wired).
//
// DISCIPLINE (the burst12 CL-4b pattern): gated INSIDE on the SHIPPED `dynasty-tracking` rule (no new
//   rule); all new character fields (pregnantUntilTurn / pregnantSinceTurn / pregnantByCharacterId /
//   fertilitySuspended / sex[read-only] / education / delegation) are defensive-read / init-on-write —
//   NO blankCharacter seed → the 6 templates + demo stay migrate-no-ops, no migration. The monthly
//   fertility + education pass FOLDS into processAgingForTurn (the CL-5/CL-4b fold — no new day-tick
//   slot). The two new event kinds (child-educated / heir-delegated) self-register FROM HERE (the PR #89
//   kernel). dry-run rolls NO dice + mutates nothing (the aging discipline): a birth-due is deterministic
//   (a turn comparison) so dry-run reports it; conception + the litter roll + the education accrual are
//   dice/mutations → commit only, so there is no dry-run/commit divergence.
//
// ⚠ IP (§13.6): AXIOMS 19 mechanical facts only (the ~9-month term, the lifetime caps already shipped,
//   the elf-favored rule, the three delegation modes, "≈1 year to level 1", "reserve XP starts higher"),
//   cited AXIOMS 19; never the prose. The exact fertility-% + tutor-rate tables are NOT in AXIOMS in a
//   transcribable form, so FERTILITY_BY_RACE + EDUCATION_TUTORS are 🔧 tooling values derived from the
//   stated facts ("≈ once per active year" / "≈1 year to level 1") — the GM tunes; the model is the point.
// =============================================================================

// ── Fertility (AXIOMS 19 — Breeding / Pregnancy / Birth) ──────────────────────────────────────────
// Per-active-year conception chance by race (🔧 — AXIOMS gives "≈ once per active year" + the lifetime
// caps; this derives a clean per-year rate: the prolific races (human/beastman, cap 12) near "once per
// active year", the long-lived scaled down by their cap (dwarf 4, elf 2). Applied per MONTH as the
// equivalent 1-(1-P)^(1/12), so over a year it averages the per-year rate. Modified by nothing else in
// v1 (age-of-bearing is a gate, not a curve; CON/age fertility curves are a noted refinement).
const FERTILITY_BY_RACE = Object.freeze({ human:0.6, zaharan:0.6, nobiran:0.4, beastman:0.6, dwarf:0.25, gnome:0.25, halfling:0.25, elf:0.05 });
const GESTATION_MONTHS = 9;            // AXIOMS 19 — a ~9-month (=turn) term
const TWIN_CHANCE = 0.04;             // "twins / triplets on extreme rolls" — a 5% multiple-birth tail (🔧)
const TRIPLET_CHANCE = 0.01;          // (triplets the rarer 1%; twins the next 4%; else a single birth)
const FERTILE_AGE_CATEGORIES = Object.freeze({ adult:true, 'middle-aged':true });   // of bearing age (not youth/old/ancient)

function fertilityChanceForRace(race){
  const key = _PREG_RACE_ALIASES[String(race || 'human').toLowerCase().trim()] || 'human';
  return FERTILITY_BY_RACE[key] != null ? FERTILITY_BY_RACE[key] : 0.6;
}
function _monthlyConceptionChance(race){
  const annual = Math.min(0.999, Math.max(0, fertilityChanceForRace(race)));
  return 1 - Math.pow(1 - annual, 1 / 12);
}
function _sexCanBear(c){ return !String((c && c.sex) || '').toLowerCase().trim().startsWith('m'); }   // sex absent ⇒ can bear (defensive)
function _isFertileAge(c){
  if(!c || c.age == null || typeof c.age !== 'number') return false;   // opt-in (the aging-seeding discipline)
  return !!FERTILE_AGE_CATEGORIES[_categoryForRaceAge(_normalizeRace(c.race), c.age)];
}
// _canBearChild — can this character (currently) conceive via the automatic fertility roll? (alive, of a
// bearing sex, of bearing age, under the lifetime cap, not already gestating, not GM-suspended.)
function _canBearChild(c){
  if(!c) return false;
  if(c.lifecycleState === 'deceased' || c.alive === false) return false;
  if(c.lifecycleState === 'candidate') return false;
  if(c.fertilitySuspended === true) return false;
  if(c.pregnantUntilTurn != null) return false;
  if(!_sexCanBear(c)) return false;
  if(!_isFertileAge(c)) return false;
  if((Number(c.pregnancies) || 0) >= pregnancyCapForRace(c.race)) return false;
  return true;
}
// _fertileCouples — the active marriages whose bearing partner can currently conceive. Dedupes by marriage
// (one conception roll per couple); resolves the bearer (a female-sexed partner first, else the one with
// fewer recorded pregnancies, else id-order — deterministic) + the other partner as the father.
function _fertileCouples(campaign){
  const out = [];
  _kinships(campaign).forEach(k => {
    if(!k || k.kinType !== 'marriage' || k.endedAtTurn != null) return;
    const a = _findCharacterLC(campaign, k.aCharacterId), b = _findCharacterLC(campaign, k.bCharacterId);
    if(!a || !b) return;
    const aB = _canBearChild(a), bB = _canBearChild(b);
    let mother = null, father = null;
    if(aB && bB){
      const fa = String(a.sex || '').toLowerCase().startsWith('f'), fb = String(b.sex || '').toLowerCase().startsWith('f');
      if(fa && !fb){ mother = a; father = b; }
      else if(fb && !fa){ mother = b; father = a; }
      else { const pa = Number(a.pregnancies) || 0, pb = Number(b.pregnancies) || 0;
        mother = (pa !== pb) ? (pa < pb ? a : b) : (a.id <= b.id ? a : b); father = (mother === a) ? b : a; }
    } else if(aB){ mother = a; father = b; }
    else if(bB){ mother = b; father = a; }
    else return;
    out.push({ mother, father });
  });
  return out;
}
function _conceive(mother, father, turn){
  mother.pregnantSinceTurn = turn;
  mother.pregnantUntilTurn = turn + GESTATION_MONTHS;
  mother.pregnantByCharacterId = (father && father.id) || null;
}
function _rollLitterSize(rng){
  const r = (typeof rng === 'function') ? rng() : Math.random();
  if(r < TRIPLET_CHANCE) return 3;
  if(r < TRIPLET_CHANCE + TWIN_CHANCE) return 2;
  return 1;
}
function _rollChildAbilitySet(campaign, motherId, fatherId, rng){
  const out = {};
  ABILITY_IDS.forEach(ab => { out[ab] = _rollAbilityDice(dynastyChildAbilityDice(campaign, motherId, fatherId, ab), rng); });
  return out;
}
function _abilityTotalOf(set){ return ABILITY_IDS.reduce((s, ab) => s + (Number(set && set[ab]) || 0), 0); }

// birthChildren — the AXIOMS-19 litter wrapper over birthChild. Rolls the litter size ("twins/triplets on
// extreme rolls") — or, for ELVES, the "roll up two children, keep the favored" rule (two ability sets are
// rolled, the higher-total kept, ONE child minted with it). A litter is ONE pregnancy against the cap (the
// cap is on pregnancies, not children — the siblings birth with skipCapCheck + skipPregnancyIncrement).
// Returns { children:[Character], litterSize, elfFavored } (or { error } from the first birthChild).
//   opts: the birthChild opts (motherCharacterId / fatherCharacterId / name / race / … / rng) + an optional
//   litterSize override (a GM/test forcing a known litter).
function birthChildren(campaign, opts){
  opts = opts || {};
  const mother = _findCharacterLC(campaign, opts.motherCharacterId);
  if(!mother) return { error:'no-mother' };
  const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
  const race = _PREG_RACE_ALIASES[String(mother.race || 'human').toLowerCase().trim()] || 'human';

  // Elf — roll two ability sets, keep the favored (higher total); mint ONE child with it. One pregnancy.
  if(race === 'elf'){
    const fatherId = (opts.fatherCharacterId && _findCharacterLC(campaign, opts.fatherCharacterId)) ? opts.fatherCharacterId : null;
    const setA = _rollChildAbilitySet(campaign, mother.id, fatherId, rng);
    const setB = _rollChildAbilitySet(campaign, mother.id, fatherId, rng);
    const favored = _abilityTotalOf(setB) > _abilityTotalOf(setA) ? setB : setA;
    const child = birthChild(campaign, Object.assign({}, opts, { rng, forcedAbilities: favored }));
    if(child && child.error) return child;
    child.litter = { size:1, elfFavored:true };
    return { children:[child], litterSize:1, elfFavored:true };
  }

  // Others — roll the litter size; mint that many (siblings skip the increment + cap check — one pregnancy).
  const size = (opts.litterSize && opts.litterSize >= 1) ? opts.litterSize : _rollLitterSize(rng);
  const children = [];
  for(let i = 0; i < size; i++){
    const sib = (i === 0) ? opts : Object.assign({}, opts, { skipPregnancyIncrement:true, skipCapCheck:true });
    const child = birthChild(campaign, Object.assign({}, sib, { rng }));
    if(child && child.error){ if(i === 0) return child; break; }
    child.litter = { size, index:i };
    children.push(child);
  }
  return { children, litterSize: children.length, elfFavored:false };
}

// ── Education (AXIOMS 19 — Education) ──────────────────────────────────────────────────────────────
// An heir is leveled up by education over years (~1 year to level 1, scaling up). Wealthy/highborn pay for
// better tutors (faster XP). The XP/month rates are 🔧 tooling calibrated to "≈1 year to level 1" for a
// typical class (a Fighter's 2,000-XP first level ≈ a year at the Basic rate); higher levels take longer
// because the class XP tables scale (the shipped checkAllCharacterLevelUps does the leveling). A tutor
// costs gp/month (RAW: wealthy/highborn pay) — debited from a payer's purse if one is set, else GM-funded.
const EDUCATION_TUTORS = Object.freeze([
  { id:'self-taught', label:'Self-taught',      xpPerMonth:75,  monthlyCostGp:0,   cite:CL4B_CITE },
  { id:'basic',       label:'Basic tutor',      xpPerMonth:150, monthlyCostGp:25,  cite:CL4B_CITE },
  { id:'fine',        label:'Fine tutor',       xpPerMonth:300, monthlyCostGp:75,  cite:CL4B_CITE },
  { id:'masterful',   label:'Masterful tutor',  xpPerMonth:600, monthlyCostGp:200, cite:CL4B_CITE }
]);
const EDUCATION_TUTOR_BY_ID = Object.freeze(EDUCATION_TUTORS.reduce((m, t) => { m[t.id] = t; return m; }, {}));
function educationTutorsList(){ return EDUCATION_TUTORS.slice(); }
function _canonProf(raw){
  const A = global.ACKS;
  if(A && typeof A.canonicalProficiencyKey === 'function'){ try { return A.canonicalProficiencyKey(raw); } catch(_e){} }
  return String(raw || '').toLowerCase().trim().replace(/\s+/g, '-');
}
function _grantFocusProficiency(child, focusKey){
  if(!focusKey) return;
  if(!Array.isArray(child.proficiencies)) child.proficiencies = [];   // the PT-0 {key,ranks} shape (defensive)
  const existing = child.proficiencies.find(p => p && p.key === focusKey);
  if(existing){ existing.ranks = (Number(existing.ranks) || 0) + 1; }
  else child.proficiencies.push({ key: focusKey, ranks: 1 });
}

// educateCharacter — begin / change a character's education. opts: { tutor (id, default 'basic'), focus (a
// proficiency the schooling emphasizes — a rank granted at the first level milestone), payerCharacterId
// (whose purse funds the tutor; absent ⇒ GM-funded, no debit) }. Sets child.education (defensive). The
// monthly XP accrual rides processFamilyForTurn (the aging fold). Returns the education record (or { error }).
function educateCharacter(campaign, childOrId, opts){
  opts = opts || {};
  const child = (childOrId && typeof childOrId === 'object') ? childOrId : _findCharacterLC(campaign, childOrId);
  if(!child) return { error:'no-character' };
  if(child.lifecycleState === 'deceased' || child.alive === false) return { error:'deceased' };
  const tutor = EDUCATION_TUTOR_BY_ID[opts.tutor] || EDUCATION_TUTOR_BY_ID['basic'];
  const turn = (campaign && campaign.currentTurn) || 1;
  const focus = opts.focus ? _canonProf(opts.focus) : null;
  child.education = {
    tutor: tutor.id, focus, focusGranted: false, payerCharacterId: opts.payerCharacterId || null,
    startedAtTurn: turn, xpAccrued: 0, lastLevel: Number(child.level) || 1, active: true
  };
  const summary = child.name + ' begins education under a ' + tutor.label.toLowerCase() + (focus ? (' (focus: ' + focus + ')') : '') + '.';
  try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, child, 'child-educated', summary, { tutor: tutor.id, focus, started: true }); } catch(_e){}
  return child.education;
}
function endEducation(campaign, childOrId){
  const child = (childOrId && typeof childOrId === 'object') ? childOrId : _findCharacterLC(campaign, childOrId);
  if(!child || !child.education) return { error:'not-educating' };
  child.education.active = false;
  return { ended: true, characterId: child.id };
}

// applyReserveXpToHeir — seed an heir higher from a reserve-XP source (AXIOMS 19: "reserve XP starts an
// heir higher"; the CL-4a fund). Moves min(amount||all, source.reserveXp) into the heir's xp + runs the
// shipped level-up sweep. opts: { fromCharacterId (default = the heir's own reserveXp), amount }. Emits
// child-educated. Returns { moved, heirLevel }.
function applyReserveXpToHeir(campaign, heirOrId, opts){
  opts = opts || {};
  const heir = (heirOrId && typeof heirOrId === 'object') ? heirOrId : _findCharacterLC(campaign, heirOrId);
  if(!heir) return { error:'no-heir' };
  const src = opts.fromCharacterId ? _findCharacterLC(campaign, opts.fromCharacterId) : heir;
  const pool = characterReserveXp(src);
  const want = (opts.amount != null) ? Math.max(0, Math.floor(opts.amount)) : pool;
  const moved = Math.min(want, pool);
  if(moved <= 0) return { moved: 0, heirLevel: Number(heir.level) || 1 };
  if(src) src.reserveXp = pool - moved;
  heir.xp = (Number(heir.xp) || 0) + moved;
  try { if(typeof ACKS.checkAllCharacterLevelUps === 'function') ACKS.checkAllCharacterLevelUps(campaign); } catch(_e){}
  const lvl = Number(heir.level) || 1;
  const summary = heir.name + ' is started higher with ' + moved + ' reserve XP' + (lvl > 1 ? (' — now level ' + lvl) : '') + '.';
  try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, heir, 'child-educated', summary, { reserveXp: moved, newLevel: lvl }); } catch(_e){}
  _emitDynastyEvent(campaign, 'child-educated', { characterId: heir.id, reserveXpApplied: moved, newLevel: lvl, narrative: summary },
    summary, { characters:[{ id: heir.id, role:'subject' }], dynastyId: heir.dynastyId || null });
  return { moved, heirLevel: lvl };
}

// ── Delegation (AXIOMS 19 — Campaign task delegation) ─────────────────────────────────────────────
const DELEGATION_MODES = Object.freeze([
  { id:'hands-on',   label:'Hands-On',   needsDelegate:false, freesRuler:false, cite:CL4B_CITE, rule:'The ruler runs the realm personally — no delegate, full attention required.' },
  { id:'overseer',   label:'Overseer',   needsDelegate:true,  freesRuler:false, cite:CL4B_CITE, rule:'A chamberlain runs day-to-day; the ruler reviews 1–2×/month — partial freedom.' },
  { id:'delegation', label:'Delegation', needsDelegate:true,  freesRuler:true,  cite:CL4B_CITE, rule:'A steward holds full rights — the ruler is free to adventure while the realm runs itself.' }
]);
const DELEGATION_MODE_BY_ID = Object.freeze(DELEGATION_MODES.reduce((m, d) => { m[d.id] = d; return m; }, {}));
function delegationModesList(){ return DELEGATION_MODES.slice(); }

// delegateAuthority — set a (titled) ruler's campaign-task delegation (AXIOMS 19). opts: { mode (id),
// delegateCharacterId (the regent/chamberlain/steward; required for overseer/delegation), domainId? }.
// Records ruler.delegation (defensive; 'hands-on' clears it). The freed-activity / realm-runs-itself
// CONSUMER (activity budget #346, magistrate/officer, Politics) is a deferred forward pointer — this
// records the governance state + surfaces freesRuler. Emits heir-delegated. Returns { mode, delegate, freesRuler }.
function delegateAuthority(campaign, rulerOrId, opts){
  opts = opts || {};
  const ruler = (rulerOrId && typeof rulerOrId === 'object') ? rulerOrId : _findCharacterLC(campaign, rulerOrId);
  if(!ruler) return { error:'no-ruler' };
  if(ruler.lifecycleState === 'deceased' || ruler.alive === false) return { error:'ruler-deceased' };
  const mode = DELEGATION_MODE_BY_ID[opts.mode] || DELEGATION_MODE_BY_ID['hands-on'];
  let delegate = null;
  if(mode.needsDelegate){
    delegate = _findCharacterLC(campaign, opts.delegateCharacterId);
    if(!delegate) return { error:'no-delegate' };
    if(delegate.lifecycleState === 'deceased' || delegate.alive === false) return { error:'delegate-deceased' };
    if(delegate.id === ruler.id) return { error:'cannot-delegate-to-self' };
  }
  const turn = (campaign && campaign.currentTurn) || 1;
  const domainId = opts.domainId || ruler.currentDomainId || null;
  if(mode.id === 'hands-on'){ ruler.delegation = null; }
  else ruler.delegation = { mode: mode.id, delegateCharacterId: delegate ? delegate.id : null, domainId, sinceTurn: turn };
  const summary = (mode.id === 'hands-on')
    ? (ruler.name + ' takes the realm back into his own hands (Hands-On).')
    : (ruler.name + ' delegates authority to ' + (delegate ? delegate.name : 'a steward') + ' (' + mode.label + ')' + (mode.freesRuler ? ' — free to adventure while the realm runs itself' : '') + '.');
  try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, ruler, 'heir-delegated', summary, { mode: mode.id, delegateCharacterId: delegate ? delegate.id : null }); } catch(_e){}
  _emitDynastyEvent(campaign, 'heir-delegated', { rulerCharacterId: ruler.id, mode: mode.id, delegateCharacterId: delegate ? delegate.id : null, freesRuler: mode.freesRuler, narrative: summary },
    summary, { characters: [{ id: ruler.id, role:'subject' }].concat(delegate ? [{ id: delegate.id, role:'recipient' }] : []), dynastyId: ruler.dynastyId || null, domainId });
  return { mode: mode.id, delegate: delegate ? { id: delegate.id, name: delegate.name } : null, freesRuler: mode.freesRuler };
}
function delegationInfo(campaign, char){
  const d = char && char.delegation;
  if(!d || !d.mode || d.mode === 'hands-on') return { mode:'hands-on', label:'Hands-On', freesRuler:false, delegate:null, sinceTurn: d ? (d.sinceTurn || null) : null };
  const mode = DELEGATION_MODE_BY_ID[d.mode] || DELEGATION_MODE_BY_ID['hands-on'];
  const delegate = d.delegateCharacterId ? _findCharacterLC(campaign, d.delegateCharacterId) : null;
  return { mode: mode.id, label: mode.label, rule: mode.rule, freesRuler: mode.freesRuler, sinceTurn: d.sinceTurn || null,
    delegate: delegate ? { id: delegate.id, name: delegate.name, deceased: (delegate.lifecycleState === 'deceased' || delegate.alive === false) } : null,
    delegateMissing: !!(d.delegateCharacterId && !delegate) };
}

// ── characterFamilyInfo — the char-sheet read accessor (the b13 Family panel) ─────────────────────
// The pregnancy/fertility status + the education record + the delegation state, in one read for the UI.
function characterFamilyInfo(campaign, char){
  if(!char) return { fertile:false };
  const cap = pregnancyCapForRace(char.race);
  const turn = (campaign && campaign.currentTurn) || 1;
  const pregnant = char.pregnantUntilTurn != null;
  const ed = char.education && char.education.active !== false ? char.education : null;
  const tutor = ed ? (EDUCATION_TUTOR_BY_ID[ed.tutor] || null) : null;
  return {
    sexCanBear: _sexCanBear(char), fertileAge: _isFertileAge(char),
    fertile: _canBearChild(char), fertilitySuspended: char.fertilitySuspended === true,
    annualFertility: fertilityChanceForRace(char.race),
    pregnancies: Number(char.pregnancies) || 0, pregnancyCap: cap,
    pregnant, pregnantUntilTurn: char.pregnantUntilTurn != null ? char.pregnantUntilTurn : null,
    dueInMonths: pregnant ? Math.max(0, char.pregnantUntilTurn - turn) : null,
    pregnantByCharacterId: char.pregnantByCharacterId || null,
    education: ed ? { tutor: ed.tutor, tutorLabel: tutor ? tutor.label : ed.tutor, xpPerMonth: tutor ? tutor.xpPerMonth : null,
      focus: ed.focus || null, focusGranted: ed.focusGranted === true, level: Number(char.level) || 1, xpAccrued: Number(ed.xpAccrued) || 0, startedAtTurn: ed.startedAtTurn || null } : null,
    delegation: delegationInfo(campaign, char)
  };
}

// ── processFamilyForTurn — the monthly fertility + education pass (folded into processAgingForTurn) ─
// Gated on dynasty-tracking (no-ops when off — principle 8). dry-run reports the deterministic facts (a
// birth DUE this month, the eligible couples + their monthly chance, the educating characters + the rate)
// and rolls NO dice + mutates nothing; commit rolls the conception + the litter + accrues the education XP.
function processFamilyForTurn(campaign, opts){
  opts = opts || {};
  const dryRun = !!opts.dryRun;
  const rng = (typeof opts.rng === 'function') ? opts.rng : Math.random;
  const out = { ran:true, dryRun, conceptions:[], births:[], education:[], logEntries:[] };
  if(!ACKS.isHouseRuleEnabled || !ACKS.isHouseRuleEnabled(campaign, 'dynasty-tracking')) return out;
  const turn = (campaign && campaign.currentTurn) || 1;
  const chars = (campaign && campaign.characters) || [];

  // (1) Births due — deterministic (gestation completion is a turn comparison). Snapshot the list, since
  //     birthChildren pushes new Characters. Track delivered mothers so they don't re-conceive this month.
  const delivered = new Set();
  chars.slice().forEach(mother => {
    if(!mother || mother.pregnantUntilTurn == null) return;
    if(turn < mother.pregnantUntilTurn) return;
    if(dryRun){ out.births.push({ motherId: mother.id, name: mother.name, dueThisMonth: true }); return; }
    const father = mother.pregnantByCharacterId ? _findCharacterLC(campaign, mother.pregnantByCharacterId) : null;
    const res = birthChildren(campaign, { motherCharacterId: mother.id, fatherCharacterId: father && father.id, rng });
    mother.pregnantUntilTurn = null; mother.pregnantSinceTurn = null; mother.pregnantByCharacterId = null;
    delivered.add(mother.id);
    if(res && res.children && res.children.length){
      const names = res.children.map(c => c.name).join(', ');
      const litterNote = res.elfFavored ? ' (the favored of two)' : res.litterSize === 3 ? ' — triplets!' : res.litterSize === 2 ? ' — twins!' : '';
      const summary = mother.name + ' gives birth' + litterNote + ': ' + names + '.';
      out.births.push({ motherId: mother.id, name: mother.name, childIds: res.children.map(c => c.id), litterSize: res.litterSize, elfFavored: !!res.elfFavored });
      out.logEntries.push('Birth — ' + summary);
    } else {
      out.births.push({ motherId: mother.id, name: mother.name, error: (res && res.error) || 'birth-failed' });
    }
  });

  // (2) Conceptions — one per-month roll per fertile couple (commit only; a die). dry-run reports eligibility.
  _fertileCouples(campaign).forEach(({ mother, father }) => {
    if(delivered.has(mother.id)) return;   // delivered this month — no immediate re-conception
    const p = _monthlyConceptionChance(mother.race);
    if(dryRun){ out.conceptions.push({ motherId: mother.id, name: mother.name, eligible: true, monthlyChance: p }); return; }
    if(rng() < p){
      _conceive(mother, father, turn);
      const summary = mother.name + ' conceives' + (father ? (' a child with ' + father.name) : '') + ' — due in ' + GESTATION_MONTHS + ' months.';
      out.conceptions.push({ motherId: mother.id, name: mother.name, fatherId: father && father.id, dueTurn: mother.pregnantUntilTurn, conceived: true });
      out.logEntries.push('Conception — ' + summary);
      try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, mother, 'kinship-recorded', summary, { conception: true }); } catch(_e){}
    }
  });

  // (3) Education — accrue XP for each character in active education (commit only), then ONE level-up sweep,
  //     then a milestone pass (grant the focus proficiency once + emit child-educated on a new level).
  const educating = chars.filter(c => c && c.education && c.education.active !== false && c.lifecycleState !== 'deceased' && c.alive !== false);
  educating.forEach(child => {
    const ed = child.education;
    const tutor = EDUCATION_TUTOR_BY_ID[ed.tutor] || EDUCATION_TUTOR_BY_ID['basic'];
    if(dryRun){ out.education.push({ characterId: child.id, name: child.name, tutor: tutor.id, xpPerMonth: tutor.xpPerMonth }); return; }
    // pay the tutor (optional — wealthy/highborn pay; no payer ⇒ GM-funded)
    if(ed.payerCharacterId && tutor.monthlyCostGp > 0){
      const payer = _findCharacterLC(campaign, ed.payerCharacterId);
      const have = (payer && payer.coins && Number(payer.coins.gp)) || 0;
      if(payer && have >= tutor.monthlyCostGp){ payer.coins.gp = have - tutor.monthlyCostGp; payer.personalGp = payer.coins.gp; }
      else { out.logEntries.push('Education — ' + child.name + "'s schooling stalls (the tutor goes unpaid)."); out.education.push({ characterId: child.id, name: child.name, stalled: true }); ed._stalled = true; return; }
    }
    ed._stalled = false;
    child.xp = (Number(child.xp) || 0) + tutor.xpPerMonth;
    ed.xpAccrued = (Number(ed.xpAccrued) || 0) + tutor.xpPerMonth;
  });
  if(!dryRun && educating.some(c => c.education && !c.education._stalled)){
    try { if(typeof ACKS.checkAllCharacterLevelUps === 'function') ACKS.checkAllCharacterLevelUps(campaign); } catch(_e){}
    educating.forEach(child => {
      const ed = child.education; if(!ed || ed._stalled) return;
      const nowLevel = Number(child.level) || 1;
      if(nowLevel > (ed.lastLevel || 1)){
        if(ed.focus && !ed.focusGranted){ _grantFocusProficiency(child, ed.focus); ed.focusGranted = true; }
        ed.lastLevel = nowLevel;
        const summary = child.name + ' completes a stage of education — now level ' + nowLevel + (ed.focus ? (' (trained in ' + ed.focus + ')') : '') + '.';
        out.education.push({ characterId: child.id, name: child.name, newLevel: nowLevel, focusGranted: !!ed.focus });
        out.logEntries.push('Education — ' + summary);
        try { if(typeof ACKS.addCharacterHistory === 'function') ACKS.addCharacterHistory(campaign, child, 'child-educated', summary, { newLevel: nowLevel }); } catch(_e){}
        _emitDynastyEvent(campaign, 'child-educated', { characterId: child.id, newLevel: nowLevel, tutor: ed.tutor, focus: ed.focus || null, narrative: summary },
          summary, { characters:[{ id: child.id, role:'subject' }], dynastyId: child.dynastyId || null });
      } else {
        out.education.push({ characterId: child.id, name: child.name, xpAccrued: ed.xpAccrued });
      }
    });
  }
  return out;
}

// The two b13 event kinds (record-only audit — the verbs already applied state; the handler keeps the
// event well-formed on replay). Both are Event-Wizard opt-outs (engine-owned). applyEvent_dynastyAudit
// is defined in the CL-4b core above (same module).
if(typeof ACKS.registerEventKind === 'function'){
  ACKS.registerEventKind('child-educated', {
    schema: { R:{ characterId:'string' },
              O:{ newLevel:'number', tutor:'string', focus:'string', reserveXpApplied:'number', narrative:'string' } },
    wizardOptOut: true, handler: applyEvent_dynastyAudit });
  ACKS.registerEventKind('heir-delegated', {
    schema: { R:{ rulerCharacterId:'string', mode:'string' },
              O:{ delegateCharacterId:'string', freesRuler:'boolean', narrative:'string' } },
    wizardOptOut: true, handler: applyEvent_dynastyAudit });
}

Object.assign(ACKS, {
  // data / catalogs
  FERTILITY_BY_RACE, GESTATION_MONTHS, EDUCATION_TUTORS, DELEGATION_MODES,
  // catalog lookups
  fertilityChanceForRace, educationTutorsList, delegationModesList,
  // fertility
  birthChildren, processFamilyForTurn,
  // education
  educateCharacter, endEducation, applyReserveXpToHeir,
  // delegation
  delegateAuthority, delegationInfo,
  // reads
  characterFamilyInfo
});
// === end Character Lifecycle CL-4b DEEPENING (b13, team) ======================

if(typeof module !== 'undefined' && module.exports) module.exports = ACKS;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
