/* =============================================================================
 * acks-engine-maneuvers.js — ACKS God Mode maneuvers engine (Phase 3 Military W4)
 *
 * The RR pp.447–460 campaign layer: armies MARCH on the journey engine
 * (journey.armyId — slowest-unit speed × large-army multiplier × war-machine cap,
 * the army weather table, forced march, the 3-of-7 rest/fatigue rule), the campaign
 * cycle runs on the Day Clock (initiative → reconnaissance → contact → battle →
 * occupation/conquest), full reconnaissance & intelligence (the printed modifier
 * set, the results matrix, prisoners + interrogation), and invading / occupying /
 * conquering / pillaging domains.
 *
 * Posture: RAW core, default-ON (no house rule gates the warfare layer — CLAUDE §6).
 * Derive-don't-store (§3.13): speeds, fatigue, occupation status, and opposition are
 * derived reads; stored state is what genuinely changed hands (intel reports,
 * occupation stamps, pillage state, marched-day windows).
 *
 * The slot-88 'military' day consumer lives in acks-engine-subsystems.js (it calls
 * into this module); the army-contact / army-recon / domain-warfare event kinds live
 * in acks-engine-events.js; the printed tables live in acks-engine-catalogs.js
 * (ARMY_LARGE_MULTIPLIERS, ARMY_WEATHER_EFFECTS, RECON_*, PILLAGE_*).
 *
 * Load order: AFTER acks-engine-battles.js (contact creates Battles), BEFORE
 * acks-engine-subsystems.js (the day consumer reads this module).
 * =============================================================================
 */
(function (global) {
  'use strict';
  const ACKS = global.ACKS = global.ACKS || {};
  function A(){ return global.ACKS; }

  // ── dice + small helpers ────────────────────────────────────────────────────
  function _d6(rng){ return 1 + Math.floor((rng || Math.random)() * 6); }
  function _2d6(rng){ return _d6(rng) + _d6(rng); }
  function _rollDice(spec, rng){
    if(!spec) return 0;
    let t = spec.flat || 0;
    for(let i = 0; i < (spec.n || 0); i++) t += 1 + Math.floor((rng || Math.random)() * spec.d);
    return t;
  }
  function _char(campaign, id){
    if(!campaign || !id) return null;
    return (campaign.characters || []).find(c => c && c.id === id) || null;
  }
  function _hex(campaign, hexId){
    if(!campaign || !hexId) return null;
    return (campaign.hexes || []).find(h => h && h.id === hexId) || null;
  }
  function _domain(campaign, domainId){
    if(!campaign || !domainId) return null;
    return (campaign.domains || []).find(d => d && d.id === domainId) || null;
  }
  function _constructible(campaign, id){
    if(!campaign || !id) return null;
    return (campaign.constructibles || []).find(c => c && c.id === id) || null;
  }
  // Absolute world ordinal (the lastTravelWorldOrd convention): turn*30 + dayInMonth.
  function worldOrd(campaign){
    return ((campaign && campaign.currentTurn) || 1) * 30 + ((campaign && campaign.currentDayInMonth) || 1);
  }
  function _armyHistory(campaign, army, type, narrative){
    if(!army) return;
    (army.history = army.history || []).push({
      turn: (campaign && campaign.currentTurn) || null,
      dayInMonth: (campaign && campaign.currentDayInMonth) || null,
      type, narrative
    });
  }

  // ── weather → war effects (RR p.449) ─────────────────────────────────────────
  // Resolve a day's weather into the RR p.449 effects bundle (weatherWarEffects). The
  // slot-88 consumer hands the day's weather in via opts.weather — either the weather
  // layer's consumer-normalized shape (.temperature = the lowercase band key) or a raw
  // weatherForHex result (.temperatureBand). _wxTemp normalizes both to the lowercase key.
  // No opts.weather ⇒ null (no effect): the coupling fires from the day-tick (where the
  // day's weather is known), not from a static UI supply readout.
  function _wxTemp(w){ return (w && (w.temperatureBand || w.temperature)) || null; }
  function _armyWeatherEffects(campaign, army, opts){
    const Ax = A();
    const w = opts && opts.weather;
    if(!w || typeof Ax.weatherWarEffects !== 'function') return null;
    return Ax.weatherWarEffects(w.condition || null, _wxTemp(w));
  }

  // ── army composition reads ──────────────────────────────────────────────────
  // Active soldiers across the army's units (count − casualties, floored at 0).
  function armyTroopCount(campaign, army){
    const Ax = A();
    let n = 0;
    for(const u of Ax.armyUnits(campaign, army)){
      n += Math.max(0, (u.count || 0) - (u.casualties || 0));
    }
    return n;
  }
  // Military W7 (burst4) — the army's troop composition by SOURCE (RR pp.427–433), for the
  // army-detail "troop depth" readout: active soldiers per source (mercenary / conscript / militia /
  // vassal / clanhold / follower / slave) with the trained/untrained split for levies. Pure read.
  function armyTroopSourceBreakdown(campaign, army){
    const Ax = A();
    const out = {};
    for(const u of Ax.armyUnits(campaign, army)){
      const active = Math.max(0, (u.count || 0) - (u.casualties || 0));
      if(active <= 0) continue;
      const src = u.source || 'mercenary';
      const row = out[src] || (out[src] = { source: src, soldiers: 0, units: 0, trained: 0, untrained: 0 });
      row.soldiers += active; row.units += 1;
      if(src === 'conscript' || src === 'militia'){
        if(u.unitTypeKey && u.unitTypeKey !== 'untrained-levy') row.trained += active; else row.untrained += active;
      }
    }
    return Object.keys(out).map(k => out[k]).sort((a, b) => b.soldiers - a.soldiers);
  }
  // Brigade equivalents (RR p.448 counts brigades; RR p.437 scale ratios convert
  // sub-brigade units: battalion ¼, company 1/16, platoon 1/64 of a brigade).
  const _BRIGADE_FRACTION = { brigade: 1, battalion: 1 / 4, company: 1 / 16, platoon: 1 / 64 };
  function armyBrigadeEquivalents(campaign, army){
    const Ax = A();
    let n = 0;
    for(const u of Ax.armyUnits(campaign, army)){
      if(Math.max(0, (u.count || 0) - (u.casualties || 0)) <= 0) continue;
      n += _BRIGADE_FRACTION[u.scale || 'company'] || _BRIGADE_FRACTION.company;
    }
    return n;
  }
  // Cavalry (+ flyers, when flying units exist) in COMPANY equivalents — the
  // scouting/screening strength bracket input (RR p.453: 4 platoons = 1 company,
  // battalion = 4, brigade = 16).
  const _COMPANY_FRACTION = { brigade: 16, battalion: 4, company: 1, platoon: 1 / 4 };
  function armyCavalryCompanyEquivalents(campaign, army){
    const Ax = A();
    let n = 0;
    for(const u of Ax.armyUnits(campaign, army)){
      if(Math.max(0, (u.count || 0) - (u.casualties || 0)) <= 0) continue;
      const row = (typeof Ax.findTroopType === 'function')
        ? Ax.findTroopType(u.unitTypeKey, { race: u.race || 'man', veteran: !!u.veteran, loadout: u.loadout || null })
        : null;
      if(row && row.category === 'cavalry') n += _COMPANY_FRACTION[u.scale || 'company'] || 1;
    }
    return n;
  }
  // An army is ON CAMPAIGN while it holds active troops (RR p.447: a campaign runs
  // from the troops leaving their garrisons until they return).
  function armyOnCampaign(campaign, army){
    return armyTroopCount(campaign, army) > 0;
  }

  // ── army march profile (RR pp.448–449) ─────────────────────────────────────
  // The full speed derivation, itemized for the UI: slowest active unit's expedition
  // speed (catalog move ft / 5 = mi/day — the printed Army Movement Speeds table),
  // × the large-army multiplier, capped by hauled war machines. Pace, weather, and
  // per-hex terrain multiply ON TOP in the journey walk (RR p.448 keys army movement
  // to the standard expedition rules).
  function armyMarchProfile(campaign, army){
    const Ax = A();
    let slowestMiles = Infinity, slowestUnit = null;
    for(const u of Ax.armyUnits(campaign, army)){
      if(Math.max(0, (u.count || 0) - (u.casualties || 0)) <= 0) continue;
      const row = (typeof Ax.findTroopType === 'function')
        ? Ax.findTroopType(u.unitTypeKey, { race: u.race || 'man', veteran: !!u.veteran, loadout: u.loadout || null })
        : null;
      // prefer the PRINTED unit daily move; fall back to exploration ft / 5 (the Army
      // Movement Speeds table, RR p.448: 30'→6 mi … 120'→24 mi); unkeyed → 24 🔧.
      const mi = (row && typeof row.unitDailyMoveMiles === 'number' && row.unitDailyMoveMiles > 0) ? row.unitDailyMoveMiles
               : (row && typeof row.moveFt === 'number' && row.moveFt > 0) ? row.moveFt / 5
               : 24;
      if(mi < slowestMiles){ slowestMiles = mi; slowestUnit = u; }
    }
    if(slowestMiles === Infinity) slowestMiles = 24;
    const baseMilesPerDay = slowestMiles;
    const brigades = armyBrigadeEquivalents(campaign, army);
    const largeRow = Ax.armyLargeMultiplierRow(brigades);
    let milesPerDay = baseMilesPerDay * largeRow.mult;
    // War machines cap the army's speed while hauled (RR p.449): assembled 6 mi/day,
    // disassembled 12. army.warMachines = null | {count, assembled} (lazy field).
    const wm = army && army.warMachines;
    let warMachineCap = null;
    if(wm && (wm.count || 0) > 0){
      warMachineCap = wm.assembled ? Ax.WAR_MACHINE_SPEED.assembled : Ax.WAR_MACHINE_SPEED.disassembled;
      milesPerDay = Math.min(milesPerDay, warMachineCap);
    }
    // Column length never exceeds the day's modified speed (RR p.448).
    const columnMiles = Math.min(largeRow.columnMiles, Math.max(1, milesPerDay));
    return {
      baseMilesPerDay, slowestUnitId: slowestUnit ? slowestUnit.id : null,
      slowestUnitName: slowestUnit ? (slowestUnit.displayName || slowestUnit.unitTypeKey) : null,
      brigadeEquivalents: brigades, largeMultiplier: largeRow.mult, largeLabel: largeRow.label,
      warMachineCap, milesPerDay, columnMiles
    };
  }
  function armyExpeditionSpeedMilesPerDay(campaign, army){
    return armyMarchProfile(campaign, army).milesPerDay;
  }

  // ── rest & fatigue (RR pp.448–449) ──────────────────────────────────────────
  // Stored windows (lazy on Army): marchedOrds[] = world ordinals the army marched on
  // (trimmed to the last 14); forcedMarchOrds[] = the subset at forced-march pace.
  // Derived: an army is FATIGUED when it marched more than 4 of the last 7 days
  // (RR p.448 — armies must rest 3 days in 7), or when it failed to rest the day
  // after a forced march (RR p.449) and hasn't rested since. RAW prints no unit-scale
  // battle modifier for fatigue — the flag is surfaced for the GM (the battle panel's
  // standing GM attack modifier is the lever).
  function recordArmyMarchDay(army, ord, pace){
    if(!army) return;
    if(!Array.isArray(army.marchedOrds)) army.marchedOrds = [];
    if(army.marchedOrds.indexOf(ord) < 0) army.marchedOrds.push(ord);
    army.marchedOrds = army.marchedOrds.filter(o => o > ord - 14).sort((a, b) => a - b);
    if(pace === 'forced-march'){
      if(!Array.isArray(army.forcedMarchOrds)) army.forcedMarchOrds = [];
      if(army.forcedMarchOrds.indexOf(ord) < 0) army.forcedMarchOrds.push(ord);
      army.forcedMarchOrds = army.forcedMarchOrds.filter(o => o > ord - 14).sort((a, b) => a - b);
    }
  }
  function armyFatigued(campaign, army, atOrd){
    const ord = (typeof atOrd === 'number') ? atOrd : worldOrd(campaign);
    const marched = (army && army.marchedOrds) || [];
    const reasons = [];
    // 3-of-7 rest rule: marched >4 of the last 7 days (today included).
    const last7 = marched.filter(o => o > ord - 7 && o <= ord);
    if(last7.length > 4) reasons.push('marched ' + last7.length + ' of the last 7 days (rest 3 in 7, RR p.448)');
    // Forced march: must rest the day after, or fatigued until a rest day happens.
    // Only fully ELAPSED days count as rest — the day being evaluated is still in
    // progress (the army is fatigued on its rest day, recovered the day after).
    const forced = (army && army.forcedMarchOrds) || [];
    for(const f of forced){
      if(f >= ord) continue;
      if(marched.indexOf(f + 1) >= 0){
        let rested = false;
        for(let o = f + 2; o <= ord - 1; o++){ if(marched.indexOf(o) < 0){ rested = true; break; } }
        if(!rested){ reasons.push('no rest day since the forced march (RR p.449)'); break; }
      }
    }
    return { fatigued: reasons.length > 0, reasons };
  }

  // ── opposition & allegiance ─────────────────────────────────────────────────
  // A leader's apex ruler: walk up the liege chain of the domains he rules. A
  // domainless leader (a mercenary general) is his own apex.
  function _apexRulerId(campaign, leaderId){
    if(!campaign || !leaderId) return leaderId || null;
    let currentLeader = leaderId;
    const seen = {};
    for(let i = 0; i < 20; i++){
      if(seen[currentLeader]) break;
      seen[currentLeader] = true;
      const ruled = (campaign.domains || []).find(d => d && d.rulerCharacterId === currentLeader);
      if(!ruled || !ruled.liegeId) return currentLeader;
      const liegeDomain = _domain(campaign, ruled.liegeId);
      const liegeRuler = liegeDomain ? liegeDomain.rulerCharacterId : null;
      if(!liegeRuler || liegeRuler === currentLeader) return currentLeader;
      currentLeader = liegeRuler;
    }
    return currentLeader;
  }
  // Two leaders are OPPOSED unless they share a realm (same apex ruler via the
  // vassalage graph) or one army lists the other's leader as an ally (GM field).
  function leadersOpposed(campaign, aLeaderId, bLeaderId){
    if(!aLeaderId || !bLeaderId) return true;
    if(aLeaderId === bLeaderId) return false;
    return _apexRulerId(campaign, aLeaderId) !== _apexRulerId(campaign, bLeaderId);
  }
  function armiesOpposed(campaign, armyA, armyB){
    if(!armyA || !armyB || armyA.id === armyB.id) return false;
    const aAllies = (armyA.alliedLeaderCharacterIds || []);
    const bAllies = (armyB.alliedLeaderCharacterIds || []);
    if(armyB.leaderCharacterId && aAllies.indexOf(armyB.leaderCharacterId) >= 0) return false;
    if(armyA.leaderCharacterId && bAllies.indexOf(armyA.leaderCharacterId) >= 0) return false;
    return leadersOpposed(campaign, armyA.leaderCharacterId, armyB.leaderCharacterId);
  }
  // Is this domain friendly ground for the army? (Entering unfriendly ground
  // uninvited = INVASION, RR p.458.) Friendly = the leader rules it, shares its
  // realm, or the army carries the GM's permission mark.
  function domainFriendlyToArmy(campaign, domain, army){
    if(!domain || !army) return true;
    if((army.permittedDomainIds || []).indexOf(domain.id) >= 0) return true;
    const leaderId = army.leaderCharacterId;
    if(!leaderId) return false;
    if(domain.rulerCharacterId === leaderId) return true;
    return !leadersOpposed(campaign, leaderId, domain.rulerCharacterId);
  }

  // ── initiative (RR p.447) ───────────────────────────────────────────────────
  // 1d6 + the leader's strategic ability; a forced march ordered BEFORE the roll
  // (= the army's journey already stands at forced-march pace) adds +2.
  function rollArmyInitiative(campaign, army, opts){
    const Ax = A();
    const rng = (opts && opts.rng) || Math.random;
    const leader = _char(campaign, army && army.leaderCharacterId);
    const sa = leader && typeof Ax.strategicAbility === 'function' ? Ax.strategicAbility(leader) : 0;
    const j = army && army.journeyId ? (typeof Ax.findJourney === 'function' ? Ax.findJourney(campaign, army.journeyId) : null) : null;
    const forcedBonus = (j && j.status === 'in-transit' && j.pace === 'forced-march') ? 2 : 0;
    const roll = _d6(rng);
    return { roll, sa, forcedBonus, total: roll + sa + forcedBonus };
  }

  // ── reconnaissance (RR pp.452–457) ──────────────────────────────────────────
  // Position reads accept per-call hex overrides (opts.obsHexId / opts.oppHexId) so
  // the day consumer can evaluate POST-march positions from the shared day stash
  // before the journey records commit.
  function _armyHexCoord(campaign, army, hexIdOverride){
    const h = _hex(campaign, hexIdOverride || (army && army.currentHexId));
    return (h && h.coord) ? h.coord : null;
  }
  function armyHexDistance(campaign, armyA, armyB, opts){
    const Ax = A();
    const a = _armyHexCoord(campaign, armyA, opts && opts.obsHexId);
    const b = _armyHexCoord(campaign, armyB, opts && opts.oppHexId);
    if(!a || !b || typeof Ax.hexAxialDistance !== 'function') return null;
    return Ax.hexAxialDistance(a, b);
  }
  // In reconnaissance range? (RR p.452 — by the OPPOSING army's size, in 24-mile
  // hexes; 🔧 quantized 1 twenty-four-mile hex = 4 six-mile hexes.)
  function armyInReconRange(campaign, observer, opposing, opts){
    const Ax = A();
    const dist = armyHexDistance(campaign, observer, opposing, opts);
    if(dist == null) return false;
    return dist <= Ax.reconRange24(armyTroopCount(campaign, opposing)) * 4;
  }
  // The full reconnaissance roll (RR pp.453–455), itemized. GM-undeable state the
  // engine can't see (magic, spies, stratagems) rides two standing per-army fields:
  // army.reconModifier (added to ITS observing rolls) and army.concealmentModifier
  // (added to rolls made AGAINST it — screens, camouflage). Region familiarity is
  // derived: a leader whose realm holds the opposing army's hex knows the ground.
  function armyReconRoll(campaign, observer, opposing, opts){
    const Ax = A();
    const rng = (opts && opts.rng) || Math.random;
    const dist = armyHexDistance(campaign, observer, opposing, opts);
    const oppTroops = armyTroopCount(campaign, opposing);
    const mods = [];
    mods.push({ label: 'opposing army of ' + oppTroops + ' (' + Ax.armySizeBandLabel(oppTroops) + ')', value: Ax.reconSizeMod(oppTroops) });
    mods.push({ label: 'proximity (' + (dist != null ? dist + ' hexes' : 'unknown') + ')', value: Ax.reconProximityMod(dist) });
    // leadership: higher SA observes better (RR p.453)
    const obsLeader = _char(campaign, observer && observer.leaderCharacterId);
    const oppLeader = _char(campaign, opposing && opposing.leaderCharacterId);
    const obsSa = obsLeader && typeof Ax.strategicAbility === 'function' ? Ax.strategicAbility(obsLeader) : 0;
    const oppSa = oppLeader && typeof Ax.strategicAbility === 'function' ? Ax.strategicAbility(oppLeader) : 0;
    if(obsSa > oppSa) mods.push({ label: 'higher strategic ability', value: 1 });
    else if(oppSa > obsSa) mods.push({ label: 'lower strategic ability', value: -1 });
    // scouting & screening (RR p.453) — cavalry/flyer company equivalents, range-limited
    // to the same + adjacent 24-mile hexes (🔧 ≤ 8 six-mile hexes).
    if(dist == null || dist <= 8){
      const obsCav = armyCavalryCompanyEquivalents(campaign, observer);
      const oppCav = armyCavalryCompanyEquivalents(campaign, opposing);
      const scout = Ax.reconScoutingMod(obsCav);
      const screen = -Ax.reconScoutingMod(oppCav);
      if(scout) mods.push({ label: 'scouting with ' + obsCav + ' cavalry units', value: scout });
      if(screen) mods.push({ label: 'screened by ' + oppCav + ' cavalry units', value: screen });
      if(obsCav > oppCav) mods.push({ label: 'more cavalry overall', value: 1 });
      else if(oppCav > obsCav) mods.push({ label: 'fewer cavalry overall', value: -1 });
    }
    // terrain — the OPPOSING army's hex (RR p.453)
    const oppHex = _hex(campaign, (opts && opts.oppHexId) || (opposing && opposing.currentHexId));
    if(oppHex){
      const tk = (typeof Ax.terrainKey === 'function') ? Ax.terrainKey(oppHex) : (oppHex.terrain || '');
      const tv = Ax.reconTerrainMod(tk);
      if(tv) mods.push({ label: 'their terrain (' + (oppHex.terrain || '?') + ')', value: tv });
    }
    // weather (RR p.449) — foul weather over the OBSERVING army hampers its scouting:
    // rainy/snowy −2 anywhere; windy/stormy −4 ONLY in barrens/desert (blowing sand/snow
    // blinds the watch). Fires only when the day-tick hands the day's weather down via
    // opts.weather (no on-demand roll → a weatherless recon / a static readout sees no
    // effect, so the seeded 2d6 stream is unchanged unless weather is actually present).
    const wx = _armyWeatherEffects(campaign, observer, opts);
    if(wx && wx.reconMod){
      const obsHex = _hex(campaign, (opts && opts.obsHexId) || (observer && observer.currentHexId));
      const obsBase = (obsHex && typeof Ax.terrainBase === 'function') ? Ax.terrainBase(obsHex.terrain) : ((obsHex && obsHex.terrain) || '');
      if(!wx.reconBarrensDesertOnly || obsBase === 'barrens' || obsBase === 'desert'){
        mods.push({ label: (wx.conditionLabel || 'severe') + ' weather' + (wx.reconBarrensDesertOnly ? ' (barrens/desert)' : ''), value: wx.reconMod });
      }
    }
    // region familiarity — derived from whose realm the ground belongs to.
    const obsFam = _armyFamiliarWithHex(campaign, observer, oppHex);
    const oppFam = _armyFamiliarWithHex(campaign, opposing, oppHex);
    if(obsFam && !oppFam) mods.push({ label: 'more familiar with the region', value: 1 });
    else if(oppFam && !obsFam) mods.push({ label: 'less familiar with the region', value: -1 });
    // standing GM modifiers: magic, spies, stratagems (🔧 the engine can't see these)
    const obsMod = Number(observer && observer.reconModifier) || 0;
    if(obsMod) mods.push({ label: 'magic / spies / stratagems (GM)', value: obsMod });
    const oppConceal = Number(opposing && opposing.concealmentModifier) || 0;
    if(oppConceal) mods.push({ label: 'their camouflage / deception (GM)', value: oppConceal });
    if(opts && opts.gmMod) mods.push({ label: 'GM adjustment', value: opts.gmMod });
    const applied = mods.filter(m => m.value !== 0);
    const roll = _2d6(rng);
    const total = roll + applied.reduce((s, m) => s + m.value, 0);
    const band = Ax.reconRollBand(total);
    return { roll, total, mods: applied, result: band.key, resultLabel: band.label, hexDistance: dist };
  }
  function _armyFamiliarWithHex(campaign, army, hex){
    if(!army || !hex || !hex.domainId) return false;
    const leaderId = army.leaderCharacterId;
    if(!leaderId) return false;
    const dom = _domain(campaign, hex.domainId);
    if(!dom) return false;
    return !leadersOpposed(campaign, leaderId, dom.rulerCharacterId);
  }
  // Build the stored intelligence report from a recon outcome (RR p.455's results
  // matrix). Captures the revealed snapshot AT ROLL TIME (intel goes stale — the
  // world moves on; that is RAW's own fog of war). A catastrophe stores FALSE
  // intelligence flagged for the Judge's eyes only.
  function buildIntelReport(campaign, observer, opposing, recon, opts){
    const Ax = A();
    const rng = (opts && opts.rng) || Math.random;
    const ord = (opts && opts.atOrd) != null ? opts.atOrd : worldOrd(campaign);
    const report = {
      atOrd: ord, atTurn: (campaign && campaign.currentTurn) || 1, atDayInMonth: (campaign && campaign.currentDayInMonth) || 1,
      opposingArmyId: opposing ? opposing.id : null,
      roll: recon.roll, total: recon.total, mods: recon.mods, result: recon.result, resultLabel: recon.resultLabel,
      hexDistance: recon.hexDistance,
      falseIntel: recon.result === 'catastrophe',   // GM-facing flag — present it as a marginal success (RR p.455)
      revealed: null, prisoner: null
    };
    const degree = (recon.result === 'marginal' || recon.result === 'success' || recon.result === 'major') ? recon.result
                 : (recon.result === 'catastrophe' ? 'marginal' : null);
    if(!degree) return report;
    const spec = Ax.reconResultsFor(recon.hexDistance, degree);
    if(!spec) return report;
    const troops = armyTroopCount(campaign, opposing);
    const revealed = {
      locationPrecision: spec.location,
      locationHexId: (spec.location === '6-mile hex') ? (opposing.currentHexId || null) : null,
      reveals: spec.reveals.slice()
    };
    if(spec.reveals.indexOf('size') >= 0) revealed.sizeBand = Ax.armySizeBandLabel(troops);
    if(spec.reveals.indexOf('direction') >= 0) revealed.direction = _armyDirectionOfMarch(campaign, opposing);
    if(spec.reveals.indexOf('divisions') >= 0) revealed.divisions = ((opposing && opposing.divisions) || []).length;
    if(spec.reveals.indexOf('units-per-division') >= 0){
      revealed.unitsPerDivision = ((opposing && opposing.divisions) || []).map(dv => ((dv && dv.unitIds) || []).length);
      revealed.unitScale = armyDominantScale(campaign, opposing);
    }
    if(spec.reveals.indexOf('unit-types') >= 0){
      revealed.unitTypes = A().armyUnits(campaign, opposing).map(u => u.displayName || u.unitTypeKey);
    }
    if(spec.reveals.indexOf('unit-strengths') >= 0){
      revealed.unitStrengths = A().armyUnits(campaign, opposing).map(u => ({ name: u.displayName || u.unitTypeKey, troops: Math.max(0, (u.count || 0) - (u.casualties || 0)) }));
    }
    report.revealed = revealed;
    // Prisoners (RR p.456): 1d3 pieces, each a 1d8 topic; a repeat shifts one grade
    // right. Rolled NOW, kept GM-secret on the report until interrogated.
    if(spec.prisoner){
      const gradeIdx = Math.max(0, Ax.PRISONER_GRADES.indexOf(spec.prisoner));
      const nPieces = 1 + Math.floor(rng() * 3);
      const pieces = [];
      const seen = {};
      for(let i = 0; i < nPieces; i++){
        const d8 = 1 + Math.floor(rng() * 8);
        const gi = Math.min(Ax.PRISONER_GRADES.length - 1, gradeIdx + (seen[d8] || 0));
        seen[d8] = (seen[d8] || 0) + 1;
        pieces.push({ d8, grade: Ax.PRISONER_GRADES[gi], text: Ax.prisonerInformationText(d8, Ax.PRISONER_GRADES[gi]) });
      }
      report.prisoner = { grade: spec.prisoner, pieces, revealedPieceIdxs: [] };
    }
    return report;
  }
  function _armyDirectionOfMarch(campaign, army){
    const Ax = A();
    const j = army && army.journeyId && typeof Ax.findJourney === 'function' ? Ax.findJourney(campaign, army.journeyId) : null;
    if(!j || j.status !== 'in-transit') return 'stationary';
    const days = j.days || [];
    const last = days[days.length - 1];
    const path = last && last.hexPath;
    if(path && path.length >= 1){
      const from = (path.length >= 2) ? path[path.length - 2] : null;
      const to = path[path.length - 1];
      const fromC = from ? { q: from.q, r: from.r } : (_armyHexCoord(campaign, army) || null);
      if(fromC && to){
        const dq = to.q - fromC.q, dr = to.r - fromC.r;
        return _axialHeadingLabel(dq, dr);
      }
    }
    return 'on the march';
  }
  function _axialHeadingLabel(dq, dr){
    if(dq === 0 && dr === 0) return 'stationary';
    if(dq > 0 && dr < 0) return 'northeast';
    if(dq > 0) return 'east';
    if(dq < 0 && dr > 0) return 'southwest';
    if(dq < 0) return 'west';
    return dr < 0 ? 'north' : 'south';
  }
  function armyDominantScale(campaign, army){
    const counts = {};
    for(const u of A().armyUnits(campaign, army)){ counts[u.scale || 'company'] = (counts[u.scale || 'company'] || 0) + 1; }
    let best = 'company', bestN = -1;
    for(const k of Object.keys(counts)){ if(counts[k] > bestN){ best = k; bestN = counts[k]; } }
    return best;
  }
  // The latest stored intel an army holds on an opposing army (null = none).
  function latestIntelOn(campaign, army, opposingArmyId){
    const reports = (army && army.intelReports) || [];
    for(let i = reports.length - 1; i >= 0; i--){
      if(reports[i] && reports[i].opposingArmyId === opposingArmyId) return reports[i];
    }
    return null;
  }
  // Interrogate a held prisoner from an intel report (RR p.457): 2d6 + the
  // interrogator's CHA modifier + the GM's judgment (proficiencies, bribes —
  // Judge-priced, the printed example offers a month's pay for +3).
  function interrogatePrisoner(campaign, spec){
    const Ax = A();
    const rng = (spec && spec.rng) || Math.random;
    const army = typeof Ax.findArmy === 'function' ? Ax.findArmy(campaign, spec.armyId) : null;
    if(!army) return { ok: false, reason: 'no-army' };
    const reports = army.intelReports || [];
    const report = reports[spec.reportIndex];
    if(!report || !report.prisoner) return { ok: false, reason: 'no-prisoner' };
    const interrogator = _char(campaign, spec.interrogatorCharacterId);
    const chaMod = interrogator && typeof Ax.abilityMod === 'function' ? Ax.abilityMod((interrogator.abilities || {}).CHA || 10) : 0;
    const gmMod = Number(spec.gmMod) || 0;
    const roll = _2d6(rng);
    const total = roll + chaMod + gmMod;
    const band = Ax.interrogationBand(total);
    const p = report.prisoner;
    const out = { ok: true, roll, chaMod, gmMod, total, result: band.key, resultLabel: band.label, revealedPieces: [] };
    if(band.key === 'false'){
      out.falseInformation = true;   // GM presents an invented piece as if real (RR p.457)
    } else if(band.pieces > 0){
      const unrevealed = p.pieces.map((piece, i) => ({ piece, i })).filter(x => p.revealedPieceIdxs.indexOf(x.i) < 0);
      const take = Math.min(band.pieces, unrevealed.length);
      for(let k = 0; k < take; k++){
        p.revealedPieceIdxs.push(unrevealed[k].i);
        out.revealedPieces.push(unrevealed[k].piece);
      }
    }
    (report.interrogations = report.interrogations || []).push({
      atOrd: worldOrd(campaign), interrogatorCharacterId: spec.interrogatorCharacterId || null,
      roll, chaMod, gmMod, total, result: band.key, revealed: out.revealedPieces.length
    });
    return out;
  }
  // Awareness for the strategic-situation matrices, from the two contact recon
  // results: a side is AWARE on marginal+ (it located the enemy here); a failure —
  // or a catastrophe's false picture — leaves it unaware (surprised).
  function contactAwareness(reconA, reconB){
    const aware = r => r && (r.result === 'marginal' || r.result === 'success' || r.result === 'major');
    const a = aware(reconA), b = aware(reconB);
    if(a && b) return 'mutual';
    if(a) return 'unilateral-a';
    if(b) return 'unilateral-b';
    return 'mutual-unawareness';
  }

  // ── the march verbs ─────────────────────────────────────────────────────────
  // Start an army's march: build + start a journey owned by the army (journey.armyId).
  // Army journeys carry NO character participants — the army IS the traveller (its
  // speed, its weather table, no per-hex encounter draws, no survival; supply is W5).
  function startArmyMarch(campaign, armyId, opts){
    const Ax = A();
    const army = typeof Ax.findArmy === 'function' ? Ax.findArmy(campaign, armyId) : null;
    if(!army) return { ok: false, reason: 'no-army' };
    if(!armyOnCampaign(campaign, army)) return { ok: false, reason: 'no-units' };
    if(army.pillage) return { ok: false, reason: 'pillaging' };   // a pillaging army cannot move (RR p.459)
    const existing = army.journeyId && typeof Ax.findJourney === 'function' ? Ax.findJourney(campaign, army.journeyId) : null;
    if(existing && existing.status === 'in-transit') return { ok: false, reason: 'already-marching' };
    if(!army.currentHexId) return { ok: false, reason: 'no-position' };
    if(!opts || !opts.destinationHexId) return { ok: false, reason: 'no-destination' };
    const j = Ax.blankJourney({
      name: (army.name || 'Army') + ' — march',
      startHexId: army.currentHexId,
      destinationHexId: opts.destinationHexId,
      waypoints: (opts.waypointHexIds || []).map(hid => ({ hexId: hid, label: '', plannedPurpose: null })),
      pace: opts.pace || 'normal',
      purpose: 'military-campaign',
      participantCharacterIds: []
    });
    j.armyId = army.id;
    campaign.journeys = campaign.journeys || [];
    campaign.journeys.push(j);
    if(typeof Ax.startJourney === 'function') Ax.startJourney(campaign, j);
    army.journeyId = j.id;
    _armyHistory(campaign, army, 'march-started', (army.name || 'The army') + ' set out toward ' + opts.destinationHexId + (j.pace === 'forced-march' ? ' at a forced march' : '') + '.');
    return { ok: true, journey: j };
  }
  function stopArmyMarch(campaign, armyId, reason){
    const Ax = A();
    const army = typeof Ax.findArmy === 'function' ? Ax.findArmy(campaign, armyId) : null;
    if(!army || !army.journeyId) return { ok: false, reason: 'not-marching' };
    const j = typeof Ax.findJourney === 'function' ? Ax.findJourney(campaign, army.journeyId) : null;
    if(j && j.status === 'in-transit' && typeof Ax.abortJourney === 'function') Ax.abortJourney(campaign, j, reason || 'army halted');
    army.journeyId = null;
    _armyHistory(campaign, army, 'march-stopped', (army.name || 'The army') + ' halted' + (reason ? (': ' + reason) : '') + '.');
    return { ok: true };
  }

  // Emit a warfare audit event directly (the GM-verb path — conquest, a cut-short pillage, a
  // border-fort build; the day consumer's records flow through the day-tick notable channel
  // instead). The startJourney emission pattern. `kind` defaults to 'domain-warfare'.
  function _emitWarfareEvent(campaign, payload, context, narrative, kind){
    try {
      const Ax = A();
      campaign.eventLog = campaign.eventLog || [];
      const cal = campaign.calendar || {};
      const ev = Ax.newEvent(kind || 'domain-warfare', {
        submittedBy: 'engine', status: (Ax.EVENT_STATUS && Ax.EVENT_STATUS.APPLIED) || 'applied', cadence: 'daily',
        targetTurn: campaign.currentTurn || 1,
        gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: campaign.currentDayInMonth || 1 },
        context: Object.assign({ primaryHexId: null, involvedHexIds: [], settlementId: null, domainId: null, relatedEntities: [] }, context || {}),
        payload: Object.assign({}, payload, { narrative })
      });
      ev.appliedAtTurn = campaign.currentTurn || 1;
      campaign.eventLog.push({ event: ev, result: { narrativeSummary: narrative }, appliedAtTurn: campaign.currentTurn || 1, appliedAt: new Date().toISOString() });
    } catch(e){ /* never let event emission block the verb */ }
  }

  // ── invasion & the immediate morale roll (RR p.458) ────────────────────────
  // Pure compute: the immediate domain morale roll an invasion or a pillage forces.
  // Reuses the monthly machinery (moraleModifiersFor + moraleChangeFromRoll) so the
  // arithmetic can't drift from the turn engine. extraMods ride on top (the pillage
  // −4; the friendly-army-counts-as-garrison row). Returns the itemized result; the
  // caller applies it (propose-review-commit).
  function immediateDomainMoraleRoll(campaign, domain, opts){
    const Ax = A();
    const rng = (opts && opts.rng) || Math.random;
    const mods = (typeof Ax.moraleModifiersFor === 'function' ? Ax.moraleModifiersFor(campaign, domain) : []).slice();
    for(const m of ((opts && opts.extraMods) || [])){ if(m && m.value) mods.push(m); }
    const modSum = mods.reduce((s, m) => s + (m.value || 0), 0);
    const roll = _2d6(rng);
    const adjusted = roll + modSum;
    const before = (domain.demographics && domain.demographics.morale) || 0;
    const ruler = typeof Ax.effectiveRuler === 'function' ? Ax.effectiveRuler(campaign, domain) : {};
    const classification = typeof Ax.effectiveDomainClassification === 'function' ? Ax.effectiveDomainClassification(domain) : 'civilized';
    const base = typeof Ax.baseMoraleFromClassification === 'function' ? Ax.baseMoraleFromClassification(classification, ruler) : 0;
    const change = typeof Ax.moraleChangeFromRoll === 'function' ? Ax.moraleChangeFromRoll(adjusted, before, base) : 0;
    const after = Math.max(-4, Math.min(4, before + change));
    return { roll, mods, modSum, adjusted, before, base, change, after };
  }
  function applyImmediateMoraleResult(campaign, domain, result){
    if(!domain || !result) return;
    if(!domain.demographics) domain.demographics = {};
    domain.demographics.morale = result.after;
  }
  // The friendly-army-counts-as-garrison row for an INVADED domain's immediate roll
  // (RR p.458): a same-realm army standing in the domain steadies the peasants even
  // though it isn't the domain's own garrison.
  function invasionGarrisonSupportMods(campaign, domain){
    const Ax = A();
    const domHexIds = {};
    for(const h of (campaign.hexes || [])){ if(h && h.domainId === domain.id) domHexIds[h.id] = true; }
    let friendlyWages = 0;
    for(const ar of (campaign.armies || [])){
      if(!ar || !ar.currentHexId || !domHexIds[ar.currentHexId]) continue;
      if(leadersOpposed(campaign, ar.leaderCharacterId, domain.rulerCharacterId)) continue;
      friendlyWages += (typeof Ax.armyWageMonthly === 'function') ? Ax.armyWageMonthly(campaign, ar) : 0;
    }
    if(friendlyWages <= 0) return [];
    const fam = Math.max(1, (domain.demographics && domain.demographics.peasantFamilies) || 0);
    const perFam = friendlyWages / fam;
    const req = (typeof Ax.requiredGarrison === 'function' && typeof Ax.totalFamilies === 'function' && Ax.totalFamilies(domain) > 0)
      ? Ax.requiredGarrison(campaign, domain) / Ax.totalFamilies(domain) : 2;
    if(perFam >= req) return [{ label: 'Friendly army in the domain counts as garrison (RR p.458)', value: 1 }];
    return [];
  }

  // ── occupation (RR p.458) ───────────────────────────────────────────────────
  // The printed math: occupying troops' wages/month − the defending garrison's
  // wages/month, ÷ peasant families, vs the domain's garrison cost (2–4gp/family).
  // Marcus/Sarotem worked example: (6,000 − 1,200) / 500 = 9.6 > 2 → occupied.
  function domainOccupationStatus(campaign, domain, opts){
    const Ax = A();
    if(!campaign || !domain) return { occupied: false };
    const overrides = (opts && opts.armyHexOverrides) || null;
    const posOf = ar => (overrides && overrides[ar.id]) || ar.currentHexId;
    const domHexIds = {};
    for(const h of (campaign.hexes || [])){ if(h && h.domainId === domain.id) domHexIds[h.id] = true; }
    // occupying troops: every unfriendly army positioned in the domain (the largest
    // contributor's leader is the occupier; multi-leader invasions are 🔧 keyed to him)
    let occupyingWages = 0, occupierLeaderId = null, occupierBest = -1, occupierArmyIds = [];
    for(const ar of (campaign.armies || [])){
      if(!ar || !posOf(ar) || !domHexIds[posOf(ar)]) continue;
      if(domainFriendlyToArmy(campaign, domain, ar)) continue;
      const w = (typeof Ax.armyWageMonthly === 'function') ? Ax.armyWageMonthly(campaign, ar) : 0;
      occupyingWages += w;
      occupierArmyIds.push(ar.id);
      if(w > occupierBest){ occupierBest = w; occupierLeaderId = ar.leaderCharacterId || null; }
    }
    // defenders: the domain's own garrison spend + friendly armies present
    let defendingWages = (typeof Ax.garrisonCost === 'function') ? Ax.garrisonCost(campaign, domain) : 0;
    for(const ar of (campaign.armies || [])){
      if(!ar || !posOf(ar) || !domHexIds[posOf(ar)]) continue;
      if(!domainFriendlyToArmy(campaign, domain, ar)) continue;
      defendingWages += (typeof Ax.armyWageMonthly === 'function') ? Ax.armyWageMonthly(campaign, ar) : 0;
    }
    const fam = (domain.demographics && domain.demographics.peasantFamilies) || 0;
    const totalFam = (typeof Ax.totalFamilies === 'function') ? Ax.totalFamilies(domain) : fam;
    const threshold = (totalFam > 0 && typeof Ax.requiredGarrison === 'function')
      ? Ax.requiredGarrison(campaign, domain) / totalFam : 2;
    const netPerFamily = fam > 0 ? (occupyingWages - defendingWages) / fam : 0;
    return {
      occupied: fam > 0 && netPerFamily > threshold,
      occupierLeaderId, occupierArmyIds, occupyingWages, defendingWages,
      peasantFamilies: fam, netPerFamily, threshold
    };
  }
  // Stamp the occupation (RR p.458): control of the peasants passes; the occupier
  // suffers a morale penalty = the prior ruler's morale at occupation (min −1)
  // until he conquers. The stamp is the lazy domain.occupiedBy field.
  function occupyDomain(campaign, domainId, opts){
    const domain = _domain(campaign, domainId);
    if(!domain) return { ok: false, reason: 'no-domain' };
    if(domain.occupiedBy) return { ok: false, reason: 'already-occupied' };
    const priorMorale = (domain.demographics && domain.demographics.morale) || 0;
    domain.occupiedBy = {
      leaderCharacterId: (opts && opts.leaderCharacterId) || null,
      sinceOrd: (opts && opts.atOrd) != null ? opts.atOrd : worldOrd(campaign),
      sinceTurn: (campaign && campaign.currentTurn) || 1,
      priorMorale,
      moralePenalty: -Math.max(1, priorMorale)   // RR p.458 — min −1 even if the people hated the old ruler
    };
    return { ok: true, occupiedBy: domain.occupiedBy };
  }
  function occupationMonths(campaign, domain, atOrd){
    if(!domain || !domain.occupiedBy) return 0;
    const ord = (typeof atOrd === 'number') ? atOrd : worldOrd(campaign);
    return Math.max(0, Math.ceil((ord - domain.occupiedBy.sinceOrd) / 30));
  }
  // The owner ends the occupation before conquest (RR p.458): he resumes at the
  // morale he last ruled with, but the NEXT domain morale roll takes −1 per month
  // of occupation (the one-shot pending field, the xenophobia pattern).
  function endOccupation(campaign, domainId, opts){
    const domain = _domain(campaign, domainId);
    if(!domain || !domain.occupiedBy) return { ok: false, reason: 'not-occupied' };
    const months = Math.max(1, occupationMonths(campaign, domain, opts && opts.atOrd));
    if(!domain.demographics) domain.demographics = {};
    domain.demographics.morale = domain.occupiedBy.priorMorale;
    domain.postOccupationPenaltyMonths = months;
    const was = domain.occupiedBy;
    domain.occupiedBy = null;
    return { ok: true, months, was };
  }
  // Conquest (RR p.458): the occupied domain falls when every stronghold/settlement
  // is captured — 🔧 v1 reads that as "no active defending garrison units remain"
  // (a garrisoned stronghold needs a siege, W6 — or a W3 garrison battle today).
  // RAW offers the conqueror both dispositions: rule it directly, or grant it to a
  // vassal (a new vassalage under the conqueror). No domain-merge (🔧 the RAW
  // "add to his personal domain" absorption is not modeled — the domain stays a
  // distinct entity ruled by the conqueror).
  function conquestEligibility(campaign, domainId, leaderCharacterId){
    const Ax = A();
    const domain = _domain(campaign, domainId);
    if(!domain) return { ok: false, reason: 'no-domain' };
    if(!domain.occupiedBy) return { ok: false, reason: 'not-occupied' };
    if(leaderCharacterId && domain.occupiedBy.leaderCharacterId && domain.occupiedBy.leaderCharacterId !== leaderCharacterId){
      return { ok: false, reason: 'occupied-by-another' };
    }
    const defenders = (typeof Ax.unitsStationedAt === 'function')
      ? Ax.unitsStationedAt(campaign, { kind: 'domain-garrison', id: domain.id }).filter(u => u && Math.max(0, (u.count || 0) - (u.casualties || 0)) > 0)
      : [];
    if(defenders.length) return { ok: false, reason: 'defenders-hold-strongholds', defenders: defenders.map(u => u.id) };
    return { ok: true };
  }
  function conquerDomain(campaign, domainId, opts){
    const Ax = A();
    const domain = _domain(campaign, domainId);
    const leaderId = opts && opts.leaderCharacterId;
    const elig = conquestEligibility(campaign, domainId, leaderId);
    if(!elig.ok) return elig;
    const mode = (opts && opts.mode) === 'grant-to-vassal' ? 'grant-to-vassal' : 'rule-directly';
    const oldRulerId = domain.rulerCharacterId || null;
    // sever the conquered domain's old fealty (the conquest breaks the chain)
    const oldVassalage = (typeof Ax.activeVassalageOf === 'function') ? Ax.activeVassalageOf(campaign, domain.id) : null;
    if(oldVassalage && typeof Ax.endVassalage === 'function') Ax.endVassalage(campaign, oldVassalage.id, campaign.currentTurn || 1, 'conquered');
    domain.liegeId = null;
    let newRulerId = leaderId || null;
    if(mode === 'grant-to-vassal'){
      newRulerId = (opts && opts.newRulerCharacterId) || null;
      if(!newRulerId) return { ok: false, reason: 'no-vassal-ruler' };
      domain.rulerCharacterId = newRulerId;
      // the conqueror becomes liege: his own (largest) domain is the suzerain domain
      const conquerorDomain = (campaign.domains || []).find(d => d && d.rulerCharacterId === leaderId) || null;
      if(conquerorDomain){
        domain.liegeId = conquerorDomain.id;
        if(typeof Ax.createVassalage === 'function'){
          Ax.createVassalage(campaign, {
            vassalRulerCharacterId: newRulerId, suzerainCharacterId: leaderId || null,
            vassalDomainId: domain.id, suzerainDomainId: conquerorDomain.id,
            oathTakenAtTurn: campaign.currentTurn || 1, reason: 'conquest'
          });
        }
      }
    } else {
      domain.rulerCharacterId = newRulerId;
    }
    // conquest completes the occupation: the penalty ends, morale rebases under the
    // new ruler at the next monthly roll (base morale recomputes from his authority).
    domain.occupiedBy = null;
    domain.postOccupationPenaltyMonths = 0;
    const newRuler = _char(campaign, newRulerId);
    const narrative = (domain.name || 'The domain') + ' is CONQUERED — ' +
      (mode === 'grant-to-vassal'
        ? ('granted to ' + ((newRuler && newRuler.name) || 'a vassal') + ' as a vassal of the conqueror')
        : ('the conqueror ' + ((newRuler && newRuler.name) || '') + ' rules it directly').trim()) + ' (RR p.458).';
    _emitWarfareEvent(campaign,
      { action: 'conquered', domainId: domain.id, mode, newRulerCharacterId: newRulerId, armyId: (opts && opts.armyId) || null },
      { domainId: domain.id, relatedEntities: [
          { kind: 'domain', id: domain.id, role: 'target' },
          leaderId ? { kind: 'character', id: leaderId, role: 'commander' } : null,
          newRulerId && newRulerId !== leaderId ? { kind: 'character', id: newRulerId, role: 'beneficiary' } : null,
          oldRulerId ? { kind: 'character', id: oldRulerId, role: 'victim' } : null
        ].filter(Boolean) },
      narrative);
    return { ok: true, mode, oldRulerId, newRulerId };
  }

  // ── pillage (RR pp.458–459) ─────────────────────────────────────────────────
  // Eligibility + the duration roll. RAW: pillage follows CONQUEST ("instead of or
  // before integrating a conquered domain"); a too-small army pillages at a
  // proportional yield (the 600-orc example) over the full time.
  function beginPillage(campaign, spec){
    const Ax = A();
    const rng = (spec && spec.rng) || Math.random;
    const army = typeof Ax.findArmy === 'function' ? Ax.findArmy(campaign, spec.armyId) : null;
    const domain = _domain(campaign, spec.domainId);
    if(!army) return { ok: false, reason: 'no-army' };
    if(!domain) return { ok: false, reason: 'no-domain' };
    if(army.pillage) return { ok: false, reason: 'already-pillaging' };
    const hex = _hex(campaign, army.currentHexId);
    if(!hex || hex.domainId !== domain.id) return { ok: false, reason: 'not-in-domain' };
    // conquered by this army's leader (RR p.458: a conquered domain can be pillaged;
    // an UNconquered one is merely looted — the W5 supply verbs).
    if(domain.occupiedBy) return { ok: false, reason: 'not-conquered' };
    if(!army.leaderCharacterId || domain.rulerCharacterId !== army.leaderCharacterId) return { ok: false, reason: 'not-conquered' };
    const j = army.journeyId && typeof Ax.findJourney === 'function' ? Ax.findJourney(campaign, army.journeyId) : null;
    if(j && j.status === 'in-transit') return { ok: false, reason: 'still-marching' };
    const totalFam = (typeof Ax.totalFamilies === 'function') ? Ax.totalFamilies(domain) : ((domain.demographics && domain.demographics.peasantFamilies) || 0);
    if(totalFam <= 0) return { ok: false, reason: 'nothing-left' };
    const req = Ax.pillageRequirementRow(totalFam);
    const troops = armyTroopCount(campaign, army);
    let days = _rollDice(req.timeDice, rng);
    const salt = !!(spec && spec.saltTheEarth);
    if(salt) days *= Ax.SALT_THE_EARTH.timeMult;
    army.pillage = {
      domainId: domain.id, startedOrd: worldOrd(campaign), daysRequired: Math.max(1, days),
      saltTheEarth: salt,
      unitsProportion: Math.min(1, req.troops > 0 ? troops / req.troops : 1),
      requiredTroops: req.troops, troopsAtStart: troops
    };
    _armyHistory(campaign, army, 'pillage-started', (army.name || 'The army') + ' began ' + (salt ? 'salting the earth of ' : 'pillaging ') + (domain.name || 'the domain') + ' (' + army.pillage.daysRequired + ' day' + (army.pillage.daysRequired === 1 ? '' : 's') + ').');
    return { ok: true, pillage: army.pillage };
  }
  // Roll the Results of Pillaging (RR p.458) — pure. ONE roll of each die multiplies
  // the family counts (the printed examples). Proportions scale gold/supplies/
  // prisoners (small army ∝ units, interruption ∝ time) — families lost and the
  // stronghold reduction stay tied to what was actually plundered.
  function rollPillageResults(campaign, domain, opts){
    const Ax = A();
    const rng = (opts && opts.rng) || Math.random;
    const peasant = (domain.demographics && domain.demographics.peasantFamilies) || 0;
    const urban = (typeof Ax.effectiveUrbanFamilies === 'function') ? Ax.effectiveUrbanFamilies(domain) : ((domain.demographics && domain.demographics.urbanFamilies) || 0);
    const totalFam = peasant + urban;
    const proportion = Math.max(0, Math.min(1, (opts && opts.proportionUnits != null ? opts.proportionUnits : 1) * (opts && opts.proportionTime != null ? opts.proportionTime : 1)));
    let out;
    if(opts && opts.saltTheEarth){
      const S = Ax.SALT_THE_EARTH;
      out = {
        saltTheEarth: true,
        goldRolls: null,
        gold: Math.round((S.goldPerPeasant * peasant + S.goldPerUrban * urban) * proportion),
        supplies: Math.round(S.suppliesPerPeasant * peasant * proportion),
        prisoners: Math.round(S.prisonersPerFamily * totalFam * proportion),
        familiesLost: totalFam,   // the domain is destroyed
        destroyed: true
      };
    } else {
      const R = Ax.PILLAGE_RESULTS;
      const goldP = _rollDice(R.goldPerPeasantDice, rng);
      const goldU = urban > 0 ? _rollDice(R.goldPerUrbanDice, rng) : 0;
      const supplies = _rollDice(R.suppliesPerPeasantDice, rng) * (R.suppliesPerPeasantDice.mult || 1);
      const prisoners = _rollDice(R.prisonersPer10Dice, rng);
      const lost = _rollDice(R.familiesLostPer10Dice, rng);
      out = {
        saltTheEarth: false,
        goldRolls: { perPeasant: goldP, perUrban: goldU, suppliesPerPeasant: supplies, prisonersPer10: prisoners, familiesLostPer10: lost },
        gold: Math.round((goldP * peasant + goldU * urban) * proportion),
        supplies: Math.round(supplies * peasant * proportion),
        prisoners: Math.round(prisoners * totalFam / 10 * proportion),
        familiesLost: Math.min(totalFam, Math.round(lost * totalFam / 10)),
        destroyed: false
      };
    }
    out.peasantFamilies = peasant; out.urbanFamilies = urban; out.proportion = proportion;
    return out;
  }
  // Apply a rolled pillage to the world (the commit half): gp to the leader's pay
  // handle (GP Wave B), prisoners onto the army, families off the land (canonical
  // setter), the stronghold reduced 1gp per 1gp plundered, the −4 morale roll.
  function applyPillageResults(campaign, army, domain, results, moraleResult){
    const Ax = A();
    const leader = _char(campaign, army && army.leaderCharacterId);
    // 1. gold → the leader's pay handle (treasury when he rules + opted in, else purse)
    if(results.gold > 0 && leader){
      const handle = _leaderPayHandle(campaign, leader);
      const spec = { amount: results.gold, source: { kind: 'external', label: 'pillage of ' + (domain.name || 'a domain') }, destination: handle, reason: 'Pillage of ' + (domain.name || 'a domain'), bucket: 'pillage' };
      try {
        if(typeof Ax.applyWealthTransfer === 'function') Ax.applyWealthTransfer(campaign, spec);
        if(typeof Ax.recordWealthTransfer === 'function') Ax.recordWealthTransfer(campaign, spec, { submittedBy: 'engine', campaignLogHidden: true });
      } catch(e){ /* the pillage event still records the numbers */ }
    }
    // 2. prisoners ride with the army (ransom 40gp/head, or Construction labor)
    if(results.prisoners > 0) army.prisoners = (army.prisoners || 0) + results.prisoners;
    // 3. families lost — peasants first, overflow from the urban settlements
    if(results.familiesLost > 0){
      const peasant = (domain.demographics && domain.demographics.peasantFamilies) || 0;
      const fromPeasants = Math.min(peasant, results.familiesLost);
      if(typeof Ax.setPeasantPopulation === 'function') Ax.setPeasantPopulation(domain, peasant - fromPeasants);
      else if(domain.demographics) domain.demographics.peasantFamilies = peasant - fromPeasants;
      const overflow = results.familiesLost - fromPeasants;
      if(overflow > 0) _reduceUrbanFamilies(campaign, domain, overflow);
    }
    // 4. stronghold reduction: 1gp per 1gp plundered (RR p.458)
    if(results.gold > 0) _reduceStrongholdValue(domain, results.gold);
    if(results.destroyed){
      _reduceStrongholdValue(domain, Infinity);
      if(domain.demographics) domain.demographics.urbanFamilies = 0;
    }
    // 5. the immediate morale roll at −4 (skipped when nothing remains)
    if(moraleResult && !results.destroyed) applyImmediateMoraleResult(campaign, domain, moraleResult);
    // 6. spoils XP: gold plundered counts as spoils of war (RR p.459 — 1 XP/gp to the
    // collector; the troops' expected 50% share is the GM's loyalty lever, W7).
    if(results.gold > 0 && leader){
      leader.xp = (leader.xp || 0) + results.gold;
      if(typeof Ax.addCharacterHistory === 'function') Ax.addCharacterHistory(campaign, leader, 'xp', '+' + results.gold + ' XP — spoils from the pillage of ' + (domain.name || 'a domain') + ' (RR p.459)');
      try { if(typeof Ax.checkAllCharacterLevelUps === 'function') Ax.checkAllCharacterLevelUps(campaign); } catch(e){}
    }
    _armyHistory(campaign, army, 'pillage-complete', (army.name || 'The army') + ' ' + (results.saltTheEarth ? 'salted the earth of ' : 'pillaged ') + (domain.name || 'the domain') + ': ' + results.gold + 'gp, ' + results.supplies + 'gp of supplies, ' + results.prisoners + ' prisoners; ' + results.familiesLost + ' families lost.');
  }
  function _leaderPayHandle(campaign, leader){
    if(leader && leader.payKeepFromTreasury !== false){
      const dom = (campaign.domains || []).find(d => d && d.rulerCharacterId === leader.id);
      if(dom) return { kind: 'treasury', id: dom.id };
    }
    return { kind: 'character-gp', id: leader ? leader.id : null };
  }
  function _reduceStrongholdValue(domain, gp){
    if(!domain || !domain.stronghold) return 0;
    let remaining = gp;
    const comps = Array.isArray(domain.stronghold.components) ? domain.stronghold.components : [];
    for(const c of comps){
      if(remaining <= 0) break;
      const v = Number(c && c.buildValue) || 0;
      if(v <= 0) continue;
      const cut = Math.min(v, remaining);
      c.buildValue = v - cut;
      remaining -= cut;
    }
    // legacy single-stronghold shape
    if(remaining > 0 && typeof domain.stronghold.buildValue === 'number'){
      const v = domain.stronghold.buildValue;
      const cut = Math.min(v, remaining);
      domain.stronghold.buildValue = v - cut;
      remaining -= cut;
    }
    return gp === Infinity ? 0 : (gp - Math.max(0, remaining));
  }
  function _reduceUrbanFamilies(campaign, domain, n){
    let remaining = n;
    for(const h of ((domain.geography && domain.geography.hexes) || [])){
      if(remaining <= 0) break;
      const s = h && h.settlement;
      if(!s || !(s.families > 0)) continue;
      const cut = Math.min(s.families, remaining);
      s.families -= cut;
      remaining -= cut;
    }
    if(domain.demographics){
      domain.demographics.urbanFamilies = Math.max(0, (domain.demographics.urbanFamilies || 0) - (n - remaining));
    }
  }
  // Resolve an army's pillage-in-progress (the day consumer calls this at the rolled
  // duration; the GM can also cut it short — interruption scales the yield by time,
  // RR p.459). Returns {results, moraleResult} for the record/commit.
  function resolvePillage(campaign, armyId, opts){
    const Ax = A();
    const army = typeof Ax.findArmy === 'function' ? Ax.findArmy(campaign, armyId) : null;
    if(!army || !army.pillage) return { ok: false, reason: 'not-pillaging' };
    const p = army.pillage;
    const domain = _domain(campaign, p.domainId);
    if(!domain){ army.pillage = null; return { ok: false, reason: 'no-domain' }; }
    const rng = (opts && opts.rng) || Math.random;
    const timeRatio = (opts && opts.timeRatio != null) ? Math.max(0, Math.min(1, opts.timeRatio)) : 1;
    const results = rollPillageResults(campaign, domain, {
      rng, saltTheEarth: p.saltTheEarth, proportionUnits: p.unitsProportion, proportionTime: timeRatio
    });
    const moraleResult = results.destroyed ? null : immediateDomainMoraleRoll(campaign, domain, {
      rng, extraMods: [{ label: 'The domain was pillaged (RR p.459)', value: -4 }]
    });
    applyPillageResults(campaign, army, domain, results, moraleResult);
    army.pillage = null;
    const narrative = (army.name || 'The army') + (p.saltTheEarth ? ' salted the earth of ' : ' pillaged ') +
      (domain.name || 'the domain') + ': ' + results.gold.toLocaleString() + 'gp plundered, ' +
      results.supplies.toLocaleString() + 'gp of supplies, ' + results.prisoners + ' prisoners; ' +
      results.familiesLost + ' families lost' + (results.destroyed ? ' — the domain is destroyed' : '') + ' (RR pp.458–459).';
    _emitWarfareEvent(campaign,
      { action: 'pillaged', armyId: army.id, domainId: domain.id, saltTheEarth: !!p.saltTheEarth,
        results: { gold: results.gold, supplies: results.supplies, prisoners: results.prisoners, familiesLost: results.familiesLost, destroyed: results.destroyed, proportion: results.proportion } },
      { primaryHexId: army.currentHexId || null, domainId: domain.id, relatedEntities: [
          { kind: 'army', id: army.id, role: 'subject' }, { kind: 'domain', id: domain.id, role: 'victim' },
          army.leaderCharacterId ? { kind: 'character', id: army.leaderCharacterId, role: 'commander' } : null
        ].filter(Boolean) },
      narrative);
    return { ok: true, results, moraleResult, domain };
  }
  // Ransom held prisoners at the printed 40gp a head (RR p.458) — gp + spoils XP to
  // the leader. Keeping them as Construction workers / conscript labor is the GM's
  // alternative (no verb needed — the count just stays on the army).
  function ransomPrisoners(campaign, spec){
    const Ax = A();
    const army = typeof Ax.findArmy === 'function' ? Ax.findArmy(campaign, spec.armyId) : null;
    if(!army) return { ok: false, reason: 'no-army' };
    const held = army.prisoners || 0;
    const n = Math.max(0, Math.min(held, Math.floor(spec.count != null ? spec.count : held)));
    if(n <= 0) return { ok: false, reason: 'no-prisoners' };
    const gp = n * Ax.PILLAGE_RESULTS.ransomGpPerPrisoner;
    const leader = _char(campaign, army.leaderCharacterId);
    if(leader){
      const handle = _leaderPayHandle(campaign, leader);
      const wspec = { amount: gp, source: { kind: 'external', label: 'prisoner ransom' }, destination: handle, reason: 'Ransom of ' + n + ' prisoners', bucket: 'pillage' };
      try {
        if(typeof Ax.applyWealthTransfer === 'function') Ax.applyWealthTransfer(campaign, wspec);
        if(typeof Ax.recordWealthTransfer === 'function') Ax.recordWealthTransfer(campaign, wspec, { submittedBy: 'engine', campaignLogHidden: true });
      } catch(e){}
      leader.xp = (leader.xp || 0) + gp;
      if(typeof Ax.addCharacterHistory === 'function') Ax.addCharacterHistory(campaign, leader, 'xp', '+' + gp + ' XP — ransom of ' + n + ' prisoners (spoils of war)');
      try { if(typeof Ax.checkAllCharacterLevelUps === 'function') Ax.checkAllCharacterLevelUps(campaign); } catch(e){}
    }
    army.prisoners = held - n;
    _armyHistory(campaign, army, 'ransom', n + ' prisoners ransomed for ' + gp + 'gp.');
    return { ok: true, count: n, gp };
  }

  // ── occupation economics (RR p.458) — the monthly-turn reads ───────────────
  // While occupied (not yet conquered) the occupier controls the PEASANTS and their
  // revenues; the urban families stay the owner's. The monthly turn splits the
  // domain's net by the peasant-attributable share of gross income.
  // The monthly morale machinery runs under the OCCUPIER's personal authority while
  // the domain is occupied (RR p.458: "a new base morale score based on the occupier's
  // personal authority, alignment, garrison, etc."). Same summary shape effectiveRuler
  // returns; falls back to effectiveRuler when the occupier can't be resolved.
  function occupierRulerSummary(campaign, d){
    const Ax = A();
    const occ = d && d.occupiedBy;
    const ch = occ ? _char(campaign, occ.leaderCharacterId) : null;
    if(!ch) return (typeof Ax.effectiveRuler === 'function') ? Ax.effectiveRuler(campaign, d) : {};
    const domainIncomeVal = (typeof Ax.domainIncome === 'function') ? Ax.domainIncome(campaign, d) : 0;
    return {
      name: ch.name, class: ch.class || '', level: ch.level || 1,
      personalAuthority: (typeof Ax.computePersonalAuthority === 'function') ? Ax.computePersonalAuthority(ch.level || 1, domainIncomeVal) : 0,
      gpThreshold: (typeof Ax.computeGpThreshold === 'function') ? Ax.computeGpThreshold(ch.level || 1) : 0,
      administersThisMonth: false,
      isPC: (typeof Ax.isPlayerControlled === 'function') ? Ax.isPlayerControlled(ch) : false,
      occupier: true
    };
  }

  function peasantIncomeShare(campaign, d){
    const Ax = A();
    if(typeof Ax.incomeBreakdown !== 'function') return 1;
    const rows = Ax.incomeBreakdown(campaign, d);
    const gross = rows.reduce((s, r) => s + (r.gp || 0), 0);
    if(gross <= 0) return 1;
    const fam = (d.demographics && d.demographics.peasantFamilies) || 0;
    const urb = (typeof Ax.effectiveUrbanFamilies === 'function') ? Ax.effectiveUrbanFamilies(d) : 0;
    const famShare = (fam + urb) > 0 ? fam / (fam + urb) : 1;
    let peasantGp = 0;
    for(const r of rows){
      const label = String(r.label || '');
      if(/^Land revenue/.test(label)) peasantGp += (r.gp || 0);                                  // peasant-only
      else if(/^(Service revenue|Tax|Misc\/family)/.test(label)) peasantGp += (r.gp || 0) * famShare;  // both → prorated
      // Trade / tariffs / tribute / misc-flat / other stay the owner's (urban + realm income)
    }
    return Math.max(0, Math.min(1, peasantGp / gross));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Phase 3 Military W5 — supply (RR pp.450–452). The COST layer (unitWeeklySupplyCost /
  // armyWeeklySupplyCost) ships from acks-engine.js (W1); this is the line / base / check /
  // ladder / requisition / market layer. Three conditions to be in supply (RR p.450): pay
  // the cost in gold, have base(s) of sufficient value, and hold a CLEAR line to a base.
  // Supply Simplified (RR p.452 — the default per-army mode) deducts the cost and only
  // computes the line when the army is cut off, crosses hostile/unsettled terrain, or
  // strays >24 mi from a road or waterway. Pure reads (derive, don't store — §5.4: no
  // SupplyChain entity; the army stores only supplyBaseIds + lastSupplyCheckOrd). Checked
  // weekly; daily in barrens/desert (the consumer's cadence).
  // ═══════════════════════════════════════════════════════════════════════════
  function _army(campaign, id){ return (campaign && Array.isArray(campaign.armies)) ? (campaign.armies.find(a => a && a.id === id) || null) : null; }

  // Coarse per-hex route reads — a 96-mile supply line weighs hex-level features, not the
  // per-side §24 grain: a road hex counts ½, a waterway hex (open water, or a river the line
  // follows) counts 0, regardless of terrain (RR p.451).
  function _hexHasRoad(hex){ return !!(hex && (hex.hasRoad === true || (Array.isArray(hex.roadSides) && hex.roadSides.length))); }
  function _hexIsWaterway(campaign, hex){
    const Ax = A();
    if(!hex) return false;
    const base = (typeof Ax.terrainBase === 'function') ? Ax.terrainBase(hex.terrain) : String(hex.terrain || '');
    return base === 'water' || (Array.isArray(hex.riverSides) && hex.riverSides.length > 0);
  }
  function _domainsFriendly(campaign, a, b){
    if(!a || !b) return false;
    if(a.id === b.id) return true;
    return !leadersOpposed(campaign, a.rulerCharacterId, b.rulerCharacterId);
  }

  // The terrain treatment an army's troops grant the supply line (RR p.451): a homogeneous
  // elf / dwarf / beastman host eases certain terrain. GM override army.supplyTerrainTreatment
  // wins; a mixed host gets none.
  function armySupplyTerrainTreatment(campaign, army){
    if(!army) return null;
    if(army.supplyTerrainTreatment) return army.supplyTerrainTreatment;
    const Ax = A();
    const units = (typeof Ax.armyUnits === 'function') ? Ax.armyUnits(campaign, army) : [];
    let treatment = null, set = false;
    for(const u of units){
      if(Math.max(0, (u.count || 0) - (u.casualties || 0)) <= 0) continue;
      const r = String(u.race || 'man').toLowerCase();
      const t = /elf/.test(r) ? 'elf' : /dwarf/.test(r) ? 'dwarf'
              : /goblin|orc|kobold|hobgoblin|gnoll|bugbear|beastman|ogre|troll/.test(r) ? 'beastman' : 'man';
      if(!set){ treatment = t; set = true; }
      else if(treatment !== t) return null;        // mixed host — no uniform treatment
    }
    return (treatment && treatment !== 'man') ? treatment : null;
  }

  // The seat hex of a supply base. A base id may be a friendly/occupied DOMAIN (seat = its
  // largest-settlement hex), a built-fort / captured-stronghold CONSTRUCTIBLE (seat = its site
  // hex — RR p.451), or a bare hex id.
  function _supplyBaseHex(campaign, baseId){
    const dom = _domain(campaign, baseId);
    if(dom){
      const domHexes = (campaign.hexes || []).filter(h => h && h.domainId === dom.id);
      if(!domHexes.length) return null;
      return domHexes.find(h => h.settlement && (h.settlement.families > 0)) || domHexes[0];
    }
    const cst = _constructible(campaign, baseId);
    if(cst) return _hex(campaign, cst.hexId) || null;
    return _hex(campaign, baseId) || null;
  }

  // Weigh a candidate supply line army→base: route the hexes between them (the §24 line
  // machinery), weight each by terrain/road/waterway (RR p.451), flag blocked / overextended.
  function _weighSupplyRoute(campaign, army, fromCoord, toCoord, treatment){
    const Ax = A();
    const maxW = Ax.SUPPLY_LINE_MAX_WEIGHTED_HEXES || 16;
    let coords = (typeof Ax.hexLineDraw === 'function') ? (Ax.hexLineDraw(fromCoord, toCoord) || []) : [];
    if(coords.length) coords = coords.slice(1);            // count hexes BETWEEN the army and the base
    let weighted = 0, blockedAtHexId = null;
    for(const c of coords){
      const hex = (typeof Ax.hexAtCoord === 'function') ? Ax.hexAtCoord(campaign, c) : null;
      const terrain = hex ? hex.terrain : 'grassland';     // unauthored route hexes → open country (×1)
      weighted += (typeof Ax.supplyLineHexWeight === 'function')
        ? Ax.supplyLineHexWeight((typeof Ax.terrainBase === 'function') ? Ax.terrainBase(terrain) : terrain,
            { road: _hexHasRoad(hex), waterway: _hexIsWaterway(campaign, hex), treatment })
        : 1;
      if(!blockedAtHexId && hex && _supplyRouteHexBlocked(campaign, army, hex)) blockedAtHexId = hex.id;
    }
    const status = blockedAtHexId ? 'blocked' : (weighted > maxW ? 'overextended' : 'clear');
    return { status, weightedLength: Math.round(weighted * 100) / 100, route: coords.map(c => ({ q: c.q, r: c.r })), blockedAtHexId };
  }
  // A route hex is blocked by an opposing army standing on it (RR p.451 — RAW requires a
  // blocker of the army's unit scale or larger; 🔧 v1 reads any opposing ARMY as a blocker).
  function _supplyRouteHexBlocked(campaign, army, hex){
    for(const other of (campaign.armies || [])){
      if(!other || other.id === army.id || other.currentHexId !== hex.id) continue;
      if(armiesOpposed(campaign, army, other)) return true;
    }
    return false;
  }

  // supplyLineStatus(campaign, army, opts?) → the best line to a designated base:
  //   { status: 'clear'|'blocked'|'overextended'|'no-base', baseId, weightedLength, route, blockedAtHexId }
  // Prefers a clear base, then the shortest weighted length. opts.candidateBaseIds /
  // opts.armyHexId / opts.treatment override (tests + the chaining flood).
  function supplyLineStatus(campaign, army, opts){
    const Ax = A(); const o = opts || {};
    const armyHex = _hex(campaign, o.armyHexId || (army && army.currentHexId));
    if(!armyHex || !armyHex.coord) return { status: 'no-base', baseId: null, weightedLength: null, route: [], reason: 'no-army-hex' };
    const baseIds = o.candidateBaseIds || (army && army.supplyBaseIds) || [];
    const treatment = (o.treatment !== undefined) ? o.treatment : armySupplyTerrainTreatment(campaign, army);
    let best = null;
    for(const baseId of baseIds){
      const baseHex = _supplyBaseHex(campaign, baseId);
      if(!baseHex || !baseHex.coord) continue;
      const line = _weighSupplyRoute(campaign, army, armyHex.coord, baseHex.coord, treatment);
      line.baseId = baseId;
      if(!best){ best = line; continue; }
      const lineClear = line.status === 'clear', bestClear = best.status === 'clear';
      if((lineClear && !bestClear) || (lineClear === bestClear && line.weightedLength < best.weightedLength)) best = line;
    }
    return best || { status: 'no-base', baseId: null, weightedLength: null, route: [] };
  }

  // supplyBaseValue (RR p.450): a base's value = its own monthly net income + the net income of
  // friendly domains in the same 24-mile hex (≈ axial distance ≤ 3). Chaining (base→base) is
  // handled by armySupplyBaseTotalValue's connectivity flood, not here.
  //   • a DOMAIN base → its monthly net (the existing path).
  //   • a fort / captured-stronghold CONSTRUCTIBLE base (RR p.451) → no income of its OWN (it is a
  //     relay node + a Class VI market); its value comes from term 2 + the chaining flood, UNLESS
  //     it stands inside a friendly/occupied domain, in which case that domain's net is its income.
  function supplyBaseValue(campaign, baseId){
    const Ax = A();
    const net = d => (d && typeof Ax.monthlyNet === 'function') ? Math.max(0, Ax.monthlyNet(campaign, d)) : 0;
    const dom = _domain(campaign, baseId);
    const cst = dom ? null : _constructible(campaign, baseId);
    const seat = _supplyBaseHex(campaign, baseId);
    // Term 1 — the base's own monthly net income.
    let baseDom = dom, value = 0;
    if(dom){ value = net(dom); }
    else if(cst && seat && seat.domainId){
      const sitDom = _domain(campaign, seat.domainId);
      if(sitDom && _constructibleControlledBy(campaign, cst, sitDom)){ baseDom = sitDom; value = net(sitDom); }
    }
    // Term 2 — the net of friendly domains in the same 24-mile hex (≈ axial distance ≤ 3) as the seat.
    if(seat && seat.coord){
      for(const other of (campaign.domains || [])){
        if(!other || (baseDom && other.id === baseDom.id)) continue;
        const oh = _supplyBaseHex(campaign, other.id);
        if(!oh || !oh.coord) continue;
        const dist = (typeof Ax.hexAxialDistance === 'function') ? Ax.hexAxialDistance(seat.coord, oh.coord) : Infinity;
        if(dist > 3) continue;
        const friendly = baseDom ? _domainsFriendly(campaign, baseDom, other)
                                 : (cst && cst.ownerCharacterId ? !leadersOpposed(campaign, cst.ownerCharacterId, other.rulerCharacterId) : false);
        if(friendly) value += net(other);
      }
    }
    return value;
  }
  // Is a fort/stronghold Constructible controlled by the side that holds `dom`? (the fort's owner
  // rules or occupies the domain, else the domain is at least non-opposed to the fort owner).
  function _constructibleControlledBy(campaign, cst, dom){
    if(!cst || !dom) return false;
    if(cst.ownerCharacterId && cst.ownerCharacterId === dom.rulerCharacterId) return true;
    if(dom.occupiedBy && cst.ownerCharacterId && dom.occupiedBy.leaderCharacterId === cst.ownerCharacterId) return true;
    return !!(cst.ownerCharacterId && !leadersOpposed(campaign, cst.ownerCharacterId, dom.rulerCharacterId));
  }

  // armySupplyBaseTotalValue — the value the army can draw on: a connectivity flood from the
  // army through CLEAR lines (army→base, then base→base — RR p.450 chained bases), summing
  // each reached base's value once.
  function armySupplyBaseTotalValue(campaign, army){
    const bases = ((army && army.supplyBaseIds) || []).filter(id => _domain(campaign, id) || _constructible(campaign, id));
    if(!bases.length) return 0;
    const treatment = armySupplyTerrainTreatment(campaign, army);
    const reached = new Set(), frontier = [];
    for(const id of bases){
      if(supplyLineStatus(campaign, army, { candidateBaseIds: [id] }).status === 'clear'){ reached.add(id); frontier.push(id); }
    }
    while(frontier.length){
      const aHex = _supplyBaseHex(campaign, frontier.shift());
      if(!aHex || !aHex.coord) continue;
      for(const b of bases){
        if(reached.has(b)) continue;
        const bHex = _supplyBaseHex(campaign, b);
        if(!bHex || !bHex.coord) continue;
        if(_weighSupplyRoute(campaign, army, aHex.coord, bHex.coord, treatment).status === 'clear'){ reached.add(b); frontier.push(b); }
      }
    }
    let total = 0;
    for(const id of reached) total += supplyBaseValue(campaign, id);
    return total;
  }

  // Is a road or navigable waterway within `radius` 6-mile hexes of `hex`? (RR p.452 — the
  // Simplified trigger: >24 mi = >4 hexes from a road/waterway forces the full check.)
  function _nearRoadOrWaterway(campaign, hex, radius){
    const Ax = A();
    if(!hex || !hex.coord) return true;
    if(_hexHasRoad(hex) || _hexIsWaterway(campaign, hex)) return true;
    for(const h of (campaign.hexes || [])){
      if(!h || !h.coord) continue;
      const d = (typeof Ax.hexAxialDistance === 'function') ? Ax.hexAxialDistance(hex.coord, h.coord) : Infinity;
      if(d <= radius && (_hexHasRoad(h) || _hexIsWaterway(campaign, h))) return true;
    }
    return false;
  }

  // armySupplyTrigger (RR p.452) — does Simplified mode have to fall back to the full
  // line/base check this period? { triggered, reasons[] }.
  function armySupplyTrigger(campaign, army, opts){
    const Ax = A(); const o = opts || {};
    const reasons = [];
    const armyHex = _hex(campaign, o.armyHexId || (army && army.currentHexId));
    if(armyHex){
      const base = (typeof Ax.terrainBase === 'function') ? Ax.terrainBase(armyHex.terrain) : String(armyHex.terrain || '');
      if(['barrens', 'desert', 'jungle', 'swamp'].indexOf(base) >= 0) reasons.push('hostile-terrain');
      if(!armyHex.domainId) reasons.push('unsettled');
      else { const dom = _domain(campaign, armyHex.domainId); if(dom && !domainFriendlyToArmy(campaign, dom, army)) reasons.push('hostile-domain'); }
      if(!_nearRoadOrWaterway(campaign, armyHex, 4)) reasons.push('far-from-road');
    }
    if(supplyLineStatus(campaign, army, { armyHexId: o.armyHexId }).status === 'blocked') reasons.push('cut-off');
    return { triggered: reasons.length > 0, reasons };
  }

  // The army's current funds — its leader's pay handle (domain treasury when he rules + opted
  // in, else the purse — the CoL-2 / GP Wave B convention).
  function _leaderAvailableFunds(campaign, leader){
    const Ax = A();
    const handle = _leaderPayHandle(campaign, leader);
    if(handle.kind === 'treasury'){
      if(typeof Ax.domainTreasuryGp === 'function') return Ax.domainTreasuryGp(campaign, handle.id) || 0;
      const dom = _domain(campaign, handle.id); return (dom && dom.treasury && dom.treasury.gp) || 0;
    }
    if(leader && leader.coins && typeof leader.coins.gp === 'number') return leader.coins.gp;
    return (leader && leader.personalGp) || 0;
  }

  // armyInSupply — the three-condition check (RR p.450), short-circuited by Simplified mode.
  //   { inSupply, cost, canPay, baseValue, line, fraction, simplified, simplifiedTrigger, reasons[] }
  // fraction = the fed share (baseValue/cost, capped 1) — drives the underfed/starving ladder.
  function armyInSupply(campaign, army, opts){
    const Ax = A(); const o = opts || {};
    let cost = (typeof Ax.armyWeeklySupplyCost === 'function') ? Ax.armyWeeklySupplyCost(campaign, army) : 0;
    // RR p.449 — sweltering weather raises supply cost +25% (more water consumption) and
    // doubles out-of-supply penalties. opts.weather is the day's weather (the consumer); the
    // UI status readout passes none ⇒ no weather adjustment (base economy on the card).
    const wx = _armyWeatherEffects(campaign, army, o);
    const weatherSupplyMult = (wx && wx.supplyCostMult) || 1;
    const outOfSupplyDoubled = !!(wx && wx.outOfSupplyDoubled);
    if(cost > 0 && weatherSupplyMult !== 1) cost = Math.ceil(cost * weatherSupplyMult);
    if(cost <= 0) return { inSupply: true, cost: 0, canPay: true, baseValue: 0, line: { status: 'clear' }, fraction: 1, simplified: army.supplySimplified !== false, simplifiedTrigger: false, hungerless: true, weatherSupplyMult: 1, outOfSupplyDoubled, reasons: [] };
    const leader = _char(campaign, army && army.leaderCharacterId);
    const funds = _leaderAvailableFunds(campaign, leader);
    const canPay = funds >= cost;
    const simplified = army.supplySimplified !== false;
    const trig = o.forceFull ? { triggered: true, reasons: ['forced'] } : armySupplyTrigger(campaign, army, { armyHexId: o.armyHexId });
    if(simplified && !trig.triggered){
      return { inSupply: canPay, cost, canPay, baseValue: null, line: { status: 'simplified' }, fraction: canPay ? 1 : 0, simplified: true, simplifiedTrigger: false, weatherSupplyMult, outOfSupplyDoubled, reasons: canPay ? [] : ['cannot-pay'] };
    }
    const line = supplyLineStatus(campaign, army, o);
    const baseValue = armySupplyBaseTotalValue(campaign, army);
    const reasons = [];
    if(!canPay) reasons.push('cannot-pay');
    if(baseValue < cost) reasons.push('insufficient-base');
    if(line.status !== 'clear') reasons.push('line-' + line.status);
    const fraction = cost > 0 ? Math.min(1, baseValue / cost) : 1;
    return { inSupply: reasons.length === 0, cost, canPay, baseValue, line, fraction, simplified, simplifiedTrigger: trig.triggered, weatherSupplyMult, outOfSupplyDoubled, reasons };
  }

  // armyMarketClass (RR p.452) — equipment availability from the army's baggage train
  // (1,200+ troops → Class VI…II); lost while the supply line is blocked or overextended. A built
  // border fort base grants a Class VI market even to a small army (RR p.451): cls || fortClass —
  // a large army's baggage class beats the fort's VI; a sub-1,200 army gets VI from the fort.
  function armyMarketClass(campaign, army){
    const Ax = A();
    const troops = (typeof Ax.armyTroopCount === 'function') ? Ax.armyTroopCount(campaign, army) : 0;
    let cls = (typeof Ax.armyMarketClassForSize === 'function') ? Ax.armyMarketClassForSize(troops) : null;
    const st = supplyLineStatus(campaign, army, {}).status;
    if(st === 'blocked' || st === 'overextended') cls = null;   // baggage market lost when cut off
    return cls || _fortMarketClass(campaign, army);
  }
  // RR p.451 — a built border fort designated as a base + reachable via a clear line provides a
  // Class VI market (🔧 v1: a direct clear line to the fort, not the full flood — a fort built to
  // serve the army stands near it).
  function _fortMarketClass(campaign, army){
    for(const id of ((army && army.supplyBaseIds) || [])){
      const cst = _constructible(campaign, id);
      if(!cst || cst.constructibleKind !== 'field-fortification') continue;
      if(cst.constructionState && cst.constructionState !== 'complete') continue;
      if(supplyLineStatus(campaign, army, { candidateBaseIds: [id] }).status === 'clear') return 'VI';
    }
    return null;
  }

  // buildSupplyBaseFort (RR p.451) — "As a 10,000gp construction project, an army can build a
  // small border fort that can serve as a Class VI market." The fast-path forward base: pay 10,000gp
  // from the leader's pay handle (GP Wave B), mint a COMPLETE field-fortification Constructible at
  // the army's hex (the GM may pass opts.hexId for a relay between the army and a capital), and
  // auto-designate it as a supply base. 🔧 v1: instant (the Construction Wizard is the RAW-timed
  // alternative — both mint a Constructible the supply resolvers accept).
  function buildSupplyBaseFort(campaign, army, opts){
    const Ax = A(); const o = opts || {};
    if(!army) return { ok: false, reason: 'no-army' };
    const COST = (o.cost != null) ? o.cost : 10000;
    const hex = _hex(campaign, o.hexId || army.currentHexId);
    if(!hex) return { ok: false, reason: 'no-hex' };
    const factory = Ax.blankConstructible;
    if(typeof factory !== 'function') return { ok: false, reason: 'no-factory' };
    const leader = _char(campaign, army && army.leaderCharacterId);
    const funds = _leaderAvailableFunds(campaign, leader);
    if(funds < COST) return { ok: false, reason: 'cannot-pay', cost: COST, funds };
    // Pay the build cost (GP Wave B; campaign-log-hidden, the supply convention).
    if(leader && COST > 0){
      const spec = { amount: COST, source: _leaderPayHandle(campaign, leader), destination: { kind: 'external', label: 'construction' }, reason: 'Border fort — ' + (army.name || 'army'), bucket: 'construction' };
      try {
        if(typeof Ax.applyWealthTransfer === 'function') Ax.applyWealthTransfer(campaign, spec);
        if(typeof Ax.recordWealthTransfer === 'function') Ax.recordWealthTransfer(campaign, spec, { submittedBy: 'engine', campaignLogHidden: true });
      } catch(e){ /* the army-supply-base-built event still records the build */ }
    }
    const label = (hex.coord ? ('(' + hex.coord.q + ',' + hex.coord.r + ')') : (hex.name || hex.id));
    const cst = factory({
      constructibleKind: 'field-fortification', constructibleSubtype: 'border-fort',
      name: o.name || ('Border Fort ' + label), constructionState: 'complete',
      hexId: hex.id, siteType: 'wilderness-hex',
      ownership: 'character', ownerCharacterId: army.leaderCharacterId || null,
      buildValue: COST, completedAtTurn: campaign.currentTurn || null
    });
    if(Array.isArray(cst.history)) cst.history.push({ turn: campaign.currentTurn || null, type: 'built',
      narrative: (army.name || 'An army') + ' raised a border fort here as a forward supply base (10,000gp, RR p.451).' });
    campaign.constructibles = campaign.constructibles || [];
    campaign.constructibles.push(cst);
    army.supplyBaseIds = Array.isArray(army.supplyBaseIds) ? army.supplyBaseIds : [];
    if(army.supplyBaseIds.indexOf(cst.id) < 0) army.supplyBaseIds.push(cst.id);
    const narrative = (army.name || 'The army') + ' builds ' + cst.name + ' — a Class VI forward supply base (RR p.451).';
    _emitWarfareEvent(campaign,
      { armyId: army.id, constructibleId: cst.id, hexId: hex.id, cost: COST },
      { primaryHexId: hex.id, domainId: hex.domainId || null, relatedEntities: [{ kind: 'constructible', id: cst.id, role: 'produced' }, { kind: 'army', id: army.id, role: 'subject' }] },
      narrative, 'army-supply-base-built');
    return { ok: true, constructible: cst, cost: COST, narrative };
  }

  // Pay the weekly supply cost from the leader's pay handle (GP Wave B; campaign-log-hidden).
  function _payArmySupplyCost(campaign, army, cost){
    const Ax = A();
    const leader = _char(campaign, army && army.leaderCharacterId);
    if(!leader || !(cost > 0)) return;
    const spec = { amount: cost, source: _leaderPayHandle(campaign, leader), destination: { kind: 'external', label: 'supply' }, reason: 'Weekly supply — ' + (army.name || 'army'), bucket: 'supply' };
    try {
      if(typeof Ax.applyWealthTransfer === 'function') Ax.applyWealthTransfer(campaign, spec);
      if(typeof Ax.recordWealthTransfer === 'function') Ax.recordWealthTransfer(campaign, spec, { submittedBy: 'engine', campaignLogHidden: true });
    } catch(e){ /* the army-supply event still records the cost */ }
  }

  // applyArmySupplyOutcome — the commit half (the consumer's army-supply record). In supply:
  // clear conditions, pay the gold (unless fed by requisition). Out of supply: set the RR p.452
  // ladder (≥½ fed → underfed; <½ → starving; barrens/desert without water → dehydrated) and
  // log each unit's out-of-supply CALAMITY (the loyalty roll is the GM's — the §11 modal; the
  // feed-some-not-all −1 and the hp→casualty attrition are W7 / GM-applied 🔧).
  function applyArmySupplyOutcome(campaign, army, outcome){
    const Ax = A();
    const units = (typeof Ax.armyUnits === 'function') ? Ax.armyUnits(campaign, army) : [];
    army.lastSupplyCheckOrd = (outcome.ord != null) ? outcome.ord : worldOrd(campaign);
    if(outcome.inSupply){
      for(const u of units){ if(u.supplyState !== 'supplied') u.supplyState = 'supplied'; }
      if(outcome.payGold) _payArmySupplyCost(campaign, army, outcome.cost || 0);
      army.requisitioning = null;
      return;
    }
    const state = outcome.dehydrated ? 'dehydrated' : ((outcome.fraction != null && outcome.fraction >= 0.5) ? 'underfed' : 'starving');
    const doubled = !!outcome.outOfSupplyDoubled;   // RR p.449 — sweltering doubles the penalty (heat exhaustion + dehydration)
    for(const u of units){
      u.supplyState = state;
      u.calamities = u.calamities || [];
      u.calamities.push({ kind: 'out-of-supply', atOrd: army.lastSupplyCheckOrd, doubled,
        note: 'Out of supply (' + state + ')' + (doubled ? ' — penalties DOUBLED (sweltering heat exhaustion + dehydration, RR p.449)' : '') + ' — loyalty roll due (RR p.452)' });
    }
  }

  // requisitionSupplies (RR p.451) — an out-of-supply army feeds itself from a domain's
  // peasants: requisition 35gp/family (once per year per domain; peasants survive), then
  // (allowLoot) loot 15gp/family at the cost of 1 family per 15gp. Capped at the army's
  // weekly supply cost (RAW: ≤ weekly cost per day). Feeds the army this period; sets the
  // −50% requisitioning flag (🔧 v1 GM-applied to the march); emits domain-warfare.
  function requisitionSupplies(campaign, spec){
    const Ax = A(); spec = spec || {};
    const army = _army(campaign, spec.armyId);
    if(!army) return { ok: false, reason: 'no-army' };
    let dom = _domain(campaign, spec.domainId);
    if(!dom){ const h = _hex(campaign, army.currentHexId); dom = (h && h.domainId) ? _domain(campaign, h.domainId) : null; }
    if(!dom) return { ok: false, reason: 'no-domain' };
    const ord = (spec.atOrd != null) ? spec.atOrd : worldOrd(campaign);
    const fam = (dom.demographics && dom.demographics.peasantFamilies) || 0;
    if(fam <= 0) return { ok: false, reason: 'no-peasants' };
    const cost = (typeof Ax.armyWeeklySupplyCost === 'function') ? Ax.armyWeeklySupplyCost(campaign, army) : 0;
    const cap = (spec.gpWanted != null) ? spec.gpWanted : Math.max(cost, 0);
    const REQ = 35, LOOT = 15, YEAR = 360;
    const requisitionedThisYear = (dom.lastRequisitionedOrd != null) && (ord - dom.lastRequisitionedOrd < YEAR);
    const reqGp = requisitionedThisYear ? 0 : Math.min(cap, REQ * fam);
    const remaining = Math.max(0, cap - reqGp);
    let lootGp = 0, familiesLost = 0;
    if(remaining > 0 && spec.allowLoot){
      lootGp = Math.min(remaining, LOOT * fam);
      familiesLost = Math.floor(lootGp / LOOT);
    }
    const totalGp = reqGp + lootGp;
    if(totalGp <= 0) return { ok: false, reason: requisitionedThisYear ? 'already-requisitioned-this-year' : 'nothing-available' };
    if(reqGp > 0) dom.lastRequisitionedOrd = ord;
    if(familiesLost > 0){
      const newFam = Math.max(0, fam - familiesLost);
      if(typeof Ax.setPeasantPopulation === 'function') Ax.setPeasantPopulation(dom, newFam);
      else if(dom.demographics) dom.demographics.peasantFamilies = newFam;
    }
    army.lastSupplyCheckOrd = ord;
    army.requisitioning = { atOrd: ord, gp: totalGp };
    for(const u of ((typeof Ax.armyUnits === 'function') ? Ax.armyUnits(campaign, army) : [])){ u.supplyState = 'supplied'; }
    const verb = lootGp > 0 ? 'loots' : 'requisitions supplies from';
    _armyHistory(campaign, army, 'requisition', (army.name || 'The army') + ' ' + verb + ' ' + (dom.name || 'a domain') + ': ' + totalGp + 'gp' + (familiesLost ? (' — ' + familiesLost + ' families lost') : '') + '.');
    _emitWarfareEvent(campaign,
      { action: lootGp > 0 ? 'looted' : 'requisitioned', armyId: army.id, domainId: dom.id, requisitionedGp: reqGp, lootedGp: lootGp, familiesLost, gp: totalGp },
      { primaryHexId: army.currentHexId || null, domainId: dom.id,
        relatedEntities: [{ kind: 'army', id: army.id, role: 'subject' }, { kind: 'domain', id: dom.id, role: lootGp > 0 ? 'victim' : 'target' }].concat(army.leaderCharacterId ? [{ kind: 'character', id: army.leaderCharacterId, role: 'commander' }] : []) },
      (army.name || 'The army') + ' ' + verb + ' ' + (dom.name || 'a domain') + ' (' + totalGp + 'gp' + (familiesLost ? (', ' + familiesLost + ' families lost') : '') + ').');
    return { ok: true, requisitionedGp: reqGp, lootedGp: lootGp, totalGp, familiesLost, domainId: dom.id };
  }

  // rollArmyWeatherDisease (RR p.449) — the weekly weather-disease check. Severe weather
  // gives a weekly % chance of a "disease vagary": frigid/cold EXPOSURE (10% / 5%) and
  // rainy/snowy WETNESS (10%) are separate causes (RR p.449), each its own roll. Core RAW —
  // NOT gated on the optional vagaries-of-war table. A hit = an epidemic befalls the army
  // (each unit makes a Death save, or is incapacitated for the duration then recovers/dies —
  // JJ pp.113–114; GM-resolved, like the W8 Disease vagary). Returns { chance, contracted,
  // condHit, tempHit, condPct, tempPct, causes[], condition, temperature }. opts.weather =
  // the day's {condition, temperature}; opts.rng = the (isolated) roll source.
  function rollArmyWeatherDisease(campaign, army, opts){
    const o = opts || {};
    const wx = _armyWeatherEffects(campaign, army, o);
    const condPct = (wx && wx.conditionDiseasePctWeek) || 0;
    const tempPct = (wx && wx.temperatureDiseasePctWeek) || 0;
    if(condPct <= 0 && tempPct <= 0) return { chance: false, contracted: false, condPct: 0, tempPct: 0, causes: [] };
    const rng = o.rng || Math.random;
    const condHit = condPct > 0 && (rng() * 100) < condPct;
    const tempHit = tempPct > 0 && (rng() * 100) < tempPct;
    const causes = [];
    if(condHit) causes.push((wx.conditionLabel || wx.condition) + ' wetness');
    if(tempHit) causes.push((wx.temperatureLabel || wx.temperature) + ' exposure');
    return { chance: true, contracted: condHit || tempHit, condHit, tempHit, condPct, tempPct, causes,
             condition: wx.condition, temperature: wx.temperature };
  }

  // ── exports ─────────────────────────────────────────────────────────────────
  Object.assign(ACKS, {
    // composition + movement
    armyTroopCount, armyTroopSourceBreakdown, armyBrigadeEquivalents, armyCavalryCompanyEquivalents, armyOnCampaign,
    armyMarchProfile, armyExpeditionSpeedMilesPerDay, armyDominantScale,
    recordArmyMarchDay, armyFatigued,
    // allegiance
    leadersOpposed, armiesOpposed, domainFriendlyToArmy,
    // the campaign cycle
    rollArmyInitiative, worldOrd,
    // reconnaissance & intelligence
    armyHexDistance, armyInReconRange, armyReconRoll, buildIntelReport, latestIntelOn,
    interrogatePrisoner, contactAwareness,
    // marches
    startArmyMarch, stopArmyMarch,
    // invasion / occupation / conquest
    immediateDomainMoraleRoll, applyImmediateMoraleResult, invasionGarrisonSupportMods,
    domainOccupationStatus, occupyDomain, occupationMonths, endOccupation,
    conquestEligibility, conquerDomain,
    // pillage
    beginPillage, rollPillageResults, applyPillageResults, resolvePillage, ransomPrisoners,
    // occupation economics
    peasantIncomeShare, occupierRulerSummary,
    // supply (W5 — RR pp.450–452)
    supplyLineStatus, supplyBaseValue, armySupplyBaseTotalValue, armyInSupply,
    armySupplyTrigger, armyMarketClass, armySupplyTerrainTreatment,
    applyArmySupplyOutcome, requisitionSupplies, buildSupplyBaseFort,
    // weather-on-war (RR p.449)
    rollArmyWeatherDisease
  });

  if(typeof module !== 'undefined' && module.exports){
    module.exports = ACKS;
  }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
