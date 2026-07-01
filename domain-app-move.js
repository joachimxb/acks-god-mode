/* =============================================================================
 * domain-app-move.js — ACKS God Mode app mixin · Movement 2.0 Lane A (Team Session 1)
 * =============================================================================
 *
 * Surfaces the Foundation Move verb (acks-engine-movement.js) as PURE UI — no engine
 * logic lives here. It reads the shared primitive and renders three affordances:
 *
 *   • a HEX-BUDGET CHIP  — miles-remaining-today shown as hexes (RR p.272, ÷6), greys at 0;
 *   • MOVE BUTTONS       — on the hex card, the map, and the selected-actor action box, each
 *                          calling ACKS.moveActorOneHex; disabled-with-a-reason when the step
 *                          is illegal (water without a vessel) or the budget is spent;
 *   • MOVE-AWAY-LEAVES-PARTY — moving a party MEMBER out alone routes through the SHIPPED
 *                          party-leave path (this.removeCharacterFromParty), so they detach (D1);
 *   • JOIN GRANTS NO EXTRA MOVEMENT — a party's effective remaining = min over members, which
 *                          ACKS.moverDayBudget already returns (usedMiles = the most-spent member).
 *
 * The Move glyph is the H1 sprite symbol #i-move (defined in the main sprite in index.html —
 * the only always-in-DOM home for a <use> referenced from all three template-gated zones).
 * All colour is via :root tokens / token-backed utility classes (H1 — palette.smoke.js scans
 * this file). Registers a members object on window.__ACKS_APP_MIXINS__; domainApp() merges it
 * into the component (descriptor-preserving). Members use this.* / window.ACKS.* only.
 * ============================================================================= */
(function(){
  'use strict';
  var M = (window.__ACKS_APP_MIXINS__ = window.__ACKS_APP_MIXINS__ || []);
  M.push({

  // A map-local mover pick (a party/character id). Transient; falls back to the selected
  // character's natural mover so the map, the roster box, and the hex card share one active mover.
  mvMapMoverRef: null,

  // ── mover resolution ─────────────────────────────────────────────────────────
  // The character currently selected in Roster ▸ Characters (the app's selection anchor).
  mvSelectedCharacter(){
    const id = this.selectedCharacterId;
    return id ? ((this.currentCampaign && this.currentCampaign.characters || []).find(c => c && c.id === id) || null) : null;
  },
  // The natural mover a character travels with: its (active) party if in one, else itself.
  mvMoverForCharacter(ch){
    if(!ch) return null;
    const pt = ch.partyId ? ((this.currentCampaign && this.currentCampaign.parties || []).find(p => p && p.id === ch.partyId && p.status !== 'disbanded') || null) : null;
    return pt ? { ref: pt.id, kind: 'party', name: pt.name || 'party', entity: pt }
              : { ref: ch.id, kind: 'character', name: ch.name || 'character', entity: ch };
  },
  _mvMoverExists(ref){
    const c = this.currentCampaign; if(!c || !ref) return false;
    return !!((c.parties || []).find(p => p && p.id === ref) || (c.characters || []).find(x => x && x.id === ref));
  },
  // The active mover for the map + hex card: a map-local pick wins, else the selected character's mover.
  mvActiveMoverRef(){
    if(this.mvMapMoverRef && this._mvMoverExists(this.mvMapMoverRef)) return this.mvMapMoverRef;
    const m = this.mvMoverForCharacter(this.mvSelectedCharacter());
    return m ? m.ref : null;
  },
  mvMoverName(ref){
    const c = this.currentCampaign; if(!c || !ref) return '—';
    const p = (c.parties || []).find(x => x && x.id === ref); if(p) return p.name || 'party';
    const ch = (c.characters || []).find(x => x && x.id === ref); return ch ? (ch.name || 'character') : '—';
  },
  // Movers with a position on the map, for the map picker: active parties + lone placed characters
  // (a party member rides its party, so it isn't listed separately).
  mvOnMapMovers(){
    const c = this.currentCampaign; if(!c) return [];
    const A = window.ACKS; const out = [];
    for(const p of (c.parties || [])){
      if(!p || p.status === 'disbanded') continue;
      const m = (A && A.resolveMover) ? A.resolveMover(c, p.id) : null;
      if(m && m.currentHexId) out.push({ ref: p.id, label: (p.name || 'party') + ' (party)' });
    }
    for(const ch of (c.characters || [])){
      if(!ch || ch.partyId) continue;
      if(ch.currentHexId) out.push({ ref: ch.id, label: (ch.name || 'character') });
    }
    return out;
  },

  // ── the hex-budget chip (miles → hexes, RR p.272) ─────────────────────────────
  mvBudgetChip(moverRef){
    const A = window.ACKS, c = this.currentCampaign;
    if(!c || !moverRef || !A || typeof A.moverDayBudget !== 'function') return null;
    const m = (typeof A.resolveMover === 'function') ? A.resolveMover(c, moverRef) : null;
    const onMap = !!(m && m.currentHexId);
    const b = A.moverDayBudget(c, moverRef);
    const isFirst = (b.usedMiles || 0) <= 1e-9;   // the RAW first-step floor: a fresh day always grants ≥1 hex
    const hexes = b.hexesRemaining || 0;
    let text, tone;
    if(!onMap){ text = 'not on the map'; tone = 'muted'; }
    else if(hexes > 0){ text = hexes + ' hex' + (hexes === 1 ? '' : 'es') + ' left today'; tone = 'green'; }
    else if(isFirst){ text = 'first step only today'; tone = 'amber'; }
    else { text = 'no movement left today'; tone = 'red'; }
    return {
      onMap, hexes, isFirst, tone, text,
      remainingMiles: Math.round((b.remainingMiles || 0) * 10) / 10,
      capMiles: Math.round((b.capMiles || 0) * 10) / 10,
      pace: b.pace || 'normal',
      title: onMap ? (Math.round((b.remainingMiles || 0) * 10) / 10 + ' of ' + (Math.round((b.capMiles || 0) * 10) / 10) + ' mi left today · ' + (b.pace || 'normal') + ' pace (RR p.272, one hex = 6 mi)')
                   : 'This mover has no position on the map yet.'
    };
  },
  // H1: a token-backed colour class for the chip (never a raw colour family).
  mvChipClass(chip){
    if(!chip) return 'text-muted';
    return ({ green: 'accent-green', amber: 'accent-amber', red: 'accent-red', muted: 'text-muted' })[chip.tone] || 'text-muted';
  },

  // ── adjacent Move targets (the one helper all three zones share) ──────────────
  // For each authored neighbour hex of the mover's position: the per-hex cost, and whether the
  // step is legal (water gate + budget, mirroring _moveStep's own checks incl. the first-step floor).
  mvAdjacentTargets(moverRef){
    const A = window.ACKS, c = this.currentCampaign;
    if(!c || !moverRef || !A || typeof A.resolveMover !== 'function') return [];
    const m = A.resolveMover(c, moverRef);
    if(!m || !m.currentHexId || typeof A.hexNeighbors !== 'function') return [];
    const nbrs = A.hexNeighbors(c, m.currentHexId) || [];
    const b = A.moverDayBudget(c, moverRef);
    const isFirst = (b.usedMiles || 0) <= 1e-9;
    const out = [];
    for(const n of nbrs){
      const hex = n && n.hex; if(!hex) continue;
      const entry = (typeof A.hexOppositeEdge === 'function' && n.side != null) ? A.hexOppositeEdge(n.side) : null;
      const cost = (typeof A.moverPerHexCost === 'function') ? A.moverPerHexCost(c, moverRef, hex.id, entry) : (b.perHexCostHere || 6);
      const water = hex.terrain === 'water' && !(m.journey && m.journey.shipId);
      const affordable = isFirst || ((b.remainingMiles || 0) + 1e-9 >= cost);
      let disabled = false, reason = '';
      if(water){ disabled = true; reason = 'That hex is water — a vessel is needed (coming with Voyages).'; }
      else if(!affordable){ disabled = true; reason = 'No movement left today.'; }
      out.push({
        hexId: hex.id, terrain: hex.terrain || '—', cost: Math.round(cost * 10) / 10, disabled, reason,
        label: (typeof this.hexLabelFor === 'function') ? this.hexLabelFor(hex) : (hex.name || hex.id)
      });
    }
    return out;
  },
  // Is the OPEN hex-card hex a legal Move target for the active mover?
  //   → { state: 'none' | 'here' | 'move' | 'far', ref?, target?, chip? }
  mvHexCardMove(hex){
    const A = window.ACKS, c = this.currentCampaign;
    if(!hex || !A) return { state: 'none' };
    const ref = this.mvActiveMoverRef();
    if(!ref) return { state: 'none' };
    const m = (typeof A.resolveMover === 'function') ? A.resolveMover(c, ref) : null;
    if(!m) return { state: 'none' };
    const chip = this.mvBudgetChip(ref);
    if(m.currentHexId === hex.id) return { state: 'here', ref, chip };
    const t = this.mvAdjacentTargets(ref).find(x => x.hexId === hex.id);
    if(t) return { state: 'move', ref, target: t, chip };
    return { state: 'far', ref };
  },

  // ── the Move actions (the only writers — each just calls the Foundation verb) ──
  // Move the given mover (party or lone character) one hex. Group move: a party carries its members.
  mvMoveTo(moverRef, destHexId, opts){
    const A = window.ACKS, c = this.currentCampaign; opts = opts || {};
    if(!A || typeof A.moveActorOneHex !== 'function') return { ok: false, reason: 'no-engine' };
    const res = A.moveActorOneHex(c, moverRef, destHexId, opts);
    if(!res.ok){ if(this.showToast) this.showToast(this._mvReasonText(res.reason)); return res; }
    if(this.markDirty) this.markDirty();
    if(this.schedulePersist) this.schedulePersist();
    let msg = opts._leftPartyName
      ? ((opts._moverName || 'The character') + ' left ' + opts._leftPartyName + ' and moved one hex.')
      : (this.mvMoverName(moverRef) + ' moved one hex.');
    if(res.encounterId) msg += ' Encounter — see Events ▸ Encounters.';
    else if(res.result && res.result.endDay) msg += ' Forded a river — the day ends here.';
    if(this.showToast) this.showToast(msg);
    return res;
  },
  mvMoveGroup(moverRef, destHexId, opts){ return this.mvMoveTo(moverRef, destHexId, opts || {}); },
  // Move a party MEMBER out on their own: leave the party first (D1 — the SHIPPED leave path,
  // never redefined here), then step the character solo. Their travel-day budget carries over.
  mvMoveAlone(ch, destHexId, opts){
    if(!ch) return { ok: false, reason: 'no-mover' };
    const A = window.ACKS, c = this.currentCampaign;
    const pt = (typeof this.characterPartyOf === 'function') ? this.characterPartyOf(ch) : null;
    if(pt){
      // the leaver stands at the party's hex — sync its position before it splits off, so the solo
      // move starts from the right hex even if the character's own currentHexId was stale/unset.
      const pm = (typeof A.resolveMover === 'function') ? A.resolveMover(c, pt.id) : null;
      if(pm && pm.currentHexId) ch.currentHexId = pm.currentHexId;
      this.removeCharacterFromParty(ch);   // ← the shipped party-leave path (reconciles membership + leader)
    }
    return this.mvMoveTo(ch.id, destHexId, Object.assign({}, opts, {
      _leftPartyName: pt ? (pt.name || 'the party') : null, _moverName: ch.name || 'The character'
    }));
  },
  _mvReasonText(reason){
    return ({
      water: 'That hex is water — a vessel is needed (coming with Voyages).',
      budget: 'No movement left today.',
      'not-adjacent': "That hex isn't adjacent.",
      fording: "The ford failed — the party couldn't cross the river.",
      'no-mover': 'No mover selected.',
      'no-dest': 'No destination hex.',
      'no-engine': 'The movement engine is unavailable.'
    })[reason] || ('Move blocked (' + reason + ').');
  }

  });
})();
