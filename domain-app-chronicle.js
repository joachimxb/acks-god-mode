/* =============================================================================
 * domain-app-chronicle.js — ACKS God Mode app mixin: Chronicle / narrative log UI
 * =============================================================================
 *
 * Chronicle / narrative log UI, extracted from domain-app.js (T5 chip 8, 2026-06-23) — pure code-motion: a
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
  // #551 Wave Entity-B Chronicle Entry — freeform GM narrative attached to entities (2026-05-31)
  chronicleState: { title: '', body: '', attached: [], pickerKind: '', pickerId: '', notes: '', cadence: 'monthly-turn', editingEventId: null, returnToSubView: null },

  // ─── #551 Wave Entity-B Chronicle methods (2026-05-31) ───
  chronicleEntityKinds(){
    return (window.ACKS && window.ACKS.chronicleableEntityKinds && window.ACKS.chronicleableEntityKinds()) || [];
  },
  chronicleEntityOptions(kind){
    if(!kind || !window.ACKS || !window.ACKS.listEntities) return [];
    return window.ACKS.listEntities(this.currentCampaign, kind);
  },
  chronicleEntityLabel(kind, id){
    if(!kind || !id || !window.ACKS || !window.ACKS.entityDisplayName) return id || '';
    return window.ACKS.entityDisplayName(this.currentCampaign, kind, id);
  },
  chronicleAddAttached(){
    const s = this.chronicleState;
    if(!s.pickerKind || !s.pickerId) return;
    const exists = s.attached.some(a => a.kind === s.pickerKind && a.id === s.pickerId);
    if(!exists) s.attached.push({kind: s.pickerKind, id: s.pickerId});
    s.pickerKind = ''; s.pickerId = '';
  },
  chronicleRemoveAttached(idx){
    this.chronicleState.attached.splice(idx, 1);
  },
  chronicleCanSubmit(){
    const s = this.chronicleState;
    return Boolean((s.title || '').trim()) && Boolean((s.body || '').trim());
  },
  chronicleSubmitDisabledReason(){
    const s = this.chronicleState;
    if(!(s.title || '').trim()) return 'Title is required';
    if(!(s.body || '').trim()) return 'Body is required';
    return '';
  },
  chronicleSubmitSummary(){
    const s = this.chronicleState;
    const n = s.attached.length;
    const isEditing = Boolean(s.editingEventId);
    if(!this.chronicleCanSubmit()) return 'Fill title + body to submit. (' + n + ' attached)';
    const verb = isEditing ? 'Update' : 'Will record';
    return verb + ' "' + (s.title || '').trim().slice(0, 40) + '" attached to ' + n + ' entit' + (n === 1 ? 'y' : 'ies') + '.';
  },
  chronicleReset(){
    // Snapshot return target BEFORE clearing it, then navigate if it was set.
    const returnTo = this.chronicleState.returnToSubView;
    this.chronicleState.title = '';
    this.chronicleState.body = '';
    this.chronicleState.attached = [];
    this.chronicleState.pickerKind = '';
    this.chronicleState.pickerId = '';
    this.chronicleState.notes = '';
    this.chronicleState.cadence = 'monthly-turn';
    this.chronicleState.editingEventId = null;
    this.chronicleState.returnToSubView = null;
    if(returnTo && returnTo !== 'chronicle'){ this.reviewSubView = returnTo; }
  },
  chronicleEditExisting(eventId){
    // Open the Chronicle sub-tab pre-populated with the event's current values for editing.
    const entry = (this.currentCampaign && this.currentCampaign.eventLog || []).find(e => (e && e.event && e.event.id) === eventId);
    if(!entry || !entry.event){ this.showToast && this.showToast('Could not find chronicle entry to edit', 4000); return; }
    const ev = entry.event;
    if(ev.kind !== 'gm-narrative'){ this.showToast && this.showToast('Only chronicle entries can be edited here', 4000); return; }
    const payload = ev.payload || {};
    // Hydrate from context envelope into attached list
    const attached = [];
    const rel = (ev.context && ev.context.relatedEntities) || [];
    for(const r of rel){ if(r && r.kind && r.id) attached.push({kind: r.kind, id: r.id}); }
    this.chronicleState.title = payload.title || '';
    this.chronicleState.body = payload.body || '';
    this.chronicleState.notes = payload.notes || ev.gmNotes || '';
    this.chronicleState.cadence = ev.cadence || 'monthly-turn';
    this.chronicleState.attached = attached;
    this.chronicleState.pickerKind = '';
    this.chronicleState.pickerId = '';
    this.chronicleState.editingEventId = eventId;
    // Remember where the GM came from so Cancel + Save can return them there. (Edit is
    // launched from the Event Log row, so that's the natural return target.)
    this.chronicleState.returnToSubView = (this.reviewSubView && this.reviewSubView !== 'chronicle') ? this.reviewSubView : 'event-log';
    this.reviewSubView = 'chronicle';
  },
  chronicleSubmit(){
    if(!this.chronicleCanSubmit()) return;
    const A = window.ACKS;
    if(!A || !A.newEvent){ alert('Engine not loaded'); return; }
    const s = this.chronicleState;
    const isEditing = Boolean(s.editingEventId);
    const currentTurn = (this.currentCampaign && this.currentCampaign.currentTurn) || 1;

    // Build (or reuse) the event
    let ev;
    if(isEditing){
      // Find the existing entry and reuse its event object so id/createdAt are preserved
      const existing = (this.currentCampaign.eventLog || []).find(e => (e && e.event && e.event.id) === s.editingEventId);
      if(!existing){
        this.showToast && this.showToast('Chronicle entry not found — perhaps it was deleted. Submit will create a new one.', 4500);
      }
      ev = existing ? existing.event : A.newEvent('gm-narrative', { submittedBy: 'gm', targetTurn: currentTurn });
      ev.payload = {
        title: s.title.trim(),
        body: s.body.trim(),
        notes: (s.notes || '').trim() || undefined
      };
      ev.gmNotes = (s.notes || '').trim();
      ev.cadence = s.cadence || 'monthly-turn';
      ev.lastEditedAtTurn = currentTurn;
    } else {
      ev = A.newEvent('gm-narrative', {
        submittedBy: 'gm',
        targetTurn: currentTurn,
        cadence: s.cadence || 'monthly-turn',
        payload: {
          title: s.title.trim(),
          body: s.body.trim(),
          notes: (s.notes || '').trim() || undefined
        },
        gmNotes: (s.notes || '').trim()
      });
    }
    // Build context envelope from attached entities
    let primaryHexId = null, settlementId = null, domainId = null;
    const involvedHexIds = new Set();
    const relatedEntities = [];
    for(const att of s.attached){
      relatedEntities.push({kind: att.kind, id: att.id, role: 'subject'});
      if(att.kind === 'hex'){
        if(!primaryHexId) primaryHexId = att.id;
        involvedHexIds.add(att.id);
      } else if(att.kind === 'settlement' && !settlementId){
        settlementId = att.id;
        const st = A.findEntity && A.findEntity(this.currentCampaign, 'settlement', att.id);
        if(st && st.hexId){ if(!primaryHexId) primaryHexId = st.hexId; involvedHexIds.add(st.hexId); }
      } else if(att.kind === 'domain' && !domainId){
        domainId = att.id;
      } else if(att.kind === 'character'){
        const ch = A.findEntity && A.findEntity(this.currentCampaign, 'character', att.id);
        if(ch && ch.currentHexId && !primaryHexId){ primaryHexId = ch.currentHexId; involvedHexIds.add(ch.currentHexId); }
        if(ch && ch.currentDomainId && !domainId) domainId = ch.currentDomainId;
      }
    }
    if(A.setEventContext){
      A.setEventContext(ev, { primaryHexId, involvedHexIds: Array.from(involvedHexIds), settlementId, domainId, relatedEntities });
    }
    ev.status = (A.EVENT_STATUS && A.EVENT_STATUS.APPLIED) || 'applied';
    ev.appliedAtTurn = (this.currentCampaign && this.currentCampaign.currentTurn) || 1;
    try {
      const result = A.applyEvent(this.currentCampaign, ev);
      ev.result = result.result;
    } catch(err){
      console.error('Chronicle submit failed', err);
      this.showToast && this.showToast('Chronicle submit failed: ' + err.message, 5000);
      return;
    }
    if(!Array.isArray(this.currentCampaign.eventLog)) this.currentCampaign.eventLog = [];
    if(isEditing){
      // Replace existing entry in-place to preserve log order
      const idx = this.currentCampaign.eventLog.findIndex(e => (e && e.event && e.event.id) === s.editingEventId);
      if(idx >= 0){
        this.currentCampaign.eventLog[idx] = {
          event: ev,
          result: ev.result,
          appliedAtTurn: this.currentCampaign.eventLog[idx].appliedAtTurn || currentTurn,
          appliedAt: this.currentCampaign.eventLog[idx].appliedAt || new Date().toISOString(),
          lastEditedAt: new Date().toISOString()
        };
        this.showToast && this.showToast('Chronicle entry updated: ' + s.title.trim().slice(0, 40), 3500);
      } else {
        // Existing wasn't found — fall through to append
        this.currentCampaign.eventLog.push({
          event: ev, result: ev.result,
          appliedAtTurn: currentTurn, appliedAt: new Date().toISOString()
        });
        this.showToast && this.showToast('Chronicle entry added (could not find original to update): ' + s.title.trim().slice(0, 40), 4500);
      }
    } else {
      this.currentCampaign.eventLog.push({
        event: ev, result: ev.result,
        appliedAtTurn: currentTurn, appliedAt: new Date().toISOString()
      });
      this.showToast && this.showToast('Chronicle entry added: ' + s.title.trim().slice(0, 40), 3500);
    }
    this.chronicleReset();
  },
  // A small icon for a chronicle row, by event kind (best-effort flavour; '•' fallback). The
  // kinds here are the high-volume emergent streams a GM most wants to skim by shape.
  _chronicleIcon(kind){
    const k = kind || '';
    if(/^journey-/.test(k))            return '⛺';
    if(/encounter/.test(k))            return '⚔';
    if(/incursion/.test(k))            return '🏰';
    if(/banditry/.test(k))             return '🏴';
    if(/battle|siege|warfare|army/.test(k)) return '🎌';
    if(/wealth|treasury|market|item-transfer|trade/.test(k)) return '💰';
    if(/survival|mortal|wound|aging|death/.test(k)) return '🩸';
    if(/rumor/.test(k))                return '📣';
    if(/loyalty|calamity|recruit|hireling/.test(k)) return '🤝';
    if(/religion|divine|congregation/.test(k)) return '⛪';
    if(/construction|construct/.test(k)) return '🏗';
    if(/level-up|xp|domain-advanced/.test(k)) return '📈';
    if(/gm-fiat/.test(k))              return '✏';
    if(/gm-narrative|note/.test(k))    return '📝';
    return '•';
  },

  // ── Merged entity chronicle (C1, audit 2026-06-24) ───────────────────────────────────
  // df-lens C1: the rich detail panels (lair / battle / siege / army / notable-item) showed ONLY
  // the entity's hand-pushed `.history[]` (or, for battles, nothing narrative — just the combat
  // turn log), while the DERIVED eventLog chronicle (every event tagged with this entity in its
  // context envelope) stayed invisible. This unions the two into one newest-first stream so a
  // panel reads the whole life of the thing.
  //   derivedKind   — the _CHRONICLE_ACCESSOR key for the derived stream ('group' for an army,
  //                   'notable-item', 'congregation'); pass '' / null for kinds with no accessor
  //                   (battle / siege / lair → stored-history only).
  //   storedHistory — the entity's on-object `.history[]`. Shapes vary across subsystems
  //                   ({turn|atTurn, type, reason|summary|text|narrative}); normalized here.
  _chronicleRowTurn(row){
    if(row && typeof row._turn === 'number') return row._turn;
    const m = row && row.date && /Turn\s+(\d+)/.exec(row.date);
    return m ? parseInt(m[1], 10) : -1;
  },
  entityChronicleMerged(derivedKind, id, storedHistory){
    const rows = [];
    // 1. derived stream — already formatted {icon,summary,date,kind,hidden}, newest-first.
    if(derivedKind && id){
      try { for(const r of this.entityChronicle(derivedKind, id, 200)) rows.push(r); } catch(e){}
    }
    // 2. stored .history[] — normalize the varied shapes into the shared row shape.
    const stored = Array.isArray(storedHistory) ? storedHistory : [];
    for(const h of stored){
      if(!h) continue;
      const turn = (h.atTurn != null) ? h.atTurn : (h.turn != null ? h.turn : null);
      const summary = h.summary || h.text || h.narrative || h.reason || h.type || '(event)';
      rows.push({
        icon: this._chronicleIcon(h.type || derivedKind || ''),
        summary,
        date: (turn != null ? ('Turn ' + turn + (this.gameDateFromTurn && this.gameDateFromTurn(turn) ? (' · ' + this.gameDateFromTurn(turn)) : '')) : '(date unknown)'),
        kind: h.type || 'history',
        hidden: false,
        _turn: (turn != null ? turn : -1),
      });
    }
    // union → dedup (same turn + same summary) → newest-first by turn (stable sort keeps the
    // derived-before-stored order within a turn).
    const seen = new Set();
    const deduped = [];
    for(const r of rows){
      const key = this._chronicleRowTurn(r) + '|' + (r.summary || '');
      if(seen.has(key)) continue;
      seen.add(key);
      deduped.push(r);
    }
    deduped.sort((a, b) => this._chronicleRowTurn(b) - this._chronicleRowTurn(a));
    return deduped.length > 60 ? deduped.slice(0, 60) : deduped;
  },

  // ── Campaign-wide Annals (C2, audit 2026-06-24) ──────────────────────────────────────
  // df-lens C2 — the DF "Legends" payoff: the whole eventLog rendered newest-first through the
  // same row formatter the per-entity Chronicle uses, with kind-family filter chips and a GM
  // "player-facing only" filter. Read-only over already-computed data; no new engine logic.
  annalsState: { family: 'all', playersOnly: false, limit: 250 },
  // Classify an event kind into one of the chip families (mirrors _chronicleIcon's groupings).
  _chronicleFamily(kind){
    const k = kind || '';
    if(/encounter/.test(k))                       return 'encounters';
    if(/banditry/.test(k))                        return 'banditry';
    if(/battle|siege|warfare|army|incursion|maneuver|war/.test(k)) return 'war';
    if(/religion|divine|congregation/.test(k))    return 'religion';
    if(/survival|mortal|wound|aging|death/.test(k)) return 'life';
    if(/level-up|xp|domain-advanced|advanc/.test(k)) return 'advancement';
    if(/wealth|treasury|market|trade|item-transfer/.test(k)) return 'wealth';
    return 'other';
  },
  // The chip definitions (label + icon + family key). 'all' first; the six spec families + wealth.
  _annalsChipDefs(){
    return [
      { key:'all',         label:'All',          icon:'📖' },
      { key:'encounters',  label:'Encounters',   icon:'⚔' },
      { key:'banditry',    label:'Banditry',     icon:'🏴' },
      { key:'war',         label:'War',          icon:'🎌' },
      { key:'religion',    label:'Religion',     icon:'⛪' },
      { key:'life',        label:'Life & Death', icon:'🩸' },
      { key:'advancement', label:'Advancement',  icon:'📈' },
      { key:'wealth',      label:'Wealth',       icon:'💰' },
    ];
  },
  // One pass over the log → per-family counts (respecting the player-facing-only toggle, NOT the
  // active family filter, so each chip shows how many it would surface).
  annalsFamilyCounts(){
    const c = this.currentCampaign;
    const counts = { all:0, encounters:0, banditry:0, war:0, religion:0, life:0, advancement:0, wealth:0, other:0 };
    if(!c || !Array.isArray(c.eventLog)) return counts;
    const playersOnly = !!this.annalsState.playersOnly;
    for(const e of c.eventLog){
      const ev = (e && e.event) || e;
      if(!ev) continue;
      if(playersOnly && e.campaignLogHidden) continue;
      counts.all++;
      const f = this._chronicleFamily(ev.kind || '');
      counts[f] = (counts[f] || 0) + 1;
    }
    return counts;
  },
  annalsChips(){
    const counts = this.annalsFamilyCounts();
    return this._annalsChipDefs().map(d => Object.assign({}, d, { count: counts[d.key] || 0 }));
  },
  // The rendered rows: newest-first, filtered by family + playersOnly, capped at annalsState.limit.
  // Same {icon,summary,date,kind,hidden} shape + same formatter logic as entityChronicle (core).
  annalsRows(){
    const c = this.currentCampaign;
    if(!c || !Array.isArray(c.eventLog)) return [];
    const fam = this.annalsState.family || 'all';
    const playersOnly = !!this.annalsState.playersOnly;
    const cap = this.annalsState.limit || 250;
    const rows = [];
    for(let i = c.eventLog.length - 1; i >= 0; i--){
      const e = c.eventLog[i];
      const ev = (e && e.event) || e;
      if(!ev) continue;
      const hidden = !!e.campaignLogHidden;
      if(playersOnly && hidden) continue;
      const kind = ev.kind || '';
      if(fam !== 'all' && this._chronicleFamily(kind) !== fam) continue;
      const summary = (e.result && e.result.narrativeSummary)
        || (ev.payload && ev.payload.narrativeSummary)
        || (ev.payload && ev.payload.narrative)
        || (ev.payload && ev.payload.title)
        || (kind + (ev.status && ev.status !== 'applied' ? (' [' + ev.status + ']') : ''));
      const turn = (e.appliedAtTurn != null) ? e.appliedAtTurn : (ev.appliedAtTurn || ev.targetTurn || null);
      rows.push({
        icon: this._chronicleIcon(kind),
        summary,
        date: (ev.gameTimeAt ? this._travelEventDate(ev) : (turn != null ? ('Turn ' + turn + (this.gameDateFromTurn(turn) ? (' · ' + this.gameDateFromTurn(turn)) : '')) : '(date unknown)')),
        kind,
        hidden,
      });
      if(rows.length >= cap) break;
    }
    return rows;
  },
  // Total matching the active filter (for the "showing latest N of M" line) — derived from the
  // family-counts pass, so no extra full scan.
  annalsMatchTotal(){
    const counts = this.annalsFamilyCounts();
    return counts[this.annalsState.family] || 0;
  },

  // ── Lore known by a character (C4, audit 2026-06-24) ─────────────────────────────────
  // df-lens C4 / gm-westmarches 4.8 — the knowledge layer (acks-engine-knowledge.js) passes 35 KB
  // of tests with zero UI. This is the minimal "what does this person know" list for the character
  // sheet, over ACKS.loreKnownBy (first-hand witnessed events ∪ second-hand rumours/told records).
  characterLoreKnown(c){
    if(!c || !c.id || !this.currentCampaign) return [];
    const A = window.ACKS;
    if(!A || typeof A.loreKnownBy !== 'function') return [];
    let rows;
    try { rows = A.loreKnownBy(this.currentCampaign, 'character', c.id) || []; }
    catch(e){ return []; }
    return rows.map(r => {
      const text = r.firstHand
        ? (r.text || r.kind || 'something witnessed')
        : (r.believedText || (r.lore && (r.lore.text || r.lore.summary || r.lore.title)) || r.loreId || 'a rumour');
      return {
        firstHand: !!r.firstHand,
        certainty: r.certainty || (r.firstHand ? 'certain' : 'believed'),
        text,
        source: r.firstHand ? null : (r.source || null),
        turn: r.firstHand ? (r.learnedAtTurn != null ? r.learnedAtTurn : null) : null,
      };
    });
  },
  });
})();
