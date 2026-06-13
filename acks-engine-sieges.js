/* =============================================================================
 * acks-engine-sieges.js — ACKS God Mode sieges engine (Phase 3 Military W6)
 *
 * RR pp.473–485 — the investment of a garrisoned stronghold or urban settlement.
 *
 *   DEFAULT resolution: Sieges Simplified (RR pp.484–485) — cross-reference the
 *   stronghold's structural hit points (shp) with the besieger's unit advantage
 *   (units + artillery bonus units − the defender's) on the Duration-of-Siege
 *   table → days to capture, × the site modifier (riverbank ×2 … mountain ×5).
 *   "0" = falls without a fight; "−" = the besieger can only blockade and starve.
 *   Casualties resolve as ONE final battle (RAW: "resolve a battle, not an assault").
 *
 *   DETAILED methods (the per-instance opt-up): blockade (encirclement + stored-
 *   supply depletion + circumvallation), reduction (artillery bombardment → shp
 *   damage → breaches), and assault — which HANDS OFF to the shipped W3 battle
 *   engine (an assault IS a battle; the walls give the defender the advantage).
 *
 * Posture: RAW core, default-ON. "Sieges Simplified" is a per-instance mode flag
 * (siege.resolutionMode), NOT a house rule (CLAUDE §6). daysElapsed is DERIVED
 * (worldOrd − startedOrd), never stored. campaign.sieges[] is read defensively
 * (create-on-first-write) — NO migrateCampaign injector, so the 6 templates + demo
 * stay migrate-no-ops.
 *
 * The slot-90 'siege' day consumer self-registers from THIS module (it runs after
 * the slot-88 'military' consumer — the day's marches are settled before a siege
 * advances). The siege-started / siege-progress / siege-resolved event kinds live
 * in acks-engine-events.js; the Siege entity factory (blankSiege) lives in
 * acks-engine-entities.js.
 *
 * Load order: AFTER acks-engine-maneuvers.js + acks-engine-battles.js (an assault
 * calls createBattle) — the team-session glob runner loads this module last, so
 * every dependency is resolved by call time (the A() lazy-accessor idiom).
 * =============================================================================
 */
(function (global) {
  'use strict';
  const ACKS = global.ACKS = global.ACKS || {};
  function A(){ return global.ACKS; }

  // ── small helpers ───────────────────────────────────────────────────────────
  // Absolute world ordinal (turn*30 + dayInMonth) — the lastTravelWorldOrd convention.
  function _worldOrd(campaign, dayInMonth){
    const t = (campaign && campaign.currentTurn) || 1;
    const d = (dayInMonth != null) ? dayInMonth : ((campaign && campaign.currentDayInMonth) || 1);
    return t * 30 + d;
  }
  function _domain(campaign, id){ return (campaign && id && (campaign.domains || []).find(d => d && d.id === id)) || null; }
  function _army(campaign, id){ return (campaign && id && (campaign.armies || []).find(a => a && a.id === id)) || null; }
  function _hex(campaign, id){ return (campaign && id && (campaign.hexes || []).find(h => h && h.id === id)) || null; }
  function _siege(campaign, id){ return (campaign && id && (campaign.sieges || []).find(s => s && s.id === id)) || null; }
  function _siegeHistory(campaign, siege, type, narrative){
    if(!siege) return;
    (siege.history = siege.history || []).push({
      turn: (campaign && campaign.currentTurn) || null,
      dayInMonth: (campaign && campaign.currentDayInMonth) || null,
      type, narrative
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // RAW reference tables (kept LOCAL to this module — catalogs.js is out of lane).
  // ═══════════════════════════════════════════════════════════════════════════

  // Duration of Siege table (RR p.484). Rows = stronghold shp band (upper bound);
  // columns = besieging army's unit advantage band (upper bound). Cell = days to
  // capture (Sieges Simplified). null = "−" (besieger too weak — blockade only);
  // 0 = captured without a fight.
  const SIEGE_DURATION_SHP_BANDS = [3000, 6000, 9000, 12000, 15000, 20000, 30000, 50000, 75000, 100000, 125000, 150000, 200000, 250000, 300000, Infinity];
  const SIEGE_DURATION_ADV_BANDS = [2, 4, 10, 15, 30, 50, 75, 100, 200, 300, 400, 500, 600, Infinity];
  const SIEGE_DURATION_TABLE = [
    [  45,  23,    9,    6,    3,    2,    1,    1,    0,    0,    0,    0,    0,    0],  // 1–3,000
    [  90,  45,   18,   12,    6,    4,    2,    2,    1,    1,    0,    0,    0,    0],  // 4–6,000
    [ 135,  68,   27,   18,    9,    5,    4,    3,    1,    1,    1,    1,    0,    0],  // 7–9,000
    [ 180,  90,   36,   24,   12,    7,    5,    4,    2,    1,    1,    1,    1,    1],  // 10–12,000
    [ 225, 113,   45,   30,   15,    9,    6,    5,    2,    2,    1,    1,    1,    1],  // 13–15,000
    [null, 150,   60,   40,   20,   12,    8,    6,    3,    2,    2,    1,    1,    1],  // 16–20,000
    [null, 225,   90,   60,   30,   18,   12,    9,    5,    3,    2,    2,    2,    1],  // 21–30,000
    [null, null, 150,  100,   50,   30,   20,   15,    8,    5,    4,    3,    3,    2],  // 31–50,000
    [null, null, 225,  150,   75,   45,   30,   23,   11,    8,    6,    5,    4,    3],  // 51–75,000
    [null, null, null, 200,  100,   60,   40,   30,   15,   10,    8,    6,    5,    4],  // 76–100,000
    [null, null, null, 250,  125,   75,   50,   38,   19,   13,    9,    8,    6,    5],  // 101–125,000
    [null, null, null, null, 200,  120,   80,   60,   30,   20,   15,   12,   10,    9],  // 126–150,000
    [null, null, null, null, 250,  150,  100,   75,   38,   25,   19,   15,   13,   11],  // 151–200,000
    [null, null, null, null, null, 180,  120,   90,   45,   30,   23,   18,   15,   13],  // 201–250,000
    [null, null, null, null, null, 210,  140,  105,   53,   35,   26,   21,   18,   15],  // 251–300,000
    [null, null, null, null, null, 240,  160,  120,   60,   40,   30,   24,   20,   17]   // 301,000+
  ];

  // Siege Duration Modifier (RR p.485) — inaccessible terrain multiplies the days.
  const SIEGE_SITE_MODIFIER = Object.freeze({ normal: 1, riverbank: 2, peninsula: 3, island: 4, mountain: 5 });

  // Sieges-Simplified bonus units (RR p.485) — artillery / siege engines count as bonus
  // units toward the unit advantage. unitSize = pieces that form one bonus unit (the
  // parenthetical on the printed table); per-piece types have unitSize 1.
  const SIEGE_BONUS_UNITS = Object.freeze({
    'light-ballista':       { bonus: 1,  unitSize: 10 },
    'medium-ballista':      { bonus: 1,  unitSize: 5  },
    'heavy-ballista':       { bonus: 2,  unitSize: 1  },
    'ram':                  { bonus: 1,  unitSize: 6  },   // Battering Rams / Screws
    'light-catapult':       { bonus: 2,  unitSize: 1  },
    'medium-catapult':      { bonus: 3,  unitSize: 1  },
    'heavy-catapult':       { bonus: 6,  unitSize: 1  },
    'hoist':                { bonus: 1,  unitSize: 10 },
    'siege-tower-standard': { bonus: 1,  unitSize: 1  },
    'siege-tower-large':    { bonus: 2,  unitSize: 1  },
    'siege-tower-huge':     { bonus: 8,  unitSize: 1  },
    'light-trebuchet':      { bonus: 6,  unitSize: 1  },
    'medium-trebuchet':     { bonus: 15, unitSize: 1  },
    'heavy-trebuchet':      { bonus: 18, unitSize: 1  }
  });

  // Artillery Bombardment table (RR p.476) — shp dealt per day, by stronghold material.
  // Only artillery bombards; rams / towers / hoists are assault equipment (no entry).
  const SIEGE_BOMBARDMENT = Object.freeze({
    'light-ballista':   { wood: 775,  stone: 0   },
    'medium-ballista':  { wood: 1500, stone: 0   },
    'heavy-ballista':   { wood: 2250, stone: 75  },
    'light-catapult':   { wood: 2250, stone: 75  },
    'medium-catapult':  { wood: 3750, stone: 125 },
    'heavy-catapult':   { wood: 2500, stone: 275 },
    'light-trebuchet':  { wood: 2500, stone: 275 },
    'medium-trebuchet': { wood: 2000, stone: 625 },
    'heavy-trebuchet':  { wood: 2250, stone: 750 }
  });

  // ── estimation (RR p.474 "Sieges Without Maps") ─────────────────────────────
  // Stone stronghold shp ≈ gp value / 10; wooden ≈ ⅒ that (gp / 100). Rounded up.
  function strongholdShpEstimate(gpValue, material){
    const gp = Number(gpValue) || 0;
    if(gp <= 0) return 0;
    return Math.ceil(gp / ((material === 'wood') ? 100 : 10));
  }
  // For every 1,000 shp, the stronghold can be garrisoned/defended by 1 unit (rounded up).
  function unitCapacityEstimate(shp){
    const s = Number(shp) || 0;
    return s <= 0 ? 0 : Math.ceil(s / 1000);
  }

  // ── artillery → bonus units / bombardment ───────────────────────────────────
  function artilleryBonusUnits(artilleryMap){
    let total = 0;
    for(const k of Object.keys(artilleryMap || {})){
      const def = SIEGE_BONUS_UNITS[k];
      const n = Number(artilleryMap[k]) || 0;
      if(def && n > 0) total += Math.floor(n / def.unitSize) * def.bonus;
    }
    return total;
  }
  function bombardmentPerDay(artilleryMap, material){
    const mat = (material === 'wood') ? 'wood' : 'stone';
    let dmg = 0;
    for(const k of Object.keys(artilleryMap || {})){
      const def = SIEGE_BOMBARDMENT[k];
      const n = Number(artilleryMap[k]) || 0;
      if(def && n > 0) dmg += n * (def[mat] || 0);
    }
    return dmg;
  }

  // ── breaches + assault capacity (RR p.473) ──────────────────────────────────
  function siegeBreaches(shpDamage){ return Math.floor((Number(shpDamage) || 0) / 1000); }
  function assaultUnitsAllowed(unitCapacity, breaches){ return (Number(unitCapacity) || 0) + (Number(breaches) || 0); }
  function defendUnitsAllowed(unitCapacity){ return Number(unitCapacity) || 0; }   // breaches don't help defenders

  // ── blockade (RR pp.474–475) ────────────────────────────────────────────────
  // Units to blockade = 2 × unit capacity, minimum 20.
  function blockadeUnitsRequired(unitCapacity){ return Math.max(2 * (Number(unitCapacity) || 0), 20); }
  // A complete circumvallation runs 250' per point of unit capacity.
  function circumvallationFeetToEncircle(unitCapacity){ return (Number(unitCapacity) || 0) * 250; }
  // Each 250' of circumvallation replaces 2 blockading units (the wall does the patrolling).
  function blockadeUnitsAfterCircumvallation(unitCapacity, feet){
    const base = blockadeUnitsRequired(unitCapacity);
    const replaced = Math.floor((Number(feet) || 0) / 250) * 2;
    return Math.max(0, base - replaced);
  }
  // Construction cost — 100gp per 100' (= 1gp/foot). (RR's Marcus example prints 6,250gp
  // for 6,000', but the stated rate yields 6,000 — the rate is canonical here.)
  function circumvallationCostGp(feet){ return Number(feet) || 0; }
  // Stored supplies = 600gp × unit capacity (10 weeks at full garrison), + 600/cap per week
  // of warning before the blockade closes, capped at 3,000/cap (a year).
  function siegeStoredSupplies(unitCapacity, weeksPrep){
    const cap = Number(unitCapacity) || 0;
    const prep = Math.max(0, Number(weeksPrep) || 0);
    return Math.min(600 * cap * (1 + prep), 3000 * cap);
  }
  function siegeWeeksOfSupply(storedGp, weeklyCostGp){
    const cost = Number(weeklyCostGp) || 0;
    if(cost <= 0) return Infinity;
    return (Number(storedGp) || 0) / cost;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Sieges Simplified — the Duration-of-Siege resolver (RR pp.484–485).
  // ═══════════════════════════════════════════════════════════════════════════
  function _bandIndex(bands, value){
    for(let i = 0; i < bands.length; i++){ if(value <= bands[i]) return i; }
    return bands.length - 1;
  }
  // Returns { days, tooWeak, immediate, base, siteModifier }. days=null when the besieger
  // is too weak (blockade only). A site modifier multiplies a positive day count.
  function siegeDurationDays(shp, unitAdvantage, siteType){
    const s = Math.max(0, Number(shp) || 0);
    const adv = Number(unitAdvantage) || 0;
    const mult = SIEGE_SITE_MODIFIER[siteType] || 1;
    if(adv < 1) return { days: null, tooWeak: true, immediate: false, base: null, siteModifier: mult };
    const row = SIEGE_DURATION_TABLE[_bandIndex(SIEGE_DURATION_SHP_BANDS, s)];
    const base = row[_bandIndex(SIEGE_DURATION_ADV_BANDS, adv)];
    if(base == null) return { days: null, tooWeak: true, immediate: false, base: null, siteModifier: mult };
    if(base === 0) return { days: 0, tooWeak: false, immediate: true, base: 0, siteModifier: mult };
    return { days: base * mult, tooWeak: false, immediate: false, base, siteModifier: mult };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Derived reads (derive-don't-store, §3.13).
  // ═══════════════════════════════════════════════════════════════════════════
  function siegeBesiegerArmy(campaign, siege){ return _army(campaign, siege && siege.besiegerArmyId); }
  function siegeDefenderDomain(campaign, siege){ return _domain(campaign, siege && siege.defenderDomainId); }
  function siegeDefenderArmy(campaign, siege){ return _army(campaign, siege && siege.defenderArmyId); }

  // Number of tactical units (RR p.484 counts unit objects, not troops).
  function siegeBesiegerUnitCount(campaign, siege){
    const army = siegeBesiegerArmy(campaign, siege);
    if(!army) return 0;
    const Ax = A();
    return (typeof Ax.armyUnits === 'function') ? Ax.armyUnits(campaign, army).length : 0;
  }
  function siegeDefenderUnitCount(campaign, siege){
    const Ax = A();
    let n = 0;
    const dom = siegeDefenderDomain(campaign, siege);
    if(dom && typeof Ax.unitsStationedAt === 'function'){
      n += Ax.unitsStationedAt(campaign, { kind: 'domain-garrison', id: dom.id }).length;
    }
    const darmy = siegeDefenderArmy(campaign, siege);
    if(darmy && typeof Ax.armyUnits === 'function') n += Ax.armyUnits(campaign, darmy).length;
    return n;
  }
  // Besieger units + bonus units − defender units − bonus units (RR p.484).
  function siegeUnitAdvantage(campaign, siege){
    if(!siege) return 0;
    const besieger = siegeBesiegerUnitCount(campaign, siege) + artilleryBonusUnits(siege.besiegerArtillery);
    const defender = siegeDefenderUnitCount(campaign, siege) + artilleryBonusUnits(siege.defenderArtillery);
    return besieger - defender;
  }

  // The stronghold's working profile (authored, with the breach/site math derived).
  function siegeStrongholdProfile(campaign, siege){
    const sh = (siege && siege.stronghold) || {};
    const shp = Number(sh.strongholdShp) || 0;
    const damage = Math.min(Number(sh.shpDamage) || 0, shp);
    const cap = Number(sh.unitCapacity) || unitCapacityEstimate(shp);
    const breaches = siegeBreaches(damage);
    const siteType = sh.siteType || 'normal';
    return {
      material: sh.material || 'stone', strongholdShp: shp, shpDamage: damage,
      shpRemaining: Math.max(0, shp - damage), reducedToRubble: shp > 0 && damage >= shp,
      unitCapacity: cap, breaches, siteType, siteModifier: SIEGE_SITE_MODIFIER[siteType] || 1,
      assaultUnitsAllowed: assaultUnitsAllowed(cap, breaches), defendUnitsAllowed: defendUnitsAllowed(cap)
    };
  }

  // Days the siege has run (DERIVED from startedOrd). `atOrd` lets the day consumer ask
  // "as of the proposed day" / "as of yesterday".
  function siegeDaysElapsed(campaign, siege, atOrd){
    if(!siege || siege.startedOrd == null) return 0;
    const now = (atOrd != null) ? atOrd : _worldOrd(campaign);
    return Math.max(0, now - siege.startedOrd);
  }

  // The defender garrison's weekly supply cost (the blockade-starvation clock). Prefers the
  // shipped W5 unit-supply reads; falls back to the RAW 60gp/unit infantry rate (RR p.475).
  function siegeDefenderWeeklySupplyCost(campaign, siege){
    const Ax = A();
    let units = [];
    const dom = siegeDefenderDomain(campaign, siege);
    if(dom && typeof Ax.unitsStationedAt === 'function') units = units.concat(Ax.unitsStationedAt(campaign, { kind: 'domain-garrison', id: dom.id }));
    const darmy = siegeDefenderArmy(campaign, siege);
    if(darmy && typeof Ax.armyUnits === 'function') units = units.concat(Ax.armyUnits(campaign, darmy));
    if(typeof Ax.unitWeeklySupplyCost === 'function' && units.length){
      let sum = 0; for(const u of units) sum += Number(Ax.unitWeeklySupplyCost(campaign, u)) || 0;
      if(sum > 0) return sum;
    }
    return 60 * units.length;
  }

  // The full progress read the panel + consumer share.
  function siegeProgress(campaign, siege){
    if(!siege) return null;
    const prof = siegeStrongholdProfile(campaign, siege);
    const adv = siegeUnitAdvantage(campaign, siege);
    const dur = siegeDurationDays(prof.strongholdShp, adv, prof.siteType);
    const elapsed = siegeDaysElapsed(campaign, siege);
    const resolved = siege.status === 'resolved';
    let status;
    if(resolved) status = 'resolved';
    else if(dur.tooWeak) status = 'blockade-only';
    else if(siege.captureReady || (dur.days != null && elapsed >= dur.days)) status = 'capture-ready';
    else status = 'investing';
    // blockade supply clock
    let supplies = null;
    if(siege.blockade && siege.blockade.inPlace){
      const weeklyCost = siegeDefenderWeeklySupplyCost(campaign, siege);
      const weeks = siegeWeeksOfSupply(siege.blockade.storedSuppliesGp, weeklyCost);
      supplies = { storedGp: siege.blockade.storedSuppliesGp || 0, weeklyCost,
        weeksOfSupply: weeks, weeksElapsed: Math.floor(elapsed / 7),
        exhausted: siege.blockade.suppliesExhausted || (isFinite(weeks) && Math.floor(elapsed / 7) >= weeks),
        circumvallationFeet: siege.blockade.circumvallationFeet || 0,
        unitsRequired: blockadeUnitsAfterCircumvallation(prof.unitCapacity, siege.blockade.circumvallationFeet),
        fullyEncircled: (siege.blockade.circumvallationFeet || 0) >= circumvallationFeetToEncircle(prof.unitCapacity) };
    }
    return {
      mode: siege.resolutionMode || 'simplified',
      unitAdvantage: adv, besiegerUnits: siegeBesiegerUnitCount(campaign, siege),
      defenderUnits: siegeDefenderUnitCount(campaign, siege),
      besiegerBonus: artilleryBonusUnits(siege.besiegerArtillery), defenderBonus: artilleryBonusUnits(siege.defenderArtillery),
      daysRequired: dur.days, tooWeak: dur.tooWeak, immediate: dur.immediate, baseDays: dur.base, siteModifier: dur.siteModifier,
      daysElapsed: elapsed, daysRemaining: (dur.days != null) ? Math.max(0, dur.days - elapsed) : null,
      captureReady: status === 'capture-ready', status, stronghold: prof, supplies,
      assaultBattleId: siege.assaultBattleId || null
    };
  }

  function siegeStatusLabel(campaign, siege){
    const p = siegeProgress(campaign, siege);
    if(!p) return '';
    if(p.status === 'resolved') return 'Resolved — ' + ((siege.resolution && siege.resolution.outcome) || 'ended');
    if(p.status === 'blockade-only') return 'Blockade only — the besieger is too weak to storm it';
    if(p.status === 'capture-ready') return 'The stronghold can be taken — resolve the siege';
    return 'Investing — day ' + p.daysElapsed + (p.daysRequired != null ? ' of ' + p.daysRequired : '');
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Event emission (record-only audits; the setters/consumer own the state).
  // ═══════════════════════════════════════════════════════════════════════════
  function _emitSiegeEvent(campaign, kind, payload, context, narrative){
    try {
      const Ax = A();
      campaign.eventLog = campaign.eventLog || [];
      const cal = campaign.calendar || {};
      const ev = Ax.newEvent(kind, {
        submittedBy: 'engine', status: (Ax.EVENT_STATUS && Ax.EVENT_STATUS.APPLIED) || 'applied', cadence: 'daily',
        targetTurn: campaign.currentTurn || 1,
        gameTimeAt: { year: cal.year || 1, month: cal.month || 1, day: campaign.currentDayInMonth || 1 },
        context: Object.assign({ primaryHexId: null, involvedHexIds: [], settlementId: null, domainId: null, relatedEntities: [] }, context || {}),
        payload: Object.assign({}, payload, { narrative })
      });
      ev.appliedAtTurn = campaign.currentTurn || 1;
      if(payload && payload.campaignLogHidden) ev.campaignLogHidden = true;
      campaign.eventLog.push({ event: ev, result: { narrativeSummary: narrative }, appliedAtTurn: campaign.currentTurn || 1, appliedAt: new Date().toISOString() });
      return ev;
    } catch(e){ /* never let event emission block the verb */ return null; }
  }
  function _siegeContext(campaign, siege, extraRoles){
    const roles = [{ kind: 'siege', id: siege.id, role: 'subject' }];
    if(siege.besiegerArmyId) roles.push({ kind: 'army', id: siege.besiegerArmyId, role: 'subject' });
    if(siege.defenderDomainId) roles.push({ kind: 'domain', id: siege.defenderDomainId, role: 'victim' });
    if(siege.defenderArmyId) roles.push({ kind: 'army', id: siege.defenderArmyId, role: 'target' });
    return { primaryHexId: siege.hexId || null, domainId: siege.defenderDomainId || null,
      relatedEntities: roles.concat(extraRoles || []) };
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Lifecycle setters.
  // ═══════════════════════════════════════════════════════════════════════════
  // startSiege(campaign, spec): lay siege. spec = { besiegerArmyId, defenderDomainId? |
  //   defenderArmyId?, hexId?, material?, strongholdShp?, unitCapacity?, siteType?,
  //   resolutionMode?, besiegerArtillery?, defenderArtillery?, name?, id? }. The stronghold
  //   profile is authored or estimated from the domain's strongholdValue (RR p.474).
  function startSiege(campaign, spec){
    const Ax = A();
    spec = spec || {};
    if(!campaign) return { ok: false, reason: 'no-campaign' };
    const army = _army(campaign, spec.besiegerArmyId);
    if(!army) return { ok: false, reason: 'no-besieger' };
    const dom = _domain(campaign, spec.defenderDomainId);
    const darmy = _army(campaign, spec.defenderArmyId);
    if(!dom && !darmy) return { ok: false, reason: 'no-defender' };
    const hexId = spec.hexId || (dom && (dom.geography && (dom.geography.hexes || [])[0] && (dom.geography.hexes || [])[0].id))
      || army.currentHexId || null;
    const material = (spec.material === 'wood') ? 'wood' : 'stone';
    // Estimate the stronghold from the domain's value when not authored.
    let shp = Number(spec.strongholdShp) || 0;
    if(shp <= 0 && dom && typeof Ax.strongholdValue === 'function'){
      shp = strongholdShpEstimate(Ax.strongholdValue(campaign, dom), material);
    }
    const cap = Number(spec.unitCapacity) || unitCapacityEstimate(shp);
    const siege = Ax.blankSiege({
      id: spec.id, name: spec.name || ((army.name || 'An army') + ' besieges ' + ((dom && dom.name) || (darmy && darmy.name) || 'a stronghold')),
      besiegerArmyId: army.id, defenderDomainId: dom ? dom.id : null, defenderArmyId: darmy ? darmy.id : null,
      hexId, resolutionMode: (spec.resolutionMode === 'detailed') ? 'detailed' : 'simplified',
      besiegerArtillery: spec.besiegerArtillery || {}, defenderArtillery: spec.defenderArtillery || {},
      stronghold: { material, strongholdShp: shp, shpDamage: 0, unitCapacity: cap, siteType: spec.siteType || 'normal' },
      startedOrd: _worldOrd(campaign)
    });
    const adv = siegeUnitAdvantage(campaign, siege);
    const dur = siegeDurationDays(shp, adv, siege.stronghold.siteType);
    siege.unitAdvantageAtStart = adv;
    siege.daysRequired = dur.days;
    if(!Array.isArray(campaign.sieges)) campaign.sieges = [];
    campaign.sieges.push(siege);
    const summary = dur.tooWeak
      ? 'too weak to storm it — blockade only'
      : (dur.immediate ? 'it falls at once' : ('~' + dur.days + ' days to capture' + (dur.siteModifier > 1 ? ' (×' + dur.siteModifier + ' site)' : '')));
    const narrative = siege.name + ' (' + shp.toLocaleString() + ' shp, unit advantage ' + adv + ' → ' + summary + ').';
    _siegeHistory(campaign, siege, 'started', narrative);
    _emitSiegeEvent(campaign, 'siege-started',
      { siegeId: siege.id, besiegerArmyId: army.id, defenderDomainId: dom ? dom.id : null, defenderArmyId: darmy ? darmy.id : null,
        strongholdShp: shp, unitCapacity: cap, unitAdvantage: adv, daysRequired: dur.days, siteType: siege.stronghold.siteType, resolutionMode: siege.resolutionMode },
      _siegeContext(campaign, siege, army.leaderCharacterId ? [{ kind: 'character', id: army.leaderCharacterId, role: 'commander' }] : []),
      narrative);
    return { ok: true, siege };
  }

  // establishBlockade(campaign, siegeId, {circumvallationFeet?, weeksPrep?}) — encircle the
  // stronghold; compute stored supplies (RR pp.474–475). Defender's supply line is now cut.
  function establishBlockade(campaign, siegeId, opts){
    const siege = _siege(campaign, siegeId);
    if(!siege) return { ok: false, reason: 'no-siege' };
    if(siege.status === 'resolved') return { ok: false, reason: 'resolved' };
    opts = opts || {};
    const prof = siegeStrongholdProfile(campaign, siege);
    const weeksPrep = Math.max(0, Number(opts.weeksPrep) || 0);
    siege.blockade.inPlace = true;
    siege.blockade.circumvallationFeet = Math.max(0, Number(opts.circumvallationFeet) || 0);
    siege.blockade.weeksPrep = weeksPrep;
    siege.blockade.storedSuppliesGp = siegeStoredSupplies(prof.unitCapacity, weeksPrep);
    siege.blockade.suppliesExhausted = false;
    if(siege.resolutionMode !== 'detailed') siege.resolutionMode = 'detailed';
    const weeklyCost = siegeDefenderWeeklySupplyCost(campaign, siege);
    const weeks = siegeWeeksOfSupply(siege.blockade.storedSuppliesGp, weeklyCost);
    const narrative = 'Blockade established around ' + siege.name + ' — ' + siege.blockade.storedSuppliesGp.toLocaleString() + 'gp of stored supplies' + (isFinite(weeks) ? ' (~' + Math.floor(weeks) + ' weeks)' : '') + '.';
    _siegeHistory(campaign, siege, 'blockade', narrative);
    _emitSiegeEvent(campaign, 'siege-progress',
      { siegeId: siege.id, phase: 'blockade', circumvallationFeet: siege.blockade.circumvallationFeet, storedSuppliesGp: siege.blockade.storedSuppliesGp, weeksOfSupply: isFinite(weeks) ? Math.floor(weeks) : null },
      _siegeContext(campaign, siege), narrative);
    return { ok: true, siege, weeksOfSupply: weeks };
  }

  // recordBombardment(campaign, siegeId, {artillery?, days?}) — deal artillery shp damage
  // (RR p.476). artillery defaults to the siege's besieger artillery; days defaults to 1.
  function recordBombardment(campaign, siegeId, opts){
    const siege = _siege(campaign, siegeId);
    if(!siege) return { ok: false, reason: 'no-siege' };
    if(siege.status === 'resolved') return { ok: false, reason: 'resolved' };
    opts = opts || {};
    const prof = siegeStrongholdProfile(campaign, siege);
    const artillery = opts.artillery || siege.besiegerArtillery;
    const days = Math.max(1, Number(opts.days) || 1);
    const perDay = bombardmentPerDay(artillery, prof.material);
    if(perDay <= 0) return { ok: false, reason: 'no-bombardment' };
    const dealt = perDay * days;
    const before = siege.stronghold.shpDamage || 0;
    siege.stronghold.shpDamage = Math.min(prof.strongholdShp, before + dealt);
    if(siege.resolutionMode !== 'detailed') siege.resolutionMode = 'detailed';
    const breachesNow = siegeBreaches(siege.stronghold.shpDamage);
    const rubble = prof.strongholdShp > 0 && siege.stronghold.shpDamage >= prof.strongholdShp;
    const narrative = 'Bombardment of ' + siege.name + ' — ' + dealt.toLocaleString() + ' shp over ' + days + ' day' + (days === 1 ? '' : 's') + ' (' + breachesNow + ' breach' + (breachesNow === 1 ? '' : 'es') + (rubble ? '; reduced to rubble' : '') + ').';
    _siegeHistory(campaign, siege, 'bombardment', narrative);
    _emitSiegeEvent(campaign, 'siege-progress',
      { siegeId: siege.id, phase: 'reduction', shpDealt: dealt, shpDamage: siege.stronghold.shpDamage, breaches: breachesNow, reducedToRubble: rubble, campaignLogHidden: !rubble && breachesNow === before },
      _siegeContext(campaign, siege), narrative);
    return { ok: true, siege, shpDealt: dealt, breaches: breachesNow, reducedToRubble: rubble };
  }

  // launchSiegeAssault(campaign, siegeId, opts) — an assault IS a battle (RR p.485): hand off
  // to the shipped W3 battle engine. The besieger attacks (offensive); the defender holds the
  // walls (defensive, advantageousTerrain). Returns the created Battle (or {noBattle}).
  function launchSiegeAssault(campaign, siegeId, opts){
    const Ax = A();
    const siege = _siege(campaign, siegeId);
    if(!siege) return { ok: false, reason: 'no-siege' };
    if(siege.status === 'resolved') return { ok: false, reason: 'resolved' };
    if(typeof Ax.createBattle !== 'function') return { ok: false, reason: 'battle-engine-missing' };
    const army = siegeBesiegerArmy(campaign, siege);
    const dom = siegeDefenderDomain(campaign, siege);
    const darmy = siegeDefenderArmy(campaign, siege);
    if(!army) return { ok: false, reason: 'no-besieger' };
    if(!dom && !darmy) return { ok: false, reason: 'no-defender' };
    opts = opts || {};
    const sideB = darmy ? { kind: 'army', armyId: darmy.id, stance: 'defensive' }
                        : { kind: 'garrison', domainId: dom.id, stance: 'defensive' };
    const res = Ax.createBattle(campaign, {
      hexId: siege.hexId || null,
      scale: opts.scale || (typeof Ax.armyDominantScale === 'function' ? Ax.armyDominantScale(campaign, army) : 'company'),
      awareness: 'mutual',
      sideA: { kind: 'army', armyId: army.id, stance: 'offensive' },
      sideB,
      attackerSide: 'a',
      // The walls give the defender the high ground; a battered, breached stronghold helps the
      // attacker (a smaller assaulting force can still pour through breaches before the defender forms).
      options: { advantageousTerrain: 'b', armySizeAsymmetry: true }
    });
    if(!res || res.noBattle) return { ok: false, reason: 'no-battle', situation: res && res.situation };
    siege.assaultBattleId = res.id;
    if(siege.resolutionMode !== 'detailed') siege.resolutionMode = 'detailed';
    const narrative = (army.name || 'The besieging army') + ' assaults ' + siege.name + ' — the battle is joined (resolve it in 🎌 Battles; capture the stronghold from there).';
    _siegeHistory(campaign, siege, 'assault', narrative);
    _emitSiegeEvent(campaign, 'siege-progress',
      { siegeId: siege.id, phase: 'assault', battleId: res.id },
      _siegeContext(campaign, siege, [{ kind: 'battle', id: res.id, role: 'site' }]),
      narrative);
    return { ok: true, siege, battle: res };
  }

  // resolveSiege(campaign, siegeId, {outcome, battleId?, narrative?}) — end the siege.
  //   outcome ∈ captured | destroyed | surrendered | lifted.
  function resolveSiege(campaign, siegeId, opts){
    const siege = _siege(campaign, siegeId);
    if(!siege) return { ok: false, reason: 'no-siege' };
    if(siege.status === 'resolved') return { ok: false, reason: 'already-resolved' };
    opts = opts || {};
    const outcome = ['captured', 'destroyed', 'surrendered', 'lifted'].indexOf(opts.outcome) >= 0 ? opts.outcome : 'captured';
    siege.status = 'resolved';
    siege.captureReady = false;
    siege.resolution = { outcome, endedAtTurn: campaign.currentTurn || 1, battleId: opts.battleId || siege.assaultBattleId || null };
    const besiegerWon = (outcome === 'captured' || outcome === 'destroyed' || outcome === 'surrendered');
    const verb = { captured: 'is captured by', destroyed: 'is reduced to rubble by', surrendered: 'surrenders to', lifted: 'holds — the siege is lifted; the besieger withdraws from' }[outcome];
    const army = siegeBesiegerArmy(campaign, siege);
    const strongholdName = ((siegeDefenderDomain(campaign, siege) || {}).name) || 'The stronghold';
    const text = opts.narrative || (besiegerWon
      ? (strongholdName + ' ' + verb + ' ' + ((army && army.name) || 'the besieging army') + '.')
      : (strongholdName + ' ' + verb + '.'));
    _siegeHistory(campaign, siege, 'resolved', text);
    _emitSiegeEvent(campaign, 'siege-resolved',
      { siegeId: siege.id, outcome, besiegerWon, battleId: siege.resolution.battleId,
        besiegerArmyId: siege.besiegerArmyId, defenderDomainId: siege.defenderDomainId },
      _siegeContext(campaign, siege, army && army.leaderCharacterId ? [{ kind: 'character', id: army.leaderCharacterId, role: besiegerWon ? 'beneficiary' : 'subject' }] : []),
      text);
    return { ok: true, siege, outcome };
  }

  function findSiege(campaign, id){ return _siege(campaign, id); }
  function activeSieges(campaign){ return (campaign && campaign.sieges || []).filter(s => s && s.status !== 'resolved'); }
  function siegesAtHex(campaign, hexId){ return (campaign && campaign.sieges || []).filter(s => s && s.hexId === hexId); }
  function siegesForDomain(campaign, domainId){ return (campaign && campaign.sieges || []).filter(s => s && s.defenderDomainId === domainId); }

  // ═══════════════════════════════════════════════════════════════════════════
  // The slot-90 'siege' day consumer (RR pp.473–485). Runs AFTER the slot-88 military
  // consumer (the day's marches are settled). daysElapsed is DERIVED, so the consumer
  // fires only on a MILESTONE: the simplified clock running out (capture-ready), or a
  // blockade's stored supplies running out. Both pause for the GM, who then resolves the
  // siege from the panel (RAW keeps the final outcome — capture / negotiate / lift — the
  // commander's call). PURE handler; commit writes the flags + emits the audit.
  // ═══════════════════════════════════════════════════════════════════════════
  function proposeSiegeDay(campaign, ctx){
    const pendingRecords = [], notableEvents = [];
    if(!campaign || !Array.isArray(campaign.sieges) || !campaign.sieges.length) return { pendingRecords, notableEvents };
    ctx = ctx || {};
    const dayInMonth = (ctx.dayInMonth != null) ? ctx.dayInMonth : (campaign.currentDayInMonth || 1);
    const ordToday = _worldOrd(campaign, dayInMonth);
    for(const siege of campaign.sieges){
      if(!siege || siege.status === 'resolved' || siege.captureReady) continue;
      if(siege.startedOrd == null) continue;
      const elapsedToday = Math.max(0, ordToday - siege.startedOrd);
      const elapsedYday = elapsedToday - 1;
      const prof = siegeStrongholdProfile(campaign, siege);
      const adv = siegeUnitAdvantage(campaign, siege);
      const dur = siegeDurationDays(prof.strongholdShp, adv, prof.siteType);
      const name = siege.name || 'a siege';

      // milestone 1 — the simplified clock runs out (the stronghold can be taken).
      if(dur.days != null && elapsedToday >= dur.days && elapsedYday < dur.days){
        pendingRecords.push({
          kind: 'siege-day', siegeId: siege.id, milestone: 'capture-ready', name,
          daysElapsed: elapsedToday, daysRequired: dur.days, ord: ordToday,
          label: '\u{1F3F0} ' + name + ' — the stronghold’s defenses are spent (day ' + elapsedToday + ' of ' + dur.days + '); resolve the siege', status: 'pending'
        });
        notableEvents.push({
          kind: 'siege-day', type: 'siege-capture-ready', pauseTrigger: 'encounter',
          primaryHexId: siege.hexId || null,
          relatedEntities: _siegeContext(campaign, siege).relatedEntities,
          label: '\u{1F3F0} ' + name + ' — the stronghold can be taken (\u{1F4CB} Review \u{25B8} \u{1F38C} Battles \u{25B8} Sieges)',
          payload: { siegeId: siege.id, milestone: 'capture-ready' }
        });
        continue;   // one milestone per siege per day
      }

      // milestone 2 — a blockade's stored supplies run out (the garrison starves).
      if(siege.blockade && siege.blockade.inPlace && !siege.blockade.suppliesExhausted){
        const weeklyCost = siegeDefenderWeeklySupplyCost(campaign, siege);
        const weeks = siegeWeeksOfSupply(siege.blockade.storedSuppliesGp, weeklyCost);
        if(isFinite(weeks)){
          const wkToday = Math.floor(elapsedToday / 7), wkYday = Math.floor(Math.max(0, elapsedYday) / 7);
          if(wkToday >= weeks && wkYday < weeks){
            pendingRecords.push({
              kind: 'siege-day', siegeId: siege.id, milestone: 'supplies-exhausted', name,
              daysElapsed: elapsedToday, ord: ordToday,
              label: '\u{1F37D} ' + name + ' — the defenders’ stored supplies are exhausted; the garrison starves (loyalty calamities follow)', status: 'pending'
            });
            notableEvents.push({
              kind: 'siege-day', type: 'siege-supplies-exhausted', pauseTrigger: 'encounter',
              primaryHexId: siege.hexId || null,
              relatedEntities: _siegeContext(campaign, siege).relatedEntities,
              label: '\u{1F37D} ' + name + ' — the defenders are starving; surrender is near',
              payload: { siegeId: siege.id, milestone: 'supplies-exhausted' }
            });
          }
        }
      }
    }
    return { pendingRecords, notableEvents };
  }

  function commitSiegeRecord(campaign, record){
    if(!campaign || !record || record.kind !== 'siege-day') return;
    const siege = _siege(campaign, record.siegeId);
    if(!siege || siege.status === 'resolved') return;
    siege.lastTickOrd = record.ord != null ? record.ord : _worldOrd(campaign);
    if(record.milestone === 'capture-ready'){
      siege.captureReady = true;
      const narrative = (record.name || 'A siege') + ' — the stronghold’s defenses are spent (day ' + record.daysElapsed + ' of ' + record.daysRequired + '); the besieger may take it.';
      _siegeHistory(campaign, siege, 'capture-ready', narrative);
      _emitSiegeEvent(campaign, 'siege-progress',
        { siegeId: siege.id, phase: 'capture-ready', daysElapsed: record.daysElapsed, daysRequired: record.daysRequired },
        _siegeContext(campaign, siege), narrative);
    } else if(record.milestone === 'supplies-exhausted'){
      if(siege.blockade) siege.blockade.suppliesExhausted = true;
      const narrative = (record.name || 'A siege') + ' — the defenders’ stored supplies are exhausted; the garrison starves.';
      _siegeHistory(campaign, siege, 'supplies-exhausted', narrative);
      _emitSiegeEvent(campaign, 'siege-progress',
        { siegeId: siege.id, phase: 'supplies-exhausted' },
        _siegeContext(campaign, siege), narrative);
    }
  }

  // ── exports ───────────────────────────────────────────────────────────────
  Object.assign(ACKS, {
    // RAW tables (exposed for the UI + tests)
    SIEGE_DURATION_TABLE, SIEGE_DURATION_SHP_BANDS, SIEGE_DURATION_ADV_BANDS,
    SIEGE_SITE_MODIFIER, SIEGE_BONUS_UNITS, SIEGE_BOMBARDMENT,
    // estimation + math
    strongholdShpEstimate, unitCapacityEstimate, artilleryBonusUnits, bombardmentPerDay,
    siegeBreaches, assaultUnitsAllowed, defendUnitsAllowed,
    blockadeUnitsRequired, blockadeUnitsAfterCircumvallation, circumvallationFeetToEncircle,
    circumvallationCostGp, siegeStoredSupplies, siegeWeeksOfSupply, siegeDurationDays,
    // derived reads
    siegeBesiegerArmy, siegeDefenderDomain, siegeDefenderArmy,
    siegeBesiegerUnitCount, siegeDefenderUnitCount, siegeUnitAdvantage,
    siegeStrongholdProfile, siegeDaysElapsed, siegeDefenderWeeklySupplyCost,
    siegeProgress, siegeStatusLabel,
    // lookups
    findSiege, activeSieges, siegesAtHex, siegesForDomain,
    // setters
    startSiege, establishBlockade, recordBombardment, launchSiegeAssault, resolveSiege,
    // day-tick consumer (exposed for tests; registered below)
    proposeSiegeDay, commitSiegeRecord
  });

  // Self-register the slot-90 'siege' day consumer (the team-session pattern: register from
  // the OWN module — registerDayConsumer ships from acks-engine.js, loaded before this).
  if(typeof ACKS.registerDayConsumer === 'function'){
    ACKS.registerDayConsumer('siege', {
      handler: proposeSiegeDay,
      order: 90,                       // after the slot-88 military consumer
      pauseTriggers: ['encounter'],    // capture-ready / supplies-exhausted pause for GM review
      commit: commitSiegeRecord
    });
  }

  if(typeof module !== 'undefined' && module.exports){
    module.exports = ACKS;
  }

})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
