/* =============================================================================
 * domain-app-warfare.js — ACKS God Mode app mixin: Warfare (armies / battles / sieges / units) UI
 * =============================================================================
 *
 * Warfare (armies / battles / sieges / units) UI, extracted from domain-app.js (T5 chip 8, 2026-06-23) — pure code-motion: a
 * reorder-gather of the feature’s members, which the team-session append-zones
 * (@b8..@b14) had scattered across the component literal. Registers a members object
 * on window.__ACKS_APP_MIXINS__; domainApp() merges it into the component
 * (descriptor-preserving, so getters survive). Members use this.* / window.ACKS.* only.
 * Loaded via <script src> after domain-app.js, before Alpine’s deferred init.
 * ============================================================================= */
(function(){
  'use strict';
  var M = (window.__ACKS_APP_MIXINS__ = window.__ACKS_APP_MIXINS__ || []);
  M.push({
  // === @b14-construction (team) — Construction siege-support (circumvallation / war-machine field-assembly / siege-hijinks): state + methods ===
  // The buildable siege-support works (RR p.474 / p.449) are raised through the Construction Wizard
  // (kind 'siege-construction') and read back on the Siege panel. The Wizard cost is DERIVED (1gp/ft
  // for circumvallation; 1/100 the machine cost for assembly), so these helpers feed the picker, sync
  // the cost, and render the siege-panel readout. The siege state is the source of truth (the engine
  // writes siege.blockade.circumvallationFeet / siege.besiegerArtillery on completion).
  // The active sieges a siege-support Project can target (the Wizard's siege picker).
  siegeWizardSiegeOptions(){
    const A = window.ACKS, c = this.currentCampaign;
    if(!c || !A.activeSieges) return [];
    return A.activeSieges(c).map(s => ({ id: s.id, label: s.name || s.id }));
  },
  // The built war machines available to field-assemble at the selected siege (Wave-D war-machine
  // Constructibles, not destroyed, not already assembled at this siege). The GM picks which is theirs.
  siegeWizardMachineOptions(){
    const A = window.ACKS, c = this.currentCampaign, cw = this.constructionWizard;
    if(!c || !cw.siegeId) return [];
    return (c.constructibles || []).filter(m => m && m.constructibleKind === 'war-machine'
        && m.damageState !== 'destroyed'
        && !(m.functionData && m.functionData.assembledAtSiegeId === cw.siegeId))
      .map(m => ({ id: m.id, subtype: m.constructibleSubtype,
        label: (m.name || A.warMachineLabel(m.constructibleSubtype)),
        cost: A.warMachineAssemblyCostGp ? A.warMachineAssemblyCostGp(m.constructibleSubtype) : 0 }));
  },
  // Keep cw.totalCost in sync with the derived siege-work cost (circumvallation 1gp/ft; assembly
  // 1/100 the machine's build cost). Called from the secondary-input handlers + subtype pick.
  siegeWizardSyncCost(){
    const A = window.ACKS, cw = this.constructionWizard;
    if(cw.kind !== 'siege-construction') return;
    if(cw.structureKey === 'circumvallation'){
      cw.totalCost = A.circumvallationProjectCostGp ? A.circumvallationProjectCostGp(Number(cw.circumvallationFeet) || 0) : (Number(cw.circumvallationFeet) || 0);
    } else if(cw.structureKey === 'war-machine-assembly'){
      const m = this.siegeWizardMachineOptions().find(x => x.id === cw.assemblyMachineId);
      cw.totalCost = m ? m.cost : 0;
    } else { cw.totalCost = 0; }
  },
  // 🧱 Siege-panel readout — circumvallation progress (feet → blockade-unit relief + complete-ring /
  // −4-smuggling) + assembled artillery. Reads the engine directly (the siege is the source of truth).
  siegeWorksReadout(siege){
    const A = window.ACKS, c = this.currentCampaign;
    if(!siege || !c) return '';
    const prof = A.siegeStrongholdProfile ? A.siegeStrongholdProfile(c, siege) : { unitCapacity: 0 };
    const feet = (siege.blockade && siege.blockade.circumvallationFeet) || 0;
    const toEncircle = A.circumvallationFeetToEncircle ? A.circumvallationFeetToEncircle(prof.unitCapacity) : 0;
    const units = A.blockadeUnitsAfterCircumvallation ? A.blockadeUnitsAfterCircumvallation(prof.unitCapacity, feet) : 0;
    const full = A.siegeFullyCircumvallated ? A.siegeFullyCircumvallated(c, siege) : false;
    const smug = A.siegeSmugglingModifier ? A.siegeSmugglingModifier(c, siege) : 0;
    const art = A.artilleryBonusUnits ? A.artilleryBonusUnits(siege.besiegerArtillery) : 0;
    const parts = ['Circumvallation ' + feet.toLocaleString() + "' / " + toEncircle.toLocaleString() + "' to encircle — blockade needs " + units + ' unit' + (units === 1 ? '' : 's') + (full ? ' (ring complete)' : '')];
    if(smug) parts.push('smuggling ' + smug);
    if(art) parts.push('assembled artillery +' + art + ' units');
    return parts.join(' · ');
  },
  // In-progress siege-support Projects targeting this siege (the build-queue readout).
  siegeWorksProjects(siege){
    if(!siege || !this.currentCampaign) return [];
    const A = window.ACKS;
    return (this.currentCampaign.projects || []).filter(p => p && p.constructibleKind === 'siege-construction'
        && p.completionSpec && p.completionSpec.siegeSupport && p.completionSpec.siegeSupport.siegeId === siege.id
        && p.lifecycleState === 'under-construction')
      .map(p => {
        const f = A.projectConstructionForecast ? A.projectConstructionForecast(this.currentCampaign, p) : null;
        const icon = (p.completionSpec.siegeSupport.supportType === 'circumvallation') ? '🧱' : '⚙';
        return { id: p.id, label: icon + ' ' + (p.name || 'siege work') + (f ? (' — ' + f.pctComplete + '% (' + (f.daysToComplete != null ? f.daysToComplete + ' days left' : 'stalled') + ')') : '') };
      });
  },
  // ─── Military unit helpers + the clickable Unit Sheet + the Levy modal (RR pp.427–433) ───
  // Type is set by recruiting/training and is READ-ONLY in the table; clicking a unit's NAME opens
  // its sheet (where field-editing happens), and the 🔍 Inspector is the admin/raw path.
  unitTypeLabelFor(u){
    if(!u || u.unitTypeKey === 'untrained-levy') return 'untrained';
    const A = window.ACKS;
    const row = (A && A.findTroopType) ? A.findTroopType(u.unitTypeKey, { race: u.race, veteran: !!u.veteran, loadout: u.loadout || null }) : null;
    if(row && row.label) return row.label;
    const merc = ((A && A.HIRELING_MERCENARIES) || []).find(r => r.id === u.unitTypeKey);
    return (merc && merc.label) || u.unitTypeKey || '—';
  },
  unitMoraleText(u){ const m = (window.ACKS.unitMoraleScore) ? window.ACKS.unitMoraleScore(this.currentCampaign, u) : ((u.unitTypeKey === 'untrained-levy' ? -2 : 0) + (u.moraleAdjustment || 0)); return (m > 0 ? '+' : '') + m; },
  // Living-count subtotal for a garrison section (the dead collect no wage / carry no BR).
  unitListTotals(units){ const us = units || []; const liv = u => Math.max(0, (u.count || 0) - (u.casualties || 0)); return { count: us.reduce((s,u)=>s+liv(u),0), cost: us.reduce((s,u)=>s+liv(u)*(u.monthlyWage||0),0), br: us.reduce((s,u)=>s+liv(u)*(u.brPerSoldier||0),0) }; },
  // The domain that owns the sheet's unit (for the garrison-context Split/Merge/Release ops).
  unitSheetDomain(){ const u = this.unitSheetUnit(); if(!u) return null; const id = u.ownerDomainId || ((u.stationedAt && u.stationedAt.kind === 'domain-garrison') ? u.stationedAt.id : null); return id ? (this.domains || []).find(d => d && d.id === id) : null; },
  unitSheetUnit(){
    const id = this.unitSheetUnitId, c = this.currentCampaign;
    if(!id || !c) return null;
    // T6 single-home — findUnit reads the canonical campaign.units[] (the nested mirror is gone).
    const A = window.ACKS;
    return (A && A.findUnit) ? A.findUnit(c, id) : null;
  },
  unitSheetList(){ const u = this.unitSheetUnit(); return u ? [u] : []; },
  // The army-card reaction block (R-1c + D3): the sally's status + re-route / recall.
  armyReactionTargetBand(){
    const a = this.armySelected(); if(!a || !a.reactionTargetGroupId || !this.currentCampaign) return null;
    return (this.currentCampaign.groups || []).find(g => g && g.id === a.reactionTargetGroupId) || null;
  },
  // Band-centric reaction readers for the ⚔ Active Threats table (D4 deploy model): a band the
  // garrison is answering stays on the list, marked responding, until the force arrives + recalls.
  bandRespondingArmy(g){
    if(!g || !this.currentCampaign) return null;
    return (this.currentCampaign.armies || []).find(a => a && a.reactionTargetGroupId === g.id) || null;
  },
  bandRespondingStatus(g){
    const a = this.bandRespondingArmy(g); if(!a) return '';
    const camp = this.currentCampaign;
    if(a.reactionBattleId && (camp.battles || []).some(b => b && b.id === a.reactionBattleId)) return 'in battle';
    const marching = a.journeyId && (camp.journeys || []).some(j => j && j.id === a.journeyId && j.status === 'in-transit');
    if(marching) return 'marching to engage';
    if(a.currentHexId && g.currentHexId && a.currentHexId === g.currentHexId) return 'in position';
    return 'mustering';
  },
  armyReactionStatusText(){
    const a = this.armySelected(); if(!a) return '';
    const band = this.armyReactionTargetBand();
    const alive = band && (window.ACKS.groupActiveCount ? window.ACKS.groupActiveCount(band) > 0 : true);
    if(!band || !alive) return 'The target band is gone — recall the force.';
    const name = band.name || 'the band';
    if(a.reactionBattleId && (this.currentCampaign.battles || []).some(b => b && b.id === a.reactionBattleId))
      return 'In battle with ' + name + ' — resolve it in Review ▸ 🎌 Battles, then recall.';
    const marching = a.journeyId && (this.currentCampaign.journeys || []).some(j => j && j.id === a.journeyId && j.status === 'in-transit');
    if(marching) return 'Marching to meet ' + name + (band.currentHexId ? (' at ' + this.hexLabelById(band.currentHexId)) : '') + ' — it follows the band automatically if it moves.';
    if(a.currentHexId && band.currentHexId && a.currentHexId === band.currentHexId)
      return 'In position against ' + name + ' — the meeting resolves on the next day tick.';
    return 'The band has moved' + (band.currentHexId ? (' to ' + this.hexLabelById(band.currentHexId)) : '') + ' — the force resumes the pursuit on the next day tick (or re-route / recall by hand).';
  },
  armyReactionCanReRoute(){
    const a = this.armySelected(); if(!a) return false;
    const band = this.armyReactionTargetBand();
    if(!band || !band.currentHexId) return false;
    if(a.reactionBattleId && (this.currentCampaign.battles || []).some(b => b && b.id === a.reactionBattleId)) return false;
    return a.currentHexId !== band.currentHexId;
  },
  armyReactionReRoute(){
    const a = this.armySelected(); const band = this.armyReactionTargetBand();
    if(!a || !band || !band.currentHexId) return;
    if(a.journeyId && window.ACKS.reRouteJourney) window.ACKS.reRouteJourney(this.currentCampaign, a.journeyId, { destinationHexId: band.currentHexId });
    else if(window.ACKS.startArmyMarch) window.ACKS.startArmyMarch(this.currentCampaign, a.id, { destinationHexId: band.currentHexId });
    this.markDirty(); this.schedulePersist();
    if(this.showToast) this.showToast('🧭 Re-routing to ' + (band.name || 'the band') + '.');
  },
  armyReactionRecall(){
    const a = this.armySelected(); if(!a) return;
    if(!confirm('Recall this force? Its units march home to their garrisons.')) return;
    if(window.ACKS.recallReactionForce) window.ACKS.recallReactionForce(this.currentCampaign, a.id);
    this.markDirty(); this.schedulePersist();
    this.armiesSelectedId = null;
    if(this.showToast) this.showToast('🏠 Force recalled — the units march home.');
  },
  _unitHomeLabel(u){
    const camp = this.currentCampaign; const st = u && u.stationedAt;
    if(!st) return 'unstationed';
    if(st.kind === 'domain-garrison'){ const d = (camp.domains||[]).find(x => x && x.id === st.id); return d ? ('garrison · ' + (d.name || d.id)) : 'a garrison'; }
    if(st.kind === 'character'){ const c = (camp.characters||[]).find(x => x && x.id === st.id); return c ? ('company · ' + (c.name || c.id)) : 'a company'; }
    if(st.kind === 'hex'){ const h = (camp.hexes||[]).find(x => x && x.id === st.id); return h ? (window.ACKS.hexName ? hexLabelFor(h) : st.id) : st.id; }
    return st.kind;
  },
  // Call up reinforcements to a STANDING army (the army card's ＋ button). The inline picker
  // lists free units; each is called up immediately (co-located → joins, distant → marches in).
  armyCallUp(unitId){
    const a = this.armySelected(); if(!a || !unitId) return;
    const r = window.ACKS.callUpUnit(this.currentCampaign, unitId, a.id);
    const cu = window.ACKS.findUnit(this.currentCampaign, unitId); if(cu && cu.source === 'militia') cu.calledUp = true;  // RR p.432 — a called-up militia bills the domain
    this.markDirty(); this.schedulePersist();
    if(this.showToast){
      const u = (this.currentCampaign.units||[]).find(x => x && x.id === unitId);
      const nm = u ? (u.displayName || u.unitTypeKey || 'unit') : 'unit';
      this.showToast(r && r.action === 'joined' ? ('🎖 ' + nm + ' joined ' + (a.name || 'the army') + '.') : ('🚶 ' + nm + ' is marching to join ' + (a.name || 'the army') + '.'));
    }
  },
  // Free units available to call up to the SELECTED standing army (same filter as muster,
  // annotated present/marching-in against the army's current hex).
  armyCallUpCandidates(){
    const camp = this.currentCampaign; const a = this.armySelected(); if(!camp || !a) return [];
    const A = window.ACKS; const dest = a.currentHexId || null;
    const milesPerHex = (A.JOURNEY_MILES_PER_HEX || 6);
    return ((camp.units) || [])
      .filter(u => u && Math.max(0,(u.count||0)-(u.casualties||0)) > 0 && !(u.stationedAt && u.stationedAt.kind === 'army') && !(u.musterState && u.musterState.destination))
      .map(u => {
        const origin = A.unitCurrentHexId ? A.unitCurrentHexId(camp, u) : null;
        let atMuster = (!origin || !dest || origin === dest), days = 0, hexes = 0;
        if(!atMuster && A.computeJourneyDistance){
          try { const d = A.computeJourneyDistance(camp, { startHexId: origin, destinationHexId: dest, participantCharacterIds: [], covered: 0, currentDayIndex: 0 }); hexes = d.total || 0; const spd = A.unitMarchMilesPerDay ? A.unitMarchMilesPerDay(u) : 24; days = spd > 0 ? Math.ceil(hexes * milesPerHex / spd) : null; } catch(e){ hexes = null; }
        }
        return { unit: u, home: this._unitHomeLabel(u), atMuster, hexes, days };
      });
  },
  // Disband the selected army (engine un-stations its units, which survive homeless and
  // re-musterable, and drops its march). A confirm guards the action.
  armyDisband(){
    const a = this.armySelected(); if(!a) return;
    if(!confirm('Disband "' + (a.name || a.id) + '"? Its units return to the unstationed pool (you can re-muster them).')) return;
    window.ACKS.disbandArmy(this.currentCampaign, a.id);
    this.armiesSelectedId = null;
    this.markDirty(); this.schedulePersist();
    if(this.showToast) this.showToast('Army disbanded — its units are free to re-muster.');
  },
  // Advisory org findings for the selected army's card (RR pp.434–437; GM-overridable).
  armyOrgFindings(){
    const a = this.armySelected(); if(!a || !window.ACKS.validateArmyOrganization) return [];
    return window.ACKS.validateArmyOrganization(this.currentCampaign, a).map(f => f.text);
  },
  // The units MARCHING IN to the selected army (callUpUnit) — each with distance/ETA.
  armyIncomingRows(){
    const a = this.armySelected(); if(!a || !window.ACKS.armyIncomingUnits) return [];
    return window.ACKS.armyIncomingUnits(this.currentCampaign, a);
  },
  armySelected(){
    const camp = this.currentCampaign; if(!camp || !this.armiesSelectedId) return null;
    return (camp.armies || []).find(a => a && a.id === this.armiesSelectedId) || null;
  },
  armySelRow(){
    const a = this.armySelected(); if(!a) return { troops: 0, br: 0, speed: 0 };
    const camp = this.currentCampaign, A = window.ACKS;
    return { troops: A.armyTroopCount(camp, a), br: A.armyBattleRating(camp, a), speed: A.armyMarchProfile(camp, a).milesPerDay };
  },
  armySelProfile(){
    const a = this.armySelected(); if(!a) return {};
    return window.ACKS.armyMarchProfile(this.currentCampaign, a);
  },
  armySelFatigue(){
    const a = this.armySelected(); if(!a) return { fatigued: false, reasons: [] };
    return window.ACKS.armyFatigued(this.currentCampaign, a);
  },
  armySelJourney(){
    const a = this.armySelected(); if(!a || !a.journeyId) return null;
    return window.ACKS.findJourney(this.currentCampaign, a.journeyId);
  },
  // The unit's DEPLOYMENT — the read-only column (Domains ▸ Military). A garrisoning unit is ABSTRACT
  // (🛡 Garrisoning · <domain>, no hex); a unit in a field army names the army + where it stands; a
  // move-muster reads 'mustering to <dest>'; a raise reads 'Levying' (levy) or 'Mustering' (mercenary
  // crop); a stood-down militia reads 'Stood down'. (2026-06-22 muster model.)
  unitDeploymentLabel(unit){
    const camp = this.currentCampaign; if(!camp || !unit) return '—';
    const A = window.ACKS;
    const ms = unit.musterState;
    if(ms && ms.destination){   // MOVE muster — mustering to an army / sortie / hex
      const left = (A && A.unitMusterDaysLeft) ? A.unitMusterDaysLeft(camp, unit) : null;
      let where = '';
      if(ms.destination.kind === 'army'){ const a = (camp.armies||[]).find(x => x && x.id === ms.destination.id); where = a ? (a.name || 'an army') : 'an army'; if(a && a.currentHexId) where += ' (' + this.hexLabelById(a.currentHexId) + ')'; }
      else { where = this.hexLabelById(ms.destination.id); }
      return '🚶 mustering to ' + where + (left != null ? ' (' + left + 'd left)' : '');
    }
    if(ms && (unit.musterPending || 0) > 0){   // RAISE muster — a levy ('Levying') or a mercenary crop ('Mustering')
      const left = (A && A.unitMusterDaysLeft) ? A.unitMusterDaysLeft(camp, unit) : null;
      const total = ms.total || 0;
      const here = Math.max(0, (unit.count || 0) - (unit.casualties || 0));
      const isLevy = (unit.source === 'militia' || unit.source === 'conscript');
      return (isLevy ? '⏳ Levying — ' : '⏳ Mustering — ') + here + ' of ' + total + ' arrived' + (left != null ? ' (' + left + 'd left)' : '');
    }
    if(unit.trainingState && unit.trainingState.targetTroopType){
      const left = (A && A.unitTrainingDaysLeft) ? A.unitTrainingDaysLeft(camp, unit) : null;
      const row = (A && A.findTroopType) ? A.findTroopType(unit.trainingState.targetTroopType, { race: unit.race || 'man' }) : null;
      return '🎓 training as ' + ((row && row.label) || unit.trainingState.targetTroopType) + (left != null ? ' (' + left + 'd left)' : '');
    }
    if(unit.source === 'militia' && unit.calledUp === false){ return '🏠 Stood down'; }
    const st = unit.stationedAt || null;
    if(st && st.kind === 'army'){
      const a = (camp.armies || []).find(x => x && x.id === st.id);
      const where = (a && a.currentHexId) ? (' (' + this.hexLabelById(a.currentHexId) + ')') : '';
      return '🎖 ' + (a ? (a.name || 'an army') : 'an army') + where;
    }
    if(st && st.kind === 'domain-garrison'){ const d = (camp.domains || []).find(x => x && x.id === st.id); return '🛡 Garrisoning' + (d ? (' · ' + (d.name || d.id)) : ''); }
    if(st && st.kind === 'hex'){ return this.hexLabelById(st.id); }
    if(st && st.kind === 'character'){ const c = (camp.characters||[]).find(x => x && x.id === st.id); return 'company · ' + (c ? (c.name || c.id) : st.id); }
    const hexId = (A && A.unitCurrentHexId) ? A.unitCurrentHexId(camp, unit) : null;
    return hexId ? this.hexLabelById(hexId) : '—';
  },
  // A unit is "deployed" (away from its domain garrison) when it sits in a field army or is marching
  // to muster — managed through its army (Characters ▸ Parties), not the garrison table; its Split /
  // Merge / × actions are guarded so they can't dangle an army division's unit reference.
  unitIsDeployed(unit){ return !!(unit && ((unit.musterState && unit.musterState.destination) || (unit.stationedAt && unit.stationedAt.kind === 'army'))); },
  // A levy is "in training" until the 'levy-training' day-consumer completes it (RR p.431; W7 timer). While
  // training it can't be re-trained, marched, or merged — its 🎓 Train / 🚶 March / Merge actions are gated.
  unitIsTraining(unit){ return !!(unit && unit.trainingState && unit.trainingState.targetTroopType); },
  // "in training as Heavy Infantry — 23 days left" (RR p.431; W7). '' when not in training.
  unitTrainingText(unit){
    if(!this.unitIsTraining(unit)) return '';
    const A = window.ACKS;
    const left = (A && A.unitTrainingDaysLeft) ? A.unitTrainingDaysLeft(this.currentCampaign, unit) : null;
    const row = (A && A.findTroopType) ? A.findTroopType(unit.trainingState.targetTroopType, { race: unit.race || 'man' }) : null;
    return 'in training as ' + ((row && row.label) || unit.trainingState.targetTroopType) + (left != null ? ' — ' + left + ' day' + (left === 1 ? '' : 's') + ' left' : '');
  },
  // A levy is "mustering" until the 'levy-muster' day-consumer finishes assembling it (RR p.430; W7
  // levy-arrival staging). While mustering it can't be trained, marched, or merged — its 🎓 Train /
  // 🚶 March / Merge actions are gated, like an in-training unit.
  unitIsMustering(unit){ return !!(unit && ((unit.musterPending || 0) > 0 || (unit.musterState && unit.musterState.destination))); },
  // "12 of 48 arrived — 13 days left" (RR p.430; W7). '' when not mustering.
  unitMusterText(unit){
    if(!this.unitIsMustering(unit)) return '';
    const A = window.ACKS;
    const left = (A && A.unitMusterDaysLeft) ? A.unitMusterDaysLeft(this.currentCampaign, unit) : null;
    const ms = unit.musterState;
    if(ms && ms.destination){ return 'mustering to its post' + (left != null ? ' — ' + left + ' day' + (left === 1 ? '' : 's') + ' left' : ''); }
    const total = (ms && ms.total) || 0;
    const here = Math.max(0, (unit.count || 0) - (unit.casualties || 0));
    return here + ' of ' + total + ' arrived' + (left != null ? ' — ' + left + ' day' + (left === 1 ? '' : 's') + ' left' : '');
  },
  armyRosterCount(a){
    const camp = this.currentCampaign, A = window.ACKS;
    return (camp && a && A && A.armyUnits) ? A.armyUnits(camp, a).length : 0;
  },
  // ── Muster a garrison unit to a hex (the Garrison-table "Muster to…" verb, 2026-06-22) ──
  // The two "away" states the action buttons branch on: standing in a field army vs mustering to a
  // destination ({army|hex}). A garrisoning unit is abstract (no hex); it MUSTERS to move (RR p.434).
  unitInArmy(u){ return !!(u && u.stationedAt && u.stationedAt.kind === 'army'); },
  unitMoveMustering(u){ return !!(u && u.musterState && u.musterState.destination); },
  armyMarchGo(){
    const a = this.armySelected(); if(!a || !this.armyMarchDest) return;
    const r = window.ACKS.startArmyMarch(this.currentCampaign, a.id, { destinationHexId: this.armyMarchDest, pace: this.armyMarchPace });
    if(!r.ok){
      const why = { 'no-units': 'the army has no troops', 'pillaging': 'the army is pillaging and cannot move (RR p.459)', 'already-marching': 'it is already on the march', 'no-position': 'the army has no current hex (set one in the Inspector)', 'no-destination': 'pick a destination' }[r.reason] || r.reason;
      this.showToast('🎖 Cannot march — ' + why + '.');
      return;
    }
    this.armyMarchDest = '';
    this.showToast('🧭 ' + (a.name || 'The army') + ' sets out — the Day Clock marches it (+1 day).');
    this.persistSession && this.persistSession();
  },
  armyMarchStop(){
    const a = this.armySelected(); if(!a) return;
    window.ACKS.stopArmyMarch(this.currentCampaign, a.id, 'halted by the GM');
    this.showToast('🛑 ' + (a.name || 'The army') + ' halts where it stands.');
    this.persistSession && this.persistSession();
  },
  armySetStance(v){
    const a = this.armySelected(); if(!a || a.strategicStance === v) return;
    this.commitStatEdit({ entityType: 'army', entityId: a.id, entity: a, fieldPath: 'strategicStance', label: 'Strategic stance', oldValue: a.strategicStance || 'defensive', newValue: v, suppressFromCampaignLog: true });
  },
  armySetWarMachines(mode){
    const a = this.armySelected(); if(!a) return;
    const oldV = a.warMachines || null;
    let newV = null;
    if(mode === 'assembled' || mode === 'disassembled'){
      const n = (oldV && oldV.count) || 1;
      newV = { count: n, assembled: mode === 'assembled' };
    }
    this.commitStatEdit({ entityType: 'army', entityId: a.id, entity: a, fieldPath: 'warMachines', label: 'War machines', oldValue: oldV, newValue: newV, suppressFromCampaignLog: true });
  },
  // ── W5 supply (RR pp.450–452) ──
  armySupply(){ const a = this.armySelected(); if(!a) return null; try { return window.ACKS.armyInSupply(this.currentCampaign, a); } catch(e){ return null; } },
  armySupplyReasonText(reasons){
    const m = { 'cannot-pay': "can't pay the cost", 'insufficient-base': 'no base of sufficient value', 'line-blocked': 'supply line cut', 'line-overextended': 'supply line overextended', 'line-no-base': 'no supply base' };
    return (reasons || []).map(r => m[r] || r).join(', ');
  },
  armyMarketClassLabel(){ const a = this.armySelected(); if(!a) return null; try { return window.ACKS.armyMarketClass(this.currentCampaign, a); } catch(e){ return null; } },
  armySetSupplySimplified(on){
    const a = this.armySelected(); if(!a) return; const v = !!on;
    if((a.supplySimplified !== false) === v) return;
    this.commitStatEdit({ entityType: 'army', entityId: a.id, entity: a, fieldPath: 'supplySimplified', label: 'Supply mode', oldValue: a.supplySimplified !== false, newValue: v, suppressFromCampaignLog: true });
  },
  armySupplyBaseRows(){
    const a = this.armySelected(); if(!a) return [];
    const camp = this.currentCampaign, A = window.ACKS, ids = a.supplyBaseIds || [], out = [], seen = {};
    // friendly + occupied-by-my-side domains (RR p.450 — "any friendly or occupied city, town, or stronghold")
    for(const d of (this.domains || [])){
      if(!d) continue;
      const friendly = (typeof A.domainFriendlyToArmy === 'function') ? A.domainFriendlyToArmy(camp, d, a) : true;
      const occupiedByMe = d.occupiedBy && d.occupiedBy.leaderCharacterId && d.occupiedBy.leaderCharacterId === a.leaderCharacterId;
      if(!friendly && !occupiedByMe && ids.indexOf(d.id) < 0) continue;
      seen[d.id] = true;
      out.push({ id: d.id, name: (d.name || d.id) + (occupiedByMe && !friendly ? ' (occupied)' : ''), label: 'domain', added: ids.indexOf(d.id) >= 0 });
    }
    // built forts + captured strongholds (Constructibles the army's side controls — RR p.451)
    for(const c of ((camp && camp.constructibles) || [])){
      if(!c || seen[c.id]) continue;
      if(c.constructionState && c.constructionState !== 'complete') continue;
      const isFort = c.constructibleKind === 'field-fortification';
      const isStronghold = c.constructibleKind === 'stronghold-component' || c.constructibleKind === 'vault' || c.constructibleKind === 'hideout';
      if(!isFort && !isStronghold) continue;
      let controlled = c.ownerCharacterId && c.ownerCharacterId === a.leaderCharacterId;
      if(!controlled && c.hexId){
        const hex = ((camp.hexes) || []).find(h => h && h.id === c.hexId);
        const dom = hex && hex.domainId ? (this.domains || []).find(d => d && d.id === hex.domainId) : null;
        if(dom){
          const friendly = (typeof A.domainFriendlyToArmy === 'function') ? A.domainFriendlyToArmy(camp, dom, a) : false;
          const occupiedByMe = dom.occupiedBy && dom.occupiedBy.leaderCharacterId === a.leaderCharacterId;
          controlled = friendly || occupiedByMe;
        }
      }
      if(!controlled && ids.indexOf(c.id) < 0) continue;
      out.push({ id: c.id, name: c.name || (isFort ? 'Border fort' : 'Stronghold'), label: isFort ? 'fort' : 'stronghold', added: ids.indexOf(c.id) >= 0 });
    }
    return out;
  },
  armyBuildSupplyFort(){
    const a = this.armySelected(); if(!a) return;
    const out = window.ACKS.buildSupplyBaseFort(this.currentCampaign, a, {});
    if(!out || !out.ok){
      const why = { 'no-army': 'no army', 'no-hex': 'the army has no location', 'cannot-pay': "the leader can't pay 10,000gp", 'no-factory': 'engine error' }[out && out.reason] || (out && out.reason) || 'unknown';
      this.showToast('🏰 Cannot build a fort — ' + why + '.');
      return;
    }
    this.markDirty(); this.schedulePersist();
    this.showToast('🏰 ' + (a.name || 'The army') + ' built a border fort — a Class VI forward supply base (10,000gp, RR p.451).');
  },
  armyMarketSourceText(){
    const a = this.armySelected(); if(!a) return 'the supply train';
    const A = window.ACKS, troops = (typeof A.armyTroopCount === 'function') ? A.armyTroopCount(this.currentCampaign, a) : 0;
    const baggage = (typeof A.armyMarketClassForSize === 'function') ? A.armyMarketClassForSize(troops) : null;
    return baggage ? 'the baggage train' : 'a border fort';
  },
  armyToggleSupplyBase(domainId){
    const a = this.armySelected(); if(!a) return;
    const cur = Array.isArray(a.supplyBaseIds) ? a.supplyBaseIds.slice() : [];
    const i = cur.indexOf(domainId); if(i >= 0) cur.splice(i, 1); else cur.push(domainId);
    this.commitStatEdit({ entityType: 'army', entityId: a.id, entity: a, fieldPath: 'supplyBaseIds', label: 'Supply bases', oldValue: a.supplyBaseIds || [], newValue: cur, suppressFromCampaignLog: true });
  },
  armyRequisitionTarget(){
    const a = this.armySelected(); if(!a || !a.currentHexId) return null;
    const hex = ((this.currentCampaign && this.currentCampaign.hexes) || []).find(h => h && h.id === a.currentHexId);
    if(!hex || !hex.domainId) return null;
    const d = (this.domains || []).find(x => x && x.id === hex.domainId);
    const fam = (d && d.demographics && d.demographics.peasantFamilies) || 0;
    return (d && fam > 0) ? d : null;
  },
  armyRequisition(allowLoot){
    const a = this.armySelected(); if(!a) return;
    const out = window.ACKS.requisitionSupplies(this.currentCampaign, { armyId: a.id, allowLoot: !!allowLoot });
    if(!out.ok){
      const why = { 'no-army': 'no army', 'no-domain': 'no domain here', 'no-peasants': 'no peasants here', 'already-requisitioned-this-year': 'already requisitioned here this year — loot instead', 'nothing-available': 'nothing left to take' }[out.reason] || out.reason;
      this.showToast('📦 Cannot — ' + why + '.');
      return;
    }
    const bits = [];
    if(out.requisitionedGp) bits.push(out.requisitionedGp.toLocaleString() + 'gp requisitioned');
    if(out.lootedGp) bits.push(out.lootedGp.toLocaleString() + 'gp looted (' + out.familiesLost + ' families lost)');
    this.showToast('📦 ' + (a.name || 'The army') + ' feeds off the land: ' + (bits.join(', ') || 'nothing') + '.');
    this.persistSession && this.persistSession();
  },
  armyIntelRows(){
    const a = this.armySelected(); if(!a) return [];
    const camp = this.currentCampaign;
    const reports = (a.intelReports || []);
    // newest first; the latest per opposing army leads, older reports collapse away
    const out = [], seen = {};
    for(let i = reports.length - 1; i >= 0; i--){
      const rep = reports[i]; if(!rep) continue;
      const hasPrisoner = rep.prisoner && rep.prisoner.revealedPieceIdxs.length < rep.prisoner.pieces.length;
      if(seen[rep.opposingArmyId] && !hasPrisoner) continue;   // older + nothing left to interrogate
      seen[rep.opposingArmyId] = true;
      const opp = (camp.armies || []).find(x => x && x.id === rep.opposingArmyId) || null;
      out.push({
        index: i, report: rep,
        opposingName: opp ? (opp.name || opp.id) : (rep.opposingArmyId || 'an army'),
        ageDays: Math.max(0, (window.ACKS.worldOrd(camp) - (rep.atOrd || 0)))
      });
      if(out.length >= 8) break;
    }
    return out;
  },
  armyIntelSummary(rep){
    const r = rep && rep.revealed; if(!r) return '';
    const bits = ['location: ' + r.locationPrecision + (r.locationHexId ? (' (' + this.hexLabelById(r.locationHexId) + ')') : '')];
    if(r.sizeBand) bits.push(r.sizeBand);
    if(r.direction) bits.push('marching ' + r.direction);
    if(r.divisions != null) bits.push(r.divisions + ' division' + (r.divisions === 1 ? '' : 's'));
    if(r.unitsPerDivision) bits.push('units/division: ' + r.unitsPerDivision.join('/') + (r.unitScale ? (' (' + r.unitScale + '-scale)') : ''));
    if(r.unitTypes) bits.push('types: ' + r.unitTypes.join(', '));
    if(r.unitStrengths) bits.push('strengths: ' + r.unitStrengths.map(u => u.name + ' ' + u.troops).join(', '));
    return bits.join(' · ');
  },
  armyRevealedPieces(rep){
    if(!rep || !rep.prisoner) return [];
    return rep.prisoner.revealedPieceIdxs.map(i => { const p = rep.prisoner.pieces[i]; return p ? p.text : null; }).filter(Boolean);
  },
  armyInterrogate(reportIndex){
    const a = this.armySelected(); if(!a) return;
    const gmRaw = prompt('Interrogation (RR p.457): 2d6 + the interrogator’s CHA. GM modifier for proficiencies / bribes (e.g. +3 for a month’s pay)?', '0');
    if(gmRaw === null) return;
    const out = window.ACKS.interrogatePrisoner(this.currentCampaign, {
      armyId: a.id, reportIndex, interrogatorCharacterId: a.leaderCharacterId || null, gmMod: parseInt(gmRaw, 10) || 0
    });
    if(!out.ok){ this.showToast('🗣 No prisoner to interrogate.'); return; }
    if(out.result === 'false') this.showToast('🗣 Rolled ' + out.total + ' → FALSE information — invent a plausible lie for the players (RR p.457).');
    else if(out.revealedPieces.length === 0) this.showToast('🗣 Rolled ' + out.total + ' → ' + out.resultLabel + ' — the prisoner gives nothing new.');
    else this.showToast('🗣 Rolled ' + out.total + ' → ' + out.resultLabel + ': ' + out.revealedPieces.length + ' piece' + (out.revealedPieces.length === 1 ? '' : 's') + ' revealed below.');
    this.persistSession && this.persistSession();
  },
  armyWarfare(){
    const a = this.armySelected(); if(!a || !a.currentHexId) return null;
    const camp = this.currentCampaign, A = window.ACKS;
    const hex = (camp.hexes || []).find(h => h && h.id === a.currentHexId);
    if(!hex || !hex.domainId) return null;
    const domain = (this.domains || []).find(d => d && d.id === hex.domainId);
    if(!domain) return null;
    const friendly = A.domainFriendlyToArmy(camp, domain, a);
    const conquered = !!(a.leaderCharacterId && domain.rulerCharacterId === a.leaderCharacterId && !domain.occupiedBy);
    const occupation = friendly ? null : A.domainOccupationStatus(camp, domain);
    const elig = (domain.occupiedBy && a.leaderCharacterId) ? A.conquestEligibility(camp, domain.id, a.leaderCharacterId) : { ok: false, reason: null };
    const reasonText = { 'defenders-hold-strongholds': 'defenders still hold the strongholds — break the garrison first', 'occupied-by-another': 'another leader holds the occupation', 'not-occupied': 'occupy it first (the wages math, RR p.458)' }[elig.reason] || null;
    return {
      domain, friendly, conquered,
      invaded: !!((a.invasions || {})[domain.id]),
      occupation,
      occupiedByLeader: !!(domain.occupiedBy && domain.occupiedBy.leaderCharacterId === a.leaderCharacterId),
      conquestOk: elig.ok, conquestReason: reasonText,
      garrisonUnits: A.unitsStationedAt(camp, { kind: 'domain-garrison', id: domain.id }).filter(u => u && Math.max(0, (u.count || 0) - (u.casualties || 0)) > 0).length,
      pillageReq: A.pillageRequirementRow(A.totalFamilies(domain))
    };
  },
  armyOccupationMathLine(){
    const w = this.armyWarfare();
    const o = w && !w.friendly && w.occupation;
    if(!o || !(o.peasantFamilies > 0)) return '';
    return 'Occupation math: ' + o.occupyingWages.toLocaleString() + 'gp of occupying wages − ' + o.defendingWages.toLocaleString() + 'gp defending = ' + o.netPerFamily.toFixed(1) + 'gp/family vs the ' + o.threshold + 'gp garrison cost → ' + (o.occupied ? 'OCCUPIED' : 'not occupied') + ' (RR p.458)';
  },
  // Null-safe display lines for the two <template x-if> blocks whose inner bindings
  // could deref a null during Alpine's x-if teardown (the W3 pursuit-panel lesson).
  armyMarchingLine(){
    const j = this.armySelJourney();
    if(!j || j.status !== 'in-transit') return '';
    return 'day ' + (j.currentDayIndex || 0) + ' toward ' + this.hexLabelById(j.destinationHexId) + ', ' + (j.pace || 'normal') + ' pace';
  },
  armyPillageLine(){
    const a = this.armySelected(); const w = this.armyWarfare();
    if(!a || !a.pillage) return '';
    return (a.pillage.saltTheEarth ? 'Salting the earth of ' : 'Pillaging ') + ((w && w.domain.name) || 'the domain') + ' — day ' + this.armyPillageElapsed() + ' of ' + a.pillage.daysRequired + ' (the Day Clock completes it)';
  },
  armyConquerDirect(){
    const a = this.armySelected(); const w = this.armyWarfare(); if(!a || !w) return;
    if(!confirm('Conquer ' + (w.domain.name || 'the domain') + ' and rule it directly? The old fealty is severed; the conqueror becomes its ruler (RR p.458).')) return;
    const r = window.ACKS.conquerDomain(this.currentCampaign, w.domain.id, { leaderCharacterId: a.leaderCharacterId, mode: 'rule-directly', armyId: a.id });
    this.showToast(r.ok ? ('⚑ ' + (w.domain.name || 'The domain') + ' is conquered — its ruler now ' + (this.currentCampaign.characters.find(c => c.id === r.newRulerId) || {}).name + '.') : ('⚑ Conquest refused — ' + r.reason));
    if(r.ok && this.persistSession) this.persistSession();
  },
  armyConquerVassal(){
    const a = this.armySelected(); const w = this.armyWarfare(); if(!a || !w) return;
    const candidates = (this.currentCampaign.characters || []).filter(c => c && c.id !== a.leaderCharacterId && (window.ACKS.isActive ? window.ACKS.isActive(c) : true));
    const list = candidates.slice(0, 30).map((c, i) => (i + 1) + ') ' + c.name).join('\n');
    const pick = prompt('Grant ' + (w.domain.name || 'the domain') + ' to which vassal? (RR p.458)\n' + list, '1');
    if(pick === null) return;
    const ch = candidates[(parseInt(pick, 10) || 0) - 1];
    if(!ch){ this.showToast('⚑ No such candidate.'); return; }
    const r = window.ACKS.conquerDomain(this.currentCampaign, w.domain.id, { leaderCharacterId: a.leaderCharacterId, mode: 'grant-to-vassal', newRulerCharacterId: ch.id, armyId: a.id });
    this.showToast(r.ok ? ('⚑ ' + (w.domain.name || 'The domain') + ' granted to ' + ch.name + ' as a vassal of the conqueror.') : ('⚑ Conquest refused — ' + r.reason));
    if(r.ok && this.persistSession) this.persistSession();
  },
  armyPillageGo(salt){
    const a = this.armySelected(); const w = this.armyWarfare(); if(!a || !w) return;
    if(!confirm((salt ? 'SALT THE EARTH of ' : 'Pillage ') + (w.domain.name || 'the domain') + '? ' + (salt ? 'Four times the time; the domain is destroyed when it ends (RR p.459).' : 'The Day Clock completes it (' + w.pillageReq.timeLabel + ').'))) return;
    const r = window.ACKS.beginPillage(this.currentCampaign, { armyId: a.id, domainId: w.domain.id, saltTheEarth: !!salt });
    if(!r.ok){
      const why = { 'not-conquered': 'conquer the domain first (an unconquered domain is merely looted — W5)', 'not-in-domain': 'the army must stand in the domain', 'already-pillaging': 'it is already pillaging', 'still-marching': 'halt the march first', 'nothing-left': 'nothing remains to take' }[r.reason] || r.reason;
      this.showToast('🔥 Cannot pillage — ' + why + '.');
      return;
    }
    this.showToast('🔥 The ' + (salt ? 'destruction' : 'pillage') + ' begins — ' + r.pillage.daysRequired + ' day' + (r.pillage.daysRequired === 1 ? '' : 's') + ' on the Day Clock.');
    this.persistSession && this.persistSession();
  },
  armyPillageElapsed(){
    const a = this.armySelected(); if(!a || !a.pillage) return 0;
    return Math.min(a.pillage.daysRequired, Math.max(1, window.ACKS.worldOrd(this.currentCampaign) - a.pillage.startedOrd + 1));
  },
  armyPillageCutShort(){
    const a = this.armySelected(); if(!a || !a.pillage) return;
    const elapsed = this.armyPillageElapsed();
    if(!confirm('Cut the pillage short after ' + elapsed + ' of ' + a.pillage.daysRequired + ' days? The yield scales to the time spent (RR p.459).')) return;
    const r = window.ACKS.resolvePillage(this.currentCampaign, a.id, { timeRatio: elapsed / a.pillage.daysRequired });
    if(r.ok) this.showToast('🔥 ' + r.results.gold.toLocaleString() + 'gp plundered, ' + r.results.prisoners + ' prisoners, ' + r.results.familiesLost + ' families lost.');
    this.persistSession && this.persistSession();
  },
  armyRansomGo(){
    const a = this.armySelected(); if(!a || !(a.prisoners > 0)) return;
    const raw = prompt('Ransom how many of the ' + a.prisoners + ' prisoners at 40gp a head (RR p.458)?', String(a.prisoners));
    if(raw === null) return;
    const r = window.ACKS.ransomPrisoners(this.currentCampaign, { armyId: a.id, count: parseInt(raw, 10) || 0 });
    this.showToast(r.ok ? ('💰 ' + r.count + ' prisoners ransomed for ' + r.gp.toLocaleString() + 'gp (spoils XP to the leader).') : '💰 No prisoners ransomed.');
    if(r.ok && this.persistSession) this.persistSession();
  },
  armyBattleGarrison(){
    const a = this.armySelected(); const w = this.armyWarfare(); if(!a || !w) return;
    this.openBattleWizard({
      hexId: a.currentHexId || '',
      sourceA: 'army:' + a.id, sourceB: 'garrison:' + w.domain.id,
      stanceA: 'offensive', stanceB: 'defensive', awareness: 'mutual', scoped: true
    });
  },
  // Start a battle from the Army view: side A = this army, hex = where it stands, and the
  // launcher leads with whatever forces stand on the SAME hex as the foe to pick.
  armyStartBattle(){
    const a = this.armySelected(); if(!a) return;
    const hexId = a.currentHexId || '';
    const targets = this.battleTargetsAtHex(hexId, a.id);
    const prefill = { hexId, sourceA: 'army:' + a.id, stanceA: 'offensive', stanceB: 'defensive', awareness: 'mutual', scale: 'company', asymmetry: false, scoped: true };   // the army starts the fight → the aggressor seeks battle (the GM can change stances in the launcher); scoped: Side A + hex fixed, Side B = foes at this hex
    if(targets.length === 1){ prefill.sourceB = targets[0].key; if(String(targets[0].key).startsWith('group:')) prefill.asymmetry = true; }   // a lone band foe → asymmetry on (RR p.464)
    this.openBattleWizard(prefill);
    if(targets.length === 0 && hexId){ const h = (this.currentCampaign.hexes||[]).find(x => x && x.id === hexId); this.showToast('No other force stands at ' + (window.ACKS.hexName ? hexLabelFor(h||{id:hexId}) : hexId) + ' — pick a target in the launcher, or march the army to the enemy first.'); }
  },
  battlePanel(){ return window.ACKS.findBattle(this.currentCampaign, this.battlePanelId) || null; },
  battleSituationLabel(b){ const s = b && window.ACKS.STRATEGIC_SITUATIONS[b.situation]; return s ? s.label : (b ? b.situation : ''); },
  battleHexLabel(b){
    const h = b && b.hexId ? ((this.currentCampaign && this.currentCampaign.hexes) || []).find(x => x && x.id === b.hexId) : null;
    return h ? (window.ACKS.hexName ? hexLabelFor(h) : h.id) : (b && b.hexId) || '—';
  },
  battleSummary(sk){ const b = this.battlePanel(); return b ? window.ACKS.battleSideSummary(b, sk) : { label:'', active:0, lost:0, br:0, breakPoint:0 }; },
  battleZoneUnits(sk, zone){
    const b = this.battlePanel(); if(!b) return [];
    return b.sides[sk].units.filter(u => u.zone === zone && u.status === 'active');
  },
  battleUnitFlags(u){
    const f = [];
    if(u.missile) f.push('M'); if(u.loose) f.push('L');
    if(u.wavering) f.push('〰 wavering'); if(u.disordered) f.push('✱ disordered');
    return f.join(' · ');
  },
  battleRosterStatus(u){
    if(u.status === 'destroyed') return u.eliminatedByPursuit ? 'destroyed (pursuit)' : 'destroyed';
    if(u.status === 'routed') return 'routed';
    const bits = [u.zone];
    if(u.wavering) bits.push('wavering'); if(u.disordered) bits.push('disordered');
    return bits.join(' · ');
  },
  battleCharName(id){
    const c = id ? ((this.currentCampaign && this.currentCampaign.characters) || []).find(x => x && x.id === id) : null;
    return c ? c.name : (id || '—');
  },
  // ── the new-battle launcher ──
  battleSourceOptions(){
    const camp = this.currentCampaign; if(!camp) return [];
    const A = window.ACKS; const out = [];
    for(const a of (camp.armies || [])) out.push({ key: 'army:' + a.id, label: '🎖 ' + (a.name || a.id) + ' (' + A.armyUnits(camp, a).length + ' units)' });
    for(const d of (this.domains || [])){
      const n = A.unitsStationedAt(camp, { kind: 'domain-garrison', id: d.id }).length;
      if(n > 0) out.push({ key: 'garrison:' + d.id, label: '🛡 ' + (d.name || d.id) + ' garrison (' + n + ' units)' });
    }
    for(const g of (camp.groups || [])){
      const active = Math.max(0, (g.count || 0) - (g.casualties || 0));
      if(active > 0) out.push({ key: 'group:' + g.id, label: '🐉 ' + (g.name || (g.groupTemplate && g.groupTemplate.monsterCatalogKey) || g.id) + ' (' + active + ')' });
    }
    return out;
  },
  // The battle sources PRESENT at a hex — for the army-view "Start a battle" target picker:
  // other armies standing here, the holding domain's garrison, and any monster / incursion
  // bands here. Same {key,label} shape as battleSourceOptions (a hex-scoped subset).
  battleTargetsAtHex(hexId, excludeArmyId){
    const camp = this.currentCampaign; if(!camp || !hexId) return [];
    const A = window.ACKS; const out = [];
    const armiesHere = A.armiesAtHex ? A.armiesAtHex(camp, hexId) : (camp.armies || []).filter(x => x && x.currentHexId === hexId);
    for(const a of armiesHere){ if(a.id === excludeArmyId) continue; out.push({ key: 'army:' + a.id, label: '🎖 ' + (a.name || a.id) + ' (' + A.armyUnits(camp, a).length + ' units)' }); }
    const hex = (camp.hexes || []).find(h => h && h.id === hexId);
    const domId = hex && hex.domainId;
    if(domId){
      const dom = (this.domains || []).find(d => d && d.id === domId) || (camp.domains || []).find(d => d && d.id === domId);
      const n = A.unitsStationedAt(camp, { kind: 'domain-garrison', id: domId }).length;
      if(n > 0) out.push({ key: 'garrison:' + domId, label: '🛡 ' + ((dom && dom.name) || domId) + ' garrison (' + n + ' units)' });
    }
    const bandsHere = A.groupsAtHex ? A.groupsAtHex(camp, hexId) : (camp.groups || []).filter(x => x && x.currentHexId === hexId);
    for(const g of bandsHere){ const active = Math.max(0, (g.count || 0) - (g.casualties || 0)); if(active > 0) out.push({ key: 'group:' + g.id, label: '🐉 ' + (g.name || (g.groupTemplate && g.groupTemplate.monsterCatalogKey) || g.id) + ' (' + active + ')' }); }
    return out;
  },
  _battleSourceArmyId(key){ return (key && String(key).startsWith('army:')) ? String(key).split(':')[1] : null; },
  battleHexNameFor(hexId){ const h = hexId && (this.currentCampaign?.hexes || []).find(x => x && x.id === hexId); return h ? (window.ACKS.hexName ? hexLabelFor(h) : h.id) : (hexId || 'the field'); },
  // The fixed display label for a side source key (army:/garrison:/group:) — used by the
  // scoped launcher to show Side A as auto-populated text instead of a dropdown.
  battleSideLabel(key){
    if(!key) return '—'; const camp = this.currentCampaign; if(!camp) return key; const A = window.ACKS;
    const i = String(key).indexOf(':'); const kind = String(key).slice(0, i); const id = String(key).slice(i + 1);
    if(kind === 'army'){ const a = (camp.armies || []).find(x => x && x.id === id); return '🎖 ' + ((a && a.name) || id) + (a ? ' (' + A.armyUnits(camp, a).length + ' units)' : ''); }
    if(kind === 'garrison'){ const d = (this.domains || []).find(x => x && x.id === id) || (camp.domains || []).find(x => x && x.id === id); const n = A.unitsStationedAt(camp, { kind: 'domain-garrison', id }).length; return '🛡 ' + ((d && d.name) || id) + ' garrison (' + n + ' units)'; }
    if(kind === 'group'){ const g = (camp.groups || []).find(x => x && x.id === id); const active = g ? Math.max(0, (g.count || 0) - (g.casualties || 0)) : 0; return '🐉 ' + ((g && g.name) || (g && g.groupTemplate && g.groupTemplate.monsterCatalogKey) || id) + ' (' + active + ')'; }
    return key;
  },
  battleWizardSituation(){
    const w = this.battleWizard; if(!w) return null;
    return window.ACKS.resolveStrategicSituation(w.awareness, w.stanceA, w.stanceB);
  },
  _battleSideSpec(key, stance){
    if(!key) return null;
    const [kind, id] = String(key).split(':');
    if(kind === 'army') return { kind: 'army', armyId: id, stance };
    if(kind === 'garrison') return { kind: 'garrison', domainId: id, stance };
    if(kind === 'group') return { kind: 'groups', groupIds: [id], stance };
    return null;
  },
  battleWizardCreate(){
    const w = this.battleWizard; if(!w) return;
    const sideA = this._battleSideSpec(w.sourceA, w.stanceA);
    const sideB = this._battleSideSpec(w.sourceB, w.stanceB);
    if(!sideA || !sideB){ this.showToast('Pick both sides first.'); return; }
    const sit = this.battleWizardSituation();
    if(sit && !sit.battle){ this.showToast('Those stances yield No Battle — the armies pass each other by (RR p.461).'); return; }
    const b = window.ACKS.createBattle(this.currentCampaign, {
      name: (w.name || '').trim() || undefined,
      hexId: w.hexId || null, scale: w.scale, awareness: w.awareness,
      sideA, sideB,
      options: { armySizeAsymmetry: !!w.asymmetry, advantageousTerrain: w.advantageousTerrain || null, cannotRetreat: null }
    });
    if(!b || b.noBattle){ this.showToast('Could not create the battle — check the sides.'); return; }
    this.battleWizard = null;
    this.openBattlePanel(b.id);
    this.showToast('🎌 ' + b.name + ' — deploy in the panel, then ⚔ Begin the battle.');
  },
  // ── setup-stage actions ──
  battleAutoDeploy(){ const b = this.battlePanel(); if(b) window.ACKS.autoDeployBattle(this.currentCampaign, b.id); },
  battleBegin(){
    const b = this.battlePanel(); if(!b) return;
    window.ACKS.beginBattle(this.currentCampaign, b.id);
    this.showToast('⚔ ' + b.name + ' is joined — fight it one battle turn at a time.');
  },
  battleDiscard(){
    const b = this.battlePanel(); if(!b || b.status !== 'setup') return;
    if(!confirm('Discard this battle setup? Nothing has been fought.')) return;
    const arr = this.currentCampaign.battles;
    const i = arr.findIndex(x => x && x.id === b.id);
    if(i >= 0) arr.splice(i, 1);
    this.closeBattlePanel();
  },
  // ── fighting-stage actions ──
  battleRunTurn(){
    const b = this.battlePanel(); if(!b) return;
    try {
      window.ACKS.runBattleTurn(this.currentCampaign, b.id);
      if(b.status === 'ended') this.showToast('🏳 The battle is over — ' + (b.result && b.result.winner ? b.sides[b.result.winner].label + ' holds the field.' : 'no victor.'));
    } catch(e){ this.showToast('⚠ ' + e.message, 6000); }
  },
  battleRevertTurn(){ const b = this.battlePanel(); if(b) window.ACKS.revertBattleTurn(this.currentCampaign, b.id); },
  battleWithdraw(sk){
    const b = this.battlePanel(); if(!b) return;
    if(!confirm(b.sides[sk].label + ' withdraws from the field? The battle ends — they are the defeated side for the aftermath.')) return;
    window.ACKS.withdrawBattleSide(this.currentCampaign, b.id, sk);
  },
  battleLatestTurn(){ const b = this.battlePanel(); return b && b.turnLog.length ? b.turnLog[b.turnLog.length - 1] : null; },
  // ── forays ──
  battleForayStakes(){ return window.ACKS.FORAY_STAKES || []; },
  battleOpenForayDraft(){
    const b = this.battlePanel(); if(!b) return;
    this.battleForayDraft = { side: 'a', zonePairIndex: 0, phaseKind: 'melee', heroes: [{ characterId: '', stake: 1 }] };
  },
  battleForayAddHero(){ if(this.battleForayDraft) this.battleForayDraft.heroes.push({ characterId: '', stake: 1 }); },
  battleForaySubmit(){
    const b = this.battlePanel(); const d = this.battleForayDraft;
    if(!b || !d) return;
    const heroes = d.heroes.filter(h => h.characterId).map(h => ({ characterId: h.characterId, stake: Number(h.stake) || 0 }));
    if(!heroes.length){ this.showToast('Pick at least one hero.'); return; }
    const f = window.ACKS.declareForay(this.currentCampaign, b.id, {
      side: d.side, zonePairIndex: Number(d.zonePairIndex), phaseKind: d.phaseKind, heroes
    });
    if(!f){ this.showToast('Could not frame the foray.'); return; }
    if(f.error){ this.showToast('⚠ ' + f.error, 5000); return; }
    this.battleForayDraft = null;
    this.battleForayOutcome[f.id] = { allFoesDefeated: false, theirBrLost: 0, ourBrLost: 0 };
  },
  battleUpcomingForays(){
    const b = this.battlePanel(); if(!b) return [];
    return (b.forays || []).filter(f => f.turnNumber === b.turnNumber + 1);
  },
  battleForayResolve(forayId){
    const b = this.battlePanel(); if(!b) return;
    const o = this.battleForayOutcome[forayId] || {};
    window.ACKS.resolveForay(this.currentCampaign, b.id, forayId, {
      allFoesDefeated: !!o.allFoesDefeated,
      theirBrLost: Number(o.theirBrLost) || 0,
      ourBrLost: Number(o.ourBrLost) || 0
    });
  },
  battleCancelForay(forayId){ const b = this.battlePanel(); if(b) window.ACKS.cancelForay(this.currentCampaign, b.id, forayId); },
  battleHeroPickList(){
    return ((this.currentCampaign && this.currentCampaign.characters) || [])
      .filter(c => c && (!window.ACKS.isActive || window.ACKS.isActive(c)));
  },
  // ── hero-units ──
  battleOpenHeroDraft(sk){ this.battleHeroDraft = { side: sk, characterId: '', arcaneCaster: false, zone: 'reserve' }; },
  battleHeroDraftInfo(){
    const d = this.battleHeroDraft; const b = this.battlePanel();
    if(!d || !d.characterId || !b) return null;
    const ch = ((this.currentCampaign && this.currentCampaign.characters) || []).find(c => c && c.id === d.characterId);
    if(!ch) return null;
    const q = window.ACKS.qualifiesAsBattleHero(this.currentCampaign, ch, b.scale);
    const br = window.ACKS.heroBattleUnitBr(this.currentCampaign, ch, { scale: b.scale, arcaneCaster: d.arcaneCaster });
    return { qualifies: q.qualifies, reason: q.reason, br };
  },
  battleHeroSubmit(){
    const d = this.battleHeroDraft; const b = this.battlePanel();
    if(!d || !d.characterId || !b) return;
    const bu = window.ACKS.addHeroToBattle(this.currentCampaign, b.id, d.side, {
      characterId: d.characterId, arcaneCaster: d.arcaneCaster, zone: d.zone
    });
    if(bu){ this.battleHeroDraft = null; this.showToast('🛡 ' + bu.label + ' takes the field as a heroic unit (BR ' + bu.br + ').'); }
  },
  // ── aftermath ──
  battleResolveAftermath(){
    const b = this.battlePanel(); if(!b || b.status !== 'ended') return;
    if(!b.result || !b.result.winner){ this.showToast('No victor — the aftermath is the GM\'s narration.'); return; }
    if(!b.aftermath) window.ACKS.computeBattleAftermath(this.currentCampaign, b.id);
  },
  battleOfficerOutcomes(){ return window.ACKS.OFFICER_CASUALTY_OUTCOMES || []; },
  battleSetOfficer(charId, key){
    const b = this.battlePanel(); if(!b) return;
    window.ACKS.setOfficerOutcome(this.currentCampaign, b.id, charId, key);
  },
  battleApplyAftermath(){
    const b = this.battlePanel(); if(!b) return;
    try {
      window.ACKS.applyBattleAftermath(this.currentCampaign, b.id);
      this.showToast('⚖ Aftermath applied — casualties, the officers\' Mortal Wounds (or death), spoils, and XP are recorded in the world.');
    } catch(e){ this.showToast('⚠ ' + e.message, 6000); }
  },
  unitSelectedId: null,
  unitRows(){ const c = this.currentCampaign; if(!c) return []; return (window.ACKS.looseUnits(c) || []).map(u => this._groupRow(u)); },
  // A loose unit's station label: marching to an army, a domain garrison, a company, a hex.
  unitStationLabel(u){
    if(!u) return '—';
    if(u.musterState && u.musterState.destination){ const dest = u.musterState.destination; if(dest.kind === 'army'){ const a = window.ACKS.findArmy(this.currentCampaign, dest.id); return '🚶 mustering to ' + (a ? (a.name || 'an army') : 'an army'); } return '🚶 mustering to ' + this.journeyHexLabel(dest.id); }
    const st = u.stationedAt;
    if(!st) return 'unassigned';
    if(st.kind === 'domain-garrison'){ const d = (this.currentCampaign?.domains||[]).find(x => x && x.id === st.id); return 'garrisoning · ' + (d ? (d.name || d.id) : st.id); }
    if(st.kind === 'character'){ const c = (this.currentCampaign?.characters||[]).find(x => x && x.id === st.id); return 'company · ' + (c ? (c.name || c.id) : st.id); }
    if(st.kind === 'hex') return 'at ' + this.journeyHexLabel(st.id);
    if(st.kind === 'army') return 'in an army';
    return st.kind;
  },
  // An army's units with per-unit soldiers / BR / load-pace ("encumbrance") / supply. The
  // slowest unit (the army's pace bottleneck — its "encumbrance") is highlighted.
  armyUnitRows(army){
    if(!army || !this.currentCampaign) return [];
    const c = this.currentCampaign;
    const rows = (window.ACKS.armyUnits(c, army) || []).map(u => {
      const soldiers = Math.max(0, (u.count||0) - (u.casualties||0));
      const br = window.ACKS.unitBattleRating ? window.ACKS.unitBattleRating(c, u) : 0;
      const tr = window.ACKS.unitTroopRow ? window.ACKS.unitTroopRow(u) : null;
      const mpd = window.ACKS.unitMarchMilesPerDay ? window.ACKS.unitMarchMilesPerDay(u) : null;
      const encLabel = (tr && tr.category ? (tr.category + ' · ') : '') + (mpd != null ? (mpd + ' mi/day') : '—');
      return { unit: u, soldiers, br, mpd, encLabel, encColor: '#5a4632' };
    });
    const speeds = rows.map(r => r.mpd).filter(s => s != null);
    const minSpeed = speeds.length ? Math.min.apply(null, speeds) : null;
    if(minSpeed != null && rows.length > 1) rows.forEach(r => { if(r.mpd === minSpeed) r.encColor = '#b45309'; });
    return rows;
  },
  // March destination picker — choose the hex on the map, then return to the army detail.
  armyMarchPickDest(){
    const army = this.armySelected && this.armySelected();
    if(!army) return;
    const armyId = army.id;
    this.mapBeginSelect((hexId) => {
      this.armyMarchDest = hexId || '';
      this.currentView = 'roster'; this.rosterSubView = 'groups';
      this.selectGroup('army', armyId);
    }, 'Click the destination hex for the march, then ✓ confirm.');
  },
  unitSheetUnitId: null,         // the clickable unit detail/edit modal (null = closed)
  // Phase 3 Military W3 — Review ▸ 🎌 Battles (RR pp.461–472; moved from World ▸ 2026-06-13).
  // The panel follows the encounter modal's visibility-flag convention (id kept set on close —
  // no teardown warnings).
  battlesSearch: '',
  battlePanelOpen: false,
  battlePanelId: null,
  battleWizard: null,            // the new-battle launcher's working object (null = closed)
  battleForayDraft: null,        // the declare-a-foray form (null = closed)
  battleForayOutcome: {},        // per-foray outcome inputs, keyed by foray id
  armyMarchDest: '',
  armyMarchPace: 'normal',
  armyCallUpOpen: false,   // the army card's inline "call up reinforcements" picker
  battleHeroDraft: null,         // the add-hero-unit form (null = closed)
  // ════ TEAM SESSION (burst3 2026-06-13) — per-agent Alpine state props + methods; add yours after YOUR marker (additive, never reorder); Lead removes this block at integration ════
  // ── agent-1 (Military W6 Sieges) state + methods ──
  siegeWizard: null,            // the 🏯 New-siege launcher state
  siegePanelId: null,           // selected siege id (STAYS set so the modal subtree never tears down against null — the W3 modal-teardown lesson)
  siegePanelOpen: false,        // modal visibility (x-show); closing flips this, the id persists
  siegesSearch: '',
  _siegeMatch(s, t){ return !t || (((s.name||'') + ' ' + (s.hexId||'')).toLowerCase().indexOf(t) >= 0); },
  siegeProgressFor(s){ try { return window.ACKS.siegeProgress(this.currentCampaign, s); } catch(e){ return null; } },
  siegeArmyOptions(){ return ((this.currentCampaign && this.currentCampaign.armies) || []).filter(a => a); },
  siegeDefenderOptions(){
    const A = window.ACKS, c = this.currentCampaign;
    return ((c && c.domains) || []).filter(d => d).map(d => ({ id: d.id, name: d.name || d.id, strongholdGp: (A.strongholdValue ? A.strongholdValue(c, d) : 0) || 0 }));
  },
  siegeBesiegerName(s){ const a = window.ACKS.siegeBesiegerArmy(this.currentCampaign, s); return a ? (a.name || a.id) : '—'; },
  siegeDefenderName(s){ const d = window.ACKS.siegeDefenderDomain(this.currentCampaign, s); return d ? (d.name || d.id) : (s && s.defenderArmyId ? 'a defending army' : '—'); },
  siegeHexLabel(s){ const h = ((this.currentCampaign && this.currentCampaign.hexes) || []).find(x => x && x.id === (s && s.hexId)); return h ? (window.ACKS.hexName ? hexLabelFor(h) : h.id) : ((s && s.hexId) || '—'); },
  // The bombarding / bonus-unit siege engines (RR pp.476 + 485) — the modal's compact siege-train editor.
  siegeArtilleryRows(){ return [
    { key:'light-ballista', label:'Light ballista' }, { key:'medium-ballista', label:'Medium ballista' }, { key:'heavy-ballista', label:'Heavy ballista' },
    { key:'light-catapult', label:'Light catapult' }, { key:'medium-catapult', label:'Medium catapult' }, { key:'heavy-catapult', label:'Heavy catapult' },
    { key:'light-trebuchet', label:'Light trebuchet' }, { key:'medium-trebuchet', label:'Medium trebuchet' }, { key:'heavy-trebuchet', label:'Heavy trebuchet' }
  ]; },
  siegeSetArtillery(s, key, val){
    if(!s) return; if(!s.besiegerArtillery || typeof s.besiegerArtillery !== 'object') s.besiegerArtillery = {};
    const n = Math.max(0, parseInt(val, 10) || 0);
    if(n > 0) s.besiegerArtillery[key] = n; else delete s.besiegerArtillery[key];
    this.markDirty(); this.schedulePersist();
  },
  siegeArtilleryBonus(s){ try { return window.ACKS.artilleryBonusUnits((s && s.besiegerArtillery) || {}); } catch(e){ return 0; } },
  siegeWizardPreview(){
    const w = this.siegeWizard; if(!w || !w.besiegerArmyId || !w.defenderDomainId) return null;
    try {
      const A = window.ACKS, c = this.currentCampaign;
      const dom = (c.domains || []).find(d => d && d.id === w.defenderDomainId);
      let shp = parseInt(w.shpOverride, 10) || 0;
      let cap = parseInt(w.unitCapacityOverride, 10) || 0;
      if((shp <= 0 || cap <= 0) && dom){
        const prof = A.strongholdRawProfile(c, dom, w.material);
        if(shp <= 0) shp = prof.shp;
        if(cap <= 0) cap = prof.unitCapacity;
      }
      if(cap <= 0) cap = A.unitCapacityEstimate(shp);
      const tmp = A.blankSiege({ besiegerArmyId: w.besiegerArmyId, defenderDomainId: w.defenderDomainId, stronghold: { material: w.material, strongholdShp: shp, unitCapacity: cap, siteType: w.siteType } });
      const adv = A.siegeUnitAdvantage(c, tmp);
      const dur = A.siegeDurationDays(shp, adv, w.siteType);
      return { shp, cap, advantage: adv, besiegerUnits: A.siegeBesiegerUnitCount(c, tmp), defenderUnits: A.siegeDefenderUnitCount(c, tmp), dur };
    } catch(e){ return null; }
  },
  siegeWizardCreate(){
    const w = this.siegeWizard; if(!w || !w.besiegerArmyId || !w.defenderDomainId) return;
    const A = window.ACKS;
    const spec = { besiegerArmyId: w.besiegerArmyId, defenderDomainId: w.defenderDomainId, material: w.material, siteType: w.siteType, resolutionMode: w.resolutionMode };
    const nm = (w.name || '').trim(); if(nm) spec.name = nm;
    if(parseInt(w.shpOverride, 10) > 0) spec.strongholdShp = parseInt(w.shpOverride, 10);
    if(parseInt(w.unitCapacityOverride, 10) > 0) spec.unitCapacity = parseInt(w.unitCapacityOverride, 10);
    const res = A.startSiege(this.currentCampaign, spec);
    if(!res.ok){ this.showToast('Could not lay siege: ' + res.reason, 4000); return; }
    this.markDirty(); this.schedulePersist();
    this.siegeWizard = null; this.openSiegePanel(res.siege.id);
    this.showToast('🏯 Siege laid: ' + res.siege.name);
  },
  siegePanelProgress(){ const s = this.currentSiege(); return s ? this.siegeProgressFor(s) : null; },
  siegeBlockadeFeet: 0, siegeBlockadeWeeks: 0, siegeBombardDays: 1,
  siegeEstablishBlockade(s){
    if(!s) return;
    const r = window.ACKS.establishBlockade(this.currentCampaign, s.id, { circumvallationFeet: Math.max(0, parseInt(this.siegeBlockadeFeet, 10) || 0), weeksPrep: Math.max(0, parseInt(this.siegeBlockadeWeeks, 10) || 0) });
    if(r.ok){ this.markDirty(); this.schedulePersist(); this.showToast('Blockade established — supply line cut.'); }
    else this.showToast('Could not blockade: ' + r.reason, 4000);
  },
  siegeBombard(s){
    if(!s) return;
    const r = window.ACKS.recordBombardment(this.currentCampaign, s.id, { days: Math.max(1, parseInt(this.siegeBombardDays, 10) || 1) });
    if(r.ok){ this.markDirty(); this.schedulePersist(); this.showToast('🎯 Bombardment — ' + r.breaches + ' breach' + (r.breaches === 1 ? '' : 'es') + (r.reducedToRubble ? '; reduced to rubble' : '') + '.'); }
    else this.showToast(r.reason === 'no-bombardment' ? 'No bombarding artillery assigned — add catapults / trebuchets in the siege train below.' : 'Could not bombard: ' + r.reason, 4500);
  },
  siegeLaunchAssault(s){
    if(!s) return;
    const r = window.ACKS.launchSiegeAssault(this.currentCampaign, s.id);
    if(r.ok){ this.markDirty(); this.schedulePersist(); this.closeSiegePanel(); this.showToast('⚔ Assault joined — resolve it in 🎌 Battles, then capture the stronghold.', 5000); if(this.goToReview) this.goToReview('battles'); }
    else this.showToast('Could not assault: ' + (r.reason === 'no-battle' ? 'the strategic situation yields no battle' : r.reason), 4500);
  },
  siegeResolve(s, outcome){
    if(!s) return;
    const r = window.ACKS.resolveSiege(this.currentCampaign, s.id, { outcome });
    if(r.ok){ this.markDirty(); this.schedulePersist(); this.showToast('🏯 Siege resolved — ' + outcome + '.'); }
    else this.showToast('Could not resolve: ' + r.reason, 4000);
  },
  });
})();
