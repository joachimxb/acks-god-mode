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
  });
})();
