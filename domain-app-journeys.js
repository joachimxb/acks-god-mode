/* =============================================================================
 * domain-app-journeys.js — ACKS God Mode app mixin: Journeys / travel UI
 * =============================================================================
 *
 * Journeys / travel UI, extracted from domain-app.js (T5 chip 8, 2026-06-23) — pure code-motion: a
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
  // The day's encounter notables (kind journey-encounter) — rendered as their own day-log row with
  // open-the-lair / open-the-hex affordances (the M3 pool-aware encounter's GM surface).
  journeyDayEncounters(d){ return ((d && d.notableEvents) || []).filter(ne => ne && ne.type === 'encounter'); },
  // ─── Phase 2.5 Journeys (#475 — J2) UI state ───────────────────────────────
  // Start Journey is the ACTION verb (this wizard, in the Recruiting-Wizard shape).
  // Inspector › Create is the ADMIN verb (J1 — free-form authoring). journeyDetailId
  // opens the Detail panel; journeyWizard.open shows the wizard; neither ⇒ the lists.
  journeyWizard: { open:false, name:'', participantIds:[], partyId:'', startHexId:'', destinationHexId:'', waypointIds:[], pace:'normal', mode:'foot', rations:0, waterRations:0, shipId:'', propulsion:'auto', continuousSailing:false, origin:null },
  journeyDetailId: null,
  // §26 — transient: the GM ticked "Override" but hasn't set a value yet (armed, null state — no event).
  // Reset whenever the open journey changes; a journey with a committed value reads as overridden on its own.
  journeyOverrideArmed: false,
  journeyShowCompleted: false,

  // Resolve a hex id to a "(q,r) · Settlement" label for Activity descriptors.
  // Reads the canonical top-level campaign.hexes (single-home, T6).
  _journeyHexLabel(hexId){
    if(!hexId) return 'destination';
    const h = window.ACKS.findHex(this.currentCampaign, hexId);
    if(!h) return hexId;
    return hexLabelFor(h) || hexId;   // canonical hex name (Architecture §11.3)
  },
  journeyById(id){ return (this.currentCampaign?.journeys||[]).find(j => j && j.id === id) || null; },
  journeyDetail(){ return this.journeyById(this.journeyDetailId); },
  journeyHexLabel(id){ return this._journeyHexLabel(id); },
  // Label one §24 day-log path step: an authored hex shows its canonical name; an UNauthored coord
  // (hexId null — a grid hex the GM hasn't placed) shows its column·row reference.
  journeyStepLabel(step){
    if(!step) return '?';
    if(step.hexId){ const h=(this.currentCampaign?.hexes||[]).find(x=>x&&x.id===step.hexId); if(h) return hexLabelFor(h) || window.ACKS.hexDisplayLabel(step.q||0, step.r||0); }
    return window.ACKS.hexDisplayLabel(step.q||0, step.r||0);
  },
  // The party's TRUE current position step (Travel pivot) — the last hex actually entered, including an
  // UNAUTHORED coord (a strayed-while-lost hex, or a mid-leg hex on a sparse route) that `currentHexId`
  // can't hold (it can only point at a real authored hex, so it holds at the last authored one — often
  // the origin). Reads the most recent day's last hexPath entry (what the day log marks "📍 here now");
  // null before any day is ticked. The detail header + planning preview show this as "you are here".
  journeyCurrentStep(j){
    const days = (j && j.days) || [];
    for(let i = days.length - 1; i >= 0; i--){
      const p = days[i] && days[i].hexPath;
      if(Array.isArray(p) && p.length) return p[p.length - 1];
    }
    return null;
  },
  journeyCurrentLabel(j){
    if(!j) return '';
    const step = this.journeyCurrentStep(j);
    if(step) return this.journeyStepLabel(step);
    return this.journeyHexLabel(j.currentHexId || j.startHexId);
  },
  // The hexes entered on a given day, for the day-log "via …" line. New day records store `hexPath`
  // directly; OLDER ones (ticked before hexPath shipped, or already-saved journeys) are reconstructed
  // from the live route + the hexes covered on prior days — so every journey shows its path.
  journeyDayPath(j, d, di){
    if(d && Array.isArray(d.hexPath) && d.hexPath.length) return d.hexPath;
    if(!j || !d || !((d.hexesTraveled||0) > 0)) return [];
    let route = []; try { route = window.ACKS.journeyRoute(this.currentCampaign, j) || []; } catch(e){ return []; }
    if(route.length < 2) return [];
    const days = j.days || [];
    let before = 0; for(let k = 0; k < di; k++) before += (days[k] && days[k].hexesTraveled) || 0;
    const out = [];
    for(let i = before + 1; i <= before + (d.hexesTraveled||0) && i < route.length; i++){
      const s = route[i]; if(s && s.coord) out.push({ hexId: s.hexId || null, q: s.coord.q, r: s.coord.r });
    }
    return out;
  },
  journeyParticipantNames(j){
    if(!j) return '';
    const names = (j.participantCharacterIds||[]).map(id => { const c=(this.currentCampaign?.characters||[]).find(x=>x.id===id); return c ? (c.name||'(unnamed)') : id; });
    if(!names.length) return '(no participants)';
    return names.length <= 3 ? names.join(', ') : (names.slice(0,3).join(', ') + ' +' + (names.length-3) + ' more');
  },
  journeyParticipants(j){ return this._charsByIds((j&&j.participantCharacterIds)||[]); },
  journeyMercTotal(j){ return this._mercTotalForChars(this.journeyParticipants(j)); },
  journeyHeadcount(j){ const c=this.journeyParticipants(j); return c.length + this._mercTotalForChars(c); },
  journeyHeadcountLabel(j){ return this._headcountLabel(this.journeyParticipants(j)); },
  journeyWizardHeadcountLabel(){ const chars=this._charsByIds(this.journeyWizard.participantIds); const n=chars.length; if(!n) return '0 selected'; const m=this._mercTotalForChars(chars); let s=n+' selected'; if(m) s+=' · '+m.toLocaleString()+' mercenaries ('+(n+m).toLocaleString()+' total)'; return s; },
  journeyModeIcon(j){
    if(!j) return '🥾';
    if(j.isLost) return '🧭';
    if(j.status==='resting') return '⛺';
    if((j.mode||'').startsWith('voyage-')) return '⛵';
    if((j.mode||'').startsWith('aerial-')) return '🦅';
    return '🥾';
  },
  journeyStatusLabel(j){ if(!j) return ''; return (j.status==='in-transit' && j.isLost) ? 'lost' : j.status; },
  journeyDayLabel(j){
    if(!j) return '';
    const n = (j.currentDayIndex||0); const est = j.daysRemainingEstimate;
    return est ? ('day ' + n + ' of ~' + (n + est)) : ('day ' + n);
  },
  // Provisioning V5 — total tight food/water days a journey can draw on: members' carried rations +
  // water + the party camp stash + (fallback) any legacy abstract pool. The day-tick consumes these.
  journeyTotalFoodDays(j){
    if(!j) return 0;
    let days = 0;
    const chars = (this.currentCampaign && this.currentCampaign.characters) || [];
    (j.participantCharacterIds||[]).forEach(id=>{ const c=chars.find(x=>x&&x.id===id); if(c) days += window.ACKS.rationDaysAvailable(c)||0; });
    const camp = (j.partyId && window.ACKS.partyCampStash) ? window.ACKS.partyCampStash(this.currentCampaign, j.partyId) : null;
    if(camp) days += window.ACKS.rationDaysAvailable(camp)||0;
    days += (j.supplies&&Number(j.supplies.rations))||0;
    return Math.round(days*10)/10;
  },
  journeyTotalWaterDays(j){
    if(!j) return 0;
    let days = 0;
    const chars = (this.currentCampaign && this.currentCampaign.characters) || [];
    (j.participantCharacterIds||[]).forEach(id=>{ const c=chars.find(x=>x&&x.id===id); if(c) days += Number(c.waterDaysCarried)||0; });
    const camp = (j.partyId && window.ACKS.partyCampStash) ? window.ACKS.partyCampStash(this.currentCampaign, j.partyId) : null;
    if(camp) days += Number(camp.waterDaysCarried)||0;
    days += (j.supplies&&Number(j.supplies.waterRations))||0;
    return Math.round(days*10)/10;
  },
  journeySupplyDaysLeft(j){
    const n = Math.max(1, (j?.participantCharacterIds||[]).length);
    return Math.floor(Math.min(this.journeyTotalFoodDays(j), this.journeyTotalWaterDays(j)) / n);
  },
  journeyProvisioningInfo(j){
    if(!j) return { onLifestyle:false, label:'' };
    const members = (j.participantCharacterIds||[]).map(id => (this.currentCampaign?.characters||[]).find(c=>c&&c.id===id)).filter(Boolean);
    return this.groupProvisioningLabel(members, j.currentHexId || j.startHexId);
  },
  // The hex a journey is currently in supplies free water? (greys the forage-water tick — §8.)
  journeyHexSourcesWater(j){
    if(!j || !this.currentCampaign) return false;
    // Resolve from campaign.hexes (the canonical top-level store, which carries the nested .settlement /
    // .riverSides / .hasLake the source test reads) — NOT allHexes(), whose entries are {domainId, hex}
    // WRAPPERS with no top-level .id, so the lookup never matched and every hex read as "no water".
    const id=j.currentHexId||j.startHexId;
    const hx=(this.currentCampaign.hexes||[]).find(h=>h&&h.id===id);
    return hx ? !!window.ACKS.hasFreshSource(this.currentCampaign, hx) : false;
  },
  // Render a navigation throw with its die roll + modifiers + target + result (RR p.275).
  journeyNavDetail(nav){
    if(!nav) return '';
    const bonuses=(nav.bonuses||[]);
    const parts=['🎲 '+nav.rolled];
    bonuses.forEach(b=>parts.push((b.value>=0?'+':'')+b.value+' ('+(b.source||'mod')+')'));
    const total=nav.rolled+bonuses.reduce((s,b)=>s+(b.value||0),0);
    const recovered=nav.result==='success-recovered';
    const ok=nav.result==='success'||recovered||nav.result==='auto-pass-magical';
    let outcome;
    if(recovered) outcome='recovered ✓';
    else if(ok) outcome='success ✓';
    else {
      // §27 (RR p.275): a lost party strays toward a random hex face and doesn't realize it. Surface the
      // stray direction for the GM (the players' characters stay unaware in the fiction).
      const labels = window.ACKS && window.ACKS.HEX_FACE_LABELS;
      const face = (typeof nav.strayHeading==='number' && labels) ? labels[nav.strayHeading] : null;
      outcome='lost ✗'+(face?(' — strays '+face+', unaware'):'')+(nav.naturalOne?' (natural 1)':'');
    }
    return 'nav '+parts.join(' ')+(bonuses.length?(' = '+total):'')+' vs '+nav.target+'+ → '+outcome;
  },
  journeyNavOk(nav){ return !!(nav && (nav.result==='success'||nav.result==='success-recovered'||nav.result==='auto-pass-magical')); },
  // Total + remaining distance in miles (computeJourneyDistance returns 6-mile hexes).
  journeyMiles(j){
    if(!j) return null;
    try {
      const dist = this._journeyWithDomains(() => window.ACKS.computeJourneyDistance(this.currentCampaign, j));
      const mph = window.ACKS.JOURNEY_MILES_PER_HEX || 6;
      return { totalHexes: dist.total||0, coveredHexes: dist.covered||0, remainingHexes: dist.remaining||0,
               totalMiles: (dist.total||0)*mph, coveredMiles: (dist.covered||0)*mph, remainingMiles: (dist.remaining||0)*mph };
    } catch(e){ return null; }
  },
  // Distance preview for the Start-a-Journey planner (Travel pivot) — builds a transient journey from the
  // wizard's start/destination/waypoints and runs the real route+distance engine, so the GM sees the trip
  // length (and a rough day estimate) WHILE planning, before the journey is started. Null until both ends set.
  journeyWizardMiles(){
    const w = this.journeyWizard;
    if(!w || !w.startHexId || !w.destinationHexId) return null;
    const tj = { startHexId: w.startHexId, destinationHexId: w.destinationHexId,
      waypoints: (w.waypointIds||[]).map(id => ({ hexId: id })),
      currentDayIndex: 0, days: [], routeAnchorHexId: null, routeAnchorCoord: null, coveredBaseline: 0 };
    try {
      const dist = this._journeyWithDomains(() => window.ACKS.computeJourneyDistance(this.currentCampaign, tj));
      const mph = window.ACKS.JOURNEY_MILES_PER_HEX || 6;
      const hexes = dist.total || 0;
      return { totalHexes: hexes, totalMiles: hexes * mph };
    } catch(e){ return null; }
  },
  // GM reroll of the latest day — only available when the day carries a pre-state snapshot AND
  // the world clock still stands on it (locks once +1 day / Next month moves past it).
  journeyCanReroll(j){ return !!window.ACKS.journeyLastDayRerollable(this.currentCampaign, j); },
  journeyRerollDay(j){
    if(!j) return;
    const rec = this._journeyWithDomains(() => window.ACKS.rerollJourneyDay(this.currentCampaign, j));
    if(!rec){ this.showToast('Reroll unavailable for this day (it was ticked before this update).', 4000); return; }
    this.markDirty(); this.schedulePersist(); this._refreshPendingDayTick();
    this.showToast('Day ' + (rec.newDayIndex||'') + ' rerolled.');
  },
  // Provisioning — render a day's water-Foraging throw (die + modifiers + target + outcome), like the nav line.
  journeyForageDetail(wf){
    if(!wf || !wf.attempted) return '';
    const parts = ['🥤 forage 🎲 ' + wf.rolled];
    if(wf.bonus) parts.push('+' + wf.bonus + ' (Survival)');
    const total = wf.rolled + (wf.bonus || 0);
    return parts.join(' ') + (wf.bonus ? (' = ' + total) : '') + ' vs ' + wf.target + '+ → ' + (wf.success ? 'water found ✓' : 'no water ✗');
  },
  // GM reroll of JUST the current day's water-foraging throw (leaves movement + navigation untouched).
  // The current day = the journey's latest committed day; the reroll re-resolves it IN PLACE, so the
  // party's conditions update + persist (Joachim 2026-06-05: "it is the current state… the Journey
  // updates location and current conditions"). Locks once the world clock advances past the day.
  journeyRerollForage(j){
    if(!j) return;
    const wf = this._journeyWithDomains(() => window.ACKS.rerollJourneyForage(this.currentCampaign, j));
    if(!wf){ this.showToast('Forage reroll unavailable for this day.', 4000); return; }
    this.markDirty(); this.schedulePersist(); this._refreshPendingDayTick();
    this.showToast('Water-foraging rerolled: ' + (wf.success ? 'water found' : 'no water') + ' (🎲 ' + wf.rolled + (wf.bonus ? ('+' + wf.bonus) : '') + ' vs ' + wf.target + '+).');
  },
  // GM reroll of the latest day's NAVIGATION + movement (fording / encounter / arrival), holding the
  // day's water + food outcome fixed — the mirror of journeyRerollForage. Splits the old whole-day reroll
  // into the two per-row rerolls (Joachim 2026-06-05).
  journeyRerollNav(j){
    if(!j) return;
    const rec = this._journeyWithDomains(() => window.ACKS.rerollJourneyNav(this.currentCampaign, j));
    if(!rec){ this.showToast('Reroll unavailable for this day (it was ticked before this update).', 4000); return; }
    this.markDirty(); this.schedulePersist(); this._refreshPendingDayTick();
    this.showToast('Day ' + (rec.newDayIndex||'') + ' navigation rerolled (water/food held).');
  },
  // Split a committed day's notables (kind/type/text blobs on the day record) between the day log's two
  // rows: 'survival' → the forage row (hunger / dehydration / stores-low / death's-door), everything else
  // ('nav') → the navigation row (lost / fording / encounter / arrival / forced-rest). Old day records
  // (pre-2026-06-05, no .type) fall back to a text test so the routing still works on existing saves.
  journeyDayNotables(d, which){
    const SURV = ['hunger','dehydration','survival-critical','supplies-low'];
    return ((d && d.notableEvents) || []).filter(ne => {
      if(ne && ne.type === 'encounter') return false;   // encounters get their own day-log row (journeyDayEncounters) with open-the-lair affordances
      const isSurv = (ne && ne.type) ? (SURV.indexOf(ne.type) >= 0)
        : /hungr|dehydrat|stores low|death.s door|starv|thirst/i.test((ne && ne.text) || '');
      return which === 'survival' ? isSurv : !isSurv;
    });
  },
  // Domains live on the campaign (single home), so no attach/restore is needed — kept as a thin
  // passthrough so the existing call sites stay unchanged.
  _journeyWithDomains(fn){ return fn(); },
  // ── Pickers ──
  // Individual travellers pickable from the "Add traveller" dropdown: alive, NOT already in a
  // party (party members travel via the Party dropdown above), and not already added. Once a
  // start hex is chosen (directly or by picking the first traveller), only characters AT that
  // hex are offered — a journey sets out from one place. With no start hex yet, all loose
  // characters show so the first pick can establish the departure point.
  journeyParticipantOptions(){
    const chosen = new Set(this.journeyWizard?.participantIds || []);
    const startHex = this.journeyWizard?.startHexId || null;
    return (this.currentCampaign?.characters||[]).filter(c =>
      c && c.alive !== false && !c.partyId && !chosen.has(c.id) &&
      !this.characterIsTravelCommitted(c) &&
      (!startHex || c.currentHexId === startHex));
  },
  journeyParticipantName(id){ const c=(this.currentCampaign?.characters||[]).find(x=>x.id===id); return (c&&c.name)||'(unknown)'; },
  journeyPartyOptions(){ return (this.currentCampaign?.parties||[]).filter(p => p && p.status !== 'disbanded'); },
  journeyHexOptions(){
    const out=[]; const seen=new Set();
    const add = (h)=>{ if(h && h.id && !seen.has(h.id)){ seen.add(h.id); out.push({ id:h.id, label:this._journeyHexLabel(h.id), q:(h.coord?.q??0), r:(h.coord?.r??0) }); } };
    (this.currentCampaign?.hexes||[]).forEach(add);
    return out.sort((a,b)=> a.q-b.q || a.r-b.r);
  },
  // ── Wizard (Action verb) ──
  _journeyResetWizard(){ this.journeyWizard = { open:false, name:'', participantIds:[], partyId:'', startHexId:'', destinationHexId:'', waypointIds:[], pace:'normal', mode:'foot', rations:0, waterRations:0, shipId:'', propulsion:'auto', continuousSailing:false, origin:null }; },
  journeyToggleParticipant(id){ const a=this.journeyWizard.participantIds; const i=a.indexOf(id); if(i>=0)a.splice(i,1); else a.push(id); },
  // Add an individual traveller from the picker + default the start hex to their current location
  // (RAW: a journey sets out from where the traveller is). Only fills the start hex if unset, so a
  // GM-chosen or party-derived start hex isn't clobbered by adding more travellers.
  journeyAddParticipant(id){
    if(!id) return;
    if(!this.journeyWizard.participantIds.includes(id)) this.journeyWizard.participantIds.push(id);
    const c = (this.currentCampaign?.characters||[]).find(x=>x.id===id);
    if(c && c.currentHexId && !this.journeyWizard.startHexId) this.journeyWizard.startHexId = c.currentHexId;
  },
  journeyToggleWaypoint(id){ const a=this.journeyWizard.waypointIds; const i=a.indexOf(id); if(i>=0)a.splice(i,1); else a.push(id); },
  journeyOnPartyChange(){
    const pid = this.journeyWizard.partyId; if(!pid) return;
    const members = (this.currentCampaign?.characters||[]).filter(c => c && c.partyId === pid).map(c=>c.id);
    const set = new Set(this.journeyWizard.participantIds); members.forEach(id => set.add(id));
    this.journeyWizard.participantIds = Array.from(set);
    const pt = (this.currentCampaign?.parties||[]).find(p=>p.id===pid);
    if(pt && pt.currentHexId && !this.journeyWizard.startHexId) this.journeyWizard.startHexId = pt.currentHexId;
  },
  journeyForecast(){
    const w = this.journeyWizard;
    if(!w.startHexId || !w.destinationHexId || w.startHexId===w.destinationHexId) return null;
    try {
      const tmp = { startHexId:w.startHexId, destinationHexId:w.destinationHexId, days:[] };
      const dist = this._journeyWithDomains(() => window.ACKS.computeJourneyDistance(this.currentCampaign, tmp));
      const totalHexes = dist.total||0;
      const estDays = totalHexes>0 ? Math.max(1, Math.ceil(totalHexes/4)) : 0;
      return { totalHexes, estDays, miles: totalHexes * (window.ACKS.JOURNEY_MILES_PER_HEX||6) };
    } catch(e){ return null; }
  },
  // ── Detail ──
  journeyOpenDetail(id){ this.journeyDetailId = id; this.journeyOverrideArmed = false; this.journeyWizard.open = false; this.currentView='activities'; this.activitiesSubView='journeys'; },
  journeyCloseDetail(){ this.journeyDetailId = null; this.journeyOverrideArmed = false; },
  // Complete Movement (Joachim 2026-06-05): resolve THIS journey's travel for the current world day,
  // locally — the party marches its day's leg now, WITHOUT advancing the global clock. Lockstep: at
  // most one leg per world day; the engine skip-guard then makes the next +1 day pass this journey by.
  // (The global Day Clock, top-right, advances the calendar + auto-resolves any party not moved here.)
  journeyCompleteMovement(){
    const j = this.journeyDetail(); if(!j) return;
    if(!this.journeyCanCompleteMovement(j)) return;
    const rec = this._journeyWithDomains(() => window.ACKS.advanceJourneyOneDay(this.currentCampaign, j));
    if(!rec){ this.showToast('Movement unavailable — the journey is not in transit.', 4000); return; }
    this.markDirty(); this.schedulePersist(); this._refreshPendingDayTick();
    this.showToast(j.status === 'arrived'
      ? ('Arrived: ' + (j.name || '(unnamed)'))
      : ('Day ' + (rec.newDayIndex || '') + ' travelled — advance the Day Clock to continue.'));
  },
  // Can this journey complete its movement now? Only when in-transit AND it has not already travelled the
  // current world day (lockstep — one leg per day; a +1 day would resolve nothing more for it today).
  journeyCanCompleteMovement(j){
    if(!j || j.status !== 'in-transit') return false;
    const ord = ((this.currentCampaign.currentTurn || 1) * 30) + ((this.currentCampaign.currentDayInMonth || 1));
    return !(j.lastTravelWorldOrd != null && j.lastTravelWorldOrd >= ord);
  },
  journeyPaceAllowed(j, pace){
    if(!j || pace === 'halted') return true;                         // halting is always possible
    const A = window.ACKS; if(!A || !A.journeyMaxPace) return true;
    const r = this._PACE_RANK_UI;
    const max = A.journeyMaxPace(this.currentCampaign, j).maxPace;
    return (r[pace] != null) && r[pace] <= r[max];
  },
  journeyEffectivePaceUI(j){
    const A = window.ACKS; if(!j) return 'normal';
    return (A && A.journeyEffectivePace) ? A.journeyEffectivePace(this.currentCampaign, j) : (j.pace || 'normal');
  },
  journeyPaceCapText(j){
    const A = window.ACKS; if(!j || !A || !A.journeyMaxPace) return '';
    const info = A.journeyMaxPace(this.currentCampaign, j);
    if(!info || info.maxPace === 'forced-march' || !info.binding) return '';   // uncapped → no text
    const b = info.binding, name = b.name || 'A traveller';
    const label = { 'halted':'Halted', 'half-speed':'Half speed', 'normal':'Normal' }[info.maxPace] || info.maxPace;
    if(b.reason === 'tracking'){
      // E5 — a party following tracks moves at half expedition speed (RR p.120).
      return '🐾 Pace limited to Half speed — the party is following tracks (RR p.120). Give up the trail (the meeting\'s 🐾 panel) to march faster.';
    }
    if(info.maxPace === 'halted'){
      return '⚠ ' + name + '’s day is already full — the party can’t travel today (0 mi). Free some of their activities (e.g. in Current Activities) to move.';
    }
    // A dedicated task (administering, research…) caps the party to half speed; ancillary errands only
    // cost the forced-march option (they leave the dedicated day for normal-pace travel).
    if(b.otherDedicated >= 1){
      return '⚠ Pace limited to ' + label + ' — ' + name + ' is committed to a dedicated task this day (e.g. administering a domain), so the party can’t march at full speed. Untick that activity (in Current Activities) to march faster.';
    }
    return 'ℹ Forced march unavailable — ' + name + ' has errands occupying part of the day (a forced march needs the whole day). Normal pace and below are fine.';
  },
  // §26 — GM speed override. A positive speedOverrideMilesPerDay sets the day's mile budget directly,
  // bypassing pace/weather/temperature (per-hex terrain still applies, §24); the pace value is kept
  // (grayed in the UI) and still drives fatigue. null/absent ⇒ pace governs.
  // The party's current overland speed = its slowest member's encumbrance rate (RR pp.83-84), in mi/day —
  // the base the day-tick multiplies by pace/weather/terrain, and the value the GM override (§26) replaces.
  // Mirrors the engine's journeyBaseSpeedMilesPerDay so the panel shows exactly what a tick will use.
  journeyCurrentSpeed(j){
    if(!j || !window.ACKS || typeof window.ACKS.journeyBaseSpeedMilesPerDay !== 'function') return 0;
    return window.ACKS.journeyBaseSpeedMilesPerDay(this.currentCampaign, j);
  },
  journeyHasSpeedOverride(j){
    return !!j && typeof j.speedOverrideMilesPerDay === 'number' && isFinite(j.speedOverrideMilesPerDay) && j.speedOverrideMilesPerDay > 0;
  },
  // ── Hex card ──
  journeysThroughHex(hexId){
    if(!hexId) return [];
    return (this.currentCampaign?.journeys||[]).filter(j => {
      if(!j || !['in-transit','resting','lost'].includes(j.status)) return false;
      if(j.currentHexId===hexId || j.startHexId===hexId || j.destinationHexId===hexId) return true;
      return (j.waypoints||[]).some(w => w && w.hexId===hexId);
    });
  },
  // §12 — the group (party/army/unit) that owns a journey, so the Journey Detail panel can
  // render group-aware (an army's march shows its units + supplies, not party rations).
  journeyGroupEntity(j){ return j && this.currentCampaign ? window.ACKS.groupForJourney(this.currentCampaign, j) : null; },
  journeyGroupKind(j){ const e = this.journeyGroupEntity(j); return e ? window.ACKS.groupKindOf(e) : null; },
  journeySpeedBasisLabel(j){ const k = this.journeyGroupKind(j); return k==='army' ? "the slowest unit's march pace" : k==='unit' ? "the unit's march pace" : "the slowest member's encumbrance rate"; },
  // Set while the Start-a-Journey wizard's "🗺 choose from map" flow is sending the GM to the Map to
  // pick a destination: holds { pendingHexId } (the hex clicked but not yet confirmed). Built on the
  // map's select seam; confirm/cancel via the on-map bar return to Activities ▸ Journeys.
  _journeyDestPick: null,
  // Set while the wizard's "🗺 choose waypoints from map" flow is active: holds { ids:[...] } — the
  // ORDERED list of waypoint hexes picked so far (click a hex to append, click it again to remove).
  // The map draws a live route preview from this; confirm applies the whole set to journeyWizard.
  _journeyWaypointPick: null,
  // Set while VIEWING/editing a live journey on the map (the "view on map" flow from the Journey Detail):
  // holds the journeyId. An on-map toolbar then offers change-destination / change-waypoints, which re-use
  // the dest/waypoint pickers tagged with this journeyId and write back via reRouteJourney. Transient UI.
  _journeyMapView: null,
  // "🗺 choose from map" for the Start-a-Journey destination (the wizard button). Jumps to the Map in
  // the existing select mode; each hex click sets a PENDING pick (re-clickable to change), which the GM
  // then confirms or cancels on the on-map bar — returning to the still-open wizard either way. The
  // wizard's state (participants, start, supplies) persists across the trip to the map and back.
  journeyPickDestinationOnMap(){
    if(!this.currentCampaign) return;
    if(!(this.currentCampaign.hexes || []).length){ this.showToast('No hexes on the map yet to pick from — add some, or use the dropdown.', 4000); return; }
    this.mapEditAddMode = false; // keep Add/Edit affordances out of the pick
    this._journeyDestPick = { pendingHexId: this.journeyWizard.destinationHexId || null };
    this.mapBeginSelect(hexId => { this._journeyDestPick = { pendingHexId: hexId }; }, 'Click a hex to choose the journey destination, then confirm.');
    this.showToast('Click a destination hex on the map, then "Use this hex" (or Cancel).', 5000);
  },
  journeyDestPickConfirm(){
    const pick = this._journeyDestPick;
    if(!pick || !pick.pendingHexId) return;
    if(pick.journeyId){
      // Editing a LIVE journey — re-route it (mid-journey re-anchor lives in the engine).
      window.ACKS.reRouteJourney(this.currentCampaign, pick.journeyId, { destinationHexId: pick.pendingHexId });
      if(this.markDirty) this.markDirty();
      this.showToast('Destination changed — the journey continues from where it is.', 4000);
    } else {
      this.journeyWizard.destinationHexId = pick.pendingHexId;
    }
    this._journeyDestPickEnd(pick.journeyId);
  },
  journeyDestPickCancel(){ this._journeyDestPickEnd(this._journeyDestPick && this._journeyDestPick.journeyId); },
  // Leave dest select mode. Editing a live journey (journeyId) → stay on the map viewing it; otherwise
  // go back to the still-open Start-a-Journey wizard under Activities ▸ Journeys.
  _journeyDestPickEnd(journeyId){
    this._journeyDestPick = null;
    this.mapEndSelect();
    if(journeyId){ this._journeyMapView = journeyId; this.currentView = 'world'; this.worldSubView = 'map'; }
    else { this.currentView = 'activities'; this.activitiesSubView = 'journeys'; }
    this.schedulePersist();
  },
  _journeyDestPickReturn(){ this._journeyDestPickEnd(this._journeyDestPick && this._journeyDestPick.journeyId); },
  // Abandon an in-flight destination pick when the GM navigates away from the Map mid-pick (wired into
  // the currentView / worldSubView watches) — no commit, just drop the pending pick + leave select mode.
  _journeyDestPickAbandon(){ if(this._journeyDestPick){ this._journeyDestPick = null; this.mapEndSelect(); } },
  // "🗺 choose waypoints from map" — like the destination picker but MULTI-select: each hex click toggles
  // the hex in an ordered pending list (append, or remove if already chosen), and the map redraws the
  // forming route live (mapPlanningRoute). Confirm applies the whole ordered set to journeyWizard.waypointIds.
  journeyPickWaypointsOnMap(){
    if(!this.currentCampaign) return;
    if(!(this.currentCampaign.hexes || []).length){ this.showToast('No hexes on the map yet to pick from — add some, or use the dropdown.', 4000); return; }
    this.mapEditAddMode = false; // keep Add/Edit affordances out of the pick
    this._journeyWaypointPick = { ids: (this.journeyWizard.waypointIds || []).slice() };
    this.mapBeginSelect(hexId => {
      const cur = (this._journeyWaypointPick && this._journeyWaypointPick.ids) || [];
      const next = cur.includes(hexId) ? cur.filter(x => x !== hexId) : cur.concat(hexId);
      this._journeyWaypointPick = Object.assign({}, this._journeyWaypointPick, { ids: next }); // reassign so the SVG preview re-renders (keep journeyId if editing a live journey)
    }, 'Click hexes to add waypoints in order (click one again to remove), then "Use these waypoints".');
    this.showToast('Click waypoint hexes on the map in order (click again to remove), then "Use these waypoints".', 5000);
  },
  journeyWaypointPickConfirm(){
    const pick = this._journeyWaypointPick; if(!pick) return;
    if(pick.journeyId){
      window.ACKS.reRouteJourney(this.currentCampaign, pick.journeyId, { waypointIds: (pick.ids || []).slice() });
      if(this.markDirty) this.markDirty();
      this.showToast('Waypoints updated — the journey continues from where it is.', 4000);
    } else {
      this.journeyWizard.waypointIds = (pick.ids || []).slice();
    }
    this._journeyWaypointPickEnd(pick.journeyId);
  },
  journeyWaypointPickCancel(){ this._journeyWaypointPickEnd(this._journeyWaypointPick && this._journeyWaypointPick.journeyId); },
  journeyWaypointPickClear(){ if(this._journeyWaypointPick) this._journeyWaypointPick = Object.assign({}, this._journeyWaypointPick, { ids: [] }); },
  _journeyWaypointPickEnd(journeyId){
    this._journeyWaypointPick = null;
    this.mapEndSelect();
    if(journeyId){ this._journeyMapView = journeyId; this.currentView = 'world'; this.worldSubView = 'map'; }
    else { this.currentView = 'activities'; this.activitiesSubView = 'journeys'; }
    this.schedulePersist();
  },
  _journeyWaypointPickReturn(){ this._journeyWaypointPickEnd(this._journeyWaypointPick && this._journeyWaypointPick.journeyId); },
  _journeyWaypointPickAbandon(){ if(this._journeyWaypointPick){ this._journeyWaypointPick = null; this.mapEndSelect(); } },
  // ── View / edit a LIVE journey on the map (#225 ↔ §24). "View on map" from the Journey Detail jumps
  // here, draws the journey (the M6 layer) + focuses it; an on-map toolbar then offers change-destination
  // / change-waypoints, each re-using the picker (targeting THIS journey) and writing back through
  // reRouteJourney (the engine mid-journey re-anchor). ──
  journeyViewOnMap(journeyId){
    const j = (this.currentCampaign?.journeys || []).find(x => x && x.id === journeyId);
    if(!j) return;
    this._journeyMapView = journeyId;   // the viewed journey is always drawn (see mapSvgMarkup §4),
    this.mapEditAddMode = false;        // so we DON'T force the Journeys layer on — the GM's toggle stands.
    this.currentView = 'world'; this.worldSubView = 'map';
    this.mapEnsureView();
    this.mapFocusJourney(j);
    this.schedulePersist();
  },
  journeyMapViewDone(){
    const id = this._journeyMapView;
    this._journeyMapView = null;
    this.currentView = 'activities'; this.activitiesSubView = 'journeys';
    if(id) this.journeyDetailId = id; // reopen the detail for the journey we were viewing
    this.schedulePersist();
  },
  journeyEditDestOnMap(){
    const id = this._journeyMapView; if(!id) return;
    const j = (this.currentCampaign?.journeys || []).find(x => x && x.id === id); if(!j) return;
    this.mapEditAddMode = false;
    this._journeyDestPick = { pendingHexId: j.destinationHexId || null, journeyId: id };
    this.mapBeginSelect(hexId => { this._journeyDestPick = { pendingHexId: hexId, journeyId: id }; }, 'Click the NEW destination for ' + (j.name || 'this journey') + ', then confirm.');
    this.showToast('Click the new destination hex, then "Use this hex".', 5000);
  },
  journeyEditWaypointsOnMap(){
    const id = this._journeyMapView; if(!id) return;
    const j = (this.currentCampaign?.journeys || []).find(x => x && x.id === id); if(!j) return;
    this.mapEditAddMode = false;
    this._journeyWaypointPick = { ids: (j.waypoints || []).map(w => w.hexId).filter(Boolean), journeyId: id };
    this.mapBeginSelect(hexId => {
      const cur = (this._journeyWaypointPick && this._journeyWaypointPick.ids) || [];
      const next = cur.includes(hexId) ? cur.filter(x => x !== hexId) : cur.concat(hexId);
      this._journeyWaypointPick = Object.assign({}, this._journeyWaypointPick, { ids: next });
    }, 'Click the remaining waypoints in order (click one again to remove), then "Use these waypoints".');
    this.showToast('Click the journey\'s remaining waypoints in order, then "Use these waypoints".', 5000);
  },
  journeyMapViewName(){ const j = (this.currentCampaign?.journeys || []).find(x => x && x.id === this._journeyMapView); return j ? (j.name || (this.journeyHexLabel(j.startHexId) + ' → ' + this.journeyHexLabel(j.destinationHexId))) : ''; },
  journeyMapViewEditable(){ const j = (this.currentCampaign?.journeys || []).find(x => x && x.id === this._journeyMapView); return !!j && j.status !== 'aborted'; },
  });
})();
