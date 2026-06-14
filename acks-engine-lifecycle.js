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

if(typeof module !== 'undefined' && module.exports) module.exports = ACKS;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
