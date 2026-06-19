/* =============================================================================
 * acks-engine-battles.js — ACKS God Mode battle engine (Phase 3 Military W3)
 *
 * The RR pp.461–472 streamlined battle system: strategic situations → zone setup →
 * the 10-phase battle turn (missile/melee per zone pair, morale, redeployment,
 * reinforcements) → ending → aftermath (retreat, pursuit, casualties, officer
 * wounds, spoils, XP). Heroes ride as hero-units (RR p.466, the automation
 * default) or through heroic forays (the at-table seam: the tool frames the
 * fight — foes, groups, battlefield encounter distances — the GM resolves it
 * under the standard combat rules and enters the BR outcome).
 *
 * The Battle entity (campaign.battles[], blankBattle in acks-engine-entities.js)
 * holds working battle-unit records that POINT at world Units / Groups / heroes;
 * the world is only written when the aftermath is APPLIED (propose-review-commit).
 * Battle events stamp Event.subdayContext = {cadence:'battle-turn', battleId,
 * turnNumber} — the reserved field's second referent after the encounter layer.
 *
 * Tables read from acks-engine-catalogs.js (STRATEGIC_SITUATIONS, UNIT_MORALE_BANDS,
 * PURSUIT_THROWS, BATTLEFIELD_ENCOUNTER_DISTANCE, …) + acks-engine-troops.js
 * (TROOP_CATALOG, ARMY_ORG_SCALE, JJ_MASS_COMBAT) + the W1 unit/army/officer reads.
 *
 * Load order: AFTER acks-engine-events.js (emits via recordAppliedEvent + the
 * registered battle-* kinds), BEFORE acks-engine-subsystems.js.
 * =============================================================================
 */
(function (global) {
  'use strict';
  const ACKS = global.ACKS = global.ACKS || {};
  function A(){ return global.ACKS; }

  // ── dice + small helpers ────────────────────────────────────────────────────
  function _d20(rng){ return 1 + Math.floor((rng || Math.random)() * 20); }
  function _d6(rng){ return 1 + Math.floor((rng || Math.random)() * 6); }
  function _2d6(rng){ return _d6(rng) + _d6(rng); }
  function _halfBr(x){ return Math.round(x * 2) / 2; }
  function _clone(x){ return JSON.parse(JSON.stringify(x)); }
  function _char(campaign, id){
    if(!campaign || !id) return null;
    return (campaign.characters || []).find(c => c && c.id === id) || null;
  }
  function _hex(campaign, hexId){
    if(!campaign || !hexId) return null;
    return (campaign.hexes || []).find(h => h && h.id === hexId) || null;
  }
  let _buCounter = 0;
  function _buKey(){ _buCounter++; return 'bu-' + _buCounter + '-' + Math.random().toString(36).slice(2, 6); }

  // ── lookups ─────────────────────────────────────────────────────────────────
  function findBattle(campaign, battleId){
    if(!campaign || !Array.isArray(campaign.battles)) return null;
    return campaign.battles.find(b => b && b.id === battleId) || null;
  }
  function activeBattles(campaign){
    return ((campaign && campaign.battles) || []).filter(b => b && (b.status === 'setup' || b.status === 'fighting' || b.status === 'ended'));
  }
  function battlesAtHex(campaign, hexId){
    return ((campaign && campaign.battles) || []).filter(b => b && b.hexId === hexId);
  }
  function _battleHistory(campaign, battle, type, summary){
    if(!Array.isArray(battle.history)) battle.history = [];
    battle.history.push({ atTurn: (campaign && campaign.currentTurn) || 1, atDay: (campaign && campaign.currentDayInMonth) || 1, type, summary });
  }

  // ── scale ───────────────────────────────────────────────────────────────────
  function _scaleRow(scale){
    const rows = A().ARMY_ORG_SCALE || [];
    return rows.find(r => r.scale === scale) || rows.find(r => r.scale === 'company') || null;
  }
  // BR at the battle's scale: a full unit OF that scale reads its printed company BR
  // (RR p.462 "use the BRs at the standard value"); per-creature values scale by the
  // inverse org multiplier (platoon ×4, company ×1, battalion ×¼ — JJ p.105 agrees).
  function battleScaleUpFactor(scale){
    const row = _scaleRow(scale);
    return row && row.multiplier ? 1 / row.multiplier : 1;
  }
  function scaleInfantryPerUnit(scale){
    const row = _scaleRow(scale);
    return (row && row.troopsPerUnitInfantry) || 120;
  }

  // ── missile / loose classification (RR p.462) ───────────────────────────────
  const _MISSILE_KIT = /arbalest|crossbow|composite bow|long ?bow|short ?bow|staff[- ]sling|sling/i;
  const _CAV_LOOSE_KIT = /crossbow|composite bow|short ?bow/i;
  function _kitCount(eq, word){
    const m = new RegExp('(\\d+)\\s*' + word, 'i').exec(eq || '');
    return m ? parseInt(m[1], 10) : 0;
  }
  // troopRowMissileLoose(row) → {missile, loose}. Missile: the RR missile-weapon kit.
  // Loose: human/demi-human light infantry with a missile kit or 3+ javelins / 5+ darts;
  // human/demi-human light cavalry or horse archers with crossbow/composite/short bow
  // or 3+ javelins. (Beastman troops are never loose — RAW says human or demi-human.)
  function troopRowMissileLoose(row){
    if(!row) return { missile: false, loose: false };
    const eq = row.equipment || '';
    const missile = _MISSILE_KIT.test(eq);
    const demi = row.race === 'man' || row.race === 'dwarf' || row.race === 'elf';
    let loose = false;
    if(demi){
      if(row.typeKey === 'light-infantry' &&
         (missile || _kitCount(eq, 'javelins?') >= 3 || _kitCount(eq, 'darts?') >= 5)) loose = true;
      if((row.typeKey === 'light-cavalry' || row.typeKey === 'horse-archers') &&
         (_CAV_LOOSE_KIT.test(eq) || _kitCount(eq, 'javelins?') >= 3)) loose = true;
    }
    return { missile, loose };
  }

  // ── battle-unit builders ────────────────────────────────────────────────────
  // The working record one fielded unit carries through a battle. br is expressed at
  // the BATTLE's scale; creatures = the actual heads behind it (casualty math reads it).
  function _troopCreatureXp(row){
    const Ax = A();
    if(!row) return 5;
    if(row.race === 'man') return 5;   // 0th-level human troops (RR p.471 worked example)
    const m = typeof Ax.findMonster === 'function' ? Ax.findMonster(row.race) : null;
    return (m && typeof m.xp === 'number') ? m.xp : 5;
  }
  function _battleUnitFromUnit(campaign, unit, scale){
    const Ax = A();
    const row = typeof Ax.unitTroopRow === 'function' ? Ax.unitTroopRow(unit) : null;
    const ml = troopRowMissileLoose(row);
    const creatures = Ax.unitActiveCount(unit);
    const companyBr = Ax.unitBattleRating(campaign, unit);
    const wagePer = typeof Ax.unitWagePerSoldier === 'function' ? (Ax.unitWagePerSoldier(campaign, unit) || 0) : 0;
    return {
      key: _buKey(),
      label: unit.displayName || (row ? row.label : 'Unit'),
      sourceKind: 'unit', sourceId: unit.id,
      divisionRole: null, divisionCommanderCharacterId: null,
      creatures,
      br: _halfBr(companyBr * battleScaleUpFactor(scale)),
      morale: typeof Ax.unitMoraleScore === 'function' ? (Ax.unitMoraleScore(campaign, unit) || 0) : 0,
      missile: ml.missile, loose: ml.loose,
      elite: !!unit.elite,                       // RR p.434 — +1 attack throws behind the elite-troops rule
      category: (row && row.category) || 'infantry',
      typeKey: unit.unitTypeKey || null,
      zone: 'undeployed', status: 'active',
      disordered: false, wavering: false, ralliedForTurn: null,
      fledUnrallied: false, withdrawnLoose: false, eliminatedByPursuit: false,
      officerCharacterId: null,
      wageMonthlyGp: Math.round(wagePer * creatures),
      xpValue: creatures * _troopCreatureXp(row)
    };
  }
  // Chunk a Group into battle-units: JJ pp.104–106 platoons of 30 men / 15 large at
  // platoon scale (the JJ_MASS_COMBAT row's platoonSize when priced), scaled up for
  // larger battle scales. A full platoon at platoon scale carries the PRINTED platoon
  // BR; partials and other scales compute from the MM per-creature battleRating.
  function _battleUnitsFromGroup(campaign, group, scale){
    const Ax = A();
    const key = group && group.groupTemplate && group.groupTemplate.monsterCatalogKey;
    const m = key && typeof Ax.findMonster === 'function' ? Ax.findMonster(key) : null;
    const jj = key && typeof Ax.massCombatRow === 'function' ? Ax.massCombatRow(key) : null;
    const active = Ax.groupActiveCount(group);
    if(active <= 0) return [];
    const baseSize = (jj && jj.platoonSize) || 30;
    const perUnit = Math.max(1, Math.round(baseSize * (scaleInfantryPerUnit(scale) / 30)));
    const brPer = (m && typeof m.battleRating === 'number') ? m.battleRating : 0;
    const aerial = !!(jj && Array.isArray(jj.tags) && jj.tags.some(t => /aerial/i.test(String(t))));
    const label = (m && (m.label || m.name)) || group.name || key || 'Monsters';
    const out = [];
    let left = active, idx = 0;
    while(left > 0){
      idx++;
      const c = Math.min(perUnit, left);
      left -= c;
      let br;
      if(jj && scale === 'platoon' && c === baseSize && typeof jj.platoonBr === 'number') br = jj.platoonBr;
      else br = _halfBr(c * brPer * battleScaleUpFactor(scale));
      out.push({
        key: _buKey(),
        label: label + (active > perUnit ? ' ' + idx : ''),
        sourceKind: 'group', sourceId: group.id,
        divisionRole: null, divisionCommanderCharacterId: null,
        creatures: c, br,
        morale: (m && typeof m.morale === 'number') ? m.morale : 0,
        missile: false, loose: false,           // 🔧 the JJ tables carry no missile flag — GM tick
        elite: false,
        category: aerial ? 'flyer' : 'monster',
        typeKey: key || null,
        zone: 'undeployed', status: 'active',
        disordered: false, wavering: false, ralliedForTurn: null,
        fledUnrallied: false, withdrawnLoose: false, eliminatedByPursuit: false,
        officerCharacterId: null,
        wageMonthlyGp: 0,                       // monster spoils = the band's treasure, not wages
        xpValue: c * ((m && typeof m.xp === 'number') ? m.xp : 0)
      });
    }
    return out;
  }

  // ── heroes (RR p.466) ───────────────────────────────────────────────────────
  function _hdLeadOf(ch){
    if(!ch) return 0;
    if(typeof ch.hitDice === 'string'){ const n = parseInt(ch.hitDice, 10); if(!isNaN(n)) return n; }
    if(typeof ch.hitDice === 'number') return ch.hitDice;
    return ch.level || 0;
  }
  function _isMonsterCharacter(ch){
    if(!ch) return false;
    // the W1 officer convention: a monster leader has no numeric ability scores —
    // plus the five-axis read: a creature typed outside humanoid/person is a monster
    // (ordinary characters default creatureTypes ['humanoid'])
    if(!(ch.abilities && typeof ch.abilities.CHA === 'number')) return true;
    const types = ch.creatureTypes || [];
    return types.length > 0 && !types.includes('humanoid') && !types.includes('person');
  }
  // qualifiesAsBattleHero(campaign, ch, scale) → {qualifies, reason}. PC always; monster
  // 9+ HD; NPC 6th+; a QUALIFYING hero's henchman 4th+ — thresholds shift −2 at platoon,
  // +2 battalion, +4 brigade. The Judge's special-ability override is the GM's call.
  function qualifiesAsBattleHero(campaign, ch, scale, _seen){
    if(!ch) return { qualifies: false, reason: 'no character' };
    const Ax = A();
    const shift = ((Ax.HERO_QUALIFICATION || {}).scaleShift || {})[scale] || 0;
    const q = Ax.HERO_QUALIFICATION || { monsterHd: 9, npcLevel: 6, henchmanLevel: 4 };
    const isPC = typeof Ax.isPlayerControlled === 'function' ? Ax.isPlayerControlled(ch) : ch.controlledBy === 'player';
    if(isPC) return { qualifies: true, reason: 'player character' };
    if(_isMonsterCharacter(ch)){
      const need = q.monsterHd + shift;
      return _hdLeadOf(ch) >= need
        ? { qualifies: true, reason: 'monster of ' + need + '+ HD' }
        : { qualifies: false, reason: 'monster below ' + need + ' HD' };
    }
    const lvl = ch.level || 0;
    if(lvl >= q.npcLevel + shift) return { qualifies: true, reason: 'NPC of level ' + (q.npcLevel + shift) + '+' };
    const seen = _seen || new Set();
    if(ch.liegeCharacterId && !seen.has(ch.id)){
      seen.add(ch.id);
      const liege = _char(campaign, ch.liegeCharacterId);
      if(liege && qualifiesAsBattleHero(campaign, liege, scale, seen).qualifies && lvl >= q.henchmanLevel + shift){
        return { qualifies: true, reason: 'henchman (level ' + (q.henchmanLevel + shift) + '+) of a qualifying hero' };
      }
    }
    return { qualifies: false, reason: 'below the hero thresholds at this scale' };
  }
  // Hero-as-unit BR (RR p.466): N × (AC+1) × HD × (HD+1) × (1 + specials) /
  // (8 × infantry per regular unit at the battle's scale), rounded to the nearest 0.5.
  // Classed characters count 1 special ability (2 if an arcane caster); magic items add more.
  function heroBattleUnitBr(campaign, ch, opts){
    const o = opts || {};
    const scale = o.scale || 'company';
    const hd = Math.max(1, _hdLeadOf(ch));
    const acVal = (ch && typeof ch.ac === 'number') ? ch.ac : 0;
    const specials = (o.specialAbilities != null) ? o.specialAbilities
      : (1 + (o.arcaneCaster ? 1 : 0));
    const raw = (1 * (acVal + 1) * hd * (hd + 1) * (1 + specials)) / (8 * scaleInfantryPerUnit(scale));
    return _halfBr(raw);
  }
  function addHeroToBattle(campaign, battleId, sideKey, opts){
    const battle = findBattle(campaign, battleId);
    if(!battle || battle.status === 'ended' || battle.status === 'resolved') return null;
    const o = opts || {};
    const ch = _char(campaign, o.characterId);
    if(!ch) return null;
    const side = battle.sides[sideKey];
    if(!side) return null;
    const br = heroBattleUnitBr(campaign, ch, { scale: battle.scale, specialAbilities: o.specialAbilities, arcaneCaster: o.arcaneCaster });
    const Ax = A();
    const bu = {
      key: _buKey(),
      label: ch.name || 'Hero',
      sourceKind: 'hero', sourceId: ch.id,
      divisionRole: null, divisionCommanderCharacterId: null,
      creatures: 1, br,
      morale: typeof Ax.officerMoraleModifier === 'function' ? (Ax.officerMoraleModifier(ch) || 0) : 0,
      missile: !!o.missile, loose: false, elite: false,
      category: 'hero', typeKey: null,
      zone: o.zone || 'reserve', status: 'active',
      disordered: false, wavering: false, ralliedForTurn: null,
      fledUnrallied: false, withdrawnLoose: false, eliminatedByPursuit: false,
      officerCharacterId: ch.id,                // a hero IS his own officer for casualty purposes
      wageMonthlyGp: 0, xpValue: 0
    };
    side.units.push(bu);
    if(battle.status === 'fighting'){ side.startingUnitCount++; side.breakPoint = Math.ceil(side.startingUnitCount / 3); side.startingBr += br; }
    _battleHistory(campaign, battle, 'hero', (ch.name || 'A hero') + ' joins ' + (side.label || sideKey) + ' (BR ' + br + ')');
    return bu;
  }

  // ── side builders ───────────────────────────────────────────────────────────
  function _captainOrRuler(domain){
    if(!domain) return null;
    const mag = domain.magistrates && domain.magistrates['captain-of-the-guard'];
    return (mag && mag.characterId) || domain.rulerCharacterId || null;
  }
  // RR p.463 — a commander of great strategic ability increases the BR of the units in
  // his division: +0.5 each at SA ≥ +3, +1.0 at SA ≥ +5 (the printed example: 4 longbow
  // units under a +3 captain total (4) × (3 + 0.5) = 14). Applied per battle-unit from
  // its division commander, falling back to the side leader.
  function _applySaBrBonus(campaign, side){
    const Ax = A();
    if(typeof Ax.strategicAbility !== 'function') return;
    const saOf = {};
    const saFor = (charId) => {
      if(!charId) return 0;
      if(!(charId in saOf)){
        const ch = _char(campaign, charId);
        saOf[charId] = ch ? Ax.strategicAbility(ch) : 0;
      }
      return saOf[charId];
    };
    for(const u of side.units){
      if(u.sourceKind === 'hero') continue;
      const sa = saFor(u.divisionCommanderCharacterId || side.leaderCharacterId);
      if(sa >= 5) u.br = _halfBr(u.br + 1.0);
      else if(sa >= 3) u.br = _halfBr(u.br + 0.5);
    }
  }
  // buildBattleSide(campaign, spec, scale) — spec: {kind: 'army'|'garrison'|'groups',
  // armyId | domainId | groupIds, stance, label?}. Returns a blankBattleSide-shaped
  // object with the roster built, leaders/commanders derived, division roles stamped.
  function buildBattleSide(campaign, spec, scale){
    const Ax = A();
    const side = Ax.blankBattleSide({ kind: spec.kind || 'adhoc', stance: spec.stance || 'defensive' });
    if(spec.kind === 'army'){
      const army = (campaign.armies || []).find(x => x && x.id === spec.armyId) || null;
      if(!army) return null;
      side.armyId = army.id;
      side.label = spec.label || army.name || 'Army';
      side.leaderCharacterId = army.leaderCharacterId || null;
      const commanders = [];
      if(army.leaderCharacterId) commanders.push({ characterId: army.leaderCharacterId, zones: [] });
      const divByUnit = {};
      for(const dv of (army.divisions || [])){
        if(dv && dv.commanderCharacterId && !commanders.some(c => c.characterId === dv.commanderCharacterId)){
          commanders.push({ characterId: dv.commanderCharacterId, zones: [] });
        }
        for(const uid of ((dv && dv.unitIds) || [])) divByUnit[uid] = dv;
      }
      side.commanders = commanders;
      for(const u of Ax.armyUnits(campaign, army)){
        const bu = _battleUnitFromUnit(campaign, u, scale);
        const dv = divByUnit[u.id];
        if(dv){ bu.divisionRole = dv.role || 'main'; bu.divisionCommanderCharacterId = dv.commanderCharacterId || null; }
        side.units.push(bu);
      }
    } else if(spec.kind === 'garrison'){
      const domain = (campaign.domains || []).find(d => d && d.id === spec.domainId) || null;
      if(!domain) return null;
      side.domainId = domain.id;
      side.label = spec.label || ((domain.name || 'Domain') + ' garrison');
      side.leaderCharacterId = _captainOrRuler(domain);
      if(side.leaderCharacterId) side.commanders = [{ characterId: side.leaderCharacterId, zones: [] }];
      for(const u of Ax.unitsStationedAt(campaign, { kind: 'domain-garrison', id: domain.id })){
        side.units.push(_battleUnitFromUnit(campaign, u, scale));
      }
    } else if(spec.kind === 'groups'){
      const ids = spec.groupIds || [];
      const groups = ids.map(id => (campaign.groups || []).find(g => g && g.id === id)).filter(Boolean);
      if(!groups.length) return null;
      side.groupIds = groups.map(g => g.id);
      side.label = spec.label || groups.map(g => g.name || (g.groupTemplate && g.groupTemplate.monsterCatalogKey) || 'band').join(' + ');
      side.leaderCharacterId = groups.map(g => g.commanderCharacterId).find(Boolean) || null;
      if(side.leaderCharacterId) side.commanders = [{ characterId: side.leaderCharacterId, zones: [] }];
      for(const g of groups){
        for(const bu of _battleUnitsFromGroup(campaign, g, scale)) side.units.push(bu);
      }
    }
    _applySaBrBonus(campaign, side);
    return side;
  }

  // ── creation + deployment ───────────────────────────────────────────────────
  // createBattle(campaign, spec): spec = { name?, hexId, scale?, awareness, sideA, sideB,
  // options? } where sideA/sideB are buildBattleSide specs (+ stance). The strategic
  // situation derives from awareness × stances (RR pp.461–462); 'no-battle' returns
  // {noBattle:true}. The battle lands in 'setup' (editable); beginBattle locks it.
  function createBattle(campaign, spec){
    const Ax = A();
    if(!campaign || !spec) return null;
    if(!Array.isArray(campaign.battles)) campaign.battles = [];
    const scale = spec.scale || 'company';
    const sit = Ax.resolveStrategicSituation(spec.awareness || 'mutual',
      (spec.sideA && spec.sideA.stance) || 'defensive', (spec.sideB && spec.sideB.stance) || 'defensive');
    if(!sit.battle) return { noBattle: true, situation: sit };
    const a = buildBattleSide(campaign, spec.sideA, scale);
    const b = buildBattleSide(campaign, spec.sideB, scale);
    if(!a || !b) return null;
    const battle = Ax.blankBattle({
      id: spec.id,
      name: spec.name || (a.label + ' vs ' + b.label),
      hexId: spec.hexId || null,
      scale,
      awareness: spec.awareness || 'mutual',
      situation: sit.situation,
      attackerSide: spec.attackerSide || sit.attackerDefault || 'a',
      surprisedSide: sit.surprisedSide,
      sides: { a, b },
      createdAtTurn: campaign.currentTurn || 1,
      createdOnDay: campaign.currentDayInMonth || 1
    });
    if(spec.options) Object.assign(battle.options, spec.options);
    // The situation's deployment roles + denied zones (vanguard/rear-guard restrictions
    // bind only sides with division roles to read — a garrison/band has no vanguard).
    for(const sk of ['a', 'b']){
      const side = battle.sides[sk];
      side.deployRestriction = sit.deploy[sk] || 'all';
      side.zonesDenied = sit.zonesDenied[sk] || [];
      if(side.deployRestriction !== 'all' && !side.units.some(u => u.divisionRole)){
        side.deployRestriction = 'all';   // no division structure to restrict by
      }
    }
    campaign.battles.push(battle);
    autoDeployBattle(campaign, battle.id);
    _battleHistory(campaign, battle, 'created', sit.label + ' at ' + (battle.hexId || 'an unmapped field') + ' — ' + a.label + ' vs ' + b.label);
    return battle;
  }

  const BATTLE_ZONES = ['left', 'center', 'right'];
  function _zoneCaps(campaign, side){
    // Per-zone unit cap = the zone commander's leadership ability (+ subordinates'),
    // RR p.463. A commanderless side (a monster band) deploys uncapped — 🔧 flagged.
    const Ax = A();
    const caps = { left: Infinity, center: Infinity, right: Infinity };
    const cmds = (side.commanders || []).filter(c => c && c.characterId);
    if(!cmds.length) return { caps, uncapped: true };
    // auto-assign zones round-robin when unassigned
    const unassigned = cmds.filter(c => !c.zones || !c.zones.length);
    if(unassigned.length === cmds.length){
      if(cmds.length === 1) cmds[0].zones = ['left', 'center', 'right'];
      else if(cmds.length === 2){ cmds[0].zones = ['center', 'right']; cmds[1].zones = ['left']; }
      else cmds.forEach((c, i) => { c.zones = i < 3 ? [BATTLE_ZONES[i]] : []; });
      // a 4th+ commander becomes a subordinate of the center
      cmds.slice(3).forEach(c => { c.zones = ['center']; });
    }
    for(const z of BATTLE_ZONES){
      let la = 0, any = false;
      for(const c of cmds){
        if((c.zones || []).includes(z)){
          const ch = _char(campaign, c.characterId);
          if(ch && typeof Ax.leadershipAbility === 'function'){ la += Ax.leadershipAbility(ch); any = true; }
        }
      }
      caps[z] = any ? la : 0;
    }
    return { caps, uncapped: false };
  }
  // Auto-deploy a battle's sides: eligible units (the situation's vanguard/rear-guard
  // role filter) dealt across allowed zones highest-BR-first under the LA caps;
  // overflow → reserve; ineligible units stay undeployed (reinforcements, RR p.465).
  function autoDeployBattle(campaign, battleId){
    const battle = findBattle(campaign, battleId);
    if(!battle || battle.status !== 'setup') return battle;
    for(const sk of ['a', 'b']){
      const side = battle.sides[sk];
      const allowed = BATTLE_ZONES.filter(z => !(side.zonesDenied || []).includes(z));
      const zc = _zoneCaps(campaign, side);
      const counts = { left: 0, center: 0, right: 0 };
      const eligible = [], held = [];
      for(const u of side.units){
        if(u.sourceKind === 'hero'){ u.zone = u.zone === 'undeployed' ? 'reserve' : u.zone; continue; } // heroes deploy anywhere, no cap
        const ok = side.deployRestriction === 'all' || u.divisionRole === side.deployRestriction;
        (ok ? eligible : held).push(u);
      }
      held.forEach(u => { u.zone = 'undeployed'; });
      const order = eligible.slice().sort((x, y) => y.br - x.br);
      let zi = 0;
      for(const u of order){
        let placed = false;
        for(let t = 0; t < allowed.length; t++){
          const z = allowed[(zi + t) % allowed.length];
          if(counts[z] < zc.caps[z]){ u.zone = z; counts[z]++; zi = (zi + t + 1) % allowed.length; placed = true; break; }
        }
        if(!placed) u.zone = 'reserve';
      }
    }
    return battle;
  }
  // Lock the setup and start fighting: stamps starting counts / break points / starting
  // BR, applies the army-size-asymmetry deployment cap (RR p.464), emits battle-started.
  function beginBattle(campaign, battleId){
    const battle = findBattle(campaign, battleId);
    if(!battle || battle.status !== 'setup') return battle;
    if(battle.options && battle.options.armySizeAsymmetry){
      const atk = battle.sides[battle.attackerSide];
      const def = battle.sides[battle.attackerSide === 'a' ? 'b' : 'a'];
      if(atk.units.length < def.units.length){
        const atkDeployed = atk.units.filter(u => u.zone !== 'undeployed').length;
        const defDeployed = def.units.filter(u => u.zone !== 'undeployed').sort((x, y) => y.br - x.br);
        defDeployed.slice(atkDeployed).forEach(u => { u.zone = 'undeployed'; });
      }
    }
    for(const sk of ['a', 'b']){
      const side = battle.sides[sk];
      side.startingUnitCount = side.units.length;
      side.breakPoint = Math.ceil(side.startingUnitCount / 3);
      side.startingBr = Math.round(side.units.reduce((s, u) => s + (u.br || 0), 0) * 100) / 100;
    }
    battle.status = 'fighting';
    _battleHistory(campaign, battle, 'began', 'The battle is joined — ' + battle.sides.a.label + ' (' + battle.sides.a.startingUnitCount + ' units) vs ' + battle.sides.b.label + ' (' + battle.sides.b.startingUnitCount + ' units)');
    _emitBattleEvent(campaign, battle, 'battle-started', {
      battleId: battle.id, hexId: battle.hexId, name: battle.name,
      situation: battle.situation, scale: battle.scale,
      sideA: { label: battle.sides.a.label, units: battle.sides.a.startingUnitCount, br: battle.sides.a.startingBr },
      sideB: { label: battle.sides.b.label, units: battle.sides.b.startingUnitCount, br: battle.sides.b.startingBr },
      narrative: battle.name + ' begins at ' + (battle.hexId || 'the field') + ' — ' + (A().STRATEGIC_SITUATIONS[battle.situation] || {}).label + '.'
    }, { hidden: false, turnNumber: 0 });
    return battle;
  }

  // ── derived side reads ──────────────────────────────────────────────────────
  function _lostCount(side){ return side.units.filter(u => u.status === 'destroyed' || u.status === 'routed').length; }
  function _activeUnits(side){ return side.units.filter(u => u.status === 'active'); }
  function _zoneActive(side, zone){ return side.units.filter(u => u.status === 'active' && u.zone === zone); }
  function _disorderedCount(side){ return side.units.filter(u => u.status === 'active' && u.disordered).length; }
  function _sideDefeated(side){ return side.units.length > 0 && side.units.every(u => u.status !== 'active'); }
  function battleSideSummary(battle, sideKey){
    const side = battle.sides[sideKey];
    return {
      label: side.label, active: _activeUnits(side).length, lost: _lostCount(side),
      disordered: _disorderedCount(side), breakPoint: side.breakPoint,
      starting: side.startingUnitCount, withdrawn: side.withdrawn,
      br: Math.round(_activeUnits(side).reduce((s, u) => s + u.br, 0) * 100) / 100
    };
  }

  // ── the battle turn (RR pp.464–465) ─────────────────────────────────────────
  const _ZONE_PAIRS = [ { a: 'right', b: 'left' }, { a: 'center', b: 'center' }, { a: 'left', b: 'right' } ];
  // Returns {total, elite} — the zone's attacking BR pool for the phase, with the elite
  // units' share broken out (RR p.434: elite troops attack at +1, behind `elite-troops`).
  function _attackPoolBr(side, zone, phaseKind, turnNumber){
    let s = 0, e = 0;
    for(const u of side.units){
      if(u.status !== 'active' || u.zone !== zone) continue;
      if(phaseKind === 'missile' ? !u.missile : u.missile) continue;
      let br = u.br;
      if(u.wavering) br = br / 2;
      else if(u.ralliedForTurn === turnNumber) br = br * 1.5;
      s += br;
      if(u.elite) e += br;
    }
    return { total: s, elite: e };
  }
  // Removal allocator for hits (RR p.464): the leader removes units totaling ≥ the hits.
  // Auto policy 🔧: loose units first (they withdraw disordered at ½ BR instead of dying
  // — the RAW example's own preference), then lowest-BR-first chaff.
  function _applyHitsToZone(battle, side, zone, hits, tracker, lines, label){
    if(hits <= 0) return 0;
    let remaining = hits;
    const inReserve = zone === 'reserve';
    const pool = _zoneActive(side, zone).sort((x, y) => ((y.loose && !inReserve) ? 1 : 0) - ((x.loose && !inReserve) ? 1 : 0) || x.br - y.br);
    for(const u of pool){
      if(remaining <= 0) break;
      if(u.loose && !inReserve){
        remaining -= u.br / 2;
        u.zone = 'reserve'; u.disordered = true; u.withdrawnLoose = true;
        tracker.disorderedThisTurn++;
        lines.push('    ' + label + ' — ' + u.label + ' withdraws disordered to the reserve (loose, soaks ' + (u.br / 2) + ' BR)');
      } else {
        remaining -= u.br;
        u.status = 'destroyed';
        tracker.destroyedThisTurn++;
        lines.push('    ' + label + ' — ' + u.label + ' is destroyed (BR ' + u.br + ')');
      }
    }
    return Math.max(0, remaining);
  }
  function _removeBrFromZone(battle, side, zone, br, lines, why){
    // Foray losses (RR p.466): plain unit removal totaling ≥ the BR lost — no loose
    // withdrawal (the foray already killed them). Lowest-BR-first.
    let remaining = br;
    const pool = _zoneActive(side, zone).sort((x, y) => x.br - y.br);
    for(const u of pool){
      if(remaining <= 0) break;
      remaining -= u.br;
      u.status = 'destroyed';
      lines.push('    ' + why + ' — ' + u.label + ' is lost (BR ' + u.br + ')');
    }
    return Math.max(0, remaining);
  }
  function _ownBrokenAdjacent(side, zone){
    const adj = { left: ['center'], center: ['left', 'right'], right: ['center'] };
    return (adj[zone] || []).some(z => _zoneActive(side, z).length === 0);
  }
  function _armyMoraleMod(campaign, battle, sideKey){
    const Ax = A();
    const side = battle.sides[sideKey];
    const other = battle.sides[sideKey === 'a' ? 'b' : 'a'];
    let m = 0;
    const leader = _char(campaign, side.leaderCharacterId);
    if(leader && typeof Ax.officerMoraleModifier === 'function') m += Math.ceil(Ax.officerMoraleModifier(leader) / 2);
    const lost = _lostCount(side), start = side.startingUnitCount || side.units.length || 1;
    if(lost >= (2 / 3) * start) m -= 5;
    else if(lost >= 0.5 * start) m -= 2;
    const otherLost = _lostCount(other);
    if(otherLost > lost) m += 2;
    else if(lost > otherLost) m -= 2;
    const cr = battle.options && battle.options.cannotRetreat;
    if(cr === sideKey || cr === 'both') m += 2;
    return m;
  }
  function _unitMoraleRoll(campaign, battle, sideKey, u, armyMod, rng, lines){
    const Ax = A();
    const side = battle.sides[sideKey];
    let mod = armyMod + (u.morale || 0);
    const officer = _char(campaign, u.officerCharacterId);
    if(officer && typeof Ax.officerMoraleModifier === 'function') mod += Ax.officerMoraleModifier(officer);
    if(u.wavering || u.disordered) mod -= 2;
    if(_ownBrokenAdjacent(side, u.zone)) mod -= 2;
    const roll = _2d6(rng);
    const total = roll + mod;
    const band = Ax.unitMoraleBand(total);
    switch(band.key){
      case 'rout': u.status = 'routed'; break;
      case 'flee': u.zone = 'reserve'; u.disordered = true; u.fledUnrallied = true; break;
      case 'waver': u.wavering = true; break;
      case 'stand-firm': break;
      case 'rally': u.ralliedForTurn = battle.turnNumber + 1; u.wavering = false; u.disordered = false; u.fledUnrallied = false; break;
    }
    lines.push('    ' + u.label + ': 2d6 ' + roll + (mod >= 0 ? ' +' : ' ') + mod + ' = ' + total + ' → ' + band.label);
    return band.key;
  }
  // One battle turn — phases 1–9 (phase 10, withdrawal, is the between-turns GM action).
  // Pending forays declared for this turn must be resolved first. opts.rng injectable.
  function runBattleTurn(campaign, battleId, opts){
    const Ax = A();
    const o = opts || {};
    const rng = o.rng || Math.random;
    const battle = findBattle(campaign, battleId);
    if(!battle || battle.status !== 'fighting') return null;
    const upcoming = battle.turnNumber + 1;
    const pendingForays = (battle.forays || []).filter(f => f.turnNumber === upcoming && f.status === 'pending');
    if(pendingForays.length) throw new Error('runBattleTurn: ' + pendingForays.length + ' declared foray(s) await resolution — resolve or cancel them first');
    // only the latest turn is revertible: drop the previous record's snapshot
    const prevRec = battle.turnLog[battle.turnLog.length - 1];
    if(prevRec && prevRec._pre) delete prevRec._pre;
    const pre = _clone({ sides: battle.sides, turnNumber: battle.turnNumber });
    const t = ++battle.turnNumber;
    const lines = [];
    const trackers = { a: { destroyedThisTurn: 0, disorderedThisTurn: 0 }, b: { destroyedThisTurn: 0, disorderedThisTurn: 0 } };
    let ended = null;
    const surprisedKey = (t === 1) ? battle.surprisedSide : null;

    // RR p.449 — severe weather penalizes MISSILE attack throws (rainy/snowy −2, windy −2,
    // stormy −4): limited visibility / sandstorms hamper everyone's shooting, so it applies to
    // BOTH sides' missile phases (not melee). Resolve the battle's hex weather from the committed
    // cache (incl. a GM-set day); roll on demand only when the weather layer is generating.
    let wxMissileMod = 0, wxMissileLabel = '';
    (function(){
      const hex = _hex(campaign, battle.hexId);
      if(!hex || !hex.coord || typeof Ax.regionKeyForCoord !== 'function' || typeof Ax.weatherWarEffects !== 'function') return;
      const k = Ax.regionKeyForCoord(hex.coord);
      const cache = campaign._weatherByRegion || {};
      let w = (k && cache[k] && cache[k].condition) ? cache[k] : null;
      const gmSet = typeof Ax.isHouseRuleEnabled === 'function' && Ax.isHouseRuleEnabled(campaign, 'gm-set-weather');
      if(!w && !gmSet && typeof Ax.weatherForHex === 'function') w = Ax.weatherForHex(campaign, hex);
      if(!w || !w.condition) return;
      const eff = Ax.weatherWarEffects(w.condition, w.temperatureBand || w.temperature);
      wxMissileMod = eff.missileMod || 0;
      if(wxMissileMod) wxMissileLabel = eff.conditionLabel || w.condition;
    })();
    if(wxMissileMod) lines.push('  Weather: ' + wxMissileLabel + ' \u{2014} ' + wxMissileMod + ' to missile attack throws (RR p.449)');

    for(let zi = 0; zi < _ZONE_PAIRS.length && !ended; zi++){
      const pair = _ZONE_PAIRS[zi];
      for(const phaseKind of ['missile', 'melee']){
        if(ended) break;
        const phaseLabel = ['First', 'Second', 'Third'][zi] + ' Zone ' + (phaseKind === 'missile' ? 'Missile' : 'Melee') + ' Phase';
        const phaseLines = [];
        // (b) heroic forays resolve before the throws; lost units are removed first
        const frs = (battle.forays || []).filter(f => f.turnNumber === t && f.zonePairIndex === zi && f.phaseKind === phaseKind && f.status === 'resolved' && !f.applied);
        for(const f of frs){
          const ours = battle.sides[f.side];
          const theirs = battle.sides[f.side === 'a' ? 'b' : 'a'];
          const ourZone = f.side === 'a' ? pair.a : pair.b;
          const theirZone = f.side === 'a' ? pair.b : pair.a;
          if(f.opposed){
            const lost = (f.outcome && f.outcome.ourBrLost) || 0;
            if(lost > 0) _removeBrFromZone(battle, ours, ourZone, lost, phaseLines, 'foray (heroes vs heroes)');
            phaseLines.push('    ⚔ heroes-vs-heroes foray resolved — ' + ours.label + ' loses ' + lost + ' BR');
          } else {
            const enemyLoss = (f.outcome && f.outcome.allFoesDefeated) ? f.stakedBr : ((f.outcome && f.outcome.theirBrLost) || 0);
            if(enemyLoss > 0) _removeBrFromZone(battle, theirs, theirZone, enemyLoss, phaseLines, 'foray');
            phaseLines.push('    ⚔ heroic foray (' + f.stakedBr + ' BR staked) — ' + theirs.label + ' loses ' + enemyLoss + ' BR' + ((f.outcome && f.outcome.allFoesDefeated) ? ' (every foe defeated)' : ''));
          }
          f.applied = true;
          phaseLines.push('    a lull follows the foray (1 turn — treat the incapacitated, RR p.467)');
        }
        // (a/c) BR pools + broken-zone state at the start of Determine Hits
        const brokenA = _zoneActive(battle.sides.a, pair.a).length === 0;
        const brokenB = _zoneActive(battle.sides.b, pair.b).length === 0;
        const target = Ax.BATTLE_ATTACK_TARGETS[phaseKind];
        const sideThrow = (sk) => {
          const side = battle.sides[sk];
          const myZone = sk === 'a' ? pair.a : pair.b;
          const enemyBroken = sk === 'a' ? brokenB : brokenA;
          if(surprisedKey === sk) return { throws: 0, hits: 0, mod: 0, surprised: true };
          const pool = _attackPoolBr(side, myZone, phaseKind, t);
          let mod = side.gmAttackMod || 0;
          if(phaseKind === 'missile') mod += wxMissileMod;   // RR p.449 — weather missile penalty (both sides)
          if(enemyBroken) mod += 2;
          if(surprisedKey && surprisedKey !== sk) mod += 2;
          const at = battle.options && battle.options.advantageousTerrain;
          if(at && at !== sk) mod -= 2;
          const throws = Math.floor(pool.total);
          // RR p.434 — the elite share of the throws attacks at +1 (behind elite-troops)
          const eliteOn = typeof Ax.isHouseRuleEnabled === 'function' && Ax.isHouseRuleEnabled(campaign, 'elite-troops');
          const eliteThrows = eliteOn ? Math.min(throws, Math.floor(pool.elite)) : 0;
          let hits = 0;
          for(let i = 0; i < throws; i++){
            const m = i < eliteThrows ? mod + 1 : mod;
            if(_d20(rng) + m >= target) hits++;
          }
          return { throws, hits, mod, eliteThrows, pool: pool.total };
        };
        const ra = sideThrow('a'), rb = sideThrow('b');
        if(ra.throws || rb.throws || frs.length){
          phaseLines.unshift('  ' + phaseLabel + ':');
          const throwLine = (side, r) => '    ' + side.label + ': ' + r.throws + ' throw(s) @ ' + target + '+' + (r.mod ? (r.mod > 0 ? ' +' : ' ') + r.mod : '') + (r.eliteThrows ? ' (' + r.eliteThrows + ' elite at +1)' : '') + ' → ' + r.hits + ' hit(s)';
          if(ra.surprised) phaseLines.push('    ' + battle.sides.a.label + ' is surprised — no attack throws this turn');
          else if(ra.throws) phaseLines.push(throwLine(battle.sides.a, ra));
          if(rb.surprised) phaseLines.push('    ' + battle.sides.b.label + ' is surprised — no attack throws this turn');
          else if(rb.throws) phaseLines.push(throwLine(battle.sides.b, rb));
          // (d) casualties simultaneously; hits vs a BROKEN zone spill to adjacent zones
          const applyAgainst = (defKey, hits, zoneBroken) => {
            if(hits <= 0) return;
            const side = battle.sides[defKey];
            const zone = defKey === 'a' ? pair.a : pair.b;
            const tracker = trackers[defKey];
            if(!zoneBroken){
              _applyHitsToZone(battle, side, zone, hits, tracker, phaseLines, side.label);
            } else {
              const spillZones = zone === 'center' ? ['left', 'right', 'reserve'] : ['center'];
              let left = hits;
              phaseLines.push('    ' + side.label + "'s " + zone + ' zone is broken — hits spill to adjacent zones');
              for(const z of spillZones){
                if(left <= 0) break;
                left = _applyHitsToZone(battle, side, z, left, tracker, phaseLines, side.label + ' (' + z + ')');
              }
            }
          };
          applyAgainst('b', ra.hits, brokenB);
          applyAgainst('a', rb.hits, brokenA);
          lines.push(...phaseLines);
        }
        if(_sideDefeated(battle.sides.a)) ended = { winner: 'b', endedBy: 'annihilation' };
        else if(_sideDefeated(battle.sides.b)) ended = { winner: 'a', endedBy: 'annihilation' };
      }
    }

    // Phase 7 — morale (RR pp.467–468)
    if(!ended){
      for(const sk of ['a', 'b']){
        const side = battle.sides[sk];
        const tr = trackers[sk];
        const trigger = (tr.destroyedThisTurn + tr.disorderedThisTurn) >= 1 &&
                        (_lostCount(side) + _disorderedCount(side)) >= side.breakPoint;
        if(!trigger) continue;
        lines.push('  Morale Phase — ' + side.label + ' is past its break point (' + _lostCount(side) + ' lost + ' + _disorderedCount(side) + ' disordered ≥ ' + side.breakPoint + '):');
        for(const u of side.units){
          if(u.status !== 'active') continue;
          const armyMod = _armyMoraleMod(campaign, battle, sk);   // recomputed live — cascades are intended
          _unitMoraleRoll(campaign, battle, sk, u, armyMod, rng, lines);
        }
        if(_sideDefeated(side)) ended = { winner: sk === 'a' ? 'b' : 'a', endedBy: 'rout-collapse' };
      }
    }

    // Phase 8 — redeployment (auto policy 🔧: regroup shaken units up to the leader's
    // LA, then plug empty forward zones from the ready reserve; lower SA acts first)
    if(!ended){
      const order = ['a', 'b'].sort((x, y) => _sideSa(campaign, battle, x) - _sideSa(campaign, battle, y));
      for(const sk of order){
        const side = battle.sides[sk];
        const leader = _char(campaign, side.leaderCharacterId);
        let la = leader && typeof Ax.leadershipAbility === 'function' ? Ax.leadershipAbility(leader) : 4;
        const shaken = side.units.filter(u => u.status === 'active' && (u.disordered || u.wavering));
        for(const u of shaken){
          if(la <= 0) break;
          u.disordered = false; u.wavering = false; u.fledUnrallied = false;
          la--;
          lines.push('  ' + side.label + ' regroups ' + u.label);
        }
        const myZones = sk === 'a' ? { right: 'right', center: 'center', left: 'left' } : null;
        for(const z of BATTLE_ZONES){
          if(la <= 0) break;
          if(_zoneActive(side, z).length > 0) continue;
          if((side.zonesDenied || []).includes(z)) continue;
          const ready = side.units.filter(u => u.status === 'active' && u.zone === 'reserve' && !u.disordered && u.ralliedForTurn !== t + 0)
            .sort((x, y) => y.br - x.br);
          if(ready.length){
            ready[0].zone = z; la--;
            lines.push('  ' + side.label + ' redeploys ' + ready[0].label + ' from the reserve into the ' + z + ' zone');
          }
        }
      }
    }

    // Phase 9 — reinforcements (RR p.465): d20 + SA vs the terrain target deploys one
    // previously-undeployed unit into the reserve. Lower SA chooses/rolls first.
    if(!ended){
      const hex = _hex(campaign, battle.hexId);
      const terr = hex ? (typeof Ax.terrainKey === 'function' ? Ax.terrainKey(hex) : hex.terrain) : null;
      const target = Ax.reinforcementThrowTarget(terr || 'grassland');
      const order = ['a', 'b'].sort((x, y) => _sideSa(campaign, battle, x) - _sideSa(campaign, battle, y));
      for(const sk of order){
        const side = battle.sides[sk];
        const undeployed = side.units.filter(u => u.status === 'active' && u.zone === 'undeployed');
        if(!undeployed.length) continue;
        const sa = _sideSa(campaign, battle, sk);
        const roll = _d20(rng);
        if(roll + sa >= target){
          const u = undeployed.sort((x, y) => y.br - x.br)[0];
          u.zone = 'reserve';
          lines.push('  Reinforcements — ' + side.label + ': d20 ' + roll + (sa ? '+' + sa : '') + ' vs ' + target + '+ → ' + u.label + ' arrives in the reserve');
        } else {
          lines.push('  Reinforcements — ' + side.label + ': d20 ' + roll + (sa ? '+' + sa : '') + ' vs ' + target + '+ → none arrive');
        }
      }
    }

    const rec = { turnNumber: t, lines, _pre: pre };
    battle.turnLog.push(rec);
    const ev = _emitBattleEvent(campaign, battle, 'battle-turn', {
      battleId: battle.id, turnNumber: t, lines,
      narrative: battle.name + ' — battle turn ' + t + '.'
    }, { hidden: true, turnNumber: t });
    rec.eventId = ev ? ev.id : null;
    if(ended) _finalizeBattle(campaign, battle, ended.winner, ended.endedBy);
    return rec;
  }
  function _sideSa(campaign, battle, sideKey){
    const Ax = A();
    const leader = _char(campaign, battle.sides[sideKey].leaderCharacterId);
    return leader && typeof Ax.strategicAbility === 'function' ? Ax.strategicAbility(leader) : 0;
  }
  // Revert the LATEST battle turn (the project's reroll idiom — the latest turn is the
  // current state): restores the pre-turn sides, drops the record + its hidden event,
  // and drops that turn's forays (re-declare if wanted).
  function revertBattleTurn(campaign, battleId){
    const battle = findBattle(campaign, battleId);
    if(!battle || !battle.turnLog.length) return null;
    const rec = battle.turnLog[battle.turnLog.length - 1];
    if(!rec._pre) return null;   // only the latest carries a snapshot
    battle.turnLog.pop();
    battle.sides = rec._pre.sides;
    battle.turnNumber = rec._pre.turnNumber;
    battle.forays = (battle.forays || []).filter(f => f.turnNumber !== rec.turnNumber);
    if(rec.eventId && Array.isArray(campaign.eventLog)){
      const i = campaign.eventLog.findIndex(e => e && e.event && e.event.id === rec.eventId);
      if(i >= 0) campaign.eventLog.splice(i, 1);
    }
    if(battle.status === 'ended' && !battle.aftermath){ battle.status = 'fighting'; battle.result = null; }
    _battleHistory(campaign, battle, 'reverted', 'Battle turn ' + rec.turnNumber + ' reverted');
    return battle;
  }
  // Phase 10 — voluntary withdrawal: the withdrawing side concedes the field (it is the
  // defeated side for aftermath purposes; its units retreat in good order).
  function withdrawBattleSide(campaign, battleId, sideKey){
    const battle = findBattle(campaign, battleId);
    if(!battle || battle.status !== 'fighting') return null;
    battle.sides[sideKey].withdrawn = true;
    _finalizeBattle(campaign, battle, sideKey === 'a' ? 'b' : 'a', 'withdrawal');
    return battle;
  }
  function _finalizeBattle(campaign, battle, winnerKey, endedBy){
    // Fled units never rallied count as routed (RR p.468)
    for(const sk of ['a', 'b']){
      for(const u of battle.sides[sk].units){
        if(u.status === 'active' && u.fledUnrallied){ u.status = 'routed'; }
      }
    }
    battle.result = {
      winner: winnerKey || null,
      loser: winnerKey ? (winnerKey === 'a' ? 'b' : 'a') : null,
      endedBy: endedBy || 'annihilation',
      endedAtTurn: battle.turnNumber
    };
    battle.status = 'ended';
    const w = winnerKey ? battle.sides[winnerKey].label : '(no victor)';
    _battleHistory(campaign, battle, 'ended', 'The battle ends by ' + (endedBy || 'annihilation') + ' after turn ' + battle.turnNumber + ' — ' + w + ' holds the field');
  }

  // ── heroic forays (RR pp.466–467) ───────────────────────────────────────────
  // declareForay: frames the at-table fight for the UPCOMING battle turn — selects the
  // foes (missile phases prefer missile units; partial units shrink BR + creatures
  // proportionately), splits them into 1d4 groups, and rolls each group's battlefield
  // encounter distance off the battle hex's terrain row. The GM resolves the fight
  // under the standard combat rules (max 10 rounds) and enters the outcome.
  function declareForay(campaign, battleId, spec){
    const Ax = A();
    const battle = findBattle(campaign, battleId);
    if(!battle || battle.status !== 'fighting') return null;
    const o = spec || {};
    const rng = o.rng || Math.random;
    const sideKey = o.side === 'b' ? 'b' : 'a';
    const zi = Math.max(0, Math.min(2, o.zonePairIndex || 0));
    const phaseKind = o.phaseKind === 'melee' ? 'melee' : 'missile';
    const heroes = (o.heroes || []).map(h => ({
      characterId: h.characterId,
      stake: Math.max(0, Math.min(3, Math.round((h.stake || 0) * 2) / 2))
    })).filter(h => h.characterId);
    if(!heroes.length) return null;
    const staked = Math.round(heroes.reduce((s, h) => s + h.stake, 0) * 100) / 100;
    const t = battle.turnNumber + 1;
    const enemy = battle.sides[sideKey === 'a' ? 'b' : 'a'];
    const enemyZone = sideKey === 'a' ? _ZONE_PAIRS[zi].b : _ZONE_PAIRS[zi].a;
    // heroes-vs-heroes: an opposing pending foray in the same step turns both opposed
    const opposing = (battle.forays || []).find(f => f.turnNumber === t && f.zonePairIndex === zi && f.phaseKind === phaseKind && f.side !== sideKey && (f.status === 'pending' || f.status === 'resolved'));
    let foes = [], groups = [], note = null;
    if(opposing){
      opposing.opposed = true;
      const highStake = Math.max(staked, opposing.stakedBr);
      note = 'Heroes versus heroes — the highest stake (' + highStake + ' BR) is used; each side is supported by that much BR of allies from its army (RR p.467).';
    } else {
      const pool = _zoneActive(enemy, enemyZone).filter(u => u.sourceKind !== 'hero');
      if(!pool.length) return { error: 'no foes in the opposing ' + enemyZone + ' zone' };
      const preferMissile = phaseKind === 'missile' && pool.some(u => u.missile);
      const ordered = pool.slice().sort((x, y) => (preferMissile ? ((y.missile ? 1 : 0) - (x.missile ? 1 : 0)) : 0) || y.br - x.br);
      let remaining = staked;
      for(const u of ordered){
        if(remaining <= 0.001 || u.br <= 0) break;
        const frac = Math.min(1, remaining / u.br);
        const creatures = Math.max(1, Math.round(u.creatures * frac));
        foes.push({ fromKey: u.key, label: u.label, creatures, br: Math.round(frac * u.br * 100) / 100 });
        remaining -= frac * u.br;
      }
      const totalCreatures = foes.reduce((s, f) => s + f.creatures, 0);
      const hexObj = _hex(campaign, battle.hexId);
      const terr = hexObj ? (typeof Ax.terrainKey === 'function' ? Ax.terrainKey(hexObj) : hexObj.terrain) : 'grassland';
      const nGroups = Math.max(1, Math.min(1 + Math.floor(rng() * 4), totalCreatures));
      const per = Math.floor(totalCreatures / nGroups), extra = totalCreatures % nGroups;
      for(let g = 0; g < nGroups; g++){
        const c = per + (g < extra ? 1 : 0);
        if(c <= 0) continue;
        const spec2 = Ax.battlefieldEncounterSpec(terr, phaseKind);
        groups.push({
          creatures: c,
          distanceFt: Ax.rollBattlefieldDistanceFt(terr, phaseKind, rng),
          diceLabel: spec2 ? spec2.label : null
        });
      }
    }
    const foray = {
      id: 'fry-' + Math.random().toString(36).slice(2, 8),
      turnNumber: t, side: sideKey, zonePairIndex: zi, phaseKind,
      heroes, stakedBr: staked,
      stakeLabel: (Ax.FORAY_STAKES || []).slice().reverse().find(s => s.br <= staked / Math.max(1, heroes.length)),
      foes, groups, opposed: !!opposing, note,
      vagaries: [],
      status: 'pending', outcome: null, applied: false
    };
    // Phase 3 Military W8 — the Vagaries of Battle (JJ pp.116–117): each heroic foray rolls 1d4
    // complications (ambush, fire, fog, monsters drawn to the slaughter, …) when the vagaries-of-
    // battle rule is on. They are GM-resolve guidance shown on the foray card + a vagary-of-battle
    // audit; the foray itself is fought at the table.
    if(typeof Ax.isHouseRuleEnabled === 'function' && Ax.isHouseRuleEnabled(campaign, 'vagaries-of-battle')
       && typeof Ax.rollBattleVagaries === 'function'){
      foray.vagaries = Ax.rollBattleVagaries(campaign, { rng }) || [];
      if(foray.vagaries.length && typeof Ax.newEvent === 'function'){
        try {
          const names = foray.vagaries.map(v => v.name).join(', ');
          const narrative = 'Vagaries of Battle (' + foray.vagaries.length + '): ' + names;
          const ev = Ax.newEvent('vagary-of-battle', {
            submittedBy: 'engine',
            status: (Ax.EVENT_STATUS && Ax.EVENT_STATUS.APPLIED) || 'applied',
            cadence: 'battle-turn',
            targetTurn: campaign.currentTurn || 1,
            subdayContext: { cadence: 'battle-turn', battleId: battle.id, turnNumber: t },
            payload: { battleId: battle.id, forayId: foray.id, count: foray.vagaries.length, vagaries: foray.vagaries, narrative }
          });
          if(typeof Ax.setEventContext === 'function'){
            Ax.setEventContext(ev, {
              primaryHexId: battle.hexId || null,
              relatedEntities: heroes.map(h => ({ kind: 'character', id: h.characterId, role: 'subject' }))
            });
          }
          ev.appliedAtTurn = campaign.currentTurn || 1;
          if(!Array.isArray(campaign.eventLog)) campaign.eventLog = [];
          campaign.eventLog.push({ event: ev, result: { narrativeSummary: narrative }, appliedAtTurn: ev.appliedAtTurn, appliedAt: new Date().toISOString() });
        } catch(e){ /* never let a battle-vagary emit break the foray */ }
      }
    }
    battle.forays.push(foray);
    return foray;
  }
  // resolveForay outcome: non-opposed → {allFoesDefeated} or {theirBrLost} (what the foes
  // actually lost); opposed → {ourBrLost} per record (RR p.467 — each side loses the BR
  // its own side lost). heroesIncapacitated ride into the aftermath's officer list.
  function resolveForay(campaign, battleId, forayId, outcome){
    const battle = findBattle(campaign, battleId);
    if(!battle) return null;
    const f = (battle.forays || []).find(x => x && x.id === forayId);
    if(!f || f.status !== 'pending') return null;
    f.outcome = {
      allFoesDefeated: !!(outcome && outcome.allFoesDefeated),
      theirBrLost: Math.max(0, (outcome && outcome.theirBrLost) || 0),
      ourBrLost: Math.max(0, (outcome && outcome.ourBrLost) || 0),
      heroesIncapacitated: (outcome && outcome.heroesIncapacitated) || []
    };
    f.status = 'resolved';
    return f;
  }
  function cancelForay(campaign, battleId, forayId){
    const battle = findBattle(campaign, battleId);
    if(!battle) return null;
    const i = (battle.forays || []).findIndex(x => x && x.id === forayId && x.status === 'pending');
    if(i < 0) return null;
    battle.forays.splice(i, 1);
    return true;
  }

  // ── aftermath (RR pp.469–472) ───────────────────────────────────────────────
  function _pursuitTargetFor(bu){
    if(bu.category === 'flyer' || bu.typeKey === 'light-cavalry') return 11;
    if(bu.category === 'cavalry') return 14;
    if(bu.typeKey === 'light-infantry') return 14;
    return 18;
  }
  function _isCavOrFlyer(bu){ return bu.category === 'cavalry' || bu.category === 'flyer'; }
  // computeBattleAftermath — the pure proposal (stored on battle.aftermath; idempotent
  // across panel reopens — recompute only by explicit re-call). Pursuit throws roll here.
  function computeBattleAftermath(campaign, battleId, opts){
    const battle = findBattle(campaign, battleId);
    if(!battle || battle.status !== 'ended' || !battle.result || !battle.result.winner) return null;
    const o = opts || {};
    const rng = o.rng || Math.random;
    const W = battle.sides[battle.result.winner], L = battle.sides[battle.result.loser];
    const lines = [];

    // Retreat (RR p.469)
    const hexObj = _hex(campaign, battle.hexId);
    const hasStronghold = !!(hexObj && ((hexObj.settlement) || (hexObj.primaryStructure)));
    let retreatNote = L.label + ' retreats one 6-mile hex along its line of supply (GM places the survivors).';
    if(hasStronghold) retreatNote += ' A friendly stronghold/settlement stands in this hex — it may retreat inside instead (a siege follows, W6).';
    retreatNote += ' Armies that fought move no further today.';
    lines.push('🏳 ' + retreatNote);

    // Pursuit (RR pp.469–470)
    const loserCavGone = !L.units.some(u => _isCavOrFlyer(u) && u.status === 'active');
    const eligible = W.units.filter(u => u.status === 'active' && !u.disordered && (loserCavGone || _isCavOrFlyer(u)));
    const evadingPenalty = (A().STRATEGIC_SITUATIONS[battle.situation] || {}).evading && L.stance === 'evasive'
      ? -battle.turnNumber : 0;
    const pursuit = [];
    let pool = L.units.filter(u => u.status !== 'destroyed' && !u.eliminatedByPursuit);
    for(const p of eligible){
      if(!pool.length) break;
      const target = _pursuitTargetFor(p);
      const mod = (loserCavGone ? 4 : 0) + evadingPenalty;
      const roll = _d20(rng);
      const success = roll === 20 || (roll + mod) >= target;
      const entry = { pursuer: p.label, target, roll, mod, success, eliminated: null };
      if(success){
        // the victor picks when the loser's cavalry is gone (highest value), else the
        // loser's general sacrifices his cheapest (RR p.470 + the worked example)
        pool.sort((x, y) => loserCavGone ? y.br - x.br : x.br - y.br);
        const victim = pool.shift();
        victim.eliminatedByPursuit = true;
        if(victim.status !== 'routed') victim.status = 'destroyed'; // pursued down
        entry.eliminated = victim.label;
      }
      pursuit.push(entry);
    }
    if(eligible.length) lines.push('🐎 Pursuit: ' + pursuit.filter(p => p.success).length + ' of ' + pursuit.length + ' throw(s) succeed' + (loserCavGone ? ' (+4 — the defeated army has no cavalry or flyers left)' : '') + (evadingPenalty ? ' (' + evadingPenalty + ' vs the evading army)' : ''));
    else lines.push('🐎 No units are eligible to pursue.');

    // Casualties (RR p.470)
    const casualties = [];
    let prisoners = 0;
    for(const sk of ['a', 'b']){
      const side = battle.sides[sk];
      const isVictor = sk === battle.result.winner;
      for(const u of side.units){
        const c = u.creatures || 0;
        if(c <= 0) continue;
        let entry = null;
        if(u.status === 'destroyed' || u.eliminatedByPursuit){
          const dead = Math.ceil(c / 2), wounded = c - dead;
          if(isVictor) entry = { dead, wounded, returning: wounded, prisoners: 0, deserted: 0, loss: dead };
          else { entry = { dead, wounded, returning: 0, prisoners: wounded, deserted: 0, loss: c }; prisoners += wounded; }
        } else if(u.status === 'routed'){
          const dead = Math.ceil(c * 0.25), wounded = Math.ceil(c * 0.25);
          if(isVictor){
            const deserted = Math.ceil(wounded / 2);
            entry = { dead, wounded, returning: wounded - deserted, prisoners: 0, deserted, loss: dead + deserted };
          } else {
            const captured = Math.ceil(wounded / 2);
            entry = { dead, wounded, returning: 0, prisoners: captured, deserted: wounded - captured, loss: dead + wounded };
            prisoners += captured;
          }
        }
        if(entry){
          casualties.push(Object.assign({
            side: sk, unitKey: u.key, label: u.label, sourceKind: u.sourceKind, sourceId: u.sourceId,
            status: u.eliminatedByPursuit ? 'destroyed (pursuit)' : u.status, creatures: c
          }, entry));
        }
      }
    }
    const victorLossLine = casualties.filter(x => x.side === battle.result.winner).reduce((s, x) => s + x.loss, 0);
    const loserLossLine = casualties.filter(x => x.side === battle.result.loser).reduce((s, x) => s + x.loss, 0);
    lines.push('⚰ Casualties: ' + W.label + ' loses ' + victorLossLine + ' troops; ' + L.label + ' loses ' + loserLossLine + ' (the victor\'s lightly wounded return in a week; ' + prisoners + ' prisoner(s) taken). Half-strength units may be consolidated (Split/Merge).');

    // ── Bandit-army outcome (RR p.351) — defeating a morale-banditry band heals the domain.
    // Per domain whose banditry band(s) (group.banditryDomainId) were defeated on the LOSER
    // side: the victory raises CURRENT morale by 1 (the Anárion example −3→−2); the bandits
    // KILLED are the domain's own men, so the population falls by the slain; the CAPTURED are
    // freed to return to work (no family loss — peasantFamilies already counts them; if morale
    // stays below −1 the monthly re-derive re-musters them). Freed peasants aren't ransomed, so
    // their captives are excluded from the prisoner spoils. The world-write is applied in
    // applyBattleAftermath; here we compute the proposal + the summary lines.
    const _moraleClamp = (m) => Math.max(-4, Math.min(4, m));
    const _banditByDomain = {};
    let banditCaptured = 0;
    if(battle.result && battle.result.loser){
      for(const cc of casualties){
        if(cc.side !== battle.result.loser || cc.sourceKind !== 'group') continue;
        const g = (campaign.groups || []).find(x => x && x.id === cc.sourceId);
        if(!g || !g.banditryDomainId) continue;
        const rec = _banditByDomain[g.banditryDomainId] || (_banditByDomain[g.banditryDomainId] = { dead: 0, captured: 0, bands: [] });
        const cap = cc.prisoners || 0;
        rec.dead += (cc.dead || 0); rec.captured += cap;
        // loss = the band's full combat loss (dead + captured + any deserted). The band shrinks
        // by loss; only the DEAD reduce families — the captured (freed) and deserted (scattered)
        // are not killed, so they return to the population (the monthly re-derive re-musters them
        // if morale stays bad).
        rec.bands.push({ groupId: g.id, dead: cc.dead || 0, captured: cap, loss: cc.loss || 0 });
        banditCaptured += cap;
      }
    }
    const banditOutcome = Object.keys(_banditByDomain).map((domainId) => {
      const d = (campaign.domains || []).find(x => x && x.id === domainId) || null;
      const before = (d && d.demographics && d.demographics.morale != null) ? d.demographics.morale : 0;
      const rec = _banditByDomain[domainId];
      return { domainId, domainName: (d && (d.name || d.id)) || domainId,
               dead: rec.dead, captured: rec.captured, bands: rec.bands,
               moraleBefore: before, moraleAfter: _moraleClamp(before + 1) };
    });
    for(const b of banditOutcome){
      const nm = A().MORALE_LEVEL_NAMES || {};
      lines.push('⚖ Banditry quelled in ' + b.domainName + ': the victory raises domain morale ' +
        b.moraleBefore + ' → ' + b.moraleAfter + ' (' + (nm[String(b.moraleAfter)] || ('morale ' + b.moraleAfter)) + ', RR p.351)' +
        (b.dead ? '; ' + b.dead + ' bandit(s) slain — ' + b.domainName + ' loses ' + b.dead + ' families' : '') +
        (b.captured ? '; ' + b.captured + ' taken prisoner — the domain\'s own men, freed to return to work' +
          (b.moraleAfter < -1 ? ' (morale still below −1 — they may turn bandit again next month)' : '') : '') + '.');
    }

    // Officer + hero casualties (RR p.470) — the GM rolls Mortal Wounds at the table
    // (victor net 0 / defeated net −4) and enters the outcome band per officer.
    const officers = [];
    for(const sk of ['a', 'b']){
      for(const u of battle.sides[sk].units){
        if(!u.officerCharacterId) continue;
        if(u.status === 'destroyed' || u.status === 'routed' || u.eliminatedByPursuit){
          const ch = _char(campaign, u.officerCharacterId);
          officers.push({
            characterId: u.officerCharacterId, name: (ch && ch.name) || u.officerCharacterId,
            unitLabel: u.label, unitStatus: u.status, side: sk,
            victor: sk === battle.result.winner,
            netMod: sk === battle.result.winner ? 0 : -4,
            mayDeclineToCaptivity: u.status === 'routed',   // a routed officer may submit to capture instead of rolling
            outcome: null, woundRoll: null
          });
        }
      }
    }
    if(officers.length) lines.push('🩸 ' + officers.length + ' officer(s)/hero(es) must roll on the Mortal Wounds table (victor net 0, defeated net −4) — enter each outcome band.');

    // Spoils (RR p.471)
    const defeatedUnits = L.units.filter(u => u.status === 'destroyed' || u.status === 'routed' || u.eliminatedByPursuit);
    const wageSpoils = defeatedUnits.reduce((s, u) => s + (u.wageMonthlyGp || 0), 0);
    const monsterSpoils = defeatedUnits.some(u => u.sourceKind === 'group');
    const ransomablePrisoners = Math.max(0, prisoners - banditCaptured);   // freed bandit-peasants aren't ransomed (RR p.351)
    const prisonerSpoils = ransomablePrisoners * 40;
    const spoilsGp = wageSpoils + prisonerSpoils;
    lines.push('💰 Spoils of war: ' + wageSpoils + 'gp (one month\'s wages of every destroyed or routed unit) + ' + prisonerSpoils + 'gp (' + ransomablePrisoners + ' prisoners × 40gp ransom/slave value' + (ransomablePrisoners ? '; kept prisoners can serve as construction workers' : '') + ') = ' + spoilsGp + 'gp.' + (banditCaptured ? ' ' + banditCaptured + ' captured bandit(s) are the domain\'s own men — freed, not ransomed (RR p.351).' : '') + (monsterSpoils ? ' Monster units carry no wages — their spoils are the band\'s own treasure (see the lair/group).' : ''));

    // XP (RR pp.471–472)
    const defeatedValue = defeatedUnits.reduce((s, u) => s + (u.xpValue || 0), 0);
    const friendlyDefeated = W.units.filter(u => u.status === 'destroyed' || u.status === 'routed').reduce((s, u) => s + (u.xpValue || 0), 0);
    const commanderXpTotal = Math.max(0, defeatedValue - friendlyDefeated);
    const leaderXp = Math.floor(commanderXpTotal / 2);
    const commanderSplits = [];
    if(W.leaderCharacterId) commanderSplits.push({ characterId: W.leaderCharacterId, role: 'leader', xp: leaderXp });
    const others = (W.commanders || []).filter(c => c.characterId && c.characterId !== W.leaderCharacterId);
    const unitsByCommander = others.map(c => ({ c, n: W.units.filter(u => u.divisionCommanderCharacterId === c.characterId).length }))
      .filter(x => x.n > 0);
    const totalCmdUnits = unitsByCommander.reduce((s, x) => s + x.n, 0);
    const rest = commanderXpTotal - leaderXp;
    if(totalCmdUnits > 0){
      for(const x of unitsByCommander){
        commanderSplits.push({ characterId: x.c.characterId, role: 'commander', xp: Math.floor(rest * x.n / totalCmdUnits) });
      }
    } else if(commanderSplits.length){
      commanderSplits[0].xp = commanderXpTotal;   // no other commanders — the leader takes all
    }
    const survivors = W.units.filter(u => u.status === 'active' && u.sourceKind !== 'hero');
    const troopShareGp = spoilsGp - Math.floor(spoilsGp / 2);
    const perUnitGp = survivors.length ? Math.floor(troopShareGp / survivors.length) : 0;
    const troopCombatXpEach = (W.startingBr > 0) ? Math.floor(75 * (L.startingBr / W.startingBr)) : 0;
    const xp = {
      commanderXpTotal, commanderSplits,
      troopCombatXpEach,
      spoilsLeaderGp: Math.floor(spoilsGp / 2), troopShareGp, perUnitGp,
      troops: survivors.map(u => ({
        unitKey: u.key, label: u.label, sourceKind: u.sourceKind, sourceId: u.sourceId, creatures: u.creatures,
        combatXpEach: troopCombatXpEach,
        spoilsXpEach: u.creatures ? Math.floor(perUnitGp / u.creatures) : 0
      }))
    };
    lines.push('⭐ XP: commanders split ' + commanderXpTotal + ' XP (the leader takes ' + (commanderSplits[0] ? commanderSplits[0].xp : 0) + '); winning troops earn ' + troopCombatXpEach + ' XP each from combat + their spoils share (assuming the traditional 50% to the troops — pay less and the unpaid units make loyalty rolls). 500 XP promotes a militiaman to mercenary, a mercenary to 1st-level fighter.');

    battle.aftermath = {
      computedAtTurn: (campaign.currentTurn || 1), retreatNote, pursuit, casualties, prisoners,
      officers, spoils: { wageSpoils, prisonerSpoils, total: spoilsGp, monsterSpoilsNote: monsterSpoils },
      banditOutcome, xp, lines, applied: false
    };
    return battle.aftermath;
  }
  function setOfficerOutcome(campaign, battleId, characterId, outcomeKey, opts){
    opts = opts || {};
    const Ax = A();
    const battle = findBattle(campaign, battleId);
    const af = battle && battle.aftermath;
    if(!af || af.applied) return null;
    const entry = (af.officers || []).find(x => x.characterId === characterId);
    if(!entry) return null;
    // A routed officer may SUBMIT to capture instead of risking the Mortal Wounds roll (RR p.470).
    if(outcomeKey === 'captured-voluntarily' && entry.mayDeclineToCaptivity){
      entry.outcome = 'captured-voluntarily';
      entry.woundRoll = null; entry.mortalWound = null;
      entry.dies = false; entry.captured = true; entry.escaped = false;
      return entry;
    }
    const band = (Ax.OFFICER_CASUALTY_OUTCOMES || []).find(b => b.key === outcomeKey) || null;
    if(!band) return null;
    entry.outcome = band.key;
    entry.dies = (band.dies === 'always' || (band.dies === 'if-defeated' && !entry.victor));
    entry.captured = !!(band.capturedIfDefeated && !entry.victor);
    entry.escaped = !!(band.escapedIfDefeated && !entry.victor);
    // Resolve the casualty through the shipped Mortal Wounds resolver (Delves D1). The
    // officer-casualty band key IS the MW condition id (RR p.470 sends fallen officers to the
    // Mortal Wounds table); abstract:true → the mass-combat modifier subset (CON / HD / helm,
    // JJ p.276). One roll here; applyBattleAftermath applies this stored result deterministically.
    const ch = _char(campaign, characterId);
    if(typeof Ax.rollMortalWound === 'function' && ch){
      entry.mortalWound = Ax.rollMortalWound(ch, {
        conditionId: band.key, damageType: 'savage', abstract: true,
        forcedD6: (opts.forcedD6 != null ? opts.forcedD6 : undefined),
        rng: opts.rng || Math.random
      });
      // keep the bare d6 report for the panel + back-compat, gated on the band's own woundRoll flag.
      entry.woundRoll = band.woundRoll ? entry.mortalWound.d6 : null;
    } else {
      entry.mortalWound = null;
      entry.woundRoll = band.woundRoll ? _d6(opts.rng) : null;   // D1 not loaded — the bare report
    }
    return entry;
  }
  // applyBattleAftermath — the one world-write step: unit/group casualties, officer
  // outcomes, commander XP, per-troop XP accrual; emits the comprehensive
  // battle-resolved event and flips the battle to 'resolved'.
  function applyBattleAftermath(campaign, battleId){
    const Ax = A();
    const battle = findBattle(campaign, battleId);
    const af = battle && battle.aftermath;
    if(!af || af.applied || !battle.result || !battle.result.winner) return null;
    const missing = (af.officers || []).filter(x => !x.outcome);
    if(missing.length) throw new Error('applyBattleAftermath: ' + missing.length + ' officer outcome(s) not yet entered');
    // 1) world casualties
    const unitLoss = {}, groupLoss = {};
    for(const c of af.casualties){
      if(c.sourceKind === 'unit') unitLoss[c.sourceId] = (unitLoss[c.sourceId] || 0) + c.loss;
      else if(c.sourceKind === 'group') groupLoss[c.sourceId] = (groupLoss[c.sourceId] || 0) + c.loss;
    }
    // Defeated banditry bands are settled by the bandit step below (it must split the loss into
    // killed vs freed-prisoners), so they're held out of the generic group-casualty accrual to
    // avoid a double-deduction at the monthly banditry settle.
    const banditBandIds = new Set();
    for(const b of (af.banditOutcome || [])) for(const x of (b.bands || [])) banditBandIds.add(x.groupId);
    for(const id of Object.keys(unitLoss)){
      const u = (campaign.units || []).find(x => x && x.id === id);
      if(!u) continue;
      u.casualties = Math.min(u.count || 0, (u.casualties || 0) + unitLoss[id]);
      if(!Array.isArray(u.history)) u.history = [];
      u.history.push({ atTurn: campaign.currentTurn || 1, type: 'battle', summary: unitLoss[id] + ' lost at ' + battle.name });
    }
    for(const id of Object.keys(groupLoss)){
      if(banditBandIds.has(id)) continue;                     // settled by the bandit step (RR p.351)
      const g = (campaign.groups || []).find(x => x && x.id === id);
      if(!g) continue;
      g.casualties = Math.min(g.count || 0, (g.casualties || 0) + groupLoss[id]);
      if(!Array.isArray(g.history)) g.history = [];
      g.history.push({ atTurn: campaign.currentTurn || 1, type: 'battle', summary: groupLoss[id] + ' lost at ' + battle.name });
    }
    // 1b) bandit-army outcome (RR p.351): the defeated bandits' domains are healed — +1 current
    //     morale, the slain reduce the population, the captured are freed back to work (no family
    //     loss). The bands are settled HERE (count −= loss, casualties zeroed) so the monthly
    //     banditry processor neither double-deducts nor re-derives them as still in the field; a
    //     wholly-defeated band is removed (the monthly processor's wiped-band rule, applied now).
    if((af.banditOutcome || []).length){
      const wipedBands = new Set();
      for(const b of af.banditOutcome){
        const d = (campaign.domains || []).find(x => x && x.id === b.domainId);
        if(!d || !d.demographics) continue;
        d.demographics.morale = b.moraleAfter;                // +1 current morale on victory (RR p.351)
        if(b.dead) d.demographics.peasantFamilies = Math.max(0, (d.demographics.peasantFamilies || 0) - b.dead);
        for(const x of (b.bands || [])){
          const g = (campaign.groups || []).find(gr => gr && gr.id === x.groupId);
          if(!g) continue;
          g.count = Math.max(0, (g.count || 0) - (x.loss || ((x.dead || 0) + (x.captured || 0))));
          g.casualties = 0;
          if(!Array.isArray(g.history)) g.history = [];
          g.history.push({ atTurn: campaign.currentTurn || 1, type: 'battle',
            summary: 'Defeated at ' + battle.name + ' — ' + (x.dead || 0) + ' slain, ' + (x.captured || 0) + ' freed to ' + (d.name || d.id) });
          if((g.count || 0) <= 0) wipedBands.add(g.id);
        }
        // The ruler met the bandit lord in battle (RR p.351) — his challenge is broken (the
        // domain-level state cleared here; if he was statted as a unit officer the Mortal-Wounds
        // pass above already set his fate, so don't overwrite a death).
        if(d.banditryChallenger){
          const lord = (campaign.characters || []).find(c => c && c.id === d.banditryChallenger.characterId);
          if(lord && lord.lifecycleState !== 'deceased' && lord.lifecycleState !== 'departed'){
            lord.lifecycleState = 'departed';
            if(typeof A().addCharacterHistory === 'function') A().addCharacterHistory(campaign, lord, 'note', 'Defeated at ' + battle.name + ' — his bandit revolt in ' + (d.name || d.id) + ' is broken (RR p.351)');
          }
          d.banditryChallenger = null;
        }
      }
      if(wipedBands.size) campaign.groups = (campaign.groups || []).filter(g => !(g && wipedBands.has(g.id)));
    }
    // 2) officers — resolve each fallen officer through the shipped Mortal Wounds resolver
    //    (Delves D1): the wound record + the standing permanentWoundPenalty + the convalescence
    //    clock (or the death) + a per-officer mortal-wound event all flow from the one casualty
    //    primitive. RR p.470 sends fallen officers to the Mortal Wounds table.
    for(const o of af.officers){
      const ch = _char(campaign, o.characterId);
      if(!ch) continue;
      // A routed officer who submitted to capture took no wound roll (RR p.470).
      if(o.outcome === 'captured-voluntarily'){
        if(typeof Ax.addCharacterHistory === 'function')
          Ax.addCharacterHistory(campaign, ch, 'note', 'Captured at ' + battle.name + ' (submitted rather than risk the wounds)');
        continue;
      }
      const band = (Ax.OFFICER_CASUALTY_OUTCOMES || []).find(b => b.key === o.outcome) || null;
      if(!band) continue;
      const dies = (o.dies != null) ? o.dies : (band.dies === 'always' || (band.dies === 'if-defeated' && !o.victor));
      // Apply the Mortal Wound: the battle decides death (per band + victor); pass it via
      // healedToOneHp so the resolver records the death OR the survivable wound + bed rest +
      // the permanentWoundPenalty + the convalescence clock (the slot-58 day consumer heals it).
      if(typeof Ax.applyMortalWound === 'function' && o.mortalWound){
        Ax.applyMortalWound(campaign, ch, o.mortalWound, { healedToOneHp: !dies });
      } else if(dies){                                       // D1 not loaded — fall back to a bare death
        ch.lifecycleState = 'deceased'; ch.alive = false;
      }
      // Battle-context note (where it happened + the disposition the resolver can't know).
      const dispo = (o.captured || (band.capturedIfDefeated && !o.victor)) ? ' — captured by the enemy'
                  : ((o.escaped || (band.escapedIfDefeated && !o.victor)) ? ' — escaped before capture' : '');
      if(typeof Ax.addCharacterHistory === 'function')
        Ax.addCharacterHistory(campaign, ch, dies ? 'death' : 'note', band.label + ' at ' + battle.name + dispo);
    }
    // 3) XP — commanders to characters, troops to the world units' per-troop accrual
    for(const s of af.xp.commanderSplits){
      const ch = _char(campaign, s.characterId);
      if(!ch || !s.xp) continue;
      ch.xp = (ch.xp || 0) + s.xp;
      if(typeof Ax.addCharacterHistory === 'function') Ax.addCharacterHistory(campaign, ch, 'xp', '+' + s.xp + ' XP — ' + (s.role === 'leader' ? 'led the army at ' : 'commanded a division at ') + battle.name);
    }
    for(const tr of af.xp.troops){
      if(tr.sourceKind !== 'unit') continue;   // monsters do not accrue XP
      const u = (campaign.units || []).find(x => x && x.id === tr.sourceId);
      if(!u) continue;
      u.xpPerTroop = (u.xpPerTroop || 0) + (tr.combatXpEach || 0) + (tr.spoilsXpEach || 0);
    }
    try { if(typeof Ax.checkAllCharacterLevelUps === 'function') Ax.checkAllCharacterLevelUps(campaign); } catch (_) {}
    // 4) the comprehensive resolution event
    const W = battle.sides[battle.result.winner];
    const banditNarr = (af.banditOutcome || []).map(b =>
      ' Banditry quelled in ' + b.domainName + ' (morale ' + b.moraleBefore + '→' + b.moraleAfter + ', RR p.351; ' + b.dead + ' slain, ' + b.captured + ' freed).').join('');
    const ev = _emitBattleEvent(campaign, battle, 'battle-resolved', {
      battleId: battle.id, winner: W.label, endedBy: battle.result.endedBy,
      turns: battle.result.endedAtTurn, spoilsGp: af.spoils.total, prisoners: af.prisoners,
      casualties: af.casualties.map(c => ({ side: c.side, label: c.label, loss: c.loss })),
      banditOutcome: (af.banditOutcome || []).map(b => ({ domainId: b.domainId, dead: b.dead, captured: b.captured, moraleBefore: b.moraleBefore, moraleAfter: b.moraleAfter })),
      xp: { commanders: af.xp.commanderXpTotal, troopEach: af.xp.troopCombatXpEach },
      narrative: battle.name + ' — ' + W.label + ' wins by ' + battle.result.endedBy + ' after ' + battle.result.endedAtTurn + ' turn(s); spoils ' + af.spoils.total + 'gp, ' + af.prisoners + ' prisoners.' + banditNarr
    }, { hidden: false, turnNumber: battle.result.endedAtTurn });
    // the healed domain(s) read the resolution in their chronicle (Event context envelope)
    if(ev && ev.context && Array.isArray(ev.context.relatedEntities)){
      for(const b of (af.banditOutcome || [])){
        if(!ev.context.relatedEntities.some(r => r.kind === 'domain' && r.id === b.domainId))
          ev.context.relatedEntities.push({ kind: 'domain', id: b.domainId, role: 'beneficiary' });
      }
    }
    af.applied = true;
    battle.status = 'resolved';
    _battleHistory(campaign, battle, 'resolved', 'Aftermath applied — casualties, spoils, and XP recorded');
    return battle;
  }

  // ── events ──────────────────────────────────────────────────────────────────
  function _battleEventContext(campaign, battle){
    const rel = [{ kind: 'battle', id: battle.id, role: 'subject' }];
    for(const sk of ['a', 'b']){
      const s = battle.sides[sk];
      const role = sk === battle.attackerSide ? 'attacker' : 'defender';
      if(s.armyId) rel.push({ kind: 'army', id: s.armyId, role });
      if(s.domainId) rel.push({ kind: 'domain', id: s.domainId, role });
      for(const g of (s.groupIds || [])) rel.push({ kind: 'group', id: g, role });
      if(s.leaderCharacterId) rel.push({ kind: 'character', id: s.leaderCharacterId, role: 'commander' });
    }
    const hexObj = _hex(campaign, battle.hexId);
    return {
      primaryHexId: battle.hexId || null,
      involvedHexIds: battle.hexId ? [battle.hexId] : [],
      settlementId: null,
      domainId: (hexObj && hexObj.domainId) || null,
      relatedEntities: rel
    };
  }
  function _emitBattleEvent(campaign, battle, kind, payload, opts){
    const Ax = A();
    if(typeof Ax.recordAppliedEvent !== 'function') return null;
    let ev = null;
    try {
      ev = Ax.recordAppliedEvent(campaign, kind, payload, { narrativeSummary: (payload && payload.narrative) || kind });
    } catch (_) { return null; }
    if(!ev) return null;
    ev.appliedAtDay = campaign.currentDayInMonth || 1;
    ev.context = _battleEventContext(campaign, battle);
    ev.subdayContext = {
      cadence: 'battle-turn', encounterId: null, battleId: battle.id,
      roundNumber: null,
      turnNumber: (opts && opts.turnNumber != null) ? opts.turnNumber : (battle.turnNumber || null),
      initiativeOrder: null
    };
    if(opts && opts.hidden) ev.campaignLogHidden = true;
    return ev;
  }

  // ── namespace ───────────────────────────────────────────────────────────────
  Object.assign(ACKS, {
    findBattle, activeBattles, battlesAtHex,
    battleScaleUpFactor, scaleInfantryPerUnit, troopRowMissileLoose,
    buildBattleSide, createBattle, autoDeployBattle, beginBattle,
    battleSideSummary,
    runBattleTurn, revertBattleTurn, withdrawBattleSide,
    declareForay, resolveForay, cancelForay,
    computeBattleAftermath, setOfficerOutcome, applyBattleAftermath,
    qualifiesAsBattleHero, heroBattleUnitBr, addHeroToBattle
  });

  if (typeof module !== 'undefined' && module.exports) module.exports = ACKS;
})(typeof window !== 'undefined' ? window : globalThis);
