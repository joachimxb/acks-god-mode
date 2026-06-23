/* =============================================================================
 * acks-engine-military.js — ACKS God Mode Units, Armies, Levies & the Group model
 * =============================================================================
 *
 * Extracted from acks-engine.js (T5 monolith decomposition, 2026-06-23) — pure
 * code-motion, no behaviour change. Houses the collective-actor foundation:
 *
 *   - The Group entity (#442) + the §12 Group model — the shared interface over the
 *     collective-actor kinds (party / army / unit / band): kind, members, leader,
 *     headcount, position, journey, speed, logistics, lifecycle, BR.
 *   - Units & Armies (Phase 3 Military W1) — lookups, the battle interface, officer
 *     characteristics, stationing, the army org model, and the garrison lift.
 *   - Levies & militia (W7) — conscript/militia raise, training & muster timers (the
 *     day-consumers stay in the engine), realm-scale mercenary + specialist recruitment.
 *   - Vagaries-of-Incursion derived reads (W2) + platoon-scale BR.
 *
 * Self-registers the garrison-units-to-units load-migration (order 150) — was inline
 * in the engine seed array. Late-bound on global.ACKS: the core engine helpers
 * (abilityMod / clamp / isHouseRuleEnabled / effectiveDomainClassification /
 * settlementForHex / realmFamiliesForDomain / createSpecialistContract / newId /
 * ID_PREFIXES — all exported), the troop catalog (acks-engine-troops.js, loaded
 * earlier), and the entity factories (acks-engine-entities.js). The battles &
 * maneuvers modules read this module via ACKS.* (loaded after). _resolveDomain,
 * _levyMusterNoun, _completeTraining and the F&D troop-bridge privates are exported
 * for their engine-core callers (favor-duty / muster / training paths).
 * Loads AFTER acks-engine.js (needs registerLoadMigration); before economy/battles.
 *
 * RAW + IP (CLAUDE.md §13.6): mechanical values only, page-cited; the troop & mass-
 * combat tables live in acks-engine-troops.js.
 * ============================================================================= */
(function(global){
'use strict';
const ACKS = global.ACKS = global.ACKS || {};
// =============================================================================
// #442 — Group entity lookups (count-level abstraction, Architecture.md §2.4).
// A Group represents N identical entities (kobold pack, bandit gang, town militia,
// future DaW Unit) sharing a monsterCatalogKey template. Used where individuated
// Creature records would be wasteful. Phase 3 Military's Unit specializes this.
// Setters (spawnCreatureFromGroup, applyCasualties) land later with Phase 3.
// =============================================================================

function findGroup(campaign, groupId){
  if(!campaign || !Array.isArray(campaign.groups)) return null;
  return campaign.groups.find(g => g.id === groupId) || null;
}

function groupsAtHex(campaign, hexId){
  if(!campaign || !Array.isArray(campaign.groups)) return [];
  return campaign.groups.filter(g => g.currentHexId === hexId);
}

// All groups whose template matches a given monsterCatalogKey. Useful for "where
// are all the kobolds in this world?" — answers across hexes and lifecycle states.
function groupsByCatalogKey(campaign, monsterCatalogKey){
  if(!campaign || !Array.isArray(campaign.groups)) return [];
  return campaign.groups.filter(g =>
    g.groupTemplate && g.groupTemplate.monsterCatalogKey === monsterCatalogKey
  );
}

// All groups currently under this character's command (reverse-derived from the
// commanderCharacterId pointer on each group). A character may command 0..N groups.
function groupsCommandedBy(campaign, characterId){
  if(!campaign || !Array.isArray(campaign.groups)) return [];
  return campaign.groups.filter(g => g.commanderCharacterId === characterId);
}

// Active member count = count − casualties, clamped at 0. Defensive: handles
// missing/negative casualties without going negative.
function groupActiveCount(group){
  if(!group) return 0;
  const count = group.count || 0;
  const casualties = group.casualties || 0;
  return Math.max(0, count - casualties);
}

// =============================================================================
// Phase 3 Military W1 (2026-06-12) — Units & Armies.
// Unit is the Group's military sibling kind (campaign.units[]; Architecture §2.4 —
// soldiers never leak into the monster-band machinery that iterates campaign.groups[]).
// Both kinds meet the battle layer through the SAME derived interface: a Unit's BR
// reads TROOP_CATALOG (RR pp.438–444); a Group's BR reads the MONSTER_CATALOG's
// per-creature battleRating (the JJ pp.104–106 platoon organization consumes it at W2).
// Armies embed their divisions (no independent lifetime — Architecture §3.1).
// The legacy nested homes (domain.garrison.units[] / character.mercenaryCompany.units[])
// stay as REFERENCE-UNIFIED MIRRORS of campaign.units[] (the hexes precedent, §3.3):
// the lift migration extends each nested unit in place and shares the object, so the
// economy + UI readers are untouched while military reads go through the collection.
// =============================================================================

function findUnit(campaign, unitId){
  if(!campaign || !Array.isArray(campaign.units)) return null;
  return campaign.units.find(u => u && u.id === unitId) || null;
}

function findArmy(campaign, armyId){
  if(!campaign || !Array.isArray(campaign.armies)) return null;
  return campaign.armies.find(a => a && a.id === armyId) || null;
}

// All units assigned to a station — {kind: 'domain-garrison'|'character'|'army'|'hex'|'constructible', id}.
function unitsStationedAt(campaign, stationedAt){
  if(!campaign || !Array.isArray(campaign.units) || !stationedAt) return [];
  return campaign.units.filter(u => u && u.stationedAt &&
    u.stationedAt.kind === stationedAt.kind && u.stationedAt.id === stationedAt.id);
}

function armiesAtHex(campaign, hexId){
  if(!campaign || !Array.isArray(campaign.armies)) return [];
  return campaign.armies.filter(a => a && a.currentHexId === hexId);
}

// Active soldier count = count − casualties (the Group shape).
function unitActiveCount(unit){
  if(!unit) return 0;
  return Math.max(0, (unit.count || 0) - (unit.casualties || 0));
}

// The army's units (stationedAt = the army). Division membership (division.unitIds) is the
// army's INTERNAL org chart; stationedAt is the unit's assignment truth — validateArmyOrganization
// flags disagreements between the two rather than auto-mutating either.
function armyUnits(campaign, army){
  if(!army) return [];
  return unitsStationedAt(campaign, { kind: 'army', id: army.id });
}

// T6 single-home — a domain's garrison units / a character's mercenary-company units, read from
// the canonical campaign.units[] by stationedAt (NOT the deleted domain.garrison.units /
// character.mercenaryCompany.units nested mirror). Accept an entity or a bare id. The siblings of
// armyUnits; every garrison/merc reader routes through these so the station-kind strings live once.
function domainGarrisonUnits(campaign, domainOrId){
  const id = domainOrId && typeof domainOrId === 'object' ? domainOrId.id : domainOrId;
  if(!id) return [];
  return unitsStationedAt(campaign, { kind: 'domain-garrison', id });
}
function characterMercenaryUnits(campaign, charOrId){
  const id = charOrId && typeof charOrId === 'object' ? charOrId.id : charOrId;
  if(!id) return [];
  return unitsStationedAt(campaign, { kind: 'character', id });
}

function armyDivisionForUnit(army, unitId){
  if(!army || !Array.isArray(army.divisions)) return null;
  return army.divisions.find(dv => dv && Array.isArray(dv.unitIds) && dv.unitIds.includes(unitId)) || null;
}

// ─── Catalog-derived unit reads (derive-don't-store; stored per-soldier wage/BR are
//     GM overrides that win over the catalog — the legacy garrison-unit fields) ───

// Resolve the unit's TROOP_CATALOG row (null when the race doesn't field the type
// or the type is unknown — e.g. a fully hand-authored unit).
function unitTroopRow(unit){
  if(!unit || !global.ACKS || typeof global.ACKS.findTroopType !== 'function') return null;
  return global.ACKS.findTroopType(unit.unitTypeKey, {
    race: unit.race || 'man', veteran: !!unit.veteran, loadout: unit.loadout || null
  });
}

// A single unit's daily march in miles (RR p.448 — the printed unit daily move, else
// exploration ft/5, else 24 🔧). Mirrors armyMarchProfile's per-unit read so a lone
// detachment rallying to a muster point travels at its own troop type's pace.
function unitMarchMilesPerDay(unit){
  const row = unitTroopRow(unit);
  return (row && typeof row.unitDailyMoveMiles === 'number' && row.unitDailyMoveMiles > 0) ? row.unitDailyMoveMiles
       : (row && typeof row.moveFt === 'number' && row.moveFt > 0) ? row.moveFt / 5
       : 24;
}

// Where a unit physically is, as a hex id (for plotting a rally march). A garrison unit
// sits at its domain's seat (🔧 v1: the domain's first authored hex — the muster default's
// twin); a company unit is with its patron; a hex/army station resolves directly. null
// when unresolvable (no hexes authored / dangling station). Pure read.
function unitCurrentHexId(campaign, unit){
  const st = unit && unit.stationedAt;
  if(!campaign || !st) return null;
  if(st.kind === 'hex') return st.id;
  if(st.kind === 'army'){ const a = findArmy(campaign, st.id); return a ? (a.currentHexId || null) : null; }
  if(st.kind === 'character'){ const c = _findCharacterById(campaign, st.id); return c ? (c.currentHexId || null) : null; }
  if(st.kind === 'domain-garrison'){
    const d = (campaign.domains || []).find(x => x && x.id === st.id);
    if(!d) return null;
    const seat = (campaign.hexes || []).find(h => h && h.domainId === d.id);
    return seat ? seat.id : null;
  }
  return null;
}

// Round to the printed unit-BR grain (nearest 0.5 — RR pp.442–444).
function _roundHalfBr(x){ return Math.round(x * 2) / 2; }

// RR p.462 — a unit's battle rating. A stored brPerSoldier (>0, the GM-override /
// legacy garrison field) wins; else the catalog row: full-strength standard units use
// the PRINTED unit BR (a few veteran rows differ from per-creature × size by design,
// RR p.443 designer's note), understrength/over scale per-creature × active count.
function unitBattleRating(campaign, unit){
  const active = unitActiveCount(unit);
  if(!active) return 0;
  const stored = (typeof unit.brPerSoldier === 'number' && unit.brPerSoldier > 0) ? unit.brPerSoldier : null;
  if(stored != null) return _roundHalfBr(stored * active);
  const row = unitTroopRow(unit);
  if(!row) return 0;
  if(active === row.unitSize && row.unitBattleRating != null) return row.unitBattleRating;
  return _roundHalfBr(row.brPerCreature * active);
}

// Resolve a Group's TROOP_CATALOG row when it's drawn from trained militia in revolt
// (groupTemplate.troopTypeKey set — RR p.433; #476 E10). Mirrors unitTroopRow(unit).
function _groupTroopRow(group){
  const tpl = group && group.groupTemplate;
  if(!tpl || !tpl.troopTypeKey || !global.ACKS || typeof global.ACKS.findTroopType !== 'function') return null;
  return global.ACKS.findTroopType(tpl.troopTypeKey, {
    race: tpl.troopRace || 'man', veteran: !!tpl.troopVeteran, loadout: tpl.troopLoadout || null
  });
}
// The Group side of the shared battle interface: per-creature battleRating × active count.
// This is how a monster band, an E10 banditry band, or a lair's defenders price into the
// JJ pp.104–106 mass-combat layer — no promotion to Unit needed. A militia-drawn banditry
// band (RR p.433) reads the TROOP_CATALOG instead of the MM — "heavily armed, well trained
// forces rather than peasant rabble"; an ordinary band reads the MM via monsterCatalogKey.
function groupBattleRating(campaign, group){
  const active = groupActiveCount(group);
  if(!active) return 0;
  const tpl = group && group.groupTemplate;
  if(tpl && tpl.troopTypeKey){
    const row = _groupTroopRow(group);
    if(row && typeof row.brPerCreature === 'number') return _roundHalfBr(row.brPerCreature * active);
  }
  const key = tpl && tpl.monsterCatalogKey;
  const m = key && global.ACKS && typeof global.ACKS.findMonster === 'function' ? global.ACKS.findMonster(key) : null;
  if(!m || typeof m.battleRating !== 'number') return 0;
  return _roundHalfBr(m.battleRating * active);
}

// Per-soldier monthly wage: stored monthlyWage (>0) wins, else the catalog row's wage.
// Elite troops (RR p.434, behind the `elite-troops` rule): +1gp per full 6gp of regular
// wage, minimum +3gp. 🔧 "per every 6gp" read as floor(wage/6).
function unitWagePerSoldier(campaign, unit){
  if(!unit) return 0;
  const stored = (typeof unit.monthlyWage === 'number' && unit.monthlyWage > 0) ? unit.monthlyWage : null;
  const row = stored == null ? unitTroopRow(unit) : null;
  let wage = stored != null ? stored : (row ? row.wageGpMonth : 0);
  if(unit.elite && ACKS.isHouseRuleEnabled(campaign, 'elite-troops')){
    wage += Math.max(3, Math.floor(wage / 6));
  }
  return wage;
}

// Monthly wage bill: active soldiers × per-soldier wage (dead mercenaries collect no wages).
function unitWageMonthly(campaign, unit){
  return unitActiveCount(unit) * unitWagePerSoldier(campaign, unit);
}

// RR p.450 — weekly supply cost for the unit at its scale. The catalog row carries the
// PRINTED company-scale weekly cost (carnivore-correct, e.g. wolf riders 480gp); other
// scales multiply by the RR p.437 scale factor. Rowless units fall back to the generic
// scale table by category. Supply is per unit regardless of understrength (RAW).
function unitWeeklySupplyCost(campaign, unit){
  if(!unit || !global.ACKS) return 0;
  const scaleRowFn = global.ACKS.scaleRow, costFn = global.ACKS.unitScaleSupplyCost;
  const sc = (typeof scaleRowFn === 'function') ? scaleRowFn(unit.scale || 'company') : null;
  const mult = sc && sc.multiplier ? sc.multiplier : 1;
  const row = unitTroopRow(unit);
  if(row && row.unitSupplyWeekly != null) return row.unitSupplyWeekly * mult;
  const category = (row && row.category) || (unit.category) || 'infantry';
  const base = (typeof costFn === 'function') ? costFn(category === 'infantry' ? 'infantry' : 'cavalry', unit.scale || 'company') : null;
  return base != null ? base : 0;
}

// Unit morale score: the catalog row's morale (veteran rows carry the veteran value;
// a veteran flag without a veteran row adds the RR p.430 +1), plus the stored
// moraleAdjustment (the one-time levy ±1 from domain morale, GM tweaks).
function unitMoraleScore(campaign, unit){
  if(!unit) return 0;
  let base = null;
  const row = unitTroopRow(unit);
  if(row && typeof row.morale === 'number'){
    base = row.morale;
  } else if(global.ACKS && typeof global.ACKS.mercMorale === 'function'){
    const m = global.ACKS.mercMorale(unit.unitTypeKey, unit.race || 'man');
    if(typeof m === 'number') base = m;
    if(base != null && unit.veteran) base += 1;   // no veteran row resolved — apply the RAW +1
  }
  if(base == null) base = 0;
  return base + (unit.moraleAdjustment || 0);
}

// ─── Officer characteristics (RR pp.435–437 + p.171) — pure derived reads on Character.
//     A character with numeric abilities uses the PC/NPC formulas; one without (a monster
//     leader) uses the monster formulas off its hitDice. ───

function _hdLead(hd){ const m = String(hd == null ? '' : hd).match(/-?\d+/); return m ? +m[0] : 0; }
function _isMonsterOfficer(c){ return !(c && c.abilities && typeof c.abilities.CHA === 'number'); }

// Sum of proficiency ranks for a named proficiency. An entry's rank = its trailing
// number ("Military Strategy 2" = 2 ranks) or 1; repeated entries sum (the E5
// tracking-ranks convention — count entries — generalized for the officer table's
// single-entry-with-rank style).
function proficiencyRanks(character, name){
  // PT-0: the canonical accessor lives in acks-engine-proficiencies.js — it reads the {key,ranks}
  // shape AND legacy strings, alias-folds the name, and folds class-power equivalents. Delegate to it
  // when loaded; the trailing-number parser below is the standalone-engine fallback. (The guard
  // canon !== proficiencyRanks prevents self-recursion when this engine's own export is the one on ACKS.)
  const canon = global.ACKS && global.ACKS.proficiencyRanks;
  if(typeof canon === 'function' && canon !== proficiencyRanks) return canon(character, name);
  if(!character || !Array.isArray(character.proficiencies) || !name) return 0;
  const want = String(name).toLowerCase().replace(/-/g, ' ');
  let ranks = 0;
  for(const p of character.proficiencies){
    if(p && typeof p === 'object' && typeof p.ranks === 'number'){       // canonical {key,ranks} entry
      const k = String(p.key || p.name || p.label || '').toLowerCase().replace(/-/g, ' ');
      if(k === want) ranks += p.ranks;
      continue;
    }
    const s = (typeof p === 'string' ? p : (p && (p.name || p.key)) || '').trim().toLowerCase().replace(/-/g, ' ');
    if(!s.startsWith(want)) continue;
    const rest = s.slice(want.length).trim();
    if(rest && !/^\d+$/.test(rest)) continue;       // "Command" must not match "Commanding Presence"
    ranks += rest ? +rest : 1;
  }
  return ranks;
}
function hasProficiencyNamed(character, name){ return proficiencyRanks(character, name) >= 1; }

// RR p.435 — leadership ability: units controllable at once / divisions per army.
// Character: 4 + CHA mod (+1 Leadership proficiency; −1 using an adjutant), max 8.
// Monster: 3 + HD/4 (rounded down), max 8.
function leadershipAbility(character, opts){
  const o = opts || {};
  let la;
  if(_isMonsterOfficer(character)){
    la = 3 + Math.floor(_hdLead(character && character.hitDice) / 4);
  } else {
    la = 4 + ACKS.abilityMod(character.abilities.CHA)
       + (hasProficiencyNamed(character, 'Leadership') ? 1 : 0)
       - (o.usingAdjutant ? 1 : 0);
  }
  return Math.min(8, la);
}

// RR p.436 — strategic ability: better-of(INT, WIL) bonus (min 0) + worse-of penalty
// (max 0) + Military Strategy ranks; clamped [−3, +6]. Monster: HD/5 (rounded down)
// ± intelligence tier (opts.monsterIntelligence: 'sub' −1 | 'high' +1 | 'super' +2).
function strategicAbility(character, opts){
  const o = opts || {};
  let sa;
  if(_isMonsterOfficer(character)){
    sa = Math.floor(_hdLead(character && character.hitDice) / 5);
    if(o.monsterIntelligence === 'sub') sa -= 1;
    if(o.monsterIntelligence === 'high') sa += 1;
    if(o.monsterIntelligence === 'super') sa += 2;
  } else {
    const intMod = ACKS.abilityMod(character.abilities.INT || 10);
    const wilMod = ACKS.abilityMod(character.abilities.WIL || 10);
    sa = Math.max(0, Math.max(intMod, wilMod)) + Math.min(0, Math.min(intMod, wilMod))
       + proficiencyRanks(character, 'Military Strategy');
  }
  return ACKS.clamp(sa, -3, 6);
}

// RR p.436 — a commander with an adjutant may use the adjutant's SA − 1 in place of
// his own. Returns the better arrangement: { value, usingAdjutant } (using the adjutant
// costs −1 morale modifier — officerMoraleModifier reads the flag).
function effectiveStrategicAbility(commander, adjutant, opts){
  const own = strategicAbility(commander, opts);
  if(!adjutant) return { value: own, usingAdjutant: false };
  const loan = strategicAbility(adjutant, opts) - 1;
  return loan > own ? { value: loan, usingAdjutant: true } : { value: own, usingAdjutant: false };
}

// RR p.436 — morale modifier (Unit Morale rolls, NOT Unit Loyalty): CHA mod
// (+1 battlefield prowess — 5th+ barbarian/bard/explorer/fighter/paladin or the class
// power; +2 Command proficiency; −1 using an adjutant). Monster: 0 unless the MM grants
// an "as long as X is alive" bonus (opts.monsterMoraleBonus).
function officerMoraleModifier(character, opts){
  const o = opts || {};
  if(_isMonsterOfficer(character)){
    return (typeof o.monsterMoraleBonus === 'number' ? o.monsterMoraleBonus : 0) - (o.usingAdjutant ? 1 : 0);
  }
  const cls = String(character.class || '').toLowerCase();
  const prowessClass = /barbarian|bard|explorer|fighter|paladin/.test(cls);
  const prowessPower = Array.isArray(character.classPowers) &&
    character.classPowers.some(p => /battlefield prowess/i.test(typeof p === 'string' ? p : (p && p.name) || ''));
  return ACKS.abilityMod(character.abilities.CHA)
    + (((prowessClass && (character.level || 0) >= 5) || prowessPower) ? 1 : 0)
    + (hasProficiencyNamed(character, 'Command') ? 2 : 0)
    - (o.usingAdjutant ? 1 : 0);
}

// RR p.437 — scale-dependent officer qualification. Characters check level against the
// Army Organization and Size table; monsters need HD ≥ the commanded unit's average HD
// + the scale threshold (pass opts.unitAvgHd; without it a monster check returns null =
// "Judge decides"). Beastman chieftain/sub-chieftain waivers stay a GM call (RR p.437).
function qualifiesAsOfficer(character, role, scale, opts){
  const o = opts || {};
  const sc = (global.ACKS && typeof global.ACKS.scaleRow === 'function') ? global.ACKS.scaleRow(scale || 'company') : null;
  if(!sc) return null;
  const qual = role === 'lieutenant' ? sc.lieutenantQual : sc.commanderQual;
  if(_isMonsterOfficer(character)){
    if(typeof o.unitAvgHd !== 'number') return null;
    return _hdLead(character && character.hitDice) >= o.unitAvgHd + (qual.monsterHdOver || 0);
  }
  return (character.level || 0) >= (qual.npcLevel || 0);
}
function qualifiesAsCommander(character, scale, opts){ return qualifiesAsOfficer(character, 'commander', scale, opts); }
function qualifiesAsLieutenant(character, scale, opts){ return qualifiesAsOfficer(character, 'lieutenant', scale, opts); }

// ─── Army derived reads ───

function _findCharacterById(campaign, characterId){
  if(!campaign || !Array.isArray(campaign.characters) || !characterId) return null;
  return campaign.characters.find(c => c && c.id === characterId) || null;
}

// RR pp.462–463 — army BR: Σ unit BRs, rounded down; the leader's strategic ability
// adds +0.5 per unit at SA ≥ +3 and +1.0 per unit at SA ≥ +5.
function armyBattleRating(campaign, army){
  const units = armyUnits(campaign, army);
  let br = units.reduce((s, u) => s + unitBattleRating(campaign, u), 0);
  const leader = army && army.leaderCharacterId ? _findCharacterById(campaign, army.leaderCharacterId) : null;
  if(leader){
    const sa = strategicAbility(leader);
    if(sa >= 5) br += units.length * 1.0;
    else if(sa >= 3) br += units.length * 0.5;
  }
  return Math.floor(br);
}

function armyWageMonthly(campaign, army){
  return armyUnits(campaign, army).reduce((s, u) => s + unitWageMonthly(campaign, u), 0);
}

function armyWeeklySupplyCost(campaign, army){
  return armyUnits(campaign, army).reduce((s, u) => s + unitWeeklySupplyCost(campaign, u), 0);
}

// RR p.435 — max divisions = the leader's leadership ability.
function armyMaxDivisions(campaign, army){
  const leader = army && army.leaderCharacterId ? _findCharacterById(campaign, army.leaderCharacterId) : null;
  return leader ? leadershipAbility(leader) : 0;
}

// Pure organization diagnostic (RR pp.434–437; engine-enforced findings, GM-overridable
// per RAW's waiver clause — a validation surface, never an auto-mutation).
function validateArmyOrganization(campaign, army){
  const findings = [];
  if(!army) return findings;
  const units = armyUnits(campaign, army);
  const leader = army.leaderCharacterId ? _findCharacterById(campaign, army.leaderCharacterId) : null;
  if(!leader) findings.push({ code: 'no-leader', text: 'Army has no leader' });
  if(units.length < 3) findings.push({ code: 'under-3-units', text: 'An army must have at least 3 units (RR p.435) — has ' + units.length });
  const divisions = Array.isArray(army.divisions) ? army.divisions : [];
  if(leader && divisions.length > leadershipAbility(leader)){
    findings.push({ code: 'too-many-divisions', text: divisions.length + ' divisions exceed the leader\'s leadership ability ' + leadershipAbility(leader) + ' (RR p.435)' });
  }
  const totalTroops = units.reduce((s, u) => s + unitActiveCount(u), 0);
  const scale = (global.ACKS && global.ACKS.armyScaleForSize) ? global.ACKS.armyScaleForSize(totalTroops) : 'company';
  const seenUnitIds = new Set();
  for(const dv of divisions){
    if(!dv) continue;
    const dvUnits = Array.isArray(dv.unitIds) ? dv.unitIds : [];
    for(const uid of dvUnits){
      if(seenUnitIds.has(uid)) findings.push({ code: 'unit-in-two-divisions', text: 'Unit ' + uid + ' appears in more than one division' });
      seenUnitIds.add(uid);
      const u = findUnit(campaign, uid);
      if(!u) findings.push({ code: 'division-unknown-unit', text: (dv.name || 'Division') + ' lists unknown unit ' + uid });
      else if(!u.stationedAt || u.stationedAt.kind !== 'army' || u.stationedAt.id !== army.id){
        findings.push({ code: 'division-unit-not-stationed', text: (u.displayName || uid) + ' is in ' + (dv.name || 'a division') + ' but not stationed to this army' });
      }
    }
    const cmdr = dv.commanderCharacterId ? _findCharacterById(campaign, dv.commanderCharacterId) : null;
    if(!cmdr) findings.push({ code: 'division-no-commander', text: (dv.name || 'Division') + ' has no commander (RR p.435)' });
    else {
      const q = qualifiesAsCommander(cmdr, scale);
      if(q === false) findings.push({ code: 'commander-unqualified', text: (cmdr.name || 'Commander') + ' does not qualify to command at ' + scale + ' scale (RR p.437)' });
      if(dvUnits.length > leadershipAbility(cmdr, { usingAdjutant: !!dv.adjutantCharacterId })){
        findings.push({ code: 'commander-over-leadership', text: (dv.name || 'Division') + ' has ' + dvUnits.length + ' units, over ' + (cmdr.name || 'the commander') + '\'s leadership ability (RR p.435)' });
      }
    }
  }
  for(const u of units){
    if(!seenUnitIds.has(u.id)) findings.push({ code: 'unit-no-division', text: (u.displayName || u.id) + ' is stationed to the army but assigned to no division' });
  }
  return findings;
}

// ─── Phase 3 Military W2 — the Vagaries of Incursion derived reads (JJ pp.100–106) ───
// All derive-don't-store (§3.13): territory, borders, classification demotion, the daily
// chance, and the platoon-scale BR comparison are pure reads over the campaign; the only
// stored state W2 adds is d.dangerousBordersOverride (the GM's judgment lever),
// d.incursionXenophobiaPending (the JJ p.103 one-shot −1) and group.incursion (the
// materialized band's verdict bundle).

// How many 6-mile hexes the domain holds: authored hexes are the truth when the map
// carries any; legacy aggregate domains fall back to geography.controlledHexes.
function domainTerritoryHexCount(campaign, d){
  if(!d) return 1;
  const authored = ((campaign && campaign.hexes) || []).filter(h => h && h.domainId === d.id).length;
  if(authored > 0) return authored;
  return Math.max(1, (d.geography && d.geography.controlledHexes) || 1);
}

// JJ p.102 — is the domain's border dangerous, and in which configuration? RAW frames
// this as a judgment from the regional geography; the derivation reads the hex map:
// a border face is SECURE when the neighbour belongs to any domain, is water
// (impassable), or the shared edge carries a river (RAW's own "a domain with a broad
// river … is far easier to defend" — the §24 effect-3 note, closed here); otherwise it
// is dangerous (unsettled or unauthored land — a frontier is exposed even where the GM
// hasn't authored the wilds). The dangerous fraction of border faces maps onto RAW's
// four illustrations (🔧 heuristic: 0 → secure · ≤⅓ → line · ≤½ → flank · <1 →
// spearhead · all → isolated); d.dangerousBordersOverride (one of
// BORDER_CONFIGURATIONS) outranks the heuristic, exactly as printed. A mapless domain
// derives 'secure' (no inflation without geography).
function domainBorderConfiguration(campaign, d){
  const A = global.ACKS || {};
  const out = { configuration: 'secure', source: 'derived', dangerousFaces: 0, borderFaces: 0 };
  if(!d) return out;
  const hexes = ((campaign && campaign.hexes) || []).filter(h => h && h.domainId === d.id && h.coord);
  if(hexes.length){
    const byCoord = new Map();
    for(const h of ((campaign && campaign.hexes) || [])){ if(h && h.coord) byCoord.set(h.coord.q + ',' + h.coord.r, h); }
    // HEX_EDGE_DELTAS order (the map convention — riverSides indices key off it)
    const deltas = [[1,0],[0,1],[-1,1],[-1,0],[0,-1],[1,-1]];
    let dangerous = 0, total = 0;
    for(const h of hexes){
      for(let side = 0; side < 6; side++){
        const n = byCoord.get((h.coord.q + deltas[side][0]) + ',' + (h.coord.r + deltas[side][1])) || null;
        if(n && n.domainId === d.id) continue;                 // internal face
        total++;
        let secure = false;
        if(n && n.domainId){
          secure = true;                                       // a neighbouring domain holds it
          // JJ p.102 (AD-C) — but a neighbour whose domain harbours a stocked dungeon counts as
          // UNSETTLED (a monster-farm radiates danger). Late-bound (sanctums.js loads after this).
          const ddf = A.domainIsDungeonDangerousForNeighbours;
          if(typeof ddf === 'function' && ddf(campaign, n.domainId)) secure = false;
        }
        else if(n){
          const base = (typeof A.terrainBase === 'function') ? A.terrainBase(n.terrain) : n.terrain;
          if(base === 'water') secure = true;                  // impassable terrain
        }
        const opp = (side + 3) % 6;
        if(!secure && Array.isArray(h.riverSides) && h.riverSides.indexOf(side) >= 0) secure = true;
        if(!secure && n && Array.isArray(n.riverSides) && n.riverSides.indexOf(opp) >= 0) secure = true;
        if(!secure) dangerous++;
      }
    }
    out.borderFaces = total; out.dangerousFaces = dangerous;
    if(total > 0 && dangerous > 0){
      const f = dangerous / total;
      out.configuration = (dangerous >= total) ? 'isolated'
        : (f > 0.5)   ? 'spearhead'
        : (f > 1 / 3) ? 'flank'
        : 'line';
    }
  }
  const override = d.dangerousBordersOverride;
  const cfgList = (A.BORDER_CONFIGURATIONS || ['secure', 'line', 'flank', 'spearhead', 'isolated']);
  if(override && cfgList.indexOf(String(override).toLowerCase()) >= 0){
    out.configuration = String(override).toLowerCase();
    out.source = 'override';
  }
  return out;
}

// JJ p.102 — actual territory + border configuration → the effective territory size
// the encounter throw reads.
function domainEffectiveTerritory(campaign, d){
  const A = global.ACKS || {};
  const actual = domainTerritoryHexCount(campaign, d);
  const cfg = domainBorderConfiguration(campaign, d);
  const effective = (typeof A.effectiveTerritoryWithBorders === 'function')
    ? A.effectiveTerritoryWithBorders(actual, cfg.configuration)
    : actual;
  return { actualHexes: actual, effectiveHexes: effective, configuration: cfg.configuration,
           configurationSource: cfg.source, dangerousFaces: cfg.dangerousFaces, borderFaces: cfg.borderFaces };
}

// JJ p.102 — an insufficient garrison and/or stronghold reads the domain one
// classification worse for domain encounters (civilized → borderlands → outlands →
// unsettled; the printed example demotes a bankrupt outlands domain to unsettled).
// Garrison sufficiency uses the same effective spend the morale adequacy sees
// (garrisonCost + scutage paid this month, RR p.347); stronghold sufficiency is value
// vs the RR p.349 per-hex requirement.
function domainIncursionClassification(campaign, d){
  const A = global.ACKS || {};
  const base = String(ACKS.effectiveDomainClassification(d) || 'Outlands').toLowerCase();
  const garrSpend = ((typeof A.garrisonCost === 'function') ? A.garrisonCost(campaign, d) : 0)
    + ((typeof A.scutagePaidThisMonth === 'function') ? A.scutagePaidThisMonth(campaign, d) : 0);
  const garrReq = (typeof A.requiredGarrison === 'function') ? A.requiredGarrison(campaign, d) : 0;
  const insufficientGarrison = garrReq > 0 && garrSpend < garrReq;
  const shReq = (typeof A.strongholdRequired === 'function') ? A.strongholdRequired(d) : 0;
  const shVal = (typeof A.strongholdValue === 'function') ? A.strongholdValue(campaign, d) : 0;
  const insufficientStronghold = shReq > 0 && shVal < shReq;
  const ladder = ['civilized', 'borderlands', 'outlands', 'unsettled'];
  let idx = ladder.indexOf(base); if(idx < 0) idx = 2;
  const demoted = insufficientGarrison || insufficientStronghold;
  if(demoted) idx = Math.min(ladder.length - 1, idx + 1);
  return { base, effective: ladder[idx], demoted, insufficientGarrison, insufficientStronghold };
}

// The one read the consumer, the UI and the tests share: the domain's daily domain-
// encounter chance (JJ p.101) off its effective territory + effective classification.
function domainDailyEncounterChance(campaign, d){
  const A = global.ACKS || {};
  const terr = domainEffectiveTerritory(campaign, d);
  const cls = domainIncursionClassification(campaign, d);
  const pct = (typeof A.incursionDailyPct === 'function') ? A.incursionDailyPct(terr.effectiveHexes, cls.effective) : 0;
  return Object.assign({ pct }, terr, cls);
}

// ── JJ p.105 — mass combat for domain encounters runs at PLATOON scale ──
// (units of 30 men / 15 large; per-creature BR is ×4 the company values). The garrison
// prices its actual units; a monster band prices off the MONSTER_CATALOG battleRating
// the same way — the shared battle interface (§5.1), no promotion.
function _roundQuarterBr(x){ return Math.round(x * 4) / 4; }   // the printed platoon-BR grain
// One unit's BR at platoon scale. A stored brPerSoldier (the GM override) wins; else the
// PRINTED company unit BR scaled to the active fraction × the ×4 platoon factor — which
// reproduces the JJ p.105 worked example exactly (60 heavy + 30 light foot → garrison
// BR 5.0); rows with no printed unit BR fall back to per-creature × count × 4.
function unitPlatoonScaleBr(unit){
  if(!unit) return 0;
  const active = unitActiveCount(unit);
  if(!active) return 0;
  const stored = (typeof unit.brPerSoldier === 'number' && unit.brPerSoldier > 0) ? unit.brPerSoldier : null;
  if(stored != null) return stored * active * 4;
  const row = unitTroopRow(unit);
  if(!row) return 0;
  if(row.unitBattleRating != null && row.unitSize > 0) return row.unitBattleRating * (active / row.unitSize) * 4;
  return (row.brPerCreature || 0) * active * 4;
}
function domainGarrisonPlatoonBr(campaign, d){
  const units = domainGarrisonUnits(campaign, d);
  let br = 0;
  for(const u of units){ if(u) br += unitPlatoonScaleBr(u); }
  return _roundQuarterBr(br);
}
// A band of N creatures at platoon scale; null when the creature carries no catalog BR
// (a label-only identity — the GM prices it).
function monsterPlatoonBr(brPerCreature, count){
  if(!(brPerCreature > 0) || !(count > 0)) return null;
  return _roundQuarterBr(brPerCreature * count * 4);
}

// ─── Canonical stationing setter + the garrison/mercenaryCompany lift (rule #10) ───

// Move a unit to a station, maintaining BOTH homes: campaign.units[] (canonical) and
// the legacy nested mirrors (domain.garrison.units[] / character.mercenaryCompany.units[]
// — reference-unified: the same object, never a copy). Passing stationedAt null leaves
// the unit field-stationed nowhere (e.g. an independent band's captured equipment train).
function stationUnit(campaign, unitOrId, stationedAt){
  const unit = (typeof unitOrId === 'string') ? findUnit(campaign, unitOrId) : unitOrId;
  if(!campaign || !unit) return null;
  if(!Array.isArray(campaign.units)) campaign.units = [];
  // Home-on-leaving-garrison capture (2026-06-14): the first time a unit leaves its domain
  // garrison for the field (mustered into an army, called up, sent to a hex), remember that
  // garrison as its home so it knows where to return when its task ends. Only when no home is
  // recorded yet; reads the unit's CURRENT (pre-move) station, so it must run before the move.
  if(!unit.homeHexId){
    const cur = unit.stationedAt;
    const leavingGarrison = cur && cur.kind === 'domain-garrison' && cur.id
      && !(stationedAt && stationedAt.kind === 'domain-garrison' && stationedAt.id === cur.id);
    if(leavingGarrison){
      if(!unit.homeDomainId) unit.homeDomainId = cur.id;
      const hx = unitCurrentHexId(campaign, unit);   // the domain's seat hex (station is still the garrison)
      if(hx) unit.homeHexId = hx;
    }
  }
  const idx = campaign.units.findIndex(u => u && u.id === unit.id);
  if(idx < 0) campaign.units.push(unit);
  else if(campaign.units[idx] !== unit) campaign.units[idx] = unit;
  // Single-home (T6): a unit's station IS unit.stationedAt; campaign.units is the only home.
  // No nested garrison/mercenaryCompany mirror to maintain.
  unit.stationedAt = stationedAt || null;
  return unit;
}

// Remove a unit from the world: campaign.units[] (the single home, T6 — the merge / disband
// destructor, the counterpart of stationUnit). Returns the removed unit or null.
function disbandUnit(campaign, unitOrId){
  const unit = (typeof unitOrId === 'string') ? findUnit(campaign, unitOrId) : unitOrId;
  if(!campaign || !unit) return null;
  // Single-home (T6): campaign.units is the only home — no nested mirror to also splice.
  if(Array.isArray(campaign.units)){
    const i = campaign.units.findIndex(u => u && u.id === unit.id);
    if(i >= 0) campaign.units.splice(i, 1);
  }
  return unit;
}

// ─── Unit home garrison (2026-06-14) ─────────────────────────────────────────
// A unit's HOME is a hex inside its domain — its default garrison station and the place it
// returns to when a task ends (an army disbands). homeDomainId names the owning domain. All
// three read defensively (old units → null = no home set; the prior homeless behavior stands).

// Resolve the domain a unit belongs to: its explicit homeDomainId, else the domain it is
// garrison-stationed at, else the domain owning its home hex. null for a domain-less unit
// (a free mercenary band). Used to scope the home-hex picker + drive the return.
function unitHomeDomainId(campaign, unit){
  if(!campaign || !unit) return null;
  if(unit.homeDomainId) return unit.homeDomainId;
  const st = unit.stationedAt;
  if(st && st.kind === 'domain-garrison' && st.id) return st.id;
  if(unit.homeHexId){
    const h = (campaign.hexes || []).find(x => x && x.id === unit.homeHexId);
    if(h && h.domainId) return h.domainId;
  }
  return null;
}

// Set (hexId) or clear (hexId=null) a unit's home garrison hex. The hex MUST be inside a domain
// ("a hex inside the Domain") — homeDomainId follows the hex's domain. When the unit is sitting
// at home / unassigned (not in an army, not marching) the map hint (stationedAtHexId) snaps to
// the home. Stamps a unit.history entry (the sibling-setter convention — levyConscripts /
// trainLevyUnit stamp history, not a campaign event). Returns {ok, reason, unit}.
function setUnitHome(campaign, unitOrId, hexId){
  const unit = (typeof unitOrId === 'string') ? findUnit(campaign, unitOrId) : unitOrId;
  if(!campaign || !unit) return { ok: false, reason: 'no-unit' };
  const turn = (campaign.currentTurn != null) ? campaign.currentTurn : 0;
  unit.history = unit.history || [];
  if(!hexId){
    unit.homeHexId = null;
    unit.history.push({ turn, type: 'home-cleared', text: 'Home garrison cleared' });
    return { ok: true, unit, cleared: true };
  }
  const hex = (campaign.hexes || []).find(h => h && h.id === hexId);
  if(!hex) return { ok: false, reason: 'no-hex' };
  if(!hex.domainId) return { ok: false, reason: 'hex-not-in-domain' };   // must be inside a domain
  unit.homeHexId = hexId;
  unit.homeDomainId = hex.domainId;
  const st = unit.stationedAt;
  const active = unit.rallyingToArmyId || (st && st.kind === 'army');
  if(!active) unit.stationedAtHexId = hexId;
  const d = (campaign.domains || []).find(x => x && x.id === hex.domainId);
  const hexLabel = (global.ACKS && typeof global.ACKS.hexName === 'function') ? global.ACKS.hexName(hex, campaign) : hexId;
  unit.history.push({ turn, type: 'home-set', text: 'Home garrison set to ' + hexLabel + (d ? (' (' + (d.name || d.id) + ')') : '') });
  return { ok: true, unit };
}

// Send a unit back to its home garrison — the "task ends" return (disbandArmy + the W2
// incursion sally + any future mission-end hook). The symmetric counterpart of callUpUnit:
// when the unit is AWAY from home and a route is plottable, it MARCHES home (a journey with
// unitReturnHome — the same unit-pace march machinery the call-up uses; on arrival
// commitJourneyRecord falls it back into the garrison). When it is already at home, has no
// home hex, or no current hex (can't plot a march), it falls in INSTANTLY. With NO home domain
// at all it is left unstationed (the prior homeless behaviour — backward compatible). Pass
// opts.instant to force the instant return (skip the march). Returns the unit.
function returnUnitHome(campaign, unitOrId, opts){
  opts = opts || {};
  const unit = (typeof unitOrId === 'string') ? findUnit(campaign, unitOrId) : unitOrId;
  if(!campaign || !unit) return null;
  unit.rallyingToArmyId = null; unit.rallyJourneyId = null;
  const homeDomainId = unitHomeDomainId(campaign, unit);
  const hasDomain = homeDomainId && (campaign.domains || []).some(d => d && d.id === homeDomainId);
  const turn = (campaign.currentTurn != null) ? campaign.currentTurn : 0;
  if(!hasDomain){ unit.stationedAt = null; unit.returnJourneyId = null; return unit; }   // no home → homeless
  const homeHexId = unit.homeHexId || (((campaign.hexes || []).find(h => h && h.domainId === homeDomainId)) || {}).id || null;
  const currentHexId = unitCurrentHexId(campaign, unit);
  const A = global.ACKS;
  if(!opts.instant && homeHexId && currentHexId && currentHexId !== homeHexId
     && A && typeof A.blankJourney === 'function'){
    // March home — un-station (the troops take the road) and plot a unit journey to the home hex.
    stationUnit(campaign, unit, null);
    const dName = ((campaign.domains || []).find(d => d && d.id === homeDomainId) || {}).name || 'home';
    const journey = A.blankJourney({ unitId: unit.id, unitReturnHome: true,
      name: (unit.displayName || unit.unitTypeKey || 'unit') + ' → ' + dName,
      startHexId: currentHexId, destinationHexId: homeHexId, participantCharacterIds: [] });
    if(!Array.isArray(campaign.journeys)) campaign.journeys = [];
    campaign.journeys.push(journey);
    if(typeof A.startJourney === 'function') A.startJourney(campaign, journey);
    else journey.status = 'in-transit';
    unit.returnJourneyId = journey.id;
    (unit.history = unit.history || []).push({ turn, type: 'marching-home', text: 'Marching home to its garrison' });
    return unit;
  }
  // Already home / no route / instant → fall in at once.
  stationUnit(campaign, unit, { kind: 'domain-garrison', id: homeDomainId });
  if(unit.homeHexId) unit.stationedAtHexId = unit.homeHexId;
  unit.returnJourneyId = null;
  (unit.history = unit.history || []).push({ turn, type: 'returned-home', text: 'Returned to its home garrison' });
  return unit;
}

// ─── Phase 3 Military — army muster / disband (the canonical CRUD both verbs route
//     through; the in-fiction Muster modal on a character/domain AND the Inspector
//     Admin-verb Create) ──────────────────────────────────────────────────────────
// Push a blank army to campaign.armies; optionally seat a leader, name it, place it on a
// hex, set its stance, and STATION a starting roster (unitIds → stationUnit to
// {kind:'army', id} — stationUnit handles the garrison/merc-company mirror bookkeeping).
// When a leader + units are given it auto-builds a single "Main Body" division led by the
// commander — the RAW-minimal valid org (RR p.435: a small army is one division led by its
// commander; the GM splits into more divisions later). validateArmyOrganization surfaces
// an under-qualified commander or too-few units as advisory findings (GM-overridable per
// RAW's waiver clause). id-stable (opts.id returns the existing army — the createLair
// idempotency pattern). Stamps an army.history 'mustered' entry. Returns the army.
function createArmy(campaign, opts={}){
  if(!campaign) return null;
  if(!Array.isArray(campaign.armies)) campaign.armies = [];
  if(opts.id){
    const ex = campaign.armies.find(a => a && a.id === opts.id);
    if(ex) return ex;
  }
  const army = global.ACKS.blankArmy({
    id: opts.id,
    name: opts.name || '',
    leaderCharacterId: opts.leaderCharacterId || null,
    currentHexId: opts.currentHexId || null,
    strategicStance: opts.strategicStance || 'defensive'
  });
  campaign.armies.push(army);
  const unitIds = Array.isArray(opts.unitIds) ? opts.unitIds.filter(Boolean) : [];
  const stationed = [];
  for(const uid of unitIds){
    const u = stationUnit(campaign, uid, { kind: 'army', id: army.id });
    if(u) stationed.push(u.id);
  }
  if(army.leaderCharacterId && stationed.length){
    army.divisions = [{ name: 'Main Body', commanderCharacterId: army.leaderCharacterId, adjutantCharacterId: null, unitIds: stationed, role: 'main' }];
  }
  // Distant units called up rather than teleported: each marches to the muster point
  // (callUpUnit plots a rally journey; a co-located one just joins). The army has its
  // hex set above, so the rally march can be plotted.
  const callUp = Array.isArray(opts.callUpUnitIds) ? opts.callUpUnitIds.filter(Boolean) : [];
  let marching = 0;
  for(const uid of callUp){
    const r = callUpUnit(campaign, uid, army);
    if(r && r.action === 'marching') marching++;
    else if(r && r.action === 'joined' && !stationed.includes(uid)) stationed.push(uid);
  }
  const turn = (campaign.currentTurn != null) ? campaign.currentTurn : 0;
  army.history.push({ turn, type: 'mustered', text: 'Mustered' + (opts.name ? ' as ' + opts.name : '') + (stationed.length ? ' with ' + stationed.length + ' unit' + (stationed.length === 1 ? '' : 's') : '') + (marching ? ' (' + marching + ' marching in)' : '') });
  return army;
}

// Disband an army: send its units home (returnUnitHome — they return to their home garrison
// when one is recorded, else SURVIVE in campaign.units unstationed; either way the next
// muster's available-units list surfaces them, closing the loop), stop its march (the journey
// is marked disbanded), and splice it from campaign.armies. Returns the removed army or null.
// The counterpart of createArmy.
function disbandArmy(campaign, armyOrId){
  const army = (typeof armyOrId === 'string') ? findArmy(campaign, armyOrId) : armyOrId;
  if(!campaign || !army) return null;
  for(const u of armyUnits(campaign, army)){ if(u) returnUnitHome(campaign, u); }
  if(army.journeyId && Array.isArray(campaign.journeys)){
    const j = campaign.journeys.find(x => x && x.id === army.journeyId);
    if(j) j.status = 'disbanded';
  }
  if(Array.isArray(campaign.armies)){
    const i = campaign.armies.findIndex(a => a && a.id === army.id);
    if(i >= 0) campaign.armies.splice(i, 1);
  }
  return army;
}

// Call up a unit to an army's muster point (the hard-constraint alternative to teleporting
// troops in). If the unit is already AT the army's hex (or the army/unit has no resolvable
// hex), it joins immediately. Otherwise the unit LEAVES its garrison (un-stationed — the
// troops have marched out) and a rally journey is plotted from its hex to the muster point;
// `unit.rallyingToArmyId` marks it incoming. It is NOT counted in the army's present strength
// until the journey arrives (commitJourneyRecord stations it then). Returns
// {action:'joined'|'marching'|'error', unitId, journeyId?, journey?}.
function callUpUnit(campaign, unitOrId, armyOrId){
  const unit = (typeof unitOrId === 'string') ? findUnit(campaign, unitOrId) : unitOrId;
  const army = (typeof armyOrId === 'string') ? findArmy(campaign, armyOrId) : armyOrId;
  if(!campaign || !unit || !army) return { action: 'error', reason: 'missing' };
  const dest = army.currentHexId || null;
  const origin = unitCurrentHexId(campaign, unit);
  if(!dest || !origin || origin === dest){
    stationUnit(campaign, unit, { kind: 'army', id: army.id });
    unit.rallyingToArmyId = null; unit.rallyJourneyId = null;
    return { action: 'joined', unitId: unit.id };
  }
  const A = global.ACKS;
  stationUnit(campaign, unit, null);   // the troops leave their garrison and take the road
  const name = (unit.displayName || unit.unitTypeKey || 'unit') + ' → ' + (army.name || 'the army');
  const journey = A.blankJourney({ unitId: unit.id, name, startHexId: origin, destinationHexId: dest, participantCharacterIds: [] });
  if(!Array.isArray(campaign.journeys)) campaign.journeys = [];
  campaign.journeys.push(journey);
  if(typeof A.startJourney === 'function') A.startJourney(campaign, journey);
  else journey.status = 'in-transit';
  unit.rallyingToArmyId = army.id; unit.rallyJourneyId = journey.id;
  return { action: 'marching', unitId: unit.id, journeyId: journey.id, journey };
}

// The units MARCHING IN to an army (rallyingToArmyId === army.id) — each with its rally
// journey + the distance still to cover (miles / hexes / days at the unit's own pace). The
// army card's "reinforcements marching in" readout. Pure derived read.
function armyIncomingUnits(campaign, army){
  if(!campaign || !army || !Array.isArray(campaign.units)) return [];
  const A = global.ACKS;
  const milesPerHex = (A && A.JOURNEY_MILES_PER_HEX) || 6;
  return campaign.units.filter(u => u && u.rallyingToArmyId === army.id).map(u => {
    const j = u.rallyJourneyId ? (campaign.journeys || []).find(x => x && x.id === u.rallyJourneyId) : null;
    let hexes = null, miles = null, days = null;
    if(j && A && typeof A.computeJourneyDistance === 'function'){
      const d = A.computeJourneyDistance(campaign, j);
      hexes = Math.max(0, (d.total || 0) - (d.covered || 0));
      miles = hexes * milesPerHex;
      const spd = unitMarchMilesPerDay(u);
      days = (spd > 0) ? Math.ceil(miles / spd) : null;
    }
    return { unit: u, journey: j, hexesRemaining: hexes, milesRemaining: miles, daysRemaining: days, fromHexId: j ? j.startHexId : null };
  });
}

// ─── Add / remove a unit from a field army (the Garrison-table membership verbs, 2026-06-17) ──
// Add a unit to an army it is CO-LOCATED with — the quick join the Garrison Units table offers,
// distinct from callUpUnit (which MARCHES a distant unit to the muster point). RAW: troops don't
// teleport, so the add requires the unit to stand at the army's hex (the UI only offers armies at
// the unit's location via armiesAtHex; the engine guards it too — a staging army with no hex set
// yet is allowed). Stations the unit to the army (stationUnit handles the garrison/merc-company
// mirror bookkeeping + the home-on-leaving-garrison capture), clears any rally flags, and slots it
// into a division so the org chart agrees with stationedAt (the Main Body / first division, or a
// fresh Main Body when the army has a leader but no divisions yet — else stationedAt alone suffices
// and validateArmyOrganization flags the no-division unit, exactly as a called-up reinforcement
// reads). Stamps unit + army history (the muster/levy convention — not a campaign event). Returns
// {ok, reason?, unit, army}.
function addUnitToArmy(campaign, unitOrId, armyOrId){
  const unit = (typeof unitOrId === 'string') ? findUnit(campaign, unitOrId) : unitOrId;
  const army = (typeof armyOrId === 'string') ? findArmy(campaign, armyOrId) : armyOrId;
  if(!campaign || !unit) return { ok: false, reason: 'no-unit' };
  if(!army) return { ok: false, reason: 'no-army' };
  if(unit.stationedAt && unit.stationedAt.kind === 'army' && unit.stationedAt.id === army.id) return { ok: false, reason: 'already-in-army' };
  const unitHex = unitCurrentHexId(campaign, unit);
  const armyHex = army.currentHexId || null;
  if(armyHex && unitHex && unitHex !== armyHex) return { ok: false, reason: 'not-co-located' };
  stationUnit(campaign, unit, { kind: 'army', id: army.id });   // mirror bookkeeping + home capture
  unit.rallyingToArmyId = null; unit.rallyJourneyId = null;
  if(!Array.isArray(army.divisions)) army.divisions = [];
  let div = army.divisions.find(d => d && d.role === 'main') || army.divisions[0] || null;
  if(!div && army.leaderCharacterId){
    div = { name: 'Main Body', commanderCharacterId: army.leaderCharacterId, adjutantCharacterId: null, unitIds: [], role: 'main' };
    army.divisions.push(div);
  }
  if(div){
    if(!Array.isArray(div.unitIds)) div.unitIds = [];
    if(!div.unitIds.includes(unit.id)) div.unitIds.push(unit.id);
  }
  const turn = (campaign.currentTurn != null) ? campaign.currentTurn : 0;
  const uname = unit.displayName || unit.unitTypeKey || 'a unit';
  (army.history = army.history || []).push({ turn, type: 'unit-joined', text: uname + ' joined the army' });
  (unit.history = unit.history || []).push({ turn, type: 'joined-army', text: 'Joined ' + (army.name || 'the army') });
  return { ok: true, unit, army };
}

// Remove a unit from its army — the Garrison-table "leave army" verb. Per the GM's choice
// (2026-06-17) the unit is LEFT WHERE THE ARMY STANDS: detached at the army's current hex as a
// free-standing unit (stationedAt {kind:'hex'}), NOT marched home (the army-card Recall is the
// march-home path); it is pulled from the army's division org chart too. A unit only MARCHING IN
// (rallyingToArmyId, not yet arrived) has its call-up cancelled instead — the rally journey is
// stopped and it returns to its home garrison at once (it never reached the army, so "where the
// army stands" doesn't apply). "Remove anywhere": no co-location constraint. Stamps history.
// Returns {ok, reason?, unit, army?, leftAtHexId?, cancelledRally?}.
function removeUnitFromArmy(campaign, unitOrId){
  const unit = (typeof unitOrId === 'string') ? findUnit(campaign, unitOrId) : unitOrId;
  if(!campaign || !unit) return { ok: false, reason: 'no-unit' };
  const turn = (campaign.currentTurn != null) ? campaign.currentTurn : 0;
  const uname = unit.displayName || unit.unitTypeKey || 'a unit';
  if(unit.rallyingToArmyId){   // marching in, not yet arrived → cancel the call-up + fall home
    const army = findArmy(campaign, unit.rallyingToArmyId);
    if(unit.rallyJourneyId && Array.isArray(campaign.journeys)){
      const j = campaign.journeys.find(x => x && x.id === unit.rallyJourneyId);
      if(j) j.status = 'disbanded';
    }
    unit.rallyingToArmyId = null; unit.rallyJourneyId = null;
    returnUnitHome(campaign, unit, { instant: true });
    (unit.history = unit.history || []).push({ turn, type: 'call-up-cancelled', text: 'Call-up cancelled — returned home' });
    if(army) (army.history = army.history || []).push({ turn, type: 'unit-removed', text: uname + ' was recalled before it mustered' });
    return { ok: true, unit, army, cancelledRally: true };
  }
  const st = unit.stationedAt;
  if(!st || st.kind !== 'army') return { ok: false, reason: 'not-in-army' };
  const army = findArmy(campaign, st.id);
  const leftAtHexId = (army && army.currentHexId) || null;
  if(army && Array.isArray(army.divisions)){
    for(const d of army.divisions){
      if(d && Array.isArray(d.unitIds)){
        const i = d.unitIds.indexOf(unit.id);
        if(i >= 0) d.unitIds.splice(i, 1);
      }
    }
  }
  stationUnit(campaign, unit, leftAtHexId ? { kind: 'hex', id: leftAtHexId } : null);   // left where the army stands
  (unit.history = unit.history || []).push({ turn, type: 'left-army', text: 'Left ' + ((army && army.name) || 'the army') });
  if(army) (army.history = army.history || []).push({ turn, type: 'unit-removed', text: uname + ' left the army' });
  return { ok: true, unit, army, leftAtHexId };
}

// Send a lone unit on a free march — the Garrison-table "March" verb (2026-06-17). Like setting
// up a Journey from the unit's current location to any destination hex, but at unit scale: no
// participants (it's a formation, not a party) and no supply line (supply is army-only — a lone
// unit just carries what it carries). It rides the SHARED journey engine (journey.unitId), so the
// Journey Detail panel renders it group-aware (journeyGroupKind → 'unit' → "the unit's march
// pace", no party rations / no army supplies) and the GM can re-route it on the map exactly like
// any journey. The troops leave their garrison (un-stationed — the home is captured by stationUnit
// for the return trip); on arrival commitJourneyRecord halts the unit at the destination hex (the
// free-march arrival branch). Distinct from callUpUnit (marches to an ARMY's muster) and
// returnUnitHome (marches to the HOME garrison) — this marches to a GM-chosen hex. opts:
// {destinationHexId (required), waypointHexIds?, pace?}. Returns {ok, reason?, journey?}.
function startUnitMarch(campaign, unitOrId, opts){
  opts = opts || {};
  const unit = (typeof unitOrId === 'string') ? findUnit(campaign, unitOrId) : unitOrId;
  if(!campaign || !unit) return { ok: false, reason: 'no-unit' };
  if(unit.stationedAt && unit.stationedAt.kind === 'army') return { ok: false, reason: 'in-army' };  // moves with the army
  if(unit.rallyingToArmyId) return { ok: false, reason: 'already-marching' };                         // called up to a muster
  const liveMarch = unit.marchJourneyId && (campaign.journeys || []).some(j => j && j.id === unit.marchJourneyId && j.status === 'in-transit');
  if(liveMarch) return { ok: false, reason: 'already-marching' };
  const dest = opts.destinationHexId || null;
  if(!dest) return { ok: false, reason: 'no-destination' };
  const origin = unitCurrentHexId(campaign, unit);
  if(!origin) return { ok: false, reason: 'no-position' };
  if(origin === dest) return { ok: false, reason: 'already-there' };
  const A = global.ACKS;
  if(!A || typeof A.blankJourney !== 'function') return { ok: false, reason: 'no-engine' };
  stationUnit(campaign, unit, null);   // the troops take the road (home captured for the return)
  const destName = ((campaign.hexes || []).find(h => h && h.id === dest) || {});
  const destLabel = (A.hexName ? A.hexName(destName.id ? destName : { id: dest }, campaign) : dest);
  const journey = A.blankJourney({
    unitId: unit.id, unitMarch: true,
    name: (unit.displayName || unit.unitTypeKey || 'unit') + ' → ' + destLabel,
    startHexId: origin, destinationHexId: dest,
    waypoints: (opts.waypointHexIds || []).filter(Boolean).map(hid => ({ hexId: hid, label: '', plannedPurpose: null })),
    pace: opts.pace || 'normal', purpose: 'military-campaign', participantCharacterIds: []
  });
  if(!Array.isArray(campaign.journeys)) campaign.journeys = [];
  campaign.journeys.push(journey);
  if(typeof A.startJourney === 'function') A.startJourney(campaign, journey);
  else journey.status = 'in-transit';
  unit.marchJourneyId = journey.id;
  const turn = (campaign.currentTurn != null) ? campaign.currentTurn : 0;
  (unit.history = unit.history || []).push({ turn, type: 'march-started', text: 'Set out on the march toward ' + destLabel });
  return { ok: true, journey };
}

// Halt a unit's free march where it stands — the Garrison-table "Stop march" verb. Aborts the
// march journey (the unit holds at the hex the journey has reached) and stations it there. No-op
// for a unit that isn't free-marching (a rally / return / army move is managed elsewhere).
function stopUnitMarch(campaign, unitOrId){
  const unit = (typeof unitOrId === 'string') ? findUnit(campaign, unitOrId) : unitOrId;
  if(!campaign || !unit || !unit.marchJourneyId) return { ok: false, reason: 'not-marching' };
  const j = (campaign.journeys || []).find(x => x && x.id === unit.marchJourneyId);
  const A = global.ACKS;
  let haltHexId = null;
  if(j){
    haltHexId = j.currentHexId || (j.days && j.days.length ? j.days[j.days.length - 1].newCurrentHexId : null) || j.startHexId || null;
    if(j.status === 'in-transit'){
      if(A && typeof A.abortJourney === 'function') A.abortJourney(campaign, j, 'unit halted');
      else j.status = 'aborted';
    }
  }
  stationUnit(campaign, unit, haltHexId ? { kind: 'hex', id: haltHexId } : null);
  unit.marchJourneyId = null;
  const turn = (campaign.currentTurn != null) ? campaign.currentTurn : 0;
  (unit.history = unit.history || []).push({ turn, type: 'march-halted', text: 'Halted the march' });
  return { ok: true, unit, haltHexId };
}

// ─── Garrison reaction — deploy a force to meet a domain threat (2026-06-14) ──────────────
// RAW JJ pp.104–106: a domain facing a violent encounter (an incursion band) may deploy a
// force from the garrison to meet it in the field — "not every encounter requires the ruler
// to sally forth… that's what garrisons are for!" The chosen force MARCHES to the band (W4),
// the fight is resolved AT THE BAND'S LOCATION, and the force MARCHES HOME (returnUnitHome,
// the §7 foundation). The sally force is a temporary Army — the cleanest reuse: createArmy +
// the W4 march + (for a real fight) the W3 battle + disbandArmy → the return march, all
// shipped. The slot-88 military day consumer fires the arrival resolution on co-location.

// The domain's seat/stronghold hex — the default rally point (JJ p.103: "assume the garrison
// is in the domain's stronghold if the ruler has not made other arrangements"). The ruler's
// seat if he stands within the domain, else the hex bearing the largest settlement, else the
// first domain hex. Pure.
function domainSeatHexId(campaign, dom){
  if(!campaign || !dom) return null;
  const domHexes = (campaign.hexes || []).filter(h => h && h.domainId === dom.id);
  if(!domHexes.length) return null;
  const ruler = dom.rulerCharacterId ? (campaign.characters || []).find(c => c && c.id === dom.rulerCharacterId) : null;
  if(ruler && ruler.currentHexId && domHexes.some(h => h.id === ruler.currentHexId)) return ruler.currentHexId;
  let best = null, bestPop = -1;
  for(const h of domHexes){
    const s = ACKS.settlementForHex(campaign, h.id);   // single-home (T6)
    const pop = s ? (s.families || s.population || 0) : 0;
    if(pop > bestPop){ bestPop = pop; best = h; }
  }
  return (best || domHexes[0]).id;
}

// The platoon-scale BR (JJ p.105) of an incursion band — its catalog per-creature BR × the
// platoon factor, by LIVING count. null when the band has no priced catalog BR (GM prices it).
function reactionBandPlatoonBr(campaign, group){
  if(!campaign || !group) return null;
  const tpl = group.groupTemplate || {};
  const count = groupActiveCount(group);
  if(!count) return null;
  // A militia-drawn band (RR p.433) prices off its trained troop type, not the MM.
  if(tpl.troopTypeKey){
    const row = _groupTroopRow(group);
    if(row && typeof row.brPerCreature === 'number') return monsterPlatoonBr(row.brPerCreature, count);
  }
  const entry = (tpl.monsterCatalogKey && global.ACKS && typeof global.ACKS.findMonster === 'function') ? global.ACKS.findMonster(tpl.monsterCatalogKey) : null;
  if(!entry || typeof entry.battleRating !== 'number') return null;
  return monsterPlatoonBr(entry.battleRating, count);
}

// The platoon-scale BR a set of units would field (the sally force).
function reactionForcePlatoonBr(campaign, unitIds){
  if(!campaign || !Array.isArray(unitIds)) return 0;
  let br = 0;
  for(const uid of unitIds){
    const u = (typeof uid === 'string') ? findUnit(campaign, uid) : uid;
    if(u) br += unitPlatoonScaleBr(u) || 0;
  }
  return Math.round(br * 100) / 100;
}

// Predict deploying `unitIds` against the band, by the RAW attitude+BR rules (JJ p.104). Pure
// — drives the BR preview in the deploy modal AND the Military-tab threats table. Returns
// {forceBr, bandBr, attitude, attitudeLabel, lingering, effectiveAttitude, flips, outcome,
//  lines}. outcome ∈ 'battle' | 'driven-off' | 'priced-by-gm'.
function garrisonReactionPreview(campaign, groupOrId, unitIds){
  const group = (typeof groupOrId === 'string') ? findGroup(campaign, groupOrId) : groupOrId;
  if(!campaign || !group || !group.incursion) return null;
  const forceBr = reactionForcePlatoonBr(campaign, unitIds || []);
  const bandBr = reactionBandPlatoonBr(campaign, group);
  const attitude = group.incursion.attitude || 'neutral';
  const lingering = group.incursion.disposition === 'lingering';
  // neutral / mercantilist / friendly bands turn UNFRIENDLY when deployed against (JJ p.104).
  const flips = (attitude === 'neutral' || attitude === 'mercantilist' || attitude === 'friendly');
  const effectiveAttitude = flips ? 'unfriendly' : attitude;
  const bandRow = ((global.ACKS && global.ACKS.DOMAIN_REACTION_BANDS) || []).find(b => b && b.key === attitude);
  const attitudeLabel = (bandRow && bandRow.label) || (attitude.charAt(0).toUpperCase() + attitude.slice(1));
  const lines = [];
  if(flips) lines.push('deploying turns them UNFRIENDLY (JJ p.104)');
  let outcome;
  if(bandBr == null){
    outcome = 'priced-by-gm';
    lines.push('the fight vs a drive-off is the Judge’s call — the band has no priced BR');
  } else if(effectiveAttitude === 'hostile'){
    outcome = 'battle';
    lines.push('they FIGHT — hostile monsters always give battle (JJ p.104)');
  } else {   // unfriendly (including the flipped bands)
    if(bandBr >= forceBr){ outcome = 'battle'; lines.push('they FIGHT — the band’s BR ' + bandBr + ' ≥ your force ' + forceBr + ' (JJ p.104)'); }
    else { outcome = 'driven-off'; lines.push('DRIVEN OFF — your force ' + forceBr + ' > the band’s BR ' + bandBr + ' (JJ p.104)'); }
  }
  return { forceBr, bandBr, attitude, attitudeLabel, lingering, effectiveAttitude, flips, outcome, lines };
}

// The army-organization advisory (RR pp.435–437) a freshly-mustered reaction force WOULD carry,
// computed from the chosen units + commander BEFORE deploying — the deploy modal's up-front twin of
// the army card's validateArmyOrganization. createArmy musters one "Main Body" division of all the
// units under the commander, so this reproduces exactly the findings that army would report: no
// commander, under-3-units (the headline — RR p.435), the commander's scale qualification (RR p.437)
// and his leadership-ability cap (RR p.435). Advisory + GM-overridable — a one-unit sally is a
// legitimate if sub-strength choice (RAW's waiver clause), so it never blocks the deploy. Counts the
// full committed force (present + called-up), matching the BR preview. Pure. Returns [{code, text}].
function reactionForceOrgFindings(campaign, opts){
  opts = opts || {};
  const findings = [];
  const unitIds = (Array.isArray(opts.unitIds) ? opts.unitIds : []).filter(Boolean);
  const cmdr = (campaign && opts.commanderCharacterId) ? _findCharacterById(campaign, opts.commanderCharacterId) : null;
  if(!cmdr) findings.push({ code: 'no-leader', text: 'No commander yet — the ruler may lead in person (RR p.435)' });
  if(unitIds.length < 3) findings.push({ code: 'under-3-units', text: 'An army must have at least 3 units (RR p.435) — has ' + unitIds.length });
  if(cmdr){
    const units = unitIds.map(id => findUnit(campaign, id)).filter(Boolean);
    const totalTroops = units.reduce((s, u) => s + unitActiveCount(u), 0);
    const scale = (global.ACKS && global.ACKS.armyScaleForSize) ? global.ACKS.armyScaleForSize(totalTroops) : 'company';
    if(qualifiesAsCommander(cmdr, scale) === false) findings.push({ code: 'commander-unqualified', text: (cmdr.name || 'The commander') + ' does not qualify to command at ' + scale + ' scale (RR p.437)' });
    if(unitIds.length > leadershipAbility(cmdr)) findings.push({ code: 'commander-over-leadership', text: unitIds.length + ' units exceed ' + (cmdr.name || 'the commander') + '’s leadership ability ' + leadershipAbility(cmdr) + ' (RR p.435)' });
  }
  return findings;
}

// Deploy a sally force against an incursion band. Muster a temporary Army at the rally point
// (default the domain seat — JJ p.103) with the chosen units (co-located fall in; distant ones
// are called up — they march in), mark it as reacting to the band, and march it to the band's
// hex (W4). The slot-88 military day consumer resolves the meeting on arrival; the GM Recalls
// afterward (recallReactionForce → the units march home). opts: {groupId, unitIds[],
// callUpUnitIds[], commanderCharacterId, rallyHexId, name, stance, pace}. Returns
// {ok, army, journey?, reason?}.
function deployGarrisonReaction(campaign, opts){
  opts = opts || {};
  if(!campaign) return { ok: false, reason: 'no-campaign' };
  const group = findGroup(campaign, opts.groupId);
  if(!group || !group.incursion) return { ok: false, reason: 'no-band' };
  // Awareness gate (JJ p.103, RR p.452): a deliberate sally requires the ruler to have DETECTED
  // the band. An undetected incursion (failed reconnaissance, rulerAware===false) offers no target
  // to march on — the garrison can't intercept a threat it hasn't located. Passive stronghold
  // defence (the band reaching the seat) is a separate path and needs no prior knowledge. An unset
  // rulerAware defaults to aware (pre-recon / GM-authored bands), matching the display convention.
  if(group.incursion.rulerAware === false) return { ok: false, reason: 'ruler-unaware' };
  const dom = (campaign.domains || []).find(d => d && d.id === group.incursion.domainId) || null;
  let rallyHexId = opts.rallyHexId || (dom ? domainSeatHexId(campaign, dom) : null);
  const unitIds = (Array.isArray(opts.unitIds) ? opts.unitIds : []).filter(Boolean);
  const callUpUnitIds = (Array.isArray(opts.callUpUnitIds) ? opts.callUpUnitIds : []).filter(Boolean);
  if(!unitIds.length && !callUpUnitIds.length) return { ok: false, reason: 'no-units' };
  const army = createArmy(campaign, {
    name: opts.name || (((dom && dom.name) || 'Domain') + ' reaction force'),
    leaderCharacterId: opts.commanderCharacterId || null,
    currentHexId: rallyHexId || null,
    strategicStance: opts.stance || 'offensive',
    unitIds, callUpUnitIds
  });
  army.reactionTargetGroupId = group.id;
  const turn = (campaign.currentTurn != null) ? campaign.currentTurn : 0;
  (army.history = army.history || []).push({ turn, type: 'deployed-reaction',
    text: 'Deployed to meet ' + (group.name || 'a band') + (dom ? (' threatening ' + (dom.name || dom.id)) : '') + ' (JJ p.104)' });
  // March to the band's hex (W4). If the band is AT the rally point already, no march — the
  // consumer resolves on the spot next tick (the army stands on the band).
  let journey = null;
  const bandHexId = group.currentHexId || null;
  if(bandHexId && rallyHexId && bandHexId !== rallyHexId && global.ACKS && typeof global.ACKS.startArmyMarch === 'function'){
    const r = global.ACKS.startArmyMarch(campaign, army.id, { destinationHexId: bandHexId, pace: opts.pace || 'normal' });
    if(r && r.ok) journey = r.journey;
  }
  return { ok: true, army, journey, rallyHexId };
}

// Recall a sally force — the fight's done, or it's called off: disband it, sending every unit
// MARCHING HOME (returnUnitHome — the §7 foundation). The reaction stamps fall away with the
// army. A thin, named wrapper over disbandArmy. Returns the removed army or null.
function recallReactionForce(campaign, armyOrId){
  return disbandArmy(campaign, armyOrId);
}

// =============================================================================
// === Military W7 (burst4) — Conscripts, militia, training & the F&D call-to-arms /
//     Troops-favor materialization (RR pp.430–434 + p.341 + #230). Levies are Units
//     (the W1 sibling kind) carrying lazy fields (homeDomainId / calledUp / wageWaived)
//     set on the instance — entities.js's blankUnit is untouched (CL-1 owns it), so old
//     units read undefined → the defensive defaults below. No new prefix/entity/rule.
// =============================================================================

// Identify a levy unit (conscripts/militia) raised from a domain.
function _isLevyUnit(u){ return !!u && (u.source === 'conscript' || u.source === 'militia'); }
// A levy is TRAINED once it's been converted off the 'untrained-levy' type (RR p.431).
function _isTrainedLevy(u){ return !!u && u.unitTypeKey && u.unitTypeKey !== 'untrained-levy'; }

// RR p.430 — ≤1 conscript per 10 peasant families (no morale/revenue cost).
function conscriptLevyMax(d){ return Math.floor((((d && d.demographics) || {}).peasantFamilies || 0) / 10); }
// RR p.432 — ≤2 additional militia per 10 peasant families.
function militiaLevyMax(d){ return Math.floor((((d && d.demographics) || {}).peasantFamilies || 0) / 10) * 2; }

// Levy units raised from a domain (homeDomainId match), optionally filtered by source.
function domainLevyUnits(campaign, domainOrId, source){
  const id = (typeof domainOrId === 'string') ? domainOrId : (domainOrId && domainOrId.id);
  if(!campaign || !id || !Array.isArray(campaign.units)) return [];
  return campaign.units.filter(u => u && u.homeDomainId === id && (!source || u.source === source));
}
function _levyActiveCount(campaign, domainOrId, source, pred){
  return domainLevyUnits(campaign, domainOrId, source)
    .filter(u => pred ? pred(u) : true)
    .reduce((s, u) => s + unitActiveCount(u), 0);
}
// Conscripts currently maintained from a domain (RR p.430).
function conscriptCount(campaign, d){ return _levyActiveCount(campaign, d, 'conscript'); }
// Militia CALLED UP from a domain (in the garrison/army, billed — drives the revenue/morale penalty).
function militiaCalledUpCount(campaign, d){ return _levyActiveCount(campaign, d, 'militia', u => u.calledUp !== false); }

// RR p.430 (the Marcus example) — total levies EVER raised from a domain (Σ count, INCLUDING the dead
// AND the still-mustering). Casualties are "sticky": a fallen levy keeps its family slot, so it can't
// be instantly re-levied — only population growth (raising the cap) or the 5%/yr replenishment refills.
// A still-mustering levy (W7 levy-arrival staging) reserves the cap for its full commit too — `count`
// holds only the soldiers who've ARRIVED, so `musterPending` is added back here. This is the basis for
// the available pool, NOT the living count.
function levyEverRaised(campaign, d, source){
  return domainLevyUnits(campaign, d, source).reduce((s, u) => s + Math.max(0, (u.count || 0) + (u.musterPending || 0)), 0);
}
// RR p.430/432 — how many more conscripts/militia a domain can still levy now (cap − ever-raised, ≥0).
function levyAvailable(campaign, d, source){
  const cap = source === 'militia' ? militiaLevyMax(d) : conscriptLevyMax(d);
  return Math.max(0, cap - levyEverRaised(campaign, d, source));
}

// RR p.432 — domain morale penalty while militia are called up: −1 by levying ≤1 per 10 families,
// −2 by levying 2 per 10 families. Returns ≤ 0 (0 when none called up). Reads the called-up count.
function militiaDomainMoralePenalty(campaign, d){
  const fam = (((d && d.demographics) || {}).peasantFamilies || 0);
  const calledUp = militiaCalledUpCount(campaign, d);
  if(calledUp <= 0 || fam <= 0) return 0;
  const perTen = calledUp / (fam / 10);    // militia levied per 10 families
  return perTen >= 2 ? -2 : -1;
}
// RR p.432 — each called-up militiaman costs the domain 1 family of revenue.
function militiaRevenuePenaltyFamilies(campaign, d){ return militiaCalledUpCount(campaign, d); }

// RR p.341 / p.433 — the gp value of trained + equipped militia (their implicit monthly wage) counts
// toward the domain's garrison cost EVEN WHEN NOT CALLED UP. Returns the at-home trained militia's
// implicit wages (the called-up ones are already in garrisonCost, so excluded to avoid double-count).
// The Marcus example (RR p.433): 120 light @6 + 120 heavy @12 = 2,160gp.
function domainTrainedMilitiaCredit(campaign, d){
  return domainLevyUnits(campaign, d, 'militia')
    .filter(u => _isTrainedLevy(u) && u.calledUp === false)
    .reduce((s, u) => s + unitActiveCount(u) * (u.monthlyWage || 0), 0);
}
// RR p.431/433 — the one-time levy morale/loyalty adjustment from the domain's morale: +1 from a
// Steadfast (+3) or Stalwart (+4) domain, −1 from an Apathetic (0) or Demoralized (−1) domain.
function levyMoraleAdjustmentForDomain(d){
  const m = (((d && d.demographics) || {}).morale) || 0;
  if(m >= 3) return 1;
  if(m === 0 || m === -1) return -1;
  return 0;
}
// RR p.432 — a Turbulent/Defiant/Rebellious domain (morale ≤ −2) cannot levy conscripts or militia.
function canLevyFromDomain(d){ return ((((d && d.demographics) || {}).morale) || 0) > -2; }

// The trained-militia troop type a domain fields, if any — the hook E10's banditry uses (RR p.433:
// "any rebels will be drawn from the militia"). Returns the most common trained-militia typeKey or null.
// (W7 provides this read; wiring it into processBanditryForTurn — subsystems — is a follow-on.)
function domainMilitiaTroopTypeKey(campaign, d){
  const trained = domainLevyUnits(campaign, d, 'militia').filter(_isTrainedLevy);
  if(!trained.length) return null;
  const tally = {};
  for(const u of trained){ tally[u.unitTypeKey] = (tally[u.unitTypeKey] || 0) + unitActiveCount(u); }
  return Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0] || null;
}
// The E10 banditry hook (RR p.433: "any rebels will be drawn from the militia"). The POOL
// is the AT-HOME trained-militia manpower (calledUp === false — the idle armed men who'd
// turn rebel; a called-up militia is actively serving, its fate in a revolt a GM / army-
// battle call) — it caps how many of the rebels fight as trained troops rather than rabble.
function domainTrainedMilitiaPool(campaign, d){
  return _levyActiveCount(campaign, d, 'militia', u => _isTrainedLevy(u) && u.calledUp === false);
}
// The representative at-home trained-militia troop ROW (the most-common type's catalog row,
// resolving race/loadout/veteran via that type's largest unit) — what the militia-drawn
// rebels fight as. 🔧 v1: a single representative type (the most common). null when the
// domain fields no at-home trained militia (or the type isn't a catalog row) → all rabble.
function domainMilitiaTroopRow(campaign, d){
  const atHome = domainLevyUnits(campaign, d, 'militia').filter(u => _isTrainedLevy(u) && u.calledUp === false);
  if(!atHome.length) return null;
  const tally = {};
  for(const u of atHome){ tally[u.unitTypeKey] = (tally[u.unitTypeKey] || 0) + unitActiveCount(u); }
  const key = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
  if(!key) return null;
  const rep = atHome.filter(u => u.unitTypeKey === key).sort((a, b) => unitActiveCount(b) - unitActiveCount(a))[0];
  return unitTroopRow(rep);
}

// ─── Levy / train setters ───────────────────────────────────────────────────
// Resolve a domain (id or object) on the campaign.
function _resolveDomain(campaign, domainOrId){
  if(!campaign) return null;
  if(domainOrId && typeof domainOrId === 'object') return domainOrId;
  return (campaign.domains || []).find(d => d && d.id === domainOrId) || null;
}
// RR p.430 — the levy MUSTER schedule (W7 levy-arrival staging). Levied troops arrive in stages:
// ½ (round up) in the first time period, ¼ (round down, min 1) in the second, the remainder in the
// third. A domain levy is "from his personal domain alone" → treat as a barony → the time period is a
// WEEK (RR p.434, Vassal Troops by Realm Size). (The Month/Season realm-scale periods are for a
// multi-domain CALL TO ARMS — a different mechanic, the deferred F&D duty.) Returns [{atOrd, count}]
// (non-zero batches only), the batches landing at startOrd+7/+14/+21.
// RR p.430 / p.428 — the ½/¼/remainder muster/recruitment arrival schedule over three time PERIODS.
// periodDays sets the cadence: a barony levy = a week (7, RR p.434); a realm mercenary recruitment = the
// realm tier's time period (week/month/season/year, RR p.428). Batches land at +1/+2/+3 periods from
// startOrd. The slot-46 'levy-muster' day-consumer tops up the unit's `count` as each batch arrives —
// it is source-agnostic, so it musters levies AND recruited mercenaries off the same schedule shape.
function _musterSchedule(total, startOrd, periodDays){
  const n = Math.max(0, Math.floor(total || 0));
  if(n <= 0) return [];
  const P = Math.max(1, Math.floor(periodDays || 7));
  const b1 = Math.ceil(n / 2);                                   // ½, rounded up
  const rem1 = n - b1;
  const b2 = Math.min(rem1, Math.max(1, Math.floor(n / 4)));     // ¼, rounded down, min 1 (capped at what's left)
  const b3 = n - b1 - b2;                                        // the remainder
  return [{ atOrd: startOrd + P, count: b1 },
          { atOrd: startOrd + P * 2, count: b2 },
          { atOrd: startOrd + P * 3, count: b3 }].filter(b => b.count > 0);
}
// RR p.430/p.434 — the levy (barony) variant: a week per period.
function _levyMusterSchedule(total, startOrd){ return _musterSchedule(total, startOrd, 7); }
// The plural noun for a mustering unit's muster narration (RR p.430 levy / p.428 realm recruitment).
function _levyMusterNoun(source){ return source === 'militia' ? 'militia' : source === 'mercenary' ? 'mercenaries' : 'conscripts'; }

// Internal: create + station a levy unit (conscript/militia), clamped to its RAW cap. Returns the
// unit, or null when the cap leaves no room / the domain can't levy. The one-time domain-morale
// levy adjustment (RR p.431/433) is baked into the unit's moraleAdjustment + loyalty at creation.
// RR p.430 — LEVYING TAKES TIME (W7 levy-arrival staging): by default the troops arrive over 3 weeks
// (½/¼/remainder; the 'levy-muster' day-consumer tops up `count` as each batch lands, while
// `musterPending` reserves the cap for the full commit from levy-time). `opts.instant` gives the whole
// levy at once (tests / a GM expedite / pre-built template data) — the legacy immediate behaviour.
function _createLevyUnit(campaign, d, source, count, opts){
  opts = opts || {};
  if(!campaign || !d) return null;
  if(!canLevyFromDomain(d)) return null;                          // RR p.432 — morale ≤ −2 blocks levying
  if(!Array.isArray(campaign.units)) campaign.units = [];
  const max = source === 'militia' ? militiaLevyMax(d) : conscriptLevyMax(d);
  const existing = levyEverRaised(campaign, d, source);          // RR p.430 — sticky casualties + still-mustering count against the cap
  const room = Math.max(0, max - existing);
  const n = Math.min(Math.max(0, Math.floor(count || 0)), room);
  if(n <= 0) return null;
  const race = opts.race || 'man';
  const A = global.ACKS;
  const staged = !opts.instant;
  const u = A.blankUnit({ unitTypeKey: 'untrained-levy', race, count: staged ? 0 : n, source,
    displayName: (d.name ? d.name + ' ' : '') + (source === 'militia' ? 'Militia' : 'Conscripts') });
  // lazy instance fields (blankUnit doesn't emit them — additive, no migration)
  u.homeDomainId = d.id;
  u.calledUp = true;                                             // freshly levied = called up (in the garrison)
  const adj = levyMoraleAdjustmentForDomain(d);
  u.moraleAdjustment = (u.moraleAdjustment || 0) + adj;
  u.loyalty = (u.loyalty || 0) + adj;
  const turn = (campaign.currentTurn != null) ? campaign.currentTurn : 0;
  const moraleNote = adj ? ' (' + (adj > 0 ? '+' : '') + adj + ' morale from domain morale)' : '';
  if(staged){
    // RR p.430 — the troops arrive over 3 weeks; `count` starts at 0 (none have shown up yet) and the
    // 'levy-muster' day-consumer tops it up at each batch. musterPending reserves the cap meanwhile.
    const startOrd = _levyDayOrd(campaign);
    u.musterPending = n;
    u.musterState = { total: n, startedAtOrd: startOrd, arrivedSoFar: 0, schedule: _levyMusterSchedule(n, startOrd) };
    u.history.push({ turn, type: 'levied', text: 'Levying ' + n + ' ' + (source === 'militia' ? 'militia' : 'conscripts') + ' — arriving over 3 weeks (½/¼/remainder, RR p.430)' + moraleNote });
  } else {
    u.history.push({ turn, type: 'levied', text: 'Levied as ' + (source === 'militia' ? 'militia' : 'conscripts') + moraleNote });
  }
  stationUnit(campaign, u, { kind: 'domain-garrison', id: d.id });
  return u;
}
// RR p.430 — conscript peasants into the domain's army (≤1 per 10 families; no morale/revenue cost).
function levyConscripts(campaign, domainOrId, opts){
  return _createLevyUnit(campaign, _resolveDomain(campaign, domainOrId), 'conscript', (opts || {}).count, opts);
}
// RR p.432 — levy a peasant militia (≤2 per 10 families; −1 family of revenue each + domain morale −1/−2).
function levyMilitia(campaign, domainOrId, opts){
  return _createLevyUnit(campaign, _resolveDomain(campaign, domainOrId), 'militia', (opts || {}).count, opts);
}

// ─── Military W7-continuation — realm-scale mercenary recruitment (RR p.428) ──────────────────────────
// A realm recruits mercenaries at a scale set by its TIER (continent→barony, by realm family count vs
// MERC_AVAILABILITY_REALM.populationFamilies — the catalog's own thresholds, not the ruler's title). Each
// tier's per-period availability caps how many of a type can be recruited per time period (week/month/
// season/year); the troops arrive ½/¼/remainder over three periods — the SAME staging as a domain levy,
// so they ride the slot-46 'levy-muster' day-consumer (source-agnostic). A one-time recruitment fee
// (REALM_RECRUITMENT_FEES, rolled per recruit action) is paid from the realm treasury. Unlike a levy this
// is NOT gated by domain morale — you hire FOREIGN mercenaries (a rebellious realm can still recruit).
// 🔧 v1: the per-period cap is tracked + refreshes each period; RAW's "one recruiter per realm at a time"
//        lock + the "availability exhausts after the 4th period" nuance are deferred (both make recruiting
//        HARDER — the lenient direction). Mercenaries only — military specialists are a stacked follow-on.
function realmRecruitTierForDomain(campaign, domainOrId){
  const A = global.ACKS;
  const d = _resolveDomain(campaign, domainOrId);
  if(!d) return null;
  return A.realmRecruitTier(ACKS.realmFamiliesForDomain(campaign, d));
}
// The count of `typeKey` already recruited from this realm THIS period (0 once the period has rolled over
// — a read; the period bookkeeping is materialized on the next recruit). Lazy/defensive (no migration).
function domainRealmRecruitedThisPeriod(campaign, domainOrId, typeKey){
  const A = global.ACKS;
  const d = _resolveDomain(campaign, domainOrId);
  if(!d || !d.realmRecruitment) return 0;
  const tier = realmRecruitTierForDomain(campaign, d);
  const periodDays = A.realmRecruitPeriodDays(tier);
  if((d.realmRecruitment.periodStartOrd || 0) + periodDays <= _levyDayOrd(campaign)) return 0;  // fresh period
  return Math.max(0, (d.realmRecruitment.recruited || {})[A.normalizeTroopTypeKey(typeKey)] || 0);
}
// RR p.428 — how many MORE of `typeKey` the realm can recruit this period (tier availability − taken).
function domainRealmRecruitAvailable(campaign, domainOrId, typeKey){
  const A = global.ACKS;
  const d = _resolveDomain(campaign, domainOrId);
  if(!d) return 0;
  const max = A.realmMercAvailable(realmRecruitTierForDomain(campaign, d), typeKey);
  return Math.max(0, max - domainRealmRecruitedThisPeriod(campaign, d, typeKey));
}
// RR p.428 — recruit `opts.count` mercenaries of `opts.typeKey` (race default 'man') into the domain's
// garrison. Clamps to this period's remaining availability; rolls + debits the realm recruitment fee from
// the treasury; by default the troops arrive ½/¼/remainder over three of the tier's time periods (the
// slot-46 muster consumer tops them up). opts.instant gives them at once (tests / a GM expedite).
// Returns { unit, recruited, feeGp, tier } or null (no availability / no domain).
function recruitRealmTroops(campaign, domainOrId, opts){
  opts = opts || {};
  const A = global.ACKS;
  const d = _resolveDomain(campaign, domainOrId);
  if(!d) return null;
  if(!Array.isArray(campaign.units)) campaign.units = [];
  const typeKey = A.normalizeTroopTypeKey(opts.typeKey);
  const tier = realmRecruitTierForDomain(campaign, d);
  const avail = domainRealmRecruitAvailable(campaign, d, typeKey);
  const n = Math.min(Math.max(0, Math.floor(opts.count || 0)), avail);
  if(n <= 0) return null;
  const race = opts.race || 'man';
  const periodDays = A.realmRecruitPeriodDays(tier);
  const now = _levyDayOrd(campaign);
  // roll the one-time recruitment fee (RR p.428) — consumes rng before the (deterministic) schedule
  const feeSpec = A.realmRecruitFeeSpec(tier);
  const feeGp = feeSpec ? Math.max(0, ACKS._rollDiceStr(feeSpec.dice, opts.rng) * (feeSpec.multiplierGp || 1)) : 0;
  // mark the per-period ledger, rolling it over if a new period began
  if(!d.realmRecruitment || (d.realmRecruitment.periodStartOrd || 0) + periodDays <= now){
    d.realmRecruitment = { periodStartOrd: now, recruited: {} };
  }
  d.realmRecruitment.recruited[typeKey] = (d.realmRecruitment.recruited[typeKey] || 0) + n;
  if(feeGp > 0) ACKS._applyDomainTreasuryDelta(campaign, d, -feeGp, { reason: 'realm-recruitment', label: 'recruit ' + n + ' ' + typeKey + ' (' + tier + ')' });
  // the mercenaries are a real, equipped troop type (no training step) — blankUnit bakes catalog wage/BR
  const label = String(typeKey || 'mercenaries').replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const staged = !opts.instant;
  const u = A.blankUnit({ unitTypeKey: typeKey, race, count: staged ? 0 : n, source: 'mercenary',
    displayName: (d.name ? d.name + ' ' : '') + label });
  const w = A.mercWage(typeKey, race);                            // RR p.429 mercenary wage (canonical)
  if(typeof w === 'number') u.monthlyWage = w;
  u.homeDomainId = d.id;
  u.calledUp = true;
  const turn = (campaign.currentTurn != null) ? campaign.currentTurn : 0;
  const periodWord = (periodDays === 7) ? 'weeks' : (periodDays === 30) ? 'months' : (periodDays === 90) ? 'seasons' : 'years';
  if(staged){
    u.musterPending = n;
    u.musterState = { total: n, startedAtOrd: now, arrivedSoFar: 0, schedule: _musterSchedule(n, now, periodDays) };
    u.history.push({ turn, type: 'recruited', text: 'Recruited ' + n + ' ' + label + ' mercenaries at the ' + tier + ' — arriving over 3 ' + periodWord + ' (½/¼/remainder, RR p.428) · fee ' + feeGp.toLocaleString() + 'gp' });
  } else {
    u.history.push({ turn, type: 'recruited', text: 'Recruited ' + n + ' ' + label + ' mercenaries at the ' + tier + ' · fee ' + feeGp.toLocaleString() + 'gp' });
  }
  stationUnit(campaign, u, { kind: 'domain-garrison', id: d.id });
  return { unit: u, recruited: n, feeGp, tier };
}

// ─── NPC detail-level doctrine (2026-06-18) — lightweight ↔ full chargen ──────────────────────────────
// An NPC may be created 'lightweight' (a named stub: type + wage + classification, abilities left at the
// 10-default) or 'full' (rolled). A lightweight NPC is NEVER a dead end — this primitive upgrades it to a
// full character IN PLACE: it rolls the six abilities (3d6 down the line) and flips detailLevel→'full'.
// The reusable lightweight↔full primitive every NPC-creation surface shares (realm-specialist recruitment
// is its first consumer; the recruit-hireling flow + the Inspector adopt it next). Idempotent on an
// already-full (or unflagged ⇒ full) character — a no-op. hp / saves / class stay the GM's to flesh out in
// the Inspector; expand fills the rolled abilities, not class-derived values we'd have to invent. Returns
// the character (null if not found). `charOrId` may be a Character object or its id.
function expandCharacterToFull(campaign, charOrId, opts){
  opts = opts || {};
  const rng = opts.rng || Math.random;
  const c = (charOrId && typeof charOrId === 'object') ? charOrId
    : ((campaign && Array.isArray(campaign.characters)) ? campaign.characters.find(x => x && x.id === charOrId) : null);
  if(!c) return null;
  if(c.detailLevel !== 'lightweight') return c;                  // idempotent — already full (unflagged ⇒ full)
  const roll = () => (Math.floor(rng()*6)+1) + (Math.floor(rng()*6)+1) + (Math.floor(rng()*6)+1);   // 3d6 down the line
  c.abilities = { STR: roll(), INT: roll(), WIL: roll(), DEX: roll(), CON: roll(), CHA: roll() };
  c.detailLevel = 'full';
  if(!Array.isArray(c.history)) c.history = [];
  const turn = (campaign && campaign.currentTurn != null) ? campaign.currentTurn : 0;
  c.history.push({ turn, type: 'expanded', text: 'Expanded from a lightweight stub to a full character (abilities rolled)' });
  return c;
}

// ─── Military W7-continuation — realm-scale military-specialist recruitment (RR p.428) ────────────────
// The OTHER half of realm recruitment (the mercenary-troops half is recruitRealmTroops, above). A realm
// recruits military SPECIALISTS + officers (artillerists / armorers / creature handlers / marshals /
// mercenary officers / quartermaster / siege engineer) at its TIER, capped by MILITARY_SPECIALIST_-
// AVAILABILITY_REALM. Each is an INDIVIDUAL (a Character + a specialistContract to the ruler), NOT a unit —
// so hiring honours the lightweight↔full doctrine: a lightweight stub (GM fleshes out) or a full-rolled NPC.
// Availability is tracked per period in a ledger SEPARATE from the merc one (its own period clock) so the
// two never clobber each other's rollover. Not gated by domain morale (a foreign hire, like the merc half).
function domainRealmSpecialistsRecruitedThisPeriod(campaign, domainOrId, typeKey){
  const A = global.ACKS;
  const d = _resolveDomain(campaign, domainOrId);
  if(!d || !d.realmSpecialistRecruitment) return 0;
  const tier = realmRecruitTierForDomain(campaign, d);
  const periodDays = A.realmRecruitPeriodDays(tier);
  if((d.realmSpecialistRecruitment.periodStartOrd || 0) + periodDays <= _levyDayOrd(campaign)) return 0;  // fresh period
  return Math.max(0, (d.realmSpecialistRecruitment.recruited || {})[String(typeKey || '').toLowerCase()] || 0);
}
// RR p.428 — how many MORE of military-specialist `typeKey` the realm can recruit this period.
function domainRealmSpecialistAvailable(campaign, domainOrId, typeKey){
  const A = global.ACKS;
  const d = _resolveDomain(campaign, domainOrId);
  if(!d) return 0;
  const max = A.realmSpecialistAvailable(realmRecruitTierForDomain(campaign, d), typeKey);
  return Math.max(0, max - domainRealmSpecialistsRecruitedThisPeriod(campaign, d, typeKey));
}
// RR p.428 — recruit ONE military specialist of `opts.typeKey` into the realm. opts.detailLevel:
// 'lightweight' (default — a stub) | 'full' (rolled via the doctrine primitive). Creates a Character
// (socialTier 'specialist', homed to the realm, lieged to the ruler, profs from OFFICER_RANKS for officers
// so LA/SA derive) + a specialistContract; decrements the per-period availability. Returns
// { character, contract, tier, detailLevel } or null (no availability / unknown type / no domain).
function recruitRealmSpecialist(campaign, domainOrId, opts){
  opts = opts || {};
  const A = global.ACKS;
  const d = _resolveDomain(campaign, domainOrId);
  if(!d) return null;
  if(!Array.isArray(campaign.characters)) campaign.characters = [];
  const typeKey = String(opts.typeKey || '').toLowerCase();
  const prof = A.realmSpecialistProfile(typeKey);
  if(!prof) return null;                                          // unknown type
  if(domainRealmSpecialistAvailable(campaign, d, typeKey) <= 0) return null;   // none available this period
  const tier = realmRecruitTierForDomain(campaign, d);
  const periodDays = A.realmRecruitPeriodDays(tier);
  const now = _levyDayOrd(campaign);
  // per-period ledger — its OWN clock (NOT the merc ledger's, so neither rollover wipes the other)
  if(!d.realmSpecialistRecruitment || (d.realmSpecialistRecruitment.periodStartOrd || 0) + periodDays <= now){
    d.realmSpecialistRecruitment = { periodStartOrd: now, recruited: {} };
  }
  d.realmSpecialistRecruitment.recruited[typeKey] = (d.realmSpecialistRecruitment.recruited[typeKey] || 0) + 1;
  const ruler = d.rulerCharacterId || null;
  const full = (opts.detailLevel === 'full');
  const parse = A.parseProficiencyEntry || (s => ({ key: String(s).toLowerCase().replace(/\s+/g, '-'), ranks: 1 }));
  const role = String(prof.label || 'Specialist').replace(/^Mercenary Officer - /, '');   // "Captain", "Marshal - Light Infantry"
  const c = A.blankCharacter({
    name: role + (d.name ? ' of ' + d.name : ''),
    socialTier: 'specialist',
    controlledBy: 'gm',
    level: prof.level || 0,
    detailLevel: 'lightweight',                  // always born lightweight; expandCharacterToFull (below) rolls it up when full
    currentHexId: domainSeatHexId(campaign, d),
    currentDomainId: d.id,
    homeDomainId: d.id,
    liegeCharacterId: ruler,
    proficiencies: (prof.proficiencies || []).map(parse)
  });
  if(typeof prof.wageGp === 'number') c.monthlyWage = prof.wageGp;
  if(full) expandCharacterToFull(campaign, c, { rng: opts.rng });
  campaign.characters.push(c);
  const turn = (campaign.currentTurn != null) ? campaign.currentTurn : 0;
  const contract = ACKS.createSpecialistContract(campaign, {
    specialistCharacterId: c.id, employerCharacterId: ruler,
    hiredAtTurn: turn, wageStreamGpMo: c.monthlyWage || 0,
    serviceCategory: 'military', reason: 'realm-specialist-recruited'
  });
  c.history.push({ turn, type: 'recruited',
    text: 'Recruited as a ' + prof.label + ' at the ' + tier + ' (realm-scale, RR p.428)' + (full ? '' : ' — lightweight stub, expandable to full') });
  return { character: c, contract: contract, tier: tier, detailLevel: c.detailLevel };
}

// RR p.431 — split off the soldiers of a levy `u` beyond `keepLiving` into a NEW untrained levy of the
// same source/home (the recruits who can't qualify for the type being trained), leaving `u` with exactly
// `keepLiving` living. Casualties split proportionally (mirrors the UI domainSplitLevy). The new unit is
// stationed like `u` (garrison if called up, at-home if standing down). Returns it (null if nothing to split).
function _splitLevyRemainder(campaign, u, keepLiving){
  const A = global.ACKS;
  const active = unitActiveCount(u);
  const remLiving = Math.max(0, active - Math.max(0, keepLiving));
  if(remLiving <= 0) return null;
  const cas = Math.max(0, u.casualties || 0);
  const remCas = active > 0 ? Math.round(cas * remLiving / active) : 0;
  const remRaw = remLiving + remCas;
  const nu = A.blankUnit({ displayName: u.displayName, unitTypeKey: 'untrained-levy', race: u.race,
    source: u.source, count: remRaw, monthlyWage: u.monthlyWage });
  nu.casualties = remCas;
  nu.homeDomainId = u.homeDomainId; nu.calledUp = u.calledUp;
  nu.moraleAdjustment = u.moraleAdjustment; nu.loyalty = u.loyalty;
  u.count = (u.count || 0) - remRaw; u.casualties = cas - remCas;   // u now keeps exactly keepLiving living
  if(u.calledUp === false) stationUnit(campaign, nu, null);
  else stationUnit(campaign, nu, { kind: 'domain-garrison', id: u.homeDomainId });
  const turn = (campaign.currentTurn != null) ? campaign.currentTurn : 0;
  nu.history.push({ turn, type: 'split', text: 'Split off as an untrained levy — the recruits who could not qualify for training' });
  return nu;
}

// RR p.431/432 — a domain's full levied pool of a source ('conscript'|'militia'): living, trained +
// untrained. The Qualifying Number is a fraction of THIS pool (the talent distribution of the levied
// peasants — RR p.431 "of a pool of 120 conscripts"; RR p.432 the 240-militia example), NOT of any one
// unit; so the cap is computed pool-wide and shared across every unit split from the levy (splitting a
// levy before training can't dodge or shrink it). Per-domain, per-source — conscripts and militia are
// separate pools (each its own levy), as are different domains' levies.
function domainLevyPoolCount(campaign, domainOrId, source){
  return _levyActiveCount(campaign, domainOrId, source);
}
// Living count already trained as `typeKey` — OR currently in training toward it — from a domain's
// `source` levy. Both count against the pool cap, so a second training of the same type can't exceed
// the Qualifying Number while the first is still under way (RR p.431; the W7 training timer reserves
// in-training cohorts so deferred training can't over-fill a type's allowance).
function domainLevyTrainedOfType(campaign, domainOrId, source, typeKey){
  return _levyActiveCount(campaign, domainOrId, source,
    u => (_isTrainedLevy(u) && u.unitTypeKey === typeKey) ||
         (u && u.trainingState && u.trainingState.targetTroopType === typeKey));
}
// RR p.431 — how many MORE of a domain's `source` levy can still be trained as `typeKey`:
// floor(pool × QualifyingNumber / 120) − the number already trained as that type. Always ≥ 0.
function conscriptQualifyingRemaining(campaign, domainOrId, source, typeKey, race){
  const A = global.ACKS;
  const allowance = A.conscriptQualifyingMax(domainLevyPoolCount(campaign, domainOrId, source), typeKey, race);
  return Math.max(0, allowance - domainLevyTrainedOfType(campaign, domainOrId, source, typeKey));
}

// Absolute campaign day ordinal (1-based; 30-day months). Mirrors subsystems' _campaignDayOrd, which is
// module-local there — the levy/training timer (engine-side) needs it too. The day consumers advance it.
function _levyDayOrd(campaign){ return (((campaign && campaign.currentTurn) || 1) - 1) * 30 + (((campaign && campaign.currentDayInMonth) || 1)); }

// Days left before an in-training unit completes (RR p.431; W7). Returns null when not in training, ≥0 otherwise.
function unitTrainingDaysLeft(campaign, unit){
  const ts = unit && unit.trainingState;
  if(!ts || ts.completesAtOrd == null) return null;
  return Math.max(0, ts.completesAtOrd - _levyDayOrd(campaign));
}

// Days left before a mustering levy fully assembles (RR p.430; W7 levy-arrival staging). Returns null
// when not mustering, ≥0 otherwise (0 the day the last batch is due).
function unitMusterDaysLeft(campaign, unit){
  const ms = unit && unit.musterState;
  if(!ms || (unit.musterPending || 0) <= 0) return null;
  const last = (ms.schedule || []).reduce((m, b) => Math.max(m, b.atOrd), ms.startedAtOrd || 0);
  return Math.max(0, last - _levyDayOrd(campaign));
}

// Complete an in-training levy → convert it to its target troop type (catalog wage/BR/morale + name),
// clear trainingState, and stamp the 'trained' history entry. Shared by trainLevyUnit's instant path and
// the 'levy-training' day-consumer's commit. No-op when the unit isn't in training. Returns the unit|null.
function _completeTraining(campaign, u){
  const ts = u && u.trainingState;
  if(!ts || !ts.targetTroopType) return null;
  const A = global.ACKS;
  const target = ts.targetTroopType, race = u.race || 'man';
  const row = A.findTroopType(target, { race });
  const d = u.homeDomainId ? _resolveDomain(campaign, u.homeDomainId) : null;
  const n = unitActiveCount(u);
  u.unitTypeKey = target;
  u.monthlyWage = A.trainedTroopWage(target, race);
  u.brPerSoldier = row ? row.brPerCreature : (u.brPerSoldier || 0);
  if(row) u.displayName = (d && d.name ? d.name + ' ' : '') + (u.source === 'militia' ? 'Militia ' : 'Conscript ') + row.label;
  u.trainingState = null;
  const turn = (campaign.currentTurn != null) ? campaign.currentTurn : 0;
  u.history.push({ turn, type: 'trained', text: 'Completed training — ' + n + ' now ' + (row ? row.label : target) });
  return u;
}

// RR p.431 — train a levy unit into a professional troop type. Training TAKES TIME (W7 training timer):
// the home-domain treasury is debited perTroopGp × the number trained UP FRONT (marshals/gear/equipment,
// RR p.431), the unqualified remainder splits off as an untrained levy at once, and the unit enters
// training (`trainingState`), staying an untrained levy until the 'levy-training' day-consumer completes
// it after the type's training months (1 → 12; RR p.431). The Qualifying Number caps how many of the
// pool can become the type — opts.count (default = the cap) sets how many, clamped to [1, the cap]; an
// in-training cohort reserves the cap (`domainLevyTrainedOfType`). `opts.instant` completes immediately
// (the legacy behaviour, kept for tests + a GM expedite). Returns { ok, cost, months, unit, trained,
// qualMax, remainder (the new untrained unit's id|null), inTraining, completesAtOrd, reason }. Fails when
// the unit isn't an untrained levy, is already in training, the race can't field the type, or too few qualify.
function trainLevyUnit(campaign, unitOrId, opts){
  opts = opts || {};
  const u = (typeof unitOrId === 'string') ? findUnit(campaign, unitOrId) : unitOrId;
  if(!campaign || !u) return { ok: false, reason: 'no-unit' };
  if(!_isLevyUnit(u)) return { ok: false, reason: 'not-a-levy' };
  if(_isTrainedLevy(u)) return { ok: false, reason: 'already-trained' };
  if(u.trainingState) return { ok: false, reason: 'already-in-training' };   // W7 — one training at a time
  if((u.musterPending || 0) > 0) return { ok: false, reason: 'still-mustering' };   // W7 — wait for the full muster (RR p.430)
  const A = global.ACKS;
  const target = opts.targetTroopType;
  const race = u.race || 'man';
  if(!target || A.conscriptQualifyingNumber(target, race) <= 0) return { ok: false, reason: 'cannot-qualify' };
  const costRow = A.trainingCostFor(target, race);
  if(!costRow) return { ok: false, reason: 'not-trainable' };
  const active = unitActiveCount(u);
  if(active <= 0) return { ok: false, reason: 'no-soldiers' };
  // RR p.431 — the Qualifying Number is a fraction of the WHOLE levied pool, not this unit: of the
  // domain's total conscripts/militia only floor(pool × QN / 120) can ever be this type, and the number
  // already trained as it counts against that. So the allowance is computed pool-wide (splitting a levy
  // before training can't dodge or shrink the cap), then capped to the soldiers in THIS unit.
  const remaining = conscriptQualifyingRemaining(campaign, u.homeDomainId, u.source, target, race);
  const qualMax = Math.min(active, remaining);                        // most of THIS unit trainable as the type now
  if(qualMax <= 0) return { ok: false, reason: 'too-few-qualify' };   // pool exhausted, or e.g. a 5-conscript pool → 0 heavy cavalry
  let trainN = (opts.count != null) ? Math.floor(Number(opts.count)) : qualMax;
  trainN = Math.max(1, Math.min(trainN, qualMax));
  // Split the unqualified remainder off as an untrained levy (leaves u with trainN living).
  const remainder = (trainN < active) ? _splitLevyRemainder(campaign, u, trainN) : null;
  const n = unitActiveCount(u);                                   // == trainN after the split
  const cost = costRow.perTroopGp * n;                            // RR p.431 — per-troop cost × number trained
  const d = u.homeDomainId ? _resolveDomain(campaign, u.homeDomainId) : null;
  if(d && cost > 0) ACKS._applyDomainTreasuryDelta(campaign, d, -cost, { reason: 'troop-training', label: 'train ' + n + ' as ' + target });
  // Enter training — the troops drill until the 'levy-training' day-consumer completes them after the
  // type's training months (RR p.431). The unit stays an untrained levy meanwhile (so it can't fight or
  // be re-trained, and its in-training cohort reserves the pool cap). The cost is already debited.
  const row = A.findTroopType(target, { race });
  const months = costRow.months || 1;
  const turn = (campaign.currentTurn != null) ? campaign.currentTurn : 0;
  const startOrd = _levyDayOrd(campaign);
  u.trainingState = {
    targetTroopType: target, count: n,
    startedAtOrd: startOrd,
    completesAtOrd: opts.instant ? startOrd : (startOrd + Math.max(1, Math.round(months * 30))),
    costPaidGp: cost
  };
  if(opts.instant){                                                  // legacy/expedite — finish now
    _completeTraining(campaign, u);
    return { ok: true, cost, months, unit: u, trained: n, qualMax, remainder: remainder ? remainder.id : null, inTraining: false };
  }
  u.history.push({ turn, type: 'training-started', text: 'Began training ' + n + ' as ' + (row ? row.label : target) + ' (' + cost.toLocaleString() + 'gp, ' + months + 'mo)' + (remainder ? '; ' + unitActiveCount(remainder) + ' unqualified stayed an untrained levy' : '') });
  return { ok: true, cost, months, unit: u, trained: n, qualMax, remainder: remainder ? remainder.id : null, inTraining: true, completesAtOrd: u.trainingState.completesAtOrd };
}

// RR p.432 — stand ALL of a domain's militia DOWN to the rolls: they leave the garrison but stay in the
// world at home (calledUp → false), drawing no wages and ending the called-up morale + revenue penalty,
// and can be called up again without re-levying. Trained+equipped militia still credit the garrison
// (RR p.341). (To return militia to the population + free the slot, RELEASE them instead.) Returns
// { sentHome, disbanded } — disbanded always 0 (standing down never dissolves).
function sendMilitiaHome(campaign, domainOrId){
  const d = _resolveDomain(campaign, domainOrId);
  if(!d) return { sentHome: 0, disbanded: 0 };
  let sentHome = 0;
  for(const u of domainLevyUnits(campaign, d, 'militia').slice()){
    if(u.calledUp === false) continue;                          // already standing down
    stationUnit(campaign, u, null);                             // leaves the garrison; stays in campaign.units
    u.calledUp = false; u.homeDomainId = d.id;                  // at home — no wages; trained+equipped credit garrison (RR p.341)
    sentHome++;
  }
  return { sentHome, disbanded: 0 };
}

// RR p.432 — stand a SINGLE militia unit DOWN to the rolls (the per-unit version of sendMilitiaHome):
// the militia leaves the garrison but stays in the world at home (calledUp → false), drawing no wages
// and ending the called-up penalty; a trained+equipped militia still credits the garrison (RR p.341).
// It can be called up again WITHOUT re-levying; to return militia to the population (and free the levy
// slot) the ruler RELEASES them instead (releaseLevyUnit). Returns { sentHome, disbanded } — disbanded
// is always 0 (standing down never dissolves a unit).
function sendMilitiaUnitHome(campaign, unitOrId){
  const u = (typeof unitOrId === 'string') ? findUnit(campaign, unitOrId) : unitOrId;
  if(!campaign || !u || u.source !== 'militia') return { sentHome: 0, disbanded: 0 };
  const homeId = u.homeDomainId;
  stationUnit(campaign, u, null);                               // stands down — leaves the garrison, stays in campaign.units
  u.calledUp = false; u.homeDomainId = homeId;                  // at home: no wages (RR p.432); trained+equipped credit the garrison (RR p.341)
  return { sentHome: 1, disbanded: 0 };
}
// RR p.432 — call an at-home (trained) militia unit back up: re-station it to its home domain's
// garrison and mark it called up, so the revenue/morale penalty resumes. Returns the unit or null.
function callUpMilitia(campaign, unitOrId){
  const u = (typeof unitOrId === 'string') ? findUnit(campaign, unitOrId) : unitOrId;
  if(!campaign || !u || u.source !== 'militia') return null;
  const d = u.homeDomainId ? _resolveDomain(campaign, u.homeDomainId) : null;
  if(d) stationUnit(campaign, u, { kind: 'domain-garrison', id: d.id });
  u.calledUp = true;
  return u;
}
// RR p.430/432 — release a conscript/militia unit from service: untrained return to their farms,
// trained conscripts become mercenaries/brigands (v1: the unit disbands either way, freeing the levy
// slot — a released levy no longer counts against the cap). Returns true if released.
function releaseLevyUnit(campaign, unitOrId){
  const u = (typeof unitOrId === 'string') ? findUnit(campaign, unitOrId) : unitOrId;
  if(!campaign || !u || !_isLevyUnit(u)) return false;
  disbandUnit(campaign, u);
  return true;
}

// RR p.430 (designer's note) — replenish levy casualties over time at 5% of the recruitable cap per
// YEAR, pro-rated each monthly turn via a fractional carry per domain+source (so a cap-100 conscript
// pool heals exactly 5/year). Reduces unit.casualties (restoring living) on the domain's levy units
// that have losses, capped at the casualties present. Both conscripts AND militia (the conscript-
// section rule applied to militia for parity). Always on — no house rule. Returns total healed.
function processLevyReplenishmentForTurn(campaign){
  if(!campaign || !Array.isArray(campaign.domains)) return 0;
  let healedTotal = 0;
  for(const d of campaign.domains){
    if(!d) continue;
    if(!d.levyReplenishCarry || typeof d.levyReplenishCarry !== 'object') d.levyReplenishCarry = { conscript: 0, militia: 0 };
    for(const source of ['conscript', 'militia']){
      const units = domainLevyUnits(campaign, d, source);
      const casualties = units.reduce((s, u) => s + Math.max(0, (u.casualties || 0)), 0);
      if(casualties <= 0){ d.levyReplenishCarry[source] = 0; continue; }   // nothing to heal — reset the carry
      const cap = source === 'militia' ? militiaLevyMax(d) : conscriptLevyMax(d);
      if(cap <= 0) continue;
      const carry = (d.levyReplenishCarry[source] || 0) + (cap * 0.05) / 12;
      let heal = Math.min(casualties, Math.floor(carry));
      d.levyReplenishCarry[source] = carry - heal;               // keep the fractional remainder
      // distribute the heal across the units that took losses (most-wounded first)
      const wounded = units.filter(u => (u.casualties || 0) > 0).sort((a, b) => (b.casualties || 0) - (a.casualties || 0));
      for(const u of wounded){
        if(heal <= 0) break;
        const take = Math.min(heal, u.casualties || 0);
        u.casualties = (u.casualties || 0) - take;
        heal -= take; healedTotal += take;
      }
    }
  }
  return healedTotal;
}

// ─── F&D Call-to-Arms / Troops-favor materialization (RR pp.433–434 + #230) ──
// Make the shipped F&D Call-to-Arms duty + Troops favor REAL — they were GM-resolve notes. Both
// muster the realm's troops as light infantry (the cheapest standard troop, 6gp — maximizes the
// force for the 1gp/family wage budget; the Judge re-organizes later). 🔧 v1: one representative
// light-infantry unit (over-strength allowed); the muster-schedule staging (½/¼/remainder) is shown
// on the obligation but the force materializes at grant.
const _FAVORDUTY_LEVY_WAGE = 6;   // man light infantry monthly wage (RR p.429)

// Find (or create) the liege's standing F&D army — the host his Call-to-Arms levies rally to.
function _findOrCreateFavorDutyArmy(campaign, liegeId, hexId, liegeName){
  if(!Array.isArray(campaign.armies)) campaign.armies = [];
  let army = campaign.armies.find(a => a && a.leaderCharacterId === liegeId && a._favorDutyArmy);
  if(!army){
    army = createArmy(campaign, { leaderCharacterId: liegeId, currentHexId: hexId || null,
      name: (liegeName ? liegeName + "'s" : 'Feudal') + ' Host' });
    army._favorDutyArmy = true;                                  // lazy marker — disbands when its last levy is revoked
  }
  return army;
}

// Materialize the troops for a freshly-granted Call-to-Arms duty or Troops favor. Records the created
// unit/army ids on the obligation (lazy fields) so a later revoke can dematerialize them.
function _favorDutyMaterializeTroops(campaign, obligation, ctx){
  if(!campaign || !obligation) return;
  const kind = obligation.kind;
  if(kind !== 'call-to-arms' && kind !== 'troops') return;
  const A = global.ACKS;
  const budget = Math.max(0, Math.round(obligation.gpPerMonth || 0));
  const count = Math.max(1, Math.floor(budget / _FAVORDUTY_LEVY_WAGE));
  const race = (ctx && ctx.race) || 'man';
  const vassalDomain = (ctx && ctx.vassalDomain) || null;
  const vassalName = (vassalDomain && vassalDomain.name) || 'the vassal';
  obligation.materializedUnitIds = obligation.materializedUnitIds || [];

  if(kind === 'call-to-arms'){
    // The vassal musters his realm's troops into the LIEGE's host (available to the lord until revoked).
    const liegeRuler = (campaign.characters || []).find(c => c && c.id === ctx.liegeId) || null;
    const hexId = (liegeRuler && liegeRuler.currentHexId)
      || (((campaign.hexes || []).find(h => h && h.domainId === (ctx.liegeDomain && ctx.liegeDomain.id))) || {}).id
      || null;
    const army = _findOrCreateFavorDutyArmy(campaign, ctx.liegeId, hexId, liegeRuler && liegeRuler.name);
    const u = A.blankUnit({ unitTypeKey: 'light-infantry', race, count, source: 'vassal',
      displayName: vassalName + ' Levy' });
    u.homeDomainId = vassalDomain ? vassalDomain.id : null;
    stationUnit(campaign, u, { kind: 'army', id: army.id });
    // keep the army's division roster honest (append to Main Body, or create it)
    if(!Array.isArray(army.divisions) || !army.divisions.length){
      army.divisions = [{ name: 'Main Body', commanderCharacterId: army.leaderCharacterId, adjutantCharacterId: null, unitIds: [u.id], role: 'main' }];
    } else if(!army.divisions[0].unitIds.includes(u.id)){
      army.divisions[0].unitIds.push(u.id);
    }
    obligation.materializedArmyId = army.id;
    obligation.materializedUnitIds.push(u.id);
  } else { // troops
    // The lord stations a garrison under the VASSAL's command; the vassal pays no wages (wageWaived).
    if(!vassalDomain) return;
    const u = A.blankUnit({ unitTypeKey: 'light-infantry', race, count, source: 'vassal',
      displayName: 'Liege Garrison' });
    u.homeDomainId = vassalDomain.id;
    u.wageWaived = true;                                         // RR p.348 — "the vassal pays no wages"
    stationUnit(campaign, u, { kind: 'domain-garrison', id: vassalDomain.id });
    obligation.materializedUnitIds.push(u.id);
  }
}

// Disband the troops a Call-to-Arms / Troops obligation materialized (on revoke). If the liege's F&D
// host has no units left after, it is disbanded too (the levies were the reason it existed).
function _favorDutyDematerializeTroops(campaign, obligation){
  if(!campaign || !obligation || !Array.isArray(obligation.materializedUnitIds)) return;
  for(const uid of obligation.materializedUnitIds.slice()){ disbandUnit(campaign, uid); }
  obligation.materializedUnitIds = [];
  if(obligation.materializedArmyId){
    const army = findArmy(campaign, obligation.materializedArmyId);
    if(army && army._favorDutyArmy && armyUnits(campaign, army).length === 0) disbandArmy(campaign, army);
    obligation.materializedArmyId = null;
  }
}

// =============================================================================
// §12 The Group model — the shared interface over the collective-actor kinds
// (Architecture.md §12). Party / Army / Unit / Band are ONE behavioral category — a
// positioned, mobile, fightable, persistent collective — but stay DISTINCT entities;
// these accessors are the shared contract the merged "Parties" view and the Player
// Portal `controllable` read through. Caravan is specced (§12.8) but its entity lands
// with the Ventures-RAW slice, so groupKindOf never returns it yet. The kind is sniffed
// by SIGNATURE (the shapes are disjoint — no new stored field). Cross-module reads
// (armyMarchProfile in maneuvers, journeyBaseSpeedMilesPerDay in subsystems) go through
// global.ACKS lazily, like unitTroopRow → findTroopType.
// =============================================================================

// Discriminate a group entity by signature. Army FIRST (it now also carries
// memberCharacterIds, the party tell), then unit / band / caravan, party last.
function groupKindOf(g){
  if(!g || typeof g !== 'object') return null;
  if(Array.isArray(g.divisions)) return 'army';
  if(g.unitTypeKey != null) return 'unit';
  if(g.groupTemplate != null) return 'band';
  if(g.cargo != null || g.ventureId != null) return 'caravan';   // reserved (§12.8)
  if(Array.isArray(g.memberCharacterIds)) return 'party';
  return null;
}

const GROUP_KIND_META = {
  party:   { icon: '🧭', label: 'Party' },
  army:    { icon: '🎖', label: 'Army' },
  unit:    { icon: '🪖', label: 'Unit' },
  band:    { icon: '🐉', label: 'Band' },
  caravan: { icon: '🐪', label: 'Caravan' }
};
function groupKindMeta(kind){ return GROUP_KIND_META[kind] || { icon: '•', label: 'Group' }; }

function groupDisplayName(g){
  const kind = groupKindOf(g);
  if(kind === 'unit') return g.displayName || g.unitTypeKey || 'Unit';
  if(kind === 'band') return g.name || (g.groupTemplate && g.groupTemplate.monsterCatalogKey) || 'Band';
  return g.name || g.id || '';   // party / army / caravan
}

// The INDIVIDUATED channel — member Characters (full sheets), deduped + order-preserving.
// Party members; army officers (leader + division commanders + adjutants + the roster);
// a unit's commander/lieutenant; a band's commander. This is what the members table renders.
function groupMembers(campaign, g){
  if(!campaign || !g) return [];
  const ids = [];
  const push = id => { if(id && !ids.includes(id)) ids.push(id); };
  const kind = groupKindOf(g);
  if(kind === 'party'){ (g.memberCharacterIds || []).forEach(push); }
  else if(kind === 'army'){
    push(g.leaderCharacterId);
    for(const dv of (g.divisions || [])){ push(dv && dv.commanderCharacterId); push(dv && dv.adjutantCharacterId); }
    (g.memberCharacterIds || []).forEach(push);
  } else if(kind === 'unit'){ push(g.commanderCharacterId); push(g.lieutenantCharacterId); }
  else if(kind === 'band'){ push(g.commanderCharacterId); }
  return ids.map(id => _findCharacterById(campaign, id)).filter(Boolean);
}

function groupLeader(campaign, g){
  if(!campaign || !g) return null;
  const kind = groupKindOf(g);
  const id = (kind === 'unit') ? (g.commanderCharacterId || g.lieutenantCharacterId)
           : (g.leaderCharacterId || g.commanderCharacterId);
  return id ? _findCharacterById(campaign, id) : null;
}

// The COUNTED channel — the formations the group carries: army → its stationed units;
// party → its members' mercenary-company units; an atom (unit/band) → itself.
function groupFormations(campaign, g){
  if(!campaign || !g) return [];
  const kind = groupKindOf(g);
  if(kind === 'army') return armyUnits(campaign, g);
  if(kind === 'unit' || kind === 'band') return [g];
  if(kind === 'party'){
    const out = [];
    for(const id of (g.memberCharacterIds || [])){
      const c = _findCharacterById(campaign, id);
      for(const u of characterMercenaryUnits(campaign, c)) if(u) out.push(u);
    }
    return out;
  }
  return [];
}

// The group's natural size: party → characters + their mercenaries; army → troops;
// unit → soldiers; band → creatures (active = count − casualties throughout).
function groupHeadcount(campaign, g){
  const kind = groupKindOf(g);
  if(kind === 'unit') return unitActiveCount(g);
  if(kind === 'band') return groupActiveCount(g);
  const counted = groupFormations(campaign, g).reduce((s, u) => s + unitActiveCount(u), 0);
  if(kind === 'party') return (g.memberCharacterIds || []).length + counted;
  return counted;   // army (troops) / caravan
}

// Where the group physically is, as a hex id. A nested member resolves to its CONTAINER'S
// position (a stationed unit → its army/garrison hex). Pure read.
function groupPosition(campaign, g){
  if(!campaign || !g) return null;
  const kind = groupKindOf(g);
  if(kind === 'unit') return unitCurrentHexId(campaign, g);
  if(kind === 'army'){
    if(g.currentHexId) return g.currentHexId;
    const u = armyUnits(campaign, g)[0];
    return u ? unitCurrentHexId(campaign, u) : null;
  }
  return g.currentHexId || null;   // party / band / caravan
}

// The group's active journey/march (the journey entity it rides), or null. A band
// wanders via the monster-bands consumer (no journey entity).
function groupJourney(campaign, g){
  if(!campaign || !g || !Array.isArray(campaign.journeys)) return null;
  const kind = groupKindOf(g);
  const jid = (kind === 'party') ? g.activeJourneyId
            : (kind === 'army')  ? g.journeyId
            : (kind === 'unit')  ? g.rallyJourneyId
            : null;
  return jid ? (campaign.journeys.find(j => j && j.id === jid) || null) : null;
}

// Daily movement in miles (best-effort; generalizes the per-kind reads).
function groupSpeed(campaign, g){
  const A = global.ACKS, kind = groupKindOf(g);
  if(kind === 'unit') return unitMarchMilesPerDay(g);
  if(kind === 'army' && A && typeof A.armyMarchProfile === 'function'){
    const p = A.armyMarchProfile(campaign, g); return p ? (p.milesPerDay || null) : null;
  }
  const j = groupJourney(campaign, g);
  if(j && A && typeof A.journeyBaseSpeedMilesPerDay === 'function') return A.journeyBaseSpeedMilesPerDay(campaign, j);
  return null;
}

// The per-day logistics model (a tagged union): party eats rations + drinks water;
// army/unit draw supplies (RR p.450); a band forages.
function groupLogistics(campaign, g){
  const kind = groupKindOf(g);
  if(kind === 'party')   return { model: 'rations-water' };
  if(kind === 'army')    return { model: 'supplies', simplified: g.supplySimplified !== false };
  if(kind === 'unit')    return { model: 'supplies', state: g.supplyState || 'supplied' };
  if(kind === 'band')    return { model: 'forage' };
  if(kind === 'caravan') return { model: 'supplies' };
  return { model: 'none' };
}

// The parent GROUP this one is nested in (the inverse of groupFormations): a unit
// stationed to an army → that army; else null. A lair holds a band but is not a group.
function groupContainer(campaign, g){
  if(!campaign || !g) return null;
  if(groupKindOf(g) === 'unit'){
    const st = g.stationedAt;
    if(st && st.kind === 'army') return findArmy(campaign, st.id);
  }
  return null;
}

// Autonomous = a top-level actor (a row in the merged view), i.e. NOT nested in another
// group. A unit is nested iff stationed to an army; a band iff a lair holds it;
// party/army/caravan are always autonomous (§12.5).
function groupIsAutonomous(campaign, g){
  const kind = groupKindOf(g);
  if(kind === 'unit') return !(g.stationedAt && g.stationedAt.kind === 'army');
  if(kind === 'band'){
    if(campaign && Array.isArray(campaign.lairs))
      return !campaign.lairs.some(l => l && Array.isArray(l.groupIds) && l.groupIds.includes(g.id));
    return true;
  }
  return true;
}

function groupLifecycleState(campaign, g){
  const kind = groupKindOf(g);
  if(kind === 'party') return g.status || 'active';
  if(kind === 'band')  return g.lifecycleState || 'wild';
  if(kind === 'unit')  return g.rallyingToArmyId ? 'rallying' : ((g.stationedAt && g.stationedAt.kind) || 'loose');
  if(kind === 'army')  return g.journeyId ? 'marching' : 'mustered';
  return 'active';
}

// The shared row descriptor for the merged "Parties" view tables. Pure data; the UI
// formats the hex label (hexName) + the link targets.
function groupRow(campaign, g){
  const kind = groupKindOf(g), meta = groupKindMeta(kind), leader = groupLeader(campaign, g);
  const j = groupJourney(campaign, g);
  return {
    kind, id: g.id, icon: meta.icon, kindLabel: meta.label,
    name: groupDisplayName(g),
    leaderName: leader ? (leader.name || '(unnamed)') : null,
    leaderId: leader ? leader.id : null,
    headcount: groupHeadcount(campaign, g),
    memberCount: groupMembers(campaign, g).length,
    hexId: groupPosition(campaign, g),
    onTheMove: !!(j && (j.status === 'in-transit' || j.status === 'resting' || j.status === 'lost')),
    journeyId: j ? j.id : null,
    lifecycle: groupLifecycleState(campaign, g)
  };
}

// The Units table: every unit NOT absorbed into an army (garrison / mercenary-company /
// rallying-in / hex). An army-stationed unit shows only under its army (§12.5).
function looseUnits(campaign){
  if(!campaign || !Array.isArray(campaign.units)) return [];
  return campaign.units.filter(u => u && !(u.stationedAt && u.stationedAt.kind === 'army'));
}

// The cross-kind enumerator: every AUTONOMOUS group in the world, as {kind, entity}
// (parties + armies + loose units; bands/caravans join as the view grows). opts.kinds
// filters; opts.includeNested keeps absorbed units / lair-bound bands.
function worldGroups(campaign, opts={}){
  if(!campaign) return [];
  const want = opts.kinds ? new Set(opts.kinds) : null;
  const out = [];
  const add = (entity) => {
    const kind = groupKindOf(entity);
    if(want && !want.has(kind)) return;
    if(!opts.includeNested && !groupIsAutonomous(campaign, entity)) return;
    out.push({ kind, entity });
  };
  for(const p of (campaign.parties || [])) if(p && p.status !== 'disbanded') add(p);
  for(const a of (campaign.armies || [])) add(a);
  for(const u of (campaign.units || [])) add(u);
  return out;
}

// The group (party / army / unit) that OWNS a journey — the inverse of groupJourney.
// A journey carries exactly one owner discriminator (armyId | unitId | partyId); a lone
// traveller (participantCharacterIds, no group) returns null. Lets the Journey Detail
// panel render group-aware (an army's march shows its units + supplies, not rations).
function groupForJourney(campaign, journeyOrId){
  if(!campaign) return null;
  const j = (typeof journeyOrId === 'string') ? (campaign.journeys || []).find(x => x && x.id === journeyOrId) : journeyOrId;
  if(!j) return null;
  if(j.armyId) return findArmy(campaign, j.armyId);
  if(j.unitId) return findUnit(campaign, j.unitId);
  if(j.partyId) return (campaign.parties || []).find(p => p && p.id === j.partyId) || null;
  return null;
}

// Muster an army FROM an existing party (§12.6 — the party→army transformation). The
// party's members become the army's individuated roster (its leader → the commander),
// each member's mercenary-company units → the army's first units, and the party is
// CONSUMED (its camp handed to the leader, members freed, the party removed). The army
// inherits the party's hex + (an in-transit) journey ends so the army marches anew.
// Returns the army. id-stable via opts.id (the createArmy idempotency pattern).
function musterArmyFromParty(campaign, partyOrId, opts={}){
  if(!campaign) return null;
  const party = (typeof partyOrId === 'string')
    ? (campaign.parties || []).find(p => p && p.id === partyOrId) : partyOrId;
  if(!party) return null;
  const memberIds = (party.memberCharacterIds || []).slice();
  const commanderId = opts.commanderCharacterId || party.leaderCharacterId || memberIds[0] || null;
  const hexId = opts.currentHexId || party.currentHexId || null;
  // the members' mercenary-company units become the army's units
  const unitIds = [];
  for(const id of memberIds){
    const c = _findCharacterById(campaign, id);
    for(const u of characterMercenaryUnits(campaign, c)) if(u && u.id) unitIds.push(u.id);
  }
  const army = createArmy(campaign, {
    id: opts.id,
    name: opts.name || (party.name ? (party.name + ' (army)') : ''),
    leaderCharacterId: commanderId,
    currentHexId: hexId,
    strategicStance: opts.strategicStance || 'defensive',
    unitIds
  });
  if(!army) return null;
  army.memberCharacterIds = memberIds.slice();   // the party's people become the army's roster
  // consume the party: hand its camp to the leader, free the members, remove it
  ACKS.handOffPartyCampToLeader(campaign, party);
  for(const id of memberIds){ const c = _findCharacterById(campaign, id); if(c && c.partyId === party.id) c.partyId = null; }
  if(party.activeJourneyId && Array.isArray(campaign.journeys)){
    const j = campaign.journeys.find(x => x && x.id === party.activeJourneyId);
    if(j && j.status === 'in-transit') j.status = 'arrived';
  }
  if(Array.isArray(campaign.parties)){
    const i = campaign.parties.findIndex(p => p && p.id === party.id);
    if(i >= 0) campaign.parties.splice(i, 1);
  }
  const turn = (campaign.currentTurn != null) ? campaign.currentTurn : 0;
  army.history.push({ turn, type: 'mustered-from-party', text: 'Mustered from the party ' + (party.name || party.id) });
  return army;
}

// Lazy-default the W1 military fields on a legacy garrison-unit object (additive; never
// clobbers existing values — idempotent).
function _lazyDefaultUnitFields(u){
  if(u.race == null) u.race = 'man';
  if(u.loadout === undefined) u.loadout = null;
  if(u.veteran == null) u.veteran = false;
  if(u.elite == null) u.elite = false;
  if(u.casualties == null) u.casualties = 0;
  if(u.source == null) u.source = 'mercenary';
  if(u.scale == null) u.scale = 'company';
  if(u.trainingState === undefined) u.trainingState = null;
  if(u.lieutenantCharacterId === undefined) u.lieutenantCharacterId = null;
  if(u.loyalty == null) u.loyalty = 0;
  if(u.moraleAdjustment == null) u.moraleAdjustment = 0;
  if(!Array.isArray(u.calamities)) u.calamities = [];
  if(u.supplyState == null) u.supplyState = 'supplied';
  // rallyingToArmyId / rallyJourneyId are transient runtime state (set only while a unit is
  // marching to rally — callUpUnit). NOT backfilled on load: a unit without them reads as
  // present (every consumer tests `=== army.id`), so templates stay migrate-no-ops.
  if(!Array.isArray(u.history)) u.history = [];
  if(u.notes == null) u.notes = '';
  return u;
}

// The W1 lift: every nested garrison/mercenary-company unit becomes a first-class
// member of campaign.units[] — the SAME object in both homes (reference-unified, the
// hexes/liftToTopLevelCollections precedent). Idempotent + self-healing both ways:
// a JSON round-trip duplicates the objects; on load the campaign.units copy wins as
// canonical and the nested entries are re-pointed at it; units present only in
// campaign.units with a garrison/character station are pushed back into their mirror.
function migrateGarrisonUnitsToUnits(campaign){
  if(!campaign) return campaign;
  if(!Array.isArray(campaign.units)) campaign.units = [];
  if(!Array.isArray(campaign.armies)) campaign.armies = [];
  const byId = new Map();
  for(const u of campaign.units){ if(u && u.id) byId.set(u.id, u); }
  function lift(arr, stationedAt){
    if(!Array.isArray(arr)) return;
    for(let i = 0; i < arr.length; i++){
      let u = arr[i];
      if(!u) continue;
      if(!u.id) u.id = ACKS.newId(ACKS.ID_PREFIXES.garrisonUnit);
      const canonical = byId.get(u.id);
      if(canonical && canonical !== u){ arr[i] = canonical; u = canonical; }
      _lazyDefaultUnitFields(u);
      if(!u.stationedAt) u.stationedAt = stationedAt;
      if(!byId.has(u.id)){ campaign.units.push(u); byId.set(u.id, u); }
    }
  }
  // Forward lift ONLY (T6 single-home): promote any old-save nested units to campaign.units. The
  // strip-unit-mirror load-migration (order 155) deletes the nested arrays right after, so there is
  // no reverse pass — campaign.units is the single home; the nested mirror is not rebuilt.
  for(const d of (campaign.domains || [])){
    if(d && d.garrison) lift(d.garrison.units, { kind: 'domain-garrison', id: d.id });
  }
  for(const c of (campaign.characters || [])){
    if(c && c.mercenaryCompany) lift(c.mercenaryCompany.units, { kind: 'character', id: c.id });
  }
  // Ensure every first-class unit has its lazy fields (the reverse pass used to do this).
  for(const u of campaign.units){ if(u) _lazyDefaultUnitFields(u); }
  return campaign;
}

// Self-register the garrison-units-to-units load-migration (Military W1; #442/§3.3 lift).
// Was an inline entry in the engine's load-migration seed array at order 150 (T5, 2026-06-23).
// Order preserved (runs after lazy-default @130, before strip-unit-mirror @155). Idempotent.
if (ACKS && typeof ACKS.registerLoadMigration === 'function') {
  ACKS.registerLoadMigration('garrison-units-to-units', migrateGarrisonUnitsToUnits, { order: 150 });
}

Object.assign(ACKS, {
  // #442 — Group entity lookups (Architecture.md §2.4, 2026-05-29)
  findGroup, groupsAtHex, groupsByCatalogKey, groupsCommandedBy, groupActiveCount,
  // Phase 3 Military W1 (2026-06-12) — Units & Armies: lookups, the shared battle interface
  // (unitBattleRating reads TROOP_CATALOG; groupBattleRating reads the MM per-creature BR),
  // officer characteristics (RR pp.435–437), stationing setter + the garrison lift.
  findUnit, findArmy, unitsStationedAt, armiesAtHex, unitActiveCount,
  armyUnits, domainGarrisonUnits, characterMercenaryUnits, armyDivisionForUnit, unitTroopRow, unitMarchMilesPerDay, unitCurrentHexId,
  unitBattleRating, groupBattleRating, unitWagePerSoldier, unitWageMonthly,
  unitWeeklySupplyCost, unitMoraleScore,
  proficiencyRanks, hasProficiencyNamed,
  leadershipAbility, strategicAbility, effectiveStrategicAbility, officerMoraleModifier,
  qualifiesAsOfficer, qualifiesAsCommander, qualifiesAsLieutenant,
  armyBattleRating, armyWageMonthly, armyWeeklySupplyCost, armyMaxDivisions,
  validateArmyOrganization, stationUnit, disbandUnit, setUnitHome, returnUnitHome, unitHomeDomainId, createArmy, disbandArmy, callUpUnit, addUnitToArmy, removeUnitFromArmy, startUnitMarch, stopUnitMarch, armyIncomingUnits, migrateGarrisonUnitsToUnits,
  // Garrison reaction — deploy a force to meet a domain threat (JJ pp.104–106, 2026-06-14)
  domainSeatHexId, reactionBandPlatoonBr, reactionForcePlatoonBr, garrisonReactionPreview, reactionForceOrgFindings, deployGarrisonReaction, recallReactionForce,
  // === Military W7 (burst4) — conscripts/militia/training + F&D call-to-arms/Troops materialization
  conscriptLevyMax, militiaLevyMax, domainLevyUnits, conscriptCount, militiaCalledUpCount,
  domainLevyPoolCount, domainLevyTrainedOfType, conscriptQualifyingRemaining,
  militiaDomainMoralePenalty, militiaRevenuePenaltyFamilies, domainTrainedMilitiaCredit,
  levyMoraleAdjustmentForDomain, canLevyFromDomain, domainMilitiaTroopTypeKey,
  domainMilitiaTroopRow, domainTrainedMilitiaPool,
  levyConscripts, levyMilitia, trainLevyUnit, sendMilitiaHome,
  levyEverRaised, levyAvailable, sendMilitiaUnitHome, callUpMilitia, releaseLevyUnit, processLevyReplenishmentForTurn,
  // W7-continuation — the training timer (RR p.431): training takes its months; a day-consumer completes it
  unitTrainingDaysLeft,
  // W7-continuation — the levy-arrival timer (RR p.430): levied troops arrive ½/¼/remainder over 3 weeks
  unitMusterDaysLeft,
  // W7-continuation — realm-scale mercenary recruitment (RR p.428): tier-scaled availability, per-period
  // cap, fee from the treasury, troops arrive ½/¼/remainder (ride the slot-46 muster consumer)
  realmRecruitTierForDomain, domainRealmRecruitedThisPeriod, domainRealmRecruitAvailable, recruitRealmTroops,
  // W7-continuation — realm-scale military specialists + the lightweight↔full NPC doctrine primitive
  expandCharacterToFull, recruitRealmSpecialist, domainRealmSpecialistAvailable, domainRealmSpecialistsRecruitedThisPeriod,
  // §12 Group model — the shared interface over party/army/unit/band (Architecture.md §12)
  groupKindOf, groupKindMeta, groupDisplayName, groupMembers, groupLeader, groupFormations,
  groupHeadcount, groupPosition, groupJourney, groupSpeed, groupLogistics, groupContainer,
  groupIsAutonomous, groupLifecycleState, groupRow, looseUnits, worldGroups, groupForJourney, musterArmyFromParty,
  // Phase 3 Military W2 — the Vagaries of Incursion derived reads (JJ pp.100–106)
  domainTerritoryHexCount, domainBorderConfiguration, domainEffectiveTerritory,
  domainIncursionClassification, domainDailyEncounterChance,
  unitPlatoonScaleBr, domainGarrisonPlatoonBr, monsterPlatoonBr,
  // T5 (2026-06-23) — privates exported for their engine-core callers (favor-duty troop bridge,
  // levy muster/training, domain-resolve); were engine-private, now reached via ACKS.*.
  _resolveDomain, _levyMusterNoun, _completeTraining, _favorDutyMaterializeTroops, _favorDutyDematerializeTroops
});

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
